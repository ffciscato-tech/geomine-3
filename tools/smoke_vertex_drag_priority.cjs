const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({hasTouch:true,viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
  await page.goto('file://'+path.resolve(process.argv[2]||path.join(__dirname,'../dist/GeoMine.html')));
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted);
  const cdp=await page.context().newCDPSession(page);
  for(const touch of [false,true])for(const kind of ['vertex','mid']){
   await page.evaluate(({touch,kind})=>{
    S.setBase('Sem fundo');S.touch=touch;S.snapOn=false;S.orthoOn=false;S.workCRS='EPSG:31982';
    window.__L=addLayer({name:'Vértice no centro da linha',gtype:'line',crs:S.workCRS,fields:[],features:[{geom:[[500000,7400000,100],[500050,7400000,110],[500100,7400000,120]],zg:[100,110,120],props:{TESTE:'preservar'}}]});
    window.__f=__L.features[0];if(kind==='mid'){__f.geom.splice(1,1);__f.zg.splice(1,1);}window.__before=__f.geom.map(p=>p.slice());
    S.selFeat={layer:__L,layerId:__L.id,idx:0};edLigar(true,true);edSelecionar({L:__L,f:__f,idx:0},true);
    const q=toWGS(S.workCRS,500050,7400000);map.setView([q[1],q[0]],18,{animate:false});setTool('vertex');S.undo=[];
   },{touch,kind});await page.waitForTimeout(150);
   const p=await page.evaluate(kind=>{
    const el=kind==='mid'?document.querySelector('.vtx-mid').parentElement:S._vtxCtx.marks.find(m=>m.vi===1).mk.getElement(),r=el.getBoundingClientRect();
    const x=r.x+r.width/2,y=r.y+r.height/2,top=document.elementFromPoint(x,y);
    return {x,y,hit:top.outerHTML};
   },kind);
   if(touch){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1}]});
    for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+36*i/6,y:p.y-30*i/6,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   }else{
    await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+36,p.y-30,{steps:6});await page.mouse.up();
   }
   const result=await page.evaluate(()=>({before:__before,after:__f.geom,z:__f.zg,undo:S.undo.length,canvas:ED.lay.getLayers().length}));
   if(process.argv.includes('--baseline')){
    assert.match(p.hit,/vtx-mover/);result.after.forEach((pt,i)=>assert.notDeepEqual(pt,result.before[i]));
    console.log('REPRODUCED center move handle steals gesture',kind,touch?'touch':'mouse');
   }else{
    assert.doesNotMatch(p.hit,/vtx-mover/);assert.equal(result.after.length,3);assert.deepEqual(result.after[0],result.before[0]);assert.deepEqual(result.after[2],result.before.at(-1));
    assert.notDeepEqual(result.after[1],result.before[1]);assert.equal(result.after[1][2],110);assert.deepEqual(result.z,[100,110,120]);assert.equal(result.undo,1);assert.equal(result.canvas,0);
    console.log('PASS center handle moves only the intended vertex, endpoints and Z unchanged',kind,touch?'touch':'mouse');
   }
   await page.evaluate(()=>doUndo());assert.deepEqual(await page.evaluate(()=>__f.geom),result.before);
   await page.evaluate(()=>{setTool('select');edLigar(false,true);});
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
