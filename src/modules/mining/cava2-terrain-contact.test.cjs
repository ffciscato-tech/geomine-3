const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context={sampleZbil:(g,x,y)=>g.sample(x,y),setTimeout};
context.ClipperLib=require('../../vendor/clipper.js');
vm.createContext(context);
// THREE (triangulação) como no aplicativo: as faixas entre anéis usam a malha exata.
vm.runInContext(fs.readFileSync(path.join(__dirname,'../../vendor/three.min.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'cava2-terrain-contact.js'),'utf8'),context);
// Sem THREE vale a faixa antiga, por comprimento de arco.
const semThree={sampleZbil:(g,x,y)=>g.sample(x,y),setTimeout};vm.createContext(semThree);
vm.runInContext(fs.readFileSync(path.join(__dirname,'cava2-terrain-contact.js'),'utf8'),semThree);
const intersect=(rings,sample,cs=.5)=>context.GeoMineCavaTerrain.intersect(rings,{cs,sample},{floor:false});
const ring=(r,z)=>({ring:[[-r,-r],[r,-r],[r,r],[-r,r]],z});
const points=fs=>fs.flatMap(f=>f.geom.map((p,i)=>[...p,f.zg[i]]));
const closed=f=>Math.hypot(f.geom[0][0]-f.geom.at(-1)[0],f.geom[0][1]-f.geom.at(-1)[1])<1e-5;

test('MDT recortado conserva plano e rampa a 0,20 m sem preencher vazios',async()=>{
 const parts={surface:[[[0,0,10],[2,0,12],[2,2,14],[0,2,12]]],ramps:[[[0,0,5],[1,0,6],[1,1,6],[0,1,5]]]};
 const g=await context.GeoMineCavaTerrain.rasterize(parts,{cellSize:.2,crs:'EPSG:31983',terrain:{sample:(x,y)=>x>1.6&&y>1.6?NaN:30}});
 assert.equal(g.cs,.2);assert.equal(g.csy,.2);assert.equal(g.nc,10);assert.equal(g.nr,10);assert(g.native);
 let expectedVolume=0,validCells=0;
 for(let r=0;r<g.nr;r++)for(let c=0;c<g.nc;c++){
  const x=(c+.5)*.2,y=2-(r+.5)*.2,z=g.z[r*g.nc+c];
  if(x>1.6&&y>1.6){assert(Number.isNaN(z));continue;}
  assert(Math.abs(z-(x<1&&y<1?5+x:10+x+y))<1e-5);
  expectedVolume+=(30-z)*.04;validCells++;
 }
 assert(Math.abs(g.cutVolume.volume-expectedVolume)<1e-8);assert.equal(g.cutVolume.validCells,validCells);
});
test('recorte de DCE mantém só células acima do terreno e cancela quando o projeto muda',async()=>{
 const parts={surface:[[[0,0,5],[2,0,7],[2,2,7],[0,2,5]]]};
 const g=await context.GeoMineCavaTerrain.rasterize(parts,{cellSize:.2,keepAbove:true,terrain:{sample:()=>6}});
 for(let r=0;r<g.nr;r++)for(let c=0;c<g.nc;c++)assert.equal(Number.isFinite(g.z[r*g.nc+c]),c>=5);
 await assert.rejects(context.GeoMineCavaTerrain.rasterize(parts,{isCurrent:()=>false}),e=>e.name==='AbortError');
});
test('contato plano é um anel quadrado real, sem substituir por círculo',()=>{
 const out=intersect([ring(10,10),ring(5,0)],()=>5);
 assert.equal(out.length,1);assert(closed(out[0]));
 for(const [x,y,z] of points(out)){assert(Math.abs(Math.max(Math.abs(x),Math.abs(y))-7.5)<1e-5);assert(Math.abs(z-5)<1e-5);}
});
test('interseção segue variações internas do MDT, não só as pontas da face',()=>{
 const terrain=(x,y)=>5+2*Math.sin(x*.8)*Math.cos(y*.5),out=intersect([ring(10,10),ring(5,0)],terrain,.15);
 assert(out.length>0);assert(points(out).length>200);
 for(const [x,y,z] of points(out))assert(Math.abs(z-terrain(x,y))<1e-5);
 const radii=points(out).map(([x,y])=>Math.max(Math.abs(x),Math.abs(y)));
 assert(Math.max(...radii)-Math.min(...radii)>1);
});
test('não fecha artificialmente arcos interrompidos por NoData',()=>{
 const out=intersect([ring(10,10),ring(5,0)],(x,y)=>Math.abs(y)<2?NaN:5);
 assert(out.length>=2);assert(out.every(f=>!closed(f)));
 for(const [x,y,z] of points(out)){assert(Math.abs(y)>=2);assert(Math.abs(z-5)<1e-5);}
});
test('mesmo sinal nos vértices não elimina depressão dentro de uma berma',()=>{
 const terrain=(x,y)=>3-5*Math.exp(-((x-7.5)**2+y*y)/3),out=intersect([ring(10,0),ring(5,0)],terrain,.25);
 assert(out.some(closed));for(const [x,y,z] of points(out))assert(Math.abs(z-terrain(x,y))<1e-5);
});
test('sentido e vértice inicial não torcem a faixa entre anéis',()=>{
 const a=ring(10,10),b=ring(5,0);b.ring=b.ring.slice().reverse();b.ring.push(b.ring.shift());
 const out=intersect([a,b],()=>5);assert.equal(out.length,1);assert(closed(out[0]));
 for(const [x,y] of points(out))assert(Math.abs(Math.max(Math.abs(x),Math.abs(y))-7.5)<1e-5);
});
test('sem encontro não inventa contorno; mesma regra para aterro',()=>{
 assert.equal(intersect([ring(10,10),ring(5,0)],()=>20).length,0);
 const out=intersect([ring(10,0),ring(5,10)],()=>5);assert.equal(out.length,1);assert(closed(out[0]));
});

const squareTriangles=z=>[[[0,0,z],[10,0,z],[10,10,z]],[[0,0,z],[10,10,z],[0,10,z]]];
const polygonArea=p=>Math.abs(p.reduce((a,q,i)=>{const r=p[(i+1)%p.length];return a+q[0]*r[1]-r[0]*q[1];},0))/2;
function clip(triangles,sample,keepAbove=false){
 const polygons=[],lines=context.GeoMineCavaTerrain.intersect([],{cs:.4,sample},{triangles,keepAbove,onPolygon:p=>polygons.push(p)});
 return {polygons,lines,area:polygons.reduce((a,p)=>a+polygonArea(p),0)};
}
test('recorte conserva somente a parte da superfície abaixo do MDT, com XYZ',()=>{
 const result=clip(squareTriangles(5),x=>x);
 assert(Math.abs(result.area-50)<1e-5);
 assert(result.polygons.flat().every(([x,y,z])=>x>=5-1e-6&&z===5));
 const pile=clip(squareTriangles(5),x=>x,true);assert(Math.abs(pile.area-50)<1e-5);
 assert(pile.polygons.flat().every(([x])=>x<=5+1e-6));
});
test('cava integralmente enterrada permanece íntegra, mesmo sem linha de contato',()=>{
 const result=clip(squareTriangles(5),()=>10);
 assert(Math.abs(result.area-100)<1e-6);assert.equal(result.lines.length,0);
});
test('preenchimento respeita NoData interno sem fechar uma corda por cima',()=>{
 const terrain=(x,y)=>x>4&&x<6?NaN:10,result=clip(squareTriangles(5),terrain);
 assert(result.area>70&&result.area<81);
 for(const p of result.polygons)assert(p.every(([x])=>x<=4)||p.every(([x])=>x>=6));
});
test('recorte detecta bolsão interno que não alcança a borda do polígono',()=>{
 const terrain=(x,y)=>10-((x-5)**2+(y-5)**2),result=clip(squareTriangles(5),terrain);
 assert(result.area>14&&result.area<17);assert(result.lines.length>0);
 assert(result.polygons.flat().every(([x,y,z])=>z<=terrain(x,y)+1e-5));
});
test('dissolve as faces internas conservando vazios e XYZ da borda',()=>{
 const triangles=[];
 for(let x=0;x<20;x++)for(let y=0;y<20;y++){
  if(x>=8&&x<12&&y>=8&&y<12)continue;
  const p=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]].map(([x,y])=>[x+300000,y+7700000,100+x*2+y*3]);
  triangles.push([p[0],p[1],p[2]],[p[0],p[2],p[3]]);
 }
 const out=context.GeoMineCavaTerrain.mergePolygons(triangles,{cs:.25});assert.equal(out.length,2);
 const areas=out.map(polygonArea).sort((a,b)=>b-a);assert(Math.abs(areas[0]-areas[1]-384)<.001);
 assert(out.flat().every(([x,y,z])=>Math.abs(z-(100+(x-300000)*2+(y-7700000)*3))<1e-5));
 assert(out.flat().length<200);
});

/* ---- Faixa exata entre anéis e rampa dentro do cálculo (22/11/2026) ---- */
const distSeg=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy,t=l2?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2)):0;
 return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);};
