/* Directed stream masks augment the local catchment without altering D8. */
(function(root){
'use strict';
const key=p=>p[0].toFixed(4)+','+p[1].toFixed(4);
function upstream(d,parts,point){
 const incoming=new Map();let closest=null;
 parts.forEach((p,index)=>{if(p.length<2)return;const end=key(p[p.length-1]);if(!incoming.has(end))incoming.set(end,[]);incoming.get(end).push(index);
  for(let j=1;j<p.length;j++){const a=p[j-1],b=p[j],dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/l)):0,xy=[a[0]+t*dx,a[1]+t*dy],distance=(xy[0]-point[0])**2+(xy[1]-point[1])**2;
   if(!closest||distance<closest.distance)closest={index,j,xy,distance};}
 });
 if(!closest||closest.distance>1e-6)return null;
 const chosen=parts[closest.index],prefix=chosen.slice(0,closest.j).concat([closest.xy]),included=new Set([closest.index]),queue=[key(chosen[0])];
 for(let i=0;i<queue.length;i++)for(const j of incoming.get(queue[i])||[]){if(included.has(j))continue;included.add(j);queue.push(key(parts[j][0]));}
 const N=d.nc*d.nr,seedsMask=new Uint8Array(N),blocked=new Uint8Array(N),cs=d.cs,cy=d.csy||cs,top=d.yll+d.nr*cy;
 function mark(path,mask){const one=p=>{const x=Math.floor((p[0]-d.xll)/cs),y=Math.floor((top-p[1])/cy);if(x>=0&&y>=0&&x<d.nc&&y<d.nr&&Number.isFinite(d.z[y*d.nc+x]))mask[y*d.nc+x]=1;};
  if(path.length)one(path[0]);for(let j=1;j<path.length;j++){const a=path[j-1],b=path[j],steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/(Math.min(cs,cy)*.4)));
   for(let s=1;s<=steps;s++)one([a[0]+s/steps*(b[0]-a[0]),a[1]+s/steps*(b[1]-a[1])]);}}
 for(let i=0;i<parts.length;i++)if(i===closest.index){mark(prefix,seedsMask);mark([closest.xy,...chosen.slice(closest.j)],blocked);}else mark(parts[i],included.has(i)?seedsMask:blocked);
 const seeds=[];for(let i=0;i<N;i++)if(seedsMask[i]){blocked[i]=0;seeds.push({col:i%d.nc,row:Math.floor(i/d.nc)});}
 return {seeds,blocked,parts:included.size};
}
root.GeoMineDrainageRouting={upstream};
})(typeof window!=='undefined'?window:globalThis);
