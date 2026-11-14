/* Browser-session continuity requested by the user. This local snapshot does
   not write over the .ccmgis file. TIFF bytes remain in the verified source cache. */
(function(root){
'use strict';if(root.GeoMineWorkspaceResume)return;
const POINTER='geomine.workspace.resume.v1',VIEW='geomine.workspace.resume.view.v1',PREFIX='workspaceResume:v1:',LAST='workspaceResume:tab:v2:',LAST_VIEW='geomine.workspace.tabView.v2:',MAX=200*1048576,MAX_PARTS=2000;
let ready=false,restoring=false,finding=false,busy=null,wanted=true,lastStamp='',changedAt=0,lastSaved='',savedAt=0,warning='',epoch=0,pointerQueue=Promise.resolve();
const state=()=>root.GeoMineSessionAutosave?.state,owner=()=>root.GeoMineCloudProvider?.user?.uid||state()?.ownerUid||null,
 gen=()=>state()?.generation,has=()=>typeof hasContent==='function'&&hasContent(),parse=k=>{try{return JSON.parse(sessionStorage.getItem(k)||'null');}catch(_){return null;}},
 own=p=>p?.v===1&&p.owner===owner()&&typeof p.key==='string'&&p.key.startsWith(PREFIX+encodeURIComponent(p.owner||'offline')+':');
const tabId=()=>root.GeoMineProjectTabSession?.state?.().tabId||null,
 lastKey=o=>LAST+encodeURIComponent(o||'offline')+':'+encodeURIComponent(tabId()||''),
 viewKey=(o,p)=>LAST_VIEW+encodeURIComponent(o||'offline')+':'+encodeURIComponent(tabId()||'')+':'+encodeURIComponent(p);
function bound(p){
 if(!own(p)||!tabId())return false;
 if(p.tab)return p.tab===tabId();
 // Migrate an old tab-local pointer only when this tab's independently
 // restored file record confirms the same project. Never use the account's
 // global last-project pointer, which may belong to another open tab.
 const record=root.GeoMineProjectTabSession?.state?.().record;
 return !!record&&record.projectId===p.project;
}
function localRead(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch(_){return null;}}
// Persist recovery by account AND tab. The tab token also survives in the
// page URL, so iOS reload/discard cannot select another tab's last project.
function durable(value,o=owner(),valid=()=>true){
 const key=lastKey(o);pointerQueue=pointerQueue.catch(()=>{}).then(async()=>{
  if(!valid())return false;await idbSet(key,value);if(!valid())return false;
  try{localStorage.setItem(key,JSON.stringify(value||{v:1,owner:o,tab:tabId(),empty:true,at:Date.now()}));}catch(_){}
  return true;
 });return pointerQueue;
}
async function previous(){const tab=parse(POINTER);if(bound(tab))return tab;
 const o=owner(),local=localRead(lastKey(o));if(local?.owner===o&&local.empty===true)return null;if(bound(local))return local;
 try{const p=await idbGet(lastKey(o));return o===owner()&&bound(p)?p:null;}catch(_){return null;}
}
function screen(){try{return root.GeoMineProjectScreen?.capture()||null;}catch(_){return null;}}
function view(){const q=screen();if(!q||!has())return;const v={owner:owner(),tab:tabId(),project:S.projectId,screen:q,at:Date.now()},text=JSON.stringify(v);
 try{sessionStorage.setItem(VIEW,text);}catch(_){}try{localStorage.setItem(viewKey(v.owner,v.project),text);}catch(_){}
}
function stamp(){return JSON.stringify([tabId(),owner(),S.projectId,gen(),state()?.version]);}
function request(){wanted=true;changedAt=Date.now();}
async function hash(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
async function remove(meta){if(!meta||!own(meta)||meta.tab!==tabId()||!Number.isInteger(meta.count)||meta.count<0||meta.count>MAX_PARTS)return;
 try{const db=await idb();await new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite'),s=tx.objectStore('kv');s.delete(meta.key);for(let i=0;i<meta.count;i++)s.delete(meta.key+':'+i);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}catch(_){}
}
async function write(){
 const project=S.projectId,g=gen(),o=owner(),id=tabId(),token=epoch,old=parse(POINTER),version=state()?.version;
 const identity=()=>id===tabId()&&project===S.projectId&&g===gen()&&o===owner()&&token===epoch,
  valid=()=>identity()&&version===state()?.version;
 const check=()=>{if(!valid())throw new DOMException('A sessão mudou.','AbortError');};
 const key=PREFIX+encodeURIComponent(o||'offline')+':'+encodeURIComponent(id)+':'+crypto.randomUUID(),encoder=new TextEncoder();let count=0,bytes=0,committed=false;
 try{
  const data=projectData({borrowGeometry:true});
  for(const text of root.GeoMineImportRecovery.serializeChunks(data)){
   check();const part=encoder.encode(text);bytes+=part.byteLength;if(bytes>MAX||count>=MAX_PARTS)throw Error('A sessão excede o limite local de 200 MB.');
   const sha256=await hash(part.buffer);check();await idbSet(key+':'+count,{bytes:part.buffer,sha256});count++;
  }
  check();const record=root.GeoMineProjectTabSession?.state?.().record;
  const meta={v:1,key,owner:o,tab:id,project,count,bytes,at:Date.now(),dirty:!!state()?.dirty,baseRevision:record?.source?.version||null,baseModified:record?.source?.lastModified||0,complete:true};
  await idbSet(key,meta);check();await durable(meta,o,identity);
  if(!identity())throw new DOMException('A sessão mudou.','AbortError');
  try{sessionStorage.setItem(POINTER,JSON.stringify(meta));}catch(_){}committed=true;
  lastSaved=JSON.stringify([id,o,project,g,version]);savedAt=Date.now();wanted=!valid();warning='';view();if(own(old)&&old.key!==key)void remove(old);return true;
 }catch(e){wanted=true;
  // e pode chegar nulo de APIs antigas: nunca ler propriedades sem conferir.
  const cheio=!!e&&(e.name==='QuotaExceededError'||e.code===22),
   texto=cheio?'o armazenamento do navegador neste aparelho está cheio.':String(e&&e.message||e||'falha ao gravar no armazenamento do navegador.');
  if(!(e&&e.name==='AbortError')&&warning!==texto){warning=texto;
   toast('A retomada automática não pôde ser guardada neste aparelho: '+texto+' O arquivo do projeto continua disponível pelo comando Salvar.');
   if(cheio)void usage().then(u=>{if(u)try{cmdLog('Armazenamento do navegador neste aparelho: '+u+'.','avisa');}catch(_){}});}
  return false;}
 finally{if(!committed)void remove({v:1,key,owner:o,tab:id,count});}
}
async function usage(){
 try{const q=await navigator.storage?.estimate?.();if(!q||!(q.quota>0))return '';
  const gb=b=>(b/1073741824).toFixed(b<10737418240?1:0).replace('.',',')+' GB';return 'usando '+gb(q.usage||0)+' de '+gb(q.quota);}catch(_){return '';}
}
/* LIMPEZA DE SOBRAS. Cada gravação da retomada usa uma chave nova e apaga a
   anterior ao terminar. Se a página é recarregada, ou o iPad descarta a aba,
   no meio de uma gravação, os blocos já gravados ficam sem dono: nenhum
   ponteiro os referencia e ninguém os apaga. Num projeto de dezenas de MB,
   algumas recargas bastam para encher o armazenamento do navegador, e daí em
   diante toda gravação falha. Na partida, apaga os blocos desta conta que
   nenhum ponteiro referencia — só os desta aba (que ainda não gravou nada
   nesta página) e os de abas que não estão mais abertas. Um bloco sem
   ponteiro nunca pode ser retomado, então nada de útil é apagado. */
async function sweep(){
 const o=owner(),id=tabId();if(!id)return 0;
 const base=PREFIX+encodeURIComponent(o||'offline')+':',lastBase=LAST+encodeURIComponent(o||'offline')+':';
 try{
  const db=await idb(),range=prefix=>IDBKeyRange.bound(prefix,prefix+'\uffff'),
   ask=make=>new Promise((resolve,reject)=>{const r=make(db.transaction('kv','readonly').objectStore('kv'));r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error||Error('leitura'));});
  const keys=await ask(s=>s.getAllKeys(range(base)));if(!keys.length)return 0;
  const keep=new Set(),note=p=>{if(p&&typeof p.key==='string')keep.add(p.key);};
  note(parse(POINTER));(await ask(s=>s.getAll(range(lastBase)))).forEach(note);
  try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith(lastBase))note(localRead(k));}}catch(_){}
  // Abas abertas agora: cada uma segura um bloqueio com o próprio id.
  let live=null;
  try{const q=await navigator.locks?.query?.();if(q)live=new Set((q.held||[]).map(l=>String(l.name||'')).filter(n=>n.startsWith('geomine-project-tab:')).map(n=>n.slice(20)));}catch(_){}
  const dead=[];
  for(const k of keys){
   const rest=String(k).slice(base.length).split(':');if(rest.length<2)continue;
   let tab='';try{tab=decodeURIComponent(rest[0]);}catch(_){continue;}
   if(keep.has(base+rest[0]+':'+rest[1]))continue;
   if(tab===id||live&&!live.has(tab))dead.push(k);
  }
  if(!dead.length)return 0;
  await new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite'),s=tx.objectStore('kv');dead.forEach(k=>s.delete(k));
   tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||Error('limpeza'));});
  return dead.length;
 }catch(_){return 0;}
}
async function flush(options={}){
 if((!ready&&!options.startup)||restoring||!has()||state()?.suspend||!state()?.booted||S._rasterImportController&&S._rasterImportController!==options.importController)return false;
 if(options.importController&&(S._rasterImportController!==options.importController||options.importController.signal.aborted))return false;
 if(busy){await busy;return flush(options);}
 if(!wanted&&lastSaved===stamp()){view();return true;}
 const job=write();busy=job;try{return await job;}finally{if(busy===job)busy=null;}
}
async function restore(){
 if(restoring||finding)return false;
 const before={owner:owner(),generation:gen(),epoch};let p;finding=true;
 try{p=await previous();}finally{finding=false;}
 if(before.owner!==owner()||before.generation!==gen()||before.epoch!==epoch||!bound(p))return false;
 // If an accessible original was modified externally, keep that newer file.
 const record=root.GeoMineProjectTabSession?.state?.().record;
 if(has()&&(S.projectId!==p.project||!p.dirty||p.baseModified>0&&Number(record?.source?.lastModified)>p.baseModified))return false;
 const o=owner(),g=gen(),version=state()?.version,token=epoch,project=S.projectId,
  valid=()=>owner()===o&&gen()===g&&state()?.version===version&&epoch===token&&S.projectId===project;
 restoring=true;showLoad('Retomando o projeto e a vista anteriores…');
 try{
  const meta=await idbGet(p.key);if(!valid()||!bound(meta)||!meta.complete||meta.project!==p.project||!Number.isInteger(meta.count)||meta.count<1||meta.count>MAX_PARTS||meta.bytes>MAX)throw Error('Sessão incompleta.');
  const parts=[];let size=0;for(let i=0;i<meta.count;i++){if(!valid())return false;const q=await idbGet(meta.key+':'+i);if(!q?.bytes||q.bytes.byteLength>524288||await hash(q.bytes)!==q.sha256)throw Error('Bloco da sessão inválido.');parts.push(q.bytes);size+=q.bytes.byteLength;}
  if(size!==meta.bytes)throw Error('Tamanho da sessão inválido.');const blob=new Blob(parts);parts.length=0;const data=JSON.parse(await blob.text());
  if(!valid())return false;if(!['ALAGIS','CCMGIS','CCMGeoCampo'].includes(data.app)||data.projectId!==p.project)throw Error('Projeto da sessão inválido.');
  const views=[parse(VIEW),localRead(viewKey(o,p.project))].filter(v=>v?.owner===o&&v.project===p.project&&(!v.tab||v.tab===tabId())).sort((a,b)=>b.at-a.at),v=views[0];
  if(root.GeoMineProjectScreen?.validMap(v?.screen?.map))data.screen=v.screen;
  for(const r of data.rasters||[]){r.dispFull=true;r.demHD=true;}if(data.img){data.img.orthoHD=true;data.img.orthoDispFull=true;}
  const binding=root.GeoMineProjectTabSession?.bindingFor?.(p.project);
  const handle=binding?.handle||root.GeoMineProjectTabSession?.startIn?.();
  root.loadProject(data);const loaded=gen();
  if((binding||handle)&&S.projectId===p.project){
    const source=binding?.source?{...binding.source}:null;
    if(source?.kind==='drive'&&meta.baseRevision)source.version=meta.baseRevision;
    if(source&&meta.baseModified)source.lastModified=meta.baseModified;
    root.startAutosave?.(binding?.name||handle.name,handle,source);
  }
  await new Promise(r=>setTimeout(r,0));
  if(S.projectId!==p.project||gen()!==loaded||owner()!==o)return false;
  if(meta.dirty)root.GeoMineSessionAutosave?.markDirty('sessão retomada');
  try{sessionStorage.setItem(POINTER,JSON.stringify(meta));}catch(_){}
  await root.GeoMineOriginalSources?.restoreAll();return true;
 }catch(e){if(valid())toast('Não foi possível retomar a sessão: '+(e.message||e));return false;}
 finally{restoring=false;hideLoad();}
}
function forget(){const old=parse(POINTER),o=owner(),project=S.projectId;epoch++;wanted=false;lastSaved='';lastStamp='';savedAt=0;
 try{sessionStorage.removeItem(POINTER);sessionStorage.removeItem(VIEW);}catch(_){}
 // Clear only this tab before starting a new project. A delayed write
 // from the old generation cannot bring it back after this queued tombstone.
 try{localStorage.setItem(lastKey(o),JSON.stringify({v:1,owner:o,tab:tabId(),empty:true,at:Date.now()}));localStorage.removeItem(viewKey(o,project));}catch(_){}
 void durable(null,o).catch(()=>{});if(own(old))void remove(old);
}
async function start(){
 await root.GeoMineProjectTabSession?.ready;if(ready)return;
 const resumed=await restore();
 // Antes da primeira gravação desta página: libera o espaço das gravações interrompidas.
 try{const removed=await sweep();if(removed)try{cmdLog('Retomada automática: '+removed+' bloco(s) de gravações interrompidas foram apagados do armazenamento deste navegador.','info');}catch(_){}}catch(_){}
 if(!resumed&&!has())await root.GeoMineImportRecovery?.recover();
 request();
 // Commit the downloaded revision before declaring startup complete. An
 // immediate second reload may lose network access or need renewed consent.
 if(!resumed&&has()&&root.GeoMineProjectTabSession?.state?.().record?.source?.kind==='drive')await flush({startup:true});
 ready=true;
 root.GeoMineProjectTabSession?.showResumeIssue?.();
}
function boot(){
 const load=root.loadProject;root.loadProject=function(){if(!restoring&&(ready||!root.GeoMineProjectTabSession?.state?.().busy))forget();const out=load.apply(this,arguments);if(!restoring){request();setTimeout(()=>void flush(),0);}return out;};
 const save=root.saveProject;if(typeof save==='function')root.saveProject=async function(){const out=await save.apply(this,arguments);if(out===true){request();await flush();}return out;};
 const prepare=root.GeoMineSessionAutosave?.prepareNewProject;if(prepare)root.GeoMineSessionAutosave.prepareNewProject=async function(){forget();return prepare.apply(this,arguments);};
 if(state()?.booted)void start();else root.addEventListener('geomine:cloud-ready',()=>void start(),{once:true});
 setInterval(()=>{if(!ready||restoring||!has()||state()?.suspend)return;view();const s=stamp();if(s!==lastStamp){lastStamp=s;request();}if(wanted&&(Date.now()-changedAt>=800||Date.now()-savedAt>=3000)&&!busy&&!S._rasterImportController&&!S._vtxDragging&&!(typeof ED!=='undefined'&&ED.drag))void flush();},600);
 function leaving(){view();void flush();}
 function returning(){if(ready&&!restoring&&!has())void restore();}
 root.addEventListener('pagehide',leaving);root.addEventListener('pageshow',returning);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')leaving();else returning();});
 if(typeof map!=='undefined')map?.on?.('moveend zoomend',view);
 document.addEventListener('keydown',e=>{if(e.key!=='F5'&&!((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='r'))return;if(!ready||!has())return;e.preventDefault();e.stopImmediatePropagation();void flush().then(ok=>{if(ok)root.location.reload();});},true);
}
async function pendingSnapshot(project){
 const p=await previous();return bound(p)&&p.project===project?p:null;
}
root.GeoMineWorkspaceResume={request,flush,restore,forget,pendingSnapshot,sweep,get state(){return {ready,restoring,busy:!!busy,pointer:parse(POINTER),warning};}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
