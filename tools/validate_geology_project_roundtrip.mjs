import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const source=fs.readFileSync(path.join(root,'src/core/parts/26-project-persistence.js'),'utf8');
const clone=value=>structuredClone(value);
const plain=value=>JSON.parse(JSON.stringify(value));

/* Extrai as funções reais sem encerrar em chaves existentes dentro de
   comentários, strings ou templates. */
function blockEnd(text,open,label){
  let depth=0,state='code',escaped=false;
  for(let i=open;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(state==='line'){if(ch==='\n')state='code';continue;}
    if(state==='block'){if(ch==='*'&&next==='/'){state='code';i++;}continue;}
    if(state!=='code'){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch===state)state='code';continue;
    }
    if(ch==='/'&&next==='/'){state='line';i++;continue;}
    if(ch==='/'&&next==='*'){state='block';i++;continue;}
    if(ch==='\''||ch==='"'||ch==='`'){state=ch;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return i;
  }
  assert.fail(label+': bloco JavaScript não foi fechado');
}
function functionDeclaration(text,name){
  const safe=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=new RegExp(`\\bfunction\\s+${safe}\\s*\\(`).exec(text);
  assert.ok(match,`função ${name} ausente`);
  const open=text.indexOf('{',match.index+match[0].length);
  assert.ok(open>=0,`função ${name}: corpo ausente`);
  return text.slice(match.index,blockEnd(text,open,`função ${name}`)+1);
}

const geology={
  schemaVersion:1,
  sections:[{id:'GSEC-AB',name:'Seção principal A–B',layerId:12}],
  settings:{lastFamily:'estruturas'},
  section:{
    id:'GSEC-AB',name:'Seção principal A–B',rasterId:'mdt-7',corridor:180,
    ve:3,step:5,layerIds:['11'],roles:{11:'hole'},result:null
  }
};
const logs=[
  {DE_M:0,ATE_M:12.5,LITOLOGIA:'Solo residual',ALTERACAO:'Alta',DESCRICAO:'Argiloso'},
  {DE_M:12.5,ATE_M:48,LITOLOGIA:'Gnaisse',ALTERACAO:'Baixa',DESCRICAO:'São'}
];
const coreRuns=[
  {DE_M:12.5,ATE_M:25,REC_PCT:94,RQD_PCT:78,LITOLOGIA:'Gnaisse',OBS:'Fraturado'},
  {DE_M:25,ATE_M:48,REC_PCT:99,RQD_PCT:91,LITOLOGIA:'Gnaisse',OBS:''}
];
const importedDrillhole={
  boreholeTrace:[{x:700000,y:7800000,z:512.25,md:0},{x:700003,y:7800000,z:487.25,md:25},{x:700010,y:7800000,z:468.25,md:48}],
  boreholeSurvey:[{md:0,az:90,dip:-90},{md:25,az:90,dip:-75},{md:48,az:90,dip:-60}],
  boreholeSource:{format:'csv',method:'minimum-curvature',files:['collar.csv','survey.csv'],crs:'EPSG:31983'},
  boreholeTables:{assay:[{DE_M:0,ATE_M:12.5,CU_PCT:0.7}],geotechnics:[{DE_M:12.5,ATE_M:48,RMR:65}]}
};

