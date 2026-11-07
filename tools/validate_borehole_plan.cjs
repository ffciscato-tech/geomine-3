// Pure VM tests: real borehole plan geometry and adapters, no browser, map
// session, project mutation, or external data. Leaflet/CRS are narrow spies.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/modules/geology/borehole-plan.js'),'utf8');
const fieldMapping=fs.readFileSync(path.join(root,'src/modules/geology/field-mapping.js'),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const near=(actual,expected,epsilon=1e-8)=>assert.ok(Math.abs(actual-expected)<=epsilon,`${actual} != ${expected}`);
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function context({mapping=false,projector}={}){
  const calls=[],c={window:{GeoMineGeology:{existing:'preserved'}},S:{workCRS:'EPSG:31983'},console,
    proj4:{Proj:function(crs){
      if(crs==='EPSG:31983'||crs==='EPSG:31982')return {projName:'utm',units:'m',to_meter:1};
      if(crs==='EPSG:3857')return {projName:'merc',units:'m',to_meter:1};
      if(crs==='EPSG:4326')return {projName:'longlat',units:'degrees'};
      if(crs==='EPSG:2263')return {projName:'lcc',units:'us-ft',to_meter:0.3048006096012192};
      if(crs==='LOCAL:UNKNOWN')return {projName:'local'};
      throw new Error('Unknown CRS');
    }},
    toWGS(crs,x,y){calls.push({crs,x,y});return projector?projector(crs,x,y):[x/1000,y/1000];},
    L2:{polyline(points,options){return {points,options};}}};
  vm.createContext(c);if(mapping)vm.runInContext(fieldMapping,c,{filename:'real-geology-field-mapping.js'});
  vm.runInContext(source,c,{filename:'real-borehole-plan.js'});
  return {c,api:c.window.GeoMineGeology.boreholePlan,calls};
}
function imported(extra={}){return {geom:[[100,200]],props:{PROF_M:150,AZIMUTE:270,INCLINACAO:90},
  boreholeTrace:[{x:100,y:200,z:500,md:0},{x:130,y:200,z:475,md:30},
    {x:130,y:240,z:440,md:90},{x:170,y:250,z:410,md:150}],
  boreholeSource:{method:'minimum-curvature'},...extra};}
const importedLayer=extra=>({id:7,name:'Sondagens',gtype:'point',crs:'EPSG:31983',
  _geology:{kind:'sondagem',importedBoreholes:true},...extra});
const manualLayer=extra=>({id:8,name:'Furos novos',gtype:'point',crs:'EPSG:31983',_geology:{kind:'sondagem'},...extra});
const manual=extra=>({geom:[[100,200]],props:{PROF_M:100,AZIMUTE:90,INCLINACAO:60},...extra});
const expected=[[100,200],[130,200],[130,240],[170,250]];
const options=freeze({pane:'alagis_L7',renderer:{name:'same-layer-renderer'},smoothFactor:0});
const style=freeze({stroke:'#123456',color:'#654321',weight:2});
const svgTags=text=>text.match(/<(?:path|polyline)\b[^>]*>/g)||[];
const attribute=(tag,name)=>tag.match(new RegExp('\\b'+name+'="([^"]*)"'))?.[1];
const numbers=value=>(value?.match(/-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?/ig)||[]).map(Number);
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}

test('API loads without DOM or a live map and preserves the existing geology namespace',()=>{
  const c={window:{GeoMineGeology:{existing:42}}};vm.createContext(c);vm.runInContext(source,c);
  assert.equal(c.window.GeoMineGeology.existing,42);
  for(const name of ['isLayer','plan','leaflet','svg'])assert.equal(typeof c.window.GeoMineGeology.boreholePlan[name],'function');
});

test('layer identity is explicit, never inferred from a name or a point symbol',()=>{
  const {api}=context();assert.equal(api.isLayer(importedLayer()),true);assert.equal(api.isLayer(manualLayer()),true);
  assert.equal(api.isLayer(manualLayer({_geology:{kind:'spt'}})),true);
  for(const L of [null,{},manualLayer({_geology:null,name:'Sondagens',ptShape:'borehole'}),
    manualLayer({_geology:{kind:'afloramento'}}),manualLayer({gtype:'line'})])assert.equal(api.isLayer(L),false);
});

test('imported trajectory is authoritative and preserves every bend in source coordinates',()=>{
  const {api}=context(),L=freeze(importedLayer()),f=freeze(imported()),before=JSON.stringify({L,f}),p=api.plan(L,f);
  assert.equal(p.source,'imported');assert.equal(p.vertical,false);assert.deepEqual(plain(p.points),expected);
  assert.equal(JSON.stringify({L,f}),before,'plan cannot edit collar coordinates, attributes, trace or MD');
  p.points[0][0]=-1;assert.equal(f.boreholeTrace[0].x,100,'returned points do not alias the source trace');
});

