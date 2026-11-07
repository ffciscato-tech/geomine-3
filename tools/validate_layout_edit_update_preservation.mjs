import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

const tree=read('src/core/parts/15-layer-tree-crs-ui.js');
const layout=read('src/core/parts/17-layout-printing.js');
const extensions=read('src/core/parts/18-lidar-layout-extensions.js');

/* Extrai as declarações reais sem se confundir com chaves em comentários,
   strings ou templates. O teste continua exercitando o código de produção. */
function blockEnd(source,open,label){
  let depth=0,state='code',escaped=false;
  for(let i=open;i<source.length;i++){
    const ch=source[i],next=source[i+1];
    if(state==='line'){
      if(ch==='\n')state='code';
      continue;
    }
    if(state==='block'){
      if(ch==='*'&&next==='/'){state='code';i++;}
      continue;
    }
    if(state!=='code'){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch===state)state='code';
      continue;
    }
    if(ch==='/'&&next==='/'){state='line';i++;continue;}
    if(ch==='/'&&next==='*'){state='block';i++;continue;}
    if(ch==='\''||ch==='"'||ch==='`'){state=ch;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return i;
  }
  assert.fail(`${label}: bloco JavaScript não foi fechado`);
}

function functionDeclaration(source,name){
  const safe=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=new RegExp(`\\bfunction\\s+${safe}\\s*\\(`).exec(source);
  assert.ok(match,`função ${name} ausente`);
  const open=source.indexOf('{',match.index+match[0].length);
  assert.ok(open>=0,`função ${name}: corpo ausente`);
  return source.slice(match.index,blockEnd(source,open,`função ${name}`)+1);
}

function classList(){
  const values=new Set();
  return {
    add:(...names)=>names.forEach(name=>values.add(name)),
    remove:(...names)=>names.forEach(name=>values.delete(name)),
    toggle:(name,on)=>{
      if(on===undefined)on=!values.has(name);
      on?values.add(name):values.delete(name);
      return on;
    },
    contains:name=>values.has(name)
  };
}

function element(){
  return {
    style:{},dataset:{},classList:classList(),parentNode:null,
    value:'',checked:false,textContent:'',title:'',disabled:false,
    querySelector:()=>null,querySelectorAll:()=>[],
    addEventListener:()=>{},appendChild:()=>{},setAttribute:()=>{}
  };
}

const elements=new Map();
const getElement=id=>{
  if(!elements.has(id))elements.set(id,element());
  return elements.get(id);
};
const document={
  body:element(),
  getElementById:getElement,
  querySelectorAll:()=>[],
  querySelector:selector=>selector==='.readout'?getElement('readout'):null
};

function convention(tag){
  const values={
    A0:{color:'#b03a2e',stroke:'#641e16',weight:1,fill:.45,size:12,labelSize:8,shape:'circle'},
    A1:{color:'#16a085',stroke:'#0e6251',weight:3.5,fill:.8,size:24,labelSize:10,shape:'diamond'},
    A2:{color:'#8e44ad',stroke:'#512e5f',weight:4.25,fill:.66,size:34,labelSize:13,shape:'square'}
  }[tag];
  return {
    name:'Pontos de monitoramento',color:values.color,
    weight:values.weight,fill:values.fill,
    sym:{
      mode:'cat',field:'TIPO',color:values.color,stroke:values.stroke,
      weight:values.weight,fill:values.fill,classes:[],
      cats:[
        {value:'Água',color:values.color,stroke:values.stroke,
          shape:values.shape,size:values.size,count:2},
        {value:'Ruído',color:'#3498db',stroke:'#1b4f72',
          shape:'circle',size:values.size,count:1}
      ],
      pt:{shape:values.shape,size:values.size,rot:0,rotField:'',dipField:''}
    },
    labelField:'TIPO',labelFields:['TIPO'],
    lbl:{size:values.labelSize,color:'#102030'},
    attrFilter:null,attrFilterRules:null,attrFilterLogic:'AND'
  };
}

function applyConventionToLayer(layer,conv){
  layer.name=conv.name;
  layer.color=conv.color;
  layer.weight=conv.weight;
  layer.fill=conv.fill;
  layer.sym=structuredClone(conv.sym);
  layer.labelField=conv.labelField;
  layer.labelFields=conv.labelFields.slice();
  layer.lbl=structuredClone(conv.lbl);
  layer.attrFilter=conv.attrFilter;
  layer.attrFilterRules=conv.attrFilterRules;
  layer.attrFilterLogic=conv.attrFilterLogic;
}

const A0=convention('A0');
const A1=convention('A1');
const A2=convention('A2');
const layer={id:41,gtype:'point',visible:true};
applyConventionToLayer(layer,A1);

const plate={
  id:9,name:'Prancha congelada',f:{},c:{},center:null,
  vis:{'L:41':true},conv:{'L:41':structuredClone(A0)},
  stack:['L:41'],groups:[]
};
const S={
  _view:'map',loMode:'a4',loFrozen:true,loPranchaFormato:'a4',
  layers:[layer],rasters:[],groups:[],img:null,stack:['L:41'],
  plates:[plate],plateId:9,_loAppliedPlateId:null,
  _loDraftVis:null,_loDraftConv:null,_loDraftStack:null,
  loCenter:null
};

