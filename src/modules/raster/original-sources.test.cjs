'use strict';
// Real source resolver in a VM; no user's files, browser permissions or network.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/original-sources.js','utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const grid=(z=[10,20,30,40])=>({nc:2,nr:2,cs:0.15,xll:500000,yll:6900000,z:[...z],_sig:{sample:'saved-elevations'}});
const raster=(id=1,name='MDT.tif',data=grid())=>({id,name:name.replace(/\.tiff?$/i,''),srcName:name,src:{file:name},d:data});
const ortho=(name='Orto.tif')=>({name:'Ortofoto',url:'embedded-preview',b:[0,0,10,10],src:{file:name}});
function file(name,bytes=[1,2,3,4],extra={}){return {name,size:bytes.length,lastModified:1234,bytes:[...bytes],...extra};}
function handle(original,permission='granted'){
 const calls={reads:0,permissions:0};
 const h={kind:'file',name:original.name,original,permission,calls,
  async queryPermission(){calls.permissions++;return h.permission;},
  async getFile(){calls.reads++;if(h.onRead)await h.onRead();return h.original;}};
 return h;
}
function directory(name,entries=[]){
 const d={kind:'directory',name,children:new Map(entries),enumerations:0,
  async queryPermission(){return 'granted';},async isSameEntry(other){return other===d;},
  entries(){d.enumerations++;return (async function*(){yield* d.children.entries();})();}};
 return d;
}
function gate(){let enter,release;const started=new Promise(r=>enter=r),promise=new Promise(r=>release=r);return {started,release,wait:()=>{enter();return promise;}};}
function fixture({db=new Map(),owner='alice',project='A',failSet=false}={}){
 let sequence=0;
 const calls={sets:[],gets:[],fingerprints:0,legacyRasters:[],legacyOrthos:[],headers:[],headerInspections:[],pixelReads:0,renders:[],logs:[],pickers:0};
 const S={projectId:project,workCRS:'EPSG:31982',rasters:[],img:null},state={generation:1};
 const preview=(item,kind,data)=>kind==='ortho'?'ortho:'+item.url:
  JSON.stringify(((g)=>({nc:g.nc,nr:g.nr,cs:g.cs,xll:g.xll,yll:g.yll,z:Array.from(g.z)}))(data||item.d));
 const c={console,S,crypto:{randomUUID:()=>`source-${++sequence}`},
  GeoMineCloudProvider:{user:owner?{uid:owner}:null},GeoMineSessionAutosave:{state},
  projectNativePreview:preview,
  async projectNativeFingerprint(value){calls.fingerprints++;if(c.fingerprintGate)await c.fingerprintGate.wait();return value.size+':'+value.bytes.join(',');},
  async idbGet(key){calls.gets.push(key);return db.get(key);},
  async idbSet(key,value){calls.sets.push(key);if(c.failSet)throw Error('Storage unavailable');db.set(key,value);},
  projectRasterReady:item=>!!item.d?._img0||item.d?.native===true,
  assinaturaMDT:data=>data._sig||null,
  recuperaFonte:async item=>c.legacyHandles?.get(item.id)||null,
  renderRaster:item=>calls.renders.push(item),syncOrthoTiles(){},
  cmdLog:(message,kind)=>calls.logs.push({message,kind}),
  GeoMineRasterSource:{wait:promise=>Promise.resolve(promise)},
  ensureGeoTIFF:async()=>{},orthoCRS:item=>item?._sourceCRS||S.workCRS,
  async rasterImportOpen(original){
   calls.headerInspections.push(original);
   return {async getImage(){return {
    getBoundingBox:()=>original.bounds||[0,0,10,10],
    getSamplesPerPixel:()=>original.samples??3,getWidth:()=>original.width||1000,getHeight:()=>original.height||1000,
    getGeoKeys:()=>original.geoKeys||{ProjectedCSTypeGeoKey:original.epsg??31982},
    async readRasters(){calls.pixelReads++;throw Error('Automatic legacy validation must only read TIFF headers');}
   };}};
  },
  GeoMineRasterImport:{release(){}},
  async showDirectoryPicker(){calls.pickers++;return c.pickedFolder;},
  async religaFonte(item,original,options){
   calls.legacyRasters.push({item,original,options});
   assert(options.expectedSignature,'legacy automatic binding requires saved content evidence');
   if(!options.isCurrent()||original.valid===false)return false;
   c.GeoMineOriginalSources.validated(item,'raster',preview(item,'raster'));
   item.d={...clone(original.grid||item.d),_img0:{}};return true;
  },
  async ortoReligarTIFF(original,options){
   calls.legacyOrthos.push({original,options});
   if(!options.isCurrent()||original.valid===false)return false;
   c.GeoMineOriginalSources.validated(S.img,'ortho',preview(S.img,'ortho'));
   S.img._img0={};S.img._tiff={};return true;
  }
 };
 c.failSet=failSet;c.window=c;vm.createContext(c);vm.runInContext(source,c);
 const api=c.GeoMineOriginalSources;
 // Exercise the API as core11 does: resolve the capability, attach headers,
 // then adopt the verified identity. Decoding and GeoTIFF header code have
 // separate browser coverage; these doubles never replace raster cell data.
 c.projectRestoreNativeRaster=async item=>{
  if(c.projectRasterReady(item))return true;
  const found=await api.resolve(item,'raster');if(!found)return false;
  if(!api.adopt(item,'raster',found))return false;
  item.d._img0={};calls.headers.push({item,file:found.file,kind:'raster'});return true;
 };
 c.projectRestoreNativeRasters=async()=>{
  let restored=0;for(const item of S.rasters)if(!c.projectRasterReady(item)&&await c.projectRestoreNativeRaster(item))restored++;
  return {restored,missing:S.rasters.filter(item=>!c.projectRasterReady(item)).length};
 };
 c.projectRestoreNativeOrtho=async()=>{
  if(!S.img||S.img._img0&&S.img._tiff)return {restored:0,missing:0};
  const found=await api.resolve(S.img,'ortho');if(!found)return {restored:0,missing:1};
  if(!api.adopt(S.img,'ortho',found))return {restored:0,missing:1};
  S.img._img0={};S.img._tiff={};calls.headers.push({item:S.img,file:found.file,kind:'ortho'});return {restored:1,missing:0};
 };
 return {c,S,state,db,api,calls,preview,ownerKey:()=>c.GeoMineCloudProvider.user?.uid||'offline'};
}

