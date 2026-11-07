// Actual GeoTIFF decoder + shared tile runtime + full UI, in a disposable browser.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:950}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
  await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'));
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineChannelExtraction);
  await page.evaluate(async()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31982';
   const nc=257,nr=257,cs=.5,xll=499959.75,yll=7399935.75,z=new Float32Array(nc*nr);
   for(let r=0;r<nr;r++)for(let c=0;c<nc;c++){const y=yll+(nr-r-.5)*cs;z[r*nc+c]=100+Math.min(3,Math.max(0,Math.abs(y-7400000)-2));}
   const tiff=await GeoTIFF.fromArrayBuffer(gridParaGeoTIFF({nc,nr,cs,xll,yll,z},S.workCRS)),im=await tiff.getImage(),bb=im.getBoundingBox();
   window.__nativeChannel={id:712,name:'TIFF original — patamar',crs:S.workCRS,visible:false,style:{mode:'hipso'},
    d:{nc:4,nr:4,cs:128.5/4,csy:128.5/4,xll,yll,z:new Float32Array(16).fill(12345),resampled:64.25,srcCRS:S.workCRS,
       srcDims:[nc,nr],_img0:im,_tiff:tiff,_W0:nc,_H0:nr,_bb:bb,_nd:-9999}};
   S.rasters.push(__nativeChannel);window.__nativeBefore=Array.from(__nativeChannel.d.z);
   const axis=addLayer({name:'Eixo sobre TIFF real',gtype:'line',crs:S.workCRS,fields:[],features:[{geom:[[500000,7400000],[500040,7400000]],props:{}}]});
   window.__nativeReads=[];const read=GeoMineTileRuntime.read;
   GeoMineTileRuntime.read=function(image,options,control){if(image===im)__nativeReads.push({window:options.window,width:options.width,height:options.height,samples:options.samples});return read(image,options,control);};
   S.activeId=axis.id;GeoMineChannelExtraction.open();
  });
  await page.locator('#chanRaster').selectOption('712');await page.locator('#chanMode').selectOption('auto');
  await page.locator('#chanInterval').fill('10');await page.locator('#chanReach').fill('20');
  await page.locator('#chanAnalyze').click();await page.waitForFunction(()=>!document.getElementById('chanAnalyze').disabled);
  const status=await page.locator('#chanStatus').textContent();assert.match(status,/Prévia pronta/);
  assert.equal(await page.locator('#chanConfirm').count(),0);await page.locator('#chanCommit').click();
  const result=await page.evaluate(async()=>{
   const L=S.layers.find(L=>L.name.startsWith('Seções da calha MDT')),r=__nativeChannel;
   const after=await r.d._img0.readRasters({samples:[0],window:[0,0,1,1]});
   return {props:L?.features.map(f=>f.props),reads:__nativeReads,previewUnchanged:JSON.stringify(Array.from(r.d.z))===JSON.stringify(__nativeBefore),originalStillReadable:after[0][0]};
  });
  assert.equal(result.props.length,5);
  assert.ok(result.props.every(p=>Math.abs(p.LARG_M-10)<1e-6&&p.Z_EIXO===100&&p.NIVEL_M===103&&p.PIXEL_M===.5&&p.TOPO_ESQ===103&&p.TOPO_DIR===103));
  assert.ok(result.reads.length>0&&result.reads.length<=6,JSON.stringify(result.reads));
  for(const r of result.reads){assert.equal(r.width,undefined);assert.equal(r.height,undefined);assert.deepEqual(r.samples,[0]);assert.ok(r.window[2]-r.window[0]<=128&&r.window[3]-r.window[1]<=128);}
  assert.equal(result.previewUnchanged,true);assert.equal(result.originalStillReadable,103);assert.deepEqual(errors,[]);
  console.log('PASS actual Float32 GeoTIFF/native tile windows, decoy preview ignored, automatic 10 m banks, metadata, shared original remains readable and originals preserved');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
