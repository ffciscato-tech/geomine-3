'use strict';
// Isolated regression tests: real GeoMine functions, in-memory TIFF/canvas/FS doubles.
// No original project or raster is read, replaced or written by this test.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,'src/core/parts',n),'utf8');
const s11=read('11-geotiff-project-workspace.js'),s19=read('19-hydrology-and-flooding.js'),s20=read('20-raster-dem.js'),s26=read('26-project-persistence.js');
const between=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return s.slice(i,j);};
const noop=()=>{},grid=v=>({nc:2,nr:2,cs:5,xll:0,yll:0,z:Float32Array.of(v,v,v,v),native:true});
const sourceFile=(color,name='ortofoto.tif')=>Object.assign(new Blob([Uint8Array.of(color,color,color,color)]),{color,name,lastModified:1000});
const oldFile=sourceFile(10),newFile=sourceFile(200),files=new Map([['ortofoto.tif',oldFile],['mdt.tif',oldFile]]);
let failWrite=false,writeCount=0,deferredRead=null,layoutInvalidations=0,previewFailure=false;
const controls=new Map(),notFound=()=>Object.assign(new Error('not found'),{name:'NotFoundError'});
const ds={rasters:{getFileHandle:async name=>{if(!files.has(name))throw notFound();return {getFile:async()=>files.get(name)};}}};
const c={console:{log:console.log,warn:noop},Blob,ArrayBuffer,Float32Array,Uint8Array,Uint8ClampedArray,Date,Math,
  setTimeout,clearTimeout,TextEncoder,
  S:{projectId:'A',workCRS:'EPSG:31982',rasters:[],layers:[],groups:[],hidro:{},plates:[]},
  EH_MOVEL:false,navigator:{deviceMemory:8},GeoMineSessionAutosave:{state:{generation:1}},
  FULL_MAX_CELLS:1000000,TIFF_CHUNK_SAMPLES:1024,
  document:{getElementById:id=>controls.get(id)||null,createElement:()=>({getContext:()=>({createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)})})})},
  showLoad:noop,hideLoad:noop,toast:noop,cmdLog:noop,refreshUI:noop,renderRaster:noop,projectFolderStatus:noop,
  syncImgPanel:noop,imgResInfoSync:noop,orthoHDReset:noop,syncOrthoTiles:noop,autoAreaSyncAll:noop,
  layoutInvalidateOrtho:()=>layoutInvalidations++,ensureGeoTIFF:async()=>{},bufferFonte:async f=>f,
  rasterImportOpen:async f=>c.GeoTIFF.fromBlob(f),
  map:{removeLayer:noop,hasLayer:()=>true},esc:String,layoutClone:v=>JSON.parse(JSON.stringify(v)),
  gradeParaSalvar:g=>g,assinaturaMDT:()=>'',f32ToB64:a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength).toString('base64'),
  precisaFonte:()=>false,gridParaGeoTIFF:g=>Uint8Array.of(g.z[0],g.z[0],g.z[0],g.z[0]),
  projectSafeName:(name,ext)=>name+ext,projectChooseFolder:async()=>false,projectWriteCatalog:async()=>{},
  projectDirs:async()=>ds,parseTIFF:async f=>grid(new Uint8Array(await f.arrayBuffer())[0]),
  projectWrite:async(dir,name,blob)=>{
    if(failWrite)throw new Error('simulated native write failure');
    const file=Object.assign(new Blob([blob]),{name,lastModified:2000+writeCount++});files.set(name,file);return file;
  },
  GeoTIFF:{fromBlob:async file=>{
    const color=new Uint8Array(await file.arrayBuffer())[0];
    const im={getBoundingBox:()=>[0,0,10,10],getSamplesPerPixel:()=>3,getWidth:()=>2,getHeight:()=>2,getGDALNoData:()=>null,
      getTileWidth:()=>2,getTileHeight:()=>2,fileDirectory:{},readRasters:async()=>{
        if(deferredRead)await deferredRead.promise;
        return [0,1,2].map(()=>Uint8Array.of(color,color,color,color));
      }};
    return {getImage:async()=>im,getImageCount:async()=>1};
  }}
};c.window=c;c.globalThis=c;
c.applyImgNoData=()=>{if(previewFailure)throw new Error('simulated canvas failure');c.S.img.url='preview:'+c.S.img._id.data[0];c.S.img.overlay={};return {pct:0};};
vm.createContext(c);
vm.runInContext(between(s11,'function projectNativeHash(','async function projectAutoSaveShape('),c);
vm.runInContext(fs.readFileSync(path.join(root,'src/modules/persistence/native-source-reuse.js'),'utf8'),c);
vm.runInContext(between(s19,'async function demFull(d)','\n/* ---------------------------------------------------------------------------'),c);
vm.runInContext(between(s20,'async function ortoReligarTIFF(file,options)','\n/* ============================================================================'),c);
vm.runInContext(between(s26,'function projectData()','\n/* ============================================================================'),c);
function ortho(){return {name:'ortofoto',url:'preview:10',overlay:{},b:[0,0,10,10],projectFile:'ALAGIS/rasters/ortofoto.tif',projectSavedAt:'old'};}
function rehydrateOrtho(data){c.d={img:data};c.b=data.b;c.ov={};c.crsOrto=c.S.workCRS;vm.runInContext(between(s26,'    S.img={url:d.img.url','\n    if(S.img.visible===false)'),c);}
async function descriptor(item,kind,file){return {v:1,size:file.size,lastModified:file.lastModified,fingerprint:await c.projectNativeFingerprint(file),preview:c.projectNativePreview(item,kind)};}
function latch(){let release;return {promise:new Promise(r=>release=r),release:()=>release()};}
const nextTick=()=>new Promise(r=>setTimeout(r,0));
(async()=>{
  const results=[];
  c.S.img=ortho();
  assert.equal(await c.ortoReligarTIFF(newFile),true);
  assert.equal(c.S.img.url,'preview:200');assert.equal(c.S.img._sourceRaw,newFile);
  assert.equal(c.S.img.projectFile,undefined);assert.equal(c.S.img.projectSavedAt,undefined);assert.equal(c.S.img.projectSavePending,true);
  assert.equal(layoutInvalidations,1);
  failWrite=true;assert.equal((await c.projectSyncNativeSources(false)).ok,false);
  const failedSaved=JSON.parse(JSON.stringify(c.projectData()));
  assert.equal(failedSaved.img.url,'preview:200');assert.equal(failedSaved.img.projectFile,null);
  assert.equal(failedSaved.img.projectSavePending,true);rehydrateOrtho(failedSaved.img);
  assert.equal((await c.projectRestoreNativeOrtho()).restored,0);assert.equal(c.S.img.url,'preview:200');
  results.push('Relink + native save failure + reopen preserves the new ortho, never restores stale TIFF.');
  failWrite=false;c.S.img=ortho();await c.ortoReligarTIFF(newFile);
  assert.equal((await c.projectSyncNativeSources(false)).ok,true);
  const saved=JSON.parse(JSON.stringify(c.projectData()));
  assert.notEqual(saved.img.projectFile,'ALAGIS/rasters/ortofoto.tif');assert(saved.img.projectNativeSource);
  assert.equal(files.get('ortofoto.tif'),oldFile);
  const before=writeCount;await c.projectAutoSaveOrtho(false);assert.equal(writeCount,before,'Unchanged original is not recopied');
  rehydrateOrtho(saved.img);assert.equal((await c.projectRestoreNativeOrtho()).restored,1);
  assert.equal(c.S.img.url,'preview:200');assert.equal(c.S.img.projectFile,saved.img.projectFile);
  results.push('Verified source round-trips via the actual serializer/load initializer; native names are versioned and unchanged sources reused.');
  c.S.img={...ortho(),url:'preview:200'};
  assert.equal((await c.projectRestoreNativeOrtho()).restored,0);assert.equal(c.S.img.url,'preview:200');
  results.push('Legacy pointer without revision descriptor cannot replace a newer embedded preview.');
  rehydrateOrtho(saved.img);c.S.img.url='preview:222';
  assert.equal((await c.projectRestoreNativeOrtho()).restored,0);assert.equal(c.S.img.url,'preview:222');
  rehydrateOrtho(saved.img);const nativeName=saved.img.projectFile.split('/').pop(),real=files.get(nativeName);
  files.set(nativeName,Object.assign(new Blob([oldFile]),{lastModified:real.lastModified}));
  assert.equal((await c.projectRestoreNativeOrtho()).restored,0);assert.equal(c.S.img.url,'preview:200');files.set(nativeName,real);
  results.push('Changed preview and same-size changed external source are refused without modifying embedded content.');
  c.S.img=ortho();const original=c.S.img;previewFailure=true;
  assert.equal(await c.ortoReligarTIFF(newFile),false);assert.equal(c.S.img,original);assert.equal(c.S.img.projectFile,'ALAGIS/rasters/ortofoto.tif');assert.equal(c.S.img.url,'preview:10');previewFailure=false;
  results.push('Failed relink rolls back the previous image and native reference.');
  c.S.img=ortho();deferredRead=latch();const pending=c.ortoReligarTIFF(newFile);await nextTick();
  const other={...ortho(),url:'other-project'};c.S.img=other;c.GeoMineSessionAutosave.state.generation++;deferredRead.release();await pending;deferredRead=null;
  assert.equal(c.S.img,other);assert.equal(c.S.img.url,'other-project');
  c.S.img=ortho();deferredRead=latch();const delayed=c.ortoReligarTIFF(oldFile);await nextTick();const release=deferredRead;deferredRead=null;
  assert.equal(await c.ortoReligarTIFF(newFile),true);release.release();assert.equal(await delayed,false);assert.equal(c.S.img.url,'preview:200');
  results.push('Late project/relink reads cannot overwrite a newer project or newer source.');
  c.S.img=null;c.S.rasters=[{id:7,name:'mdt',d:grid(200),style:{mode:'hipso',opacity:1},projectFile:'ALAGIS/rasters/mdt.tif',projectSavedAt:'old'}];
  failWrite=true;assert.equal((await c.projectSyncNativeRasters(false)).ok,false);
  assert.equal(c.S.rasters[0].projectFile,undefined);assert.equal(c.S.rasters[0].d.z[0],200);
  const rs=JSON.parse(JSON.stringify(c.projectData())).rasters[0];assert.equal(rs.projectFile,null);assert.equal(rs.projectSavePending,true);
  assert.equal((await c.projectRestoreNativeRasters()).restored,0);assert.equal(c.S.rasters[0].d.z[0],200);
  results.push('MDT native save failure drops stale pointer and preserves current cells.');
  failWrite=false;assert.equal(await c.projectAutoSaveRaster(c.S.rasters[0],false),true);
  const r=c.S.rasters[0],small={...grid(200),nc:1,nr:1,cs:10,z:Float32Array.of(200)};
  const smallDescriptor=c.projectNativeForSave(r,'raster',small);
  assert.notEqual(smallDescriptor.preview,r.projectNativeSource.preview);assert.equal(r.d.nc,2);
  r.projectNativeSource=smallDescriptor;r.d=small;r._projectSourceRaw=undefined;
  assert.equal((await c.projectRestoreNativeRasters()).restored,1);assert.equal(r.d.z[0],200);assert.equal(r.d.nc,2);
  results.push('Reduced serialized MDT preview remains bound to the correct native source.');
  r.d=grid(10);c.projectNativeBindRasterSource(r,oldFile);
  r.d.z.fill(200); // Same grid object, stale raw file: edited cells are authoritative.
  assert.equal(c.projectNativeRasterSourceCurrent(r),false);
  assert.equal(await c.projectAutoSaveRaster(r,false),true);
  const editedName=r.projectFile.split('/').pop();
  assert.equal(new Uint8Array(await files.get(editedName).arrayBuffer())[0],200);
  r._projectSourceRaw=undefined;r.d={...r.d,z:r.d.z.slice()};
  assert.equal((await c.projectRestoreNativeRasters()).restored,1);assert.equal(r.d.z[0],200);
  const big={...grid(10),nc:1024,nr:1,z:new Float32Array(1024).fill(10)};
  r.d=big;c.projectNativeBindRasterSource(r,oldFile);r.d.z[1]=99;
  assert.equal(c.projectNativeRasterSourceCurrent(r),false,'Even an unsampled edited cell invalidates raw association');
  results.push('Edited grids, including an unsampled single cell, never reuse their stale raw TIFF.');
  r.d={...grid(10),resampled:2,_W0:4,_H0:4,_bb:[0,0,10,10],_nd:null,
    _img0:{readRasters:async()=>[new Float32Array(16).fill(10)]}};
  c.projectNativeInvalidate(r);c.projectNativeBindRasterSource(r,oldFile);
  await c.demFull(r.d);
  assert.equal(c.projectNativeRasterSourceCurrent(r),true,'Reading Original is a cache fill, not a changed source');
  assert.equal(await c.projectAutoSaveRaster(r,false),true);
  const originalCopy=files.get(r.projectFile.split('/').pop());
  assert.deepEqual(new Uint8Array(await originalCopy.arrayBuffer()),new Uint8Array(await oldFile.arrayBuffer()));
  assert.equal(r._projectGrid.nc,4,'Native dimensions are preserved after Original');
  r.d._full.z.fill(220);
  assert.equal(c.projectNativeRasterSourceCurrent(r),false,'Editing full cache must invalidate raw copy');
  assert.equal(c.projectNativeRasterGradeToSave(r),r.d._full);
  failWrite=true;assert.equal(await c.projectAutoSaveRaster(r,false),false);
  assert.equal(r.projectFile,undefined,'An old native pointer cannot survive a failed edited-full save');
  const fullPending=JSON.parse(JSON.stringify(c.projectData())).rasters[0];
  assert.equal(fullPending.d.nc,4,'Even a failed native save embeds the edited full grid');
  assert.equal(Buffer.from(fullPending.d.z,'base64').readFloatLE(0),220);
  failWrite=false;
  assert.equal(await c.projectAutoSaveRaster(r,false),true);
  assert.equal(new Uint8Array(await files.get(r.projectFile.split('/').pop()).arrayBuffer())[0],220);
  assert.equal(r._projectGrid.nc,4,'Edited full grid is not reduced back to the preview');
  r.d._projectNativeFullCache.sourceImage={};
  assert.equal(c.projectNativeRasterSourceCurrent(r),false,'Another source cannot claim the full cache');
  assert.equal(c.projectNativeRasterGradeToSave(r),r.d,'Foreign-source cache is not authoritative');
  r.d._projectNativeFullCache.sourceImage=r.d._img0;
  delete r.d._img0;r.d.z.fill(220); // Limpar extremos may update both grids and remove the TIFF index.
  assert.equal(c.projectNativeRasterGradeToSave(r),r.d._full);
  assert.equal(c.projectNativeRasterLargestCurrentGrid(r),r.d._full);
  results.push('Original cache keeps byte-exact native copy; edited full cache saves full edited cells, never the reduced preview.');
  console.log(JSON.stringify({ok:true,cases:results.length,results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
