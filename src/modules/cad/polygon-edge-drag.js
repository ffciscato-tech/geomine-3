/* Edge gestures belong to the selected polygon, not to the pan/vertex
   handlers. Preview is private until release: Escape cannot leak geometry
   through autosave, collaboration or dynamic derivatives. */
(function(root){
'use strict';
let drag=null,selected=null,highlight=null,preview=null,suppress=null;
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const engine=()=>root.GeoMinePolygonEdgeGeometry;
const container=()=>map.getContainer();
const stamp=f=>JSON.stringify([f.geom,f.zg,f.multi,f.props]);
function editorTarget(){
  if(S._view&&S._view!=='map'&&S._view!=='2d')return null;
  if(S.drawBuf?.length||S._vtxDragging||typeof ED!=='undefined'&&(ED.pend||ED.drag))return null;
  const legacy=root.GeoMineVertexHandles?.legacyActive();
  if(legacy){
    if(S.tool!=='vertex'||!S._vtxCtx)return null;
    const {L,f}=S._vtxCtx;
    return S.selFeat?.layer===L&&L.features[S.selFeat.idx]===f?{L,f,legacy:true}:null;
  }
  if(typeof ED!=='undefined'&&ED.on&&ED.sel&&['select','pan','vertex'].includes(S.tool))return {...ED.sel,legacy:false};
  return null;
}
function allowed(t){
  return !!t&&t.L?.gtype==='polygon'&&S.layers.includes(t.L)&&t.L.features.includes(t.f)&&
    t.L.visible!==false&&!t.L.locked&&(!root.featureVisible||featureVisible(t.L,t.f))&&
    (!root.rb134EhDerivadaProtegida||!root.rb134EhDerivadaProtegida(t.L,t.f))&&
    (typeof collabCanEditLayer!=='function'||collabCanEditLayer(t.L,false));
}
function current(d){
  const t=editorTarget();
  return allowed(t)&&t.L===d.L&&t.f===d.f&&t.legacy===d.legacy&&S.projectId===d.project&&
    root.GeoMineSessionAutosave?.state?.generation===d.generation&&d.L.crs===d.crs&&
    d.f.geom===d.geomRef&&d.f.zg===d.zgRef&&stamp(d.f)===d.stamp;
}
function remove(name){
  const layer=name==='preview'?preview:highlight;
  if(layer)try{map.removeLayer(layer);}catch(_){}
  if(name==='preview')preview=null;else highlight=null;
}
function toLL(crs,p){const w=toWGS(crs,p[0],p[1]);return L2.latLng(w[1],w[0]);}
function showEdge(t,geom=t.f.geom){
  remove('highlight');
  try{
    const r=engine().rings(geom).find(r=>JSON.stringify(r.path)===JSON.stringify(t.edge.path));
    if(!r)return;
    highlight=L2.polyline([r.points[t.edge.index],r.points[(t.edge.index+1)%r.count]].map(p=>toLL(t.L.crs,p)),
      {pane:'alagis_desenho',interactive:false,color:'#f5a524',weight:5,opacity:1}).addTo(map);
  }catch(_){}
}
function renderPreview(d,geom){
  remove('preview');
  preview=L2.layerGroup().addTo(map);
  for(const r of engine().rings(geom)){
    const pts=r.points.map(p=>toLL(d.crs,p));if(!r.closed)pts.push(pts[0]);
    L2.polyline(pts,{pane:'alagis_desenho',interactive:false,color:'#f5a524',weight:2,dashArray:'5 4',opacity:.85}).addTo(preview);
  }
  showEdge(d,geom);
}
function restoreInteraction(d){
  container().classList.remove('gm-edge-active');container().style.cursor=d.cursor;
  if(d.canvas)d.canvas.style.visibility=d.canvasVisibility;
  if(d.pan)map.dragging.enable();
  try{if(container().hasPointerCapture(d.pointer))container().releasePointerCapture(d.pointer);}catch(_){}
  root.GeoMineOrtho?.clearPreview();
  if(typeof limpaCursorSnap==='function')limpaCursorSnap();
}
function clear(){
  const d=drag;drag=null;selected=null;remove('preview');remove('highlight');
  if(d)restoreInteraction(d);
}
function local(ev){const r=container().getBoundingClientRect();return [ev.clientX-r.left,ev.clientY-r.top];}
function stop(ev){if(ev.cancelable)ev.preventDefault();ev.stopImmediatePropagation();}
function hit(t,p,ev){
  if(ev.target?.closest?.('.gm-vtx-hit,.leaflet-control,.modal,.edbox,input,button,select,textarea'))return null;
  if(!t.legacy&&(edHit({x:p[0],y:p[1]},ED.pts)||edHit({x:p[0],y:p[1]},ED.mids)))return null;
  const touch=ev.pointerType==='touch',tol=touch?12:8,vertexTol=touch?16:10,midTol=touch?14:9;
  let nearest=null,distance=tol;
  for(const r of engine().rings(t.f.geom)){
    const pixels=r.points.slice(0,r.count).map(v=>map.latLngToContainerPoint(toLL(t.L.crs,v)));
    for(let i=0;i<r.count;i++){
      const a=pixels[i],b=pixels[(i+1)%r.count];
      // Keep endpoint and insertion gestures ahead of edge selection, even
      // when their invisible touch targets overlap a neighbouring segment.
      if(Math.hypot(p[0]-a.x,p[1]-a.y)<vertexTol||Math.hypot(p[0]-(a.x+b.x)/2,p[1]-(a.y+b.y)/2)<midTol)return null;
      const q=edSegDist(p,[a.x,a.y],[b.x,b.y]);
      if(q.d<distance){distance=q.d;nearest={path:r.path.slice(),index:i,t:q.t,
        anchor:r.points[i].map((v,k)=>k<2?v+(r.points[(i+1)%r.count][k]-v)*q.t:v)};}
    }
  }
  return nearest;
}
function onDown(ev){
  suppress=null;
  if(drag){if(ev.pointerId!==drag.pointer){clear();stop(ev);}return;}
  if(ev.button!==0||ev.isPrimary===false||ev.ctrlKey||ev.metaKey||ev.altKey||ev.shiftKey)return;
  const t=editorTarget();if(!allowed(t))return;
  const p=local(ev);let edge;
  try{edge=hit(t,p,ev);}catch(e){return;}
  if(!edge){selected=null;remove('highlight');return;}
  const ll=map.containerPointToLatLng(p),start=fromWGS(t.L.crs,ll.lng,ll.lat);
  if(!start.slice(0,2).every(Number.isFinite))return;
  selected={...t,edge};showEdge(selected);
  const canvas=typeof ED!=='undefined'?ED.rend?._container:null;
  drag={...selected,pointer:ev.pointerId,project:S.projectId,generation:root.GeoMineSessionAutosave?.state?.generation,
    crs:t.L.crs,geomRef:t.f.geom,zgRef:t.f.zg,stamp:stamp(t.f),before:{geom:clone(t.f.geom),zg:clone(t.f.zg),multi:t.f.multi,props:clone(t.f.props)},
    start,p,geom:null,moved:false,pan:map.dragging.enabled(),cursor:container().style.cursor,canvas,canvasVisibility:canvas?.style.visibility};
  map.dragging.disable();container().style.cursor='grabbing';
  try{container().setPointerCapture(ev.pointerId);}catch(_){}
  stop(ev);
}
function onMove(ev){
  const d=drag;if(!d||ev.pointerId!==d.pointer)return;
  stop(ev);
  if(!current(d)){clear();return;}
  const p=local(ev);if(!d.moved&&Math.hypot(p[0]-d.p[0],p[1]-d.p[1])<4)return;
  const ll=map.containerPointToLatLng(p),position=fromWGS(d.crs,ll.lng,ll.lat);
  try{
    const anchor=toLL(d.crs,d.edge.anchor),target=toLL(d.crs,[d.edge.anchor[0]+position[0]-d.start[0],d.edge.anchor[1]+position[1]-d.start[1]]),
      resolved=GeoMineOrtho.resolve(target,{anchor,crs:d.crs,ignore:d.L}),end=fromWGS(d.crs,resolved.latlng.lng,resolved.latlng.lat);
    d.geom=engine().translate(d.before.geom,d.edge,end[0]-d.edge.anchor[0],end[1]-d.edge.anchor[1]);
    d.moved=true;d.error=null;container().classList.add('gm-edge-active');if(d.canvas)d.canvas.style.visibility='hidden';
    renderPreview(d,d.geom);
  }catch(e){d.geom=null;d.error=e;remove('preview');showEdge(d);}
}
function refreshEditing(t){
  const now=editorTarget();if(!now||now.L!==t.L||now.f!==t.f)return;
  if(t.legacy){S._vtxSelPreserve=true;showVertices();}
  else {edRedraw();edPainelSync();}
  try{highlightSel();}catch(_){}
}
function commit(d){
  if(!current(d))throw Error('A feição ou o projeto mudou. O arraste foi cancelado.');
  if(!d.geom||JSON.stringify(d.geom)===JSON.stringify(d.before.geom))return false;
  const undo=S.undo?.slice(),rb=S._rb31,rbUndo=rb?.undoPilha?.slice(),rbGeom=rb?.srcGeom,
    projectGeom=Object.getOwnPropertyDescriptor(d.f,'_geomProjeto');
  try{
    if(typeof rb31EmpilhaEdicao==='function')rb31EmpilhaEdicao(d.L,d.f);
    d.f.geom=d.geom;
    // XY only: explicit/parallel Z and M are not resampled by this operation.
    drawLayer(d.L);
    undoPush({t:'geom',L:d.L,f:d.f,geom:d.before.geom,zg:d.before.zg,multi:d.before.multi,msg:'arrasto de aresta'});
  }catch(e){
    d.f.geom=d.geomRef;d.f.zg=d.zgRef;d.f.multi=d.before.multi;d.f.props=d.before.props;
    if(projectGeom)Object.defineProperty(d.f,'_geomProjeto',projectGeom);else delete d.f._geomProjeto;
    if(undo)S.undo=undo;if(rb){rb.undoPilha=rbUndo;rb.srcGeom=rbGeom;}
    try{drawLayer(d.L);refreshUI();refreshEditing(d);}catch(_){}throw e;
  }
  // Derivative notifications run only after the edit is committed.
  try{if(typeof rb31PosEdicao==='function')rb31PosEdicao(d.L,d.f);}catch(e){console.warn(e);}
  try{if(typeof edEhDrenagem==='function'&&edEhDrenagem(d.L))edRecalcGeom(d.L,d.f);}catch(e){console.warn(e);}
  refreshEditing(d);refreshUI();
  try{if(typeof openAttr==='function'&&document.getElementById('attrPanel')?.classList.contains('open'))openAttr();}catch(_){}
  try{if(typeof cavaLiveSync==='function')cavaLiveSync({sourceLayer:d.L,sourceFeature:d.f,immediate:true,force:true});}catch(e){console.warn(e);}
  try{if(typeof projecaoLiveSync==='function')projecaoLiveSync(true);}catch(e){console.warn(e);}
  toast('Aresta movida. Desfazer restaura o polígono.');return true;
}
function onUp(ev){
  const d=drag;if(!d||ev.pointerId!==d.pointer)return;
  stop(ev);suppress={time:Date.now(),x:ev.clientX,y:ev.clientY};
  // Release the capture before rebuilding the existing editor handles.
  drag=null;remove('preview');restoreInteraction(d);
  try{
    if(!current(d)){clear();return;}
    if(d.error)throw d.error;
    if(d.moved)commit(d);else toast('Aresta selecionada: arraste a borda para mover os dois vértices.');
    selected={L:d.L,f:d.f,legacy:d.legacy,edge:d.edge};showEdge(selected);
  }catch(e){clear();toast(e.message||String(e));}
}
function bind(){
  const el=container();if(el.dataset.gmPolygonEdgeBound)return;el.dataset.gmPolygonEdgeBound='1';
  const style=document.createElement('style');style.textContent='.gm-edge-active .gm-vtx-hit{visibility:hidden!important}';document.head.append(style);
  el.addEventListener('pointerdown',onDown,true);el.addEventListener('pointermove',onMove,true);el.addEventListener('pointerup',onUp,true);
  for(const type of ['pointercancel','lostpointercapture'])el.addEventListener(type,ev=>{if(drag&&ev.pointerId===drag.pointer){stop(ev);clear();}},true);
  for(const type of ['mousedown','touchstart','touchmove','touchend'])el.addEventListener(type,ev=>{if(drag)stop(ev);},{capture:true,passive:false});
  el.addEventListener('click',ev=>{if(suppress&&Date.now()-suppress.time<700&&Math.hypot(ev.clientX-suppress.x,ev.clientY-suppress.y)<6){suppress=null;stop(ev);}},true);
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&(drag||selected)){stop(ev);clear();}},true);
  root.addEventListener('blur',clear);map.on('movestart zoomstart',clear);
}
root.GeoMinePolygonEdgeDrag={clear,bind,state:()=>({dragging:!!drag,selected:!!selected})};
bind();
})(window);
