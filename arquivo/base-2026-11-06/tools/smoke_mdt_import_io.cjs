const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const input=path.resolve(process.argv[2]||'input/MDT_SupremoAdrianopolis_29junho26.tif');
const html=fs.readFileSync(path.resolve('dist/GeoMine.html'));
(async()=>{
 const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  for(const android of [false,true]){
   const context=await browser.newContext({viewport:{width:1480,height:950},hasTouch:android,
    ...(android?{userAgent:'Mozilla/5.0 (Linux; Android 14; SM-X610) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'}:{})});
   const page=await context.newPage();
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   page.on('dialog',d=>d.accept());
   await page.route(/^https?:/,route=>route.request().url().startsWith(origin)?route.continue():route.abort());
   async function setup(mode){
    await page.goto(origin,{waitUntil:'load'});
    await page.waitForFunction(()=>typeof handleFiles==='function');
    await page.evaluate(mode=>{
     S.workCRS='EPSG:31982';S.setBase('Sem fundo');
     window.__result=null;window.__logs=[];window.__stages=[];window.__cancelled=false;
     const originalLog=cmdLog,originalLoad=showLoad,originalImport=handleFiles;
     cmdLog=(message,...args)=>{__logs.push(String(message));return originalLog(message,...args);};
     showLoad=(message,...args)=>{
      __stages.push(String(message));const result=originalLoad(message,...args);
      if(mode==='cancel'&&!__cancelled&&/Lendo GeoTIFF .*— (?:[3-9]\d|100)%/.test(message)){
       __cancelled=true;cancelLoad();
      }
      return result;
     };
     if(mode==='failure'){
      const read=GeoMineRasterSource.read;
      GeoMineRasterSource.read=async(blob,options)=>{
       if(blob.size>4096)throw {type:'error',target:{error:null},toString:()=> '[object ProgressEvent]'};
       return read(blob,options);
      };
     }
     if(mode==='timeout'){
      const read=GeoMineRasterSource.read;
      GeoMineRasterSource.read=async(blob,options)=>blob.size>4096
       ?GeoMineRasterSource.wait(new Promise(()=>{}),{...options,timeoutMs:50})
       :read(blob,options);
     }
     handleFiles=async files=>{
      const start=performance.now();await originalImport(files);
      window.__result={ms:performance.now()-start,rasters:S.rasters.length};
     };
    },mode);
   }
   async function choose(){
    const chooser=page.waitForEvent('filechooser');
    await page.locator('.rbtn').filter({hasText:'Importar'}).first().click();
    await (await chooser).setFiles(input);
    await page.waitForFunction(()=>window.__result!==null,{},{timeout:90000});
   }
   await setup('success');await choose();
   const result=await page.evaluate(()=>({result:__result,stages:__stages,
    dims:S.rasters[0]?.d.srcDims,stats:S.rasters[0]?.d._sourceStats,
    cached:S.rasters[0]?._projectSourceRaw?.name,io:GeoMineRasterImport.stats(),
    isBlob:S.rasters[0]?._projectSourceRaw instanceof Blob}));
   assert.equal(result.result.rasters,1);assert.deepEqual(result.dims,[7875,7590]);
   assert.equal(result.stats.mn,155.748291015625);assert.equal(result.stats.mx,692.2595825195312);
   assert.equal(result.stats.exact,true);assert.equal(result.isBlob,true);
   assert.ok(result.io.maxActive<=2);assert.ok(result.io.cacheBytes<=16*1024*1024);
   if(android)assert.ok(result.stages.some(s=>s.startsWith('Preparando arquivo local')));
   console.log('PASS real '+(android?'Android simulado + OPFS':'desktop')+' '+JSON.stringify({...result,stages:result.stages.length}));
   if(!android)for(const mode of ['cancel','failure','timeout']){
    await setup(mode);await choose();await page.waitForTimeout(100);
    const state=await page.evaluate(()=>({result:__result,logs:__logs,
      pending:!!S._rasterImportController,io:GeoMineRasterImport.stats(),
      hidden:document.getElementById('cmdStatus').style.display==='none'}));
    assert.equal(state.result.rasters,0,mode);assert.equal(state.pending,false,mode);
    assert.equal(state.hidden,true,mode);assert.equal(state.io.active,0,mode);
    assert.ok(!state.logs.includes('■ concluído'),mode);
    assert.ok(!state.logs.some(s=>s.includes('[object ProgressEvent]')),mode);
    if(mode!=='cancel')assert.ok(state.logs.some(s=>s.includes('Downloads')),mode);
    console.log('PASS '+mode+' '+JSON.stringify(state));
   }
   assert.deepEqual(errors,[]);
   await context.close();
  }
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
