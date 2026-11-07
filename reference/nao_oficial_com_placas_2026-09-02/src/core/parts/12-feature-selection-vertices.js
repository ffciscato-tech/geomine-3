/* ---------- Seleção & edição de vértices ---------- */
function pickFeature(L, idx, latlng, op){
  op=op||{};
  /* MODOS DE CAPTURA: quando um comando está esperando um toque, o
     clique numa feição era engolido aqui (DomEvent.stop) e o
     map.once('click') nunca disparava — "toque na linha" não fazia
     nada. Os ganchos entregam o toque ao comando, venha do mapa ou
     de cima de uma feição. */
  if(S._pickCadHatch){
    const cb=S._pickCadHatch;
    try{cb(L,idx,latlng);}catch(e){console.warn('pickCadHatch',e);}
    return;
  }
  if(S._pickCavaFreeze){
    const cb=S._pickCavaFreeze;S._pickCavaFreeze=null;
    try{cb(L,idx,latlng);}catch(e){console.warn('pickCavaFreeze',e);}
    return;
  }
  if(S._pickLimite){
    const cb=S._pickLimite;S._pickLimite=null;
    if(S._pickPonto)S._pickPonto=null;
    try{cb(L,idx,latlng);}catch(e){console.warn('pickLimite',e);}
    return;
  }
  if(S._pickPonto&&latlng){
    const cb=S._pickPonto;S._pickPonto=null;
    try{cb(latlng);}catch(e){console.warn('pickPonto',e);}
    return;
  }
  const fSelecionada=L.features[idx];
  let partIdx=Number.isInteger(op.partIdx)?op.partIdx:featParteMaisProxima(L,fSelecionada,latlng);
  if(!selParteValida({partIdx},L,fSelecionada))partIdx=null;
  if(S.tool==='del'){
    apagarSelecao({layer:L,layerId:L.id,idx,partIdx},true);return;
  }
  const oe=op.originalEvent||{},aditivo=!!(oe.ctrlKey||oe.metaKey||oe.shiftKey);
  if(aditivo){
    const itens=S.msel.items||[];
    if(S.selFeat){
      const q=S.selFeat,k=`${q.layerId}:${q.idx}:${Number.isInteger(q.partIdx)?q.partIdx:'*'}`;
      if(!itens.some(x=>`${x.layerId}:${x.idx}:${Number.isInteger(x.partIdx)?x.partIdx:'*'}`===k))
        itens.push({layerId:q.layerId,idx:q.idx,partIdx:q.partIdx});
    }
    const atual={layerId:L.id,idx,partIdx},key=`${L.id}:${idx}:${Number.isInteger(partIdx)?partIdx:'*'}`;
    const pos=itens.findIndex(x=>`${x.layerId}:${x.idx}:${Number.isInteger(x.partIdx)?x.partIdx:'*'}`===key);
    if(pos>=0)itens.splice(pos,1);else itens.push(atual);
    S.msel.items=itens;S.selFeat=null;S.activeId=L.id;
    if(selHL){map.removeLayer(selHL);selHL=null;}closeFeatMenu();clearVertices();
    mselHL();mselCount();refreshUI();toast(`${itens.length} feição(ões)/parte(s) selecionada(s)`);return;
  }
  /* Seleção simples substitui a múltipla confirmada. Sem isto o painel podia
     mostrar uma feição enquanto Delete ainda apagava o conjunto antigo. */
  if(S.msel&&S.msel.items&&S.msel.items.length)mselClear(true);
  S.activeId=L.id; S.selFeat={layer:L, layerId:L.id, idx, partIdx};
  const bd=document.getElementById('btnBaciaDetalhe');
  if(bd) bd.style.display=(L.tinSurface&&L.tinSurface.kind==='bacia-rampa-v1')?'':'none';
  /* Selecionar a caixa já troca a caixa de trabalho: rampa, extravasor,
     MDT cortado e detalhamento passam a valer para ela. */
  if(L.tinSurface&&L.tinSurface.kind==='bacia-rampa-v1')
    try{baciaAtualizaBotaoMDT();}catch(e){}
  refreshUI(); showProps();
  try{ if(typeof laminaAcaoUI==='function') laminaAcaoUI(); }catch(e){}
  try{ if(typeof drenTalvezMostra==='function') drenTalvezMostra(L, L.features[idx]); }catch(e){}
  if(S.tool==='vertex'){ showVertices(); return; }
  highlightSel();
  if(latlng) openFeatMenu(L, idx, latlng);     // menu flutuante de edição
}
/* ---------- menu flutuante da feição (clique esquerdo) ---------- */
let featMenuEl=null;
function closeFeatMenu(){ if(featMenuEl){ featMenuEl.remove(); featMenuEl=null; } }
/* Há comando de mapa em andamento? Se houver, Esc é dele: cancela o traçado,
   não fecha a janela que o parametriza. */
function cmdEmAndamento(){
  try{
    if(S.drawBuf && S.drawBuf.length) return true;
    if(S._drenBuf && S._drenBuf.length) return true;
    if(S.meas && S.meas.buf && S.meas.buf.length) return true;
    if(S.msel && S.msel.buf && S.msel.buf.length) return true;
    if(S.prof && S.prof.buf && S.prof.buf.length) return true;
    if(typeof BACIA==='object' && BACIA && BACIA.fase) return true;
    if(typeof BACIA_RAMPA!=='undefined' && BACIA_RAMPA) return true;
    if(typeof BACIA_EXT!=='undefined' && BACIA_EXT) return true;
  }catch(e){}
  return false;
}
/* Fecha a janela mais acima da pilha. Antes o Esc apenas cedia a vez para a
   janela aberta — e nenhuma delas tratava a tecla, de modo que Esc não fechava
   nada com uma janela na tela (edição de camada, painel de parâmetros do
   comando, tabela de atributos). */
