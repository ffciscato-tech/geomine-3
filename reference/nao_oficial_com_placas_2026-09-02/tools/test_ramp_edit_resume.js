#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');

const initial=[[0,0],[200,0],[200,120],[0,120],[0,0]],
  foot=[[10,10],[190,10],[190,110],[10,110],[10,10]],
  edited=[[12,10],[190,10],[190,110],[10,110],[12,10]],
  outer=[[20,0],[120,10]],inner=[[30,0],[120,20]],
  layer={id:'ramp-layer',features:[],_rb31Recipe:{banco:1,fase:'pe',srcLayerId:'limit',
    par:{W:10},ultimaLinhaEditada105:null}},
  state={banco:1,fase:'pe',srcLayerId:'limit',srcFeatIdx:0,z:100,zPe:90,
    pe:foot.map(p=>p.slice()),peNatural:foot.map(p=>p.slice()),
    startP:[20,0],hist:[{startP:[20,0],degrau:false}],paramBancos:[{banco:1,zCrista:100}],
    eixos:[[]],lays:{uni:layer},feats:[]};

state.feats=[
  {geom:initial.map(p=>p.slice()),props:{BANCO:0,CLASSE:'rb31-crista',BERMA:null,COTA:100,TIPO:'Limite'}},
  {geom:outer.map(p=>p.slice()),props:{BANCO:1,CLASSE:'rb31-rampa',TIPO:'Rampa — borda externa'}},
  {geom:inner.map(p=>p.slice()),props:{BANCO:1,CLASSE:'rb31-rampa',TIPO:'Rampa — borda interna'}},
  {geom:edited.map(p=>p.slice()),props:{BANCO:1,CLASSE:'rb31-pe',BERMA:null,COTA:90,TIPO:'Pé banco 1'}}
];
layer.features=state.feats;

let controlSeen=null,gerados=[];
const info={innerHTML:'',textContent:''},ctx={console,setTimeout,clearTimeout,
  S:{_rb31:state,layers:[layer],activeId:layer.id,selFeat:null,_vtxDragging:false},
  document:{getElementById:id=>id==='rb31Info'?info:{value:id==='rb31W'?'10':'0'}},
  toast:()=>{},rb31EmpilhaEdicao:()=>{},rb31PosEdicao:()=>{},
  rb31Gerar:()=>{
    const st=ctx.S._rb31,k=st.banco+1,controle=st._peControle105&&st._peControle105.map(p=>p.slice());
    if(controle)controlSeen=controle;
    gerados.push(k);st.banco=k;st.fase='pe';
    st.pe=(controle||foot.slice(0,-1)).map(p=>p.slice());
    st.peNatural=st.pe.map(p=>p.slice());st.zPe=(+st.z||100)-10;
    st.pFim=[120,10*k];st.pFimB=[120,10*k+10];
    st.hist=st.hist||[];st.hist.push({startP:[20,0],degrau:k>1});
    st.paramBancos=st.paramBancos||[];st.paramBancos.push({banco:k,zCrista:+st.z||100});
    st.feats.push({geom:outer.map(p=>p.slice()),props:{BANCO:k,CLASSE:'rb31-rampa',TIPO:'Rampa '+k+' — borda externa'}});
    st.feats.push({geom:inner.map(p=>p.slice()),props:{BANCO:k,CLASSE:'rb31-rampa',TIPO:'Rampa '+k+' — borda interna'}});
    st.feats.push({geom:st.pe.map(p=>p.slice()),props:{BANCO:k,CLASSE:'rb31-pe',BERMA:null,COTA:st.zPe,TIPO:'Pé banco '+k}});
    layer.features=st.feats;
    return true;
  },
  rb31OffsetBerma:()=>{const st=ctx.S._rb31;st.fase='crista';st.z=st.zPe;
    st.crista=foot.slice(0,-1).map(p=>p.slice());
    st.feats.push({geom:st.crista.map(p=>p.slice()),props:{BANCO:st.banco,CLASSE:'rb31-crista',
      BERMA:6,COTA:st.z,TIPO:'Berma banco '+st.banco}});layer.features=st.feats;return true;},
  rb31Snap:st=>JSON.stringify({...st,lays:undefined}),
  rb31AplicaSnap:()=>{},rb31Desenha:()=>{},rb31Replay:()=>{},
  rb31EstadoDaReceita:()=>{ctx.S._rb31=state;return state;}
};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,
  'src/modules/mining/alagis-105-ultima-edicao-com-rampa.js'),'utf8'),ctx);

(async()=>{
  ctx.rb31PosEdicao(layer,state.feats.at(-1));
  await new Promise(resolve=>setTimeout(resolve,320));
  assert.equal(JSON.stringify(controlSeen),JSON.stringify(edited.slice(0,-1)),
    'o pé editado deve ser passado como controle geométrico da regeneração');
  assert.match(info.innerHTML,/cava paramétrica atualizada/i,
    'a interface deve confirmar o ajuste automático da rampa');

  ctx.S._rb31=null;
  assert.equal(ctx.rb31RetomaAoAbrir(),true,'a receita deve ser retomada ao abrir o painel');
  assert.equal(ctx.S._rb31,state,'a retomada deve religar o estado salvo');

  /* Uma alteração no pé do banco 1 deve recalcular também o banco 2. */
  const pe1={geom:edited.map(p=>p.slice()),props:{BANCO:1,CLASSE:'rb31-pe',BERMA:null,COTA:90,TIPO:'Pé banco 1'}},
    berma1={geom:foot.map(p=>p.slice()),props:{BANCO:1,CLASSE:'rb31-crista',BERMA:6,COTA:90,TIPO:'Berma banco 1'}},
    pe2={geom:foot.map(p=>p.slice()),props:{BANCO:2,CLASSE:'rb31-pe',BERMA:null,COTA:80,TIPO:'Pé banco 2'}};
  state.banco=2;state.fase='pe';state.z=90;state.zPe=80;
  state.hist=[{startP:[20,0],degrau:false},{startP:[120,10],degrau:true}];
  state.paramBancos=[{banco:1,zCrista:100,B:6},{banco:2,zCrista:90,B:6}];
  state.eixos=[[],[]];state.feats=[state.feats[0],
    {geom:outer.map(p=>p.slice()),props:{BANCO:1,CLASSE:'rb31-rampa',TIPO:'Rampa 1 — borda externa'}},
    {geom:inner.map(p=>p.slice()),props:{BANCO:1,CLASSE:'rb31-rampa',TIPO:'Rampa 1 — borda interna'}},
    pe1,berma1,
    {geom:outer.map(p=>p.slice()),props:{BANCO:2,CLASSE:'rb31-rampa',TIPO:'Rampa 2 — borda externa'}},
    {geom:inner.map(p=>p.slice()),props:{BANCO:2,CLASSE:'rb31-rampa',TIPO:'Rampa 2 — borda interna'}},pe2];
  layer.features=state.feats;ctx.S._rb31=state;gerados=[];
  ctx.rb31PosEdicao(layer,pe1);
  await new Promise(resolve=>setTimeout(resolve,360));
  assert.equal(JSON.stringify(gerados),JSON.stringify([1,2]),
    'a edição de um banco anterior deve recalcular todas as bancadas posteriores');
  assert.equal(state.banco,2,'a cascata deve conservar o número final de bancadas');
  console.log('OK: edição paramétrica recalculou cristas, pés e rampas em cascata e retomou o projeto.');
})().catch(error=>{console.error(error);process.exitCode=1;});
