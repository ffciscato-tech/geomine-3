/* Aba Cava — quadro da Seção A–A′ (o botão de linha da barra de baixo; a régua mede): faixa de cotas, escalas e medidas.
   A função é tirada do próprio arquivo do motor; só números sintéticos. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fonte=fs.readFileSync(path.join(__dirname,'cava-pilha-v106.html'),'utf8'),ini=fonte.indexOf('function quadroDaSecao('),fim=fonte.indexOf('function desenhaSecPainel(',ini);
assert(ini>0&&fim>ini,'quadroDaSecao no motor');
const ctx={};vm.createContext(ctx);vm.runInContext(fonte.slice(ini,fim)+';this.quadroDaSecao=quadroDaSecao;',ctx);
const Q=(L,zp,zt,base,W=1100,H=190)=>ctx.quadroDaSecao(L,zp,zt,base,W,H);
const linha=(n,f)=>Array.from({length:n+1},(_,i)=>f(i/n));

test('linha curta no alto da pilha: nem a cota de trabalho, 90 m abaixo, nem o terreno, 25 m abaixo, achatam a figura',()=>{
  // o caso do print: 19 m sobre a berma da cota 405 (com 0,8 m de desnível), terreno uns 25 m abaixo, cota de trabalho 315
  const q=Q(19,linha(40,t=>405-.8*t),linha(40,t=>379+2*t),315);
  assert.equal(q.mostraBase,false,'a cota de trabalho fica fora da figura');
  assert.equal(q.terrenoFora,true,'com o terreno a figura viraria uma coluna estreita: fica só o projeto, e o terreno vai para o título');
  assert(q.zMin>402&&q.zMin<404.2&&q.zMax>405&&q.zMax<407,'faixa do projeto: '+q.zMin+' a '+q.zMax);
  assert(q.ev>=1,'nunca achatada (antes saía EV 0,04×)');assert(Math.abs(q.escV-q.escH*q.ev)<1e-9);
  assert(q.escH*19>.9*(1100-52-16),'a linha ocupa a largura do painel');
  assert.deepEqual([...q.projeto].map(v=>+v.toFixed(2)),[404.2,405]);assert.deepEqual([...q.terreno],[379,381]);
  assert(Math.abs(q.dz+.8)<1e-9);assert(Math.abs(q.incl+.8/19*100)<1e-9);assert.equal(q.doProjeto,true);
});
test('projeto e terreno próximos: os dois perfis entram, em escala verdadeira',()=>{
  const q=Q(300,linha(60,t=>430-60*t),linha(60,t=>405-45*t),350);
  assert.equal(q.terrenoFora,false);assert(q.zMin<350&&q.zMax>430);assert.equal(q.mostraBase,true);
  assert.equal(q.ev,1);assert(Math.abs(q.escH-q.escV)<1e-9);assert((q.zMax-q.zMin)*q.escV<=190-30-20+1e-6);
  assert(q.x0>52,'figura mais estreita que o painel fica centrada');
});
test('relevo baixo numa linha longa: exagero vertical inteiro, até 10×, e nunca abaixo de 1',()=>{
  const q=Q(600,linha(60,t=>400+3*t),linha(60,t=>398+2*t),NaN);
  assert(q.ev>1&&q.ev<=10&&Number.isInteger(q.ev));assert(Math.abs(q.escV-q.escH*q.ev)<1e-9);
  assert((q.zMax-q.zMin)*q.escV<=190-30-20+1e-6,'cabe na altura do painel');
  assert(Math.abs(q.dz-3)<1e-9);assert(Math.abs(q.incl-.5)<1e-9);
  const plano=Q(5000,linha(60,()=>400),linha(60,()=>399.8),NaN);assert.equal(plano.ev,10);
});
test('cota de trabalho perto do perfil entra na faixa; desnível pelo terreno quando a ponta sai do projeto',()=>{
  const zp=linha(50,t=>t<.6?350-20*t:NaN),zt=linha(50,t=>330-8*t),q=Q(120,zp,zt,325);
  assert.equal(q.mostraBase,true);assert(q.zMin<322&&q.zMax>350);
  assert.equal(q.doProjeto,false,'A′ está fora do projeto');assert(Math.abs(q.dz-(-8))<1e-9);assert(Math.abs(q.incl-(-8/120*100))<1e-9);
});
test('sem MDT e sem projeto: nada quebra',()=>{
  const so=Q(80,linha(20,t=>300+10*t),linha(20,()=>NaN),300);
  assert.equal(so.terreno,null);assert.deepEqual([...so.projeto],[300,310]);assert.equal(so.mostraBase,true);assert(Math.abs(so.dz-10)<1e-9);
  const nada=Q(80,linha(20,()=>NaN),linha(20,()=>NaN),NaN);
  assert.equal(nada.projeto,null);assert.equal(nada.terreno,null);assert(Number.isNaN(nada.dz));assert(Number.isFinite(nada.zMin)&&nada.zMax>nada.zMin&&nada.escV>0);
});
