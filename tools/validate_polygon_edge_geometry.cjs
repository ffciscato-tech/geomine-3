// Pure geometry regression tests. Synthetic fixtures only; no DOM/app state.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ctx=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'src/modules/cad/polygon-edge-geometry.js'),'utf8'),ctx);
const {rings,translate}=ctx.GeoMinePolygonEdgeGeometry,plain=value=>JSON.parse(JSON.stringify(value));
const square=()=>[[0,0],[10,0],[10,10],[0,10]],closed=()=>[...square(),[0,0]],clone=value=>structuredClone(value);
let passed=0,failed=0;
function test(name,run){try{run();passed++;console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+e.stack);}}
function equal(a,b){assert.deepEqual(plain(a),plain(b));}
function freeze(value){if(Array.isArray(value)){value.forEach(freeze);Object.freeze(value);}return value;}

test('flat explicit and implicit rings expose original point references and independent paths',()=>{
 const a=square(),b=closed(),ra=rings(a)[0],rb=rings(b)[0];
 equal(ra.path,[]);assert.equal(ra.points,a);assert.equal(ra.closed,false);assert.equal(ra.count,4);
 assert.equal(rb.points,b);assert.equal(rb.closed,true);assert.equal(rb.count,4);assert.notEqual(ra.path,rb.path);
});
test('ordinary edge moves precisely its two endpoints',()=>{
 const g=square(),before=clone(g),out=translate(g,{path:[],index:1},2,3);
 equal(out,[[0,0],[12,3],[12,13],[0,10]]);equal(g,before);
});
test('closing edge of an implicit ring moves last and first without appending a closure',()=>{
 const out=translate(square(),{path:[],index:3},-2,1);
 equal(out,[[-2,1],[10,0],[10,10],[-2,11]]);assert.equal(rings(out)[0].closed,false);assert.equal(out.length,4);
});
test('closing edge of an explicit ring updates both logical endpoints and duplicate closure',()=>{
 const out=translate(closed(),{path:[],index:3},-2,1);
 equal(out,[[-2,1],[10,0],[10,10],[-2,11],[-2,1]]);assert.equal(rings(out)[0].closed,true);
});
test('near closure uses the legacy Euclidean tolerance and strict boundary',()=>{
 for(const [last,expected] of [[[1e-8,0],true],[[5e-8,5e-8],true],[[8e-8,8e-8],false],[[1e-7,0],false]]){
  const g=[...square(),last],r=rings(g)[0];assert.equal(r.closed,expected);assert.equal(r.count,expected?4:5);assert.equal(r.points,g);
 }
});
test('last edge of a nearly closed ring moves logical vertex zero and keeps closure Z/M',()=>{
 const g=[[0,0,1,11],[10,0,2,22],[10,10,3,33],[0,10,4,44],[1e-8,-0,99,999]],before=clone(g);
 const out=translate(g,{path:[],index:3},-2,0);
 equal(out,[[-2,0,1,11],[10,0,2,22],[10,10,3,33],[-2,10,4,44],[-2,0,99,999]]);
 assert.ok(Object.is(out[4][1],-0));assert.equal(rings(out)[0].count,4);equal(g,before);
 assert.throws(()=>translate(g,{path:[],index:4},-2,0));
});
test('first edge of a nearly closed ring keeps the final point tied to the first',()=>{
 const g=[[0,0,1,11],[10,0,2,22],[10,10,3,33],[0,10,4,44],[1e-8,2e-8,99,999]];
 const out=translate(g,{path:[],index:0},1,-2);
 equal(out,[[1,-2,1,11],[11,-2,2,22],[10,10,3,33],[0,10,4,44],[1,-2,99,999]]);assert.equal(rings(out)[0].closed,true);
});
test('zero move and interior-edge move do not normalize a nearly closed duplicate',()=>{
 const g=[[0,0],[10,0],[10,10],[0,10],[1e-8,-0,99,999]];
 for(const index of [0,1,3]){const out=translate(g,{path:[],index},0,-0);equal(out,g);assert.ok(Object.is(out[4][1],-0));assert.notEqual(out,g);}
 const out=translate(g,{path:[],index:1},1,0);equal(out[4],g[4]);assert.ok(Object.is(out[4][1],-0));
});
test('near-closing holes and nested parts use the same logical last edge',()=>{
 const near=[...square(),[1e-8,0,7,8]],g=[[closed(),near],[near]],before=clone(g),out=translate(g,{path:[0,1],index:3},-2,0);
 equal(rings(g).map(r=>[r.path,r.closed,r.count]),[[[0,0],true,4],[[0,1],true,4],[[1,0],true,4]]);
 equal(out[0][1],[[-2,0],[10,0],[10,10],[-2,10],[-2,0,7,8]]);equal(out[0][0],before[0][0]);equal(out[1],before[1]);equal(g,before);
});
test('first edge updates closure; an interior edge leaves the closure unchanged',()=>{
 equal(translate(closed(),{path:[],index:0},1,-2),[[1,-2],[11,-2],[10,10],[0,10],[1,-2]]);
 equal(translate(closed(),{path:[],index:1},1,-2).at(-1),[0,0]);
});
test('hole path changes only the hole and preserves its orientation/order',()=>{
 const hole=[[2,2],[2,4],[4,4],[4,2],[2,2]],g=[closed(),hole],before=clone(g),out=translate(g,{path:[1],index:1},0,1);
 equal(rings(g).map(r=>r.path),[[0],[1]]);equal(out[0],before[0]);equal(out[1],[[2,2],[2,5],[4,5],[4,2],[2,2]]);equal(g,before);
});
test('nested multipolygon paths preserve all parts and holes',()=>{
 const g=[[closed(),[[2,2],[4,2],[4,4],[2,4]]],[square().map(([x,y])=>[x+20,y])]],before=clone(g);
 equal(rings(g).map(r=>r.path),[[0,0],[0,1],[1,0]]);
 const out=translate(g,{path:[1,0],index:2},0,3);equal(out[0],before[0]);equal(out[1][0],[[20,0],[30,0],[30,13],[20,13]]);equal(g,before);
});
test('additional valid nesting remains structurally identical',()=>{
 const g=[[[[closed()]]]],out=translate(g,{path:[0,0,0,0],index:2},0,1);
 equal(rings(out)[0].path,[0,0,0,0]);equal(out[0][0][0][0][2],[10,11]);
});
test('XYZM coordinates and distinct Z/M at duplicate closure are retained exactly',()=>{
 const g=[[0,0,1,11],[10,0,2,22],[10,10,3,33],[0,10,4,44],[0,0,99,999]],before=clone(g),out=translate(g,{path:[],index:3},-1,2);
 equal(out,[[-1,2,1,11],[10,0,2,22],[10,10,3,33],[-1,12,4,44],[-1,2,99,999]]);equal(g,before);
});
test('mixed XY/XYZ/XYZM vertex lengths survive unchanged',()=>{
 const g=[[0,0],[10,0,5],[10,10,6,7],[0,10,8]],out=translate(g,{path:[],index:1},1,0);
 equal(out,[[0,0],[11,0,5],[11,10,6,7],[0,10,8]]);
});
test('zero delta returns a fully independent clone, even for unselected parts',()=>{
 const g=freeze([closed(),square()]),out=translate(g,{path:[0],index:0},0,-0);equal(out,g);
 assert.notEqual(out,g);assert.notEqual(out[1],g[1]);assert.notEqual(out[1][2],g[1][2]);
 out[1][2][0]=50;assert.equal(g[1][2][0],10);
});
test('zero delta preserves signed zero ordinates',()=>{
 const g=[[-0,-0],[10,0],[10,10],[0,10]],out=translate(g,{path:[],index:0},0,0);
 assert.ok(Object.is(out[0][0],-0));assert.ok(Object.is(out[0][1],-0));
});
test('duplicate closure retains untouched signed zero independently of the first vertex',()=>{
 const g=[[0,0],[10,0],[10,10],[0,10],[-0,-0]];
 for(const index of [0,1,3]){const out=translate(g,{path:[],index},0,0);assert.ok(Object.is(out[4][0],-0));assert.ok(Object.is(out[4][1],-0));}
 const out=translate(g,{path:[],index:0},1,0);assert.equal(out[4][0],1);assert.ok(Object.is(out[4][1],-0));
});
test('clockwise and concave rings remain supported',()=>{
 const clockwise=square().reverse();assert.equal(rings(clockwise)[0].count,4);
 const concave=[[0,0],[8,0],[8,8],[4,4],[0,8]],out=translate(concave,{path:[],index:0},0,-1);
 equal(out,[[0,-1],[8,-1],[8,8],[4,4],[0,8]]);
});
test('large UTM coordinates retain small nonzero areas',()=>{
 const x=500000,y=7400000,g=[[x,y],[x+.001,y],[x+.001,y+.001],[x,y+.001]];
 assert.equal(rings(g)[0].count,4);const out=translate(g,{path:[],index:0},0,-.0001);assert.equal(rings(out)[0].count,4);
});
test('hole containment is not silently imposed by this structural primitive',()=>{
 const g=[closed(),[[2,2],[4,2],[4,4],[2,4]]];assert.equal(rings(translate(g,{path:[1],index:1},20,0)).length,2);
});
test('nonfinite and nonnumeric displacements are rejected without changes',()=>{
 const g=closed(),before=clone(g);for(const [x,y] of [[NaN,0],[0,Infinity],[-Infinity,0],['1',0],[0,null],[undefined,0]])assert.throws(()=>translate(g,{path:[],index:0},x,y));equal(g,before);
});
test('invalid edge paths, indices and duplicate-closure index are rejected',()=>{
 const g=[closed()];for(const edge of [null,{}, {path:[],index:0},{path:[1],index:0},{path:[-1],index:0},{path:['0'],index:0},{path:[0],index:-1},{path:[0],index:.5},{path:[0],index:4},{path:[0],index:NaN},{path:new Array(1),index:0}])assert.throws(()=>translate(g,edge,1,1));
});
test('empty, too-short, malformed, sparse and cyclic geometry is rejected',()=>{
 const sparse=square();delete sparse[1];const cyclic=[];cyclic.push(cyclic);
 for(const g of [null,{},[],[1,2],[[0,0],[1,0]],[[0,0],[1,0],[0,0]],[square(),[]],[[0,0],[10,0],'bad',[0,10]],sparse,cyclic])assert.throws(()=>rings(g));
});
test('nonfinite or malformed ordinates, including Z/M, are rejected',()=>{
 for(const point of [[NaN,0],[0,Infinity],['0',0],[0],[0,0,NaN],[0,0,1,null]]){const g=square();g[0]=point;assert.throws(()=>rings(g));}
 const g=square();g[0]=new Array(2);assert.throws(()=>rings(g));
});
test('zero area and pre-existing zero-length edges are rejected',()=>{
 assert.throws(()=>rings([[0,0],[1,1],[2,2]]));assert.throws(()=>rings([[0,0],[10,0],[10,0],[0,10]]));
});
test('translation that collapses area or a neighboring edge is rejected atomically',()=>{
 const g=closed(),before=clone(g);assert.throws(()=>translate(g,{path:[],index:0},0,10));equal(g,before);
 const pentagon=[[0,0],[10,0],[12,5],[10,10],[0,10]],copy=clone(pentagon);
 assert.throws(()=>translate(pentagon,{path:[],index:0},2,5));equal(pentagon,copy);
});
test('implicit closure must not accidentally become an explicit shorter ring',()=>{
 const g=[[0,0],[10,0],[12,5],[8,10],[0,10]],before=clone(g);
 // The resulting apparent four-vertex closed ring still has nonzero area;
 // reject it because the original five-vertex implicit closure collapsed.
 assert.throws(()=>translate(g,{path:[],index:3},0,-10),/fecho/);equal(g,before);
});
test('overflowing translated coordinates are rejected',()=>{
 assert.throws(()=>translate(square(),{path:[],index:0},Number.MAX_VALUE,Number.MAX_VALUE));
});
test('shared input ring references do not remain aliased in the returned geometry',()=>{
 const ring=closed(),g=[ring,ring],out=translate(g,{path:[0],index:0},0,-1);equal(out[1],ring);assert.notEqual(out[0],out[1]);assert.notEqual(out[0][0],out[1][0]);
});
console.log(`${passed}/${passed+failed} polygon-edge geometry checks passed`);if(failed)process.exitCode=1;
