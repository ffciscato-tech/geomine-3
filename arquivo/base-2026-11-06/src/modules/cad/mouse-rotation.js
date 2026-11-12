/* CAD rotation: one private canvas, one update per animation frame, exact CRS projection.
   Source coordinates remain untouched until the confirming click (or Enter). */
(function(){
'use strict';
let current=null,frame=null,swallowUntil=0;
const hint=t=>{const el=document.getElementById('gmRotationHint');if(el&&el.textContent!==t)el.textContent=t;};
const angleHint=()=>hint('Ângulo: '+current.degrees.toFixed(3)+'° · Clique ou Enter: confirmar · R: referência · Shift: 15° · Esc: cancelar');
function cancel(){
 if(!current)return;
 const old=current;current=null;if(frame!==null)cancelAnimationFrame(frame);frame=null;
 old.canvas.remove();document.getElementById('gmRotationHint')?.remove();
 if(old.handles)old.handles.style.visibility=old.handlesVisibility;
 const cont=map.getContainer();cont.classList.remove('gm-rotation-active');
 if(ED.pend===old.pending)ED.pend=null;
 if(old.dragging)map.dragging.enable();
 cont.style.cursor=old.cursor;
}
function valid(){
 const a=current;
 if(a&&a.grupo)return S.projectId===a.project&&S.workCRS===a.work&&ED.pend===a.pending&&grupoVigente(a.grupo);
 if(!a||!ED.on||ED.sel?.L!==a.L||ED.sel?.f!==a.f||S.projectId!==a.project||S.workCRS!==a.work||a.L.crs!==a.crs||ED.pend!==a.pending||!(S.layers||[]).includes(a.L))return false;
 if(a.L.features[a.index]!==a.f)a.index=a.L.features.indexOf(a.f);
 return a.index>=0;
}
function coordinate(ll){const p=current.projection.inverse([ll.lng,ll.lat]);if(!p.every(Number.isFinite))throw Error('Coordenada inválida.');return p;}
function angle(p,shift=false){
 const a=current,dx=p[0]-a.center[0],dy=p[1]-a.center[1];
 if(Math.hypot(dx,dy)<1e-7)return null;
 let value=(Math.atan2(dy,dx)-a.reference)*180/Math.PI;
 value=((value+540)%360)-180;return shift?Math.round(value/15)*15:value;
}
function ringsAt(degrees){return edGirar(current.rings,current.center,degrees).map((r,ri)=>r.map((p,pi)=>[p[0],p[1],...current.rings[ri][pi].slice(2)]));}
function toLayer(rings){const a=current;if(a.work===a.crs)return rings;const transform=proj4(a.work,a.crs);return rings.map(r=>r.map(p=>{const q=transform.forward([p[0],p[1]]);return [q[0],q[1],...p.slice(2)];}));}
function schedule(){if(frame===null)frame=requestAnimationFrame(render);}
// Simplify only the disposable display path, below a fraction of a pixel.
// Rigid rotation preserves this work-CRS tolerance. The complete rings above
// remain the sole source for commit, Z/M, autosave and undo.
function previewRings(a,pixel,zoom){
 if(a.previewZoom===zoom&&a.previewRings)return a.previewRings;
 let radius=0;for(const ring of a.rings)for(const p of ring)radius=Math.max(radius,Math.hypot(p[0]-a.center[0],p[1]-a.center[1]));
 const step=Math.max(radius*1e-5,1e-6);let scale=0;
 for(let i=-1;i<16;i++){
  const t=i*Math.PI/8,x=a.center[0]+(i<0?0:radius*Math.cos(t)),y=a.center[1]+(i<0?0:radius*Math.sin(t)),p=pixel(x,y),px=pixel(x+step,y),py=pixel(x,y+step);
  scale=Math.max(scale,Math.hypot(px.x-p.x,px.y-p.y)/step,Math.hypot(py.x-p.x,py.y-p.y)/step);
 }
 const tolerance=Number.isFinite(scale)&&scale>0?.1/scale:0;
 a.previewRings=a.rings.map(r=>{
  if(!tolerance||r.length<100||a.L.gtype==='point')return r;
  const simple=edSimplify(r,tolerance);return a.L.gtype==='polygon'&&simple.length<4?r:simple;
 });
 a.previewZoom=zoom;return a.previewRings;
}
function render(){
 frame=null;if(!valid()){cancel();return;}
 try{
 const a=current,canvas=a.canvas,ctx=a.context,size=map.getSize(),ratio=Math.min(window.devicePixelRatio||1,2);
 if(canvas.width!==Math.round(size.x*ratio)||canvas.height!==Math.round(size.y*ratio)){
  canvas.width=Math.round(size.x*ratio);canvas.height=Math.round(size.y*ratio);canvas.style.width=size.x+'px';canvas.style.height=size.y+'px';
 }
 ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,size.x,size.y);if(!a.center)return;
 // Keep subpixel positions. Leaflet container-point helpers round each vertex,
 // and rebuilding a Leaflet path/proj4 definition on every move is expensive.
 const origin=map.getPixelOrigin().add(map.containerPointToLayerPoint([0,0])),zoom=map.getZoom(),crs=map.options.crs;
 const pixel=(x,y)=>{const w=a.projection.forward([x,y]);return crs.latLngToPoint({lng:w[0],lat:w[1]},zoom).subtract(origin);};
 const center=pixel(a.center[0],a.center[1]);
 ctx.strokeStyle='#f5a524';ctx.fillStyle='#f5a524';ctx.lineWidth=2;ctx.lineJoin='round';
 if(a.phase==='angle'){
  const radians=a.degrees*Math.PI/180,co=Math.cos(radians),si=Math.sin(radians);
  /* uma feição (editor) ou o conjunto selecionado: cada camada com seu tipo */
  const blocos=a.grupo?a.grupo.map(it=>({tipo:it.L.gtype,rings:it.rings})):[{tipo:a.L.gtype,rings:previewRings(a,pixel,zoom)}];
  for(const b of blocos){
   ctx.beginPath();
   for(const ring of b.rings){
    for(let i=0;i<ring.length;i++){
     const p=ring[i],dx=p[0]-a.center[0],dy=p[1]-a.center[1],q=pixel(a.center[0]+dx*co-dy*si,a.center[1]+dx*si+dy*co);
     if(b.tipo==='point'){ctx.moveTo(q.x+6,q.y);ctx.arc(q.x,q.y,6,0,Math.PI*2);}
     else if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);
    }
    if(b.tipo==='polygon')ctx.closePath();
   }
   if(b.tipo==='polygon'){ctx.globalAlpha=.12;ctx.fill('evenodd');ctx.globalAlpha=1;}
   ctx.stroke();
  }
  angleHint();
 }
 if(a.point){const q=pixel(a.point[0],a.point[1]);ctx.lineWidth=1;ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(center.x,center.y);ctx.lineTo(q.x,q.y);ctx.stroke();ctx.setLineDash([]);}
 ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(center.x,center.y,5,0,Math.PI*2);ctx.fill();
 ctx.beginPath();ctx.moveTo(center.x-10,center.y);ctx.lineTo(center.x+10,center.y);ctx.moveTo(center.x,center.y-10);ctx.lineTo(center.x,center.y+10);ctx.stroke();
 }catch(err){cancel();toast(err.message);}
}
function move(ll,shift=false){
 if(!valid()){cancel();return;}
 const a=current;a.point=coordinate(ll);
 if(a.phase==='angle'){const degrees=angle(a.point,shift);if(degrees!==null)a.degrees=degrees;}
 schedule();
}
function commit(degrees){
 if(!valid()){cancel();return;}
 const a=current;
 if(degrees===null||!Number.isFinite(degrees))return;
 if(a.grupo){const g=a.grupo,c=a.center;cancel();if(Math.abs(degrees)>=1e-10)grupoAplica(g,c,degrees);return;}
 if(a.L.locked||(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(a.L,false))||JSON.stringify(a.f.geom)!==a.original){cancel();toast('A feição mudou ou está bloqueada. Repita Girar.');return;}
 const rings=toLayer(ringsAt(degrees));
 if(!rings.every(r=>r.every(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])))){cancel();toast('Não foi possível transformar as coordenadas.');return;}
 cancel();if(Math.abs(degrees)<1e-10)return;
 edSnapshot('girar com mouse');edAplicar(rings,'Girado '+degrees.toFixed(3)+'° com o mouse');
}
function click(ll,shift=false){
 if(!valid()){cancel();return;}
 const a=current,p=coordinate(ll);
 if(a.phase==='center'){a.center=p;a.phase='angle';a.point=null;schedule();angleHint();return;}
 if(Math.hypot(p[0]-a.center[0],p[1]-a.center[1])<1e-7){toast('Escolha um ponto afastado do centro.');return;}
 if(a.phase==='reference'){a.reference=Math.atan2(p[1]-a.center[1],p[0]-a.center[0]);a.point=p;a.degrees=0;a.phase='angle';schedule();return;}
 commit(angle(p,shift));
}
// Geometric centroid: area for polygons (holes subtracted), length for lines.
// Translate coordinates before cross products to retain precision in UTM.
function centroid(rings,type){
 const origin=rings.find(r=>r.length)?.[0];if(!origin)return null;
 if(type==='polygon'){
  let weight=0,x=0,y=0;
  for(const [index,ring] of rings.entries()){
   if(ring.length<3)continue;
   let crossSum=0,cx=0,cy=0;
   for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const ax=ring[j][0]-origin[0],ay=ring[j][1]-origin[1],bx=ring[i][0]-origin[0],by=ring[i][1]-origin[1],cross=ax*by-bx*ay;
    crossSum+=cross;cx+=(ax+bx)*cross;cy+=(ay+by)*cross;
   }
   if(Math.abs(crossSum)<1e-12)continue;
   const depth=rings.reduce((n,other,k)=>n+(k!==index&&other.length>=3&&edInRing(ring[0],other)?1:0),0);
   const w=Math.abs(crossSum)*(depth%2?-1:1);
   weight+=w;x+=cx/(3*crossSum)*w;y+=cy/(3*crossSum)*w;
  }
  if(weight>1e-12)return [origin[0]+x/weight,origin[1]+y/weight];
 }
 if(type==='line'||type==='polygon'){
  let length=0,x=0,y=0;
  for(const ring of rings)for(let i=1;i<ring.length;i++){
   const a=ring[i-1],b=ring[i],w=Math.hypot(b[0]-a[0],b[1]-a[1]);
   length+=w;x+=((a[0]-origin[0]+b[0]-origin[0])/2)*w;y+=((a[1]-origin[1]+b[1]-origin[1])/2)*w;
  }
  if(length)return [origin[0]+x/length,origin[1]+y/length];
 }
 return edCentroide(rings);
}
/* ---------- GRUPO: seleção múltipla (ou partes) gira junto ----------
   Mesmo gesto e mesma prévia; o centro é o do retângulo envolvente do
   conjunto. Cada feição volta ao CRS da própria camada, Z/M preservados, e o
   gesto inteiro vira uma entrada de desfazer ('geomlote', como o Mover). */
