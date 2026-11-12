const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../core/parts/03-file-loading-qgis.js'),'utf8');
function context(){
 const captured=[],imported=[],messages=[],pickers=[],inputs={};
 for(const id of ['fileIn','ortoReligarFile','imgReligarFile'])inputs[id]={id,value:'',handlers:{},addEventListener(name,fn){this.handlers[name]=fn},click(){const e={isTrusted:false,preventDefault(){this.prevented=true}};this.lastClick=e;return this.handlers.click?.(e)}};
 const store=new Map(),ctx={console,AbortController,S:{projectId:'A',rasters:[],layers:[],img:{name:'old ortho'}},navigator:{userAgent:'Macintosh',maxTouchPoints:0,userActivation:{isActive:true}},sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},document:{getElementById:id=>inputs[id],addEventListener(){}},toast:t=>messages.push(t),cmdLog:t=>messages.push(t),esc:x=>x,GeoMineSessionAutosave:{state:{generation:1}},GeoMineOriginalSources:{capture:(f,h)=>captured.push([f,h])},GeoMineImportHandoff:{fromInput:i=>imported.push(i)}};
 ctx.window=ctx;ctx.showOpenFilePicker=options=>{pickers.push(options);return Promise.resolve([])};vm.createContext(ctx);vm.runInContext(source.slice(0,source.indexOf('/* Torna as janelas')),ctx);
 const click=async(id='fileIn',trusted=false)=>{const event={isTrusted:trusted,preventDefault(){this.prevented=true}};await inputs[id].handlers.click(event);return event};
 return {ctx,inputs,captured,imported,messages,pickers,click};
}
test('desktop Import opens its picker synchronously and retains exact File/handle identities',async()=>{
 const q=context(),file={name:'MDT.tif'},handle={kind:'file',getFile:async()=>file};let selected=false;
 q.ctx.showOpenFilePicker=opts=>{selected=true;q.pickers.push(opts);return Promise.resolve([handle])};
 const event={isTrusted:false,preventDefault(){this.prevented=true}},pending=q.inputs.fileIn.handlers.click(event);assert(selected,'picker must run before first await');await pending;
 assert.equal(event.prevented,true);assert.equal(q.pickers[0].multiple,true);assert.equal(q.captured[0][0],file);assert.equal(q.captured[0][1],handle);assert.equal(q.imported[0].files[0],file);assert.equal(q.inputs.fileIn.value,'');q.ctx.__file=file;assert.equal(await vm.runInContext('projectDroppedHandles.get(__file)',q.ctx),handle);
});

