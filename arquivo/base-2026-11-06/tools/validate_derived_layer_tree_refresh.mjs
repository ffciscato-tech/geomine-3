import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
/* Por padrão valida os módulos oficiais. A variável opcional permite provar o
   mesmo contrato no bundle ainda não reconstruído durante um ciclo test-first. */
const bundlePath=process.env.GEOMINE_VALIDATE_BUNDLE||'';
const bundle=bundlePath?read(bundlePath):'';
const bootstrap=bundle||read('src/core/parts/01-bootstrap-crs-state-command.js');
const layersSource=bundle||read('src/core/parts/05-layer-model-symbology.js');
const treeSource=bundle||read('src/core/parts/15-layer-tree-crs-ui.js');
const geoprocessing=bundle||read('src/core/parts/25-geoprocessing-tin.js');

/* Extrai as funções reais sem encerrar o bloco em comentários ou strings. */
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
    if(ch==='\''||ch==='"'||ch.charCodeAt(0)===96){state=ch;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return i;
  }
  assert.fail(label+': bloco JavaScript não foi fechado');
}

function functionDeclaration(source,name){
  const safe=name.replace(/[\^$.*+?()[\]{}|]/g,'\\$&');
  const match=new RegExp('\\bfunction\\s+'+safe+'\\s*\\(').exec(source);
  assert.ok(match,'função '+name+' ausente');
  const open=source.indexOf('{',match.index+match[0].length);
  assert.ok(open>=0,'função '+name+': corpo ausente');
  return source.slice(match.index,blockEnd(source,open,'função '+name)+1);
}

const group={id:7,name:'Levantamento',collapsed:false};
const sourceA={
  id:1,name:'Cristas',gtype:'line',crs:'EPSG:31983',groupId:group.id,
  visible:true,llayer:{},fields:[{name:'TIPO',type:'C',length:20,decimal:0}],
  features:[{geom:[[0,0],[10,0]],props:{TIPO:'CRISTA'}}]
};
const sourceB={
  id:2,name:'Pés',gtype:'line',crs:'EPSG:31983',groupId:group.id,
  visible:true,llayer:{},fields:[{name:'TIPO',type:'C',length:20,decimal:0}],
  features:[{geom:[[0,5],[10,5]],props:{TIPO:'PE'}}]
};
const rootLayer={
  id:3,name:'Limite',gtype:'polygon',crs:'EPSG:31983',groupId:null,
  visible:true,llayer:{},fields:[],features:[]
};
const S={
  workCRS:'EPSG:31983',layers:[rootLayer,sourceA,sourceB],groups:[group],
  rasters:[],img:null,stack:['L:3','L:1','L:2'],activeId:3,_srcNow:null
};
const checked=[
  {dataset:{id:'1'},checked:true},
  {dataset:{id:'2'},checked:true}
];
const mgOut={innerHTML:''};
const document={
  querySelectorAll:selector=>selector==='.mg-ck:checked'?checked:[],
  getElementById:id=>id==='mgOut'?mgOut:null
};

const plain=value=>JSON.parse(JSON.stringify(value));
const scheduled=[];
const schedule=fn=>{scheduled.push(fn);return scheduled.length;};
async function flushScheduled(){
  for(let round=0;round<20;round++){
    await Promise.resolve();
    if(!scheduled.length){
      await Promise.resolve();
      if(!scheduled.length)return;
    }
    const batch=scheduled.splice(0);
    batch.forEach(fn=>fn());
  }
  assert.fail('a fila de atualização não estabilizou após 20 ciclos');
}

let context,refreshes=0,renderedKeys=[];
const sandbox={
  console,structuredClone,S,document,window:{},uid:100,
  CRS_LABELS:{'EPSG:31983':'SIRGAS 2000 / UTM 23S'},
  defaultLabelCfg:()=>({show:false,unique:false}),
  fromWGS:(_crs,x,y)=>[x,y],
  reproject:(_from,_to,x,y)=>[x,y],
  reproj:(_from,_to,x,y)=>[x,y],
  drawLayer:layer=>{layer.llayer={};},
  toast:()=>{},showLoad:()=>{},hideLoad:()=>{},
  refreshTinPanel:()=>{},refreshGtPanel:()=>{},refreshMergePanel:()=>{},
  setTimeout:schedule,clearTimeout:()=>{},
  requestAnimationFrame:schedule,cancelAnimationFrame:()=>{},
  queueMicrotask:schedule,
  zApply:()=>context.stackSync(),
  refreshUI:()=>{
    refreshes++;
    renderedKeys=plain(context.displayList().map(item=>
      item.kind==='group'?'G:'+item.g.id:context.nodeKey(item.n.t,item.n.id)));
  }
};
context=vm.createContext(sandbox);
vm.runInContext(read('src/core/layer-store.js'),context,{filename:'layer-store.js'});
vm.runInContext([
  functionDeclaration(bootstrap,'nodeKey'),
  functionDeclaration(bootstrap,'allNodes'),
  functionDeclaration(bootstrap,'stackSync'),
  functionDeclaration(treeSource,'displayList'),
  functionDeclaration(layersSource,'addLayer'),
  functionDeclaration(geoprocessing,'gtZg'),
  functionDeclaration(geoprocessing,'runMerge')
].join('\n'),context,{filename:'derived-layer-tree-refresh.contract.js'});

