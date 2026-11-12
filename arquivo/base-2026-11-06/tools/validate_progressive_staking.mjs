import fs from 'node:fs';
import vm from 'node:vm';

const tin=fs.readFileSync('src/core/parts/25-geoprocessing-tin.js','utf8');
const boot=fs.readFileSync('src/core/parts/26-project-persistence.js','utf8');

function fail(msg){throw new Error(msg);}
function trecho(src,inicio,fim){
  const i=src.indexOf(inicio),j=src.indexOf(fim,i);
  if(i<0||j<0)fail(`trecho não encontrado: ${inicio}`);
  return src.slice(i,j);
}

const bindSrc=trecho(tin,'function bindEstPanel(){','/* ==================== PONTOS COTADOS');
const ids=['btnEst','btnEstPerf','btnEstPick','estLinha','estSurf','estZ','estModalClose'];
const els=Object.fromEntries(ids.map(id=>[id,{}]));
const handlers={
  estGerar(){},estPerfil(){},estPickToggle(){},estZinfo(){},fechaEstModal(){}
};
const bootLine=boot.split('\n').find(line=>line.includes('bindProfPanel(); bindGeoPanel();'));
if(!bootLine)fail('sequência real de boot não encontrada');
let cliqueBoot=0;
handlers.estGerar=()=>{cliqueBoot++;};
const bindContext={document:{getElementById:id=>els[id]||null},...handlers};
for(const nome of ['bindProfPanel','bindGeoPanel','bindCotPanel','bind3DPanel','bindCubPanel',
  'bindBishopPanel','bindGtPanel','bindOverlayPanel','bindCadPanel','bindVecOpsPanel','bindSurfOpsPanel'])
  bindContext[nome]=()=>{};
vm.createContext(bindContext);
vm.runInContext(`${bindSrc}\n${bootLine}`,bindContext);
for(const [id,evento,nome] of [
  ['btnEst','onclick','estGerar'],['btnEstPerf','onclick','estPerfil'],
  ['btnEstPick','onclick','estPickToggle'],['estLinha','onchange','estZinfo'],
  ['estSurf','onchange','estZinfo'],['estZ','onchange','estZinfo'],
  ['estModalClose','onclick','fechaEstModal']
]){
  if(els[id][evento]!==handlers[nome])fail(`${id}.${evento} não foi ligado a ${nome}`);
}
els.btnEst.onclick();
if(cliqueBoot!==1)fail('o clique do botão não chegou a estGerar pelo boot real');

// Caso real mínimo: linha estritamente 2D e cota vinda do MDT. Além do wiring,
// garante que o gerador produz a camada e não exige Z na geometria da linha.
const gerarSrc=trecho(tin,'function estTracado(L){','/* manda o traçado para a aba Perfis */');
const sampleSrc=trecho(tin,'function sampleZbil(d,x,y){','function sampleZnear(d,x,y){');
const controls={
  estStakeOut:{innerHTML:''},estLinha:{value:'linha-1'},estInt:{value:'10'},
  estIni:{value:'100'},estZ:{value:'surf'},estSurf:{value:'mdt-1'},
  estFmt:{value:'km'},estDecl:{checked:true},estRot:{value:'sim'},
  btnEst:{},btnEstPerf:{},btnEstPick:{},estModalClose:{}
};
let criada=null;
const line={id:'linha-1',name:'Vias de Acesso',gtype:'line',crs:'EPSG:31983',features:[
  {multi:false,geom:[[5,15],[25,15]],props:{}}
]};
const grid={nc:3,nr:3,cs:10,xll:0,yll:0,z:new Float32Array([
  70,80,90, 100,110,120, 130,140,150
])};
const context={
  S:{workCRS:'EPSG:31983',layers:[line],rasters:[{id:'mdt-1',name:'MDT',d:grid}]},
  document:{getElementById:id=>controls[id]||null},
  reproj:(_a,_b,x,y)=>[x,y],
  addLayer:o=>{criada=o;return {id:'estacas-1',...o};},
  refreshUI(){},fitLayer(){},toast(){},console,
  estPerfil(){},estPickToggle(){},estZinfo(){},fechaEstModal(){}
};
vm.createContext(context);
vm.runInContext(`${sampleSrc}\n${gerarSrc}\n${bindSrc}\nbindEstPanel();`,context);
controls.btnEst.onclick();

