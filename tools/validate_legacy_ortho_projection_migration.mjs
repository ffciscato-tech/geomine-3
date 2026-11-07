import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const rasterPath=path.join(root,'src/core/parts/20-raster-dem.js');
const persistencePath=path.join(root,'src/core/parts/26-project-persistence.js');
const layoutPath=path.join(root,'src/core/parts/17-layout-printing.js');
const rasterSource=fs.readFileSync(rasterPath,'utf8');
const persistenceSource=fs.readFileSync(persistencePath,'utf8');
const layoutSource=fs.readFileSync(layoutPath,'utf8');

function blockEnd(text,open,label){
  let depth=0,state='code',escaped=false;
  for(let i=open;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(state==='line'){
      if(ch==='\n')state='code';
      continue;
    }
    if(state==='block'){
      if(ch==='*'&&next==='/'){state='code';i++;}
      continue;
    }
    if(state!=='code'){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch===state)state='code';
      continue;
    }
    if(ch==='/'&&next==='/'){state='line';i++;continue;}
    if(ch==='/'&&next==='*'){state='block';i++;continue;}
    if(ch==='\''||ch==='"'||ch==='`'){state=ch;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return i;
  }
  assert.fail(`${label}: bloco JavaScript não foi fechado`);
}

function functionDeclaration(text,name,missingMessage=`função ${name} ausente`){
  const safe=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=new RegExp(`\\b(?:async\\s+)?function\\s+${safe}\\s*\\(`).exec(text);
  assert.ok(match,missingMessage);
  const open=text.indexOf('{',match.index+match[0].length);
  assert.ok(open>=0,`função ${name}: corpo ausente`);
  return text.slice(match.index,blockEnd(text,open,`função ${name}`)+1);
}

/* Caixa do projeto que expôs o defeito. O modelo legado coloca a imagem UTM
   entre apenas dois cantos convertidos para latitude/longitude. No Leaflet
   isso vira uma interpolação retangular em Web Mercator e ignora a pequena
   rotação/convergência existente entre as duas grades. */
const WORK_CRS='EPSG:31982';
const WM_CRS='EPSG:3857';
const B=[583644.77,7073403.51,586429.37,7075893.96];
const LEGACY_URL='data:image/png;base64,UFJFVklFV19VVE0=';
const SCREEN_URL='data:image/png;base64,UFJFVklFV19XTQ==';

const projContext={console};
projContext.window=projContext;
projContext.self=projContext;
projContext.global=projContext;
vm.createContext(projContext);
vm.runInContext(fs.readFileSync(path.join(root,'src/vendor/proj4.min.js'),'utf8'),projContext,
  {filename:'proj4.min.js'});
const proj4=projContext.proj4;
assert.equal(typeof proj4,'function','proj4 empacotado não carregou');
proj4.defs(WORK_CRS,'+proj=utm +zone=22 +south +ellps=GRS80 +units=m +no_defs');
proj4.defs(WM_CRS,'+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 '+
  '+x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs');

const project=(from,to,xy)=>Array.from(proj4(from,to,xy));
const swOld=project(WORK_CRS,WM_CRS,[B[0],B[1]]);
const neOld=project(WORK_CRS,WM_CRS,[B[2],B[3]]);
let legacyErrorSum=0,legacyErrorMax=0,legacySamples=0;
for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  const u=(col+.5)/8,v=(row+.5)/8;
  const work=[B[0]+u*(B[2]-B[0]),B[1]+v*(B[3]-B[1])];
  const correct=project(WORK_CRS,WM_CRS,work);
  const stretched=[swOld[0]+u*(neOld[0]-swOld[0]),swOld[1]+v*(neOld[1]-swOld[1])];
  const error=Math.hypot(correct[0]-stretched[0],correct[1]-stretched[1]);
  legacyErrorSum+=error;
  legacyErrorMax=Math.max(legacyErrorMax,error);
  legacySamples++;
}
const legacyErrorMean=legacyErrorSum/legacySamples;
assert.ok(Math.abs(legacyErrorMean-9.11480348263)<.02,
  `a reprodução da distorção legada mudou: erro médio ${legacyErrorMean.toFixed(4)} m`);
assert.ok(Math.abs(legacyErrorMax-24.45287008008)<.05,
  `a reprodução da distorção legada mudou: erro máximo ${legacyErrorMax.toFixed(4)} m`);
console.log(`Reprodução legada: erro médio ${legacyErrorMean.toFixed(1)} m; máximo ${legacyErrorMax.toFixed(1)} m.`);

/* A migração precisa ser uma fronteira testável: recebe a imagem como ela foi
   salva por versões antigas, conserva esse bitmap no CRS de trabalho para a
   prancha e cria uma segunda representação para o Mapa 2D. */
const warpDeclaration=functionDeclaration(rasterSource,'warpCanvasWM');
const migrationDeclaration=functionDeclaration(
  rasterSource,
  'orthoMigrateLegacyPreview',
  'Migração automática ausente: implemente orthoMigrateLegacyPreview para projetos com warpWM:false e llb:null.'
);

