import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/modules/geology/geological-sections.js',import.meta.url),'utf8');
const texts=[],strokes=[],downloads=[],notices=[];
let pen=[],canvas=null;
const ctx={fillRect(){},beginPath(){pen=[];},moveTo(x,y){pen.push(['M',x,y]);},lineTo(x,y){pen.push(['L',x,y]);},
  closePath(){},fill(){},arc(){},setLineDash(dash){this.dash=[...dash];},save(){},restore(){},translate(){},strokeRect(){},
  stroke(){strokes.push({color:this.strokeStyle,width:this.lineWidth,dash:this.dash,pen:pen.slice()});},
  fillText(text){texts.push(String(text));},strokeText(){}};
const summary={innerHTML:''};
const c={window:{},S:{layers:[],rasters:[],workCRS:'EPSG:31982'},document:{readyState:'loading',
  addEventListener(){},querySelectorAll:()=>[],getElementById:id=>id==='gsecCanvas'?canvas:id==='gsecOut'?summary:null},
  console,setTimeout:()=>0,clearTimeout(){},URL,Blob,
  fromWGS:(_crs,x,y)=>[x,y],toWGS:(_crs,x,y)=>[x,y],reproj:(_from,_to,x,y)=>[x,y],
  toast:message=>notices.push(message),download:(blob,name)=>downloads.push({blob,name})};
vm.createContext(c);vm.runInContext(source,c);
const api=c.window.GeoMineGeology,t=api.__sectionTest;
const plain=value=>JSON.parse(JSON.stringify(value));
let checked=0;
async function check(name,test){await test();checked++;console.log('OK · '+name);}
function profileFor(line,z=100){
  const met=t.lineMetrics(line),dist=Array.from({length:11},(_,i)=>met.total*i/10);
  return {dist,total:met.total,pts:dist.map(s=>[s,0]),series:[{name:'MDT',z:dist.map(()=>z)}]};
}
const layer=(id,kind,gtype,geom,props={})=>({id,name:kind,gtype,crs:'EPSG:31982',color:'#123456',
  _geology:{kind},features:[{geom,props}]});
function setup(layers,line=[[0,0],[100,0]]){
  // Cover every synthetic axis with real cells; primary terrain sampling
  // must exercise projectRasterSample rather than an unrelated profile stub.
  const cs=10,xll=Math.floor(Math.min(...line.map(p=>p[0]))/cs)*cs-cs,
    yll=Math.floor(Math.min(...line.map(p=>p[1]))/cs)*cs-cs,
    nc=Math.ceil((Math.max(...line.map(p=>p[0]))-xll)/cs)+2,
    nr=Math.ceil((Math.max(...line.map(p=>p[1]))-yll)/cs)+2;
  c.S.layers=layers;c.S.rasters=[{id:'mdt',name:'MDT',d:{cs,xll,yll,nc,nr,z:new Float32Array(nc*nr).fill(100)}}];
  c.S.geology={section:{name:'Teste',line,lineWgs:[],rasterId:'mdt',corridor:20,ve:2,step:10,
    layerIds:layers.map(L=>String(L.id)),roles:{},useField:true,fieldRadius:100,fieldDepth:20},sections:[]};
}

