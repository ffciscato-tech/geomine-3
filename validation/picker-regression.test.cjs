'use strict';

// Focused regression coverage for the real MDT picker function. The VM models
// DOM/native selection and delays only the lower-level TIFF reader, allowing
// cancellation and stale-result behavior to be verified without user files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const sourceRoots = [path.join(__dirname, '../src'), path.join(__dirname, '../updated/src')];
const sourceRoot = sourceRoots.find(root => fs.existsSync(path.join(root, 'core/parts/20-raster-dem.js')));
assert(sourceRoot, 'Expected ./src in the package or ../updated/src in the validation workspace');
const part = name => fs.readFileSync(path.join(sourceRoot, 'core/parts', name), 'utf8');
const rasterSource = part('20-raster-dem.js');
const pickerStart = rasterSource.indexOf('function rasterNeedsStableLocalCopy(');
const pickerEnd = rasterSource.indexOf('function bindRasModal()', pickerStart);
assert(pickerStart >= 0 && pickerEnd > pickerStart, 'Picker extraction markers must exist');
const pickerSource = rasterSource.slice(pickerStart, pickerEnd);
const fileSource = part('03-file-loading-qgis.js');
const cancelStart = fileSource.indexOf('function cancelLoad(){');
const cancelEnd = fileSource.indexOf("document.getElementById('loadCancel')", cancelStart);
assert(cancelStart >= 0 && cancelEnd > cancelStart, 'Real cancelLoad extraction markers must exist');
const cancelSource = fileSource.slice(cancelStart, cancelEnd);

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return {promise, resolve, reject};
}

function environment(options = {}) {
  const readGate = deferred(), readStarted = deferred(), metadataStarted = deferred(), inputOpened = deferred();
  const originalGrid = {z: new Float32Array([12, 13, 14, 15]), nc: 2, nr: 2};
  const raster = {id: 'mdt', d: originalGrid, name: 'MDT de teste', src: {file: 'mdt.tif'}};
  const S = {projectId: 'project-a', rasters: [raster], layers: [{id: 'vector-a'}], _loadCancel: false};
  const file = {name: 'mdt.tif', size: 8192};
  const metrics = {nativePicks: 0, inputPicks: 0, reads: 0, commits: 0, rememberedFiles: 0,
    rememberedHandles: 0, hiddenLoads: 0, renders: 0, toasts: [], inputs: []};
  const handle = {kind: 'file', name: file.name, getFile: async () => {
    if (options.getFileError) throw options.getFileError;
    return file;
  }};
  const window = {
    GeoMineSessionAutosave: {state: {generation: 1}},
    GeoMineCloudProvider: {user: {uid: 'account-a'}},
    GeoMineOriginalSources: {rememberFile: async (_raster, _kind, selected) => {
      assert.equal(metrics.commits, 1, 'Metadata must follow validated commit');
      assert.equal(selected, file);
      metrics.rememberedFiles++;
      metadataStarted.resolve();
      if (options.metadataGate) await options.metadataGate.promise;
      return true;
    }},
    GeoMineProjectOpenProgress: {state: () => ({active: false, committed: false}), cancel() {}}
  };
  if (options.desktop) window.showOpenFilePicker = async () => {
    metrics.nativePicks++;
    if (options.pickerError) throw options.pickerError;
    return [handle];
  };
  const context = {
    AbortController, console, S, window,
    document: {
      body: {appendChild() {}},
      createElement(tag) {
        assert.equal(tag, 'input');
        const input = new EventTarget();
        input.style = {};
        input.remove = () => { input.removed = true; };
        metrics.inputs.push(input);
        return input;
      }
    },
    fsApiOK: () => !!options.desktop,
    projectRasterReady: item => !!item.d?._img0,
    renderRaster() {}, syncDemTiles() {}, zApply() {}, rasResInfo() {}, rasSyncResolutionControls() {},
    abrirSeletorGeoTIFF: () => { metrics.inputPicks++; inputOpened.resolve(); },
    GeoMineImportHandoff: {beforeRead: async ({current}) => current()},
    hideLoad: () => { metrics.hiddenLoads++; },
    toast: message => { metrics.toasts.push(message); },
    lembraLocal() {},
    lembraFonte: async (_raster, selectedHandle) => {
      assert.equal(metrics.commits, 1, 'A handle must be remembered after validation');
      assert.equal(selectedHandle, handle);
      metrics.rememberedHandles++;
    },
    projectNativeContext: item => {
      const grid = item.d, project = S.projectId, generation = window.GeoMineSessionAutosave.state.generation;
      return () => item.d === grid && S.projectId === project &&
        window.GeoMineSessionAutosave.state.generation === generation && S.rasters.includes(item);
    },
    religaFonte: async (item, selected, control) => {
      metrics.reads++;
      metrics.lastSignal = control.signal;
      readStarted.resolve();
      await readGate.promise;
      if (options.readerError) throw options.readerError;
      if (options.rejectFile || !control.isCurrent() || control.signal.aborted) return false;
      assert.equal(selected, file);
      item.d = {...item.d, _img0: {native: true}};
      metrics.commits++;
      metrics.renders++;
      return true;
    }
  };
  vm.createContext(context);
  vm.runInContext(pickerSource + '\n' + cancelSource, context, {filename: 'actual-mdt-picker.js'});
  return {
    context, S, window, file, raster, originalGrid, metrics, readStarted, metadataStarted, inputOpened,
    complete: () => readGate.resolve(),
    start: pickerOptions => context.rasEscolherNativoAgora(raster, pickerOptions),
    async select() {
      const input = metrics.inputs.at(-1);
      assert(input, 'Expected a native file input');
      input.files = [file];
      const changed = input.onchange();
      await readStarted.promise;
      return {input, changed};
    }
  };
}

