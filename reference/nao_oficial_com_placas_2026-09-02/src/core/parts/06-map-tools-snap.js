/* ============================================================================
   MAPA
   ========================================================================== */
function initMap(){
  const _rz=(()=>{ try{ return +prefsGet().rodaZoom||160; }catch(e){ return 160; } })();
  map=L2.map('map',{zoomControl:false,attributionControl:false,maxZoom:24,
    /* Passo de meio nível e roda menos sensível: cada clique aproxima pouco,
       em vez de saltar um nível inteiro (ou dois num giro rápido). */
    wheelPxPerZoomLevel:_rz, wheelDebounceTime:40,
    zoomSnap:(_rz>=120?0.5:1), zoomDelta:(_rz>=120?0.5:1)
  }).setView([-12.24,-43.11],13);
  // Renderer Canvas compartilhado: camadas com muitas feições são desenhadas em
  // canvas (uma ordem de grandeza mais rápido que SVG). Camadas pequenas seguem
  // em SVG para manter as hachuras (padrões SVG não existem no canvas).
  S._canvasR=L2.canvas({padding:0.3});

  // Fundo neutro sempre presente (funciona sem internet nenhuma).
  // PIXEL TRANSPARENTE em data-URI, e não URL vazia: <img src=""> dispara
  // ERRO em cada tile, e os erros acionavam o fallback automático — que
  // "trocava" para o próprio Sem fundo num laço, removendo qualquer base
  // que o usuário escolhesse em seguida (Híbrido etc.).
  const PIXEL='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const blank=L2.tileLayer(PIXEL,{maxZoom:22});

  // Provedores online (a 1a carga precisa de internet) — crossOrigin p/ captura no layout
  const XO={crossOrigin:'anonymous'};
  /* maxNativeZoom é o último nível REALMENTE baixado; acima dele o Leaflet só
     amplia o tile anterior (o borrão ao inspecionar caixas de decantação e
     detalhes de obra). O Google serve imagem própria até z22 em boa parte do
     Brasil — medido nesta região: o tile z21 tem ~11× mais detalhe que o z20
     ampliado, e o z22 ~30×. Onde a cobertura não chega a esse nível, o próprio
     provedor devolve o nível anterior, sem tela em branco.                   */
  baseLayers['Satélite (Google)']=L2.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    Object.assign({subdomains:['mt0','mt1','mt2','mt3'],maxZoom:24,maxNativeZoom:22},XO));
  baseLayers['Satélite (Esri)']=L2.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{x}/{y}',
    Object.assign({maxZoom:24,maxNativeZoom:19},XO));
  baseLayers['Híbrido (Google)']=L2.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    Object.assign({subdomains:['mt0','mt1','mt2','mt3'],maxZoom:24,maxNativeZoom:22},XO));
  /* Ruas e topográfico não têm níveis tão fundos: seguem ampliando o último
     tile real, mas sem travar o zoom do mapa (e das camadas do projeto). */
  baseLayers['Ruas (OSM)']=L2.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    Object.assign({maxZoom:24,maxNativeZoom:19},XO));
  baseLayers['Topográfico (OpenTopo)']=L2.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    Object.assign({subdomains:['a','b','c'],maxZoom:24,maxNativeZoom:17},XO));
  baseLayers['Sem fundo']=blank;

  // aliases usados no restante do código
  baseLayers.sat=baseLayers['Satélite (Google)'];
  baseLayers.osm=baseLayers['Ruas (OSM)'];

  // Fallback: se um satélite falhar em carregar tiles, avisa e cai para o próximo
  const fallbackChain=['Satélite (Google)','Satélite (Esri)','Ruas (OSM)','Sem fundo'];
  let curBaseName='Satélite (Google)';
  function setBase(name){
    if(!baseLayers[name]) name='Sem fundo';      // nome inválido nunca derruba o mapa
    Object.values(baseLayers).forEach(l=>{ if(map.hasLayer(l)) map.removeLayer(l); });
    baseLayers[name].addTo(map); baseLayers[name].bringToBack();
    curBaseName=name; S._base=name;
  }
  S.setBase=setBase;
  S.getBase=()=>curBaseName;
  // conta erros de tile e faz fallback automático uma vez
  let errCount=0, autoFellBack=false;
  function watch(name){
    baseLayers[name].on('tileerror',()=>{
      if(name!==curBaseName) return;
      errCount++;
      if(errCount>=6 && !autoFellBack){
        autoFellBack=true; const idx=fallbackChain.indexOf(name);
        const next=fallbackChain[idx+1]||'Sem fundo';
        toast('Satélite indisponível — trocando para "'+next+'"');
        setBase(next); pickBaseUI(next); errCount=0; autoFellBack=false;
      }
    });
    baseLayers[name].on('load',()=>{errCount=0;});
  }
  // sem os APELIDOS (sat/osm — dobravam a contagem no mesmo layer) e sem o
  // "Sem fundo" (falha ali é por desenho, não por indisponibilidade)
  Object.keys(baseLayers).forEach(n=>{
    if(n==='sat'||n==='osm'||n==='Sem fundo') return; watch(n); });

  setBase(curBaseName);

  // Controle de camada base (Leaflet) — só os fundos, sem os apelidos internos
  const ctlBases={}; Object.keys(baseLayers).forEach(n=>{
    if(n!=='sat'&&n!=='osm') ctlBases[n]=baseLayers[n]; });
  L2.control.layers(ctlBases,null,{position:'topright',collapsed:true}).addTo(map);
  /* Mantém os controles direitos numa pilha real do Leaflet. Dessa forma a
     rosa dos ventos sempre começa depois do seletor de mapas-base, inclusive
     com zoom do navegador, telas menores ou o seletor temporariamente aberto. */
  const a3RightCorner=map.getContainer().querySelector('.leaflet-top.leaflet-right');
  const a3CompassControl=document.getElementById('a3Compass');
  const a3MapNavControl=document.getElementById('a3MapNav');
  if(a3RightCorner){
    if(a3CompassControl) a3RightCorner.appendChild(a3CompassControl);
    if(a3MapNavControl) a3RightCorner.appendChild(a3MapNavControl);
  }
  // sincroniza nossa lógica quando o usuário troca pelo controle
  map.on('baselayerchange',e=>{ curBaseName=e.name; S._base=e.name; errCount=0; autoFellBack=false; });
  function pickBaseUI(name){ /* garante seleção visual no controle */ }

  L2.control.zoom({position:'bottomright'}).addTo(map);
  /* Traçado em andamento e realce de seleção precisam de pane próprio: as
     camadas ocupam z-index a partir de 410 (zApply) e o overlayPane padrão
     fica em 400, de modo que o desenho sumiria sob qualquer raster ligado.  */
  if(!map.getPane('alagis_desenho')){
    const pd=map.createPane('alagis_desenho');
    pd.style.zIndex=685;
    pd.style.pointerEvents='none';
  }
  S.drawLayer=L2.layerGroup([],{pane:'alagis_desenho'}).addTo(map);
  S.vtxLayer=L2.layerGroup().addTo(map);
  /* A régua precisa de pane próprio: as camadas recebem panes a partir de
     z-index 410 (zApply), enquanto o overlayPane padrão fica em 400 — sem
     isto o traçado desaparece sob qualquer raster ligado depois.            */
  if(!map.getPane('alagis_regua')){
    const pm=map.createPane('alagis_regua');
    pm.style.zIndex=690;                 // acima de camadas, marcadores e tooltips
    pm.style.pointerEvents='none';       // não rouba clique do mapa
  }
  S.measLayer=L2.layerGroup([],{pane:'alagis_regua'}).addTo(map);

  let hoverErr='',hoverErrAt=0;
  const hoverSafe=(nome,fn)=>{
    try{fn();}catch(err){
      const msg=nome+': '+((err&&err.message)||err);
      /* Movimento do mouse dispara dezenas de vezes por segundo. Registra o
         erro real uma vez, mas nunca deixa o cursor/mapa entrar em cascata. */
      if(msg!==hoverErr || Date.now()-hoverErrAt>5000){
        hoverErr=msg;hoverErrAt=Date.now();
        try{cmdLog('erro no visor — '+msg,'erro');}catch(_){}
        try{console.error(err);}catch(_){}
      }
    }
  };
  map.on('mousemove',e=>{
    hoverSafe('coordenadas',()=>updateReadout(e.latlng));
    if(typeof atualizaCursorSnap==='function') hoverSafe('snap',()=>atualizaCursorSnap(e.latlng));
    if(S.tool==='forma' && FORMA.tipo && FORMA.dim){ try{ formaPreview(e.latlng); }catch(err){} } });
  map.on('mouseout',()=>{ try{ map.getContainer().classList.remove('cursor-snap'); limpaCursorSnap(); }catch(e){} });
  map.on('zoomend moveend',()=>{updateReadout(map.getCenter());updateScale();
    clearTimeout(S._hdT); S._hdT=setTimeout(()=>{ try{orthoHDRefresh();}catch(e){} }, 220);});
  map.on('click',onMapClick);
  // Reforço p/ tablet: alguns toques não viram 'click' no Leaflet. Nos modos que
  // pedem um ponto (inundação, bacia), converte o touchend em latlng e despacha.
  try{
    const cont=map.getContainer();
    cont.addEventListener('touchend',ev=>{
      if(S.tool!=='inund' && S.tool!=='basin' && S.tool!=='barr' && S.tool!=='lamina' && S.tool!=='dren') return;
      if(!ev.changedTouches || !ev.changedTouches.length) return;
      const t=ev.changedTouches[0];
      const r=cont.getBoundingClientRect();
      const pt=L.point(t.clientX-r.left, t.clientY-r.top);
      let ll; try{ ll=map.containerPointToLatLng(pt); }catch(e){ return; }
      ev.preventDefault();
      onMapClick({latlng:ll});
    }, {passive:false});
  }catch(e){}
  if(typeof mselBind==='function') try{ mselBind(); }catch(e){}
  if(typeof bindMiddlePan==='function') try{ bindMiddlePan(); }catch(e){}
  if(typeof bindRightSelect==='function') try{ bindRightSelect(); }catch(e){}
  // Garante que a abertura sempre comece em Seleção, inclusive após projetos
  // gravados por versões que usavam a mão/pan como estado de repouso.
  try{ setTool('select'); }catch(e){ S.tool='select'; }
  updateScale();
}
/* Pan sem trocar de ferramenta: segure a roda/botão central e arraste.
   O Leaflet normalmente reserva o arraste ao botão esquerdo; aqui desativamos
   esse gesto no desktop para que seleção/edição permaneça sempre pronta. */
