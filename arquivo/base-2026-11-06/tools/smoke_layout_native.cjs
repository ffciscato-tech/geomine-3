// Full app + real synthetic GeoTIFF + actual SVG/PNG rasterization.
// Runs in a disposable browser, never opens the user's project or session.
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route(/^https?:/,r=>r.abort());
    await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'),{waitUntil:'load'});
    await page.waitForFunction(()=>typeof ensureLayoutForExport==='function');
    const first=await page.evaluate(async()=>{
      S.workCRS='EPSG:31982';S._signikaCSS='';S.projectId='isolated-layout-test';
      S.layers=[];S.rasters=[];S.groups=[];S.stack=['I'];S.loFrozen=false;
      S.loMode='fig';S._view='layout';S.loZoom=1;S.orthoDispFull=true;S.orthoHD=false;
      window.__makeOrtho=phase=>{
        const W=2048,H=1024,data=new Uint8Array(W*H*3);
        for(let y=0;y<H;y++)for(let x=0;x<W;x++){
          const k=(y*W+x)*3;data[k]=(phase?180:30)+x%16;data[k+1]=60+y%16;data[k+2]=110;
        }
        return new File([GeoTIFF.writeArrayBuffer(data,{width:W,height:H,SamplesPerPixel:3,BitsPerSample:[8,8,8],
          ModelPixelScale:[.1,.1,0],ModelTiepoint:[0,0,0,583800,7075000,0],ProjectedCSTypeGeoKey:31982})],
          'original-'+phase+'.tif',{type:'image/tiff'});
      };
      const f=__makeOrtho(0),tiff=await GeoTIFF.fromBlob(f),im=await tiff.getImage();
      const bands=await im.readRasters({width:128,height:64}),cv=document.createElement('canvas');cv.width=128;cv.height=64;
      const ctx=cv.getContext('2d'),id=ctx.createImageData(128,64);
      for(let i=0;i<128*64;i++)id.data.set([bands[0][i],bands[1][i],bands[2][i],255],i*4);
      S.img={name:'Fonte sintética',b:im.getBoundingBox(),_w:128,_h:64,_W0:2048,_H0:1024,_img0:im,_tiff:tiff,
        _id:id,_hasA:false,_cache:new Map(),visible:true,_sourceCRS:S.workCRS};
      document.getElementById('imgND').checked=false;document.getElementById('imgOp').value='1';
      applyImgNoData();
      for(const id of ['loSat','loCoords','loCart','loLegend','loNorth','loScaleBar']){
        const el=document.getElementById(id);if(el)el.checked=false;
      }
      for(const [id,value] of Object.entries({loPaper:'auto',loFigW:160,loFigH:0,loPad:0,loMar:0,loGrid:0})){
        const el=document.getElementById(id);if(el)el.value=value;
      }
      document.getElementById('loScaleAuto').checked=true;
      document.getElementById('layout').style.display='flex';
      clearTimeout(S._loOrthoTimer);
      const ok=await buildLayout(),oldURL=S._lastSVG.match(/<image href="([^"]+)/)[1];
      window.__oldNative=oldURL;
      return {ok,native:S._lastLayoutNative,dpi:S._lastOrthoDpi,requested:S._lastOrthoRequestDpi,
        pixelated:S._lastSVG.includes('image-rendering:pixelated'),sourceCurrent:layoutSourceCurrent()};
    });
    assert.equal(first.ok,true);assert.equal(first.native,true);assert.equal(first.pixelated,true);assert.equal(first.sourceCurrent,true);
    const updated=await page.evaluate(async()=>{
      const oldSource=S.img._img0;
      const relinked=await ortoReligarTIFF(__makeOrtho(1));
      const invalidated=S._lastSVG===null&&S._lastOrthoDpi===0;
      S.loZoom=4;clearTimeout(S._loOrthoTimer);await buildLayout();
      const visualDpi=S._lastOrthoRequestDpi;
      S.orthoDispFull=false;layoutInvalidateOrtho('test smooth',false);await buildLayout();
      const smooth=!S._lastSVG.includes('image-rendering:pixelated');
      S.orthoDispFull=true;layoutInvalidateOrtho('test original',false);
      // This uses real Image decoding + canvas; not a test double.
      const output=await rasterizeLayout(100),pixels=output.getContext('2d').getImageData(0,0,output.width,output.height).data;
      let newPixels=0,oldPixels=0;
      for(let k=0;k<pixels.length;k+=4){
        if(pixels[k]>=179&&pixels[k]<=196&&pixels[k+1]>=59&&pixels[k+1]<=76&&pixels[k+2]===110)newPixels++;
        if(pixels[k]>=29&&pixels[k]<=46&&pixels[k+1]>=59&&pixels[k+1]<=76&&pixels[k+2]===110)oldPixels++;
      }
      const url=S._lastSVG.match(/<image href="([^"]+)/)[1];
      const center=Array.from(pixels.slice((Math.floor(output.height/2)*output.width+Math.floor(output.width/2))*4,(Math.floor(output.height/2)*output.width+Math.floor(output.width/2))*4+4));
      return {relinked,invalidated,replaced:S.img._img0!==oldSource,visualDpi,smooth,native:S._lastLayoutNative,
        pixelated:S._lastSVG.includes('image-rendering:pixelated'),urlChanged:url!==__oldNative,
        newPixels,oldPixels,width:output.width,height:output.height,sourceCurrent:layoutSourceCurrent(),
        epoch:S._loRenderEpoch,revision:S._lastSVGRevision,center,opacity:S.img.overlay.options.opacity};
    });
    console.log(JSON.stringify({first,updated,errors},null,2));
    assert.equal(updated.relinked,true);assert.equal(updated.invalidated,true);assert.equal(updated.replaced,true);
    assert.ok(updated.visualDpi>300);assert.equal(updated.smooth,true);assert.equal(updated.native,true);
    assert.equal(updated.pixelated,true);assert.equal(updated.urlChanged,true);assert.ok(updated.newPixels>100000);
    assert.equal(updated.oldPixels,0);assert.equal(updated.sourceCurrent,true);
    assert.deepEqual(errors,[]);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
