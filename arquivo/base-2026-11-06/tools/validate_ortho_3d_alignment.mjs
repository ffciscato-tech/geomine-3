import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const scene=read('src/core/parts/21-profiles-and-3d.js');
const drapes=read('src/core/parts/18-lidar-layout-extensions.js');
const raster=read('src/core/parts/20-raster-dem.js');
function declaration(source,name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,`função ${name} ausente`);
  const lineEnd=source.indexOf('\n',start);
  if(source.slice(start,lineEnd).trimEnd().endsWith('}'))return source.slice(start,lineEnd);
  const end=source.indexOf('\n}',start);
  assert.ok(end>start,`fim da função ${name} ausente`);
  return source.slice(start,end+2);
}
const pc={console};pc.window=pc;pc.self=pc;pc.global=pc;
vm.createContext(pc);vm.runInContext(read('src/vendor/proj4.min.js'),pc);
const CRS='EPSG:31982',OTHER='EPSG:31983',WM='EPSG:3857';
pc.proj4.defs(CRS,'+proj=utm +zone=22 +south +ellps=GRS80 +units=m +no_defs');
pc.proj4.defs(OTHER,'+proj=utm +zone=23 +south +ellps=GRS80 +units=m +no_defs');
const project=(a,b,p)=>Array.from(pc.proj4(a,b,p));
const reproj=(a,b,x,y)=>project(a,b,[x,y]);
// Somente a extensão arredondada do caso de regressão; sem imagem ou dados privados.
const B=[583644.77,7073403.51,586429.37,7075893.96];
const envelope=[Infinity,Infinity,-Infinity,-Infinity];
for(let i=0;i<=64;i++){
  const t=i/64;
  for(const p of [[B[0]+t*(B[2]-B[0]),B[1]],[B[0]+t*(B[2]-B[0]),B[3]],
    [B[0],B[1]+t*(B[3]-B[1])],[B[2],B[1]+t*(B[3]-B[1])]]){
    const q=project(CRS,WM,p);
    envelope[0]=Math.min(envelope[0],q[0]);envelope[1]=Math.min(envelope[1],q[1]);
    envelope[2]=Math.max(envelope[2],q[0]);envelope[3]=Math.max(envelope[3],q[1]);
  }
}
const sw=project(WM,'EPSG:4326',envelope.slice(0,2));
const ne=project(WM,'EPSG:4326',envelope.slice(2,4));
const ll=[[sw[1],sw[0]],[ne[1],ne[0]]];
const S={workCRS:CRS,ortofotos:[]};
const context={S,console,reproj,Math,Number};vm.createContext(context);
vm.runInContext([
  declaration(raster,'orthoCRS'),declaration(scene,'v3OrthoTextureInfo'),
  declaration(scene,'v3RasterCellY'),declaration(drapes,'registraOrtoParaDrape')
].join('\n')+'\nglobalThis.api={info:v3OrthoTextureInfo,cellY:v3RasterCellY,register:registraOrtoParaDrape};',context);
const {api}=context;
const original=()=>({name:'Imagem sintética',url:'synthetic:wm',b:B.slice(),_warpWM:true,
  _llbounds:ll.map(p=>p.slice()),_crsFixo:CRS,_sourceCRS:CRS});
const plain=x=>JSON.parse(JSON.stringify(x));
function uvWorld(uv,b,crs){
  return project(crs,CRS,[b[0]+uv[0]*(b[2]-b[0]),b[1]+uv[1]*(b[3]-b[1])]);
}
function sampledAlignment(info,bitmapBounds,bitmapCRS,workCRS=CRS){
  let maximum=0;
  for(let r=0;r<9;r++)for(let c=0;c<9;c++){
    const world=[B[0]+(c+.5)/9*(B[2]-B[0]),B[1]+(r+.5)/9*(B[3]-B[1])];
    const work=project(CRS,workCRS,world),uv=new Float64Array(2);
    info.writeUV(work[0],work[1],uv);
    const rendered=uvWorld(uv,bitmapBounds,bitmapCRS);
    maximum=Math.max(maximum,Math.hypot(rendered[0]-world[0],rendered[1]-world[1]));
    const wb=info.workBounds;
    assert.ok(work[0]>=wb[0]-.02&&work[0]<=wb[2]+.02&&work[1]>=wb[1]-.02&&work[1]<=wb[3]+.02,
      'envelope no CRS de trabalho rejeitaria a textura que cobre o MDT');
  }
  assert.ok(maximum<.0001,`drape deslocado ${maximum.toFixed(4)} m`);
  return maximum;
}

