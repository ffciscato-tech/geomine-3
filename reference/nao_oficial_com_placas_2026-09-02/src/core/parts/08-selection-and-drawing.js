/* ---------- SELEÇÃO MÚLTIPLA por polígono/retângulo ----------
   Funciona com mouse, toque e CANETA (S Pen): tudo via pointer events.
   Clique marca vértices do polígono irregular; arraste (>8 px) vira
   retângulo; 2 toques/Enter conclui; Esc cancela. A feição entra na
   seleção se QUALQUER vértice dela cai dentro do polígono — o anel é
   reprojetado para o CRS de cada camada (poucos vértices), em vez de
   reprojetar milhares de feições.                                     */
S.msel={buf:[], items:[], hl:null, sk:null, rect:null, justDrag:false};
function mselSk(){ if(!S.msel.sk) S.msel.sk=L2.layerGroup().addTo(map); return S.msel.sk; }
function mselCount(){
  const s=document.getElementById('selCount');
  if(s) s.textContent=S.msel.items.length? S.msel.items.length+' sel.' : '0';
}
function mselPanel(on){ const b=document.getElementById('selBox'); if(b) b.classList.toggle('on',!!on); mselCount(); }
function mselClearSketch(){ S.msel.buf=[]; S.msel.rect=null; if(S.msel.sk) S.msel.sk.clearLayers(); }
function mselClear(tudo){
  mselClearSketch();
  if(tudo){
    S.msel.items=[];
    if(S.msel.hl){ map.removeLayer(S.msel.hl); S.msel.hl=null; }
    /* selectedFeature e selectedMulti são dois retratos da mesma seleção,
       não seleções concorrentes. Limpar a múltipla não apaga uma seleção
       simples feita depois dela. */
  }
  mselCount();
}

/* Teste espacial completo para a seleção por polígono/retângulo. A versão
   anterior só verificava vértices da feição: uma linha que atravessasse a
   caixa, ou um polígono que a contivesse por inteiro, não era selecionado. */