test('exact remembered handles survive a new module and serialized project, with account/project isolation',async()=>{
 const f=fixture(),r=raster(),I=ortho(),dem=file('MDT.tif'),rgb=file('Orto.tif',[4,5,6]);
 f.S.rasters=[r];f.S.img=I;
 const hd=handle(dem),ho=handle(rgb);
 assert.equal(await f.api.remember(r,'raster',hd,dem),true);
 assert.equal(await f.api.remember(I,'ortho',ho,rgb),true);
 const savedRaster=clone(r),savedOrtho=clone(I),again=fixture({db:f.db});again.S.rasters=[savedRaster];again.S.img=savedOrtho;
 assert.equal((await again.api.resolve(savedRaster,'raster')).handle,hd);
 assert.equal((await again.api.resolve(savedOrtho,'ortho')).file,rgb);
 const reads=hd.calls.reads+ho.calls.reads;
 again.c.GeoMineCloudProvider.user.uid='bob';
 assert.equal(await again.api.resolve(savedRaster,'raster'),null);
 again.c.GeoMineCloudProvider.user.uid='alice';again.S.projectId='B';
 assert.equal(await again.api.resolve(savedOrtho,'ortho'),null);
 assert.equal(hd.calls.reads+ho.calls.reads,reads,'another account/project never reads either original');
});

test('revoked permission and changed external bytes cannot restore a remembered source',async()=>{
 const f=fixture(),r=raster(),original=file('MDT.tif'),h=handle(original);f.S.rasters=[r];
 await f.api.remember(r,'raster',h,original);h.permission='prompt';
 assert.equal(await f.api.resolve(r,'raster'),null);assert.equal(h.calls.reads,0);
 h.permission='granted';h.original=file('MDT.tif',[9,9,9,9]);
 assert.equal(await f.api.resolve(r,'raster'),null);
 h.original=original;const found=await f.api.resolve(r,'raster');assert(found);
 assert.equal(f.api.adopt(r,'raster',{...found}),false,'only an actual verified resolution may be adopted');
 f.state.generation++;assert.equal(f.api.adopt(r,'raster',found),false);
});

test('unsaved legacy project reload accepts both validated previous and resulting previews',async()=>{
 const f=fixture(),r=raster(),before=clone(r),original=file('MDT.tif'),h=handle(original);f.S.rasters=[r];
 f.api.validated(r,'raster',f.preview(r,'raster'));
 r.d=grid([11,21,31,41]);await f.api.remember(r,'raster',h,original);
 assert.notEqual(f.preview(before,'raster'),f.preview(r,'raster'));
 for(const reopened of [before,{...clone(r),originalSource:undefined}]){
  const next=fixture({db:f.db});next.S.rasters=[reopened];
  assert.equal((await next.api.resolve(reopened,'raster')).handle,h);
 }
});

