// Real mouse/touch UI regression. Disposable offline browser; synthetic MDT.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline');
const app=process.env.APP_PATH||path.join(root,baseline?'baseline-dist/GeoMine.html':'dist/GeoMine.html');
const build=crypto.createHash('sha256').update(fs.readFileSync(app)).digest('hex'),reports=[];
const out=path.join(root,'resultados');fs.mkdirSync(out,{recursive:true});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  for(const touch of process.env.TOUCH_ONLY?[true]:[false,true]){
   const page=await browser.newPage({viewport:touch?{width:1280,height:800}:{width:1440,height:1000},hasTouch:touch}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route(/^https?:/,r=>r.abort());
   await page.goto('file://'+app);await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted);
   await page.evaluate(()=>{
    window.__qaTrace=[];const clear=clearDraw;window.clearDraw=function(){if(S.drawBuf?.length)__qaTrace.push({fn:'clearDraw',tool:S.tool,points:S.drawBuf.length,stack:new Error().stack});return clear.apply(this,arguments);};
    const set=setTool;window.setTool=function(tool){if(S.drawBuf?.length)__qaTrace.push({fn:'setTool',from:S.tool,to:tool,points:S.drawBuf.length,stack:new Error().stack});return set.apply(this,arguments);};
    const finish=finishDraw;window.finishDraw=function(){if(S.drawBuf?.length)__qaTrace.push({fn:'finishDraw',tool:S.tool,points:S.drawBuf.length,stack:new Error().stack});return finish.apply(this,arguments);};
    window.__state=()=>({tool:S.tool,activeId:S.activeId,buf:S.drawBuf.map(p=>p.slice()),
     preview:S.drawLayer.getLayers().map(l=>({type:l instanceof L2.Polygon?'polygon':l instanceof L2.Polyline?'line':'point',ll:l.getLatLngs?l.getLatLngs():l.getLatLng()})),
     previewOnMap:map.hasLayer(S.drawLayer),features:__L.features.length,undo:S.undo.length,
     rasterVisible:__R.visible,rasterOnMap:!!__R.overlay&&map.hasLayer(__R.overlay),referenceVisible:__reference.visible,trace:__qaTrace.slice()});
   });
   async function frames(){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));if(touch)await page.waitForTimeout(350);}
   async function setup(tool){
    await page.evaluate(({tool,touch})=>{
     GeoMineChannelLive?.stop();setTool('select');edLigar(false,true);clearVertices();continuarChip(false);
     for(const l of S.layers)if(l.llayer)map.removeLayer(l.llayer);for(const r of S.rasters)if(r.overlay)map.removeLayer(r.overlay);
     S.layers=[];S.rasters=[];S.groups=[];S.stack=[];S.img=null;S.activeId=null;S.selFeat=null;S.selRaster=null;S._continuando=null;S._ultimoDesenho=null;
     S.projectId='qa-draw-visibility-'+tool;S.setBase('Sem fundo');S.workCRS='EPSG:31982';S.touch=touch;S.snapOn=false;S.orthoOn=false;
     const nc=21,nr=21,z=new Float32Array(nc*nr);for(let r=0;r<nr;r++)for(let c=0;c<nc;c++)z[r*nc+c]=100+r*.2+c*.3;
     window.__R={id:9001,name:'MDT sintético QA',groupId:9002,visible:true,style:{mode:'hipso_hs',opacity:.6},d:{nc,nr,cs:10,xll:499960,yll:7399960,z,zmin:100,zmax:110}};
     S.rasters.push(__R);renderRaster(__R);
     window.__reference=addLayer({name:'Referência QA',gtype:'line',crs:S.workCRS,fields:[],color:'#55bbdd',features:[{geom:[[499970,7399980],[500100,7399980]],props:{}}]});__reference.groupId=9002;
     window.__L=addLayer({name:'Desenho QA',gtype:tool==='poly'?'polygon':'line',crs:S.workCRS,fields:[],color:'#edc34f',features:[]});
     S.groups=[{id:9002,name:'BASES QA',collapsed:false}];S.activeId=__L.id;refreshUI();zApply();
     const w=toWGS(S.workCRS,500040,7400035);map.setView([w[1],w[0]],18,{animate:false});S.undo=[];__qaTrace=[];
     document.getElementById('qaDrawingLabel')?.remove();const label=document.createElement('div');label.id='qaDrawingLabel';
     label.textContent='TESTE CONTROLADO · traçado preservado ao ocultar o MDT';
     label.style.cssText='position:fixed;top:185px;left:50%;transform:translateX(-50%);z-index:14000;background:#102637;color:#fff;border:1px solid #37c0aa;padding:7px 14px;border-radius:6px;font:13px system-ui;pointer-events:none';document.body.append(label);
    },{tool,touch});await frames();
    const button=page.locator(`.mtool[data-tool="${tool}"]`);await(touch?button.tap():button.click());
    if(await page.locator('#drawDest.on').count()){assert.equal(await page.locator('#ddAtiva').isChecked(),true);await page.locator('#ddOk').click();}
    await page.waitForFunction(tool=>S.tool===tool,tool);if(touch)await page.waitForTimeout(450);
   }
   async function clickPoint(p){const s=await page.evaluate(p=>{const w=toWGS(S.workCRS,...p),v=map.latLngToContainerPoint([w[1],w[0]]),r=map.getContainer().getBoundingClientRect();return {x:r.x+v.x,y:r.y+v.y};},p);
    if(touch)await page.touchscreen.tap(s.x,s.y);else await page.mouse.click(s.x,s.y);await page.waitForTimeout(360);
   }
   function sameDraft(before,after,expectedActive=before.activeId){assert.equal(after.tool,before.tool);assert.equal(after.activeId,expectedActive);assert.deepEqual(after.buf,before.buf);assert.deepEqual(after.preview,before.preview);assert.equal(after.previewOnMap,true);assert.equal(after.features,0);assert.equal(after.undo,0);}
   for(const tool of ['line','poly'])for(const target of ['raster','group','raster-row-eye','raster-row-group']){
    await setup(tool);const points=[[500000,7400000],[500060,7400005],[500080,7400050],[500010,7400070]],n=tool==='poly'?3:2;
    for(const p of points.slice(0,n))await clickPoint(p);
    const before=await page.evaluate(()=>{const s=__state();__qaTrace=[];return s;});
    if(before.buf.length!==n){await page.screenshot({path:path.join(out,'drawing-initial-failure.png')});console.log('INITIAL-DRAFT-FAIL '+JSON.stringify({touch,tool,target,state:before,ui:await page.evaluate(()=>({open:[...document.querySelectorAll('.on')].filter(e=>e.getBoundingClientRect().width).map(e=>({id:e.id,cls:e.className,text:e.textContent.slice(0,200)})),ed:{on:ED.on,pend:ED.pend},ctr:map.getCenter(),dragging:map.dragging.enabled()}))}));}
    assert.equal(before.buf.length,n);assert.ok(before.preview.length>n);assert.equal(before.features,0);
    const rowFirst=target.startsWith('raster-row'),group=target==='group'||target==='raster-row-group';
    const rasterRow=page.locator('#layerList .layer').filter({has:page.locator('.nm',{hasText:/^MDT sintético QA$/})});
    if(rowFirst){await(touch?rasterRow.locator('.nm').tap():rasterRow.locator('.nm').click());await frames();}
    const selected=await page.evaluate(()=>__state());
    const row=!group?rasterRow:page.locator('#layerList .grp').filter({has:page.locator('.nm',{hasText:/^BASES QA$/})});
    await(touch?row.locator('.eye').tap():row.locator('.eye').click());await frames();
    const after=await page.evaluate(()=>__state());
    if(baseline){
     const lost=JSON.stringify(after.buf)!==JSON.stringify(before.buf)||after.tool!==before.tool||after.activeId!==before.activeId||JSON.stringify(after.preview)!==JSON.stringify(before.preview);
     let finished=null;
     if(rowFirst){await clickPoint(points[n]);if(touch)await page.locator(`.mtool[data-tool="${tool}"]`).tap();else await page.keyboard.press('Enter');await frames();finished=await page.evaluate(()=>__state());}
     reports.push({mode:touch?'touch':'desktop',tool,target,reproduced:lost,before:{tool:before.tool,activeId:before.activeId,buf:before.buf,preview:before.preview.length},after:{tool:after.tool,activeId:after.activeId,buf:after.buf,preview:after.preview.length},finished:finished?{features:finished.features,buf:finished.buf,preview:finished.preview.length}:null,trace:finished?.trace||after.trace});
     console.log(JSON.stringify(reports.at(-1)));continue;
    }
    sameDraft(before,after,selected.activeId);assert.equal(after.rasterVisible,false);assert.equal(after.rasterOnMap,false);if(group)assert.equal(after.referenceVisible,false);
    assert.equal(after.trace.length,0,'visibility must not call destructive drawing commands');
    // Repeated visibility toggles preserve the same destination and vertices.
    await(touch?row.locator('.eye').tap():row.locator('.eye').click());await frames();sameDraft(before,await page.evaluate(()=>__state()),selected.activeId);
    await(touch?row.locator('.eye').tap():row.locator('.eye').click());await frames();sameDraft(before,await page.evaluate(()=>__state()),selected.activeId);
    if(tool==='poly'&&target==='raster-row-eye')await page.screenshot({path:path.join(out,`drawing-visibility-${touch?'tablet':'desktop'}-synthetic.png`)});
    await clickPoint(points[n]);const continued=await page.evaluate(()=>__state());assert.equal(continued.buf.length,n+1);assert.deepEqual(continued.buf.slice(0,n),before.buf);
    const expected=await page.evaluate(()=>S.drawBuf.map(([lat,lng])=>fromWGS(__L.crs,lng,lat)));
    if(touch)await page.locator(`.mtool[data-tool="${tool}"]`).tap();else await page.keyboard.press('Enter');await frames();
    const done=await page.evaluate(()=>({count:__L.features.length,all:S.layers.reduce((n,l)=>n+l.features.length,0),f:__L.features[0],undo:S.undo.length,buf:S.drawBuf,preview:S.drawLayer.getLayers().length,tool:S.tool,activeId:S.activeId}));
    assert.equal(done.count,1);assert.equal(done.all,2);assert.equal(done.undo,1);assert.deepEqual(done.buf,[]);assert.equal(done.preview,0);if(!rowFirst)assert.equal(done.activeId,before.activeId);
    const geom=tool==='poly'?done.f.geom[0]:done.f.geom;assert.equal(geom.length,expected.length+(tool==='poly'?1:0));
    expected.forEach((p,i)=>{near(geom[i][0],p[0]);near(geom[i][1],p[1]);});if(tool==='poly')assert.deepEqual(geom.at(-1),geom[0]);
    await page.evaluate(()=>doUndo());assert.equal(await page.evaluate(()=>__L.features.length),0);
    reports.push({mode:touch?'touch':'desktop',tool,target,pass:true});console.log('PASS '+JSON.stringify(reports.at(-1)));
   }
   if(!baseline&&!process.env.SKIP_EXTRA){
    const rasterRow=()=>page.locator('#layerList .layer').filter({has:page.locator('.nm',{hasText:/^MDT sintético QA$/})});
    async function selectAndHide(){const row=rasterRow();await(touch?row.locator('.nm').tap():row.locator('.nm').click());await(touch?row.locator('.eye').tap():row.locator('.eye').click());await frames();}
    async function finishUI(tool){if(touch)await page.locator(`.mtool[data-tool="${tool}"]`).tap();else await page.keyboard.press('Enter');await frames();}
    function extra(tool,target){reports.push({mode:touch?'touch':'desktop',tool,target,pass:true});console.log('PASS '+JSON.stringify(reports.at(-1)));}
    for(const tool of ['line','poly']){
     await setup(tool);const points=[[500000,7400000],[500060,7400005],[500080,7400050],[500010,7400070]],n=tool==='poly'?3:2;
     for(const p of points.slice(0,n))await clickPoint(p);await finishUI(tool);
     await page.evaluate(()=>{window.__savedFeature=__L.features[0];__savedFeature.props.QA='mesma feição';window.__savedGeom=JSON.parse(JSON.stringify(__savedFeature.geom));window.__savedProps=JSON.parse(JSON.stringify(__savedFeature.props));});
     await(touch?page.locator('#gmContinuarDesenho').tap():page.locator('#gmContinuarDesenho').click());await frames();
     assert.equal(await page.evaluate(()=>S._continuando?.f===__savedFeature),true);await selectAndHide();await clickPoint(points[n]);await finishUI(tool);
     const continued=await page.evaluate(()=>({count:__L.features.length,same:__L.features[0]===__savedFeature,geom:__savedFeature.geom,props:__savedFeature.props,oldProps:__savedProps,undo:S.undo.length}));
     assert.equal(continued.count,1);assert.equal(continued.same,true);assert.deepEqual(continued.props,continued.oldProps);assert.equal(continued.undo,2);
     assert.equal((tool==='poly'?continued.geom[0]:continued.geom).length,n+1+(tool==='poly'?1:0));
     await page.evaluate(()=>doUndo());assert.equal(await page.evaluate(()=>JSON.stringify(__L.features[0].geom)===JSON.stringify(__savedGeom)),true);
     extra(tool,'continuar preserves original feature/properties; raster selection/hide; atomic geometry undo');

     await setup(tool);for(const p of points.slice(0,n))await clickPoint(p);await selectAndHide();
     const before=await page.evaluate(()=>__state());await page.evaluate(()=>{__L.locked=true;});await page.keyboard.press('Escape');await frames();
     sameDraft(before,await page.evaluate(()=>__state()));assert.equal(await page.evaluate(()=>GeoMineDrawingSession.layer()===__L),true);
     await page.evaluate(()=>{__L.locked=false;});await page.keyboard.press('Escape');await frames();
     assert.equal(await page.evaluate(()=>__L.features.length),1);assert.equal(await page.evaluate(()=>S.tool),'select');assert.equal(await page.evaluate(()=>S.drawBuf.length),0);assert.equal(await page.evaluate(()=>S.undo.length),1);
     extra(tool,'Escape refuses locked destination without loss; unlocking commits same destination');

     await setup(tool);await clickPoint(points[0]);await selectAndHide();await page.keyboard.press('Escape');await frames();
     assert.equal(await page.evaluate(()=>S.drawBuf.length),0);assert.equal(await page.evaluate(()=>__L.features.length),0);assert.equal(await page.evaluate(()=>S.tool),'select');assert.equal(await page.evaluate(()=>S.undo.length),0);
     extra(tool,'Escape cancels an insufficient draft without creating a feature');
    }
    await setup('line');
    await page.evaluate(()=>{document.getElementById('cadCoord').value='500000,7400000';cadInsert();});await selectAndHide();
    await page.evaluate(()=>{document.getElementById('cadCoord').value='500060,7400000';cadInsert();document.activeElement.blur();GeoMineOrtho.set(true);});
    assert.equal(await page.evaluate(()=>S.drawBuf.length),2);await clickPoint([500072,7400050]);
    const xy=await page.evaluate(()=>S.drawBuf.map(([lat,lng])=>fromWGS(__L.crs,lng,lat)));near(xy[0][0],500000);near(xy[0][1],7400000);near(xy[1][0],500060);near(xy[1][1],7400000);near(xy[2][0],500060);assert.ok(xy[2][1]>7400048);
    await finishUI('line');assert.equal(await page.evaluate(()=>__L.features.length),1);assert.equal(await page.evaluate(()=>__L.features[0].geom.length),3);
    extra('line','CAD coordinates and ORTO keep frozen drawing destination after raster inspection');
   }
   assert.deepEqual(errors,[]);await page.close();
  }
  if(baseline)assert.ok(reports.some(r=>r.reproduced),'baseline must reproduce at least one lost draft');
  console.log(JSON.stringify({build,baseline,passed:reports.filter(r=>r.pass).length,reproduced:reports.filter(r=>r.reproduced).length},null,2));
 }finally{fs.writeFileSync(path.join(out,baseline?'drawing-visibility-baseline.json':'drawing-visibility-regression.json'),JSON.stringify({build,baseline,reports},null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
