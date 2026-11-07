import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const source=fs.readFileSync(path.join(root,'src/modules/geology/geology-workspace.js'),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));

const layerTools=[
  'litologia','contato-geologico','falha','dobra','acamamento',
  'xistosidade','fratura','veio','dique','zona-cisalhamento',
  'sondagem','spt','trincheira','afloramento','ponto-amostra',
  'dominio-geologico','lineacao','foliacao','plunging'
];
const actionTools=[
  'log-sondagem','testemunho','modelo-geologico-3d',
  'surpac-superficies','importar-furos-string','importar-furos-csv',
  'secao-geologica','mapa-estrutural','estereograma',
  'mapeamento-campo','ficha-campo'
];

const existingGroup={id:7,name:'Levantamento de campo',parentId:null,collapsed:true};
const existing={
  id:1,name:'Base interpretada pelo usuário',gtype:'polygon',crs:'EPSG:31983',
  visible:true,groupId:7,color:'#102030',weight:7,fill:.61,
  sym:{mode:'cat',field:'UNIDADE',cats:[{value:'A',color:'#abcdef'}]},
  fields:[{name:'UNIDADE',type:'C',length:40}],features:[]
};
const S={
  workCRS:'EPSG:31983',layers:[existing],rasters:[],groups:[existingGroup],
  stack:['G:7','L:1'],activeId:1,selRaster:{id:'r1'},selFeat:null,geology:null
};
let uid=100,gid=20,draws=0,refreshes=0,props=0,zCalls=0;
const armed=[],notices=[];
const context={
  console,structuredClone,S,gid,RIB_CAT_ATUAL:'inicio',
  window:null,
  addLayer:def=>{
    const L={id:uid++,visible:true,groupId:null,weight:2,fill:.35,
      sym:{mode:'single',color:def.color||'#f5a524',stroke:def.color||'#f5a524',weight:2},
      labelField:'',lbl:{},...def,llayer:null};
    S.layers.unshift(L);S.stack.unshift('L:'+L.id);S.activeId=L.id;return L;
  },
  drawLayer:()=>{draws++;},refreshUI:()=>{refreshes++;},
  propRefresh:()=>{props++;},zApply:()=>{zCalls++;},
  setTool:tool=>{armed.push(tool);S.tool=tool;},
  switchView:view=>{S._view=view;},
  setTimeout:fn=>{fn();return 1;},clearTimeout:()=>{},toast:message=>notices.push(message),
  document:{querySelector:()=>null,createElement:()=>({}),body:{appendChild:()=>{}}},
  Blob:class {},URL:{createObjectURL:()=>'',revokeObjectURL:()=>{}}
};
context.window=context;
vm.createContext(context);
vm.runInContext(source,context,{filename:'geology-workspace.js'});

const api=context.GeoMineGeology,defs=context.GEOLOGY_TOOL_DEFS;
assert.ok(api&&typeof api.run==='function','workspace deve publicar GeoMineGeology.run');
for(const method of ['createOrActivate','activateLayer','state','snapshot','restore'])
  assert.equal(typeof api[method],'function',`workspace sem ${method}()`);
assert.deepEqual(Object.keys(defs).sort(),layerTools.slice().sort(),
  'catálogo deve conter exatamente os 19 presets de camadas do MVP');

/* Sanidade do catálogo: geometria, ferramenta de desenho, campos e estilo
   precisam vir do preset, não de nomes inferidos depois da criação. */
