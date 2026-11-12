/* Pure boundary selection shared by the CAD hatch tool and its worker.
   Coordinates are XY in the caller's metric work CRS; source arrays are read-only. */
(function install(root){
'use strict';
const point=p=>p&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
const toleranceOf=v=>Number.isFinite(v)&&v>=0?v:1e-7;
const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
function closedCopy(raw,tolerance){
 if(!Array.isArray(raw)||raw.length<4)return null;
 const ring=[];
 for(const p of raw){if(!point(p))return null;const q=[p[0],p[1]];if(!ring.length||!same(q,ring.at(-1)))ring.push(q);}
 if(ring.length<4||Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])>tolerance)return null;
 ring[ring.length-1]=ring[0].slice();
 const unique=new Set();for(let i=0;i<ring.length-1&&unique.size<3;i++)unique.add(ring[i][0]+','+ring[i][1]);
 return unique.size>=3?ring:null;
}
function closedRings(f,tolerance,partIdx){
 const g=f?.geom;if(!Array.isArray(g)||!g.length)return [];
 const nested=g.some(r=>Array.isArray(r)&&(Array.isArray(r[0])||ArrayBuffer.isView(r[0]))),parts=nested?g:[g],out=[],tol=toleranceOf(tolerance);
 for(let i=0;i<parts.length;i++){
  if(Number.isInteger(partIdx)&&partIdx!==i)continue;
  const ring=closedCopy(parts[i],tol);if(ring)out.push(ring);
 }
 return out;
}
function areaOf(ring){
 const o=ring[0];let sum=0;
 for(let i=0;i<ring.length-1;i++)sum+=(ring[i][0]-o[0])*(ring[i+1][1]-o[1])-(ring[i+1][0]-o[0])*(ring[i][1]-o[1]);
 return sum/2;
}
function extent(ring){
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const p of ring){if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1];}
 return [x0,y0,x1,y1];
}
function segmentDistance2(p,a,b){
 const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0;
 return (p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;
}
// -1 outside, 0 within boundary tolerance, 1 strictly inside.
function location(p,face,tolerance){
 const b=face.bounds;if(p[0]<b[0]-tolerance||p[0]>b[2]+tolerance||p[1]<b[1]-tolerance||p[1]>b[3]+tolerance)return -1;
 const r=face.ring,t2=tolerance*tolerance;let inside=false;
 for(let i=0;i<r.length-1;i++){
  const a=r[i],b=r[i+1];if(segmentDistance2(p,a,b)<=t2)return 0;
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside?1:-1;
}
function containsFace(parent,child,tolerance){
 const a=parent.bounds,b=child.bounds;
 if(child.area>=parent.area||b[0]<a[0]-tolerance||b[1]<a[1]-tolerance||b[2]>a[2]+tolerance||b[3]>a[3]+tolerance)return false;
 let inside=false;
 for(let i=0;i<child.ring.length-1;i++){
  const p=child.ring[i],next=child.ring[i+1],v=location(p,parent,tolerance);
  if(v<0)return false;if(v>0)inside=true;
  const mid=location([(p[0]+next[0])/2,(p[1]+next[1])/2],parent,tolerance);
  if(mid<0)return false;if(mid>0)inside=true;
 }
 return inside;
}
function ringKey(ring){
 const tokens=ring.slice(0,-1).map(p=>p[0]+','+p[1]),n=tokens.length;let a=0,b=1,k=0;
 // Minimal cyclic rotation in linear time, including repeated junctions.
 while(a<n&&b<n&&k<n){const x=tokens[(a+k)%n],y=tokens[(b+k)%n];if(x===y){k++;continue;}if(x>y){a+=k+1;if(a===b)a++;}else{b+=k+1;if(a===b)b++;}k=0;}
 const start=Math.min(a,b);return tokens.slice(start).concat(tokens.slice(0,start)).join(';');
}
const failure=(code,message)=>({ok:false,reason:code,code,message});
function faceAt(paths,p,tolerance,polygonize){
 if(!point(p))return failure('invalid-point','O ponto indicado não possui coordenadas válidas.');
 if(typeof polygonize!=='function')return failure('polygonizer-unavailable','O cálculo de limites fechados está indisponível.');
 const tol=toleranceOf(tolerance),epsilon=Math.max(tol,1e-9),input=[];
 // Split invalid runs rather than connecting across absent coordinates.
 for(const path of Array.isArray(paths)?paths:[]){
  if(!Array.isArray(path))continue;let run=[];
  for(const q of path){if(point(q))run.push([q[0],q[1]]);else{if(run.length>1)input.push(run);run=[];}}
  if(run.length>1)input.push(run);
 }
 if(!input.length)return failure('no-lines','Não há linhas válidas para definir o limite da hachura.');
 let result;try{result=polygonize(input,tol);}catch(e){return failure('polygonizer-error','Não foi possível calcular os limites fechados: '+(e?.message||e));}
 const faces=[],seen=new Set(),minArea=Math.max(1e-8,tol*tol*.01);
 for(const raw of Array.isArray(result)?result:Array.isArray(result?.rings)?result.rings:[]){
  const ring=closedCopy(raw,tol);if(!ring)continue;
  const area=areaOf(ring);if(!(area>minArea))continue; // The clockwise exterior is not a hatch face.
  const key=ringKey(ring);if(seen.has(key))continue;seen.add(key);faces.push({ring,area,bounds:extent(ring)});
 }
 if(!faces.length)return failure('open-boundary','As linhas não formam uma região fechada.');
 let selected=null;
 for(const face of faces){
  const at=location(p,face,epsilon);
  if(at===0)return failure('boundary','O ponto está sobre um limite. Clique mais para o interior da região.');
  if(at>0&&(!selected||face.area<selected.area))selected=face;
 }
 if(!selected)return failure('exterior','O ponto está fora das regiões fechadas pelas linhas.');
 const contained=faces.filter(face=>face!==selected&&containsFace(selected,face,epsilon)),children=[];
 for(const child of contained){
  if(!contained.some(other=>other!==child&&other.area>child.area&&containsFace(other,child,epsilon)))children.push(child);
 }
 const outer=selected.ring.map(q=>q.slice()),holes=children.map(child=>child.ring.slice().reverse().map(q=>q.slice()));
 return {ok:true,rings:[outer,...holes],outer,holes,area:selected.area-children.reduce((sum,child)=>sum+child.area,0),outerArea:selected.area,faceCount:faces.length};
}
function workerSource(){return '('+install.toString()+')(self);';}
root.GeoMineHatchBoundaries={closedRings,faceAt,workerSource};
})(typeof window!=='undefined'?window:globalThis);
