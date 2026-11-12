'use strict';
// Synthetic TIFF directories and deterministic sample values. No user TIFF,
// project mutation, network, browser permission or oversized pixel allocation.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const packageParts=path.resolve(__dirname,'../src/core/parts');
const parts=fs.existsSync(packageParts)?packageParts:path.resolve(__dirname,'../updated/src/core/parts');
const core11=fs.readFileSync(path.join(parts,'11-geotiff-project-workspace.js'),'utf8');
const core19=fs.readFileSync(path.join(parts,'19-hydrology-and-flooding.js'),'utf8');
function section(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert(a>=0&&b>a,start);return source.slice(a,b);}
const code=[
 section(core11,'function projectNativeHash(','let PROJECT_NATIVE_SEQUENCE=0;'),
 section(core11,'const projectRasterRestores=new WeakMap();','async function projectRestoreNativeRaster('),
 section(core19,'function rasterImportCheck(','function rasterImportRows('),
 section(core19,'function assinaturaMDT(','async function lembraFonte('),
 section(core19,'function mesmaArea(','/* O GeoTIFF pode JÁ estar aberto'),
 section(core19,'const RASTER_LEGACY_VERIFY_LIMITS=','/* ---------------------------------------------------------------------------\n   pedeFonte')
].join('\n');
function gate(){let start,release;const entered=new Promise(r=>start=r),promise=new Promise(r=>release=r);return {entered,release,async wait(){start();await promise;}};}
function mean(values){let sum=0,count=0;for(const value of values)if(value!==-9999&&Number.isFinite(value)&&value>=-1e30){sum+=value;count++;}return count?Math.fround(sum/count):NaN;}
function fixture(){
 const calls={open:0,close:0,release:0,parse:0,reads:[],render:0,validated:0,toasts:[],warnings:[]};
 const state={generation:1},S={projectId:'legacy-A',workCRS:'EPSG:31982',layers:[{id:'vector'}],rasters:[],hidro:{dem:null}};
 const file={name:'synthetic-legacy.tif',size:0},images=[],gates={};let nextOffset=1024;
 function header(image,tileWidth=16,tileHeight=16){
  const count=Math.ceil(image.width/tileWidth)*Math.ceil(image.height/tileHeight),offsets=new Uint32Array(count),counts=new Uint32Array(count);
  for(let i=0;i<count;i++){offsets[i]=nextOffset;counts[i]=tileWidth*tileHeight*4;nextOffset+=counts[i];}
  image.fileDirectory={BitsPerSample:new Uint16Array([32]),SampleFormat:new Uint16Array([3]),SamplesPerPixel:1,Compression:1,
   ImageWidth:image.width,ImageLength:image.height,TileWidth:tileWidth,TileLength:tileHeight,TileOffsets:offsets,TileByteCounts:counts};
  file.size=Math.max(file.size,nextOffset);return image;
 }
 function makeImage(width,height,valueAt){
  const image={width,height,valueAt,getWidth(){return this.width;},getHeight(){return this.height;},getSamplesPerPixel:()=>1,
   getGeoKeys:()=>({ProjectedCSTypeGeoKey:31982}),getBoundingBox:()=>[500000,6900000,500121.25,6900362.5],getGDALNoData:()=>-9999,
   async readRasters(options){
    calls.reads.push({image,window:[...options.window],width:options.width,height:options.height});
    if(gates.read)await gates.read.wait();
    const [x0,y0,x1,y1]=options.window,out=new Float32Array((x1-x0)*(y1-y0));let k=0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)out[k++]=image.valueAt(x,y);
    return [out];
   }};
  return header(image);
 }
 function baseValue(x,y){
  if((x<20&&y<50)||(x>70&&y>105)||(x+3*y)%67===0)return -9999;
  if(x===44&&y===75)return 3.5;
  return Math.fround(.017*Math.sin(x*.9)+.03*Math.cos(y*.4)+(x*y%7)*.0003);
 }
 const base=makeImage(97,145,baseValue);images.push(base);
 const overview=makeImage(49,73,(x,y)=>{
  const values=[];for(let j=y*2;j<Math.min(145,y*2+2);j++)for(let i=x*2;i<Math.min(97,x*2+2);i++)values.push(baseValue(i,j));
  const result=mean(values);return Number.isFinite(result)?result:-9999;
 });images.push(overview);
 const nc=16,nr=24,z=new Float32Array(nc*nr);
 for(let row=0;row<nr;row++)for(let col=0;col<nc;col++){
  const left=Math.floor(col*49/nc),right=Math.floor((col+1)*49/nc),top=Math.floor(row*73/nr),bottom=Math.floor((row+1)*73/nr),values=[];
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)values.push(overview.valueAt(x,y));
  z[row*nc+col]=mean(values);
 }
 const d={nc,nr,cs:121.25/nc,csy:362.5/nr,xll:500000,yll:6900000,z,srcDims:[97,145],srcCRS:'EPSG:31982',resampled:6,ovr:1,previewMethod:'mean',fromProject:true};
 const r={id:3,name:'Synthetic TPI',d,src:{file:file.name,size:file.size},demHD:false,dispFull:false};S.rasters.push(r);
 const tiff={async getImage(index=0){if(gates.header)await gates.header.wait();if(index>=images.length)throw new Error('No image at index '+index);return images[index];},async close(){calls.close++;}};
 const f={calls,state,S,file,images,base,overview,r,d,tiff,gates,header,makeImage};
 const c={S,Blob,ArrayBuffer,Float32Array,Uint32Array,Uint16Array,Uint8Array,DataView,AbortController,setTimeout,clearTimeout,
  console:{warn:(...args)=>calls.warnings.push(args)},GeoMineSessionAutosave:{state},GeoMineCloudProvider:{user:{uid:'alice'}},
  GeoMineRasterImport:{async open(){calls.open++;return tiff;},release(){calls.release++;}},
  GeoMineRasterSource:{wait(promise,options={}){
   const signal=options.signal;if(!signal)return Promise.resolve(promise);
   return new Promise((resolve,reject)=>{
    const abort=()=>reject(Object.assign(new Error('cancelled'),{name:'AbortError'}));
    if(signal.aborted){Promise.resolve(promise).catch(()=>{});abort();return;}
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
   });
  }},
  GeoMineOriginalSources:{validated(){calls.validated++;}},
  ensureGeoTIFF:async()=>{if(gates.ensure)await gates.ensure.wait();},showLoad(){},
  toast:message=>calls.toasts.push(message),renderRaster(){calls.render++;},refreshUI(){},layoutInvalidateOrtho(){},hShadeOff(){},hInvalidaD8(){}
 };
 c.window=c;vm.createContext(c);vm.runInContext(code,c);f.c=c;
 d._sig=c.assinaturaMDT(d);
 c.parseTIFF=async(selected,control)=>{
  calls.parse++;assert.equal(selected,file);assert.equal(control.tiff,tiff);c.rasterImportCheck(control);
  return {...d,z:new Float32Array(d.z),_tiff:tiff,_img0:base,_W0:97,_H0:145,_bb:base.getBoundingBox(),_nd:-9999};
 };
 f.verify=control=>c.rasterVerifyLegacyPreview(r,file,tiff,control);
 return f;
}
function before(f){return {d:f.r.d,z:f.r.d.z,layers:f.S.layers,rasters:f.S.rasters,raw:f.r._projectSourceRaw,source:f.r.originalSource};}
function preserved(f,b){assert.equal(f.r.d,b.d);assert.equal(f.r.d.z,b.z);assert.equal(f.S.layers,b.layers);assert.equal(f.S.rasters,b.rasters);assert.equal(f.r._projectSourceRaw,b.raw);assert.equal(f.r.originalSource,b.source);assert.equal(f.calls.render,0);}

