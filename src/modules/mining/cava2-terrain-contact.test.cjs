const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context={sampleZbil:(g,x,y)=>g.sample(x,y),setTimeout};
context.ClipperLib=require('../../vendor/clipper.js');
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'cava2-terrain-contact.js'),'utf8'),context);
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
