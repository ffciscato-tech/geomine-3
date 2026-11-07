import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/modules/cad/mouse-rotation.js',import.meta.url),'utf8');
const editor=fs.readFileSync(new URL('../src/core/parts/27-vector-editor.js',import.meta.url),'utf8');
const context={};vm.createContext(context);
for(const [code,from,to]of [[editor,'function edInRing(','/* Douglas'],[editor,'function edCentroide(','function edMapPts('],[source,'function centroid(','function start(']]){
 const start=code.indexOf(from),end=code.indexOf(to,start);assert.ok(start>=0&&end>start);vm.runInContext(code.slice(start,end),context);
}
function near(actual,expected){assert.equal(actual.length,expected.length);actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-7,`${actual} != ${expected}`));}
const square=[[0,0],[10,0],[10,10],[0,10],[0,0]],hole=[[1,1],[3,1],[3,3],[1,3],[1,1]];
near(context.centroid([square],'polygon'),[5,5]);
near(context.centroid([square.slice(0,-1)],'polygon'),[5,5]);
near(context.centroid([square,hole],'polygon'),[5.125,5.125]);
near(context.centroid([square,hole.slice().reverse()],'polygon'),[5.125,5.125]);
near(context.centroid([[[0,0],[1,0],[10,0]]],'line'),[5,0]);
near(context.centroid([[[0,0],[10,0]],[[20,0],[30,0]]],'line'),[15,0]);
near(context.centroid([square.map(([x,y])=>[500000+x,7400000+y])],'polygon'),[500005,7400005]);
near(context.centroid([[[8,9]]],'point'),[8,9]);
console.log('PASS centroid: closed/open polygon, holes in both orientations, unequal segments, multipart line, UTM precision and point');
