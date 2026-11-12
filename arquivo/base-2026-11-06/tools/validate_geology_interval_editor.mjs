import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/modules/geology/geology-workspace.js',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
let modal=null;
const messages=[];
function modalElement(){
  const controls=new Map(),events=new Map();
  const node={innerHTML:'',className:'',textContent:'',value:'',
    querySelector(selector){
      if(selector==='tr:last-child input')return null;
      if(!controls.has(selector))controls.set(selector,modalElement());
      return controls.get(selector);
    },
    querySelectorAll(){return [];},
    addEventListener(name,fn){events.set(name,fn);},
    dispatch(name,event){events.get(name)?.(event);},
    remove(){this.removed=true;if(modal===this)modal=null;}
  };
  return node;
}
const context={
  console,S:{layers:[],groups:[],stack:[],workCRS:'EPSG:31982'},gid:0,
  document:{querySelector(){return modal;},createElement(){return modalElement();},body:{appendChild(node){modal=node;}}},
  drawLayer(){},refreshUI(){},toast(message){messages.push(message);},
  switchView(){},setTool(){},setTimeout(){},confirm(){return true;}
};
context.window=context;
vm.createContext(context);vm.runInContext(source,context);
const api=context.GeoMineGeology;
const validate=api.validateBoreholeIntervals;

for(const kind of ['litologia','dique','zona-cisalhamento','dominio-geologico'])
  assert.equal(api.presets[kind].hatch,'solid',`${kind} must not imply a rock type`);

const valid=validate([
  {DE_M:'0',ATE_M:'2.5',REC_PCT:'',RQD_PCT:null,LITOLOGIA:'Granito',CUSTOM:{source:'lab'}},
  {DE_M:2.5,ATE_M:5,REC_PCT:100,RQD_PCT:0}
],{depth:5});
assert.equal(valid.valid,true);
assert.deepEqual(plain(valid.rows[0]),{DE_M:0,ATE_M:2.5,REC_PCT:null,RQD_PCT:null,LITOLOGIA:'Granito',CUSTOM:{source:'lab'}});
assert.equal(validate([{DE_M:0,ATE_M:100}],{depth:null}).valid,true,'unknown depth is not zero');
assert.equal(validate([{DE_M:0,ATE_M:1}],{depth:0}).valid,false,'known zero depth is a bound');
assert.equal(validate([{DE_M:0,ATE_M:1}],{depth:-1}).valid,false,'invalid known hole depth is flagged');
assert.equal(validate([{DE_M:5,ATE_M:10},{DE_M:0,ATE_M:5}],{depth:10}).valid,true,'disjoint unsorted rows may be preserved');
for(const row of [
  {DE_M:null,ATE_M:1},{DE_M:'',ATE_M:1},{ATE_M:1},{DE_M:NaN,ATE_M:1},
  {DE_M:0,ATE_M:Infinity},{DE_M:0,ATE_M:''},{DE_M:-1,ATE_M:1},
  {DE_M:3,ATE_M:3},{DE_M:3,ATE_M:2},{DE_M:0,ATE_M:11},
  {DE_M:0,ATE_M:1,REC_PCT:-1},{DE_M:0,ATE_M:1,RQD_PCT:101},
  {DE_M:0,ATE_M:1,REC_PCT:Infinity},{DE_M:0,ATE_M:1,RQD_PCT:'bad'},
  {DE_M:false,ATE_M:1}
]){
  const result=validate([row],{depth:10});
  assert.equal(result.valid,false,`invalid row accepted: ${JSON.stringify(row)}`);
  assert.ok(result.errors.length&&result.rowErrors[0].length);
}
for(const rows of [
  [{DE_M:0,ATE_M:8},{DE_M:3,ATE_M:6}],
  [{DE_M:4,ATE_M:9},{DE_M:0,ATE_M:5}],
  [{DE_M:0,ATE_M:10},{DE_M:1,ATE_M:2},{DE_M:3,ATE_M:4}]
])assert.equal(validate(rows).valid,false,'overlapping intervals must be rejected regardless of ordering');

