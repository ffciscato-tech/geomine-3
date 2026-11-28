/* Publicador — contas do visualizador entregue ao cliente. Só superfícies sintéticas. */
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
function carrega(){
  const ctx={console,Buffer}; ctx.window=ctx; vm.createContext(ctx);
  for(const f of ['publisher-pack.js','viewer-core.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,f),'utf8'),ctx,{filename:f});
  return {P:ctx.GeoMinePublisherPack, C:ctx.GeoMinePubCore};
}
const perto=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,(msg||'')+' esperado '+b+', veio '+a);
/* grade nc×nr com célula cel; a função dá a cota em (x leste, y norte) reais */
function grade(P,C,fz,o){
  o=Object.assign({nc:41,nr:31,cel:2,x0:1000,y0:5060,id:'s1',nome:'Terreno',papel:'terreno'},o||{});
  const z=new Float32Array(o.nc*o.nr);
  for(let r=0;r<o.nr;r++) for(let c=0;c<o.nc;c++) z[r*o.nc+c]=fz(o.x0+c*o.cel,o.y0-r*o.cel);
  const d=P.superficie({id:o.id,nome:o.nome,papel:o.papel,cor:o.cor,nc:o.nc,nr:o.nr,dx:o.cel,dy:o.cel,x0:o.x0,y0:o.y0,z},[0,0]);
  return C.superficie(JSON.parse(JSON.stringify(d)));
}

test('as cotas voltam da gravação em 16 bits com erro de milímetros e os furos continuam furos',()=>{
  const {P,C}=carrega();
  const s=grade(P,C,(x,y)=>(x>1030&&x<1036&&y>5020&&y<5026)?NaN:300+0.5*(x-1000)+0.25*(y-5000));
  perto(C.alturaEm(s,1010,5030),300+5+7.5,0.004);
  perto(C.alturaEm(s,1013.3,5041.7),300+0.5*13.3+0.25*41.7,0.004,'dentro da célula');
  assert.ok(Number.isNaN(C.alturaEm(s,1033,5023)),'furo');
  assert.ok(Number.isNaN(C.alturaEm(s,999,5030)),'fora da malha');
  assert.ok(Number.isNaN(C.alturaEm(s,1010,5061)),'fora da malha (norte)');
});

test('inclinação do terreno no ponto: plano de 1V:2H caindo para leste',()=>{
  const {P,C}=carrega(), s=grade(P,C,(x,y)=>400-0.5*(x-1000));
  const r=C.inclinacaoEm(s,1040,5030);
  assert.equal(r.metodo,'3x3');
  perto(r.pct,50,0.05); perto(r.graus,Math.atan(0.5)*180/Math.PI,0.03); perto(r.razao,2,0.003); perto(r.caimento,90,0.05,'cai para leste');
  assert.equal(C.talude(r.razao),'1V : 2,00H'); assert.equal(C.rumo(r.caimento),'L (90°)');
  /* subindo para o norte ⇒ cai para o sul */
  perto(C.inclinacaoEm(grade(P,C,(x,y)=>300+0.2*(y-5000)),1040,5030).caimento,180,0.05);
  /* na borda da malha usa a face */
  assert.equal(C.inclinacaoEm(s,1000.4,5030).metodo,'face'); perto(C.inclinacaoEm(s,1000.4,5030).pct,50,0.05);
  assert.equal(C.inclinacaoEm(s,900,5030),null);
});

test('o raio do toque encontra o terreno onde ele está, de cima e de lado',()=>{
  const {P,C}=carrega(), s=grade(P,C,(x,y)=>350+0.3*(x-1000));
  const vertical=C.intersecaoRaio([s],[1025.5,5031.25,900],[0,0,-1],5000);
  perto(vertical.x,1025.5,1e-6); perto(vertical.y,5031.25,1e-6); perto(vertical.z,350+0.3*25.5,0.004);
  /* raio inclinado vindo de sudoeste: o ponto achado está sobre o raio E sobre o terreno */
  const o=[980,4990,420], dir=[0.6,0.4,-0.39], m=Math.hypot(...dir), d=dir.map(v=>v/m), h=C.intersecaoRaio([s],o,d,5000);
  assert.ok(h); perto(h.z,C.alturaEm(s,h.x,h.y),1e-6); perto(o[2]+d[2]*h.t,h.z,0.01,'sobre o raio');
  perto(h.x,1060,0.05,'conta à mão: 420 − 0,39t = 344 + 0,18t ⇒ t = 133,3'); perto(h.y,5043.33,0.05);
  /* o mesmo raio apontado para fora da malha não acha nada */
  assert.equal(C.intersecaoRaio([s],o,[0.6/1.0,0.7,-0.39].map((v,i,a)=>v/Math.hypot(...a)),5000),null);
  /* duas superfícies: vale a primeira que o raio encontra (a de cima) */
  const pilha=grade(P,C,(x,y)=>(x>1020&&x<1060&&y>5010&&y<5050)?380:NaN,{id:'s2',nome:'Pilha',papel:'projeto'});
  assert.equal(C.intersecaoRaio([s,pilha],[1040,5030,900],[0,0,-1],5000).sup.id,'s2');
  assert.equal(C.intersecaoRaio([s,pilha],[1005,5030,900],[0,0,-1],5000).sup.id,'s1');
  assert.equal(C.intersecaoRaio([s],[900,5030,900],[0,0,-1],5000),null,'fora da malha não acha nada');
});

test('inclinação entre dois pontos: distâncias, desnível, porcentagem, graus e talude',()=>{
  const {C}=carrega();
  const r=C.doisPontos({x:0,y:0,z:100},{x:30,y:40,z:125});
  perto(r.dh,50,1e-9); perto(r.dv,25,1e-9); perto(r.d3,Math.hypot(50,25),1e-9); perto(r.pct,50,1e-9); perto(r.graus,26.565,0.001); perto(r.razao,2,1e-9);
  perto(r.azimute,36.870,0.001); assert.equal(r.sobe,true); assert.equal(C.talude(r.razao),'1V : 2,00H');
  const desce=C.doisPontos({x:0,y:0,z:100},{x:0,y:-20,z:90}); perto(desce.pct,-50,1e-9); perto(desce.azimute,180,1e-9); assert.equal(desce.sobe,false);
  assert.equal(C.talude(C.doisPontos({x:0,y:0,z:1},{x:5,y:0,z:1}).razao),'plano');
});

test('perfil: bancada de 10 m com face de 1V:1,5H entre dois patamares',()=>{
  const {P,C}=carrega();
  /* patamar a 300 até x=1020; face subindo 10 m em 15 m; patamar a 310 */
  const fz=x=>x<=1020?300:(x>=1035?310:300+(x-1020)/1.5);
  const s=grade(P,C,(x,y)=>fz(x),{cel:1,nc:61,nr:21,y0:5020});
  const r=C.perfil([s],{x:1005,y:5010},{x:1055,y:5010},2000);
  perto(r.dh,50,1e-9); assert.equal(r.series.length,1);
  const q=r.series[0];
  perto(q.desnivel,10,0.01); perto(q.mediaPct,20,0.05); perto(q.maxPct,100/1.5,0.6,'inclinação da face'); perto(q.maxGraus,33.69,0.3);
  assert.ok(q.maxEm>15&&q.maxEm<30,'a máxima cai na face');
  /* superfície sem dado no caminho não entra; ponto repetido não tem perfil */
  const longe=grade(P,C,()=>500,{id:'s9',x0:9000});
  assert.equal(C.perfil([s,longe],{x:1005,y:5010},{x:1055,y:5010}).series.length,1);
  assert.equal(C.perfil([s],{x:1005,y:5010},{x:1005,y:5010}),null);
});

test('superfície de cima no ponto e rampa de cores',()=>{
  const {P,C}=carrega(), terreno=grade(P,C,()=>300), pilha=grade(P,C,(x)=>x>1030?340:NaN,{id:'s2',papel:'projeto',nome:'Pilha'});
  assert.equal(C.topoEm([terreno,pilha],1050,5030).sup.id,'s2'); assert.equal(C.topoEm([terreno,pilha],1010,5030).sup.id,'s1');
  assert.equal(C.topoEm([terreno],0,0),null);
  for(const t of [0,0.3,0.7,1,NaN,-2,5]){ const k=C.rampa(t); assert.equal(k.length,3); assert.ok(k.every(v=>v>=0&&v<=1)); }
  assert.equal(C.fmt(1234.5678,2),'1.234,57'); assert.equal(C.fmt(NaN,1),'—'); assert.equal(C.fmt(Infinity,1),'∞');
});
