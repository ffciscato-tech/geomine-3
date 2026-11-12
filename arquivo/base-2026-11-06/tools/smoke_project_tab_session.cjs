// Full application, two isolated browser tabs. Only synthetic OPFS files are
// used: native FileSystemFileHandles exercise IndexedDB structured cloning.
// This is NOT a physical Android tablet or Google Drive provider test.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const APP='https://geomine.test/GeoMine.html';
const html=fs.readFileSync(process.env.APP_PATH||path.resolve(__dirname,'../dist/GeoMine.html'),'utf8');
const reports=[];
function fixture(id,revision=1){return {app:'ALAGIS',v:1,workCRS:'EPSG:31982',projectId:id,
 projectFileName:'Projeto '+id+'.ccmgis',projectMeta:{name:'Projeto '+id},groups:[],rasters:[],plates:[],stack:['L:11'],
 layers:[{id:11,name:'Ponto '+id,gtype:'point',crs:'EPSG:31982',visible:true,fields:[{name:'REV',type:'N'}],
 features:[{geom:[[583800+revision,7075000]],props:{REV:revision,ORIGEM:id}}]}]};}
async function configuredContext(browser,options={}){
 const context=await browser.newContext({viewport:{width:1280,height:800},...options});
 await context.route('**/*',r=>r.request().url()===APP?r.fulfill({contentType:'text/html',body:html}):r.abort());
 await context.addInitScript(()=>{
  const owner=sessionStorage.getItem('__qaOwner')||'qa-owner-one';
  window.GeoMineCloudProvider={user:owner==='pending'?null:{uid:owner}};
  window.__qa={events:[],reads:[],downloads:0,next:null,mode:'ok',result:null};
  const original=FileSystemFileHandle.prototype.getFile;
  FileSystemFileHandle.prototype.getFile=function(){
   __qa.reads.push(this.name);
   if(__qa.failRead===this.name)return Promise.reject(new DOMException('Falha sintética de leitura','NotReadableError'));
   return original.apply(this,arguments);
  };
  window.__qaHandle=async name=>(await navigator.storage.getDirectory()).getFileHandle(name,{create:true});
  window.__qaWrite=async(name,data)=>{const w=await (await __qaHandle(name)).createWritable();await w.write(JSON.stringify(data));await w.close();};
  window.__qaRead=async name=>JSON.parse(await (await (await __qaHandle(name)).getFile()).text());
  function pick(kind,options){
   __qa.events.push({kind,active:navigator.userActivation.isActive,startIn:options.startIn?.name||options.startIn||null,
    suggestedName:options.suggestedName||null});
   if(!navigator.userActivation.isActive)throw new DOMException('Picker sem gesto de usuário','SecurityError');
   if(__qa.mode==='cancel')throw new DOMException('Cancelado pelo teste','AbortError');
   if(__qa.mode==='error')throw new DOMException('Provedor indisponível no teste','NotReadableError');
   if(!__qa.next)throw Error('Teste não escolheu arquivo');
   return __qaHandle(__qa.next);
  }
  window.showOpenFilePicker=async o=>[await pick('open',o)];
  window.showSaveFilePicker=async o=>pick('save',o);
  window.showDirectoryPicker=async()=>{
   if(!navigator.userActivation.isActive)throw new DOMException('Pasta sem gesto','SecurityError');
   return (await navigator.storage.getDirectory()).getDirectoryHandle('QA workspace',{create:true});
  };
 });
 return context;
}
async function boot(context){
 const page=await context.newPage();page.__errors=[];page.__accept=true;
 page.on('pageerror',e=>page.__errors.push(e.message));
 page.on('dialog',d=>page.__accept?d.accept():d.dismiss());
 page.on('download',()=>{page.__downloads=(page.__downloads||0)+1;});
 await page.goto(APP);await ready(page);return page;
}
async function ready(page){
 await page.waitForFunction(()=>window.GeoMineProjectTabSession&&window.GeoMineSessionAutosave?.state.booted);
 await page.evaluate(()=>GeoMineProjectTabSession.ready);
 await page.evaluate(()=>S.setBase('Sem fundo'));
}
async function state(page){return page.evaluate(()=>GeoMineProjectTabSession.state());}
async function ribbon(page,label){
 await page.locator('#ribCats [data-cat-id="inicio"]').click();
 const button=page.locator('#ribbon .rbtn').filter({has:page.locator('span').filter({hasText:new RegExp('^'+label+'$')})});
 assert.equal(await button.count(),1,'comando visível único: '+label);await button.click();
}
async function persisted(page,name){
 await page.waitForFunction(async name=>{
  const s=GeoMineProjectTabSession.state(),k='projectTabSession:v1:'+encodeURIComponent(s.ownerUid||'offline')+':'+encodeURIComponent(s.tabId);
  const r=await idbGet(k);return r?.name===name;
 },name);
 return page.evaluate(async()=>{
  const s=GeoMineProjectTabSession.state(),k='projectTabSession:v1:'+encodeURIComponent(s.ownerUid||'offline')+':'+encodeURIComponent(s.tabId),r=await idbGet(k);
  return {keys:Object.keys(r),name:r.name,projectId:r.projectId,ownerUid:r.ownerUid,
   nativeHandle:r.handle instanceof FileSystemFileHandle,source:r.source};
 });
}
async function selection(page,name,mode='ok'){await page.evaluate(v=>Object.assign(__qa,{next:v.name,mode:v.mode}),{name,mode});}
async function content(page){return page.evaluate(()=>({id:S.projectId,features:S.layers.flatMap(l=>l.features||[]).map(f=>({geom:f.geom,props:f.props}))}));}
async function open(page,id){
 await selection(page,'Projeto '+id+'.ccmgis');await ribbon(page,'Abrir');
 await page.waitForFunction(id=>S.projectId===id,id);await persisted(page,'Projeto '+id+'.ccmgis');
}
async function reload(page){await page.reload();await ready(page);}
async function clickReopen(page,id){
 await page.locator('#gmTabReopen').click();await page.waitForFunction(id=>S.projectId===id&&!GeoMineProjectTabSession.state().busy,id);
 await persisted(page,'Projeto '+id+'.ccmgis');
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const context=await configuredContext(browser),a=await boot(context),b=await boot(context);
  assert.equal(await a.evaluate(()=>isSecureContext),true);
  const sa=await state(a),sb=await state(b);assert.notEqual(sa.tabId,sb.tabId);
  await a.evaluate(async data=>{for(const f of data)await __qaWrite(f.projectFileName,f);},[fixture('A'),fixture('B')]);
  await open(a,'A');await open(b,'B');
  for(const [page,id] of [[a,'A'],[b,'B']]){
   const r=await persisted(page,'Projeto '+id+'.ccmgis');assert.equal(r.nativeHandle,true);assert.equal(r.projectId,id);
   for(const forbidden of ['txt','data','layers','rasters','blob','file'])assert.equal(r.keys.includes(forbidden),false,'referência sem snapshot: '+forbidden);
  }
  // The backing file changes after the initial import. Reload must offer the
  // exact tab reference without reading it, then reopen the CURRENT bytes.
  await a.evaluate(async data=>{for(const f of data)await __qaWrite(f.projectFileName,f);},[fixture('A',2),fixture('B',3)]);
  await Promise.all([reload(a),reload(b)]);
  for(const [page,id,tabId,revision] of [[a,'A',sa.tabId,2],[b,'B',sb.tabId,3]]){
   const s=await state(page);assert.equal(s.tabId,tabId);assert.equal(s.record.name,'Projeto '+id+'.ccmgis');assert.equal(s.pending,true);
   assert.equal(s.record.hasHandle,true);assert.deepEqual(await page.evaluate(()=>__qa.reads),[],'boot não lê arquivo nem restaura cópia');
   assert.notEqual((await content(page)).id,id,'boot não carrega projeto automaticamente');
   await clickReopen(page,id);assert.equal((await content(page)).features[0].props.REV,revision);
   assert.equal(await page.locator('#gmTabResume').count(),0);
  }
  reports.push('duas abas: IDs e handles isolados, reload preserva referência, reabrir lê bytes atuais (não snapshot)');
  // Unrelated export destination must not replace this tab's project anchor.
  for(const [page,id,other] of [[a,'A','B'],[b,'B','A']]){
   await page.evaluate(async name=>{S._lastDir=await __qaHandle(name);},'Projeto '+other+'.ccmgis');
   await selection(page,null,'cancel');const before=await content(page);await ribbon(page,'Abrir');
   await page.waitForFunction(()=>__qa.events.at(-1)?.kind==='open');
   assert.equal(await page.evaluate(()=>__qa.events.at(-1).startIn),'Projeto '+id+'.ccmgis');
   assert.deepEqual(await content(page),before);assert.equal((await state(page)).record.name,'Projeto '+id+'.ccmgis');
   await ribbon(page,'Salvar Como');await page.waitForFunction(()=>!GeoMineSessionAutosave.state.writeActive);
   assert.equal(await page.evaluate(()=>__qa.events.at(-1).startIn),'Projeto '+id+'.ccmgis');
   assert.deepEqual(await content(page),before);
  }
  reports.push('Abrir e Salvar Como usam âncora própria; cancelamentos preservam conteúdo e destino');
  // Save is still deliberate and reuses the reopened native handle.
  await a.evaluate(()=>{S.layers[0].features[0].props.REV=4;GeoMineSessionAutosave.markDirty('teste');});
  const pickerCount=await a.evaluate(()=>__qa.events.length);await ribbon(a,'Salvar');
  await a.waitForFunction(()=>!GeoMineSessionAutosave.state.writeActive&&!GeoMineSessionAutosave.state.dirty);
  assert.equal(await a.evaluate(()=>__qa.events.length),pickerCount);
  assert.equal(await a.evaluate(async()=> (await __qaRead('Projeto A.ccmgis')).layers[0].features[0].props.REV),4);
  assert.equal(await b.evaluate(async()=> (await __qaRead('Projeto B.ccmgis')).layers[0].features[0].props.REV),3);
  reports.push('Salvar após reabrir escreve só A, não abre outro seletor e mantém B intacto');
  // An unreadable source cannot load an old snapshot or disturb the reference.
  await reload(a);
  await a.evaluate(()=>{__qa.permission=FileSystemFileHandle.prototype.requestPermission;FileSystemFileHandle.prototype.requestPermission=async()=> 'denied';});
  await a.locator('#gmTabReopen').click();await a.waitForFunction(()=>!GeoMineProjectTabSession.state().busy);
  assert.deepEqual(await a.evaluate(()=>__qa.reads),[],'permissão negada não lê original');
  assert.match(await a.locator('#gmTabResumeText').textContent(),/permissão/i);
  await a.evaluate(()=>{FileSystemFileHandle.prototype.requestPermission=__qa.permission;__qa.failRead='Projeto A.ccmgis';});
  const beforeError=await content(a);await a.locator('#gmTabReopen').click();
  await a.waitForFunction(()=>!GeoMineProjectTabSession.state().busy);
  assert.deepEqual(await content(a),beforeError);assert.equal((await state(a)).record.name,'Projeto A.ccmgis');
  assert.equal((await state(a)).pending,true);
  assert.match(await a.locator('#gmTabResumeText').textContent(),/Falha sintética de leitura/);
  await a.evaluate(()=>{__qa.failRead=null;});await clickReopen(a,'A');
  assert.equal((await content(a)).features[0].props.REV,4);
  reports.push('erro de leitura não carrega cópia antiga; nova tentativa relê o original');
  // Browser window.open copies sessionStorage, reproducing a duplicated tab.
  const popupWait=context.waitForEvent('page');await a.evaluate(url=>window.open(url,'_blank'),APP);const clone=await popupWait;
  clone.__errors=[];clone.__accept=true;clone.on('pageerror',e=>clone.__errors.push(e.message));clone.on('dialog',d=>d.accept());
  await clone.waitForLoadState();await ready(clone);assert.notEqual((await state(clone)).tabId,(await state(a)).tabId);
  assert.equal((await state(clone)).record,null);assert.equal(await clone.locator('#gmTabResume').count(),0);
  await selection(clone,null,'cancel');await ribbon(clone,'Abrir');
  assert.equal(await clone.evaluate(()=>__qa.events.at(-1).startIn),null);
  await clone.evaluate(async()=>{S._lastDir=await __qaHandle('Projeto B.ccmgis');loadProject({app:'ALAGIS',v:1,workCRS:'EPSG:31982',projectId:'EMPTY',layers:[],rasters:[]});});
  await ribbon(clone,'Salvar Como');await clone.waitForFunction(()=>!GeoMineSessionAutosave.state.writeActive);
  assert.equal(await clone.evaluate(()=>__qa.events.at(-1).startIn),'documents','aba sem handle não herda exportação');
  // Force a copied ID into a reload while the original tab is still alive.
  // This specifically exercises the Web Locks collision guard, not just new navigation.
  await clone.evaluate(id=>sessionStorage.setItem('geomine.project.tab.v1',id),(await state(a)).tabId);
  await reload(clone);assert.notEqual((await state(clone)).tabId,(await state(a)).tabId);assert.equal((await state(clone)).record,null);
  reports.push('duplicar aba e colidir ID em reload geram ID novo; sem herdar projeto/handle ou diretório de exportação');
  // A new signed-in account may not acquire the previous account's handle.
  const previousId=(await state(a)).tabId;
  await a.evaluate(()=>sessionStorage.setItem('__qaOwner','qa-owner-two'));await reload(a);
  assert.equal((await state(a)).ownerUid,'qa-owner-two');assert.equal((await state(a)).record,null);
  assert.equal(await a.locator('#gmTabResume').count(),0);assert.equal(await a.evaluate(()=>GeoMineProjectTabSession.startIn()),null);
  await a.evaluate(()=>sessionStorage.setItem('__qaOwner','qa-owner-one'));await reload(a);
  assert.equal((await state(a)).tabId,previousId);assert.equal((await state(a)).record.name,'Projeto A.ccmgis');
  await clickReopen(a,'A');
  reports.push('conta nova não herda referência; namespace da conta anterior é preservado');
  // Exercise the actual New Project wizard (including its prepareNewProject
  // hook and reload), with a native synthetic OPFS directory, never disk/Drive.
  await ribbon(a,'Novo Projeto');await a.locator('#npName').fill('Novo projeto QA isolado');
  await a.locator('#newProjectWizard [data-np="folder"]').click();
  await a.waitForFunction(()=>document.querySelector('#npFolder')?.textContent.includes('QA workspace'));
  await Promise.all([a.waitForNavigation(),a.locator('#newProjectWizard [data-np="start"]').click()]);await ready(a);
  assert.equal(await a.evaluate(()=>S.projectMeta?.name),'Novo projeto QA isolado');
  assert.equal((await state(a)).record,null);await reload(b);assert.equal((await state(b)).record.name,'Projeto B.ccmgis');
  assert.equal(await b.evaluate(async()=> (await __qaRead('Projeto A.ccmgis')).layers[0].features[0].props.REV),4);
  reports.push('Novo Projeto real/wizard limpa somente referência da aba; arquivos e outra aba permanecem');
  // A published app waits for the actual account; it may not provisionally
  // expose an offline or previously authenticated tab record during login.
  await clone.evaluate(()=>sessionStorage.setItem('__qaOwner','pending'));await clone.reload();
  await clone.waitForFunction(()=>window.GeoMineProjectTabSession);
  assert.equal((await state(clone)).ready,false);assert.equal((await state(clone)).record,null);
  assert.equal(await clone.locator('#gmTabResume').count(),0);assert.deepEqual(await clone.evaluate(()=>__qa.reads),[]);
  await clone.evaluate(()=>{GeoMineCloudProvider.user={uid:'qa-owner-two'};window.dispatchEvent(new CustomEvent('geomine:cloud-ready',{detail:{user:GeoMineCloudProvider.user}}));});
  await ready(clone);assert.equal((await state(clone)).ownerUid,'qa-owner-two');assert.equal((await state(clone)).record,null);
  reports.push('boot autenticado aguarda conta definida e não expõe referência anterior durante login');
  for(const page of [a,b,clone]){assert.deepEqual(page.__errors,[]);assert.equal(page.__downloads||0,0);}
  await context.close();
  // Android's real input-file route has no durable FileSystemFileHandle.
  const android=await configuredContext(browser,{viewport:{width:1024,height:640},hasTouch:true,
   userAgent:'Mozilla/5.0 (Linux; Android 13; Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'});
  const tablet=await boot(android);
  await tablet.locator('#projIn').setInputFiles({name:'Projeto TABLET.ccmgis',mimeType:'application/octet-stream',buffer:Buffer.from(JSON.stringify(fixture('TABLET',7)))});
  await tablet.waitForFunction(()=>S.projectId==='TABLET');const inputRecord=await persisted(tablet,'Projeto TABLET.ccmgis');
  assert.equal(inputRecord.nativeHandle,false);assert.ok(inputRecord.source.size>0);
  const tabletId=(await state(tablet)).tabId;await reload(tablet);
  assert.equal((await state(tablet)).tabId,tabletId);assert.equal((await state(tablet)).record.hasHandle,false);
  assert.equal(await tablet.locator('#gmTabReopen').isHidden(),true);
  assert.match(await tablet.locator('#gmTabResumeText').textContent(),/Selecione o arquivo novamente/);
  assert.notEqual((await content(tablet)).id,'TABLET');assert.deepEqual(await tablet.evaluate(()=>__qa.reads),[]);
  const chooser=tablet.waitForEvent('filechooser');await tablet.locator('#gmTabChoose').click();const fileChoice=await chooser;
  // Holding the input chooser without selecting a file must not load anything.
  assert.equal((await state(tablet)).record.name,'Projeto TABLET.ccmgis');
  assert.notEqual((await content(tablet)).id,'TABLET');assert.deepEqual(tablet.__errors,[]);assert.equal(tablet.__downloads||0,0);
  reports.push('Android simulado: input preserva só nome/metadados, recarga pede nova escolha, sem seleção não restaura cópia');
  await fileChoice.setFiles({name:'Projeto TABLET.ccmgis',mimeType:'application/octet-stream',buffer:Buffer.from(JSON.stringify(fixture('TABLET',8)))});
  await tablet.waitForFunction(()=>S.projectId==='TABLET');await selection(tablet,'Projeto TABLET.ccmgis');await ribbon(tablet,'Salvar');
  await tablet.waitForFunction(()=>!GeoMineSessionAutosave.state.writeActive&&GeoMineProjectTabSession.state().record?.hasHandle);
  assert.equal((await persisted(tablet,'Projeto TABLET.ccmgis')).nativeHandle,true);
  assert.equal(await tablet.evaluate(()=>__qa.events.at(-1).startIn),null,'Android não recebe hint desktop incompatível');
  await tablet.evaluate(data=>__qaWrite(data.projectFileName,data),fixture('TABLET',9));await reload(tablet);
  assert.equal((await state(tablet)).record.hasHandle,true);assert.deepEqual(await tablet.evaluate(()=>__qa.reads),[]);
  await clickReopen(tablet,'TABLET');assert.equal((await content(tablet)).features[0].props.REV,9);
  assert.deepEqual(tablet.__errors,[]);assert.equal(tablet.__downloads||0,0);
  reports.push('Android com Save picker disponível: clique grava handle nativo, recarga pode reabrir bytes atuais sem download');
  await android.close();
  console.log('PASS project tab session — full app / native OPFS (not real Drive):\n- '+reports.join('\n- '));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
