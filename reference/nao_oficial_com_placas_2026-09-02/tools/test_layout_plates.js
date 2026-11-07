#!/usr/bin/env node
/* Regressão leve da duplicação/congelamento de pranchas.
   Não precisa de navegador: executa a própria função plateNew com um estado
   mínimo e também confere os pontos de integração que tornam a atualização
   da composição uma ação exclusivamente explícita. */
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const ext=fs.readFileSync(path.join(root,'src/core/parts/18-lidar-layout-extensions.js'),'utf8');
const printing=fs.readFileSync(path.join(root,'src/core/parts/17-layout-printing.js'),'utf8');
const persistence=fs.readFileSync(path.join(root,'src/core/parts/26-project-persistence.js'),'utf8');
const template=fs.readFileSync(path.join(root,'src/index.template.html'),'utf8');

function between(text,start,end){
  const a=text.indexOf(start),b=text.indexOf(end,a+start.length);
  assert.ok(a>=0,`início não encontrado: ${start}`);
  assert.ok(b>a,`fim não encontrado: ${end}`);
  return text.slice(a,b);
}

const code=[
  between(ext,'function layoutClone(','function layoutStateEqual('),
  between(ext,'function layoutPlateStateClone(','function plateCapture('),
  between(ext,'function plateNew(','/* Duplica a prancha indicada')
].join('\n');

const ctx={
  structuredClone:global.structuredClone,
  JSON,
  S:{plates:[],plateId:null,groups:[]},
  plid:2,
  plateCapture(){},
  document:{getElementById(){return null;}},
  PLATE_FIELDS:[],PLATE_CHECKS:[],
  layoutConventionSnapshot(){return {};},
  allNodes(){return [];},nodeKey(){return '';}
};
vm.createContext(ctx);
vm.runInContext(code,ctx);

const base={
  id:1,name:'Planta geral',
  f:{loTitle:'Mapa 1',loSeloPaper:'a3l'},c:{loLegend:true},center:[100,200],
  vis:{'L:10':true,'R:5':false},
  conv:{'L:10':{color:'#123456',sym:{mode:'classes',classes:[{v:'A'}]},attrFilter:{field:'TIPO',value:'A'}}},
  stack:['R:5','L:10'],groups:[{id:7,collapsed:true}],
  nota:{on:true,titulo:'NOTAS',texto:'Original'}
};
ctx.S.plates=[base];ctx.S.plateId=base.id;
const copy=ctx.plateNew('Planta geral (cópia)',base);

assert.equal(copy.name,'Planta geral (cópia)');
assert.deepEqual(JSON.parse(JSON.stringify(copy.vis)),base.vis);
assert.deepEqual(JSON.parse(JSON.stringify(copy.conv)),base.conv);
assert.deepEqual(Array.from(copy.stack),base.stack);
assert.deepEqual(JSON.parse(JSON.stringify(copy.nota)),base.nota);
assert.notStrictEqual(copy.vis,base.vis);
assert.notStrictEqual(copy.conv,base.conv);
assert.notStrictEqual(copy.conv['L:10'].sym,base.conv['L:10'].sym);
assert.notStrictEqual(copy.stack,base.stack);
assert.notStrictEqual(copy.nota,base.nota);
assert.notStrictEqual(copy.groups,base.groups);

copy.vis['L:10']=false;
copy.conv['L:10'].sym.classes[0].v='B';
copy.nota.texto='Cópia';
assert.equal(base.vis['L:10'],true,'visibilidade vazou da cópia para a original');
assert.equal(base.conv['L:10'].sym.classes[0].v,'A','convenção vazou da cópia para a original');
assert.equal(base.nota.texto,'Original','nota vazou da cópia para a original');

/* A numeração é independente por formato e acompanha inserções/exclusões. */
const folhaInput={value:''},numCtx={S:{plateId:3,plates:[
  {id:1,f:{loSeloPaper:'a4p'}},{id:2,f:{loSeloPaper:'a3l'}},
  {id:3,f:{loSeloPaper:'a4p'}},{id:4,f:{loSeloPaper:'a4p'}}]},
document:{getElementById:id=>id==='loFolha'?folhaInput:null}};
vm.createContext(numCtx);
vm.runInContext(between(ext,'function plateFormato(','function renderPlateTabs('),numCtx);
numCtx.plateRenumerarTodas();
assert.deepEqual(numCtx.S.plates.map(p=>p.f.loFolha),['01/03','01/01','02/03','03/03']);
assert.equal(folhaInput.value,'02/03','a prancha ativa deve mostrar seu índice sobre o total');
numCtx.S.plates.splice(0,1);numCtx.plateRenumerarTodas();
assert.deepEqual(numCtx.S.plates.map(p=>p.f.loFolha),['01/01','01/02','02/02']);
assert.equal(folhaInput.value,'01/02','a exclusão deve renumerar imediatamente o formato ativo');

assert.doesNotMatch(template,/id="btnPlateDupTop"/,
  'o botão grande de duplicação não deve ocupar espaço quando a faixa já possui +');
assert.match(ext,/function plateDuplicar\(pl\)[\s\S]*plateNew\([^;]+,\s*pl\)/);
assert.match(ext,/attrFilter:layoutClone\(L\.attrFilter\|\|null\)/);
assert.match(ext,/papelPrancha[\s\S]{0,180}loPranchaFormato/);
assert.match(ext,/function plateRenumerarFolhas\(fmt\)[\s\S]*padStart\(casas,'0'\)[\s\S]*String\(total\)\.padStart/);
assert.match(ext,/function renderPlateTabs\(\)[\s\S]{0,260}plateRenumerarTodas\(\)/);
assert.match(template,/id="loFolha"[^>]*readonly/);
assert.match(printing,/plateCapture\(S\.loMode==='a4'\?\{captureState:true\}:undefined\)/);
assert.match(persistence,/conv:pl\.conv\?layoutClone\(pl\.conv\):null,stack:/);
assert.match(persistence,/function projectData\(\)[\s\S]{0,500}plateCapture\(\)/);

console.log('OK — cópia independente e atualização explícita da prancha');
