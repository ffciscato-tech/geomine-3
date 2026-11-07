#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m);};

const html=read('src/index.template.html');
const manifest=JSON.parse(read('src/module-order.json'));
const ribbon=read('src/core/parts/10-ribbon-ui-preferences.js');
const cad=read('src/core/parts/09-measurement-properties-cad.js');
const views=read('src/core/parts/17-layout-printing.js');
const persist=read('src/core/parts/26-project-persistence.js');
const css=read('src/styles/app.css');
const bridge=read('src/modules/mining/cava2-workspace.js');
const engine=read('src/modules/mining/cava2/cava-pilha-v09.html');
const dist=read('dist/CCMGIS_157_MARCA.html');

ok(html.includes('data-view="map">2D'),'aba 2D consolidada não abre o conjunto completo de camadas');
ok(!html.includes('data-view="cava2">2D'),'aba 2D ainda está presa ao editor de uma única cava');
ok(html.includes('data-view="cava2">Cava'),'aba principal Cava não aparece ao lado de 2D/3D/Layout');
ok(html.includes('id="propDockToggle"'),'controle para encolher propriedades não aparece na interface');
ok(html.includes('id="cava2Workspace"'),'área de trabalho 2D ausente');
ok(ribbon.includes("['cava-parametrica','Cava Paramétrica']"),'comando Cava Paramétrica ausente');
ok(!ribbon.includes("['cava2','Motor 2D']"),'comando redundante Motor 2D ainda aparece na Mineração');
ok(ribbon.includes("comando('mineracao','cava-parametrica',abreCava2)"),'Cava Paramétrica ainda não abre a Área 2D');
ok(views.includes("switchView('cava2')"),'troca para a área 2D não integrada');
ok(views.includes("{nome:'2D — todas as cavas e camadas'"),'planta consolidada não está identificada');
ok(views.includes("{nome:'Editor de Cava/DCE'"),'editor de Cava/DCE não está acessível');
ok(views.includes("ribbonBuild();switchView('map')"),'inicialização não abre a planta 2D consolidada');
ok(views.includes('mapVisible||cava2Visible'),'barra inferior não permanece visível na Área 2D');

const asset=manifest.assets.find(a=>a.path==='modules/mining/cava2-workspace.js');
ok(asset&&asset.embed_files&&asset.embed_files.__CCMGIS_CAVA2_V09_SOURCE__===
  'modules/mining/cava2/cava-pilha-v09.html','motor v0.9 não está modularmente incorporado');
ok(engine.includes('window.__api={objs, geraDesign'),'API do motor v0.9 ausente');
ok(engine.includes('cava2:changed'),'motor não informa alterações à ponte CCMGIS');
ok(engine.includes('cava2:cursor'),'motor não informa E/N/Z do cursor à barra inferior');
ok(engine.includes('frameElement.id==="cava2Frame"'),'motor incorporado não inicia vazio');
ok(engine.includes('Signika'),'motor 2D não usa Signika');
ok(engine.includes('body.ccmgis-claro')&&engine.includes('--painel:#ffffff'),'motor da cava permanece escuro com fundo branco');
ok(engine.includes('ctx.fillStyle="#ffffff"'),'fundo do desenho 2D não é branco');
ok(engine.includes('body.ccmgis-painel-fechado aside'),'painel de parâmetros não é recolhível');
ok(engine.includes('width:0;min-width:0;padding:0;border:0;overflow:hidden;visibility:hidden'),'painel recolhido ainda deixa conteúdo aparente');
ok(engine.includes('id="ccmgisPainelCorner"')&&engine.includes('cava2:panel-toggle'),'recolhedor dos parâmetros não fica no canto do painel');
ok(engine.includes('setContextLayers(v)'),'motor não recebe as camadas visíveis da planta 2D');
ok(engine.includes('setObjectVisibility(k,v)')&&engine.includes('if(!vis.on)return'),
  'desligar a camada Cava/DCE na árvore não oculta o desenho no motor');
ok(engine.includes('setObjectStyle(k,v)')&&engine.includes('sty[a.tp]'),
  'motor Cava/DCE não recebe cor, espessura, tracejado e transparência da camada 2D');
