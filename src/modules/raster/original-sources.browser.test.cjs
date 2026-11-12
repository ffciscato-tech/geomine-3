/* Browser integration uses only synthetic files in this isolated origin's OPFS.
   Native handles cross real IndexedDB/reload boundaries; no user file is opened. */
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.argv[2]||path.resolve(__dirname,'../../..');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('content-type','text/html');fs.createReadStream(path.join(root,'dist/GeoMine.html')).pipe(res)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1480,height:960}}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));page.on('dialog',dialog=>dialog.accept());await page.route('https://**',route=>route.abort());
  const url='http://127.0.0.1:'+server.address().port;
  async function boot(reload=false){
   if(reload)await page.reload();else await page.goto(url);
   await page.waitForFunction(()=>window.GeoMineOriginalSources&&window.GeoMineSessionAutosave?.state.booted);
   await page.evaluate(()=>{
    S.setBase('Sem fundo');S.workCRS='EPSG:31982';S._view='map';
    // Visible-map tiles are deliberately disabled so these counts measure only
    // source restoration. A separate explicit read below checks native pixels.
    window.renderRaster=()=>{};window.syncDemTiles=()=>{};window.syncOrthoTiles=()=>{};
    window.projectAutoSaveRaster=async()=>false;window.projectAutoSaveOrtho=async()=>false;
    window.qaCounts={parse:0,open:0,reads:0,entries:0,pickers:0};
    const baseParse=parseTIFF;window.parseTIFF=function(){qaCounts.parse++;return baseParse.apply(this,arguments)};
    const baseOpen=rasterImportOpen;window.rasterImportOpen=async function(){
     qaCounts.open++;const tiff=await baseOpen.apply(this,arguments),get=tiff.getImage.bind(tiff);
     if(!tiff._qaGetImage){tiff._qaGetImage=true;tiff.getImage=async function(){const image=await get(...arguments);if(!image._qaRead){image._qaRead=true;const read=image.readRasters.bind(image);image.readRasters=function(){qaCounts.reads++;return read(...arguments)}}return image}}
     return tiff;
    };
    const entries=FileSystemDirectoryHandle.prototype.entries;
    FileSystemDirectoryHandle.prototype.entries=function(){qaCounts.entries++;return entries.apply(this,arguments)};
    window.qaResetCounts=()=>{for(const key of Object.keys(qaCounts))qaCounts[key]=0};
    window.qaCheck=(condition,message)=>{if(!condition)throw Error(message)};
    window.qaSaveGrid=(value)=>({nc:16,nr:16,cs:3,csy:3,xll:500000,yll:6900000,z:new Float32Array(16*16).fill(value),native:false,resampled:3,srcDims:[48,48],crs:'EPSG:31982',srcCRS:'EPSG:31982'});
   });
  }
  await boot();
  const prepared=await page.evaluate(async()=>{
   S.projectId='qa-original-import-'+crypto.randomUUID();GeoMineSessionAutosave.cancelRestore('synthetic import integration');
   const opfs=await navigator.storage.getDirectory(),directory=await opfs.getDirectoryHandle('qa-originals',{create:true});
   window.qaDirectory=directory;window.qaHandles=[];
   async function write(name,bytes){const handle=await directory.getFileHandle(name,{create:true}),stream=await handle.createWritable();await stream.write(bytes);await stream.close();qaHandles.push(handle);return handle}
   for(const value of [100,200]){
    const grid={nc:48,nr:48,cs:1,csy:1,xll:500000,yll:6900000,z:new Float32Array(48*48).fill(value)};
    await write('MDT_'+value+'.tif',gridParaGeoTIFF(grid,S.workCRS,-99999));
   }
   await ensureGeoTIFF();const size=32,rgb=new Uint8Array(size*size*3);for(let k=0;k<size*size;k++){rgb[k*3]=31;rgb[k*3+1]=83;rgb[k*3+2]=149}
   await write('Orto_QA.tif',GeoTIFF.writeArrayBuffer(rgb,{width:size,height:size,BitsPerSample:[8,8,8],SamplesPerPixel:3,PhotometricInterpretation:2,ProjectedCSTypeGeoKey:31982,GTModelTypeGeoKey:1,ModelPixelScale:[1.5,1.5,0],ModelTiepoint:[0,0,0,500000,6900048,0]}));
   for(const handle of [directory,...qaHandles])qaCheck(await handle.queryPermission({mode:'read'})==='granted','OPFS read permission');
   window.showOpenFilePicker=()=>{qaCounts.pickers++;return Promise.resolve(qaHandles)};
   const button=document.createElement('button');button.id='qaImportOriginals';button.textContent='QA Import';button.style.cssText='position:fixed;top:2px;left:2px;z-index:99999';button.onclick=()=>document.getElementById('fileIn').click();document.body.appendChild(button);
   return {directory:directory.name,files:qaHandles.map(h=>h.name)};
  });
  await page.locator('#qaImportOriginals').click();
  await page.waitForFunction(()=>S.rasters.length===2&&S.rasters.every(r=>r.originalSource)&&S.img?.originalSource&&!S._rasterImportController,{timeout:30000});
  const imported=await page.evaluate(async()=>{
   qaCheck(qaCounts.pickers===1,'one desktop Import picker');const items=[...S.rasters.map(item=>({item,kind:'raster'})),{item:S.img,kind:'ortho'}];
   for(const {item,kind} of items){const source=await GeoMineOriginalSources.resolve(item,kind),handle=qaHandles.find(h=>h.name===item.src.file);qaCheck(source&&await source.handle.isSameEntry(handle),'exact imported handle persisted: '+item.name)}
   const snapshot=projectData();let remapped=0;
   for(const row of snapshot.rasters){const item=S.rasters.find(r=>r.id===row.rid),value=Number(row.name.match(/(100|200)/)[1]),grid=qaSaveGrid(value),descriptor=GeoMineOriginalSources.forSave(item,'raster',grid);
    qaCheck(descriptor&&descriptor.preview===projectNativePreview(item,'raster',grid),'forSave remaps serialized grid');qaCheck(descriptor.preview!==item.originalSource.preview,'saved reduced grid differs from live preview');remapped++;
    row.d={nc:grid.nc,nr:grid.nr,cs:grid.cs,csy:grid.csy,xll:grid.xll,yll:grid.yll,z:f32ToB64(grid.z),native:false,resampled:3,srcDims:[48,48],crs:S.workCRS,srcCRS:S.workCRS};row.originalSource=descriptor;row.projectFile=null;row.projectNativeSource=null;row.projectSavePending=false;row.visible=false;
   }
   snapshot.img.visible=false;snapshot.img.projectFile=null;snapshot.img.projectNativeSource=null;snapshot.img.projectSavePending=false;
   sessionStorage.setItem('qa-original-imported',JSON.stringify(snapshot));
   const legacy=JSON.parse(JSON.stringify(snapshot));legacy.projectId='qa-original-legacy-'+crypto.randomUUID();for(const row of legacy.rasters){delete row.originalSource;delete row.projectNativeSource;row.projectFile=null}delete legacy.img.originalSource;delete legacy.img.projectNativeSource;legacy.img.projectFile=null;sessionStorage.setItem('qa-original-legacy',JSON.stringify(legacy));
   return {sources:items.length,remapped,pickerCalls:qaCounts.pickers,realHandles:true};
  });
  async function openStored(key){
   return page.evaluate(async key=>{
    const snapshot=JSON.parse(sessionStorage.getItem(key));qaResetCounts();loadProject(snapshot);await S._originalsRestoring;
    return {ready:S.rasters.every(r=>!!r.d._img0)&&!!S.img?._img0,missing:GeoMineOriginalSources.missing().length,counts:{...qaCounts},project:S.projectId};
   },key);
  }
  async function nativePixels(){
   return page.evaluate(async()=>{
    const values=[];for(const raster of S.rasters){const expected=Number(raster.name.match(/(100|200)/)[1]),image=raster.d._img0;qaCheck(image.getWidth()===48&&image.getHeight()===48,'native mono dimensions');const bands=await image.readRasters({window:[0,0,2,2],samples:[0]});qaCheck(Array.from(bands[0]).every(z=>z===expected),'distinct native elevation: '+expected);values.push(expected)}
    const bands=await S.img._img0.readRasters({window:[0,0,1,1],samples:[0,1,2]});const rgb=bands.map(b=>b[0]);qaCheck(rgb.join(',')==='31,83,149','native RGB pixel');return {values,rgb};
   });
  }
  await boot(true);const reopened=await openStored('qa-original-imported');assert.equal(reopened.ready,true);assert.equal(reopened.missing,0);assert.equal(reopened.counts.parse,0);assert.equal(reopened.counts.reads,0);assert.equal(reopened.counts.entries,0);assert.equal(reopened.counts.pickers,0);const reopenedPixels=await nativePixels();
  const legacyBefore=await openStored('qa-original-legacy');assert.equal(legacyBefore.missing,3);
  const legacyBound=await page.evaluate(async()=>{
   GeoMineMissingOriginals.close();const directory=await(await navigator.storage.getDirectory()).getDirectoryHandle('qa-originals');let pickers=0;window.showDirectoryPicker=()=>{pickers++;return Promise.resolve(directory)};
   qaResetCounts();const result=await GeoMineOriginalSources.chooseFolder();qaCheck(result,'folder selection accepted');qaCheck(!GeoMineOriginalSources.missing().length,'one folder binds all missing sources');
   const persisted=JSON.parse(sessionStorage.getItem('qa-original-legacy'));qaCheck(persisted.rasters.every(r=>!r.originalSource)&&!persisted.img.originalSource,'legacy file snapshot remains unchanged');return {pickerCalls:pickers,missing:GeoMineOriginalSources.missing().length,counts:{...qaCounts}};
  });assert.equal(legacyBound.pickerCalls,1);assert.equal(legacyBound.missing,0);const legacyPixels=await nativePixels();
  const legacyReloads=[];
  for(let iteration=0;iteration<2;iteration++){
   await boot(true);const state=await openStored('qa-original-legacy');assert.equal(state.ready,true);assert.equal(state.missing,0);assert.equal(state.counts.parse,0,'old preview alias must avoid reparsing full MDT');assert.equal(state.counts.reads,0,'restore only TIFF headers');assert.equal(state.counts.entries,0,'exact persisted aliases must avoid folder rescans');assert.equal(state.counts.pickers,0);legacyReloads.push({...state,pixels:await nativePixels()});
  }
  const stale=await page.evaluate(async()=>{
   const item=S.rasters[0],kind='raster',base=projectNativeFingerprint,project=S.projectId;let started,finish;const reading=new Promise(resolve=>started=resolve),blocked=new Promise(resolve=>finish=resolve);
   window.projectNativeFingerprint=async function(){started();await blocked;return base.apply(this,arguments)};
   const resolving=GeoMineOriginalSources.resolve(item,kind);await reading;GeoMineSessionAutosave.cancelRestore('QA generation switch');finish();const generationResult=await resolving;window.projectNativeFingerprint=base;qaCheck(generationResult===null,'generation switch discards source result');
   let release,begin;const entered=new Promise(resolve=>begin=resolve),gate=new Promise(resolve=>release=resolve);window.projectNativeFingerprint=async function(){begin();await gate;return base.apply(this,arguments)};
   const next=GeoMineOriginalSources.resolve(item,kind);await entered;S.projectId=project+'-other';release();const projectResult=await next;window.projectNativeFingerprint=base;qaCheck(projectResult===null,'project switch discards source result');return {generationDiscarded:true,projectDiscarded:true};
  });
  assert.deepEqual(errors,[]);const report={prepared,imported,reopened,reopenedPixels,legacyBefore,legacyBound,legacyPixels,legacyReloads,stale,errors};fs.writeFileSync('/tmp/geomine-original-sources-browser-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exit(1)});
