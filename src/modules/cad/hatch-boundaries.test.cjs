const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'hatch-boundaries.js'),'utf8'),core=fs.readFileSync(path.join(__dirname,'../../core/parts/25-geoprocessing-tin.js'),'utf8');
const ctx={window:{},S:{workCRS:'metric'},reproj:(src,dst,x,y)=>[x,y]};vm.createContext(ctx);vm.runInContext(source,ctx);vm.runInContext(core.slice(core.indexOf('function polygonizeLines('),core.indexOf('/* ---------------- Poligonizar raster')),ctx);
const api=ctx.window.GeoMineHatchBoundaries,polygonize=(paths,tol)=>ctx.polygonizeLines({crs:'metric',features:paths.map(geom=>({geom,multi:false}))},tol),tol=.001;
const square=(x=0,y=0,size=10)=>[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]],plain=v=>JSON.parse(JSON.stringify(v));
const area=r=>{let a=0;for(let i=0;i<r.length-1;i++)a+=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1];return a/2;};
function at(paths,p,tolerance=tol){const before=JSON.stringify(paths),result=api.faceAt(paths,p,tolerance,polygonize);assert.equal(JSON.stringify(paths),before,'input XY/XYZ arrays must remain unchanged');return result;}
test('closed line eligibility uses actual nesting, copies XY and preserves original XYZ',()=>{
 const ring=square().map((p,i)=>[...p,100+i]),open=[[20,0,4],[25,0,5],[25,5,6]],f={geom:ring,multi:true},before=JSON.stringify(f);
 const result=api.closedRings(f,tol);assert.equal(result.length,1);assert(result[0].every(p=>p.length===2));assert.equal(JSON.stringify(f),before);assert.notEqual(result[0],ring);assert.notEqual(result[0][0],ring[0]);
 const nested={geom:[open,ring],multi:false};assert.equal(api.closedRings(nested,tol).length,1);assert.equal(api.closedRings(nested,tol,0).length,0);assert.equal(api.closedRings(nested,tol,1).length,1);
 assert.equal(api.closedRings({geom:open},tol).length,0);assert.equal(api.closedRings({geom:[[0,0],[1,0],[0,0]]},tol).length,0);
 const near=square();near[near.length-1]=[.0005,0];assert.equal(api.closedRings({geom:near},tol).length,1);assert.equal(near.at(-1)[0],.0005);assert.equal(api.closedRings({geom:near},.0001).length,0);
});
test('a closed polyline and four independent segments produce the same bounded face',()=>{
 const ring=square(),a=at([ring],[5,5]),b=at(ring.slice(0,-1).map((p,i)=>[p,ring[i+1]]),[5,5]);assert(a.ok&&b.ok);assert.equal(a.area,100);assert.equal(b.area,100);assert.equal(b.holes.length,0);assert(area(b.outer)>0);
});
test('open-only and exterior clicks are rejected without inventing a map rectangle',()=>{
 assert.equal(at([[[0,0],[10,0]],[[10,0],[10,10]]],[5,5]).code,'open-boundary');
 assert.equal(at([square(),square(20,0)],[15,5]).code,'exterior');assert.equal(at([square(),square(20,0)],[25,5]).area,100);
 assert.equal(at([[[0,0],[0,0]]],[1,1]).code,'open-boundary');assert.equal(at([], [0,0]).code,'no-lines');
});
test('T junctions and full crossings split the smallest face under the click',()=>{
 const outer=square(),vertical=[[5,0],[5,10]],tee=[[0,5],[5,5]];
 assert.equal(at([outer,vertical,tee],[2,2]).area,25);assert.equal(at([outer,vertical,tee],[8,2]).area,50);
 const cross=at([outer,vertical,[[0,5],[10,5]]],[8,8]);assert(cross.ok);assert.equal(cross.area,25);assert.equal(cross.faceCount,4);
});
test('holes include only immediate children; clicks within inner rings and nested islands select those faces',()=>{
 const paths=[square(0,0,20),square(5,5,10),square(8,8,4)],outer=at(paths,[1,1]),inner=at(paths,[6,6]),island=at(paths,[10,10]);
 assert(outer.ok&&inner.ok&&island.ok);assert.equal(outer.holes.length,1);assert.equal(outer.area,300);assert.equal(inner.holes.length,1);assert.equal(inner.area,84);assert.equal(island.holes.length,0);assert.equal(island.area,16);
 assert(area(outer.outer)>0);assert(area(outer.holes[0])<0);assert.equal(outer.rings.length,2);
});
test('duplicate and reversed edges do not duplicate faces or manufacture holes',()=>{
 const ring=square(),edges=ring.slice(0,-1).map((p,i)=>[p,ring[i+1]]),paths=[...edges,...edges.map(p=>p.slice().reverse()),ring];const result=at(paths,[5,5]);assert(result.ok);assert.equal(result.area,100);assert.equal(result.faceCount,1);assert.equal(result.holes.length,0);
 const rotated=[ring[1],ring[2],ring[3],ring[0],ring[1]],dedup=api.faceAt([ring],[5,5],tol,()=>[ring,rotated,ring.slice().reverse()]);assert(dedup.ok);assert.equal(dedup.faceCount,1);assert.equal(dedup.holes.length,0);
});
test('boundary clicks and clicks within tolerance are explicit failures',()=>{
 for(const p of [[0,5],[.0005,5],[0,0],[10,10]]){const result=at([square()],p);assert.equal(result.code,'boundary');assert(result.message.includes('interior'));}
 assert.equal(at([square(0,0,20),square(5,5,10)],[5,10]).code,'boundary');
});
test('endpoint gaps respect the explicit tolerance instead of silently closing open paths',()=>{
 const paths=[[[0,0],[10,0]],[[10,0],[10,10]],[[10,10],[0,10]],[[0,10],[0,.005]]];assert(at(paths,[5,5],.01).ok);assert.equal(at(paths,[5,5],.0001).code,'open-boundary');
});
test('invalid coordinate runs never bridge a gap and callback mutation cannot affect original paths',()=>{
 const bad=[[[0,0],[10,0],[10,10],null,[0,10],[0,0]]];assert.equal(at(bad,[5,5]).code,'open-boundary');
 const ring=square().map(p=>[...p,3]),before=JSON.stringify(ring);const result=api.faceAt([ring],[5,5],tol,paths=>{assert(paths[0].every(p=>p.length===2));paths[0][0][0]=123;return [square()];});assert(result.ok);assert.equal(JSON.stringify(ring),before);
 assert.equal(api.faceAt([square()],null,tol,polygonize).code,'invalid-point');assert.equal(api.faceAt([square()],[5,5],tol,()=>{throw new Error('test failure');}).code,'polygonizer-error');
});
test('workerSource installs an independent API with the same geometry results',()=>{
 const worker={self:{}};vm.createContext(worker);vm.runInContext(api.workerSource(),worker);const independent=worker.self.GeoMineHatchBoundaries;assert.equal(typeof independent.faceAt,'function');
 const paths=[square(0,0,20),square(5,5,10)];assert.deepEqual(plain(independent.faceAt(paths,[1,1],tol,polygonize)),plain(api.faceAt(paths,[1,1],tol,polygonize)));
 assert.deepEqual(plain(independent.closedRings({geom:square()},tol)),plain(api.closedRings({geom:square()},tol)));
});
