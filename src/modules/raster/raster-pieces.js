/* GeoMine — apagar um PEDAÇO de raster.
   Pedido de 22/11/2026 (print com os pedaços soltos do MDT recortado circulados): "também
   devo poder apagar pedaços raster". Com a lixeira armada, o toque num pedaço do raster —
   a região conexa de células com valor em volta do ponto tocado (8 vizinhos) — transforma o
   pedaço em NoData. Ctrl+Z traz de volta.

   Vale para superfícies que o GeoMine guarda inteiras no projeto (MDT recortado da cava/DCE
   e demais grades geradas em memória). Um MDT importado continua sendo lido do arquivo
   original na resolução nativa: apagar células só na grade de trabalho deixaria tela, perfil
   e projeto em desacordo, então ele é recusado com aviso.

   Cuidados:
   - o toque só chega aqui quando não há feição vetorial sob o dedo (nem perto dele);
   - raster de um pedaço só não é apagado por aqui (a camada sai pela árvore);
   - pedaço com mais da metade das células pede confirmação;
   - no MDT recortado o volume e a área do corte são corrigidos junto. */
(function(root){
  'use strict';
  const LIMITE_DESFAZER=2e6;                       /* células guardadas para o Ctrl+Z (16 MB) */
  const valido=v=>v===v&&v!==Infinity&&v!==-Infinity;   /* número de verdade (NaN é o NoData) */
  /* S e map são declarações de topo do aplicativo (const/let): existem pelo nome, não em window. */
  const estado=()=>{ try{ return S; }catch(e){ return root.S; } };
  const mapa=()=>{ try{ return map; }catch(e){ return root.map; } };

  /* Região conexa (8 vizinhos) de células válidas a partir de (linha, coluna), por varredura
     de linhas: a pilha guarda uma semente por trecho, não uma por célula. Devolve a máscara
     (1 nas células do pedaço), a contagem e a caixa. */
  function pedaco(d,linha,coluna){
    const nc=d.nc, nr=d.nr, z=d.z, n=nc*nr;
    if(!(linha>=0&&coluna>=0&&linha<nr&&coluna<nc)||!valido(z[linha*nc+coluna])) return null;
    const marca=new Uint8Array(n), pilha=[linha*nc+coluna];
    marca[pilha[0]]=1;
    let total=0, r0=linha, r1=linha, c0=coluna, c1=coluna;
    while(pilha.length){
      const i=pilha.pop(), r=(i/nc)|0, c=i-r*nc, base=r*nc;
      let e=c, dd=c;
      while(e>0&&!marca[base+e-1]&&valido(z[base+e-1])){ e--; marca[base+e]=1; }
      while(dd<nc-1&&!marca[base+dd+1]&&valido(z[base+dd+1])){ dd++; marca[base+dd]=1; }
      total+=dd-e+1;
      if(r<r0)r0=r; if(r>r1)r1=r; if(e<c0)c0=e; if(dd>c1)c1=dd;
      const a=Math.max(0,e-1), b=Math.min(nc-1,dd+1);
      for(const rr of [r-1,r+1]){
        if(rr<0||rr>=nr) continue;
        const bs=rr*nc;
        for(let k=a;k<=b;k++){
          if(marca[bs+k]||!valido(z[bs+k])) continue;
          marca[bs+k]=1; pilha.push(bs+k);
          /* o resto deste trecho é marcado quando a semente for expandida */
          while(k<b&&!marca[bs+k+1]&&valido(z[bs+k+1])) k++;
        }
      }
    }
    return {marca, total, r0, r1, c0, c1};
  }
  function validas(d){ let n=0; const z=d.z; for(let i=0;i<z.length;i++) if(valido(z[i])) n++; return n; }
  /* Célula válida mais próxima de (linha, coluna) dentro de um raio em células. */
  function maisProxima(d,linha,coluna,raio){
    let melhor=null, dm=Infinity;
    for(let r=Math.max(0,linha-raio);r<=Math.min(d.nr-1,linha+raio);r++)
      for(let c=Math.max(0,coluna-raio);c<=Math.min(d.nc-1,coluna+raio);c++){
        if(!valido(d.z[r*d.nc+c])) continue;
        const q=(r-linha)*(r-linha)+(c-coluna)*(c-coluna);
        if(q<dm&&q<=raio*raio){ dm=q; melhor=[r,c]; }
      }
    return melhor;
  }
  /* Por que este raster não pode ter pedaços apagados ('' = pode). */
  function motivo(r){
    const d=r&&r.d;
    if(!d||!d.z||!(d.nc>0&&d.nr>0)) return 'sem grade';
    if(d.tin||r.tinPuro) return 'é uma superfície triangulada (TIN)';
    let precisa=false; try{ precisa=typeof root.precisaFonte==='function'&&root.precisaFonte(d); }catch(e){}
    if(d._img0||d._tiff||d._full||r._projectSourceRaw||r._projectNativeBinding||r.originalSource||r.projectNativeSource||precisa)
      return 'é lido do arquivo original';
    return '';
  }
  const celula=(d,x,y)=>[Math.floor((d.yll+d.nr*d.cs-y)/d.cs), Math.floor((x-d.xll)/d.cs)];

  /* Apaga (ou repõe) as células e corrige o que depende delas. sinal −1 apaga, +1 repõe. */
  function volumeDoPedaco(r,idx,val){
    const src=r.src;
    if(!src||src.kind!=='cava2-clipped'||!src.volumes) return null;
    const fonte=(estado().rasters||[]).find(q=>q.id===src.sourceRasterId), d=r.d;
    if(!fonte||!fonte.d||typeof root.sampleZbil!=='function') return null;
    const pilha=src.volumes.kind!=='cava', a=d.cs*d.cs; let v=0;
    for(let k=0;k<idx.length;k++){
      const i=idx[k], row=(i/d.nc)|0, col=i-row*d.nc, t=root.sampleZbil(fonte.d,d.xll+(col+.5)*d.cs,d.yll+(d.nr-row-.5)*d.cs);
      if(valido(t)) v+=Math.max(0,pilha?val[k]-t:t-val[k])*a;
    }
    return v;
  }
  function aplica(r,idx,val,sinal,dv){
    const d=r.d, z=d.z;
    if(sinal<0) for(let k=0;k<idx.length;k++) z[idx[k]]=NaN;
    else for(let k=0;k<idx.length;k++) z[idx[k]]=val[k];
    const vol=r.src&&r.src.kind==='cava2-clipped'?r.src.volumes:null;
    if(vol){
      if(dv!=null&&valido(+vol.volume)) vol.volume=Math.max(0,+vol.volume+sinal*dv);
      if(valido(+vol.validCells)){ vol.validCells=Math.max(0,+vol.validCells+sinal*idx.length); vol.area=vol.validCells*d.cs*d.cs; }
      if(d.cutVolume&&d.cutVolume!==vol) Object.assign(d.cutVolume,{volume:vol.volume, validCells:vol.validCells, area:vol.area});
      try{ const des=root.CCMGISCava2?.state?.desenhos?.find(q=>q.resultadoCorte&&q.resultadoCorte.surfaceId===r.id);
        if(des){ des.resultadoCorte.volumes=Object.assign({},des.resultadoCorte.volumes,{volume:vol.volume, validCells:vol.validCells, area:vol.area}); root.CCMGISCava2.syncStyles?.(); } }catch(e){}
    }
    /* tudo o que foi calculado da grade antiga deixa de valer */
    d._sig=null; d._sourceStats=null;
    r._st=null; r._stFull=null; r._geomInfo=null; r._geomInfoKey=null; r._url=null; r._urlHi=null; r._hiKey=null;
    r._dataRev=(+r._dataRev||0)+1;
    try{ root.renderRaster(r); }catch(e){ console.warn('pedaço de raster: redesenho',e); }
    try{ root.refreshUI(); }catch(e){}
    try{ root.GeoMineSessionAutosave?.markDirty('pedaço de raster apagado'); }catch(e){}
  }

  const fmtArea=m2=>m2>=1e4?(m2/1e4).toLocaleString('pt-BR',{maximumFractionDigits:2})+' ha':m2.toLocaleString('pt-BR',{maximumFractionDigits:m2<100?1:0})+' m²';
  const avisa=t=>{ try{ root.toast(t); }catch(e){} };

  /* Pedaço solto: nem o raster inteiro, nem o corpo principal (mais da metade das células). */
  function solto(d,linha,coluna){
    const P=pedaco(d,linha,coluna); if(!P) return false;
    const todas=validas(d); return P.total<todas&&P.total/todas<=.5;
  }
  /* De qual raster é o toque. Vale o raster visível mais alto com célula com valor exatamente
     sob o ponto. A folga do dedo (`folga`) só serve para um pedaço SOLTO de raster apagável que
     esteja acima disso: é o que deixa acertar uma lasca de poucos pixels sem que o MDT de baixo
     responda no lugar dela, e sem que um toque ao lado do corpo principal vire pergunta.
     null quando o toque não é de raster nenhum. */
  function alvoDoToque(e,folga){
    const S=estado(); if(!S||!e||!e.latlng) return null;
    let p; try{ p=root.fromWGS(S.workCRS,e.latlng.lng,e.latlng.lat); }catch(_){ return null; }
    if(!p||!valido(p[0])||!valido(p[1])) return null;
    /* tolerância do dedo em metros, pela escala do mapa */
    let tolM=0; if(folga) try{ const m=mapa(), q=m.containerPointToLatLng(m.latLngToContainerPoint(e.latlng).add([S.touch?22:10,0])), w=root.fromWGS(S.workCRS,q.lng,q.lat); tolM=Math.hypot(w[0]-p[0],w[1]-p[1]); }catch(_){}
    let nos=[]; try{ nos=root.stackSync().filter(n=>n.t==='R'&&n.o&&n.o.visible!==false&&n.o.d&&n.o.d.z&&!n.o.d.tin); }catch(_){ nos=(S.rasters||[]).filter(r=>r&&r.visible!==false&&r.d&&r.d.z).map(o=>({o})); }
    let reserva=null;
    for(const n of nos){
      const r=n.o, d=r.d;
      let x=p[0], y=p[1];
      try{ if(d.crs&&d.crs!==S.workCRS&&typeof root.reproj==='function'){ const q=root.reproj(S.workCRS,d.crs,x,y); x=q[0]; y=q[1]; } }catch(_){}
      const [lin,col]=celula(d,x,y), raio=Math.max(0,Math.min(40,Math.ceil(tolM/d.cs)));
      if(lin<-raio||col<-raio||lin>=d.nr+raio||col>=d.nc+raio) continue;
      if(lin>=0&&col>=0&&lin<d.nr&&col<d.nc&&valido(d.z[lin*d.nc+col])){
        if(reserva&&motivo(r)) return reserva;
        return {r, linha:lin, coluna:col, exato:true};
      }
      if(raio&&!reserva&&!motivo(r)){
        const q=maisProxima(d,lin,col,raio);
        if(q&&solto(d,q[0],q[1])) reserva={r, linha:q[0], coluna:q[1], exato:false};
      }
    }
    return reserva;
  }
  /* Toque no mapa com a lixeira armada, sem feição por perto. Devolve true quando o toque era
     de um raster. */
  function mapClick(e){
    const a=alvoDoToque(e,true); if(!a) return false;
    const por=motivo(a.r);
    if(por){ avisa('“'+a.r.name+'” '+por+': apagar pedaços vale para as superfícies geradas no GeoMine (MDT recortado, cortes).'); return true; }
    apagaPedaco(a.r,a.linha,a.coluna);
    return true;
  }
  /* Toque com a lixeira que ficou JUNTO de uma feição, sem acertá-la: nada é apagado (quem errou
     a linha por pouco não pode perder um pedaço do MDT). Se ali embaixo há um pedaço solto de
     raster que poderia ser apagado, a pessoa fica sabendo por que nada aconteceu. */
  function avisoPerto(e,camada){
    const a=alvoDoToque(e,false); if(!a||motivo(a.r)) return false;
    if(!solto(a.r.d,a.linha,a.coluna)) return false;
    avisa('Nada apagado: o toque ficou junto de uma feição'+(camada?' de “'+camada+'”':'')+'. Para apagar o pedaço do raster, toque longe das linhas — aproxime o mapa ou oculte a camada.');
    return true;
  }
  function apagaPedaco(r,linha,coluna,op){
    op=op||{};
    const d=r.d, P=pedaco(d,linha,coluna); if(!P) return false;
    const todas=validas(d), a=d.cs*d.cs, area=P.total*a;
    if(P.total>=todas){ avisa('“'+r.name+'” é um pedaço só ('+fmtArea(area)+'). Para tirá-lo, exclua a camada na árvore.'); return false; }
    const parte=P.total/todas, guarda=P.total<=LIMITE_DESFAZER;
    if(parte>.5&&!op.semPergunta){
      let ok=false; try{ ok=root.confirm('Este é o corpo principal de “'+r.name+'”: '+fmtArea(area)+', '+Math.round(100*parte)+'% do raster.\n\nApagar mesmo assim?'+(guarda?'':'\n\nPedaço grande demais para o Ctrl+Z: não poderá ser desfeito.')); }catch(_){}
      if(!ok) return false;
    } else if(!guarda&&!op.semPergunta){
      let ok=false; try{ ok=root.confirm('Apagar '+fmtArea(area)+' de “'+r.name+'”?\n\nPedaço grande demais para o Ctrl+Z: não poderá ser desfeito.'); }catch(_){}
      if(!ok) return false;
    }
    const idx=new Int32Array(P.total), val=new Float32Array(P.total); let k=0;
    for(let row=P.r0;row<=P.r1;row++){ const b=row*d.nc; for(let c=P.c0;c<=P.c1;c++) if(P.marca[b+c]){ idx[k]=b+c; val[k]=d.z[b+c]; k++; } }
    const dv=volumeDoPedaco(r,idx,val);
    aplica(r,idx,val,-1,dv);
    if(guarda){ try{ root.undoPush({t:'rasterpiece', r, grade:d, idx, val, dv, nome:r.name, area}); }catch(e){} }
    try{ root.cmdLog('Pedaço apagado de “'+r.name+'”: '+fmtArea(area)+' ('+P.total.toLocaleString('pt-BR')+' células de '+String(d.cs).replace('.',',')+' m)'+(dv!=null?' · volume do corte −'+Math.round(dv).toLocaleString('pt-BR')+' m³':'')+'.','info'); }catch(e){}
    avisa('Pedaço apagado de “'+r.name+'”: '+fmtArea(area)+(guarda?'. Ctrl+Z desfaz.':'.'));
    return {celulas:P.total, area, dv};
  }
  /* Ctrl+Z */
  function undo(a){
    const S=estado(), i=S.undo.lastIndexOf(a); if(i>=0) S.undo.splice(i,1);
    if(!a||!(S.rasters||[]).includes(a.r)||a.r.d!==a.grade){ avisa('Não foi possível repor o pedaço: o raster mudou.'); return false; }
    aplica(a.r,a.idx,a.val,+1,a.dv);
    avisa('Pedaço de “'+a.nome+'” reposto.');
    return true;
  }
  root.GeoMineRasterPieces={mapClick, avisoPerto, alvoDoToque, apagaPedaco, undo, motivo, pedaco, validas, maisProxima};
})(typeof window!=='undefined'?window:globalThis);
