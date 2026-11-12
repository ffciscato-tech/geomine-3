import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src/modules/raster/source-cache.js'),'utf8');
const MiB=1024*1024,CHUNK=4*MiB,LARGE=64*MiB+19;
let checked=0;
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
const fail=(name,message=name)=>Object.assign(new Error(message),{name});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function observe(promise){
  const state={status:'pending',value:undefined,error:undefined};
  Promise.resolve(promise).then(value=>{state.status='resolved';state.value=value;},error=>{state.status='rejected';state.error=error;});
  return state;
}
async function check(name,test){await test();checked++;console.log('OK · '+name);}

class Clock{
  now=0;sequence=0;timers=new Map();
  setTimeout=(callback,delay=0)=>{const id=++this.sequence;this.timers.set(id,{callback,due:this.now+Math.max(0,Number(delay)||0)});return id;};
  clearTimeout=id=>this.timers.delete(id);
  async advance(milliseconds){
    const end=this.now+milliseconds;
    for(;;){
      const next=[...this.timers.entries()].filter(([,timer])=>timer.due<=end).sort((a,b)=>a[1].due-b[1].due||a[0]-b[0])[0];
      if(!next)break;
      this.now=next[1].due;this.timers.delete(next[0]);next[1].callback();await flush();
    }
    this.now=end;await flush();
  }
}
class Signal{
  aborted=false;reason=undefined;listeners=new Map();
  addEventListener(type,callback,options){if(type==='abort')this.listeners.set(callback,options);}
  removeEventListener(type,callback){if(type==='abort')this.listeners.delete(callback);}
  abort(){
    if(this.aborted)return;
    this.aborted=true;this.reason=fail('AbortError');
    for(const [callback,options]of [...this.listeners]){
      if(options?.once)this.listeners.delete(callback);
      callback.call(this,{type:'abort',target:this});
    }
  }
}

// A size-only Blob: each 4 MiB region has a deterministic byte, and each
// FileReader allocation is bounded by one chunk. No fixture holds a huge file.
class FakeBlob{
  constructor(size,{offset=0,seed=37,trace={slices:[],arrayBuffers:0},name,type='image/tiff'}={}){
    Object.defineProperties(this,{
      size:{value:size,enumerable:true},type:{value:type,enumerable:true},
      offset:{value:offset},seed:{value:seed},trace:{value:trace},
      ...(name===undefined?{}:{name:{value:name,enumerable:true},lastModified:{value:123,enumerable:true}})
    });
    Object.freeze(this);
  }
  slice(start=0,end=this.size){
    const a=Math.max(0,Math.min(this.size,start)),b=Math.max(a,Math.min(this.size,end));
    this.trace.slices.push([this.offset+a,this.offset+b]);
    return new FakeBlob(b-a,{offset:this.offset+a,seed:this.seed,trace:this.trace});
  }
  arrayBuffer(){this.trace.arrayBuffers++;throw new Error('Blob.arrayBuffer() bypasses cancellation and must not be used');}
  bytes(length=this.size){
    assert.ok(length<=CHUNK,'a source read must never allocate more than 4 MiB in this fixture');
    const bytes=new Uint8Array(length);
    for(let i=0;i<length;){
      const absolute=this.offset+i,end=Math.min(length,i+CHUNK-(absolute%CHUNK));
      bytes.fill((this.seed+Math.floor(absolute/CHUNK))&255,i,end);i=end;
    }
    return bytes;
  }
}
const file=(size=LARGE,name='original.tif',seed=37)=>new FakeBlob(size,{name,seed});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

