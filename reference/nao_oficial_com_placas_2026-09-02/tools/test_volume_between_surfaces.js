#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,
  'src/core/parts/23-block-model-and-volumes.js'),'utf8');
const from=source.indexOf('function cubFaixaEntre(');
const to=source.indexOf('\n/* domínio XY+Z coberto pelas regras */',from);
assert(from>=0&&to>from,'funções de cubagem entre superfícies não encontradas');

const ctx={
  sampleZbil(d){return d.z;},
  cubPointInRings(){return true;},
  isFinite,
  console
};
vm.createContext(ctx);
vm.runInContext(source.slice(from,to),ctx,{filename:'volume-between-surfaces.js'});

const regra=(a,b)=>[{t:'entre',A:{d:{z:a}},B:{d:{z:b}}}];

assert.equal(ctx.cubIn(0,0,95,regra(100,90)),true,
  'a ordem Topo/Base deve aceitar um ponto no intervalo');
assert.equal(ctx.cubIn(0,0,95,regra(90,100)),true,
  'inverter as duas superfícies não pode zerar a cubagem');
assert.equal(ctx.cubIn(0,0,105,regra(90,100)),false,
  'um ponto acima das duas superfícies deve ficar fora');
assert.equal(ctx.cubIn(0,0,90,regra(90,90)),false,
  'a linha de interseção, com espessura zero, não forma volume');

const faixa=ctx.cubFaixaEntre(844,844.78);
assert.deepEqual(JSON.parse(JSON.stringify(faixa)),
  {piso:844,teto:844.78,invertida:true});

console.log('OK: cubagem usa o intervalo vertical entre superfícies, independentemente da ordem.');
