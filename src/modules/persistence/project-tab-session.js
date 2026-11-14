/* Referência ao ARQUIVO de cada aba — nunca snapshot, rascunho ou autosave.
   No reload, lê o arquivo atual se a permissão já estiver concedida. Nenhum caminho
   privado é inferido de nomes; handles não são compartilhados entre contas.
   Projeto vinculado ao Google Drive: ao recarregar ou tocar em ↻, abre a versão
   mais recente do MESMO projeto (mesmo projectId) que estiver na mesma pasta do
   Drive, mesmo que ela tenha chegado como um arquivo novo. */
(function(){
'use strict';
if(window.GeoMineProjectTabSession)return;
const VIEW='geomine.project.workspace.v1',STORAGE='geomine.project.tab.v1',PREFIX='projectTabSession:v1:',VERSION=1,URL_TAB='__gm_tab';
const session=window.GeoMineSessionAutosave,baseStart=window.startAutosave,baseOpen=window.openProjectFile;
let tabId=null,account=null,initialized=false,published=false,record=null,pending=false,busy=false,
  persistent=false,handlePersisted=false,operation=0,revision=0,releaseLock=null,writeQueue=Promise.resolve(),inputFile=null,lastError='',lastNotice='',needsPermission=false,recordGeneration=null;
let resumeIssue=null;
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
    if(q){r.dispFull=true;r.demHD=true;}
  }
  if(data.img&&v.ortho?.name===data.img.name&&v.ortho.projectFile===(data.img.projectFile||null)){
    data.img.orthoHD=true;data.img.orthoDispFull=true;
  }
}
function storageId(reuse){
  let id=null;try{if(reuse)id=sessionStorage.getItem(STORAGE);}catch(_){}
  if(!/^[\w-]{12,100}$/.test(id||''))id=newId();
  try{sessionStorage.setItem(STORAGE,id);}catch(_){}return id;
}
function urlId(){try{const id=new URL(location.href).searchParams.get(URL_TAB);return /^[\w-]{12,100}$/.test(id||'')?id:null;}catch(_){return null;}}
function rememberId(id){
  try{sessionStorage.setItem(STORAGE,id);}catch(_){}
  // The URL survives iOS discarding sessionStorage. It contains only a random
  // tab token; project names, coordinates and file access never enter the URL.
  try{const url=new URL(location.href);url.searchParams.set(URL_TAB,id);history.replaceState(history.state,'',url.href);}catch(_){}
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
function fileSource(info,name){
  const source={name:info?.name||name};
  if(Number.isFinite(info?.size))source.size=info.size;
  if(Number.isFinite(info?.lastModified))source.lastModified=info.lastModified;
  if(window.GeoMineDriveProject?.isSource(info)){
    source.kind='drive';source.id=info.id;source.version=String(info.version||'');
    source.resourceKey=String(info.resourceKey||'');
  }
  return source;
}
function remember(name,handle,info){
  if(!initialized){
    const owner=uid(),project=S.projectId,gen=generation();
    return ready.then(()=>current()&&owner===uid()&&project===S.projectId&&gen===generation()?remember(name,handle,info):false);
  }
  if(!current())return Promise.resolve(false);
  operation++;busy=false;pending=false;needsPermission=false;lastError='';lastNotice='';hide();
  const clean=String(name||handle?.name||'').trim();if(!clean)return forget();
  const file=inputFile&&inputFile.name===clean?inputFile:null;if(file)inputFile=null;
  // loadProject registers its display name before the input handler registers
  // the selected file. Preserve metadata across those two synchronous calls,
  // but never carry it to another project/generation or a different handle.
  const source=info||file?fileSource(info||file,clean):
    ((!handle&&!record?.handle||handle&&handle===record?.handle)&&record?.name===clean&&record?.projectId===(S.projectId||null)&&recordGeneration===generation()?record.source:{name:clean});
  record={version:VERSION,tabId,ownerUid:account,projectId:S.projectId||null,name:clean,
    source,handle:isHandle(handle)?handle:null,...(typeof PROJECT_DIR_HANDLE!=='undefined'&&PROJECT_DIR_HANDLE?{folder:PROJECT_DIR_HANDLE}:{}),at:Date.now()};recordGeneration=generation();handlePersisted=false;
  updateSourceButton();return write(record).then(()=>true);
}
function startIn(){
  const bound=pending||(record?.projectId===(S.projectId||null)&&recordGeneration===generation());
  return current()&&bound&&isHandle(record?.handle)?record.handle:null;
}
function pickerStartIn(){
  const file=startIn();if(file)return file;
  return current()&&!pending&&record?.projectId===S.projectId&&recordGeneration===generation()&&record.folder?.kind==='directory'?record.folder:null;
}
function forget(){
  if(!initialized){const owner=uid();return ready.then(()=>current()&&owner===uid()?forget():undefined);}
  try{sessionStorage.removeItem(VIEW);}catch(_){}
  operation++;record=null;pending=false;busy=false;needsPermission=false;inputFile=null;lastError='';lastNotice='';recordGeneration=null;handlePersisted=false;hide();
  updateSourceButton();return current()?write(null):Promise.resolve();
}
function bindingFor(projectId){
  return current()&&record?.projectId===projectId ? record : null;
}
function updateSourceButton(){
  const place=document.getElementById('a3OpenProjectName');
  if(!place)return;
  let button=document.getElementById('gmCurrentProjectSource');
  if(!current()||!record||isHandle(record.handle)||record.projectId!==S.projectId||!window.GeoMineCloudProvider?.drivePickerConfig?.key){
    button?.remove();return;
  }
  if(!button){
    button=document.createElement('button');button.type='button';button.className='tbtn';
    button.id='gmCurrentProjectSource';button.textContent='↻';button.style.cssText='padding:0 5px;min-width:25px;font-size:16px';
    place.after(button);
  }
  const linked=window.GeoMineDriveProject.isSource(record.source);
  const label=linked?'Abrir a versão mais recente deste projeto no Google Drive':'Vincular este projeto ao Google Drive';
  button.title=label;button.setAttribute('aria-label',label);
  button.onclick=()=>linked?reopen():openDrive(true);
}
async function openDrive(bindCurrent=false){
  const token=++operation,owner=account,gen=generation(),version=session?.state?.version;
  try{
    const source=await window.GeoMineDriveProject.pick();
    if(token!==operation||owner!==account||!current()||gen!==generation()||version!==session?.state?.version)return false;
    return reopen({source,expectedProject:bindCurrent===true?S.projectId:null});
  }catch(error){if(error.name!=='AbortError')notify(error.message);return false;}
}
function showResumeIssue(){
  const issue=resumeIssue;resumeIssue=null;
  if(!issue||!current()||record?.source?.id!==issue.id||S.projectId!==issue.project)return;
  updateSourceButton();
  if(issue.quiet){
    try{cmdLog('Projeto retomado do que estava guardado neste aparelho. A conferência com o Google Drive volta no próximo Salvar ou ao tocar em ↻.','info');}catch(_){}
    return;
  }
  if(!issue.conflict){
    const message='Exibindo a cópia local de “'+record.name+'”. '+issue.message;
    try{cmdLog(message,'warn');}catch(_){}
    notify(message);return;
  }
  const binding=record;
  const box=document.createElement('dialog');
  box.setAttribute('aria-label','Arquivo atualizado no Drive');box.id='gmDriveConflict';
  box.style.cssText='max-width:min(390px,90vw);padding:16px;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:10px';
  const title=document.createElement('strong');title.textContent='Arquivo atualizado no Drive';
  const description=document.createElement('p');
  description.textContent='“'+record.name+'” mudou no Drive e há edições neste aparelho. Carregar o arquivo do Drive substitui essas edições.';
  const keep=document.createElement('button'),load=document.createElement('button');
  keep.textContent='Manter edições locais';load.textContent='Carregar versão do Drive';
  keep.className='tbtn';load.className='tbtn primary';keep.onclick=()=>box.close();
  load.onclick=()=>{box.close();if(current()&&record===binding)void reopen({discardConfirmed:true});};
  box.append(title,description,keep,load);box.addEventListener('close',()=>box.remove(),{once:true});
  document.body.append(box);box.showModal();
}
function open(){
  if(current()&&pending&&needsPermission&&isHandle(record?.handle))return reopen();
  if(typeof baseOpen!=='function')return false;
  operation++;busy=false;
  // Only the project handle from THIS tab is eligible. Export images and
  // generic lembraLocal() must not decide the project's opening directory.
  const previous=S._lastDir,anchor=pickerStartIn();S._lastDir=anchor;
  try{return Promise.resolve(baseOpen.apply(this,arguments)).finally(()=>{if(S._lastDir===anchor)S._lastDir=previous;});}
  catch(e){if(S._lastDir===anchor)S._lastDir=previous;throw e;}
}
async function reopen(options){
  const automatic=options?.automatic===true;
  const previousRecord=record;
  const target=options?.source?{source:options.source,name:'Projeto do Drive'}:record;
  if(!current()||busy||!target)return false;
  const handle=target.handle,drive=window.GeoMineDriveProject;
  const remote=drive?.isSource(target.source);
  if(!remote&&!isHandle(handle)){
    lastError=window.GeoMineCloudProvider?.drivePickerConfig?.key
      ?'Cópia local. Para acompanhar alterações do original, toque em ↻ ao lado do nome do projeto e vincule o original uma vez.'
      :'Use Abrir para selecionar “'+target.name+'”. O navegador não conservou o acesso a este arquivo.';
    render();return false;
  }
  if(automatic&&(S.auto?.dirty||session?.state?.dirty))return false;
  if(!options?.discardConfirmed&&(S.auto?.dirty||session?.state?.dirty)&&!confirm('Há alterações não salvas. Reabrir o arquivo atual e descartá-las?'))return false;
  const token=++operation,owner=account,id=tabId,gen=generation(),version=session?.state?.version,project=S.projectId;
  const valid=()=>current()&&operation===token&&owner===account&&id===tabId&&record===previousRecord&&generation()===gen&&session?.state?.version===version&&S.projectId===project;
  let shown=false,committed=false,switched=false;
  const opening=window.GeoMineProjectOpenProgress?.begin({title:'Solicitando acesso ao projeto…',current:valid});
  busy=true;needsPermission=false;lastError='';lastNotice='';hide();
  try{
    // Invoke permission in the click turn, without awaiting IndexedDB first.
    let source,file;
    if(remote){
      if(!automatic)await opening.wait(window.GeoMineCloudProvider.driveAccess(true));
      opening.phase('Conferindo a versão do arquivo no Drive…');
      source=await opening.wait(drive.metadata(target.source,opening.signal));
      // Sem options.source: a pessoa não escolheu um arquivo agora, então vale
      // a versão mais recente deste projeto na pasta. Falha aqui não impede
      // abrir o arquivo vinculado.
      if(!options?.source&&target.projectId&&drive.latest){
        opening.phase('Procurando a versão mais recente na pasta do Drive…');
        let newer=null;
        try{newer=await opening.wait(drive.latest(source,target.projectId,opening.signal));}
        catch(e){if(e.name==='AbortError'||!valid())throw e;try{cmdLog('Versão mais recente no Drive: '+(e.message||e),'warn');}catch(_){}}
        if(newer){source=newer;switched=true;}
      }
    }else{
      const permission=automatic?await handle.queryPermission?.({mode:'read'}):
        await (handle.requestPermission?.({mode:'read'})||Promise.resolve('granted'));
      if(!valid())return false;
      if(permission!=='granted'){
        needsPermission=true;throw Error('Autorize a leitura do arquivo em Abrir.');
      }
      const access=handle.getFile();
      file=await (opening?opening.wait(access):access);
      source=fileSource(file,file.name);
    }
    if(!valid())return false;
    const draft=automatic?await window.GeoMineWorkspaceResume?.pendingSnapshot(target.projectId):null;
    if(!valid())return false;
    /* Nada mudou no Drive desde a versão guardada neste aparelho: a retomada
       local mostra o mesmo conteúdo sem baixar o projeto inteiro de novo. */
    if(automatic&&remote&&draft&&!draft.dirty&&!switched&&draft.baseRevision&&draft.baseRevision===source.version)return false;
    if(draft?.dirty){
      const changed=source.kind==='drive'&&draft.baseRevision ? draft.baseRevision!==source.version :
        !draft.baseModified||draft.baseModified!==source.lastModified;
      if(changed&&remote)resumeIssue={project:target.projectId,id:source.id,conflict:true};
      if(changed)lastError=remote?'Há uma versão mais recente no Drive. Suas edições locais foram mantidas. Para abrir a versão do Drive, toque em ↻ ao lado do nome do projeto.':
        'O arquivo mudou. Suas edições locais foram mantidas. Use Abrir para escolher a versão do arquivo.';
      return false;
    }
    if(opening)opening.phase('Acessando a versão atual do arquivo…');else{showLoad('Reabrindo a versão atual do arquivo…');shown=true;}
    if(remote){const download=await opening.wait(drive.read(source,opening.signal));file=download.file;source=download.source;}
    if(!file.size)throw Error('O arquivo está vazio ou ainda não está disponível no provedor.');
    const text=opening?await opening.read(file):await readProjectFileCompat(file);if(!valid())return false;
    const data=opening?await opening.parse(text):JSON.parse(text);
    if(!data||!['ALAGIS','CCMGIS','CCMGeoCampo'].includes(data.app))throw Error('O arquivo atual não é um projeto GeoMine válido.');
    if(!valid())return false;
    const expectedProject=options?.expectedProject||(automatic&&remote&&target.projectId);
    if(expectedProject&&data.projectId!==expectedProject)throw Error('O arquivo escolhido corresponde a outro projeto. Selecione o original desta aba.');
    applyWorkspace(data,target);
    if(target.folder&&typeof PROJECT_DIR_HANDLE!=='undefined')PROJECT_DIR_HANDLE=target.folder;
    const restored=()=>{window.startAutosave(file.name||target.name,handle||null,source);pending=false;committed=true;hide();};
    if(opening)await opening.commit(data,restored);else{window.loadProject(data);restored();}
    if(switched)notify('Versão mais recente carregada do Drive: “'+(file.name||source.name)+'”.');
    else if(!automatic)notify('Projeto reaberto do arquivo atual. O salvamento continua manual.');
    // Arquivo escolhido à mão: é respeitado agora, mas avisa se a pasta já tem
    // uma versão mais nova, que será a aberta na próxima recarga.
    if(options?.source&&remote&&drive.latest){
      const picked=source,project=data.projectId;
      Promise.resolve(drive.latest(picked,project)).then(newer=>{
        if(newer&&current()&&record?.source?.id===picked.id&&S.projectId===project)
          notify('Há uma versão mais recente deste projeto na pasta: “'+newer.name+'”. Toque em ↻ ao lado do nome para abri-la.');
      }).catch(()=>{});
    }
    return true;
  }catch(e){
    if(valid()&&e.name!=='AbortError'){
      if(options?.source){notify(e.message);return false;}
      /* Autorização do Drive vencida numa recarga não é erro: o projeto volta
         do que está guardado neste aparelho e a conferência com o Drive
         acontece no próximo Salvar ou no ↻. Sem aviso na tela. */
      const semAutorizacao=remote&&automatic&&e.code==='drive/authorization-needed';
      if(remote&&automatic)resumeIssue={project:target.projectId,id:target.source.id,message:e.message,quiet:semAutorizacao};
      pending=true;needsPermission=needsPermission||e.name==='NotAllowedError'||e.name==='SecurityError';
      lastError=semAutorizacao?'':'Não foi possível reabrir “'+target.name+'”. '+(e.message||e);}
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
  const durableId=urlId();let resume=coordinated&&(reload||!!durableId);
  tabId=coordinated&&durableId?durableId:storageId(reload&&coordinated);
  if(reload&&!coordinated)notify('Este navegador não permite retomar com segurança o arquivo de cada aba. Use Abrir e selecione o arquivo novamente; o salvamento continua manual.');
  if(!await claim(tabId)){tabId=storageId(false);await claim(tabId);resume=false;}
  if(operation!==token)return;
  rememberId(tabId);initialized=true;
  try{
    const saved=typeof idbGet==='function'?await idbGet(key(owner,tabId)):null;
    if(operation!==token||!current())return;
    if(saved?.version===VERSION&&saved.tabId===tabId&&saved.ownerUid===owner&&typeof saved.name==='string'&&saved.name&&
      !('txt' in saved)&&!('data' in saved)&&!('layers' in saved)){
      record={version:VERSION,tabId,ownerUid:owner,name:saved.name,projectId:saved.projectId||null,
        source:fileSource(saved.source,saved.name),
        handle:isHandle(saved.handle)?saved.handle:null,folder:saved.folder?.kind==='directory'?saved.folder:null,at:saved.at};
      persistent=true;handlePersisted=!!record.handle;pending=true;
      if(resume)await reopen({automatic:true});
    }
  }catch(_){persistent=false;}
  finally{updateSourceButton();resolveReady(state());}
}
function accountChanged(owner){
  // The first login after reload identifies the owner of the existing tab.
  // Only a subsequent account switch must discard that tab identity.
  if(owner!==account&&(initialized||account!==null)){operation++;revision++;initialized=false;record=null;pending=false;busy=false;needsPermission=false;persistent=false;handlePersisted=false;recordGeneration=null;hide();releaseLock?.();releaseLock=null;
    try{sessionStorage.removeItem(STORAGE);sessionStorage.removeItem(VIEW);}catch(_){} }
  if(owner)void initialize(owner);
}
if(typeof baseStart==='function')window.startAutosave=function(name,handle,info){const out=baseStart.apply(this,arguments);void remember(name,handle,info);return out;};
if(typeof baseOpen==='function')window.openProjectFile=open;
if(session?.prepareNewProject){const base=session.prepareNewProject;session.prepareNewProject=async function(){window.GeoMineProjectOpenProgress?.cancel('novo projeto');await forget();return base.apply(this,arguments);};}
document.addEventListener('change',event=>{if(event.target?.id==='projIn')inputFile=event.target.files?.[0]||null;},true);
window.addEventListener('geomine:cloud-ready',event=>accountChanged(event.detail?.user?.uid||uid()));
window.addEventListener('geomine:cloud-disconnected',()=>accountChanged(null));
function boot(){published=('GeoMineCloudProvider' in window)||!!document.getElementById('gmPortao');if(!published||uid())void initialize(uid());}
window.GeoMineProjectTabSession={ready,state,reopen,open,openDrive,forget,remember,bindingFor,showResumeIssue,startIn,pickerStartIn,captureWorkspace,rememberFolder};
window.addEventListener('beforeunload',captureWorkspace);
window.addEventListener('pagehide',captureWorkspace);
if(typeof window.projectHandleStore==='function'){
  const storeFolder=window.projectHandleStore;
  window.projectHandleStore=async function(h){const result=await storeFolder.apply(this,arguments);
    await rememberFolder(h);return result;};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
