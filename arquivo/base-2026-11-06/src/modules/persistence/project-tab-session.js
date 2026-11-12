/* Referência ao ARQUIVO de cada aba — nunca snapshot, rascunho ou autosave.
   No reload, lê o arquivo atual se a permissão já estiver concedida. Nenhum caminho
   privado é inferido de nomes; handles não são compartilhados entre contas. */
(function(){
'use strict';
if(window.GeoMineProjectTabSession)return;
const VIEW='geomine.project.workspace.v1',STORAGE='geomine.project.tab.v1',PREFIX='projectTabSession:v1:',VERSION=1;
const session=window.GeoMineSessionAutosave,baseStart=window.startAutosave,baseOpen=window.openProjectFile;
let tabId=null,account=null,initialized=false,published=false,record=null,pending=false,busy=false,
  persistent=false,handlePersisted=false,operation=0,revision=0,releaseLock=null,writeQueue=Promise.resolve(),inputFile=null,lastError='',lastNotice='',needsPermission=false,recordGeneration=null;
let resolveReady;const ready=new Promise(resolve=>{resolveReady=resolve;});
const uid=()=>window.GeoMineCloudProvider?.user?.uid||null;
const newId=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
const key=(owner,id)=>PREFIX+encodeURIComponent(owner||'offline')+':'+encodeURIComponent(id);
const generation=()=>session?.state?.generation;
const current=()=>initialized&&(!published||uid()===account);
function notify(message){try{toast(message);}catch(_){}}
function isHandle(h){return !!h&&typeof h.getFile==='function'&&(!h.kind||h.kind==='file');}
function brief(){return record?{name:record.name,projectId:record.projectId,source:record.source,hasHandle:isHandle(record.handle)}:null;}
function state(){return {tabId,ownerUid:account,ready:initialized,record:brief(),pending,busy,persistent,handlePersisted,resumeSupported:!!navigator.locks?.request};}
function hide(){document.getElementById('gmTabResume')?.remove();}
// Reload is an action, not a question. Keep the normal project-loading
// progress only. An exceptional access failure uses the existing Abrir command.
function render(){
  hide();
  if(!current()||!pending||busy||!lastError||lastNotice===lastError)return;
  lastNotice=lastError;notify(lastError);
}
// Only view/preferences are kept here, never geometry, raster bytes or edits.
function rememberFolder(h){
  if(!h&&typeof PROJECT_DIR_HANDLE!=='undefined')h=PROJECT_DIR_HANDLE;
  if(!h||!current()||pending||!record||record.projectId!==S.projectId||recordGeneration!==generation()||record.folder===h)return Promise.resolve(false);
  record={...record,folder:h};return write(record);
}
function captureWorkspace(){
  if(!current()||pending||busy||!record||record.projectId!==S.projectId||recordGeneration!==generation())return false;
  try{
    const screen=window.GeoMineProjectScreen?.capture();if(!screen)return false;
    sessionStorage.setItem(VIEW,JSON.stringify({version:1,tabId,ownerUid:account,name:record.name,projectId:record.projectId,screen,
      rasterViews:(S.rasters||[]).map(r=>({id:r.id,name:r.name,projectFile:r.projectFile||null,dispFull:!!r.dispFull,demHD:!!r.demHD})),
      ortho:S.img?{name:S.img.name,projectFile:S.img.projectFile||null,hd:!!S.orthoHD,full:!!S.orthoDispFull}:null}));
    return true;
  }catch(_){return false;}
}
function workspaceFor(target,data){
  try{
    const v=JSON.parse(sessionStorage.getItem(VIEW)||'null');
    return v?.version===1&&v.tabId===tabId&&v.ownerUid===account&&v.name===target.name&&
      v.projectId===target.projectId&&v.projectId===data.projectId?v:null;
  }catch(_){return null;}
}
function applyWorkspace(data,target){
  const v=workspaceFor(target,data);if(!v)return;
  if(window.GeoMineProjectScreen?.validMap(v.screen?.map))data.screen=v.screen;
  for(const r of data.rasters||[]){
    const q=v.rasterViews?.find(q=>q.id===r.rid&&q.name===r.name&&q.projectFile===(r.projectFile||null));
    if(q){r.dispFull=!!q.dispFull;r.demHD=!!q.demHD;}
  }
  if(data.img&&v.ortho?.name===data.img.name&&v.ortho.projectFile===(data.img.projectFile||null)){
    data.img.orthoHD=!!v.ortho.hd;data.img.orthoDispFull=!!v.ortho.full;
  }
}
function storageId(reuse){
  let id=null;try{if(reuse)id=sessionStorage.getItem(STORAGE);}catch(_){}
  if(!/^[\w-]{12,100}$/.test(id||''))id=newId();
  try{sessionStorage.setItem(STORAGE,id);}catch(_){}return id;
}
async function claim(id){
  if(!navigator.locks?.request)return true;
  return new Promise(resolve=>{
    let done=false;
    try{Promise.resolve(navigator.locks.request('geomine-project-tab:'+id,{ifAvailable:true},lock=>{
      done=true;resolve(!!lock);if(!lock)return;
      return new Promise(release=>{releaseLock=release;});
    })).catch(()=>{if(!done)resolve(false);});}catch(_){resolve(false);}
  });
}
function write(value){
  const id=tabId,owner=account,version=++revision;
  writeQueue=writeQueue.catch(()=>{}).then(async()=>{
    if(!current()||id!==tabId||owner!==account||version!==revision||typeof idbSet!=='function')return;
    try{await idbSet(key(owner,id),value);persistent=true;handlePersisted=!!value?.handle;}
    catch(_){
      // Some browsers cannot clone a filesystem handle into IndexedDB. Keep
      // only the filename hint, never a File/Blob or cached project payload.
      try{const plain=value?{...value,handle:null,folder:null}:null;await idbSet(key(owner,id),plain);persistent=true;handlePersisted=false;}
      catch(_){persistent=false;handlePersisted=false;}
    }
  });return writeQueue;
}
function remember(name,handle){
  if(!initialized){
    const owner=uid(),project=S.projectId,gen=generation();
    return ready.then(()=>current()&&owner===uid()&&project===S.projectId&&gen===generation()?remember(name,handle):false);
  }
  if(!current())return Promise.resolve(false);
  operation++;busy=false;pending=false;needsPermission=false;lastError='';lastNotice='';hide();
  const clean=String(name||handle?.name||'').trim();if(!clean)return forget();
  const file=inputFile&&inputFile.name===clean?inputFile:null;if(file)inputFile=null;
  // loadProject registers its display name before the input handler registers
  // the selected file. Preserve metadata across those two synchronous calls,
  // but never carry it to another project/generation or a different handle.
  const source=file?{name:clean,size:file.size,lastModified:file.lastModified}:
    (!handle&&!record?.handle&&record?.name===clean&&record?.projectId===(S.projectId||null)&&recordGeneration===generation()?record.source:{name:clean});
  record={version:VERSION,tabId,ownerUid:account,projectId:S.projectId||null,name:clean,
    source,handle:isHandle(handle)?handle:null,...(typeof PROJECT_DIR_HANDLE!=='undefined'&&PROJECT_DIR_HANDLE?{folder:PROJECT_DIR_HANDLE}:{}),at:Date.now()};recordGeneration=generation();handlePersisted=false;
  return write(record).then(()=>true);
}
function startIn(){
  const bound=pending||(record?.projectId===(S.projectId||null)&&recordGeneration===generation());
  return current()&&bound&&isHandle(record?.handle)?record.handle:null;
}
function forget(){
  if(!initialized){const owner=uid();return ready.then(()=>current()&&owner===uid()?forget():undefined);}
  try{sessionStorage.removeItem(VIEW);}catch(_){}
  operation++;record=null;pending=false;busy=false;needsPermission=false;inputFile=null;lastError='';lastNotice='';recordGeneration=null;handlePersisted=false;hide();
  return current()?write(null):Promise.resolve();
}
function open(){
  if(current()&&pending&&needsPermission&&isHandle(record?.handle))return reopen();
  if(typeof baseOpen!=='function')return false;
  operation++;busy=false;
  // Only the project handle from THIS tab is eligible. Export images and
  // generic lembraLocal() must not decide the project's opening directory.
  const previous=S._lastDir,anchor=startIn();S._lastDir=anchor;
  try{return Promise.resolve(baseOpen.apply(this,arguments)).finally(()=>{if(S._lastDir===anchor)S._lastDir=previous;});}
  catch(e){if(S._lastDir===anchor)S._lastDir=previous;throw e;}
}
async function reopen(options){
  const automatic=options?.automatic===true;
  if(!current()||busy||!record)return false;
  const target=record,handle=target.handle;
  if(!isHandle(handle)){lastError='Use Abrir para selecionar “'+target.name+'”. O navegador não conservou o acesso a este arquivo.';render();return false;}
  if(automatic&&(S.auto?.dirty||session?.state?.dirty))return false;
  if((S.auto?.dirty||session?.state?.dirty)&&!confirm('Há alterações não salvas. Reabrir o arquivo atual e descartá-las?'))return false;
  const token=++operation,owner=account,id=tabId,gen=generation(),version=session?.state?.version,project=S.projectId;
  const valid=()=>current()&&operation===token&&owner===account&&id===tabId&&record===target&&generation()===gen&&session?.state?.version===version&&S.projectId===project;
  let shown=false,committed=false;
  const opening=window.GeoMineProjectOpenProgress?.begin({title:'Solicitando acesso ao projeto…',current:valid});
  busy=true;needsPermission=false;lastError='';lastNotice='';hide();
  try{
    // Invoke permission in the click turn, without awaiting IndexedDB first.
    const permission=automatic
      ?(typeof handle.queryPermission==='function'?handle.queryPermission({mode:'read'}):Promise.resolve('prompt'))
      :(typeof handle.requestPermission==='function'?handle.requestPermission({mode:'read'}):Promise.resolve('granted'));
    if(await (opening?opening.wait(permission):permission)!=='granted'){
      if(!valid())return false;needsPermission=true;
      if(automatic){lastError='O navegador precisa de autorização para retomar “'+target.name+'”. Clique em Abrir para autorizar.';return false;}
      throw Error('A permissão de leitura não foi concedida. Use Abrir para autorizar o acesso ao original.');}
    if(!valid())return false;
    if(opening)opening.phase('Acessando a versão atual do arquivo…');else{showLoad('Reabrindo a versão atual do arquivo…');shown=true;}
    const access=handle.getFile(),file=await (opening?opening.wait(access):access);if(!valid())return false;
    if(!file.size)throw Error('O arquivo está vazio ou ainda não está disponível no provedor.');
    const text=opening?await opening.read(file):await readProjectFileCompat(file);if(!valid())return false;
    const data=opening?await opening.parse(text):JSON.parse(text);
    if(!data||!['ALAGIS','CCMGIS','CCMGeoCampo'].includes(data.app))throw Error('O arquivo atual não é um projeto GeoMine válido.');
    if(!valid())return false;
    applyWorkspace(data,target);
    if(target.folder&&typeof PROJECT_DIR_HANDLE!=='undefined')PROJECT_DIR_HANDLE=target.folder;
    const restored=()=>{window.startAutosave(file.name||handle.name||target.name,handle);pending=false;committed=true;hide();};
    if(opening)await opening.commit(data,restored);else{window.loadProject(data);restored();}
    if(!automatic)notify('Projeto reaberto do arquivo atual. O salvamento continua manual.');return true;
  }catch(e){
    if(valid()&&e.name!=='AbortError'){pending=true;needsPermission=needsPermission||e.name==='NotAllowedError'||e.name==='SecurityError';
      lastError='Não foi possível reabrir “'+target.name+'”: '+(e.message||e)+'. Use Abrir para tentar novamente.';}
    return false;
  }finally{if(operation===token)busy=false;if(opening)opening.finish();else if(shown&&(operation===token||committed))try{hideLoad();}catch(_){}if(pending)render();}
}
async function initialize(owner){
  if(initialized&&owner===account)return;
  const token=++operation;releaseLock?.();releaseLock=null;initialized=false;account=owner;record=null;pending=false;needsPermission=false;lastError='';lastNotice='';persistent=false;handlePersisted=false;recordGeneration=null;hide();
  const nav=performance.getEntriesByType?.('navigation')?.[0]?.type;
  const reload=nav==='reload'||nav==='back_forward',coordinated=!!navigator.locks?.request;
  // A duplicated tab may copy sessionStorage and even report reload. Without
  // an exclusive browser lock, fail closed instead of sharing its destination.
  tabId=storageId(reload&&coordinated);
  if(reload&&!coordinated)notify('Este navegador não permite retomar com segurança o arquivo de cada aba. Use Abrir e selecione o arquivo novamente; o salvamento continua manual.');
  if(!await claim(tabId)){tabId=storageId(false);await claim(tabId);}
  if(operation!==token)return;
  initialized=true;
  try{
    const saved=typeof idbGet==='function'?await idbGet(key(owner,tabId)):null;
    if(operation!==token||!current())return;
    if(saved?.version===VERSION&&saved.tabId===tabId&&saved.ownerUid===owner&&typeof saved.name==='string'&&saved.name&&
      !('txt' in saved)&&!('data' in saved)&&!('layers' in saved)){
      record={version:VERSION,tabId,ownerUid:owner,name:saved.name,projectId:saved.projectId||null,
        source:{name:saved.source?.name||saved.name,...(Number.isFinite(saved.source?.size)?{size:saved.source.size}:{}),...(Number.isFinite(saved.source?.lastModified)?{lastModified:saved.source.lastModified}:{})},
        handle:isHandle(saved.handle)?saved.handle:null,folder:saved.folder?.kind==='directory'?saved.folder:null,at:saved.at};
      persistent=true;handlePersisted=!!record.handle;pending=true;
      if(reload)await reopen({automatic:true});
    }
  }catch(_){persistent=false;}
  finally{resolveReady(state());}
}
function accountChanged(owner){
  // The first login after reload identifies the owner of the existing tab.
  // Only a subsequent account switch must discard that tab identity.
  if(owner!==account&&(initialized||account!==null)){operation++;revision++;initialized=false;record=null;pending=false;busy=false;needsPermission=false;persistent=false;handlePersisted=false;recordGeneration=null;hide();releaseLock?.();releaseLock=null;
    try{sessionStorage.removeItem(STORAGE);sessionStorage.removeItem(VIEW);}catch(_){} }
  if(owner)void initialize(owner);
}
if(typeof baseStart==='function')window.startAutosave=function(name,handle){const out=baseStart.apply(this,arguments);void remember(name,handle);return out;};
if(typeof baseOpen==='function')window.openProjectFile=open;
if(session?.prepareNewProject){const base=session.prepareNewProject;session.prepareNewProject=async function(){window.GeoMineProjectOpenProgress?.cancel('novo projeto');await forget();return base.apply(this,arguments);};}
document.addEventListener('change',event=>{if(event.target?.id==='projIn')inputFile=event.target.files?.[0]||null;},true);
window.addEventListener('geomine:cloud-ready',event=>accountChanged(event.detail?.user?.uid||uid()));
window.addEventListener('geomine:cloud-disconnected',()=>accountChanged(null));
function boot(){published=('GeoMineCloudProvider' in window)||!!document.getElementById('gmPortao');if(!published||uid())void initialize(uid());}
window.GeoMineProjectTabSession={ready,state,reopen,open,forget,remember,startIn,captureWorkspace,rememberFolder};
window.addEventListener('beforeunload',captureWorkspace);
window.addEventListener('pagehide',captureWorkspace);
if(typeof window.projectHandleStore==='function'){
  const storeFolder=window.projectHandleStore;
  window.projectHandleStore=async function(h){const result=await storeFolder.apply(this,arguments);
    await rememberFolder(h);return result;};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
