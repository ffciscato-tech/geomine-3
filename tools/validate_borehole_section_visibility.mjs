// Regression tests for legacy collar visibility and deliberate section
// selection. Executes the real section module; no browser or project files
// are opened or edited. Optional stage argument reproduces old behavior.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=process.argv[2]?path.resolve(process.argv[2]):path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src/modules/geology/geological-sections.js'),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const near=(actual,expected,epsilon=1e-7)=>assert.ok(Math.abs(actual-expected)<=epsilon,`${actual} != ${expected}`);
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}
function point(id='S-01',x=20,y=0,extra={}){
  return {geom:[[x,y]],props:{Furo:id,'Cota boca':'420,6','Cota indic':'120,0'},...extra};
}
function layer(features=[point()],extra={}){
  return {id:7,name:'Sondagens legadas',gtype:'point',crs:'EPSG:31982',visible:true,color:'#7c3aed',
    fields:[{name:'Furo',type:'C'},{name:'Cota boca',type:'C'},{name:'Cota indic',type:'C'}],features,...extra};
}
function imported(extra={}){
  return {geom:[[20,0]],props:{ID_FURO:'BH-01',PROF_M:100,AZIMUTE:270,INCLINACAO:90},
    boreholeTrace:[{x:20,y:0,z:200,md:0},{x:35,y:0,z:180,md:50},{x:50,y:0,z:190,md:100}],
    boreholeSurvey:[{md:0,az:90,dip:60},{md:100,az:90,dip:30}],
    boreholeSource:{method:'minimum-curvature',format:'csv'},
    geologyLog:[{DE_M:0,ATE_M:50,LITOLOGIA:'Gnaisse'},{DE_M:50,ATE_M:100,LITOLOGIA:'Calcário'}],...extra};
}
function fixture(layers=[layer()]){
  const notices=[],texts=[],nodes=new Map(),ctx2d={save(){},restore(){},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},
    stroke(){},fill(){},arc(){},fillRect(){},strokeRect(){},translate(){},rect(){},clip(){},fillText(text){texts.push(String(text));},strokeText(){}};
  const canvas={style:{},getContext:()=>ctx2d};nodes.set('gsecCanvas',canvas);nodes.set('gsecOut',{innerHTML:''});
  const context={window:{},S:{layers,rasters:[],workCRS:'EPSG:31982',geology:{section:{
    name:'Sondagens A–B',line:[[0,0],[100,0]],lineWgs:[],rasterId:null,corridor:20,step:5,ve:1,
    meshIds:[],projectSources:[],layerIds:layers.map(L=>String(L.id)),roles:Object.fromEntries(layers.map(L=>[L.id,'hole'])),useField:false}}},
    document:{readyState:'loading',addEventListener(){},getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[]},
    console,setTimeout:()=>0,clearTimeout(){},URL,Blob,
    fromWGS:(_crs,x,y)=>[x,y],toWGS:(_crs,x,y)=>[x,y],reproj:(_a,_b,x,y)=>[x+1000,y+2000],
    featureVisible:(_L,f)=>f.props?.HIDDEN!==true,toast:message=>notices.push(String(message))};
  vm.createContext(context);vm.runInContext(source,context,{filename:'real-geological-sections.js'});
  const api=context.window.GeoMineGeology,t=api.__sectionTest,line=context.S.geology.section.line,met=t.lineMetrics(line),
    profile={dist:[0,100],pts:[[0,0],[100,0]],series:[{z:[NaN,NaN]}]};
  return {context,api,t,line,met,profile,nodes,notices,texts,canvas,
    holes(L=layers[0],warnings=[],corridor=20,raster=null){return t.holeObjects(L,line,met,profile,corridor,raster,warnings);}};
}

