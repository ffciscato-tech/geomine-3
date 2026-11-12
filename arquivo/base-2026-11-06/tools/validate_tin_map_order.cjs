// Executes the production runTIN registration path, ordering helpers and
// renderer with a minimal map adapter. Optional stage path reproduces the
// same assertions against baseline/ without editing either source tree.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=process.argv[2]?path.resolve(process.argv[2]):path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const tin=read('src/core/parts/25-geoprocessing-tin.js');
const bootstrap=read('src/core/parts/01-bootstrap-crs-state-command.js');
const raster=read('src/core/parts/20-raster-dem.js');
const persistence=read('src/core/parts/26-project-persistence.js');
const plain=value=>JSON.parse(JSON.stringify(value));
function between(source,start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'production code must remain extractable: '+start);return source.slice(a,b);
}
const generator=tin.slice(tin.indexOf('async function runTIN(){'));
const registration=between(generator,'  const r={id:rid++','  // FEEDBACK IMPOSSÍVEL DE PERDER');
const stackHelpers=between(bootstrap,'function nodeKey(','/* ---------- Toast ---------- */');
const disablePrevious=between(tin,'function tinDesligaAnteriores(','/* Gera o MDT TIN');
const renderer=between(raster,'function renderRaster(','/* ---------- GeoTIFF RGB');
const restoreOrder=between(persistence,'  {\n    const st=Array.isArray(d.stack)','  S.plates=Array.isArray(d.plates)');
const baseStack=['L:8','R:2','G:99','L:7','I:0','R:3','L:9'];
const overlay=()=>({addTo(map){map.attached.add(this);return this;},setZIndex(z){this.z=z;}});
function fixture(options={}){
  const events=[],panes=new Map(),map={attached:new Set(),getPane:name=>panes.get(name),
    createPane(name){const pane={style:{}};panes.set(name,pane);return pane;},
    removeLayer(o){this.attached.delete(o);},hasLayer(o){return this.attached.has(o);}};
  const layers=[{id:7,name:'NA',gtype:'line',groupId:10,visible:true,llayer:overlay(),features:[]},
    {id:8,name:'Domínios',gtype:'polygon',groupId:20,visible:true,llayer:overlay(),features:[]},
    {id:9,name:'Oculta',gtype:'line',groupId:10,visible:false,llayer:overlay(),features:[]}];
  const grid=()=>({nc:2,nr:2,cs:5,xll:0,yll:0,z:new Float32Array([100,200,300,400])});
  const rasters=[{id:2,name:'MDT original',groupId:20,visible:true,d:grid(),style:{mode:'hipso',opacity:1},overlay:overlay()},
    {id:3,name:'NA anterior',_tinSourceId:7,groupId:10,visible:!!options.previousVisible,d:grid(),style:{mode:'hipso',opacity:.8},overlay:overlay()}];
  if(options.previousVisible)map.attached.add(rasters[1].overlay);
  const c={console,Float32Array,Map,Set,map,panes,events,
    S:{layers,rasters,groups:[{id:10,name:'Hidrogeologia',collapsed:false},{id:20,name:'Base',collapsed:true},
      {id:99,name:'Grupo vazio',collapsed:true}],stack:baseStack.slice(),img:{url:'data:orthophoto',visible:true,groupId:20,overlay:overlay()},workCRS:'EPSG:31983'},
    L:layers[0],rid:50,g:grid(),isGroundLidar:!!options.ground,cavaCondicionada:!!options.pit,
    recortePorTerreno:!!options.terrainClip,tinFormato:options.mode||'raster',nomeClip:null,LcTIN:null,aneisTIN:null,
    X:[0,5,0],Y:[0,0,5],Zv:[100,200,300],D:{triangles:[0,1,2]},edgeGuard:{value:0},malhaTIN:{triangles:1},
    // Geometry computation and canvas painting are outside this order-only
    // fixture. Production registration, stackSync, zApply and renderRaster
    // remain unmodified and execute for every test.
    tinAnexaExato(d,xs,ys,zs,tri,_edge,clip){d.tin={xs,ys,zs,tri,clip};},
    gradeParaTela:g=>g,rasterGradeOriginalCanvas:()=>null,
    rasterCanvas:()=>({toDataURL:()=>'data:image/png;base64,test'}),
    rasterBounds:(_r,g)=>[g.xll,g.yll,g.xll+g.nc*g.cs,g.yll+g.nr*g.cs],
    toWGS:(_crs,x,y)=>[x,y],wgsBoundsOK:()=>true,
    L2:{imageOverlay:()=>overlay()},projectAutoSaveRaster(r){events.push({kind:'autosave',id:r.id,stack:plain(c.S.stack)});}};
  vm.createContext(c);
  vm.runInContext(stackHelpers+'\n'+disablePrevious+'\n'+renderer,c,{filename:'real-tin-map-order-helpers.js'});
  c.renderTinMalha2D=r=>{r.overlay=overlay();if(r.visible)r.overlay.addTo(map);c.zApply();return true;};
  const realRender=c.renderRaster;
  c.renderRaster=r=>{events.push({kind:'render',id:r.id,stack:plain(c.S.stack),registered:c.S.rasters.includes(r)});return realRender(r);};
  vm.runInContext('function registerOutput(){'+registration+'\nreturn r;}',c,{filename:'real-runTIN-output-registration.js'});
  vm.runInContext('function restoreStack(d){'+restoreOrder+'}',c,{filename:'real-project-stack-restore.js'});
  return c;
}
const metadata=c=>({groups:plain(c.S.groups),layers:c.S.layers.map(o=>({id:o.id,groupId:o.groupId,visible:o.visible})),
  rasters:c.S.rasters.filter(o=>o.id!==50).map(o=>({id:o.id,groupId:o.groupId,visible:o.visible})),
  ortho:{visible:c.S.img.visible,groupId:c.S.img.groupId}});
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS '+name);}

