/* Régua por pontos: conserva a origem e o Z do encaixe, sem confundir
   cota ausente com zero nem substituir geometria 3D por cota do MDT. */
(function(){
'use strict';
let revision=0;
const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(+v)?+v:NaN;
function hitZ(hit){
 const f=hit?.f;if(!f)return NaN;
 const part=snapRingPartsOf(hit.L,f)[hit.ringIndex||0];
 const ring=hit.sourceRing||part?.ring||[],sourceIndex=hit.sourceRingIndex??part?.sourceRingIndex??hit.ringIndex??0;
 const zz=f.zg,zs=Array.isArray(zz?.[0])?zz[sourceIndex]:zz;
 const zAt=i=>{const z=number(Array.isArray(zs)?zs[i]:zs);return Number.isFinite(z)?z:number(ring[i]?.[2]);};
 if(hit.vertexIndex!=null)return zAt(hit.vertexIndex);
 if(hit.segIndex==null)return NaN;
 const i=hit.segIndex,j=i+1<ring.length?i+1:0;
 let t=number(hit.t);if(!Number.isFinite(t))t=0;
 // Interpolação no CRS da própria linha, não em pixels/Web Mercator.
 if(hit.latlng&&ring[i]&&ring[j]){
  const p=fromWGS(hit.L.crs,hit.latlng.lng,hit.latlng.lat),a=ring[i],b=ring[j];
  const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy;
  if(d)t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d));
 }
 const a=zAt(i),b=zAt(j);
 if(t<=1e-8)return a;if(t>=1-1e-8)return b;
 return Number.isFinite(a)&&Number.isFinite(b)?a+(b-a)*t:NaN;
}
function snap(latlng){
 if(!document.getElementById('mbSnap')?.checked)return null;
 const tol=S.touch?SNAP_PX*1.7:SNAP_PX,p=map.latLngToContainerPoint(latlng);
 const edge=map.containerPointToLatLng([p.x+tol,p.y+tol]),dLat=Math.abs(edge.lat-latlng.lat)*1.7,dLng=Math.abs(edge.lng-latlng.lng)*1.7;
 let best=null,bd=tol*tol;
 // Vértices têm precedência; a referência acompanha a posição escolhida.
 for(const L of S.layers||[]){
  if(L.visible===false)continue;
  for(const e of snapCacheOf(L).refs||[]){
   if(e.maxLat<latlng.lat-dLat||e.minLat>latlng.lat+dLat||e.maxLng<latlng.lng-dLng||e.minLng>latlng.lng+dLng)continue;
   if(typeof featureVisible==='function'&&!featureVisible(L,e.f))continue;
   for(let i=0;i<e.ll.length;i+=2){
    if(!Number.isFinite(e.ll[i])||!Number.isFinite(e.ll[i+1]))continue;
    const ll=L2.latLng(e.ll[i],e.ll[i+1]),q=map.latLngToContainerPoint(ll),d=(q.x-p.x)**2+(q.y-p.y)**2;
    if(d<=bd){bd=d;best={L,f:e.f,idx:e.idx,ringIndex:e.ringIndex,sourceRing:e.sourceRing,sourceRingIndex:e.sourceRingIndex,vertexIndex:i/2,latlng:ll,kind:'vértice',snapped:true};}
   }
  }
 }
 if(!best){
  best=feicaoMaisProximaPx(latlng,tol,true);
  if(best){
   const f=best.f,ring=best.sourceRing||snapRingsOf(best.L,f)[best.ringIndex||0];
   const a=ring[best.segIndex],b=ring[(best.segIndex+1)%ring.length],p=fromWGS(best.L.crs,latlng.lng,latlng.lat);
   const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;
   const ll=toWGS(best.L.crs,a[0]+t*dx,a[1]+t*dy);best.latlng=L2.latLng(ll[1],ll[0]);best.t=t;
  }
 }
 if(best)best.z=hitZ(best);
 return best;
}
function clear(){revision++;S.meas.pointRefs=[];S.meas.pointResult=null;}
function click(latlng){
 const hit=snap(latlng),ll=hit?.latlng||latlng;
 (S.meas.pointRefs||(S.meas.pointRefs=[])).push(hit?{z:hit.z,source:hit.L.name}:null);
 S.meas.buf.push([ll.lat,ll.lng]);redrawMeas();void updateMeas();
}
function metrics(a,b,za,zb){
 const d2=Math.hypot(b[0]-a[0],b[1]-a[1]),valid=Number.isFinite(za)&&Number.isFinite(zb),dz=valid?zb-za:NaN;
 return {d2,za,zb,dz,d3:valid?Math.hypot(d2,dz):NaN,
  decl:valid&&d2>1e-8?100*dz/d2:NaN,
  graus:valid?(d2>1e-8?Math.atan2(dz,d2)*180/Math.PI:Math.abs(dz)>1e-8?Math.sign(dz)*90:NaN):NaN};
}
async function update(){
 const token=++revision,B=S.meas.buf.slice(),refs=(S.meas.pointRefs||[]).slice(),project=S.projectId;
 const out=document.getElementById('mbOut');if(!out)return;
 if(B.length<2){out.textContent=B.length?'Ponto 1 marcado'+(Number.isFinite(refs[0]?.z)?' · Z inicial '+refs[0].z.toFixed(2)+' m':'')+'. Clique no próximo.':measInstrucao();document.getElementById('mbMode').textContent='2D';return;}
 const P=B.map(([lat,lng])=>fromWGS(S.workCRS,lng,lat)),needsSource=P.some((_,i)=>!Number.isFinite(refs[i]?.z));
 const r=needsSource?measRaster():null,lidar=needsSource?measLidar():null;let g=null;
 // Grade de trecho (MDT grande) só cobre a linha anterior: relê a cada atualização.
 if(r){try{g=S.meas.gridId===r.id&&S.meas.grid&&!S.meas.grid._trecho?S.meas.grid:await gridProd(r,'medir sobre a superfície',[P]);}catch(e){if(token===revision)toast('Não foi possível obter as cotas do MDT: '+(e?.message||e));}
  if(token!==revision||project!==S.projectId||B.length!==S.meas.buf.length)return;
  S.meas.grid=g;S.meas.gridId=r.id;
 }
 const sources=[],z=P.map((p,i)=>{
  if(Number.isFinite(refs[i]?.z)){sources.push(refs[i].source+' (vetor 3D)');return refs[i].z;}
  if(g){sources.push('MDT: '+r.name);return number(sampleZbil(g,p[0],p[1]));}
  if(lidar){sources.push('LiDAR: '+lidar.name);return number(measZLidar(lidar,p[0],p[1]));}
  sources.push('sem cota');return NaN;
 });
 const segs=P.slice(1).map((b,j)=>{
  const sg=metrics(P[j],b,z[j],z[j+1]);sg.i=j+1;
  // Só drapeia quando ambos os extremos vieram do mesmo MDT.
  if(g&&!Number.isFinite(refs[j]?.z)&&!Number.isFinite(refs[j+1]?.z)){
   const dr=drapeSeg(g,P[j],b);sg.d3=dr.semZ?NaN:dr.L3;
  }
  return sg;
 });
 S.meas.pointResult={segs,sources};
 const full=segs.every(s=>Number.isFinite(s.d3)),any=z.some(Number.isFinite),total=segs.reduce((s,q)=>s+q.d2,0),total3=full?segs.reduce((s,q)=>s+q.d3,0):NaN;
 const f=(v,unit='',signed=false)=>Number.isFinite(v)?(signed&&v>0?'+':'')+v.toFixed(2)+unit:'—';
 const row=(a,b)=>'<span>'+a+'</span><b>'+b+'</b>';
 let summary=row('Distância horizontal',esc(fmtLen(total)))+row('Z inicial',f(z[0],' m'))+row('Z final',f(z.at(-1),' m'));
 const dz=Number.isFinite(z[0])&&Number.isFinite(z.at(-1))?z.at(-1)-z[0]:NaN;
 if(any)summary+=row('Distância 3D',f(total3,' m'))+row('Desnível início → fim',f(dz,' m',true))+row('Declividade média',f(total>1e-8?100*dz/total:NaN,' %',true));
 let detail='';
 if(segs.length===1){summary+=row('Declividade',f(segs[0].decl,' %',true))+row('Inclinação',f(segs[0].graus,'°',true));}
 else detail='<div class="meas-seg" style="max-height:180px;margin:0 0 8px"><table><thead><tr><th>Trecho</th><th>Z inicial</th><th>Z final</th><th>Declividade</th></tr></thead><tbody>'+segs.map(s=>'<tr><td>'+s.i+'</td><td>'+f(s.za,' m')+'</td><td>'+f(s.zb,' m')+'</td><td>'+f(s.decl,' %',true)+'<br>'+f(s.graus,'°',true)+'</td></tr><tr><td colspan="4">2D: '+f(s.d2,' m')+' · 3D: '+f(s.d3,' m')+' · ΔZ: '+f(s.dz,' m',true)+'</td></tr>').join('')+'</tbody></table></div>';
 out.innerHTML='<div class="meas-title">DISTÂNCIA POR PONTOS</div><div class="meas-points">'+B.length+' pontos · '+segs.length+' trechos</div>'+detail+'<div class="meas-grid">'+summary+'</div><div class="meas-note">'+sources.map((s,i)=>'P'+(i+1)+': '+esc(s)).join('<br>')+'<br>Declividade = ΔZ ÷ distância horizontal. Nos vetores, mede os segmentos entre os pontos marcados; não acompanha automaticamente as curvas da linha. Z em metros; — indica dado indisponível.</div>';
 document.getElementById('mbMode').textContent=any?(refs.some(q=>Number.isFinite(q?.z))?'Vetor 3D':'3D'):'2D';
 if(S.meas.totalLabel)S.measLayer.removeLayer(S.meas.totalLabel);
 S.meas.totalLabel=L2.marker(B.at(-1),{interactive:false,pane:'alagis_regua',icon:L2.divIcon({className:'',html:'<div class="meas-lbl">'+esc(fmtLen(full?total3:total))+(full?' (3D)':'')+'</div>',iconAnchor:[-8,8]})}).addTo(S.measLayer);
}
window.GeoMineRuler={hitZ,snap,click,clear,update,metrics};
})();
