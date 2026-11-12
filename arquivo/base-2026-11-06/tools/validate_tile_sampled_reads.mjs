import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {deflateSync} from 'node:zlib';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const vendorSource=fs.readFileSync(path.join(root,'src/vendor/geotiff.min.js'),'utf8');
const runtimeSource=fs.readFileSync(path.join(root,'src/modules/raster/tile-runtime.js'),'utf8');
const constructors={Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array,Float32Array,Float64Array};
const vendor={console,setTimeout,clearTimeout,ArrayBuffer,DataView,TextEncoder,TextDecoder,
  ...constructors,Worker:class {constructor(){throw Error('Workers não devem ser ativados.');}}};
vendor.window=vendor;vm.createContext(vendor);vm.runInContext(vendorSource,vendor);
const GeoTIFF=vendor.GeoTIFF;
export function runtime(maxAllocation=Infinity,source=runtimeSource){
  const allocations=[];
  const guarded=Object.fromEntries(Object.entries(constructors).map(([name,Type])=>[name,new Proxy(Type,{
    construct(Target,args){
      if(typeof args[0]==='number'){
        const bytes=args[0]*Target.BYTES_PER_ELEMENT;allocations.push(bytes);
        assert.ok(bytes<=maxAllocation,`Alocação ${name} de ${bytes} B excede saída limitada.`);
      }
      return Reflect.construct(Target,args);
    }
  })]));
  const context={console,setTimeout,clearTimeout,ArrayBuffer,DataView,AbortController,...guarded,
    GeoTIFF,navigator:{},scheduler:{yield:()=>new Promise(resolve=>setTimeout(resolve,0))}};
  context.window=context;vm.createContext(context);vm.runInContext(source,context);
  return {api:context.GeoMineTileRuntime,allocations};
}
const bytesFor=bits=>bits.reduce((n,b)=>n+b/8,0);
export function fixture({width=19,height=13,tileWidth=6,tileHeight=4,tiled=true,planar=1,bits=[8,8,8],
  formats=bits.map(()=>1),littleEndian=true,compression=1,value=(x,y,s)=>x*7+y*13+s*47}={}){
  const tw=tiled?tileWidth:width,th=tiled?tileHeight:Math.min(tileHeight,height),count=bits.length;
  const nx=Math.ceil(width/tw),ny=Math.ceil(height/th),blocks=nx*ny*(planar===1?1:count),fetches=[];
  const offsets=Array.from({length:blocks},(_,i)=>i),byteCounts=Array(blocks).fill(1);
  const fd={ImageWidth:width,ImageLength:height,SamplesPerPixel:count,BitsPerSample:bits,
    SampleFormat:formats,PlanarConfiguration:planar,Compression:compression,GDAL_NODATA:'-9999\0',
    ...(tiled?{TileWidth:tw,TileLength:th,TileOffsets:offsets,TileByteCounts:byteCounts}:
      {RowsPerStrip:th,StripOffsets:offsets,StripByteCounts:byteCounts})};
  function block(index){
    const plane=planar===1?0:Math.floor(index/(nx*ny)),local=index%(nx*ny),bx=local%nx,by=Math.floor(local/nx);
    const bh=tiled?th:Math.min(th,height-by*th),stride=planar===1?bytesFor(bits):bits[plane]/8;
    const data=new ArrayBuffer(tw*bh*stride),view=new DataView(data);
    for(let y=0;y<bh;y++)for(let x=0;x<tw;x++){
      let offset=(y*tw+x)*stride;
      for(const s of planar===1?bits.map((_,i)=>i):[plane]){
        const type=formats[s]===3?'Float':formats[s]===2?'Int':'Uint';
        if(bits[s]===16&&formats[s]===3){
          // Exatos: -2, -1, 0, 1, 2, 3; suficiente para validar float16 nativo.
          const n=(x+bx*tw+y+by*th+s)%6;
          view.setUint16(offset,[0xc000,0xbc00,0,0x3c00,0x4000,0x4200][n],littleEndian);
        }else view[`set${type}${bits[s]}`](offset,value(x+bx*tw,y+by*th,s),littleEndian);
        offset+=bits[s]/8;
      }
    }
    if(compression===8){const encoded=deflateSync(new Uint8Array(data));return encoded.buffer.slice(encoded.byteOffset,encoded.byteOffset+encoded.byteLength);}
    return data;
  }
  const source={fetch:async ranges=>ranges.map(({offset})=>{fetches.push(offset);return block(offset);})};
  const im=new GeoTIFF.GeoTIFFImage(fd,{},null,littleEndian,false,source);
  return {im,fetches,block,nx,ny,tw,th};
}
function comparable(result){
  const planes=ArrayBuffer.isView(result)?[result]:Array.from(result);
  return {width:result.width,height:result.height,planes:planes.map(p=>({type:p.constructor.name,values:Array.from(p)}))};
}
let checked=0,comparisons=0;
async function check(name,test){await test();checked++;console.log('OK · '+name);}
async function compare(config,options){
  const reference=fixture(config),actual=fixture(config),{api}=runtime();
  assert.equal(api.canReadResampled(actual.im,options),true,'fixture deve usar fast path');
  const expected=await reference.im.readRasters({...options,samples:options.samples?.slice()});
  const got=await api.read(actual.im,options);
  assert.deepEqual(comparable(got),comparable(expected));
  assert.equal(api.stats().sampledReads,1);comparisons++;
  return {api,actual,got};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
await check('nearest/bilinear/linear idênticos à biblioteca real em strips, tiles e bandas planares',async()=>{
  for(const tiled of [true,false])for(const planar of [1,2])for(const interleave of [true,false]){
    for(const resampleMethod of ['nearest','bilinear','linear','NEAREST']){
      for(const window of [[0,0,19,13],[2,1,18,12],[-3,-2,22,15]]){
        await compare({tiled,planar},{window,width:7,height:5,samples:[2,0],interleave,resampleMethod,fillValue:23});
      }
    }
  }
});
await check('tipos inteiros, float16/32/64, endian, NaN e NoData conservam semântica',async()=>{
  const types=[[1,8],[1,16],[1,32],[2,8],[2,16],[2,32],[3,16],[3,32],[3,64]];
  for(const [format,bits] of types)for(const littleEndian of [true,false]){
    const config={bits:[bits],formats:[format],littleEndian,value:(x,y)=>{
      if(format===3){if(x===0&&y===0)return NaN;if(x===4&&y===3)return -9999;if(x===8&&y===6)return Infinity;return (x-y)*Math.PI;}
      return (x-y)*10000019;
    }};
    for(const resampleMethod of ['nearest','bilinear']){
      await compare(config,{window:[0,0,19,13],width:9,height:7,resampleMethod,interleave:true});
    }
  }
});
await check('bandas repetidas, coerção interleave e fillValue fora da imagem seguem a biblioteca',async()=>{
  const config={bits:[8,16,32],formats:[1,2,3],value:(x,y,s)=>s===2?x*0.3+y*0.7:(x-y)*19};
  for(const interleave of [true,false])for(const fillValue of [[7,-9999,NaN],NaN,-17,0]){
    await compare(config,{window:[-5,-6,23,17],width:8,height:6,samples:[2,0,2],interleave,fillValue,resampleMethod:'bilinear'});
  }
  // Os valores uint32 precisam passar pela coerção float32 ANTES da interpolação.
  await compare({bits:[32,32],formats:[1,3],value:(x,y,s)=>s?x*0.1:16777217+x*3+y*5},
    {window:[0,0,19,13],width:8,height:6,interleave:true,resampleMethod:'bilinear'});
});
await check('uma dimensão reduzida e saída de um pixel conservam alinhamento',async()=>{
  for(const [width,height] of [[19,5],[7,13],[1,1],[18,12]])for(const resampleMethod of ['nearest','bilinear']){
    await compare({}, {window:[0,0,19,13],width,height,resampleMethod});
  }
});
await check('decodificador Deflate real é usado sem ativar workers',async()=>{
  for(const interleave of [true,false])await compare({compression:8},
    {window:[1,2,19,13],width:7,height:5,resampleMethod:'bilinear',interleave});
});
await check('identidade, upscale, dimensões incompletas e formatos não suportados preservam fallback',async()=>{
  const {api}=runtime(),f=fixture();let calls=0;
  const original=f.im.readRasters.bind(f.im);f.im.readRasters=options=>{calls++;return original(options);};
  for(const options of [{window:[2,3,9,11],width:7,height:8},{window:[0,0,19,13]},
    {window:[0,0,19,13],width:30,height:20}]){
    assert.equal(api.canReadResampled(f.im,options),false);
    assert.deepEqual(comparable(await api.read(f.im,options)),comparable(await fixture().im.readRasters(options)));
  }
  assert.equal(calls,3);assert.equal(api.stats().sampledReads,0);
  for(const options of [{width:3},{width:3,height:2,resampleMethod:'cubic'},
    {width:3,height:2,samples:[9]},{window:[0.5,0,19,13],width:3,height:2}]){
    assert.equal(api.canReadResampled(f.im,options),false);
  }
  const packed=fixture();packed.im.fileDirectory.BitsPerSample=[1,1,1];
  assert.equal(api.canReadResampled(packed.im,{width:3,height:2}),false);
  const mixedPlanar=fixture({planar:2,bits:[8,16],formats:[1,1]});
  assert.equal(api.canReadResampled(mixedPlanar.im,{width:3,height:2}),false);
});
await check('preview floor explícito mantém amostragem histórica e não altera nearest padrão',async()=>{
  const options={window:[1,2,18,12],width:6,height:4,interleave:true,resampleMethod:'nearest'};
  const native=await fixture().im.readRasters({window:options.window,interleave:true});
  const {api}=runtime(),got=await api.read(fixture().im,options,{nearestFloor:true}),expected=[];
  for(let y=0;y<4;y++)for(let x=0;x<6;x++)for(let s=0;s<3;s++){
    expected.push(native[(Math.floor(y*10/4)*17+Math.floor(x*17/6))*3+s]);
  }
  assert.deepEqual(Array.from(got),expected);
  assert.deepEqual(comparable(await api.read(fixture().im,options)),comparable(await fixture().im.readRasters(options)));
  const wide=fixture({width:6000,height:2,tileWidth:6000,tileHeight:2,bits:[16],formats:[1],value:x=>x});
  const stable=await api.read(wide.im,{width:3333,height:1,samples:[0]},{nearestFloor:true});
  for(let x=0;x<3333;x++)assert.equal(stable[0][x],Math.floor(x*6000/3333));
});
await check('janela nativa enorme aloca só saída e visita somente os blocos amostrados',async()=>{
  // Imagem lógica de 16 GiB: blocos sintéticos sob demanda evitam fixture gigante.
  const f=fixture({width:65536,height:65536,tileWidth:64,tileHeight:64,bits:[32],formats:[3],value:(x,y)=>x+y*0.25});
  const {api,allocations}=runtime(32*32*4);api.configure({maxBytes:3*64*64*4});
  f.im.readRasters=()=>{throw Error('Janela nativa não pode ser alocada.');};
  const got=await api.read(f.im,{window:[0,0,65536,65536],width:32,height:32,interleave:true,resampleMethod:'nearest'});
  assert.equal(got.length,1024);assert.equal(f.fetches.length,1024);
  assert.equal(api.stats().sampledValues,1024);assert.equal(new Set(f.fetches).size,1024);
  assert.ok(allocations.every(n=>n<=4096));assert.ok(api.stats().bytes<=3*64*64*4);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++)assert.equal(got[y*32+x],x*2048+y*512);
});
await check('bilinear em limites de blocos usa quatro vizinhos e mantém cache limitado',async()=>{
  const config={width:257,height:193,tileWidth:8,tileHeight:8,bits:[32],formats:[3]};
  const options={window:[3,5,255,191],width:17,height:13,resampleMethod:'bilinear'};
  const f=fixture(config),{api}=runtime(17*13*4);api.configure({maxBytes:512});
  const got=await api.read(f.im,options),expected=await fixture(config).im.readRasters(options);
  assert.deepEqual(comparable(got),comparable(expected));
  assert.ok(api.stats().sampledValues<=17*13*4);assert.ok(api.stats().bytes<=512);
  assert.equal(new Set(f.fetches).size,f.fetches.length,'cada bloco solicitado é decodificado no máximo uma vez por leitura');
});
await check('bilinear evita regressão de memória em previews grandes com redução leve',async()=>{
  const {api}=runtime(),f=fixture({width:6144,height:4096,bits:[8,8,8,8]});
  const options={width:4096,height:2730,interleave:true,resampleMethod:'bilinear'};
  assert.equal(api.canReadResampled(f.im,options),false,
    'quatro planos de vizinhos de 44,7 MB não devem substituir janela nativa de 100,7 MB');
  let fallback=0;const sentinel={width:4096,height:2730};
  f.im.readRasters=async received=>{fallback++;assert.equal(received.resampleMethod,'bilinear');return sentinel;};
  assert.equal(await api.read(f.im,options),sentinel);assert.equal(fallback,1);assert.equal(api.stats().sampledReads,0);
  assert.equal(f.fetches.length,0,'a guarda não lê blocos nem materializa o preview');
  assert.equal(api.canReadResampled(f.im,{...options,resampleMethod:'nearest'}),true,
    'nearest conserva somente saída e continua limitado em qualquer redução');
  assert.equal(api.canReadResampled(f.im,{...options,width:3072,height:2048}),true,
    'redução de duas vezes em ambos os eixos iguala os buffers nativos e preserva fast path');
  assert.equal(api.canReadResampled(f.im,{...options,width:3073,height:2048}),false,
    'acima da razão segura, previews grandes devem conservar fallback');
  const near=fixture({width:1200,height:700,bits:[8,8,8,8]});
  assert.equal(api.canReadResampled(near.im,{width:1024,height:512,interleave:true,resampleMethod:'linear'}),true,
    'saída até 2 MiB conserva cancelamento de tiles');
  assert.equal(api.canReadResampled(near.im,{width:1025,height:512,interleave:true,resampleMethod:'linear'}),false,
    'o alias linear também respeita o limiar de 2 MiB');
});
await check('cancelamento entre blocos interrompe o trabalho restante e libera a fila',async()=>{
  const f=fixture({width:120,height:80}),{api}=runtime();let current=true;
  const fetch=f.im.source.fetch;
  f.im.source.fetch=async ranges=>{const data=await fetch(ranges);current=false;return data;};
  await assert.rejects(api.read(f.im,{width:17,height:13},{isCurrent:()=>current}),error=>error.name==='AbortError');
  assert.equal(f.fetches.length,1);assert.equal(api.stats().active,0);assert.equal(api.stats().inFlight,0);
  const controller=new AbortController(),g=fixture({width:120,height:80}),gFetch=g.im.source.fetch;
  g.im.source.fetch=async ranges=>{const data=await gFetch(ranges);controller.abort();return data;};
  await assert.rejects(api.read(g.im,{width:17,height:13,signal:controller.signal}),error=>error.name==='AbortError');
  assert.equal(g.fetches.length,1);assert.equal(api.stats().active,0);
  const fresh=await api.read(fixture().im,{width:3,height:2});assert.equal(fresh.width,3);
});
await check('um strip grande checa obsolescência durante as linhas amostradas',async()=>{
  const f=fixture({width:400,height:400,tiled:false,tileHeight:400,bits:[8],formats:[1]}),{api}=runtime();
  let checks=0,reading=false;
  const reader=f.im.getReaderForSample.bind(f.im);
  f.im.getReaderForSample=sample=>{
    const original=reader(sample);
    return function(...args){reading=true;return original.apply(this,args);};
  };
  await assert.rejects(api.read(f.im,{width:200,height:200},{isCurrent:()=>!reading||++checks<2}),
    error=>error.name==='AbortError');
  assert.equal(f.fetches.length,1);assert.ok(api.stats().sampledValues<40000);
  assert.equal(api.stats().active,0);
});
await check('leitura simultânea compartilha decoder e cancelamento não descarta consumidor atual',async()=>{
  const f=fixture({width:30,height:20}),{api}=runtime();let current=true,release;
  const gate=new Promise(resolve=>{release=resolve;}),fetch=f.im.source.fetch;
  f.im.source.fetch=async ranges=>{await gate;return fetch(ranges);};
  const options={window:[0,0,30,20],width:3,height:2,samples:[0]};
  const old=api.read(f.im,options,{isCurrent:()=>current});
  const outcome=assert.rejects(old,error=>error.name==='AbortError');
  const live=api.read(f.im,options);
  await new Promise(resolve=>setTimeout(resolve,20));current=false;release();
  await outcome;const got=await live;assert.equal(got[0].length,6);
  assert.ok(api.stats().deduplicated>=1);assert.equal(api.stats().active,0);
});
await check('progresso conta blocos concluídos, cresce e não muda os pixels',async()=>{
  const f=fixture({width:80,height:60,planar:2}),{api}=runtime(),events=[];
  const options={width:21,height:17,samples:[2,0]};
  const result=await api.read(f.im,options,{onProgress:event=>events.push({...event})});
  const expected=await fixture({width:80,height:60,planar:2}).im.readRasters(options);
  assert.deepEqual(comparable(result),comparable(expected));
  assert.ok(events.length>10);assert.equal(events.at(-1).loaded,events.at(-1).total);
  for(let i=0;i<events.length;i++){assert.equal(events[i].loaded,i+1);assert.equal(events[i].phase,'decode');}
});
console.log(`Leitura amostrada: ${checked} cenários, ${comparisons} comparações exatas com GeoTIFF vendorizado.`);
}
