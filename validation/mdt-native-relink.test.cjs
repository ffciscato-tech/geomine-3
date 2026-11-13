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
 section(core19,'const RASTER_LEGACY_VERIFY_LIMITS=','/* ---------------------------------------------------------------------------\n   pedeFonte')
].join('\n');
function gate(){let enter,release;const started=new Promise(r=>enter=r),promise=new Promise(r=>release=r);return {started,release,async wait(){enter();await promise;}};}
function original(bytes=[1,2,3,4,5,6,7,8]){
 const file=new Blob([Uint8Array.from(bytes),new Uint8Array(256)]);
 Object.defineProperties(file,{name:{value:'MDT.tif'},lastModified:{value:1234}});return file;
}
function grid(){return {nc:2,nr:2,cs:1,csy:2,xll:500000,yll:6900000,
 z:new Float32Array([100,101,102,103]),fromProject:true,resampled:4,srcCRS:'EPSG:31982',srcDims:[4,8]};}
function fixture(){
 const calls={opens:0,parse:0,reads:0,close:0,release:0,render:0,refresh:0,validated:0,toasts:[],warnings:[]},gates={};
 const state={generation:1},S={projectId:'A',workCRS:'EPSG:31982',layers:[{id:1}],rasters:[],hidro:{dem:null}};
 const file=original(),r={id:7,name:'Terrain',d:grid(),src:{file:file.name},demHD:false,dispFull:false};S.rasters.push(r);
 const image={fileDirectory:{BitsPerSample:[32],SamplesPerPixel:1,RowsPerStrip:8,StripOffsets:[8],StripByteCounts:[128]},getBoundingBox:()=>[500000,6900000,500002,6900004],getWidth:()=>4,getHeight:()=>8,
  getSamplesPerPixel:()=>1,getGDALNoData:()=>-9999,async readRasters(){calls.reads++;return [new Float32Array([100,101,102,103])];}};
 const tiff={async getImage(index=0){if(index>0)throw Error('No image at index '+index);if(gates.header)await gates.header.wait();if(f.headerError)throw f.headerError;return image;},async close(){calls.close++;}};
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

/* Regra desde 12/11/2026: um arquivo que não é o gravado no projeto, ou um
   vínculo antigo que deixou de valer, não é mais recusado de saída (a pessoa
   ficava sem MDT e sem saber por quê). O TIFF passa pela conferência de CRS e
   área, e quem decide é a pessoa. Recusar não altera nada do projeto e o
   motivo fica registrado na camada. Nada é vinculado em silêncio. */
// asks(): a conferência automática das cotas fica inconclusiva (janelas sem
// dados), para o teste exercitar a pergunta. cotas(): o TIFF devolve, em cada
// janela, a cota da célula da prévia que ela cobre, mais um desvio.
const asks=(f,answer)=>{f.calls.questions=[];f.c.confirm=message=>{f.calls.questions.push(message);return answer;};
 f.image.readRasters=async()=>{f.calls.reads++;return [new Float32Array(0)];};};
const cotas=(f,desvio)=>{f.calls.questions=[];f.c.confirm=message=>{f.calls.questions.push(message);return true;};const z=Array.from(f.r.d.z);
 f.image.readRasters=async({window:[left,top,right,bottom]=[0,0,2,4]}={})=>{f.calls.reads++;
  return [new Float32Array((right-left)*(bottom-top)).fill(z[Math.floor(top/4)*2+Math.floor(left/2)]+desvio)];};};
test('a different file of the same area whose elevations match the saved surface is attached without asking',async()=>{
 const f=fixture();await f.identify();cotas(f,0.2);const preview=f.r.d.z;
 assert.equal(await f.c.religaFonte(f.r,original([9,8,7,6,5,4,3,2])),true);
 assert.equal(f.calls.questions.length,0,'same terrain: no question');assert.ok(f.calls.reads>=8);
 assert.equal(f.r.d._img0,f.image);assert.equal(f.r.d.z,preview,'the saved preview is kept');assert.equal(f.calls.parse,0,'the file is not decoded again');
 // Cotas diferentes: é outro MDT, e a pessoa é avisada antes de continuar.
 const g=fixture();await g.identify();cotas(g,50);
 g.c.parseTIFF=async()=>{g.calls.parse++;return {...grid(),z:new Float32Array([150,151,152,153]),_tiff:g.tiff,_img0:g.image,_W0:4,_H0:8,_bb:g.image.getBoundingBox(),_nd:-9999};};
 assert.equal(await g.c.religaFonte(g.r,original([9,8,7,6,5,4,3,2])),true);
 assert.equal(g.calls.questions.length,1);assert.match(g.calls.questions[0],/cotas dele diferem[\s\S]*Quer continuar\?/);assert.equal(g.calls.parse,1);assert.equal(g.r.d.z[0],150,'the layer now shows the chosen file');
});
test('a file other than the recorded original is attached only if the person confirms; declining preserves all project references',async()=>{
 const f=fixture();await f.identify();const before=snapshot(f);asks(f,false);
 assert.equal(await f.c.religaFonte(f.r,original([9,8,7,6,5,4,3,2])),false);unchanged(f,before);
 assert.equal(f.calls.questions.length,1);assert.match(f.calls.questions[0],/não é o mesmo arquivo gravado no projeto/);
 assert.equal(f.calls.parse,0);assert.equal(f.calls.close,f.calls.opens,'the header opened for the check is closed');
 assert.match(f.r._recusaOriginal.mensagem,/não foi vinculado/);
 assert.equal(Object.keys(f.r).includes('_recusaOriginal'),false,'the refusal note is never serialized with the layer');
 const g=fixture();await g.identify();asks(g,true);const other=original([9,8,7,6,5,4,3,2]),preview=g.r.d.z;
 assert.equal(await g.c.religaFonte(g.r,other),true);
 assert.equal(g.calls.questions.length,1);assert.equal(g.r.d._img0,g.image);assert.equal(g.r.d.z,preview,'the saved preview is kept');
 assert.equal(g.r._recusaOriginal,undefined);assert.equal(g.calls.parse,0);
});

test('edited or invalidated source identities ask the person instead of trusting an old elevation signature',async()=>{
 for(const kind of ['original','native'])for(const edit of ['cells','invalidated']){
  const f=fixture(),descriptor=await f.identify(kind);
  if(edit==='cells')f.r.d.z[0]=999;else descriptor.invalidated=true;
  const before=snapshot(f);asks(f,false);
  assert.equal(await f.c.religaFonte(f.r,f.file),false);unchanged(f,before);
  assert.equal(f.calls.questions.length,1);assert.match(f.calls.questions[0],/regravada ou editada depois do último vínculo/);
  assert.equal(f.calls.parse,0);assert.equal(f.calls.close,f.calls.opens);
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
  // A falha não estoura: fica escrita na camada, para as janelas mostrarem o motivo.
  assert.equal(await f.c.religaFonte(f.r,f.file),false);assert.match(f.r._recusaOriginal.mensagem,/não pôde ser lido|bandas|georrefer/);
  unchanged(f,before);assert.equal(f.calls.close,1);assert.equal(oldClosed,0);
 }
});

test('a legacy file with other content or extent is never refused outright: the person is asked, and continuing makes it the layer MDT',async()=>{
 for(const wrong of ['content','extent']){
  // Recusar a pergunta mantém o projeto intacto.
  const f=fixture(),before=snapshot(f);f.parsed=grid();asks(f,false);
  if(wrong==='content')f.parsed.z.fill(900);else f.parsed.csy=5;
  assert.equal(await f.c.religaFonte(f.r,f.file),false);unchanged(f,before);assert.equal(f.calls.parse,1);assert.equal(f.calls.close,1);
  assert.equal(f.calls.questions.length,1);assert.match(f.calls.questions[0],/é diferente do MDT[\s\S]*Quer continuar\?/);
  assert.match(f.r._recusaOriginal.mensagem,/você respondeu que não/);
  // Continuar troca a grade da camada pela do arquivo escolhido.
  const g=fixture();g.parsed=grid();asks(g,true);
  if(wrong==='content')g.parsed.z.fill(900);else g.parsed.csy=5;
  assert.equal(await g.c.religaFonte(g.r,g.file),true);assert.deepEqual(Array.from(g.r.d.z),Array.from(g.parsed.z));assert.equal(g.r.d.csy,g.parsed.csy);assert.equal(g.calls.questions.length,1);
  assert.equal(g.calls.close,0);assert.equal(g.calls.release,1);assert.equal(g.r.demHD,true);assert.equal(g.r._projectSourceRaw,g.file);
  assert.equal(g.r.src.file,g.file.name);assert.equal(g.r.projectSavePending,true);assert.equal(g.r._recusaOriginal,undefined);
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