const borehole={
  id:11,name:'Sondagens editadas',gtype:'point',crs:'EPSG:31983',visible:true,
  labelField:'ID_FURO',labelFields:['ID_FURO'],lbl:{size:10,unique:false},
  groupId:5,clsOpen:false,color:'#137c8b',weight:2,fill:0,
  sym:{mode:'single',color:'#137c8b',stroke:'#0a4650',weight:2,fill:0,
    pt:{shape:'drill',size:22,rot:0,rotField:'AZIMUTE',dipField:''}},
  fields:[
    {name:'FID',type:'N',length:9,decimal:0},
    {name:'ID_FURO',type:'C',length:30,decimal:0},
    {name:'PROF_M',type:'N',length:12,decimal:2}
  ],
  features:[{
    geom:[700000,7800000,512.25],multi:false,
    props:{FID:1,ID_FURO:'FS-001',PROF_M:48},
    _field:{schemaVersion:1,id:'field-fs-001',origin:'observed',source:'import',
      sourceFile:'sondagens_campo.gpkg',importedAt:'2026-09-18T12:00:00.000Z',
      observedAt:'2026-09-17T14:30:00.000Z',operator:'Equipe A',accuracyM:1.8,
      orientationAccuracyDeg:2,status:'valid',errors:[],attachments:[]},
    geologyLog:clone(logs),coreRuns:clone(coreRuns),...clone(importedDrillhole)
  }],
  attrFilter:null,attrFilterRules:null,attrFilterLogic:'AND',tinSurface:null,visReal:false,
  _geology:{schemaVersion:2,kind:'sondagem',family:'investigacao',source:'imported',importedBoreholes:true,
    sourceFile:'sondagens_campo.gpkg',fieldMap:{FID:'FID',ID_FURO:'ID_FURO',PROF_M:'PROF_M'}},llayer:null
};
const sectionLayer={
  id:12,name:'Seção geológica — principal A–B',gtype:'line',crs:'EPSG:31983',visible:true,
  labelField:'NOME',labelFields:['NOME'],lbl:{size:9,unique:false},
  groupId:5,clsOpen:false,color:'#7c3aed',weight:3,fill:0,
  sym:{mode:'single',color:'#7c3aed',stroke:'#7c3aed',weight:3,fill:0,dash:'8 5'},
  fields:[{name:'GEOSEC_ID',type:'C',length:32},{name:'NOME',type:'C',length:80}],
  features:[{
    geom:[[699900,7799900],[700400,7800200]],multi:false,
    props:{GEOSEC_ID:'GSEC-AB',NOME:'Seção principal A–B',CORREDOR:180,
      EXAG_V:3,PASSO_M:5,MDT_ID:'mdt-7',CAMADAS:'11',PAPEIS:'{"11":"hole"}'}
  }],
  attrFilter:null,attrFilterRules:null,attrFilterLogic:'AND',tinSurface:null,visReal:false,
  llayer:null
};

const S={
  _view:'map',_preLayoutMapState:null,loFrozen:true,
  auto:{name:'modelo-geologico.ccmgis'},currentProjectName:null,
  workCRS:'EPSG:31983',projectMeta:{name:'Modelo geológico'},
  _v3SurfOn:{},_v3TexTipo:'hipso',_v3TexCor:'#8d5524',
  groups:[{id:5,name:'Geologia',collapsed:false}],
  layers:[borehole,sectionLayer],rasters:[],img:null,wms:[],
  stack:['G:5','L:11','L:12'],plates:[],plateId:null,
  geology:clone(geology),hidro:{serie:null,idf:null}
};

let restoreCalls=0,draws=0,refreshes=0,fitCalls=0;
let uid=100,gid=20,rid=200,plid=1;
const document={
  documentElement:{dataset:{}},
  getElementById:()=>null,
  querySelectorAll:()=>[]
};
const geologyApi={
  snapshot:()=>clone(S.geology),
  restore:data=>{restoreCalls++;S.geology=data?clone(data):{schemaVersion:1,sections:[],settings:{}};return S.geology;}
};
const context={
  console,structuredClone,S,document,uid,gid,rid,plid,
  window:{CCMGISCava2:null,GeoMinePointSymbols:null,GeoMineGeology:geologyApi},
  CRS_DEFS:{'EPSG:31983':{}},
  map:{removeLayer:()=>{}},
  autoAreaSyncAll:()=>{},plateCapture:()=>{},
  labelCfg:L=>L.lbl||{},layoutClone:clone,
  reparaGeom:d=>({nF:0,layers:d.layers}),
  cavaEhAnelProjeto:()=>false,
  cavaSoldaIntersecaoAneis:()=>({insercoes:0,cruzamentos:0}),
  baciaReparaLinhasExistentes:()=>({changed:false,added:0}),
  cavaReparaCamadaLegada:()=>null,
  setOpenProjectName:name=>{S.currentProjectName=name;},
  defaultLabelCfg:()=>({show:false,unique:false}),
  drawLayer:L=>{draws++;L.llayer={};},renderRaster:()=>{},
  zApply:()=>{},refreshUI:()=>{refreshes++;},fitAll:()=>{fitCalls++;},toast:()=>{},
  setTimeout:()=>0,clearTimeout:()=>{},
  projectRestoreNativeRasters:async()=>({restored:0,unauthorized:false}),
  setSerie:serie=>{S.hidro.serie=serie;},wmsCreateLayer:()=>{},
  Event:class {constructor(type){this.type=type;}},
  toWGS:(_crs,x,y)=>[x,y],L2:{imageOverlay:()=>({addTo(){return this;},bringToBack(){}})},
  /* abertura progressiva do projeto: desenha as visíveis, adia as ocultas */
  GeoMineProjectOpening:{begin:()=>({end(){}}),restore(o,type){if(o.visible===false){o._projectDrawDeferred=true;return;}if(type==='L')context.drawLayer(o);else context.renderRaster(o);}}
};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(
  `${functionDeclaration(source,'projectData')}\n${functionDeclaration(source,'loadProject')}\n`+
  `globalThis.__geologyPersistence={projectData,loadProject};`,
  context,{filename:'26-project-persistence.geology-roundtrip.js'}
);

