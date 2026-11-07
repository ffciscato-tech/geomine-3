import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const plain=v=>JSON.parse(JSON.stringify(v));
const layer={id:1,_geology:{kind:'sondagem',importedBoreholes:true},fields:[],features:[
  {geom:[[10,20]],zg:[100],props:{ID_FURO:'001',PROF_M:10,COTA_BOCA:100,AZIMUTE:45,INCLINACAO:60,SURPAC_STRING:7,DESCRIPTIONS:['001','toe'],STATUS:'Original'},boreholeTrace:[{x:10,y:20,z:100,md:0},{x:15,y:25,z:92,md:10}],boreholeSurvey:[{md:0,az:45,dip:60}],boreholeSource:{method:'original-xyz-polyline',collarAttributes:{DESCRIPTIONS:['001','toe']}},geologyLog:[{DE_M:0,ATE_M:10,LITOLOGIA:'Calcário'}]},
  {props:{ID_FURO:'002'}}
]};
const context={S:{layers:[layer],activeId:1},window:{GeoMineGeology:{}},console};
vm.runInNewContext(fs.readFileSync(new URL('../src/modules/geology/borehole-properties.js',import.meta.url),'utf8'),context);
const api=context.window.GeoMineGeology.boreholeProperties,t=api.__test;
const before=plain(layer.features[0]),draft=t.propertyDraft(layer,0);
draft.props.ID_FURO='renamed';draft.props.STATUS='Revisado';draft.props.DESCRIPTIONS[1]='Descrição revisada';
assert.deepEqual(plain(layer.features[0]),before,'opening/editing a draft is not mutation');
draft.commit(draft.props);
assert.equal(layer.features[0].props.ID_FURO,'renamed');assert.equal(layer.features[0].props.DESCRIPTIONS[1],'Descrição revisada');
for(const key of ['geom','zg','boreholeTrace','boreholeSurvey','boreholeSource','geologyLog'])assert.deepEqual(plain(layer.features[0][key]),before[key],key+' must be preserved');
assert.ok(layer.fields.some(f=>f.name==='STATUS'));
for(const mutation of [p=>p.ID_FURO='002',p=>p.ID_FURO=' ',p=>p.PROF_M=8,p=>p.COTA_BOCA=200,p=>p.AZIMUTE=0,p=>p.DESCRIPTIONS=['only one'],p=>p.SURPAC_STRING=Infinity,p=>p.EXTRA={n:Infinity}]){
  const d=t.propertyDraft(layer,0),snapshot=plain(layer.features[0]);mutation(d.props);assert.throws(()=>d.commit(d.props));assert.deepEqual(plain(layer.features[0]),snapshot);
}
const stale=t.propertyDraft(layer,0);layer.features[0].props.STATUS='externally updated';assert.throws(()=>stale.commit(stale.props),/mudou/);
const removed=t.propertyDraft(layer,0);context.S.layers=[];assert.throws(()=>removed.commit(removed.props),/não está mais/);context.S.layers=[layer];
context.window.GeoMineCollaboration={snapshot:()=>({roomId:'room'})};const shared=t.propertyDraft(layer,0);assert.throws(()=>shared.commit(shared.props),/cópia local/);delete context.window.GeoMineCollaboration;
const other={id:2,_geology:{kind:'sondagem'},features:[{props:{ID_FURO:'selected'}}]};context.S.layers.unshift(other);context.S.activeId=1;
assert.equal(api.resolveTarget().layer,layer,'active layer precedes first layer');context.S.selFeat={layer:other,idx:0};assert.equal(api.resolveTarget().layer,other,'selected feature precedes active layer');assert.equal(api.resolveTarget({layer,index:1}).index,1,'explicit target wins');
console.log('PASS: metadata drafts, cancellation, unique IDs, trace/MD/source preservation, geometry read-only, conflict and selection priority.');
