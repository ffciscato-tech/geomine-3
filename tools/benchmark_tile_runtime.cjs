#!/usr/bin/env node
'use strict';

/* Optional, read-only performance check against a real local TIFF. It reads
   small byte ranges, never materializes the entire file, and does not change it.
   Usage: node tools/benchmark_tile_runtime.cjs <tiff> <runtime.js> [width] [height] [parallel]
   This is a benchmark, not a timing-sensitive CI assertion. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');

const root = path.resolve(__dirname, '..');
const filename = process.argv[2];
const runtimeFile = process.argv[3];
const requestedWidth = Math.max(1, Math.min(2048, Number(process.argv[4]) || 256));
const requestedHeight = Math.max(1, Math.min(512, Number(process.argv[5]) || 128));
const parallel = Math.max(1, Math.min(4, Number(process.argv[6]) || 4));
if (!filename || !runtimeFile) {
  console.error('Usage: node tools/benchmark_tile_runtime.cjs <local.tif> <tile-runtime.js> [width] [height] [parallel]');
  process.exit(2);
}

// The vendored browser build captures Worker at load time. No actual worker is
// used: this benchmark deliberately measures the range/cache path in Node.
global.Worker = class UnusedWorker {
  constructor() { throw new Error('This benchmark does not support browser workers'); }
};
const GeoTIFF = require(path.join(root, 'src/vendor/geotiff.min.js'));

function checksum(rasters) {
  const hash = crypto.createHash('sha256');
  for (const band of rasters) {
    hash.update(Buffer.from(band.buffer, band.byteOffset, band.byteLength));
  }
  return hash.digest('hex');
}

async function openRangeSource() {
  const handle = await fs.promises.open(filename, 'r');
  const stat = await handle.stat();
  const metrics = { fetches: 0, compressedBytes: 0, decodedBlocks: 0 };
  const source = {
    fileSize: stat.size,
    async fetch(slices) {
      return Promise.all(slices.map(async ({ offset, length }) => {
        metrics.fetches++;
        metrics.compressedBytes += length;
        const buffer = Buffer.alloc(length);
        let read = 0;
        while (read < length) {
          const result = await handle.read(buffer, read, length - read, offset + read);
          if (!result.bytesRead) throw new Error('Unexpected EOF while reading a TIFF range');
          read += result.bytesRead;
        }
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + length);
      }));
    },
    close: () => handle.close()
  };
  try {
    const tiff = await GeoTIFF.GeoTIFF.fromSource(source);
    const image = await tiff.getImage(0);
    const decoder = await GeoTIFF.getDecoder(image.fileDirectory);
    const pool = {
      async decode(directory, data) {
        metrics.decodedBlocks++;
        return decoder.decode(directory, data);
      }
    };
    metrics.fetches = 0;
    metrics.compressedBytes = 0;
    return { tiff, image, source, metrics, pool, size: stat.size };
  } catch (err) {
    await handle.close();
    throw err;
  }
}

function loadRuntime() {
  const scope = {
    console, setTimeout, clearTimeout, performance,
    navigator: { hardwareConcurrency: 4, deviceMemory: 8 },
    GeoTIFF, AbortController, DOMException,
    ArrayBuffer, Uint8Array, Float32Array, Map, WeakMap, Set,
    requestAnimationFrame: callback => setTimeout(() => callback(performance.now()), 0),
    cancelAnimationFrame: clearTimeout
  };
  scope.window = scope;
  scope.globalThis = scope;
  vm.createContext(scope);
  vm.runInContext(fs.readFileSync(runtimeFile, 'utf8'), scope, { filename: runtimeFile });
  const runtime = scope.GeoMineTileRuntime;
  assert.ok(runtime && typeof runtime.read === 'function', 'GeoMineTileRuntime.read is available');
  return runtime;
}

async function run(label, runtime) {
  const state = await openRangeSource();
  const { image, metrics, pool } = state;
  try {
    const width = image.getWidth(), height = image.getHeight();
    const tileWidth = Math.min(requestedWidth, Math.floor(width / 8));
    const tileHeight = Math.min(requestedHeight, Math.floor(height / 4));
    assert.ok(tileWidth > 0 && tileHeight > 0, 'TIFF must contain a nonempty image');
    const x0 = Math.min(width - tileWidth * 4, Math.floor(width * 0.45));
    const y0 = Math.min(height - tileHeight, Math.floor(height * 0.5));
    const samples = Array.from({ length: Math.min(4, image.getSamplesPerPixel()) }, (_, i) => i);
    if (runtime) runtime.prepareImage(image);
    const results = [];
    const passes = [];
    const start = performance.now();
    // Four horizontal neighbors reuse the same strips in striped TIFFs.
    // Revisit the same tiles twice to cover pan-away/pan-back use.
    for (let pass = 0; pass < 3; pass++) {
      const passStart = performance.now();
      const oneWindow = column => {
        const x = x0 + column * tileWidth;
        const options = {
          samples, window: [x, y0, x + tileWidth, y0 + tileHeight],
          width: tileWidth, height: tileHeight, resampleMethod: 'bilinear', pool
        };
        return runtime
          ? runtime.read(image, options, { isCurrent: () => true, priority: 0 })
          : image.readRasters(options);
      };
      for (let first = 0; first < 4; first += parallel) {
        const promises = Array.from({ length: Math.min(parallel, 4 - first) }, (_, n) => oneWindow(first + n));
        for (const rasters of await Promise.all(promises)) results.push(checksum(rasters));
      }
      passes.push(Math.round(performance.now() - passStart));
    }
    return {
      label, totalMs: Math.round(performance.now() - start), passMs: passes,
      ...metrics, checksums: results,
      metadata: { width, height, samples: samples.length, fileBytes: state.size,
        isTiled: image.isTiled, blockWidth: image.getTileWidth(), blockHeight: image.getTileHeight(),
        windowWidth: tileWidth, windowHeight: tileHeight, parallel },
      runtime: runtime && typeof runtime.stats === 'function' ? runtime.stats() : null
    };
  } finally {
    await state.source.close();
  }
}

(async () => {
  const baseline = await run('before / no decoded cache', null);
  const runtime = loadRuntime();
  const cached = await run('after / bounded runtime', runtime);
  assert.deepEqual(cached.checksums, baseline.checksums, 'pixels are identical before and after caching');
  const summary = result => {
    const { checksums, ...rest } = result;
    return { ...rest, checksumFirstWindow: checksums[0] };
  };
  console.log(JSON.stringify({
    baseline: summary(baseline), cached: summary(cached), identicalPixels: true,
    speedup: Number((baseline.totalMs / Math.max(1, cached.totalMs)).toFixed(2)),
    note: 'Local range-only benchmark; timings are machine- and filesystem-dependent.'
  }, null, 2));
})().catch(err => { console.error(err); process.exitCode = 1; });