ok(engine.includes('cava2:cleared')&&bridge.includes('limpaCamadasDoDesenho'),
  'Limpar tudo não remove as camadas geradas pelo desenho atual');
ok(engine.includes('if(!vistaManual){ajustarVista();vistaManual=true;}')&&
  !engine.includes('setContextLayers(v){\n                contexto=Array.isArray(v)?v:[];\n                vistaManual=false'),
  'regenerar o limite ainda altera o zoom do usuário');
ok(engine.includes('const off=dh*prog;')&&engine.includes('let C = corr ? anelComRampa(')&&
  engine.includes('let T = corr && !oc.ov ? anelComRampa('),
  'a geometria original da rampa e das demais strings não foi restaurada');
ok(engine.includes('contextoImgCache')&&engine.includes('ctx.drawImage(im'),'rasters visíveis não são desenhados na aba Cava');
ok(engine.includes('new ResizeObserver')&&engine.includes('ro.observe($("wrap"))'),
  'quadrícula da cava não acompanha toda a altura disponível');
ok(engine.includes('<div id="painelSec"><canvas'),
  'painel de seção inicia aberto e deixa uma faixa vazia sob a quadrícula');
ok(bridge.includes('A.secAB={a:null,b:null}')&&engine.includes('desenhaSecPainel();'),
  'seção antiga ainda reduz a altura da quadrícula ao trocar/abrir uma cava');

for(const classe of ["'Crista'","'Pé'","'Rampa'","'Interseção'"])
  ok(bridge.includes(classe),'classificação ausente: '+classe);
ok(bridge.includes("mode:'cat'"),'camada do motor 2D não usa simbologia categorizada');
ok(bridge.includes("field:'ELEMENTO'"),'classificação da camada não usa o campo ELEMENTO');
ok(bridge.includes('_cava2DesignId'),'camada não mantém identidade estável por desenho');
ok(bridge.includes('cava2DesignTabs'),'abas de desenhos 2D independentes ausentes');
ok(bridge.includes('cava2NewCava')&&bridge.includes('cava2NewDce'),'criação independente de cavas e DCEs ausente');
ok(bridge.includes('contextoDasCamadas'),'modo Cava não desenha as mesmas camadas do modo 2D');
ok(bridge.includes('candidatos=[]')&&bridge.includes('amostragem proporcional')&&
  !bridge.includes('if(usados>=limite)break'),
  'curvas posteriores ainda são descartadas quando o contexto atinge o limite de vértices');
ok(bridge.includes('reduzCaminhoPreservandoForma')&&!bridge.includes('for(let i=0;i<c.P0.length;i+=disp)'),
  'modo Cava ainda reduz limites por salto regular e distorce quinas');
ok(bridge.includes('limitesDoOverlay')&&bridge.includes('imageUrl:r._url'),'superfícies do 2D não entram no fundo da aba Cava');
ok(bridge.includes("lista.addEventListener('click',atualiza,true)"),'visibilidade da árvore não atualiza o fundo da aba Cava');
ok(bridge.includes('visibilidadeDoDesenho')&&bridge.includes('aplicaVisibilidadeDesenho()'),
  'visibilidade das classes Crista/Pé/Rampa não é enviada ao motor Cava/DCE');
ok(bridge.includes('const antiga=new Map')&&bridge.includes('Object.assign(c,a'),
  'sincronizar uma cava/DCE perde a simbologia personalizada das classes');
ok(bridge.includes('estilosDoDesenho')&&bridge.includes('aplicaEstiloDesenho()'),
  'estilos da camada 2D não são enviados de volta ao motor Cava/DCE');
ok(bridge.includes('opacity:Number.isFinite(+c.st.opacity)')&&engine.includes('ctx.globalAlpha=op'),
  'transparência das camadas do mapa 2D não é reproduzida no modo Cava');
ok(bridge.includes("c.st.hatch!=='none'")&&engine.includes('function hachuraContexto('),
  'polígono transparente/hachurado do 2D recebe preenchimento diferente no modo Cava');
