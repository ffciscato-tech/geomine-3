// Native-source resolver regression. Real binding/fingerprint helpers, in-memory
// files and TIFF doubles; no user project, Drive file, full DEM or preview decode.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),workspace=fs.readFileSync(path.join(root,'src/core/parts/11-geotiff-project-workspace.js'),'utf8');
const helperStart=workspace.indexOf('function projectNativeHash('),helperEnd=workspace.indexOf('async function projectAutoSaveShape(',helperStart);
assert.ok(helperStart>=0&&helperEnd>helperStart);
const modulePath=path.join(root,'src/modules/environmental/channel-native-source.js');
const tests=[],test=(name,run)=>tests.push({name,run}),tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const deferred=()=>{let resolve,reject;return {promise:new Promise((a,b)=>{resolve=a;reject=b;}),resolve,reject};};
const file=(byte=31,name='native-mdt.tif')=>Object.assign(new Blob([new Uint8Array(200000).fill(byte)],{type:'image/tiff'}),{name,lastModified:1700000000000});
function makeImage(overrides={}){return {fileDirectory:{SamplesPerPixel:1},getWidth:()=>20,getHeight:()=>20,getBoundingBox:()=>[500000,7400000,500010,7400010],getGeoKeys:()=>({ProjectedCSTypeGeoKey:31983}),getSamplesPerPixel:()=>1,getResolution:()=>[.5,-.5,0],readRasters(){throw Error('Full/native raster decode is forbidden in source resolution');},...overrides};}
function makeTIFF(image=makeImage()){
  const state={closed:0,closeAttempts:0,images:[]},close=()=>{state.closeAttempts++;if(!state.closed)state.closed=1;};
  return {state,image,tiff:{getImage:async index=>{state.images.push(index??0);return image;},getImageCount:async()=>1,close,source:{close}}};
}
function context(){
  const calls={open:[],dirs:[],getFile:[],progress:[],forbidden:[]},owned=[];
  const c={console,Blob,ArrayBuffer,DataView,Float32Array,Uint8Array,AbortController,TextEncoder,setTimeout,clearTimeout,
    S:{projectId:'native-test',rasters:[],workCRS:'EPSG:31983'},GeoMineSessionAutosave:{state:{generation:1}},calls,
    projectDirs:async ask=>{calls.dirs.push(ask);return null;},
    GeoMineRasterImport:{open:async(raw,control)=>{calls.open.push({raw,control});const resource=makeTIFF();owned.push(resource);return resource.tiff;}}
  };c.window=c;c.globalThis=c;vm.createContext(c);vm.runInContext(workspace.slice(helperStart,helperEnd),c);
  for(const name of ['demFull','parseTIFF','projectRestoreNativeRasters','rasterGradeOriginalCanvas'])c[name]=()=>{calls.forbidden.push(name);throw Error('Forbidden fallback '+name);};
  vm.runInContext(fs.readFileSync(modulePath,'utf8'),c);
  const r={id:42,name:'MDT preview',crs:'EPSG:31983',d:{nc:2,nr:2,cs:5,csy:5,xll:500000,yll:7400000,z:new Float32Array([100,101,102,103]),resampled:10,fromProject:true,srcCRS:'EPSG:31983',srcDims:[20,20],_W0:20,_H0:20,_bb:[500000,7400000,500010,7400010]}};
  c.S.rasters.push(r);return {c,r,calls,owned,resolve:options=>c.GeoMineChannelNativeSource.resolve(r,{onProgress:value=>calls.progress.push(value),...options})};
}
function bound(f,raw=file()){f.c.projectNativeBindRasterSource(f.r,raw);return raw;}
async function inWorkspace(f,raw=file()){
  f.r.projectFile='ALAGIS/rasters/native-mdt.tif';f.r.projectNativeSource={v:1,size:raw.size,lastModified:raw.lastModified,fingerprint:await f.c.projectNativeFingerprint(raw),preview:f.c.projectNativePreview(f.r,'raster')};
  f.c.projectDirs=async ask=>{f.calls.dirs.push(ask);assert.equal(ask,false,'resolver must never request folder permission');return {rasters:{getFileHandle:async(name,options)=>{f.calls.getFile.push({name,options});assert.equal(name,'native-mdt.tif');assert.ok(!options?.create,'resolver cannot create missing files');return {getFile:async()=>raw};}}};};return raw;
}
function unchanged(f,snapshot){assert.equal(JSON.stringify(f.r),snapshot,'resolver must not replace preview, metadata or binding');assert.deepEqual(f.calls.forbidden,[]);}
test('retained shared TIFF opens image zero and is never closed by the consumer',async()=>{
  const f=context(),shared=makeTIFF();f.r.d._tiff=shared.tiff;const before=JSON.stringify(f.r),lease=await f.resolve();assert.ok(lease);assert.equal(lease.image,shared.image);assert.equal(lease.sourceCRS,'EPSG:31983');assert.equal(lease.isCurrent(),true);assert.deepEqual(shared.state.images,[0]);assert.equal(f.calls.open.length,0);lease.close();lease.close();assert.equal(shared.state.closed,0);unchanged(f,before);
});
test('retained TIFF with invalidated binding is not used',async()=>{
  const f=context(),shared=makeTIFF();f.r.d._tiff=shared.tiff;bound(f);f.r.d.z[2]+=1;assert.equal(await f.resolve(),null);assert.equal(shared.state.images.length,0);assert.equal(shared.state.closed,0);assert.equal(f.calls.open.length,0);
});
test('failed shared TIFF can fall through to a valid bound Blob without closing shared resource',async()=>{
  const f=context(),shared=makeTIFF();shared.tiff.getImage=async()=>{throw Object.assign(Error('shared read failed'),{name:'NotReadableError'});};f.r.d._tiff=shared.tiff;bound(f);const lease=await f.resolve();assert.ok(lease);assert.equal(lease.image,f.owned[0].image);lease.close();assert.equal(shared.state.closed,0);assert.equal(f.owned[0].state.closed,1);
});
test('valid bound Blob uses owned TIFF without mutating preview and closes idempotently',async()=>{
  const f=context(),raw=bound(f),before=JSON.stringify(f.r),lease=await f.resolve();assert.ok(lease);assert.equal(f.calls.open.length,1);assert.equal(f.calls.open[0].raw,raw);assert.ok(f.calls.open[0].control.signal);assert.ok(f.calls.open[0].control.timeoutMs>0);assert.equal(lease.image,f.owned[0].image);unchanged(f,before);lease.close();lease.close();assert.equal(f.owned[0].state.closed,1);assert.equal(lease.isCurrent(),false);
});
test('raw Blob without valid binding or changed preview cannot masquerade as source',async()=>{
  let f=context();f.r._projectSourceRaw=file();assert.equal(await f.resolve(),null);assert.equal(f.calls.open.length,0);
  f=context();bound(f);f.r.d.z[0]++;assert.equal(await f.resolve(),null);assert.equal(f.calls.open.length,0);
});
test('workspace source verifies descriptor, full preview hash and file fingerprint',async()=>{
  const f=context(),raw=await inWorkspace(f),before=JSON.stringify(f.r),lease=await f.resolve();assert.ok(lease);assert.deepEqual(f.calls.dirs,[false]);assert.equal(f.calls.open[0].raw,raw);assert.equal(f.calls.getFile.length,1);unchanged(f,before);lease.close();assert.equal(f.owned[0].state.closed,1);
});
test('same-size same-mtime wrong workspace bytes are rejected before TIFF open',async()=>{
  const f=context();await inWorkspace(f,file(31));const wrong=file(32);f.c.projectDirs=async()=>({rasters:{getFileHandle:async()=>({getFile:async()=>wrong})}});assert.equal(await f.resolve(),null);assert.equal(f.calls.open.length,0);
});
test('workspace preview revision, absent descriptor and pending save are rejected',async()=>{
  for(const modify of [f=>{f.r.d.z[1]++;},f=>{delete f.r.projectNativeSource;},f=>{f.r.projectSavePending=true;}]){const f=context();await inWorkspace(f);modify(f);assert.equal(await f.resolve(),null);assert.equal(f.calls.open.length,0);}
});
test('invalid native path cannot escape the project raster folder',async()=>{
  for(const value of ['../native-mdt.tif','ALAGIS/rasters/../native-mdt.tif','ALAGIS/rasters/sub/native-mdt.tif','https://example.test/native.tif']){const f=context();await inWorkspace(f);f.r.projectFile=value;assert.equal(await f.resolve(),null);assert.equal(f.calls.open.length,0);assert.equal(f.calls.getFile.length,0);}
});
test('genuinely missing source returns null without DEM/preview fallback',async()=>{
  const f=context(),before=JSON.stringify(f.r);assert.equal(await f.resolve(),null);unchanged(f,before);assert.equal(f.calls.open.length,0);
  await inWorkspace(f);f.c.projectDirs=async()=>null;assert.equal(await f.resolve(),null);assert.deepEqual(f.calls.forbidden,[]);
});
test('missing workspace file or unavailable permission returns null without requesting access',async()=>{
  for(const name of ['NotFoundError','NotAllowedError']){const f=context();await inWorkspace(f);f.c.projectDirs=async ask=>{assert.equal(ask,false);return {rasters:{getFileHandle:async()=>{throw Object.assign(Error(name),{name});}}};};assert.equal(await f.resolve(),null);assert.equal(f.calls.open.length,0);assert.deepEqual(f.calls.forbidden,[]);}
});
test('wrong native dimensions, extent or explicit CRS are rejected and owned TIFF closed',async()=>{
  for(const overrides of [{getWidth:()=>19},{getBoundingBox:()=>[500001,7400000,500011,7400010]},{getGeoKeys:()=>({ProjectedCSTypeGeoKey:31982})},{getGeoKeys:()=>({})}]){
    const f=context();bound(f);const resource=makeTIFF(makeImage(overrides));f.c.GeoMineRasterImport.open=async()=>resource.tiff;assert.equal(await f.resolve(),null);assert.equal(resource.state.closed,1);
  }
});
test('source CRS cannot be inferred from the project working CRS',async()=>{
  const f=context();bound(f);delete f.r.crs;delete f.r.d.srcCRS;const resource=makeTIFF(makeImage({getGeoKeys:()=>({})}));f.c.GeoMineRasterImport.open=async()=>resource.tiff;assert.equal(await f.resolve(),null);assert.equal(resource.state.closed,1);
});
test('pre-cancelled and stale jobs fail before any source read',async()=>{
  for(const options of [(()=>{const c=new AbortController();c.abort();return {signal:c.signal};})(),{isCurrent:()=>false}]){const f=context();bound(f);await assert.rejects(()=>f.resolve(options),{name:'AbortError'});assert.equal(f.calls.open.length,0);}
});
test('abort during TIFF open rejects promptly and closes a late owned result',async()=>{
  const f=context(),gate=deferred(),resource=makeTIFF(),controller=new AbortController();bound(f);let started=false;f.c.GeoMineRasterImport.open=async()=>{started=true;return gate.promise;};const job=f.resolve({signal:controller.signal});await tick();assert.equal(started,true);controller.abort();await assert.rejects(()=>job,{name:'AbortError'});gate.resolve(resource.tiff);await tick();assert.equal(resource.state.closed,1);
});
test('stale context after native header read closes owned resource without mutation',async()=>{
  const f=context(),gate=deferred(),resource=makeTIFF();bound(f);let current=true;resource.tiff.getImage=()=>gate.promise;f.c.GeoMineRasterImport.open=async()=>resource.tiff;const before=JSON.stringify(f.r),job=f.resolve({isCurrent:()=>current});await tick();current=false;gate.resolve(resource.image);await assert.rejects(()=>job,{name:'AbortError'});assert.equal(resource.state.closed,1);unchanged(f,before);
});
test('replacement of source/binding/grid during read invalidates the lease',async()=>{
  for(const modify of [f=>{f.r.d={...f.r.d};},f=>{f.r._projectSourceRaw=file(77);},f=>{f.r._projectNativeBinding={...f.r._projectNativeBinding};},f=>{f.r.d.z[0]++;}]){
    const f=context(),gate=deferred(),resource=makeTIFF();bound(f);resource.tiff.getImage=()=>gate.promise;f.c.GeoMineRasterImport.open=async()=>resource.tiff;const job=f.resolve();await tick();modify(f);gate.resolve(resource.image);await assert.rejects(()=>job,{name:'AbortError'});assert.equal(resource.state.closed,1);
  }
});
test('project, generation, removal and declared metadata races reject late results',async()=>{
  for(const modify of [f=>{f.c.S.projectId='other';},f=>{f.c.GeoMineSessionAutosave.state.generation++;},f=>{f.c.S.rasters=[];},f=>{f.r.d._bb[0]++;},f=>{f.r.crs='EPSG:31982';}]){
    const f=context(),gate=deferred(),resource=makeTIFF();bound(f);resource.tiff.getImage=()=>gate.promise;f.c.GeoMineRasterImport.open=async()=>resource.tiff;const job=f.resolve();await tick();modify(f);gate.resolve(resource.image);await assert.rejects(()=>job,{name:'AbortError'});assert.equal(resource.state.closed,1);
  }
});
test('workspace descriptor replacement during getFile never reaches TIFF open',async()=>{
  const f=context(),gate=deferred(),raw=await inWorkspace(f);f.c.projectDirs=async()=>({rasters:{getFileHandle:async()=>({getFile:()=>gate.promise})}});const job=f.resolve();await tick();f.r.projectNativeSource={...f.r.projectNativeSource};gate.resolve(raw);await assert.rejects(()=>job,{name:'AbortError'});assert.equal(f.calls.open.length,0);
});
test('abort while waiting for a shared image never closes the shared TIFF',async()=>{
  const f=context(),gate=deferred(),shared=makeTIFF(),controller=new AbortController();shared.tiff.getImage=()=>gate.promise;f.r.d._tiff=shared.tiff;const job=f.resolve({signal:controller.signal});await tick();controller.abort();await assert.rejects(()=>job,{name:'AbortError'});gate.resolve(shared.image);await tick();assert.equal(shared.state.closed,0);assert.equal(f.calls.open.length,0);
});
test('native timeout remains TimeoutError and closes late owned TIFF',async()=>{
  const f=context(),gate=deferred(),resource=makeTIFF();bound(f);const delays=[];f.c.setTimeout=(fn,delay,...args)=>{delays.push(delay);return setTimeout(fn,Math.min(delay,10),...args);};f.c.GeoMineRasterImport.open=()=>gate.promise;const job=f.resolve();await assert.rejects(()=>job,{name:'TimeoutError'});gate.resolve(resource.tiff);await tick();assert.equal(resource.state.closed,1);assert.ok(delays.some(ms=>ms>0&&ms<=45000));
});
test('returned lease detects later changes but never closes shared TIFF',async()=>{
  const f=context(),shared=makeTIFF();f.r.d._tiff=shared.tiff;const lease=await f.resolve();assert.equal(lease.isCurrent(),true);f.r.d.z[1]++;assert.equal(lease.isCurrent(),false);lease.close();assert.equal(shared.state.closed,0);
});
test('file-provider errors propagate instead of decoding the preview',async()=>{
  const f=context();await inWorkspace(f);f.c.projectDirs=async()=>({rasters:{getFileHandle:async()=>{throw Object.assign(Error('provider unavailable'),{name:'NotReadableError'});}}});await assert.rejects(()=>f.resolve(),{name:'NotReadableError'});assert.equal(f.calls.open.length,0);assert.deepEqual(f.calls.forbidden,[]);
});
test('legacy rasterImportOpen reader remains supported',async()=>{
  const f=context(),resource=makeTIFF();bound(f);delete f.c.GeoMineRasterImport;let opened=0;f.c.rasterImportOpen=async()=>{opened++;return resource.tiff;};const lease=await f.resolve();assert.ok(lease);assert.equal(opened,1);lease.close();assert.equal(resource.state.closed,1);
});
(async()=>{let failed=0;for(const {name,run}of tests){try{await run();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name,error);}}console.log(`${tests.length-failed}/${tests.length} native source tests passed. In-memory sources only.`);if(failed)process.exitCode=1;})().catch(error=>{console.error(error);process.exitCode=1;});