const mapa=(v,fn)=>!Array.isArray(v)?v:typeof v[0]==='number'?fn(v):v.map(x=>mapa(x,fn));
function partesDe(L,f){
 if(L.gtype==='point')return (typeof pointGeomCoords==='function'?pointGeomCoords(f.geom):[]).map(p=>[p]);
 return (f.multi&&Array.isArray(f.geom?.[0]?.[0]))?f.geom:[f.geom];
}
function grupoItens(es){
 const work=S.workCRS;
 return es.filter(e=>!window.GeoMineDimensions?.isFeature?.(e.L,e.f)).map(e=>{
  const toW=String(e.L.crs)===String(work)?null:proj4(e.L.crs,work),tw=p=>{const q=toW?toW.forward([p[0],p[1]]):p;return [q[0],q[1]];};
  const todas=partesDe(e.L,e.f),sel=e.partes&&e.L.gtype!=='point'?todas.filter((_,i)=>e.partes.has(i)):todas;
  return {L:e.L,f:e.f,idx:e.idx,partes:e.L.gtype==='point'?null:e.partes,geomRef:e.f.geom,rings:sel.map(r=>r.map(tw))};
 });
}
function grupoVigente(g){return g.every(it=>(S.layers||[]).includes(it.L)&&it.L.features[it.idx]===it.f&&it.f.geom===it.geomRef);}
function grupoBloqueio(g){
 if(!g.length)return 'Selecione uma ou mais feições para girar.';
 for(const {L,f} of g){
  if(L.locked)return 'A camada "'+L.name+'" está bloqueada (cadeado). Desbloqueie-a para girar.';
  if(L.visible===false)return 'A camada "'+L.name+'" está oculta.';
  if(window.rb134EhDerivadaProtegida&&window.rb134EhDerivadaProtegida(L,f))return 'A camada "'+L.name+'" tem geometria calculada pelo projeto; ajuste-a pelos parâmetros.';
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);return '';}
 }
 return null;
}
function grupoCentro(g){
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const it of g)for(const r of it.rings)for(const p of r){if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1];}
 return Number.isFinite(x0)?[(x0+x1)/2,(y0+y1)/2]:null;
}
function grupoAplica(g,c,degrees){
 const work=S.workCRS,a=degrees*Math.PI/180,co=Math.cos(a),si=Math.sin(a),tem=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 if(!grupoVigente(g)){toast('A seleção mudou durante o giro. Repita Girar.');return 0;}
 const b=grupoBloqueio(g);if(b!==null){if(b)toast(b);return 0;}
 const novos=g.map(it=>{
  const toW=String(it.L.crs)===String(work)?null:proj4(it.L.crs,work);
  const fn=p=>{const q=toW?toW.forward([p[0],p[1]]):[p[0],p[1]],dx=q[0]-c[0],dy=q[1]-c[1],r=[c[0]+dx*co-dy*si,c[1]+dx*si+dy*co],s=toW?toW.inverse(r):r;return [s[0],s[1],...p.slice(2)];};
  const geom=it.partes?it.f.geom.map((parte,i)=>it.partes.has(i)?mapa(parte,fn):mapa(parte,p=>p.slice())):mapa(it.f.geom,fn);
  let ok=true;mapa(geom,p=>{if(!Number.isFinite(p[0])||!Number.isFinite(p[1]))ok=false;return p;});
  if(!ok)throw Error('O giro gerou coordenada inválida na camada "'+it.L.name+'".');
  const hs=!it.partes&&Array.isArray(it.f.cadHatches)?it.f.cadHatches.map(h=>h&&Array.isArray(h.segments)?{...h,segments:mapa(h.segments,fn)}:h):undefined;
  return {it,geom,hs};
 });
 const antes=g.map(({L,f})=>({L,f,geom:f.geom,multi:f.multi,temZg:tem(f,'zg'),zg:Array.isArray(f.zg)?JSON.parse(JSON.stringify(f.zg)):f.zg,temHachuras:tem(f,'cadHatches'),cadHatches:f.cadHatches}));
 const camadas=[...new Set(g.map(it=>it.L))];
 if(typeof rb31EmpilhaEdicao==='function')for(const L of camadas){const it=g.find(x=>x.L===L);try{rb31EmpilhaEdicao(L,it.f);}catch(_){}}
 for(const n of novos){n.it.f.geom=n.geom;if(n.hs)n.it.f.cadHatches=n.hs;}
 undoPush({t:'geomlote',itens:antes,msg:'girar '+g.length+(g.length>1?' feições':' feição')});
 camadas.forEach(L=>drawLayer(L));
 for(const it of g){
  try{if(typeof rb31PosEdicao==='function')rb31PosEdicao(it.L,it.f);}catch(e){console.warn(e);}
  try{if(typeof edEhDrenagem==='function'&&edEhDrenagem(it.L))edRecalcGeom(it.L,it.f);}catch(e){console.warn(e);}
 }
 try{if(typeof highlightSel==='function')highlightSel();}catch(_){}
 try{if(typeof mselHL==='function'&&S.msel?.items?.length)mselHL();}catch(_){}
 try{if(ED.on){edRedraw();edPainelSync();}}catch(_){}
 refreshUI();
 try{if(document.getElementById('attrPanel')?.classList.contains('open'))openAttr();}catch(_){}
 try{if(typeof cavaLiveSync==='function')cavaLiveSync({immediate:true});}catch(e){console.warn(e);}
 try{if(typeof projecaoLiveSync==='function')projecaoLiveSync(true);}catch(e){console.warn(e);}
 toast((g.length>1?g.length+' feições giradas ':'Feição girada ')+degrees.toFixed(3).replace(/\.?0+$/,'')+'° — Ctrl+Z desfaz');
 return g.length;
}
/* conjunto da seleção (mesma precedência do Mover); null só quando é a feição
   inteira que o editor já tem — essa segue o caminho de sempre (edAplicar) */
