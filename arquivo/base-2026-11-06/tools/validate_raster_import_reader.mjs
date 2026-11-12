import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),MiB=1024*1024,BLOCK=4*MiB,ANDROID_BLOCK=512*1024;
const text=p=>fs.readFileSync(path.join(root,p),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const tests=[];
const test=(name,run)=>tests.push({name,run});
class PatternBlob {
  constructor(size,behavior={},start=0){this.size=size;this.behavior=behavior;this.start=start;}
  slice(start,end){return new PatternBlob(Math.max(0,Math.min(this.size,end)-start),this.behavior,this.start+start);}
  async arrayBuffer(){const out=new Uint8Array(this.size);for(let i=0;i<out.length;i++)out[i]=(this.start+i)%251;return out.buffer;}
}
function fixture(library,{userAgent='Mozilla/5.0 (Macintosh)'}={}){
  const io={active:0,maxActive:0,reads:0,aborts:0,requests:[]};
  class Reader {
    readAsArrayBuffer(blob){
      this.busy=true;io.active++;io.reads++;io.maxActive=Math.max(io.maxActive,io.active);io.requests.push({start:blob.start||0,size:blob.size});
      const behavior=blob.behavior||{};
      if(behavior.hang)return;
      this.timer=setTimeout(async()=>{
        if(!this.busy)return;
        if(behavior.failures){behavior.failures--;this.finish();this.error=new Error('Cloud provider unavailable');this.onerror?.({target:this});return;}
        const bytes=await blob.arrayBuffer();if(!this.busy)return;
        this.result=behavior.truncate?bytes.slice(0,Math.max(0,bytes.byteLength-1)):bytes;
        this.finish();this.onload?.({target:this});
      },behavior.delay||0);
    }
    finish(){if(this.busy){this.busy=false;io.active--;}}
    abort(){if(!this.busy)return;io.aborts++;clearTimeout(this.timer);this.finish();this.onabort?.({target:this});}
  }
  const fake={GeoTIFF:{fromSource:async(source,options,signal)=>{
    const header=await source.fetch([{offset:0,length:1024}],signal);
    return {source,options,header,getImage:async()=>({}),getImageCount:async()=>1,close:()=>source.close()};
  }},fromArrayBuffer:async buffer=>({buffer,getImage:async()=>({}),getImageCount:async()=>1})};
  const c={console,setTimeout,clearTimeout,AbortController,FileReader:Reader,ArrayBuffer,Uint8Array,Blob,
    navigator:{userAgent},GeoTIFF:library||fake};c.window=c;
  vm.createContext(c);vm.runInContext(text('src/modules/raster/source-cache.js'),c);vm.runInContext(text('src/modules/raster/import-reader.js'),c);
  return {c,io,api:c.GeoMineRasterImport,blob:(size=8*BLOCK,behavior={})=>new PatternBlob(size,behavior)};
}
function pattern(buffer,offset,length=buffer.byteLength){
  assert.equal(buffer.byteLength,length);const bytes=new Uint8Array(buffer);
  for(const i of [0,1,Math.floor(length/2),length-1])if(i>=0&&i<length)assert.equal(bytes[i],(offset+i)%251);
}

test('1,015 one-row strips share one physical block read and retain request order',async()=>{
  const {api,io,blob}=fixture(),tiff=await api.open(blob()),before=io.reads;
  const slices=Array.from({length:1015},(_,i)=>({offset:BLOCK+i*19,length:13}));
  const data=await tiff.source.fetch(slices);
  data.forEach((bytes,i)=>pattern(bytes,slices[i].offset,13));
  assert.equal(io.reads-before,1);assert.ok(api.stats().deduplicated>=1014);assert.equal(tiff.options.cache,false);
  assert.equal(await tiff.getImageCount(),1);await tiff.close();
});
test('cross-block ranges are exact and source boundaries remain separate',async()=>{
  const {api,io,blob}=fixture(),a=await api.open(blob()),b=await api.open(blob());
  const [data]=await a.source.fetch([{offset:BLOCK-9,length:27}]);pattern(data,BLOCK-9,27);
  const before=io.reads;await b.source.fetch([{offset:BLOCK+5,length:7}]);assert.equal(io.reads-before,1);
  await a.close();await b.close();
});
test('normal metadata requests extending past EOF clamp without a truncation error',async()=>{
  const {api,blob}=fixture(),tiff=await api.open(blob(127));pattern(tiff.header[0],0,127);
  const result=await tiff.source.fetch([{offset:121,length:1000},{offset:127,length:1},{offset:999,length:1},{offset:3,length:0}]);
  pattern(result[0],121,6);for(const value of result.slice(1))assert.equal(value.byteLength,0);await tiff.close();
});
test('Android bounds cold header reads to 512 KiB without changing desktop or large-file policy',async()=>{
  for(const [userAgent,size,expected]of [
    ['Mozilla Android',75*MiB,ANDROID_BLOCK],['Mozilla Android',1024*MiB-1,ANDROID_BLOCK],
    ['Mozilla Macintosh',75*MiB,BLOCK],['Mozilla iPad',75*MiB,BLOCK],
    ['Mozilla Android',1024*MiB,128*1024],['Mozilla Macintosh',5*1024*MiB,128*1024]
  ]){
    const {api,io,blob}=fixture(undefined,{userAgent}),tiff=await api.open(blob(size));
    assert.deepEqual(io.requests,[{start:0,size:expected}]);pattern(tiff.header[0],0,1024);
    assert.equal(api.stats().blockBytes,BLOCK);assert.equal(api.stats().androidBlockBytes,ANDROID_BLOCK);
    if(size>4*1024*MiB){const offset=4*1024*MiB+128*1024-7;
      const [bytes]=await tiff.source.fetch([{offset,length:23}]);pattern(bytes,offset,23);
      assert.ok(io.requests.every(r=>r.size<=128*1024));}
    await tiff.close();
  }
});
test('Android ranges span pages exactly, preserve order and clamp the partial EOF page',async()=>{
  const {api,io,blob}=fixture(undefined,{userAgent:'Mozilla Android'}),size=3*ANDROID_BLOCK+19,tiff=await api.open(blob(size));
  const slices=[{offset:ANDROID_BLOCK-11,length:2*ANDROID_BLOCK+30},
    {offset:size-3,length:1000},{offset:17,length:23},{offset:size,length:1},{offset:size+1,length:1}];
  const result=await tiff.source.fetch(slices);
  result.forEach((data,i)=>pattern(data,slices[i].offset,Math.max(0,Math.min(slices[i].length,size-slices[i].offset))));
  const full=new Uint8Array(result[0]);assert.ok(full.every((value,i)=>value===(slices[0].offset+i)%251));
  assert.ok(io.requests.every(r=>r.size<=ANDROID_BLOCK));
  assert.ok(io.requests.some(r=>r.start===3*ANDROID_BLOCK&&r.size===19));
  assert.equal(io.reads,4);await tiff.close();
});
test('Android cache deduplicates provider reads and keeps page indexes stable after source adoption',async()=>{
  const {api,io,blob,c}=fixture(undefined,{userAgent:'Mozilla Android'}),behavior={},original=blob(75*MiB,behavior),tiff=await api.open(original);
  const slices=Array.from({length:1015},(_,i)=>({offset:ANDROID_BLOCK+i*19,length:13})),before=io.reads;
  const result=await tiff.source.fetch(slices);result.forEach((data,i)=>pattern(data,slices[i].offset,13));
  assert.equal(io.reads-before,1);assert.ok(api.stats().deduplicated>=1014);
  c.navigator.userAgent='Mozilla Macintosh'; // An existing source must retain its original page geometry.
  assert.equal(api.adoptSource(tiff,blob(original.size)),true);behavior.failures=1;
  const reads=io.reads,[cached]=await tiff.source.fetch([{offset:ANDROID_BLOCK+19,length:13}]);
  pattern(cached,ANDROID_BLOCK+19,13);assert.equal(io.reads,reads);
  const [fresh]=await tiff.source.fetch([{offset:3*ANDROID_BLOCK+9,length:17}]);pattern(fresh,3*ANDROID_BLOCK+9,17);
  assert.deepEqual(io.requests.at(-1),{start:3*ANDROID_BLOCK,size:ANDROID_BLOCK});
  assert.equal(behavior.failures,1);await tiff.close();assert.equal(api.stats().cacheBytes,0);
});
test('Android sources retain the shared 16 MiB LRU and two-reader bound with smaller pages',async()=>{
  const {api,io,blob}=fixture(undefined,{userAgent:'Mozilla Android'}),
    a=await api.open(blob(40*ANDROID_BLOCK,{delay:1})),b=await api.open(blob(40*ANDROID_BLOCK,{delay:1}));
  await Promise.all([a,b].map(t=>t.source.fetch(Array.from({length:20},(_,i)=>({offset:(i+1)*ANDROID_BLOCK,length:5})))));
  await tick();assert.equal(io.maxActive,2);assert.equal(api.stats().maxActive,2);
  assert.ok(api.stats().cacheBytes<=16*MiB);assert.ok(api.stats().cacheBlocks<=32);
  const before=io.reads,[evicted]=await a.source.fetch([{offset:7,length:5}]);pattern(evicted,7,5);
  assert.equal(io.reads-before,1,'the oldest Android header page is evicted under the shared budget');
  assert.equal(api.stats().pendingBlocks,0);assert.equal(api.stats().active,0);
  await a.close();await b.close();assert.equal(api.stats().cacheBytes,0);
});
test('Android import cancellation stops active provider reads and discards queued pages',async()=>{
  const {api,io,blob}=fixture(undefined,{userAgent:'Mozilla Android'}),behavior={},controller=new AbortController(),
    tiff=await api.open(blob(10*ANDROID_BLOCK,behavior),{signal:controller.signal});
  behavior.delay=100;const before=io.reads;
  const reading=tiff.source.fetch([1,2,3,4,5,6].map(n=>({offset:n*ANDROID_BLOCK,length:10})));
  await tick();controller.abort();await assert.rejects(reading,{name:'AbortError'});await tick();
  assert.equal(io.reads-before,2);assert.equal(io.aborts,2);assert.equal(io.active,0);
  assert.equal(api.stats().queued,0);assert.equal(api.stats().pendingBlocks,0);await tiff.close();
});
test('Android per-fetch cancellation preserves another consumer of the same provider page',async()=>{
  const {api,io,blob}=fixture(undefined,{userAgent:'Mozilla Android'}),behavior={},
    tiff=await api.open(blob(3*ANDROID_BLOCK,behavior)),controller=new AbortController();behavior.delay=15;
  const before=io.reads,canceled=tiff.source.fetch([{offset:ANDROID_BLOCK,length:5}],controller.signal),
    other=tiff.source.fetch([{offset:ANDROID_BLOCK+9,length:5}]);
  controller.abort();await assert.rejects(canceled,{name:'AbortError'});const [bytes]=await other;pattern(bytes,ANDROID_BLOCK+9,5);
  assert.equal(io.reads-before,1);assert.equal(io.aborts,0);assert.ok(api.stats().deduplicated>=1);await tiff.close();
});
test('all TIFF sources share the 16 MiB LRU and maximum two physical readers',async()=>{
  const {api,io,blob}=fixture(),a=await api.open(blob(8*BLOCK,{delay:3})),b=await api.open(blob(8*BLOCK,{delay:3}));
  await Promise.all([a,b].map(t=>t.source.fetch([1,2,3,4,5].map(n=>({offset:n*BLOCK+6,length:10})))));
  await tick();assert.equal(io.maxActive,2);assert.equal(api.stats().maxActive,2);assert.ok(api.stats().cacheBytes<=16*MiB);
  assert.ok(api.stats().cacheBlocks<=4);assert.equal(api.stats().pendingBlocks,0);assert.equal(api.stats().active,0);
  await a.close();await b.close();assert.equal(api.stats().cacheBytes,0);
});
test('import abort rejects active and queued blocks without launching queued readers',async()=>{
  const {api,io,blob}=fixture(),behavior={delay:1},controller=new AbortController(),tiff=await api.open(blob(10*BLOCK,behavior),{signal:controller.signal});
  behavior.delay=100;const before=io.reads;
  const reading=tiff.source.fetch([1,2,3,4,5,6].map(n=>({offset:n*BLOCK,length:10})));
  await tick();controller.abort();await assert.rejects(reading,{name:'AbortError'});await tick();
  assert.equal(io.reads-before,2);assert.equal(io.active,0);assert.equal(api.stats().queued,0);assert.equal(api.stats().pendingBlocks,0);await tiff.close();
});
test('failed block is evicted from pending promises and can be retried',async()=>{
  const {api,io,blob}=fixture(),behavior={},tiff=await api.open(blob(3*BLOCK,behavior));behavior.failures=1;
  await assert.rejects(tiff.source.fetch([{offset:BLOCK,length:8}]),{name:'NotReadableError'});
  const before=io.reads,[bytes]=await tiff.source.fetch([{offset:BLOCK,length:8}]);pattern(bytes,BLOCK,8);assert.equal(io.reads-before,1);await tiff.close();
});
test('short provider reads fail explicitly, unlike correctly clamped EOF reads',async()=>{
  const {api,blob}=fixture(),behavior={truncate:true};await assert.rejects(api.open(blob(127,behavior)),{name:'NotReadableError'});
  await tick();assert.equal(api.stats().cacheBytes,0);assert.equal(api.stats().active,0);
});
test('a hung FileReader times out, is aborted, and releases the global queue',async()=>{
  const {api,io,blob}=fixture();await assert.rejects(api.open(blob(127,{hang:true}),{timeoutMs:20}),{name:'TimeoutError'});
  await tick();assert.equal(io.active,0);assert.equal(io.aborts,1);assert.equal(api.stats().active,0);
  const tiff=await api.open(blob(127));await tiff.close();
});
test('release detaches the import signal while preserving future tile range access',async()=>{
  const {api,blob}=fixture(),controller=new AbortController(),tiff=await api.open(blob(),{signal:controller.signal});
  assert.equal(api.release(tiff),true);controller.abort();
  const [bytes]=await tiff.source.fetch([{offset:3*BLOCK+11,length:9}]);pattern(bytes,3*BLOCK+11,9);await tiff.close();
});
test('stable identical copy replaces provider without losing cached blocks or native access',async()=>{
  const {api,io,blob}=fixture(),behavior={},original=blob(8*BLOCK,behavior),tiff=await api.open(original);
  assert.equal(api.adoptSource(tiff,blob(BLOCK)),false);
  assert.equal(api.adoptSource({},original),false);
  const before=io.reads;assert.equal(api.adoptSource(tiff,blob(8*BLOCK)),true);
  behavior.failures=10;
  const [cached]=await tiff.source.fetch([{offset:10,length:10}]);pattern(cached,10,10);assert.equal(io.reads,before);
  const [fresh]=await tiff.source.fetch([{offset:5*BLOCK+9,length:10}]);pattern(fresh,5*BLOCK+9,10);
  assert.equal(behavior.failures,10);await tiff.close();assert.equal(api.adoptSource(tiff,original),false);
});
test('per-fetch cancellation does not cancel another consumer of a shared block',async()=>{
  const {api,io,blob}=fixture(),behavior={},tiff=await api.open(blob(3*BLOCK,behavior)),controller=new AbortController();behavior.delay=15;
  const canceled=tiff.source.fetch([{offset:BLOCK,length:5}],controller.signal),other=tiff.source.fetch([{offset:BLOCK+9,length:5}]);
  controller.abort();await assert.rejects(canceled,{name:'AbortError'});const [bytes]=await other;pattern(bytes,BLOCK+9,5);
  assert.equal(io.aborts,0);assert.ok(api.stats().deduplicated>=1);await tiff.close();
});
test('close cancels this source only and evicts its compressed blocks',async()=>{
  const {api,blob}=fixture(),behavior={},a=await api.open(blob(3*BLOCK,behavior)),b=await api.open(blob(3*BLOCK));behavior.delay=100;
  const pending=a.source.fetch([{offset:BLOCK,length:5}]);await tick();await a.close();await assert.rejects(pending,{name:'AbortError'});
  const [bytes]=await b.source.fetch([{offset:BLOCK+3,length:5}]);pattern(bytes,BLOCK+3,5);
  await assert.rejects(a.source.fetch([{offset:0,length:5}]),{name:'AbortError'});await b.close();assert.equal(api.stats().cacheBytes,0);
});
test('ArrayBuffer input remains the library path and already-aborted opens do no I/O',async()=>{
  const {api,io,blob}=fixture(),bytes=new ArrayBuffer(100),tiff=await api.open(bytes);assert.equal(tiff.buffer,bytes);assert.equal(io.reads,0);
  const controller=new AbortController();controller.abort();await assert.rejects(api.open(blob(),{signal:controller.signal}),{name:'AbortError'});assert.equal(io.reads,0);
});
test('invalid range coordinates fail without extra provider reads',async()=>{
  const {api,io,blob}=fixture(),tiff=await api.open(blob(127)),before=io.reads;
  for(const slice of [{offset:-1,length:5},{offset:0.5,length:1},{offset:1,length:-1},{offset:Number.MAX_SAFE_INTEGER,length:2}])
    await assert.rejects(tiff.source.fetch([slice]),{name:'RangeError'});
  assert.equal(io.reads,before);await tiff.close();
});
test('bundled GeoTIFF reads real raster pixels identically through the public source API',async()=>{
  const require=createRequire(import.meta.url),previous=globalThis.Worker;globalThis.Worker=class{};let GeoTIFF;
  try{GeoTIFF=require(path.join(root,'src/vendor/geotiff.min.js'));}finally{if(previous===undefined)delete globalThis.Worker;else globalThis.Worker=previous;}
  const width=16,height=12,data=Uint8Array.from({length:width*height},(_,i)=>i%251);
  const bytes=GeoTIFF.writeArrayBuffer(data,{width,height,SamplesPerPixel:1,BitsPerSample:[8],SampleFormat:[1],
    ModelPixelScale:[1,1,0],ModelTiepoint:[0,0,0,500000,7400000,0],ProjectedCSTypeGeoKey:31982});
  const {api,io}=fixture(GeoTIFF),controller=new AbortController(),tiff=await api.open(new Blob([bytes]),{signal:controller.signal});
  assert.equal(await tiff.getImageCount(),1);const im=await tiff.getImage();assert.equal(im.getWidth(),width);assert.equal(im.getHeight(),height);
  const actual=await im.readRasters({interleave:true});assert.deepEqual(Array.from(actual),Array.from(data));
  api.release(tiff);controller.abort();assert.deepEqual(Array.from(await im.readRasters({window:[4,2,9,4],interleave:true})),
    Array.from(data.slice(2*width+4,2*width+9)).concat(Array.from(data.slice(3*width+4,3*width+9))));
  assert.equal(io.reads,1);await tiff.close();
});

for(const {name,run} of tests){await run();console.log('PASS '+name);}
console.log(`${tests.length}/${tests.length} raster import reader checks passed.`);
