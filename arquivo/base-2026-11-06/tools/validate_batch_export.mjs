import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

process.on('uncaughtException',error=>{console.error('UNCAUGHT:',error&&error.message||error);process.exit(1);});
process.on('unhandledRejection',error=>{console.error('UNHANDLED:',error&&error.message||error);process.exit(1);});

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const require=createRequire(import.meta.url);
const JSZip=require(path.join(root,'src/vendor/jszip.min.js'));
const downloads=[];
let areaSyncs=0;

const exportButton={dataset:{},onclick:null};
class FakeImage{
  constructor(){this.naturalWidth=4;this.naturalHeight=2;}
  set src(value){this._src=value;setTimeout(()=>this.onload&&this.onload(),0);}
  get src(){return this._src;}
}
function elementFor(tag){
  if(tag==='canvas')return {width:0,height:0,getContext:()=>({drawImage(){}}),toBlob:callback=>callback(new Uint8Array([80,78,71]))};
  return {dataset:{},style:{},querySelector:()=>null,querySelectorAll:()=>[],remove(){}};
}
const context={
  console,Blob,TextEncoder,TextDecoder,ArrayBuffer,DataView,Uint8Array,Float64Array,Date,Map,Set,Promise,Image:FakeImage,
  setTimeout,clearTimeout,JSZip,
  document:{
    getElementById:id=>id==='btnExport'?exportButton:null,
    querySelectorAll:()=>[],body:{appendChild(){}},createElement:elementFor
  },
  S:{workCRS:'EPSG:31982',layers:[],rasters:[],groups:[],img:null,stack:[],activeId:null,_layerMulti:new Set()},
  CRS_DEFS:{'EPSG:4326':'+proj=longlat +datum=WGS84','EPSG:4674':'+proj=longlat +ellps=GRS80',
    'EPSG:4618':'+proj=longlat +ellps=aust_SA','EPSG:31976':'+proj=utm +zone=22 +ellps=GRS80',
    'EPSG:31982':'+proj=utm +zone=22 +south +ellps=GRS80'},
  CRS_LABELS:{'EPSG:4326':'WGS 84','EPSG:4674':'SIRGAS 2000','EPSG:31982':'SIRGAS 2000 / UTM 22S'},
  proj4:(source,target,point)=>{
    if(source==='EPSG:4326'&&target==='EPSG:3857'){
      const radius=6378137,lat=Math.max(-85.05112878,Math.min(85.05112878,+point[1]));
      return [radius*(+point[0])*Math.PI/180,radius*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];
    }
    return point.slice(0,2);
  },
  toWGS:(source,x,y)=>source==='EPSG:4326'?[x,y]:[-48+(x-500000)/100000,-15+(y-7200000)/100000],
  attrFilterMatch:(_layer,feature)=>feature.props?.keep!==false,
  autoAreaSyncLayer:()=>{areaSyncs++;},
  layerToKML:layer=>`<?xml version="1.0"?><kml><name>${layer.name}</name><count>${layer.features.length}</count></kml>`,
  dxfFromLayers:layers=>`0\nSECTION\n2\nENTITIES\n999\n${layers[0].name}\n0\nEOF\n`,
  gridParaASC:grid=>`ncols ${grid.nc}\nnrows ${grid.nr}\n`,
  gridParaXYZ:grid=>`X,Y,Z\n${grid.xll},${grid.yll},${grid.z[0]}\n`,
  download:async(blob,name)=>{downloads.push({blob,name});},toast:()=>{}
};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'src/core/parts/02-shapefile-dbf.js'),'utf8'),context,{filename:'02-shapefile-dbf.js'});
const utf8Value='Mineração – São José · 漢字 · 💎';
const utf8Dbf=context.writeDBF([{name:'DESCRIÇÃO',type:'C',length:8,decimal:0}],[{'DESCRIÇÃO':utf8Value}]);
const utf8View=new DataView(utf8Dbf);
assert.equal(utf8View.getUint8(29),0,'o LDID deve ficar neutro porque o CPG declara UTF-8');
assert.equal(utf8View.getUint8(32+16),new TextEncoder().encode(utf8Value).length,
  'a largura de texto deve crescer em bytes para preservar Unicode');
