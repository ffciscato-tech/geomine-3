/* Read-only project ingestion from File/Android document providers.
   Bounded, sequential byte reads; retry a failed range, never append it twice.
   No cloud credentials, network fetch, autosave, or mutation of project state.
   A provider denying all reads still requires a fresh user file selection. */
(function(){
'use strict';
const CHUNK=1024*1024,WHOLE_LIMIT=32*1024*1024,STALL=60000,STARTUP=180000;
const error=(name,message,cause)=>Object.assign(new Error(message),{name,cause});
const abort=()=>error('AbortError','Abertura cancelada.');
function timeout(){return error('TimeoutError','O Drive não respondeu à leitura do projeto a tempo.');}
function incomplete(){return error('NotReadableError','O provedor entregou um trecho incompleto do projeto.');}
async function read(file,options={}){
 const total=Number(file?.size),signal=options.signal;
 if(!Number.isSafeInteger(total)||total<=0)throw error('NotReadableError','O arquivo selecionado está vazio ou indisponível no Drive. Selecione-o novamente.');
 // Drive can hydrate a large cloud file before delivering its first byte.
 // Limit inactivity, not total transfer time while bytes keep arriving.
 const started=Date.now(),requestedDeadline=Number(options.deadlineMs);
 const deadline=Number.isFinite(requestedDeadline)&&requestedDeadline>0?requestedDeadline:Infinity;
 const stall=Math.max(1,Number(options.timeoutMs)||STALL);
 const startup=Math.max(stall,Number(options.startupTimeoutMs)||(options.timeoutMs?stall:STARTUP));
 let receivedBytes=false;
 const details=[];
 const check=()=>{if(signal?.aborted)throw abort();if(Date.now()-started>=deadline)throw timeout();};
 const notify=(loaded,phase,attempt=1)=>{try{options.onProgress?.({loaded,total,phase,attempt});}catch(_){};};
 // onStop is called on timeout/cancel, so readers/streams cannot keep using
 // the cloud document after the failed operation has been discarded.
 function bounded(start,onStop){
  return new Promise((resolve,reject)=>{
   let settled=false,timer=null,last=0;
   const finish=(err,value)=>{
    if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);
    if(err){try{onStop?.();}catch(_){}reject(err);}else resolve(value);
   };
   const cancel=()=>finish(abort());
   const reset=()=>{clearTimeout(timer);timer=setTimeout(()=>finish(timeout()),Math.min(receivedBytes?stall:startup,Math.max(1,deadline-(Date.now()-started))));};
   const progress=bytes=>{if(Number(bytes)>last){last=Number(bytes);receivedBytes=true;reset();}};
   try{check();signal?.addEventListener('abort',cancel,{once:true});reset();
    Promise.resolve(start(progress)).then(value=>finish(null,value),err=>finish(err));
   }catch(e){finish(e);}
  });
 }
 function fileReader(blob,asText=false,report=false){
  let reader;
  return bounded(progress=>new Promise((resolve,reject)=>{
   reader=new FileReader();
   reader.onload=()=>resolve(reader.result);
   reader.onerror=()=>reject(reader.error||incomplete());
   reader.onabort=()=>reject(abort());
   reader.onprogress=e=>{progress(e.loaded);if(report)notify(Math.min(total,e.loaded),'read');};
   if(asText)reader.readAsText(blob,'UTF-8');else reader.readAsArrayBuffer(blob);
  }),()=>{if(reader){reader.onload=reader.onerror=reader.onabort=reader.onprogress=null;reader.abort();}});
 }
 const record=(method,e)=>{
  if(e?.name==='AbortError'||e?.name==='SecurityError')throw e;
  details.push({method,name:e?.name||'Error',message:e?.message||String(e)});
 };
 async function pause(ms){let id;await bounded(()=>new Promise(r=>{id=setTimeout(r,ms);}),()=>clearTimeout(id));}
 async function forwardStream(){
  let reader,finished=false,stopped=false;
  const stop=()=>{if(stopped||!reader)return;stopped=true;try{void reader.cancel().catch(()=>{});}catch(_){}};
  try{
   check();notify(0,'read');reader=file.stream().getReader();
   const decoder=new TextDecoder('utf-8',{fatal:true}),parts=[];let loaded=0,reported=0,reportedAt=Date.now();
   while(true){
    const item=await bounded(()=>reader.read(),stop);
    if(item.done)break;
    if(item.value?.byteLength){receivedBytes=true;loaded+=item.value.byteLength;if(loaded>total)throw incomplete();parts.push(decoder.decode(item.value,{stream:true}));if(loaded===total||loaded-reported>=CHUNK||Date.now()-reportedAt>=200){notify(loaded,'read');reported=loaded;reportedAt=Date.now();}}
   }
   if(loaded!==total)throw incomplete();parts.push(decoder.decode());check();finished=true;return parts.join('');
  }finally{if(reader){if(!finished)stop();try{reader.releaseLock();}catch(_){}}}
 }
 const android=typeof navigator!=='undefined'&&/Android/i.test((navigator.userAgent||'')+' '+(navigator.userAgentData?.platform||'')),
  preferSequential=options.preferStream===true||(options.preferStream!==false&&android&&total>WHOLE_LIMIT);
 let streamTried=false;
 try{
  check();notify(0,'read');
  // Arquivos modestos não precisam de uma nova chamada ao provedor Android
  // por MiB. Uma leitura sequencial limitada evita essa latência; arquivos
  // grandes e provedores incompatíveis conservam o caminho por faixas.
  if(!preferSequential&&options.wholeFile!==false&&total<=WHOLE_LIMIT&&typeof FileReader!=='undefined'&&typeof TextDecoder!=='undefined'){
   try{
    const bytes=await fileReader(file,false,true);
    if(Object.prototype.toString.call(bytes)!=='[object ArrayBuffer]'||bytes.byteLength!==total)throw incomplete();
    const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    check();notify(total,'read');return text;
   }catch(e){record('whole',e);}
  }
  // Android document providers may reopen/seek their remote document for
  // every Blob.slice. A 200 MB project used to cause ~200 separate provider
  // requests. Consume one forward stream first; retain ranges as fallback.
  if(preferSequential&&typeof file.stream==='function'&&typeof TextDecoder!=='undefined'){
   streamTried=true;try{return await forwardStream();}catch(e){record('stream-first',e);}
  }
  if(typeof file.slice==='function'&&typeof TextDecoder!=='undefined'){
   try{
    const decoder=new TextDecoder('utf-8',{fatal:true}),parts=[];
    for(let offset=0;offset<total;offset+=CHUNK){
     const end=Math.min(total,offset+CHUNK);let bytes;
     for(let attempt=1;attempt<=3;attempt++){
      check();
      try{
       const piece=file.slice(offset,end);
       if(piece.size!==end-offset)throw incomplete();
       bytes=typeof FileReader!=='undefined'?await fileReader(piece):await bounded(()=>piece.arrayBuffer());
       if(Object.prototype.toString.call(bytes)!=='[object ArrayBuffer]'||bytes.byteLength!==end-offset)throw incomplete();
       break;
      }catch(e){
       record('range',e);
       if(attempt===3)throw e;
       notify(offset,'retry',attempt+1);await pause(Math.min(400*attempt,Math.max(1,stall/4)));
      }
     }
     receivedBytes=true;parts.push(decoder.decode(bytes,{stream:true}));notify(end,'read');
    }
    parts.push(decoder.decode());check();return parts.join('');
   }catch(e){record('chunks',e);}
  }
  // Some providers expose only a forward stream. Restart with a fresh decoder
  // and byte count; never combine content from independent read strategies.
  if(!streamTried&&typeof file.stream==='function'&&typeof TextDecoder!=='undefined'){
   try{return await forwardStream();}catch(e){record('stream',e);}
  }
  // Preserve compatibility with providers whose complete text API is the
  // only usable path; an explicitly requested overall deadline still applies.
  for(const method of ['FileReader.text','Blob.text']){
   if(method==='FileReader.text'&&typeof FileReader==='undefined')continue;
   if(method==='Blob.text'&&typeof file.text!=='function')continue;
   try{
    check();notify(0,'fallback');
    const text=method==='FileReader.text'?await fileReader(file,true):await bounded(()=>file.text());
    if(typeof text!=='string'||!text.length)throw incomplete();
    const length=new TextEncoder().encode(text).byteLength;
    if(length!==total&&length+3!==total)throw incomplete();
    check();notify(total,'read');return text.replace(/^\uFEFF/,'');
   }catch(e){record(method,e);}
  }
  throw incomplete();
 }catch(cause){
  if(cause?.name==='AbortError')throw cause;
  const e=error(cause?.name==='TimeoutError'?'TimeoutError':'NotReadableError',
   'Não foi possível receber o projeto do Google Drive. Toque em Abrir e selecione o arquivo novamente no Drive para renovar o acesso. O projeto atual não foi substituído.',cause);
  e.diagnostics=details;throw e;
 }
}
window.GeoMineProjectReader={read};
})();
