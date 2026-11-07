// Isolated full app. Android browser emulation does not emulate the OS picker.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  for(const android of [true,false]){
   const context=await browser.newContext({viewport:{width:1360,height:950},hasTouch:android,
    ...(android?{userAgent:'Mozilla/5.0 (Linux; Android 14; SM-X610) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'}:{})});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'));
   await page.waitForFunction(()=>window.GeoMineImportHandoff&&window.GeoMineSessionAutosave?.state.booted);
   await page.evaluate(()=>{
    S.setBase('Sem fundo');S.loMode='fig';switchView('layout');
    document.getElementById('ribbonPop').classList.add('on');
    window.__frames=0;window.__reading=null;window.__done=false;window.__baseImport=handleFiles;
    window.handleFiles=async files=>{
     window.__reading={view:S._view,frames:__frames,files:files.map(f=>f.name),
      ribbon:document.getElementById('ribbonPop').classList.contains('on'),
      progress:document.getElementById('cmdStatus').style.display,
      inputCount:document.getElementById('fileIn').files.length};
     await new Promise(resolve=>{window.__release=resolve;});await __baseImport(files);window.__done=true;
    };
    document.getElementById('fileIn').addEventListener('change',()=>{__frames=0;const tick=()=>{__frames++;if(!__reading)requestAnimationFrame(tick);};requestAnimationFrame(tick);},{capture:true});
   });
   const cancel=await page.evaluate(()=>{document.getElementById('fileIn').dispatchEvent(new Event('cancel'));return {view:S._view,ribbon:document.getElementById('ribbonPop').classList.contains('on')};});
   assert.deepEqual(cancel,{view:'layout',ribbon:true});
   const file={name:'Teste.geojson',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',properties:{nome:'Importação'},geometry:{type:'Point',coordinates:[-49,-28]}}]}))};
   await page.locator('#fileIn').setInputFiles(file);await page.waitForFunction(()=>__reading!==null);
   const start=await page.evaluate(()=>__reading);
   assert.equal(start.view,android?'map':'layout');assert.equal(start.ribbon,!android);
   assert.ok(start.frames>=1);assert.equal(start.progress,'inline-flex');assert.equal(start.inputCount,0);assert.deepEqual(start.files,['Teste.geojson']);
   if(android){await page.locator('#map').screenshot({path:path.resolve(__dirname,'../dist/import-android-wait-map.png')});}
   await page.evaluate(()=>__release());await page.waitForFunction(()=>__done&&S.layers.length===1);
   const content=await page.evaluate(()=>S.layers[0].features.length);assert.equal(content,1);
   await page.evaluate(()=>{window.handleFiles=__baseImport;});
   // The same input/file can be selected again, and real import still works.
   await page.locator('#fileIn').setInputFiles(file);await page.waitForFunction(()=>S.layers.length===2);
   // MDT original-picker path: real TIFF decode, owner closes before decoding only on mobile.
   const bytes=await page.evaluate(()=>{
    S.workCRS='EPSG:31982';window.showOpenFilePicker=undefined;
    const data=new Uint8Array(64*64);for(let y=0;y<64;y++)for(let x=0;x<64;x++)data[y*64+x]=50+x;
    const ab=GeoTIFF.writeArrayBuffer(data,{width:64,height:64,SamplesPerPixel:1,BitsPerSample:[8],ModelPixelScale:[1,1,0],ModelTiepoint:[0,0,0,583800,7075000,0],ProjectedCSTypeGeoKey:31982});
    const r={id:901,name:'MDT teste',visible:true,color:'#777',style:{mode:'gray',opacity:1},d:{nc:4,nr:4,cs:16,xll:583800,yll:7074936,z:new Float32Array(16).fill(70),resampled:16,srcDims:[64,64],fromProject:true},dispFull:false,demHD:false};
    S.rasters=[r];S.stack=['R:901'];refreshUI();openRasProps(r);
    const original=religaFonte;window.religaFonte=async function(...args){window.__mdtBefore={view:S._view,modal:document.getElementById('rasModal').classList.contains('on')};return original.apply(this,args);};
    return Array.from(new Uint8Array(ab));
   });
   await page.locator('#rasModal [data-aba="res"]').click();
   const chooser=page.waitForEvent('filechooser');await page.locator('#rasDemHD').click();
   await (await chooser).setFiles({name:'mdt-original.tif',mimeType:'image/tiff',buffer:Buffer.from(bytes)});
   await page.waitForFunction(()=>S.rasters[0]?.demHD&&S.rasters[0]?.d?._img0,{},{timeout:20000});
   const mdt=await page.evaluate(()=>({before:__mdtBefore,view:S._view,modal:document.getElementById('rasModal').classList.contains('on'),cells:S.rasters[0].d.nc*S.rasters[0].d.nr}));
   assert.equal(mdt.before.modal,!android);assert.equal(mdt.modal,!android);if(android)assert.equal(mdt.before.view,'map');assert.equal(mdt.cells,4096);
   // Cancellation/project replacement during the paint handoff never starts stale work.
   const aborted=await page.evaluate(async()=>{
    const pending=GeoMineImportHandoff.beforeRead();cancelLoad();const canceled=await pending;
    const pending2=GeoMineImportHandoff.beforeRead();GeoMineSessionAutosave.cancelRestore('test replacement');const stale=await pending2;
    hideLoad('cancel');return {canceled,stale};
   });assert.deepEqual(aborted,{canceled:false,stale:false});
   // Ortho handler handoff is tested with a controlled decoder; TIFF decoding has its own regression.
   await page.evaluate(()=>{
    document.getElementById('rasModal').classList.remove('on');S.img={name:'Orto teste'};
    document.getElementById('imgModal').classList.add('on');window.__orthoBefore=null;
    window.ortoReligarTIFF=async()=>{__orthoBefore={view:S._view,modal:document.getElementById('imgModal').classList.contains('on')};hideLoad();return false;};
   });
   await page.locator('#ortoReligarFile').setInputFiles({name:'ortho.tif',mimeType:'image/tiff',buffer:Buffer.from(bytes)});
   await page.waitForFunction(()=>__orthoBefore!==null);const ortho=await page.evaluate(()=>__orthoBefore);
   assert.equal(ortho.modal,!android);if(android)assert.equal(ortho.view,'map');
   assert.deepEqual(errors,[]);console.log('PASS '+(android?'Android emulated':'desktop')+': selected files copied before reset, painted UI before read, mobile map handoff, unchanged picker cancellation, real GeoJSON, same file retry, real native MDT, ortho handoff, generation/cancel guards '+JSON.stringify({start,mdt,ortho}));
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