const utf8RoundTrip=context.parseDBF(utf8Dbf,context.dbfCpgText());
assert.equal(utf8RoundTrip.fields[0].name,'DESCRICAO','o alias fisico deve ser ASCII e manter o nome reconhecivel');
assert.equal(utf8RoundTrip.rows[0].DESCRICAO,utf8Value,'acentos e Unicode dos valores devem sobreviver ao round-trip DBF');
const longUtf8='á'.repeat(200),truncatedDbf=context.writeDBF([{name:'TEXTO',type:'C',length:254}],[{TEXTO:longUtf8}]);
const truncatedValue=context.parseDBF(truncatedDbf,'UTF-8').rows[0].TEXTO;
assert.equal(truncatedValue,'á'.repeat(127),'o limite de 254 bytes deve cortar somente entre caracteres UTF-8');
assert.equal(truncatedValue.includes('\ufffd'),false,'o DBF nunca pode conter uma sequência UTF-8 partida');
const collidingFields=[
  {name:'Descrição carbonática longa',type:'C',length:40,decimal:0},
  {name:'DESCRICAO_CARBONATICA_CURTA',type:'C',length:40,decimal:0},
  {name:'descricao-carbonatica extra',type:'C',length:40,decimal:0},
  {name:'descrição carbonática longa',type:'C',length:40,decimal:0}
];
const collidingRow={
  'Descrição carbonática longa':'valor A',
  DESCRICAO_CARBONATICA_CURTA:'valor B',
  'descricao-carbonatica extra':'valor C',
  'descrição carbonática longa':'valor D'
};
const collisionRoundTrip=()=>context.parseDBF(context.writeDBF(collidingFields,[collidingRow]),'UTF-8');
const collisionA=collisionRoundTrip(),collisionB=collisionRoundTrip();
const physicalNames=Array.from(collisionA.fields,field=>field.name);
assert.equal(new Set(physicalNames.map(name=>name.toUpperCase())).size,collidingFields.length,
  'aliases fisicos devem ser unicos sem distinguir maiusculas e minusculas');
assert.ok(physicalNames.every(name=>new TextEncoder().encode(name).length<=10&&/^[A-Z_][A-Z0-9_]*$/.test(name)),
  'cada alias deve respeitar 10 bytes e a sanitizacao DBF ASCII');
assert.deepEqual(Array.from(collisionB.fields,field=>field.name),physicalNames,
  'a mesma lista de campos deve gerar aliases deterministas');
assert.deepEqual(physicalNames.map(name=>collisionA.rows[0][name]),['valor A','valor B','valor C','valor D'],
  'campos de prefixo igual nao podem sobrescrever valores no round-trip');
assert.deepEqual(collidingFields.map(field=>field.name),[
  'Descrição carbonática longa','DESCRICAO_CARBONATICA_CURTA',
  'descricao-carbonatica extra','descrição carbonática longa'
], 'o writer nao deve alterar os nomes completos do modelo GeoMine');
const geotiffSource=fs.readFileSync(path.join(root,'src/core/parts/11-geotiff-project-workspace.js'),'utf8');
const geotiffStart=geotiffSource.indexOf('function gridParaGeoTIFF('),geotiffEnd=geotiffSource.indexOf('/* Pasta de trabalho local',geotiffStart);
assert.ok(geotiffStart>=0&&geotiffEnd>geotiffStart,'o gravador GeoTIFF precisa permanecer extraível');
vm.runInContext(geotiffSource.slice(geotiffStart,geotiffEnd),context,{filename:'11-geotiff-writer.js'});
vm.runInContext(fs.readFileSync(path.join(root,'src/modules/export/batch-layer-export.js'),'utf8'),context,{filename:'batch-layer-export.js'});

