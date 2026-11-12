/* ========================================================================== 
   GeoMine — colaboração por sala.

   Este módulo não conhece Firebase (nem qualquer outro backend). Ele fala
   somente com `window.GeoMineCloudProvider`, instalado pela versão Web. Com
   isso o mesmo `dist/GeoMine.html` continua abrindo e salvando localmente
   quando estiver offline ou fora do portal autenticado.

   Contrato do provider (todos os métodos podem ser async):
     ready, user
     createRoom({name,baseSnapshot}), listRooms(), getRoom(id), joinRoom(id),
     leaveRoom(id), watchRoom(id,cb), watchPresence(id,cb),
     watchOperations(id,cb,{afterSeq}), watchHistory(id,cb), heartbeat(id),
     stopHeartbeat(), acquireLock(id,resourceId,{ttlMs}),
     renewLock(id,resourceId,{ttlMs}), releaseLock(id,resourceId),
     watchLocks(id,cb), uploadSnapshot/downloadSnapshot,
     uploadPayload/downloadPayload,
     publishLayerReplace(id,{resourceId,layerId,payload,baseRevision,metadata}),
     dispose().

   A unidade de concorrência é a camada vetorial: pessoas diferentes podem
   editar camadas diferentes ao mesmo tempo. Um lease impede que duas pessoas
   sobrescrevam a mesma camada silenciosamente. A sincronização da sala é
   independente do arquivo local, que é gravado explicitamente com Salvar.
   ========================================================================== */