ok(engine.includes('function entradaOrtogonal(')&&
  engine.includes('c._entradaResto=originais')&&
  engine.includes('B1[0]={x:interno.x+nx*largura')&&engine.includes('B2[0]=interno')&&
  engine.includes('C[0]={x:(B1[0].x+B2[0].x)/2')&&
  !engine.includes('for(let i=1;i<fim;i++)')&&
  engine.includes('c.entradaExterna=B1[0]')&&engine.includes('c.entradaInterna=B2[0]')&&
  engine.includes('c.entradaLimite=[B2[0],B1[0]]')&&
  engine.includes('if(corredores.length)entradaOrtogonal(corredores[0],p.rampaL)')&&
  !engine.includes('.unshift({x:q.x')&&!engine.includes('function estendeEntradaExterna('),
  'a entrada não está externa ou alterou pontos depois do primeiro vértice');
ok(engine.includes('let encontroEntrada=null')&&
  engine.includes('const incorporaNoTracado=(a,tp)=>')&&
  engine.includes('a.partesEntrada=partes')&&
  engine.includes('encontroEntrada.anelIndices[tp]=aneis.indexOf(a)')&&
  engine.includes('partes[ext.pi]=ext.lado==="fim"')&&
  bridge.includes('(a.partesEntrada||recorte.partes||[])')&&
  !bridge.includes('Encontro exclusivo da entrada da rampa')&&
  !engine.includes('const pontes=[]')&&!bridge.includes('(design.pontes||[]).forEach'),
  'o traçado real da crista e do pé não termina no mesmo ponto da entrada');
ok(engine.includes('tracaAnel(a.P,s.color,s.weight,s.dash,s.opacity)')&&
  engine.includes('ctx.closePath()')&&
  engine.includes('const dentro=subArco(wideA')&&
  engine.includes('const fora=subArco(baseA')&&
  !engine.includes('const entrada=[]')&&!engine.includes('suav=u*u*(3-2*u)')&&
  !engine.includes('function tracaAnelSemCortes(')&&
  engine.includes('for(const P of [c.borda1,c.borda2])')&&
  engine.includes('ctx.globalAlpha=op*fill')&&
  engine.includes('if(fill>0)for(const P of rampPolys)')&&
  !engine.includes('if(vis.crista)preencheAnel(')&&
  !engine.includes('if(vis.pe)preencheAnel(')&&
  engine.includes('for(const P of [c.borda1,c.borda2])'),
  'o modo Cava não preserva o preenchimento translúcido da rampa ou criou tampa transversal');
ok(engine.includes('function recortaLinhaForaRampas(')&&
  engine.includes('recortaLinhaForaRampas(a.P,rampPolys,a.cortesRampa)')&&
  engine.includes('P._cortesRampa=[')&&
  engine.includes('const corredores=[]')&&
  !engine.includes('encontrosFace')&&
  !engine.includes('aneisPorTipo')&&
  engine.includes('tracaLinhaAberta(parte,s.color,s.weight,s.dash,s.opacity)')&&
  engine.includes('(a.partesEntrada||recorte.partes)')&&
  bridge.includes("typeof A.recortaLinhaForaRampas==='function'")&&
  bridge.includes('A.recortaLinhaForaRampas(a.P,rampPolys,a.cortesRampa)')&&
  !bridge.includes('design.encontrosFace'),
  'a lógica voltou a criar emendas ao longo das bancadas');
ok(bridge.includes("b.textContent=estado.painelFechado?'›':'‹'"),'parâmetros da cava não podem ser encolhidos e reabertos');
ok(bridge.includes('aplicaPainel();salvaRegistroLocal()'),'estado recolhido dos parâmetros não é memorizado');
ok(bridge.includes('ccmgis2DDesignRegistryV2'),'abas de Cava/DCE não sobrevivem à atualização da página');
ok(bridge.includes('function preparaExclusaoCamada(')&&bridge.includes('function removeDesenhoDaCamada(')&&
  bridge.includes('function restauraExclusaoCamada('),
  'excluir uma camada Cava/DCE não remove/restaura seu desenho como entidade única');
ok(cad.includes('beforeLayerDelete')&&cad.includes('onLayerDeleted')&&cad.includes('restoreLayerDeletion'),
  'a exclusão geral de camadas não está ligada ao ciclo de vida da Cava/DCE');
