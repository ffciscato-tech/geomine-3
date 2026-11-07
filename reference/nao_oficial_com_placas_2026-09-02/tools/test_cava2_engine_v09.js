#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert/strict');
const html=fs.readFileSync(path.resolve(__dirname,'../src/modules/mining/cava2/cava-pilha-v09.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(script,'script do motor Cava/DCE ausente');

const defaults={
  cava_H:'120',cava_banco:'10',cava_face:'75',cava_berma:'8',cava_rampa_larg:'20',cava_rampa_grad:'10',
  pilha_H:'60',pilha_banco:'10',pilha_face:'37',pilha_berma:'6',pilha_rampa_larg:'15',pilha_rampa_grad:'10',
  cava_rampa_dir:'ah',pilha_rampa_dir:'ah'
};
const noop=()=>{},ctx=new Proxy({measureText:s=>({width:String(s).length*7})},{get:(o,k)=>k in o?o[k]:noop}),els={};
function elemento(id){
  if(els[id])return els[id];
  const e={id,value:defaults[id]??'',checked:/_rampa_on$/.test(id),clientWidth:1200,clientHeight:760,
    width:1200,height:760,innerHTML:'',style:{},disabled:false,
    _listeners:{},
    classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},
    addEventListener(type,fn){(this._listeners[type]??=[]).push(fn);},
    dispatch(type,event){for(const fn of this._listeners[type]||[])fn.call(this,event);},
    getBoundingClientRect(){return {left:0,top:0,width:this.clientWidth,height:this.clientHeight};},
    setAttribute:noop,getContext:()=>ctx,setPointerCapture:noop,releasePointerCapture:noop,
    toBlob:noop,click(){if(typeof this.onclick==='function')this.onclick();}};
  return els[id]=e;
}
const eventos=[];
const sandbox={console,Math,Date,JSON,Map,Set,Blob,URL,setTimeout,clearTimeout,
  localStorage:{getItem:()=>null,setItem:noop,removeItem:noop},
  CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}},
  Image:class{},requestAnimationFrame:f=>f(),
  ResizeObserver:class{observe(){}},
  document:{getElementById:elemento,querySelectorAll:()=>[],addEventListener:noop,
    createElement:()=>({click:noop})},
  window:{devicePixelRatio:1,frameElement:{id:'cava2Frame'},addEventListener:noop,
    dispatchEvent:e=>{eventos.push(e.type);return true;}}
};
sandbox.window.window=sandbox.window;
vm.runInNewContext(script,sandbox,{filename:'cava-pilha-v09.html'});
const A=sandbox.window.__api;
assert(A&&typeof A.geraDesign==='function','API geométrica do motor não iniciou');

const eventoPonteiro=(x,y,extra={})=>({clientX:x,clientY:y,offsetX:x,offsetY:y,
  button:0,pointerId:extra.pointerId??1,prevented:false,
  preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...extra});

/* Pan deve usar coordenadas locais estáveis e manter o arraste mesmo depois
   da captura do ponteiro pelo canvas/iframe. */
A.setTool('mover');
const vista0=A.view;
els.cv.dispatch('pointerdown',eventoPonteiro(100,90));
els.cv.dispatch('pointermove',eventoPonteiro(147,119));
els.cv.dispatch('pointerup',eventoPonteiro(147,119));
const vista1=A.view;
assert.equal(vista1.ox,vista0.ox+47,'Pan não deslocou horizontalmente a vista');
assert.equal(vista1.oy,vista0.oy+29,'Pan não deslocou verticalmente a vista');

/* O canvas deve reproduzir a mesma limpeza do Mapa 2D e jamais iniciar um
   segundo subcaminho. Até com um ponto inválido, liga todos os válidos e fecha
   explicitamente a volta. */
const ops=[];
ctx.moveTo=(x,y)=>ops.push(['M',x,y]);ctx.lineTo=(x,y)=>ops.push(['L',x,y]);
ctx.closePath=()=>ops.push(['Z']);
A.tracaAnel([{x:0,y:0},{x:10,y:0},{x:NaN,y:5},{x:10,y:10}], '#000',1,'',1);
assert.equal(ops.filter(o=>o[0]==='M').length,1,'renderizador fragmentou o anel em subcaminhos');
assert.equal(ops.filter(o=>o[0]==='L').length,3,'renderizador omitiu vértice válido ou não fechou o anel');
assert(ops.every(o=>o.length===1||o.slice(1).every(Number.isFinite)),'renderizador enviou coordenada inválida ao canvas');
ctx.moveTo=noop;ctx.lineTo=noop;ctx.closePath=noop;

