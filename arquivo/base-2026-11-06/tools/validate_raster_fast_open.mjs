import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const hydrology=read('src/core/parts/19-hydrology-and-flooding.js');
const raster=read('src/core/parts/20-raster-dem.js');
const between=(source,start,end)=>{
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,start);return source.slice(a,b);
};
const importHelpers=between(hydrology,'function rasterImportCheck(','function bufferCap(){');
const bufferSource=importHelpers+between(hydrology,'function bufferCap(){','/* Muitos GeoTIFFs');
const importSource=source=>between(source,'async function addRGBFromTIFF(',
  '\n/* ============================================================================');
const relinkSource=between(raster,'async function ortoReligarTIFF(',
  '\n/* ============================================================================');
const noop=()=>{};
let checked=0;
async function check(name,test){await test();checked++;console.log('OK · '+name);}

function sourceContext(userAgent='Mozilla/5.0 (Macintosh)'){
  const notices=[],c={Blob,ArrayBuffer,Uint8Array,navigator:{userAgent,deviceMemory:8},
    toast:message=>notices.push(message),showLoad:message=>notices.push(message),setTimeout};
  vm.createContext(c);vm.runInContext(bufferSource,c);return {c,notices};
}
function trackedFile(size=8){
  let copies=0;const file=new Blob([Uint8Array.of(1,2,3,4,5,6,7,8)]);
  const arrayBuffer=file.arrayBuffer.bind(file);
  Object.defineProperties(file,{name:{value:'original.tif'},size:{value:size},
    arrayBuffer:{value:()=>{copies++;return arrayBuffer();}}});
  return {file,get copies(){return copies;}};
}

await check('desktop conserva File/Blob sem cópia integral automática',async()=>{
  const {c,notices}=sourceContext(),small=trackedFile(),large=trackedFile(1.2e9);
  assert.equal(await c.bufferFonte(small.file),small.file);
  assert.equal(await c.bufferFonte(large.file),large.file);
  assert.equal(small.copies,0);assert.equal(large.copies,0);assert.deepEqual(notices,[]);
  const bytes=new ArrayBuffer(8);assert.equal(await c.bufferFonte(bytes),bytes);
  const view=new Uint8Array(bytes);assert.equal(await c.bufferFonte(view),view);
});
await check('Android mantém cópia protegida pelo teto e aceita streaming explícito',async()=>{
  const {c,notices}=sourceContext('Mozilla Android'),small=trackedFile(),large=trackedFile(1.2e9);
  const bytes=await c.bufferFonte(small.file);
  assert.ok(bytes instanceof ArrayBuffer);assert.equal(small.copies,1);
  assert.deepEqual([...new Uint8Array(bytes)],[1,2,3,4,5,6,7,8]);
  assert.equal(await c.bufferFonte(large.file),large.file);assert.equal(large.copies,0);
  assert.ok(notices.some(message=>message.includes('acima do teto')));
  assert.equal(await c.bufferFonte(small.file,{copyToMemory:false}),small.file);assert.equal(small.copies,1);
});
await check('fallback explícito de cópia permanece disponível no desktop',async()=>{
  const {c}=sourceContext(),small=trackedFile(),large=trackedFile(1.2e9);
  assert.ok(await c.bufferFonte(small.file,{copyToMemory:true}) instanceof ArrayBuffer);
  assert.equal(small.copies,1);
  assert.equal(await c.bufferFonte(large.file,{copyToMemory:true}),large.file);
  assert.equal(large.copies,0);
});
await check('importador comum encaminha Blob ao GeoTIFF e aos loaders RGB/MDT',async()=>{
  const {c}=sourceContext(),file=trackedFile(),calls=[];
  const loading=read('src/core/parts/03-file-loading-qgis.js');
  const branch=between(loading,'          const header=await rasterImportOpen(f,control);',
    '\n        }\n        else if');
  c.GeoTIFF={fromBlob:async source=>{assert.equal(source,file.file);return {
    getImage:async()=>({getSamplesPerPixel:()=>c.samples})};},
    fromArrayBuffer:()=>{throw new Error('desktop não deve copiar fonte para ArrayBuffer');}};
  c.addRGBFromTIFF=async(...args)=>calls.push(['rgb',...args]);
  c.addRasterFromTIFF=async(...args)=>calls.push(['mdt',...args]);
  vm.runInContext(`async function dispatch(f){const control={};${branch}\n}`,c);
  c.samples=4;await c.dispatch(file.file);c.samples=1;await c.dispatch(file.file);
  assert.deepEqual(calls.map(call=>call[0]),['rgb','mdt']);
  for(const call of calls){assert.equal(call[1],file.file);assert.equal(call[2],'original.tif');assert.equal(call[3],8);}
  assert.equal(file.copies,0);
});

