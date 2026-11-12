import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const source=fs.readFileSync(path.join(root,'src/core/parts/26-project-persistence.js'),'utf8');

/* Extrai a implementação real sem confundir chaves de comentários, strings
   ou templates com o fim da função. */
function blockEnd(text,open,label){
  let depth=0,state='code',escaped=false;
  for(let i=open;i<text.length;i++){
    const ch=text[i],next=text[i+1];
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

function functionDeclaration(text,name){
  const safe=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=new RegExp(`\\bfunction\\s+${safe}\\s*\\(`).exec(text);
  assert.ok(match,`função ${name} ausente`);
  const open=text.indexOf('{',match.index+match[0].length);
  assert.ok(open>=0,`função ${name}: corpo ausente`);
  return text.slice(match.index,blockEnd(text,open,`função ${name}`)+1);
}

const clone=value=>structuredClone(value);
const plain=value=>JSON.parse(JSON.stringify(value));

const mapConventionA={
  name:'Pontos editados no mapa 2D',color:'#148f77',weight:3.5,fill:.82,
  sym:{
    mode:'cat',field:'TIPO',color:'#148f77',stroke:'#0b5345',weight:3.5,fill:.82,
    cats:[
      {value:'Água',color:'#1abc9c',shape:'diamond',size:28,count:2},
      {value:'Ruído',color:'#3498db',shape:'circle',count:1}
    ],
    pt:{shape:'triangle',size:23,rot:15,rotField:'',dipField:''}
  },
  labelField:'TIPO',labelFields:['TIPO','CODIGO'],
  lbl:{size:11,color:'#102030'},
  attrFilter:{field:'STATUS',op:'=',value:'ATIVO'},
  attrFilterRules:null,attrFilterLogic:'AND'
};
const mapConventionB={
  name:'Limites editados no mapa 2D',color:'#5b2c6f',weight:5,fill:.15,
  sym:{mode:'single',color:'#5b2c6f',stroke:'#4a235a',weight:5,fill:.15},
  labelField:'',labelFields:null,lbl:{size:9,color:'#222222'},
  attrFilter:null,attrFilterRules:null,attrFilterLogic:'AND'
};

/* Ao abrir uma prancha antiga, estes valores temporários substituem os da
   tela. Eles precisam continuar na prancha, mas não podem virar o estado
   principal do projeto salvo. */
const plateConventionA={
  ...clone(mapConventionA),name:'Pontos — fotografia da prancha',
  color:'#c0392b',weight:1,fill:.4,
  sym:{mode:'single',color:'#c0392b',stroke:'#641e16',weight:1,fill:.4,
    pt:{shape:'circle',size:10,rot:0,rotField:'',dipField:''}},
  labelField:'',labelFields:null,lbl:{size:7,color:'#000000'},attrFilter:null
};
const plateConventionB={
  ...clone(mapConventionB),name:'Limites — fotografia da prancha',
  color:'#d35400',weight:1.25,fill:.55,
  sym:{mode:'single',color:'#d35400',stroke:'#6e2c00',weight:1.25,fill:.55}
};

const layerFrom=(id,conv,visible)=>({
  id,gtype:id===11?'point':'polygon',crs:'EPSG:31983',visible,
  groupId:null,clsOpen:false,src:null,fields:['TIPO','CODIGO','STATUS'],features:[],
  ...clone(conv)
});

const oldPlate={
  id:7,name:'Prancha antiga',f:{},c:{},center:[-46,-23],
  vis:{'L:11':false,'L:22':true},
  conv:{'L:11':clone(plateConventionA),'L:22':clone(plateConventionB)},
  stack:['L:22','L:11'],legendVis:{},groups:[]
};

const S={
  _view:'layout',
  _preLayoutMapState:{
    vis:{'L:11':true,'L:22':false},
    conv:{'L:11':clone(mapConventionA),'L:22':clone(mapConventionB)},
    stack:['L:11','L:22'],frozen:true
  },
  loFrozen:true,auto:{name:'estado-2d.ccmgis'},currentProjectName:null,
  workCRS:'EPSG:31983',projectMeta:null,_v3SurfOn:{},_v3TexTipo:'hipso',
  _v3TexCor:'#8d5524',groups:[],
  layers:[layerFrom(11,plateConventionA,false),layerFrom(22,plateConventionB,true)],
  stack:['L:22','L:11'],wms:[],plates:[oldPlate],plateId:7,rasters:[],img:null,
  hidro:{serie:null,idf:null}
};

let areaSyncCalls=0,plateCaptureCalls=0;
const document={getElementById:()=>null};
const context=vm.createContext({
  console,structuredClone,S,document,
  window:{CCMGISCava2:null},
  autoAreaSyncAll:()=>{areaSyncCalls++;},
  plateCapture:()=>{plateCaptureCalls++;},
  labelCfg:layer=>layer.lbl||{},
  layoutClone:clone
});

const projectData=vm.runInContext(
  `(()=>{${functionDeclaration(source,'projectData')};return projectData;})()`,
  context,{filename:'26-project-persistence.projectData.js'}
);

const runtimeBefore=plain({layers:S.layers,stack:S.stack,plate:S.plates[0]});
const preBefore=plain(S._preLayoutMapState);
const saved=plain(projectData());
const savedLayers=Object.fromEntries(saved.layers.map(layer=>[layer.id,layer]));

assert.equal(areaSyncCalls,1,'projectData continua sincronizando atributos de área');
assert.equal(plateCaptureCalls,1,'projectData continua capturando somente os campos próprios da prancha');

assert.equal(savedLayers[11].visible,true,
  'projeto salvo no Layout deve usar a visibilidade canônica do mapa 2D');
assert.equal(savedLayers[22].visible,false,
  'visibilidade temporária da prancha antiga não pode vazar para o projeto');
assert.deepEqual(saved.stack,['L:11','L:22'],
  'projeto salvo no Layout deve usar a ordem canônica do mapa 2D');

const serializedConvention=layer=>({
  name:layer.name,color:layer.color,weight:layer.weight,fill:layer.fill,
  sym:layer.sym,labelField:layer.labelField,labelFields:layer.labelFields,
  lbl:layer.lbl,attrFilter:layer.attrFilter
});
const expectedConvention=conv=>serializedConvention(conv);
assert.deepEqual(serializedConvention(savedLayers[11]),expectedConvention(mapConventionA),
  'simbologia, rótulos e filtro salvos devem ser os canônicos do mapa 2D');
assert.deepEqual(serializedConvention(savedLayers[22]),expectedConvention(mapConventionB),
  'a convenção canônica deve ser resolvida por id para todas as camadas');

assert.deepEqual(saved.plates[0].vis,oldPlate.vis,
  'salvar o projeto não deve substituir a visibilidade congelada da prancha antiga');
assert.deepEqual(saved.plates[0].stack,oldPlate.stack,
  'salvar o projeto não deve substituir a ordem congelada da prancha antiga');
assert.deepEqual(saved.plates[0].conv,oldPlate.conv,
  'a fotografia cartográfica da prancha antiga deve continuar preservada');

assert.deepEqual(plain({layers:S.layers,stack:S.stack,plate:S.plates[0]}),runtimeBefore,
  'serializar não deve trocar o estado temporário que o usuário está vendo no Layout');
assert.deepEqual(plain(S._preLayoutMapState),preBefore,
  'serializar não deve consumir nem alterar o estado canônico guardado do mapa 2D');

console.log('OK: projectData salva visibilidade, ordem e convenção canônicas do 2D durante o Layout, preservando a prancha antiga.');
