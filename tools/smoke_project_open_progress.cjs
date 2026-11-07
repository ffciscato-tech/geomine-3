// Offline full-app QA. An isolated HTTPS origin permits real OPFS handles;
// every request is fulfilled locally or blocked. No user browser/profile used.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const APP='https://geomine-open-qa.test/GeoMine.html';
const appPath=process.env.APP_PATH||path.resolve(__dirname,'../dist/GeoMine.html');
const privateFixture=process.argv[2]||path.resolve(__dirname,'../fixture-Prospeccao.ccmgis');
const html=fs.readFileSync(appPath,'utf8'),reports=[];
const buildSHA=require('node:crypto').createHash('sha256').update(html).digest('hex');
const fixture=(id,revision=1)=>({app:'ALAGIS',v:1,workCRS:'EPSG:31982',projectId:id,
 projectMeta:{name:'TESTE CONTROLADO '+id},groups:[],rasters:[],plates:[],stack:['L:11'],
 layers:[{id:11,name:'TESTE CONTROLADO '+id,gtype:'polygon',crs:'EPSG:31982',visible:true,
  color:'#37c0aa',fields:[{name:'REV',type:'N'}],features:[{geom:[[500000,7400000,100],[500020,7400000,101],[500020,7400020,102],[500000,7400000,100]],
   zg:[100,101,102,100],props:{REV:revision,ORIGEM:id}}]}]});
