import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src/core/parts/03-file-loading-qgis.js'),'utf8');
const functionAt=source.indexOf('function posicionaJanelasComando()');
const start=source.lastIndexOf('(function(){',functionAt);
const end=source.indexOf('\n})();',functionAt);
assert.ok(functionAt>=0&&start>=0&&end>functionAt,'IIFE de posicionamento deve existir');
const positioning=source.slice(start,end+'\n})();'.length);

function eventTarget(){
  const listeners=new Map();
  return {listeners,addEventListener(type,callback,options){
    if(!listeners.has(type))listeners.set(type,[]);
    listeners.get(type).push({callback,options});
  },emit(type){for(const item of listeners.get(type)||[])item.callback();}};
}
function harness({height=900,viewport={offsetTop:0,height},alagis=true,status=true,resizeObserver=true}={}){
  const vars=new Map(),writes=[],document=eventTarget(),window=eventTarget();
  const elements={
    right:{rect:{right:304,width:300,height:600}},
    body:{rect:{top:150,height:height-150}},
    ribbon:{rect:{top:50,height:100}},
    ribCats:{rect:{top:10,height:40}},
    status:{rect:{top:height-52,height:48}}
  };
  for(const element of Object.values(elements))element.getBoundingClientRect=()=>({...element.rect});
  document.body={classList:{contains:name=>name==='alagis3'&&alagis},style:{setProperty(key,value){
    vars.set(key,value);writes.push([key,value]);
  }}};
  document.getElementById=id=>elements[id]||null;
  document.querySelector=selector=>selector==='.readout'&&status?elements.status:null;
  const observers=[];
  function observerClass(kind){return class{
    constructor(callback){this.kind=kind;this.callback=callback;this.targets=[];observers.push(this);}
    observe(element,options){this.targets.push({element,options});}
    emit(){this.callback();}
  };}
  const MutationObserver=observerClass('mutation'),ResizeObserver=observerClass('resize');
  window.ResizeObserver=resizeObserver?ResizeObserver:undefined;
  if(viewport)window.visualViewport=Object.assign(eventTarget(),viewport);
  const context={window,document,innerHeight:height,innerWidth:1280,MutationObserver,ResizeObserver};
  vm.createContext(context);vm.runInContext(positioning,context);
  function values(){return Object.fromEntries(['left','top','bottom','height'].map(key=>{
    const value=vars.get('--alagis-command-'+key);
    assert.match(value||'',/^\d+(?:\.\d+)?px$/,key+' precisa estar em pixels finitos');
    return [key,parseFloat(value)];
  }));}
  return {context,window,document,elements,vars,writes,observers,values,
    boot(){document.emit('DOMContentLoaded');return values();}};
}
function visibleBounds(h){
  const viewport=h.window.visualViewport,top=viewport?.offsetTop||0;
  return {top,bottom:Math.min(h.context.innerHeight,top+(viewport?.height??h.context.innerHeight))};
}
function insideVisible(h){
  const values=h.values(),visible=visibleBounds(h);
  assert.ok(values.top>=visible.top+6,'topo permanece dentro da área visível');
  assert.ok(values.height>=0,'altura nunca negativa');
  assert.ok(values.top+values.height<=visible.bottom-8+1e-8,'rodapé não ultrapassa área visível');
  assert.ok(values.bottom>=8,'margem inferior mínima');
  assert.ok(Math.abs(values.top+values.height+values.bottom-h.context.innerHeight)<1e-8,
    'topo, altura e bottom usam o mesmo sistema de coordenadas');
  return values;
}
let checks=0;
function check(name,test){test();checks++;console.log('OK · '+name);}