function janelaFechaTopo(){
  if(typeof featMenuEl!=='undefined' && featMenuEl){
    try{ closeFeatMenu(); }catch(e){}
    return true;
  }
  const modal=[...document.querySelectorAll('.modal-bg.on')].pop();
  if(modal){
    const cab=modal.querySelector('.modal-h')||modal;
    const fech=[...cab.querySelectorAll('button,.gdel,.gset,.tbtn,span')]
      .find(x=>{ const t=(x.textContent||'').trim();
        return /^(fechar|cancelar|✕|×|✖)$/i.test(t) || /close$/i.test(x.id||''); });
    if(fech){ try{ fech.click(); }catch(e){} }
    if(modal.classList.contains('on')) modal.classList.remove('on');
    return true;
  }
  const pop=document.getElementById('ribbonPop');
  if(pop && pop.classList.contains('on')){ try{ ribbonClose(); }catch(e){} return true; }
  const attr=document.getElementById('attrPanel');
  if(attr && attr.classList.contains('open')){ attr.classList.remove('open'); return true; }
  return false;
}
/* O menu nascia no ponto do toque + 10 px, ou seja, EM CIMA da feição recém
   selecionada e das vizinhas. Para escolher outra feição era preciso primeiro
   tirar o menu do caminho — e um toque descuidado caía em "Apagar feição". */
