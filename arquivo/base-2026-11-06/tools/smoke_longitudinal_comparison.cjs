// Browser-only regression: independent comparisons, explicit axes and aligned stations.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const bundle=path.resolve(process.argv[2]||path.join(__dirname,'../dist/GeoMine.html'));
const selected=(page,key)=>page.evaluate(key=>(S.prof[key]||[]).map(String),key);
const result=page=>page.evaluate(()=>({prof:S.prof.result,reads:__gridReadIds.slice(),mode:S.prof.sourceMode,axis:S.prof.axisSelection?{
  layerId:String(S.prof.axisSelection.layer.id),idx:S.prof.axisSelection.idx,partIdx:S.prof.axisSelection.partIdx}:null}));
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-5,label+': '+actual+' vs '+expected);
async function openPanel(page){
  if(await page.locator('#ribX').isVisible())await page.locator('#ribX').click();
  await page.locator('.ribcat[data-cat-id="topografia"]').click();
  const button=page.locator('.rbtn').filter({hasText:'Perfil Longitudinal'}),select=page.locator('#prSourceMode');
  await button.click();
  try{await select.waitFor({state:'visible',timeout:3000});}catch(error){
    console.error('PROFILE_PANEL_DEBUG',await page.evaluate(()=>{let e=document.getElementById('prSourceMode'),p=[];for(;e;e=e.parentElement)p.push({tag:e.tagName,id:e.id,className:e.className,display:getComputedStyle(e).display,visibility:getComputedStyle(e).visibility});return {parents:p,RIBsec:RIB.sec?.id,pop:document.getElementById('ribbonPop')?.className};}));throw error;
  }
}
async function addSource(page,kind,id){await page.locator('#pr'+kind+'Sel').selectOption(String(id));await page.locator('#btnPr'+kind+'Add').click();}
async function removeSource(page,kind,id){await page.locator('#pr'+kind+'Chosen button[data-id="'+id+'"]').click();}
async function generate(page,n){await page.evaluate(()=>{S.prof.result=null;__gridReadIds=[];});await page.locator('#btnPrRun').click();await page.waitForFunction(n=>S.prof.result?.series?.length===n,n);return result(page);}
async function chooseAxis(page,value){await page.locator('#prAxisVectorSel').selectOption(value);await page.locator('#btnPrUseVectorAxis').click();}
async function setColor(locator,value){await locator.evaluate((input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));},value);}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const page=await browser.newPage({viewport:process.env.GEOMINE_PANEL_PREFIX?{width:1280,height:800}:{width:1480,height:1050},timezoneId:'America/Sao_Paulo'}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
    await page.route(/^https?:/,route=>route.abort());await page.goto('file://'+bundle,{waitUntil:'load'});
    await page.waitForFunction(()=>typeof runProfile==='function'&&typeof addLayer==='function');
    const ids=await page.evaluate(()=>{
      S.workCRS='EPSG:31982';S.setBase('Sem fundo');S.layers=[];S.rasters=[];S.groups=[];S.stack=[];S.img=null;
      const e=580000,n=7074000;
      const line=(name,geom)=>addLayer({name,gtype:'line',crs:S.workCRS,fields:[],features:[{geom,props:{}}]});
      const terrain=line('Superfície vetorial',[[e,n,100],[e+30,n,150],[e+100,n,90]]);
      const pit=line('Superfície vetorial',[[e,n,80],[e+70,n,70],[e+100,n,60]]);
      const multi=addLayer({name:'Eixos por feição e parte',gtype:'line',crs:S.workCRS,fields:[],features:[
        {geom:[[[e,n+20,200],[e+40,n+20,240]],[[e,n+30,300],[e+65,n+30,365]]],multi:true,props:{}},
        {geom:[[e,n+40,400],[e+90,n+40,490]],props:{}}]});
      const raster=(id,z)=>({id,name:'Superfície raster',visible:false,style:{mode:'hipso_hs',opacity:.8},d:{nc:30,nr:30,cs:10,xll:e-100,yll:n-100,z:new Float32Array(900).fill(z),zmin:z,zmax:z,native:true}});
      S.rasters=[raster(901,100),raster(902,80)];S.topoRasterId=901;S.activeId=terrain.id;S.selFeat=null;
      S.prof.sourceMode='raster';S.prof.sourceRasterIds=[];S.prof.sourceLineIds=[];S.prof.styles={};
      resetProfile(false);const ll=toWGS(S.workCRS,e+50,n);map.setView([ll[1],ll[0]],17,{animate:false});refreshUI();
      window.__gridReadIds=[];const original=gridBruto;gridBruto=async(...args)=>{__gridReadIds.push(String(args[0].id));return original(...args);};
      window.__originalFeatures=JSON.stringify([terrain.features,pit.features,multi.features]);
      return {terrain:String(terrain.id),pit:String(pit.id),multi:String(multi.id)};
    });
    await openPanel(page);await page.locator('#prStep').fill('60');
    await addSource(page,'Raster',901);await addSource(page,'Raster',902);await addSource(page,'Raster',901);
    assert.deepEqual(new Set(await selected(page,'sourceRasterIds')),new Set(['901','902']),'two explicit rasters, no duplicate');
    await chooseAxis(page,ids.terrain+':0:0');
    let state=await generate(page,2);
    assert.deepEqual(new Set(state.prof.series.map(s=>s.sourceKey)),new Set(['R:901','R:902']),'raster source identities stable despite duplicate names');
    assert.deepEqual(new Set(state.reads),new Set(['901','902']),'both native raster grids read');
    assert.equal(state.prof.series.length,2);assert.ok(state.prof.series.some(s=>s.z.every(z=>Math.abs(z-100)<1e-5)));
    assert.ok(state.prof.series.some(s=>s.z.every(z=>Math.abs(z-80)<1e-5)));near(state.prof.total,100,'raster common axis');
    assert.ok(state.prof.series.every(s=>s.z.length===state.prof.dist.length));

    // Same-named raster series must not share presentation settings.
    const originalSecond=structuredClone(state.prof.series[1].style);
    await setColor(page.locator('#prStyleList .pr-style-row').nth(0).locator('.pr-cor'),'#e60066');
    await page.locator('#prStyleList .pr-style-row').nth(0).locator('.pr-peso').fill('6');
    await page.locator('#prStyleList .pr-style-row').nth(0).locator('.pr-peso').press('Tab');
    await page.locator('#prStyleList .pr-style-row').nth(0).locator('.pr-nome').fill('Terreno existente');
    await page.locator('#prStyleList .pr-style-row').nth(0).locator('.pr-nome').press('Tab');
    let styled=await result(page);assert.equal(styled.prof.series[0].style.color,'#e60066');assert.deepEqual(styled.prof.series[1].style,originalSecond);
    state=await generate(page,2);assert.equal(state.prof.series[0].style.color,'#e60066');assert.equal(state.prof.series[0].name,'Terreno existente');assert.deepEqual(state.prof.series[1].style,originalSecond,'same-named raster styles independent after regeneration');

    await page.locator('#prSourceMode').selectOption('vector');
    await addSource(page,'Vector',ids.terrain);await addSource(page,'Vector',ids.pit);
    await chooseAxis(page,ids.terrain+':0:0');state=await generate(page,2);
    assert.deepEqual(new Set(state.prof.series.map(s=>s.sourceKey)),new Set(['L:'+ids.terrain,'L:'+ids.pit]),'vector source identities stable despite duplicate names');
    assert.deepEqual(state.reads,[],'vector comparison never loads raster grids');near(state.prof.total,100,'vector common axis');
    const peak=state.prof.dist.findIndex(d=>Math.abs(d-30)<1e-5),pitVertex=state.prof.dist.findIndex(d=>Math.abs(d-70)<1e-5);
    assert.ok(peak>=0&&pitVertex>=0,'native vertices outside regular 60 m step retained');
    const terrainSeries=state.prof.series.find(s=>Math.abs(s.z[0]-100)<1e-5),pitSeries=state.prof.series.find(s=>Math.abs(s.z[0]-80)<1e-5);
    assert.ok(terrainSeries&&pitSeries);near(terrainSeries.z[peak],150,'terrain peak');near(pitSeries.z[pitVertex],70,'pit native vertex');
    assert.ok(state.prof.series.every(s=>s.z.length===state.prof.dist.length),'vector series share stations');
    await page.evaluate(()=>{download=async blob=>{window.__profileCSV=await blob.text();};});
    await page.locator('#btnPrCSV').click();await page.waitForFunction(()=>window.__profileCSV);
    const csv=await page.evaluate(()=>__profileCSV),csvRows=csv.trim().split(/\r?\n/).map(r=>r.split(';'));
    assert.ok(csvRows.every(r=>r.length===3),'CSV exports both vectors against common distance');
    const csvPeak=csvRows.find(r=>r[0]==='30.0');assert.ok(csvPeak&&csvPeak.slice(1).includes('150.00'),'CSV keeps native off-step cota');
    const otherVectorStyle=structuredClone(state.prof.series[1].style);
    await setColor(page.locator('#prStyleList .pr-style-row').nth(0).locator('.pr-cor'),'#118855');
    state=await generate(page,2);assert.equal(state.prof.series[0].style.color,'#118855');assert.deepEqual(state.prof.series[1].style,otherVectorStyle,'duplicate vector names have independent style keys');

    // Mixed comparison combines, not replaces, raster and vector series.
    await page.locator('#prSourceMode').selectOption('mixed');
    await removeSource(page,'Raster',902);await removeSource(page,'Vector',ids.terrain);
    state=await generate(page,2);assert.deepEqual(state.reads,['901']);
    assert.deepEqual(new Set(state.prof.series.map(s=>s.sourceKey)),new Set(['R:901','L:'+ids.pit]),'mixed result includes both source kinds');
    const mixedRaster=state.prof.series.find(s=>s.z.every(z=>Math.abs(z-100)<1e-5));
    const mixedPit=state.prof.series.find(s=>Math.abs(s.z[0]-80)<1e-5);assert.ok(mixedRaster&&mixedPit);
    assert.ok(state.prof.dist.some(d=>Math.abs(d-70)<1e-5),'mixed station axis incorporates native vector vertex');
    assert.ok(state.prof.series.every(s=>s.z.length===state.prof.dist.length),'mixed profiles are aligned');
    near(mixedPit.z[state.prof.dist.findIndex(d=>Math.abs(d-70)<1e-5)],70,'mixed native cota');
    await page.evaluate(()=>{window.__profileCSV=null;});await page.locator('#btnPrCSV').click();await page.waitForFunction(()=>window.__profileCSV);
    const mixedCSV=await page.evaluate(()=>__profileCSV),mixedRows=mixedCSV.trim().split(/\r?\n/).map(r=>r.split(';'));
    assert.ok(mixedRows.every(r=>r.length===3),'mixed CSV includes both source kinds');
    const mixedVertex=mixedRows.find(r=>r[0]==='70.0');assert.ok(mixedVertex&&mixedVertex.slice(1).includes('70.00')&&mixedVertex.slice(1).includes('100.00'),'mixed CSV aligns raster and exact native vector vertex');
    if(process.env.GEOMINE_PANEL_PREFIX){
      const prefix=process.env.GEOMINE_PANEL_PREFIX,measurements=await page.evaluate(()=>['#ribbonPop','#sidePerfis','#prRasterChosen','#prVectorChosen','#prStyleList'].map(selector=>{
        const e=document.querySelector(selector);return {selector,width:e.clientWidth,scroll:e.scrollWidth};
      }));
      assert.ok(measurements.every(m=>m.scroll<=m.width+1),'no horizontal overflow at 1280×800: '+JSON.stringify(measurements));
      const contrast=await page.locator('#prStyleList .pr-nome').first().evaluate(e=>{
        const css=getComputedStyle(e),lum=c=>{const v=c.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722;};
        const a=lum(css.color),b=lum(css.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      });assert.ok(contrast>=4.5,'style names remain readable');
      await page.locator('#prSourceMode').evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:prefix+'-sources.png'});
      await page.locator('#prStyleList').evaluate(e=>e.scrollIntoView({block:'center'}));await page.screenshot({path:prefix+'-styles.png'});
      for(const selector of ['#prSourceMode','#prRasterSel','#btnPrRasterAdd','#prVectorSel','#btnPrVectorAdd','#prAxisVectorSel','#btnPrUseVectorAxis','#prStyleList .pr-cor','#btnPrCSV']){
        const e=page.locator(selector).first();await e.scrollIntoViewIfNeeded();await e.click({trial:true});const r=await e.boundingBox();assert.ok(r&&r.x>=0&&r.y>=0&&r.x+r.width<=1280&&r.y+r.height<=800,'control reachable '+selector);
      }
      console.log(JSON.stringify({visual1280:{measurements,contrast,reachable:true,paths:[prefix+'-sources.png',prefix+'-styles.png']}}));
    }
    const picks={r:await selected(page,'sourceRasterIds'),v:await selected(page,'sourceLineIds')};
    await page.locator('#btnPrRefresh').click();assert.equal(await page.locator('#prSourceMode').isVisible(),true,'refresh button does not collapse source controls');await openPanel(page);
    assert.deepEqual(await selected(page,'sourceRasterIds'),picks.r);assert.deepEqual(await selected(page,'sourceLineIds'),picks.v);assert.equal(await page.locator('#prSourceMode').inputValue(),'mixed');
    state=await generate(page,2);assert.deepEqual(state.reads,['901']);
    await page.locator('#prSourceMode').selectOption('vector');state=await generate(page,1);assert.deepEqual(state.reads,[]);near(state.prof.series[0].z[0],80,'vector mode excludes stored raster');
    await page.locator('#prSourceMode').selectOption('raster');state=await generate(page,1);assert.deepEqual(state.reads,['901']);assert.ok(state.prof.series[0].z.every(z=>Math.abs(z-100)<1e-5),'raster mode excludes stored vector');

    // Removing the chip must not be undone by the still-current dropdown pick.
    await page.locator('#prSourceMode').selectOption('vector');await page.locator('#prVectorSel').selectOption(ids.pit);
    await removeSource(page,'Vector',ids.pit);await page.locator('#btnPrRefresh').click();assert.equal(await page.locator('#prSourceMode').isVisible(),true,'refresh after removal keeps controls open');await openPanel(page);
    assert.deepEqual(await selected(page,'sourceLineIds'),[]);
    assert.deepEqual(await page.evaluate(()=>profSelectedLines().map(L=>String(L.id))),[],'removed vector not silently reselected by dropdown or active layer');
    await page.evaluate(()=>{S.prof.result=null;__gridReadIds=[];});await page.locator('#btnPrRun').click();
    assert.equal((await result(page)).prof,null,'removed last vector leaves no generated profile');assert.deepEqual((await result(page)).reads,[]);

    // A multipart source provides distinct feature/part axes, independent of source type.
    await addSource(page,'Vector',ids.multi);
    const options=await page.locator('#prAxisVectorSel option').evaluateAll(options=>options.map(o=>({value:o.value,text:o.textContent})));
    for(const value of [ids.multi+':0:0',ids.multi+':0:1',ids.multi+':1:0'])assert.ok(options.some(o=>o.value===value),'explicit axis option '+value);
    assert.equal(new Set(options.map(o=>o.value)).size,options.length,'axis values unique');
    await chooseAxis(page,ids.multi+':0:1');state=await generate(page,1);near(state.prof.total,65,'second multipart axis');
    near(state.prof.series[0].z[0],300,'second part first cota');near(state.prof.series[0].z.at(-1),365,'second part final cota');
    assert.equal(state.axis.partIdx,1);assert.equal(state.axis.idx,0);
    await chooseAxis(page,ids.multi+':1:0');state=await generate(page,1);near(state.prof.total,90,'second feature axis');
    near(state.prof.series[0].z[0],400,'second feature first cota');near(state.prof.series[0].z.at(-1),490,'second feature final cota');
    const original=await page.evaluate(ids=>JSON.stringify([ids.terrain,ids.pit,ids.multi].map(id=>S.layers.find(L=>String(L.id)===id).features))===__originalFeatures,ids);
    assert.equal(original,true,'comparison does not mutate imported source geometries');
    const nextProject=await page.evaluate(()=>projectData());
    await page.locator('#projIn').setInputFiles({name:'next-project-same-ids.ccmgis',mimeType:'application/octet-stream',buffer:Buffer.from(JSON.stringify(nextProject))});
    await page.waitForFunction(()=>S.auto.name==='next-project-same-ids.ccmgis');
    const fresh=await page.evaluate(()=>({result:S.prof.result,rasters:S.prof.sourceRasterIds||[],vectors:S.prof.sourceLineIds||[],axis:S.prof.axisSelection||null,axisPick:S.prof.axisPick||'',buf:S.prof.buf,styles:S.prof.styles||{}}));
    assert.deepEqual(fresh,{result:null,rasters:[],vectors:[],axis:null,axisPick:'',buf:[],styles:{}},'opening another project clears session profile state even with colliding source IDs');
    assert.deepEqual(errors,[],'no browser errors');
    console.log(JSON.stringify({pass:true,rasterComparison:2,vectorComparison:2,mixedComparison:2,offStepVertices:[30,70],CSV:true,independentDuplicateNameStyles:true,selectionRefresh:true,removeNotReadded:true,explicitMultipartAxes:true,newProjectClean:true,errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