test('legacy XY collar with Brazilian decimal elevation becomes one real coted point, not a synthetic hole',()=>{
  const L=layer(),before=structuredClone(L),f=fixture([L]),warnings=[],holes=f.holes(L,warnings);
  assert.equal(holes.length,1,'a known collar elevation must be visible without total depth');const h=holes[0];
  assert.equal(h.label,'S-01');assert.equal(h.collarOnly,true);assert.equal(h.depth,null);assert.equal(h.assumedVertical,false);
  assert.equal(h.trace.length,1);near(h.trace[0].z,420.6);near(h.trace[0].station,20);assert.equal(h.trace[0].md,0);
  assert.equal(h.intervals.length,0);assert.equal(h.elevationSource,'collar-property');
  assert.equal(warnings.filter(w=>/fora do corredor|inválid|sem cota/i.test(w)).length,0,'a valid collar can have an informational note, not an error');
  assert.deepEqual(L,before,'section generation cannot modify geometry or source attributes');
});

test('Cota indic and interval tables never invent a total depth or trajectory for a collar-only point',()=>{
  const feature=point('S-01',20,0,{geologyLog:[{DE_M:0,ATE_M:50,LITOLOGIA:'Calcário'}],coreRuns:[{DE_M:0,ATE_M:30,REC_PCT:100,RQD_PCT:80}]}),
    L=layer([feature]),f=fixture([L]);
  for(const value of ['120,0',800,-1000,null]){
    feature.props['Cota indic']=value;const h=f.holes()[0];assert.ok(h);assert.equal(h.collarOnly,true);assert.equal(h.depth,null);
    assert.equal(h.trace.length,1);near(h.trace[0].z,420.6);assert.equal(h.intervals.length,0);
  }
});

test('native XY plus zg elevation and XYZ geometry are accepted with the same geometry-z provenance',()=>{
  for(const [geom,zg] of [[[20,0],[420.6]],[[[20,0]],[420.6]],[[20,0,420.6],undefined],[[[20,0,420.6]],undefined]]){
    const feature={geom,props:{Furo:'GEOM'},...(zg?{zg}:{})},L=layer([feature]),f=fixture([L]),before=structuredClone(feature),h=f.holes()[0];
    assert.ok(h);assert.equal(h.collarOnly,true);near(h.trace[0].z,420.6);assert.equal(h.elevationSource,'geometry-z');assert.deepEqual(feature,before);
  }
});

test('zero and negative collar elevations remain real elevations instead of missing-value defaults',()=>{
  for(const value of [0,'0','0,0',-15.25,'-15,25']){
    const L=layer([point('ZERO',20,0,{props:{Furo:'ZERO','Cota boca':value}})]),f=fixture([L]),h=f.holes()[0];
    assert.ok(h);near(h.trace[0].z,String(value).includes('-')?-15.25:0);assert.equal(h.depth,null);
  }
});

test('collar decimal parsing accepts numeric-dot and Brazilian grouped decimal notation without truncation',()=>{
  for(const value of [1234.5,'1234.5','1234,5','1.234,5',' 1.234,5 ']){
    const L=layer([point('LOCALE',20,0,{props:{Furo:'LOCALE','Cota boca':value}})]),f=fixture([L]),h=f.holes()[0];
    assert.ok(h);near(h.trace[0].z,1234.5);assert.equal(h.depth,null);
  }
  for(const value of ['1,234.5','1.23,45','1234.5m',true,false]){
    const L=layer([point('BAD-LOCALE',20,0,{props:{Furo:'BAD-LOCALE','Cota boca':value}})]),f=fixture([L]),warnings=[];
    assert.equal(f.holes(L,warnings).length,0);assert.match(warnings.join(' '),/cota/i);
  }
});

test('explicit invalid or negative depth produces a diagnostic, never a line or implicit collar fallback',()=>{
  for(const value of [0,-1,'-5,5','invalid',NaN,Infinity,-Infinity]){
    const feature=point();feature.props.PROF_M=value;const L=layer([feature]),f=fixture([L]),warnings=[];
    assert.equal(f.holes(L,warnings).length,0,String(value));assert.ok(warnings.length>0,'invalid depth requires a visible explanation');
    assert.match(warnings.join(' '),/profundidade/i);
  }
});