function featMenuColoca(el,L,f,latlng,idx){
  const cont=map.getContainer(), r=cont.getBoundingClientRect();
  const W=el.offsetWidth||210, H=el.offsetHeight||250, m=8;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  try{
    const pts=[];
    (function achata(a){ if(!a) return;
      if(typeof a[0]==='number'){ pts.push(a); return; }
      a.forEach(achata); })(featToLatLngs(L,f));
    pts.forEach(q=>{ const c=map.latLngToContainerPoint(L2.latLng(q[0],q[1]));
      x0=Math.min(x0,c.x); y0=Math.min(y0,c.y); x1=Math.max(x1,c.x); y1=Math.max(y1,c.y); });
  }catch(e){}
  if(!isFinite(x0)){
    const c=map.latLngToContainerPoint(latlng);
    x0=c.x-18; x1=c.x+18; y0=c.y-18; y1=c.y+18;
  }
  const pc=map.latLngToContainerPoint(latlng);
  const dentro=(px,py)=>px>=m && py>=m && px+W<=r.width-m && py+H<=r.height-m;
  const alinhaY=()=>Math.min(Math.max(m,pc.y-H/2), r.height-m-H);
  const alinhaX=()=>Math.min(Math.max(m,pc.x-W/2), r.width-m-W);
  const opcoes=[[x1+12,alinhaY()],[x0-W-12,alinhaY()],[alinhaX(),y1+12],[alinhaX(),y0-H-12]]
    .filter(([a,b])=>dentro(a,b));
  let pos=opcoes[0];
  if(opcoes.length>1){
    const viz=[]; let n=0;
    (S.layers||[]).forEach(Ly=>{
      if(n>250 || !Ly.visible || !Ly.llayer || !Ly.llayer.getLayers) return;
      Ly.llayer.getLayers().forEach(lyr=>{
        if(n>250 || !lyr.getBounds) return;
        if(Ly===L && lyr._fidx===idx) return;
        let b; try{ b=lyr.getBounds(); }catch(e){ return; }
        if(!b || !b.isValid()) return;
        const a=map.latLngToContainerPoint(b.getNorthWest()),
              c=map.latLngToContainerPoint(b.getSouthEast());
        if(c.x<0||a.x>r.width||c.y<0||a.y>r.height) return;
        viz.push([a.x,a.y,c.x,c.y]); n++;
      });
    });
    const tapa=([px,py])=>viz.reduce((s2,[bx0,by0,bx1,by1])=>
      s2+((px<bx1&&px+W>bx0&&py<by1&&py+H>by0)?1:0),0);
    pos=opcoes.map(o=>[o,tapa(o)]).sort((u,v)=>u[1]-v[1])[0][0];
  }
  if(!pos){
    const lado=[[r.width-x1,'d'],[x0,'e'],[r.height-y1,'b'],[y0,'c']].sort((a,b)=>b[0]-a[0])[0][1];
    pos = lado==='d' ? [r.width-m-W, alinhaY()]
        : lado==='e' ? [m, alinhaY()]
        : lado==='b' ? [alinhaX(), r.height-m-H]
        : [alinhaX(), m];
  }
  const px=Math.min(Math.max(m,pos[0]), Math.max(m, r.width -m-W));
  const py=Math.min(Math.max(m,pos[1]), Math.max(m, r.height-m-H));
  popupFitViewport(el, r.left+px, r.top+py, m);
}
function openFeatMenu(L, idx, latlng){
  closeFeatMenu();
  const f=L.features[idx]; if(!f) return;
  const p=map.latLngToContainerPoint(latlng);
  const r=map.getContainer().getBoundingClientRect();
  const nm=(L.labelField&&f.props[L.labelField]!=null&&f.props[L.labelField]!=='')?f.props[L.labelField]:('#'+idx);
  featMenuEl=document.createElement('div');
  featMenuEl.className='feat-menu';
  featMenuEl.style.cssText=
    `position:fixed;left:${Math.min(r.left+p.x+10, innerWidth-215)}px;top:${Math.min(r.top+p.y+10, innerHeight-260)}px;`+
    'z-index:3200;background:var(--panel,#151b26);border:1px solid var(--line,#2a3446);border-radius:10px;'+
    'box-shadow:0 8px 26px #000a;min-width:200px;overflow:hidden;font-size:13px;user-select:none';
  const item=(ic,tx,sub)=>`<div class="fm-it" style="padding:9px 12px;cursor:pointer;display:flex;gap:9px;align-items:center;border-top:1px solid var(--line,#2a3446)">
      <span style="width:18px;text-align:center">${ic}</span><div>${tx}${sub?`<br><span style="font-size:10.5px;color:var(--ink-dim)">${sub}</span>`:''}</div></div>`;
  featMenuEl.innerHTML=
    `<div style="padding:8px 12px;background:#0004;font-weight:600;display:flex;align-items:center;gap:8px">
       ${esc(L.name)} · ${esc(String(nm))}<span style="margin-left:auto;cursor:pointer;color:var(--ink-dim)" class="fm-x">✕</span></div>`+
    item('✏️','Editar vértices','arraste p/ mover · toque no ○ do meio p/ adicionar · 2 toques p/ remover')+
    item('📋','Atributos da feição','')+
    item('🔍','Zoom na feição','')+
    item('🗑',selParteValida(S.selFeat,L,f)?'Apagar somente esta parte':'Apagar feição','');
  document.body.appendChild(featMenuEl);
  featMenuColoca(featMenuEl,L,f,latlng,idx);
  const its=featMenuEl.querySelectorAll('.fm-it');
  its[0].onclick=()=>{ closeFeatMenu(); setTool('vertex'); showVertices();
    toast('Edição de vértices — arraste, ○ do meio adiciona, 2 toques remove; Esc/pan encerra'); };
  its[1].onclick=()=>{ closeFeatMenu(); openAttr(idx); };
  its[2].onclick=()=>{ closeFeatMenu();
    const lls=featToLatLngs(L,f);
    if(L.gtype==='point') map.setView(lls[0], Math.max(map.getZoom(),18));
    else safeFit(L2.latLngBounds(L.gtype==='polygon'?lls.flat():lls).pad(0.3)); };
  its[3].onclick=()=>{ closeFeatMenu();
    apagarSelecao(S.selFeat&&S.selFeat.layerId===L.id&&S.selFeat.idx===idx
      ?S.selFeat:{layer:L,layerId:L.id,idx,partIdx:null},false); };
  featMenuEl.querySelector('.fm-x').onclick=closeFeatMenu;
  setTimeout(()=>{
    const away=(ev)=>{ if(featMenuEl && !featMenuEl.contains(ev.target)){ closeFeatMenu(); document.removeEventListener('pointerdown',away); } };
    document.addEventListener('pointerdown',away);
  },0);
}
let selHL;
function highlightSel(){
  if(selHL){map.removeLayer(selHL);selHL=null;}
  try{ attrDestacaSelecao(); }catch(e){}      // a tabela segue a seleção
  try{ cavaSincronizaSelecao(); }catch(e){}   // o seletor do limite também
  /* durante a edição de vértices os marcadores JÁ mostram a feição —
     o halo laranja por cima só atrapalha a leitura dos pontos */
  if(S._vtxCtx||(S.vtxLayer&&S.vtxLayer.getLayers&&S.vtxLayer.getLayers().length))return;
  if(!S.selFeat) return; const {layer:L,idx,partIdx}=S.selFeat; const f=L.features[idx]; if(!f) return;
  let lls=featToLatLngs(L,f);
  if(selParteValida(S.selFeat,L,f)){
    const partes=featPartesLatLng(L,f);lls=(L.gtype==='point')?partes[partIdx]:partes[partIdx];
  }
  const PN={pane:'alagis_desenho', interactive:false};
  /* Duas camadas: halo escuro largo por baixo e tracejado claro por cima. O
     tracejado branco sozinho desaparece sobre ortofoto clara — e o realçe só
     serve se for visto.                                                      */
  if(L.gtype==='point'){
    selHL=L2.layerGroup([
      L2.circleMarker(selParteValida(S.selFeat,L,f)?lls[0]:lls[0],{radius:11,color:'#1a1206',weight:5,opacity:.45,fillOpacity:0,...PN}),
      L2.circleMarker(selParteValida(S.selFeat,L,f)?lls[0]:lls[0],{radius:11,color:'#f5a524',weight:2.5,fillOpacity:0,...PN})
    ]).addTo(map);
  } else {
    const K = L.gtype==='polygon'?'polygon':'polyline';
    selHL=L2.layerGroup([
      L2[K](lls,{color:'#1a1206',weight:7,opacity:.40,fill:false,...PN}),
      L2[K](lls,{color:'#f5a524',weight:3,dashArray:'7,4',fill:false,...PN})
    ]).addTo(map);
  }
}
/* A TABELA ACOMPANHA A SELEÇÃO DO MAPA.
   Selecionar no mapa já destacava a feição no desenho, mas a linha
   correspondente da tabela continuava onde estava — em camada com centenas de
   feições, achá-la à mão era inviável. Aqui a linha é marcada e trazida para
   a vista. Se a tabela estiver fechada, ou mostrando outra camada, nada
   acontece: abrir sozinha atrapalharia quem só quer clicar no mapa. */