const pointLayer={id:'1',name:'Área de teste',gtype:'point',crs:'EPSG:4326',visible:true,groupId:11,
  fields:[{name:'NOME',type:'C',length:30,decimal:0}],
  features:[{geom:[[-48.1,-15.1]],props:{NOME:'Ponto A',keep:true}},{geom:[[-48.2,-15.2]],props:{NOME:'Oculto',keep:false}}]};
const multiLineLayer={id:'2',name:'AREA DE TESTE',gtype:'line',crs:'EPSG:4326',visible:true,groupId:11,fields:[],features:[{
  multi:true,geom:[[[-48.0,-15.0],[-47.9,-15.0]],[[-47.8,-14.9],[-47.7,-14.8]]],zg:[[100,101],[102,103]],props:{keep:true}
}]};
const polygonLayer={id:'3',name:'CON',gtype:'polygon',crs:'EPSG:31982',visible:true,
  fields:[{name:'NOME',type:'C',length:30,decimal:0}],features:[{geom:[[500000,7200000],[500100,7200000],[500100,7200100],[500000,7200100],[500000,7200000]],props:{NOME:'Quadra',keep:true}}]};
const dxfLayer={id:'4',name:'Talude/Final',gtype:'line',crs:'EPSG:31982',visible:true,fields:[],
  features:[{geom:[[500000,7200000],[500100,7200100]],zg:[550,560],props:{keep:true}}]};
const raster={id:'5',name:'MDT teste',visible:true,groupId:12,d:{nc:2,nr:2,cs:5,xll:500000,yll:7200000,
  z:new Float64Array([10,11,12,13]),srcCRS:'EPSG:31982'}};
const image={name:'Orto teste',visible:true,groupId:12,url:'data:image/png;base64,AA==',b:[500000,7200000,500040,7200020],
  _warpWM:true,_llbounds:[[-15,-48],[-14.9,-47.9]],_w:4,_h:2,_W0:12,_H0:6};
const tin={id:'6',name:'TIN puro',visible:true,tinPuro:true,d:{tin:{xs:[0],ys:[0],zs:[0]}}};
const groups=[{id:10,name:'Projeto',collapsed:false},{id:11,name:'Vetores',parentId:10,collapsed:false},
  {id:12,name:'Superfícies',collapsed:false}];
const treeState={workCRS:'EPSG:31982',layers:[pointLayer,multiLineLayer,polygonLayer,dxfLayer],rasters:[raster,tin],img:image,groups,
  stack:['L:1','L:2','L:3','R:5','I:0','R:6','L:4']};
const originalStack=treeState.stack.slice();
const tree=context.GeoMineBatchExport.treeSnapshot(treeState);
assert.deepEqual(treeState.stack,originalStack,'o snapshot não pode alterar a pilha do projeto');
assert.equal(JSON.stringify(tree.sources.map(item=>item.key)),JSON.stringify(['L:1','L:2','L:3','R:5','I:0','R:6','L:4']));
assert.equal(JSON.stringify(tree.entries.filter(item=>item.kind==='group').map(item=>item.name)),JSON.stringify(['Projeto','Vetores','Superfícies']));
assert.equal(tree.sources.find(item=>item.key==='L:1').depth,2,'subgrupo deve produzir dois níveis de recuo');
assert.equal(JSON.stringify(tree.sources.find(item=>item.key==='L:1').groupPath.map(item=>item.name)),JSON.stringify(['Projeto','Vetores']));
assert.equal(tree.sources.find(item=>item.key==='R:6').exportable,false,'TIN puro não pode fingir ser raster');
assert.equal(context.GeoMineBatchExport.detectFormat(tree.sources.find(item=>item.key==='L:1')),'shp');
assert.equal(context.GeoMineBatchExport.detectFormat(tree.sources.find(item=>item.key==='R:5')),'tif');
assert.equal(context.GeoMineBatchExport.detectFormat(tree.sources.find(item=>item.key==='I:0')),'png');
const originalBytes=new Uint8Array([73,73,42,0,71,69,79,77,73,78,69]).buffer;
const originalImage={...image,name:'Orto original',_sourceRaw:originalBytes,_sourceCRS:'EPSG:31982'};
assert.equal(context.GeoMineBatchExport.detectFormat({sourceKind:'image',source:originalImage}),'tifsrc');

