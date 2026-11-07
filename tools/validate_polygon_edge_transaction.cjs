/* VM integration through the actual bound pointer/key handlers. Synthetic
   state only; no private production API, browser, project file or network. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const geometry=read('src/modules/cad/polygon-edge-geometry.js'),ui=read('src/modules/cad/polygon-edge-drag.js');
const undoSource=read('src/core/parts/09-measurement-properties-cad.js');
const undoStart=undoSource.indexOf('function undoNextOrder()'),undoEnd=undoSource.indexOf("document.addEventListener('keydown'",undoStart);
assert.ok(undoStart>=0&&undoEnd>undoStart,'actual typed geometry undo must be available');
const plain=x=>JSON.parse(JSON.stringify(x)),equal=(a,b)=>assert.deepEqual(plain(a),plain(b));
function emitter(){
 const listeners=new Map();
 return {addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},
  emit(type,extra={}){const event={type,cancelable:true,button:0,isPrimary:true,pointerId:1,pointerType:'mouse',clientX:25,clientY:0,
   target:{closest:()=>null},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};
   for(const fn of listeners.get(type)||[]){fn(event);if(event.stopped)break;}return event;}};
}
function area(g){let a=0;for(let i=0;i<g.length-1;i++)a+=g[i][0]*g[i+1][1]-g[i+1][0]*g[i][1];return Math.abs(a/2);}
function fixture({legacy=false,projectGeometry=true,pan=true}={}){
 const node=emitter(),doc=emitter(),win=emitter(),capture=new Set(),classes=new Set();
 Object.assign(node,{dataset:{},style:{cursor:'crosshair'},getBoundingClientRect:()=>({left:0,top:0}),
  classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},setPointerCapture:id=>capture.add(id),
  hasPointerCapture:id=>capture.has(id),releasePointerCapture:id=>{capture.delete(id);node.emit('lostpointercapture',{pointerId:id});}});
 Object.assign(doc,{createElement:()=>({style:{}}),head:{append(){}},getElementById:()=>null});
 const original=[[0,0,11,101],[100,0,12,102],[100,100,13,103],[0,100,14,104],[0,0,11,101]],
  f={geom:structuredClone(original),zg:[11,12,13,14,11],multi:false,props:{AREA:10000,NAME:'keep me'},_channelRecipeId:'unrelated-recipe'},
  L={id:1,name:'synthetic polygon',gtype:'polygon',crs:'EPSG:31983',visible:true,features:[f]},
  history=[{t:'existing',marker:'prior action'}],rb={undoPilha:['original snapshot'],srcGeom:[['original source']]},
  counters={draw:0,refresh:0,pre:0,post:0,cava:0,projection:0,attrs:0,autoZ:0},messages=[];
 if(projectGeometry)Object.defineProperty(f,'_geomProjeto',{value:structuredClone(original),enumerable:false,configurable:true,writable:true});
 const before={geom:structuredClone(f.geom),zg:structuredClone(f.zg),props:structuredClone(f.props),descriptor:Object.getOwnPropertyDescriptor(f,'_geomProjeto')};
 let panEnabled=pan,collab=true,fault=null;
 const canvas={style:{visibility:'visible'}},layer=()=>({addTo(){return this;}});
 const ctx={console,Date,Math,JSON,Set,Map,document:doc,addEventListener:win.addEventListener,
  S:{_view:'map',tool:legacy?'vertex':'select',projectId:'test-project',layers:[L],undo:history.slice(),drawBuf:[],_rb31:rb,
   selFeat:{layer:L,layerId:L.id,idx:0},_vtxCtx:legacy?{L,f}:null},
  ED:{on:true,sel:{L,f,idx:0},pts:[],mids:[],rend:{_container:canvas}},
  map:{getContainer:()=>node,on(){},removeLayer(){},dragging:{enabled:()=>panEnabled,disable:()=>{panEnabled=false;},enable:()=>{panEnabled=true;}},
   containerPointToLatLng:p=>({lng:p[0],lat:p[1]}),latLngToContainerPoint:p=>({x:p.lng,y:p.lat})},
  L2:{latLng:(lat,lng)=>({lat,lng}),polyline:layer,layerGroup:layer},toWGS:(crs,x,y)=>[x,y],fromWGS:(crs,x,y)=>[x,y],
  GeoMineSessionAutosave:{state:{generation:1}},GeoMineVertexHandles:{legacyActive:()=>legacy},
  GeoMineOrtho:{clearPreview(){},resolve:latlng=>({latlng})},featureVisible:()=>true,
  collabCanEditLayer:()=>collab,rb134EhDerivadaProtegida:(L,f)=>f.props.CLASSE==='rb31-rampa',
  edHit:()=>null,edSegDist(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy,t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den));return {t,d:Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)};},
  rb31EmpilhaEdicao(L,f){counters.pre++;delete f._geomProjeto;rb.undoPilha.push('new snapshot');rb.srcGeom=structuredClone(f.geom);},
  rb31PosEdicao(){counters.post++;},drawLayer(L){counters.draw++;L.features[0].props.AREA=area(L.features[0].geom);if(fault==='draw'){fault=null;throw Error('synthetic draw failure');}},
  refreshUI(){counters.refresh++;},edRedraw(){ctx.GeoMinePolygonEdgeDrag?.clear();},edPainelSync(){},showVertices(){ctx.GeoMinePolygonEdgeDrag?.clear();},highlightSel(){},
  cavaLiveSync(){counters.cava++;},projecaoLiveSync(){counters.projection++;},openAttr(){counters.attrs++;},
  hFeicGrade:()=>({d:{}}),hFeicCotaUma(){counters.autoZ++;throw Error('XY edge drag must not resample heights');},toast:m=>messages.push(m),limpaCursorSnap(){}};
 ctx.window=ctx;vm.createContext(ctx);
 vm.runInContext(undoSource.slice(undoStart,undoEnd),ctx,{filename:'actual-typed-undo.js'});
 const realPush=ctx.undoPush;
 ctx.undoPush=function(a){realPush(a);if(fault==='undo'){fault=null;throw Error('synthetic undo failure after push');}};
 vm.runInContext(geometry,ctx,{filename:'polygon-edge-geometry.js'});
 vm.runInContext(ui,ctx,{filename:'polygon-edge-drag.js'});
 return {ctx,L,f,rb,before,history,counters,messages,node,doc,win,canvas,capture,
  fail:kind=>{fault=kind;},deny:()=>{collab=false;},pan:()=>panEnabled,
  down:()=>node.emit('pointerdown'),move:()=>node.emit('pointermove',{clientY:-20}),up:()=>node.emit('pointerup',{clientY:-20}),
  gesture(){this.down();this.move();this.up();}};
}
function original(q){equal(q.f.geom,q.before.geom);equal(q.f.zg,q.before.zg);equal(q.f.props,q.before.props);assert.equal(q.f.multi,false);assert.equal(q.f._channelRecipeId,'unrelated-recipe');}
function historyRestored(q){equal(q.ctx.S.undo,q.history);equal(q.rb.undoPilha,['original snapshot']);equal(q.rb.srcGeom,[['original source']]);}
function idle(q,pan=true){assert.equal(q.ctx.GeoMinePolygonEdgeDrag.state().dragging,false);assert.equal(q.pan(),pan);assert.equal(q.capture.size,0);assert.equal(q.node.style.cursor,'crosshair');assert.equal(q.canvas.style.visibility,'visible');}
let passed=0,failed=0;
function test(name,run){try{run();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}}

test('preview and Escape are pure: no original geometry, props, undo or derivative writes',()=>{
 const q=fixture();q.down();q.move();original(q);historyRestored(q);assert.equal(q.counters.draw,0);assert.equal(q.counters.pre,0);
 q.doc.emit('keydown',{key:'Escape'});q.up();original(q);historyRestored(q);idle(q);assert.equal(q.counters.post,0);
 assert.deepEqual(Object.getOwnPropertyDescriptor(q.f,'_geomProjeto'),q.before.descriptor);
});
test('pointercancel, capture loss and blur discard previews and retain existing disabled pan',()=>{
 for(const type of ['pointercancel','lostpointercapture','blur']){
  const q=fixture({pan:false});q.down();q.move();(type==='blur'?q.win:q.node).emit(type);q.up();
  original(q);historyRestored(q);idle(q,false);assert.equal(q.counters.draw,0);
 }
});
test('draw failure restores geometry, original properties, undo, parametric history and _geomProjeto descriptor',()=>{
 const q=fixture();const ref=q.f.geom,zref=q.f.zg;q.fail('draw');q.gesture();original(q);historyRestored(q);idle(q);
 assert.equal(q.f.geom,ref);assert.equal(q.f.zg,zref);assert.deepEqual(Object.getOwnPropertyDescriptor(q.f,'_geomProjeto'),q.before.descriptor);
 assert.equal(q.counters.post,0);assert.equal(q.counters.cava,0);assert.equal(q.counters.projection,0);assert.match(q.messages.at(-1),/draw failure/);
});
test('undo failure after push restores the complete prior stack and does not invent _geomProjeto',()=>{
 const q=fixture({projectGeometry:false});q.ctx.S.undo=Array.from({length:30},(_,i)=>({t:'existing',marker:i}));q.history=q.ctx.S.undo.slice();
 q.fail('undo');q.gesture();original(q);historyRestored(q);idle(q);assert.equal(Object.hasOwn(q.f,'_geomProjeto'),false);
 assert.equal(q.counters.post,0);assert.equal(q.counters.cava,0);assert.match(q.messages.at(-1),/undo failure/);
});
test('successful canvas and legacy commits preserve Z/M/zg and undo restores exact original geometry and area',()=>{
 for(const legacy of [false,true]){
  const q=fixture({legacy});q.L._autoCota=true;q.gesture();idle(q);assert.equal(q.ctx.S.undo.length,2);assert.equal(q.f.props.AREA,12000);
  equal(q.f.geom,[[0,-20,11,101],[100,-20,12,102],[100,100,13,103],[0,100,14,104],[0,-20,11,101]]);
  equal(q.f.zg,q.before.zg);assert.equal(q.f.props.NAME,'keep me');assert.equal(q.f._channelRecipeId,'unrelated-recipe');
  const action=q.ctx.S.undo.at(-1);equal(action.geom,q.before.geom);equal(action.zg,q.before.zg);assert.notEqual(action.geom,q.f.geom);
  assert.equal(q.counters.pre,1);assert.equal(q.counters.post,1);assert.equal(q.counters.cava,1);assert.equal(q.counters.projection,1);assert.equal(q.counters.autoZ,0);
  q.ctx.doUndo();original(q);assert.equal(q.ctx.S.undo.length,1);
 }
});
test('protected ramp feature never captures a pointer or runs edit hooks',()=>{
 const q=fixture();q.f.props.CLASSE='rb31-rampa';q.before.props=structuredClone(q.f.props);q.gesture();original(q);historyRestored(q);idle(q);assert.equal(q.counters.pre,0);assert.equal(q.counters.draw,0);
});
test('permission, lock, metadata and generation changes during preview prevent a late commit',()=>{
 for(const change of ['permission','lock','metadata','generation']){
  const q=fixture();q.down();q.move();
  if(change==='permission')q.deny();if(change==='lock')q.L.locked=true;
  if(change==='metadata'){q.f.props.NAME='remote edit';q.before.props.NAME='remote edit';}
  if(change==='generation')q.ctx.GeoMineSessionAutosave.state.generation++;
  q.up();original(q);historyRestored(q);idle(q);assert.equal(q.counters.pre,0);assert.equal(q.counters.draw,0);
 }
});
console.log(`${passed}/${passed+failed} polygon-edge transaction checks passed. VM synthetic state only.`);
if(failed)process.exitCode=1;
