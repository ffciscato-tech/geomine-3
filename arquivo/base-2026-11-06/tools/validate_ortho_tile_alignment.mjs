import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src/core/parts/20-raster-dem.js'),'utf8');
function declaration(name){
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,`função ${name} ausente`);
  const lineEnd=source.indexOf('\n',start);
  if(source.slice(start,lineEnd).trimEnd().endsWith('}'))return source.slice(start,lineEnd);
  const end=source.indexOf('\n}',start);
  assert.ok(end>start,`fim da função ${name} ausente`);
  return source.slice(source.slice(start-6,start)==='async '?start-6:start,end+2);
}

// Extensão arredondada do caso de regressão. Os pixels e marcadores são
// sintéticos: nenhum arquivo, imagem ou atributo do projeto é necessário.
const CRS='EPSG:31982', WM='EPSG:3857';
const B=[583644.77,7073403.51,586429.37,7075893.96];
const pc={console};pc.window=pc;pc.self=pc;pc.global=pc;
vm.createContext(pc);
vm.runInContext(fs.readFileSync(path.join(root,'src/vendor/proj4.min.js'),'utf8'),pc);
pc.proj4.defs(CRS,'+proj=utm +zone=22 +south +ellps=GRS80 +units=m +no_defs');
const project=(from,to,xy)=>Array.from(pc.proj4(from,to,xy));
const reproj=(from,to,x,y)=>project(from,to,[x,y]);
const toWGS=(crs,x,y)=>project(crs,'EPSG:4326',[x,y]);
const fromWGS=(crs,x,y)=>project('EPSG:4326',crs,[x,y]);
const origin=Math.PI*6378137;
function screenOf(x,y,z){
  const [wx,wy]=project(CRS,WM,[x,y]),scale=256*2**z/(2*origin);
  return [(wx+origin)*scale,(origin-wy)*scale];
}
function workAt(x,y,z){
  const scale=2*origin/(256*2**z);
  return project(WM,CRS,[x*scale-origin,origin-y*scale]);
}

const urls=new Map();let nextURL=0,imageLoads=0,nativeReads=0;
function pixels(w,h){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)};}
class Canvas{
  constructor(w=0,h=0){this._width=w;this._height=h;this._reset();}
  _reset(){this.image=pixels(this._width,this._height);}
  get width(){return this._width;}
  set width(v){this._width=v;this._reset();}
  get height(){return this._height;}
  set height(v){this._height=v;this._reset();}
  getContext(){
    const self=this;
    return {
      createImageData:pixels,
      putImageData(p){self.image={width:self.width,height:self.height,data:p.data.slice()};},
      getImageData(){return {width:self.width,height:self.height,data:self.image.data.slice()};},
      drawImage(im){
        const original=im.image||urls.get(im.src);
        assert.ok(original,'bitmap de teste desconhecido');
        self.image={width:self.width,height:self.height,data:original.data.slice()};
      }
    };
  }
  toDataURL(){
    const url=`data:image/png;synthetic,${++nextURL}`;
    urls.set(url,{width:this.width,height:this.height,data:this.image.data.slice()});
    return url;
  }
}
class Image{
  set src(value){this._src=value;this.image=urls.get(value);imageLoads++;queueMicrotask(()=>this.onload?.());}
  get src(){return this._src;}
}
const controls={imgND:{checked:true},imgNDw:{value:250},imgNDb:{value:4},imgOp:{value:.8}};
const document={getElementById:id=>controls[id]||null,createElement:()=>new Canvas()};
const map={
  getPane:()=>({style:{}}),createPane:()=>({style:{}}),removeLayer(){},
  unproject({x,y},z){
    const scale=2*origin/(256*2**z);
    const [lng,lat]=project(WM,'EPSG:4326',[x*scale-origin,origin-y*scale]);
    return {lng,lat};
  }
};
const L2={
  point:(x,y)=>({x,y}),
  imageOverlay(url,bounds,options){
    const ov={url,bounds,options,addTo:()=>ov,bringToBack:()=>ov};return ov;
  }
};
const S={workCRS:CRS};
const context={console,S,map,L2,document,Image,reproj,toWGS,fromWGS,
  zApply(){},orthoHDReset(){},orthoHDRefresh(){},setTimeout:()=>1,clearTimeout(){},
  ioSlot:async()=>{},ioLibera(){},Uint8ClampedArray,Float64Array,Math};