function fakeStorage(options={}){
  const old={name:'completed-from-another-session.tif',size:27,complete:true,protected:true,chunks:[{size:27,hash:'existing-native-data'}]};
  const entries=new Map([[old.name,old]]),calls={directories:[],created:[],removed:[],opens:[],writes:[],aborts:[],closes:[],lookups:[],activeWrites:0,maxActiveWrites:0};
  let collisions=options.collisions||0;
  const handle=entry=>({
    async createWritable(){
      assert.ok(!entry.protected,'existing cached files must never be opened for writing');
      calls.opens.push(entry.name);
      if(options.openGate)await options.openGate.promise;
      if(options.openError)throw options.openError;
      let aborted=false,closed=false,pending=null;
      return {
        async write(input){
          assert.equal(aborted,false);assert.equal(closed,false);
          const bytes=input instanceof ArrayBuffer?new Uint8Array(input):ArrayBuffer.isView(input)?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):null;
          assert.ok(bytes,'cache writer receives decoded bytes');
          assert.ok(bytes.byteLength<=CHUNK,'cache writes are at most 4 MiB');
          calls.activeWrites++;calls.maxActiveWrites=Math.max(calls.maxActiveWrites,calls.activeWrites);
          const index=calls.writes.length;
          calls.writes.push({name:entry.name,size:bytes.byteLength,hash:digest(bytes)});
          try{
            if(options.blockWriteAt===index){pending=deferred();await pending.promise;}
            if(options.writeErrorAt===index)throw fail('QuotaExceededError','write failed');
            entry.chunks.push({size:bytes.byteLength,hash:digest(bytes)});entry.size+=bytes.byteLength;
          }finally{calls.activeWrites--;}
        },
        async close(){
          assert.equal(aborted,false);calls.closes.push(entry.name);
          if(options.closeError)throw options.closeError;
          closed=true;entry.complete=true;
        },
        async abort(){aborted=true;calls.aborts.push(entry.name);pending?.reject(fail('AbortError'));}
      };
    },
    async getFile(){
      assert.equal(entry.complete,true,'getFile must happen after close completes');
      if(options.getFileError)throw options.getFileError;
      if(!entry.file)entry.file=file(entry.size+(options.sizeDelta||0),entry.name);
      return entry.file;
    }
  });
  const directory={
    async getFileHandle(name,settings={}){
      calls.lookups.push({name,create:!!settings.create});
      if(options.lookupError)throw options.lookupError;
      if(!settings.create&&collisions>0&&!entries.has(name)){
        collisions--;entries.set(name,{name,size:13,complete:true,protected:true,chunks:[{size:13,hash:'collision-preserved'}]});
      }
      if(!entries.has(name)){
        if(!settings.create)throw fail('NotFoundError');
        if(options.createGate)await options.createGate.promise;
        entries.set(name,{name,size:0,chunks:[],complete:false});calls.created.push(name);
      }
      return handle(entries.get(name));
    },
    async removeEntry(name){assert.notEqual(entries.get(name)?.protected,true,'cleanup must not delete another session');calls.removed.push(name);entries.delete(name);},
    entries(){throw new Error('Cache preparation must not enumerate/prune existing files');},
    values(){throw new Error('Cache preparation must not enumerate/prune existing files');},
    [Symbol.asyncIterator](){throw new Error('Cache preparation must not enumerate/prune existing files');}
  };
  const storage={
    async estimate(){if(options.estimateError)throw options.estimateError;return options.estimate||{quota:2**40,usage:0};},
    async getDirectory(){
      if(options.directoryError)throw options.directoryError;
      return {async getDirectoryHandle(name,settings){
        calls.directories.push({name,create:settings?.create});
        if(options.namespaceError)throw options.namespaceError;
        return directory;
      }};
    }
  };
  return {storage,calls,entries,old,directory};
}