function fixture({runtime=true,supported=true,overview=true,sixteen=false}={}){
  const calls={native:[],runtime:[],overview:[],guards:[],source:[],apply:0};
  const createImage=(width,height)=>({
    fileDirectory:{TileWidth:256},
    getWidth:()=>width,getHeight:()=>height,getSamplesPerPixel:()=>4,
    getBoundingBox:()=>[500000,7400000,510000,7400010],getGDALNoData:()=>0,
    getTileWidth:()=>256,getTileHeight:()=>2,
    readRasters:async options=>{calls.native.push(options);return bands(width,height,options,false);}
  });
  const native=createImage(10000,10),reduced=createImage(5001,5),images=overview?[native,reduced]:[native];
  const tiff={getImage:async index=>images[index],getImageCount:async()=>images.length};
  function bands(width,height,options,floor){
    const win=options.window||[0,0,width,height],sw=win[2]-win[0],sh=win[3]-win[1];
    const w=options.width||sw,h=options.height||sh,ArrayType=sixteen?Uint16Array:Uint8Array;
    return options.samples.map(sample=>{
      const a=new ArrayType(w*h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const sx=win[0]+Math.min(sw-1,(floor?Math.floor:Math.round)(x*sw/w));
        const sy=win[1]+Math.min(sh-1,(floor?Math.floor:Math.round)(y*sh/h));
        const v=sample===3?(sx%11===0?0:255):(sx%7===0?0:(sx*13+sy*7+sample*17)%251);
        a[y*w+x]=sixteen?v*257:v;
      }
      return a;
    });
  }
  const c={console,Blob,ArrayBuffer,Uint8Array,Uint16Array,Int16Array,Uint8ClampedArray,
    Int32Array,Map,Object,Math,Number,isFinite,setTimeout,clearTimeout,
    TIFF_CHUNK_SAMPLES:10000*4*2,EH_MOVEL:false,
    navigator:{userAgent:'Mozilla/5.0 (Macintosh)',deviceMemory:8},
    S:{img:null,projectId:'A',workCRS:'EPSG:31982',orthoHD:false},
    GeoMineSessionAutosave:{state:{generation:1}},
    ensureGeoTIFF:async()=>{},bufferFonte:async f=>f,
    GeoTIFF:{fromBlob:async source=>{calls.source.push(source);return tiff;},
      fromArrayBuffer:async source=>{calls.source.push(source);return tiff;}},
    document:{createElement:()=>({getContext:()=>({createImageData:(w,h)=>
      ({width:w,height:h,data:new Uint8ClampedArray(w*h*4)})})}),getElementById:()=>null},
    toWGS:(_crs,x,y)=>[x,y],wgsBoundsOK:()=>true,CRS_LABELS:{},
    registraOrtoParaDrape:noop,map:{removeLayer:noop,hasLayer:()=>true},
    showLoad:noop,hideLoad:noop,toast:noop,cmdLog:noop,refreshUI:noop,safeFit:noop,
    syncOrthoTiles:noop,orthoHDReset:noop,imgResInfoSync:noop,syncImgPanel:noop,
    applyImgNoData:()=>{calls.apply++;c.S.img.url='preview';
      c.S.img.overlay={getBounds:()=>[[0,0],[1,1]]};return {pct:0};}
  };
  if(runtime)c.GeoMineTileRuntime={
    overview:async(...args)=>{calls.overview.push(args);return {im:overview?reduced:native,fx:1,fy:1};},
    canReadResampled:(im,options)=>{calls.guards.push({im,options});return supported;},
    read:async(im,options,control={})=>{
      calls.runtime.push({im,options,control});
      if(c.beforeRead)await c.beforeRead(control);
      if(control.isCurrent&&!control.isCurrent())throw Object.assign(new Error('stale'),{name:'AbortError'});
      return options.width?bands(im.getWidth(),im.getHeight(),options,control.nearestFloor===true)
        :im.readRasters(options);
    }
  };
  c.window=c;c.globalThis=c;vm.createContext(c);
  vm.runInContext(importHelpers+importSource(raster)+'\n'+relinkSource,c);
  return {c,calls,native,reduced,tiff};
}
for(const overview of [false,true])for(const sixteen of [false,true]){
  await check(`prévia rápida mantém pixels floor, alfa e NoData (${overview?'com':'sem'} overview; ${sixteen?16:8} bits)`,async()=>{
    const reference=fixture({runtime:false,overview,sixteen});
    const fast=fixture({overview,sixteen}),source=trackedFile().file;
    await reference.c.addRGBFromTIFF(source,'original.tif',source.size);
    await fast.c.addRGBFromTIFF(source,'original.tif',source.size);
    const before=reference.c.S.img,after=fast.c.S.img;
    assert.deepEqual(after._id.data,before._id.data);
    assert.equal(after._w,3333);assert.equal(after._h,3);
    assert.equal(after._w,before._w);assert.equal(after._h,before._h);
    assert.deepEqual(Array.from(after.b),Array.from(before.b));
    assert.equal(after._W0,10000);assert.equal(after._H0,10);assert.equal(after._img0,fast.native);
    assert.equal(after._sourceRaw,source);assert.equal(after._tiff,fast.tiff);
    assert.equal(Object.getOwnPropertyDescriptor(after,'_sourceRaw').enumerable,false);
    assert.equal(fast.calls.native.length,0,'prévia rápida não pode materializar faixas nativas');
    assert.equal(fast.calls.runtime.length,1);assert.equal(fast.calls.overview.length,1);
    const job=fast.calls.runtime[0];assert.equal(job.control.nearestFloor,true);
    assert.equal(job.options.resampleMethod,'nearest');assert.equal(job.options.width,3333);assert.equal(job.options.height,3);
    assert.equal(fast.c.S.orthoHD,true);assert.equal(fast.calls.apply,1);
  });
}
await check('formatos sem leitura direta continuam em faixas limitadas',async()=>{
  const f=fixture({supported:false,overview:false}),source=trackedFile().file;
  await f.c.addRGBFromTIFF(source);
  assert.equal(f.calls.guards.length,1);assert.ok(f.calls.native.length>1);
  for(const options of f.calls.native){
    assert.equal(options.width,undefined);assert.equal(options.height,undefined);
    assert.ok(options.window[3]-options.window[1]<=2);
  }
  assert.equal(f.calls.runtime.length,f.calls.native.length,'faixas também reutilizam fila/cache');
  const ref=fixture({runtime:false,overview:false});await ref.c.addRGBFromTIFF(source);
  assert.deepEqual(f.c.S.img._id.data,ref.c.S.img._id.data);
});
await check('ausência do runtime conserva o loader por faixas',async()=>{
  const current=fixture({runtime:false}),source=trackedFile().file;
  await current.c.addRGBFromTIFF(source);
  assert.ok(current.calls.native.length>1);assert.equal(current.calls.runtime.length,0);
  const I=current.c.S.img;
  for(let y=0;y<I._h;y++)for(let x=0;x<I._w;x++){
    const sx=Math.floor(x*5001/3333),sy=Math.floor(y*5/3),k=(y*I._w+x)*4;
    for(let sample=0;sample<3;sample++)
      assert.equal(I._id.data[k+sample],sx%7===0?0:(sx*13+sy*7+sample*17)%251);
    assert.equal(I._id.data[k+3],sx%7===0||sx%11===0?0:255);
  }
});
function priorOrtho(){return {name:'Preservar nome',url:'anterior',overlay:{},b:[500000,7400000,510000,7400010],
  visible:true,_sourceCRS:'EPSG:31982',_crsFixo:'EPSG:31982',projectFile:'ALAGIS/rasters/original.tif',
  projectSavedAt:'ontem',projectNativeSource:{v:1},opacity:0.4};}
