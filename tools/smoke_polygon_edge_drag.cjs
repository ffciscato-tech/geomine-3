// Offline full-app QA. Synthetic polygons only; real mouse and Chromium touch input.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const results=path.resolve(__dirname,'../resultados');
const passes=[];
function pass(name){passes.push(name);console.log('PASS '+name);}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({hasTouch:true,viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route(/^https?:/,r=>r.abort());
  await page.goto('file://'+path.resolve(process.argv[2]||path.join(__dirname,'../dist/GeoMine.html')));
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMinePolygonEdgeDrag);
  const cdp=await page.context().newCDPSession(page);
  async function frames(){await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
  async function setup({mode='vertex',touch=false,ring=0,ortho=false}={}){
   await page.evaluate(({mode,touch,ring,ortho})=>{
    window.GeoMineChannelLive?.stop();window.GeoMinePolygonEdgeDrag?.clear();
    if(window.__originalCollab!==undefined)window.GeoMineCollaboration=__originalCollab;
    else window.__originalCollab=window.GeoMineCollaboration||null;
    setTool('select');edLigar(false,true);clearVertices();
    for(const l of (S.layers||[]))if(l.llayer)try{map.removeLayer(l.llayer);}catch(_){}
    S.layers=[];S.stack=[];S.selFeat=null;S.activeId=null;ED.sel=null;ED.drag=null;ED.pend=null;
    S.setBase('Sem fundo');S.touch=touch;S.snapOn=false;S.orthoOn=ortho;S.workCRS='EPSG:31982';
    S.projectId='qa-edge-'+Math.random().toString(36).slice(2);
    const o=[[0,0,100],[200,0,110],[200,140,120],[0,140,130],[0,0,100]],
      h=[[60,40,200],[60,100,210],[140,100,220],[140,40,230],[60,40,200]];
    const geom=[o,h].map(r=>r.map(p=>[p[0]+500000,p[1]+7400000,p[2]]));
    window.__L=addLayer({name:'TESTE CONTROLADO · aresta 3D e furo',gtype:'polygon',color:'#37c0aa',crs:S.workCRS,fields:[],features:[
      {multi:true,geom,zg:geom.map(r=>r.map(p=>p[2])),props:{TESTE:'preservar',CODIGO:42},_qaToken:'preservar',_cavaLimitId:'qa-edge-synthetic'}]});
    window.__f=__L.features[0];S.activeId=__L.id;
    S.selFeat={layer:__L,layerId:__L.id,idx:0,partIdx:ring};
    edLigar(true,true);edSelecionar({L:__L,f:__f,idx:0},true);ED.ring=ring;
    S.selFeat.partIdx=ring;
    const q=toWGS(S.workCRS,500100,7400070);map.setView([q[1],q[0]],18,{animate:false});
    setTool(mode==='vertex'?'vertex':'select');if(mode==='canvas'){clearVertices();edRedraw();}
    window.__before=JSON.parse(JSON.stringify(__f));S.undo=[];
    const old=document.getElementById('qaEdgeLabel');if(old)old.remove();
    const label=document.createElement('div');label.id='qaEdgeLabel';
    label.style.cssText='position:fixed;left:50%;top:190px;transform:translateX(-50%);z-index:9000;padding:8px 14px;background:#112338;color:#fff;border:1px solid #44bdec;border-radius:6px;font:14px system-ui;pointer-events:none';
    label.textContent='TESTE CONTROLADO · polígono sintético 3D com furo · '+(mode==='canvas'?'editor canvas':'modo vértices');document.body.append(label);
   },{mode,touch,ring,ortho});await frames();
  }
  async function point(ring=0,edge=0,delta=[20,-15]){
   return page.evaluate(({ring,edge,delta})=>{
    const r=__f.geom[ring],a=r[edge],b=r[(edge+1)%(r.length-1)],p=[a[0]+.25*(b[0]-a[0]),a[1]+.25*(b[1]-a[1])];
    const rect=map.getContainer().getBoundingClientRect(),screen=p=>{const w=toWGS(__L.crs,...p),q=map.latLngToContainerPoint([w[1],w[0]]);return {x:rect.left+q.x,y:rect.top+q.y};};
    const start=screen(p),end=screen([p[0]+delta[0],p[1]+delta[1]]),target=document.elementFromPoint(start.x,start.y);
    return {start,end,hit:target?.outerHTML?.slice(0,300),p};
   },{ring,edge,delta});
  }
  async function down(g,touch){
   assert.doesNotMatch(g.hit||'',/gm-vtx-hit|vtx-mover|vtx-mid/,'quarter-edge fixture must not land on a handle');
   if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...g.start,id:1}]});
   else{await page.mouse.move(g.start.x,g.start.y);await page.mouse.down();}
  }
  async function move(g,touch){
   if(touch)for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:g.start.x+(g.end.x-g.start.x)*i/6,y:g.start.y+(g.end.y-g.start.y)*i/6,id:1}]});
   else await page.mouse.move(g.end.x,g.end.y,{steps:6});await frames();
  }
  async function up(touch){if(touch)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();await frames();}
  async function state(){return page.evaluate(()=>({f:JSON.parse(JSON.stringify(__f)),before:__before,undo:S.undo.length,drag:ED.drag,edge:GeoMinePolygonEdgeDrag.state(),mapDragging:map.dragging.enabled(),tool:S.tool}));}
  function unchanged(s,undo=0){assert.deepEqual(s.f,s.before);assert.equal(s.undo,undo);}
  function translated(s,ring,edge){
   assert.equal(s.undo,1);const r=s.f.geom[ring],old=s.before.geom[ring],next=(edge+1)%(r.length-1),d=[r[edge][0]-old[edge][0],r[edge][1]-old[edge][1]];
   assert.ok(Math.hypot(...d)>2,'gesture must translate the edge');
   for(let ri=0;ri<s.f.geom.length;ri++)for(let i=0;i<s.f.geom[ri].length;i++){
    const canonical=i===s.f.geom[ri].length-1?0:i,p=s.f.geom[ri][i],q=s.before.geom[ri][i];
    if(ri===ring&&(canonical===edge||canonical===next)){near(p[0]-q[0],d[0]);near(p[1]-q[1],d[1]);assert.deepEqual(p.slice(2),q.slice(2));}
    else assert.deepEqual(p,q);
   }
   near(r[next][0]-r[edge][0],old[next][0]-old[edge][0]);near(r[next][1]-r[edge][1],old[next][1]-old[edge][1]);
   for(const r of s.f.geom)assert.deepEqual(r[0],r.at(-1));assert.deepEqual(s.f.zg,s.before.zg);assert.deepEqual(s.f.props,s.before.props);assert.equal(s.f._qaToken,s.before._qaToken);assert.equal(s.f.multi,true);return d;
  }
  async function capture(name,label){fs.mkdirSync(results,{recursive:true});await page.evaluate(label=>{document.getElementById('qaEdgeLabel').textContent=label;},label);await frames();await page.screenshot({path:path.join(results,name)});}
  for(const mode of ['vertex','canvas'])for(const touch of [false,true]){
   await setup({mode,touch});const g=await point();await down(g,touch);await move(g,touch);
   const preview=await state();unchanged(preview);assert.equal(preview.edge.dragging,true);assert.equal(preview.edge.selected,true);
   if(mode==='vertex'&&!touch)await capture('polygon-edge-preview-desktop-synthetic-1440x1000.png','TESTE CONTROLADO · prévia da aresta · geometria original ainda intacta');
   await up(touch);const after=await state();translated(after,0,0);
   await page.evaluate(()=>doUndo());unchanged(await state());
   const again=await point();await down(again,touch);await move(again,touch);await up(touch);translated(await state(),0,0);
   pass(`${mode} ${touch?'touch':'mouse'} quarter-edge: atomic preview, equal endpoint XY delta, closure/Z/zg/properties, exact undo and second gesture`);
  }
  for(const mode of ['vertex','canvas'])for(const ring of [0,1]){
   const edge=ring?1:3;await setup({mode,touch:true,ring});const g=await point(ring,edge,ring?[0,10]:[-20,5]);
   await down(g,true);await move(g,true);unchanged(await state());await up(true);translated(await state(),ring,edge);
   await page.evaluate(()=>doUndo());unchanged(await state());pass(`${mode}: ${ring?'hole-only':'closing edge'} translation and undo`);
  }
  for(const mode of ['vertex','canvas']){
   await setup({mode});let g=await point();await down(g,false);await up(false);const clicked=await state();unchanged(clicked);assert.equal(clicked.edge.selected,true);assert.equal(clicked.edge.dragging,false);pass(`${mode}: click highlights without geometry or undo`);
   for(const cancel of ['escape','pointercancel','tool','project','remove','feature','locked','readonly']){
    await setup({mode,touch:cancel==='pointercancel'});g=await point();const touch=cancel==='pointercancel';await down(g,touch);await move(g,touch);unchanged(await state());
    let expectedUndo=0;
    if(cancel==='escape')await page.keyboard.press('Escape');
    else if(cancel==='pointercancel')await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    else expectedUndo=await page.evaluate(cancel=>{
     if(cancel==='tool')setTool('line');if(cancel==='project')S.projectId+='-changed';
     if(cancel==='remove')deleteVectorLayer(__L);if(cancel==='feature'){__L.features=[];drawLayer(__L);}
     if(cancel==='locked')__L.locked=true;
     if(cancel==='readonly')window.GeoMineCollaboration={canEditLayer:L=>L!==__L,lockMessage:()=> 'Teste somente leitura'};
     return S.undo.length;
    },cancel);
    if(cancel!=='pointercancel')await up(touch);else await frames();
    unchanged(await state(),expectedUndo);pass(`${mode}: ${cancel} during preview prevents late commit`);
   }
   for(const guard of ['locked','readonly','protected']){
    await setup({mode});await page.evaluate(guard=>{if(guard==='locked')__L.locked=true;else if(guard==='readonly')window.GeoMineCollaboration={canEditLayer:L=>L!==__L};else{__f.props.CLASSE='rb31-rampa';window.__before=JSON.parse(JSON.stringify(__f));}},guard);
    const g=await point();await down(g,false);await move(g,false);await up(false);unchanged(await state());pass(`${mode}: ${guard} before gesture prevents edits`);
   }
   await setup({mode,ortho:true});const g2=await point(0,0,[30,8]);await down(g2,false);await move(g2,false);await up(false);const d=translated(await state(),0,0);assert.ok(Math.abs(d[0])>20);near(d[1],0,1e-4);pass(`${mode}: shared ORTO constrains edge translation`);
   await setup({mode});await page.evaluate(()=>{
    addLayer({name:'TESTE · alvo magnético',gtype:'point',crs:S.workCRS,fields:[],features:[{geom:[[500080,7400015]],props:{}}]});
    S.activeId=__L.id;S.snapOn=true;S.snapVtxOn=true;S.snapNearOn=false;
   });
   const g3=await point(0,0,[28,13]);await down(g3,false);await move(g3,false);unchanged(await state());await up(false);
   const snapped=translated(await state(),0,0);near(snapped[0],30,.5);near(snapped[1],15,.5);pass(`${mode}: shared magnetic snap translates both endpoints to the reference target`);
  }
  await page.setViewportSize({width:1280,height:800});await setup({mode:'canvas',touch:true,ring:1});
  const g=await point(1,1,[0,10]);await down(g,true);await move(g,true);unchanged(await state());
  await capture('polygon-edge-preview-tablet-synthetic-1280x800.png','TESTE CONTROLADO · tablet · prévia da aresta do furo (sem gravar)');
  await up(true);translated(await state(),1,1);await capture('polygon-edge-result-tablet-synthetic-1280x800.png','TESTE CONTROLADO · tablet · aresta do furo movida; demais vértices preservados');
  await page.setViewportSize({width:1440,height:1000});await setup({mode:'vertex'});const gd=await point();await down(gd,false);await move(gd,false);await up(false);translated(await state(),0,0);
  await capture('polygon-edge-result-desktop-synthetic-1440x1000.png','TESTE CONTROLADO · aresta inteira movida · cotas e furo preservados');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:passes.length,screenshots:results,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
