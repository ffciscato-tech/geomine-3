// Separate collar/survey/lithology choices, tested in an isolated Chrome
// profile against the compiled bundle. All fixtures are synthetic and local.
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const bundle=path.resolve(__dirname,'../dist/GeoMine.html');
const file=(name,text)=>({name,mimeType:'application/octet-stream',buffer:Buffer.from(text)});
const collar=file('exportacao_A.csv','HOLEID;E_CAMPANHA;Y;Z;DEPTH\nF01;583000;7074000;300;100\n');
const survey=file('exportacao_B.csv','HOLEID;MD;AZIMUTH;DIP\nF01;0;90;60\nF01;100;100;70\n');
const lithology=file('exportacao_C.csv','HOLEID;FROM;TO;LITHOLOGY\nF01;0;40;Calcario\nF01;40;100;Filito\n');
const replacement=file('revisao_2026.csv','HOLEID;MD;AZIMUTH;DIP\nF01;0;90;30\nF01;100;90;30\n');
const orphan=file('resultados_X.csv','HOLEID;FROM;TO;AU_PPM\nNAO_EXISTE;0;20;1.2\n');
const bulkA=file('assay_A.csv','HOLEID;FROM;TO;AU_PPM\nF01;0;40;0.5\n');
const bulkB=file('assay_B.csv','HOLEID;FROM;TO;AU_PPM\nF01;40;100;1.5\n');
const near=(a,b,label,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${label}: ${a} != ${b}`);
function originalEndpoint(){
  const direction=(az,dip)=>{const a=az*Math.PI/180,b=dip*Math.PI/180;return [Math.sin(a)*Math.cos(b),Math.cos(a)*Math.cos(b),-Math.sin(b)];};
  const a=direction(90,60),b=direction(100,70),angle=Math.acos(a.reduce((sum,v,i)=>sum+v*b[i],0)),rf=2*Math.tan(angle/2)/angle;
  return [583000,7074000,300].map((v,i)=>v+50*rf*(a[i]+b[i]));
}

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+bundle,{waitUntil:'load'});
    await page.waitForFunction(()=>window.GeoMineGeology?.boreholes&&window.GeoMineGeology?.boreholePreview);
    await page.evaluate(()=>{S.workCRS='EPSG:31982';S.setBase('Sem fundo');
      const open=GeoMineGeology.boreholePreview.open;
      GeoMineGeology.boreholePreview.open=function(parsed,...args){window.__bhLastPreview=JSON.parse(JSON.stringify(parsed));return open.call(this,parsed,...args);};});
    await page.locator('.ribcat[data-cat-id="geologia"]').click();await page.locator('.rbtn').filter({hasText:'Furos · CSV'}).click();
    await page.locator('#gmBoreholeModal').waitFor({state:'visible'});
    const queued=()=>page.locator('#gmBHFileNames').textContent();
    const table=name=>page.locator('.gm-bh-table').filter({has:page.locator('h3').filter({hasText:name})});
    async function noImport(){assert.deepEqual(await page.evaluate(()=>S.layers),[],'selection/validation must not create layers in the live project');
      assert.equal(await page.evaluate(()=>JSON.stringify(projectData().layers).includes('boreholeTrace')),false);}
    async function choose(selector,payload){
      const input=page.locator(selector);assert.equal(await input.isVisible(),true);
      const event=page.waitForEvent('filechooser');await input.click();const picker=await event;
      assert.equal(await picker.element().getAttribute('accept'),null,'role-specific text pickers must not reintroduce the CSV MIME filter');
      await picker.setFiles(payload);await noImport();
    }
    async function names(expected,absent=[]){const text=await queued();for(const f of expected)assert.ok(text.includes(f.name),`file disappeared: ${f.name}`);
      for(const f of absent)assert.ok(!text.includes(f.name),`replaced/removed file still queued: ${f.name}`);}
    async function read(){await page.locator('#gmBHRead').click();await page.waitForFunction(()=>document.querySelector('#gmBHCancel').hidden&&
      (document.querySelectorAll('.gm-bh-table').length||document.querySelector('#gmBHStatus').classList.contains('error')));
      assert.equal(await page.locator('#gmBHStatus').evaluate(el=>el.classList.contains('error')),false,await page.locator('#gmBHStatus').textContent());}
    async function validate(ok=true){await page.locator('#gmBHValidate').click();await page.waitForFunction(()=>document.querySelector('#gmBHCancel').hidden&&
      (document.querySelector('#gmBHCommit').dataset.state==='ready'||document.querySelector('#gmBHStatus').classList.contains('error')));
      assert.equal(await page.locator('#gmBHCommit').getAttribute('data-state'),ok?'ready':'idle',await page.locator('#gmBHStatus').textContent());
      assert.equal(await page.locator('#gmBHCommit').isEnabled(),true,'idle starts validation; ready confirms the validated preview');await noImport();
      if(ok){assert.equal(await page.locator('#gmBHPreview tbody tr').count(),1,'three tables must join into one hole, not three duplicated holes');
        await page.locator('#gmBHViewer canvas').waitFor({state:'visible'});}}
    for(const role of ['collar','survey','lithology','assay','core']){
      const input=page.locator('#gmBHFile-'+role);assert.equal(await input.count(),1);
      assert.equal(await input.evaluate(el=>el.multiple),!['collar','survey'].includes(role));
    }
    await choose('#gmBHFile-collar',collar);await names([collar]);
    await read();assert.equal(await table(collar.name).locator('[data-map="x"]').inputValue(),'');
    await table(collar.name).locator('[data-map="x"]').selectOption('E_CAMPANHA');
    await choose('#gmBHFile-survey',survey);await names([collar,survey]);
    await choose('#gmBHFile-lithology',lithology);await names([collar,survey,lithology]);
    await read();assert.equal(await page.locator('.gm-bh-table').count(),3);
    for(const [f,role] of [[collar,'collar'],[survey,'survey'],[lithology,'lithology']])
      assert.equal(await table(f.name).locator('[data-role]').inputValue(),role,'explicit input role must beat the arbitrary filename');
    assert.equal(await table(collar.name).locator('[data-map="x"]').inputValue(),'E_CAMPANHA','adding related tables must preserve manual collar mapping');
    await page.locator('#gmBHUnits').check();await validate();
    assert.match(await page.locator('#gmBHPreview tbody tr').textContent(),/F01/);
    assert.equal(await page.locator('#gmBHPreview tbody tr td').nth(4).textContent(),'2','lithology intervals must join by hole ID');
    const joined=await page.evaluate(()=>__bhLastPreview);assert.equal(joined.holes.length,1);
    const endpoint=joined.holes[0].trace.at(-1),expected=originalEndpoint();
    [endpoint.x,endpoint.y,endpoint.z].forEach((v,i)=>near(v,expected[i],'initial combined minimum-curvature endpoint'));
    assert.equal(joined.holes[0].geologyLog.length,2);
    const previewCounts=await page.locator('#gmBHViewer canvas').evaluate(canvas=>({...canvas.dataset}));
    assert.equal(Number(previewCounts.holes),1);assert.equal(Number(previewCounts.intervals),2);
    assert.match(await page.locator('.gm-bhpv-legend').textContent(),/Calcario/);assert.match(await page.locator('.gm-bhpv-legend').textContent(),/Filito/);
    for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['tablet',{width:1024,height:768}]]){
      await page.setViewportSize(viewport);
      const layout=await page.locator('.gm-bh-modal').evaluate(modal=>{const r=modal.getBoundingClientRect(),body=modal.querySelector('.gm-bh-body');return {
        left:r.left,right:r.right,width:innerWidth,overflow:body.scrollWidth-body.clientWidth};});
      assert.ok(layout.left>=0&&layout.right<=layout.width&&layout.overflow<=1,`${device}: modal or long file queue overflows`);
      await page.locator('#gmBHViewer').screenshot({path:path.resolve(__dirname,`../dist/borehole-multitable-3d-${device}.png`)});
      await page.locator('#gmBHFileNames').scrollIntoViewIfNeeded();
      const queueWidths=await page.locator('#gmBHFileNames .gm-bh-selected-file>span').evaluateAll(spans=>spans.map(span=>({
        text:span.textContent,width:span.getBoundingClientRect().width,overflow:span.scrollWidth-span.clientWidth})));
      assert.equal(queueWidths.length,3);
      assert.ok(queueWidths.every(span=>span.width>100&&span.overflow<=1),`${device}: selected filenames must have readable width: `+JSON.stringify(queueWidths));
      await page.locator('.gm-bh-modal').screenshot({path:path.resolve(__dirname,`../dist/borehole-multitable-queue-${device}.png`)});
      await page.locator('.gm-bh-body').evaluate(el=>el.scrollTop=0);
      await page.locator('.gm-bh-modal').screenshot({path:path.resolve(__dirname,`../dist/borehole-multitable-${device}.png`)});
    }
    await page.setViewportSize({width:1440,height:1000});
    await choose('#gmBHFile-survey',replacement);await names([collar,replacement,lithology],[survey]);
    assert.equal(await page.locator('#gmBHCommit').getAttribute('data-state'),'idle','survey replacement must invalidate the previous preview');
    assert.equal(await page.locator('#gmBHCommit').isEnabled(),true);
    assert.equal(await page.locator('#gmBHViewer canvas').count(),0,'old 3D must disappear when inputs change');
    await read();assert.equal(await page.locator('.gm-bh-table').count(),3);
    assert.equal(await table(collar.name).locator('[data-map="x"]').inputValue(),'E_CAMPANHA','replacing only survey must not clear unrelated mapping');await validate();
    await choose('#gmBHFile-assay',orphan);await names([collar,replacement,lithology,orphan]);await read();await validate(false);
    assert.match(await page.locator('#gmBHStatus').textContent(),/NAO_EXISTE.*não existe.*collar/i);
    // Removal selector is intentionally the UI's per-file button, not direct
    // mutation of a queued File array or of the project state.
    await page.locator('#gmBHFileNames .gm-bh-selected-file').filter({hasText:orphan.name}).locator('[data-remove-csv]').click();
    await names([collar,replacement,lithology],[orphan]);
    await choose('#gmBHFiles',bulkA);await names([collar,replacement,lithology,bulkA]);
    await choose('#gmBHFiles',bulkB);await names([collar,replacement,lithology,bulkA,bulkB]);
    await read();assert.equal(await page.locator('.gm-bh-table').count(),5);await validate();
    await page.locator('#gmBHCommit').click();await page.waitForFunction(()=>S.layers.some(l=>l._geology?.importedBoreholes));
    assert.equal(await page.locator('#gmBHCommit').getAttribute('data-state'),'imported');
    assert.equal(await page.locator('#gmBHCommit').isDisabled(),true,'a confirmed campaign cannot be imported twice');
    const imported=await page.evaluate(()=>S.layers.filter(l=>l._geology?.importedBoreholes).map(l=>({features:l.features})));
    assert.equal(imported.length,1);assert.equal(imported[0].features.length,1);const hole=imported[0].features[0];
    assert.deepEqual(hole.geom,[[583000,7074000]]);assert.deepEqual(hole.zg,[300]);assert.equal(hole.props.ID_FURO,'F01');
    near(hole.boreholeTrace.at(-1).x,583000+100*Math.cos(Math.PI/6),'revised survey easting');
    near(hole.boreholeTrace.at(-1).y,7074000,'revised survey northing');near(hole.boreholeTrace.at(-1).z,250,'revised survey elevation');
    assert.equal(hole.geologyLog.length,2);assert.equal(hole.boreholeTables.filter(t=>t.role==='assay').length,2);
    assert.deepEqual(hole.boreholeSource.files.slice().sort(),[collar,replacement,lithology,bulkA,bulkB].map(f=>f.name).sort());
    assert.deepEqual(errors,[]);
    console.log('PASS separate files: retained collar/survey/lithology, explicit roles, joined automatic 3D, preview invalidation, orphan rejection/removal, cumulative bulk choice and one correct committed hole.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
