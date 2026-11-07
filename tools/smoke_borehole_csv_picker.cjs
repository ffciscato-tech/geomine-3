// Compiled UI, real file-chooser activation, isolated Chrome contexts.
// Android is browser emulation, not a claim to test a physical Files/Drive app.
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const bundle=path.resolve(__dirname,'../dist/GeoMine.html');
const file=(name,mimeType,id='C01',separator=';')=>({name,mimeType,buffer:Buffer.from(
  ['HOLEID','X','Y','Z','DEPTH','AZIMUTH','DIP'].join(separator)+'\n'+
  [id,583000,7074000,300,25,0,90].join(separator)+'\n')});
const cases=[
  ['collar.csv','text/csv','CSV-MIME'],
  ['collar_download.csv','application/octet-stream','CSV-BINARY'],
  ['COLLAR.CSV','application/vnd.ms-excel','CSV-UPPER'],
  ['collar.txt','text/plain','TEXT'],
  ['collar.tsv','text/tab-separated-values','TSV','\t']
];

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    for(const [device,options] of [
      ['desktop',{viewport:{width:1440,height:1000}}],
      ['android-emulated',{viewport:{width:1024,height:768},deviceScaleFactor:1,isMobile:true,hasTouch:true,
        userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'}]
    ]){
      const context=await browser.newContext(options),page=await context.newPage(),errors=[];
      page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
      await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+bundle,{waitUntil:'load'});
      await page.waitForFunction(()=>window.GeoMineGeology?.boreholes);
      await page.evaluate(()=>{S.workCRS='EPSG:31982';S.setBase('Sem fundo');});
      await page.locator('.ribcat[data-cat-id="geologia"]').click();
      await page.locator('.rbtn').filter({hasText:'Furos · CSV'}).click();
      await page.locator('#gmBoreholeModal').waitFor({state:'visible'});
      const count=()=>page.evaluate(()=>S.layers.filter(l=>l._geology?.importedBoreholes).length);
      // Save timestamps and asynchronously assigned collaboration IDs are not
      // import data and may change between any two ordinary snapshots.
      const projectContent=()=>page.evaluate(()=>JSON.stringify(projectData(),(key,value)=>
        key==='savedAt'||key==='_collabId'?undefined:value));
      async function assertMode(mode){
        const state=await page.locator('#gmBHFiles').evaluate(input=>({accept:input.getAttribute('accept'),
          capture:input.getAttribute('capture'),multiple:input.multiple,files:input.files.length}));
        assert.equal(state.accept,mode==='csv'?null:'.str,.stx',`${device}: ${mode} accept`);
        assert.equal(state.capture,null,`${device}: choosing data must not request camera capture`);
        assert.equal(state.multiple,mode==='csv',`${device}: ${mode} multiple`);
        assert.equal(state.files,0,'changing mode must clear the previous file list');
        assert.equal(await page.locator('#gmBHCommit').getAttribute('data-state'),'idle','changing mode must discard the previous validated preview');
        assert.equal(await page.locator('#gmBHCommit').isEnabled(),true,'idle action must initiate validation');
      }
      async function choose(files,accepted=true){
        const event=page.waitForEvent('filechooser');await page.locator('#gmBHFiles').click();
        const chooser=await event;assert.equal(chooser.isMultiple(),true,'CSV chooser must permit selecting the related tables together');
        assert.equal(await chooser.element().getAttribute('accept'),null,'the input that actually opens the chooser must not filter CSV by MIME');
        await chooser.setFiles(files);
        const selected=await page.locator('#gmBHFiles').evaluate(input=>[...input.files].map(f=>({name:f.name,type:f.type})));
        assert.deepEqual(selected,(Array.isArray(files)?files:[files]).map(f=>({name:f.name,type:f.mimeType})));
        const shown=await page.locator('#gmBHFileNames').textContent();
        for(const f of selected)assert.equal(shown.includes(f.name),accepted,`${device}: accepted files must be queued; rejected files must not be queued`);
      }
      await assertMode('csv');
      const label=await page.locator('#gmBHFilesLabel').textContent();assert.match(label,/CSV/i);assert.match(label,/TSV/i);assert.match(label,/TXT/i);
      await page.locator('[data-mode="str"]').click();await assertMode('str');
      await page.locator('[data-mode="csv"]').click();await assertMode('csv');
      await page.locator('#gmBHUnits').check();
      // Multiple file choice is preserved, but switching modes must discard it.
      await choose([file('collar.csv','text/csv'),file('collar_extra.csv','application/octet-stream','C02')]);
      await page.locator('[data-mode="str"]').click();await assertMode('str');
      await page.locator('[data-mode="csv"]').click();await assertMode('csv');
      assert.equal(await count(),0);
      let imported=0;
      for(const [name,mime,id,separator] of cases){
        // Bulk choices intentionally accumulate into a campaign. These are
        // independent format fixtures, so start a fresh queue for each one.
        if(imported){await page.locator('[data-mode="str"]').click();await assertMode('str');
          await page.locator('[data-mode="csv"]').click();await assertMode('csv');}
        await choose(file(name,mime,id,separator));
        await page.locator('#gmBHRead').click();await page.locator('.gm-bh-table').waitFor({state:'visible'});
        assert.equal(await page.locator('.gm-bh-table').count(),1);
        assert.equal(await page.locator('.gm-bh-table [data-role]').inputValue(),'collar');
        await page.locator('#gmBHValidate').click();
        await page.waitForFunction(()=>document.querySelector('#gmBHCancel').hidden&&
          (document.querySelector('#gmBHCommit').dataset.state==='ready'||document.querySelector('#gmBHStatus').classList.contains('error')));
        assert.equal(await page.locator('#gmBHCommit').getAttribute('data-state'),'ready',`${device}/${name}: `+await page.locator('#gmBHStatus').textContent());
        assert.equal(await page.locator('#gmBHCommit').isEnabled(),true,`${device}/${name}: `+await page.locator('#gmBHStatus').textContent());
        assert.equal(await count(),imported,'preview must not create a project layer');
        await page.locator('#gmBHCommit').click();imported++;
        await page.waitForFunction(n=>S.layers.filter(l=>l._geology?.importedBoreholes).length===n,imported);
        assert.equal(await page.locator('#gmBHCommit').getAttribute('data-state'),'imported');
        assert.equal(await page.locator('#gmBHCommit').isDisabled(),true,'confirmed files cannot be imported twice');
        const result=await page.evaluate(id=>{
          const l=S.layers.find(l=>l._geology?.importedBoreholes&&l.features.some(f=>f.props?.ID_FURO===id||f.props?.HOLEID===id)),
            f=l?.features[0];return f?{geom:f.geom,zg:f.zg,trace:f.boreholeTrace,source:f.boreholeSource}:null;
        },id);
        assert.ok(result,`${device}/${name}: imported collar missing`);
        assert.deepEqual(result.geom,[[583000,7074000]]);assert.deepEqual(result.zg,[300]);
        assert.ok(result.trace.length>=2,'full collar import must retain the trajectory');
        assert.ok(Math.abs(result.trace.at(-1).z-275)<1e-6,'vertical endpoint must use the imported depth');
      }
      const beforeInvalid=await projectContent();
      const validQueue=await page.locator('#gmBHFileNames').textContent();
      await choose(file('collar.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','BAD'),false);
      // addCSV rejects the extension immediately. Do not press Read, which
      // would correctly read the valid files still retained in the queue.
      await page.waitForFunction(()=>document.querySelector('#gmBHCancel').hidden&&document.querySelector('#gmBHStatus').classList.contains('error'));
      assert.match(await page.locator('#gmBHStatus').textContent(),/extensão incompatível/i);
      assert.equal(await page.locator('#gmBHFileNames').textContent(),validQueue,'invalid choice must preserve the valid campaign selection');
      assert.equal(await page.locator('#gmBHCommit').getAttribute('data-state'),'imported','rejected replacement must not reset the completed campaign');
      assert.equal(await page.locator('#gmBHCommit').isDisabled(),true);assert.equal(await count(),imported);
      assert.equal(await projectContent(),beforeInvalid,'unsupported extension must not change the saved project');
      await page.locator('[data-mode="str"]').click();await assertMode('str');
      await page.locator('[data-mode="csv"]').click();await assertMode('csv');
      await page.locator('.gm-bh-modal').screenshot({path:path.resolve(__dirname,`../dist/borehole-csv-picker-${device}.png`)});
      assert.deepEqual(errors,[]);console.log(`PASS ${device}: real chooser, no CSV MIME filter/capture, mode reset, five text-file variants imported, XLSX rejected atomically.`);
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