const base=[];
for(let i=0;i<96;i++){
  const t=i/96*Math.PI*2;base.push({x:300*Math.cos(t),y:210*Math.sin(t)});
}
const p={H:20,banco:10,face:75,berma:8,rampaOn:true,rampaL:20,rampaG:10,dir:1};
const d=A.geraDesign(base,p,'cava',base[0],{});
assert.equal(d.corredores.length,2,'rampa não atravessou as duas bancadas');
const r=d.corredores[0],b1=r.borda1[0],b2=r.borda2[0],anel=d.aneis[0].P;
const perimetroTeste=P=>P.reduce((s,a,i)=>{
  const b=P[(i+1)%P.length];return s+Math.hypot(b.x-a.x,b.y-a.y);
},0);
const dist=(P,q)=>Math.min(...P.map((a,i)=>{
  const b=P[(i+1)%P.length],dx=b.x-a.x,dy=b.y-a.y,L=dx*dx+dy*dy,
    t=L?Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.y-a.y)*dy)/L)):0;
  return Math.hypot(q.x-(a.x+t*dx),q.y-(a.y+t*dy));
}));
assert(dist(anel,b2)<0.5,'o ponto interno da boca não coincide com o limite');
assert(Math.abs(dist(anel,b1)-p.rampaL)<1.5,'a entrada não foi deslocada para fora do limite');

/* A crista/pé continua fechada no modelo de volume, porém sua representação
   termina nas duas bordas da pista e jamais desenha o fechamento transversal
   sobre a rampa. */
const poligonosRampa=d.corredores.map(c=>c.poly),aneisAntes=JSON.stringify(d.aneis.map(a=>a.P)),
  recortes=d.aneis.map(a=>A.recortaLinhaForaRampas(a.P,poligonosRampa,a.cortesRampa));
assert(recortes.some(c=>c.cortado),'nenhuma string foi recortada pela faixa real da rampa');
assert(d.aneis.slice(1).every(a=>Array.isArray(a.cortesRampa)&&a.cortesRampa.length===2),
  'alguma string perdeu a marca dos dois fechamentos artificiais');
assert(recortes.slice(1).every(c=>c.fechamentosRemovidos>=2),
  'algum degrau sólido/tracejado continuou no desenho');
assert(!('encontrosFace' in d),'foram criadas emendas ao longo das bancadas');
const encontro=d.encontroEntrada;
assert(encontro?.anelIndices,'a boca não possui o único encontro de crista e pé');
assert.strictEqual(encontro.ponto,r.borda1[0],
  'o encontro não usa o vértice R externo da boca');
assert.equal(encontro.anelIndices.crista,0,'a crista da entrada veio de outra bancada');
assert.equal(encontro.anelIndices.pe,1,'o pé da entrada veio de outra bancada');
const parteCrista=d.aneis[0].partesEntrada?.find(P=>P.at(-1)===encontro.ponto),
  partePe=d.aneis[1].partesEntrada?.find(P=>P.at(-1)===encontro.ponto);
assert(parteCrista,'o próprio traçado da crista não termina no ponto R');
assert(partePe,'o próprio traçado do pé não termina no mesmo ponto R');
assert.strictEqual(parteCrista.at(-1),partePe.at(-1),
  'crista e pé não compartilham literalmente o mesmo vértice final');
assert(d.aneis.slice(2).every(a=>!a.partesEntrada),
  'uma linha posterior à entrada foi modificada');
for(const recorte of recortes)for(const parte of recorte.partes)for(let i=0;i<parte.length-1;i++){
    const m={x:(parte[i].x+parte[i+1].x)/2,y:(parte[i].y+parte[i+1].y)/2};
    assert(!poligonosRampa.some(poly=>A.dentroDe(poly,m)),'crista/pé publicada ainda cruza a pista');
}
assert.equal(JSON.stringify(d.aneis.map(a=>a.P)),aneisAntes,
  'o recorte visual modificou o anel analítico usado no volume');
