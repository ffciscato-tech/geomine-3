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
const importer=bundle||read('src/core/parts/04-vector-format-importers.js');
const css=bundle||read('src/styles/app.css');

/* Extrai a função real, ignorando chaves dentro de strings e comentários. */
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

class FakeStyle{
  constructor(){this.cssText='';this.display='';}
  setProperty(name,value,priority){
    if(name==='display')this.display=String(value);
    this.cssText+=(this.cssText?';':'')+name+':'+value+(priority?' !'+priority:'');
  }
}

class FakeElement{
  constructor(tag,ownerDocument){
    this.tagName=String(tag||'div').toUpperCase();
    this.ownerDocument=ownerDocument;
    this.parentNode=null;
    this.children=[];
    this.dataset={};
    this.attributes={};
    this.listeners=new Map();
    this.style=new FakeStyle();
    this.className='';
    this.checked=false;
    this._innerHTML='';
    this.classList={
      contains:name=>this.className.split(/\s+/).filter(Boolean).includes(name),
      add:(...names)=>{
        const values=new Set(this.className.split(/\s+/).filter(Boolean));
        names.forEach(name=>values.add(name));this.className=[...values].join(' ');
      },
      remove:(...names)=>{
        const drop=new Set(names);
        this.className=this.className.split(/\s+/).filter(name=>name&&!drop.has(name)).join(' ');
      }
    };
  }
  appendChild(child){
    child.parentNode=this;this.children.push(child);return child;
  }
  remove(){
    if(!this.parentNode)return;
    this.parentNode.children=this.parentNode.children.filter(child=>child!==this);
    this.parentNode=null;
  }
  setAttribute(name,value){this.attributes[name]=String(value);}
  getAttribute(name){return this.attributes[name]??null;}
  addEventListener(type,handler){
    if(!this.listeners.has(type))this.listeners.set(type,[]);
    this.listeners.get(type).push(handler);
  }
  matches(selector){
    if(selector==='[data-modal-arquivo]')return this.dataset.modalArquivo!==undefined;
    if(selector==='[role="dialog"]')return this.attributes.role==='dialog';
    if(selector==='button[data-a]')return this.tagName==='BUTTON'&&this.dataset.a!==undefined;
    if(selector==='[data-faces]')return this.dataset.faces!==undefined;
    if(selector==='[data-todos]')return this.dataset.todos!==undefined;
    return false;
  }
  closest(selector){
    for(let current=this;current;current=current.parentNode)
      if(current.matches(selector))return current;
    return null;
  }
  descendants(){
    const out=[];
    for(const child of this.children)out.push(child,...child.descendants());
    return out;
  }
  querySelectorAll(selector){
    return this.descendants().filter(item=>item.matches(selector));
  }
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  set innerHTML(value){
    this._innerHTML=String(value);this.children=[];
    const dialogOpen=/<div\b([^>]*\brole="dialog"[^>]*)>/i.exec(this._innerHTML);
    const dialog=new FakeElement('div',this.ownerDocument);
    if(dialogOpen){
      const attrs=dialogOpen[1];
      dialog.attributes.role='dialog';
      const cls=/\bclass="([^"]*)"/i.exec(attrs);
      const style=/\bstyle="([^"]*)"/i.exec(attrs);
      if(cls)dialog.className=cls[1];
      if(style)dialog.style.cssText=style[1];
    }
    this.appendChild(dialog);
    const buttonRe=/<button\b([^>]*)>/gi;
    let match;
    while((match=buttonRe.exec(this._innerHTML))){
      const action=/\bdata-a="([^"]+)"/i.exec(match[1]);
      if(!action)continue;
      const button=new FakeElement('button',this.ownerDocument);
      button.dataset.a=action[1];dialog.appendChild(button);
    }
    const inputRe=/<input\b([^>]*)>/gi;
    while((match=inputRe.exec(this._innerHTML))){
      const marker=/\bdata-(faces|todos)(?:\s|>|=)/i.exec(match[1]+' ');
      if(!marker)continue;
      const input=new FakeElement('input',this.ownerDocument);
      input.dataset[marker[1]]='';
      input.checked=/\bchecked\b/i.test(match[1]);
      dialog.appendChild(input);
    }
  }
  get innerHTML(){return this._innerHTML;}
  dispatchEvent(event){
    if(!event.target)event.target=this;
    event.currentTarget=this;
    for(const handler of this.listeners.get(event.type)||[]){
      handler.call(this,event);
      if(event._immediate)return !event.defaultPrevented;
    }
    if(event.bubbles!==false&&!event._stopped&&this.parentNode)
      return this.parentNode.dispatchEvent(event);
    return !event.defaultPrevented;
  }
}

