#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source={id:'limite',_cavaLimiteDin:true,features:[{geom:[[0,0],[20,0],[20,20],[0,0]]}]},
  crest={geom:[[2,2],[18,2],[18,18],[2,2]],props:{CLASSE:'rb31-crista',BANCO:1,
    BERMA:6,TIPO:'Crista do banco 1'}},
  toe={geom:[[4,4],[16,4],[16,16],[4,4]],props:{CLASSE:'rb31-pe',BANCO:1,
    BERMA:null,TIPO:'Pé do banco 1'}},
  ramp={geom:[[2,2],[4,4]],props:{CLASSE:'rb31-rampa',BANCO:1,TIPO:'Borda da rampa'}},
  output={id:'resultado',features:[crest,toe,ramp],_rb31Recipe:{srcLayerId:'limite',
    linhasManuais134:{'1:rb31-crista:1':{banco:1,classe:'rb31-crista',berma:true,
      tipo:'Crista do banco 1',geom:crest.geom}}}},
  state={banco:1,feats:[crest,toe,ramp],hist:[],lays:{uni:output},
    _linhasManuais134:output._rb31Recipe.linhasManuais134},
  calls={draw:0,refresh:0,live:0,voltar:0,coreUndo:0};
const ctx={console,window:null,S:{layers:[source,output],_rb31:state,selFeat:null,undo:[]},
  document:{getElementById:()=>null},clearVertices(){},toast(){},cmdLog(){},
  drawLayer(){calls.draw++;},refreshUI(){calls.refresh++;},showVertices(){return true;},
  apagarSelecao(q){const L=q.layer,f=L.features[q.idx];if(!f)return false;
    ctx.S.undo.push({t:'featdel',L,feat:f,idx:q.idx});L.features.splice(q.idx,1);return true;},
  doUndo(){calls.coreUndo++;const a=ctx.S.undo.pop();if(a&&a.t==='featdel')
    a.L.features.splice(Math.min(a.idx,a.L.features.length),0,a.feat);},
  rb31EstadoDaReceita(){return state;},rb31Estado(){return state;},
  rb31Voltar(){calls.voltar++;
    if(Array.isArray(state._acoesVoltar132))state._acoesVoltar132.pop();
    return true;},
  rb31LiveSync(){calls.live++;return true;},rb31Gerar(){return true;},rb31Replay(){return true;},
  rb31Desenha(st){
    /* Simula o núcleo: regenera todas as linhas calculadas e substitui a
       receita. O wrapper deve reaplicar somente a omissão visual. */
    output.features=st.feats.slice();
    output._rb31Recipe={srcLayerId:'limite',banco:st.banco};
    return output;
  }};
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,
  '../src/modules/mining/alagis-134-protecao-geometria-parametrica.js'),'utf8'),ctx);

ctx.S.selFeat={layer:output,layerId:output.id,idx:0};
assert.equal(ctx.apagarSelecao(ctx.S.selFeat),true);
assert(!output.features.includes(crest),'a crista deve sair imediatamente do desenho');
assert(output._rb31Recipe.linhasOmitidas134['1:rb31-crista:1'],
  'a exclusão deve ficar gravada na receita paramétrica');
assert.equal(output._rb31Recipe.linhasManuais134['1:rb31-crista:1'],undefined,
  'uma linha excluída não pode continuar como controle manual');
assert.equal(ctx.S.undo.length,1,'a exclusão ainda passa pela pilha comum antes de ser classificada');
ctx.doUndo();
assert(!output.features.includes(crest),'Ctrl+Z não deve ressuscitar a crista apagada da receita');
assert(output._rb31Recipe.linhasOmitidas134['1:rb31-crista:1'],
  'a omissão explícita deve permanecer depois do Ctrl+Z');
assert.equal(calls.voltar,1,'Ctrl+Z deve voltar a construção paramétrica mais recente');

