import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context=vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../src/modules/geology/borehole-preview-geometry.js',import.meta.url),'utf8'),context);
const api=context.GeoMineBoreholePreviewGeometry,plain=value=>JSON.parse(JSON.stringify(value));
let passed=0;
function test(name,run){run();passed++;console.log('PASS '+name);}
function hole(extra={}){
  return {id:'BH-01',collar:[100,200,300],depth:60,
    trace:[{x:100,y:200,z:300,md:0},{x:100,y:200,z:290,md:20},{x:130,y:200,z:280,md:40},{x:140,y:240,z:270,md:60}],
    geologyLog:[],...extra};
}
const build=(input=hole(),options)=>api.build({holes:[input]},options);
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}

test('global API is pure and works without UI, geometry or map dependencies',()=>{
  assert.equal(typeof api.build,'function');assert.ok(Object.isFrozen(api));
  assert.deepEqual(plain(api.build({holes:[]})),{holes:[],bounds:{min:[0,0,0],max:[0,0,0]},
    counts:{holes:0,tracePoints:0,traceSegments:0,intervals:0,intervalSegments:0},warnings:[]});
});
test('bent trace is preserved; interval boundaries use MD and split at every internal station',()=>{
  const input=hole({geologyLog:[{DE_M:10,ATE_M:50,LITOLOGIA:'Gnaisse'}]}),result=build(input),h=result.holes[0];
  assert.deepEqual(plain(h.trace),input.trace);
  assert.deepEqual(plain(h.intervals),[{from:10,to:50,lithology:'Gnaisse',sourceIndex:0,segments:[
    {a:[100,200,295],b:[100,200,290],from:10,to:20},
    {a:[100,200,290],b:[130,200,280],from:20,to:40},
    {a:[130,200,280],b:[135,220,275],from:40,to:50}
  ]}]);
  assert.deepEqual(plain(result.bounds),{min:[100,200,270],max:[140,240,300]});
  assert.deepEqual(plain(result.counts),{holes:1,tracePoints:4,traceSegments:3,intervals:1,intervalSegments:3});
});
test('exact station contacts do not create zero-MD or duplicated segments',()=>{
  const result=build(hole({geologyLog:[{DE_M:0,ATE_M:20,LITOLOGIA:'A'},{DE_M:20,ATE_M:60,LITOLOGIA:'B'}]}));
  assert.deepEqual(plain(result.holes[0].intervals.map(row=>row.segments.map(segment=>[segment.from,segment.to]))),
    [[[0,20]],[[20,40],[40,60]]]);
});
test('blank and absent lithology leave gaps while remaining range-validated',()=>{
  const result=build(hole({geologyLog:[{DE_M:0,ATE_M:10,LITOLOGIA:'A'},{DE_M:10,ATE_M:20,LITOLOGIA:'  '},
    {DE_M:20,ATE_M:30},{DE_M:40,ATE_M:50,LITOLOGIA:null},{DE_M:50,ATE_M:60,LITOLOGIA:'B'}]}));
  assert.deepEqual(plain(result.holes[0].intervals.map(row=>[row.from,row.to,row.lithology,row.sourceIndex])),[[0,10,'A',0],[50,60,'B',4]]);
  assert.equal(result.counts.intervals,2);assert.equal(result.counts.intervalSegments,2);
  assert.throws(()=>build(hole({geologyLog:[{DE_M:10,ATE_M:10,LITOLOGIA:''}]})),/intervalo inválido/);
});
test('interval sorting keeps source row indexes and never edits or shares input objects',()=>{
  const input=freeze({holes:[hole({geologyLog:[{DE_M:40,ATE_M:60,LITOLOGIA:'B',attributes:{code:'b'}},
    {DE_M:0,ATE_M:20,LITOLOGIA:'A',source:{row:8}}]})]}),before=JSON.stringify(input),result=api.build(input);
  assert.deepEqual(plain(result.holes[0].intervals.map(row=>row.sourceIndex)),[1,0]);
  assert.equal(JSON.stringify(input),before);
  result.holes[0].collar[0]=-1;result.holes[0].trace[0].x=-2;
  result.holes[0].intervals[0].segments[0].a[0]=-3;
  assert.equal(input.holes[0].collar[0],100);assert.equal(input.holes[0].trace[0].x,100);
  assert.equal(result.holes[0].trace[1].x,100);
});
test('collar-only holes preserve one real point and unknown depth without creating a trace',()=>{
  const input=hole({depth:null,trace:[{x:100,y:200,z:300,md:0}],source:{method:'collar-only'}}),result=build(input);
  assert.equal(result.holes[0].depth,null);assert.equal(result.holes[0].trace.length,1);
  assert.equal(result.counts.traceSegments,0);assert.equal(result.counts.intervalSegments,0);
  assert.deepEqual(plain(result.bounds),{min:[100,200,300],max:[100,200,300]});
  assert.throws(()=>build({...input,source:{}}),/collar-only/);
  assert.throws(()=>build({...input,geologyLog:[{DE_M:0,ATE_M:1,LITOLOGIA:'A'}]}),/collar-only/);
  assert.throws(()=>build({...input,depth:60}),/trajetória completa/);
});
test('nonfinite and string coordinates, MD, depth and interval limits fail descriptively',()=>{
  for(const bad of [NaN,Infinity,-Infinity,'20',undefined]){
    for(const key of ['x','y','z','md']){
      const h=hole();h.trace[1][key]=bad;assert.throws(()=>build(h),/número finito/);
    }
    const h=hole();h.collar[1]=bad;assert.throws(()=>build(h),/número finito/);
    assert.throws(()=>build(hole({depth:bad})),/número finito/);
    for(const key of ['DE_M','ATE_M']){
      const row={DE_M:10,ATE_M:20,LITOLOGIA:'A',[key]:bad};assert.throws(()=>build(hole({geologyLog:[row]})),/número finito/);
    }
  }
});
test('invalid intervals, overlaps and duplicates fail even when lithology is blank',()=>{
  for(const [from,to] of [[-1,1],[20,20],[30,10],[0,61]])
    assert.throws(()=>build(hole({geologyLog:[{DE_M:from,ATE_M:to,LITOLOGIA:'A'}]})),/intervalo inválido|ultrapassa/);
  for(const rows of [
    [{DE_M:0,ATE_M:20,LITOLOGIA:'A'},{DE_M:10,ATE_M:30,LITOLOGIA:'B'}],
    [{DE_M:0,ATE_M:20,LITOLOGIA:'A'},{DE_M:0,ATE_M:20,LITOLOGIA:'A'}],
    [{DE_M:0,ATE_M:20,LITOLOGIA:''},{DE_M:10,ATE_M:30,LITOLOGIA:'B'}]
  ])assert.throws(()=>build(hole({geologyLog:rows})),/sobrepostos ou duplicados/);
});
test('duplicate holes, MD stations, unsorted trace and collar/depth mismatches fail',()=>{
  assert.throws(()=>api.build({holes:[hole(),hole()]}),/identificador duplicado/);
  for(const md of [0,40]){const h=hole();h.trace[1].md=md;assert.throws(()=>build(h),/duplicada ou fora de ordem/);}
  const unsorted=hole();[unsorted.trace[1],unsorted.trace[2]]=[unsorted.trace[2],unsorted.trace[1]];
  assert.throws(()=>build(unsorted),/fora de ordem/);
  const origin=hole();origin.trace[0].md=1;assert.throws(()=>build(origin),/MD 0/);
  const collar=hole();collar.trace[0].x=101;assert.throws(()=>build(collar),/collar/);
  for(const depth of [59,61])assert.throws(()=>build(hole({depth})),/MD final/);
});
test('consecutive repeated XYZ cannot create a zero-length spatial segment despite increasing MD',()=>{
  const input=hole();input.trace[1]={...input.trace[0],md:20};
  assert.throws(()=>build(input),/estação 2: XYZ repetido.*comprimento zero/);
  const loop=hole({collar:[0,0,0],depth:2,trace:[{x:0,y:0,z:0,md:0},{x:0,y:0,z:0,md:2}]});
  assert.throws(()=>build(loop),/acrescente estações intermediárias/);
  loop.trace.splice(1,0,{x:1,y:0,z:0,md:1});
  loop.geologyLog=[{DE_M:0,ATE_M:2,LITOLOGIA:'A'}];
  assert.equal(build(loop).counts.intervalSegments,2,'nonconsecutive returns remain valid when stations describe the path');
});
test('intervals below available XYZ precision fail instead of emitting collapsed tubes',()=>{
  const input=hole({geologyLog:[{DE_M:1e-16,ATE_M:2e-16,LITOLOGIA:'A'}]});
  assert.throws(()=>build(input),/intervalo 1: segmento espacial de comprimento zero após interpolar/);
});
test('depth tolerance admits arithmetic rounding only, with the exact terminal XYZ',()=>{
  const h=hole({geologyLog:[{DE_M:40,ATE_M:60,LITOLOGIA:'A'}]});
  for(const sign of [-1,1]){
    h.trace[3].md=60+sign*Number.EPSILON*60;
    const result=build(h);assert.equal(result.holes[0].trace[3].md,h.trace[3].md);
    assert.equal(result.counts.intervalSegments,1);
    assert.deepEqual(plain(result.holes[0].intervals[0].segments.at(-1).b),[140,240,270]);
  }
  h.trace[3].md=60+1e-9;assert.throws(()=>build(h),/MD final/);
});
test('all hard caps reject oversized arrays before iterating their contents',()=>{
  assert.throws(()=>api.build({holes:new Array(api.limits.holes+1)}),/10000 furos/);
  assert.throws(()=>build(hole({trace:new Array(api.limits.tracePoints+1)})),/1000000 pontos/);
  assert.throws(()=>build(hole({geologyLog:new Array(api.limits.intervals+1)})),/250000 intervalos/);
  assert.equal(api.limits.intervalSegments,500000);
  const h=hole({geologyLog:[{DE_M:0,ATE_M:60,LITOLOGIA:'A'}]});
  assert.throws(()=>build(h,{limits:{intervalSegments:2}}),/2 segmentos litológicos/);
  assert.equal(build(h,{limits:{intervalSegments:3}}).counts.intervalSegments,3);
});
test('caps are global across holes; blank rows consume input interval capacity',()=>{
  const h=hole(),other=hole({id:'BH-02'});
  assert.throws(()=>api.build({holes:[h,other]},{limits:{tracePoints:7}}),/7 pontos/);
  h.geologyLog=[{DE_M:0,ATE_M:20,LITOLOGIA:'A'}];other.geologyLog=[{DE_M:0,ATE_M:20,LITOLOGIA:'B'}];
  assert.throws(()=>api.build({holes:[h,other]},{limits:{intervalSegments:1}}),/1 segmentos/);
  h.geologyLog=[{DE_M:0,ATE_M:10,LITOLOGIA:''},{DE_M:10,ATE_M:20,LITOLOGIA:''}];
  assert.throws(()=>build(h,{limits:{intervals:1}}),/1 intervalos/);
  for(const limits of [{holes:10001},{intervalSegments:500001},{tracePoints:1.5},{intervals:-1},{unknown:1}])
    assert.throws(()=>build(h,{limits}),/limite inválido/);
});
test('many interval slices retain linear output size and all trace stations',()=>{
  const length=20000,trace=Array.from({length:length+1},(_,md)=>({x:md,y:md%2,z:0,md})),geologyLog=[];
  for(let md=0;md<length;md+=2)geologyLog.push({DE_M:md,ATE_M:md+2,LITOLOGIA:'A'});
  const result=build(hole({collar:[0,0,0],depth:length,trace,geologyLog}));
  assert.equal(result.counts.tracePoints,length+1);assert.equal(result.counts.intervals,length/2);
  assert.equal(result.counts.intervalSegments,length);
  assert.equal(result.holes[0].intervals.at(-1).segments.at(-1).to,length);
});

console.log('OK: '+passed+' verificações da geometria da prévia de sondagens.');
