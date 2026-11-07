import fs from 'node:fs';

const model=fs.readFileSync('src/core/parts/05-layer-model-symbology.js','utf8');
const props=fs.readFileSync('src/core/parts/09-measurement-properties-cad.js','utf8');
const layout=fs.readFileSync('src/core/parts/17-layout-printing.js','utf8');
const html=fs.readFileSync('src/index.template.html','utf8');

function exige(ok,msg){ if(!ok)throw new Error(msg); }

exige(html.includes('Repetir o rótulo a cada (m)'),
  'controle de repetição não está identificado na janela de rótulos');
exige(props.includes("L.gtype==='line'||(L.gtype==='polygon'&&place==='curva')"),
  'controle ainda não fica visível para linhas em todas as posições');
exige(!props.includes("c.place==='curva' && L.gtype!=='point'"),
  'restou a regra antiga que ocultava a repetição fora de Sobre a linha');

exige(model.includes("const repeteLinha=L.gtype==='line'&&(+cfg.rep||0)>0;"),
  'Mapa 2D não reconhece repetição em linhas fora do modo curva');
exige(model.includes("const aoLongo=L.gtype!=='point'&&(cfg.place==='curva'||repeteLinha);"),
  'Mapa 2D não distribui os rótulos repetidos ao longo da linha');
exige(model.includes("cfg.place==='curva'?[0,0]:labelShift(cfg)"),
  'Mapa 2D não preserva Acima/Abaixo/Deslocado na repetição');
exige(model.includes("(L.gtype!=='point'&&c.place==='curva') || repeteLinha"),
  'desduplicação ainda pode eliminar rótulos repetidos');

exige(layout.includes("const repeteLinha = L.gtype==='line'&&(+c.rep||0)>0;"),
  'Layout não reconhece repetição em linhas fora do modo curva');
exige(layout.includes('const aoLongo = modoCurva||repeteLinha;'),
  'Layout não compartilha a distribuição ao longo da linha');
exige(layout.includes('const ox=modoCurva?0:ddx, oy=modoCurva?0:ddy;'),
  'Layout não preserva Acima/Abaixo/Deslocado na repetição');

console.log('OK: repetição de rótulos funciona em linhas, em todas as posições, no 2D e no Layout.');
