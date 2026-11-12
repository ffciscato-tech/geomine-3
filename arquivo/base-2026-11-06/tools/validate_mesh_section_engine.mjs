import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const context=vm.createContext({window:{},console});
vm.runInContext(fs.readFileSync(path.join(root,'src/modules/geology/mesh-section-engine.js'),'utf8'),context);
const engine=context.window.GeoMineMeshSections;
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<=t,`${a} ≠ ${b}`);
const clean=x=>JSON.parse(JSON.stringify(x));
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
function cube(x0=0,y0=0,z0=0,x1=10,y1=10,z1=10){
  return {vertices:[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],faces:[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]};
}
function merge(...meshes){const out={vertices:[],faces:[]};for(const m of meshes){const offset=out.vertices.length;out.vertices.push(...m.vertices);out.faces.push(...m.faces.map(f=>f.map(i=>i+offset)));}return out;}
function area(line){let a=0;for(let i=1;i<line.points.length;i++){const p=line.points[i-1],q=line.points[i];a+=p[0]*q[1]-q[0]*p[1];}return Math.abs(a)/2;}
function extents(line){return [Math.min(...line.points.map(p=>p[0])),Math.max(...line.points.map(p=>p[0])),Math.min(...line.points.map(p=>p[1])),Math.max(...line.points.map(p=>p[1]))];}
function totalLength(result){let v=0;for(const p of result.polylines)for(let i=1;i<p.points.length;i++)v+=Math.hypot(p.points[i][0]-p.points[i-1][0],p.points[i][1]-p.points[i-1][1]);return v;}
function polygonArea(points){return area({points:[...points,points[0]]});}
function insideFills(result,x,z){let inside=false;for(const polygon of result.fillPolygons)for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
  const a=polygon[i],b=polygon[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;
}return inside;}

