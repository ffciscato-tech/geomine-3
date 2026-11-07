#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),core=fs.readFileSync(path.join(root,
  'src/core/parts/22-mine-pit-design.js'),'utf8');

const p0=core.indexOf('function cavaPoligonos()'),p1=core.indexOf('\nfunction cavaRingWork(',p0),
  i0=core.indexOf('function cavaItemSelecionado()'),i1=core.indexOf('\nfunction cavaNovoId(',i0);
assert(p0>=0&&p1>p0&&i0>=0&&i1>i0,'funções de seleção do limite não encontradas');

const aberto={id:'dce',name:'DCE',gtype:'line',crs:'EPSG:31983',visible:true,
  _cavaLimiteDin:true,features:[{geom:[[0,0],[20,0],[20,10],[0,10]],props:{}}]},
  comum={id:'linha',name:'Linha aberta comum',gtype:'line',visible:true,
    features:[{geom:[[0,0],[5,0],[5,5]],props:{}}]},
  fields={cavaBaseSel:{value:'selected'}},
  ctx={console,document:{getElementById:id=>fields[id]||null},
    S:{layers:[aberto,comum],selFeat:{layer:aberto,idx:0}},esc:x=>String(x)};
vm.createContext(ctx);vm.runInContext(core.slice(p0,p1)+core.slice(i0,i1),ctx);

const candidatos=ctx.cavaPoligonos();
assert.equal(candidatos.length,1,'somente o ◈ pode entrar aberto como limite');
assert.equal(candidatos[0].L,aberto);
assert(candidatos[0].label.includes('limite paramétrico'));
const item=ctx.cavaItemSelecionado();
assert(item&&item.L===aberto,'a seleção genérica do mapa deve aceitar o ◈ aberto');
console.log('OK: botão e seletor aceitam diretamente uma camada ◈ mesmo com metadado de linha aberta.');
