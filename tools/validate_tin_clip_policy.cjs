// Policy regression against the real clipping helpers and persistence code.
// An optional stage path runs the same assertions against a baseline build.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=process.argv[2]?path.resolve(process.argv[2]):path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const rasterSource=read('src/core/parts/20-raster-dem.js');
const tinSource=read('src/core/parts/25-geoprocessing-tin.js');
const persistenceSource=read('src/core/parts/26-project-persistence.js');
const plain=value=>JSON.parse(JSON.stringify(value));
function between(source,start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'production code must remain extractable: '+start);
  return source.slice(a,b);
}
function freeze(value){
  if(value&&typeof value==='object'&&!ArrayBuffer.isView(value)){
    Object.values(value).forEach(freeze);Object.freeze(value);
  }
  return value;
}
const clipping=between(rasterSource,'function rasterClipRings(','function rasterVisibleBounds(');
const sewing=between(tinSource,'function sewChains(','function runCutByLimit(');
const limits=between(tinSource,'function tinAneisExternos(','/* aplica o recorte na grade');
const square=(x,y,size=100)=>[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]];
const closed=(n=9)=>Array.from({length:n},(_,i)=>({geom:square(i*300,0),props:{COTA:100+i},zg:[100,100,100,100,100]}));
const open=(n=23)=>Array.from({length:n},(_,i)=>({geom:[[i*300,1000],[i*300+50,1020],[i*300+100,1000]],props:{COTA:200+i},zg:[200,200,200]}));
const layer=(features=closed().concat(open()),options={})=>({id:7,name:'NA',gtype:'line',crs:'EPSG:31982',features,...options});
const raster=options=>({id:2,name:'NA — Superfície Raster (5 m)',_tinSourceId:7,
  style:{mode:'hipso_hs',opacity:0.8},d:{nc:2,nr:2,cs:5,xll:0,yll:0,z:new Float32Array([100,200,300,400])},...options});
function context(layers){
  const c={console,Float32Array,Uint8Array,ArrayBuffer,S:{layers,rasters:[],groups:[],plates:[],hidro:{},workCRS:'EPSG:31982'},
    reproj:(from,to,x,y)=>{assert.equal(from,to,'these fixtures already use the work CRS');return [x,y];}};
  vm.createContext(c);vm.runInContext(sewing+'\n'+limits+'\n'+clipping,c,{filename:'real-tin-clip-helpers.js'});return c;
}
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}

test('unclipped mixed source cannot infer a mask or alter raster/source metadata',()=>{
  const L=freeze(layer()),c=context([L]),r=raster({_tinAutoClip:false}),before=plain(r);
  // The actual automatic algorithm sees only the 9 closed curves. Without
  // the explicit false policy, rendering used them to cut away the 23 open
  // curves despite the generator having triangulated the full source.
  assert.equal(c.tinRecorteAutomatico(L).length,9,'fixture reproduces 9 closed and 23 open curves');
  assert.equal(c.rasterClipRings(r),null,'explicit no-clip must not infer closed source contours as a mask');
  assert.deepEqual(plain(r),before);assert.equal(L.features.length,32);
  assert.equal(Object.hasOwn(r,'_exactClipRings'),false);assert.equal(Object.hasOwn(r,'_v3'),false);
});

test('false policy preserves all-open, all-closed, mixed and polygon sources without mutation',()=>{
  for(const L of [layer(open(3)),layer(closed(3)),layer(closed(3).concat(open(3))),layer(closed(2),{gtype:'polygon'})]){
    freeze(L);const c=context([L]),r=freeze(raster({_tinAutoClip:false,_exactClipRings:[]})),before=plain(L);
    assert.equal(c.rasterClipRings(r),null);assert.deepEqual(plain(L),before);
    assert.equal(r._exactClipRings.length,0,'an empty mask must not authorize source inference');
    assert.deepEqual(Array.from(r.d.z),[100,200,300,400],'render policy cannot change the elevation grid');
  }
});

test('explicit exact masks have priority even when auto clipping is disabled',()=>{
  const mask=freeze([square(9000,2000)]),r=freeze(raster({_tinAutoClip:false,_exactClipRings:mask,
    _v3:{papel:'projeto',limId:'other'}})),c=context([freeze(layer())]);
  assert.equal(c.rasterClipRings(r),mask,'the chosen exact mask must be returned unchanged');
  assert.equal(c.rasterClipRings(null),null);
});

test('explicit project limId is honored without allowing a fallback source or name',()=>{
  const L=freeze(layer()),chosen=freeze(layer([{geom:square(9000,2000),props:{}}],{id:18,name:'Limite escolhido',gtype:'polygon'}));
  const c=context([L,chosen]),r=raster({_tinAutoClip:false,_v3:{papel:'projeto',limId:'18'}});
  const rings=c.rasterClipRings(r);assert.deepEqual(plain(rings),[square(9000,2000)]);
  assert.equal(r._v3.limId,'18');assert.notEqual(rings[0],chosen.features[0].geom,'cached mask must not alias the original geometry');
  const missing=freeze(raster({_tinAutoClip:false,_v3:{papel:'projeto',limId:'missing'}}));
  assert.equal(c.rasterClipRings(missing),null,'missing explicit limit must not silently use the source or name');
});

