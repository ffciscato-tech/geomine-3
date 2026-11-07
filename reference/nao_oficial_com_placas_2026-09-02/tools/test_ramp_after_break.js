#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..'),props={CLASSE:'rb31-crista',BANCO:1,
  BERMA:6,TIPO:'Crista após berma 1'},antiga=[[0,0],[20,0],[20,20],[0,20],[0,0]],
  f={geom:antiga.map(p=>p.slice()),_geomProjeto:antiga.map(p=>p.slice()),props:{...props}},
  layer={id:9,name:'Rampa por bancada',features:[f],_rb31Recipe:{banco:1,
    fase:'crista',linhasManuais134:{},ultimaLinhaEditada105:{banco:1,
      classe:'rb31-crista',berma:true,tipo:props.TIPO,geom:antiga.slice(0,-1)}}},
  state={banco:1,fase:'crista',crista:antiga.slice(0,-1),feats:layer.features,
    lays:{uni:layer},_linhasManuais134:{},_ultimaLinhaEditada105:{banco:1,
      classe:'rb31-crista',berma:true,tipo:props.TIPO,geom:antiga.slice(0,-1)}};

let vista=null;
const ctx={console,setTimeout,clearTimeout,window:null,S:{_rb31:state,layers:[layer],undo:[]},
  ED:{sel:{L:layer,f,idx:0}},document:{getElementById:id=>({value:id==='rb31W'?'10':'0'})},
  toast(){},cmdLog(){},clearVertices(){},refreshUI(){},drawLayer(){},showVertices(){return true;},
  rb31Estado:()=>state,rb31EstadoDaReceita:()=>state,rb31PosEdicao(){return true;},
  rb31EmpilhaEdicao(){},rb31SincronizaCrista(){},rb31OffsetBerma(){return true;},
  rb31Replay(){return true;},rb31LiveSync(){return true;},doUndo(){return false;},
  rb31Gerar(){vista=state.crista.map(p=>p.slice());return true;},
  edQuebrarEm(){
    f.geom=[[0,0],[20,0],[20,20]];
    layer.features.push({geom:[[20,20],[0,20],[0,0]],
      _geomProjeto:antiga.map(p=>p.slice()),props:{...props}});
    return true;
  },
  apagarSelecao(q){const ix=q.idx;layer.features.splice(ix,1);return true;},
  edApagarFeicao(){const ix=layer.features.indexOf(ctx.ED.sel.f);
    if(ix>=0)layer.features.splice(ix,1);return true;},
  edFechar(){const g=ctx.ED.sel.f.geom;if(g.length&&
    Math.hypot(g[0][0]-g.at(-1)[0],g[0][1]-g.at(-1)[1])>1e-7)g.push(g[0].slice());
    return true;}};
ctx.window=ctx;vm.createContext(ctx);
for(const rel of ['src/modules/mining/alagis-105-ultima-edicao-com-rampa.js',
  'src/modules/mining/alagis-134-protecao-geometria-parametrica.js'])
  vm.runInContext(fs.readFileSync(path.join(root,rel),'utf8'),ctx);

ctx.edQuebrarEm();
assert.equal(state._ultimaLinhaEditada105,null,
  'quebrar deve invalidar a memória completa anterior da linha');
assert.equal(ctx.rb31Gerar(true),true,'a geração deve continuar com as duas partes do corte');
assert.equal(JSON.stringify(vista),JSON.stringify(antiga.slice(0,-1)),
  'as partes vivas devem ser reunidas no mesmo anel, sem diagonal ou volta longa');

const removida=layer.features[1];
ctx.apagarSelecao({layer,layerId:9,idx:1});
ctx.ED.sel={L:layer,f,idx:0};ctx.edFechar();vista=null;
assert(!layer.features.includes(removida),'o trecho apagado deve continuar ausente');
assert.equal(ctx.rb31Gerar(true),true,'a rampa deve continuar depois de apagar e fechar o corte');
assert.equal(JSON.stringify(vista),JSON.stringify([[0,0],[20,0],[20,20]]),
  'o trecho fechado deve comandar a próxima rampa sem recuperar a geometria antiga');
console.log('OK: a rampa continua após cortar/quebrar usando somente a geometria viva.');
