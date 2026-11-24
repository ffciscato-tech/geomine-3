const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{webcrypto}=require('node:crypto');
const source=n=>fs.readFileSync(path.join(__dirname,'../src/modules/persistence',n),'utf8');
async function env(options={}){
 const storage=options.storage||new Map(),local=options.local||new Map(),db=options.db||new Map(),s={booted:true,ownerUid:options.owner||'alice',generation:1,version:1,dirty:true,suspend:0};let data=options.blank?null:{app:'ALAGIS',projectId:'bn',layers:[{features:[{geom:[[1,2],[3,4]],props:{CHECK:'OK'}}]}]},navigation=options.navigation||'navigate',fail=false;
 const c={navigator:{userAgent:'Desktop',maxTouchPoints:0},performance:{getEntriesByType:()=>[{type:navigation}]},crypto:webcrypto,Blob,TextEncoder,DOMException,console,setTimeout,
  setInterval:()=>1,S:{projectId:options.blank?'blank':'bn',rasters:[],img:null},hasContent:()=>!!data,projectData:()=>data,
  sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},
  idbGet:async k=>db.get(k),idbSet:async(k,v)=>{if(fail)throw Error('quota');db.set(k,v);},idb:async()=>({transaction:()=>{const tx={objectStore:()=>({delete:k=>db.delete(k)})};setTimeout(()=>tx.oncomplete?.(),0);return tx;}}),
  GeoMineSessionAutosave:{state:s,markDirty:()=>{s.dirty=true;s.version++;}},GeoMineProjectTabSession:{ready:Promise.resolve(),state:()=>({tabId:'test',busy:false,record:options.record||{source:{}}})},
  GeoMineProjectScreen:{capture:()=>({map:{center:[-28,-49],zoom:20}}),validMap:v=>!!v},
  showLoad:()=>{},hideLoad:()=>{},toast:()=>{},document:{readyState:'complete',addEventListener:()=>{}},addEventListener:()=>{},loadProject:d=>{data=d;c.S.projectId=d.projectId;s.generation++;},saveProject:async()=>true};
 c.window=c;vm.createContext(c);vm.runInContext(source('import-recovery.js'),c);vm.runInContext(source('workspace-resume.js'),c);for(let i=0;i<100&&!c.GeoMineWorkspaceResume.state.ready;i++)await new Promise(r=>setTimeout(r,2));
 return {c,s,storage,local,db,api:c.GeoMineWorkspaceResume,get data(){return data;},set data(v){data=v;},reload:()=>navigation='reload',quota:()=>fail=true};
}
test('ordinary workspace round trip restores without any filesystem handle or TIFF emergency checkpoint',async()=>{const e=await env();assert(await e.api.flush());const expected=JSON.stringify(e.data);e.reload();e.data=null;e.s.dirty=false;assert(await e.api.restore());assert.equal(JSON.stringify(e.data.layers),JSON.stringify(JSON.parse(expected).layers));assert(e.s.dirty);});
test('manual save ensures session copy is committed without changing .ccmgis writer result',async()=>{const e=await env();assert.equal(await e.c.saveProject(),true);assert(e.api.state.pointer?.complete);});
test('resuming the same workspace preserves its authorized original file handle',async()=>{const e=await env();await e.api.flush();const handle={kind:'file',name:'bn.ccmgis',getFile:async()=>({})};let attached=null;e.c.GeoMineProjectTabSession.startIn=()=>handle;e.c.startAutosave=(name,h)=>attached=h;e.reload();e.data=null;assert(await e.api.restore());assert.equal(attached,handle);});
test('failed replacement keeps the prior complete checkpoint',async()=>{const e=await env();await e.api.flush();const key=e.api.state.pointer.key;e.data.layers[0].features[0].props.CHECK='changed';e.s.version++;e.api.request();e.quota();assert.equal(await e.api.flush(),false);assert.equal(e.api.state.pointer.key,key);});
test('account mismatch, corrupt chunk and explicit project switch do not restore stale geometry',async()=>{
 const e=await env();await e.api.flush();e.reload();e.s.ownerUid='bob';assert.equal(await e.api.restore(),false);e.s.ownerUid='alice';const p=e.api.state.pointer;e.db.get(p.key+':0').sha256='bad';assert.equal(await e.api.restore(),false);
 e.c.loadProject({app:'ALAGIS',projectId:'other',layers:[]});assert.equal(e.api.state.pointer,null);assert.equal(e.data.projectId,'other');
});

