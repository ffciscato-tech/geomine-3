import fs from "node:fs";
import crypto from "node:crypto";
import vm from "node:vm";
import { corrigeAtualizacaoPrancha } from "../src/build-overlays/geomine/layout-prancha-fix.mjs";

const [basePath, targetPath] = process.argv.slice(2);
if (!basePath || !targetPath) throw new Error("Uso: node validate_ccmgis2.mjs BASE DESTINO");

const base = fs.readFileSync(basePath, "utf8");
const target = fs.readFileSync(targetPath, "utf8");
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const count = (value, token) => value.split(token).length - 1;

function moduleBounds(html) {
  const start = html.indexOf('<style id="cava2-workspace-style">');
  const script = html.indexOf('<script id="cava2-workspace-module">', start);
  const end = html.indexOf("</script>", script);
  if (start < 0 || script < 0 || end < 0) throw new Error("Módulo Cava2 não encontrado");
  return { start, end: end + "</script>".length, script };
}

function trechoEntre(html, inicio, fim, rotulo) {
  const a = html.indexOf(inicio);
  const b = html.indexOf(fim, a + inicio.length);
  if (a < 0 || b < 0) throw new Error(`Trecho de teste ausente: ${rotulo}`);
  return html.slice(a, b);
}

const expectedBase = corrigeAtualizacaoPrancha(base);
const bb = moduleBounds(expectedBase), tb = moduleBounds(target);
if (expectedBase.slice(0, bb.start) !== target.slice(0, tb.start)) throw new Error("Conteúdo anterior ao Cava2 divergiu da base com a correção autorizada do Layout");
if (expectedBase.slice(bb.end) !== target.slice(tb.end)) throw new Error("Conteúdo posterior ao Cava2 divergiu da base com a correção autorizada do Layout");

const sourceStart = target.indexOf("const CAVA2_V106_SOURCE=", tb.script);
const literalStart = sourceStart + "const CAVA2_V106_SOURCE=".length;
const literalEnd = target.indexOf(";\nconst STORAGE_KEY=", literalStart);
if (sourceStart < 0 || literalEnd < 0) throw new Error("Literal do motor v10.6 não encontrado");
const motor = JSON.parse(target.slice(literalStart, literalEnd));
for (const token of ["v10.6","id=\"t_retorno\"","cava_rampa_raio","pilha_rampa_raio",
  "function ganchoCorredor","function insereGanchos","retornos:o.retornos"]){
  if (!motor.includes(token)) throw new Error(`Contrato exclusivo do motor v10.6 ausente: ${token}`);
}
if (!target.includes("'cava_rampa_raio'") || !target.includes("'pilha_rampa_raio'")) {
  throw new Error("Raio mínimo da rampa não participa do estado de cada aba");
}