const timing = {timeout: 2000};

test('input opens in the original click turn and repeat requests share one promise', timing, async () => {
  const e = environment(), opening = e.start();
  assert.equal(e.metrics.inputPicks, 1);
  assert.equal(e.start(), opening);
  assert.equal(e.metrics.inputPicks, 1);
  e.metrics.inputs[0].dispatchEvent(new Event('cancel'));
  assert.equal(await opening, false);
  assert.equal(e.raster.d, e.originalGrid);
  assert.equal(e.metrics.reads, 0);
  assert.equal(e.metrics.rememberedFiles, 0);
  assert(e.metrics.inputs[0].removed);
});

test('duplicate input change reads, commits, and renders only once', timing, async () => {
  const e = environment(), opening = e.start();
  const {input, changed} = await e.select();
  const duplicate = input.onchange();
  e.complete();
  await Promise.all([changed, duplicate]);
  assert.equal(await opening, true);
  assert.equal(e.metrics.reads, 1);
  assert.equal(e.metrics.commits, 1);
  assert.equal(e.metrics.renders, 1);
  assert.equal(e.metrics.rememberedFiles, 1);
  assert.equal(e.raster.d.z, e.originalGrid.z);
  assert.deepEqual(e.S.layers, [{id: 'vector-a'}]);
});

test('real app Cancelar aborts an in-flight read and preserves the project', timing, async () => {
  const e = environment(), opening = e.start();
  const {changed} = await e.select();
  e.context.cancelLoad();
  assert.equal(e.S._loadCancel, true);
  assert.equal(e.metrics.lastSignal.aborted, true);
  assert.equal(await opening, false);
  e.complete();
  await changed;
  assert.equal(e.raster.d, e.originalGrid);
  assert.equal(e.metrics.commits, 0);
  assert.equal(e.metrics.rememberedFiles, 0);
  assert.deepEqual(e.S.layers, [{id: 'vector-a'}]);
});

test('a changed project generation rejects the delayed result', timing, async () => {
  const e = environment(), opening = e.start();
  const {changed} = await e.select();
  e.window.GeoMineSessionAutosave.state.generation++;
  e.complete();
  await changed;
  assert.equal(await opening, false);
  assert.equal(e.raster.d, e.originalGrid);
  assert.equal(e.metrics.commits, 0);
});