context.S.layers=treeState.layers;context.S.rasters=treeState.rasters;context.S.groups=treeState.groups;
context.S.img=treeState.img;context.S.stack=treeState.stack;
const descriptor=key=>tree.sources.find(item=>item.key===key);
const jobs=[
  {descriptor:descriptor('L:3'),format:'shp',targetCRS:'EPSG:31982',useFilter:true},
  {descriptor:descriptor('L:2'),format:'geojson',useFilter:true},
  {descriptor:descriptor('L:1'),format:'kml',useFilter:true},
  {descriptor:descriptor('L:4'),format:'dxf',useFilter:true},
  {descriptor:descriptor('R:5'),format:'auto',requestedFormat:'auto'},
  {descriptor:descriptor('R:5'),format:'asc'},
  {descriptor:descriptor('R:5'),format:'xyz'},
  {descriptor:descriptor('I:0'),format:'auto',requestedFormat:'auto'}
];
const result=await context.GeoMineBatchExport.run(jobs,{fileName:'teste_lote.zip'}).catch(error=>{
  throw new Error('Falha no lote principal: '+String(error&&error.message||error));
});
assert.equal(downloads.length,1,'o lote deve iniciar exatamente um download');
assert.equal(downloads[0].name,'teste_lote.zip');
assert.equal(JSON.stringify(result.manifest.totals),JSON.stringify({requested:8,succeeded:8,failed:0}));
assert.equal(JSON.stringify(result.manifest.succeededByKind),JSON.stringify({vector:4,raster:3,image:1}));
assert.equal(result.manifest.schema,'geomine.layer-export-batch/5');
assert.equal(result.manifest.folderMode,'tree');
assert.equal(areaSyncs,1,'a área deve ser sincronizada antes de filtrar/exportar o polígono');

const zip=await JSZip.loadAsync(new Uint8Array(await result.blob.arrayBuffer()));
const archived=Object.keys(zip.files).filter(name=>!zip.files[name].dir);
assert.equal(archived.includes('manifesto.json'),false);assert.equal(archived.includes('LEIA-ME.txt'),false);
for(const extension of ['shp','shx','dbf','cpg','geojson','kml','dxf','tif','asc','xyz','png','pgw'])
  assert.equal(archived.filter(name=>name.toLowerCase().endsWith('.'+extension)).length,1,`deve haver um .${extension}`);
assert.equal(archived.filter(name=>/\.prj$/i.test(name)).length,4,'Shapefile, ASC, XYZ e imagem precisam de PRJ; GeoTIFF usa GeoKeys');
const batchDbf=archived.find(name=>/\.dbf$/i.test(name)),batchCpg=batchDbf.replace(/\.dbf$/i,'.cpg');
assert.equal(await zip.file(batchCpg).async('string'),'UTF-8','cada DBF deve declarar sua codificação real no CPG');
assert.equal(new Set(archived.map(name=>name.toLowerCase())).size,archived.length,'os caminhos não podem colidir');

