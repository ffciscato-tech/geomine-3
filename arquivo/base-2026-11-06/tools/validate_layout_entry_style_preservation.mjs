import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

const layout=read('src/core/parts/17-layout-printing.js');
const layoutExtensions=read('src/core/parts/18-lidar-layout-extensions.js');

/* Extrai funções reais sem encerrar o bloco em chaves de strings, templates
   ou comentários. */
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
    add:(...names)=>names.forEach(n=>values.add(n)),
    remove:(...names)=>names.forEach(n=>values.delete(n)),
    toggle:(name,on)=>{if(on===undefined)on=!values.has(name);on?values.add(name):values.delete(name);return on;},
    contains:name=>values.has(name)
  };
}

function element(){
  return {
    style:{},dataset:{},classList:classList(),parentNode:null,
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

const layer={
  id:41,name:'Pontos de monitoramento',gtype:'point',visible:true,
  color:'#16a085',weight:3.5,fill:.8,
  labelField:'TIPO',labelFields:['TIPO'],lbl:{size:10,color:'#102030'},
  attrFilter:null,attrFilterRules:null,attrFilterLogic:'AND',
  sym:{
    mode:'cat',field:'TIPO',color:'#16a085',stroke:'#123b36',weight:3.5,fill:.8,
    classes:[],cats:[
      {value:'Água',color:'#1abc9c',stroke:'#0e6251',shape:'diamond',size:30,count:2},
      {value:'Ruído',color:'#3498db',stroke:'#1b4f72',shape:'circle',count:1}
    ],
    pt:{shape:'circle',size:24,rot:0,rotField:'',dipField:''}
  }
};

const oldConvention={
  name:'Pontos de monitoramento',color:'#b03a2e',weight:1,fill:.45,
  sym:{
    mode:'cat',field:'TIPO',color:'#b03a2e',stroke:'#641e16',weight:1,fill:.45,
    classes:[],cats:[
      {value:'Água',color:'#e74c3c',stroke:'#641e16',shape:'circle',size:12,count:2},
      {value:'Ruído',color:'#f39c12',stroke:'#7e5109',shape:'circle',size:12,count:1}
    ],
    pt:{shape:'circle',size:12,rot:0,rotField:'',dipField:''}
  },
  labelField:'TIPO',labelFields:['TIPO'],lbl:{size:8,color:'#000000'},
  attrFilter:null,attrFilterRules:null,attrFilterLogic:'AND'
};
const oldPlate={
  id:9,name:'Prancha antiga',f:{},c:{},center:null,
  vis:{'L:41':true},conv:{'L:41':structuredClone(oldConvention)},stack:['L:41'],groups:[]
};

const S={
  _view:'map',loMode:'a4',loFrozen:true,loPranchaFormato:'a4',
  layers:[layer],rasters:[],groups:[],img:null,stack:['L:41'],
  plates:[oldPlate],plateId:9,_loAppliedPlateId:null,
  _loDraftVis:null,_loDraftConv:null,_loDraftStack:null
};

let draws=0,builds=0;
const context=vm.createContext({
  console,structuredClone,S,document,
  window:{matchMedia:()=>({matches:false}),CCMGISCava2:null},
  SIDE_OF:{},CATS:[],RIB_COMMAND_CAT:null,RIB_CAT_ATUAL:'inicio',
  layoutVisSnapshot:()=>({'L:41':layer.visible!==false}),
  layoutVisHasKnown:value=>!!value&&Object.hasOwn(value,'L:41'),
  layoutVisHasVisible:value=>!!value&&Object.values(value).some(Boolean),
  layoutVisRestore:()=>{},layoutStackApply:()=>{},platesInit:()=>{},
  syncSideSecs:()=>{},layoutDockSync:()=>{},syncLoBtns:()=>{},
  ribbonBuild:()=>{},acadOn:()=>false,
  buildLayout:()=>{builds++;},drawLayer:()=>{draws++;},renderRaster:()=>{},
  zApply:()=>{},refreshUI:()=>{},cmdAncora:()=>{},
  requestAnimationFrame:fn=>{fn();return 1;},setTimeout:fn=>{fn();return 1;},
  map:{invalidateSize:()=>{},hasLayer:()=>true},
  mapa2DReanexaVetores:()=>{}
});

vm.runInContext([
  functionDeclaration(layoutExtensions,'layoutClone'),
  functionDeclaration(layoutExtensions,'layoutStateEqual'),
  functionDeclaration(layoutExtensions,'layoutVectorConvention'),
  functionDeclaration(layoutExtensions,'layoutConventionSnapshot'),
  functionDeclaration(layoutExtensions,'layoutConventionApply'),
  functionDeclaration(layoutExtensions,'layoutFrozenApply'),
  functionDeclaration(layout,'switchView')
].join('\n'),context,{filename:'layout-entry-style.contract.js'});

const plain=value=>JSON.parse(JSON.stringify(value));
const editedBefore=plain(context.layoutVectorConvention(layer));
const frozenBefore=plain(oldPlate.conv);

/* Caso real: a camada foi editada no mapa, mas a última subvista usada era
   uma prancha congelada com convenção antiga. Só entrar no Layout não equivale
   a escolher essa prancha. */
context.switchView('layout');

assert.equal(S._view,'layout','a navegação deve entrar no Layout');
assert.equal(builds,1,'a entrada deve solicitar a renderização do Layout');
assert.deepEqual(plain(S._preLayoutMapState&&S._preLayoutMapState.conv&&S._preLayoutMapState.conv['L:41']),
  editedBefore,'a entrada deve fotografar a simbologia 2D recém-editada');
assert.deepEqual(plain(context.layoutVectorConvention(layer)),editedBefore,
  'entrar no Layout não pode reverter a simbologia 2D antes da escolha de uma prancha antiga');
assert.deepEqual(plain(oldPlate.conv),frozenBefore,
  'preservar a edição 2D não pode sobrescrever a convenção congelada da prancha antiga');

/* A prancha continua válida e pode ser aplicada explicitamente depois. Isso
   impede que o teste seja satisfeito simplesmente descartando seu snapshot. */
context.layoutConventionApply(oldPlate.conv);
assert.deepEqual(plain(context.layoutVectorConvention(layer)),plain(oldConvention),
  'escolher explicitamente a prancha antiga deve continuar aplicando sua convenção');
assert.ok(draws>=1,'aplicar explicitamente a prancha antiga deve redesenhar a camada');

console.log('OK: entrar no Layout preserva a simbologia editada em 2D; a prancha antiga só é aplicada após escolha explícita.');
