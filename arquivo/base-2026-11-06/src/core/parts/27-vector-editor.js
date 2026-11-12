/* ============================================================================
   EDITOR DE VETORES — ponto, linha e polígono
   Estado próprio (ED), vértices desenhados em CANVAS (nenhum é descartado),
   interação por ponteiro (igual no mouse e no toque), paleta flutuante e
   aba própria na ribbon. Toda alteração de geometria passa por edSnapshot(),
   que empilha o undo tipado 'geom'.
   ========================================================================== */
var ED = { on:false, sel:null, ring:0, vi:-1, drag:null, pend:null,
           rend:null, lay:null, mids:[], pts:[], box:null, min:false };

/* ---------- geometria pura (validada offline) ---------- */
function edDist2(a,b){ const dx=a[0]-b[0], dy=a[1]-b[1]; return dx*dx+dy*dy; }
function edSegDist(p,a,b){                    // distância ponto-segmento
  const vx=b[0]-a[0], vy=b[1]-a[1], wx=p[0]-a[0], wy=p[1]-a[1];
  const L2n=vx*vx+vy*vy; let t = L2n? (wx*vx+wy*vy)/L2n : 0;
  t=Math.max(0,Math.min(1,t));
  const dx=a[0]+t*vx-p[0], dy=a[1]+t*vy-p[1];
  return {d:Math.hypot(dx,dy), t:t, pt:[a[0]+t*vx, a[1]+t*vy]};
}
function edRingLen(r,closed){ let s=0; for(let i=0;i<r.length-1;i++) s+=Math.hypot(r[i+1][0]-r[i][0],r[i+1][1]-r[i][1]);
  if(closed&&r.length>2) s+=Math.hypot(r[0][0]-r[r.length-1][0],r[0][1]-r[r.length-1][1]); return s; }
function edArea(r){ let a=0; for(let i=0,j=r.length-1;i<r.length;j=i++) a+=(r[j][0]*r[i][1]-r[i][0]*r[j][1]); return a/2; }
function edInRing(p,r){                        // paridade (par/ímpar)
  let dentro=false;
  for(let i=0,j=r.length-1;i<r.length;j=i++){
    const yi=r[i][1], yj=r[j][1];
    if((yi>p[1])!==(yj>p[1])){
      const x=r[i][0]+(p[1]-yi)/(yj-yi)*(r[j][0]-r[i][0]);
      if(p[0]<x) dentro=!dentro;
    }
  }
  return dentro;
}
/* Douglas–Peucker */
function edSimplify(r, tol){
  if(r.length<3) return r.slice();
  const keep=new Uint8Array(r.length); keep[0]=keep[r.length-1]=1;
  const pilha=[[0,r.length-1]];
  while(pilha.length){
    const [i,j]=pilha.pop(); let dmax=0, k=-1;
    for(let m=i+1;m<j;m++){ const d=edSegDist(r[m],r[i],r[j]).d; if(d>dmax){ dmax=d; k=m; } }
    if(dmax>tol && k>0){ keep[k]=1; pilha.push([i,k],[k,j]); }
  }
  const out=[]; for(let i=0;i<r.length;i++) if(keep[i]) out.push(r[i].slice());
  return out;
}
/* densificar: insere pontos a cada `passo` metros */
function edDensify(r, passo, closed){
  return densificaRing(r,null,passo,closed).pts;
}
/* Chaikin: suaviza cortando cantos */
function edChaikin(r, iters, closed){
  let cur=r.map(p=>p.slice());
  for(let it=0; it<(iters||1); it++){
    const out=[]; const n=closed? cur.length : cur.length-1;
    if(!closed) out.push(cur[0].slice());
    for(let i=0;i<n;i++){
      const a=cur[i], b=cur[(i+1)%cur.length];
      out.push([a[0]*0.75+b[0]*0.25, a[1]*0.75+b[1]*0.25]);
      out.push([a[0]*0.25+b[0]*0.75, a[1]*0.25+b[1]*0.75]);
    }
    if(!closed) out.push(cur[cur.length-1].slice());
    cur=out;
  }
  return cur;
}
/* paralela (offset) pela bissetriz de cada vértice */
function edOffset(r, dist, closed){
  const n=r.length; if(n<2) return r.slice();
  const norm=(a,b)=>{ const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1; return [dy/L,-dx/L]; };
  const out=[];
  for(let i=0;i<n;i++){
    const prev=r[(i-1+n)%n], cur=r[i], next=r[(i+1)%n];
    let nx=0, ny=0, c=0;
    if(closed || i>0){ const m=norm(prev,cur); nx+=m[0]; ny+=m[1]; c++; }
    if(closed || i<n-1){ const m=norm(cur,next); nx+=m[0]; ny+=m[1]; c++; }
    let L=Math.hypot(nx,ny); if(!L){ nx=0; ny=0; L=1; }
    nx/=L; ny/=L;
    // fator da bissetriz: mantém a distância constante nas quinas
    let f=1;
    if(c===2){ const m1=norm(prev,cur); const cos=nx*m1[0]+ny*m1[1]; f = Math.abs(cos)>1e-6? 1/cos : 1; }
    f=Math.max(-4,Math.min(4,f));
    out.push([cur[0]+nx*dist*f, cur[1]+ny*dist*f]);
  }
  return out;
}
function edCentroide(rings){
  let sx=0, sy=0, n=0;
  rings.forEach(r=>r.forEach(p=>{ sx+=p[0]; sy+=p[1]; n++; }));
  return n? [sx/n, sy/n] : [0,0];
}
function edMapPts(rings, fn){ return rings.map(r=>r.map(p=>{ const q=fn(p); if(p.length>2) q[2]=p[2]; return q; })); }
function edGirar(rings, c, graus){
  const a=graus*Math.PI/180, co=Math.cos(a), si=Math.sin(a);
  return edMapPts(rings,p=>{ const dx=p[0]-c[0], dy=p[1]-c[1];
    return [c[0]+dx*co-dy*si, c[1]+dx*si+dy*co]; });
}
function edEscalar(rings, c, f){
  return edMapPts(rings,p=>[c[0]+(p[0]-c[0])*f, c[1]+(p[1]-c[1])*f]);
}
function edEspelhar(rings, a, b){               // espelha pelo eixo a→b
  const vx=b[0]-a[0], vy=b[1]-a[1], L=Math.hypot(vx,vy)||1;
  const ux=vx/L, uy=vy/L;
  return edMapPts(rings,p=>{ const wx=p[0]-a[0], wy=p[1]-a[1];
    const d=wx*ux+wy*uy; const px=a[0]+ux*d, py=a[1]+uy*d;
    return [2*px-p[0], 2*py-p[1]]; });
}
function edMover(rings, dx, dy){ return edMapPts(rings,p=>[p[0]+dx,p[1]+dy]); }
/* remove o arco entre dois pontos do contorno, mantendo o polígono FECHADO.
   i/j = índice do segmento onde cai cada ponto; pi/pj = ponto sobre o traçado */
function edApagarTrecho(r, i, pi, j, pj, ladoMaior){
  const n=r.length;
  const arco=(de, ate)=>{ const out=[]; let k=(de+1)%n; let guard=0;
    while(k!==(ate+1)%n && guard++<n+2){ out.push(k); k=(k+1)%n; } return out; };
  const A=arco(i,j), B=arco(j,i);
  const comp=idx=>{ let s=0; for(let m=0;m<idx.length-1;m++) s+=Math.hypot(r[idx[m+1]][0]-r[idx[m]][0], r[idx[m+1]][1]-r[idx[m]][1]); return s; };
  // por padrão remove o arco MENOR; a caixa "lado maior" inverte
  let remover = comp(A) <= comp(B) ? A : B;
  if(ladoMaior) remover = (remover===A? B : A);
  const rem=new Set(remover);
  const out=[];
  const primeiro = remover===A ? i : j;
  const ultimo   = remover===A ? j : i;
  for(let k=0;k<n;k++){
    if(rem.has(k)) continue;
    out.push(r[k].slice());
    if(k===primeiro){ out.push((remover===A? pi : pj).slice()); out.push((remover===A? pj : pi).slice()); }
  }
  return out;
}

/* ---------- acesso à geometria da feição ---------- */
function edRings(L,f){
  if(!f||!f.geom) return [];
  /* PONTO: a ferramenta Ponto e as importações gravam [[x,y]] (multiponto =
     vários pares); projetos antigos, [x,y] direto. O editor supunha [x,y] e,
     com [[x,y]], o vértice chegava ao mapa como [[x,y]] — "Invalid LatLng
     object (undefined, x,y)" ao editar. Cada ponto vira um anel de um
     vértice, que é o PRÓPRIO array do ponto (a edição acontece no lugar). */
  if(L.gtype==='point'){
    const pts=typeof pointGeomCoords==='function'?pointGeomCoords(f.geom):[f.geom];
    return pts.filter(p=>Array.isArray(p)&&p.length>=2).map(p=>[p]);
  }
  if(Array.isArray(f.geom[0]) && Array.isArray(f.geom[0][0])) return f.geom;
  return [f.geom];
}
function edSetRings(L,f,rings){
  if(L.gtype==='point'){
    /* devolve no MESMO formato em que o ponto estava gravado */
    const pts=(rings||[]).map(r=>r&&r[0]).filter(p=>Array.isArray(p)&&p.length>=2);
    if(!pts.length) return;
    if(typeof f.geom[0]==='number') f.geom=pts[0];
    else if(pts.length===1&&!f.multi) f.geom=[pts[0]];
    else { f.geom=pts; f.multi=pts.length>1; }
    return;
  }
  if(rings.length>1 || f.multi){ f.geom=rings; f.multi=true; }
  else { f.geom=rings[0]; f.multi=false; }
}
function edFechado(L){ return L.gtype==='polygon'; }
function edSnapshot(msg){
  if(!ED.sel) return null;
  const {L,f}=ED.sel;
  undoPush({t:'geom', L:L, f:f, geom:JSON.parse(JSON.stringify(f.geom)),
    zg:f.zg==null?f.zg:JSON.parse(JSON.stringify(f.zg)),
    multi:f.multi, msg:msg||'geometria'});
  return true;
}
function edAplicar(rings, msg){
  const {L,f}=ED.sel;
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);return false;}
  edSetRings(L,f,rings);
  /* Inserir/apagar/suavizar vértices deve alterar XY e Z em conjunto. O
     resolvedor também recupera arquivos antigos já dessincronizados. */
  if(L.gtype!=='point'&&typeof resolveFeatureZRing==='function'){
    const nested=!!(f.multi&&Array.isArray(f.geom&&f.geom[0]&&f.geom[0][0])),
      rs=nested?f.geom:[f.geom];
    rs.forEach((r,ri)=>resolveFeatureZRing(f,r,ri,nested,true));
  }
  if(L._autoCota && typeof hFeicCotaUma==='function'){
    try{ const G=hFeicGrade(); if(G) hFeicCotaUma(L,f,G); }catch(e){}
  }
  // camada de drenagem: qualquer mudança de geometria recalcula os atributos
  // (comprimento, cotas, declividade, zg) para a tabela ficar sempre correta
  if(typeof edEhDrenagem==='function' && edEhDrenagem(L)) edRecalcGeom(L, f);
  drawLayer(L); edRedraw(); refreshUI();
  try{ if(typeof openAttr==='function' && document.getElementById('attrPanel') &&
        document.getElementById('attrPanel').classList.contains('open')) openAttr(); }catch(e){}
  if(msg) toast(msg);
  return true;
}

/* ---------- seleção geométrica (não depende do preenchimento) ---------- */
function edPickAt(latlng){
  // O editor usa os mesmos alvos do clique e do menu. A menor área/globalmente
  // mais próxima não pode furar a hierarquia nem selecionar classes ocultas.
  return feicaoSobPonto(latlng,S.touch?18:12);
}
function edSelecionar(alvo, quieto){
  window.GeoMineMouseRotation?.cancel();
  window.GeoMinePolygonEdgeDrag?.clear();
  if(!alvo){ ED.sel=null; ED.vi=-1; ED.ring=0; edRedraw(); edPainelSync(); return false; }
  ED.sel={L:alvo.L, idx:alvo.idx, f:alvo.f}; ED.ring=0; ED.vi=-1;
  S.activeId=alvo.L.id; S.selFeat={layer:alvo.L, layerId:alvo.L.id, idx:alvo.idx};
  edRedraw(); edPainelSync();
  if(!quieto){
    const rings=edRings(alvo.L,alvo.f);
    const nv=rings.reduce((s,r)=>s+r.length,0);
    cmdLog(`selecionado: ${alvo.L.name} · feição ${alvo.idx+1} · ${rings.length} anel(is) · ${nv} vértice(s)`,'info');
  }
  return true;
}

/* ---------- desenho dos vértices em CANVAS ---------- */
function edRedraw(){
  window.GeoMinePolygonEdgeDrag?.clear();
  if(!ED.lay){
    ED.rend=L2.canvas({pane:'markerPane', padding:0.3});
    // Canvas glyphs are visual only; the editor handles pointer gestures on
    // the map container. An empty canvas must not cover Leaflet vertex icons
    // after a rebuild, nor consume clicks on the resulting buffer.
    ED.rend.on('add',()=>{if(ED.rend?._container)ED.rend._container.style.setProperty('pointer-events','none','important');});
    ED.lay=L2.layerGroup().addTo(map);
  }
  if(ED.rend?._container)ED.rend._container.style.setProperty('pointer-events','none','important');
  ED.lay.clearLayers(); ED.pts=[]; ED.mids=[];
  if(GeoMineVertexHandles.legacyActive())return;
  if(!ED.on || !ED.sel) return;
  const {L,f}=ED.sel; if(!collabCanEditLayer(L,false))return;
  const rings=edRings(L,f); if(!rings.length) return;
  const fechado=edFechado(L);
  const nv=rings.reduce((s,r)=>s+r.length,0);
  rings.forEach((r,ri)=>{
    r.forEach((pt,vi)=>{
      const w=toWGS(L.crs,pt[0],pt[1]);
      if(!Number.isFinite(w[0])||!Number.isFinite(w[1])) return;   // vértice ilegível: não derruba a edição
      const sel=(ri===ED.ring && vi===ED.vi);
      L2.circleMarker([w[1],w[0]],{renderer:ED.rend, interactive:false,
        radius: sel? 6:4, color: sel? '#f5a524':'#37c0aa', weight: sel?2.5:1.6,
        fillColor: sel? '#f5a524':'#0d1117', fillOpacity: sel?1:0.9}).addTo(ED.lay);
      ED.pts.push({ri,vi,lat:w[1],lng:w[0]});
    });
    /* ○ do meio (INSERIR VÉRTICE). Dois ajustes: (a) o disco era cinza
       #8b949e de raio 3 com miolo quase preto — sobre ortofoto e sombreado
       claro ele sumia, e a função parecia não existir; agora é branco com
       moldura escura, do mesmo tamanho do vértice; (b) o teto de 400
       vértices escondia os pontos médios justamente nas cavas e pilhas
       reais, que passam disso somando os anéis — o canvas aguenta bem mais,
       então o corte subiu para 4.000. */
    if(L.gtype!=='point' && nv<=4000){
      const n = fechado? r.length : r.length-1;
      for(let i=0;i<n;i++){
        const a=r[i], b=r[(i+1)%r.length];
        const m=[(a[0]+b[0])/2,(a[1]+b[1])/2];
        const w=toWGS(L.crs,m[0],m[1]);
        L2.circleMarker([w[1],w[0]],{renderer:ED.rend, interactive:false,
          radius:4.5, color:'#1a1206', weight:2, fillColor:'#ffffff', fillOpacity:1}).addTo(ED.lay);
        /* o disco branco é ONDE SE INSERE vértice: desenha um "+" dentro
           (par de traços em pixels convertidos, redesenhados no zoom) */
        try{
          const cp=map.latLngToContainerPoint([w[1],w[0]]),
            ph=map.containerPointToLatLng([cp.x-2.6,cp.y]),
            ph2=map.containerPointToLatLng([cp.x+2.6,cp.y]),
            pv=map.containerPointToLatLng([cp.x,cp.y-2.6]),
            pv2=map.containerPointToLatLng([cp.x,cp.y+2.6]);
          L2.polyline([[ph.lat,ph.lng],[ph2.lat,ph2.lng]],{renderer:ED.rend,
            interactive:false,color:'#1a1206',weight:1.6}).addTo(ED.lay);
          L2.polyline([[pv.lat,pv.lng],[pv2.lat,pv2.lng]],{renderer:ED.rend,
            interactive:false,color:'#1a1206',weight:1.6}).addTo(ED.lay);
        }catch(e){}
        ED.mids.push({ri,i,lat:w[1],lng:w[0]});
      }
    }
  });
}
/* o "+" dos pontos médios é traçado em pixels do zoom corrente — ao mudar
   o zoom, redesenha para o tamanho certo */
try{ map.on('zoomend',()=>{ try{ if(window.ED&&ED.on)edRedraw(); }catch(_){}}); }catch(e){}
function edHit(p0, lista){
  const tol=(S.touch?18:12);
  let melhor=null, bd=tol*tol;
  lista.forEach(v=>{
    const pp=map.latLngToContainerPoint([v.lat,v.lng]);
    const d=(pp.x-p0.x)**2+(pp.y-p0.y)**2;
    if(d<bd){ bd=d; melhor=v; }
  });
  return melhor;
}