await check('fratura, veio e cisalhamento conservam tipos separados de falha',()=>{
  for(const [kind,role] of [['falha','fault'],['fratura','fracture'],['veio','vein'],['zona-cisalhamento','shearzone']]){
    assert.equal(t.roleForLayer(layer(1,kind,'line',[[0,0],[1,1]])),role);
    assert.equal(t.roleForLayer({name:kind,gtype:'line'}),role);
  }
  const layers=[layer(1,'falha','line',[[10,-10],[10,10]]),layer(2,'fratura','line',[[30,-10],[30,10]]),
    layer(3,'veio','line',[[70,-10],[70,10]])];setup(layers);
  c.S.geology.section.roles={1:'fault',2:'fault',3:'fault'}; // antiga classificação incorreta persistida
  const r=api.generate();assert.equal(r.faults.length,1);assert.equal(r.fractures.length,1);assert.equal(r.veins.length,1);
  assert.ok(r.profile.series[0].z.every(z=>Math.abs(z-100)<1e-9),'amostragem real do terreno preserva cota da fixture');
  assert.equal(r.fractures[0].kind,'fracture');assert.equal(r.veins[0].kind,'vein');
  assert.match(summary.innerHTML,/1 falha\(s\).*1 fratura\(s\).*1 veio\(s\)/);
});
await check('cisalhamento poligonal usa interseções exatas, incluindo trecho estreito e vazios',()=>{
  const outer=[[20,-5],[80,-5],[80,5],[20,5],[20,-5]],hole=[[40,-2],[60,-2],[60,2],[40,2],[40,-2]],
    narrow=[[20.25,-3],[20.75,-3],[20.75,3],[20.25,3],[20.25,-3]],
    layers=[layer(4,'zona-cisalhamento','polygon',[outer,hole]),layer(5,'zona-cisalhamento','polygon',[narrow])];
  setup(layers);const r=api.generate();
  assert.deepEqual(plain(r.shearzones.map(z=>[z.startStation,z.endStation])),[[20,40],[60,80],[20.25,20.75]]);
  assert.equal(r.faults.length,0);assert.equal(r.contacts.length,0);
  for(const zone of r.shearzones){assert.equal(zone.kind,'shearzone');assert.equal(zone.extentType,'mapped-surface');assert.equal(zone.interpretation,null);}
  assert.match(summary.innerHTML,/profundidade não inferidas/);
});
await check('bordas de polígonos e vazios têm resultado simétrico e contínuo',()=>{
  const outer=[[0,0],[10,0],[10,10],[0,10],[0,0]],hole=[[3,3],[7,3],[7,7],[3,7],[3,3]],
    L=layer(4,'zona-cisalhamento','polygon',[outer,hole]);
  for(const y of [0,3,7,10]){
    const line=[[-2,y],[12,y]],met=t.lineMetrics(line),r=t.mappedPolygonExtents(L,line,met,profileFor(line),'shearzone');
    assert.deepEqual(plain(r.map(p=>[p.startStation,p.endStation])),[[2,12]],'borda mapeada em y='+y);
  }
});
await check('acamamento não controla automaticamente falhas/fraturas/veios',()=>{
  const bedding=layer(10,'acamamento','point',[30,1],{ID:'BED-1',DIRECAO:0,MERGULHO:45,REF_ORIENT:'strike_rhr'}),
    records=t.structuralRecords([bedding]),event={point:[30,0],station:30,z:100,sectionAzimuth:90,layerId:20,feature:0};
  for(const kind of ['fault','fracture','vein','shearzone']){
    assert.equal(t.projectFieldEvent({...event,kind},records,{radius:30,depth:20,total:100}),null,kind);
    assert.ok(t.projectFieldEvent({...event,kind,attitudeIds:['BED-1']},records,{radius:30,depth:20,total:100}));
  }
  assert.ok(t.projectFieldEvent({...event,kind:'contact'},records,{radius:30,depth:20,total:100}));
  const local=t.structuralRecords([layer(20,'falha','line',[[30,-5],[30,5]],
    {ID:'F-OWN',DIRECAO:0,MERGULHO:70,REF_ORIENT:'strike_rhr'})]);
  const linked=t.projectFieldEvent({...event,kind:'fault',attitudeIds:['BED-1']},local.concat(records),{radius:30,depth:20,total:100});
  assert.equal(linked.trueDip,45);assert.equal(linked.method,'linked-field-attitude','vínculo explícito prevalece sobre atitude próxima/própria');
  assert.equal(t.projectFieldEvent({...event,kind:'fault',attitudeIds:['AUSENTE']},local,{radius:30,depth:20,total:100}),null);
});
await check('atitude própria e convenção explícita geram CSV com tipo correto',async()=>{
  const L=layer(11,'veio','line',[[30,-10],[30,10]],{ID:'V-1',DIRECAO:90,MERGULHO:45,REF_ORIENT:'dip_direction'});
  setup([L]);const r=api.generate();assert.equal(r.faults.length,0);assert.equal(r.veins.length,1);
  assert.equal(r.veins[0].interpretation.strike,0);assert.equal(r.veins[0].interpretation.source.layerId,11);
  api.exportFieldCSV();const csv=await downloads.at(-1).blob.text();assert.match(csv,/"vein"/);assert.doesNotMatch(csv,/"fault"/);
  const ambiguous=layer(12,'fratura','line',[[30,-5],[30,5]],{DIRECAO:0,MERGULHO:40});
  assert.equal(t.structuralRecords([ambiguous]).length,0);
  const linear=layer(13,'lineacao','point',[30,0],{STRIKE:0,MERGULHO:45,REF_ORIENT:'strike_rhr'});
  assert.equal(t.structuralRecords([linear]).length,0);
});
await check('API de orientação canônica governa a interpretação e status inválido impede uso',()=>{
  const L=layer(1,'fratura','line',[[0,0],[10,0]],{DIRECAO:90,MERGULHO:40}),mapping={
    orientationOf:()=>({valid:true,type:'planar',direction:90,strike:0,dip:40,ref:'dip_direction'}),
    fieldRecord:()=>({status:'valid',values:{},meta:{}})};
  api.fieldMapping=mapping;assert.equal(t.structuralRecords([L])[0].strike,0);
  mapping.fieldRecord=()=>({status:'invalid',values:{},meta:{}});assert.equal(t.structuralRecords([L]).length,0);
  mapping.fieldRecord=()=>({status:'valid',values:{},meta:{}});mapping.orientationOf=()=>({valid:true,type:'linear'});
  assert.equal(t.structuralRecords([L]).length,0);delete api.fieldMapping;
});
await check('papel explícito aceita atitude genérica inequívoca sem adotar nem alterar a camada',()=>{
  const mapped={console,S:{layers:[],groups:[],rasters:[]},document:{getElementById(){return null;}},setTimeout(){}};
  mapped.window=mapped;vm.createContext(mapped);
  for(const file of ['geology-workspace.js','field-mapping.js'])
    vm.runInContext(fs.readFileSync(new URL('../src/modules/geology/'+file,import.meta.url),'utf8'),mapped);
  api.fieldMapping=mapped.GeoMineGeology.fieldMapping;
  const generic={id:90,name:'Dados importados',gtype:'point',crs:'EPSG:31982',
    fields:[{name:'STRIKE',type:'N'},{name:'DIP',type:'N'}],features:[{geom:[30,1],props:{STRIKE:0,DIP:45}}]},
    original=JSON.stringify(generic);
  assert.equal(t.structuralRecords([generic]).length,0,'sem tipo ou papel não se inventa natureza planar');
  const records=t.structuralRecords([generic],{90:'structure'});
  assert.equal(records.length,1);assert.equal(records[0].strike,0);assert.equal(records[0].dip,45);
  assert.equal(records[0].role,'structure');assert.equal(JSON.stringify(generic),original);
  generic.fields=[{name:'DIRECAO',type:'N'},{name:'MERGULHO',type:'N'}];
  generic.features[0].props={DIRECAO:0,MERGULHO:45};
  assert.equal(t.structuralRecords([generic],{90:'structure'}).length,0,'papel não declara a convenção angular');
  generic.features[0].props={DIRECAO:90,MERGULHO:45,REF_ORIENT:'dip_direction'};
  for(const role of ['fault','fracture','vein','shearzone']){
    const record=t.structuralRecords([generic],{90:role})[0];
    assert.equal(record.role,role);assert.equal(record.strike,0);
  }
  const contact=layer(91,'contato-geologico','line',[[30,-5],[30,5]],{TIPO:'observado'});
  setup([generic,contact]);c.S.geology.section.roles={90:'structure'};
  assert.equal(api.generate().contacts[0].interpretation.strike,0,'generate transmite o papel da seção');
  delete api.fieldMapping;
});
await check('escala horizontal e vertical permanece igual sob os limites de altura',()=>{
  canvas={style:{},getContext:()=>ctx};
  for(const [length,relief,ve] of [[10000,1,2],[100,300,3],[1000,150,2],[100,100,.25]]){
    const met=t.lineMetrics([[0,0],[length,0]]),profile={dist:[0,length],pts:[[0,0],[length,0]],series:[{z:[100,100+relief]}]},
      result={name:'VE',rasterName:'MDT',corridor:20,ve,met,profile,runs:[],holes:[],contacts:[],faults:[],fieldMarks:[]};
    t.drawSection(result);const g=result.renderGeometry;
    assert.ok(Math.abs(g.yScale/g.xScale-1)<1e-12);
    assert.ok(g.plotH>=250&&g.plotH<=760);assert.ok(g.plotW<=1004+1e-8);
    assert.ok(g.zMin<=100&&g.zMax>=100+relief);assert.equal(result.ve,ve);
    assert.ok(texts.some(text=>text.includes('mesma escala horizontal e vertical')));
    assert.equal(canvas.style.aspectRatio,'1100 / '+canvas.height);
  }
  canvas=null;
});
await check('seção dobrada projeta XY real e separa saída/reentrada do corredor',()=>{
  const line=[[0,0],[100,0],[100,100]],met=t.lineMetrics(line),L=layer(1,'sondagem','point',[20,0,100],
    {ID_FURO:'F-1',PROF_M:160,AZIMUTE:45,INCLINACAO:45}),
    holes=t.holeObjects(L,line,met,profileFor(line),20),h=holes[0];
  assert.equal(holes.length,1);assert.equal(h.projection,'sample-xy-to-section');
  const last=h.trace.at(-1);assert.ok(Math.abs(last.station-180)<1e-8,'fundo projeta no segundo segmento');
  assert.ok(Math.abs(last.z-(100-160/Math.sqrt(2)))<1e-8);
  assert.ok(h.trace.some(p=>p.breakBefore),'trecho fora do corredor não pode ligar dois traços');
  for(const p of h.trace){const hit=t.closestOnLine([p.x,p.y],line,met);assert.ok(Math.abs(p.station-hit.station)<1e-8);assert.ok(p.offset<=10+1e-8);}
  assert.equal(t.tracePointAtDepth(h.trace,80,h.depth),null,'profundidade fora do corredor não vira estação interpolada');
  const interval=t.traceSliceByDepth(h.trace,0,160,h.depth);assert.ok(interval.filter(p=>p.breakBefore).length>=2);
  assert.equal(h.depth,160,'recortar o corredor não encurta a profundidade original');
});
await check('furo com boca fora do corredor ainda mostra trecho interno e não inventa cota zero',()=>{
  const line=[[0,0],[100,0]],met=t.lineMetrics(line),L=layer(1,'sondagem','point',[50,20,null],
    {ID_FURO:'F-2',COTA_BOCA:300,PROF_M:50,AZIMUTE:180,INCLINACAO:0}),
    h=t.holeObjects(L,line,met,profileFor(line),20)[0];
  assert.ok(h);assert.ok(Math.abs(h.trace[0].md-10)<1e-8);assert.ok(Math.abs(h.trace.at(-1).md-30)<1e-8);
  assert.equal(h.trace[0].z,300);assert.equal(h.elevationSource,'collar-property');
  assert.equal(t.tracePointAtDepth(h.trace,0,h.depth),null);
  delete L.features[0].props.COTA_BOCA;L.features[0].geom=[50,0,null];L.features[0].props.INCLINACAO=90;
  c.sampleZbil=(_d,x,y)=>200+x+y;
  const actual=t.holeObjects(L,line,met,profileFor(line),20,{d:{}})[0];assert.equal(actual.trace[0].z,250);assert.equal(actual.elevationSource,'collar-mdt');
  delete c.sampleZbil;
  L.features[0].props.INCLINACAO=-45;assert.equal(t.holeObjects(L,line,met,profileFor(line),20).length,0);
});
await check('traçado XYZ mantém distâncias 3D e recorta no comprimento informado',()=>{
  const line=[[0,0],[100,0]],met=t.lineMetrics(line),L=layer(1,'sondagem','line',[[20,0,100],[50,0,60]],
    {ID_FURO:'F-3',PROF_M:25}),h=t.holeObjects(L,line,met,profileFor(line),20)[0];
  assert.equal(h.depth,25);assert.ok(Math.abs(h.trace.at(-1).md-25)<1e-8);
  assert.ok(Math.abs(h.trace.at(-1).station-35)<1e-8);assert.ok(Math.abs(h.trace.at(-1).z-80)<1e-8);
});
await check('metros da seção exigem CRS projetado métrico',()=>{
  assert.equal(t.metricSectionCRS(),true);c.S.workCRS='EPSG:4326';assert.equal(t.metricSectionCRS(),false);
  setup([]);assert.equal(api.generate(),null);assert.match(notices.at(-1),/projetado em metros/);
  c.S.workCRS='CUSTOM';c.proj4={defs:()=>({projName:'tmerc',units:'us-ft',to_meter:1200/3937})};assert.equal(t.metricSectionCRS(),false);
  c.proj4.defs=()=>({projName:'utm',units:'m'});assert.equal(t.metricSectionCRS(),true);
  delete c.proj4;c.S.workCRS='EPSG:31982';
});
console.log(`${checked} regressões de semântica/geometria de seções aprovadas.`);
