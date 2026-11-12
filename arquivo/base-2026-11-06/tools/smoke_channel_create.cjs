// Isolated, offline creation regression. Synthetic MDT only; no user data.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stage=path.resolve(__dirname,'..');let passed=0;
const pass=name=>{passed++;console.log('PASS '+name);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800},hasTouch:true}),errors=[],dialogs=[];
  page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
  page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
  await page.goto('file://'+path.resolve(process.env.APP_PATH||path.join(stage,'dist/GeoMine.html')));
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineChannelExtraction&&window.GeoMineChannelDetails);
  await page.evaluate(()=>{
   GeoMineChannelLive.stop();S.setBase('Sem fundo');S.projectId='channel-create-synthetic';S.workCRS='EPSG:31982';
   const nc=161,nr=161,cs=.5,xll=499979.75,yll=7399979.75,z=new Float32Array(nc*nr),angle=.61,c=Math.cos(angle),s=Math.sin(angle);
   for(let r=0;r<nr;r++)for(let col=0;col<nc;col++){
    const x=xll+(col+.5)*cs-500000,y=yll+(nr-r-.5)*cs-7400000;
    z[r*nc+col]=100+.04*(x*c+y*s)+Math.abs(-x*s+y*c);
   }
   const grid={nc,nr,cs,csy:cs,xll,yll,z,zmin:98,zmax:190,native:true,resampled:1,srcCRS:S.workCRS};
   const raster={id:9965,name:'MDT sintético diagonal — teste de criação',crs:S.workCRS,visible:false,style:{mode:'hipso'},d:grid};S.rasters.push(raster);
   const axis=addLayer({name:'Guia sintética — contorno editável',gtype:'line',crs:S.workCRS,fields:[],features:[{geom:[[500000,7400000],[500000+40*c,7400000+40*s]],props:{TESTE:'sintético'}}]});
   window.__createQA={grid,raster,axis,originalZ:z.slice(),originalGeometry:JSON.stringify(axis.features.map(f=>({geom:f.geom,props:f.props})))};
   const open=GeoMineChannelDetails.open;GeoMineChannelDetails.open=function(ctx){__createQA.review=ctx.snapshot;return open.call(this,ctx);};
   S.activeId=axis.id;ED.on=false;ED.sel=null;S.selFeat=null;GeoMineChannelExtraction.open();
  });
  const analyze=async()=>{await page.locator('#chanAnalyze').tap();await page.waitForFunction(()=>!document.getElementById('chanAnalyze').disabled);};
  const create=async()=>{await page.locator('#chanCommit').tap();await page.waitForFunction(()=>!document.getElementById('chanCommit').disabled);};
  const status=()=>page.locator('#chanStatus').textContent();
  const visibleStatus=async()=>{const b=await page.locator('#chanStatus').boundingBox();assert.ok(b&&b.height>0&&b.y>=0&&b.y+b.height<=800,'feedback must be visible without searching or scrolling');};
  const count=()=>page.evaluate(()=>S.layers.length);
  assert.equal(await page.locator('#chanConfirm').count(),0);
  assert.equal(await page.locator('#chanDestination').inputValue(),'auto');
  await page.locator('#chanMode').selectOption('axisDepth');await page.evaluate(()=>{const e=document.getElementById('chanRaster');e.value='';e.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await page.locator('#chanCommit').isEnabled(),true);await create();
  assert.match(await status(),/MDT/i);await visibleStatus();assert.equal(await count(),1);
  pass('tap Create without a valid MDT reports the reason in the visible footer; no confirmation checkbox exists');
  await page.locator('#chanRaster').selectOption('9965');await page.locator('#chanHeight').fill('2');await page.locator('#chanInterval').fill('10');await page.locator('#chanLimit').check();await page.locator('#chanReach').fill('20');
  await create();assert.match(await status(),/criada/i);await visibleStatus();assert.equal(await count(),3);
  const captures=path.resolve(process.env.QA_CAPTURE_DIR||path.join(stage,'resultados'));fs.mkdirSync(captures,{recursive:true});
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('toast')).opacity==='0');
  await page.screenshot({path:path.join(captures,'channel-create-tablet-synthetic-1280x800.png')});
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:path.join(captures,'channel-create-desktop-synthetic-1440x1000.png')});await page.setViewportSize({width:1280,height:800});
  await page.locator('#chanCommit').dblclick();await page.waitForFunction(()=>!document.getElementById('chanCommit').disabled);assert.equal(await count(),3);
  await page.waitForTimeout(1200);await create();assert.equal(await count(),3,'same source and options must not duplicate even after a debounce window');
  pass('configured Create performs analysis itself and repeated clicks do not create duplicate layers');
  await page.locator('#chanHeight').fill('2.2');
  await analyze();assert.match(await status(),/Prévia pronta/);assert.equal(await page.locator('#chanCommit').isEnabled(),true);
  await page.locator('#chanDetails').tap();const review=await page.evaluate(()=>JSON.parse(JSON.stringify(__createQA.review)));
  assert.match(await page.locator('#cdPreview').textContent(),/Contorno simplificado/);assert.match(await page.locator('#cdPreview').textContent(),/perfis nativos/i);assert.doesNotMatch(await page.locator('#cdPreview').textContent(),/mancha real|nativ[oa] exat/i);
  await page.locator('#cdClose').tap();
  const out=review.outputs[0];assert.ok(out.polygons.length);assert.ok(out.contour?.applied,'diagonal raster contour must be reduced for editing');assert.ok(out.contour.verticesAfter<out.contour.verticesBefore);assert.equal(out.contour.spacing,10);
  const vertices=out.polygons.reduce((n,p)=>n+p.reduce((a,r)=>a+r.length-1,0),0);assert.equal(vertices,out.contour.verticesAfter);
  const identity=await page.evaluate(()=>({axis:JSON.stringify(__createQA.axis.features.map(f=>({geom:f.geom,props:f.props})))===__createQA.originalGeometry,raster:__createQA.originalZ.every((v,i)=>v===__createQA.grid.z[i])}));assert.deepEqual(identity,{axis:true,raster:true});
  const originalIds=await page.evaluate(()=>S.layers.filter(l=>l._channelLink).map(l=>l.id).sort((a,b)=>a-b));
  await page.locator('#chanLive').check();await create();assert.match(await status(),/criad|atualiz/i);await visibleStatus();assert.equal(await count(),3);
  const saved=await page.evaluate(()=>{const generated=S.layers.filter(l=>l._channelLink);__createQA.link=generated[0]._channelLink.id;return generated.map(l=>({type:l.gtype,features:l.features}));});
  assert.deepEqual(await page.evaluate(()=>S.layers.filter(l=>l._channelLink).map(l=>l.id).sort((a,b)=>a-b)),originalIds);
  assert.deepEqual(saved.find(l=>l.type==='polygon').features.map(f=>f.geom),out.polygons);
  for(const layer of saved)for(const feature of layer.features){assert.equal(feature.props.VERT_ORIG,out.contour.verticesBefore);assert.equal(feature.props.VERT_FINAL,out.contour.verticesAfter);assert.equal(feature.props.TOL_SIMPL,out.contour.effectiveTolerance);}
  assert.equal(await page.locator('#chanCommit').isEnabled(),true);await page.locator('#chanCommit').dblclick();await page.waitForFunction(()=>!document.getElementById('chanCommit').disabled);assert.equal(await count(),3);
  pass('valid preview updates the same two layers by tap; duplicate clicks do not duplicate them; reduced preview equals editable geometry');
  await page.locator('#chanClose').tap();
  const edited=await page.evaluate(()=>{const p=S.layers.find(l=>l._channelLink?.id===__createQA.link&&l.gtype==='polygon'),r=p.features[0].geom[0];r[1][0]+=.1;p.features[0].props.NOTA='edição manual de QA';drawLayer(p);return JSON.stringify(p.features.map(f=>({geom:f.geom,nota:f.props.NOTA})));});
  await page.waitForFunction(()=>S.layers.filter(l=>l._channelLink?.id===__createQA.link).every(l=>l._channelLink.entries.every(e=>e.state==='detached')));
  await page.evaluate(()=>{__createQA.axis.features[0].geom[1][0]+=.5;drawLayer(__createQA.axis);});await page.waitForTimeout(700);
  assert.equal(await page.evaluate(()=>JSON.stringify(S.layers.find(l=>l._channelLink?.id===__createQA.link&&l.gtype==='polygon').features.map(f=>({geom:f.geom,nota:f.props.NOTA})))),edited);
  pass('editing the reduced polygon pauses its live link and a later axis edit cannot overwrite it');
  await page.evaluate(()=>{S.activeId=__createQA.axis.id;GeoMineChannelExtraction.open();});await page.locator('#chanRaster').selectOption('9965');await page.locator('#chanMode').selectOption('axisDepth');await page.locator('#chanHeight').fill('2');await page.locator('#chanInterval').fill('10');await page.locator('#chanLive').uncheck();
  await analyze();assert.match(await status(),/Prévia pronta/);await page.evaluate(()=>{__createQA.axis.features[0].geom[1][0]+=.2;});
  await create();assert.match(await status(),/criad|atualiz/i);await visibleStatus();assert.equal(await count(),3);assert.equal(dialogs.length,1);assert.match(dialogs[0],/manual|alter|substitu|regener/i);
  const fresh=await page.evaluate(()=>{const axis=__createQA.axis.features[0].geom,L=S.layers.find(l=>l._channelLink?.id===__createQA.link&&l.gtype==='line');return {length:Math.hypot(axis[1][0]-axis[0][0],axis[1][1]-axis[0][1]),end:Math.max(...L.features.map(f=>f.props.PROG_M))};});assert.ok(Math.abs(fresh.length-fresh.end)<1e-6);
  pass('a source edit after preview triggers fresh analysis and creates the updated extent, never the stale result');
  await page.evaluate(()=>{__createQA.grid.z=new Float32Array(__createQA.originalZ.length).fill(NaN);});await create();
  assert.doesNotMatch(await status(),/Prévia pronta|criada/i);assert.match(await status(),/cota|cobertura|NoData|MDT|dado/i);await visibleStatus();assert.equal(await count(),3);assert.equal(await page.locator('#chanDetails').isEnabled(),false);
  await page.evaluate(()=>{__createQA.grid.z=__createQA.originalZ.slice();});await page.locator('#chanHeight').fill('2.3');await create();assert.match(await status(),/criad|atualiz/i);assert.equal(await count(),3);
  pass('NoData does not create or replace layers; restoring coverage allows a clean analysis and creation retry');
  assert.deepEqual(errors,[]);console.log(`channel create browser: ${passed}/${passed} PASS`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
