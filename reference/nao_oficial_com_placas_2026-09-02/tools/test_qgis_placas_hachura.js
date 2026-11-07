#!/usr/bin/env node
'use strict';
/* O importador de projeto do QGIS lia apenas a COR do símbolo. Num plano de
   trânsito isso perdia o essencial: a PLACA (RasterMarker com a imagem
   embutida) e a HACHURA do pátio (LinePatternFill). Este teste fixa a leitura
   do símbolo — inclusive a distinção entre a linha que é CONTORNO de um
   preenchimento e a linha que é a própria feição linear. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),file=path.join(root,'src/core/parts/03-file-loading-qgis.js'),
  full=fs.readFileSync(file,'utf8');
const ini=full.indexOf('const QGS_MM2PX');
const fim=full.indexOf('function applyQGSProject');
assert(ini>0 && fim>ini, 'bloco de leitura de símbolo do QGIS não encontrado');
const ctx={console,Math,Number,String,Object,Array,parseInt,parseFloat,isFinite,atob};
vm.createContext(ctx); vm.runInContext(full.slice(ini,fim),ctx,{filename:path.basename(file)});

/* O leitor só usa children/tagName/getAttribute — um XML de mentira basta e
   mantém o teste sem dependência de DOM. */
const opt=(name,value)=>({tagName:'Option',children:[],getAttribute:k=>k==='name'?name:k==='value'?value:null});
const camada=(cls,props,ligada)=>({tagName:'layer',
  getAttribute:k=>k==='class'?cls:k==='enabled'?(ligada===false?'0':'1'):null,
  children:[{tagName:'Option',children:Object.entries(props).map(([k,v])=>opt(k,v)),
    getAttribute:k=>k==='type'?'Map':null}]});
const simbolo=(tipo,camadas)=>({tagName:'symbol',children:camadas,
  getAttribute:k=>k==='type'?tipo:null});

/* PNG 2x1 de verdade: o leitor de proporção enxerga o cabeçalho, não o pixel. */
const png2x1='iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEklEQVR4nGP8z8DAwMDAwAAEAAn+AveAdVIYAAAAAElFTkSuQmCC';

// 1) Placa: imagem embutida vira data URL, tamanho vem em mm e a proporção sai do cabeçalho
const placa=ctx.qgsSimbolo(simbolo('marker',[camada('RasterMarker',
  {imageFile:'base64:'+png2x1, size:'5', size_unit:'MM', angle:'0'})]));
assert(placa.img.startsWith('data:image/png;base64,'),'placa deve virar data URL de PNG');
assert.strictEqual(placa.ar,2,'proporção da placa vem do cabeçalho do PNG');
assert.strictEqual(placa.ptSize,19,'5 mm a 96 dpi = 19 px');

// 2) Hachura: o ângulo do QGIS escolhe o motivo; 45° e 135° juntos viram grade
const uma=ctx.qgsSimbolo(simbolo('fill',[camada('LinePatternFill',
  {angle:'45', color:'55,126,184,255', distance:'0.8', distance_unit:'MM'})]));
assert.strictEqual(uma.hatch,'fdiagonal','45° é a hachura "/"');
assert.strictEqual(uma.fill,0,'hachura não convive com preenchimento cheio');
const grade=ctx.qgsSimbolo(simbolo('fill',[
  camada('LinePatternFill',{angle:'45', color:'55,126,184,255'}),
  camada('LinePatternFill',{angle:'135', color:'55,126,184,255'})]));
assert.strictEqual(grade.hatch,'cross','45° + 135° é grade');

// 3) A MESMA SimpleLine é contorno num preenchimento e cor numa linha
const contorno=ctx.qgsSimbolo(simbolo('fill',[
  camada('SimpleFill',{color:'253,240,0,255', outline_color:'35,35,35,255'}),
  camada('SimpleLine',{line_color:'0,0,0,255', line_width:'0.66'})]));
assert.strictEqual(contorno.color,'#fdf000','o preenchimento manda na cor do polígono');
assert.strictEqual(contorno.stroke,'#232323','a borda do SimpleFill continua sendo o contorno');
const linha=ctx.qgsSimbolo(simbolo('line',[
  camada('SimpleLine',{line_color:'31,120,180,255', line_width:'0.66', line_style:'dash'})]));
assert.strictEqual(linha.color,'#1f78b4','numa linha, a SimpleLine é a própria cor');
assert.strictEqual(linha.dash,'6 4','line_style=dash vira tracejado do CCMGIS');

// 4) Alfa da cor vira opacidade de preenchimento — é o que dá o setor a 10%
const setor=ctx.qgsSimbolo(simbolo('fill',[camada('SimpleFill',{color:'31,120,236,26'})]));
assert(Math.abs(setor.fill-26/255)<1e-6,'alfa da cor do QGIS é o preenchimento do CCMGIS');

// 5) Camada desligada no QGIS não entra
const desligada=ctx.qgsSimbolo(simbolo('fill',[
  camada('LinePatternFill',{angle:'45'},false),
  camada('SimpleFill',{color:'10,20,30,255'})]));
assert.strictEqual(desligada.hatch,undefined,'símbolo desabilitado não é lido');
assert.strictEqual(desligada.color,'#0a141e');

console.log('OK: placas, hachuras e contornos do QGIS chegam ao CCMGIS.');
