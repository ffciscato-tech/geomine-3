import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src/modules/raster/tile-runtime.js'),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};};
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setTimeout(resolve,0));};
function runtime(){
  const context={console,setTimeout,clearTimeout,queueMicrotask,performance,
    ArrayBuffer,Uint8Array,Uint16Array,Float32Array,DOMException,AbortController,
    navigator:{hardwareConcurrency:8},requestAnimationFrame:fn=>setTimeout(fn,0)};
  context.window=context;vm.createContext(context);vm.runInContext(source,context);
  const api=context.GeoMineTileRuntime;
  assert.ok(api,'runtime precisa publicar sua API');
  return api;
}
function image({width=1000,height=800,planar=1,samples=3,decode,read}={}){
  const calls={decode:[],read:[]};
  const im={fileDirectory:{PlanarConfiguration:planar,SamplesPerPixel:samples},planarConfiguration:planar,
    getWidth:()=>width,getHeight:()=>height,getSamplesPerPixel:()=>samples,
    getTileOrStrip(x,y,sample,pool){
      calls.decode.push({x,y,sample,pool});
      return decode?decode(x,y,sample,pool):Promise.resolve({x,y,sample,data:Uint8Array.of(x,y,sample,255).buffer});
    },
    readRasters(options){calls.read.push(options);return read?read(options):Promise.resolve(Uint8Array.of(1,2,3));}};
  return {im,calls};
}
function tiff(images){
  const calls={count:0,image:[]};
  return {calls,getImageCount:async()=>{calls.count++;return images.length;},
    getImage:async index=>{calls.image.push(index);return images[index];}};
}
let checked=0;
async function check(name,test){await test();checked++;console.log('OK · '+name);}

