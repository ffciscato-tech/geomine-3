// Focused regression of the real profile algorithms, without browser/UI/session.
// Usage: node tools/smoke_longitudinal_vectors.cjs [path/to/25-geoprocessing-tin.js]
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sourceFile=path.resolve(process.argv[2]||path.join(__dirname,'../src/core/parts/25-geoprocessing-tin.js'));
const source=fs.readFileSync(sourceFile,'utf8'),start=source.indexOf('function profSelectedRasters('),
  end=source.indexOf('function profRenderVectorSources(');
assert.ok(start>=0&&end>start,'profile source block anchors must exist');
const context={console,S:{workCRS:'EPSG:31982',layers:[],rasters:[],prof:{}},
  reproj:(_from,_to,x,y)=>[x,y],document:{getElementById:()=>null}};
vm.createContext(context);vm.runInContext(source.slice(start,end),context,{filename:sourceFile});
for(const name of ['profVectorParts','profLinhaTemZ','sampleProfileLines'])
  assert.equal(typeof context[name],'function',name+' must be available');
const clean=value=>JSON.parse(JSON.stringify(value));
const layer=(features,extra={})=>({id:17,name:'Vetor sintético',gtype:'line',crs:'EPSG:31982',features,...extra});
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const near=(a,b,label)=>assert.ok(finite(a)&&Math.abs(a-b)<1e-8,label+': '+a+' != '+b);
let passed=0,failed=0;
function test(name,fn){try{fn();passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}}
function sample(axis,L,step=1,selection){
  const before=structuredClone(L),result=context.sampleProfileLines(axis,[L],step,selection);
  assert.deepEqual(L,before,'sampling must not mutate the original feature/layer');
  assert.ok(result&&Array.isArray(result.dist)&&result.series?.length===1,'profile result contract');
  assert.equal(result.dist.length,result.series[0].z.length,'distance/cota arrays must stay aligned');
  return result;
}
function at(profile,d){
  const index=profile.dist.findIndex(x=>Math.abs(x-d)<1e-8);
  assert.ok(index>=0,'profile must include station '+d+'; got '+JSON.stringify(profile.dist));
  return profile.series[0].z[index];
}
function parts(feature){
  const before=structuredClone(feature),result=context.profVectorParts(feature);
  assert.deepEqual(feature,before,'reading native cotas must not mutate the feature');
  assert.ok(Array.isArray(result),'parts must be an array');
  return result;
}

