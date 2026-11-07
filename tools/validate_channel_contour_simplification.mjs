import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const source=fs.readFileSync(fileURLToPath(new URL('../src/modules/environmental/channel-contour-simplification.js',import.meta.url)),'utf8'),sandbox={window:{}};vm.runInNewContext(source,sandbox);
vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL('../src/vendor/polygon-clipping.min.js',import.meta.url)),'utf8'),sandbox);
const factory=vm.runInNewContext('('+sandbox.window.GeoMineChannelContour.engine.toString()+')'),engine=factory(sandbox.polygonClipping);
const plain=x=>JSON.parse(JSON.stringify(x)),close=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<=e,`${a} ≈ ${b}`),opts={spacing:2,resolution:.5};
const area=r=>{const o=r[0];let a=0;for(let i=1;i<r.length-1;i++)a+=(r[i][0]-o[0])*(r[i+1][1]-o[1])-(r[i+1][0]-o[0])*(r[i][1]-o[1]);return Math.abs(a/2);};
function staircase(n=80,width=10){const p=[],push=(x,y)=>{const point=[500000+x,7400000+y];if(!p.length||p.at(-1)[0]!==point[0]||p.at(-1)[1]!==point[1])p.push(point);};
  const heights=Array.from({length:n},(_,i)=>width+Math.round((Math.sin(i*.3)+1)*2)*.5);
  push(0,0);push(n*.5,0);push(n*.5,heights.at(-1));for(let i=n-1;i>=0;i--){push(i*.5,heights[i]);if(i)push(i*.5,heights[i-1]);}p.push(p[0].slice());return p;
}
function rectangle(x,y,w,h,n=1){const out=[];for(const [a,b]of [[[x,y],[x+w,y]],[[x+w,y],[x+w,y+h]],[[x+w,y+h],[x,y+h]],[[x,y+h],[x,y]]])for(let i=0;i<n;i++)out.push([a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n]);out.push(out[0].slice());return out;}
const distance=(p,a,b)=>{const x=b[0]-a[0],y=b[1]-a[1],f=Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/(x*x+y*y)));return Math.hypot(p[0]-a[0]-f*x,p[1]-a[1]-f*y);};
function check(original,result){assert.equal(result.polygons.length,original.length);let totalDifference=0;for(let pi=0;pi<original.length;pi++){assert.equal(result.polygons[pi].length,original[pi].length);const originalArea=area(original[pi][0])-original[pi].slice(1).reduce((sum,r)=>sum+area(r),0),nextArea=area(result.polygons[pi][0])-result.polygons[pi].slice(1).reduce((sum,r)=>sum+area(r),0);assert.ok(Math.abs(nextArea-originalArea)<=originalArea*.1+1e-7);const diff=sandbox.polygonClipping.xor(original[pi],result.polygons[pi]).reduce((sum,p)=>sum+area(p[0])-p.slice(1).reduce((n,r)=>n+area(r),0),0);assert.ok(diff<=originalArea*.1+1e-6);totalDifference+=diff;
  for(let ri=0;ri<original[pi].length;ri++){const ring=result.polygons[pi][ri];assert.deepEqual(plain(ring[0]),plain(ring.at(-1)));assert.ok(ring.length>=4);assert.ok(ring.every(p=>p.every(Number.isFinite)));for(const p of original[pi][ri]){let d=Infinity;for(let j=1;j<ring.length;j++)d=Math.min(d,distance(p,ring[j-1],ring[j]));assert.ok(d<=result.effectiveTolerance+1e-7,`deviation ${d} > ${result.effectiveTolerance}`);}}
}close(result.symmetricDifferenceArea,totalDifference,1e-5);}
let count=0;const test=(name,fn)=>{fn();count++;console.log('PASS '+name);};
test('Escada UTM reduz vértices, limita erro/área e não muta entrada',()=>{const p=[[staircase()]],before=JSON.stringify(p),r=engine.simplify(p,opts);assert.equal(JSON.stringify(p),before);assert.ok(r.reduced);assert.ok(r.verticesAfter<r.verticesBefore/2);assert.equal(r.requestedTolerance,1);assert.ok(r.effectiveTolerance<=1);check(p,r);close(r.areaBefore,area(p[0][0]));});
test('Espaçamento modifica tolerância solicitada e redução',()=>{const p=[[staircase(100)]],small=engine.simplify(p,{...opts,spacing:.1}),large=engine.simplify(p,{...opts,spacing:4});check(p,small);check(p,large);assert.equal(small.requestedTolerance,.05);assert.equal(large.requestedTolerance,2);assert.ok(large.verticesAfter<small.verticesAfter);});
test('Âncoras determinísticas sob inversão e rotação do primeiro vértice',()=>{const p=[[staircase()]],r=engine.simplify(p,opts),ring=p[0][0].slice(0,-1),reversed=ring.slice().reverse(),rotated=ring.slice(17).concat(ring.slice(0,17));for(const q of [reversed,rotated]){q.push(q[0].slice());assert.deepEqual(plain(engine.simplify([[q]],opts).polygons),plain(r.polygons));}});
test('Furos e múltiplos componentes são preservados',()=>{const p=[[rectangle(500000,7400000,30,20,20),rectangle(500002,7400002,8,5,12),rectangle(500013,7400004,3,10,12)],[rectangle(500040,7400000,10,10,20)]],r=engine.simplify(p,{...opts,spacing:6});check(p,r);assert.ok(r.reduced);assert.equal(r.polygons[0].length,3);assert.equal(r.polygons.length,2);});
test('Faixa estreita e furos próximos forçam tolerância segura ou original',()=>{const p=[[staircase(80,.2)]],r=engine.simplify(p,{...opts,spacing:40});check(p,r);assert.ok(r.effectiveTolerance<r.requestedTolerance||r.fallback);const near=[[rectangle(0,0,20,2,10),rectangle(.1,.1,19.8,1.8,10)]];check(near,engine.simplify(near,{...opts,spacing:20}));});
test('Componentes adjacentes não se sobrepõem e contato original é permitido',()=>{const p=[[rectangle(0,0,10,10,20)],[rectangle(10.01,0,10,10,20)]],touch=[[rectangle(0,0,10,10,20)],[rectangle(10,10,10,10,20)]];check(p,engine.simplify(p,{...opts,spacing:10}));check(touch,engine.simplify(touch,{...opts,spacing:10}));});
test('Componente dentro de furo não é confundido com sobreposição',()=>{const p=[[rectangle(0,0,30,30,15),rectangle(5,5,20,20,15)],[rectangle(10,10,10,10,15)]];check(p,engine.simplify(p,opts));});
test('XY inválido, contorno aberto, cruzamento, escape de furo e sobreposição recusados',()=>{
  for(const p of [[[[[0,0],[1,0],[NaN,1],[0,0]]]],[[[[0,0],[1,0],[1,1],[0,1]]]],[[[[0,0],[2,2],[0,2],[2,0],[0,0]]]],[[rectangle(0,0,10,10),rectangle(9,9,2,2)]],[[rectangle(0,0,10,10)],[rectangle(5,5,10,10)]]])assert.throws(()=>engine.simplify(p,opts));
  for(const spacing of [0,-1,NaN,Infinity])assert.throws(()=>engine.simplify([[rectangle(0,0,2,2)]],{...opts,spacing}));
});
test('Limite de 250 mil vértices é explícito',()=>{const ring=Array.from({length:250001},(_,i)=>[i,Math.sin(i)]);ring.push(ring[0].slice());assert.throws(()=>engine.simplify([[ring]],opts),e=>e.code==='CHANNEL_LIMIT');});
test('Contorno já simples permanece íntegro e área usa coordenadas locais',()=>{const p=[[rectangle(500000,7400000,40,20)]],r=engine.simplify(p,{spacing:.01,resolution:.5});check(p,r);close(r.areaBefore,800);close(r.areaAfter,800);assert.ok(r.effectiveTolerance<=.005);});
test('Sem verificador externo, original é preservado em segurança',()=>{const p=[[staircase()]],r=factory().simplify(p,opts);assert.equal(r.fallback,true);assert.equal(r.reduced,false);assert.deepEqual(plain(r.polygons),p);assert.equal(r.symmetricDifferenceArea,0);});
console.log(`${count}/${count} grupos passaram.`);