async function importedLegacyOrtho(){
 const f=fixture(),original=file('Orto.tif',[4,5,6]),h=handle(original),imported=ortho(),legacy=ortho();
 imported.url='new-PNG';legacy.url='old-JPEG';legacy.src.size=original.size;legacy._sourceCRS='EPSG:31982';f.S.img=imported;
 await f.api.remember(imported,'ortho',h,original);
 return {f,original,h,legacy};
}
test('a TIFF imported before the alias fix safely migrates its old JPEG without reopening a picker',async()=>{
 const {f,original,legacy}=await importedLegacyOrtho(),fresh=fixture({db:f.db});fresh.S.img=legacy;
 const found=await fresh.api.resolve(legacy,'ortho');assert.equal(found.file,original);assert.equal(fresh.calls.headerInspections.length,1);assert.equal(fresh.calls.pixelReads,0);
 const record=f.db.get('originalImageSource:v1:alice:A:layer:ortho%3Aortho');
 assert(record.previews.includes(fresh.preview(legacy,'ortho')));assert.equal(record.legacyOrthoPreviews.length,1);
 assert.equal(fresh.api.adopt(legacy,'ortho',found),true);
 const reopened={...clone(legacy),originalSource:undefined},again=fixture({db:f.db});again.S.img=reopened;
 assert.equal((await again.api.resolve(reopened,'ortho')).file,original);assert.equal(again.calls.headerInspections.length,0,'the persisted georeference proof avoids repeated TIFF header inspection');assert.equal(again.calls.pickers,0);
});
test('legacy cache migration requires exact names, known CRS, complete native extent and authorized bytes',async()=>{
 for(const changed of ['name','copySuffix','size','bounds','crs','missingCRS','nativeCRS','samples','descriptor','nativeDescriptor','pending','account','project','bytes']){
  const {f,original,h,legacy}=await importedLegacyOrtho(),fresh=fixture({db:f.db});fresh.S.img=legacy;
  if(changed==='name')legacy.src.file='Another.tif';
  if(changed==='copySuffix')legacy.src.file='Orto (1).tif';
  if(changed==='size')legacy.src.size++;
  if(changed==='bounds')legacy.b[0]+=0.011;
  if(changed==='crs')legacy._sourceCRS='EPSG:31983';
  if(changed==='missingCRS')original.geoKeys={};
  if(changed==='nativeCRS')original.epsg=31983;
  if(changed==='samples')original.samples=1;
  if(changed==='descriptor')legacy.originalSource={v:1,kind:'ortho',invalidated:true,preview:'different'};
  if(changed==='nativeDescriptor')legacy.projectNativeSource={v:1,preview:'different',fingerprint:'unknown',size:3};
  if(changed==='pending')legacy.projectSavePending=true;
  if(changed==='account')fresh.c.GeoMineCloudProvider.user.uid='bob';
  if(changed==='project')fresh.S.projectId='B';
  if(changed==='bytes')h.original=file('Orto.tif',[9,9,9]);
  assert.equal(await fresh.api.resolve(legacy,'ortho'),null,changed);assert.equal(fresh.calls.sets.length,0,changed+' must not publish an alias');
 }
});
test('migration accepts native pixel tolerance but binds later reuse to the exact saved metadata',async()=>{
 const {f,original,legacy}=await importedLegacyOrtho();legacy.b=legacy.b.map(v=>v+0.005);legacy.src.file='C:\\folder\\ORTO.TIF';
 const fresh=fixture({db:f.db});fresh.S.img=legacy;const saved=clone(legacy),found=await fresh.api.resolve(legacy,'ortho');assert(found);
 legacy.b[0]+=0.001;assert.equal(fresh.api.adopt(legacy,'ortho',found),false,'a post-resolution edit must not adopt the prior geometry proof');
 for(const changed of ['bounds','crs','name','size']){
  const edited=clone(saved),next=fixture({db:f.db});next.S.img=edited;
  if(changed==='bounds')edited.b[0]+=0.001;
  if(changed==='crs')edited._sourceCRS='EPSG:31983';
  if(changed==='name')edited.src.file='Other.tif';
  if(changed==='size')edited.src.size++;
  assert.equal(await next.api.resolve(edited,'ortho'),null,changed);
 }
 const reread=fixture({db:f.db}),unchanged=clone(saved);reread.S.img=unchanged;assert.equal((await reread.api.resolve(unchanged,'ortho')).file,original);
 // Remembering the same bytes under a newer preview must retain the migration proof.
 unchanged.url='third-PNG';await reread.api.remember(unchanged,'ortho',handle(original),original);
 const edited=clone(saved);edited.b[0]+=0.001;const last=fixture({db:f.db});last.S.img=edited;assert.equal(await last.api.resolve(edited,'ortho'),null);
});
test('legacy migration is discarded after asynchronous ownership or metadata changes and may be retried',async()=>{
 for(const changed of ['project','account','generation','preview','bounds','crs','replaced']){
  const {f,legacy}=await importedLegacyOrtho(),fresh=fixture({db:f.db}),latch=gate(),open=fresh.c.rasterImportOpen;fresh.S.img=legacy;
  fresh.c.rasterImportOpen=async file=>{const tiff=await open(file);return {async getImage(){await latch.wait();return tiff.getImage();}};};
  const pending=fresh.api.resolve(legacy,'ortho');await latch.started;
  if(changed==='project')fresh.S.projectId='B';
  if(changed==='account')fresh.c.GeoMineCloudProvider.user.uid='bob';
  if(changed==='generation')fresh.state.generation++;
  if(changed==='preview')legacy.url='changed';
  if(changed==='bounds')legacy.b[0]+=0.001;
  if(changed==='crs')legacy._sourceCRS='EPSG:31983';
  if(changed==='replaced')fresh.S.img=clone(legacy);
  latch.release();assert.equal(await pending,null,changed);assert.equal(fresh.calls.sets.length,0,changed);
 }
 const {f,legacy}=await importedLegacyOrtho(),fresh=fixture({db:f.db});fresh.S.img=legacy;legacy._sourceCRS='EPSG:31983';
 assert.equal(await fresh.api.resolve(legacy,'ortho'),null);legacy._sourceCRS='EPSG:31982';assert(await fresh.api.resolve(legacy,'ortho'),'a failed metadata match must not permanently mark the legacy preview stale');
});

test('forSave remaps the preview to the serialized grid; explicit descriptor authorizes the same verified file',async()=>{
 const f=fixture(),r=raster(),original=file('MDT.tif'),h=handle(original);f.S.rasters=[r];
 await f.api.remember(r,'raster',h,original);
 const reduced={nc:1,nr:1,cs:0.3,xll:r.d.xll,yll:r.d.yll,z:[25]};
 const descriptor=f.api.forSave(r,'raster',reduced);
 assert.equal(descriptor.preview,f.preview(r,'raster',reduced));assert.notEqual(descriptor.preview,r.originalSource.preview);
 const reopened={...clone(r),d:reduced,originalSource:clone(descriptor)},next=fixture({db:f.db});next.S.rasters=[reopened];
 const found=await next.api.resolve(reopened,'raster');assert(found);
 assert.equal(found.file,original);assert.equal(found.descriptor.preview,descriptor.preview);
 assert.equal(found.descriptor.fingerprint,r.originalSource.fingerprint);
});

test('edited cells block remembered, legacy-handle and folder fallback, including reopened invalidation',async()=>{
 const f=fixture({owner:null}),r=raster(),original=file('MDT.tif'),h=handle(original);f.S.rasters=[r];
 await f.api.remember(r,'raster',h,original);r.d.z[1]=12345;
 assert.equal(await f.api.resolve(r,'raster'),null);
 const invalid=f.api.forSave(r,'raster');assert.equal(invalid.invalidated,true);
 f.c.legacyHandles=new Map([[r.id,h]]);f.c.pickedFolder=directory('Sources',[['MDT.tif',h]]);
 await f.api.chooseFolder();await f.api.restoreAll();
 assert.equal(f.calls.legacyRasters.length,0);assert.equal(f.calls.headers.length,0);assert.equal(r.d.z[1],12345);
 const next=fixture({db:f.db,owner:null}),reopened={...clone(r),originalSource:clone(invalid)};next.S.rasters=[reopened];
 next.c.legacyHandles=new Map([[r.id,h]]);await next.api.restoreAll();
 assert.equal(next.calls.legacyRasters.length,0);assert.equal(next.calls.headers.length,0);
 const oldFileAlias=fixture({db:f.db,owner:null}),changedWithoutDescriptor={...clone(r),originalSource:undefined};oldFileAlias.S.rasters=[changedWithoutDescriptor];
 assert.equal(await oldFileAlias.api.resolve(changedWithoutDescriptor,'raster'),null);
 oldFileAlias.c.pickedFolder=f.c.pickedFolder;await oldFileAlias.api.chooseFolder();
 assert.equal(oldFileAlias.calls.legacyRasters.length,0,'an incompatible alias cannot be bypassed by folder matching');
});