test('embedded XYZ is detected, including zero and negative cotas',()=>{
  const f={geom:[[0,0,0],[3,0,-12],[10,0,40]],props:{}};
  const p=parts(f);assert.equal(p.length,1);assert.deepEqual(clean(p[0].xy),[[0,0],[3,0],[10,0]]);
  assert.deepEqual(clean(p[0].z),[0,-12,40]);assert.equal(p[0].partIdx,0);
  assert.equal(context.profLinhaTemZ(layer([f])),true);
});
test('DXF flat geom/zg with multi:true remains one part',()=>{
  const f={geom:[[0,0],[5,0],[10,0]],multi:true,zg:[100,105,120],props:{}};
  const p=parts(f);assert.equal(p.length,1);assert.deepEqual(clean(p[0].z),[100,105,120]);
  assert.equal(context.profLinhaTemZ(layer([f])),true);
});
test('SHP nested geom/zg retains each part and partIdx',()=>{
  const f={geom:[[[0,0],[4,0]],[[6,0],[10,0]]],multi:true,zg:[[10,20],[30,40]],props:{}};
  const p=parts(f);assert.equal(p.length,2);assert.deepEqual(clean(p.map(q=>q.partIdx)),[0,1]);
  assert.deepEqual(clean(p.map(q=>q.z)),[[10,20],[30,40]]);
});
test('aligned zg takes priority over embedded XYZ and attribute',()=>{
  const p=parts({geom:[[0,0,1],[10,0,2]],zg:[11,12],props:{COTA:99}});
  assert.deepEqual(clean(p[0].z),[11,12]);
});
test('normalized altimetric aliases and numeric strings are accepted',()=>{
  for(const [key,value,expected] of [['ELEVAÇÃO',125.5,125.5],['cota',0,0],['NÍVEL',-7,-7],['ALTITUDE','42.5',42.5]]){
    const f={geom:[[0,0],[10,0]],props:{[key]:value}},p=parts(f);
    assert.deepEqual(clean(p[0].z),[expected,expected],key);
    assert.equal(context.profLinhaTemZ(layer([f])),true,key+' detection');
  }
});
test('null, empty, whitespace, nonfinite and boolean cotas are not zero',()=>{
  for(const value of [null,undefined,'','   ',NaN,Infinity,-Infinity,false,true]){
    for(const form of ['attribute','xyz','zg']){
      const f={geom:[[0,0],[10,0]],props:{}};
      if(form==='attribute')f.props.COTA=value;
      else if(form==='xyz')f.geom.forEach(p=>p.push(value));else f.zg=[value,value];
      const p=parts(f);assert.ok(p.every(q=>q.z.every(z=>!finite(z))),form+' must retain missing/invalid Z');
      assert.equal(context.profLinhaTemZ(layer([f])),false,form+' must not falsely advertise 3D');
    }
  }
});
test('missing vertices stay missing instead of being repaired',()=>{
  const p=parts({geom:[[0,0],[5,0],[10,0]],zg:[100,null,120],props:{}});
  near(p[0].z[0],100,'first cota');assert.ok(!finite(p[0].z[1]));near(p[0].z[2],120,'last cota');
  const short=parts({geom:[[0,0],[5,0],[10,0]],zg:[100,120],props:{}});
  assert.ok(!finite(short[0].z[2]),'a short zg must not fabricate the missing final cota');
});
test('collinear own-axis profile preserves native extremes even with a large step',()=>{
  const f={geom:[[0,0,10],[3,0,95],[10,0,-5]],props:{}},p=sample([[0,0],[10,0]],layer([f]),50);
  near(p.total,10,'horizontal length');near(at(p,0),10,'start');near(at(p,3),95,'off-grid native peak');
  near(at(p,10),-5,'end');
});
test('parallel zg and reversed vector direction give the correct cotas',()=>{
  const f={geom:[[10,0],[0,0]],multi:true,zg:[120,100],props:{}},p=sample([[0,0],[10,0]],layer([f]),2);
  near(at(p,0),100,'reversed start');near(at(p,4),108,'reversed interpolation');near(at(p,10),120,'reversed end');
});
test('crossing contour lines retain interpolation between intersections',()=>{
  const L=layer([{geom:[[2,-5],[2,5]],props:{COTA:20}},{geom:[[8,-5],[8,5]],props:{'ELEVAÇÃO':80}}]),
    p=sample([[0,0],[10,0]],L,1);
  near(at(p,2),20,'first crossing');near(at(p,5),50,'between crossings');near(at(p,8),80,'last crossing');
  assert.ok(!finite(at(p,0))&&!finite(at(p,10)),'crossings must not extrapolate beyond coverage');
});
test('disconnected multipart collinear spans do not bridge their gap',()=>{
  const f={geom:[[[0,0],[4,0]],[[6,0],[10,0]]],multi:true,zg:[[0,40],[60,100]],props:{}},
    p=sample([[0,0],[10,0]],layer([f]),1);
  near(at(p,3),30,'first part');assert.ok(!finite(at(p,5)),'gap between parts must remain missing');
  near(at(p,7),70,'second part');
});
test('disconnected independent features do not bridge their collinear gap',()=>{
  const p=sample([[0,0],[10,0]],layer([
    {geom:[[0,0],[4,0]],zg:[0,40],props:{}},{geom:[[6,0],[10,0]],zg:[60,100],props:{}}]),1);
  near(at(p,3),30,'first feature');assert.ok(!finite(at(p,5)));near(at(p,7),70,'second feature');
});
test('gaps remain visible even when the requested step skips over them',()=>{
  const p=sample([[0,0],[10,0]],layer([
    {geom:[[0,0],[4,0]],zg:[0,40],props:{}},{geom:[[6,0],[10,0]],zg:[60,100],props:{}}]),100);
  assert.ok(p.dist.some((d,i)=>d>4&&d<6&&!finite(p.series[0].z[i])),
    'a NaN station inside the gap must stop the chart/DXF from drawing a bridge');
});
test('missing zg or XYZ breaks the native profile instead of connecting through it',()=>{
  for(const f of [{geom:[[0,0],[4,0],[6,0],[10,0]],zg:[0,40,null,100],props:{}},
    {geom:[[0,0,0],[4,0,40],[6,0,null],[10,0,100]],props:{}}]){
    const p=sample([[0,0],[10,0]],layer([f]),1);near(at(p,2),20,'valid span');
    for(const d of [5,6,7,9])assert.ok(!finite(at(p,d)),'missing native segment at '+d);
  }
});
test('an uncoted multipart branch is not assigned another branch\'s cotas',()=>{
  const f={geom:[[[0,0],[4,0]],[[6,0],[10,0]]],multi:true,zg:[[0,40],[]],props:{}},
    p=sample([[0,0],[10,0]],layer([f]),1);
  near(at(p,2),20,'first part');for(const d of [5,6,8,10])assert.ok(!finite(at(p,d)),'uncoted part/gap at '+d);
});
test('blank contour attributes cannot generate a zero-altitude profile',()=>{
  const p=sample([[0,0],[10,0]],layer([
    {geom:[[2,-5],[2,5]],props:{COTA:null}},{geom:[[8,-5],[8,5]],props:{COTA:''}}]),1);
  assert.ok(p.series[0].z.every(z=>!finite(z)));
});
test('XY reprojection changes horizontal stationing without changing native Z',()=>{
  const original=context.reproj,calls=[];
  context.reproj=(from,to,x,y)=>{calls.push({from,to});return from==='LOCAL_UNITS'?[x*100,y*100]:[x,y];};
  try{
    const p=sample([[0,0],[1000,0]],layer([{geom:[[0,0,50],[10,0,150]],props:{}}],{crs:'LOCAL_UNITS'}),250);
    near(p.total,1000,'work-CRS stationing');near(at(p,500),100,'native Z after XY reprojection');
    assert.ok(calls.some(c=>c.from==='LOCAL_UNITS'&&c.to==='EPSG:31982'));
  }finally{context.reproj=original;}
});
test('axisSelection honors the selected feature and multipart branch only in its own layer',()=>{
  const L=layer([{geom:[[0,0],[10,0]],zg:[10,20],props:{}},
    {geom:[[[0,0],[10,0]],[[0,0],[10,0]]],multi:true,zg:[[100,110],[200,210]],props:{}}]),
    selection={layer:L,idx:1,partIdx:1},p=sample([[0,0],[10,0]],L,5,selection);
  near(at(p,0),200,'selected branch start');near(at(p,5),205,'selected branch midpoint');
  near(at(p,10),210,'selected branch end');
  const comparison=layer([{geom:[[0,0],[10,0]],zg:[300,310],props:{}}],{id:18,name:'Comparison'}),
    before=structuredClone([L,comparison]),both=context.sampleProfileLines([[0,0],[10,0]],[L,comparison],5,selection);
  assert.deepEqual([L,comparison],before);assert.equal(both.series.length,2);
  near(both.series[1].z[both.dist.findIndex(d=>Math.abs(d-5)<1e-8)],305,'another layer remains eligible');
});
test('collinear spans do not suppress valid contour crossings elsewhere in the same layer',()=>{
  const L=layer([{geom:[[0,0],[2,0]],zg:[0,20],props:{}},
    {geom:[[4,-1],[4,1]],zg:[40,40],props:{}},{geom:[[8,-1],[8,1]],zg:[80,80],props:{}}]),
    p=sample([[0,0],[10,0]],L,1);
  near(at(p,1),10,'native span');near(at(p,4),40,'first contour crossing');
  near(at(p,6),60,'between contour crossings');near(at(p,8),80,'last contour crossing');
  assert.ok(!finite(at(p,10)),'mixed sources must still not extrapolate');
});
test('contour interpolation cannot fill an explicitly uncoted native span',()=>{
  const L=layer([{geom:[[4,0],[6,0]],zg:[null,null],props:{}},
    {geom:[[2,-1],[2,1]],zg:[20,20],props:{}},{geom:[[8,-1],[8,1]],zg:[80,80],props:{}}]),
    p=sample([[0,0],[10,0]],L,1);
  near(at(p,3),30,'contour interpolation before gap');assert.ok(!finite(at(p,5)),'explicit gap remains NaN');
  near(at(p,7),70,'contour interpolation after gap');
});
test('selected own axis preserves vertex order where the path retraces its XY',()=>{
  const f={geom:[[0,0],[10,0],[0,0]],zg:[0,10,20],props:{}},L=layer([f]),
    p=sample(f.geom,L,5,{layer:L,idx:0,partIdx:0});
  near(p.total,20,'out-and-back horizontal length');
  for(const d of [0,5,10,15,20])near(at(p,d),d,'native cota in travel order at '+d);
});
console.log((failed?'FAILED':'OK')+': '+passed+' passed, '+failed+' failed longitudinal vector regressions.');
if(failed)process.exitCode=1;
