const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const fields={
  rb31W:{value:'10'},rb31Dir:{value:'ccw'},rb31Info:{textContent:'',innerHTML:''},
  rb31MoverAteZ:{value:'60',focus:()=>{}},
  rb31RampasResumo:{textContent:'',innerHTML:''},
  btnRb31FinalizarRampa:{onclick:null},btnRb31NovoPonto:{onclick:null},
  btnRb31NovoLimite:{onclick:null},btnRb31AlterarRampa:{onclick:null},
  btnRb31LimparRampa:{onclick:null},btnRb31MoverRampa:{onclick:null}
};
const layer={id:'rampa-layer',features:[],_rb31Recipe:{banco:3,hist:[]}},
  state={fase:'crista',banco:3,hist:[
    {startP:[25,0],degrau:false},{startP:null,degrau:true},{startP:null,degrau:true}
  ],feats:[],rampas:[{id:'rampa-1',nome:'Rampa 1',status:'ativa',banco:1,
    ateBanco:3,startP:[25,0]}],rampaAtivaId133:'rampa-1',lays:{uni:layer},
    crista:[[0,0],[100,0],[100,100],[0,100]],zPe:70};

let optBancada=null,limpou=false,reposicionou=false,concluirReposicionamento=null,
  indiceMover=null;
const ctx={
  console,Math,JSON,Date,Number,Array,Object,String,Set,Map,
  setTimeout,clearTimeout,
  document:{getElementById:id=>fields[id]||null},
  window:null,
  S:{_rb31:state,layers:[layer],_view:'map'},
  toast:()=>{},cmdLog:()=>{},refreshUI:()=>{},
  rb31NomePartida:()=> 'Crista',
  rb31CotaPe:(st,k)=>100-k*10,
  rb31BancoDaCota:(st,z)=>Math.max(1,Math.ceil((100-z)/10)),
  rb31RampaDefinePonto:i=>{indiceMover=i;},
  rb31Estado:()=>ctx.S._rb31,
  rb31AcaoComVolta:fn=>fn(),
  rb31Bancada:(crista,z,opt)=>{optBancada={...opt};return {ok:true};},
  rb31GeraSemCruzar:(crista,z,opt)=>({r:{peEntregue:[]},opt}),
  rb31Desenha:st=>{st.lays.uni.features=(st.feats||[]).slice();
    st.lays.uni._rb31Recipe={banco:st.banco,hist:st.hist||[]};},
  rb31EstadoDaReceita:()=>ctx.S._rb31,
  rb31Snap:st=>JSON.stringify({banco:st.banco,hist:st.hist}),
  rb31LimparRampa:()=>{const st=ctx.S._rb31;limpou=true;st.semRampa=true;
    st.hist=st.hist.map(h=>({...h,sem:true}));st.rampas=[];ctx.rb31Replay();},
  rb31ReposicionaRampa:()=>{reposicionou=true;concluirReposicionamento=()=>{
    const st=ctx.S._rb31;st.semRampa=false;
    st.hist=st.hist.map((h,i)=>({startP:i?null:[62,0],degrau:!!i,sem:false}));
    ctx.rb31Replay();
  };},
  rb31Gerar:()=>{
    const st=ctx.S._rb31,opt={};
    ctx.rb31GeraSemCruzar(st.crista,0,opt,10,[]);
    st.banco++;st.hist.push({startP:null,degrau:true,sem:!!opt.semRampa});
    return true;
  },
  rb31Replay:()=>{
    const st=ctx.S._rb31,target=(st._histAlvo&&st._histAlvo.length)?st._histAlvo:st.hist;
    st.hist=target.map(q=>({...q}));st.banco=target.length;return true;
  },
  rb31LiveSync:()=>{
    setTimeout(()=>{const st=ctx.S._rb31;st.banco=2;st.hist=st.hist.slice(0,2);},10);
  }
};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,
  '../src/modules/mining/alagis-133-vinco-rampas-e-replay-total.js'),'utf8'),ctx);

/* Rampa opt-in: sem clique explícito, a primeira bancada e todas as
   seguintes permanecem brutas. Um projeto novo com ponto marcado pode
   gerar a rampa normalmente. */
