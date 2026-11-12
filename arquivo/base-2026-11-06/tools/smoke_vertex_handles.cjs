const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
const page=await browser.newPage({hasTouch:true,viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
await page.goto('file://'+path.resolve(process.argv[2]||path.join(__dirname,'../dist/GeoMine.html')));await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted);
await page.evaluate(()=>{S.setBase('Sem fundo');S.touch=true;S.snapOn=false;S.orthoOn=false;S.workCRS='EPSG:31982';
 window.__L=addLayer({name:'Teste vértices 3D',gtype:'polygon',crs:S.workCRS,fields:[],features:[{geom:[[500000,7400000,100],[500100,7400000,110],[500100,7400100,120],[500000,7400100,130],[500000,7400000,100]],zg:[100,110,120,130,100],props:{TESTE:'preservar'}}]});
 window.__f=__L.features[0];window.__original=JSON.stringify(__f.geom);S.selFeat={layer:__L,layerId:__L.id,idx:0};edLigar(true,true);edSelecionar({L:__L,f:__f,idx:0},true);setTool('vertex');
 const q=toWGS(S.workCRS,500050,7400050);map.setView([q[1],q[0]],18,{animate:false});S.undo=[];
});await page.waitForTimeout(200);
const dual=await page.evaluate(()=>({dom:S.vtxLayer.getLayers().length,canvas:ED.lay.getLayers().length,width:document.querySelector('.vtx').getBoundingClientRect().width}));
if(process.argv.includes('--baseline')){assert.ok(dual.dom>0&&dual.canvas>0);assert.ok(dual.width>=26);console.log('REPRODUCED double editor and enlarged touch glyph',dual);return;}
assert.equal(dual.dom,9);assert.equal(dual.canvas,0);assert.equal(dual.width,12);
const cdp=await page.context().newCDPSession(page);
await page.evaluate(()=>{window.__events=[];S.vtxLayer.eachLayer(m=>m.on('dragstart drag dragend',e=>__events.push(e.type)));['pointerdown','touchstart','pointermove'].forEach(t=>map.getContainer().addEventListener(t,e=>__events.push([t,e.target.className]),true));});
async function drag(selector,dx,dy,check){const b=await page.locator(selector).first().boundingBox();assert.ok(b);const x=b.x+b.width/2,y=b.y+b.height/2;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
 for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*i/6,y:y+dy*i/6,id:1}]});
 if(check){try{await check();}catch(e){console.log(await page.evaluate(()=>({events:__events,drag:S._vtxDragging,enabled:S._vtxCtx.marks[0].mk.dragging.enabled(),context:ED.drag})));await page.screenshot({path:path.resolve(__dirname,'../dist/vertex-failure.png')});throw e;}}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(150);
}
const clean=()=>page.evaluate(()=>({n:S.vtxLayer.getLayers().length,dom:document.querySelectorAll('.gm-vtx-hit').length,canvas:ED.lay.getLayers().length,drag:ED.drag,offsets:S._vtxCtx.marks.map(({mk,vi})=>{const w=toWGS(__L.crs,S._vtxCtx.ring[vi][0],S._vtxCtx.ring[vi][1]);return Math.hypot(mk.getLatLng().lng-w[0],mk.getLatLng().lat-w[1]);})}));
await drag('.vtx',40,-25,async()=>{assert.equal(await page.evaluate(()=>ED.drag),null);assert.equal(await page.locator('.vtx-mid:visible').count(),0);});
const moved=await page.evaluate(()=>({geom:__f.geom,z:__f.zg,undo:S.undo.length,same:JSON.stringify(__f.geom)===__original}));
assert.equal(moved.same,false);assert.equal(moved.undo,1);assert.deepEqual(moved.geom[0],moved.geom.at(-1));assert.deepEqual(moved.z,[100,110,120,130,100]);assert.equal(moved.geom[0][2],100);
const original=JSON.parse(await page.evaluate(()=>__original));for(const i of [1,2,3])assert.deepEqual(moved.geom[i],original[i]);
let state=await clean();assert.equal(state.dom,9);assert.equal(state.canvas,0);assert.ok(state.offsets.every(x=>x<1e-8));
await page.evaluate(()=>doUndo());assert.equal(await page.evaluate(()=>JSON.stringify(__f.geom)===__original),true);
await drag('.vtx-mid',0,24);assert.equal(await page.evaluate(()=>__f.geom.length),6);assert.equal(await page.evaluate(()=>__f.zg.length),6);state=await clean();assert.equal(state.dom,state.n);assert.equal(state.dom,11);assert.equal(state.canvas,0);assert.ok(state.offsets.every(x=>x<1e-8));
await page.evaluate(()=>doUndo());assert.equal(await page.evaluate(()=>JSON.stringify(__f.geom)===__original),true);
await drag('.vtx-mover',22,20,async()=>{const s=await clean();assert.ok(s.offsets.every(x=>x<1e-8));assert.equal(await page.locator('.vtx-mid:visible').count(),0);});state=await clean();assert.equal(state.dom,9);assert.equal(state.canvas,0);assert.ok(state.offsets.every(x=>x<1e-8));
await page.evaluate(()=>doUndo());assert.equal(await page.evaluate(()=>JSON.stringify(__f.geom)===__original),true);
await page.evaluate(()=>{for(let i=0;i<5;i++){showVertices();edRedraw();}});state=await clean();assert.equal(state.dom,9);assert.equal(state.canvas,0);
await page.screenshot({path:path.resolve(__dirname,'../dist/vertex-touch.png')});
await page.evaluate(()=>setTool('select'));assert.equal(await page.locator('.gm-vtx-hit').count(),0);assert.ok(await page.evaluate(()=>ED.lay.getLayers().length>0));
// Native touch on the canvas editor still works after leaving the Leaflet tool.
const p=await page.evaluate(()=>{const ll=toWGS(__L.crs,__f.geom[1][0],__f.geom[1][1]),q=map.latLngToContainerPoint([ll[1],ll[0]]),r=map.getContainer().getBoundingClientRect();return {x:q.x+r.left,y:q.y+r.top};});
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x-20,y:p.y-20,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await page.locator('.gm-vtx-hit').count(),0);assert.notEqual(await page.evaluate(()=>JSON.stringify(__f.geom)),await page.evaluate(()=>__original));
await page.evaluate(()=>{S.touch=false;setTool('vertex');});assert.equal(await page.locator('.vtx').first().evaluate(e=>e.getBoundingClientRect().width),12);assert.equal(await page.evaluate(()=>ED.lay.getLayers().length),0);
const v=await page.locator('.vtx').first().boundingBox();await page.mouse.move(v.x+v.width/2,v.y+v.height/2);await page.mouse.down();await page.mouse.move(v.x+35,v.y+15,{steps:5});await page.mouse.up();state=await clean();assert.equal(state.dom,9);assert.equal(state.canvas,0);assert.ok(state.offsets.every(x=>x<1e-8));
await page.evaluate(()=>{setTool('pan');edLigar(false,true);});assert.equal(await page.locator('.gm-vtx-hit').count(),0);assert.equal(await page.evaluate(()=>ED.lay.getLayers().length),0);assert.deepEqual(errors,[]);
console.log('PASS native touch and mouse drags, compact glyph/large hit target, one editor, midpoint insertion, whole feature motion, ring closure/Z, undo, repeated rebuilds and tool transitions');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
