import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx=vm.createContext({console,AbortController,setTimeout,clearTimeout,Float32Array,Float64Array,ArrayBuffer});
ctx.window=ctx;
vm.runInContext(fs.readFileSync(path.join(base,'src/vendor/proj4.min.js'),'utf8'),ctx);
ctx.proj4.defs('EPSG:31983','+proj=utm +zone=23 +south +ellps=GRS80 +units=m +no_defs');
vm.runInContext(fs.readFileSync(path.join(base,'src/modules/environmental/channel-dem-sampler.js'),'utf8'),ctx);
const {prepare,isElevation}=ctx.GeoMineChannelDEM,workCRS='EPSG:31983';
const tests=[];
const test=(name,run)=>tests.push({name,run});
const near=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const memory=(overrides={})=>({id:1,name:'MDT',crs:workCRS,d:{nc:3,nr:2,cs:2,csy:4,xll:500000,yll:7400000,
  z:new Float32Array([10,20,30,40,50,60]),native:true,resampled:1,...overrides}});
const opts=extra=>({workCRS,...extra});
function nativeFixture({width=600,height=500,nd=-9999,cell=(c,r)=>r*1000+c,read}={}){
  const calls=[];
  const im={fileDirectory:{SamplesPerPixel:1},getWidth:()=>width,getHeight:()=>height,
    getSamplesPerPixel:()=>1,getBoundingBox:()=>[500000,7400000,500000+width,7400000+height],getGDALNoData:()=>nd,
    getResolution:()=>[1,-1,0],readRasters:()=>{throw new Error('Direct decoding forbidden');}};
  ctx.GeoMineTileRuntime={read:async (image,options,control)=>{
    assert.equal(image,im);calls.push({options,control});
    assert.deepEqual(Array.from(options.samples),[0]);
    assert.ok(!('width' in options)&&!('height' in options));
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(control.isCurrent(),true);
    const [l,t,r,b]=options.window;
    assert.ok(r-l<=128&&b-t<=128&&l>=0&&t>=0&&r<=width&&b<=height);
    if(read)return read(image,options,control);
    const values=new Float64Array((r-l)*(b-t));
    for(let row=t;row<b;row++)for(let col=l;col<r;col++)values[(row-t)*(r-l)+col-l]=cell(col,row);
    return [values];
  }};
  return {im,calls,r:{id:2,name:'Nativo',crs:workCRS,d:{nc:6,nr:5,cs:width/6,csy:height/5,xll:500000,yll:7400000,
    z:new Float32Array(30).fill(-42),resampled:100,_img0:im,_W0:width,_H0:height,_nd:nd,
    _bb:[500000,7400000,500000+width,7400000+height]}}};
}
const point=(col,row,width=600,height=500)=>[500000+col+.5,7400000+height-row-.5];

