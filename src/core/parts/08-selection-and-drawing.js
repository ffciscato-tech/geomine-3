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
/* feição (ou parte) INTEIRA dentro da área: todos os vértices dentro */
function mselParteDentro(parte,fechado){
  return !!parte&&parte.length>0&&parte.every(p=>Array.isArray(p)&&pointInRing(p[0],p[1],fechado));
}
/* opts.modo: 'toca' (padrão: qualquer contato) ou 'dentro' (inteira dentro);
   opts.somar: acrescenta à seleção atual (Shift/Ctrl). Camadas com cadeado
   (bloqueadas) ficam fora de toda seleção por área. */
function mselSelect(anelLL,opts={}){
  const modo=opts.modo||'toca',somar=!!opts.somar;
  const soAtiva=!!(document.getElementById('selScope')||{}).checked;
  const visiveis=S.layers.filter(l=>l.visible && (!soAtiva || l.id===S.activeId));
  const alvo=visiveis.filter(l=>!l.locked);
  if(visiveis.length&&!alvo.length){ toast('Nada selecionado: as camadas visíveis estão com cadeado (bloqueadas)'); return; }
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
      if(modo==='dentro'){
        const dentro=rs.map((r,pi)=>mselParteDentro(r,fech)?pi:-1).filter(pi=>pi>=0);
        if(dentro.length===rs.length)itens.push({layerId:L.id,idx:i});          // inteira
        else if(multipart&&rs.length>1)for(const pi of dentro)itens.push({layerId:L.id,idx:i,partIdx:pi});
        continue;
      }
      for(let pi=0;pi<rs.length;pi++){
        if(!mselParteTocaAnel(rs[pi],anel,fech))continue;
        const it={layerId:L.id,idx:i};
        if(multipart&&rs.length>1)it.partIdx=pi;
        itens.push(it);
      }
    }
  }
  if(somar){
    /* Shift/Ctrl: soma à seleção atual (múltipla, ou a simples), sem repetir */
    const base=S.msel.items.length?S.msel.items.slice():(S.selFeat?[{layerId:S.selFeat.layerId??S.selFeat.layer?.id,idx:S.selFeat.idx,
      ...(Number.isInteger(S.selFeat.partIdx)?{partIdx:S.selFeat.partIdx}:{})}]:[]);
    const chave=x=>x.layerId+':'+x.idx+':'+(Number.isInteger(x.partIdx)?x.partIdx:'*'),vistos=new Set(base.map(chave));
    for(const it of itens)if(!vistos.has(chave(it))){vistos.add(chave(it));base.push(it);}
    itens.length=0;itens.push(...base);
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
  try{refreshUI();closeFeatMenu();}catch(e){}
  const travadas=visiveis.length-alvo.length;
  toast((itens.length? `${itens.length} feição(ões)/parte(s) selecionada(s)` :
      (modo==='dentro'?'Nenhuma feição inteira dentro do retângulo':opts.caixa?'Nenhuma feição tocada pelo retângulo':'Nenhuma feição dentro do polígono'))+
    (travadas?` · ${travadas} camada(s) com cadeado ignorada(s)`:''));
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
      /* featToLatLngs já devolve a LISTA de pontos da feição ([[lat,lng],…]).
         Embrulhá-la de novo entregava [[lat,lng]] ao circleMarker e o realce
         quebrava sempre que a seleção incluía uma camada de pontos. */
      const pts=(Array.isArray(lls[0])&&Array.isArray(lls[0][0]))?lls.flat():lls,
        alvo=(Number.isInteger(it.partIdx)?[pts[it.partIdx]]:pts).filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]));
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
  const bloqueada=[...new Set(S.msel.items.map(i=>i.layerId))].map(id=>S.layers.find(L=>L.id===id)).find(L=>L&&typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false));
  if(bloqueada){collabCanEditLayer(bloqueada,true);return;}
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
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);return;}
  const idxs=S.msel.items.map(i=>i.idx).sort((a,b)=>b-a);
  const feats=[]; const rem=[];
  for(const i of idxs){ rem.push({idx:i, feat:L.features[i]}); feats.unshift(L.features[i]); L.features.splice(i,1); }
  undoPush({t:'mseldel', L, rem});                // desfazer devolve à origem (a nova camada fica)
  const NL=addLayer({sourceLayer:L,name:(L.name+'_sel').slice(0,60), gtype:L.gtype, crs:L.crs,
    features:feats, fields:(L.fields||[]).map(f=>({...f}))});
  drawLayer(L); mselClear(true); refreshUI();
  toast(`${feats.length} feição(ões) movidas para "${NL.name}" — edite lá e Ctrl+Z devolve à origem`);
}
/* retângulo por ARRASTO — pointer events cobrem mouse, toque e caneta.
   AMARRADO SÓ DEPOIS que o mapa existe (mselBind é chamado na init do mapa):
   executar isto no carregamento do script quebrava o app inteiro no tablet
   ("Cannot read properties of undefined (reading 'getContainer')").        */