test('native import starts in the active project location without awaiting storage',async()=>{
 const q=context(),project={kind:'file',name:'Projeto.ccmgis'};q.ctx.GeoMineProjectTabSession={pickerStartIn:()=>project};await q.click();assert.equal(q.pickers[0].startIn,project);
});
test('both ortho locate inputs keep their existing change handlers and capture capabilities',async()=>{
 for(const id of ['ortoReligarFile','imgReligarFile']){const q=context(),file={name:'Orto.tif'},handle={kind:'file',getFile:async()=>file};let change;
  q.inputs[id].onchange=function(e){change=e;assert.equal(this,q.inputs[id])};q.ctx.showOpenFilePicker=options=>{q.pickers.push(options);return Promise.resolve([handle])};await q.click(id);
  assert.equal(q.pickers[0].multiple,false);assert.equal(change.target.files[0],file);assert.equal(q.captured[0][1],handle);assert.equal(q.imported.length,0);
 }
});
test('mobile, unsupported browsers and non-gesture clicks retain native input behavior',async()=>{
 for(const mode of ['mobile','unsupported','inactive','recused']){const q=context();if(mode==='mobile')q.ctx.navigator.userAgent='Android';if(mode==='unsupported')delete q.ctx.showOpenFilePicker;if(mode==='inactive')q.ctx.navigator.userActivation.isActive=false;if(mode==='recused')q.ctx.fsMarcaRecusa({name:'SecurityError'});
  const native=q.inputs.fileIn.click,event=await q.click();assert(!event.prevented);assert.equal(q.inputs.fileIn.click,native);assert.equal(q.pickers.length,0);assert.equal(q.imported.length,0);
 }
});
test('project/generation changes and replaced ortho discard delayed selections',async()=>{
 for(const mode of ['project','generation','ortho']){const q=context(),file={name:'old.tif'};let resolve;q.ctx.showOpenFilePicker=()=>new Promise(r=>resolve=r);q.inputs.ortoReligarFile.onchange=()=>q.imported.push('bad');const pending=q.click(mode==='ortho'?'ortoReligarFile':'fileIn');if(mode==='project')q.ctx.S.projectId='B';else if(mode==='generation')q.ctx.GeoMineSessionAutosave.state.generation++;else q.ctx.S.img={name:'new'};resolve([{kind:'file',getFile:async()=>file}]);await pending;assert.equal(q.captured.length,0);assert.equal(q.imported.length,0);}
});
test('cancel is quiet and denied desktop handles offer a fresh simple-picker gesture',async()=>{
 const q=context();q.ctx.showOpenFilePicker=()=>Promise.reject({name:'AbortError'});await q.click();assert.equal(q.messages.length,0);
 let retry;q.ctx.fsSeletorSimples=action=>{retry=action};q.ctx.showOpenFilePicker=()=>Promise.resolve([{kind:'file',getFile:async()=>{throw {name:'NotAllowedError'}}}]);await q.click();assert.equal(typeof retry,'function');await retry();assert(!q.inputs.fileIn.lastClick.prevented);assert.equal(q.imported.length,0);
});
test('dropped files capture the exact capability without reconstructing a pathname',async()=>{
 const q=context(),file={name:'duplicate.tif'},handle={kind:'file',getFile:async()=>file};const files=q.ctx.projectCaptureDroppedFiles({items:[{kind:'file',getAsFile:()=>file,getAsFileSystemHandle:async()=>handle}]});q.ctx.__file=file;await vm.runInContext('projectDroppedHandles.get(__file)',q.ctx);assert.equal(files[0],file);assert.equal(q.captured[0][0],file);assert.equal(q.captured[0][1],handle);
});
function importContext(rgb){
 const q=context(),raw={name:'Original.tif',size:10},buffer={name:'temporary-read-buffer.tif',size:10};Object.assign(q.ctx,{ensureGeoTIFF:async()=>{},showLoad(){},hideLoad(){},checaArquivoLegivel:async()=>{},rasterImportOpen:async()=>({getImage:async()=>({getSamplesPerPixel:()=>rgb?3:1})}),rasterImportWait:async p=>await p,bufferFonte:async()=>buffer,refreshUI(){},fitAll(){},rasterImportError:e=>e,matchMedia:()=>({matches:false})});
 q.ctx.GeoMineOriginalSources.rememberFile=async(item,kind,file)=>q.imported.push({item,kind,file});q.ctx.addRasterFromTIFF=async()=>{const r={name:'MDT'};q.ctx.S.rasters.push(r);return r};q.ctx.addRGBFromTIFF=async()=>{q.ctx.S.img={name:'new ortho'}};vm.runInContext(source.slice(source.indexOf('function legacyOrthoPreviewForImport('),source.indexOf('/* detecta tipo pelos primeiros bytes')),q.ctx);return {...q,raw,buffer};
}
test('successful TIFF imports remember original Files rather than temporary decoded sources',async()=>{
 for(const rgb of [false,true]){const q=importContext(rgb);await q.ctx.handleFiles([q.raw]);assert.equal(q.imported.length,1);assert.equal(q.imported[0].file,q.raw);assert.equal(q.imported[0].kind,rgb?'ortho':'raster');assert.equal(q.imported[0].item,rgb?q.ctx.S.img:q.ctx.S.rasters[0]);assert.equal(q.messages.length,0);}
});
test('TIFF completion never remembers a target after import cancellation or project generation changes',async()=>{
 for(const mode of ['cancel','project','generation','removed']){const q=importContext(false);q.ctx.addRasterFromTIFF=async()=>{const r={name:'old'};q.ctx.S.rasters.push(r);if(mode==='cancel')q.ctx.S._rasterImportController.abort();if(mode==='project')q.ctx.S.projectId='B';if(mode==='generation')q.ctx.GeoMineSessionAutosave.state.generation++;if(mode==='removed')q.ctx.S.rasters=[];return r};await q.ctx.handleFiles([q.raw]);assert.equal(q.imported.length,0);}
});
function legacyOrthoImport(){
 const q=importContext(true),b=[500000,6900000,500100,6900200],aliases=[],order=[],relinks=[];
 const previous={name:'Orto — prévia',src:{file:'Original.tif'},url:'data:image/jpeg;base64,legacy',b:[...b],_sourceCRS:'EPSG:31982'};
 const target={name:'Original',src:{file:'Original.tif'},url:'data:image/png;base64,native',b:[...b],_sourceCRS:'EPSG:31982'};
 const header={getSamplesPerPixel:()=>3,getWidth:()=>1000,getHeight:()=>1000,getBoundingBox:()=>[...b],getGeoKeys:()=>({ProjectedCSTypeGeoKey:31982})};
 q.ctx.S.img=previous;q.ctx.S.workCRS='EPSG:31982';q.ctx.projectNativePreview=item=>item.url;
 q.ctx.rasterImportOpen=async()=>({getImage:async()=>header});
 q.ctx.addRGBFromTIFF=async()=>{q.ctx.S.img=target;return target;};
 q.ctx.ortoReligarTIFF=async(file,options)=>{relinks.push({file,options});order.push('relink');previous._img0=header;previous._tiff={};return options.isCurrent();};
 q.ctx.GeoMineOriginalSources.validated=(item,kind,before)=>{aliases.push({item,kind,before});order.push('validated');};
 q.ctx.GeoMineOriginalSources.rememberFile=async(item,kind,file)=>{q.imported.push({item,kind,file});order.push('remember');};
 return {...q,previous,target,header,b,aliases,order,relinks};
}
test('matching legacy JPEG reattaches its native TIFF in place before remembering it',async()=>{
 const q=legacyOrthoImport();q.previous.src.file='C:\\originais\\ORTOFO\u0301TO.TIF';q.raw.name='Ortofóto.tif';
 const saved=JSON.stringify({url:q.previous.url,b:q.previous.b,name:q.previous.name,src:q.previous.src});
 q.ctx.bufferFonte=async()=>{throw Error('Matching legacy import must not buffer or decode its TIFF again');};
 q.ctx.addRGBFromTIFF=async()=>{throw Error('Matching legacy import must not rebuild its preview');};
 q.header.readRasters=async()=>{throw Error('Header-only reattachment cannot decode TIFF strips');};
 const result=await q.ctx.handleFiles([q.raw]);assert.equal(result.ok,true);assert.equal(q.ctx.S.img,q.previous);assert.equal(JSON.stringify({url:q.previous.url,b:q.previous.b,name:q.previous.name,src:q.previous.src}),saved);
 assert.equal(q.relinks.length,1);assert.equal(q.relinks[0].file,q.raw);assert.equal(q.relinks[0].options.restoreNative,true);
 assert.equal(q.aliases.length,1);assert.equal(q.aliases[0].item,q.previous);assert.equal(q.aliases[0].kind,'ortho');assert.equal(q.aliases[0].before,q.previous.url);assert.deepEqual(q.order,['relink','validated','remember']);assert.equal(q.imported[0].file,q.raw);assert.equal(q.imported[0].item,q.previous);assert.equal(q.messages.length,0);
});
test('legacy matching tolerates one native pixel per axis, independently of preview dimensions',async()=>{
 const q=legacyOrthoImport();q.previous.b=q.b.map((v,i)=>v+(i%2?0.19:0.09));q.previous._w=10;q.previous._h=20;
 await q.ctx.handleFiles([q.raw]);assert.equal(q.aliases.length,1);
});
test('legacy fast path reattaches the staged source but persists the originally selected File',async()=>{
 const q=legacyOrthoImport();q.ctx.GeoMineOriginalSources.stageFile=async()=>q.buffer;
 q.ctx.GeoMineImportHandoff.presentRaster=(item,kind)=>{assert.equal(item,q.previous);assert.equal(kind,'I');q.order.push('present');};
 const result=await q.ctx.handleFiles([q.raw]);assert.equal(result.ok,true);assert.equal(q.relinks[0].file,q.buffer);assert.equal(q.imported[0].file,q.raw);assert.deepEqual(q.order,['relink','present','validated','remember']);
});
test('failed native reattachment reports failure and never silently falls through to a full import',async()=>{
 for(const mode of ['false','throw']){
  const q=legacyOrthoImport(),released=[];q.ctx.GeoMineRasterImport={release:t=>released.push(t)};
  q.ctx.ortoReligarTIFF=async()=>{if(mode==='throw')throw Error('header read failed');return false;};
  q.ctx.addRGBFromTIFF=async()=>{throw Error('unexpected full decode');};
  const result=await q.ctx.handleFiles([q.raw]);assert.equal(result.ok,false,mode);assert.equal(result.failures.length,1,mode);assert.equal(q.ctx.S.img,q.previous);assert.equal(q.imported.length,0);assert.equal(q.aliases.length,0);assert.equal(released.length,1);assert(q.messages.some(m=>/Falha|não foi concluída/.test(m)));
 }
});
test('same filename never aliases an incompatible extent, CRS or unknown native georeference',async()=>{
 for(const mismatch of ['x','y','nativeCRS','savedCRS','workCRS','missingCRS','customCRS','width','badBounds','emptyBounds']){
  const q=legacyOrthoImport();
  if(mismatch==='x')q.previous.b[0]+=0.11;
  if(mismatch==='y')q.previous.b[3]+=0.21;
  if(mismatch==='nativeCRS')q.header.getGeoKeys=()=>({ProjectedCSTypeGeoKey:31983});
  if(mismatch==='savedCRS')q.previous._sourceCRS='EPSG:31983';
  if(mismatch==='workCRS')q.ctx.S.workCRS='EPSG:31983';
  if(mismatch==='missingCRS')q.header.getGeoKeys=()=>({});
  if(mismatch==='customCRS')q.header.getGeoKeys=()=>({ProjectedCSTypeGeoKey:32767,GeographicTypeGeoKey:4326});
  if(mismatch==='width')q.header.getWidth=()=>0;
  if(mismatch==='badBounds')q.previous.b[0]=NaN;
  if(mismatch==='emptyBounds'){q.header.getWidth=()=>1;q.previous.b[0]=q.previous.b[2];}
  await q.ctx.handleFiles([q.raw]);assert.equal(q.aliases.length,0,mismatch);assert.equal(q.relinks.length,0,mismatch);assert.equal(q.imported.length,1,mismatch+' still imports normally');assert.equal(q.ctx.S.img,q.target,mismatch);
 }
});
test('new imports and known descriptors do not acquire a legacy preview alias',async()=>{
 for(const mismatch of ['fresh','otherName','copySuffix','extension','noFilename','descriptor','nativeDescriptor']){
  const q=legacyOrthoImport();
  if(mismatch==='fresh')q.ctx.S.img=null;
  if(mismatch==='otherName')q.previous.src.file='Other.tif';
  if(mismatch==='copySuffix')q.raw.name='Original (1).tif';
  if(mismatch==='extension')q.raw.name='Original.tiff';
  if(mismatch==='noFilename')delete q.previous.src;
  if(mismatch==='descriptor')q.previous.originalSource={v:1,kind:'ortho',fingerprint:'known'};
  if(mismatch==='nativeDescriptor')q.previous.projectNativeSource={v:1,fingerprint:'known'};
  await q.ctx.handleFiles([q.raw]);assert.equal(q.aliases.length,0,mismatch);assert.equal(q.relinks.length,0,mismatch);assert.equal(q.imported.length,1,mismatch);assert.equal(q.ctx.S.img,q.target,mismatch);
 }
});
test('legacy reattachment is discarded when its preview, bounds or import ownership changes',async()=>{
 for(const changed of ['preview','bounds','sourceName','cancel','project','generation','replaced']){
  const q=legacyOrthoImport();q.ctx.ortoReligarTIFF=async()=>{
   if(changed==='preview')q.previous.url='another preview';
   if(changed==='bounds')q.previous.b[0]+=0.01;
   if(changed==='sourceName')q.previous.src.file='Else.tif';
   if(changed==='cancel')q.ctx.S._rasterImportController.abort();
   if(changed==='project')q.ctx.S.projectId='B';
   if(changed==='generation')q.ctx.GeoMineSessionAutosave.state.generation++;
   if(changed==='replaced')q.ctx.S.img={name:'different active ortho'};
   return true;
  };
  await q.ctx.handleFiles([q.raw]);assert.equal(q.aliases.length,0,changed);assert.equal(q.imported.length,0,changed);
 }
});