test('same overview mean uses exact integer windows, Float32 precision, non-square extent and NoData',async()=>{
 const f=fixture(),snapshot=before(f),result=await f.verify();
 assert.equal(result.status,'verified');assert(result.proof.validSamples>=16);assert(result.proof.nodataSamples>0);
 assert(result.proof.windows<=256);assert(result.proof.pixels<=1048576);assert.equal(f.calls.parse,0);preserved(f,snapshot);
 assert(f.calls.reads.every(read=>read.image===f.overview&&read.width===undefined&&read.height===undefined));
 assert(f.calls.reads.some(read=>read.window[2]-read.window[0]===4));
 assert(f.calls.reads.some(read=>read.window[3]-read.window[1]===4));
 for(const read of f.calls.reads)assert((read.window[2]-read.window[0])*(read.window[3]-read.window[1])<=16384);
});

test('only the exact missing requested IFD terminates enumeration; unrelated errors propagate',async()=>{
 for(const Type of [Error,RangeError]){
  const f=fixture(),get=f.tiff.getImage.bind(f.tiff);
  f.tiff.getImage=async index=>{if(index===2)throw new Type('No image at index 2');return get(index);};
  assert.equal((await f.verify()).status,'verified');
 }
 for(const error of [new Error('No image at index 3'),new RangeError('Invalid typed array length'),new Error('File read failed'),new RangeError('Invalid image index')]){
  const f=fixture(),get=f.tiff.getImage.bind(f.tiff);
  f.tiff.getImage=async index=>{if(index===2)throw error;return get(index);};
  await assert.rejects(f.verify(),value=>value===error);assert.equal(f.calls.reads.length,0);
 }
});