test('terrain limId remains a 3D hole, not a 2D mask, for both current and legacy rasters',()=>{
  const c=context([freeze(layer())]);
  for(const flag of [false,true,undefined]){
    const r=freeze(raster({_tinAutoClip:flag,_v3:{papel:'terreno',limId:7}}));
    assert.equal(c.rasterClipRings(r),null);assert.equal(Object.hasOwn(r,'_exactClipRings'),false);
  }
  const mask=freeze([square(-200,-200)]),r=freeze(raster({_tinAutoClip:false,_exactClipRings:mask,_v3:{papel:'terreno',limId:7}}));
  assert.equal(c.rasterClipRings(r),mask,'an explicit analytical mask still precedes the terrain-hole guard');
});

test('legacy source auto clipping is unchanged for open, closed and mixed sources',()=>{
  for(const [features,expected] of [[open(3),0],[closed(3),3],[closed().concat(open()),9]]){
    const L=freeze(layer(features)),c=context([L]),before=plain(L);
    for(const flag of [undefined,true,null]){
      const r=raster(flag===undefined?{}:{_tinAutoClip:flag}),rings=c.rasterClipRings(r);
      assert.equal(rings?.length||0,expected);assert.deepEqual(plain(L),before);
      if(expected){assert.equal(r._v3.limId,7);assert.equal(r._exactClipRings,rings);}
      else assert.equal(Object.hasOwn(r,'_exactClipRings'),false);
    }
  }
});

test('name-based legacy fallback is suppressed only by explicit false',()=>{
  const c=context([freeze(layer(closed(2)))]);
  const noFallback=freeze(raster({_tinAutoClip:false,_tinSourceId:'missing',name:'  na  — derivada'}));
  assert.equal(c.rasterClipRings(noFallback),null);
  const legacy=raster({_tinSourceId:'missing',name:'  na  — derivada'});
  assert.equal(c.rasterClipRings(legacy).length,2);assert.equal(legacy._v3.limId,7);
});

test('legacy structural boundary fallback remains available when automatic helper is absent',()=>{
  const boundary=freeze(layer([{geom:square(0,0),props:{TIPO:'Limite externo'}}])),c=context([boundary]);
  c.tinRecorteAutomatico=undefined;
  assert.equal(c.rasterClipRings(raster()).length,1);
  assert.equal(c.rasterClipRings(freeze(raster({_tinAutoClip:false}))),null);
});

test('generator records the resolved no-fallback policy before first render for its shared output',()=>{
  const generator=tinSource.slice(tinSource.indexOf('async function runTIN(){'));
  const output=generator.indexOf('const r={id:rid++'),render=generator.indexOf('renderRaster(r)',output);
  assert.ok(output>=0&&render>output,'find the shared raster/TIN output and first rendering');
  assert.match(generator.slice(output,render),/_tinAutoClip\s*:\s*false/,
    'all explicit generator modes must disable later heuristic source clipping');
});

test('real project serialization/reconstruction round-trips false, true and legacy null policies',()=>{
  const c=context([]);
  Object.assign(c,{window:{},document:{getElementById:()=>null},autoAreaSyncAll(){},gradeParaSalvar:g=>g,
    f32ToB64:arr=>Buffer.from(arr.buffer,arr.byteOffset,arr.byteLength).toString('base64'),
    b64ToF32:text=>{const b=Buffer.from(text,'base64');return new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));},rid:10});
  vm.runInContext(between(persistenceSource,'function projectData(){','function projectManualSaveMode('),c,{filename:'real-project-serializer.js'});
  // Run the production raster reconstruction before UI/render side effects;
  // keep the original grid, ID, style, mask and policy expressions intact.
  const load=between(persistenceSource,'(d.rasters||[]).forEach(o=>{','    if(r._cnOrto&&r.cnMeta){')+'S.rasters.push(r);\n});';
  vm.runInContext('function restoreRasters(d){S.rasters=[];'+load+'return S.rasters;}',c,{filename:'real-project-raster-reconstruction.js'});
  for(const flag of [false,true,undefined,null,'false']){
    const original=raster(flag===undefined?{}:{_tinAutoClip:flag});c.S.rasters=[original];
    const before=plain(original),saved=c.projectData(),serialized=JSON.parse(JSON.stringify(saved));
    const stored=typeof flag==='boolean'?flag:null;
    assert.equal(serialized.rasters[0].tinAutoClip,stored,'false must not be coerced into the legacy null value');
    assert.deepEqual(plain(original),before,'serializing cannot alter the source raster');
    const restored=c.restoreRasters(serialized)[0];
    assert.equal(restored._tinAutoClip,typeof flag==='boolean'?flag:undefined);
    assert.deepEqual(Array.from(restored.d.z),[100,200,300,400]);assert.equal(restored._tinSourceId,7);
    c.S.layers=[freeze(layer())];
    assert.equal(c.rasterClipRings(restored)?.length||0,flag===false?0:9,'reopening must preserve the effective clipping policy');
    c.S.layers=[];
  }
  const saved=c.projectData();delete saved.rasters[0].tinAutoClip;
  assert.equal(c.restoreRasters(saved)[0]._tinAutoClip,undefined,'files predating this metadata must keep legacy semantics');
});

console.log(`TIN clipping policy: ${checks} tests passed.`);
