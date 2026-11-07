/* Plan dimensions: vector extension lines/arrows plus an explicit text anchor. */
(function(root){
'use strict';
const MODES={aligned:'Alinhada',horizontal:'Horizontal',vertical:'Vertical'},UNITS={m:1,cm:100,mm:1000};
const point=p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite);
function options(o={}){
 const v={mode:o.mode||'aligned',unit:o.unit||'m',decimals:o.decimals??2,height:o.height??1,arrow:o.arrow||'open',metersPerUnit:o.metersPerUnit??1};
 if(!['open','triangle','tick','dot','none'].includes(v.arrow)||!MODES[v.mode]||!Object.hasOwn(UNITS,v.unit)||!Number.isInteger(v.decimals)||v.decimals<0||v.decimals>4||!Number.isFinite(v.height)||v.height<=0||!Number.isFinite(v.metersPerUnit)||v.metersPerUnit<=0)throw Error('Confira o tipo, a unidade, a precisão e o tamanho das setas.');
 return v;
}
function build(a,b,c,input={}){
 const o=options(input);if(!point(a)||!point(b)||!point(c))throw Error('Ponto de cota inválido.');
 const dx=b[0]-a[0],dy=b[1]-a[1],distance=o.mode==='horizontal'?Math.abs(dx):o.mode==='vertical'?Math.abs(dy):Math.hypot(dx,dy);
 if(distance*o.metersPerUnit<1e-7)throw Error('Escolha dois pontos com distância diferente de zero nesta direção.');
 const u=o.mode==='horizontal'?[Math.sign(dx),0]:o.mode==='vertical'?[0,Math.sign(dy)]:[dx/distance,dy/distance],n=[-u[1],u[0]],h=o.height/o.metersPerUnit;
 const offset=(c[0]-a[0])*n[0]+(c[1]-a[1])*n[1],p=o.mode==='horizontal'?[a[0],c[1]]:o.mode==='vertical'?[c[0],a[1]]:[a[0]+n[0]*offset,a[1]+n[1]*offset],q=o.mode==='horizontal'?[b[0],c[1]]:o.mode==='vertical'?[c[0],b[1]]:[b[0]+n[0]*offset,b[1]+n[1]*offset];
 const meters=distance*o.metersPerUnit,value=meters*UNITS[o.unit],text=value.toFixed(o.decimals).replace('.',',')+' '+o.unit;
 const geom=[],add=(x,y)=>geom.push([x,y]),along=(v,d,side=0)=>[v[0]+u[0]*d+n[0]*side,v[1]+u[1]*d+n[1]*side];
 for(const [source,end] of [[a,p],[b,q]]){
  const d=Math.hypot(end[0]-source[0],end[1]-source[1]);if(d<1e-9)continue;
  const v=[(end[0]-source[0])/d,(end[1]-source[1])/d],gap=Math.min(h*.25,d*.3);
  add([source[0]+v[0]*gap,source[1]+v[1]*gap],[end[0]+v[0]*h*.4,end[1]+v[1]*h*.4]);
 }
 const arrow=h*.8,outside=distance<arrow*3,sign=outside?-1:1;
 add(outside?along(p,-arrow*1.4):p,outside?along(q,arrow*1.4):q);
 for(const [tip,direction] of [[p,sign],[q,-sign]]){
  const wing1=along(tip,direction*arrow,h*.22),wing2=along(tip,direction*arrow,-h*.22);
  if(o.arrow==='open'){add(tip,wing1);add(tip,wing2);}
  else if(o.arrow==='triangle')geom.push([tip,wing1,wing2,tip]);
  else if(o.arrow==='tick')add(along(tip,-h*.28,-h*.28),along(tip,h*.28,h*.28));
  else if(o.arrow==='dot')geom.push(Array.from({length:17},(_,i)=>along(tip,Math.cos(i*Math.PI/8)*h*.16,Math.sin(i*Math.PI/8)*h*.16)));
 }
 const flip=u[0]<-1e-12||(Math.abs(u[0])<=1e-12&&u[1]<0),tu=flip?[-u[0],-u[1]]:u,tn=[-tu[1],tu[0]];
 const textPoint=[(p[0]+q[0])/2+tn[0]*h*.85,(p[1]+q[1])/2+tn[1]*h*.85],textAngle=Math.atan2(-tu[1],tu[0])*180/Math.PI;
 if(!geom.every(r=>r.every(point)))throw Error('Não foi possível desenhar esta cota.');
 return {geom,multi:true,props:{DIM_CAD:'v1',TIPO:MODES[o.mode],DIST_M:meters,MEDIDA:value,UNIDADE:o.unit,TEXTO:text,DECIMAIS:o.decimals,ALT_TXT_M:o.height,SETA:o.arrow,TXT_X:textPoint[0],TXT_Y:textPoint[1],ANGULO:textAngle,A_X:a[0],A_Y:a[1],B_X:b[0],B_Y:b[1],POS_X:c[0],POS_Y:c[1]},dimension:{p,q,offset,text,textPoint,textAngle}};
}
root.GeoMineDimensionGeometry={build,options,MODES,UNITS};
})(typeof window==='undefined'?globalThis:window);
