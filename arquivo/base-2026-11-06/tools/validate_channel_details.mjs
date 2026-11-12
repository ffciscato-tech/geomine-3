/* Pure unit contract for the in-app channel detail image feature.
   No browser, image-generation service, source mutation or project commit. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const engineFile=path.join(root,'src/modules/environmental/channel-extraction-engine.js');
const detailsFile=path.join(root,'src/modules/environmental/channel-details.js');
assert.ok(fs.existsSync(detailsFile),'Create src/modules/environmental/channel-details.js before running this contract test.');
const context=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(engineFile,'utf8'),context,{filename:engineFile});
// Loading the pure API must not need document, project state, Leaflet or a MDT.
vm.runInContext(fs.readFileSync(detailsFile,'utf8'),context,{filename:detailsFile});
const engine=context.window.GeoMineChannelEngine.engine();
const details=context.window.GeoMineChannelDetails;
assert.equal(typeof details?.prepare,'function');
assert.equal(typeof details?.renderSVG,'function');
const clone=value=>JSON.parse(JSON.stringify(value));
const near=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
let passed=0;
function test(name,run){run();passed++;console.log('PASS '+name);}

function output({length=120,y=0,index=1,mode='depth'}={}){
  const plan=engine.plan([[500000,7400000+y],[500000+length,7400000+y]],{interval:10,lateralStep:.25,reach:10});
  const heights=plan.sections.map(section=>section.points.map(([x,py])=>{
    const distance=Math.abs(py-7400000-y);
    return 100+.1*(x-500000)+(mode==='auto'?Math.min(distance,3):distance);
  }));
  return {...clone(engine.analyze(plan,heights,{mode,height:2.5,resolution:.5})),index,searchReach:10};
}
function snapshot(outputs=[output()]){
  return {layerName:'Linha-guia do rio',rasterName:'MDT LiDAR',crs:'EPSG:31982',mode:'depth',height:2.5,resolution:.5,outputs};
}
const data=snapshot(),original=JSON.stringify(data),pages=details.prepare(data,{segmentLength:50});

test('preserves input and separates by existing section stations',()=>{
  assert.equal(JSON.stringify(data),original);
  assert.equal(pages.length,3);
  assert.deepEqual(clone(pages.map(p=>[p.start,p.end])),[[0,50],[50,100],[100,120]]);
  assert.deepEqual(clone(pages.map(p=>p.sections.length)),[6,6,3]);
  assert.deepEqual(clone(pages.map(p=>p.part)),[1,2,3]);
  assert.ok(pages.every(p=>p.total===3&&p.axisIndex===1&&p.id));
  assert.equal(new Set(pages.map(p=>p.id)).size,pages.length);
});

test('adjacent sheets share one calculated boundary without gaps or invented profiles',()=>{
  for(let i=1;i<pages.length;i++)assert.deepEqual(clone(pages[i-1].sections.at(-1)),clone(pages[i].sections[0]));
  const originalSections=data.outputs[0].sections;
  for(const p of pages){
    assert.equal(p.start,p.sections[0].station);assert.equal(p.end,p.sections.at(-1).station);
    assert.ok(p.end>p.start&&p.sections.length>=2);
    for(const s of p.sections)assert.deepEqual(clone(s),originalSections.find(v=>v.station===s.station));
  }
  const stations=pages.flatMap(p=>p.sections.map(s=>s.station));
  assert.deepEqual([...new Set(stations)],originalSections.map(s=>s.station));
});

test('target length rounds outward to the first calculated station and keeps the final remainder',()=>{
  const r=details.prepare(data,{segmentLength:45});
  assert.deepEqual(clone(r.map(p=>[p.start,p.end])),[[0,50],[50,100],[100,120]]);
  const tiny=details.prepare(snapshot([output({length:20})]),{segmentLength:50});
  assert.equal(tiny.length,1);near(tiny[0].end,20);assert.equal(tiny[0].sections.length,3);
});

test('multiple axes never mix, page numbering resets and identifiers remain unique',()=>{
  const r=details.prepare(snapshot([output(),output({length:70,y:100,index:7})]),{segmentLength:50});
  assert.equal(r.length,5);
  assert.deepEqual(clone(r.map(p=>[p.axisIndex,p.part,p.total,p.start,p.end])),[[1,1,3,0,50],[1,2,3,50,100],[1,3,3,100,120],[7,1,2,0,50],[7,2,2,50,70]]);
  assert.equal(new Set(r.map(p=>p.id)).size,5);
  for(const p of r){const y=p.axisIndex===1?7400000:7400100;assert.ok(p.sections.every(s=>s.center[1]===y));}
});

test('metadata preserves source, CRS, depth and the actual searched reach',()=>{
  for(const p of pages){
    assert.equal(p.layerName,data.layerName);assert.equal(p.rasterName,data.rasterName);assert.equal(p.crs,data.crs);
    assert.equal(p.mode,'depth');near(p.height,2.5);near(p.resolution,.5);near(p.searchReach,10);
    for(const s of p.sections){near(s.level-s.zFloor,2.5);near(s.width,5);}
  }
});

test('automatic data retain their own mode instead of becoming an informed depth',()=>{
  const auto=snapshot([output({mode:'auto'})]);auto.mode='auto';auto.height=99;
  const result=details.prepare(auto,{segmentLength:50});
  assert.ok(result.every(p=>p.mode==='auto'&&p.sections.every(s=>s.mode==='auto')));
  const svg=details.renderSVG(result[0],{width:1600,height:1140});
  assert.match(svg,/autom[aá]tic/i);
  assert.doesNotMatch(svg,/profundidade\s*(?:informada)?\s*:?\s*99(?:[.,]0+)?/i);
});

test('an 80-image budget is allowed; excess is refused before rendering',()=>{
  const eighty=snapshot(Array.from({length:80},(_,i)=>output({length:20,y:i*100,index:i+1})));
  assert.equal(details.prepare(eighty,{segmentLength:50}).length,80);
  const excess=clone(eighty);excess.outputs.push(output({length:20,y:8000,index:81}));
  assert.throws(()=>details.prepare(excess,{segmentLength:50}),/80|limite|muitas|imagens/i);
});

test('SVG is self-contained, uses explicit dimensions and escapes source names',()=>{
  const malicious=clone(data);
  malicious.layerName='Rio <script>alert(1)</script> & "Teste"';
  malicious.rasterName='MDT <img src=x onerror=alert(2)> & amostra';
  const p=details.prepare(malicious,{segmentLength:50})[0],before=JSON.stringify(p);
  const svg=details.renderSVG(p,{width:1600,height:1140});
  assert.equal(typeof svg,'string');assert.match(svg,/<svg\b/);
  assert.match(svg,/viewBox=["']0\s+0\s+1600\s+1140["']/);
  assert.match(svg,/&lt;script&gt;/);assert.match(svg,/&amp;/);
  assert.doesNotMatch(svg,/<(?:script|foreignObject|iframe|img|image)\b/i);
  assert.doesNotMatch(svg,/(?:href|src)\s*=\s*["'](?:https?:|\/\/)|@import|url\(\s*["']?https?:/i);
  assert.doesNotMatch(svg,/\b(?:NaN|Infinity|undefined)\b/);
  assert.match(svg,/topogr[aá]fic/i);assert.match(svg,/hidr[aá]ulic/i);
  assert.equal(JSON.stringify(p),before);
});

test('nullable samples outside the closed channel do not become zero or invalid coordinates',()=>{
  const gaps=clone(data);
  for(const s of gaps.outputs[0].sections)for(const p of s.profile)if(Math.abs(p.offset)>8)p.z=null;
  const before=JSON.stringify(gaps),r=details.prepare(gaps,{segmentLength:50});
  const svg=details.renderSVG(r[0],{width:1600,height:1140});
  assert.doesNotMatch(svg,/\b(?:NaN|Infinity|undefined)\b/);
  assert.equal(JSON.stringify(gaps),before);
  assert.ok(r[0].sections[0].profile.some(p=>p.z===null));
});

// Geometry-only render contract: holes and disconnected polygons are supplied
// explicitly, not reconstructed from interpolated section envelopes.
function axisSnapshot(){
  const snap=snapshot();snap.mode='axisDepth';snap.height=2;
  const out=snap.outputs[0],xy=(station,offset)=>[500000+station,7400000+offset];
  const rectangle=(a,b,c,d)=>[xy(a,c),xy(b,c),xy(b,d),xy(a,d),xy(a,c)];
  out.mode='axisDepth';out.polygons=[[rectangle(0,120,-4,4),rectangle(40,60,1,3)],[rectangle(80,100,8,10)]];out.ring=clone(out.polygons[0][0]);
  for(const s of out.sections){
    const interval=(a,b)=>({right:xy(s.station,a),left:xy(s.station,b),rightOffset:a,leftOffset:b,width:b-a,zlevelR:s.zAxis+2+.02*a,zlevelL:s.zAxis+2+.02*b});
    const hole=s.station>=40&&s.station<=60,second=s.station>=80&&s.station<=100;
    s.wetIntervals=hole?[interval(-4,1),interval(3,4)]:[interval(-4,4)];if(second)s.wetIntervals.push(interval(8,10));
    s.mode='axisDepth';s.zReference=s.zAxis;s.referenceKind='axis';s.referencePoint=s.center.slice();s.referenceOffset=0;
    s.zFloor=null;s.floorPoint=null;s.floorOffset=null;s.level=s.zAxis+2;s.effectiveHeight=2;s.detection=null;
    s.rightOffset=s.wetIntervals[0].rightOffset;s.leftOffset=s.wetIntervals.at(-1).leftOffset;
    s.right=s.wetIntervals[0].right.slice();s.left=s.wetIntervals.at(-1).left.slice();s.width=s.wetIntervals.reduce((n,i)=>n+i.width,0);s.spanWidth=s.leftOffset-s.rightOffset;
    s.profile=Array.from({length:49},(_,i)=>{const offset=-12+i*.5;return {offset,z:s.zAxis+Math.abs(offset)/2,level:s.level+.02*offset,wet:s.wetIntervals.some(w=>offset>=w.rightOffset&&offset<=w.leftOffset)};});
  }
  return snap;
}

test('axisDepth accepts null floor fields and retains the axis reference and true polygons',()=>{
  const snap=axisSnapshot(),before=JSON.stringify(snap),r=details.prepare(snap,{segmentLength:50});
  assert.equal(r.length,3);assert.equal(JSON.stringify(snap),before);
  for(const p of r){
    assert.equal(p.mode,'axisDepth');assert.equal(p.referenceKind,'axis');assert.equal(p.mapScope,'full-axis');
    assert.deepEqual(clone(p.polygons),snap.outputs[0].polygons);
    assert.deepEqual(clone(p.axisGuide),snap.outputs[0].sections.map(s=>s.center));
    for(const s of p.sections){assert.equal(s.zFloor,null);assert.equal(s.floorPoint,null);near(s.level-s.zReference,2);}
  }
});

test('axisDepth draws real multipolygons with evenodd holes, never an envelope between banks',()=>{
  const page=details.prepare(axisSnapshot(),{segmentLength:50})[0],svg=details.renderSVG(page);
  const paths=svg.match(/<path\b[^>]*data-role="axis-fill-polygon"[^>]*>/g)||[];
  assert.equal(paths.length,2);assert.ok(paths.every(p=>p.includes('fill-rule="evenodd"')));
  assert.match(paths[0],/data-rings="2"/);assert.match(paths[1],/data-rings="1"/);
  assert.equal((paths[0].match(/Z/g)||[]).length,2);assert.equal((paths[1].match(/Z/g)||[]).length,1);
  assert.doesNotMatch(svg,/fill="#d5efeb"/);
  assert.match(svg,/Mancha 2D completa/);assert.match(svg,/sem recorte artificial/);assert.match(svg,/soma molhada/);
});

test('axisDepth reports summed wet width separately from full span and never labels the axis as floor',()=>{
  const r=details.prepare(axisSnapshot(),{segmentLength:50}),s=r[0].sections.at(-1),svg=details.renderSVG(r[0]);
  near(s.width,6);near(s.spanWidth,8);
  assert.match(svg,/Molhado 6,00 m · extensão 8,00 m/);
  assert.match(svg,/Altura acima do eixo: 2,00 m/);assert.match(svg,/cota do eixo e nível local/);
  assert.doesNotMatch(svg,/Fundo |Marrom: fundo|Profundidade informada|NaN|Infinity|undefined/);
  assert.equal((svg.match(/data-role="profile-wet-interval"/g)||[]).length,4,'first/middle/final profiles include the two separated final intervals');
});

test('axisDepth profiles use actual sampled levels and keep dry gaps disconnected',()=>{
  const snap=axisSnapshot(),p=details.prepare(snap,{segmentLength:50})[0],svg=details.renderSVG(p);
  const path=svg.match(/<path data-role="profile-wet-interval"[^>]+/)[0];
  const yValues=[...path.matchAll(/[ML][\d.-]+,([\d.-]+)/g)].map(m=>Number(m[1]));
  assert.ok(new Set(yValues).size>2,'sampled transverse surface is not replaced by a flat level');
  const broken=axisSnapshot();broken.outputs[0].sections[0].profile.find(q=>q.offset===0).wet=false;
  const brokenSVG=details.renderSVG(details.prepare(broken,{segmentLength:50})[0]);
  const brokenPath=brokenSVG.match(/<path data-role="profile-wet-interval"[^>]+/)[0];
  assert.ok((brokenPath.match(/M[\d.-]+,/g)||[]).length>=2,'dry samples break the rendered surface');
});

test('axisDepth refuses missing polygons, missing reference and inconsistent wet widths',()=>{
  const missing=axisSnapshot();delete missing.outputs[0].polygons;assert.throws(()=>details.prepare(missing),/2D|polígono/i);
  const reference=axisSnapshot();delete reference.outputs[0].sections[0].zReference;assert.throws(()=>details.prepare(reference),/dados válidos|referência/i);
  const width=axisSnapshot();width.outputs[0].sections[0].width+=1;assert.throws(()=>details.prepare(width),/soma molhada/i);
  const overlap=axisSnapshot();overlap.outputs[0].sections[4].wetIntervals[1].rightOffset=0;assert.throws(()=>details.prepare(overlap),/intervalos molhados/i);
});

test('250,000 profile samples render without argument stack overflow or input mutation',()=>{
  for(const axisReference of [false,true]){
    const snap=axisReference?axisSnapshot():snapshot();
    snap.outputs[0].sections=snap.outputs[0].sections.slice(0,2);
    for(const s of snap.outputs[0].sections){
      s.profile=Array.from({length:125000},(_,i)=>{
        const offset=-10+20*i/124999;
        return {offset,z:s.zAxis+Math.abs(offset),...(axisReference?{level:s.level+.02*offset,wet:Math.abs(offset)<=4}:{})};
      });
    }
    const before=JSON.stringify(snap),page=details.prepare(snap)[0];
    assert.equal(page.sections.reduce((n,s)=>n+s.profile.length,0),250000);
    const svg=details.renderSVG(page);
    assert.match(svg,/<svg\b/);assert.doesNotMatch(svg,/\b(?:NaN|Infinity|undefined)\b/);
    assert.equal(JSON.stringify(snap),before);
  }
});

console.log(`channel details: ${passed}/${passed} pure contract tests PASS`);
