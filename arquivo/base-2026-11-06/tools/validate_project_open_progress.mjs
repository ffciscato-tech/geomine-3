import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,2));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){
 const nodes=new Map(),frames=new Map(),calls={read:[],load:[],parse:0};let frameId=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,disabled:false,textContent:'',style:{display:'none'},attrs:{},classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];if(k==='value')delete this.value;}});return nodes.get(id);};
 const session={state:{generation:0,version:0}};
 const context={AbortController,Promise,setTimeout,clearTimeout,console,Map,Date,Number,Error,
  JSON:{parse(s){calls.parse++;return JSON.parse(s);}},
  S:{projectId:'original',auto:{handle:{name:'original.ccmgis'},dirty:true}},
  GeoMineSessionAutosave:session,document:{getElementById:node},
  requestAnimationFrame(fn){const id=++frameId;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
  GeoMineProjectReader:{read(file,options){calls.read.push({file,options});return Promise.resolve('{"app":"CCMGIS","projectId":"new"}');}},
  loadProject(data){calls.load.push(data);context.GeoMineProjectOpenProgress.invalidate('loadProject');session.state.generation++;context.S.projectId=data.projectId;},
 };
 context.window=context;vm.createContext(context);
 vm.runInContext(read('src/modules/ui/loading-progress.js'),context);
 vm.runInContext(read('src/modules/persistence/project-open-progress.js'),context);
 async function paint(){const pending=[...frames.entries()];for(const [id,fn]of pending){frames.delete(id);fn();}await tick();}
 return {c:context,api:context.GeoMineProjectOpenProgress,ui:context.GeoMineLoadProgress,node,calls,session,paint};
}
const tests=[];function test(name,run){tests.push([name,run]);}

