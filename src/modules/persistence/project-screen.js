/* Visual workspace belongs to the project file, not to the last browser tab. */
(function(){
'use strict';
const el=id=>document.getElementById(id),finite=Number.isFinite;
const views=new Set(['map','layout','v3d','cava2','geo','hidro','perfis','licenses']);
const scrollIds=['side','layerList','propDockContent','attrWrap','sheetWrap'];
const controls=['v3dVE','v3dBg','v3dBgC','v3dVec','v3dDrape','v3dWire','v3dGrid','v3dVecOff','v3dVecOffR','v3dVecFix','v3dVER'];
let generation=0,pendingCamera=null,allowPrevious=true;
function validMap(v){return v&&Array.isArray(v.center)&&v.center.length===2&&v.center.every(finite)&&Math.abs(v.center[0])<=90&&finite(v.zoom)&&v.zoom>=0&&v.zoom<=24;}
function validCamera(c){return c&&['e','n','z','radius','theta','phi'].every(k=>finite(c[k]))&&c.radius>0;}
function camera(){
 if(pendingCamera)return {...pendingCamera};
 if(!allowPrevious||!V3.scene||!V3.cam||!Array.isArray(V3.tgt)||![V3.OX,V3.OY,V3.z0].every(finite))return null;
 const ve=finite(V3.VE)&&V3.VE>0?V3.VE:1;
 return {e:V3.OX+V3.tgt[0],n:V3.OY-V3.tgt[2],z:V3.z0+V3.tgt[1]/ve,radius:V3.radius,theta:V3.theta,phi:V3.phi,topNorth:!!V3.topNorth};
}
function capture(){
 const c=map.getCenter(),f=S.selFeat,r=S.selRaster;
 return {version:1,map:{center:[c.lat,c.lng],zoom:map.getZoom(),base:S.getBase?.()||S._base},
  view:views.has(S._view)?S._view:'map',ribbon:typeof RIB_CAT_ATUAL==='string'?RIB_CAT_ATUAL:null,
  activeLayerId:S.activeId??null,activeRaster:r===S.img&&r?{type:'image'}:r?{type:'raster',id:r.id}:null,
  selection:f&&f.layer&&f.layer.features[f.idx]?{layerId:f.layer.id,index:f.idx,partIdx:f.partIdx??null}:null,
  panels:{propertiesCollapsed:document.body.classList.contains('prop-dock-collapsed'),sideOpen:el('side')?.classList.contains('open'),
   attributes:el('attrPanel')?.classList.contains('open'),commands:el('cmdBox')?.style.display!=='none',commandHeight:CMD.hFix||null,commandSize:CMD.alt||'auto'},
  layout:{mode:S.loMode||'fig',zoom:S.loZoom||1},
  scroll:Object.fromEntries(scrollIds.filter(id=>el(id)).map(id=>[id,{left:el(id).scrollLeft,top:el(id).scrollTop}])),
  camera:camera(),controls:Object.fromEntries(controls.filter(id=>el(id)).map(id=>[id,el(id).type==='checkbox'?el(id).checked:el(id).value]))};
}
function prepare(d){
 window.GeoMineThalweg?.resetProject();
 generation++;allowPrevious=false;pendingCamera=validCamera(d?.screen?.camera)?{...d.screen.camera}:null;
 // A gesture cannot keep references to features from the previous file.
 if(typeof destravaInteracao==='function')destravaInteracao();
 if(typeof edLigar==='function')edLigar(false,true);
 if(typeof ED!=='undefined'){ED.sel=null;ED.pend=null;}
 if(typeof clearVertices==='function')clearVertices();
 if(typeof setTool==='function')setTool('select');
 S.activeId=null;S.selRaster=null;
 if(S._view!=='map')switchView('map');
 if(typeof MINA3D_AUTO!=='undefined'){clearTimeout(MINA3D_AUTO.timer);MINA3D_AUTO.last='';MINA3D_AUTO.lastSurf='';}
}
function restore(d){
 const q=d?.screen;if(!q||q.version!==1)return false;
 const token=generation;
 S.activeId=S.layers.find(l=>l.id===q.activeLayerId)?.id??null;
 S.selRaster=q.activeRaster?.type==='image'?S.img:(S.rasters||[]).find(r=>r.id===q.activeRaster?.id)||null;
 const f=q.selection,L=S.layers.find(l=>l.id===f?.layerId);
 S.selFeat=L&&Number.isInteger(f?.index)&&L.features[f.index]?{layer:L,layerId:L.id,idx:f.index,partIdx:Number.isInteger(f.partIdx)?f.partIdx:undefined}:null;
 const p=q.panels||{},button=el('propDockToggle');
 if(typeof p.propertiesCollapsed==='boolean'){
  if(window.GeoMinePropDock?.restore)window.GeoMinePropDock.restore(p.propertiesCollapsed);
  else if(document.body.classList.contains('prop-dock-collapsed')!==p.propertiesCollapsed)button?.click();
 }
 if(typeof p.sideOpen==='boolean')el('side')?.classList.toggle('open',p.sideOpen);
 // O tamanho da caixa de comandos é escolha do aparelho, não do projeto:
 // abrir um projeto não a tira do estado minimizado nem da altura automática.
 if(typeof p.commands==='boolean')cmdToggle(p.commands);
 for(const id of controls){const e=el(id),v=q.controls?.[id];if(!e||v==null)continue;
  if(e.type==='checkbox'){if(typeof v==='boolean')e.checked=v;}
  else if(typeof v==='string'&&v.length<100){if(e.tagName==='SELECT'&&![...e.options].some(o=>o.value===v))continue;if(e.type==='number'&&!finite(Number(v)))continue;e.value=v;}
 }
 if(['fig','a4','prop'].includes(q.layout?.mode))S.loMode=q.layout.mode;
 if(finite(q.layout?.zoom))S.loZoom=Math.max(.15,Math.min(10,q.layout.zoom));
 if(validMap(q.map)){
  if(typeof q.map.base==='string'&&Object.prototype.hasOwnProperty.call(baseLayers,q.map.base)){S.setBase(q.map.base);if(typeof pickBaseUI==='function')pickBaseUI(q.map.base);}
  map.stop();map.invalidateSize({pan:false});map.setView(q.map.center,q.map.zoom,{animate:false});
 }
 refreshUI();
 el('attrPanel')?.classList.remove('open');if(p.attributes&&S.activeId!=null)openAttr();
 if(S.selFeat&&typeof highlightSel==='function')highlightSel();
 switchView(views.has(q.view)?q.view:'map');
 if(typeof CATS!=='undefined'&&CATS.some(c=>c.id===q.ribbon)){RIB_CAT_ATUAL=q.ribbon;ribbonBuild();}
 if(S._view==='layout'){syncZoomUI();}
 // Only scroll after the restored panels have their final dimensions. Never
 // reapply a delayed map center: that would undo a user's first pan/zoom.
 requestAnimationFrame(()=>{if(token!==generation)return;
  for(const id of scrollIds){const e=el(id),v=q.scroll?.[id];if(!e||!v)continue;
   if(finite(v.left))e.scrollLeft=Math.max(0,v.left);if(finite(v.top))e.scrollTop=Math.max(0,v.top);
  }
 });
 return validMap(q.map);
}
window.GeoMineProjectScreen={capture,prepare,restore,validMap,
 cameraForBuild:()=>pendingCamera,previousCameraAllowed:()=>allowPrevious,
 cameraApplied(c){if(c===pendingCamera)pendingCamera=null;allowPrevious=true;}};
})();