function attrDestacaSelecao(){
  const painel=document.getElementById('attrPanel');
  if(!painel || !painel.classList.contains('open')) return;
  const corpo=document.getElementById('attrBody'); if(!corpo) return;
  corpo.querySelectorAll('tr.sel').forEach(r=>r.classList.remove('sel'));
  const sel=S.selFeat; if(!sel) return;
  /* Compara com a camada que GEROU a tabela (gravada em data-lid), não com a
     camada ativa: criar/ativar outra camada troca a ativa sem reconstruir a
     tabela, e aí a linha de mesmo índice seria marcada por engano. */
  const Lsel=sel.layer||(S.layers||[]).find(x=>x.id===sel.layerId);
  if(!Lsel || String(corpo.dataset.lid||'')!==String(Lsel.id)) return;
  const tr=corpo.querySelector(`tr[data-i="${sel.idx}"]`);
  if(!tr) return;                       // filtrada pelo filtro de atributos
  tr.classList.add('sel');
  try{ tr.scrollIntoView({block:'nearest',behavior:'smooth'}); }catch(e){ try{ tr.scrollIntoView(); }catch(_){} }
}
/* Enquadra a feição na parte VISÍVEL do mapa: a tabela de atributos cobre a
   faixa inferior, e centralizar no mapa inteiro esconderia a feição atrás
   dela — era o motivo de a seleção parecer não funcionar.                    */
function zoomToSel(){
  if(!S.selFeat) return;
  const {layer:L,idx}=S.selFeat; const f=L.features[idx]; if(!f) return;
  let lls; try{ lls=featToLatLngs(L,f); }catch(e){ return; }
  const pts=[];
  (function achata(a){ if(!a) return;
    if(typeof a[0]==='number'){ pts.push(a); return; }
    a.forEach(achata); })(lls);
  if(!pts.length) return;
  const ap=document.getElementById('attrPanel');
  const hPain=(ap && ap.classList.contains('open')) ? ap.getBoundingClientRect().height : 0;
  const b=L2.latLngBounds(pts);
  try{
    map.fitBounds(b, {paddingTopLeft:[30,30], paddingBottomRight:[30, Math.round(hPain)+30],
                      maxZoom: Math.max(map.getZoom(), 18), animate:true});
  }catch(e){ map.panTo(pts[0]); }
}
function clearVertices(){ S.vtxLayer.clearLayers(); if(selHL){map.removeLayer(selHL);selHL=null;}
  /* ÓRFÃOS DE ARRASTO INTERROMPIDO: se um rebuild aconteceu no meio de um
     gesto (live-sync do limite dispara replay durante o arraste), o ícone
     antigo podia sobrar solto no pane, fora do grupo — os "pontos soltos
     de +" na edição. Depois do clearLayers, QUALQUER ícone do editor ainda
     no DOM é órfão por definição e sai junto. */
  try{
    document.querySelectorAll('.vtx,.vtx-sel,.vtx-mid,.vtx-mover').forEach(el=>{
      const mk=el.closest('.leaflet-marker-icon');
      (mk||el).remove();
    });
  }catch(e){}
  S._vtxCtx=null; if(!S._vtxSelPreserve)S._vtxSel=null; }
/* Resolve a cota de um anel mesmo quando uma edição antiga acrescentou ou
   removeu XY sem fazer a mesma operação em f.zg. Esse era exatamente o caso
   observado no projeto: 142 vértices e só 138 cotas; os quatro restantes
   caíam no plano Z=0 na Visão 3D.

   Prioridade: Z embutido no ponto > zg já alinhado > atributo altimétrico >
   reamostragem do zg antigo. Cotas constantes (crista/pé/limite) permanecem
   rigorosamente constantes; uma rampa monotônica é interpolada pela distância
   acumulada, conservando a declividade ao inserir vértices. */
