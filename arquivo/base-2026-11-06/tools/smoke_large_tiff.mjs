import {header,tail,BASE,total,W,H} from './validate_large_tiff.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from '/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'geomine-bigtiff-'));
const input=path.join(dir,'sparse-bigtiff.tif'),fd=fs.openSync(input,'wx');
fs.ftruncateSync(fd,total);fs.writeSync(fd,header,0,header.length,0);fs.writeSync(fd,tail,0,tail.length,BASE);fs.closeSync(fd);
const html=fs.readFileSync('dist/GeoMine.html');
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
let browser;
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 for(const android of [false,true]){
  const context=await browser.newContext(android?{userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'}:{});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route(/^https?:/,r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  await page.goto(origin);await page.waitForFunction(()=>typeof handleFiles==='function');
  await page.evaluate(()=>{
   S.workCRS='EPSG:31982';S.setBase('Sem fundo');window.__done=false;window.__messages=[];
   const load=showLoad;showLoad=(s,...args)=>{__messages.push(s);return load(s,...args);};
   const original=handleFiles;handleFiles=async files=>{const start=performance.now();await original(files);__done=performance.now()-start;};
  });
  const choice=page.waitForEvent('filechooser');await page.locator('.rbtn').filter({hasText:'Importar'}).first().click();await (await choice).setFiles(input);
  await page.waitForFunction(()=>window.__done!==false,{},{timeout:90000});
  const result=await page.evaluate(()=>({ms:__done,count:S.rasters.length,dims:S.rasters[0]?.d.srcDims,
   preview:S.rasters[0]?.d.previewMethod,cells:S.rasters[0]?.d.z.length,
   original:!!S.rasters[0]?.d._img0,io:GeoMineRasterImport.stats(),opfs:__messages.some(s=>s.startsWith('Preparando arquivo local'))}));
  assert.equal(result.count,1);assert.deepEqual(result.dims,[W,H]);assert.equal(result.preview,'sampled');
  assert.ok(result.cells<=1e6);assert.ok(result.original);assert.equal(result.opfs,false);assert.ok(result.io.readBytes<450e6);
  assert.deepEqual(errors,[]);console.log('PASS browser BigTIFF '+(android?'Android simulated':'desktop'),JSON.stringify(result));
  await context.close();
 }
}finally{
 if(browser)await browser.close();await new Promise(r=>server.close(r));
 fs.unlinkSync(input);fs.rmdirSync(dir);
}
