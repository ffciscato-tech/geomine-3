import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
// Virtual BigTIFF: real 64-bit directory and row offsets, no multi-GB allocation.
const W=35000,H=41000,ROW=W*4,BASE=16+ROW*H,SIZE=BASE+1024;
const tags=[[256,4,1,W],[257,4,1,H],[258,3,1,32],[259,3,1,1],
 [262,3,1,1],[273,16,H,BASE+1024],[277,3,1,1],[278,4,1,1],
 [279,16,H,BASE+1024+H*8],[284,3,1,1],[339,3,1,3],
 [33550,12,3,BASE+512],[33922,12,6,BASE+536],[42113,2,6,0]];
const total=SIZE+H*16;
const header=Buffer.alloc(16);header.write('II');header.writeUInt16LE(43,2);header.writeUInt16LE(8,4);header.writeBigUInt64LE(BigInt(BASE),8);
const tail=Buffer.alloc(1024+H*16);tail.writeBigUInt64LE(BigInt(tags.length));
tags.forEach(([tag,type,count,value],i)=>{const p=8+i*20;tail.writeUInt16LE(tag,p);tail.writeUInt16LE(type,p+2);tail.writeBigUInt64LE(BigInt(count),p+4);tail.writeBigUInt64LE(BigInt(value),p+12);if(tag===42113)tail.write('-9999\0',p+12);});
[1,1,0,0,0,0,500000,7400000,0].forEach((v,i)=>tail.writeDoubleLE(v,512+i*8));
for(let y=0;y<H;y++){tail.writeBigUInt64LE(BigInt(16+y*ROW),1024+y*8);tail.writeBigUInt64LE(BigInt(ROW),1024+H*8+y*8);}
export {header,tail,BASE,total,W,H};
const expected=(x,y)=>x%29===0?-9999:y/4+x/8;
class VirtualFile{
 constructor(size=total,start=0){this.size=size;this.start=start;this.name='virtual-5GB.tif';}
 slice(a,b){return new VirtualFile(Math.max(0,Math.min(this.size,b)-a),this.start+a);}
 async arrayBuffer(){
  assert.ok(this.size<=4*1024*1024,'Never read entire file');
  const b=Buffer.alloc(this.size),end=this.start+this.size;
  for(let o=Math.max(16,Math.ceil(this.start/4)*4);o+4<=Math.min(BASE,end);o+=4){
   const i=(o-16)/4;b.writeFloatLE(expected(i%W,Math.floor(i/W)),o-this.start);
  }
  for(const [offset,source] of [[0,header],[BASE,tail]]){
   const a=Math.max(this.start,offset),z=Math.min(end,offset+source.length);
   if(z>a)source.copy(b,a-this.start,a-offset,z-offset);
  }
  return b.buffer.slice(b.byteOffset,b.byteOffset+b.length);
 }
}
class Reader{
 readAsArrayBuffer(blob){blob.arrayBuffer().then(value=>{this.result=value;this.onload?.();},error=>{this.error=error;this.onerror?.();});}
 abort(){this.onabort?.();}
}
const messages=[],c={console,TextEncoder,TextDecoder,ArrayBuffer,DataView,Blob,AbortController,
 Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array,Float32Array,Float64Array,
 setTimeout,clearTimeout,navigator:{},FileReader:Reader,Worker:class{},
 RASTER_FILE_PREVIEW_CELLS:12e6,TIFF_CHUNK_SAMPLES:8e6,
 ensureGeoTIFF:async()=>{},toast:s=>messages.push(s),showLoad:s=>messages.push(s)};
