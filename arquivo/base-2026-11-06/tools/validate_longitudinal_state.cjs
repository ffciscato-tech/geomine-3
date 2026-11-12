// Focused controller/engine integration; no browser, source edits or user data.
// Usage: node tools/validate_longitudinal_state.cjs
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const stage = path.resolve(__dirname, '..');
const controllerFile = path.join(stage, 'src/core/parts/25-geoprocessing-tin.js');
const engineFile = path.join(stage, 'src/modules/topography/longitudinal-comparison.js');
const source = fs.readFileSync(controllerFile, 'utf8');
function block(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'Controller extraction anchors: ' + start);
  return source.slice(a, b);
}
const controller = [
  block('function profNome(', 'const PROF_CORES'),
  block('function profSelectedRasters(', 'function profRenderVectorSources('),
  block('function profInvalidateResult(', 'function profUpdateSourceMode('),
  block('async function runProfile(', 'function bindProfPanel('),
].join('\n');
const clean = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const nodes = Object.fromEntries([
    ['prRasterSel', ''], ['prVectorSel', ''], ['prSourceMode', 'raster'],
    ['prNativo', ''], ['prStep', '1'], ['prVE', '1'], ['prMethod', 'near'],
    ['prName', 'A'], ['prOut', ''], ['prBtns', ''], ['profChart', ''], ['prStyleBox', ''],
  ].map(([id, value]) => [id, { value, style: {}, innerHTML: '', textContent: '' }]));
  nodes.prNativo.checked = true;
  const calls = { toasts: [], charts: [], engine: [], native: [], refresh: 0 };
  // Detect variadic reductions even on JS engines whose argument limit happens
  // to exceed the fixture's station count. Small source-count min/max is fine.
  const checkedMath = Object.create(Math);
  for (const name of ['min', 'max']) checkedMath[name] = (...values) => {
    assert.ok(values.length <= 32, name + ' must not spread station arrays');
    return Math[name](...values);
  };
  const c = {
    console, Math: checkedMath, window: {},
    S: { workCRS: 'EPSG:31982', layers: [], rasters: [], prof: {
      buf: [[0.5, 0.5], [0.5, 2.5]], hist: [], result: null,
      sourceRasterIds: [], sourceLineIds: [], sourceMode: 'raster',
    } },
    document: { getElementById: id => nodes[id] || null },
    fromWGS: (_crs, x, y) => [x, y], reproj: (_from, _to, x, y) => [x, y],
    toast: text => calls.toasts.push(text),
    esc: text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
    fmtLen: length => length + ' m',
    drawProfChart: (profile, ve) => { calls.charts.push(profile); return ve; },
    profAtualizaEditorEstilos: () => {}, refreshBishopPanel: () => {}, setTool: () => {},
    drawLayer: () => {}, refreshUI: () => { calls.refresh++; },
    addLayer: layer => { layer.id = 'saved-' + c.S.layers.length; c.S.layers.push(layer); return layer; },
    gridBruto: async raster => { calls.native.push(raster.id); return raster.d; },
  };
  vm.createContext(c);
  vm.runInContext(controller, c, { filename: controllerFile });
  vm.runInContext(fs.readFileSync(engineFile, 'utf8'), c, { filename: engineFile });
  const engine = c.window.GeoMineLongitudinalComparison;
  c.window.GeoMineLongitudinalComparison = { sample: options => {
    calls.engine.push(options); return engine.sample(options);
  } };
  return { c, nodes, calls };
}
function grid(z = [10, -9999, 30]) {
  return { nc: 3, nr: 1, cs: 1, csy: 1, xll: 0, yll: 0, z: new Float32Array(z), crs: 'EPSG:31982' };
}
function rasterFixture(extra = {}) {
  const f = fixture(), raster = { id: 'terrain', name: 'Terreno', d: grid(), ...extra };
  f.c.S.rasters.push(raster); f.c.S.prof.sourceRasterIds.push(raster.id);
  return { ...f, raster };
}
function assertNoCommit(f) {
  assert.equal(f.calls.engine.length, 0, 'stale data must not reach the engine');
  assert.equal(f.calls.charts.length, 0, 'stale chart must not be drawn');
  assert.equal(f.c.S.layers.length, 0, 'stale axis must not be saved');
  assert.equal(f.c.S.prof.result, null, 'stale result must not be committed');
}
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
}
(async () => {
  await test('three long series retain summaries and save extrema without spreading station arrays', async () => {
    const f = fixture(), count = 60001, dist = Array.from({ length: count }, (_, i) => i);
    f.nodes.prSourceMode.value = 'vector'; f.c.S.prof.sourceMode = 'vector';
    f.c.S.prof.buf = [[0, 0], [0, count - 1]];
    const series = [0, 1, 2].map(k => ({ name: 'Comparação ' + k, sourceKey: 'L:' + k,
      method: 'native-vector', z: dist.map(i => i % 997 === 0 ? NaN : i / 100 + k * 1000) }));
    series[0].z[1] = -123.456;
    series[2].z[count - 1] = 9876.543;
    f.c.S.layers = series.map((item, i) => ({ id: String(i), name: item.name, gtype: 'line',
      crs: 'EPSG:31982', features: [{ geom: [[0, 0, 1], [count - 1, 0, 2]], props: {} }] }));
    f.c.S.prof.sourceLineIds = ['0', '1', '2'];
    // Fixture supplies already sampled native lines; production controller,
    // station-union engine, summary and automatic layer-saving remain real.
    f.c.sampleProfileLines = () => ({ dist, total: count - 1, series });
    await f.c.runProfile();
    const profile = f.c.S.prof.result;
    assert.ok(profile); assert.equal(profile.series.length, 3);
    assert.ok(profile.series.every(s => s.z.length >= count));
    assert.equal(f.calls.charts.length, 1);
    for (let i = 0; i < 3; i++) assert.ok(f.nodes.prOut.innerHTML.includes('Comparação ' + i + ': z <b>'));
    assert.ok(f.nodes.prOut.innerHTML.includes('-123.5'));
    assert.ok(f.nodes.prOut.innerHTML.includes('9876.5'));
    const saved = f.c.S.layers.find(layer => layer.name === 'Perfil A-a');
    assert.ok(saved); assert.equal(saved.features[0].props.Z_MIN, -123.46);
    assert.equal(saved.features[0].props.Z_MAX, 9876.54);
    assert.deepEqual(clean(saved.features[0].geom), [[0, 0], [60000, 0]]);
    // Updating the existing alignment must also follow the streaming extrema path.
    assert.equal(f.c.profSalvaLinha(profile, profile.vertices), saved);
    assert.equal(f.c.S.layers.filter(layer => layer.name === 'Perfil A-a').length, 1);
    assert.equal(series[0].z[1], -123.456, 'native input must remain unchanged');
    assert.ok(Number.isNaN(series[1].z[0]));
  });
  await test('alignment with no finite cotas stores null extrema, not zero or infinities', () => {
    const f = fixture();
    const saved = f.c.profSalvaLinha({ nome: 'B', total: 2, series: [{ z: [NaN, Infinity, -Infinity] }] }, [[0, 0], [2, 0]]);
    assert.equal(saved.features[0].props.Z_MIN, null); assert.equal(saved.features[0].props.Z_MAX, null);
  });
  for (const name of ['noData', 'nodata', '_nd']) {
    for (const metadataOn of ['raster', 'working grid']) {
      await test(name + ' on ' + metadataOn + ' reaches engine after native-grid replacement', async () => {
        const f = rasterFixture();
        (metadataOn === 'raster' ? f.raster : f.raster.d)[name] = -9999;
        const original = new Float32Array(f.raster.d.z), native = grid();
        f.c.gridBruto = async () => native;
        await f.c.runProfile();
        assert.equal(f.calls.engine.length, 1);
        assert.equal(f.calls.engine[0].rasters[0].d, native);
        assert.equal(f.calls.engine[0].rasters[0][name], -9999);
        const result = f.c.S.prof.result;
        assert.deepEqual(clean(result.dist), [0, 1, 2]);
        assert.equal(result.series[0].z[0], 10);
        assert.ok(Number.isNaN(result.series[0].z[1]), 'NoData must remain a gap');
        assert.equal(result.series[0].z[2], 30);
        assert.equal(f.c.S.layers[0].features[0].props.Z_MIN, 10);
        assert.equal(f.c.S.layers[0].features[0].props.Z_MAX, 30);
        assert.deepEqual(f.raster.d.z, original);
        assert.equal(native.z[1], -9999, 'sampling must not rewrite the source');
      });
    }
  }
  await test('replacing S.prof during asynchronous native read cancels stale result', async () => {
    const f = rasterFixture({ noData: -9999 }); let resolve;
    f.c.gridBruto = () => new Promise(done => { resolve = done; });
    const pending = f.c.runProfile();
    assert.equal(typeof resolve, 'function');
    const replacement = { buf: [], hist: [], result: null, revision: f.c.S.prof.revision, marker: 'new project' };
    f.c.S.prof = replacement; resolve(f.raster.d); await pending;
    assert.equal(f.c.S.prof, replacement); assertNoCommit(f);
    assert.ok(f.calls.toasts.some(t => t.includes('projeto alterados')));
  });
  await test('changing revision during asynchronous native read cancels stale selection', async () => {
    const f = rasterFixture({ noData: -9999 }); let resolve;
    f.c.gridBruto = () => new Promise(done => { resolve = done; });
    const state = f.c.S.prof, pending = f.c.runProfile(), revision = state.revision;
    f.c.profInvalidateResult();
    assert.equal(state.revision, revision + 1);
    resolve(f.raster.d); await pending;
    assert.equal(f.c.S.prof, state); assertNoCommit(f);
    assert.ok(f.calls.toasts.some(t => t.includes('Fontes ou projeto alterados')));
  });
  await test('unchanged state after deferred native read produces and saves the profile', async () => {
    const f = rasterFixture({ noData: -9999 }); let resolve;
    f.c.gridBruto = () => new Promise(done => { resolve = done; });
    const pending = f.c.runProfile(); resolve(f.raster.d); await pending;
    assert.ok(f.c.S.prof.result); assert.equal(f.calls.engine.length, 1);
    assert.equal(f.calls.charts.length, 1); assert.equal(f.c.S.layers.length, 1);
  });
  await test('native-read rejection reports failure and does not save a partial profile', async () => {
    const f = rasterFixture();
    f.c.gridBruto = async () => { throw new Error('fixture I/O failure'); };
    await f.c.runProfile(); assertNoCommit(f);
    assert.ok(f.calls.toasts.some(t => t.includes('fixture I/O failure')));
  });
  console.log('\nLongitudinal state robustness: ' + passed + ' passed, ' + failed + ' failed.');
  process.exitCode = failed ? 1 : 0;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