(function(){
'use strict';

const VERSION=1;
const LEASE_MS=120000;
const RENEW_MS=40000;
const WATCH_MS=850;
const SYNC_DEBOUNCE_MS=1350;
const QUEUE_KEY='geomine.collaboration.queue.v1';
const CLIENT_KEY='geomine.collaboration.client.v1';
const LAST_ROOM_KEY='geomine.collaboration.last-room.v1';
const IDB_NAME='geomine_collaboration';
/* Espelho deliberado de projectData().layers. Caches de desenho como _rev,
   _snapCache, _endCache e _cnvR não entram: redesenhar uma camada jamais pode
   parecer uma edição colaborativa. */
const LAYER_KEYS=[
  'id','name','gtype','crs','visible','labelField','labelFields','lbl','groupId','clsOpen',
  'color','weight','fill','src','sym','fields','features','attrFilter','attrFilterRules',
  'attrFilterLogic','tinSurface','visReal','cavaDesign','_rb31Recipe','_cavaReferencia',
  '_cavaLimiteDin','_cavaLimiteOrig','_cavaLimiteOrigFeat','_cavaRampOf','_cavaCutVectorOf',
  '_cavaControl','_cavaSource','_rb31CutOf','_cavaCutMode','_cavaLegacyCutOf',
  '_cavaMdtCutOf','_cavaMdtRasterId','_cavaMdtCutUp','_cava2Target','_cava2DesignId',
  '_cava2Kind','_cava2Engine','_cava2CutOf','_cava2MdtId','_cava2CutSnapshotOf',
  '_cava2CutSnapshotId','_cava2CutZ','_cava2SnapshotRole','_baciaTopoVersion',
  '_containerCount','_geology','_channelLink'
];

function makeId(prefix){
  try{if(crypto&&typeof crypto.randomUUID==='function')return (prefix||'')+crypto.randomUUID();}catch(_){ }
  return (prefix||'gm-')+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,11);
}
function sessionValue(key){try{return sessionStorage.getItem(key)||'';}catch(_){return '';}}
function putSession(key,value){try{sessionStorage.setItem(key,value);}catch(_){ }}
function localValue(key){try{return localStorage.getItem(key)||'';}catch(_){return '';}}
function putLocal(key,value){try{localStorage.setItem(key,value);return true;}catch(_){return false;}}
function delLocal(key){try{localStorage.removeItem(key);}catch(_){ }}

let clientId=sessionValue(CLIENT_KEY);
if(!clientId){clientId=makeId('client-');putSession(CLIENT_KEY,clientId);}

const C={
  version:VERSION,clientId,provider:null,user:null,room:null,roomId:null,role:null,
  status:'idle',online:typeof navigator==='undefined'||navigator.onLine!==false,
  autoSync:true,lastSeq:0,replayTargetSeq:0,lastSync:null,error:'',baseRevision:null,
  presence:[],members:[],history:[],localHistory:[],locks:new Map(),revisions:new Map(),
  queue:[],queueReady:false,applyingRemote:false,activeResourceId:null,
  signatures:new Map(),pendingSignatures:new Map(),timers:new Map(),monitorAcquiring:new Set(),unsubs:[],watchGeneration:0,
  tab:'room',drawerOpen:false,
  form:{name:'',joinId:localValue(LAST_ROOM_KEY)||'',inviteEmail:'',inviteRole:'editor'}
};
let injectedProvider=null,monitorTimer=null,renewTimer=null,operationChain=Promise.resolve(),flushPromise=null;

function appState(){try{return typeof S!=='undefined'&&S?S:null;}catch(_){return null;}}
function notifyToast(message){
  try{if(typeof toast==='function')toast(message);else console.info('GeoMine:',message);}
  catch(_){console.info('GeoMine:',message);}
}
function html(value){return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function nowISO(){return new Date().toISOString();}
function asTime(value){
  if(value&&typeof value.toDate==='function')value=value.toDate();
  const d=value instanceof Date?value:new Date(value||Date.now());
  return Number.isFinite(d.getTime())?d.toLocaleString('pt-BR'):'agora';
}
function errorCode(error){return String(error&&error.code||error&&error.name||'').toUpperCase();}
function errorText(error){return String(error&&error.message||error||'Erro desconhecido');}
function isConflict(error){return /CONFLICT|REVISION|LOCKED|LEASE/.test(errorCode(error)+' '+errorText(error).toUpperCase());}
function isOfflineError(error){
  return !C.online||/OFFLINE|NETWORK|UNAVAILABLE|FETCH|TIMEOUT/.test(errorCode(error)+' '+errorText(error).toUpperCase());
}
function currentUserId(){return String(C.user&&(C.user.uid||C.user.id||C.user.userId)||C.clientId);}
function currentUserName(){return String(C.user&&(C.user.displayName||C.user.name||C.user.email)||'Usuário GeoMine');}
function activeLayerSafe(){try{return typeof activeLayer==='function'?activeLayer():(appState()||{}).layers?.find(L=>L.id===(appState()||{}).activeId)||null;}catch(_){return null;}}
function layerByResource(resourceId){const state=appState();return state&&Array.isArray(state.layers)?state.layers.find(L=>String(L&&L._collabId||'')===String(resourceId||'')):null;}
function layerById(layerId){const state=appState();return state&&Array.isArray(state.layers)?state.layers.find(L=>String(L&&L.id)===String(layerId)):null;}

function setStatus(status,error){
  C.status=status||C.status;
  C.error=error?errorText(error):'';
  persistSessionMeta();render();emitState();
}
function publicState(){
  return {
    version:VERSION,status:C.status,roomId:C.roomId,room:C.room?plainObject(C.room):null,
    role:C.role,user:C.user?plainObject(C.user):null,online:C.online,
    presence:C.presence.map(plainObject),members:C.members.map(plainObject),locks:[...C.locks.values()].map(plainObject),
    history:mergedHistory().map(plainObject),queueLength:C.queue.length,lastSeq:C.lastSeq,replayTargetSeq:C.replayTargetSeq,
    lastSync:C.lastSync,error:C.error,autoSync:C.autoSync,clientId:C.clientId,
    activeResourceId:C.activeResourceId
  };
}
function emitState(){
  if(typeof window==='undefined'||typeof CustomEvent==='undefined')return;
  try{window.dispatchEvent(new CustomEvent('geomine:collaboration-state',{detail:publicState()}));}catch(_){ }
}
function persistSessionMeta(){
  const state=appState();if(!state)return;
  state.collaboration=C.roomId?{
    roomId:C.roomId,roomName:C.room&&(C.room.name||C.room.title)||'',
    baseRevision:C.baseRevision??null,lastSeq:C.lastSeq||0
  }:null;
}

function plainObject(value){
  if(value==null||typeof value!=='object')return value;
  try{return JSON.parse(JSON.stringify(value,(key,item)=>{
    if(typeof item==='function')return undefined;
    if(item&&typeof item.toDate==='function')return item.toDate().toISOString();
    return item;
  }));}catch(_){return {};}
}
function cleanValue(value,seen){
  if(value==null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number')return Number.isFinite(value)?value:null;
  if(typeof value==='function'||typeof value==='symbol')return undefined;
  if(value instanceof Date)return value.toISOString();
  if(typeof Blob!=='undefined'&&value instanceof Blob)return undefined;
  if(typeof Element!=='undefined'&&value instanceof Element)return undefined;
  if(typeof ArrayBuffer!=='undefined'&&(value instanceof ArrayBuffer||ArrayBuffer.isView&&ArrayBuffer.isView(value)))return undefined;
  if(typeof value!=='object')return undefined;
  seen=seen||new WeakSet();if(seen.has(value))return undefined;seen.add(value);
  if(Array.isArray(value)){
    const out=value.map(v=>cleanValue(v,seen));seen.delete(value);return out;
  }
  const out={};
  Object.keys(value).forEach(key=>{
    if(key==='llayer'||key==='overlay'||key==='_collabLock'||key==='_collabSavedManualLocked'||
       key==='_collabKnown'||key==='_collabPending'||key==='_leaflet_id'||key==='locked')return;
    const next=cleanValue(value[key],seen);if(next!==undefined)out[key]=next;
  });
  seen.delete(value);return out;
}
function serializeLayer(layer){
  if(!layer)throw new Error('Selecione uma camada vetorial.');
  const payload={};
  LAYER_KEYS.forEach(key=>{const value=cleanValue(layer[key]);if(value!==undefined)payload[key]=value;});
  payload.id=layer.id;payload._collabId=ensureLayerId(layer);
  payload.features=Array.isArray(payload.features)?payload.features:[];
  payload.fields=Array.isArray(payload.fields)?payload.fields:[];
  payload._collabSchema=VERSION;
  return payload;
}
function signatureOf(layer){
  try{
    const txt=JSON.stringify(serializeLayer(layer));let h=2166136261;
    for(let i=0;i<txt.length;i++){h^=txt.charCodeAt(i);h=Math.imul(h,16777619);}
    return (h>>>0).toString(36)+':'+txt.length;
  }catch(_){return 'invalid';}
}
function ensureLayerId(layer){
  if(!layer)return '';
  if(!layer._collabId)layer._collabId=makeId('layer-');
  return String(layer._collabId);
}
function ensureAllLayerIds(){
  const state=appState();if(!state||!Array.isArray(state.layers))return [];
  state.layers.forEach(ensureLayerId);return state.layers;
}
function baselineLayers(known){
  ensureAllLayerIds().forEach(layer=>{
    C.signatures.set(ensureLayerId(layer),signatureOf(layer));
    if(known!==undefined)layer._collabKnown=!!known;
  });
}

function captureSnapshot(){
  if(typeof projectData!=='function')throw new Error('O salvamento do projeto ainda não terminou de carregar.');
  const layers=ensureAllLayerIds(),data=projectData();
  if(!data||typeof data!=='object')throw new Error('Não foi possível montar a fotografia do projeto.');
  const idByLocal=new Map(layers.map(layer=>[String(layer.id),ensureLayerId(layer)]));
  (data.layers||[]).forEach((item,index)=>{
    item._collabId=idByLocal.get(String(item.id))||ensureLayerId(layers[index]);
  });
  data.collaboration={
    roomId:C.roomId||null,roomName:C.room&&(C.room.name||C.room.title)||'',
    baseRevision:C.baseRevision??null,lastSeq:C.lastSeq||0,schemaVersion:VERSION
  };
  return data;
}
function restoreLayerIds(snapshot){
  const state=appState(),incoming=Array.isArray(snapshot&&snapshot.layers)?snapshot.layers:[];
  if(!state||!Array.isArray(state.layers))return;
  const byId=new Map(incoming.map(x=>[String(x.id),x]));
  state.layers.forEach((layer,index)=>{
    const source=byId.get(String(layer.id))||incoming[index];
    if(source&&source._collabId)layer._collabId=String(source._collabId);
    ensureLayerId(layer);layer._collabKnown=true;
  });
}
function applyInitialSnapshot(snapshot){
  if(!snapshot||typeof snapshot!=='object')return false;
  if(typeof loadProject!=='function')throw new Error('A abertura de projetos ainda não terminou de carregar.');
  C.applyingRemote=true;
  try{loadProject(snapshot);restoreLayerIds(snapshot);baselineLayers(true);}
  finally{C.applyingRemote=false;}
  return true;
}

async function provider(){
  const p=injectedProvider||(typeof window!=='undefined'&&window.GeoMineCloudProvider);
  if(!p)throw Object.assign(new Error('A colaboração fica disponível no GeoMine Web após o login.'),{code:'PROVIDER_UNAVAILABLE'});
  C.provider=p;
  if(typeof p.ready==='function')await p.ready();
  else if(p.ready&&typeof p.ready.then==='function')await p.ready;
  let user=typeof p.user==='function'?p.user():p.user;
  if(user&&typeof user.then==='function')user=await user;
  C.user=user||C.user||null;
  return p;
}
function normalizeRoom(result,fallbackId){
  const raw=result&&result.room?result.room:result||{};
  const id=raw.id||raw.roomId||result&&result.roomId||fallbackId;
  if(!id)throw new Error('O servidor não devolveu o identificador da sala.');
  return Object.assign({},plainObject(raw),{
    id:String(id),roomId:String(id),myRole:raw.myRole||result&&result.myRole||raw.role||result&&result.role||null
  });
}
function callWatch(p,name,args,callback,tailOptions){
  if(typeof p[name]!=='function')return;
  try{
    const callArgs=[...args,callback];if(tailOptions!==undefined)callArgs.push(tailOptions);
    const ret=p[name](...callArgs);
    Promise.resolve(ret).then(unsub=>{if(typeof unsub==='function')C.unsubs.push(unsub);}).catch(error=>console.warn('GeoMine colaboração '+name,error));
  }catch(error){console.warn('GeoMine colaboração '+name,error);}
}
function detachWatchers(){
  C.watchGeneration++;
  C.unsubs.splice(0).forEach(fn=>{try{fn();}catch(_){ }});
  try{if(C.provider&&typeof C.provider.stopHeartbeat==='function')C.provider.stopHeartbeat();}catch(_){ }
}
function updateMembers(value){
  C.members=normalizeList(value,'members');
  const uid=currentUserId(),self=C.members.find(member=>String(member.uid||member.userId||member.id||'')===uid);
  if(self){
    C.role=String(self.role||self.permission||C.role||'viewer');
  }else if(C.roomId&&C.members.length){
    /* A revogação no servidor deve fechar a escrita imediatamente, sem
       esperar a próxima tentativa ser recusada pelas regras. */
    C.role='viewer';C.status='error';C.error='Seu acesso a esta sala foi removido. O projeto local continua aberto.';
    C.timers.forEach(clearTimeout);C.timers.clear();C.pendingSignatures.clear();
    ensureAllLayerIds().forEach(layer=>applyEffectiveLock(layer,null));C.locks.clear();
  }
  renderPeople();render();emitState();
}
function connectWatchers(p,room){
  detachWatchers();const generation=C.watchGeneration,roomId=room.id;
  if(typeof p.heartbeat==='function')Promise.resolve(p.heartbeat(roomId)).catch(error=>console.warn('presença GeoMine',error));
  callWatch(p,'watchRoom',[roomId],value=>{
    if(generation!==C.watchGeneration)return;
    const next=value&&value.room?value.room:value;
    if(next){
      C.online=true;
      C.room=Object.assign({},C.room||{},plainObject(next));
      C.replayTargetSeq=Math.max(C.replayTargetSeq,+next.nextSeq||0);
      if(C.online&&C.lastSeq<C.replayTargetSeq&&C.status!=='conflict'&&C.status!=='error')C.status='syncing';
    }
    render();emitState();
  });
  callWatch(p,'watchPresence',[roomId],value=>{
    if(generation!==C.watchGeneration)return;C.presence=normalizeList(value,'presence');renderPeople();emitState();
  });
  /* Membros e presença são conceitos diferentes: quem foi convidado
     continua aparecendo mesmo quando está offline. Provedores simples podem
     omitir estes métodos; nesse caso a aba mostra apenas a presença. */
  callWatch(p,'watchMembers',[roomId],value=>{
    if(generation!==C.watchGeneration)return;updateMembers(value);
  });
  if(typeof p.listMembers==='function')Promise.resolve(p.listMembers(roomId)).then(value=>{
    if(generation!==C.watchGeneration)return;updateMembers(value);
  }).catch(error=>console.warn('membros da sala',error));
  callWatch(p,'watchLocks',[roomId],value=>{
    if(generation!==C.watchGeneration)return;replaceLocks(value);
  });
  callWatch(p,'watchHistory',[roomId],value=>{
    if(generation!==C.watchGeneration)return;C.history=normalizeList(value,'history').slice(0,120);renderHistory();emitState();
  });
  callWatch(p,'watchOperations',[roomId],value=>{
    if(generation!==C.watchGeneration)return;
    operationChain=operationChain.then(()=>consumeOperations(value,generation)).catch(error=>{
      console.error('operação colaborativa',error);setStatus('error',error);
    });
  },{afterSeq:C.lastSeq||0});
}
function normalizeList(value,key){
  if(!value)return [];
  if(Array.isArray(value))return value.map(plainObject);
  if(Array.isArray(value[key]))return value[key].map(plainObject);
  if(value.docs&&Array.isArray(value.docs))return value.docs.map(x=>plainObject(typeof x.data==='function'?x.data():x));
  if(typeof value==='object')return Object.keys(value).map(id=>Object.assign({id},plainObject(value[id])));
  return [];
}

function lockOwner(lock){return String(lock&&(lock.ownerUid||lock.holderUid||lock.ownerId||lock.uid||lock.userId||lock.clientId||lock.holderId)||'');}
function lockExpiryMs(lock){
  const expiry=lock&&(lock.expiresAt||lock.leaseUntil||lock.expiresAtMs);
  if(!expiry)return Infinity;
  if(expiry&&typeof expiry.toDate==='function')return expiry.toDate().getTime();
  if(expiry&&typeof expiry==='object'&&Number.isFinite(+expiry.seconds))return +expiry.seconds*1000+(+expiry.nanoseconds||0)/1e6;
  if(typeof expiry==='number')return expiry<1e11?expiry*1000:expiry;
  const parsed=new Date(expiry).getTime();return Number.isFinite(parsed)?parsed:Infinity;
}
function lockExpired(lock){return lockExpiryMs(lock)<=Date.now();}
function ownLock(lock){
  if(!lock)return false;
  /* A mesma conta pode estar aberta em dois computadores. Quando o servidor
     informa o dispositivo, ele prevalece sobre o UID para que uma segunda
     sessão não se aproprie do lease da primeira. */
  const device=String(lock.deviceId||lock.clientId||lock.holderDeviceId||'');
  if(device)return device===C.clientId;
  const owner=lockOwner(lock);return !!owner&&(owner===currentUserId()||owner===C.clientId);
}
function lockResource(lock,fallback){return String(lock&&(lock.resourceId||lock.layerId||lock.id)||fallback||'');}
function normalizeLocks(value){
  const raw=value&&value.locks!==undefined?value.locks:value,out=[];
  if(Array.isArray(raw))raw.forEach(x=>out.push(plainObject(x)));
  else if(raw&&typeof raw==='object')Object.keys(raw).forEach(id=>out.push(Object.assign({resourceId:id},plainObject(raw[id]))));
  return out.filter(lock=>lockResource(lock)&&lock.active!==false&&!lockExpired(lock));
}
function applyEffectiveLock(layer,lock){
  if(!layer)return;
  if(!lock){
    delete layer._collabLock;delete layer._collabSavedManualLocked;return;
  }
  /* Formato estável consumido também pelas ferramentas do núcleo. Mantém
     a resposta original em `raw`, mas nunca mistura o lease com `L.locked`. */
  layer._collabLock={
    ownerUid:lockOwner(lock),ownerName:String(lock.ownerName||lock.holderName||lock.displayName||lock.email||'Outro colaborador'),
    deviceId:String(lock.deviceId||lock.clientId||lock.holderDeviceId||''),expiresAt:lock.expiresAt||lock.leaseUntil||lock.expiresAtMs||null,
    remote:!ownLock(lock),resourceId:ensureLayerId(layer),raw:plainObject(lock)
  };
  /* `layer.locked` é o bloqueio manual do usuário e nunca é alterado
     aqui. As ferramentas consultam `canEditLayer`/`_collabLock.remote`. */
}
function replaceLocks(value){
  const next=new Map();normalizeLocks(value).forEach(lock=>next.set(lockResource(lock),lock));
  ensureAllLayerIds().forEach(layer=>applyEffectiveLock(layer,next.get(ensureLayerId(layer))||null));
  C.locks=next;try{if(typeof refreshUI==='function')refreshUI();}catch(_){ }
  render();emitState();
}
function rememberLock(resourceId,lock){
  const normalized=Object.assign({resourceId,ownerUid:currentUserId(),ownerId:currentUserId(),ownerName:currentUserName(),deviceId:C.clientId,expiresAt:Date.now()+LEASE_MS},plainObject(lock||{}));
  normalized.resourceId=resourceId;C.locks.set(resourceId,normalized);
  applyEffectiveLock(layerByResource(resourceId),normalized);render();emitState();return normalized;
}
async function acquireLayer(layer,quiet){
  if(!C.roomId||!layer)return false;
  if(viewerRole()){if(!quiet)notifyToast('Seu acesso a esta sala é somente para visualização.');return false;}
  if(C.lastSeq<C.replayTargetSeq){if(!quiet)notifyToast('Aguarde a atualização inicial da sala terminar.');return false;}
  const resourceId=ensureLayerId(layer),seen=C.locks.get(resourceId);
  if(seen&&ownLock(seen))return true;
  if(seen&&!ownLock(seen)){
    if(!quiet)notifyToast('Camada em edição por '+(seen.ownerName||seen.email||'outro colaborador')+'.');
    return false;
  }
  try{
    const p=await provider();if(typeof p.acquireLock!=='function'){rememberLock(resourceId);return true;}
    const result=await p.acquireLock(C.roomId,resourceId,{ttlMs:LEASE_MS,layerId:layer.id,layerName:layer.name,
      clientId:C.clientId,deviceId:C.clientId});
    C.online=true;
    const ok=result===true||result&&result.ok!==false;
    if(!ok){const lock=result&&(result.lock||result)||{ownerUid:'remote',ownerName:'Outro colaborador'};rememberLock(resourceId,lock);if(!quiet)notifyToast('Esta camada já está sendo editada.');return false;}
    rememberLock(resourceId,result&&result.lock||result);return true;
  }catch(error){
    if(isOfflineError(error)){C.online=false;setStatus('offline',error);return false;}
    if(!quiet)notifyToast('Não foi possível reservar a camada: '+errorText(error));
    return false;
  }
}
async function releaseLayer(layer,quiet){
  if(!layer)return false;const resourceId=ensureLayerId(layer),lock=C.locks.get(resourceId);
  if(lock&&!ownLock(lock))return false;
  try{
    const p=C.provider||await provider();
    if(C.roomId&&typeof p.releaseLock==='function')await p.releaseLock(C.roomId,resourceId,{clientId:C.clientId,deviceId:C.clientId});
  }catch(error){if(!quiet)notifyToast('A reserva será liberada quando a conexão voltar.');}
  C.locks.delete(resourceId);applyEffectiveLock(layer,null);render();emitState();return true;
}
async function renewLocks(){
  if(!C.roomId||!C.online)return;
  let p;try{p=await provider();}catch(_){return;}
  if(typeof p.renewLock!=='function')return;
  for(const [resourceId,lock] of C.locks){
    if(!ownLock(lock))continue;
    try{const result=await p.renewLock(C.roomId,resourceId,{ttlMs:LEASE_MS,clientId:C.clientId,deviceId:C.clientId});C.online=true;rememberLock(resourceId,result&&result.lock||result||lock);}
    catch(error){console.warn('renovação de lease',error);}
  }
}

function operationList(value){
  if(!value)return [];
  if(Array.isArray(value))return value;
  if(Array.isArray(value.operations))return value.operations;
  if(value.operation)return [value.operation];
  return [value];
}
async function resolvePayload(p,operation){
  let payload=operation.payload??operation.layer??null;
  if(payload&&typeof payload==='string'){
    try{payload=JSON.parse(payload);}catch(_){ }
  }
  if(payload&&payload.layer)payload=payload.layer;
  if(!payload&&typeof p.downloadPayload==='function'){
    payload=await p.downloadPayload(C.roomId,operation.payloadRef||operation.payloadId||operation);
    if(payload&&payload.payload)payload=payload.payload;if(payload&&payload.layer)payload=payload.layer;
  }
  return payload;
}
async function consumeOperations(value,generation){
  const p=C.provider||await provider(),ops=operationList(value).slice().sort((a,b)=>(+a.seq||0)-(+b.seq||0));
  for(const raw of ops){
    if(generation!==C.watchGeneration)break;
    const op=plainObject(raw),seq=+op.seq||0;if(seq&&seq<=C.lastSeq)continue;
    const type=String(op.type||op.kind||op.operation||'');
    if(type==='layer.replace'||type==='layer_replace'||type==='replace')await applyLayerOperation(p,op);
    if(seq)C.lastSeq=Math.max(C.lastSeq,seq);
  }
  if(C.roomId&&C.lastSeq>=C.replayTargetSeq&&C.status==='syncing'){
    C.status=C.online?'connected':'offline';C.error='';
    if(C.online)flushQueue().catch(error=>console.warn('fila após replay',error));
  }
  persistSessionMeta();render();emitState();
}
function hasPendingResource(resourceId){
  const layer=layerByResource(resourceId),dirty=!!layer&&C.signatures.has(resourceId)&&signatureOf(layer)!==C.signatures.get(resourceId);
  return dirty||C.timers.has(resourceId)||C.queue.some(item=>item.roomId===C.roomId&&item.data&&item.data.resourceId===resourceId);
}
async function applyLayerOperation(p,operation){
  const resourceId=String(operation.resourceId||operation.layerId||operation.metadata&&operation.metadata.resourceId||'');
  if(!resourceId)return;
  const author=String(operation.authorId||operation.userId||operation.metadata&&operation.metadata.authorId||'');
  const sourceClient=String(operation.clientId||operation.metadata&&operation.metadata.clientId||'');
  /* Outra aba/computador pode usar a mesma conta. Quando a operação traz
     clientId, ele é a identidade decisiva; o UID só é fallback para
     provedores antigos que ainda não informam o dispositivo. */
  if((sourceClient&&sourceClient===C.clientId)||(!sourceClient&&author&&author===currentUserId())){
    if(operation.revision!=null)C.revisions.set(resourceId,operation.revision);return;
  }
  const payload=await resolvePayload(p,operation);if(!payload||typeof payload!=='object')return;
  if(hasPendingResource(resourceId)){
    /* Nunca avance o cursor descartando uma revisão. Preserve a cópia
       recebida como camada independente, enquanto a versão local continua
       intacta para o usuário comparar/mesclar conscientemente. */
    createConflictCopy(payload,resourceId,operation);
    if(operation.revision!=null)C.revisions.set(resourceId,operation.revision);
    return;
  }
  C.applyingRemote=true;
  try{
    /* IDs numéricos são locais e podem colidir quando duas pessoas criam uma
       camada ao mesmo tempo. Operações remotas só casam pelo UUID cooperativo. */
    let layer=layerByResource(resourceId);
    if(layer){
      const keep={id:layer.id,llayer:layer.llayer,collabLock:layer._collabLock,
        savedLock:layer._collabSavedManualLocked,manualLocked:layer.locked};
      const clean=cleanValue(payload)||{};
      LAYER_KEYS.forEach(key=>{
        if(key==='id')return;
        if(Object.prototype.hasOwnProperty.call(clean,key))layer[key]=clean[key];else delete layer[key];
      });
      layer.id=keep.id;layer.llayer=keep.llayer;layer._collabId=resourceId;
      if(keep.collabLock)layer._collabLock=keep.collabLock;
      if(keep.savedLock!==undefined)layer._collabSavedManualLocked=keep.savedLock;
      layer.locked=keep.manualLocked;
    }else{
      if(typeof addLayer!=='function')throw new Error('Não foi possível criar a camada recebida.');
      layer=addLayer({name:payload.name||'Camada compartilhada',gtype:payload.gtype||'polygon',
        crs:payload.crs||(appState()||{}).workCRS,features:plainObject(payload.features||[]),
        fields:plainObject(payload.fields||[]),color:payload.color});
      const localId=layer.id,localMap=layer.llayer,clean=cleanValue(payload)||{};
      LAYER_KEYS.forEach(key=>{if(key!=='id'&&Object.prototype.hasOwnProperty.call(clean,key))layer[key]=clean[key];});
      layer.id=localId;layer.llayer=localMap;layer._collabId=resourceId;
    }
    if(layer._geology&&layer._geology.importedBoreholes===true)layer.locked=true;
    layer._collabKnown=true;
    try{if(typeof drawLayer==='function')drawLayer(layer);if(typeof zApply==='function')zApply();if(typeof refreshUI==='function')refreshUI();}catch(error){console.warn('redesenho colaborativo',error);}
    C.signatures.set(resourceId,signatureOf(layer));
    if(operation.revision!=null)C.revisions.set(resourceId,operation.revision);
    C.lastSync=nowISO();C.status='connected';C.error='';
    addLocalHistory('Atualização recebida',layer.name||resourceId,'remote');
  }finally{C.applyingRemote=false;}
}
function createConflictCopy(payload,resourceId,operation){
  if(typeof addLayer!=='function')throw new Error('Não foi possível preservar a revisão remota em conflito.');
  const clean=cleanValue(payload)||{},baseName=clean.name||operation.metadata&&operation.metadata.name||'Camada';
  C.applyingRemote=true;
  try{
    const layer=addLayer({name:'Conflito remoto — '+baseName,gtype:clean.gtype||'polygon',
      crs:clean.crs||(appState()||{}).workCRS,features:plainObject(clean.features||[]),
      fields:plainObject(clean.fields||[]),color:clean.color});
    const localId=layer.id,localMap=layer.llayer;
    LAYER_KEYS.forEach(key=>{if(key!=='id'&&Object.prototype.hasOwnProperty.call(clean,key))layer[key]=clean[key];});
    layer.id=localId;layer.llayer=localMap;layer.name='Conflito remoto — '+baseName;
    if(layer._geology&&layer._geology.importedBoreholes===true)layer.locked=true;
    layer._collabId=makeId('conflict-');layer._collabConflictOf=resourceId;layer._collabKnown=true;
    try{if(typeof drawLayer==='function')drawLayer(layer);if(typeof zApply==='function')zApply();if(typeof refreshUI==='function')refreshUI();}catch(error){console.warn('camada de conflito',error);}
    C.signatures.set(layer._collabId,signatureOf(layer));
    C.status='conflict';C.error='A revisão remota foi preservada em "'+layer.name+'"; sua camada local não foi sobrescrita.';
    addLocalHistory('Conflito preservado',layer.name,'warn');render();emitState();
  }finally{C.applyingRemote=false;}
}

function addLocalHistory(action,detail,tone){
  C.localHistory.unshift({id:makeId('history-'),action,detail,tone:tone||'',at:nowISO(),userName:currentUserName()});
  C.localHistory=C.localHistory.slice(0,40);renderHistory();
}
function mergedHistory(){
  return [...C.localHistory,...C.history].sort((a,b)=>new Date(b.at||b.createdAt||0)-new Date(a.at||a.createdAt||0)).slice(0,120);
}
function publishMetadata(layer){return {
  clientId:C.clientId,authorId:currentUserId(),authorName:currentUserName(),
  name:layer.name||'Camada',gtype:layer.gtype||'',featureCount:(layer.features||[]).length,
  savedAt:nowISO(),resourceId:ensureLayerId(layer)
};}
async function publishLayer(layer,options){
  options=options||{};
  if(!C.roomId)throw new Error('Entre em uma sala antes de sincronizar.');
  if(viewerRole())throw Object.assign(new Error('Seu acesso a esta sala é somente para visualização.'),{code:'COLLAB_READ_ONLY'});
  if(C.lastSeq<C.replayTargetSeq)throw Object.assign(new Error('Aguarde a atualização inicial da sala terminar.'),{code:'COLLAB_REPLAY_PENDING'});
  const resourceId=ensureLayerId(layer),payload=serializeLayer(layer),signature=signatureOf(layer);
  if(!options.force&&signature===C.signatures.get(resourceId)&&layer._collabKnown!==false)return {unchanged:true};
  if(!C.online)return enqueueLayer(layer,payload,'offline');
  let p;
  try{p=await provider();}catch(error){return enqueueLayer(layer,payload,errorText(error));}
  const acquired=await acquireLayer(layer,!!options.automatic);
  if(!acquired){
    const lock=C.locks.get(resourceId);
    if(lock&&!ownLock(lock)){
      C.status='conflict';C.error='A camada está reservada por '+(lock.ownerName||lock.email||'outro colaborador')+'.';render();
      return {ok:false,locked:true,lock};
    }
    if(!C.online)return enqueueLayer(layer,payload,'offline');
    return {ok:false,locked:true};
  }
  if(typeof p.publishLayerReplace!=='function')throw new Error('O servidor não oferece sincronização de camadas.');
  setStatus('syncing');
  try{
    const result=await p.publishLayerReplace(C.roomId,{
      resourceId,layerId:layer.id,payload,baseRevision:C.revisions.get(resourceId)??0,
      metadata:publishMetadata(layer)
    });
    C.online=true;
    if(result&&result.revision!=null)C.revisions.set(resourceId,result.revision);
    if(result&&result.seq)C.lastSeq=Math.max(C.lastSeq,+result.seq||0);
    layer._collabKnown=true;C.signatures.set(resourceId,signature);C.lastSync=nowISO();C.status='connected';C.error='';
    addLocalHistory('Camada sincronizada',layer.name||resourceId,'ok');persistSessionMeta();render();emitState();
    return result||{ok:true};
  }catch(error){
    if(isOfflineError(error)){C.online=false;return enqueueLayer(layer,payload,errorText(error));}
    C.status=isConflict(error)?'conflict':'error';C.error=errorText(error);render();emitState();throw error;
  }
}
async function syncActiveLayer(options){
  const layer=activeLayerSafe();if(!layer){notifyToast('Selecione uma camada vetorial para sincronizar.');return {ok:false,noLayer:true};}
  try{
    const result=await publishLayer(layer,Object.assign({force:true},options||{}));
    if(result&&result.queued)notifyToast('Sem conexão: alteração guardada na fila local.');
    else if(!(result&&result.unchanged))notifyToast('Camada "'+layer.name+'" sincronizada.');
    return result;
  }catch(error){
    const forbidden=errorCode(error)==='COLLAB_READ_ONLY';
    notifyToast('Sincronização: '+errorText(error));return {ok:false,forbidden,error:errorText(error)};
  }
}

function scheduleLayer(layer){
  if(!layer||!C.roomId||!C.autoSync||C.applyingRemote)return;
  const resourceId=ensureLayerId(layer),pendingSignature=signatureOf(layer);
  /* O monitor roda antes do debounce. Se a assinatura ainda é a mesma,
     preserve o timer original; reiniciá-lo em toda varredura impediria o
     autosync de disparar para sempre. */
  if(C.timers.has(resourceId)&&C.pendingSignatures.get(resourceId)===pendingSignature)return;
  clearTimeout(C.timers.get(resourceId));C.pendingSignatures.set(resourceId,pendingSignature);
  layer._collabPending=true;
  C.timers.set(resourceId,setTimeout(async()=>{
    C.timers.delete(resourceId);C.pendingSignatures.delete(resourceId);delete layer._collabPending;
    try{await publishLayer(layer,{automatic:true});}catch(error){console.warn('autosync da camada',error);}
  },SYNC_DEBOUNCE_MS));
  render();
}
async function activeChanged(previous,next){
  if(previous&&previous!==next){
    const old=layerByResource(previous);
    if(old){
      const changed=signatureOf(old)!==C.signatures.get(previous);
      if(changed){clearTimeout(C.timers.get(previous));C.timers.delete(previous);C.pendingSignatures.delete(previous);try{await publishLayer(old,{automatic:true});}catch(_){ }}
      await releaseLayer(old,true);
    }
  }
  C.activeResourceId=next||null;
  if(next){
    const layer=layerByResource(next);if(layer){await acquireLayer(layer,true);if(layer._collabKnown===false)scheduleLayer(layer);}
  }
  render();emitState();
}
function monitorLayers(){
  const layers=ensureAllLayerIds();
  if(!C.roomId){
    const saved=appState()&&appState().collaboration;
    if(saved&&saved.roomId&&!C.form.joinId){C.form.joinId=saved.roomId;render();}
    return;
  }
  if(C.lastSeq<C.replayTargetSeq)return;
  /* O Firestore não emite um novo snapshot apenas porque o relógio passou.
     Portanto leases vencidas precisam ser retiradas localmente; caso contrário
     uma camada ficaria bloqueada até alguma outra escrita ocorrer no servidor. */
  let locksChanged=false;
  for(const [resourceId,lock] of [...C.locks]){
    if(!lockExpired(lock))continue;
    C.locks.delete(resourceId);applyEffectiveLock(layerByResource(resourceId),null);locksChanged=true;
  }
  if(locksChanged){try{if(typeof refreshUI==='function')refreshUI();}catch(_){ }render();emitState();}
  layers.forEach(layer=>{
    const resourceId=ensureLayerId(layer);
    if(!C.signatures.has(resourceId)){C.signatures.set(resourceId,signatureOf(layer));layer._collabKnown=false;}
  });
  const active=activeLayerSafe(),next=active?ensureLayerId(active):null;
  if(next!==C.activeResourceId)activeChanged(C.activeResourceId,next).catch(error=>console.warn('troca de lease',error));
  if(!active||C.applyingRemote)return;
  const activeLock=C.locks.get(next);
  if(C.online&&!viewerRole()&&!activeLock&&!C.monitorAcquiring.has(next)){
    C.monitorAcquiring.add(next);
    acquireLayer(active,true).finally(()=>C.monitorAcquiring.delete(next));
  }
  if(!C.autoSync)return;
  const signature=signatureOf(active);
  if(signature!==C.signatures.get(next))scheduleLayer(active);
}

function qdb(){return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(new Error('IndexedDB indisponível'));return;}
  const req=indexedDB.open(IDB_NAME,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('kv'))req.result.createObjectStore('kv');};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});}
