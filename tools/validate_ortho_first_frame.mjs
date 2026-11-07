import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/modules/raster/orthophoto-first-frame.js',import.meta.url),'utf8');
function fixture(){
 const calls={added:0,removed:0,fits:0,images:[],adopted:0,warnings:0};let now=1000;
 const c={Blob,AbortController,Uint16Array,Int16Array,Uint8ClampedArray,Map,console,setInterval,clearInterval,
  navigator:{userAgent:'Android'},performance:{now:()=>now},
  S:{projectId:'A',workCRS:'EPSG:31982',img:{old:true}},GeoMineSessionAutosave:{state:{generation:1}},
  document:{createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:id=>calls.images.push([...id.data])}),toDataURL:()=> 'data:image/png;base64,test'})},
  warpCanvasWM:(cv,b)=>({cv,b,wm:true}),reproj:(a,b,x,y)=>[x,y],wgsBoundsOK:()=>true,
  map:{getPane:()=>true,removeLayer:()=>calls.removed++},safeFit:()=>calls.fits++,
  L2:{imageOverlay:()=>({addTo(){calls.added++;return this;},getBounds:()=>[],setUrl:()=>{}})},
  cmdLog:()=>calls.warnings++,GeoMineRasterImport:{adoptSource:()=>{calls.adopted++;return true;}}
 };c.window=c;vm.createContext(c);vm.runInContext(source,c);
 return {c,calls,api:c.GeoMineOrthoFirstFrame,advance:()=>now+=1000};
}
function draw(preview){const bands=[Uint8Array.of(12,34),Uint8Array.of(24,45),Uint8Array.of(36,56),Uint8Array.of(255,0)];preview.block({bands,xs:[{out:0},{out:1}],ys:[{out:0}]});}
{
 const {c,calls,api,advance}=fixture(),old=c.S.img,controller=new AbortController(),p=api.create(2,1,[0,0,1,1],c.S.workCRS,null,controller.signal);
 draw(p);assert.equal(calls.added,1);assert.deepEqual(calls.images[0],[12,24,36,255,34,45,56,0]);assert.equal(c.S.img,old);
 draw(p);assert.equal(api.stats().frames,1);advance();draw(p);assert.equal(api.stats().frames,2);assert.equal(calls.fits,1);
 controller.abort();assert.equal(calls.removed,1);draw(p);p.dispose();assert.equal(calls.removed,1);assert.equal(api.stats().disposed,true);
 console.log('PASS progressive RGB/alpha, throttling, no project mutation and immediate abort cleanup');
}
{
 const {c,calls,api}=fixture(),p=api.create(2,1,[0,0,1,1],c.S.workCRS,null);
 c.GeoMineSessionAutosave.state.generation++;draw(p);assert.equal(calls.added,0);p.dispose();
 const q=api.create(2,1,[0,0,1,1],c.S.workCRS,null);q.rows(Uint8ClampedArray.of(1,2,3,255,4,5,6,255),0,1);assert.equal(calls.added,1);q.dispose();assert.equal(calls.removed,1);
 console.log('PASS stale project is ignored and strip fallback draws incrementally');
}
{
 const {c,calls,api}=fixture();let finish;const file=new Blob([new Uint8Array(1)]);Object.defineProperty(file,'size',{value:75*1024*1024});
 const tiff={},image={_sourceRaw:file,_tiff:tiff},stable=new Blob(['stable']);c.S.img=image;c.GeoMineRasterSource={prepare:()=>new Promise(resolve=>finish=resolve)};
 assert.equal(api.stabilize(tiff,file,image),undefined);assert.equal(calls.adopted,0);assert.equal(image._sourceRaw,file);
 finish(stable);assert.equal(await image._sourcePreparation,true);assert.equal(calls.adopted,1);assert.equal(image._sourceRaw,stable);
 image._sourceRaw=file;api.stabilize(tiff,file,image);c.S.projectId='B';finish(stable);assert.equal(await image._sourcePreparation,false);assert.equal(calls.adopted,1);
 c.GeoMineRasterSource.prepare=async()=>{throw Error('provider unavailable');};api.stabilize(tiff,file,image);assert.equal(await image._sourcePreparation,false);assert.equal(calls.warnings,1);
 console.log('PASS background stable copy does not block, respects project changes and handles failure');
}
{
 const {c,calls,api}=fixture();let finish;
 const file=new Blob(['original']);Object.defineProperty(file,'size',{value:75*1024*1024});
 const tiff={},image={_tiff:tiff,_sourceRaw:file};c.S.img=image;
 c.GeoMineRasterSource={prepare:()=>new Promise(resolve=>finish=resolve)};
 api.stabilize(tiff,file,image);const replacement=new Blob(['new source']);image._tiff={};image._sourceRaw=replacement;
 finish(new Blob(['old cached source']));assert.equal(await image._sourcePreparation,false);assert.equal(image._sourceRaw,replacement);assert.equal(calls.adopted,0);
 image._tiff=tiff;image._sourceRaw=file;api.stabilize(tiff,file,image);c.S.img={};finish(new Blob(['stale image']));
 assert.equal(await image._sourcePreparation,false);assert.equal(calls.adopted,0);
 console.log('PASS old stabilization cannot overwrite a new source or a replaced image');
}
{
 const {c,api}=fixture();c.navigator.deviceMemory=8;assert.equal(api.previewLimit(),1024);
 c.navigator.userAgent='Macintosh';assert.equal(api.previewLimit(),4096);
 c.navigator.userAgent='iPad';c.navigator.deviceMemory=4;assert.equal(api.previewLimit(),2560);
 console.log('PASS Android quick overview is limited independently of RAM; desktop/iOS unchanged');
}
const hydro=fs.readFileSync(new URL('../src/core/parts/19-hydrology-and-flooding.js',import.meta.url),'utf8');
{
 const start=hydro.indexOf('async function bufferFonte('),end=hydro.indexOf('/* Muitos GeoTIFFs',start);let copies=0;
 const c={Blob,navigator:{userAgent:'Android'},rasterImportCheck:()=>{},GeoMineRasterSource:{prepare:async f=>{copies++;return f;}}};c.globalThis=c;
 vm.createContext(c);vm.runInContext(hydro.slice(start,end),c);const file=new Blob(['test']);Object.defineProperty(file,'size',{value:75*1024*1024});
 assert.equal(await c.bufferFonte(file,{preferDirect:true}),file);assert.equal(copies,0);await c.bufferFonte(file,{});assert.equal(copies,1);
 console.log('PASS 75 MB RGB skips initial full copy; default DEM policy unchanged');
}