const layer={id:1,_geology:{kind:'sondagem'},features:[
  {props:{ID_FURO:'A',PROF_M:10},geologyLog:[{DE_M:0,ATE_M:2,LITOLOGIA:'A',CUSTOM:{note:'preserve'}}],coreRuns:[{untouched:true}],other:'keep'},
  {props:{ID_FURO:'B',PROF_M:8},geologyLog:[{DE_M:0,ATE_M:2,LITOLOGIA:'B'}]}
]};
const before=plain(layer);
context.S.layers.push(layer);
const draft=api.createBoreholeIntervalDraft('log');
draft.rowsFor(layer,0)[0].ATE_M=5;
draft.rowsFor(layer,1)[0].ATE_M=9;
assert.deepEqual(plain(layer),before,'editing multiple drafts must not mutate the features');
assert.equal(draft.commit().valid,false);
assert.deepEqual(plain(layer),before,'an invalid second borehole must prevent the first from committing');
draft.rowsFor(layer,1)[0].ATE_M=8;
assert.equal(draft.commit().count,2);
assert.equal(layer.features[0].geologyLog[0].ATE_M,5);
assert.equal(layer.features[1].geologyLog[0].ATE_M,8);
assert.deepEqual(plain(layer.features[0].geologyLog[0].CUSTOM),{note:'preserve'});
assert.deepEqual(plain(layer.features[0].coreRuns),before.features[0].coreRuns);
assert.equal(layer.features[0].other,'keep');
assert.equal(draft.hasChanges(),false);

const saved=plain(layer),cancelled=api.createBoreholeIntervalDraft('log');
cancelled.rowsFor(layer,0).splice(0,1);
cancelled.discard();
assert.deepEqual(plain(layer),saved,'discard must preserve saved intervals');
assert.equal(cancelled.commit().count,0);

const uneditedLayer={features:[
  {props:{ID_FURO:'Invalid legacy',PROF_M:10},geologyLog:[{DE_M:0,ATE_M:11}]},
  {props:{ID_FURO:'Valid edited',PROF_M:10},geologyLog:[{DE_M:0,ATE_M:2}]}
]},visited=api.createBoreholeIntervalDraft('log'),uneditedBefore=plain(uneditedLayer);
context.S.layers.push(uneditedLayer);
visited.rowsFor(uneditedLayer,0);
assert.equal(visited.hasChanges(),false);
assert.equal(visited.commit().valid,false,'Concluir must reject an unchanged invalid visited table');
visited.rowsFor(uneditedLayer,1)[0].ATE_M=3;
assert.equal(visited.commit().valid,false,'invalid visited table must also block another valid pending edit');
assert.deepEqual(plain(uneditedLayer),uneditedBefore);
visited.discard();
assert.deepEqual(plain(uneditedLayer),uneditedBefore,'discard preserves invalid preexisting data');

const concurrent=api.createBoreholeIntervalDraft('log');
concurrent.rowsFor(layer,0)[0].ATE_M=6;
layer.features[0].geologyLog[0].LITOLOGIA='External edit';
assert.equal(concurrent.commit().valid,false);
assert.equal(layer.features[0].geologyLog[0].LITOLOGIA,'External edit','concurrent changes must not be overwritten');
assert.equal(layer.features[0].geologyLog[0].ATE_M,5);

for(const key of ['REC_PCT','RQD_PCT'])for(const invalidValue of [NaN,Infinity,-Infinity]){
  const rawRows=[{DE_M:0,ATE_M:1,[key]:invalidValue}],importedLayer={features:[{props:{ID_FURO:'Nonfinite import',PROF_M:5},coreRuns:rawRows}]},
    session=api.createBoreholeIntervalDraft('core');
  context.S.layers.push(importedLayer);
  const editable=session.rowsFor(importedLayer,0);
  assert.ok(Object.is(editable[0][key],invalidValue),'the draft must preserve nonfinite imported optional values for validation');
  assert.equal(session.hasChanges(),false,'opening the table cannot normalize an imported value');
  assert.equal(session.commit().valid,false,`${key} ${invalidValue} cannot be accepted as an optional blank`);
  assert.equal(importedLayer.features[0].coreRuns,rawRows,'a rejected commit cannot replace the original array');
  assert.ok(Object.is(rawRows[0][key],invalidValue));
  editable[0][key]=null;
  assert.equal(session.hasChanges(),true,'explicitly clearing NaN/Infinity must be recognized as a real edit');
  assert.equal(session.commit().valid,true);
  assert.equal(importedLayer.features[0].coreRuns[0][key],null,'the user can explicitly clear an invalid optional value');
}
const conflictRows=[{DE_M:0,ATE_M:1,REC_PCT:Infinity}],nonfiniteConflict={features:[{props:{PROF_M:5},coreRuns:conflictRows}]},
  correction=api.createBoreholeIntervalDraft('core');
