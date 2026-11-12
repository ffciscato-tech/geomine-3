import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const modulePath=path.join(root,'src/modules/collaboration/cloud-collaboration.js');
assert.ok(fs.existsSync(modulePath),
  'módulo ausente: src/modules/collaboration/cloud-collaboration.js');
const source=fs.readFileSync(modulePath,'utf8');
const clone=value=>value==null?value:structuredClone(value);
const plain=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setImmediate(resolve));

class MemoryBackend{
  constructor(){
    this.rooms=new Map();
    this.roomWatchers=new Map();
    this.memberWatchers=new Map();
    this.presenceWatchers=new Map();
    this.lockWatchers=new Map();
    this.operationWatchers=new Map();
    this.historyWatchers=new Map();
    this.nextRoom=1;
    this.publishCalls=0;
  }
  watchers(map,id){
    if(!map.has(id))map.set(id,new Set());
    return map.get(id);
  }
  emit(map,id,value){
    for(const cb of this.watchers(map,id))cb(clone(value),[]);
  }
  descriptor(room,uid){
    return {...clone(room.meta),id:room.id,roomId:room.id,myRole:room.members.get(uid)||null};
  }
  provider(user,joinRole='editor'){
    const backend=this;
    let online=true;
    let currentRoom=null;
    const subscriptions=[];
    const on=(map,id,cb,value)=>{
      const set=backend.watchers(map,id);set.add(cb);subscriptions.push(()=>set.delete(cb));
      cb(clone(value),[]);return()=>set.delete(cb);
    };
    const room=id=>{
      const found=backend.rooms.get(id);
      if(!found)throw new Error('room/not-found');
      return found;
    };
    const lockList=r=>[...r.locks.values()].map(lock=>({...clone(lock),active:true}));
    const presenceList=r=>[...r.presence.values()].map(p=>({...clone(p),online:true}));
    const provider={
      ready:true,user:clone(user),
      setOnline(value){online=!!value;provider.ready=online;},
      async createRoom({name,baseSnapshot}){
        if(!online)throw new Error('network/offline');
        const id='sala-'+backend.nextRoom++;
        const r={id,meta:{name:name||'Projeto colaborativo',createdBy:user.uid,nextSeq:0},
          snapshot:clone(baseSnapshot),members:new Map([[user.uid,'owner']]),presence:new Map(),
          locks:new Map(),operations:[],payloads:new Map(),revision:new Map()};
        backend.rooms.set(id,r);currentRoom=id;
        return {...backend.descriptor(r,user.uid),snapshot:clone(r.snapshot)};
      },
      async listRooms(){
        return [...backend.rooms.values()]
          .filter(r=>r.members.has(user.uid)).map(r=>backend.descriptor(r,user.uid));
      },
      async getRoom(id){return backend.descriptor(room(id),user.uid);},
      async joinRoom(id){
        if(!online)throw new Error('network/offline');
        const r=room(id);if(!r.members.has(user.uid))r.members.set(user.uid,joinRole);
        currentRoom=id;return {...backend.descriptor(r,user.uid),snapshot:clone(r.snapshot)};
      },
      async leaveRoom(id){
        const r=room(id);r.presence.delete(user.uid);currentRoom=null;
        backend.emit(backend.presenceWatchers,id,presenceList(r));
      },
      async listMembers(id){
        return [...room(id).members].map(([uid,role])=>({uid,role}));
      },
      watchMembers(id,cb){
        return on(backend.memberWatchers,id,cb,[...room(id).members].map(([uid,role])=>({uid,role})));
      },
      async addMember(id,email,role='editor'){return {email,role};},
      async setMemberRole(id,uid,role){const r=room(id);r.members.set(uid,role);backend.emit(backend.memberWatchers,id,[...r.members].map(([id,papel])=>({uid:id,role:papel})));},
      async removeMember(id,uid){const r=room(id);r.members.delete(uid);backend.emit(backend.memberWatchers,id,[...r.members].map(([id,papel])=>({uid:id,role:papel})));},
      async rotateJoinCode(){return 'codigo-novo';},
      watchRoom(id,cb){return on(backend.roomWatchers,id,cb,backend.descriptor(room(id),user.uid));},
      async heartbeat(id){
        const r=room(id),p={uid:user.uid,email:user.email,displayName:user.displayName||user.email,
          online:true,updatedAtMs:Date.now()};
        r.presence.set(user.uid,p);backend.emit(backend.presenceWatchers,id,presenceList(r));return clone(p);
      },
      startHeartbeat(id){return provider.heartbeat(id);},
      stopHeartbeat(){},
      watchPresence(id,cb){return on(backend.presenceWatchers,id,cb,presenceList(room(id)));},
      async acquireLock(id,resourceId,{ttlMs=120000,clientId,deviceId}={}){
        const r=room(id),existing=r.locks.get(resourceId),device=clientId||deviceId||'provider-device';
        if(existing&&(existing.holderUid!==user.uid||existing.holderDeviceId!==device)){
          const error=new Error('lock/held');error.code='lock/held';error.lock=clone(existing);throw error;
        }
        const lock={resourceId,resourceKey:resourceId,label:resourceId,holderUid:user.uid,
          holderEmail:user.email,holderName:user.displayName||user.email,
          holderDeviceId:device,deviceId:device,
          acquiredAt:Date.now(),updatedAt:Date.now(),expiresAtMs:Date.now()+ttlMs,active:true};
        r.locks.set(resourceId,lock);backend.emit(backend.lockWatchers,id,lockList(r));return clone(lock);
      },
      async renewLock(id,resourceId,{ttlMs=120000,clientId,deviceId}={}){
        const r=room(id),lock=r.locks.get(resourceId),device=clientId||deviceId||'provider-device';
        if(!lock||lock.holderUid!==user.uid||lock.holderDeviceId!==device)throw new Error('lock/not-owner');
        lock.updatedAt=Date.now();lock.expiresAtMs=Date.now()+ttlMs;
        backend.emit(backend.lockWatchers,id,lockList(r));return clone(lock);
      },
      async releaseLock(id,resourceId,{clientId,deviceId}={}){
        const r=room(id),lock=r.locks.get(resourceId),device=clientId||deviceId||'provider-device';
        if(lock&&lock.holderUid===user.uid&&lock.holderDeviceId===device)r.locks.delete(resourceId);
        backend.emit(backend.lockWatchers,id,lockList(r));
      },
      watchLocks(id,cb){return on(backend.lockWatchers,id,cb,lockList(room(id)));},
      async uploadSnapshot(id,snapshot){room(id).snapshot=clone(snapshot);return {path:`rooms/${id}/snapshots/base.json`};},
      async downloadSnapshot(id){return clone(room(id).snapshot);},
      async uploadPayload(id,resourceId,payload){
        const key=`rooms/${id}/payloads/${resourceId}/${Date.now()}.json`;
        room(id).payloads.set(key,clone(payload));return {path:key,ref:key};
      },
      async downloadPayload(id,ref){
        const key=typeof ref==='string'?ref:ref?.path||ref?.ref;
        return clone(room(id).payloads.get(key));
      },
      async publishLayerReplace(id,args){
        backend.publishCalls++;
        if(!online){const error=new Error('network/offline');error.code='network/offline';throw error;}
        const r=room(id),held=r.locks.get(args.resourceId);
        if(!held||held.holderUid!==user.uid||held.holderDeviceId!==(args.metadata&&args.metadata.clientId)){
          const error=new Error('lock/required');error.code='lock/required';throw error;
        }
        const seq=r.operations.length+1;
        r.meta.nextSeq=seq;
        const revision=(r.revision.get(args.resourceId)||0)+1;r.revision.set(args.resourceId,revision);
        const op={id:'op-'+seq,type:'layer.replace',seq,revision,resourceId:args.resourceId,
          resourceKey:args.resourceId,layerId:args.layerId,payload:clone(args.payload),
          baseRevision:args.baseRevision??revision-1,
          metadata:{...(args.metadata||{}),authorId:user.uid}};
        r.operations.push(op);
        backend.emit(backend.roomWatchers,id,backend.descriptor(r,user.uid));
        backend.emit(backend.operationWatchers,id,[op]);
        backend.emit(backend.historyWatchers,id,r.operations.slice().reverse());
        return clone(op);
      },
      watchOperations(id,cb,{afterSeq=0}={}){
        return on(backend.operationWatchers,id,cb,
          room(id).operations.filter(op=>op.seq>afterSeq));
      },
      watchHistory(id,cb){return on(backend.historyWatchers,id,cb,room(id).operations.slice().reverse());},
      dispose(){subscriptions.splice(0).forEach(fn=>fn());currentRoom=null;}
    };
    return provider;
  }
}

