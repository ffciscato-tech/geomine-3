import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

const core=read('src/core/parts/05-layer-model-symbology.js');
const props=read('src/core/parts/09-measurement-properties-cad.js');
const layout=read('src/core/parts/17-layout-printing.js');
const template=read('src/index.template.html');

/* Extrai blocos sem confundir chaves de strings, templates ou comentários. */
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

function functionDeclaration(source,name,required=true){
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=new RegExp(`\\bfunction\\s+${escaped}\\s*\\(`).exec(source);
  if(!match){
    if(required)assert.fail(`função ${name} ausente`);
    return null;
  }
  const open=source.indexOf('{',match.index+match[0].length);
  assert.ok(open>=0,`função ${name}: corpo ausente`);
  return source.slice(match.index,blockEnd(source,open,`função ${name}`)+1);
}

function between(source,start,end,label){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,`${label}: trecho entre ${start} e ${end} não encontrado`);
  return source.slice(a,b);
}

/* Descobre helpers chamados pelo código. O teste não depende do nome que a
   implementação escolher para encapsular a ação do botão. */
function dependencyDeclarations(seed,sources,external=[]){
  const ignored=new Set([
    ...external,'if','for','while','switch','catch','function','return',
    'Number','String','Boolean','Object','Array','Math','Set','Map'
  ]);
  const found=new Map(),queue=[seed];
  while(queue.length){
    const code=queue.pop();
    const calls=/\b([A-Za-z_$][\w$]*)\s*\(/g;
    let match;
    while((match=calls.exec(code))){
      const name=match[1],before=code[match.index-1];
      if(before==='.'||ignored.has(name)||found.has(name))continue;
      let declaration=null;
      for(const source of sources){
        declaration=functionDeclaration(source,name,false);
        if(declaration)break;
      }
      if(!declaration)continue;
      found.set(name,declaration);
      queue.push(declaration);
    }
  }
  return [...found.values()].join('\n');
}

function callbackForId(source,id,event='click'){
  const safe=id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const target=`document\\.getElementById\\(\\s*["']${safe}["']\\s*\\)`;
  let onclick=new RegExp(`${target}\\s*\\.\\s*onclick\\s*=`).exec(source);
  let listener=new RegExp(`${target}\\s*\\.\\s*addEventListener\\(\\s*["']${event}["']\\s*,`).exec(source);

  /* Também aceita o padrão usado pelo projeto para controles opcionais:
     const botao=getElementById('id'); if(botao)botao.onclick=callback. */
  if(!onclick&&!listener){
    const binding=new RegExp(`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${target}`).exec(source);
    if(binding){
      const alias=binding[1].replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const tail=source.slice(binding.index+binding[0].length);
      const own=new RegExp(`\\b${alias}\\s*\\.\\s*onclick\\s*=`).exec(tail);
      const add=new RegExp(`\\b${alias}\\s*\\.\\s*addEventListener\\(\\s*["']${event}["']\\s*,`).exec(tail);
      if(own&&own.index<1000)onclick={index:binding.index+binding[0].length+own.index,0:own[0]};
      else if(add&&add.index<1000)listener={index:binding.index+binding[0].length+add.index,0:add[0]};
    }
  }
  const match=onclick||listener;
  assert.ok(match,`#${id}: handler de ${event} ausente`);

  let start=match.index+match[0].length;
  while(/\s/.test(source[start]))start++;
  const directName=/^([A-Za-z_$][\w$]*)\s*(?=[;,)])/.exec(source.slice(start));
  if(directName)return directName[1];
  const arrow=source.indexOf('=>',start);
  if(arrow>=start&&arrow-start<300){
    let body=arrow+2;
    while(/\s/.test(source[body]))body++;
    if(source[body]==='{')return source.slice(start,blockEnd(source,body,`handler #${id}`)+1);
    const end=source.indexOf(listener?')':';',body);
    assert.ok(end>body,`#${id}: expressão do handler incompleta`);
    return source.slice(start,end);
  }
  if(source.startsWith('function',start)||source.startsWith('async function',start)){
    const open=source.indexOf('{',start);
    return source.slice(start,blockEnd(source,open,`handler #${id}`)+1);
  }
  const named=/^([A-Za-z_$][\w$]*)/.exec(source.slice(start));
  assert.ok(named,`#${id}: callback não reconhecido`);
  return named[1];
}

