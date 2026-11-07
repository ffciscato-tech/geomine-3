const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const SOURCE='https://paranainterativo.pr.gov.br/interativo/rest/services/BaseDadosParanaInterativo/FeatureServer/14';
 let scenario='ok',requests=0;
 await page.route(/^https?:/,async route=>{
  const u=new URL(route.request().url());if(!u.href.startsWith(SOURCE))return route.abort();
  let body;
  if(u.pathname.endsWith('/14'))body={geometryType:'esriGeometryPolyline',objectIdField:'OBJECTID',maxRecordCount:1};
  else if(u.searchParams.get('returnIdsOnly'))body={objectIds:scenario==='empty'?[]:[1,2]};
  else{requests++;const id=+u.searchParams.get('objectIds');body={type:'FeatureCollection',features:scenario==='incomplete'&&id===2?[]:[{type:'Feature',id,properties:{OBJECTID:id,TipoAbstDeAgua:id===1?'Rede pública':null,TipoColetaEsgoto:'Sem Informação'},geometry:{type:'LineString',coordinates:[[-51,-23.5],[-50.999,-23.5]]}}]};}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(pathToFileURL(path.resolve(__dirname,'../dist/GeoMine.html')).href);
 await page.waitForFunction(()=>window.GeoMineSanepar&&window.GeoMineMouseRotation&&window.GeoMineSessionAutosave?.state.booted,{timeout:30000});
 await page.evaluate(()=>{
  S.setBase('Sem fundo');S.workCRS='EPSG:31982';
  window.testLayer=addLayer({name:'Rotation test',gtype:'line',crs:S.workCRS,fields:[],features:[{geom:[[500000,7400000,12],[500100,7400000,13]],props:{}}]});
  edSelecionar({L:testLayer,idx:0,f:testLayer.features[0]},true);edLigar(true,true);
  const c=toWGS(S.workCRS,500000,7400000);map.setView([c[1],c[0]],18,{animate:false});
 });
 await page.evaluate(()=>edAbreGirar());
 assert.equal(await page.locator('#edGirModo').inputValue(),'mouse');await page.locator('#edGirOk').click();
 assert.equal(await page.evaluate(()=>GeoMineMouseRotation.state().phase),'reference');
 async function pixel(x,y){return page.evaluate(([x,y])=>{const q=toWGS(S.workCRS,x,y),p=map.latLngToContainerPoint([q[1],q[0]]),r=map.getContainer().getBoundingClientRect();return {x:p.x+r.left,y:p.y+r.top};},[x,y]);}
 const pivot=await pixel(500000,7400000),ref=await pixel(500100,7400000),dest=await pixel(500050,7400050);
 assert.deepEqual(await page.evaluate(()=>GeoMineMouseRotation.state().center),[500050,7400000]);
 const before=await page.evaluate(()=>JSON.stringify(testLayer.features[0].geom));
 await page.mouse.click(ref.x,ref.y);await page.mouse.move(dest.x,dest.y);await page.waitForTimeout(80);
 assert.equal(await page.evaluate(()=>JSON.stringify(testLayer.features[0].geom)),before,'preview must not mutate geometry');
 assert.ok(Math.abs((await page.evaluate(()=>GeoMineMouseRotation.state().degrees))-90)<.5);
 await page.mouse.click(dest.x,dest.y);
 let result=await page.evaluate(()=>({state:GeoMineMouseRotation.state(),geom:testLayer.features[0].geom,undo:S.undo.at(-1)?.msg}));
 assert.equal(result.state,null);assert.ok(Math.abs(result.geom[1][0]-500050)<1);assert.ok(Math.abs(result.geom[1][1]-7400050)<1);assert.equal(result.geom[1][2],13);assert.equal(result.undo,'girar com mouse');
 await page.evaluate(()=>doUndo());assert.equal(await page.evaluate(()=>JSON.stringify(testLayer.features[0].geom)),before);
 console.log('PASS centroid mouse rotation, preview isolation, Z and undo');
 await page.evaluate(()=>edAbreGirar());await page.locator('#edGirModo').selectOption('angulo');await page.locator('#edGirVal').fill('90');await page.locator('#edGirOk').click();
 const numeric=await page.evaluate(()=>testLayer.features[0].geom);assert.ok(Math.abs(numeric[1][0]-500050)<1e-6);assert.ok(Math.abs(numeric[1][1]-7400050)<1e-6);
 await page.evaluate(()=>doUndo());assert.equal(await page.evaluate(()=>JSON.stringify(testLayer.features[0].geom)),before);
 console.log('PASS numeric rotation uses the same geometric centroid');
 await page.evaluate(()=>GeoMineMouseRotation.start());await page.mouse.click(ref.x,ref.y);await page.mouse.move(dest.x,dest.y);await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>JSON.stringify(testLayer.features[0].geom)),before);assert.equal(await page.locator('#gmRotationHint').count(),0);
 await page.evaluate(()=>{GeoMineMouseRotation.start();setTool('line');});assert.equal(await page.evaluate(()=>GeoMineMouseRotation.state()),null);
 console.log('PASS Esc and tool switch discard preview');
 await page.evaluate(()=>{setTool('select');GeoMineMouseRotation.start({pivot:'point'});});assert.equal(await page.evaluate(()=>GeoMineMouseRotation.state().phase),'center');
 await page.mouse.click(pivot.x,pivot.y);assert.equal(await page.evaluate(()=>GeoMineMouseRotation.state().phase),'reference');await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>JSON.stringify(testLayer.features[0].geom)),before);console.log('PASS manual pivot remains available');
 await page.evaluate(()=>setTool('select'));
 await page.locator('.ribcat[data-cat-id="ambiente"]').click();
 const button=page.locator('#ribbon .rbtn').filter({hasText:/^Mapas da Sanepar$/});assert.equal(await button.count(),1);
 await page.evaluate(()=>{for(let i=0;i<10;i++)ribbonBuild();});assert.equal(await button.count(),1);await button.click();
 await page.locator('#sanImport').click();await page.waitForFunction(()=>document.getElementById('sanStatus').textContent.includes('importados'));
 assert.equal(requests,2);
 result=await page.evaluate(()=>({count:S.layers[0].features.length,mode:S.layers[0].sym.mode,source:S.layers[0].sourceUrl,cats:S.layers[0].sym.cats,active:S.layers.length}));
 assert.equal(result.count,2);assert.equal(result.mode,'cat');assert.equal(result.source,SOURCE);assert.ok(result.cats.some(c=>c.label==='Sem informação'));
 console.log('PASS unique environmental icon and complete paginated import with source and categories');
 scenario='incomplete';await page.locator('#sanImport').click();await page.waitForFunction(()=>document.getElementById('sanStatus').textContent.includes('Faltam trechos'));
 assert.equal(await page.evaluate(()=>S.layers.length),result.active);
 scenario='empty';await page.locator('#sanImport').click();await page.waitForFunction(()=>document.getElementById('sanStatus').textContent.includes('Nenhum trecho'));
 assert.equal(await page.evaluate(()=>S.layers.length),result.active);
 console.log('PASS incomplete and empty service responses never create partial layers');
 await page.screenshot({path:path.resolve(process.env.GEOMINE_QA_DIR,'sanepar-panel.png')});
 assert.deepEqual(errors,[]);console.log('PASS no browser runtime errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