class FakeCanvas{
  constructor(width=8,height=8){this._width=width;this._height=height;this._reset();}
  _reset(){
    const n=Math.max(0,this._width*this._height*4);
    this._data=new Uint8ClampedArray(n);
    for(let i=0;i<n;i+=4){
      this._data[i]=(i/4)%251;
      this._data[i+1]=Math.floor(i/4/Math.max(1,this._width))%251;
      this._data[i+2]=127;
      this._data[i+3]=255;
    }
  }
  get width(){return this._width;}
  set width(value){this._width=Math.max(0,+value||0);this._reset();}
  get height(){return this._height;}
  set height(value){this._height=Math.max(0,+value||0);this._reset();}
  getContext(){
    const canvas=this;
    return {
      drawImage(){},
      getImageData(){return {data:new Uint8ClampedArray(canvas._data)};},
      createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)};},
      putImageData(image){canvas._data=new Uint8ClampedArray(image.data);}
    };
  }
  toDataURL(){return SCREEN_URL;}
}

const nativeCanvas=new FakeCanvas(8,8);
class FakeImage{
  constructor(){this.width=8;this.height=8;this.naturalWidth=8;this.naturalHeight=8;}
  set src(value){this._src=value;queueMicrotask(()=>this.onload&&this.onload());}
  get src(){return this._src;}
  async decode(){}
}

const overlayCalls=[];
const L2={
  imageOverlay(url,bounds,options={}){
    const overlay={url,bounds,options,
      addTo(){return overlay;},bringToBack(){return overlay;},
      setUrl(value){overlay.url=value;return overlay;},
      setBounds(value){overlay.bounds=value;return overlay;},
      getBounds(){return overlay.bounds;}};
    overlayCalls.push(overlay);
    return overlay;
  },
  latLngBounds:value=>value
};
const map={removeLayer(){},getPane(){return {};},createPane(){return {style:{}};}};
const S={workCRS:WORK_CRS,img:null};
const document={createElement:tag=>tag==='canvas'?new FakeCanvas():{style:{}}};
const reproj=(from,to,x,y)=>project(from,to,[x,y]);
const toWGS=(crs,x,y)=>project(crs,'EPSG:4326',[x,y]);
const fromWGS=(crs,lng,lat)=>project('EPSG:4326',crs,[lng,lat]);
const validLLB=ll=>Array.isArray(ll)&&Array.isArray(ll[0])&&Array.isArray(ll[1])&&
  ll.flat().every(Number.isFinite)&&ll[1][0]>ll[0][0]&&ll[1][1]>ll[0][1];
let decodedMaxSide=null;
const decode=async(_url,maxSide)=>{decodedMaxSide=maxSide;return nativeCanvas;};
const testContext={
  console,S,document,Image:FakeImage,L2,map,reproj,toWGS,fromWGS,
  wgsBoundsOK:()=>true,zApply(){},orthoHDReset(){},toast(){},
  setTimeout,clearTimeout,queueMicrotask,Uint8Array,Uint8ClampedArray,Float64Array,
  /* Nomes usuais de um decodificador mantidos como seams equivalentes. O
     código de produção pode usar qualquer um deles ou Image + canvas. */
  canvasFromDataURL:decode,orthoCanvasFromURL:decode,imageCanvasFromURL:decode,
  canvasFromURL:decode,decodeImageCanvas:decode,loadImageCanvas:decode,
  createImageBitmap:async()=>nativeCanvas,
  fetch:async()=>({ok:true,blob:async()=>({})}),
  URL:{createObjectURL:()=>LEGACY_URL,revokeObjectURL(){}},
  navigator:{deviceMemory:4},EH_MOVEL:true,globalThis:null
};
testContext.globalThis=testContext;
vm.createContext(testContext);
vm.runInContext(
  `${warpDeclaration}\n`+
  `const __orthoWarpReal=warpCanvasWM;let __orthoWarpCalls=0;`+
  `warpCanvasWM=(...args)=>{__orthoWarpCalls++;return __orthoWarpReal(...args);};\n`+
  `${migrationDeclaration}\n`+
  `globalThis.__orthoTest={`+
    `migrate:orthoMigrateLegacyPreview,warpCalls:()=>__orthoWarpCalls};`,
  testContext,{filename:'20-raster-dem.legacy-migration.js'}
);

const legacy={
  url:LEGACY_URL,b:B.slice(),name:'Ortofoto legada',visible:true,
  _warpWM:false,_llbounds:null,warpWM:false,llb:null
};
const plain=value=>JSON.parse(JSON.stringify(value));
legacy.overlay=L2.imageOverlay(LEGACY_URL,[[0,0],[1,1]],{opacity:.63});
S.img=legacy;
await testContext.__orthoTest.migrate(legacy,WORK_CRS);

assert.equal(legacy._workPreviewURL,LEGACY_URL,
  'a URL UTM original deve ser preservada em _workPreviewURL para o Layout');
