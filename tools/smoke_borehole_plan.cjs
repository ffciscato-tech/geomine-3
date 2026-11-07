// Isolated full-app regression: CSV desurvey engine -> real commit -> 2D and Layout.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const bundle=path.resolve(process.argv[2]||path.join(__dirname,'../dist/GeoMine.html')),fixture=process.argv[3]||process.env.GEOMINE_TIN_FIXTURE;
const baseline=!!process.env.GEOMINE_BASELINE;
const collar='HOLEID;X;Y;Z;DEPTH\nDEV;701400;7270500;450;500\nVERT;701520;7270700;450;200\nONLY;701650;7270800;460;\n';
const survey='HOLEID;MD;AZIMUTH;DIP\nDEV;0;45;30\nDEV;250;95;45\nDEV;500;130;60\nVERT;0;0;90\nVERT;200;0;90\n';
const near=(a,b,label,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<=tolerance,label+': '+a+' != '+b);
async function inspect(page){return page.evaluate(()=>{const L=S.layers.find(l=>l.id===__holeId),children=L.llayer.getLayers(),plan=GeoMineGeology.boreholePlan;return {
  id:L.id,attached:map.hasLayer(L.llayer),featureCount:L.features.length,
  data:JSON.stringify(L.features.map(f=>({geom:f.geom,zg:f.zg,props:f.props,trace:f.boreholeTrace,survey:f.boreholeSurvey}))),
  plans:L.features.map(f=>plan?.plan(L,f)||null),features:L.features,
  paths:children.filter(l=>l._gmBoreholePlan).map(l=>({kind:l._gmBoreholePlan,idx:l._fidx,latlngs:l.getLatLngs(),options:{pane:l.options.pane,color:l.options.color,weight:l.options.weight,dash:l.options.dashArray,interactive:l.options.interactive},attached:map.hasLayer(l),connected:!!l.getElement?.()?.isConnected})),
  points:children.filter(l=>!l._gmBoreholePlan&&Number.isInteger(l._fidx)&&typeof l.getLatLng==='function').map(l=>l._fidx),
  labels:children.filter(l=>l.options?.icon?.options?.className==='gc-label').length,
  bounds:layerBounds(L),paneZ:+getComputedStyle(map.getPane(panelDaCamada('L'+L.id))).zIndex,
  expected:L.features[0].boreholeTrace.map(p=>{const w=toWGS(L.crs,p.x,p.y);return [w[1],w[0]];})
};});}
async function layout(page){return page.evaluate(async()=>{
  S._signikaCSS='';S.loMode='fig';S.loFrozen=false;S.loZoom=1;S._base='Sem fundo';
  for(const id of ['loSat','loCoords','loCart','loLegend','loNorth','loScaleBar']){const el=document.getElementById(id);if(el)el.checked=false;}
  for(const [id,value]of Object.entries({loPaper:'auto',loFigW:180,loFigH:0,loPad:12,loMar:0,loGrid:0})){const el=document.getElementById(id);if(el)el.value=value;}
  document.getElementById('loScaleAuto').checked=true;const ok=await buildLayout();const doc=new DOMParser().parseFromString(S._lastSVG,'image/svg+xml');
  return {ok,svg:S._lastSVG,paths:Array.from(doc.querySelectorAll('.gm-borehole-plan-trace,.gm-borehole-plan-halo')).map(el=>({kind:el.getAttribute('class'),d:el.getAttribute('d'),stroke:el.getAttribute('stroke'),weight:el.getAttribute('stroke-width')}))};
});}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),errors=[],checks=[];
try{const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route(/^https?:/,r=>r.abort());
  await page.goto('file://'+bundle,{waitUntil:'load'});await page.waitForFunction(()=>window.GeoMineGeology?.boreholes&&window.GeoMineBoreholeReader);
  await page.evaluate(({collar,survey})=>{
    S.workCRS='EPSG:31982';S.setBase('Sem fundo');S.projectId='qa-borehole-plan';
    const reader=GeoMineBoreholeReader,parsed=reader.buildCSV({collar:{table:reader.parseCSV(collar),map:{id:'HOLEID',x:'X',y:'Y',z:'Z',depth:'DEPTH'}},survey:{table:reader.parseCSV(survey),map:{id:'HOLEID',md:'MD',az:'AZIMUTH',dip:'DIP'}},dipConvention:'down'});
    const L=GeoMineGeology.boreholes.__test.commitParsed(parsed,{name:'QA trajetórias de sondagem',crs:S.workCRS,unitsConfirmed:true,mode:'csv',dipConvention:'down',files:['collar.csv','survey.csv']});window.__holeId=L.id;
    window.__holeData=JSON.stringify(L.features.map(f=>({geom:f.geom,zg:f.zg,props:f.props,trace:f.boreholeTrace,survey:f.boreholeSurvey})));
    const legacy=addLayer({name:'QA boca legada sem trajetória',gtype:'point',crs:S.workCRS,features:[{geom:[[701350,7270800]],props:{Furo:'LEGACY','Cota boca':'450,5','Cota indic':340}}],fields:[{name:'Furo',type:'C'}],color:'#ffaa00'});window.__legacyId=legacy.id;
    fitLayer(L);refreshUI();
  },{collar,survey});await page.waitForTimeout(350);
  let state=await inspect(page);assert.equal(state.featureCount,3);assert.equal(state.features[0].boreholeTrace.length>3,true,'real minimum-curvature engine creates a curved multistation trace');
  if(baseline){assert.equal(state.paths.length,0);assert.deepEqual(state.points,[0,1,2]);console.log(JSON.stringify({baselineReproduced:true,tracePoints:state.features[0].boreholeTrace.length,planPaths:0}));return;}
  assert.equal(state.paths.length,2);const trace=state.paths.find(p=>p.kind==='trace'),halo=state.paths.find(p=>p.kind==='halo');assert.equal(trace.idx,0);assert.equal(halo.options.interactive,false);assert.ok(trace.latlngs.length>3);assert.equal(trace.latlngs.length,state.expected.length);
  trace.latlngs.forEach((p,i)=>{near(p.lat,state.expected[i][0],'projected latitude');near(p.lng,state.expected[i][1],'projected longitude');});
  assert.ok(state.paths.every(p=>p.options.pane==='alagis_L'+state.id&&p.attached&&p.connected));assert.deepEqual(state.points,[0,1,2]);assert.equal(state.labels,3);
  assert.equal(state.plans[1]?.vertical,true);assert.equal(state.paths.some(p=>p.idx===1||p.idx===2),false,'vertical and collar-only do not get invented horizontal traces');
  assert.equal(await page.evaluate(()=>S.layers.find(l=>l.id===__legacyId).llayer.getLayers().some(l=>l._gmBoreholePlan)),false,'legacy collar has no invented trajectory');
  const last=state.expected.at(-1),eps=1e-9;assert.ok(last[0]>=state.bounds._southWest.lat-eps&&last[0]<=state.bounds._northEast.lat+eps&&last[1]>=state.bounds._southWest.lng-eps&&last[1]<=state.bounds._northEast.lng+eps,'fit extent includes toe: '+JSON.stringify({last,bounds:state.bounds}));checks.push('real CSV desurvey -> same XY, collars/labels, no fake vertical/legacy trace, toe in bounds');
  // Click the actual SVG trace in the map, not its collar.
  const xy=await page.evaluate(()=>{S.tool='select';const L=S.layers.find(l=>l.id===__holeId),p=L.llayer.getLayers().find(p=>p._gmBoreholePlan==='trace'),ll=p.getLatLngs()[Math.floor(p.getLatLngs().length/2)],q=map.latLngToContainerPoint(ll),r=map.getContainer().getBoundingClientRect();return [q.x+r.x,q.y+r.y];});
  await page.mouse.click(...xy);assert.equal(await page.evaluate(()=>S.selFeat?.layerId===__holeId&&S.selFeat.idx===0),true,'trace click selects original borehole');await page.evaluate(()=>{closeFeatMenu();S.selFeat=null;highlightSel();});checks.push('real map click keeps original feature identity');
  for(const mode of ['attribute','category']){
    await page.evaluate(mode=>{const L=S.layers.find(l=>l.id===__holeId);if(mode==='attribute')L.attrFilter={field:'ID_FURO',op:'neq',value:'DEV'};else{L.sym.mode='cat';L.sym.field='ID_FURO';L.sym.cats=[{value:'DEV',color:'#cc1144',vis:false}];}drawLayer(L);},mode);
    assert.equal((await inspect(page)).paths.length,0);assert.equal((await layout(page)).paths.length,0,'Layout obeys '+mode+' visibility');
    await page.evaluate(()=>{const L=S.layers.find(l=>l.id===__holeId);L.attrFilter=null;L.sym.mode='single';L.sym.cats=[];drawLayer(L);});
  }checks.push('attribute and category filters remove both map/Layout trace');
  await page.evaluate(()=>{const L=S.layers.find(l=>l.id===__holeId);nodeSetVis({t:'L',id:L.id,o:L},false);});state=await inspect(page);assert.equal(state.attached,false);assert.ok(state.paths.every(p=>!p.attached&&!p.connected));assert.equal((await layout(page)).paths.length,0);
  await page.evaluate(()=>{const L=S.layers.find(l=>l.id===__holeId);nodeSetVis({t:'L',id:L.id,o:L},true);L.sym.stroke='#dd2255';L.sym.weight=4.5;drawLayer(L);});state=await inspect(page);assert.equal(state.paths.find(p=>p.kind==='trace').options.color,'#dd2255');assert.equal(state.paths.find(p=>p.kind==='trace').options.weight,4.5);
  await page.evaluate(()=>{const L=S.layers.find(l=>l.id===__holeId);L.sym.weight=0;drawLayer(L);});assert.equal((await inspect(page)).paths.length,0);assert.equal((await layout(page)).paths.length,0);await page.evaluate(()=>{const L=S.layers.find(l=>l.id===__holeId);L.sym.weight=4.5;drawLayer(L);});checks.push('layer toggle, color, thickness and zero-weight parity');
  await page.evaluate(()=>{const r={id:990,name:'QA fundo raster',d:{nc:40,nr:40,xll:701200,yll:7270400,cs:20,z:new Float32Array(1600).fill(400),native:true,resampled:1},visible:true,style:{mode:'hipso',opacity:1},overlay:null};S.rasters.push(r);renderRaster(r);S.stack=['R:990',...S.stack.filter(k=>k!=='R:990')];zApply();});
  let order=await page.evaluate(()=>({trace:+map.getPane('alagis_L'+__holeId).style.zIndex,raster:+map.getPane('alagis_R990').style.zIndex}));assert.ok(order.trace<order.raster,'trajectory respects layer order under raster');
  await page.evaluate(()=>{S.stack=['L:'+__holeId,...S.stack.filter(k=>k!=='L:'+__holeId)];zApply();});order=await page.evaluate(()=>({trace:+map.getPane('alagis_L'+__holeId).style.zIndex,raster:+map.getPane('alagis_R990').style.zIndex}));assert.ok(order.trace>order.raster,'trajectory follows layer above raster');checks.push('trajectory shares layer pane, never forced overlay');
  const plot=await layout(page);assert.equal(plot.ok,true);assert.equal(plot.paths.length,2);assert.equal(plot.paths[0].d,plot.paths[1].d,'halo and trace exactly aligned');state=await inspect(page);
  const coords=plot.paths.find(p=>p.kind.includes('trace')).d.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number),world=state.plans[0].points;assert.equal(coords.length,world.length*2);
  const end=world.length-1,sx=(coords[end*2]-coords[0])/(world[end][0]-world[0][0]),sy=(coords[end*2+1]-coords[1])/(world[end][1]-world[0][1]);assert.ok(sx>0&&sy<0);near(sx,-sy,'Layout equal XY scale',.001);
  world.forEach((p,i)=>{near(coords[i*2],coords[0]+sx*(p[0]-world[0][0]),'Layout trace X',.02);near(coords[i*2+1],coords[1]+sy*(p[1]-world[0][1]),'Layout trace Y',.02);});checks.push('full Layout SVG contains same native XY path');
  assert.equal(state.data,await page.evaluate(()=>__holeData),'render/filter/style does not mutate source geometry or attributes');
  const saved=await page.evaluate(()=>projectData()),beforeData=state.data;
  await page.locator('#projIn').setInputFiles({name:'qa-borehole-plan.ccmgis',mimeType:'application/octet-stream',buffer:Buffer.from(JSON.stringify(saved))});await page.waitForFunction(()=>S.auto.name==='qa-borehole-plan.ccmgis');state=await inspect(page);assert.equal(state.paths.length,2);assert.equal(state.data,beforeData);checks.push('native save/reopen preserves data and redraws trajectory');
  await page.evaluate(()=>{const r=S.rasters.find(r=>r.id===990);nodeSetVis({t:'R',id:r.id,o:r},false);fitLayer(S.layers.find(l=>l.id===__holeId));refreshUI();});await page.waitForTimeout(200);
  const screenshots=[];for(const [name,size]of [['desktop',{width:1440,height:1000}],['tablet',{width:1024,height:768}]]){await page.setViewportSize(size);await page.waitForTimeout(700);await page.evaluate(()=>{map.stop();map.invalidateSize();fitLayer(S.layers.find(l=>l.id===__holeId));});await page.waitForTimeout(700);
    const visual=await page.evaluate(()=>{const el=document.querySelector('.gm-borehole-plan-trace'),r=el.getBoundingClientRect(),m=map.getContainer().getBoundingClientRect();return {connected:el.isConnected,length:el.getTotalLength(),path:el.getAttribute('d'),rect:r.toJSON(),map:m.toJSON()};});
    assert.ok(visual.connected&&visual.length>50&&visual.rect.right>visual.map.left&&visual.rect.left<visual.map.right&&visual.rect.bottom>visual.map.top&&visual.rect.top<visual.map.bottom,name+': trace visually intersects viewport '+JSON.stringify(visual));
    const p=path.resolve(__dirname,'../borehole-plan-'+name+'.png');await page.screenshot({path:p});screenshots.push(p);}
  if(fixture){const fixturePath=path.resolve(fixture),before=crypto.createHash('sha256').update(fs.readFileSync(fixturePath)).digest('hex');await page.locator('#projIn').setInputFiles(fixturePath);await page.waitForFunction(()=>S.layers.some(l=>l.id===14&&l.name==='Sondagens'));for(let i=0;i<4;i++){if(await page.locator('[data-pf="no"]').isVisible())await page.locator('[data-pf="no"]').click();await page.waitForTimeout(150);}
    assert.equal(await page.evaluate(()=>S.layers.find(l=>l.id===14).visible),false);await page.locator('.layer').filter({has:page.locator('.nm').filter({hasText:/^Sondagens$/})}).locator('.eye').click();const legacy=await page.evaluate(()=>{const L=S.layers.find(l=>l.id===14);return {attached:map.hasLayer(L.llayer),points:L.llayer.getLayers().filter(c=>Number.isInteger(c._fidx)&&typeof c.getLatLng==='function').length,traces:L.llayer.getLayers().filter(c=>c._gmBoreholePlan).length};});assert.deepEqual(legacy,{attached:true,points:12,traces:0});assert.equal(crypto.createHash('sha256').update(fs.readFileSync(fixturePath)).digest('hex'),before);checks.push('real legacy fixture: hidden collars turn on, no invented trajectory, source intact');}
  assert.deepEqual(errors,[]);console.log(JSON.stringify({pass:true,checks,screenshots,errors},null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