test('a trajectory returning to its collar is not mistaken for a vertical hole',()=>{
  const {api}=context(),f=imported({geom:[[0,0]],props:{},boreholeTrace:[{x:0,y:0,z:100,md:0},{x:50,y:0,z:75,md:80},{x:0,y:0,z:50,md:160}]});
  const p=api.plan(importedLayer(),f);assert.equal(p.vertical,false);assert.deepEqual(plain(p.points),[[0,0],[50,0],[0,0]]);
});

test('vertical traces and documented collar-only records never fabricate a line in plan',()=>{
  const {api}=context(),L=importedLayer(),vertical=imported({props:{PROF_M:100},
    boreholeTrace:[{x:100,y:200,z:500,md:0},{x:100,y:200,z:450,md:50},{x:100,y:200,z:400,md:100}]}),
    collar=imported({props:{},boreholeTrace:[{x:100,y:200,z:500,md:0}],boreholeSource:{method:'collar-only'}});
  for(const f of [vertical,collar]){
    const p=api.plan(L,f);assert.ok(p);assert.equal(p.vertical,true);assert.ok(p.points.every(([x,y])=>x===100&&y===200));
    assert.equal(api.leaflet(L,f,style,options,4).length,0);assert.equal(api.svg(L,f,style,(x,y)=>[x,y]),'');
  }
});

test('missing or malformed imported trajectories never fall back to a manual straight hole',()=>{
  const {api}=context();
  for(const trace of [undefined,null,{},[],[imported().boreholeTrace[0]]]){
    const f=manual({boreholeTrace:trace});assert.equal(api.plan(importedLayer(),f),null);assert.equal(api.plan(manualLayer(),f),null);
  }
  assert.equal(api.plan(importedLayer(),manual()),null,'imported layer without a trace is invalid, not a manual hole');
  assert.equal(api.plan(importedLayer(),imported({boreholeSource:{method:'collar-only'}})),null,'collar-only method cannot contain a multi-station trajectory');
});

test('XYZ and MD require finite numbers, not null, strings, coercible values or gaps',()=>{
  const {api}=context();
  for(const key of ['x','y','z','md'])for(const bad of [null,undefined,'30',NaN,Infinity,-Infinity]){
    const f=imported();f.boreholeTrace[1][key]=bad;assert.equal(api.plan(importedLayer(),f),null,`${key}=${String(bad)}`);
  }
  const f=imported();f.boreholeTrace[1]=null;assert.equal(api.plan(importedLayer(),f),null);
});

test('imported trajectory must start at its single real collar, not a displaced or ambiguous marker',()=>{
  const {api}=context();
  for(const geom of [null,[],[[101,200]],[[100,201]],[[100,200],[100,200]],[[NaN,200]]])
    assert.equal(api.plan(importedLayer(),imported({geom})),null);
  assert.ok(api.plan(importedLayer(),imported({geom:[[100+1e-8,200]]})),'coordinate rounding within tolerance is allowed');
});

test('MD starts at zero and is strictly increasing; invalid or excessive arrays are rejected',()=>{
  const {api}=context();
  for(const md of [-1,0,90,150]){const f=imported();f.boreholeTrace[1].md=md;assert.equal(api.plan(importedLayer(),f),null);}
  const f=imported();f.boreholeTrace[0].md=1;assert.equal(api.plan(importedLayer(),f),null);
  assert.equal(api.plan(importedLayer(),imported({boreholeTrace:new Array(100001)})),null);
});

test('edited total depth clips by measured depth at an exact interpolated terminal station',()=>{
  const {api}=context(),f=freeze(imported({props:{PROF_M:60}})),before=JSON.stringify(f),p=api.plan(importedLayer(),f);
  assert.deepEqual(plain(p.points),[[100,200],[130,200],[130,220]],'interpolation follows adjacent MD stations, not the overall collar/end chord');
  assert.equal(JSON.stringify(f),before);assert.deepEqual(plain(api.plan(importedLayer(),imported({props:{PROF_M:30}})).points),[[100,200],[130,200]]);
});

test('imported depth aliases agree with sections, missing depth uses source MD and no extrapolation occurs',()=>{
  const {api}=context();
  for(const name of ['PROF_M','PROFUNDIDADE','PROF_TOTAL','PROFUNDIDADETOTAL','DEPTH','TOTALDEPTH','FINALDEPTH'])
    assert.deepEqual(plain(api.plan(importedLayer(),imported({props:{[name]:60}})).points),[[100,200],[130,200],[130,220]],name);
  for(const props of [{},{PROF_M:150},{PROF_M:300}])assert.deepEqual(plain(api.plan(importedLayer(),imported({props})).points),expected);
  for(const bad of [0,-1,'invalid',NaN,Infinity,-Infinity])assert.equal(api.plan(importedLayer(),imported({props:{PROF_M:bad}})),null);
});