const engineScripts = [...motor.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
if (engineScripts.length !== 1) throw new Error(`Scripts internos inesperados: ${engineScripts.length}`);
new vm.Script(engineScripts[0], { filename: "cava-v106-engine.js" });

const outerScriptStart = target.lastIndexOf("<script", sourceStart);
const outerCodeStart = target.indexOf(">", outerScriptStart) + 1;
const outerScriptEnd = target.indexOf("</script>", literalEnd);
new vm.Script(target.slice(outerCodeStart, outerScriptEnd), { filename: "ccmgis-cava2-bridge.js" });

/* Reproduz o defeito observado sem depender do navegador: duas camadas,
   uma fotografia antiga e uma alteração feita dentro do Layout. A rotina
   real do arquivo final deve capturar exatamente o que está na árvore,
   inclusive quando a edição foi somente de ordem/filtro e quando surgiu
   uma camada nova. */
const layoutBehaviorCode = [
  `"use strict";
   const nodes=[
     {t:'L',id:1,o:{visible:true}},
     {t:'L',id:2,o:{visible:false}}
   ];
   const S={_view:'layout',loFrozen:true,loMode:'a4',plateId:7,loCenter:null,
     groups:[],stack:['L:1','L:2'],layers:nodes.map(n=>n.o),rasters:[],img:null,
     plates:[{id:7,vis:{'L:1':true,'L:2':false},conv:{base:true},stack:['L:1','L:2'],groups:[]}],
     _preLayoutMapState:{vis:{'L:1':true,'L:2':true},conv:{map:true},stack:['L:1','L:2']},
     _loDraftVis:null,_loDraftConv:null,_loDraftStack:null,_loRestoringVis:false};
   const PLATE_FIELDS=[],PLATE_CHECKS=[];
   const document={getElementById(id){return id==='layout'?{style:{display:'flex'}}:{value:'',checked:false};}};
   const map={removeLayer(){}};
   let builds=0;
   function allNodes(){return nodes;}
   function nodeKey(t,id){return t+':'+id;}
   function nodeLayer(){return null;}
   function zApply(){}
   function refreshUI(){}
   function v3SyncTreeVisibility(){}
   function layoutVisSnapshot(){const v={};nodes.forEach(n=>v[nodeKey(n.t,n.id)]=n.o.visible!==false);return v;}
   function layoutConventionSnapshot(){return {atual:true};}
   function layoutClone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
   function layoutStateEqual(a,b){return JSON.stringify(a)===JSON.stringify(b);}
   function layoutFrozenDirty(on){S._loFrozenDirty=!!on;}
   function buildLayout(){builds++;}
   function toast(){}
   function assert(ok,msg){if(!ok)throw new Error(msg);}`,
  trechoEntre(target, "function nodeSetVis(", "/* Um pane por nó", "nodeSetVis"),
  trechoEntre(target, "function layoutSeVisivel(", "/* Renomeia uma categoria", "layoutSeVisivel"),
  trechoEntre(target, "function plateCapture(", "function plateApply(", "plateCapture"),
  trechoEntre(target, "function loApplyAll(", "document.getElementById('btnLoRedraw')", "loApplyAll"),
  `nodeSetVis(nodes[0],false);
   assert(JSON.stringify(S._loDraftVis)===JSON.stringify({'L:1':false,'L:2':false}),
     'Alterar uma camada não fotografou a árvore completa');
   plateCapture({captureState:true});
   assert(JSON.stringify(S.plates[0].vis)===JSON.stringify({'L:1':false,'L:2':false}),
     'Atualizar prancha misturou o estado atual com o snapshot anterior');

   nodes[0].o.visible=true;nodes[1].o.visible=false;
   S.plates[0].vis={'L:1':true,'L:2':false};S._preLayoutMapState.vis={'L:1':true,'L:2':true};
   S._loDraftVis=null;layoutSeVisivel();
   assert(JSON.stringify(S._loDraftVis)===JSON.stringify({'L:1':true,'L:2':false}),
     'Editar ordem, filtro ou estilo não preservou a visibilidade da prancha');
   plateCapture({captureState:true});
   assert(S.plates[0].vis['L:2']===false,
     'Atualizar após editar a composição restaurou uma camada antiga');

   nodes.push({t:'L',id:3,o:{visible:true}});S.layers=nodes.map(n=>n.o);
   S._loDraftVis=null;S.plates[0].vis={'L:1':true,'L:2':false};
   S._preLayoutMapState.vis={'L:1':true,'L:2':false};
   plateCapture({captureState:true});
   assert(S.plates[0].vis['L:3']===true,'Camada nova não entrou na prancha atualizada');

   nodes[0].o.visible=false;nodes[1].o.visible=false;nodes[2].o.visible=true;
   S.loMode='fig';S._figFrozenVis={'L:1':true,'L:2':false,'L:3':false};
   S._loDraftVis=layoutVisSnapshot();loApplyAll();
   assert(JSON.stringify(S._figFrozenVis)===JSON.stringify({'L:1':false,'L:2':false,'L:3':true}),
     'Atualizar figura não capturou as camadas atuais');
   assert(builds===1,'Atualizar figura não reconstruiu o Layout');`
].join('\n');
new vm.Script(layoutBehaviorCode, { filename: "layout-layer-snapshot-test.js" }).runInNewContext({});

const scaleGeometrySource = trechoEntre(target,
  "function layoutScaleBarGeometry(", "async function buildLayout(", "layoutScaleBarGeometry");
const scaleGeometry = new vm.Script(scaleGeometrySource + "\nlayoutScaleBarGeometry", {
  filename: "layout-scale-box-geometry.js"
}).runInNewContext({});
const quaseIgual=(a,b,tol=1e-8)=>Math.abs(a-b)<=tol;
const escalaCasos=[];
for (const mult of [0.5,1,3]) {
  const fs=1.25*mult;
  for (const barMM of [18,45,90]) {
    for (const unit of ['m','km']) {
      const labels=unit==='km'?['0','2,5','5','7,5','10']:['0','20','40','60','80'];
      const g=scaleGeometry(barMM,fs,2.35*1.25,labels,unit,'1:2.000.000');
      const margens=[g.bxOffset+g.contentLeft,
        g.boxW-(g.bxOffset+g.contentRight),
        g.byOffset+g.contentTop,
        g.boxH-(g.byOffset+g.contentBottom)];
      if(margens.some(v=>v<0.99))throw new Error('A moldura da escala corta barra, rótulo ou unidade');
      const limite=Math.max(3,0.6*3.25*fs);
      if(margens.some(v=>v>limite+1e-8))throw new Error('A moldura da escala ainda conserva espaço branco excessivo');
      escalaCasos.push({mult,barMM,unit,g});
    }
  }
}
for (const mult of [0.5,1,3]) {
  const fs=1.25*mult,labels=['0','25','50','75','100'];
  const a=scaleGeometry(45,fs,2.35*1.25,labels,'m','1:5.000');
  const b=scaleGeometry(90,fs,2.35*1.25,labels,'m','1:5.000');
  if(!(b.boxW>a.boxW)||!quaseIgual(b.boxW-a.boxW,45,0.2))
    throw new Error('A largura do fundo branco não acompanha o comprimento da escala gráfica');
  if(!quaseIgual(a.boxH,b.boxH))
    throw new Error('Mudar somente o comprimento da escala alterou indevidamente a altura da caixa');
}
{
  const labels=['0','20','40','60','80'];
  const pequeno=scaleGeometry(45,1.25*0.5,2.35*1.25,labels,'km','1:2.000.000');
  const normal=scaleGeometry(45,1.25,2.35*1.25,labels,'km','1:2.000.000');
  const grande=scaleGeometry(45,1.25*3,2.35*1.25,labels,'km','1:2.000.000');
  if(!(pequeno.boxW<=normal.boxW&&normal.boxW<=grande.boxW&&
       pequeno.boxH<normal.boxH&&normal.boxH<grande.boxH))
    throw new Error('A caixa da escala não acompanha o tamanho do texto');
}
if (target.includes('11*barTextRoom') || target.includes('11.2*barTextRoom') ||
    !target.includes('layoutScaleBarGeometry(barMM,barFS,BH,barLabels,unit,scaleLabel)')) {
  throw new Error('A escala gráfica ainda usa a reserva fixa de espaço branco');
}

/* Fórmulas de rótulo: a linguagem é deliberadamente limitada. Campos e
   geometria entram num ambiente de valores; nenhuma expressão pode alcançar
   o DOM, a rede, construtores ou propriedades do JavaScript. */
const labelFormulaSource=trechoEntre(target,
  "const LABEL_FORMULA_FUNCOES=", "/* ---- r\\u00f3tulos por atributo geom", "fórmulas de rótulo");
if (/\b(?:eval|Function)\s*\(/.test(labelFormulaSource))
  throw new Error('O motor de fórmulas de rótulo ainda executa JavaScript dinâmico');
const labelFormulaTest=[
  `"use strict";
   const S={workCRS:'EPSG:31982'};
   function geomCamposDe(){return ['$AREA_HA','$AREA_M2','$COMPRIM','$X','$Y'];}
   function geomValor(L,f,k){return k==='$AREA_HA'?1.2345:k==='$AREA_M2'?12345:
     k==='$COMPRIM'?87.6:k==='$X'?700000:k==='$Y'?7200000:null;}
   function labelCfg(L){return L.lbl;}
   function labelPassaFiltro(){return true;}
   function labelCampos(L){if(Array.isArray(L.labelFields)&&L.labelFields.length)return L.labelFields;
     return L.labelField?[L.labelField]:[];}
   function assert(ok,msg){if(!ok)throw new Error(msg);}`,
  labelFormulaSource,
  `const f1={props:{NOME:'área norte',STATUS:'ATIVO',COTA:10,APELIDO:null},
       geom:[[0,0],[1,0],[1,1]],zg:[4]},
     f2={props:{NOME:'área sul',STATUS:'INATIVO',COTA:20,APELIDO:'Sul'},
       geom:[[2,0],[3,0],[3,1]],zg:[5]},
     L={name:'Teste',gtype:'polygon',crs:'EPSG:31982',
       fields:['NOME','STATUS','COTA','APELIDO'].map(name=>({name})),features:[f1,f2],
       labelField:'',labelFields:null,lbl:{expr:'',dec:-1,case:'',pre:'',suf:''}};
   const E=(x,f=f1,i=0)=>{const r=labelFormulaAvalia(L,f,x,i);assert(r.ok,r.error);return r.value;};
   assert(E("'Área: ' || formatar($AREA_HA, 2) || ' ha'")==='Área: 1,23 ha','Área formatada incorretamente');
   assert(E('se("STATUS" = \\'ATIVO\\', titulo("NOME"), \\'\\')')==='Área Norte','Condição/título incorretos');
   assert(E('coalesce("APELIDO", "NOME", \\'sem nome\\')')==='área norte','coalesce incorreto');
   assert(E('arredondar("COTA" * 1.5 + 2, 1)')===17,'Precedência aritmética incorreta');
   assert(E('$ID',f2,1)===2&&E('$LINHA',f2,1)===2,'Índice original da feição incorreto');
   const perigos=['globalThis.alert(1)',"fetch('x')",'this.constructor(1)','\`texto\`','\"NOME\"[0]',
     '(()=>1)()','\"NOME\"; alert(1)'];
   assert(perigos.every(x=>!labelFormulaValida(x,L).ok),'Uma fórmula perigosa foi aceita');
   assert(!labelFormulaValida('\"CAMPO AUSENTE\"',L).ok,'Campo inexistente foi aceito');
   assert(labelAtivo({gtype:'point',fields:[],features:[],labelField:'',labelFields:null,
     lbl:{expr:"'constante'"}}),'Fórmula constante não ativou o rótulo');
   const html=E("'<img src=x onerror=alert(1)>'");
   assert(html==='<img src=x onerror=alert(1)>','O texto da fórmula foi alterado antes do escape de saída');
   E('"NOME"');const cache=L._labelExprCache;E('"NOME"');
   assert(cache===L._labelExprCache,'A fórmula foi recompilada para cada feição');
   L.lbl={expr:'"NOME" || \\' / \\' || formatar($AREA_HA, 1)',dec:-1,case:'upper',pre:'[',suf:']'};
   assert(labelFormulaTexto(L,f1,L.lbl.expr,0)==='[ÁREA NORTE / 1,2]','Formato final da fórmula divergiu');
   globalThis.result={segura:true,formatada:true,indice:true,cache:true,constante:true};`
].join('\n');
const labelFormulaSandbox={};
new vm.Script(labelFormulaTest,{filename:'label-formula-test.js'}).runInNewContext(labelFormulaSandbox);
if (!labelFormulaSandbox.result || !target.includes('id="lbFormula"') ||
    !target.includes("labelCfg(L).expr=expr;L._labelExprCache=null") ||
    !target.includes("filter(l=>l.visible && labelAtivo(l))") ||
    !target.includes('isExpression="${isExpr?\'1\':\'0\'}"') ||
    !target.includes('labelFields:Array.isArray(o.labelFields)?o.labelFields.slice():null')) {
  throw new Error('A fórmula não está ligada a editor, mapa, Layout, QGIS ou persistência');
}

/* Contagem de contêineres: o resumo precisa sobreviver à reabertura mesmo
   sem metadados privados, aparecer no mapa e ignorar geometrias corrompidas. */
const containerHelperSource = trechoEntre(target,
  "function containerCountLayerRole(", "function refreshUI(", "helpers da contagem de contêineres");
const containerHelperTest = [
  `"use strict";
   const nodes={};
   const host={appendChild(el){nodes[el.id]=el;el.parentNode=this;}};
   const document={
     getElementById(id){return id==='map'?host:(nodes[id]||null);},
     createElement(){return {id:'',style:{},setAttribute(){},remove(){delete nodes[this.id];}};}
   };
   const esc=s=>String(s);
   const featureVisible=()=>true;
   const fields=['TIPO','EMPILHADOS','COMP_M','LARG_M'].map(name=>({name}));
   const L={id:9,name:'Resultado renomeado',gtype:'point',visible:true,fields,
     features:[
       {geom:[[730100,7025100]],props:{TIPO:"12′",EMPILHADOS:1}},
       {geom:[[730110,7025110]],props:{TIPO:"12′",EMPILHADOS:2}},
       {geom:[[730120,7025120]],props:{TIPO:"24′",EMPILHADOS:3}},
       {geom:[[null,null]],props:{TIPO:"24′",EMPILHADOS:9}}
     ]};
   const S={layers:[L]};
   function assert(ok,msg){if(!ok)throw new Error(msg);}`,
  containerHelperSource,
  `assert(containerCountLayerRole(L)==='pontos','A camada renomeada não foi reconhecida pelos campos');
   const R=containerCountSummaryFromLayer(L);
   assert(R&&R.posicoes===3&&R.total===6&&R.c12===3&&R.c24===3,
     'O resumo contou geometria nula ou calculou os tipos incorretamente');
   assert(containerCountLevelsText(R).includes('2 níveis'),'O empilhamento não entrou na legenda');
   containerCountLegendSync();
   const el=nodes.containerCountLegend;
   assert(el&&el.innerHTML.includes('CONTAGEM DE CONTÊINERES')&&
     el.innerHTML.includes('>6</b> unidade')&&el.innerHTML.includes('12′:</b> 3')&&
     el.innerHTML.includes('24′:</b> 3'),'A legenda viva da contagem não foi montada');
   L.visible=false;containerCountLegendSync();
   assert(!nodes.containerCountLegend,'A legenda permaneceu depois de ocultar a contagem');`
].join('\n');
new vm.Script(containerHelperTest,{filename:'container-count-legend-test.js'}).runInNewContext({});

/* Reproduz o erro do screenshot: JSON converte NaN/Infinity em null. O símbolo
   já ignorava esse ponto, mas o rótulo ainda chegava a Leaflet como [null,null]. */
const containerRoleOnly = trechoEntre(target,
  "function containerCountLayerRole(", "function containerCountSummaryFromLayer(", "detector da camada de contagem");
const labelUniqueSource = trechoEntre(target,
  "function labelUniqueSet(", "/* Pontos de r", "unicidade dos rótulos");
const drawLayerSource = trechoEntre(target,
  "function drawLayer(", "function initMap(", "desenho de pontos e rótulos");
const containerDrawTest = [
  `"use strict";
   const symbols=[],labels=[];
   const finiteLL=ll=>Array.isArray(ll)&&Number.isFinite(ll[0])&&Number.isFinite(ll[1]);
   const guard=(ll,tipo)=>{if(!finiteLL(ll))throw new Error(tipo+' recebeu coordenada nula');return ll;};
   const L2={
     circleMarker(ll,o){symbols.push({ll:guard(ll,'símbolo'),o});return {};},
     marker(ll,o){labels.push({ll:guard(ll,'rótulo'),o});return {};},
     divIcon(o){return o;},polyline(){return {};},polygon(){return {};},canvas(){return {};},
     featureGroup(a){return {a,addTo(){return this;},on(){return this;}};},DomEvent:{stop(){}}
   };
   const S={_view:'map',workCRS:'EPSG:31982',tool:null};
   const window={};const map={removeLayer(){}};
   const BIG_LAYER=1000,NUVEM_CANVAS_MIN=1000;
   const setTimeout=fn=>{fn();return 1;};
   function defaultLabelCfg(){return {size:8,place:'center',anchor:'middle',onMap:true,unique:true};}
   function labelCfg(L){return L.lbl||(L.lbl=defaultLabelCfg());}
   function labelAtivo(L){return !!L.labelField;}
   function featureVisible(){return true;}
   function labelText(L,f){const v=f.props[L.labelField];return v==null?null:String(v);}
   function geomValor(){return 1;}
   function attachFactories(){}function desenhaNuvemCanvas(){return false;}
   function desenhaVisRealCamada(){return false;}function panelDaCamada(){return 'p';}
   function featureStyle(){return {color:'#ef8d32',stroke:'#b75d13',weight:2,fill:.9,hatch:'solid',dash:''};}
   function ptStyleOf(){return {shape:'circle',size:14};}
   function toWGS(crs,x,y){return [x,y];}
   function labelAnchorPt(L,f){return f.geom&&f.geom[0];}
   function labelShift(){return [0,0];}function labelCSS(){return '';}
   function labelHTML(v){return String(v);}function labelPontosCurva(){return [];}
   function zApply(){}function applyHatch(){}function toast(){}
   function assert(ok,msg){if(!ok)throw new Error(msg);}`,
  containerRoleOnly,labelUniqueSource,drawLayerSource,
  `const campos=['TIPO','EMPILHADOS','COMP_M','LARG_M'].map(name=>({name}));
   const L={id:4,name:'Contagem de contêineres — teste',gtype:'point',crs:'EPSG:31982',
     fields:campos,features:[
       {geom:[[730100,7025100]],props:{EMPILHADOS:1}},
       {geom:[[730110,7025110]],props:{EMPILHADOS:1}},
       {geom:[[730120,7025120]],props:{EMPILHADOS:2}},
       {geom:[[null,null]],props:{EMPILHADOS:9}}
     ],visible:true,llayer:null,labelField:'ID',lbl:defaultLabelCfg(),sym:{},visReal:false};
   drawLayer(L);
   assert(L.labelField==='EMPILHADOS'&&L.lbl.unique===false,
     'A camada de contagem não migrou para rótulos individuais por empilhamento');
   assert(symbols.length===3&&labels.length===3,'Pontos válidos ou rótulos repetidos foram perdidos');
   const textos=labels.map(x=>x.o.icon.html.replace(/<[^>]+>/g,'')).join(',');
   assert(textos==='1,1,2'&&!textos.includes('9'),'O rótulo nulo apareceu ou a contagem ficou incorreta');`
].join('\n');
new vm.Script(containerDrawTest,{filename:'container-null-label-test.js'}).runInNewContext({});

/* A legenda da prancha apresenta o resultado como contagem, não como duas
   camadas genéricas com carimbo de data. */
const legendItemsSource = trechoEntre(target,
  "function legendItems(", "function layoutWmsUrl(", "legenda do Layout");
const containerLayoutLegendTest = [
  `"use strict";
   const featureVisible=()=>true,groupMembers=()=>[],ptCfg=()=>({shape:'circle'});
   const fields=['TIPO','EMPILHADOS','COMP_M','LARG_M'].map(name=>({name}));
   const feats=[
     {geom:[[1,1]],props:{TIPO:"12′",EMPILHADOS:2}},
     {geom:[[2,2]],props:{TIPO:"24′",EMPILHADOS:1}}
   ];
   const sym=(c)=>({mode:'single',color:c,stroke:c,hatch:'solid',hatchScale:1,weight:2,fill:.35,dash:'',classes:[],cats:[]});
   const pontos={name:'Contagem de contêineres — teste',gtype:'point',visible:true,fields,features:feats,sym:sym('#ef8d32')};
   const pegadas={name:'Contêineres reconhecidos — teste',gtype:'polygon',visible:true,fields,
     features:feats.map(f=>({geom:[[[0,0],[1,0],[1,1],[0,0]]],multi:true,props:f.props})),sym:sym('#37c0aa')};
   const displayList=()=>[{kind:'vector',n:{o:pontos}},{kind:'vector',n:{o:pegadas}}];
   const S={wms:[],layers:[pontos,pegadas]};
   function assert(ok,msg){if(!ok)throw new Error(msg);}`,
  containerHelperSource,legendItemsSource,
  `const itens=legendItems();
   assert(itens.some(x=>x.header&&x.label.includes('3 unidades / 2 posições')),
     'O resumo agregado não entrou na legenda do Layout');
   assert(itens.some(x=>x.label==="12′ — 2")&&itens.some(x=>x.label==="24′ — 1"),
     'Os totais de 12 e 24 pés não entraram na legenda do Layout');
   assert(itens.some(x=>x.kind==='poly'&&x.label==='Contêineres reconhecidos — teste'),
     'A amostra das pegadas reconhecidas desapareceu da legenda');
   assert(!itens.some(x=>x.kind==='pt'&&x.label==='Contagem de contêineres — teste'),
     'A linha genérica da camada duplicou o resumo da contagem');`
].join('\n');
new vm.Script(containerLayoutLegendTest,{filename:'container-layout-legend-test.js'}).runInNewContext({});

for(const token of ["labelField:'EMPILHADOS',lbl:{unique:false,onMap:true}",
  "containerCountLegendSync()","containerResumoAdicionado=false",
  "_containerCount:L._containerCount||null","_containerCount:o._containerCount||null",
  "[c.cx,c.cy,c.ux,c.uy,c.vx,c.vy,c.comprimento,c.largura,c.zMDS,c.zMDT,c.alturaCentro]"]){
  if(!target.includes(token))throw new Error('Contrato da contagem ausente: '+token);
}

/* Poligonizar raster: a ferramenta deve estar acessível diretamente na aba
   GIS, transformar regiões de mesmo DN em anéis fechados e criar uma camada
   com campos que possam ser usados imediatamente pela tabela e pelo filtro. */
const rasterPolygonizerSource = trechoEntre(target,
  "function pgSimplifyRing(", "/* Fechamento de linhas é uma operação CAD distinta de Poligonizar raster. */",
  "poligonizador raster");
const rasterPolygonizerSandbox={result:null};
vm.createContext(rasterPolygonizerSandbox);
new vm.Script(`
  ${rasterPolygonizerSource}
  const ringArea=ring=>{let a=0;for(let i=0;i<ring.length-1;i++)
    a+=ring[i][0]*ring[i+1][1]-ring[i+1][0]*ring[i][1];return a/2;};
  const fechado=ring=>Array.isArray(ring)&&ring.length>=4&&
    JSON.stringify(ring[0])===JSON.stringify(ring[ring.length-1])&&
    ring.every(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]));

  const uniforme=polygonizeRasterGrid({name:'Grade zero',d:{nc:3,nr:2,cs:10,csy:20,
    xll:100,yll:200,z:new Float64Array([0,0,0,0,0,0])}});
  const fUniforme=uniforme.features[0];

  const buraco=polygonizeRasterGrid({name:'Classes do terreno',style:{classes:[
      {value:1,label:'Área útil',color:'#28a745'}]},
    d:{nc:3,nr:3,cs:10,csy:20,xll:0,yll:0,nodata:-9999,
      z:new Float64Array([1,1,1,1,-9999,1,1,1,1])}});
  const fBuraco=buraco.features[0],areasBuraco=(fBuraco?.geom||[]).map(ringArea);
  const areaGeometrica=areasBuraco.length?Math.abs(areasBuraco[0])-Math.abs(areasBuraco[1]||0):0;

  const diagonal={name:'Diagonal',d:{nc:2,nr:2,cs:1,csy:1,xll:0,yll:0,
    z:new Float64Array([1,NaN,NaN,1])}};
  const diag4=polygonizeRasterGrid(diagonal,false),diag8=polygonizeRasterGrid(diagonal,true);

  const umaClasse={name:'Uma classe',style:{classes:[
      {value:1,label:'A',color:'#118844'},{value:2,label:'A',color:'#118844'}]},
    d:{nc:2,nr:2,cs:10,csy:10,xll:0,yll:0,z:new Float64Array([1,2,1,2])}};
  const semDissolve=polygonizeRasterGrid(umaClasse,false,250000,'none'),
    porValor=polygonizeRasterGrid(umaClasse,false,250000,'value'),
    porClasse=polygonizeRasterGrid(umaClasse,false,250000,'class'),
    dissolveTudo=polygonizeRasterGrid(umaClasse,false,250000,'all');

  const donutCheio={name:'Donut preenchido',d:{nc:3,nr:3,cs:10,csy:10,xll:0,yll:0,
    z:new Float64Array([1,1,1,1,2,1,1,1,1])}};
  const donutValor=polygonizeRasterGrid(donutCheio,false,250000,'value'),
    donutTudo=polygonizeRasterGrid(donutCheio,false,250000,'all'),
    donutUm=donutValor.features.find(f=>f.props.DN===1),
    donutDois=donutValor.features.find(f=>f.props.DN===2);
  let limiteSeguro=false;try{polygonizeRasterGrid({name:'Limite',d:{nc:2,nr:2,cs:1,csy:1,
    xll:0,yll:0,z:new Float64Array([1,1,1,1])}},false,3);}catch(e){
      limiteSeguro=String(e.message||e).includes('limite seguro');}
  result={uniforme,buraco,diag4,diag8,semDissolve,porValor,porClasse,dissolveTudo,
    donutValor,donutTudo,limiteSeguro,
    uniformeOk:uniforme.valid===6&&uniforme.features.length===1&&fUniforme.props.DN===0&&
      fUniforme.props.CELULAS===6&&fUniforme.props.AREA_M2===1200&&fUniforme.props.AREA_HA===.12&&
      fUniforme.props.PERIM_M===140&&fUniforme.props.RASTER==='Grade zero'&&
      fUniforme.props.FID===1&&fUniforme.geom.every(fechado),
    buracoOk:buraco.valid===8&&buraco.features.length===1&&fBuraco.geom.length===2&&
      fBuraco.geom.every(fechado)&&fBuraco.props.CELULAS===8&&fBuraco.props.AREA_M2===1600&&
      fBuraco.props.AREA_HA===.16&&fBuraco.props.CLASSE==='Área útil'&&
      fBuraco.props._PG_COR==='#28a745'&&Math.abs(areaGeometrica-1600)<1e-8&&
      Math.sign(areasBuraco[0])!==Math.sign(areasBuraco[1]),
    conectividadeOk:diag4.features.length===2&&diag8.features.length===1&&
      diag4.features.every(f=>f.geom.every(fechado))&&diag8.features[0].geom.every(fechado),
    dissolveClasseOk:semDissolve.features.length===2&&porValor.features.length===2&&
      semDissolve.features.every(f=>f.props.CELULAS===2&&f.props.AREA_M2===200&&f.props.PERIM_M===60)&&
      porValor.features.every(f=>f.props.DISSOLVE==='VALOR'&&typeof f.props.DN==='number')&&
      porClasse.features.length===1&&porClasse.features[0].props.DN===null&&
      porClasse.features[0].props.CLASSE==='A'&&porClasse.features[0].props.DISSOLVE==='CLASSE'&&
      porClasse.features[0].props.CELULAS===4&&porClasse.features[0].props.AREA_M2===400&&
      porClasse.features[0].props.PERIM_M===80&&porClasse.features[0].props.VAL_MIN===1&&
      porClasse.features[0].props.VAL_MAX===2&&porClasse.features[0].props.VAL_MED===1.5,
    dissolveTudoOk:dissolveTudo.features.length===1&&dissolveTudo.features[0].props.DN===null&&
      dissolveTudo.features[0].props.CLASSE===null&&dissolveTudo.features[0].props.DISSOLVE==='TOTAL'&&
      dissolveTudo.features[0].props.CELULAS===4&&dissolveTudo.features[0].props.AREA_M2===400&&
      dissolveTudo.features[0].props.PERIM_M===80&&donutTudo.features.length===1&&
      donutTudo.features[0].geom.length===1&&donutTudo.features[0].props.CELULAS===9&&
      donutTudo.features[0].props.AREA_M2===900&&donutTudo.features[0].props.PERIM_M===120,
    dissolveFurosOk:donutValor.features.length===2&&donutUm?.geom.length===2&&
      donutUm?.props.CELULAS===8&&donutUm?.props.AREA_M2===800&&donutUm?.props.PERIM_M===160&&
      donutDois?.geom.length===1&&donutDois?.props.CELULAS===1&&donutDois?.props.AREA_M2===100&&
      donutDois?.props.PERIM_M===40};
`,{filename:'raster-polygonizer-test.js'}).runInContext(rasterPolygonizerSandbox);
const rasterPolygonizerResult=rasterPolygonizerSandbox.result;
if(!rasterPolygonizerResult?.uniformeOk)
  throw new Error('Poligonizar raster falhou em grade uniforme, DN zero, área ou perímetro');
if(!rasterPolygonizerResult?.buracoOk)
  throw new Error('Poligonizar raster não preservou NoData, anel interno, classe ou atributos');
if(!rasterPolygonizerResult?.conectividadeOk)
  throw new Error('Poligonizar raster não respeitou conectividade 4/8 ou fechamento dos anéis');
if(!rasterPolygonizerResult?.dissolveClasseOk)
  throw new Error('Dissolver raster por atributo não removeu fronteiras ou preservou métricas/tipos');
if(!rasterPolygonizerResult?.dissolveTudoOk)
  throw new Error('Dissolver raster sem atributo não removeu todas as fronteiras internas');
if(!rasterPolygonizerResult?.dissolveFurosOk)
  throw new Error('Dissolver raster perdeu furo, área, células ou perímetro');
if(!rasterPolygonizerResult?.limiteSeguro)
  throw new Error('Poligonizar raster perdeu a proteção contra grades excessivas');

for(const token of [
  "['poligonizar-raster-gis','Poligonizar Raster']",
  "comando('gis','poligonizar-raster-gis'",
  "'opPolygonizeRaster','Poligonizar raster · gerar polígonos e atributos'",
  'id="btnPgRaster"','id="btnPgTabela"','id="btnPgFiltro"','id="pgDissolve"',
  '<option value="value">Dissolver pelo valor do raster</option>',
  '<option value="class">Dissolver pelo atributo CLASSE</option>',
  '<option value="all">Dissolver tudo — sem atributo</option>',
  "{name:'FID',type:'N'","{name:'CLASSE',type:'C'","{name:'VAL_MIN',type:'N'",
  "{name:'VAL_MAX',type:'N'","{name:'VAL_MED',type:'N'","{name:'CELULAS',type:'N'",
  "{name:'AREA_M2',type:'N'","{name:'AREA_HA',type:'N'","{name:'PERIM_M',type:'N'",
  "{name:'RASTER',type:'C'","{name:'DISSOLVE',type:'C'","pgResultadoAbrir(true)",
  "const camposReservados=new Set(['FID','CLASSE','VAL_MIN'"
]){
  if(!target.includes(token))throw new Error('Contrato do Poligonizar Raster ausente: '+token);
}
if(!target.includes("if(!vistos.has(rot)){vistos.add(rot);if(cats.length<60)") ||
   !target.includes("if(dissolveMode!=='all'&&cats.length&&vistos.size<=60)")) {
  throw new Error('Simbologia do raster poligonizado pode aplicar uma lista categorizada incompleta');
}

for (const token of [
  "S._loDraftVis=layoutVisSnapshot()",
  "S._loDraftVis={...layoutVisSnapshot()}",
  "attrFilterRules:layoutClone(L.attrFilterRules||null)",
  "L.attrFilterRules=layoutClone(c.attrFilterRules||null)",
  "if(typeof layoutSeVisivel==='function')layoutSeVisivel();",
  "S._figFrozenVis={...(S._loDraftVis||(visMudou?visAtual:preMesclada))}"
]) {
  if (!target.includes(token)) throw new Error(`Contrato da atualização de prancha ausente: ${token}`);
}

const toolbarStart = motor.indexOf('<header id="ccmgisV74Toolbar"');
const toolbarEnd = motor.indexOf("</header>", toolbarStart);
if (toolbarStart < 0 || toolbarEnd < 0) throw new Error("Toolbar compacta não encontrada");
const toolbar = motor.slice(toolbarStart, toolbarEnd);
const visibleOrder = ["ccmgis_mdt", "ccmgis_cota_trabalho", "t_mover", "t_cava", "t_pilha", "t_editar", "b_escolher",
  "t_rampa", "t_retorno", "t_secao", "b_parar", "b_png", "ccmgis_cortar_cava"];
let orderCursor = 0;
for (const id of visibleOrder) {
  const next = toolbar.indexOf(`id="${id}"`, orderCursor);
  if (next < 0) throw new Error(`Ordem visível inválida em ${id}`);
  orderCursor = next + id.length;
}
for (const id of ["b_novo_lim", "sel_como", "b_diag", "b_exemplo"]) {
  const p = toolbar.indexOf(`id="${id}"`);
  const retired = toolbar.lastIndexOf('class="ccmgis-retired-controls"', p);
  const retiredEnd = toolbar.indexOf("</span>", retired);
  if (p < 0 || retired < 0 || retiredEnd < p) throw new Error(`Controle aposentado exposto: ${id}`);
}
for (const id of ["ccmgis_mdt", "ccmgisCotaCommand", "ccmgis_cota_min", "ccmgis_cota_trabalho",
  "ccmgis_cota_valor", "ccmgis_cota_max", "ccmgis_cortar_cava"]) {
  if (count(toolbar, `id="${id}"`) !== 1) throw new Error(`Comando novo inválido: ${id}`);
}
const iconButtons = [...toolbar.matchAll(/<button\b[^>]*class="[^"]*\bccmgis-tool\b[^"]*"[^>]*>/g)].map(match => match[0]);
if (iconButtons.length !== 17) throw new Error(`Quantidade inesperada de botões com ícone: ${iconButtons.length}`);
for (const tag of iconButtons) {
  if (!tag.includes("title=") || !tag.includes("aria-label=") || !tag.includes("data-tooltip=")) {
    throw new Error(`Botão sem tooltip/acessibilidade: ${tag}`);
  }
}
if (!motor.includes("#ccmgisV74Toolbar [data-tooltip]::after")) throw new Error("CSS de tooltip ausente");
for (const id of ["t_mover","t_cava","t_pilha","t_editar","b_escolher","t_rampa","t_retorno","t_secao",
  "b_parar","b_reverter","b_desfazer","b_refazer","b_limpar","b_ajustar","b_dxf","b_png","ccmgis_cortar_cava"]) {
  if (!motor.includes(`#ccmgisV74Toolbar #${id}{--ccmgis-icon:`)) throw new Error(`Cor funcional ausente: ${id}`);
}
if (!motor.includes(".ccmgis-mdt-command.mdt-alerta")) throw new Error("Alerta visual do MDT ausente");
if (!motor.includes(".ccmgis-cota-command[hidden]{display:none!important;}")) {
  throw new Error("Caixa da cota de trabalho não possui estado oculto seguro");
}
if (toolbar.indexOf('id="b_limpar"') > toolbar.indexOf('<div class="sep">')) {
  throw new Error("Limpar tudo não está visível junto aos comandos de edição");
}
if (!motor.includes('ultimaEdicao="<b>clique na linha</b> que vai ser o limite da próxima cava — o tipo CRISTA ou PÉ será reconhecido automaticamente";')) {
  throw new Error("Ajuda de Escolher linha não foi atualizada");
}
for (const token of [
  "function mdtValido(R)",
  "function limitesMdt(R)",
  "function configuraCotaTrabalho(d,R)",
  "function defineCotaTrabalho(valor,silencioso)",
  "function sincronizaSuperficieTrabalhoNoMotor(d,R)",
  "function selecionaMdtTrabalho(id)",
  "function publicaCorteMdt(d,design,silencioso,forcar,finalizar)",
  "function assinaturaMdt(R)",
  "Interseção — ${d?.nome||tipoNome(d?.tipo)}",
  "_cava2IntersectionPreview",
  "cutMdt:false",
  "cava2:drawing-blocked",
  "setTool(tipo)",
  "setWorkSurface(v)",
  "setWorkElevation(z)",
  "getWorkClassification(k)",
  "function amostraSuperficieTrabalho(x,y)",
  "function trechosLinhaPorCota(P,fechado,cota)",
  "function trechosLinhaBasePorCota(P,fechado,z)",
  "function tracaLinhaPorCota(P,fechado,cota,estilo)",
  "function tracaLinhaBasePorCota(P,fechado,z,estilo)",
  "function desenhaLegendaCotaTrabalho()",
  "function cotaAbsolutaDoDesign(zRel)",
  "sampleZbil(g,px,py)",
  "const z=n(baseZ)+n(a.z)",
  "const zg=P.map(p=>n(baseZ)+n(p.z))",
  "opacity:R.style?.opacity??R.opacity??1",
  "beginDrawing(tipo)",
  "activateExternalTool(tool,tipo)",
  "function iniciaSelecaoPoligono()",
  "function finalizaSelecaoPoligono()",
  "cava2:selection-changed",
  "function comandoGlobalDaCava(tool)",
  "limpar.id='btnCavaClear'",
  "chooseWorkMdt:selecionaMdtTrabalho",
  "cutCurrent:()=>cortaMdtAtual(true)"
]) {
  if (!target.includes(token) && !motor.includes(token)) throw new Error(`Contrato MDT/corte ausente: ${token}`);
}
/* A visibilidade por cota deve conservar o estilo temático já atribuído à
   feição.  Somente o trecho oculto pelo MDT recebe o tratamento canônico do
   CCMGIS (invisível com MDT opaco; tracejado + halo quando translúcido). */
for (const token of [
  "opAbaixo=opMdt>=.999?0",
  "ctx.setLineDash([6,5])",
  'desenha(r,"#ffffff"',
  "desenha(r,cor,Math.max(.9,peso*.95)",
  "desenha(r,cor,peso,"
]) {
  if (!motor.includes(token)) throw new Error(`Estilo de visibilidade real ausente: ${token}`);
}

/* Anéis, rampa, linha selecionada, linha em desenho e exportação precisam
   consultar a cota absoluta. Isto impede que apenas a linha-base acompanhe o
   controle de cota enquanto o restante da cava/DCE fique parado. */
for (const token of [
  "tracaLinhaPorCota(a.P,true,cotaAbsolutaDoDesign(a.z)",
  "p=>cotaAbsolutaDoDesign(p.z)",
  "cotaAbsolutaDoDesign(an[sel.idx].z)",
  "tracaLinhaBasePorCota(previa,false,cotaTrabalhoDoDesenho()",
  "rotuloHalo(fmt(cotaAbsolutaDoDesign(a.z),0)",
  "anelDXF(a.P, cotaAbsolutaDoDesign(a.z)",
  '"30",cotaAbsolutaDoDesign(s.z).toFixed(3)'
]) {
  if (!motor.includes(token)) throw new Error(`Componente não acompanha a cota de trabalho: ${token}`);
}
const classificationApiStart = motor.indexOf("getWorkClassification(k){");
const classificationApiEnd = motor.indexOf("beginDrawing(tipo){", classificationApiStart);
const classificationApiCode = motor.slice(classificationApiStart, classificationApiEnd);
if (classificationApiStart < 0 || classificationApiEnd < 0 ||
    !classificationApiCode.includes("o.design.aneis") ||
    !classificationApiCode.includes("o.design.corredores") ||
    !classificationApiCode.includes("trechosLinhaPorCota")) {
  throw new Error("A API de classificação não cobre simultaneamente anéis e rampa");
}

const helperStart = motor.indexOf("function amostraSuperficieTrabalho(x,y)");
const helperEnd = motor.indexOf("function recortaLinhaForaRampas", helperStart);
const helperCode = motor.slice(helperStart, helperEnd);
const trechosStart = helperCode.indexOf("function trechosLinhaPorCota(P,fechado,cota)");
const trechosEnd = helperCode.indexOf("function tracaLinhaPorCota", trechosStart);
const trechosCode = helperCode.slice(trechosStart, trechosEnd);
if (helperStart < 0 || helperEnd < 0 || trechosStart < 0 || trechosEnd < 0) {
  throw new Error("Núcleo de classificação por cota não encontrado");
}
if (/\bP\s*\.\s*(push|splice|pop|shift|unshift|sort|reverse|copyWithin|fill)\s*\(/.test(trechosCode) ||
    /\bP\s*\[[^\]]+\]\s*=/.test(trechosCode)) {
  throw new Error("A classificação visual está modificando os vértices originais");
}

/* Exercita o mesmo classificador usado por cristas, pés e rampas. O primeiro
   caso localiza uma interseção em uma linha de cota constante; o segundo usa
   Z variável de rampa; o terceiro comprova a semântica visual do MDT opaco e
   translúcido e o deslocamento rígido de todas as cotas relativas. */
const classSandbox = { result: null };
vm.createContext(classSandbox);
new vm.Script(`
  let superficieTrabalho={id:'cruzamento',revision:1,workZ:0,cellSize:1,tolerance:.01,opacity:1,
    sampleZ:(x,y)=>x-5};
  const cacheSuperficieTrabalho=new Map(),objs={cava:{z0:-30}};
  let desenho={alvo:'cava',pts:[],novoLimite:{z0:-40}};
  const strokes=[];
  const ctx={lineDash:[],globalAlpha:1,save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},
    setLineDash(v){this.lineDash=[...(v||[])];},stroke(){strokes.push({color:this.strokeStyle,
      width:this.lineWidth,alpha:this.globalAlpha,dash:[...this.lineDash]});}};
  const W2S=(x,y)=>[x,y];
  ${helperCode}

  const P=[{x:0,y:0},{x:10,y:0}],antesP=JSON.stringify(P);
  const runs=trechosLinhaBasePorCota(P,false,0),acima=runs.find(r=>r.relation==='above'),
    abaixo=runs.find(r=>r.relation==='below');

  superficieTrabalho={id:'plano',revision:2,workZ:100,cellSize:1,tolerance:.01,opacity:1,
    sampleZ:()=>100};cacheSuperficieTrabalho.clear();
  const anelAbaixo=[{x:0,y:0},{x:8,y:0},{x:8,y:8},{x:0,y:8}],
    anelAcima=[{x:20,y:0},{x:28,y:0},{x:28,y:8},{x:20,y:8}],
    rampa=[{x:0,y:20,z:-10},{x:10,y:20,z:10}],
    antesGeometria=JSON.stringify({anelAbaixo,anelAcima,rampa});
  const abaixoAnel=trechosLinhaPorCota(anelAbaixo,true,cotaAbsolutaDoDesign(-10)),
    acimaAnel=trechosLinhaPorCota(anelAcima,true,cotaAbsolutaDoDesign(10)),
    rampaRuns=trechosLinhaPorCota(rampa,false,p=>cotaAbsolutaDoDesign(p.z));
  const rampaAcima=rampaRuns.find(r=>r.relation==='above'),
    rampaAbaixo=rampaRuns.find(r=>r.relation==='below');

  strokes.length=0;
  tracaLinhaPorCota([{x:0,y:30},{x:10,y:30}],false,90,{color:'#7b2cbf',weight:3});
  const opacoAbaixo=strokes.slice();
  strokes.length=0;
  tracaLinhaPorCota([{x:0,y:31},{x:10,y:31}],false,110,{color:'#7b2cbf',weight:3,dash:[2,1]});
  const acimaEstilizado=strokes.slice();
  superficieTrabalho.opacity=.5;cacheSuperficieTrabalho.clear();strokes.length=0;
  tracaLinhaPorCota([{x:0,y:32},{x:10,y:32}],false,90,{color:'#7b2cbf',weight:3});
  const translucidoAbaixo=strokes.slice();

  const cotasAntes=[cotaTrabalhoDoObjeto('cava'),cotaTrabalhoDoDesenho(),
    cotaAbsolutaDoDesign(-10),cotaAbsolutaDoDesign(0),cotaAbsolutaDoDesign(10)];
  superficieTrabalho.workZ=137;cacheSuperficieTrabalho.clear();
  const cotasDepois=[cotaTrabalhoDoObjeto('cava'),cotaTrabalhoDoDesenho(),
    cotaAbsolutaDoDesign(-10),cotaAbsolutaDoDesign(0),cotaAbsolutaDoDesign(10)];

  result={preservada:antesP===JSON.stringify(P)&&antesGeometria===JSON.stringify({anelAbaixo,anelAcima,rampa}),
    acima,abaixo,abaixoAnel,acimaAnel,rampaAcima,rampaAbaixo,opacoAbaixo,acimaEstilizado,
    translucidoAbaixo,cotasAntes,cotasDepois};
`, { filename: "ccmgis-work-elevation-test.js" }).runInContext(classSandbox);
const classResult = classSandbox.result;
if (!classResult?.preservada || !classResult.acima || !classResult.abaixo) {
  throw new Error("Classificação sintética acima/abaixo do MDT falhou ou alterou a geometria");
}
const fimAcima=classResult.acima.points[classResult.acima.points.length-1].x,
  inicioAbaixo=classResult.abaixo.points[0].x;
if (Math.abs(fimAcima-5)>.02 || Math.abs(inicioAbaixo-5)>.02) {
  throw new Error(`Cruzamento sintético com o MDT impreciso: ${fimAcima}/${inicioAbaixo}`);
}
if (!classResult.abaixoAnel.length || classResult.abaixoAnel.some(r=>r.relation!=="below") ||
    !classResult.acimaAnel.length || classResult.acimaAnel.some(r=>r.relation!=="above")) {
  throw new Error("Cristas/pés não são classificados pela cota absoluta contra o MDT");
}
if (!classResult.rampaAcima || !classResult.rampaAbaixo) {
  throw new Error("A rampa com Z variável não foi separada em trechos acima/abaixo do MDT");
}
const fimRampaAbaixo=classResult.rampaAbaixo.points[classResult.rampaAbaixo.points.length-1].x,
  inicioRampaAcima=classResult.rampaAcima.points[0].x;
if (Math.abs(fimRampaAbaixo-5)>.02 || Math.abs(inicioRampaAcima-5)>.02) {
  throw new Error(`Cruzamento vertical da rampa impreciso: ${fimRampaAbaixo}/${inicioRampaAcima}`);
}
if (classResult.opacoAbaixo.length!==0) {
  throw new Error("Trecho abaixo de MDT opaco deveria ficar oculto");
}
if (classResult.acimaEstilizado.length!==1 || classResult.acimaEstilizado[0].color!=="#7b2cbf" ||
    classResult.acimaEstilizado[0].dash.join(",")!=="2,1") {
  throw new Error("Trecho acima do MDT não preservou cor/tracejado da feição");
}
if (classResult.translucidoAbaixo.length!==2 || classResult.translucidoAbaixo[0].color!=="#ffffff" ||
    classResult.translucidoAbaixo[1].color!=="#7b2cbf" ||
    classResult.translucidoAbaixo.some(s=>s.dash.join(",")!=="6,5")) {
  throw new Error("Trecho abaixo de MDT translúcido não usa halo e tracejado canônicos");
}
if (classResult.cotasAntes.length!==classResult.cotasDepois.length ||
    classResult.cotasDepois.some((z,i)=>Math.abs(z-classResult.cotasAntes[i]-37)>1e-9)) {
  throw new Error("A cota de trabalho não deslocou rigidamente base, continuação, anéis e rampa");
}

/* A publicação cartográfica é injetada depois da ponte histórica. Ela deve
   produzir uma camada de linhas acima de uma camada polygon de preenchimento,
   sem misturar o produto analítico fechado usado pelo corte com os recortes
   meramente cartográficos feitos nas linhas em torno da rampa. */
const cartographicStart = target.indexOf("/* Publicação cartográfica do motor Cava2.", tb.script);
const cartographicEnd = target.indexOf("\n\nwindow.CCMGISCava2=", cartographicStart);
if (cartographicStart < 0 || cartographicEnd < 0) {
  throw new Error("Módulo de publicação cartográfica Cava2 não encontrado");
}
const cartographicCode = target.slice(cartographicStart, cartographicEnd);
for (const token of [
  "function feicoesFechadasParaIntersecao(design,baseZ,meta)",
  "function feicoesCartograficasDoDesign(design,baseZ,meta)",
  "function feicoesPreenchimentoDoDesign(design,baseZ,meta)",
  "function cava2MetaCorredor(c,corredores,i)",
  "function cava2DefinicoesLinha(tipo)",
  "function estiloCamadaPreenchimento(L,feats)",
  "function camadaPreenchimentoDoDesenho(id)",
  "function camadaPreenchimentoCorteDoDesenho(id)",
  "function cava2ReconstruiAnelRadial(curvas,linhas,g,apoio)",
  "function cava2AreasCortadasNoMdt(design,d,R,g,modoUp,passo,inter)",
  "gtype:'line'",
  "gtype:'polygon'",
  "F._cava2Role='fill'",
  "L._cava2Role='line'",
  "L.labelField='ROTULO'",
  "font:'Signika, sans-serif'",
  "function designRuntime(d)",
  "function cava2IntersecaoRadialExistente(src,g,modoUp,apoio)",
  "limites:entradas.map",
  "_blocos:entradas.map"
]) {
  if (!cartographicCode.includes(token)) throw new Error(`Contrato cartográfico ausente: ${token}`);
}

const cutPublicationStart = cartographicCode.indexOf("function publicaCorteMdt(d,design,silencioso,forcar,finalizar)");
const cutPublicationEnd = cartographicCode.indexOf("function limpaCamadasDoDesenho", cutPublicationStart);
const cutPublicationCode = cartographicCode.slice(cutPublicationStart, cutPublicationEnd);
if (cutPublicationStart < 0 || cutPublicationEnd < 0 ||
    !cutPublicationCode.includes("const src=feicoesFechadasParaIntersecao(design,n(d.baseZ),d)") ||
    !cutPublicationCode.includes("cava2IntersecaoRadialExistente(src,g,modoUp,apoio)") ||
    !cutPublicationCode.includes("cava2AreasCortadasNoMdt(design,d,R,g,modoUp,passo,inter)") ||
    !cutPublicationCode.includes("cava2RecortaLimitesNoMdt(design,d,R,g,modoUp,passo)") ||
    !cutPublicationCode.includes("modoUp=d.tipo==='pilha'") ||
    /const src\s*=\s*(?:feicoesDoDesign|feicoesCartograficasDoDesign)\s*\(/.test(cutPublicationCode)) {
  throw new Error("O corte MDT não está consumindo exclusivamente os anéis analíticos fechados");
}
for (const token of [
  "_featuresFromDesign:feicoesDoDesign",
  "_fillFeaturesFromDesign:feicoesPreenchimentoDoDesign",
  "_intersectionFeaturesFromDesign:feicoesFechadasParaIntersecao",
  "getFillLayer:id=>camadaPreenchimentoDoDesenho(id)",
  "getCutFillLayer:id=>camadaPreenchimentoCorteDoDesenho(id)"
]) {
  if (count(target, token)!==1) throw new Error(`API cartográfica ausente ou duplicada: ${token}`);
}

/* Smoke test das funções puras e da criação das duas camadas. Ele comprova:
   - partesEntrada nunca substitui o anel completo enviado ao corte;
   - paletas, preenchimentos e rótulos são os mesmos para mapa/legenda/Layout;
   - a linha fica acima do preenchimento e as quantidades são determinísticas;
   - baseZ desloca todos os Z sem alterar XY nem quantidade de vértices;
   - designRuntime preserva todos os limites e blocos continuados. */
const cartographicSandbox = { result: null };
vm.createContext(cartographicSandbox);
new vm.Script(`
  const n=(v,d=0)=>Number.isFinite(+v)?+v:d,
    limpaPontos=P=>(P||[]).map(p=>[n(p.x,p[0]),n(p.y,p[1])]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])),
    fechaAnel=g=>{g=g.map(p=>p.slice());if(g.length>2&&Math.hypot(g[0][0]-g[g.length-1][0],g[0][1]-g[g.length-1][1])>1e-8)g.push(g[0].slice());return g;},
    classe=tp=>String(tp||'').toLowerCase()==='pe'?'Pé':'Crista',
    tipoNome=t=>t==='pilha'?'DCE':'Cava',formataCota=v=>String(+v),
    clone=v=>v==null?v:JSON.parse(JSON.stringify(v)),defaultLabelCfg=()=>({}),
    nomeCamada=d=>(d.tipo==='pilha'?'DCE':'Cava')+' — '+d.nome;
  let apiAtual=null,seq=0;const api=()=>apiAtual,
    S={layers:[],stack:[],activeId:null,workCRS:'EPSG:31983'},
    addLayer=o=>{const L={...o,id:'smoke-'+(++seq),visible:true,sym:null,lbl:null};S.layers.push(L);S.stack.push('L:'+L.id);return L;},
    drawLayer=()=>{},refreshUI=()=>{},zApply=()=>{},sampleZbil=()=>100;
  function cavaIntersecaoRadial(linhas,g,H){
    if(linhas.length<2||!g?.teste)return [];
    const base=linhas[0].ring,cx=base.reduce((s,p)=>s+p[0],0)/base.length,
      cy=base.reduce((s,p)=>s+p[1],0)/base.length,
      raioMax=Math.max(...linhas.flatMap(ln=>ln.ring.map(p=>Math.hypot(p[0]-cx,p[1]-cy))),1),
      alvo=Math.max(.35,Math.min(1.5,Math.max(g.cs||1,g.csy||g.cs||1)*.65)),
      N=Math.max(240,Math.min(1440,Math.ceil(2*Math.PI*raioMax/alvo))),geom=[],zg=[];
    /* Simula o caso real que motivou a regressão: o motor devolve apenas um
       arco aberto porque parte dos raios saiu do raster. A publicação precisa
       completar a volta polar e jamais fazer a linha inteira desaparecer. */
    for(let k=0;k<Math.floor(N*.68);k++){const a=2*Math.PI*k/N;geom.push([cx+4*Math.cos(a),cy+4*Math.sin(a)]);zg.push(100);}
    return [{geom,zg}];
  }
  ${cartographicCode}

  const quadrado=(x,y,s)=>[{x,y},{x:x+s,y},{x:x+s,y:y+s},{x,y:y+s}],
    rampa={borda1:[{x:2,y:2,z:-16},{x:8,y:2,z:-6}],centro:[{x:2,y:3,z:-15},{x:8,y:3,z:-5}],
      borda2:[{x:2,y:4,z:-14},{x:8,y:4,z:-4}],
      poly:[{x:2,y:2,z:-16},{x:8,y:2,z:-6},{x:8,y:4,z:-4},{x:2,y:4,z:-14}],gradEfetivo:10,zIni:-16},
    interior={tp:'pe',z:-20,P:quadrado(1,1,8)},exterior={tp:'crista',z:0,P:quadrado(0,0,10)},
    bloco={aneis:[interior,exterior],corredores:[rampa],avisos:[],nBancos:1,areaBase:64,areaFinal:100,vol:123,rampaDesenv:50},
    design={...bloco,limites:[{key:'cava',index:0,P:quadrado(-1,-1,12),z0:0}],
      _blocos:[{key:'cava',index:0,z0:0,base:quadrado(-1,-1,12),design:bloco}]},
    metaCava={id:'d1',nome:'Teste',tipo:'cava',baseZ:200,crs:'EPSG:31983',engine:{}},
    antesDesign=JSON.stringify(design);

  const anelCompleto=quadrado(20,20,10),partesEntrada=[[anelCompleto[0],anelCompleto[1]],
      [anelCompleto[2],anelCompleto[3]]],designPartes={aneis:[{tp:'crista',z:-5,P:anelCompleto,partesEntrada}],corredores:[]};
  apiAtual={recortaLinhaForaRampas:()=>({partes:partesEntrada,cortado:true})};
  const fechadoPartes=feicoesFechadasParaIntersecao(designPartes,200,metaCava),
    cartPartes=feicoesCartograficasDoDesign(designPartes,200,metaCava);
  apiAtual=null;

  const comparaZ=fn=>{const a=fn(design,200,metaCava),b=fn(design,235,metaCava);
    return {quantidade:a.length===b.length,xy:JSON.stringify(a.map(f=>f.geom))===JSON.stringify(b.map(f=>f.geom)),
      vertices:a.every((f,i)=>f.geom.length===b[i].geom.length&&f.zg.length===b[i].zg.length),
      delta:a.every((f,i)=>f.zg.every((z,j)=>Math.abs(b[i].zg[j]-z-35)<1e-9)&&
        Math.abs(b[i].props.COTA-f.props.COTA-35)<1e-9)};};
  const deslocamentos={linha:comparaZ(feicoesCartograficasDoDesign),fill:comparaZ(feicoesPreenchimentoDoDesign),
    intersecao:comparaZ(feicoesFechadasParaIntersecao)};

  const linhaCava=feicoesCartograficasDoDesign(design,200,metaCava),
    fillCava=feicoesPreenchimentoDoDesign(design,200,metaCava),
    designRetorno={...design,_blocos:null,corredores:[clone(rampa),{...clone(rampa),gancho:true},clone(rampa)]},
    linhasRetorno=feicoesCartograficasDoDesign(designRetorno,200,metaCava),
    fillRetorno=feicoesPreenchimentoDoDesign(designRetorno,200,metaCava),
    radialExistente=cava2IntersecaoRadialExistente(feicoesFechadasParaIntersecao(design,200,metaCava),{teste:true},false),
    fillDce=feicoesPreenchimentoDoDesign(design,200,{...metaCava,tipo:'pilha'}),
    estiloLinhaCava={_cava2Kind:'cava',sym:null,lbl:null},estiloLinhaDce={_cava2Kind:'pilha',sym:null,lbl:null},
    estiloFillCava={_cava2Kind:'cava',sym:null,lbl:null},estiloFillDce={_cava2Kind:'pilha',sym:null,lbl:null};
  estiloCamada(estiloLinhaCava,linhaCava);estiloCamada(estiloLinhaDce,linhaCava);
  estiloCamadaPreenchimento(estiloFillCava,fillCava);estiloCamadaPreenchimento(estiloFillDce,fillDce);

  S.layers=[];S.stack=[];seq=0;const L=publicaDesenho(metaCava,design,true),F=camadaPreenchimentoDoDesenho(metaCava.id),
    ordemCamadas=S.layers.indexOf(L)<S.layers.indexOf(F),ordemStack=S.stack.indexOf('L:'+L.id)<S.stack.indexOf('L:'+F.id);

  const d0={aneis:[{tp:'crista',z:0,P:quadrado(40,0,10)}],corredores:[],avisos:['a'],nBancos:1,areaBase:10,areaFinal:20,vol:30,rampaDesenv:40},
    d1={aneis:[{tp:'pe',z:-10,P:quadrado(60,0,8)}],corredores:[rampa],avisos:['b'],nBancos:2,areaBase:8,areaFinal:16,vol:50,rampaDesenv:60},
    objetos={cava:{base:quadrado(39,-1,12),z0:0,design:d0},'cava#1':{base:quadrado(59,-1,10),z0:-10,design:d1}},
    antesObjetos=JSON.stringify(objetos);apiAtual={objs:objetos};const agregado=designRuntime({tipo:'cava'});

  result={
    anelAnalitico:{um:fechadoPartes.length===1,fechado:fechadoPartes[0]?.geom.length===5&&
      JSON.stringify(fechadoPartes[0].geom[0])===JSON.stringify(fechadoPartes[0].geom[4]),
      completo:fechadoPartes[0]?.geom.length>Math.max(...partesEntrada.map(P=>P.length)),cartograficoRecortado:cartPartes.length===2},
    deslocamentos,preservada:antesDesign===JSON.stringify(design),
    radialExistente:{quantidade:radialExistente.length,elemento:radialExistente[0]?.props?.TIPO,
      metodo:radialExistente[0]?.props?.METODO,topologia:radialExistente[0]?.props?.TOPOLOGIA,
      fechada:radialExistente[0]?.geom?.length>3&&
        JSON.stringify(radialExistente[0].geom[0])===JSON.stringify(radialExistente[0].geom.at(-1)),
      semAutocruzamento:cava2AnelSemAutocruzamento(radialExistente[0]?.geom||[],1e-9)},
    retorno:{linhas:linhasRetorno.filter(f=>f.props?.ELEMENTO==='Retorno').length,
      bancoNulo:linhasRetorno.filter(f=>f.props?.ELEMENTO==='Retorno').every(f=>f.props?.BANCO==null),
      segundoBanco:linhasRetorno.filter(f=>f.props?.ELEMENTO==='Rampa'&&f.props?.ORIGEM?.endsWith('Eixo'))[1]?.props?.BANCO,
      area:fillRetorno.filter(f=>f.props?.ELEMENTO==='Retorno'&&f.props?.BANCO==null).length},
    quantidades:{linha:linhaCava.length,fill:fillCava.length,publicadaLinha:L?.features?.length,publicadaFill:F?.features?.length},
    camadas:{linha:L?.gtype==='line'&&L?._cava2Role==='line',fill:F?.gtype==='polygon'&&F?._cava2Role==='fill',
      ordemCamadas,ordemStack},
    labels:{linha:estiloLinhaCava.labelField==='ROTULO'&&estiloLinhaCava.lbl?.font==='Signika, sans-serif'&&
        estiloLinhaCava.lbl?.size===9.5&&estiloLinhaCava.lbl?.place==='curva'&&estiloLinhaCava.lbl?.onMap===true,
      fill:estiloFillCava.labelField==='ROTULO'&&estiloFillCava.lbl?.font==='Signika, sans-serif'&&
        estiloFillCava.lbl?.size===13&&estiloFillCava.lbl?.place==='center'&&estiloFillCava.lbl?.unique===true,
      cota:linhaCava.some(f=>f.props?.ELEMENTO==='Crista'&&f.props?.ROTULO),
      rampa:linhaCava.some(f=>f.props?.ELEMENTO==='Rampa'&&String(f.props?.ROTULO).startsWith('R')),
      fundo:fillCava.some(f=>f.props?.ELEMENTO==='Fundo'&&f.props?.ROTULO==='CAVA'),
      topo:fillDce.some(f=>f.props?.ELEMENTO==='Topo'&&f.props?.ROTULO==='DCE')},
    paletas:{linhaCava:cava2DefinicoesLinha('cava'),linhaDce:cava2DefinicoesLinha('pilha'),
      fillCava:estiloFillCava.sym.cats.map(c=>[c.value,c.color,c.stroke,c.weight,c.fill]),
      fillDce:estiloFillDce.sym.cats.map(c=>[c.value,c.color,c.stroke,c.weight,c.fill])},
    agregado:{preservado:antesObjetos===JSON.stringify(objetos),blocos:agregado?._blocos?.length,
      limites:agregado?.limites?.length,aneis:agregado?.aneis?.length,corredores:agregado?.corredores?.length,
      chaves:agregado?._blocos?.map(b=>b.key),z0:agregado?.limites?.map(l=>l.z0),
      tags:agregado?.aneis?.map(a=>[a._bloco,a._blocoIndice]),vol:agregado?.vol,rampa:agregado?.rampaDesenv}
  };
`, { filename: "ccmgis-cartographic-publication-test.js" }).runInContext(cartographicSandbox);
const cartResult = cartographicSandbox.result;
if (!cartResult?.anelAnalitico?.um || !cartResult.anelAnalitico.fechado ||
    !cartResult.anelAnalitico.completo || !cartResult.anelAnalitico.cartograficoRecortado) {
  throw new Error("partesEntrada contaminou o anel analítico fechado usado pela interseção");
}
if (cartResult?.radialExistente?.quantidade!==1 ||
    cartResult.radialExistente.elemento!=='Interseção cava × terreno' ||
    cartResult.radialExistente.metodo!=='radial existente 360° por anéis × MDT' ||
    cartResult.radialExistente.topologia!=='anel fechado' ||
    !cartResult.radialExistente.fechada || !cartResult.radialExistente.semAutocruzamento) {
  throw new Error("A Interseção radial não é um anel fechado e simples");
}
if (cartResult?.retorno?.linhas!==3 || !cartResult.retorno.bancoNulo ||
    cartResult.retorno.segundoBanco!==2 || cartResult.retorno.area!==1) {
  throw new Error("O retorno v10.6 não foi publicado separadamente sem deslocar a numeração dos bancos");
}
for (const [produto,q] of Object.entries(cartResult?.deslocamentos||{})) {
  if (!cartResult.preservada || !q.quantidade || !q.xy || !q.vertices || !q.delta) {
    throw new Error(`Produto ${produto} não preserva XY/vértices ao deslocar baseZ`);
  }
}
if (JSON.stringify(cartResult?.paletas?.linhaCava)!==JSON.stringify([
  ['Limite exterior','#101010','',2.6,0],['Crista','#8a4b1e','',1.8,.35],
  ['Pé','#c08a52','6 4',1.1,.18],['Rampa','#b3541e','',1.2,.32],['Retorno','#d06b24','',1.4,.4],
  ['Interseção','#000000','',1.2,0]
]) || JSON.stringify(cartResult?.paletas?.linhaDce)!==JSON.stringify([
  ['Limite exterior','#101010','',2.6,0],['Crista','#333c48','',1.8,.35],
  ['Pé','#8a93a0','6 4',1.1,.18],['Rampa','#2c3e70','',1.2,.28],['Retorno','#1f6fb2','',1.4,.36],
  ['Interseção','#000000','',1.2,0]
])) {
  throw new Error("Paleta exata das linhas de Cava/DCE divergiu");
}
if (JSON.stringify(cartResult?.paletas?.fillCava)!==JSON.stringify([
  ['Área projetada','#c9b18a','#c9b18a',0,.35],['Fundo','#efe6d2','#efe6d2',0,1],
  ['Rampa','#b3541e','#b3541e',1.2,.32],['Retorno','#d06b24','#d06b24',1.4,.4]
]) || JSON.stringify(cartResult?.paletas?.fillDce)!==JSON.stringify([
  ['Área projetada','#9aa0a8','#9aa0a8',0,.35],['Topo','#c9ced6','#c9ced6',0,1],
  ['Rampa','#2c3e70','#2c3e70',1.2,.28],['Retorno','#1f6fb2','#1f6fb2',1.4,.36]
])) {
  throw new Error("Paleta exata dos preenchimentos/fundo/topo/rampa divergiu");
}
if (cartResult?.quantidades?.linha!==6 || cartResult.quantidades.fill!==3 ||
    cartResult.quantidades.publicadaLinha!==6 || cartResult.quantidades.publicadaFill!==3 ||
    !cartResult.camadas.linha || !cartResult.camadas.fill ||
    !cartResult.camadas.ordemCamadas || !cartResult.camadas.ordemStack) {
  throw new Error("Camadas line/polygon, quantidade ou ordem linha-sobre-preenchimento inválida");
}
if (!Object.values(cartResult?.labels||{}).every(Boolean)) {
  throw new Error("Rótulos de cota/rampa/fundo/topo ou configuração Signika estão incompletos");
}
if (!cartResult?.agregado?.preservado || cartResult.agregado.blocos!==2 || cartResult.agregado.limites!==2 ||
    cartResult.agregado.aneis!==2 || cartResult.agregado.corredores!==1 ||
    JSON.stringify(cartResult.agregado.chaves)!==JSON.stringify(['cava','cava#1']) ||
    JSON.stringify(cartResult.agregado.z0)!==JSON.stringify([0,-10]) ||
    JSON.stringify(cartResult.agregado.tags)!==JSON.stringify([['cava',0],['cava#1',1]]) ||
    cartResult.agregado.vol!==80 || cartResult.agregado.rampa!==100) {
  throw new Error("designRuntime não preservou limites, blocos ou totais da continuidade");
}

/* O painel fixo é uma ficha da CAMADA, não um segundo editor. O editor
   completo permanece no modal da engrenagem. A medição agregada precisa ainda
   distinguir cascas, furos e partes desconectadas sem depender da orientação. */
const propDockCode=trechoEntre(target,"function propRefresh(){",
  "/* O painel de propriedades ocupa uma coluna inteira no shell.","painel fixo de propriedades");
if (/<(?:input|select|textarea|button)\b/i.test(propDockCode) ||
    /ppAttrFilterHTML|ppCopyStyle|ppPasteStyle|ppClosePoly|ppTable/.test(propDockCode)) {
  throw new Error("O painel fixo ainda contém controles ou comandos de edição");
}
if (!propDockCode.includes("ppLayerGeomHTML(L)+ppAttrHTML(L)") ||
    !propDockCode.includes("Propriedades — camada ativa") ||
    !target.includes("'Geometria total da camada ('+total.features+' feições)'")) {
  throw new Error("O painel fixo não apresenta o resumo agregado da camada");
}
const rasterPropCode=trechoEntre(target,"function ppRasterHTML(r){","function propRefresh(){","propriedades do raster");
const attrPropCode=trechoEntre(target,"function ppAttrHTML(L){","function attrFilterFields(L){","esquema de atributos");
if (/<button\b/i.test(rasterPropCode)||/<button\b/i.test(attrPropCode)) {
  throw new Error("Raster ou atributos ainda expõem ações dentro da ficha somente leitura");
}
if (!target.includes('id="lpStyleCopy"') || !target.includes('id="lpStylePaste"') ||
    !target.includes("if(!layerStylePaste(L))return;lpSyncCtrl();renderLpClasses()")) {
  throw new Error("Copiar/colar estilo não foi preservado no editor completo");
}
const layerMeasureCode=trechoEntre(target,"function measurePointInRing(","function layerTotals(","medição agregada da camada");
const layerMeasureSandbox={S:{workCRS:'EPSG:31982'},reproj:(a,b,x,y)=>[x,y],console:{warn(){}}};
vm.createContext(layerMeasureSandbox);
new vm.Script(layerMeasureCode+String.raw`
  const outer=[[0,0],[10,0],[10,10],[0,10],[0,0]];
  const hole=[[2,2],[4,2],[4,4],[2,4],[2,2]];
  const island=[[2.5,2.5],[3.5,2.5],[3.5,3.5],[2.5,3.5],[2.5,2.5]];
  const part=[[20,20],[25,20],[25,25],[20,25],[20,20]];
  const small=[[30,30],[32,30],[32,32],[30,32],[30,30]];
  const L={name:'Teste',gtype:'polygon',crs:'EPSG:31982',features:[
    {geom:[outer,hole,island,part],multi:true,props:{mostrar:0}},
    {geom:small,multi:false,props:{mostrar:1}}
  ]};
  const sq=[[0,0],[100,0],[100,100],[0,100],[0,0]],
    ret=[[0,0],[200,0],[200,100],[0,100],[0,0]],
    LA={name:'Área automática',gtype:'polygon',crs:'EPSG:31982',
      fields:[{name:'Area',type:'N',length:18,decimal:2},{name:'AREA_M2',type:'N',length:18,decimal:2}],
      features:[{geom:sq,multi:false,props:{Area:1.1,AREA_M2:7}}]};
  const importChanged=autoAreaSyncLayer(LA),importArea=LA.features[0].props.Area,
    importM2=LA.features[0].props.AREA_M2,dec=LA.fields[0].decimal;
  LA.features[0].geom=ret;const editChanged=autoAreaSyncLayer(LA);
  result={uma:measureFeature(L,L.features[0]),todas:layerSummaryMetrics(L),
    filtrada:layerSummaryMetrics(L,f=>f.props.mostrar),auto:{importChanged,importArea,importM2,dec,editChanged,
      editArea:LA.features[0].props.Area,editM2:LA.features[0].props.AREA_M2}};
`,{filename:"layer-properties-summary-test.js"}).runInContext(layerMeasureSandbox);
const lm=layerMeasureSandbox.result;
if (lm?.uma?.area!==122 || lm.uma.per!==72 || lm.uma.partes!==3 || lm.uma.furos!==1 ||
    lm?.todas?.area!==126 || lm.todas.features!==2 || lm.todas.vertices!==25 ||
    lm?.filtrada?.area!==4 || lm.filtrada.features!==1) {
  throw new Error("O total da camada não soma corretamente feições, multipartes, ilhas e furos");
}
if (lm?.auto?.importChanged!==1 || lm.auto.importArea!==1 || lm.auto.importM2!==7 ||
    lm.auto.dec!==6 || lm.auto.editChanged!==1 || lm.auto.editArea!==2 || lm.auto.editM2!==7) {
  throw new Error("O campo Area não acompanha automaticamente a geometria editada");
}
if (!target.includes("if(C&&C.f)autoAreaSyncFeature(L,C.f);else autoAreaSyncLayer(L);") ||
    !target.includes("if(L.gtype==='polygon')autoAreaSyncLayer(L);") ||
    !target.includes("autoAreaSyncAll();\n  /* Garante que os campos próprios da prancha ativa") ||
    !target.includes('data-derived-area="1" title="Calculado automaticamente pela geometria"') ||
    !target.includes("f.name!=='FID'&&!autoAreaFieldReadOnly(f)") ||
    !target.includes("const m=measureFeature(L,f);f.props[fname]=+(Number(m.area)||0).toFixed(2)") ||
    !target.includes("props:{...pr}")) {
  throw new Error("Recálculo automático não cobre desenho, tabela, projeto e exportação");
}

const defineWorkStart = target.indexOf("function defineCotaTrabalho(valor,silencioso)", tb.script);
const defineWorkEnd = target.indexOf("function populaMdts", defineWorkStart);
const defineWorkCode = target.slice(defineWorkStart, defineWorkEnd);
if (defineWorkStart < 0 || defineWorkEnd < 0 || !defineWorkCode.includes("d.baseZ=z") ||
    !defineWorkCode.includes("setWorkElevation?.(z)") ||
    !defineWorkCode.includes("z=cotaRedonda5(") ||
    /A\.objs|\.aneis\s*=|\.corredores\s*=|\bregen\s*\(/.test(defineWorkCode)) {
  throw new Error("Alterar a cota deve deslocar o projeto em Z sem regenerar ou reescrever sua geometria");
}
if (!target.includes("function cotaRedonda5(v,sentido)") ||
    !target.includes("function limitesCotaRedonda(R)") ||
    !target.includes("const passo=5;") ||
    !target.includes('id="cava2BaseZ" type="number" step="5"') ||
    !motor.includes('id="ccmgis_cota_trabalho" type="range" min="0" max="0" step="5"') ||
    !target.includes("piso=cavaArredondaCota(v,5,'min');teto=cavaArredondaCota(v,5,'max');")) {
  throw new Error("A cota de trabalho não reutiliza o arredondamento do motor em passos inteiros de 5 m");
}
if (!motor.includes('id="ccmgis_mdt"') || motor.indexOf('id="ccmgis_mdt"') > motor.indexOf('id="t_mover"')) {
  throw new Error("Escolher MDT não é o primeiro comando");
}
if (motor.indexOf('id="ccmgis_cortar_cava"') < motor.indexOf('id="b_png"')) {
  throw new Error("Cortar cava não é o último comando");
}
if (!target.includes("if(temDesign&&L._cava2DesignId===atual?.id)continue;") ||
    target.includes("L._cava2DesignId===atual?.id||L._cava2CutOf===atual?.id")) {
  throw new Error("A camada Interseção continua oculta dentro da aba Cava");
}
if (!target.includes("if(d.cutMdt&&corte?._cava2CutFinalized)return {on:false,crista:false,pe:false,rampa:false};") ||
    !cutPublicationCode.includes("F.visible=!finalizado") ||
    !cutPublicationCode.includes("CF.visible=finalizado") ||
    !cartographicCode.includes("F._cava2CutFillOf=d.id;F._cava2Role='cut-fill'") ||
    !target.includes("L?._cava2CutFillOf||null") ||
    !target.includes("q._cava2CutFillOf===id")) {
  throw new Error("O corte final ainda deixa a cava bruta/preenchimento integral sobre o produto recortado");
}
if (!cartographicCode.includes("['Interseção','#000000','',1.2,0]") ||
    !cartographicCode.includes("não foi possível formar uma interseção fechada e válida") ||
    !cartographicCode.includes("TOPOLOGIA:'anel fechado'")) {
  throw new Error("A Interseção não está fechada, preta, contínua e com espessura 1,2");
}
if (!motor.includes("function desenhaContexto(frente)") ||
    !motor.includes("desenhaContexto(false);") || !motor.includes("desenhaContexto(true);") ||
    !target.includes("foreground:!!c.L._cava2CutOf")) {
  throw new Error("A camada Interseção não é redesenhada em primeiro plano sobre a cava");
}
/* O PNG da orto/MDT pode estar no envelope Web Mercator. A aba Cava precisa
   transformar a imagem inteira por malha; converter somente SW/NE e chamar
   drawImage num retângulo reproduz o deslocamento que ocorria em UTM. */
const contextStart = target.indexOf("function georreferenciaMercatorDaImagem(llBounds,divisoes)", tb.script);
const contextEnd = target.indexOf("function visibilidadeDoDesenho", contextStart);
const contextCode = target.slice(contextStart, contextEnd);
if (contextStart < 0 || contextEnd < 0 ||
    !contextCode.includes("reproj('EPSG:4326','EPSG:3857'") ||
    !contextCode.includes("reproj('EPSG:3857',S.workCRS") ||
    !contextCode.includes("I._warpWM&&I._llbounds?georreferenciaMercatorDaImagem(I._llbounds,8)") ||
    !contextCode.includes("imageUrl:I.url,bounds:geo.bounds,mesh:geo.mesh") ||
    !contextCode.includes("I.overlay?.options?.opacity")) {
  throw new Error("A ortoimagem da aba Cava não conserva projeção, extensão integral e opacidade do Mapa 2D");
}
if (!motor.includes("function desenhaTrianguloImagem") ||
    !motor.includes("function desenhaImagemContexto") ||
    !motor.includes("desenhaTrianguloImagem(im,[x0,y0],[x1,y0],[x1,y1],p00,p10,p11)") ||
    !motor.includes("desenhaTrianguloImagem(im,[x0,y0],[x1,y1],[x0,y1],p00,p11,p01)")) {
  throw new Error("O renderizador da Cava não aplica a malha georreferenciada às imagens de contexto");
}
if (count(target, "<script") !== count(base, "<script") ||
    count(target, "</script>") !== count(base, "</script>")) {
  throw new Error("A estrutura externa de tags script divergiu da base");
}

console.log(JSON.stringify({
  bytes: Buffer.byteLength(target),
  sha256: sha256(target),
  basePreservedBeforeCava2: true,
  basePreservedAfterCava2: true,
  engineCompiles: true,
  bridgeCompiles: true,
  frozenPlateCapturesCurrentLayers: true,
  frozenFigureCapturesCurrentLayers: true,
  newLayersPersistAfterLayoutUpdate: true,
  layerOrderAndQgisFiltersPersistPerPlate: true,
  scaleBarBoxFollowsBarLength: true,
  scaleBarBoxFollowsTextSize: true,
  scaleBarContentFitsWithoutExcessWhitespace: true,
  labelFormulasSafeAst: true,
  labelFormulasPreviewAndValidation: true,
  labelFormulasMapLayoutKmlQgis: true,
  labelFormulasPersistInProjectAndStyles: true,
  labelFormulaConstantsAndGeometryVariables: true,
  propertyDockReadOnly: true,
  propertyDockShowsLayerTotals: true,
  layerAreaMatchesFeatureSum: true,
  multipartHolesMeasuredByContainment: true,
  polygonAreaAttributesAutoRecalculate: true,
  polygonAreaFieldsReadOnly: true,
  polygonAreaRevalidatedBeforeSaveAndExport: true,
  styleEditingPreservedInFullProperties: true,
  containerNullCoordinatesIgnored: true,
  containerLabelsShowEveryStack: true,
  containerCountLegendOnMap: true,
  containerCountLegendInLayout: true,
  containerCountMetadataPersists: true,
  rasterPolygonizerInGisTab: true,
  rasterPolygonizerClosedRegions: true,
  rasterPolygonizerHolesAndNoData: true,
  rasterPolygonizerFilterableAttributes: true,
  rasterPolygonizerConnectivity: true,
  rasterPolygonizerPerformanceGuard: true,
  rasterDissolveByValue: true,
  rasterDissolveByClassAttribute: true,
  rasterDissolveWithoutAttribute: true,
  rasterDissolveKeepsHolesAndMetrics: true,
  visibleIconButtons: iconButtons.length,
  coloredIcons: true,
  workMdtFirst: true,
  dynamicIntersectionLayer: true,
  intersectionVisibleInsideCaveTab: true,
  intersectionAboveCaveFill: true,
  orthophotoAlignedByProjectedMesh: true,
  orthophotoUsesFullPreviewBounds: true,
  intersectionClosedAndSimple: true,
  intersectionBlackSolidWeight12: true,
  finalCutIncludesPolygonFill: true,
  finalCutHidesRawParametricDesign: true,
  caveKeepsBelowDceKeepsAbove: true,
  workingElevationSlider: true,
  workingElevationRoundedToFive: true,
  entireCaveDceUsesWorkingElevation: true,
  ringsAndRampUseAbsoluteElevation: true,
  canonicalMdtVisibilityStyling: true,
  thematicStylePreservedAboveMdt: true,
  belowOpaqueMdtHidden: true,
  belowTranslucentMdtDashedWithHalo: true,
  planGeometryAndVertexCountPreserved: true,
  publishedZTranslatedRigidly: true,
  cartographicLineAndPolygonLayers: true,
  lineLayerAboveFillLayer: true,
  exactCaveAndDcePalettes: true,
  semanticLineFillValues: true,
  exteriorBoundaryBlackWeight26: true,
  fillBottomTopAndRampPublished: true,
  labelsConfiguredForMapLegendAndLayout: true,
  continuedBlocksAndLimitsPreserved: true,
  closedAnalyticalRingsIgnoreInputParts: true,
  mdtCutUsesClosedAnalyticalFeatures: true,
  cartographicPublicationApiExposed: true,
  caveSelectionTools: true,
  caveDrawingTools: true,
  clearAllVisible: true,
  finalCutLast: true,
  retiredCommandsHidden: true,
  chooseLineAfterEditVertices: true,
  tooltips: true,
  scriptOpenTokens: count(target, "<script"),
  scriptCloseTokens: count(target, "</script>")
}, null, 2));