await check('relink encaminha bilinear e conserva fonte, bounds e descriptor na restauração',async()=>{
  const f=fixture(),source=trackedFile().file,I=priorOrtho();f.c.S.img=I;
  const saved=I.projectNativeSource,bounds=I.b;
  assert.equal(await f.c.ortoReligarTIFF(source,{restoreNative:true}),true);
  const job=f.calls.runtime[0];assert.equal(job.options.resampleMethod,'bilinear');
  assert.equal(job.control.nearestFloor,undefined);assert.equal(typeof job.control.isCurrent,'function');
  assert.equal(job.control.isCurrent(),true);assert.equal(f.calls.native.length,0);
  assert.equal(I._sourceRaw,source);assert.equal(I.b,bounds);assert.equal(I.name,'Preservar nome');
  assert.equal(I._sourceCRS,'EPSG:31982');assert.equal(I.projectNativeSource,saved);
  assert.equal(I.projectFile,'ALAGIS/rasters/original.tif');assert.equal(I.projectSavedAt,'ontem');
});
await check('relink obsoleto é descartado sem trocar a ortofoto do outro projeto',async()=>{
  const f=fixture(),source=trackedFile().file,I=priorOrtho(),other=priorOrtho();f.c.S.img=I;
  f.c.beforeRead=async control=>{
    assert.equal(control.isCurrent(),true);f.c.S.img=other;f.c.GeoMineSessionAutosave.state.generation++;
  };
  assert.equal(await f.c.ortoReligarTIFF(source),false);
  assert.equal(f.c.S.img,other);assert.equal(I.url,'anterior');assert.equal(I._sourceRaw,undefined);
  assert.equal(f.calls.apply,0);assert.equal(other.url,'anterior');
});
await check('relink falho restaura descritores e fonte anterior',async()=>{
  const f=fixture(),source=trackedFile().file,I=priorOrtho(),old=trackedFile().file;f.c.S.img=I;
  Object.defineProperty(I,'_sourceRaw',{value:old,writable:true,configurable:true});
  f.c.applyImgNoData=()=>{throw new Error('canvas indisponível');};
  assert.equal(await f.c.ortoReligarTIFF(source),false);
  assert.equal(I._sourceRaw,old);assert.equal(I.url,'anterior');
  assert.equal(I.projectFile,'ALAGIS/rasters/original.tif');assert.equal(I._img0,undefined);
  assert.equal(Object.getOwnPropertyDescriptor(I,'_sourceRaw').enumerable,false);
});

