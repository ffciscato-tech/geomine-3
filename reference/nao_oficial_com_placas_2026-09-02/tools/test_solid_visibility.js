#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','src','core','parts',
  '18-lidar-layout-extensions.js'),'utf8');

function namedFunction(name){
  const start=source.indexOf(`function ${name}(`);
  assert(start>=0,`função ${name} não encontrada`);
  const brace=source.indexOf('{',start);
  let depth=0, quote='', escaped=false;
  for(let i=brace;i<source.length;i++){
    const ch=source[i];
    if(quote){
      if(escaped)escaped=false;
      else if(ch==='\\')escaped=true;
      else if(ch===quote)quote='';
      continue;
    }
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(`fim de ${name} não encontrado`);
}

function group(){
  return {userData:{},visible:true,parent:null,traverse(fn){fn(this);}};
}
function scene(){
  return {
    children:[],
    add(g){if(!this.children.includes(g))this.children.push(g);g.parent=this;},
    remove(g){this.children=this.children.filter(x=>x!==g);if(g.parent===this)g.parent=null;},
    traverse(fn){fn(this);for(const child of this.children)child.traverse(fn);}
  };
}

const firstScene=scene();
const ctx={
  S:{solidos:[]},
  V3:{scene:firstScene,cubGroup:null,cam:{},ren:{render(){ctx.renders++;}}},
  renders:0,
  console
};
vm.createContext(ctx);
vm.runInContext([
  'solMarcaGrupo','solGrupoEhDoItem','solRestaura','solSetVis'
].map(namedFunction).join('\n'),ctx,{filename:'solid-visibility.js'});

const antigo=group(), vivo=group();
const sol={id:'sol1',visible:true,_grp:antigo};
ctx.S.solidos=[sol];
ctx.V3.cubGroup=vivo;
firstScene.add(vivo);

ctx.solSetVis(sol,false);
assert.equal(vivo.visible,false,'o grupo vivo legado também deve ocultar');
assert.equal(vivo.userData.ccmSolidId,'sol1','o grupo vivo deve receber identidade estável');
assert.equal(sol._grp,vivo,'a árvore deve adotar o grupo que realmente está na cena');

const rebuilt=scene();
ctx.V3.scene=rebuilt;
ctx.solRestaura();
assert.equal(vivo.parent,rebuilt,'o sólido registrado deve sobreviver à reconstrução da cena');
assert.equal(vivo.visible,false,'a reconstrução deve preservar o olho desligado');

ctx.solSetVis(sol,true);
assert.equal(vivo.visible,true,'o grupo vivo identificado deve religar junto');

console.log('OK: o olho do sólido controla a cena viva e preserva o estado após reconstrução.');
