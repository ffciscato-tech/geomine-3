'use strict';

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test}=require('node:test');
const roots=[path.join(__dirname,'../src'),path.join(__dirname,'../updated/src')];
const root=roots.find(p=>fs.existsSync(path.join(p,'modules/raster/tile-runtime.js')));
assert(root,'Expected package src/ or workspace updated/src/');
const source=name=>fs.readFileSync(path.join(root,'modules/raster',name),'utf8');
const MiB=1024*1024,opts={timeout:3000};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
const limited=error=>error?.code==='RASTER_MEMORY_LIMIT';

function runtime(mobile=true,nav){
  const context={window:{GeoTIFF:{getDecoder:async()=>({})}},navigator:nav||{userAgent:mobile?'iPad':'Desktop',platform:mobile?'iPad':'Linux',maxTouchPoints:mobile?5:0},setTimeout,console};
  vm.createContext(context);vm.runInContext(source('tile-runtime.js'),context);
  return context.window.GeoMineTileRuntime;
}
function image(options={}){
  const W=options.width||128,H=options.height||128,tw=options.tileWidth||64,th=options.tileHeight||64,
    bits=options.bits||[32],formats=options.formats||bits.map(()=>3),count=bits.length;
  const counters={raw:0,blocks:0};
  const fd={ImageWidth:W,ImageLength:H,TileWidth:tw,TileLength:th,BitsPerSample:bits,SampleFormat:formats,SamplesPerPixel:count,PlanarConfiguration:1};
  if(options.counts)fd.TileByteCounts=options.counts;
  const im={fileDirectory:fd,littleEndian:true,
    getWidth:()=>W,getHeight:()=>H,getTileWidth:()=>tw,getTileHeight:()=>th,getSamplesPerPixel:()=>count,
    getBytesPerPixel:()=>bits.reduce((a,b)=>a+b,0)/8,getSampleByteSize:s=>bits[s]/8,
    getReaderForSample:()=>DataView.prototype.getFloat32,
    async getTileOrStrip(x,y,sample){counters.blocks++;return {x,y,sample,data:new Float32Array(tw*th*count).fill(11).buffer};},
    async readRasters(){counters.raw++;return options.read?options.read():[new Float32Array([11])];}
  };
  if(options.unsupportedSampler)delete im.getReaderForSample;
  return {im,counters};
}

