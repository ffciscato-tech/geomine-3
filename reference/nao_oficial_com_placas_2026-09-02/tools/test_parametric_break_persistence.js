const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const props={CLASSE:'rb31-pe',BANCO:1,TIPO:'Pé 1'},
  pe={geom:[[0,0],[10,0],[10,10],[0,10],[0,0]],props:{...props}},
  source={id:20,name:'◈ Limite paramétrico',features:[{geom:[[0,0],[30,0],[30,30],[0,30],[0,0]],props:{}}]},
  output={id:21,name:'DCE paramétrico',gtype:'line',features:[pe],
    _rb31Recipe:{srcLayerId:20,linhasManuais134:{
      '1:rb31-pe:0':{banco:1,classe:'rb31-pe',berma:false,tipo:'Pé 1',geom:pe.geom.slice(0,-1)}
    }}},
  state={banco:1,feats:[pe],lays:{uni:output},_linhasManuais134:{
    '1:rb31-pe:0':{banco:1,classe:'rb31-pe',berma:false,tipo:'Pé 1',geom:pe.geom.slice(0,-1)}
  }};

const ctx={console,window:null,S:{layers:[source,output],_rb31:state,undo:[]},
  ED:{sel:{L:output,f:pe,idx:0}},document:{getElementById:()=>null},
  clearVertices(){},refreshUI(){},drawLayer(){},toast(){},cmdLog(){},
  showVertices(){return true;},
  apagarSelecao(q){
    const L=q.layer||ctx.S.layers.find(x=>x.id===q.layerId),f=L.features[q.idx];
    if(!f)return false;
    ctx.S.undo.push({t:'featdel',L,feat:f,idx:q.idx});L.features.splice(q.idx,1);
    return true;
  },
  doUndo(){
    const a=ctx.S.undo.pop();if(!a)return false;
    if(a.t==='featdel')a.L.features.splice(a.idx,0,a.feat);
    return true;
  },
  rb31PosEdicao(){return true;},rb31EstadoDaReceita:()=>state,
  rb31LiveSync(){return true;},rb31Replay(){return true;},rb31Gerar(){return true;},
  rb31Desenha(st){
    output.features=st.feats.slice();
    output._rb31Recipe={srcLayerId:20,banco:st.banco};
    return output;
  },
  edQuebrarEm(){
    const {L,f}=ctx.ED.sel;
    f.geom=[[0,0],[10,0],[10,10]];
    L.features.push({geom:[[10,10],[0,10],[0,0]],props:{...props}});
    return true;
  },
  edApagarFeicao(){
    const {L,f}=ctx.ED.sel,ix=L.features.indexOf(f);
    if(ix>=0)L.features.splice(ix,1);
    return true;
  },
  edFechar(){
    const {f}=ctx.ED.sel,g=f.geom;
    if(g.length&&Math.hypot(g[0][0]-g.at(-1)[0],g[0][1]-g.at(-1)[1])>1e-7)
      g.push(g[0].slice());
    return true;
  }};
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,
  '../src/modules/mining/alagis-134-protecao-geometria-parametrica.js'),'utf8'),ctx);

ctx.edQuebrarEm();
assert.equal(output.features.length,2,'a quebra deve produzir duas partes');
assert.equal(Object.keys(state._linhasManuais134||{}).length,0,
  'a quebra deve esquecer a geometria completa anterior');
assert(output.features.every(f=>f._rb134QuebraId),
  'as partes da mesma quebra devem ser identificadas temporariamente');

const parteApagada=output.features[1];
ctx.apagarSelecao({layer:output,layerId:21,idx:1});
assert.equal(output.features.length,1,'somente a parte escolhida deve ser apagada');
assert.equal(Object.keys(state._linhasOmitidas134||{}).length,0,
  'apagar uma parte não pode omitir toda a linha de pé');

ctx.doUndo();
assert.equal(output.features.length,2,
  'Ctrl+Z deve restaurar exatamente a parte quebrada que foi apagada');
assert(output.features.includes(parteApagada),
  'o trecho restaurado pelo Ctrl+Z deve ser a mesma feição removida');
assert.equal(Object.keys(state._linhasOmitidas134||{}).length,0,
  'o Ctrl+Z de um trecho não pode criar memória de omissão do anel');

ctx.apagarSelecao({layer:output,layerId:21,idx:output.features.indexOf(parteApagada)});
assert.equal(output.features.length,1,'o trecho deve poder ser apagado novamente após o undo');

ctx.ED.sel={L:output,f:pe,idx:0};
ctx.edFechar();
assert.deepEqual(pe.geom,[[0,0],[10,0],[10,10],[0,0]],
  'o trecho restante deve ser fechado no próprio editor');
assert.equal(Object.keys(output._rb31Recipe.linhasManuais134||{}).length,1,
  'a linha fechada deve substituir a memória antiga na receita');
assert.equal(JSON.stringify(output._rb31Recipe.linhasManuais134['1:rb31-pe:0'].geom),
  JSON.stringify([[0,0],[10,0],[10,10]]),'somente o trecho fechado deve ser persistido');

/* O botão Voltar restaura snapshots construtivos antigos. Simula esse
   retrato com o anel completo e sem o mapa manual no estado: a receita
   atual deve vencer e conservar somente o trecho que foi fechado. */
const anelAntigo={geom:[[0,0],[10,0],[10,10],[0,10],[0,0]],props:{...props},
  _geomProjeto:[[0,0],[10,0],[10,10],[0,10],[0,0]]};
state.feats=[anelAntigo];state._linhasManuais134={};
ctx.rb31Desenha(state);
assert.equal(JSON.stringify(anelAntigo.geom),JSON.stringify([[0,0],[10,0],[10,10],[0,0]]),
  'Voltar não pode recuperar a parte apagada da linha original');
assert.equal(JSON.stringify(anelAntigo._geomProjeto),JSON.stringify(anelAntigo.geom),
  'Offset/Iteração também devem usar o trecho fechado, não a cópia antiga');
assert.equal(JSON.stringify(output._rb31Recipe.linhasManuais134['1:rb31-pe:0'].geom),
  JSON.stringify([[0,0],[10,0],[10,10]]),
  'a receita manual deve sobreviver ao redesenho provocado por Voltar');

ctx.rb31LiveSync({sourceLayer:source,force:true});
assert.equal(JSON.stringify(output._rb31Recipe.linhasManuais134['1:rb31-pe:0'].geom),
  JSON.stringify([[0,0],[10,0],[10,10]]),
  'mover o limite paramétrico não pode recuperar a linha anterior à quebra');
console.log('OK: quebrar, apagar uma parte e fechar substitui definitivamente a geometria antiga.');
