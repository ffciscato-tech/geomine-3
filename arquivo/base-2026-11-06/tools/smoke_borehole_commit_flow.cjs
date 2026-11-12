// Isolated real-browser QA for the read -> preview -> explicit commit boundary.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const bundle=path.resolve(process.argv[2]||path.join(__dirname,'../dist/GeoMine.html'));
const file=(name,text)=>({name,mimeType:'text/csv',buffer:Buffer.from(text)});
const collars=file('collar_15.csv','hole_id;x;y;z;max_depth;campaign\n'+Array.from({length:15},(_,i)=>`BH${String(i+1).padStart(2,'0')};${583000+i*20};7074000;${300+i};100;Campanha QA`).join('\n')+'\n');
const surveys=(bad=false)=>file(bad?'survey_invalido_30.csv':'survey_30.csv','hole_id;depth;azimuth;dip\n'+Array.from({length:15},(_,i)=>[0,100].map(md=>`BH${String(i+1).padStart(2,'0')};${md};90;${bad&&i===0&&md===100?120:60}`).join('\n')).join('\n')+'\n');
const closeTo=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-5,`${label}: ${a} != ${b}`);
const imported=page=>page.evaluate(()=>S.layers.filter(L=>L._geology?.importedBoreholes).map(L=>({id:L.id,crs:L.crs,name:L.name,features:L.features})));
const action=page=>page.locator('#gmBHActionStatus');
async function idle(page){await page.waitForFunction(()=>document.getElementById('gmBHCancel')?.hidden&&document.getElementById('gmBHRead')&&!document.getElementById('gmBHRead').disabled);}
async function choose(page,survey=surveys()){
  for(const [selector,payload] of [['#gmBHFile-collar',collars],['#gmBHFile-survey',survey]]){
    const event=page.waitForEvent('filechooser');await page.locator(selector).click();await (await event).setFiles(payload);
  }
}
async function read(page){await page.locator('#gmBHRead').click();await page.locator('.gm-bh-table').nth(1).waitFor();await idle(page);
  const headings=await page.locator('.gm-bh-table h3').allTextContents();assert.ok(headings.some(s=>/15 linhas/.test(s))&&headings.some(s=>/30 linhas/.test(s)),'15 collar rows and 30 survey rows read');}
