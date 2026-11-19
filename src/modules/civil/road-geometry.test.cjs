/* Alinhamentos da estrada: raio por curva (road-curves.js) e os elementos das
   tabelas (road-geometry.js), conferidos contra as rotinas que traçam o eixo e
   o greide. Rodar: node src/modules/civil/road-geometry.test.cjs */
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),test=require('node:test');
const {execFileSync}=require('node:child_process');
const here=__dirname,repo=path.resolve(here,'../../..'),read=name=>fs.readFileSync(path.join(here,name),'utf8');

// road-curves + road-geometry sem DOM (só as funções puras).
const pure={window:{},console};vm.createContext(pure);
vm.runInContext(read('road-curves.js'),pure);vm.runInContext(read('road-geometry.js'),pure);
const curves=pure.civCurvasTangentes,G=pure.window.GeoMineRoadGeometry;
// road-editor com um DOM mínimo: só `vertical` e `initial` são usados aqui.
const ed={window:{},console,document:{getElementById:()=>({})}};vm.createContext(ed);
vm.runInContext(read('road-editor.js'),ed);
const E=ed.window.GeoMineRoadEditor;

const length=pts=>pts.slice(1).reduce((s,p,i)=>s+Math.hypot(p.x-pts[i].x,p.y-pts[i].y),0);
const near=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,(msg||'')+' esperado '+b+' ± '+tol+', veio '+a);
const flat=list=>list.map(p=>({...p,z:0}));
// Traçado em S: curva à direita no PI 1 e à esquerda no PI 2.
const zig=[{x:0,y:0},{x:300,y:0},{x:520,y:260},{x:900,y:260}];

test('raio por curva: sem `r` o traçado é idêntico ao da versão anterior',()=>{
 let before;
 try{before=execFileSync('git',['-C',repo,'show','77e1250:src/modules/civil/road-curves.js'],{encoding:'utf8'});}
 catch(_){return;}                       // sem o histórico do git não há o que comparar
 const old={console};vm.createContext(old);vm.runInContext(before,old);
 for(const [input,radius,spacing,preserve] of [[flat(zig),60,2,true],[flat(zig),90,1.5,true],
  [[{x:0,y:0,z:10},{x:80,y:5,z:12},{x:160,y:-4,z:15},{x:300,y:120,z:22},{x:420,y:130,z:25}],40,2,false]]){
  const a=curves(JSON.parse(JSON.stringify(input)),radius,spacing,preserve),b=old.civCurvasTangentes(JSON.parse(JSON.stringify(input)),radius,spacing,preserve);
  assert.equal(JSON.stringify(a.points),JSON.stringify(b.points));
  assert.equal(a.curves.length,b.curves.length);
 }
});

test('raio por curva: cada PI usa o seu raio e o arco fica na distância certa do centro',()=>{
 const input=flat(zig);input[1].r=120;                 // PI 1 com raio próprio; PI 2 com o geral
 const out=curves(input,60,1,true);
 assert.equal(out.curves.length,2);
 near(out.curves[0].radius,120,1e-12);near(out.curves[1].radius,60,1e-12);
 for(const q of out.curves){
  const onArc=out.points.filter(p=>Math.abs(Math.hypot(p.x-q.cx,p.y-q.cy)-q.radius)<1e-6);
  assert.ok(onArc.length>=3,'pontos do arco do vértice '+q.index);
  near(Math.hypot(q.entry.x-q.cx,q.entry.y-q.cy),q.radius,1e-9,'PC');
  near(Math.hypot(q.exit.x-q.cx,q.exit.y-q.cy),q.radius,1e-9,'PT');
 }
 // O raio maior encurta o eixo em relação ao raio geral nos dois PIs.
 assert.ok(length(out.points)<length(curves(flat(zig),60,1,true).points));
});

