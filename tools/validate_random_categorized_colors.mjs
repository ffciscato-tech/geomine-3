import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

const model=read('src/core/parts/05-layer-model-symbology.js');
const tree=read('src/core/parts/15-layer-tree-crs-ui.js');
const properties=read('src/core/parts/09-measurement-properties-cad.js');
const template=read('src/index.template.html');

function between(source,start,end,label){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,`${label}: trecho entre ${start} e ${end} não encontrado`);
  return source.slice(a,b);
}

/* Math.random controlado torna a regressão determinística: cada geração
   recebe um início de matiz diferente e, portanto, outra paleta. */
const seeds=[0.07,0.63];
let randomCalls=0;
const deterministicMath=Object.create(Math);
deterministicMath.random=()=>{
  assert.ok(randomCalls<seeds.length,'classificação pediu aleatoriedade além das duas gerações esperadas');
  return seeds[randomCalls++];
};

let draws=0,refreshes=0,classListRenders=0;
const context=vm.createContext({
  console,Math:deterministicMath,
  window:{GeoMinePointSymbols:null},
  drawLayer:()=>{draws++;},
  refreshUI:()=>{refreshes++;},
  renderClassList:()=>{classListRenders++;},
  toast:()=>{}
});

const colorsCode=between(model,'const RAMPS={','/* ---------- Estilo por feição',
  'geração de rampas de cores');
const classifyCode=between(tree,'function classifyCore(','function classifyLayer()',
  'núcleo de classificação');
vm.runInContext(`${colorsCode}\n${classifyCode}`,context,
  {filename:'categorized-random-colors.contract.js'});

const layer={
  id:17,name:'Monitoramento',gtype:'point',
  fields:[{name:'TIPO',type:'C'}],
  features:[
    {props:{TIPO:'Água'}},{props:{TIPO:'Ruído'}},{props:{TIPO:'Sísmica'}},
    {props:{TIPO:'Água'}},{props:{TIPO:'Ruído'}}
  ],
  sym:{
    mode:'cat',field:'',ramp:'aleatorio',cats:[],classes:[],
    color:'#f5a524',stroke:'#222222',weight:1.5,fill:.65,
    pt:{shape:'circle',size:14,rot:0,rotField:'',dipField:''}
  }
};

assert.equal(context.classifyCore(layer,'cat','TIPO',5,'quantile','aleatorio'),true,
  'a primeira classificação categorizada deve ser gerada');
const firstColors=layer.sym.cats.map(c=>c.color);
assert.equal(firstColors.length,3,'a primeira geração deve criar três categorias');
assert.equal(new Set(firstColors).size,3,'a paleta aleatória deve distinguir as categorias');
assert.ok(firstColors.every(c=>/^#[0-9a-f]{6}$/i.test(c)),'toda cor gerada deve ser hexadecimal');

/* Personalizações alheias à cor precisam sobreviver à regeração. O reparo não
   pode resolver a troca de paleta apagando símbolo, tamanho ou parâmetros. */
const customized=layer.sym.cats.find(c=>c.value==='Ruído');
customized.shape='diamond';
customized.size=31;
customized.symbolParams={speed:40};
customized.stroke='#123456';

assert.equal(context.classifyCore(layer,'cat','TIPO',5,'quantile','aleatorio'),true,
  'regerar a classificação categorizada deve continuar aplicável');
const secondColors=layer.sym.cats.map(c=>c.color);

assert.equal(randomCalls,2,'gerar e regerar devem solicitar duas paletas aleatórias independentes');
assert.notDeepEqual(secondColors,firstColors,
  'regerar com a rampa Aleatória deve substituir a paleta anterior');
assert.ok(secondColors.every((color,index)=>color!==firstColors[index]),
  'cada categoria deve receber uma nova cor ao regerar a rampa Aleatória');

const preserved=layer.sym.cats.find(c=>c.value==='Ruído');
assert.equal(preserved.shape,'diamond','regerar cores não pode apagar o símbolo individual');
assert.equal(preserved.size,31,'regerar cores não pode apagar o tamanho individual');
assert.deepEqual({...preserved.symbolParams},{speed:40},
  'regerar cores não pode apagar parâmetros do símbolo');
assert.equal(preserved.stroke,'#123456','regerar cores não pode apagar o contorno individual');
assert.equal(draws,2,'cada geração deve redesenhar a camada');
assert.equal(refreshes,2,'cada geração deve atualizar a interface');
assert.equal(classListRenders,2,'cada geração deve atualizar a lista de classes');

/* Guardas do caminho real acionado pela janela de propriedades. */
assert.match(template,/<option\s+value="aleatorio">Aleatório \(cores distintas\)<\/option>/,
  'a rampa Aleatória deve continuar disponível na UI');
const propertiesButton=between(properties,"document.getElementById('btnLpClassify').onclick=", 
  "document.getElementById('btnLpPointSymbols').onclick=",'botão Gerar / regerar classes');
assert.match(propertiesButton,/classifyCore\s*\(\s*lpLayer\s*,\s*lpLayer\.sym\.mode/,
  'o botão Gerar / regerar deve usar classifyCore');
assert.match(propertiesButton,/document\.getElementById\('lpRamp'\)\.value/,
  'o botão Gerar / regerar deve enviar a rampa escolhida');

console.log('OK: gerar e regerar classificação categorizada aleatória troca todas as cores e preserva as demais personalizações.');