/* ---------- interação por ponteiro (mouse e toque iguais) ---------- */
function edBindPointer(){
  const cont=map.getContainer();
  let tLast=0;
  /* O navegador dispara "click" ao soltar mesmo depois de arrastar. Em camada
     desenhada em canvas esse clique chegava ao Leaflet como clique na feição:
     abria o menu flutuante (ou trocava a seleção) em cima dos vértices, e o
     próximo arrasto pegava o menu em vez do ponto. O clique que fecha um gesto
     de vértice ou de "+" do meio pertence ao editor e é descartado aqui. */
  let engole=null;
  cont.addEventListener('click',ev=>{
    const e=engole;engole=null;
    if(!e||Date.now()-e.t>700)return;
    if(Number.isFinite(e.x)&&Math.hypot(ev.clientX-e.x,ev.clientY-e.y)>8)return;
    ev.preventDefault();ev.stopImmediatePropagation();
  },true);
  cont.addEventListener('pointerdown',ev=>{
    if(!ED.on || ev.button===2) return;
    if(GeoMineVertexHandles.legacyActive())return;
    if(S.tool && S.tool!=='pan' && S.tool!=='select' && S.tool!=='vertex') return;
    if(ED.sel&&ED.sel.L&&typeof collabCanEditLayer==='function'&&!collabCanEditLayer(ED.sel.L,false)){collabCanEditLayer(ED.sel.L,true);return;}
    const r=cont.getBoundingClientRect(); const p0={x:ev.clientX-r.left, y:ev.clientY-r.top};
    const ll=map.containerPointToLatLng([p0.x,p0.y]);
    if(ED.pend){
      /* comando pedindo pontos: consome AQUI. O clique em cima da própria
         linha era capturado pelo handler de seleção da feição e nunca
         chegava ao mapa — a quebra "não funcionava" exatamente no gesto
         mais natural (tocar na linha). */
      const edLL=GeoMineOrtho.editorInput(ll,true);
      try{
        if(edMapClick(edLL)){
          ED._pendTs=Date.now();
          ev.preventDefault();ev.stopPropagation();
        }
      }catch(_){}
      return;
    }
    const v=edHit(p0, ED.pts);
    if(v){
      const agora=Date.now();
      if(agora-tLast<330 && ED.vi===v.vi && ED.ring===v.ri){ tLast=0; edApagarVertice(); return; }
      tLast=agora;
      ED.ring=v.ri; ED.vi=v.vi; ED.drag={ri:v.ri, vi:v.vi, moveu:false,origin:L2.latLng(v.lat,v.lng)};
      // guias paralela/perpendicular a partir dos vizinhos do vértice
      try{ window.GeoMineVertexGuides?.begin(ED.sel.L, edRings(ED.sel.L,ED.sel.f)[v.ri], v.vi, edFechado(ED.sel.L)); }catch(e){}
      try{ map.dragging.disable(); }catch(e){}
      edRedraw(); edPainelSync();
      ev.preventDefault();
      return;
    }
    const m=edHit(p0, ED.mids);
    if(m){                                         // inserir vértice e já arrastar
      const {L,f}=ED.sel; const rings=edRings(L,f);
      edSnapshot('inserir vértice');
      const c=fromWGS(L.crs, m.lng, m.lat);
      rings[m.ri].splice(m.i+1,0,[c[0],c[1]]);
      edAplicar(rings);
      ED.ring=m.ri; ED.vi=m.i+1; ED.drag={ri:m.ri, vi:m.i+1, moveu:false, novo:true,origin:L2.latLng(m.lat,m.lng)};
      try{ window.GeoMineVertexGuides?.begin(L, edRings(L,f)[m.ri], m.i+1, edFechado(L)); }catch(e){}
      try{ map.dragging.disable(); }catch(e){}
      edRedraw(); edPainelSync();
      ev.preventDefault();
      return;
    }
    // clique no vazio ou sobre feição: seleciona, mas NÃO bloqueia o pan do mapa
    // (sem preventDefault, o arraste do Leaflet continua funcionando normalmente)
    /* Ctrl/Shift/Cmd+clique monta a seleção múltipla (pickFeature). Selecionar
       aqui também fazia a feição entrar e sair do conjunto no mesmo gesto. */
    if(ev.ctrlKey||ev.metaKey||ev.shiftKey) return;
    const alvo=edPickAt(ll);
    if(alvo) { edSelecionar(alvo); }
  });
  cont.addEventListener('pointermove',ev=>{
    if(ED.drag&&ev.pointerType!=='touch'&&ev.buttons===0){fim(ev);return;}
    if(!ED.on || !ED.drag || !ED.sel) return;
    if(GeoMineVertexHandles.legacyActive()){ED.drag=null;return;}
    if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(ED.sel.L,false)){
      ED.drag=null;mapaPanPadrao();collabCanEditLayer(ED.sel.L,true);return;
    }
    const r=cont.getBoundingClientRect();
    let ll=map.containerPointToLatLng([ev.clientX-r.left, ev.clientY-r.top]);
    const Led=(ED.sel&&ED.sel.L)||null;
    const ro={anchor:ED.drag.origin,crs:Led?.crs||S.workCRS,ignore:Led,exclude:new Set([ED.sel.f])};
    ll=(window.GeoMineVertexGuides?GeoMineVertexGuides.resolve(ll,ro):GeoMineOrtho.resolve(ll,ro)).latlng;
    const {L,f}=ED.sel; const rings=edRings(L,f);
    if(!ED.drag.moveu){ ED.drag.moveu=true; if(!ED.drag.novo) edSnapshot('mover vértice'); }
    const c=fromWGS(L.crs, ll.lng, ll.lat);
    const alvo=rings[ED.drag.ri][ED.drag.vi];
    alvo[0]=c[0]; alvo[1]=c[1];
    edSetRings(L,f,rings); drawVertexFeature(L,f); edRedraw();
  });
  const fim=(ev)=>{
    if(!ED.drag) return;
    engole={t:Date.now(),x:ev&&ev.clientX,y:ev&&ev.clientY};
    const moveu=ED.drag.moveu; ED.drag=null;
    if(ED.sel)finishVertexRender(ED.sel.L);
    window.GeoMineVertexGuides?.end();
    if(moveu)tLast=0; // successive drags are not a double-click deletion
    mapaPanPadrao();
    if(moveu && ED.sel){
      const {L,f}=ED.sel;
      if(L.gtype!=='point'&&typeof resolveFeatureZRing==='function'){
        const nested=!!(f.multi&&Array.isArray(f.geom&&f.geom[0]&&f.geom[0][0])),
          rs=nested?f.geom:[f.geom];
        rs.forEach((r,ri)=>resolveFeatureZRing(f,r,ri,nested,true));
      }
      if(L._autoCota && typeof hFeicCotaUma==='function'){
        try{ const G=hFeicGrade(); if(G) hFeicCotaUma(L,f,G); }catch(e){}
      }
      if(typeof edEhDrenagem==='function' && edEhDrenagem(L)) edRecalcGeom(L, f);
      refreshUI();
      try{ if(typeof openAttr==='function' && document.getElementById('attrPanel') &&
            document.getElementById('attrPanel').classList.contains('open')) openAttr(); }catch(e){}
    }
  };
  cont.addEventListener('pointerup',fim);
  cont.addEventListener('pointercancel',fim);
  /* soltar o botão FORA do mapa (painel, faixa, outra janela) também encerra:
     antes o vértice ficava grudado no cursor e o editor parecia travado */
  window.addEventListener('pointerup',fim,true);window.addEventListener('pointercancel',fim,true);window.addEventListener('blur',fim);
  window.edFimArrasto=fim;
}

/* ---------- comandos ---------- */
function edPrecisa(){
  if(!ED.sel){toast('Selecione uma feição primeiro');return false;}
  if(!collabCanEditLayer(ED.sel.L,true))return false;
  /* a feição marcada NO EDITOR é a intenção do usuário. Exigir que a camada
     ativa da árvore coincidisse derrubava qualquer comando depois de um
     clique na árvore ou nas propriedades ("ferramenta não funciona") —
     agora a camada ativa é ALINHADA à seleção do editor. */
  if(!(S.layers||[]).includes(ED.sel.L)){
    ED.sel=null;toast('A feição em edição não existe mais');return false;
  }
  const A=activeLayer();
  if(A&&ED.sel.L!==A){
    S.activeId=ED.sel.L.id;
    try{ refreshUI(); }catch(e){}
  }
  return true;
}
function edParam(id, pad){ const e=document.getElementById(id);
  const v=e? parseFloat(String(e.value).replace(',','.')) : NaN; return isFinite(v)? v : pad; }

/* Janela numérica comum aos comandos ajustáveis. A paleta continua guardando
   os últimos valores, porém nenhum comando usa mais um parâmetro invisível:
   o usuário sempre confirma o valor antes da operação. */
function edJanelaNumero(o){
  if(!edPrecisa())return;
  let bg=document.getElementById('edNumModal');
  if(!bg){
    bg=document.createElement('div');bg.id='edNumModal';bg.className='modal-bg';
    bg.innerHTML=`<div class="modal" style="width:min(460px,94vw)">
      <div class="modal-h"><b id="edNumTitulo">Ajustar</b><div style="flex:1"></div>
        <button class="tbtn" id="edNumX">✕</button></div>
      <div class="modal-b">
        <label class="field" id="edNumRotulo">Valor</label>
        <input type="number" id="edNumValor">
        <div class="hint" id="edNumHint"></div>
        <button class="tbtn" id="edNumOk" style="width:100%;justify-content:center;margin-top:12px;background:var(--amber);color:#1a1206;font-weight:700">Aplicar</button>
      </div></div>`;
    document.body.appendChild(bg);
    document.getElementById('edNumX').onclick=()=>bg.classList.remove('on');
  }
  document.getElementById('edNumTitulo').textContent=o.titulo||'Ajustar';
  document.getElementById('edNumRotulo').textContent=o.rotulo||'Valor';
  document.getElementById('edNumHint').textContent=o.hint||'';
  const v=document.getElementById('edNumValor');
  v.value=o.valor??0;v.step=o.step??'any';v.min=o.min??'';v.max=o.max??'';
  document.getElementById('edNumOk').textContent=o.botao||'Aplicar';
  document.getElementById('edNumOk').onclick=()=>{
    const n=parseFloat(String(v.value).replace(',','.'));
    if(!isFinite(n)||(o.min!=null&&n<o.min)||(o.max!=null&&n>o.max)){
      toast('Valor inválido');return;
    }
    bg.classList.remove('on');o.ok(n);
  };
  bg.classList.add('on');setTimeout(()=>{v.focus();v.select();},30);
}
function edAbreDeltaZ(inteira){
  edJanelaNumero({titulo:inteira?'Ajustar cota da feição':'Ajustar cota do vértice',
    rotulo:'Variação vertical ΔZ (m)',valor:edParam('edPdz',1),step:.1,
    hint:'Use valor positivo para elevar e negativo para rebaixar.',
    ok:n=>{document.getElementById('edPdz').value=n;edDeltaZ(inteira);}});
}
function edAbreEscala(){
  edJanelaNumero({titulo:'Escalar feição',rotulo:'Fator de escala',valor:edParam('edPfat',1.1),
    min:.000001,step:.05,hint:'1 mantém o tamanho; 2 dobra; 0,5 reduz à metade. O centroide é mantido.',
    ok:n=>{document.getElementById('edPfat').value=n;edTransform('escalar');}});
}
function edAbreSimplificar(){
  return window.GeoMineSimplify.open();
}
function edAbreSuavizar(){
  return window.GeoMineSmooth.open();
}

function edApagarVertice(){
  if(!edPrecisa()) return;
  const {L,f}=ED.sel; if(L.gtype==='point'){ toast('Ponto: use “apagar feição”'); return; }
  const rings=edRings(L,f); const r=rings[ED.ring];
  if(ED.vi<0){ toast('Marque um vértice'); return; }
  const min=edFechado(L)?4:3;
  if(r.length<min){ toast('Poucos vértices — apague a feição inteira'); return; }
  edSnapshot('apagar vértice');
  r.splice(ED.vi,1); ED.vi=Math.max(0,ED.vi-1);
  edAplicar(rings,'Vértice apagado');
}
function edDeltaZ(inteira){
  if(!edPrecisa()) return;
  const dz=edParam('edPdz',1); const {L,f}=ED.sel; const rings=edRings(L,f);
  edSnapshot('Δz');
  const aplica=p=>{ if(p.length<3){ const z=(typeof zAt==='function')? zAt(p[0],p[1]) : 0; p[2]=(isFinite(z)?z:0); } p[2]+=dz; };
  if(inteira) rings.forEach(r=>r.forEach(aplica));
  else { if(ED.vi<0){ toast('Marque um vértice'); return; } aplica(rings[ED.ring][ED.vi]); }
  edAplicar(rings, (inteira?'Feição':'Vértice')+' deslocado em '+dz.toFixed(2)+' m');
}
function edCotaTerreno(){
  if(!edPrecisa()) return;
  if(typeof zAt!=='function'){ toast('Sem MDT carregado'); return; }
  const {L,f}=ED.sel; const rings=edRings(L,f);
  edSnapshot('cota do terreno');
  let n=0;
  rings.forEach(r=>r.forEach(p=>{ const z=zAt(p[0],p[1]); if(isFinite(z)){ p[2]=z; n++; } }));
  edAplicar(rings, n+' vértice(s) com cota do terreno');
}
function edApagarFeicao(){
  if(!edPrecisa()) return;
  const {L,idx,f}=ED.sel;
  if(!confirm('Apagar esta feição de "'+L.name+'"?')) return;
  undoPush({t:'featdel', L:L, feat:f, idx:idx});
  L.features.splice(idx,1);
  ED.sel=null; S.selFeat=null;
  drawLayer(L); edRedraw(); refreshUI(); edPainelSync();
  toast('Feição apagada');
}
function edFechar(){
  /* FECHAR = emendar o último vértice ao primeiro, NA MESMA linha e camada.
     A versão antiga apagava a linha e criava uma camada nova de polígono —
     o usuário só queria o contorno fechado. Quem quiser polígono de verdade
     usa Linha → Polígono (comando próprio, se existir) ou exporta. */
  if(!edPrecisa()) return;
  const {L,f}=ED.sel;
  if(L.gtype!=='line'){ toast('Só para linhas'); return; }
  const rings=edRings(L,f), r=rings[ED.ring||0]||rings[0];
  if(!r||r.length<3){ toast('Precisa de 3 vértices'); return; }
  const dx=r[0][0]-r[r.length-1][0], dy=r[0][1]-r[r.length-1][1];
  if(Math.hypot(dx,dy)<1e-7){ toast('A linha já está fechada'); return; }
  edSnapshot('fechar');
  r.push(r[0].slice());
  edSetRings(L,f,rings);
  if(Array.isArray(f.zg)&&!f.multi&&f.zg.length===r.length-1)f.zg.push(f.zg[0]);
  edRecalcGeom(L,f);
  drawLayer(L); edRedraw(); refreshUI();
  toast('Linha fechada — contorno emendado no primeiro vértice');
}
function edAbrir(){
  if(!edPrecisa()) return;
  const {L,f}=ED.sel;
  if(L.gtype!=='polygon'){ toast('Só para polígonos'); return; }
  const rings=edRings(L,f);
  const dest=addLayer({name:L.name+' (aberto)', gtype:'line', crs:L.crs,
    features:[], fields:(L.fields||[]).slice(), color:L.color});
  const nf={geom:rings.length>1?rings:rings[0], multi:rings.length>1,
            props:Object.assign({},f.props||{}), _origemPol:L.id};
  dest.features.push(nf);
  undoPush({t:'featdel', L:L, feat:f, idx:ED.sel.idx});
  L.features.splice(ED.sel.idx,1);
  drawLayer(L); drawLayer(dest);
  edSelecionar({L:dest, idx:dest.features.length-1, f:nf});
  refreshUI(); toast('Polígono aberto em linha — feche depois para devolver à camada de origem');
}
function edInverter(){
  if(!edPrecisa()) return;
  const {L,f}=ED.sel; const rings=edRings(L,f);
  edSnapshot('inverter');
  rings.forEach(r=>r.reverse());
  edAplicar(rings,'Sentido invertido');
}
function edExplodir(){
  if(!edPrecisa()) return;
  const {L,idx,f}=ED.sel; const rings=edRings(L,f);
  if(rings.length<2){ toast('Feição tem um anel só'); return; }
  undoPush({t:'featdel', L:L, feat:f, idx:idx});
  L.features.splice(idx,1);
  rings.forEach(r=>L.features.push({geom:r, multi:false, props:Object.assign({},f.props||{})}));
  ED.sel=null; S.selFeat=null;
  drawLayer(L); edRedraw(); refreshUI(); edPainelSync();
  toast(rings.length+' feições separadas');
}
function edApagarSegmento(){
  if(!edPrecisa()) return;
  const {L,f}=ED.sel;
  if(L.gtype==='point'){ toast('Não se aplica a ponto'); return; }
  if(ED.vi<0){ toast('Marque o vértice inicial do segmento'); return; }
  const rings=edRings(L,f); const r=rings[ED.ring];
  if(L.gtype==='polygon'){ toast('Polígono: use “apagar trecho” (mantém fechado)'); return; }
  if(ED.vi===0 || ED.vi===r.length-1){        // ponta: só remove o vértice
    edSnapshot('apagar segmento'); r.splice(ED.vi,1); ED.vi=Math.max(0,ED.vi-1);
    edAplicar(rings,'Segmento da ponta removido'); return;
  }
  // meio: parte em duas feições
  edSnapshot('apagar segmento');
  const a=r.slice(0,ED.vi+1), b=r.slice(ED.vi+1);
  rings[ED.ring]=a;
  L.features.push({geom:b, multi:false, props:Object.assign({},f.props||{})});
  edAplicar(rings,'Segmento apagado — linha partida em duas');
}
function edEhDrenagem(L){ return L && L.gtype==='line' && /^Drenagem — /.test(L.name||''); }
/* recalcula os atributos geométricos (comprimento, cotas, declividade, zg) de
   uma feição de drenagem após uma edição que muda a geometria (quebra/união). */
function edRecalcGeom(L, f){
  if(edEhDrenagem(L) && typeof drenAplicaGeom==='function'){
    try{ drenAplicaGeom(L, f); }catch(e){}
  }
}
function edQuebrar(){
  /* QUEBRA ESTILO CAD, em dois cliques: 2× no MESMO vértice = uma quebra
     única (anel fechado abre ali; linha aberta divide em 2); dois vértices
     DIFERENTES = quebra nos dois (anel vira 2 linhas abertas — cada uma
     pode ser fechada depois com o comando Fechar). A versão antiga quebrava
     no vértice selecionado e, num anel, a costura primeiro/último agia como
     segunda quebra não pedida. */
  if(!edPrecisa()) return;
  const {L}=ED.sel;
  if(L.gtype!=='line'){ toast('Só para linhas'); return; }
  window.GeoMineDragMove?.cancel(); ED.pend={cmd:'quebrar2', pts:[]};
  toast('Quebrar: toque no 1º ponto da linha (2× no mesmo ponto = quebra única)');
}
function edPontoNaLinhaNoToque(latlng){
  try{
    const sel=ED.sel; if(!sel)return null;
    const {L,f}=sel;
    const c=fromWGS(L.crs,latlng.lng,latlng.lat);
    const rings=edRings(L,f);
    const tolPx=S.touch?18:12;
    const p0=map.latLngToContainerPoint(latlng),
      pl=map.containerPointToLatLng([p0.x+tolPx,p0.y]),
      c1=fromWGS(L.crs,pl.lng,pl.lat),
      tol=Math.hypot(c1[0]-c[0],c1[1]-c[1]);
    let best=null;
    rings.forEach((r,ri)=>{
      for(let i=0;i<r.length-1;i++){
        const A=r[i],B=r[i+1],dx=B[0]-A[0],dy=B[1]-A[1],den=dx*dx+dy*dy;
        let t=den?((c[0]-A[0])*dx+(c[1]-A[1])*dy)/den:0;t=Math.max(0,Math.min(1,t));
        const q=[A[0]+dx*t,A[1]+dy*t],d=Math.hypot(q[0]-c[0],q[1]-c[1]);
        if(!best||d<best.d)best={d,ri,i,t,pt:q};
      }
    });
    return best&&best.d<=tol?best:null;
  }catch(e){ return null; }
}
/* garante um VÉRTICE exatamente no ponto tocado: usa o existente quando o
   toque cai em cima dele; senão insere o ponto no segmento (interpolando a
   cota, se houver). Devolve o índice do vértice. */
