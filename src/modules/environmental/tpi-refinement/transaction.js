/* Detached candidate assembly. Source geometries are read-only, including array identity. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.GeoMineTPIRefineTransaction=factory;})(typeof window==='undefined'?globalThis:window,function transactionFactory(G,clipping){
'use strict';
function assemble(q){const stats={failures:[]},quantized=G.operations(clipping,stats),clip=(op,...args)=>{try{return clipping[op](...args)}catch(error){stats.failures.push({operation:op,step:0,message:error.message});return quantized(op,...args);}},protectedIds=new Set(q.protectedIds||[]),parts=q.parts,work=q.work;let refined=q.refined;if(q.preserved?.length)refined=clip('union',refined,q.preserved);
 const protectedMP=parts.filter(p=>protectedIds.has(p.id)).flatMap(p=>p.mp);if(protectedMP.length)refined=clip('difference',refined,clip('union',protectedMP));
 const allocations=parts.map(()=>[]),fresh=[],overlaps=[],inside=parts.map(p=>clip('intersection',p.mp,work));
 for(const poly of refined){const mp=[poly];let owner=-1,best=0;const hit=[];for(let i=0;i<parts.length;i++){if(protectedIds.has(parts[i].id))continue;const a=G.bounds(parts[i].mp),b=G.bounds(mp);if(a[0]>b[2]+.05||a[2]<b[0]-.05||a[1]>b[3]+.05||a[3]<b[1]-.05)continue;const area=G.area(clip('intersection',mp,inside[i]));if(area>.0001){hit.push(i);if(area>best){best=area;owner=i}}else if(owner<0&&touches(mp,inside[i]))owner=i;}if(owner<0)fresh.push(mp);else{allocations[owner].push(mp);for(const i of hit)if(i!==owner)overlaps.push({from:parts[i].source,to:parts[owner].source});}}
 const bySource=new Map(),sourceMap=[];for(let i=0;i<parts.length;i++){const p=parts[i];let list=bySource.get(p.source);if(!list)bySource.set(p.source,list=[]);if(protectedIds.has(p.id)||!inside[i].length)list.push(p.mp);else{const outside=clip('difference',p.mp,work);list.push(outside,...allocations[i]);}}
 const features=[];for(let i=0;i<q.originalCount;i++){const old=parts.filter(p=>p.source===i),untouched=old.every(p=>protectedIds.has(p.id)||!inside[parts.indexOf(p)].length);if(untouched){features.push({source:i,unchanged:true});sourceMap[i]=features.length-1;continue;}let mp=[];for(const piece of bySource.get(i)||[])if(piece.length)mp=mp.length?clip('union',mp,piece):piece;if(mp.length){features.push({source:i,mp,unchanged:false});sourceMap[i]=features.length-1;}else sourceMap[i]=-1;}
 for(const mp of fresh)features.push({source:null,mp,unchanged:false});
 // A deleted duplicate resolves to the surviving destination, never a stale index.
 for(const item of overlaps)if(sourceMap[item.from]===-1&&sourceMap[item.to]>=0)sourceMap[item.from]=sourceMap[item.to];
 for(const f of features)if(!f.unchanged&&f.source!=null){const before=parts.filter(p=>p.source===f.source).flatMap(p=>p.mp),outsideBefore=clip('difference',before,work),outsideAfter=clip('difference',f.mp,work),delta=G.area(clip('xor',outsideBefore,outsideAfter));if(delta>2)throw Error('A emenda alteraria '+delta.toFixed(3)+' m2 fora da área de trabalho. Feição '+(f.source+1)+' preservada; revise o recorte.');}
 return {features,sourceMap,unified:overlaps.filter((v,i,a)=>a.findIndex(x=>x.from===v.from&&x.to===v.to)===i),statistics:stats};
}
function touches(a,b){for(const p of a)for(const r of p)for(const v of r)for(const p2 of b)for(const r2 of p2)for(let k=1;k<r2.length;k++)if(G.segmentDistance(v,r2[k-1],r2[k])<=.05)return true;return false;}
return {assemble};
});
