/* Aba Cava — botão de dividir o desenho na linha selecionada (pedido de 23/11/2026, print
   IMG_0278): junto dos ❄, um botão que faz o bloco terminar na linha — a rampa dele acaba ali — e
   abre um bloco novo dali em diante, com ângulo de talude, berma e rampa próprios.
   Só geometria sintética. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const motor=fs.readFileSync(path.join(__dirname,'cava-pilha-v106.html'),'utf8');
const trecho=(a,b)=>{const i=motor.indexOf(a),f=motor.indexOf(b,i);assert(i>0&&f>i,'trecho do motor: '+a);return motor.slice(i,f);};
function novoMotor(){
  const ctx={};vm.createContext(ctx);
  vm.runInContext(`let sel=null, objs={}, ladoCongelado=null, ultimaEdicao="", chamadas=0, desfez=0, falha=false, juntas=false, regens=0, partidaRecebida;
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    const parametrosDe=k=>objs[k].prm, fmt=(v,d)=>(+v).toFixed(d).replace(".",","), cotaAbsolutaDoDesign=z=>300+z,
      atualizaDicaSel=()=>{}, redesenha=()=>{}, regen=()=>{regens++;}, limpaJuntasNovas=()=>{const j=juntas;juntas=false;return j;};
    function limiteDeLinhaExistente(partida){ chamadas++; partidaRecebida=partida; const k=sel.alvo; objs[k+"#1"]={base:[1,2,3],paiDe:k,design:falha?null:{aneis:[1]},erro:falha?"a linha não fecha":null}; sel=null; }
    function desfaz(){ desfez++; for(const k of Object.keys(objs)) if(k.includes("#")) delete objs[k]; }`
    +trecho('function cumulativo(P){','function offsetU(')
    +trecho('function podeDividirNaSelecao(){','function alternaLadoCongelado(')
    +`;this.M={pode:podeDividirNaSelecao,divide:divideNaSelecao,
       set:o=>{ if('sel' in o)sel=o.sel; if('objs' in o)objs=o.objs; if('lado' in o)ladoCongelado=o.lado; if('falha' in o)falha=o.falha; if('juntas' in o)juntas=o.juntas; },
       get:()=>JSON.stringify({chamadas,desfez,regens,partida:partidaRecebida===undefined?'não informada':partidaRecebida,lado:ladoCongelado,msg:String(ultimaEdicao).replace(/<[^>]+>/g,''),blocos:Object.keys(objs),sel})};`,ctx);
  return {M:ctx.M,estado:()=>JSON.parse(ctx.M.get())};
}
/* pilha de 4 bancadas de 10 m: anéis do topo (0) para a linha desenhada (8), como o motor guarda */
const pilha=()=>({pilha:{z0:0,prm:{H:40,banco:10},base:[1,2,3],design:{aneis:[40,30,30,20,20,10,10,0,0].map((z,i)=>({z,tp:i%2?'pe':'crista',P:[]}))}}});

test('o botão só aparece onde sobra bancada dos dois lados da divisão',()=>{
  const {M}=novoMotor(); M.set({objs:pilha()});
  M.set({sel:null}); assert.equal(M.pode(),false,'sem linha selecionada');
  M.set({sel:{alvo:'pilha',idx:8}}); assert.equal(M.pode(),false,'a linha desenhada é o começo do bloco: nada ficaria antes dela');
  M.set({sel:{alvo:'pilha',idx:0}}); assert.equal(M.pode(),false,'a última linha: nada ficaria depois dela');
  for(const idx of [2,4,6]){ M.set({sel:{alvo:'pilha',idx}}); assert.equal(M.pode(),true,'crista do meio, índice '+idx); }
  M.set({sel:{alvo:'pilha',idx:5}}); assert.equal(M.pode(),true,'pé do meio também divide');
  /* bloco encadeado: a altura conta a partir da cota onde ele nasce */
  const o=pilha(); o.pilha.z0=100; o.pilha.design.aneis.forEach(a=>a.z+=100);
  M.set({objs:o,sel:{alvo:'pilha',idx:4}}); assert.equal(M.pode(),true);
  M.set({sel:{alvo:'pilha',idx:8}}); assert.equal(M.pode(),false);
});

