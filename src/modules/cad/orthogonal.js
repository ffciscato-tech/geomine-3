/* One orthogonal constraint shared by drawing, CAD and both vertex editors.
   Axes belong to the edited layer CRS, not the distorted screen projection.
   Magnetic targets can refine the distance, but cannot release the axis. */
(function(){
'use strict';
let guide=null;
const finite=p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
function axis(a,b){return Math.abs(b[0]-a[0])>=Math.abs(b[1]-a[1])?0:1;}
function constrain(a,b,which){
 if(!finite(a)||!finite(b))return b;
 const p=b.slice();p[1-(which??axis(a,b))]=a[1-(which??axis(a,b))];return p;
}
function latlng(crs,p){const w=toWGS(crs,p[0],p[1]);return L2.latLng(w[1],w[0]);}
function resolve(ll,{anchor=null,crs=S.workCRS,ignore=null,snap=true,flash=false,exclude=null}={}){
 const magnetic=S.snapOn&&snap&&typeof snapLatLng==='function';
 if(!S.orthoOn||!anchor)return magnetic?snapLatLng(ll,ignore,{flash,exclude}):{latlng:ll,snapped:false};
 const a=fromWGS(crs,anchor.lng,anchor.lat),b=fromWGS(crs,ll.lng,ll.lat);
 if(!finite(a)||!finite(b))return {latlng:ll,snapped:false};
 const which=axis(a,b),fixed=1-which,base=constrain(a,b,which),q=latlng(crs,base);
 const tolerance=/^(EPSG:)?(4326|4674|4618)$/.test(crs)?1e-9:1e-5;
 const accept=p=>Math.abs(fromWGS(crs,p[1],p[0])[fixed]-a[fixed])<=tolerance;
 const segmentPoint=(la1,lo1,la2,lo2)=>{
  const u=fromWGS(crs,lo1,la1),v=fromWGS(crs,lo2,la2),den=v[fixed]-u[fixed];
  if(!finite(u)||!finite(v))return null;
  let p;
  if(Math.abs(den)<=tolerance){
   if(Math.abs(u[fixed]-a[fixed])>tolerance)return null;
   p=base.slice();p[which]=Math.max(Math.min(u[which],v[which]),Math.min(Math.max(u[which],v[which]),base[which]));
  }else{
   const t=(a[fixed]-u[fixed])/den;if(t<0||t>1)return null;
   p=constrain(a,[u[0]+t*(v[0]-u[0]),u[1]+t*(v[1]-u[1])],which);
  }
  const hit=latlng(crs,p);return [hit.lat,hit.lng];
 };
 const hit=magnetic?snapLatLng(q,ignore,{flash,accept,segmentPoint,exclude}):{latlng:q,snapped:false};
 // Normalize the locked coordinate even after reprojection of a snap target.
 const end=constrain(a,fromWGS(crs,hit.latlng.lng,hit.latlng.lat),which);
 return {...hit,latlng:latlng(crs,end),orthogonal:true,axis:which,kind:'ORTO '+(which===0?'horizontal':'vertical')+(hit.snapped?' · '+hit.kind:'')};
}
function drawing(ll,flash=false){
 const p=['line','poly'].includes(S.tool)&&S.drawBuf?.at(-1),L=GeoMineDrawingSession.layer();
 return resolve(ll,{anchor:p?L2.latLng(p):null,crs:L?.crs||S.workCRS,flash});
}
function editorInput(ll,flash=false){
 const ed=typeof ED==='object'?ED:null,L=ed?.sel?.L,P=ed?.pend;
 const p=P&&['mover','copiar'].includes(P.cmd)&&P.pts?.[0];
 return resolve(ll,{anchor:p?latlng(L?.crs||S.workCRS,p):null,crs:L?.crs||S.workCRS,ignore:L,flash}).latlng;
}
function closeCorner(ring){
 if(!S.orthoOn||ring.length<3)return;
 const a=ring[0],b=ring.at(-1),previous=ring.at(-2);
 if(Math.abs(a[0]-b[0])<1e-7||Math.abs(a[1]-b[1])<1e-7)return;
 ring.push(axis(previous,b)===0?[b[0],a[1]]:[a[0],b[1]]);
}
function clearPreview(){if(guide){try{map.removeLayer(guide);}catch(_){}guide=null;}}
function preview(hit){
 const last=S.drawBuf?.at(-1);
 if(!S.orthoOn||!last||!['line','poly'].includes(S.tool)){clearPreview();return;}
 if(!guide)guide=L2.polyline([last,hit.latlng],{pane:'alagis_desenho',interactive:false,color:'#f5a524',weight:2,dashArray:'6 4'}).addTo(map);
 else guide.setLatLngs([last,hit.latlng]);
}
function sync(){
 for(const id of ['snOrtho','cadOrtho']){const el=document.getElementById(id);if(el)el.checked=!!S.orthoOn;}
 const btn=document.getElementById('btnSnap');if(btn){btn.classList.toggle('ortho-on',!!S.orthoOn);btn.classList.toggle('on',!!(S.snapOn||S.orthoOn));}
 window.GeoMineSnapSync?.();
}
function set(on){S.orthoOn=!!on;clearPreview();sync();if(typeof limpaCursorSnap==='function')limpaCursorSnap();toast('ORTO '+(S.orthoOn?'ligado — desenho e arraste em 0°/90°':'desligado'));}
function bind(){
 const el=document.getElementById('snOrtho');if(el)el.onchange=e=>set(e.target.checked);
 document.addEventListener('keydown',e=>{
  if(e.key!=='F8'||e.repeat||e.ctrlKey||e.metaKey||e.altKey)return;
  const t=e.target;if(t?.isContentEditable||t?.closest?.('input:not([type="checkbox"]):not([type="radio"]),textarea,select'))return;
  e.preventDefault();set(!S.orthoOn);
 });sync();
}
window.GeoMineOrtho={axis,constrain,latlng,resolve,drawing,editorInput,closeCorner,preview,clearPreview,sync,set,bind};
})();
