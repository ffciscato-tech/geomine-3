import fs from 'node:fs';
import vm from 'node:vm';

const rasterPath='src/core/parts/20-raster-dem.js';
const layoutPath='src/core/parts/17-layout-printing.js';
const rasterSrc=fs.readFileSync(rasterPath,'utf8');
const layoutSrc=fs.readFileSync(layoutPath,'utf8');

function fail(msg){ throw new Error(msg); }
function extractBetween(src,start,after){
  const i=src.indexOf(start);
  if(i<0)fail('função rasterURLPlot não encontrada');
  const j=src.indexOf(after,i);
  if(j<0)fail('fim da função rasterURLPlot não encontrado');
  return src.slice(i,j+2);
}

const fnSrc=extractBetween(
  rasterSrc,
  'async function rasterURLPlot(r){',
  '\n}\n\n/* Reprojeta a grade de exibição'
);

let canvasCalls=0;
const grid={
  nc:4,nr:3,cs:10,csy:20,xll:500,yll:1000,
  z:new Float32Array(12).fill(1)
};
const context={
  gridProd:async()=>grid,
  rasterBounds:(_r,g)=>[g.xll,g.yll,g.xll+g.nc*g.cs,g.yll+g.nr*(g.csy||g.cs)],
  reduceGrid:g=>g,
  rasterCanvas:()=>({toDataURL:()=>`data:image/png;plot-${++canvasCalls}`}),
  showLoad:()=>{},hideLoad:()=>{},setTimeout,
  PLOT_MAX_CELLS:1_000_000,PLOT_MAX_SIDE:4096,
  globalThis:null
};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(`${fnSrc}\nglobalThis.__rasterURLPlot=rasterURLPlot;`,context);

const r={
  name:'DEM teste',d:grid,_url:'data:image/png;mapa-web-mercator',_rev:1,
  style:{mode:'hipso',opacity:1,classes:[]}
};
const primeira=await context.__rasterURLPlot(r);
if(primeira===r._url)fail('Layout reutilizou o bitmap Web Mercator do Mapa 2D');
if(canvasCalls!==1)fail('bitmap próprio do Layout não foi gerado');
if(String(r._urlPlotBounds)!=='500,1000,540,1060')fail('bounds do CRS de trabalho incorretos');

const segunda=await context.__rasterURLPlot(r);
if(segunda!==primeira||canvasCalls!==1)fail('cache da plotagem não foi reutilizado');
r._rev++;
const terceira=await context.__rasterURLPlot(r);
if(terceira===primeira||canvasCalls!==2)fail('revisão do raster não invalidou o cache do Layout');

if(layoutSrc.includes('url=ob._url'))
  fail('Layout ainda possui fallback para o bitmap Web Mercator');
if(!/const\s+gw\s*=\s*gradeParaTela\(baseGrid(?:\s*,[^)]*)?\)/.test(rasterSrc))
  fail('Mapa 2D deixou de reprojetar sua grade para Web Mercator');

console.log('OK: Mapa 2D e Layout usam bitmaps separados nos respectivos CRS.');
