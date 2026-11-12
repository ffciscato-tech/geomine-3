import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('../src/modules/geology/geological-sections.js',import.meta.url),'utf8');
const collabSource=fs.readFileSync(new URL('../src/modules/collaboration/cloud-collaboration.js',import.meta.url),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));
const near=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<eps,`${a} != ${b}`);
let checks=0;
function test(name,run){run();checks++;console.log('OK · '+name);}
function borehole(){return {
  id:7,name:'Sondagens importadas',gtype:'point',crs:'EPSG:31982',visible:true,color:'#7c3aed',
  fields:[{name:'ID_FURO',type:'C'}],_geology:{kind:'sondagem',importedBoreholes:true},
  features:[{geom:[20,0,200],props:{ID_FURO:'BH-01',PROF_M:100,AZIMUTE:0,MERGULHO:90},
    boreholeTrace:[{x:20,y:0,z:200,md:0},{x:35,y:0,z:180,md:50},{x:50,y:0,z:190,md:100}],
    boreholeSurvey:[{md:0,az:90,dip:-60},{md:50,az:90,dip:-30},{md:100,az:90,dip:30}],
    boreholeSource:{method:'minimum-curvature',format:'csv',files:['collar.csv','survey.csv']},
    boreholeTables:{assay:[{DE_M:0,ATE_M:50,CU_PCT:1.25}]},
    geologyLog:[{DE_M:0,ATE_M:50,LITOLOGIA:'Gnaisse'},{DE_M:50,ATE_M:100,LITOLOGIA:'Veio'}],
    coreRuns:[{DE_M:0,ATE_M:100,REC_PCT:90,RQD_PCT:80}]}]
};}
function fixture(layer=borehole()){
  const notices=[],texts=[],nodes=new Map(),ctx2d={save(){},restore(){},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},
    stroke(){},fill(){},arc(){},fillRect(){},strokeRect(){},translate(){},rect(){},clip(){},fillText(text){texts.push(String(text));},strokeText(){}};
  const canvas={style:{},getContext:()=>ctx2d};nodes.set('gsecCanvas',canvas);nodes.set('gsecOut',{innerHTML:''});
  const context={window:{},S:{layers:layer?[layer]:[],rasters:[],workCRS:'EPSG:31982',geology:{section:{
    name:'Furos A–B',line:[[0,0],[100,0]],lineWgs:[],rasterId:null,corridor:20,step:5,ve:1,
    meshIds:[],projectSources:[],layerIds:layer?[String(layer.id)]:[],roles:{},useField:false}}},
    document:{readyState:'loading',addEventListener(){},getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[]},
    console,setTimeout:()=>0,clearTimeout(){},URL,Blob,
    fromWGS:(_crs,x,y)=>[x,y],toWGS:(_crs,x,y)=>[x,y],reproj:(_a,_b,x,y)=>[x+1000,y+2000],toast:s=>notices.push(s)};
  vm.createContext(context);vm.runInContext(source,context);
  const api=context.window.GeoMineGeology,t=api.__sectionTest,line=context.S.geology.section.line,met=t.lineMetrics(line),
    profile={dist:[0,100],pts:[[0,0],[100,0]],series:[{z:[NaN,NaN]}]};
  return {context,api,t,layer,line,met,profile,nodes,notices,texts,canvas};
}

