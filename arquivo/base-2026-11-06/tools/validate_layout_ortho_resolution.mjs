import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const raster=fs.readFileSync(path.join(root,'src/core/parts/20-raster-dem.js'),'utf8');
const layout=fs.readFileSync(path.join(root,'src/core/parts/17-layout-printing.js'),'utf8');
function declaration(source,name){
  const found=new RegExp('(?:async )?function '+name+'\\(').exec(source);assert.ok(found,name);
  const end=source.indexOf('\n}',found.index);assert.ok(end>found.index,name+' fecha');return source.slice(found.index,end+2);
}
const deferred=()=>{let resolve;const promise=new Promise(ok=>resolve=ok);return {promise,resolve};};
function rasterHarness({mobile=false,stopAtPixels=false}={}){
  const urls=new Map(),reads=[],canvases=[],controls={imgND:{checked:false}},S={orthoDispFull:true};let index=0;
  class Canvas{
    constructor(){this.width=0;this.height=0;canvases.push(this);}
    getContext(){const cv=this;return {createImageData(w,h){if(stopAtPixels)throw Error('pixel-budget-probe');return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)};},
      putImageData(p,x,y){if(!cv.data)cv.data=new Uint8ClampedArray(cv.width*cv.height*4);
        for(let row=0;row<p.height;row++)cv.data.set(p.data.subarray(row*p.width*4,(row+1)*p.width*4),((row+y)*cv.width+x)*4);}};}
    toDataURL(){const url='data:test,'+(++index);urls.set(url,this);return url;}
  }
  const context={S,console,Uint8Array,Uint16Array,Int16Array,Uint8ClampedArray,setTimeout,EH_MOVEL:mobile,
    document:{getElementById:id=>controls[id]||null,createElement:()=>new Canvas()}};
  context.window=context;vm.createContext(context);vm.runInContext(declaration(raster,'orthoWindow'),context);
  function source(width=1400,height=900,offset=0){
    const im={getWidth:()=>width,getHeight:()=>height,async readRasters(options){
      reads.push(options);const [x0,y0,x1,y1]=options.window,n=(x1-x0)*(y1-y0),bands=[new Uint8Array(n),new Uint8Array(n),new Uint8Array(n)];
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const k=(y-y0)*(x1-x0)+x-x0;bands[0][k]=(x+offset)%251;bands[1][k]=y%251;bands[2][k]=120;}
      return bands;}};
    return {_img0:im,_W0:width,_H0:height,b:[100,200,100+width*2,200+height*3],url:'preview-'+offset,_cache:new Map()};
  }
  return {context,S,source,urls,reads,canvases,controls};
}
let count=0;
async function test(name,fn){await fn();count++;console.log('OK · '+name);}
await test('janela nativa preserva pixels, grade global e bounds com eixos distintos',async()=>{
  const h=rasterHarness();h.S.img=h.source();const I=h.S.img,bb=[120,230,1100,1520];
  const out=await h.context.orthoWindow(bb,123),cv=h.urls.get(out.dataURL);
  assert.equal(out.resampleMethod,'nearest');assert.deepEqual(Array.from(out.bb),bb);
  for(let y=0;y<cv.height;y+=7)for(let x=0;x<cv.width;x+=9){const k=(y*cv.width+x)*4;
    assert.equal(cv.data[k],Math.floor(10+(x+.5)*(490/cv.width))%251);
    assert.equal(cv.data[k+1],Math.floor(460+(y+.5)*(430/cv.height))%251);assert.equal(cv.data[k+3],255);}
  assert.ok(h.reads.every(o=>(o.window[2]-o.window[0])*(o.window[3]-o.window[1])<=1100*520));
  const before=h.reads.length;assert.equal((await h.context.orthoWindow(bb,123)).dataURL,out.dataURL);assert.equal(h.reads.length,before);
  assert.equal(I._cache.size,1);
});
await test('nearest usa centros geográficos em redução e pixels nativos não mudam',async()=>{
  const h=rasterHarness();h.S.img=h.source(34,18);const I=h.S.img;
  const reduced=await h.context.orthoWindow(I.b,17),half=h.urls.get(reduced.dataURL);
  for(let y=0;y<half.height;y++)for(let x=0;x<half.width;x++){
    const k=(y*half.width+x)*4;assert.equal(half.data[k],2*x+1);assert.equal(half.data[k+1],2*y+1);}
  const original=await h.context.orthoWindow(I.b,34),full=h.urls.get(original.dataURL);
  for(let y=0;y<full.height;y++)for(let x=0;x<full.width;x++){
    const k=(y*full.width+x)*4;assert.equal(full.data[k],x);assert.equal(full.data[k+1],y);}
});
await test('mudar Original ou máscara invalida chave sem perder fonte original',async()=>{
  const h=rasterHarness();h.S.img=h.source(30,20);const bb=h.S.img.b;
  const original=await h.context.orthoWindow(bb,13);h.S.orthoDispFull=false;
  const smooth=await h.context.orthoWindow(bb,13);assert.notEqual(smooth.dataURL,original.dataURL);assert.equal(smooth.resampleMethod,'bilinear');
  h.controls.imgND={checked:true};h.controls.imgNDw={value:100};
  const masked=await h.context.orthoWindow(bb,13);assert.notEqual(masked.dataURL,smooth.dataURL);
});
await test('substituir TIFF com mesmo tamanho e bounds não reutiliza janela antiga',async()=>{
  const h=rasterHarness();h.S.img=h.source(30,20);const I=h.S.img;
  const old=await h.context.orthoWindow(I.b,30);
  I._img0=h.source(30,20,80)._img0;I.url='nova-previa';
  const next=await h.context.orthoWindow(I.b,30);assert.notEqual(next.dataURL,old.dataURL);
  assert.equal(h.urls.get(next.dataURL).data[0],80);
});
await test('relink durante leitura impede publicação do resultado antigo',async()=>{
  const h=rasterHarness();h.S.img=h.source(30,20);const gate=deferred(),I=h.S.img,original=I._img0.readRasters;
  I._img0.readRasters=async options=>{await gate.promise;return original(options);};
  const request=h.context.orthoWindow(I.b,30),rejected=assert.rejects(request,error=>error.name==='AbortError');
  I._img0=h.source(30,20,80)._img0;gate.resolve();await rejected;assert.equal(h.urls.size,0);
});
await test('overview usa fatores X e Y próprios e janela de origem continua exata',async()=>{
  const h=rasterHarness();h.S.img=h.source(100,80);const half=h.source(50,32)._img0,calls=[];
  h.context.GeoMineTileRuntime={overview:async(...args)=>{calls.push(args);return {im:half,fx:2,fy:2.5};},
    read:(im,options)=>im.readRasters(options)};h.S.img._tiff={};
  const out=await h.context.orthoWindow(h.S.img.b,20);assert.equal(calls.length,1);
  assert.deepEqual(Array.from(out.bb),Array.from(h.S.img.b));assert.equal(out.px,20);
  assert.ok(h.reads.every(o=>o.window[2]<=50&&o.window[3]<=32));
});
await test('zoom grande limita bitmap final e cada leitura antes de alocar pixels',async()=>{
  const h=rasterHarness({mobile:true,stopAtPixels:true});h.S.img=h.source(10000,10000);
  await assert.rejects(h.context.orthoWindow(h.S.img.b,10000),/pixel-budget-probe/);
  const cv=h.canvases[0];assert.ok(cv.width*cv.height<=4e6);assert.ok(h.reads.length===1);
  assert.ok((h.reads[0].window[2]-h.reads[0].window[0])*(h.reads[0].window[3]-h.reads[0].window[1])<600000);
});
function layoutHarness(){
  const S={projectId:'A',img:{url:'imagem',_img0:{}},_loPaper:{PW:297,PH:210},loZoom:4,_lastSVG:'antigo',_lastOrthoDpi:300,_lastSVGRevision:1};
  const calls={builds:[],timers:[],invalidated:0,downloads:[]},panel={style:{display:'flex'}};
  const c={S,console,window:{devicePixelRatio:2},Blob,clearTimeout:()=>{},setTimeout:fn=>{calls.timers.push(fn);return 1;},
    document:{getElementById:id=>id==='layout'?panel:null},loBlobInvalida:()=>calls.invalidated++,toast:()=>{},
    download:async blob=>calls.downloads.push(await blob.text())};
  c.window=c;c.devicePixelRatio=2;vm.createContext(c);
  for(const name of ['layoutInvalidateOrtho','layoutDpiTarget','layoutSourceCurrent','loZoomAutoOrtho','loBlobKey','ensureLayoutForExport','exportLayoutSVG'])
    vm.runInContext(declaration(layout,name),c);
  c.buildLayout=async options=>{calls.builds.push(options);S._lastSVG='novo';S._lastLayoutSource=S.img;S._lastLayoutSourceImage=S.img._img0;
    S._lastLayoutNative=true;S._lastLayoutURL=S.img.url;S._lastLayoutSignature=JSON.stringify([!!S.orthoDispFull,S.workCRS,S._loRenderEpoch||0]);return true;};
  return {c,S,calls,panel};
}
await test('invalidação remove SVG/DPI/cópia e invalida geração em voo',async()=>{
  const h=layoutHarness();h.c.layoutInvalidateOrtho('original substituído',false);
  assert.equal(h.S._lastSVG,null);assert.equal(h.S._lastOrthoDpi,0);assert.equal(h.S._lastLayoutNative,false);
  assert.equal(h.S._loRenderEpoch,1);assert.equal(h.calls.invalidated,1);assert.equal(h.calls.timers.length,0);
  h.c.layoutInvalidateOrtho('redesenhar');assert.equal(h.calls.timers.length,1);
});
await test('zoom de folha ultrapassa 300dpi; prévia nunca satisfaz demanda nativa',async()=>{
  const h=layoutHarness();assert.ok(h.c.layoutDpiTarget()>300);assert.equal(h.c.layoutDpiTarget(true,300),300);
  await h.c.buildLayout();h.S._lastLayoutNative=false;h.S._lastOrthoRequestDpi=3000;
  h.c.loZoomAutoOrtho();h.calls.timers.pop()();assert.equal(h.calls.builds.length,2);
});
await test('SVG exportado é refeito no estado atual mesmo existindo SVG antigo',async()=>{
  const h=layoutHarness();await h.c.exportLayoutSVG();assert.deepEqual(h.calls.downloads,['novo']);
  assert.equal(h.calls.builds[0].exporting,true);assert.equal(h.calls.builds[0].dpi,300);
});
await test('cópia usa revisão e fonte, não o comprimento do SVG',async()=>{
  const h=layoutHarness();await h.c.buildLayout();assert.equal(h.c.layoutSourceCurrent(),true);
  const old=h.c.loBlobKey();h.S._lastSVG='abcd';h.S._lastSVGRevision++;
  assert.notEqual(h.c.loBlobKey(),old);h.S.img._img0={};assert.equal(h.c.layoutSourceCurrent(),false);
});
await test('render assíncrono e exportação conferem geração antes de publicar',async()=>{
  const build=declaration(layout,'buildLayout');assert.ok((build.match(/if\(!current\(\)\)return false/g)||[]).length>=5);
  assert.match(build,/image-rendering:pixelated/);assert.match(declaration(layout,'rasterizeLayout'),/ensureLayoutForExport/);
  assert.match(declaration(layout,'copyLayoutIMG'),/renderKey!==loBlobKey\(\)/);
});
console.log('Ortofoto/Layout: '+count+' cenários aprovados.');