function makeElement(tag='div'){
  const listeners=new Map();
  return {
    tagName:String(tag).toUpperCase(),id:'',style:{},dataset:{},value:'',checked:false,
    textContent:'',innerHTML:'',children:[],parentNode:null,
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    appendChild(child){child.parentNode=this;this.children.push(child);return child;},
    remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);},
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},
    removeEventListener(){},dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event);},
    querySelector(){return null;},querySelectorAll(){return[];},setAttribute(){},focus(){},click(){}
  };
}

function makeClient(name,provider,layers){
  const S={layers:clone(layers),groups:[{id:7,name:'Geologia',collapsed:false}],rasters:[],
    img:null,wms:[],stack:['G:7',...layers.map(L=>'L:'+L.id)],activeId:layers[0].id,
    workCRS:'EPSG:31983',projectMeta:{name:'Modelo compartilhado'}};
  const body=makeElement('body'),elements=new Map();
  const document={body,documentElement:{dataset:{}},readyState:'complete',
    createElement:makeElement,getElementById:id=>elements.get(id)||null,
    querySelector:()=>null,querySelectorAll:()=>[],addEventListener:()=>{},removeEventListener:()=>{}};
  let loadCalls=0,refreshes=0;
  const drawCalls=[];
  const localStore=new Map();
  const sandbox={
    console,structuredClone,crypto:webcrypto,Blob,TextEncoder,TextDecoder,URL,
    S,document,navigator:{onLine:true},location:{protocol:'https:',host:'geomine-3.web.app'},
    localStorage:{getItem:k=>localStore.get(k)??null,setItem:(k,v)=>localStore.set(k,String(v)),removeItem:k=>localStore.delete(k)},
    projectData:()=>clone({v:1,name:S.projectMeta.name,workCRS:S.workCRS,projectMeta:S.projectMeta,
      groups:S.groups,layers:S.layers.map(({llayer,...L})=>L),rasters:[],stack:S.stack}),
    loadProject:data=>{loadCalls++;S.layers=clone(data.layers||[]);S.groups=clone(data.groups||[]);
      S.stack=clone(data.stack||[]);S.activeId=S.layers[0]?.id??null;return true;},
    activeLayer:()=>S.layers.find(L=>L.id===S.activeId)||null,
    drawLayer:L=>{drawCalls.push(L.id);L.llayer={client:name};},
    refreshUI:()=>{refreshes++;},propRefresh:()=>{},zApply:()=>{},toast:()=>{},
    esc:s=>String(s),modalOpen:()=>{},modalClose:()=>{},
    setTimeout:(fn)=>{queueMicrotask(fn);return 1;},clearTimeout:()=>{},
    setInterval:()=>1,clearInterval:()=>{},requestAnimationFrame:fn=>{queueMicrotask(fn);return 1;},
    addEventListener:()=>{},removeEventListener:()=>{},
    Event:class{constructor(type){this.type=type;}},
    CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail;}},
    confirm:()=>true,prompt:()=>'',alert:()=>{}
  };
  sandbox.window=sandbox;sandbox.globalThis=sandbox;
  const context=vm.createContext(sandbox);
  vm.runInContext(source,context,{filename:'cloud-collaboration.js'});
  assert.ok(context.GeoMineCollaboration,
    'o módulo deve expor window.GeoMineCollaboration');
  assert.equal(typeof context.GeoMineCollaboration.setProvider,'function',
    'o provider falso deve ser injetável sem recarregar o aplicativo');
  context.GeoMineCollaboration.setProvider(provider);
  return {context,S,api:context.GeoMineCollaboration,provider,drawCalls,
    stats:()=>({loadCalls,refreshes})};
}

