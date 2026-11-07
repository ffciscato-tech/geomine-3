// Real project fixture, isolated copies in a disposable Chrome context. No source file writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const bundle=path.resolve(process.argv[2]||path.join(__dirname,'../dist/GeoMine.html')),fixture=path.resolve(process.argv[3]||process.env.GEOMINE_TIN_FIXTURE||path.join(__dirname,'../fixtures/HidrogeologiaV2.ccmgis'));
const fixtureBytes=fs.readFileSync(fixture),fixtureHash=crypto.createHash('sha256').update(fixtureBytes).digest('hex'),project=JSON.parse(fixtureBytes),baseline=!!process.env.GEOMINE_BASELINE;
assert.equal(fixtureHash,'4027dea1fa0003c51d8c3b8a6af4cc4eb2c0fd2ce9bdeaff1219ebf5819cc153');
async function bounded(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Timed out: '+label)),45000);})]);}finally{clearTimeout(timer);}}
async function loadSource(page,id){
  const layer=project.layers.find(l=>l.id===id);assert.ok(layer);
  await page.evaluate(({layer,crs})=>{
    loadProject({app:'CCMGIS',v:3,workCRS:crs,projectId:'isolated-tin-qa-'+layer.id,layers:[layer],rasters:[],groups:[],stack:['L'+layer.id]});
    S.setBase('Sem fundo');S.activeId=layer.id;S.selFeat=null;S.layers[0].visible=true;refreshUI();
    window.__sourceBefore=JSON.stringify(S.layers[0].features.map(f=>({geom:f.geom,zg:f.zg,multi:f.multi,props:f.props})));
  },{layer,crs:project.workCRS});
}
async function generate(page,id){
  if(await page.locator('#ribX').isVisible())await page.locator('#ribX').click();
  await page.locator('.ribcat[data-cat-id="topografia"]').click();await page.locator('.rbtn').filter({hasText:'Superfície Raster'}).click();
  await page.locator('#tinLayer').waitFor({state:'visible'});await page.locator('#tinLayer').selectOption(String(id));
  await page.locator('#tinZSrc').selectOption('geom');await page.locator('#tinCS').fill('2');await page.locator('#tinMaxEdge').fill('0');
  await page.locator('#tinFormato').selectOption('raster');await page.locator('#tinLimitMode').selectOption('open');await page.locator('#tinContour').uncheck();await page.locator('#tinCutMdt').uncheck();
  const started=Date.now();await page.locator('#btnTIN').click();await page.waitForFunction(id=>S.rasters.some(r=>String(r._tinSourceId)===String(id)),id,{timeout:120000});
  await page.waitForFunction(()=>document.getElementById('tinOut').textContent.includes('Cotas:'),null,{timeout:120000});return Date.now()-started;
}
async function audit(page,id,full=true){
  return bounded(page.evaluate(async({id,full})=>{
    const L=S.layers.find(l=>String(l.id)===String(id)),r=S.rasters.find(r=>String(r._tinSourceId)===String(id)),d=r.d;
    const parts=L.features.flatMap(f=>Array.isArray(f.geom[0]?.[0])?f.geom:[f.geom]),closed=parts.filter(p=>Math.hypot(p[0][0]-p.at(-1)[0],p[0][1]-p.at(-1)[1])<.001);
    const rings=closed.map(p=>({p,b:p.reduce((b,q)=>[Math.min(b[0],q[0]),Math.min(b[1],q[1]),Math.max(b[2],q[0]),Math.max(b[3],q[1])],[Infinity,Infinity,-Infinity,-Infinity])}));
    const inside=(x,y,{p,b})=>{if(x<b[0]||x>b[2]||y<b[1]||y>b[3])return false;let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>y)!==(p[j][1]>y)&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
    const cv=rasterCanvas(r),pixels=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;
    let finite=0,painted=0,outside=0,outsidePainted=0;const candidates=[];
    for(let k=0;k<d.z.length;k++){
      if(pixels[k*4+3])painted++;if(!Number.isFinite(d.z[k]))continue;finite++;
      if(!full)continue;
      const row=Math.floor(k/d.nc),col=k%d.nc,x=d.xll+(col+.5)*d.cs,y=d.yll+(d.nr-row-.5)*(d.csy||d.cs);
      if(rings.some(p=>inside(x,y,p)))continue;outside++;if(pixels[k*4+3])outsidePainted++;
      if(candidates.length<20&&row>2&&col>2&&row<d.nr-3&&col<d.nc-3&&[k-2*d.nc,k+2*d.nc,k-2,k+2].every(i=>Number.isFinite(d.z[i]))&&k%83===0)candidates.push({k,x,y,z:d.z[k],alpha:pixels[k*4+3]});
    }
    const base={sourceId:L.id,features:L.features.length,vertices:parts.reduce((n,p)=>n+p.length,0),open:parts.length-closed.length,closed:closed.length,
      nc:d.nc,nr:d.nr,cs:d.cs,finite,painted,outside,outsidePainted,flag:r._tinAutoClip,exactRings:r._exactClipRings?.length||0,v3limit:r._v3?.limId||null,
      bounds:rasterBounds(r),visibleBounds:rasterVisibleBounds(r),sourceUnchanged:JSON.stringify(L.features.map(f=>({geom:f.geom,zg:f.zg,multi:f.multi,props:f.props})))===__sourceBefore};
    if(!full)return base;
    const collected=tinCollect(L,'geom','',2),openFeatures=L.features.filter(f=>Math.hypot(f.geom[0][0]-f.geom.at(-1)[0],f.geom[0][1]-f.geom.at(-1)[1])>=.001);
    const key=(x,y,z)=>[x,y,z].map(v=>Number(v).toFixed(5)).join(','),samples=new Set(collected.xs.map((x,i)=>key(x,collected.ys[i],collected.zs[i])));
    base.collected={nOrig:collected.nOrig,semZ:collected.semZ,samples:collected.xs.length,allOpenStartsPresent:openFeatures.every(f=>samples.has(key(f.geom[0][0],f.geom[0][1],f.zg[0])))};
    const decode=async url=>{const img=new Image();img.src=url;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);return {width:c.width,height:c.height,pixels:c.getContext('2d').getImageData(0,0,c.width,c.height).data};};
    const layout=await decode(await rasterURLPlot(r));base.plotBounds=r._urlPlotBounds;base.layoutDimensions=[layout.width,layout.height];
    const clipper=rasterTileClipper(r),wm=gradeParaTela(d),mapImage=await decode(r._url);
    base.samples=candidates.map(p=>{const wmxy=reproj(S.workCRS,'EPSG:3857',p.x,p.y),col=Math.floor((wmxy[0]-wm.xll)/wm.cs),row=Math.floor(wm.nr-(wmxy[1]-wm.yll)/(wm.csy||wm.cs)),index=row*mapImage.width+col;
      return {...p,layoutAlpha:layout.pixels[p.k*4+3],mapAlpha:mapImage.pixels[index*4+3],tileAccept:!clipper||clipper(p.x,p.y)};});
    window.__qaTinPNG=cv.toDataURL('image/png');return base;
  },{id,full}),'raster audit '+id);
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),errors=[];
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+bundle,{waitUntil:'load'});await page.waitForFunction(()=>typeof runTIN==='function'&&typeof loadProject==='function');
    await loadSource(page,19);const elapsed=await generate(page,19),na=await audit(page,19);console.log('QA: real NA generated and audited');
    assert.equal(na.features,32);assert.equal(na.vertices,2593);assert.equal(na.open,23);assert.equal(na.closed,9);assert.equal(na.collected.nOrig,2593);assert.equal(na.collected.semZ,0);assert.equal(na.collected.allOpenStartsPresent,true);
    assert.ok(na.finite>50000&&na.outside>30000,'numeric surface contains substantial cells outside closed curves');assert.equal(na.sourceUnchanged,true);
    assert.deepEqual(na.layoutDimensions,[na.nc,na.nr]);assert.deepEqual(na.plotBounds,na.bounds);assert.ok(na.samples.length>5);
    if(baseline){
      assert.ok(na.painted<na.finite*.8,'baseline clips a valid numeric grid visually');assert.ok(na.outsidePainted<na.outside*.05,'baseline drops most finite cells outside closed curves');
      assert.ok(na.exactRings>0);assert.equal(String(na.v3limit),'19');assert.ok(na.samples.some(p=>p.alpha===0&&p.layoutAlpha===0&&p.mapAlpha===0&&!p.tileAccept));
      console.log(JSON.stringify({baselineReproduced:true,elapsedMs:elapsed,fixtureHash,na},null,2));return;
    }
    assert.equal(na.flag,false);assert.equal(na.exactRings,0);assert.equal(na.v3limit,null);assert.deepEqual(na.visibleBounds,na.bounds);
    assert.equal(na.painted,na.finite,'full grid painted without inferred mask');assert.equal(na.outsidePainted,na.outside,'all finite cells outside closed curves retained');
    assert.ok(na.samples.every(p=>p.alpha===255&&p.layoutAlpha===255&&p.tileAccept),'shared canvas, Layout and tile clipper retain open-contour areas');
    assert.ok(na.samples.every(p=>p.mapAlpha>0),'actual Web Mercator map overlay retains the same finite source locations');
    fs.writeFileSync(path.resolve(__dirname,'../tin-na-open-fixed.png'),Buffer.from((await page.evaluate(()=>__qaTinPNG)).split(',')[1],'base64'));

    const mask=await page.evaluate(()=>{
      const r=S.rasters.find(r=>r._tinSourceId===19),d=r.d,center=[d.xll+d.nc*d.cs/2,d.yll+d.nr*d.cs/2],half=40,
        rings=[[[center[0]-half,center[1]-half],[center[0]+half,center[1]-half],[center[0]+half,center[1]+half],[center[0]-half,center[1]+half],[center[0]-half,center[1]-half]]],clone={...r,_exactClipRings:rings,_tileClipCache:null,_v3:undefined};
      const cv=rasterCanvas(clone),data=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;let painted=0;for(let k=3;k<data.length;k+=4)if(data[k])painted++;
      const accept=rasterTileClipper(clone);return {painted,rings:rasterClipRings(clone).length,inside:accept(...center),outside:accept(d.xll+d.cs,d.yll+d.cs),auto:clone._tinAutoClip};
    });
    assert.equal(mask.auto,false);assert.equal(mask.rings,1);assert.equal(mask.inside,true);assert.equal(mask.outside,false);assert.ok(mask.painted>0&&mask.painted<na.painted/4,'explicit analytical mask still clips with auto-inference off');
    console.log('QA: explicit mask passed');
    const saved=await page.evaluate(()=>projectData()),savedRaster=saved.rasters.find(r=>String(r.tinSourceId||r._tinSourceId)==='19');
    assert.ok(savedRaster,'generated raster serialized with source identity');assert.equal(savedRaster.tinAutoClip,false,'explicit false survives serialization');
    console.log('QA: project serialized');
    await page.locator('#projIn').setInputFiles({name:'qa-na-open-roundtrip.ccmgis',mimeType:'application/octet-stream',buffer:Buffer.from(JSON.stringify(saved))});
    await page.waitForFunction(()=>S.auto.name==='qa-na-open-roundtrip.ccmgis');console.log('QA: project reopened');
    // Existing product behavior asks for a native source for grids reopened without provenance.
    // Choose the serialized working grid through the real modal, never alter raster state.
    const pendingAudit=audit(page,19);
    await page.locator('[data-pf="no"]').waitFor({state:'visible',timeout:10000});await page.locator('[data-pf="no"]').click();
    const restored=await pendingAudit;
    assert.equal(restored.flag,false);assert.equal(restored.exactRings,0);assert.equal(restored.v3limit,null);assert.equal(restored.painted,na.painted);assert.equal(restored.finite,na.finite);assert.deepEqual(restored.bounds,na.bounds);
    assert.ok(restored.samples.every(p=>p.alpha===255&&p.layoutAlpha===255&&p.tileAccept&&p.mapAlpha>0),'reopened project does not regress map/Layout/tiles');
    console.log('QA: project roundtrip passed');
    let cava=null;if(process.env.GEOMINE_CAVA){console.log('QA: optional real cava loading');await bounded(loadSource(page,17),'optional cava load');console.log('QA: optional real cava generating');const milliseconds=await bounded(generate(page,17),'optional cava generation');cava={elapsedMs:milliseconds,...await audit(page,17,false)};assert.equal(cava.features,636);assert.equal(cava.flag,false);assert.equal(cava.exactRings,0);assert.equal(cava.v3limit,null);assert.ok(cava.finite>10000);assert.equal(cava.painted,cava.finite);assert.equal(cava.sourceUnchanged,true);}
    assert.deepEqual(errors,[]);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex'),fixtureHash,'real fixture untouched');
    console.log(JSON.stringify({pass:true,elapsedMs:elapsed,fixtureHash,na,explicitMask:mask,roundtrip:true,cava,errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