function fixture({android=true,storage=fakeStorage(),readerMode='success',readFailureAt=-1}={}){
  const clock=new Clock(),readers=[],warnings=[],notices=[];
  let lastReader;
  class FakeReader{
    constructor(){
      this.result=null;this.error=null;this.readyState=0;this.listeners=new Map();
      this.record={index:readers.length,aborts:0,size:0,offset:0,ref:new WeakRef(this)};
      readers.push(this.record);lastReader=this;
    }
    addEventListener(type,callback){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(callback);}
    removeEventListener(type,callback){this.listeners.get(type)?.delete(callback);}
    emit(type,extra={}){const event={type,target:this,...extra};this['on'+type]?.(event);for(const listener of [...(this.listeners.get(type)||[])])listener(event);}
    progress(loaded){this.emit('progress',{loaded,total:this.blob.size,lengthComputable:true});}
    succeed(length=this.blob.size){this.result=this.blob.bytes(length).buffer;this.readyState=2;this.emit('load');this.emit('loadend');}
    fail(error=null){this.error=error;this.readyState=2;this.emit('error');this.emit('loadend');}
    abort(){this.record.aborts++;if(this.readyState===1){this.readyState=2;this.emit('abort');this.emit('loadend');}}
    readAsArrayBuffer(blob){
      this.blob=blob;this.record.size=blob.size;this.record.offset=blob.offset;this.readyState=1;
      if(readerMode==='throw')throw fail('SecurityError','provider denied access');
      if(readerMode==='manual')return;
      queueMicrotask(()=>{
        if(this.readyState!==1)return;
        if(this.record.index===readFailureAt||readerMode==='event-error')this.fail();
        else if(readerMode==='error')this.fail(fail('SecurityError','provider denied access'));
        else if(readerMode==='truncated')this.succeed(Math.max(0,blob.size-1));
        else{this.progress(blob.size);this.succeed();}
      });
    }
  }
  const nativeSource=Object.freeze({relativePath:'ALAGIS/rasters/native.tif',sha256:'unchanged'});
  const nativeLayer=Object.freeze({projectNativeSource:nativeSource,_W0:12000,_H0:15000,_sourceRaw:file(31)});
  const c={
    Blob:FakeBlob,File:FakeBlob,FileReader:FakeReader,ArrayBuffer,Uint8Array,DOMException,Promise,WeakRef,
    setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout,queueMicrotask,
    navigator:{userAgent:android?'Mozilla/5.0 (Linux; Android 14)':'Mozilla/5.0 (Macintosh)',...(storage?{storage:storage.storage||storage}:{})},
    crypto:{randomUUID:(()=>{let serial=0;return ()=>`fixture-${++serial}`;})()},
    console:{warn:(...args)=>warnings.push(args.join(' ')),log:()=>{},error:()=>{}},
    toast:message=>notices.push(message),S:Object.freeze({img:nativeLayer,rasters:Object.freeze([nativeLayer])})
  };
  c.window=c;c.globalThis=c;vm.createContext(c);vm.runInContext(source,c,{filename:'source-cache.js'});
  assert.ok(c.GeoMineRasterSource,'module exports GeoMineRasterSource');
  return {api:c.GeoMineRasterSource,c,clock,readers,warnings,notices,storage,nativeLayer,nativeSource,get reader(){return lastReader;}};
}
function clean(f,signal){assert.equal(f.clock.timers.size,0,'all settled timers are cleared');if(signal)assert.equal(signal.listeners.size,0,'all settled abort listeners are removed');}
function rejected(state,name){assert.equal(state.status,'rejected','operation must reject without waiting for its underlying operation');assert.equal(state.error?.name,name);}