async function qget(){const db=await qdb();return new Promise((resolve,reject)=>{const r=db.transaction('kv','readonly').objectStore('kv').get('queue');r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});}
async function qput(value){const db=await qdb();return new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(value,'queue');tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);});}
async function loadQueue(){
  let value=[];const raw=localValue(QUEUE_KEY);
  try{
    if(raw){const parsed=JSON.parse(raw);if(Array.isArray(parsed))value=parsed;else if(parsed&&parsed.idb)value=await qget();}
    else value=await qget();
  }catch(_){value=[];}
  C.queue=Array.isArray(value)?value:[];C.queueReady=true;render();emitState();return C.queue;
}
async function saveQueue(){
  const raw=JSON.stringify(C.queue),small=raw.length<1200000;
  if(small&&putLocal(QUEUE_KEY,raw)){try{await qput(C.queue);}catch(_){ }return;}
  try{await qput(C.queue);putLocal(QUEUE_KEY,JSON.stringify({idb:true,count:C.queue.length}));}
  catch(error){console.warn('fila colaborativa',error);}
}
async function enqueueLayer(layer,payload,reason){
  const resourceId=ensureLayerId(layer),item={id:makeId('queue-'),token:makeId('queue-version-'),roomId:C.roomId,kind:'layer.replace',
    createdAt:nowISO(),attempts:0,data:{resourceId,layerId:layer.id,payload,
      baseRevision:C.revisions.get(resourceId)??0,metadata:publishMetadata(layer)}};
  const old=C.queue.findIndex(x=>x.roomId===item.roomId&&x.kind===item.kind&&x.data&&x.data.resourceId===resourceId);
  if(old>=0){item.createdAt=C.queue[old].createdAt;C.queue.splice(old,1,item);}else C.queue.push(item);
  await saveQueue();C.status='offline';C.error=reason||'Sem conexão';addLocalHistory('Alteração na fila',layer.name||resourceId,'pending');render();emitState();
  return {queued:true,id:item.id};
}
async function flushQueueOnce(){
  await queueReady();if(!C.roomId||!C.online)return {sent:0,remaining:C.queue.length};
  if(viewerRole())return {sent:0,remaining:C.queue.length,forbidden:true};
  let p;try{p=await provider();}catch(_){return {sent:0,remaining:C.queue.length};}
  let sent=0;
  for(const item of C.queue.slice()){
    if(item.roomId!==C.roomId||item.kind!=='layer.replace')continue;
    const data=item.data||{},layer=layerByResource(data.resourceId),sentSignature=data.payload?signatureOf(data.payload):'';
    try{
      if(layer&&!await acquireLayer(layer,true))continue;
      const result=await p.publishLayerReplace(C.roomId,data);
      if(result&&result.revision!=null)C.revisions.set(data.resourceId,result.revision);
      if(result&&result.seq)C.lastSeq=Math.max(C.lastSeq,+result.seq||0);
      /* Uma edição nova pode substituir este item durante o upload. Remova
         somente a versão exata enviada e grave a assinatura do payload, não
         a da camada que já pode ter mudado novamente. */
      const queuedNow=C.queue.find(x=>x.id===item.id);
      if(queuedNow&&String(queuedNow.token||'')===String(item.token||''))C.queue=C.queue.filter(x=>x!==queuedNow);
      else{
        const replacement=C.queue.find(x=>x.roomId===item.roomId&&x.kind===item.kind&&x.data&&x.data.resourceId===data.resourceId);
        if(replacement&&replacement.data&&result&&result.revision!=null)replacement.data.baseRevision=result.revision;
      }
      sent++;
      if(layer){layer._collabKnown=true;C.signatures.set(data.resourceId,sentSignature||signatureOf(layer));}
    }catch(error){
      item.attempts=(item.attempts||0)+1;item.lastError=errorText(error);
      if(isConflict(error)){C.status='conflict';C.error=errorText(error);break;}
      if(isOfflineError(error)){C.online=false;C.status='offline';break;}
    }
  }
  await saveQueue();if(sent){C.lastSync=nowISO();addLocalHistory('Fila enviada',sent+' alteração(ões)','ok');}
  if(C.online&&C.status!=='conflict'){C.status='connected';C.error='';}render();emitState();return {sent,remaining:C.queue.length};
}
function flushQueue(){
  if(flushPromise)return flushPromise;
  flushPromise=flushQueueOnce().then(result=>{
    if(result&&result.sent>0&&result.remaining>0&&C.online&&C.status!=='conflict')setTimeout(()=>flushQueue().catch(()=>{}),0);
    return result;
  }).finally(()=>{flushPromise=null;});
  return flushPromise;
}
async function rebaseQueuedChanges(){
  const mine=C.queue.filter(item=>item.roomId===C.roomId&&item.kind==='layer.replace');
  mine.forEach(item=>{
    const resourceId=item.data&&item.data.resourceId;
    if(item.data)item.data.baseRevision=C.revisions.get(resourceId)??0;
    item.token=makeId('queue-version-');
  });
  await saveQueue();C.status=C.online?'connected':'offline';C.error='';
  return flushQueue();
}
async function discardQueuedChanges(){
  const discarded=C.queue.filter(item=>item.roomId===C.roomId&&item.kind==='layer.replace');
  C.queue=C.queue.filter(item=>!(item.roomId===C.roomId&&item.kind==='layer.replace'));
  discarded.forEach(item=>{
    const layer=layerByResource(item.data&&item.data.resourceId);
    if(layer)C.signatures.set(ensureLayerId(layer),signatureOf(layer));
  });
  await saveQueue();C.status=C.online?'connected':'offline';C.error='';render();emitState();
  return {discarded:discarded.length};
}
function queueReady(){return C.queueReady?Promise.resolve(C.queue):loadQueue();}