c.window=c;vm.createContext(c);
for(const f of ['src/vendor/geotiff.min.js','src/modules/raster/source-cache.js','src/modules/raster/import-reader.js','src/modules/raster/tile-runtime.js','src/modules/raster/large-preview.js'])vm.runInContext(read(f),c);
const core=read('src/core/parts/19-hydrology-and-flooding.js');
vm.runInContext(core.slice(core.indexOf('function rasterImportCheck('),core.indexOf('function bufferCap(')),c);
vm.runInContext(core.slice(core.indexOf('function geotiffDeclaredStats('),core.indexOf('async function demFull(')),c);
const t0=Date.now(),d=await c.parseTIFF(new VirtualFile());
assert.equal(d.previewMethod,'sampled');assert.ok(d.z.length<=1e6);assert.equal(d._W0,W);assert.equal(d._H0,H);
assert.equal(d._sourceStats.exact,false);assert.equal(d._img0.getWidth(),W);
for(const [x,y] of [[0,0],[3,2],[d.nc-1,d.nr-1],[400,700]]){
 const v=expected(Math.floor(x*W/d.nc),Math.floor(y*H/d.nr));
 assert.ok(v===-9999?Number.isNaN(d.z[y*d.nc+x]):d.z[y*d.nc+x]===v,JSON.stringify({x,y,v,actual:d.z[y*d.nc+x],nd:d._nd}));
}
const io=c.GeoMineRasterImport.stats();assert.ok(io.readBytes<400e6,JSON.stringify(io));
assert.ok(io.maxActive<=2);assert.ok(io.cacheBytes<=16*1024*1024);
assert.ok(messages.some(s=>s.includes('prévia amostrada')));
// Native reads still work above 4 GB, not from the reduced preview.
const native=await d._img0.readRasters({window:[10,40000,12,40001],samples:[0]});
assert.deepEqual(Array.from(native[0]),[expected(10,40000),expected(11,40000)]);
const cancel=new AbortController();cancel.abort();await assert.rejects(c.parseTIFF(new VirtualFile(),{signal:cancel.signal}),{name:'AbortError'});
assert.equal(c.GeoMineLargeRasterPreview.cellBudget(1000,1000,12e6),12e6);
assert.equal(await c.GeoMineLargeRasterPreview.read({getWidth:()=>100,getHeight:()=>100},10,10),null);
assert.equal(c.geotiffDeclaredStats({fileDirectory:{SMinSampleValue:21.5,SMaxSampleValue:324}}).mn,21.5);
console.log('PASS virtual BigTIFF',JSON.stringify({size:total,ms:Date.now()-t0,preview:[d.nc,d.nr],io}));

// Optional excerpts from the supplied MDT3, never redistribute private fixtures.
const fixture=path.join(root,'fixtures/mdt3-head.bin');
if(fs.existsSync(fixture)){
 const head=fs.readFileSync(fixture),tail=fs.readFileSync(path.join(root,'fixtures/mdt3-ifd.bin')),
  row=fs.readFileSync(path.join(root,'fixtures/mdt3-row40000.bin'));
 assert.equal(row.length,142980);
 const sections=[[0,head],[5922803536,tail],[5719200016,row]];
 const source={fileSize:5923467036,fetch:async ranges=>ranges.map(({offset,length})=>{
  const part=sections.find(([start,b])=>offset>=start&&offset<start+b.length);assert.ok(part,'unavailable excerpt '+offset);
  const b=part[1].subarray(offset-part[0],offset-part[0]+length);return b.buffer.slice(b.byteOffset,b.byteOffset+b.length);
 })};
 const tiff=await c.GeoTIFF.GeoTIFF.fromSource(source,{cache:false}),im=await tiff.getImage();
 assert.equal(await tiff.getImageCount(),1);assert.equal(im.getWidth(),35745);assert.equal(im.getHeight(),41424);
 assert.equal(im.geoKeys.ProjectedCSTypeGeoKey,31982);
 const raster=await im.readRasters({window:[0,40000,35745,40001],samples:[0]});
 for(let x=0;x<35745;x++)assert.equal(raster[0][x],row.readFloatLE(x*4));
 console.log('PASS supplied MDT3 real 64-bit offsets and 35,745 native pixel values',c.geotiffDeclaredStats(im));
}