ok(bridge.includes('openMiningMode:abreModoCava'),'modo Cava e aba 2D não compartilham a mesma instância');
ok(bridge.includes('syncTheme:aplicaTemaNoMotor'),'tema branco do CCMGIS não é enviado ao motor da cava');
ok(ribbon.includes('CCMGISCava2.openMiningMode()'),'comando Cava não reapresenta a mesma Área 2D');
ok(bridge.includes('version:2,activeId'),'registro de múltiplos desenhos não é persistido');
ok(bridge.includes("src:'Área 2D · Cava2'"),'origem das camadas 2D não foi identificada');
ok(bridge.includes('id="cava2Mdt"')&&bridge.includes('id="cava2CutMdt"'),
  'seleção do MDT e comando de interseção não aparecem na Área 2D');
ok(bridge.includes('cavaRecortaAneisFechadosNoMdt'),
  'Área 2D não reutiliza o algoritmo de interseção da cava paramétrica v1');
ok(bridge.includes('_cava2CutOf')&&bridge.includes('_cava2MdtId'),
  'produto da interseção não mantém vínculo estável com desenho e MDT');
ok(bridge.includes('d.cutMdt?publicaCorteMdt(d,design,true,false):null')&&
  bridge.includes('JSON.stringify(d.engine||{})'),
  'interseção com o MDT não é recalculada dinamicamente após editar o limite');
ok(bridge.includes("addEventListener('cava2:changed'"),'sincronização automática não escuta o motor');
ok(bridge.includes('function ligaFerramentasGlobais'),'ferramentas inferiores não controlam o motor 2D');
ok(bridge.includes("tool==='pan'?'t_mover'"),'Pan da barra global não ativa o Pan do motor Cava');
ok(engine.includes('function verticeEditavelEm(')&&engine.includes('o.base.splice(v.vi,1)')&&
  !engine.includes('function iniciaEdicaoAnel(')&&!engine.includes('o.overrides[v.idx]=P.filter')&&
  !engine.includes('marcaInsercoes(P,"#d33682")')&&
  !engine.includes('sel && sel.alvo===k && ferramenta==="editar"'),
  'a edição não ficou restrita exclusivamente ao limite externo');
ok(engine.includes('function marcaInsercoes(')&&engine.includes('function acrescentaVertice(')&&
  engine.includes('o.base.splice(v.i+1,0'),
  'botão + intermediário não acrescenta um vértice entre os quadrados originais');
ok(bridge.includes("addEventListener('cava2:cursor'"),'barra inferior não recebe o cursor do motor 2D');
ok(bridge.includes("S._view==='v3d'"),'alterações não atualizam a Visão 3D quando ela está aberta');
ok(bridge.includes('S.selFeat'),'ponte não lê a seleção atual do CCMGIS');
ok(persist.includes('CCMGISCava2.snapshot'),'estado do motor 2D não é salvo no .ccmgis');
ok(persist.includes('restoreProjectState(d.cava2||null)'),'estado do motor 2D não é restaurado');
ok(persist.includes('_cava2DesignId:L._cava2DesignId'),'identidade das camadas 2D não é persistida');
ok(persist.includes('_cava2Engine:L._cava2Engine'),'receita editável da aba não é persistida junto da camada');
ok(persist.includes('_cava2CutOf:L._cava2CutOf')&&persist.includes('_cava2MdtId:L._cava2MdtId'),
  'vínculo da camada cortada pelo MDT não é persistido no projeto');
ok(css.includes('--mono:"Signika"'),'família auxiliar ainda diverge da Signika');
ok(css.includes('prop-dock-collapsed #propDock'),'painel de propriedades não possui estado recolhido');
ok(ribbon.includes('ccmgisPropDockCollapsedV1'),'estado recolhido das propriedades não é memorizado');

/* Ensaio funcional do contrato 3D: anel fechado, classe e Z absoluto por
   vértice; as três strings da rampa mantêm a inclinação ponto a ponto. */
const source=bridge.replace('__CCMGIS_CAVA2_V09_SOURCE__',JSON.stringify(engine));
const context={window:{},document:{getElementById:()=>null},console,setTimeout,clearTimeout,
  localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  S:{layers:[],activeId:null,workCRS:'EPSG:31982',_view:'map'}};