function edGaranteVertice(b){
  const {L,f}=ED.sel, rings=edRings(L,f), r=rings[b.ri];
  const EPS=1e-6;
  if(b.t<=EPS)return b.i;
  if(b.t>=1-EPS)return b.i+1;
  r.splice(b.i+1,0,[b.pt[0],b.pt[1]]);
  edSetRings(L,f,rings);
  if(Array.isArray(f.zg)&&!f.multi&&f.zg.length===r.length-1){
    const za=+f.zg[b.i],zb=+f.zg[b.i+1];
    const z=(Number.isFinite(za)&&Number.isFinite(zb))?za+(zb-za)*b.t:
      (Number.isFinite(za)?za:zb);
    f.zg.splice(b.i+1,0,z);
  }
  return b.i+1;
}
function edQuebrarEm(b1,b2){
  const {L,f}=ED.sel;
  if(b1.ri!==b2.ri){ toast('Os dois pontos devem estar na mesma linha/anel'); return; }
  edSnapshot('quebrar');
  /* ordena pela posição ao longo da linha e garante um vértice em cada
     ponto tocado (toque no meio do segmento insere o vértice ali) */
  const pos=b=>b.i+Math.min(Math.max(b.t,0),1);
  let first=b1,second=b2;
  if(pos(b1)>pos(b2)){first=b2;second=b1;}
  const interior=b=>b.t>1e-6&&b.t<1-1e-6;
  let vi2=edGaranteVertice(second);
  if(interior(second)&&first.i===second.i&&second.t>1e-9)
    first={...first,t:Math.min(1,first.t/second.t)};
  let vi1=edGaranteVertice(first);
  if(interior(first)&&vi1<=vi2)vi2+=1;
  const rings=edRings(L,f), r=rings[b1.ri];
  const fech=r.length>3&&Math.hypot(r[0][0]-r[r.length-1][0],r[0][1]-r[r.length-1][1])<1e-7;
  const m=fech?r.length-1:r.length;
  const norm=vi=>fech?((vi%m)+m)%m:Math.max(0,Math.min(r.length-1,vi));
  let a=norm(vi1),b=norm(vi2);
  const partes=[];
  if(fech){
    if(a===b){
      const seq=[];
      for(let k=0;k<=m;k++)seq.push(r[norm(a+k)].slice());
      partes.push(seq);
    }else{
      const arco=(i0,i1)=>{const q=[];let k=i0;
        while(true){q.push(r[norm(k)].slice());if(norm(k)===norm(i1))break;k++;}
        return q;};
      partes.push(arco(a,b),arco(b,a));
    }
  }else{
    if(a===b){
      if(a<=0||a>=m-1){ toast('Numa linha aberta, escolha um ponto do meio'); return; }
      partes.push(r.slice(0,a+1),r.slice(a));
    }else{
      let i0=Math.min(a,b),i1=Math.max(a,b);
      if(i0<=0&&i1>=m-1){ toast('Escolha pontos do meio da linha'); return; }
      if(i0<=0)partes.push(r.slice(0,i1+1),r.slice(i1));
      else if(i1>=m-1)partes.push(r.slice(0,i0+1),r.slice(i0));
      else partes.push(r.slice(0,i0+1),r.slice(i0,i1+1),r.slice(i1));
    }
  }
  rings[b1.ri]=partes[0];
  edSetRings(L,f,rings);
  /* cotas acompanham o recorte quando a feição tem zg simples */
  const zgTot=(Array.isArray(f.zg)&&!f.multi)?f.zg.slice():null;
  const fatiaZg=(ini,fim)=>zgTot?zgTot.slice(ini,fim):null;
  const novas=[];
  for(let k=1;k<partes.length;k++){
    const props2=Object.assign({},f.props||{});
    if(edEhDrenagem(L)&&props2.NOME){
      const base=String(props2.NOME).replace(/\s+·\s+T\d+$/,'');
      try{ props2.NOME=drenNomeUnico(L, base+' · T'+drenProxTrecho(L, base), (f.props&&f.props.TIPO)||base); }catch(e){}
    }
    const nf={geom:partes[k], multi:false, props:props2};
    L.features.push(nf); novas.push(nf);
  }
  if(zgTot&&!fech){
    /* mapeia os índices originais das fatias abertas */
    if(partes.length===2){
      const cut=partes[0].length-1;
      f.zg=zgTot.slice(0,cut+1);
      if(novas[0])novas[0].zg=zgTot.slice(cut);
    }else if(partes.length===3){
      const c1=partes[0].length-1,c2=c1+partes[1].length-1;
      f.zg=zgTot.slice(0,c1+1);
      if(novas[0])novas[0].zg=zgTot.slice(c1,c2+1);
      if(novas[1])novas[1].zg=zgTot.slice(c2);
    }
  }
  edRecalcGeom(L,f); novas.forEach(nf=>edRecalcGeom(L,nf));
  drawLayer(L); edRedraw(); refreshUI();
  try{ if(typeof openAttr==='function' && document.getElementById('attrPanel') &&
        document.getElementById('attrPanel').classList.contains('open')) openAttr(); }catch(e){}
  toast(partes.length===1?'Anel aberto no ponto indicado':
    'Linha quebrada em '+partes.length+' parte(s)');
}
function edUnir(){
  return window.GeoMineLineJoin.start();
}
function edUnirCom(alvo){
  return window.GeoMineLineJoin.complete(alvo);
}
function edEstender(){
  if(!edPrecisa()) return;
  const {L}=ED.sel;
  if(L.gtype!=='line'){ toast('Só para linhas'); return; }
  window.GeoMineDragMove?.cancel(); ED.pend={cmd:'estender', pts:[]};
  toast('Toque onde a linha deve continuar (segue pela ponta mais próxima)');
}
function edTrecho(){
  if(!edPrecisa()) return;
  const {L}=ED.sel;
  if(L.gtype!=='polygon'){ toast('Só para polígonos'); return; }
  window.GeoMineDragMove?.cancel(); ED.pend={cmd:'trecho', pts:[]};
  toast('Toque nos DOIS pontos do contorno que limitam o trecho a remover');
}
function edAbreTrecho(){
  if(!edPrecisa())return;
  if(ED.sel.L.gtype!=='polygon'){toast('Só para polígonos');return;}
  let bg=document.getElementById('edTrechoModal');
  if(!bg){
    bg=document.createElement('div');bg.id='edTrechoModal';bg.className='modal-bg';
    bg.innerHTML=`<div class="modal" style="width:min(470px,94vw)">
      <div class="modal-h"><b>Apagar trecho do contorno</b><div style="flex:1"></div>
        <button class="tbtn" id="edTrechoX">✕</button></div>
      <div class="modal-b">
        <label class="field">Trecho a remover entre os dois pontos</label>
        <select id="edTrechoLado">
          <option value="menor">Trecho de menor comprimento</option>
          <option value="maior">Trecho de maior comprimento</option>
        </select>
        <div class="hint">Depois de confirmar, indique dois pontos no contorno. O polígono permanecerá fechado.</div>
        <button class="tbtn" id="edTrechoOk" style="width:100%;justify-content:center;margin-top:12px;background:var(--amber);color:#1a1206;font-weight:700">Indicar pontos no mapa</button>
      </div></div>`;
    document.body.appendChild(bg);
    document.getElementById('edTrechoX').onclick=()=>bg.classList.remove('on');
    document.getElementById('edTrechoOk').onclick=()=>{
      const maior=document.getElementById('edTrechoLado').value==='maior',
        chk=document.getElementById('edPmaior');
      if(chk)chk.checked=maior;
      bg.classList.remove('on');edTrecho();
    };
  }
  document.getElementById('edTrechoLado').value='menor';
  bg.classList.add('on');
}
/* ============================================================================
   ABAS CONTEXTUAIS DO EDITOR
   Alguns comandos (paralela, buffer) precisam de opções antes de agir. Em vez
   de campos escondidos numa paleta, cada um abre uma ABA temporária na ribbon,
   com botões grandes. Escolhida a opção, a aba se fecha e volta ao EDITOR.
   edAbreCtx(id,nome,grupos) injeta e ativa a aba; edFechaCtx() a remove.
   ========================================================================== */
function edFechaCtx(){
  if(typeof CATS==='undefined') return;
  const i=CATS.findIndex(c=>c.id==='ed_ctx');
  if(i>=0) CATS.splice(i,1);
  ED._ctx=null;
  if(RIB_CAT_ATUAL==='ed_ctx') RIB_CAT_ATUAL='editor';
}
function edAbreCtx(id, nome, grupos){
  if(typeof CATS==='undefined') return;
  edFechaCtx();                                   // só uma aba contextual por vez
  ED._ctx=id;
  const pos=CATS.findIndex(c=>c.id==='editor');
  CATS.splice(pos>=0?pos+1:1, 0, {id:'ed_ctx', nome:nome, view:'map', _ctx:true, grupos});
  RIB_CAT_ATUAL='ed_ctx';
  if(typeof switchView==='function') switchView('map');
  if(typeof ribbonBuild==='function') ribbonBuild();
  toast('Escolha uma opção na aba "'+nome+'"');
}
/* botão grande de opção para as abas contextuais */
function edCtxBtn(ic, nome, fn){ return {ic:ic, nome:nome, act:()=>{ try{ fn(); }catch(e){ toast('Falha: '+(e&&e.message||e)); } }}; }

/* ---------- ABA CONTEXTUAL: PARALELA ---------- */
function edCtxParalela(){
  if(!edPrecisa()) return;
  const d0 = ED._distUlt || 5;
  edAbreCtx('paralela','Paralela', [
    {label:'Distância', it:[
      edCtxBtn('ed_parale','Definir distância…', ()=>{
        const v=prompt('Distância da paralela (m):', String(ED._distUlt||5));
        if(v===null) return;
        const d=parseFloat(String(v).replace(',','.'));
        if(!(d>0)){ toast('Distância inválida'); return; }
        ED._distUlt=d; toast('Distância: '+d+' m — agora escolha o lado');
      }),
    ]},
    {label:'Lado', it:[
      edCtxBtn('ed_parale','Esquerdo', ()=>edFazParalela(+1)),
      edCtxBtn('ed_parale','Direito',  ()=>edFazParalela(-1)),
      edCtxBtn('ed_offset2','Ambos os lados', ()=>edFazOffset2()),
      edCtxBtn('ed_sel','Escolher no mapa', ()=>edArmaParalelaClique()),
    ]},
    {label:'', it:[ edCtxBtn('ed_abrir','Cancelar', ()=>{ edFechaCtx(); ribbonBuild(); }) ]},
  ]);
}
function edDist(){ return ED._distUlt||5; }
function edAbreParalela(modoInicial){
  if(!edPrecisa())return;
  let bg=document.getElementById('edParModal');
  if(!bg){
    bg=document.createElement('div');bg.id='edParModal';bg.className='modal-bg';
    bg.innerHTML=`<div class="modal" style="width:min(500px,94vw)">
      <div class="modal-h"><b>Paralela / Offset</b><div style="flex:1"></div>
        <button class="tbtn" id="edParX">✕</button></div>
      <div class="modal-b">
        <label class="field">Distância perpendicular (m)</label>
        <input type="number" id="edParDist" min="0.001" step="0.1" value="5">
        <label class="field">Lado da feição</label>
        <select id="edParLado">
          <option value="mapa">Escolher o lado tocando no mapa</option>
          <option value="esquerda">Esquerdo, conforme o sentido da linha</option>
          <option value="direita">Direito, conforme o sentido da linha</option>
          <option value="ambos">Ambos os lados</option>
        </select>
        <div class="hint">A linha original é preservada. O resultado é criado como nova feição na mesma camada.</div>
        <button class="tbtn" id="edParOk" style="width:100%;justify-content:center;margin-top:12px;background:var(--amber);color:#1a1206;font-weight:700">Criar paralela</button>
      </div></div>`;
    document.body.appendChild(bg);
    document.getElementById('edParX').onclick=()=>bg.classList.remove('on');
    document.getElementById('edParOk').onclick=()=>{
      const d=+document.getElementById('edParDist').value,
        lado=document.getElementById('edParLado').value;
      if(!(d>0)){toast('Distância inválida');return;}
      ED._distUlt=d;const ep=document.getElementById('edPdist');if(ep)ep.value=d;
      bg.classList.remove('on');
      if(lado==='ambos')edFazOffset2();
      else if(lado==='esquerda')edFazParalela(+1);
      else if(lado==='direita')edFazParalela(-1);
      else edArmaParalelaClique();
    };
  }
  document.getElementById('edParDist').value=edDist();
  document.getElementById('edParLado').value=modoInicial==='offset2'?'ambos':'mapa';
  bg.classList.add('on');
}
function edFazParalela(lado){
  if(!edPrecisa()) return;
  const {L,f}=ED.sel; const rings=edRings(L,f); const d=edDist();
  edSnapshot('paralela');
  const novo=rings.map(r=>edOffset(r, lado*d, edFechado(L)));
  const nf={geom:novo.length>1?novo:novo[0], multi:novo.length>1, props:Object.assign({},f.props||{})};
  L.features.push(nf); undoPush({t:'feat', L:L, feat:nf});
  drawLayer(L); refreshUI(); edSelecionar({L:L, idx:L.features.length-1, f:nf});
  toast('Paralela a '+d+' m ('+(lado>0?'esquerda':'direita')+') criada');
  edFechaCtx(); ribbonBuild();
}
function edFazOffset2(){
  if(!edPrecisa()) return;
  const {L,f}=ED.sel; const rings=edRings(L,f); const d=edDist();
  edSnapshot('offset 2 lados');
  [+1,-1].forEach(sinal=>{
    const novo=rings.map(r=>edOffset(r, sinal*d, edFechado(L)));
    const nf={geom:novo.length>1?novo:novo[0], multi:novo.length>1, props:Object.assign({},f.props||{})};
    L.features.push(nf); undoPush({t:'feat', L:L, feat:nf});
  });
  drawLayer(L); refreshUI();
  toast('2 paralelas a '+d+' m (ambos os lados) criadas');
  edFechaCtx(); ribbonBuild();
}
function edArmaParalelaClique(){
  if(!edPrecisa()) return;
  window.GeoMineDragMove?.cancel(); ED.pend={cmd:'paralela', pts:[], dist:edDist()};
  edFechaCtx(); ribbonBuild();
  toast('Toque no lado onde a paralela (a '+edDist()+' m) deve ficar');
}

function edAzimuteAtual(rings){
  let best=null,bd=-1;
  for(const r of rings)for(let i=0;i<r.length-1;i++){
    const dx=r[i+1][0]-r[i][0],dy=r[i+1][1]-r[i][1],d=dx*dx+dy*dy;
    if(d>bd){bd=d;best=[dx,dy];}
  }
  return best?(Math.atan2(best[0],best[1])*180/Math.PI+360)%360:0;
}
function edAbreGirar(){
  /* várias feições selecionadas (ou partes): giram juntas, em torno do centro do conjunto */
  const grupo=!!window.GeoMineMouseRotation?.isGroup?.();
  if(!grupo&&!edPrecisa())return;
  const rings=grupo?[]:edRings(ED.sel.L,ED.sel.f),az=grupo?null:edAzimuteAtual(rings);
  let bg=document.getElementById('edGirModal');
  if(!bg){
    bg=document.createElement('div');bg.id='edGirModal';bg.className='modal-bg';
    bg.innerHTML=`<div class="modal" style="width:min(500px,94vw)">
      <div class="modal-h"><b>Girar feição</b><div style="flex:1"></div>
        <button class="tbtn" id="edGirX">✕</button></div>
      <div class="modal-b">
        <div class="hout" id="edGirAtual"></div>
        <label class="field">Modo</label>
        <select id="edGirModo">
          <option value="mouse">Com o mouse — em torno do centroide</option>
          <option value="mouse-point">Com o mouse — escolher o centro</option>
          <option value="livre">Livre — indicar direção no mapa</option>
          <option value="angulo">Em torno do centroide — ângulo em graus</option>
          <option value="azimute">Orientar para azimute absoluto</option>
        </select>
        <div id="edGirNumero">
          <label class="field" id="edGirRot">Ângulo de rotação (°)</label>
          <input type="number" id="edGirVal" value="15" step="1">
        </div>
        <div class="hint" id="edGirHint">Após confirmar, toque no mapa na direção desejada a partir do centro da feição.</div>
        <button class="tbtn" id="edGirOk" style="width:100%;justify-content:center;margin-top:12px;background:var(--amber);color:#1a1206;font-weight:700">Continuar</button>
      </div></div>`;
    document.body.appendChild(bg);
    document.getElementById('edGirX').onclick=()=>bg.classList.remove('on');
    const muda=()=>{
      const m=document.getElementById('edGirModo').value;
      document.getElementById('edGirNumero').style.display=(m==='livre'||m==='mouse'||m==='mouse-point')?'none':'block';
      document.getElementById('edGirRot').textContent=m==='azimute'?'Azimute de destino (0–360°)':'Ângulo de rotação (°)';
      document.getElementById('edGirHint').textContent=m==='mouse'?'O centroide é marcado automaticamente. Mova o mouse e clique para confirmar, como no CAD. R define uma referência; Shift restringe a 15°; Esc cancela.':m==='mouse-point'?'Clique no ponto-base, mova o mouse e clique para confirmar. R define uma referência; Shift restringe a 15°; Esc cancela.':m==='livre'
        ?'Após confirmar, toque no mapa na direção desejada a partir do centro da feição.'
        :m==='azimute'?'O azimute é medido a partir do Norte, no sentido horário. A referência é o segmento mais longo da feição.':'Valor positivo gira no sentido anti-horário; negativo, no horário.';
    };
    document.getElementById('edGirModo').onchange=muda;
    document.getElementById('edGirOk').onclick=()=>{
      const m=document.getElementById('edGirModo').value,v=+document.getElementById('edGirVal').value;
      if(m!=='livre'&&m!=='mouse'&&m!=='mouse-point'&&!isFinite(v)){toast('Ângulo inválido');return;}
      bg.classList.remove('on');
      if(m==='mouse'||m==='mouse-point'){window.GeoMineMouseRotation.start({pivot:m==='mouse'?'centroid':'point'});return;}
      if(window.GeoMineMouseRotation?.isGroup?.()){
        // conjunto: "livre" vira o giro com o mouse; ângulo e azimute aplicam direto
        if(m==='livre'){window.GeoMineMouseRotation.start({pivot:'centroid'});return;}
        window.GeoMineMouseRotation.rotateSelection(m==='azimute'?0:v,m==='azimute'?{azimute:v}:{});return;
      }
      const rings=edRings(ED.sel.L,ED.sel.f),c=window.GeoMineMouseRotation.centroid(rings,ED.sel.L.gtype),az0=edAzimuteAtual(rings);
      if(m==='livre'){
        window.GeoMineDragMove?.cancel(); ED.pend={cmd:'girarLivre',pts:[],center:c,az0};
        toast('Toque na direção final desejada a partir do centro da feição');return;
      }
      const g=m==='azimute'?((((v%360)+360)%360-az0+540)%360-180):v;
      const ep=document.getElementById('edPang');if(ep)ep.value=g;
      edSnapshot('girar');edAplicar(edGirar(rings,c,g),
        m==='azimute'?`Orientado ao azimute ${((v%360)+360)%360}°`:`Girado ${g}°`);
    };
  }
  const nSel=grupo?(window.GeoMineDragMove?.conjunto()||[]).length:0;
  document.getElementById('edGirAtual').innerHTML=grupo
    ?(nSel>1?`<b>${nSel} feições/partes selecionadas</b> giram juntas, em torno do centro do conjunto.`:'A feição selecionada gira em torno do seu centro.')
    :`Azimute atual de referência: <b>${az.toFixed(2)}°</b>`;
  document.getElementById('edGirVal').value=edParam('edPang',15);
  document.getElementById('edGirModo').value='mouse';
  document.getElementById('edGirModo').dispatchEvent(new Event('change'));
  bg.classList.add('on');
}
function edTransform(cmd){
  /* Mover é por arrasto e aceita a seleção inteira (simples ou múltipla):
     o módulo modules/cad/drag-move.js resolve o conjunto e arma o comando. */
  if(cmd==='mover'&&window.GeoMineDragMove){GeoMineDragMove.arm();return;}
  window.GeoMineDragMove?.cancel();          // outro comando toma o lugar do Mover armado
  // Girar também aceita a seleção múltipla: a própria janela decide
  if(cmd==='girar'){edAbreGirar();return;}
  if(!edPrecisa()) return;
  const {L,f}=ED.sel; const rings=edRings(L,f);
  const c=edCentroide(rings);
  if(cmd==='girar'){edAbreGirar();return;}
  if(cmd==='escalar'){ const k=edParam('edPfat',1.1);
    if(!(k>0)){ toast('Fator inválido'); return; }
    edSnapshot('escalar'); edAplicar(edEscalar(rings,c,k), 'Escalado '+k+'×'); return; }
  if(cmd==='mover' || cmd==='copiar'){
    ED.pend={cmd:cmd, pts:[]};
    toast('Toque no ponto BASE e depois no DESTINO'); return; }
  if(cmd==='espelhar'){ ED.pend={cmd:'espelhar', pts:[]};
    toast('Toque nos dois pontos do EIXO de espelhamento'); return; }
  if(cmd==='paralela'){edAbreParalela('paralela');return;}
  if(cmd==='offset2'){edAbreParalela('offset2');return;}
}
/* ---------- BUFFER (faixa/zona a uma distância, resultado em polígono) ---------- */
/* ============================================================================
   EXTRAIR LIMITE (CONTORNO EXATO) DO RASTER/ORTOFOTO
   Traça o polígono que segue a BORDA REAL do dado válido — não um retângulo,
   mas o contorno exato onde há pixels (excluindo as áreas de nodata). Serve de
   PARÂMETRO DE REFERÊNCIA: se o raster deslocar no futuro, compara-se o
   contorno atual com este para medir o deslocamento.
   ========================================================================== */
/* contorno da máscara de dado válido de uma grade, respeitando csx E csy
   (marching squares no nível 0.5 de uma grade 0/1 com moldura de zeros). */