test('raio por curva: o raio nunca é reduzido — a mensagem cita o raio pedido',()=>{
 const input=flat(zig);input[1].r=5000;
 assert.throws(()=>curves(input,60,1,true),/curva de 5000 m no vértice 1/);
 // Cada curva cabe sozinha, mas as duas tangentes somadas passam da distância entre os PIs.
 const pair=flat(zig);pair[1].r=400;pair[2].r=400;
 assert.throws(()=>curves(pair,60,1,true),/raios de 400 m e 400 m entre os vértices 1 e 2/);
 const one=flat(zig);one[1].r=400;
 assert.doesNotThrow(()=>curves(one,60,1,true));
});

test('elementos horizontais: T, D, PC, PT e o comprimento batem com o eixo traçado',()=>{
 const input=zig.map(p=>({...p}));input[1].r=120;
 const h=G.horizontalElements(input,60),out=curves(flat(input),60,.25,true);
 assert.equal(h.curves.length,2);assert.equal(h.fits,true);
 const [c1,c2]=h.curves;
 assert.equal(c1.index,1);assert.equal(c2.index,2);
 assert.equal(c1.side,'E');assert.equal(c2.side,'D');   // sobe para o norte (esquerda) e volta para leste (direita)
 near(c1.radius,120,1e-12);near(c2.radius,60,1e-12);assert.equal(c1.own,true);assert.equal(c2.own,false);
 const delta=Math.atan2(260,220);
 near(c1.deflection,delta,1e-12);near(c2.deflection,delta,1e-12);
 near(c1.tangent,120*Math.tan(delta/2),1e-9);near(c1.length,120*delta,1e-9);
 near(c1.pc,300-c1.tangent,1e-9);near(c1.pt,c1.pc+c1.length,1e-9);
 near(c2.pc,c1.pt+Math.hypot(220,260)-c1.tangent-c2.tangent,1e-9);
 near(h.total,h.straight+h.curved,1e-9);
 // O eixo amostrado é uma poligonal inscrita nos arcos: um pouco mais curta, nunca mais longa.
 const sampled=length(out.points);
 assert.ok(sampled<=h.total+1e-9&&h.total-sampled<.02,'analítico '+h.total+' × amostrado '+sampled);
 near(h.minRadius,60,1e-12);
 assert.equal(h.tangents.length,3);near(h.tangents.reduce((s,t)=>s+t.length,0),h.straight,1e-9);
});

test('elementos horizontais: "cabe até" é o limite real da rotina do traçado',()=>{
 const base=zig.map(p=>({...p})),h=G.horizontalElements(base,60);
 for(const q of h.curves){
  const ok=zig.map(p=>({...p})),bad=zig.map(p=>({...p}));
  ok[q.index].r=q.maxRadius*(1-1e-9);bad[q.index].r=q.maxRadius*1.001;
  assert.doesNotThrow(()=>curves(flat(ok),60,2,true),'raio no limite no PI '+q.index);
  assert.equal(G.horizontalElements(ok,60).fits,true);
  assert.throws(()=>curves(flat(bad),60,2,true),/Não há espaço|não comportam/);
  assert.equal(G.horizontalElements(bad,60).fits,false);
  assert.equal(G.horizontalElements(bad,60).curves.find(c=>c.index===q.index).fits,false);
 }
});

test('elementos horizontais: PI em linha reta não vira curva e não muda os números dos outros',()=>{
 const withMid=[zig[0],{x:150,y:0},zig[1],zig[2],zig[3]].map(p=>({...p}));
 const a=G.horizontalElements(zig,60),b=G.horizontalElements(withMid,60);
 assert.equal(JSON.stringify(b.curves.map(q=>q.index)),'[2,3]');   // os índices seguem os PIs recebidos
 near(b.total,a.total,1e-9);near(b.curves[0].pc,a.curves[0].pc,1e-9);
 // A tangente da curva pode passar pelo PI alinhado, como no traçado.
 const wide=withMid.map(p=>({...p}));wide[2].r=a.curves[0].maxRadius*.999;
 assert.ok(G.horizontalElements(wide,60).curves[0].tangent>150);
 assert.equal(G.horizontalElements(wide,60).fits,true);
 assert.doesNotThrow(()=>curves(flat(wide),60,2,true));
 // Reta de A a B: sem curvas.
 const line=G.horizontalElements([{x:0,y:0},{x:100,y:0}],60);
 assert.equal(line.curves.length,0);near(line.total,100,1e-12);assert.equal(line.minRadius,null);
 assert.equal(G.horizontalElements([{x:0,y:0}],60),null);
});

