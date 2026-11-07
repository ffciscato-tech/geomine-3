#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..'),
  rel='src/core/parts/27-vector-editor.js',
  src=fs.readFileSync(path.join(root,rel),'utf8'),
  ini=src.indexOf('function clipLinhaFechada('),
  fim=src.indexOf('\n/* ============================================================================\n   OPERAÇÕES BOOLEANAS',ini);
assert(ini>=0&&fim>ini,'motor de Clip por linha fechada não encontrado');

const ctx={
  S:{workCRS:'EPSG:31983'},
  reproj(crsA,crsB,x,y){return [x,y];},
  edArea(r){let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=r[j][0]*r[i][1]-r[i][0]*r[j][1];return a/2;},
  edInRing(p,r){let d=false;for(let i=0,j=r.length-1;i<r.length;j=i++){
    const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&
      p[0]<(b[0]-a[0])*(p[1]-a[1])/((b[1]-a[1])||1e-12)+a[0])d=!d;
  }return d;},
  layerToMP(){throw new Error('não deve converter a máscara linear como polígono de origem');}
};
vm.createContext(ctx);vm.runInContext(src.slice(ini,fim),ctx);

const aberta={gtype:'line',crs:'EPSG:31983',features:[{geom:[[0,0],[10,0],[10,10],[0,10]],props:{}}]},
  quadrado={gtype:'line',crs:'EPSG:31983',features:[{geom:[[0,0],[10,0],[10,10],[0,10],[0,0]],props:{}}]};
assert.equal(ctx.clipCamadaTemMascara(aberta),false,'linha aberta não pode virar máscara silenciosamente');
assert.equal(ctx.clipCamadaTemMascara(quadrado),true,'linha fechada deve ser aceita como máscara');

function corta(mask,geom,zg=[95,115],classe='rb31-crista'){
  const A={gtype:'line',crs:'EPSG:31983',features:[{geom,zg,props:{CLASSE:classe,TIPO:'Crista de banco'}}]};
  return ctx.clipLinhasPeloMP(A,ctx.clipMascaraMP(mask));
}
let out=corta(quadrado,[[-5,5],[15,5]]);
assert.equal(out.length,1,'travessia do quadrado deve produzir um trecho interno');
assert.deepEqual(JSON.parse(JSON.stringify(out[0].geom)),[[0,5],[10,5]],'clip deve terminar exatamente na borda');
assert.deepEqual(JSON.parse(JSON.stringify(out[0].zg)),[100,110],'cota deve ser interpolada nos dois cortes');
assert.equal(out[0].props.CLASSE,'rb31-crista','atributos da linha devem ser preservados');

const concava={gtype:'line',crs:'EPSG:31983',features:[{geom:
  [[0,0],[4,0],[4,4],[3,4],[3,1],[1,1],[1,4],[0,4],[0,0]],props:{}}]};
out=corta(concava,[[-1,2],[5,2]],[820,826]);
assert.equal(out.length,2,'reentrância côncava deve separar os dois trechos internos');
const arred=v=>Math.round(v*1e8)/1e8;
assert.deepEqual(JSON.parse(JSON.stringify(out.map(f=>f.geom.map(p=>p.map(arred))))),
  [[[0,2],[1,2]],[[3,2],[4,2]]],'nenhum trecho pode atravessar o lado externo da reentrância');

const invertida={...concava,features:[{geom:concava.features[0].geom.slice().reverse(),props:{}}]};
const inv=corta(invertida,[[-1,2],[5,2]],[820,826]);
assert.deepEqual(JSON.parse(JSON.stringify(inv.map(f=>f.geom.map(p=>p.map(arred))))),
  JSON.parse(JSON.stringify(out.map(f=>f.geom.map(p=>p.map(arred))))),'o sentido do anel não pode trocar dentro por fora');

const outer=[[0,0],[10,0],[10,10],[0,10],[0,0]],hole=[[4,0],[6,0],[6,10],[4,10],[4,0]],
  A={gtype:'line',crs:'EPSG:31983',features:[{geom:[[-1,5],[11,5]],props:{TIPO:'Interseção cava × terreno'}}]},
  furado=ctx.clipLinhasPeloMP(A,[[outer,hole]]);
assert.deepEqual(JSON.parse(JSON.stringify(furado.map(f=>f.geom.map(p=>p.map(arred))))),
  [[[0,5],[4,5]],[[6,5],[10,5]]],'furos da máscara também devem ser respeitados');
assert.equal(ctx.clipClasseConstrutiva({props:{CLASSE:'rb31-inicio'}}),'rb31-rampa');
assert.equal(ctx.clipClasseConstrutiva({props:{CLASSE:'daylight'}}),'rb31-inter');

console.log('OK: Clip aceita linha fechada, conserva apenas o interior côncavo e preserva Z/classes.');