function limiteContornoGrade(d){
  const nc=d.nc, nr=d.nr, z=d.z, cs=d.cs, csy=(d.csy||d.cs), xll=d.xll, yll=d.yll;
  // grade booleana com moldura: 1 = dado válido, 0 = nodata/fora
  const NC=nc+2, NR=nr+2;
  const m=new Float32Array(NC*NR);                 // já zerada (moldura de 0)
  for(let r=0;r<nr;r++) for(let c=0;c<nc;c++){
    const v=z[r*nc+c];
    m[(r+1)*NC+(c+1)] = (v==null||!isFinite(v))?0:1;
  }
  // ponto do centro de célula da grade COM moldura, no CRS de trabalho
  const PX=(r,c)=>[ xll+(c-1+0.5)*cs, yll+(nr-1-(r-1)+0.5)*csy ];
  const lerp=(p1,p2,v1,v2)=>{ const t=(0.5-v1)/(v2-v1);
    return [p1[0]+t*(p2[0]-p1[0]), p1[1]+t*(p2[1]-p1[1])]; };
  const segs=[];
  for(let r=0;r<NR-1;r++) for(let c=0;c<NC-1;c++){
    const v=[m[r*NC+c], m[r*NC+c+1], m[(r+1)*NC+c+1], m[(r+1)*NC+c]];
    const p=[PX(r,c),PX(r,c+1),PX(r+1,c+1),PX(r+1,c)];
    const pts=[];
    for(let e=0;e<4;e++){ const a=e,b=(e+1)%4;
      if((v[a]<0.5)!==(v[b]<0.5)) pts.push(lerp(p[a],p[b],v[a],v[b])); }
    if(pts.length===2) segs.push(pts);
    else if(pts.length===4){ segs.push([pts[0],pts[1]]); segs.push([pts[2],pts[3]]); }
  }
  if(!segs.length) return [];
  // costura os segmentos em anéis
  const key=q=>q[0].toFixed(2)+','+q[1].toFixed(2);
  const idx=new Map();
  segs.forEach((s,i)=>{ [0,1].forEach(e=>{ const k=key(s[e]);
    if(!idx.has(k)) idx.set(k,[]); idx.get(k).push([i,e]); }); });
  const used=new Array(segs.length).fill(false); const lines=[];
  for(let i=0;i<segs.length;i++){
    if(used[i]) continue; used[i]=true;
    let line=[segs[i][0].slice(), segs[i][1].slice()];
    for(let dir=0;dir<2;dir++){
      let guard=segs.length+2;
      while(guard-->0){ const tip=line[line.length-1];
        const cand=(idx.get(key(tip))||[]).find(([j])=>!used[j]);
        if(!cand) break;
        const [j,e]=cand; used[j]=true; line.push(segs[j][1-e].slice());
      }
      line.reverse();
    }
    if(line.length>=3){
      const a=line[0], b=line[line.length-1];
      if(Math.abs(a[0]-b[0])>1e-6||Math.abs(a[1]-b[1])>1e-6) line.push(a.slice()); // fecha
      lines.push(line);
    }
  }
  return lines;
}
/* simplifica levemente (Douglas–Peucker) para não gerar milhares de vértices */
function limiteSimplifica(r, tol){
  if(r.length<4) return r;
  const dp=(pts)=>{
    if(pts.length<3) return pts;
    let dmax=0, idx=0; const a=pts[0], b=pts[pts.length-1];
    const dx=b[0]-a[0], dy=b[1]-a[1], L2=dx*dx+dy*dy||1;
    for(let i=1;i<pts.length-1;i++){ const p=pts[i];
      let t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L2; t=Math.max(0,Math.min(1,t));
      const d=Math.hypot(p[0]-(a[0]+t*dx), p[1]-(a[1]+t*dy));
      if(d>dmax){ dmax=d; idx=i; } }
    if(dmax>tol){ const l=dp(pts.slice(0,idx+1)), rr=dp(pts.slice(idx));
      return l.slice(0,-1).concat(rr); }
    return [a,b];
  };
  return dp(r);
}
function rasterLimite(){
  const fontes=[];
  (S.rasters||[]).forEach(r=>{ if(r&&r.d) fontes.push({tipo:'raster', nome:r.name||'MDT', r}); });
  if(S.img && S.img.b) fontes.push({tipo:'orto', nome:S.img.name||'Ortofoto', img:S.img});
  if(!fontes.length){ toast('Nenhum raster ou ortofoto carregado'); return; }

  const gerar=(lista)=>{
    const fields=[{name:'FID',type:'N',length:9,decimal:0},
      {name:'FONTE',type:'C',length:50},{name:'TIPO',type:'C',length:12},
      {name:'AREA_M2',type:'N',length:16,decimal:2},{name:'AREA_HA',type:'N',length:12,decimal:4},
      {name:'PERIM_M',type:'N',length:14,decimal:2},{name:'CS_X',type:'N',length:12,decimal:6},
      {name:'CS_Y',type:'N',length:12,decimal:6}];
    const feats=[]; let semGrade=0;
    lista.forEach((F,i)=>{
      let aneis=[], csx=0, csy=0;
      if(F.tipo==='raster'){
        let g=F.r.d;
        // grade nativa dá o contorno mais fiel; se muito grande, a de trabalho serve
        try{ if(typeof demFull==='function' && F.r.d && F.r.d._full===null && F.r.srcName) g=demFull(F.r)||F.r.d; }catch(e){}
        csx=g.cs; csy=(g.csy||g.cs);
        aneis=limiteContornoGrade(g);
        const tol=Math.min(csx,csy)*0.75;
        aneis=aneis.map(r=>limiteSimplifica(r,tol)).filter(r=>r.length>=4);
      } else {
        // ortofoto: sem a grade de pixels em memória (só o preview), usa o retângulo do extent
        const b=F.img.b; semGrade++;
        aneis=[[[b[0],b[1]],[b[0],b[3]],[b[2],b[3]],[b[2],b[1]],[b[0],b[1]]]];
        const W0=F.img._W0||0,H0=F.img._H0||0; csx=W0?(b[2]-b[0])/W0:0; csy=H0?(b[3]-b[1])/H0:0;
      }
      if(!aneis.length) return;
      // maior anel = contorno externo; demais = ilhas de nodata (buracos)
      aneis.sort((a,b)=>Math.abs(polyArea(b))-Math.abs(polyArea(a)));
      const geom = aneis.length>1 ? aneis : aneis[0];
      const A=Math.abs(polyArea(aneis[0]));
      let per=0; aneis.forEach(r=>{ for(let k=0;k<r.length-1;k++) per+=Math.hypot(r[k+1][0]-r[k][0], r[k+1][1]-r[k][1]); });
      feats.push({geom, multi:aneis.length>1, props:{
        FID:i+1, FONTE:String(F.nome).slice(0,50), TIPO:F.tipo==='orto'?'ortofoto':'raster',
        AREA_M2:+A.toFixed(2), AREA_HA:+(A/1e4).toFixed(4), PERIM_M:+per.toFixed(2),
        CS_X:+csx.toFixed(6), CS_Y:+csy.toFixed(6) }});
    });
    if(!feats.length){ toast('Não foi possível traçar o contorno'); return; }
    const nome = feats.length===1? ('Limite · '+String(feats[0].props.FONTE).slice(0,44)) : 'Limites dos rasters';
    const L=addLayer({name:nome.slice(0,60), gtype:'polygon', crs:S.workCRS, features:feats, fields, color:'#e05252'});
    if(L){ L.fill=0; L.weight=2; if(L.sym){ L.sym.fill=0; L.sym.weight=2; } drawLayer(L); }
    refreshUI();
    feats.forEach(f=>cmdLog('Limite '+f.props.FONTE+': '+f.props.AREA_HA+' ha · perím '+f.props.PERIM_M+' m · célula '+f.props.CS_X+'×'+f.props.CS_Y+' m','ok'));
    if(semGrade) toast('Contorno traçado. Ortofoto usou o retângulo (pixels não estão em memória) — recarregue o .tif p/ contorno exato dela.');
    else toast(feats.length+' limite(s) extraído(s) em "'+nome+'"');
  };

  if(fontes.length===1){ gerar(fontes); return; }
  let m=document.getElementById('rasLimModal');
  if(!m){
    m=document.createElement('div'); m.id='rasLimModal'; m.className='modal-bg';
    m.innerHTML='<div class="modal" style="width:min(440px,94vw)">'+
      '<div class="modal-h"><b>Extrair limite (contorno)</b><div style="flex:1"></div>'+
      '<button class="tbtn" id="rlX">✕</button></div>'+
      '<div class="modal-b"><label class="field">Escolha a fonte</label>'+
      '<div id="rlList" style="display:flex;flex-direction:column;gap:4px;margin-top:4px"></div>'+
      '<button class="tbtn" id="rlTodos" style="width:100%;justify-content:center;margin-top:12px;'+
      'background:var(--amber);color:#1a1206;font-weight:600">Extrair de TODOS</button></div></div>';
    document.body.appendChild(m);
  }
  const lista=document.getElementById('rlList'); lista.innerHTML='';
  fontes.forEach((F)=>{
    const b=document.createElement('button'); b.className='tbtn';
    b.style.cssText='width:100%;justify-content:flex-start;gap:8px';
    b.innerHTML=(F.tipo==='orto'?'🖼 ':'▦ ')+esc(F.nome);
    b.onclick=()=>{ m.classList.remove('on'); gerar([F]); };
    lista.appendChild(b);
  });
  document.getElementById('rlX').onclick=()=>m.classList.remove('on');
  document.getElementById('rlTodos').onclick=()=>{ m.classList.remove('on'); gerar(fontes); };
  m.classList.add('on');
}
function edBuffer(L, f, rings){
  const d=edParam('edPdist',5);
  const arred = !((document.getElementById('edPbufReto')||{}).checked);
  const nseg = Math.max(4, Math.round(edParam('edPbufSeg',12)));
  const dissolver = !!((document.getElementById('edPbufDiss')||{}).checked);
  buffizarFeicoes(L, [f], {d, arred, nseg, dissolver});
}
/* núcleo do buffer: gera polígonos de buffer para um conjunto de feições da
   camada L e cria (ou reusa) a camada "Buffer <L> <d> m". Reutilizado pelo
   editor (uma feição) e pela aba GIS (feição selecionada ou camada inteira).
   A geometria vem de bufferFeicaoMP (soma de Minkowski dissolvida) e sai
   sempre no CRS de trabalho — a camada de origem pode estar em graus. */
let bufferTaskJob=null;
window.GeoMineBufferTask={
  cancel(){if(!bufferTaskJob)return false;bufferTaskJob.controller.abort();return true;},
  get active(){return !!bufferTaskJob;}
};
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&window.GeoMineBufferTask.cancel()){e.preventDefault();e.stopImmediatePropagation();}
},true);
async function buffizarFeicoes(L, feats, opts){
  if(!opts.destination){GeoMineVectorDestination.choose(L,'polygon',false,destination=>buffizarFeicoes(L,feats,{...opts,destination}));return;}
  if(bufferTaskJob){toast('Um buffer já está em cálculo. Aguarde ou cancele pelo botão ×.');return;}
  const destination=opts.destination,resultCRS=S.workCRS;
  const d=+opts.d, arred=opts.arred!==false, nseg=Math.max(4,Math.round(opts.nseg||12)), dissolver=!!opts.dissolver;
  if(!(Math.abs(d)>0)){ toast('Informe uma distância diferente de zero'); return; }
  if(d<0 && L.gtype!=='polygon'){ toast('Distância negativa (recuo) só vale para polígonos'); return; }
  const criar=(fs, dissolvido, ptsPulados, falhas)=>{
    const nome=('Buffer '+(L.name||'feição')+' '+d+' m').slice(0,60);
    const fields=[{name:'FID',type:'N',length:9,decimal:0},
      {name:'ORIGEM',type:'C',length:40},{name:'DIST_M',type:'N',length:12,decimal:3},
      {name:'AREA_M2',type:'N',length:16,decimal:2},{name:'AREA_HA',type:'N',length:12,decimal:4}];
    const features=fs.map((rings2,i)=>{
      const A=rings2.reduce((sum,r,k)=>sum+(k?-1:1)*Math.abs(polyArea(r)),0);
      return {geom:rings2.length>1?rings2:rings2[0],multi:rings2.length>1,
        props:{FID:(destination.target?.features.length||0)+i+1,ORIGEM:(L.name||'').slice(0,40),DIST_M:d,AREA_M2:+A.toFixed(2),AREA_HA:+(A/1e4).toFixed(4)}};
    });
    const out=GeoMineVectorDestination.save(destination,{features,fields,crs:resultCRS,name:nome});
    const ocultos=typeof featureVisible==='function'?out.features.slice(-features.length).filter(f=>!featureVisible(out,f)).length:0;
    toast((dissolvido?'Buffer dissolvido':'Buffer')+' — '+fs.length+' polígono(s) em "'+out.name+'"'+
      (ptsPulados?' · '+ptsPulados+' ponto(s) sem coordenada válida':'')+
      (falhas?' · '+falhas+' feição(ões) sem geometria válida':'')+
      (ocultos?' · '+ocultos+' resultado(s) oculto(s) pelo filtro ou classificação desta camada':''));
    /* Coordenada não finita quase sempre é dado fora do fuso do projeto — vale
       dizer isso, e não deixar o número de polígonos menor sem explicação. */
    if(ptsPulados) try{ cmdLog('Buffer: '+ptsPulados+' ponto(s) descartado(s) por coordenada não finita '+
      '— confira se a camada está inteira dentro do fuso '+(CRS_LABELS[S.workCRS]||S.workCRS),'avisa'); }catch(e){}
    return out;
  };
  const controller=new AbortController(),sourceFeatures=L.features,target=destination.target,
    targetFeatures=target?.features,sourceRevision=L._rev,targetRevision=target?._rev,
    generation=window.GeoMineSessionAutosave?.state?.generation;
  const job={controller};bufferTaskJob=job;
  const current=()=>!controller.signal.aborted&&S.projectId===destination.project&&
    window.GeoMineSessionAutosave?.state?.generation===generation&&S.workCRS===resultCRS&&
    S.layers.includes(L)&&L.features===sourceFeatures&&L._rev===sourceRevision&&
    (!target||S.layers.includes(target)&&target.features===targetFeatures&&target._rev===targetRevision&&!target.locked);
  const check=()=>{
    if(!current())throw Object.assign(new Error('Buffer cancelado: a origem, o destino ou o projeto mudou.'),{name:'AbortError'});
    if(opts.selectionSnapshot)GeoMineCommandSelection.assertCurrent(opts.selectionSnapshot);
  };
  const timer=setInterval(()=>{if(!current())controller.abort();},200);
  let outcome='error',lastProgress=0;
  try{
    showLoad('Preparando buffer…');
    await new Promise(r=>setTimeout(r,0));check();GeoMineVectorDestination.current(destination);
    if(!window.GeoMineBufferWorker)throw Error('O módulo de cálculo do buffer não está disponível.');
    const result=await GeoMineBufferWorker.run({L,features:feats,d,arred,nseg,dissolver,workCRS:resultCRS,signal:controller.signal,
      onProgress:p=>{check();const total=p.total||feats.length,done=p.completed||0,now=performance.now();
        if(now-lastProgress<100&&done<total)return;lastProgress=now;
        showLoad(p.phase==='project'?'Preparando coordenadas do buffer…':p.phase==='dissolve'?'Dissolvendo buffers…':`Gerando buffer — ${done}/${total} feição(ões)…`);
        if(total>0&&p.phase==='buffer')window.GeoMineLoadProgress?.set(done/total);
      }});
    check();
    if(result.dissolveError)cmdLog('Falha ao dissolver: '+result.dissolveError+' — gerando polígonos separados.','avisa');
    if(!result.polis.length){toast('Não foi possível gerar o buffer'+(result.pulados?' · '+result.pulados+' ponto(s) sem coordenada válida':''));outcome='ok';return;}
    showLoad('Gravando buffer na camada de destino…');
    await new Promise(r=>setTimeout(r,0));check();
    const out=criar(result.polis,result.dissolvido,result.pulados,result.falhas);
    outcome='ok';return out;
  }catch(e){
    outcome=e.name==='AbortError'?'cancel':'error';
    const message=outcome==='cancel'?'Buffer cancelado. Nenhuma feição foi acrescentada.':'Buffer: '+e.message;
    toast(message);cmdLog(message,outcome==='cancel'?'avisa':'erro');
  }finally{
    clearInterval(timer);if(bufferTaskJob===job){bufferTaskJob=null;hideLoad(outcome);}
  }
}
/* Máscara do CLIP vetorial. Além de polígonos, aceita uma camada de linhas
   realmente fechadas. A linha continua sendo linha no projeto: ela só é
   interpretada como anel durante este cálculo. */
function clipLinhaFechada(r,f){
  if(!r||r.length<3)return false;
  const xs=r.map(p=>+p[0]).filter(Number.isFinite),
    ys=r.map(p=>+p[1]).filter(Number.isFinite);
  if(xs.length<3||ys.length<3)return false;
  const escala=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),1),
    a=r[0],b=r[r.length-1],fechada=Math.hypot(+a[0]-+b[0],+a[1]-+b[1])<=escala*1e-8,
    marca=!!(f&&(f.closed===true||f.fechada===true||
      /^(sim|true|1)$/i.test(String(f.props&&(f.props.FECHADA??f.props.Fechada??f.props.fechada)||''))));
  return fechada||marca;
}
function clipAneisMascara(L){
  const out=[];
  if(!L||(L.gtype!=='polygon'&&L.gtype!=='line'))return out;
  (L.features||[]).forEach(f=>{
    if(!f||!f.geom)return;
    const rs=Array.isArray(f.geom[0]&&f.geom[0][0])?f.geom:[f.geom];
    rs.forEach(r=>{
      if(!Array.isArray(r)||r.length<3||(L.gtype==='line'&&!clipLinhaFechada(r,f)))return;
      const q=r.map(p=>reproj(L.crs,S.workCRS,+p[0],+p[1]))
        .filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]));
      if(q.length<3)return;
      const a=q[0],b=q[q.length-1];
      if(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-9)q.push(a.slice());
      if(q.length>=4&&Math.abs(edArea(q))>1e-10)out.push(q);
    });
  });
  return out;
}
function clipCamadaTemMascara(L){
  if(!L)return false;
  if(L.gtype==='polygon')return true;
  if(L.gtype!=='line')return false;
  return (L.features||[]).some(f=>{
    if(!f||!f.geom)return false;
    const rs=Array.isArray(f.geom[0]&&f.geom[0][0])?f.geom:[f.geom];
    return rs.some(r=>clipLinhaFechada(r,f));
  });
}
function clipMascaraMP(L){
  if(L.gtype==='polygon')return layerToMP(L);
  /* Cada linha fechada é uma ilha independente. Sobreposição não inverte o
     interior: o teste abaixo usa união lógica (dentro de qualquer ilha). */
  return clipAneisMascara(L).map(r=>[r]);
}
function clipClasseConstrutiva(f){
  const p=f&&f.props||{},c=String(p.CLASSE||'').toLowerCase(),
    t=String(p.TIPO||'').toLowerCase();
  if(c==='rb31-crista'||/crista/.test(t))return 'rb31-crista';
  if(c==='rb31-pe'||/(^|\s)pé(\s|$)|pe de banco/.test(t))return 'rb31-pe';
  if(c==='rb31-inter'||c==='daylight'||/interse[cç][aã]o/.test(t))return 'rb31-inter';
  if(c==='rb31-rampa'||c==='rb31-eixo'||c==='rb31-inicio'||/rampa|eixo/.test(t))return 'rb31-rampa';
  return null;
}
function clipPontoNoMP(p,mp,bordas,eps){
  for(const s of bordas||[]){
    const a=s[0],b=s[1],dx=b[0]-a[0],dy=b[1]-a[1],dd=dx*dx+dy*dy,
      t=Math.max(0,Math.min(1,dd?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/dd:0));
    if(Math.hypot(p[0]-(a[0]+dx*t),p[1]-(a[1]+dy*t))<=eps*8)return true;
  }
  for(const poly of mp||[]){
    if(!poly||!poly[0]||!edInRing(p,poly[0]))continue;
    let furo=false;
    for(let i=1;i<poly.length;i++)if(edInRing(p,poly[i])){furo=true;break;}
    if(!furo)return true;
  }
  return false;
}
/* Recorta linhas segmento a segmento. Classificar o ponto médio de cada
   intervalo torna o resultado independente do sentido horário/anti-horário
   e funciona também nas reentrâncias de máscaras côncavas. */