test('missing or malformed collar elevation without terrain never invents a Z from Cota indic',()=>{
  for(const value of [undefined,null,'','abc','420,6m',NaN,Infinity]){
    const props={Furo:'SEM-COTA','Cota indic':'420,6'};if(value!==undefined)props['Cota boca']=value;
    const L=layer([point('SEM-COTA',20,0,{props})]),f=fixture([L]),warnings=[];
    assert.equal(f.holes(L,warnings).length,0,String(value));assert.ok(warnings.length>0);assert.match(warnings.join(' '),/cota/i);
    assert.equal(f.api.generate(),null);assert.match(f.notices.at(-1),/cota/i);
  }
});

test('existing terrain fallback is retained only when an actual finite elevation source is available',()=>{
  const L=layer([point('MDT',20,0,{props:{Furo:'MDT'}})]),f=fixture([L]);f.profile.series[0].z=[250,250];
  const h=f.holes()[0];assert.ok(h);assert.equal(h.depth,null);near(h.trace[0].z,250);assert.equal(h.elevationSource,'section-mdt');
});

test('an explicitly oriented manual hole keeps its projected trajectory and supplied depth',()=>{
  const feature=point('MANUAL',20,0,{props:{Furo:'MANUAL','Cota boca':'420,6',PROF_M:40,AZIMUTE:90,INCLINACAO:30}}),
    L=layer([feature]),before=structuredClone(L),f=fixture([L]),h=f.holes()[0];
  assert.ok(h);assert.equal(h.collarOnly===true,false);assert.equal(h.depth,40);assert.ok(h.trace.length>=2);assert.equal(h.assumedVertical,false);
  near(h.trace[0].z,420.6);near(h.trace.at(-1).z,400.6);near(h.trace.at(-1).station,20+40*Math.cos(Math.PI/6));
  assert.deepEqual(L,before);
});

test('explicit canonical fieldMap entries override contradictory unmapped collar, depth and orientation columns',()=>{
  const feature=point('MAPPED',20,0,{props:{Furo:'MAPPED',Topo:'1.234,5',Length:'40,0',Bearing:90,Dip:30,
    COTA_BOCA:9999,PROF_M:900,AZIMUTE:270,INCLINACAO:90}}),
    L=layer([feature],{_geology:{kind:'sondagem',fieldMap:{COTA_BOCA:'Topo',PROF_M:'Length',AZIMUTE:'Bearing',INCLINACAO:'Dip'}}}),
    f=fixture([L]),before=structuredClone(L),h=f.holes()[0];
  assert.ok(h);near(h.trace[0].z,1234.5);near(h.depth,40);near(h.trace.at(-1).z,1214.5);
  near(h.trace.at(-1).station,20+40*Math.cos(Math.PI/6));assert.equal(h.assumedVertical,false);assert.deepEqual(L,before);
});

test('missing mapped elevation never borrows another property, but a real geometry elevation remains available',()=>{
  for(const zg of [undefined,[300]]){
    const feature=point('MAPPED-Z',20,0,{props:{Furo:'MAPPED-Z',COTA_BOCA:9999,'Cota boca':'888,8'},...(zg?{zg}:{})}),
      L=layer([feature],{_geology:{kind:'sondagem',fieldMap:{COTA_BOCA:'MissingElevation'}}}),f=fixture([L]),warnings=[],holes=f.holes(L,warnings);
    if(zg){assert.equal(holes.length,1);near(holes[0].trace[0].z,300);assert.equal(holes[0].elevationSource,'geometry-z');}
    else{assert.equal(holes.length,0);assert.match(warnings.join(' '),/cota/i);}
  }
});

test('missing mapped depth or orientation cannot silently use a different canonical property',()=>{
  const feature=point('MAPPED-DEPTH',20,0,{props:{Furo:'MAPPED-DEPTH','Cota boca':420,PROF_M:900,AZIMUTE:90,INCLINACAO:30}}),
    L=layer([feature],{_geology:{kind:'sondagem',fieldMap:{PROF_M:'MissingDepth'}}}),f=fixture([L]);
  const h=f.holes()[0];assert.ok(h);assert.equal(h.collarOnly,true);assert.equal(h.depth,null);assert.equal(h.trace.length,1);
  L._geology.fieldMap={AZIMUTE:'MissingAzimuth'};const warnings=[];
  assert.equal(f.holes(L,warnings).length,0,'inclined hole without its explicitly mapped azimuth must not use the other AZIMUTE column');
  assert.match(warnings.join(' '),/azimute|orientação/i);
});