test('imported survey remains authoritative even when manual angles are impossible',()=>{
  const {api}=context(),f=imported({props:{PROF_M:150,AZIMUTE:999,INCLINACAO:-1}});
  assert.deepEqual(plain(api.plan(importedLayer(),f).points),expected);
  const L=manualLayer(),p=api.plan(L,imported());assert.equal(p.source,'imported');assert.deepEqual(plain(p.points),expected);
});

test('manual metric holes use depth, north-clockwise azimuth and inclination from horizontal',()=>{
  const {api}=context();
  for(const [az,dx,dy] of [[0,0,50],[90,50,0],[180,0,-50],[270,-50,0],[360,0,50]]){
    const p=api.plan(manualLayer(),manual({props:{PROF_M:100,AZIMUTE:az,INCLINACAO:60}}));
    assert.equal(p.source,'manual');assert.equal(p.vertical,false);near(p.points.at(-1)[0],100+dx);near(p.points.at(-1)[1],200+dy);
  }
  const horizontal=api.plan(manualLayer(),manual({props:{PROF_M:100,AZIMUTE:90,INCLINACAO:0}}));near(horizontal.points.at(-1)[0],200);
  assert.equal(api.plan(manualLayer({_geology:{kind:'spt'}}),manual({props:{PROF_M:100,AZIMUTE:90,INCLINACAO:90}})).vertical,true);
});

test('manual holes require all scientific inputs explicitly and reject impossible values',()=>{
  const {api}=context();
  for(const field of ['PROF_M','AZIMUTE','INCLINACAO'])for(const bad of [null,undefined,'',NaN,Infinity,-Infinity,'unknown']){
    const f=manual();f.props[field]=bad;assert.equal(api.plan(manualLayer(),f),null,field+'='+String(bad));
  }
  for(const [field,values] of [['PROF_M',[0,-1]],['AZIMUTE',[-1,361]],['INCLINACAO',[-1,91]]])
    for(const bad of values){const f=manual();f.props[field]=bad;assert.equal(api.plan(manualLayer(),f),null);}
  assert.equal(api.plan(manualLayer({_geology:null}),manual()),null,'legacy generic points cannot acquire a synthetic survey');
});

test('manual geometry is exactly one finite point, not multipart or a line guessed as a collar',()=>{
  const {api}=context();
  for(const geom of [null,[],[[100,200],[110,210]],[NaN,200],[100,null],[[100,Infinity]],[[[100,200]]]])
    assert.equal(api.plan(manualLayer(),manual({geom})),null);
  for(const geom of [[100,200],[100,200,500],[[100,200]],[[100,200,500]]])assert.ok(api.plan(manualLayer(),manual({geom})));
});

test('only confirmed projected metre CRS can synthesize a manual trajectory',()=>{
  const {api,c}=context();
  for(const crs of ['EPSG:31983','EPSG:31982','EPSG:3857'])assert.ok(api.plan(manualLayer({crs}),manual()),crs);
  for(const crs of ['EPSG:4326','EPSG:2263','LOCAL:UNKNOWN','EPSG:99999'])assert.equal(api.plan(manualLayer({crs}),manual()),null,crs);
  c.proj4=undefined;assert.equal(api.plan(manualLayer(),manual()),null,'no unverified EPSG-name fallback');
});

test('explicit manual field maps have priority and missing mapped values never fall back',()=>{
  const {api}=context(),L=manualLayer({_geology:{kind:'sondagem',fieldMap:{PROF_M:'Length',AZIMUTE:'Bearing',INCLINACAO:'Angle'}}}),
    f=manual({props:{Length:100,Bearing:0,Angle:60,PROF_M:900,AZIMUTE:90,INCLINACAO:0}});
  const p=api.plan(L,f);near(p.points.at(-1)[0],100);near(p.points.at(-1)[1],250);
  delete f.props.Bearing;assert.equal(api.plan(L,f),null,'do not use unrelated canonical azimuth when the mapped field is missing');
  assert.equal(api.plan(manualLayer(),manual({props:{DEPTH:100,AZIMUTH:90,DIP:60}})),null,'no ad-hoc aliases without the field-mapping module');
  assert.ok(api.plan(manualLayer(),manual({props:{prof_m:100,azimute:90,'inclinação':60}})),'canonical names tolerate case and accents');
});

test('existing field-mapping aliases can feed the manual plan without changing imported attributes',()=>{
  const {api}=context({mapping:true}),L=freeze(manualLayer()),f=freeze(manual({props:{DEPTH_M:100,BEARING:90,INCLINATION:60}})),before=JSON.stringify({L,f});
  const p=api.plan(L,f);assert.equal(p.source,'manual');near(p.points.at(-1)[0],150);near(p.points.at(-1)[1],200);
  assert.equal(JSON.stringify({L,f}),before);
});