function clipLinhasPeloMP(A,mp){
  const bordas=[];
  (mp||[]).forEach(poly=>(poly||[]).forEach(r=>{
    for(let i=1;i<r.length;i++)bordas.push([r[i-1],r[i]]);
  }));
  if(!bordas.length)return [];
  const xs=bordas.flatMap(s=>[s[0][0],s[1][0]]),ys=bordas.flatMap(s=>[s[0][1],s[1][1]]),
    escala=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),1),
    eps=escala*1e-10,out=[];
  const inter=(a,b,c,d)=>{
    const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],
      den=rx*sy-ry*sx,qx=c[0]-a[0],qy=c[1]-a[1];
    if(Math.abs(den)<=eps)return [];
    const t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
    return t>-eps&&t<1+eps&&u>-eps&&u<1+eps?[Math.max(0,Math.min(1,t))]:[];
  };
  (A.features||[]).forEach(f=>{
    if(!f||!f.geom)return;
    const nested=!!Array.isArray(f.geom[0]&&f.geom[0][0]),
      rs=nested?f.geom:[f.geom];
    rs.forEach((r,ri)=>{
      if(!r||r.length<2)return;
      const W=r.map(p=>{
        const q=reproj(A.crs,S.workCRS,+p[0],+p[1]);return [q[0],q[1]];
      }),zr=nested&&Array.isArray(f.zg&&f.zg[ri])?f.zg[ri]:f.zg,
        cota=Number.isFinite(+f.props?.COTA)?+f.props.COTA:NaN,
        zAt=i=>Number.isFinite(+zr?.[i])?+zr[i]:
          (Number.isFinite(+r[i]?.[2])?+r[i][2]:cota);
      let cur=[];
      const fecha=()=>{
        if(cur.length>1){
          const len=cur.slice(1).reduce((s,q,i)=>s+Math.hypot(q.p[0]-cur[i].p[0],q.p[1]-cur[i].p[1]),0);
          if(len>eps){
            const nf={geom:cur.map(q=>q.p),multi:false,props:{...(f.props||{})}};
            if(cur.some(q=>Number.isFinite(q.z)))nf.zg=cur.map(q=>Number.isFinite(q.z)?q.z:null);
            out.push(nf);
          }
        }
        cur=[];
      },add=(p,z)=>{
        const u=cur[cur.length-1];
        if(!u||Math.hypot(u.p[0]-p[0],u.p[1]-p[1])>eps*8)cur.push({p,z});
        else if(Number.isFinite(z))u.z=z;
      };
      for(let i=1;i<W.length;i++){
        const a=W[i-1],b=W[i],za=zAt(i-1),zb=zAt(i),ts=[0,1];
        for(const s of bordas)ts.push(...inter(a,b,s[0],s[1]));
        const us=[...new Set(ts.map(t=>+Math.max(0,Math.min(1,t)).toFixed(12)))].sort((x,y)=>x-y);
        for(let k=1;k<us.length;k++){
          const t0=us[k-1],t1=us[k];if(t1-t0<1e-12)continue;
          const tm=(t0+t1)/2,m=[a[0]+(b[0]-a[0])*tm,a[1]+(b[1]-a[1])*tm];
          if(!clipPontoNoMP(m,mp,bordas,eps)){fecha();continue;}
          const p0=[a[0]+(b[0]-a[0])*t0,a[1]+(b[1]-a[1])*t0],
            p1=[a[0]+(b[0]-a[0])*t1,a[1]+(b[1]-a[1])*t1],
            z0=Number.isFinite(za)&&Number.isFinite(zb)?za+(zb-za)*t0:(Number.isFinite(za)?za:zb),
            z1=Number.isFinite(za)&&Number.isFinite(zb)?za+(zb-za)*t1:(Number.isFinite(zb)?zb:za);
          add(p0,z0);add(p1,z1);
        }
      }
      fecha();
    });
  });
  return out;
}
/* ============================================================================
   OPERAÇÕES BOOLEANAS e CLIP vetorial
   ========================================================================== */
function gisBoolean(op){
  const ehClip = (op==='clip');
  if(ehClip) op='intersection';
  const polys=S.layers.filter(l=>l.gtype==='polygon');
  const fontes=ehClip?S.layers.filter(l=>l.gtype==='line'||l.gtype==='polygon'):polys,
    moldes=ehClip?S.layers.filter(clipCamadaTemMascara):polys;
  if(!fontes.length||!moldes.length||!fontes.some(a=>moldes.some(b=>a!==b))){
    toast(ehClip?'Escolha uma camada a recortar e uma máscara poligonal ou linha fechada':
      'São necessárias 2 camadas de polígono'); return;
  }
  let m=document.getElementById('boolModal');
  if(!m){
    m=document.createElement('div'); m.id='boolModal'; m.className='modal-bg';
    m.innerHTML='<div class="modal" style="width:min(460px,94vw)">'+
      '<div class="modal-h"><b id="boolTtl">Diferença</b><div style="flex:1"></div>'+
      '<button class="tbtn" id="boolX">✕</button></div>'+
      '<div class="modal-b">'+
      '<label class="field">Operação</label>'+
      '<select id="boolOp"><option value="difference">A − B (recorta B de A)</option>'+
      '<option value="intersection">A ∩ B (interseção)</option>'+
      '<option value="xor">A △ B (diferença simétrica)</option>'+
      '<option value="union">A ∪ B (união)</option></select>'+
      '<label class="field" style="margin-top:8px">Camada A</label><select id="boolA"></select>'+
      '<label class="field" style="margin-top:8px" id="boolBLab">Camada B</label><select id="boolB"></select>'+
      '<div class="hint" id="boolHint" style="margin-top:7px;display:none"></div>'+
      '<button class="tbtn" id="boolOk" style="width:100%;justify-content:center;margin-top:12px;'+
      'background:var(--amber);color:#1a1206;font-weight:600">Executar</button></div></div>';
    document.body.appendChild(m);
  }
  const selA=document.getElementById('boolA'), selB=document.getElementById('boolB');
  const optsA=fontes.map(l=>`<option value="${l.id}">${esc(l.name)} (${l.features.length}) · ${l.gtype==='line'?'linha':'polígono'}</option>`).join(''),
    optsB=moldes.map(l=>`<option value="${l.id}">${esc(l.name)} (${l.features.length}) · ${l.gtype==='line'?'linha fechada':'polígono'}</option>`).join('');
  selA.innerHTML=optsA;selB.innerHTML=optsB;
  const ativa=fontes.find(l=>String(l.id)===String(S.activeId));
  if(ativa)selA.value=String(ativa.id);
  const escolheB=()=>{if(selB.value===selA.value){const q=moldes.find(l=>String(l.id)!==selA.value);if(q)selB.value=String(q.id);}};
  escolheB();selA.onchange=escolheB;
  if(op) document.getElementById('boolOp').value=op;
  { const t=document.getElementById('boolTtl');
    if(t)t.textContent = ehClip ? 'Clip — recortar A pelo molde B'
                                : 'Operações entre polígonos';
    const sel=document.getElementById('boolOp');
    if(sel)sel.disabled=!!ehClip;   /* no clip a operação é fixa */
    const lab=document.getElementById('boolBLab'),hint=document.getElementById('boolHint');
    if(lab)lab.textContent=ehClip?'Camada B — máscara':'Camada B';
    if(hint){hint.style.display=ehClip?'block':'none';hint.textContent=ehClip?
      'A máscara pode ser um polígono ou uma camada de linhas fechadas. O resultado conserva somente o interior.':'';}}
  m.classList.add('on');
  document.getElementById('boolX').onclick=()=>m.classList.remove('on');
  document.getElementById('boolOk').onclick=async()=>{
    const A=S.layers.find(l=>String(l.id)===selA.value);
    const B=S.layers.find(l=>String(l.id)===selB.value);
    const oper=document.getElementById('boolOp').value;
    if(!A||!B||A===B){ toast('Escolha duas camadas diferentes'); return; }
    const mpMascara=ehClip?clipMascaraMP(B):null;
    if(ehClip&&(!mpMascara||!mpMascara.length)){
      toast('A camada B não possui polígono nem linha fechada válida');return;
    }
    m.classList.remove('on');
    if(ehClip&&A.gtype==='line'){
      showLoad('Recortando linhas pelo interior da máscara…');
      await new Promise(r=>setTimeout(r,10));
      try{
        const feats=clipLinhasPeloMP(A,mpMascara);
        if(!feats.length){hideLoad();toast('Resultado vazio — nenhuma linha está dentro da máscara');return;}
        const ehConstrutiva=(A.features||[]).some(clipClasseConstrutiva);
        if(ehConstrutiva)feats.forEach(f=>{const c=clipClasseConstrutiva(f);if(c)f.props.CLASSE=c;});
        const fields=(A.fields||[]).map(c=>({...c}));
        let n=1,total=0;feats.forEach(f=>{f.props=f.props||{};f.props.FID=n++;
          for(let i=1;i<f.geom.length;i++)total+=Math.hypot(f.geom[i][0]-f.geom[i-1][0],f.geom[i][1]-f.geom[i-1][1]);});
        if(!fields.some(c=>String(c.name).toUpperCase()==='FID'))fields.unshift({name:'FID',type:'N',length:9,decimal:0});
        if(ehConstrutiva&&!fields.some(c=>String(c.name).toUpperCase()==='CLASSE'))
          fields.push({name:'CLASSE',type:'C',length:24,decimal:0});
        const C=addLayer({name:('Clip · '+A.name).slice(0,60),gtype:'line',crs:S.workCRS,
          features:feats,fields,color:A.color||'#111111'});
        if(A._cavaV02Conv)C._cavaV02Conv=A._cavaV02Conv;
        if(ehConstrutiva&&typeof cavaV02AplicaLinhas==='function')cavaV02AplicaLinhas(C,'CLASSE');
        drawLayer(C);refreshUI();hideLoad();
        toast(feats.length+' trecho(s) interno(s) · '+total.toFixed(2)+' m — máscara '+B.name);
      }catch(e){hideLoad();toast('Falha no recorte das linhas: '+e.message);}
      return;
    }
    showLoad('Carregando biblioteca de recorte…');
    try{ await ensurePolyClip(); }catch(e){ hideLoad(); toast('⚠ '+e.message); return; }
    const rot={difference:'A − B', intersection:'A ∩ B', xor:'A △ B', union:'A ∪ B'}[oper];
    showLoad('Calculando '+rot+'…'); await new Promise(r=>setTimeout(r,10));
    try{
      /* POR FEIÇÃO, NÃO A CAMADA INTEIRA.
         A biblioteca de recorte tem teto interno de 1 milhão de eventos na
         fila do varredor; mandando a camada toda de uma vez (hidrografia com
         centenas de feições e milhares de vértices) ela estoura com
         "Infinite loop when putting segment endpoints in a priority queue".
         Recortando feição a feição, cada passada é pequena, o teto não é
         alcançado, e uma feição problemática é PULADA em vez de derrubar a
         operação inteira — o relatório diz quantas ficaram de fora.
         A união continua sendo feita de uma vez: ela é global por natureza. */
      const bbox=mp=>{let x0=1/0,y0=1/0,x1=-1/0,y1=-1/0;
        (mp||[]).forEach(poly=>(poly||[]).forEach(ring=>(ring||[]).forEach(p2=>{
          if(p2[0]<x0)x0=p2[0]; if(p2[0]>x1)x1=p2[0];
          if(p2[1]<y0)y0=p2[1]; if(p2[1]>y1)y1=p2[1];})));
        return [x0,y0,x1,y1];};
      const cruzaBB=(a,b)=>!(a[2]<b[0]||b[2]<a[0]||a[3]<b[1]||b[3]<a[1]);
      const mpB=ehClip?mpMascara:layerToMP(B), bbB=bbox(mpB);
      let out=[], pulados=0, semToque=0; const nomesPulados=[], origem=[];
      if(oper==='union'){
        out=polygonClipping.union(layerToMP(A), mpB);
      }else{
        const feitos=[];
        for(let i=0;i<A.features.length;i++){
          const mpA=layerToMP({features:[A.features[i]],gtype:'polygon'});
          if(!mpA||!mpA.length)continue;
          if(!cruzaBB(bbox(mpA),bbB)){
            /* fora do alcance de B: em diferença e xor a feição segue
               inteira; em interseção ela simplesmente não entra */
            if(oper!=='intersection')mpA.forEach(pol=>{feitos.push(pol);origem.push(i);});
            else semToque++;
            continue;
          }
          /* Falhou a feição inteira? Ela costuma ser justamente a MAIOR — e
             pular calado faz o resultado sair quase vazio (ele viu 0,425 ha
             onde deveria haver centenas de hectares). Então tenta de novo em
             degraus: (1) parte por parte da multiparte, (2) a parte teimosa
             com os vértices ralos (1 m), que é o que estoura a fila em
             hidrografia densa. Só desiste depois disso, e diz o nome. */
          const ralo=(ring,tol)=>{
            if(!ring||ring.length<8)return ring;
            const out=[ring[0]]; let ult=ring[0];
            for(let k=1;k<ring.length-1;k++){
              const p2=ring[k];
              if(Math.hypot(p2[0]-ult[0],p2[1]-ult[1])>=tol){out.push(p2);ult=p2;}
            }
            out.push(ring[ring.length-1]);
            return out.length>=4?out:ring;
          };
          try{
            const r=polygonClipping[oper](mpA,mpB);
            (r||[]).forEach(pol=>{feitos.push(pol);origem.push(i);});
          }catch(err){
            let salvos=0;
            for(const parte of mpA){
              try{
                const r2=polygonClipping[oper]([parte],mpB);
                (r2||[]).forEach(pol=>{feitos.push(pol);origem.push(i);}); salvos++;
              }catch(err2){
                try{
                  const magra=parte.map(ring=>ralo(ring,1));
                  const r3=polygonClipping[oper]([magra],mpB);
                  (r3||[]).forEach(pol=>{feitos.push(pol);origem.push(i);}); salvos++;
                }catch(err3){ /* essa parte fica de fora */ }
              }
            }
            if(!salvos){ pulados++;
              const nm=(A.features[i].props&&(A.features[i].props.NOME||A.features[i].props.nome))||('#'+(i+1));
              nomesPulados.push(nm); }
          }
          if(i%25===0){ showLoad('Calculando '+rot+'… '+(i+1)+'/'+A.features.length);
            await new Promise(r2=>setTimeout(r2,0)); }
        }
        out=feitos;
      }
      const feats=mpToFeatures(out);
      /* CLIP: cada polígono do resultado recebe de volta os atributos da
         feição de A que o gerou — sem isso os campos da APP se perdiam */
      let camposExtra=[];
      if(ehClip && origem.length===feats.length){
        const vistos={};
        feats.forEach((f,k)=>{
          const src=A.features[origem[k]];
          if(src&&src.props)Object.keys(src.props).forEach(c=>{
            if(f.props[c]===undefined){ f.props[c]=src.props[c]; vistos[c]=1; }
          });
        });
        camposExtra=(A.fields||[]).filter(c=>vistos[c.name]);
      }
      if(pulados){
        const lista=nomesPulados.slice(0,6).join(', ')+(nomesPulados.length>6?'…':'');
        console.warn('recorte: '+pulados+' feição(ões) pulada(s): '+lista);
        try{ cmdLog('recorte: '+pulados+' feição(ões) fora do resultado ('+lista+')','avisa'); }catch(e){}
      }
      if(!feats.length){ hideLoad();
        toast('Resultado vazio'+(pulados?' — '+pulados+' feição(ões) falharam':'')); return; }
      const fields=[{name:'FID',type:'N',length:9,decimal:0},
        {name:'AREA_M2',type:'N',length:16,decimal:2},{name:'AREA_HA',type:'N',length:12,decimal:4},
        {name:'PERIM_M',type:'N',length:12,decimal:2}];
      addLayer({name:((ehClip?'Clip':rot)+' · '+A.name).slice(0,60), gtype:'polygon',
        crs:S.workCRS, features:feats, fields:fields.concat(camposExtra), color:'#bb9af7'});
      hideLoad();
      const aT=feats.reduce((s,f)=>s+f.props.AREA_M2,0);
      toast(feats.length+' polígono(s) · '+(aT/1e4).toFixed(3)+' ha ('+rot+')'+
        (pulados?' · '+pulados+' feição(ões) pulada(s) por complexidade':''));
    }catch(e){ hideLoad(); toast('Falha na operação: '+e.message); }
  };
}
/* ============================================================================
   CONVERTER entre tipos de geometria
   ========================================================================== */
