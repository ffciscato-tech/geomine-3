import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
let nativeCanvas;
try{nativeCanvas=require('@napi-rs/canvas');}
catch{nativeCanvas=require(path.resolve(path.dirname(process.execPath),'../node_modules/@napi-rs/canvas'));}
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),plain=value=>JSON.parse(JSON.stringify(value));
const source=read('src/modules/geology/geological-sections.js'),engine=read('src/modules/geology/mesh-section-engine.js');
let checks=0;
function check(name,run){run();checks++;console.log('OK · '+name);}
function box(id='body',lo=20,hi=80,bottom=20,top=60){
  return {id,name:'Corpo '+id,color:'#b93862',visible:true,crs:'EPSG:31982',
    vertices:[[lo,-10,bottom],[hi,-10,bottom],[hi,10,bottom],[lo,10,bottom],
      [lo,-10,top],[hi,-10,top],[hi,10,top],[lo,10,top]],
    faces:[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]};
}
function fixture(meshes=[box()]){
  const nodes=new Map(),notices=[],canvas=nativeCanvas.createCanvas(1100,420);canvas.style={};
  let importOpens=0;
  function node(id){const item={id,value:'',checked:false,style:{},innerHTML:'',listeners:{},
    addEventListener(k,fn){this.listeners[k]=fn;},querySelector:()=>null,scrollIntoView(){},
    classList:{add(){},remove(){},toggle(){}},
    get options(){return [...this.innerHTML.matchAll(/<option value="([^"]*)"/g)].map(m=>({value:m[1]}));}};nodes.set(id,item);return item;}
  node('gsecOut');nodes.set('gsecCanvas',canvas);
  const ctx={window:{GeoMineGeology:{meshes:{list:()=>meshes,getWorkMesh:id=>{
    const m=meshes.find(m=>String(m.id)===String(id));if(!m)throw new Error('Malha ausente');return m;
  },open:()=>{importOpens++;}}}},S:{layers:[],rasters:[],workCRS:'EPSG:31982',geology:{sections:[],section:{
    name:'Corte Surpac',line:[[0,0],[100,0]],lineWgs:[],rasterId:null,corridor:10,step:5,ve:1,
    meshIds:meshes.map(m=>m.id),layerIds:[],roles:{},projectSources:[],useField:false}}},
    document:{readyState:'loading',addEventListener(){},getElementById:id=>nodes.get(id)||null,
      querySelectorAll:selector=>{
        const match=selector.match(/^#(gsecMeshes|gsecProjects|gsecLayers) input\[data-(mesh|project|layer)\]$/);
        if(!match)return [];
        return [...(nodes.get(match[1])?.innerHTML||'').matchAll(new RegExp('<input[^>]*data-'+match[2]+'="([^"]+)"[^>]*>','g'))]
          .map(m=>({dataset:{[match[2]]:m[1]},checked:/\bchecked\b/.test(m[0])}));
      }},console,setTimeout:()=>0,clearTimeout(){},URL,Blob,
    fromWGS:(_crs,x,y)=>[x,y],toWGS:(_crs,x,y)=>[x,y],reproj:(_a,_b,x,y)=>[x,y],
    toast:message=>notices.push(message),refreshUI(){},drawLayer(){},
    addLayer:layer=>{layer.id=101+ctx.S.layers.length;ctx.S.layers.push(layer);return layer;}};
  vm.createContext(ctx);vm.runInContext(engine,ctx);vm.runInContext(source,ctx);
  function open(){
    node('sideGeo').insertAdjacentHTML=(_where,html)=>{
      for(const m of html.matchAll(/<[^>]*id="([^"]+)"[^>]*>/g)){
        const el=node(m[1]);el.value=m[0].match(/\bvalue="([^"]*)"/)?.[1]||'';el.checked=/\bchecked\b/.test(m[0]);
      }
      nodes.set('gsecCanvas',canvas);
    };ctx.window.GeoMineGeology.openSection();ctx.window.GeoMineGeology.refresh();
  }
  return {ctx,api:ctx.window.GeoMineGeology,nodes,notices,canvas,open,meshes,
    get importOpens(){return importOpens;},
    pixel(r,s,z){const g=r.renderGeometry;return [...canvas.getContext('2d').getImageData(Math.round(72+s*g.xScale),Math.round(42+(g.zMax-z)*g.yScale),1,1).data];}};
}
const terrain=()=>({id:'terrain',name:'Terreno',d:{nc:120,nr:40,cs:1,xll:-10,yll:-20,z:new Float32Array(4800).fill(100)}});
function empty(pixel){assert.ok(pixel.slice(0,3).every(v=>v>210),'espaço sem domínio: '+pixel);}
function colored(pixel){assert.ok(pixel[0]>pixel[1]+30&&pixel[2]>pixel[1]+8,'interior do sólido: '+pixel);}

check('seção só de malha usa corte real e escala 1:1 sem MDT nem domínio fabricado',()=>{
  const f=fixture(),before=plain(f.meshes),r=f.api.generate();
  assert.ok(r);assert.equal(r.hasTerrain,false);assert.equal(r.rasterId,null);
  assert.ok(r.profile.series[0].z.every(Number.isNaN));assert.equal(r.runs.length,0);
  assert.equal(r.meshSections.length,1);assert.equal(r.meshSections[0].closedSolid,true);
  assert.ok(r.meshSections[0].polylines.some(p=>p.closed));assert.equal(r.renderGeometry.xScale,r.renderGeometry.yScale);
  colored(f.pixel(r,43,39));empty(f.pixel(r,13,39));empty(f.pixel(r,43,66));
  assert.deepEqual(plain(f.meshes),before);assert.match(f.nodes.get('gsecOut').innerHTML,/sem prolongamento/);
});
check('superfície aberta gera linhas, mesmo quando a projeção forma um contorno',()=>{
  const m=box('open');m.faces=m.faces.slice(2);const f=fixture([m]),r=f.api.generate();
  assert.ok(r);assert.equal(r.meshSections[0].closedSolid,false);empty(f.pixel(r,43,39));
  assert.match(f.nodes.get('gsecOut').innerHTML,/representação por linhas/);
});
check('eixo dobrado usa progressiva real; corte parcial preenche sem criar contatos na borda',()=>{
  const f=fixture();f.ctx.S.geology.section.line=[[0,0],[50,0],[50,30]];
  const bent=f.api.generate();assert.equal(bent.met.total,80);
  const stations=bent.meshSections[0].polylines.flatMap(p=>p.points.map(v=>v[0]));
  assert.equal(Math.min(...stations),20);assert.equal(Math.max(...stations),60);
  assert.ok(bent.meshSections[0].polylines.some(p=>p.closed));
  f.ctx.S.geology.section.line=[[30,0],[70,0]];const partial=f.api.generate();
  assert.equal(partial.meshSections[0].closedSolid,true);assert.ok(partial.meshSections[0].polylines.every(p=>!p.closed));
  assert.ok(partial.meshSections[0].fillPolygons.length);colored(f.pixel(partial,17,39));
});
check('cavidade interna conserva vazio com preenchimento evenodd',()=>{
  const outer=box('hollow'),inner=box('inside',35,65,30,50),offset=outer.vertices.length;
  outer.vertices.push(...inner.vertices);outer.faces.push(...inner.faces.map(f=>f.map(i=>i+offset).reverse()));
  const f=fixture([outer]),r=f.api.generate();assert.equal(r.meshSections[0].closedSolid,true);
  assert.ok(r.meshSections[0].polylines.filter(p=>p.closed).length>=2);
  colored(f.pixel(r,27,39));empty(f.pixel(r,47,39));
});
check('cota inferior só recorta a vista; não prolonga a malha até o eixo X',()=>{
  const f=fixture();f.ctx.S.geology.section.geologyBase=0;const r=f.api.generate();
  assert.equal(r.renderGeometry.zMin,0);empty(f.pixel(r,43,7));colored(f.pixel(r,43,39));
  const original=plain(r.meshSections);f.ctx.S.geology.section.geologyBase=30;const clipped=f.api.generate();
  assert.equal(clipped.renderGeometry.zMin,30);assert.equal(clipped.renderGeometry.clippedBelowBase,true);
  assert.deepEqual(plain(clipped.meshSections),original);colored(f.pixel(clipped,43,39));
  const g=clipped.renderGeometry,pixel=f.canvas.getContext('2d').getImageData(Math.round(72+43*g.xScale),Math.round(42+g.plotH+5),1,1).data;
  empty([...pixel]);
});
check('cava continua desenhada sobre os corpos e seus limites entram na escala',()=>{
  const f=fixture(),r=f.api.generate();r.projects=[{name:'Cava final',color:'#174dbe',mode:'vector',segments:[[{station:25,z:40},{station:75,z:40}]],points:[]}];
  f.api.__sectionTest.drawSection(r);const pixel=f.pixel(r,43,40);
  assert.ok(pixel[2]>pixel[0]+70,'linha de cava deve cobrir preenchimento: '+pixel);
  r.meshSections[0].polylines[0].points.forEach(p=>p[1]-=400);f.api.__sectionTest.drawSection(r);
  assert.ok(r.renderGeometry.zMin<=-380);assert.equal(r.renderGeometry.xScale,r.renderGeometry.yScale);
});
check('malhas selecionadas são independentes dos proxies vetoriais e do terreno',()=>{
  const f=fixture();f.ctx.S.layers=[{id:1,name:'Corpo proxy',gtype:'polygon',_geology:{kind:'surpac-mesh'},features:[]},
    {id:2,name:'Unidade mapeada',gtype:'polygon',_geology:{kind:'litologia'},features:[]},
    {id:3,name:'Caixa XYZ',gtype:'line',_geology:{kind:'surpac-mesh'},features:[{geom:[[0,0,20],[100,0,40]]}]}];
  f.ctx.S.rasters=[terrain()];f.open();
  assert.match(f.nodes.get('gsecMeshes').innerHTML,/data-mesh="body" checked/);
  assert.doesNotMatch(f.nodes.get('gsecLayers').innerHTML,/Corpo proxy/);assert.match(f.nodes.get('gsecLayers').innerHTML,/Unidade mapeada/);
  assert.ok(!f.api.__sectionTest.projectSourceOptions().some(s=>s.key==='L:3'));
  assert.equal(f.nodes.get('gsecRaster').value,'');assert.equal(f.api.generate().hasTerrain,false);
  f.nodes.get('gsecImportMeshes').listeners.click();assert.equal(f.importOpens,1);
  f.ctx.S.geology.section.result=null;f.api.refresh();assert.equal(f.canvas.style.display,'none');
});
check('snapshot, restauração e seção vetorial salva conservam IDs sem copiar malhas',()=>{
  const f=fixture(),before=plain(f.meshes),snapshot=plain(f.api.sectionSnapshot()),saved=f.api.saveCurrent();
  assert.deepEqual(snapshot.section.meshIds,['body']);assert.deepEqual(JSON.parse(saved.features[0].props.MESH_SEC),['body']);
  assert.equal(saved.features[0].props.MDT_ID,'');assert.ok(!JSON.stringify(snapshot).includes('vertices'));
  f.ctx.S.geology.section.meshIds=[];f.api.sectionRestore(snapshot);assert.deepEqual(plain(f.ctx.S.geology.section.meshIds),['body']);
  f.open();f.nodes.get('gsecSaved').listeners.change({target:{value:saved.features[0].props.GEOSEC_ID}});
  assert.deepEqual(plain(f.ctx.S.geology.section.meshIds),['body']);assert.equal(f.api.generate().hasTerrain,false);
  f.api.sectionRestore({section:{name:'Legada'}});assert.deepEqual(plain(f.ctx.S.geology.section.meshIds),[]);
  assert.deepEqual(plain(f.meshes),before);
});
check('falhas por complexidade/CRS não fabricam interseções nem deixam resultado antigo',()=>{
  const f=fixture();assert.ok(f.api.generate());f.api.meshes.getWorkMesh=()=>{throw new Error('Malha excede o limite de corte seguro.');};
  assert.equal(f.api.generate(),null);assert.equal(f.ctx.S.geology.section.result,null);assert.equal(f.canvas.style.display,'none');
  assert.match(f.notices.at(-1),/limite de corte seguro/);
  f.ctx.S.rasters=[terrain()];f.ctx.S.geology.section.rasterId='terrain';const r=f.api.generate();
  assert.ok(r);assert.equal(r.hasTerrain,true);assert.equal(r.meshSections[0].polylines.length,0);
  assert.match(f.nodes.get('gsecOut').innerHTML,/limite de corte seguro/);
});
check('fonte altimétrica é obrigatória e corte fora do sólido não inventa um perfil',()=>{
  const f=fixture([]);assert.equal(f.api.generate(),null);assert.match(f.notices.at(-1),/MDT.*raster adicional.*malha/);
  const g=fixture();g.ctx.S.geology.section.line=[[0,100],[100,100]];
  assert.equal(g.api.generate(),null);assert.match(g.notices.at(-1),/atravessa/);
});
check('custo excessivo do traçado é recusado antes de testar triângulos',()=>{
  const f=fixture();f.api.meshes.getWorkMesh=()=>({...box(),faces:new Array(500001)});
  f.ctx.S.geology.section.line=Array.from({length:22},(_,i)=>[i*5,0]);
  assert.equal(f.api.generate(),null);assert.match(f.notices.at(-1),/complexidade/);
});
console.log(`${checks} regressões da integração Surpac nas seções aprovadas.`);
