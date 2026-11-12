/* ============================================================================
   Fonte local estável para GeoTIFF, sem ArrayBuffer do arquivo inteiro.

   wait(promise,{signal,timeoutMs,progress}) limita a espera e remove listeners.
   progress opcional retorna um contador crescente de blocos concluídos: só
   avanço real renova a janela de espera de operações grandes, como previews.
   Não pode cancelar a operação opaca recebida: o chamador deve descartar
   resultados tardios. read(blob,...) também aborta seu FileReader.

   prepare(file,{signal,onProgress}) conserva o Blob no desktop/arquivos
   pequenos. Android >=64 MiB tenta uma cópia OPFS em blocos sequenciais de
   4 MiB. Retorna o File fechado/verificado, ou o MESMO Blob quando o cache
   não está disponível. Erro real da fonte nunca vira fallback silencioso.
   Progresso: {loaded,total,phase:'copy'|'waiting'|'direct',reason?}. Na leitura
   do provider, waiting não promete medir o download/hidratação da nuvem.

   As cópias completas ficam vivas para releitura pelos tiles. Não removemos
   arquivos de outras sessões/abas; não há pruning automático neste módulo.
   Somente o temporário único de uma tentativa malsucedida pode ser removido.
   Este cache não substitui o salvamento do original na pasta do projeto.
   ========================================================================== */
