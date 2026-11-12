'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=fs.readFileSync(__dirname+'/../../core/parts/05-layer-model-symbology.js','utf8'),layout=fs.readFileSync(__dirname+'/../../core/parts/17-layout-printing.js','utf8');
const between=(source,a,b)=>{const i=source.indexOf(a),j=source.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return source.slice(i,j);};
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){
 const groups=new Set(),made=[];
 const vector=(kind,coordinates,options)=>{const layer={kind,coordinates,options,on(){return this;}};made.push(layer);return layer;};
 const leaflet={polyline:(p,o)=>vector('line',p,o),polygon:(p,o)=>vector('polygon',p,o),canvas:options=>({options}),
  featureGroup:layers=>({layers,on(){return this;},addTo(){groups.add(this);return this;},addLayer(layer){this.layers.push(layer);return this;}})};
 const c={window:{},S:{workCRS:'EPSG:31982',_view:'map',_loT:{mmPerM:1}},L:leaflet,
  map:{removeLayer:layer=>groups.delete(layer)},document:{getElementById:()=>null},
  featureVisible:(_,f)=>!f.hidden,featureStyle:layer=>layer.style||{color:'#112233',stroke:'#223344',weight:2,fill:0,hatch:'none'},
  labelAtivo:()=>false,attachFactories(){},autoAreaSyncLayer(){},zApply(){},applyHatch(){},setTimeout:fn=>fn(),toast(){},
  panelDaCamada:id=>'pane-'+id,polygonFillVisible:()=>false,
  toWGS:(_crs,x,y)=>[x,y],reproj:(_from,_to,x,y)=>[x,y],
  featToLatLngs:(_,f)=>f.geom.map(p=>[p[1],p[0]]),
  esc:value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),
  sx:x=>2*x,sy:y=>100-2*y,crs:'EPSG:31982',mapSym:2,layoutHatch:()=>null,escalaDash:()=>'',
  candidates:{features:new Map()}};
 vm.createContext(c);
 vm.runInContext(between(core,'function cadHatchRenderStyle(','/* Recorte VISUAL'),c);
 vm.runInContext(core.slice(core.indexOf('function drawLayer(L,options)')),c);
 vm.runInContext(between(layout,'function layoutRectIntersects(','function layoutPlotCandidates('),c);
 vm.runInContext(between(layout,'  function svgDaCamada(','  // Rótulos pertencem'),c);
 return {c,made,groups};
}
const hatch=()=>({segments:[[[1,2,8],[3,4,9]]],color:'#fa3456',weight:3,opacity:.4});
const feature=()=>({geom:[[0,0,5],[10,0,6],[10,10,7],[0,0,5]],cadHatches:[hatch()]});

test('real drawLayer renders one linked hatch for polygons and closed polylines using their pane and separate style',()=>{
 for(const gtype of ['polygon','line']){
  const {c}=fixture(),f=feature(),before=JSON.stringify(f),geom=f.geom,segments=f.cadHatches[0].segments,
   layer={id:7,name:'Boundary',gtype,crs:'EPSG:31982',visible:true,features:[f]};
  c.drawLayer(layer);const strokes=layer.llayer.layers.filter(v=>v.options.interactive===false);
  assert.equal(strokes.length,1);const h=strokes[0];
  assert.equal(h.kind,'line');assert.deepEqual(plain(h.coordinates),[[[2,1],[4,3]]]);
  assert.equal(h.options.pane,'pane-L7');assert.equal(h.options.color,'#fa3456');assert.equal(h.options.weight,3);assert.equal(h.options.opacity,.4);
  assert.equal(h.options.fill,false);assert.equal(layer.llayer.layers[0].options.color,'#223344','base boundary style is retained');
  assert.equal(f.geom,geom);assert.equal(f.cadHatches[0].segments,segments);assert.equal(JSON.stringify(f),before,'XYZ and hatch geometry remain untouched');
 }
});

test('explicit CAD strokes survive the real 4000-feature Canvas threshold without duplicating the base geometry',()=>{
 for(const gtype of ['polygon','line']){
  const {c}=fixture(),f=feature(),layer={id:8,name:'Large boundary layer',gtype,crs:'EPSG:31982',visible:true,
   features:[f,...Array.from({length:4000},()=>({geom:[[0,0],[1,1],[0,0]]}))]};
  c.drawLayer(layer);assert.equal(layer.llayer.layers.length,4002);
  const h=layer.llayer.layers.filter(v=>v.options.interactive===false);assert.equal(h.length,1);
  assert.equal(h[0].options.renderer,layer._cnvR);assert.equal(h[0].options.pane,layer._cnvR.options.pane);
 }
});