test('closed cube yields actual closed rectangular boundary, not sampled elevations',()=>{
  const r=engine.cut(cube(),[[-5,5],[15,5]]);
  assert.equal(r.closedSolid,true);assert.equal(r.polylines.length,1);assert.equal(r.polylines[0].closed,true);
  near(area(r.polylines[0]),100);assert.deepEqual(extents(r.polylines[0]),[5,15,0,10]);near(totalLength(r),40);
});
test('tetrahedron intersects exactly through triangular cross-section',()=>{
  const mesh={vertices:[[0,0,0],[10,0,0],[0,10,0],[0,0,10]],faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]]};
  const r=engine.cut(mesh,[[-2,2],[12,2]]);assert.equal(r.closedSolid,true);assert.equal(r.polylines.length,1);near(area(r.polylines[0]),32);
});
test('open sloping triangulated surface yields a continuous line only',()=>{
  const mesh={vertices:[[0,0,0],[10,0,10],[10,10,20],[0,10,10]],faces:[[0,1,2],[0,2,3]]};
  const r=engine.cut(mesh,[[-5,5],[15,5]]);assert.equal(r.closedSolid,false);assert.equal(r.polylines.length,1);assert.equal(r.polylines[0].closed,false);
  assert.deepEqual(extents(r.polylines[0]),[5,15,5,15]);near(totalLength(r),Math.sqrt(200));
});
test('disconnected solids remain two separate filled loops',()=>{
  const r=engine.cut(merge(cube(),cube(20,0,2,25,10,7)),[[-5,5],[30,5]]);
  assert.equal(r.closedSolid,true);assert.equal(r.polylines.length,2);assert.ok(r.polylines.every(l=>l.closed));
  near(r.polylines.reduce((s,l)=>s+area(l),0),125);
});
test('hollow solid retains inner boundary for even-odd cavity fill',()=>{
  const inner=cube(2,2,2,8,8,8);inner.faces=inner.faces.map(f=>f.slice().reverse());
  const r=engine.cut(merge(cube(),inner),[[-5,5],[15,5]]);
  assert.equal(r.closedSolid,true);assert.equal(r.polylines.length,2);assert.ok(r.polylines.every(l=>l.closed));
  assert.deepEqual(clean(r.polylines.map(area).sort((a,b)=>a-b)),[36,100]);
});
test('vertical and overhanging faces preserve multiple Z at the same chainage',()=>{
  const m=cube();m.vertices=m.vertices.map(v=>[v[0]+v[2]*.5,v[1],v[2]]);
  const r=engine.cut(m,[[-5,5],[20,5]]);assert.equal(r.polylines.length,1);near(area(r.polylines[0]),100);
  assert.deepEqual(extents(r.polylines[0]),[5,20,0,10]);
});
test('coplanar closed face exposes perimeter without triangulation diagonal',()=>{
  const r=engine.cut(cube(),[[-5,0],[15,0]]);assert.equal(r.coplanarTriangles,2);assert.equal(r.polylines.length,1);
  assert.equal(r.polylines[0].closed,true);near(area(r.polylines[0]),100);near(totalLength(r),40);
});
test('coplanar open surface exposes real perimeter but is never a filled solid',()=>{
  const m={vertices:[[0,0,0],[10,0,0],[10,0,10],[0,0,10]],faces:[[0,1,2],[0,2,3]]};
  const r=engine.cut(m,[[-5,0],[15,0]]);assert.equal(r.closedSolid,false);assert.equal(r.polylines.length,1);near(totalLength(r),40);near(area(r.polylines[0]),100);
});
test('plane through cube diagonal edges gives a closed profile with no duplicates',()=>{
  const r=engine.cut(cube(),[[-5,-5],[15,15]]);assert.equal(r.polylines.length,1);assert.equal(r.polylines[0].closed,true);
  near(area(r.polylines[0]),100*Math.sqrt(2));near(totalLength(r),20+20*Math.sqrt(2));
});
test('plane tangent to one vertex never invents a line or closure',()=>{
  const m={vertices:[[0,0,0],[10,0,0],[0,10,0],[0,0,10]],faces:[[0,2,1],[0,1,3],[0,3,2],[1,2,3]]};
  const r=engine.cut(m,[[5,15],[15,5]]);assert.equal(r.polylines.length,0);
});
test('plane tangent along an edge produces exactly that edge',()=>{
  const r=engine.cut(cube(),[[-5,5],[5,-5]]);assert.equal(r.polylines.length,1);assert.equal(r.polylines[0].closed,false);near(totalLength(r),10);
});
test('metric UTM translation does not change shape, chainage, or elevations',()=>{
  const m=cube();m.vertices=m.vertices.map(v=>[v[0]+583644.77,v[1]+7073403.51,v[2]+650]);
  const r=engine.cut(m,[[583639.77,7073408.51],[583659.77,7073408.51]]);
  assert.equal(r.closedSolid,true);assert.equal(r.polylines.length,1);near(area(r.polylines[0]),100);assert.deepEqual(extents(r.polylines[0]),[5,15,650,660]);
});
test('bent A–B path stitches both legs on cumulative chainage',()=>{
  const r=engine.cut(cube(),[[-5,5],[5,5],[5,15]]);
  assert.equal(r.polylines.length,1);assert.equal(r.polylines[0].closed,true);assert.deepEqual(extents(r.polylines[0]),[5,15,0,10]);near(area(r.polylines[0]),100);
});
test('bent path with exit/re-entry retains separate actual domains',()=>{
  const r=engine.cut(cube(),[[-5,3],[15,3],[15,7],[-5,7]]);
  assert.equal(r.polylines.length,2);assert.ok(r.polylines.every(l=>l.closed));near(r.length,44);
  assert.deepEqual(clean(r.polylines.map(extents).sort((a,b)=>a[0]-b[0])),[[5,15,0,10],[29,39,0,10]]);
});
test('path endpoints inside solid remain open, with no fabricated end caps',()=>{
  const r=engine.cut(cube(),[[2,5],[8,5]]);assert.equal(r.closedSolid,true);assert.equal(r.polylines.length,2);assert.ok(r.polylines.every(l=>!l.closed));near(totalLength(r),12);
  assert.ok(r.warnings.some(s=>s.includes('contornos abertos')));
  assert.equal(r.fillPolygons.length,1);near(polygonArea(r.fillPolygons[0]),60);assert.equal(insideFills(r,3,5),true);
  for(const line of r.polylines)for(let i=1;i<line.points.length;i++)assert.ok(Math.abs(line.points[i][0]-line.points[i-1][0])>1e-8,'Clipping must not add vertical cap strokes.');
});
test('partial clipping of coplanar face never adds a boundary not in mesh',()=>{
  const r=engine.cut(cube(),[[2,0],[8,0]]);assert.equal(r.polylines.length,2);assert.ok(r.polylines.every(l=>!l.closed));near(totalLength(r),12);
});
test('duplicate coincident per-face vertices are welded exactly for topology',()=>{
  const c=cube(),m={vertices:[],faces:[]};for(const f of c.faces){const start=m.vertices.length;m.vertices.push(...f.map(i=>c.vertices[i].slice()));m.faces.push([start,start+1,start+2]);}
  const r=engine.cut(m,[[-5,5],[15,5]]);assert.equal(r.closedSolid,true);assert.equal(r.analysis.uniqueVertexCount,8);near(area(r.polylines[0]),100);
});
test('duplicate or invalid triangles disable solid fill rather than conceal loss',()=>{
  const c=cube();c.faces.push(c.faces[0].slice(),[0,0,1],[0,1,999]);
  const a=engine.analyze(c);assert.equal(a.closedSolid,false);assert.equal(a.duplicateFaces,1);assert.equal(a.degenerateFaces,1);assert.equal(a.invalidFaces,1);
});
test('non-manifold shared face/edge mesh is not a validated solid',()=>{
  const m=merge(cube(),cube(10,0,0,20,10,10));const a=engine.analyze(m);assert.equal(a.closedSolid,false);assert.ok(a.nonManifoldEdges>0||a.duplicateFaces>0);
});
test('two closed shells touching at a single vertex fail vertex-manifold validation',()=>{
  const a=engine.analyze(merge(cube(),cube(10,10,10,20,20,20)));
  assert.equal(a.boundaryEdges,0);assert.equal(a.nonManifoldEdges,0);assert.equal(a.closedSolid,false);assert.equal(a.nonManifoldVertices,1);
});
test('orientation mismatch is reported but does not discard exact closed contours',()=>{
  const m=cube();m.faces[0].reverse();const r=engine.cut(m,[[-5,5],[15,5]]);
  assert.equal(r.closedSolid,true);assert.ok(r.analysis.inconsistentWindingEdges>0);near(area(r.polylines[0]),100);
});
test('disjoint open surfaces are not bridged by proximity or extrapolation',()=>{
  const m={vertices:[[0,0,0],[2,0,0],[0,2,0],[10,0,0],[12,0,0],[10,2,0]],faces:[[0,1,2],[3,4,5]]};
  const r=engine.cut(m,[[-5,.5],[20,.5]]);assert.equal(r.polylines.length,2);near(totalLength(r),3);
});
test('zero-length path vertices are harmless but an entirely zero path is rejected',()=>{
  const r=engine.cut(cube(),[[-5,5],[-5,5],[15,5]]);assert.equal(r.polylines.length,1);
  assert.throws(()=>engine.cut(cube(),[[0,0],[0,0]]),/comprimento nulo/);
});
test('invalid coordinates/tolerances are explicitly rejected',()=>{
  assert.throws(()=>engine.cut(cube(),[[0,0],[NaN,1]]),/coordenada inválida/);
  assert.throws(()=>engine.cut(cube(),[[-5,5],[15,5]],{tolerance:-1}),/tolerância/);
  assert.throws(()=>engine.analyze({vertices:[[NaN,0,0]],faces:[[0,0,0]]}),/vértices 3D finitos/);
});
test('input objects are never mutated',()=>{
  const m=cube(),p=[[-5,5],[15,5]],before=JSON.stringify({m,p});engine.cut(m,p);assert.equal(JSON.stringify({m,p}),before);
});
test('high-resolution topology uses linear-time stitching and preserves full mesh',()=>{
  const n=2000,m={vertices:[],faces:[]};for(let i=0;i<=n;i++){m.vertices.push([i,0,i/10],[i,2,i/10+2]);}
  for(let i=0;i<n;i++){const b=i*2;m.faces.push([b,b+2,b+3],[b,b+3,b+1]);}
  const r=engine.cut(m,[[-1,1],[n+1,1]]);assert.equal(r.polylines.length,1);assert.equal(r.analysis.validFaceCount,n*2);near(totalLength(r),Math.hypot(n,n/10),1e-5);
});
test('partial A/B window clipped through a cavity preserves empty inner region',()=>{
  const inner=cube(2,2,2,8,8,8);inner.faces=inner.faces.map(f=>f.slice().reverse());
  const r=engine.cut(merge(cube(),inner),[[5,5],[9,5]]);
  assert.equal(r.fillPolygons.length,2);assert.deepEqual(clean(r.fillPolygons.map(polygonArea).sort((a,b)=>a-b)),[18,40]);
  assert.equal(insideFills(r,1,5),false);assert.equal(insideFills(r,3.5,5),true);assert.equal(insideFills(r,1,1),true);
});
test('bent path wholly inside a closed solid fills by leg without stroke at fold',()=>{
  const r=engine.cut(cube(),[[2,5],[5,5],[5,8]]);
  assert.equal(r.fillPolygons.length,2);near(r.fillPolygons.reduce((s,p)=>s+polygonArea(p),0),60);
  assert.equal(insideFills(r,1,5),true);assert.equal(insideFills(r,4,5),true);near(totalLength(r),12);
  assert.equal(r.polylines.length,2);assert.ok(r.polylines.every(p=>!p.closed));
});
test('finite fill window does not extend outside the true mesh shape',()=>{
  const r=engine.cut(cube(),[[5,5],[15,5]]);assert.equal(r.fillPolygons.length,1);near(polygonArea(r.fillPolygons[0]),50);
  assert.equal(insideFills(r,1,5),true);assert.equal(insideFills(r,8,5),false);
});
test('closed outline of an open coplanar surface never becomes a volume fill',()=>{
  const m={vertices:[[0,0,0],[10,0,0],[10,0,10],[0,0,10]],faces:[[0,1,2],[0,2,3]]};
  const r=engine.cut(m,[[2,0],[8,0]]);assert.equal(r.closedSolid,false);assert.deepEqual(clean(r.fillPolygons),[]);
});
test('non-manifold input cannot produce fill even with closed apparent loops',()=>{
  const c=cube();c.faces.push(c.faces[0].slice());const r=engine.cut(c,[[2,5],[8,5]]);assert.equal(r.closedSolid,false);assert.equal(r.fillPolygons.length,0);
});

console.log(`Mesh section engine: ${passed} tests passed.`);
