import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
let nativeCanvas;
try{nativeCanvas=require('@napi-rs/canvas');}
catch{nativeCanvas=require(path.resolve(path.dirname(process.execPath),'../node_modules/@napi-rs/canvas'));}
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const readerSource=read('src/modules/geology/surpac-reader.js'),engineSource=read('src/modules/geology/mesh-section-engine.js'),
  sectionsSource=read('src/modules/geology/geological-sections.js');
const easting=583644.77,northing=7073403.51,centerZ=250;
let checks=0;
function test(name,run){run();checks++;console.log('OK · '+name);}

// Corpo intrusivo lenticular, inclinado em 3D, fechado com topo/base próprios.
// Não é uma grade 2.5D: várias cotas coexistem em uma mesma posição X/Y.
function intrusion(scale=1){
  const segments=16,rings=8,vertices=[],faces=[];
  function v(theta,phi){const z=centerZ+100*scale*Math.cos(theta);return [
    easting+80*scale*Math.sin(theta)*Math.cos(phi)+.4*(z-centerZ),
    northing+50*scale*Math.sin(theta)*Math.sin(phi),z];}
  vertices.push(v(0,0));
  for(let ring=1;ring<rings;ring++)for(let j=0;j<segments;j++)vertices.push(v(Math.PI*ring/rings,2*Math.PI*j/segments));
  const bottom=vertices.length;vertices.push(v(Math.PI,0));
  const ix=(ring,j)=>1+(ring-1)*segments+(j+segments)%segments;
  for(let j=0;j<segments;j++){
    faces.push([0,ix(1,j),ix(1,j+1)]);
    for(let r=1;r<rings-1;r++)faces.push([ix(r,j),ix(r+1,j),ix(r+1,j+1)],[ix(r,j),ix(r+1,j+1),ix(r,j+1)]);
    faces.push([bottom,ix(rings-1,j+1),ix(rings-1,j)]);
  }
  return {vertices,faces};
}
function encodePair(mesh){return {
  str:'intrusivo.str,22-Sep-26,,\n0,0,0,0,\n'+mesh.vertices.map(p=>'1,'+p[1]+','+p[0]+','+p[2]).join('\n')+'\n0,0,0,0,END\n0,0,0,0,END\nEND\n',
  dtm:'intrusivo.str,22-Sep-26,,\n0,0,0,0,\nOBJECT,1,,\nTRISOLATION,1,closed=yes\n'+
    mesh.faces.map((f,i)=>[i+1,...f.map(n=>n+1),0,0,0].join(',')).join('\n')+'\n0,0,0,0,0,0,0\nEND\n'
};}
function fixture(input){
  const notices=[],nodes=new Map(),canvas=nativeCanvas.createCanvas(1100,420);canvas.style={};nodes.set('gsecCanvas',canvas);nodes.set('gsecOut',{innerHTML:''});
  const context={window:{},S:{layers:[],rasters:[],workCRS:'EPSG:31982',geology:{sections:[],section:{
    name:'Corpo intrusivo A–B',line:[[easting-200,northing],[easting+200,northing]],lineWgs:[],rasterId:null,corridor:20,step:5,ve:1,
    meshIds:['intrusion'],layerIds:[],roles:{},projectSources:[],useField:false,geologyBase:100}}},
    document:{readyState:'loading',addEventListener(){},getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[]},
    console,setTimeout:()=>0,clearTimeout(){},URL,Blob,TextEncoder,TextDecoder,
    fromWGS:(_crs,x,y)=>[x,y],toWGS:(_crs,x,y)=>[x,y],reproj:(_a,_b,x,y)=>[x,y],toast:s=>notices.push(s)};
  vm.createContext(context);vm.runInContext(readerSource,context);vm.runInContext(engineSource,context);
  const pair=encodePair(input),parsed=context.window.GeoMineSurpacReader.parsePair(pair.dtm,pair.str,{dtmName:'intrusivo.dtm',strName:'intrusivo.str'}),
    mesh={...parsed.meshes[0],id:'intrusion',name:'Corpo intrusivo inclinado',color:'#b93862',visible:true,crs:'EPSG:31982'};
  context.window.GeoMineGeology={meshes:{list:()=>[mesh],getWorkMesh:()=>mesh}};
  vm.runInContext(sectionsSource,context);
  return {context,mesh,parsed,api:context.window.GeoMineGeology,engine:context.window.GeoMineMeshSections,canvas,notices,nodes,
    pixel(result,station,z){const g=result.renderGeometry;return [...canvas.getContext('2d').getImageData(Math.round(72+station*g.xScale),Math.round(42+(g.zMax-z)*g.yScale),1,1).data];}};
}
function colored(pixel){assert.ok(pixel[0]>pixel[1]+30&&pixel[2]>pixel[1]+8,'corpo intrusivo preenchido: '+pixel);}
function empty(pixel){assert.ok(pixel.slice(0,3).every(v=>v>210),'exterior/cavidade sem preenchimento: '+pixel);}

