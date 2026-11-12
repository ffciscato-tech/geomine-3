// Full app with the real TIFF; provider latency is optional and explicitly simulated.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900},hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; SM-X610) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
  await page.goto('file://'+path.resolve(process.env.APP_PATH||path.join(__dirname,'../dist/GeoMine.html')));
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted);
  await page.evaluate(delay=>{
   S.workCRS='EPSG:31982';S.setBase('Sem fundo');
   const el=document.createElement('input');el.type='file';el.id='fixture';document.body.append(el);
   window.__phases=[];window.__reads=[];const begin=performance.now();
   const wrap=(obj,key)=>{const f=obj[key];obj[key]=async function(...args){const start=performance.now(),before=GeoMineRasterImport.stats();
    try{return await f.apply(this,args);}finally{__phases.push({phase:key,start:start-begin,ms:performance.now()-start,reads:GeoMineRasterImport.stats().physicalReads-before.physicalReads,bytes:GeoMineRasterImport.stats().readBytes-before.readBytes});}};};
   wrap(GeoMineRasterImport,'open');wrap(GeoMineTileRuntime,'overview');wrap(GeoMineTileRuntime,'read');
   const original=GeoMineRasterSource.read;
   GeoMineRasterSource.read=async function(blob,control){
    if(delay)await new Promise(r=>setTimeout(r,delay));
    const start=performance.now(),out=await original(blob,control);__reads.push({size:blob.size,ms:performance.now()-start});return out;
   };
   // Separate first-display work from optional post-display local caching.
   GeoMineOrthoFirstFrame.stabilize=()=>{};
  },Number(process.env.PROVIDER_DELAY_MS)||0);
  await page.locator('#fixture').setInputFiles('/tmp/BN_orto_mosaico_50cm.tif');
  const result=await page.evaluate(async()=>{
   const start=performance.now();await handleFiles([document.getElementById('fixture').files[0]]);
   if(!S.img)throw Error('Ortofoto não carregada');
   return {elapsed:performance.now()-start,preview:[S.img._w,S.img._h],native:[S.img._W0,S.img._H0],firstFrame:GeoMineOrthoFirstFrame.stats(),reader:GeoMineRasterImport.stats(),phases:__phases,reads:__reads};
  });
  assert.deepEqual(errors,[]);assert.deepEqual(result.native,[22010,36133]);
  console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
