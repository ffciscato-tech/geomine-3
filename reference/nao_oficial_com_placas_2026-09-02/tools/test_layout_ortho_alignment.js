#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert');

const root=path.resolve(__dirname,'..');
const file=path.join(root,'src/core/parts/17-layout-printing.js');
const src=fs.readFileSync(file,'utf8');

const ini=src.indexOf('function layoutOrthoWarpInfo');
const fim=src.indexOf('\n\nasync function buildLayout',ini);
assert(ini>=0 && fim>ini,'auxiliares de alinhamento da ortofoto não encontrados');

/* Transformação afim deliberadamente rotacionada: comprova que os quatro
   cantos são preservados e que o teste não aceita um simples SW/NE. */
const ctx={
  fromWGS(_crs,lon,lat){ return [2*lon+3*lat+10,-lon+4*lat-5]; },
  Number,Array,Math
};
vm.createContext(ctx);
vm.runInContext(src.slice(ini,fim)+'\nthis.info=layoutOrthoWarpInfo;this.bounds=layoutOrthoBoundsWork;',ctx);

const img={
  b:[100,200,300,400],
  _warpWM:true,
  _llbounds:[[-20,-47],[-19,-46]]
};
const got=ctx.info(img,'EPSG:31983');
assert(got,'prévia warpada deve produzir os cantos reais');
assert.deepStrictEqual(Array.from(got.ll[0]),[-20,-47]);
assert.deepStrictEqual(Array.from(got.ll[1]),[-19,-46]);

const esperado=[
  ctx.fromWGS('',-47,-19),ctx.fromWGS('',-46,-19),
  ctx.fromWGS('',-47,-20),ctx.fromWGS('',-46,-20)
];
const xs=esperado.map(p=>p[0]), ys=esperado.map(p=>p[1]);
assert.deepStrictEqual(Array.from(got.bounds),[
  Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)
]);
assert.deepStrictEqual(Array.from(ctx.bounds({_warpWM:false,b:[1,2,3,4]},'EPSG:31983')),[1,2,3,4],
  'imagem não warpada deve continuar usando seu limite original');

assert(src.includes('layoutOrthoBoundsWork(S.img,crs)'),
  'a extensão automática da prancha deve usar o limite real da prévia');
assert(src.includes('orthoWarp=layoutOrthoWarpInfo(ob,crs)'),
  'o fallback do projeto reaberto deve reconhecer a prévia Web Mercator');
assert(src.includes('transform="matrix(${a.toFixed(6)} ${b.toFixed(6)} ${c.toFixed(6)} ${d.toFixed(6)}'),
  'a prancha deve preservar a rotação dos quatro cantos');
assert(src.includes('if(wi)bWGS=wi.ll'),
  'a publicação deve reutilizar os mesmos limites WGS84 do Mapa 2D');

console.log('OK layout ortofoto: prévia salva mantém posição e rotação do Mapa 2D');