test('trajetória importada prevalece sobre azimute/mergulho da boca e preserva MD',()=>{
  const f=fixture(),original=plain(f.layer),h=f.t.holeObjects(f.layer,f.line,f.met,f.profile,20)[0];
  assert.ok(h);assert.equal(h.projection,'desurvey-xy-to-section');assert.equal(h.measuredDepthSource,'boreholeTrace.md');
  assert.equal(h.depth,100);assert.equal(h.trace.at(-1).md,100);assert.equal(h.trace.at(-1).z,190);assert.equal(h.trace.at(-1).station,50);
  const p=f.t.tracePointAtDepth(h.trace,75,h.depth);near(p.station,42.5);near(p.z,185);near(p.md,75);
  assert.ok(h.trace.some(p=>p.md===50&&p.z===180));assert.equal(h.assumedVertical,false);
  assert.equal(h.provenance.method,'minimum-curvature');assert.deepEqual(plain(f.layer),original);
});
test('logs e testemunhos acompanham profundidade medida, não comprimento das cordas',()=>{
  const f=fixture(),h=f.t.holeObjects(f.layer,f.line,f.met,f.profile,20)[0],slice=f.t.traceSliceByDepth(h.trace,50,100,h.depth);
  assert.equal(h.intervals.length,2);assert.equal(h.intervals[1].lithology,'Veio');near(slice[0].z,180);near(slice.at(-1).z,190);
  near(slice.at(-1).md,100);assert.equal(h.intervals[1].provenance.traceSource,'boreholeTrace');
});
test('editar azimute, inclinação ou cota da ficha não recalcula a trajetória importada',()=>{
  const f=fixture(),feature=f.layer.features[0],trace=plain(feature.boreholeTrace),survey=plain(feature.boreholeSurvey),
    before=plain(f.t.holeObjects(f.layer,f.line,f.met,f.profile,20)[0].trace);
  feature.props.AZIMUTE=270;feature.props.INCLINACAO=25;feature.props.MERGULHO=10;feature.props.COTA_BOCA=900;
  const after=f.t.holeObjects(f.layer,f.line,f.met,f.profile,20)[0];
  assert.deepEqual(plain(after.trace),before);assert.deepEqual(plain(feature.boreholeTrace),trace);assert.deepEqual(plain(feature.boreholeSurvey),survey);
  near(after.trace[0].z,200);near(after.trace.at(-1).z,190);
});
test('profundidade total editada limita a trajetória por MD sem extrapolação',()=>{
  const f=fixture();f.layer.features[0].props.PROF_M=75;
  const h=f.t.holeObjects(f.layer,f.line,f.met,f.profile,20)[0];near(h.depth,75);near(h.trace.at(-1).md,75);near(h.trace.at(-1).z,185);near(h.trace.at(-1).station,42.5);
  f.layer.features[0].props.PROF_M=150;const capped=f.t.holeObjects(f.layer,f.line,f.met,f.profile,20)[0];assert.equal(capped.depth,100);
});
test('MD final pode definir profundidade quando a propriedade não foi informada',()=>{
  const f=fixture();delete f.layer.features[0].props.PROF_M;
  assert.equal(f.t.holeObjects(f.layer,f.line,f.met,f.profile,20)[0].depth,100);
});
test('XYZ da trajetória são reprojetados para o CRS da seção e Z/MD não mudam',()=>{
  const f=fixture();f.layer.crs='EPSG:31983';const line=[[1000,2000],[1100,2000]],met=f.t.lineMetrics(line),
    h=f.t.holeObjects(f.layer,line,met,f.profile,20)[0];
  near(h.trace[0].station,20);near(h.trace.at(-1).station,50);near(h.trace.at(-1).z,190);near(h.trace.at(-1).md,100);
  assert.equal(h.provenance.sourceCRS,'EPSG:31983');
});
test('falha de projeção não é escondida por um furo vertical de substituição',()=>{
  const f=fixture();f.layer.crs='EPSG:31983';f.context.reproj=()=>{throw new Error('CRS ausente');};const warnings=[];
  assert.equal(f.t.holeObjects(f.layer,f.line,f.met,f.profile,20,null,warnings).length,0);assert.match(warnings[0],/XYZ\/MD inválidos/);
});
test('trajetórias inválidas não viram furos retos silenciosamente',()=>{
  for(const damage of [trace=>trace[1].md=0,trace=>trace[0].md=1,trace=>trace[1].z=null,trace=>trace[1].x=NaN,trace=>trace.length=0]){
    const f=fixture();damage(f.layer.features[0].boreholeTrace);const warnings=[];
    assert.equal(f.t.holeObjects(f.layer,f.line,f.met,f.profile,20,null,warnings).length,0);assert.equal(warnings.length,1);
  }
  const f=fixture();f.layer.features[0].props.PROF_M=-5;assert.match(f.t.importedHoleTrace(f.layer,f.layer.features[0]).error,/Profundidade total inválida/);
});
test('projeto danificado com camada importada sem boreholeTrace não fabrica furo vertical',()=>{
  const f=fixture(),feature=f.layer.features[0],warnings=[];delete feature.boreholeTrace;
  assert.equal(f.layer._geology.importedBoreholes,true);assert.ok(Number.isFinite(feature.geom[2]));
  assert.equal(f.t.holeObjects(f.layer,f.line,f.met,f.profile,20,null,warnings).length,0);
  assert.equal(warnings.length,1);assert.match(warnings[0],/Trajetória importada ausente ou incompleta/);
  assert.equal(f.api.generate(),null);assert.match(f.notices.at(-1),/reimporte a sondagem/);
});
test('traçado desviado pode entrar no corredor mesmo com a boca fora dele',()=>{
  const f=fixture();f.layer.features[0].boreholeTrace=[{x:20,y:30,z:200,md:0},{x:40,y:0,z:180,md:50},{x:60,y:30,z:160,md:100}];
  const h=f.t.holeObjects(f.layer,f.line,f.met,f.profile,20)[0];assert.ok(h);assert.ok(h.trace[0].md>0);assert.ok(h.trace.at(-1).md<100);
  near(h.trace[0].md,100/3);near(h.trace.at(-1).md,200/3);assert.ok(h.trace.every(p=>p.offset<=10+1e-7));
});
test('importação explícita só de collar gera ponto cotado sem profundidade ou linha inventada',()=>{
  const f=fixture(),hole=f.layer.features[0];hole.props.PROF_M=null;hole.boreholeTrace=hole.boreholeTrace.slice(0,1);
  hole.boreholeSurvey=[];hole.boreholeSource={method:'collar-only',depthBasis:'unknown'};
  const before=plain(hole),warnings=[],h=f.t.holeObjects(f.layer,f.line,f.met,f.profile,20,null,warnings)[0];
  assert.ok(h);assert.equal(h.collarOnly,true);assert.equal(h.depth,null);assert.equal(h.assumedVertical,false);
  assert.equal(h.trace.length,1);assert.equal(h.trace[0].md,0);near(h.trace[0].z,200);near(h.trace[0].station,20);
  assert.equal(h.intervals.length,0);assert.equal(h.projection,'collar-point-to-section');assert.equal(warnings.length,0);
  const r=f.api.generate();assert.ok(r);assert.equal(r.hasTerrain,false);assert.equal(r.holes[0].trace.length,1);
  assert.ok(f.texts.some(s=>s.includes('boca sem trajetória')));assert.deepEqual(plain(hole),before);
  hole.props.PROF_M=100;assert.equal(f.t.holeObjects(f.layer,f.line,f.met,f.profile,20)[0].trace.length,1,'atributo isolado não cria trajetória');
});
test('collar isolado respeita corredor, reprojeção e rejeita XYZ/MD ou método inválidos',()=>{
  const f=fixture(),hole=f.layer.features[0];hole.props.PROF_M=null;hole.boreholeTrace=hole.boreholeTrace.slice(0,1);
  hole.boreholeSource={method:'collar-only',depthBasis:'unknown'};f.layer.crs='EPSG:31983';
  const line=[[1000,2000],[1100,2000]],met=f.t.lineMetrics(line),h=f.t.holeObjects(f.layer,line,met,f.profile,20)[0];
  assert.ok(h);near(h.trace[0].station,20);near(h.trace[0].z,200);
  hole.boreholeTrace[0].y=50;assert.equal(f.t.holeObjects(f.layer,line,met,f.profile,20).length,0);
  hole.boreholeTrace[0].y=0;hole.boreholeTrace[0].md=1;assert.ok(f.t.importedHoleTrace(f.layer,hole).error);
  hole.boreholeTrace[0].md=0;hole.boreholeTrace[0].z=null;assert.ok(f.t.importedHoleTrace(f.layer,hole).error);
  hole.boreholeTrace[0].z=200;hole.boreholeSource.method='minimum-curvature';assert.ok(f.t.importedHoleTrace(f.layer,hole).error);
});
test('geração somente de sondagens não fabrica terreno e mantém escala 1:1',()=>{
  const f=fixture(),r=f.api.generate();assert.ok(r);assert.equal(r.hasTerrain,false);assert.equal(r.rasterId,null);assert.equal(r.meshSections.length,0);
  assert.equal(r.holes.length,1);assert.equal(r.runs.length,0);assert.ok(r.profile.series[0].z.every(Number.isNaN));assert.equal(r.renderGeometry.xScale,r.renderGeometry.yScale);
  assert.ok(f.texts.some(s=>s.includes('sondagens com cotas próprias')));assert.ok(f.texts.includes('Gnaisse'));assert.ok(f.texts.includes('Veio'));
  assert.match(f.nodes.get('gsecOut').innerHTML,/nenhuma superfície de terreno foi inferida/);
});
test('seção de sondagens aceita cota inferior como limite gráfico, sem prolongar furos',()=>{
  const f=fixture();f.context.S.geology.section.geologyBase=185;const r=f.api.generate();assert.ok(r);near(r.renderGeometry.zMin,185);
  near(r.holes[0].trace.at(-1).md,100);near(r.holes[0].trace.at(-1).z,190);assert.equal(r.renderGeometry.clippedBelowBase,true);
  f.context.S.geology.section.geologyBase=205;assert.equal(f.api.generate(),null);assert.match(f.notices.at(-1),/cota inferior válida/);
});
test('sem MDT, cotas ausentes ou todos os furos fora do corredor bloqueiam resultado',()=>{
  const f=fixture();delete f.layer.features[0].boreholeTrace;delete f.layer._geology.importedBoreholes;f.layer.features[0].geom=[20,0];
  assert.equal(f.api.generate(),null);assert.match(f.notices.at(-1),/cota e profundidade válidas/);
  const g=fixture();g.layer.features[0].boreholeTrace.forEach(p=>p.y=300);assert.equal(g.api.generate(),null);assert.equal(g.context.S.geology.section.result,null);
});
test('geologia legada com boca cotada continua podendo gerar furo sem MDT',()=>{
  const f=fixture();delete f.layer.features[0].boreholeTrace;delete f.layer._geology.importedBoreholes;const r=f.api.generate();assert.ok(r);assert.equal(r.holes[0].elevationSource,'geometry-z');near(r.holes[0].trace.at(-1).z,100);
});
test('erros em um furo aparecem no resumo sem apagar outro furo válido',()=>{
  const f=fixture(),bad=structuredClone(f.layer.features[0]);bad.props.ID_FURO='BH-ERRO';bad.boreholeTrace[1].md=-1;f.layer.features.push(bad);
  const r=f.api.generate();assert.ok(r);assert.equal(r.holes.length,1);assert.equal(r.holeWarnings.length,1);assert.match(f.nodes.get('gsecOut').innerHTML,/BH-ERRO/);
});
test('seção de sondagem com MDT continua exibindo o terreno independente da trajetória',()=>{
  const f=fixture();f.context.S.rasters=[{id:'terrain',name:'Terreno',crs:'EPSG:31982',
    d:{cs:10,nc:12,nr:2,xll:-10,yll:-10,z:new Float32Array(24).fill(250)}}];f.context.S.geology.section.rasterId='terrain';
  const r=f.api.generate();assert.ok(r);assert.equal(r.hasTerrain,true);assert.ok(r.profile.series[0].z.every(z=>z===250));near(r.holes[0].trace[0].z,200);
});

