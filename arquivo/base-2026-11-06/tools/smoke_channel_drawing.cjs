// Drawing-only regression. Offline app, disposable browser, no user project.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const appPath=process.env.APP_PATH||path.resolve(__dirname,'../dist/GeoMine.html');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  for(const touch of [false,true]){
   const context=await browser.newContext({viewport:touch?{width:1024,height:640}:{width:1400,height:950},hasTouch:touch}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
   await page.goto('file://'+appPath);
   await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineChannelExtraction);
   await page.evaluate(()=>{
    S.setBase('Sem fundo');S.workCRS='EPSG:31982';
    window.__source=addLayer({name:'Linha já editada',gtype:'line',crs:S.workCRS,fields:[{name:'ID',type:'N'}],
     features:[{geom:[[500000,7400020],[500080,7400020]],props:{ID:1}}]});
    S.undo=[];edLigar(true,true);edSelecionar({L:__source,idx:0,f:__source.features[0]},true);
    edSnapshot('Edição anterior ao desenho');edAplicar([[[500000,7400020],[500100,7400020]]]);
    window.__sourceBefore=JSON.stringify(__source.features);window.__undoBefore=S.undo[0];
    S.prof.buf=[[0,0],[1,1]];window.__prof=S.prof;window.__profBefore=JSON.stringify(S.prof);
    window.__same=()=>JSON.stringify(__source.features)===__sourceBefore&&S.undo[0]===__undoBefore&&S.prof===__prof&&JSON.stringify(S.prof)===__profBefore;
    window.__point=(x,y,detail=1)=>{const w=toWGS(S.workCRS,x,y);map.fire('click',{latlng:L2.latLng(w[1],w[0]),originalEvent:{detail}});};
    window.__drawingState=()=>{const paths=[];map.eachLayer(l=>{if(l.options?.pane==='alagis_desenho'&&l.options?.color==='#2da9b9')paths.push(l);});
     return {paths:paths.length,solid:paths.every(l=>l instanceof L2.Polyline&&!l.options.dashArray),
      handles:S.vtxLayer.getLayers().length+(ED.lay?.getLayers().length||0),editor:ED.on,same:__same(),tool:S.tool};};
    const a=toWGS(S.workCRS,499980,7399970),b=toWGS(S.workCRS,500120,7400050);
    map.fitBounds([[a[1],a[0]],[b[1],b[0]]],{animate:false,padding:[40,40]});
    GeoMineChannelExtraction.open();
   });
   const line=page.locator('.mtool[data-tool="line"]');const normalTitle=await line.getAttribute('title');
   await page.locator('#chanDraw').click();
   assert.equal(await page.locator('#chanDrawBar,#chanDrawInfo,#chanFinishAxis').count(),0);
   assert.match(await line.getAttribute('title'),/Concluir eixo/);
   await page.evaluate(()=>{__point(500000,7400000);__point(500040,7400008);__point(500080,7400000);});
   assert.deepEqual(await page.evaluate(()=>__drawingState()),{paths:1,solid:true,handles:0,editor:false,same:true,tool:'riverChannelAxis'});
   assert.equal(await page.evaluate(()=>S.layers.length),1);assert.equal(await page.evaluate(()=>S.undo.length),1);
   await page.waitForFunction(()=>getComputedStyle(document.getElementById('toast')).opacity==='0');
   await page.screenshot({path:path.resolve(__dirname,`../dist/channel-drawing-${touch?'tablet':'desktop'}.png`)});
   if(touch){
    const box=await line.boundingBox();assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=1024&&box.y+box.height<=640);
    await line.tap();
   }else await page.keyboard.press('Enter');
   const finished=await page.evaluate(()=>{const L=S.layers.find(l=>l!==__source);return {count:S.layers.length,geom:L?.features[0].geom,
    dash:L?.sym.dash,state:__drawingState(),undo:S.undo.length,modal:document.getElementById('chanModal').classList.contains('on')};});
   assert.equal(finished.count,2);assert.equal(finished.undo,2);assert.equal(finished.dash,'');assert.equal(finished.modal,true);
   assert.deepEqual(finished.state,{paths:0,solid:true,handles:0,editor:false,same:true,tool:'select'});
   assert.ok(finished.geom.every((p,i)=>Math.hypot(p[0]-(500000+i*40),p[1]-(i===1?7400008:7400000))<1e-6));
   assert.equal(await line.getAttribute('title'),normalTitle);assert.equal(await line.evaluate(e=>e.classList.contains('on')),false);
   await page.evaluate(()=>{doUndo();GeoMineChannelExtraction.open();});

   // Two-click finalization must neither add a tiny last segment nor zoom.
   await page.locator('#chanDraw').click();
   await page.evaluate(()=>{
    __point(500000,7400000);__point(500080,7400000);__point(500080.01,7400000.01,2);
    window.__zoom=map.getZoom();map.fire('dblclick',{originalEvent:{preventDefault(){},stopPropagation(){}}});
   });
   assert.equal(await page.evaluate(()=>S.layers.find(l=>l!==__source).features[0].geom.length),2);
   assert.equal(await page.evaluate(()=>map.getZoom()===__zoom&&__same()),true);
   await page.evaluate(()=>{doUndo();GeoMineChannelExtraction.open();});

   // Exercise the real DOM/Leaflet gesture path, not only map event handlers.
   await page.locator('#chanDraw').click();
   const pixels=await page.evaluate(()=>[[500000,7400000],[500080,7400000]].map(p=>{
    const w=toWGS(S.workCRS,...p),pt=map.latLngToContainerPoint([w[1],w[0]]),r=map.getContainer().getBoundingClientRect();return {x:r.x+pt.x,y:r.y+pt.y};
   }));
   if(touch){
    await page.touchscreen.tap(pixels[0].x,pixels[0].y);await page.waitForTimeout(350);
    await page.touchscreen.tap(pixels[1].x,pixels[1].y);await page.touchscreen.tap(pixels[1].x,pixels[1].y);
   }else{
    await page.mouse.click(pixels[0].x,pixels[0].y);await page.mouse.dblclick(pixels[1].x,pixels[1].y);
   }
   await page.waitForFunction(()=>S.layers.length===2);
   assert.equal(await page.evaluate(()=>S.layers.find(l=>l!==__source).features[0].geom.length),2);
   assert.equal(await page.evaluate(()=>__same()&&S.undo.length===2&&!ED.on),true);
   await page.evaluate(()=>{doUndo();GeoMineChannelExtraction.open();});

   // Cancel or change tools: remove only this preview, keep edits and profile.
   await page.locator('#chanDraw').click();await page.evaluate(()=>__point(500000,7400000));await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>S.layers.length===1&&S.undo.length===1&&__same()),true);
   assert.equal(await line.getAttribute('title'),normalTitle);
   await page.locator('#chanDraw').click();await page.evaluate(()=>{__point(500000,7400000);__point(500080,7400000);setTool('select');});
   assert.deepEqual(await page.evaluate(()=>__drawingState()),{paths:0,solid:true,handles:0,editor:false,same:true,tool:'select'});

   // Existing in-progress editing/drawing is rejected, never silently lost.
   for(const pending of ['edit','drag','draw']){
    await page.evaluate(kind=>{
     GeoMineChannelExtraction.open();edLigar(true,true);
     window.__pending={test:true};if(kind==='edit')ED.pend=__pending;else if(kind==='drag')ED.drag=__pending;else S.drawBuf=[[1,2]];
     GeoMineChannelExtraction.beginDraw();
    },pending);
    assert.equal(await page.evaluate(kind=>ED.on&&S.tool!=='riverChannelAxis'&&S.layers.length===1&&S.undo.length===1&&__same()&&
     (kind==='edit'?ED.pend===__pending:kind==='drag'?ED.drag===__pending:S.drawBuf.length===1),pending),true);
    await page.evaluate(()=>{ED.pend=null;ED.drag=null;S.drawBuf=[];edLigar(false);});
   }
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS normal solid axis without counter/vertex handles; Enter, double click and tablet Line button; no duplicate endpoint; cancel/tool-switch cleanup; existing edits, undo and S.prof preserved; pending work protected');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