function resolveFeatureZRing(f,ring,ri,nested,aplicar){
  if(!f||!Array.isArray(ring)||!ring.length)return null;
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9]/g,''),p=f.props||{},ks=Object.keys(p),
    nomes=['Z','COTA','COTASUP','ELEVACAO','ELEVATION','ELEV','ALTITUDE','ALTIMETRIA','RL','NIVEL'];
  let zAttr=null;
  for(const nome of nomes){
    const k=ks.find(x=>norm(x)===nome);
    if(k!=null){const v=Number(String(p[k]).replace(',','.'));if(Number.isFinite(v)){zAttr=v;break;}}
  }
  let bruto=null;
  if(Array.isArray(f.zg))bruto=nested?(Array.isArray(f.zg[ri])?f.zg[ri]:null):
    (typeof f.zg[0]==='number'?f.zg:null);
  const temZGeom=ring.some(q=>Array.isArray(q)&&q.length>2&&Number.isFinite(+q[2]));
  const alinhado=Array.isArray(bruto)&&bruto.length===ring.length&&
    bruto.every(Number.isFinite);
  if(alinhado&&!temZGeom)return bruto;
  const validos=Array.isArray(bruto)?bruto.map(Number).filter(Number.isFinite):[];
  if(!temZGeom&&!Number.isFinite(zAttr)&&!validos.length)return null;
  const monotono=validos.length>1&&validos.every((z,i)=>!i||z>=validos[i-1]-1e-9)||
    (validos.length>1&&validos.every((z,i)=>!i||z<=validos[i-1]+1e-9));
  const acum=[0];let total=0;
  for(let i=1;i<ring.length;i++){
    total+=Math.hypot(ring[i][0]-ring[i-1][0],ring[i][1]-ring[i-1][1]);acum.push(total);
  }
  const interp=(t)=>{
    if(!validos.length)return zAttr;
    if(validos.length===1)return validos[0];
    if(monotono)return validos[0]+(validos.at(-1)-validos[0])*t;
    const u=t*(validos.length-1),i=Math.min(validos.length-2,Math.floor(u)),a=u-i;
    return validos[i]+(validos[i+1]-validos[i])*a;
  };
  const out=ring.map((q,i)=>{
    if(Array.isArray(q)&&q.length>2&&Number.isFinite(+q[2]))return +q[2];
    if(alinhado&&Number.isFinite(+bruto[i]))return +bruto[i];
    if(Number.isFinite(zAttr))return zAttr;
    const t=total>1e-12?acum[i]/total:(ring.length>1?i/(ring.length-1):0);
    return interp(t);
  });
  if(!out.every(Number.isFinite))return null;
  if(aplicar){
    if(nested){
      if(!Array.isArray(f.zg)||typeof f.zg[0]==='number')f.zg=[];
      f.zg[ri]=out;
    }else f.zg=out;
  }
  return out;
}
function showVertices(){
  clearVertices(); if(!S.selFeat){toast('Selecione uma feição (ferramenta ◈)');return;}
  const {layer:L,idx,partIdx}=S.selFeat; const f=L.features[idx]; if(!f) return;
  // Em multipartes, edita exatamente o anel clicado, não o primeiro por acaso.
  let ring = L.gtype==='point'? f.geom : (f.multi&&Array.isArray(f.geom[0][0])
    ? f.geom[Number.isInteger(partIdx)?partIdx:0] : f.geom);
  const nested=!!(f.multi&&Array.isArray(f.geom&&f.geom[0]&&f.geom[0][0])),
    ringIdx=nested?Math.max(0,f.geom.indexOf(ring)):0;
  if(L.gtype!=='point')resolveFeatureZRing(f,ring,ringIdx,nested,true);
  /* limite dinâmico herdado de anel REAMOSTRADO (bordas de rampa/anéis
     cortados): a edição virava um colar de bolinhas a cada ~0,5 m. Ao
     entrar na edição, decima para os vértices verdadeiros (desvio máx.
     15 cm) e o vínculo dinâmico segue com o anel limpo. */
  if(L._cavaLimiteDin&&ring.length>250&&typeof cavaDecimaVertices==='function'){
    const segs=[];
    for(let i=1;i<ring.length;i++){
      const d=Math.hypot(ring[i][0]-ring[i-1][0],ring[i][1]-ring[i-1][1]);
      if(d>1e-9)segs.push(d);
    }
    segs.sort((x,y)=>x-y);
    const med=segs.length?segs[segs.length>>1]:9e9;
    if(med<3){
      const ng=cavaDecimaVertices(ring.map(p=>p.slice()),0.15);
      if(ng.length<ring.length*0.8){
        ring.length=0; ng.forEach(p=>ring.push(p));
        const zc=Number.isFinite(+((f.props||{}).COTA))?+f.props.COTA:
          (Array.isArray(f.zg)&&Number.isFinite(+f.zg[0])?+f.zg[0]:0);
        if(Array.isArray(f.zg))f.zg=ring.map(()=>zc);
        try{ drawLayer(L); }catch(e){}
        toast('Limite simplificado para os vértices verdadeiros ('+ring.length+' vértices)');
        try{ cavaLiveSync({sourceLayer:L,sourceFeature:f,immediate:true}); }catch(e){}
      }
    }
  }
  /* LINHA FECHADA É ANEL NA EDIÇÃO: o projeto trabalha com linhas fechadas
     (crista/pé/berma/limite), não polígonos. Só o polígono era tratado como
     fechado — a costura da linha virava DOIS marcadores e arrastar um deles
     ABRIA o anel ("quando eu for editar a linha abre"). O fecho agora é
     detectado pela geometria, para linha e polígono igualmente. */
  const fechado=(L.gtype==='polygon'||L.gtype==='line')&&ring.length>3&&
    Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<1e-7;
  const nVertices=()=>fechado?ring.length-1:ring.length;
  /* Z SEMPRE PRESERVADO NA EDIÇÃO: a cota mora no 3º componente do ponto
     e/ou no array paralelo f.zg — arrastar, inserir ou remover vértice não
     pode zerá-la nem desalinhá-la ("quando arrastar um vértice sempre
     manter o z"). */
  const zgDo=()=>{
    if(!f.zg)return null;
    if(Array.isArray(f.zg)&&typeof f.zg[0]==='number')return f.zg;
    if(Array.isArray(f.zg)&&Array.isArray(f.zg[0])&&Array.isArray(f.zg[ringIdx]))
      return f.zg[ringIdx];
    return null;
  };
  const sincronizaFecho=vi=>{
    if(!fechado)return;
    if(vi===0){
      ring[ring.length-1]=ring[0].slice();
      const zr=zgDo();
      if(zr&&zr.length===ring.length)zr[zr.length-1]=zr[0];
    }
  };
  const atualizaEdicao=(redesenharMarcadores=false)=>{
    drawLayer(L);
    /* o RASTRO da geometria antiga: o destaque de seleção é desenhado a
       partir da geometria de quando a feição foi selecionada e não seguia o
       vértice arrastado — sobrava uma linha cinza sobre o traçado anterior.
       Refazer o destaque junto com a camada mantém só a linha atual. */
    try{ if(selHL){map.removeLayer(selHL);selHL=null;} }catch(e){}
    if(typeof cavaLiveSync==='function')cavaLiveSync();
    if(redesenharMarcadores)showVertices();
  };
  /* SELEÇÃO MÚLTIPLA DE VÉRTICES: Ctrl+clique acumula; Ctrl+arrasto no
     mapa seleciona por retângulo; arrastar um vértice selecionado move
     o GRUPO inteiro de uma vez. */
  /* a seleção múltipla pertence à FEIÇÃO: trocar de linha ZERA a seleção.
     Sem isto os índices herdados da linha anterior arrastavam vértices da
     linha nova em grupo (salto de 21 m medido no projeto de 23/08) e a
     linha "abria" em pedaços deslocados. */
  if(!S._vtxSelPreserve||!S._vtxSel||
     !S._vtxSelDona||S._vtxSelDona.f!==f||S._vtxSelDona.L!==L)
    S._vtxSel=new Set();
  S._vtxSelDona={L,f};
  S._vtxSelPreserve=false;
  const sel=S._vtxSel,marks=[];
  S._vtxCtx={L,f,ring,fechado,marks,sincronizaFecho};
  /* Os "+" de inserir ficam no MEIO de cada segmento e eram calculados uma
     vez, na montagem. Arrastando um vértice, os dois "+" vizinhos continuavam
     no lugar antigo — sobrava um sinal solto atrás da linha. Agora eles somem
     durante o arraste e voltam, já recalculados, quando o vértice é solto. */
  const midMarks=[];
  const midsVisiveis=(lig)=>{
    midMarks.forEach(m=>{
      const el2=m.getElement&&m.getElement();
      if(el2)el2.style.display=lig?'':'none';
    });
  };
  const pinta=(mk2,vi2)=>{
    const el2=mk2.getElement&&mk2.getElement();
    const dv=el2&&el2.querySelector('.vtx, .vtx-sel');
    if(dv)dv.className=sel.has(vi2)?'vtx-sel':'vtx';
  };
  ring.slice(0,nVertices()).forEach((pt,vi)=>{
    const w=toWGS(L.crs,pt[0],pt[1]);
    const vr=S.touch?26:14;      // alvo de arrasto maior no tablet
    const mk=L2.marker([w[1],w[0]],{draggable:true,icon:L2.divIcon({className:'',html:`<div class="${sel.has(vi)?'vtx-sel':'vtx'}" style="width:${vr}px;height:${vr}px"></div>`,iconSize:[vr,vr]})}).addTo(S.vtxLayer);
    marks.push({mk,vi});
    mk.on('click',ev=>{
      const oe=ev.originalEvent;
      if(oe&&(oe.ctrlKey||oe.metaKey)){ /* Ctrl+clique: entra/sai da seleção */
        if(sel.has(vi))sel.delete(vi);else sel.add(vi);
        pinta(mk,vi);
        if(oe.stopPropagation)oe.stopPropagation();
      }
    });
    let grupo=null; /* {c0, orig:Map(vi→[x,y])} durante arrasto em grupo */
    mk.on('dragstart',ev=>{
      S._vtxDragging=true;
      midsVisiveis(false);            /* nenhum "+" fica para trás */
      /* Ctrl+Z volta este gesto: um retrato da geometria por arrasto */
      if(typeof undoPush==='function')undoPush({t:'geom',L,f,
        geom:JSON.parse(JSON.stringify(f.geom)),multi:f.multi,
        zg:Array.isArray(f.zg)?f.zg.slice():f.zg,
        msg:sel.has(vi)&&sel.size>1?'arrasto de '+sel.size+' vértices':'arrasto de vértice'});
        if(typeof rb31EmpilhaEdicao==='function')rb31EmpilhaEdicao(L,f);
      grupo=null;
      if(sel.has(vi)&&sel.size>1){
        const ll0=ev.target.getLatLng(),c0=fromWGS(L.crs,ll0.lng,ll0.lat),
          orig=new Map();
        for(const si of sel)if(ring[si])orig.set(si,ring[si].slice());
        grupo={c0,orig};
      }
    });
    mk.on('drag',ev=>{
      let ll=ev.target.getLatLng();
      if(!grupo&&S.snapOn&&typeof snapLatLng==='function')try{
        const sn=snapLatLng(ll,L,{flash:false});if(sn&&sn.snapped){ll=sn.latlng;ev.target.setLatLng(ll);}
      }catch(_){}
      const c=fromWGS(L.crs,ll.lng,ll.lat);
      if(grupo){ /* move o GRUPO pelo delta do vértice âncora */
        const dx=c[0]-grupo.c0[0],dy=c[1]-grupo.c0[1];
        for(const [si,o] of grupo.orig){
          ring[si]=(o.length>2)?[o[0]+dx,o[1]+dy,o[2]]:[o[0]+dx,o[1]+dy];
          sincronizaFecho(si);
        }
        for(const m2 of marks){
          if(m2.vi===vi||!grupo.orig.has(m2.vi))continue;
          const p2=ring[m2.vi],w2=toWGS(L.crs,p2[0],p2[1]);
          m2.mk.setLatLng([w2[1],w2[0]]);
        }
      }else{
        const zv=(ring[vi]&&ring[vi].length>2)?ring[vi][2]:undefined;
        ring[vi]=(zv!==undefined)?[c[0],c[1],zv]:[c[0],c[1]];
        sincronizaFecho(vi);
      }
      if(typeof rb31PosEdicao==='function')rb31PosEdicao(L,f);
      drawLayer(L);
      try{ if(selHL){map.removeLayer(selHL);selHL=null;} }catch(e){}
      /* Limites paramétricos, como o da cava, atualizam seus derivados
         durante o arraste (com debounce), não apenas depois de soltar. */
      if(typeof cavaLiveSync==='function')cavaLiveSync({sourceLayer:L,sourceFeature:f});
      if(typeof projecaoLiveSync==='function')projecaoLiveSync(false);
    });
    mk.on('dragend',()=>{
      S._vtxDragging=false;
      if(L._autoCota && typeof hFeicCotaUma==='function'){
        try{ const G=hFeicGrade(); if(G) hFeicCotaUma(L, f, G); }catch(e){}
      }
      if(grupo){grupo=null;S._vtxSelPreserve=true;showVertices();}
      else{ S._vtxSelPreserve=true; showVertices(); }  /* "+" recalculados */
      /* destaque refeito só ao SOLTAR: durante o arraste ele é apenas
         apagado (refazer a cada quadro custaria caro e piscaria) */
      try{ highlightSel(); }catch(e){}
      refreshUI();
      /* O último estado nunca pode se perder porque um cálculo disparado
         durante o arraste ainda estava ocupado. Ao soltar, enfileira uma
         regeneração obrigatória somente da cava ligada a esta feição. */
      if(typeof cavaLiveSync==='function')cavaLiveSync({sourceLayer:L,sourceFeature:f,immediate:true,force:true});
      if(typeof projecaoLiveSync==='function')projecaoLiveSync(true);
    });
    mk.on('dblclick',()=>{
      if(nVertices()<=3)return;
      if(typeof undoPush==='function')undoPush({t:'geom',L,f,
        geom:JSON.parse(JSON.stringify(f.geom)),multi:f.multi,
        zg:Array.isArray(f.zg)?f.zg.slice():f.zg,msg:'remoção de vértice'});
        if(typeof rb31EmpilhaEdicao==='function')rb31EmpilhaEdicao(L,f);
      {
        const zr=zgDo();
        if(zr&&zr.length===ring.length)zr.splice(vi,1);
      }
      ring.splice(vi,1);
      if(fechado){
        if(vi===0)ring[ring.length-1]=ring[0].slice();
        else ring[ring.length-1]=ring[0].slice();
      }
      if(typeof rb31PosEdicao==='function')rb31PosEdicao(L,f);
      atualizaEdicao(true);refreshUI();
    });
  });
  // Pontos médios: um toque ainda insere o vértice, mas agora também podem
  // ser arrastados. O vértice nasce no início do arraste e passa a acompanhar
  // o cursor; isso evita o antigo ponto intermediário "preso".
  if(L.gtype!=='point'){
    const n=nVertices(),nSeg=(fechado||L.gtype==='polygon')?n:Math.max(0,n-1);
    for(let i=0;i<nSeg;i++){
      /* guardados para poder somê-los enquanto um vértice é arrastado */
      const j=(i+1)%n,a=ring[i],b=ring[j],mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      if(a.length>2&&b.length>2)mid.push((a[2]+b[2])/2);
      else if(a.length>2)mid.push(a[2]);
      else if(b.length>2)mid.push(b[2]);
      const w=toWGS(L.crs,mid[0],mid[1]);
      const vm=S.touch?22:14;
      const mk=L2.marker([w[1],w[0]],{draggable:true,zIndexOffset:150,
        title:'Inserir vértice aqui (toque) · arraste para já posicionar',
        icon:L2.divIcon({className:'',html:`<div class="vtx-mid" style="width:${vm}px;height:${vm}px"></div>`,iconSize:[vm,vm]})}).addTo(S.vtxLayer);
      midMarks.push(mk);
      let inserido=false,movido=false,novoIdx=i+1;
      const inserir=()=>{
        if(inserido)return;
        if(typeof undoPush==='function')undoPush({t:'geom',L,f,
          geom:JSON.parse(JSON.stringify(f.geom)),multi:f.multi,
          zg:Array.isArray(f.zg)?f.zg.slice():f.zg,msg:'inserção de vértice'});
        if(typeof rb31EmpilhaEdicao==='function')rb31EmpilhaEdicao(L,f);
        {
          const zr=zgDo();
          if(zr&&zr.length===ring.length){
            const za=zr[(novoIdx-1+zr.length)%zr.length],zb=zr[novoIdx%zr.length];
            zr.splice(novoIdx,0,
              (typeof za==='number'&&typeof zb==='number')?(za+zb)/2:(za??zb??0));
          }
        }
        ring.splice(novoIdx,0,mid.slice());inserido=true;
        if(fechado)ring[ring.length-1]=ring[0].slice();
      };
      mk.on('dragstart',()=>{S._vtxDragging=true;inserir();});
      mk.on('drag',ev=>{
        inserir();movido=true;
        let ll=ev.target.getLatLng();
        if(S.snapOn&&typeof snapLatLng==='function')try{
          const sn=snapLatLng(ll,L,{flash:false});if(sn&&sn.snapped){ll=sn.latlng;ev.target.setLatLng(ll);}
        }catch(_){}
        const c=fromWGS(L.crs,ll.lng,ll.lat);
        const zm=(ring[novoIdx]&&ring[novoIdx].length>2)?ring[novoIdx][2]:undefined;
        ring[novoIdx]=(zm!==undefined)?[c[0],c[1],zm]:[c[0],c[1]];
        if(fechado)ring[ring.length-1]=ring[0].slice();
        atualizaEdicao(false);
      });
      mk.on('dragend',()=>{
        S._vtxDragging=false;
        if(!inserido)return;
        if(typeof rb31PosEdicao==='function')rb31PosEdicao(L,f);
        atualizaEdicao(true);refreshUI();
        if(typeof cavaLiveSync==='function')cavaLiveSync({sourceLayer:L,sourceFeature:f,immediate:true,force:true});
      });
      mk.on('click',()=>{
        if(movido)return;
        inserir();atualizaEdicao(true);refreshUI();
      });
    }
  }
  /* ------ alça de MOVER A FEIÇÃO INTEIRA ------
     A edição só oferecia vértice a vértice (ou por grupo, com Ctrl). A alça ✥
     no centro arrasta toda a geometria de uma vez — todos os anéis, inclusive
     furos — preservando as cotas Z e a forma. */
  (function alcaMoverFeicao(){
    const pts=[];
    const varre=g=>{ if(!Array.isArray(g)) return;
      if(typeof g[0]==='number'){ pts.push(g); return; }
      g.forEach(varre); };
    varre(f.geom);
    if(pts.length<2) return;
    let cx,cy,c=null;
    const anelExt=(f.multi&&Array.isArray(f.geom[0][0]))? f.geom[0] : f.geom;
    try{ if(L.gtype==='polygon' && typeof centroideArea==='function') c=centroideArea(anelExt); }catch(e){}
    if(c && isFinite(c[0]) && isFinite(c[1])){ cx=c[0]; cy=c[1]; }
    else{
      let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
      pts.forEach(p=>{ x0=Math.min(x0,p[0]); y0=Math.min(y0,p[1]);
        x1=Math.max(x1,p[0]); y1=Math.max(y1,p[1]); });
      cx=(x0+x1)/2; cy=(y0+y1)/2;
    }
    if(!isFinite(cx)||!isFinite(cy)) return;
    const w0=toWGS(L.crs,cx,cy), tam=S.touch?30:20;
    const mkM=L2.marker([w0[1],w0[0]],{draggable:true,zIndexOffset:400,
      title:'Arraste para mover a feição inteira',
      icon:L2.divIcon({className:'',iconSize:[tam,tam],
        html:`<div class="vtx-mover" style="width:${tam}px;height:${tam}px">✥</div>`})}).addTo(S.vtxLayer);
    let base=null;
    mkM.on('dragstart',()=>{
      if(typeof undoPush==='function')undoPush({t:'geom',L,f,
        geom:JSON.parse(JSON.stringify(f.geom)),multi:f.multi,
        zg:Array.isArray(f.zg)?f.zg.slice():f.zg,msg:'movimentação da feição'});
      if(typeof rb31EmpilhaEdicao==='function')rb31EmpilhaEdicao(L,f);
      base={c0:[cx,cy],orig:pts.map(p=>p.slice())};
    });
    mkM.on('drag',ev=>{
      if(!base) return;
      const ll=ev.target.getLatLng(), c2=fromWGS(L.crs,ll.lng,ll.lat);
      const dx=c2[0]-base.c0[0], dy=c2[1]-base.c0[1];
      pts.forEach((p,i)=>{ p[0]=base.orig[i][0]+dx; p[1]=base.orig[i][1]+dy; });
      if(typeof rb31PosEdicao==='function')rb31PosEdicao(L,f);
      drawLayer(L);
      if(typeof cavaLiveSync==='function')cavaLiveSync({sourceLayer:L,sourceFeature:f});
      if(typeof projecaoLiveSync==='function')projecaoLiveSync(false);
    });
    mkM.on('dragend',()=>{
      const moveu=!!base; base=null;
      if(!moveu) return;
      if(L._autoCota && typeof hFeicCotaUma==='function'){
        try{ const G=hFeicGrade(); if(G) hFeicCotaUma(L,f,G); }catch(e){}
      }
      S._vtxSelPreserve=true; showVertices(); refreshUI();
      if(typeof cavaLiveSync==='function')cavaLiveSync({sourceLayer:L,sourceFeature:f,immediate:true,force:true});
      if(typeof projecaoLiveSync==='function')projecaoLiveSync(true);
      toast('Feição movida (Ctrl+Z desfaz)');
    });
  })();
  highlightSel();
  rb17ArmaCaixaSelecao();
}

