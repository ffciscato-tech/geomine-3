import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const file=new URL('../src/modules/geology/geological-sections.js',import.meta.url);
const source=fs.readFileSync(file,'utf8');
const workspaceSource=fs.readFileSync(new URL('../src/modules/geology/geology-workspace.js',import.meta.url),'utf8');
const drawingSource=fs.readFileSync(new URL('../src/core/parts/08-selection-and-drawing.js',import.meta.url),'utf8');
const context={
  window:{},
  S:{layers:[],rasters:[],workCRS:'EPSG:31982'},
  document:{
    readyState:'loading',addEventListener(){},getElementById(){return null;},
    querySelectorAll(){return [];}
  },
  console,setTimeout(){return 0;},clearTimeout(){},
  fromWGS(_crs,lng,lat){return [lng,lat];},
  toWGS(_crs,x,y){return [x,y];},reproj(_from,_to,x,y){return [x,y];},
  URL,Blob
};
vm.createContext(context);
vm.runInContext(source,context,{filename:'geological-sections.js'});

const api=context.window.GeoMineGeology;
assert.ok(api&&api.__sectionTest,'API de teste da interpretação de campo ausente');
const t=api.__sectionTest;

for(const fn of ['apparentDip','roleForLayer','structuralRecords','nearestStructure','projectFieldEvent'])
  assert.equal(typeof t[fn],'function',fn+' deve ser exposta para regressão');

/* Convenção: direção é strike RHR. Seção perpendicular ao strike enxerga o
   mergulho verdadeiro; paralela enxerga 0°; oblíqua enxerga valor menor. */
assert.ok(Math.abs(t.apparentDip(0,45,90)-45)<1e-9,'perpendicular ao strike');
assert.ok(Math.abs(t.apparentDip(0,45,0))<1e-9,'paralela ao strike');
const oblique=t.apparentDip(0,45,45);
assert.ok(oblique>0&&oblique<45,'mergulho aparente oblíquo');
assert.ok(Math.abs(oblique-35.26438968)<1e-6,'valor oblíquo esperado');
assert.ok(Math.abs(t.apparentDip(0,45,270)+45)<1e-9,
  'inverter A–B deve inverter o sinal do mergulho aparente');
assert.equal(t.structuralRecords([{id:8,name:'Lineações',gtype:'point',crs:'EPSG:31982',
  _geology:{kind:'lineacao'},features:[{geom:[0,0],props:{DIRECAO:20,CAIMENTO:35}}]}]).length,0,
  'lineação/trend-plunge não pode ser tratada como atitude planar');
const dipDirection=t.structuralRecords([{id:9,name:'Plano por direção de mergulho',gtype:'point',crs:'EPSG:31982',
  _geology:{kind:'acamamento'},features:[{geom:[0,0],props:{DIRECAO:90,MERGULHO:40,REF_ORIENT:'dip_direction'}}]}]);
assert.equal(dipDirection[0].strike,0,'direção de mergulho deve ser normalizada para strike RHR');

/* O metadado tipado é canônico. O nome continua servindo somente como
   compatibilidade para arquivos externos/antigos. */
assert.equal(t.roleForLayer({_geology:{kind:'acamamento'},name:'Qualquer',gtype:'point'}),'structure');
assert.equal(t.roleForLayer({_geology:{kind:'foliacao'},name:'Pontos',gtype:'point'}),'structure');
assert.equal(t.roleForLayer({_geology:{kind:'contato-geologico'},name:'Linha',gtype:'line'}),'contact');
assert.equal(t.roleForLayer({_geology:{kind:'falha'},name:'Linha',gtype:'line'}),'fault');
assert.equal(t.roleForLayer({_geology:{kind:'sondagem'},name:'Pontos',gtype:'point'}),'hole');
assert.equal(t.roleForLayer({_geology:{kind:'litologia'},name:'Polígono',gtype:'polygon'}),'lithology');

const fieldLayer={
  id:7,name:'Acamamentos de campo',gtype:'point',crs:'EPSG:31982',
  _geology:{schemaVersion:1,kind:'acamamento',family:'estruturas'},
  features:[
    {geom:[[20,5,110]],props:{ID:'AT-01',DIRECAO:0,MERGULHO:45,REF_ORIENT:'strike_rhr',QUALIDADE:'alta',UNIDADE:'A'}},
    {geom:[80,35,120],props:{ID:'AT-02',DIRECAO:90,MERGULHO:30,REF_ORIENT:'strike_rhr',QUALIDADE:'baixa'}}
  ]
};
const records=t.structuralRecords([fieldLayer]);
assert.equal(records.length,2,'duas atitudes válidas');
assert.equal(records[0].source.layerId,7);
assert.equal(records[0].source.feature,0);
assert.equal(records[0].source.kind,'acamamento');
assert.equal(records[0].strike,0);
assert.equal(records[0].dip,45);

