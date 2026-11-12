import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

process.on('uncaughtException',error=>{
  console.error('UNCAUGHT:',error&&error.message||error);
  process.exit(1);
});
process.on('unhandledRejection',error=>{
  console.error('UNHANDLED:',error&&error.message||error);
  process.exit(1);
});

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

const layoutSource=read('src/core/parts/17-layout-printing.js');
const layoutUiSource=read('src/core/parts/18-lidar-layout-extensions.js');
const persistenceSource=read('src/core/parts/26-project-persistence.js');
const template=read('src/index.template.html');

function between(source,start,end,label){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,`${label}: trecho entre ${start} e ${end} não encontrado`);
  return source.slice(a,b);
}

/* Extrai declarações sem confundir chaves de comentários, strings ou
   template literals. Isso permite executar somente o contrato sob teste. */
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

function htmlTagById(source,id){
  const tags=(source.match(/<[^>]+>/g)||[]).filter(tag=>{
    const hit=/\bid\s*=\s*(["'])(.*?)\1/i.exec(tag);
    return hit&&hit[2]===id;
  });
  assert.equal(tags.length,1,`a UI deve conter exatamente um #${id}`);
  return tags[0];
}

/* ---------- núcleo real da legenda ---------- */
const legendCode=between(
  layoutSource,
  'function legendVisibilityState()',
  'function layoutWmsUrl(',
  'modelo de visibilidade da legenda'
);

const group={id:7,name:'Operação'};
const sinalizacao={
  id:11,name:'Sinalização',gtype:'point',visible:true,groupId:7,
  sym:{mode:'cat',field:'TIPO',color:'#f5a524',stroke:'#222222',weight:1.5,
    cats:[
      {value:'Limite 20 km/h',color:'#ef4444',vis:true},
      {value:'Sentido Duplo',color:'#f59e0b',vis:true},
      {value:'Categoria apagada no mapa',color:'#64748b',vis:false}
    ],classes:[],pt:{shape:'circle',size:32}}
};
const topografia={
  id:12,name:'Curvas mestras',gtype:'line',visible:true,groupId:7,
  sym:{mode:'single',color:'#22c1c3',stroke:'#22c1c3',weight:2,classes:[],cats:[]}
};
const camadaMapaOculta={
  id:13,name:'Não aparece',gtype:'line',visible:false,groupId:7,
  sym:{mode:'single',color:'#000000',stroke:'#000000',weight:1,classes:[],cats:[]}
};
const raster={
  id:21,name:'Favorabilidade',visible:true,groupId:null,
  style:{mode:'classes',classes:[
    {min:0,max:15,label:'Baixa',color:'#ef4444',vis:true},
    {min:15,max:50,label:'Média apagada no mapa',color:'#f59e0b',vis:false},
    {min:50,max:100,label:'Alta',color:'#22c55e',vis:true}
  ]}
};
const ortofoto={id:0,name:'Ortofoto',visible:true,groupId:null};
const wms={id:31,name:'Limites públicos',visible:true,provider:'WMS'};

const nodes=[
  {t:'L',id:sinalizacao.id,o:sinalizacao},
  {t:'L',id:topografia.id,o:topografia},
  {t:'L',id:camadaMapaOculta.id,o:camadaMapaOculta},
  {t:'R',id:raster.id,o:raster},
  {t:'I',id:0,o:ortofoto}
];
const display=[
  {kind:'group',g:group},
  {kind:'layer',n:nodes[0]},
  {kind:'layer',n:nodes[1]},
  {kind:'layer',n:nodes[2]},
  {kind:'raster',n:nodes[3]},
  {kind:'img',n:nodes[4]}
];

const S={
  loMode:'a4',plateId:101,plates:[{id:101,name:'Prancha A'}],wms:[wms]
};
const context=vm.createContext({
  console,S,
  displayList:()=>display,
  groupMembers:id=>nodes.filter(n=>n.o.groupId===id),
  fmt:value=>String(value),
  ptCfg:L=>L.sym.pt||{shape:'circle',size:14},
  containerCountLayerRole:()=>null,
  containerCountSummaryFromLayer:()=>null,
  containerCountLevelsText:()=>'',
  rasterStats:()=>null,
  loRampaRaster:()=>['#000000','#ffffff'],
  rasUnidadeValor:()=>'',
  loT:value=>value
});
vm.runInContext(legendCode,context,{filename:'17-layout-printing.legend-visibility.js'});

const labels=()=>Array.from(context.legendItems(),item=>item.label);
const rows=()=>Array.from(context.legendControlRows(),row=>({...row}));
const resetPlate=()=>{S.loMode='a4';S.plateId=101;S.plates[0].legendVis={};};

/* Projeto antigo: a ausência do novo estado deve significar "mostrar tudo". */
assert.equal(Object.hasOwn(S.plates[0],'legendVis'),false,
  'a simulação começa como uma prancha de versão antiga');
const legacyLabels=labels();
assert.deepEqual({...S.plates[0].legendVis},{},'prancha antiga recebe estado vazio compatível');
assert.ok(legacyLabels.includes('Sinalização · TIPO'),'camada categorizada antiga continua na legenda');
assert.ok(legacyLabels.includes('Limite 20 km/h'),'categoria antiga continua na legenda');
assert.ok(legacyLabels.includes('Sentido Duplo'),'segunda categoria antiga continua na legenda');
assert.ok(!legacyLabels.includes('Categoria apagada no mapa'),
  'categoria invisível no mapa não é oferecida à legenda');
assert.ok(!legacyLabels.includes('Não aparece'),'camada invisível no mapa não entra na legenda');
assert.ok(!rows().some(row=>row.label==='Categoria apagada no mapa'),
  'checklist não mostra categoria cujo olho está apagado no mapa');
assert.ok(!rows().some(row=>row.label==='Não aparece'),
  'checklist não mostra camada cujo olho está apagado no mapa');

const signalNode=nodes[0];
const speed20Key=context.legendClassKey(signalNode,'cat',sinalizacao.sym.cats[0],0);
const doubleKey=context.legendClassKey(signalNode,'cat',sinalizacao.sym.cats[1],1);
assert.equal(speed20Key,context.legendClassKey(signalNode,'cat',sinalizacao.sym.cats[0],99),
  'chave categorizada é semântica e não depende do índice');
assert.notEqual(speed20Key,doubleKey,'valores diferentes não podem compartilhar a mesma chave');

/* Excluir uma categoria afeta somente a legenda. O item permanece no
   checklist, desmarcado, para o usuário conseguir restaurá-lo. */
resetPlate();
const mapBefore=structuredClone({
  layers:[sinalizacao,topografia,camadaMapaOculta],raster,ortofoto,wms
});
context.legendVisibilitySet(speed20Key,false);
assert.equal(S.plates[0].legendVis[speed20Key],false,'estado da categoria é gravado na prancha');
assert.ok(!labels().includes('Limite 20 km/h'),'categoria desmarcada sai da legenda');
assert.ok(labels().includes('Sentido Duplo'),'categoria irmã continua na legenda');
const speed20Row=rows().find(row=>row.key===speed20Key);
assert.ok(speed20Row,'categoria excluída permanece no checklist');
assert.equal(speed20Row.on,false,'categoria excluída aparece desmarcada');
assert.deepEqual({layers:[sinalizacao,topografia,camadaMapaOculta],raster,ortofoto,wms},mapBefore,
  'editar a legenda não altera visible, vis, simbologia, geometria nem dados do mapa');

/* O checkbox da camada funciona como gate e não apaga escolhas dos filhos. */
resetPlate();
context.legendVisibilitySet(speed20Key,false);
context.legendVisibilitySet('L:11',false);
let out=labels();
assert.ok(!out.includes('Sinalização · TIPO'),'camada desmarcada remove o próprio cabeçalho');
assert.ok(!out.includes('Sentido Duplo'),'camada desmarcada remove as categorias');
assert.equal(S.plates[0].legendVis[speed20Key],false,
  'desligar a camada preserva a preferência individual da categoria');
assert.ok(rows().some(row=>row.key==='L:11'&&row.on===false),
  'camada excluída permanece disponível no checklist');

/* Não podem sobrar cabeçalhos vazios de camada ou grupo. */
resetPlate();
context.legendVisibilitySet(speed20Key,false);
context.legendVisibilitySet(doubleKey,false);
out=labels();
assert.ok(!out.includes('Sinalização · TIPO'),
  'todas as categorias excluídas removem o cabeçalho vazio da camada');
assert.equal(out.filter(label=>label==='Operação').length,1,
  'grupo misto aparece uma única vez por causa da camada ainda incluída');
context.legendVisibilitySet('L:12',false);
out=labels();
assert.ok(!out.includes('Operação'),'grupo sem nenhum descendente incluído não deixa cabeçalho órfão');

/* O gate de grupo oculta seus descendentes sem tocar o mapa. */
resetPlate();
context.legendVisibilitySet('G:7',false);
out=labels();
assert.ok(!out.includes('Operação'),'grupo desmarcado sai da legenda');
assert.ok(!out.includes('Sinalização · TIPO'),'grupo desmarcado retira a camada categorizada');
assert.ok(!out.includes('Curvas mestras'),'grupo desmarcado retira a camada simples');
assert.equal(sinalizacao.visible,true,'grupo da legenda não altera visibilidade da camada');
assert.equal(sinalizacao.sym.cats[0].vis,true,'grupo da legenda não altera o olho da categoria');

/* Classes raster seguem a mesma regra e não deixam cabeçalho vazio. */
resetPlate();
const rasterParts=context.legendNodeParts(nodes[3]);
assert.deepEqual(Array.from(rasterParts,p=>p.label),['Baixa','Alta'],
  'somente classes raster visíveis no mapa são oferecidas');
context.legendVisibilitySet(rasterParts[0].key,false);
out=labels();
assert.ok(!out.includes('Baixa')&&out.includes('Alta'),'uma faixa raster pode sair isoladamente');
context.legendVisibilitySet(rasterParts[1].key,false);
out=labels();
assert.ok(!out.includes('Favorabilidade'),'raster sem faixa incluída não deixa cabeçalho vazio');

/* Camadas simples, ortofoto e WMS também possuem chave própria. */
resetPlate();
context.legendVisibilitySet('I:0',false);
context.legendVisibilitySet('W:31',false);
out=labels();
assert.ok(!out.includes('Ortofoto'),'ortofoto desmarcada sai da legenda');
assert.ok(!out.includes('Limites públicos'),'WMS desmarcado sai da legenda');
assert.equal(ortofoto.visible,true,'ortofoto continua visível no mapa');
assert.equal(wms.visible,true,'WMS continua visível no mapa');

/* Figura e pranchas não compartilham seleção. */
resetPlate();
context.legendVisibilitySet('L:11',false);
S.loMode='fig';delete S._figLegendVis;
assert.ok(labels().includes('Sinalização · TIPO'),
  'modo Figura começa independente da seleção da prancha');
context.legendVisibilitySet('L:12',false);
assert.equal(S._figLegendVis['L:12'],false,'Figura grava seu próprio estado');
S.loMode='a4';
assert.equal(S.plates[0].legendVis['L:11'],false,'estado da prancha é restaurado ao voltar');
assert.equal(S.plates[0].legendVis['L:12'],undefined,'alteração da Figura não vazou para a prancha');

/* ---------- UI: comando exclusivo do Layout ---------- */
const legendButton=htmlTagById(template,'btnLoLegendItems');
assert.match(legendButton,/\btitle\s*=\s*(["'])[^"']*legend/i,
  'botão explica que edita os itens da legenda');
assert.match(layoutUiSource,/legenditems/,'painel rápido possui o modo legenditems');
assert.match(layoutUiSource,/\blegendControlRows\s*\(/,
  'painel usa a fonte única que filtra apenas o que está visível no mapa');
assert.match(layoutUiSource,/\blegendVisibilitySet\s*\(/,
  'checkboxes gravam o estado separado da legenda');
assert.match(layoutUiSource,/data-legend-key/,
  'cada linha do checklist transporta sua chave estável');
assert.match(layoutUiSource,/\bbuildLayout\s*\(/,
  'a prévia do Layout é recomposta após a alteração');

const setterSource=functionDeclaration(layoutSource,'legendVisibilitySet');
assert.doesNotMatch(setterSource,/\b(?:nodeSetVis|drawLayer|renderRaster|refreshUI)\s*\(/,
  'setter da legenda não pode redesenhar ou mudar camadas do mapa');
assert.doesNotMatch(setterSource,/\.(?:visible|vis)\s*=/,
  'setter da legenda não pode escrever os olhos do mapa ou das classes');

/* ---------- persistência e cópia independente ---------- */
const projectDataSource=functionDeclaration(persistenceSource,'projectData');
const loadProjectSource=functionDeclaration(persistenceSource,'loadProject');
assert.match(projectDataSource,/\bfigLegendVis\b[\s\S]*?\b_figLegendVis\b/,
  'projeto salva a seleção do modo Figura');
assert.match(projectDataSource,/\blegendVis\b[\s\S]*?\bpl\.legendVis\b/,
  'projeto salva a seleção de cada prancha');
assert.match(loadProjectSource,/\b_figLegendVis\b[\s\S]*?\bfigLegendVis\b/,
  'abertura restaura a seleção do modo Figura');
assert.match(loadProjectSource,/\blegendVis\b/,
  'abertura reconhece a seleção própria das pranchas');

const cloneSource=functionDeclaration(layoutUiSource,'layoutPlateStateClone');
const plateNewSource=functionDeclaration(layoutUiSource,'plateNew');
{
  const cloneContext=vm.createContext({console});
  const harness=vm.runInContext(`(()=>{
    const S={plates:[],plateId:1,stack:[]};let plid=2;
    const PLATE_FIELDS=[],PLATE_CHECKS=[];
    const document={getElementById:()=>null};
    const allNodes=()=>[];
    const nodeKey=(t,id)=>t+':'+id;
    const layoutConventionSnapshot=()=>({});
    const plateCapture=()=>{};
    ${functionDeclaration(layoutUiSource,'layoutClone')}
    ${cloneSource}
    ${plateNewSource}
    return {S,make:plateNew};
  })()`,cloneContext,{filename:'18-lidar-layout-extensions.plate-clone.js'});
  const original={
    id:1,name:'Original',f:{loArea:'ORIGINAL'},c:{loLegend:true},center:[1,2],
    vis:{'L:11':true},conv:{'L:11':{name:'Sinalização'}},stack:['L:11'],
    groups:[],nota:null,legendVis:{'L:11':false,[speed20Key]:false}
  };
  harness.S.plates.push(original);harness.S.plateId=1;
  const copy=harness.make('Cópia',original);
  assert.equal(JSON.stringify(copy.legendVis),JSON.stringify(original.legendVis),
    'duplicação leva as escolhas da legenda');
  assert.notEqual(copy.legendVis,original.legendVis,'duplicação faz clone profundo do dicionário');
  delete copy.legendVis['L:11'];
  assert.equal(original.legendVis['L:11'],false,
    'editar a cópia não altera a legenda da prancha original');
}

/* Guardas explícitas de retrocompatibilidade: campo ausente sempre vira um
   dicionário vazio; nunca deve significar ocultar tudo. */
assert.match(functionDeclaration(layoutSource,'legendVisibilityState'),/\{\}/,
  'estado ausente da legenda possui fallback vazio');
assert.match(functionDeclaration(layoutSource,'legendVisibilityOn'),/!==\s*false/,
  'somente false explícito exclui um item');

console.log('OK: seleção hierárquica da legenda validada por prancha/Figura, sem alterar o mapa, com persistência e compatibilidade antiga.');
