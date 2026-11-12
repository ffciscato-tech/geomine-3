'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{webcrypto}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../src/modules/persistence/import-recovery.js'),'utf8');
function runtime(){
 const store=new Map(),storage=new Map(),state={generation:1,version:1,dirty:true,ownerUid:'alice',booted:false};let data={app:'ALAGIS',projectId:'bn',layers:[{features:[{geom:[[1,2],[3,4]],props:{NAME:'Braço do Norte'}}]}]},fail=false,change=false;
 const c={navigator:{userAgent:'Mozilla Macintosh Safari',platform:'MacIntel',maxTouchPoints:5},crypto:webcrypto,TextEncoder,Blob,DOMException,Date,console,setTimeout,
  sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  GeoMineSessionAutosave:{state,markDirty:()=>state.dirty=true},GeoMineProjectTabSession:{state:()=>({tabId:'same-tab'}),ready:Promise.resolve()},
  performance:{getEntriesByType:()=>[{type:'reload'}]},S:{projectId:'bn'},hasContent:()=>!!data,projectData:()=>data,
  idbSet:async(k,v)=>{if(fail)throw Error('QuotaExceededError');store.set(k,v);if(change)state.version++;},idbGet:async k=>store.get(k),
  loadProject:d=>{data=d;c.S.projectId=d.projectId;state.generation++;},showLoad:()=>{},hideLoad:()=>{},toast:()=>{},
  document:{readyState:'loading',addEventListener:()=>{}},addEventListener:()=>{}};
 c.window=c;vm.createContext(c);vm.runInContext(source,c);
 return {c,state,store,storage,get data(){return data;},set data(v){data=v;},fail:()=>fail=true,change:()=>change=true,api:c.GeoMineImportRecovery};
}
test('bounded serializer matches JSON for sparse arrays, typed arrays, Unicode and escaped text',()=>{
 const r=runtime(),a=[];a[2]=undefined;a[3]=NaN;
 const data={a,b:new Float32Array([1,2]),date:new Date('2026-11-06'),u:'á😀\n"\\'.repeat(40000),missing:undefined,n:Infinity};
 const parts=[...r.api.__test.chunks(data)];assert(parts.length>1);assert.deepEqual(JSON.parse(parts.join('')),JSON.parse(JSON.stringify(data)));assert(parts.every(p=>p.length<280000));
});
test('checkpoint commits last, hashes chunks and restores geometry exactly without TIFF retry',async()=>{
 const r=runtime(),expected=JSON.stringify(r.data);await r.api.before();assert(r.api.available());
 const p=JSON.parse([...r.storage.values()][0]);assert(r.store.get(p.key).complete);assert(p.count>0);
 r.data=null;r.state.dirty=false;assert(await r.api.recover());assert.equal(JSON.stringify(r.data),expected);assert(r.state.dirty);
 assert.equal(await r.api.recover(),false);
});
test('account and tab isolation prevent automatic restoration into another session',async()=>{
 const r=runtime();await r.api.before();r.data=null;r.state.dirty=false;r.state.ownerUid='bob';assert(!r.api.available());assert.equal(await r.api.recover(),false);
 r.state.ownerUid='alice';r.c.GeoMineProjectTabSession.state=()=>({tabId:'other-tab'});assert.equal(await r.api.recover(),false);assert.equal(await r.api.recover({manual:true}),true);
});
test('corrupt and incomplete chunks never replace the open project',async()=>{
 const r=runtime();await r.api.before();const p=JSON.parse([...r.storage.values()][0]);r.store.get(p.key+':0').sha256='invalid';const original=r.data;
 assert.equal(await r.api.recover({manual:true}),false);assert.equal(r.data,original);
});
test('quota failure and concurrent edits cannot commit a checkpoint',async()=>{
 for(const mode of ['fail','change']){const r=runtime();r[mode]();await assert.rejects(r.api.before());assert.equal(r.storage.size,0);}
});
test('same import control cannot reuse checkpoint from another project',async()=>{
 const r=runtime(),control={};await r.api.before(control);r.data.projectId='new';r.c.S.projectId='new';r.state.generation++;await r.api.before(control);
 const p=JSON.parse([...r.storage.values()][0]);assert.equal(p.projectId,'new');
});
test('iPad desktop user agent receives a 1536px overview without changing desktop limit',()=>{
 const text=fs.readFileSync(path.join(__dirname,'../src/modules/raster/orthophoto-first-frame.js'),'utf8');
 const fn=text.slice(text.indexOf('function previewLimit()'),text.indexOf('function create('));
 for(const [navigator,expected] of [[{userAgent:'Macintosh Safari',platform:'MacIntel',maxTouchPoints:5},1536],[{userAgent:'Windows Chrome',platform:'Win32',maxTouchPoints:0},4096],[{userAgent:'Android Chrome',platform:'Linux',maxTouchPoints:5},1024]])assert.equal(vm.runInNewContext(fn+';previewLimit()', {navigator}),expected);
});