const baseLayers=[
  {id:11,name:'Contato principal',gtype:'line',crs:'EPSG:31983',groupId:7,visible:true,
    fields:[{name:'TIPO',type:'C',length:40,decimal:0}],
    features:[{geom:[[0,0],[10,10]],props:{TIPO:'observado'}}],
    sym:{mode:'single',color:'#7c3aed'},lbl:{show:false},llayer:null},
  {id:12,name:'Limite que não pode mudar',gtype:'polygon',crs:'EPSG:31983',groupId:7,visible:true,
    fields:[{name:'NOME',type:'C',length:80,decimal:0}],
    features:[{geom:[[[0,0],[5,0],[5,5],[0,0]]],props:{NOME:'Área B'}}],
    sym:{mode:'single',color:'#3a9246'},lbl:{show:false},llayer:null}
];

const backend=new MemoryBackend();
const ownerProvider=backend.provider({uid:'u-owner',email:'dona@ccmeng.net',displayName:'Dona'});
const owner=makeClient('owner',ownerProvider,baseLayers);

const created=await owner.api.create({name:'Modelo geológico compartilhado'});
const ownerState=owner.api.snapshot();
const roomId=created?.id||created?.roomId||ownerState.roomId;
assert.ok(roomId,'create() deve devolver/conservar o identificador da sala');
assert.equal(ownerState.roomId,roomId,'snapshot() deve informar a sala conectada');
assert.equal(ownerState.role,'owner','quem cria a sala deve entrar como owner');
assert.equal(ownerState.online,true,'a sala recém-criada deve ficar online');
assert.ok(ownerState.presence.some(p=>p.uid==='u-owner'),
  'presença do proprietário deve aparecer no snapshot');

