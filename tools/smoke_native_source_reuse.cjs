const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
 await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'));await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted);
 const result=await page.evaluate(async()=>{
  S.setBase('Sem fundo');S.workCRS='EPSG:31982';S.layers=[];S.rasters=[];S.img=null;
  const files=new Map(),writes=[];let stamp=100;
  const rasters={async getFileHandle(name,options){
   if(!files.has(name)&&!options?.create)throw Object.assign(Error('missing'),{name:'NotFoundError'});
   return {name,getFile:async()=>files.get(name),createWritable:async()=>{
    let value;return {write:async data=>value=data,close:async()=>{files.set(name,new File([value],name,{lastModified:++stamp}));writes.push(name);},abort:async()=>{}};
   }};
  }};
  projectDirs=async()=>({rasters});
  const opts={width:16,height:16,ModelPixelScale:[1,1,0],ModelTiepoint:[0,0,0,500000,7400000,0],ProjectedCSTypeGeoKey:31982};
  const dem=new File([gridParaGeoTIFF({nc:16,nr:16,cs:1,xll:500000,yll:7399984,z:new Float32Array(256).fill(100)},S.workCRS,-9999)],'DEM.tif');
  await addRasterFromTIFF(dem);await projectSyncNativeRasters(false);
  const rgb=new File([GeoTIFF.writeArrayBuffer(new Uint8Array(768).fill(120),{...opts,SamplesPerPixel:3,BitsPerSample:[8,8,8]})],'Ortho.tif');
  await addRGBFromTIFF(rgb);await projectSyncNativeSources(false);
  const nativeCount=()=>writes.filter(n=>n.endsWith('.tif')).length,first=nativeCount();
  const initial=projectData(),paths=[S.rasters[0].projectFile,S.img.projectFile];
  for(let i=0;i<3;i++)await projectSyncNativeSources(false);
  const repeated=nativeCount();
  // Rebuild the actual display PNG with another NoData threshold setting.
  document.getElementById('imgND').checked=!document.getElementById('imgND').checked;applyImgNoData();
  await projectSyncNativeSources(false);const display=nativeCount();
  await ortoReligarTIFF(rgb);await projectSyncNativeSources(false);const relink=nativeCount();
  const saved=projectData(),samePaths=JSON.stringify(paths)===JSON.stringify([S.rasters[0].projectFile,S.img.projectFile]);
  const file=files.get(S.img.projectFile.split('/').pop());
  const copied=new Uint8Array(await file.arrayBuffer()),original=new Uint8Array(await rgb.arrayBuffer());
  const byteExact=copied.length===original.length&&copied.every((v,i)=>v===original[i]);
  return {first,repeated,display,relink,samePaths,byteExact,initialReferences:!!initial.img.projectNativeSource&&!!initial.rasters[0].projectNativeSource,
   savedReferences:!!saved.img.projectNativeSource&&!!saved.rasters[0].projectNativeSource};
 });
 assert.equal(result.first,2);assert.equal(result.repeated,2);assert.equal(result.display,2);assert.equal(result.relink,2);
 assert.equal(result.samePaths,true);assert.equal(result.byteExact,true);assert.equal(result.initialReferences,true);assert.equal(result.savedReferences,true);assert.deepEqual(errors,[]);
 console.log('PASS real application, native TIFFs, repeated save preparation, display rebuild, relink and serialization',result);
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
