/* One owner for vertex gestures: Leaflet handles OR the canvas editor.
   Touch targets are independent of visible glyph sizes. */
(function(){
'use strict';
function legacyActive(){return S.tool==='vertex'||!!S._vtxCtx||!!S.vtxLayer?.getLayers().length;}
// Leaflet also adds screen Y to marker z-index. Gaps exceed the hit-target
// diameters, so overlapping vertices always win over insertion and whole-move.
function priority(kind){return kind==='move'?0:kind==='mid'?600:1200;}
function beginLegacy(L,f,idx){
  if(typeof ED==='undefined')return;
  ED.lay?.clearLayers();ED.pts=[];ED.mids=[];ED.drag=null;
  if(ED.rend?._container)ED.rend._container.style.setProperty('pointer-events','none','important');
  // CAD commands must continue to target the feature being edited on the map.
  if(ED.on){ED.sel={L,f,idx};ED.vi=-1;ED.ring=0;}
}
function icon(kind,selected=false){
  if(!document.getElementById('gmVertexHandleStyle')){
    const style=document.createElement('style');style.id='gmVertexHandleStyle';
    style.textContent='.gm-vtx-hit{display:flex;align-items:center;justify-content:center;background:transparent!important;border:0!important;touch-action:none}.gm-vtx-hit>div{box-sizing:border-box;border-radius:50%;flex:none;pointer-events:none}.gm-vtx-hit>.vtx-mid{box-shadow:none}.gm-vtx-hit>.vtx-mover{font-size:12px}';
    document.head.append(style);
  }
  const touch=!!S.touch,hit=kind==='move'?(touch?32:24):kind==='mid'?(touch?24:16):(touch?28:18);
  const visible=kind==='move'?20:kind==='mid'?10:12;
  const cls=kind==='move'?'vtx-mover':kind==='mid'?'vtx-mid':selected?'vtx-sel':'vtx';
  return L2.divIcon({className:'gm-vtx-hit',iconSize:[hit,hit],iconAnchor:[hit/2,hit/2],
    html:`<div class="${cls}" style="width:${visible}px;height:${visible}px">${kind==='move'?'✥':''}</div>`});
}
// A lost mouseup leaves Leaflet's global drag lock active. Capture the native
// pointer release, then let the normal mouse/touch handler finish first. Only
// recover the same vertex gesture if it is still pending; never end map pans.
function activeDrag(){
  const d=L2.Draggable?._dragging;
  return d?._element?.classList?.contains('gm-vtx-hit')?d:null;
}
function finishInterrupted(d){
  if(d&&activeDrag()===d){d.finishDrag(true);S._vtxDragging=false;}
}
for(const type of ['pointerup','pointercancel'])window.addEventListener(type,()=>{
  const d=activeDrag();if(d)setTimeout(()=>finishInterrupted(d),0);
},true);
window.addEventListener('pointermove',ev=>{
  if(ev.pointerType!=='touch'&&ev.buttons===0)finishInterrupted(activeDrag());
},true);
function flushRender(){
  if(S._vtxDragging||(typeof ED!=='undefined'&&ED.drag))return;
  (S.layers||[]).forEach(L=>{if(L._vertexRenderPending)finishVertexRender(L);});
}
for(const type of ['pointerup','pointercancel','mouseup','touchend','touchcancel','blur'])
  window.addEventListener(type,()=>setTimeout(flushRender,0),true);
function toolChanged(){flushRender();if(typeof ED!=='undefined'&&ED.on&&typeof edRedraw==='function')edRedraw();}
window.GeoMineVertexHandles={legacyActive,beginLegacy,icon,priority,toolChanged};
})();