const firstUuid=owner.S.layers[0]._collabId;
assert.equal(typeof firstUuid,'string','a camada deve receber um _collabId serializável');
assert.ok(firstUuid.length>=12,'_collabId não pode ser um índice local curto');
assert.equal(owner.api.snapshot().roomId,roomId,'consultar snapshot não pode recriar a sala');
assert.equal(owner.S.layers[0]._collabId,firstUuid,
  '_collabId deve permanecer estável durante toda a sessão');
const storedBase=backend.rooms.get(roomId).snapshot;
assert.equal(storedBase.layers[0]._collabId,firstUuid,
  'o UUID estável deve fazer parte do snapshot-base compartilhado');
assert.notEqual(storedBase.layers[0]._collabId,storedBase.layers[1]._collabId,
  'duas camadas não podem compartilhar o mesmo UUID');

const editorProvider=backend.provider({uid:'u-editor',email:'editor@ccmeng.net',displayName:'Editor'});
const editor=makeClient('editor',editorProvider,[{...baseLayers[0],id:999,name:'estado local substituível'}]);
await editor.api.join({roomId,loadSnapshot:true});
assert.equal(editor.stats().loadCalls,1,
  'join(loadSnapshot) deve carregar o snapshot-base exatamente uma vez');
assert.equal(editor.api.snapshot().role,'editor','participante convidado deve receber seu papel');
assert.equal(editor.S.layers[0]._collabId,firstUuid,
  'quem entra deve receber o mesmo UUID da camada, não gerar outro');
assert.ok(editor.api.snapshot().presence.some(p=>p.uid==='u-owner'),
  'participante deve enxergar a presença já existente');
assert.ok(editor.api.snapshot().presence.some(p=>p.uid==='u-editor'),
  'participante deve publicar sua própria presença');

await owner.api.acquireActiveLayer();
const locks=owner.api.snapshot().locks;
assert.ok(locks.some(lock=>lock.resourceId===firstUuid&&lock.holderUid==='u-owner'),
  'o bloqueio da camada ativa deve aparecer no estado observado');