test('complete PNG/JPEG/WebP images are excluded, while TIFF provenance takes precedence',()=>{
 const f=fixture();
 for(const extension of ['png','jpg','jpeg','webp','PNG']){
  f.S.img={name:'Imagem',url:'complete-pixels',src:{file:'imagem.'+extension}};
  assert.equal(f.api.needsOrtho(f.S.img),false);assert.equal(f.api.missing().length,0);
 }
 for(const evidence of [{src:{file:'original.tif'}},{originalSource:{v:1}},{projectNativeSource:{v:1}},{projectFile:'ALAGIS/rasters/original.tif'}]){
  f.S.img={name:'Preview.png',url:'preview',...evidence};assert.equal(f.api.missing().length,1);
 }
});

test('deferred dropped-handle lookup cannot remember a source after project, generation, account or in-place grid edits',async()=>{
 for(const change of [f=>f.S.projectId='B',f=>f.state.generation++,f=>f.c.GeoMineCloudProvider.user.uid='bob',f=>f.S.rasters[0].d.z[0]++]){
  const f=fixture(),r=raster(),original=file('MDT.tif'),h=handle(original),latch=gate();f.S.rasters=[r];
  f.c.projectDroppedHandles={async get(){await latch.wait();return h;}};
  const pending=f.api.rememberFile(r,'raster',original);await latch.started;change(f);latch.release();
  assert.equal(await pending,false);assert.equal(r.originalSource,undefined);assert.equal(f.db.size,0);
 }
});

test('one read-only folder selection binds all legacy images, and the unchanged unsaved project reloads from aliases',async()=>{
 const f=fixture(),a=raster(1,'MDT.tif'),b=raster(2,'TPI.tif',grid([-1,0,1,0])),I=ortho();f.S.rasters=[a,b];f.S.img=I;
 const originalProject={rasters:clone(f.S.rasters),img:clone(I)};
 const dem=file('MDT.tif',[1,2],{grid:grid([11,21,31,41])}),tpi=file('TPI.tif',[3,4],{grid:grid([-1,0,1,0])}),rgb=file('Orto.tif',[5,6,7]);
 f.c.pickedFolder=directory('SATC',[['ortho',directory('ortho',[['Orto.tif',handle(rgb)]])],['MDT.tif',handle(dem)],['TPI.tif',handle(tpi)]]);
 const operation=f.api.chooseFolder();assert.equal(f.calls.pickers,1,'picker is invoked in the original click turn');
 assert.equal(await operation,true);assert.equal(f.api.missing().length,0);
 assert.equal(f.calls.legacyRasters.length,2);assert.equal(f.calls.legacyOrthos.length,1);
 assert.equal(f.calls.legacyRasters[0].original,dem);assert.equal(f.calls.legacyRasters[1].original,tpi);
 assert.equal(f.c.pickedFolder.enumerations,1,'one folder enumeration supplies all source lookups');
 for(const item of [a,b,I])assert(item.originalSource?.fingerprint);
 const again=fixture({db:f.db});again.S.rasters=originalProject.rasters;again.S.img=originalProject.img;
 const restored=await again.api.restoreAll();assert.equal(restored.restored,3);assert.equal(restored.missing,0);
 assert.equal(again.calls.headers.length,3);assert.equal(again.calls.pickers,0);assert.equal(again.calls.legacyRasters.length,0);
});

test('recursive homonyms are refused for legacy images, and verified fingerprints select the correct source',async()=>{
 const f=fixture(),r=raster(),good=file('MDT.tif',[1,2,3]),wrong=file('MDT.tif',[8,8,8]),goodHandle=handle(good);f.S.rasters=[r];
 f.c.pickedFolder=directory('Root',[['first',directory('first',[['MDT.tif',handle(wrong)]])],['second',directory('second',[['MDT.tif',goodHandle]])]]);
 await f.api.chooseFolder();assert.equal(f.calls.legacyRasters.length,0);assert.equal(f.api.missing().length,1);
 await f.api.remember(r,'raster',goodHandle,good);await f.api.chooseFolder();
 assert.equal(f.api.missing().length,0);assert.equal(f.calls.headers.at(-1).file,good);assert.equal(f.calls.legacyRasters.length,0);
});

test('legacy ortho candidates with wrong byte length, overlapping but different extent, wrong CRS or too few bands are rejected',async()=>{
 const cases=[
  {name:'known size differs',metadata:{size:999},file:{}},
  {name:'overlapping full extent differs',metadata:{size:3},file:{bounds:[0,0,11,10]}},
  {name:'declared CRS differs',metadata:{size:3},file:{epsg:31983}},
  {name:'not an RGB ortho',metadata:{size:3},file:{samples:1}}
 ];
 for(const row of cases){
  const f=fixture(),I=ortho(),original=file('Orto.tif',[1,2,3],row.file);I.src={...I.src,...row.metadata};f.S.img=I;
  f.c.pickedFolder=directory('originais',[['Orto.tif',handle(original)]]);
  await f.api.chooseFolder();
  assert.equal(f.calls.legacyOrthos.length,0,row.name);assert.equal(f.api.missing().length,1,row.name);
  assert.equal(I.originalSource,undefined,row.name);assert.equal(f.calls.pixelReads,0,row.name);
 }
});

test('a unique legacy RGB ortho with matching source size, full extent and declared CRS is restored using headers only',async()=>{
 const f=fixture(),I=ortho(),original=file('Orto.tif',[1,2,3],{bounds:[0,0,10,10],epsg:31982,samples:3});I.src.size=3;f.S.img=I;
 const h=handle(original);f.c.pickedFolder=directory('originais',[['Orto.tif',h]]);
 await f.api.chooseFolder();
 assert.equal(f.calls.legacyOrthos.length,1);assert.equal(f.calls.legacyOrthos[0].original,original);
 assert.equal(f.calls.legacyOrthos[0].options.restoreNative,true);assert.equal(f.calls.headerInspections.length,1);
 assert.equal(f.calls.pixelReads,0);assert.equal(f.api.missing().length,0);assert.equal((await f.api.resolve(I,'ortho')).handle,h);
});