const axisLine=(total,n=200)=>Array.from({length:n+1},(_,i)=>({x:total*i/n,y:0,z:0}));
const design=[{u:0,z:100,L:0,fixed:true},{u:.25,z:106,L:40,fixed:false},{u:.6,z:104,L:60,fixed:false},{u:1,z:112,L:0,fixed:true}];

test('elementos verticais: rampas, A, K, tipo, PCV e PTV',()=>{
 const total=400,v=G.verticalElements(design,total,8);
 assert.equal(v.points.length,4);
 const [a,p1,p2,b]=v.points;
 assert.equal(a.end,true);assert.equal(b.end,true);
 near(a.gradeOut,6,1e-9);near(p1.gradeIn,6,1e-9);near(p1.gradeOut,100*(104-106)/140,1e-9);
 near(p1.A,p1.gradeOut-p1.gradeIn,1e-12);assert.equal(p1.kind,'convexa');
 near(p1.K,40/Math.abs(p1.A),1e-9);near(p1.pcv,80,1e-9);near(p1.ptv,120,1e-9);
 assert.equal(p2.kind,'côncava');near(p2.gradeOut,5,1e-9);near(b.gradeIn,5,1e-9);
 near(p1.ordinate,Math.abs(p1.A)/100*40/8,1e-12);
 near(v.maxGrade,6,1e-9);assert.equal(v.over,false);near(v.rise,12,1e-12);
 near(v.minK,Math.min(p1.K,p2.K),1e-12);assert.equal(v.minKIndex,p1.K<p2.K?1:2);assert.equal(v.fits,true);
 assert.equal(G.verticalElements(design,total,5).over,true);     // limite abaixo da rampa existente
 // As cotas do greide calculado pelo editor passam pelas mesmas rampas.
 const r=E.vertical(axisLine(total),design,8);
 near(100*r.grades[0],6,1e-9);near(r.sample(40),100+.06*40,1e-9);
 near(r.sample(100),106-Math.abs(p1.A)/100*40/8,1e-9,'ordenada no PVI');
});

test('elementos verticais: "cabe até" é o limite real do editor',()=>{
 const total=400,v=G.verticalElements(design,total,8);
 for(const p of v.points.filter(p=>!p.end)){
  const ok=design.map(q=>({...q})),bad=design.map(q=>({...q}));
  ok[p.index].L=p.maxL;bad[p.index].L=p.maxL+.01;
  assert.doesNotThrow(()=>E.vertical(axisLine(total),ok,8),'L no limite no PVI '+p.index);
  assert.equal(G.verticalElements(ok,total,8).fits,true);
  assert.throws(()=>E.vertical(axisLine(total),bad,8),/se sobrepõem/);
  assert.equal(G.verticalElements(bad,total,8).fits,false);
 }
 // PVI com mudança de rampa e sem curva é sinalizado, como o editor exige.
 const missing=design.map(q=>({...q}));missing[1].L=0;
 assert.equal(G.verticalElements(missing,total,8).points[1].missingCurve,true);
 assert.throws(()=>E.vertical(axisLine(total),missing,8),/comprimento positivo de curva vertical no PVI 1/);
 // PVI sem mudança de rampa: reta, sem K e sem exigência de curva.
 const straight=[{u:0,z:100,L:0,fixed:true},{u:.5,z:110,L:0,fixed:false},{u:1,z:120,L:0,fixed:true}];
 const s=G.verticalElements(straight,200,12).points[1];
 assert.equal(s.kind,'reta');assert.equal(s.K,null);assert.equal(s.missingCurve,false);
 assert.equal(G.verticalElements([{u:0,z:1,L:0}],100,8),null);
});
