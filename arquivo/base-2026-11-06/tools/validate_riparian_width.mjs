import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const source=fs.readFileSync(fileURLToPath(new URL('../src/modules/environmental/riparian-width.js',import.meta.url)),'utf8');
const sandbox={window:{}};vm.runInNewContext(source,sandbox);
// The worker receives only this serialized function, without module dependencies.
const factory=vm.runInNewContext('('+sandbox.window.GeoMineRiparianWidth.engine.toString()+')');
const {measure}=factory();
const rect=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
const rotate=(r,angle)=>r.map(([x,y])=>[500000+x*Math.cos(angle)-y*Math.sin(angle),7400000+x*Math.sin(angle)+y*Math.cos(angle)]);
for(const angle of [0,.13,Math.PI/4,1.37,Math.PI/2,2.61]){
  for(const reverse of [false,true]){
    const ring=rotate(rect(0,0,100,5),angle);if(reverse)ring.reverse();
    const before=JSON.stringify(ring),result=measure([ring]);
    assert.equal(JSON.stringify(ring),before,'source geometry preserved');
    assert.ok(result.segments.length>=42);
    for(const sample of result.segments){assert.ok(Math.abs(sample.width-5)<1e-7,`5 m rectangle, angle ${angle}: ${sample.width}`);assert.ok(Math.abs(Math.hypot(sample.section[1][0]-sample.section[0][0],sample.section[1][1]-sample.section[0][1])-sample.width)<1e-7);}
    assert.ok(result.warnings.length);
  }
}
// Numerical noise in projected coordinates must not move a geometric threshold.
for(const width of [10,50,200,600]){
  const result=measure([rotate(rect(0,0,1000,width),.713)]);
  assert.ok(result.segments.every(s=>s.width===width),`stable ${width} m threshold`);
}
// One feature with two genuine width classes; no single feature-wide mean.
const varying=[[0,0],[100,0],[100,12],[60,12],[40,8],[0,8],[0,0]];
const varied=measure([varying]);
const narrow=varied.segments.filter(s=>s.line.every(p=>p[0]>5&&p[0]<35));
const wide=varied.segments.filter(s=>s.line.every(p=>p[0]>65&&p[0]<95));
assert.ok(narrow.length&&wide.length);assert.ok(narrow.every(s=>Math.abs(s.width-8)<1e-8));assert.ok(wide.every(s=>Math.abs(s.width-12)<1e-8));
// A U-shaped channel cannot be measured as its bounding-box width (100 m).
const u=[[0,0],[100,0],[100,100],[95,100],[95,5],[5,5],[5,100],[0,100],[0,0]];
const bent=measure([u]);
assert.ok(bent.segments.every(s=>s.width>=4.9&&s.width<10),'local width of a 5 m U remains local, including bends');
assert.ok(bent.segments.filter(s=>s.line.every(p=>p[1]>15)).every(s=>Math.abs(s.width-5)<1e-8));
// Refusal is explicit and transactional when topology does not identify one channel.
assert.throws(()=>measure([rect(0,0,100,30),rect(40,10,20,10)]),/ilhas|furos/);
assert.throws(()=>measure([rect(0,0,100,5),rect(200,0,100,12)]),/partes/);
assert.throws(()=>measure([[[0,0],[10,10],[0,10],[10,0],[0,0]]]),/degenerada|cruza/);
assert.throws(()=>measure([[[0,0],[10,0],[3,0],[3,5],[0,5],[0,0]]]),/cruza|sobreposta/);
assert.throws(()=>measure([[[0,0],[NaN,5],[10,0],[0,0]]]),/inválida/);
for(const step of [0,-1,NaN,Infinity])assert.throws(()=>measure([rect(0,0,100,5)],{step}),/intervalo/);
assert.throws(()=>measure([rect(0,0,12000,5)]),/4.000/);
const unclosed=rect(0,0,100,5).slice(0,-1);assert.ok(measure([unclosed]).segments.every(s=>Math.abs(s.width-5)<1e-8));
console.log('PASS standalone worker engine; rotated/reversed 5 m calhas; variable 8→12 m; U-shaped channel; review sections; non-mutation; topology refusals and calculation limits.');

const nearDuplicate=[[0,0],[1e-8,0],[100,0],[100,5],[0,5],[0,0]];
assert.ok(measure([nearDuplicate]).segments.every(s=>Math.abs(s.width-5)<1e-7));
assert.equal(nearDuplicate.length,6);