// Executa o serializador colaborativo real, sem rede ou alteração de sala.
const store=()=>({getItem:()=>null,setItem(){},removeItem(){}}),S={layers:[],workCRS:'EPSG:31982'},collabContext={
  window:{},S,console,crypto:webcrypto,navigator:{onLine:true},sessionStorage:store(),localStorage:store(),
  document:{readyState:'loading',addEventListener(){},getElementById:()=>null,querySelector:()=>null},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},
  addLayer:o=>{const l={...o,id:S.layers.length+100};S.layers.push(l);return l;},drawLayer(){},zApply(){},refreshUI(){},Blob
};
vm.createContext(collabContext);vm.runInContext(collabSource,collabContext);
const ca=collabContext.window.GeoMineCollaboration;
test('payload colaborativo conserva trace, survey, proveniência e tabelas sem caches',()=>{
  const l=borehole();l.locked=true;l.llayer={cache:true};const payload=plain(ca._serializeLayer(l));
  assert.deepEqual(payload.features,l.features);assert.equal(payload._geology.importedBoreholes,true);assert.equal('locked' in payload,false);assert.equal('llayer' in payload,false);
});
ca.setProvider({ready:true,user:{uid:'local',email:'local@example.test'}});
const payload=plain(ca._serializeLayer(borehole()));
await ca._applyLayerOperation({resourceId:'remote-borehole',authorId:'other',clientId:'other-device',payload,revision:1});
assert.equal(S.layers.length,1);assert.equal(S.layers[0].locked,true);assert.deepEqual(plain(S.layers[0].features),payload.features);checks++;
console.log('OK · aplicação remota preserva dados e restaura a proteção do collar importado');
S.layers[0].locked=false;
const updated=structuredClone(payload);updated.features[0].boreholeTables.assay[0].CU_PCT=2.5;
await ca._applyLayerOperation({resourceId:'remote-borehole',authorId:'other',clientId:'other-device',payload:updated,revision:2});
assert.equal(S.layers.length,1);assert.equal(S.layers[0].locked,true);assert.deepEqual(plain(S.layers[0].features),updated.features);checks++;
console.log('OK · substituir camada importada recebida restaura a trava derivada sem perder tabelas');
S.layers[0].features[0].props.OBS='Edição local pendente';const originalLocal=plain(S.layers[0]);
const remote=structuredClone(updated);remote.features[0].boreholeTables.assay[0].CU_PCT=3.5;
await ca._applyLayerOperation({resourceId:'remote-borehole',authorId:'other',clientId:'other-device',payload:remote,revision:3});
assert.equal(S.layers.length,2);assert.deepEqual(plain(S.layers[0]),originalLocal);assert.equal(S.layers[1].locked,true);
assert.deepEqual(plain(S.layers[1].features),remote.features);assert.equal(S.layers[1]._collabConflictOf,'remote-borehole');checks++;
console.log('OK · cópia de conflito conserva furos/traços e trava sem sobrescrever a edição local');
console.log(`${checks} regressões de sondagens importadas aprovadas.`);
