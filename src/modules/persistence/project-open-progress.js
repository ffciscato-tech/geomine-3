/* Abertura manual: uma lane dona do progresso, sem snapshots nem autosave.
   O leitor mede bytes; parse/montagem síncronos não inventam percentuais. */
(function(){
'use strict';
let active=null,serial=0,committing=null;
const abort=()=>Object.assign(new Error('Abertura cancelada.'),{name:'AbortError'});
const project=()=>typeof S!=='undefined'?S.projectId:undefined;
const generation=()=>window.GeoMineSessionAutosave?.state?.generation;
function begin(options={}){
 cancel('outra abertura');
 const controller=new AbortController(),token={},id=++serial;
 let projectId=project(),gen=generation(),committed=false,phaseName='',percent=null,closed=false;
 const externalAbort=()=>job.cancel();
 function check(){
  if(closed||active!==job||controller.signal.aborted||projectId!==project()||gen!==generation()||(!committed&&options.current&&!options.current()))throw abort();
 }
 function phase(title,f=NaN){check();phaseName=String(title);percent=Number.isFinite(f)?Math.max(0,Math.min(100,100*f)):null;window.GeoMineLoadProgress?.projectShow(token,phaseName,f);}
 function wait(value){
  return new Promise((resolve,reject)=>{
   let done=false;
   const finish=(error,result)=>{if(done)return;done=true;controller.signal.removeEventListener('abort',stop);if(error)reject(error);else{try{check();resolve(result);}catch(e){reject(e);}}};
   const stop=()=>finish(abort());
   // Attach both handlers even when already cancelled: a late provider error
   // must not become an unhandled rejection or restart an abandoned opening.
   Promise.resolve(value).then(result=>finish(null,result),error=>finish(error));
   controller.signal.addEventListener('abort',stop,{once:true});
   try{check();}catch(e){finish(e);}
  });
 }
 async function pause(){
  check();let frame=null,timer=null,fallback=null;
  try{await wait(new Promise(resolve=>{
   const painted=()=>{timer=setTimeout(resolve,0);};
   if(typeof requestAnimationFrame==='function')frame=requestAnimationFrame(painted);else painted();
   // Background tabs cannot paint; do not wait forever for their suspended RAF.
   fallback=setTimeout(resolve,120);
  }));}finally{if(frame!==null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(frame);clearTimeout(timer);clearTimeout(fallback);}
 }
 async function read(file){
  phase('Lendo arquivo do projeto…',0);await pause();
  const onProgress=p=>{
   try{check();}catch(_){return;}
   const f=Number.isFinite(p.loaded)&&p.total>0?p.loaded/p.total:NaN;
   phase(p.phase==='retry'?'Aguardando arquivo do Drive — tentativa '+p.attempt+'…':'Lendo arquivo do projeto…',p.phase==='retry'?NaN:f);
  };
  if(typeof readProjectFileCompat==='function')return wait(readProjectFileCompat(file,{signal:controller.signal,onProgress}));
  if(window.GeoMineProjectReader)return wait(window.GeoMineProjectReader.read(file,{signal:controller.signal,onProgress}));
  throw Error('Leitor de projetos indisponível. Recarregue o aplicativo.');
 }
 async function parse(text){phase('Interpretando projeto…');await pause();check();return JSON.parse(text);}
 async function commit(data,after){
  const version=window.GeoMineSessionAutosave?.state?.version;
  phase('Montando mapa do projeto…');await pause();check();
  if(version!==window.GeoMineSessionAutosave?.state?.version)throw Error('O projeto foi editado enquanto a abertura aguardava. Repita Abrir para confirmar a substituição.');
  committing=job;
  try{
   window.loadProject(data);
   if(after)after();
   committed=true;projectId=project();gen=generation();
  }finally{committing=null;}
  phase('Finalizando mapa do projeto…');await pause();check();
 }
 function finish(){
  if(closed)return;closed=true;options.signal?.removeEventListener('abort',externalAbort);
  if(active===job)active=null;
  window.GeoMineLoadProgress?.projectEnd(token);
 }
 const job={id,signal:controller.signal,check,phase,wait,pause,read,parse,commit,finish,
  cancel(){if(closed)return false;controller.abort();finish();return true;},
  get committed(){return committed;},get state(){return {active:active===job,id,phase:phaseName,percent,committed};}};
 active=job;window.GeoMineLoadProgress?.projectBegin(token,options.title||'Acessando arquivo do projeto…');phaseName=options.title||'Acessando arquivo do projeto…';
 options.signal?.addEventListener('abort',externalAbort,{once:true});if(options.signal?.aborted)job.cancel();
 return job;
}
function cancel(){serial++;return active?active.cancel():false;}
function invalidate(){if(active&&active===committing)return false;return cancel();}
window.GeoMineProjectOpenProgress={begin,cancel,invalidate,sequence:()=>serial,state:()=>active?active.state:{active:false,id:null,phase:'',percent:null,committed:false}};
})();
