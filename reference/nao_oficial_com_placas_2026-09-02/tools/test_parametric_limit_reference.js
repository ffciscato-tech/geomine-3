#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert'),vm=require('vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const template=read('src/index.template.html'),
  core=read('src/core/parts/22-mine-pit-design.js'),
  preservado=read('src/modules/mining/alagis-cava-parametrica-preservada.js'),
  tree=read('src/core/parts/15-layer-tree-crs-ui.js'),
  persist=read('src/core/parts/26-project-persistence.js');

assert(template.includes('id="rb31NomeLim"'),'falta o nome da nova feição');
assert(template.includes('id="btnCavaCriarLimiteParam"'),'falta a criação explícita da cópia');
assert(template.includes('Limite inicial de referência (permanece intacto)'));
assert(template.includes('◈ Criar/usar limite paramétrico'));
assert(tree.includes('Limite paramétrico — cópia editável'));
assert(tree.includes('>◈</span>'),'a árvore precisa do ícone próprio');

const ini=core.indexOf('function cavaLimiteDinamico('),fim=core.indexOf('function rb31LeLimite(',ini),
  clone=core.slice(ini,fim);
assert(ini>=0&&fim>ini);
assert(clone.includes('opt.forceNew'),'a mesma referência deve aceitar outra mina nomeada');
assert(clone.includes("TIPO:subida?'Limite paramétrico — pé':'Limite paramétrico — crista'"));
assert(core.includes("dash:up?'6 4':''"),'pé deve ser pontilhado e crista contínua');
assert(clone.includes('item.L.visible=true'),'a referência não pode ser escondida');
assert(!clone.includes('cavaDecimaVertices(fech'),'a cópia inicial deve preservar todos os vértices');
assert(clone.includes('geom:fech'),'a cópia precisa de geometria independente');
assert(clone.includes('NOME:nome'),'o nome escolhido deve ir para a feição');
assert(core.includes("cp2.textContent=it2.L._cavaLimiteDin?'◈ Usar como novo limite'"),
  'ao selecionar um limite ◈, a interface deve oferecer reutilização sem cópia');
assert(core.includes('S._rb31NovoDoLimiteId=bruto.L.id'),
  'a reutilização precisa marcar explicitamente uma nova sequência construtiva');

for(const src of [core,preservado]){
  assert(src.includes('A referência é protegida.')||src.includes('A referência original nunca entra'));
  assert(src.includes('const din=cavaLimiteDinamico(item,z0)'),
    'toda geração nova deve migrar da referência para a cópia paramétrica');
}
assert(preservado.slice(preservado.indexOf('function rb31LeLimite('),
  preservado.indexOf('function rb31Gerar(')).includes('cavaLimiteDinamico(item,z0)'),
  'o motor RB31 ativo deve trabalhar na cópia');
assert(persist.includes('_cavaLimiteDin:!!L._cavaLimiteDin'));
assert(persist.includes('_cavaLimiteOrig:L._cavaLimiteOrig'));
assert(persist.includes('_cavaReferencia:!!L._cavaReferencia'));
assert(persist.includes('_cavaReferencia:!!o._cavaReferencia'));

/* Ensaio funcional: clicar no botão com um ◈ selecionado não chama addLayer,
   não altera a geometria e arma uma nova sequência de cristas/pés. */
const c0=core.indexOf('function cavaCriarLimiteParametrico()'),
  c1=core.indexOf('\nfunction rb31LeLimite(',c0),
  r0=core.indexOf('function rb31Reconecta('),
  r1=core.indexOf('\nfunction ',r0+20),
  fields={rb31NomeLim:{value:''},cavaLimiteParamInfo:{innerHTML:''},
    btnCavaCriarLimiteParam:{textContent:'',title:''}},
  limite={id:'lim-param-1',name:'DCE paramétrico',_cavaLimiteDin:true,gtype:'line',
    features:[{geom:[[0,0],[10,0],[10,10],[0,0]],props:{}}]},
  item={L:limite,f:limite.features[0],i:0};
let camadasCriadas=0,reconectou=0,itemCalls=0;
const ctx={console,document:{getElementById:id=>fields[id]||null},
  S:{layers:[limite],selFeat:{layer:limite,idx:0},_rb31:{banco:4},_cavaProjectId:'antigo'},
  cavaItemSelecionado:()=>{itemCalls++;return item;},
  cavaReferenciaDoLimite:x=>x,cavaFonteOriginal:x=>x,
  cavaNomeLimiteParametrico:()=>'',cavaLimiteDinamico:()=>{camadasCriadas++;},
  rb31LimpaMarcaInicio:()=>{},refreshCavaMineracao:()=>{},refreshUI:()=>{},
  setTool:()=>{},toast:()=>{},esc:x=>String(x),rb31PilhaDoItem:()=>{reconectou++;return null;}};
vm.createContext(ctx);
vm.runInContext(core.slice(c0,c1)+core.slice(r0,r1),ctx);
const usado=ctx.cavaCriarLimiteParametrico();
assert.equal(usado.L,limite);assert.equal(ctx.S.layers.length,1);
assert.equal(camadasCriadas,0,'não pode criar uma cópia da camada paramétrica');
assert.equal(itemCalls,0,'o botão deve priorizar diretamente o ◈ selecionado na árvore');
assert.equal(ctx.S._rb31,null,'a nova sequência deve começar sem herdar bancos antigos');
assert.equal(ctx.S._rb31NovoDoLimiteId,limite.id);
assert.equal(fields.btnCavaCriarLimiteParam.textContent,'◈ Usar como novo limite');
assert.equal(ctx.rb31Reconecta(false),false,'a ação explícita não pode reconectar a cava antiga');
assert.equal(reconectou,0,'a receita anterior não deve ser consultada neste primeiro gerar');

console.log('OK: referência preservada, cópia nomeada ◈ e reutilização direta sem duplicação validadas.');