async function enterRoom(p,room,options){
  options=options||{};C.room=room;C.roomId=room.id;C.role=room.role||room.myRole||options.role||null;
  C.baseRevision=room.baseRevision??room.revision??options.baseRevision??null;
  C.lastSeq=Math.max(+room.snapshotSeq||0,+room.baseSeq||0,+options.lastSeq||0);
  C.replayTargetSeq=Math.max(C.lastSeq,+room.nextSeq||0,+options.nextSeq||0);
  C.status=!C.online?'offline':C.lastSeq<C.replayTargetSeq?'syncing':'connected';C.error='';putLocal(LAST_ROOM_KEY,C.roomId);
  baselineLayers(true);connectWatchers(p,room);persistSessionMeta();render();emitState();
  if(C.online&&C.lastSeq>=C.replayTargetSeq)flushQueue().catch(error=>console.warn('fila inicial',error));
  return room;
}
async function create(input){
  const options=typeof input==='string'?{name:input}:Object.assign({},input||{}),name=String(options.name||C.form.name||'Projeto compartilhado').trim();
  setStatus('connecting');
  try{
    const p=await provider(),baseSnapshot=options.baseSnapshot||captureSnapshot();
    const result=await p.createRoom({name,baseSnapshot}),room=normalizeRoom(result);
    if(result&&result.requiresSnapshotUpload&&typeof p.uploadSnapshot==='function')await p.uploadSnapshot(room.id,baseSnapshot);
    await enterRoom(p,room,{baseRevision:result&&result.baseRevision,lastSeq:result&&result.lastSeq});
    addLocalHistory('Sala criada',room.name||name,'ok');notifyToast('Sala de colaboração criada: '+(room.code||room.id));return room;
  }catch(error){setStatus('error',error);notifyToast('Não foi possível criar a sala: '+errorText(error));throw error;}
}
async function join(input,joinOptions){
  const options=typeof input==='object'?Object.assign({},input,joinOptions||{}):Object.assign({id:input},joinOptions||{});
  const id=String(options.id||options.roomId||options.code||C.form.joinId||'').trim();
  if(!id)throw new Error('Informe o código da sala.');setStatus('connecting');
  try{
    const p=await provider(),result=await p.joinRoom(id),room=normalizeRoom(result,id);
    let snapshot=result&&(result.baseSnapshot||result.snapshot)||room.baseSnapshot||null;
    if(options.loadSnapshot!==false&&!snapshot&&typeof p.downloadSnapshot==='function')snapshot=await p.downloadSnapshot(room.id);
    if(snapshot&&snapshot.snapshot)snapshot=snapshot.snapshot;
    if(options.loadSnapshot!==false&&snapshot)applyInitialSnapshot(snapshot);
    await enterRoom(p,room,{baseRevision:result&&result.baseRevision,lastSeq:result&&result.lastSeq});
    addLocalHistory('Entrou na sala',room.name||room.id,'ok');notifyToast('Projeto colaborativo conectado.');return room;
  }catch(error){setStatus('error',error);notifyToast('Não foi possível entrar na sala: '+errorText(error));throw error;}
}
function resetRoomState(status,error){
  const roomId=C.roomId;if(roomId)C.form.joinId=roomId;
  ensureAllLayerIds().forEach(layer=>applyEffectiveLock(layer,null));
  C.room=null;C.roomId=null;C.role=null;C.presence=[];C.members=[];C.history=[];
  C.locks.clear();C.revisions.clear();C.activeResourceId=null;C.baseRevision=null;
  C.lastSeq=0;C.replayTargetSeq=0;C.status=status||'idle';C.error=error||'';
  C.timers.forEach(clearTimeout);C.timers.clear();C.pendingSignatures.clear();C.monitorAcquiring.clear();
  C.signatures.clear();persistSessionMeta();render();emitState();
}
function prepareProjectReplacement(){
  if(C.applyingRemote||!C.roomId)return false;
  const roomId=C.roomId,p=C.provider,owned=[...C.locks].filter(([,lock])=>ownLock(lock));
  detachWatchers();
  /* A abertura do arquivo é síncrona. Liberações são best-effort e não podem
     deixar o novo projeto ligado à sala antiga enquanto aguardam a rede. */
  if(p){
    owned.forEach(([resourceId])=>{
      if(typeof p.releaseLock==='function')Promise.resolve(p.releaseLock(roomId,resourceId,{clientId:C.clientId,deviceId:C.clientId})).catch(()=>{});
    });
    if(typeof p.leaveRoom==='function')Promise.resolve(p.leaveRoom(roomId)).catch(()=>{});
  }
  resetRoomState('idle','');
  notifyToast('A colaboração foi desconectada antes de substituir o projeto.');
  return true;
}
async function leave(options){
  options=options||{};const roomId=C.roomId,p=C.provider;
  if(!roomId)return true;
  if(options.sync!==false&&C.online){try{const layer=activeLayerSafe();if(layer&&signatureOf(layer)!==C.signatures.get(ensureLayerId(layer)))await publishLayer(layer,{automatic:true});}catch(_){ }}
  for(const [resourceId,lock] of [...C.locks])if(ownLock(lock)){
    const layer=layerByResource(resourceId);try{await releaseLayer(layer,true);}catch(_){ }
  }
  detachWatchers();
  try{if(p&&typeof p.leaveRoom==='function')await p.leaveRoom(roomId);}catch(error){console.warn('sair da sala',error);}
  resetRoomState('idle','');
  if(!options.quiet)notifyToast('Você saiu da sala; o projeto local permanece aberto.');return true;
}
async function acquireActiveLayer(){const layer=activeLayerSafe();if(!layer){notifyToast('Selecione uma camada vetorial.');return false;}return acquireLayer(layer,false);}
async function releaseActiveLayer(){const layer=activeLayerSafe();if(!layer)return false;return releaseLayer(layer,false);}
function viewerRole(){return /^(viewer|reader|leitor|visualizador)$/i.test(String(C.role||C.room&&C.room.role||''));}
function canEditLayer(layer){
  if(viewerRole())return false;
  if(!C.roomId||!C.online)return true;
  if(C.lastSeq<C.replayTargetSeq)return false;
  if(!layer)return false;
  const lock=layer._collabLock||C.locks.get(String(layer._collabId||''));
  return !!lock&&!(lock.remote===true||!ownLock(lock.raw||lock));
}
function lockMessage(layer){
  if(viewerRole())return 'Seu acesso a esta sala é somente para visualização.';
  if(!C.roomId||!C.online||!layer)return '';
  if(C.lastSeq<C.replayTargetSeq)return 'Aguarde a atualização inicial da sala terminar.';
  const lock=layer._collabLock||C.locks.get(String(layer._collabId||''));
  if(!lock)return 'Aguardando a reserva da camada. Aguarde um instante ou use "Reservar" na Colaboração.';
  const remote=lock.remote===true||!ownLock(lock.raw||lock);
  return remote?'A camada "'+(layer.name||'selecionada')+'" está sendo editada por '+(lock.ownerName||lock.displayName||lock.email||'outro colaborador')+'.':'';
}
async function inviteMember(email,role){
  email=String(email||C.form.inviteEmail||'').trim();role=String(role||C.form.inviteRole||'editor');
  if(!C.roomId)throw new Error('Entre numa sala antes de convidar pessoas.');
  if(!/^\S+@\S+\.\S+$/.test(email))throw new Error('Informe um e-mail válido.');
  const p=await provider();
  if(typeof p.inviteMember!=='function')throw new Error('Convites ainda não estão habilitados neste servidor. Compartilhe o código da sala.');
  const result=await p.inviteMember(C.roomId,email,role);C.form.inviteEmail='';
  addLocalHistory('Convite criado',email+' · '+role,'ok');notifyToast('Convite criado para '+email+'. Envie também o código da sala.');renderPeople();return result;
}

