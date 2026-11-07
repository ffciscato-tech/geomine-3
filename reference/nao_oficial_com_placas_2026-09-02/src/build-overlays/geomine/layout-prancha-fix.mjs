import { aplicaRotulosFormula } from "./label-formula-feature.mjs";
import { aplicaResumoPropriedadesCamada } from "./layer-properties-summary-feature.mjs";
import { aplicaAreaAutomatica } from "./auto-area-feature.mjs";

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Trecho não encontrado: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Trecho ambíguo (mais de uma ocorrência): ${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function replaceExactCount(source, search, replacement, expected, label) {
  const found = source.split(search).length - 1;
  if (found !== expected) throw new Error(`Quantidade inesperada em ${label}: ${found} (esperado ${expected})`);
  return source.split(search).join(replacement);
}

/* Corrige a fotografia de camadas usada pelo Layout congelado. O código-base
   dava prioridade ao estado existente quando o usuário entrou no Layout;
   assim, “Atualizar” reaplicava a composição antiga logo depois do clique.
   Um rascunho completo passa a registrar o que está visível na árvore. */
export function corrigeAtualizacaoPrancha(source) {
  let out = source;
  out = replaceOnce(
    out,
`    if(S.loFrozen&&typeof layoutFrozenDirty==='function')layoutFrozenDirty(true);`,
`    if(S.loFrozen){
      if(typeof layoutVisSnapshot==='function')S._loDraftVis=layoutVisSnapshot();
      if(typeof layoutFrozenDirty==='function')layoutFrozenDirty(true);
    }`,
    "rascunho completo ao mudar a visibilidade no Layout"
  );
  out = replaceOnce(
    out,
`  if(S.loFrozen && S.loMode==='a4'){
    if(typeof layoutFrozenDirty==='function')layoutFrozenDirty(true);
    return;
  }`,
`  if(S.loFrozen && (S.loMode==='a4'||S.loMode==='fig')){
    try{
      /* Qualquer edição feita enquanto a prancha está visível pertence à
         composição que o usuário está vendo, inclusive quando ela altera
         apenas ordem, filtro, rótulo ou simbologia. */
      S._loDraftVis={...layoutVisSnapshot()};
    }catch(e){}
    if(typeof layoutFrozenDirty==='function')layoutFrozenDirty(true);
    return;
  }`,
    "mudanças pendentes em Figura e Prancha"
  );
  out = replaceOnce(
    out,
`  S.layers=nodes.filter(n=>n.t==='L').map(n=>n.o);   // ordem dos vetores segue a pilha
  zApply(); refreshUI();
}
function addGroup(){`,
`  S.layers=nodes.filter(n=>n.t==='L').map(n=>n.o);   // ordem dos vetores segue a pilha
  zApply(); refreshUI();
  if(typeof layoutSeVisivel==='function')layoutSeVisivel();
}
function addGroup(){`,
    "ordem de camadas marca a prancha como pendente"
  );
  out = replaceOnce(
    out,
`function layoutVectorConvention(L){
  return {name:L.name,color:L.color,weight:L.weight,fill:L.fill,
    sym:layoutClone(L.sym||null),labelField:L.labelField||'',
    labelFields:Array.isArray(L.labelFields)?L.labelFields.slice():null,
    lbl:layoutClone(L.lbl||null),attrFilter:layoutClone(L.attrFilter||null)};
}`,
`function layoutVectorConvention(L){
  return {name:L.name,color:L.color,weight:L.weight,fill:L.fill,
    sym:layoutClone(L.sym||null),labelField:L.labelField||'',
    labelFields:Array.isArray(L.labelFields)?L.labelFields.slice():null,
    lbl:layoutClone(L.lbl||null),attrFilter:layoutClone(L.attrFilter||null),
    attrFilterRules:layoutClone(L.attrFilterRules||null),attrFilterLogic:L.attrFilterLogic||'AND'};
}`,
    "filtro QGIS completo por prancha"
  );
  out = replaceOnce(
    out,
    `      L.lbl=layoutClone(c.lbl||null);L.attrFilter=layoutClone(c.attrFilter||null);`,
    `      L.lbl=layoutClone(c.lbl||null);L.attrFilter=layoutClone(c.attrFilter||null);
      L.attrFilterRules=layoutClone(c.attrFilterRules||null);L.attrFilterLogic=c.attrFilterLogic||'AND';`,
    "restauração do filtro QGIS completo"
  );
  out = replaceOnce(
    out,
`      vis=pre&&pre.vis?{...pre.vis}:visAtual;
      const convMudou=pl.conv&&!layoutStateEqual(convAtual,pl.conv);`,
`      const visMudou=pl.vis&&!layoutStateEqual(visAtual,pl.vis),
        preMesclada=pre&&pre.vis?{...visAtual,...pre.vis}:visAtual;
      vis={...(S._loDraftVis||(visMudou?visAtual:preMesclada))};
      const convMudou=pl.conv&&!layoutStateEqual(convAtual,pl.conv);`,
    "captura atual da visibilidade da prancha"
  );
  out = replaceOnce(
    out,
`      if(S._loAppliedPlateId===pl.id&&!S._loRestoringConv){
        const cc=layoutConventionSnapshot(),ss=(S.stack||[]).slice();
        if(!layoutStateEqual(cc,pl.conv))S._loDraftConv=layoutClone(cc);`,
`      if(S._loAppliedPlateId===pl.id&&!S._loRestoringConv){
        const vv=layoutVisSnapshot(),cc=layoutConventionSnapshot(),ss=(S.stack||[]).slice();
        if(!layoutStateEqual(vv,pl.vis))S._loDraftVis={...vv};
        if(!layoutStateEqual(cc,pl.conv))S._loDraftConv=layoutClone(cc);`,
    "preservação da visibilidade pendente antes de reaplicar a prancha"
  );
  out = replaceExactCount(
    out,
    `S._loAppliedPlateId=null; S._loDraftConv=null; S._loDraftStack=null;`,
    `S._loAppliedPlateId=null; S._loDraftVis=null; S._loDraftConv=null; S._loDraftStack=null;`,
    2,
    "limpeza do rascunho ao entrar/sair do Layout"
  );
  out = replaceExactCount(
    out,
    `S._loAppliedPlateId=pl.id;S._loDraftConv=null;S._loDraftStack=null;`,
    `S._loAppliedPlateId=pl.id;S._loDraftVis=null;S._loDraftConv=null;S._loDraftStack=null;`,
    2,
    "limpeza do rascunho depois de capturar/aplicar a prancha"
  );
  out = replaceOnce(
    out,
    `S.loFrozen=true; S._figFrozenVis=null;`,
    `S.loFrozen=true; S._figFrozenVis=null; S._loDraftVis=null;`,
    "estado inicial do rascunho de visibilidade"
  );
  out = replaceOnce(
    out,
`function loApplyAll(){
  /* Este é o ÚNICO comando que substitui a composição congelada da prancha.
     Sliders continuam gravando os campos próprios, mas camadas, ordem,
     filtros e convenções só entram no instantâneo por esta ação explícita. */
  if(typeof plateCapture==='function')
    plateCapture(S.loMode==='a4'?{captureState:true}:undefined);
  buildLayout();
  toast(S.loMode==='a4'?'Prancha atualizada e congelada':'Layout atualizado');
}`,
`function loApplyAll(){
  /* Este é o ÚNICO comando que substitui a composição congelada da prancha.
     Sliders continuam gravando os campos próprios, mas camadas, ordem,
     filtros e convenções só entram no instantâneo por esta ação explícita. */
  if(typeof plateCapture==='function')
    plateCapture(S.loMode==='a4'?{captureState:true}:undefined);
  if(S.loMode==='fig'){
    const visAtual=layoutVisSnapshot(),pre=S._preLayoutMapState,
      visMudou=S._figFrozenVis&&!layoutStateEqual(visAtual,S._figFrozenVis),
      preMesclada=pre&&pre.vis?{...visAtual,...pre.vis}:visAtual;
    S._figFrozenVis={...(S._loDraftVis||(visMudou?visAtual:preMesclada))};
    if(pre)pre.vis={...S._figFrozenVis};
    S._loDraftVis=null;layoutFrozenDirty(false);
  }
  buildLayout();
  toast(S.loMode==='a4'?'Prancha atualizada e congelada':'Layout atualizado');
}`,
    "Atualizar figura captura a composição atual"
  );
  out = replaceOnce(
    out,
`  const barBaseFS=1.25;
  const barFS=barBaseFS*barTextFS;                           // somente a tipografia da escala
  const BH=2.35*barBaseFS, BOXPAD=2.6;                       // a barra mantém sua espessura
  /* A caixa apenas ganha a folga necessária para não cortar uma fonte maior;
     os segmentos e sua geometria não são redimensionados por este controle. */
  const barTextRoom=Math.max(barBaseFS,barFS);
  const boxW=barMM+2*BOXPAD+11*barTextRoom, boxH=BH+11.2*barTextRoom;
  const boxX=mL+3, boxY=mT+mapH-boxH-3;                      // canto inferior esquerdo da moldura
  const bx=boxX+BOXPAD, by=boxY+4.5*barTextRoom;`,
`  const barLabels = Array.from({length:NSEG+1},(_,i)=>lbl(i));
  const scaleLabel='1:'+Math.round(scale).toLocaleString('pt-BR');
  const barBaseFS=1.25;
  const barFS=barBaseFS*barTextFS;                           // somente a tipografia da escala
  const BH=2.35*barBaseFS;                                  // a barra mantém sua espessura
  /* A moldura acompanha a extensão real estimada dos textos e da régua.
     Antes havia uma reserva fixa de 11× a fonte à direita; ao encurtar a
     barra essa reserva virava um grande retângulo branco vazio. */
  const barGeo=layoutScaleBarGeometry(barMM,barFS,BH,barLabels,unit,scaleLabel);
  const boxW=barGeo.boxW,boxH=barGeo.boxH;
  const boxX=mL+3, boxY=mT+mapH-boxH-3;                      // canto inferior esquerdo da moldura
  const bx=boxX+barGeo.bxOffset, by=boxY+barGeo.byOffset;`,
    "moldura justa da escala gráfica"
  );
  out = replaceOnce(
    out,
    `  const barLabels=Array.from({length:NSEG+1},(_,i)=>lbl(i));`,
    `  /* rótulos calculados antes da moldura para dimensioná-la pelo conteúdo */`,
    "rótulos únicos da escala gráfica"
  );
  out = replaceOnce(
    out,
    `font-weight="700">1:\${Math.round(scale).toLocaleString('pt-BR')}</text>`,
    `font-weight="700">\${scaleLabel}</text>`,
    "denominador reutilizado no dimensionamento da escala gráfica"
  );
  out = replaceOnce(
    out,
    `async function buildLayout(){`,
`function layoutScaleBarGeometry(barMM,barFS,BH,barLabels,unit,scaleLabel){
  const labelFont=3.25*barFS,scaleFont=3.15*barFS;
  const textMM=(txt,fs,bold)=>String(txt).length*fs*0.58*(bold?1.04:1);
  const padX=Math.max(1.2,0.55*barFS),padY=Math.max(1,0.5*barFS);
  const leftOverflow=textMM(barLabels[0]||'0',labelFont,false)/2;
  const rightOverflow=Math.max(
    textMM(barLabels[barLabels.length-1]||'',labelFont,false)/2,
    4*barFS+textMM(unit,labelFont,true));
  const contentLeft=-leftOverflow;
  const contentRight=Math.max(barMM+rightOverflow,textMM(scaleLabel,scaleFont,true));
  const contentTop=Math.min(0,-1.35-0.78*scaleFont);
  const contentBottom=Math.max(BH+1,BH+4.7*barFS+0.24*labelFont);
  return {boxW:contentRight-contentLeft+2*padX,
    boxH:contentBottom-contentTop+2*padY,
    bxOffset:padX-contentLeft,byOffset:padY-contentTop,
    padX,padY,contentLeft,contentRight,contentTop,contentBottom};
}
async function buildLayout(){`,
    "geometria da moldura da escala gráfica"
  );

  /* Uma coordenada inválida já era descartada ao desenhar o símbolo de ponto,
     mas ainda seguia pelo caminho independente do rótulo. O Leaflet aceitava
     temporariamente esse marcador sem posição e depois falhava em project(null),
     interrompendo o redesenho — exatamente o erro observado na contagem. */
  out = replaceOnce(
    out,
`      else if(txt!=null && cfg.onMap!==false){
        const ap=labelAnchorPt(L,f);
        if(ap){
          const w=toWGS(L.crs,ap[0],ap[1]);`,
`      else if(txt!=null && cfg.onMap!==false){
        const ap=labelAnchorPt(L,f);
        if(Array.isArray(ap)&&Number.isFinite(ap[0])&&Number.isFinite(ap[1])){
          const w=toWGS(L.crs,ap[0],ap[1]);
          if(!Array.isArray(w)||!Number.isFinite(w[0])||!Number.isFinite(w[1]))return;`,
    "rótulo ignora âncora ou reprojeção nula"
  );
  out = replaceOnce(
    out,
`      const w=toWGS(L.crs,px,py);
      // \\u00e2ngulo no plano do CRS de trabalho, convertido para o sentido da tela`,
`      const w=toWGS(L.crs,px,py);
      if(!Array.isArray(w)||!Number.isFinite(w[0])||!Number.isFinite(w[1]))return;
      // \\u00e2ngulo no plano do CRS de trabalho, convertido para o sentido da tela`,
    "rótulo repetido ignora reprojeção nula"
  );
  out = replaceOnce(
    out,
`          const w=toWGS(L.crs,mx,my);
          const rot=d>=1000 ?`,
`          const w=toWGS(L.crs,mx,my);
          if(!Array.isArray(w)||!Number.isFinite(w[0])||!Number.isFinite(w[1]))continue;
          const rot=d>=1000 ?`,
    "cota de segmento ignora reprojeção nula"
  );
  out = replaceOnce(
    out,
`function featToLatLngs(L, f){
  const conv=(pt)=>{const w=toWGS(L.crs,pt[0],pt[1]);return [w[1],w[0]];};
  /* BLINDAGEM (24/08): ponto não finito ou anel aninhado por engano viravam
     "Invalid LatLng (NaN,NaN)" e derrubavam TODO o desenho da camada — foi
     o que travou a pilha da 4ª bancada em diante. O inválido é descartado
     em vez de quebrar a tela. */
  const ok=q=>Array.isArray(q)&&Number.isFinite(q[0])&&Number.isFinite(q[1]);
  if(L.gtype==='point'){ return (f.geom||[]).filter(ok).map(conv); }
  if(f.multi && Array.isArray(f.geom[0][0]))
    return f.geom.map(r=>(r||[]).filter(ok).map(conv)).filter(r=>r.length>1);
  let g=f.geom||[];
  if(g.length&&Array.isArray(g[0])&&Array.isArray(g[0][0])){
    /* anel aninhado sem multi: usa o maior */
    let maior=g[0];
    for(const an of g)if(Array.isArray(an)&&an.length>maior.length)maior=an;
    g=maior;
  }
  return g.filter(ok).map(conv);
}`,
`function featToLatLngs(L, f){
  const ok=q=>Array.isArray(q)&&Number.isFinite(q[0])&&Number.isFinite(q[1]);
  const conv=pt=>{
    if(!ok(pt))return null;
    const w=toWGS(L.crs,pt[0],pt[1]);
    return ok(w)?[w[1],w[0]]:null;
  };
  /* BLINDAGEM: valida também o RESULTADO da reprojeção. Coordenadas nulas
     salvas em um projeto não podem chegar ao Leaflet nem como geometria,
     nem como rótulo, seleção, enquadramento ou cálculo de limites. */
  if(L.gtype==='point')return (f.geom||[]).map(conv).filter(ok);
  if(f.multi && Array.isArray(f.geom[0][0]))
    return f.geom.map(r=>(r||[]).map(conv).filter(ok)).filter(r=>r.length>1);
  let g=f.geom||[];
  if(g.length&&Array.isArray(g[0])&&Array.isArray(g[0][0])){
    /* anel aninhado sem multi: usa o maior */
    let maior=g[0];
    for(const an of g)if(Array.isArray(an)&&an.length>maior.length)maior=an;
    g=maior;
  }
  return g.map(conv).filter(ok);
}`,
    "reprojeção segura para todas as geometrias"
  );
  out = replaceOnce(
    out,
`  let lls=featToLatLngs(L,f);
  if(selParteValida(S.selFeat,L,f)){
    const partes=featPartesLatLng(L,f);lls=(L.gtype==='point')?partes[partIdx]:partes[partIdx];
  }
  const PN={pane:'alagis_desenho', interactive:false};`,
`  let lls=featToLatLngs(L,f);
  if(selParteValida(S.selFeat,L,f)){
    const partes=featPartesLatLng(L,f);lls=partes[partIdx];
  }
  const llValida=q=>Array.isArray(q)&&Number.isFinite(q[0])&&Number.isFinite(q[1]);
  const temLatLng=a=>llValida(a)||(Array.isArray(a)&&a.some(temLatLng));
  if(!temLatLng(lls))return;
  const PN={pane:'alagis_desenho', interactive:false};`,
    "seleção ignora feição sem coordenadas"
  );

  /* O resultado da detecção precisa de uma legenda própria. O detector por
     campos mantém o recurso funcionando depois de salvar/reabrir o projeto,
     pois metadados internos antigos não eram persistidos e o usuário pode
     inclusive renomear a camada. */
  out = replaceOnce(
    out,
`function refreshUI(){`,
`function containerCountLayerRole(L){
  if(!L)return '';
  const papel=L._containerCount&&L._containerCount.papel;
  if(papel==='pontos'||papel==='pegadas')return papel;
  const nome=String(L.name||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();
  if(/^contagem de conteineres(?:\\s|—|-|$)/.test(nome))return 'pontos';
  if(/^conteineres reconhecidos(?:\\s|—|-|$)/.test(nome))return 'pegadas';
  const campos=new Set((L.fields||[]).map(c=>String(typeof c==='string'?c:c&&c.name||'').toUpperCase()));
  const assinatura=['TIPO','EMPILHADOS','COMP_M','LARG_M'].every(c=>campos.has(c));
  if(!assinatura)return '';
  return L.gtype==='point'?'pontos':L.gtype==='polygon'?'pegadas':'';
}
function containerCountSummaryFromLayer(L){
  if(!containerCountLayerRole(L))return null;
  const temCoordenada=a=>Array.isArray(a)&&
    ((Number.isFinite(a[0])&&Number.isFinite(a[1]))||a.some(temCoordenada));
  const feats=(L.features||[]).filter(f=>{
    if(!f||!f.props||!temCoordenada(f.geom))return false;
    try{return typeof featureVisible!=='function'||featureVisible(L,f);}catch(e){return true;}
  });
  const niveis={};let total=0,c12=0,c24=0,posicoes=0;
  feats.forEach(f=>{
    const p=f.props||{},n=Math.max(1,Math.round(+p.EMPILHADOS||1)),tipo=String(p.TIPO||'');
    posicoes++;total+=n;niveis[n]=(niveis[n]||0)+1;
    if(/12/.test(tipo))c12+=n;else if(/24/.test(tipo))c24+=n;
  });
  if(!posicoes)return null;
  return {posicoes,total,c12,c24,niveis};
}
function containerCountVisibleLayer(){
  const vis=(S.layers||[]).filter(L=>L&&L.visible!==false&&containerCountLayerRole(L));
  return vis.find(L=>containerCountLayerRole(L)==='pontos')||vis[0]||null;
}
function containerCountLevelsText(R){
  return Object.keys(R&&R.niveis||{}).map(Number).filter(Number.isFinite).sort((a,b)=>a-b)
    .map(n=>R.niveis[n]+' '+(R.niveis[n]===1?'posição':'posições')+' × '+n+' '+(n===1?'nível':'níveis')).join(' · ');
}
function containerCountLegendSync(){
  const host=document.getElementById('map');if(!host)return;
  let el=document.getElementById('containerCountLegend');
  const L=containerCountVisibleLayer(),R=L&&containerCountSummaryFromLayer(L);
  if(!R){if(el)el.remove();return;}
  if(!el){
    el=document.createElement('div');el.id='containerCountLegend';
    el.setAttribute('role','status');el.setAttribute('aria-label','Legenda da contagem de contêineres');
    el.style.cssText="position:absolute;top:14px;right:72px;z-index:1250;min-width:245px;max-width:340px;"+
      "pointer-events:none;background:rgba(255,255,255,.95);border:1px solid #9db2c5;border-radius:8px;"+
      "box-shadow:0 3px 12px rgba(16,39,58,.22);padding:9px 11px;color:#17324a;"+
      "font:500 13px/1.35 'Signika',sans-serif;";
    host.appendChild(el);
  }
  const niveis=containerCountLevelsText(R);
  el.innerHTML='<div style="font-size:12px;font-weight:700;letter-spacing:.055em;margin-bottom:5px">CONTAGEM DE CONTÊINERES</div>'+
    '<div style="display:flex;align-items:center;gap:7px"><span style="width:12px;height:12px;border-radius:50%;background:#ef8d32;border:1px solid #b75d13"></span>'+
    '<span><b style="font-size:16px">'+R.total.toLocaleString('pt-BR')+'</b> unidade'+(R.total===1?'':'s')+
    ' em <b>'+R.posicoes.toLocaleString('pt-BR')+'</b> '+(R.posicoes===1?'posição':'posições')+'</span></div>'+
    '<div style="margin-top:4px"><b>12′:</b> '+R.c12.toLocaleString('pt-BR')+
    ' &nbsp; <b>24′:</b> '+R.c24.toLocaleString('pt-BR')+'</div>'+
    (niveis?'<div style="margin-top:2px;color:#587087">'+esc(niveis)+'</div>':'');
}
function refreshUI(){`,
    "legenda viva da contagem no mapa"
  );
  out = replaceOnce(
    out,
`  if(S._view==='v3d'&&typeof v3Auto==='function')setTimeout(()=>v3Auto(),0);
}
function syncSymPanel(){`,
`  if(S._view==='v3d'&&typeof v3Auto==='function')setTimeout(()=>v3Auto(),0);
  try{containerCountLegendSync();}catch(e){console.warn('legenda de contêineres',e);}
}
function syncSymPanel(){`,
    "sincronização da legenda de contagem"
  );
  out = replaceOnce(
    out,
`function drawLayer(L){
  L._snapCache=null; L._endCache=null;`,
`function drawLayer(L){
  /* Cada posição reconhecida precisa conservar seu número, ainda que várias
     tenham o mesmo empilhamento. Camadas antigas com rótulo por ID também
     passam a abrir diretamente com a quantidade de unidades. */
  if(typeof containerCountLayerRole==='function'&&containerCountLayerRole(L)==='pontos'){
    if(!L._containerLabelMigrated){
      if(!L.labelField||L.labelField==='ID')L.labelField='EMPILHADOS';
      L._containerLabelMigrated=true;
    }
    L.lbl=Object.assign(defaultLabelCfg(),L.lbl||{},{unique:false,onMap:true});
  }
  L._snapCache=null; L._endCache=null;`,
    "rótulos individuais da contagem"
  );
  out = replaceOnce(
    out,
`function legendItems(){
  const items=[];`,
`function legendItems(){
  const items=[];let containerResumoAdicionado=false;`,
    "estado da legenda de contagem no Layout"
  );
  out = replaceOnce(
    out,
`    const L=o, sy=L.sym, kind=L.gtype==='polygon'?'poly':L.gtype==='line'?'line':'pt';
    const pcfg=(kind==='pt')? ptCfg(L) : null;
    const classed=(sy.mode==='grad'&&sy.classes.length)||(sy.mode==='cat'&&sy.cats.length);`,
`    const L=o, sy=L.sym, kind=L.gtype==='polygon'?'poly':L.gtype==='line'?'line':'pt';
    const pcfg=(kind==='pt')? ptCfg(L) : null;
    const papelCont=containerCountLayerRole(L);
    if(papelCont){
      if(!containerResumoAdicionado){
        const R=containerCountSummaryFromLayer(L);
        if(R){
          items.push({label:'Contagem de contêineres — '+R.total.toLocaleString('pt-BR')+
            ' unidade'+(R.total===1?'':'s')+' / '+R.posicoes.toLocaleString('pt-BR')+
            ' '+(R.posicoes===1?'posição':'posições'),header:true,indent:ind});
          items.push({label:"12′ — "+R.c12.toLocaleString('pt-BR'),color:'#ef8d32',stroke:'#b75d13',
            kind:'pt',shape:'circle',weight:1.5,indent:ind+1});
          items.push({label:"24′ — "+R.c24.toLocaleString('pt-BR'),color:'#ef8d32',stroke:'#b75d13',
            kind:'pt',shape:'circle',weight:1.5,indent:ind+1});
          const nv=containerCountLevelsText(R);
          if(nv)items.push({label:'Empilhamento: '+nv,header:true,indent:ind+1});
          containerResumoAdicionado=true;
        }
      }
      /* O cabeçalho acima substitui a linha genérica, longa e carimbada da
         camada de pontos. A camada de pegadas continua com sua amostra verde. */
      if(papelCont==='pontos'&&containerResumoAdicionado)return;
    }
    const classed=(sy.mode==='grad'&&sy.classes.length)||(sy.mode==='cat'&&sy.cats.length);`,
    "resumo da contagem na legenda do Layout"
  );
  out = replaceOnce(
    out,
`      const candidatos=tinConsolidaContainers(brutos,r,rBase,cfgCont),
        semOrto=candidatos.filter(c=>!c.orto||!c.orto.disponivel).length,`,
`      /* Um candidato degenerado não pode virar geometria no projeto: JSON
         converteria NaN/Infinity em null e o defeito reapareceria ao abrir. */
      const candidatos=tinConsolidaContainers(brutos,r,rBase,cfgCont).filter(c=>
          [c.cx,c.cy,c.ux,c.uy,c.vx,c.vy,c.comprimento,c.largura,c.zMDS,c.zMDT,c.alturaCentro]
            .every(Number.isFinite)),
        semOrto=candidatos.filter(c=>!c.orto||!c.orto.disponivel).length,`,
    "candidatos de contêiner com geometria finita"
  );
  out = replaceOnce(
    out,
`          fields:campos.map(f=>({...f})),color:'#ef8d32',labelField:'ID'});
        camadaPontos._containerCount={...marca,papel:'pontos'};`,
`          fields:campos.map(f=>({...f})),color:'#ef8d32',labelField:'EMPILHADOS',lbl:{unique:false,onMap:true}});
        camadaPontos._containerCount={...marca,papel:'pontos',resumo:{posicoes:candidatos.length,total:unidades,
          c12:conta['12′'],c24:conta['24′'],niveis:{...niveis}}};`,
    "camada de contagem nasce com rótulos e resumo"
  );
  out = replaceOnce(
    out,
`        camadaPegadas._containerCount={...marca,papel:'pegadas'};`,
`        camadaPegadas._containerCount={...marca,papel:'pegadas',resumo:{posicoes:candidatos.length,total:unidades,
          c12:conta['12′'],c24:conta['24′'],niveis:{...niveis}}};`,
    "resumo também na camada de pegadas"
  );
  out = replaceOnce(
    out,
`      _cava2MdtId:L._cava2MdtId??null,
      _baciaTopoVersion:L._baciaTopoVersion??null`,
`      _cava2MdtId:L._cava2MdtId??null,
      _baciaTopoVersion:L._baciaTopoVersion??null,
      _containerCount:L._containerCount||null`,
    "metadados da contagem salvos no projeto"
  );
  out = replaceOnce(
    out,
`      _cava2MdtId:o._cava2MdtId??null,
      _baciaTopoVersion:o._baciaTopoVersion??null,
      llayer:null};`,
`      _cava2MdtId:o._cava2MdtId??null,
      _baciaTopoVersion:o._baciaTopoVersion??null,
      _containerCount:o._containerCount||null,
      llayer:null};`,
    "metadados da contagem restaurados do projeto"
  );

  /* O poligonizador de raster já fazia parte do núcleo vetorial, mas a caixa
     permanecia oculta e nenhum comando da faixa GIS conseguia abri-la. A
     ferramenta ganha um comando próprio em Raster e TIN; Poligonizar Linhas
     continua separado porque é uma operação topológica diferente. */
  out = replaceOnce(
    out,
`    G('Raster e TIN',[['mosaico','Mesclar Rasters'],['corte','Cortar Raster/TIN'],['declividade','Declividade'],['aspecto','Aspecto'],['sombreado','Relevo Sombreado'],['curvas-nivel','Curvas de Nível']]),`,
`    G('Raster e TIN',[['poligonizar-raster-gis','Poligonizar Raster'],['mosaico','Mesclar Rasters'],['corte','Cortar Raster/TIN'],['declividade','Declividade'],['aspecto','Aspecto'],['sombreado','Relevo Sombreado'],['curvas-nivel','Curvas de Nível']]),`,
    "comando Poligonizar Raster na aba GIS"
  );
  out = replaceOnce(
    out,
`  comando('gis','poligonizar-gis',btn=>abreGeoVetorial(btn,'opCloseLines','Poligonizar linhas · criar polígonos'));
  comando('gis','dissolver-gis',btn=>abreGeoVetorial(btn,'opDissolve','Dissolver polígonos'));`,
`  comando('gis','poligonizar-gis',btn=>abreGeoVetorial(btn,'opCloseLines','Poligonizar linhas · criar polígonos'));
  comando('gis','poligonizar-raster-gis',btn=>{
    try{refreshVecOpsPanel();}catch(e){}
    const ferramenta=document.getElementById('opPolygonizeRaster');
    if(ferramenta)ferramenta.hidden=false;
    abreGeoVetorial(btn,'opPolygonizeRaster','Poligonizar raster · gerar polígonos e atributos');
    if(!(S.rasters||[]).some(r=>r&&r.d&&r.d.z))toast('Carregue ou gere primeiro um raster');
  });
  comando('gis','dissolver-gis',btn=>abreGeoVetorial(btn,'opDissolve','Dissolver polígonos'));`,
    "abertura do Poligonizar Raster"
  );
  out = replaceOnce(
    out,
`RIB_PNG['poligonizar-gis']=RIB_PNG['converter'];
RIB_PNG['dissolver-gis']=RIB_PNG['dissolver'];`,
`RIB_PNG['poligonizar-gis']=RIB_PNG['converter'];
RIB_PNG['poligonizar-raster-gis']=RIB_PNG['geotiff']||RIB_PNG['converter'];
RIB_PNG['dissolver-gis']=RIB_PNG['dissolver'];`,
    "ícone colorido do Poligonizar Raster"
  );

	  /* Deixa explícito no próprio fluxo que o produto é uma camada vetorial
	     filtrável. Os dois atalhos usam a tabela/filtro já existentes, sem criar
	     um segundo sistema de atributos. */
	  out = replaceOnce(
	    out,
	`            <button class="tbtn" id="btnPgRaster" style="width:100%;justify-content:center;margin-top:6px;background:var(--amber);color:#1a1206;font-weight:700">Poligonizar</button>`,
	`            <label class="field" style="margin-top:6px">Dissolução do resultado</label>
	            <select id="pgDissolve">
	              <option value="none">Não dissolver — manter cada região</option>
	              <option value="value">Dissolver pelo valor do raster</option>
	              <option value="class">Dissolver pelo atributo CLASSE</option>
	              <option value="all">Dissolver tudo — sem atributo</option>
	            </select>
	            <button class="tbtn" id="btnPgRaster" style="width:100%;justify-content:center;margin-top:6px;background:var(--amber);color:#1a1206;font-weight:700">Poligonizar</button>`,
	    "modo de dissolução do Poligonizar Raster"
	  );
	  out = replaceOnce(
    out,
`            <div class="hint">Mesma lógica do QGIS: cada região contígua de células com o mesmo valor vira uma feição de polígono. Células sem dado são ignoradas.</div>
            <div class="hout" id="pgOut">Nenhum raster poligonizado.</div>
          </div>`,
	`            <div class="hint">Mesma lógica do QGIS: cada região contígua de células com o mesmo valor vira uma feição fechada. Você pode manter as regiões, dissolver pelo valor, dissolver por CLASSE ou unir tudo sem atributo. Células sem dado são ignoradas. Para rasters contínuos, classifique ou arredonde os valores antes para evitar milhares de regiões.</div>
            <div class="hout" id="pgOut">Nenhum raster poligonizado.</div>
            <div class="row2" style="margin-top:6px">
              <button class="tbtn" id="btnPgTabela" disabled style="justify-content:center">Tabela de atributos</button>
              <button class="tbtn" id="btnPgFiltro" disabled style="justify-content:center">Filtro por atributos</button>
            </div>
          </div>`,
    "atalhos de atributos no Poligonizar Raster"
  );

  /* Cada região recebe atributos diretamente úteis no filtro QGIS da tabela.
     DN mantém o valor original; CLASSE aproveita o rótulo da simbologia do
     raster quando houver; FID, áreas, perímetro, células e fonte completam a
     rastreabilidade do produto. */
  out = replaceOnce(
    out,
`function polygonizeRasterGrid(r,eight=false,maxCells=250000){
  const d=r&&r.d;if(!d||!d.z||!d.nc||!d.nr)throw new Error('raster sem grade válida');
  const n=d.nc*d.nr,z=d.z;let valid=0;`,
`function polygonizeRasterGrid(r,eight=false,maxCells=250000,dissolveMode='none'){
  const d=r&&r.d;if(!d||!d.z||!d.nc||!d.nr)throw new Error('raster sem grade válida');
  const classes=(r.style&&Array.isArray(r.style.classes))?r.style.classes:[];
  const classInfo=v=>{
    const achou=classes.find((c,i)=>{
	      if(c.value!==null&&c.value!==''&&c.value!==undefined&&Number.isFinite(+c.value))return Math.abs(v-(+c.value))<=1e-9;
      const lo=+c.min,hi=+c.max;if(!Number.isFinite(lo)||!Number.isFinite(hi))return false;
      return v>=lo&&(v<hi||(i===classes.length-1&&v<=hi));
    });
    if(!achou)return {label:String(v),color:null};
    const label=String(achou.label||achou.nome||achou.name||
	      ((achou.min!==null&&achou.max!==null&&Number.isFinite(+achou.min)&&Number.isFinite(+achou.max))?(achou.min+' – '+achou.max):v));
	    return {label,color:achou.color||achou.cor||null};
	  };
	  const noDataRaw=[r.nodata,r.noData,d.nodata,d.noData,d.NODATA].find(v=>v!==null&&v!==''&&Number.isFinite(+v));
	  const noData=noDataRaw!==undefined?+noDataRaw:null;
	  const validValue=v=>Number.isFinite(v)&&(noData==null||Math.abs(v-noData)>1e-12);
	  const mode=['value','class','all'].includes(dissolveMode)?dissolveMode:'none';
	  const n=d.nc*d.nr,z=d.z;let valid=0;`,
	    "classe da simbologia na poligonização"
	  );
	  out = replaceOnce(
	    out,
	`  for(let i=0;i<n;i++)if(Number.isFinite(z[i]))valid++;`,
	`  for(let i=0;i<n;i++)if(validValue(z[i]))valid++;`,
	    "NoData no total de células da poligonização"
	  );
	  out = replaceOnce(
	    out,
	`    if(seen[seed]||!Number.isFinite(z[seed]))continue;`,
	`    if(seen[seed]||!validValue(z[seed]))continue;`,
	    "NoData na semente da poligonização"
	  );
	  out = replaceOnce(
	    out,
	`        const nk=nr*d.nc+nc;if(!seen[nk]&&Number.isFinite(z[nk])&&same(z[nk],val)){seen[nk]=1;q.push(nk);}`,
	`        const nk=nr*d.nc+nc;if(!seen[nk]&&validValue(z[nk])&&same(z[nk],val)){seen[nk]=1;q.push(nk);}`,
	    "NoData na vizinhança da poligonização"
	  );
	  out = replaceOnce(
	    out,
	`      const eq=(nr,nc)=>nr>=0&&nc>=0&&nr<d.nr&&nc<d.nc&&Number.isFinite(z[nr*d.nc+nc])&&same(z[nr*d.nc+nc],val);`,
	`      const eq=(nr,nc)=>nr>=0&&nc>=0&&nr<d.nr&&nc<d.nc&&validValue(z[nr*d.nc+nc])&&same(z[nr*d.nc+nc],val);`,
	    "NoData no contorno da poligonização"
	  );
	  out = replaceOnce(
	    out,
	`    const val=z[seed],q=[seed],edges=[];let head=0,cells=0;seen[seed]=1;`,
	`    const val=z[seed],seedClass=classInfo(val),
	      groupKey=v=>mode==='all'?'__all__':mode==='class'?classInfo(v).label:v,
	      key0=groupKey(val),q=[seed],edges=[];
	    let head=0,cells=0,sum=0,min=Infinity,max=-Infinity,singleValue=true;seen[seed]=1;`,
	    "estatísticas do grupo dissolvido"
	  );
	  out = replaceOnce(
	    out,
	`      const k=q[head++],rr=Math.floor(k/d.nc),cc=k-rr*d.nc;cells++;`,
	`      const k=q[head++],rr=Math.floor(k/d.nc),cc=k-rr*d.nc,cellVal=z[k];cells++;
	      sum+=cellVal;min=Math.min(min,cellVal);max=Math.max(max,cellVal);if(!same(cellVal,val))singleValue=false;`,
	    "agregação das células dissolvidas"
	  );
	  out = replaceOnce(
	    out,
	`        const nk=nr*d.nc+nc;if(!seen[nk]&&validValue(z[nk])&&same(z[nk],val)){seen[nk]=1;q.push(nk);}`,
	`        const nk=nr*d.nc+nc;if(!seen[nk]&&validValue(z[nk])&&same(groupKey(z[nk]),key0)){seen[nk]=1;q.push(nk);}`,
	    "vizinhança por atributo do dissolve raster"
	  );
	  out = replaceOnce(
	    out,
	`      const eq=(nr,nc)=>nr>=0&&nc>=0&&nr<d.nr&&nc<d.nc&&validValue(z[nr*d.nc+nc])&&same(z[nr*d.nc+nc],val);`,
	`      const eq=(nr,nc)=>nr>=0&&nc>=0&&nr<d.nr&&nc<d.nc&&validValue(z[nr*d.nc+nc])&&same(groupKey(z[nr*d.nc+nc]),key0);`,
	    "contorno por atributo do dissolve raster"
	  );
  out = replaceOnce(
    out,
`    const rings=pgRingsFromEdges(edges,d);if(!rings.length)continue;
    feats.push({geom:rings,multi:true,props:{DN:val,CELULAS:cells,
      AREA_M2:+(cells*d.cs*(d.csy||d.cs)).toFixed(3)}});`,
`    const rings=pgRingsFromEdges(edges,d);if(!rings.length)continue;
    let per=0;rings.forEach(ring=>{for(let i=0;i<ring.length-1;i++)
      per+=Math.hypot(ring[i+1][0]-ring[i][0],ring[i+1][1]-ring[i][1]);});
	    const area=cells*d.cs*(d.csy||d.cs),ci=mode==='all'?{label:null,color:null}:seedClass;
	    feats.push({geom:rings,multi:true,props:{FID:feats.length+1,DN:singleValue?val:null,
	      CLASSE:ci.label,VAL_MIN:+min.toFixed(6),VAL_MAX:+max.toFixed(6),VAL_MED:+(sum/cells).toFixed(6),
	      CELULAS:cells,AREA_M2:+area.toFixed(3),AREA_HA:+(area/10000).toFixed(6),
	      PERIM_M:+per.toFixed(3),RASTER:String(r.name||'Raster').slice(0,80),
	      DISSOLVE:mode==='all'?'TOTAL':mode==='class'?'CLASSE':mode==='value'?'VALOR':'NÃO',_PG_COR:ci.color}});`,
	    "atributos de cada região raster"
	  );
	  out = replaceOnce(
	    out,
	`  const fld=(String(document.getElementById('pgField').value||'DN').trim().replace(/[^A-Za-z0-9_]/g,'_').slice(0,10)||'DN');`,
	`  const fldPedido=(String(document.getElementById('pgField').value||'DN').trim().replace(/[^A-Za-z0-9_]/g,'_').slice(0,10)||'DN');
	  const camposReservados=new Set(['FID','CLASSE','VAL_MIN','VAL_MAX','VAL_MED','CELULAS','AREA_M2','AREA_HA','PERIM_M','RASTER','DISSOLVE']);
	  const fld=camposReservados.has(fldPedido.toUpperCase())?'VALOR':fldPedido;
	  if(fld!==fldPedido)document.getElementById('pgField').value=fld;`,
	    "proteção dos campos reservados na poligonização"
	  );
  out = replaceOnce(
    out,
`    const res=polygonizeRasterGrid(r,!!document.getElementById('pgEight').checked);
    if(fld!=='DN')res.features.forEach(f=>{f.props[fld]=f.props.DN;delete f.props.DN});
    const L=addLayer({name:r.name+' — poligonizado',gtype:'polygon',crs:S.workCRS,features:res.features,
      fields:[{name:fld,type:'N',length:18,decimal:6},{name:'CELULAS',type:'N',length:12,decimal:0},{name:'AREA_M2',type:'N',length:18,decimal:3}]});
    hideLoad();document.getElementById('pgOut').innerHTML=\`<b>\${res.features.length}</b> região(ões) · <b>\${res.valid.toLocaleString('pt-BR')}</b> células válidas.\`;
    refreshUI();if(L)fitLayer(L);toast('Raster poligonizado');`,
`    const dissolveMode=(document.getElementById('pgDissolve')||{}).value||'none';
    const res=polygonizeRasterGrid(r,!!document.getElementById('pgEight').checked,250000,dissolveMode);
    if(fld!=='DN')res.features.forEach(f=>{f.props[fld]=f.props.DN;delete f.props.DN;});
    const dissolveNome=dissolveMode==='all'?' · dissolvido':dissolveMode==='class'?' · dissolvido por CLASSE':
      dissolveMode==='value'?' · dissolvido por '+fld:'';
    const L=addLayer({name:r.name+' — poligonizado'+dissolveNome,gtype:'polygon',crs:S.workCRS,features:res.features,
      fields:[{name:'FID',type:'N',length:9,decimal:0},{name:fld,type:'N',length:18,decimal:6},
        {name:'CLASSE',type:'C',length:80,decimal:0},{name:'VAL_MIN',type:'N',length:18,decimal:6},
        {name:'VAL_MAX',type:'N',length:18,decimal:6},{name:'VAL_MED',type:'N',length:18,decimal:6},
        {name:'CELULAS',type:'N',length:12,decimal:0},
        {name:'AREA_M2',type:'N',length:18,decimal:3},{name:'AREA_HA',type:'N',length:18,decimal:6},
        {name:'PERIM_M',type:'N',length:18,decimal:3},{name:'RASTER',type:'C',length:80,decimal:0},
        {name:'DISSOLVE',type:'C',length:12,decimal:0}]});
    const cats=[],vistos=new Set();
    res.features.forEach(f=>{const p=f.props||{},rot=String(p.CLASSE||p[fld]||'');
	      if(!vistos.has(rot)){vistos.add(rot);if(cats.length<60)cats.push({value:rot,
	        color:p._PG_COR||'#37a6c9',stroke:p._PG_COR||'#216a83',fill:.38,vis:true});}
      delete p._PG_COR;
    });
	    if(dissolveMode!=='all'&&cats.length&&vistos.size<=60){L.sym={...L.sym,mode:'cat',field:'CLASSE',cats};drawLayer(L);}
    S._pgRasterLayerId=L.id;
    ['btnPgTabela','btnPgFiltro'].forEach(id=>{const b=document.getElementById(id);if(b)b.disabled=false;});
    hideLoad();document.getElementById('pgOut').innerHTML='<b>'+res.features.length+'</b> região(ões) · <b>'+ 
      res.valid.toLocaleString('pt-BR')+'</b> células válidas · '+
      (dissolveMode==='all'?'dissolvido sem atributo':dissolveMode==='class'?'dissolvido por CLASSE':
       dissolveMode==='value'?'dissolvido por '+fld:'sem dissolução adicional')+
      '.<br>Campos gerados: <b>'+fld+', CLASSE, VAL_MIN, VAL_MAX, VAL_MED, CELULAS, AREA_M2, AREA_HA, PERIM_M, RASTER e DISSOLVE</b>.';
    refreshUI();if(L)fitLayer(L);toast('Raster poligonizado'+(dissolveMode==='none'?'':' e dissolvido')+' — atributos prontos para filtrar');`,
    "camada raster filtrável e categorizada"
  );
  out = replaceOnce(
    out,
`/* Fechamento de linhas é uma operação CAD distinta de Poligonizar raster. */`,
`function pgResultadoAbrir(filtro){
  const L=(S.layers||[]).find(x=>x.id===S._pgRasterLayerId);
  if(!L){toast('Poligonize um raster primeiro');return;}
  S.activeId=L.id;refreshUI();
  if(typeof openAttr==='function')openAttr();
  if(filtro)setTimeout(()=>{
    const p=document.getElementById('attrFilterPanel'),b=document.getElementById('attrFilterToggle');
    if(p&&p.hidden&&b)b.click();
  },40);
}

/* Fechamento de linhas é uma operação CAD distinta de Poligonizar raster. */`,
    "atalho para tabela e filtro do raster poligonizado"
  );
  out = replaceOnce(
    out,
`  const b4=document.getElementById('btnPgRaster');if(b4)b4.onclick=runPolygonizeRaster;
  const b5=document.getElementById('btnXl');     if(b5)b5.onclick=runExtractBoundary;`,
`  const b4=document.getElementById('btnPgRaster');if(b4)b4.onclick=runPolygonizeRaster;
  const bt=document.getElementById('btnPgTabela');if(bt)bt.onclick=()=>pgResultadoAbrir(false);
  const bf=document.getElementById('btnPgFiltro');if(bf)bf.onclick=()=>pgResultadoAbrir(true);
  const b5=document.getElementById('btnXl');     if(b5)b5.onclick=runExtractBoundary;`,
    "eventos dos atalhos da poligonização"
  );
  return aplicaAreaAutomatica(aplicaResumoPropriedadesCamada(aplicaRotulosFormula(out)));
}
