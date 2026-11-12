import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src/modules/persistence/session-autosave.js'),'utf8');
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};};
function runtime(options={}){
  const records=new Map(Object.entries(options.records||{}));
  const windowEvents=new Map(),documentEvents=new Map(),timers=[];
  const calls={reads:[],writes:[],loads:[],saves:[],tags:[],locks:0,reloads:0,deletes:0};
  const add=(target,type,fn)=>{const list=target.get(type)||[];list.push(fn);target.set(type,list);};
  const tag={style:{}},gate=options.uid?{style:{}}:null;
  const S={layers:[{id:1}],auto:{on:false,handle:null,name:'Projeto.ccmgis'},projectId:'p1'};
  const context={console,S,document:{hidden:false,readyState:options.readyState||'complete',
    getElementById:id=>id==='autoTag'?tag:id==='gmPortao'?gate:null,
    addEventListener:(type,fn)=>add(documentEvents,type,fn)},
    navigator:{locks:{request(){calls.locks++;throw Error('Lease antigo não deve ser usado');}}},
    sessionStorage:{getItem:()=> 'tab-antiga',setItem(){throw Error('Sessão não deve ser gravada');}},
    hasContent:()=>S.layers.length>0,
    autoTag:(text)=>calls.tags.push(text),toast:()=>{},showLoad:()=>{},hideLoad:()=>{},
    confirm:()=>true,ALAGIS_NEW_PROJECT_BOOT:false,
    idbGet:async key=>{calls.reads.push(key);return records.get(key);},
    idbSet:async(key,value)=>{calls.writes.push(key);records.set(key,value);},
    idb:async()=>({transaction(_store,mode){assert.equal(mode,'readonly');return {objectStore:()=>({getAllKeys(){
      const req={result:[...records.keys()]};queueMicrotask(()=>req.onsuccess());return req;
    }})};}}),
    startAutosave:(name,handle)=>{S.auto.name=name;S.auto.handle=handle;return true;},
    autosaveNow:()=>{calls.writes.push('old-autosave');return true;},
    saveProject:function(...args){calls.saves.push(args);return options.save?options.save(context,...args):true;},
    loadProject:data=>{calls.loads.push(data);S.projectId=data.projectId||'p2';S.layers=data.layers||[{id:2}];return true;},
    addLayer:()=>{},drawLayer:()=>{},refreshUI:()=>{},
    setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},
    clearInterval:()=>{},setInterval(){throw Error('Nenhum heartbeat no modo manual');},
    addEventListener:(type,fn)=>add(windowEvents,type,fn),location:{reload:()=>calls.reloads++}};
  if(options.uid)context.GeoMineCloudProvider={user:{uid:options.uid}};
  context.window=context;vm.createContext(context);vm.runInContext(source,context);
  return {context,calls,S,tag,records,timers,api:context.GeoMineSessionAutosave,
    dispatch:(type,e={})=>(windowEvents.get(type)||[]).forEach(fn=>fn(e)),
    documentEvent:(type,e={})=>(documentEvents.get(type)||[]).forEach(fn=>fn(e)),
    flushTimers:()=>{for(const timer of timers.splice(0))timer.fn();}};
}
let checks=0;
async function check(name,test){await test();checks++;console.log('OK · '+name);}
const project={app:'CCMGIS',projectId:'recuperado',layers:[{id:'copia'}]};
const recovery=(ownerUid)=>({ownerUid,projectId:'p1',name:'Projeto.ccmgis',at:'2026-09-01T00:00:00Z',txt:JSON.stringify(project)});

