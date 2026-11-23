/* Aba Cava — lado congelado na seleção de linha (os dois ❄): regras tiradas do próprio motor.
   Só anéis sintéticos (quadrados concêntricos), sem dado de projeto. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fonte=fs.readFileSync(path.join(__dirname,'cava-pilha-v106.html'),'utf8');
const trecho=(a,b)=>{const i=fonte.indexOf(a),f=fonte.indexOf(b,i);assert(i>0&&f>i,'trecho do motor: '+a);return fonte.slice(i,f);};
const ctx={};vm.createContext(ctx);
vm.runInContext('const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)); let objs={}, travaSk=null, congelada=null;'
  +trecho('function areaAssinada(','function garanteCCW(')+trecho('function cumulativo(','function distAoAnel(')+trecho('function distAoAnel(','\n}\n')+'\n}\n'
  +trecho('function travasFixas(','// grava/limpa o esqueleto da string congelada')
  +trecho('function parDeBermaDoLado(','function botoesDeLado(')
  +';this.api={travasFixas,travaDe,fixaAnel,soltaAnel,invasaoDasFixadas,parDeBermaDoLado,bermaDaLinha,planoDoLado,familiaDoAnel,alcasDoAnel,campoEntre,cruzamentosDoDesign,repinaJuntas,soltaPinos,rotulaJunta,contornoSeCruza,saneiaJunta,rotulosNoDesenho,juntaDoLado,acompanhaParalelo,transportaParaFora,taludeApertado,anelMudou,distAoAnel,set:(o,t)=>{objs=o;travaSk=t||null;},objs:()=>objs};',ctx);
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
  assert.equal(t.P.length,5,'o desenho gravado da linha fica como estava (refazê-lo deixava a vizinha empurrá-la)');
  assert.equal(t.P[2].si,novo,'e o ponto dele que coincide com o canto leva o mesmo rótulo');
  // no anel do desenho o canto aparece como vértice assim que traz o rótulo
  a.P[2].si=novo;
  assert.deepEqual([...A.alcasDoAnel('pilha',1)].map(q=>q.si),[0,1,novo,2,3]);
  // rotular de novo não muda nada; um canto novo sem rótulo continua a contagem
  const antes=JSON.stringify(t.S);A.rotulaJunta(t);assert.equal(JSON.stringify(t.S),antes);
  t.S.push({x:0,y:41});t.Sin.push({x:0,y:41});A.rotulaJunta(t);assert.equal(t.S.at(-1).si,novo+1);assert.equal(t.Sin.at(-1).si,novo+1);
});

test('vértice não some: contorno dobrado sobre si mesmo é detectado, e o que já está gravado assim é saneado',()=>{
  // octógono; depois o vértice 1 é levado para além da aresta 4–5 (a linha passa por cima dela mesma)
  const oct=[[30,0],[21,21],[0,30],[-21,21],[-30,0],[-21,-21],[0,-30],[21,-21]].map((p,i)=>({x:p[0],y:p[1],si:i}));
  assert.equal(A.contornoSeCruza(oct),false);
  const dobrado=oct.map(q=>({...q}));dobrado[1]={x:-40,y:-14,si:1};
  assert.equal(A.contornoSeCruza(dobrado),true);
  const t={g:2,S:dobrado.map(q=>({...q})),Sin:dobrado.map(q=>({...q})),P:[{x:0,y:0}],projecaoEntrada:{}};
  assert.equal(A.saneiaJunta(t),true);
  assert.equal(A.contornoSeCruza(t.S),false,'o laço saiu do contorno');
  assert(t.S.length<dobrado.length+2&&t.S.length>=4);
  assert(t.S.some(q=>q.si==null),'os cruzamentos entram como cantos novos (ganham rótulo em seguida)');
  assert.equal(JSON.stringify(t.Sin),JSON.stringify(t.S),'a semente do bloco de dentro acompanha');assert.equal(t.P,null);
  A.rotulaJunta(t);assert(t.S.every(q=>q.si!=null));
  assert.equal(A.saneiaJunta(t),false,'contorno são não é mexido');
  // quais vértices do contorno o desenho mostra: é o que não pode diminuir depois de uma edição
  const r0=t.S[0].si,r1=t.S[1].si;
  const d={aneis:[{P:[]},{P:[{x:0,y:0,si:r0},{x:1,y:0,si:-7},{x:2,y:0},{x:3,y:0,si:r1}]},{P:[]},{P:[]}]};
  assert.deepEqual([...A.rotulosNoDesenho(d,t)].sort(),[r0,r1].sort(),'só os rótulos que valem no contorno; ponto sem rótulo ou de outra família não conta');
});

test('rótulo é identidade: dois pontos do contorno com o rótulo do mesmo vértice (canto chanfrado) não convivem',()=>{
  const o=pilha();A.set(o);
  const a=o.pilha.design.aneis[1];a.Sk.splice(2,0,{x:40,y:2,si:1});a.P.splice(2,0,{x:40,y:2,si:1});   // segundo ponto com o rótulo 1
  const t=A.fixaAnel('pilha',1),rot=t.S.map(q=>q.si);
  assert.equal(new Set(rot).size,rot.length,'todos diferentes: '+rot);
  assert.equal(rot[1],1,'o primeiro fica com o rótulo');assert(rot[2]>=1e6,'o segundo ganha um próprio');
  assert.equal(t.P[2].si,rot[2],'no desenho gravado também');assert.equal(t.Sin[2].si,rot[2]);
});
test('com um lado congelado, canto da linha livre sem vértice próprio também é de arrastar',()=>{
  const o=pilha();A.set(o);
  const a=o.pilha.design.aneis[2];                      // crista@10: a linha livre do ❄ de dentro
  a.Sk.splice(1,0,{x:0,y:-49});a.P.splice(1,0,{x:0,y:-49});
  assert.equal(A.alcasDoAnel('pilha',2).length,4,'sem lado congelado: só os vértices da linha desenhada, como sempre');
  assert.equal(A.alcasDoAnel('pilha',2,true).length,5,'com lado congelado: o canto criado pelo afastamento entra');
  a.P.splice(3,0,{x:48,y:10});                           // ponto do entalhe da rampa: não é canto do esqueleto
  assert.equal(A.alcasDoAnel('pilha',2,true).length,5);
});

test('❄ de dentro: o contorno próprio do lado livre fica no pé do talude da linha livre',()=>{
  // três bancos, de dentro para fora: crista@20 | pé@10, crista@10 | pé@0... aqui com mais uma berma por fora
  const an=[quad(20,30,'crista'),quad(40,20,'pe'),quad(48,20,'crista'),quad(68,10,'pe'),quad(76,10,'crista'),quad(96,0,'pe')];
  assert.equal(A.juntaDoLado(an,1,'fora'),1,'❄ de fora: a própria linha livre (borda de dentro da berma)');
  assert.equal(A.juntaDoLado(an,2,'fora'),1);
  assert.equal(A.juntaDoLado(an,1,'dentro'),3,'❄ de dentro: a linha livre é a crista (2); o pé do talude dela é o 3');
  assert.equal(A.juntaDoLado(an,3,'dentro'),-1,'na berma de fora o pé do talude é a própria linha desenhada: a semente já é ela');
});

test('pontos da rampa: com um lado congelado, todo ponto do desenho em que a linha vira é de arrastar',()=>{
  const o=pilha();A.set(o);
  const a=o.pilha.design.aneis[2];                      // crista@10, quadrado de ±48
  // entalhe da rampa na aresta de baixo: a linha entra 6 m e volta (quatro pontos que não são do esqueleto)
  a.P.splice(1,0,{x:-10,y:-48},{x:-10,y:-42},{x:10,y:-42},{x:10,y:-48});
  assert.equal(A.alcasDoAnel('pilha',2).length,4,'sem lado congelado nada muda');
  const H=A.alcasDoAnel('pilha',2,true);
  assert.equal(H.length,8,'os quatro cantos do entalhe entram');
  a.P.splice(3,0,{x:0,y:-42});                           // ponto no meio de um trecho reto do entalhe: não é canto
  assert.equal(A.alcasDoAnel('pilha',2,true).length,8);
  a.P.splice(1,0,{x:-10.1,y:-48});                       // ponto colado num canto que já é de arrastar: não duplica
  assert.equal(A.alcasDoAnel('pilha',2,true).length,8);
});

/* As linhas de fora acompanham a linha livre MANTENDO A DISTÂNCIA (print IMG_0260: a berma seguinte
   ficava espremida). Quadrados sintéticos: de dentro para fora, o contorno de um banco e o do seguinte. */
