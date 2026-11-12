// Integração no aplicativo montado: geometria, consulta, ZIP e projeto.
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:/,r=>r.abort());
  await page.goto(pathToFileURL(path.resolve(__dirname,'../../..','dist/GeoMine.html')).href);
  await page.waitForFunction(()=>window.GeoMineResearch&&window.GeoMineSessionAutosave?.state.booted);
  const metrics=await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31982';
   window.rpTestLayer=addLayer({name:'Área teste <segura>',gtype:'polygon',crs:S.workCRS,fields:[],features:[{geom:[[500000,7400000],[500100,7400000],[500100,7400100],[500000,7400100],[500000,7400000]],props:{}}]});
   const g=GeoMineResearch.geometry(rpTestLayer,rpTestLayer.features[0]);
   return {area:g.area,perimeter:g.perimeter};
  });
  assert.ok(Math.abs(metrics.area-10000)<.02);assert.ok(Math.abs(metrics.perimeter-400)<.01);
  await page.locator('[data-cat-id="gis"]').click();
  await page.locator('#ribbon .rbtn').filter({hasText:'Requerimento de Pesquisa'}).click();
  assert.equal(await page.locator('#rpModal.on').count(),1);
  if(process.env.SCREENSHOT_PATH)await page.screenshot({path:process.env.SCREENSHOT_PATH});
  await page.locator('#rprequerente').fill('Empresa <teste>');
  await page.locator('#rptitulo').fill('Pesquisa teste');
  const invalid=await page.evaluate(()=>{
   const run=(geom,crs=rpTestLayer.crs)=>{try{GeoMineResearch.geometry({...rpTestLayer,crs},{geom});return false;}catch(e){return true;}};
   return [run([[0,0],[100,100],[0,100],[100,0]]),run([[[0,0],[100,0],[100,100]],[[20,20],[30,20],[30,30]]]),run([[1,1],[2,1],[2,2]],'INVALID:CRS'),run([[0,0],[1,0],[1,0],[1,1]])];
  });
  assert.deepEqual(invalid,[true,true,true,true]);
  await page.evaluate(()=>{
   window.rpCalls=[];anmMeta=async()=>({oid:'OBJECTID'});
   anmArcRequest=async p=>{rpCalls.push(p);return p.returnIdsOnly?{objectIds:[7]}:{features:[{attributes:{OBJECTID:7,PROCESSO:'123.456/2026',FASE:'REQUERIMENTO',NOME:'Titular <teste>'}}]};};
  });
  await page.locator('#rpConsult').click();await page.waitForFunction(()=>document.getElementById('rpQuery').textContent.includes('123.456/2026'));
  assert.equal(await page.evaluate(()=>rpCalls[0].geometryType),'esriGeometryPolygon');
  const downloadPromise=page.waitForEvent('download');await page.locator('#rpExport').click();
  const download=await downloadPromise,stream=await download.createReadStream(),chunks=[];
  for await(const c of stream)chunks.push(c);
  const zip=await require(process.env.JSZIP_MODULE||'jszip').loadAsync(Buffer.concat(chunks));
  const html=await zip.file('requerimento.html').async('string');
  assert.match(html,/Empresa &lt;teste&gt;/);assert.match(html,/123.456\/2026/);
  assert.ok(zip.file('vertices-sirgas2000.csv'));assert.ok(zip.file('planta-esquematica.svg'));
  const geo=JSON.parse(await zip.file('poligonal.geojson').async('string'));
  assert.equal(geo.features[0].geometry.coordinates[0].length,5);
  const persistence=await page.evaluate(()=>{
   const saved=projectData();const copy=saved.researchRequest;S.researchRequest=null;
   loadProject(saved);return {saved:copy.values.requerente,loaded:S.researchRequest.values.requerente};
  });
  assert.deepEqual(persistence,{saved:'Empresa <teste>',loaded:'Empresa <teste>'});
  await page.evaluate(()=>{GeoMineResearch.open();anmArcRequest=async()=>{throw Error('Servidor indisponível');};});
  await page.locator('#rpConsult').click();await page.waitForFunction(()=>document.getElementById('rpQuery').textContent.includes('não concluída'));
  await page.evaluate(()=>{anmArcRequest=async p=>p.returnIdsOnly?{objectIds:[]}:{features:[]};});
  await page.locator('#rpConsult').click();await page.waitForFunction(()=>document.getElementById('rpQuery').textContent.includes('não comprova'));
  // Uma mudança geométrica torna o resultado antigo inválido na exportação.
  await page.evaluate(()=>{
   const L=S.layers.find(L=>String(L.id)===document.getElementById('rpLayer').value);
   L.features[0].geom[1][0]+=1;
  });
  const stalePromise=page.waitForEvent('download');await page.locator('#rpExport').click();
  const staleStream=await (await stalePromise).createReadStream(),staleChunks=[];
  for await(const c of staleStream)staleChunks.push(c);
  const staleZip=await require(process.env.JSZIP_MODULE||'jszip').loadAsync(Buffer.concat(staleChunks));
  assert.equal(staleZip.file('interferencias-anm.json'),null);
  assert.match(await staleZip.file('requerimento.html').async('string'),/Consulta não realizada ou desatualizada/);
  await page.evaluate(()=>{anmArcRequest=async p=>p.returnIdsOnly?{objectIds:[7,8]}:{features:[{attributes:{OBJECTID:7}}]};});
  await page.locator('#rpConsult').click();await page.waitForFunction(()=>document.getElementById('rpQuery').textContent.includes('incompleto'));
  assert.deepEqual(errors,[]);
  console.log('PASS: medidas UTM, geometria inválida, cadastro, consulta por poligonal, ZIP, HTML seguro, GeoJSON, persistência e falha/vazio ANM.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