test('mobile rejects a 6.4 GB native window before calling the reader, even idle',opts,async()=>{
  const rt=runtime(),f=image({width:40000,height:40000});
  await assert.rejects(rt.read(f.im,{samples:[0],window:[0,0,40000,40000]}),limited);
  assert.equal(f.counters.raw,0);assert.equal(f.counters.blocks,0);assert.equal(rt.stats().queued,0);
});
test('unsupported resampling cannot hide a huge native-window allocation',opts,async()=>{
  const rt=runtime(),f=image({width:40000,height:40000,unsupportedSampler:true});
  await assert.rejects(rt.read(f.im,{samples:[0],window:[0,0,40000,40000],width:1,height:1}),limited);
  assert.equal(f.counters.raw,0);assert.equal(f.counters.blocks,0);
});
test('a supported tiny sample of a huge tiled source remains native and bounded',opts,async()=>{
  const rt=runtime(),f=image({width:100000,height:100000});
  const result=await rt.read(f.im,{samples:[0],window:[0,0,100000,100000],width:1,height:1});
  assert.equal(result[0][0],11);assert.equal(result[0].length,1);
  assert.equal(f.counters.raw,0);assert.equal(f.counters.blocks,1);
});
test('oversized sampled output is rejected before allocating planes or decoding blocks',opts,async()=>{
  const rt=runtime(),f=image({width:100000,height:100000});
  await assert.rejects(rt.read(f.im,{samples:[0],window:[0,0,100000,100000],width:4096,height:4096}),limited);
  assert.equal(f.counters.raw,0);assert.equal(f.counters.blocks,0);
});
test('a giant physical tile is refused before reader or decoder allocation',opts,async()=>{
  const rt=runtime(),f=image({width:1536,height:1536,tileWidth:1536,tileHeight:1536});
  await assert.rejects(rt.read(f.im,{samples:[0],window:[0,0,1,1]}),limited);
  await assert.rejects(rt.prepareImage(f.im).getTileOrStrip(0,0,0),limited);
  assert.equal(f.counters.raw,0);assert.equal(f.counters.blocks,0);
});
test('a giant compressed block is refused before reader or source allocation',opts,async()=>{
  const rt=runtime(),f=image({counts:[9*MiB]});
  await assert.rejects(rt.read(f.im,{samples:[0],window:[0,0,1,1]}),limited);
  assert.equal(f.counters.raw,0);assert.equal(f.counters.blocks,0);
});
test('normal-window memory includes all intersected compressed blocks',opts,async()=>{
  const rt=runtime(),f=image({width:1024,height:1024,tileWidth:512,tileHeight:512,counts:[4*MiB,4*MiB,4*MiB,4*MiB]});
  await assert.rejects(rt.read(f.im,{samples:[0],window:[0,0,1024,1024]}),limited);
  assert.equal(f.counters.raw,0);assert.equal(f.counters.blocks,0);
});
test('sampled working memory includes output planes plus compressed input',opts,async()=>{
  const rt=runtime(),f=image({width:4096,height:4096,tileWidth:512,tileHeight:512,counts:[8*MiB]});
  await assert.rejects(rt.read(f.im,{samples:[0],window:[0,0,4096,4096],width:1024,height:1024,resampleMethod:'bilinear'}),limited);
  assert.equal(f.counters.raw,0);assert.equal(f.counters.blocks,0);
});
test('normal windows and desktop large-window behavior remain available',opts,async()=>{
  const rt=runtime(),small=image();
  assert.equal((await rt.read(small.im,{samples:[0],window:[0,0,128,128]}))[0][0],11);
  assert.equal(small.counters.raw,1);
  const desktop=runtime(false),large=image({width:40000,height:40000});
  assert.equal((await desktop.read(large.im,{samples:[0],window:[0,0,40000,40000]}))[0][0],11);
  assert.equal(large.counters.raw,1);assert.equal(desktop.stats().hardReadBudgetBytes,null);
});
test('desktop-mode iPad with pointer fine still receives mobile limits',opts,async()=>{
  const rt=runtime(true,{userAgent:'Mozilla Macintosh',platform:'',maxTouchPoints:5}),f=image({width:40000,height:40000});
  await assert.rejects(rt.read(f.im,{samples:[0],window:[0,0,40000,40000]}),limited);
  assert.equal(rt.stats().mobile,true);
});
test('configure cannot raise mobile simultaneous reads above 32 MiB',opts,async()=>{
  const rt=runtime(),gate=deferred(),started=deferred();let calls=0;
  rt.configure({readBudgetBytes:128*MiB,concurrency:2});
  const f=image({width:768,height:1024,tileWidth:256,tileHeight:256,counts:Array(12).fill(256*1024),read:()=>{calls++;started.resolve();return calls===1?gate.promise:Promise.resolve([new Float32Array([11])]);}});
  const first=rt.read(f.im,{window:[0,0,768,1024],samples:[0]});await started.promise;
  const second=rt.read(f.im,{window:[0,0,768,1024],samples:[0]});await tick();
  assert.equal(calls,1);assert.equal(rt.stats().queued,1);assert(rt.stats().activeEstimatedBytes<=32*MiB);
  gate.resolve([new Float32Array([11])]);await first;await second;assert.equal(calls,2);
});
test('lowering a configured budget rejects queued oversized reads without starvation',opts,async()=>{
  const rt=runtime(),gate=deferred(),started=deferred();let calls=0;
  const f=image({width:768,height:1024,tileWidth:256,tileHeight:256,counts:Array(12).fill(256*1024),read:()=>{calls++;started.resolve();return gate.promise;}});
  const first=rt.read(f.im,{window:[0,0,768,1024],samples:[0]});await started.promise;
  const second=rt.read(f.im,{window:[0,0,768,1024],samples:[0]});
  const rejected=assert.rejects(second,limited);rt.configure({readBudgetBytes:10*MiB});await rejected;
  assert.equal(rt.stats().queued,0);assert.equal(calls,1);
  gate.resolve([new Float32Array([11])]);await first;
});

