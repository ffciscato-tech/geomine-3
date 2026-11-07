/* ============================================================================
   SALVAMENTO CLÁSSICO DO PROJETO

   O nome deste módulo e sua API pública são mantidos por compatibilidade.
   Somente Salvar / Salvar Como gravam o projeto. Não há rascunho contínuo,
   heartbeat, gravação ao sair da página nem restauração automática no boot.
   As cópias existentes no navegador continuam disponíveis em ↺ Recuperar,
   sem serem sobrescritas, migradas ou apagadas por este módulo.
   ========================================================================== */
(function(){
'use strict';
if(window.GeoMineSessionAutosave)return;
if(typeof loadProject!=='function'){
  console.warn('[projeto] persistência base indisponível');return;
}

const TAB_STORAGE_KEY='geomine.session.tab.v1';
/* Ler o ID antigo permite identificar cópias de abas existentes. O modo
   manual não precisa registrar uma nova sessão no navegador. */
const TAB_ID=(()=>{
  try{return sessionStorage.getItem(TAB_STORAGE_KEY)||'manual';}catch(_){return 'manual';}
})();
const STATE={booted:false,restoring:false,restored:false,suspend:0,dirty:false,
  version:0,savedVersion:0,generation:0,ownerUid:null,lastSaveAt:0,lastReason:'',
  sessionHandle:null,pendingHandle:null,writeActive:null,writeContext:null,
  trackingInstalled:false,reloading:false,manual:true};
const baseStartAutosave=window.startAutosave;
const baseSaveProject=window.saveProject;
const baseLoadProject=window.loadProject;
const baseAddLayer=window.addLayer;
const baseDrawLayer=window.drawLayer;
const baseRefreshUI=window.refreshUI;
const baseIdbGet=window.idbGet;

function validProject(d){return !!(d&&(d.app==='ALAGIS'||d.app==='CCMGIS'||d.app==='CCMGeoCampo'));}
function liveUid(){try{return window.GeoMineCloudProvider?.user?.uid||null;}catch(_){return null;}}
function ownerUid(){return liveUid()||STATE.ownerUid||null;}
function keyPart(value){return encodeURIComponent(String(value||'offline'));}
function draftKey(projectId,explicitOwner){
  return 'autosave:'+keyPart(explicitOwner===undefined?ownerUid():explicitOwner)+':'+keyPart(projectId||'draft');
}
function sessionKey(explicitOwner){
  return 'activeProjectSession:'+keyPart(explicitOwner===undefined?ownerUid():explicitOwner)+':'+keyPart(TAB_ID);
}
function projectName(data){
  const raw=data?.projectFileName||data?.projectMeta?.name||S.auto?.name||
    S.currentProjectName||S.projectMeta?.name||'Projeto GeoMine';
  return /\.ccmgis$/i.test(raw)?raw:(raw+'.ccmgis');
}
function projectExists(){
  return !!((typeof hasContent==='function'&&hasContent())||(S.wms&&S.wms.length)||
    (S.plates&&S.plates.length)||S.projectMeta);
}
function renderSaveState(){
  const text=STATE.writeActive?'salvando…':STATE.dirty?'manual: alterações não salvas':'salvamento manual';
  autoTag(text,STATE.dirty?'var(--sel)':undefined);
  const tag=document.getElementById('autoTag');
  if(tag){
    tag.title='Salvar projeto (Ctrl+S). '+(window.GeoMineProjectFile?.status()||'O projeto só é gravado ao usar Salvar ou Salvar Como.');
    tag.onclick=()=>window.saveProject(false);
  }
  const name=document.getElementById('a3OpenProjectName');
  if(name){
    name.title=(S.currentProjectName||'Nenhum projeto aberto')+(STATE.dirty?' (alterações não salvas)':'')+' — '+(window.GeoMineProjectFile?.status()||text);
    name.classList.toggle('project-unsaved',!!STATE.dirty);
  }
}
function markDirty(reason){
  if(!STATE.booted||STATE.suspend||!projectExists())return;
  STATE.dirty=true;STATE.version++;STATE.lastReason=reason||'alteração';
  if(S.auto)S.auto.dirty=true;
  renderSaveState();
}
function clearDirty(){
  STATE.dirty=false;STATE.savedVersion=STATE.version;
  if(S.auto)S.auto.dirty=false;
  renderSaveState();
}
function cancelRestore(reason){
  window.GeoMineProjectOpenProgress?.invalidate(reason);
  STATE.generation++;STATE.lastReason=reason||'troca de projeto';
  return STATE.generation;
}
function detachDestination(){
  STATE.sessionHandle=null;STATE.pendingHandle=null;
  if(S.auto){
    if(S.auto.timer)clearInterval(S.auto.timer);
    S.auto.on=false;S.auto.timer=null;S.auto.handle=null;S.auto.backing='draft';
    S.auto.busy=false;S.auto.blockedLarge=false;
  }
}

window.startAutosave=function startManualProject(name,handle){
  /* Cada gravador confere a geração antes de reconectar seu destino. Não
     bloquear esta função globalmente: um projeto aberto durante uma gravação
     antiga precisa poder registrar seu próprio nome e handle. */
  const out=typeof baseStartAutosave==='function'?baseStartAutosave.call(this,name,handle||null):true;
  S.auto=S.auto||{};
  if(S.auto.timer)clearInterval(S.auto.timer);
  Object.assign(S.auto,{on:false,timer:null,name:name||projectName(),handle:handle||null,
    backing:handle?'file':'draft',dirty:STATE.dirty,blockedLarge:false});
  STATE.sessionHandle=handle||null;STATE.pendingHandle=null;
  renderSaveState();
  return out;
};
/* Chamadores legados podem continuar invocando autosaveNow/flush. Nunca
   convertemos essas chamadas em Salvar: faltaria a intenção explícita. */
window.autosaveNow=async function autosaveDisabled(){return false;};
async function restoreLastProjectSession(){return false;}
async function reconnectProjectFile(){return false;}

if(typeof baseSaveProject==='function')window.saveProject=async function saveProjectManual(){
  if(STATE.writeActive){toast('Aguarde a gravação em andamento e tente novamente.');return false;}
  const context={generation:STATE.generation,version:STATE.version,kind:'manual'};
  STATE.writeActive=context;STATE.writeContext=context;renderSaveState();
  try{
    /* Não aguardar leases da antiga sessão. Além de desnecessários no modo
       manual, esses locks impediam Salvar e consumiam a ativação do clique
       antes de o navegador abrir o seletor de arquivo. */
    const ok=await baseSaveProject.apply(this,arguments);
    if(ok===true&&context.generation===STATE.generation){
      STATE.savedVersion=context.version;STATE.lastSaveAt=Date.now();
      STATE.dirty=STATE.version!==context.version;
      if(S.auto){S.auto.dirty=STATE.dirty;S.auto.savedAt=STATE.lastSaveAt;}
    }
    return ok===true;
  }finally{
    if(STATE.writeActive===context)STATE.writeActive=null;
    if(STATE.writeContext===context)STATE.writeContext=null;
    renderSaveState();
  }
};

window.loadProject=function loadProjectManual(data){
  cancelRestore('projeto aberto');detachDestination();STATE.suspend++;
  let out;
  try{
    out=baseLoadProject.call(this,data);
    STATE.restored=true;clearDirty();
    window.startAutosave(projectName(data),null);
  }finally{
    /* O carregador atual redesenha controles no mesmo turno. Isso não é
       edição; o seletor chamará startAutosave de novo com seu handle. */
    setTimeout(()=>{STATE.suspend=Math.max(0,STATE.suspend-1);},0);
  }
  return out;
};
if(typeof baseAddLayer==='function')window.addLayer=function addLayerManual(){
  const out=baseAddLayer.apply(this,arguments);markDirty('camada criada');return out;
};
if(typeof baseDrawLayer==='function')window.drawLayer=function drawLayerManual(){
  const out=baseDrawLayer.apply(this,arguments);markDirty('camada editada');return out;
};
if(typeof baseRefreshUI==='function')window.refreshUI=function refreshUIManual(){
  const out=baseRefreshUI.apply(this,arguments);markDirty('projeto alterado');return out;
};
async function prepareNewProject(){
  cancelRestore('novo projeto');detachDestination();STATE.restored=false;clearDirty();
}

/* Recuperação é somente leitura e sempre iniciada pelo usuário. */
const PREV_PREFIX='autosave.prev:',ABA_PREFIX='autosave.aba:';
const ROTULO={atual:'Rascunho atual',anterior:'Cópia anterior',aba:'Cópia de aba',legado:'Rascunho antigo'};
function hora(x){
  const d=x instanceof Date?x:new Date(typeof x==='number'?x:Date.parse(x));
  if(isNaN(d))return '?';
  return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' '+
    d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}
function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function idbKeys(){
  if(typeof idb!=='function')return [];
  const db=await idb();
  return new Promise((res,rej)=>{
    const r=db.transaction('kv','readonly').objectStore('kv').getAllKeys();
    r.onsuccess=()=>res((r.result||[]).map(String));r.onerror=()=>rej(r.error);
  });
}
async function listarRascunhos(){
  if(typeof baseIdbGet!=='function')return [];
  const account=ownerUid(),uid=keyPart(account),pid=S.projectId||null;
  let keys=[];try{keys=await idbKeys();}catch(_){return [];}
  const candidates=[];
  keys.forEach(k=>{
    if(k==='autosave')candidates.push({k,tipo:'legado'});
    else if(k.startsWith('autosave:'+uid+':'))candidates.push({k,tipo:'atual'});
    else if(k.startsWith(PREV_PREFIX+uid+':'))candidates.push({k,tipo:'anterior'});
    else if(k.startsWith(ABA_PREFIX+uid+':'))candidates.push({k,tipo:'aba'});
  });
  const items=[];
  for(const candidate of candidates){
    let rec=null;try{rec=await baseIdbGet(candidate.k);}catch(_){}
    if(!rec||typeof rec.txt!=='string')continue;
    /* A chave com conta é a autoridade para cópias antigas sem metadados.
       Uma cópia legada sem conta é acessível somente na sessão offline. */
    if(candidate.tipo==='legado'?(rec.ownerUid||null)!==account:
      (rec.ownerUid!==undefined&&(rec.ownerUid||null)!==account))continue;
    items.push({chave:candidate.k,tipo:candidate.tipo,nome:rec.name||'?',at:rec.at||rec.guardadoEm||null,
      mb:rec.txt.length/1048576,tabId:rec.tabId||null,ownerUid:account,
      mesmoProjeto:!pid||!rec.projectId||rec.projectId===pid,rec});
  }
  items.sort((a,b)=>(Date.parse(b.at||0)||0)-(Date.parse(a.at||0)||0));
  return ownerUid()===account?items:[];
}
function modalSessao(title,html){
  let m=document.getElementById('gmSessaoModal');
  if(!m){
    m=document.createElement('div');m.id='gmSessaoModal';m.className='modal-bg';
    m.innerHTML='<div class="modal" style="width:min(560px,94vw)"><div class="modal-h"><b id="gmSessaoTitulo"></b>'+
      '<div style="flex:1"></div><button class="tbtn" id="gmSessaoX">✕</button></div><div class="modal-b">'+
      '<div id="gmSessaoCorpo" style="line-height:1.45"></div></div></div>';
    document.body.appendChild(m);
    document.getElementById('gmSessaoX').onclick=()=>m.classList.remove('on');
  }
  document.getElementById('gmSessaoTitulo').textContent=title;
  document.getElementById('gmSessaoCorpo').innerHTML=html;
  m.classList.add('on');return m;
}
async function recuperarDe(item){
  if((item.ownerUid||null)!==ownerUid())return false;
  if(projectExists()&&!confirm('Substituir o trabalho atual pela cópia "'+String(item.nome).replace(/\.ccmgis$/i,'')+'" de '+hora(item.at)+'?'))return false;
  const confirmedVersion=STATE.version;
  const opening=window.GeoMineProjectOpenProgress?.begin({title:'Recuperando cópia do projeto…',current:()=>(item.ownerUid||null)===ownerUid()&&STATE.version===confirmedVersion});
  if(!opening)showLoad('Recuperando cópia…');
  try{
    const data=opening?await opening.parse(item.rec.txt):JSON.parse(item.rec.txt);
    if(!validProject(data))throw new Error('a cópia não é um projeto GeoMine válido');
    const restored=()=>{window.startAutosave(item.nome,null);
    /* Uma cópia recuperada ainda não foi salva em um arquivo pelo usuário. */
    STATE.dirty=true;STATE.version++;if(S.auto)S.auto.dirty=true;renderSaveState();};
    if(opening)await opening.commit(data,restored);else{window.loadProject(data);restored();}
    toast('Cópia de '+hora(item.at)+' recuperada — use Salvar Como para gravá-la em arquivo');
    return true;
  }catch(e){if(e.name!=='AbortError')toast('Falha ao recuperar: '+(e.message||e));return false;}
  finally{if(opening)opening.finish();else hideLoad();}
}
async function recuperarAutosaveProtegido(){
  showLoad('Procurando cópias no navegador…');
  let items=[];try{items=await listarRascunhos();}finally{hideLoad();}
  if(!items.length){toast('Nenhuma cópia no navegador');return;}
  const html='<div class="hint" style="margin-bottom:8px">Cópias existentes para a conta atual. O salvamento manual não cria novas cópias automáticas.</div>'+
    items.map((item,i)=>'<div style="display:flex;gap:10px;align-items:center;padding:7px 0;border-top:1px solid #ffffff14">'+
      '<div style="flex:1"><b>'+ROTULO[item.tipo]+'</b> — '+escapeHTML(String(item.nome).replace(/\.ccmgis$/i,''))+
      '<div class="hint">'+hora(item.at)+' · '+item.mb.toFixed(1)+' MB'+(item.mesmoProjeto?'':' · outro projeto')+'</div></div>'+
      '<button class="tbtn" data-rec="'+i+'">Recuperar</button></div>').join('');
  const m=modalSessao('↺ Recuperar cópia',html);
  m.querySelectorAll('button[data-rec]').forEach(button=>{
    button.onclick=()=>{m.classList.remove('on');recuperarDe(items[+button.getAttribute('data-rec')]);};
  });
}
window.recuperarAutosave=recuperarAutosaveProtegido;

function installChangeTracking(){
  if(STATE.trackingInstalled)return;STATE.trackingInstalled=true;
  document.addEventListener('input',event=>{
    if(event.target?.type!=='file')markDirty('entrada alterada');
  },true);
  document.addEventListener('change',event=>{
    if(event.target?.type!=='file')markDirty('opção alterada');
  },true);
  document.addEventListener('pointerup',event=>{
    if(event.target&&event.target.closest&&event.target.closest('#map,#map3d,#layoutCanvas,.leaflet-container'))
      markDirty('edição no mapa');
  },true);
  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented||!(event.ctrlKey||event.metaKey)||event.altKey||String(event.key||'').toLowerCase()!=='s')return;
    event.preventDefault();window.saveProject(!!event.shiftKey);
  },true);
  window.addEventListener('beforeunload',event=>{
    if(STATE.dirty||S.auto?.busy||STATE.writeActive){event.preventDefault();event.returnValue='';}
  });
  renderSaveState();
}
function bootManualSession(uid){
  if(STATE.booted){
    /* O portão pode terminar de autenticar depois da primeira montagem. */
    if(!STATE.ownerUid&&uid)STATE.ownerUid=uid;
    return;
  }
  STATE.booted=true;STATE.ownerUid=uid||null;installChangeTracking();
  if(S.auto){if(S.auto.timer)clearInterval(S.auto.timer);S.auto.timer=null;S.auto.on=false;}
  if(typeof ALAGIS_NEW_PROJECT_BOOT!=='undefined'&&ALAGIS_NEW_PROJECT_BOOT)markDirty('novo projeto');
}
function reloadForAccountChange(){
  if(STATE.reloading)return;STATE.reloading=true;
  cancelRestore('troca de conta');detachDestination();
  const gate=document.getElementById('gmPortao');if(gate)gate.style.display='grid';
  /* Não gravar ao sair nem limpar dirty: beforeunload ainda deve avisar
     sobre trabalho não salvo. O portão evita expor o projeto à outra conta. */
  try{window.location?.reload?.();}catch(_){}
}
window.addEventListener('geomine:cloud-ready',event=>{
  const uid=event.detail?.user?.uid||null;
  if(STATE.booted&&STATE.ownerUid&&uid&&STATE.ownerUid!==uid){reloadForAccountChange();return;}
  bootManualSession(uid);
});
window.addEventListener('geomine:cloud-disconnected',()=>{
  if(STATE.ownerUid)reloadForAccountChange();
});

/* O portão Firebase é inserido depois deste script no HTML publicado.
   Esperar o DOM evita confundir o app publicado com a versão offline.
   Apenas inicializa a interface: não lê sessões nem abre projetos. */
function initManualSession(){
  const published=('GeoMineCloudProvider' in window)||!!document.getElementById('gmPortao');
  if(!published||liveUid())bootManualSession(liveUid());
  else renderSaveState();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initManualSession,{once:true});
else initManualSession();

window.GeoMineSessionAutosave={version:5,mode:'manual',tabId:TAB_ID,draftKey,sessionKey,
  restoreLastProjectSession,reconnectProjectFile,prepareNewProject,cancelRestore,
  markDirty,flush:()=>Promise.resolve(false),state:STATE,
  recuperar:recuperarAutosaveProtegido,listarRascunhos,recuperarDe,
  copiaDaAba:()=>Promise.resolve(false),hora};
})();
