const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1360,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'));
  await page.waitForFunction(()=>window.GeoMineLoadProgress&&window.GeoMineSessionAutosave?.state.booted);
  const reading=await page.evaluate(()=>{
   S.setBase('Sem fundo');showLoad('Lendo GeoTIFF 7875×7590 — 27%');
   const p=document.getElementById('gmLoadBar'),initial={value:p.value,hidden:document.getElementById('gmLoadProgress').hidden};
   showLoad('Preparando o arquivo original…');const waiting=!p.hasAttribute('value');
   progStart('Leitura nativa');progSet(.63);const structured=p.value;
   hideLoad('error');const hidden=document.getElementById('gmLoadProgress').hidden;
   showLoad('Etapa — 12,5%');const decimal=p.value;cancelLoad();
   return {initial,waiting,structured,hidden,decimal,cancelled:document.getElementById('gmLoadProgress').hidden};
  });
  assert.deepEqual(reading,{initial:{value:.27,hidden:false},waiting:true,structured:.63,hidden:true,decimal:.125,cancelled:true});
  await page.evaluate(()=>{
   window.__a=new L2.Evented();window.__b=new L2.Evented();window.__t=[{},{},{},{}];
   GeoMineLoadProgress.bind(__a,'MDT teste');GeoMineLoadProgress.bind(__b,'Ortofoto teste');
   __a.fire('loading');__a.fire('tileloadstart',{tile:__t[0]});__a.fire('tileloadstart',{tile:__t[1]});__a.fire('tileload',{tile:__t[0]});
   __b.fire('loading');__b.fire('tileloadstart',{tile:__t[2]});__b.fire('tileloadstart',{tile:__t[3]});__b.fire('tileload',{tile:__t[2]});
   showLoad('Lendo arquivo original — 45%');
  });
  await page.waitForFunction(()=>document.getElementById('gmTileBar').value===.5);
  assert.match(await page.locator('#gmTileCount').textContent(),/2 \/ 4/);
  const bounds=await page.evaluate(()=>{const box=document.getElementById('cmdBox').getBoundingClientRect(),bar=document.getElementById('gmTileBar').getBoundingClientRect();return bar.bottom<=box.bottom&&bar.top>=box.top;});assert.equal(bounds,true);
  await page.locator('#gmLoadProgress').screenshot({path:path.resolve(__dirname,'../dist/loading-progress-desktop.png')});
  await page.setViewportSize({width:740,height:850});
  assert.equal(await page.locator('#gmLoadBar').isVisible(),true);
  const overflow=await page.locator('#gmLoadProgress').evaluate(e=>e.scrollWidth>e.clientWidth+1);assert.equal(overflow,false);
  await page.locator('#gmLoadProgress').screenshot({path:path.resolve(__dirname,'../dist/loading-progress-tablet.png')});
  await page.evaluate(()=>{hideLoad();__a.fire('remove');__b.fire('tileerror',{tile:__t[3]});__b.fire('load');});
  await page.waitForFunction(()=>document.getElementById('gmTileCount').textContent.includes('indisponível'));
  assert.equal(await page.locator('#gmLoadProgress').isVisible(),true);
  // A new batch must not disappear when the previous completion timer fires.
  await page.evaluate(()=>{__b.fire('loading');__b.fire('tileloadstart',{tile:{}});});
  await page.waitForTimeout(2000);assert.equal(await page.locator('#gmTileProgress').isVisible(),true);
  await page.evaluate(()=>__b.fire('remove'));
  await page.waitForFunction(()=>document.getElementById('gmLoadProgress').hidden);
  // Real GeoTIFF decoder emits actual percentages to the visible progress bar.
  const real=await page.evaluate(async()=>{
   const changes=[],base=GeoMineLoadProgress.show;GeoMineLoadProgress.show=t=>{changes.push(t);base(t);};
   const data=new Uint8Array(128*128).fill(42),ab=GeoTIFF.writeArrayBuffer(data,{width:128,height:128,SamplesPerPixel:1,BitsPerSample:[8],ModelPixelScale:[1,1,0],ModelTiepoint:[0,0,0,583800,7075000,0],ProjectedCSTypeGeoKey:31982});
   S._loadCancel=false;S._rasterImportController=new AbortController();S.workCRS='EPSG:31982';
   showLoad('Lendo MDT original…');const d=await parseTIFF(new File([ab],'teste.tif',{type:'image/tiff'}));hideLoad();GeoMineLoadProgress.show=base;
   return {cells:d.nc*d.nr,percentage:changes.some(t=>/\d+%/.test(t))};
  });assert.equal(real.cells,16384);assert.equal(real.percentage,true);assert.deepEqual(errors,[]);
  console.log('PASS graphical progress: known/unknown stages, explicit fractions, real GeoTIFF progress, error/cancel cleanup, concurrent MDT+ortho tile counters, stale timer, removal and responsive layout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
