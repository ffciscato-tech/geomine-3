const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const path=require('node:path');
const ctx={window:{},console,Float32Array,Float64Array,Uint8Array,Uint32Array,Int32Array,AbortController,setTimeout,clearTimeout};vm.createContext(ctx);
for(const f of ['native-flood-engine','point-catchment-engine'])vm.runInContext(fs.readFileSync(path.join(__dirname,f+'.js'),'utf8'),ctx);
const engine=ctx.window.GeoMinePointCatchmentEngine;
function source(nc,nr,fn,extra={}){const z=Float64Array.from({length:nc*nr},(_,i)=>fn(i%nc,Math.floor(i/nc))),windows=[];
 return {nc,nr,cs:.2,csy:.3,xll:300000,yll:7600000,z,windows,...extra,readWindow:async w=>{windows.push(w);const [a,b,c,d]=w;return Float64Array.from({length:(c-a)*(d-b)},(_,i)=>z[(b+Math.floor(i/(c-a)))*nc+a+i%(c-a)]);}};}
// Independent full-grid reference: construct downstream graph, trace each cell
// toward the exact outlet, compare membership rather than implementation text.
function oracle(s,seed){const dir=new Int32Array(s.nc*s.nr).fill(-1),offsets=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
 for(let r=0;r<s.nr;r++)for(let c=0;c<s.nc;c++){const i=r*s.nc+c,z=s.z[i];if(!Number.isFinite(z))continue;let best=0;
 for(const [dx,dy]of offsets){const a=c+dx,b=r+dy;if(a<0||b<0||a>=s.nc||b>=s.nr)continue;const n=b*s.nc+a,slope=(z-s.z[n])/Math.hypot(dx*s.cs,dy*s.csy);if(slope>best){best=slope;dir[i]=n;}}}
 const outlet=seed.row*s.nc+seed.col,yes=new Set();
 for(let i=0;i<dir.length;i++){let k=i;for(let guard=0;guard<dir.length&&k>=0;guard++){if(k===outlet){yes.add(i);break;}k=dir[k];}}
 return yes.size;}
function consistent(result,s,count){assert.equal(result.cells,count);assert(Math.abs(result.areaM2-count*s.cs*s.csy)<1e-8);assert.equal(result.filled,false);assert.equal(result.nativeResolution,true);
 const geomArea=result.ringInfo.reduce((n,r)=>n+r.areaM2,0);assert(Math.abs(geomArea-result.areaM2)<1e-8);
 for(const r of result.rings){assert.equal(r[0][0],r.at(-1)[0]);assert.equal(r[0][1],r.at(-1)[1]);}
 assert(s.windows.every(w=>(w[2]-w[0])*(w[3]-w[1])<=1e6));}
test('native anisotropic cells, cross-tile basin and exact outlet agree with independent full-grid D8',async()=>{
 const s=source(65,57,(x,y)=>(57-y)*.4+Math.abs(x-31)*2.123),seed={col:31,row:36},before=Buffer.from(s.z.buffer).toString('hex');
 const r=await engine.analyze(s,{seed,tileSize:8});consistent(r,s,oracle(s,seed));assert.equal(Buffer.from(s.z.buffer).toString('hex'),before);assert(r.readWindows>1);
 const downstream=await engine.analyze(s,{seed:{col:31,row:40},tileSize:8});assert(downstream.cells>r.cells);
});
test('NoData islands are excluded and marked; polygon holes preserve area',async()=>{
 const s=source(35,35,(x,y)=>x>=10&&x<=13&&y>=7&&y<=10?NaN:(35-y)+Math.abs(x-17)*2.13),seed={col:17,row:34};
 const r=await engine.analyze(s,{seed,tileSize:8});consistent(r,s,oracle(s,seed));assert(r.touchesNoData);assert(r.touchesEdge);
});
test('a depression retains its catchment without being filled or breached',async()=>{
 const s=source(9,9,(x,y)=>Math.hypot(x-4,y-4)+10),seed={col:4,row:4},before=s.z.slice();
 const r=await engine.analyze(s,{seed,tileSize:8});consistent(r,s,81);assert(r.outletDepression);assert.deepEqual(s.z,before);
});
test('a flat with a lower exit routes without changing elevations or introducing a cycle',async()=>{
 const s=source(7,7,(x,y)=>x<1||y<1||x>5||y>5?NaN:x===5&&y===3?9:10),before=s.z.slice();
 const r=await engine.analyze(s,{seed:{col:5,row:3},tileSize:8});consistent(r,s,25);assert(r.flatCells>0);assert.deepEqual(s.z,before);
});
test('a closed flat is explicit instead of inventing a flow at the clicked cell',async()=>{
 const s=source(16,16,()=>10);await assert.rejects(engine.analyze(s,{seed:{col:8,row:8},tileSize:8}),/plana fechada/);
});
test('NoData and outside clicks do not create an area',async()=>{
 const s=source(8,8,(x,y)=>x===4&&y===4?NaN:20-y);await assert.rejects(engine.analyze(s,{seed:{col:4,row:4}}),/sem dados/);await assert.rejects(engine.analyze(s,{seed:{col:8,row:1}}),/fora/);
});
test('abort and source replacement stop before returning a partial result',async()=>{
 const s=source(65,65,(x,y)=>100-y+Math.abs(x-30)*2),controller=new AbortController();controller.abort();
 await assert.rejects(engine.analyze(s,{seed:{col:30,row:60},signal:controller.signal}),{name:'AbortError'});
 let current=true;s.isCurrent=()=>current;const read=s.readWindow;s.readWindow=async w=>{const z=await read(w);if(s.windows.length===2)current=false;return z;};
 await assert.rejects(engine.analyze(s,{seed:{col:30,row:60},tileSize:8}),{name:'AbortError'});
});
test('flat memory budget fails explicitly and never reduces cell resolution',async()=>{
 const s=source(250,250,()=>10);await assert.rejects(engine.analyze(s,{seed:{col:125,row:125},tileSize:8,maxMemoryMB:1,decodedCacheMB:.25}),/sem reduzir a resolução/);
});