vm.createContext(context);
vm.runInContext(['orthoCRS','orthoSemDadoLimiares','warpCanvasWM','applyImgNoData','buildOrthoTile'].map(declaration).join('\n')+
  '\nglobalThis.test={apply:applyImgNoData,tile:buildOrthoTile};',context);

// Dimensões deliberadamente não múltiplas: a escala Y não pode ser inferida
// a partir de W0/_w. Cada pixel codifica sua coluna e linha no CRS original.
const w=640,h=569,W0=5603,H0=5007;
const original=pixels(w,h);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const k=(y*w+x)*4;
  original.data.set([5+x%240,5+y%240,25+(x+y)%200,255],k);
}
const maskOffset=(Math.floor(h*.48)*w+Math.floor(w*.48))*4;
original.data.set([255,255,255,255],maskOffset);
function makeImage(){
  return {b:B.slice(),_id:original,_w:w,_h:h,_W0:W0,_H0:H0,visible:true,
    _img0:{readRasters:async()=>{nativeReads++;throw Error('a escala deste teste deve usar a prévia');}},
    _tiff:{getImageCount:async()=>1}};
}
const failures=[];
async function check(name,fn){try{await fn();}catch(e){failures.push(`${name}: ${e.message}`);}}
function compareTile(cv,coords){
  let samples=0,wrong=0;
  const px=cv.width,esc=256/px,step=px/128;
  for(let v=0;v<px;v+=step)for(let u=0;u<px;u+=step){
    const [x,y]=workAt(coords.x*256+(u+.5)*esc,coords.y*256+(v+.5)*esc,coords.z);
    const col=(x-B[0])/(B[2]-B[0])*w,row=(B[3]-y)/(B[3]-B[1])*h;
    if(col<0||row<0||col>=w||row>=h)continue;
    // Tolerância apenas junto à fronteira da célula para a aproximação 9×9.
    if(col%1<.02||col%1>.98||row%1<.02||row%1>.98)continue;
    const q=(Math.floor(row)*w+Math.floor(col))*4,o=(v*px+u)*4;
    const expected=original.data.slice(q,q+4);
    if(expected[0]===255&&expected[1]===255&&expected[2]===255)expected[3]=0;
    const actual=cv.image.data.slice(o,o+4);
    samples++;
    if(expected[3]===0?actual[3]!==0:actual.some((a,i)=>a!==expected[i]))wrong++;
  }
  assert.ok(samples>5000,`amostragem geoespacial insuficiente: ${samples}`);
  return {samples,wrong};
}
function compareMercatorOverlay(cv,coords,I){
  const image=urls.get(I.url),ll=I._llbounds;
  const sw=project('EPSG:4326',WM,[ll[0][1],ll[0][0]]);
  const ne=project('EPSG:4326',WM,[ll[1][1],ll[1][0]]);
  const px=cv.width,esc=256/px,step=px/128,scale=2*origin/(256*2**coords.z);
  let samples=0,wrong=0;
  for(let v=0;v<px;v+=step)for(let u=0;u<px;u+=step){
    const X=(coords.x*256+(u+.5)*esc)*scale-origin;
    const Y=origin-(coords.y*256+(v+.5)*esc)*scale;
    const col=(X-sw[0])/(ne[0]-sw[0])*image.width;
    const row=(ne[1]-Y)/(ne[1]-sw[1])*image.height;
    if(col<0||row<0||col>=image.width||row>=image.height)continue;
    if(col%1<.02||col%1>.98||row%1<.02||row%1>.98)continue;
    const q=(Math.floor(row)*image.width+Math.floor(col))*4,o=(v*px+u)*4;
    const expected=image.data.slice(q,q+4),actual=cv.image.data.slice(o,o+4);
    samples++;
    if(expected[3]<8?actual[3]!==0:actual.some((a,i)=>a!==expected[i]))wrong++;
  }
  assert.ok(samples>5000,`amostragem do overlay insuficiente: ${samples}`);
  return {samples,wrong};
}