const embeddedManifest=result.manifest;
assert.equal(embeddedManifest.totals.succeeded,8);
assert.equal(embeddedManifest.items[2].featureCount,1,'o filtro de atributo deve ser respeitado');
assert.match(embeddedManifest.items[0].files[0],/^camadas\/005_camada_CON\./,'camada da raiz deve ficar diretamente em camadas/');
assert.match(embeddedManifest.items[2].files[0],/^camadas\/001_Projeto\/002_Vetores\/003_Area_de_teste\./,'grupo e subgrupo devem conter diretamente o arquivo ordenado');
assert.match(embeddedManifest.items[4].files[0],/^camadas\/006_Superficies\/007_MDT_teste\./,'raster deve ficar diretamente na pasta do grupo');
assert.equal(archived.some(name=>/\/005_camada_CON\//.test(name)||/\/003_Area_de_teste\//.test(name)||/\/007_MDT_teste\//.test(name)),false,
  'camadas não podem criar subpastas próprias');
assert.equal(embeddedManifest.items[4].format,'tif','automático deve escolher GeoTIFF para raster');
assert.equal(embeddedManifest.items[4].requestedFormat,'auto');
assert.equal(embeddedManifest.items[7].actualCRS,'EPSG:3857','preview warpado deve receber georreferência Web Mercator');
assert.equal(JSON.stringify(embeddedManifest.items[7].dimensions),JSON.stringify([4,2]));
assert.equal(JSON.stringify(embeddedManifest.items[7].sourceDimensions),JSON.stringify([12,6]));
assert.match(embeddedManifest.items[7].warnings.join(' '),/Foi exportada a prévia 4×2/);

const geoPath=embeddedManifest.items[1].files.find(file=>file.endsWith('.geojson'));
const geo=JSON.parse(await zip.file(geoPath).async('string'));
assert.equal(geo.features[0].geometry.type,'MultiLineString');
assert.equal(geo.features[0].geometry.coordinates.length,2,'todas as partes da linha devem ser preservadas');
assert.equal(geo.features[0].geometry.coordinates[1][1][2],103,'o Z da segunda parte deve ser preservado');
const imagePrj=embeddedManifest.items[7].files.find(file=>file.endsWith('.prj'));
assert.match(await zip.file(imagePrj).async('string'),/Pseudo-Mercator/,'PRJ da imagem warpada deve ser EPSG:3857');
const imagePgw=embeddedManifest.items[7].files.find(file=>file.endsWith('.pgw'));
const pgw=(await zip.file(imagePgw).async('string')).trim().split(/\s+/).map(Number);
const merc=(lng,lat)=>[6378137*lng*Math.PI/180,6378137*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))];
const mercSW=merc(-48,-15),mercNE=merc(-47.9,-14.9);
assert.ok(Math.abs(pgw[0]-(mercNE[0]-mercSW[0])/4)<1e-6,'PGW precisa usar a largura real da prévia em Web Mercator');
assert.ok(Math.abs(pgw[3]+(mercNE[1]-mercSW[1])/2)<1e-6,'PGW precisa usar a altura real da prévia em Web Mercator');

const nativeArtifact=await context.GeoMineBatchExport.buildArtifact({source:originalImage,sourceKind:'image',format:'auto'},new Set());
assert.equal(nativeArtifact.format,'tifsrc');assert.equal(nativeArtifact.files.length,1);
assert.deepEqual(new Uint8Array(nativeArtifact.files[0].data),new Uint8Array(originalBytes),'GeoTIFF original deve sair byte a byte');
assert.equal(JSON.stringify(nativeArtifact.dimensions),JSON.stringify([12,6]));

