import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

const bootstrap=read('src/core/parts/01-bootstrap-crs-state-command.js');
const treeUi=read('src/core/parts/15-layer-tree-crs-ui.js');
const extensions=read('src/core/parts/18-lidar-layout-extensions.js');

/* Extrai as funções reais, sem encerrar o bloco em chaves que estejam dentro
   de comentários, strings ou templates. */
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
  return {add:()=>{},remove:()=>{},toggle:()=>{},contains:()=>false};
}
function element(value=''){
  return {
    value,checked:false,style:{},classList:classList(),textContent:'',title:'',
    querySelector:()=>null,querySelectorAll:()=>[],addEventListener:()=>{}
  };
}
const elements=new Map([['loSeloPaper',element('a4p')]]);
const document={getElementById:id=>elements.get(id)||element()};

/* Cenário determinístico: Projeto contém G1={L1,L2}, G2={L3,L4} e um
   subgrupo vazio. O pai não possui camada direta; por isso G:100 também é
   indispensável para conservar sua posição e a hierarquia na pilha. */
const groups=[
  {id:100,name:'Projeto',parentId:null,collapsed:false},
  {id:110,name:'G1',parentId:100,collapsed:true},
  {id:120,name:'G2',parentId:100,collapsed:false},
  {id:130,name:'Levantamentos futuros',parentId:100,collapsed:true}
];
const layers=[
  {id:1,name:'L1',groupId:110,visible:true},
  {id:2,name:'L2',groupId:110,visible:true},
  {id:3,name:'L3',groupId:120,visible:true},
  {id:4,name:'L4',groupId:120,visible:true}
];
const rasters=[];

const stackGrouped=['G:100','L:1','L:2','L:3','L:4','G:130'];
const stackA4=stackGrouped.slice();
/* Snapshot legado inválido: intercala membros de G1 e G2. Aplicá-lo não pode
   desmontar os blocos atuais nem fazer L2 aparecer debaixo do cabeçalho G2. */
const stackA3=['G:100','L:1','L:3','L:2','L:4','G:130'];
const collapsedA4={100:false,110:true,120:false,130:true};
const collapsedA3={100:true,110:false,120:true,130:false};
const plateGroups=collapsed=>groups.map(g=>({id:g.id,collapsed:collapsed[g.id]}));
const vis={'L:1':true,'L:2':true,'L:3':true,'L:4':true};

const a4={
  id:41,name:'Prancha A4',f:{loSeloPaper:'a4p'},c:{},center:null,
  vis:{...vis},conv:{},stack:stackA4.slice(),groups:plateGroups(collapsedA4)
};
const a3={
  id:31,name:'Prancha A3',f:{loSeloPaper:'a3l'},c:{},center:null,
  vis:{...vis},conv:{},stack:stackA3.slice(),groups:plateGroups(collapsedA3)
};

const S={
  _view:'layout',loMode:'a4',loFrozen:true,loPranchaFormato:'a4',loCenter:null,
  groups,layers,rasters,img:null,stack:stackA4.slice(),plates:[a4,a3],plateId:41,
  _loAppliedPlateId:41,_loDraftVis:null,_loDraftConv:null,_loDraftStack:null
};

let context;
const sandbox={
  console,structuredClone,S,document,
  window:{loCoordUISync:()=>{}},PLATE_FIELDS:['loSeloPaper'],PLATE_CHECKS:[],
  drawLayer:()=>{},renderRaster:()=>{},loNotaSyncBotao:()=>{},
  layoutVisSnapshot:()=>({...vis}),layoutConventionSnapshot:()=>({}),
  layoutFrozenDirty:()=>{},platesInit:()=>{},syncLoBtns:()=>{},
  renderPlateTabs:()=>{},buildLayout:()=>{},
  nodeSetVis:(node,on)=>{node.o.visible=!!on;},
  refreshUI:()=>context.stackSync(),zApply:()=>context.stackSync()
};
context=vm.createContext(sandbox);
vm.runInContext(read('src/core/layer-store.js'),context,{filename:'layer-store.js'});