assert.notEqual(legacy.url,LEGACY_URL,
  'o Mapa 2D não pode continuar usando o preview UTM sem reprojeção');
assert.equal(legacy.url,SCREEN_URL,
  'o Mapa 2D deve receber o bitmap produzido pela reprojeção para Web Mercator');
assert.equal(legacy.overlay.url,SCREEN_URL,
  'o overlay já criado deve trocar imediatamente para o bitmap Web Mercator');
assert.deepEqual(plain(legacy.overlay.bounds),plain(legacy._llbounds),
  'o overlay deve receber os mesmos limites Web Mercator calculados pela migração');
assert.equal(legacy.overlay.options.opacity,.63,
  'a migração não pode alterar a opacidade existente da ortofoto');
assert.equal(legacy._warpWM,true,'a migração deve marcar a representação de tela como Web Mercator');
assert.ok(validLLB(legacy._llbounds),'a migração deve preencher _llbounds válido');
assert.equal(testContext.__orthoTest.warpCalls(),1,'a primeira abertura deve reprojetar exatamente uma vez');
assert.equal(decodedMaxSide,1536,
  'em tablet de até 4 GB a migração deve limitar a prévia antes do warp para evitar estouro de memória');

/* Os limites da representação de tela devem ser o envelope Web Mercator de
   toda a borda UTM, não apenas a diagonal SW/NE usada pelo modelo antigo. */
let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
for(let i=0;i<=32;i++){
  const t=i/32;
  for(const point of [
    [B[0]+t*(B[2]-B[0]),B[1]],[B[0]+t*(B[2]-B[0]),B[3]],
    [B[0],B[1]+t*(B[3]-B[1])],[B[2],B[1]+t*(B[3]-B[1])]
  ]){
    const [x,y]=project(WORK_CRS,WM_CRS,point);
    minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
  }
}
const llSW=legacy._llbounds[0],llNE=legacy._llbounds[1];
const screenSW=project('EPSG:4326',WM_CRS,[llSW[1],llSW[0]]);
const screenNE=project('EPSG:4326',WM_CRS,[llNE[1],llNE[0]]);
for(const [actual,expected,label] of [
  [screenSW[0],minX,'oeste'],[screenSW[1],minY,'sul'],
  [screenNE[0],maxX,'leste'],[screenNE[1],maxY,'norte']
]) assert.ok(Math.abs(actual-expected)<.05,
  `limite ${label} da grade de tela divergiu ${Math.abs(actual-expected).toFixed(3)} m`);

const firstState={url:legacy.url,llb:plain(legacy._llbounds),workPreviewURL:legacy._workPreviewURL};
await testContext.__orthoTest.migrate(legacy,WORK_CRS);
assert.equal(testContext.__orthoTest.warpCalls(),1,
  'chamar a migração novamente não pode reprojetar uma imagem que já está em Web Mercator');
assert.deepEqual(
  plain({url:legacy.url,llb:legacy._llbounds,workPreviewURL:legacy._workPreviewURL}),firstState,
  'a segunda passagem da migração deve ser idempotente'
);

/* Simula o objeto reconstruído na segunda abertura. O arquivo persiste só a
   versão WM; isso basta para impedir double warp e evita duplicar a ortofoto. */
const reopened={
  url:firstState.url,b:B.slice(),_warpWM:true,_llbounds:plain(firstState.llb),visible:true
};
S.img=reopened;
await testContext.__orthoTest.migrate(reopened,WORK_CRS);
assert.equal(testContext.__orthoTest.warpCalls(),1,
  'reabrir o projeto migrado não pode reprojetar novamente o preview WM');
assert.deepEqual(plain(reopened._llbounds),firstState.llb,'a segunda abertura deve manter os mesmos limites de tela');
assert.equal(reopened._workPreviewURL,undefined,'a segunda abertura não deve duplicar o bitmap UTM no projeto');

const loadDeclaration=functionDeclaration(persistenceSource,'loadProject');
const projectDataDeclaration=functionDeclaration(persistenceSource,'projectData');
assert.match(loadDeclaration,/orthoMigrateLegacyPreview\s*\(/,
  'loadProject deve acionar automaticamente a migração da ortofoto legada');
assert.doesNotMatch(loadDeclaration,/L2\.imageOverlay\(d\.img\.url\s*,\s*ll/,
  'loadProject ainda instala diretamente o preview UTM no overlay antigo');
assert.doesNotMatch(projectDataDeclaration,/workPreviewURL\s*:/,
  'projectData não deve duplicar a representação UTM dentro do .ccmgis');
assert.match(layoutSource,/_workPreviewURL/,
  'durante a primeira sessão o Layout deve preferir a representação UTM temporária');
assert.match(layoutSource,/layoutOrthoWarpInfo\s*\(/,
  'ao reabrir apenas com a versão WM, o Layout deve usar a transformação inversa existente');

console.log('OK: projeto legado migra a ortofoto para WM no 2D, mantém alinhamento no Layout sem duplicar bytes e não sofre dupla reprojeção.');
