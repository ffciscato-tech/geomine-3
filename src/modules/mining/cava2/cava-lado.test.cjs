/* Aba Cava — lado congelado na seleção de linha (os dois ❄): regras tiradas do próprio motor.
   Só anéis sintéticos (quadrados concêntricos), sem dado de projeto. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fonte=fs.readFileSync(path.join(__dirname,'cava-pilha-v106.html'),'utf8');
const trecho=(a,b)=>{const i=fonte.indexOf(a),f=fonte.indexOf(b,i);assert(i>0&&f>i,'trecho do motor: '+a);return fonte.slice(i,f);};
const ctx={};vm.createContext(ctx);
vm.runInContext('const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)); let objs={}, travaSk=null, congelada=null;'
  +trecho('function cumulativo(','function distAoAnel(')+trecho('function distAoAnel(','\n}\n')+'\n}\n'
  +trecho('function travasFixas(','// grava/limpa o esqueleto da string congelada')
  +trecho('function parDeBermaDoLado(','function botoesDeLado(')
  +';this.api={travasFixas,travaDe,fixaAnel,soltaAnel,invasaoDasFixadas,parDeBermaDoLado,bermaDaLinha,planoDoLado,familiaDoAnel,alcasDoAnel,campoEntre,cruzamentosDoDesign,repinaJuntas,soltaPinos,rotulaJunta,set:(o,t)=>{objs=o;travaSk=t||null;},objs:()=>objs};',ctx);
const A=ctx.api;
const quad=(m,z,tp)=>({z,tp,P:[[-m,-m],[m,-m],[m,m],[-m,m]].map((p,i)=>({x:p[0],y:p[1],si:i})),Sk:[[-m,-m],[m,-m],[m,m],[-m,m]].map((p,i)=>({x:p[0],y:p[1],si:i}))});
// pilha de 2 bancos: de dentro para fora — crista@20, pé@10 | crista@10, pé@0 (a linha desenhada)
const pilha=()=>({pilha:{bermas:{},design:{aneis:[quad(20,20,'crista'),quad(40,10,'pe'),quad(48,10,'crista'),quad(68,0,'pe')]}}});

test('o talude nunca muda: os dois lados valem em qualquer linha, e quem anda é a borda da berma do lado livre',()=>{
  const an=pilha().pilha.design.aneis, puro=v=>JSON.parse(JSON.stringify(v));
  // crista@10 (2) e pé@10 (1) são a MESMA berma: o resultado depende só do lado congelado
  for(const linha of [1,2]){
    assert.deepEqual(puro(A.bermaDaLinha(an,linha)),{iIn:1,iOut:2,propria:true});
    const f=A.planoDoLado(an,linha,'fora'),d=A.planoDoLado(an,linha,'dentro');
    assert.equal(f.anda,1,'❄ de fora: anda a borda de dentro (e o miolo), para dentro');assert.equal(f.par,2);
    assert.equal(d.anda,2,'❄ de dentro: anda a borda de fora (e o que está por fora), para fora');assert.equal(d.par,1);
    assert.equal(A.parDeBermaDoLado(an,f.anda,'fora'),f.par,'a linha que anda tem a berma do lado congelado');
    assert.equal(A.parDeBermaDoLado(an,d.anda,'dentro'),d.par);
  }
  // linha do topo (0) e linha desenhada (3) não têm berma própria: vale a que fica depois do talude
  assert.deepEqual(puro(A.bermaDaLinha(an,0)),{iIn:1,iOut:2,propria:false});
  assert.deepEqual(puro(A.bermaDaLinha(an,3)),{iIn:1,iOut:2,propria:false});
  assert.equal(A.planoDoLado(an,0,'fora').anda,1,'topo, ❄ de fora: o pé de baixo dela anda para dentro, e ela junto');
  // um banco só: não há berma, não há o que variar
  const um=[quad(20,10,'crista'),quad(40,0,'pe')];
  assert.equal(A.bermaDaLinha(um,0),null);assert.equal(A.planoDoLado(um,0,'fora'),null);
});
test('só existe lado para congelar onde há berma: a vizinha na mesma cota',()=>{
  const an=pilha().pilha.design.aneis;
  assert.equal(A.parDeBermaDoLado(an,1,'fora'),2,'pé@10: por fora está a crista@10');
  assert.equal(A.parDeBermaDoLado(an,1,'dentro'),-1,'pé@10: por dentro é talude');
  assert.equal(A.parDeBermaDoLado(an,2,'dentro'),1);assert.equal(A.parDeBermaDoLado(an,2,'fora'),-1);
  assert.equal(A.parDeBermaDoLado(an,3,'fora'),-1,'a linha desenhada não tem nada por fora');
  assert.equal(A.parDeBermaDoLado(an,0,'dentro'),-1,'a linha do topo não tem nada por dentro');
});
test('fixar uma linha grava o esqueleto dela pela geração (contada da linha desenhada) e uma só por geração',()=>{
  const o=pilha();A.set(o);
  const t=A.fixaAnel('pilha',1);
  assert.equal(t.g,2,'anel 1 de 4 ⇒ geração 2');assert.equal(A.travasFixas('pilha').length,1);
  assert.notEqual(t.S,o.pilha.design.aneis[1].Sk,'cópia, não a mesma lista');assert.equal(t.S.length,4);assert.equal(t.P.length,4);
  A.fixaAnel('pilha',1);assert.equal(A.travasFixas('pilha').length,1,'fixar de novo substitui');
  A.fixaAnel('pilha',0);assert.deepEqual([...A.travasFixas('pilha')].map(q=>q.g).sort(),[2,3]);
  assert.equal(JSON.parse(JSON.stringify(o.pilha.bermas))._travas.length,2,'vai junto das bermas: projeto, desfazer, cadeia');
  assert.equal(A.soltaAnel('pilha',2),true);assert.equal(A.soltaAnel('pilha',2),false);
  A.soltaAnel('pilha',3);assert.equal('_travas' in o.pilha.bermas,false,'sem fixações a chave some');
});
test('as fixações do ❄ convivem com a trava da tecla F (uma por geração; a da tecla vale na dela)',()=>{
  const o=pilha();A.set(o);
  assert.equal(A.travaDe('pilha'),null);
  A.fixaAnel('pilha',1);
  assert.equal(A.travaDe('pilha').length,1);
  const F={alvo:'pilha',g:2,S:[],Sin:[]};A.set(o,F);
  const juntas=A.travaDe('pilha');assert.equal(juntas.length,1);assert.equal(juntas[0],F,'mesma geração: fica a da tecla F');
  A.set(o,{alvo:'pilha',g:1,S:[],Sin:[]});assert.equal(A.travaDe('pilha').length,2);
  A.set(o,{alvo:'cava',g:1,S:[],Sin:[]});assert.equal(A.travaDe('pilha').length,1,'trava de outro bloco não entra');
});
test('linha fixada não é atropelada: mede quanto a vizinha de fora entrou nela',()=>{
  const o=pilha();A.set(o);
  assert.equal(A.invasaoDasFixadas('pilha'),0,'sem fixação não há o que medir');
  A.fixaAnel('pilha',1);
  assert.equal(A.invasaoDasFixadas('pilha'),0,'berma de 8 m: nada entrou');
  const an=o.pilha.design.aneis;
  an[2].P[0]={x:-45,y:-45,si:0};assert.equal(A.invasaoDasFixadas('pilha'),0,'berma mais estreita ainda é berma');
  an[2].P[0]={x:-34,y:-34,si:0};{const v=A.invasaoDasFixadas('pilha');assert(v>=6&&v<9,'canto 6 m para dentro da fixada (e o canto dela 8,5 m para fora da vizinha): '+v);}
  // o desenho de antes do arrasto entra na conta pelo parâmetro (a prévia já mexeu no anel)
  assert.equal(A.invasaoDasFixadas('pilha',{idx:2,P:quad(48,10,'crista').P}),0);
  an[2]=quad(30,10,'crista');assert(A.invasaoDasFixadas('pilha')>=10,'a vizinha inteira por dentro da fixada');
});

test('lado livre × lado congelado: cada junta semeia o seu bloco, e os vértices de arrastar são os do contorno dele',()=>{
  const o=pilha();A.set(o);
  assert.equal(A.familiaDoAnel('pilha',0),null,'sem junta, tudo nasce da linha desenhada');
  const t=A.fixaAnel('pilha',1);                       // junta na borda de dentro da berma (geração 2)
  assert.equal(A.familiaDoAnel('pilha',1),null,'a borda de fora da berma continua da linha desenhada');
  assert.equal(A.familiaDoAnel('pilha',2),t);assert.equal(A.familiaDoAnel('pilha',3),t,'dali para dentro, o contorno da junta');
  assert.equal(A.alcasDoAnel('pilha',0).length,4);
  // apagar um vértice no contorno da junta: o gerador repõe o ponto da linha desenhada na linha,
  // mas ele deixa de ser vértice de arrastar do bloco de dentro — e o bloco de fora nem sabe
  for(const L of [t.S,t.Sin])L.splice(L.findIndex(q=>q.si===2),1);
  assert.deepEqual([...A.alcasDoAnel('pilha',1)].map(q=>q.si),[0,1,3]);assert.deepEqual([...A.alcasDoAnel('pilha',0)].map(q=>q.si),[0,1,3]);
  assert.equal(A.alcasDoAnel('pilha',2).length,4,'a linha de fora da berma tem os quatro');
  // o desenho final da junta é regravado depois de mexer no contorno
  A.soltaPinos(t);assert.equal(t.P,null);A.repinaJuntas('pilha');assert.equal(t.P.length,4);assert.notEqual(t.P,o.pilha.design.aneis[1].P);
});
test('transporte: o campo de deslocamento de uma linha (antes → depois) leva junto quem está ao lado',()=>{
  const q=(m)=>[[-m,-m],[m,-m],[m,m],[-m,m]].map(p=>({x:p[0],y:p[1]}));
  const R0=q(40),R1=q(40);R1[1]={x:46,y:-43};         // um canto puxado 6 m para leste e 3 m para sul
  const F=A.campoEntre(R0,R1);
  const perto=(v,x,y)=>assert(Math.abs(v.x-x)<1e-6&&Math.abs(v.y-y)<1e-6,JSON.stringify(v));
  perto(F({x:40,y:-40}),6,-3);perto(F({x:-40,y:-40}),0,0);perto(F({x:-40,y:40}),0,0);
  perto(F({x:0,y:-48}),3,-1.5);                        // meio da aresta, 8 m para fora (a outra borda da berma): metade
  perto(F({x:48,y:0}),3,-1.5);
  // vértice apagado (formas com contagens diferentes): cada ponto vai para o mais próximo da forma nova
  const tri=[R0[0],R0[1],R0[3]],G=A.campoEntre(R0,tri);
  perto(G({x:-40,y:-40}),0,0);perto(G({x:40,y:40}),-40,-40);
});
test('cruzamentos entre linhas vizinhas: o que não pode aumentar depois de uma edição',()=>{
  const d=pilha().pilha.design;assert.equal(A.cruzamentosDoDesign(d),0);
  d.aneis[1].P[0]={x:-60,y:-60,si:0};assert(A.cruzamentosDoDesign(d)>=2,'o canto do pé passou por cima da crista de fora');
});

test('todo canto do contorno da junta é vértice de arrastar: os que o afastamento criou ganham rótulo próprio',()=>{
  const o=pilha();A.set(o);
  // o pé@10 com um canto a mais, sem rótulo (duas arestas que passaram a se encontrar no afastamento)
  const a=o.pilha.design.aneis[1];a.Sk.splice(2,0,{x:40,y:0});a.P.splice(2,0,{x:40,y:0});
  assert.equal(A.alcasDoAnel('pilha',1).length,4,'antes da junta: só os vértices da linha desenhada');
  const t=A.fixaAnel('pilha',1);
  assert.equal(t.S.length,5);assert(t.S.every(q=>q.si!=null),'nenhum canto sem rótulo');
  const novo=t.S[2].si;assert(novo>=1e6,'fora da faixa dos índices da linha desenhada: '+novo);
  assert.equal(t.Sin[2].si,novo,'o mesmo rótulo na semente do bloco de dentro');
  assert.equal(t.P,null,'o desenho final é refeito, para levar o rótulo');
  // depois do regen o anel traz o rótulo, e o canto aparece como vértice
  a.P[2].si=novo;A.repinaJuntas('pilha');
  assert.deepEqual([...A.alcasDoAnel('pilha',1)].map(q=>q.si),[0,1,novo,2,3]);
  // rotular de novo não muda nada; um canto novo sem rótulo continua a contagem
  const antes=JSON.stringify(t.S);A.rotulaJunta(t);assert.equal(JSON.stringify(t.S),antes);
  t.S.push({x:0,y:41});t.Sin.push({x:0,y:41});A.rotulaJunta(t);assert.equal(t.S.at(-1).si,novo+1);assert.equal(t.Sin.at(-1).si,novo+1);
});