test('real source resolver reopens only the matching saved legacy preview after an import',async()=>{
 const actual=fs.readFileSync(__dirname+'/original-sources.js','utf8');
 const install=(ctx,db)=>{
  Object.assign(ctx,{idbGet:async key=>db.get(key),idbSet:async(key,value)=>db.set(key,value),projectNativeFingerprint:async f=>f.size+':verified-test-bytes'});
  vm.runInContext(actual,ctx);return ctx.GeoMineOriginalSources;
 };
 for(const mismatch of [null,'bounds','CRS']){
  const q=legacyOrthoImport(),db=new Map();
  if(mismatch==='bounds')q.previous.b[0]+=100;
  if(mismatch==='CRS')q.previous._sourceCRS='EPSG:31983';
  const saved=JSON.parse(JSON.stringify(q.previous)),api=install(q.ctx,db),h={kind:'file',getFile:async()=>q.raw,queryPermission:async()=> 'granted'};
  api.capture(q.raw,h);await q.ctx.handleFiles([q.raw]);assert(q.ctx.S.img.originalSource,'import must persist its own original');
  const reopened=legacyOrthoImport();reopened.ctx.S.img=saved;const fresh=install(reopened.ctx,db),resolved=await fresh.resolve(saved,'ortho');
  if(mismatch)assert.equal(resolved,null,mismatch);
  else{assert.equal(resolved.file,q.raw);assert.equal(fresh.adopt(saved,'ortho',resolved),true);assert.equal(saved.originalSource.preview,saved.url);}
 }
});

test('legacy source handle storage also remembers the raster and respects delayed project changes',async()=>{
 const hydro=fs.readFileSync(path.resolve(__dirname,'../../core/parts/19-hydrology-and-flooding.js'),'utf8'),snippet=hydro.slice(hydro.indexOf('async function lembraFonte('),hydro.indexOf('async function recuperaFonte('));
 for(const changed of [false,true]){const q=context(),file={name:'native.tif'},r={name:'MDT',_projectSourceRaw:file},handle={kind:'file'};q.ctx.S.rasters=[r];q.ctx.fonteKey=()=> 'legacy';q.ctx.idbSet=async()=>{if(changed)q.ctx.S.projectId='B'};q.ctx.GeoMineOriginalSources.remember=(...args)=>q.imported.push(args);vm.runInContext(snippet,q.ctx);await q.ctx.lembraFonte(r,handle);assert.equal(q.imported.length,changed?0:1);if(!changed)assert.deepEqual(q.imported[0],[r,'raster',handle,file]);}
});