let secondLockGranted=false;
try{
  const result=await editor.api.acquireActiveLayer();
  secondLockGranted=!!(result&&result.holderUid==='u-editor');
}catch(error){
  assert.match(String(error?.code||error?.message),/lock|bloque|ocupad|held/i,
    'a recusa do segundo editor deve explicar que a camada está bloqueada');
}
assert.equal(secondLockGranted,false,
  'dois usuários não podem adquirir simultaneamente a mesma camada');

const editorUnrelated=editor.S.layers.find(L=>L._collabId!==firstUuid);
assert.ok(editorUnrelated,'pré-condição: snapshot deve conter uma camada alheia à operação');
const editorUnrelatedRef=editorUnrelated;
const editorUnrelatedBefore=plain(editorUnrelated);
const editorDrawsBefore=editor.drawCalls.length;
const ownerDrawsBefore=owner.drawCalls.length;
owner.S.layers[0].features.push({geom:[[20,20],[30,25]],props:{TIPO:'inferido'}});
await owner.api.syncActiveLayer();
await tick();

assert.deepEqual(plain(editor.S.layers.find(L=>L._collabId===firstUuid).features),
  plain(owner.S.layers[0].features),
  'layer.replace remoto deve atualizar somente a camada que possui o UUID indicado');
assert.equal(editor.S.layers.find(L=>L._collabId!==firstUuid),editorUnrelatedRef,
  'layer.replace não pode substituir o objeto de uma camada alheia');
assert.deepEqual(plain(editorUnrelatedRef),editorUnrelatedBefore,
  'layer.replace não pode alterar dados ou estilo de camadas alheias');
assert.ok(editor.drawCalls.length>editorDrawsBefore,
  'o editor remoto deve redesenhar a camada recebida');
assert.equal(owner.drawCalls.length,ownerDrawsBefore,
  'a operação publicada pelo próprio cliente não pode voltar como eco e redesenhar a camada');
assert.equal(editor.stats().loadCalls,1,
  'uma revisão de camada não pode recarregar/substituir o projeto inteiro');

/* Uma queda de rede não deve apagar a edição: a operação permanece na fila e
   é enviada explicitamente ao reconectar. */
ownerProvider.setOnline(false);
owner.S.layers[0].features[0].props.TIPO='editado offline';
const queued=await owner.api.syncActiveLayer();
assert.equal(queued?.queued,true,'falha de rede deve retornar queued:true');
assert.equal(owner.api.snapshot().queueLength,1,
  'snapshot deve expor a operação pendente para a interface');
ownerProvider.setOnline(true);
/* No navegador o evento `online` faz esta transição. Aqui os timers/eventos
   de janela são deliberadamente inertes para o processo Node poder sair. */
owner.api._state.online=true;
const flushed=await owner.api.flushQueue();
await tick();
assert.equal(flushed.sent,1,'flushQueue deve publicar a edição acumulada');
assert.equal(flushed.remaining,0,'a fila deve esvaziar somente após publicação confirmada');
assert.equal(owner.api.snapshot().queueLength,0,
  'estado público deve refletir a fila já enviada');
assert.equal(editor.S.layers[0].features[0].props.TIPO,'editado offline',
  'o editor remoto deve receber a revisão que saiu da fila offline');

/* Se o usuário editar de novo enquanto uma versão da fila está em upload, a
   confirmação antiga não pode apagar a edição mais nova. */
ownerProvider.setOnline(false);owner.api._state.online=false;
owner.S.layers[0].features[0].props.TIPO='fila antiga em envio';
await owner.api.syncActiveLayer();
ownerProvider.setOnline(true);owner.api._state.online=true;
const publishReal=ownerProvider.publishLayerReplace.bind(ownerProvider);
let liberaUpload,marcaInicio;
const iniciou=new Promise(resolve=>{marcaInicio=resolve;});
const espera=new Promise(resolve=>{liberaUpload=resolve;});
ownerProvider.publishLayerReplace=async(...args)=>{marcaInicio();await espera;return publishReal(...args);};
const primeiroFlush=owner.api.flushQueue();await iniciou;
owner.api._state.online=false;
owner.S.layers[0].features[0].props.TIPO='fila nova preservada';
await owner.api.syncActiveLayer();
owner.api._state.online=true;liberaUpload();
const primeiraResposta=await primeiroFlush;
assert.equal(primeiraResposta.remaining,1,
  'confirmação do upload antigo não pode remover o item substituto da fila');