context.refreshUI();
const stackBefore=S.stack.slice();
const membershipBefore=S.layers.map(layer=>[layer.id,layer.groupId??null]);
assert.deepEqual(renderedKeys,['L:3','G:7','L:1','L:2'],
  'pré-condição: a árvore inicial deve refletir raiz e grupo');

context.runMerge();
await flushScheduled();

const output=S.layers[0];
assert.match(output.name,/^Mescla \(2 camadas\)$/,
  'o fluxo real de mesclagem deve criar a camada derivada');
assert.equal(output.groupId,null,
  'a política vigente para derivadas genéricas é criá-las na raiz');
assert.equal(S.activeId,output.id,
  'a camada recém-criada deve se tornar ativa');
assert.deepEqual(plain(S.stack),['L:'+output.id,...stackBefore],
  'a camada derivada deve entrar no topo sem alterar a ordem preexistente');
assert.deepEqual(
  plain(S.layers.filter(layer=>layer!==output).map(layer=>[layer.id,layer.groupId??null])),
  membershipBefore,
  'a mesclagem não pode deslocar fontes entre grupos nem alterar vínculos existentes'
);
assert.deepEqual(
  plain(context.displayList().map(item=>
    item.kind==='group'?'G:'+item.g.id:context.nodeKey(item.n.t,item.n.id))),
  ['L:'+output.id,'L:3','G:7','L:1','L:2'],
  'o modelo da árvore deve manter topo, raiz e bloco do grupo coerentes'
);

assert.deepEqual(
  {renderedKeys,refreshes},
  {
    renderedKeys:['L:'+output.id,'L:3','G:7','L:1','L:2'],
    refreshes:2
  },
  'a camada mesclada existe no modelo, mas deve também aparecer imediatamente na árvore já renderizada'
);

/* Uma rajada de produtos é comum em DXF, cava e taludes. O refresh deve ser
   deferido e coalescido: os chamadores ainda ajustam grupo/estilo/ativo logo
   depois de addLayer(), e a árvore precisa observar esse estado final. */
S.layers=[sourceA,sourceB,rootLayer];
S.stack=['L:1','L:2','L:3'];
S.activeId=rootLayer.id;
delete S._layerTreeRefreshQueued;
context.refreshUI();
const refreshesBeforeBurst=refreshes;
const derivedA=context.addLayer({
  name:'Derivada A',gtype:'line',crs:S.workCRS,features:[],fields:[]
});
derivedA.groupId=group.id;
const derivedB=context.addLayer({
  name:'Derivada B',gtype:'line',crs:S.workCRS,features:[],fields:[]
});
derivedB.groupId=group.id;
S.activeId=derivedA.id;  // o chamador pode restaurar outra camada ativa

assert.equal(refreshes,refreshesBeforeBurst,
  'addLayer não deve reconstruir a árvore antes de o chamador terminar grupo/estilo/ativo');
assert.equal(scheduled.length,1,
  'uma rajada síncrona de addLayer deve agendar somente uma atualização da árvore');
await flushScheduled();
assert.equal(refreshes,refreshesBeforeBurst+1,
  'a rajada deve produzir exatamente um refresh deferido');
assert.equal(S.activeId,derivedA.id,
  'o refresh deferido não pode sobrescrever a camada ativa escolhida pelo chamador');
assert.deepEqual(renderedKeys,[
  'G:7','L:'+derivedB.id,'L:'+derivedA.id,'L:1','L:2','L:3'
], 'o refresh deve enxergar groupId final, manter o grupo contíguo e preservar o sufixo anterior');

console.log('OK: derivadas/mescla aparecem imediatamente; refresh é deferido, coalescido e preserva grupos/ordem.');
