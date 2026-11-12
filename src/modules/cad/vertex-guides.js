/* GUIAS DE ALINHAMENTO NO ARRASTO DE VÉRTICE.
   Ao arrastar um vértice, aparecem linhas a partir dos vizinhos dele, no CRS
   da camada (valem para figura girada, com qualquer azimute):
   · paralela: direção original da aresta vizinho→vértice — seguindo-a, a
     aresta continua paralela a como era (num retângulo, paralela à oposta);
   · perpendicular: 90° com a outra aresta do vizinho — ângulo reto nele.
   Perto de uma guia o vértice encaixa nela; perto de duas, no cruzamento.
   As guias aparecem durante todo o arrasto; o encaixe segue o ímã (S.snapOn)
   e cede ao ORTO e aos alvos do próprio ímã (vértice, centro, linha). */
(function(){
'use strict';
let g=null,context=null,on=true;
const preference='geomine.vertexGuides.enabled';
try{on=localStorage.getItem(preference)!=='false';}catch(_){}
function sync(){
  const button=document.getElementById('btnVertexGuides'),check=document.getElementById('snVertexGuides');
  if(button){button.classList.toggle('on',on);button.setAttribute('aria-pressed',String(on));button.title='Guias de vértices '+(on?'ligadas — clique para desligar':'desligadas — clique para ligar');}
  if(check)check.checked=on;
}
function setEnabled(value){
  on=!!value;try{localStorage.setItem(preference,String(on));}catch(_){}
  const current=context;end();
  if(current){context=current;if(on){if(current.drawing)beginDrawing(current.L,current.buf);else begin(...current);}}
  sync();return on;
}
const TOL=()=>S.touch?16:10;
const unit=v=>{const n=Math.hypot(v[0],v[1]);return n>1e-12?[v[0]/n,v[1]/n]:null;};
const igual=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&Math.abs(a[0]-b[0])<1e-9&&Math.abs(a[1]-b[1])<1e-9;
function begin(L,ring,vi,closed){
  end();context=[L,ring,vi,closed];
  if(!on)return false;
  if(!L||L.gtype==='point'||!Array.isArray(ring)||ring.length<2)return false;
  const len=ring.length,dup=!!closed&&len>2&&igual(ring[0],ring[len-1]),n=dup?len-1:len;
  const v=dup&&vi===len-1?0:vi;if(v<0||v>=n)return false;
  const V=ring[v],guides=[];
  const prev=v>0?v-1:(closed?n-1:-1),next=v<n-1?v+1:(closed?0:-1);
  const add=(o,d,kind)=>{if(!d)return;
    // não repete a mesma reta (mesma origem, mesma direção a menos de ~0,5°)
    if(guides.some(x=>igual(x.o,o)&&Math.abs(x.d[0]*d[1]-x.d[1]*d[0])<0.009))return;
    guides.push({o:[o[0],o[1]],d,kind});};
  for(const [k,outro] of [[prev,prev>0?prev-1:(closed?n-1:-1)],[next,next<n-1&&next>=0?next+1:(closed?0:-1)]]){
    if(k<0||k===v)continue;const N=ring[k];
    const original=unit([V[0]-N[0],V[1]-N[1]]);
    add(N,original,'paralela');
    // Normal to the original edge, through the vertex's original position.
    // Keep this fixed while dragging, rather than rotating it with the cursor.
    if(original)add(V,[-original[1],original[0]],'perpendicular');
    if(outro>=0&&outro!==v&&outro!==k){const M=ring[outro],e=unit([N[0]-M[0],N[1]-M[1]]);if(e)add(N,[-e[1],e[0]],'perpendicular');}
  }
  if(!guides.length)return false;
  return install(L.crs,guides);
}
function install(crs,guides){
  g={crs,guides,group:L2.layerGroup().addTo(map),paths:[],active:[],point:null,label:null,labelText:null};
  map.on('move zoom resize',refreshLines);
  refreshLines();desenha([],null);return true;
}
function beginDrawing(L,buf){
 if(!L||!buf?.length){endDrawing();return false;}
 const key=[S.projectId,L.id,L.crs,buf.length,...buf[0],...(buf.at(-2)||[]),...buf.at(-1)].join('|');
 if(context?.drawing&&context.key===key)return !!g;
 end();context={drawing:true,L,buf:buf.map(p=>p.slice()),key};if(!on)return false;
 const points=buf.map(p=>fromWGS(L.crs,p[1],p[0])),anchor=points.at(-1),guides=[];
 const add=(o,d,kind)=>{if(d&&!guides.some(q=>igual(q.o,o)&&Math.abs(q.d[0]*d[1]-q.d[1]*d[0])<.009))guides.push({o:o.slice(),d,kind});};
 add(anchor,[1,0],'paralela');add(anchor,[0,1],'perpendicular');
 if(points.length>1){const p=points.at(-2),d=unit([anchor[0]-p[0],anchor[1]-p[1]]);add(anchor,d,'paralela');if(d)add(anchor,[-d[1],d[0]],'perpendicular');add(points[0],[1,0],'paralela');add(points[0],[0,1],'perpendicular');}
 return install(L.crs,guides);
}
function endDrawing(){if(context?.drawing)end();}
function ll(p){const w=toWGS(g.crs,p[0],p[1]);return L2.latLng(w[1],w[0]);}
function px(p){return map.latLngToContainerPoint(ll(p));}
// The guide model is fixed during a drag. Keep Leaflet paths alive; only
// recolor changed constraints and move the existing label on pointer events.
function refreshLines(){
  if(!g||!on)return;
  const sz=map.getSize(),c=map.getCenter(),cp=map.latLngToContainerPoint(c),
    q=map.containerPointToLatLng(cp.add([Math.hypot(sz.x,sz.y),0])),a=fromWGS(g.crs,c.lng,c.lat),b=fromWGS(g.crs,q.lng,q.lat),
    comp=Math.hypot(b[0]-a[0],b[1]-a[1])||1;
  g.guides.forEach((gu,i)=>{
    const coords=[ll([gu.o[0]-gu.d[0]*comp,gu.o[1]-gu.d[1]*comp]),ll([gu.o[0]+gu.d[0]*comp,gu.o[1]+gu.d[1]*comp])];
    if(g.paths[i])g.paths[i].setLatLngs(coords);
    else g.paths[i]=L2.polyline(coords,{pane:'alagis_desenho',interactive:false,color:gu.kind==='paralela'?'#37c0aa':'#8fb3c9',weight:1.2,opacity:.6,dashArray:'4 6'}).addTo(g.group);
  });
}
function desenha(ativas,ponto){
  if(!g||!on)return;
  g.guides.forEach((gu,i)=>{const active=ativas.includes(i);if(active===g.active.includes(i))return;
    g.paths[i].setStyle({color:active?'#f5a524':gu.kind==='paralela'?'#37c0aa':'#8fb3c9',weight:active?2:1.2,opacity:active?.95:.6,dashArray:active?'8 4':'4 6'});
  });g.active=ativas.slice();g.point=ponto;
  if(ponto&&ativas.length){
    const txt=ativas.map(i=>g.guides[i].kind==='paralela'?'paralela':'90°').join(' + ');
    if(!g.label)g.label=L2.marker(ll(ponto),{interactive:false,keyboard:false});
    if(g.labelText!==txt){g.label.setIcon(L2.divIcon({className:'',iconSize:null,
      html:'<div class="gm-vguide-txt" style="transform:translate(12px,-28px);white-space:nowrap;background:#112338;color:#fff;border:1px solid #f5a524;border-radius:5px;padding:1px 6px;font:600 11px Signika,sans-serif">'+txt+'</div>'}));g.labelText=txt;}
    g.label.setLatLng(ll(ponto));if(!g.group.hasLayer(g.label))g.group.addLayer(g.label);
  }else if(g.label&&g.group.hasLayer(g.label))g.group.removeLayer(g.label);
}
function apply(latlng){
  if(!on||!g)return {latlng,guided:false};
  if(S.snapOn===false){desenha([],null);return {latlng,guided:false};}
  const p=fromWGS(g.crs,latlng.lng,latlng.lat),cp=map.latLngToContainerPoint(latlng),cand=[];
  if(S.snapOn!==false)g.guides.forEach((gu,i)=>{
    const t=(p[0]-gu.o[0])*gu.d[0]+(p[1]-gu.o[1])*gu.d[1],q=[gu.o[0]+gu.d[0]*t,gu.o[1]+gu.d[1]*t],qp=px(q),dist=Math.hypot(qp.x-cp.x,qp.y-cp.y);
    if(dist<=TOL())cand.push({i,q,dist});});
  let out=null,ativas=[];
  if(cand.length){
    cand.sort((a,b)=>a.dist-b.dist);
    for(let x=0;x<cand.length&&!out;x++)for(let y=x+1;y<cand.length&&!out;y++){
      const A=g.guides[cand[x].i],B=g.guides[cand[y].i],den=A.d[0]*B.d[1]-A.d[1]*B.d[0];
      if(Math.abs(den)<1e-6)continue;
      const s=((B.o[0]-A.o[0])*B.d[1]-(B.o[1]-A.o[1])*B.d[0])/den,q=[A.o[0]+A.d[0]*s,A.o[1]+A.d[1]*s],qp=px(q);
      if(Math.hypot(qp.x-cp.x,qp.y-cp.y)<=TOL()){out=q;ativas=[cand[x].i,cand[y].i];}
    }
    if(!out){out=cand[0].q;ativas=[cand[0].i];}
  }
  desenha(ativas,out);
  return out?{latlng:ll(out),guided:true,kind:ativas.map(i=>g.guides[i].kind).join(' + ')}:{latlng,guided:false};
}
/* resolvedor único dos dois editores: ímã/ORTO primeiro; sem alvo deles, a guia */
function resolve(latlng,opts){
  const r=window.GeoMineOrtho?GeoMineOrtho.resolve(latlng,opts):{latlng,snapped:false};
  if(!on||!g)return r;
  if(r.snapped||r.orthogonal){desenha([],null);return r;}
  const q=apply(r.latlng);return q.guided?{...r,...q,snapped:false}:r;
}
function end(){context=null;if(g){try{map.off('move zoom resize',refreshLines);map.removeLayer(g.group);}catch(_){}g=null;}}
window.GeoMineVertexGuides={begin,beginDrawing,endDrawing,apply,resolve,end,setEnabled,enabled:()=>on,sync,active:()=>!!g,guides:()=>g?g.guides.map(x=>({o:x.o.slice(),d:x.d.slice(),kind:x.kind})):[]};
const button=document.getElementById('btnVertexGuides'),check=document.getElementById('snVertexGuides');
if(button)button.onclick=e=>{e.stopPropagation();setEnabled(!on);};
if(check)check.onchange=e=>setEnabled(e.target.checked);
sync();
})();