const sq=(m)=>[[-m,-m],[m,-m],[m,m],[-m,m]].map((p,i)=>({x:p[0],y:p[1],si:i}));
const dReta=(p,a,b)=>Math.abs((p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x))/Math.hypot(b.x-a.x,b.y-a.y);
test('linhas de fora paralelas: o canto de fora em frente ao canto puxado guarda a distância às duas arestas dele',()=>{
  const s0=sq(20),s1=sq(20),L0=sq(43);s1[1]={x:30,y:-30,si:1};        // canto sudeste puxado 14 m para fora, na diagonal
  const r=A.acompanhaParalelo(s0,s1,L0);
  assert.equal(r.novos.length,0,'cada canto de dentro já tem o seu par de fora');
  const p=r.pos[1];
  assert(Math.abs(dReta(p,s1[0],s1[1])-23)<1e-6&&Math.abs(dReta(p,s1[1],s1[2])-23)<1e-6,'23 m das duas arestas novas: '+JSON.stringify(p));
  assert(Math.hypot(p.x-43,p.y+43)>Math.hypot(10,10),'num canto saliente a linha de fora anda MAIS que a puxada — é o que a mantém paralela');
  // os vizinhos não andaram, mas a aresta que chega neles girou: o par de fora continua a 23 m dela e da outra
  assert(Math.abs(dReta(r.pos[0],s1[0],s1[1])-23)<1e-6&&Math.abs(r.pos[0].x+43)<1e-6,JSON.stringify(r.pos[0]));
  assert(Math.abs(dReta(r.pos[2],s1[1],s1[2])-23)<1e-6&&Math.abs(r.pos[2].y-43)<1e-6,JSON.stringify(r.pos[2]));
  assert.deepEqual([r.pos[3].x,r.pos[3].y],[-43,43],'longe do que mexeu nada muda');
  // a largura entre as duas linhas (talude + berma) não cai em lugar nenhum
  const fora=r.pos.map(q=>({x:q.x,y:q.y}));
  for(const v of s1) assert(A.distAoAnel(fora,v)>23-1e-6,'a linha de fora não chega mais perto que antes');
  // nada mexeu ⇒ nada muda
  assert.deepEqual(A.acompanhaParalelo(s0,sq(20),L0).pos.map(q=>[q.x,q.y]),L0.map(q=>[q.x,q.y]));
});
test('linhas de fora paralelas: onde a de dentro tem um vértice que mexeu e a de fora não tem nenhum em frente, ela ganha um',()=>{
  const meio=(m)=>[[-m,-m],[0,-m],[m,-m],[m,m],[-m,m]].map((p,i)=>({x:p[0],y:p[1],si:i}));
  const s0=meio(20),s1=meio(20),L0=sq(43);s1[1]={x:0,y:-30,si:1};      // vértice do meio do lado sul puxado 10 m para fora
  const r=A.acompanhaParalelo(s0,s1,L0);
  assert.equal(r.novos.length,1);
  const e=r.novos[0];
  assert.equal(e.i,0,'entra depois do vértice 0 da linha de fora');assert(Math.abs(e.x0)<1e-6&&Math.abs(e.y0+43)<1e-6,'nasce na projeção: '+JSON.stringify(e));
  assert(Math.abs(e.x)<1e-6&&Math.abs(dReta(e,s1[0],s1[1])-23)<1e-6&&Math.abs(dReta(e,s1[1],s1[2])-23)<1e-6,'e fica a 23 m das duas arestas novas: '+JSON.stringify(e));
  // os cantos de fora ao lado giram com a aresta e continuam a 23 m dela
  assert(Math.abs(dReta(r.pos[0],s1[0],s1[1])-23)<1e-6&&Math.abs(dReta(r.pos[1],s1[1],s1[2])-23)<1e-6);
});
test('linhas de fora paralelas: canto reentrante (o de dentro é que se projeta no de fora) e ponto no meio de uma aresta',()=>{
  // contorno em L: o canto (0,0) é reentrante visto de fora; o de fora tem o canto dele em (-23,-23)... não: fica do lado de fora do L
  const L=[[-40,-40],[40,-40],[40,0],[0,0],[0,40],[-40,40]].map((p,i)=>({x:p[0],y:p[1],si:i}));
  const F=[[-63,-63],[63,-63],[63,23],[23,23],[23,63],[-63,63]].map((p,i)=>({x:p[0],y:p[1],si:i}));
  const L1=L.map(q=>({...q}));L1[3]={x:6,y:6,si:3};                    // o canto reentrante puxado 8,5 m para fora
  const r=A.acompanhaParalelo(L,L1,F);
  assert.equal(r.novos.length,0,'o canto de fora (23,23) é o par dele');
  assert(Math.abs(dReta(r.pos[3],L1[2],L1[3])-23)<1e-6&&Math.abs(dReta(r.pos[3],L1[3],L1[4])-23)<1e-6,JSON.stringify(r.pos[3]));
  // ponto de fora no meio de uma aresta que girou: mesma posição ao longo dela, mesma distância
  const s0=sq(20),s1=sq(20);s1[1]={x:20,y:-30,si:1};
  const G=[[-43,-43],[0,-43],[43,-43],[43,43],[-43,43]].map((p,i)=>({x:p[0],y:p[1],si:i}));
  const g=A.acompanhaParalelo(s0,s1,G);
  assert(Math.abs(dReta(g.pos[1],s1[0],s1[1])-23)<1e-6,'continua a 23 m da aresta: '+JSON.stringify(g.pos[1]));
});
test('transporte para fora: cada banco de fora acompanha o de dentro dele, até a linha desenhada',()=>{
  const T={g:4,S:sq(20),Sin:sq(20),P:[{x:0,y:0}]},J={g:2,S:sq(43),Sin:sq(43),P:[{x:0,y:0}],projecaoEntrada:{}};
  const o={pilha:{base:[[-66,-66],[66,-66],[66,66],[-66,66]].map(p=>({x:p[0],y:p[1]})),bermas:{_travas:[T,J]}}};A.set(o);
  const S0=sq(20);T.S[1]={x:30,y:-30,si:1};T.Sin[1]={x:30,y:-30,si:1};
  assert.equal(A.transportaParaFora('pilha',T,S0,null),true);
  assert(Math.abs(dReta(J.S[1],T.S[0],T.S[1])-23)<1e-3&&Math.abs(dReta(J.S[1],T.S[1],T.S[2])-23)<1e-3,'o banco seguinte fica a 23 m do que andou');
  assert.deepEqual(J.Sin.map(q=>[q.x,q.y]),J.S.map(q=>[q.x,q.y]),'as duas cópias do contorno andam juntas');
  assert.equal(J.P,null,'o desenho dele é refeito');
  const b=o.pilha.base;
  assert(Math.abs(dReta(b[1],J.S[0],J.S[1])-23)<2e-3&&Math.abs(dReta(b[1],J.S[1],J.S[2])-23)<2e-3,'e a linha desenhada a 23 m dele: '+JSON.stringify(b[1]));
  assert.deepEqual([b[3].x,b[3].y],[-66,66]);
});
test('o talude não fica mais íngreme e o lado congelado não muda: as duas medidas que recusam uma edição',()=>{
  const anel=(P,z)=>({z,P:P.map(p=>({x:p[0],y:p[1]}))}),q=(m)=>[[-m,-m],[m,-m],[m,m],[-m,m]];
  const bom={aneis:[anel(q(20),10),anel(q(35),0)]};                    // talude de 15 m em toda a volta
  assert.equal(A.taludeApertado(bom,15),0);
  const ruim={aneis:[anel([[-20,-20],[20,-20],[20,20],[-20,20]],10),anel([[-35,-35],[-5,-35],[-5,-24],[5,-24],[5,-35],[35,-35],[35,35],[-35,35]],0)]};
  const t=A.taludeApertado(ruim,15);assert(t>20&&t<30,'o trecho em que a linha de fora chega a menos de 9 m (26 m de linha): '+t);
  assert.equal(A.taludeApertado({aneis:[anel(q(20),10),anel(q(21),10)]},15),0,'berma não é talude');
  const P=q(20).map(p=>({x:p[0],y:p[1]})),Q=P.map(v=>({...v}));
  assert.equal(A.anelMudou(P,Q),false);Q.splice(1,0,{x:0,y:-20});assert.equal(A.anelMudou(P,Q),false,'um ponto a mais sobre a mesma linha não muda a forma');
  Q[1]={x:0,y:-20.2};assert.equal(A.anelMudou(P,Q),true);assert.equal(A.anelMudou(P,Q,0.3),false,'dentro da folga');
});