function gisConverter(){
  const L=activeLayer();
  if(!L){ toast('Selecione uma camada vetorial primeiro'); return; }
  let m=document.getElementById('convModal');
  if(!m){
    m=document.createElement('div'); m.id='convModal'; m.className='modal-bg';
    m.innerHTML='<div class="modal" style="width:min(460px,94vw)">'+
      '<div class="modal-h"><b>Converter geometria</b><div style="flex:1"></div>'+
      '<button class="tbtn" id="cvX">✕</button></div>'+
      '<div class="modal-b"><div class="hint" id="cvAlvo" style="margin-bottom:8px">—</div>'+
      '<label class="field">Converter para</label><select id="cvOp"></select>'+
      '<button class="tbtn" id="cvOk" style="width:100%;justify-content:center;margin-top:12px;'+
      'background:var(--amber);color:#1a1206;font-weight:600">Converter</button></div></div>';
    document.body.appendChild(m);
  }
  document.getElementById('cvAlvo').innerHTML='Camada <b>'+esc(L.name)+'</b> ('+L.gtype+', '+L.features.length+' feições)';
  const sel=document.getElementById('cvOp'); sel.innerHTML='';
  const add=(v,t)=>{ const o=document.createElement('option'); o.value=v; o.textContent=t; sel.appendChild(o); };
  if(L.gtype==='polygon'){ add('poly2line','Linhas (contorno dos polígonos)'); add('nodes','Pontos (vértices)'); add('centroid','Pontos (centroides)'); }
  else if(L.gtype==='line'){ add('line2poly','Polígonos (fechar as linhas)'); add('nodes','Pontos (vértices)'); add('ends','Pontos (extremidades)'); }
  else { add('merge2line','Linha (unir os pontos na ordem)'); }
  m.classList.add('on');
  document.getElementById('cvX').onclick=()=>m.classList.remove('on');
  document.getElementById('cvOk').onclick=()=>{ m.classList.remove('on'); convExec(L, sel.value); };
}
function convExec(L, op){
  const nova=(gtype,feats,suf,fields)=>{
    if(!feats.length){ toast('Nada convertido'); return; }
    addLayer({name:(L.name+' · '+suf).slice(0,60), gtype, crs:L.crs,
      features:feats, fields:fields||[{name:'FID',type:'N',length:9,decimal:0}], color:L.color});
    toast(feats.length+' feição(ões) — '+suf);
  };
  const ringsOf=f=>(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
  if(op==='poly2line'){
    const feats=[]; L.features.forEach(f=>{ if(!f.geom) return;
      ringsOf(f).forEach(r=>feats.push({geom:r.slice(), props:Object.assign({},f.props||{})})); });
    nova('line',feats,'contorno');
  } else if(op==='line2poly'){
    const feats=L.features.filter(f=>f.geom).map(f=>{ const r=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom[0]:f.geom;
      const a=r.slice(); if(a.length && (a[0][0]!==a[a.length-1][0]||a[0][1]!==a[a.length-1][1])) a.push(a[0].slice());
      return {geom:a, props:Object.assign({},f.props||{})}; });
    nova('polygon',feats,'fechado');
  } else if(op==='nodes'){
    const feats=[]; L.features.forEach(f=>{ if(!f.geom) return;
      const rs = L.gtype==='point'?edRings(L,f):ringsOf(f);
      rs.forEach(r=>r.forEach(p=>feats.push({geom:[p[0],p[1]], props:Object.assign({},f.props||{})}))); });
    nova('point',feats,'vértices');
  } else if(op==='ends'){
    const feats=[]; L.features.forEach(f=>{ if(!f.geom) return;
      ringsOf(f).forEach(r=>{ if(!r.length) return;
        feats.push({geom:[r[0][0],r[0][1]], props:Object.assign({PONTA:'inicio'},f.props||{})});
        feats.push({geom:[r[r.length-1][0],r[r.length-1][1]], props:Object.assign({PONTA:'fim'},f.props||{})}); }); });
    nova('point',feats,'extremidades');
  } else if(op==='centroid'){
    const feats=[]; L.features.forEach(f=>{ if(!f.geom) return;
      const r=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom[0]:f.geom;
      let sx=0,sy=0,a=0; for(let i=0;i<r.length-1;i++){ const cr=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1];
        a+=cr; sx+=(r[i][0]+r[i+1][0])*cr; sy+=(r[i][1]+r[i+1][1])*cr; }
      let cx,cy; if(Math.abs(a)>1e-9){ cx=sx/(3*a); cy=sy/(3*a); }
      else { cx=r.reduce((s,p)=>s+p[0],0)/r.length; cy=r.reduce((s,p)=>s+p[1],0)/r.length; }
      feats.push({geom:[cx,cy], props:Object.assign({},f.props||{})}); });
    nova('point',feats,'centroides');
  } else if(op==='merge2line'){
    const pts=L.features.filter(f=>f.geom).map(f=>[f.geom[0],f.geom[1]]);
    if(pts.length<2){ toast('Precisa de 2+ pontos'); return; }
    nova('line',[{geom:pts, props:{}}],'linha dos pontos');
  }
}
/* Buffer pela aba GIS: abre o modal, opera na feição selecionada ou na camada toda */
function gisBuffer(){
  if(!prepareDrawingCommand())return;
  let selection,items;
  try{
    selection=GeoMineCommandSelection.capture();
    if(selection.layers.length>1)throw Error('Selecione feições de uma única camada para gerar o buffer.');
    items=GeoMineCommandSelection.uniqueItems(selection);
  }catch(e){toast(e.message);return;}
  const L=selection.layers[0]||activeLayer();
  if(!L){ toast('Selecione uma camada vetorial primeiro'); return; }
  if(L.gtype!=='line'&&L.gtype!=='polygon'&&L.gtype!=='point'){ toast('Buffer vale para pontos, linhas e polígonos'); return; }
  const m=document.getElementById('bufModal');
  const alvo=document.getElementById('bufAlvo');
  const temSel=items.length>0;
  alvo.textContent='Camada '+(L.name||'—')+' ('+L.features.length+' feição(ões), '+L.gtype+')'+
    (temSel?' · '+items.length+' selecionada(s)':' · camada inteira');
  const chkTodas=document.getElementById('bufTodas');
  GeoMineVectorDestination.mount(document.getElementById('bufDestHost'),'bufDest',L,'polygon',false);
  chkTodas.checked = !temSel;                 // sem seleção, assume camada inteira
  m.classList.add('on');
  document.getElementById('bufDist').focus();
  const fechar=()=>m.classList.remove('on');
  document.getElementById('bufClose').onclick=fechar;
  document.getElementById('bufOk').onclick=()=>{
    const d=parseFloat(String(document.getElementById('bufDist').value).replace(',','.'));
    if(!isFinite(d)||d===0){ toast('Distância inválida'); return; }
    let destination;try{
      GeoMineCommandSelection.assertCurrent(selection);
      if(!S.layers.includes(L))throw Error('A camada de origem foi removida. Abra o buffer novamente.');
      destination=GeoMineVectorDestination.capture(document.getElementById('bufDest').value,L,'polygon',false);
    }catch(e){toast(e.message);return;}
    const opts={ destination, selectionSnapshot:selection, d, arred: !document.getElementById('bufReto').checked,
      dissolver: document.getElementById('bufDiss').checked,
      nseg: +document.getElementById('bufSeg').value };
    const todas=document.getElementById('bufTodas').checked;
    const feats=todas?L.features.slice():items.map(i=>i.f);
    if(!todas&&!temSel){toast('Selecione as feições ou marque a camada inteira.');return;}
    if(!feats.length){ toast('Camada sem feições'); return; }
    fechar();
    buffizarFeicoes(L, feats, opts);
  };
}
/* buffer de uma polilinha ABERTA → anel de polígono (dois lados + tampas) */
function bufferLinha(pts, d, arred, nseg){
  const n=pts.length; if(n<2) return null;
  const segN=[];
  for(let i=0;i<n-1;i++){ const a=pts[i],b=pts[i+1];
    const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1; segN.push([-dy/L,dx/L]); }
  const lado=(sinal)=>{ const out=[];
    for(let i=0;i<n;i++){ let nx=0,ny=0,c=0;
      if(i>0){ nx+=segN[i-1][0]; ny+=segN[i-1][1]; c++; }
      if(i<n-1){ nx+=segN[i][0]; ny+=segN[i][1]; c++; }
      let L=Math.hypot(nx,ny)||1; nx/=L; ny/=L;
      let ff=1; if(c===2){ const cos=nx*segN[i][0]+ny*segN[i][1]; ff=Math.abs(cos)>1e-6?1/cos:1; }
      ff=Math.max(-4,Math.min(4,ff));
      out.push([pts[i][0]+sinal*nx*d*ff, pts[i][1]+sinal*ny*d*ff]); }
    return out; };
  const esq=lado(+1), dir=lado(-1);
  const tampa=(centro, from, to, saindo)=>{ if(!arred) return [];
    const a0=Math.atan2(from[1]-centro[1], from[0]-centro[0]);
    const a1=Math.atan2(to[1]-centro[1], to[0]-centro[0]);
    let daCCW=a1-a0; while(daCCW<=0) daCCW+=2*Math.PI; while(daCCW>2*Math.PI) daCCW-=2*Math.PI;
    const daCW=daCCW-2*Math.PI;
    const mid=da=>{ const a=a0+da/2; return [Math.cos(a),Math.sin(a)]; };
    const mCCW=mid(daCCW), mCW=mid(daCW);
    const da=(mCCW[0]*saindo[0]+mCCW[1]*saindo[1] >= mCW[0]*saindo[0]+mCW[1]*saindo[1])? daCCW : daCW;
    const arc=[]; for(let k=1;k<nseg;k++){ const a=a0+da*k/nseg; arc.push([centro[0]+d*Math.cos(a), centro[1]+d*Math.sin(a)]); }
    return arc; };
  const tf=[pts[n-1][0]-pts[n-2][0], pts[n-1][1]-pts[n-2][1]]; let Lf=Math.hypot(tf[0],tf[1])||1; tf[0]/=Lf; tf[1]/=Lf;
  const ti=[pts[0][0]-pts[1][0], pts[0][1]-pts[1][1]]; let Li=Math.hypot(ti[0],ti[1])||1; ti[0]/=Li; ti[1]/=Li;
  const ring=[];
  esq.forEach(p=>ring.push(p));
  tampa(pts[n-1], esq[n-1], dir[n-1], tf).forEach(p=>ring.push(p));
  for(let i=n-1;i>=0;i--) ring.push(dir[i]);
  tampa(pts[0], dir[0], esq[0], ti).forEach(p=>ring.push(p));
  ring.push(esq[0].slice());
  return ring;
}
/* buffer de um anel FECHADO → dilata (d>0) ou contrai (d<0) o polígono */
function bufferPoligono(ring, d, arred, nseg){
  const n=ring.length;
  const closed=Math.hypot(ring[0][0]-ring[n-1][0],ring[0][1]-ring[n-1][1])<1e-9;
  const pts=closed? ring.slice(0,-1): ring.slice();
  const m=pts.length; if(m<3) return null;
  const segN=[];
  for(let i=0;i<m;i++){ const a=pts[i],b=pts[(i+1)%m];
    const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1; segN.push([-dy/L,dx/L]); }
  let A=0; for(let i=0;i<m;i++){ const a=pts[i],b=pts[(i+1)%m]; A+=a[0]*b[1]-b[0]*a[1]; }
  const ccw=A>0; const s= ccw? -1 : 1;                 // normal à esquerda p/ FORA
  const out=[];
  for(let i=0;i<m;i++){
    const np=segN[(i-1+m)%m], nc=segN[i];
    let nx=np[0]+nc[0], ny=np[1]+nc[1]; let L=Math.hypot(nx,ny)||1; nx/=L; ny/=L;
    const cos=nx*nc[0]+ny*nc[1]; let ff=Math.abs(cos)>1e-6?1/cos:1; ff=Math.max(-4,Math.min(4,ff));
    out.push([pts[i][0]+s*nx*d*ff, pts[i][1]+s*ny*d*ff]);
  }
  out.push(out[0].slice());
  return out;
}
function bufferPonto(p,d,nseg){ const r=[]; for(let k=0;k<=nseg;k++){ const a=2*Math.PI*k/nseg; r.push([p[0]+d*Math.cos(a), p[1]+d*Math.sin(a)]); } return r; }
/* ---- Buffer robusto (soma de Minkowski dissolvida) ----
   Deslocar o contorno vértice a vértice (bufferLinha/bufferPoligono, acima)
   autocruza o anel sempre que a curva é mais fechada que a distância: em
   rio sinuoso com vértices a poucos metros, cada "miter" invade a faixa e o
   polígono sai com ganchos, arcos internos e área errada. Aqui a faixa é a
   soma de Minkowski literal — um retângulo por segmento e um disco completo
   por vértice — dissolvida pelo polygon-clipping. Peça convexa nunca se
   autocruza, a união resolve toda sobreposição e não há fresta possível
   por construção. Setores parciais e cunhas foram tentados e descartados:
   ou apoiavam aresta colinear na borda do retângulo vizinho (o que degenera
   a varredura da biblioteca) ou abriam frestas em segmentos curtos.
   "Pontas retas" = só as tampas das extremidades ficam retas; as junções
   seguem a distância constante (é o que uma faixa de domínio real faz). */
function bufDisco(c, r, nseg){
  const n=Math.max(8, 2*nseg), out=[];
  for(let k=0;k<n;k++){ const a=2*Math.PI*k/n; out.push([c[0]+r*Math.cos(a), c[1]+r*Math.sin(a)]); }
  out.push(out[0].slice()); return out;
}
function bufRetangulo(a, b, r){
  const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy); if(!(L>0)) return null;
  const nx=-dy/L*r, ny=dx/L*r;
  return [[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny],[a[0]+nx,a[1]+ny]];
}
/* remove vértices repetidos em sequência e simplifica com desvio máximo
   de 1 mm em relação aos segmentos finais preservados: em trecho
   reto os retângulos vizinhos ficariam encostados borda com borda, outra
   colinearidade que degenera a varredura. Em anel fechado descarta o ponto
   de fechamento (a linha fechada mantém o seu, pois é caminho). */
function bufLimpa(rg, fechado){
  let out=[];
  (rg||[]).forEach(p=>{ const u=out[out.length-1];
    if(!u || Math.hypot(p[0]-u[0],p[1]-u[1])>1e-9) out.push([p[0],p[1]]); });
  if(fechado) while(out.length>1 && Math.hypot(out[0][0]-out[out.length-1][0], out[0][1]-out[out.length-1][1])<=1e-9) out.pop();
  if(out.length<3)return out;
  /* Removing every locally collinear vertex in one pass is not bounded:
     a densely sampled bend can lose all its interior vertices and become
     the chord between its ends. Measure each removal against the FINAL
     retained segment instead (iterative Douglas–Peucker, tolerance 1 mm).
     Closed rings include the closing edge in that bound. */
  const pts=fechado?out.concat([out[0]]):out,n=pts.length;
  const keep=new Uint8Array(n);keep[0]=keep[n-1]=1;
  const stack=[[0,n-1]],tol2=1e-6;
  while(stack.length){
    const [a,b]=stack.pop(),p=pts[a],q=pts[b],dx=q[0]-p[0],dy=q[1]-p[1],dd=dx*dx+dy*dy;
    let far=-1,max=tol2;
    for(let i=a+1;i<b;i++){
      const v=pts[i],t=dd?Math.max(0,Math.min(1,((v[0]-p[0])*dx+(v[1]-p[1])*dy)/dd)):0,
        ex=v[0]-p[0]-t*dx,ey=v[1]-p[1]-t*dy,d2=ex*ex+ey*ey;
      if(d2>max){max=d2;far=i;}
    }
    if(far>=0){keep[far]=1;stack.push([a,far],[far,b]);}
  }
  const fica=pts.filter((_,i)=>keep[i]);if(fechado)fica.pop();
  return fica.length>=(fechado?3:2)?fica:out;
}
/* peças (anéis convexos) da faixa de raio r em torno do caminho pts, em
   ordem espacial (disco do vértice i, retângulo i→i+1, …) para que lotes
   consecutivos formem blocos contíguos na união; com tampas retas a linha
   aberta não recebe disco nas duas extremidades */
function bufPecas(pts, r, arred, nseg, fechado){
  const out=[], n=pts.length;
  if(n<2) return n? [bufDisco(pts[0], r, nseg)] : out;
  for(let i=0;i<n;i++){
    const ponta = !fechado && (i===0 || i===n-1);
    if(arred || !ponta) out.push(bufDisco(pts[i], r, nseg));
    if(fechado || i<n-1){ const rt=bufRetangulo(pts[i], pts[(i+1)%n], r); if(rt) out.push(rt); }
  }
  return out;
}
/* O polygon-clipping (0.15) pode entrar em laço com muitas arestas quase
   colineares sobrepostas numa varredura só ("Infinite loop when passing
   sweep line…"). A união é feita em árvore, com poucos vizinhos espaciais
   por chamada; se ainda assim uma chamada falhar, une um a um e, em último
   caso, sacode as coordenadas em ~1 µm para desfazer a degeneração. */
function bufSacode(mp, k){
  let seed=1234567+(k||0);
  const rnd=()=>{ seed=(seed*48271)%2147483647; return seed/2147483647-0.5; };
  return mp.map(poly=>poly.map(ring=>ring.map(pt=>[pt[0]+2e-6*rnd(), pt[1]+2e-6*rnd()])));
}
function bufOp(op, a, b){
  const pc=window.polygonClipping;
  try{ return pc[op](a, b); }
  catch(e){
    for(let k=1;k<=3;k++){ try{ return pc[op](bufSacode(a,k), bufSacode(b,k+7)); }catch(e2){} }
    throw e;
  }
}
function bufUniao(polis){
  if(!polis||!polis.length) return [];
  const pc=window.polygonClipping;
  const unir=lista=>{                                   // lista de MultiPolygons vizinhos
    if(lista.length===1) return lista[0];
    try{ return pc.union(...lista); }
    catch(e){ let acc=lista[0]; for(let i=1;i<lista.length;i++) acc=bufOp('union', acc, lista[i]); return acc; }
  };
  let nivel=polis.map(p=>[p]); const K=64;
  while(nivel.length>1){
    const prox=[]; for(let i=0;i<nivel.length;i+=K) prox.push(unir(nivel.slice(i,i+K)));
    nivel=prox;
  }
  return bufSaidaLimpa(nivel[0]);
}
/* descarta anéis degenerados (área < 1 mm²) que o sacode/fallback pode
   deixar e tira vértices colineares (desvio < 1 mm) que a união acumula nos
   pontos de tangência disco/retângulo; os anéis saem fechados */
function bufSaidaLimpa(mp){
  if(!Array.isArray(mp)) return [];
  const enxuga=ring=>{ const r=bufLimpa(ring, true); if(r.length<3) return ring; r.push(r[0].slice()); return r; };
  return mp.map(poly=>poly.filter((ring,i)=>i===0 || Math.abs(polyArea(ring))>1e-6).map(enxuga))
           .filter(poly=>poly.length && Math.abs(polyArea(poly[0]))>1e-6);
}
/* buffer de UMA feição, no CRS de trabalho → {polis:[[casca, furos…], …], pulados, falhou} */
function bufferFeicaoMP(L, f, d, arred, nseg){
  const pc=window.polygonClipping, r=Math.abs(d);
  const out={polis:[], pulados:0, falhou:false};
  if(L.gtype==='point'){
    /* geom de ponto é [[x,y], …] (multiponto = vários pares) */
    const bruto=f.geom;
    const pts=(Array.isArray(bruto[0])&&Array.isArray(bruto[0][0]))?bruto.flat():(Array.isArray(bruto[0])?bruto:[bruto]);
    const discos=[];
    pts.forEach(pt=>{
      if(!(Array.isArray(pt)&&Number.isFinite(+pt[0])&&Number.isFinite(+pt[1]))){ out.pulados++; return; }
      let q=[+pt[0],+pt[1]];
      if(L.crs!==S.workCRS) q=reproj(L.crs,S.workCRS,q[0],q[1]);
      if(!(Array.isArray(q)&&Number.isFinite(+q[0])&&Number.isFinite(+q[1]))){ out.pulados++; return; }
      discos.push([bufDisco([+q[0],+q[1]], r, nseg)]);
    });
    if(discos.length) out.polis=bufUniao(discos); else out.falhou=true;
    return out;
  }
  const fechado=(L.gtype==='polygon');
  const rings=measureProjectedRings(L,f).map(rg=>bufLimpa(rg, fechado));
  if(fechado){
    const aneis=rings.filter(rg=>rg.length>=3);
    if(!aneis.length){ out.falhou=true; return out; }
    /* base da feição: anéis combinados par/ímpar — furo dentro de casca fica
       vazio e parte solta soma, a mesma leitura do desenho e da medição */
    const base=pc.xor(...aneis.map(rg=>[rg.concat([rg[0]])]));
    const pecas=[]; aneis.forEach(rg=>pecas.push(...bufPecas(rg, r, arred, nseg, true)));
    const faixa=bufUniao(pecas.map(p=>[p]));
    if(!base||!base.length) out.polis = d>0? faixa : [];
    else out.polis = bufSaidaLimpa(d>0? bufOp('union', base, faixa) : bufOp('difference', base, faixa));
    return out;
  }
  const pecas=[];
  rings.forEach(rg=>{ if(rg.length===1) pecas.push(bufDisco(rg[0], r, nseg));
    else if(rg.length>=2) pecas.push(...bufPecas(rg, r, arred, nseg, false)); });
  if(!pecas.length){ out.falhou=true; return out; }
  out.polis=bufUniao(pecas.map(p=>[p]));
  return out;
}
function polyArea(r){ if(!r||r.length<3) return 0; let s=0; for(let i=0;i<r.length-1;i++){ s+=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1]; } return s/2; }
function edGeom(cmd){
  if(cmd==='simplificar')return edAbreSimplificar();
  if(cmd==='suavizar')return edAbreSuavizar();
  if(!edPrecisa()) return;
  const {L,f}=ED.sel; const rings=edRings(L,f); const fechado=edFechado(L);
  if(L.gtype==='point'){ toast('Não se aplica a ponto'); return; }
  if(cmd==='densificar'){
    const passo=edParam('edPpasso',5);
    if(!(passo>0)){toast('Informe um passo maior que zero');return;}
    const zgeo=typeof gtZg==='function'?gtZg(f):null;
    /* O parâmetro é sempre em metros. Uma camada EPSG:4326 não pode receber
       diretamente "5" nas coordenadas, pois isso significaria cinco graus. */
    const ringsM=rings.map(r=>r.map(p=>{
      const q=reproj(L.crs,S.workCRS,p[0],p[1]);
      return [q[0],q[1],...p.slice(2)];
    }));
    let resultados;
    try{resultados=ringsM.map((r,ri)=>densificaRing(r,zgeo&&zgeo[ri],passo,fechado));}
    catch(e){toast('Densificação cancelada: '+e.message);return;}
    const novo=resultados.map(x=>x.pts.map(p=>{
      const q=reproj(S.workCRS,L.crs,p[0],p[1]);
      return [q[0],q[1],...p.slice(2)];
    }));
    edSnapshot('densificar');
    if(resultados.some(x=>x.zs))
      f.zg=novo.length>1?resultados.map(x=>x.zs||[]):resultados[0].zs;
    const antes=rings.reduce((s,r)=>s+r.length,0),depois=novo.reduce((s,r)=>s+r.length,0);
    edAplicar(novo, depois===antes
      ?`Nenhum segmento excede ${passo} m; reduza o passo`
      :`Densificado a cada ${passo} m (${antes} → ${depois} vértices)`); return; }
}