test('iPad cold navigation restores after all tab memory and sessionStorage were lost',async()=>{
 const first=await env();await first.api.flush();const expected=JSON.stringify(first.data);
 const cold=await env({blank:true,db:first.db,local:first.local});
 assert.equal(JSON.stringify(cold.data.layers),JSON.stringify(JSON.parse(expected).layers));assert.equal(cold.data.projectId,'bn');
 assert(cold.api.state.pointer.complete);assert(cold.s.dirty);
});

test('IndexedDB pointer resumes when both sessionStorage and localStorage are unavailable',async()=>{
 const first=await env();await first.api.flush();
 const cold=await env({blank:true,db:first.db});assert.equal(cold.data?.projectId,'bn');
});

test('cold start never restores another signed-in account workspace',async()=>{
 const first=await env();await first.api.flush();
 const other=await env({blank:true,owner:'bob',db:first.db,local:first.local});assert.equal(other.data,null);
});

test('explicit new project clears persistent resumption instead of resurrecting the old one',async()=>{
 const first=await env();await first.api.flush();first.api.forget();first.data=null;await new Promise(r=>setTimeout(r,10));
 const cold=await env({blank:true,db:first.db,local:first.local});assert.equal(cold.data,null);
});

test('a quota failure during replacement leaves the last durable geometry intact',async()=>{
 const first=await env();await first.api.flush();first.data.layers[0].features[0].props.CHECK='not committed';first.s.version++;first.api.request();first.quota();assert.equal(await first.api.flush(),false);
 const cold=await env({blank:true,db:first.db,local:first.local});assert.equal(cold.data.layers[0].features[0].props.CHECK,'OK');
});

test('view recorded on leaving is durable without reserializing the geometry',async()=>{
 const first=await env();await first.api.flush();const key=first.api.state.pointer.key;
 first.c.GeoMineProjectScreen.capture=()=>({map:{center:[-28.1,-49.1],zoom:22}});await first.api.flush();assert.equal(first.api.state.pointer.key,key);
 const cold=await env({blank:true,db:first.db,local:first.local});assert.equal(cold.data.screen.map.zoom,22);
});

/* 24/11/2026 — "eu salvo, mas as modificações não ficam salvas": projeto de 224 MB gravado no Drive,
   ponto de retomada parado na última versão que coube em 200 MB, e era ele que voltava na recarga. */