test('failed persistence retains newer folder and source capabilities in session memory instead of reading stale IndexedDB records',async()=>{
 const old=directory('old'),newFolder=directory('new'),db=new Map([['originalImageSource:v1:alice:A:folders',[{v:1,projectId:'A',ownerUid:'alice',handle:old}]]]);
 const f=fixture({db,failSet:true}),r=raster();f.S.rasters=[r];f.c.pickedFolder=newFolder;
 await f.api.chooseFolder();assert.equal(newFolder.enumerations,1);
 const original=file('MDT.tif'),h=handle(original);newFolder.children.set('MDT.tif',h);
 const restored=await f.api.restoreAll();assert.equal(restored.restored,1);assert.equal(f.api.missing().length,0);
 assert.equal(newFolder.enumerations,2,'subsequent lookup sees the folder retained only in memory');
 assert.equal(db.get('originalImageSource:v1:alice:A:folders').length,1,'the old persisted record really remained unchanged');
 assert.equal((await f.api.resolve(r,'raster')).handle,h);assert(f.calls.logs.some(row=>/sessão/.test(row.message)));
});

test('a cloud-folder enumeration timeout is logged without preventing restoration from another known folder',async()=>{
 const r=raster(),original=file('MDT.tif'),healthy=directory('local',[['MDT.tif',handle(original)]]),stuck=directory('cloud');
 stuck.entries=()=>({next(){const pending=new Promise(()=>{});pending.cloudStalled=true;return pending;}});
 const db=new Map([['originalImageSource:v1:alice:A:folders',[stuck,healthy].map(h=>({v:1,projectId:'A',ownerUid:'alice',handle:h}))]]);
 const f=fixture({db});f.S.rasters=[r];let timedOut=0;
 f.c.GeoMineRasterSource.wait=promise=>{
  if(promise.cloudStalled){timedOut++;return Promise.reject(Object.assign(Error('Provider timed out'),{name:'TimeoutError'}));}
  return Promise.resolve(promise);
 };
 const result=await f.api.restoreAll();assert.equal(timedOut,1);assert.equal(result.restored,1);assert.equal(result.missing,0);
 assert(f.calls.logs.some(row=>row.kind==='warn'&&/cloud/.test(row.message)));
});

test('an in-flight resolution is discarded when the project, account or same grid cells change while fingerprinting',async()=>{
 for(const change of [f=>f.S.projectId='B',f=>f.state.generation++,f=>f.c.GeoMineCloudProvider.user.uid='bob',f=>f.S.rasters[0].d.z[0]++]){
  const f=fixture(),r=raster(),original=file('MDT.tif'),h=handle(original);f.S.rasters=[r];await f.api.remember(r,'raster',h,original);
  const latch=gate();f.c.fingerprintGate=latch;const pending=f.api.resolve(r,'raster');await latch.started;change(f);latch.release();
  assert.equal(await pending,null,'late verification must not authorize changed data');
 }
});

// Real Blob/File slices exercise the new iPad fallback. The fake OPFS writes
// bytes to its backing map, while a fresh VM loses all session-only references.
const {Blob: NativeBlob,File: NativeFile}=require('node:buffer');
const {webcrypto,createHash}=require('node:crypto');
const MiB=1024*1024;

test('an older project reconnects the same native MDT imported under a new layer ID and different display grid',async()=>{
 const db=new Map(),first=fixture({db}),imported=raster(9,'MDT.tif',grid([1,2,3,4])),original=file('MDT.tif');first.S.rasters=[imported];
 await first.api.remember(imported,'raster',handle(original),original);
 const fresh=fixture({db}),legacy=raster(3,'MDT — 15 cm',grid([10,20,30,40]));
 legacy.projectNativeSource={v:1,size:original.size,fingerprint:imported.originalSource.fingerprint,preview:fresh.c.projectNativePreview(legacy,'raster')};fresh.S.rasters=[legacy];
 const expected=JSON.stringify(legacy.d.z),result=await fresh.api.restoreAll();assert.equal(result.restored,1);assert.equal(result.missing,0);assert.equal(JSON.stringify(legacy.d.z),expected);assert.equal(fresh.calls.headers[0].file,original);assert.equal(fresh.calls.pixelReads,0);
});

test('an older ortho PNG reconnects identical full source bytes despite a differently encoded imported preview',async()=>{
 const db=new Map(),first=fixture({db}),imported=ortho(),original=file('Orto.tif');imported.url='new-import-preview';first.S.img=imported;
 await first.api.remember(imported,'ortho',handle(original),original);
 const fresh=fixture({db}),legacy=ortho();legacy.url='legacy-project-preview';legacy.projectNativeSource={v:1,size:original.size,fingerprint:imported.originalSource.fingerprint,preview:fresh.c.projectNativePreview(legacy,'ortho')};fresh.S.img=legacy;
 const result=await fresh.api.restoreAll();assert.equal(result.restored,1);assert.equal(legacy.url,'legacy-project-preview');assert(legacy._img0);assert.equal(fresh.calls.headers[0].file,original);
});

test('a partial orthophoto cannot replace the full mosaic named by the saved native identity',async()=>{
 const f=fixture(),I=ortho(),partial=file('Orto.tif',[1,2,3]);f.S.img=I;await f.api.remember(I,'ortho',handle(partial),partial);
 const legacy=ortho();legacy.projectNativeSource={v:1,size:999,fingerprint:'full-mosaic-not-partial',preview:f.c.projectNativePreview(legacy,'ortho')};f.S.img=legacy;
 assert.equal(await f.api.resolve(legacy,'ortho'),null);assert.equal(f.calls.headers.length,0);
});

test('a later partial ortho import does not hide an earlier cached full mosaic',async()=>{
 const db=new Map(),first=fixture({db}),full=ortho(),original=file('Mosaico.tif',[1,2,3,4,5,6]);first.S.img=full;await first.api.remember(full,'ortho',handle(original),original);
 const savedFingerprint=full.originalSource.fingerprint,partial=ortho(),crop=file('Recorte.tif',[1,2,3]);partial.url='partial-image';first.S.img=partial;await first.api.remember(partial,'ortho',handle(crop),crop);
 const fresh=fixture({db}),legacy=ortho();legacy.projectNativeSource={v:1,size:original.size,fingerprint:savedFingerprint,preview:fresh.c.projectNativePreview(legacy,'ortho')};fresh.S.img=legacy;
 const result=await fresh.api.restoreAll();assert.equal(result.restored,1);assert.equal(fresh.calls.headers[0].file,original);
});