await check('loader integrado usa runtime real e preserva pixels de TIFF vendorizado',async()=>{
  const require=createRequire(import.meta.url),previousWorker=globalThis.Worker;
  globalThis.Worker=class{constructor(){throw new Error('Worker inesperado no teste');}};
  let GeoTIFF;
  try{GeoTIFF=require(path.join(root,'src/vendor/geotiff.min.js'));}
  finally{if(previousWorker===undefined)delete globalThis.Worker;else globalThis.Worker=previousWorker;}
  const width=10000,height=16,channels=4,data=new Uint8Array(width*height*channels);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const k=(y*width+x)*channels;
    data[k]=x%251;data[k+1]=(x+y*5)%251;data[k+2]=(x*3+y)%251;data[k+3]=x%11?255:0;
  }
  const source=GeoTIFF.writeArrayBuffer(data,{width,height,SamplesPerPixel:4,BitsPerSample:[8,8,8,8],
    SampleFormat:[1,1,1,1],ExtraSamples:[2],
    ModelPixelScale:[1,1,0],ModelTiepoint:[0,0,0,500000,7400016,0],ProjectedCSTypeGeoKey:31982});
  const before=fixture({runtime:false}),after=fixture({runtime:false});
  let legacyReads=0,fastLibraryReads=0;
  const library=count=>({...GeoTIFF,fromArrayBuffer:async bytes=>{
    const tiff=await GeoTIFF.fromArrayBuffer(bytes),getImage=tiff.getImage.bind(tiff);
    tiff.getImage=async index=>{
      const image=await getImage(index),readRasters=image.readRasters.bind(image);
      image.readRasters=options=>{count();return readRasters(options);};return image;
    };
    return tiff;
  }});
  before.c.GeoTIFF=library(()=>legacyReads++);after.c.GeoTIFF=library(()=>fastLibraryReads++);
  vm.runInContext(read('src/modules/raster/tile-runtime.js'),after.c);
  await before.c.addRGBFromTIFF(source,'fixture.tif',source.byteLength);
  await after.c.addRGBFromTIFF(source,'fixture.tif',source.byteLength);
  assert.deepEqual(after.c.S.img._id.data,before.c.S.img._id.data);
  assert.deepEqual(Array.from(after.c.S.img.b),Array.from(before.c.S.img.b));
  assert.equal(after.c.S.img._sourceRaw,source);
  assert.ok(legacyReads>1);assert.equal(fastLibraryReads,0);
  const stats=after.c.GeoMineTileRuntime.stats();assert.equal(stats.sampledReads,1);
  assert.equal(stats.sampledValues,3333*5*4);assert.ok(stats.sampledBlocks>0);
});

console.log(`${checked} verificações de abertura GeoTIFF concluídas.`);
