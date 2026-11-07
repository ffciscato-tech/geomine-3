'use strict';
// Source-level regression checks; only synthetic grids/files, no browser storage.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const packageParts=path.resolve(__dirname,'../src/core/parts');
const parts=fs.existsSync(packageParts)?packageParts:path.resolve(__dirname,'../updated/src/core/parts');
const core11=fs.readFileSync(path.join(parts,'11-geotiff-project-workspace.js'),'utf8');
const core19=fs.readFileSync(path.join(parts,'19-hydrology-and-flooding.js'),'utf8');
function section(text,start,end){
 const a=text.indexOf(start),b=text.indexOf(end,a+start.length);
 assert(a>=0&&b>a,'source section: '+start);return text.slice(a,b);
}
const source=[
 section(core11,'function projectNativeHash(','let PROJECT_NATIVE_SEQUENCE=0;'),
 section(core11,'function projectNativeRestoreAllowed(','function projectNativeRestoreNotice('),
 section(core11,'const projectRasterRestores=new WeakMap();','async function projectRestoreNativeRasters('),
 section(core19,'const EH_MOVEL =','/* Perfil manual de desempenho.'),
 section(core19,'function rasterImportCheck(','function rasterImportRows('),
 section(core19,'function assinaturaMDT(','async function lembraFonte('),
 section(core19,'function mesmaArea(','/* O GeoTIFF pode JÁ estar aberto'),
 section(core19,'async function religaFonte(','/* ---------------------------------------------------------------------------\n   pedeFonte')
].join('\n');
function gate(){let enter,release;const started=new Promise(r=>enter=r),promise=new Promise(r=>release=r);return {started,release,async wait(){enter();await promise;}};}
function original(bytes=[1,2,3,4,5,6,7,8]){
 const file=new Blob([Uint8Array.from(bytes)]);
 Object.defineProperties(file,{name:{value:'MDT.tif'},lastModified:{value:1234}});return file;
}
function grid(){return {nc:2,nr:2,cs:1,csy:2,xll:500000,yll:6900000,
 z:new Float32Array([100,101,102,103]),fromProject:true,resampled:4,srcCRS:'EPSG:31982',srcDims:[4,8]};}
