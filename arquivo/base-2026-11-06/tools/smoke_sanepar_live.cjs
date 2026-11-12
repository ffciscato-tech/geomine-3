const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  await page.route('https://geomine-3.web.app/',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(path.resolve(__dirname,'../dist/GeoMine.html'))}));
  await page.route(/googleapis|gstatic|openstreetmap|arcgisonline/,r=>r.abort());
  await page.goto('https://geomine-3.web.app/');
  const result=await page.evaluate(async()=>{const data=await GeoMineSanepar.fetchArea([-50.3086,-23.3143,-50.3057,-23.3138]);return {features:data.features.length,geometry:data.features[0]?.geometry.type,water:data.features[0]?.properties.TipoAbstDeAgua,sewage:data.features[0]?.properties.TipoColetaEsgoto};});
  if(!result.features)throw Error('Expected real sample features');console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