function mselSegInter(a,b,c,d){
  const o=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]),
    eps=1e-9,oa=o(a,b,c),ob=o(a,b,d),oc=o(c,d,a),od=o(c,d,b),
    box=(p,q,r)=>r[0]>=Math.min(p[0],q[0])-eps&&r[0]<=Math.max(p[0],q[0])+eps&&
      r[1]>=Math.min(p[1],q[1])-eps&&r[1]<=Math.max(p[1],q[1])+eps;
  if(((oa>eps&&ob<-eps)||(oa<-eps&&ob>eps))&&
     ((oc>eps&&od<-eps)||(oc<-eps&&od>eps)))return true;
  return Math.abs(oa)<=eps&&box(a,b,c)||Math.abs(ob)<=eps&&box(a,b,d)||
    Math.abs(oc)<=eps&&box(c,d,a)||Math.abs(od)<=eps&&box(c,d,b);
}
function mselParteTocaAnel(parte,anel,fechado){
  if(!parte||!parte.length)return false;
  if(parte.some(p=>pointInRing(p[0],p[1],fechado)))return true;
  /* Polígono da feição envolvendo integralmente a área de seleção. */
  if(parte.length>2&&pointInRing(fechado[0][0],fechado[0][1],
      parte.concat([parte[0].slice()])))return true;
  for(let i=0;i<parte.length-1;i++)
    for(let j=0;j<fechado.length-1;j++)
      if(mselSegInter(parte[i],parte[i+1],fechado[j],fechado[j+1]))return true;
  return false;
}
function mselSketch(){
  const g=mselSk(); g.clearLayers();
  const PN={pane:'alagis_desenho', interactive:false};
  if(S.msel.buf.length>=2){
    L2.polygon(S.msel.buf,{color:'#03202a',weight:4,opacity:.45,fill:false,...PN}).addTo(g);
    L2.polygon(S.msel.buf,{color:'#22d3ee',weight:1.6,dashArray:'5 4',fillColor:'#22d3ee',fillOpacity:.07,...PN}).addTo(g);
  }
  S.msel.buf.forEach(p=>L2.circleMarker(p,{radius:4,color:'#fff',weight:1.5,
    fillColor:'#22d3ee',fillOpacity:1,...PN}).addTo(g));
}
function mselFinish(){
  if(S.tool!=='selpoly') return;
  if(S.msel.buf.length<3){ toast('Marque pelo menos 3 vértices (ou arraste um retângulo)'); return; }
  const anel=S.msel.buf.slice();
  mselClearSketch();
  mselSelect(anel);
}
function mselSelect(anelLL){
  const soAtiva=!!(document.getElementById('selScope')||{}).checked;
  const alvo=S.layers.filter(l=>l.visible && (!soAtiva || l.id===S.activeId));
  /* SILÊNCIO QUE PARECIA DEFEITO: a seleção só olha camadas VISÍVEIS (e, com
     o escopo ligado, só a ATIVA). Com a camada desmarcada no olho, o laço não
     encontrava nada e nenhuma mensagem aparecia — ele relatou como "não está
     funcionando". Agora o motivo é dito na tela. */
  if(!alvo.length){
    const ativa=S.layers.find(l=>l.id===S.activeId);
    if(soAtiva && ativa && !ativa.visible)
      toast('Nada selecionado: a camada ativa "'+ativa.name+'" está invisível — ligue o olho dela');
    else if(soAtiva && !ativa)
      toast('Nada selecionado: não há camada ativa. Clique numa camada da lista');
    else
      toast('Nada selecionado: nenhuma camada visível. Ligue o olho da camada desejada');
    return;
  }
  const itens=[];
  for(const L of alvo){
    let anel;
    try{ anel=anelLL.map(([lat,lng])=>{ const c=fromWGS(L.crs,lng,lat); return [c[0],c[1]]; }); }
    catch(e){ continue; }
    if(anel.length<3) continue;
    const fech=anel.concat([anel[0].slice()]);
    for(let i=0;i<L.features.length;i++){
      const f=L.features[i]; if(!f.geom||!featureVisible(L,f)) continue;
      /* Multipartes são avaliadas PARTE A PARTE. Antes, bastava uma parte
         tocar o polígono para entrar somente {layerId,idx}; sem partIdx o
         realce e o Delete atingiam a feição completa. Agora cada componente
         espacial atingido vira um item independente, sem alterar a geometria
         original até o usuário executar uma operação. */
      const multipart=!!(f.multi&&(
        (L.gtype==='point'&&Array.isArray(f.geom[0]))||
        (L.gtype!=='point'&&Array.isArray(f.geom?.[0]?.[0]))));
      const rs=L.gtype==='point'
        ? (multipart?f.geom.map(p=>[p]):[f.geom])
        : (multipart?f.geom:[f.geom]);
      for(let pi=0;pi<rs.length;pi++){
        if(!mselParteTocaAnel(rs[pi],anel,fech))continue;
        const it={layerId:L.id,idx:i};
        if(multipart&&rs.length>1)it.partIdx=pi;
        itens.push(it);
      }
    }
  }
  S.msel.items=itens;
  /* Uma seleção espacial substitui a seleção simples anterior. Se houver
     exatamente uma feição, os dois estados apontam para o mesmo objeto para
     manter propriedades, contador e Delete coerentes. */
  if(selHL){map.removeLayer(selHL);selHL=null;}
  if(itens.length===1){
    const it=itens[0],L=S.layers.find(l=>l.id===it.layerId);
    S.selFeat=L?{layer:L,layerId:L.id,idx:it.idx,
      ...(Number.isInteger(it.partIdx)?{partIdx:it.partIdx}:{})}:null;
  }else S.selFeat=null;
  mselHL(); mselCount();
  try{refreshUI();if(S.selFeat)showProps();}catch(e){}
  toast(itens.length? `${itens.length} feição(ões)/parte(s) selecionada(s)` : 'Nenhuma feição dentro do polígono');
}
function mselHL(){
  if(S.msel.hl){ map.removeLayer(S.msel.hl); S.msel.hl=null; }
  if(!S.msel.items.length) return;
  const PN={pane:'alagis_desenho', interactive:false};
  const g=L2.layerGroup(); let n=0;
  for(const it of S.msel.items){
    if(++n>1500){ break; }                       // teto de desenho: seleção gigante fica sem realce individual
    const L=S.layers.find(l=>l.id===it.layerId); if(!L) continue;
    const f=L.features[it.idx]; if(!f) continue;
    let lls; try{ lls=featToLatLngs(L,f); }catch(e){ continue; }
    if(L.gtype==='point'){
      const pts=(f.multi&&Array.isArray(lls[0]))?lls:[lls], alvo=Number.isInteger(it.partIdx)?[pts[it.partIdx]].filter(Boolean):pts;
      for(const p of alvo){
        g.addLayer(L2.circleMarker(p,{radius:9,color:'#03202a',weight:4,opacity:.5,fillOpacity:0,...PN}));
        g.addLayer(L2.circleMarker(p,{radius:9,color:'#22d3ee',weight:2,fillOpacity:0,...PN}));
      }
    } else {
      const partes=Array.isArray(lls[0][0])? lls : [lls];
      const alvo=Number.isInteger(it.partIdx)?[partes[it.partIdx]].filter(Boolean):partes;
      for(const pr of alvo){
        g.addLayer(L2.polyline(pr,{color:'#03202a',weight:5,opacity:.5,...PN}));
        g.addLayer(L2.polyline(pr,{color:'#22d3ee',weight:2,...PN}));
      }
    }
  }
  S.msel.hl=g.addTo(map);
  if(S.msel.items.length>1500) toast(`Realce limitado a 1500 de ${S.msel.items.length} — a seleção vale para todas`);
}
function mselDelete(){
  if(!S.msel.items.length){ toast('Nada selecionado'); return; }
  if(!confirm(`Apagar ${S.msel.items.length} feição(ões)/parte(s) selecionada(s)?`)) return;
  const porCamada=new Map();
  for(const it of S.msel.items){
    if(!porCamada.has(it.layerId)) porCamada.set(it.layerId,[]);
    porCamada.get(it.layerId).push(it);
  }
  for(const [lid,itens] of porCamada){
    const L=S.layers.find(l=>l.id===lid); if(!L) continue;
    const porFeat=new Map();
    for(const it of itens){if(!porFeat.has(it.idx))porFeat.set(it.idx,[]);porFeat.get(it.idx).push(it);}
    const ops=[];
    for(const idx of [...porFeat.keys()].sort((a,b)=>b-a)){
      const f=L.features[idx];if(!f)continue;
      const before=JSON.parse(JSON.stringify(f)), sels=porFeat.get(idx);
      const inteira=sels.some(x=>!Number.isInteger(x.partIdx))||!f.multi;
      if(inteira){L.features.splice(idx,1);ops.push({idx,before,whole:true});continue;}
      const partes=featPartesLatLng(L,f), apagar=[...new Set(sels.map(x=>x.partIdx))].sort((a,b)=>b-a);
      for(const p of apagar)if(p>=0&&p<partes.length)f.geom.splice(p,1);
      if(!f.geom.length){L.features.splice(idx,1);ops.push({idx,before,whole:true});}
      else ops.push({idx,before,whole:false});
    }
    undoPush({t:'mselmixdel', L, ops});
    drawLayer(L);
  }
  mselClear(true); refreshUI();
  toast('Feições/partes apagadas — Ctrl+Z desfaz (uma camada por vez)');
}
function mselMove(){
  if(!S.msel.items.length){ toast('Nada selecionado'); return; }
  const lids=[...new Set(S.msel.items.map(i=>i.layerId))];
  if(lids.length>1){ toast('Para mover, selecione feições de UMA camada só'); return; }
  const L=S.layers.find(l=>l.id===lids[0]); if(!L) return;
  const idxs=S.msel.items.map(i=>i.idx).sort((a,b)=>b-a);
  const feats=[]; const rem=[];
  for(const i of idxs){ rem.push({idx:i, feat:L.features[i]}); feats.unshift(L.features[i]); L.features.splice(i,1); }
  undoPush({t:'mseldel', L, rem});                // desfazer devolve à origem (a nova camada fica)
  const NL=addLayer({name:(L.name+'_sel').slice(0,60), gtype:L.gtype, crs:L.crs,
    features:feats, fields:(L.fields||[]).map(f=>({...f}))});
  drawLayer(L); mselClear(true); refreshUI();
  toast(`${feats.length} feição(ões) movidas para "${NL.name}" — edite lá e Ctrl+Z devolve à origem`);
}
/* retângulo por ARRASTO — pointer events cobrem mouse, toque e caneta.
   AMARRADO SÓ DEPOIS que o mapa existe (mselBind é chamado na init do mapa):
   executar isto no carregamento do script quebrava o app inteiro no tablet
   ("Cannot read properties of undefined (reading 'getContainer')").        */