test('memory anisotropic pixels, centers, interpolation, inclusive edges and outside',async()=>{
  const r=memory(),before=Array.from(r.d.z),sampler=await prepare(r,opts());
  near(sampler.resolution,2);assert.equal(sampler.native,true);
  const out=await sampler.sample([[500001,7400006],[500003,7400002],[500002,7400004],[500000,7400008],
    [500006,7400000],[499999.999,7400004],[500003,7400008.001]]);
  [10,50,30,10,60].forEach((v,i)=>near(out[i],v));assert.ok(out.slice(5).every(Number.isNaN));
  assert.deepEqual(Array.from(r.d.z),before);assert.equal(r.d._full,undefined);sampler.close();
});
test('strict NoData, NaN and zero-weight neighbors',async()=>{
  const r=memory({noData:-9999,z:new Float32Array([10,-9999,30,40,NaN,60])}),s=await prepare(r,opts());
  const out=await s.sample([[500001,7400006],[500002,7400006],[500003,7400002],[500005,7400006]]);
  near(out[0],10);assert.ok(Number.isNaN(out[1])&&Number.isNaN(out[2]));near(out[3],30);s.close();
});
test('Float32 rounded and string NoData declarations',async()=>{
  const r=memory({_nd:'-3.4028234663852886e+38'});r.d.z[0]=Number(r.d._nd);
  const s=await prepare(r,opts());assert.ok(Number.isNaN((await s.sample([[500001,7400006]]))[0]));s.close();
});
test('exact clip outer ring, hole and boundary',async()=>{
  const r=memory();r._exactClipRings=[[[500000,7400000],[500004,7400000],[500004,7400008],[500000,7400008]],
    [[500002,7400001],[500003,7400001],[500003,7400003],[500002,7400003]]];
  const s=await prepare(r,opts()),out=await s.sample([[500001,7400006],[500005,7400006],[500002.5,7400002],[500004,7400006]]);
  assert.ok(Number.isFinite(out[0])&&Number.isNaN(out[1])&&Number.isNaN(out[2])&&Number.isFinite(out[3]));s.close();
});
test('working CRS must be known UTM meters, source CRS cannot be guessed',async()=>{
  await assert.rejects(()=>prepare(memory(),{workCRS:'EPSG:4326'}),/UTM/);
  await assert.rejects(()=>prepare(memory(),{workCRS:'EPSG:999999'}),/CRS/);
  ctx.proj4.defs('UTM_FEET','+proj=utm +zone=23 +south +ellps=GRS80 +units=ft +no_defs');
  await assert.rejects(()=>prepare(memory(),{workCRS:'UTM_FEET'}),/UTM/);
  const r=memory();delete r.crs;await assert.rejects(()=>prepare(r,opts()),/CRS/);
});
test('geographic raster reprojected, resolution returned in meters',async()=>{
  const r=memory({nc:3,nr:3,cs:.00001,csy:.00002,xll:-45,yll:-23.5,z:new Float32Array(9).fill(125)});r.crs='EPSG:4326';
  const p=ctx.proj4('EPSG:4326',workCRS,[-44.999985,-23.49997]),s=await prepare(r,opts());
  assert.ok(s.resolution>.8&&s.resolution<1.2);near((await s.sample([p]))[0],125);s.close();
});
test('unknown or failing projection is not silently treated as identity',async()=>{
  const r=memory();r.crs='EPSG:999999';await assert.rejects(()=>prepare(r,opts()),/CRS/);
});
test('known generated LiDAR/TIN grids use work CRS without mutating metadata',async()=>{
  for(const [where,key,value] of [['r','_lidarGroundMDT',true],['r','_tinSourceId',0],['r','_tinMethod','delaunay'],['d','_tinMethod','ground-interno-interpolado']]){
    const r=memory();delete r.crs;(where==='r'?r:r.d)[key]=value;
    const s=await prepare(r,opts());near((await s.sample([[500001,7400006]]))[0],10);s.close();
    assert.equal(r.crs,undefined);assert.equal(r.d.crs,undefined);
  }
});
test('generated provenance does not override an explicit unknown CRS or reduced preview',async()=>{
  const r=memory();r._tinSourceId=12;r.crs='EPSG:999999';await assert.rejects(()=>prepare(r,opts()),/CRS/);
  delete r.crs;r.d.resampled=4;await assert.rejects(()=>prepare(r,opts()),/TIFF original/);
  r.d.resampled=1;r.d.fromProject=true;r.d.native=false;await assert.rejects(()=>prepare(r,opts()),/TIFF original/);
});
test('original TIFF without CRS is not identified by a leftover generated marker',async()=>{
  const {r}=nativeFixture();delete r.crs;r._tinSourceId=10;await assert.rejects(()=>prepare(r,opts()),/CRS/);
});
test('known non-elevation quantities, vertical units and thematic flags are excluded',async()=>{
  for(const [where,key,value] of [['r','quantity','slope'],['d','quantity','aspect'],['r','quantity','mcfIndex'],['r','quantity','CN'],
    ['r','unit','pct'],['d','unit','deg'],['r','_cnOrto',true],['r','_cnSlope',true],['d','_d8Source',{}],['d','_cnClass',new Uint8Array(6)]]){
    const r=memory();(where==='r'?r:r.d)[key]=value;assert.equal(isElevation(r),false);
    await assert.rejects(()=>prepare(r,opts()),/não cotas de terreno/);
  }
  const r=memory();r.style={mode:'slopeclass'};assert.equal(isElevation(r),false);
  assert.equal(isElevation(null),false);assert.equal(isElevation(memory()),true);
});
test('CRS angular units do not disqualify a geographic elevation raster',async()=>{
  const r=memory();r.crs='EPSG:4326';r.quantity='elevation';r.unit='m';assert.equal(isElevation(r),true);
  // Eligibility is only exclusion of known thematic products, not evidence
  // that an arbitrary unknown or bathymetric source has vertical metre units.
  r.quantity='bathymetry';assert.equal(isElevation(r),true);
});
test('display revision/style changes do not invalidate elevation data',async()=>{
  const r=memory(),s=await prepare(r,opts());r._rev=18;r.style={mode:'gray',opacity:.3};
  near((await s.sample([[500001,7400006]]))[0],10);s.close();
});
test('portable/project previews require the TIFF original',async()=>{
  for(const overrides of [{resampled:2,native:true},{fromProject:true,native:false,resampled:undefined},
    {fromProject:true,native:false,resampled:1}])await assert.rejects(()=>prepare(memory(overrides),opts()),e=>e.code==='CHANNEL_NATIVE_MISSING'&&/TIFF original/.test(e.message));
});
test('saved native grid accepted without file access',async()=>{
  const s=await prepare(memory({fromProject:true,native:true}),opts());near((await s.sample([[500001,7400006]]))[0],10);s.close();
});
test('full native in-memory cache preferred and no full copy made',async()=>{
  const {r,calls}=nativeFixture();
  r.d._full={nc:600,nr:500,cs:1,csy:1,xll:500000,yll:7400000,z:new Float32Array(300000).fill(93)};
  const z=r.d._full.z,s=await prepare(r,opts());near((await s.sample([point(1,2)]))[0],93);
  assert.equal(r.d._full.z,z);assert.equal(calls.length,0);s.close();
});
test('larger but non-native memory cache cannot substitute the original',async()=>{
  const {r,calls}=nativeFixture();r.d._full={nc:60,nr:50,cs:10,csy:10,xll:500000,yll:7400000,z:new Float32Array(3000).fill(-99)};
  const s=await prepare(r,opts());near((await s.sample([point(2,3)]))[0],3002);assert.equal(calls.length,1);s.close();
});
test('native dimensions override absent or stale preview flags',async()=>{
  const {r,calls}=nativeFixture();delete r.d.resampled;r.d.native=true;
  const s=await prepare(r,opts());near((await s.sample([point(2,3)]))[0],3002);assert.equal(calls.length,1);s.close();
});
test('native windows, cache reuse and interpolation across pages',async()=>{
  const {r,calls}=nativeFixture(),s=await prepare(r,opts());
  near(s.resolution,1);near((await s.sample([point(127,127)]))[0],127127);assert.equal(calls.length,1);
  const p=point(127.5,127.5);near((await s.sample([p,p]))[0],127627.5);assert.equal(calls.length,4);
  await s.sample([p]);assert.equal(calls.length,4);
  assert.ok(calls.reduce((n,c)=>{const [l,t,r,b]=c.options.window;return n+(r-l)*(b-t);},0)<600*500);s.close();
});
test('native EOF windows and corners stay within source bounds',async()=>{
  const {r,calls}=nativeFixture({width:259,height:261}),s=await prepare(r,opts());
  const out=await s.sample([[500259,7400000],[500259.0001,7400000],[500000,7400261]]);
  near(out[0],260258);assert.ok(Number.isNaN(out[1]));near(out[2],0);
  assert.ok(calls.some(c=>Array.from(c.options.window).join(',')==='256,256,259,261'));s.close();
});
test('native NoData does not fill holes',async()=>{
  const {r}=nativeFixture({cell:(c,row)=>c===3&&row===4?-9999:22}),s=await prepare(r,opts());
  const out=await s.sample([point(3,4),point(2.5,4),point(2,4)]);
  assert.ok(Number.isNaN(out[0])&&Number.isNaN(out[1]));near(out[2],22);s.close();
});
test('native LRU is bounded and evicts old pages',async()=>{
  const {r,calls}=nativeFixture({width:2560,height:2560}),s=await prepare(r,opts());
  await s.sample([point(1,1,2560,2560)]);
  const points=[];for(let row=0;row<2;row++)for(let col=0;col<20;col++)points.push(point(col*128+1,row*128+1,2560,2560));
  await s.sample(points);const count=calls.length;
  await s.sample([point(1,1,2560,2560)]);assert.equal(calls.length,count+1);s.close();
});
test('pre-aborted, closed and changed-grid samplers reject',async()=>{
  const c=new AbortController();c.abort();await assert.rejects(()=>prepare(memory(),opts({signal:c.signal})),{name:'AbortError'});
  const r=memory(),s=await prepare(r,opts());r.d.z=new Float32Array(6);
  await assert.rejects(()=>s.sample([[500001,7400006]]),{name:'AbortError'});s.close();
  const closed=await prepare(memory(),opts());closed.close();closed.close();await assert.rejects(()=>closed.sample([]),{name:'AbortError'});
});
test('abort interrupts waiting for native decode without closing shared image',async()=>{
  let release;const c=new AbortController(),{r,calls}=nativeFixture({read:()=>new Promise(resolve=>{release=resolve;})});
  const s=await prepare(r,opts({signal:c.signal})),job=s.sample([point(1,1)]);
  await new Promise(resolve=>setTimeout(resolve,0));c.abort();
  await assert.rejects(()=>job,{name:'AbortError'});assert.equal(calls[0].options.signal.aborted,true);
  release([new Float64Array(128*128)]);assert.ok(r.d._img0);s.close();
});
test('stale native result rejected and never reused',async()=>{
  let release,current=true;const {r,calls}=nativeFixture({read:()=>new Promise(resolve=>{release=resolve;})});
  const s=await prepare(r,opts({isCurrent:()=>current})),job=s.sample([point(1,1)]);
  await new Promise(resolve=>setTimeout(resolve,0));current=false;assert.equal(calls[0].control.isCurrent(),false);
  release([new Float64Array(128*128)]);await assert.rejects(()=>job,{name:'AbortError'});s.close();
});
test('replaced original image invalidates a pending native result',async()=>{
  let release;const {r}=nativeFixture({read:()=>new Promise(resolve=>{release=resolve;})});
  const s=await prepare(r,opts()),job=s.sample([point(1,1)]);
  await new Promise(resolve=>setTimeout(resolve,0));r.d._img0={};release([new Float64Array(128*128)]);
  await assert.rejects(()=>job,{name:'AbortError'});s.close();
});
test('in-memory batches yield and honor cancellation',async()=>{
  const c=new AbortController(),s=await prepare(memory(),opts({signal:c.signal,onProgress:()=>c.abort()}));
  await assert.rejects(()=>s.sample(new Array(3000).fill([500001,7400006])),{name:'AbortError'});s.close();
});
test('rotated, flipped and multiband native sources rejected',async()=>{
  let fixture=nativeFixture();fixture.im.fileDirectory.ModelTransformation=[1,.1,0,500000,0,-1,0,7400500,0,0,1,0,0,0,0,1];
  await assert.rejects(()=>prepare(fixture.r,opts()),/afim/);
  fixture=nativeFixture();fixture.im.getResolution=()=>[1,1,0];await assert.rejects(()=>prepare(fixture.r,opts()),/invertido/);
  fixture=nativeFixture();fixture.im.getSamplesPerPixel=()=>3;await assert.rejects(()=>prepare(fixture.r,opts()),/multibanda/);
});
test('invalid georeference and incomplete native block fail explicitly',async()=>{
  let fixture=nativeFixture();fixture.im.getBoundingBox=()=>[0,0,0,0];await assert.rejects(()=>prepare(fixture.r,opts()),/Dimensões/);
  fixture=nativeFixture({read:async()=>[new Float32Array(1)]});const s=await prepare(fixture.r,opts());
  await assert.rejects(()=>s.sample([point(1,1)]),/incompleto/);s.close();
});
test('edited binding does not read a different historical TIFF',async()=>{
  const {r,calls}=nativeFixture();r._projectNativeBinding={};ctx.projectNativeRasterSourceCurrent=()=>false;
  await assert.rejects(()=>prepare(r,opts()),/alterada/);assert.equal(calls.length,0);delete ctx.projectNativeRasterSourceCurrent;
});
test('concurrent sample callers do not create parallel decode floods',async()=>{
  let active=0,max=0;const {r}=nativeFixture({read:async (im,o)=>{
    active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,1));active--;
    return [new Float64Array((o.window[2]-o.window[0])*(o.window[3]-o.window[1])).fill(7)];
  }}),s=await prepare(r,opts());
  const out=await Promise.all([s.sample([point(1,1)]),s.sample([point(200,200)]),s.sample([point(400,400)])]);
  out.forEach(values=>near(values[0],7));assert.equal(max,1);s.close();
});