test('depois de Salvar, o ponto de retomada antigo não volta se o novo não pôde ser gravado',async()=>{
 const first=await env();assert(await first.api.flush());
 first.data.layers[0].features[0].props.CHECK='gravado no arquivo';first.s.version++;first.api.request();
 first.quota();                                             // o aparelho recusa o ponto novo
 assert.equal(await first.c.saveProject(),true);await new Promise(r=>setTimeout(r,40));
 assert.equal(first.api.state.pointer,null);
 const cold=await env({blank:true,db:first.db,local:first.local});
 assert.equal(cold.data,null);                              // nada antigo é retomado: a recarga abre a versão do arquivo
 assert.equal([...first.db.keys()].filter(k=>String(k).startsWith('workspaceResume:v1:')).length,0); // e os blocos antigos saíram
});
test('depois de Salvar com espaço, a recarga retoma exatamente o que foi salvo',async()=>{
 const first=await env();assert(await first.api.flush());const antigo=first.api.state.pointer.key;
 first.data.layers[0].features[0].props.CHECK='gravado no arquivo';first.s.version++;first.s.dirty=false;
 assert.equal(await first.c.saveProject(),true);
 for(let i=0;i<200&&!first.api.state.pointer;i++)await new Promise(r=>setTimeout(r,5));
 assert(first.api.state.pointer?.complete);assert.notEqual(first.api.state.pointer.key,antigo);assert.equal(first.api.state.pointer.dirty,false);
 const cold=await env({blank:true,db:first.db,local:first.local});
 assert.equal(cold.data.layers[0].features[0].props.CHECK,'gravado no arquivo');
});
test('conteúdo lido do arquivo na partida descarta o ponto de retomada mais antigo que ele',async()=>{
 const first=await env();first.s.dirty=false;assert(await first.api.flush());assert.equal(first.api.state.pointer.dirty,false);
 // recarga em que a sessão da aba já abriu a versão do arquivo: há conteúdo em tela e ele não veio da retomada
 const second=await env({db:first.db,local:first.local});assert.equal(second.api.state.pointer,null);
 await new Promise(r=>setTimeout(r,20));
 const third=await env({blank:true,db:first.db,local:first.local});assert.equal(third.data,null);
});
test('projeto que não cabe na cópia local não é regravado em laço; um Salvar que cabe destrava',async()=>{
 const e=await env();assert.equal(e.api.limit,400*1048576);
 let writes=0;const set=e.c.idbSet;e.c.idbSet=async(k,v)=>{writes++;return set(k,v);};
 const grande=Object.create(Blob.prototype);Object.defineProperty(grande,'size',{value:e.api.limit+1});
 const ctx=()=>({project:'bn',generation:e.s.generation,version:e.s.version,owner:'alice'});
 assert.equal(e.api.offerSavedSnapshot({rasters:[]},grande,ctx()),false);assert.equal(e.api.state.tooLarge,true);
 e.api.request();assert.equal(await e.api.flush(),false);assert.equal(writes,0);
 e.s.version++;e.api.request();assert.equal(await e.api.flush(),false);assert.equal(writes,0);   // mudou, mas ainda dentro da espera
 const texto=JSON.stringify(e.data);
 assert.equal(e.api.offerSavedSnapshot({rasters:[]},new Blob([texto]),ctx()),true);
 assert.equal(await e.api.flush(),true);assert(writes>0);assert.equal(e.api.state.tooLarge,false);assert(e.api.state.pointer.complete);
});
test('ponto de retomada tirado sobre uma revisão do Drive anterior à última gravada nesta aba não vale',async()=>{
 const drive=v=>({projectId:'bn',source:{kind:'drive',id:'arquivo',version:v}});
 const first=await env({record:drive('7')});assert(await first.api.flush());assert.equal(first.api.state.pointer.baseRevision,'7');
 // a aba gravou depois a revisão 9 e o ponto novo não chegou a ser guardado (era assim até 24/11/2026)
 const nova=await env({blank:true,db:first.db,local:first.local,record:drive('9')});
 assert.equal(nova.data,null);assert.equal(await nova.api.pendingSnapshot('bn'),null);
 await new Promise(r=>setTimeout(r,20));
 assert.equal([...first.db.keys()].filter(k=>String(k).startsWith('workspaceResume:v1:')).length,0);
});
test('ponto de retomada sobre a mesma revisão, ou sobre uma mais nova que o registro da aba, continua valendo',async()=>{
 const drive=v=>({projectId:'bn',source:{kind:'drive',id:'arquivo',version:v}});
 const a=await env({record:drive('7')});assert(await a.api.flush());
 const mesma=await env({blank:true,db:a.db,local:a.local,record:drive('7')});assert.equal(mesma.data?.projectId,'bn');
 const b=await env({record:drive('7')});assert(await b.api.flush());
 const atrasado=await env({blank:true,db:b.db,local:b.local,record:drive('5')});assert.equal(atrasado.data?.projectId,'bn');
 assert((await atrasado.api.pendingSnapshot('bn'))?.complete);
});