/* A ribbon pode receber o comando antes de o usuário entrar formalmente no
   Editor. Usa a feição identificada quando houver; caso contrário densifica
   a camada ativa inteira e cria uma saída, em vez de simplesmente não agir. */
function edDensificarFeicao(L,f,modo,valor){
  const rings=edRings(L,f),fechado=edFechado(L),zgeo=typeof gtZg==='function'?gtZg(f):null;
  const ringsM=rings.map(r=>r.map(p=>{
    const q=reproj(L.crs,S.workCRS,p[0],p[1]);return [q[0],q[1],...p.slice(2)];
  }));
  let resultados;
  try{resultados=ringsM.map((r,ri)=>densificaRingModo(r,zgeo&&zgeo[ri],modo,valor,fechado));}
  catch(e){toast('Densificação cancelada: '+e.message);return false;}
  const novo=resultados.map(x=>x.pts.map(p=>{
    const q=reproj(S.workCRS,L.crs,p[0],p[1]);return [q[0],q[1],...p.slice(2)];
  }));
  edSnapshot('densificar');
  if(resultados.some(x=>x.zs))f.zg=novo.length>1?resultados.map(x=>x.zs||[]):resultados[0].zs;
  const antes=rings.reduce((s,r)=>s+r.length,0),depois=novo.reduce((s,r)=>s+r.length,0);
  const crit=modo==='distancia'?`${valor} m`:modo==='intervalos'?`${valor} intervalos`:`${valor} novos vértices/segmento`;
  edAplicar(novo,`Densificado por ${crit} (${antes} → ${depois} vértices)`);
  return true;
}
function edDensificarAplicar(){
  const modo=document.getElementById('densModo').value,
    valor=+document.getElementById('densValor').value,
    escopo=document.getElementById('densEscopo').value;
  if(!(valor>0)){toast('Informe um valor maior que zero');return;}
  if(modo!=='distancia'&&!Number.isInteger(valor)){toast('Informe um número inteiro');return;}
  const ativa=activeLayer();
  let sel=(ED.sel&&(!ativa||ED.sel.L===ativa))?ED.sel:null;
  if(!sel&&S.selFeat&&S.selFeat.layer&&(!ativa||S.selFeat.layer===ativa)){
    const L=S.selFeat.layer,f=L.features&&L.features[S.selFeat.idx];
    if(f)sel={L,idx:S.selFeat.idx,f};
  }
  const L=ativa||(sel&&sel.L);
  if(!L||L.gtype==='point'){toast('Selecione uma linha ou polígono');return;}
  if(escopo==='feicao'){
    if(!sel||!sel.f){toast('Identifique ou selecione primeiro uma feição');return;}
    if(!ED.sel)edSelecionar(sel,true);
    if(!edDensificarFeicao(sel.L,sel.f,modo,valor))return;
  }else{
    const gt=document.getElementById('gtStep'),gl=document.getElementById('gtLayer');
    if(gt&&modo==='distancia')gt.value=valor;if(gl)gl.value=String(L.id);
    gtDensify({modo,valor});
  }
  document.getElementById('densModal').classList.remove('on');
}
function edDensificarComando(){
  const ativa=activeLayer();
  if((!ED.sel||ED.sel.L!==ativa)&&S.selFeat&&S.selFeat.layer===ativa){
    const L=S.selFeat.layer,f=L.features&&L.features[S.selFeat.idx];
    if(f)edSelecionar({L,idx:S.selFeat.idx,f},true);
  }
  const L=ativa||((ED.sel&&ED.sel.L)||null);
  if(!L||L.gtype==='point'){toast('Selecione uma linha ou polígono para densificar');return;}
  let bg=document.getElementById('densModal');
  if(!bg){
    bg=document.createElement('div');bg.id='densModal';bg.className='modal-bg';
    bg.innerHTML=`<div class="modal" style="width:min(520px,95vw)">
      <div class="modal-h"><b>Densificar geometria</b><div style="flex:1"></div>
        <button class="tbtn" id="densX">✕</button></div>
      <div class="modal-b">
        <div class="hout" id="densLayerInfo"></div>
        <label class="field">Critério</label>
        <select id="densModo">
          <option value="distancia">Distância máxima entre vértices</option>
          <option value="intervalos">Número de intervalos por segmento</option>
          <option value="vertices">Novos vértices por segmento</option>
        </select>
        <label class="field" id="densValorRot">Distância máxima (m)</label>
        <input type="number" id="densValor" value="5" min="0.01" step="0.1">
        <label class="field">Aplicar em</label>
        <select id="densEscopo">
          <option value="feicao">Somente a feição selecionada</option>
          <option value="camada">Toda a camada (criar nova camada)</option>
        </select>
        <div class="hint" id="densHint">Cada segmento é dividido para que nenhuma distância ultrapasse o valor informado. Os vértices originais e as cotas Z são preservados.</div>
        <button class="tbtn" id="densOk" style="width:100%;justify-content:center;margin-top:12px;background:var(--amber);color:#1a1206;font-weight:700">Densificar</button>
      </div></div>`;
    document.body.appendChild(bg);
    document.getElementById('densX').onclick=()=>bg.classList.remove('on');
    document.getElementById('densOk').onclick=edDensificarAplicar;
    document.getElementById('densModo').onchange=()=>{
      const m=document.getElementById('densModo').value,v=document.getElementById('densValor');
      document.getElementById('densValorRot').textContent=m==='distancia'?'Distância máxima (m)':m==='intervalos'?'Quantidade de intervalos':'Novos vértices por segmento';
      document.getElementById('densHint').textContent=m==='distancia'
        ?'Cada segmento é dividido para que nenhuma distância ultrapasse o valor informado. Os vértices originais e as cotas Z são preservados.'
        :m==='intervalos'?'Cada segmento original é dividido em N partes iguais.':'Insere exatamente N vértices igualmente espaçados em cada segmento original.';
      v.step=m==='distancia'?'0.1':'1';v.min=m==='distancia'?'0.01':'1';
      if(m!=='distancia')v.value=Math.max(1,Math.round(+v.value||1));
    };
  }
  document.getElementById('densLayerInfo').innerHTML=`Camada: <b>${esc(L.name)}</b> · ${L.features.length.toLocaleString('pt-BR')} feição(ões)`;
  const temFeicao=!!(ED.sel&&ED.sel.L===L);
  const ef=document.querySelector('#densEscopo option[value="feicao"]');
  ef.disabled=!temFeicao;
  document.getElementById('densEscopo').value=temFeicao?'feicao':'camada';
  const p=edParam('edPpasso',5);document.getElementById('densValor').value=p;
  bg.classList.add('on');
}

/* cliques do mapa para os comandos interativos — devolve true se consumiu */
function edMapClick(latlng){
  if(!ED.on || !ED.pend) return false;
  const P=ED.pend, {L,f}=ED.sel||{};
  if(P.drag) return true;                 // mover por arrasto: os pontos são do GeoMineDragMove
  const c = (L && L.crs)? fromWGS(L.crs, latlng.lng, latlng.lat) : [latlng.lng, latlng.lat];
  if(P.cmd==='paralela'){
    const rings=edRings(L,f); const d=P.dist||5;
    // descobre de que LADO o clique caiu, no anel mais próximo: sinal do produto
    // vetorial (segmento → ponto). + = esquerda da direção do traçado.
    const cl=[c[0],c[1]];
    let melhorSeg=null, bd=Infinity, lado=+1;
    rings.forEach(r=>{
      for(let i=0;i<r.length-1;i++){
        const a=r[i], b=r[i+1];
        const s=edSegDist(cl,a,b);
        if(s.d<bd){ bd=s.d;
          const cross=(b[0]-a[0])*(cl[1]-a[1])-(b[1]-a[1])*(cl[0]-a[0]);
          // edOffset usa normal (dy,-dx) = à DIREITA do traçado com +d; cross>0 = clique
          // à esquerda → precisa -d. Por isso o sinal é invertido em relação ao cross.
          lado = cross>=0? -1 : +1;
        }
      }
    });
    ED.pend=null;
    edSnapshot('paralela');
    const novo=rings.map(r=>edOffset(r, lado*d, edFechado(L)));
    const nf={geom:novo.length>1?novo:novo[0], multi:novo.length>1, props:Object.assign({},f.props||{})};
    L.features.push(nf); undoPush({t:'feat', L:L, feat:nf});
    drawLayer(L); refreshUI(); edSelecionar({L:L, idx:L.features.length-1, f:nf});
    toast('Paralela a '+d+' m criada no lado do toque');
    return true;
  }
  if(P.cmd==='girarLivre'){
    const rings=edRings(L,f),cc=P.center||edCentroide(rings),
      dx=c[0]-cc[0],dy=c[1]-cc[1];
    if(Math.hypot(dx,dy)<1e-9){toast('Toque afastado do centro para indicar uma direção');return true;}
    const alvo=(Math.atan2(dx,dy)*180/Math.PI+360)%360,
      g=((alvo-(P.az0||0)+540)%360)-180;
    ED.pend=null;edSnapshot('girar livre');
    edAplicar(edGirar(rings,cc,g),`Orientado livremente ao azimute ${alvo.toFixed(2)}°`);
    return true;
  }
  if(P.cmd==='quebrar2'){
    const v=edPontoNaLinhaNoToque(latlng);
    if(!v){ toast('Toque em cima da linha (qualquer ponto dela)'); return true; }
    P.pts.push(v);
    if(P.pts.length===1){
      toast('Agora o 2º ponto (o mesmo = quebra única; outro = duas quebras)');
      return true;
    }
    ED.pend=null;
    edQuebrarEm(P.pts[0],P.pts[1]);
    return true;
  }
  if(P.cmd==='unir'){ const alvo=edPickAt(latlng); ED.pend=null;
    if(alvo) edUnirCom(alvo); else toast('Nenhuma feição no toque'); return true; }
  if(P.cmd==='estender'){
    const rings=edRings(L,f); const r=rings[ED.ring];
    const dIni=edDist2(r[0],[c[0],c[1]]), dFim=edDist2(r[r.length-1],[c[0],c[1]]);
    edSnapshot('estender');
    if(dFim<=dIni) r.push([c[0],c[1]]); else r.unshift([c[0],c[1]]);
    ED.pend=null; edAplicar(rings,'Linha estendida'); return true;
  }
  if(P.cmd==='trecho'){
    const rings=edRings(L,f); const r=rings[ED.ring];
    let melhor=null, bd=Infinity;
    for(let i=0;i<r.length;i++){
      const a=r[i], b=r[(i+1)%r.length];
      const s=edSegDist([c[0],c[1]],a,b);
      if(s.d<bd){ bd=s.d; melhor={i, pt:s.pt}; }
    }
    P.pts.push(melhor);
    if(P.pts.length<2){ toast('Agora o segundo ponto'); return true; }
    const [A,B]=P.pts; ED.pend=null;
    if(A.i===B.i){ toast('Os dois pontos caíram no mesmo segmento'); return true; }
    edSnapshot('apagar trecho');
    const maior=!!(document.getElementById('edPmaior')||{}).checked;
    const novo=edApagarTrecho(r, A.i, A.pt, B.i, B.pt, maior);
    rings[ED.ring]=novo;
    edAplicar(rings,'Trecho removido — polígono continua fechado ('+novo.length+' vértices)');
    return true;
  }
  if(P.cmd==='mover' || P.cmd==='copiar' || P.cmd==='espelhar'){
    P.pts.push([c[0],c[1]]);
    if(P.pts.length<2){ toast(P.cmd==='espelhar'?'Agora o segundo ponto do eixo':'Agora o destino'); return true; }
    const [A,B]=P.pts; ED.pend=null;
    const rings=edRings(L,f);
    if(P.cmd==='espelhar'){ edSnapshot('espelhar'); edAplicar(edEspelhar(rings,A,B),'Espelhado'); return true; }
    const dx=B[0]-A[0], dy=B[1]-A[1];
    const novo=edMover(rings,dx,dy);
    if(P.cmd==='mover'){ edSnapshot('mover'); edAplicar(novo,'Movido '+Math.hypot(dx,dy).toFixed(2)+' m'); }
    else{
      const nf={geom:novo.length>1?novo:novo[0], multi:novo.length>1, props:Object.assign({},f.props||{})};
      L.features.push(nf); undoPush({t:'feat', L:L, feat:nf});
      drawLayer(L); refreshUI(); edSelecionar({L:L, idx:L.features.length-1, f:nf});
      toast('Cópia criada');
    }
    return true;
  }
  return false;
}

/* ---------- ícones (convenção do app: traço âmbar + destaque no alvo) ---------- */
var EDI={};
(function(){
  const S0='<svg viewBox="0 0 24 24">', S1='</svg>';
  const g='stroke="#8b949e"';                       // contexto (cinza)
  EDI.sel     = S0+'<path '+g+' d="M3 18l6-13 5 8 4-4 3 9"/><circle class="fillamb" cx="9" cy="5" r="2.4"/>'+S1;
  EDI.vdel    = S0+'<path '+g+' d="M3 18l6-13 5 8 4-4 3 9"/><path d="M12.6 3.6l4.8 4.8M17.4 3.6l-4.8 4.8" stroke-width="2"/>'+S1;
  EDI.vadd    = S0+'<path '+g+' d="M3 18l6-13 5 8 4-4 3 9"/><path d="M15 4.5v5M12.5 7h5" stroke-width="2"/>'+S1;
  EDI.vmove   = S0+'<path '+g+' d="M3 18l6-13 5 8 4-4 3 9"/><path d="M9 2.5v5M6.5 5h5"/><circle class="fillamb" cx="9" cy="5" r="2"/>'+S1;
  EDI.vz      = S0+'<path '+g+' d="M3 19h18"/><path d="M12 15V5M9 8l3-3 3 3"/><circle class="fillamb" cx="12" cy="15" r="2.2"/>'+S1;
  EDI.terreno = S0+'<path '+g+' d="M2 18l5-6 4 4 4-7 7 9z"/><circle class="fillamb" cx="11" cy="16" r="2"/><path d="M11 12v2"/>'+S1;
  EDI.fdel    = S0+'<path '+g+' d="M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14"/><path d="M10 10l4 8M14 10l-4 8" stroke-width="1.8"/>'+S1;
  EDI.explode = S0+'<path class="softamb" d="M12 3l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z"/><path d="M12 3l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z"/>'+S1;
  EDI.unir    = S0+'<path '+g+' d="M3 16l6-4"/><path '+g+' d="M15 12l6-4"/><circle class="fillamb" cx="12" cy="14" r="2.6"/><path d="M9 12l3 2 3-2"/>'+S1;
  EDI.sdel    = S0+'<circle '+g+' cx="4" cy="18" r="2"/><circle '+g+' cx="20" cy="6" r="2"/><path d="M7 15.5l10-7" stroke-dasharray="2.4 2.4"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5" stroke-width="1.8"/>'+S1;
  EDI.quebrar = S0+'<circle '+g+' cx="4" cy="18" r="2"/><circle '+g+' cx="20" cy="6" r="2"/><path '+g+' d="M6 16.5l4-3M14 10.5l4-3"/><path class="fillamb" d="M12 9.6l1.6 2.4-1.6 2.4-1.6-2.4z"/>'+S1;
  EDI.trecho  = S0+'<path '+g+' d="M12 3a9 9 0 1 1-.01 0"/><path d="M5.6 5.6a9 9 0 0 1 12.8 0" stroke-dasharray="2.5 2.5"/><circle class="fillamb" cx="5.6" cy="5.6" r="2"/><circle class="fillamb" cx="18.4" cy="5.6" r="2"/>'+S1;
  EDI.fechar  = S0+'<path '+g+' d="M5 19V7l7-4 7 4v12"/><path d="M5 19h14" stroke-width="2"/><circle class="fillamb" cx="5" cy="19" r="2"/><circle class="fillamb" cx="19" cy="19" r="2"/>'+S1;
  EDI.abrir   = S0+'<path '+g+' d="M5 19V7l7-4 7 4v12"/><path d="M5 19h5M14 19h5" stroke-width="2"/><path d="M10.5 21l3-4" stroke-dasharray="2 2"/>'+S1;
  EDI.rev     = S0+'<path '+g+' d="M4 8h13M20 16H7"/><path d="M17 5l3 3-3 3" stroke-width="1.8"/><path d="M7 13l-3 3 3 3" stroke-width="1.8"/>'+S1;
  EDI.estend  = S0+'<path '+g+' d="M3 17l6-5 4 3"/><path d="M13 15l7-6" stroke-dasharray="2.5 2.5"/><circle class="fillamb" cx="20" cy="9" r="2.2"/>'+S1;
  EDI.mover   = S0+'<path '+g+' d="M4 20l5-9 4 5 3-3"/><path d="M18 4v7M14.5 7.5L18 4l3.5 3.5"/><circle class="fillamb" cx="18" cy="12.5" r="1.8"/>'+S1;
  EDI.copiar  = S0+'<rect '+g+' x="3" y="7" width="11" height="11" rx="1.5"/><rect class="softamb" x="9" y="3" width="12" height="12" rx="1.5"/><rect x="9" y="3" width="12" height="12" rx="1.5"/>'+S1;
  EDI.girar   = S0+'<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 3v4h-4" stroke-width="1.8"/><circle class="fillamb" cx="12" cy="12" r="2"/>'+S1;
  EDI.escalar = S0+'<rect '+g+' x="3" y="11" width="9" height="9"/><rect x="8" y="5" width="13" height="13"/><path d="M14 11l5-5M19 6h-3M19 6v3" stroke-width="1.6"/>'+S1;
  EDI.espelho = S0+'<path d="M12 3v18" stroke-dasharray="2.5 2.5"/><path '+g+' d="M9 7L4 12l5 5z"/><path class="softamb" d="M15 7l5 5-5 5z"/><path d="M15 7l5 5-5 5z"/>'+S1;
  EDI.parale  = S0+'<path '+g+' d="M3 16l6-8 5 4 7-6"/><path d="M3 20l6-8 5 4 7-6"/><path d="M5 17.6l.9-1.2" stroke-width="2"/>'+S1;
  EDI.offset2 = S0+'<path d="M3 13l6-8 5 4 7-6"/><path '+g+' d="M3 16l6-8 5 4 7-6"/><path d="M3 19l6-8 5 4 7-6"/>'+S1;
  EDI.buffer  = S0+'<path class="softamb" d="M6 5h6a6 6 0 0 1 0 12H6a4 4 0 0 1 0-8h6a2 2 0 0 1 0 0"/><path '+g+' d="M6 9h6"/><circle class="fillamb" cx="6" cy="9" r="1.6"/><circle class="fillamb" cx="12" cy="9" r="1.6"/>'+S1;
  EDI.simplif = S0+'<path '+g+' d="M3 17l3-4 2 3 2-6 3 5 3-7 3 6 2-2" stroke-dasharray="2 2"/><path d="M3 17l7-8 5 5 6-7"/>'+S1;
  EDI.densif  = S0+'<path '+g+' d="M3 17l7-8 5 5 6-7"/><circle class="fillamb" cx="3" cy="17" r="1.6"/><circle class="fillamb" cx="6.5" cy="13" r="1.6"/><circle class="fillamb" cx="10" cy="9" r="1.6"/><circle class="fillamb" cx="15" cy="14" r="1.6"/><circle class="fillamb" cx="21" cy="7" r="1.6"/>'+S1;
  EDI.suaviz  = S0+'<path '+g+' d="M3 17l7-8 5 5 6-7" stroke-dasharray="2 2"/><path d="M3 17c4-8 8 3 11-2s5-6 7-6"/>'+S1;
})();
/* grupo Polígono (dividir): 24 px na paleta, 48 px na faixa de opções */
EDI.psplit_reta='<svg viewBox="0 0 24 24"><path stroke="#8b949e" d="M3 8l9-4 9 7-5 9-11-2z"/><path d="M6 22L19 2" stroke-dasharray="3 2"/></svg>';
EDI.psplit_iguais='<svg viewBox="0 0 24 24"><path stroke="#8b949e" d="M3 5h18v14H3z"/><path d="M9 5v14M15 5v14" stroke-dasharray="3 2"/></svg>';
if(typeof RIB_SVG==='object'){
  RIB_SVG.cad_psplit_reta='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M8 15l19-7 13 15-11 17-21-5z" fill="#37c0aa" fill-opacity=".28" stroke="#73bbde" stroke-width="2.5" stroke-linejoin="round"/><path d="M12 44L37 4" stroke="#f5a524" stroke-width="3" stroke-dasharray="5 3" stroke-linecap="round"/></svg>';
  RIB_SVG.cad_psplit_iguais='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M6 11h36v26H6z" fill="#37c0aa" fill-opacity=".28" stroke="#73bbde" stroke-width="2.5"/><path d="M18 11v26M30 11v26" stroke="#f5a524" stroke-width="2.6" stroke-dasharray="4 3"/></svg>';
}
/* continuar desenho: traço existente (cinza) + trecho novo tracejado */
EDI.continuar='<svg viewBox="0 0 24 24"><path stroke="#8b949e" d="M3 19l5-9 5 4"/><path d="M13 14l4-7 4 3" stroke-dasharray="2.5 2"/><circle class="fillamb" cx="13" cy="14" r="2.3"/></svg>';
if(typeof RIB_SVG==='object')
  RIB_SVG.cad_continuar='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M6 38l10-18 10 8" fill="none" stroke="#73bbde" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><path d="M26 28l8-14 8 6" fill="none" stroke="#f5a524" stroke-width="3" stroke-dasharray="5 4" stroke-linecap="round"/><circle cx="26" cy="28" r="4.5" fill="#f5a524"/></svg>';