test('Leaflet projects every station from source CRS and returns halo plus trace in the same pane',()=>{
  const {api,calls}=context(),L=freeze(importedLayer()),f=freeze(imported()),paths=api.leaflet(L,f,style,options,4);
  assert.equal(paths.length,2);const halo=paths.find(p=>p._gmBoreholePlan==='halo'),trace=paths.find(p=>p._gmBoreholePlan==='trace');
  assert.ok(halo&&trace);assert.deepEqual(plain(trace.points),expected.map(([x,y])=>[y/1000,x/1000]));
  assert.deepEqual(plain(halo.points),plain(trace.points));assert.ok(calls.length>=expected.length);
  assert.ok(calls.every(call=>call.crs==='EPSG:31983'));
  for(const p of paths){assert.equal(p.options.pane,options.pane);assert.equal(p.options.renderer,options.renderer);}
  assert.equal(halo.options.interactive,false);assert.equal(trace._fidx,4);assert.equal(trace.options.color,style.stroke);
  assert.ok(halo.options.weight>trace.options.weight);assert.ok(trace.options.dashArray,'trajectory is dashed rather than presented as a surface contact');
});

test('projection failure cannot drop a station and create an artificial straight connection',()=>{
  for(const projector of [(_c,x,y)=>x===130?null:[x,y],(_c,x,y)=>x===130?[NaN,y]:[x,y],()=>{throw new Error('invalid projection');}]){
    const {api}=context({projector});assert.equal(api.leaflet(importedLayer(),imported(),style,options,4).length,0);
  }
  const {api}=context();
  for(const project of [(x,y)=>x===130?null:[x,y],(x,y)=>x===130?[x,NaN]:[x,y],()=>{throw new Error('invalid projection');}])
    assert.equal(api.svg(importedLayer(),imported(),style,project),'');
});

test('SVG preserves the same bent projection and scales physical stroke sizes, not geometry',()=>{
  const {api}=context(),project=(x,y)=>[x/10,y/10],a=api.svg(importedLayer(),imported(),style,project),b=api.svg(importedLayer(),imported(),style,project,2);
  const aTags=svgTags(a),bTags=svgTags(b);assert.equal(aTags.length,2);assert.equal(bTags.length,2);
  const trace=aTags.find(t=>t.includes('gm-borehole-plan-trace')),halo=aTags.find(t=>t.includes('gm-borehole-plan-halo'));
  assert.ok(trace&&halo);assert.equal(attribute(trace,'stroke'),style.stroke);near(+attribute(trace,'stroke-width'),style.weight*.3);
  assert.ok(+attribute(halo,'stroke-width')>+attribute(trace,'stroke-width'));
  assert.deepEqual(numbers(attribute(trace,'d')||attribute(trace,'points')),expected.flatMap(([x,y])=>[x/10,y/10]));
  for(let i=0;i<aTags.length;i++){
    near(+attribute(bTags[i],'stroke-width'),+attribute(aTags[i],'stroke-width')*2);
    assert.equal(attribute(aTags[i],'d')||attribute(aTags[i],'points'),attribute(bTags[i],'d')||attribute(bTags[i],'points'));
  }
});

test('SVG colors are safely escaped and style/geometry inputs are never mutated',()=>{
  const {api}=context(),L=freeze(importedLayer()),f=freeze(imported()),st=freeze({color:'#f00',stroke:'red"/><script>alert(1)</script><path stroke="',weight:2}),before=JSON.stringify({L,f,st,options});
  const result=api.svg(L,f,st,(x,y)=>[x,y]);assert.equal(svgTags(result).length,2);
  assert.doesNotMatch(result,/<script\b|<path stroke=""|onload\s*=/i);assert.ok(result.includes('&quot;')||!result.includes('alert(1)'));
  api.leaflet(L,f,st,options,4);assert.equal(JSON.stringify({L,f,st,options}),before);
});

test('zero line weight and invalid/collar-only geometry do not create invisible interactive paths',()=>{
  const {api}=context();
  assert.equal(api.leaflet(importedLayer(),imported(),{...style,weight:0},options,0).length,0);
  assert.equal(api.svg(importedLayer(),imported(),{...style,weight:0},(x,y)=>[x,y]),'');
  assert.equal(api.leaflet(importedLayer(),imported({boreholeTrace:null}),style,options,0).length,0);
  assert.equal(api.svg(importedLayer(),imported({boreholeTrace:null}),style,(x,y)=>[x,y]),'');
});

console.log(`Borehole plan: ${checks} tests passed.`);