async function preview(page,button='#gmBHCommit',doubleClick=false){
  if(doubleClick)await page.locator(button).dblclick({delay:300});else await page.locator(button).click();
  await page.waitForFunction(()=>document.querySelector('#gmBHPreview tbody tr')||document.querySelector('#gmBHActionStatus')?.classList.contains('error'));await idle(page);
  assert.equal(await page.locator('#gmBHPreview tbody tr').count(),15,await action(page).textContent());
  assert.match(await page.locator('#gmBHCommit').textContent(),/Confirmar importação/i);
  assert.deepEqual(await imported(page),[],'preview must not create any project layer');
  assert.equal(await page.locator('#gmBHCommit').isEnabled(),true);await page.locator('#gmBHViewer canvas').waitFor({state:'visible'});
}
async function holdWorkerMessages(page){
  await page.evaluate(()=>{
    window.__heldMessages=[];window.__terminatedWorkers=0;window.__workerBeforeHold=window.Worker;
    window.Worker=class{
      constructor(...args){this.real=new __workerBeforeHold(...args);this.closed=false;
        this.real.onmessage=event=>__heldMessages.push(()=>{if(!this.closed)this.onmessage?.(event);});
        this.real.onerror=event=>this.onerror?.(event);
      }
      postMessage(...args){this.real.postMessage(...args);}
      terminate(){this.closed=true;__terminatedWorkers++;this.real.terminate();}
    };
  });
}
async function visibleStatus(page,pattern){
  await page.waitForFunction(()=>document.getElementById('gmBHCancel')?.hidden);assert.match(await action(page).textContent(),pattern);
  assert.equal(await action(page).isVisible(),true);const b=await action(page).boundingBox(),v=page.viewportSize();
  assert.ok(b&&b.x>=0&&b.y>=0&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1,'footer status visible without scrolling');
}
async function visual(page,prefix){
  const evidence=[];
  for(const [name,viewport] of [['desktop',{width:1440,height:1000}],['tablet-landscape',{width:1024,height:768}],['tablet-portrait',{width:768,height:1024}]]){
    await page.setViewportSize(viewport);
    for(const scroll of [0,1]){
      await page.locator('.gm-bh-body').evaluate((body,bottom)=>body.scrollTop=bottom?body.scrollHeight:0,scroll);
      const sizes=await page.evaluate(()=>{const m=document.querySelector('.gm-bh-modal'),b=document.querySelector('.gm-bh-body'),f=m.querySelector('footer'),s=document.getElementById('gmBHActionStatus'),c=document.getElementById('gmBHCommit');
        const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:e.clientWidth,scroll:e.scrollWidth};};return {modal:box(m),body:box(b),footer:box(f),status:box(s),commit:box(c)};});
      for(const key of ['modal','footer','status','commit']){const r=sizes[key];assert.ok(r.x>=-1&&r.y>=-1&&r.right<=viewport.width+1&&r.bottom<=viewport.height+1,`${name}/${scroll}: ${key} outside viewport: `+JSON.stringify(r));}
      assert.ok(sizes.body.scroll<=sizes.body.width+1,`${name}: body horizontal overflow`);assert.ok(sizes.status.scroll<=sizes.status.width+1,`${name}: footer message clipped horizontally`);
      await page.locator('#gmBHCommit').click({trial:true});evidence.push({name,scroll,sizes});
    }
    if(prefix)await page.locator('.gm-bh-modal').screenshot({path:prefix+'-'+name+'.png'});
  }
  await page.setViewportSize({width:1440,height:1000});return evidence;
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),errors=[],checks=[];
  async function setup(){
    const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.route(/^https?:/,route=>route.abort());await page.goto('file://'+bundle,{waitUntil:'load'});await page.waitForFunction(()=>window.GeoMineGeology?.boreholes&&window.GeoMineBoreholeReader);
    await page.evaluate(()=>{S.workCRS='EPSG:31982';S.setBase('Sem fundo');window.__workers=0;const Original=window.Worker;window.Worker=class extends Original{constructor(...args){super(...args);__workers++;}};});
    await page.locator('.ribcat[data-cat-id="geologia"]').click();await page.locator('.rbtn').filter({hasText:'Furos · CSV'}).click();await page.locator('#gmBoreholeModal').waitFor({state:'visible'});return page;
  }
  try{
    let page=await setup();await choose(page);await read(page);
    if(process.env.GEOMINE_BASELINE){assert.equal(await page.locator('#gmBHCommit').isDisabled(),true);assert.deepEqual(await imported(page),[]);console.log(JSON.stringify({baselineReproduced:true,collars:15,surveys:30,importDisabled:true,status:await page.locator('#gmBHStatus').textContent()},null,2));await page.close();return;}
    // The user's exact read-first state no longer ends in an unexplained disabled button.
    assert.equal(await page.locator('#gmBHCommit').isEnabled(),true);assert.match(await page.locator('#gmBHCommit').textContent(),/Importar no projeto/i);
    await page.locator('#gmBHCommit').click();await idle(page);await visibleStatus(page,/Confirme.*CRS.*metros/i);assert.deepEqual(await imported(page),[]);
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'gmBHUnits','units checkbox receives focus');
    await page.locator('#gmBHUnits').check();await preview(page);
    assert.ok(await page.evaluate(()=>__workers)>=2,'real CSV parser and desurvey workers ran');checks.push('read-first validates into preview');
    const screenshots=process.env.GEOMINE_SCREENSHOT_PREFIX||path.resolve(__dirname,'../borehole-commit-preview');await visual(page,screenshots);
    await page.locator('#gmBHName').fill('Campanha renomeada antes da confirmação');
    await page.locator('#gmBHCommit').dblclick();await page.waitForFunction(()=>S.layers.filter(L=>L._geology?.importedBoreholes).length===1);
    let layers=await imported(page);assert.equal(layers.length,1);assert.equal(layers[0].features.length,15);assert.equal(layers[0].crs,'EPSG:31982');assert.equal(layers[0].name,'Campanha renomeada antes da confirmação','name blur must not cancel confirmation');
    for(let i=0;i<15;i++){
      const h=layers[0].features.find(f=>f.props.ID_FURO===`BH${String(i+1).padStart(2,'0')}`);assert.ok(h);assert.equal(h.props.campaign,'Campanha QA');assert.equal(h.props.PROF_M,100);
      assert.deepEqual(h.geom,[[583000+i*20,7074000]]);assert.deepEqual(h.zg,[300+i]);assert.equal(h.boreholeSurvey.length,2);
      closeTo(h.boreholeTrace.at(-1).x,583050+i*20,'deviated easting');closeTo(h.boreholeTrace.at(-1).y,7074000,'northing');closeTo(h.boreholeTrace.at(-1).z,300+i-100*Math.sin(Math.PI/3),'elevation');
      assert.deepEqual(h.boreholeSource.files,['collar_15.csv','survey_30.csv']);
    }
    if(!await page.locator('#gmBHCommit').count()){
      console.error('DOUBLECLICK_DEBUG',await page.evaluate(()=>({modal:!!document.getElementById('gmBoreholeModal'),sectionVisible:!!document.getElementById('gsecGenerate')?.getBoundingClientRect().height,view:S.view,activeId:S.activeId,toast:document.getElementById('toast')?.textContent})));
      await page.screenshot({path:path.resolve(__dirname,'../borehole-doubleclick-debug.png')});throw new Error('Import dialog unexpectedly closed after real confirmation double-click');
    }
    assert.equal(await page.locator('#gmBHCommit').isDisabled(),true);assert.match(await page.locator('#gmBHCommit').textContent(),/Importado/i);await visibleStatus(page,/15.*importado/i);
    await page.locator('#gmBHCommit').evaluate(e=>e.dispatchEvent(new MouseEvent('click',{bubbles:true})));assert.equal((await imported(page)).length,1,'disabled or repeated events cannot import twice');checks.push('single explicit commit imports 15 correct holes');await page.close();

    for(const viewport of [{width:1024,height:768},{width:768,height:1024}]){
      page=await setup();await choose(page);await page.locator('#gmBHUnits').check();await page.setViewportSize(viewport);await preview(page);
      await page.locator('#gmBHCommit').dblclick();await page.waitForFunction(()=>S.layers.filter(L=>L._geology?.importedBoreholes).length===1);
      assert.equal(await page.locator('#gmBoreholeModal').count(),1,`${viewport.width}×${viewport.height}: double-click must not navigate away`);
      assert.equal(await page.locator('#gmBHCommit').getAttribute('data-state'),'imported');assert.equal((await imported(page))[0].features.length,15);await visibleStatus(page,/15.*importado/i);await page.close();
    }
    checks.push('tablet landscape and portrait double-click stay in imported dialog');

    page=await setup();await choose(page);await page.locator('#gmBHUnits').check();await preview(page,'#gmBHCommit',true);assert.equal(await page.locator('.gm-bh-table').count(),2,'direct import reads and validates in one action');
    await page.locator('#gmBHCommit').evaluate(e=>e.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:2})));assert.deepEqual(await imported(page),[],'second click of validation double-click cannot confirm ready preview');
    await page.locator('#gmBHDip').selectOption('zenith');assert.equal(await page.locator('#gmBHPreview tbody tr').count(),0,'editing scientific configuration invalidates preview');assert.match(await page.locator('#gmBHCommit').textContent(),/Importar no projeto/i);
    await preview(page,'#gmBHValidate');await visibleStatus(page,/prévia|valid|pronto|confir/i);checks.push('direct action and conventional validation, input invalidation');
    await page.evaluate(()=>loadProject(JSON.parse(JSON.stringify(projectData()))));await page.locator('#gmBHCommit').click();await visibleStatus(page,/projeto|Valide novamente/i);assert.deepEqual(await imported(page),[],'preview from previous project cannot commit');checks.push('project-change guard visible');await page.close();

    page=await setup();await choose(page,surveys(true));await page.locator('#gmBHUnits').check();await page.locator('#gmBHCommit').click();await idle(page);await visibleStatus(page,/inclina|dip|90|120/i);assert.deepEqual(await imported(page),[]);assert.equal(await page.locator('#gmBHPreview tbody tr').count(),0);assert.equal(await page.locator('#gmBHCommit').isEnabled(),true,'invalid survey can be corrected and retried');checks.push('invalid survey visible and atomic');await page.close();

    page=await setup();await choose(page);await page.locator('#gmBHUnits').check();await page.locator('#gmBHCRS').evaluate(e=>{e.value='';e.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.locator('#gmBHCommit').click();await idle(page);await visibleStatus(page,/CRS|coordenadas|projetado/i);assert.deepEqual(await imported(page),[]);assert.equal(await page.evaluate(()=>document.activeElement?.id),'gmBHCRS','missing CRS receives focus');checks.push('missing CRS guard visible');await page.close();

    page=await setup();await choose(page);await page.locator('#gmBHUnits').check();await page.evaluate(()=>{window.__previousCollaboration=window.GeoMineCollaboration;window.GeoMineCollaboration={snapshot:()=>({roomId:'synthetic-readonly-room'})};});
    await page.locator('#gmBHCommit').click();await idle(page);await visibleStatus(page,/cópia local|sala colaborativa/i);assert.deepEqual(await imported(page),[]);assert.equal(await page.locator('#gmBHCommit').isEnabled(),true);
    await page.evaluate(()=>window.GeoMineCollaboration=window.__previousCollaboration);await preview(page);await page.evaluate(()=>window.GeoMineCollaboration={snapshot:()=>({roomId:'synthetic-readonly-room'})});
    await page.locator('#gmBHCommit').click();await idle(page);await visibleStatus(page,/cópia local|sala colaborativa/i);assert.deepEqual(await imported(page),[],'collaboration gate also runs at commit');checks.push('collaboration validation and commit gates visible');await page.close();

    page=await setup();await choose(page);await page.locator('#gmBHUnits').check();await holdWorkerMessages(page);
    await page.locator('#gmBHCommit').click();await page.waitForFunction(()=>__heldMessages.length===1);assert.equal(await page.locator('#gmBHCommit').getAttribute('data-state'),'busy');
    await page.locator('#gmBHCancel').click();await idle(page);await visibleStatus(page,/cancelad/i);
    await page.evaluate(()=>{window.Worker=__workerBeforeHold;__heldMessages.splice(0).forEach(release=>release());});
    assert.deepEqual(await imported(page),[]);assert.equal(await page.locator('#gmBHPreview tbody tr').count(),0);assert.equal(await page.locator('#gmBHCommit').getAttribute('data-state'),'idle');assert.ok(await page.evaluate(()=>__terminatedWorkers)>0);checks.push('pending real worker cancellation remains atomic');
    await holdWorkerMessages(page);await page.locator('#gmBHCommit').click();await page.waitForFunction(()=>__heldMessages.length===1);
    await page.locator('#gmBHDip').evaluate(e=>{e.value='zenith';e.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.evaluate(()=>{window.Worker=__workerBeforeHold;__heldMessages.splice(0).forEach(release=>release());});
    await idle(page);await visibleStatus(page,/configuração.*mudou|valide novamente/i);assert.deepEqual(await imported(page),[]);assert.equal(await page.locator('#gmBHPreview tbody tr').count(),0);assert.equal(await page.locator('#gmBHCommit').getAttribute('data-state'),'idle');checks.push('configuration revision rejects stale worker result');await page.close();
    assert.deepEqual(errors,[],'no uncaught browser errors');console.log(JSON.stringify({pass:true,checks,errors,screenshotsPrefix:screenshots},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
