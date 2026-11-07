#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

/* Regressão do fluxo real: o projeto foi salvo com uma camada derivada,
   reaberto e continuado em outra camada/receita que usa o MESMO limite.
   Ao mover o limite, o replay precisa usar a receita nova (com todos os
   bancos posteriores), não o objeto órfão que ficou em S._rb31. */
const source={id:278,name:'DCE',_cavaLimiteDin:true,features:[{geom:[[0,0],[1,0],[0,1]]}]},
  antiga={id:289,name:'Rampa por bancada antiga',features:[],
    _rb31Recipe:{srcLayerId:278,banco:1,hist:[{}]}},
  atual={id:290,name:'Rampa por bancada',features:[],
    _rb31Recipe:{srcLayerId:278,banco:3,hist:[{},{},{}]}},
  estadoAntigo={srcLayerId:278,banco:1,hist:[{}],lays:{uni:antiga}},
  estadoAtual={srcLayerId:278,banco:3,hist:[{},{},{}],lays:{uni:atual}},
  calls={base:0,camada:null,bancos:0};
const ctx={console,window:null,S:{layers:[source,atual],_rb31:estadoAntigo},
  document:{getElementById:()=>null},clearVertices(){},refreshUI(){},drawLayer(){},
  toast(){},cmdLog(){},showVertices(){return true;},apagarSelecao(){return true;},
  rb31EstadoDaReceita(L){assert.equal(L,atual);return estadoAtual;},
  rb31Estado(){return ctx.S._rb31;},rb31PosEdicao(){return true;},
  rb31Desenha(){return true;},rb31Gerar(){return true;},rb31Replay(){return true;},
  rb31LiveSync(){calls.base++;calls.camada=ctx.S._rb31&&ctx.S._rb31.lays.uni;
    calls.bancos=ctx.S._rb31&&ctx.S._rb31.banco;return true;}};
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,
  '../src/modules/mining/alagis-134-protecao-geometria-parametrica.js'),'utf8'),ctx);

ctx.rb31LiveSync({sourceLayer:source,sourceFeature:source.features[0],force:true});
assert.equal(calls.base,1,'o sincronizador-base deve ser executado uma vez');
assert.equal(ctx.S._rb31,estadoAtual,'o estado global deve ser religado à receita atual');
assert.equal(calls.camada,atual,'o replay deve enxergar a camada criada depois da reabertura');
assert.equal(calls.bancos,3,'todas as bancadas posteriores devem participar da atualização');
console.log('OK: linhas criadas depois da reabertura acompanham o limite paramétrico.');