const rawLayer={id:'raw-layer',features:[],_rb31Recipe:{banco:0,hist:[]}},
  rawState={fase:'crista',banco:0,hist:[],feats:[],rampas:[],startP:null,
    lays:{uni:rawLayer},crista:[[0,0],[100,0],[100,100],[0,100]],zPe:100};
ctx.S._rb31=rawState;
assert.equal(ctx.rb31Gerar(true),true);
assert.equal(rawState.hist[0].sem,true,
  'sem ponto marcado, a primeira bancada deve ser gerada sem rampa');
assert.equal(rawState.rampaPausada133,true,
  'a decisão de gerar o PDE bruto deve persistir nas próximas bancadas');
assert.equal(ctx.rb31Gerar(true),true);
assert.equal(rawState.hist[1].sem,true,
  'sem novo ponto, a bancada seguinte também deve permanecer bruta');

const markedLayer={id:'marked-layer',features:[],_rb31Recipe:{banco:0,hist:[]}},
  markedState={fase:'crista',banco:0,hist:[],feats:[],rampas:[],startP:[25,0],
    lays:{uni:markedLayer},crista:[[0,0],[100,0],[100,100],[0,100]],zPe:100};
ctx.S._rb31=markedState;
assert.equal(ctx.rb31Gerar(true),true);
assert.equal(markedState.hist[0].sem,false,
  'um ponto explicitamente marcado deve habilitar a rampa');
ctx.S._rb31=state;

/* Retomada após salvar/reabrir: uma receita antiga pode ter parado no banco
   2 enquanto a camada já contém bancos novos. O maior BANCO publicado deve
   completar o plano, e o clique inicial deve produzir uma seta persistente. */
const retomadaLayer={id:'retomada',features:[],_rb31Recipe:{banco:2,
    hist:[{startP:[0,0],degrau:false},{startP:null,degrau:true}],
    planoCompleto133:[{startP:[0,0],degrau:false},{startP:null,degrau:true}]}},
  mk=(b,c,g)=>({geom:g,props:{BANCO:b,CLASSE:c,TIPO:c}}),
  retomadaState={banco:2,fase:'crista',hist:[{startP:[0,0],degrau:false},
    {startP:null,degrau:true}],feats:[
      mk(1,'rb31-rampa',[[0,0],[20,0]]),mk(2,'rb31-rampa',[[20,0],[40,0]]),
      mk(3,'rb31-crista',[[0,0],[1,0],[1,1]]),mk(4,'rb31-pe',[[0,0],[2,0],[2,2]])],
    rampas:[{id:'rampa-1',banco:1,ateBanco:2,startP:[0,0]}],lays:{uni:retomadaLayer},
    startP:[0,0]};
retomadaLayer.features=retomadaState.feats.slice();ctx.S.layers.push(retomadaLayer);
ctx.S._rb31=retomadaState;ctx.rb31EstadoDaReceita(retomadaLayer);
assert.equal(retomadaState._planoCompleto133.length,4,
  'bancos criados depois da reabertura devem completar o plano persistente');
assert.equal(retomadaState._histAlvo.length,4,
  'o próximo replay do limite deve ter como alvo todos os bancos visíveis');
ctx.rb31Desenha(retomadaState);
const marca=retomadaLayer.features.find(f=>f.props&&f.props.CLASSE==='rb31-inicio');
assert(marca,'o início da rampa deve ficar marcado na camada paramétrica');
assert.equal(JSON.stringify(marca.geom[0]),'[0,0]',
  'a seta deve nascer exatamente no ponto clicado');
assert.notEqual(JSON.stringify(marca.geom[0]),JSON.stringify(marca.geom[1]),
  'a seta precisa indicar um sentido');
ctx.S._rb31=state;

const R=[[0,0],[100,0],[100,100],[0,100]],v=ctx.rb133VincoNaLinha(R,[25,2],10,'ccw');
assert(v,'o vinco deve ser construído');
assert(Math.abs(v.B[1])<1e-9&&Math.abs(v.A[1])<1e-9,
  'os dois extremos do vinco devem pertencer à linha selecionada');
