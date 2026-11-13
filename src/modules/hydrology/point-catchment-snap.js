/* Pick the closest visible flow line at the tap's station, not the largest
   basin in a search circle. Projection is perpendicular to the picked segment;
   the chosen point and displacement are returned for display and auditing. */
(function(root){
'use strict';
function scan(layers,point,tolerance,project,visible,accept){
  let best=null;
  for(const layer of layers){
    if(layer.visible===false||layer.gtype!=='line'||!accept(layer))continue;
    for(let index=0;index<(layer.features||[]).length;index++){
      const f=layer.features[index];if(!visible(layer,f))continue;
      const parts=f.multi?f.geom:[f.geom];
      for(const part of parts||[]){
        if(!Array.isArray(part))continue;
        for(let i=1;i<part.length;i++){
          const a=project(part[i-1],layer),b=project(part[i],layer);
          if(!a||!b||![...a.slice(0,2),...b.slice(0,2)].every(Number.isFinite))continue;
          if(point[0]<Math.min(a[0],b[0])-tolerance||point[0]>Math.max(a[0],b[0])+tolerance||point[1]<Math.min(a[1],b[1])-tolerance||point[1]>Math.max(a[1],b[1])+tolerance)continue;
          const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;if(!length)continue;
          const t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length)),q=[a[0]+t*dx,a[1]+t*dy],distance=Math.hypot(q[0]-point[0],q[1]-point[1]);
          if(distance>tolerance||best&&distance>=best.distance-1e-7)continue;
          best={point:q,distance,layer,index,segment:i-1,t};
        }
      }
    }
  }
  return best;
}
/* Linhas de drenagem (pelo nome) e a camada selecionada têm preferência: uma
   curva de nível mais perto do dedo não rouba o ponto. Não havendo nenhuma
   delas ao alcance, vale a linha visível mais próxima, qualquer que seja o
   nome da camada. */
const DRAINAGE=/fluxo|dren|talveg|rio|curso|hidro|flow|stream|canal|c[oó]rrego/i;
function nearest(layers,point,{tolerance=3,project=p=>p,selected=null,visible=()=>true}={}){
  const preferred=layer=>layer===selected||DRAINAGE.test(layer.name||'');
  return scan(layers,point,tolerance,project,visible,preferred)||scan(layers,point,tolerance,project,visible,layer=>!preferred(layer));
}
root.GeoMineCatchmentSnap={nearest};
})(typeof window!=='undefined'?window:globalThis);