test('native fingerprint lookup never restores a saved grid that has been edited',async()=>{
 const f=fixture(),r=raster(9),original=file('MDT.tif');f.S.rasters=[r];await f.api.remember(r,'raster',handle(original),original);
 const legacy=raster(3);legacy.projectNativeSource={v:1,size:original.size,fingerprint:r.originalSource.fingerprint,preview:f.c.projectNativePreview(legacy,'raster')};legacy.d.z[2]+=1;f.S.rasters=[legacy];
 assert.equal(await f.api.resolve(legacy,'raster'),null);
});

test('native source fingerprint lookup stays isolated by account and project',async()=>{
 const db=new Map(),f=fixture({db}),r=raster(9),original=file('MDT.tif');f.S.rasters=[r];await f.api.remember(r,'raster',handle(original),original);
 for(const options of [{owner:'bob'},{project:'B'}]){const other=fixture({db,...options}),legacy=raster(3);legacy.projectNativeSource={v:1,size:original.size,fingerprint:r.originalSource.fingerprint,preview:other.c.projectNativePreview(legacy,'raster')};other.S.rasters=[legacy];assert.equal(await other.api.resolve(legacy,'raster'),null);}
});

test('a later session-only alias cannot hide the durable original cached under another layer ID',async()=>{
 const db=new Map(),first=fixture({db}),r=raster(9),original=file('MDT.tif');first.S.rasters=[r];await first.api.remember(r,'raster',handle(original),original);
 const source=db.get('originalImageSource:v1:alice:A:layer:raster%3A9');db.set('originalImageSource:v1:alice:A:layer:raster%3A3',{...source,handle:null,cache:null});
 const fresh=fixture({db}),legacy=raster(3);legacy.projectNativeSource={v:1,size:original.size,fingerprint:r.originalSource.fingerprint,preview:fresh.c.projectNativePreview(legacy,'raster')};fresh.S.rasters=[legacy];
 assert.equal((await fresh.api.restoreAll()).restored,1);assert.equal(fresh.calls.headers[0].file,original);
});
function localDisk(options={}){
 const files=new Map(),directories=new Set(['']),calls={writes:[],reads:[],removed:[],aborts:0,concurrent:0,peak:0};
 const fault=options.fault||{};
 const no=()=>Object.assign(new Error('Missing file'),{name:'NotFoundError'});
 function directoryAt(path){return {kind:'directory',
  async getDirectoryHandle(name,{create=false}={}){const key=path+'/'+name;if(!directories.has(key)){if(!create)throw no();directories.add(key);}return directoryAt(key);},
  async getFileHandle(name,{create=false}={}){
   const key=path+'/'+name;if(!files.has(key)){if(!create)throw no();files.set(key,new NativeBlob([]));}
   return {kind:'file',name,
    async getFile(){calls.reads.push(key);return new NativeFile([files.get(key)],name,{lastModified:1});},
    async createWritable(){let parts=[];return {
     async write(buffer){calls.writes.push(buffer.byteLength);calls.concurrent++;calls.peak=Math.max(calls.peak,calls.concurrent);
      try{if(fault.write)await fault.write(buffer,calls.writes.length);parts.push(new Uint8Array(buffer).slice());}finally{calls.concurrent--;}
     },async close(){if(fault.close)await fault.close();files.set(key,new NativeBlob(parts));parts=[];},
     async abort(){calls.aborts++;parts=[];}
    };}
   };
  },async removeEntry(name){const key=path+'/'+name;calls.removed.push(key);files.delete(key);}
 };}
 return {files,directories,calls,fault,navigator:{storage:{
  async getDirectory(){return directoryAt('');},
  async estimate(){return {quota:options.quota??1024*MiB,usage:options.usage??0};}
 }}};
}
async function slicedFingerprint(original){
 const chunk=65536,size=original.size,offsets=[0,Math.max(0,Math.floor(size/2)-chunk/2),Math.max(0,size-chunk)];
 const hashes=[];for(const offset of [...new Set(offsets)])
  hashes.push(createHash('sha256').update(Buffer.from(await original.slice(offset,Math.min(size,offset+chunk)).arrayBuffer())).digest('hex'));
 return size+':'+hashes.join(':');
}
function withDisk(f,disk){
 f.c.navigator=disk.navigator;f.c.crypto=webcrypto;f.c.TextEncoder=TextEncoder;
 f.c.Blob=NativeBlob;f.c.File=NativeFile;
 f.c.projectNativeFingerprint=async value=>{f.calls.fingerprints++;return await slicedFingerprint(value);};
 f.c.idbSet=async(key,value)=>{
  f.calls.sets.push(key);
  assert.equal(value.handle,null,'file-input persistence does not invent an external file handle');
  assert.equal(Object.values(value).some(v=>v instanceof NativeBlob),false,'IDB stores metadata, never a multi-GB file');
  if(f.c.failSet)throw new Error('Storage unavailable');
  f.db.set(key,structuredClone(value));
 };
 return f;
}
function slicedFile(size=3*MiB+29){
 const bytes=new Uint8Array(size);for(let i=0;i<size;i++)bytes[i]=(i*17+43)%251;
 const value=new NativeFile([bytes],'MDT-nativo.tif',{lastModified:1234}),nativeSlice=value.slice.bind(value),ranges=[];
 value.slice=(start,end)=>{ranges.push([start,end]);return nativeSlice(start,end);};
 value.arrayBuffer=()=>{throw new Error('A whole original must never be read into RAM');};
 return {value,ranges,bytes};
}

