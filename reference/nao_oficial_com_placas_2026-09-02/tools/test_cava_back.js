#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.resolve(__dirname,'../src/modules/mining/alagis-132-voltar-cava.js'),'utf8');

function contextFor(initial){
  const button={},toasts=[],info={},calls={replay:0,draw:0},
    layer={id:'cava',_rb31Recipe:{srcLayerId:'limite',banco:initial.banco,
      fase:initial.fase,hist:initial.hist||[],acoesVoltar132:initial.acoes||[]}},
    st={...initial,srcLayerId:'limite',hist:(initial.hist||[]).slice(),
      undoPilha:(initial.undoPilha||[]).slice(),lays:{uni:layer},feats:[],eixos:[],paramBancos:[]};
  const ctx={console,S:{_rb31:st,layers:[layer],selFeat:null},
    document:{getElementById:id=>id==='btnRb31Voltar'?button:(id==='rb31Info'?info:null)},
    activeLayer:()=>layer,toast:m=>toasts.push(String(m)),refreshUI:()=>{},
    rb31AcaoComVolta:fn=>fn(),rb31Voltar:()=>false,
    rb31EstadoDaReceita:()=>ctx.S._rb31,
    rb31Replay:()=>{
      calls.replay++;
      const a=ctx.S._rb31;
      ctx.S._rb31={...a,hist:(a.hist||[]).slice(),lays:a.lays,undoPilha:a.undoPilha||[]};
    },
    rb31Desenha:s=>{
      calls.draw++;
      layer._rb31Recipe={...layer._rb31Recipe,banco:s.banco,fase:s.fase,hist:s.hist||[]};
    }};
  ctx.window=ctx;
  vm.createContext(ctx);vm.runInContext(source,ctx);
  return {ctx,button,layer,toasts,info,calls};
}

/* Projeto antigo: sem snapshots nem marcos persistidos. O primeiro clique
   tira a berma; o segundo tira a bancada, em vez de não fazer nada. */
{
  const t=contextFor({banco:2,fase:'crista',hist:[{startP:[0,0]},{startP:[1,1]}]});
  assert.equal(typeof t.button.onclick,'function','o botão deve ser religado à versão final');
  assert.equal(t.button.onclick(),true);
  assert.equal(t.ctx.S._rb31.banco,2);
  assert.equal(t.ctx.S._rb31.fase,'pe');
  assert.equal(t.button.onclick(),true);
  assert.equal(t.ctx.S._rb31.banco,1);
  assert.equal(t.ctx.S._rb31.fase,'crista');
  assert.equal(t.calls.replay,2);
}

/* Projeto novo: o marco compacto distingue uma Iteração completa de um
   Offset isolado e volta exatamente ao banco/fase anteriores. */
{
  const t=contextFor({banco:1,fase:'pe',hist:[{startP:[0,0]}]});
  t.ctx.rb31AcaoComVolta(()=>{
    const st=t.ctx.S._rb31;
    st.banco=2;st.fase='crista';st.hist.push({startP:[1,1]});
  });
  assert.equal(t.ctx.S._rb31._acoesVoltar132.length,1);
  assert.equal(t.layer._rb31Recipe.acoesVoltar132.length,1);
  assert.equal(t.button.onclick(),true);
  assert.equal(t.ctx.S._rb31.banco,1);
  assert.equal(t.ctx.S._rb31.fase,'pe');
  assert.equal(t.ctx.S._rb31.hist.length,1);
}

/* Em uma sessão aberta o núcleo também guarda um snapshot pesado. O Voltar
   deve consumir snapshot e marco juntos; caso contrário o mesmo passo seria
   desfeito duas vezes e concorreria fora de ordem com o Ctrl+Z geral. */
{
  const t=contextFor({banco:2,fase:'crista',hist:[{startP:[0,0]},{startP:[1,1]}],
    undoPilha:[{banco:1}],acoes:[{bancoAntes:1,faseAntes:'pe',
      bancoDepois:2,faseDepois:'crista',ts:100,ord:101}]});
  let chamadas=0;
  /* O wrapper 132 já capturou a função original ao carregar; a implementação
     do contexto remove um snapshot e simula o estado entregue pelo núcleo. */
  t.ctx.S._rb31.undoPilha=[{banco:1}];
  assert.equal(t.button.onclick(),true);
  chamadas++;
  assert.equal(chamadas,1);
  assert.equal(t.ctx.S._rb31._acoesVoltar132.length,0,
    'o marco compacto correspondente ao snapshot também deve ser consumido');
  assert.equal(t.layer._rb31Recipe.acoesVoltar132.length,0);
}

console.log('OK: Voltar restaurou projetos antigos e ações persistidas.');
