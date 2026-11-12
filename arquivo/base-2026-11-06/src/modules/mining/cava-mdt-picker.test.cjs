const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1450,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
  await page.goto(pathToFileURL(path.resolve(__dirname,'../../..','dist/GeoMine.html')).href);
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.CCMGISCava2);
  await page.evaluate(()=>{S.setBase('Sem fundo');CCMGISCava2.openMiningMode();});
  await page.waitForFunction(()=>CCMGISCava2.state.ready);
  const frame=page.frameLocator('#cava2Frame'),button=frame.locator('#ccmgisMdtOpen'),panel=frame.locator('#ccmgisMdtPicker');
  await button.click();assert.match(await panel.innerText(),/Nenhum MDT disponível/);
  await page.keyboard.press('Escape');assert.equal(await panel.count(),0);
  await page.evaluate(()=>{
   const grid=z=>({nc:3,nr:3,cs:10,xll:500000,yll:7400000,nd:-9999,z:new Float32Array([z,z+5,z+10,z,z+5,z+10,z,z+5,z+10])});
   S.workCRS='EPSG:31982';S.rasters.push({id:901,name:'MDT de teste A',crs:S.workCRS,d:grid(100)},{id:902,name:'MDT de teste B',crs:S.workCRS,d:grid(200)},
    {id:903,name:'Imagem sem elevação',crs:S.workCRS,d:{nc:3,nr:3,cs:10}});
  });
  await button.click();assert.equal(await panel.locator('[data-mdt-id]').count(),2);
  await panel.locator('[data-mdt-id="901"]').click();
  assert.equal(await page.evaluate(()=>CCMGISCava2.snapshot().mdtTrabalhoId),901);
  assert.equal(await page.evaluate(()=>CCMGISCava2.canDraw()),true);
  assert.equal(await frame.locator('#ccmgis_mdt').inputValue(),'901');assert.equal(await panel.count(),0);
  await button.click();await panel.locator('[data-mdt-id="902"]').click();
  assert.equal(await page.evaluate(()=>CCMGISCava2.snapshot().mdtTrabalhoId),902);
  assert.equal(await frame.locator('#ccmgis_mdt').inputValue(),'902');
  await button.focus();await page.keyboard.press('Enter');assert.equal(await panel.count(),1);
  await page.keyboard.press('Escape');assert.equal(await panel.count(),0);
  await button.click();await panel.locator('[data-mdt-id=""]').click();
  assert.equal(await page.evaluate(()=>CCMGISCava2.canDraw()),false);
  const drawBox=await frame.locator('#t_cava').boundingBox();
  await page.mouse.click(drawBox.x+drawBox.width/2,drawBox.y+drawBox.height/2);
  assert.equal(await panel.count(),1,'comando de desenho abre o seletor quando falta MDT');
  await page.keyboard.press('Escape');
  await frame.locator('#ccmgisPainelCorner').click();
  await button.click();assert.equal(await panel.count(),1,'seletor funciona com parâmetros abertos');
  await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);
  console.log('PASS: clique no ícone, aviso sem MDT, lista de rasters válidos, escolha/troca/remoção, teclado e bloqueio do desenho.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