test('DTM+STR de corpo intrusivo fechado é apto para corte preenchido e exato',()=>{
  const original=intrusion(),f=fixture(original),analysis=f.engine.analyze(f.mesh),r=f.api.generate();
  assert.equal(f.parsed.warnings.length,0);assert.equal(analysis.closedSolid,true);assert.equal(analysis.boundaryEdges,0);
  assert.equal(analysis.nonManifoldEdges,0);assert.equal(analysis.nonManifoldVertices,0);assert.equal(analysis.selfIntersectionsChecked,false);
  assert.equal(f.mesh.vertices.length,original.vertices.length);assert.equal(f.mesh.faces.length,original.faces.length);
  assert.ok(r);assert.equal(r.hasTerrain,false);assert.equal(r.meshSections[0].closedSolid,true);assert.ok(r.meshSections[0].fillPolygons.length);
  assert.ok(r.meshSections[0].polylines.every(line=>line.closed));assert.equal(r.renderGeometry.xScale,r.renderGeometry.yScale);
  colored(f.pixel(r,197,247));empty(f.pixel(r,197,123));empty(f.pixel(r,87,247));
  const points=r.meshSections[0].polylines.flatMap(l=>l.points);
  assert.ok(points.some(p=>Math.abs(p[1]-350)<1e-7&&Math.abs(p[0]-240)<1e-6),'topo inclinado deve manter sua posição real');
  assert.ok(points.some(p=>Math.abs(p[1]-150)<1e-7&&Math.abs(p[0]-160)<1e-6),'base inclinada deve manter sua posição real');
});
test('cavidade interna do corpo intrusivo permanece vazia no desenho da seção',()=>{
  const outer=intrusion(),inner=intrusion(.35),offset=outer.vertices.length;
  outer.vertices.push(...inner.vertices);outer.faces.push(...inner.faces.map(f=>f.map(i=>i+offset).reverse()));
  const f=fixture(outer),r=f.api.generate();assert.equal(r.meshSections[0].closedSolid,true);assert.equal(r.meshSections[0].fillPolygons.length,2);
  empty(f.pixel(r,197,247));colored(f.pixel(r,257,247));
});
test('mesma intrusão com abertura não recebe preenchimento de sólido',()=>{
  const open=intrusion();open.faces.splice(10,1);const f=fixture(open),analysis=f.engine.analyze(f.mesh),r=f.api.generate();
  assert.equal(analysis.closedSolid,false);assert.ok(analysis.boundaryEdges>0);assert.ok(r);assert.equal(r.meshSections[0].closedSolid,false);
  assert.equal(r.meshSections[0].fillPolygons.length,0);assert.ok(r.meshSections[0].polylines.length);empty(f.pixel(r,197,247));
  assert.match(f.nodes.get('gsecOut').innerHTML,/superfície aberta/);
});
test('A/B dentro do corpo preenche a janela sem criar contatos verticais nas bordas',()=>{
  const f=fixture(intrusion());f.context.S.geology.section.line=[[easting-20,northing],[easting+20,northing]];
  const r=f.api.generate();assert.ok(r);colored(f.pixel(r,17,247));assert.ok(r.meshSections[0].fillPolygons.length);
  for(const line of r.meshSections[0].polylines)for(let i=1;i<line.points.length;i++){
    const a=line.points[i-1],b=line.points[i];assert.ok(!(Math.abs(a[0]-b[0])<1e-8&&(Math.abs(a[0])<1e-8||Math.abs(a[0]-40)<1e-8)),
      'bordas da janela não são contatos da intrusão');
  }
});
test('pronto/topologicamente fechado não significa que um eixo externo atravesse o corpo',()=>{
  const f=fixture(intrusion());assert.equal(f.engine.analyze(f.mesh).closedSolid,true);
  f.context.S.geology.section.line=[[easting-200,northing+200],[easting+200,northing+200]];
  assert.equal(f.api.generate(),null);assert.match(f.notices.at(-1),/não atravessa|não cruza/);
});
console.log(`${checks} regressões focadas em corpo intrusivo Surpac aprovadas.`);
