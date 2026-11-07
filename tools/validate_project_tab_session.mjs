import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src/modules/persistence/project-tab-session.js'),'utf8');
const saveTarget=fs.readFileSync(path.join(root,'src/modules/persistence/project-save-target.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
let sequence=0;
function handle(name,projectId){
 const calls={reads:0,permissions:0,writes:0};
 const h={kind:'file',name,calls,permission:'granted',data:{app:'CCMGIS',projectId,value:1},
  requestPermission(){calls.permissions++;return Promise.resolve(h.permission);},
  async getFile(){calls.reads++;if(h.error)throw h.error;if(h.wait)await h.wait;
   const text=JSON.stringify(h.data);return {name,size:text.length,lastModified:123,text:async()=>text};},
  async createWritable(){calls.writes++;throw Error('A session reference must never write a project');}};
 return h;
}
function harness({db=new Map(),storage=new Map(),locks=new Map(),nav='navigate',owner=null,published=false,readGate=null,cloneFailure=false,noLocks=false}={}){
 const events=new Map(),elements=new Map(),calls={sets:[],gets:[],loads:[],open:[],saved:[],toasts:[]};
 function element(tag){return {tagName:tag,style:{},children:[],textContent:'',disabled:false,hidden:false,
  setAttribute(){},appendChild(child){this.children.push(child);register(child);return child;},
  remove(){elements.delete(this.id);},onclick:null};}
 function register(el){if(el.id)elements.set(el.id,el);for(const c of el.children||[])register(c);}
 const document={readyState:'complete',body:element('body'),createElement:element,
  getElementById:id=>elements.get(id)||null,addEventListener(type,fn){events.set('doc:'+type,fn);}};
 const S={projectId:null,currentProjectName:null,layers:[],auto:{dirty:false,handle:null},_lastDir:null};
 const c={S,document,console,Promise,Map,Date,JSON,Math,Number,String,performance:{getEntriesByType:()=>[{type:nav}]},
  crypto:{randomUUID:()=>`test-tab-identity-${++sequence}`},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  navigator:{userAgent:'Desktop',locks:{request(name,options,cb){if(locks.has(name))return Promise.resolve(cb(null));const marker={};locks.set(name,marker);return Promise.resolve(cb({name})).finally(()=>{if(locks.get(name)===marker)locks.delete(name);});}}},
  addEventListener(type,fn){events.set(type,fn);},toast:m=>calls.toasts.push(m),showLoad(){},hideLoad(){},confirm:()=>true,
  async idbGet(k){calls.gets.push(k);if(readGate)await readGate;return db.get(k);},
  async idbSet(k,value){calls.sets.push({k,value});if(cloneFailure&&value?.handle)throw Error('DataCloneError');db.set(k,value);},
  readProjectFileCompat:f=>f.text(),
  startAutosave(name,h){S.currentProjectName=name;S.auto={...S.auto,name,handle:h||null};},
  loadProject(data){calls.loads.push(data);S.projectId=data.projectId;c.GeoMineSessionAutosave.state.generation++;c.startAutosave('internal.ccmgis',null);},
  openProjectFile(){calls.open.push(S._lastDir);return Promise.resolve();},
  pickSaveFile(options){calls.saved.push(options);return Promise.resolve();},showSaveFilePicker(){},
  GeoMineSessionAutosave:{state:{generation:0,version:0,dirty:false},async prepareNewProject(){S.projectId=null;S.auto.handle=null;}}};
 c.window=c;if(published)c.GeoMineCloudProvider={user:owner?{uid:owner}:null};if(noLocks)delete c.navigator.locks;
 vm.createContext(c);vm.runInContext(source,c);vm.runInContext(saveTarget,c);
 return {c,S,db,storage,locks,calls,events,elements,api:c.GeoMineProjectTabSession,
  async settle(){await c.GeoMineProjectTabSession.ready;await tick();},
  close(){locks.delete('geomine-project-tab:'+c.GeoMineProjectTabSession.state().tabId);},
  auth(uid){c.GeoMineCloudProvider.user=uid?{uid}:null;events.get(uid?'geomine:cloud-ready':'geomine:cloud-disconnected')?.({detail:{user:uid?{uid}:null}});}};
}
const tests=[];const test=(name,fn)=>tests.push([name,fn]);
test('two tabs store only separate file references; reload reads latest bytes only on explicit action',async()=>{
 const db=new Map(),locks=new Map(),a=harness({db,locks}),b=harness({db,locks});await Promise.all([a.settle(),b.settle()]);
 const ha=handle('A.ccmgis','A'),hb=handle('B.ccmgis','B');a.S.projectId='A';b.S.projectId='B';
 a.c.startAutosave(ha.name,ha);b.c.startAutosave(hb.name,hb);await tick();
 assert.notEqual(a.api.state().tabId,b.api.state().tabId);assert.equal(db.size,2);
 for(const rec of db.values())assert.deepEqual(Object.keys(rec).sort(),['at','handle','name','ownerUid','projectId','source','tabId','version']);
 assert.equal(ha.calls.reads+hb.calls.reads,0);assert.equal(ha.calls.writes+hb.calls.writes,0);
 ha.data.value=9;hb.data.value=17;a.close();b.close();
 const ar=harness({db,locks,storage:a.storage,nav:'reload'}),br=harness({db,locks,storage:b.storage,nav:'reload'});await Promise.all([ar.settle(),br.settle()]);
 assert.equal(ar.S.currentProjectName,null);assert.equal(br.S.currentProjectName,null);assert.equal(ar.api.state().record.name,'A.ccmgis');assert.equal(br.api.state().record.name,'B.ccmgis');
 assert.equal(ar.elements.get('gmTabReopen').hidden,false);assert.equal(ar.elements.get('gmTabReopen').style.display,'');
 assert.equal(ar.calls.loads.length+br.calls.loads.length,0);assert.equal(ha.calls.permissions+hb.calls.permissions,0);
 assert.equal(await ar.api.reopen(),true);assert.equal(await br.api.reopen(),true);
 assert.equal(ar.calls.loads[0].value,9);assert.equal(br.calls.loads[0].value,17);assert.equal(ar.S.auto.handle,ha);assert.equal(br.S.auto.handle,hb);
 assert.equal(ha.calls.writes+hb.calls.writes,0);
});
test('duplicated sessionStorage never inherits the original tab destination',async()=>{
 const a=harness();await a.settle();const h=handle('A.ccmgis','A');a.S.projectId='A';a.c.startAutosave(h.name,h);await tick();
 const duplicate=harness({db:a.db,storage:new Map(a.storage),locks:a.locks,nav:'navigate'});await duplicate.settle();
 assert.notEqual(duplicate.api.state().tabId,a.api.state().tabId);assert.equal(duplicate.api.startIn(),null);assert.equal(duplicate.api.state().record,null);
 const deceptive=harness({db:a.db,storage:new Map(a.storage),locks:a.locks,nav:'reload'});await deceptive.settle();
 assert.notEqual(deceptive.api.state().tabId,a.api.state().tabId);assert.equal(deceptive.api.state().record,null);
});
test('a fresh navigation/session does not inherit a closed tab reference',async()=>{
 const a=harness();await a.settle();a.c.startAutosave('A.ccmgis',handle('A.ccmgis','A'));await tick();a.close();
 const b=harness({db:a.db,storage:new Map(a.storage),locks:a.locks});await b.settle();assert.equal(b.api.state().record,null);assert.notEqual(a.api.state().tabId,b.api.state().tabId);
});
test('without exclusive locks a reload fails closed instead of inheriting a possibly duplicated destination',async()=>{
 const a=harness();await a.settle();a.c.startAutosave('A.ccmgis',handle('A.ccmgis','A'));await tick();a.close();
 const b=harness({db:a.db,storage:new Map(a.storage),nav:'reload',noLocks:true});await b.settle();assert.equal(b.api.state().record,null);assert.equal(b.api.state().resumeSupported,false);
 assert.notEqual(a.api.state().tabId,b.api.state().tabId);assert.match(b.calls.toasts[0],/selecione o arquivo novamente/);
});
test('account boundaries wait for authentication and never delete other account metadata or backups',async()=>{
 const a=harness({owner:'alice',published:true});await a.settle();a.S.projectId='A';a.c.startAutosave('A.ccmgis',handle('A.ccmgis','A'));await tick();
 a.db.set('autosave:alice:legacy',{txt:'keep this existing backup'});const keys=[...a.db.keys()];a.auth(null);assert.equal(a.api.startIn(),null);assert.equal(a.api.state().record,null);
 a.auth('bob');await tick();await tick();assert.equal(a.api.state().ownerUid,'bob');assert.equal(a.api.state().record,null);assert.ok(keys.every(k=>a.db.has(k)));
 const gate=harness({db:a.db,storage:new Map(a.storage),published:true,nav:'reload'});await tick();assert.equal(gate.calls.gets.length,0);assert.equal(gate.api.state().ready,false);
 gate.auth('carol');await gate.settle();assert.equal(gate.api.state().record,null);
});
test('permission refusal, deleted file and malformed current bytes never load a cached project',async()=>{
 const a=harness();await a.settle();const h=handle('A.ccmgis','A');a.S.projectId='A';a.c.startAutosave(h.name,h);await tick();a.close();
 const b=harness({db:a.db,storage:a.storage,locks:a.locks,nav:'reload'});await b.settle();h.permission='denied';assert.equal(await b.api.reopen(),false);assert.equal(h.calls.reads,0);
 h.permission='granted';h.error=Error('File no longer exists');assert.equal(await b.api.reopen(),false);assert.match(b.elements.get('gmTabResumeText').textContent,/no longer exists/);
 h.error=null;h.data={app:'wrong'};assert.equal(await b.api.reopen(),false);assert.equal(b.calls.loads.length,0);assert.equal(b.S.auto.handle,null);
});
test('a source/project switch during a pending read prevents late reopening',async()=>{
 const a=harness();await a.settle();const h=handle('A.ccmgis','A');a.c.startAutosave(h.name,h);let release;h.wait=new Promise(r=>release=r);
 const result=a.api.reopen();await tick();a.S.projectId='B';a.c.GeoMineSessionAutosave.state.generation++;a.c.startAutosave('B.ccmgis',handle('B.ccmgis','B'));release();
 assert.equal(await result,false);assert.equal(a.calls.loads.length,0);assert.equal(a.S.auto.name,'B.ccmgis');
});
test('edits made during a pending read are never discarded without another decision',async()=>{
 const a=harness();await a.settle();const h=handle('A.ccmgis','A');a.c.startAutosave(h.name,h);let release;h.wait=new Promise(r=>release=r);
 const result=a.api.reopen();await tick();a.S.layers.push({newWork:true});a.c.GeoMineSessionAutosave.state.version++;a.S.auto.dirty=true;release();
 assert.equal(await result,false);assert.equal(a.calls.loads.length,0);assert.equal(a.S.layers[0].newWork,true);assert.equal(a.S.auto.dirty,true);
});
test('account changes during a pending read prevent private bytes from loading into the next account',async()=>{
 const a=harness({owner:'alice',published:true});await a.settle();const h=handle('Alice.ccmgis','private');a.c.startAutosave(h.name,h);let release;h.wait=new Promise(r=>release=r);
 const result=a.api.reopen();await tick();a.auth('bob');release();assert.equal(await result,false);await tick();assert.equal(a.calls.loads.length,0);assert.equal(a.api.state().record,null);
});
test('manual editing/new project creates no data snapshot; New clears only this tab reference',async()=>{
 const a=harness();await a.settle();a.db.set('private-other',{handle:'preserve'});a.c.startAutosave('A.ccmgis',handle('A.ccmgis','A'));await tick();
 a.S.layers.push({secretGeometry:[1,2,3]});a.S.auto.dirty=true;const count=a.calls.sets.length;await tick();assert.equal(a.calls.sets.length,count);
 await a.c.GeoMineSessionAutosave.prepareNewProject();assert.equal(a.api.state().record,null);assert.equal(a.api.startIn(),null);assert.deepEqual(a.db.get('private-other'),{handle:'preserve'});
 assert.equal([...a.db.values()].filter(x=>x?.name==='A.ccmgis').length,0);
});
test('opening and saving anchor to this project, never to a downloaded image or global last directory',async()=>{
 const a=harness();await a.settle();const h=handle('A.ccmgis','A'),image=handle('profile.png','image');a.c.startAutosave(h.name,h);a.S._lastDir=image;
 await a.c.openProjectFile();assert.equal(a.calls.open[0],h);assert.equal(a.S._lastDir,image);
 await a.c.GeoMineProjectSaveTarget.pick({suggestedName:'A.ccmgis',startIn:image,types:[{description:'Project'}]});assert.equal(a.calls.saved[0].startIn,h);assert.equal(a.calls.saved[0].types[0].description,'Project');
 await a.api.forget();await a.c.GeoMineProjectSaveTarget.pick({suggestedName:'new.ccmgis',startIn:image});assert.equal(a.calls.saved[1].startIn,'documents');
});
test('an active file anchor is invalid outside its project identity and load generation',async()=>{
 const a=harness();await a.settle();const h=handle('A.ccmgis','A');a.S.projectId='A';a.c.startAutosave(h.name,h);assert.equal(a.api.startIn(),h);
 a.S.projectId='B';assert.equal(a.api.startIn(),null);a.S.projectId='A';a.c.GeoMineSessionAutosave.state.generation++;assert.equal(a.api.startIn(),null);
});
test('Android/input-only records give a filename hint, no invented path, permission or writable handle',async()=>{
 const a=harness();await a.settle();a.c.navigator.userAgent='Android';a.c.startAutosave('Android.ccmgis',null);await tick();a.close();
 const b=harness({db:a.db,storage:a.storage,locks:a.locks,nav:'reload'});await b.settle();assert.equal(b.api.state().record.hasHandle,false);assert.equal(b.elements.get('gmTabReopen').hidden,true);assert.equal(b.elements.get('gmTabReopen').style.display,'none');
 assert.match(b.elements.get('gmTabResumeText').textContent,/Selecione o arquivo novamente/);assert.equal(await b.api.reopen(),false);assert.equal(b.calls.loads.length,0);
 let picked;b.c.navigator.userAgent='Android';b.c.showSaveFilePicker=options=>{picked=options;return Promise.resolve();};await b.c.GeoMineProjectSaveTarget.pick({suggestedName:'Android.ccmgis',startIn:'fake-path',types:[{}]});
 assert.deepEqual(Object.keys(picked).sort(),['excludeAcceptAllOption','suggestedName']);
});
test('the input loader double registration retains file metadata but never its File object',async()=>{
 const a=harness();await a.settle();const file={name:'Input.ccmgis',size:456,lastModified:123,secretBytes:'must not persist'};
 a.events.get('doc:change')({target:{id:'projIn',files:[file]}});a.c.loadProject({app:'CCMGIS',projectId:'input'});
 // The embedded display name may differ; the following registration carries
 // the selected file's real name and must retain metadata on a repeated call.
 a.c.startAutosave(file.name,null);a.c.startAutosave(file.name,null);await tick();
 const record=[...a.db.values()].find(x=>x?.name===file.name);assert.equal(record.source.size,456);assert.equal(record.source.lastModified,123);assert.ok(!JSON.stringify(record).includes('secretBytes'));
});
test('handle clone failure falls back only to metadata',async()=>{
 const a=harness({cloneFailure:true});await a.settle();a.c.startAutosave('A.ccmgis',handle('A.ccmgis','A'));await tick();assert.equal(a.api.state().handlePersisted,false);
 assert.equal([...a.db.values()][0].handle,null);assert.equal([...a.db.values()][0].name,'A.ccmgis');
});
test('a file selected while metadata is loading wins over the old stored reference',async()=>{
 const a=harness();await a.settle();a.c.startAutosave('A.ccmgis',handle('A.ccmgis','A'));await tick();a.close();let release;
 const b=harness({db:a.db,storage:a.storage,locks:a.locks,nav:'reload',readGate:new Promise(r=>release=r)});await tick();
 const h=handle('B.ccmgis','B');b.S.projectId='B';b.c.startAutosave('B.ccmgis',h);release();await b.settle();assert.equal(b.api.state().record.name,'B.ccmgis');assert.equal(b.api.startIn(),h);assert.equal(b.api.state().pending,false);
});
test('an immediate manual open before initialization is retained safely',async()=>{
 const a=harness();a.S.projectId='A';const h=handle('A.ccmgis','A');a.c.startAutosave('A.ccmgis',h);await a.settle();assert.equal(a.api.startIn(),h);assert.equal(a.api.state().record.projectId,'A');
});
let passed=0;for(const [name,run] of tests){try{await run();console.log('PASS '+name);passed++;}catch(e){console.error('FAIL '+name);throw e;}}
console.log(`${passed}/${tests.length} project tab session tests passed`);