function roomLabel(){return C.room&&(C.room.code||C.room.name||C.room.title)||C.roomId||'';}
/* "Offline" só quando o navegador está sem rede. Uma falha momentânea do
   servidor (timeout, indisponível) marcava offline para sempre: o evento
   "online" do navegador nunca chega se a internet não caiu. */
const semRede=()=>typeof navigator!=='undefined'&&navigator.onLine===false;
function stateLabel(){
  if(!C.online)return semRede()?'Offline':'Reconectando…';
  return {idle:'Não conectado',connecting:'Conectando…',connected:'Sincronizado',syncing:'Sincronizando…',offline:'Offline',conflict:'Conflito protegido',error:'Atenção'}[C.status]||C.status;
}
function ensureUI(){
  if(typeof document==='undefined'||!document.body)return null;
  let badge=document.getElementById('gmCollabBadge');
  if(!badge){
    badge=document.createElement('button');badge.id='gmCollabBadge';badge.className='gmcl-badge';badge.type='button';badge.title='Abrir colaboração';
    badge.innerHTML='<span class="gmcl-dot"></span><span class="gmcl-badge-text">Colaboração</span><span class="gmcl-queue-badge" hidden></span>';
    badge.onclick=open;document.body.appendChild(badge);
  }
  let shell=document.getElementById('gmCollabShell');
  if(!shell){
    shell=document.createElement('div');shell.id='gmCollabShell';shell.className='gmcl-shell';shell.hidden=true;
    shell.innerHTML=`<button class="gmcl-shade" data-action="close" aria-label="Fechar colaboração"></button>
      <aside class="gmcl-drawer" role="dialog" aria-modal="true" aria-label="Colaboração do projeto">
        <header class="gmcl-head"><div class="gmcl-head-icon" aria-hidden="true">⇄</div><div><h2>Colaboração</h2><p>Edite o mesmo projeto com sua equipe</p></div><button class="gmcl-close" data-action="close" aria-label="Fechar">×</button></header>
        <nav class="gmcl-tabs" aria-label="Seções"><button data-tab="room" class="on">Sala</button><button data-tab="people">Pessoas <span data-count="people">0</span></button><button data-tab="history">Histórico</button></nav>
        <div class="gmcl-panels"><section class="gmcl-panel on" data-panel="room"></section><section class="gmcl-panel" data-panel="people"></section><section class="gmcl-panel" data-panel="history"></section></div>
      </aside>`;
    shell.addEventListener('click',handleClick);shell.addEventListener('input',handleInput);shell.addEventListener('change',handleInput);document.body.appendChild(shell);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&C.drawerOpen)close();});
  }
  return shell;
}
function render(){
  const shell=ensureUI();if(!shell)return;
  const badge=document.getElementById('gmCollabBadge'),text=badge&&badge.querySelector('.gmcl-badge-text'),qb=badge&&badge.querySelector('.gmcl-queue-badge');
  if(badge){badge.dataset.status=!C.online?(semRede()?'offline':'connecting'):C.status;badge.classList.toggle('connected',!!C.roomId);}
  if(text)text.textContent=C.roomId?(roomLabel()||'Sala ativa'):'Colaboração';
  if(qb){qb.hidden=!C.queue.length;qb.textContent=String(C.queue.length);}
  shell.hidden=!C.drawerOpen;shell.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('on',b.dataset.tab===C.tab));
  shell.querySelectorAll('[data-panel]').forEach(p=>p.classList.toggle('on',p.dataset.panel===C.tab));
  renderRoom();renderPeople();renderHistory();
}
function renderRoom(){
  const panel=document.querySelector('#gmCollabShell [data-panel="room"]');if(!panel)return;
  const providerAvailable=!!(injectedProvider||(typeof window!=='undefined'&&window.GeoMineCloudProvider));
  const active=activeLayerSafe(),resourceId=active&&ensureLayerId(active),lock=resourceId&&C.locks.get(resourceId),owned=ownLock(lock);
  const statusClass=!C.online?(semRede()?'offline':'connecting'):C.status;
  if(!C.roomId){
    panel.innerHTML=`<div class="gmcl-status ${statusClass}"><span></span><div><b>${html(stateLabel())}</b><small>${providerAvailable?'Conta pronta para compartilhar o projeto.':'Abra o GeoMine Web e faça login para usar salas.'}</small></div></div>
      ${C.error?`<div class="gmcl-alert">${html(C.error)}</div>`:''}
      <div class="gmcl-card"><h3>Criar uma sala</h3><p>A fotografia atual vira a base. Depois, cada camada vetorial é sincronizada separadamente.</p><label>Nome da sala<input data-field="name" maxlength="80" value="${html(C.form.name)}" placeholder="Ex.: Mapeamento Serra Norte"></label><button class="gmcl-primary" data-action="create" ${providerAvailable?'':'disabled'}>Criar e compartilhar</button></div>
      <div class="gmcl-divider"><span>ou</span></div>
      <div class="gmcl-card"><h3>Entrar numa sala</h3><label>Código ou identificador<input data-field="joinId" value="${html(C.form.joinId)}" placeholder="Cole o código recebido"></label><button class="gmcl-secondary" data-action="join" ${providerAvailable?'':'disabled'}>Entrar no projeto</button><small class="gmcl-warning">Ao entrar, a fotografia compartilhada substitui o projeto aberto nesta tela. Salve seu arquivo antes de entrar; o salvamento local é manual.</small></div>`;
    return;
  }
  const owner=lock&&!owned?(lock.ownerName||lock.holderName||lock.email||'Outro colaborador'):'';
  panel.innerHTML=`<div class="gmcl-status ${statusClass}"><span></span><div><b>${html(stateLabel())}</b><small>${C.lastSync?'Atualizado em '+html(asTime(C.lastSync)):'Sala pronta para trabalhar'}</small></div>${C.queue.length?`<em>${C.queue.length} pendente(s)</em>`:''}</div>
    ${C.error?`<div class="gmcl-alert">${html(C.error)}</div>`:''}
    <div class="gmcl-room-card"><div><small>SALA ATIVA</small><strong>${html(C.room.name||C.room.title||'Projeto compartilhado')}</strong><code>${html(C.room.code||C.roomId)}</code></div><button data-action="copy" title="Copiar código">Copiar</button></div>
    <div class="gmcl-card gmcl-layer-card"><div class="gmcl-card-title"><div><h3>Camada ativa</h3><p>${active?html(active.name):'Selecione uma camada vetorial na árvore.'}</p></div>${active?`<span class="gmcl-lock ${!lock?'free':owned?'mine':'other'}">${!lock?'Livre':owned?'Reservada por você':'Com '+html(owner)}</span>`:''}</div>
      ${active?`<div class="gmcl-actions">${owned?'<button data-action="release">🔓 Liberar</button>':'<button data-action="acquire" '+(lock?'disabled':'')+'>🔒 Reservar</button>'}<button class="gmcl-primary" data-action="sync" ${lock&&!owned?'disabled':''}>⇅ Sincronizar agora</button></div>`:''}
      <label class="gmcl-toggle"><input type="checkbox" data-field="autoSync" ${C.autoSync?'checked':''}><span></span><div><b>Sincronização automática</b><small>Envia a camada ativa alguns instantes depois de cada alteração.</small></div></label></div>
    <div class="gmcl-card gmcl-queue"><div class="gmcl-card-title"><div><h3>Fila offline</h3><p>${C.queue.length?C.queue.length+' alteração(ões) guardada(s) neste computador.':'Nenhuma alteração pendente.'}</p></div>${C.queue.length&&C.status!=='conflict'?'<button data-action="flush" '+(!C.online?'disabled':'')+'>Enviar</button>':''}</div>${C.queue.length&&C.status==='conflict'?'<div class="gmcl-actions"><button class="gmcl-primary" data-action="rebase" '+(!C.online?'disabled':'')+'>Publicar minha versão</button><button data-action="discard-queue">Cancelar envio pendente</button></div>':''}</div>
    <button class="gmcl-leave" data-action="leave">Sair da sala</button>`;
}
function renderPeople(){
  const panel=typeof document!=='undefined'&&document.querySelector('#gmCollabShell [data-panel="people"]');if(!panel)return;
  const count=document.querySelector('#gmCollabShell [data-count="people"]');if(count)count.textContent=String(C.presence.length);
  if(!C.roomId){panel.innerHTML='<div class="gmcl-empty"><b>Nenhuma sala ativa</b><span>Entre numa sala para ver quem está trabalhando.</span></div>';return;}
  const providerNow=C.provider||injectedProvider||(typeof window!=='undefined'&&window.GeoMineCloudProvider),canInvite=!!(providerNow&&typeof providerNow.inviteMember==='function');
  const onlineById=new Map();C.presence.forEach(person=>{
    const key=String(person.uid||person.userId||person.id||person.email||'');if(key)onlineById.set(key,person);
  });
  const users=(C.members.length?C.members:C.presence).map(member=>{
    const key=String(member.uid||member.userId||member.id||member.email||''),live=onlineById.get(key);
    return Object.assign({},member,live||{}, {online:!!live||member.online===true});
  });
  C.presence.forEach(person=>{
    const key=String(person.uid||person.userId||person.id||person.email||'');
    if(!users.some(member=>String(member.uid||member.userId||member.id||member.email||'')===key))users.push(person);
  });
  if(!users.length)users.push(Object.assign({online:true},C.user||{name:'Você'}));
  panel.innerHTML='<div class="gmcl-list-title"><b>'+users.length+' pessoa(s)</b><span>Membros da sala e presença em tempo real</span></div><div class="gmcl-people">'+users.map(person=>{
    const name=person.displayName||person.name||person.email||'Colaborador',initials=String(name).split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
    const online=person.online!==false&&!person.leftAt;
    const role=person.role||person.permission||'';
    return `<article><span class="gmcl-avatar">${html(initials||'?')}</span><div><b>${html(name)}${String(person.uid||person.id||'')===currentUserId()?' (você)':''}</b><small>${html(person.activeLayerName||person.activity|| (online?'No projeto':'Ausente'))}${role?' · '+html(role):''}</small></div><i class="${online?'on':''}" title="${online?'Online':'Ausente'}"></i></article>`;
  }).join('')+'</div><div class="gmcl-invite"><h3>Convidar pessoa</h3><div><input type="email" data-field="inviteEmail" value="'+html(C.form.inviteEmail)+'" placeholder="nome@empresa.com"><select data-field="inviteRole"><option value="editor" '+(C.form.inviteRole==='editor'?'selected':'')+'>Pode editar</option><option value="viewer" '+(C.form.inviteRole==='viewer'?'selected':'')+'>Somente visualizar</option></select><button data-action="invite" '+(canInvite?'':'disabled')+'>Criar convite</button></div><small>'+(canInvite?'O acesso fica vinculado à conta informada; envie também o código da sala.':'Convites não estão habilitados neste servidor. Por enquanto, copie e envie o código da sala.')+'</small></div>';
}
function renderHistory(){
  const panel=typeof document!=='undefined'&&document.querySelector('#gmCollabShell [data-panel="history"]');if(!panel)return;
  const items=mergedHistory();
  if(!C.roomId&&!items.length){panel.innerHTML='<div class="gmcl-empty"><b>Histórico da sala</b><span>As sincronizações aparecerão aqui.</span></div>';return;}
  panel.innerHTML='<div class="gmcl-list-title"><b>Atividade recente</b><span>Use Salvar para gravar sua versão local.</span></div><div class="gmcl-history">'+(items.map(item=>{
    const action=item.action||item.type||item.title||'Alteração',detail=item.detail||item.layerName||item.metadata&&item.metadata.name||'',user=item.userName||item.authorName||item.email||'';
    return `<article class="${html(item.tone||'')}"><span></span><div><b>${html(action)}</b><p>${html(detail)}${user?' · '+html(user):''}</p><small>${html(asTime(item.at||item.createdAt||item.timestamp))}</small></div></article>`;
  }).join('')||'<div class="gmcl-empty"><span>Ainda não há alterações.</span></div>')+'</div>';
}
async function handleClick(event){
  const tab=event.target.closest('[data-tab]');if(tab){C.tab=tab.dataset.tab;render();return;}
  const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;
  if(action==='close'){close();return;}
  button.disabled=true;
  try{
    if(action==='create')await create({name:C.form.name});
    else if(action==='join'){
      const hasProject=!!(appState()&&((appState().layers||[]).length||(appState().rasters||[]).length||appState().img));
      if(hasProject&&typeof confirm==='function'&&!confirm('Entrar na sala substituirá o projeto aberto nesta tela. Salve as alterações com Salvar antes de continuar. Continuar sem salvar?'))return;
      await join(C.form.joinId);
    }else if(action==='leave'){
      if(typeof confirm!=='function'||confirm('Sair da sala? O projeto continuará aberto nesta tela. Use Salvar para gravar o arquivo local.'))await leave();
    }else if(action==='sync')await syncActiveLayer();
    else if(action==='acquire')await acquireActiveLayer();
    else if(action==='release')await releaseActiveLayer();
    else if(action==='flush')await flushQueue();
    else if(action==='rebase'){
      if(typeof confirm!=='function'||confirm('Publicar sua versão por cima da revisão atual? A revisão recebida foi preservada numa camada de conflito.'))await rebaseQueuedChanges();
    }
    else if(action==='discard-queue'){
      if(typeof confirm!=='function'||confirm('Cancelar os envios pendentes desta sala? As camadas locais continuarão abertas neste computador.'))await discardQueuedChanges();
    }
    else if(action==='invite')await inviteMember();
    else if(action==='copy'){
      const value=C.room&&C.room.code||C.roomId;
      try{await navigator.clipboard.writeText(value);notifyToast('Código da sala copiado.');}
      catch(_){if(typeof prompt==='function')prompt('Copie o código da sala:',value);}
    }
  }catch(error){console.error('GeoMine colaboração',error);}finally{button.disabled=false;render();}
}
function handleInput(event){
  const field=event.target&&event.target.dataset&&event.target.dataset.field;if(!field)return;
  if(field==='autoSync'){C.autoSync=!!event.target.checked;if(C.autoSync)monitorLayers();emitState();}
  else C.form[field]=event.target.value;
}
function open(tab){if(['room','people','history'].includes(tab))C.tab=tab;C.drawerOpen=true;ensureUI();render();provider().then(()=>render()).catch(()=>render());return true;}
function close(){C.drawerOpen=false;render();return true;}
function setProvider(value){injectedProvider=value||null;C.provider=value||null;provider().then(()=>render()).catch(()=>render());return api;}
function status(){return publicState();}