context.S.layers.push(nonfiniteConflict);
correction.rowsFor(nonfiniteConflict,0)[0].REC_PCT=80;
conflictRows[0].REC_PCT=NaN;
const conflictResult=correction.commit();
assert.equal(conflictResult.valid,false);
assert.ok(conflictResult.errors.some(error=>error.includes('alterados durante a edição')),
  'concurrent Infinity-to-NaN changes must not collapse to the same JSON null fingerprint');
assert.ok(Number.isNaN(conflictRows[0].REC_PCT),'a concurrency conflict preserves the external change');

// The known depth can live in a mapped source column, not only in PROF_M.
context.GeoMineGeology.fieldMapping={fieldValue(_layer,feature){return feature.props.total_depth;}};
const imported={features:[{props:{ID_FURO:'Imported',total_depth:2}}]},mapped=api.createBoreholeIntervalDraft('core');
context.S.layers.push(imported);
mapped.rowsFor(imported,0).push({DE_M:0,ATE_M:3,REC_PCT:null});
assert.equal(mapped.commit().valid,false);
assert.equal(imported.features[0].coreRuns,undefined);
mapped.rowsFor(imported,0)[0].ATE_M=2;
assert.equal(mapped.commit().valid,true);
assert.equal(imported.features[0].coreRuns[0].REC_PCT,null);
assert.equal(Object.hasOwn(imported.features[0].coreRuns[0],'RQD_PCT'),false,'absent optional fields must remain absent');
delete context.GeoMineGeology.fieldMapping;
const removed=api.createBoreholeIntervalDraft('log');removed.rowsFor(layer,0)[0].ATE_M=7;
context.S.layers=context.S.layers.filter(L=>L!==layer);
assert.equal(removed.commit().valid,false,'reopening another project cannot commit a stale interval editor');

// Exercise actual modal button handlers: add is a draft, cancel never creates
// the feature property, an invalid Concluir stays open, and valid save commits.
const uiLayer={id:2,name:'UI holes',_geology:{kind:'sondagem'},features:[{props:{ID_FURO:'UI',PROF_M:0}}]};
context.S.layers=[uiLayer];context.S.selFeat={layer:uiLayer,idx:0};
for(const closeAction of ['cancel','close','backdrop']){
  api.openBoreholeEditor('log');
  const root=modal;
  root.querySelector('[data-act="add"]').onclick();
  assert.equal(uiLayer.features[0].geologyLog,undefined);
  if(closeAction==='backdrop')root.dispatch('mousedown',{target:root});
  else root.querySelector(`[data-act="${closeAction}"]`).onclick();
  assert.equal(root.removed,true);
  assert.equal(uiLayer.features[0].geologyLog,undefined,`${closeAction} must discard pending intervals`);
}
api.openBoreholeEditor('core');
const root=modal;
root.querySelector('[data-act="add"]').onclick();
root.querySelector('[data-act="done"]').onclick();
assert.equal(root.removed,undefined,'invalid save must leave the dialog open');
assert.equal(uiLayer.features[0].coreRuns,undefined,'invalid save must leave the feature untouched');
assert.match(root.querySelector('[data-role="validation"]').textContent,/ultrapassa/);
uiLayer.features[0].props.PROF_M=2;
root.querySelector('[data-act="done"]').onclick();
assert.equal(root.removed,true);
assert.deepEqual(plain(uiLayer.features[0].coreRuns),[{DE_M:0,ATE_M:1,REC_PCT:null,RQD_PCT:null,LITOLOGIA:'',OBS:''}]);

uiLayer.features[0].geologyLog=[{DE_M:null,ATE_M:1}];
const invalidBefore=plain(uiLayer.features[0]);
api.openBoreholeEditor('log');
const unchangedInvalid=modal;
unchangedInvalid.querySelector('[data-act="done"]').onclick();
assert.equal(unchangedInvalid.removed,undefined,'unchanged invalid loaded data must keep Concluir open');
assert.match(unchangedInvalid.querySelector('[data-role="validation"]').textContent,/inicial numérica/);
unchangedInvalid.querySelector('[data-act="cancel"]').onclick();
assert.deepEqual(plain(uiLayer.features[0]),invalidBefore,'Cancelar must preserve even preexisting invalid values');

console.log('OK: neutral geology hatches; interval validation, atomic multi-hole save, optional nulls, conflict protection and modal discard/save handlers.');