function fixture(){
 const calls={opens:0,parse:0,reads:0,close:0,release:0,render:0,refresh:0,validated:0,toasts:[],warnings:[]},gates={};
 const state={generation:1},S={projectId:'A',workCRS:'EPSG:31982',layers:[{id:1}],rasters:[],hidro:{dem:null}};
 const file=original(),r={id:7,name:'Terrain',d:grid(),src:{file:file.name},demHD:false,dispFull:false};S.rasters.push(r);
 const image={getBoundingBox:()=>[500000,6900000,500002,6900004],getWidth:()=>4,getHeight:()=>8,
  getSamplesPerPixel:()=>1,getGDALNoData:()=>-9999,async readRasters(){calls.reads++;return [new Float32Array([100,101,102,103])];}};
 const tiff={async getImage(){if(gates.header)await gates.header.wait();if(f.headerError)throw f.headerError;return image;},async close(){calls.close++;}};
 const c={Blob,Float32Array,Uint8Array,DataView,AbortController,console:{warn:(...args)=>calls.warnings.push(args)},S,
  navigator:{userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',platform:'MacIntel',maxTouchPoints:5},
  matchMedia:()=>({matches:true}),GeoMineSessionAutosave:{state},GeoMineCloudProvider:{user:{uid:'alice'}},
  GeoMineOriginalSources:{validated(){calls.validated++;},adopt(){return true;},async resolve(){return null;}},
  GeoMineRasterImport:{async open(){calls.opens++;if(gates.open)await gates.open.wait();return tiff;},release(){calls.release++;}},
  GeoMineRasterSource:{wait(promise,options={}){
   const signal=options.signal;if(!signal)return Promise.resolve(promise);
   return new Promise((resolve,reject)=>{
    const abort=()=>reject(Object.assign(new Error('cancelled'),{name:'AbortError'}));
    if(signal.aborted){Promise.resolve(promise).catch(()=>{});abort();return;}
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
   });
  }},
  ensureGeoTIFF:async()=>{},renderRaster(){calls.render++;if(f.renderError)throw f.renderError;},refreshUI(){calls.refresh++;},
  toast:message=>calls.toasts.push(message),layoutInvalidateOrtho(){},hShadeOff(){if(f.shadeError)throw f.shadeError;},hInvalidaD8(){},
  projectDirs:async()=>null
 };
 const f={c,S,state,file,r,image,tiff,calls,gates};c.window=c;vm.createContext(c);vm.runInContext(source,c);
 r.d._sig=c.assinaturaMDT(r.d);
 c.parseTIFF=async(selected,control)=>{
  calls.parse++;assert.equal(selected,file);assert.equal(control.tiff,tiff);
  if(gates.parse)await gates.parse.wait();c.rasterImportCheck(control);
  const d=f.parsed||grid();await image.readRasters();
  return {...d,z:new Float32Array(d.z),_tiff:tiff,_img0:image,_W0:4,_H0:8,_bb:image.getBoundingBox(),_nd:-9999};
 };
 f.identify=async(kind='original')=>{
  const d={v:1,size:file.size,fingerprint:await c.projectNativeFingerprint(file),preview:c.projectNativePreview(r,'raster')};
  if(kind==='original')r.originalSource={...d,id:'source-1',kind:'raster',name:file.name};
  else{r.projectNativeSource=d;r.projectFile='ALAGIS/rasters/MDT.tif';r.projectSavePending=false;}
  return kind==='original'?r.originalSource:r.projectNativeSource;
 };
 return f;
}
function snapshot(f){return {d:f.r.d,z:f.r.d.z,original:f.r.originalSource,native:f.r.projectNativeSource,
 raw:f.r._projectSourceRaw,layers:f.S.layers,rasters:f.S.rasters,demHD:f.r.demHD,dispFull:f.r.dispFull};}
function unchanged(f,before){
 assert.equal(f.r.d,before.d);assert.equal(f.r.d.z,before.z);assert.equal(f.r.originalSource,before.original);
 assert.equal(f.r.projectNativeSource,before.native);assert.equal(f.r._projectSourceRaw,before.raw);
 assert.equal(f.S.layers,before.layers);assert.equal(f.S.rasters,before.rasters);
 assert.equal(f.r.demHD,before.demHD);assert.equal(f.r.dispFull,before.dispFull);assert.equal(f.calls.render,0);
}

test('iPad Macintosh + touch uses mobile budgets even when pointer:fine matches',()=>{
 const f=fixture();assert.equal(vm.runInContext('EH_MOVEL',f.c),true);
});

test('confirmed original and native-copy Files attach headers once, retain preview/CRS/csy, and do not decode',async()=>{
 for(const kind of ['original','native']){
  const f=fixture();await f.identify(kind);const before=snapshot(f),wm={cached:true};
  Object.defineProperty(f.r.d,'_wm',{value:wm,writable:true,configurable:true});
  Object.defineProperty(f.r.d,'_wmCRS',{value:'EPSG:31982',writable:true,configurable:true});
  assert.equal(await f.c.religaFonte(f.r,f.file),true);
  assert.equal(f.calls.parse,0);assert.equal(f.calls.reads,0);assert.equal(f.calls.opens,1);assert.equal(f.calls.close,0);
  assert.equal(f.calls.release,1);assert.equal(f.calls.render,1);assert.equal(f.r.d.z,before.z);assert.equal(f.r.d._wm,wm);
  assert.equal(f.r.d.csy,2);assert.equal(f.r.d.cs,1);assert.equal(f.r.d.srcCRS,'EPSG:31982');
  assert.deepEqual(Array.from(f.r.d._bb),[500000,6900000,500002,6900004]);assert.equal(f.r.d._W0,4);assert.equal(f.r.d._H0,8);
  assert.equal(f.r._projectSourceRaw,f.file);assert.equal(f.c.projectNativeRasterSourceCurrent(f.r),true);
  assert.equal(f.r.demHD,true);assert.equal(f.r.dispFull,true);assert.equal(f.S.layers,before.layers);assert.equal(f.S.rasters,before.rasters);
 }
});

test('known byte mismatch rejects before opening TIFF and preserves all project references',async()=>{
 const f=fixture();await f.identify();const before=snapshot(f);
 assert.equal(await f.c.religaFonte(f.r,original([9,8,7,6,5,4,3,2])),false);unchanged(f,before);
 assert.equal(f.calls.opens,0);assert.equal(f.calls.parse,0);
});

test('edited or invalidated source identities cannot fall back to an old elevation signature',async()=>{
 for(const kind of ['original','native'])for(const edit of ['cells','invalidated']){
  const f=fixture(),descriptor=await f.identify(kind);
  if(edit==='cells')f.r.d.z[0]=999;else descriptor.invalidated=true;
  const before=snapshot(f);
  assert.equal(await f.c.religaFonte(f.r,f.file),false);unchanged(f,before);
  assert.equal(f.calls.opens,0);assert.equal(f.calls.parse,0);assert.equal(f.calls.close,0);
 }
 const f=fixture();await f.identify();f.r.originalSource.invalidated=true;await f.identify('native');
 const preview=f.r.d.z;
 assert.equal(await f.c.religaFonte(f.r,f.file),true,'a valid native-copy identity remains usable');
 assert.equal(f.r.d.z,preview);assert.equal(f.calls.parse,0);assert.equal(f.calls.reads,0);
});

test('cancellation, generation, project, source-identity, cell and caller changes discard prepared headers',async()=>{
 const changes=[
  f=>f.state.generation++,f=>f.S.projectId='B',f=>f.c.GeoMineCloudProvider.user.uid='bob',
  f=>f.r.originalSource={...f.r.originalSource},f=>f.r.originalSource.fingerprint='changed',
  f=>f.r.originalSource.size++,f=>f.r.d.z[0]=999,f=>f.S.workCRS='EPSG:31983',
  f=>f.controller.abort(),f=>f.current=false
 ];
 for(const change of changes){
  const f=fixture();await f.identify();f.controller=new AbortController();f.current=true;f.gates.header=gate();
  const before=snapshot(f),pending=f.c.religaFonte(f.r,f.file,{signal:f.controller.signal,isCurrent:()=>f.current});
  await f.gates.header.started;unchanged(f,before);change(f);f.gates.header.release();
  assert.equal(await pending,false);assert.equal(f.r.d,before.d);assert.equal(f.r._projectSourceRaw,before.raw);
  assert.equal(f.r.demHD,false);assert.equal(f.r.dispFull,false);assert.equal(f.calls.close,1);assert.equal(f.calls.release,0);assert.equal(f.calls.render,0);
 }
});

test('a changed descriptor during fingerprint verification cannot open or commit the original',async()=>{
 const f=fixture();await f.identify('native');const before=snapshot(f),latch=gate(),fingerprint=f.c.projectNativeFingerprint;
 f.c.projectNativeFingerprint=async file=>{await latch.wait();return fingerprint(file);};
 const pending=f.c.religaFonte(f.r,f.file);await latch.started;f.r.projectNativeSource.fingerprint='revised';latch.release();
 assert.equal(await pending,false);unchanged(f,before);assert.equal(f.calls.opens,0);
});

test('invalid headers and read errors close only the temporary source',async()=>{
 for(const broken of [f=>f.image.getSamplesPerPixel=()=>3,f=>f.image.getBoundingBox=()=>[0,0,0,0],f=>f.headerError=Error('provider failed')]){
  const f=fixture();await f.identify();const before=snapshot(f);let oldClosed=0;f.r.d._tiff={close(){oldClosed++;}};broken(f);
  await assert.rejects(f.c.religaFonte(f.r,f.file));unchanged(f,before);assert.equal(f.calls.close,1);assert.equal(oldClosed,0);
 }
});

test('legacy content and non-square extent validation still rejects wrong files without changing state',async()=>{
 for(const wrong of ['content','extent']){
  const f=fixture(),before=snapshot(f);f.parsed=grid();
  if(wrong==='content')f.parsed.z.fill(900);else f.parsed.csy=5;
  assert.equal(await f.c.religaFonte(f.r,f.file),false);unchanged(f,before);assert.equal(f.calls.parse,1);assert.equal(f.calls.close,1);
 }
});

test('legacy success and no-signature compatibility commit native flags before a single render',async()=>{
 for(const noSignature of [false,true]){
  const f=fixture();if(noSignature){delete f.r.d._sig;f.parsed=grid();f.parsed.z.fill(200);}
  assert.equal(await f.c.religaFonte(f.r,f.file),true);assert.equal(f.calls.parse,1);assert.equal(f.calls.opens,1);
  assert.equal(f.calls.close,0);assert.equal(f.calls.release,1);assert.equal(f.calls.render,1);
  assert.equal(f.r.demHD,true);assert.equal(f.r.dispFull,true);assert.equal(f.r.projectSavePending,true);
  assert.equal(f.r._projectSourceRaw,f.file);assert.equal(f.calls.validated,1);
 }
});

test('cancelled legacy parsing closes the owned TIFF and does not replace saved data',async()=>{
 const f=fixture(),controller=new AbortController(),before=snapshot(f);f.gates.parse=gate();
 const pending=f.c.religaFonte(f.r,f.file,{signal:controller.signal});await f.gates.parse.started;controller.abort();f.gates.parse.release();
 assert.equal(await pending,false);unchanged(f,before);assert.equal(f.calls.close,1);assert.equal(f.calls.render,0);
});

test('automatic raw-source restoration shares header-only attachment and rejects unavailable source without changing flags',async()=>{
 const f=fixture(),z=f.r.d.z;f.c.projectNativeBindRasterSource(f.r,f.file);
 assert.equal(await f.c.projectRestoreNativeRaster(f.r),true);assert.equal(f.r.d.z,z);
 assert.equal(f.calls.parse,0);assert.equal(f.calls.reads,0);assert.equal(f.calls.render,1);
 const missing=fixture(),before=snapshot(missing);
 assert.equal(await missing.c.projectRestoreNativeRaster(missing.r),false);unchanged(missing,before);
});

test('visual hook failures after a committed attachment keep the source open and report success',async()=>{
 for(const legacy of [false,true]){
  const f=fixture();if(!legacy)await f.identify();f.S.hidro.dem=f.r.d;f.shadeError=Error('visual hook failed');
  assert.equal(await f.c.religaFonte(f.r,f.file),true);assert.equal(f.S.hidro.dem,f.r.d);
  assert.equal(f.r.demHD,true);assert.equal(f.r.dispFull,true);assert.equal(f.calls.close,0);assert.equal(f.calls.release,1);
 }
});