function mselBoxMode(start,end){return end.x<start.x?'toca':'dentro';}
function mselBind(){
  if(S.msel._bound || typeof map==='undefined' || !map) return;
  S.msel._bound=true;
  const el=map.getContainer();
  let st=null,caixaFim=0;
  const cp=e=>{ const r=el.getBoundingClientRect(); return L2.point(e.clientX-r.left, e.clientY-r.top); };
  /* SETA (Selecionar): arrastar com o mouse desenha o
     retângulo de seleção — de qualquer ponto, inclusive em cima de uma feição
     NÃO selecionada (sem arrasto, o clique segue selecionando-a).
       esquerda → direita: JANELA (azul, contorno cheio) — só o que está inteiro dentro;
       direita → esquerda: CRUZANDO (verde, tracejado) — tudo o que o retângulo toca.
     Numa feição já selecionada o arrasto é o Mover direto; alças de vértice
     são do editor. No toque, o arrasto do dedo continua sendo o pan. */
  const naSelecao=h=>{
    if(!h||!h.L)return false;
    const idx=Number.isInteger(h.idx)?h.idx:h.L.features.indexOf(h.f);
    if(typeof ED!=='undefined'&&ED.on&&ED.sel&&ED.sel.f===h.f)return true;
    const q=S.selFeat;if(q&&(q.layerId??q.layer?.id)===h.L.id&&q.idx===idx)return true;
    return !!S.msel.items?.some(x=>x.layerId===h.L.id&&x.idx===idx);
  };
  const caixaNaSeta=e=>{
    const touchBox=e.pointerType!=='mouse'&&window.GeoMineTouchWorkspace?.boxSelection;
    if(S.tool!=='select'||(!touchBox&&e.pointerType!=='mouse')||(e.pointerType==='mouse'&&e.button!==0)||!e.isPrimary||e.altKey)return false;
    if(!mapaVista2D())return false;
    if(e.target?.closest?.('.leaflet-control,.leaflet-marker-icon,.gm-vtx-hit,.modal,.edbox,input,button,select,textarea,.feat-menu'))return false;
    if(S._vtxCtx||S._vtxDragging||S.drawBuf?.length)return false;
    if(typeof ED!=='undefined'&&(ED.pend||ED.drag))return false;
    const dm=window.GeoMineDragMove?.state?.();if(dm&&(dm.armado||dm.fase))return false;   // Mover direto/armado já tomou o gesto
    if(window.GeoMineMouseRotation?.state?.())return false;
    const p=cp(e),ll=map.containerPointToLatLng(p);
    if(typeof ED!=='undefined'&&ED.on&&ED.sel&&typeof edHit==='function'&&(edHit({x:p.x,y:p.y},ED.pts)||edHit({x:p.x,y:p.y},ED.mids)))return false;
    /* traço de feição selecionada: aresta/segmento do editor ou Mover */
    try{if(typeof feicaoSobPonto==='function'&&naSelecao(feicaoSobPonto(ll,8)))return false;}catch(_){}
    return true;
  };
  el.addEventListener('pointerdown',e=>{
    if(st&&!e.isPrimary){religa(st);mselClearSketch();st=null;return;}
    if(S.tool==='selpoly'){
      if(!e.isPrimary || (e.pointerType==='mouse' && e.button!==0)) return;
      st={id:e.pointerId, p0:cp(e), moved:false, modo:'selpoly'};return;
    }
    if(!caixaNaSeta(e))return;
    st={id:e.pointerId, p0:cp(e), moved:false, modo:'seta', somar:e.shiftKey||e.ctrlKey||e.metaKey||!!window.GeoMineTouchWorkspace?.additive};
    /* Shift+arrasto é o zoom por caixa do Leaflet: na seta, ele soma à seleção */
    if(map.boxZoom&&map.boxZoom.enabled()){ map.boxZoom.disable(); st.bz=true; }
    /* o botão esquerdo do mouse é da seta: nunca arrasta o mapa junto com o retângulo */
    if(map.dragging&&map.dragging.enabled()){ map.dragging.disable(); st.pan=true; }
  });
  const religa=foi=>{
    if(foi&&foi.bz) setTimeout(()=>{ try{ map.boxZoom.enable(); }catch(_){} },0);
    if(foi&&foi.pan) setTimeout(mapaPanPadrao,0);
  };
  /* o click que fecha o arrasto da caixa não pode desfazer a seleção recém-feita */
  el.addEventListener('click',e=>{ if(caixaFim&&Date.now()-caixaFim<400){ caixaFim=0; e.preventDefault(); e.stopImmediatePropagation(); } },true);
  el.addEventListener('pointermove',e=>{
    if(!st || e.pointerId!==st.id || (st.modo==='selpoly'&&S.tool!=='selpoly') || (st.modo==='seta'&&S.tool!=='select')) return;
    /* botão solto fora do mapa: o retângulo termina onde estava */
    if(st.modo==='seta'&&e.pointerType==='mouse'&&e.buttons===0){ fim(e); return; }
    const p=cp(e);
    if(!st.moved && p.distanceTo(st.p0)<(st.modo==='seta'?5:8)) return;
    st.moved=true;
    const a=map.containerPointToLatLng(st.p0), b=map.containerPointToLatLng(p);
    const g=mselSk(); g.clearLayers();
    const PN={pane:'alagis_desenho', interactive:false};
    const cruz=mselBoxMode(st.p0,p)==='toca',cor=cruz?'#22c55e':'#3b82f6';
    L2.rectangle(L2.latLngBounds(a,b),{color:'#03202a',weight:3.5,opacity:.35,fill:false,...PN}).addTo(g);
    L2.rectangle(L2.latLngBounds(a,b),{color:cor,weight:1.6,dashArray:cruz?'6 4':null,
      fillColor:cor,fillOpacity:.12,...PN}).addTo(g);
    st.p1=p;
  });
  const fim=e=>{
    if(!st || e.pointerId!==st.id) return;
    const foi=st; st=null; religa(foi);
    if(!foi.moved) return;
    if(foi.modo==='seta'){
      if(S.tool!=='select'){ mselClearSketch(); return; }
      caixaFim=Date.now();
      const p1=foi.p1||foi.p0, a=map.containerPointToLatLng(foi.p0), b=map.containerPointToLatLng(p1);
      mselClearSketch();
      if(Math.abs(a.lat-b.lat)<1e-9 || Math.abs(a.lng-b.lng)<1e-9) return;
      if(typeof closeFeatMenu==='function')closeFeatMenu();
      mselSelect([[a.lat,a.lng],[a.lat,b.lng],[b.lat,b.lng],[b.lat,a.lng]],
        {modo:mselBoxMode(foi.p0,p1),somar:foi.somar,caixa:true});
      return;
    }
    if(S.tool!=='selpoly') return;
    S.msel.justDrag=true;                        // o navegador ainda dispara um 'click' após o arrasto
    setTimeout(()=>{ S.msel.justDrag=false; },350);
    const a=map.containerPointToLatLng(foi.p0), b=map.containerPointToLatLng(foi.p1||foi.p0);
    mselClearSketch();
    if(Math.abs(a.lat-b.lat)<1e-9 || Math.abs(a.lng-b.lng)<1e-9) return;
    mselSelect([[a.lat,a.lng],[a.lat,b.lng],[b.lat,b.lng],[b.lat,a.lng]],
      {modo:mselBoxMode(foi.p0,foi.p1||foi.p0),caixa:true});
  };
  el.addEventListener('pointerup',fim);
  el.addEventListener('pointercancel',()=>{ religa(st); if(st&&st.modo==='seta') mselClearSketch(); st=null; });
  map.on('dblclick',()=>{ if(S.tool==='selpoly') mselFinish(); });
}
document.addEventListener('keydown',e=>{
  if(S._view==='licenses')return;
  const tag=(document.activeElement&&document.activeElement.tagName)||'';
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
  /* Cascata como no CAD. Este Esc/Enter é da seleção múltipla: marca o evento
     para o Esc universal (parte 17) não desmarcar tudo na mesma tecla.
     1º Esc: cancela o traçado aberto; sem traçado, encerra a ferramenta e
     MANTÉM a seleção (Delete/Mover continuam valendo). O Esc seguinte, já sem
     nada armado, desmarca. Enter sem traçado conclui a seleção. */
  if(S.tool==='selpoly'&&e.key==='Enter'){
    e.preventDefault();
    if(S.msel.buf.length) mselFinish();
    else{ setTool('select'); mselAvisoMantida('Seleção concluída'); }
  }
  if(S.tool==='selpoly'&&e.key==='Escape'){
    e.preventDefault(); e._gmEscTratado=true;
    if(S.msel.buf.length){ mselClearSketch(); toast('Traçado cancelado'); }
    else{ setTool('select'); mselAvisoMantida('Seleção múltipla encerrada'); }
  }
});
function mselAvisoMantida(tit){
  const n=(S.msel&&S.msel.items)?S.msel.items.length:0;
  toast(n? tit+' — '+n+' selecionada(s). Esc de novo desmarca.' : 'Ferramenta encerrada');
}