const recorteControle=A.recortaLinhaForaRampas(
  [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}],
  [[{x:4,y:-2},{x:6,y:-2},{x:6,y:12},{x:4,y:12}]]);
assert(recorteControle.cortado&&recorteControle.partes.length===2,
  'o recorte não separou uma linha fechada nas duas bordas da pista');
const semDegrau=A.recortaLinhaForaRampas(
  [{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10}],[],
  [{a:{x:10,y:0},b:{x:10,y:10}}]);
assert(semDegrau.cortado&&semDegrau.partes.length===1,
  'o fechamento analítico não foi aberto no desenho');
assert(!semDegrau.partes.some(P=>P.some((p,i)=>i&&
  Math.abs(p.x-10)<1e-8&&Math.abs(P[i-1].x-10)<1e-8)),
  'o degrau transversal continuou presente na polilinha visível');

assert(d.aneis.length>=4,'a geometria anterior das bancadas deixou de ser gerada');
/* Regra principal: somente o índice ZERO da entrada pode mudar. */
assert(r._entradaOriginal&&r._entradaResto,'a entrada original não foi protegida');
assert.strictEqual(r.borda2[0],r._entradaOriginal.borda1,'o ponto selecionado não virou o extremo interno');
for(const chave of ['borda1','borda2','centro']){
  const atual=r[chave],antiga=r._entradaResto[chave];
  assert.equal(atual.length,antiga.length,'a correção acrescentou/removeu pontos em '+chave);
  assert.notStrictEqual(atual[0],antiga[0],'o primeiro vértice não foi ajustado em '+chave);
  for(let i=1;i<atual.length;i++)assert.strictEqual(atual[i],antiga[i],
    'a correção alterou '+chave+'['+i+'] fora da entrada');
}
const tx=r._entradaResto.borda1[1].x-r._entradaOriginal.borda1.x,
  ty=r._entradaResto.borda1[1].y-r._entradaOriginal.borda1.y,
  nx=r.borda2[0].x-r.borda1[0].x,ny=r.borda2[0].y-r.borda1[0].y,
  ortho=Math.abs(tx*nx+ty*ny)/Math.max(1e-9,Math.hypot(tx,ty)*Math.hypot(nx,ny));
assert(ortho<1e-9,'a primeira seção não ficou ortogonal ao ponto selecionado');
assert(Math.abs(Math.hypot(nx,ny)-p.rampaL)<1e-9,'a primeira seção não mede a largura da rampa');
assert(!A.dentroDe(anel,r.borda1[0]),'o extremo exterior da entrada ainda ficou dentro do limite');
assert.strictEqual(r.entradaExterna,r.borda1[0],'R não referencia o primeiro vértice externo');
assert.strictEqual(r.entradaInterna,r.borda2[0],'a boca perdeu o ponto interno original');
assert.strictEqual(r.entradaLimite[0],r.borda2[0],'a crista não parte do limite original');
assert.strictEqual(r.entradaLimite[1],r.borda1[0],'a crista não termina no ponto R comum');
assert(Math.hypot(r.centro[0].x-(r.borda1[0].x+r.borda2[0].x)/2,
  r.centro[0].y-(r.borda1[0].y+r.borda2[0].y)/2)<1e-9,'o eixo não ficou no meio da entrada');
assert.equal(r.borda1.length,r.borda2.length,'as duas bordas da boca ficaram desencontradas');
assert.equal(r.borda1.length,r.centro.length,'o eixo da boca ficou desencontrado das bordas');
assert(!d.corredores[1]._entradaOriginal,'uma bancada posterior foi modificada pela correção da entrada');
assert(!('pontes' in d),'foram recriadas ligações fora da primeira entrada');

/* Não se permite qualquer transformação distribuída: a família original de
   anéis continua usando a emenda do motor e a correção permanece restrita à
   primeira seção verificada acima. */
assert(d.aneis.every(a=>a.P.length>=8),'a restauração da rampa perdeu strings');

/* Somente o limite exterior aceita edição. Um ponto de uma string interna
   não pode ser selecionado, arrastado ou congelado como override. */
