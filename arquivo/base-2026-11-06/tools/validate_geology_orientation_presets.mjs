import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=relative=>fs.readFileSync(new URL('../'+relative,import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
let nextId=1;
const context={
  console,S:{layers:[],groups:[],stack:[],workCRS:'EPSG:31982'},gid:1,
  drawLayer(){},refreshUI(){},propRefresh(){},zApply(){},undoPush(){},openFeatForm(){},
  addLayer(def){const layer={id:nextId++,sym:{},...def};context.S.layers.push(layer);return layer;},
  setTimeout(){},clearTimeout(){},document:{},
  fromWGS(_crs,x,y){return [x,y];}
};
context.window=context;vm.createContext(context);
vm.runInContext(read('src/modules/geology/geology-workspace.js'),context);
vm.runInContext(read('src/modules/geology/field-mapping.js'),context);
const drawing=read('src/core/parts/08-selection-and-drawing.js');
vm.runInContext(drawing.slice(drawing.indexOf('function addFeature('),drawing.indexOf('/* formulário rápido')),context);
const api=context.GeoMineGeology,fm=api.fieldMapping;

function draw(layer){
  const geom=layer.gtype==='polygon'?[[[0,0],[1,0],[1,1],[0,0]]]:[[0,0],[1,1]];
  context.addFeature(layer,geom,layer.gtype==='polygon');return layer.features.at(-1);
}
for(const kind of ['falha','fratura','veio','dique','zona-cisalhamento']){
  context.S.layers=[];
  const layer=api.createOrActivate(kind),def=api.presets[kind];
  for(const name of ['DIRECAO','MERGULHO','REF_ORIENT'])assert.ok(layer.fields.some(field=>field.name===name),`${kind}: missing ${name}`);
  const fresh=draw(layer);
  assert.equal(fresh.props.REF_ORIENT,'strike_rhr',`${kind}: new observation must carry its explicit convention`);
  fresh.props.DIRECAO=0;fresh.props.MERGULHO=45;
  assert.equal(fm.orientationOf(layer,fresh).valid,true,`${kind}: own planar attitude should be usable`);
  fresh.props.ID='V-01';delete fresh.props.FID;
  assert.equal(fm.fieldValue(layer,fresh,'FID'),undefined,`${kind}: absent numeric FID must not use textual ID`);
  const freshRecord=fm.fieldRecord(layer,fresh,layer.features.length-1);
  assert.equal(freshRecord.meta.status,'valid',`${kind}: current values are valid even without FID`);
  assert.notEqual(freshRecord.status,'invalid',`${kind}: saved draft status must not become a numeric ID error`);

  const legacy={id:100+nextId++,name:'Legacy '+kind,gtype:def.gtype,crs:'EPSG:31982',
    _geology:{kind},sym:{mode:'single',color:'#abcdef'},fields:[{name:'DIRECAO',type:'N'},{name:'MERGULHO',type:'N'},{name:'CUSTOM',type:'C'}],
    features:[{geom:fresh.geom,props:{DIRECAO:25,MERGULHO:40,CUSTOM:'preserve'}}]};
  const original=plain(legacy.features),metadata=plain(legacy._geology);
  context.S.layers=[legacy];api.restore({});api.createOrActivate(kind);
  assert.deepEqual(plain(legacy.features),original,`${kind}: restoring/arming cannot write convention into legacy observations`);
  assert.equal(legacy._geology.orientationRef,metadata.orientationRef);
  assert.equal(fm.orientationOf(legacy,legacy.features[0]).valid,false,`${kind}: ambiguous legacy orientation stays unresolved`);
  assert.equal(draw(legacy).props.REF_ORIENT,'strike_rhr',`${kind}: new features on an old layer receive the default`);
  assert.equal(Object.hasOwn(legacy.features[0].props,'REF_ORIENT'),false);
  assert.equal(legacy.features[0].props.CUSTOM,'preserve');
}

const mapped={id:200,name:'Mapped fractures',gtype:'line',crs:'EPSG:31982',
  _geology:{kind:'fratura',orientationRef:'dip_direction',fieldMap:{DIRECAO:'azimuth',MERGULHO:'dip',REF_ORIENT:'convention'}},
  fields:[{name:'azimuth',type:'N'},{name:'dip',type:'N'},{name:'convention',type:'C'}],
  features:[{geom:[[0,0],[1,1]],props:{azimuth:90,dip:35,convention:'dip_direction'}}],sym:{mode:'single'}};
const mappedBefore=plain(mapped.features);
context.S.layers=[mapped];api.restore({});api.createOrActivate('fratura');
assert.deepEqual(plain(mapped.features),mappedBefore);
assert.equal(draw(mapped).props.convention,'dip_direction','new mapped observations respect the explicitly chosen layer convention');
assert.equal(mapped.fields.some(field=>field.name==='REF_ORIENT'),false,'a mapped convention must not be shadowed by a second canonical column');

const strikeAlias={id:201,name:'Unambiguous strike alias',gtype:'line',_geology:{kind:'veio'},
  fields:[{name:'STRIKE',type:'N'},{name:'DIP',type:'N'}],
  features:[{geom:[[0,0],[1,1]],props:{STRIKE:75,DIP:30}}],sym:{mode:'single'}};
context.S.layers=[strikeAlias];api.createOrActivate('veio');
assert.equal(fm.orientationOf(strikeAlias,strikeAlias.features[0]).strike,75,'schema extension must not shadow unambiguous imported fields');
assert.equal(strikeAlias.fields.some(field=>field.name==='DIRECAO'),false);

console.log('OK: structural presets expose their own attitude; only new features receive orientation defaults, preserving ambiguous legacy data and source field mappings.');