vm.runInContext([
  functionDeclaration(bootstrap,'nodeKey'),
  functionDeclaration(bootstrap,'allNodes'),
  functionDeclaration(bootstrap,'stackSync'),
  functionDeclaration(treeUi,'displayList'),
  functionDeclaration(extensions,'layoutClone'),
  functionDeclaration(extensions,'layoutStateEqual'),
  functionDeclaration(extensions,'layoutVectorConvention'),
  functionDeclaration(extensions,'layoutConventionApply'),
  functionDeclaration(extensions,'layoutStackApply'),
  functionDeclaration(extensions,'plateCapture'),
  functionDeclaration(extensions,'plateApply'),
  functionDeclaration(extensions,'plateFormato'),
  functionDeclaration(extensions,'ativaPrancha')
].join('\n'),context,{filename:'layout-a4-a3-tree.contract.js'});

const plain=value=>JSON.parse(JSON.stringify(value));
const hierarchyBefore=plain(groups.map(g=>({id:g.id,name:g.name,parentId:g.parentId??null})));
const membershipBefore=plain([
  ...layers.map(item=>['L:'+item.id,item.groupId??null]),
  ...rasters.map(item=>['R:'+item.id,item.groupId??null])
]);
const plateSnapshotsBefore=plain([a4,a3].map(pl=>({
  id:pl.id,stack:pl.stack,groups:pl.groups
})));

const collapsedNow=()=>Object.fromEntries(S.groups.map(g=>[g.id,!!g.collapsed]));
const hierarchyNow=()=>plain(S.groups.map(g=>({id:g.id,name:g.name,parentId:g.parentId??null})));
const membershipNow=()=>plain([
  ...S.layers.map(item=>['L:'+item.id,item.groupId??null]),
  ...S.rasters.map(item=>['R:'+item.id,item.groupId??null])
]);
const displayKeys=()=>plain(context.displayList().map(item=>item.kind==='group'
  ?'G:'+item.g.id:context.nodeKey(item.n.t,item.n.id)));
const displayGrouped=['G:100','G:110','L:1','L:2','G:120','L:3','L:4','G:130'];

/* A4 -> A3: aplica somente o estado visual próprio da A3. A estrutura da
   árvore e os vínculos das camadas continuam sendo o mesmo projeto. */
context.ativaPrancha('a3');
assert.equal(S.plateId,31,'a troca A4 → A3 deve ativar a prancha A3');
assert.equal(S.loPranchaFormato,'a3','o formato ativo deve ser A3');
assert.deepEqual(hierarchyNow(),hierarchyBefore,
  'A4 → A3 não pode apagar nomes nem relações pai/filho dos grupos');
assert.deepEqual(membershipNow(),membershipBefore,
  'A4 → A3 não pode alterar o groupId de nenhuma camada');
assert.deepEqual(plain(S.stack),stackGrouped,
  'A4 → A3 deve sanear o snapshot intercalado e preservar blocos G1={L1,L2}, G2={L3,L4} e G:id vazio');
assert.deepEqual(displayKeys(),displayGrouped,
  'displayList deve manter cada camada imediatamente sob o cabeçalho do seu grupo');
assert.deepEqual(plain(collapsedNow()),collapsedA3,
  'A4 → A3 deve restaurar o estado collapsed próprio da prancha A3');

/* A3 -> A4: prova a restauração bidirecional; não basta a primeira troca
   coincidir acidentalmente com o estado global que já estava na memória. */
context.ativaPrancha('a4');
assert.equal(S.plateId,41,'a troca A3 → A4 deve reativar a prancha A4');
assert.equal(S.loPranchaFormato,'a4','o formato ativo deve voltar para A4');
assert.deepEqual(hierarchyNow(),hierarchyBefore,
  'A3 → A4 não pode apagar a hierarquia dos grupos e subgrupos');
assert.deepEqual(membershipNow(),membershipBefore,
  'A3 → A4 não pode alterar os groupId das camadas');
assert.deepEqual(plain(S.stack),stackA4,
  'A3 → A4 deve restaurar exatamente a ordem original completa da A4');
assert.deepEqual(displayKeys(),displayGrouped,
  'A3 → A4 também deve manter blocos, hierarquia e o grupo vazio');
assert.deepEqual(plain(collapsedNow()),collapsedA4,
  'A3 → A4 deve restaurar o estado collapsed próprio da prancha A4');

assert.deepEqual(plain([a4,a3].map(pl=>({id:pl.id,stack:pl.stack,groups:pl.groups}))),
  plateSnapshotsBefore,'alternar formatos não pode modificar os snapshots das pranchas');

console.log('OK: A4 ↔ A3 preserva hierarquia, groupId, pilha completa e collapsed por prancha.');