const wm=api.info(original(),CRS);
assert.equal(wm.url,'synthetic:wm');assert.equal(wm.crs,WM);
sampledAlignment(wm,envelope,WM);
let oldMax=0;
for(let r=0;r<9;r++)for(let c=0;c<9;c++){
  const u=(c+.5)/9,v=(r+.5)/9;
  const p=[B[0]+u*(B[2]-B[0]),B[1]+v*(B[3]-B[1])];
  const old=uvWorld([u,v],envelope,WM);
  oldMax=Math.max(oldMax,Math.hypot(old[0]-p[0],old[1]-p[1]));
}
assert.ok(oldMax>15,'controle negativo não reproduziu o UV UTM aplicado sobre bitmap WM');

const native=original();native._workPreviewURL='synthetic:source';
const sourceInfo=api.info(native,CRS);
assert.equal(sourceInfo.url,native._workPreviewURL,'3D deve preferir a prévia original quando disponível');
assert.equal(sourceInfo.crs,CRS);sampledAlignment(sourceInfo,B,CRS);

// O projeto usa outro fuso, mas a ortofoto tem CRS explicitamente fixado.
// Interseção e UV continuam representando os mesmos pontos geográficos.
S.workCRS=OTHER;
sampledAlignment(api.info(original(),OTHER),envelope,WM,OTHER);
sampledAlignment(api.info(native,OTHER),B,CRS,OTHER);
S.workCRS=CRS;
const legacy={url:'synthetic:source',b:B.slice(),_warpWM:false};
sampledAlignment(api.info(legacy,CRS),B,CRS);
assert.equal(api.info({...original(),_llbounds:null},CRS),null,
  'bitmap WM sem limites não pode ser silenciosamente posicionado como UTM');

// Arquivar uma ortofoto para usar outra como principal conserva a grade do
// drape anterior e não compartilha arrays mutáveis de georreferenciamento.
api.register(native);assert.equal(S.ortofotos.length,1);
const stored=S.ortofotos[0];
assert.equal(stored._warpWM,true);assert.equal(stored._workPreviewURL,native._workPreviewURL);
assert.equal(stored._crsFixo,CRS);assert.equal(stored._sourceCRS,CRS);
assert.deepEqual(plain(stored._llbounds),ll);assert.notEqual(stored._llbounds,native._llbounds);
assert.notEqual(stored._llbounds[0],native._llbounds[0]);assert.notEqual(stored.b,native.b);
sampledAlignment(api.info(stored,CRS),B,CRS);
api.register(native);assert.equal(S.ortofotos.length,1,'registrar novamente deve atualizar a mesma ortofoto');

const grid={nr:13,nc:7,xll:10,yll:200,cs:2,csy:5};
assert.equal(api.cellY(grid,0),grid.yll+grid.nr*grid.csy-grid.csy/2,
  'a primeira linha do MDT deve ocupar o centro da célula ao norte');
assert.equal(api.cellY(grid,grid.nr-1),grid.yll+grid.csy/2);
assert.equal(api.cellY(grid,(grid.nr-1)/2),grid.yll+grid.nr*grid.csy/2);
assert.equal(api.cellY({...grid,csy:undefined},0),grid.yll+(grid.nr-.5)*grid.cs);
assert.match(scene,/const OY=d0\?d0\.yll\+d0\.nr\*\(d0\.csy\|\|d0\.cs\)\/2/,
  'a origem 3D deve usar a mesma altura de célula do MDT');
assert.equal((scene.match(/drape\.writeUV\(/g)||[]).length,4,
  'TIN suave/plano, raster e vértices recortados precisam usar o mapeamento comum');
assert.doesNotMatch(scene,/\(X[p]?-db\[0\]\)\/\(db\[2\]-db\[0\]\)/,
  'restou UV calculado pelo retângulo UTM sem considerar o CRS da textura');
assert.match(scene,/TextureLoader\(\)\.load\(geo\.url/,'carregador 3D ignora a URL escolhida para o CRS correto');
console.log(`OK: drape 3D alinhado nos CRS source/WM, TIN/raster e grade retangular; erro antigo reproduzido: ${oldMax.toFixed(1)} m.`);