function bindMiddlePan(){
  if(typeof map==='undefined'||!map||!map.getContainer) return false;
  const el=map.getContainer(); if(el._alagisMiddlePan) return true; el._alagisMiddlePan=true;
  let st=null;
  el.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse' && e.button===1){
      st={id:e.pointerId,x:e.clientX,y:e.clientY};
      try{ el.setPointerCapture(e.pointerId); }catch(_){}
      el.classList.add('cursor-panning');
      e.preventDefault(); e.stopPropagation();
    }
  },true);
  el.addEventListener('pointermove',e=>{
    if(!st||e.pointerId!==st.id) return;
    const dx=e.clientX-st.x,dy=e.clientY-st.y; st.x=e.clientX;st.y=e.clientY;
    if(dx||dy) map.panBy([-dx,-dy],{animate:false});
    e.preventDefault(); e.stopPropagation();
  },true);
  const fim=e=>{
    if(!st||e.pointerId!==st.id) return;
    st=null; try{ el.releasePointerCapture(e.pointerId); }catch(_){}
    el.classList.remove('cursor-panning');
    e.preventDefault(); e.stopPropagation();
  };
  el.addEventListener('pointerup',fim,true);
  el.addEventListener('pointercancel',fim,true);
  el.addEventListener('auxclick',e=>{if(e.button===1){e.preventDefault();e.stopPropagation();}},true);
  return true;
}
/* Botão direito (mouse ou botão lateral da caneta) é sempre SELEÇÃO.
   Ele não troca/cancela a ferramenta armada: apenas torna a feição ativa,
   permitindo consultar/selecionar durante qualquer comando. O botão central
   continua exclusivo do pan. */
