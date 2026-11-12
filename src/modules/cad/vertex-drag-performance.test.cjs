/* Local user-project vectors only; no project data leaves this browser. */
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.argv[2],baseline=process.argv.includes('--baseline');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.json'?'application/json':'text/html');fs.createReadStream(req.url==='/fixture.json'?'/tmp/geomine-real-vector-fixture.json':path.join(root,'dist/GeoMine.html')).pipe(res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1560,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));await page.route('https://**',route=>route.abort());await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.GeoMineDynamicSegment);
  await page.evaluate(async()=>{
   const data=await(await fetch('/fixture.json')).json();clearDraw();S.setBase('Sem fundo');for(const L of S.layers||[])if(L.llayer)map.removeLayer(L.llayer);
   S.workCRS=data.workCRS;S.layers=data.layers.map(L=>({...L,llayer:null,sym:{mode:'single',color:'#2563eb',stroke:'#111111',weight:1.5,fill:.35,hatch:'solid',classes:[],cats:[],...L.sym},fields:L.fields||[]}));
   S.snapOn=true;S.snapMidOn=true;S.snapEndOn=true;S.snapNearOn=true;S.snapCenterOn=true;S.snapVtxOn=true;S.snapEscopo='todas';S.orthoOn=false;GeoMineVertexGuides.setEnabled(true);
   window.qaProfile={};for(const name of ['snapLatLng','snapCacheOf','snapRefreshFeatureCache','drawVertexFeature','toWGS','autoAreaSyncFeature','cavaLiveSync','rb31PosEdicao','projecaoLiveSync']){
    const original=window[name];if(typeof original!=='function')continue;const s=qaProfile[name]={calls:0,ms:0,max:0};window[name]=function(...args){const t=performance.now();try{return original.apply(this,args);}finally{const d=performance.now()-t;s.calls++;s.ms+=d;s.max=Math.max(s.max,d);}};
   }
   window.qaRows=[];
  });
  for(const snap of [false,true])for(const lid of [177,175]){
   const start=await page.evaluate(({lid,snap})=>{
    setTool('select');clearVertices();for(const L of S.layers)if(L.llayer)map.removeLayer(L.llayer);
    const L=S.layers.find(L=>L.id===lid);let idx=0;L.features.forEach((f,i)=>{if(snapRingsOf(L,f)[0]?.length>snapRingsOf(L,L.features[idx])[0]?.length)idx=i;});const f=L.features[idx],ring=snapRingsOf(L,f)[0],vi=ring.length>>1;
    window.qaL=L;window.qaF=f;window.qaBefore=JSON.stringify(f.geom);window.qaZ=JSON.stringify(f.zg);window.qaOldOthers=L.features.map(f=>f.geom);window.qaVi=vi;
    const w=toWGS(L.crs,ring[vi][0],ring[vi][1]);map.setView([w[1],w[0]],21,{animate:false});drawLayer(L);S.activeId=L.id;S.selFeat={layer:L,layerId:L.id,idx};setTool('vertex');S.undo=[];
    S.snapOn=snap;if(snap)for(const L of S.layers)if(L.visible!==false)snapCacheOf(L);
    const mk=S._vtxCtx.marks.reduce((best,m)=>!best||Math.abs(m.vi-vi)<Math.abs(best.vi-vi)?m:best,null).mk;window.qaMk=mk;
    return {lid,idx,snap,vertices:ring.length,handles:S.vtxLayer.getLayers().length};
   },{lid,snap});
   await page.waitForTimeout(100);
   const row=await page.evaluate(async()=>{
    for(const s of Object.values(qaProfile)){s.calls=0;s.ms=0;s.max=0;}
    const original=qaMk.getLatLng();qaMk.fire('dragstart');const samples=[];
    for(let i=1;i<=24;i++){
     const p=map.latLngToContainerPoint(original).add([i*1.4,-i*.8]),ll=map.containerPointToLatLng(p),t=performance.now();qaMk.setLatLng(ll);qaMk.fire('drag');await new Promise(requestAnimationFrame);samples.push(performance.now()-t);
    }
    const profile=JSON.parse(JSON.stringify(qaProfile)),changed=qaBefore!==JSON.stringify(qaF.geom),z=qaZ===JSON.stringify(qaF.zg),last=qaMk.getLatLng();
    const path=qaL._vertexPaths.get(qaF),expected=(qaL.gtype==='polygon'?L2.polygon:L2.polyline)(featToLatLngs(qaL,qaF));
    const flatten=(a,out=[])=>{if(a?.[0]?.lat!==undefined)out.push(...a);else a.forEach(q=>flatten(q,out));return out;},actual=flatten(path.getLatLngs()),wanted=flatten(expected.getLatLngs());
    const renderedMatchesSource=actual.length===wanted.length&&actual.every((p,i)=>Math.abs(p.lat-wanted[i].lat)+Math.abs(p.lng-wanted[i].lng)<1e-9);
    qaMk.fire('dragend');finishVertexRender(qaL);const afterRelease=JSON.parse(JSON.stringify(qaProfile));
    const others=qaL.features.every((f,i)=>f===qaF||f.geom===qaOldOthers[i]),undoCount=S.undo.length;doUndo();const restored=JSON.stringify(qaF.geom)===qaBefore;
    const rawSamples=samples.slice();samples.sort((a,b)=>a-b);return {profile,afterRelease,p50:samples[12],p95:samples[22],max:samples[23],rawSamples,changed,z,others,undoCount,restored,renderedMatchesSource,finalLatLng:{lat:last.lat,lng:last.lng}};
   });
   assert(row.changed);assert(row.z);assert(row.others);assert(row.restored);assert(row.renderedMatchesSource);assert.equal(row.undoCount,1);
   if(!snap){assert.equal(row.afterRelease.snapLatLng.calls,0);assert.equal(row.afterRelease.snapCacheOf.calls,0);if(row.afterRelease.snapRefreshFeatureCache)assert.equal(row.afterRelease.snapRefreshFeatureCache.calls,0);}
   console.log(JSON.stringify({...start,p95:row.p95,max:row.max,renderedMatchesSource:row.renderedMatchesSource,snapCalls:row.afterRelease.snapLatLng.calls,cacheCalls:row.afterRelease.snapCacheOf.calls}));await page.evaluate(row=>qaRows.push(row),{...start,...row});
  }
  const integration=[];
  for(const owner of ['legacy','canvas']){
   const point=await page.evaluate(owner=>{
    setTool('select');if(ED.on)edLigar(false,true);for(const L of S.layers)if(L.llayer)map.removeLayer(L.llayer);S.layers=[];S.snapOn=false;S.orthoOn=false;
    window.mouseL=addLayer({name:'Pointer '+owner,gtype:'line',crs:S.workCRS,fields:[],features:[{geom:[[500000,7400000,10],[500020,7400000,20],[500040,7400000,30]],zg:[10,20,30],props:{}}]});window.mouseF=mouseL.features[0];window.mouseBefore=JSON.stringify(mouseF.geom);
    const w=toWGS(mouseL.crs,500020,7400000);map.setView([w[1],w[0]],22,{animate:false});S.activeId=mouseL.id;S.selFeat={layer:mouseL,layerId:mouseL.id,idx:0};
    if(owner==='legacy')setTool('vertex');else{edLigar(true,true);edSelecionar({L:mouseL,f:mouseF,idx:0},true);}
    S.undo=[];const cp=map.latLngToContainerPoint([w[1],w[0]]),r=map.getContainer().getBoundingClientRect();return {x:r.left+cp.x,y:r.top+cp.y};
   },owner);
   await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+35,point.y-22,{steps:8});await page.mouse.up();await page.waitForTimeout(70);
   const check=await page.evaluate(()=>{const moved=mouseBefore!==JSON.stringify(mouseF.geom),z=JSON.stringify(mouseF.zg)==='[10,20,30]'&&mouseF.geom[1][2]===20,count=S.undo.length,free=!S._vtxDragging&&!ED.drag&&!L2.Draggable._dragging;doUndo();return {moved,z,count,free,undo:mouseBefore===JSON.stringify(mouseF.geom)};});
   assert(check.moved);assert(check.z);assert(check.free);assert(check.undo);assert.equal(check.count,1);integration.push({owner,...check});
  }
  const fast=await page.evaluate(()=>{
   setTool('select');edLigar(false,true);S.layers=[];S.snapOn=false;const L=addLayer({name:'Fast closed ring',gtype:'polygon',crs:S.workCRS,fields:[],features:[{geom:[[500000,7400000,11],[500020,7400000,12],[500020,7400020,13],[500000,7400020,14],[500000,7400000,11]],zg:[11,12,13,14,11],props:{}}]}),f=L.features[0],before=JSON.stringify(f.geom);S.activeId=L.id;S.selFeat={layer:L,layerId:L.id,idx:0};setTool('vertex');S.undo=[];
   const mk=S._vtxCtx.marks.find(x=>x.vi===0).mk,ll=mk.getLatLng(),cp=map.latLngToContainerPoint(ll);mk.fire('dragstart');let last;
   for(let i=1;i<=30;i++){last=map.containerPointToLatLng(cp.add([i,-i]));mk.setLatLng(last);mk.fire('drag');}
   const pendingBefore=f.geom[0][0]===500000;mk.fire('dragend');const w=toWGS(L.crs,...f.geom[0]),flushed=Math.abs(w[0]-last.lng)+Math.abs(w[1]-last.lat)<1e-9,closed=JSON.stringify(f.geom[0])===JSON.stringify(f.geom.at(-1)),oneUndo=S.undo.length===1;doUndo();return {pendingBefore,flushed,closed,oneUndo,undo:JSON.stringify(f.geom)===before};
  });for(const value of Object.values(fast))assert(value);
  const rows=await page.evaluate(()=>qaRows);assert.deepEqual(errors,[]);fs.writeFileSync('/tmp/geomine-vertex-drag-'+(baseline?'baseline':'validation')+'.json',JSON.stringify({rows,integration,fast,errors},null,2));console.log(JSON.stringify({integration,fast,errors}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
