import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const source=fs.readFileSync(fileURLToPath(new URL('../src/modules/environmental/channel-extraction-engine.js',import.meta.url)),'utf8');
const sandbox={window:{}};vm.runInNewContext(source,sandbox);
const {plan,analyze}=vm.runInNewContext('('+sandbox.window.GeoMineChannelEngine.engine.toString()+')')();
vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL('../src/modules/environmental/channel-search-policy.js',import.meta.url)),'utf8'),sandbox);
const searchPolicy=sandbox.window.GeoMineChannelSearchPolicy;
const settings={interval:10,lateralStep:.25,reach:10},options={height:2,resolution:.5};
const heights=(p,fn)=>p.sections.map(s=>s.points.map(([x,y],i)=>fn(x,y,s.offsets[i],s)));
const close=(a,b,eps=1e-7)=>assert.ok(Math.abs(a-b)<=eps,`${a} ≈ ${b}`);
const plain=x=>JSON.parse(JSON.stringify(x));
const sortedRing=r=>r.slice(0,-1).map(p=>p.map(v=>Math.round(v*1e6)/1e6).join(',')).sort();
const line=[[0,0],[30,0],[100,0]],snapshot=JSON.stringify(line),layout=plan(line,settings),savedPlan=JSON.stringify(layout);
assert.equal(JSON.stringify(line),snapshot);assert.ok(layout.sections.some(s=>s.center[0]===30));assert.equal(layout.sampleCount,layout.sections.length*layout.sections[0].points.length);
let z=heights(layout,(x,y)=>100+Math.abs(y)),zBefore=JSON.stringify(z),v=analyze(layout,z,options);
assert.equal(JSON.stringify(z),zBefore);assert.equal(JSON.stringify(layout),savedPlan);
assert.ok(v.sections.every(s=>Math.abs(s.width-4)<1e-8));assert.ok(v.sections.every(s=>s.level===102&&s.zAxis===100));assert.ok(v.warnings.some(w=>/interpolação linear/.test(w)));
// Flat bottom, sloping banks, then unequal slopes on the two sides.
let trap=analyze(layout,heights(layout,(x,y)=>100+Math.max(0,Math.abs(y)-2)*.5),{...options,height:1});
assert.ok(trap.sections.every(s=>Math.abs(s.width-8)<1e-8));
let asym=analyze(layout,heights(layout,(x,y)=>100+(y>0?2*y:-y)),options);
assert.ok(asym.sections.every(s=>Math.abs(s.left[1]-1)<1e-8&&Math.abs(s.right[1]+2)<1e-8&&Math.abs(s.width-3)<1e-8));
// A declining river gets a different local level at every station, unchanged width.
const decline=analyze(layout,heights(layout,(x,y)=>200-x*.07+Math.abs(y)),options);
assert.ok(decline.sections.every(s=>Math.abs(s.width-4)<1e-8));assert.notEqual(decline.sections[0].level,decline.sections.at(-1).level);
const reversed=plan(line.slice().reverse(),settings),revResult=analyze(reversed,heights(reversed,(x,y)=>200-x*.07+Math.abs(y)),options);
assert.deepEqual(sortedRing(decline.ring),sortedRing(revResult.ring));
for(const angle of [.37,Math.PI/2,2.42]){
  const c=Math.cos(angle),s=Math.sin(angle),xy=([x,y])=>[500000+c*x-s*y,7400000+s*x+c*y],rot=plan(line.map(xy),settings);
  const result=analyze(rot,heights(rot,(x,y)=>{const dx=x-500000,dy=y-7400000;return 200-(dx*c+dy*s)*.07+Math.abs(-dx*s+dy*c);}),options);
  for(const sec of result.sections)close(sec.width,4,1e-7);
  const back=plan(line.slice().reverse().map(xy),settings),backResult=analyze(back,heights(back,(x,y)=>{const dx=x-500000,dy=y-7400000;return 200-(dx*c+dy*s)*.07+Math.abs(-dx*s+dy*c);}),options);
  assert.deepEqual(sortedRing(result.ring),sortedRing(backResult.ring));
}
// A high dike followed by a lower neighboring basin is stopped at the first bank.
const dike=analyze(layout,heights(layout,(x,y)=>Math.abs(y)<=3?Math.abs(y):0),options);
assert.ok(dike.sections.every(s=>Math.abs(s.width-4)<1e-8));
const afterBank=heights(layout,(x,y)=>Math.abs(y)>3?NaN:Math.abs(y));assert.ok(analyze(layout,afterBank,options).sections.length);
for(const hole of ['axis','left','right']){
  const missing=heights(layout,(x,y)=>Math.abs(y));const mid=(missing[0].length-1)/2;missing[0][mid+(hole==='axis'?0:hole==='left'?1:-1)]=NaN;
  assert.throws(()=>analyze(layout,missing,options),/cota válida|NoData/);
}
assert.throws(()=>analyze(layout,heights(layout,()=>0),options),/não encontrada/);
assert.throws(()=>analyze(layout,heights(layout,(x,y)=>Math.abs(y)),{...options,height:20}),/não encontrada/);
assert.throws(()=>analyze(layout,heights(layout,(x,y)=>Math.abs(y)*10),options),/dois pixels/);
assert.throws(()=>analyze(layout,z,{height:0,resolution:.5}),/positivo/);
assert.throws(()=>analyze(layout,z,{height:2,resolution:.1}),/metade do pixel/);
// Smooth bend accepts sections; an acute hairpin or a folded bank is rejected.
const curve=Array.from({length:17},(_,i)=>{const a=i*Math.PI/32;return [100*Math.sin(a),100*(1-Math.cos(a))];}),curved=plan(curve,{...settings,interval:5});
const curvedResult=analyze(curved,heights(curved,(x,y,d)=>Math.abs(d)),options);assert.ok(curvedResult.ring.length>20);
const curveBack=plan(curve.slice().reverse(),{...settings,interval:5}),curveBackResult=analyze(curveBack,heights(curveBack,(x,y,d)=>Math.abs(d)),options);
assert.deepEqual(sortedRing(curvedResult.ring),sortedRing(curveBackResult.ring));
const sharp=plan([[0,0],[30,0],[30,30]],{...settings,interval:1});assert.throws(()=>analyze(sharp,heights(sharp,(x,y,d)=>Math.abs(d)),{...options,height:5}),/cruzamento|sobreposta|fora/);
for(const invalid of [[[0,0],[10,0],[0,0]],[[0,0],[10,10],[0,10],[10,0]],[[0,0],[10,0],[5,0]],[[0,0],[0,0],[5,0]]])assert.throws(()=>plan(invalid,settings),/aberto|cruzamento|sobreposta|repetidos/);
assert.throws(()=>plan([[0,0],[30000,0]],settings),/2.000/);
assert.throws(()=>plan([[0,0],[1250,0]],{interval:10,lateralStep:.1,reach:100}),/250 mil/);
assert.throws(()=>plan([[0,0],[100,0]],{...settings,lateralStep:0}),/positivo/);
assert.throws(()=>analyze(layout,z.slice(1),options),/não correspondem/);
assert.equal(JSON.stringify(line),snapshot);assert.deepEqual(plain(layout.limits),{maxSamples:250000,maxSections:2000,maxLinePoints:10000});
// Automatic mode: the first sustained ascending-bank → exterior-terrace break.
const bankShape=d=>Math.min(3,Math.max(0,Math.abs(d)-2));
const automatic=analyze(layout,heights(layout,(x,y)=>100+bankShape(y)),{mode:'auto',resolution:.5});
assert.equal(automatic.mode,'auto');
for(const s of automatic.sections){close(s.width,10);close(s.level,103);close(s.effectiveHeight,3);close(s.detection.left.distance,5);close(s.detection.right.distance,5);assert.deepEqual(plain(s.detection.rules.windowPixels),[1,1.5,2,3]);}
const autoAsym=analyze(layout,heights(layout,(x,y)=>100+(y>=0?Math.min(2,Math.max(0,y-1)):Math.min(3,Math.max(0,-y-1)))),{mode:'auto',resolution:.5});
for(const s of autoAsym.sections){close(s.level,102);close(s.width,6);close(s.detection.left.elevation,102);close(s.detection.right.elevation,103);}
const autoDecline=analyze(layout,heights(layout,(x,y)=>200-.07*x+bankShape(y)),{mode:'auto',resolution:.5}),autoBack=analyze(reversed,heights(reversed,(x,y)=>200-.07*x+bankShape(y)),{mode:'auto',resolution:.5});
assert.deepEqual(sortedRing(autoDecline.ring),sortedRing(autoBack.ring));assert.ok(autoDecline.sections.every(s=>Math.abs(s.effectiveHeight-3)<1e-7));
for(const angle of [.13,.37,1.2,1.7,2.61]){
  const c=Math.cos(angle),s=Math.sin(angle),xy=([x,y])=>[500000+c*x-s*y,7400000+s*x+c*y],rot=plan(line.map(xy),settings),back=plan(line.slice().reverse().map(xy),settings);
  const terrain=(x,y)=>{const dx=x-500000,dy=y-7400000;return 200-.07*(dx*c+dy*s)+bankShape(-dx*s+dy*c);};
  const result=analyze(rot,heights(rot,terrain),{mode:'auto',resolution:.5}),backResult=analyze(back,heights(back,terrain),{mode:'auto',resolution:.5});
  for(const section of result.sections)close(section.width,10,1e-7);
  assert.deepEqual(sortedRing(result.ring),sortedRing(backResult.ring));
}
// A single subpixel dent does not replace the sustained break by a distant one.
const notch=analyze(layout,heights(layout,(x,y)=>100+bankShape(y)+(Math.abs(Math.abs(y)-3.25)<1e-8?-.08:0)),{mode:'auto',resolution:.5});
assert.ok(notch.sections.every(s=>Math.abs(s.width-10)<.25));
const noisy=analyze(layout,heights(layout,(x,y)=>100+bankShape(y)+.015*Math.sin(y*14)),{mode:'auto',resolution:.5});
assert.ok(noisy.sections.every(s=>Math.abs(s.width-10)<.5));
for(const shape of [()=>100,(x,y)=>100+Math.abs(y),(x,y)=>100+.04*Math.abs(y)])assert.throws(()=>analyze(layout,heights(layout,shape),{mode:'auto',resolution:.5}),/altura manual/);
const autoMissing=heights(layout,(x,y)=>100+bankShape(y));autoMissing[0][(autoMissing[0].length-1)/2+3]=NaN;
assert.throws(()=>analyze(layout,autoMissing,{mode:'auto',resolution:.5}),/NoData/);
assert.throws(()=>analyze(layout,heights(layout,(x,y)=>100+(Math.abs(y)<1e-9?4:bankShape(y))),{mode:'auto',resolution:.5}),/concorrentes|ambígua/);
assert.ok(analyze(layout,heights(layout,(x,y)=>Math.abs(y)>8?NaN:100+bankShape(y)),{mode:'auto',resolution:.5}).sections.length);
assert.throws(()=>analyze(layout,z,{mode:'unrecognized',resolution:.5}),/Modo/);
// A native 1 m grid and a strict 10 m corridor: short/rounded banks and a
// sloping exterior must not require an artificial flat terrace or extra reach.
const shortOptions={interval:5,lateralStep:.5,reach:5},shortLayout=plan([[0,0],[20,0]],shortOptions);
const exterior=d=>d<=.5?0:d<=2.5?d-.5:2+.4*(d-2.5);
const sloped=analyze(shortLayout,heights(shortLayout,(x,y)=>100+exterior(Math.abs(y))),{mode:'auto',resolution:1});
assert.ok(sloped.sections.every(s=>Math.abs(s.width-5)<1e-8));
const displaced=plan([[0,1.5],[20,1.5]],shortOptions),displacedInput=JSON.stringify(displaced);
const displacedResult=analyze(displaced,heights(displaced,(x,y)=>100+Math.min(2,Math.max(0,Math.abs(y)-.5))),{mode:'auto',resolution:1});
assert.ok(displacedResult.sections.every(s=>Math.abs(s.width-5)<1e-8));assert.equal(JSON.stringify(displaced),displacedInput);
const rounded=d=>d<=.5?0:d<=2?d-.5:d<=3?1.5+(d-2)-.4*(d-2)**2:2.1+.2*(d-3);
const roundResult=analyze(shortLayout,heights(shortLayout,(x,y)=>100+rounded(Math.abs(y))),{mode:'auto',resolution:1});
assert.ok(roundResult.sections.every(s=>Math.abs(s.width-5)<1e-8&&s.detection.left.elevation<=s.detection.left.fitElevation));
// One observed bank supplies a level; the opposite continuous hillside only
// supplies its first intersection. Missing tops stay null and explicitly tagged.
const unilateralLayout=plan([[0,0],[20,0]],{interval:5,lateralStep:.25,reach:5});
const unilateral=analyze(unilateralLayout,heights(unilateralLayout,(x,y)=>100+(y>=0?Math.min(2,Math.max(0,y-1)):-y*.5)),{mode:'auto',resolution:.5});
for(const s of unilateral.sections){close(s.width,7);close(s.level,102);assert.equal(s.detection.supportSides,1);assert.equal(s.detection.right,null);assert.ok(s.detection.left);assert.match(s.detection.method,/uma margem/);assert.match(s.detection.confidence,/reforçada/);}
const unilateralBack=plan([[20,0],[0,0]],{interval:5,lateralStep:.25,reach:5}),unilateralReverse=analyze(unilateralBack,heights(unilateralBack,(x,y)=>100+(y>=0?Math.min(2,Math.max(0,y-1)):-y*.5)),{mode:'auto',resolution:.5});
assert.deepEqual(sortedRing(unilateral.ring),sortedRing(unilateralReverse.ring));assert.equal(unilateralReverse.sections[0].detection.left,null);
let diagnostic;
try{analyze(unilateralLayout,heights(unilateralLayout,(x,y)=>100+(y>=0?Math.min(2,Math.max(0,y-1)):-y*.2)),{mode:'auto',resolution:.5});assert.fail('out-of-corridor bank must fail');}catch(e){assert.match(e.message,/não encontrada/);diagnostic=e.diagnostic;}
assert.equal(diagnostic.mode,'auto');assert.equal(diagnostic.station,0);assert.equal(diagnostic.zAxis,100);assert.deepEqual(plain(diagnostic.center),[0,0]);assert.equal(diagnostic.profile.length,unilateralLayout.sections[0].offsets.length);assert.ok(diagnostic.message);assert.equal(diagnostic.ring,undefined);
const nodataSide=heights(unilateralLayout,(x,y)=>100+(y>=0?Math.min(2,Math.max(0,y-1)):-y*.5));nodataSide[0][3]=NaN;
assert.throws(()=>analyze(unilateralLayout,nodataSide,{mode:'auto',resolution:.5}),e=>/NoData/.test(e.message)&&e.diagnostic.profile.some(p=>p.z===null));
assert.throws(()=>analyze(shortLayout,heights(shortLayout,()=>100),{mode:'auto',resolution:1}),e=>!!e.diagnostic&&/quebra/.test(e.message));
// A crest before another depression must stop at the first component or refuse,
// never fill through the crest to choose a remote second valley as this channel.
const barrierLayout=plan([[0,0],[20,0]],{interval:5,lateralStep:.25,reach:8});
const barrier=heights(barrierLayout,(x,y)=>{if(y>=0)return 100+Math.min(2,Math.max(0,y-1));const d=-y;return 100+(d<=1.5?d/1.5:d<=3?2-d/1.5:.75*(d-3));});
try{const result=analyze(barrierLayout,barrier,{mode:'auto',resolution:.5});assert.ok(result.sections.every(s=>s.rightOffset>-3),'must stop before the next depression');}catch(e){assert.match(e.message,/crista|quebra/);assert.ok(e.diagnostic);}
// The original line is a corridor/orientation guide, not the bottom or a point
// that must lie inside the extracted water-level component. All offsets remain
// referenced to the original guide even when both banks are on the same side.
const guideSettings={interval:5,lateralStep:.25,reach:10},guideLine=[[0,0],[20,0]],guideLayout=plan(guideLine,guideSettings),guideSnapshot=JSON.stringify(guideLayout);
const offAxisTerrain=(x,y)=>100+Math.abs(y-2),offAxisZ=heights(guideLayout,offAxisTerrain),offAxisSnapshot=JSON.stringify(offAxisZ);
const offAxis=analyze(guideLayout,offAxisZ,{height:1,resolution:.5});
for(const s of offAxis.sections){close(s.zAxis,102);close(s.floorOffset,2);close(s.zFloor,100);close(s.level,101);close(s.effectiveHeight,1);close(s.leftOffset,3);close(s.rightOffset,1);close(s.width,2);assert.deepEqual(plain(s.floorPoint),[s.center[0],2]);assert.equal(s.floorDetection.reviewRequired,true);}
assert.equal(JSON.stringify(guideLayout),guideSnapshot);assert.equal(JSON.stringify(offAxisZ),offAxisSnapshot);assert.deepEqual(guideLine,[[0,0],[20,0]]);
const guideBack=plan(guideLine.slice().reverse(),guideSettings),offAxisBack=analyze(guideBack,heights(guideBack,offAxisTerrain),{height:1,resolution:.5});
assert.deepEqual(sortedRing(offAxis.ring),sortedRing(offAxisBack.ring));assert.ok(offAxisBack.sections.every(s=>s.floorOffset===-2&&s.leftOffset===-1&&s.rightOffset===-3));
const offAutoTerrain=(x,y)=>{const d=Math.abs(y-5);return 100+(d<=1?0:d<=3?d-1:2+.2*(d-3));};
const offAuto=analyze(guideLayout,heights(guideLayout,offAutoTerrain),{mode:'auto',resolution:.5});
for(const s of offAuto.sections){close(s.zAxis,102.4);close(s.floorOffset,4);close(s.zFloor,100);close(s.level,102);close(s.effectiveHeight,2);close(s.leftOffset,8);close(s.rightOffset,2);close(s.width,6);close(s.detection.left.offset,8);close(s.detection.right.offset,2);close(s.detection.left.distance,4);close(s.detection.right.distance,2);}
const offAutoBack=analyze(guideBack,heights(guideBack,offAutoTerrain),{mode:'auto',resolution:.5});assert.deepEqual(sortedRing(offAuto.ring),sortedRing(offAutoBack.ring));
for(const angle of [.37,1.51,2.61]){
  const c=Math.cos(angle),s=Math.sin(angle),xy=([x,y])=>[500000+c*x-s*y,7400000+s*x+c*y],rot=plan(guideLine.map(xy),guideSettings);
  const terrain=(x,y)=>offAutoTerrain((x-500000)*c+(y-7400000)*s,-(x-500000)*s+(y-7400000)*c);
  const result=analyze(rot,heights(rot,terrain),{mode:'auto',resolution:.5});
  for(const section of result.sections){close(section.width,6,1e-7);close(section.floorOffset,4);close(section.zFloor,100,1e-7);}
}
// Do not prefer a deeper but unrelated neighboring basin, nor arbitrarily
// choose one of two equally plausible valleys below a guide on a dividing ridge.
const remoteTerrain=(x,y)=>100+(y<0?-y:y<=3?y:y<=6?3-(y-3)*5/3:-2+(y-6)*2);
const remote=analyze(guideLayout,heights(guideLayout,remoteTerrain),{height:1,resolution:.5});
assert.ok(remote.sections.every(s=>s.floorOffset===0&&s.zFloor===100&&s.width===2));
assert.throws(()=>analyze(guideLayout,heights(guideLayout,(x,y)=>100+Math.min(Math.abs(y-3),Math.abs(y+3))),{height:1,resolution:.5}),e=>/concorrentes|ambígua/.test(e.message)&&e.diagnostic.floorOffset===null);
// NoData between guide and visible valley is never jumped. An unbracketed low
// sample at the corridor edge is not invented as the channel bottom either.
const separated=heights(guideLayout,(x,y)=>y===1?NaN:offAxisTerrain(x,y));
assert.throws(()=>analyze(guideLayout,separated,{height:1,resolution:.5}),e=>/NoData/.test(e.message)&&e.diagnostic.profile.some(p=>p.z===null));
const edgeLayout=plan(guideLine,{...guideSettings,reach:2});
assert.throws(()=>analyze(edgeLayout,heights(edgeLayout,offAxisTerrain),{height:1,resolution:.5}),/fundo.*corredor|alcance/);
const narrowGuide=plan(guideLine,{...guideSettings,reach:2.5});
assert.throws(()=>analyze(narrowGuide,heights(narrowGuide,offAxisTerrain),{height:1,resolution:.5}),e=>/não encontrada/.test(e.message)&&e.diagnostic.floorOffset===2&&e.diagnostic.zFloor===100&&e.diagnostic.zAxis===102);
// Optional expansion is a separate, bounded policy. Manual is the backwards-
// compatible default; missing/unknown/error-text-only status must fail closed.
assert.deepEqual(plain(searchPolicy.reaches({reach:5})),[5]);
assert.deepEqual(plain(searchPolicy.reaches({searchLimited:true,reach:3.5})),[3.5]);
assert.deepEqual(plain(searchPolicy.reaches({searchLimited:false,reach:NaN})),[10,20,40,80,160,320]);
assert.deepEqual(plain(searchPolicy.limits),{maxReach:320,maxTotalWidth:640,maxAttempts:6,maxSamples:250000});
assert.match(searchPolicy.automaticWarning,/320 m.*640 m.*250 mil/);
for(const reach of [undefined,null,0,-1,NaN,Infinity,'5'])assert.throws(()=>searchPolicy.reaches({reach}),e=>e.code==='CHANNEL_INVALID_INPUT');
const tries=searchPolicy.reaches({searchLimited:false});tries[0]=1;assert.equal(searchPolicy.reaches({searchLimited:false})[0],10);
for(const code of ['CHANNEL_REACH_BANK','CHANNEL_REACH_BREAK','CHANNEL_REACH_FLOOR']){assert.equal(searchPolicy.canExpand({code}),true);assert.equal(searchPolicy.canExpand({diagnostic:{code}}),true);}
for(const code of ['CHANNEL_NO_DATA','CHANNEL_AMBIGUOUS_FLOOR','CHANNEL_BARRIER','CHANNEL_INVALID_GEOMETRY','CHANNEL_LIMIT','CHANNEL_RESOLUTION','CHANNEL_INVALID_INPUT','CHANNEL_NEW_UNKNOWN',null,undefined])assert.equal(searchPolicy.canExpand({code}),false);
assert.equal(searchPolicy.canExpand({code:'CHANNEL_NO_DATA',diagnostic:{code:'CHANNEL_REACH_BANK'}}),false);
assert.equal(searchPolicy.canExpand({message:'margem não encontrada no alcance'}),false);assert.equal(searchPolicy.canExpand(null),false);
function expectedCode(fn,code,retry){assert.throws(fn,e=>e.code===code&&searchPolicy.canExpand(e)===retry&&(!e.diagnostic||e.diagnostic.code===code));}
expectedCode(()=>analyze(edgeLayout,heights(edgeLayout,offAxisTerrain),{height:1,resolution:.5}),'CHANNEL_REACH_FLOOR',true);
expectedCode(()=>analyze(narrowGuide,heights(narrowGuide,offAxisTerrain),{height:1,resolution:.5}),'CHANNEL_REACH_BANK',true);
expectedCode(()=>analyze(guideLayout,heights(guideLayout,(x,y)=>100+Math.abs(y)),{mode:'auto',resolution:.5}),'CHANNEL_REACH_BREAK',true);
expectedCode(()=>analyze(guideLayout,separated,{height:1,resolution:.5}),'CHANNEL_NO_DATA',false);
expectedCode(()=>analyze(guideLayout,heights(guideLayout,(x,y)=>100+Math.min(Math.abs(y-3),Math.abs(y+3))),{height:1,resolution:.5}),'CHANNEL_AMBIGUOUS_FLOOR',false);
expectedCode(()=>analyze(layout,heights(layout,(x,y)=>Math.abs(y)*10),options),'CHANNEL_RESOLUTION',false);
expectedCode(()=>plan([[0,0],[10,10],[0,10],[10,0]],settings),'CHANNEL_INVALID_GEOMETRY',false);
expectedCode(()=>plan([[0,0],[1250,0]],{interval:10,lateralStep:.1,reach:100}),'CHANNEL_LIMIT',false);
// A ridge and descent already visible inside the sampled extent must not be
// misclassified as merely missing a distant bank, in either automatic/manual.
const ridgeTerrain=(x,y)=>100+(y<=0?-y:y<=2?y:y<=4?4-y:0);
try{const ridgeAuto=analyze(guideLayout,heights(guideLayout,ridgeTerrain),{mode:'auto',resolution:.5});assert.ok(ridgeAuto.sections.every(s=>s.leftOffset<=2),'an observed crest must stop the first component');}catch(e){assert.equal(e.code,'CHANNEL_BARRIER');assert.equal(searchPolicy.canExpand(e),false);}
expectedCode(()=>analyze(guideLayout,heights(guideLayout,ridgeTerrain),{height:4,resolution:.5}),'CHANNEL_BARRIER',false);
const crossingBeyondRidge=(x,y)=>100+(y<=0?-y:y<=2?y:y<=4?4-y:y-4);
expectedCode(()=>analyze(guideLayout,heights(guideLayout,crossingBeyondRidge),{height:4,resolution:.5}),'CHANNEL_BARRIER',false);
function adaptiveSynthetic(terrain,analysisOptions,searchOptions){
  const attempted=[];let result,lastError;
  for(const reach of searchPolicy.reaches(searchOptions)){
    attempted.push(reach);const p=plan(guideLine,{...guideSettings,reach});
    try{result=analyze(p,heights(p,terrain),analysisOptions);break;}catch(e){lastError=e;if(!searchPolicy.canExpand(e))break;}
  }
  return {attempted,result,error:lastError};
}
const beyondInitial=(x,y)=>100+Math.abs(y-12),expanded=adaptiveSynthetic(beyondInitial,{height:1,resolution:.5},{searchLimited:false});
assert.deepEqual(expanded.attempted,[10,20]);assert.ok(expanded.result.sections.every(s=>s.floorOffset===12&&s.leftOffset===13&&s.rightOffset===11));
const keptLimit=adaptiveSynthetic(beyondInitial,{height:1,resolution:.5},{reach:10});assert.deepEqual(keptLimit.attempted,[10]);assert.equal(keptLimit.result,undefined);assert.equal(keptLimit.error.code,'CHANNEL_REACH_FLOOR');
const noDataAttempt=adaptiveSynthetic((x,y)=>y===1?NaN:100+Math.abs(y-12),{height:1,resolution:.5},{searchLimited:false});assert.deepEqual(noDataAttempt.attempted,[10]);assert.equal(noDataAttempt.error.code,'CHANNEL_NO_DATA');
const plateauAttempt=adaptiveSynthetic(()=>100,{mode:'auto',resolution:.5},{searchLimited:false});assert.deepEqual(plateauAttempt.attempted,[10,20,40,80,160,320]);assert.equal(plateauAttempt.result,undefined);assert.equal(plateauAttempt.error.code,'CHANNEL_REACH_BREAK');
// Explicit depth is a connected local fill, not the old anti-return height
// heuristic. Keep "height" as a backwards-compatible stored-recipe mode.
const depthOptions={mode:'depth',height:2,resolution:.5},depthZ=heights(layout,(x,y)=>200-.07*x+Math.abs(y)),depthBefore=JSON.stringify(depthZ),depthResult=analyze(layout,depthZ,depthOptions);
assert.equal(depthResult.mode,'depth');assert.equal(depthResult.method,'Profundidade informada');assert.equal(JSON.stringify(depthZ),depthBefore);assert.equal(JSON.stringify(layout),savedPlan);
for(const s of depthResult.sections){close(s.width,4);close(s.zFloor,200-.07*s.center[0]);close(s.level,s.zFloor+2);close(s.effectiveHeight,2);assert.equal(s.detection,null);assert.equal(s.method,'Profundidade informada');}
close(depthResult.sections[0].level,202);close(depthResult.sections.at(-1).level,195);
assert.deepEqual(sortedRing(depthResult.ring),sortedRing(decline.ring));
assert.match(depthResult.warnings.join(' '),/não é uma cota global nem uma simulação hidráulica/);
expectedCode(()=>analyze(layout,depthZ,{mode:'auto',resolution:.5}),'CHANNEL_REACH_BREAK',true);
const curvedLongitudinal=analyze(layout,heights(layout,(x,y)=>200-.04*x-.0003*x*x+Math.abs(y)),depthOptions);
for(const s of curvedLongitudinal.sections){close(s.level,202-.04*s.center[0]-.0003*s.center[0]**2);close(s.width,4);}
const depthBack=analyze(reversed,heights(reversed,(x,y)=>200-.07*x+Math.abs(y)),depthOptions);assert.deepEqual(sortedRing(depthResult.ring),sortedRing(depthBack.ring));
for(const angle of [.37,1.51,2.61]){
  const c=Math.cos(angle),s=Math.sin(angle),xy=([x,y])=>[500000+c*x-s*y,7400000+s*x+c*y],rot=plan(line.map(xy),settings);
  const terrain=(x,y)=>200-.07*((x-500000)*c+(y-7400000)*s)+Math.abs(-(x-500000)*s+(y-7400000)*c);
  const result=analyze(rot,heights(rot,terrain),depthOptions);for(const section of result.sections){close(section.width,4,1e-7);close(section.effectiveHeight,2);}
}
for(const angle of [0,.13,.37,1.51,2.61]){
  const c=Math.cos(angle),s=Math.sin(angle),xy=([x,y])=>[500000+c*x-s*y,7400000+s*x+c*y],rot=plan(guideLine.map(xy),guideSettings),back=plan(guideLine.slice().reverse().map(xy),guideSettings);
  const terrain=(x,y)=>100+Math.min(2,Math.max(0,Math.abs(-(x-500000)*s+(y-7400000)*c)-1));
  const result=analyze(rot,heights(rot,terrain),depthOptions),reverse=analyze(back,heights(back,terrain),depthOptions);
  for(const section of result.sections)close(section.width,6,1e-7);assert.deepEqual(sortedRing(result.ring),sortedRing(reverse.ring));
}
const submergedTerrain=(x,y)=>100+(y<0?-y:y<2?y*.5:y<=3?1:y<4?1-.2*(y-3):y<=5?.8:.8+.5*(y-5)),submergedZ=heights(guideLayout,submergedTerrain),submergedBefore=JSON.stringify(submergedZ);
expectedCode(()=>analyze(guideLayout,submergedZ,{mode:'height',height:1.5,resolution:.5}),'CHANNEL_BARRIER',false);
const filled=analyze(guideLayout,submergedZ,{mode:'depth',height:1.5,resolution:.5});
for(const s of filled.sections){close(s.floorOffset,0);close(s.level,101.5);close(s.leftOffset,6.4);close(s.rightOffset,-1.5);close(s.width,7.9);}
assert.equal(JSON.stringify(submergedZ),submergedBefore);
// At or above the selected level the same crest is a dry boundary. Stop at
// its FIRST intersection, never jump to the secondary depression behind it.
for(const h of [.8,1]){
  const result=analyze(guideLayout,submergedZ,{mode:'depth',height:h,resolution:.5});
  for(const s of result.sections){close(s.leftOffset,2*h);close(s.rightOffset,-h);close(s.width,3*h);assert.ok(s.leftOffset<=2);}
}
const filledBack=analyze(guideBack,heights(guideBack,submergedTerrain),{mode:'depth',height:1.5,resolution:.5});assert.deepEqual(sortedRing(filled.ring),sortedRing(filledBack.ring));
const legacyDefault=analyze(layout,z,options),legacyExplicit=analyze(layout,z,{...options,mode:'height'});assert.deepEqual(plain(legacyDefault),plain(legacyExplicit));
// Missing data/extent still invalidate the whole preview, but retain the local
// floor and requested level in diagnostics so the failed fill is reviewable.
const missingFill=heights(guideLayout,(x,y)=>y===3?NaN:submergedTerrain(x,y));
assert.throws(()=>analyze(guideLayout,missingFill,{mode:'depth',height:1.5,resolution:.5}),e=>e.code==='CHANNEL_NO_DATA'&&e.diagnostic.mode==='depth'&&e.diagnostic.level===101.5&&e.diagnostic.effectiveHeight===1.5&&e.diagnostic.zFloor===100&&e.diagnostic.method==='Profundidade informada'&&!e.diagnostic.ring);
assert.throws(()=>analyze(narrowGuide,heights(narrowGuide,offAxisTerrain),{mode:'depth',height:1,resolution:.5}),e=>e.code==='CHANNEL_REACH_BANK'&&e.diagnostic.level===101&&e.diagnostic.effectiveHeight===1&&e.diagnostic.floorOffset===2);
assert.ok(analyze(layout,afterBank,{mode:'depth',height:2,resolution:.5}).sections.every(s=>s.width===4),'NoData beyond the first bank is irrelevant to the connected fill');
expectedCode(()=>analyze(guideLayout,heights(guideLayout,(x,y)=>100+Math.min(Math.abs(y-3),Math.abs(y+3))),{mode:'depth',height:1,resolution:.5}),'CHANNEL_AMBIGUOUS_FLOOR',false);
const narrowDepth=analyze(layout,heights(layout,(x,y)=>Math.abs(y)*10),depthOptions);
assert.ok(narrowDepth.sections.every(s=>s.width<2*depthOptions.resolution&&s.resolutionLimited));
assert.match(narrowDepth.warnings.join(' '),/precisão limitada/);
// Regression for the reported 1.931 m band with a native 1 m DEM.
const meterPlan=plan([[500000,7400000],[500030,7400000]],{interval:5,lateralStep:.5,reach:30});
const meterZ=heights(meterPlan,(x,y,d)=>63.82+Math.abs(d)*(.5/(1.931/2)));
const meterBefore=JSON.stringify([meterPlan,meterZ]);
const meterNarrow=analyze(meterPlan,meterZ,{mode:'depth',height:.5,resolution:1});
assert.ok(meterNarrow.sections.every(s=>s.resolutionLimited));
meterNarrow.sections.forEach(s=>{close(s.width,1.931);close(s.level,64.32);});
assert.equal(JSON.stringify([meterPlan,meterZ]),meterBefore);
assert.ok(meterNarrow.ring.length>=5);
for(const width of [1.999,2,2.001,.25]){
 const result=analyze(meterPlan,heights(meterPlan,(x,y,d)=>100+Math.abs(d)/width),{mode:'depth',height:.5,resolution:1});
 result.sections.forEach(s=>{close(s.width,width);assert.equal(s.resolutionLimited,width<2);});
}
expectedCode(()=>analyze(sharp,heights(sharp,(x,y,d)=>Math.abs(d)),{mode:'depth',height:5,resolution:.5}),'CHANNEL_INVALID_GEOMETRY',false);
for(const h of [0,-1,NaN,Infinity])expectedCode(()=>analyze(layout,z,{mode:'depth',height:h,resolution:.5}),'CHANNEL_INVALID_INPUT',false);
const depthExpanded=adaptiveSynthetic(beyondInitial,{mode:'depth',height:1,resolution:.5},{searchLimited:false});assert.deepEqual(depthExpanded.attempted,[10,20]);assert.ok(depthExpanded.result.sections.every(s=>s.floorOffset===12&&s.level===101));
// Optional regression against the user's unchanged native LiDAR samples.
const realPath=process.env.GEOMINE_CHANNEL_REAL_PROFILES||fileURLToPath(new URL('../diagnostic-profiles.json',import.meta.url));
if(fs.existsSync(realPath)){
  const real=JSON.parse(fs.readFileSync(realPath,'utf8')),summary=[];
  for(const run of real.runs){let accepted=0,oneBank=0;const before=JSON.stringify([run.layout,run.heights]),failures=[];
    for(let i=0;i<run.layout.sections.length;i++){
      const s=run.layout.sections[i],parallel={...s,station:s.station+10,center:[s.center[0]+s.normal[1]*10,s.center[1]-s.normal[0]*10]};
      try{const result=analyze({sections:[s,parallel]},[run.heights[i],run.heights[i]],{mode:'auto',resolution:run.resolution}),section=result.sections[0];accepted++;if(section.detection.supportSides===1)oneBank++;
        if(run.reachPerSide>=10&&[28,31].includes(i)){close(section.floorOffset,i===28?4.5:4);close(section.zFloor,i===28?61.55846058081137:61.79572096986116);assert.ok(section.effectiveHeight>0);assert.ok(section.width>6&&section.width<8);if(i===28)assert.ok(section.rightOffset>0,'S29 has both banks to the left of the unchanged guide');if(i===31)assert.ok(section.leftOffset<=7.1,'S32 must not skip the first terrace for a higher distant slope break');}
      }
      catch(e){assert.ok(e.diagnostic);failures.push(i+1);if(run.reachPerSide>=10&&[28,31].includes(i))assert.fail(e.message);}
    }
    if(run.reachPerSide===10)assert.deepEqual(failures,[28,41]);
    if(run.reachPerSide===20){
      const whole=analyze(run.layout,run.heights,{mode:'auto',resolution:run.resolution});assert.equal(whole.sections.length,47);assert.equal(whole.ring.length,95);
      const reversedSections=run.layout.sections.slice().reverse().map(s=>({...s,station:run.layout.length-s.station,normal:s.normal.map(v=>-v),points:s.points.slice().reverse()})),reversedHeights=run.heights.slice().reverse().map(z=>z.slice().reverse());
      const wholeBack=analyze({...run.layout,sections:reversedSections},reversedHeights,{mode:'auto',resolution:run.resolution});assert.deepEqual(sortedRing(whole.ring),sortedRing(wholeBack.ring));
      for(const sec of whole.sections){assert.ok(sec.floorOffset>=-run.reachPerSide&&sec.floorOffset<=run.reachPerSide);assert.ok(sec.leftOffset<=run.reachPerSide&&sec.rightOffset>=-run.reachPerSide);}
    }else assert.throws(()=>analyze(run.layout,run.heights,{mode:'auto',resolution:run.resolution}),e=>/não encontrada/.test(e.message)&&!!e.diagnostic);
    assert.equal(JSON.stringify([run.layout,run.heights]),before);summary.push({totalSearchWidth:2*run.reachPerSide,accepted,total:run.layout.sections.length,oneBank});
  }
  assert.deepEqual(summary.map(s=>s.accepted),[16,45,47]);console.log('REAL PROFILE REGRESSION '+JSON.stringify(summary));
  const attempted=[];let adaptiveReal;
  for(const reach of searchPolicy.reaches({searchLimited:false})){
    const run=real.runs.find(r=>r.reachPerSide===reach);assert.ok(run,'real adaptive search must finish before exceeding available fixture');attempted.push(reach);
    try{adaptiveReal=analyze(run.layout,run.heights,{mode:'auto',resolution:run.resolution});break;}catch(e){assert.equal(e.code,'CHANNEL_REACH_BANK');assert.ok(searchPolicy.canExpand(e));}
  }
  assert.deepEqual(attempted,[10,20]);assert.equal(adaptiveReal.sections.length,47);
  for(const reach of [10,20]){const run=real.runs.find(r=>r.reachPerSide===reach),depth=analyze(run.layout,run.heights,{mode:'depth',height:.5,resolution:run.resolution});assert.equal(depth.sections.length,47);assert.ok(depth.sections.every(s=>Math.abs(s.effectiveHeight-.5)<1e-8));}
  const wide=real.runs.find(r=>r.reachPerSide===20);expectedCode(()=>analyze(wide.layout,wide.heights,{mode:'depth',height:1,resolution:wide.resolution}),'CHANNEL_INVALID_GEOMETRY',false);
  console.log('PASS optional real LiDAR fixture: S29/S32, 47-section automatic geometry, adaptive reach10→20, depth0.5m and refusal of intersecting depth1m polygon.');
}else console.log('SKIP optional real LiDAR fixture: set GEOMINE_CHANNEL_REAL_PROFILES to diagnostic-profiles.json to run these regressions.');
console.log('PASS standalone worker plan/analyze; V/trapezoid/asymmetric profiles; local levels on declining river; inversion/rotation; first sampled crossing; NoData/open-profile/narrow-resolution refusals; smooth bend/sharp-fold validation; immutable inputs and mobile budgets.');
console.log('PASS automatic sustained slope breaks; asymmetric bank elevations use lower level; no global flood level; inversion; subpixel notch/noise; V/flat/NoData refusals and heuristic audit metadata.');
console.log('PASS multiscale curved/sloping-exterior banks; displaced axis without moving geometry; transparent unilateral level; strict reach/NoData/crest guards; visible failure diagnostics with no partial polygon.');
console.log('PASS guide-axis floor selection; both banks outside guide; manual height above floor; absolute offsets; inversion/rotation; remote/competing basins; NoData and strict corridor edge.');
console.log('PASS optional bounded search; manual default remains fixed; exact retry whitelist; NoData/ambiguity/barrier/geometry/budget refusals; floor beyond initial reach; automatic cap.');
console.log('PASS explicit depth without slope breaks; local levels follow linear/nonlinear longitudinal floor; submerged crests admitted, dry/equal-level obstacles stop first; legacy height unchanged; reversal/rotation; diagnostics retain requested depth and level; NoData/extent/resolution/topology safeguards.');

// Local axis heights must follow the slope, including subpixel widths.
const localPlan=plan([[0,0],[100,0]],{interval:5,lateralStep:.075,reach:30,sampleBudget:1000000});
const localZ=heights(localPlan,(x,y)=>200-.07*x+Math.abs(y));
for(const height of [.01,.1,.4]){
 const result=analyze(localPlan,localZ,{mode:'axisHeight',height,resolution:.15});
 for(const section of result.sections){
  close(section.level,section.zAxis+height);
  close(section.width,2*height);
 }
 close(result.sections[0].level-result.sections.at(-1).level,7);
}
assert.throws(()=>analyze(localPlan,localZ,{mode:'axisHeight',height:0,resolution:.15}),/positivo/);
console.log('Local axis heights: 0.01, 0.1, 0.4 m follow slope without rectangular grid.');