let builds=0,updates=0;
const node={t:'L',id:41,o:layer};
const sandbox={
  console,structuredClone,S,document,
  window:{matchMedia:()=>({matches:false}),CCMGISCava2:null,loCoordUISync:()=>{}},
  PLATE_FIELDS:[],PLATE_CHECKS:[],
  SIDE_OF:{},CATS:[],RIB_COMMAND_CAT:null,RIB_CAT_ATUAL:'inicio',
  allNodes:()=>[node],nodeKey:(type,id)=>`${type}:${id}`,
  nodeSetVis:(item,on)=>{item.o.visible=!!on;},
  layoutVisSnapshot:()=>({'L:41':layer.visible!==false}),
  platesInit:()=>{},syncSideSecs:()=>{},layoutDockSync:()=>{},
  syncLoBtns:()=>{},ribbonBuild:()=>{},acadOn:()=>false,
  drawLayer:()=>{},renderRaster:()=>{},zApply:()=>{},
  refreshUI:()=>{},loNotaSyncBotao:()=>{},cmdAncora:()=>{},
  toast:()=>{updates++;},mapa2DReanexaVetores:()=>{},
  requestAnimationFrame:fn=>{fn();return 1;},setTimeout:fn=>{fn();return 1;},
  map:{invalidateSize:()=>{},hasLayer:()=>true},
  buildLayout:()=>{}
};
const context=vm.createContext(sandbox);

vm.runInContext([
  functionDeclaration(extensions,'layoutClone'),
  functionDeclaration(extensions,'layoutStateEqual'),
  functionDeclaration(extensions,'layoutVectorConvention'),
  functionDeclaration(extensions,'layoutConventionSnapshot'),
  functionDeclaration(extensions,'layoutConventionApply'),
  functionDeclaration(extensions,'layoutStackApply'),
  functionDeclaration(extensions,'layoutFrozenDirty'),
  functionDeclaration(extensions,'plateCapture'),
  functionDeclaration(extensions,'layoutVisHasKnown'),
  functionDeclaration(extensions,'layoutVisHasVisible'),
  functionDeclaration(extensions,'layoutVisRestore'),
  functionDeclaration(extensions,'layoutFrozenApply'),
  functionDeclaration(tree,'layoutSeVisivel'),
  functionDeclaration(layout,'switchView'),
  functionDeclaration(layout,'loApplyAll')
].join('\n'),context,{filename:'layout-edit-update.contract.js'});

/* Reproduz o duplo layoutFrozenApply real: switchView chama uma vez, e
   buildLayout chama novamente antes de montar o SVG. */
context.buildLayout=()=>{
  builds++;
  if(S._view==='layout'&&S.loFrozen)context.layoutFrozenApply();
};

const plain=value=>JSON.parse(JSON.stringify(value));

/* A1 foi editado no mapa; a prancha ainda conserva A0. */
context.switchView('layout');
assert.deepEqual(plain(context.layoutVectorConvention(layer)),plain(A1),
  'entrar no Layout deve manter A1 como rascunho visível');
assert.deepEqual(plain(plate.conv['L:41']),plain(A0),
  'entrar no Layout não deve sobrescrever a fotografia A0 antes de Atualizar');
assert.deepEqual(plain(S._loDraftConv['L:41']),plain(A1),
  'A1 deve permanecer identificado como convenção pendente');

/* Ainda no Layout, o usuário muda a simbologia para A2 nas propriedades. */
applyConventionToLayer(layer,A2);
context.layoutSeVisivel();
assert.deepEqual(plain(S._loDraftConv['L:41']),plain(A2),
  'a edição A2 dentro do Layout deve substituir o rascunho A1');
assert.deepEqual(plain(plate.conv['L:41']),plain(A0),
  'A2 só pode entrar na prancha depois do comando Atualizar');

/* Simula o clique em Atualizar prancha. */
context.loApplyAll();
assert.deepEqual(plain(plate.conv['L:41']),plain(A2),
  'Atualizar deve gravar A2 no snapshot da prancha');
assert.deepEqual(plain(S._preLayoutMapState.conv['L:41']),plain(A2),
  'Atualizar deve promover A2 ao estado que será devolvido ao mapa');
assert.equal(S._loDraftConv,null,'o rascunho deve ser limpo depois da captura');
assert.notStrictEqual(plate.conv['L:41'],S._preLayoutMapState.conv['L:41'],
  'prancha e estado de retorno devem ser clones independentes');

/* Ao sair, a restauração não pode ressuscitar A1 nem A0. */
context.switchView('map');
assert.deepEqual(plain(context.layoutVectorConvention(layer)),plain(A2),
  'sair do Layout depois de Atualizar deve manter A2 no mapa');
assert.equal(S._preLayoutMapState,null,
  'o estado transitório de retorno deve ser descartado depois da saída');
assert.ok(builds>=2,'a sequência deve ter reconstruído a prancha');
assert.equal(updates,1,'o comando Atualizar deve produzir uma confirmação');

console.log('OK: A1 → edição A2 no Layout → Atualizar grava A2 na prancha e no retorno ao mapa.');
