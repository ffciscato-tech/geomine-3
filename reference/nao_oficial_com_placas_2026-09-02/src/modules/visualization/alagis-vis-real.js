
/* ============================================================================
   VISIBILIDADE REAL POR COTA — para QUALQUER camada vetorial com Z
   Cada trecho é comparado com o MDT visível: o segmento cuja cota está abaixo
   do terreno é o que a topografia esconderia de verdade. Com o raster opaco
   (opacidade 1) ele SOME; com o raster translúcido, aparece esmaecido com a
   transparência complementar (opacidade 0,7 do terreno → linha enterrada a
   0,3) e tracejado — o afloramento fica evidente onde a linha "nasce".
   O corte não é por vértice: o ponto exato onde a linha fura o terreno é
   interpolado, então o traço abre/fecha na cota certa, não no vértice mais
   próximo.
   ========================================================================== */
function visRealTerreno(){
  const cands=(S.rasters||[]).filter(r=>r&&r.visible!==false&&r.d&&r.d.z&&!r._cnOrto);
  if(!cands.length) return null;
  if(Array.isArray(S.stack))
    for(const k of S.stack){ const m=/^R:(.+)$/.exec(String(k)); if(!m) continue;
      const r=cands.find(x=>String(x.id)===m[1]); if(r) return r; }
  return cands[0];
}
function desenhaVisRealCamada(L){
  const R=visRealTerreno(); if(!R) return false;      // sem MDT: renderização normal
  /* guarda de desempenho: amostrar o MDT vértice a vértice tem custo */
  let nv=0; (L.features||[]).forEach(f=>{ (function c(g){ if(!Array.isArray(g)) return;
    if(typeof g[0]==='number'){ nv++; return; } g.forEach(c); })(f&&f.geom); });
  if(nv>20000){ if(!L._visRealAviso){ L._visRealAviso=1;
      toast('"'+L.name+'": '+nv.toLocaleString('pt-BR')+' vértices — demais para a visibilidade real; renderização normal'); }
    return false; }
  const d=R.d;
  const opT=Math.max(0,Math.min(1,(R.style&&R.style.opacity!=null)?+R.style.opacity:1));
  /* PISO DE LEITURA: 1−opacidade era fiel, mas ilegível — com o terreno a
     0,7 a linha enterrada saía a 0,3 e sumia sobre a ortofoto. A regra
     continua binária no extremo (terreno OPACO esconde de verdade), mas
     enquanto houver translucidez a linha enterrada nunca desce de 0,45 e o
     tracejado ganha um HALO claro por baixo, que a destaca em qualquer
     fundo. */
  const opBaixo=(opT>=0.999)?0:Math.min(0.9,Math.max(0.45,1-opT));
  const paneNome=panelDaCamada('L'+L.id), PN={pane:paneNome};
  const fg=L2.featureGroup([]);
  const proj=p=>{ if(L.crs===S.workCRS) return [p[0],p[1]];
    const w=toWGS(L.crs,p[0],p[1]); return fromWGS(S.workCRS,w[0],w[1]); };
  const zTer=(x,y)=>{ const v=sampleZbil(d,x,y); return isFinite(v)?v:-Infinity; };
  const st0=f=>{ const c=(typeof classOf==='function'&&classOf(L,f))||{};
    const sy=L.sym||{};
    return {color:c.color||sy.stroke||sy.color||L.color||'#e08a1e',
            weight:(c.weight!=null?c.weight:(sy.weight!=null?sy.weight:(L.weight!=null?L.weight:2))),
            dash:(c.dash!=null?c.dash:sy.dash)||null}; };
  (L.features||[]).forEach((f,idx)=>{
    if(typeof attrFilterMatch==='function'&&!attrFilterMatch(L,f)) return;
    if(!f||!f.geom) return;
    const st=st0(f);
    if(L.gtype==='point'){
      const p=f.geom[0]; if(!p) return;
      const c=proj(p), z=(f.zg&&isFinite(f.zg[0]))?+f.zg[0]:Infinity;
      const acima=z>=zTer(c[0],c[1])-1e-6, op=acima?1:opBaixo;
      if(op<=0.02) return;
      const w=toWGS(S.workCRS,c[0],c[1]);
      if(!acima){ const hl=L2.circleMarker([w[1],w[0]],{radius:6,color:'#ffffff',
        weight:2,fillOpacity:0,opacity:Math.min(0.85,op*0.9),...PN});
        hl._fidx=idx; fg.addLayer(hl); }
      const mk=L2.circleMarker([w[1],w[0]],{radius:4,color:st.color,weight:1.4,
        fillColor:st.color,fillOpacity:op,opacity:op,...PN});
      mk._fidx=idx; fg.addLayer(mk);
      return;
    }
    const anels=(f.multi&&Array.isArray(f.geom[0])&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
    const zgs=(f.zg&&Array.isArray(f.zg[0]))?f.zg:(f.zg?[f.zg]:null);
    anels.forEach((r0,ri)=>{
      if(!Array.isArray(r0)||r0.length<2) return;
      const zg=zgs&&zgs[ri];
      const P=r0.map((p,i)=>{ const c=proj(p);
        const z=(zg&&isFinite(+zg[i]))?+zg[i]:Infinity;   // sem cota: sempre visível
        return {x:c[0],y:c[1],z,zt:zTer(c[0],c[1])}; });
      if(L.gtype==='polygon'){ const a=P[0],b=P[P.length-1];
        if(Math.hypot(a.x-b.x,a.y-b.y)>1e-9) P.push({...P[0]}); }
      const acimaDe=q=>q.z>=q.zt-1e-6;
      const segsA=[],segsB=[];
      let atual=[P[0]], acx=acimaDe(P[0]);
      const solta=()=>{ if(atual.length>1)(acx?segsA:segsB).push(atual); };
      for(let i=1;i<P.length;i++){
        const a=P[i-1],b=P[i],ab=acimaDe(b);
        if(ab===acx){ atual.push(b); continue; }
        const fa=a.z-a.zt, fb=b.z-b.zt,
          t=(fa===fb)?0.5:Math.max(0,Math.min(1,fa/(fa-fb))),
          xi={x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t};
        atual.push(xi); solta();
        atual=[xi,b]; acx=ab;
      }
      solta();
      const paraLL=seg=>seg.map(q=>{ const w=toWGS(S.workCRS,q.x,q.y); return [w[1],w[0]]; });
      segsA.forEach(sg=>{ const pl=L2.polyline(paraLL(sg),{color:st.color,weight:st.weight,
        opacity:1,dashArray:st.dash||null,...PN}); pl._fidx=idx; fg.addLayer(pl); });
      if(opBaixo>0.02)
        segsB.forEach(sg=>{ const lls=paraLL(sg);
          /* halo primeiro, linha por cima: o par branco+cor lê em ortofoto
             clara, mata escura e MDT sombreado */
          const halo=L2.polyline(lls,{color:'#ffffff',
            weight:Math.max(0.8,st.weight*0.9)+2.6,opacity:Math.min(0.85,opBaixo*0.9),
            dashArray:'6 5',...PN});
          const pl=L2.polyline(lls,{color:st.color,
            weight:Math.max(0.9,st.weight*0.95),opacity:opBaixo,dashArray:'6 5',...PN});
          halo._fidx=idx; pl._fidx=idx;
          fg.addLayer(halo); fg.addLayer(pl); });
    });
  });
  fg.on('click',e=>{
    /* CAPTURA PENDENTE (Início/Reposicionar rampa etc.): o toque sobre uma
       feição pertence ao comando — sem isto o handler da feição engolia o
       clique e o comando nunca recebia o ponto ("não redesenha"). */
    if(typeof S._pickPonto==='function'){
      L2.DomEvent.stop(e);
      const ll=(e.originalEvent&&map.mouseEventToLatLng)
        ?map.mouseEventToLatLng(e.originalEvent):e.latlng;
      const fcb=S._pickPonto; S._pickPonto=null; S._pickCancel=null;
      try{ fcb(ll); }catch(err){ console.warn('captura', err); }
      return;
    }
    if(S.tool==='select'||S.tool==='pan'||S.tool==='del'||S.tool==='vertex'){
      const idx=(e.layer&&e.layer._fidx!=null)?e.layer._fidx:0;
      pickFeature(L,idx,e.latlng); L2.DomEvent.stop(e);
    }
  });
  L.llayer=fg.addTo(map);
  if(!L.visible) map.removeLayer(fg);
  zApply();
  return true;
}
/* Opacidade do raster mudou → as camadas em visibilidade real acompanham. */
(function visRealSegueOpacidade(){
  let t=null;
  document.addEventListener('input',e=>{
    if(!e.target||e.target.id!=='rasOp') return;
    clearTimeout(t);
    t=setTimeout(()=>{ (S.layers||[]).forEach(l=>{ if(l.visReal){ try{ drawLayer(l); }catch(_){} } }); },200);
  },true);
})();
