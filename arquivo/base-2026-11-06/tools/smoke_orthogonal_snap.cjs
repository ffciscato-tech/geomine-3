// Full offline app, synthetic geometry, isolated Chromium profile.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  for(const touch of [false,true]){
   const context=await browser.newContext({viewport:{width:1400,height:950},hasTouch:touch}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route(/^https?:/,r=>r.abort());
   await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'));await page.waitForFunction(()=>window.GeoMineOrtho&&typeof showVertices==='function');
   await page.evaluate(()=>{
    S.workCRS='EPSG:31983';S.setBase('Sem fundo');S.snapOn=false;
    window.__ll=p=>GeoMineOrtho.latlng(S.workCRS,p);window.__xy=ll=>fromWGS(S.workCRS,ll.lng,ll.lat);
    window.__L=addLayer({name:'Teste ORTO',gtype:'line',crs:S.workCRS,fields:[],features:[]});
    map.setView(__ll([500000,7200000]),18,{animate:false});S.activeId=__L.id;
   });
   await page.locator('#btnSnap').click();await page.locator('#snOrtho').check();
   assert.equal(await page.locator('#cadOrtho').isChecked(),true);
   await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>S.orthoOn),true);
   await page.keyboard.press('F8');assert.equal(await page.evaluate(()=>S.orthoOn),false);
   await page.keyboard.press('F8');assert.equal(await page.evaluate(()=>S.orthoOn),true);
   const drawing=await page.evaluate(()=>{
    setTool('line');const points=[[500000,7200000],[500080,7200017],[500101,7200090],[500020,7200068]];
    for(const p of points)onMapClick({latlng:__ll(p)});
    atualizaCursorSnap(__ll([499980,7200100]));const preview=__xy(S._cursorSnapHit.latlng);
    const count=S.drawBuf.length;finishDraw();return {count,geom:__L.features[0].geom,preview};
   });
   assert.equal(drawing.count,4);const expected=[[500000,7200000],[500080,7200000],[500080,7200090],[500020,7200090]];
   drawing.geom.forEach((p,i)=>p.forEach((v,j)=>close(v,expected[i][j])));close(drawing.preview[1],7200090);
   const snap=await page.evaluate(()=>{
    setTool('select');S.snapOn=true;S.snapVtxOn=true;S.snapNearOn=false;
    window.__targets=addLayer({name:'Alvos',gtype:'point',crs:S.workCRS,fields:[],features:[
     {geom:[[500078,7200002]],props:{}},{geom:[[500081,7200000]],props:{}}]});
    S.activeId=__L.id;__L.visible=false;
    const hit=GeoMineOrtho.resolve(__ll([500080,7200012]),{anchor:__ll([500000,7200000]),crs:S.workCRS});
    __targets.visible=false;
    window.__cross=addLayer({name:'Cruzamento',gtype:'line',crs:S.workCRS,fields:[],features:[{geom:[[500090,7199980],[500110,7200020]],props:{}}]});
    S.snapVtxOn=false;S.snapNearOn=true;
    const cross=GeoMineOrtho.resolve(__ll([500098,7200008]),{anchor:__ll([500000,7200000]),crs:S.workCRS});
    __cross.visible=false;__L.visible=true;S.activeId=__L.id;S.snapOn=false;
    return {hit:__xy(hit.latlng),snapped:hit.snapped,cross:__xy(cross.latlng),crossSnapped:cross.snapped};
   });
   close(snap.hit[0],500081);close(snap.hit[1],7200000);assert.ok(snap.snapped);
   close(snap.cross[0],500100);close(snap.cross[1],7200000);assert.ok(snap.crossSnapped);
   const drag=await page.evaluate(()=>{
    __L.features=[{geom:[[500000,7200000,100],[500080,7200000,110],[500080,7200080,120]],zg:[100,110,120],props:{}}];drawLayer(__L);
    S.selFeat={layer:__L,idx:0};setTool('vertex');
    let m=S._vtxCtx.marks[1].mk;m.fire('dragstart');m.setLatLng(__ll([500130,7200012]));m.fire('drag');m.fire('dragend');
    const single=JSON.parse(JSON.stringify(__L.features[0]));
    // New gesture origin, then group delta must stay on one axis and retain Z.
    S._vtxSel=new Set([0,1]);S._vtxSelPreserve=true;showVertices();
    m=S._vtxCtx.marks[0].mk;m.fire('dragstart');m.setLatLng(__ll([500017,7200040]));m.fire('drag');m.fire('dragend');
    const group=JSON.parse(JSON.stringify(__L.features[0]));
    m=S.vtxLayer.getLayers().find(m=>m.options.title==='Arraste para mover a feição inteira');
    const a=__xy(m.getLatLng());m.fire('dragstart');m.setLatLng(__ll([a[0]+60,a[1]+10]));m.fire('drag');m.fire('dragend');
    const whole=JSON.parse(JSON.stringify(__L.features[0]));
    // Disabling restores genuinely free diagonal movement.
    GeoMineOrtho.set(false);m=S._vtxCtx.marks[2].mk;const b=__L.features[0].geom[2].slice();
    m.fire('dragstart');m.setLatLng(__ll([b[0]+20,b[1]+30]));m.fire('drag');m.fire('dragend');
    const free=JSON.parse(JSON.stringify(__L.features[0]));return {single,group,whole,free};
   });
   close(drag.single.geom[1][0],500130);close(drag.single.geom[1][1],7200000);
   for(const i of [0,1]){close(drag.group.geom[i][0],drag.single.geom[i][0]);close(drag.group.geom[i][1],drag.single.geom[i][1]+40);}
   drag.whole.geom.forEach((p,i)=>{close(p[0],drag.group.geom[i][0]+60);close(p[1],drag.group.geom[i][1]);assert.equal(p[2],100+10*i);});
   assert.deepEqual(drag.whole.zg,[100,110,120]);close(drag.free.geom[2][0],drag.whole.geom[2][0]+20);close(drag.free.geom[2][1],drag.whole.geom[2][1]+30);
   const commands=await page.evaluate(()=>{
    clearVertices();GeoMineOrtho.set(true);setTool('select');
    ED.on=true;edSelecionar({L:__L,idx:0,f:__L.features[0]});
    const before=JSON.parse(JSON.stringify(__L.features[0].geom));ED.pend={cmd:'mover',pts:[]};
    onMapClick({latlng:__ll([500000,7200000])});ED._pendTs=0;onMapClick({latlng:__ll([500020,7200050])});
    const after=JSON.parse(JSON.stringify(__L.features[0].geom));ED.on=false;ED.pend=null;ED.sel=null;
    const poly=addLayer({name:'Polígono ORTO',gtype:'polygon',crs:S.workCRS,fields:[],features:[]});
    S.activeId=poly.id;setTool('poly');onMapClick({latlng:__ll([500000,7200000])});onMapClick({latlng:__ll([500060,7200008])});onMapClick({latlng:__ll([500075,7200040])});
    const points=S.drawBuf.map(p=>fromWGS(__L.crs,p[1],p[0]));GeoMineOrtho.closeCorner(points);points.push(points[0].slice());clearDraw();
    S.activeId=__L.id;return {before,after,points};
   });
   commands.after.forEach((p,i)=>{close(p[0],commands.before[i][0]);close(p[1],commands.before[i][1]+50);assert.equal(p[2],commands.before[i][2]);});
   assert.equal(commands.points.length,5);for(let i=1;i<commands.points.length;i++){const p=commands.points[i],q=commands.points[i-1];assert.ok(Math.min(Math.abs(p[0]-q[0]),Math.abs(p[1]-q[1]))<1e-5);}
   // Actual pointer events through the second (canvas) editor, not its helpers.
   const gesture=await page.evaluate(()=>{
    setTool('select');S.snapOn=false;GeoMineOrtho.set(true);clearVertices();
    __L.features=[{geom:[[500000,7200000,100],[500100,7200000,110]],zg:[100,110],props:{}}];drawLayer(__L);
    map.setView(__ll([500080,7200040]),18,{animate:false});ED.on=true;edSelecionar({L:__L,idx:0,f:__L.features[0]});
    const rect=map.getContainer().getBoundingClientRect();
    const screen=p=>{const q=map.latLngToContainerPoint(__ll(p));return {x:rect.left+q.x,y:rect.top+q.y};};
    return {start:screen([500100,7200000]),end:screen([500125,7200060])};
   });
   if(!touch){await page.mouse.move(gesture.start.x,gesture.start.y);await page.mouse.down();await page.mouse.move(gesture.end.x,gesture.end.y,{steps:8});await page.mouse.up();}
   else await page.evaluate(g=>{
    const el=map.getContainer(),emit=(type,p)=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:1,pointerType:'touch',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:p.x,clientY:p.y}));
    emit('pointerdown',g.start);emit('pointermove',g.end);emit('pointerup',g.end);
   },gesture);
   const moved=await page.evaluate(()=>({geom:__L.features[0].geom,zg:__L.features[0].zg,drag:ED.drag}));
   close(moved.geom[1][0],500100);assert.ok(moved.geom[1][1]>7200058&&moved.geom[1][1]<7200062);assert.deepEqual(moved.zg,[100,110]);assert.equal(moved.drag,null);
   const undone=await page.evaluate(()=>{doUndo();return __L.features[0].geom;});assert.deepEqual(undone,[[500000,7200000,100],[500100,7200000,110]]);
   await page.locator('#btnSnap').click();
   await page.locator('#snapMenu').screenshot({path:path.resolve(__dirname,'../dist/ortho-menu-'+(touch?'touch':'desktop')+'.png')});
   assert.deepEqual(errors,[]);console.log('PASS '+(touch?'touch':'desktop')+': UI/F8, drawing, preview, strict magnetic vertex and line snap, vertex/group/whole drags, Z, move command, polygon closure, mode off, actual canvas-editor pointer gesture and undo');
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
