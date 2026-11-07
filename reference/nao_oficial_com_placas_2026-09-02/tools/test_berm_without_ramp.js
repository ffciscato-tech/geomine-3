#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),src=fs.readFileSync(path.join(root,
  'src/modules/mining/alagis-cava-parametrica-preservada.js'),'utf8');
const i=src.indexOf('function rb31OffsetBerma('),j=src.indexOf('\nfunction rb31Iterar(',i);
assert(i>=0&&j>i,'função de berma não encontrada');
const state={fase:'pe',banco:2,pe:[[0,0],[20,0],[20,20],[0,20]],pFim:[2,2],pFimB:[8,2],
  pFimDir:[1,0],hist:[{sem:false},{sem:true}],semRampa:true,rampaPausada133:true,
  feats:[],paramBancos:[{banco:2}],zPe:800,fora:false};
const fields={rb31B:{value:'6'},rb31Info:{innerHTML:''}};let drawn=0,toastMsg='';
let current=state;
const ctx={console,state,document:{getElementById:id=>fields[id]||null},
  rb31Estado:()=>current,rb31Berma:()=>({ring:[[6,6],[14,6],[14,14],[6,14]]}),
  rb31ParOffsetBerma:()=>null,rb31Fecha:r=>r.concat([r[0].slice()]),
  rb31Desenha:()=>{drawn++;},toast:m=>{toastMsg=String(m)},cmdLog:()=>{}};
vm.createContext(ctx);vm.runInContext(src.slice(i,j),ctx,{filename:'rb31OffsetBerma.js'});
assert.equal(ctx.rb31OffsetBerma(false),true,'a berma bruta não pode depender da boca de rampa');
assert.equal(state.fase,'crista');assert.equal(state.feats.length,1);
assert.equal(state.feats[0].props.BERMA,6);assert.equal(drawn,1);
assert.equal(state.pFim,null);assert.equal(state.pFimB,null);
assert(!toastMsg.includes('nenhuma linha foi criada'));

/* Se existe uma rampa, mas a curva não admite a translação exata da boca,
   a berma também não pode ser perdida: mantém-se o offset completo e pausa-se
   somente a continuação da rampa para um novo ponto manual. */
current={fase:'pe',banco:3,pe:[[0,0],[20,0],[20,20],[0,20]],pFim:[2,2],pFimB:[8,2],
  pFimDir:[1,0],hist:[{sem:false}],semRampa:false,rampaPausada133:false,
  _edicaoBruta134:false,feats:[{geom:[[2,2],[8,2]],props:{CLASSE:'rb31-rampa',BANCO:3}}],
  paramBancos:[{banco:3}],zPe:788,fora:false};
toastMsg='';drawn=0;
assert.equal(ctx.rb31OffsetBerma(false),true,'uma boca degenerada não deve bloquear a berma');
assert.equal(current.fase,'crista');assert.equal(current.feats.length,2);
assert.equal(current.rampaPausada133,true);assert.equal(current._edicaoBruta134,true);
assert.equal(current.pFim,null);assert.equal(current.pFimB,null);assert.equal(drawn,1);
assert(!toastMsg.includes('nenhuma linha foi criada'));
console.log('OK: bancada sem rampa gera a berma completa e independente.');