function bindRightSelect(){
  if(typeof map==='undefined'||!map||!map.getContainer)return false;
  const el=map.getContainer();if(el._alagisRightSelect)return true;el._alagisRightSelect=true;
  let st=null;
  el.addEventListener('pointerdown',e=>{
    if(e.button!==2)return;
    st={id:e.pointerId,x:e.clientX,y:e.clientY};
    e.preventDefault();e.stopPropagation();
  },true);
  el.addEventListener('pointerup',e=>{
    if(!st||e.pointerId!==st.id||e.button!==2)return;
    const q=st;st=null;
    if(Math.hypot(e.clientX-q.x,e.clientY-q.y)<=8){
      const r=el.getBoundingClientRect(),ll=map.containerPointToLatLng([e.clientX-r.left,e.clientY-r.top]);
      const hit=feicaoMaisProximaPx(ll,S.touch?Math.round(SNAP_PX*1.6):SNAP_PX);
      if(hit){
        S.activeId=hit.L.id;S.selRaster=null;
        S.selFeat={layer:hit.L,layerId:hit.L.id,idx:hit.idx};
        refreshUI();showProps();highlightSel();
        toast('Feição selecionada · '+hit.L.name);
      }else toast('Nenhuma feição no alcance da seleção');
    }
    e.preventDefault();e.stopPropagation();
  },true);
  el.addEventListener('pointercancel',()=>{st=null;},true);
  el.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();},true);
  return true;
}
function updateReadout(ll){
  const c=fromWGS(S.workCRS, ll.lng, ll.lat);
  const isGeo=/4326|4674|4618/.test(S.workCRS);
  const co=document.getElementById('roCoord');
  if(co) co.textContent = isGeo ? `${c[1].toFixed(6)}, ${c[0].toFixed(6)}` : `E ${c[0].toFixed(1)}  N ${c[1].toFixed(1)}`;
  const co2=document.getElementById('roCoord2');
  if(co2) co2.textContent = isGeo ? `${c[1].toFixed(6)}, ${c[0].toFixed(6)}` : `E: ${c[0].toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}   N: ${c[1].toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  // cota Z: amostra o primeiro raster/MDT visível sob o cursor (silencioso se não houver)
  const zEl=document.getElementById('roZ');
  if(zEl){
    let z=null;
    try{
      const r=(S.rasters||S.layers||[]).find? null:null;
      const ras=(typeof S!=='undefined' && S.rasters)? S.rasters.filter(x=>x.visible!==false):[];
      for(const R of ras){ const d=R.d||R; if(!d||!d.z||!d.nc) continue;
        const cc=Math.floor((c[0]-d.xll)/d.cs), rr=(d.nr-1)-Math.floor((c[1]-d.yll)/(d.csy||d.cs));
        if(cc>=0&&cc<d.nc&&rr>=0&&rr<d.nr){ const v=d.z[rr*d.nc+cc]; if(v!=null&&isFinite(v)){ z=v; break; } } }
    }catch(e){}
    zEl.textContent = z!=null ? 'Z: '+z.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' m' : 'Z: —';
  }
  const cr=document.getElementById('roCRS'); if(cr) cr.textContent = S.workCRS;
  const zo=document.getElementById('roZoom'); if(zo) zo.textContent = map.getZoom().toFixed(1);
}
function updateScale(){
  const y=map.getSize().y/2, p1=map.containerPointToLatLng([0,y]), p2=map.containerPointToLatLng([100,y]);
  const m=map.distance(p1,p2); let nice=[1,2,5].map(v=>v*Math.pow(10,Math.floor(Math.log10(m))))
    .reduce((a,b)=>Math.abs(b-m)<Math.abs(a-m)?b:a);
  const w=100*nice/m; const sb=document.getElementById('scaleBar'); if(sb) sb.style.width=w+'px';
  const st=document.getElementById('scaleTxt'); if(st) st.textContent = nice>=1000?(nice/1000)+' km':nice+' m';
  // escala aproximada 1:N (usa ~96 dpi)
  const re=document.getElementById('roEscala');
  if(re){ const mppx=m/100; const escala=Math.round(mppx*96/0.0254);
    re.textContent = escala>0? '1:'+escala.toLocaleString('pt-BR') : '—'; }
}

/* ---------- Ferramentas ---------- */
function setTool(t){
  // A ferramenta de repouso é sempre SELEÇÃO. Chamadas antigas que voltavam
  // ao "pan" agora retornam para seleção; mover o mapa é feito segurando a
  // roda/botão central, sem trocar de ferramenta.
  if(t==='pan') t='select';
  const trava=activeLayer();
  if(trava && trava.locked &&
     ['point','line','poly','vertex','forma','dren','bacia','baciaRampa','baciaExt'].includes(t)){
    toast('A camada "'+trava.name+'" está bloqueada. Desbloqueie-a na aba GIS.');
    t='select';
  }
  // se estávamos desenhando drenagem e há traçado válido, SALVA antes de trocar
  // (evita perder a feição ao clicar num raster / mudar de ferramenta)
  if(!S._drenFinalizando && S.tool==='dren' && t!=='dren' && S._drenBuf && S._drenBuf.length>=2){
    S._drenFinalizando=true;
    try{ drenFinaliza(); }catch(e){}
    S._drenFinalizando=false;
  } else if(!S._drenFinalizando && S.tool==='dren' && t!=='dren' && (!S._drenBuf || S._drenBuf.length<2)){
    // traçado incompleto (<2 pontos): descarta o temporário sem erro
    if(S._drenTmp){ try{ map.removeLayer(S._drenTmp); }catch(e){} S._drenTmp=null; }
    S._drenBuf=null; S._drenCont=null; S._drenNome=null;
  }
  S.tool=t; document.querySelectorAll('.mtool').forEach(b=>{ if(b.id==='btnSnap') return; b.classList.toggle('on',b.dataset.tool===t); });
  if(t!=='forma' && typeof formaLimpaPrev==='function'){ formaLimpaPrev(); if(typeof FORMA==='object'){ FORMA.tipo=null; FORMA.dim=null; } }
  clearDraw(); clearVertices();
  {
    const mc=map.getContainer();
    mc.style.cursor='';
    mc.classList.toggle('cursor-select',t==='select');
    mc.classList.toggle('cursor-tool',t!=='select');
    mc.classList.remove('cursor-snap','cursor-snap-locked','cursor-panning');
    if(typeof limpaCursorSnap==='function') limpaCursorSnap();
  }
  const mb=document.getElementById('measBox');
  if(mb){ mb.classList.toggle('on', t==='measure'); if(t==='measure') refreshMeasPanel(); }
  // ferramentas que desenham/clicam NO MAPA: feições ficam transparentes ao ponteiro
  map.getContainer().classList.toggle('drawing',
    ['point','line','poly','profile','basin','measure','info','selpoly','inund','barr','lamina','dren','forma','bacia','baciaRampa','baciaExt','contBusca'].includes(t));
  // No desktop, o botão esquerdo pertence à ferramenta ativa; o mapa só se
  // move com a roda pressionada (bindMiddlePan). Em telas de toque preserva-se
  // o arraste nativo, exceto na seleção múltipla, que usa o gesto para a caixa.
  {
    const selOn = t==='selpoly';
    if(typeof mselPanel==='function') mselPanel(selOn);
    try{
      if(selOn || !S.touch) map.dragging.disable();
      else map.dragging.enable();
      if(selOn) map.doubleClickZoom.disable();
      else{
        map.doubleClickZoom.enable();
        /* Sair da ferramenta cancela somente o traçado ainda aberto. A
           seleção já confirmada continua válida para Delete, painel e
           realce; antes ela desaparecia ao pressionar Esc ou trocar para
           seleção simples. */
        if(typeof mselClearSketch==='function') mselClearSketch();
      }
    }catch(e){}
  }
  if(t!=='info' && typeof infoFecha==='function') infoFecha();
  if(t==='attr'){
    openAttr(); S.tool='select';
    const bs=document.querySelector('[data-tool="select"]'), ba=document.querySelector('[data-tool="attr"]');
    if(bs) bs.classList.add('on'); if(ba) ba.classList.remove('on');
  }
  if(t==='vertex' && S.selFeat) showVertices();
  // instrução de USO na barra de comandos (estilo linha de comando do CAD)
  if(typeof TOOL_INSTR!=='undefined' && TOOL_INSTR[t]) cmdLog('▸ '+TOOL_INSTR[t], 'cmd');
}
/* instruções de "como fazer" por ferramenta — aparecem na barra de comandos ao
   armar cada modo, como a linha de comando do AutoCAD. */
const TOOL_INSTR={
  pan:'Navegação: pressione a roda do mouse e arraste para mover; gire a roda para zoom.',
  select:'Seleção ligada: toque numa feição para selecionar/editar. Pressione a roda e arraste para mover o mapa.',
  point:'Desenhar PONTO: toque no mapa para criar cada ponto. Esc encerra.',
  line:'Desenhar LINHA: toque para somar vértices; Ctrl+Z desfaz o último; toque duplo ou Esc conclui.',
  poly:'Desenhar POLÍGONO: toque para somar vértices; Ctrl+Z desfaz; toque duplo ou Esc fecha e conclui.',
  profile:'PERFIL: toque nos pontos da linha de perfil; toque duplo conclui e gera o gráfico. Esc cancela.',
  basin:'BACIA: toque no ponto de saída (exutório) sobre o MDT para delimitar a área de contribuição.',
  measure:'MEDIR: marque dois pontos sobre uma ou duas linhas para obter ΔZ, distância 3D, inclinação e azimute. Esc limpa a medição sem sair da ferramenta.',
  selpoly:'SELEÇÃO por polígono: arraste para desenhar a área; toque duplo conclui e seleciona o que estiver dentro.',
  info:'INFORMAÇÃO do ponto: toque no mapa para ler coordenadas, cota do MDT, declividade e a feição mais próxima.',
  inund:'INUNDAÇÃO: toque no ponto onde a água começa a encher (semente). Defina cota e incremento no painel.',
  barr:'BARRAMENTO: toque para traçar o eixo da barragem; toque duplo conclui. A água não atravessa a linha.',
  lamina:'LÂMINA pela chuva: toque no ponto de saída da bacia para calcular a lâmina do evento de projeto.',
  dren:'DRENAGEM: toque para traçar a feição sobre o MDT; Ctrl+Z desfaz; Esc conclui e amostra cotas/declividade.',
  del:'APAGAR: toque na feição que deseja remover.',
  vertex:'EDITAR VÉRTICES: toque na feição; arraste os vértices, toque no ○ do meio para inserir, duplo-toque apaga.',
  select:'SELECIONAR: toque numa feição para selecioná-la e editá-la.'
};
/* ---------------- SNAP ----------------
   Atrai o clique para o vértice visível mais próximo (tolerância em PIXELS,
   estável em qualquer zoom). Cache de vértices por camada em WGS, construído
   sob demanda e invalidado quando a camada é redesenhada.                  */
S.snapOn=true;
// O uso mais comum é encostar em uma linha fina (régua, desenho e edição),
// portanto o snap ao traço já nasce ativo; vértices continuam tendo precedência.
S.snapVtxOn=true; S.snapMidOn=false; S.snapEndOn=false; S.snapNearOn=true; S.snapEscopo='todas';
const SNAP_PX=15;
function endpointsOf(L){
  // só as PONTAS (1º e último vértice) de cada linha/polígono — cache leve
  if(L._endCache) return L._endCache;
  const out=[];
  if(L.gtype!=='point'){
    for(const f of L.features){
      if(!f.geom) continue;
      const rings=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
      for(const r of rings){ if(!r||!r.length) continue;
        const a=r[0], b=r[r.length-1];
        const wa=toWGS(L.crs,a[0],a[1]); out.push(wa[1],wa[0]);
        const wb=toWGS(L.crs,b[0],b[1]); out.push(wb[1],wb[0]);
      }
    }
  }
  return (L._endCache=out);
}
function snapCacheOf(L){
  if(L._snapCache) return L._snapCache;
  const pts=[], mids=[], segs=[], refs=[]; let n=0;
  for(let fi=0;fi<(L.features||[]).length;fi++){
    const f=L.features[fi];
    if(!f.geom) continue;
    const rings=(L.gtype==='point')?[f.geom]:((f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom]);
    for(let ri=0;ri<rings.length;ri++){
      const r=rings[ri];
      if(!r||!r.length) continue;
      const ll=new Float64Array(r.length*2);
      let minLat=Infinity,minLng=Infinity,maxLat=-Infinity,maxLng=-Infinity;
      for(let i=0;i<r.length;i++){
        const pt=r[i];
        const w=toWGS(L.crs,pt[0],pt[1]),la=w[1],lo=w[0];
        ll[2*i]=la;ll[2*i+1]=lo;pts.push(la,lo);   // lat,lng
        if(la<minLat)minLat=la;if(la>maxLat)maxLat=la;
        if(lo<minLng)minLng=lo;if(lo>maxLng)maxLng=lo;
        if(L.gtype!=='point' && i<r.length-1){
          const q=r[i+1];
          const w2=toWGS(L.crs,(pt[0]+q[0])/2,(pt[1]+q[1])/2);
          if(S.snapMidOn) mids.push(w2[1],w2[0]);
          const wq=toWGS(L.crs,q[0],q[1]);
          segs.push(w[1],w[0],wq[1],wq[0]);
        }
        n++;
      }
      refs.push({idx:fi,f,ringIndex:ri,ll,minLat,minLng,maxLat,maxLng});
      // Alguns arquivos trazem anéis de polígono sem repetir o primeiro
      // vértice no final. Inclui também essa face de fechamento no snap.
      if(L.gtype==='polygon' && r.length>2){
        const a=r[0], b=r[r.length-1];
        if(a[0]!==b[0] || a[1]!==b[1]){
          const wa=toWGS(L.crs,a[0],a[1]), wb=toWGS(L.crs,b[0],b[1]);
          segs.push(wb[1],wb[0],wa[1],wa[0]);
          if(S.snapMidOn){
            const wm=toWGS(L.crs,(a[0]+b[0])/2,(a[1]+b[1])/2); mids.push(wm[1],wm[0]);
          }
        }
      }
    }
  }
  return (L._snapCache={pts,mids,segs,refs,partial:false,count:n});
}
function snapLatLng(latlng, ignoraL, op){
  if(!S.snapOn) return {latlng, snapped:false};
  const p0=map.latLngToContainerPoint(latlng);
  let best=null, bestKind='', bd=SNAP_PX*SNAP_PX;
  // margem geográfica p/ filtro grosso (evita projetar tudo p/ pixel)
  const p1=map.containerPointToLatLng([p0.x+SNAP_PX, p0.y+SNAP_PX]);
  const dLat=Math.abs(p1.lat-latlng.lat)*1.6, dLng=Math.abs(p1.lng-latlng.lng)*1.6;
  const scan=(pts,kind)=>{
    for(let i=0;i<pts.length;i+=2){
      const la=pts[i], lo=pts[i+1];
      if(Math.abs(la-latlng.lat)>dLat || Math.abs(lo-latlng.lng)>dLng) continue;
      const pp=map.latLngToContainerPoint([la,lo]);
      const d=(pp.x-p0.x)**2+(pp.y-p0.y)**2;
      if(d<bd){ bd=d; best=[la,lo]; bestKind=kind; }
    }
  };
  // Projeta o cursor perpendicularmente sobre cada segmento e usa o pé da
  // perpendicular como alvo. A tolerância continua em pixels, portanto o
  // comportamento é estável em qualquer escala/zoom do mapa.
  const scanSegments=(segs,kind)=>{
    for(let i=0;i<segs.length;i+=4){
      const la1=segs[i], lo1=segs[i+1], la2=segs[i+2], lo2=segs[i+3];
      if(Math.max(la1,la2)<latlng.lat-dLat || Math.min(la1,la2)>latlng.lat+dLat ||
         Math.max(lo1,lo2)<latlng.lng-dLng || Math.min(lo1,lo2)>latlng.lng+dLng) continue;
      const a=map.latLngToContainerPoint([la1,lo1]);
      const b=map.latLngToContainerPoint([la2,lo2]);
      const dx=b.x-a.x, dy=b.y-a.y, den=dx*dx+dy*dy;
      let t=den?((p0.x-a.x)*dx+(p0.y-a.y)*dy)/den:0;
      t=Math.max(0,Math.min(1,t));
      const qx=a.x+t*dx, qy=a.y+t*dy;
      const d=(qx-p0.x)**2+(qy-p0.y)**2;
      if(d<bd){ bd=d; best=[la1+t*(la2-la1),lo1+t*(lo2-lo1)]; bestKind=kind; }
    }
  };
  const ativa=(S.snapEscopo==='ativa' && typeof activeLayer==='function')? activeLayer() : null;
  S.layers.forEach(L=>{ if(!L || L.visible===false || !L.features) return;
    // Na edição, "ignoraL" identifica a camada da feição manipulada. Excluir
    // a camada inteira impedia o snap em todas as outras linhas dela. Só há
    // exclusão total quando uma chamada pedir isso explicitamente.
    if(op&&op.ignoreLayer&&ignoraL&&L===ignoraL) return;
    if(ativa && L!==ativa) return;                    // escopo "só camada ativa"
    const c=snapCacheOf(L);
    if(S.snapVtxOn!==false) scan(c.pts,'vértice');
    if(S.snapMidOn && c.mids) scan(c.mids,'ponto médio');
    if(S.snapEndOn) scan(endpointsOf(L),'extremidade');
    if(S.snapNearOn && c.segs) scanSegments(c.segs,'linha'); }); // qualquer ponto do segmento
  // vértices do próprio traçado em andamento (fechar polígono no 1º ponto)
  if(S.drawBuf&&S.drawBuf.length) scan(S.drawBuf.flatMap(q=>[q[0],q[1]]),'vértice do desenho');
  if(best){
    // indicador visual momentâneo
    if(!op || op.flash!==false){
      const mk=L2.circleMarker(best,{radius:9,color:'#37c0aa',weight:2.5,fill:false,interactive:false}).addTo(map);
      setTimeout(()=>{ try{map.removeLayer(mk);}catch(e){} },450);
    }
    return {latlng:L2.latLng(best[0],best[1]), snapped:true, kind:bestKind};
  }
  return {latlng, snapped:false};
}

/* Feição selecionável mais próxima em pixels. Diferentemente do snap de
   desenho (que respeita vértice/meio/extremidade), esta busca considera todo
   o traço: serve para avisar com a cruz e permite selecionar sem precisar
   acertar exatamente uma linha fina. */
function feicaoMaisProximaPx(latlng, tolerancia, soLinha){
  if(!map || !latlng) return null;
  const p0=map.latLngToContainerPoint(latlng);
  const tol=tolerancia||SNAP_PX;
  let melhor=null, dMelhor=tol*tol;
  const p1=map.containerPointToLatLng([p0.x+tol,p0.y+tol]);
  const dLat=Math.abs(p1.lat-latlng.lat)*1.8,dLng=Math.abs(p1.lng-latlng.lng)*1.8;
  /* O escopo "só a camada ativa" pertence ao ÍMÃ (snapLatLng), não à
     SELEÇÃO: com ele aplicado aqui, um clique em qualquer linha devolvia
     sempre a feição da camada ativa (ex.: o limite DCE) e nada mais era
     selecionável. A seleção enxerga todas as camadas visíveis. */
  const ativa=null;
  const testaPonto=(q,L,idx,f)=>{
    const p=map.latLngToContainerPoint(q);
    const d=(p.x-p0.x)**2+(p.y-p0.y)**2;
    if(d<=dMelhor){ dMelhor=d; melhor={d:Math.sqrt(d),L,idx,f,
      latlng:L2.latLng(q),snapped:true,kind:'vértice'}; }
  };
  const testaSegmento=(aLL,bLL,L,idx,f,ringIndex,segIndex)=>{
    const a=map.latLngToContainerPoint(aLL), b=map.latLngToContainerPoint(bLL);
    const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
    let t=den?((p0.x-a.x)*dx+(p0.y-a.y)*dy)/den:0;
    t=Math.max(0,Math.min(1,t));
    const qx=a.x+t*dx,qy=a.y+t*dy,d=(qx-p0.x)**2+(qy-p0.y)**2;
    if(d<=dMelhor){ dMelhor=d; melhor={d:Math.sqrt(d),L,idx,f,ringIndex,segIndex,t,
      latlng:map.containerPointToLatLng([qx,qy]),snapped:true,kind:'feição'}; }
  };
  for(const L of S.layers){
    if(!L || L.visible===false || !L.features || (ativa && L!==ativa)) continue;
    if(soLinha && !['line','polygon'].includes(L.gtype)) continue;
    const refs=snapCacheOf(L).refs||[];
    for(const e of refs){
      const f=e.f,idx=e.idx,ringIndex=e.ringIndex,ll=e.ll;
      if(!f || (typeof featureVisible==='function' && !featureVisible(L,f))) continue;
      // Rejeição espacial barata: somente feições cuja caixa toca a pequena
      // janela da mira chegam à projeção em pixels. Não há mais corte por
      // quantidade; linhas no fim de camadas grandes continuam elegíveis.
      if(e.maxLat<latlng.lat-dLat||e.minLat>latlng.lat+dLat||
         e.maxLng<latlng.lng-dLng||e.minLng>latlng.lng+dLng) continue;
      if(L.gtype==='point'){
        for(let i=0;i<ll.length;i+=2)testaPonto([ll[i],ll[i+1]],L,idx,f);
        continue;
      }
      for(let i=0;i<ll.length-2;i+=2)
        testaSegmento([ll[i],ll[i+1]],[ll[i+2],ll[i+3]],L,idx,f,ringIndex,i/2);
      if(L.gtype==='polygon'&&ll.length>4)
        testaSegmento([ll[ll.length-2],ll[ll.length-1]],[ll[0],ll[1]],L,idx,f,ringIndex,ll.length/2-1);
    }
  }
  return melhor;
}

let _cursorSnapTempo=0;
function cursorSnapEl(){
  const mc=map&&map.getContainer?map.getContainer():null;
  if(!mc) return null;
  let el=mc.querySelector('.snap-lock-target');
  if(!el){
    el=document.createElement('div'); el.className='snap-lock-target';
    el.innerHTML='<span></span>'; mc.appendChild(el);
  }
  return el;
}
function limpaCursorSnap(){
  const mc=map&&map.getContainer?map.getContainer():null;
  if(mc) mc.classList.remove('cursor-snap-locked');
  const el=mc&&mc.querySelector('.snap-lock-target');
  if(el) el.style.display='none';
  S._cursorSnapLL=null;
}
function mostraCursorSnap(hit){
  const mc=map&&map.getContainer?map.getContainer():null, el=cursorSnapEl();
  if(!mc||!el||!hit||!hit.snapped){ limpaCursorSnap(); return; }
  const p=map.latLngToContainerPoint(hit.latlng);
  el.style.left=p.x+'px'; el.style.top=p.y+'px'; el.style.display='block';
  let z=Number(hit.z);
  if(!Number.isFinite(z) && S.tool==='measure' && typeof measHitZ==='function'){
    try{ z=Number(measHitZ(hit)); }catch(_){ z=NaN; }
  }
  const tx=el.querySelector('span'); if(tx) tx.textContent=(hit.kind||'snap')+
    (Number.isFinite(z)?` · Z ${z.toFixed(2)} m`:'');
  mc.classList.add('cursor-snap-locked');
  S._cursorSnapLL=hit.latlng;
}
function atualizaCursorSnap(latlng){
  const el=map&&map.getContainer?map.getContainer():null;
  if(!el) return;
  if(!S.snapOn){
    el.classList.remove('cursor-snap'); S._cursorSnapHit=null; limpaCursorSnap(); return;
  }
  const agora=(typeof performance!=='undefined'?performance.now():Date.now());
  if(agora-_cursorSnapTempo<45) return;
  _cursorSnapTempo=agora;
  if(S.tool==='measure' && typeof measMode==='function' && measMode()==='lines'){
    const hit=feicaoMaisProximaPx(latlng,S.touch?Math.round(SNAP_PX*1.7):Math.max(18,SNAP_PX),true);
    S._cursorSnapHit=hit||null;
    el.classList.remove('cursor-snap');
    if(S._cursorSnapHit){
      mostraCursorSnap({...S._cursorSnapHit,kind:(S.meas.lineRefs||[]).length?'PONTO 2':'PONTO 1'});
    }else limpaCursorSnap();
    return;
  }
  if(S.tool==='measure' && typeof measMode==='function' && measMode()==='points'
     && !(document.getElementById('mbSnap')||{}).checked){
    S._cursorSnapHit=null; el.classList.remove('cursor-snap'); limpaCursorSnap(); return;
  }
  if(['point','line','poly','forma','measure'].includes(S.tool)){
    const alvo=snapLatLng(latlng,null,{flash:false});
    S._cursorSnapHit=alvo.snapped?alvo:null;
    el.classList.remove('cursor-snap');
    if(alvo.snapped) mostraCursorSnap(alvo); else limpaCursorSnap();
    return;
  }
  limpaCursorSnap();
  if(S.tool!=='select'){
    el.classList.remove('cursor-snap'); S._cursorSnapHit=null; return;
  }
  const hit=feicaoMaisProximaPx(latlng,SNAP_PX);
  S._cursorSnapHit=hit;
  el.classList.remove('cursor-snap');
  if(hit) mostraCursorSnap(hit); else limpaCursorSnap();
}
(function snapUI(){
  const btn=document.getElementById('btnSnap');
  const menu=document.getElementById('snapMenu');
  if(!btn||!menu) return;
  const g=id=>document.getElementById(id);
  const sync=()=>{
    btn.classList.toggle('on', S.snapOn);
    g('snEnable').checked=S.snapOn;
    g('snVtx').checked=(S.snapVtxOn!==false);
    g('snMid').checked=!!S.snapMidOn;
    g('snEnd').checked=!!S.snapEndOn;
    g('snNear').checked=!!S.snapNearOn;
    g('snEscAtiva').checked=(S.snapEscopo==='ativa');
    g('snEscTodas').checked=(S.snapEscopo!=='ativa');
    // reflete no CAD (fonte compartilhada)
    const cv=g('cadSnapV'), cm=g('cadSnapM');
    if(cv) cv.checked=(S.snapVtxOn!==false); if(cm) cm.checked=!!S.snapMidOn;
    const dica = S.snapOn ? ('Snap: '+[S.snapVtxOn!==false?'vértice':'', S.snapMidOn?'meio':'',
        S.snapEndOn?'pontas':'', S.snapNearOn?'linha mais próxima':'']
        .filter(Boolean).join('+')+' · '+(S.snapEscopo==='ativa'?'camada ativa':'todas')) : 'Snap desligado';
    btn.title=dica+' (clique para opções)';
  };
  const abrir=()=>{
    sync();
    // posiciona o menu ao lado direito do botão do ímã (segue a barra de ferramentas)
    const r=btn.getBoundingClientRect();
    menu.classList.add('on');
    popupFitViewport(menu,r.right+8,r.top,8);
  };
  const fechar=()=>menu.classList.remove('on');
  btn.onclick=(e)=>{ e.stopPropagation(); menu.classList.contains('on')?fechar():abrir(); };
  document.addEventListener('click',e=>{ if(!menu.contains(e.target) && e.target!==btn) fechar(); });
  /* Esc fecha o menu do snap como qualquer outro comando */
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&menu.classList.contains('on')){
      e.preventDefault(); e.stopImmediatePropagation(); fechar();
    }
  },true);

  g('snEnable').onchange=e=>{ S.snapOn=e.target.checked;
    if(!S.snapOn){ try{ map.getContainer().classList.remove('cursor-snap'); }catch(_){} S._cursorSnapHit=null; }
    sync();
    toast('Snap '+(S.snapOn?'ligado':'desligado')); };
  g('snVtx').onchange=e=>{ S.snapVtxOn=e.target.checked; if(S.snapVtxOn||S.snapMidOn||S.snapEndOn||S.snapNearOn){S.snapOn=true;} sync(); };
  g('snMid').onchange=e=>{ S.snapMidOn=e.target.checked; S.layers.forEach(l=>l._snapCache=null);
    if(S.snapMidOn){S.snapOn=true;} sync(); };
  g('snEnd').onchange=e=>{ S.snapEndOn=e.target.checked; S.layers.forEach(l=>l._endCache=null);
    if(S.snapEndOn){S.snapOn=true;} sync(); };
  g('snNear').onchange=e=>{ S.snapNearOn=e.target.checked; S.layers.forEach(l=>l._snapCache=null);
    if(S.snapNearOn){S.snapOn=true;} sync(); };
  g('snEscAtiva').onchange=()=>{ S.snapEscopo='ativa'; sync(); };
  g('snEscTodas').onchange=()=>{ S.snapEscopo='todas'; sync(); };
  sync();
})();

/* ---- informa\u00e7\u00f5es da fei\u00e7\u00e3o mais pr\u00f3xima ------------------------------------
   Percorre as camadas vis\u00edveis e mede a dist\u00e2ncia do toque a cada fei\u00e7\u00e3o \u2014 a
   pontos, aos v\u00e9rtices e aos SEGMENTOS, porque numa linha o ponto mais pr\u00f3ximo
   quase nunca \u00e9 um v\u00e9rtice. Assim n\u00e3o \u00e9 preciso acertar o tra\u00e7ado.          */
let infoPop=null;
function infoFecha(){ if(infoPop){ try{ map.closePopup(infoPop); }catch(e){} infoPop=null; } }

function distPtSeg(p,a,b){
  const vx=b[0]-a[0], vy=b[1]-a[1], L2s=vx*vx+vy*vy;
  if(L2s<1e-12) return Math.hypot(p[0]-a[0], p[1]-a[1]);
  let t=((p[0]-a[0])*vx+(p[1]-a[1])*vy)/L2s;
  t=Math.max(0,Math.min(1,t));
  return Math.hypot(p[0]-(a[0]+t*vx), p[1]-(a[1]+t*vy));
}
