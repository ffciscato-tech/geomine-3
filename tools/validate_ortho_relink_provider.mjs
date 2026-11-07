import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const between=(source,start,end)=>{
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,start);return source.slice(a,b);
};
const hydro=read('src/core/parts/19-hydrology-and-flooding.js');
const helpers=between(hydro,'function rasterImportCheck(','/* Muitos GeoTIFFs');
const relink=between(read('src/core/parts/20-raster-dem.js'),
  'async function ortoReligarTIFF(','\n/* ============================================================================');
const noop=()=>{};

function fixture(){
  const calls={opened:0,copies:0,reads:0,overviews:0,applied:0,released:0,stable:0,hd:0},
    file=new Blob(['provider TIFF']);
  Object.defineProperties(file,{size:{value:75*1024*1024},name:{value:'original.tif'},
    arrayBuffer:{value:()=>{throw Error('unexpected whole-file read');}}});
  const bounds=[500000,7400000,508192,7404096],descriptor={v:1},
    original={name:'Área preservada',url:'saved-preview',overlay:{},b:bounds,visible:false,
      opacity:0.43,_crsFixo:'EPSG:31982',projectFile:'ALAGIS/rasters/original.tif',
      projectNativeSource:descriptor,projectSavedAt:'yesterday'};
  const image={getWidth:()=>8192,getHeight:()=>4096,getBoundingBox:()=>bounds,
    getSamplesPerPixel:()=>4,getGDALNoData:()=>0,getTileWidth:()=>256,getTileHeight:()=>256,
    fileDirectory:{TileWidth:256}};
  const overview={...image,getWidth:()=>2048,getHeight:()=>1024};
  const tiff={getImage:async()=>image,getImageCount:async()=>2};
  const c={Blob,ArrayBuffer,Uint8Array,Uint16Array,Int16Array,Uint8ClampedArray,console,
    setTimeout,clearTimeout,EH_MOVEL:true,navigator:{userAgent:'Android',deviceMemory:8},
    S:{img:original,projectId:'A',workCRS:'EPSG:31982',orthoHD:false},
    GeoMineSessionAutosave:{state:{generation:1}},
    showLoad:noop,hideLoad:noop,toast:noop,cmdLog:noop,ensureGeoTIFF:async()=>{},
    document:{createElement:()=>({getContext:()=>({createImageData:(w,h)=>
      ({width:w,height:h,data:new Uint8ClampedArray(w*h*4)})})}),getElementById:()=>null},
    imgResInfoSync:noop,syncImgPanel:noop,orthoHDReset:noop,
    syncOrthoTiles:()=>{calls.hd++;assert.equal(c.S.img._img0,image);},
    map:{removeLayer:noop,hasLayer:()=>true},
    GeoTIFF:{fromBlob:()=>{throw Error('uncached source opened');}},
    GeoMineRasterSource:{wait:async p=>p,prepare:async()=>{calls.copies++;throw Error('copy before commit');}},
    GeoMineRasterImport:{open:async source=>{
      calls.opened++;assert.equal(source,file);if(c.afterOpen)c.afterOpen();return tiff;
    },release:source=>{assert.equal(source,tiff);calls.released++;}},
    GeoMineOrthoFirstFrame:{previewLimit:()=>1024,stabilize:(source,raw,item)=>{
      assert.equal(source,tiff);assert.equal(raw,file);assert.equal(item,original);
      assert.equal(calls.applied,1);assert.equal(calls.hd,1);calls.stable++;
      // Preparation intentionally remains unresolved: relink must not await it.
      item._sourcePreparation=new Promise(()=>{});
    }},
    GeoMineTileRuntime:{overview:async (source,base,width,height,dpp)=>{
      calls.overviews++;assert.equal(source,tiff);assert.equal(base,image);
      if(c.overviewError)throw Object.assign(new Error('provider failure'),{name:c.overviewError});
      assert.equal(width,8192);assert.equal(height,4096);assert.equal(dpp,8);return {im:overview};
    },read:async (im,options,control)=>{
      calls.reads++;assert.equal(im,overview);assert.equal(options.resampleMethod,'bilinear');
      assert.equal(options.width,1024);assert.equal(options.height,512);assert.equal(control.isCurrent(),true);
      const bands=[45,67,89,255].map(v=>new Uint8Array(options.width*options.height).fill(v));
      bands[3][0]=0;for(let s=0;s<3;s++)bands[s][1]=0;bands[0][2]=0;
      return bands;
    }},
    applyImgNoData:()=>{
      calls.applied++;if(c.failPreview)throw Error('canvas failed');
      c.S.img.url='rebuilt-preview';c.S.img.overlay={};return {pct:0};
    }
  };
  c.window=c;c.globalThis=c;vm.createContext(c);vm.runInContext(helpers+'\n'+relink,c);
  return {c,calls,file,tiff,image,original,bounds,descriptor};
}

{
  const f=fixture();assert.equal(await f.c.ortoReligarTIFF(f.file,{restoreNative:true}),true);
  const I=f.c.S.img;
  assert.equal(f.calls.copies,0);assert.equal(f.calls.opened,1);assert.equal(f.calls.overviews,1);
  assert.equal(f.calls.released,1);assert.equal(f.calls.stable,1);
  assert.equal(I._tiff,f.tiff);assert.equal(I._img0,f.image);assert.equal(I._sourceRaw,f.file);
  assert.equal(I._W0,8192);assert.equal(I._H0,4096);assert.equal(I._w,1024);assert.equal(I._h,512);
  assert.equal(I.b,f.bounds);assert.equal(I.opacity,0.43);assert.equal(I.visible,false);
  assert.equal(I.name,'Área preservada');assert.equal(I._sourceCRS,'EPSG:31982');
  assert.equal(I.projectNativeSource,f.descriptor);assert.equal(I.projectFile,'ALAGIS/rasters/original.tif');
  assert.equal(I._id.data[3],0);assert.equal(I._id.data[7],0);assert.equal(I._id.data[11],255);
  assert.deepEqual(Array.from(I._id.data.slice(8,12)),[0,67,89,255]);
  assert.equal(f.c.S.orthoHD,true);
  console.log('PASS Android 75 MiB relink uses cached range adapter, bounded preview and full native source; stable copy follows commit');
}
{
  const f=fixture();f.c.afterOpen=()=>{f.c.GeoMineSessionAutosave.state.generation++;};
  assert.equal(await f.c.ortoReligarTIFF(f.file),false);assert.equal(f.calls.reads,0);
  assert.equal(f.calls.stable,0);assert.equal(f.original.url,'saved-preview');
  console.log('PASS stale project is rejected before preview reconstruction');
}
{
  const f=fixture();f.c.failPreview=true;
  assert.equal(await f.c.ortoReligarTIFF(f.file),false);assert.equal(f.calls.stable,0);
  assert.equal(f.original.url,'saved-preview');assert.equal(f.original._sourceRaw,undefined);
  assert.equal(f.original.projectNativeSource,f.descriptor);
  console.log('PASS failed preview restores prior state and never starts stabilization');
}
for(const name of ['AbortError','TimeoutError','NotReadableError']){
  const f=fixture();f.c.overviewError=name;
  assert.equal(await f.c.ortoReligarTIFF(f.file),false);assert.equal(f.calls.overviews,1);
  assert.equal(f.calls.reads,0);assert.equal(f.calls.applied,0);assert.equal(f.calls.stable,0);
  assert.equal(f.original.url,'saved-preview');
  console.log('PASS '+name+' selecting overview never falls back to reading the whole native image');
}