test('an external abort rejects the delayed result', timing, async () => {
  const e = environment(), controller = new AbortController(), opening = e.start({signal: controller.signal});
  const {changed} = await e.select();
  controller.abort();
  assert.equal(await opening, false);
  e.complete();
  await changed;
  assert.equal(e.raster.d, e.originalGrid);
  assert.equal(e.metrics.commits, 0);
});

test('closing the owning dialog rejects the delayed result', timing, async () => {
  let current = true;
  const e = environment(), opening = e.start({isCurrent: () => current});
  const {changed} = await e.select();
  current = false;
  e.complete();
  await changed;
  assert.equal(await opening, false);
  assert.equal(e.raster.d, e.originalGrid);
  assert.equal(e.metrics.commits, 0);
});

test('a rejected TIFF leaves the preview and source metadata unchanged', timing, async () => {
  const e = environment({rejectFile: true}), opening = e.start();
  const source = e.raster.src;
  const {changed} = await e.select();
  e.complete();
  await changed;
  assert.equal(await opening, false);
  assert.equal(e.raster.d, e.originalGrid);
  assert.equal(e.raster.src, source);
  assert.equal(e.metrics.rememberedFiles, 0);
});

test('desktop picker SecurityError falls back to one input', timing, async () => {
  const e = environment({desktop: true, pickerError: Object.assign(new Error('API blocked'), {name: 'SecurityError'})});
  const opening = e.start();
  assert.equal(e.metrics.nativePicks, 1, 'Native picker must also start synchronously');
  await e.inputOpened.promise;
  assert.equal(e.metrics.inputPicks, 1);
  const {changed} = await e.select();
  e.complete();
  await changed;
  assert.equal(await opening, true);
  assert.equal(e.metrics.rememberedFiles, 1);
  assert.equal(e.metrics.rememberedHandles, 0);
});

test('desktop picker cancellation does not reopen a file input', timing, async () => {
  const e = environment({desktop: true, pickerError: Object.assign(new Error('cancelled'), {name: 'AbortError'})});
  assert.equal(await e.start(), false);
  assert.equal(e.metrics.inputPicks, 0);
  assert.equal(e.raster.d, e.originalGrid);
});

test('desktop file read failure does not reopen a file input', timing, async () => {
  const e = environment({desktop: true, getFileError: Object.assign(new Error('file unavailable'), {name: 'NotReadableError'})});
  assert.equal(await e.start(), false);
  assert.equal(e.metrics.inputPicks, 0);
  assert.equal(e.metrics.commits, 0);
});

test('desktop handle SecurityError does not masquerade as a blocked picker API', timing, async () => {
  const e = environment({desktop: true, getFileError: Object.assign(new Error('handle denied'), {name: 'SecurityError'})});
  assert.equal(await e.start(), false);
  assert.equal(e.metrics.nativePicks, 1);
  assert.equal(e.metrics.inputPicks, 0);
  assert.equal(e.metrics.commits, 0);
  assert.equal(e.raster.d, e.originalGrid);
});

test('successful desktop selection preserves a real handle', timing, async () => {
  const e = environment({desktop: true}), opening = e.start();
  await e.readStarted.promise;
  e.complete();
  assert.equal(await opening, true);
  assert.equal(e.metrics.rememberedHandles, 1);
  assert.equal(e.metrics.rememberedFiles, 0);
  assert.equal(e.metrics.inputPicks, 0);
});

test('successful commit releases cancellation ownership before metadata persistence', timing, async () => {
  const metadataGate = deferred(), e = environment({metadataGate}), opening = e.start();
  const {changed} = await e.select();
  e.complete();
  await e.metadataStarted.promise;
  assert.equal(e.metrics.commits, 1);
  assert.equal(e.S._rasterImportController, null);
  const hiddenBefore = e.metrics.hiddenLoads;
  const nextImport = new AbortController();
  e.S._rasterImportController = nextImport;
  metadataGate.resolve();
  await changed;
  assert.equal(await opening, true);
  assert.equal(nextImport.signal.aborted, false);
  assert.equal(e.S._rasterImportController, nextImport);
  assert.equal(e.metrics.hiddenLoads, hiddenBefore, 'Finishing metadata must not hide a newer operation');
});