check('desktop conserva dock abaixo da ribbon e acima da barra de estado',()=>{
  const h=harness();assert.equal(h.writes.length,0,'aguarda DOM pronto');
  assert.deepEqual(h.boot(),{left:310,top:155,bottom:56,height:689});insideVisible(h);
  assert.equal(h.values().top+h.values().height,h.elements.status.rect.top-4);
});
check('barras móveis reduzem altura sem alterar innerHeight nem disparar window.resize',()=>{
  const h=harness({height:800});h.boot();
  h.window.visualViewport.height=640;h.window.visualViewport.emit('resize');
  assert.deepEqual(insideVisible(h),{left:310,top:155,bottom:168,height:477});
  assert.equal(h.context.innerHeight,800);
  h.window.visualViewport.height=800;h.window.visualViewport.emit('resize');
  assert.deepEqual(insideVisible(h),{left:310,top:155,bottom:56,height:589});
});
check('teclado preserva espaço útil movendo o painel acima da ribbon quando necessário',()=>{
  const h=harness({height:800});h.boot();
  h.window.visualViewport.height=300;h.window.visualViewport.emit('resize');
  assert.deepEqual(insideVisible(h),{left:310,top:52,bottom:508,height:240});
  h.window.visualViewport.height=170;h.window.visualViewport.emit('resize');
  assert.deepEqual(insideVisible(h),{left:310,top:6,bottom:638,height:156});
});
check('scroll do visualViewport considera offsetTop sem somá-lo duas vezes',()=>{
  const h=harness({height:800,viewport:{offsetTop:230,height:300}});h.boot();
  assert.deepEqual(insideVisible(h),{left:310,top:236,bottom:278,height:286});
  h.window.visualViewport.offsetTop=180;h.window.visualViewport.emit('scroll');
  assert.deepEqual(insideVisible(h),{left:310,top:186,bottom:328,height:286});
  h.elements.status.rect.height=0;
  h.window.visualViewport.offsetTop=650;h.window.visualViewport.emit('scroll');
  assert.deepEqual(insideVisible(h),{left:310,top:656,bottom:8,height:136},
    'a região visível também é limitada pelo viewport de layout');
});
check('orientação da tela recalcula geometria no resize da janela',()=>{
  const h=harness({height:800});h.boot();
  h.context.innerHeight=1024;h.context.innerWidth=768;
  h.window.visualViewport.height=1024;
  h.elements.body.rect={top:175,height:849};h.elements.status.rect={top:972,height:48};
  h.elements.right.rect={right:289,width:285,height:790};
  h.window.emit('resize');
  assert.deepEqual(insideVisible(h),{left:295,top:180,bottom:56,height:788});
});
check('navegador sem visualViewport conserva fallback e resize funcional',()=>{
  const h=harness({viewport:null});assert.deepEqual(h.boot(),{left:310,top:155,bottom:56,height:689});
  h.context.innerHeight=650;h.elements.status.rect={top:598,height:48};h.window.emit('resize');
  assert.deepEqual(insideVisible(h),{left:310,top:155,bottom:56,height:439});
});
check('status oculto/ausente ou fora da área visível não reserva espaço fantasma',()=>{
  const h=harness();h.elements.status.rect={top:0,height:0};h.boot();
  assert.deepEqual(insideVisible(h),{left:310,top:155,bottom:8,height:737});
  const missing=harness({status:false});missing.boot();
  assert.deepEqual(insideVisible(missing),{left:310,top:155,bottom:8,height:737});
  const above=harness({viewport:{offsetTop:230,height:500}});
  above.elements.status.rect={top:100,height:48};above.boot();
  assert.deepEqual(insideVisible(above),{left:310,top:236,bottom:178,height:486});
});
check('listeners passivos acompanham resize/scroll e observadores incluem status',()=>{
  const h=harness();h.boot();
  for(const [target,type] of [[h.window,'resize'],[h.window.visualViewport,'resize'],[h.window.visualViewport,'scroll']]){
    assert.equal(target.listeners.get(type)?.length,1);
    assert.equal(target.listeners.get(type)[0].options.passive,true);
  }
  for(const kind of ['resize','mutation']){
    const observer=h.observers.find(item=>item.kind===kind);assert.ok(observer);
    assert.deepEqual(observer.targets.map(item=>item.element),
      [h.elements.right,h.elements.ribbon,h.elements.ribCats,h.elements.status]);
    h.elements.status.rect.top-=10;observer.emit();
    assert.equal(h.values().top+h.values().height,h.elements.status.rect.top-4);
  }
  const mutations=h.observers.find(item=>item.kind==='mutation');
  for(const target of mutations.targets){
    assert.equal(target.options.attributes,true);
    assert.equal(JSON.stringify(target.options.attributeFilter),JSON.stringify(['style','class']));
  }
});
check('ausência de ResizeObserver e shell não alagis não causam erro',()=>{
  const h=harness({resizeObserver:false});h.boot();insideVisible(h);
  assert.equal(h.observers.filter(item=>item.kind==='resize').length,0);
  const other=harness({alagis:false});other.document.emit('DOMContentLoaded');
  other.window.emit('resize');other.window.visualViewport.emit('resize');
  assert.equal(other.writes.length,0,'outros shells não recebem coordenadas do dock');
});
check('CSS usa altura medida e ações de propriedades ficam fora da região rolável',()=>{
  const css=fs.readFileSync(path.join(root,'src/styles/app.css'),'utf8');
  assert.equal((css.match(/max-height:var\(--alagis-command-height\)!important/g)||[]).length,3,
    'ribbon, modais e paletas compartilham o teto medido');
  assert.match(css,/#lpModal \.modal-b\{[^}]*min-height:0/);
  assert.match(css,/#lpModal \.lp-actions\{[^}]*flex:0 0 auto/);
  const template=fs.readFileSync(path.join(root,'src/index.template.html'),'utf8');
  const html=template.slice(template.indexOf('<div id="lpModal"'),template.indexOf('<!-- defs de hachura'));
  const stack=[],parents=new Map(),voidTags=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  for(const match of html.matchAll(/<\/?([a-z][\w-]*)\b[^>]*>/gi)){
    const tag=match[1].toLowerCase(),raw=match[0];
    if(raw.startsWith('</')){assert.equal(stack.pop()?.tag,tag,'template precisa manter estrutura HTML equilibrada');continue;}
    const node={tag,id:/\bid="([^"]+)"/.exec(raw)?.[1],classes:(/\bclass="([^"]+)"/.exec(raw)?.[1]||'').split(/\s+/)};
    if(node.id)parents.set(node.id,stack.slice());
    if(!voidTags.has(tag)&&!raw.endsWith('/>'))stack.push(node);
  }
  assert.equal(stack.length,0);
  for(const id of ['lpApply','lpAttr','lpZoom','lpSave','lpDel']){
    const ancestors=parents.get(id);assert.ok(ancestors,id+' existe');
    assert.ok(ancestors.at(-1).classes.includes('lp-actions'),id+' é ação fixa');
    assert.ok(ancestors.at(-2).classes.includes('modal'),id+' é filho direto da janela');
    assert.ok(!ancestors.some(node=>node.classes.includes('modal-b')),id+' não rola com campos');
  }
});
console.log('Viewport dos painéis: '+checks+' cenários aprovados.');
