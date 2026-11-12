/* Blob range adapter for the bundled GeoTIFF public fromSource API.
   open(src,{signal,timeoutMs}) returns the real GeoTIFF instance. Blob reads
   share a global two-reader queue and a bounded 16 MiB compressed-block LRU.
   A thousand one-row strips in the same source block cause one FileReader,
   not a thousand. Requested ranges retain their order and exact EOF length.

   release(tiff) detaches the IMPORT signal after commit; the retained TIFF
   remains usable by future tiles. Per-fetch signals cancel only their own
   wait, never a shared physical read. Import cancellation/close cancel all
   this source's queued and active reads. Failed blocks can be retried.
   Decoded tile cache remains the responsibility of GeoMineTileRuntime.
   On mobile, every returned image is prepared there before exposing it to
   callers; direct image.readRasters must not bypass its allocation guard. */
(function(){
'use strict';
if(window.GeoMineRasterImport)return;
const BLOCK_BYTES=4*1024*1024,ANDROID_BLOCK_BYTES=512*1024,MAX_BYTES=16*1024*1024,MAX_ACTIVE=2;
const nav=typeof navigator==='object'?navigator:{},mobile=/Android|iPhone|iPad|iPod/i.test(nav.userAgent||'')||
  (/Mac/i.test((nav.platform||'')+' '+(nav.userAgent||''))&&Number(nav.maxTouchPoints)>1);
const MOBILE_RANGE_BYTES=16*1024*1024;
const cache=new Map(),pending=new Map(),queue=[],states=new WeakMap();
let bytes=0,active=0,sequence=0,rangeBytes=0;
const counters={hits:0,misses:0,deduplicated:0,physicalReads:0,readBytes:0,maxActive:0};
function aborted(){const e=new Error('Leitura do GeoTIFF cancelada.');e.name='AbortError';return e;}
function unreadable(){const e=new Error('Trecho do GeoTIFF incompleto. Baixe o arquivo original completamente e tente novamente.');e.name='NotReadableError';return e;}
function helpers(){
  const h=window.GeoMineRasterSource;
  if(!h||typeof h.read!=='function'||typeof h.wait!=='function')throw new Error('Leitor seguro de GeoTIFF indisponível.');
  return h;
}
function signalCheck(signal){if(signal&&signal.aborted)throw aborted();}
function sourceCheck(state){if(state.closed)throw aborted();signalCheck(state.signal);}
function reserveRanges(state,slices){
  if(!mobile)return 0;
  let requested=0;
  for(const slice of slices){
    const offset=Number(slice?.offset),length=Number(slice?.length);
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||length<0||!Number.isSafeInteger(offset+length))
      throw new RangeError('Intervalo de bytes GeoTIFF inválido.');
    // The declared length also bounds the caller's IFD typed-array size;
    // clipping a huge malformed tag to EOF would not protect that allocation.
    requested+=length;
  }
  // IFD tag arrays and Promise.all(fetch slices) allocate their complete
  // outputs even while physical reads wait in the two-reader queue. Reserve
  // those bytes globally BEFORE creating any range output; do not downsample.
  if(!Number.isSafeInteger(requested)||requested>MOBILE_RANGE_BYTES||rangeBytes+requested>MOBILE_RANGE_BYTES){
    const error=new RangeError('Trechos do GeoTIFF excedem o limite de leitura simultânea de 16 MiB deste dispositivo. A leitura foi interrompida.');
    error.code='RASTER_MEMORY_LIMIT';error.estimatedBytes=rangeBytes+requested;error.limitBytes=MOBILE_RANGE_BYTES;throw error;
  }
  rangeBytes+=requested;return requested;
}
function put(key,data){
  if(data.byteLength>MAX_BYTES)return;
  const old=cache.get(key);if(old){bytes-=old.byteLength;cache.delete(key);}
  while(bytes+data.byteLength>MAX_BYTES&&cache.size){
    const first=cache.keys().next().value;bytes-=cache.get(first).byteLength;cache.delete(first);
  }
  cache.set(key,data);bytes+=data.byteLength;
}
function evictSource(state){
  const prefix=state.id+':';
  for(const [key,data] of cache)if(key.startsWith(prefix)){cache.delete(key);bytes-=data.byteLength;}
}
function cancelSource(state){
  for(const job of state.jobs){
    job.controller.abort();
    if(!job.started&&!job.settled){job.settled=true;job.reject(aborted());}
  }
  // Remove cancelled queue entries immediately, without occupying a reader.
  for(let i=queue.length-1;i>=0;i--)if(queue[i].settled)queue.splice(i,1);
  drain();
}
function drain(){
  while(active<MAX_ACTIVE&&queue.length){
    const job=queue.shift();if(job.settled)continue;
    try{sourceCheck(job.state);signalCheck(job.controller.signal);}
    catch(error){job.settled=true;job.reject(error);continue;}
    job.started=true;active++;counters.physicalReads++;counters.maxActive=Math.max(counters.maxActive,active);
    Promise.resolve().then(()=>{
      const part=job.state.blob.slice(job.offset,job.end);
      if(!part||part.size!==job.end-job.offset)throw unreadable();
      return helpers().read(part,{signal:job.controller.signal,timeoutMs:job.state.timeoutMs});
    }).then(data=>{
      signalCheck(job.controller.signal);
      if(!data||Object.prototype.toString.call(data)!=='[object ArrayBuffer]'||data.byteLength!==job.end-job.offset)throw unreadable();
      counters.readBytes+=data.byteLength;put(job.key,data);return data;
    }).then(data=>{job.settled=true;job.resolve(data);},error=>{job.settled=true;job.reject(error);})
      .finally(()=>{active--;drain();});
  }
}
function block(state,index){
  sourceCheck(state);
  const key=state.id+':'+index,known=cache.get(key);
  if(known){cache.delete(key);cache.set(key,known);counters.hits++;return Promise.resolve(known);}
  if(pending.has(key)){counters.deduplicated++;return pending.get(key);}
  counters.misses++;
  const job={state,key,offset:index*state.blockBytes,end:Math.min(state.blob.size,(index+1)*state.blockBytes),
    controller:new AbortController(),started:false,settled:false};
  const promise=new Promise((resolve,reject)=>{job.resolve=resolve;job.reject=reject;});
  pending.set(key,promise);state.jobs.add(job);queue.push(job);
  const cleanup=()=>{if(pending.get(key)===promise)pending.delete(key);state.jobs.delete(job);};
  promise.then(cleanup,cleanup);drain();return promise;
}
async function range(state,slice){
  sourceCheck(state);
  const offset=Number(slice&&slice.offset),length=Number(slice&&slice.length);
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(length)||length<0||!Number.isSafeInteger(offset+length))
    throw new RangeError('Intervalo de bytes GeoTIFF inválido.');
  const end=Math.min(state.blob.size,offset+length);
  if(end<=offset)return new ArrayBuffer(0);
  const blockBytes=state.blockBytes;
  const first=Math.floor(offset/blockBytes),last=Math.floor((end-1)/blockBytes);
  if(first===last){
    const data=await block(state,first);sourceCheck(state);
    return data.slice(offset-first*blockBytes,end-first*blockBytes);
  }
  // Retain at most one source block here; only the requested output is large.
  const output=new Uint8Array(end-offset);
  for(let index=first;index<=last;index++){
    const data=await block(state,index);sourceCheck(state);
    const start=Math.max(offset,index*blockBytes),stop=Math.min(end,(index+1)*blockBytes);
    output.set(new Uint8Array(data,start-index*blockBytes,stop-start),start-offset);
  }
  return output.buffer;
}
function makeSource(blob,control){
  const state={id:++sequence,blob,signal:control.signal||null,timeoutMs:control.timeoutMs,jobs:new Set(),closed:false};
  // Sparse preview rows in multi-GB striped TIFFs must not cause a complete
  // file scan through 4 MiB read-ahead. Offsets stay safe Numbers above 4 GB.
  // Smaller Android blocks bound provider read-ahead for distant IFDs and
  // overviews. Keep this size fixed for the source, including after adoption:
  // cached and pending block indexes must always denote the same byte range.
  const android=typeof navigator==='object'&&/Android/i.test(navigator.userAgent||'');
  state.blockBytes=blob.size>=1024*1024*1024?128*1024:android?ANDROID_BLOCK_BYTES:BLOCK_BYTES;
  state.onAbort=()=>cancelSource(state);
  if(state.signal)state.signal.addEventListener('abort',state.onAbort,{once:true});
  state.source={fileSize:blob.size,
    fetch(slices,signal){
      try{
        sourceCheck(state);signalCheck(signal);
        if(!Array.isArray(slices))throw new TypeError('Lista de intervalos GeoTIFF inválida.');
        const h=helpers(),reserved=reserveRanges(state,slices),reads=slices.map(slice=>range(state,slice));
        // A failing slice must not release the reservation while sibling
        // slices are still alive. Timeouts also leave this ownership intact.
        Promise.allSettled(reads).then(()=>{rangeBytes-=reserved;});
        const work=Promise.all(reads);
        return h.wait(work,{signal,timeoutMs:state.timeoutMs});
      }catch(error){return Promise.reject(error);}
    },
    close(){
      state.closed=true;cancelSource(state);evictSource(state);
      if(state.signal)state.signal.removeEventListener('abort',state.onAbort);
      state.signal=null;
    }
  };
  return state;
}
function protectImageReads(tiff){
  if(!mobile||!tiff||typeof tiff.getImage!=='function')return tiff;
  const getImage=tiff.getImage;
  tiff.getImage=async function getBoundedImage(...args){
    const image=await getImage.apply(this,args),runtime=window.GeoMineTileRuntime;
    return runtime&&typeof runtime.prepareImage==='function'?runtime.prepareImage(image):image;
  };
  return tiff;
}
async function open(src,control={}){
  signalCheck(control.signal);const h=helpers(),g=window.GeoTIFF;
  if(!g)throw new Error('Biblioteca GeoTIFF indisponível.');
  const isBlob=src&&Number.isSafeInteger(src.size)&&src.size>=0&&typeof src.slice==='function';
  if(!isBlob)return protectImageReads(await h.wait(g.fromArrayBuffer(src),control));
  if(!g.GeoTIFF||typeof g.GeoTIFF.fromSource!=='function')
    throw new Error('A biblioteca GeoTIFF não oferece a API pública de leitura por intervalos.');
  const state=makeSource(src,control);
  try{
    const tiff=await h.wait(g.GeoTIFF.fromSource(state.source,{cache:false},control.signal),control);
    sourceCheck(state);states.set(tiff,state);return protectImageReads(tiff);
  }catch(error){state.source.close();throw error;}
}
function release(tiff){
  const state=states.get(tiff);if(!state)return false;
  if(state.signal)state.signal.removeEventListener('abort',state.onAbort);
  state.signal=null;return !state.closed;
}
function adoptSource(tiff,blob){
  const state=states.get(tiff);
  if(!state||state.closed||!blob||blob.size!==state.blob.size||typeof blob.slice!=='function')return false;
  state.blob=blob;return true;
}
function stats(){return {...counters,blockBytes:BLOCK_BYTES,androidBlockBytes:ANDROID_BLOCK_BYTES,maxBytes:MAX_BYTES,cacheBytes:bytes,
  cacheBlocks:cache.size,pendingBlocks:pending.size,queued:queue.length,active,maxConcurrent:MAX_ACTIVE,
  rangeBytes,rangeBudgetBytes:mobile?MOBILE_RANGE_BYTES:null,mobile};}
window.GeoMineRasterImport={version:1,open,release,adoptSource,stats};
})();
