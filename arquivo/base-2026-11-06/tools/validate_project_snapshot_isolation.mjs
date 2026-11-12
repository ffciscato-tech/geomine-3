import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const core=fs.readFileSync(path.join(root,'src/core/parts/26-project-persistence.js'),'utf8');
const moduleSource=fs.readFileSync(path.join(root,'src/modules/persistence/alagis-130-gravacao-por-partes.js'),'utf8');
const printing=fs.readFileSync(path.join(root,'src/core/parts/17-layout-printing.js'),'utf8');
const extensions=fs.readFileSync(path.join(root,'src/core/parts/18-lidar-layout-extensions.js'),'utf8');
const start=core.indexOf('function projectData(){');
const serializer=core.slice(start,core.indexOf('/* ============================================================================',start));
const loadStart=core.indexOf('function loadProject(d){');
// This test intentionally executes only the loading prelude. Close the real
// opening transaction as well as the function when extracting that prefix.
const loadPrelude=core.slice(loadStart,core.indexOf('  const defSym=',loadStart))+'\n  }finally{openingScope.end();}\n}';
const fullLoad=core.slice(loadStart,core.indexOf("document.getElementById('btnSave').onclick",loadStart));
const layer=(id,name)=>({id,name,gtype:'point',crs:'EPSG:31982',visible:true,color:'#22ff00',
  fields:[{name:'NOME',type:'C'}],sym:{mode:'single',size:8},
  features:[{geom:[[1,2]],props:{NOME:name}}]});
