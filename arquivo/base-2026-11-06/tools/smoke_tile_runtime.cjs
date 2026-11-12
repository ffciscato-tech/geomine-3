// Isolated development browser: never opens/reloads the user's working tab.
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route(/^https?:/,route=>route.abort());
    await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'),{waitUntil:'load'});
    await page.waitForFunction(()=>window.GeoMineTileRuntime&&typeof buildOrthoTile==='function');
    await page.evaluate(async()=>{
      S.workCRS='EPSG:31982';
      const W=2048,H=1024,data=new Uint8Array(W*H*3);
      for(let y=0;y<H;y++)for(let x=0;x<W;x++){
        const k=(y*W+x)*3;data[k]=30+x%180;data[k+1]=40+y%180;data[k+2]=(x>>5)%2?180:45;
      }
      const ab=GeoTIFF.writeArrayBuffer(data,{width:W,height:H,SamplesPerPixel:3,BitsPerSample:[8,8,8],
        ModelPixelScale:[.1,.1,0],ModelTiepoint:[0,0,0,583800,7075000,0],ProjectedCSTypeGeoKey:31982});
      const tiff=await GeoTIFF.fromArrayBuffer(ab),im=await tiff.getImage();
      const bands=await im.readRasters({width:128,height:64});
      const c=document.createElement('canvas');c.width=128;c.height=64;
      const ctx=c.getContext('2d'),id=ctx.createImageData(128,64);
      for(let i=0;i<128*64;i++)id.data.set([bands[0][i],bands[1][i],bands[2][i],255],i*4);
      S.img={name:'Teste tiles',b:im.getBoundingBox(),_w:128,_h:64,_W0:W,_H0:H,_img0:im,_tiff:tiff,
        _id:id,_hasA:false,_cache:new Map(),visible:true};
      S.orthoHD=true;S.orthoDispFull=true;applyImgNoData();
      window.__tileTestCenter=toWGS(S.workCRS,583902.4,7074948.8);
      map.setView([__tileTestCenter[1],__tileTestCenter[0]],21,{animate:false});
      syncOrthoTiles();
    });
    await page.waitForFunction(()=>_orthoGrid&&!_orthoGrid.isLoading()&&GeoMineTileRuntime.stats().active===0,{},{timeout:45000});
    const first=await page.evaluate(()=>({stats:GeoMineTileRuntime.stats(),tiles:Object.keys(_orthoGrid._tiles).length,
      cached:_orthoGrid._readyTileCache.size,hd:S.orthoHD,bytes:_orthoGrid._readyTileBytes}));
    assert.ok(first.hd&&first.cached&&first.stats.reads>0);
    await page.evaluate(()=>{
      window.__oldGrid=_orthoGrid;
      _orthoGrid.redraw(); // same style: completed tiles must be reused without TIFF reads.
    });
    await page.waitForFunction(()=>!_orthoGrid.isLoading());
    const redraw=await page.evaluate(()=>GeoMineTileRuntime.stats());
    assert.equal(redraw.reads,first.stats.reads,'redraw re-read a completed tile');
    // At this scale a native window is much larger than its on-screen tile;
    // exercise the new sampled path, not only identity/high-zoom reads.
    await page.evaluate(()=>map.setZoom(18,{animate:false}));
    await page.waitForFunction(()=>!_orthoGrid.isLoading()&&GeoMineTileRuntime.stats().active===0&&GeoMineTileRuntime.stats().queued===0,{},{timeout:45000});
    const reduced=await page.evaluate(()=>GeoMineTileRuntime.stats());
    assert.ok(reduced.sampledReads>0,'intermediate zoom did not exercise sampled reading');
    assert.equal(reduced.errors,0);
    await page.evaluate(()=>{
      map.setZoom(22,{animate:false});map.setZoom(20,{animate:false});map.setZoom(21,{animate:false});
    });
    await page.waitForFunction(()=>!_orthoGrid.isLoading()&&GeoMineTileRuntime.stats().active===0&&GeoMineTileRuntime.stats().queued===0,{},{timeout:45000});
    const final=await page.evaluate(()=>({stats:GeoMineTileRuntime.stats(),hd:S.orthoHD,fails:_tileFails,
      manual:projectManualSaveMode(),backgroundSave:S.auto.on}));
    assert.equal(final.hd,true);assert.equal(final.fails,0);
    assert.equal(final.manual,true);assert.equal(final.backgroundSave,false);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({first,redraw,reduced,final,errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
