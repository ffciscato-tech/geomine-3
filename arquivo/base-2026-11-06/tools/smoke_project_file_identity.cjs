// Full offline application, isolated browser, in-memory file handles only.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route(/^https?:/,r=>r.abort());
  await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'));
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineProjectFile);
  await page.evaluate(()=>{
   S.setBase('Sem fundo');
   window.__fixture=id=>({app:'ALAGIS',v:1,workCRS:'EPSG:31982',projectId:id,projectMeta:{name:id},
    groups:[],rasters:[],plates:[],stack:['L:11'],layers:[{id:11,name:'Ponto',gtype:'point',crs:'EPSG:31982',visible:true,
    fields:[],features:[{geom:[[583800,7075000]],attrs:{value:1}}]}]});
   window.__events=[];window.__picker=0;window.__opens=0;
   window.__handle=(name,id)=>{
    let text=JSON.stringify(__fixture(id));
    const h={name,writes:0,permission:'granted',requests:0,
     async queryPermission(){__events.push('permission');return h.permission;},
     async requestPermission(){h.requests++;h.permission='granted';__events.push('request');return h.permission;},
     async getFile(){return new File([text],name,{type:'application/json'});},
     async createWritable(){h.writes++;let pieces=[];return {async write(p){pieces.push(p);},async close(){text=await new Blob(pieces).text();},async abort(){}};}
    };return h;
   };
   window.__a=__handle('Projeto A.ccmgis','A');window.__b=__handle('Projeto B.ccmgis','B');
   window.__dest=__a;window.showSaveFilePicker=async()=>{__picker++;if(__dest==='cancel')throw new DOMException('Cancelado','AbortError');return __dest;};
   window.showOpenFilePicker=async()=>{__opens++;return [__a];};
   window.__originalProjectData=projectData;window.projectData=function(){__events.push('snapshot');return __originalProjectData.apply(this,arguments);};
   loadProject(__fixture('NEW'));
  });
  // First save chooses a destination; repeated Save and the actual shortcut don't.
  await page.locator('#ribCats [data-cat-id="inicio"]').click();
  await page.locator('#ribbon .rbtn').filter({has:page.locator('span').filter({hasText:/^Salvar$/})}).click();
  await page.waitForFunction(()=>__a.writes===1&&!GeoMineSessionAutosave.state.writeActive);
  assert.equal(await page.locator('#a3OpenProjectName').textContent(),'Projeto A');
  assert.match(await page.title(),/^Projeto A — GeoMine/);
  assert.equal(await page.evaluate(()=>__picker),1);
  assert.equal(await page.evaluate(()=>saveProject(false)),true);
  await page.keyboard.press('Control+s');
  await page.waitForFunction(()=>__a.writes===3&&!GeoMineSessionAutosave.state.writeActive);
  assert.equal(await page.evaluate(()=>__picker),1);
  const permission=await page.evaluate(async()=>{__a.permission='prompt';__events.length=0;await saveProject(false);return {events:__events,requests:__a.requests};});
  assert.equal(permission.requests,1);assert.ok(permission.events.indexOf('request')<permission.events.indexOf('snapshot'));
  // A transient legacy handle reset cannot silently turn Save into Save As.
  assert.equal(await page.evaluate(async()=>{S.auto.handle=null;return saveProject(false);}),true);
  assert.equal(await page.evaluate(()=>__picker),1);
  // Cancelled Save As keeps the confirmed file and its name.
  assert.equal(await page.evaluate(async()=>{__dest='cancel';return saveProject(true);}),false);
  assert.equal(await page.locator('#a3OpenProjectName').textContent(),'Projeto A');
  assert.equal(await page.evaluate(()=>GeoMineProjectFile.currentHandle()===__a),true);
  assert.equal(await page.evaluate(async()=>{__dest=__b;return saveProject(true);}),true);
  assert.equal(await page.locator('#a3OpenProjectName').textContent(),'Projeto B');
  assert.equal(await page.evaluate(async()=>JSON.parse(await (await __b.getFile()).text()).projectFileName),'Projeto B.ccmgis');
  // Legacy ribbon route now uses the native opener, not the read-only input.
  await page.evaluate(()=>actClick('projIn'));
  await page.waitForFunction(()=>__opens===1&&S.auto.handle===__a);
  assert.equal(await page.locator('#a3OpenProjectName').textContent(),'Projeto A');
  const opened=await page.evaluate(async()=>{const before=__picker;await saveProject(false);return __picker===before;});assert.equal(opened,true);
  // Cloud-backed File snapshots may become unreadable after a successful close.
  // Retry only fresh read-back; never issue another write or report false success.
  const transient=await page.evaluate(async()=>{
   const original=__a.getFile.bind(__a),writes=__a.writes,pickers=__picker;let reads=0;
   __a.getFile=async()=>{const f=await original();reads++;if(reads>2)return f;
    return {size:f.size,slice(){return {async arrayBuffer(){throw new DOMException('The requested file could not be read','NotReadableError');}};}};};
   GeoMineSessionAutosave.markDirty('test');
   const ok=await saveProject(false);__a.getFile=original;
   return {ok,reads,writes:__a.writes-writes,pickers:__picker-pickers,dirty:GeoMineSessionAutosave.state.dirty,same:GeoMineProjectFile.currentHandle()===__a};
  });
  assert.deepEqual(transient,{ok:true,reads:3,writes:1,pickers:0,dirty:false,same:true});
  const persistent=await page.evaluate(async()=>{
   const original=__a.getFile.bind(__a),writes=__a.writes;let reads=0;
   __a.getFile=async()=>{reads++;throw new DOMException('The requested file could not be read','NotReadableError');};
   GeoMineSessionAutosave.markDirty('test');const ok=await saveProject(false);__a.getFile=original;
   return {ok,reads,writes:__a.writes-writes,dirty:GeoMineSessionAutosave.state.dirty,same:GeoMineProjectFile.currentHandle()===__a};
  });
  assert.deepEqual(persistent,{ok:false,reads:3,writes:1,dirty:true,same:true});
  assert.equal(await page.evaluate(()=>saveProject(false)),true);
  // Reopening identical IDs from an unrelated copy MUST detach the destination.
  assert.equal(await page.evaluate(()=>{loadProject(__fixture(S.projectId));return GeoMineProjectFile.currentHandle();}),null);
  // A file input knows the actual source filename, but has no write capability.
  const fixture=await page.evaluate(()=>__fixture('INPUT'));
  await page.locator('#projIn').setInputFiles({name:'Nome real recebido.ccmgis',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
  await page.waitForFunction(()=>S.auto.name==='Nome real recebido.ccmgis');
  assert.equal(await page.locator('#a3OpenProjectName').textContent(),'Nome real recebido');
  assert.equal(await page.evaluate(()=>GeoMineProjectFile.currentHandle()),null);
  // Download names display correctly but never pretend to confirm an overwrite.
  const fallback=await page.evaluate(async()=>{
   window.showSaveFilePicker=undefined;window.download=async(_blob,name)=>({status:'download-requested',name,verified:false});
   const ok=await saveProject(false);return {ok,name:S.auto.name,handle:S.auto.handle,dirty:GeoMineSessionAutosave.state.dirty,status:GeoMineProjectFile.status(),timer:S.auto.timer};
  });
  assert.equal(fallback.ok,false);assert.equal(fallback.handle,null);assert.equal(fallback.dirty,true);assert.equal(fallback.timer,null);
  assert.match(fallback.status,/não foi sobrescrito/);
  assert.equal(await page.locator('#a3OpenProjectName').textContent(),fallback.name.replace(/\.ccmgis$/i,''));
  assert.match(await page.title(),/GeoMine/);
  await page.locator('#fileIn').setInputFiles({name:'Projeto importado.ccmgis',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
  await page.waitForFunction(()=>S.auto.name==='Projeto importado.ccmgis');
  assert.equal(await page.locator('#a3OpenProjectName').textContent(),'Projeto importado');
  const unconfirmedCopy=await page.evaluate(async()=>{
   startAutosave(__a.name,__a);const ok=await saveProject(true);
   return {ok,name:S.auto.name,same:GeoMineProjectFile.currentHandle()===__a};
  });
  assert.deepEqual(unconfirmedCopy,{ok:false,name:'Projeto A.ccmgis',same:true});
  await page.locator('#a3ViewTabs').screenshot({path:path.resolve(__dirname,'../dist/project-file-name.png')});
  const visibility=await page.locator('#a3OpenProjectName').evaluate(e=>({width:e.getBoundingClientRect().width,clipped:e.scrollWidth>e.clientWidth+1}));
  assert.ok(visibility.width>0);assert.equal(visibility.clipped,false);
  assert.deepEqual(errors,[]);
  console.log('PASS full app: repeated Save, Ctrl+S, early permission, handle preservation, cancelled Save As, confirmed new destination, actual filename, legacy Open, isolated project generation, truthful download status, visible name and document title; no autosave');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