/* Mover o limite descarta ajustes manuais, mas não a decisão de apagar. */
ctx.rb31LiveSync({sourceLayer:source,sourceFeature:source.features[0],force:true});
assert.equal(calls.live,1);
assert(output._rb31Recipe.linhasOmitidas134['1:rb31-crista:1']);

const calculadasAntes=state.feats.slice();
ctx.rb31Desenha(state);
assert(!output.features.includes(crest),
  'a crista apagada não pode reaparecer depois da regeneração por vértices');
assert(output.features.includes(toe),'as demais linhas devem continuar sendo desenhadas');
assert(output.features.includes(ramp),'a rampa não relacionada deve ser preservada');
assert.deepEqual(state.feats,calculadasAntes,
  'a omissão não pode remover o anel de cálculo usado para manter offsets paralelos');
assert(output._rb31Recipe.linhasOmitidas134['1:rb31-crista:1'],
  'a omissão deve sobreviver à substituição integral da receita');

/* O motor automático mais antigo usa o índice analítico do anel. */
const autoFeat={geom:[[0,0],[1,0],[1,1]],_ringIx:3,props:{CLASSE:'cava-bruta'}},
  auto={id:'auto',features:[autoFeat],cavaDesign:{omitidos:null}};
ctx.S.layers.push(auto);
assert.equal(ctx.apagarSelecao({layer:auto,layerId:auto.id,idx:0}),true);
assert.deepEqual(Array.from(auto.cavaDesign.omitidos),[3]);
assert.equal(auto.cavaDesign.omitidosExplicitos,true);

/* Cronologia cruzada: camada apagada primeiro, bancada desenhada depois.
   O primeiro Ctrl+Z volta a bancada; somente o segundo restaura a camada. */
const removida={id:'antiga',features:[]};
ctx.S.undo=[{t:'layer',L:removida,idx:0,_undoOrd:10,_ts:10}];
state._acoesVoltar132=[{bancoAntes:0,faseAntes:'crista',bancoDepois:1,
  faseDepois:'pe',ord:20,ts:20}];
const coreAntes=calls.coreUndo,voltarAntes=calls.voltar;
ctx.doUndo();
assert.equal(calls.voltar,voltarAntes+1,
  'a ação paramétrica mais nova deve ser desfeita antes da camada antiga');
assert.equal(calls.coreUndo,coreAntes,'a camada ainda não pode ser restaurada');
assert.equal(ctx.S.undo.length,1,'a exclusão antiga deve continuar aguardando na pilha');
ctx.doUndo();
assert.equal(calls.coreUndo,coreAntes+1,'o Ctrl+Z seguinte pode alcançar a camada apagada');
assert.equal(ctx.S.undo.length,0);

/* Se o desenho comum for o mais novo, a ordem se inverte naturalmente. */
ctx.S.undo=[{t:'noop',_undoOrd:40,_ts:40}];
state._acoesVoltar132=[{bancoAntes:0,faseAntes:'crista',bancoDepois:1,
  faseDepois:'pe',ord:30,ts:30}];
const voltarAntesGlobal=calls.voltar,coreAntesGlobal=calls.coreUndo;
ctx.doUndo();
assert.equal(calls.coreUndo,coreAntesGlobal+1,'a edição CAD mais nova deve sair primeiro');
assert.equal(calls.voltar,voltarAntesGlobal);

/* Históricos legados sem relógio não permitem inferir uma nova ordem: nesse
   caso mantém-se a precedência histórica da pilha geral, sem adivinhação. */
ctx.S.undo=[{t:'noop'}];
state._acoesVoltar132=[{bancoAntes:0,faseAntes:'crista',bancoDepois:1,
  faseDepois:'pe'}];
const coreAntesLegado=calls.coreUndo,voltarAntesLegado=calls.voltar;
ctx.doUndo();
assert.equal(calls.coreUndo,coreAntesLegado+1);
assert.equal(calls.voltar,voltarAntesLegado);

console.log('OK: crista/pé apagado permanece omitido; anel analítico continua no cálculo paralelo.');