async function reader(options={}){
  let sourceObject,reads=0;
  const window={GeoMineRasterSource:{
    wait:promise=>Promise.resolve(promise),
    read:async part=>{reads++;if(options.read)return options.read(part,reads);return new Uint8Array(part.size).fill(7).buffer;}
  },GeoTIFF:{GeoTIFF:{fromSource:async source=>{sourceObject=source;return {};}}}};
  const context={window,navigator:{userAgent:options.desktop?'Desktop':'iPad',platform:options.desktop?'Linux':'iPad',maxTouchPoints:options.desktop?0:5},AbortController,console};
  vm.createContext(context);vm.runInContext(source('import-reader.js'),context);
  const blob={size:options.size||128*MiB,slice:(start,end)=>({offset:start,size:end-start})};
  await window.GeoMineRasterImport.open(blob);
  return {source:sourceObject,stats:window.GeoMineRasterImport.stats,get reads(){return reads}};
}
test('oversized header range rejects before any provider read, even beyond EOF',opts,async()=>{
  const r=await reader({size:8});
  await assert.rejects(r.source.fetch([{offset:0,length:16*MiB+1}]),limited);
  assert.equal(r.reads,0);assert.equal(r.stats().rangeBytes,0);
});
test('a fetch batch is limited before Promise.all allocates each output',opts,async()=>{
  const r=await reader();
  await assert.rejects(r.source.fetch([{offset:0,length:9*MiB},{offset:10*MiB,length:9*MiB}]),limited);
  assert.equal(r.reads,0);assert.equal(r.stats().rangeBytes,0);
});
test('parallel fetch calls share the same global range reservation',opts,async()=>{
  const gate=deferred(),r=await reader({read:async(part,index)=>index===1?gate.promise:new ArrayBuffer(part.size)});
  const first=r.source.fetch([{offset:0,length:8*MiB}]);await tick();
  await assert.rejects(r.source.fetch([{offset:20*MiB,length:8*MiB+1}]),limited);
  assert.equal(r.stats().rangeBytes,8*MiB);
  gate.resolve(new ArrayBuffer(4*MiB));await first;await tick();assert.equal(r.stats().rangeBytes,0);
});
test('failure of one slice keeps reservations until its pending sibling finishes',opts,async()=>{
  const gate=deferred(),r=await reader({read:async(part)=>part.offset===0?Promise.reject(new Error('provider failed')):gate.promise});
  await assert.rejects(r.source.fetch([{offset:0,length:4*MiB},{offset:4*MiB,length:4*MiB}]),/provider failed/);
  assert.equal(r.stats().rangeBytes,8*MiB);
  await assert.rejects(r.source.fetch([{offset:20*MiB,length:9*MiB}]),limited);
  gate.resolve(new ArrayBuffer(4*MiB));await tick();assert.equal(r.stats().rangeBytes,0);
});
test('normal source ranges and desktop EOF clipping remain compatible',opts,async()=>{
  const r=await reader({size:512}),result=await r.source.fetch([{offset:10,length:100},{offset:200,length:100}]);
  assert.deepEqual(Array.from(result,b=>b.byteLength),[100,100]);assert.equal(new Uint8Array(result[0])[0],7);
  const desktop=await reader({desktop:true,size:16});
  assert.equal((await desktop.source.fetch([{offset:0,length:32*MiB}]))[0].byteLength,16);
  assert.equal(desktop.stats().rangeBudgetBytes,null);
});