test('bytes are real; parse, map and final paint are separate indeterminate phases',async()=>{
 const f=fixture(),pending=deferred();f.c.GeoMineProjectReader.read=(file,o)=>{f.calls.read.push({file,options:o});o.onProgress({loaded:25,total:100,phase:'read'});return pending.promise;};
 const job=f.api.begin(),reading=job.read({size:100});
 assert.equal(f.calls.read.length,0);assert.equal(f.api.state().percent,0);
 await f.paint();assert.equal(f.api.state().percent,25);assert.equal(f.node('gmLoadBar').value,.25);
 assert.equal(f.calls.read[0].options.signal,job.signal);
 f.calls.read[0].options.onProgress({loaded:100,total:100,phase:'read'});pending.resolve('{"projectId":"new"}');
 const text=await reading,parsing=job.parse(text);assert.equal(f.api.state().percent,null);assert.equal(f.calls.parse,0);assert.match(f.api.state().phase,/Interpretando/);assert.equal('value' in f.node('gmLoadBar'),false);
 await f.paint();const data=await parsing;assert.equal(f.calls.parse,1);
 let after=0;const commit=job.commit(data,()=>after++);assert.equal(f.calls.load.length,0);assert.match(f.api.state().phase,/Montando/);
 await f.paint();assert.equal(f.calls.load.length,1);assert.equal(after,1);assert.equal(job.committed,true);assert.match(f.api.state().phase,/Finalizando/);assert.equal(f.node('cmdStatusCancel').disabled,true);
 assert.equal(f.api.state().percent,null);await f.paint();await commit;job.finish();assert.equal(f.api.state().active,false);assert.equal(f.node('gmLoadProgress').hidden,true);assert.equal(f.node('cmdStatusCancel').disabled,false);
});
test('generic loading cannot overwrite or hide the project lane',()=>{
 const f=fixture(),job=f.api.begin();job.phase('Lendo arquivo…',.5);
 f.ui.show('Raster 90%');f.ui.set(.9);assert.equal(f.node('gmLoadTitle').textContent,'Lendo arquivo…');assert.equal(f.node('gmLoadBar').value,.5);assert.equal(f.node('cmdStatusPct').textContent,'50%');
 f.ui.end();assert.equal(f.node('gmLoadProgress').hidden,false);assert.equal(f.node('cmdStatus').style.display,'inline-flex');job.finish();
});
test('old owner cannot update or clear a newer owner',()=>{
 const f=fixture(),first=f.api.begin(),second=f.api.begin();second.phase('Projeto B',.3);assert.equal(first.signal.aborted,true);first.finish();assert.equal(f.node('gmLoadTitle').textContent,'Projeto B');assert.throws(()=>first.phase('A'),{name:'AbortError'});
 f.ui.projectEnd({});f.ui.projectShow({},'invasor',1);assert.equal(f.node('gmLoadBar').value,.3);second.finish();
});
test('late reader that ignores abort cannot finish an abandoned opening',async()=>{
 const f=fixture(),pending=deferred();f.c.GeoMineProjectReader.read=()=>pending.promise;
 const old=f.api.begin(),reading=old.read({size:4});const rejection=assert.rejects(reading,{name:'AbortError'});await f.paint();const next=f.api.begin();pending.resolve('late');await rejection;assert.equal(f.calls.load.length,0);old.finish();assert.equal(f.api.state().id,next.id);next.finish();
});
test('external abort stops the reader and cannot mutate project or destination',async()=>{
 const f=fixture(),controller=new AbortController(),pending=deferred(),original=f.c.S.auto.handle;
 f.c.GeoMineProjectReader.read=()=>pending.promise;const job=f.api.begin({signal:controller.signal}),reading=job.read({size:4});const rejection=assert.rejects(reading,{name:'AbortError'});await f.paint();controller.abort();await rejection;pending.resolve('late');assert.equal(job.signal.aborted,true);assert.equal(f.c.S.projectId,'original');assert.equal(f.c.S.auto.handle,original);assert.equal(f.api.state().active,false);
});
test('parse cancelled before paint never invokes JSON.parse',async()=>{
 const f=fixture(),job=f.api.begin(),parsing=job.parse('{}');const rejected=assert.rejects(parsing,{name:'AbortError'});f.api.cancel();await rejected;await f.paint();assert.equal(f.calls.parse,0);
});
test('generation or project change invalidates provider completion',async()=>{
 for(const kind of ['generation','project']){const f=fixture(),pending=deferred(),job=f.api.begin();const waiting=job.wait(pending.promise);if(kind==='generation')f.session.state.generation++;else f.c.S.projectId='other';pending.resolve('bytes');await assert.rejects(waiting,{name:'AbortError'});assert.equal(f.calls.load.length,0);job.finish();}
});
test('New or an external synchronous load invalidates immediately',async()=>{
 const f=fixture(),job=f.api.begin(),pending=deferred(),waiting=job.wait(pending.promise);const rejection=assert.rejects(waiting,{name:'AbortError'});f.api.invalidate('novo projeto');await rejection;assert.equal(job.signal.aborted,true);assert.equal(f.api.state().active,false);pending.reject(Error('late provider error'));await tick();
});
test('editing during the pre-commit paint never discards the newer edit',async()=>{
 const f=fixture(),job=f.api.begin(),commit=job.commit({projectId:'new'});const rejection=assert.rejects(commit,/foi editado/);f.session.state.version++;await f.paint();await rejection;assert.equal(f.calls.load.length,0);assert.equal(f.c.S.projectId,'original');job.finish();
});
test('recovery confirmation version is preserved across the parse paint',async()=>{
 const f=fixture(),version=f.session.state.version,job=f.api.begin({current:()=>version===f.session.state.version}),parsing=job.parse('{"projectId":"new"}');f.session.state.version++;const rejection=assert.rejects(parsing,{name:'AbortError'});await f.paint();await rejection;assert.equal(f.calls.parse,0);assert.equal(f.calls.load.length,0);job.finish();
});
test('successful sync commit may update its own source guard and generation',async()=>{
 const f=fixture();let current=true;const job=f.api.begin({current:()=>current}),commit=job.commit({projectId:'new'},()=>{current=false;f.session.state.version++;});await f.paint();assert.equal(job.committed,true);await f.paint();await commit;assert.equal(f.c.S.projectId,'new');assert.equal(f.calls.load.length,1);job.finish();
});
test('reader or malformed JSON failure preserves original project and handle',async()=>{
 const f=fixture(),handle=f.c.S.auto.handle;f.c.GeoMineProjectReader.read=()=>Promise.reject(Error('provider failed'));let job=f.api.begin(),reading=job.read({size:5});const rejected=assert.rejects(reading,/provider failed/);await f.paint();await rejected;job.finish();job=f.api.begin();const parsing=job.parse('{');const malformed=assert.rejects(parsing,SyntaxError);await f.paint();await malformed;job.finish();assert.equal(f.calls.load.length,0);assert.equal(f.c.S.auto.handle,handle);assert.equal(f.c.S.projectId,'original');
});
test('retry resets byte display to an honest indeterminate provider phase',async()=>{
 const f=fixture();f.c.GeoMineProjectReader.read=(_file,o)=>{o.onProgress({loaded:30,total:100,phase:'retry',attempt:2});return Promise.resolve('{}');};const job=f.api.begin(),reading=job.read({size:100});await f.paint();await reading;assert.equal(f.api.state().percent,null);assert.match(f.api.state().phase,/tentativa 2/);job.finish();
});
test('compat reader gets the same signal and never recursively calls job.read',async()=>{
 const f=fixture();let options;f.c.readProjectFileCompat=(_file,o)=>{options=o;o.onProgress({loaded:3,total:6,phase:'read'});return Promise.resolve('{}');};const job=f.api.begin(),reading=job.read({size:6});await f.paint();assert.equal(await reading,'{}');assert.equal(options.signal,job.signal);assert.equal(f.api.state().percent,50);assert.equal(f.calls.read.length,0);job.finish();
});
test('already-aborted input owns no lane and causes no file read',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort();const job=f.api.begin({signal:controller.signal});await assert.rejects(job.read({size:3}),{name:'AbortError'});assert.equal(f.calls.read.length,0);assert.equal(f.api.state().active,false);assert.equal(f.node('gmLoadProgress').hidden,true);
});
test('finished project restores separate raster task and its percentage',()=>{
 const f=fixture();f.ui.show('Raster 42%');const job=f.api.begin();job.phase('Projeto',NaN);job.finish();assert.equal(f.node('gmLoadTitle').textContent,'Raster 42%');assert.equal(f.node('gmLoadBar').value,.42);assert.equal(f.node('gmLoadProgress').hidden,false);f.ui.end();
});
test('every new intent advances sequence, even without an active lane',()=>{
 const f=fixture(),a=f.api.sequence();f.api.cancel('new picker');const b=f.api.sequence();assert.ok(b>a);const job=f.api.begin();assert.ok(f.api.sequence()>b);job.finish();const c=f.api.sequence();f.api.invalidate('new project');assert.ok(f.api.sequence()>c);
});

let passed=0;for(const [name,run] of tests){try{await run();passed++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name);throw e;}}
console.log(`${passed}/${tests.length} project opening progress tests passed`);
