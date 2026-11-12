// Controlled in-memory benchmark using real GeoTIFFImage and Deflate decoding.
// Not a QGIS benchmark. Pass the previous tile-runtime.js to compare releases.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {fixture,runtime} from './validate_tile_sampled_reads.mjs';

const previous=process.argv[2];
if(!previous)throw Error('Usage: node tools/benchmark_raster_zoom.mjs <previous-tile-runtime.js>');
const beforeSource=fs.readFileSync(path.resolve(previous),'utf8');
const hash=bands=>{
  const h=createHash('sha256');
  for(const a of ArrayBuffer.isView(bands)?[bands]:bands)h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
  return h.digest('hex');
};
const results=[];
for(const scenario of [
  {name:'ortho-striped',tiled:false,bits:[8,8,8],formats:[1,1,1],tileHeight:32},
  {name:'ortho-tiled',tiled:true,bits:[8,8,8],formats:[1,1,1],tileHeight:256},
  {name:'mdt-striped',tiled:false,bits:[32],formats:[3],tileHeight:32}
]){
  const config={...scenario,width:4096,height:2048,tileWidth:256,compression:8,
    value:(x,y,s)=>scenario.formats[0]===3?220+Math.sin(x/13)*21+Math.cos(y/9)*7:(x*17+y*11+s*43)%256};
  const template=fixture(config),encoded=Array.from({length:template.nx*template.ny},(_,i)=>template.block(i));
  const options={window:[128,64,3968,1984],width:320,height:160,
    resampleMethod:'bilinear',samples:scenario.bits.map((_,i)=>i)};
  async function run(source){
    const f=fixture(config),{api}=runtime(Infinity,source);let reads=0,bytes=0,nativePixels=0;
    f.im.source.fetch=async ranges=>ranges.map(({offset})=>{reads++;bytes+=encoded[offset].byteLength;return encoded[offset];});
    const read=f.im.readRasters.bind(f.im);
    f.im.readRasters=opt=>{const w=opt.window;nativePixels+=(w[2]-w[0])*(w[3]-w[1]);return read(opt);};
    const passes=[],hashes=[];
    for(let i=0;i<3;i++){
      const start=performance.now(),data=await api.read(f.im,options);
      passes.push(Math.round((performance.now()-start)*10)/10);hashes.push(hash(data));
    }
    return {passMs:passes,totalMs:Math.round(passes.reduce((a,b)=>a+b,0)*10)/10,
      fetchedBlocks:reads,compressedBytes:bytes,nativeWindowPixelsMaterialized:nativePixels,
      outputPixelsPerPass:options.width*options.height,stats:api.stats(),hashes};
  }
  const before=await run(beforeSource),after=await run(undefined);
  assert.deepEqual(after.hashes,before.hashes,'Rendering values changed: '+scenario.name);
  results.push({scenario:scenario.name,before,after,
    ratio:Number((before.totalMs/after.totalMs).toFixed(2)),identicalPixels:true});
}
console.log(JSON.stringify({method:'Same pre-compressed Deflate blocks; real vendored decoder; cold + two warm reads; synthetic pixels, no disk/network, no QGIS timing.',results},null,2));
