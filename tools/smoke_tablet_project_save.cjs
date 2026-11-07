// Full application, Android-emulated Chromium, in-memory writable destination.
// This proves UI/gesture/save integration, NOT a physical tablet or Drive provider.
// No account is opened and no user file is read or overwritten.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const UA='Mozilla/5.0 (Linux; Android 14; SM-X610) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const context=await browser.newContext({hasTouch:true,acceptDownloads:true,userAgent:UA,viewport:{width:1024,height:640}});
  const page=await context.newPage(),errors=[],consoleErrors=[],downloads=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push({text:m.text(),url:m.location().url});});
  await page.route(/^https?:/,r=>r.abort());
  await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'));
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineChannelLive&&window.GeoMineProjectSaveTarget);
  await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31982';S.projectId='tablet-save-smoke';startAutosave('tablet-channel.ccmgis',null);
   window.__log=[];const originalToast=toast;toast=(m,...a)=>{__log.push(String(m));return originalToast(m,...a);};
   window.__audit={picker:[],open:0,close:0,read:0,abort:0,verify:0,share:0,mode:'write',completed:0};
   window.__disk=new Blob([]);window.__writeHistory=[];
   window.__handle={kind:'file',name:'tablet-channel.ccmgis',queryPermission:async()=> 'granted',requestPermission:async()=> 'granted',
    async createWritable(){
     __audit.open++;const chunks=[];
     return {async write(data){chunks.push(new Uint8Array(data));},async close(){__disk=new Blob(chunks);__writeHistory.push(__disk);__audit.close++;},async abort(){__audit.abort++;}};
    },async getFile(){__audit.read++;return new File([__disk],this.name,{type:'application/octet-stream'});}
   };
   window.showSaveFilePicker=async options=>{
    const active=navigator.userActivation.isActive;__audit.picker.push({active,options});
    if(!active)throw new DOMException('Missing transient user activation','SecurityError');
    if(__audit.mode==='cancel')throw new DOMException('User canceled','AbortError');
    return __handle;
   };
   navigator.canShare=()=>true;navigator.share=async()=>{__audit.share++;};
   const save=saveProject;saveProject=async(...a)=>{try{return __audit.result=await save(...a);}finally{__audit.completed++;}};
   const data=projectData;projectData=(...a)=>window.__savedSnapshot=data(...a);
   const verify=GeoMineSaveVerification.verify;GeoMineSaveVerification.verify=async(...a)=>{__audit.verify++;return verify(...a);};
   const nc=141,nr=81,cs=.5,xll=499989.75,yll=7399979.75,z=new Float32Array(nc*nr);
   for(let r=0;r<nr;r++)for(let c=0;c<nc;c++)z[r*nc+c]=100+Math.abs(yll+(nr-r-.5)*cs-7400000);
   window.__raster={id:9942,name:'Synthetic native MDT',crs:S.workCRS,visible:false,style:{mode:'hipso'},d:{nc,nr,cs,csy:cs,xll,yll,z,zmin:100,zmax:120,native:true,resampled:1,srcCRS:S.workCRS}};S.rasters.push(__raster);
   window.__axis=addLayer({name:'Synthetic linked guide',gtype:'line',crs:S.workCRS,fields:[{name:'ID',type:'N'}],features:[{geom:[[500000,7400000],[500040,7400000]],props:{ID:1}}]});
   S.activeId=__axis.id;GeoMineChannelExtraction.open();
   window.__linked=()=>S.layers.filter(L=>L._channelLink);
  });
  assert.equal(await page.evaluate(()=>fsApiOK()),false,'import picker protection remains active on Android');
  assert.equal(await page.evaluate(()=>GeoMineProjectSaveTarget.available()),true);
  await page.locator('#chanRaster').selectOption('9942');await page.locator('#chanKindAgua').check();await page.locator('#chanMode').selectOption('depth');
  await page.locator('#chanHeight').fill('2.5');await page.locator('#chanInterval').fill('10');await page.locator('#chanReach').fill('20');
  assert.equal(await page.locator('#chanLive').isChecked(),true);
  await page.locator('#chanAnalyze').click();await page.waitForFunction(()=>!document.getElementById('chanAnalyze').disabled);
  assert.match(await page.locator('#chanStatus').textContent(),/Prévia pronta/);
  await page.locator('#chanCommit').click();await page.locator('#chanClose').click();
  await page.waitForFunction(()=>__linked().length===2&&__linked().every(L=>L._channelLink.entries.every(e=>e.state==='ready'))&&!GeoMineChannelLive.state().running);
  const clickSave=async(label='Salvar')=>{
   const count=await page.evaluate(()=>__audit.completed);
   await page.locator('.rbtn').filter({hasText:new RegExp('^'+label+'$')}).first().click();
   await page.waitForFunction(count=>__audit.completed>count,count);
  };
  const inspect=()=>page.evaluate(async()=>{
   const actual=new Uint8Array(await __disk.arrayBuffer()),expected=new Uint8Array(await projectBlobPorPartes(__savedSnapshot).arrayBuffer());
   return {audit:__audit,bytes:actual.length,exact:actual.length===expected.length&&actual.every((v,i)=>v===expected[i]),
    data:JSON.parse(await __disk.text()),sameHandle:GeoMineProjectFile.currentHandle()===__handle,dirty:GeoMineSessionAutosave.state.dirty,logs:__log};
  });
  await clickSave();const first=await inspect();
  assert.equal(first.audit.result,true);assert.equal(first.exact,true);assert.equal(first.sameHandle,true);assert.equal(first.dirty,false);
  assert.equal(first.audit.picker.length,1);assert.equal(first.audit.picker[0].active,true);
  assert.deepEqual(first.audit.picker[0].options,{suggestedName:'tablet-channel.ccmgis',excludeAcceptAllOption:false});
  assert.equal(first.audit.open,1);assert.equal(first.audit.close,1);assert.equal(first.audit.verify,1);assert.ok(first.audit.read>=1);
  assert.equal(first.audit.share,0);assert.equal(downloads.length,0);
  assert.equal(first.data.projectId,'tablet-save-smoke');assert.equal(first.data.layers.filter(L=>L._channelLink).length,2);
  assert.ok(first.data.layers.filter(L=>L._channelLink).every(L=>L._channelLink.entries.every(e=>e.state==='ready')));
  assert.equal(first.data.layers.find(L=>L.gtype==='polygon').features[0].multi,true);
  assert.equal(first.data.layers.find(L=>L.name==='Synthetic linked guide').features[0]._channelAxisId,first.data.layers.find(L=>L._channelLink)._channelLink.entries[0].axisKeys[0]);
  console.log('PASS Android-visible Save opens picker with transient activation, no desktop-only options; writes/verifies '+first.bytes+' exact bytes including live channel');
  await page.evaluate(()=>{__axis.features[0].geom[1][0]=500050;drawLayer(__axis);refreshUI();});
  await page.waitForFunction(()=>__linked().every(L=>L._channelLink.entries.every(e=>e.state==='ready'))&&!GeoMineChannelLive.state().running&&__linked().find(L=>L.gtype==='line').features.length===6);
  await clickSave();const second=await inspect();
  assert.equal(second.audit.result,true);assert.equal(second.exact,true);assert.equal(second.sameHandle,true);assert.equal(second.dirty,false);
  assert.equal(second.audit.picker.length,1,'second Save must reuse destination');assert.equal(second.audit.open,2);assert.equal(second.audit.close,2);assert.equal(second.audit.verify,2);
  assert.equal(second.data.layers.find(L=>L.name==='Synthetic linked guide').features[0].geom[1][0],500050);
  assert.equal(second.data.layers.find(L=>L._channelLink?.role==='sections').features.length,6);assert.equal(downloads.length,0);
  assert.notDeepEqual(second.data.layers,first.data.layers);
  console.log('PASS linked-guide edit updates both outputs; second visible Save reuses same handle and verifies changed bytes');
  await page.evaluate(()=>{__audit.mode='cancel';__log.length=0;});
  await clickSave('Salvar Como');const canceled=await inspect();
  assert.equal(canceled.audit.result,false);assert.equal(canceled.audit.picker.length,2);assert.equal(canceled.audit.picker[1].active,true);
  assert.equal(canceled.audit.open,2);assert.equal(canceled.audit.close,2);assert.equal(canceled.audit.verify,2);assert.equal(canceled.sameHandle,true);
  assert.equal(downloads.length,0);assert.deepEqual(canceled.data,second.data);assert.ok(canceled.logs.includes('Salvamento cancelado'));
  assert.ok(!canceled.logs.some(s=>/Projeto salvo|Projeto atualizado|Download iniciado/.test(s)));
  console.log('PASS canceled visible Save As neither writes nor downloads; existing destination and bytes preserved');
  await page.evaluate(()=>{delete window.showSaveFilePicker;startAutosave('tablet-channel.ccmgis',null);GeoMineSessionAutosave.markDirty('fallback test');__log.length=0;});
  assert.equal(await page.evaluate(()=>GeoMineProjectSaveTarget.available()),false);
  const [download]=await Promise.all([page.waitForEvent('download'),clickSave()]);
  const fallback=await page.evaluate(()=>({audit:__audit,dirty:GeoMineSessionAutosave.state.dirty,handle:!!GeoMineProjectFile.currentHandle(),logs:__log,delivery:S.auto.delivery}));
  assert.equal(fallback.audit.result,false);assert.equal(fallback.dirty,true);assert.equal(fallback.handle,false);assert.equal(fallback.delivery,'download-requested');
  assert.equal(fallback.audit.picker.length,2);assert.equal(fallback.audit.open,2);assert.equal(fallback.audit.share,0);assert.equal(downloads.length,1);
  assert.equal(download.suggestedFilename(),'tablet-channel.ccmgis');
  const downloaded=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(downloaded.projectId,'tablet-save-smoke');assert.equal(downloaded.layers.filter(L=>L._channelLink).length,2);
  assert.ok(fallback.logs.some(s=>s.includes('gravação ainda não está confirmada')));
  assert.ok(!fallback.logs.some(s=>/Projeto salvo|Projeto atualizado/.test(s)));
  console.log('PASS unavailable API downloads valid .ccmgis but leaves project unconfirmed/dirty, without share or false success');
  assert.deepEqual(errors,[]);
  const unexpectedConsole=consoleErrors.filter(e=>!(e.text.startsWith('Failed to load resource: net::ERR_FAILED')&&/^https?:/.test(e.url)));
  assert.deepEqual(unexpectedConsole,[]);
  console.log('PASS no application console/page errors ('+(consoleErrors.length-unexpectedConsole.length)+' expected blocked external-resource logs)');
  console.log('SIMULATION ONLY: Android UA/touch viewport + in-memory FileSystemHandle. Physical tablet/Google Drive provider still needs manual validation.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
