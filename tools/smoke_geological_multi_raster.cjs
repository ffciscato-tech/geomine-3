// Full app, synthetic terrain/water/contact rasters, isolated Chrome only.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const bundle=path.resolve(process.argv[2]||path.join(__dirname,'../dist/GeoMine.html'));
const row=(page,id)=>page.locator('#gsecRasterProfiles [data-raster-id="'+id+'"]');
const style=(page,key)=>page.locator('#gsecStyleList [data-style-key="'+key+'"]');
const png=page=>page.locator('#gsecCanvas').evaluate(canvas=>canvas.toDataURL('image/png'));
async function openPanel(page){
  await page.locator('.ribcat[data-cat-id="geologia"]').click();
  await page.locator('.rbtn').filter({hasText:'Seção Geológica'}).click();
  await page.locator('#gsecRaster').waitFor({state:'visible'});
}
async function changed(page,before,label){
  await page.waitForFunction(before=>document.getElementById('gsecCanvas').toDataURL('image/png')!==before,before,{timeout:6000});
  assert.notEqual(await png(page),before,label+' immediately redraws exportable canvas');
}
async function setColor(locator,color){
  await locator.evaluate((input,value)=>{input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},color);
}
async function summary(page){
  return page.evaluate(()=>{
    const q=S.geology.section,r=q.result;if(!r)return null;
    return {id:q.id,rasterId:q.rasterId,resultRaster:r.rasterId,hasTerrain:r.hasTerrain,
      dist:r.profile.dist,terrain:r.profile.series[0].z,overlays:(r.rasterProfiles||[]).map(p=>({id:String(p.id),key:p.key,role:p.role,mode:p.mode,z:p.z,warning:p.warning||''})),
      selections:q.rasterProfiles,styles:q.lineStyles,resultStyles:r.lineStyles,render:r.renderGeometry,
      message:document.getElementById('gsecOut').textContent};
  });
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const page=await browser.newPage({viewport:process.env.GEOMINE_PANEL_PREFIX?{width:1280,height:800}:{width:1480,height:1050},timezoneId:'America/Sao_Paulo'}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
    await page.route(/^https?:/,route=>route.abort());
    await page.goto('file://'+bundle,{waitUntil:'load'});
    await page.waitForFunction(()=>window.GeoMineGeology?.openSection);
    await page.evaluate(()=>{
      S.workCRS='EPSG:31982';S.layers=[];S.rasters=[];S.groups=[];S.stack=[];S.img=null;
      S.projectId='isolated-multi-raster';S.setBase('Sem fundo');S.snapOn=false;
      const e=583800,n=7075000,nc=25,nr=13,cs=10;
      function raster(id,name,value,gap=false){
        const z=new Float32Array(nc*nr).fill(value);
        if(gap)for(let r=0;r<nr;r++)for(let c=9;c<=13;c++)z[r*nc+c]=NaN;
        return {id,name,visible:false,style:{mode:'hipso_hs',opacity:.8},d:{nc,nr,cs,xll:e,yll:n,z,zmin:value,zmax:value}};
      }
      S.rasters=[raster(901,'Terreno de referência',100),raster(902,'Profundidade do nível d’água',20),
        raster(903,'Contato litológico com lacuna',40,true),raster(904,'Não selecionado — 900 m',900)];
      const axis=addLayer({name:'Eixo sintético A–B',gtype:'line',crs:S.workCRS,color:'#111111',fields:[],
        features:[{geom:[[e+10,n+50],[e+210,n+50]],props:{}}]});window.__multiAxisId=axis.id;
      const unit=addLayer({name:'Unidade litológica sintética',gtype:'polygon',crs:S.workCRS,color:'#e6dbc4',
        fields:[{name:'LITOLOGIA',type:'C',length:50}],features:[{geom:[[[e,n],[e+240,n],[e+240,n+120],[e,n+120],[e,n]]],multi:true,props:{LITOLOGIA:'Unidade A'}}]});
      unit._geology={kind:'litologia'};window.__multiUnitId=unit.id;
      const ll=toWGS(S.workCRS,e+110,n+50);map.setView([ll[1],ll[0]],17,{animate:false});refreshUI();
      window.__topographyBefore=JSON.stringify(S.prof);
    });
    await openPanel(page);
    await page.locator('#gsecLineLayer').selectOption(await page.evaluate(()=>String(__multiAxisId)));
    await page.locator('#gsecUseLine').click();await page.locator('#gsecName').fill('Terreno, água e contato');
    await page.locator('#gsecFinish').click();
    await page.locator('#gsecRaster').selectOption('901');await page.locator('#gsecStep').fill('5');
    await page.locator('#gsecUseField').uncheck();await page.locator('#gsecGeologyBase').fill('0');
    await row(page,902).locator('.gsec-raster-use').check();
    await row(page,902).locator('.gsec-raster-role').selectOption('water');
    await row(page,902).locator('.gsec-raster-mode').selectOption('depth');
    await row(page,903).locator('.gsec-raster-use').check();
    await row(page,903).locator('.gsec-raster-role').selectOption('contact');
    await row(page,903).locator('.gsec-raster-mode').selectOption('elevation');
    await page.locator('#gsecGenerate').click();
    let got=await summary(page);assert.ok(got,'section generated');
    assert.equal(String(got.rasterId),'901');assert.equal(String(got.resultRaster),'901');assert.equal(got.hasTerrain,true);
    assert.ok(got.terrain.length>25&&got.terrain.every(z=>Math.abs(z-100)<1e-6),'geological reference is terrain, never water/contact');
    assert.equal(got.overlays.length,2);assert.ok(!got.overlays.some(p=>p.id==='904'),'unselected raster excluded');
    const water=got.overlays.find(p=>p.id==='902'),contact=got.overlays.find(p=>p.id==='903');
    assert.equal(water.role,'water');assert.equal(water.mode,'depth');assert.equal(water.z.length,got.dist.length);
    assert.ok(water.z.every(z=>Math.abs(z-80)<1e-6),'depth20 is subtracted from terrain100 to yield elevation80');
    assert.equal(contact.role,'contact');assert.equal(contact.mode,'elevation');assert.equal(contact.z.length,got.dist.length);
    assert.ok(contact.z.some(Number.isNaN)||contact.z.some(z=>z==null),'NoData remains absent');
    assert.ok(contact.z.filter(Number.isFinite).every(z=>Math.abs(z-40)<1e-6),'contact elevations not subtracted from terrain');
    assert.ok(contact.z.slice(0,6).some(Number.isFinite)&&contact.z.slice(-6).some(Number.isFinite),'contact spans both sides of gap');
    assert.ok(got.dist.every((distance,i)=>i===0||distance>got.dist[i-1]),'all profiles share increasing stations');
    assert.ok(await style(page,'raster:901').count(),'primary terrain has editable line style');
    assert.ok(await style(page,'raster:902').count());assert.ok(await style(page,'raster:903').count());

    const geologyRuns=await page.evaluate(()=>JSON.stringify(S.geology.section.result.runs));
    let primaryBefore=await png(page);await style(page,'raster:901').locator('.gsec-line-visible').uncheck();
    await changed(page,primaryBefore,'terrain visibility off');
    const hiddenTerrain=await summary(page);assert.equal(hiddenTerrain.hasTerrain,true);
    assert.deepEqual(hiddenTerrain.terrain,got.terrain,'hidden primary line remains physical terrain reference');
    assert.deepEqual(hiddenTerrain.overlays.find(p=>p.id==='902').z,water.z,'hidden primary does not change depth conversion');
    assert.equal(await page.evaluate(()=>JSON.stringify(S.geology.section.result.runs)),geologyRuns,'hidden terrain does not remove mapped geological domains');
    primaryBefore=await png(page);await style(page,'raster:901').locator('.gsec-line-visible').check();await changed(page,primaryBefore,'terrain visibility on');

    let previous=await png(page);
    await style(page,'raster:902').locator('.gsec-line-name').fill('Nível d’água medido');
    await style(page,'raster:902').locator('.gsec-line-name').press('Tab');await changed(page,previous,'name');
    previous=await png(page);await setColor(style(page,'raster:902').locator('.gsec-line-color'),'#0066ee');await changed(page,previous,'color');
    previous=await png(page);await style(page,'raster:902').locator('.gsec-line-width').fill('6');
    await style(page,'raster:902').locator('.gsec-line-width').press('Tab');await changed(page,previous,'width');
    const dash=style(page,'raster:902').locator('.gsec-line-dash'),dashValues=await dash.locator('option').evaluateAll(options=>options.map(option=>option.value));
    const currentDash=await dash.inputValue(),nonSolid=dashValues.find(value=>value!==currentDash&&value&&value!=='solid'&&value!=='none'&&value!=='0');assert.ok(nonSolid,'line dash choices available');
    previous=await png(page);await dash.selectOption(nonSolid);await changed(page,previous,'dash');
    previous=await png(page);await style(page,'raster:902').locator('.gsec-line-visible').uncheck();await changed(page,previous,'visibility off');
    const hidden=await summary(page);assert.deepEqual(hidden.terrain,got.terrain,'hiding water never changes terrain data');
    assert.deepEqual(hidden.overlays.find(p=>p.id==='902').z,water.z,'hiding is presentation-only');
    previous=await png(page);await style(page,'raster:902').locator('.gsec-line-visible').check();await changed(page,previous,'visibility on');

    // Test canvas itself, not just samples: no contact stroke is invented across NoData.
    await setColor(style(page,'raster:903').locator('.gsec-line-color'),'#e600ff');
    await style(page,'raster:903').locator('.gsec-line-width').fill('4');await style(page,'raster:903').locator('.gsec-line-width').press('Tab');
    const contactDash=style(page,'raster:903').locator('.gsec-line-dash');
    const solidOption=await contactDash.locator('option').evaluateAll(options=>options.find(option=>/cont[ií]nu|s[oó]lid/i.test(option.textContent))?.value);
    if(solidOption!=null)await contactDash.selectOption(solidOption);
    const pixels=await page.evaluate(()=>{
      const r=S.geology.section.result,g=r.renderGeometry,canvas=document.getElementById('gsecCanvas'),ctx=canvas.getContext('2d');
      const count=station=>{const x=Math.round(72+station*g.xScale),y=Math.round(42+(g.zMax-40)*g.yScale),
        bytes=ctx.getImageData(x-8,y-6,17,13).data;let n=0;
        for(let i=0;i<bytes.length;i+=4)if(bytes[i]>180&&bytes[i+1]<80&&bytes[i+2]>190)n++;return n;};
      return {before:count(20),gap:count(100),after:count(180)};
    });
    assert.ok(pixels.before>0&&pixels.after>0,'contact line rendered on both sides');assert.equal(pixels.gap,0,'NoData gap not bridged on canvas');
    assert.equal(await page.evaluate(()=>JSON.stringify(S.prof)===__topographyBefore),true,'geological style editor never mutates topographic profile');
    got=await summary(page);const firstId=got.id,firstStyle=structuredClone(got.styles),firstSelections=structuredClone(got.selections);
    await page.locator('#gsecSave').click();
    const firstStored=await page.evaluate(id=>S.layers.flatMap(layer=>layer.features).find(feature=>feature.props?.GEOSEC_ID===id).props,firstId);
    assert.deepEqual(JSON.parse(firstStored.RAST_PERF),firstSelections,'raster roles/modes stored on section axis');
    assert.deepEqual(JSON.parse(firstStored.LIN_EST),firstStyle,'presentation stored on section axis');

    // A second section can inherit defaults but editing it must not mutate first.
    await page.locator('#gsecNew').click();
    await page.locator('#gsecLineLayer').selectOption(await page.evaluate(()=>String(__multiAxisId)));
    await page.locator('#gsecUseLine').click();await page.locator('#gsecName').fill('Outra seção');await page.locator('#gsecFinish').click();
    await page.locator('#gsecRaster').selectOption('901');
    await row(page,902).locator('.gsec-raster-use').check();await row(page,902).locator('.gsec-raster-role').selectOption('water');
    await row(page,902).locator('.gsec-raster-mode').selectOption('depth');
    await row(page,903).locator('.gsec-raster-use').check();await row(page,903).locator('.gsec-raster-role').selectOption('contact');
    await row(page,903).locator('.gsec-raster-mode').selectOption('elevation');
    await page.locator('#gsecGenerate').click();
    const secondId=(await summary(page)).id;assert.notEqual(secondId,firstId);
    await setColor(style(page,'raster:902').locator('.gsec-line-color'),'#00aa22');await page.locator('#gsecSave').click();
    const firstUnchanged=await page.evaluate(id=>S.layers.flatMap(layer=>layer.features).find(feature=>feature.props?.GEOSEC_ID===id).props,firstId);
    assert.equal(firstUnchanged.LIN_EST,firstStored.LIN_EST,'editing second section preserves first saved styles');
    await page.locator('#gsecSaved').selectOption(firstId);await page.locator('#gsecGenerate').click();
    assert.deepEqual((await summary(page)).styles,firstStyle,'saved selection restores its own styles');

    const project=await page.evaluate(()=>projectData());
    await page.locator('#projIn').setInputFiles({name:'multi-raster-styles.ccmgis',mimeType:'application/octet-stream',buffer:Buffer.from(JSON.stringify(project))});
    await page.waitForFunction(()=>S.auto.name==='multi-raster-styles.ccmgis');await openPanel(page);
    await page.locator('#gsecSaved').selectOption(firstId);await page.locator('#gsecGenerate').click();
    got=await summary(page);assert.ok(got);assert.deepEqual(got.styles,firstStyle);assert.deepEqual(got.selections,firstSelections);
    assert.equal(await style(page,'raster:902').locator('.gsec-line-name').inputValue(),'Nível d’água medido');
    assert.equal(await style(page,'raster:902').locator('.gsec-line-color').inputValue(),'#0066ee');
    assert.equal(Number(await style(page,'raster:902').locator('.gsec-line-width').inputValue()),6);
    assert.equal(await style(page,'raster:902').locator('.gsec-line-dash').inputValue(),nonSolid);
    assert.equal(await style(page,'raster:902').locator('.gsec-line-visible').isChecked(),true);
    assert.ok(got.overlays.find(p=>p.id==='903').z.some(z=>!Number.isFinite(z)),'NoData survives project serialization');
    if(process.env.GEOMINE_SCREENSHOT)await page.locator('#gsecCanvas').screenshot({path:process.env.GEOMINE_SCREENSHOT});
    if(process.env.GEOMINE_SECTION_PNG)fs.writeFileSync(process.env.GEOMINE_SECTION_PNG,Buffer.from((await png(page)).split(',')[1],'base64'));
    if(process.env.GEOMINE_PANEL_PREFIX){
      const prefix=process.env.GEOMINE_PANEL_PREFIX;
      const measurements=await page.evaluate(()=>['#gsecRasterProfiles','#gsecStyleList','.gsec-panel','.gsec-body'].map(selector=>{
        const e=document.querySelector(selector),r=e.getBoundingClientRect();return {selector,width:r.width,client:e.clientWidth,scroll:e.scrollWidth};
      }));
      assert.ok(measurements.every(m=>m.scroll<=m.client+1),'section panel and controls have no horizontal overflow at 1280 px: '+JSON.stringify(measurements));
      const nameContrast=await page.locator('#gsecStyleList .gsec-line-name').first().evaluate(input=>{
        const css=getComputedStyle(input),luminance=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];};
        const foreground=luminance(css.color),background=luminance(css.backgroundColor);return {foreground:css.color,background:css.backgroundColor,ratio:(Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05)};
      });
      assert.ok(nameContrast.ratio>=4.5,'style name is legible in dark theme: '+JSON.stringify(nameContrast));
      await page.locator('#gsecRaster').evaluate(e=>e.scrollIntoView({block:'start'}));
      await page.screenshot({path:prefix+'-rasters.png'});
      await page.locator('#gsecStyleBox').evaluate(e=>e.scrollIntoView({block:'start'}));
      await page.screenshot({path:prefix+'-styles.png'});
      for(const selector of ['#gsecRaster','#gsecRasterProfiles .gsec-raster-role','#gsecRasterProfiles .gsec-raster-mode',
        '#gsecStyleList .gsec-line-visible','#gsecStyleList .gsec-line-name','#gsecStyleList .gsec-line-color',
        '#gsecStyleList .gsec-line-width','#gsecStyleList .gsec-line-dash','#gsecSave','#gsecPNG']){
        const control=page.locator(selector).first();await control.scrollIntoViewIfNeeded();await control.click({trial:true});
        const rect=await control.boundingBox();assert.ok(rect&&rect.x>=0&&rect.y>=0&&rect.x+rect.width<=1280&&rect.y+rect.height<=800,'reachable control '+selector);
      }
      console.log(JSON.stringify({desktopVisual:{viewport:'1280x800',measurements,nameContrast,controlsReachable:true,paths:[prefix+'-rasters.png',prefix+'-styles.png']}}));
    }

    // Missing source is diagnosed; neither another layer nor water becomes terrain.
    await page.evaluate(()=>{S.rasters=S.rasters.filter(r=>String(r.id)!=='903');GeoMineGeology.refresh();});
    await page.locator('#gsecGenerate').click();got=await summary(page);
    assert.ok(got&&got.hasTerrain,'missing additional profile does not remove available terrain');
    const missing=got.overlays.find(p=>p.id==='903');assert.ok(missing?.warning,'missing selected raster retains explicit diagnostic');
    assert.ok(!got.overlays.some(p=>p.id==='904'),'missing additional does not silently choose an unselected raster');
    await page.evaluate(()=>{S.rasters=S.rasters.filter(r=>String(r.id)!=='901');GeoMineGeology.refresh();});
    assert.equal(await page.locator('#gsecRaster').inputValue(),'901','missing primary selection retained instead of choosing first remaining raster');
    await page.locator('#gsecGenerate').click();const noTerrain=await summary(page);
    if(noTerrain){assert.equal(noTerrain.hasTerrain,false);assert.ok(noTerrain.terrain.every(z=>!Number.isFinite(z)),'water is not reclassified as ground');}
    const diagnostic=await page.evaluate(()=>[document.getElementById('gsecOut')?.textContent,document.getElementById('toast')?.textContent].join(' '));
    assert.match(diagnostic,/indispon|ausente|encontra|selecione|escolha|removid|terreno|MDT/i,'missing primary has understandable diagnostic');
    assert.equal(await page.locator('#gsecRaster').inputValue(),'901');

    // An elevation surface is meaningful without ground, but a depth-only raster is not.
    await page.locator('#gsecRaster').selectOption('');
    await row(page,902).locator('.gsec-raster-use').uncheck();
    await row(page,903).locator('.gsec-raster-use').uncheck();
    await row(page,904).locator('.gsec-raster-use').check();
    await row(page,904).locator('.gsec-raster-role').selectOption('surface');
    await row(page,904).locator('.gsec-raster-mode').selectOption('elevation');
    await page.locator('#gsecGenerate').click();const elevationOnly=await summary(page);
    assert.ok(elevationOnly,'elevation-only raster produces a section');
    assert.equal(elevationOnly.hasTerrain,false,'additional surface is not silently promoted to ground');
    assert.ok(elevationOnly.terrain.every(z=>!Number.isFinite(z)),'no invented primary terrain');
    assert.ok(elevationOnly.overlays.find(p=>p.id==='904').z.every(z=>Math.abs(z-900)<1e-6),'elevation-only data preserved');
    assert.deepEqual(elevationOnly.dist,got.dist,'elevation-only profile keeps common stations');
    assert.deepEqual(await page.evaluate(()=>S.geology.section.result.runs),[],'no invented geological domains without terrain');
    await row(page,904).locator('.gsec-raster-use').uncheck();
    await row(page,902).locator('.gsec-raster-use').check();
    await row(page,902).locator('.gsec-raster-role').selectOption('water');
    await row(page,902).locator('.gsec-raster-mode').selectOption('depth');
    await page.locator('#gsecGenerate').click();
    assert.equal(await summary(page),null,'depth-only data cannot fabricate an elevation without terrain');
    assert.equal(await page.locator('#gsecRaster').inputValue(),'','explicit no-terrain selection is retained');
    const depthDiagnostic=await page.evaluate(()=>[document.getElementById('gsecOut')?.textContent,document.getElementById('toast')?.textContent].join(' '));
    assert.match(depthDiagnostic,/profundidade.*sem cota|terreno|cota v[aá]lida/i,'depth-only failure explains missing elevation reference');
    assert.deepEqual(errors,[],'no uncaught browser errors');
    console.log(JSON.stringify({pass:true,stations:water.z.length,waterElevation:80,contactElevation:40,canvasGap:pixels,firstId,secondId,
      stylesPersisted:true,roundtrip:true,missingSourcesDiagnosed:true,elevationOnly:true,depthWithoutTerrainRejected:true,errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