context.window.window=context.window;
vm.runInNewContext(source,context,{filename:'cava2-workspace.js'});
const converter=context.window.CCMGISCava2._featuresFromDesign;
const reduzir=context.window.CCMGISCava2._reduceContextPath;
const feats=converter({
  aneis:[{P:[{x:0,y:0},{x:10,y:0},{x:10,y:10}],z:-10,tp:'crista'},
    {P:[{x:1,y:1},{x:9,y:1},{x:9,y:9}],z:-20,tp:'pe'}],
  corredores:[{borda1:[{x:0,y:0,z:-10},{x:5,y:0,z:-15}],
    centro:[{x:0,y:1,z:-10},{x:5,y:1,z:-15}],
    borda2:[{x:0,y:2,z:-10},{x:5,y:2,z:-15}]}]
},820);
ok(feats.length===5,'quantidade incorreta de strings 3D publicadas');
ok(feats[0].geom.length===4&&feats[0].zg.every(z=>z===810),'anel 3D não fecha ou não aplica a cota-base');
ok(feats[1].props.ELEMENTO==='Pé'&&feats[1].zg.every(z=>z===800),'classificação/cota do pé incorreta');
ok(feats.slice(2).every(f=>f.props.ELEMENTO==='Rampa'),'corredor não foi classificado como Rampa');
ok(feats.slice(2).every(f=>f.zg[0]===810&&f.zg[1]===805),'rampa perdeu a inclinação 3D');

/* A camada principal e o corte MDT pertencem ao mesmo desenho. Apagar uma
   remove as duas e a aba; o mesmo snapshot recompõe tudo no Ctrl+Z. */
const C2=context.window.CCMGISCava2,st=C2.state,idDel='cava2-teste-exclusao',
  main={id:501,name:'Cava — Teste',_cava2DesignId:idDel},
  cut={id:502,name:'Cava — Teste — interseção',_cava2CutOf:idDel};
st.desenhos=[{id:idDel,nome:'Teste',tipo:'cava',engine:{bases:{cava:[[0,0],[1,0],[0,1]]}},baseZ:820,cutMdt:true}];
st.desenhoId=idDel;context.S.layers=[main,cut];context.S.activeId=main.id;
const delSnap=C2.beforeLayerDelete(main);
context.S.layers=context.S.layers.filter(L=>L!==main); // etapa executada pelo núcleo
ok(C2.onLayerDeleted(main,delSnap),'o desenho associado à camada não foi removido');
ok(!st.desenhos.length&&!context.S.layers.length&&st.desenhoId===null,
  'a exclusão deixou aba, receita ou camada derivada órfã');
context.S.layers.push(main); // primeira etapa do Ctrl+Z geral
ok(C2.restoreLayerDeletion(delSnap,main),'o conjunto excluído não foi restaurado');
ok(st.desenhos.length===1&&st.desenhoId===idDel&&context.S.layers.includes(main)&&context.S.layers.includes(cut),
  'Ctrl+Z não restaurou desenho, aba, camada principal e corte MDT juntos');

/* Limite retangular densificado: a redução usada no fundo da aba Cava deve
   conservar as quatro quinas, não arredondar/distorcer o polígono. */
const ret=[];
for(let i=0;i<=100;i++)ret.push([i,0]);
for(let i=1;i<=60;i++)ret.push([100,i]);
for(let i=99;i>=0;i--)ret.push([i,60]);
for(let i=59;i>=0;i--)ret.push([0,i]);
ret.push([0,0]);
const retRed=reduzir(ret,24,true),chave=p=>p[0]+','+p[1],setRet=new Set(retRed.map(chave));
for(const canto of [[0,0],[100,0],[100,60],[0,60]])
  ok(setRet.has(chave(canto)),'redutor do contexto perdeu a quina '+chave(canto));

ok(!dist.includes('__CCMGIS_CAVA2_V09_SOURCE__'),'placeholder do motor vazou para o dist');
ok(dist.includes('id="cava2-workspace-module"'),'módulo Área 2D ausente do dist');
const m=dist.match(/const CAVA2_V09_SOURCE=("(?:\\.|[^"\\])*");\nconst STORAGE_KEY=/);
ok(m,'literal incorporado do motor não foi localizado');
ok(JSON.parse(m[1])===engine,'o motor incorporado difere do arquivo modular v0.9');

console.log('OK: Área 2D principal, seleção/desenho v0.9, camadas categorizadas e Z/3D integrados.');