A.objs.cava.base=base.map(q=>({...q}));
A.objs.cava.anc={...base[0]};
A.regen();A.setTool('editar');
const idxInterno=Math.min(3,A.objs.cava.design.aneis.length-1),
  anelInterno=A.objs.cava.design.aneis[idxInterno],internoAntes=anelInterno.P.map(q=>({...q}));
let [telaX,telaY]=A.worldToScreen(anelInterno.P[0].x,anelInterno.P[0].y);
els.cv.dispatch('pointerdown',eventoPonteiro(telaX,telaY,{pointerId:2}));
els.cv.dispatch('pointermove',eventoPonteiro(telaX+24,telaY-15,{pointerId:2}));
els.cv.dispatch('pointerup',eventoPonteiro(telaX+24,telaY-15,{pointerId:2}));
assert.equal(Object.keys(A.objs.cava.overrides).length,0,'uma string interna aceitou edição manual');
assert.equal(JSON.stringify(A.objs.cava.design.aneis[idxInterno].P),JSON.stringify(internoAntes),
  'o arraste modificou a linha de pé/string interna');

/* A linha-base também deve ser agarrada diretamente pelos quadrados magenta. */
const outros=A.objs.cava.design.aneis.slice(1).flatMap(a=>a.P);
const bi=A.objs.cava.base.map((p,i)=>{
  const [x,y]=A.worldToScreen(p.x,p.y);
  const folga=Math.min(...outros.map(q=>{const [qx,qy]=A.worldToScreen(q.x,q.y);return Math.hypot(x-qx,y-qy);}));
  return {i,folga};
}).sort((a,b)=>b.folga-a.folga)[0].i;
const bp0={...A.objs.cava.base[bi]},[bx,by]=A.worldToScreen(bp0.x,bp0.y);
els.cv.dispatch('pointerdown',eventoPonteiro(bx,by,{pointerId:3}));
els.cv.dispatch('pointermove',eventoPonteiro(bx+18,by+12,{pointerId:3}));
els.cv.dispatch('pointerup',eventoPonteiro(bx+18,by+12,{pointerId:3}));
assert(Math.hypot(A.objs.cava.base[bi].x-bp0.x,A.objs.cava.base[bi].y-bp0.y)>0.01,
  'arraste do vértice da linha-base não alterou o limite');

/* Duplo clique no “+” da linha-base remove exatamente esse vértice. */
const nBase=A.objs.cava.base.length,bpDel=A.objs.cava.base[bi],
  [dxDel,dyDel]=A.worldToScreen(bpDel.x,bpDel.y);
els.cv.dispatch('dblclick',eventoPonteiro(dxDel,dyDel,{pointerId:4}));
assert.equal(A.objs.cava.base.length,nBase-1,'duplo clique não removeu o vértice do limite');

/* O + fica no trecho, separado dos quadrados originais, e acrescenta um
   vértice entre as duas extremidades com um único clique. */
const nAntesMais=A.objs.cava.base.length;
const trecho=A.objs.cava.base.map((p,i)=>{
  const q=A.objs.cava.base[(i+1)%A.objs.cava.base.length],
    [x,y]=A.worldToScreen(p.x,p.y),[qx,qy]=A.worldToScreen(q.x,q.y);
  return {i,p,q,L:Math.hypot(qx-x,qy-y),x:(x+qx)/2,y:(y+qy)/2};
}).sort((a,b)=>b.L-a.L)[0];
assert(trecho.L>=20,'ensaio não encontrou trecho com botão + visível');
els.cv.dispatch('pointerdown',eventoPonteiro(trecho.x,trecho.y,{pointerId:5}));
assert.equal(A.objs.cava.base.length,nAntesMais+1,'clique no + não acrescentou o vértice intermediário');
const novo=A.objs.cava.base[trecho.i+1];
assert(Math.hypot(novo.x-(trecho.p.x+trecho.q.x)/2,novo.y-(trecho.p.y+trecho.q.y)/2)<1e-8,
  'novo vértice não foi inserido no meio do trecho');

els.b_limpar.onclick();
assert(eventos.includes('cava2:cleared'),'Limpar tudo não notificou a remoção das camadas publicadas');
console.log('OK: Pan funciona e somente o limite externo aceita edição de vértices.');
