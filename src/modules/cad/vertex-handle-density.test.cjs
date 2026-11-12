const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../core/parts/12-feature-selection-vertices.js'),'utf8'),ctx={toWGS:(crs,x,y)=>[x,y]};
vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function vertexHandleDensity('),source.indexOf('function showVertices(')),ctx);
test('dense glyphs are spaced across neighboring screen cells without mutating points',()=>{
 const points=Array.from({length:10001},(_,i)=>({x:i*.05,y:0})),before=JSON.stringify(points),grid=ctx.vertexHandleDensity(10),kept=points.filter(p=>grid.take(p));
 assert(kept.length<=51);assert(kept.length>45);for(let i=1;i<kept.length;i++)assert(kept[i].x-kept[i-1].x>=10);assert.equal(JSON.stringify(points),before);
 const boundary=ctx.vertexHandleDensity(10);assert(boundary.take({x:9.9,y:0}));assert(!boundary.take({x:10.1,y:0}));assert(!boundary.take({x:.1,y:-.1}));
});
test('selected and endpoint positions can be reserved and suppress overlapping unselected handles',()=>{
 const grid=ctx.vertexHandleDensity(10),selected={x:15,y:10},endpoint={x:100,y:10};grid.reserve(selected);grid.reserve(endpoint);
 assert(!grid.take({x:14,y:10}));assert(!grid.take({x:101,y:10}));assert(grid.take({x:15,y:30}));assert(grid.near(selected));
 assert(grid.take({x:15.5,y:10},true),'selected vertices remain displayable even when close together');
});
test('zooming in reveals every source vertex and midpoint clearance follows rendered glyphs',()=>{
 const points=Array.from({length:1000},(_,i)=>({x:i*.05,y:0})),small=ctx.vertexHandleDensity(10),zoom=ctx.vertexHandleDensity(10);
 assert(points.filter(p=>small.take(p)).length<10);assert.equal(points.filter(p=>zoom.take({x:p.x*300,y:0})).length,points.length);
 assert(small.near({x:1,y:0}));assert(!small.near({x:500,y:0}));
});
test('box selection tests every actual source index, including hidden handles, and excludes duplicated closure',()=>{
 const ring=Array.from({length:1000},(_,i)=>[i,2,100+i]);ring.push(ring[0].slice());const before=JSON.stringify(ring),selected=ctx.vertexIndicesInBounds({L:{crs:'native'},ring,fechado:true,marks:[{vi:0}]},{contains:p=>p[1]>=100&&p[1]<=899});
 assert.equal(selected.length,800);assert.equal(selected[0],100);assert.equal(selected.at(-1),899);assert.equal(JSON.stringify(ring),before);
 const all=ctx.vertexIndicesInBounds({L:{crs:'native'},ring,fechado:true},{contains:()=>true});assert.equal(all.length,1000);
});