if(!criada)fail('linha 2D + MDT não gerou uma camada de estacas');
if(criada.gtype!=='point'||criada.features.length!==3)
  fail(`esperadas 3 estacas; recebido: ${criada.features?.length}`);
if(criada.features.some(f=>!Number.isFinite(f.props.COTA)))
  fail('uma estaca ficou sem cota amostrada no MDT');
if(criada.features.map(f=>f.props.PROG_M).join(',')!=='100,110,120')
  fail('progressivas foram calculadas incorretamente');
if(criada.features.map(f=>f.props.COTA).join(',')!=='100,110,120')
  fail('amostragem bilinear real do MDT foi calculada incorretamente');
if(criada.features.map(f=>String(f.props.DECL_PC)).join(',')!=='null,100,100')
  fail('declividades das estacas foram calculadas incorretamente');
if(context.S._est?.est?.length!==3||context.S._est?.rasterId!=='mdt-1')
  fail('resultado e MDT escolhido não ficaram disponíveis para o perfil');

// O botão inferior precisa transferir o eixo para o formato lido por
// runProfile, conservar o MDT escolhido e capturar rejeições assíncronas.
const perfilSrc=trecho(tin,'function estPerfil(){','/* Escolha da linha por toque no mapa');
controls.prName={value:''};controls.prRasterSel={value:''};
let timer=null,view=null,perfilChamado=0,erroPerfil=0,avisoPerfil=0;
Object.assign(context,{
  toWGS:(_crs,x,y)=>[x,y],
  fechaEstModal(){},ribbonClose(){},switchView:v=>{view=v;},refreshProfPanel(){},
  setTimeout:fn=>{timer=fn;return 1;},
  runProfile:async()=>{perfilChamado++;throw new Error('MDT indisponível');},
  console:{...console,error(){erroPerfil++;}},
  toast:m=>{if(String(m).includes('Traçado carregado'))avisoPerfil++;}
});
const vectorProfileSrc=trecho(tin,'function profSelectedRasters(){','function profRenderVectorSources(){');
const sourceModeSrc=trecho(tin,'function profUpdateSourceMode(mode){','function profVectorAxisSelection(layers){');
vm.runInContext(vectorProfileSrc+'\n'+sourceModeSrc+'\n'+perfilSrc,context);
context.estPerfil();
if(typeof timer!=='function')fail('perfil não agendou a abertura da área de trabalho');
timer();
await new Promise(resolve=>setImmediate(resolve));
if(view!=='perfis'||perfilChamado!==1)fail('perfil da progressiva não foi executado');
if(controls.prRasterSel.value!=='mdt-1')fail('perfil não conservou o MDT escolhido');
if(JSON.stringify(context.S.prof.buf)!==JSON.stringify([[15,5],[15,25]]))
  fail('eixo não foi transferido para o buffer lido por runProfile');
if(erroPerfil!==1||avisoPerfil!==1)fail('rejeição assíncrona do perfil ficou silenciosa');

// O modo automático deve conservar as cotas geométricas usadas nas estacas,
// mesmo quando há um MDT com cotas diferentes disponível.
line.features[0].zg=[300,400];context.S._est.tr.z=[300,400];controls.estZ.value='auto';
controls.prVectorSel={value:''};context.profRenderVectorSources=()=>{};
context.estPerfil();timer();await new Promise(resolve=>setImmediate(resolve));
if(context.S.prof.sourceMode!=='vector'||controls.prVectorSel.value!=='linha-1')
  fail('perfil automático substituiu a fonte vetorial das estacas pelo MDT');
controls.estZ.value='surf';context.estPerfil();timer();await new Promise(resolve=>setImmediate(resolve));
if(context.S.prof.sourceMode!=='raster')fail('fonte explicitamente MDT não foi respeitada no perfil');

console.log('OK: botões ligados no boot; linha 2D + MDT gera progressiva, estacas e dados para o perfil.');
