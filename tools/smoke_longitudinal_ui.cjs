// Browser integration against the complete built app, with isolated synthetic data.
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const bundle=path.resolve(process.argv[2]||path.join(__dirname,'../dist/GeoMine.html'));
(async()=>{
  const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1580,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.route(/^https?:/,route=>route.abort());
    await page.goto('file://'+bundle,{waitUntil:'load'});
    await page.waitForFunction(()=>typeof runProfile==='function'&&typeof addLayer==='function');
    const id=await page.evaluate(()=>{
      S.workCRS='EPSG:31982';S.setBase('Sem fundo');
      const L=addLayer({name:'Eixo XYZ sintético',gtype:'line',crs:S.workCRS,color:'#ed6a5a',fields:[],
        features:[{geom:[[580000,7074000,100],[580030,7074000,180],[580100,7074000,90]],props:{}}]});
      S.selFeat=null;S.activeId=L.id;S.rasters=[];S.prof.sourceMode=null;
      const ll=toWGS(S.workCRS,580050,7074000);map.setView([ll[1],ll[0]],17,{animate:false});
      window.__gridReads=0;const original=gridBruto;
      gridBruto=async(...args)=>{window.__gridReads++;return original(...args);};
      return String(L.id);
    });
    await page.locator('.ribcat[data-cat-id="topografia"]').click();
    await page.locator('.rbtn').filter({hasText:'Perfil Longitudinal'}).click();
    await page.locator('#prSourceMode').waitFor({state:'visible'});
    assert.equal(await page.locator('#prSourceMode').inputValue(),'vector');
    assert.equal(await page.locator('#prVectorSel').inputValue(),id);
    assert.equal(await page.locator('#prRasterSampling').isVisible(),false);
    await page.locator('#prStep').fill('60');
    await page.locator('#btnPrUseVectorAxis').click();
    await page.locator('#btnPrRun').click();
    await page.waitForFunction(()=>S.prof.result?.series?.length===1);
    let state=await page.evaluate(()=>({result:S.prof.result,reads:window.__gridReads,
      chart:document.getElementById('profChart').style.display,out:document.getElementById('prOut').textContent}));
    assert.equal(state.reads,0);assert.equal(state.chart,'block');
    assert.ok(Math.abs(state.result.total-100)<1e-5);
    const peak=state.result.dist.findIndex(d=>Math.abs(d-30)<1e-5);
    assert.ok(peak>=0);assert.ok(Math.abs(state.result.series[0].z[peak]-180)<1e-5);
    assert.ok(state.out.includes('sem raster')&&state.out.includes('cotas da própria linha'));
    console.log('PASS actual ribbon + XYZ detection + own-line axis + vector-only generation and chart');

    // Capture the real CSV payload before the OS save picker; never write a user file.
    await page.evaluate(()=>{download=async blob=>{window.__csv=await blob.text();};});
    await page.locator('#btnPrCSV').click();await page.waitForFunction(()=>window.__csv);
    const csv=await page.evaluate(()=>window.__csv);
    assert.match(csv,/30\.0;180\.00/);console.log('PASS CSV preserves off-step vertex cota');

    await page.evaluate(()=>{
      S.rasters=[{id:901,name:'MDT sintético',visible:false,
        d:{nc:20,nr:20,cs:10,xll:579950,yll:7073900,z:new Float32Array(400).fill(222),zmin:222,zmax:222,native:true}}];
      S.topoRasterId=901;refreshProfPanel();document.getElementById('prRasterSel').value='901';
      S.prof.result=null;
    });
    await page.locator('#btnPrRun').click();await page.waitForFunction(()=>S.prof.result);
    assert.equal(await page.evaluate(()=>window.__gridReads),0,'raster loaded/selected must not be read in vector mode');
    assert.equal(await page.evaluate(()=>S.prof.result.series.length),1);
    console.log('PASS vector-only stays independent with a raster loaded and selected');

    await page.locator('#prSourceMode').selectOption('raster');
    assert.equal(await page.locator('#prLineWrap').isVisible(),false);
    assert.equal(await page.locator('#prRasterSampling').isVisible(),true);
    await page.evaluate(()=>{S.prof.result=null;});
    await page.locator('#btnPrRun').click();await page.waitForFunction(()=>S.prof.result);
    state=await page.evaluate(()=>({result:S.prof.result,reads:window.__gridReads}));
    assert.equal(state.reads,1);assert.equal(state.result.series.length,1);
    assert.equal(state.result.series[0].name,'MDT sintético');
    assert.ok(state.result.series[0].z.every(z=>Math.abs(z-222)<1e-6));
    console.log('PASS switching to raster uses native grid only and does not retain vector series');

    await page.locator('#prSourceMode').selectOption('vector');
    const multiId=await page.evaluate(()=>{
      const L=addLayer({name:'Linha SHP Z multipart',gtype:'line',crs:S.workCRS,fields:[],features:[{
        geom:[[[580000,7074000],[580100,7074000]],[[580000,7074010],[580060,7074010]]],
        zg:[[10,20],[300,360]],multi:true,props:{}}]});
      resetProfile(false);S.selFeat={layer:L,layerId:L.id,idx:0,partIdx:1};S.activeId=L.id;
      refreshProfPanel();document.getElementById('prVectorSel').value=String(L.id);return String(L.id);
    });
    await page.locator('#prVectorSel').selectOption(multiId);
    await page.locator('#btnPrRun').click();await page.waitForFunction(()=>S.prof.result);
    state=await page.evaluate(()=>({result:S.prof.result,reads:window.__gridReads}));
    assert.equal(state.reads,1);assert.equal(state.result.total,60);
    assert.deepEqual(state.result.series[0].z,[300,360]);
    console.log('PASS selected SHP part is used, not the first part');

    const contourId=await page.evaluate(()=>{
      const L=addLayer({name:'Curvas de nível com COTA',gtype:'line',crs:S.workCRS,
        fields:[{name:'COTA',type:'N',length:18,decimal:2}],features:[
          {geom:[[580020,7073990],[580020,7074010]],props:{COTA:20}},
          {geom:[[580080,7073990],[580080,7074010]],props:{COTA:80}}]});
      resetProfile(false);S.selFeat=null;S.prof.sourceLineIds=[];
      S.prof.buf=[[580000,7074000],[580100,7074000]].map(p=>{const w=toWGS(S.workCRS,...p);return [w[1],w[0]];});
      refreshProfPanel();document.getElementById('prVectorSel').value=String(L.id);return String(L.id);
    });
    await page.locator('#prVectorSel').selectOption(contourId);await page.locator('#prStep').fill('10');
    await page.locator('#btnPrRun').click();await page.waitForFunction(()=>S.prof.result);
    state=await page.evaluate(()=>({result:S.prof.result,reads:window.__gridReads}));
    const middle=state.result.dist.findIndex(x=>Math.abs(x-50)<1e-5);
    assert.ok(Math.abs(state.result.series[0].z[middle]-50)<1e-4);
    assert.equal(state.result.series[0].method,'intersections');assert.equal(state.reads,1);
    console.log('PASS drawn axis crossing contour vectors still interpolates without TIFF');
    assert.deepEqual(errors,[],'no browser exceptions');
    console.log('PASS full longitudinal UI integration');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