function mselBind(){
  if(S.msel._bound || typeof map==='undefined' || !map) return;
  S.msel._bound=true;
  const el=map.getContainer();
  let st=null;
  const cp=e=>{ const r=el.getBoundingClientRect(); return L2.point(e.clientX-r.left, e.clientY-r.top); };
  el.addEventListener('pointerdown',e=>{
    if(S.tool!=='selpoly' || !e.isPrimary || (e.pointerType==='mouse' && e.button!==0)) return;
    st={id:e.pointerId, p0:cp(e), moved:false};
  });
  el.addEventListener('pointermove',e=>{
    if(!st || e.pointerId!==st.id || S.tool!=='selpoly') return;
    const p=cp(e);
    if(!st.moved && p.distanceTo(st.p0)<8) return;
    st.moved=true;
    const a=map.containerPointToLatLng(st.p0), b=map.containerPointToLatLng(p);
    const g=mselSk(); g.clearLayers();
    const PN={pane:'alagis_desenho', interactive:false};
    L2.rectangle(L2.latLngBounds(a,b),{color:'#03202a',weight:4,opacity:.45,fill:false,...PN}).addTo(g);
    L2.rectangle(L2.latLngBounds(a,b),{color:'#22d3ee',weight:1.6,dashArray:'5 4',
      fillColor:'#22d3ee',fillOpacity:.07,...PN}).addTo(g);
    st.p1=p;
  });
  const fim=e=>{
    if(!st || e.pointerId!==st.id) return;
    const foi=st; st=null;
    if(!foi.moved || S.tool!=='selpoly') return;
    S.msel.justDrag=true;                        // o navegador ainda dispara um 'click' após o arrasto
    setTimeout(()=>{ S.msel.justDrag=false; },350);
    const a=map.containerPointToLatLng(foi.p0), b=map.containerPointToLatLng(foi.p1||foi.p0);
    mselClearSketch();
    if(Math.abs(a.lat-b.lat)<1e-9 || Math.abs(a.lng-b.lng)<1e-9) return;
    mselSelect([[a.lat,a.lng],[a.lat,b.lng],[b.lat,b.lng],[b.lat,a.lng]]);
  };
  el.addEventListener('pointerup',fim);
  el.addEventListener('pointercancel',()=>{ st=null; });
  map.on('dblclick',()=>{ if(S.tool==='selpoly') mselFinish(); });
}
document.addEventListener('keydown',e=>{
  const tag=(document.activeElement&&document.activeElement.tagName)||'';
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
  if(S.tool==='selpoly'&&e.key==='Enter'){ e.preventDefault(); mselFinish(); }
  if(S.tool==='selpoly'&&e.key==='Escape'){
    e.preventDefault();
    if(S.msel.buf.length){ mselClearSketch(); toast('Traçado cancelado'); }
    else setTool('select');
  }
});

