// Isolated browser, generated fixtures; never reads the user's open project.
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1480,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(15000);
    await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'));
    await page.waitForFunction(()=>window.GeoMineGeology?.boreholeProperties);
    await page.evaluate(()=>{
      S.workCRS='EPSG:31982';S.setBase('Sem fundo');
      const data='furos.str,22-Sep-26,,\n0,0,0,0,\n7,7074000,583000,300,F01\n7,7074000,583030,250,Base F01\n0,0,0,0,END\n8,7074100,583100,310,F02\n8,7074100,583130,270,Base F02\n0,0,0,0,END\n0,0,0,0,END\nEND\n';
      const parsed=GeoMineBoreholeReader.buildSTR(data,{idMode:'description'});
      window.__holes=GeoMineGeology.boreholes.__test.commitParsed(parsed,{mode:'str',crs:S.workCRS,unitsConfirmed:true,files:['furos.str'],name:'Furos STR'});
      __holes.features[1].geologyLog=[{DE_M:0,ATE_M:20,LITOLOGIA:'Calcário',DESCRICAO:'Original',attributes:{LAB:'L1'}},{DE_M:20,ATE_M:50,LITOLOGIA:'Filito'}];
      __holes.features[1].coreRuns=[{DE_M:0,ATE_M:50,REC_PCT:95,RQD_PCT:70,LITOLOGIA:'Calcário'}];
      window.__original=JSON.stringify(__holes.features[1]);S.selFeat={layer:__holes,idx:1};showProps();
    });
    await page.locator('[data-bhp-dock] [data-bhp="log"]').click();
    assert.equal(await page.locator('.gm-borehole-log [data-role="feature"]').inputValue(),'1','selected furo must open directly');
    assert.equal(await page.locator('.gm-borehole-log tbody input[data-key="LITOLOGIA"]').first().inputValue(),'Calcário');
    assert.ok(await page.locator('.gm-borehole-log canvas').evaluate(c=>{const d=c.getContext('2d').getImageData(80,80,50,100).data;return [...d].some((v,i)=>i%4!==3&&v<120);}), 'log has actual colored intervals');
    for(const [device,viewport] of [['desktop',{width:1480,height:1050}],['tablet',{width:1024,height:768}]]){
      await page.setViewportSize(viewport);for(const theme of ['light','dark']){
        await page.evaluate(v=>applyTheme(v),theme);
        const bounds=await page.locator('.gm-borehole-log').evaluate(el=>{const a=el.getBoundingClientRect(),b=el.querySelector('.gmgeo-foot').getBoundingClientRect();return {top:a.top,bottom:a.bottom,right:a.right,foot:b.bottom,w:innerWidth,h:innerHeight};});
        assert.ok(bounds.top>=0&&bounds.bottom<=bounds.h+1&&bounds.right<=bounds.w+1&&bounds.foot<=bounds.h+1,JSON.stringify(bounds));
        await page.locator('.gm-borehole-log').screenshot({path:path.resolve(__dirname,`../dist/borehole-log-${device}-${theme}.png`)});
      }
    }
    await page.setViewportSize({width:1480,height:1050});
    await page.locator('.gm-borehole-log tbody input[data-key="LITOLOGIA"]').first().fill('Dolomito');
    await page.locator('.gm-borehole-log [data-act="done"]').click();
    await page.evaluate(()=>GeoMineGeology.openBoreholeEditor('log'));
    assert.equal(await page.locator('.gm-borehole-log tbody input[data-key="LITOLOGIA"]').first().inputValue(),'Dolomito');
    await page.locator('.gm-borehole-log [data-act="properties"]').click();
    const props=page.locator('#gmBoreholeProperties');assert.equal(await props.locator('[data-id]').inputValue(),'F02');
    await props.locator('[data-id]').fill('Cancelled');await props.locator('[data-close]').last().click();
    assert.equal(await page.evaluate(()=>__holes.features[1].props.ID_FURO),'F02');
    await page.evaluate(()=>GeoMineGeology.boreholeProperties.open());
    await props.locator('[data-id]').fill('F01');await props.locator('[data-apply]').click();
    assert.match(await props.locator('.gm-bhp-status').textContent(),/Já existe/);
    await props.locator('[data-id]').fill('F02-revisado');
    const descriptions=props.locator('label').filter({hasText:'DESCRIPTIONS (JSON)'}).locator('textarea');
    await descriptions.fill('["F02","Base revisada"]');
    await props.locator('label').filter({hasText:/^OBS$/}).locator('input').fill('Geólogo revisou');
    await props.locator('[data-apply]').click();await props.waitFor({state:'detached'});
    await page.evaluate(()=>{const f=__holes.features[1],original=JSON.parse(__original);for(const k of ['geom','zg','boreholeTrace','boreholeSurvey','boreholeSource','coreRuns'])if(JSON.stringify(f[k])!==JSON.stringify(original[k]))throw Error(k+' changed');if(f.geologyLog[0].attributes.LAB!=='L1')throw Error('interval attributes lost');});
    await page.evaluate(()=>{window.__saved=projectData();loadProject(JSON.parse(JSON.stringify(__saved)));window.__holes=S.layers.find(L=>L.name==='Furos STR');S.selFeat={layer:__holes,idx:1};});
    assert.equal(await page.evaluate(()=>__holes.features[1].props.ID_FURO),'F02-revisado');
    assert.equal(await page.evaluate(()=>JSON.stringify(__holes.features[1].boreholeTrace)),await page.evaluate(()=>JSON.stringify(JSON.parse(__original).boreholeTrace)));
    await page.evaluate(()=>GeoMineGeology.openBoreholeEditor('log'));
    assert.equal(await page.locator('.gm-borehole-log [data-role="feature"]').inputValue(),'1');
    assert.equal(await page.locator('.gm-borehole-log tbody input[data-key="LITOLOGIA"]').first().inputValue(),'Dolomito');
    await page.locator('.gm-borehole-log [data-role="feature"]').selectOption('0');assert.match(await page.locator('.gm-borehole-log tbody').textContent(),/Nenhum intervalo/);
    await page.locator('.gm-borehole-log [data-act="new"]').click();
    await page.waitForFunction(()=>S.tool==='point');assert.equal(await page.evaluate(()=>activeLayer()._geology.importedBoreholes===true),false,'existing new-hole workflow must use manual layer');
    await page.evaluate(()=>{setTool('select');GeoMineGeology.boreholes.open('csv');});
    await page.locator('#gmBHFiles').setInputFiles({name:'collar.csv',mimeType:'text/csv',buffer:Buffer.from('HOLEID,X,Y,Z\nC001,583500,7074000,310\n')});
    await page.locator('#gmBHRead').click();await page.locator('.gm-bh-table').waitFor();await page.locator('#gmBHUnits').check();
    assert.equal(await page.locator('#gmBHVertical').isChecked(),false);await page.locator('#gmBHValidate').click();
    await page.waitForFunction(()=>document.querySelector('#gmBHCommit').dataset.state==='ready');
    assert.equal(await page.locator('#gmBHCommit').isEnabled(),true,'only a completed preview may be confirmed');
    assert.match(await page.locator('#gmBHPreview').textContent(),/Não informada · somente boca/);
    await page.locator('#gmBHCommit').click();
    assert.deepEqual(await page.evaluate(()=>{const f=activeLayer().features[0];return {depth:f.props.PROF_M,points:f.boreholeTrace.length,method:f.boreholeSource.method,survey:f.boreholeSurvey.length,log:f.geologyLog.length};}),{depth:null,points:1,method:'collar-only',survey:0,log:0});
    assert.deepEqual(errors,[],'no uncaught UI errors');console.log('PASS: selected hole/log, graphical intervals, metadata edit/cancel/validation, STR MD unchanged, save/reopen, existing new-hole command and collar-only file import.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