await check('cache deduplica decodificações simultâneas e conserva os bytes',async()=>{
  const api=runtime(),pending=deferred(),bytes=new Float32Array([-9999,1.2345,NaN,400]);
  const h=image({decode:()=>pending.promise});api.prepareImage(h.im);
  const first=h.im.getTileOrStrip(2,3,0),second=h.im.getTileOrStrip(2,3,0);
  await settle();assert.equal(h.calls.decode.length,1);
  pending.resolve({x:2,y:3,sample:0,data:bytes.buffer});
  const [a,b]=await Promise.all([first,second]);
  assert.deepEqual(new Uint8Array(a.data),new Uint8Array(bytes.buffer));
  assert.deepEqual(new Uint8Array(b.data),new Uint8Array(bytes.buffer));
  const again=await h.im.getTileOrStrip(2,3,0);
  assert.deepEqual(new Uint8Array(again.data),new Uint8Array(bytes.buffer));
  assert.equal(h.calls.decode.length,1);assert.ok(api.stats().deduplicated>=1);
});
await check('RGB intercalado compartilha tile bruto mas devolve sample solicitado',async()=>{
  const api=runtime(),pending=deferred(),h=image({decode:()=>pending.promise});api.prepareImage(h.im);
  const requests=[0,1,2].map(sample=>h.im.getTileOrStrip(4,5,sample));await settle();
  assert.equal(h.calls.decode.length,1);assert.equal(h.calls.decode[0].sample,0);
  pending.resolve({x:4,y:5,sample:0,data:Uint8Array.of(10,20,30,40,50,60).buffer});
  const values=await Promise.all(requests);
  assert.deepEqual(values.map(value=>value.sample),[0,1,2]);
  for(const value of values)assert.deepEqual([...new Uint8Array(value.data)],[10,20,30,40,50,60]);
  const cached=await h.im.getTileOrStrip(4,5,2);assert.equal(cached.sample,2);
  assert.equal(h.calls.decode.length,1);
});
await check('bandas planares e imagens distintas não misturam cache',async()=>{
  const api=runtime(),a=image({planar:2}),b=image({planar:2});
  api.prepareImage(a.im);api.prepareImage(b.im);
  for(const sample of [0,1,2]){
    const got=await a.im.getTileOrStrip(1,2,sample);assert.equal(new Uint8Array(got.data)[2],sample);
  }
  await b.im.getTileOrStrip(1,2,0);
  assert.equal(a.calls.decode.length,3);assert.equal(b.calls.decode.length,1);
  await a.im.getTileOrStrip(1,2,1);assert.equal(a.calls.decode.length,3);
});
await check('preparação é idempotente e estilo não invalida os pixels brutos',async()=>{
  const api=runtime(),h=image();assert.equal(api.prepareImage(h.im),h.im);
  const getter=h.im.getTileOrStrip;api.prepareImage(h.im);assert.equal(h.im.getTileOrStrip,getter);
  const a=await h.im.getTileOrStrip(0,0,0);h.im.style={palette:'outra',opacity:0.4};
  const b=await h.im.getTileOrStrip(0,0,0);assert.deepEqual(new Uint8Array(a.data),new Uint8Array(b.data));
  assert.equal(h.calls.decode.length,1);
});
await check('LRU respeita orçamento e remove primeiro o tile menos recente',async()=>{
  const api=runtime(),h=image();api.configure({maxBytes:12});api.prepareImage(h.im);
  for(const x of [1,2,3,1,4])await h.im.getTileOrStrip(x,0,0);
  assert.equal(h.calls.decode.length,4);assert.ok(api.stats().bytes<=12);assert.ok(api.stats().evictions>=1);
  await h.im.getTileOrStrip(1,0,0);assert.equal(h.calls.decode.length,4,'tile tocado recentemente continua no cache');
  await h.im.getTileOrStrip(2,0,0);assert.equal(h.calls.decode.length,5,'tile antigo precisa ser relido');
  api.clear();assert.equal(api.stats().bytes,0);assert.equal(api.stats().entries,0);
  await h.im.getTileOrStrip(1,0,0);assert.equal(h.calls.decode.length,6);
});
await check('tile maior que orçamento não fica retido e cache zero é permitido',async()=>{
  const api=runtime(),h=image();api.configure({maxBytes:3});api.prepareImage(h.im);
  await h.im.getTileOrStrip(0,0,0);await h.im.getTileOrStrip(0,0,0);
  assert.equal(h.calls.decode.length,2);assert.equal(api.stats().bytes,0);
  api.configure({maxBytes:0});await h.im.getTileOrStrip(0,0,0);await h.im.getTileOrStrip(0,0,0);
  assert.equal(h.calls.decode.length,4);assert.equal(api.stats().entries,0);
});
await check('falha de decodificação não envenena cache nem tentativa seguinte',async()=>{
  const api=runtime(),pending=deferred();let attempts=0;
  const h=image({decode:(x,y,sample)=>++attempts===1?pending.promise:Promise.resolve({x,y,sample,data:Uint8Array.of(9).buffer})});
  api.prepareImage(h.im);
  const a=h.im.getTileOrStrip(0,0,0),b=h.im.getTileOrStrip(0,0,1);
  const both=Promise.allSettled([a,b]);pending.reject(new Error('leitura temporária'));
  assert.deepEqual((await both).map(value=>value.status),['rejected','rejected']);
  assert.equal(api.stats().inFlight,0);
  assert.equal(new Uint8Array((await h.im.getTileOrStrip(0,0,0)).data)[0],9);
  assert.equal(attempts,2);
});
await check('clear não interrompe leitura compartilhada que já está em andamento',async()=>{
  const api=runtime(),pending=deferred(),h=image({decode:()=>pending.promise});api.prepareImage(h.im);
  const a=h.im.getTileOrStrip(0,0,0);api.clear();const b=h.im.getTileOrStrip(0,0,0);
  pending.resolve({x:0,y:0,sample:0,data:Uint8Array.of(8,7,6).buffer});
  const result=await Promise.all([a,b]);assert.equal(h.calls.decode.length,1);
  for(const item of result)assert.deepEqual([...new Uint8Array(item.data)],[8,7,6]);
});
await check('overview escolhe escala adequada e mantém fatores X e Y separados',async()=>{
  const api=runtime(),native=image({width:1000,height:800}).im,
    half=image({width:500,height:320}).im,quarter=image({width:250,height:160}).im;
  const tif=tiff([native,half,quarter]);
  const close=await api.overview(tif,native,1000,800,1);assert.equal(close.im,native);assert.equal(close.fx,1);assert.equal(close.fy,1);
  const middle=await api.overview(tif,native,1000,800,3);assert.equal(middle.im,half);assert.equal(middle.fx,2);assert.equal(middle.fy,2.5);
  const far=await api.overview(tif,native,1000,800,8);assert.equal(far.im,quarter);assert.equal(far.fx,4);assert.equal(far.fy,5);
  const before={count:tif.calls.count,images:tif.calls.image.length};
  await api.overview(tif,native,1000,800,3);await api.overview(tif,native,1000,800,8);
  assert.deepEqual({count:tif.calls.count,images:tif.calls.image.length},before,'metadados não devem ser relidos a cada tile');
});
await check('metadados de overview são deduplicados e não se misturam entre arquivos',async()=>{
  const api=runtime(),a=image().im,b=image({width:500,height:400}).im,c=image().im;
  const first=tiff([a,b]),second=tiff([c]);
  const results=await Promise.all([api.overview(first,a,1000,800,3),api.overview(first,a,1000,800,3)]);
  assert.equal(results[0].im,b);assert.equal(results[1].im,b);assert.equal(first.calls.count,1);
  assert.equal((await api.overview(second,c,1000,800,3)).im,c);
});
await check('falha temporária de metadados permite nova tentativa de overview',async()=>{
  const api=runtime(),native=image().im,half=image({width:500,height:400}).im;
  let countCalls=0,imageCalls=0;
  const tif={getImageCount:async()=>{if(++countCalls===1)throw Error('metadados indisponíveis');return 2;},
    getImage:async i=>{imageCalls++;return i===1?half:native;}};
  await assert.rejects(api.overview(tif,native,1000,800,3),/metadados indisponíveis/);
  assert.equal((await api.overview(tif,native,1000,800,3)).im,half);
  assert.equal(countCalls,2);assert.equal(imageCalls,1);
});
await check('IFD de máscara não é usado como overview de cor',async()=>{
  const api=runtime(),native=image().im,half=image({width:500,height:400}).im;
  const mask=image({width:250,height:200}).im;mask.fileDirectory.NewSubfileType=4;
  assert.equal((await api.overview(tiff([native,half,mask]),native,1000,800,8)).im,half);
});
await check('fila limita concorrência a duas leituras e encaminha opções sem alteração',async()=>{
  const api=runtime();api.configure({concurrency:2});const pending=Array.from({length:4},()=>deferred());
  let active=0,peak=0,started=0;
  const h=image({read:async options=>{const id=started++;active++;peak=Math.max(peak,active);
    try{await pending[id].promise;return new Uint16Array(options.window);}finally{active--;}}});
  const options=[0,1,2,3].map(i=>({window:[i,2,3,4],width:8,height:4,interleave:true,resampleMethod:'nearest'}));
  const jobs=options.map(o=>api.read(h.im,o));await settle();assert.equal(started,2);assert.equal(peak,2);
  for(const item of pending){item.resolve();await settle();}
  const outputs=await Promise.all(jobs);assert.equal(peak,2);assert.equal(started,4);
  for(let i=0;i<outputs.length;i++)assert.deepEqual([...outputs[i]],options[i].window);
  assert.ok(h.calls.read.every(o=>options.some(expected=>JSON.stringify(o)===JSON.stringify(expected))),
    'janela, dimensões e amostragem devem chegar intactas ao GeoTIFF');
  assert.equal(api.stats().active,0);assert.equal(api.stats().queued,0);
});
await check('zoom antigo sai da fila antes de ler e resultado obsoleto é descartado',async()=>{
  const api=runtime();api.configure({concurrency:1});const first=deferred();let current=true;
  const h=image({read:options=>options.name==='bloqueio'?first.promise:Promise.resolve(options.name)});
  const oldRunning=api.read(h.im,{name:'bloqueio'},{isCurrent:()=>current});
  const oldQueued=api.read(h.im,{name:'obsoleto'},{isCurrent:()=>current});
  const states=Promise.allSettled([oldRunning,oldQueued]);await settle();assert.equal(h.calls.read.length,1);
  current=false;const fresh=api.read(h.im,{name:'atual'},{isCurrent:()=>true});first.resolve('antigo');
  const out=await states;assert.equal(await fresh,'atual');
  assert.ok(out.every(value=>value.status==='rejected'&&value.reason.name==='AbortError'));
  assert.ok(!h.calls.read.some(o=>o.name==='obsoleto'));assert.equal(api.stats().active,0);
});
await check('fila prioriza vista atual e o pedido mais novo em caso de empate',async()=>{
  const api=runtime();api.configure({concurrency:1});const gate=deferred(),order=[];
  const h=image({read:options=>{order.push(options.name);return options.name==='ativo'?gate.promise:Promise.resolve(options.name);}});
  const active=api.read(h.im,{name:'ativo'});await settle();
  const oldest=api.read(h.im,{name:'antigo'},{priority:1});
  const newest=api.read(h.im,{name:'novo'},{priority:1});
  const priority=api.read(h.im,{name:'urgente'},{priority:0});gate.resolve('ativo');
  await Promise.all([active,oldest,newest,priority]);assert.deepEqual(order,['ativo','urgente','novo','antigo']);
});
await check('erro de leitura libera a fila e não impede uso posterior',async()=>{
  const api=runtime();api.configure({concurrency:1});let reads=0;
  const h=image({read:async()=>{if(++reads===1)throw Error('erro do decodificador');return Uint8Array.of(12);}});
  const failed=api.read(h.im,{});const failure=assert.rejects(failed,/erro do decodificador/);
  const next=api.read(h.im,{});await failure;assert.equal((await next)[0],12);
  assert.equal(api.stats().active,0);assert.equal(api.stats().queued,0);
  api.resetStats();assert.equal(api.stats().reads,0);assert.equal(api.stats().errors,0);
});
await check('orçamento de janela limita memória mesmo com dois slots disponíveis',async()=>{
  const api=runtime();api.configure({concurrency:2,readBudgetBytes:150});
  const first=deferred(),second=deferred();let started=0;
  const h=image({samples:1,read:()=>++started===1?first.promise:second.promise});
  const a=api.read(h.im,{samples:[0],window:[0,0,10,10]});
  const b=api.read(h.im,{samples:[0],window:[0,0,10,10]});
  await settle();assert.equal(started,1);assert.equal(api.stats().activeBytes,100);assert.equal(api.stats().queued,1);
  first.resolve(Uint8Array.of(1));await a;await settle();assert.equal(started,2);
  second.resolve(Uint8Array.of(2));await b;assert.equal(api.stats().activeBytes,0);
});
await check('janela acima do orçamento executa sozinha sem bloquear a fila para sempre',async()=>{
  const api=runtime();api.configure({concurrency:2,readBudgetBytes:50});
  const first=deferred();let started=0;
  const h=image({samples:1,read:()=>++started===1?first.promise:Promise.resolve(Uint8Array.of(2))});
  const a=api.read(h.im,{samples:[0],window:[0,0,10,10]});
  const b=api.read(h.im,{samples:[0],window:[0,0,1,1]});
  await settle();assert.equal(started,1);assert.equal(api.stats().active,1);
  first.resolve(Uint8Array.of(1));await a;assert.equal((await b)[0],2);
  assert.equal(api.stats().activeBytes,0);
});
await check('janela pequena em strip largo inclui todas as bandas decodificadas no orçamento',async()=>{
  const api=runtime();api.configure({concurrency:2,readBudgetBytes:400000});
  const first=deferred(),second=deferred();let started=0;
  const h=image({width:10000,height:100,samples:3,read:()=>++started===1?first.promise:second.promise});
  h.im.getTileWidth=()=>10000;h.im.getTileHeight=()=>10;h.im.getBytesPerPixel=()=>3;
  // Saída: 25 B; janela solicitada: 100 B; strip RGB decodificado: 300000 B.
  const options={samples:[0],window:[0,0,10,10],width:5,height:5};
  const a=api.read(h.im,options),b=api.read(h.im,options);await settle();
  assert.equal(started,1,'duas janelas pequenas não podem esconder dois strips grandes');
  assert.equal(api.stats().activeBytes,300125);assert.equal(api.stats().activeEstimatedBytes,300125);
  assert.equal(api.stats().readBudgetIsEstimate,true);assert.equal(api.stats().queued,1);
  first.resolve(Uint8Array.of(1));await a;await settle();assert.equal(started,2);
  second.resolve(Uint8Array.of(2));await b;assert.equal(api.stats().activeEstimatedBytes,0);
});
await check('abortar consumidor não aborta o bloco de outro tile visível',async()=>{
  const api=runtime(),pending=deferred(),controller=new AbortController(),seenSignals=[];
  const h=image();h.im.getTileOrStrip=function(x,y,sample,pool,signal){seenSignals.push(signal);return pending.promise;};
  api.prepareImage(h.im);
  const old=h.im.getTileOrStrip(2,3,0,null,controller.signal),live=h.im.getTileOrStrip(2,3,1);
  const oldResult=assert.rejects(old,error=>error.name==='AbortError');controller.abort();
  pending.resolve({x:2,y:3,sample:0,data:Uint8Array.of(11,22,33).buffer});
  await oldResult;assert.deepEqual([...new Uint8Array((await live).data)],[11,22,33]);
  assert.deepEqual(seenSignals,[undefined]);
});
await check('signal de leitura é local ao chamador e não chega ao decoder compartilhado',async()=>{
  const api=runtime(),pending=deferred(),controller=new AbortController(),h=image({read:()=>pending.promise});
  const options={signal:controller.signal,window:[0,0,3,3],samples:[0]};
  const request=api.read(h.im,options),outcome=assert.rejects(request,error=>error.name==='AbortError');
  await settle();assert.equal(h.calls.read.length,1);assert.equal(h.calls.read[0].signal,undefined);
  assert.equal(options.signal,controller.signal,'runtime não deve alterar opções do chamador');
  controller.abort();pending.resolve(Uint8Array.of(1));await outcome;
  assert.equal(api.stats().active,0);
});
console.log('Runtime de tiles: '+checked+' cenários aprovados.');
