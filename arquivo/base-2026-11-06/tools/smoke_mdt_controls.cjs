// Real controls + real GeoTIFF in an isolated browser, no user files/session.
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route(/^https?:/,r=>r.abort());
    await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'),{waitUntil:'load'});
    await page.waitForFunction(()=>typeof rasSyncResolutionControls==='function');
    const bytes=await page.evaluate(()=>{
      S.workCRS='EPSG:31982';
      // Exercise the standard input picker used by embedded browsers/tablets.
      window.showOpenFilePicker=undefined;
      const data=new Uint8Array(64*64);for(let y=0;y<64;y++)for(let x=0;x<64;x++)data[y*64+x]=50+x;
      const ab=GeoTIFF.writeArrayBuffer(data,{width:64,height:64,SamplesPerPixel:1,BitsPerSample:[8],
        ModelPixelScale:[1,1,0],ModelTiepoint:[0,0,0,583800,7075000,0],ProjectedCSTypeGeoKey:31982});
      const r={id:901,name:'MDT teste',visible:true,color:'#777',style:{mode:'gray',opacity:1},
        d:{nc:4,nr:4,cs:16,xll:583800,yll:7074936,z:new Float32Array(16).fill(70),resampled:16,srcDims:[64,64],fromProject:true},
        dispFull:false,demHD:false};
      S.rasters=[r];S.stack=['R:901'];refreshUI();openRasProps(r);
      const p=toWGS(S.workCRS,583832,7074968);map.setView([p[1],p[0]],19,{animate:false});
      return Array.from(new Uint8Array(ab));
    });
    // Resolution tab is added progressively by UI modules, if present.
    const resolution=page.getByRole('button',{name:'Resolução',exact:true});
    if(await resolution.count())await resolution.first().click();
    assert.equal(await page.locator('#rasDemHD').isDisabled(),false);
    const picker=page.waitForEvent('filechooser');
    await page.locator('#rasDemHD').click();
    await (await picker).setFiles({name:'mdt-original.tif',mimeType:'image/tiff',buffer:Buffer.from(bytes)});
    await page.waitForFunction(()=>S.rasters[0]?.demHD&&S.rasters[0]?.d?._img0,{},{timeout:15000});
    const active=await page.evaluate(()=>({tiles:S.rasters[0].demHD,original:S.rasters[0].dispFull,
      checked:document.getElementById('rasDemHD').checked,grid:_demGrids.has('901'),cells:S.rasters[0].d.nc*S.rasters[0].d.nr}));
    assert.equal(active.checked,true);assert.equal(active.grid,true);assert.equal(active.cells,4096);
    await page.locator('#rasDemHD').uncheck();
    assert.equal(await page.evaluate(()=>S.rasters[0].demHD),false);
    // A missing source also opens through the Original checkbox, no undefined r.
    await page.evaluate(()=>{const r=S.rasters[0];r.d={nc:4,nr:4,cs:16,xll:583800,yll:7074936,z:new Float32Array(16).fill(70),resampled:16,srcDims:[64,64],fromProject:true};r.dispFull=false;r.demHD=false;r.src=null;rasSyncResolutionControls(r);});
    const picker2=page.waitForEvent('filechooser');await page.locator('#rasDispFull').check();
    await (await picker2).setFiles({name:'mdt-original.tif',mimeType:'image/tiff',buffer:Buffer.from(bytes)});
    await page.waitForFunction(()=>S.rasters[0]?.dispFull&&S.rasters[0]?.d?._img0);
    assert.deepEqual(errors,[]);console.log(JSON.stringify({active,originalCheckboxWorks:true,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