test('imported curved traces preserve desurvey and measured depth instead of using collar attributes',()=>{
  const feature=imported(),L=layer([feature],{_geology:{kind:'sondagem',importedBoreholes:true}}),before=structuredClone(L),f=fixture([L]),h=f.holes()[0];
  assert.ok(h);assert.equal(h.measuredDepthSource,'boreholeTrace.md');assert.equal(h.projection,'desurvey-xy-to-section');
  assert.equal(h.depth,100);near(h.trace[0].z,200);near(h.trace.at(-1).z,190);near(h.trace.at(-1).station,50);near(h.trace.at(-1).md,100);
  assert.ok(h.trace.some(p=>p.md===50&&p.z===180&&p.station===35));assert.equal(h.intervals.length,2);assert.deepEqual(L,before);
  feature.props.PROF_M=75;const clipped=f.holes()[0];near(clipped.trace.at(-1).md,75);near(clipped.trace.at(-1).station,42.5);near(clipped.trace.at(-1).z,185);
});

test('outside-corridor diagnostics are aggregated per layer with a name and count',()=>{
  const L=layer([point('IN',20,0),point('OUT-1',30,50),point('OUT-2',40,-60)],{name:'Campanha Norte'}),f=fixture([L]),warnings=[];
  const holes=f.holes(L,warnings);assert.equal(holes.length,1);assert.equal(holes[0].label,'IN');
  const outside=warnings.filter(w=>/fora do corredor/i.test(w));assert.equal(outside.length,1);assert.ok(outside[0].includes('Campanha Norte'));assert.match(outside[0],/\b2\b/);
});

test('feature filters exclude observations before collar validation and corridor diagnostics',()=>{
  const hidden=point('HIDDEN',50,80);hidden.props.HIDDEN=true;
  const invalid=point('HIDDEN-INVALID',60,80,{props:{Furo:'HIDDEN-INVALID',HIDDEN:true}});
  const L=layer([point('IN',20,0),hidden,invalid]),f=fixture([L]),warnings=[];
  assert.deepEqual(plain(f.holes(L,warnings).map(h=>h.label)),['IN']);
  assert.equal(warnings.filter(w=>/fora do corredor|inválid|sem cota/i.test(w)).length,0,'filtered features must not be validated or counted outside the corridor');
});

test('corridor boundary remains inclusive and deviations entering the corridor are not excluded by their collars',()=>{
  const L=layer([point('EDGE+',20,10),point('EDGE-',30,-10),point('OUT',40,10.001)]),f=fixture([L]),warnings=[];
  assert.deepEqual(plain(f.holes(L,warnings).map(h=>h.label)),['EDGE+','EDGE-']);assert.equal(warnings.filter(w=>/fora do corredor/i.test(w)).length,1);
  const curve=imported({geom:[[20,30]],boreholeTrace:[{x:20,y:30,z:200,md:0},{x:40,y:0,z:180,md:50},{x:60,y:30,z:160,md:100}]}),
    importedL=layer([curve],{_geology:{kind:'sondagem',importedBoreholes:true}}),g=fixture([importedL]),curveWarnings=[],h=g.holes(importedL,curveWarnings)[0];
  assert.ok(h);near(h.trace[0].md,100/3);near(h.trace.at(-1).md,200/3);assert.equal(curveWarnings.filter(w=>/fora do corredor/i.test(w)).length,0);
});