await check('máscara e representações em CRS distintos',()=>{
  S.img=makeImage();S.img._prevID={data:new Uint8ClampedArray(w*h*4).fill(19)};
  context.test.apply();
  assert.ok(S.img._workPreviewURL,'faltou preservar o bitmap original para Layout/tiles');
  assert.notEqual(S.img._workPreviewURL,S.img.url,'UTM e Web Mercator não podem compartilhar o mesmo bitmap');
  assert.ok(S.img._prevID,'faltou o ImageData da grade original');
  assert.equal(S.img._prevGrid,'source','a prévia original precisa conservar seu CRS de amostragem');
  assert.equal(S.img._prevID.data[maskOffset+3],0,'máscara sem-dado não chegou à prévia dos tiles');
  assert.equal(original.data[maskOffset+3],255,'reprocessamento alterou o pixel fonte');
  assert.equal(S.img._prevID.data[(201*w+205)*4],original.data[(201*w+205)*4],
    'a prévia dos tiles foi reprojetada ou o cache antigo foi reutilizado');
  assert.deepEqual(S.img._prevID.data,urls.get(S.img._workPreviewURL).data,
    'Layout e tiles devem receber os mesmos pixels da grade original');
  assert.equal(S.img._warpWM,true);
});

for(const px of [256,512])await check(`tile ${px}px alinhado a coordenadas UTM e centros de pixel`,async()=>{
  S.img=makeImage();S.img._crsFixo=CRS;context.test.apply();
  const z=px===256?15:14,center=screenOf((B[0]+B[2])/2,(B[1]+B[3])/2,z);
  const coords={x:Math.floor(center[0]/256),y:Math.floor(center[1]/256),z};
  const cv=new Canvas(px,px),beforeLoads=imageLoads;
  await context.test.tile(cv,coords,px,false);
  const {samples,wrong}=compareTile(cv,coords);
  assert.equal(wrong,0,`${wrong}/${samples} pixels do tile não coincidem com a grade UTM original`);
  assert.equal(imageLoads,beforeLoads,'o tile não deve decodificar a URL Web Mercator como se fosse UTM');
  assert.equal(nativeReads,0,'o zoom afastado releu desnecessariamente o GeoTIFF');
});

await check('controle negativo reproduz a dupla transformação antiga',async()=>{
  S.img=makeImage();context.test.apply();
  // O defeito anterior decodificava I.url e guardava exatamente estes pixels
  // WM em _prevID, apesar de o amostrador trabalhar na grade original UTM.
  S.img._prevID=urls.get(S.img.url);
  S.img._prevGrid='source';
  const z=15,p=screenOf((B[0]+B[2])/2,(B[1]+B[3])/2,z);
  const coords={x:Math.floor(p[0]/256),y:Math.floor(p[1]/256),z};
  const cv=new Canvas(256,256);await context.test.tile(cv,coords);
  const {samples,wrong}=compareTile(cv,coords);
  assert.ok(wrong/samples>.5,
    `controle negativo não reproduziu o deslocamento: ${wrong}/${samples} pixels diferentes`);
});

await check('reprocessamento atualiza cache e máscara',()=>{
  S.img=makeImage();context.test.apply();
  const before=S.img._prevID,oldURL=S.img._workPreviewURL;
  controls.imgND.checked=false;
  context.test.apply();
  assert.notEqual(S.img._prevID,before,'tiles conservaram o cache da máscara anterior');
  assert.equal(S.img._prevID.data[maskOffset+3],255,'desativar sem-dado não restaurou os pixels');
  assert.notEqual(S.img._workPreviewURL,oldURL,'o Layout conservou o bitmap da máscara anterior');
  controls.imgND.checked=true;
});