await check('wait resolve, rejeição e cancelamento liberam temporizadores/listeners',async()=>{
  for(const kind of ['resolve','reject','reject-null','reject-undefined','abort','pre-abort']){
    const f=fixture(),signal=new Signal(),pending=deferred(),reason=kind==='reject-null'?null:kind==='reject-undefined'?undefined:fail('DataError');
    if(kind==='pre-abort')signal.abort();
    const state=observe(f.api.wait(pending.promise,{signal}));
    if(kind==='resolve')pending.resolve(42);
    else if(kind.startsWith('reject'))pending.reject(reason);
    else if(kind==='abort')signal.abort();
    await flush();
    if(kind==='resolve'){assert.equal(state.status,'resolved');assert.equal(state.value,42);}
    else if(kind.startsWith('reject')){assert.equal(state.status,'rejected');assert.equal(state.error,reason);}
    else rejected(state,'AbortError');
    clean(f,signal);
    if(kind==='abort'||kind==='pre-abort'){pending.reject(fail('LateError'));await flush();}
  }
});
await check('wait limita a espera padrão a 45 s e respeita prazo explícito',async()=>{
  for(const timeoutMs of [undefined,70]){
    const f=fixture(),signal=new Signal(),pending=deferred(),state=observe(f.api.wait(pending.promise,{signal,timeoutMs}));
    const timeout=timeoutMs??45000;
    await f.clock.advance(timeout-1);assert.equal(state.status,'pending');
    await f.clock.advance(1);rejected(state,'TimeoutError');assert.match(state.error.message,/Downloads/i);clean(f,signal);
    pending.resolve('late');await flush();rejected(state,'TimeoutError');
  }
});
await check('read usa FileReader, mantém bytes e informa somente fase waiting',async()=>{
  const f=fixture(),signal=new Signal(),original=file(47),events=[];
  const bytes=await f.api.read(original,{signal,onProgress:event=>events.push(event)});
  assert.deepEqual(new Uint8Array(bytes),original.bytes());assert.equal(original.trace.arrayBuffers,0);
  assert.equal(f.readers.length,1);assert.ok(events.length>0);assert.ok(events.every(event=>event.phase==='waiting'));
  assert.ok(events.every(event=>event.total===47&&event.loaded>=0&&event.loaded<=47));
  assert.equal(events.at(-1).loaded,47);clean(f,signal);
  for(const event of ['load','error','abort','progress'])assert.equal(f.reader['on'+event],null,'settled FileReader handlers are detached');
});
await check('read trata erros do provider, erro só por evento e buffer truncado com Downloads',async()=>{
  for(const readerMode of ['error','event-error','truncated','throw']){
    const f=fixture({readerMode}),signal=new Signal(),original=file(13);
    await assert.rejects(f.api.read(original,{signal}),error=>error.name==='NotReadableError'&&/Downloads/i.test(error.message));
    assert.equal(original.trace.arrayBuffers,0);clean(f,signal);
  }
});
await check('read cancelado aborta FileReader; sinal pré-cancelado não inicia leitura',async()=>{
  for(const beforehand of [false,true]){
    const f=fixture({readerMode:'manual'}),signal=new Signal();if(beforehand)signal.abort();
    const state=observe(f.api.read(file(17),{signal}));if(!beforehand)signal.abort();await flush();
    rejected(state,'AbortError');assert.equal(f.readers.length,beforehand?0:1);
    if(!beforehand)assert.equal(f.readers[0].aborts,1);clean(f,signal);
  }
});
await check('read renova timeout somente quando os bytes aumentam',async()=>{
  const f=fixture({readerMode:'manual'}),signal=new Signal(),events=[];
  const state=observe(f.api.read(file(100),{signal,timeoutMs:100,onProgress:event=>events.push(event)}));
  await f.clock.advance(80);f.reader.progress(10);
  await f.clock.advance(80);assert.equal(state.status,'pending');f.reader.progress(10);f.reader.progress(8);
  await f.clock.advance(19);assert.equal(state.status,'pending');
  await f.clock.advance(1);rejected(state,'TimeoutError');assert.equal(f.readers[0].aborts,1);
  assert.match(state.error.message,/Downloads/i);assert.ok(events.every(event=>event.phase==='waiting'));clean(f,signal);
});
await check('read sem progresso termina após 45 s, inclusive eventos de zero bytes',async()=>{
  const f=fixture({readerMode:'manual'}),state=observe(f.api.read(file(100)));
  await f.clock.advance(44999);f.reader.progress(0);assert.equal(state.status,'pending');
  await f.clock.advance(1);rejected(state,'TimeoutError');clean(f);
});
await check('exceção no observador de progresso não interrompe a leitura',async()=>{
  const f=fixture(),bytes=await f.api.read(file(11),{onProgress(){throw new Error('UI detached');}});
  assert.equal(bytes.byteLength,11);clean(f);
});
await check('desktop e Android pequeno retornam o mesmo Blob sem tocar OPFS',async()=>{
  for(const [android,size]of [[false,LARGE],[true,64*MiB-1]]){
    const storage=fakeStorage(),f=fixture({android,storage}),original=file(size),events=[];
    assert.equal(await f.api.prepare(original,{onProgress:event=>events.push(event)}),original);
    assert.equal(f.readers.length,0);assert.equal(storage.calls.directories.length,0);assert.equal(original.trace.arrayBuffers,0);
    assert.equal(events.at(-1).phase,'direct');clean(f);
  }
});
await check('Android legado sem OPFS/estimate mantém o original em leitura direta',async()=>{
  for(const storage of [null,{}, {storage:{getDirectory:async()=>{throw new Error('must not open without quota check');}}}]){
    const f=fixture({storage}),original=file(),events=[];
    assert.equal(await f.api.prepare(original,{onProgress:event=>events.push(event)}),original);
    assert.equal(events.at(-1).phase,'direct');assert.equal(f.readers.length,0);assert.equal(original.trace.arrayBuffers,0);clean(f);
  }
});
await check('quota insuficiente e metadados de quota inválidos caem para o mesmo Blob',async()=>{
  for(const estimate of [{quota:LARGE+16*MiB-1,usage:0},{quota:LARGE+16*MiB+20,usage:21},{quota:undefined,usage:0},{quota:2**40,usage:NaN}]){
    const storage=fakeStorage({estimate}),f=fixture({storage}),original=file(),events=[];
    assert.equal(await f.api.prepare(original,{onProgress:event=>events.push(event)}),original);
    assert.equal(events.at(-1).phase,'direct');assert.equal(storage.calls.created.length,0);assert.equal(f.readers.length,0);clean(f);
  }
});
await check('Android copia em blocos sequenciais, verifica bytes/tamanho e preserva a fonte nativa',async()=>{
  const storage=fakeStorage({estimate:{quota:LARGE+16*MiB+123,usage:123},collisions:1}),f=fixture({storage}),signal=new Signal(),original=file(),events=[];
  const keys=Reflect.ownKeys(original),nativeBefore=JSON.stringify(f.c.S);
  const result=await f.api.prepare(original,{signal,onProgress:event=>events.push(event)});
  assert.notEqual(result,original);assert.equal(result.size,LARGE);assert.equal(original.trace.arrayBuffers,0);
  assert.deepEqual(storage.calls.directories,[{name:'geomine-raster-import-cache-v1',create:true}]);
  assert.equal(storage.calls.created.length,1);assert.equal(storage.calls.removed.length,0);assert.equal(storage.calls.aborts.length,0);
  assert.equal(storage.calls.maxActiveWrites,1);assert.equal(storage.calls.closes.length,1);assert.equal(f.readers.length,Math.ceil(LARGE/CHUNK));
  assert.equal(storage.entries.get(storage.calls.created[0]).file,result,'return the verified OPFS File directly');
  assert.equal(storage.entries.get(storage.old.name),storage.old);assert.equal(storage.old.chunks[0].hash,'existing-native-data');
  for(let i=0;i<f.readers.length;i++){
    const size=Math.min(CHUNK,LARGE-i*CHUNK),record=f.readers[i],written=storage.calls.writes[i];
    assert.equal(record.offset,i*CHUNK);assert.equal(record.size,size);assert.equal(written.size,size);
    assert.equal(written.hash,digest(new FakeBlob(size,{offset:i*CHUNK}).bytes()));
  }
  assert.equal(events.at(-1).loaded,LARGE);assert.equal(events.at(-1).total,LARGE);assert.equal(events.at(-1).phase,'copy');
  assert.ok(events.every(event=>event.loaded>=0&&event.loaded<=LARGE));
  assert.ok(events.every((event,index)=>index===0||event.loaded>=events[index-1].loaded),'progress never moves backward while a chunk is written');
  assert.equal(JSON.stringify(f.c.S),nativeBefore);assert.equal(f.c.S.img,f.nativeLayer);assert.equal(f.c.S.img.projectNativeSource,f.nativeSource);
  assert.deepEqual(Reflect.ownKeys(original),keys);clean(f,signal);
});
await check('cache reutiliza a mesma fonte, mantém cópias completas e avisa retenção uma vez',async()=>{
  const f=fixture(),a=file(64*MiB,'same.tif'),b=file(64*MiB,'same.tif',93),first=await f.api.prepare(a);
  const reads=f.readers.length,writes=f.storage.calls.writes.length;
  assert.equal(await f.api.prepare(a),first);assert.equal(await f.api.prepare(first),first);
  assert.equal(f.readers.length,reads);assert.equal(f.storage.calls.writes.length,writes);
  const second=await f.api.prepare(b);assert.notEqual(second,first);
  assert.equal(f.storage.calls.created.length,2);assert.equal(new Set(f.storage.calls.created).size,2);
  assert.equal(f.storage.calls.removed.length,0);assert.ok(f.storage.entries.has(first.name));assert.ok(f.storage.entries.has(second.name));
  assert.equal(f.warnings.length,1,'retention warning appears once per module, even with multiple cached sources');clean(f);
});
await check('falhas de armazenamento anteriores à cópia voltam ao original',async()=>{
  for(const options of [
    {estimateError:fail('SecurityError')},{directoryError:fail('SecurityError')},
    {namespaceError:fail('NotAllowedError')},{lookupError:fail('NotAllowedError')},{openError:fail('NotAllowedError')}
  ]){
    const storage=fakeStorage(options),f=fixture({storage}),original=file(),events=[];
    assert.equal(await f.api.prepare(original,{onProgress:event=>events.push(event)}),original);
    assert.equal(events.at(-1).phase,'direct');assert.equal(f.readers.length,0);assert.equal(storage.entries.get(storage.old.name),storage.old);
    assert.deepEqual(storage.calls.removed,storage.calls.created);clean(f);
  }
});
await check('write/close/getFile com falha e cópia truncada limpam somente o temporário',async()=>{
  for(const options of [{writeErrorAt:0},{closeError:fail('UnknownError')},{getFileError:fail('NotReadableError')},{sizeDelta:-1}]){
    const storage=fakeStorage(options),f=fixture({storage}),original=file(64*MiB),events=[];
    assert.equal(await f.api.prepare(original,{onProgress:event=>events.push(event)}),original);
    assert.equal(events.at(-1).phase,'direct');assert.equal(storage.entries.size,1);assert.equal(storage.entries.get(storage.old.name),storage.old);
    assert.deepEqual(storage.calls.removed,storage.calls.created);assert.equal(original.trace.arrayBuffers,0);clean(f);
  }
});
await check('erro real da fonte rejeita, não vira fallback, e remove o parcial',async()=>{
  const storage=fakeStorage(),f=fixture({storage,readFailureAt:1}),original=file(),events=[];
  await assert.rejects(f.api.prepare(original,{onProgress:event=>events.push(event)}),error=>error.name==='NotReadableError'&&/Downloads/i.test(error.message));
  assert.equal(storage.calls.writes.length,1);assert.equal(storage.calls.aborts.length,1);assert.deepEqual(storage.calls.removed,storage.calls.created);
  assert.equal(storage.entries.size,1);assert.equal(storage.entries.get(storage.old.name),storage.old);assert.ok(!events.some(event=>event.phase==='direct'));clean(f);
});
await check('cancelamento durante write pendente aborta gravador e remove só seu parcial',async()=>{
  const storage=fakeStorage({blockWriteAt:0}),f=fixture({storage}),signal=new Signal(),state=observe(f.api.prepare(file(),{signal}));
  for(let i=0;i<20&&storage.calls.writes.length===0;i++)await flush();
  assert.equal(storage.calls.writes.length,1);assert.equal(f.readers.length,1,'next read waits for the preceding write');signal.abort();await flush();
  rejected(state,'AbortError');assert.equal(storage.calls.aborts.length,1);assert.deepEqual(storage.calls.removed,storage.calls.created);
  assert.equal(storage.entries.size,1);assert.equal(storage.entries.get(storage.old.name),storage.old);clean(f,signal);
});
await check('cancelamento durante leitura pendente aborta provider e gravador',async()=>{
  const storage=fakeStorage(),f=fixture({storage,readerMode:'manual'}),signal=new Signal(),state=observe(f.api.prepare(file(),{signal}));
  for(let i=0;i<20&&f.readers.length===0;i++)await flush();
  assert.equal(f.readers.length,1);signal.abort();await flush();
  rejected(state,'AbortError');assert.equal(f.readers[0].aborts,1);assert.equal(storage.calls.aborts.length,1);
  assert.deepEqual(storage.calls.removed,storage.calls.created);assert.equal(storage.entries.size,1);clean(f,signal);
});
await check('timeout do provider rejeita prepare e libera a tentativa parcial',async()=>{
  const storage=fakeStorage(),f=fixture({storage,readerMode:'manual'}),signal=new Signal(),state=observe(f.api.prepare(file(),{signal}));
  for(let i=0;i<20&&f.readers.length===0;i++)await flush();
  assert.equal(f.readers.length,1);await f.clock.advance(45000);rejected(state,'TimeoutError');
  assert.equal(storage.calls.aborts.length,1);assert.deepEqual(storage.calls.removed,storage.calls.created);assert.equal(storage.entries.size,1);clean(f,signal);
});
await check('prepare pré-cancelado não abre cache nem lê o arquivo',async()=>{
  const f=fixture(),signal=new Signal();signal.abort();
  await assert.rejects(f.api.prepare(file(),{signal}),error=>error.name==='AbortError');
  assert.equal(f.storage.calls.created.length,0);assert.equal(f.readers.length,0);clean(f,signal);
});
await check('fatia truncada do provider rejeita antes de gravar qualquer byte',async()=>{
  class TruncatedSource extends FakeBlob{
    slice(start,end){const part=super.slice(start,end);return new FakeBlob(part.size-1,{offset:part.offset,seed:part.seed,trace:part.trace});}
  }
  const f=fixture(),original=new TruncatedSource(LARGE,{name:'provider-truncated.tif'});
  await assert.rejects(f.api.prepare(original),error=>error.name==='NotReadableError'&&/Downloads/i.test(error.message));
  assert.equal(f.readers.length,0);assert.equal(f.storage.calls.writes.length,0);assert.equal(f.storage.entries.size,1);
  assert.deepEqual(f.storage.calls.removed,f.storage.calls.created);clean(f);
});
await check('timeout de write faz fallback direto e limpa somente a tentativa incompleta',async()=>{
  const storage=fakeStorage({blockWriteAt:0}),f=fixture({storage}),signal=new Signal(),original=file(),events=[];
  const state=observe(f.api.prepare(original,{signal,onProgress:event=>events.push(event)}));
  for(let i=0;i<20&&storage.calls.writes.length===0;i++)await flush();
  assert.equal(storage.calls.writes.length,1);await f.clock.advance(45000);
  assert.equal(state.status,'resolved');assert.equal(state.value,original);assert.equal(events.at(-1).phase,'direct');
  assert.equal(storage.calls.aborts.length,1);assert.deepEqual(storage.calls.removed,storage.calls.created);assert.equal(storage.entries.size,1);clean(f,signal);
});
await check('arquivo criado depois do cancelamento é removido sem afetar outros arquivos',async()=>{
  const createGate=deferred(),storage=fakeStorage({createGate}),f=fixture({storage}),signal=new Signal();
  const state=observe(f.api.prepare(file(),{signal}));
  for(let i=0;i<20&&!storage.calls.lookups.some(call=>call.create);i++)await flush();
  assert.ok(storage.calls.lookups.some(call=>call.create));assert.equal(storage.calls.created.length,0);
  signal.abort();await flush();rejected(state,'AbortError');clean(f,signal);
  createGate.resolve();await flush();
  assert.equal(storage.calls.created.length,1);assert.deepEqual(storage.calls.removed,storage.calls.created);
  assert.equal(storage.entries.size,1);assert.equal(storage.entries.get(storage.old.name),storage.old);assert.equal(f.readers.length,0);clean(f,signal);
});
await check('gravador aberto depois do cancelamento é abortado e sua entrada removida',async()=>{
  const openGate=deferred(),storage=fakeStorage({openGate}),f=fixture({storage}),signal=new Signal();
  const state=observe(f.api.prepare(file(),{signal}));
  for(let i=0;i<20&&storage.calls.opens.length===0;i++)await flush();
  assert.equal(storage.calls.opens.length,1);signal.abort();await flush();rejected(state,'AbortError');clean(f,signal);
  openGate.resolve();await flush();
  assert.equal(storage.calls.aborts.length,1);assert.ok(storage.calls.removed.length>=1);
  assert.ok(storage.calls.removed.every(name=>storage.calls.created.includes(name)));
  assert.equal(storage.entries.size,1);assert.equal(storage.entries.get(storage.old.name),storage.old);assert.equal(f.readers.length,0);clean(f,signal);
});

await check('preview longo continua com progresso real e encerra se parar de avançar',async()=>{
  const f=fixture(),signal=new Signal(),pending=deferred();let blocks=0;
  const state=observe(f.api.wait(pending.promise,{signal,timeoutMs:100,progress:()=>blocks}));
  for(let i=1;i<=8;i++){blocks=i;await f.clock.advance(100);assert.equal(state.status,'pending');}
  await f.clock.advance(100);rejected(state,'TimeoutError');clean(f,signal);
  pending.reject(new Error('falha tardia observada'));await flush();
});
await check('cancelamento de preview com progresso limpa timer e listener',async()=>{
  const f=fixture(),signal=new Signal(),pending=deferred();let blocks=0;
  const state=observe(f.api.wait(pending.promise,{signal,timeoutMs:100,progress:()=>blocks}));
  blocks++;await f.clock.advance(100);signal.abort();await flush();
  rejected(state,'AbortError');clean(f,signal);pending.resolve();await flush();
});

console.log(`\n${checked} validações do cache de fonte raster concluídas.`);
