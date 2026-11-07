// Full bundle + native browser inputs; synthetic project in isolated Chrome only.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const bundle=path.resolve(process.argv[2]||path.join(__dirname,'../dist/GeoMine.html'));
const points={a:{x:930,y:380},b:{x:1060,y:520},c:{x:950,y:660},d:{x:1080,y:720}};
const axisState=page=>page.evaluate(()=>({
  axes:S.layers.filter(layer=>layer.gtype==='line'&&layer.features?.some(feature=>feature.props?.GEOSEC_ID)).map(layer=>({
    id:layer.id,name:layer.name,crs:layer.crs,groupId:layer.groupId,visible:layer.visible,fields:layer.fields,
    features:layer.features.map(feature=>({geom:feature.geom,multi:feature.multi,props:feature.props})),
    drawn:!!layer.llayer,listed:!!document.querySelector('[data-lid="'+layer.id+'"]')})),
  tool:S.tool,id:S.geology.section.id,line:S.geology.section.line,lineWgs:S.geology.section.lineWgs,
  saved:Array.from(document.querySelector('#gsecSaved')?.options||[]).filter(option=>option.value).map(option=>({id:option.value,name:option.textContent})),
  groups:S.groups.map(group=>({id:group.id,name:group.name,collapsed:group.collapsed})),stack:S.stack.slice()
}));
async function click(page,key){const p=points[key];await page.mouse.click(p.x,p.y);}
async function openPanel(page){
  await page.locator('.ribcat[data-cat-id="geologia"]').click();
  await page.locator('.rbtn').filter({hasText:'Seção Geológica'}).click();
  await page.locator('#gsecDraw').waitFor({state:'visible'});
}
function equalXY(a,b,label,tol=1e-7){
  assert.equal(a.length,b.length,label+' point count');
  a.forEach((point,i)=>point.slice(0,2).forEach((value,j)=>assert.ok(Math.abs(value-b[i][j])<=tol,label+' position '+i+'/'+j+': '+value+' versus '+b[i][j])));
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1480,height:950},timezoneId:'America/Sao_Paulo'}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
    await page.route(/^https?:/,route=>route.abort());
    await page.goto('file://'+bundle,{waitUntil:'load'});
    await page.waitForFunction(()=>window.GeoMineGeology?.openSection);
    await page.evaluate(()=>{
      S.workCRS='EPSG:31982';S.layers=[];S.rasters=[];S.groups=[];S.stack=[];S.img=null;
      S.projectId='isolated-section-axis-layers';S.setBase('Sem fundo');
      map.setView([-26.4,-50.2],16,{animate:false});S.snapOn=false;
    });
    await openPanel(page);
    for(const point of Object.values(points)){
      assert.equal(await page.evaluate(point=>map.getContainer().contains(document.elementFromPoint(point.x,point.y)),point),true,'drawing input must target real map');
    }
    await page.locator('#gsecDraw').click();await page.locator('#gsecName').fill('Principal A–B');await click(page,'a');
    assert.equal((await axisState(page)).axes.length,0,'one point never creates partial layer');
    await click(page,'a');assert.equal((await axisState(page)).lineWgs.length,1,'repeated identical coordinate cannot form zero-length axis');
    await page.locator('#gsecFinish').click();assert.equal((await axisState(page)).axes.length,0,'premature finish creates no layer');
    await click(page,'b');
    const drawn=(await axisState(page)).lineWgs;
    await page.locator('#gsecFinish').click();
    let state=await axisState(page);
    assert.equal(state.axes.length,1,'finish automatically creates real layer without Generate/Save');
    assert.equal(state.axes[0].features.length,1);assert.equal(state.axes[0].features[0].props.NOME,'Principal A–B');
    assert.equal(state.tool,'select');assert.ok(state.axes[0].drawn,'real Leaflet layer exists');
    assert.ok(state.stack.includes('L:'+state.axes[0].id),'layer is in real draw/tree stack');
    assert.equal(state.groups.find(group=>group.id===state.axes[0].groupId)?.collapsed,false,'section group automatically expanded');
    assert.ok(state.saved.some(saved=>saved.id===state.id),'axis is selectable as saved section immediately');
    let first=structuredClone(state.axes[0]);const firstId=state.id;
    const firstExpected=await page.evaluate(ll=>ll.map(point=>fromWGS(S.workCRS,point[1],point[0])),drawn);
    equalXY(first.features[0].geom,firstExpected,'finished line coordinate/CRS');
    const firstTreeVisible=await page.evaluate(id=>{
      const layer=S.layers.find(layer=>layer.id===id);
      return document.getElementById('layers')?.textContent?.includes(layer.name)||
        Array.from(document.querySelectorAll('.lrow,.layer-item,[data-lid]')).some(node=>node.textContent.includes(layer.name));
    },first.id);
    // The DOM identifier differs across tree implementations; visible name is the contract.
    assert.ok(firstTreeVisible||await page.getByText(first.name,{exact:true}).count(),'completed section appears in layer tree');
    const firstRow=page.locator('.layer').filter({has:page.getByText(first.name,{exact:true})});
    await firstRow.locator('.eye').click();
    const hidden=await page.evaluate(id=>{const layer=S.layers.find(layer=>layer.id===id);
      return {visible:layer.visible,onMap:map.hasLayer(layer.llayer),temporaryAxes:document.querySelectorAll('.gsec-axis').length};},first.id);
    assert.deepEqual(hidden,{visible:false,onMap:false,temporaryAxes:0},'tree visibility hides axis with no leftover temporary line');
    await firstRow.locator('.eye').click();assert.equal((await axisState(page)).axes[0].visible,true);
    await page.locator('#gsecFinish').click();await page.locator('#gsecFinish').click();
    assert.equal((await axisState(page)).axes.length,1,'repeated finish is idempotent');
    await page.evaluate(()=>GeoMineGeology.saveCurrent());
    assert.equal((await axisState(page)).axes.length,1,'saving completed line does not duplicate it');
    first=structuredClone((await axisState(page)).axes[0]);

    // Starting another line is a new section even without first choosing Nova.
    await page.locator('#gsecDraw').click();await page.locator('#gsecName').fill('Secundária C–D');await click(page,'c');
    assert.equal((await axisState(page)).axes.length,1,'unfinished new line leaves first layer alone');
    await click(page,'d');
    await page.evaluate(()=>{
      const line=S.geology.section.lineWgs.map(point=>fromWGS(S.workCRS,point[1],point[0])),xs=line.map(p=>p[0]),ys=line.map(p=>p[1]),cs=25,
        xll=Math.floor((Math.min(...xs)-100)/cs)*cs,yll=Math.floor((Math.min(...ys)-100)/cs)*cs,
        nc=Math.ceil((Math.max(...xs)+100-xll)/cs)+1,nr=Math.ceil((Math.max(...ys)+100-yll)/cs)+1;
      S.rasters=[{id:901,name:'MDT sintético',visible:false,style:{mode:'hipso_hs',opacity:.8},
        d:{nc,nr,cs,xll,yll,z:new Float32Array(nc*nr).fill(100),zmin:100,zmax:100}}];
      GeoMineGeology.refresh();
    });
    await page.locator('#gsecRaster').selectOption('901');await page.locator('#gsecUseField').uncheck();
    await page.locator('#gsecGenerate').click();
    await page.waitForFunction(()=>S.tool==='select');
    state=await axisState(page);
    assert.equal(state.axes.length,2,'Generate while drawing creates second independent layer');
    assert.equal(state.lineWgs.length,2,'Generate does not duplicate endpoint');
    assert.equal(await page.evaluate(()=>S.geology.section.result?.line.length),2,'second section was actually generated');
    assert.notEqual(state.id,firstId,'different axes use distinct section IDs');
    const secondId=state.id,second=state.axes.find(layer=>layer.features[0].props.GEOSEC_ID===secondId);
    assert.ok(second);assert.notEqual(second.id,first.id);assert.equal(second.features.length,1);
    assert.deepEqual(state.axes.find(layer=>layer.id===first.id),first,'drawing second section preserves first layer and feature');
    await page.locator('#gsecFinish').click();await page.locator('#gsecSave').click();
    assert.equal((await axisState(page)).axes.length,2);
    await page.locator('#gsecClear').click();assert.equal((await axisState(page)).axes.length,2,'Clear only clears the working trace, not saved layers');
    await page.locator('#gsecDraw').click();await click(page,'a');await page.keyboard.press('Escape');
    if(!await page.locator('#gsecClear').isVisible())await openPanel(page);
    assert.equal((await axisState(page)).axes.length,2,'cancel never materializes one-point trace');
    await page.locator('#gsecClear').click();
    assert.equal((await axisState(page)).lineWgs.length,0);

    // Existing vector is copied as an axis; never re-tag or overwrite the original.
    const source=await page.evaluate(()=>{
      const points=[[1100,780],[1000,800]].map(([x,y])=>{const ll=map.mouseEventToLatLng({clientX:x,clientY:y});return [ll.lng,ll.lat];});
      const layer=addLayer({name:'Estrada original — manter',gtype:'line',crs:'EPSG:4326',color:'#a54129',
        fields:[{name:'CUSTOM',type:'C',length:60}],features:[{geom:points,props:{CUSTOM:'não sobrescrever'}}]});
      window.__axisSourceId=layer.id;GeoMineGeology.refresh();
      return {id:layer.id,name:layer.name,crs:layer.crs,fields:layer.fields,features:layer.features};
    });
    await page.locator('#gsecName').fill('Eixo pela estrada');
    await page.locator('#gsecLineLayer').selectOption(String(source.id));
    await page.locator('#gsecUseLine').click();await page.locator('#gsecFinish').click();
    await page.evaluate(()=>GeoMineGeology.saveCurrent());
    state=await axisState(page);assert.equal(state.axes.length,3,'source vector creates one independent section axis');
    const sourceAfter=await page.evaluate(()=>{const layer=S.layers.find(layer=>layer.id===__axisSourceId);
      return {id:layer.id,name:layer.name,crs:layer.crs,fields:layer.fields,features:layer.features};});
    assert.deepEqual(sourceAfter,source,'source layer remains untouched');

    // Real project serialization + actual reopening input, without relying on in-memory objects.
    const serialized=await page.evaluate(()=>projectData()),savedAxes=structuredClone(state.axes);
    const serializedAxes=serialized.layers.filter(layer=>layer.features?.some(feature=>feature.props?.GEOSEC_ID));
    assert.equal(serializedAxes.length,3,'all finished axes are in projectData before explicit section save');
    await page.locator('#projIn').setInputFiles({name:'section-axis-layers.ccmgis',mimeType:'application/octet-stream',buffer:Buffer.from(JSON.stringify(serialized))});
    await page.waitForFunction(()=>S.auto.name==='section-axis-layers.ccmgis');
    await openPanel(page);state=await axisState(page);assert.equal(state.axes.length,3,'all axes survive project reopen');
    for(const saved of savedAxes){
      const reopened=state.axes.find(layer=>String(layer.id)===String(saved.id));assert.ok(reopened,saved.name+' reopened');
      assert.equal(reopened.name,saved.name);assert.deepEqual(reopened.fields,saved.fields);assert.deepEqual(reopened.features,saved.features);
      assert.equal(reopened.crs,saved.crs);assert.equal(reopened.groupId,saved.groupId);
    }
    await page.locator('#gsecSaved').selectOption(firstId);
    equalXY((await axisState(page)).line,first.features[0].geom,'saved section loads from its real layer');

    // Legacy projects could keep multiple axes in a shared line layer in another CRS.
    const legacy=await page.evaluate(()=>{
      const line=[[-50.201,-26.401],[-50.202,-26.402]],other=[[-50.205,-26.402],[-50.204,-26.404]],
        layer=addLayer({name:'Eixos legados compartilhados',gtype:'line',crs:'EPSG:4326',color:'#345678',
          fields:[{name:'GEOSEC_ID',type:'C',length:32},{name:'NOME',type:'C',length:80},{name:'CUSTOM',type:'C',length:100}],
          features:[{geom:line,props:{GEOSEC_ID:'LEGACY-A',NOME:'Legada A',CUSTOM:'preservar A'}},
            {geom:other,props:{GEOSEC_ID:'LEGACY-B',NOME:'Legada B',CUSTOM:'preservar B'}}]});
      // addLayer normalizes new layers to work CRS. Recreate a genuine legacy
      // stored EPSG:4326 layer explicitly, without changing the test project CRS.
      layer.crs='EPSG:4326';
      layer.features[0].geom=[[-50.201,-26.401],[-50.202,-26.402]];
      layer.features[1].geom=[[-50.205,-26.402],[-50.204,-26.404]];drawLayer(layer);
      window.__legacySectionLayer=layer.id;GeoMineGeology.refresh();
      return {id:layer.id,name:layer.name,fields:layer.fields,features:layer.features,crs:layer.crs};
    });
    await page.locator('#gsecSaved').selectOption('LEGACY-B');
    const legacyLoaded=await axisState(page);
    const legacyExpected=await page.evaluate(line=>line.map(point=>fromWGS(S.workCRS,point[0],point[1])),legacy.features[1].geom);
    equalXY(legacyLoaded.line,legacyExpected,'legacy axis is reprojected to section work CRS');
    await page.locator('#gsecName').fill('Legada B revisada');await page.evaluate(()=>GeoMineGeology.saveCurrent());
    const legacyAfter=await page.evaluate(()=>{
      const original=S.layers.find(layer=>layer.id===__legacySectionLayer),hits=[];
      for(const layer of S.layers)for(const feature of layer.features||[])if(feature.props?.GEOSEC_ID==='LEGACY-B')hits.push({crs:layer.crs,geom:feature.geom,props:feature.props});
      return {name:original.name,fields:original.fields,first:original.features.find(feature=>feature.props?.GEOSEC_ID==='LEGACY-A'),hits};
    });
    assert.equal(legacyAfter.name,legacy.name,'editing one legacy axis does not rename entire shared layer');
    for(const field of legacy.fields)assert.ok(legacyAfter.fields.some(item=>JSON.stringify(item)===JSON.stringify(field)),'legacy custom schema preserved');
    assert.deepEqual(legacyAfter.first,legacy.features[0],'other legacy axis untouched');
    assert.equal(legacyAfter.hits.length,1,'legacy save does not duplicate target section ID');
    assert.equal(legacyAfter.hits[0].props.NOME,'Legada B revisada');
    assert.equal(legacyAfter.hits[0].props.CUSTOM,'preservar B','target unknown attributes preserved');
    const legacyWorld=await page.evaluate(target=>target.geom.map(point=>toWGS(target.crs,point[0],point[1])),legacyAfter.hits[0]);
    equalXY(legacyWorld,legacy.features[1].geom,'legacy edit preserves actual geographic coordinates');
    assert.deepEqual(errors,[],'no uncaught browser error');
    console.log(JSON.stringify({pass:true,automaticLayers:3,firstId,secondId,roundtrip:true,legacyShared:true,errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