for(const px of [256,512])for(const warped of [false,true])await check(`fallback ${px}px (warpWM=${warped})`,async()=>{
  S.img=makeImage();context.test.apply();delete S.img._prevID;delete S.img._prevGrid;
  if(!warped)S.img.url=S.img._workPreviewURL;
  S.img._warpWM=warped;
  const z=px===256?15:14,p=screenOf((B[0]+B[2])/2,(B[1]+B[3])/2,z);
  const cv=new Canvas(px,px),beforeLoads=imageLoads,beforeReads=nativeReads;
  const coords={x:Math.floor(p[0]/256),y:Math.floor(p[1]/256),z};
  await context.test.tile(cv,coords,px,true);
  assert.equal(imageLoads,beforeLoads+1,'sem pixels originais, o fallback deve decodificar a prévia disponível');
  assert.equal(S.img._prevGrid,warped?'mercator':'source','o bitmap decodificado recebeu o CRS incorreto');
  assert.equal(nativeReads,beforeReads,'fallback da prévia tentou reler o TIFF');
  const {samples,wrong}=warped?compareMercatorOverlay(cv,coords,S.img):compareTile(cv,coords);
  assert.equal(wrong,0,`${wrong}/${samples} pixels do fallback divergem do overlay no CRS correto`);
});

await check('janela GeoTIFF conserva a escala vertical própria da pirâmide',async()=>{
  S.img=makeImage();context.test.apply();
  const iw=1601,ih=1201;
  const overview={getWidth:()=>iw,getHeight:()=>ih,readRasters:async({window:a,width,height})=>{
    nativeReads++;
    const out=[new Uint8Array(width*height),new Uint8Array(width*height),new Uint8Array(width*height)];
    for(let r=0;r<height;r++)for(let c=0;c<width;c++){
      const x=(a[0]+(c+.5)*(a[2]-a[0])/width)*W0/iw;
      const y=(a[1]+(r+.5)*(a[3]-a[1])/height)*H0/ih;
      const k=r*width+c;out[0][k]=5+Math.floor(x/24);out[1][k]=5+Math.floor(y/24);out[2][k]=128;
    }
    return out;
  }};
  S.img._img0.getWidth=()=>W0;S.img._img0.getHeight=()=>H0;
  S.img._tiff={getImageCount:async()=>2,getImage:async()=>overview};
  const z=16,p=screenOf((B[0]+B[2])/2,(B[1]+B[3])/2,z);
  const coords={x:Math.floor(p[0]/256),y:Math.floor(p[1]/256),z};
  const cv=new Canvas(256,256),before=nativeReads;
  assert.equal(await context.test.tile(cv,coords),'native');
  assert.equal(nativeReads,before+1);
  let samples=0,maxError=0;
  for(let r=20;r<236;r+=4)for(let c=20;c<236;c+=4){
    const [x,y]=workAt(coords.x*256+c+.5,coords.y*256+r+.5,z);
    const col=(x-B[0])/(B[2]-B[0])*W0,row=(B[3]-y)/(B[3]-B[1])*H0;
    if(col<0||col>=W0||row<0||row>=H0)continue;
    const k=(r*256+c)*4;
    maxError=Math.max(maxError,Math.abs(cv.image.data[k]-(5+Math.floor(col/24))),
      Math.abs(cv.image.data[k+1]-(5+Math.floor(row/24))));
    assert.equal(cv.image.data[k+3],255);samples++;
  }
  assert.ok(samples>1000);
  assert.ok(maxError<=1,`a janela nativa desviou ${maxError} unidades do gradiente georreferenciado`);
});

await check('tiles simultâneos compartilham uma única decodificação da prévia',async()=>{
  S.img=makeImage();context.test.apply();delete S.img._prevID;delete S.img._prevGrid;
  const z=15,p=screenOf((B[0]+B[2])/2,(B[1]+B[3])/2,z),before=imageLoads;
  const coords={x:Math.floor(p[0]/256),y:Math.floor(p[1]/256),z};
  await Promise.all(Array.from({length:8},()=>context.test.tile(new Canvas(256,256),coords,256,true)));
  assert.equal(imageLoads-before,1,'a imagem foi decodificada uma vez para cada tile');
  assert.ok(S.img._prevID);assert.equal(S.img._prevDecode,undefined);
});

if(failures.length)throw new Error(failures.join('\n'));
console.log('OK: ortofoto por tiles respeita o CRS original, ambos os eixos e os centros dos pixels; máscara e cache seguem a fonte atual.');