test('private recovered source uses real pixels, source CRS and closes only the lease',async()=>{
  const {r,im,calls}=nativeFixture();delete r.d._img0;delete r.crs;
  let closed=0;const before=JSON.stringify(r);
  ctx.GeoMineChannelNativeSource={resolve:async(target,options)=>{
    assert.equal(target,r);assert.equal(options.workCRS,workCRS);
    return {image:im,sourceCRS:workCRS,isCurrent:()=>true,close:()=>closed++};
  }};
  try{
    const s=await prepare(r,opts());near((await s.sample([point(1,1)]))[0],1001);
    assert.equal(JSON.stringify(r),before);assert.equal(calls.length,1);
    s.close();s.close();assert.equal(closed,1);
  }finally{delete ctx.GeoMineChannelNativeSource;}
});
test('missing resolver result preserves preview and returns actionable error',async()=>{
  const r=memory({resampled:2});const before=JSON.stringify(r);let count=0;
  ctx.GeoMineChannelNativeSource={resolve:async()=>{count++;return null;}};
  try{await assert.rejects(()=>prepare(r,opts()),e=>e.code==='CHANNEL_NATIVE_MISSING');assert.equal(count,1);assert.equal(JSON.stringify(r),before);}
  finally{delete ctx.GeoMineChannelNativeSource;}
});
test('invalid recovered image releases private resource without sampling preview',async()=>{
  const {r,im,calls}=nativeFixture();delete r.d._img0;im.fileDirectory.ModelTransformation=[1,1,0,0,0,-1,0,0,0,0,1,0,0,0,0,1];
  let closed=0;ctx.GeoMineChannelNativeSource={resolve:async()=>({image:im,sourceCRS:workCRS,isCurrent:()=>true,close:()=>closed++})};
  try{await assert.rejects(()=>prepare(r,opts()),/rotacionada/);assert.equal(closed,1);assert.equal(calls.length,0);}
  finally{delete ctx.GeoMineChannelNativeSource;}
});
test('recovered source invalidation cancels samples',async()=>{
  const {r,im,calls}=nativeFixture();delete r.d._img0;let valid=true,closed=0;
  ctx.GeoMineChannelNativeSource={resolve:async()=>({image:im,sourceCRS:workCRS,isCurrent:()=>valid,close:()=>closed++})};
  try{const s=await prepare(r,opts());valid=false;await assert.rejects(()=>s.sample([point(1,1)]),/cancelada/);s.close();assert.equal(closed,1);assert.equal(calls.length,0);}
  finally{delete ctx.GeoMineChannelNativeSource;}
});
let failed=0;
for(const {name,run} of tests){try{await run();console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name,error);}}
console.log(`${tests.length-failed}/${tests.length} channel DEM sampler tests passed`);
if(failed)process.exitCode=1;