const distPoly=(p,P,closedLine)=>{let d=Infinity;for(let i=0;i<P.length-(closedLine?0:1);i++)d=Math.min(d,distSeg(p,P[i],P[(i+1)%P.length]));return d;};
const densify=(P,h)=>{const out=[];for(let i=0;i<P.length-1;i++){const a=P[i],b=P[i+1],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/h));
 for(let k=0;k<n;k++)out.push([a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n]);}out.push(P.at(-1));return out;};
// offset para dentro de um polígono convexo anti-horário (junta miter)
const offsetIn=(P,w)=>{const n=P.length,L=P.map((a,i)=>{const b=P[(i+1)%n],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy),nx=-dy/l,ny=dx/l;
  return {x:a[0]+nx*w,y:a[1]+ny*w,dx,dy};});
 return L.map((s,i)=>{const r=L[(i+n-1)%n],den=r.dx*s.dy-r.dy*s.dx,t=((s.x-r.x)*s.dy-(s.y-r.y)*s.dx)/den;return [r.x+r.dx*t,r.y+r.dy*t];});};
// Pátio alongado e irregular: o offset encurta cada lado de um tanto diferente.
const patio=[[0,0],[140,6],[150,44],[20,52]];

test('faixa entre anéis não torce nos cantos: o contato é o offset exato',()=>{
 // Anel de dentro = offset de 12 m do de fora. A correspondência por
 // comprimento de arco ligava pontos de lados diferentes junto dos cantos.
 const A={ring:patio,z:0},B={ring:offsetIn(patio,12),z:12},esperado=offsetIn(patio,6),stats={};
 const out=context.GeoMineCavaTerrain.intersect([A,B],{cs:.5,sample:()=>6},{floor:false,stats});
 assert.equal(stats.bands,1);assert.equal(stats.strips,0);assert.equal(out.length,1);assert(closed(out[0]));
 let pior=0;for(const p of points(out))pior=Math.max(pior,distPoly(p,esperado,true));
 assert(pior<1e-4,`desvio ${pior}`);
 for(const q of densify(esperado.concat([esperado[0]]),.5))assert(distPoly(q,out[0].geom,false)<1e-3);
 // a faixa antiga (sem triangulação disponível) erra os cantos: o teste acima distingue as duas
 const antigo=semThree.GeoMineCavaTerrain.intersect([A,B],{cs:.5,sample:()=>6},{floor:false});
 let piorAntigo=0;for(const p of points(antigo))piorAntigo=Math.max(piorAntigo,distPoly(p,esperado,true));
 assert(piorAntigo>.2,`a faixa antiga desviava ${piorAntigo}`);
});
test('degrau do anel de dentro não cria dentes: uma única linha fechada, sem laços',()=>{
 // Degrau de 6 m no anel de dentro (como o corte da chegada de uma rampa).
 const A={ring:[[0,0],[120,0],[120,80],[0,80]],z:0},
  B={ring:[[10,16],[70,16],[70,10],[110,10],[110,70],[10,70]],z:10};
 const terreno=(x,y)=>3+.02*x,out=context.GeoMineCavaTerrain.intersect([A,B],{cs:.5,sample:terreno},{floor:false});
 assert.equal(out.length,1);assert(closed(out[0]));
 const P=out[0].geom;let voltas=0;
 for(let i=1;i<P.length-1;i++){const ax=P[i][0]-P[i-1][0],ay=P[i][1]-P[i-1][1],bx=P[i+1][0]-P[i][0],by=P[i+1][1]-P[i][1];
  voltas+=Math.atan2(ax*by-ay*bx,ax*bx+ay*by);}
 assert(Math.abs(Math.abs(voltas)-2*Math.PI)<.6,'a linha dá uma volta só');
 // lado de baixo, depois do degrau (faixa nominal de 10 m): face plana z=y
 for(const [x,y] of P)if(x>78&&x<104&&y<10)assert(Math.abs(y-(3+.02*x))<1e-3);
 // lado de baixo, antes do degrau (faixa de 16 m): z=10·y/16
 for(const [x,y] of P)if(x>20&&x<60&&y<16)assert(Math.abs(y-1.6*(3+.02*x))<1e-3);
});
// Banco reto de 4 m (face 45°) com rampa de 2 m a 10% no lado de baixo.
const bancoComRampa=sinal=>{
 const A={ring:[[0,0],[60,0],[60,30],[0,30]],z:0},B={ring:[[4,6],[50,6],[50,4],[56,4],[56,26],[4,26]],z:4*sinal},
  xs=[10,20,30,40,50],b1=xs.map(x=>[x,.1*(x-10),.1*(x-10)*sinal]),b2=xs.map(x=>[x,.1*(x-10)+2,.1*(x-10)*sinal]);
 return {rings:[A,B],ramps:[{b1,b2}]};
};
// contato exato com o terreno z=±(1+0,02x): talude de dentro, travessia da pista, talude de fora
const contatoRampa=[[12,3.24],[25,3.5],[25,1.5],[48,1.96]];
for(const [nome,sinal] of [['pilha',1],['cava',-1]])test(`rampa entra na interseção (${nome}): a linha atravessa a pista onde o terreno a encontra`,()=>{
 const {rings,ramps}=bancoComRampa(sinal),terreno=(x,y)=>sinal*(1+.02*x),g={cs:.25,sample:terreno},
  out=context.GeoMineCavaTerrain.intersect(rings,g,{floor:false,keepAbove:sinal>0,ramps});
 const todos=out.flatMap(f=>f.geom),trecho=todos.filter(([x,y])=>x>12&&x<48&&y<8);
 assert(trecho.length>50);
 let pior=0;for(const p of trecho)pior=Math.max(pior,distPoly(p,contatoRampa,false));
 assert(pior<.06,`desvio ${pior}`);
 for(const q of densify(contatoRampa,.25))assert(Math.min(...out.map(f=>distPoly(q,f.geom,false)))<.08,`falta a linha em ${q}`);
 for(const [x,y,z] of points(out))assert(Math.abs(z-terreno(x,y))<1e-5);
 // sem a rampa (cálculo anterior) o talude seria uma rampa única de 6 m e o contato passaria longe
 const sem=context.GeoMineCavaTerrain.intersect(rings,g,{floor:false,keepAbove:sinal>0}).flatMap(f=>f.geom).filter(([x,y])=>x>12&&x<48&&y<8);
 let piorSem=0;for(const p of sem)piorSem=Math.max(piorSem,distPoly(p,contatoRampa,false));
 assert(piorSem>.5);
});
test('patamar entre dois trechos de rampa fica na cota da chegada',()=>{
 /* Dois bancos de 4 m (face 45°, berma 2 m, rampa 2 m). O 1º trecho chega em
    x=50 na cota 4; o 2º parte uma berma adiante (x=52), já no banco de cima.
    Entre a chegada e a partida fica o patamar, na cota 4. Terreno horizontal
    na cota 4,2: o patamar fica abaixo dele e não pode ser mantido na pilha. */
 const A={ring:[[0,0],[100,0],[100,50],[0,50]],z:0},B={ring:[[4,6],[50,6],[50,4],[96,4],[96,46],[4,46]],z:4},
  C={ring:[[6,8],[50.3,8],[50.3,6],[94,6],[94,44],[6,44]],z:4},D={ring:[[10,12],[72,12],[72,10],[90,10],[90,40],[10,40]],z:8},
  r1={b1:[[10,0,0],[50,4,4]],b2:[[10,2,0],[50,6,4]]},r2={b1:[[52,6,4],[72,10,8]],b2:[[52,8,4],[72,12,8]]};
 const mantidas=ramps=>{const surf=[];context.GeoMineCavaTerrain.intersect([A,B,C,D],{cs:.5,sample:()=>4.2},{floor:false,keepAbove:true,ramps,onPolygon:p=>surf.push(p)});return surf;},
  noPatamar=surf=>surf.filter(p=>{const cx=p.reduce((s,q)=>s+q[0],0)/p.length,cy=p.reduce((s,q)=>s+q[1],0)/p.length;return cx>51.2&&cx<51.8&&cy>6.3&&cy<6.9;}).length;
 const com=mantidas([r1,r2]);
 assert.equal(noPatamar(com),0,'face mantida sobre o patamar');
 assert(com.flat().every(([x,y,z])=>z>=4.2-1e-6));
 // sem as rampas a faixa seria um talude único e parte do patamar ficaria "acima" do terreno
 assert(noPatamar(mantidas(undefined))>0);
});
test('começo de rampa que ainda corre sobre a berma também entra no contato',()=>{
 /* Mesmos dois bancos, mas o pé do 2º banco só encosta no nominal em x=60: de
    x=52 a x=60 o 2º trecho (20%) sobe por cima da berma. Terreno horizontal na
    cota 4,5: a pista o encontra em x=54,5, atravessando berma e talude. */
 const A={ring:[[0,0],[100,0],[100,50],[0,50]],z:0},B={ring:[[4,6],[50,6],[50,4],[96,4],[96,46],[4,46]],z:4},
  C={ring:[[6,8],[60,8],[60,6],[94,6],[94,44],[6,44]],z:4},D={ring:[[10,12],[72,12],[72,10],[90,10],[90,40],[10,40]],z:8},
  r1={b1:[[10,0,0],[50,4,4]],b2:[[10,2,0],[50,6,4]]},r2={b1:[[52,6,4],[72,10,8]],b2:[[52,8,4],[72,12,8]]};
 const roda=ramps=>context.GeoMineCavaTerrain.intersect([A,B,C,D],{cs:.5,sample:()=>4.5},{floor:false,keepAbove:true,ramps}),
  perto=(out,q)=>Math.min(Infinity,...out.map(f=>distPoly(q,f.geom,false)));
 const com=roda([r1,r2]),sem=roda(undefined);
 for(const q of [[54.5,6.8],[54.5,7.2],[54.5,7.6],[54.5,8.3]]){
  assert(perto(com,q)<.06,`a linha não passa por ${q}: ${perto(com,q)}`);
  if(q[1]<8)assert(perto(sem,q)>.4); // sem a rampa não há contato sobre a berma
 }
 assert.equal(com.length,1);
 // Só no ponto em que o pé (cota 4) cruza a borda da pista (cota 5,6) as duas
 // cotas se chocam; em todo o resto a linha está na cota do terreno.
 const fora=points(com).filter(([x,y,z])=>Math.abs(z-4.5)>1e-5);
 assert(fora.length<=2&&fora.every(([x,y])=>Math.hypot(x-60,y-7.6)<.05),`pontos fora da cota do terreno: ${fora.length}`);
});
test('anéis não aninhados caem na faixa antiga, sem erro',()=>{
 const stats={},out=context.GeoMineCavaTerrain.intersect([{ring:[[0,0],[10,0],[10,10],[0,10]],z:10},{ring:[[20,0],[30,0],[30,10],[20,10]],z:0}],{cs:.5,sample:()=>5},{floor:false,stats});
 assert.equal(stats.bands,0);assert.equal(stats.strips,1);assert(Array.isArray(out));
});
test('sem THREE continua valendo a faixa por comprimento de arco',()=>{
 const stats={},out=semThree.GeoMineCavaTerrain.intersect([ring(10,10),ring(5,0)],{cs:.5,sample:()=>5},{floor:false,stats});
 assert.equal(stats.strips,1);assert.equal(out.length,1);assert(closed(out[0]));
 for(const [x,y] of points(out))assert(Math.abs(Math.max(Math.abs(x),Math.abs(y))-7.5)<1e-5);
});