test('an existing iPad device copy migrates a legacy JPEG without copying or requesting its TIFF again',async()=>{
 const disk=localDisk(),f=withDisk(fixture(),disk),{value}=slicedFile(),imported=ortho(value.name);
 imported.url='imported-PNG';f.S.img=imported;await f.api.rememberFile(imported,'ortho',value);
 const writes=disk.calls.writes.length,legacy=ortho(value.name);legacy.url='old-project-JPEG';legacy.src.size=value.size;
 const fresh=withDisk(fixture({db:f.db}),disk);fresh.S.img=legacy;
 const found=await fresh.api.resolve(legacy,'ortho');assert(found);assert.equal(found.file.size,value.size);assert.equal(found.file.name,value.name);
 assert.equal(fresh.api.adopt(legacy,'ortho',found),true);assert.equal(fresh.api.persistence(legacy,'ortho').state,'device');
 assert.equal(disk.calls.writes.length,writes);assert.equal(fresh.calls.headerInspections.length,1);assert.equal(fresh.calls.pixelReads,0);assert.equal(fresh.calls.pickers,0);
 const oldAgain={...clone(legacy),originalSource:undefined},again=withDisk(fixture({db:f.db}),disk);again.S.img=oldAgain;
 assert(await again.api.resolve(oldAgain,'ortho'));assert.equal(again.calls.headerInspections.length,0);assert.equal(disk.calls.writes.length,writes);
});

test('iPad input selection persists real bytes with 1 MiB backpressure and restores after fresh page state',async()=>{
 const disk=localDisk(),f=withDisk(fixture(),disk),r=raster(),before=clone(r),{value,ranges,bytes}=slicedFile();f.S.rasters=[r];
 let previewCalls=0;const checkPreview=f.c.projectNativePreview;f.c.projectNativePreview=(...args)=>{previewCalls++;return checkPreview(...args);};
 assert.equal(await f.api.rememberFile(r,'raster',value),true);
 assert.equal(f.api.persistence(r,'raster').state,'device');
 assert.equal(disk.calls.writes.length,4);assert.equal(disk.calls.peak,1);
 assert(disk.calls.writes.every(n=>n<=MiB));assert(ranges.every(([a,b])=>b-a<=MiB));
 assert(previewCalls<50,'grid hashing must not run for every file chunk');
 assert.equal(disk.files.size,1);
 const cached=[...disk.files.values()][0];assert.deepEqual(new Uint8Array(await cached.arrayBuffer()),bytes);
 const saved=clone(r);
 for(const reopened of [saved,before]){
  const fresh=withDisk(fixture({db:f.db}),disk);fresh.S.rasters=[reopened];
  const result=await fresh.api.restoreAll();
  assert.equal(result.restored,1);assert.equal(result.missing,0);assert.equal(fresh.calls.pickers,0);
  assert.equal(fresh.calls.headers[0].file.name,value.name);
  assert.equal(fresh.api.persistence(reopened,'raster').state,'device');
 }
});
test('large iPad TIFF is staged before decoding, then adopted without a second byte copy',async()=>{
 const disk=localDisk(),f=withDisk(fixture(),disk),r=raster(),{value}=slicedFile(64*MiB);f.S.rasters=[r];
 Object.assign(f.c.navigator,{userAgent:'Macintosh Safari',platform:'MacIntel',maxTouchPoints:5});f.c.showLoad=()=>{};
 const local=await f.api.stageFile(value);assert.notEqual(local,value);assert.equal(local.size,value.size);assert.equal(disk.calls.writes.length,64);assert.equal(disk.calls.peak,1);
 assert.equal(await f.api.stageFile(local),local,'verified OPFS Files never stage recursively');
 f.S.projectId='another';await assert.rejects(f.api.stageFile(local),{name:'AbortError'});f.S.projectId='A';
 value.slice=()=>{throw new Error('The cloud provider capability expired after staging');};
 await f.api.rememberFile(r,'raster',value);assert.equal(disk.calls.writes.length,64,'binding after import reuses the staged bytes');
 assert.equal(f.api.persistence(r,'raster').state,'device');
});

test('reselecting an orthophoto reuses the verified iPad copy after its storage quota fills',async()=>{
 const limits={},disk=localDisk(limits),f=withDisk(fixture(),disk),{value}=slicedFile(64*MiB);
 Object.assign(f.c.navigator,{platform:'MacIntel',maxTouchPoints:5});
 f.c.showLoad=()=>{};
 const original=await f.api.stageFile(value,{sourceKind:'ortho'});
 assert.notEqual(original,value);
 const writes=disk.calls.writes.length;
 limits.quota=MiB;
 const fresh=withDisk(fixture({db:f.db}),disk);
 // A new File object models choosing the same item again via Files.
 fresh.c.showLoad=()=>{};
 const selected=new NativeFile([value],value.name,{lastModified:value.lastModified});
 assert.equal(await fresh.api.stageFile(selected),selected,'single-band imports retain their direct route');
 const reopened=await fresh.api.stageFile(selected,{sourceKind:'ortho'});
 assert.notEqual(reopened,selected);
 assert.equal(await slicedFingerprint(reopened),await slicedFingerprint(original));
 assert.equal(disk.calls.writes.length,writes,'verified original reused without another copy');
});

test('a matching existing device copy is reused, including a fresh page and repeated selection',async()=>{
 const disk=localDisk(),f=withDisk(fixture(),disk),r=raster(),{value}=slicedFile();f.S.rasters=[r];
 await f.api.rememberFile(r,'raster',value);const count=disk.calls.writes.length;
 await f.api.rememberFile(r,'raster',value);assert.equal(disk.calls.writes.length,count);
 const fresh=withDisk(fixture({db:f.db}),disk),reopened=clone(r);fresh.S.rasters=[reopened];
 await fresh.api.rememberFile(reopened,'raster',value);
 assert.equal(disk.calls.writes.length,count);assert.equal(disk.files.size,1);
});