(function(){
'use strict';
if(window.GeoMineRasterSource)return;
const MiB=1024*1024,CHUNK_BYTES=4*MiB,MIN_CACHE_BYTES=64*MiB,
  CACHE_MARGIN=16*MiB,TIMEOUT_MS=45000,NAMESPACE='geomine-raster-import-cache-v1';
const cached=new WeakMap(),localFiles=new WeakSet();
let sequence=0,warnedRetention=false;

function failure(name,message,cause){
  const error=new Error(message);error.name=name;
  if(cause)error.cause=cause;
  return error;
}
function aborted(){return failure('AbortError','Leitura do arquivo cancelada.');}
function timedOut(){return failure('TimeoutError',
  'A operação ficou sem resposta. Se o arquivo está na nuvem, aguarde o download completo, copie-o para Downloads e selecione-o novamente.');}
function unreadable(cause,detail){return failure('NotReadableError',
  'Não foi possível ler o arquivo'+(detail?' ('+detail+')':'')+'. Ele pode estar apenas na nuvem. '+
  'Baixe-o completamente, copie-o para Downloads e selecione-o novamente.',cause);}
function duration(value){const n=Number(value);return Number.isFinite(n)&&n>0?Math.max(1,Math.floor(n)):TIMEOUT_MS;}
function checkSignal(signal){if(signal&&signal.aborted)throw aborted();}
function progress(callback,loaded,total,phase,reason){
  if(typeof callback!=='function')return;
  try{callback(Object.assign({loaded,total,phase},reason?{reason}:{}));}catch(_){}
}
function warning(message){try{console.warn('GeoTIFF: '+message);}catch(_){} }

function wait(promise,options={}){
  const signal=options.signal;
  return new Promise((resolve,reject)=>{
    let settled=false,timer=null;
    const completed=()=>{
      try{const n=Number(options.progress?.());return Number.isFinite(n)?n:0;}catch(_){return 0;}
    };
    let lastProgress=completed();
    const finish=(error,value,failed=!!error)=>{
      if(settled)return;settled=true;
      if(timer!==null)clearTimeout(timer);
      if(signal)signal.removeEventListener('abort',onAbort);
      if(failed)reject(error);else resolve(value);
    };
    const onAbort=()=>finish(aborted());
    const deadline=()=>{
      if(settled)return;
      const next=completed();
      if(next>lastProgress){lastProgress=next;timer=setTimeout(deadline,duration(options.timeoutMs));}
      else finish(timedOut());
    };
    // Attach both handlers even for an already-aborted caller: a later
    // rejection of the original promise must not become unhandled.
    Promise.resolve(promise).then(value=>finish(null,value),error=>finish(error,undefined,true));
    if(signal&&signal.aborted){onAbort();return;}
    if(signal)signal.addEventListener('abort',onAbort,{once:true});
    timer=setTimeout(deadline,duration(options.timeoutMs));
  });
}

function read(blob,options={}){
  const signal=options.signal,total=Number(blob&&blob.size);
  return new Promise((resolve,reject)=>{
    if(!Number.isSafeInteger(total)||total<0){reject(new TypeError('Blob de leitura inválido.'));return;}
    if(signal&&signal.aborted){reject(aborted());return;}
    let reader,timer=null,settled=false,lastLoaded=0;
    const finish=(error,value,stop)=>{
      if(settled)return;settled=true;
      if(timer!==null)clearTimeout(timer);
      if(signal)signal.removeEventListener('abort',onAbort);
      if(reader){
        reader.onload=reader.onerror=reader.onabort=reader.onprogress=null;
        if(stop)try{reader.abort();}catch(_){}
      }
      if(error)reject(error);else resolve(value);
    };
    const onAbort=()=>finish(aborted(),null,true);
    const resetTimer=()=>{
      if(timer!==null)clearTimeout(timer);
      timer=setTimeout(()=>finish(timedOut(),null,true),duration(options.timeoutMs));
    };
    try{
      reader=new FileReader();
      reader.onload=()=>{
        const result=reader.result;
        if(Object.prototype.toString.call(result)!=='[object ArrayBuffer]'||result.byteLength!==total){
          finish(unreadable(null,'leitura incompleta'));return;
        }
        progress(options.onProgress,total,total,'waiting');finish(null,result);
      };
      reader.onerror=event=>finish(unreadable(reader.error||event&&event.target&&event.target.error));
      reader.onabort=()=>finish(aborted());
      reader.onprogress=event=>{
        const loaded=Math.max(0,Math.min(total,Number(event.loaded)||0));
        if(loaded>lastLoaded){lastLoaded=loaded;resetTimer();}
        progress(options.onProgress,lastLoaded,total,'waiting');
      };
      if(signal)signal.addEventListener('abort',onAbort,{once:true});
      resetTimer();progress(options.onProgress,0,total,'waiting');
      if(signal&&signal.aborted){onAbort();return;}
      reader.readAsArrayBuffer(blob);
    }catch(error){finish(unreadable(error),null,true);}
  });
}

async function prepare(file,options={}){
  const signal=options.signal,total=Number(file&&file.size),notify=options.onProgress;
  checkSignal(signal);
  if(!file||!Number.isSafeInteger(total)||total<0||typeof file.slice!=='function')
    throw new TypeError('Arquivo de origem inválido.');
  const nav=typeof navigator==='object'?navigator:{},android=/Android/i.test(nav.userAgent||'');
  const direct=reason=>{checkSignal(signal);progress(notify,0,total,'direct',reason);return file;};
  if(!android||total<MIN_CACHE_BYTES||localFiles.has(file))return direct('not-needed');
  progress(notify,0,total,'copy');checkSignal(signal);
  if(cached.has(file)){progress(notify,total,total,'copy');checkSignal(signal);return cached.get(file);}
  const storage=nav.storage;
  if(!storage||typeof storage.getDirectory!=='function'||typeof storage.estimate!=='function'){
    warning('Cache local indisponível; leitura direta. Para arquivos na nuvem, prefira uma cópia em Downloads.');
    return direct('unavailable');
  }
  let dir,writer=null,name=null,owned=false,finished=false,retired=false,providerFailure=false;
  const guarded=promise=>wait(promise,{signal});
  // Best effort, bounded cleanup. Never enumerate/delete the namespace or
  // reuse a user file name; only an entry acquired by this attempt is ours.
  const removeOwn=async()=>{
    if(!owned||!dir||!name)return;
    try{await wait(dir.removeEntry(name),{timeoutMs:2000});}catch(_){}
  };
  const abortWriter=async value=>{
    if(value&&typeof value.abort==='function')try{await wait(value.abort(),{timeoutMs:2000});}catch(_){}
  };
  try{
    const estimate=await guarded(storage.estimate());checkSignal(signal);
    const quota=Number(estimate&&estimate.quota),usage=Number(estimate&&estimate.usage);
    if(!Number.isFinite(quota)||!Number.isFinite(usage)||usage<0||quota-usage<total+CACHE_MARGIN){
      warning('Espaço insuficiente para a cópia local; leitura direta. O cache não apaga arquivos de outras sessões.');
      return direct('quota');
    }
    const root=await guarded(storage.getDirectory());checkSignal(signal);
    dir=await guarded(root.getDirectoryHandle(NAMESPACE,{create:true}));checkSignal(signal);
    // UUID plus a per-module sequence; check collisions before create:true.
    // A name that already exists is never opened for writing.
    for(let attempt=0;attempt<12;attempt++){
      let nonce;
      try{nonce=window.crypto&&window.crypto.randomUUID&&window.crypto.randomUUID();}catch(_){}
      nonce=nonce||Math.random().toString(36).slice(2);
      name='import-'+Date.now().toString(36)+'-'+(++sequence).toString(36)+'-'+nonce+'.tif';
      try{await guarded(dir.getFileHandle(name));name=null;}
      catch(error){if(error&&error.name==='NotFoundError')break;throw error;}
    }
    if(!name)throw new Error('Não foi possível reservar uma cópia local exclusiva.');
    checkSignal(signal);
    const creating=Promise.resolve().then(()=>dir.getFileHandle(name,{create:true}));
    creating.then(()=>{owned=true;if(retired)void removeOwn();},()=>{});
    const handle=await guarded(creating);checkSignal(signal);
    if(!handle||typeof handle.createWritable!=='function')throw new Error('Gravação local indisponível.');
    const opening=Promise.resolve().then(()=>handle.createWritable());
    opening.then(value=>{if(retired)void abortWriter(value).then(removeOwn);},()=>{});
    writer=await guarded(opening);checkSignal(signal);
    for(let offset=0;offset<total;offset+=CHUNK_BYTES){
      checkSignal(signal);
      const end=Math.min(total,offset+CHUNK_BYTES);
      let bytes;
      try{
        const part=file.slice(offset,end);
        if(!part||part.size!==end-offset)throw unreadable(null,'trecho incompleto');
        bytes=await read(part,{signal,onProgress:state=>{
          progress(notify,offset+state.loaded,total,state.loaded?'copy':'waiting');
        }});
      }catch(error){providerFailure=true;throw error;}
      checkSignal(signal);
      // One decoded chunk is retained at a time; no parts[] or giant Blob
      // reconstruction. Await write before requesting the next source slice.
      progress(notify,end,total,'waiting');
      await guarded(writer.write(bytes));checkSignal(signal);
      progress(notify,end,total,'copy');
    }
    progress(notify,total,total,'waiting');
    const closing=Promise.resolve().then(()=>writer.close());
    closing.then(()=>{if(retired)void removeOwn();},()=>{});
    await guarded(closing);writer=null;checkSignal(signal);
    const result=await guarded(handle.getFile());checkSignal(signal);
    if(!result||result.size!==total)throw new Error('A cópia local ficou incompleta.');
    progress(notify,total,total,'copy');checkSignal(signal);
    finished=true;cached.set(file,result);localFiles.add(result);
    if(!warnedRetention){
      warnedRetention=true;
      warning('A cópia local fica no armazenamento deste site para uso pelos tiles; não há limpeza automática. Ela não substitui o original salvo.');
    }
    return result;
  }catch(error){
    if(signal&&signal.aborted)throw aborted();
    if(providerFailure||error&&error.name==='AbortError')throw error;
    warning('Não foi possível preparar o cache local; leitura direta. '+(error&&error.message||'Falha de armazenamento.'));
    return direct('cache-error');
  }finally{
    if(!finished){retired=true;await abortWriter(writer);await removeOwn();}
  }
}

window.GeoMineRasterSource={version:1,prepare,read,wait};
})();
