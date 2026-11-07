import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8'),
  source=read('src/modules/geology/geological-sections.js'),core=read('src/core/parts/25-geoprocessing-tin.js'),plain=x=>JSON.parse(JSON.stringify(x));
let count=0;
async function check(name,fn){await fn();count++;console.log('OK · '+name);}
function fixture(){
  const nodes=new Map(),texts=[],fills=[],strokes=[],notices=[];let pen=[];
  const ctx={beginPath(){pen=[];},moveTo(x,y){pen.push([x,y]);},lineTo(x,y){pen.push([x,y]);},closePath(){},fillRect(){},
    fill(){fills.push({color:this.fillStyle,points:pen.slice()});},stroke(){strokes.push({color:this.strokeStyle,points:pen.slice()});},
    arc(){},setLineDash(){},save(){},restore(){},translate(){},strokeRect(){},fillText(s){texts.push(String(s));},strokeText(){}};
  const canvas={style:{},getContext:()=>ctx};
  function node(id){const e={id,value:'',checked:false,style:{},innerHTML:'',listeners:{},
    addEventListener(k,fn){this.listeners[k]=fn;},querySelector:()=>null,scrollIntoView(){},classList:{add(){},remove(){},toggle(){}},
    get options(){return [...this.innerHTML.matchAll(/<option value="([^"]*)"/g)].map(m=>({value:m[1]}));}};nodes.set(id,e);return e;}
  node('gsecCanvas');nodes.set('gsecCanvas',canvas);node('gsecOut');
  const c={window:{},S:{layers:[],rasters:[],workCRS:'EPSG:31982'},console,setTimeout:()=>0,clearTimeout(){},Blob,URL,
    document:{readyState:'loading',addEventListener(){},getElementById:id=>nodes.get(id)||null,
      querySelectorAll:selector=>{
        if(selector!=='#gsecProjects input[data-project]')return [];
        return [...(nodes.get('gsecProjects')?.innerHTML||'').matchAll(/<input[^>]*data-project="([^"]+)"[^>]*>/g)]
          .map(m=>({dataset:{project:m[1]},checked:/\bchecked\b/.test(m[0])}));
      }},
    fromWGS:(_crs,x,y)=>[x,y],toWGS:(_crs,x,y)=>[x,y],reproj:(_a,_b,x,y)=>[x,y],toast:s=>notices.push(s),
    refreshUI(){},drawLayer(){},addLayer:L=>{L.id=100+c.S.layers.length;c.S.layers.push(L);return L;},
    respira:async()=>{},showLoad(){}};
  vm.createContext(c);vm.runInContext(source,c);const api=c.window.GeoMineGeology,t=api.__sectionTest;
  c.pointInRing=(x,y,ring)=>t.pointInRings([x,y],[ring]);
  vm.runInContext(core.slice(core.indexOf('function tinCavaArea('),core.indexOf('/* ---------- marching squares:')),c);
  vm.runInContext(core.slice(core.indexOf('function tinPontoNoAnel('),core.indexOf('function tinAplicaNovoTri(')),c);
  function open(){
    node('sideGeo').insertAdjacentHTML=(_where,html)=>{
      for(const m of html.matchAll(/<[^>]*id="([^"]+)"[^>]*>/g)){
        const e=node(m[1]);e.value=m[0].match(/\bvalue="([^"]*)"/)?.[1]||'';e.checked=/\bchecked\b/.test(m[0]);
      }
      nodes.set('gsecCanvas',canvas);
    };api.openSection();api.refresh();
  }
  return {c,api,t,nodes,texts,fills,strokes,notices,canvas,open};
}
const square=(lo,hi)=>[[lo,lo],[hi,lo],[hi,hi],[lo,hi],[lo,lo]];
const design=(id=1)=>({id,name:'Cava '+id,gtype:'line',crs:'EPSG:31982',features:[],cavaDesign:{rings:[
  {ring:square(0,100),z:100},{ring:square(10,90),z:80},{ring:square(20,80),z:80},{ring:square(30,70),z:60}],rampLines:[]}});
const terrain=(z=130)=>({id:'terrain',name:'Terreno',d:{nc:140,nr:140,cs:1,xll:-20,yll:-20,z:new Float32Array(140*140).fill(z)}});
const line=[[-10,50],[110,50]],at=(p,s)=>p.segments.flat().find(p=>Math.abs(p.station-s)<1e-5);
function setup(f,layers=[],rasters=[terrain()],extra={}){
  f.c.S.layers=layers;f.c.S.rasters=rasters;
  f.c.S.geology={section:{name:'Seção de cava',line:plain(line),lineWgs:[],rasterId:'terrain',corridor:20,ve:1,step:7,
    layerIds:[],roles:{},useField:false,fieldRadius:100,fieldDepth:20,projectSources:[],...extra},sections:[]};
}
await check('fontes distinguem cava paramétrica, XYZ/zg, superfícies vinculadas e terreno',()=>{
  const f=fixture(),xyz={id:2,name:'Importada',gtype:'line',features:[{geom:[[0,0,50],[1,1,55]]}]},
    flat={id:3,name:'Limite 2D',gtype:'line',features:[{geom:[[0,0],[1,1]]}]},surface={...terrain(60),id:'pit',name:'Superfície final',_tinSourceId:1};
  setup(f,[design(),xyz,flat],[terrain(),surface]);
  assert.deepEqual(plain(f.t.projectSourceOptions().map(x=>[x.key,x.mode])),[['L:1','design'],['L:2','vector'],['R:pit','raster']]);
});
await check('Cava2 renomeada reconhece superfície por vínculo/metadados e orienta perfil contínuo',()=>{
  const f=fixture(),L={id:4,name:'Etapa final',gtype:'line',_cava2CutSnapshotOf:'modern-1',features:[{geom:[[10,0],[10,100]],zg:[70,90]}]};
  setup(f,[L]);let options=f.t.projectSourceOptions();assert.equal(options[0].mode,'vector');assert.match(options[0].description,/perfil linear.*cotas 3D/);
  const before=plain(L),p=f.t.projectProfiles(['L:4'],line,f.t.lineMetrics(line),7,terrain())[0];
  assert.deepEqual(plain(p.points),[{station:20,z:80}]);assert.equal(p.segments.length,0);assert.equal(p.connectedProfile,true);assert.match(p.warning,/ao menos duas cotas/);assert.deepEqual(plain(L),before);
  f.c.S.rasters.push({...terrain(75),id:'renamed',name:'Etapa 1',_tinSourceId:4});options=f.t.projectSourceOptions();
  assert.ok(options.some(x=>x.key==='R:renamed'));assert.match(options[0].description,/perfil linear/);assert.doesNotMatch(options[0].description,/gere a superfície/);
  for(const tag of ['_cava2DesignId','_cava2CutOf','_cava2CutSnapshotOf','_cava2CutFillOf','_cava2Kind']){
    const r={...terrain(75),id:tag,name:'Etapa 2',[tag]:tag==='_cava2Kind'?'cava':'modern-1'};f.c.S.rasters=[terrain(),r];
    assert.ok(f.t.projectSourceOptions().some(x=>x.key==='R:'+tag),'metadado '+tag+' sem depender do nome');
  }
  f.c.S.rasters=[{...terrain(),_cava2MdtId:'modern-1'}];assert.ok(!f.t.projectSourceOptions().some(x=>x.key==='R:terrain'),'MDT de trabalho não vira projeto por ser usado pela Cava2');
});
await check('perfil de cava preserva cristas/pés/bermas, fundo e NoData fora do domínio',async()=>{
  const f=fixture(),L=design();setup(f,[L]);const before=plain(L),met=f.t.lineMetrics(line),p=f.t.projectProfiles(['L:1'],line,met,7,f.c.S.rasters[0])[0];
  for(const [station,z] of [[10,100],[20,80],[30,80],[40,60],[80,60],[90,80],[100,80],[110,100]])assert.ok(Math.abs(at(p,station)?.z-z)<1e-8,station+' m');
  assert.ok(p.segments.flat().every(p=>p.station>=10-1e-6&&p.station<=110+1e-6));assert.deepEqual(plain(L),before);
  const native=await f.c.tinCavaToGrid(L,1,{unlimited:true});
  for(const point of p.segments.flat().filter(p=>Number.isInteger(p.station)&&p.station>10&&p.station<110)){
    const x=point.station-10,col=Math.round((x-native.xll)/native.cs-.5),row=Math.round(native.nr-.5-(50-native.yll)/native.cs);
    assert.ok(Math.abs(point.z-native.z[row*native.nc+col])<1e-5,'mesmo modelo nativo na estação '+point.station);
  }
});
await check('rampas usam as mesmas faces XYZ do modelo nativo, sem gerar grade inteira',()=>{
  const f=fixture(),L=design();L.cavaDesign.rampLines=[{geom:[[30,45],[70,45]],zg:[62,74]},{geom:[[30,55],[70,55]],zg:[62,74]}];setup(f,[L]);
  const p=f.t.projectProfiles(['L:1'],line,f.t.lineMetrics(line),5,terrain())[0];assert.equal(at(p,60).z,68);
  assert.equal(f.c.tinCavaRampZ(L.cavaDesign.rampLines,50,50),68);
});
await check('corte no MDT não mostra projeto acima do terreno e termina no encontro real',()=>{
  const f=fixture(),L=design();L.cavaDesign.cortar=true;L.cavaDesign.rasterId='terrain';setup(f,[L],[terrain(90)]);
  const p=f.t.projectProfiles(['L:1'],line,f.t.lineMetrics(line),7,f.c.S.rasters[0])[0],points=p.segments.flat();
  assert.ok(points.every(p=>p.z<=90+1e-6));assert.ok(Math.abs(points[0].station-15)<1e-5);assert.ok(Math.abs(points[0].z-90)<1e-5);
  L.cavaDesign.rasterId='missing';assert.match(f.t.projectProfiles(['L:1'],line,f.t.lineMetrics(line),7,terrain())[0].warning,/MDT de corte/);
});
await check('linhas disjuntas não viram superfície inventada; coincidências mantêm Z e lacunas',()=>{
  const f=fixture(),L={id:2,name:'Linhas XYZ genéricas',gtype:'line',crs:'EPSG:31982',features:[
    {geom:[[10,0],[10,100]],zg:[70,90]},{geom:[[90,0,60],[90,100,80]]},
    {geom:[[30,50],[40,50]],zg:[50,55]},{geom:[[60,50],[70,50]],zg:[65,70]},
    {geom:[[80,50],[85,50]],zg:[null,90]}]};setup(f,[L]);const before=plain(L),p=f.t.projectProfiles(['L:2'],line,f.t.lineMetrics(line),7,terrain())[0];
  assert.deepEqual(plain(p.points),[{station:20,z:80},{station:100,z:70}]);
  assert.deepEqual(plain(p.segments),[[{station:40,z:50},{station:50,z:55}],[{station:70,z:65},{station:80,z:70}]]);
  assert.deepEqual(plain(L),before);assert.match(p.method,/sem superfície/);
});
await check('reprojeção XY mantém cotas métricas e eixo dobrado usa progressivas reais',()=>{
  const f=fixture(),L={id:7,name:'Linha XYZ em CRS externo',gtype:'line',crs:'LOCAL',features:[{geom:[[1,0],[1,10]],zg:[75,85]}]};setup(f,[L]);
  f.c.reproj=(from,to,x,y)=>{assert.equal(from,'LOCAL');assert.equal(to,'EPSG:31982');return [x*10,y*10];};
  const bent=[[-10,20],[50,20],[50,80],[-10,80]],p=f.t.projectProfiles(['L:7'],bent,f.t.lineMetrics(bent),5,terrain())[0];
  assert.deepEqual(plain(p.points),[{station:20,z:77},{station:160,z:83}]);
  f.c.reproj=()=>{throw new Error('CRS inválido');};assert.equal(f.t.projectProfiles(['L:7'],bent,f.t.lineMetrics(bent),5,terrain())[0].points.length,0);
  f.c.S.workCRS='EPSG:4326';assert.equal(f.api.generate(),null);assert.match(f.notices.at(-1),/CRS.*metros/);
});
await check('raster preserva NoData/fora da extensão mesmo com passo maior que a lacuna',()=>{
  const f=fixture(),r={id:'pit',name:'Cava raster',_v3:{papel:'cava'},d:{nc:10,nr:3,cs:1,csy:2,xll:0,yll:0,z:new Float32Array(30).fill(50)}};
  for(let row=0;row<3;row++)r.d.z[row*10+5]=NaN;setup(f,[],[terrain(),r]);
  assert.ok(Number.isNaN(f.t.projectRasterSample(r,[-.1,3])));assert.ok(Number.isNaN(f.t.projectRasterSample(r,[5.5,3])));
  assert.equal(f.t.projectRasterSample(r,[2.5,3]),50);
  const axis=[[-1,3],[11,3]],p=f.t.projectProfiles(['R:pit'],axis,f.t.lineMetrics(axis),100,terrain())[0];
  assert.equal(p.segments.length,2);assert.ok(p.segments[0].at(-1).station<6);assert.ok(p.segments[1][0].station>7);
  assert.ok(p.segments.flat().every(p=>p.station>=1-1e-6&&p.station<=11+1e-6));
});
await check('grade ativa usa CRS atual e fonte em outro CRS é transformada uma única vez',()=>{
  const f=fixture(),r={id:'pit',name:'Cava raster',d:{nc:2,nr:2,cs:10,xll:100,yll:200,z:new Float32Array(4).fill(50),srcCRS:'SOURCE'}};
  let calls=0;f.c.reproj=(from,to,x,y)=>{calls++;assert.equal(from,'EPSG:31982');assert.equal(to,'SOURCE');return [x+100,y+200];};
  assert.equal(f.t.projectRasterSample(r,[5,5]),50);assert.equal(calls,1);
  r.d._full={...r.d,crs:'EPSG:31982',xll:0,yll:0};
  assert.equal(f.t.projectRasterSample(r,[5,5]),50);assert.equal(calls,1,'CRS explícito da grade reprojetada sobrepõe srcCRS antigo');
  delete r.d._full;delete r.d.srcCRS;r.srcCRS='SOURCE';
  assert.equal(f.t.projectRasterSample(r,[5,5]),50);assert.equal(calls,2,'identificação de CRS da camada também é respeitada');
});
await check('NoData declarado não participa da interpolação raster nem das faces TIN',()=>{
  const f=fixture(),r={id:'pit',name:'Cava raster',d:{nc:2,nr:2,cs:1,xll:0,yll:0,z:new Float32Array([50,-9999,50,-9999])}};
  for(const key of ['noData','nodata','_nd']){
    r.d[key]=-9999;
    assert.equal(f.t.projectRasterSample(r,[.5,1]),50);
    assert.ok(Number.isNaN(f.t.projectRasterSample(r,[1,1])),'sentinela em contribuinte: '+key);
    delete r.d[key];
  }
  assert.equal(f.t.projectRasterSample(r,[1.5,1]),-9999,'não proibir cotas negativas sem uma declaração NoData');
  r.d.noData=-9999.1;r.d.z.fill(Math.fround(-9999.1));assert.ok(Number.isNaN(f.t.projectRasterSample(r,[1,1])));
  r.d={noData:-9999,tin:{xs:[0,10,0],ys:[0,0,10],zs:[10,-9999,30],tri:[0,1,2],maxEdge:0}};
  assert.ok(Number.isNaN(f.t.projectRasterSample(r,[2,2])));assert.equal(r.d.tin.zs[1],-9999,'fonte intacta');
});
await check('TIN usa faces existentes e respeita vazio/recorte sem triangular novamente',()=>{
  const f=fixture(),r={id:'pit',name:'Cava TIN',_v3:{papel:'projeto'},d:{tin:{xs:[0,10,0],ys:[0,0,10],zs:[10,20,30],tri:[0,1,2],maxEdge:0}}};setup(f,[],[terrain(),r]);
  assert.ok(Math.abs(f.t.projectRasterSample(r,[2,2])-16)<1e-10);assert.ok(Number.isNaN(f.t.projectRasterSample(r,[8,8])));
  r._exactClipRings=[square(0,3)];assert.ok(Number.isNaN(f.t.projectRasterSample(r,[4,1])));
});
await check('geração integra vários projetos sem substituir o terreno nem a escala1',()=>{
  const f=fixture(),L=design(),low={id:2,name:'Cava profunda',gtype:'line',features:[{geom:[[50,0,-50],[50,100,-50]]}]};setup(f,[L,low],[terrain()],{projectSources:['L:1','L:2']});
  const r=f.api.generate();assert.equal(r.projects.length,2);assert.ok(r.profile.series[0].z.every(z=>z===130));assert.equal(r.rasterId,'terrain');
  assert.equal(r.renderGeometry.xScale,r.renderGeometry.yScale);assert.ok(r.renderGeometry.zMin<=-50);
  assert.ok(f.texts.some(s=>s==='Terreno — Terreno'));assert.ok(f.texts.some(s=>s.startsWith('Projeto — Cava')));
});
await check('cota inferior é absoluta, finita e abaixo do terreno; preenchimento termina nela',()=>{
  const f=fixture(),L={id:8,name:'Unidade',gtype:'polygon',crs:'EPSG:31982',_geology:{kind:'litologia'},color:'#123456',
    features:[{geom:[square(-20,120)],props:{LITO:'Calcário'}}]};setup(f,[L],[terrain()],{layerIds:['8'],geologyBase:40});
  const r=f.api.generate();assert.equal(r.geologyBase,40);assert.equal(r.renderGeometry.zMin,40);
  const fill=f.fills.find(p=>p.points.length>3),expectedY=42+(r.renderGeometry.zMax-40)*r.renderGeometry.yScale;
  assert.ok(fill);assert.ok(Math.abs(Math.max(...fill.points.map(p=>p[1]))-expectedY)<1e-8);
  assert.match(f.nodes.get('gsecOut').innerHTML,/Limite gráfico/);
  for(const bad of [130,131,Infinity,NaN,'não é número']){f.c.S.geology.section.geologyBase=bad;assert.equal(f.api.generate(),null);assert.match(f.notices.at(-1),/cota inferior/);}
  f.c.S.geology.section.geologyBase=null;assert.equal(f.api.generate().geologyBase,null);
});
await check('snapshot e camada salva conservam fontes/cota; restore legado limpa ambas',()=>{
  const f=fixture();setup(f,[design()],[terrain()],{projectSources:['L:1'],geologyBase:40});
  const snapshot=plain(f.api.sectionSnapshot());assert.deepEqual(snapshot.section.projectSources,['L:1']);assert.equal(snapshot.section.geologyBase,40);
  const saved=f.api.saveCurrent();assert.equal(saved.features[0].props.PROJ_SEC,'L:1');assert.equal(saved.features[0].props.GEO_BASE,40);
  f.c.S.geology.section.projectSources=[];f.c.S.geology.section.geologyBase=null;f.api.sectionRestore(snapshot);
  assert.deepEqual(plain(f.c.S.geology.section.projectSources),['L:1']);assert.equal(f.c.S.geology.section.geologyBase,40);
  f.open();f.nodes.get('gsecSaved').listeners.change({target:{value:saved.features[0].props.GEOSEC_ID}});
  assert.deepEqual(plain(f.c.S.geology.section.projectSources),['L:1']);assert.equal(f.nodes.get('gsecGeologyBase').value,40);
  assert.match(f.nodes.get('gsecProjects').innerHTML,/data-project="L:1" checked/);
  const again=f.api.generate();assert.equal(again.projects.length,1);assert.equal(again.geologyBase,40);
  f.api.sectionRestore({section:{name:'Antiga'}});assert.deepEqual(plain(f.c.S.geology.section.projectSources),[]);assert.equal(f.c.S.geology.section.geologyBase,null);
});
console.log(`${count} verificações de perfis de cava e cota inferior geológica aprovadas.`);
