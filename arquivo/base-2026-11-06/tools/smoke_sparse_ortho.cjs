const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
const mobile=process.env.TEST_ANDROID==='1',errors=[];
const page=await browser.newPage({viewport:{width:1280,height:900},hasTouch:mobile,...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 14; SM-X610) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'}:{})});
page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'));await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted);
await page.evaluate(()=>{S.workCRS='EPSG:31982';S.setBase('Sem fundo');const el=document.createElement('input');el.type='file';el.id='sparseFile';document.body.append(el);});
await page.locator('#sparseFile').setInputFiles(process.argv[2]||'/tmp/BN_orto_mosaico_50cm.tif');
const results=await page.evaluate(async relink=>{
 const start=performance.now(),file=document.getElementById('sparseFile').files[0];await handleFiles([file]);const elapsed=performance.now()-start;
 if(!S.img)throw Error('Ortofoto não criada');
 const openingReader=GeoMineRasterImport.stats(),openingSparse=GeoMineSparseTIFF.stats().blocks;
 let relinkMs=null,relinkSparseBlocks=null;
 if(relink){const previous=S.img,bounds=S.img.b;S.img.name='Nome preservado';S.img.opacity=0.62;
  const at=performance.now();if(!await ortoReligarTIFF(file,{restoreNative:true}))throw Error('Religação falhou');relinkMs=performance.now()-at;
  relinkSparseBlocks=GeoMineSparseTIFF.stats().blocks-openingSparse;
  if(S.img!==previous||S.img.b!==bounds||S.img.name!=='Nome preservado'||S.img.opacity!==0.62)throw Error('Religação alterou propriedades');
 }
 const I=S.img,tiff=I._tiff,im=I._img0,samples=[0,1,2,3],levels=[];
 for(let i=0;i<await tiff.getImageCount();i++){
  const img=await tiff.getImage(i),fd=img.fileDirectory;if(!img.getWidth())continue;
  const nx=Math.ceil(img.getWidth()/img.getTileWidth()),idx=Array.from(fd.TileOffsets).findIndex((v,k)=>v>0&&fd.TileByteCounts[k]>0);
  const x=idx%nx*img.getTileWidth(),y=Math.floor(idx/nx)*img.getTileHeight();
  const data=await GeoMineTileRuntime.read(img,{samples,window:[x,y,Math.min(x+512,img.getWidth()),Math.min(y+512,img.getHeight())]});
  levels.push({i,populated:data.some(a=>a.some(v=>v!==0))});
 }
 const empty=await im.readRasters({samples,window:[0,0,16,16]});
 const nx=Math.ceil(I._W0/512),fd=im.fileDirectory;let candidate;
 for(let idx=0;idx<fd.TileOffsets.length;idx++){
  if(!fd.TileOffsets[idx])continue;const x=idx%nx*512,y=Math.floor(idx/nx)*512;
  const data=await im.readRasters({samples,window:[x,y,Math.min(x+512,I._W0),Math.min(y+512,I._H0)]});
  const k=data[3].findIndex((a,k)=>a>0&&data[0][k]>10&&data[0][k]<240);if(k>=0){candidate={x:x+k%data.width,y:y+Math.floor(k/data.width),rgba:data.map(a=>a[k])};break;}
 }
 if(!candidate)throw Error('Nenhum pixel colorido');
 const x=candidate.x,y=candidate.y,options={samples,window:[x,y,x+1,y+1]},native=await GeoMineTileRuntime.read(im,options);
 const [west,south,east,north]=I.b,gx=(east-west)/I._W0,gy=(north-south)/I._H0;
 const layout=await orthoWindow([west+x*gx,north-(y+1)*gy,west+(x+1)*gx,north-y*gy],1,{resampleMethod:'nearest'});
 const bitmap=await createImageBitmap(await(await fetch(layout.dataURL)).blob()),cv=document.createElement('canvas');cv.width=bitmap.width;cv.height=bitmap.height;const ctx=cv.getContext('2d');ctx.drawImage(bitmap,0,0);const rgba=Array.from(ctx.getImageData(0,0,1,1).data);
 return {elapsed,relinkMs,relinkSparseBlocks,openingReader,firstFrame:GeoMineOrthoFirstFrame.stats(),original:[I._W0,I._H0],preview:[I._w,I._h],levels,empty:empty.every(a=>a.every(v=>v===0)),candidate:candidate.rgba,native:native.map(a=>a[0]),layout:rgba,sparse:GeoMineSparseTIFF.stats()};
},process.env.TEST_RELINK==='1');
assert.deepEqual(results.original,[22010,36133]);assert.equal(results.empty,true);assert.ok(results.levels.every(l=>l.populated));assert.deepEqual(results.native,results.candidate);assert.deepEqual(results.layout.slice(0,3),results.candidate.slice(0,3));assert.equal(results.layout[3],255);assert.deepEqual(errors,[]);
assert.ok(results.firstFrame.frames>0);assert.ok(results.firstFrame.firstPaintMs<results.firstFrame.finishedMs);assert.equal(results.firstFrame.disposed,true);
if(mobile){assert.ok(Math.max(...results.preview)<=1024);assert.ok(results.openingReader.readBytes<2*1024*1024);}
if(process.env.TEST_RELINK==='1')assert.ok(results.relinkSparseBlocks<100,'relink must use an overview, not decode thousands of base TIFF blocks');
console.log('PASS real sparse orthophoto import, 8 overviews, empty transparency, native tile values and native Layout pixel',JSON.stringify({mobile,...results}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