const flatResult=await context.GeoMineBatchExport.run([
  {descriptor:descriptor('L:1'),format:'shp',targetCRS:'EPSG:4326',useFilter:true,folderMode:'tree'},
  {descriptor:descriptor('L:2'),format:'geojson',useFilter:true,folderMode:'tree'},
  {layer:{...multiLineLayer,id:'same3',name:'área de teste'},format:'kml',useFilter:true,folderMode:'tree'},
  {descriptor:descriptor('R:5'),format:'tif',folderMode:'tree'}
],{download:false,folderMode:'flat'});
assert.equal(flatResult.manifest.folderMode,'flat','o modo deve ser único para todo o ZIP');
const flatZip=await JSZip.loadAsync(new Uint8Array(await flatResult.blob.arrayBuffer()));
const flatFiles=Object.keys(flatZip.files).filter(name=>!flatZip.files[name].dir);
assert.ok(flatFiles.length>0&&flatFiles.every(name=>!name.includes('/')),'modo bruto deve deixar todos os arquivos na raiz');
assert.equal(flatFiles.includes('manifesto.json'),false);assert.equal(flatFiles.includes('LEIA-ME.txt'),false);
assert.ok(flatFiles.some(name=>/^Area_de_teste\.shp$/.test(name)),'modo bruto deve usar o nome da camada sem prefixo de ordem');
assert.ok(flatFiles.some(name=>/^AREA_DE_TESTE_2\.geojson$/.test(name)),'nomes repetidos devem receber somente um sufixo de segurança');
assert.ok(flatFiles.some(name=>/^area_de_teste_3\.kml$/.test(name)),'a terceira colisão deve receber _3');
assert.ok(flatFiles.some(name=>/^MDT_teste\.tif$/.test(name)));
assert.equal(flatFiles.some(name=>/^\d{3}_/.test(name)),false,'modo bruto não pode numerar arquivos');
const flatShpStem=flatFiles.find(name=>name.endsWith('.shp')).replace(/\.shp$/,'');
for(const extension of ['shp','shx','dbf','prj','cpg'])assert.ok(flatFiles.includes(flatShpStem+'.'+extension),'componentes SHP devem compartilhar o mesmo nome-base');
assert.equal(await flatZip.file(flatShpStem+'.cpg').async('string'),'UTF-8');

const originalKml=context.layerToKML;
context.layerToKML=layer=>{if(layer.id==='falha-nome')throw new Error('falha simulada');return originalKml(layer);};
const failedNameResult=await context.GeoMineBatchExport.run([
  {layer:{...pointLayer,id:'falha-nome',name:'Nome repetido'},format:'kml'},
  {layer:{...pointLayer,id:'sucesso-nome',name:'NOME REPETIDO'},format:'geojson'}
],{download:false,folderMode:'flat'});
context.layerToKML=originalKml;
assert.equal(failedNameResult.manifest.totals.failed,1);
assert.match(failedNameResult.manifest.items[1].files[0],/^NOME_REPETIDO\.geojson$/,
  'uma falha anterior não pode reservar o nome nem forçar _2');

const fallbackResult=await context.GeoMineBatchExport.run([
  {descriptor:descriptor('L:1'),format:'geojson',folderMode:'flat'}
],{download:false,folderMode:'modo-invalido'});
assert.equal(fallbackResult.manifest.folderMode,'tree','modo inválido deve voltar à organização por árvore');
const fallbackZip=await JSZip.loadAsync(new Uint8Array(await fallbackResult.blob.arrayBuffer()));
assert.ok(Object.keys(fallbackZip.files).some(name=>name.startsWith('camadas/')));

const partial=await context.GeoMineBatchExport.run([
  {layer:pointLayer,format:'geojson',useFilter:true},
  {layer:{id:'x',name:'Vazia',gtype:'line',crs:'EPSG:4326',features:[]},format:'kml',useFilter:true}
],{download:false});
assert.equal(JSON.stringify(partial.manifest.totals),JSON.stringify({requested:2,succeeded:1,failed:1}));
assert.equal(partial.manifest.items[1].code,'EMPTY_LAYER');