ownerProvider.publishLayerReplace=publishReal;
const segundoFlush=await owner.api.flushQueue();await tick();
assert.ok(segundoFlush.sent===1||owner.api.snapshot().queueLength===0,
  'a versão nova deve ser publicada pelo flush explícito ou pelo replay automático');
assert.equal(owner.api.snapshot().queueLength,0,'a fila só esvazia após confirmar a versão mais nova');
assert.equal(editor.S.layers[0].features[0].props.TIPO,'fila nova preservada',
  'o outro usuário deve receber a edição criada durante o upload anterior');

/* Um segundo computador da mesma conta deve reproduzir todas as operações
   posteriores ao snapshot antes de liberar a edição. UID igual não é eco
   próprio quando o clientId é diferente. */
const ownerSecondProvider=backend.provider({uid:'u-owner',email:'dona@ccmeng.net',displayName:'Dona'});
const ownerSecond=makeClient('owner-second',ownerSecondProvider,[{...baseLayers[0],id:11}]);
await ownerSecond.api.join({roomId,loadSnapshot:true});
assert.ok(ownerSecond.api.snapshot().lastSeq<=ownerSecond.api.snapshot().replayTargetSeq,
  'a entrada deve conhecer o alvo de replay informado pela sala');
await tick();await tick();
assert.equal(ownerSecond.S.layers[0].features[0].props.TIPO,'fila nova preservada',
  'a mesma conta em outro clientId deve aplicar as revisões remotas');
assert.equal(ownerSecond.api.snapshot().lastSeq,ownerSecond.api.snapshot().replayTargetSeq,
  'a edição só pode ser liberada depois que o replay alcançar room.nextSeq');
assert.equal(ownerSecond.api.snapshot().status,'connected',
  'o estado deve voltar a conectado quando o replay terminar');

/* Papel alterado no servidor deve valer imediatamente na sessão aberta. */
await ownerProvider.setMemberRole(roomId,'u-editor','viewer');
await tick();
assert.equal(editor.api.snapshot().role,'viewer',
  'mudança editor→viewer deve atualizar a autorização local em tempo real');

/* Substituir o projeto encerra sala/listeners localmente, mas não remove a
   associação persistente do usuário. */
assert.equal(ownerSecond.api.prepareProjectReplacement(),true,
  'abrir outro projeto deve desconectar a sala anterior de forma síncrona');
assert.equal(ownerSecond.api.snapshot().roomId,null,
  'o novo projeto não pode herdar o roomId anterior');
assert.ok(backend.rooms.get(roomId).members.has('u-owner'),
  'desconectar não pode apagar a associação da conta à sala');

/* Viewer possui o mesmo projeto para consulta, mas nem sequer deve chamar o
   método de publicação do provider. A regra de servidor é uma segunda linha
   de defesa, não um substituto para a permissão na interface. */
const viewerProvider=backend.provider({uid:'u-viewer',email:'leitor@ccmeng.net',displayName:'Leitor'},'viewer');
const viewer=makeClient('viewer',viewerProvider,baseLayers);
await viewer.api.join({roomId,loadSnapshot:true});
const callsBeforeViewer=backend.publishCalls;
let viewerRejected=false;
let viewerResult=null;
try{
  viewerResult=await viewer.api.syncActiveLayer();
}catch(error){viewerRejected=true;}
assert.ok(viewerRejected||viewerResult?.forbidden||viewerResult?.error||viewer.api.snapshot().error,
  'viewer deve receber uma recusa observável ao tentar sincronizar');
assert.equal(backend.publishCalls,callsBeforeViewer,
  'viewer não pode chegar a chamar publishLayerReplace');

console.log('OK: sala, snapshot, UUID, presença, lock, layer.replace, fila offline e papel viewer validados em VM.');
