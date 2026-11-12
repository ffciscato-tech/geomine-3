const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),errors=[],requests=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:/,r=>{requests.push(r.request().url());return r.abort();});
  await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'));await page.waitForFunction(()=>window.GeoMineCrsNavigator);
  await page.evaluate(()=>{S.workCRS='EPSG:31983';refreshUI();});
  const snapshot=await page.evaluate(()=>JSON.stringify({layers:S.layers,crs:S.workCRS,active:S.activeId}));
  await page.locator('#roCRS').click();await page.locator('#gmCrsCityQuery').fill('sao paulo');
  assert.ok(await page.locator('#gmCrsCityResults button').count()>0);
  await page.getByRole('button',{name:'São Paulo — SP',exact:true}).click();
  await page.locator('#gmCrsPreviewCode').selectOption('EPSG:4326');
  assert.equal(await page.evaluate(()=>S.workCRS),'EPSG:31983');
  await page.screenshot({path:path.resolve(__dirname,'../crs-city-desktop.png')});
  await page.locator('#gmCrsCityGo').click();
  const center=await page.evaluate(()=>({lat:map.getCenter().lat,lng:map.getCenter().lng,zoom:map.getZoom()}));
  const city=await page.evaluate(()=>GeoMineCrsNavigator.search('sao paulo','SP')[0]);
  assert.ok(Math.abs(center.lat-city[3])<.0003&&Math.abs(center.lng-city[4])<.0003,JSON.stringify(center));assert.equal(center.zoom,12);
  assert.equal(await page.evaluate(()=>JSON.stringify({layers:S.layers,crs:S.workCRS,active:S.activeId})),snapshot);
  for(const viewport of [{width:1024,height:600},{width:600,height:800}]){
   await page.setViewportSize(viewport);await page.locator('#roCRS').click();
   await page.locator('#gmCrsCityQuery').fill('adrianopolis');assert.equal(await page.locator('#gmCrsCityResults button').count(),1);
   await page.locator('#gmCrsCityResults button').click();await page.locator('#gmCrsCityGo').scrollIntoViewIfNeeded();
   const box=await page.locator('#gmCrsNavigator .gm-crs-panel').boundingBox();assert.ok(box.y>=0&&box.y+box.height<=viewport.height);
   await page.screenshot({path:path.resolve(__dirname,'../crs-city-'+viewport.width+'.png')});
   await page.keyboard.press('Escape');assert.equal(await page.locator('#gmCrsNavigator').count(),0);
  }
  await page.setViewportSize({width:1440,height:1000});await page.locator('#roCRS').click();
  await page.locator('#gmCrsCityQuery').fill('bom jesus');assert.ok(await page.locator('#gmCrsCityResults button').count()>1);
  await page.locator('#gmCrsCityUF').selectOption('PI');assert.equal(await page.locator('#gmCrsCityResults button').count(),1);
  await page.locator('#gmCrsCityQuery').fill('zzzzzzzz');assert.match(await page.locator('#gmCrsCityStatus').textContent(),/Nenhuma/);
  await page.locator('#gmCrsPreviewCode').selectOption('EPSG:22518');assert.match(await page.locator('#gmCrsAreaInfo').textContent(),/indisponível/);
  await page.locator('#gmCrsChangeProject').click();assert.ok(await page.locator('#crsPickSel').isVisible());await page.locator('#crsPickX').click();
  assert.equal(await page.evaluate(()=>JSON.stringify({layers:S.layers,crs:S.workCRS,active:S.activeId})),snapshot);
  const url=await page.evaluate(()=>{const layer=baseLayers['Satélite (Esri)'],old=layer._tileZoom;layer._tileZoom=6;const url=layer.getTileUrl({x:19,y:28,z:6});layer._tileZoom=old;return url;});
  assert.match(url,/\/6\/28\/19$/);assert.ok(!requests.some(u=>/nominatim[^?]*\/search|sao.paulo|adrianopolis|bom.jesus/i.test(decodeURI(u))),JSON.stringify(requests));
  if(process.env.GEOMINE_LIVE_ESRI==='1'){
   await page.route('https://server.arcgisonline.com/**',r=>r.continue());
   await page.evaluate(()=>{map.setView([-23.5505,-46.6333],13,{animate:false});S.setBase('Satélite (Esri)');});
   await page.waitForFunction(()=>{const tiles=Object.values(baseLayers['Satélite (Esri)']._tiles||{});return tiles.length>=6&&tiles.every(t=>t.loaded&&t.el.naturalWidth===256);},{},{timeout:45000});
   await page.screenshot({path:path.resolve(__dirname,'../esri-live.png')});
   assert.equal(await page.evaluate(()=>S.getBase()),'Satélite (Esri)');
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({pass:true,center,esriTile:url,offlineSearch:true,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
