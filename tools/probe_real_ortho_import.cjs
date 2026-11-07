const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const android=process.env.TEST_ANDROID==='1';
  const page=await browser.newPage({viewport:{width:1480,height:950},hasTouch:android,
    ...(android?{userAgent:'Mozilla/5.0 (Linux; Android 14; SM-X610) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'}:{})});
  const pageErrors=[];
  page.on('pageerror',e=>{pageErrors.push(e.message);console.log('PAGEERROR',e.message);});
  page.on('console',m=>{if(['error','warning'].includes(m.type())&&!m.text().includes('Failed to load resource'))console.log('CONSOLE',m.type(),m.text().slice(0,1500));});
  page.on('dialog',d=>d.accept());await page.route(/^https?:/,r=>r.abort());
  await page.goto('file://'+path.resolve('dist/GeoMine.html'),{waitUntil:'load'});
  await page.waitForFunction(()=>typeof handleFiles==='function');
  await page.evaluate(()=>{
   S.workCRS='EPSG:31982';S.setBase('Sem fundo');
   const oldToast=toast,oldLoad=showLoad;window.__messages=[];window.__load='';
   toast=(m,...args)=>{window.__messages.push(String(m));return oldToast(m,...args);};
   showLoad=(m,...args)=>{window.__load=String(m);return oldLoad(m,...args);};
   const original=handleFiles;window.__importPending=true;
   handleFiles=async files=>{const start=performance.now();try{return await original(files);}
     catch(e){window.__error={message:e.message,stack:e.stack};throw e;}
     finally{window.__importPending=false;window.__elapsed=performance.now()-start;}};
   window.__stripErrors=[];
   const open=GeoMineRasterImport.open;
   GeoMineRasterImport.open=async(...args)=>{
    const t=await open(...args),getImage=t.getImage.bind(t);
    t.getImage=async(...a)=>{const im=await getImage(...a),get=im.getTileOrStrip.bind(im);
     im.getTileOrStrip=async(...q)=>{try{return await get(...q);}catch(e){__stripErrors.push({x:q[0],y:q[1],band:q[2],message:e.message});throw e;}};
     return im;};return t;
   };
  });
  const picker=page.waitForEvent('filechooser');await page.locator('.rbtn').filter({hasText:'Importar'}).first().click();
  await (await picker).setFiles(path.resolve(process.argv[2]||'input/MDT_SupremoAdrianopolis_29junho26.tif'));
  let finalState;
  for(let i=0;i<144;i++){
   await page.waitForTimeout(5000);
   const s=await page.evaluate(()=>({pending:window.__importPending,elapsed:window.__elapsed,error:window.__error,load:window.__load,
     messages:window.__messages,stripErrors:window.__stripErrors,ortho:S.img&&{name:S.img.name,w:S.img._w,h:S.img._h,original:[S.img._W0,S.img._H0]},rasters:S.rasters.map(r=>({name:r.name,nc:r.d.nc,nr:r.d.nr,srcCRS:r.d.srcCRS,demHD:r.demHD,
     srcDims:r.d.srcDims,zmin:r.d.zmin,zmax:r.d.zmax,stats:r.d._sourceStats})),tiles:window.GeoMineRasterTiles?.stats?.()}));
   finalState=s;console.log(JSON.stringify(s));if(!s.pending){await page.waitForTimeout(5000);break;}
  }
  assert.equal(finalState.pending,false,'importação deve encerrar');
  assert.ok(finalState.ortho,'ortofoto deve ser criada');assert.equal(finalState.stripErrors.length,0);
  assert.ok(!finalState.messages.some(m=>/falha|erro/i.test(m)));assert.deepEqual(pageErrors,[]);
  const native=await page.evaluate(async()=>{
    const im=await S.img._tiff.getImage(0),x=Math.floor(im.getWidth()/2),y=Math.floor(im.getHeight()/2),
      options={window:[x,y,x+16,y+16],samples:[0,1,2,3]},
      original=await im.readRasters(options),tile=await GeoMineTileRuntime.read(im,options);
    return {original:[im.getWidth(),im.getHeight()],retained:S.img._tiff!=null,
      same:original.every((band,i)=>band.every((v,j)=>v===tile[i][j])),pixels:tile[0].length};
  });
  assert.equal(native.retained,true);assert.equal(native.same,true);assert.equal(native.pixels,256);
  assert.deepEqual(finalState.ortho.original,native.original);console.log('PASS original nativo após importação',native);
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
