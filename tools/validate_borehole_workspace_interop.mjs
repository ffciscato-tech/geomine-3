import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),plain=value=>JSON.parse(JSON.stringify(value));
const source=read('src/modules/geology/geology-workspace.js');
let checks=0;
function test(name,run){run();checks++;console.log('OK · '+name);}
function imported(){return {
  id:1,name:'Sondagens · Collar + Survey',gtype:'point',crs:'EPSG:31982',locked:true,visible:false,
  _geology:{kind:'sondagem',importedBoreholes:true,source:'imported'},sym:{mode:'single',color:'#478c77'},
  fields:[{name:'ID_FURO',type:'C'},{name:'PROF_M',type:'N'}],features:[{
    geom:[[700000,7800000,500]],props:{ID_FURO:'BH-01',PROF_M:100},
    boreholeTrace:[{x:700000,y:7800000,z:500,md:0},{x:700010,y:7800000,z:410,md:100}],
    boreholeSurvey:[{md:0,az:90,dip:80},{md:100,az:90,dip:75}],
    boreholeSource:{method:'minimum-curvature',files:['collar.csv','survey.csv']},
    boreholeTables:[{name:'assay.csv',rows:[{DE_M:0,ATE_M:50,CU_PCT:.7}]}],
    geologyLog:[{DE_M:0,ATE_M:100,LITOLOGIA:'Gnaisse'}],coreRuns:[{DE_M:0,ATE_M:100,REC_PCT:90,RQD_PCT:70}]
  }]
};}
function fixture(layers){
  let next=100,armed=null;const context={window:{},console,S:{layers,groups:[],stack:[],workCRS:'EPSG:31982'},gid:1,RIB_CAT_ATUAL:'inicio',
    document:{},drawLayer(){},refreshUI(){},propRefresh(){},zApply(){},undoPush(){},toast(){},switchView(){},
    addLayer(def){const layer={id:next++,sym:{},...def};context.S.layers.push(layer);return layer;},
    setTool(tool){armed=tool;},setTimeout(fn){fn();return 0;},clearTimeout(){}};
  vm.createContext(context);vm.runInContext(source,context);
  return {context,api:context.window.GeoMineGeology,get armed(){return armed;}};
}
test('desenhar nova sondagem cria camada manual sem reutilizar importada bloqueada',()=>{
  const layer=imported(),before=plain(layer),f=fixture([layer]),manual=f.api.createOrActivate('sondagem');
  assert.notEqual(manual.id,layer.id);assert.equal(f.context.S.layers.length,2);assert.equal(f.context.S.activeId,manual.id);
  assert.equal(manual.gtype,'point');assert.equal(manual._geology.kind,'sondagem');assert.notEqual(manual._geology.importedBoreholes,true);
  assert.notEqual(manual.locked,true);assert.equal(manual.features.length,0);assert.deepEqual(plain(layer),before);
});
test('camada manual existente é reutilizada mesmo quando a importada vem primeiro',()=>{
  const layer=imported(),manual={id:2,name:'Sondagens de campo',gtype:'point',visible:false,_geology:{kind:'sondagem'},fields:[],features:[],sym:{}},
    f=fixture([layer,manual]);
  assert.equal(f.api.createOrActivate('sondagem'),manual);assert.equal(f.context.S.layers.length,2);assert.equal(manual.visible,true);
  assert.equal(layer.locked,true);assert.equal(layer.visible,false);
});
test('acionar ferramenta de ponto seleciona somente a camada manual',()=>{
  const layer=imported(),f=fixture([layer]),manual=f.api.arm('sondagem');
  assert.equal(f.armed,'point');assert.equal(f.context.S.activeId,manual.id);assert.notEqual(manual.id,layer.id);assert.equal(layer.features.length,1);
});
test('restaurar workspace protege importadas sem mudar trace, survey ou observações',()=>{
  const layer=imported();layer.locked=false;const f=fixture([layer]),before=plain(layer.features);
  f.api.restore({schemaVersion:1,sections:[],settings:{}});assert.equal(layer.locked,true);assert.deepEqual(plain(layer.features),before);
  assert.equal(layer.features[0].boreholeTrace.at(-1).md,100);
});
test('logs de sondagem importada continuam editáveis sem alterar o survey/trace',()=>{
  const layer=imported(),f=fixture([layer]),source=plain(layer.features[0]),draft=f.api.createBoreholeIntervalDraft('log');
  draft.rowsFor(layer,0)[0].LITOLOGIA='Granito';assert.equal(draft.commit().valid,true);assert.equal(layer.features[0].geologyLog[0].LITOLOGIA,'Granito');
  for(const key of ['geom','boreholeTrace','boreholeSurvey','boreholeSource','boreholeTables','coreRuns'])assert.deepEqual(plain(layer.features[0][key]),source[key]);
  assert.equal(layer.locked,true);
});
test('edição de testemunhos conserva logs e dados de laboratório da importação',()=>{
  const layer=imported(),f=fixture([layer]),source=plain(layer.features[0]),draft=f.api.createBoreholeIntervalDraft('core');
  draft.rowsFor(layer,0)[0].RQD_PCT=85;assert.equal(draft.commit().valid,true);assert.equal(layer.features[0].coreRuns[0].RQD_PCT,85);
  for(const key of ['geom','boreholeTrace','boreholeSurvey','boreholeSource','boreholeTables','geologyLog'])assert.deepEqual(plain(layer.features[0][key]),source[key]);
});
console.log(`${checks} regressões de interoperabilidade do workspace de sondagens aprovadas.`);