/* Delete apaga um conjunto inequívoco: a seleção múltipla confirmada tem
   precedência; sem ela, apaga somente a feição simples. Campos de formulário
   preservam o comportamento nativo da tecla. */
document.addEventListener('keydown',e=>{
  if(e.key!=='Delete'&&e.key!=='Backspace')return;
  if(S._view==='licenses')return;
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
  /* Mover/Copiar abrem o mesmo diálogo: camada existente do mesmo tipo ou
     "Nova camada…" com nome (o antigo "nova camada _sel" fica coberto). */
  on('selMove',()=>{
    if(!S.msel.items.length){ toast('Nada selecionado'); return; }
    if(window.GeoMineFeatureCopy) GeoMineFeatureCopy.move(S.msel.items.slice()); else mselMove();
  });
  on('selCopy',()=>{
    if(!S.msel.items.length){ toast('Nada selecionado'); return; }
    if(window.GeoMineFeatureCopy) GeoMineFeatureCopy.open(S.msel.items.slice());
  });
  on('selX',()=>setTool('pan'));
})();

function onMapClick(e){
  // Filled vector paths forward their stopped click here instead of firing
  // the map listener. Hatch picking must receive that same real click.
  if(S.tool==='cad-hatch'&&S._cadHatchMapHandler){S._cadHatchMapHandler(e);return;}
  if(S.tool==='blastingBoundary'||S.tool==='blastingDirection'){
    window.GeoMineBlasting?.mapClick(e);return;
  }
  if(S.tool==='feature-style-brush'){
    window.GeoMineFeatureStyleBrush?.mapClick(e);return;
  }
  if(S.tool==='thalwegRegion'){
    window.GeoMineThalweg?.mapClick(e);return;
  }
  if(S.tool==='riverChannelAxis'){
    window.GeoMineChannelExtraction?.mapClick(e);return;
  }
  // Um único caminho para cliques livres e os encaminhados pelas feições.
  // O listener privado da seção não recebia cliques sobre polígonos/pontos,
  // pois o handler vetorial interrompe a propagação antes de chegar ao mapa.
  if(S.tool==='geoSection'){
    const geology=window.GeoMineGeology;
    if(geology&&typeof geology.sectionMapClick==='function')geology.sectionMapClick(e);
    return;
  }
  if(S.tool==='contBusca'&&S._tinContBusca&&S._tinContBusca.armed){
    S._tinContBusca.pts.push([e.latlng.lat,e.latlng.lng]);tinContBuscaRedraw();return;
  }
  // editor de vetores com comando armado consome o clique
  let edLL=e.latlng;
  if(typeof ED==='object'&&ED.on&&ED.pend){
    edLL=GeoMineOrtho.editorInput(edLL,true);
  }
  if(typeof ED==='object'&&ED._pendTs&&Date.now()-ED._pendTs<450){ED._pendTs=0;return;}
  if(typeof edMapClick==='function' && edMapClick(edLL)) return;
  const L=activeLayer();
  if(S.tool==='select'){
    /* Cliques no fundo e nos paths usam a mesma prioridade da árvore. */
    /* Tolerância de seleção não depende mais do ímã: com o snap desligado o
       clique tinha de acertar o traço no pixel, e linha fina ficava quase
       impossível de escolher. */
    {
      const hit=feicaoSobPonto(e.latlng,S.touch?Math.round(SNAP_PX*1.6):SNAP_PX);
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
  // A contributing-area query picks the closest visible flow segment itself.
  // Global CAD snapping can move the outlet to an unrelated vertex first.
  const nativeBasinPoint=S.tool==='basin'&&window.GeoMinePointCatchment;
  if(S.snapOn&&!medindoLivre&&!nativeBasinPoint&&!['point','line','poly','select','selpoly'].includes(S.tool)){
    try{const sn=snapLatLng(cmdLL,null,{flash:true});if(sn&&sn.latlng)cmdLL=sn.latlng;}catch(_){}
  }
  if(S.tool==='measure'){
    if(typeof measMode==='function' && measMode()==='lines'){ measLineClick(e.latlng); return; }
    GeoMineRuler.click(e.latlng); return;
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
    const destino=S.tool==='point'?L:GeoMineDrawingSession.acquire();
    if(!destino){ if(S.tool==='point')toast('Selecione ou crie uma camada primeiro'); return; }
    const sn=GeoMineOrtho.drawing(e.latlng,true);
    if(sn.invalidNumeric){toast('Corrija o comprimento ou o ângulo antes de inserir o vértice.');return;}
    const ll=sn.latlng;
    if(S.tool==='point'){ addFeature(destino,[[ll.lat,ll.lng]]); }
    else { S.drawBuf.push([ll.lat,ll.lng]); window.GeoMineDynamicSegment?.reset();redrawDraw();window.GeoMineDynamicSegment?.beginAt(ll); }
  }
}
function redrawDraw(){
  GeoMineOrtho.clearPreview();
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
function finishDraw(options={}){
  const L=GeoMineDrawingSession.acquire();
  if(!L)return false;
  const C=S._continuando;
  if(C&&(C.L!==L||C.tool!==S.tool||!L.features.includes(C.f))){
    toast('A feição que estava sendo continuada foi removida ou alterada. O traçado foi preservado.');
    return false;
  }
  // remove vértices consecutivos duplicados (o duplo-clique de finalizar gera 2 cliques no mesmo ponto)
  S.drawBuf=S.drawBuf.filter((p,i,a)=>!i || Math.abs(p[0]-a[i-1][0])>1e-9 || Math.abs(p[1]-a[i-1][1])>1e-9);
  const minimo=S.tool==='poly'?3:2;
  if(S.drawBuf.length<minimo) { clearDraw(); return false; }
  const geom=S.drawBuf.map(([lat,lng])=>{const c=fromWGS(L.crs,lng,lat);return [c[0],c[1]];});
  const tool=S.tool;
  if(tool==='poly'){
    GeoMineOrtho.closeCorner(geom);
    const a=geom[0], b=geom[geom.length-1];
    if(a&&b&&Math.hypot(a[0]-b[0],a[1]-b[1])>1e-9) geom.push(a.slice());
  }
  /* continuação: a MESMA feição recebe o traçado novo */
  if(C){
    if(!continuarConclui(C,geom))return false;
    clearDraw();selectFinishedDrawing(L,C.f);return true;
  }
  const feat=tool==='poly'?addFeature(L,[geom],true,options):addFeature(L,geom,false,options);
  if(!feat)return false;
  clearDraw();
  selectFinishedDrawing(L,feat);
  if(feat&&(tool==='line'||tool==='poly')){
    S._ultimoDesenho={L,f:feat,tool,projeto:S.projectId};
    continuarChip(true);
  }
  return true;
}
/* A feição concluída é a entrada do próximo comando, inclusive no editor CAD. */
function selectFinishedDrawing(L,f){
  if(typeof mselClear==='function')mselClear(true);
  S.activeId=L.id;S.selRaster=null;
  S.selFeat={layer:L,layerId:L.id,idx:L.features.indexOf(f)};
  if(typeof edSelecionar==='function')edSelecionar({L,f,idx:S.selFeat.idx},true);
  refreshUI();
  if(typeof highlightSel==='function')highlightSel();
}
function prepareDrawingCommand(){
  if(!['line','poly'].includes(S.tool)||!S.drawBuf.length)return true;
  const minimum=S.tool==='poly'?3:2;
  const points=S.drawBuf.filter((p,i,a)=>!i||Math.abs(p[0]-a[i-1][0])>1e-9||Math.abs(p[1]-a[i-1][1])>1e-9);
  if(points.length<minimum){toast('Marque ao menos '+minimum+' vértices para concluir o desenho.');return false;}
  if(!finishDraw({quick:true}))return false;
  setTool('select');
  return true;
}
function clearDraw(){ window.GeoMineDynamicSegment?.reset();GeoMineDrawingSession.clear(); S.drawBuf=[]; S.drawLayer.clearLayers(); GeoMineOrtho.clearPreview();
  /* cancelar a continuação não mexe na feição: ela nunca saiu da camada */
  S._continuando=null; }

/* CONTINUAR DESENHO
   Concluir sem querer (duplo clique, Enter, Esc, botão direito ou o próprio
   botão da ferramenta) não obriga a refazer o traçado: "Continuar desenho"
   devolve os vértices da última linha/polígono concluído — ou da linha/
   polígono selecionado — ao traçado, e os cliques seguintes continuam de onde
   parou. Ao concluir de novo a MESMA feição é atualizada (atributos
   preservados, Ctrl+Z volta à geometria anterior). Durante a continuação a
   feição continua na camada: cancelar ou trocar de ferramenta a deixa como
   estava, e um salvamento no meio do caminho não perde nada.            */
S._ultimoDesenho=null; S._continuando=null;
function continuarAlvo(alvo){
  const tipo=L=>L&&(L.gtype==='line'?'line':L.gtype==='polygon'?'poly':null);
  const atual=A=>A&&tipo(A.L)&&S.layers.includes(A.L)&&A.L.features.includes(A.f)?A:null;
  if(alvo&&alvo.L&&alvo.f) return atual(alvo);
  if(typeof ED==='object'&&ED.on&&ED.sel&&tipo(ED.sel.L)){
    const A=atual({L:ED.sel.L,f:ED.sel.f,tool:tipo(ED.sel.L)});if(A)return A;
  }
  if(S.selFeat){
    const L=S.selFeat.layer||S.layers.find(x=>x.id===S.selFeat.layerId),f=L&&L.features[S.selFeat.idx];
    if(f&&tipo(L)) return atual({L,f,tool:tipo(L)});
  }
  const u=S._ultimoDesenho;
  if(u&&u.projeto===S.projectId&&S.layers.includes(u.L)&&u.L.features.includes(u.f)) return u;
  return null;
}
function continuarDesenho(alvo){
  const A=continuarAlvo(alvo);
  if(!A){ toast('Nada para continuar: selecione uma linha ou um polígono, ou desenhe um primeiro'); return false; }
  const {L,f}=A, tool=L.gtype==='polygon'?'poly':'line';
  if(L.locked){ toast('A camada "'+L.name+'" está bloqueada'); return false; }
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){ collabCanEditLayer(L,true); return false; }
  let partes=(Array.isArray(f.geom)&&Array.isArray(f.geom[0])&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
  if(partes.length!==1){
    toast(tool==='poly'?'Polígono com furo ou várias partes: ajuste pelos vértices no Editor de vetores'
                       :'Linha com várias partes: separe-as (Explodir) antes de continuar');
    return false;
  }
  if(!Array.isArray(partes[0])){toast('Geometria inválida para continuar');return false;}
  let pts=partes[0].filter(p=>Array.isArray(p)&&p[0]!=null&&p[1]!=null&&Number.isFinite(+p[0])&&Number.isFinite(+p[1]));
  if(pts.length!==partes[0].length){toast('A feição contém coordenadas inválidas. Corrija os vértices antes de continuar.');return false;}
  if(tool==='poly'&&pts.length>1){
    const a=pts[0],b=pts[pts.length-1];
    if(Math.hypot(a[0]-b[0],a[1]-b[1])<=1e-9) pts=pts.slice(0,-1);
  }
  if(pts.length<(tool==='poly'?3:2)){ toast('Geometria curta demais para continuar'); return false; }
  /* Continuar pela primeira ponta não inverte definitivamente a linha:
     apenas o rascunho é invertido; a orientação original volta ao concluir. */
  let reverse=tool==='line'&&(A.endpoint==='start'||A.endpoint===0);
  if(tool==='line'&&A.endpoint==null&&A.latlng&&Number.isFinite(+A.latlng.lat)&&Number.isFinite(+A.latlng.lng)){
    const screen=p=>{const w=toWGS(L.crs,+p[0],+p[1]);return map.latLngToContainerPoint(L2.latLng(w[1],w[0]));},
      click=map.latLngToContainerPoint(A.latlng),a=screen(pts[0]),b=screen(pts[pts.length-1]),
      d=p=>(p.x-click.x)**2+(p.y-click.y)**2;
    reverse=d(a)<d(b);
  }
  const zs=Array.isArray(f.zg)?(Array.isArray(f.zg[0])?f.zg[0]:f.zg):null;
  const original=pts.map((p,i)=>({p:p.slice(),z:zs?zs[i]:p.length>2?p[2]:null}));
  if(reverse)original.reverse();
  const source={geom:JSON.stringify(f.geom),zg:JSON.stringify(f.zg),multi:!!f.multi,crs:L.crs,gtype:L.gtype,workCRS:S.workCRS,
    project:S.projectId,generation:window.GeoMineSessionAutosave?.state?.generation};
  continuarChip(false);
  if(typeof ED==='object'&&ED.on&&typeof edLigar==='function')edLigar(false,true);
  S.activeId=L.id; setTool(tool);                 // setTool limpa o traçado: os vértices entram depois
  if(S.tool!==tool||GeoMineDrawingSession.acquire()!==L)return false;
  S.drawBuf=original.map(({p})=>{const w=toWGS(L.crs,+p[0],+p[1]);return [w[1],w[0]];});
  S._continuando={L,f,tool,reverse,source,original,formato:Array.isArray(f.geom[0]?.[0])?'aneis':'simples',pts:original.map(({p})=>p.slice(0,2))};
  redrawDraw(); refreshUI();
  toast((tool==='poly'?'Polígono':'Linha pela ponta '+(reverse?'inicial':'final'))+' reaberto: clique para acrescentar vértices · Enter conclui');
  return true;
}
function continuarConclui(C,geom){
  const {L,f,tool}=C;
  if(!Array.isArray(geom)||geom.length<(tool==='poly'?3:2)||geom.some(p=>!Array.isArray(p)||
    p[0]==null||p[1]==null||!Number.isFinite(+p[0])||!Number.isFinite(+p[1]))){
    toast('O traçado contém coordenadas inválidas. A feição original foi preservada.');return false;
  }
  const source=C.source;
  if(!S.layers.includes(L)||!L.features.includes(f)||source&&(S.projectId!==source.project||
    window.GeoMineSessionAutosave?.state?.generation!==source.generation||L.crs!==source.crs||L.gtype!==source.gtype||S.workCRS!==source.workCRS||
    JSON.stringify(f.geom)!==source.geom||JSON.stringify(f.zg)!==source.zg||!!f.multi!==source.multi)){
    toast('A feição ou o projeto mudou durante a continuação. O original não foi sobrescrito.');return false;
  }
  if(L.locked){toast('A camada "'+L.name+'" está bloqueada. O traçado foi preservado.');return false;}
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){ collabCanEditLayer(L,true); return false; }
  const copia=x=>x==null?x:JSON.parse(JSON.stringify(x));
  /* Os pontos anteriores não atravessam outra reprojeção XY, que alterava
     suas coordenadas e descartava Z embutido. Novos pontos só recebem cota
     de uma superfície explicitamente vinculada à camada. */
  const igual=(a,b)=>a&&b&&[0,1].every(k=>Math.abs(a[k]-b[k])<=Math.max(1e-7,Math.max(Math.abs(a[k]),Math.abs(b[k]))*1e-12)),
    original=C.original||C.pts.map((p,i)=>({p,z:(Array.isArray(f.zg?.[0])?f.zg[0]:f.zg)?.[i]})),
    cot=geom.map((p,i)=>igual(p,original[i]?.p)?original[i].z??null:null);
  geom=geom.map((p,i)=>igual(p,original[i]?.p)?original[i].p.slice():p.slice());
  if(tool==='poly'&&igual(geom[0],geom[geom.length-1])){geom[geom.length-1]=geom[0].slice();cot[cot.length-1]=cot[0];}
  if(C.reverse){geom.reverse();cot.reverse();}
  const finalGeom=tool==='poly'||C.formato==='aneis'?[geom]:geom;
  if(JSON.stringify(finalGeom)===JSON.stringify(f.geom))return true;
  const hasZ=Array.isArray(f.zg)||original.some(o=>o.p.length>2);
  const change={t:'geom',L,f,geom:copia(f.geom),multi:!!f.multi,zg:copia(f.zg),msg:'continuar desenho'};
  if(f._thalweg)change.thalweg=copia(f._thalweg);
  undoPush(change);
  if(tool==='poly'){ f.geom=[geom]; f.multi=true; }
  else if(C.formato==='aneis'){ f.geom=[geom]; f.multi=true; }
  else { f.geom=geom; f.multi=false; }
  /* Z: os vértices que já existiam mantêm a cota; os novos vêm da superfície
     quando a camada é 3D por natureza, ou ficam sem cota */
  if(hasZ)f.zg=f.multi?[cot]:cot;
  if(L._topoBreakRasterId&&L.gtype==='line'){
    const r=(S.rasters||[]).find(x=>String(x.id)===String(L._topoBreakRasterId));
    if(r&&r.d){
      const cotas=geom.map((p,i)=>{if(cot[i]!=null)return cot[i];let q=p;
        if(String(L.crs)!==String(S.workCRS)){const w=toWGS(L.crs,p[0],p[1]);q=fromWGS(S.workCRS,w[0],w[1]);}
        const z=sampleZbil(r.d,q[0],q[1]);return Number.isFinite(z)?z:null;});
      f.zg=f.multi?[cotas]:cotas;
    }
  }
  if(L._autoCota&&typeof hFeicCotaUma==='function'){ try{const G=hFeicGrade();if(G)hFeicCotaUma(L,f,G);}catch(_){} }
  if(f._thalweg?.version===2)f._thalweg={...f._thalweg,manualModified:true};
  drawLayer(L); refreshUI();
  S._ultimoDesenho={L,f,tool,projeto:S.projectId};
  window.GeoMineSessionAutosave?.markDirty('desenho continuado');
  toast('Desenho continuado em "'+L.name+'" — Ctrl+Z volta ao traçado anterior');
  continuarChip(true);
  return true;
}
/* botão flutuante logo após concluir: some sozinho, ao começar outro
   traçado ou ao trocar de ferramenta */
let _contChipT=null;
function continuarChip(mostra){
  let b=document.getElementById('gmContinuarDesenho');
  clearTimeout(_contChipT);
  if(!mostra){ if(b) b.remove(); return; }
  if(!b){
    b=document.createElement('button'); b.id='gmContinuarDesenho'; b.type='button'; b.className='tbtn';
    b.textContent='↩ Continuar desenho';
    b.title='Reabre a última linha/polígono concluído para acrescentar vértices';
    b.style.cssText='position:absolute;left:50%;bottom:64px;transform:translateX(-50%);z-index:1200;padding:8px 14px;'+
      'background:var(--amber);color:#1a1206;font-weight:600;border-radius:8px;box-shadow:0 3px 10px #0006';
    b.onclick=e=>{ e.stopPropagation(); continuarDesenho(); };
    ['pointerdown','mousedown','dblclick','click'].forEach(ev=>b.addEventListener(ev,e=>e.stopPropagation()));
    map.getContainer().appendChild(b);
  }
  _contChipT=setTimeout(()=>continuarChip(false),20000);
}

function addFeature(L, geomInCRS, multi, options={}){
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);return null;}
  // geomInCRS já no CRS da camada (para point recebemos latlng — tratar)
  let geom=geomInCRS;
  if(L.gtype==='point' && Array.isArray(geomInCRS[0]) && geomInCRS[0].length===2 && Math.abs(geomInCRS[0][0])<=90){
    const c=fromWGS(L.crs,geomInCRS[0][1],geomInCRS[0][0]); geom=[[c[0],c[1]]];
  }
  const isGeology=!!(L&&L._geology&&L._geology.kind),props={};
  L.fields.forEach(f=>props[f.name]=f.type==='N'||f.type==='F'?(isGeology?null:0):'');
  if(props.FID!==undefined) props.FID=L.features.length;
  // camadas criadas pelo painel de drenagem trazem valores pr\u00e9-preenchidos
  if(L._defProps) Object.keys(L._defProps).forEach(k=>{ if(k in props) props[k]=L._defProps[k]; });
  const feat={geom, multi:!!multi, props};
  if(isGeology){
    const fm=window.GeoMineGeology&&window.GeoMineGeology.fieldMapping;
    feat._field=fm&&typeof fm.createFieldMeta==='function'
      ?fm.createFieldMeta(L,feat,{source:'manual-map',origin:L._geology.family==='modelo'?'interpreted':'observed'})
      :{schemaVersion:1,source:'manual-map',origin:L._geology.family==='modelo'?'interpreted':'observed',
        observedAt:new Date().toISOString(),operator:'',accuracyM:null,orientationAccuracyDeg:null,
        altitudeSource:'unknown',status:'draft'};
  }
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
  if(!options.quick)openFeatForm(L, feat);
  return feat;
}
/* formulário rápido de atributos da feição recém-desenhada */
function openFeatForm(L, feat){
  /* Camadas geológicas usam uma ficha própria, transacional e validada. O
     formulário genérico continua como fallback para projetos legados ou
     quando o módulo opcional ainda não terminou de carregar. */
  const fm=window.GeoMineGeology&&window.GeoMineGeology.fieldMapping;
  if(L&&L._geology&&fm&&typeof fm.openObservationForm==='function'){
    try{if(fm.openObservationForm(L,feat,{mode:'create'})!==false)return;}catch(e){console.warn('Ficha geológica',e);}
  }
  /* Area é um campo derivado: aparece na tabela, mas nunca como entrada
     manual no formulário da nova feição. */
  const flds=(L.fields||[]).filter(f=>f.name!=='FID'&&!autoAreaFieldReadOnly(f));
  if(!flds.length){ toast('Feição adicionada'); return; }
  const bg=document.getElementById('featForm');
  const box=document.getElementById('ffFields');
  const geologyRange=name=>{
    if(!L._geology)return null;
    const key=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
    if(['DIRECAO','AZIMUTE','AZIMUTH','STRIKE','RUMO'].includes(key))return [0,360];
    if(['MERGULHO','CAIMENTO','DIP','PLUNGE','INCLINACAO'].includes(key))return [0,90];
    return null;
  };
  box.innerHTML=flds.map(f=>`<label class="field">${esc(f.name)}${f.type==='N'||f.type==='F'?' (número)':''}</label>
    <input type="${f.type==='N'||f.type==='F'?'number':'text'}" class="ff-in" data-f="${esc(f.name)}"
      value="${esc(feat.props[f.name]??'')}" ${f.type==='C'?`maxlength="${f.length||254}"`:''} ${geologyRange(f.name)?`min="${geologyRange(f.name)[0]}" max="${geologyRange(f.name)[1]}"`:''}>`).join('');
  bg.classList.add('on');
  const first=box.querySelector('input'); if(first) setTimeout(()=>first.focus(),60);
  const commit=()=>{
    if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);return;}
    let invalid='';
    box.querySelectorAll('.ff-in').forEach(inp=>{
      const f=(L.fields||[]).find(q=>q.name===inp.dataset.f);
      if(f&&(f.type==='N'||f.type==='F')){
        const blank=inp.value.trim()==='',value=blank?null:Number(inp.value),range=geologyRange(f.name);
        if(!blank&&(!Number.isFinite(value)||(range&&(value<range[0]||value>range[1])))){
          invalid=range?`${f.name} deve estar entre ${range[0]} e ${range[1]}.`:`${f.name} não é um número válido.`;
          inp.setCustomValidity(invalid);inp.reportValidity();return;
        }
        inp.setCustomValidity('');feat.props[inp.dataset.f]=blank?(L._geology?null:0):value;
      }else feat.props[inp.dataset.f]=inp.value;
    });
    if(invalid){toast(invalid);return;}
    bg.classList.remove('on');
    drawLayer(L); refreshUI(); toast('Feição adicionada com atributos');
  };
  document.getElementById('ffSave').onclick=commit;
  {
    const sv=document.getElementById('ffSave');let cb=document.getElementById('ffCont');
    if(!cb&&sv){cb=document.createElement('button');cb.id='ffCont';cb.type='button';cb.className='tbtn';
      cb.style.cssText='width:100%;justify-content:center;margin-top:8px';cb.textContent='↩ Continuar desenho';
      sv.parentElement.insertBefore(cb,sv.nextSibling);}
    const pode=(L.gtype==='line'||L.gtype==='polygon');
    if(cb){cb.hidden=!pode;cb.onclick=()=>{commit();if(!bg.classList.contains('on'))continuarDesenho({L,f:feat,tool:L.gtype==='polygon'?'poly':'line'});};}
  }
  document.getElementById('ffClose').onclick=()=>{ bg.classList.remove('on'); toast('Feição adicionada (atributos vazios)'); };
  box.querySelectorAll('input').forEach(inp=>inp.addEventListener('keydown',e=>{ if(e.key==='Enter') commit(); }));
}