class FakeDocument{
  constructor(){
    this.body=new FakeElement('body',this);
    this.body.classList.add('alagis3');
  }
  createElement(tag){return new FakeElement(tag,this);}
  querySelectorAll(selector){
    const all=[this.body,...this.body.descendants()];
    return all.filter(item=>item.matches(selector));
  }
}

function cssRuleBodies(source,selector){
  const safe=selector.replace(/[\^$.*+?()[\]{}|]/g,'\\$&');
  return [...source.matchAll(new RegExp(safe+'\\s*\\{([^}]*)\\}','g'))].map(match=>match[1]);
}
const dockedBackdropBlocks=cssRuleBodies(css,'body.alagis3 .modal-bg')
  .some(body=>/pointer-events\s*:\s*none\s*!important/i.test(body));
const modalRestoresEvents=cssRuleBodies(css,'body.alagis3 .modal-bg>.modal')
  .some(body=>/pointer-events\s*:\s*auto\s*!important/i.test(body));
assert.equal(dockedBackdropBlocks,true,
  'o teste pressupõe a regra real do modo alagis3 que torna o backdrop não interativo');
assert.equal(modalRestoresEvents,true,
  'o teste pressupõe a regra real que devolve eventos ao componente .modal');

const document=new FakeDocument();
const context=vm.createContext({
  console,document,
  S:{workCRS:'EPSG:31983'},
  CRS_LABELS:{'EPSG:31983':'SIRGAS 2000 / UTM 23S'},
  esc:value=>String(value).replace(/</g,'&lt;'),
  setTimeout,clearTimeout
});
vm.runInContext(functionDeclaration(importer,'askDXFModal'),context,
  {filename:'dxf-import-modal.contract.js'});

function receivesPointer(target,overlay){
  if(!dockedBackdropBlocks)return true;
  let restored=false;
  const path=[];
  for(let current=target;current&&current!==overlay;current=current.parentNode)path.unshift(current);
  for(const item of path){
    const inline=/pointer-events\s*:\s*auto(?:\s*!important)?/i.test(item.style.cssText||'');
    if(inline||(modalRestoresEvents&&item.classList.contains('modal')))restored=true;
  }
  return restored;
}

function userClick(target,pointerType){
  const overlay=target.closest('[data-modal-arquivo]');
  if(!overlay||!receivesPointer(target,overlay))return false;
  const event={
    type:'click',target,bubbles:true,pointerType,
    defaultPrevented:false,_stopped:false,_immediate:false,
    preventDefault(){this.defaultPrevented=true;},
    stopPropagation(){this._stopped=true;},
    stopImmediatePropagation(){this._stopped=true;this._immediate=true;}
  };
  target.dispatchEvent(event);
  return true;
}

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function exercise(mode,pointerType){
  const pending=context.askDXFModal(2,1,0,'taludes',0).then(value=>({
    settled:true,mode:value&&value.modo,
    overlays:document.querySelectorAll('[data-modal-arquivo]').length
  }));
  const overlay=document.querySelectorAll('[data-modal-arquivo]').at(-1);
  assert.ok(overlay,'o diálogo DXF deve ser anexado ao documento');
  const button=overlay.querySelectorAll('button[data-a]').find(item=>item.dataset.a===mode);
  assert.ok(button,'botão DXF '+mode+' ausente');
  const delivered=userClick(button,pointerType);
  const result=await Promise.race([
    pending,
    delay(140).then(()=>({
      settled:false,mode:null,
      overlays:document.querySelectorAll('[data-modal-arquivo]').length
    }))
  ]);
  return {delivered,...result};
}

const mouse=await exercise('linha','mouse');
const touch=await exercise('poligono','touch');
assert.deepEqual(
  {mouse,touch},
  {
    mouse:{delivered:true,settled:true,mode:'linha',overlays:0},
    touch:{delivered:true,settled:true,mode:'poligono',overlays:0}
  },
  'no modo alagis3, clique e toque devem alcançar as opções DXF, resolver a promessa e remover o overlay; '+
  'um diálogo fora de .modal herda pointer-events:none do backdrop e aparenta congelar'
);

console.log('OK: diálogo DXF aceita mouse/toque, resolve a escolha e remove o overlay.');