test('generation without MDT displays collar-only points and identifies excluded campaigns in its summary',()=>{
  const first=layer([point('N-IN',20,0),point('N-OUT',30,50)],{name:'Campanha Norte'}),
    second=layer([point('S-IN',60,0),point('S-OUT-1',70,50),point('S-OUT-2',80,60)],{id:8,name:'Campanha Sul'}),
    f=fixture([first,second]),r=f.api.generate();
  assert.ok(r);assert.equal(r.hasTerrain,false);assert.equal(r.holes.length,2);assert.ok(r.holes.every(h=>h.collarOnly&&h.depth===null&&h.trace.length===1));
  assert.equal(r.holeWarnings.filter(w=>/fora do corredor/i.test(w)).length,2);
  for(const name of ['Campanha Norte','Campanha Sul'])assert.ok(f.nodes.get('gsecOut').innerHTML.includes(name));
  assert.ok(f.texts.some(text=>/boca sem trajetória/i.test(text)),'the graphic must explain why only the real collar is drawn');
});

test('all collars outside the section show a meaningful corridor diagnostic instead of a silent empty result',()=>{
  const L=layer([point('OUT-1',20,50),point('OUT-2',60,80)],{name:'Campanha Distante'}),f=fixture([L]);
  assert.equal(f.api.generate(),null);assert.match(f.notices.at(-1),/fora do corredor/i);assert.ok(f.notices.at(-1).includes('Campanha Distante'));
});

test('includeBoreholeLayer selects only the requested layer, preserving independent roles and visibility',()=>{
  const target=layer([point()],{id:7,visible:false}),other=layer([point()],{id:8,name:'Outra sondagem'}),
    domain={id:9,name:'Domínios',gtype:'polygon',crs:'EPSG:31982',visible:true,features:[]},f=fixture([target,other,domain]),q=f.context.S.geology.section;
  assert.equal(typeof f.api.includeBoreholeLayer,'function');q.layerIds=['9'];q.roles={'9':'lithology','8':'ignore','7':'observation'};
  const before=structuredClone(f.context.S.layers),geometry=plain(q.line);f.api.includeBoreholeLayer(target);
  assert.deepEqual(plain(q.layerIds),['9','7']);assert.deepEqual(plain(q.roles),{'9':'lithology','8':'ignore','7':'hole'});
  assert.deepEqual(f.context.S.layers,before,'selection must not turn layers on or change source data');assert.deepEqual(plain(q.line),geometry);
  f.api.includeBoreholeLayer('7');assert.deepEqual(plain(q.layerIds),['9','7'],'repeated calls are idempotent');
  f.api.includeBoreholeLayer(8);assert.deepEqual(plain(q.layerIds),['9','7','8']);assert.equal(q.roles['8'],'hole');
});

test('empty selection remains empty until the helper is explicitly requested and does not globally check boreholes',()=>{
  const target=layer(),other=layer([point()],{id:8,name:'Outra sondagem'}),f=fixture([target,other]),q=f.context.S.geology.section;
  q.layerIds=[];q.roles={'8':'ignore'};const before=plain({ids:q.layerIds,roles:q.roles});
  f.api.includeBoreholeLayer('missing');assert.deepEqual(plain({ids:q.layerIds,roles:q.roles}),before,'invalid target must not change selection');
  f.api.includeBoreholeLayer(target.id);assert.deepEqual(plain(q.layerIds),['7']);assert.equal(q.roles['7'],'hole');assert.equal(q.roles['8'],'ignore');
});

test('discarding an invalid collar coordinate does not shift stored zg onto the next collar',()=>{
  const feature={geom:[['bad',0],[50,0]],zg:[100,200],props:{Furo:'MULTI',PROF_M:40,AZIMUTE:0,INCLINACAO:90}},
    L=layer([feature]),before=structuredClone(L),f=fixture([L]),holes=f.holes();
  assert.equal(holes.length,1);near(holes[0].trace[0].station,50);near(holes[0].trace[0].z,200);
  near(holes[0].trace.at(-1).z,160);assert.equal(holes[0].elevationSource,'geometry-z');assert.deepEqual(L,before);
});