/* Gravar imita o arquivo real: JSON elimina referências e prova que os arrays
   de log/testemunho não sobrevivem apenas por compartilharem o objeto runtime. */
const saved=plain(context.__geologyPersistence.projectData());
assert.deepEqual(saved.geology,geology,
  'projectData deve gravar o estado geológico de nível de projeto');
const savedHole=saved.layers.find(L=>L.id===11);
const savedField=clone(savedHole.features[0]._field);
assert.deepEqual(savedHole._geology,borehole._geology,
  'projectData deve gravar a identidade tipada da camada');
assert.deepEqual(savedHole.features[0].geologyLog,logs,
  'projectData deve gravar os intervalos do log de sondagem');
assert.deepEqual(savedHole.features[0].coreRuns,coreRuns,
  'projectData deve gravar as corridas/recuperação de testemunho');
for(const [key,value] of Object.entries(importedDrillhole))assert.deepEqual(savedHole.features[0][key],value,'projectData deve preservar '+key);
assert.deepEqual(savedHole.features[0]._field,borehole.features[0]._field,
  'projectData deve gravar UUID, status e proveniência da observação de campo');
assert.equal(saved.layers.find(L=>L.id===12).features[0].props.GEOSEC_ID,'GSEC-AB',
  'a definição vetorial A–B deve entrar no arquivo do projeto');

/* Destrói o estado para garantir que a confirmação abaixo vem da abertura do
   arquivo, e não dos objetos usados para preparar o cenário. */
S.geology={schemaVersion:1,sections:[],settings:{}};
S.layers[0].features[0].geologyLog.length=0;
S.layers[0].features[0].coreRuns.length=0;
S.layers[0].features[0]._field.status='invalid';
S.layers[0].features[0].boreholeTrace[1].md=999;
S.layers[0].features[0].boreholeSurvey.length=0;
S.layers[0].features[0].boreholeTables.assay.length=0;
assert.equal(context.__geologyPersistence.loadProject(clone(saved)),true,
  'loadProject deve aceitar o projeto geológico salvo');

assert.equal(restoreCalls,1,'loadProject deve chamar GeoMineGeology.restore uma vez');
assert.deepEqual(plain(S.geology),geology,
  'estado de seções/configurações deve ser restaurado sem perda');
const reopenedHole=S.layers.find(L=>L.id===11),reopenedSection=S.layers.find(L=>L.id===12);
assert.deepEqual(plain(reopenedHole._geology),borehole._geology,
  'camada reaberta deve conservar schemaVersion/kind/family');
assert.deepEqual(plain(reopenedHole.features[0].geologyLog),logs,
  'log deve sobreviver ao ciclo JSON → loadProject');
assert.deepEqual(plain(reopenedHole.features[0].coreRuns),coreRuns,
  'testemunho deve sobreviver ao ciclo JSON → loadProject');
for(const [key,value] of Object.entries(importedDrillhole))assert.deepEqual(plain(reopenedHole.features[0][key]),value,'ciclo real JSON → loadProject deve preservar '+key);
assert.equal(reopenedHole.locked,true,'sondagens importadas reabrem com collar vinculado e protegido contra movimento isolado');
assert.deepEqual(plain(reopenedHole.features[0]._field),savedField,
  'metadados de campo devem sobreviver ao ciclo JSON → loadProject');
assert.deepEqual(plain({
  mode:reopenedHole.sym.mode,color:reopenedHole.sym.color,
  stroke:reopenedHole.sym.stroke,weight:reopenedHole.sym.weight,
  fill:reopenedHole.sym.fill,pt:reopenedHole.sym.pt
}),plain(borehole.sym),
  'round-trip geológico não pode perder a simbologia da sondagem');
assert.equal(reopenedHole.groupId,5,'round-trip não pode retirar a sondagem do grupo Geologia');
assert.deepEqual(plain(reopenedSection.features[0]),plain(sectionLayer.features[0]),
  'linha e parâmetros da seção devem ser restaurados integralmente');
assert.deepEqual(plain(S.stack),['G:5','L:11','L:12'],
  'ordem da árvore deve sobreviver ao round-trip');
assert.equal(draws,2,'a abertura deve redesenhar exatamente as duas camadas');
assert.equal(refreshes,1,'a abertura deve atualizar a árvore');
assert.equal(fitCalls,1,'a abertura deve reenquadrar o projeto');

console.log('OK: geology, _geology, seções, logs e testemunhos sobrevivem a projectData → JSON → loadProject.');