function runtime(){
  const S={_view:'map',auto:{name:'Novo.ccmgis'},projectId:'novo',groups:[],rasters:[],plates:[],
    hidro:{serie:null,idf:null},layers:[layer(1,'A'),layer(2,'B')],workCRS:'EPSG:31982'};
  const calls={invalidations:[],opening:{begin:0,end:0}};
  const context={S,console:{info(){},warn(){}},Blob,TextEncoder,
    document:{getElementById:()=>null},autoAreaSyncAll(){},labelCfg:()=>({}),saveProject(){},autosaveNow(){},
    layoutClone:x=>JSON.parse(JSON.stringify(x)),loadProject(){},reparaGeom:()=>({nL:0,nF:0}),
    setOpenProjectName:name=>{S.currentProjectName=name;},map:{removeLayer(){}},gid:1,
    CRS_DEFS:{'EPSG:31982':{}},layoutInvalidateOrtho:(...args)=>calls.invalidations.push(args),
    GeoMineProjectOpening:{
      begin(){calls.opening.begin++;return {end(){calls.opening.end++;}};},
      restore(item,type){return type==='L'?context.drawLayer(item):context.renderRaster(item);}
    }};
  context.window=context;vm.createContext(context);
  vm.runInContext(serializer,context);vm.runInContext(moduleSource,context);vm.runInContext(loadPrelude,context);
  return {context,S,calls};
}
{
  const {context,S}=runtime(),snapshot=context.projectData();
  assert.notEqual(snapshot.layers[0].features,S.layers[0].features);
  assert.notEqual(snapshot.layers[0].features[0].props,S.layers[0].features[0].props);
  assert.notEqual(snapshot.layers[0].sym,S.layers[0].sym);
  assert.notEqual(snapshot.layers[0].fields,S.layers[0].fields);
  S.layers[0].features[0].props.NOME='ALTERADO';S.layers[0].features[0].geom[0][0]=99;
  S.layers[0].sym.size=99;S.layers[0].fields[0].name='NOVO';
  assert.equal(snapshot.layers[0].features[0].props.NOME,'A');
  assert.equal(snapshot.layers[0].features[0].geom[0][0],1);
  assert.equal(snapshot.layers[0].sym.size,8);assert.equal(snapshot.layers[0].fields[0].name,'NOME');
  console.log('OK · atributos, geometria, estilo e campos pertencem ao snapshot independente');
}
{
  const {context,S}=runtime(),snapshot=context.projectData();let file='',changed=false;
  for(const part of context.projectPedacos(snapshot)){
    file+=part;
    if(!changed&&part.includes('"name":"A"')){
      changed=true;S.layers[0].features[0].props.NOME='ALTERADO';S.layers[1].features[0].props.NOME='ALTERADO';
    }
  }
  const recovery=[...context.projectPedacos(snapshot)].join('');
  assert.equal(file,recovery,'escrita por partes e backup precisam conter exatamente os mesmos bytes');
  assert.deepEqual(JSON.parse(file).layers.map(l=>l.features[0].props.NOME),['A','B']);
  console.log('OK · edição entre pedaços não mistura versões nem muda a cópia de recuperação');
}
{
  const {context,S,calls}=runtime();
  S._view='layout';S._preLayoutMapState={vis:{'L:1':false},conv:{'L:1':{name:'ANTIGO',color:'#000000'}}};
  S._lastSVG='<svg>antigo</svg>';S._loDraftVis={old:true};S._loDraftConv={old:true};S._loDraftStack=['L:9'];
  S._loAppliedPlateId='antiga';S._figFrozenVis={old:true};S._figLegendVis={old:true};
  S.projectMeta={name:'Projeto anterior',city:'Anterior'};S.hidro={serie:[{year:2000,value:99}],idf:{K:10}};
  context.loadProject({app:'ALAGIS',projectId:'novo',layers:[],groups:[]});
  assert.equal(S._view,'map','troca de projeto sai do Layout antes de montar a nova prancha');
  assert.equal(S._preLayoutMapState,null);assert.equal(S._lastSVG,null);assert.equal(S._loDraftConv,null);
  assert.equal(S._loDraftVis,null);assert.equal(S._loDraftStack,null);assert.equal(S._loAppliedPlateId,null);
  assert.equal(S.projectMeta,null);assert.equal(S.hidro.serie,null);assert.equal(S.hidro.idf,null);
  assert.deepEqual(calls.invalidations,[['project-load',false]]);
  assert.deepEqual(calls.opening,{begin:1,end:1},'the extracted prelude must close its opening scope');
  S.layers=[layer(1,'CAMADA NOVA')];
  const snapshot=context.projectData();
  assert.equal(snapshot.layers[0].name,'CAMADA NOVA');assert.equal(snapshot.layers[0].visible,true);
  assert.equal(snapshot.layers[0].color,'#22ff00');
  assert.equal(snapshot.projectMeta,null);assert.equal(snapshot.hidro.serie,null);
  console.log('OK · abrir outro projeto reutilizando IDs não herda Layout, metadados nem série hidrológica');
}
{
  const {context,S}=runtime();
  S.layers[0].features[0].props=JSON.parse('{"__proto__":"texto","normal":1}');
  const snapshot=context.projectData();
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.layers[0].features[0].props,'__proto__'),true);
  assert.equal(JSON.parse(JSON.stringify(snapshot)).layers[0].features[0].props.__proto__,'texto');
  console.log('OK · nome especial de atributo continua um campo próprio, não altera protótipos');
}
{
  const {context,S}=runtime(),noop=()=>{},el={value:'',style:{},classList:{toggle:noop},dataset:{},dispatchEvent:noop};
  Object.assign(context,{
    uid:3,rid:1,plid:1,defaultLabelCfg:()=>({}),drawLayer:noop,zApply:noop,
    renderPlateTabs:noop,refreshUI:noop,fitAll:noop,toast:noop,setTimeout:noop,
    requestAnimationFrame:noop,SIDE_OF:{},syncSideSecs:noop,buildLayout:noop,
    projectRestoreNativeRasters:async()=>({restored:0}),cavaEhAnelProjeto:()=>false,
    PLATE_FIELDS:[],PLATE_CHECKS:[],Event:class{},
    document:{body:{classList:{toggle:noop}},documentElement:{dataset:{}},
      getElementById:()=>el,querySelector:()=>el,querySelectorAll:()=>[]},
    allNodes:()=>S.layers.map(L=>({t:'L',id:L.id,o:L})),nodeKey:(t,id)=>t+':'+id,
    nodeSetVis:(n,v)=>{n.o.visible=v;},layoutStackApply:stack=>{S.stack=stack.slice();},
    layoutFrozenDirty:noop
  });
  const helpers=extensions.slice(extensions.indexOf('function layoutClone('),extensions.indexOf('function layoutStackApply('));
  const visHelpers=extensions.slice(extensions.indexOf('function layoutVisSnapshot('),extensions.indexOf('function layoutFrozenApply('));
  const plateApply=extensions.slice(extensions.indexOf('function plateApply('),extensions.indexOf('function plateNew('));
  const view=printing.slice(printing.indexOf('function switchView('),printing.indexOf("document.querySelectorAll('#tabBar .tbtn').forEach(b=>{",printing.indexOf('function switchView(')));
  vm.runInContext(helpers+'\n'+visHelpers+'\n'+plateApply+'\n'+view+'\n'+fullLoad,context);
  S._view='layout';S._preLayoutMapState={frozen:true,conv:{'L:1':{color:'#ff0000'}}};
  S.layers[0].color='#ff0000';
  const incoming=layer(1,'B mapa');incoming.color='#00ff00';
  context.loadProject({projectId:'B',layers:[incoming],groups:[],stack:['L:1'],
    plates:[{id:1,f:{},c:{},conv:{'L:1':{...incoming,name:'B prancha',color:'#0000ff'}},vis:{'L:1':true},stack:['L:1']}],plateId:1});
  assert.equal(S._view,'map');assert.equal(S.layers[0].color,'#00ff00');
  assert.equal(context.projectData().layers[0].color,'#00ff00');
  context.switchView('layout'); // captura real do novo mapa B
  context.plateApply(S.plates[0],false); // usuário escolhe a prancha B azul
  assert.equal(S.layers[0].color,'#0000ff');
  assert.equal(context.projectData().layers[0].color,'#00ff00','salvar no Layout preserva mapa principal B verde');
  assert.equal(context.projectData().plates[0].conv['L:1'].color,'#0000ff');
  context.switchView('map');
  assert.equal(S.layers[0].color,'#00ff00','sair da prancha azul devolve B verde, nunca A vermelho');
  console.log('OK · loadProject completo e Layout/Mapa reais preservam B verde, prancha B azul e descartam A vermelho');
}
console.log('Snapshot e troca de projeto: 5 cenários aprovados.');