assert(Math.abs(Math.hypot(v.A[0]-v.B[0],v.A[1]-v.B[1])-10)<1e-6,
  'o vinco deve conservar a largura W como corda exata');

ctx.rb31Bancada(R,100,{soleira:[v.A,v.B],W:10});
assert.equal(optBancada.entradaDegrau,true,'a nova rampa deve reutilizar a soleira terminal');
assert.equal(optBancada.solDireto,true,'o vinco não pode ser reprojetado ou aproximado');
assert.deepEqual(optBancada.solIniA,v.A);
assert.deepEqual(optBancada.solIniB,v.B);

assert.equal(ctx.rb133FinalizarRampa(),true);
assert.equal(state.rampaPausada133,true,'finalizar deve pausar a criação de corredores');
assert.equal(state.rampas[0].status,'finalizada');
assert.equal(ctx.rb31Gerar(true),true);
assert.equal(state.hist.at(-1).sem,true,
  'a bancada seguinte deve poder ser gerada sem herdar a rampa finalizada');

assert.equal(ctx.rb133AlterarRampaInteira(),true);
assert.equal(limpou,true,'Alterar rampa deve primeiro recompor os taludes brutos');
assert.equal(reposicionou,false,'a primeira etapa deve permitir editar a cava bruta antes do novo ponto');
assert.equal(state.rampaPausada133,true,'antes do novo clique os taludes devem continuar brutos');
assert.equal(state.rampas.length,0,'antes do novo clique nao pode restar corredor antigo');
assert(state.hist.every(h=>h.sem),'o estado bruto nao pode conservar rampa em nenhuma bancada');
assert.equal(state._edicaoBruta134,true,'o estado deve registrar a etapa de suavização manual');
assert.equal(ctx.rb133AlterarRampaInteira(),true);
assert.equal(reposicionou,true,'a segunda etapa deve solicitar o ponto da nova rampa');
concluirReposicionamento();
assert.equal(state.rampaPausada133,false,'a rampa redesenhada deve voltar ao estado ativo');
assert.equal(state.rampas.length,1,'a relocação integral não pode conservar corredores antigos');
assert.equal(state._edicaoBruta134,false,'o modo bruto deve terminar depois do redesenho');
assert.deepEqual(state.hist[0].startP,[62,0],'o replay integral deve nascer no novo ponto escolhido');

assert.equal(typeof fields.btnRb31LimparRampa.onclick,'function');
assert.equal(typeof fields.btnRb31MoverRampa.onclick,'function');
assert.equal(ctx.rb133MoverRampaAteCota(),true,'Mover rampa deve preparar a seleção no mapa');
assert.equal(indiceMover,0,'Mover deve solicitar o ponto da única rampa substituta');
assert.equal(state.rampas.length,1,'Mover deve apagar todos os corredores antigos');
assert.equal(state.rampas[0].ate,60,'a cota informada deve comandar o fim da rampa');
assert.equal(state.rampas[0].ateBanco,4,'a cota deve ser convertida para o banco construtivo correto');
assert.equal(state._edicaoBruta134,true,
  'até o clique no novo ponto, cristas e pés devem permanecer no modo bruto editável');

state._planoCompleto133=[
  {startP:[25,0],degrau:false},{startP:null,degrau:true},
  {startP:null,degrau:true},{startP:null,degrau:true}
];
state.hist=state._planoCompleto133.map(q=>({...q}));state.banco=4;
for(let i=0;i<24;i++)ctx.rb31LiveSync({sourceLayer:{id:'limite'},
  sourceFeature:{geom:R.map((p,k)=>[p[0]+(k===i%4?i*.05:0),p[1]])},force:false});
ctx.rb31LiveSync({sourceLayer:{id:'limite'},sourceFeature:{geom:R},force:true,immediate:true});

setTimeout(()=>{
  assert.equal(state.banco,4,'a soltura do vértice deve restaurar todas as bancadas do plano');
  assert.equal(state.hist.length,4,'o replay final não pode conservar apenas uma família parcial');
  console.log('OK: vinco exato, finalização independente e replay total validados.');
},430);