for(const [kind,def] of Object.entries(defs)){
  assert.ok(['point','line','polygon'].includes(def.gtype),`${kind}: gtype inválido`);
  assert.equal(def.tool,def.gtype==='polygon'?'poly':def.gtype,
    `${kind}: ferramenta de desenho incompatível com a geometria`);
  assert.ok(def.family,`${kind}: família geológica ausente`);
  assert.match(def.color,/^#[0-9a-f]{6}$/i,`${kind}: cor padrão inválida`);
  const names=def.fields.map(field=>field.name);
  assert.equal(names[0],'FID',`${kind}: primeiro campo deve ser FID`);
  assert.ok(names.length>=4,`${kind}: esquema geológico insuficiente`);
}
const fieldNames=kind=>defs[kind].fields.map(field=>field.name);
assert.equal(defs.litologia.gtype,'polygon');
assert.ok(fieldNames('litologia').includes('LITOLOGIA'));
assert.equal(defs.falha.gtype,'line');
assert.deepEqual(
  plain(fieldNames('acamamento').filter(x=>['DIRECAO','MERGULHO'].includes(x))),
  ['DIRECAO','MERGULHO']
);
assert.equal(defs.sondagem.gtype,'point');
assert.ok(fieldNames('sondagem').includes('ID_FURO'));
assert.equal(defs['dominio-geologico'].gtype,'polygon');

const treeBefore={
  group:plain(existingGroup),groupId:existing.groupId,
  style:plain({color:existing.color,weight:existing.weight,fill:existing.fill,sym:existing.sym}),
  oldStack:S.stack.slice()
};

for(const kind of layerTools){
  const L=api.createOrActivate(kind),def=defs[kind];
  assert.ok(L,`${kind}: createOrActivate não devolveu camada`);
  assert.equal(L.gtype,def.gtype,`${kind}: geometria criada difere do preset`);
  assert.equal(L.crs,S.workCRS,`${kind}: camada não usa o CRS do projeto`);
  assert.deepEqual(plain(L._geology),{
    schemaVersion:1,kind,family:def.family
  },`${kind}: metadado geológico tipado incorreto`);
  assert.equal(L.visible,true,`${kind}: camada recém-criada deve ficar visível`);
  assert.equal(S.activeId,L.id,`${kind}: camada recém-criada deve ficar ativa`);
  assert.ok(L.groupId!=null,`${kind}: camada deve integrar o grupo Geologia`);
  assert.equal(L.sym.color,def.color,`${kind}: cor do preset não foi aplicada`);
  assert.deepEqual(plain(L.fields.map(field=>field.name)),plain(def.fields.map(field=>field.name)),
    `${kind}: campos foram alterados na criação`);
}

assert.equal(S.layers.filter(L=>L._geology).length,layerTools.length,
  'cada preset deve produzir exatamente uma camada tipada');
const geologyGroup=S.groups.find(g=>g.name==='Geologia');
assert.ok(geologyGroup,'camadas tipadas devem ficar num grupo Geologia');
assert.deepEqual(plain(S.groups.find(g=>g.id===existingGroup.id)),treeBefore.group,
  'criar camadas geológicas não pode alterar grupos preexistentes');
assert.equal(existing.groupId,treeBefore.groupId,
  'criar camadas geológicas não pode deslocar camada preexistente de grupo');
assert.deepEqual(
  plain({color:existing.color,weight:existing.weight,fill:existing.fill,sym:existing.sym}),
  treeBefore.style,'criar camadas geológicas não pode alterar estilos existentes'
);
assert.deepEqual(S.stack.filter(key=>treeBefore.oldStack.includes(key)),treeBefore.oldStack,
  'novas camadas não podem reordenar os nós que já existiam na árvore');

/* Reativar é diferente de recriar: o usuário pode renomear e personalizar a
   simbologia. O comando deve somente tornar a mesma camada visível/ativa. */
const lith=S.layers.find(L=>L._geology?.kind==='litologia');
lith.name='Unidades revisadas';lith.visible=false;lith.color='#010203';
lith.weight=9;lith.fill=.77;lith.sym={mode:'cat',field:'UNIDADE',cats:[{value:'Q',color:'#abcdef'}]};
const countBefore=S.layers.length;
S.activeId=existing.id;S.selRaster={id:'r2'};
const reactivated=api.createOrActivate('litologia');
assert.equal(reactivated,lith,'reativar deve devolver a mesma camada');
assert.equal(S.layers.length,countBefore,'reativar não pode criar duplicata');
assert.equal(S.activeId,lith.id,'reativar deve selecionar a camada');
assert.equal(S.selRaster,null,'ativar vetor deve limpar seleção de raster');
assert.equal(lith.visible,true,'reativar deve religar a camada');
assert.deepEqual(
  plain({name:lith.name,color:lith.color,weight:lith.weight,fill:lith.fill,sym:lith.sym}),
  {name:'Unidades revisadas',color:'#010203',weight:9,fill:.77,
    sym:{mode:'cat',field:'UNIDADE',cats:[{value:'Q',color:'#abcdef'}]}},
  'reativar não pode repor nome ou estilo padrão'
);

/* Executar os 19 botões de desenho deve reutilizar as camadas existentes e
   armar a ferramenta compatível, sem aumentar a árvore. */
for(const kind of layerTools){
  const n=S.layers.length,expected=defs[kind].tool;
  api.run(kind,null);
  assert.equal(S.layers.length,n,`${kind}: run duplicou a camada existente`);
  assert.equal(armed.at(-1),expected,`${kind}: run não armou ${expected}`);
}

/* Os botões não-camada também precisam possuir rotas concretas no
   dispatcher. O teste estrutural evita abrir modais/canvas no Node, mas falha
   se qualquer fluxo voltar a cair apenas na mensagem "não reconhecido". */
for(const tool of actionTools){
  const escaped=tool.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  assert.match(source,new RegExp(`kind\\s*===\\s*['\"]${escaped}['\"]`),
    `${tool}: rota real ausente em run()`);
}

/* Os imports só abrem o gerenciador no modo correto. Não criam o preset de
   desenho "sondagem", não alteram a seleção e devolvem o resultado do modal. */
const importCalls=[],treeBeforeImport=plain({layers:S.layers,groups:S.groups,stack:S.stack,activeId:S.activeId});
api.boreholes={open(mode){importCalls.push({mode,receiver:this});return 'modal:'+mode;}};
assert.equal(api.run('importar-furos-string'),'modal:str');
assert.equal(api.run('importar-furos-csv'),'modal:csv');
assert.deepEqual(importCalls.map(call=>call.mode),['str','csv']);
assert.ok(importCalls.every(call=>call.receiver===api.boreholes),'open deve preservar o receptor do gerenciador');
assert.deepEqual(plain({layers:S.layers,groups:S.groups,stack:S.stack,activeId:S.activeId}),treeBeforeImport,
  'abrir importação não pode criar camadas nem alterar a árvore/seleção');
delete api.boreholes;
for(const tool of ['importar-furos-string','importar-furos-csv']){
  api.run(tool);
  assert.match(notices.at(-1),/módulo de importação de sondagens não foi carregado/,
    `${tool}: módulo ausente deve produzir aviso claro`);
}

assert.ok(draws>=layerTools.length&&refreshes>=layerTools.length&&props>=layerTools.length&&zCalls>=layerTools.length,
  'criação/ativação deve atualizar mapa, árvore, propriedades e ordem de desenho');

console.log('OK: 19 presets preservam árvore/estilos; 11 fluxos têm rotas reais, com importação str/csv isolada do desenho manual.');
