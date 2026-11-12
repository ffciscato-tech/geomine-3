import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src/modules/hydrology/flood-fill-engine.js'),'utf8');
const hydro=fs.readFileSync(path.join(root,'src/core/parts/19-hydrology-and-flooding.js'),'utf8');
const context={};context.window=context;vm.createContext(context);vm.runInContext(source,context);
const api=context.GeoMineFloodFill.engine();
const start=hydro.indexOf('function inundConectada('),end=hydro.indexOf('/* ===================== BARRAMENTO',start);
assert.ok(start>=0&&end>start);vm.runInContext(hydro.slice(start,end),context);

// Golden copy of the pre-extraction algorithm. Deliberately unchanged here;
// NoData seed coercion is tested separately as an intentional safety fix.
function legacy(d, lv, seedIdx, wall){
  const {nc,nr,z}=d;
  const mask=new Uint8Array(nc*nr);
  if(seedIdx<0||seedIdx>=z.length) return mask;
  if(wall && wall[seedIdx]) return mask;
  if(!(z[seedIdx]<lv)) return mask;
  const st=[seedIdx]; mask[seedIdx]=1;
  while(st.length){
    const k=st.pop(); const r=(k/nc)|0, c=k%nc;
    const viz=[[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
    for(const [rr,cc] of viz){ if(rr<0||rr>=nr||cc<0||cc>=nc) continue;
      const kk=rr*nc+cc; if(mask[kk]) continue;
      if(wall && wall[kk]) continue;
      const t=z[kk]; if(t!=null&&isFinite(t)&&t<lv){ mask[kk]=1; st.push(kk); } }
  }
  return mask;
}
const array=v=>Array.from(v),sum=v=>v.reduce((a,b)=>a+b,0),tests=[];
const test=(name,run)=>tests.push([name,run]);
function grid(rows){return {nc:rows[0].length,nr:rows.length,z:rows.flat()};}
test('golden scalar Hydrology matches over 500 deterministic grids, levels, walls and seeds',()=>{
 let state=912381;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 for(let run=0;run<500;run++){
  const nc=2+Math.floor(random()*15),nr=2+Math.floor(random()*15),z=Float32Array.from({length:nc*nr},()=>random()<.05?NaN:Math.floor(random()*20)-10),
    wall=Uint8Array.from({length:nc*nr},()=>random()<.08?1:0),level=Math.floor(random()*22)-11,seed=Math.floor(random()*z.length),d={nc,nr,z};
  assert.deepEqual(array(api.connectedBelow(d,level,seed,wall)),array(legacy(d,level,seed,wall)),`golden ${run}`);
 }
});
test('multiple seeds are the union of their scalar connected components; duplicates are harmless',()=>{
 const d=grid([[0,0,5,0,0],[0,0,5,0,0],[5,5,5,5,5],[0,0,5,0,0]]),seeds=[0,4,15,0];
 const expected=new Uint8Array(d.z.length);for(const seed of seeds){const m=legacy(d,1,seed);for(let k=0;k<m.length;k++)expected[k]|=m[k];}
 assert.deepEqual(array(api.connectedBelow(d,1,seeds)),array(expected));assert.equal(sum(expected),10);
});
test('four neighbours never jump a diagonal connection or wrap a row edge',()=>{
 assert.deepEqual(array(api.connectedBelow(grid([[0,5],[5,0]]),1,0)),[1,0,0,0]);
 assert.deepEqual(array(api.connectedBelow(grid([[5,0],[0,5]]),1,1)),[0,1,0,0]);
});
test('terrain above or equal to the threshold blocks; a submerged crest connects',()=>{
 const d=grid([[0,2,0]]);
 assert.deepEqual(array(api.connectedBelow(d,1,0)),[1,0,0]);
 assert.deepEqual(array(api.connectedBelow(d,2,0)),[1,0,0]);
 assert.deepEqual(array(api.connectedBelow(d,2.001,0)),[1,1,1]);
});
test('a finite crest can be bypassed in 2D without wetting the crest itself',()=>{
 const d=grid([[0,2,0],[0,2,0],[0,0,0]]),mask=api.connectedBelow(d,1,0);
 assert.equal(mask[1],0);assert.equal(mask[4],0);assert.equal(mask[2],1);assert.equal(sum(mask),7);
});
test('explicit walls block even below the threshold, including the seed',()=>{
 const d=grid([[0,0,0]]),wall=new Uint8Array([0,1,0]);
 assert.deepEqual(array(api.connectedBelow(d,100,0,wall)),[1,0,0]);
 assert.deepEqual(array(api.connectedBelow(d,100,1,wall)),[0,0,0]);
 assert.deepEqual(array(api.connectedBelow(d,100,[0,1,2],wall)),[1,0,1]);
});
test('NoData is never wet at a seed or between connected cells',()=>{
 for(const missing of [null,undefined,NaN,Infinity,-Infinity,'0']){
  const d=grid([[0,missing,0]]);
  assert.deepEqual(array(api.connectedBelow(d,1,0)),[1,0,0]);
  assert.deepEqual(array(api.connectedBelow(d,1,1)),[0,0,0]);
  assert.deepEqual(array(api.connectedBelow(d,1,[0,1,2])),[1,0,1]);
 }
});
test('declared noData/nodata/_nd sentinels and their Float32 representation are excluded',()=>{
 for(const key of ['noData','nodata','_nd']){
  const d={nc:3,nr:1,z:new Float32Array([0,-9999.123,0]),[key]:'-9999.123'};
  assert.deepEqual(array(api.connectedBelow(d,1,0)),[1,0,0]);assert.equal(sum(api.connectedBelow(d,1,1)),0);
 }
});
test('null/invalid/missing seeds never become index zero',()=>{
 const d=grid([[0,0]]);for(const seed of [null,undefined,NaN,Infinity,-1,2,.5,'0',{},[]])assert.equal(sum(api.connectedBelow(d,1,seed)),0);
 assert.deepEqual(array(api.connectedBelow(d,1,[null,-1,1,undefined])),[1,1]);
});
test('a variable local level reuses the same flood using terrain-minus-level residuals',()=>{
 const nc=4,nr=3,levels=Float64Array.from({length:12},(_,k)=>101-k%4),terrain=Float64Array.from({length:12},(_,k)=>100-k%4+2*Math.abs(Math.floor(k/4)-1)),
  residual=terrain.map((z,k)=>z-levels[k]),original=array(terrain),d={nc,nr,z:residual};
 assert.deepEqual(array(api.connectedBelow(d,0,[4,5,6,7])),[0,0,0,0,1,1,1,1,0,0,0,0]);
 assert.equal(sum(legacy({nc,nr,z:terrain},101,4)),8);assert.deepEqual(array(terrain),original);
});
test('the shared kernel and Hydrology wrapper do not mutate terrain, seeds or walls',()=>{
 const d=grid([[0,1,4],[0,2,4]]),wall=[0,0,0,0,1,0],seeds=[0,5],before=JSON.stringify({d,wall,seeds});
 const actual=api.connectedBelow(d,3,seeds,wall);assert.deepEqual(array(context.inundConectada(d,3,seeds,wall)),array(actual));
 assert.equal(JSON.stringify({d,wall,seeds}),before);assert.equal(Object.prototype.toString.call(actual),'[object Uint8Array]');
 let called=0;context.GeoMineFloodFill={engine:()=>({connectedBelow(...args){called++;assert.equal(args[0],d);return actual;}})};
 assert.equal(context.inundConectada(d,3,0,wall),actual);assert.equal(called,1);
});
test('the factory serializes into an empty worker-like context without application globals',()=>{
 const isolated={};vm.createContext(isolated);vm.runInContext('var api=('+context.GeoMineFloodFillOriginalFactory+')();',isolated);
 assert.deepEqual(array(isolated.api.connectedBelow(grid([[0,4,0],[0,4,0]]),1,[0,2])),[1,0,1,1,0,1]);
});
// Capture the actual factory before the wrapper-delegation test replaces its
// public namespace. Passing its source models the production Worker boundary.
context.GeoMineFloodFillOriginalFactory=context.GeoMineFloodFill.engine.toString();
test('invalid grid dimensions are explicit, and invalid levels never wet anything',()=>{
 assert.throws(()=>api.connectedBelow({nc:2,nr:2,z:[0]},1,0),/Grade inválida/);
 assert.throws(()=>api.connectedBelow({nc:1.5,nr:2,z:[0,0,0]},1,0),/Grade inválida/);
 for(const level of [NaN,Infinity,-Infinity,null,undefined,'1'])assert.equal(sum(api.connectedBelow(grid([[0]]),level,0)),0);
});
let passed=0;for(const [name,run] of tests){try{run();console.log('PASS '+name);passed++;}catch(error){console.error('FAIL '+name);throw error;}}
console.log(`${passed}/${tests.length} shared flood-fill checks passed`);