const near=t.nearestStructure([20,0],records,25);
assert.ok(near,'atitude próxima deve ser encontrada');
assert.equal(near.record.source.feature,0);
assert.equal(Math.round(near.distance),5);
assert.equal(t.nearestStructure([200,0],records,25),null,
  'fora do raio não deve forçar uma interpretação');

const event={kind:'contact',station:20,z:100,point:[20,0],label:'Contato A/B'};
const projection=t.projectFieldEvent(event,records,{radius:25,depth:40,sectionAzimuth:90,total:100});
assert.ok(projection,'contato deve receber projeção interpretativa');
assert.equal(Math.round(projection.apparentDip),45);
assert.equal(Math.round(projection.endStation),60);
assert.equal(Math.round(projection.endZ),60);
assert.equal(projection.source.layerId,7);
assert.equal(projection.source.feature,0);
assert.equal(projection.method,'nearest-field-attitude');
assert.ok(['alta','média','baixa'].includes(projection.confidence));
assert.equal(t.projectFieldEvent({...event,units:['B']},records,{radius:25,depth:40,sectionAzimuth:90,total:100}),null,
  'uma atitude explicitamente vinculada a outra unidade não deve controlar o contato');

/* Integração completa da receita: interseção superficial + atitude de campo
   precisa chegar ao resultado gerado, não somente às funções auxiliares. */
// The primary terrain now uses the real CRS-aware section sampler. A real
// finite grid keeps the field projection check end-to-end instead of hiding
// invalid raster fixtures behind a synthetic sampleProfile result.
context.S.rasters=[{id:'mdt',name:'MDT',d:{cs:20,xll:-20,yll:-20,nc:8,nr:4,z:new Float32Array(32).fill(100)}}];
context.S.layers=[fieldLayer,{id:11,name:'Contato A/B',gtype:'line',crs:'EPSG:31982',
  _geology:{kind:'contato-geologico'},color:'#765432',
  features:[{geom:[[20,-10],[20,10]],props:{TIPO:'Contato',UNID_A:'A'}}]}];
context.S.geology={section:{id:null,name:'Campo A–B',lineWgs:[],line:[[0,0],[100,0]],rasterId:'mdt',
  corridor:100,ve:2,step:20,layerIds:['7','11'],roles:{7:'structure',11:'contact'},
  useField:true,fieldRadius:25,fieldDepth:40,result:null},sections:[]};
const generated=api.generate();
assert.ok(generated,'a seção sintética deve ser gerada');
assert.ok(generated.profile.series[0].z.every(z=>Math.abs(z-100)<1e-9),'MDT real amostrado mantém a cota 100 m');
assert.equal(generated.contacts.length,1);
assert.ok(generated.contacts[0].interpretation,'o contato deve receber a atitude de campo');
assert.equal(Math.round(generated.contacts[0].interpretation.apparentDip),45);
assert.equal(generated.field.interpreted,1);
assert.ok(generated.fieldMarks.length>=1,'a atitude deve aparecer como controle superficial');

/* Estado global e definição vetorial da seção precisam guardar as opções de
   geração. O gráfico/amostras continuam recalculáveis e não incham o projeto. */
assert.equal(api.sectionRestore({activeId:'GSEC-CAMPO',section:{name:'Campo',rasterId:1,
  corridor:200,ve:2,step:5,layerIds:[7],roles:{7:'structure'},useField:true,
  fieldRadius:350,fieldDepth:180}}),true);
const snap=api.sectionSnapshot();
assert.equal(snap.section.useField,true);
assert.equal(snap.section.fieldRadius,350);
assert.equal(snap.section.fieldDepth,180);
for(const field of ['CAMPO_USO','RAIO_CAM','PROF_INT'])
  assert.match(source,new RegExp(field),field+' deve ser persistido na camada da seção');
for(const field of ['REF_ORIENT','PREC_LOC_M','PREC_ORI_G'])
  assert.match(workspaceSource,new RegExp(field),field+' deve integrar o esquema das atitudes de campo');
assert.match(drawingSource,/feat\._field\s*=\s*fm[\s\S]*?createFieldMeta/,
  'feições geológicas criadas no mapa devem delegar metadados ao módulo de campo');
assert.match(drawingSource,/source:'manual-map'/,'origem da coleta deve ser explícita');
assert.match(drawingSource,/observedAt:new Date\(\)\.toISOString\(\)/,'data da observação deve ser registrada');

console.log('OK: mapeamento de campo controla projeções auditáveis na seção geológica.');
