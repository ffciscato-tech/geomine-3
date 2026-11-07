#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const sel=fs.readFileSync(path.join(root,'src/core/parts/12-feature-selection-vertices.js'),'utf8');
const v3=fs.readFileSync(path.join(root,'src/core/parts/21-profiles-and-3d.js'),'utf8');
const ed=fs.readFileSync(path.join(root,'src/core/parts/27-vector-editor.js'),'utf8');

const ini=sel.indexOf('function resolveFeatureZRing('),fim=sel.indexOf('function showVertices()',ini);
if(ini<0||fim<0)throw new Error('resolvedor Z não localizado');
const ctx={Number,String,Object,Array,Math};vm.createContext(ctx);
vm.runInContext(sel.slice(ini,fim)+'\nthis.resolveFeatureZRing=resolveFeatureZRing;',ctx);
const resolve=ctx.resolveFeatureZRing;
const ok=(x,m)=>{if(!x)throw new Error(m);};

/* Reproduz o defeito real encontrado: quatro XY novos sem quatro Z novos. */
const ring=Array.from({length:142},(_,i)=>[300000+i,7698000+Math.sin(i/8)]);
const dce={geom:ring,props:{COTA:820},zg:Array(138).fill(820)};
const zd=resolve(dce,ring,0,false,true);
ok(zd.length===142&&dce.zg.length===142,'DCE não recuperou todos os 142 Z');
ok(zd.every(z=>z===820),'cota constante da DCE variou durante o reparo');

/* Em rampa sem COTA constante, novos vértices conservam a inclinação pela
   distância acumulada entre as cotas extremas. */
const rr=[[0,0],[10,0],[20,0],[30,0],[40,0]],rampa={geom:rr,props:{COTA:null},zg:[820,818,816]};
const zr=resolve(rampa,rr,0,false,true);
ok(zr.length===5,'rampa não recebeu Z em todos os vértices');
ok(Math.abs(zr[0]-820)<1e-9&&Math.abs(zr[2]-818)<1e-9&&Math.abs(zr[4]-816)<1e-9,
  'declividade da rampa não foi interpolada corretamente');

const sup={geom:[[0,0],[1,0],[2,0]],props:{COTA_SUP:735},zg:null};
ok(resolve(sup,sup.geom,0,false,true).every(z=>z===735),'COTA_SUP não foi reconhecida');

const emb={geom:[[0,0],[1,0,901],[2,0]],props:{COTA:900},zg:[900,900,900]};
ok(resolve(emb,emb.geom,0,false,true)[1]===901,'Z explícito do vértice foi descartado');

ok(v3.includes("resolveFeatureZRing(f,ring,ri,nested,true)"),
  'Visão 3D não usa o resolvedor de cotas');
ok(v3.includes("'COTASUP'"),'Visão 3D não reconhece COTA_SUP');
ok(ed.includes('resolveFeatureZRing(f,r,ri,nested,true)'),
  'Editor vetorial não sincroniza XY e Z');

console.log('OK: edição conserva/repara Z; DCE 142/138 volta integralmente à cota 820.');
