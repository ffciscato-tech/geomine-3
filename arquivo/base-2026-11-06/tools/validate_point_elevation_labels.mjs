import fs from 'node:fs';
import vm from 'node:vm';

const model=fs.readFileSync('src/core/parts/05-layer-model-symbology.js','utf8');
const layout=fs.readFileSync('src/core/parts/17-layout-printing.js','utf8');
const tin=fs.readFileSync('src/core/parts/25-geoprocessing-tin.js','utf8');
const raster=fs.readFileSync('src/core/parts/20-raster-dem.js','utf8');
const props=fs.readFileSync('src/core/parts/09-measurement-properties-cad.js','utf8');
const persistence=fs.readFileSync('src/core/parts/26-project-persistence.js','utf8');
const template=fs.readFileSync('src/index.template.html','utf8');

function fail(msg){throw new Error(msg);}
function trecho(src,inicio,fim){
  const i=src.indexOf(inicio),j=src.indexOf(fim,i);
  if(i<0||j<0)fail(`trecho não encontrado: ${inicio}`);
  return src.slice(i,j);
}

const cfgSrc=trecho(model,'function defaultLabelCfg(){','/* ==========================================================================\n   FÓRMULAS SEGURAS');
const geomSrc=trecho(model,'const GEOM_CAMPOS={','/* Decide se a fei');
const labelSrc=trecho(model,'function labelPassaFiltro(L, f, c','/* Rótulo em HTML');
const uniqueSrc=trecho(model,'function labelUniqueSet(L){','/* Pontos de r');

const context={
  S:{workCRS:'EPSG:31982'},
  toWGS:(_crs,x,y)=>[x,y],fromWGS:(_crs,x,y)=>[x,y],
  featureVisible:()=>true,labelFormulaTexto:()=>null,console
};
vm.createContext(context);
vm.runInContext(`${cfgSrc}\n${geomSrc}\n${labelSrc}\n${uniqueSrc}\n`+
  `globalThis.api={labelCfg,labelText,labelUniqueSet,pointGeomCoords,geomValor,geomCamposDe};`,context);

const L={
  gtype:'point',crs:'EPSG:31982',labelField:'COTA',labelFields:['COTA'],
  lbl:{...vm.runInContext('defaultLabelCfg()',context),dec:0,unique:true},
  features:[
    {geom:[[0,0]],zg:[100.2],props:{COTA:100.2}},
    {geom:[[1,1]],zg:[100.4],props:{COTA:100.4}},
    {geom:[[2,2],[3,3]],zg:[200,201],props:{COTA:null}}
  ]
};

if(context.api.labelUniqueSet(L)!==null)fail('cotas pontuais ainda foram desduplicadas');
if(context.api.labelCfg(L).unique!==false)fail('projeto antigo com unique=true não foi migrado');
if(context.api.labelText(L,L.features[0],0,0)!=='100'||context.api.labelText(L,L.features[1],1,0)!=='100')
  fail('caso de cotas distintas arredondadas ao mesmo texto não foi preservado');
if(context.api.pointGeomCoords(L.features[2].geom).length!==2)fail('MultiPoint não foi normalizado');
if(context.api.labelText(L,L.features[2],2,0)!=='200'||context.api.labelText(L,L.features[2],2,1)!=='201')
  fail('Z da geometria não completou todos os pontos do MultiPoint');
if(!context.api.geomCamposDe('point').includes('$Z'))fail('$Z não aparece entre os campos geométricos de ponto');

// Pontos nominais repetidos também são observações distintas. Este é o caso
// real de duas estações SISMICA/EFLUENTE no projeto de monitoramento.
const P={gtype:'point',crs:'EPSG:31982',labelField:'TIPO',labelFields:['TIPO'],
  lbl:{...vm.runInContext('defaultLabelCfg()',context),unique:true},features:[
    {geom:[[0,0]],props:{TIPO:'EFLUENTE'}},{geom:[[1,1]],props:{TIPO:'EFLUENTE'}}]};
if(context.api.labelUniqueSet(P)!==null||context.api.labelCfg(P).unique!==false)
  fail('camada pontual genérica ainda apaga nomes repetidos');
if(P.features.map((f,i)=>context.api.labelText(P,f,i,0)).join('|')!=='EFLUENTE|EFLUENTE')
  fail('nem todo ponto nominal conserva seu texto');

// O mesmo nome em linha continua podendo ser reunido.
const Q={gtype:'line',crs:'EPSG:31982',labelField:'NOME',labelFields:['NOME'],
  lbl:{...vm.runInContext('defaultLabelCfg()',context),unique:true},features:[
    {geom:[[0,0],[5,0]],props:{NOME:'A'}},{geom:[[0,1],[10,1]],props:{NOME:'A'}}]};
const uq=context.api.labelUniqueSet(Q);
if(!uq||uq.size!==1||context.api.labelCfg(Q).unique!==true)
  fail('deduplicação de linhas foi alterada indevidamente');

// Lacunas de Z não podem deslocar valores nem virar cota zero depois do JSON.
for(const zg of [[100,Number.NaN,200],[100,null,200]]){
  const F={geom:[[0,0],[1,1],[2,2]],zg,props:{COTA:null}};
  const got=[0,1,2].map(i=>context.api.geomValor(L,F,'$Z',i));
  if(got[0]!==100||got[1]!==null||got[2]!==200)
    fail('lacuna de Z desalinhou um MultiPoint: '+JSON.stringify(got));
}

if(!model.includes('pointGeomCoords(f.geom).forEach(pt=>'))fail('Mapa 2D não desenha Point/MultiPoint pela mesma normalização');
if(!model.includes("pane:paneNome, icon:L2.divIcon({className:'gc-pt'"))fail('símbolo de ponto ainda ignora o pane da camada');
if(!model.includes("labelText(L,f,idx,pointIndex)"))fail('Mapa 2D não calcula um rótulo para cada ponto');
if(!layout.includes("labelText(L,f,undefined,pointIndex)"))fail('Layout não calcula um rótulo para cada ponto');
if(!tin.includes("place:'offset', dx:8, dy:-8, unique:false"))fail('Pontos cotados ainda nascem com deduplicação');
if(raster.includes("panelDaCamada('R:'+r.id)"))fail('TIN ainda usa um pane diferente da árvore de camadas');
if(!props.includes("c.unique=L.gtype==='point'?false:"))fail('painel ainda pode religar deduplicação em pontos');
if(!template.includes('id="lbPointUniqueHint"'))fail('painel não explica a política de rótulo pontual');
if(!persistence.includes("...(o.gtype==='point'?{unique:false}:{})"))fail('projeto antigo não migra pontos ao abrir');
if(!persistence.includes('const zGeom='))fail('reparo de ponto plano ainda descarta o Z legado');

console.log('OK: todo ponto conserva seu rótulo no 2D/Layout; linhas mantêm deduplicação; MultiPoint e Z legado foram preservados.');