function edDividir(modo){
  const P=window.GeoMinePolygonSplit;
  if(!P){ toast('Divisão de polígonos indisponível — atualize o aplicativo'); return; }
  if(modo==='reta') P.start('reta'); else P.openEqual();
}
const ED_PNG_ICONS={
  sel:'selecionar',fdel:'excluir',explode:'explodir',unir:'unir',
  vadd:'ponto',vdel:'excluir',vmove:'mover',vz:'pontos-cotados',terreno:'mdt',
  sdel:'excluir',quebrar:'quebrar-linha',trecho:'clip',
  psplit_reta:'cad_psplit_reta',psplit_iguais:'cad_psplit_iguais',continuar:'cad_continuar',
  fechar:'poligono',abrir:'polilinha',rev:'inverter-selecao',estend:'linha',
  mover:'mover',copiar:'copiar',girar:'rotacionar',escalar:'transformar',
  espelho:'inverter-selecao',parale:'offset',offset2:'offset',
  buffer:'buffer',simplif:'simplificar',densif:'pontos-cotados',suaviz:'suavizar'
};
function edIco(k){
  const id=ED_PNG_ICONS[k], p=(typeof RIB_PNG!=='undefined'&&id)?RIB_PNG[id]:null;
  if(p) return `<span class="edic"><span class="edic-png-native" style="--ix:${p[0]};--iy:${p[1]}"></span></span>`;
  return '<span class="edic">'+(EDI[k]||EDI.sel)+'</span>';
}

/* ---------- comandos declarados (paleta + ribbon + linha de comando) ---------- */
var ED_CMDS=[
  {g:'Feição', it:[
    {k:'sel',     ic:'sel',     n:'Selecionar', ali:['selecionar','editar'], run:()=>{ ferramentaEncerraComando('select'); if(!ED.on) edLigar(true, true); else if(typeof setTool==='function') setTool('select'); toast('Toque numa feição para editar'); }},
    {k:'fdel',    ic:'fdel',    n:'Apagar feição', ali:['apagar'], run:edApagarFeicao},
    {k:'explode', ic:'explode', n:'Explodir', ali:['explodir'], run:edExplodir},
    {k:'unir',    ic:'unir',    n:'Unir', ali:['unir','juntar'], run:edUnir},
    {k:'continuar', ic:'continuar', n:'Continuar desenho', ali:['continuar','continuardesenho','retomar'], run:()=>continuarDesenho()},
  ]},
  {g:'Vértice', it:[
    {k:'vadd',    ic:'vadd',    n:'Inserir', ali:['inserir'], run:()=>toast('Toque no ○ cinza do meio do segmento')},
    {k:'vdel',    ic:'vdel',    n:'Apagar', ali:['apagarvertice'], run:edApagarVertice},
    {k:'vmove',   ic:'vmove',   n:'Mover', ali:['moververtice'], run:()=>toast('Arraste o vértice marcado (com snap)')},
    {k:'vz',      ic:'vz',      n:'Δz vértice', ali:['dz'], run:()=>edAbreDeltaZ(false)},
    {k:'vzf',     ic:'vz',      n:'Δz feição', ali:['dzfeicao'], run:()=>edAbreDeltaZ(true)},
    {k:'terreno', ic:'terreno', n:'Cota do terreno', ali:['cota'], run:edCotaTerreno},
  ]},
  {g:'Segmento', it:[
    {k:'sdel',    ic:'sdel',    n:'Apagar segmento', ali:['apagarsegmento'], run:edApagarSegmento},
    {k:'quebrar', ic:'quebrar', n:'Quebrar aqui', ali:['quebrar'], run:edQuebrar},
    {k:'trecho',  ic:'trecho',  n:'Apagar trecho', ali:['trecho','recortar'], run:edAbreTrecho},
  ]},
  {g:'Linha', it:[
    {k:'fechar',  ic:'fechar',  n:'Fechar', ali:['fechar'], run:edFechar},
    {k:'abrir',   ic:'abrir',   n:'Abrir', ali:['abrir'], run:edAbrir},
    {k:'rev',     ic:'rev',     n:'Inverter', ali:['inverter'], run:edInverter},
    {k:'estend',  ic:'estend',  n:'Estender', ali:['estender'], run:edEstender},
  ]},
  {g:'Polígono', it:[
    {k:'pdivreta', ic:'psplit_reta',   n:'Dividir por reta', ali:['dividir','dividirreta','dividirporreta','cortarpoligono'], run:()=>edDividir('reta')},
    {k:'pdivig',   ic:'psplit_iguais', n:'Partes iguais',    ali:['partesiguais','dividiriguais','dividirpartes'], run:()=>edDividir('iguais')},
  ]},
  {g:'Transformar', it:[
    {k:'mover',   ic:'mover',   n:'Mover', ali:['mover'], run:()=>edTransform('mover')},
    {k:'copiar',  ic:'copiar',  n:'Copiar', ali:['copiar'], run:()=>edTransform('copiar')},
    {k:'girar',   ic:'girar',   n:'Girar', ali:['girar','rotacionar'], run:edAbreGirar},
    {k:'escalar', ic:'escalar', n:'Escalar', ali:['escalar'], run:edAbreEscala},
    {k:'espelho', ic:'espelho', n:'Espelhar', ali:['espelhar'], run:()=>edTransform('espelhar')},
    {k:'parale',  ic:'parale',  n:'Paralela', ali:['paralela','offset'], run:()=>edAbreParalela('paralela')},
    {k:'offset2', ic:'offset2', n:'Offset 2 lados', ali:['offset2','doislados','ambos'], run:()=>edAbreParalela('offset2')},
  ]},
  {g:'Geometria', it:[
    {k:'simplif', ic:'simplif', n:'Simplificar', ali:['simplificar'], run:edAbreSimplificar},
    {k:'densif',  ic:'densif',  n:'Densificar', ali:['densificar'], run:edDensificarComando},
    {k:'suaviz',  ic:'suaviz',  n:'Suavizar', ali:['suavizar'], run:edAbreSuavizar},
  ]},
];
function edCmdPorAlias(txt){
  /* três passagens: chave exata, depois apelido, só então nome. Numa passagem só,
     'mover' casava com o NOME de "Mover vértice" (vmove), que vem antes na lista. */
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  const t=norm(txt); if(!t) return null;
  const all=[]; for(const G of ED_CMDS) for(const c of G.it) all.push(c);
  return all.find(c=>c.k===t) || all.find(c=>(c.ali||[]).includes(t)) || all.find(c=>norm(c.n)===t) || null;
}

/* ---------- paleta flutuante ---------- */
function edMontarPaleta(){
  if(document.getElementById('edBox')) return;
  const b=document.createElement('div'); b.id='edBox';
  let html='<div class="edh"><b>⬖ Editor de vetores</b><div style="flex:1"></div>'+
    '<span class="edmin" title="Recolher">–</span><span class="edx" title="Sair do editor">✕</span></div>'+
    '<div class="edb">';
  html+='<div class="edsel" id="edSelInfo">Nenhuma feição selecionada</div>';
  ED_CMDS.forEach(G=>{
    html+='<div class="edg">'+G.g+'</div><div class="edgrid">';
    G.it.forEach(c=>{ html+=`<button class="edbtn" data-k="${c.k}" title="${c.n}">${edIco(c.ic)}<span>${c.n}</span></button>`; });
    html+='</div>';
  });
  html+='<div class="edg">Parâmetros</div><div class="edpar">'+
    '<label>Δz (m)<input type="number" id="edPdz" value="1" step="0.5"></label>'+
    '<label>Ângulo (°)<input type="number" id="edPang" value="15" step="5"></label>'+
    '<label>Fator<input type="number" id="edPfat" value="1.1" step="0.05"></label>'+
    '<label>Distância (m)<input type="number" id="edPdist" value="5" step="1"></label>'+
    '<label>Tolerância (m)<input type="number" id="edPtol" value="1" step="0.5"></label>'+
    '<label>Passo (m)<input type="number" id="edPpasso" value="5" step="1"></label>'+
    '<label>Suavizar (×)<input type="number" id="edPiter" value="2" min="1" max="5" step="1"></label>'+
    '<label class="edchk"><input type="checkbox" id="edPmaior"> trecho: lado maior</label>'+
    '<label class="edchk"><input type="checkbox" id="edPbufReto"> buffer: pontas retas</label>'+
    '<label class="edchk"><input type="checkbox" id="edPbufDiss" checked> buffer: dissolver</label>'+
    '<label>Buffer: lados do arco<input type="number" id="edPbufSeg" value="12" min="4" max="48" step="2"></label>'+
    '</div></div>';
  b.innerHTML=html;
  document.body.appendChild(b); ED.box=b;
  b.querySelectorAll('.edbtn').forEach(bt=>{
    bt.onclick=()=>{ const c=edCmdPorAlias(bt.dataset.k); if(c&&c.run) try{ c.run(); }catch(e){ toast('Falha: '+(e&&e.message||e)); } };
  });
  b.querySelector('.edx').onclick=()=>edLigar(false);
  b.querySelector('.edmin').onclick=()=>{ ED.min=!ED.min; b.classList.toggle('min',ED.min); };
  // arrastar pela barra de título
  const h=b.querySelector('.edh'); let d=null;
  h.addEventListener('pointerdown',e=>{ if(document.body.classList.contains('alagis3')||e.target.closest('.edx,.edmin')) return;
    const r=b.getBoundingClientRect(); d={x:e.clientX-r.left, y:e.clientY-r.top}; h.setPointerCapture(e.pointerId); });
  h.addEventListener('pointermove',e=>{ if(!d) return;
    b.style.left=Math.max(4,Math.min(innerWidth-60, e.clientX-d.x))+'px';
    b.style.top =Math.max(4,Math.min(innerHeight-40, e.clientY-d.y))+'px';
    b.style.right='auto'; });
  h.addEventListener('pointerup',()=>{ d=null; });
}
function edPainelSync(){
  const el=document.getElementById('edSelInfo'); if(!el) return;
  if(!ED.sel){ el.textContent='Nenhuma feição selecionada'; return; }
  const {L,f,idx}=ED.sel; const rings=edRings(L,f);
  const nv=rings.reduce((s,r)=>s+r.length,0);
  el.innerHTML=`<b>${esc(L.name)}</b> · feição ${idx+1} · ${L.gtype}<br>`+
    `${rings.length} anel(is) · ${nv} vértice(s)`+(ED.vi>=0? ` · vértice ${ED.vi+1} marcado`:'');
}
function edLigar(on, semPaleta){
  window.GeoMineMouseRotation?.cancel();
  window.GeoMineDragMove?.cancel();
  window.GeoMinePolygonEdgeDrag?.clear();
  ED.on=!!on;
  edMontarPaleta();
  // a paleta flutuante é opcional: só aparece se NÃO foi pedida a supressão
  // (os comandos da ribbon editam direto, sem forçar a janela na tela)
  if(ED.box){ if(semPaleta && on) ED.box.classList.remove('on');
              else ED.box.classList.toggle('on',ED.on); }
  if(ED.on){
    // ferramenta de SELEÇÃO (◈), não a mão do pan, para clicar/editar a feição
    if(typeof setTool==='function') setTool('select');
    try{ map.doubleClickZoom.disable(); }catch(e){}
    if(!ED.sel && S.selFeat && S.selFeat.layer){
      const q=S.selFeat;                       // mesma feição: preserva a parte realçada (partIdx)
      edSelecionar({L:q.layer, idx:q.idx, f:q.layer.features[q.idx]}, true);
      S.selFeat=q;
    }
    cmdLog('editor de vetores ligado — toque numa feição para começar','info');
  } else {
    ED.pend=null; ED.drag=null;
    try{ if(typeof edFechaCtx==='function') edFechaCtx(); }catch(e){}
    try{ map.doubleClickZoom.enable(); }catch(e){}
    mapaPanPadrao();
  }
  edRedraw(); edPainelSync();
}
/* Esc em cadeia: 1º cancela o comando armado, 2º o vértice, 3º a feição,
   4º DESLIGA o editor (sai do modo de edição por completo) */
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape' || !ED.on) return;
  const t=e.target; if(t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
  if(ED._ctx){ edFechaCtx(); ribbonBuild(); toast('Opções canceladas'); return; }
  if(ED.pend){ ED.pend=null; toast('Comando cancelado'); edRedraw(); edPainelSync(); return; }
  if(ED.vi>=0){ ED.vi=-1; edRedraw(); edPainelSync(); return; }
  if(ED.sel){ edSelecionar(null); toast('Feição desmarcada'); return; }
  edLigar(false); toast('Editor de vetores desligado');   // nada mais a cancelar: sai do editor
});
/* Esc UNIVERSAL (rede final): sai de QUALQUER ferramenta/modo ativo voltando
   ao pan. Roda depois dos handlers específicos (drenagem já finaliza sozinha,
   modais já fecham); só age se ainda houver uma ferramenta armada.           */
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape') return;
  const t=e.target; if(t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
  if(ED.on) return;                       // editor tem seu próprio Esc em cadeia
  // se um modal/painel flutuante está aberto, deixa os handlers deles agirem
  if(document.querySelector('.modal-bg.on')) return;
  const ferrAtivas=['line','poly','point','profile','basin','measure','selpoly',
                    'inund','barr','lamina','info','del','vertex'];
  if(ferrAtivas.includes(S.tool)){
    // traçado de linha/polígono em andamento: 1º Esc limpa, 2º Esc sai
    if(['line','poly'].includes(S.tool) && S.drawBuf && S.drawBuf.length){
      try{ clearDraw(); }catch(err){} toast('Traçado cancelado');
    }
    try{ setTool('select'); }catch(err){ S.tool='select'; }
    toast('Ferramenta encerrada');
  }
});


/* ---------- ícones próprios do módulo Hidro (convenção do app) ---------- */
(function hidroIcones(){
  const A='<svg viewBox="0 0 24 24">', Z='</svg>', g='stroke="#8b949e"';
  const H={};
  // barramento: reservatório à esquerda, parede âmbar, vale à direita
  H.barramento = A+'<path class="softamb" d="M2 11h9v8H2z"/><path '+g+' d="M2 11h9"/>'+
    '<path class="fillamb" d="M11 4h3v15h-3z"/><path d="M11 4h3v15h-3z"/>'+
    '<path '+g+' d="M14 19l3-5 5 5"/><path '+g+' d="M2 19h20"/>'+Z;
  // tempo de concentração: relógio + gota
  H.tempoconc = A+'<circle '+g+' cx="9" cy="14" r="6"/><path d="M9 10.5V14l2.6 1.6"/>'+
    '<path class="fillamb" d="M18 3.5c2.1 2.6 3.2 4.3 3.2 5.5a3.2 3.2 0 0 1-6.4 0c0-1.2 1.1-2.9 3.2-5.5z"/>'+Z;
  // encher a partir de um ponto: perfil + lâmina + ponto âmbar
  H.inund_ponto = A+'<path '+g+' d="M2 19l4-7 4 5 4-9 6 11z"/><path d="M3 15h17"/>'+
    '<circle class="fillamb" cx="9" cy="15" r="2.4"/>'+Z;
  // encher do fundo: seta descendo até o ponto mais baixo
  H.inund_fundo = A+'<path '+g+' d="M2 19l4-7 4 5 4-9 6 11z"/><path d="M3 15h17"/>'+
    '<path d="M9 4v6M6.6 7.6L9 10l2.4-2.4"/><circle class="fillamb" cx="9" cy="16.6" r="1.8"/>'+Z;
  // alagar tudo abaixo da cota: lâmina cheia
  H.inund_tudo = A+'<path '+g+' d="M2 19l4-7 4 5 4-9 6 11z"/><path class="softamb" d="M2 15h20v4H2z"/>'+
    '<path d="M2 15h20"/><path '+g+' d="M2 19h20"/>'+Z;
  // limpar manchas
  H.inund_limpa = A+'<path '+g+' d="M2 19l4-7 4 5 4-9 6 11z"/><path d="M2 15h9"/>'+
    '<path d="M15 12.5l5 5M20 12.5l-5 5" stroke-width="1.9"/>'+Z;
  try{ if(typeof RIB_SVG==='object') Object.keys(H).forEach(k=>{ if(!RIB_SVG[k]) RIB_SVG[k]=H[k]; }); }catch(e){}
})();

/* ---------- integração: ícones, aba na ribbon, ponteiro ---------- */
(function edInit(){
  try{ if(typeof RIB_SVG==='object') Object.keys(EDI).forEach(k=>{ RIB_SVG['ed_'+k]=EDI[k]; }); }catch(e){}
  try{
    if(typeof CATS!=='undefined' && !CATS.some(c=>c.id==='editor')){
      const pos=CATS.findIndex(c=>c.id==='gis');
      CATS.splice(pos>=0?pos+1:1, 0, {id:'editor', nome:'EDITOR DE VETORES', view:'map',
        grupos: ED_CMDS.map(G=>({label:G.g, it:G.it.map(c=>({
          ic:ED_PNG_ICONS[c.ic]||'selecionar', nome:c.n,
          act:()=>{ if(!ED.on) edLigar(true, true); try{ c.run(); }catch(e){ toast('Falha: '+(e&&e.message||e)); } }
        }))}))
      });
      if(typeof ribbonBuild==='function') ribbonBuild();
    }
  }catch(e){ console.warn('ribbon do editor:',e); }
  try{ edBindPointer(); }catch(e){ console.warn('ponteiro do editor:',e); }
  try{ edMontarPaleta(); }catch(e){}
})();


/* ===== ÍCONES HIDRO/DRENAGEM ===== */