/* SELEÇÃO POR POLÍGONO (retângulo): com a edição de vértices ativa,
   Ctrl+arrastar no mapa desenha a caixa; ao soltar, os vértices dentro
   entram na seleção (que o arrasto em grupo usa). Instalado uma vez. */
function rb17ArmaCaixaSelecao(){
  if(S._vtxBoxWired)return;
  S._vtxBoxWired=true;
  let caixa=null,ll0=null;
  const mexe=ev=>{
    if(!caixa)return;
    const b=L2.latLngBounds(ll0,ev.latlng);
    caixa.setBounds(b);
  };
  const solta=ev=>{
    map.off('mousemove',mexe);map.off('mouseup',solta);
    try{map.dragging.enable();}catch(e){}
    if(!caixa)return;
    const b=caixa.getBounds();
    try{map.removeLayer(caixa);}catch(e){}
    caixa=null;
    const ctx=S._vtxCtx;
    if(!ctx||!S._vtxSel)return;
    let n=0;
    for(const m2 of ctx.marks){
      if(b.contains(m2.mk.getLatLng())){S._vtxSel.add(m2.vi);n++;}
    }
    if(n){S._vtxSelPreserve=true;showVertices();
      toast(n+' vértice(s) na seleção — arraste qualquer um deles para mover o grupo');}
  };
  map.on('mousedown',ev=>{
    const oe=ev.originalEvent;
    if(!oe||!(oe.ctrlKey||oe.metaKey))return;
    if(!S._vtxCtx)return; /* só com a edição de vértices ativa */
    try{map.dragging.disable();}catch(e){}
    ll0=ev.latlng;
    caixa=L2.rectangle(L2.latLngBounds(ll0,ll0),
      {color:'#31d0aa',weight:1,dashArray:'4 3',fillOpacity:0.08}).addTo(map);
    map.on('mousemove',mexe);map.on('mouseup',solta);
    if(oe.preventDefault)oe.preventDefault();
  });
}