function boot(){
  ensureUI();queueReady().catch(error=>console.warn('fila colaborativa',error));
  if(!monitorTimer)monitorTimer=setInterval(monitorLayers,WATCH_MS);
  if(!renewTimer)renewTimer=setInterval(renewLocks,RENEW_MS);
  if(typeof window!=='undefined'){
    const marcaOnline=()=>{C.online=true;if(C.roomId)C.status=C.lastSeq<C.replayTargetSeq?'syncing':'connected';else if(C.status==='offline')C.status='idle';render();emitState();if(C.lastSeq>=C.replayTargetSeq)flushQueue().catch(()=>{});};
    window.addEventListener('online',marcaOnline);
    /* com a rede do navegador ativa, volta a tentar: se o servidor ainda falhar,
       a próxima operação marca de novo e esta checagem tenta outra vez */
    const tentaVoltar=()=>{if(!C.online&&!semRede())marcaOnline();};
    setInterval(tentaVoltar,20000);
    window.addEventListener('focus',tentaVoltar);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)tentaVoltar();});
    window.addEventListener('offline',()=>{C.online=false;if(C.roomId)C.status='offline';render();emitState();});
    ['geomine:cloud-provider-ready','geomine-cloud-ready'].forEach(name=>window.addEventListener(name,()=>provider().then(()=>render()).catch(()=>render())));
    window.addEventListener('geomine:cloud-disconnected',()=>{
      detachWatchers();C.provider=null;C.user=null;resetRoomState('idle','');
    });
    window.addEventListener('beforeunload',()=>{try{if(C.provider&&typeof C.provider.stopHeartbeat==='function')C.provider.stopHeartbeat();}catch(_){ }});
  }
  baselineLayers(undefined);render();
}

const api={
  version:VERSION,open,close,create,join,leave,syncActiveLayer,
  acquireActiveLayer,releaseActiveLayer,flushQueue,inviteMember,canEditLayer,lockMessage,snapshot:publicState,status,
  setProvider,captureProjectSnapshot:captureSnapshot,applyInitialSnapshot,prepareProjectReplacement,
  /* Expostos para validação automatizada e provedores, não para a UI. */
  _serializeLayer:serializeLayer,_applyLayerOperation:operation=>provider().then(p=>applyLayerOperation(p,operation)),
  _state:C
};
if(typeof window!=='undefined')window.GeoMineCollaboration=api;
if(typeof document!=='undefined'){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
}
})();
