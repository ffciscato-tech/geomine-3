import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const workspaceSource=fs.readFileSync(
  path.join(root,'src/modules/geology/geology-workspace.js'),'utf8'
);
const mappingPath=path.join(root,'src/modules/geology/field-mapping.js');
assert.ok(fs.existsSync(mappingPath),'módulo src/modules/geology/field-mapping.js ausente');
const mappingSource=fs.readFileSync(mappingPath,'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));

const geologyGroup={id:8,name:'Geologia',parentId:null,collapsed:false};
const importedGroup={id:4,name:'Levantamento 2026',parentId:null,collapsed:true};
const sourceLayer={
  id:31,name:'Atitudes importadas',gtype:'point',crs:'EPSG:31982',visible:true,
  groupId:4,color:'#1f7a65',weight:5,fill:.17,labelField:'codigo',
  lbl:{onMap:true,size:11,color:'#17212b'},
  sym:{mode:'cat',field:'lito',cats:[
    {value:'GNA',color:'#8d6e63'},{value:'QZT',color:'#d4c48e'}
  ],pt:{shape:'triangle',size:23,rot:12}},
  fields:[
    {name:'codigo',type:'C',length:24,decimal:0},
    {name:'azimute',type:'N',length:8,decimal:1},
    {name:'dip',type:'N',length:8,decimal:1},
    {name:'lito',type:'C',length:60,decimal:0},
    {name:'comentario_original',type:'C',length:120,decimal:0}
  ],
  features:[
    {geom:[583700,7073500,511.2],multi:false,props:{
      codigo:'AT-001',azimute:360,dip:45,lito:'GNA',comentario_original:'medida no afloramento'
    }},
    {geom:[[583730,7073540,509.8]],multi:false,props:{
      codigo:'AT-002',azimute:125,dip:37,lito:'QZT',comentario_original:'bússola revisada'
    }},
    {geom:[583760,7073580],multi:false,props:{
      codigo:'AT-003',azimute:null,dip:null,lito:'GNA',comentario_original:'cadastro incompleto'
    }}
  ]
};
const otherLayer={
  id:12,name:'Base cartográfica',gtype:'line',crs:'EPSG:31982',visible:true,
  groupId:null,color:'#222222',fields:[],features:[]
};
const S={
  workCRS:'EPSG:31982',layers:[otherLayer,sourceLayer],rasters:[],
  groups:[importedGroup,geologyGroup],stack:['L:12','G:4','L:31','G:8'],
  activeId:31,selRaster:null,selFeat:null,geology:null
};
let gid=20,uid=100,draws=0,refreshes=0,propsRefreshes=0,zCalls=0;
const context={
  console,structuredClone,S,gid,uid,RIB_CAT_ATUAL:'geologia',window:null,
  document:{
    readyState:'loading',addEventListener(){},getElementById(){return null;},
    querySelector(){return null;},querySelectorAll(){return [];},
    createElement(){return {style:{},dataset:{},appendChild(){},remove(){},querySelector(){return null;}};},
    body:{appendChild(){}}
  },
  addLayer:def=>{
    const layer={id:uid++,visible:true,groupId:null,weight:2,fill:.35,
      sym:{mode:'single',color:def.color||'#f5a524'},...def,llayer:null};
    S.layers.unshift(layer);S.stack.unshift('L:'+layer.id);return layer;
  },
  drawLayer(){draws++;},refreshUI(){refreshes++;},propRefresh(){propsRefreshes++;},zApply(){zCalls++;},
  setTool(){},switchView(){},toast(){},fitAll(){},
  setTimeout(fn){if(typeof fn==='function')fn();return 1;},clearTimeout(){},
  Blob:class {},URL:{createObjectURL(){return '';},revokeObjectURL(){}},
};
context.window=context;
vm.createContext(context);
vm.runInContext(workspaceSource,context,{filename:'geology-workspace.js'});
vm.runInContext(mappingSource,context,{filename:'field-mapping.js'});

const geology=context.GeoMineGeology;
assert.ok(geology&&geology.fieldMapping,'GeoMineGeology.fieldMapping não foi publicado');
const fm=geology.fieldMapping;
for(const name of [
  'inferFieldMap','adoptLayer','validateObservation','createFieldMeta',
  'fieldValue','fieldRecord','isUsableObservation'
])assert.equal(typeof fm[name],'function',`fieldMapping.${name} deve ser uma função`);

/* A inferência usa nomes normalizados e sinônimos comuns de planilha/GPKG,
   sempre no sentido CAMPO_CANÔNICO -> campo de origem. */
const inferred=plain(fm.inferFieldMap(sourceLayer,'acamamento'));
assert.equal(inferred.DIRECAO,'azimute','AZIMUTE deve ser reconhecido como DIRECAO');
assert.equal(inferred.MERGULHO,'dip','DIP deve ser reconhecido como MERGULHO');
assert.equal(inferred.UNIDADE,'lito','LITO deve ser reconhecido como UNIDADE');
assert.equal(inferred.ID,'codigo','CODIGO deve ser reconhecido como ID');

const geometryBefore=plain(sourceLayer.features.map(feature=>feature.geom));
const propsBefore=plain(sourceLayer.features.map(feature=>feature.props));
const styleBefore=plain({
  name:sourceLayer.name,groupId:sourceLayer.groupId,color:sourceLayer.color,
  weight:sourceLayer.weight,fill:sourceLayer.fill,labelField:sourceLayer.labelField,
  lbl:sourceLayer.lbl,sym:sourceLayer.sym
});
const layersBefore=S.layers.slice(),groupsBefore=plain(S.groups),stackBefore=S.stack.slice();

const adopted=fm.adoptLayer(sourceLayer,{
  kind:'acamamento',fieldMap:inferred,orientationRef:'strike_rhr',
  origin:'observed',sourceFile:'atitudes_campo.gpkg'
});
assert.equal(adopted,sourceLayer,'adoção deve ocorrer na própria camada, sem criar cópia oculta');
assert.equal(sourceLayer._geology.kind,'acamamento');
assert.equal(sourceLayer._geology.family,'estruturas');
assert.equal(sourceLayer._geology.orientationRef,'strike_rhr');
assert.equal(sourceLayer._geology.sourceFile,'atitudes_campo.gpkg');
const adoptedMap=plain(sourceLayer._geology.fieldMap);
for(const [canonical,sourceName] of Object.entries(inferred)){
  assert.equal(adoptedMap[canonical],sourceName||canonical,
    `${canonical}: o mapa deve apontar à origem ou ao campo canônico criado`);
}

assert.deepEqual(plain(sourceLayer.features.map(feature=>feature.geom)),geometryBefore,
  'adotar uma camada não pode alterar coordenadas, Z, multipartes ou aninhamento');
for(let i=0;i<propsBefore.length;i++){
  for(const [key,value] of Object.entries(propsBefore[i]))
    assert.deepEqual(plain(sourceLayer.features[i].props[key]),value,
      `propriedade original ${key} da feição ${i} foi alterada`);
}
assert.deepEqual(plain({
  name:sourceLayer.name,groupId:sourceLayer.groupId,color:sourceLayer.color,
  weight:sourceLayer.weight,fill:sourceLayer.fill,labelField:sourceLayer.labelField,
  lbl:sourceLayer.lbl,sym:sourceLayer.sym
}),styleBefore,'estilo, rótulos, nome e grupo devem ser preservados por padrão');
assert.deepEqual(S.layers,layersBefore,'adoção não pode reordenar o vetor S.layers');
assert.deepEqual(plain(S.groups),groupsBefore,'adoção padrão não pode criar/reordenar grupos');
assert.deepEqual(S.stack,stackBefore,'adoção padrão não pode alterar a árvore de camadas');

const canonicalNames=new Set(sourceLayer.fields.map(field=>field.name));
for(const [name,sourceName] of Object.entries(inferred)){
  if(!sourceName)assert.ok(canonicalNames.has(name),
    `campo canônico ${name} sem equivalente de origem deve ser acrescentado ao esquema`);
}
assert.equal(fm.fieldValue(sourceLayer,sourceLayer.features[0],'ID'),'AT-001');
assert.equal(fm.fieldValue(sourceLayer,sourceLayer.features[0],'DIRECAO'),360,
  'o atributo importado bruto deve ser preservado');
assert.equal(fm.fieldValue(sourceLayer,sourceLayer.features[0],'MERGULHO'),45);
assert.equal(fm.fieldValue(sourceLayer,sourceLayer.features[0],'UNIDADE'),'GNA');
assert.equal(fm.fieldRecord(sourceLayer,sourceLayer.features[0],0).values.DIRECAO,0,
  'a leitura científica normalizada deve converter 360° em 0°');
assert.equal(sourceLayer.features[0]._field.status,'valid');
assert.equal(sourceLayer.features[2]._field.status,'draft',
  'registro estrutural ainda sem orientação deve continuar editável como rascunho');

/* Leitura canônica continua funcionando mesmo se o dado existir apenas no
   campo importado. Isso é essencial para seções e estereogramas. */
const aliasOnly={geom:[1,2],props:{azimute:270,dip:52,lito:'BIF'},_field:{status:'valid'}};
assert.equal(fm.fieldValue(sourceLayer,aliasOnly,'DIRECAO'),270);
assert.equal(fm.fieldValue(sourceLayer,aliasOnly,'MERGULHO'),52);
assert.equal(fm.fieldValue(sourceLayer,aliasOnly,'UNIDADE'),'BIF');
const record=plain(fm.fieldRecord(sourceLayer,aliasOnly,9));
assert.equal(record.layerId,31);
assert.equal(record.featureIndex,9);
assert.equal(record.kind,'acamamento');
assert.equal(record.values.DIRECAO,270);
assert.equal(record.values.MERGULHO,52);
assert.equal(record.meta.status,'valid');

/* Validação distingue rascunho incompleto de valor preenchido porém inválido.
   A função devolve cópias normalizadas, sem reescrever silenciosamente o input. */
const draft=fm.validateObservation('acamamento',{DIRECAO:null,MERGULHO:null},{origin:'observed'});
assert.equal(draft.status,'draft');
assert.ok(Array.isArray(draft.errors));
const invalid=fm.validateObservation('acamamento',{DIRECAO:35,MERGULHO:91},{origin:'observed'});
assert.equal(invalid.status,'invalid');
assert.ok(invalid.errors.length>0,'medida inválida precisa explicar o erro');
const directionInput={DIRECAO:360,MERGULHO:90};
const valid=fm.validateObservation('acamamento',directionInput,{origin:'observed',orientationRef:'strike_rhr'});
assert.equal(valid.status,'valid');
assert.equal(valid.props.DIRECAO,0,'360° e 0° representam a mesma direção');
assert.equal(valid.props.MERGULHO,90,'mergulho vertical é válido');
assert.equal(directionInput.DIRECAO,360,'validação não deve mutar o objeto recebido');
for(const [kind,props] of [
  ['foliacao',{DIRECAO:-1,MERGULHO:30}],
  ['xistosidade',{DIRECAO:40,MERGULHO:-.1}],
  ['lineacao',{DIRECAO:361,CAIMENTO:20}],
  ['plunging',{DIRECAO:180,CAIMENTO:90.1}]
])assert.equal(fm.validateObservation(kind,props,{origin:'observed'}).status,'invalid',
  `${kind}: faixa de orientação deve ser validada`);

const meta=plain(fm.createFieldMeta(sourceLayer,aliasOnly,{
  source:'gpkg',origin:'observed',sourceFile:'atitudes_campo.gpkg',
  observedAt:'2026-09-18T12:30:00.000Z',operator:'Equipe A',accuracyM:2.4,
  orientationAccuracyDeg:3,altitudeSource:'gps'
}));
assert.equal(meta.schemaVersion,1);
assert.equal(meta.source,'gpkg');
assert.equal(meta.origin,'observed');
assert.equal(meta.sourceFile,'atitudes_campo.gpkg');
assert.equal(meta.observedAt,'2026-09-18T12:30:00.000Z');
assert.equal(meta.operator,'Equipe A');
assert.equal(meta.accuracyM,2.4);
assert.equal(meta.orientationAccuracyDeg,3);
assert.equal(meta.altitudeSource,'gps');
assert.equal(meta.status,'valid');
assert.equal(fm.isUsableObservation({_field:{status:'valid'}}),true);
assert.equal(fm.isUsableObservation({_field:{status:'draft'}}),false);
assert.equal(fm.isUsableObservation({_field:{status:'invalid'}}),false);
assert.equal(fm.isUsableObservation({}),true,
  'feições legadas sem metadado continuam utilizáveis por compatibilidade');

/* Idempotência: reaplicar a mesma adoção não duplica campos, não muda dados
   e não acrescenta nós à árvore. */
const once=plain(sourceLayer),onceFieldNames=sourceLayer.fields.map(field=>field.name);
fm.adoptLayer(sourceLayer,{
  kind:'acamamento',fieldMap:inferred,orientationRef:'strike_rhr',
  origin:'observed',sourceFile:'atitudes_campo.gpkg'
});
assert.deepEqual(plain(sourceLayer),once,'adoção repetida deve ser idempotente');
assert.equal(new Set(sourceLayer.fields.map(field=>field.name)).size,onceFieldNames.length,
  'adoção repetida não pode duplicar campos');
assert.deepEqual(S.stack,stackBefore,'adoção repetida não pode duplicar nós da árvore');

const incompatible={
  id:88,name:'Contato linear',gtype:'line',crs:'EPSG:31982',groupId:null,
  fields:[],features:[{geom:[[0,0],[1,1]],props:{}}],
  color:'#111111',sym:{mode:'single',color:'#111111'}
};
const incompatibleBefore=plain(incompatible);
assert.throws(()=>fm.adoptLayer(incompatible,{kind:'litologia'}),/geometr|incompat/i,
  'camada linear não pode ser adotada como litologia poligonal');
assert.deepEqual(plain(incompatible),incompatibleBefore,
  'rejeição por geometria incompatível deve acontecer antes de qualquer mutação');

/* O contrato inteiro precisa sobreviver a JSON, como acontece no .ccmgis. */
const serialized=JSON.stringify(sourceLayer);
assert.doesNotThrow(()=>JSON.parse(serialized));
const reopened=JSON.parse(serialized);
assert.equal(reopened._geology.kind,'acamamento');
assert.deepEqual(reopened._geology.fieldMap,adoptedMap);
assert.equal(reopened.features[0]._field.status,'valid');
assert.equal(reopened.features[2]._field.status,'draft');
assert.equal(reopened.features[0].props.comentario_original,'medida no afloramento');

assert.ok(draws+refreshes+propsRefreshes+zCalls>=0,
  'contadores de UI permanecem disponíveis para o módulo, sem impor redesenho à adoção pura');
console.log('OK: adoção geológica preserva a camada, mapeia campos, valida observações e persiste em JSON.');