/* Delete apaga um conjunto inequívoco: a seleção múltipla confirmada tem
   precedência; sem ela, apaga somente a feição simples. Campos de formulário
   preservam o comportamento nativo da tecla. */
document.addEventListener('keydown',e=>{
  if(e.key!=='Delete'&&e.key!=='Backspace')return;
  const tag=(document.activeElement&&document.activeElement.tagName)||'';
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||
     (document.activeElement&&document.activeElement.isContentEditable))return;
  if(S.msel&&S.msel.items.length){e.preventDefault();e.stopPropagation();mselDelete();return;}
  if(!S.selFeat)return;
  e.preventDefault();e.stopPropagation();
  const q=S.selFeat,L=q.layer||S.layers.find(x=>x.id===q.layerId),f=L&&L.features[q.idx];
  if(!L||!f)return;
  apagarSelecao(q,false);
},true);
/* Esc no modo drenagem: SAI do desenho E SALVA a feição na camada */
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape' || S.tool!=='dren') return;
  const tag=(document.activeElement&&document.activeElement.tagName)||'';
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
  e.preventDefault(); e.stopPropagation();
  if((S._drenBuf||[]).length>=2){ try{ drenFinaliza(); }catch(err){} }
  else {                                   // menos de 2 pontos: só cancela
    if(S._drenTmp){ try{ map.removeLayer(S._drenTmp); }catch(err){} S._drenTmp=null; }
    S._drenBuf=null; S._drenCont=null; S._drenNome=null;
    try{ setTool('select'); }catch(err){ S.tool='select'; }
    const b=document.getElementById('btnDrenDraw'); if(b) b.textContent='✏ Desenhar feição';
    toast('Desenho cancelado');
  }
}, true);
(function(){
  const on=(id,fn)=>{ const b=document.getElementById(id); if(b) b.onclick=fn; };
  on('selFim',mselFinish);
  on('selLimpa',()=>{ mselClear(true); toast('Seleção limpa'); });
  on('selDel',mselDelete);
  on('selMove',mselMove);
  on('selX',()=>setTool('pan'));
})();