function grupoDaSelecao(){
 const es=window.GeoMineDragMove?GeoMineDragMove.conjunto():[];
 if(!es.length)return null;
 if(es.length===1&&!es[0].partes&&typeof ED!=='undefined'&&ED.on&&ED.sel&&ED.sel.f===es[0].f)return null;
 return es;
}
/* giro por ângulo digitado (janela Girar) para o conjunto */
function rotateSelection(degrees,{azimute=null}={}){
 const es=grupoDaSelecao()||(window.GeoMineDragMove?GeoMineDragMove.conjunto():[]);
 const g=grupoItens(es),b=grupoBloqueio(g);if(b!==null){if(b)toast(b);return 0;}
 const c=grupoCentro(g);if(!c)return 0;
 let d=degrees;
 if(azimute!==null){const rs=g.flatMap(it=>it.rings),az0=typeof edAzimuteAtual==='function'?edAzimuteAtual(rs):0;d=((((azimute%360)+360)%360-az0+540)%360-180);}
 return Math.abs(d)<1e-10?0:grupoAplica(g,c,d);
}
function abre(base,center){
 const cont=map.getContainer(),pending={cmd:'girarMouse'},canvas=document.createElement('canvas');
 canvas.id='gmRotationPreview';canvas.style.cssText='position:absolute;inset:0;z-index:695;pointer-events:none';canvas.setAttribute('aria-hidden','true');
 current={...base,work:S.workCRS,projection:proj4(S.workCRS,'EPSG:4326'),project:S.projectId,pending,phase:center?'angle':'center',center,reference:0,point:null,degrees:0,
  canvas,context:canvas.getContext('2d'),handles:ED.rend?._container,handlesVisibility:ED.rend?._container?.style.visibility,dragging:map.dragging.enabled(),cursor:cont.style.cursor};
 window.GeoMinePolygonEdgeDrag?.clear();window.GeoMineOrtho?.clearPreview();if(typeof limpaCursorSnap==='function')limpaCursorSnap();
 ED.drag=null;ED.pend=pending;map.dragging.disable();cont.style.cursor='crosshair';cont.classList.add('gm-rotation-active');
 if(current.handles)current.handles.style.visibility='hidden';
 cont.appendChild(canvas);
 const el=document.createElement('div');el.id='gmRotationHint';el.setAttribute('role','status');
 el.style.cssText='position:absolute;bottom:30px;left:50%;transform:translateX(-50%);z-index:1000;max-width:90%;padding:9px 14px;border:1px solid #f5a524;border-radius:7px;background:#142334;color:white;pointer-events:none;font:13px sans-serif';
 cont.appendChild(el);schedule();
 hint(center?(base.grupo?base.grupo.length+' feições · centro do conjunto marcado':'Centroide marcado')+' · Mova o mouse e clique para confirmar · R: definir referência · Esc: cancelar':'Clique no ponto-base; depois mova o mouse e clique para confirmar · Esc: cancelar');
}
function start({pivot='centroid'}={}){
 cancel();window.GeoMineDragMove?.cancel();
 const es=grupoDaSelecao();
 if(es){
  const g=grupoItens(es),b=grupoBloqueio(g);if(b!==null){if(b)toast(b);return;}
  const center=pivot==='point'?null:grupoCentro(g);
  if(center&&!center.every(Number.isFinite)){toast('Centro do conjunto inválido.');return;}
  abre({grupo:g,L:null,f:null},center);return;
 }
 if(!edPrecisa())return;if(!ED.on)edLigar(true,true);
 const {L,f}=ED.sel;if(L.locked){toast('Desbloqueie a camada para girar.');return;}
 const work=S.workCRS,transform=L.crs===work?null:proj4(L.crs,work),projection=proj4(work,'EPSG:4326'),rings=edRings(L,f).map(r=>r.map(p=>{const q=transform?transform.forward([p[0],p[1]]):p;return [q[0],q[1],...p.slice(2)];}));
 if(!rings.length)return;
 const center=pivot==='point'?null:centroid(rings,L.gtype);
 if(center&&!center.every(Number.isFinite)){toast('Centroide inválido.');return;}
 abre({L,f,index:ED.sel.idx,crs:L.crs,original:JSON.stringify(f.geom),rings},center);
}
const cont=map.getContainer(),isControl=e=>!!e.target.closest?.('.leaflet-control,.edbox,input,button,select,textarea');
const style=document.createElement('style');style.textContent='.gm-rotation-active .gm-vtx-hit{visibility:hidden!important}';document.head.appendChild(style);
cont.addEventListener('pointermove',e=>{
 if(!current||isControl(e)||e.buttons&4)return;
 e.stopImmediatePropagation();try{move(map.mouseEventToLatLng(e),e.shiftKey);}catch(err){cancel();toast(err.message);}
},true);
// Synthetic mousemove also runs Leaflet's snap/hover scans. Rotation owns this
// gesture; keep the other tools idle rather than traversing the whole project.
cont.addEventListener('mousemove',e=>{if(current&&!isControl(e))e.stopImmediatePropagation();},true);
cont.addEventListener('pointerdown',e=>{
 if(!current||e.button!==0||isControl(e))return;
 e.preventDefault();e.stopImmediatePropagation();swallowUntil=Date.now()+400;try{click(map.mouseEventToLatLng(e),e.shiftKey);}catch(err){cancel();toast(err.message);}
},true);
cont.addEventListener('pointerup',()=>{if(current)swallowUntil=Date.now()+400;},true);
cont.addEventListener('click',e=>{if((current&&!isControl(e))||Date.now()<swallowUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
window.addEventListener('keydown',e=>{
 if(!current)return;
 if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancel();toast('Rotação cancelada');return;}
 if(e.target.closest?.('input,textarea,select,[contenteditable="true"]')||e.ctrlKey||e.metaKey||e.altKey)return;
 if(e.key==='Shift'&&current.phase==='angle'&&current.point){const degrees=angle(current.point,true);if(degrees!==null)current.degrees=degrees;schedule();}
 if(e.key.toLowerCase()==='r'&&current.center){e.preventDefault();current.phase='reference';current.degrees=0;hint('Clique na direção de referência; depois mova o mouse e clique para confirmar · Esc: cancelar');schedule();}
 if(e.key==='Enter'&&current.phase==='angle'){e.preventDefault();e.stopImmediatePropagation();try{commit(current.degrees);}catch(err){cancel();toast(err.message);}}
},true);
window.addEventListener('keyup',e=>{if(e.key==='Shift'&&current?.phase==='angle'&&current.point){const degrees=angle(current.point,false);if(degrees!==null)current.degrees=degrees;schedule();}},true);
document.addEventListener('click',e=>{if(current&&e.target.closest?.('.rbtn,.ribcat,.mtool'))cancel();},true);
map.on('zoomend moveend resize',()=>{if(current)schedule();});
window.GeoMineMouseRotation={start,cancel,move,click,centroid,rotateSelection,isGroup:()=>!!grupoDaSelecao(),
 state:()=>current?{phase:current.phase,degrees:current.degrees,center:current.center?.slice(),grupo:current.grupo?current.grupo.length:0}:null};
})();