test('zero-valued TPI with the same headers/size cannot pass through the weak old decimeter signature',async()=>{
 const f=fixture(),original=f.overview.valueAt;f.overview.valueAt=(x,y)=>original(x,y)===-9999?-9999:0;
 const result=await f.verify();assert.equal(result.status,'mismatch');assert.equal(result.safeFallback,false);assert.equal(f.calls.parse,0);
});

test('NoData masks must match, not merely the valid intersection used by the old signature',async()=>{
 const f=fixture(),original=f.overview.valueAt;f.overview.valueAt=(x,y)=>original(x,y)===-9999?0:original(x,y);
 assert.equal((await f.verify()).status,'mismatch');
});

test('Float32 comparison tolerates two representable steps but preserves tiny nonzero TPI differences',()=>{
 const f=fixture(),float=new Float32Array([.01873465]),bits=new Uint32Array(float.buffer),first=float[0];
 bits[0]+=2;assert.equal(f.c.rasterLegacyFloatMatches(first,float[0]),true);
 bits[0]++;assert.equal(f.c.rasterLegacyFloatMatches(first,float[0]),false);
 assert.equal(f.c.rasterLegacyFloatMatches(0,1e-12),false);assert.equal(f.c.rasterLegacyFloatMatches(NaN,0),false);
});

test('wrong size, native dimensions, CRS or csy/extent reject before pixel reads',async()=>{
 const changes=[f=>f.r.src.size++,f=>f.r.d.srcDims=[98,145],f=>f.base.getGeoKeys=()=>({ProjectedCSTypeGeoKey:31983}),f=>f.r.d.csy+=.01];
 for(const change of changes){const f=fixture();change(f);assert.equal((await f.verify()).status,'mismatch');assert.equal(f.calls.reads.length,0);}
});

test('legacy proof attaches the already-open native source once and retains every saved preview value',async()=>{
 const f=fixture(),snapshot=before(f);f.S.hidro.dem=f.r.d;
 assert.equal(await f.c.religaFonte(f.r,f.file),true);assert.equal(f.calls.open,1);assert.equal(f.calls.parse,0);
 assert.equal(f.calls.close,0);assert.equal(f.calls.release,1);assert.equal(f.calls.render,1);
 assert.equal(f.r.d.z,snapshot.z);assert.equal(f.r.d.cs,f.d.cs);assert.equal(f.r.d.csy,f.d.csy);assert.equal(f.r.d.resampled,6);
 assert.equal(f.r.d._img0,f.base);assert.equal(f.r.d._W0,97);assert.equal(f.r.d._H0,145);assert.equal(f.r._projectSourceRaw,f.file);
 assert.equal(f.S.hidro.dem,f.r.d);assert.equal(f.r.demHD,true);assert.equal(f.r.dispFull,true);assert.equal(f.r.originalSource,undefined);
 assert.equal(f.S.layers,snapshot.layers);assert.equal(f.S.rasters,snapshot.rasters);
});

test('cancel, generation, project, same-grid edits and caller staleness during sample reads never commit',async()=>{
 const changes=[f=>f.controller.abort(),f=>f.state.generation++,f=>f.S.projectId='other',f=>f.r.d.z[f.r.d.z.findIndex(Number.isFinite)]+=.1,f=>f.current=false];
 for(const change of changes){
  const f=fixture(),snapshot=before(f);f.controller=new AbortController();f.current=true;f.gates.read=gate();
  const pending=f.c.religaFonte(f.r,f.file,{signal:f.controller.signal,isCurrent:()=>f.current});
  await f.gates.read.entered;change(f);f.gates.read.release();
  assert.equal(await pending,false);preserved(f,snapshot);assert.equal(f.calls.close,1);assert.equal(f.calls.release,0);assert.equal(f.calls.parse,0);
 }
});