await check('boot não lê nem restaura a sessão antiga',async()=>{
  const h=runtime({records:{'activeProjectSession:offline:tab-antiga':{active:true},'autosave:offline:p1':recovery(null)}});
  assert.equal(h.api.mode,'manual');assert.equal(h.api.version,5);
  assert.equal(h.calls.loads.length,0);assert.equal(h.calls.reads.length,0);assert.equal(h.calls.writes.length,0);
  assert.equal(h.timers.length,0);assert.equal(await h.api.restoreLastProjectSession(),false);
});
await check('edições, visibilidade e fechamento não gravam',async()=>{
  const h=runtime();h.context.startAutosave('Projeto.ccmgis',{name:'Projeto.ccmgis'});
  h.documentEvent('input');h.documentEvent('change');h.context.addLayer();h.context.refreshUI();
  h.documentEvent('visibilitychange');h.dispatch('pagehide');h.dispatch('focus');
  assert.equal(await h.context.autosaveNow(false),false);assert.equal(await h.api.flush(),false);assert.equal(await h.api.copiaDaAba(),false);
  assert.equal(h.calls.writes.length,0);assert.equal(h.calls.locks,0);assert.equal(h.calls.saves.length,0);
  assert.equal(h.S.auto.on,false);assert.equal(h.api.state.dirty,true);assert.equal(h.timers.length,0);
});
await check('beforeunload avisa somente quando há alterações ou gravação',async()=>{
  const h=runtime();let warned=0;const event={preventDefault(){warned++;}};
  h.dispatch('beforeunload',event);assert.equal(warned,0);
  h.api.markDirty('teste');h.dispatch('beforeunload',event);assert.equal(warned,1);assert.equal(event.returnValue,'');
  await h.context.saveProject(false);h.dispatch('beforeunload',event);assert.equal(warned,1);
});
await check('Salvar mantém o gesto síncrono e ignora leases antigos',async()=>{
  const h=runtime();h.api.markDirty('teste');const pending=h.context.saveProject(false);
  assert.equal(h.calls.saves.length,1,'Salvar deve chamar a implementação antes de qualquer await');
  assert.equal(h.calls.locks,0);assert.equal(await pending,true);assert.equal(h.api.state.dirty,false);
});
await check('Salvar cancelado ou falho mantém o aviso de alterações',async()=>{
  for(const result of [false,undefined]){
    const h=runtime({save:()=>result});h.api.markDirty('teste');assert.equal(await h.context.saveProject(true),false);
    assert.equal(h.api.state.dirty,true);assert.equal(h.S.auto.dirty,true);
  }
  const h=runtime({save:()=>{throw Error('disco indisponível');}});h.api.markDirty('teste');
  await assert.rejects(h.context.saveProject(false),/disco/);assert.equal(h.api.state.dirty,true);assert.equal(h.api.state.writeActive,null);
});
await check('edições durante Salvar continuam não salvas',async()=>{
  const done=deferred(),h=runtime({save:()=>done.promise});h.api.markDirty('primeira');
  const first=h.context.saveProject(false);h.api.markDirty('durante');
  assert.equal(await h.context.saveProject(false),false);assert.equal(h.calls.saves.length,1);
  done.resolve(true);assert.equal(await first,true);assert.equal(h.api.state.dirty,true);
});
await check('abrir arquivo limpa dirty e conserva o handle somente em memória',async()=>{
  const h=runtime();h.api.markDirty('antes');h.context.loadProject(project);h.flushTimers();
  const handle={name:'Aberto.ccmgis'};h.context.startAutosave(handle.name,handle);
  assert.equal(h.api.state.dirty,false);assert.equal(h.S.auto.handle,handle);assert.equal(h.S.auto.on,false);
  assert.equal(h.calls.writes.length,0);assert.equal(h.calls.reads.length,0);
});
await check('novo projeto registra seu destino e gravação antiga não limpa dirty',async()=>{
  const done=deferred(),h=runtime({save:()=>done.promise});h.api.markDirty('antes');
  const pending=h.context.saveProject(false);h.context.loadProject(project);h.flushTimers();h.api.markDirty('projeto novo');
  const handle={name:'Novo.ccmgis'};assert.equal(h.context.startAutosave(handle.name,handle),true);
  done.resolve(true);await pending;assert.equal(h.api.state.dirty,true);assert.equal(h.S.auto.handle,handle);
});
await check('seletor de arquivo não marca o projeto atual como editado',async()=>{
  const h=runtime();h.documentEvent('input',{target:{type:'file'}});h.documentEvent('change',{target:{type:'file'}});
  assert.equal(h.api.state.dirty,false);h.context.addLayer();assert.equal(h.api.state.dirty,true);
});
await check('Recuperar preserva cópias existentes e isola as contas',async()=>{
  const records={'autosave:contaA:p1':recovery('contaA'),'autosave.prev:contaA:p1':recovery('contaA'),
    'autosave.aba:contaA:p1:tab2':recovery('contaA'),'autosave:contaB:p1':recovery('contaB'),
    'autosave':recovery(null),'autosave:contaA:errada':recovery('contaB')};
  const h=runtime({uid:'contaA',records});const items=await h.api.listarRascunhos();
  assert.equal(items.length,3);assert.equal(h.records.size,6);assert.equal(h.calls.writes.length,0);
  assert.equal(await h.api.recuperarDe(items[0]),true);assert.equal(h.calls.loads.length,1);
  assert.equal(h.S.auto.handle,null);assert.equal(h.api.state.dirty,true);assert.equal(h.calls.writes.length,0);
  h.context.GeoMineCloudProvider.user.uid='contaB';assert.equal(await h.api.recuperarDe(items[0]),false);
});
await check('cópia legada offline continua disponível sem nova gravação',async()=>{
  const h=runtime({records:{autosave:recovery(null),'autosave:contaA:p1':recovery('contaA')}});
  assert.equal((await h.api.listarRascunhos()).length,1);assert.equal(h.calls.writes.length,0);
});
await check('indicador e atalhos disparam Salvar explicitamente',async()=>{
  const h=runtime();await h.tag.onclick();assert.equal(h.calls.saves.length,1);assert.equal(h.calls.saves[0][0],false);
  let prevented=0;
  h.documentEvent('keydown',{key:'s',ctrlKey:true,preventDefault:()=>prevented++});await settle();
  h.documentEvent('keydown',{key:'S',metaKey:true,shiftKey:true,preventDefault:()=>prevented++});await settle();
  assert.equal(prevented,2);assert.equal(h.calls.saves[1][0],false);assert.equal(h.calls.saves[2][0],true);
});
await check('logout não grava nem apaga as alterações pendentes',async()=>{
  const h=runtime({uid:'contaA'});h.api.markDirty('teste');h.dispatch('geomine:cloud-disconnected');
  assert.equal(h.calls.writes.length,0);assert.equal(h.calls.saves.length,0);assert.equal(h.calls.reloads,1);
  assert.equal(h.api.state.dirty,true);assert.equal(h.S.auto.handle,null);
});
await check('login tardio é reconhecido e logout preserva o isolamento',async()=>{
  const h=runtime({readyState:'loading'});assert.equal(h.api.state.booted,false);
  h.context.GeoMineCloudProvider={user:null};h.documentEvent('DOMContentLoaded');
  assert.equal(h.api.state.booted,false);assert.equal(h.calls.reads.length,0);
  h.context.GeoMineCloudProvider.user={uid:'contaA'};
  h.dispatch('geomine:cloud-ready',{detail:{user:{uid:'contaA'}}});
  assert.equal(h.api.state.ownerUid,'contaA');h.dispatch('geomine:cloud-disconnected');
  assert.equal(h.calls.reloads,1);assert.equal(h.calls.writes.length,0);
});
await check('montagem offline anterior ao provider adota a primeira conta',async()=>{
  const h=runtime();assert.equal(h.api.state.ownerUid,null);
  h.context.GeoMineCloudProvider={user:{uid:'contaA'}};
  h.dispatch('geomine:cloud-ready',{detail:{user:{uid:'contaA'}}});
  assert.equal(h.api.state.ownerUid,'contaA');
  h.context.GeoMineCloudProvider.user={uid:'contaB'};
  h.dispatch('geomine:cloud-ready',{detail:{user:{uid:'contaB'}}});assert.equal(h.calls.reloads,1);
});
console.log('Salvamento manual: '+checks+' cenários aprovados.');
