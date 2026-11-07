/* Independent guide/corridor safety QA. Real samples are read only from a
   local diagnostic artifact, never embedded in the application or this test. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(base,'src/modules/environmental/channel-extraction-engine.js'),'utf8'),sandbox);
vm.runInNewContext(fs.readFileSync(path.join(base,'src/modules/environmental/channel-search-policy.js'),'utf8'),sandbox);
const {plan,analyze}=sandbox.window.GeoMineChannelEngine.engine();
const searchPolicy=sandbox.window.GeoMineChannelSearchPolicy;
const require=createRequire(import.meta.url),pc=require(path.join(base,'src/vendor/polygon-clipping.min.js'));
const plain=v=>JSON.parse(JSON.stringify(v));
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const interpolate=(a,b,t)=>[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];
const pointAt=(s,d)=>[s.center[0]+s.normal[0]*d,s.center[1]+s.normal[1]*d];
const heights=(p,f)=>p.sections.map(s=>s.points.map(([x,y],i)=>f(x,y,s.offsets[i])));
const bankShape=y=>100+Math.min(3,Math.max(0,Math.abs(y)-1));
const options={mode:'auto',resolution:.5};
const tests=[];
const test=(name,fn)=>tests.push({name,fn});
function area(ring){const o=ring[0];let v=0;for(let i=1;i<ring.length;i++)v+=(ring[i-1][0]-o[0])*(ring[i][1]-o[1])-(ring[i][0]-o[0])*(ring[i-1][1]-o[1]);return Math.abs(v)/2;}
function multiArea(mp){return mp.reduce((sum,p)=>sum+p.reduce((a,r,i)=>a+(i?-1:1)*area(r),0),0);}
function boundary(p,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy,t=l2?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2)):0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<1e-6;
}
function inside(p,ring){
  let hit=false;
  for(let i=1;i<ring.length;i++){
    const a=ring[i-1],b=ring[i];if(boundary(p,a,b))return true;
    if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<a[0]+(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1]))hit=!hit;
  }
  return hit;
}
function assertSimple(ring){
  const o=ring[0],r=ring.map(p=>[p[0]-o[0],p[1]-o[1]]),n=r.length-1;
  assert.ok(n>=4&&r.every(p=>p.every(Number.isFinite)));assert.deepEqual(plain(ring[0]),plain(ring.at(-1)));assert.ok(area(ring)>0);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for(let i=0;i<n;i++)for(let j=i+2;j<n;j++){
    if(i===0&&j===n-1)continue;
    const a=r[i],b=r[i+1],c=r[j],d=r[j+1];
    if(Math.max(a[0],b[0])<Math.min(c[0],d[0])-1e-7||Math.max(c[0],d[0])<Math.min(a[0],b[0])-1e-7||
      Math.max(a[1],b[1])<Math.min(c[1],d[1])-1e-7||Math.max(c[1],d[1])<Math.min(a[1],b[1])-1e-7)continue;
    const scale=Math.hypot(b[0]-a[0],b[1]-a[1])+Math.hypot(d[0]-c[0],d[1]-c[1]),sign=v=>Math.abs(v)<1e-8*scale?0:Math.sign(v);
    assert.ok(!(sign(cross(a,b,c))*sign(cross(a,b,d))<=0&&sign(cross(c,d,a))*sign(cross(c,d,b))<=0),`ring crosses/touches itself at edges ${i},${j}`);
  }
}
function assertCorridor(result,layout){
  assert.equal(result.sections.length,layout.sections.length);assertSimple(result.ring);
  const quadrilaterals=[];
  for(let i=0;i<result.sections.length;i++){
    const out=result.sections[i],s=layout.sections[i],lo=s.offsets[0],hi=s.offsets.at(-1);
    assert.deepEqual(plain(out.center),plain(s.center));assert.deepEqual(plain(out.normal),plain(s.normal));
    assert.ok(out.rightOffset>=lo-1e-7&&out.leftOffset<=hi+1e-7,'banks left original corridor');
    assert.ok(out.rightOffset<out.floorOffset&&out.floorOffset<out.leftOffset,'floor not between banks');
    near(out.leftOffset-out.rightOffset,out.width);near(out.level-out.zFloor,out.effectiveHeight);
    for(const [p,d] of [[out.left,out.leftOffset],[out.right,out.rightOffset],[out.floorPoint,out.floorOffset]]){
      const expected=pointAt(s,d);near(p[0],expected[0]);near(p[1],expected[1]);
    }
    assert.ok(inside(out.floorPoint,result.ring),'sampled floor outside ring');
    if(i){const a=layout.sections[i-1],al=pointAt(a,a.offsets.at(-1)),ar=pointAt(a,a.offsets[0]),bl=pointAt(s,hi),br=pointAt(s,lo);
      // Union of two triangles is a conservative representation of this
      // station strip even if a tight bend folds the nominal corridor quad.
      quadrilaterals.push([[al,bl,br,al]],[[al,br,ar,al]]);
      const previous=result.sections[i-1];
      for(const t of [.25,.5,.75])assert.ok(inside(interpolate(previous.floorPoint,out.floorPoint,t),result.ring),'floor path leaves ring');
    }
  }
  const corridor=pc.union(...quadrilaterals),outside=pc.difference([[plain(result.ring)]],corridor),outsideArea=multiArea(outside);
  assert.ok(outsideArea<=Math.max(1e-6,area(result.ring)*1e-10),`polygon outside unchanged corridor: ${outsideArea} m²`);
}
function immutable(layout,z,opts){
  const before=JSON.stringify([layout,z]);
  try{return analyze(layout,z,opts);}finally{assert.equal(JSON.stringify([layout,z]),before,'engine mutated sampled guide/corridor or elevations');}
}
function assertRefused(run,pattern){
  assert.throws(run,error=>{
    assert.match(error.message,pattern);assert.ok(error.diagnostic?.profile?.length,'failure lacks a complete diagnostic profile');
    assert.equal(error.ring,undefined);assert.equal(error.diagnostic.ring,undefined);return true;
  });
}
function search(opts,samples){
  const attempts=[],reaches=searchPolicy.reaches(opts);
  for(let i=0;i<reaches.length;i++){
    const reach=reaches[i],{layout,z,resolution}=samples(reach);
    try{return {result:immutable(layout,z,{...opts,resolution}),layout,reach,attempts:[...attempts,{reach,ok:true}]};}
    catch(error){attempts.push({reach,ok:false,code:error.code});if(i===reaches.length-1||!searchPolicy.canExpand(error))return {error,attempts};}
  }
  assert.fail('search policy returned no attempts');
}

test('automatic search has finite explicit bounds; a manual corridor never expands',()=>{
  assert.deepEqual(plain(searchPolicy.reaches({reach:5})),[5]);
  assert.deepEqual(plain(searchPolicy.reaches({searchLimited:true,reach:5})),[5]);
  assert.deepEqual(plain(searchPolicy.reaches({searchLimited:false,reach:5})),[10,20,40,80,160,320]);
  const a=searchPolicy.reaches({searchLimited:false});a[0]=999;
  assert.equal(searchPolicy.reaches({searchLimited:false})[0],10,'caller mutated global policy');
  assert.throws(()=>searchPolicy.reaches({reach:0}));assert.throws(()=>searchPolicy.reaches({reach:NaN}));
  assert.equal(searchPolicy.limits.maxReach,320);assert.equal(searchPolicy.limits.maxTotalWidth,640);
});
test('only structured reach failures allow automatic expansion',()=>{
  for(const code of ['CHANNEL_REACH_BANK','CHANNEL_REACH_BREAK','CHANNEL_REACH_FLOOR']){
    assert.equal(searchPolicy.canExpand({code}),true);assert.equal(searchPolicy.canExpand({diagnostic:{code}}),true);
  }
  for(const code of ['CHANNEL_NO_DATA','CHANNEL_AMBIGUOUS_FLOOR','CHANNEL_BARRIER','CHANNEL_INVALID_GEOMETRY','CHANNEL_LIMIT','CHANNEL_RESOLUTION','CHANNEL_INVALID_INPUT','unrecognized']){
    assert.equal(searchPolicy.canExpand({code}),false);
    assert.equal(searchPolicy.canExpand({code,diagnostic:{code:'CHANNEL_REACH_BANK'}}),false,'fatal top-level code must prevail');
  }
  assert.equal(searchPolicy.canExpand(Error('margem não encontrada no alcance')),false,'translated text must not authorize expansion');
  assert.equal(searchPolicy.canExpand(null),false);
});
test('automatic search refuses actual NoData, competing valleys and barriers on its first attempt',()=>{
  const terrains=[
    ['CHANNEL_NO_DATA',y=>Math.abs(y)>.5?NaN:100],
    ['CHANNEL_AMBIGUOUS_FLOOR',y=>100+Math.min(3,Math.max(0,Math.abs(Math.abs(y)-4)-.5))],
    ['CHANNEL_BARRIER',y=>y<=2?100+y:y<=5?104-y:99+(y-5)]
  ];
  for(const [code,terrain] of terrains){
    const out=search({searchLimited:false,mode:'auto'},reach=>{
      const layout=plan([[0,0],[20,0]],{interval:5,lateralStep:.25,reach});
      return {layout,z:heights(layout,(x,y)=>terrain(y)),resolution:.5};
    });
    assert.equal(out.error?.code,code);assert.equal(out.attempts.length,1,'unsafe profile triggered a wider search');
    assert.equal(out.error.diagnostic?.code,code);assert.ok(out.error.diagnostic?.profile?.length);assert.equal(out.result,undefined);
  }
});

test('guide outside bank remains unchanged, estimated floor may be inside',()=>{
  const line=[[500000,7400005],[500030,7400005]],before=JSON.stringify(line),layout=plan(line,{interval:5,lateralStep:.25,reach:12});
  const result=immutable(layout,heights(layout,(x,y)=>bankShape(y-7400000)),options);
  assertCorridor(result,layout);assert.equal(JSON.stringify(line),before);
  for(const s of result.sections){assert.ok(s.leftOffset<0&&s.rightOffset<0,'incorrectly forced guide inside channel');assert.ok(s.floorOffset>=-6&&s.floorOffset<=-4);near(s.width,8);near(s.level,103);}
});
test('manual height is above selected floor, not guide elevation',()=>{
  const layout=plan([[0,5],[30,5]],{interval:5,lateralStep:.25,reach:12});
  const result=immutable(layout,heights(layout,(x,y)=>bankShape(y)),{mode:'height',height:1.5,resolution:.5});
  assertCorridor(result,layout);for(const s of result.sections){near(s.level,101.5);near(s.width,5);near(s.effectiveHeight,1.5);near(s.zAxis,103);}
});
test('guide reversal and rigid rotation do not choose another physical valley',()=>{
  const line=[[0,5],[30,5]],settings={interval:5,lateralStep:.25,reach:12};
  const sorted=ring=>ring.slice(0,-1).map(p=>p.map(v=>Math.round(v*1e5)/1e5).join(',')).sort();
  for(const angle of [0,.37,1.2]){
    const c=Math.cos(angle),s=Math.sin(angle),transform=([x,y])=>[500000+c*x-s*y,7400000+s*x+c*y],
      terrain=(x,y)=>bankShape(-(x-500000)*s+(y-7400000)*c),forward=plan(line.map(transform),settings),back=plan(line.slice().reverse().map(transform),settings);
    const a=immutable(forward,heights(forward,terrain),options),b=immutable(back,heights(back,terrain),options);
    assertCorridor(a,forward);assertCorridor(b,back);assert.deepEqual(sorted(a.ring),sorted(b.ring));
    for(let i=0;i<a.sections.length;i++){
      const q=b.sections.at(-1-i);near(a.sections[i].floorPoint[0],q.floorPoint[0],1e-6);near(a.sections[i].floorPoint[1],q.floorPoint[1],1e-6);
    }
  }
});
test('a deeper remote valley beyond a crest cannot replace the nearby channel',()=>{
  const layout=plan([[0,.5],[30,.5]],{interval:5,lateralStep:.25,reach:14});
  const z=heights(layout,(x,y)=>y<=4?100+Math.min(2,Math.max(0,Math.abs(y)-1)):Math.min(103,97+Math.abs(y-9)));
  try{const result=immutable(layout,z,options);assertCorridor(result,layout);assert.ok(result.sections.every(s=>Math.abs(s.floorPoint[1])<=1&&s.left[1]<4),'engine switched across the crest to the deeper remote valley');}
  catch(e){assert.match(e.message,/crista|barreira|concorrent|amb.g|depress|vale/);assert.ok(e.diagnostic);}
});
test('two similarly near plausible valleys demand review instead of choosing a side',()=>{
  const layout=plan([[0,0],[30,0]],{interval:5,lateralStep:.25,reach:12});
  const z=heights(layout,(x,y)=>100+Math.min(3,Math.max(0,Math.abs(Math.abs(y)-4)-.5)));
  assertRefused(()=>immutable(layout,z,options),/concorrent|amb.g|vales|depress|mais de/);
});
test('NoData cannot be crossed to reach an attractive floor',()=>{
  const layout=plan([[0,5],[30,5]],{interval:5,lateralStep:.25,reach:12});
  const z=heights(layout,(x,y)=>y>2.5&&y<3.5?NaN:bankShape(y));
  assertRefused(()=>immutable(layout,z,options),/NoData|cota|fundo|quebra|depress/);
});
test('a valley at the search boundary cannot silently expand the corridor',()=>{
  const layout=plan([[0,5],[30,5]],{interval:5,lateralStep:.25,reach:5});
  const z=heights(layout,(x,y)=>100+Math.abs(y));
  assertRefused(()=>immutable(layout,z,options),/alcance|corredor|limite|fundo|borda|margem|quebra/);
});

const fixture=path.resolve(process.argv[2]||path.join(base,'diagnostic-profiles.json'));
if(fs.existsSync(fixture)){
  const real=JSON.parse(fs.readFileSync(fixture,'utf8')),run=real.runs.find(r=>r.reachPerSide===20);
  assert.ok(run,'real fixture lacks full 20 m/side profiles');assert.equal(run.resolution,1);assert.equal(run.lateralStep,.5);
  test('real manual 5 m/side fails without expansion; automatic search accepts the first sufficient 20 m/side',()=>{
    const before=JSON.stringify(real),samples=reach=>{
      const r=real.runs.find(r=>r.reachPerSide===reach);assert.ok(r,'search exceeded available native measured profiles');
      return {layout:r.layout,z:r.heights,resolution:r.resolution};
    };
    const limited=search({searchLimited:true,reach:5,mode:'auto'},samples);
    assert.equal(limited.error?.code,'CHANNEL_REACH_BANK');assert.deepEqual(limited.attempts.map(a=>a.reach),[5]);assert.equal(limited.result,undefined);
    const automatic=search({searchLimited:false,reach:5,mode:'auto'},samples);
    assert.equal(automatic.error,undefined);assert.equal(automatic.reach,20);assert.equal(automatic.reach*2,40);
    assert.deepEqual(automatic.attempts,[{reach:10,ok:false,code:'CHANNEL_REACH_BANK'},{reach:20,ok:true}]);
    assertCorridor(automatic.result,automatic.layout);assert.equal(automatic.result.sections.length,47);
    assert.equal(JSON.stringify(real),before,'adaptive attempts moved the guide or edited native elevations');
    console.log('REAL ADAPTIVE SEARCH '+JSON.stringify({attempts:automatic.attempts,acceptedWidth:automatic.reach*2,sections:automatic.result.sections.length}));
  });
  for(const [index,min,max] of [[28,3.5,5],[31,3,5]])test('real section '+(index+1)+' selects the sampled valley without moving its guide',()=>{
    const source=run.layout.sections[index],parallel={...plain(source),station:source.station+10,
      center:[source.center[0]+source.normal[1]*10,source.center[1]-source.normal[0]*10]};
    parallel.points=source.offsets.map(d=>pointAt(parallel,d));
    const layout={sections:[source,parallel]},z=[run.heights[index],run.heights[index]],result=immutable(layout,z,{mode:'auto',resolution:1});
    assertCorridor(result,layout);const s=result.sections[0];
    assert.ok(s.floorOffset>=min&&s.floorOffset<=max,'selected a different depression');
    const floorIndex=source.offsets.indexOf(s.floorOffset);if(floorIndex>=0)near(s.zFloor,z[0][floorIndex]);
    assert.ok(s.zFloor<s.zAxis-.5,'did not use actual depressed floor');
    console.log('REAL SECTION '+JSON.stringify({section:index+1,station:s.station,guideZ:s.zAxis,floorOffset:s.floorOffset,floorZ:s.zFloor,
      leftOffset:s.leftOffset,rightOffset:s.rightOffset,width:s.width,level:s.level,leftTop:s.detection.left?.offset,rightTop:s.detection.right?.offset}));
  });
  test('all real 20 m/side profiles preserve input and report bounded floor/bank choices',()=>{
    const rows=[];
    for(let i=0;i<run.layout.sections.length;i++){
      const source=run.layout.sections[i],parallel={...plain(source),station:source.station+10,
        center:[source.center[0]+source.normal[1]*10,source.center[1]-source.normal[0]*10]};
      parallel.points=source.offsets.map(d=>pointAt(parallel,d));
      try{const result=immutable({sections:[source,parallel]},[run.heights[i],run.heights[i]],{mode:'auto',resolution:1});assertCorridor(result,{sections:[source,parallel]});
        const s=result.sections[0];rows.push({section:i+1,ok:true,floorOffset:s.floorOffset,width:s.width,level:s.level});}
      catch(e){if(e.code==='ERR_ASSERTION')throw e;assert.ok(e.diagnostic?.profile?.length);rows.push({section:i+1,ok:false,error:e.message});}
    }
    assert.ok(rows[28].ok&&rows[31].ok,'S29 and S32 remain blocked');
    console.log('REAL PROFILE CHOICES '+JSON.stringify(rows));
  });
  test('full real corridor has valid topology and stays within the unchanged search area',()=>{
    const result=immutable(run.layout,run.heights,{mode:'auto',resolution:1});assertCorridor(result,run.layout);
    console.log('REAL FULL POLYGON '+JSON.stringify({accepted:true,sections:result.sections.length,vertices:result.ring.length,areaM2:area(result.ring),guideStationsOutside:result.sections.filter(s=>!inside(s.center,result.ring)).length}));
  });
  test('reversing the real guide preserves physical floor and polygon choices',()=>{
    const forward=immutable(run.layout,run.heights,{mode:'auto',resolution:1}),length=run.layout.length;
    const back=plan(real.axis.line.slice().reverse(),{interval:run.interval,lateralStep:run.lateralStep,reach:run.reachPerSide}),reversedHeights=[];
    for(const s of back.sections){
      const index=run.layout.sections.findIndex(old=>Math.abs(old.station-(length-s.station))<1e-6);
      assert.ok(index>=0,'reversed guide changed physical sample stations');reversedHeights.push(run.heights[index].slice().reverse());
    }
    const reverse=immutable(back,reversedHeights,{mode:'auto',resolution:1});assertCorridor(reverse,back);
    const normalize=ring=>ring.slice(0,-1).map(p=>p.map(v=>Math.round(v*1e5)/1e5).join(',')).sort();
    assert.deepEqual(normalize(forward.ring),normalize(reverse.ring));
  });
}else console.log('SKIP real-project profiles: pass the private diagnostic-profiles.json path to enable them.');

let failed=0;
for(const {name,fn} of tests){try{await fn();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+'\n'+(e.stack||e.message));}}
console.log(`${tests.length-failed}/${tests.length} independent guide/corridor safety tests passed`);
console.log('Scientific limit: sampled geometry is not field verification of the regular bed, bankfull level, bathymetry, or hydraulic continuity. NoData, unresolved competing valleys and invalid topology must not yield a partial committed channel.');
if(failed)process.exitCode=1;
