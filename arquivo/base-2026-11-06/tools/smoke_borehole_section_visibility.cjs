// Full-app isolated QA. Private fixture is an argument, never changed or published.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const bundle=path.resolve(process.argv[2]||path.join(__dirname,'../dist/GeoMine.html'));
const fixture=path.resolve(process.argv[3]||process.env.GEOMINE_SECTION_FIXTURE||path.join(__dirname,'../../GeoMine-na-triangulation-20260922/fixtures/HidrogeologiaV2.ccmgis'));
const baseline=!!process.env.GEOMINE_BASELINE,hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const check=(page,id)=>page.locator('#gsecLayers input[data-layer="'+id+'"]');
async function summary(page){return page.evaluate(()=>{const q=S.geology.section,r=q.result;return {ids:q.layerIds,roles:q.roles,corridor:q.corridor,line:q.line,holes:r?.holes||[],warnings:r?.holeWarnings||[],out:document.getElementById('gsecOut')?.textContent,generated:!!r};});}
async function generate(page,corridor){if(corridor!=null){await page.locator('#gsecCorridor').fill(String(corridor));if(baseline)await page.locator('#gsecCorridor').press('Tab');}await page.locator('#gsecGenerate').click();return summary(page);}
async function openPanel(page){await page.evaluate(()=>GeoMineGeology.openSection());await page.locator('#gsecGenerate').waitFor({state:'visible'});}
async function importCampaign(page){
  const csv=await page.evaluate(()=>{const line=S.geology.section.line,a=line[0],b=line.at(-1),x=(a[0]+b[0])/2,y=(a[1]+b[1])/2;return {collar:'HOLEID;X;Y;Z;DEPTH\nNEW;'+x+';'+y+';500;120\nCOLLAR;'+(x+5)+';'+(y+5)+';480;\n',survey:'HOLEID;MD;AZIMUTH;DIP\nNEW;0;90;60\nNEW;120;130;70\n'};});
  await page.evaluate(()=>GeoMineGeology.boreholes.open());await page.locator('#gmBHUnits').check();
  for(const [role,text]of Object.entries(csv)){const chooser=page.waitForEvent('filechooser');await page.locator('#gmBHFile-'+role).click();await(await chooser).setFiles({name:role+'.csv',mimeType:'text/csv',buffer:Buffer.from(text)});}
  await page.locator('#gmBHCommit').click();await page.waitForFunction(()=>document.getElementById('gmBHCommit')?.dataset.state==='ready');
  assert.equal(await page.locator('#gmBHPreview tbody tr').count(),2);await page.locator('#gmBHCommit').click();await page.waitForFunction(()=>document.getElementById('gmBHCommit')?.dataset.state==='imported');
  const id=await page.evaluate(()=>S.activeId);assert.equal(await page.evaluate(id=>S.geology.section.layerIds.includes(String(id)),id),false,'ordinary import must not silently alter an existing section selection');await page.locator('#gmBHSection').click();return id;
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),errors=[],checks=[],beforeHash=hash(fixture);
try{const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route(/^https?:/,r=>r.abort());
  await page.goto('file://'+bundle,{waitUntil:'load'});await page.waitForFunction(()=>window.GeoMineGeology?.boreholes);
  await page.locator('#projIn').setInputFiles(fixture);await page.waitForFunction(()=>S.layers.some(l=>l.id===14&&l.name==='Sondagens'));
  for(let i=0;i<5;i++){if(await page.locator('[data-pf="no"]').isVisible())await page.locator('[data-pf="no"]').click();await page.waitForTimeout(150);}
  await openPanel(page);assert.equal(await check(page,14).isChecked(),true);
  const originals=await page.evaluate(()=>JSON.stringify(S.layers.find(l=>l.id===14).features));
  const narrow=await generate(page,100);assert.equal(narrow.generated,true);assert.equal(narrow.holes.length,0,'no hole should be moved into the 100 m corridor');
  let clickProbe=null;{
    await page.evaluate(()=>{window.__sectionClickEvents=[];for(const type of ['mousedown','mouseup','click','focusout','change'])document.addEventListener(type,e=>{if(['gsecCorridor','gsecGenerate'].includes(e.target.id)||['mousedown','mouseup','click'].includes(type)){const b=document.getElementById('gsecGenerate').getBoundingClientRect();__sectionClickEvents.push({type,target:e.target.id||e.target.className,x:e.clientX,y:e.clientY,button:{x:b.x,y:b.y,w:b.width,h:b.height},result:!!S.geology.section.result});}},true);});
    await page.locator('#gsecCorridor').fill('3000');await page.locator('#gsecGenerate').click();clickProbe=await page.evaluate(()=>({events:__sectionClickEvents,result:!!S.geology.section.result,corridor:S.geology.section.corridor}));
  }
  const wide=await generate(page,3000);
  await check(page,14).uncheck();await page.evaluate(()=>GeoMineGeology.refresh());const uncheckedSurvived=!(await check(page,14).isChecked());
  await check(page,14).check();await generate(page,3000);
  const importedId=await importCampaign(page),importSelected=await check(page,importedId).isChecked(),afterImport=await generate(page,3000);
  if(baseline){assert.equal(wide.holes.length,0);assert.equal(uncheckedSurvived,false);assert.equal(importSelected,false);assert.equal(afterImport.holes.some(h=>h.layerId===importedId),false);assert.equal(clickProbe.result,false,'baseline loses direct click after corridor edit');console.log(JSON.stringify({baselineReproduced:true,narrow:{holes:narrow.holes.length,warnings:narrow.warnings,out:narrow.out},wide:{holes:wide.holes.length,warnings:wide.warnings},uncheckedSurvived,importSelected,importedId,clickProbe},null,2));return;}
  assert.equal(clickProbe.result,true,'direct fill and click must generate without Tab or second click');assert.ok(clickProbe.events.some(e=>e.type==='click'&&e.target==='gsecGenerate'),'actual mouse click reaches Generate');checks.push('direct corridor edit and one Generate click retain button and generate');
  assert.match(narrow.warnings.join(' '),/fora.*corredor|corredor.*fora/i,'outside-corridor cause is explicit');assert.match(narrow.warnings.join(' '),/12/);
  assert.equal(wide.holes.length,12,JSON.stringify(wide));const originalFeatures=JSON.parse(originals);
  wide.holes.forEach(h=>{assert.equal(h.collarOnly,true);assert.equal(h.depth,null);assert.equal(h.trace.length,1);assert.equal(h.assumedVertical,false);const f=originalFeatures[h.feature],z=Number(f.props['Cota boca'].replace(',','.'));assert.ok(Math.abs(h.trace[0].z-z)<1e-8,'uses actual comma-decimal collar elevation');assert.deepEqual(h.intervals,[]);});
  checks.push('original corridor excludes 12 with cause; wide corridor shows 12 original collar elevations without invented depth');
  assert.equal(uncheckedSurvived,true,'explicit layer selection survives refresh');assert.equal(importSelected,true,'import button explicitly includes new borehole layer');
  const added=afterImport.holes.filter(h=>h.layerId===importedId);assert.equal(added.length,2);assert.ok(added.some(h=>h.trace.length>2&&h.depth===120));assert.ok(added.some(h=>h.collarOnly&&h.trace.length===1));checks.push('checkbox state persists and newly imported CSV is selected and drawn');
  assert.equal(await page.evaluate(()=>JSON.stringify(S.layers.find(l=>l.id===14).features)),originals,'no source data mutated');
  await page.locator('#gsecSave').click();const saved=await page.evaluate(()=>projectData()),savedIds=afterImport.ids;
  await page.locator('#projIn').setInputFiles({name:'qa-boreholes-section.ccmgis',mimeType:'application/octet-stream',buffer:Buffer.from(JSON.stringify(saved))});await page.waitForFunction(()=>S.auto.name==='qa-boreholes-section.ccmgis');
  for(let i=0;i<5;i++){if(await page.locator('[data-pf="no"]').isVisible())await page.locator('[data-pf="no"]').click();await page.waitForTimeout(150);}
  await openPanel(page);const reopened=await generate(page,3000);assert.deepEqual(reopened.ids,savedIds);assert.equal(reopened.holes.length,14);checks.push('native save and reopen preserve source choices and section holes');
  await page.locator('#gsecCanvas').scrollIntoViewIfNeeded();const canvasData=await page.locator('#gsecCanvas').evaluate(canvas=>canvas.toDataURL('image/png'));fs.writeFileSync(path.resolve(__dirname,'../borehole-section-final.png'),Buffer.from(canvasData.split(',')[1],'base64'));
  // The empty set is an explicit selection, not a request to reset defaults.
  const boxes=page.locator('#gsecLayers input[data-layer]');for(let i=0;i<await boxes.count();i++)await boxes.nth(i).uncheck();
  await page.evaluate(()=>GeoMineGeology.refresh());assert.deepEqual((await summary(page)).ids,[]);assert.equal(await page.locator('#gsecLayers input:checked').count(),0);
  await page.locator('#gsecSave').click();const empty=await page.evaluate(()=>projectData());await page.locator('#projIn').setInputFiles({name:'qa-empty-section-selection.ccmgis',mimeType:'application/octet-stream',buffer:Buffer.from(JSON.stringify(empty))});await page.waitForFunction(()=>S.auto.name==='qa-empty-section-selection.ccmgis');
  for(let i=0;i<5;i++){if(await page.locator('[data-pf="no"]').isVisible())await page.locator('[data-pf="no"]').click();await page.waitForTimeout(150);}
  await openPanel(page);assert.deepEqual((await summary(page)).ids,[]);assert.equal(await page.locator('#gsecLayers input:checked').count(),0);checks.push('explicit empty selection remains empty on refresh and native save/reopen');
  assert.equal(hash(fixture),beforeHash,'private original unchanged');assert.deepEqual(errors,[]);console.log(JSON.stringify({pass:true,checks,errors,clickProbe,fixtureHash:beforeHash,screenshot:path.resolve(__dirname,'../borehole-section-final.png')},null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
