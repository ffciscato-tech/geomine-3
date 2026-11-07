const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const crestGeom=[[0,0],[12,0],[10,10],[0,10],[0,0]],
  source={id:7,name:'◈ Limite paramétrico',_cavaLimiteDin:true,
    features:[{geom:[[0,0],[20,0],[20,20],[0,20],[0,0]],props:{}}]},
  crest={geom:crestGeom.map(p=>p.slice()),props:{CLASSE:'rb31-crista',BANCO:1,BERMA:6,
    TIPO:'Crista manual'}},
  ramp={geom:[[1,1],[9,1]],props:{CLASSE:'rb31-rampa',BANCO:1}},
  output={id:8,name:'Cava paramétrica',features:[crest,ramp],
    _rb31Recipe:{srcLayerId:7,srcFeatIdx:0}},
  state={banco:1,crista:[[0,0],[10,0],[10,10],[0,10]],feats:[crest,ramp],
    hist:[{startP:[1,0],degrau:false}],_edicaoBruta134:true,lays:{uni:output}},
  calls={vertices:0,deleted:0,toasts:0,generated:null,liveSync:0};
const fields={rb31Info:{textContent:'',innerHTML:''}};
const ctx={console,window:null,S:{layers:[source,output],_rb31:state,activeId:8,
  selFeat:{layer:output,layerId:8,idx:0}},document:{getElementById:id=>fields[id]||null},
  showVertices(){calls.vertices++;return true;},apagarSelecao(){calls.deleted++;return true;},
  clearVertices(){},refreshUI(){},showProps(){},toast(){calls.toasts++;},cmdLog(){},
  rb31PosEdicao(){return true;},rb31Estado:()=>ctx.S._rb31,
  rb31Gerar(){calls.generated={crista:state.crista.map(p=>p.slice()),
    peControle:state._peControle105&&state._peControle105.map(p=>p.slice())};return true;},
  rb31Replay(){state.banco=1;return true;},rb31EstadoDaReceita:()=>state,
  rb31LiveSync(){calls.liveSync++;return true;}};
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,
  '../src/modules/mining/alagis-134-protecao-geometria-parametrica.js'),'utf8'),ctx);

/* Crista/pé: edição livre. Rampa: protegida. */
assert.equal(ctx.rb134EhDerivadaProtegida(output,crest),false);
assert.equal(ctx.showVertices(),true);
assert.equal(calls.vertices,1,'a crista deve abrir o editor de vértices');
ctx.S.selFeat={layer:output,layerId:8,idx:1};
assert.equal(ctx.showVertices(),false,'a própria borda da rampa não pode ser arrastada');
assert.equal(calls.vertices,1);
assert.equal(ctx.apagarSelecao(ctx.S.selFeat),false,'a rampa calculada não pode ser apagada diretamente');
ctx.S.selFeat={layer:output,layerId:8,idx:0};
assert.equal(ctx.apagarSelecao(ctx.S.selFeat),true,'a crista continua editável');

/* A edição fica guardada sem gerar rampa; só entra no gerador quando o
   replay for solicitado após a escolha do novo ponto. */
ctx.rb31PosEdicao(output,crest);
assert(output._rb31Recipe.linhasManuais134,'a linha suavizada deve persistir na receita');
assert.equal(calls.generated,null,'editar a crista no modo bruto não pode gerar rampa');
state.crista=[[90,90],[100,90],[100,100],[90,100]];
ctx.rb31Gerar(true);
assert.equal(JSON.stringify(calls.generated.crista),JSON.stringify(crestGeom.slice(0,-1)),
  'o redesenho posterior deve usar exatamente a crista suavizada');

/* Se o limite superior for alterado depois, somente as linhas não editadas
   voltam a ser derivadas. A correção manual desta linha é uma decisão do
   operador e deve continuar na receita e no replay. */
ctx.rb31LiveSync({sourceLayer:source,sourceFeature:source.features[0],force:true});
assert.equal(Object.keys(output._rb31Recipe.linhasManuais134||{}).length,1,
  'editar o limite não pode descartar o pé/crista movido manualmente');
assert.equal(Object.keys(state._linhasManuais134||{}).length,1,
  'o controle manual também deve permanecer no estado de trabalho');
state.crista=[[190,190],[200,190],[200,200],[190,200]];
ctx.rb31Gerar(true);
assert.equal(JSON.stringify(calls.generated.crista),JSON.stringify(crestGeom.slice(0,-1)),
  'depois de mover o limite, o replay deve reaplicar a geometria manual');
assert.equal(calls.liveSync,1,'o replay paramétrico deve continuar sendo chamado');
console.log('OK: o limite recalcula as linhas derivadas sem desfazer cristas/pés editados manualmente.');