test('device copies stay scoped to account and project and altered cached bytes are rejected',async()=>{
 const disk=localDisk(),f=withDisk(fixture(),disk),r=raster(),{value}=slicedFile();f.S.rasters=[r];await f.api.rememberFile(r,'raster',value);
 const reads=disk.calls.reads.length;
 for(const args of [{owner:'bob'},{project:'B'}]){
  const fresh=withDisk(fixture({db:f.db,...args}),disk),reopened=clone(r);fresh.S.rasters=[reopened];
  assert.equal(await fresh.api.resolve(reopened,'raster'),null);
 }
 assert.equal(disk.calls.reads.length,reads,'wrong account or project cannot open the cached original');
 const key=[...disk.files.keys()][0],original=disk.files.get(key);
 disk.files.set(key,new NativeBlob([new Uint8Array(original.size).fill(7)]));
 const fresh=withDisk(fixture({db:f.db}),disk),reopened=clone(r);fresh.S.rasters=[reopened];
 assert.equal(await fresh.api.resolve(reopened,'raster'),null);
 assert.equal(fresh.calls.headers.length,0);
});

test('insufficient quota is explicit; it preserves session access and never pretends persistence succeeded',async()=>{
 const disk=localDisk({quota:MiB}),f=withDisk(fixture(),disk),r=raster(),{value}=slicedFile();f.S.rasters=[r];
 assert.equal(await f.api.rememberFile(r,'raster',value),true);
 assert.equal(f.api.persistence(r,'raster').state,'session-only');
 assert.equal((await f.api.resolve(r,'raster')).file,value);
 assert.equal(disk.calls.writes.length,0);assert.equal(disk.calls.removed.length,0);
 assert(f.calls.logs.some(v=>/Espaço insuficiente/.test(v.message)));
 const fresh=withDisk(fixture({db:f.db}),disk),reopened=clone(r);fresh.S.rasters=[reopened];
 assert.equal(await fresh.api.resolve(reopened,'raster'),null);
});

test('copy failure and in-place edits remove only their own partial file, without altering the project',async()=>{
 for(const mode of ['failure','project','generation','account','cell']){
  const disk=localDisk(),f=withDisk(fixture(),disk),r=raster(),{value}=slicedFile(),original=r.d;f.S.rasters=[r];
  disk.files.set('/another-project-original.tif',new NativeBlob(['keep']));
  const latch=gate();disk.fault.write=async(_,n)=>{if(n===1)await latch.wait();};
  const operation=f.api.rememberFile(r,'raster',value);await latch.started;
  if(mode==='failure')disk.fault.write=async()=>{throw Object.assign(new Error('Disk unavailable'),{name:'QuotaExceededError'});};
  if(mode==='project')f.S.projectId='B';if(mode==='generation')f.state.generation++;
  if(mode==='account')f.c.GeoMineCloudProvider.user.uid='bob';if(mode==='cell')r.d.z[0]++;
  latch.release();const result=await operation;
  assert.equal(result,mode==='failure');assert.equal(r.d,original);
  assert.equal(disk.files.size,1,mode);assert(disk.files.has('/another-project-original.tif'));
  assert.equal(disk.calls.removed.length,1,mode);assert(!disk.calls.removed.includes('/another-project-original.tif'));
  if(mode==='failure')assert.equal(f.api.persistence(r,'raster').state,'session-only');
 }
});

test('missing or truncated cached file is replaced once and a later cache failure cannot advertise device availability',async()=>{
 const disk=localDisk(),f=withDisk(fixture(),disk),r=raster(),{value}=slicedFile();f.S.rasters=[r];await f.api.rememberFile(r,'raster',value);
 const first=[...disk.files.keys()][0];disk.files.delete(first);
 disk.fault.write=async()=>{throw new Error('Disk failed');};
 await f.api.rememberFile(r,'raster',value);
 assert.equal(f.api.persistence(r,'raster').state,'session-only');
 for(const record of f.db.values())assert.equal(record.cache,undefined);
});

test('failed IDB publication stays session-only even when its complete file already exists on disk',async()=>{
 const disk=localDisk(),f=withDisk(fixture({failSet:true}),disk),r=raster(),{value}=slicedFile();f.S.rasters=[r];
 assert.equal(await f.api.rememberFile(r,'raster',value),true);
 assert.equal(disk.files.size,1);assert.equal(f.api.persistence(r,'raster').state,'session-only');
 assert.equal((await f.api.resolve(r,'raster')).file,value);
 assert.equal(f.api.persistence(r,'raster').state,'session-only');
 const fresh=withDisk(fixture({db:f.db}),disk),reopened=clone(r);fresh.S.rasters=[reopened];
 assert.equal(await fresh.api.resolve(reopened,'raster'),null);
});


test('explicit relink can persist its source while deferring local handoff; normal imports still adopt',async()=>{
 for(const deferLocalHandoff of [true,false]){
  const f=fixture(),I=ortho(),original=file('Orto.tif',[9,8,7]),h=handle(original);f.S.img=I;let handoffs=0;
  f.c.GeoMineRasterSourceUI={async preferLocal(item,current){assert.equal(item,I);assert(current());handoffs++;}};
  f.api.capture(original,h);assert.equal(await f.api.rememberFile(I,'ortho',original,{deferLocalHandoff}),true);
  assert.equal(handoffs,deferLocalHandoff?0:1);assert.equal((await f.api.resolve(I,'ortho')).file,original);assert(f.calls.sets.length>=3);
 }
});

test('verified visual derivation remains resolvable during source persistence; arbitrary URL replacement is rejected',async()=>{
 for(const derived of [true,false]){
  const f=fixture(),I=ortho(),original=file('Orto.tif',[6,5,4]),h=handle(original);f.S.img=I;f.api.capture(original,h);const bound=f.preview(I,'ortho');
  f.c.orthoMaskPreviewIdentity=item=>item===I&&item.url==='derived-mask'&&derived?bound:null;
  f.c.projectNativePreview=(item,kind,data)=>kind==='ortho'&&(f.c.orthoMaskPreviewIdentity(item))||f.preview(item,kind,data);
  const latch=gate();f.c.fingerprintGate=latch;const pending=f.api.rememberFile(I,'ortho',original,{deferLocalHandoff:true});await latch.started;I.url=derived?'derived-mask':'foreign-preview';latch.release();assert.equal(await pending,derived);f.c.fingerprintGate=null;
  if(derived){assert.equal(I.originalSource.preview,bound);assert.equal((await f.api.resolve(I,'ortho')).file,original);}else assert.equal(I.originalSource,undefined);
 }
});