function htmlTagById(source,id){
  const tags=(source.match(/<[^>]+>/g)||[]).filter(tag=>{
    const hit=/\bid\s*=\s*(["'])(.*?)\1/i.exec(tag);
    return hit&&hit[2]===id;
  });
  assert.equal(tags.length,1,`a UI deve conter exatamente um #${id}`);
  return tags[0];
}

function fakeRow(index,{own,size='41'}={}){
  const controls=new Map([
    ['.ce-color',{value:'#f5a524'}],['.ce-stroke',{value:'#222222'}],
    ['.ce-weight',{value:'1.5'}],['.ce-shape',{value:'circle'}],
    ['.ce-size',{value:String(size),disabled:!own}],
    ['.ce-size-own',{value:'on',checked:!!own}]
  ]);
  return {
    dataset:{i:String(index)},
    querySelector:selector=>controls.get(selector)||null,
    querySelectorAll:()=>[],
    closest:()=>null
  };
}

function fakeDocument(rows,pointSize){
  const elements=new Map([
    ['lpPtSize',{value:String(pointSize),valueAsNumber:Number(pointSize)}],
    ['lpInfo',{innerHTML:''}],['lpRotField',null],['lpDipField',null],['lpRotFix',null]
  ]);
  return {
    getElementById:id=>elements.get(id)||null,
    querySelectorAll:selector=>selector==='#lpClasses .cls'?rows:[],
    querySelector:()=>null
  };
}

const coreContext=vm.createContext({
  console,
  classOf:(_layer,feature)=>feature._class||null,
  PT_SYMS:{circle:{id:'circle'},diamond:{id:'diamond'}}
});
const coreEntries=[functionDeclaration(core,'ptCfg'),functionDeclaration(core,'ptStyleOf')].join('\n');
const coreDependencies=dependencyDeclarations(coreEntries,[core],['ptCfg','ptStyleOf','classOf']);
vm.runInContext(`${coreDependencies}\n${coreEntries}`,coreContext,
  {filename:'05-layer-model-symbology.point-size.js'});

/* L.sym.pt.size é o valor geral absoluto e ptCfg não o recalcula. */
const cfg={shape:'circle',size:23,rot:0,rotField:'',dipField:''};
const pointLayer={sym:{mode:'cat',pt:cfg,cats:[]}};
assert.equal(coreContext.ptCfg(pointLayer),cfg,'ptCfg deve preservar o objeto geral existente');
assert.equal(coreContext.ptCfg(pointLayer).size,23,'ptCfg deve preservar o tamanho geral explícito');
const legacy={sym:{mode:'single'}};
assert.equal(coreContext.ptCfg(legacy).size,14,'ptCfg deve inicializar o tamanho geral legado em 14 px');

/* Override válido vence; propriedade ausente herda o geral, sem multiplicação. */
const own={shape:'diamond',size:37};
const inherited={shape:'circle'};
assert.equal(coreContext.ptStyleOf(pointLayer,{_class:own,props:{}},{}).size,37,
  'ptStyleOf deve usar o tamanho individual quando definido');
assert.equal(coreContext.ptStyleOf(pointLayer,{_class:inherited,props:{}},{}).size,23,
  'ptStyleOf deve herdar o tamanho geral quando não há override');

/* Contrato visível da janela de simbologia. */
htmlTagById(template,'lpPtSize');
htmlTagById(template,'lpPtSizeAll');
const ownCheckbox=(props.match(/<input\b[^>]*>/gi)||[]).find(tag=>
  /\btype\s*=\s*(["'])checkbox\1/i.test(tag)&&
  /\bclass\s*=\s*(["'])[^"']*\bce-size-own\b[^"']*\1/i.test(tag));
assert.ok(ownCheckbox,'cada editor pontual deve oferecer o checkbox .ce-size-own');

const external=[
  'ptCfg','ptStyleOf','ptParamsFromEditor','drawLayer','refreshUI','renderClassList',
  'renderLpClasses','lpInfoHTML','toast','layoutSeVisivel','syncSymPanel','setTimeout','clearTimeout'
];
const runtime=(document,redraw)=>vm.createContext({
  console,document,window:{GeoMinePointSymbols:null},ptCfg:coreContext.ptCfg,
  ptStyleOf:coreContext.ptStyleOf,ptParamsFromEditor:()=>({}),
  drawLayer:()=>{redraw.count++;},refreshUI:()=>{},renderClassList:()=>{},
  renderLpClasses:()=>{},lpInfoHTML:()=>'',toast:()=>{},layoutSeVisivel:()=>{},
  syncSymPanel:()=>{},setTimeout:fn=>{fn();return 1;},clearTimeout:()=>{}
});

/* Coletar uma linha em herança deve apagar um override antigo, mesmo que o
   input numérico ainda mostre o tamanho efetivo. */
{
  const category={value:'A',shape:'circle',size:51,color:'#f5a524',weight:1.5};
  const layer={gtype:'point',fields:[],features:[],sym:{mode:'cat',pt:{...cfg},cats:[category],classes:[]}};
  const document=fakeDocument([fakeRow(0,{own:false,size:41})],23);
  const redraw={count:0},context=runtime(document,redraw);
  const collect=functionDeclaration(props,'lpCollect');
  const dependencies=dependencyDeclarations(collect,[props,core],external.concat('lpCollect'));
  const harness=vm.runInContext(`(()=>{let lpLayer=null;${dependencies}\n${collect}\n`+
    `return {setLayer:value=>{lpLayer=value;},run:()=>lpCollect(true)};})()`,context,
    {filename:'09-measurement-properties-cad.lpCollect.js'});
  harness.setLayer(layer);
  harness.run();
  assert.equal(Object.hasOwn(category,'size'),false,
    'lpCollect não pode materializar size quando .ce-size-own está desmarcado');
  assert.equal(coreContext.ptStyleOf(layer,{_class:category,props:{}},{}).size,23,
    'categoria desmarcada deve continuar herdando o tamanho geral');
}

/* O clique em "aplicar geral" muda o tamanho absoluto e remove overrides de
   cats e classes. O callback é localizado pelo ID, com helpers descobertos. */
{
  const cats=[{value:'A',size:31},{value:'B',size:47},{value:'C'}];
  const classes=[{min:0,max:10,size:18},{min:10,max:20,size:54}];
  const layer={gtype:'point',fields:[],features:[],sym:{
    mode:'cat',pt:{shape:'circle',size:14,rot:0,rotField:'',dipField:''},cats,classes
  }};
  const document=fakeDocument(cats.map((_,i)=>fakeRow(i,{own:true,size:40+i})),29);
  const redraw={count:0},context=runtime(document,redraw);
  const callback=callbackForId(props,'lpPtSizeAll');
  const seed=/^[A-Za-z_$][\w$]*$/.test(callback)?`${callback}()`:callback;
  const dependencies=dependencyDeclarations(seed,[props,core],external);
  const harness=vm.runInContext(`(()=>{let lpLayer=null;let _lpVivoT=null;${dependencies}\n`+
    `const handler=${callback};return {setLayer:value=>{lpLayer=value;},run:()=>handler({preventDefault(){}})};})()`,
    context,{filename:'09-measurement-properties-cad.lpPtSizeAll.js'});
  harness.setLayer(layer);
  harness.run();

  assert.equal(coreContext.ptCfg(layer).size,29,
    '#lpPtSizeAll deve gravar #lpPtSize como tamanho geral absoluto');
  for(const item of [...cats,...classes]){
    assert.equal(Object.hasOwn(item,'size'),false,
      '#lpPtSizeAll deve remover size de todas as categorias e classes');
    assert.equal(coreContext.ptStyleOf(layer,{_class:item,props:{}},{}).size,29,
      '#lpPtSizeAll deve mudar o tamanho efetivo de todos os itens');
  }
}

/* A prancha não pode reimplementar a precedência de tamanho. */
const layoutPointPainter=between(layout,'function svgDaCamada(','function svgRotulosDaCamada(',
  'renderização vetorial do Layout');
assert.match(layoutPointPainter,/\bptStyleOf\s*\(\s*L\s*,\s*f\s*,\s*st\s*\)/,
  'Layout deve resolver o tamanho pontual por ptStyleOf');

console.log('OK: tamanho geral e overrides individuais de ícones validados no mapa, UI e Layout.');