test('ambiguous zg lengths cannot supply elevations to another coordinate, while explicit XYZ remains usable',()=>{
  for(const zg of [[100],[100,200,300]]){
    const feature={geom:[['bad',0],[50,0]],zg,props:{Furo:'MISMATCH'}},L=layer([feature]),f=fixture([L]),warnings=[];
    assert.equal(f.holes(L,warnings).length,0);assert.match(warnings.join(' '),/cota/i);
    feature.geom[1].push(250);const holes=f.holes();assert.equal(holes.length,1);near(holes[0].trace[0].z,250);
  }
});

test('an invalid explicit collar elevation cannot be replaced with a valid geometry, raster or section elevation',()=>{
  const raster={d:{nc:1,nr:1,cs:100,xll:0,yll:-50,z:[777]}};
  for(const value of ['invalid','420,6m',true,NaN,Infinity]){
    for(const fallback of ['xyz','zg','raster','profile']){
      const feature=point('BAD-EXPLICIT',20,0,{props:{Furo:'BAD-EXPLICIT','Cota boca':value}});
      if(fallback==='xyz')feature.geom[0].push(555);
      if(fallback==='zg')feature.zg=[666];
      const L=layer([feature]),before=structuredClone(L),f=fixture([L]),warnings=[];f.profile.series[0].z=[888,888];
      assert.equal(f.holes(L,warnings,20,fallback==='raster'?raster:null).length,0,`${String(value)} with ${fallback}`);
      assert.match(warnings.join(' '),/cota da boca inválida/i);assert.deepEqual(L,before);
    }
  }
  const missing=layer([point('MISSING',20,0,{props:{Furo:'MISSING'}})]),f=fixture([missing]);
  assert.equal(f.holes(missing,[],20,raster)[0].trace[0].z,777,'the raster fixture must contain a genuinely available elevation');
});

test('a stale layer object cannot select a replacement layer that reuses its ID',()=>{
  const stale=layer(),current=layer([point('NEW')]),f=fixture([current]),q=f.context.S.geology.section;
  q.layerIds=[];q.roles={'7':'ignore'};q.layerSelectionSet=true;q.result={sentinel:'keep'};
  const before=plain(q),layerBefore=structuredClone(f.context.S.layers);
  assert.equal(f.api.includeBoreholeLayer(stale),false);assert.deepEqual(plain(q),before);
  assert.deepEqual(f.context.S.layers,layerBefore);assert.equal(f.api.includeBoreholeLayer(current),true);
  assert.deepEqual(plain(q.layerIds),['7']);assert.equal(q.roles['7'],'hole');
});

test('the actual import-section button rejects a switched project or missing imported layer before any selection or opening',()=>{
  const importSource=fs.readFileSync(path.join(root,'src/modules/geology/borehole-import.js'),'utf8'),
    match=importSource.match(/\$\('#gmBHSection'\)\.onclick=(\(\)=>\{[\s\S]*?\n    \});/);
  assert.ok(match,'locate the real import-section handler rather than duplicating its guard');
  for(const scenario of ['valid','new-project-same-layer','same-id-replacement','removed','no-last-layer']){
    const projectState={},lastLayer=layer(),calls=[],errors=[],
      context={projectState,lastLayer:scenario==='no-last-layer'?null:lastLayer,
        S:{geology:scenario==='new-project-same-layer'?{}:projectState,
          layers:scenario==='same-id-replacement'?[layer()]:scenario==='removed'?[]:[lastLayer],activeId:999},
        status:(message,error)=>errors.push({message,error}),close:()=>calls.push('close'),
        api:{includeBoreholeLayer:L=>calls.push(L),openSection:()=>calls.push('open')}};
    vm.createContext(context);vm.runInContext(`(${match[1]})()`,context);
    if(scenario==='valid'){
      assert.equal(context.S.activeId,lastLayer.id);assert.deepEqual(calls,[lastLayer,'close','open']);assert.equal(errors.length,0);
    }else{
      assert.equal(context.S.activeId,999);assert.deepEqual(calls,[]);assert.equal(errors.length,1);
      assert.equal(errors[0].error,true);assert.match(errors[0].message,/projeto mudou|camada foi removida/i);
    }
  }
});

console.log(`Borehole section visibility: ${checks} tests passed.`);