function pass(message){reports.push(message);console.log('PASS '+message);}
async function configuredContext(browser,touch){
 const context=await browser.newContext({viewport:touch?{width:1280,height:800}:{width:1440,height:1000},hasTouch:touch,
  ...(touch?{userAgent:'Mozilla/5.0 (Linux; Android 14; SM-X610) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'}:{})});
 await context.route('**/*',r=>r.request().url()===APP?r.fulfill({contentType:'text/html',body:html}):r.abort());
 await context.addInitScript(()=>{
  window.GeoMineCloudProvider={user:{uid:'qa-progress-owner'}};
  window.__qa={mode:'real',reads:[],pickEvents:[],frames:[],loads:[],parses:[],accept:true};
  window.__qaHandle=async name=>(await navigator.storage.getDirectory()).getFileHandle(name,{create:true});
  window.__qaWrite=async(name,data)=>{const h=await __qaHandle(name),w=await h.createWritable();await w.write(typeof data==='string'?data:JSON.stringify(data));await w.close();return h;};
  window.showOpenFilePicker=async()=>{__qa.pickEvents.push({active:navigator.userActivation.isActive,name:__qa.next});return [await __qaHandle(__qa.next)];};
 });return context;
}
async function ready(page){
 await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineProjectOpenProgress&&window.GeoMineProjectTabSession);
 await page.evaluate(()=>GeoMineProjectTabSession.ready);
}
async function installHarness(page){
 await page.evaluate(()=>{
  S.setBase('Sem fundo');window.__qaReader=GeoMineProjectReader.read;
  GeoMineProjectReader.read=function(file,options={}){
   if(__qa.mode==='real')return __qaReader.call(this,file,options);
   return new Promise((resolve,reject)=>{
    const r={name:file.name,size:file.size,options,resolve,reject,aborted:false};__qa.reads.push(r);
    options.signal?.addEventListener('abort',()=>{r.aborted=true;},{once:true});
    options.onProgress?.({loaded:0,total:file.size,phase:'read',attempt:1});
   });
  };
  window.__qaObserve=()=>{
   const state=GeoMineProjectOpenProgress.state(),root=document.getElementById('gmLoadProgress'),bar=document.getElementById('gmLoadBar'),box=root?.getBoundingClientRect();
   return {...state,title:document.getElementById('gmLoadTitle')?.textContent,
    text:document.getElementById('gmLoadPercent')?.textContent,
    visible:!!root&&!root.hidden&&box.width>0&&box.height>0,
    determinate:bar?.hasAttribute('value'),value:bar?.value,projectId:S.projectId};
  };
  __qa.refreshes=0;const originalRefresh=window.refreshUI;window.refreshUI=function(){__qa.refreshes++;return originalRefresh.apply(this,arguments);};
  const originalLoad=window.loadProject;window.loadProject=function(data){
   const call={id:data.projectId,probe:__qaObserve(),frames:__qa.frames.slice(-12)},before=__qa.refreshes;
   if(__qa.trace)__qa.loads.push(call);
   try{return originalLoad.apply(this,arguments);}finally{call.refreshes=__qa.refreshes-before;}
  };
  const originalParse=JSON.parse;JSON.parse=function(text){
   if(__qa.trace&&typeof text==='string'&&text.length>50&&/"app"\s*:\s*"(?:ALAGIS|CCMGIS|CCMGeoCampo)"/.test(text.slice(0,1000)))
    __qa.parses.push({probe:__qaObserve(),frames:__qa.frames.slice(-12)});
   return originalParse.apply(this,arguments);
  };
  function observe(){if(__qa.trace){const q=__qaObserve();if(JSON.stringify(q)!==JSON.stringify(__qa.frames.at(-1)))__qa.frames.push(q);
    if(__qa.editDuringInterpret&&q.active&&/Interpretando/i.test(q.title)){
     __qa.editDuringInterpret=false;S.layers[0].features[0].props.REV=99;GeoMineSessionAutosave.markDirty('edição durante interpretação');__qa.editedState=__qaState();
    }
   }requestAnimationFrame(observe);}requestAnimationFrame(observe);
  window.__qaState=()=>({projectId:S.projectId,name:S.auto?.name,display:S.currentProjectName,
   handle:!!S.auto?.handle,expectedHandle:S.auto?.handle===__qa.baselineHandle,
   explicit:GeoMineProjectFile.currentHandle()===__qa.baselineHandle,
   layers:S.layers.map(l=>({id:l.id,name:l.name,features:l.features.map(f=>({geom:f.geom,zg:f.zg,props:f.props}))})),
   tab:GeoMineProjectTabSession.state().record});
  window.__qaDigest=async()=>{
   const d=projectData(),data={layers:d.layers.map(l=>({id:l.id,name:l.name,gtype:l.gtype,crs:l.crs,fields:l.fields,groupId:l.groupId,features:l.features})),
    rasters:d.rasters,groups:d.groups,workCRS:d.workCRS,projectId:d.projectId};
   const bytes=new TextEncoder().encode(JSON.stringify(data)),hash=await crypto.subtle.digest('SHA-256',bytes);
   return {sha:[...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join(''),bytes:bytes.length,
    layers:d.layers.length,features:d.layers.reduce((n,l)=>n+l.features.length,0),rasters:d.rasters.length};
  };
 });
}
async function baseline(page){
 await page.evaluate(async data=>{
  __qa.mode='real';__qa.trace=false;GeoMineProjectOpenProgress.cancel?.();
  window.__qa.baselineHandle=await __qaWrite('BASE.ccmgis',data);loadProject(data);startAutosave('BASE.ccmgis',__qa.baselineHandle);
  __qa.reads=[];__qa.frames=[];__qa.loads=[];__qa.parses=[];
 },fixture('BASE'));
 await page.waitForTimeout(30);return page.evaluate(()=>__qaState());
}
async function input(page,id){
 await page.locator('#projIn').setInputFiles({name:id+'.ccmgis',mimeType:'application/octet-stream',buffer:Buffer.from(JSON.stringify(fixture(id)))});
}
async function frames(page){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function gate(page){await page.evaluate(()=>{__qa.mode='gate';__qa.trace=true;});}
async function waitRead(page,name){await page.waitForFunction(name=>__qa.reads.some(r=>r.name===name),name);}
async function progress(page,name,fraction){await page.evaluate(({name,fraction})=>{const r=__qa.reads.findLast(r=>r.name===name);r.options.onProgress?.({loaded:Math.floor(r.size*fraction),total:r.size,phase:'read',attempt:1});},{name,fraction});await frames(page);}
async function resolveRead(page,name,data){await page.evaluate(({name,data})=>{const r=__qa.reads.findLast(r=>r.name===name);r.options.onProgress?.({loaded:r.size,total:r.size,phase:'read',attempt:1});r.resolve(JSON.stringify(data));},{name,data});}
async function ribbon(page,label){await page.locator('#ribCats [data-cat-id="inicio"]').click();const b=page.locator('#ribbon .rbtn').filter({has:page.locator('span').filter({hasText:new RegExp('^'+label+'$')})});assert.equal(await b.count(),1);await b.click();}

async function probe(page){return page.evaluate(()=>__qaObserve());}
async function opened(page,id){await page.waitForFunction(id=>S.projectId===id&&!GeoMineProjectOpenProgress.state().active,id);await frames(page);}
async function stopped(page){await page.waitForFunction(()=>!GeoMineProjectOpenProgress.state().active);await frames(page);}
async function capture(page,name){
 const out=path.resolve(__dirname,'../resultados');fs.mkdirSync(out,{recursive:true});
 await page.evaluate(()=>{
  let e=document.getElementById('qaProgressLabel');if(!e){e=document.createElement('div');e.id='qaProgressLabel';document.body.append(e);}
  e.textContent='TESTE CONTROLADO · leitura artificialmente pausada · projeto atual preservado';
  e.style.cssText='position:fixed;top:190px;left:50%;transform:translateX(-50%);z-index:19000;background:#112738;color:#fff;border:1px solid #38bdb0;padding:8px 14px;border-radius:6px;font:13px system-ui;pointer-events:none';
 });await frames(page);await page.screenshot({path:path.join(out,name)});
 await page.evaluate(()=>document.getElementById('qaProgressLabel')?.remove());
}
function assertPhases(trace){
 assert.ok(trace.parses.length,'project JSON parsed through the visible phase');assert.ok(trace.loads.length,'project mounted');
 for(const p of trace.parses){assert.equal(p.probe.active,true);assert.equal(p.probe.visible,true);assert.equal(p.probe.determinate,false);assert.match(p.probe.title,/interpret|valid|analis/i);
  assert.ok(p.frames.some(f=>f.visible&&!f.determinate&&/interpret|valid|analis/i.test(f.title)),'interpretation phase painted in a previous animation frame');}
 for(const p of trace.loads){assert.equal(p.probe.active,true);assert.equal(p.probe.visible,true);assert.equal(p.probe.determinate,false);assert.match(p.probe.title,/mont|desenh|prepar/i);
  assert.ok(p.frames.some(f=>f.visible&&!f.determinate&&/mont|desenh|prepar/i.test(f.title)),'mounting phase painted before synchronous load');}
}
(async()=>{
 console.log('BUILD '+buildSHA);
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  for(const touch of [true,false]){
   const context=await configuredContext(browser,touch),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>page.__dismiss?d.dismiss():d.accept());
   await page.goto(APP);await ready(page);await installHarness(page);
   const label=touch?'Android UA/toque':'desktop';
   let before=await baseline(page);await gate(page);await input(page,'STALLED');await waitRead(page,'STALLED.ccmgis');await frames(page);
   let p=await probe(page);assert.equal(p.active,true);assert.equal(p.visible,true);assert.deepEqual(await page.evaluate(()=>__qaState()),before);
   await progress(page,'STALLED.ccmgis',.25);p=await probe(page);assert.equal(p.determinate,true);assert.ok(Math.abs(p.value-.25)<.02);assert.match(p.text,/25|24/);
   const progressBounds=await page.locator('#gmLoadProgress').boundingBox();assert.ok(progressBounds.y>=0&&progressBounds.y+progressBounds.height<=page.viewportSize().height,'progress fully visible');
   await capture(page,touch?'project-open-progress-tablet-synthetic-1280x800.png':'project-open-progress-desktop-synthetic-1440x1000.png');
   await page.locator('#cmdStatusCancel').click();await stopped(page);assert.deepEqual(await page.evaluate(()=>__qaState()),before);
   assert.equal(await page.evaluate(()=>__qa.reads[0].aborted),true,'cancel signal reaches reader');
   await resolveRead(page,'STALLED.ccmgis',fixture('STALLED'));await frames(page);assert.deepEqual(await page.evaluate(()=>__qaState()),before);
   pass(`${label}: stalled read visible, actual byte fraction, cancel keeps data/destination and ignores late completion`);

   before=await baseline(page);await gate(page);await input(page,'FAIL');await waitRead(page,'FAIL.ccmgis');
   await page.evaluate(()=>__qa.reads.at(-1).reject(new DOMException('Falha sintética do provedor','NotReadableError')));await stopped(page);
   assert.deepEqual(await page.evaluate(()=>__qaState()),before);pass(`${label}: read failure preserves current project and writable destination`);

   before=await baseline(page);await gate(page);await input(page,'OLD');await waitRead(page,'OLD.ccmgis');await input(page,'NEWER');await waitRead(page,'NEWER.ccmgis');
   await progress(page,'NEWER.ccmgis',.5);const newer=await probe(page);
   await page.evaluate(()=>{hideLoad();GeoMineLoadProgress.end();GeoMineLoadProgress.show('Callback nativo antigo 99%');});
   await progress(page,'OLD.ccmgis',1);await frames(page);const preserved=await probe(page);
   assert.equal(preserved.active,true);assert.equal(preserved.visible,true);assert.equal(preserved.title,newer.title);assert.equal(preserved.value,newer.value);
   await resolveRead(page,'OLD.ccmgis',fixture('OLD'));await frames(page);assert.deepEqual(await page.evaluate(()=>__qaState()),before);
   await resolveRead(page,'NEWER.ccmgis',fixture('NEWER'));await opened(page,'NEWER');
   const trace=await page.evaluate(()=>({parses:__qa.parses,loads:__qa.loads}));assertPhases(trace);assert.deepEqual(trace.loads.map(c=>c.id),['NEWER']);
   pass(`${label}: newer open wins; old progress/hideLoad/native callbacks cannot erase its lane; parse/mount paint before work`);

   await baseline(page);await gate(page);await input(page,'PREVIOUS');await waitRead(page,'PREVIOUS.ccmgis');
   await page.evaluate(async data=>{await GeoMineSessionAutosave.prepareNewProject();loadProject(data);startAutosave('NOVO.ccmgis',null);},fixture('NOVO'));
   const newState=await page.evaluate(()=>__qaState());await resolveRead(page,'PREVIOUS.ccmgis',fixture('PREVIOUS'));await stopped(page);
   assert.deepEqual(await page.evaluate(()=>__qaState()),newState);assert.equal(newState.projectId,'NOVO');assert.equal(newState.handle,false);
   pass(`${label}: new-project transition invalidates pending open, without restoring its old file destination`);

   await baseline(page);await gate(page);await input(page,'WAITING_IDB');await waitRead(page,'WAITING_IDB.ccmgis');
   await page.evaluate(()=>{
    const original=idbSet;window.__qaOriginalIDB=original;
    window.idbSet=function(key,value){if(String(key).startsWith('projectTabSession:'))return new Promise((resolve,reject)=>{__qa.pendingIDB=()=>Promise.resolve(original(key,value)).then(resolve,reject);});return original.apply(this,arguments);};
    window.__newPending=GeoMineSessionAutosave.prepareNewProject();
   });
   await page.waitForFunction(()=>!!__qa.pendingIDB);assert.equal((await probe(page)).active,false,'new-project click cancels open before slow IndexedDB finishes');
   const duringIDB=await page.evaluate(()=>__qaState());await resolveRead(page,'WAITING_IDB.ccmgis',fixture('WAITING_IDB'));await frames(page);assert.deepEqual(await page.evaluate(()=>__qaState()),duringIDB);
   await page.evaluate(async()=>{window.idbSet=__qaOriginalIDB;await __qa.pendingIDB();await __newPending;__qa.pendingIDB=null;});
   assert.equal(await page.evaluate(()=>S.projectId),'BASE');pass(`${label}: new-project cancellation is immediate while tab-reference IndexedDB write is stalled`);

   await baseline(page);await gate(page);page.__dismiss=true;await page.evaluate(()=>GeoMineSessionAutosave.markDirty('teste de confirmação'));
   before=await page.evaluate(()=>__qaState());await input(page,'DECLINED');await waitRead(page,'DECLINED.ccmgis');await resolveRead(page,'DECLINED.ccmgis',fixture('DECLINED'));await stopped(page);
   assert.deepEqual(await page.evaluate(()=>__qaState()),before);page.__dismiss=false;pass(`${label}: refusing dirty-project replacement preserves data and destination`);

   await baseline(page);await gate(page);
   await page.evaluate(data=>{window.__importing=handleFiles([new File([JSON.stringify(data)],'IMPORTED.ccmgis',{type:'application/octet-stream'})]);},fixture('IMPORTED'));
   await waitRead(page,'IMPORTED.ccmgis');await progress(page,'IMPORTED.ccmgis',.5);assert.equal((await probe(page)).visible,true);
   await resolveRead(page,'IMPORTED.ccmgis',fixture('IMPORTED'));await opened(page,'IMPORTED');assert.equal(await page.evaluate(()=>S.auto.handle),null);
   assertPhases(await page.evaluate(()=>({parses:__qa.parses,loads:__qa.loads})));pass(`${label}: import/drop shared handleFiles route uses compatible reader and phased opening`);

   await baseline(page);await gate(page);page.__dismiss=true;await page.evaluate(()=>GeoMineSessionAutosave.markDirty('teste importação negada'));
   before=await page.evaluate(()=>__qaState());await page.evaluate(data=>{
    const followup={type:'FeatureCollection',features:[{type:'Feature',properties:{NAO_IMPORTAR:true},geometry:{type:'Point',coordinates:[-51,-23]}}]};
    window.__importing=handleFiles([new File([JSON.stringify(data)],'DECLINED_IMPORT.ccmgis'),new File([JSON.stringify(followup)],'NAO_IMPORTAR.geojson')]);
   },fixture('DECLINED_IMPORT'));
   await waitRead(page,'DECLINED_IMPORT.ccmgis');await resolveRead(page,'DECLINED_IMPORT.ccmgis',fixture('DECLINED_IMPORT'));await stopped(page);await page.evaluate(()=>__importing);
   assert.deepEqual(await page.evaluate(()=>__qaState()),before);assert.equal(await page.evaluate(()=>__qa.loads.length),0);page.__dismiss=false;
   pass(`${label}: declining imported-project replacement preserves the destination and aborts remaining files`);

   if(!touch){
    await baseline(page);await page.evaluate(async data=>{await __qaWrite('HANDLE.ccmgis',data);__qa.next='HANDLE.ccmgis';},fixture('HANDLE'));
    await gate(page);await ribbon(page,'Abrir');await waitRead(page,'HANDLE.ccmgis');assert.equal(await page.evaluate(()=>__qa.pickEvents.at(-1).active),true);
    await resolveRead(page,'HANDLE.ccmgis',fixture('HANDLE'));await opened(page,'HANDLE');
    assert.equal(await page.evaluate(()=>S.auto.handle?.name),'HANDLE.ccmgis');assertPhases(await page.evaluate(()=>({parses:__qa.parses,loads:__qa.loads})));
    await page.waitForFunction(()=>GeoMineProjectTabSession.state().handlePersisted);await page.reload();await ready(page);await installHarness(page);
    assert.equal(await page.locator('#gmTabReopen').count(),1);await gate(page);await page.locator('#gmTabReopen').click();await waitRead(page,'HANDLE.ccmgis');
    assert.equal((await probe(page)).visible,true);await resolveRead(page,'HANDLE.ccmgis',fixture('HANDLE',2));await opened(page,'HANDLE');
    assert.equal(await page.evaluate(()=>S.layers[0].features[0].props.REV),2);assert.equal(await page.evaluate(()=>S.auto.handle?.name),'HANDLE.ccmgis');
    assertPhases(await page.evaluate(()=>({parses:__qa.parses,loads:__qa.loads})));pass('desktop: real OPFS picker and tab reopen use progress, current file bytes and correct native destination');
   }

   // Recovery uses the actual persisted draft picker, not a fake load call.
   await baseline(page);await page.evaluate(async data=>{
    await idbSet(autosaveStorageKey(S.projectId),{txt:JSON.stringify(data),name:'RECOVERY.ccmgis',projectId:S.projectId,ownerUid:'qa-progress-owner',at:Date.now()});
    __qa.trace=true;__qa.frames=[];__qa.parses=[];__qa.loads=[];
   },fixture('RECOVERY'));
   await page.evaluate(()=>{window.__recovering=recuperarAutosave();});await page.locator('#gmSessaoModal [data-rec]').first().click();await opened(page,'RECOVERY');
   assert.equal(await page.evaluate(()=>S.auto.handle),null);assert.equal(await page.evaluate(()=>GeoMineSessionAutosave.state.dirty),true);
   assertPhases(await page.evaluate(()=>({parses:__qa.parses,loads:__qa.loads})));pass(`${label}: recovery picker paints phases and detaches old writable destination`);

   await baseline(page);await page.evaluate(async data=>{
    await idbSet(autosaveStorageKey(S.projectId),{txt:JSON.stringify(data),name:'STALE_RECOVERY.ccmgis',projectId:S.projectId,ownerUid:'qa-progress-owner',at:Date.now()+1000});
    __qa.trace=true;__qa.frames=[];__qa.parses=[];__qa.loads=[];__qa.editedState=null;__qa.editDuringInterpret=true;
   },fixture('STALE_RECOVERY'));
   await page.evaluate(()=>{window.__recovering=recuperarAutosave();});await page.locator('#gmSessaoModal [data-rec]').first().click();await stopped(page);
   assert.ok(await page.evaluate(()=>!!__qa.editedState),'edit injected in a real interpretation frame');
   assert.deepEqual(await page.evaluate(()=>__qaState()),await page.evaluate(()=>__qa.editedState));assert.equal(await page.evaluate(()=>__qa.loads.length),0);
   pass(`${label}: editing while recovery parses prevents replacement and preserves the edit/destination`);

   if(touch){
    const text=fs.readFileSync(privateFixture,'utf8');
    const expected=await page.evaluate(async text=>{__qa.trace=false;__qa.mode='real';loadProject(JSON.parse(text));return __qaDigest();},text);
    await baseline(page);await page.evaluate(()=>{__qa.trace=true;__qa.mode='real';});
    await page.locator('#projIn').setInputFiles(privateFixture);
    await page.waitForFunction(name=>S.auto?.name===name&&!GeoMineProjectOpenProgress.state().active,path.basename(privateFixture),{timeout:120000});
    const actual=await page.evaluate(()=>__qaDigest());assert.deepEqual(actual,expected);
    const trace=await page.evaluate(()=>({parses:__qa.parses,loads:__qa.loads}));assertPhases(trace);assert.equal(trace.loads.length,1);assert.equal(trace.loads[0].refreshes,1,'loadProject refreshes once synchronously');
    const normalPlateRefresh=await page.evaluate(()=>{const before=__qa.refreshes;plateApply(S.plates.find(p=>p.id===S.plateId)||S.plates[0]);return __qa.refreshes-before;});assert.ok(normalPlateRefresh>=1,'ordinary plateApply retains refresh');
    pass(`real local project: ${actual.layers} layers/${actual.features} features/${actual.rasters} raster, geometry/attributes/raster SHA matches direct-load baseline; one mount refresh, normal plate refresh retained`);
   }
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log(JSON.stringify({buildSHA,passed:reports.length,reports},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