test('new raster is at the top before its first render, above existing MDT and polygons',()=>{
  const c=fixture(),oldMetadata=metadata(c),oldStack=c.S.stack.slice(),r=c.registerOutput();
  const first=c.events.find(e=>e.kind==='render');assert.equal(first.id,50);assert.equal(first.registered,true);
  assert.equal(first.stack[0],'R:50','runTIN must place its new output before the first render, not rely on the bottom-appending fallback');
  assert.deepEqual(first.stack.slice(1),oldStack,'all existing keys keep their exact relative order');
  assert.deepEqual(plain(c.S.stack),['R:50',...oldStack]);assert.deepEqual(metadata(c),oldMetadata);
  assert.ok(c.map.hasLayer(r.overlay),'the newly generated raster is actually visible');
  const z=c.panes.get('alagis_R50').style.zIndex;
  assert.ok(z>c.panes.get('alagis_R2').style.zIndex,'result pane must be above the MDT');
  assert.ok(z>c.panes.get('alagis_L8').style.zIndex,'result pane must be above polygon overlays');
  assert.equal(c.events.at(-1).kind,'autosave');assert.equal(c.events.at(-1).stack[0],'R:50');
});

test('raster, pure TIN and specialized outputs all use the same top-registration path',()=>{
  for(const options of [{mode:'raster'},{mode:'tin'},{mode:'raster',ground:true},{mode:'raster',pit:true},{mode:'raster',terrainClip:true}]){
    const c=fixture(options),before=metadata(c),r=c.registerOutput();
    assert.equal(c.events[0].kind,'render');assert.equal(c.events[0].stack[0],'R:50');
    assert.equal(c.S.stack[0],'R:50');assert.deepEqual(metadata(c),before);
    assert.equal(!!r.tinPuro,options.mode==='tin');
    assert.equal(c.S.rasters.filter(o=>o.id===r.id).length,1);
  }
});

test('insertion removes duplicates of its new key without moving other keys or group markers',()=>{
  const c=fixture();c.S.stack=Object.freeze(['L:8','R:50','R:2','G:99','L:7','R:50','I:0','R:3','L:9']);
  const original=c.S.stack,before=metadata(c);c.registerOutput();
  assert.deepEqual(plain(c.S.stack),['R:50',...baseStack]);
  assert.equal(c.S.stack.filter(k=>k==='R:50').length,1);
  assert.deepEqual(original,['L:8','R:50','R:2','G:99','L:7','R:50','I:0','R:3','L:9'],'do not modify the old stack array in place');
  assert.deepEqual(metadata(c),before);
});

test('missing or null stack is accepted and new key exists exactly once before rendering',()=>{
  for(const empty of [undefined,null,[]]){
    const c=fixture();c.S.stack=empty;c.registerOutput();
    assert.deepEqual(c.events[0].stack,['R:50']);
    assert.equal(c.S.stack.filter(k=>k==='R:50').length,1);
    for(const k of baseStack)assert.ok(c.S.stack.includes(k),'normal stack synchronization still restores '+k);
  }
});

test('only previous outputs of the same source are disabled; their keys and groups are retained',()=>{
  const c=fixture({previousVisible:true}),before=metadata(c),previous=c.S.rasters[1],oldOverlay=previous.overlay;
  assert.ok(c.map.hasLayer(oldOverlay));c.registerOutput();
  assert.equal(previous.visible,false,'keep the existing intentional replacement policy');assert.equal(c.map.hasLayer(oldOverlay),false);
  assert.deepEqual(plain(c.S.stack),['R:50',...baseStack]);assert.equal(previous.groupId,10);
  before.rasters.find(r=>r.id===3).visible=false;assert.deepEqual(metadata(c),before,'unrelated visibility and all group membership must survive');
});

test('ordinary renders preserve a user-moved raster order instead of promoting existing results',()=>{
  for(const mode of ['raster','tin']){
    const c=fixture({mode}),r=c.registerOutput();
    c.S.stack=['L:8','R:2','G:99','R:50','L:7','I:0','R:3','L:9'];
    const chosen=c.S.stack.slice(),before=metadata(c);c.renderRaster(r);c.renderRaster(r);c.zApply();
    assert.deepEqual(plain(c.S.stack),chosen);assert.deepEqual(metadata(c),before);
    assert.ok(c.panes.get('alagis_R50').style.zIndex<c.panes.get('alagis_R2').style.zIndex,'explicit user placement remains authoritative on redraw');
  }
});

test('project reopening restores saved placement and repeated rendering does not reorder it',()=>{
  for(const mode of ['raster','tin']){
    const c=fixture({mode});c.registerOutput();
    const saved={layers:c.S.layers.map(l=>({id:l.id})),stack:['L:8','R:2','G:99','L:7','I:0','R:50','R:3','L:9']},snapshot=plain(saved),before=metadata(c);
    c.S.stack=['R:50',...baseStack];c.restoreStack(saved);
    assert.deepEqual(plain(c.S.stack),saved.stack,'saved order must not be treated as a new generation');
    for(const r of c.S.rasters)c.renderRaster(r);
    assert.deepEqual(plain(c.S.stack),saved.stack);assert.deepEqual(metadata(c),before);assert.deepEqual(saved,snapshot);
  }
});

console.log(`TIN map ordering: ${checks} tests passed.`);
