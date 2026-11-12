import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../src/modules/topography/longitudinal-comparison.js',import.meta.url),'utf8'),context);
const api=context.GeoMineLongitudinalComparison,plain=value=>JSON.parse(JSON.stringify(value));
let passed=0;function test(name,run){run();passed++;console.log('PASS '+name);}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function freeze(value){if(value&&typeof value==='object'&&!ArrayBuffer.isView(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function raster(id,name,z=100){return {id,name,crs:'work',d:{xll:0,yll:0,nc:12,nr:4,cs:1,z:Array(48).fill(z)}};}
function input(extra={}){return {points:[[.5,1.5],[10.5,1.5]],rasters:[raster('r1','MDT')],step:2,method:'bilinear',workCRS:'work',...extra};}

test('standalone module and empty or invalid axes do not create profiles',()=>{
  assert.ok(Object.isFrozen(api));assert.equal(context.GeoMineGeology,undefined);
  assert.equal(api.sample(),null);assert.equal(api.sample(input({points:[[0,0],[0,0]]})),null);
  assert.equal(api.sample(input({points:[[0,0],[NaN,1],[2,2]]})),null);
});
test('regular stations, bends and native vector stations share exactly one axis',()=>{
  const result=api.sample(input({points:[[.5,1.5],[3.5,1.5],[3.5,5.5]],rasters:[],step:2,
    vectorProfile:{dist:[0,1.25,7],total:7,series:[{name:'Vetor',sourceKey:'L:1',z:[10,12.5,24]}]}}));
  assert.deepEqual(plain(result.dist),[0,1.25,2,3,4,6,7]);assert.equal(result.total,7);
  assert.deepEqual(plain(result.pts),[[.5,1.5],[1.75,1.5],[2.5,1.5],[3.5,1.5],[3.5,2.5],[3.5,4.5],[3.5,5.5]]);
  assert.deepEqual(plain(result.series[0].z),[10,12.5,14,16,18,22,24]);assert.equal(result.source,'linhas');
});
test('multiple same-named rasters retain independent identities and vector metadata',()=>{
  const result=api.sample(input({rasters:[raster('one','MDT',10),raster('two','MDT',-30)],
    vectorProfile:{dist:[0,10],total:10,series:[{name:'MDT',sourceKey:'L:99',z:[100,200],method:'native-vector',intersections:2,style:{color:'#123456'}}]}}));
  assert.equal(result.source,'comparacao');assert.deepEqual(plain(result.series.map(s=>s.sourceKey)),['R:one','R:two','L:99']);
  assert.ok(result.series[0].z.every(z=>z===10));assert.ok(result.series[1].z.every(z=>z===-30));
  assert.deepEqual(plain(result.series[2].z),[100,120,140,160,180,200]);assert.equal(result.series[2].method,'native-vector');
  assert.equal(result.series[2].intersections,2);assert.equal(result.series[2].style.color,'#123456');
});
test('vector interpolation never spans NaN/null gaps and preserves exact native vertices',()=>{
  const result=api.sample(input({rasters:[],step:.5,vectorProfile:{dist:[0,2,4,6,8,10],total:10,
    series:[{name:'V',sourceKey:'L:a',z:[0,20,NaN,60,null,100]}]}})),at=s=>result.series[0].z[result.dist.indexOf(s)];
  assert.equal(at(2),20);assert.equal(at(6),60);assert.equal(at(10),100);assert.equal(at(1),10);
  for(const s of [2.5,3,4,5,6.5,7,8,9])assert.ok(Number.isNaN(at(s)),`gap ${s}`);
});
test('sparse vector coverage does not extrapolate, reorder gaps or coerce blank elevations',()=>{
  const result=api.sample(input({rasters:[],step:1,vectorProfile:{dist:[2,4,NaN,6,8],total:10,
    series:[{name:'V',sourceKey:'L:x',z:[20,40,100,60,'']} ]}})),z=result.series[0].z;
  assert.ok(Number.isNaN(z[0])&&Number.isNaN(z[1])&&Number.isNaN(z[5])&&Number.isNaN(z[7])&&Number.isNaN(z[9]));
  assert.equal(z[2],20);assert.equal(z[3],30);assert.equal(z[6],60);
});
test('near and bilinear honor rectangular cells and row orientation',()=>{
  const r={id:'rect',name:'Retangular',d:{cs:2,csy:4,xll:0,yll:0,nc:2,nr:2,z:[10,20,30,40]}},
    options=input({points:[[1,6],[3,2]],rasters:[r],step:Math.sqrt(20)/2}),
    bil=api.sample(options),nearest=api.sample({...options,method:'near'});
  assert.deepEqual(plain(bil.series[0].z),[10,25,40]);assert.deepEqual(plain(nearest.series[0].z),[10,40,40]);
});
test('each raster transforms work coordinates into its own source CRS',()=>{
  const r={id:'shifted',name:'Projetado',crs:'source',d:{xll:100,yll:200,nc:2,nr:2,cs:10,csy:20,z:[10,20,30,40]}},calls=[],
    out=api.sample(input({points:[[5,10],[15,30]],rasters:[r],step:100,reproject:(from,to,x,y)=>{calls.push([from,to,x,y]);return [x+100,y+200];}}));
  assert.deepEqual(plain(out.series[0].z),[30,20]);assert.deepEqual(calls,[['work','source',5,10],['work','source',15,30]]);
  const absent=api.sample(input({points:[[5,10],[15,30]],rasters:[r],step:100}));assert.ok(absent.series[0].z.every(Number.isNaN));
});
test('explicit working grid is honoured despite different _full elevations and stale source CRS',()=>{
  const r=raster('full','Full',900),full={xll:0,yll:0,nc:12,nr:4,cs:1,crs:'work',z:Array(48).fill(77)};
  r.d.crs='work';r.d._full=full;r.srcCRS='old';r.d.srcCRS='old';const before=JSON.stringify(r);
  const result=api.sample(input({rasters:[r],reproject:()=>{throw new Error('should not transform');}}));
  assert.ok(result.series[0].z.every(z=>z===900),'caller-selected working grid must not be silently replaced');
  const native=api.sample(input({rasters:[{...r,d:full}],reproject:()=>{throw new Error('should not transform');}}));
  assert.ok(native.series[0].z.every(z=>z===77),'caller can separately choose and supply the original full grid');
  assert.equal(JSON.stringify(r),before);
});
test('bounds and declared NoData remain real gaps even under bilinear sampling',()=>{
  const r={id:'nd',name:'Dados',d:{xll:0,yll:0,nc:3,nr:2,cs:1,z:[10,-9999,30,10,-9999,30],noData:-9999}},
    result=api.sample(input({points:[[-.5,1],[3.5,1]],rasters:[r],step:.5})),z=result.series[0].z;
  assert.ok(Number.isNaN(z[0])&&Number.isNaN(z.at(-1)));assert.equal(z[1],10);assert.equal(z[2],10);
  assert.ok(Number.isNaN(z[3])&&Number.isNaN(z[4])&&Number.isNaN(z[5]));assert.equal(z[6],30);
  r.d.z[0]=null;const missing=api.sample(input({points:[[.5,1.5],[.5,.5]],rasters:[r],step:.5}));
  assert.ok(Number.isNaN(missing.series[0].z[0])&&Number.isNaN(missing.series[0].z[1]));assert.equal(missing.series[0].z[2],10);
});
test('negative elevations and zero are values, but float32 NoData sentinels are not',()=>{
  const nd=-3.4028234663852886e38,r={id:'low',name:'Baixo',noData:String(nd),d:{xll:0,yll:0,nc:3,nr:1,cs:1,z:[-100,0,Math.fround(nd)]}},
    result=api.sample(input({points:[[.5,.5],[2.5,.5]],rasters:[r],step:1,method:'near'}));
  assert.deepEqual(plain(result.series[0].z),[-100,0,null]);assert.ok(Number.isNaN(result.series[0].z[2]));
});
test('optional TIN callback gets source coordinates and its lazy cache cannot mutate source',()=>{
  const tin={xs:[0,1,0],ys:[0,0,1],zs:[1,2,3],tri:[0,1,2]},r={id:'tin',name:'TIN',d:{tin}},before=JSON.stringify(tin),calls=[];
  freeze(tin);const result=api.sample(input({points:[[.1,.1],[.2,.2]],rasters:[r],step:1,sampleTin:(mesh,x,y)=>{
    calls.push([x,y]);mesh._idx={test:true};return x+y+mesh.zs[0];}}));
  near(result.series[0].z[0],1.2);near(result.series[0].z[1],1.4);assert.equal(JSON.stringify(tin),before);assert.equal(tin._idx,undefined);
  assert.equal(calls.length,2);
});
test('TIN declared NoData is masked before interpolation and exact raster clips retain holes',()=>{
  const tin={xs:[0,1,0],ys:[0,0,1],zs:[-9999,2,3],tri:[0,1,2]},r={id:'tin',name:'TIN',noData:-9999,d:{tin}},
    out=api.sample(input({points:[[.1,.1],[.2,.2]],rasters:[r],step:1,sampleTin:mesh=>(mesh.zs[0]+mesh.zs[1])/2}));
  assert.ok(out.series[0].z.every(Number.isNaN));assert.equal(tin.zs[0],-9999);
  const clipped=raster('clipped','Recortado');clipped._exactClipRings=[[[0,0],[12,0],[12,4],[0,4]],[[4,1],[6,1],[6,2],[4,2]]];
  const before=JSON.stringify(clipped);freeze(clipped);
  const profile=api.sample(input({points:[[.5,1.5],[10.5,1.5]],rasters:[clipped],step:1}));
  assert.ok(Number.isNaN(profile.series[0].z[4])&&Number.isNaN(profile.series[0].z[5]));assert.equal(profile.series[0].z[3],100);
  assert.equal(JSON.stringify(clipped),before,'exact clip rings and source metadata are preserved');
});
test('50k regular station safety limit never removes native vector or bend stations',()=>{
  const native=Array.from({length:50005},(_,i)=>i/50004*100),result=api.sample(input({points:[[0,0],[.123456,0],[100,0]],rasters:[],step:1e-12,
    vectorProfile:{dist:native,total:100,series:[{name:'Dense',sourceKey:'L:dense',z:native.map(s=>s*2)}]}}));
  const set=new Set(result.dist);assert.ok(native.every(s=>set.has(s)));assert.ok(set.has(.123456));
  assert.ok(result.dist.length<=native.length+50000+1);assert.equal(result.dist.at(-1),100);
  near(result.effectiveStep,100/49999);
  assert.equal(api.sample(input({rasters:[],step:1e-12})).dist.length,50000);
  const unchanged=api.sample(input({rasters:[],step:2}));assert.deepEqual(plain(unchanged.dist),[0,2,4,6,8,10]);
  assert.equal(Object.hasOwn(unchanged,'effectiveStep'),false,'normal requested step is preserved without a limit override');
});
test('frozen inputs and copied series metadata remain unchanged after sampling',()=>{
  const source=freeze(input({vectorProfile:{dist:[0,10],total:10,series:[{name:'V',sourceKey:'L:v',z:[0,10],style:{color:'#fff'}}]}})),before=JSON.stringify(source),out=api.sample(source);
  out.pts[0][0]=999;out.series[1].style.color='#000';out.series[1].z[0]=999;
  assert.equal(JSON.stringify(source),before);assert.equal(source.vectorProfile.series[0].style.color,'#fff');
});
console.log(`PASS ${passed} longitudinal comparison tests.`);
