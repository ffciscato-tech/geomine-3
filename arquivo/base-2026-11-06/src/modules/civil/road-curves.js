/* Circular fillets, tangent to the adjoining straights. Never reduce the
   requested radius to make a corner fit. Coordinates remain in metres. */
function civCurvasTangentes(input,radius,spacing=2,preserve=false){
 if(!(radius>0))throw Error('Informe um raio de curva positivo.');
 // Remove grid-scale zigzags within a bounded corridor before fitting arcs.
 // The caller rechecks terrain coverage and grade on the resulting axis.
 const simplify=(ps)=>{
  if(ps.length<3)return ps;
  const a=ps[0],b=ps.at(-1),dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy;let far=0,index=0;
  for(let i=1;i<ps.length-1;i++){const p=ps[i],t=d2?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/d2)):0,d=Math.max(Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy),Math.abs(p.z-a.z-t*(b.z-a.z))*radius/.15);if(d>far){far=d;index=i;}}
  if(far<=radius/3)return [a,b];
  return [...simplify(ps.slice(0,index+1)).slice(0,-1),...simplify(ps.slice(index))];
 };
 const pts=preserve?input.map(p=>({...p})):simplify(input.map(p=>({...p})));
 for(let i=1;i<pts.length-1;){
  const a=pts[i-1],b=pts[i],c=pts[i+1],u=[b.x-a.x,b.y-a.y],v=[c.x-b.x,c.y-b.y];
  const fraction=Math.hypot(...u)/(Math.hypot(...u)+Math.hypot(...v));
  if(Math.abs(b.z-a.z-fraction*(c.z-a.z))<1e-8&&Math.abs(u[0]*v[1]-u[1]*v[0])<1e-7*Math.hypot(...u)*Math.hypot(...v)&&u[0]*v[0]+u[1]*v[1]>0)pts.splice(i,1);else i++;
 }
 const turns=pts.map(()=>null);
 for(let i=1;i<pts.length-1;i++){
  const a=pts[i-1],b=pts[i],c=pts[i+1],l1=Math.hypot(b.x-a.x,b.y-a.y),l2=Math.hypot(c.x-b.x,c.y-b.y);
  const u=[(b.x-a.x)/l1,(b.y-a.y)/l1],v=[(c.x-b.x)/l2,(c.y-b.y)/l2],angle=Math.acos(Math.max(-1,Math.min(1,u[0]*v[0]+u[1]*v[1])));
  if(angle<1e-8)continue;
  const sign=Math.sign(u[0]*v[1]-u[1]*v[0]),t=radius*Math.tan(angle/2);
  if(!sign||!Number.isFinite(t)||t>=Math.min(l1,l2))throw Error('Não há espaço para uma curva de '+radius+' m no vértice '+i+'. Ajuste o traçado; o raio não foi reduzido.');
  const entry={x:b.x-u[0]*t,y:b.y-u[1]*t,z:b.z+(a.z-b.z)*t/l1},exit={x:b.x+v[0]*t,y:b.y+v[1]*t,z:b.z+(c.z-b.z)*t/l2};
  turns[i]={entry,exit,t,angle,sign,cx:entry.x-sign*u[1]*radius,cy:entry.y+sign*u[0]*radius};
 }
 for(let i=1;i<pts.length;i++)if((turns[i-1]?.t||0)+(turns[i]?.t||0)>Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y)-1e-6)throw Error('Curvas consecutivas não comportam o raio de '+radius+' m. Afaste os vértices do traçado.');
 const result=[{...pts[0]}],lineTo=p=>{
  const a=result.at(-1),d=Math.hypot(p.x-a.x,p.y-a.y),n=Math.max(1,Math.ceil(d/spacing));
  if(d<1e-7)return;
  for(let k=1;k<=n;k++)result.push({x:a.x+(p.x-a.x)*k/n,y:a.y+(p.y-a.y)*k/n,z:a.z+(p.z-a.z)*k/n});
 };
 for(let i=1;i<pts.length-1;i++){
  const q=turns[i];if(!q){lineTo(pts[i]);continue;}lineTo(q.entry);
  const a0=Math.atan2(q.entry.y-q.cy,q.entry.x-q.cx),n=Math.max(2,Math.ceil(q.angle*radius/spacing),Math.ceil(q.angle/.025));
  for(let k=1;k<=n;k++){const a=a0+q.sign*q.angle*k/n;result.push({x:q.cx+radius*Math.cos(a),y:q.cy+radius*Math.sin(a),z:q.entry.z+(q.exit.z-q.entry.z)*k/n});}
 }
 lineTo(pts.at(-1));return {points:result,controls:pts,curves:turns.filter(Boolean),radius};
}