await assert.rejects(()=>context.GeoMineBatchExport.run([
  {layer:{id:'bad',name:'Inválida',gtype:'point',crs:'EPSG:4326',features:[{geom:[[null,null]],props:{}}]},format:'geojson'}
],{download:false}),error=>error.code==='ALL_FAILED');
assert.doesNotThrow(()=>context.GeoMineBatchExport.validateJob({layer:polygonLayer,format:'shp',targetCRS:'EPSG:31976'}));
assert.throws(()=>context.GeoMineBatchExport.validateJob({layer:polygonLayer,format:'shp',targetCRS:'EPSG:9999'}),error=>error.code==='UNSUPPORTED_CRS');
assert.throws(()=>context.GeoMineBatchExport.validateJob({source:{id:7,name:'Raster ruim',d:{nc:2,nr:2,cs:5,xll:0,yll:0,z:[1]}},sourceKind:'raster',format:'tif'}),error=>error.code==='INVALID_RASTER');
assert.throws(()=>context.GeoMineBatchExport.validateJob({source:{id:8,name:'Retangular',d:{nc:1,nr:1,cs:5,csy:10,xll:0,yll:0,z:[1]}},sourceKind:'raster',format:'asc'}),error=>error.code==='RECTANGULAR_ASC');
assert.throws(()=>context.GeoMineBatchExport.validateJob({source:tin,sourceKind:'tin',format:'tif'}),error=>error.code==='TIN_REQUIRES_RASTER');
assert.throws(()=>context.GeoMineBatchExport.validateJob({source:{...image,_llbounds:null},sourceKind:'image',format:'png'}),error=>error.code==='IMAGE_WARP_BOUNDS_MISSING');
assert.throws(()=>context.GeoMineBatchExport.validateJob({source:{...image,_llbounds:[[-15,-48],[-16,-47]]},sourceKind:'image',format:'png'}),error=>error.code==='IMAGE_WARP_BOUNDS_INVALID');

const wkt31976=context.GeoMineBatchExport.prjText('EPSG:31976');
assert.match(wkt31976,/UTM zone 22N/);assert.match(wkt31976,/central_meridian",-51/);assert.match(wkt31976,/false_northing",0/);
assert.match(context.GeoMineBatchExport.prjText('EPSG:31983'),/UTM zone 23S/);
assert.match(context.GeoMineBatchExport.prjText('EPSG:4618'),/South_American_Datum_1969/);
assert.match(context.GeoMineBatchExport.prjText('EPSG:29193'),/UTM zone 23S/);
assert.match(context.GeoMineBatchExport.prjText('EPSG:22523'),/Corrego_Alegre/);
assert.match(context.GeoMineBatchExport.prjText('EPSG:29101'),/Polyconic/);
assert.match(context.GeoMineBatchExport.prjText('EPSG:3857'),/Pseudo-Mercator/);
assert.throws(()=>context.GeoMineBatchExport.prjText('EPSG:9999'),error=>error.code==='UNSUPPORTED_CRS_WKT');

const geogTiff=context.gridParaGeoTIFF({nc:1,nr:1,cs:.01,xll:-48,yll:-15,z:new Float32Array([1])},'EPSG:4618',-9999);
const tifView=new DataView(geogTiff),ifdOffset=tifView.getUint32(4,true),tagCount=tifView.getUint16(ifdOffset,true);
let geoKeys=null;
for(let i=0;i<tagCount;i++){
  const offset=ifdOffset+2+i*12;if(tifView.getUint16(offset,true)!==34735)continue;
  const count=tifView.getUint32(offset+4,true),dataOffset=tifView.getUint32(offset+8,true);
  geoKeys=Array.from({length:count},(_,index)=>tifView.getUint16(dataOffset+index*2,true));
}
assert.ok(geoKeys,'GeoTIFF deve conter GeoKeyDirectory');
assert.deepEqual(geoKeys.slice(4,8),[1024,0,1,2],'EPSG:4618 deve ser marcado como geográfico');
assert.deepEqual(geoKeys.slice(-4),[2048,0,1,4618],'EPSG:4618 deve usar GeographicTypeGeoKey');

const used=new Set();
assert.equal(context.GeoMineBatchExport.safeName('Área de teste',used),'Area_de_teste');
assert.equal(context.GeoMineBatchExport.safeName('AREA DE TESTE',used),'AREA_DE_TESTE_2');
assert.equal(context.GeoMineBatchExport.safeName('../CON',used),'camada_CON');

const dist=fs.readFileSync(path.join(root,'dist/GeoMine.html'),'utf8');
assert.match(dist,/geomine\.layer-export-batch\/5/,'o aplicativo distribuído precisa incorporar a exportação em lote v5');

console.log('Exportação em lote validada: árvore, grupos/subgrupos, vetores, rasters, ortofoto, formatos automáticos e falhas parciais.');
