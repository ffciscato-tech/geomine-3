import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Actual section generation and actual grid sampling, with only DOM/map/I/O
// replaced. In particular, neither sampleRaster nor generate is stubbed.
const read=name=>fs.readFileSync(new URL('../src/modules/geology/'+name,import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const WORK='EPSG:31982',offsets={ [WORK]:[0,0], TERRAIN_SOURCE:[1000,2000], CONTACT_SOURCE:[500,600] };
let passed=0;
function test(name,run){run();passed++;console.log('PASS '+name);}
function close(actual,expected,message){assert.ok(Math.abs(actual-expected)<1e-5,`${message}: ${actual} != ${expected}`);}
function fixture(){
  const nodes=new Map(),texts=[],strokes=[],fills=[],notices=[],transforms=[];
  let pen=[];
  const ctx={beginPath(){pen=[];},moveTo(x,y){pen.push(['M',x,y]);},lineTo(x,y){pen.push(['L',x,y]);},
    closePath(){},fillRect(){},fill(){fills.push({color:this.fillStyle,pen:plain(pen)});},arc(){},rect(){},clip(){},
    save(){},restore(){},translate(){},strokeRect(){},setLineDash(dash){this.dash=[...dash];},
    stroke(){strokes.push({color:this.strokeStyle,width:this.lineWidth,dash:this.dash,pen:plain(pen)});},
    fillText(text){texts.push(String(text));},strokeText(){}};
  nodes.set('gsecCanvas',{style:{},getContext:()=>ctx});nodes.set('gsecOut',{innerHTML:''});
  const c={window:{},S:{layers:[],rasters:[],groups:[],workCRS:WORK,prof:{untouched:true}},console,
    document:{readyState:'loading',addEventListener(){},getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[]},
    setTimeout:()=>0,clearTimeout(){},URL,Blob,toast:message=>notices.push(message),refreshUI(){},drawLayer(){},
    fromWGS:(_crs,x,y)=>[x,y],toWGS:(_crs,x,y)=>[x,y],
    reproj(from,to,x,y){
      assert.ok(offsets[from]&&offsets[to],`unexpected CRS conversion ${from} -> ${to}`);
      transforms.push({from,to,x,y});return [x-offsets[from][0]+offsets[to][0],y-offsets[from][1]+offsets[to][1]];
    },
    addLayer(layer){layer.id=1000+c.S.layers.length;layer.sym={};c.S.layers.push(layer);return layer;}};
  vm.createContext(c);
  // Build order loads the section first; its API must resolve the sampler at
  // call time rather than permanently capturing a missing dependency.
  vm.runInContext(read('geological-sections.js'),c);
  vm.runInContext(read('section-raster-profiles.js'),c);
  const api=c.window.GeoMineGeology;
  function loadSaved(id){
    // Bind the production saved-section change handler without creating form
    // inputs that would overwrite programmatic configuration in readForm().
    if(!nodes.has('secGeoSection')){
      nodes.set('sideGeo',{insertAdjacentHTML(){
        nodes.set('secGeoSection',{querySelector:()=>null});
        nodes.set('gsecSaved',{innerHTML:'',value:'',listeners:{},addEventListener(event,fn){this.listeners[event]=fn;}});
      }});
      api.refresh();
    }
    nodes.get('gsecSaved').listeners.change({target:{value:id}});
  }
  return {c,api,nodes,texts,strokes,fills,notices,transforms,loadSaved,
    clearDrawing(){texts.length=0;strokes.length=0;fills.length=0;}};
}
function grid({id,name='Mesmo nome',crs=WORK,nc=14,nr=4,cs=1,csy=2,value,missingColumn=null,nodata=-9999}){
  const [xll,yll]=offsets[crs],z=new Float32Array(nc*nr);
  for(let row=0;row<nr;row++)for(let col=0;col<nc;col++)z[row*nc+col]=col===missingColumn?nodata:value(row,col);
  return {id,name,d:{nc,nr,cs,csy,xll,yll,crs,z,noData:nodata}};
}
function setup(f,{gaps=false}={}){
  f.c.S.rasters=[
    grid({id:'terrain',name:'Terreno',crs:'TERRAIN_SOURCE',value:(r,c)=>100+r*10+c,missingColumn:gaps?6:null}),
    grid({id:'water',value:(_r,c)=>20+2*c,missingColumn:gaps?3:null}),
    grid({id:'contact',crs:'CONTACT_SOURCE',nc:7,nr:8,cs:2,csy:1,value:(r,c)=>40+r*10+c,missingColumn:gaps?4:null}),
    grid({id:'unselected',name:'Mesmo nome',value:()=>999})
  ];
  f.c.S.layers=[{id:7,name:'Unidade de campo',gtype:'polygon',crs:WORK,color:'#ddccaa',
    _geology:{kind:'litologia'},fields:[{name:'LITOLOGIA',type:'C',length:80}],
    features:[{geom:[[[0,0],[14,0],[14,8],[0,8],[0,0]]],multi:true,props:{LITOLOGIA:'Calcário'}}]}];
  f.c.S.geology={sections:[],section:{name:'Rasters A–B',line:[[1.5,5],[11.5,5]],lineWgs:[],rasterId:'terrain',
    corridor:20,step:1,layerIds:['7'],roles:{},useField:false,geologyBase:0,terrainChoiceSet:true,
    rasterProfiles:[{id:'water',role:'water',mode:'depth'},{id:'contact',role:'contact',mode:'elevation'}],
    lineStyles:{'raster:terrain':{color:'#abc123',width:3,dash:'solid',visible:true},
      'raster:water':{name:'Água subterrânea',color:'#1234ab',width:4,dash:'dashdot',visible:true},
      'raster:contact':{name:'Contato interpretado',color:'#aa33bb',width:2,dash:'dot',visible:true}}}};
}
const profile=(result,id)=>result.rasterProfiles.find(item=>item.id===id);
const dataOf=result=>plain({dist:result.profile.dist,pts:result.profile.pts,terrain:result.profile.series[0].z,
  profiles:result.rasterProfiles,runs:result.runs,contacts:result.contacts,holes:result.holes});

test('generate samples actual rectangular grids in distinct CRSs and distinguishes duplicate names',()=>{
  const f=fixture();setup(f);const input=plain(f.c.S.rasters),r=f.api.generate();assert.ok(r,f.notices.join(' · '));
  assert.equal(r.rasterId,'terrain');assert.equal(r.hasTerrain,true);assert.equal(r.profile.series.length,1);
  assert.deepEqual(plain(r.profile.dist),Array.from({length:11},(_,i)=>i));
  assert.deepEqual(plain(r.rasterProfiles.map(p=>p.id)),['water','contact']);
  assert.equal(profile(r,'water').sourceName,profile(r,'contact').sourceName,'same names do not select same source');
  r.profile.pts.forEach((point,i)=>{
    close(point[0],1.5+i,'work X');close(point[1],5,'work Y');
    // Terrain row=1, col=1+i. Contact row=2.5, col=.25+i/2.
    close(r.profile.series[0].z[i],111+i,'rectangular primary elevation');
    close(profile(r,'contact').z[i],65.25+i/2,'independent secondary CRS and rectangular pixels');
    close(profile(r,'water').z[i],89-i,'depth subtracted at the identical station');
  });
  assert.ok(f.transforms.some(p=>p.from===WORK&&p.to==='TERRAIN_SOURCE'));
  assert.ok(f.transforms.some(p=>p.from===WORK&&p.to==='CONTACT_SOURCE'));
  assert.ok(r.runs.some(run=>run.label==='Calcário'),'primary still anchors geological domains');
  assert.deepEqual(plain(f.c.S.rasters),input,'sampling does not alter the source grids');
  assert.deepEqual(f.c.S.prof,{untouched:true});close(r.renderGeometry.ve,1,'true scale');
});

test('real NoData gaps in terrain or depth interrupt profiles and Canvas paths',()=>{
  const f=fixture();setup(f,{gaps:true});const r=f.api.generate();assert.ok(r);
  const water=profile(r,'water'),contact=profile(r,'contact');
  assert.ok(Number.isNaN(r.profile.series[0].z[5]),'primary NoData retained');
  assert.ok(Number.isNaN(water.z[5]),'depth cannot borrow neighboring terrain across its gap');
  assert.ok(Number.isNaN(water.z[2]),'depth source NoData retained');
  assert.ok(Number.isFinite(water.z[1])&&Number.isFinite(water.z[3]));
  assert.ok(Number.isFinite(contact.z[5]),'absolute overlay remains independent of primary gap');
  assert.ok(contact.z.some(Number.isNaN),'secondary declared NoData excluded before interpolation');
  const path=f.strokes.filter(s=>s.color==='#1234ab'&&s.pen.length>2).at(-1);
  assert.ok(path,'water line was rendered');
  assert.ok(path.pen.filter(p=>p[0]==='M').length>=3,'each valid island begins a separate path');
  assert.match(water.warning,/lacunas/);
});

test('hiding primary terrain changes only its stroke, not domain geometry or depth elevations',()=>{
  const f=fixture();setup(f);const first=f.api.generate(),expected=dataOf(first);assert.ok(first);
  assert.ok(f.strokes.some(s=>s.color==='#abc123'&&s.pen.length>2));
  f.c.S.geology.section.lineStyles['raster:terrain'].visible=false;f.clearDrawing();
  const hidden=f.api.generate();assert.ok(hidden);assert.deepEqual(dataOf(hidden),expected);
  assert.ok(!f.strokes.some(s=>s.color==='#abc123'),'hidden terrain has no trace or legend swatch');
  assert.ok(f.fills.some(fill=>fill.color==='#ddccaa'),'mapped-domain fill remains present');
  assert.equal(hidden.hasTerrain,true);assert.equal(hidden.lineStyles['raster:terrain'].visible,false);
});

test('explicit no-MDT can generate absolute overlays without inventing terrain or boreholes',()=>{
  const f=fixture();setup(f);Object.assign(f.c.S.geology.section,{rasterId:null,layerIds:[],geologyBase:null,
    rasterProfiles:[{id:'contact',role:'contact',mode:'elevation'}],terrainChoiceSet:true});
  const r=f.api.generate();assert.ok(r);assert.equal(r.rasterId,null);assert.equal(r.hasTerrain,false);
  assert.ok(r.profile.series[0].z.every(Number.isNaN));assert.equal(r.runs.length,0);assert.equal(r.holes.length,0);
  assert.ok(profile(r,'contact').z.every(Number.isFinite));
  assert.ok(f.texts.some(text=>/Sem terreno · rasters adicionais/.test(text)));
  assert.ok(!f.texts.some(text=>/sondagens com cotas próprias/.test(text)));
});

test('missing selected sources stay missing, and depth cannot replace absent primary terrain',()=>{
  const f=fixture();setup(f);f.c.S.geology.section.rasterProfiles.push({id:'missing',role:'surface',mode:'elevation'});
  f.c.S.rasters=f.c.S.rasters.filter(r=>r.id!=='terrain');const r=f.api.generate();assert.ok(r);
  assert.equal(r.hasTerrain,false);assert.equal(r.rasterId,null);assert.equal(f.c.S.geology.section.rasterId,'terrain');
  assert.ok(r.profile.series[0].z.every(Number.isNaN));assert.ok(profile(r,'water').z.every(Number.isNaN));
  assert.ok(profile(r,'missing').z.every(Number.isNaN));assert.match(profile(r,'missing').warning,/não está disponível/);
  assert.ok(profile(r,'contact').z.every(Number.isFinite));assert.ok(!profile(r,'unselected'));
  assert.match(r.terrainWarning,/indisponível/);
  assert.ok(f.texts.some(text=>text.includes('missing')&&text.includes('sem dados')),'PNG legend diagnoses absent source');
});

test('axis attributes, saved-section load and snapshot restore round-trip IDs, modes and independent styles',()=>{
  const f=fixture();setup(f,{gaps:true});const expected=f.api.generate();assert.ok(expected);
  const axis=f.api.saveCurrent();assert.ok(axis);const id=f.c.S.geology.section.id,props=axis.features[0].props;
  assert.deepEqual(JSON.parse(props.RAST_PERF),plain(f.c.S.geology.section.rasterProfiles));
  assert.deepEqual(JSON.parse(props.LIN_EST),plain(f.c.S.geology.section.lineStyles));
  assert.ok(props.LIN_EST.length>254,'native project does not truncate style JSON to DBF field length');
  const snapshot=plain(f.api.sectionSnapshot()),layers=plain(f.c.S.layers),savedStyles=props.LIN_EST;

  const restored=fixture();setup(restored,{gaps:true});restored.c.S.layers=plain(layers);
  assert.equal(restored.api.sectionRestore(snapshot),true);const fromSnapshot=restored.api.generate();assert.ok(fromSnapshot);
  assert.deepEqual(dataOf(fromSnapshot),dataOf(expected));
  assert.deepEqual(plain(fromSnapshot.lineStyles),JSON.parse(savedStyles));

  const reopened=fixture();setup(reopened,{gaps:true});reopened.c.S.layers=plain(layers);
  reopened.c.S.geology.section.rasterProfiles=[];reopened.c.S.geology.section.lineStyles={};
  reopened.loadSaved(id);const fromAxis=reopened.api.generate();assert.ok(fromAxis);
  assert.deepEqual(dataOf(fromAxis),dataOf(expected),'loading saved axis reads persisted configuration, not prior active state');
  assert.deepEqual(plain(fromAxis.lineStyles),JSON.parse(savedStyles));
  reopened.c.S.geology.section.lineStyles['raster:water'].color='#ffffff';
  assert.equal(reopened.c.S.layers.find(layer=>layer.id===axis.id).features[0].props.LIN_EST,savedStyles,
    'unsaved style edits do not mutate serialized axis metadata');
});

console.log(`PASS ${passed} geological multi-raster integration tests.`);