test('dividir fecha o bloco na linha, abre o bloco novo e solta o lado congelado',()=>{
  const {M,estado}=novoMotor();
  M.set({objs:pilha(),sel:{alvo:'pilha',idx:4},lado:{alvo:'pilha',idx:4,lado:'fora'},juntas:true});
  assert.equal(M.divide(),true);
  const e=estado();
  assert.equal(e.chamadas,1,'usa a divisão em blocos encadeados do motor, uma vez');
  assert.deepEqual(e.blocos,['pilha','pilha#1']);
  assert.equal(e.lado,null,'o congelamento era da edição da berma, não segue para a divisão');
  assert.equal(e.regens,1,'a junta ainda não confirmada sai antes de dividir');
  assert.match(e.msg,/desenho dividido na cota 320 m/);          // cota absoluta: 300 + 20
  assert.match(e.msg,/termina nesta linha, com a rampa dele/);
  assert.match(e.msg,/bloco novo \(pilha#1\)/);
  assert.match(e.msg,/ângulo do talude/); assert.match(e.msg,/Início da rampa/);
  assert.equal(e.desfez,0);
});

test('se a continuação não fecha, a divisão é desfeita e o desenho fica inteiro',()=>{
  const {M,estado}=novoMotor();
  M.set({objs:pilha(),sel:{alvo:'pilha',idx:4},falha:true});
  assert.equal(M.divide(),false);
  const e=estado();
  assert.equal(e.desfez,1); assert.deepEqual(e.blocos,['pilha'],'nenhum bloco partido fica para trás');
  assert.match(e.msg,/não foi possível dividir aqui — a linha não fecha/);
  /* onde o botão não aparece, a função também não faz nada */
  M.set({falha:false,sel:{alvo:'pilha',idx:8}}); assert.equal(M.divide(),false); assert.equal(estado().chamadas,1);
});

test('o botão fica ao lado do ❄ de fora, responde ao toque e não usa o emoji da tesoura no desenho',()=>{
  const lado=trecho('function botoesDeLado(){','function podeDividirNaSelecao(){');
  assert.match(lado,/divide: !ladoDaSelecao\(\) && podeDividirNaSelecao\(\) \? \{x:sx\+nx\*d\+tx\*32, y:sy-ny\*d-ty\*32\} : null/,'ao lado do ❄ de fora, deslocado ao longo da linha, e só sem lado congelado');
  const toque=trecho('// os dois ❄ da string selecionada (lado congelado) ganham de qualquer outra pegada','// 0) vértices das LINHAS DESENHADAS');
  assert.match(toque,/if\(B\.divide && Math\.hypot\(e\.offsetX-B\.divide\.x, e\.offsetY-B\.divide\.y\)<=17\)\{ divideNaSelecao\(\); return; \}/);
  const desenho=trecho('function desenhaBotoesDeLado(an){','// juntas (bermas editadas pelo ❄)');
  assert.match(desenho,/if\(B\.divide\)\{/); assert.ok(!/fillText\("✂"/.test(desenho),'tesoura desenhada à mão');
  assert.match(motor,/divideNaSelecao, podeDividirNaSelecao,/,'expostas para os testes de navegador');
});

/* 24/11/2026, prints IMG_0281/0282: "deixar somente a rampa para iniciar na linha selecionada e o
   resto continua como estava … no caso de uma pilha o melhor é a rampa iniciar da crista". */
test('a rampa do bloco novo começa no ponto da linha que a pessoa tocou',()=>{
  const {M,estado}=novoMotor(),o=pilha();
  // a crista selecionada é um quadrado de 100 m; o toque caiu 3 m para fora do meio do lado de baixo
  o.pilha.design.aneis[4].P=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];
  M.set({objs:o,sel:{alvo:'pilha',idx:4,toque:{x:40,y:-3}}});
  assert.equal(M.divide(),true);
  const e=estado();
  assert.deepEqual(e.partida,{x:40,y:0},'o ponto tocado, trazido para cima da linha selecionada');
  assert.match(e.msg,/A rampa dele começa no ponto da linha que você tocou \(R\); para mudar, use Início da rampa\./);
});
test('sem ponto de toque a divisão fica como era: o R é marcado depois',()=>{
  const {M,estado}=novoMotor(),o=pilha();
  o.pilha.design.aneis[4].P=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];
  M.set({objs:o,sel:{alvo:'pilha',idx:4}});
  assert.equal(M.divide(),true);
  const e=estado();
  assert.equal(e.partida,null);
  assert.match(e.msg,/Marque onde a rampa dele começa com Início da rampa\./);
});
test('o bloco novo nasce com o início da rampa recebido; os outros caminhos continuam sem ele',()=>{
  const limite=trecho('function limiteDeLinhaExistente(partida){','// modo "escolher linha existente"');
  assert.match(limite,/const R=\(partida && Number\.isFinite\(partida\.x\) && Number\.isFinite\(partida\.y\)\) \? \{x:partida\.x, y:partida\.y\} : null;/);
  assert.match(limite,/objs\[nk\]=\{base:linha, anc:R,/);
  // a linha de partida do bloco é a de sempre: quem decide é linhaDePartida
  assert.match(limite,/const part=linhaDePartida\(a, T, P0\.berma\);/);
  // "⊙ Escolher linha existente" não informa ponto nenhum
  assert.match(motor,/else limiteDeLinhaExistente\(\);/);
  // e o ❄ continua escolhendo a borda da berma do lado livre (o talude não muda)
  assert.match(motor,/return lado==="fora" \? \{anda:b\.iIn, par:b\.iOut, berma:b\} : \{anda:b\.iOut, par:b\.iIn, berma:b\};/);
});