function onMapClick(e){
  if(S.tool==='contBusca'&&S._tinContBusca&&S._tinContBusca.armed){
    S._tinContBusca.pts.push([e.latlng.lat,e.latlng.lng]);tinContBuscaRedraw();return;
  }
  // editor de vetores com comando armado consome o clique
  let edLL=e.latlng;
  if(typeof ED==='object'&&ED.on&&ED.pend&&S.snapOn&&typeof snapLatLng==='function'){
    try{const sn=snapLatLng(edLL,(ED.sel&&ED.sel.L)||null,{flash:true});if(sn&&sn.latlng)edLL=sn.latlng;}catch(_){}
  }
  if(typeof ED==='object'&&ED._pendTs&&Date.now()-ED._pendTs<450){ED._pendTs=0;return;}
  if(typeof edMapClick==='function' && edMapClick(edLL)) return;
  const L=activeLayer();
  if(S.tool==='select'){
    /* Com snap ligado, o mesmo alcance que acende a cruz também seleciona a
       feição. Cliques diretos continuam sendo tratados pelo layer Leaflet. */
    /* Tolerância de seleção não depende mais do ímã: com o snap desligado o
       clique tinha de acertar o traço no pixel, e linha fina ficava quase
       impossível de escolher. */
    {
      const hit=feicaoMaisProximaPx(e.latlng,S.touch?Math.round(SNAP_PX*1.6):SNAP_PX);
      if(hit) pickFeature(hit.L,hit.idx,e.latlng,{partIdx:hit.ringIndex,originalEvent:e.originalEvent});
    }
    return;
  }
  /* Entrada comum dos comandos: snap vale igualmente para mouse, caneta e
     toque, inclusive régua/perfil/ferramentas temáticas. Desenho CAD aplica
     seu snap abaixo para manter a precedência do modo ortogonal. */
  let cmdLL=e.latlng;
  /* Medir POR PONTOS é medição livre: o ponto cai exatamente onde se toca.
     O snap global levava o clique para o vértice mais próximo, impedindo medir
     um detalhe da ortofoto ou uma cota qualquer do MDT. Quem quiser encostar
     em vértice marca a opção na própria Régua. */
  const medindoLivre = S.tool==='measure' && typeof measMode==='function' &&
    measMode()==='points' && !(document.getElementById('mbSnap')||{}).checked;
  if(S.snapOn&&!medindoLivre&&!['point','line','poly','select','selpoly'].includes(S.tool)){
    try{const sn=snapLatLng(cmdLL,null,{flash:true});if(sn&&sn.latlng)cmdLL=sn.latlng;}catch(_){}
  }
  if(S.tool==='measure'){
    if(typeof measMode==='function' && measMode()==='lines'){ measLineClick(e.latlng); return; }
    S.meas.buf.push([cmdLL.lat,cmdLL.lng]); redrawMeas(); updateMeas(); return;
  }
  if(S.tool==='selpoly'){
    if(S.msel.justDrag){ S.msel.justDrag=false; return; }   // clique fantasma do fim do arrasto
    S.msel.buf.push([e.latlng.lat,e.latlng.lng]); mselSketch(); return;
  }
  if(S.tool==='info'){ infoClick(cmdLL); return; }
  if(S.tool==='basin'){ runBasinClick(cmdLL); return; }
  if(S.tool==='barr'){ barrClick(cmdLL); return; }
  if(S.tool==='dren'){ drenClick(cmdLL); return; }
  if(S.tool==='forma'){ return; }   /* o formaBackstop (pointerup) cuida do clique */
  if(S.tool==='bacia'){ return; }   /* o baciaBackstop (pointerup) cuida do clique */
  if(S.tool==='baciaRampa'){ return; }   /* o baciaRampaBackstop cuida do clique */
  if(S.tool==='baciaExt'){ return; }     /* o baciaExtBackstop cuida do clique */
  if(S.tool==='lamina'){ setTool('pan');
    try{ runLaminaChuva(cmdLL); }catch(err){ toast('Falha: '+(err&&err.message||err)); } return; }
  if(S.tool==='inund'){ setTool('pan');
    try{ runInundacao(cmdLL,'ponto'); }catch(err){ toast('Falha: '+(err&&err.message||err)); } return; }
  if(S.tool==='cotado'){ cotClick(cmdLL); return; }
  if(S.tool==='estpick'){ estPickClick(cmdLL); return; }
  if(S.tool==='profile'){ S.prof.buf.push([cmdLL.lat,cmdLL.lng]); redrawProfPreview(); return; }
  if(['point','line','poly'].includes(S.tool)){
    if(!L){ toast('Selecione ou crie uma camada primeiro'); return; }
    const sn=snapLatLng(e.latlng);
    let ll=sn.latlng;
    if(!sn.snapped) ll=orthoAdjust(ll);        // orto só quando o snap não prevaleceu
    if(S.tool==='point'){ addFeature(L,[[ll.lat,ll.lng]]); }
    else { S.drawBuf.push([ll.lat,ll.lng]); redrawDraw(); }
  }
}
function redrawDraw(){
  S.drawLayer.clearLayers();
  if(S.drawBuf.length){
    const PN={pane:'alagis_desenho', interactive:false};
    // halo escuro por baixo: o traço branco sozinho some sobre ortofoto clara
    if(S.tool==='poly'){
      L2.polygon(S.drawBuf,{color:'#1a1206',weight:4,opacity:.45,fill:false,...PN}).addTo(S.drawLayer);
      L2.polygon(S.drawBuf,{color:'#fff',weight:1.5,dashArray:'4',fillOpacity:.1,...PN}).addTo(S.drawLayer);
    } else {
      L2.polyline(S.drawBuf,{color:'#1a1206',weight:4,opacity:.45,...PN}).addTo(S.drawLayer);
      L2.polyline(S.drawBuf,{color:'#fff',weight:1.5,dashArray:'4',...PN}).addTo(S.drawLayer);
    }
    S.drawBuf.forEach(p=>L2.circleMarker(p,{radius:4,color:'#fff',weight:1.5,
      fillColor:'#f5a524',fillOpacity:1,...PN}).addTo(S.drawLayer));
  }
}
function finishDraw(){
  // remove vértices consecutivos duplicados (o duplo-clique de finalizar gera 2 cliques no mesmo ponto)
  S.drawBuf=S.drawBuf.filter((p,i,a)=>!i || Math.abs(p[0]-a[i-1][0])>1e-9 || Math.abs(p[1]-a[i-1][1])>1e-9);
  const L=activeLayer();
  const minimo=S.tool==='poly'?3:2;
  if(!L||S.drawBuf.length<minimo) { clearDraw(); return; }
  const geom=S.drawBuf.map(([lat,lng])=>{const c=fromWGS(L.crs,lng,lat);return [c[0],c[1]];});
  if(S.tool==='poly'){
    const a=geom[0], b=geom[geom.length-1];
    if(a&&b&&Math.hypot(a[0]-b[0],a[1]-b[1])>1e-9) geom.push(a.slice());
    addFeature(L,[geom],true);
  }else addFeature(L,geom,false);
  clearDraw();
}
function clearDraw(){ S.drawBuf=[]; S.drawLayer.clearLayers(); }
function addFeature(L, geomInCRS, multi){
  // geomInCRS já no CRS da camada (para point recebemos latlng — tratar)
  let geom=geomInCRS;
  if(L.gtype==='point' && Array.isArray(geomInCRS[0]) && geomInCRS[0].length===2 && Math.abs(geomInCRS[0][0])<=90){
    const c=fromWGS(L.crs,geomInCRS[0][1],geomInCRS[0][0]); geom=[[c[0],c[1]]];
  }
  const props={}; L.fields.forEach(f=>props[f.name]=f.type==='N'||f.type==='F'?0:'');
  if(props.FID!==undefined) props.FID=L.features.length;
  // camadas criadas pelo painel de drenagem trazem valores pr\u00e9-preenchidos
  if(L._defProps) Object.keys(L._defProps).forEach(k=>{ if(k in props) props[k]=L._defProps[k]; });
  const feat={geom, multi:!!multi, props};
  /* Linhas de quebra topográficas nascem 3D sobre a superfície de trabalho.
     Assim já podem entrar diretamente no TIN, nos perfis e nos produtos. */
  if(L._topoBreakRasterId && L.gtype==='line'){
    const r=(S.rasters||[]).find(x=>String(x.id)===String(L._topoBreakRasterId));
    if(r&&r.d){
      const partes=(feat.multi&&Array.isArray(feat.geom[0]?.[0]))?feat.geom:[feat.geom];
      const cotas=partes.map(parte=>parte.map(p=>{
        let q=p;
        if(String(L.crs)!==String(S.workCRS)){
          const w=toWGS(L.crs,p[0],p[1]); q=fromWGS(S.workCRS,w[0],w[1]);
        }
        const z=sampleZbil(r.d,q[0],q[1]);
        return Number.isFinite(z)?z:null;
      }));
      feat.zg=feat.multi?cotas:cotas[0];
      feat.props.SUPERFICIE=r.name;
    }
  }
  L.features.push(feat);
  undoPush({t:'feat', L, feat});
  /* O limite criado pelo assistente da cava entra imediatamente no passo 1.
     Sem isso o usuário desenhava e o seletor continuava em “selecionado no
     mapa”, dando a impressão de que o desenho não havia sido aceito. */
  if(L._cavaLimitDraft){
    const ix=L.features.length-1;S.selFeat={layer:L,layerId:L.id,idx:ix};S.activeId=L.id;
    setTimeout(()=>{try{
      refreshCavaMineracao();const s=document.getElementById('cavaBaseSel');if(s)s.value=`${L.id}:${ix}`;
      cavaAtualizaCotaInfo();setTool('select');highlightSel();
    }catch(e){console.warn('seleção automática do limite',e);}},0);
  }
  /* Fei\u00e7\u00e3o de drenagem nasce lastreada no modelo de eleva\u00e7\u00e3o: projetar dreno
     no plano n\u00e3o faz sentido, e cotar depois \u00e9 passo que se esquece.        */
  if(L._autoCota && typeof hFeicCotaUma==='function'){
    try{ const G=hFeicGrade(); if(G) hFeicCotaUma(L, feat, G); }catch(e){}
    /* Permanecer em modo linha faria o pr\u00f3ximo clique sobre a fei\u00e7\u00e3o inserir
       um v\u00e9rtice em vez de selecion\u00e1-la \u2014 era isso que impedia "selecionar a
       linha" logo depois de desenhar.                                       */
    S.selFeat={layer:L, layerId:L.id, idx:L.features.length-1};
    setTimeout(()=>{ try{ setTool('select'); highlightSel(); }catch(e){} },0);
  }
  drawLayer(L); refreshUI();
  openFeatForm(L, feat);
}
/* formulário rápido de atributos da feição recém-desenhada */
function openFeatForm(L, feat){
  const flds=(L.fields||[]).filter(f=>f.name!=='FID');
  if(!flds.length){ toast('Feição adicionada'); return; }
  const bg=document.getElementById('featForm');
  const box=document.getElementById('ffFields');
  box.innerHTML=flds.map(f=>`<label class="field">${esc(f.name)}${f.type==='N'||f.type==='F'?' (número)':''}</label>
    <input type="${f.type==='N'||f.type==='F'?'number':'text'}" class="ff-in" data-f="${esc(f.name)}"
      value="${esc(feat.props[f.name]??'')}" ${f.type==='C'?`maxlength="${f.length||254}"`:''}>`).join('');
  bg.classList.add('on');
  const first=box.querySelector('input'); if(first) setTimeout(()=>first.focus(),60);
  const commit=()=>{
    box.querySelectorAll('.ff-in').forEach(inp=>{
      const f=(L.fields||[]).find(q=>q.name===inp.dataset.f);
      feat.props[inp.dataset.f]=(f&&(f.type==='N'||f.type==='F'))? (parseFloat(inp.value)||0) : inp.value;
    });
    bg.classList.remove('on');
    drawLayer(L); refreshUI(); toast('Feição adicionada com atributos');
  };
  document.getElementById('ffSave').onclick=commit;
  document.getElementById('ffClose').onclick=()=>{ bg.classList.remove('on'); toast('Feição adicionada (atributos vazios)'); };
  box.querySelectorAll('input').forEach(inp=>inp.addEventListener('keydown',e=>{ if(e.key==='Enter') commit(); }));
}

