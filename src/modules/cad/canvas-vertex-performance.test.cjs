const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../core/parts/27-vector-editor.js'),'utf8');
function setup(geom,gtype='line',queued=false){
 const listeners={},winListeners={},stats={created:0,clears:0,projections:0,snap:0,snapshots:0,draws:0};
 const container={addEventListener:(name,fn)=>(listeners[name]??=[]).push(fn),getBoundingClientRect:()=>({left:0,top:0})};
 const group=()=>({layers:[],addTo(){return this},clearLayers(){stats.clears++;this.layers=[]},addLayer(p){this.layers.push(p)}});
 const glyph=coords=>{stats.created++;return {coords,moves:0,addTo(g){g.addLayer(this);return this},setLatLng(p){this.coords=p;this.moves++;return this},setLatLngs(p){this.coords=p;this.moves++;return this}}};
 const ctx={console,Set,Date,S:{tool:'select',touch:false,workCRS:'EPSG:31982'},ED:{on:true,sel:null,ring:0,vi:-1,drag:null,pend:null,rend:null,lay:null,mids:[],pts:[]},map:{on(){},getContainer:()=>container,dragging:{disable(){}},latLngToContainerPoint:p=>({x:p[1],y:p[0]}),containerPointToLatLng:p=>({lng:p[0],lat:p[1]})},L2:{canvas:()=>({on(){}}),layerGroup:group,circleMarker:glyph,polyline:glyph,latLng:(lat,lng)=>({lat,lng})},toWGS:(crs,x,y)=>{stats.projections++;return [x,y]},fromWGS:(crs,x,y)=>[x,y],collabCanEditLayer:()=>true,GeoMineVertexHandles:{legacyActive:()=>false,dragFrame:apply=>{let pending=null;return {push(value){if(queued)pending=value;else apply(value)},flush(){if(pending){const value=pending;pending=null;apply(value)}},cancel(){pending=null}}}},edPainelSync(){},edSnapshot(){stats.snapshots++},drawVertexFeature(){stats.draws++},edPickAt(){return null},mapaPanPadrao(){},finishVertexRender(){},refreshUI(){},edEhDrenagem:()=>false};
 ctx.window=ctx;ctx.addEventListener=(name,fn)=>(winListeners[name]??=[]).push(fn);
 ctx.GeoMineVertexGuides={begin(){},end(){},resolve(ll){stats.snap++;return {latlng:ll}}};ctx.GeoMineOrtho={resolve:ll=>({latlng:ll})};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function edRings('),source.indexOf('function edSnapshot(')),ctx);vm.runInContext(source.slice(source.indexOf('function edRedraw('),source.indexOf('/* ---------- comandos ---------- */')),ctx);
 const f={geom,zg:geom.map(p=>p[2]),props:{name:'unchanged'}},L={gtype,crs:'EPSG:31982',features:[f]};ctx.ED.sel={L,f,idx:0};ctx.edRedraw();ctx.edBindPointer();
 const fire=(name,x,y,extras={})=>{const ev={clientX:x,clientY:y,buttons:1,button:0,pointerType:'mouse',preventDefault(){},stopPropagation(){},...extras};for(const fn of listeners[name]||[])fn(ev)};
 return {ctx,stats,L,f,fire};
}
test('canvas drag reuses every path on a 2000-vertex line and updates only adjacent handles',()=>{
 const geom=Array.from({length:2000},(_,i)=>[i*30,100,20+i]),{ctx,stats,L,f,fire}=setup(geom);
 fire('pointerdown',30000,100);assert(ctx.ED.drag);const vertex=ctx.ED._glyphs.points[0][1000],neighbor=ctx.ED._glyphs.points[0][900],mids=ctx.ED._glyphs.mids[0],created=stats.created,clears=stats.clears,beforeZ=JSON.stringify(f.zg),beforeGeom=f.geom;
 stats.projections=0;
 for(let i=1;i<=80;i++)fire('pointermove',30000+i,100+i);
 assert.equal(stats.created,created);assert.equal(stats.clears,clears);assert.equal(stats.projections,80*3);assert.equal(vertex.marker.moves,80);assert.equal(neighbor.marker.moves,0);assert.equal(mids[999].marker.moves,80);assert.equal(mids[1000].marker.moves,80);assert.equal(mids[998].marker.moves,0);assert.equal(stats.snap,80);assert.equal(stats.snapshots,1);assert.equal(f.geom,beforeGeom);assert.equal(JSON.stringify(f.zg),beforeZ);assert.equal(f.geom[1000][2],1020);assert.equal(stats.draws,80);assert.deepEqual(f.geom[1000],[30080,180,1020]);
 fire('pointerup',30080,180);assert.equal(ctx.ED.drag,null);
});
test('closed canvas rings keep their endpoint pair and elevations when dragged',()=>{
 for(const gtype of ['line','polygon'])for(const vi of [0,4]){
  const geom=[[0,0,11],[100,0,12],[100,100,13],[0,100,14],[0,0,11]],{ctx,f,fire}=setup(geom,gtype);
  // The duplicate is visually overlapping. Select its exact cached handle
  // directly to cover either stored endpoint while using the real move handler.
  ctx.ED.ring=0;ctx.ED.vi=vi;ctx.ED.drag={ri:0,vi,moveu:false,linked:ctx.edLinkedVertex(ctx.ED.sel.L,geom,vi),origin:{lat:0,lng:0}};
  fire('pointermove',15,20);assert.deepEqual(f.geom[0],[15,20,11]);assert.deepEqual(f.geom[4],[15,20,11]);assert.deepEqual(f.zg,[11,12,13,14,11]);assert.equal(ctx.ED._glyphs.points[0][0].marker.moves,1);assert.equal(ctx.ED._glyphs.points[0][4].marker.moves,1);
 }
});
test('glyph ownership cannot update a different feature',()=>{
 const {ctx,L,f}=setup([[0,0,1],[20,0,2],[40,0,3]]);assert.equal(ctx.edUpdateDragGlyphs(L,{...f},0,[1]),false);assert.equal(ctx.edUpdateDragGlyphs({...L},f,0,[1]),false);
});

test('pointer release flushes only the latest queued coordinate and stale selections cannot receive it',()=>{
 const initial=[[0,0,1],[100,0,2],[200,0,3]];
 const {ctx,f,stats,fire}=setup(initial.map(p=>p.slice()),'line',true);
 fire('pointerdown',100,0);for(let i=1;i<=20;i++)fire('pointermove',100+i,20+i);
 assert.deepEqual(f.geom[1],[100,0,2]);assert.equal(stats.snapshots,0);
 fire('pointerup',120,40);assert.deepEqual(f.geom[1],[120,40,2]);assert.equal(stats.snapshots,1);assert.equal(stats.snap,1);assert.equal(ctx.ED.drag,null);
 const stale=setup(initial.map(p=>p.slice()),'line',true);stale.fire('pointerdown',100,0);stale.fire('pointermove',130,35);
 stale.ctx.ED.sel={...stale.ctx.ED.sel};stale.fire('pointerup',130,35);assert.deepEqual(stale.f.geom,initial);assert.equal(stale.stats.snapshots,0);
 const revoked=setup(initial.map(p=>p.slice()),'line',true);revoked.fire('pointerdown',100,0);revoked.fire('pointermove',130,35);
 revoked.ctx.collabCanEditLayer=()=>false;revoked.fire('pointerup',130,35);assert.deepEqual(revoked.f.geom,initial);assert.equal(revoked.stats.snapshots,0);
});
