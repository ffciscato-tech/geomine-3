#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'src/core/parts/04-vector-format-importers.js'),'utf8');
const loader=fs.readFileSync(path.join(root,'src/core/parts/03-file-loading-qgis.js'),'utf8');
const bloco=src.slice(src.indexOf('function askDXFModal'),src.indexOf('async function importDXF'));

class El{
  constructor(){
    this.dataset={};this.removed=false;this.innerHTML='';
    this.style={cssText:'',setProperty:(k,v)=>{this.style[k]=v;}};
    this.classList={remove:()=>{}};
  }
  querySelector(q){
    if(q==='[data-faces]')return this.innerHTML.includes('data-faces')?{checked:false}:null;
    if(q==='[data-todos]')return this.innerHTML.includes('data-todos')?{checked:true}:null;
    return null;
  }
  addEventListener(tipo,fn){if(tipo==='click')this.clickHandler=fn;}
  setAttribute(k,v){this[k]=v;}
  remove(){this.removed=true;document.ativos=document.ativos.filter(x=>x!==this);}
}
const document={ativos:[],last:null,
  createElement:()=>new El(),
  querySelectorAll:q=>q==='[data-modal-arquivo]'?document.ativos.slice():[],
  body:{appendChild:e=>{document.last=e;document.ativos.push(e);}}};
const ctx={document,S:{workCRS:'EPSG:31983'},CRS_LABELS:{'EPSG:31983':'SIRGAS 2000 / UTM 23S'},
  esc:s=>String(s),setTimeout};
vm.createContext(ctx);vm.runInContext(bloco,ctx);

(async()=>{
  const p=ctx.askDXFModal(60,36,0,'PDE4',2),bg=document.last;
  assert(bg&&!bg.removed,'o modal deve ser apresentado antes da escolha');
  assert(bg.innerHTML.includes('Arquivo: PDE4.dxf'));
  assert(bg.innerHTML.includes('outros 2 DXF(s) selecionados'));
  const b={dataset:{a:'linha'},closest:()=>b};
  bg.clickHandler({target:b,preventDefault(){},stopPropagation(){}});
  assert(bg.removed,'o modal precisa sair do DOM no mesmo clique');
  assert.strictEqual(document.ativos.length,0,'não pode restar modal fantasma');
  const r=await p;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r)),
    {modo:'linha',faces:false,aplicarTodos:true});
  assert(loader.includes("const dxfLote={escolha:null,processados:0,"));
  assert(loader.includes("importDXF(await f.text(), base, dxfLote)"));
  assert(src.includes("const escolha=previa||await askDXFModal("));
  console.log('OK: modal DXF fecha no clique e uma escolha pode atender toda a leva.');
})().catch(e=>{console.error(e);process.exit(1);});