test('physical oversized native or unused overview blocks reject before decoding any sample',async()=>{
 for(const target of ['base','overview']){
  const f=fixture(),image=f[target];f.header(image,65536,64);f.r.src.size=f.file.size;
  const result=await f.verify();assert.equal(result.status,'unsupported');assert.equal(result.safeFallback,false);assert.equal(f.calls.reads.length,0);
 }
 const f=fixture();f.overview.fileDirectory.TileByteCounts[0]=8*1024*1024+1;
 f.file.size=20*1024*1024;f.r.src.size=f.file.size;
 assert.equal((await f.verify()).status,'unsupported');assert.equal(f.calls.reads.length,0);
});

test('metadata budget applies cumulatively across image directories, including masks',async()=>{
 const f=fixture();
 for(let i=0;i<3;i++){
  const image=f.makeImage(1,1,()=>0);image.fileDirectory.NewSubfileType=4;
  image.fileDirectory.TileOffsets=new Uint32Array(400000);image.fileDirectory.TileByteCounts=new Uint32Array(400000);
  f.images.push(image);
 }
 f.r.src.size=f.file.size;
 const result=await f.verify();assert.equal(result.status,'unsupported');assert.match(result.reason,/índices acumulados/);assert.equal(f.calls.reads.length,0);
});

function enlarge(f,width,height,factor){
 const image=f.base;image.width=width;image.height=height;image.getBoundingBox=()=>[500000,6900000,500000+width,6900000+height];
 f.header(image,256,256);f.images.splice(1);const nc=Math.floor(width/factor),nr=Math.floor(height/factor);
 Object.assign(f.r.d,{nc,nr,cs:width/nc,csy:height/nr,z:new Float32Array(nc*nr).fill(.02),srcDims:[width,height],resampled:factor});
 f.r.src.size=f.file.size;
}
test('missing overview or oversized proof windows in a large source never fall back to parseTIFF',async()=>{
 for(const absent of [true,false]){
  const f=fixture();enlarge(f,10000,10000,1000);f.r.d.ovr=absent?6:0;
  const result=await f.verify();assert.equal(result.status,'unsupported');assert.equal(result.safeFallback,false);assert.equal(f.calls.reads.length,0);
  const snapshot=before(f);assert.equal(await f.c.religaFonte(f.r,f.file),false);preserved(f,snapshot);assert.equal(f.calls.parse,0);assert.equal(f.calls.close,1);
 }
});

test('small files without overview provenance retain the bounded legacy fallback',async()=>{
 const f=fixture();delete f.r.d.previewMethod;delete f.r.d.ovr;
 const result=await f.verify();assert.equal(result.status,'unsupported');assert.equal(result.safeFallback,true);assert.equal(f.calls.reads.length,0);
 assert.equal(await f.c.religaFonte(f.r,f.file),true);assert.equal(f.calls.parse,1);assert.equal(f.calls.close,0);assert.equal(f.calls.render,1);
});

test('too few valid cells cannot confirm a large original using mostly NoData',async()=>{
 const f=fixture();enlarge(f,4096,4096,32);f.r.d.ovr=0;f.r.d.z.fill(NaN);f.r.d.z[0]=0;
 const result=await f.verify();assert.equal(result.status,'unsupported');assert.equal(result.safeFallback,false);assert.equal(f.calls.reads.length,0);
});

test('transferred TIFF ownership closes exactly once on early invalid/abort/stale and during ensureGeoTIFF',async()=>{
 for(const mode of ['invalid','aborted','stale','during-ensure']){
  const f=fixture(),controller=new AbortController();
  if(mode==='aborted')controller.abort();
  if(mode==='during-ensure')f.gates.ensure=gate();
  const pending=f.c.projectAttachNativeRaster(mode==='invalid'?null:f.r,f.file,{tiff:f.tiff,signal:controller.signal,isCurrent:()=>mode!=='stale'});
  if(mode==='during-ensure'){await f.gates.ensure.entered;controller.abort();f.gates.ensure.release();}
  if(mode==='invalid')assert.equal(await pending,false);else await assert.rejects(pending,{name:'AbortError'});
  assert.equal(f.calls.close,1);assert.equal(f.calls.open,0);assert.equal(f.calls.release,0);assert.equal(f.calls.render,0);
 }
 const f=fixture();assert.equal(await f.c.projectAttachNativeRaster(f.r,f.file,{tiff:f.tiff,isCurrent:()=>true}),true);
 assert.equal(f.calls.close,0);assert.equal(f.calls.open,0);assert.equal(f.calls.release,1);
});
