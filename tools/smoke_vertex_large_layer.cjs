// Real pointer regression: editing one feature must not rebuild its neighbours.
// Optional PROJECT_FILE tests a saved project read-only in an isolated browser.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route(/^https?:/,r=>r.abort());
 await page.goto(pathToFileURL(path.resolve(process.env.APP_PATH||'dist/GeoMine.html')).href);
 await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted);
 if(process.env.PROJECT_FILE){
  const d=JSON.parse(fs.readFileSync(process.env.PROJECT_FILE,'utf8').replace(/^\uFEFF/,''));
  console.log('Loading actual saved project');await page.evaluate(d=>loadProject(d),d);
 }else{
  await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31982';
   const features=[];
   for(let j=0;j<301;j++){
    const ring=[];for(let i=0;i<1000;i++){const a=i/1000*Math.PI*2;ring.push([500000+j*250+100*Math.cos(a),7400000+100*Math.sin(a),120]);}
    ring.push(ring[0].slice());features.push({geom:ring,zg:ring.map(()=>120),props:{NAME:'Feature '+j}});
   }
   const L=addLayer({name:'Large regression',gtype:'polygon',crs:S.workCRS,fields:[],features});
   S.activeId=L.id;const w=toWGS(L.crs,500000,7400000);map.setView([w[1],w[0]],18,{animate:false});
  });
 }
 console.log('Project loaded');
 await page.evaluate(()=>{
  document.querySelectorAll('.modal-bg.on').forEach(e=>e.classList.remove('on'));
  S.snapOn=false;S.orthoOn=false;window.qaL=activeLayer();
  if(!qaL)throw new Error("No active vector layer in project");
  let best=null;qaL.features.forEach((f,idx)=>{
   const scan=a=>{if(typeof a[0]==='number'){
    const p=map.latLngToContainerPoint(a),dist=p.distanceTo(map.getSize().divideBy(2));
    if(!best||dist<best.dist)best={idx,dist};
   }else a.forEach(scan);};scan(featToLatLngs(qaL,f));
  });
  window.qaF=qaL.features[best.idx];S.selFeat={layer:qaL,layerId:qaL.id,idx:best.idx};
  setTool('vertex');S.undo=[];
  window.qaOriginal=JSON.stringify(qaF.geom);window.qaZ=JSON.stringify(qaF.zg);
  window.qaGroup=qaL.llayer;window.qaOther=qaL.features.find(f=>f!==qaF);
  window.qaOtherGeometry=JSON.stringify(qaOther.geom);window.qaOtherPath=qaL._vertexPaths.get(qaOther);
 });
 const locate=()=>page.evaluate(()=>{
  const r=map.getContainer().getBoundingClientRect();let best=null;
  S._vtxCtx.marks.forEach(({mk,vi})=>{const b=mk.getElement().getBoundingClientRect(),x=b.x+b.width/2,y=b.y+b.height/2;
   if(x<r.left+40||x>r.right-120||y<r.top+50||y>r.bottom-150)return;
   const dist=Math.hypot(x-r.left-r.width/2,y-r.top-r.height/2);
   if(!best||dist<best.dist)best={x,y,vi,dist};
  });return best;
 });
 for(let n=0;n<4;n++){
  const p=await locate();assert.ok(p,'visible handle');const before=await page.evaluate(()=>JSON.stringify(qaF.geom));const start=Date.now();
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+20,p.y+14,{steps:6});
  assert.equal(await page.evaluate(()=>qaL.llayer===qaGroup&&qaL._vertexPaths.get(qaOther)===qaOtherPath),true,'neighbours must not be rebuilt during movement');
  await page.mouse.up();await page.waitForTimeout(150);
  const s=await page.evaluate(before=>({changed:before!==JSON.stringify(qaF.geom),drag:S._vtxDragging,lock:!!L2.Draggable._dragging,
   pending:!!qaL._vertexRenderPending,other:JSON.stringify(qaOther.geom)===qaOtherGeometry,z:JSON.stringify(qaF.zg)===qaZ}),before);
  assert.equal(s.changed,true);assert.equal(s.drag,false);assert.equal(s.lock,false);assert.equal(s.pending,false);assert.equal(s.other,true);assert.equal(s.z,true);
  console.log('PASS successive drag '+(n+1)+' in '+(Date.now()-start)+' ms');
 }
 await page.evaluate(()=>{for(let n=0;n<4;n++)doUndo();});
 assert.equal(await page.evaluate(()=>JSON.stringify(qaF.geom)===qaOriginal),true,'Undo restores the original feature');
 assert.deepEqual(errors,[]);console.log('PASS unchanged neighbouring geometry, elevations, released drag locks and Undo');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
