#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const cadPath=path.join(root,'src/core/parts/09-measurement-properties-cad.js');
const menuPath=path.join(root,'src/core/parts/16-vector-export.js');
const cad=fs.readFileSync(cadPath,'utf8');
const menu=fs.readFileSync(menuPath,'utf8');
const selector=fs.readFileSync(path.join(root,'src/core/parts/12-feature-selection-vertices.js'),'utf8');

const ini=cad.indexOf('function dxfSan(');
const fim=cad.indexOf('function cadExportDXF()',ini);
if(ini<0||fim<0)throw new Error('Gerador DXF não localizado');

const ctx={
  S:{workCRS:'EPSG:31983'},
  reproj:(_src,_dst,x,y)=>[x,y],
  isFinite,
  Set,
  Math,
  String,
  Array
};
vm.createContext(ctx);
const rz0=selector.indexOf('function resolveFeatureZRing('),
  rz1=selector.indexOf('function showVertices()',rz0);
if(rz0<0||rz1<0)throw new Error('Resolvedor Z não localizado');
vm.runInContext(selector.slice(rz0,rz1),ctx);
vm.runInContext(cad.slice(ini,fim)+'\nthis.dxfFromLayers=dxfFromLayers;',ctx);

const dxf=ctx.dxfFromLayers([{
  name:'Cava 3D',crs:'EPSG:31983',gtype:'line',features:[
    {geom:[[100,200],[110,210],[120,220]],zg:[820,819.5,819],props:{}},
    {geom:[[200,300,701.25],[210,310,702.5]],props:{}},
    {geom:[[300,400],[310,410]],props:{COTA:655.75}},
    /* edição antiga: cinco XY e somente duas cotas; o DXF deve reparar */
    {geom:[[0,500],[10,500],[20,500],[30,500],[40,500]],zg:[10,6],props:{}}
  ]
},{
  name:'Pontos 3D',crs:'EPSG:31983',gtype:'point',features:[
    {geom:[[1,2,777.125]],props:{}}
  ]
}]);

function ok(cond,msg){if(!cond)throw new Error(msg);}
function hasPair(code,value){return dxf.includes('\n'+code+'\n'+value+'\n');}

ok(dxf.includes('0\nPOLYLINE\n'),'faltou POLYLINE');
ok(dxf.includes('\n70\n8\n'),'polilinha aberta não está marcada como 3D');
ok(dxf.includes('\n70\n32\n'),'vértices não estão marcados como 3D');
for(const z of ['820.000','819.500','819.000','701.250','702.500','655.750',
  '10.000','9.000','8.000','7.000','6.000','777.125'])
  ok(hasPair('30',z),'cota Z ausente no DXF: '+z);
ok(dxf.endsWith('0\nEOF\n'),'DXF sem término EOF');

ok(cad.includes('4 = DXF 3D (cotas Z por vértice)'),'DXF 3D ausente no seletor da camada ativa');
ok(cad.includes("else if(kind==='4')"),'ramo DXF 3D ausente em exportLayerAs');
ok(menu.includes('DXF 3D — cava/pilha'),'atalho paramétrico ausente no modo Exportação');

for(const rel of [
  'src/core/parts/22-mine-pit-design.js',
  'src/modules/mining/alagis-cava-parametrica-preservada.js'
]){
  const src=fs.readFileSync(path.join(root,rel),'utf8');
  ok(src.includes('camadas.slice().reverse().find(q=>q._rb31Recipe'),
    rel+': exportação não recupera projeto paramétrico reaberto');
  ok(src.includes("C._rb31CutOf=corteId"),
    rel+': camada cortada não está associada ao projeto de origem');
}

console.log('OK — DXF R12 3D preserva zg, Z geométrico e COTA; menu Exportação integrado');