test('filtered features and hidden groups retain normal visibility behavior',()=>{
 const {c,groups}=fixture(),hiddenFeature=feature();hiddenFeature.hidden=true;
 const layer={id:9,name:'Filtered',gtype:'polygon',crs:'EPSG:31982',visible:false,features:[hiddenFeature,feature()]};
 c.drawLayer(layer);assert.equal(layer.llayer.layers.length,2,'only the visible feature and its hatch are rendered');
 assert.equal(groups.has(layer.llayer),false,'hidden owning layer is removed from the map with all its strokes');
 layer.visible=true;c.drawLayer(layer);assert.equal(groups.has(layer.llayer),true);
 assert.equal(layer.llayer.layers.filter(v=>v.options.interactive===false).length,1);
});

test('malformed points and failed projections split segments without bridging gaps or mutating XYZ sources',()=>{
 const {c}=fixture(),h={segments:[[[0,0,5],[1,1,6],null,[2,2,7],[3,3,8],[4,4,9],[5,5,10]],null,[[NaN,2],[8,8]]]},before=JSON.stringify(h);
 const paths=c.cadHatchProjectSegments(h,(x,y)=>x===3?null:[x+10,y+20]);
 assert.deepEqual(plain(paths),[[[10,20],[11,21]],[[14,24],[15,25]]]);assert.equal(JSON.stringify(h),before);
});

test('zero stroke/opacity remains invisible; linked styles are independent from a transparent boundary',()=>{
 const {c}=fixture(),layer={gtype:'line',crs:'EPSG:31982'},f=feature();
 assert.equal(c.cadHatchMapLayers(layer,f,{weight:0,fill:0,opacity:1},{}).length,1);
 for(const h of [{weight:0,opacity:1},{weight:1,opacity:0}]){
  f.cadHatches=[{...h,segments:hatch().segments}];assert.equal(c.cadHatchMapLayers(layer,f,{},{}).length,0);
  assert.equal(c.layoutCadHatchSVG(layer,f,{},(x,y)=>[x,y]),'');
 }
 f.cadHatches=[hatch()];assert.equal(c.cadHatchMapLayers(layer,f,{opacity:0},{}).length,0);
});

test('the actual Layout layer compositor emits linked CAD strokes once for polygon and line sources',()=>{
 for(const gtype of ['polygon','line']){
  const {c}=fixture(),f=feature(),layer={id:12,gtype,crs:'EPSG:31982',features:[f],style:{color:'#102030',stroke:'#203040',weight:2,hatch:'none',fill:0}},before=JSON.stringify(f);
  c.candidates.features.set(layer.id,new Set([f]));const svg=c.svgDaCamada(layer,false);
  assert.equal((svg.match(/class="gm-cad-hatch"/g)||[]).length,1);
  assert.match(svg,/class="gm-cad-hatch" d="M2\.00 96\.00 L6\.00 92\.00"/);
  const linked=svg.match(/class="gm-cad-hatch"[^>]*stroke="#fa3456" stroke-width="([^"]+)" stroke-opacity="0.4"/);
  assert(linked);assert(Math.abs(Number(linked[1])-1.8)<1e-10,'CAD stroke uses the normal Layout pixel-to-mm conversion');
  assert(svg.includes('stroke="#203040"'),'base outline has its own unchanged stroke');assert.equal(JSON.stringify(f),before);
  c.candidates.features.set(layer.id,new Set());assert.equal(c.svgDaCamada(layer,false),'','excluded features cannot leak hatch strokes into the output');
 }
});

test('Layout candidates include hatch-only transparent boundaries even when their outline lies outside the sheet',()=>{
 for(const gtype of ['polygon','line']){
  const {c}=fixture(),f={geom:[[-20,-20],[20,-20],[20,20],[-20,20],[-20,-20]],cadHatches:[{...hatch(),segments:[[[-10,0],[10,0]]]}]},
   layer={id:13,gtype,crs:'EPSG:31982',style:{weight:0,fill:0,hatch:'none',opacity:1}};
  assert.equal(c.layoutFeaturePlotted(layer,f,[-1,-1,1,1]),true);
  f.cadHatches[0].opacity=0;assert.equal(c.layoutFeaturePlotted(layer,f,[-1,-1,1,1]),false);
  f.cadHatches[0].opacity=1;f.hidden=true;assert.equal(c.layoutFeaturePlotted(layer,f,[-1,-1,1,1]),false);
 }
});
