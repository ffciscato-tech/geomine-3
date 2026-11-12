/* Independent numerical engine, also executed in a cancellable worker.
   MBA: Lee, Wolberg & Shin (1997), basic multilevel bicubic approximation.
   Ordinary kriging: isotropic semivariogram system, exact sample values.
   References and parameter conventions: geostatistics-methods.md. */
(function(root){
'use strict';
function factory(){
 const finite=Number.isFinite;
 function prepare(input){
  const points=[],seen=new Map();let invalid=0,duplicates=0;
  for(const p of input){if(!p||!['x','y','z'].every(k=>finite(p[k]))){invalid++;continue;}
   const key=p.x+','+p.y,old=seen.get(key);if(old){if(old.z!==p.z)throw Error('Há valores diferentes na mesma coordenada XY. Resolva as amostras coincidentes antes de interpolar.');duplicates++;continue;}
   const q={x:p.x,y:p.y,z:p.z,id:points.length};seen.set(key,q);points.push(q);
  }
  if(!points.length)throw Error('Nenhuma amostra numérica válida.');
  let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity,mean=0,m2=0,n=0;
  for(const p of points){xmin=Math.min(xmin,p.x);xmax=Math.max(xmax,p.x);ymin=Math.min(ymin,p.y);ymax=Math.max(ymax,p.y);n++;const d=p.z-mean;mean+=d/n;m2+=d*(p.z-mean);}
  const values=points.map(p=>p.z).sort((a,b)=>a-b),quantile=q=>{const x=(values.length-1)*q,i=Math.floor(x);return values[i]+(values[Math.min(i+1,values.length-1)]-values[i])*(x-i);};
  const variance=n>1?m2/(n-1):0,bins=Array(12).fill(0),min=values[0],max=values.at(-1);
  for(const v of values)bins[Math.min(11,Math.floor((v-min)/(max-min||1)*12))]++;
  return {points,bounds:{xmin,ymin,xmax,ymax},hull:hull(points),stats:{count:n,invalid,duplicates,min,max,mean,variance,std:Math.sqrt(variance),q1:quantile(.25),median:quantile(.5),q3:quantile(.75),histogram:bins}};
 }
 function cross(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
 function hull(points){const a=[...points].sort((a,b)=>a.x-b.x||a.y-b.y);if(a.length<3)return a;const lower=[],upper=[];
  for(const p of a){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
  for(let i=a.length-1;i>=0;i--){const p=a[i];while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
  return lower.slice(0,-1).concat(upper.slice(0,-1));
 }
 function inside(poly,x,y){if(poly.length<3)return false;const q={x,y};for(let i=0;i<poly.length;i++)if(cross(poly[i],poly[(i+1)%poly.length],q)<-1e-8)return false;return true;}
 function tree(points,depth=0){if(!points.length)return null;const axis=depth%2?'y':'x',a=[...points].sort((a,b)=>a[axis]-b[axis]||a.id-b.id),i=a.length>>1;return {p:a[i],axis,left:tree(a.slice(0,i),depth+1),right:tree(a.slice(i+1),depth+1)};}
 function nearest(node,x,y,k,radius=0){const best=[],r2=radius>0?radius*radius:Infinity;
  function visit(t){if(!t)return;const dx=x-t.p.x,dy=y-t.p.y,d2=dx*dx+dy*dy;
   if(d2<=r2){best.push({p:t.p,d2});best.sort((a,b)=>a.d2-b.d2||a.p.id-b.p.id);if(best.length>k)best.pop();}
   const d=(t.axis==='x'?x:y)-t.p[t.axis],first=d<0?t.left:t.right,second=d<0?t.right:t.left;visit(first);
   if(d*d<=Math.min(r2,best.length===k?best.at(-1).d2:Infinity))visit(second);
  }visit(node);return best;
 }
 function gamma(h,o){if(h===0)return 0;const t=h/o.range,p=o.sill-o.nugget;
  return o.nugget+p*(o.model==='exponential'?1-Math.exp(-3*t):o.model==='gaussian'?1-Math.exp(-49*t*t/16):t>=1?1:1.5*t-.5*t*t*t);
 }
 function lu(matrix){const a=matrix.map(r=>Float64Array.from(r)),n=a.length,piv=Array.from({length:n},(_,i)=>i);
  for(let k=0;k<n;k++){let p=k;for(let i=k+1;i<n;i++)if(Math.abs(a[i][k])>Math.abs(a[p][k]))p=i;
   if(Math.abs(a[p][k])<1e-12)throw Error('Sistema de krigagem singular: confira amostras e variograma.');
   [a[k],a[p]]=[a[p],a[k]];[piv[k],piv[p]]=[piv[p],piv[k]];
   for(let i=k+1;i<n;i++){a[i][k]/=a[k][k];for(let j=k+1;j<n;j++)a[i][j]-=a[i][k]*a[k][j];}
  }
  return b=>{const x=Float64Array.from(piv,i=>b[i]);for(let i=0;i<n;i++)for(let j=0;j<i;j++)x[i]-=a[i][j]*x[j];for(let i=n-1;i>=0;i--){for(let j=i+1;j<n;j++)x[i]-=a[i][j]*x[j];x[i]/=a[i][i];}return x;};
 }
 function basis(t){const t2=t*t,t3=t2*t;return [(1-t)**3/6,(3*t3-6*t2+4)/6,(-3*t3+3*t2+3*t+1)/6,t3/6];}
 function support(x,y,step,b){const u=(x-b.xmin)/step,v=(y-b.ymin)/step,i=Math.floor(u),j=Math.floor(v),bx=basis(u-i),by=basis(v-j),a=[];
  for(let k=0;k<4;k++)for(let l=0;l<4;l++)a.push({key:(i+k)+','+(j+l),w:bx[k]*by[l]});return a;
 }
 function spline(data,o,progress){
  if(!(o.spacing>0)||!Number.isInteger(o.levels)||o.levels<1||o.levels>12||!(o.tolerance>=0))throw Error('Informe espaçamento inicial positivo, 1–12 níveis e tolerância não negativa.');
  const layers=[],residual=Float64Array.from(data.points,p=>p.z-data.stats.mean);let maxResidual=Infinity,rmse=Infinity;
  for(let level=0;level<o.levels;level++){const step=o.spacing/2**level,acc=new Map();
   for(let p=0;p<data.points.length;p++){const q=data.points[p],a=support(q.x,q.y,step,data.bounds),norm=a.reduce((s,v)=>s+v.w*v.w,0);
    for(const v of a){let cell=acc.get(v.key);if(!cell){cell=[0,0];acc.set(v.key,cell);}cell[0]+=v.w**3*residual[p]/norm;cell[1]+=v.w*v.w;}
   }
   const controls=new Map([...acc].map(([k,v])=>[k,v[1]?v[0]/v[1]:0]));layers.push({step,controls});let sum=0;maxResidual=0;
   for(let p=0;p<data.points.length;p++){const q=data.points[p];residual[p]-=support(q.x,q.y,step,data.bounds).reduce((s,v)=>s+v.w*(controls.get(v.key)||0),0);sum+=residual[p]**2;maxResidual=Math.max(maxResidual,Math.abs(residual[p]));}
   rmse=Math.sqrt(sum/data.points.length);progress?.({phase:'spline',level:level+1,total:o.levels});if(maxResidual<=o.tolerance)break;
  }
  return {fit:{levels:layers.length,maxResidual,rmse,toleranceReached:maxResidual<=o.tolerance},at(x,y){let z=data.stats.mean;for(const layer of layers)z+=support(x,y,layer.step,data.bounds).reduce((s,v)=>s+v.w*(layer.controls.get(v.key)||0),0);return {z,variance:NaN};}};
 }
 function estimator(data,o={},progress){
  if(o.method==='spline')return spline(data,o,progress);
  if(!['idw','nearest','kriging'].includes(o.method))throw Error('Método de interpolação inválido.');
  const k=o.method==='nearest'?1:Number(o.neighbors??12),minimum=o.method==='nearest'?1:Number(o.minimum??1),radius=Number(o.radius??0);
  if(!Number.isInteger(k)||k<1||k>64||!Number.isInteger(minimum)||minimum<1||minimum>k||!finite(radius)||radius<0)throw Error('Confira vizinhos, mínimo de amostras e raio de busca.');
  if(o.method==='kriging'&&(!['spherical','exponential','gaussian'].includes(o.model)||!finite(o.range)||o.range<=0||!finite(o.sill)||!finite(o.nugget)||o.sill<=0||o.nugget<0||o.nugget>=o.sill))throw Error('Krigagem: alcance > 0 e patamar total > pepita ≥ 0 são obrigatórios.');
  const index=tree(data.points),cache=new Map();
  return {at(x,y){const n=nearest(index,x,y,k,radius);if(!n.length)return {z:NaN,variance:NaN};if(n[0].d2===0||o.method==='nearest')return {z:n[0].p.z,variance:o.method==='kriging'?0:NaN};if(n.length<minimum)return {z:NaN,variance:NaN};
   if(o.method==='idw'){let sum=0,weights=0;for(const q of n){const w=n[0].d2/q.d2;sum+=w*q.p.z;weights+=w;}return {z:sum/weights,variance:NaN};}
   n.sort((a,b)=>a.p.id-b.p.id);const key=n.map(q=>q.p.id).join(','),N=n.length;let solve=cache.get(key);
   if(!solve){const a=Array.from({length:N+1},()=>Array(N+1).fill(1));a[N][N]=0;for(let i=0;i<N;i++)for(let j=0;j<N;j++)a[i][j]=gamma(Math.hypot(n[i].p.x-n[j].p.x,n[i].p.y-n[j].p.y),o)/o.sill;solve=lu(a);if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(key,solve);}
   const b=n.map(q=>gamma(Math.sqrt(q.d2),o)/o.sill);b.push(1);const w=solve(b);let z=0,v=w[N];for(let i=0;i<N;i++){z+=w[i]*n[i].p.z;v+=w[i]*b[i];}if(!finite(z)||v< -1e-7)throw Error('Resultado instável da krigagem. Confira o variograma.');return {z,variance:Math.max(0,v*o.sill)};
  }};
 }
 function variogram(data,o={}){const bins=Number(o.bins??12),b=data.bounds,maxLag=Number(o.maxLag??Math.hypot(b.xmax-b.xmin,b.ymax-b.ymin)/2);if(!Number.isInteger(bins)||bins<2||bins>100||!finite(maxLag)||maxLag<=0)throw Error('Variograma: informe distância máxima positiva e 2–100 classes.');
  const limit=1500,a=data.points.length<=limit?data.points:Array.from({length:limit},(_,i)=>data.points[Math.floor(i*(data.points.length-1)/(limit-1))]),out=Array.from({length:bins},()=>({pairs:0,distance:0,semivariance:0}));
  for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const d=Math.hypot(a[i].x-a[j].x,a[i].y-a[j].y);if(d>maxLag)continue;const v=out[Math.min(bins-1,Math.floor(d/maxLag*bins))];v.pairs++;v.distance+=d;v.semivariance+=(a[i].z-a[j].z)**2/2;}
  return {sampled:a.length,total:data.points.length,maxLag,bins:out.map((v,i)=>({index:i+1,pairs:v.pairs,distance:v.pairs?v.distance/v.pairs:(i+.5)*maxLag/bins,semivariance:v.pairs?v.semivariance/v.pairs:null}))};
 }
 function grid(data,o,progress){const cell=Number(o.cell);if(!finite(cell)||cell<=0)throw Error('A célula da superfície deve ser positiva.');if(o.clip!==false&&data.hull.length<3)throw Error('O limite das amostras exige pelo menos três pontos não colineares.');
  const b=data.bounds,xll=Math.floor(b.xmin/cell)*cell,yll=Math.floor(b.ymin/cell)*cell,nc=Math.max(1,Math.ceil((b.xmax-xll)/cell)),nr=Math.max(1,Math.ceil((b.ymax-yll)/cell)),count=nc*nr;
  if(!Number.isSafeInteger(count)||count>2000000)throw Error('A grade teria '+count.toLocaleString('pt-BR')+' células. Escolha uma célula maior; nenhuma resolução será alterada automaticamente.');
  const model=estimator(data,o,progress),z=new Float32Array(count),variance=o.method==='kriging'?new Float32Array(count):null;let valid=0;
  for(let row=0;row<nr;row++)for(let col=0;col<nc;col++){const i=row*nc+col,x=xll+(col+.5)*cell,y=yll+(nr-row-.5)*cell;
   const v=o.clip!==false&&!inside(data.hull,x,y)?{z:NaN,variance:NaN}:model.at(x,y);if(finite(v.z)){if(Math.abs(v.z)>3.402823466e38)throw Error('Valor fora do intervalo Float32.');valid++;}z[i]=v.z;if(variance)variance[i]=v.variance;if(i%2048===0)progress?.({phase:'grid',done:i,total:count});
  }
  if(!valid)throw Error('Nenhuma célula válida: confira a célula, o limite e o raio de busca.');return {nc,nr,cs:cell,xll,yll,z,variance,valid,fit:model.fit||null};
 }
 return {prepare,estimator,grid,variogram,gamma,inside};
}
root.GeoMineGeostatFactory=factory;root.GeoMineGeostatEngine=factory();
})(typeof window==='undefined'?globalThis:window);
