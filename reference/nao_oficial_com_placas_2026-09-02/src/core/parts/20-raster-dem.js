/* ============================================================================
   RASTERS NO MAPA (GeoTIFF) + ABA PERFIS
   ========================================================================== */
S.rasters=[]; let rid=1;

/* ---------- Render de raster por estilo ---------- */
function rasterStats(d){ let mn=Infinity,mx=-Infinity;
  for(let k=0;k<d.z.length;k++){ const v=d.z[k]; if(isNaN(v))continue; if(v<mn)mn=v; if(v>mx)mx=v; }
  return {mn,mx}; }
const HIPSO=[[0,'#1a6b3c'],[0.22,'#7fbc41'],[0.45,'#e8e07a'],[0.65,'#c98d4e'],[0.85,'#8d6e63'],[1,'#f2efe9']];
function hipsoColor(t){
  for(let i=1;i<HIPSO.length;i++){ if(t<=HIPSO[i][0]){
    const [t0,c0]=HIPSO[i-1],[t1,c1]=HIPSO[i];
    return lerpHex(c0,c1,(t-t0)/(t1-t0||1)); } }
  return HIPSO[HIPSO.length-1][1];
}
function hillVal(d,k,z){
  const r=(k/d.nc)|0,c=k%d.nc;
  if(r<1||c<1||r>=d.nr-1||c>=d.nc-1) return 200;
  // vizinhos podem ser NaN nas bordas do dado; usa o próprio pixel como fallback
  const zc=z[k];
  const zl=isNaN(z[k-1])?zc:z[k-1], zr=isNaN(z[k+1])?zc:z[k+1];
  const zu=isNaN(z[k-d.nc])?zc:z[k-d.nc], zd=isNaN(z[k+d.nc])?zc:z[k+d.nc];
  const az=315*Math.PI/180, alt=45*Math.PI/180;
  const dzdx=(zr-zl)/(2*d.cs), dzdy=(zu-zd)/(2*d.cs);
  const sl=Math.atan(Math.hypot(dzdx,dzdy)), asp=Math.atan2(dzdy,-dzdx);
  let hs=Math.cos(alt)*Math.cos(sl)+Math.sin(alt)*Math.sin(sl)*Math.cos(az-asp);
  // LUZ AMBIENTE: piso de iluminação p/ taludes íngremes não virarem preto.
  // hs ∈ [-1,1] -> [amb, 1]; amb configurável (padrão 0.42)
  const amb=(S.hsAmbient!==undefined?S.hsAmbient:0.42);
  hs=amb + (1-amb)*Math.max(0,hs);
  return Math.max(0,Math.min(255, 255*hs));
}
/* warpRaster: reprojeta a grade (resampling bilinear) usando malha de âncoras
   33×33 para a transformação (rápido: ~1k projeções em vez de 1 por célula). */
function warpRaster(d, fwd /*fn (x,y)->[X,Y] de src p/ dst*/, inv /*dst->src*/){
  const {nc,nr,cs,xll,yll,z}=d;
  /* A grade de origem pode ter célula RETANGULAR — o download de MDE vinha
     produzindo 61,47 × 41,65 m. Ler só cs e usá-lo nos dois eixos esticava a
     altura na razão cs/csy (47,6% naquele caso): ancorado em yll, o raster
     subia muito além do próprio limite enquanto a base ficava no lugar. */
  const csy=d.csy||cs;
  // bounds de destino: projetar o contorno da grade
  let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
  const NB=32;
  for(let i=0;i<=NB;i++){
    const t=i/NB;
    [[xll+t*nc*cs,yll],[xll+t*nc*cs,yll+nr*csy],[xll,yll+t*nr*csy],[xll+nc*cs,yll+t*nr*csy]]
    .forEach(([x,y])=>{const [X,Y]=fwd(x,y);
      if(X<mnX)mnX=X; if(X>mxX)mxX=X; if(Y<mnY)mnY=Y; if(Y>mxY)mxY=Y;});
  }
  const nc2=Math.max(2,Math.ceil((mxX-mnX)/cs)), nr2=Math.max(2,Math.ceil((mxY-mnY)/cs));
  // malha de âncoras da transformação INVERSA (dst -> src), 33x33
  const NA=32;
  const ax=new Float64Array((NA+1)*(NA+1)), ay=new Float64Array((NA+1)*(NA+1));
  for(let r=0;r<=NA;r++)for(let c=0;c<=NA;c++){
    const X=mnX+(c/NA)*(mxX-mnX), Y=mnY+(r/NA)*(mxY-mnY);
    const [sx,sy]=inv(X,Y);
    ax[r*(NA+1)+c]=sx; ay[r*(NA+1)+c]=sy;
  }
  const srcOf=(X,Y)=>{
    const gc=Math.min(NA-1e-9,Math.max(0,(X-mnX)/(mxX-mnX)*NA));
    const gr=Math.min(NA-1e-9,Math.max(0,(Y-mnY)/(mxY-mnY)*NA));
    const c0=Math.floor(gc), r0=Math.floor(gr), fx=gc-c0, fy=gr-r0;
    const k=r0*(NA+1)+c0;
    const sx=ax[k]*(1-fx)*(1-fy)+ax[k+1]*fx*(1-fy)+ax[k+NA+1]*(1-fx)*fy+ax[k+NA+2]*fx*fy;
    const sy=ay[k]*(1-fx)*(1-fy)+ay[k+1]*fx*(1-fy)+ay[k+NA+1]*(1-fx)*fy+ay[k+NA+2]*fx*fy;
    return [sx,sy];
  };
  const Z=(rr,cc)=>{ if(rr<0||cc<0||rr>=nr||cc>=nc) return NaN; return z[rr*nc+cc]; };
  const zOut=new Float32Array(nc2*nr2);
  for(let r=0;r<nr2;r++){
    const Y=mnY+(nr2-1-r+0.5)*cs;                   // linha 0 = topo; célula EXATA = cs
    for(let c=0;c<nc2;c++){
      const X=mnX+(c+0.5)*cs;
      const [sx,sy]=srcOf(X,Y);
      const gc=(sx-xll)/cs-0.5, gr=(nr-1)-((sy-yll)/csy-0.5); // p/ linha 0 = topo no src
      const c0=Math.floor(gc), r0=Math.floor(gr), fx=gc-c0, fy=gr-r0;
      const vv=[Z(r0,c0),Z(r0,c0+1),Z(r0+1,c0),Z(r0+1,c0+1)];
      const ww=[(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy];
      /* Na borda de um MDE recortado, um dos quatro vizinhos pode ser NoData.
         Invalidar toda a amostra erodia uma célula completa e criava a faixa
         branca entre o raster e o polígono. Renormalizar apenas os vizinhos
         válidos mantém a informação até a borda; a máscara vetorial analítica
         aplicada em rasterCanvas continua responsável pelo corte exato. */
      let sv=0,sw=0;
      for(let q=0;q<4;q++) if(Number.isFinite(vv[q])){sv+=vv[q]*ww[q];sw+=ww[q];}
      zOut[r*nc2+c]=sw>1e-12?sv/sw:NaN;
    }
  }
  return {nc:nc2,nr:nr2,cs,xll:mnX,yll:mnY,z:zOut};
}

/* Recupera o limite analítico da superfície, inclusive em projetos antigos
   que não gravavam _exactClipRings. O mesmo anel passa a comandar Mapa,
   Layout e 3D; assim não existem três bordas ligeiramente diferentes. */
function rasterClipRings(r){
  if(!r)return null;
  if(Array.isArray(r._exactClipRings)&&r._exactClipRings.length)return r._exactClipRings;
  /* No TERRENO, o anel apontado por limId é o FURO exclusivo do 3D (build3D
     o lê direto via ringsOf). Resolvê-lo aqui o transformaria em máscara do
     mapa 2D (rasterCanvas) e de rasterVisibleBounds — o MDT sumiria fora da
     caixa. Superfícies contidas (projeto/cava/dce) seguem o fluxo normal. */
  if(r._v3&&r._v3.papel==='terreno'&&r._v3.limId)return null;
  const ids=[r._v3&&r._v3.limId,r._tinSourceId].filter(v=>v!==''&&v!=null);
  let L=null;
  for(const id of ids){L=(S.layers||[]).find(x=>String(x.id)===String(id));if(L)break;}
  if(!L){
    const raiz=String(r.name||'').split(/\s+—\s+/)[0].trim().toLowerCase();
    if(raiz)L=(S.layers||[]).find(x=>String(x.name||'').trim().toLowerCase()===raiz)||null;
  }
  if(!L)return null;
  let rings=null;
  try{rings=typeof tinRecorteAutomatico==='function'?tinRecorteAutomatico(L):tinRecorteEstrutural(L);}catch(e){}
  if(rings&&rings.length){
    r._exactClipRings=rings.map(a=>a.map(q=>[q[0],q[1]]));
    r._v3=r._v3||{papel:'projeto',cor:(L.sym&&L.sym.color)||L.color||'#4f8b3a',limId:L.id};
    if(!r._v3.limId)r._v3.limId=L.id;
    return r._exactClipRings;
  }
  return null;
}
function rasterVisibleBounds(r){
  const rings=rasterClipRings(r);
  if(!rings||!rings.length)return rasterBounds(r);
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  rings.forEach(a=>a.forEach(q=>{x0=Math.min(x0,q[0]);y0=Math.min(y0,q[1]);x1=Math.max(x1,q[0]);y1=Math.max(y1,q[1]);}));
  return Number.isFinite(x0)?[x0,y0,x1,y1]:rasterBounds(r);
}

/* Pinta a grade do raster num canvas (NaN = célula sem dado = transparente).
   Usado tanto pelo overlay do mapa quanto pelo Layout. */
/* PINTOR DE CÉLULA — preparado UMA vez por desenho, aplicado por célula.
   Antes, cada célula refazia hipsoColor() e três parseInt() sobre a cor em
   hexadecimal. Num MDT de 6,3 M células isso dominava a abertura do projeto
   (~12 s por raster, medidos). Aqui a rampa hipsométrica vira uma tabela de
   2048 cores e as cores das classes são convertidas uma única vez; a função
   devolvida escreve em um vetor reaproveitado, sem alocar por pixel.
   Usada pelo canvas inteiro (rasterCanvas) e pelos tiles de alta resolução,
   para que preview e tile jamais divirjam de cor. */
function rasterPainter(r,mn,rng){
  const modo=(r.style&&r.style.mode)||'hipso';
  const px=col=>{const c=String(col||'#777777');
    return [parseInt(c.slice(1,3),16)||0,parseInt(c.slice(3,5),16)||0,parseInt(c.slice(5,7),16)||0];};
  if(modo==='cn'||modo==='slopeclass'||modo==='classes'){
    const cs=(r.style.classes||[]).map(x=>({...x,rgb:px(x.color)})), fb=px('#777777');
    if(modo==='cn') return (d,k,z,out)=>{
      const v=d.z[k]; if(isNaN(v))return false;
      let q=cs[0],bd=Infinity;
      for(const x of cs){const dd=Math.abs(v-x.value); if(dd<bd){bd=dd;q=x;}}
      const c=q?q.rgb:fb; out[0]=c[0];out[1]=c[1];out[2]=c[2]; return true;
    };
    if(modo==='slopeclass') return (d,k,z,out)=>{
      const v=d.z[k]; if(isNaN(v))return false;
      const vv=Math.round(v);
      let q=null; for(const x of cs){ if(vv===x.value){q=x;break;} }
      const c=(q||cs[0]||{rgb:fb}).rgb||fb; out[0]=c[0];out[1]=c[1];out[2]=c[2]; return true;
    };
    return (d,k,z,out)=>{
      const v=d.z[k]; if(isNaN(v))return false;
      let q=null; for(const x of cs){ if(v>=x.min&&v<=x.max){q=x;break;} }
      const c=q?q.rgb:fb; out[0]=c[0];out[1]=c[1];out[2]=c[2]; return true;
    };
  }
  /* COR SÓLIDA: a célula com dado recebe a cor escolhida, sem realce, sem
     sombreado e sem faixas. O sem-dado (NaN) segue transparente — é isso que
     deixa a superfície utilizável como máscara ou fundo chapado, mostrando
     exatamente onde há e onde não há dado. */
  if(modo==='solida'){
    const c=px((r.style&&r.style.solidColor)||'#8d5524');
    return (d,k,z,out)=>{
      if(isNaN(d.z[k]))return false;
      out[0]=c[0]; out[1]=c[1]; out[2]=c[2]; return true;
    };
  }
  if(modo==='gray') return (d,k,z,out)=>{
    const v=d.z[k]; if(isNaN(v))return false;
    let g=40+190*(v-mn)/rng; if(g>255)g=255; if(g<0)g=0;
    out[0]=out[1]=out[2]=g; return true;
  };
  if(modo==='hs') return (d,k,z,out)=>{
    if(isNaN(d.z[k]))return false;
    const hv=hillVal(d,k,z); out[0]=out[1]=out[2]=hv>255?255:hv; return true;
  };
  const NL=2048, lut=new Uint8Array(NL*3);
  for(let i=0;i<NL;i++){ const c=px(hipsoColor(i/(NL-1)));
    lut[i*3]=c[0]; lut[i*3+1]=c[1]; lut[i*3+2]=c[2]; }
  const sombra=(modo==='hipso_hs');
  return (d,k,z,out)=>{
    const v=d.z[k]; if(isNaN(v))return false;
    let t=(v-mn)/rng; t=t<0?0:(t>1?1:t);
    const o=((t*(NL-1)+0.5)|0)*3;   /* arredonda: metade do erro de quantização */
    let R=lut[o],G=lut[o+1],B=lut[o+2];
    if(sombra){ const hv=hillVal(d,k,z)/255*1.25; R*=hv; G*=hv; B*=hv;
      if(R>255)R=255; if(G>255)G=255; if(B>255)B=255; }
    out[0]=R; out[1]=G; out[2]=B; return true;
  };
}
function rasterCanvas(r, gsrc, clipCRS){
  const d=gsrc||r.d;
  const cv=document.createElement('canvas'); if(!cv.getContext) return null;
  cv.width=d.nc; cv.height=d.nr;
  const ctx=cv.getContext('2d'); const im=ctx.createImageData(d.nc,d.nr);
  const {mn,mx}=r._st||(r._st=rasterStats(r.d)); const rng=(mx-mn)||1;
  const z=d.zf||d.z;
  const pinta=rasterPainter(r,mn,rng), cor=[0,0,0], px=im.data;
  for(let k=0;k<d.nc*d.nr;k++){
    const o=k*4;
    if(!pinta(d,k,z,cor)){ px[o+3]=0; continue; }
    px[o]=cor[0]; px[o+1]=cor[1]; px[o+2]=cor[2]; px[o+3]=255;
  }
  ctx.putImageData(im,0,0);
  /* O NoData da grade sempre termina no centro/na borda de uma célula e,
     portanto, desenha a conhecida "escadinha". Para uma TIN recortada
     conservamos também o contorno analítico e aplicamos esse contorno como
     máscara vetorial antialias no canvas. Isto afeta somente a apresentação:
     as faces 3D continuam sendo os triângulos exatos de r._tinMesh. */
  const rings=rasterClipRings(r);
  if(rings&&rings.length){
    const dstCRS=clipCRS||S.workCRS;
    ctx.save();
    ctx.globalCompositeOperation='destination-in';
    ctx.beginPath();
    for(const ring of rings){
      if(!ring||ring.length<3)continue;
      for(let i=0;i<ring.length;i++){
        let x=ring[i][0],y=ring[i][1];
        if(dstCRS!==S.workCRS)[x,y]=reproj(S.workCRS,dstCRS,x,y);
        const px=(x-d.xll)/d.cs;
        const py=d.nr-(y-d.yll)/(d.csy||d.cs);
        if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);
      }
      ctx.closePath();
    }
    ctx.fillStyle='#fff';
    ctx.fill('evenodd');
    ctx.restore();
  }
  return cv;
}
/* Extensão do raster no CRS de trabalho: [W,S,E,N] */
function rasterBounds(r, g){ const d=g||r.d;
  return [d.xll, d.yll, d.xll+d.nc*d.cs, d.yll+d.nr*(d.csy||d.cs)]; }

/* Redução por MÉDIA DE BLOCO (usada só quando o canvas do navegador não
   comporta a grade nativa — o canvas tem limite de lado e de área).         */
function reduceGrid(g, maxCells, maxSide){
  const f=Math.max(1, Math.ceil(Math.sqrt((g.nc*g.nr)/maxCells)),
                      Math.ceil(g.nc/maxSide), Math.ceil(g.nr/maxSide));
  if(f<=1) return g;
  /* ceil + partição proporcional mantêm exatamente W/S/E/N. A versão
     anterior usava floor e descartava a última faixa de células; no Layout
     isso encolhia a imagem e a deslocava visualmente do limite vetorial. */
  const nc=Math.max(2,Math.ceil(g.nc/f)), nr=Math.max(2,Math.ceil(g.nr/f));
  const z=new Float32Array(nc*nr);
  for(let r=0;r<nr;r++) for(let c=0;c<nc;c++){
    let sv=0,n=0;
    const sr0=Math.floor(r*g.nr/nr),sr1=Math.max(sr0+1,Math.floor((r+1)*g.nr/nr));
    const sc0=Math.floor(c*g.nc/nc),sc1=Math.max(sc0+1,Math.floor((c+1)*g.nc/nc));
    for(let sr=sr0; sr<Math.min(g.nr,sr1); sr++)
      for(let sc=sc0; sc<Math.min(g.nc,sc1); sc++){
        const v=g.z[sr*g.nc+sc]; if(!isNaN(v)){ sv+=v; n++; } }
    z[r*nc+c]= n? sv/n : NaN;
  }
  return {nc,nr,cs:(g.nc*g.cs)/nc,
    csy:(g.nr*(g.csy||g.cs))/nr, xll:g.xll,yll:g.yll,z};
}

/* PLOTAGEM — imagem do raster na grade NATIVA (a de tela é reamostrada).
   Cacheado por estilo; cai na de tela se o nativo não estiver disponível.   */
async function rasterURLPlot(r){
  let g=await gridProd(r,'plotar a superfície');
  if(g===r.d){
    r._urlPlotBounds=rasterBounds(r,g);
    return r._url||(()=>{const cv=rasterCanvas(r); return cv?(r._url=cv.toDataURL('image/png')):null;})();
  }
  /* A extensão deve vir da grade realmente renderizada, não da grade reduzida
     usada no mapa interativo. */
  const plotBounds=rasterBounds(r,g);
  g=reduceGrid(g, PLOT_MAX_CELLS, PLOT_MAX_SIDE);   // teto do canvas (média, sem alias)
  const key=[r.style.mode,g.nc+'x'+g.nr,g.xll,g.yll,g.cs,g.csy,
    plotBounds.join(',')].join('|');
  r._urlPlotBounds=plotBounds;
  if(r._urlHi && r._hiKey===key) return r._urlHi;
  showLoad(`Renderizando ${r.name} em ${g.nc}×${g.nr}…`);
  await new Promise(rs=>setTimeout(rs,0));
  const cv=rasterCanvas(r, g);
  hideLoad();
  if(!cv) return r._url||null;
  r._hiKey=key; r._urlHi=cv.toDataURL('image/png');
  return r._urlHi;
}

/* Reprojeta a grade de exibição para Web Mercator, para que o retângulo do
   overlay coincida com a geometria real. Cacheado por grade+CRS. */
function gradeParaTela(g){
  if(!g) return null;
  if(S.workCRS==='EPSG:3857') return g;
  if(g._wm && g._wmCRS===S.workCRS) return g._wm;
  try{
    const fwd=(x,y)=>reproj(S.workCRS,'EPSG:3857',x,y);
    const inv=(X,Y)=>reproj('EPSG:3857',S.workCRS,X,Y);
    const w=warpRaster(g, fwd, inv);
    try{ Object.defineProperty(g,'_wm',{value:w,writable:true,enumerable:false,configurable:true});
         Object.defineProperty(g,'_wmCRS',{value:S.workCRS,writable:true,enumerable:false,configurable:true}); }
    catch(e){ g._wm=w; g._wmCRS=S.workCRS; }
    return w;
  }catch(e){ console.warn('warp p/ tela:', e && e.message); return g; }
}
/* ---------------------------------------------------------------------------
   Reprojeta um CANVAS já pronto (sombreado, ortofoto) para Web Mercator.
   Mesma razão do gradeParaTela: o overlay do Leaflet é um retângulo alinhado
   aos eixos e não representa a rotação da malha UTM (convergência meridiana).
   Usa malha de âncoras 33×33 como o warpRaster — projetar pixel a pixel seria
   milhões de chamadas ao proj4.
   Devolve {cv, b} com b já em Web Mercator, ou o original se não houver o que
   reprojetar.
   --------------------------------------------------------------------------- */
function warpCanvasWM(cv, b){
  if(!cv || S.workCRS==='EPSG:3857') return {cv, b, wm:false};
  try{
    const fwd=(x,y)=>reproj(S.workCRS,'EPSG:3857',x,y);
    const inv=(X,Y)=>reproj('EPSG:3857',S.workCRS,X,Y);
    let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
    const NB=32;
    for(let i=0;i<=NB;i++){ const t=i/NB;
      [[b[0]+t*(b[2]-b[0]),b[1]],[b[0]+t*(b[2]-b[0]),b[3]],
       [b[0],b[1]+t*(b[3]-b[1])],[b[2],b[1]+t*(b[3]-b[1])]].forEach(([x,y])=>{
        const q=fwd(x,y);
        if(q[0]<mnX)mnX=q[0]; if(q[0]>mxX)mxX=q[0];
        if(q[1]<mnY)mnY=q[1]; if(q[1]>mxY)mxY=q[1]; });
    }
    const W=cv.width, H=cv.height;
    const NA=32, ax=new Float64Array((NA+1)*(NA+1)), ay=new Float64Array((NA+1)*(NA+1));
    for(let r=0;r<=NA;r++) for(let c=0;c<=NA;c++){
      const X=mnX+(c/NA)*(mxX-mnX), Y=mnY+(r/NA)*(mxY-mnY);
      const q=inv(X,Y); ax[r*(NA+1)+c]=q[0]; ay[r*(NA+1)+c]=q[1];
    }
    const src=cv.getContext('2d').getImageData(0,0,W,H).data;
    const out=document.createElement('canvas'); out.width=W; out.height=H;
    const octx=out.getContext('2d'); const oi=octx.createImageData(W,H); const D=oi.data;
    for(let j=0;j<H;j++){
      const Y=mxY-(j+0.5)*(mxY-mnY)/H;
      const gr=Math.min(NA-1e-9,Math.max(0,(Y-mnY)/(mxY-mnY)*NA));
      const r0=Math.floor(gr), fy=gr-r0;
      for(let i=0;i<W;i++){
        const X=mnX+(i+0.5)*(mxX-mnX)/W;
        const gc=Math.min(NA-1e-9,Math.max(0,(X-mnX)/(mxX-mnX)*NA));
        const c0=Math.floor(gc), fx=gc-c0, k=r0*(NA+1)+c0;
        const sx=ax[k]*(1-fx)*(1-fy)+ax[k+1]*fx*(1-fy)+ax[k+NA+1]*(1-fx)*fy+ax[k+NA+2]*fx*fy;
        const sy=ay[k]*(1-fx)*(1-fy)+ay[k+1]*fx*(1-fy)+ay[k+NA+1]*(1-fx)*fy+ay[k+NA+2]*fx*fy;
        const cc=Math.round((sx-b[0])/(b[2]-b[0])*W-0.5);
        const rr=Math.round((b[3]-sy)/(b[3]-b[1])*H-0.5);
        const o=(j*W+i)*4;
        if(cc<0||rr<0||cc>=W||rr>=H){ D[o+3]=0; continue; }
        const s=(rr*W+cc)*4;
        D[o]=src[s]; D[o+1]=src[s+1]; D[o+2]=src[s+2]; D[o+3]=src[s+3];
      }
    }
    octx.putImageData(oi,0,0);
    return {cv:out, b:[mnX,mnY,mxX,mxY], wm:true};
  }catch(e){ console.warn('warpCanvasWM:', e && e.message); return {cv, b, wm:false}; }
}

/* ============================================================================
   SUPERFÍCIE TIN NO MAPA 2D = MALHA VETORIAL (estilo Surpac/Deswik).
   O desenho sai DIRETO dos triângulos — cor por face (cota média) e aresta
   fina — sem passar por grade nenhuma. É a resposta definitiva ao pedido
   "não gere raster": a TIN nunca vira TIFF, nem na tela nem em disco.
   ============================================================================ */
function renderTinMalha2D(r){
  const T=r.d&&r.d.tin, M=r&&r._tinMesh;
  if(!T&&!(M&&M.positions&&M.indices))return false;
  /* A tela 2D deve usar a MESMA malha analítica entregue ao 3D. O caminho
     antigo voltava ao d.tin original e redesenhava faces que já tinham sido
     cortadas no limite, por isso a linha preta não coincidia com a imagem. */
  let xs,ys,zs,tri;
  const recorteVivo=!!((r._v3&&r._v3.limId)||(r._exactClipRings&&r._exactClipRings.length));
  if(M&&M.positions&&M.indices&&M.indices.length&&(!T||!recorteVivo)){
    const n=(M.positions.length/3)|0;
    xs=new Float64Array(n);ys=new Float64Array(n);zs=new Float64Array(n);
    for(let i=0;i<n;i++){xs[i]=M.positions[3*i];ys[i]=M.positions[3*i+1];zs[i]=M.positions[3*i+2];}
    tri=M.indices;
  }else{xs=T.xs;ys=T.ys;zs=T.zs;tri=T.tri;}
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,zmn=Infinity,zmx=-Infinity;
  for(let k=0;k<tri.length;k++){const i=tri[k];
    if(xs[i]<x0)x0=xs[i]; if(xs[i]>x1)x1=xs[i];
    if(ys[i]<y0)y0=ys[i]; if(ys[i]>y1)y1=ys[i];
    const z=zs[i]; if(z<zmn)zmn=z; if(z>zmx)zmx=z;
  }
  if(!isFinite(x0)||x1<=x0||y1<=y0)return false;
  const ladoMax=2048, w=(x1-x0), hgt=(y1-y0);
  const px=w>=hgt?ladoMax:Math.max(64,Math.round(ladoMax*w/hgt));
  const py=w>=hgt?Math.max(64,Math.round(ladoMax*hgt/w)):ladoMax;
  const cv=document.createElement('canvas'); cv.width=px; cv.height=py;
  const ctx=cv.getContext('2d');
  const X=x=>(x-x0)/w*px, Y=y=>py-(y-y0)/hgt*py;
  const dz=Math.max(1e-9,zmx-zmn);
  /* O ESTILO DA CAMADA VALE NA MALHA: hipso, sombreado ou os dois — o
     sombreado é calculado POR FACE pela normal do triângulo (luz de NO/45°),
     então mudar o seletor nas propriedades muda o desenho de verdade. */
  const modo=(r.style&&r.style.mode)||'hipso_hs';
  const comHipso=/hipso/.test(modo), comSombra=/hs|sombread/.test(modo)||modo==='hs';
  const LX=-0.707,LY=0.707,LZ=1.0, LN=Math.hypot(LX,LY,LZ);
  /* aresta visível, mas discreta o bastante para malhas densas */
  const nT=(tri.length/3)|0;
  ctx.lineWidth=nT>60000?0.25:(nT>15000?0.45:0.7);
  ctx.strokeStyle='rgba(20,30,24,0.55)';
  for(let t=0;t<nT;t++){
    const a=tri[3*t],b=tri[3*t+1],c=tri[3*t+2];
    const zm=(zs[a]+zs[b]+zs[c])/3;
    let cr,cg,cb;
    if(comHipso){ const hc=hypsoColor((zm-zmn)/dz); cr=hc[0];cg=hc[1];cb=hc[2]; }
    else { cr=cg=cb=0.86; }                        /* relevo sombreado puro */
    if(comSombra){
      const ux=xs[b]-xs[a],uy=ys[b]-ys[a],uz=zs[b]-zs[a];
      const vx=xs[c]-xs[a],vy=ys[c]-ys[a],vz=zs[c]-zs[a];
      let nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
      const nl=Math.hypot(nx,ny,nz)||1;
      if(nz<0){nx=-nx;ny=-ny;nz=-nz;}              /* normal para cima */
      const dot=Math.max(0,(nx*LX+ny*LY+nz*LZ)/(nl*LN));
      const f=0.45+0.55*dot;
      cr*=f;cg*=f;cb*=f;
    }
    ctx.fillStyle=`rgb(${Math.round(cr*255)},${Math.round(cg*255)},${Math.round(cb*255)})`;
    ctx.beginPath();
    ctx.moveTo(X(xs[a]),Y(ys[a]));
    ctx.lineTo(X(xs[b]),Y(ys[b]));
    ctx.lineTo(X(xs[c]),Y(ys[c]));
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  /* Segunda garantia visual: a máscara é vetorial e usa exatamente o mesmo
     anel que aparece como linha no mapa. Ela retira qualquer subpixel ou face
     histórica residual sem quantizar o contorno pela célula do raster. */
  const clip=typeof rasterClipRings==='function'?rasterClipRings(r):null;
  if(clip&&clip.length){
    ctx.save();ctx.globalCompositeOperation='destination-in';ctx.beginPath();
    clip.forEach(rg=>{if(!rg||rg.length<3)return;rg.forEach((p,i)=>{if(i)ctx.lineTo(X(p[0]),Y(p[1]));else ctx.moveTo(X(p[0]),Y(p[1]));});ctx.closePath();});
    ctx.fillStyle='#fff';ctx.fill('evenodd');ctx.restore();
  }
  const sw=toWGS(S.workCRS,x0,y0), ne=toWGS(S.workCRS,x1,y1);
  if(r.overlay){ map.removeLayer(r.overlay); r.overlay=null; }
  if(!wgsBoundsOK(sw,ne)){ zApply(); return true; }
  r._url=cv.toDataURL('image/png');
  r.overlay=L2.imageOverlay(r._url,[[sw[1],sw[0]],[ne[1],ne[0]]],
    {opacity:(r.style&&r.style.opacity)??0.9, pane:panelDaCamada('R:'+r.id)});
  if(r.visible!==false) r.overlay.addTo(map);
  zApply();
  return true;
}
function renderRaster(r){
  /* Uma superfície recalculada com as mesmas dimensões também precisa
     invalidar a malha 3D. */
  if(r){r._rev=(+r._rev||0)+1;
    if(S._view==='v3d'&&typeof v3Auto==='function')setTimeout(()=>v3Auto(),0);}
  /* Superfície TIN nunca é desenhada como raster */
  if(r&&r.tinPuro&&r.d&&r.d.tin){ if(renderTinMalha2D(r))return; }
  // desenho na grade nativa quando pedido e disponível (limitado pelo canvas)
  let gsrc=null;
  if(r.dispFull && r.d._full){
    try{ gsrc=reduceGrid(r.d._full, DISP_MAX_CELLS, 16000); }catch(e){ gsrc=null; }
  }
  const baseGrid=gsrc||r.d;
  const gw=gradeParaTela(baseGrid);             // grade já em Web Mercator
  const emWM=(gw!==baseGrid);
  const cv=rasterCanvas(r, gw, emWM?'EPSG:3857':S.workCRS); if(!cv) return;
  const b=rasterBounds(r, gw);
  const sw = emWM? reproj('EPSG:3857','EPSG:4326',b[0],b[1]) : toWGS(S.workCRS,b[0],b[1]);
  const ne = emWM? reproj('EPSG:3857','EPSG:4326',b[2],b[3]) : toWGS(S.workCRS,b[2],b[3]);
  if(r.overlay){ map.removeLayer(r.overlay); r.overlay=null; }
  if(!wgsBoundsOK(sw,ne)){
    toast('⚠ Raster "'+r.name+'": coordenadas incompatíveis com o CRS de trabalho ('+
      (CRS_LABELS[S.workCRS]||S.workCRS)+') — overlay não desenhado. Use Reprojetar nas propriedades.');
    zApply(); return;
  }
  r._url=cv.toDataURL('image/png');
  r.overlay=L2.imageOverlay(r._url,[[sw[1],sw[0]],[ne[1],ne[0]]],
    {opacity:r.style.opacity, pane:panelDaCamada('R'+r.id)});
  if(r.visible) r.overlay.addTo(map);
  /* Com tiles ligados, o preview não pode voltar por cima: os tiles assumem e
     são redesenhados com o estilo novo. */
  try{ if(demTilesAtivo(r)){ demTilesRefresh(r); syncDemTiles(r); }
       else syncDemTiles(r); }catch(e){}
  zApply();
}

/* ---------- GeoTIFF RGB (ortofoto): georreferência automática ----------
   Lê 3 bandas subamostradas para um canvas (máx ~2048 px no maior lado),
   registra a imagem em S.img com os bounds do próprio TIFF (CRS de trabalho)
   e cria o overlay no mapa 2D. A aba 3D passa a colar essa textura no terreno
   automaticamente — sem digitar cantos. Suporta pirâmides (COG) e leitura
   por blocos, como o parseTIFF de banda única.                              */
async function addRGBFromTIFF(f, fname, fsize){
  await ensureGeoTIFF();
  fname=fname||f.name||'ortofoto'; fsize=fsize??(f.size||0);
  const tiff=(f instanceof Blob)? await GeoTIFF.fromBlob(f) : await GeoTIFF.fromArrayBuffer(f);
  const img0=await tiff.getImage(0);
  const bb=img0.getBoundingBox();
  if(!bb || bb.some(v=>!isFinite(v))) throw new Error('GeoTIFF sem georreferência');
  // Preview para a TELA. O arquivo original NÃO é descartado: fica indexado em
  // S.img._tiff e é relido em resolução plena na hora de plotar (ver orthoWindow).
  // Em aparelho móvel o teto de memória da aba é bem menor: preview menor evita
  // que o Chrome do Android mate a aba (sintoma: o app "recarrega sozinho").
  const movel=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const mem=navigator.deviceMemory||0;                 // GB (Chrome/Android informa)
  // tablets potentes aguentam o mesmo preview do desktop; celulares antigos, não
  const MAXPX = (!movel || mem>=6) ? 4096 : 2560;
  const W0=img0.getWidth(), H0=img0.getHeight();
  const fct=Math.max(1, Math.ceil(Math.max(W0,H0)/MAXPX));
  const w=Math.max(2,Math.floor(W0/fct)), h=Math.max(2,Math.floor(H0/fct));
  // melhor pirâmide disponível
  let img=img0;
  try{
    const n=await tiff.getImageCount();
    for(let i=1;i<n;i++){ const im=await tiff.getImage(i);
      if(im.getWidth()>=w && im.getHeight()>=h && im.getWidth()<img.getWidth()) img=im; }
  }catch(e){}
  const W=img.getWidth(), H=img.getHeight();
  const spp=img.getSamplesPerPixel();
  if(spp<3) throw new Error('TIFF com '+spp+' banda(s) — para ortofoto RGB são necessárias 3+');
  const hasA=spp>=4;                                   // banda alfa (RGBA) — comum em ortomosaicos
  let nd=null; try{ nd=img.getGDALNoData(); }catch(e){} // valor nodata declarado no TIFF
  showLoad(`Lendo ortofoto ${W0}×${H0}…`);
  const cvs=document.createElement('canvas'); cvs.width=w; cvs.height=h;
  const ctx=cvs.getContext('2d');
  const id=ctx.createImageData(w,h);
  const rows=Math.max(1, Math.floor(TIFF_CHUNK_SAMPLES/(W*(hasA?4:3))));
  const srcRow=r=>Math.min(H-1,Math.floor(r*H/h));
  const srcCol=c=>Math.min(W-1,Math.floor(c*W/w));
  const colIdx=new Int32Array(w); for(let c=0;c<w;c++) colIdx[c]=srcCol(c);
  let r=0;
  while(r<h){
    const y0=srcRow(r), y1=Math.min(H,y0+rows);
    let rEnd=r; while(rEnd<h && srcRow(rEnd)<y1) rEnd++;
    showLoad(`Lendo ortofoto — ${(100*r/h).toFixed(0)}%`);
    await new Promise(rs=>setTimeout(rs,0));
    const smp=hasA?[0,1,2,3]:[0,1,2];
    const ras=await img.readRasters({samples:smp, window:[0,y0,W,y1]});
    const R=ras[0],G=ras[1],B=ras[2],A=hasA?ras[3]:null; const bw=y1-y0;
    // normalização p/ 8 bits se vier em 16 bits
    const is16=(R instanceof Uint16Array)||(R instanceof Int16Array);
    const sc=is16?1/257:1;
    for(let rr=r; rr<rEnd; rr++){
      const sy=srcRow(rr)-y0; if(sy<0||sy>=bw) continue;
      const off=sy*W, dst=rr*w*4;
      for(let c=0;c<w;c++){
        const k=off+colIdx[c], o=dst+4*c;
        const rv=R[k], gv=G[k], bv=B[k];
        // alfa 0 = sem dado; nodata do TIFF nas três bandas = sem dado
        let a=255;
        if(A && A[k]===0) a=0;
        else if(nd!=null && rv==nd && gv==nd && bv==nd) a=0;
        id.data[o]=rv*sc; id.data[o+1]=gv*sc; id.data[o+2]=bv*sc; id.data[o+3]=a;
      }
    }
    r=rEnd;
  }
  // bounds do TIFF (assumidos no CRS de trabalho)
  const b=[bb[0],bb[1],bb[2],bb[3]]; // [W,S,E,N]
  const sw=toWGS(S.workCRS,b[0],b[1]), ne=toWGS(S.workCRS,b[2],b[3]);
  if(!wgsBoundsOK(sw,ne)){
    hideLoad();
    throw new Error('georreferência do TIFF incompatível com o CRS de trabalho ('+
      (CRS_LABELS[S.workCRS]||S.workCRS)+') — ajuste o CRS de trabalho antes de carregar');
  }
  if(S.img)registraOrtoParaDrape(S.img);
  if(S.img&&S.img.overlay) map.removeLayer(S.img.overlay);
  S.img={url:null, overlay:null, b, name:fname.replace(/\.[^.]+$/,''), visible:true,
         src:{file:fname, size:fsize, at:new Date().toISOString()},
         _id:id, _w:w, _h:h, _nd:(nd!=null),
         // --- índice do original, para releitura em resolução plena ---
         _tiff:tiff, _img0:img0, _W0:W0, _H0:H0, _hasA:hasA, _ndVal:nd, _cache:new Map(),
         // estrutura interna: define o desempenho dos tiles dinâmicos
         _cog:await (async()=>{ let nOv=0, tiled=false, tw=0, th=0;
           try{ nOv=(await tiff.getImageCount())-1; }catch(e){}
           try{ tw=img0.getTileWidth(); th=img0.getTileHeight();
                tiled = th < H0;                    // strips têm "tile" da altura toda/da faixa
                if(img0.fileDirectory && img0.fileDirectory.TileWidth) tiled=true; }catch(e){}
           return {nOv, tiled, tw, th}; })()};
  const cut=applyImgNoData();          // gera url (PNG c/ alfa), overlay e recorte do sem-dado
  S.img._ndPct=cut.pct;
  safeFit(S.img.overlay.getBounds());
  refreshUI();
  hideLoad();
  toast(`Ortofoto: ${w}×${h} px · ${cut.pct.toFixed(1)}% de células sem dado descartadas`);
}

/* ============================================================================
   ORTOFOTO — RELIGAR O GeoTIFF DE ORIGEM
   O .ccmgis guarda da ortofoto apenas a PRÉVIA (PNG) e os limites: ao reabrir
   um projeto, S.img volta sem _tiff/_img0 e não há de onde reler pixel — por
   mais que se aproxime, o que se vê é a prévia esticada, e os tiles de alta
   resolução ficam indisponíveis. Esta rotina reata o arquivo original à
   ortofoto que já está na tela, SEM mexer em georreferência, recorte ou
   aparência: só devolve o índice do TIFF para releitura por janela.
   ========================================================================= */
async function ortoReligarTIFF(file){
  const I=S.img;
  if(!I || !I.b){ toast('Não há ortofoto carregada para religar'); return false; }
  showLoad('Lendo o GeoTIFF da ortofoto…');
  try{
    await ensureGeoTIFF();
    const src=await bufferFonte(file);
    const tiff=(src instanceof Blob)? await GeoTIFF.fromBlob(src) : await GeoTIFF.fromArrayBuffer(src);
    const img0=await tiff.getImage(0);
    const bb=img0.getBoundingBox();
    if(!bb || bb.some(v=>!isFinite(v))) throw new Error('GeoTIFF sem georreferência');
    const spp=img0.getSamplesPerPixel();
    if(spp<3) throw new Error('o arquivo tem '+spp+' banda(s); a ortofoto precisa de 3 ou mais');
    /* Confere se é MESMO a ortofoto desta tela: os centros têm de cair dentro
       da extensão um do outro. Sem isto, religar um arquivo de outra área
       deixaria os tiles pintando pixel de outro lugar sobre a mesma moldura. */
    const cx=(bb[0]+bb[2])/2, cy=(bb[1]+bb[3])/2,
          ix=(I.b[0]+I.b[2])/2, iy=(I.b[1]+I.b[3])/2,
          dentro=(x,y,e)=>x>=e[0]&&x<=e[2]&&y>=e[1]&&y<=e[3];
    if(!(dentro(cx,cy,I.b)||dentro(ix,iy,bb)))
      throw new Error('a área do arquivo não corresponde à ortofoto aberta');
    const W0=img0.getWidth(), H0=img0.getHeight();
    let nd=null; try{ nd=img0.getGDALNoData(); }catch(e){}
    Object.assign(I,{
      _tiff:tiff, _img0:img0, _W0:W0, _H0:H0, _hasA:spp>=4, _ndVal:nd,
      _cache:I._cache||new Map(), _prevID:undefined,
      src:{file:file.name||'ortofoto.tif', size:file.size||0, at:new Date().toISOString()},
      _cog:await (async()=>{ let nOv=0, tiled=false, tw=0, th=0;
        try{ nOv=(await tiff.getImageCount())-1; }catch(e){}
        try{ tw=img0.getTileWidth(); th=img0.getTileHeight(); tiled=th<H0;
             if(img0.fileDirectory && img0.fileDirectory.TileWidth) tiled=true; }catch(e){}
        return {nOv,tiled,tw,th}; })()
    });
    /* RECONSTRÓI O PIXEL ORIGINAL DA PRÉVIA (_id).
       Sem ele, "Aplicar" (recorte do sem-dado), a opacidade e o reposicionamento
       ficam desabilitados — era o que acontecia depois de reabrir um projeto:
       o arquivo voltava, mas o painel seguia inerte. Aqui a prévia é relida do
       próprio TIFF, no mesmo teto de pixels do carregamento normal. */
    showLoad('Reconstruindo a prévia da ortofoto…');
    const MAXPX=(!EH_MOVEL || (navigator.deviceMemory||0)>=6) ? 4096 : 2560;
    const fct=Math.max(1, Math.ceil(Math.max(W0,H0)/MAXPX));
    const w=Math.max(2,Math.floor(W0/fct)), hh=Math.max(2,Math.floor(H0/fct));
    let im=img0;
    try{ const n=await tiff.getImageCount();
      for(let i=1;i<n;i++){ const cand=await tiff.getImage(i);
        if(cand.getWidth()>=w && cand.getHeight()>=hh && cand.getWidth()<im.getWidth()) im=cand; }
    }catch(e){}
    const hasA=spp>=4;
    const ras=await im.readRasters({samples:hasA?[0,1,2,3]:[0,1,2],
      width:w, height:hh, resampleMethod:'bilinear'});
    const R=ras[0],G=ras[1],B=ras[2],A=hasA?ras[3]:null;
    const is16=(R instanceof Uint16Array)||(R instanceof Int16Array), sc=is16?1/257:1;
    const cvp=document.createElement('canvas'); cvp.width=w; cvp.height=hh;
    const idp=cvp.getContext('2d').createImageData(w,hh), DP=idp.data;
    for(let k=0;k<w*hh;k++){
      const o=k*4, v=R[k];
      const semDado=(nd!=null && v===nd) || (A && (is16? A[k]/257 : A[k])<8);
      if(semDado){ DP[o+3]=0; continue; }
      DP[o]=R[k]*sc; DP[o+1]=G[k]*sc; DP[o+2]=B[k]*sc; DP[o+3]=255;
    }
    I._id=idp; I._w=w; I._h=hh; I._nd=(nd!=null);
    /* Regenera o desenho a partir do pixel novo, preservando nome, cantos,
       opacidade e as opções de sem-dado que já estavam na tela. */
    try{ const cut=applyImgNoData(); if(cut&&isFinite(cut.pct)) I._ndPct=cut.pct; }catch(e){}
    S.orthoHD=true;
    const cb=document.getElementById('imModHD'); if(cb) cb.checked=true;
    const cb2=document.getElementById('imgHD'); if(cb2){ cb2.disabled=false; cb2.checked=true; }
    ['imModND','imModW','imModB','imModApply'].forEach(id=>{
      const e=document.getElementById(id); if(e) e.disabled=false; });
    try{ imgResInfoSync(); }catch(e){}
    try{ syncImgPanel(); }catch(e){}
    try{ orthoHDReset(); }catch(e){}
    syncOrthoTiles();
    const gsd=((I.b[2]-I.b[0])/W0*100).toFixed(1);
    toast(`Ortofoto religada: ${W0}×${H0} px (${gsd} cm/px) · alta resolução ligada · recorte e opacidade liberados`);
    if(typeof cmdLog==='function') cmdLog(`ortofoto religada ao arquivo ${file.name||''} — ${W0}×${H0}`,'ok');
    return true;
  }catch(e){
    toast('Não foi possível religar: '+(e&&e.message||e));
    return false;
  }finally{ hideLoad(); }
}

/* ============================================================================
   ORTOFOTO — leitura de janela em resolução plena
   O preview de tela é reamostrado (rápido, leve). Mas na PLOTAGEM não se pode
   usar esse preview: uma figura de 160 mm a 300 dpi tem ~1.900 px e, com zoom,
   pede muito mais resolução do que o preview tem. Aqui a janela pedida é relida
   direto do TIFF original, na densidade de pixel que a figura realmente precisa.
   ========================================================================== */
async function orthoWindow(bb, pxW){
  const I=S.img;
  if(!I || !I._img0 || !I.b) return null;
  const [W0,S0,E0,N0]=I.b;                     // extensão georreferenciada do TIFF
  // interseção da janela pedida com a extensão da imagem
  const x0=Math.max(bb[0],W0), y0=Math.max(bb[1],S0);
  const x1=Math.min(bb[2],E0), y1=Math.min(bb[3],N0);
  if(!(x1>x0 && y1>y0)) return null;

  const gsdX=(E0-W0)/I._W0, gsdY=(N0-S0)/I._H0;     // metros por pixel do original
  // janela em pixels do TIFF (y cresce para baixo)
  const px0=Math.max(0, Math.floor((x0-W0)/gsdX));
  const px1=Math.min(I._W0, Math.ceil((x1-W0)/gsdX));
  const py0=Math.max(0, Math.floor((N0-y1)/gsdY));
  const py1=Math.min(I._H0, Math.ceil((N0-y0)/gsdY));
  if(px1<=px0 || py1<=py0) return null;

  // resolução de saída: a pedida, mas nunca acima da resolução original
  const nativeW=px1-px0, nativeH=py1-py0;
  const outW=Math.max(2, Math.min(nativeW, Math.round(pxW)));
  const outH=Math.max(2, Math.round(outW*nativeH/nativeW));
  if(outW*outH>64e6){ return null; }                // guarda contra estouro de memória

  const key=[px0,py0,px1,py1,outW].join(':');
  if(I._cache.has(key)) return I._cache.get(key);

  const smp=I._hasA?[0,1,2,3]:[0,1,2];
  const ras=await I._img0.readRasters({
    samples:smp, window:[px0,py0,px1,py1],
    width:outW, height:outH, resampleMethod:'bilinear'
  });
  const R=ras[0],G=ras[1],B=ras[2],A=I._hasA?ras[3]:null;
  const is16=(R instanceof Uint16Array)||(R instanceof Int16Array);
  const sc=is16?1/257:1;

  const gcb=(id,d)=>{const e=document.getElementById(id); return e?e.checked:d;};
  const gvn=(id,d)=>{const e=document.getElementById(id); const v=e?+e.value:NaN; return isFinite(v)?v:d;};
  const on=gcb('imgND',true), wTh=gvn('imgNDw',250), bTh=gvn('imgNDb',4);
  const nd=I._ndVal;

  const cv=document.createElement('canvas'); cv.width=outW; cv.height=outH;
  const ctx=cv.getContext('2d');
  const im=ctx.createImageData(outW,outH), D=im.data;
  for(let k=0;k<outW*outH;k++){
    const o=k*4, rv=R[k]*sc, gv=G[k]*sc, bv=B[k]*sc;
    let a=255;
    if(A && A[k]===0) a=0;
    else if(nd!=null && R[k]==nd && G[k]==nd && B[k]==nd) a=0;
    else if(on){
      if((rv>=wTh&&gv>=wTh&&bv>=wTh) || (rv<=bTh&&gv<=bTh&&bv<=bTh)) a=0;
    }
    D[o]=rv; D[o+1]=gv; D[o+2]=bv; D[o+3]=a;
  }
  ctx.putImageData(im,0,0);
  // bounds REAIS do recorte (alinhados à grade de pixels do TIFF)
  const out={
    dataURL:cv.toDataURL('image/png'),
    bb:[W0+px0*gsdX, N0-py1*gsdY, W0+px1*gsdX, N0-py0*gsdY],
    px:outW, nativo:nativeW
  };
  if(I._cache.size>6) I._cache.clear();          // cache curto: a janela muda a cada pan/zoom
  I._cache.set(key,out);
  return out;
}


/* ===========================================================================
   MDT POR TILES — pirâmide dinâmica no zoom (espelho do caminho da ortofoto)
   O mapa desenha o MDT a partir da grade de TELA (reduzida por média de bloco
   até RASTER_MAX_CELLS). Ao aproximar, esse preview é ampliado e o sombreado
   perde a crista/pé finos. "Desenhar na grade nativa" resolve, mas carrega a
   grade inteira na memória — inviável em GeoTIFF grande e no tablet.
   Aqui cada tile de 256 px relê do GeoTIFF SÓ a sua janela, na densidade do
   zoom atual, usando a pirâmide (COG) quando houver. A cor sai de
   rasterPainter: mesmo estilo, mesma escala hipsométrica, mesmo sombreado.
   Enquanto o zoom não pede mais que o preview, o tile é pintado da própria
   grade em RAM — barato e sem tocar no arquivo.
   =========================================================================== */
const _demGrids=new Map();          // rasterId -> L.GridLayer
const _demFails=new Map();          // rasterId -> falhas seguidas de leitura
function demTilesAtivo(r){ return !!(r && r.demHD && r.d && r.d._img0 && r.visible!==false); }
function syncDemTiles(r){
  if(typeof map==='undefined'||!map) return;
  const alvos = r? [r] : (S.rasters||[]);
  for(const R of alvos){
    if(!R) continue;
    const id=String(R.id), quer=demTilesAtivo(R), atual=_demGrids.get(id);
    if(quer && !atual){
      const pane='demHD'+id;
      if(!map.getPane(pane)){ const pn=map.createPane(pane); pn.style.zIndex=340; }
      const Grid=L2.GridLayer.extend({
        createTile:function(coords,done){
          const cv=document.createElement('canvas'); cv.width=cv.height=256;
          buildDemTile(cv,coords,R)
            .then(()=>{ _demFails.set(id,0); done(null,cv); })
            .catch(err=>{
              console.warn('tile MDT:',err&&err.message||err);
              const n=(_demFails.get(id)||0)+1; _demFails.set(id,n);
              if(n>=4 && R.demHD){
                R.demHD=false; syncDemTiles(R);
                const cb=document.getElementById('rasDemHD'); if(cb&&rasCur===R) cb.checked=false;
                toast('⚠ Tiles do MDT DESLIGADOS: não consegui reler o GeoTIFF. Recarregue o .tif.');
              }
              done(null,cv);
            });
          return cv;
        }
      });
      const gl=new Grid({pane,tileSize:256,keepBuffer:1,updateWhenZooming:false,
        updateWhenIdle:true,updateInterval:200,opacity:(R.style&&R.style.opacity)??0.9});
      gl.addTo(map); _demGrids.set(id,gl);
      /* O desenho normal continua por baixo: o mapa não pisca a cada pan. */
      if(R.overlay && R.visible!==false && !map.hasLayer(R.overlay)) R.overlay.addTo(map);
    }
    if(!quer && atual){
      map.removeLayer(atual); _demGrids.delete(id);
      if(R.overlay && R.visible!==false && !map.hasLayer(R.overlay)) R.overlay.addTo(map);
    }
  }
}
/* Redesenha os tiles quando o estilo/limites da superfície mudam. */
function demTilesRefresh(r){
  const gl=_demGrids.get(String(r&&r.id));
  if(!gl) return false;
  gl.options.opacity=(r.style&&r.style.opacity)??0.9;
  gl.setOpacity(gl.options.opacity);
  gl.redraw();
  return true;
}
async function buildDemTile(cv,coords,r){
  const d=r.d, W0=d._W0||d.nc, H0=d._H0||d.nr;
  const bb=d._bb||[d.xll,d.yll,d.xll+d.nc*d.cs,d.yll+d.nr*(d.csy||d.cs)];
  const [Wb,Sb,Eb,Nb]=bb, gx=(Eb-Wb)/W0, gy=(Nb-Sb)/H0;     // m/pixel do NATIVO
  // grade de warp 9×9: pixel do tile -> pixel nativo do GeoTIFF
  const N=9, st=32, SX=new Float64Array(N*N), SY=new Float64Array(N*N);
  let mnx=Infinity,mny=Infinity,mxx=-Infinity,mxy=-Infinity;
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const pt=L2.point(coords.x*256+i*st, coords.y*256+j*st);
    const ll=map.unproject(pt,coords.z);
    const c=fromWGS(S.workCRS, ll.lng, ll.lat);
    const px=(c[0]-Wb)/gx, py=(Nb-c[1])/gy;
    SX[j*N+i]=px; SY[j*N+i]=py;
    if(px<mnx)mnx=px; if(px>mxx)mxx=px; if(py<mny)mny=py; if(py>mxy)mxy=py;
  }
  if(mxx<0||mxy<0||mnx>W0||mny>H0) return;                  // tile fora do raster
  const dpp=Math.max((mxx-mnx),(mxy-mny))/256;              // px nativos por px do tile
  const fPrev=W0/d.nc;                                      // px nativos por px do preview
  const stats=r._st||(r._st=rasterStats(r.d)), mn=stats.mn, rng=(stats.mx-stats.mn)||1;
  // --- zoom afastado: a grade de tela já basta (nada é lido do arquivo) ---
  if(dpp>=fPrev*0.95){
    pintaTileDaGrade(cv,r,d,SX,SY,N,st,fPrev,mn,rng,W0,H0);
    return;
  }
  // --- pirâmide: a menor imagem que ainda atende esta densidade ---
  let im=d._img0, f=1;
  try{
    const n=await d._tiff.getImageCount();
    for(let k=1;k<n;k++){ const cand=await d._tiff.getImage(k);
      const cf=W0/cand.getWidth();
      if(cf<=Math.max(1,dpp*1.4) && cf>f){ im=cand; f=cf; } }
  }catch(e){}
  // janela de leitura com margem de 1 célula (o sombreado precisa dos vizinhos)
  const M=2*f;
  const wx0=Math.max(0,Math.floor((mnx-M)/f)), wy0=Math.max(0,Math.floor((mny-M)/f));
  const wx1=Math.min(im.getWidth(), Math.ceil((mxx+M)/f));
  const wy1=Math.min(im.getHeight(),Math.ceil((mxy+M)/f));
  if(wx1<=wx0||wy1<=wy0) return;
  const rw=Math.max(3,Math.min(320,Math.ceil((wx1-wx0)*f/Math.max(f,dpp)))),
        rh=Math.max(3,Math.min(320,Math.ceil((wy1-wy0)*f/Math.max(f,dpp))));
  await ioSlot();
  let ras;
  try{
    ras=await im.readRasters({samples:[0],window:[wx0,wy0,wx1,wy1],
      width:rw,height:rh,resampleMethod:'bilinear'});
  } finally { ioLibera(); }
  const band=ras[0], nd=d._nd;
  const zb=new Float32Array(rw*rh);
  for(let k=0;k<zb.length;k++){
    const v=band[k];
    zb[k]=((nd!=null&&v===nd)||!isFinite(v)||v<-1e30)?NaN:v;
  }
  /* grade temporária da janela: o sombreado usa o tamanho REAL da célula
     lida, senão o relevo do tile sairia mais/menos dramático que o preview */
  const gt={nc:rw,nr:rh,z:zb,
    cs:((wx1-wx0)*f*gx)/rw, csy:((wy1-wy0)*f*gy)/rh,
    xll:Wb+wx0*f*gx, yll:Nb-wy1*f*gy};
  const ctx=cv.getContext('2d'), id=ctx.createImageData(256,256), D=id.data;
  const pinta=rasterPainter(r,mn,rng), cor=[0,0,0];
  const kx=rw/((wx1-wx0)*f), ky=rh/((wy1-wy0)*f);           // px nativos -> px do buffer
  for(let v2=0;v2<256;v2++){
    const j=Math.min(N-2,v2>>5), fy=(v2-(j<<5))/st;
    for(let u=0;u<256;u++){
      const i=Math.min(N-2,u>>5), fx=(u-(i<<5))/st;
      const a=j*N+i;
      const X=(SX[a]*(1-fx)+SX[a+1]*fx)*(1-fy)+(SX[a+N]*(1-fx)+SX[a+N+1]*fx)*fy;
      const Y=(SY[a]*(1-fx)+SY[a+1]*fx)*(1-fy)+(SY[a+N]*(1-fx)+SY[a+N+1]*fx)*fy;
      if(X<0||Y<0||X>=W0||Y>=H0) continue;
      const bx=Math.min(rw-1,Math.max(0,(X-wx0*f)*kx|0)),
            by=Math.min(rh-1,Math.max(0,(Y-wy0*f)*ky|0));
      if(!pinta(gt,by*rw+bx,zb,cor)) continue;
      const o=(v2*256+u)*4;
      D[o]=cor[0];D[o+1]=cor[1];D[o+2]=cor[2];D[o+3]=255;
    }
  }
  ctx.putImageData(id,0,0);
}
/* Pintura do tile a partir da grade que já está na memória. */
function pintaTileDaGrade(cv,r,d,SX,SY,N,st,fPrev,mn,rng,W0,H0){
  const ctx=cv.getContext('2d'), id=ctx.createImageData(256,256), D=id.data;
  const z=d.zf||d.z;
  const pinta=rasterPainter(r,mn,rng), cor=[0,0,0];
  for(let v2=0;v2<256;v2++){
    const j=Math.min(N-2,v2>>5), fy=(v2-(j<<5))/st;
    for(let u=0;u<256;u++){
      const i=Math.min(N-2,u>>5), fx=(u-(i<<5))/st;
      const a=j*N+i;
      const X=(SX[a]*(1-fx)+SX[a+1]*fx)*(1-fy)+(SX[a+N]*(1-fx)+SX[a+N+1]*fx)*fy;
      const Y=(SY[a]*(1-fx)+SY[a+1]*fx)*(1-fy)+(SY[a+N]*(1-fx)+SY[a+N+1]*fx)*fy;
      if(X<0||Y<0||X>=W0||Y>=H0) continue;
      const cxi=Math.min(d.nc-1,Math.max(0,(X/fPrev)|0)),
            cyi=Math.min(d.nr-1,Math.max(0,(Y/(H0/d.nr))|0));
      if(!pinta(d,cyi*d.nc+cxi,z,cor)) continue;
      const o=(v2*256+u)*4;
      D[o]=cor[0];D[o+1]=cor[1];D[o+2]=cor[2];D[o+3]=255;
    }
  }
  ctx.putImageData(id,0,0);
}

/* ===========================================================================
   ORTOFOTO — ALTA RESOLUÇÃO DINÂMICA NA TELA
   O preview é limitado (4096 px no desktop, 2560 no móvel). Ao aproximar, o
   navegador passa a AMPLIAR esse preview e a imagem borra. Aqui, sempre que a
   densidade da tela (m/pixel de dispositivo) fica melhor que a do preview, a
   janela visível é relida do TIFF original (orthoWindow) e trocada no overlay.
   Ao afastar, volta o preview. Não altera S.img.url — plotagem e KMZ seguem
   usando seus próprios caminhos.
   =========================================================================== */
/* Padrão: LIGADO no computador, DESLIGADO em aparelho móvel.
   O preview é limitado (4096 px no desktop, 2560 no móvel): numa ortofoto de
   drone de 15–20 mil pixels de lado isso é uma redução de 4–5×, e ao aproximar
   para conferir uma caixa de decantação o que se vê é esse preview esticado.
   Com os tiles, cada quadrado relê do TIFF só a sua janela na densidade do
   zoom — medido: 6,5× mais detalhe já numa orto que cabe inteira no preview,
   e muito mais quando há redução. No tablet segue desligado por padrão
   (fluidez e memória da aba), disponível no ⚙ da ortofoto.                  */
S.orthoHD=!EH_MOVEL;

/* ===========================================================================
   ORTOFOTO POR TILES — pirâmide dinâmica no zoom
   Em vez de recarregar UMA janela grande a cada pan (v57), o overlay vira um
   L.GridLayer: cada tile de 256 px lê do GeoTIFF (em RAM) apenas a sua área,
   na densidade do zoom atual, usando a pirâmide COG quando houver. Tiles
   ficam em cache no Leaflet — voltar a uma área já vista é instantâneo, e a
   resolução acompanha o zoom continuamente, como num mapa de tiles normal.
   Reprojeção: grade de warp 9×9 por tile (Mercator→CRS de trabalho→pixel do
   TIFF) interpolada bilinearmente — exata o bastante e barata.
   =========================================================================== */
let _orthoGrid=null, _tileFails=0;
/* FILA DE LEITURA DO TIFF — descompactar é caro e o navegador dispara todos os
   tiles da tela de uma vez. Sem limite, 20 leituras concorrentes brigam pela
   mesma CPU e TUDO demora; com 3, a tela preenche na mesma ordem e bem antes. */
const _ioMax=4; let _ioAtivas=0; const _ioFila=[];
function ioSlot(){
  if(_ioAtivas<_ioMax){ _ioAtivas++; return Promise.resolve(); }
  return new Promise(res=>_ioFila.push(res));
}
function ioLibera(){
  const prox=_ioFila.shift();
  if(prox) prox(); else _ioAtivas=Math.max(0,_ioAtivas-1);
}
function syncOrthoTiles(){
  const I=S.img;
  const quer = S.orthoHD && I && I._img0 && I.visible!==false && map;
  if(quer && !_orthoGrid){
    if(!map.getPane('orthoHD')){ const pn=map.createPane('orthoHD'); pn.style.zIndex=350; }
    const Grid=L2.GridLayer.extend({
      createTile:function(coords, done){
        const cv=document.createElement('canvas');
        cv.width=cv.height=256;
        buildOrthoTile(cv, coords)
          .then(()=>{ _tileFails=0; done(null,cv); })
          .catch(err=>{
            console.warn('tile ortofoto:', err.message);
            if(++_tileFails>=4 && S.orthoHD){
              S.orthoHD=false; syncOrthoTiles();
              const cb=document.getElementById('imModHD'); if(cb) cb.checked=false;
              toast('⚠ Tiles da ortofoto DESLIGADOS: falha ao reler o arquivo. Recarregue o .tif.');
            }
            done(null,cv);                       // tile transparente
          });
        return cv;
      }
    });
    _orthoGrid=new Grid({pane:'orthoHD', tileSize:256, keepBuffer:1,
      updateWhenZooming:false, updateWhenIdle:true, updateInterval:200,
      opacity:I.overlay?I.overlay.options.opacity??1:1});
    _orthoGrid.addTo(map);
    /* A PRÉVIA FICA POR BAIXO. Antes ela era retirada e, enquanto os tiles não
       chegavam, a ortofoto sumia a cada pan — o que se sente como travamento.
       Mantida embaixo, o mapa nunca fica vazio e o tile só substitui o que já
       está visível quando fica pronto. */
    if(I.overlay && I.visible!==false && !map.hasLayer(I.overlay)) I.overlay.addTo(map);
  }
  if(!quer && _orthoGrid){
    map.removeLayer(_orthoGrid); _orthoGrid=null;
    if(I && I.overlay && I.visible!==false && !map.hasLayer(I.overlay)) I.overlay.addTo(map);
  }
  /* Com a prévia por baixo, o pane dos tiles precisa ficar logo acima dela. */
  if(_orthoGrid){ const pn=map.getPane('orthoHD');
    const base=map.getPane('alagis_ortofoto');
    if(pn&&base) pn.style.zIndex=(parseInt(base.style.zIndex||405,10)+1); }
}
async function buildOrthoTile(cv, coords){
  const I=S.img;
  const [Wb,Sb,Eb,Nb]=I.b, W0=I._W0, H0=I._H0;
  const gx=(Eb-Wb)/W0, gy=(Nb-Sb)/H0;                  // m/pixel do original
  // --- grade de warp 9×9: pixel do tile -> pixel (resolução plena) do TIFF ---
  const N=9, st=32, SX=new Float64Array(N*N), SY=new Float64Array(N*N);
  let mnx=Infinity,mny=Infinity,mxx=-Infinity,mxy=-Infinity;
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const p=L2.point(coords.x*256+i*st, coords.y*256+j*st);
    const ll=map.unproject(p, coords.z);
    const c=fromWGS(S.workCRS, ll.lng, ll.lat);
    const px=(c[0]-Wb)/gx, py=(Nb-c[1])/gy;
    SX[j*N+i]=px; SY[j*N+i]=py;
    if(px<mnx)mnx=px; if(px>mxx)mxx=px; if(py<mny)mny=py; if(py>mxy)mxy=py;
  }
  if(mxx<0 || mxy<0 || mnx>W0 || mny>H0) return;       // tile fora da imagem
  const dpp=Math.max((mxx-mnx),(mxy-mny))/256;         // px do TIFF por px do tile
  // Sem pirâmides, um tile de zoom afastado obrigaria a descomprimir o arquivo
  // quase inteiro. Nesses casos, pinta a partir do PREVIEW (já em RAM) — a
  // densidade do preview basta nesse nível de zoom, por definição.
  const fPrev=W0/I._w;
  /* A PRÉVIA JÁ ESTÁ EM RAM. Enquanto o zoom não pedir mais densidade do que
     ela tem, ler o arquivo é trabalho jogado fora — era isso que deixava o
     mapa pesado no zoom de trabalho, com dezenas de tiles indo ao TIFF a cada
     pan para devolver o mesmo pixel da prévia. Só abaixo desse limiar o tile
     vai ao arquivo. (Antes esse atalho valia apenas para arquivo SEM pirâmide.) */
  const usaPrevia = dpp >= fPrev*0.95;
  if(usaPrevia && I._prevID===undefined){
    try{ const c2=document.createElement('canvas'); c2.width=I._w; c2.height=I._h;
      const im2=new Image();
      await new Promise((rs,rj)=>{ im2.onload=rs; im2.onerror=rj; im2.src=I.url; });
      c2.getContext('2d').drawImage(im2,0,0);
      I._prevID=c2.getContext('2d').getImageData(0,0,I._w,I._h);
    }catch(e){ I._prevID=null; }
  }
  if(usaPrevia && I._prevID){
    const P=I._prevID.data, ctx2=cv.getContext('2d'), id2=ctx2.createImageData(256,256), D2=id2.data;
    const N2=9, st2=32;
    for(let v=0;v<256;v++){
      const j=Math.min(N2-2, v>>5), fy=(v-(j<<5))/st2;
      for(let u=0;u<256;u++){
        const i=Math.min(N2-2, u>>5), fx=(u-(i<<5))/st2;
        const a=j*N2+i;
        const X=(SX[a]*(1-fx)+SX[a+1]*fx)*(1-fy)+(SX[a+N2]*(1-fx)+SX[a+N2+1]*fx)*fy;
        const Y=(SY[a]*(1-fx)+SY[a+1]*fx)*(1-fy)+(SY[a+N2]*(1-fx)+SY[a+N2+1]*fx)*fy;
        if(X<0||Y<0||X>=W0||Y>=H0) continue;
        const q=(((Y/fPrev)|0)*I._w+((X/fPrev)|0))*4, o=(v*256+u)*4;
        if(P[q+3]<8) continue;
        D2[o]=P[q]; D2[o+1]=P[q+1]; D2[o+2]=P[q+2]; D2[o+3]=P[q+3];
      }
    }
    ctx2.putImageData(id2,0,0);
    return;
  }
  // --- pirâmide: a menor imagem que ainda atende esta densidade ---
  let im=I._img0, f=1;
  try{
    const n=await I._tiff.getImageCount();
    for(let k=1;k<n;k++){ const cand=await I._tiff.getImage(k);
      const cf=W0/cand.getWidth();
      if(cf<=Math.max(1,dpp*1.4) && cf>f){ im=cand; f=cf; } }
  }catch(e){}
  // --- janela de leitura (nos pixels da imagem escolhida) ---
  const M=2*f;
  const wx0=Math.max(0, Math.floor((mnx-M)/f)), wy0=Math.max(0, Math.floor((mny-M)/f));
  const wx1=Math.min(im.getWidth(),  Math.ceil((mxx+M)/f));
  const wy1=Math.min(im.getHeight(), Math.ceil((mxy+M)/f));
  if(wx1<=wx0 || wy1<=wy0) return;
  const rw=Math.max(2, Math.min(320, Math.ceil((wx1-wx0)*f/Math.max(f,dpp))));
  const rh=Math.max(2, Math.min(320, Math.ceil((wy1-wy0)*f/Math.max(f,dpp))));
  const smp=I._hasA?[0,1,2,3]:[0,1,2];
  await ioSlot();
  let ras;
  try{
    ras=await im.readRasters({samples:smp, window:[wx0,wy0,wx1,wy1],
      width:rw, height:rh, resampleMethod:'bilinear'});
  } finally { ioLibera(); }
  const R=ras[0],G=ras[1],B=ras[2],A=I._hasA?ras[3]:null;
  const is16=(R instanceof Uint16Array)||(R instanceof Int16Array), sc=is16?1/257:1;
  // --- pintura: warp bilinear da grade para cada pixel do tile ---
  const ctx=cv.getContext('2d'), id=ctx.createImageData(256,256), D=id.data;
  const kx=rw/((wx1-wx0)*f), ky=rh/((wy1-wy0)*f);      // px plenos -> px do buffer
  for(let v=0;v<256;v++){
    const j=Math.min(N-2, v>>5), fy=(v-(j<<5))/st;
    for(let u=0;u<256;u++){
      const i=Math.min(N-2, u>>5), fx=(u-(i<<5))/st;
      const a=j*N+i;
      const X=(SX[a]*(1-fx)+SX[a+1]*fx)*(1-fy)+(SX[a+N]*(1-fx)+SX[a+N+1]*fx)*fy;
      const Y=(SY[a]*(1-fx)+SY[a+1]*fx)*(1-fy)+(SY[a+N]*(1-fx)+SY[a+N+1]*fx)*fy;
      if(X<0||Y<0||X>=W0||Y>=H0) continue;             // fora: transparente
      const bx=Math.min(rw-1, (X-wx0*f)*kx|0), by=Math.min(rh-1, (Y-wy0*f)*ky|0);
      const q=by*rw+bx, o=(v*256+u)*4;
      const al=A? (is16? A[q]/257 : A[q]) : 255;
      if(al<8) continue;
      D[o]=R[q]*sc; D[o+1]=G[q]*sc; D[o+2]=B[q]*sc; D[o+3]=al;
    }
  }
  ctx.putImageData(id,0,0);
}

let _hdBusy=false, _hdKey='', _hdOn=false;
async function orthoHDRefresh(){
  syncOrthoTiles();
  return;                                              // janela única desativada: tiles assumiram
}
async function _orthoHDRefresh_janela_unica(){
  const I=S.img;
  if(!I || !I._img0 || !I.overlay || I.visible===false) return;
  if(!S.orthoHD){ if(_hdOn){ I.overlay.setUrl(I.url); I.overlay.setBounds(imgLLBounds(I.b)); _hdOn=false; } return; }
  if(_hdBusy || !map) return;

  const dpr=Math.min(3, window.devicePixelRatio||1);
  const sz=map.getSize();
  const b=map.getBounds();
  const p1=fromWGS(S.workCRS, b.getWest(), b.getSouth());
  const p2=fromWGS(S.workCRS, b.getEast(), b.getNorth());
  const win=[Math.min(p1[0],p2[0]), Math.min(p1[1],p2[1]),
             Math.max(p1[0],p2[0]), Math.max(p1[1],p2[1])];
  const pxW=Math.max(256, Math.min(6000, Math.round(sz.x*dpr)));

  const mppTela   = (win[2]-win[0])/pxW;                 // m por pixel de dispositivo
  const mppPreview= (I.b[2]-I.b[0])/I._w;                // m por pixel do preview
  if(mppTela >= mppPreview*0.95){                        // o preview já basta
    if(_hdOn){ I.overlay.setUrl(I.url); I.overlay.setBounds(imgLLBounds(I.b)); _hdOn=false; _hdKey=''; }
    return;
  }
  const key=win.map(v=>v.toFixed(1)).join(',')+'|'+pxW;
  if(key===_hdKey) return;
  _hdBusy=true;
  try{
    const hi=await orthoWindow(win, pxW);
    if(hi){ I.overlay.setUrl(hi.dataURL); I.overlay.setBounds(imgLLBounds(hi.bb));
      _hdOn=true; _hdKey=key; S._hdFails=0; }
  }catch(e){
    console.warn('ortofoto HD:', e.message);
    // Releitura falhou (handle do Android expirado / arquivo no Drive):
    // volta ao preview e, na 2ª falha seguida, desliga o HD com aviso claro.
    S._hdFails=(S._hdFails||0)+1;
    if(_hdOn && I.url){ I.overlay.setUrl(I.url); I.overlay.setBounds(imgLLBounds(I.b)); _hdOn=false; _hdKey=''; }
    if(S._hdFails>=2 && S.orthoHD){
      S.orthoHD=false;
      const cb=document.getElementById('imModHD'); if(cb) cb.checked=false;
      toast('⚠ Alta resolução dinâmica DESLIGADA: não consegui reler o arquivo da ortofoto. '+
            'Recarregue o .tif (de preferência da pasta Downloads, fora do Drive).');
    }
  }
  finally{ _hdBusy=false; }
}
function imgLLBounds(bb){
  // se a imagem foi warpada para Mercator e o pedido é o extent original do preview,
  // devolve os cantos WGS84 já corretos (guardados no applyImgNoData) em vez de
  // reconverter S.img.b como UTM — o que deslocaria a orto ~30 m.
  if(S.img && S.img._llbounds && bb===S.img.b) return S.img._llbounds;
  const sw=toWGS(S.workCRS,bb[0],bb[1]), ne=toWGS(S.workCRS,bb[2],bb[3]);
  return [[sw[1],sw[0]],[ne[1],ne[0]]];
}
function orthoHDReset(){ _hdOn=false; _hdKey=''; }

/* Recorta as células sem dado da ortofoto (alfa do TIFF, GDAL_NODATA e bordas
   brancas/pretas do mosaico) e (re)cria o overlay. Reprocessa sempre a partir do
   ImageData original, então dá para ligar/desligar sem recarregar o arquivo.     */
function applyImgNoData(){
  if(!S.img || !S.img._id) return {pct:0};
  const gcb=(id,d)=>{const e=document.getElementById(id); return e?e.checked:d;};
  const gvn=(id,d)=>{const e=document.getElementById(id); const v=e?+e.value:NaN; return isFinite(v)?v:d;};
  const on=gcb('imgND',true), wTh=gvn('imgNDw',250), bTh=gvn('imgNDb',4);
  const op=gvn('imgOp',1);
  const src=S.img._id, w=S.img._w, h=S.img._h;
  const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  const ctx=cv.getContext('2d');
  const out=ctx.createImageData(w,h);
  out.data.set(src.data);
  let cut=0;
  const D=out.data;
  for(let k=0;k<w*h;k++){
    const o=k*4;
    if(D[o+3]===0){ cut++; continue; }                       // já marcado sem dado na leitura
    if(!on) continue;
    const R=D[o],G=D[o+1],B=D[o+2];
    const branco=(R>=wTh && G>=wTh && B>=wTh);
    const preto =(R<=bTh && G<=bTh && B<=bTh);
    if(branco||preto){ D[o+3]=0; cut++; }
  }
  ctx.putImageData(out,0,0);
  const wp=warpCanvasWM(cv, S.img.b);                         // rotação da malha UTM
  const url=wp.cv.toDataURL('image/png');                     // PNG preserva o alfa
  const b=wp.b;
  const sw = wp.wm? reproj('EPSG:3857','EPSG:4326',b[0],b[1]) : toWGS(S.workCRS,b[0],b[1]);
  const ne = wp.wm? reproj('EPSG:3857','EPSG:4326',b[2],b[3]) : toWGS(S.workCRS,b[2],b[3]);
  if(S.img.overlay) map.removeLayer(S.img.overlay);
  if(!map.getPane('alagis_ortofoto')){ const pn=map.createPane('alagis_ortofoto'); pn.style.zIndex=405; }
  const ov=L2.imageOverlay(url,[[sw[1],sw[0]],[ne[1],ne[0]]],{opacity:op, pane:'alagis_ortofoto'});
  if(S.img.visible!==false) ov.addTo(map);
  ov.bringToBack&&ov.bringToBack();
  S.img.url=url; S.img.overlay=ov;
  // A imagem foi REAMOSTRADA para Web Mercator (warpCanvasWM). O bound de EXIBIÇÃO
  // é o do warp (wp.b, em Mercator), NÃO o S.img.b (UTM). Guardamos os cantos WGS84
  // já corretos para que qualquer reposicionamento futuro (HD, zApply, refreshUI)
  // NÃO use S.img.b via toWGS(UTM) — isso deslocava a orto ~30 m (bug do serrilhado).
  S.img._llbounds=[[sw[1],sw[0]],[ne[1],ne[0]]];
  S.img._warpWM=!!wp.wm;
  zApply();
  orthoHDReset();                                  // overlay novo: refaz o HD no próximo zoom
  clearTimeout(S._hdT); S._hdT=setTimeout(()=>{ try{orthoHDRefresh();}catch(e){} },250);
  return {pct:100*cut/(w*h), cut};
}

/* O raster é colocado no mapa convertendo seus cantos do CRS de TRABALHO para
   WGS84. Se as coordenadas do arquivo não estiverem nesse CRS, ele aterrissa
   em qualquer lugar — no meio do oceano, tipicamente. Esta conferência avisa
   antes, em vez de deixar o usuário procurar o raster no mapa.            */
function confereCRSraster(d, fname){
  const geoTrab = /4326|4674|4989|4988/.test(S.workCRS||'');
  const projetado = Math.abs(d.xll)>1000 || Math.abs(d.yll)>1000;
  if(d.srcCRS && d.srcCRS!==S.workCRS){
    toast('⚠ “'+fname+'” declara '+d.srcCRS+' e o projeto está em '+
      (S.workCRS||'—')+' — reprojete o arquivo ou mude o CRS de trabalho');
    return false;
  }
  if(!d.srcCRS && geoTrab && projetado){
    toast('⚠ “'+fname+'” não declara CRS e traz coordenadas métricas ('+
      d.xll.toFixed(0)+', '+d.yll.toFixed(0)+'), mas o projeto está em '+S.workCRS+
      ' — ajuste o Datum/Projeção antes de importar');
    return false;
  }
  if(!d.srcCRS)
    toast('“'+fname+'” não declara CRS — assumindo o de trabalho ('+(S.workCRS||'—')+')');
  return true;
}
async function addRasterFromTIFF(f, fname, fsize){
  fname=fname||f.name||'raster'; fsize=fsize??(f.size||0);
  showLoad(`Abrindo ${fname} (${(fsize/1048576).toFixed(0)} MB)…`);
  const d=await parseTIFF(f);
  confereCRSraster(d, fname);
  const r={id:rid++, name:fname.replace(/\.[^.]+$/,''), d,
    src:{file:fname, size:fsize, at:new Date().toISOString()},
    style:{mode:'hipso_hs', opacity:0.8}, visible:true, overlay:null};
  /* Mantém a fonte intacta nesta sessão. Com a pasta configurada, o
     salvamento automático copia este GeoTIFF sem reamostrar seus pixels. */
  if(f instanceof Blob)r._projectSourceRaw=f;
  S.rasters.push(r); renderRaster(r); refreshUI();
  projectAutoSaveRaster(r);
  const b=r.overlay&&r.overlay.getBounds?r.overlay.getBounds():null;
  if(b) safeFit(b);
  toast('Raster '+r.name+': '+d.nc+'×'+d.nr+' células');
  return r;
}

/* ---------- Modal de propriedades do raster ---------- */
let rasCur=null;
const RAS_CLASS_COL=['#313695','#4575b4','#74add1','#abd9e9','#e0f3f8','#ffffbf','#fee090','#fdae61','#f46d43','#d73027','#a50026'];
function rasEhDeclividade(r){
  return !!(r && (r.quantity==='slope' ||
    /(^|[^\p{L}])declividade([^\p{L}]|$)/iu.test((r.name||'')+' '+((r.src&&r.src.file)||''))));
}
function rasUnidadeValor(r){
  if(r&&r.quantity==='mcfIndex') return '';
  if(rasEhDeclividade(r)) return r.unit==='pct'?'%':'°';
  if(r&&r.quantity==='aspect') return '°';
  if(r&&r._cnOrto) return '';
  return 'm';
}
function rasConverteDeclividade(r,destino){
  if(!r||!rasEhDeclividade(r))return;
  const origem=r.unit==='pct'?'pct':'deg';
  if(origem===destino)return;
  const conv=g=>{
    if(!g||!g.z)return;
    for(let i=0;i<g.z.length;i++){
      const v=g.z[i]; if(!Number.isFinite(v))continue;
      g.z[i]=destino==='pct'
        ? Math.tan(v*Math.PI/180)*100
        : Math.atan(v/100)*180/Math.PI;
    }
  };
  conv(r.d);
  if(r.d&&r.d._full&&r.d._full!==r.d)conv(r.d._full);
  r.quantity='slope';r.unit=destino;
  r._st=null;r._geomInfo=null;r._url=null;r._urlHi=null;
  /* Classes antigas contêm limites e rótulos na unidade anterior. São
     refeitas no mesmo número para que mapa e legenda nunca fiquem misturados. */
  const n=(r.style&&r.style.classes&&r.style.classes.length)||0;
  if(n){
    document.getElementById('rasClassN').value=n;
    rasGerarClasses();
  }else rasClassListRender();
  try{renderRaster(r);}catch(e){}
  try{refreshUI();}catch(e){}
  try{projectAutoSaveRaster(r);}catch(e){}
  toast('Declividade convertida para '+(destino==='pct'?'porcentagem (%)':'graus (°)'));
}
function rasClassListRender(){
  const box=document.getElementById('rasClassList');if(!box||!rasCur)return;
  const cs=rasCur.style.classes||[];
  box.innerHTML=cs.length?cs.map((c,i)=>`<div style="display:grid;grid-template-columns:28px 1fr;gap:5px;align-items:center;margin:3px 0">`+
    `<input type="color" data-rci="${i}" value="${c.color||'#777777'}" style="width:27px;height:25px;padding:0">`+
    `<input type="text" data-rli="${i}" value="${esc(c.label||`${fmt(c.min)} – ${fmt(c.max)}`)}"></div>`).join(''):
    '<div class="hint">Gere classes para criar a legenda temática.</div>';
  box.querySelectorAll('[data-rci]').forEach(e=>e.oninput=()=>{cs[+e.dataset.rci].color=e.value;});
  box.querySelectorAll('[data-rli]').forEach(e=>e.onchange=()=>{cs[+e.dataset.rli].label=e.value;});
}
function rasGerarClasses(){
  if(!rasCur)return;
  const N=Math.max(2,Math.min(15,+document.getElementById('rasClassN').value||7));
  const st=rasCur._st||(rasCur._st=rasterStats(rasCur.d)),step=(st.mx-st.mn)/N,cs=[];
  const unidade=rasUnidadeValor(rasCur), suf=unidade?' '+unidade:'';
  for(let i=0;i<N;i++){
    const mn=st.mn+i*step,mx=i===N-1?st.mx:st.mn+(i+1)*step;
    const ci=Math.round(i*(RAS_CLASS_COL.length-1)/Math.max(1,N-1));
    cs.push({min:mn,max:mx,label:`${mn.toFixed(1)} – ${mx.toFixed(1)}${suf}`,color:RAS_CLASS_COL[ci],vis:true});
  }
  rasCur.style.classes=cs;rasCur.style.mode='classes';
  document.getElementById('rasMode').value='classes';rasClassListRender();
  toast(`${N} classes geradas — edite nomes e cores se necessário`);
}
function openRasProps(r){
  rasCur=r;
  /* Compatibilidade com declividades geradas por versões anteriores: o
     algoritmo antigo gravava graus, embora a janela exibisse “m”. */
  if(rasEhDeclividade(r) && !r.quantity){r.quantity='slope';r.unit='deg';}
  if(rasEhDeclividade(r)&&r.style&&r.style.classes){
    const suf=' '+rasUnidadeValor(r);
    r.style.classes.forEach(c=>{
      if(!c.label||/^\s*-?[\d.,]+\s*[–-]\s*-?[\d.,]+\s*m\s*$/i.test(c.label))
        c.label=`${(+c.min).toFixed(1)} – ${(+c.max).toFixed(1)}${suf}`;
    });
  }
  document.getElementById('rasRename').value=r.name;
  document.getElementById('rasName').textContent=r.name;
  /* A célula vinha crua do GeoTIFF: "30.17760441784739 m" no cabeçalho. O
     tamanho do pixel é informação de leitura, não de precisão. */
  {const _c=+r.d.cs, _cy=+(r.d.csy||r.d.cs), _f=v=>(+v).toLocaleString('pt-BR',{maximumFractionDigits:2});
   document.getElementById('rasMeta').textContent=r.d.nc+'×'+r.d.nr+' · '+
     (Math.abs(_c-_cy)<1e-4? _f(_c)+' m' : _f(_c)+' × '+_f(_cy)+' m')+'/célula';}
  document.getElementById('rasMode').value=r.style.mode;
  /* textura em 3D desta superfície (fica aqui, junto do estilo/relevo
     sombreado, em vez de num painel 3D separado) */
  {
    r._v3=r._v3||{papel:'terreno',cor:'#8d5524',limId:''};
    if(!r._v3.tex) r._v3.tex=(r._v3.papel==='cava'||r._v3.papel==='dce'||r._v3.papel==='estrada')?'solida':'hipso';
    const t=document.getElementById('rasTex3D'), tc=document.getElementById('rasTex3DCor');
    if(t) t.value=r._v3.tex;
    if(tc) tc.value=r._v3.cor||'#8d5524';
  }
  { /* cor sólida: valor da camada e caixa visível só quando o modo é o dela */
    const cs=document.getElementById('rasSolidaCor');
    if(cs) cs.value=(r.style&&r.style.solidColor)||'#8d5524';
    if(typeof rasSolidaSync==='function') rasSolidaSync();
  }
  { const box=document.getElementById('rasSlopeUnitBox'),sel=document.getElementById('rasSlopeUnit');
    const slope=rasEhDeclividade(r);
    if(box)box.style.display=slope?'block':'none';
    if(sel&&slope)sel.value=r.unit==='pct'?'pct':'deg'; }
  fillCRSSelect(document.getElementById('rasCRS'), S.workCRS);
  document.getElementById('rasOp').value=r.style.opacity;
  rasClassListRender();
  // reaproveita o cache de geometria (min/max já calculados) para não varrer
  // a grade de novo — em MDT grande, varrer duas vezes é o que travava
  let st=r._st;
  if(!st){ const gi=(typeof rasterGeomInfo==='function')? rasterGeomInfo(r):null;
    st = (gi && isFinite(gi.zmin)) ? {mn:gi.zmin, mx:gi.zmax} : (r._st=rasterStats(r.d)); }
  const un=rasUnidadeValor(r),rot=rasEhDeclividade(r)?'Declividade':(r.quantity==='aspect'?'Orientação':'Z');
  const ehTIN=!!(r.tinPuro||(r.d&&r.d.tin));
  {
    const box=document.getElementById('rasTinFerr');
    if(box){
      box.style.display=ehTIN?'':'none';
      if(ehTIN){
        const sl=document.getElementById('tinCorteLim');
        if(sl)sl.innerHTML='<option value="">— sem corte por limite —</option>'+
          (S.layers||[]).filter(l=>['line','polygon'].includes(l.gtype))
            .map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('');
        const ss=document.getElementById('tinCorteSup');
        if(ss)ss.innerHTML='<option value="">— sem corte por superfície —</option>'+
          (S.rasters||[]).filter(x=>x!==r)
            .map(x=>`<option value="${x.id}">${(x.tinPuro||(x.d&&x.d.tin))?'▲ ':''}${esc(x.name)}</option>`).join('');
        const cz=document.getElementById('tinCaixaZ'), co=document.getElementById('tinCaixaOn'),
          cc=document.getElementById('tinCaixaCor');
        const cx=(r._v3&&r._v3.caixa)||null;
        if(co)co.checked=!!(cx&&cx.on&&cx.userSet===true);
        if(cz&&!cz.value){
          let zmn=Infinity; const zs=r.d.tin?r.d.tin.zs:null;
          if(zs)for(let i=0;i<zs.length;i++)if(zs[i]<zmn)zmn=zs[i];
          cz.value=cx&&isFinite(+cx.zbase)?cx.zbase:(isFinite(zmn)?Math.floor(zmn-10):0);
        }
        if(cz&&cx&&isFinite(+cx.zbase))cz.value=cx.zbase;
        if(cc&&r._v3&&r._v3.caixaCor)cc.value=r._v3.caixaCor;
        const db=document.getElementById('btnTinCorteDesfaz');
        if(db)db.disabled=!(r.d.tin&&r.d.tin._triOrig);
      }
    }
  }
  const tinTag=ehTIN?`<b style="color:#7fe0a8">▲ Superfície TIN</b> · ${((r.d.tin.tri.length/3)|0).toLocaleString('pt-BR')} triângulos · ${r.d.tin.xs.length.toLocaleString('pt-BR')} vértices — os cálculos amostram o triângulo exato; a grade abaixo é só a exibição 2D · <button class="mini" id="btnTinExpObj" style="vertical-align:middle">⬇ Exportar OBJ</button><br>`:'';
  /* Resolução junto da origem: quem lê a faixa de cotas precisa saber em que
     pixel ela foi medida — 0,26 m e 30 m contam histórias diferentes sobre o
     mesmo terreno. Célula não quadrada aparece como "a × b" (csy perdido já
     deslocou MDT contra ortofoto antes) e grade reduzida é dita na hora. */
  const _cs=+r.d.cs, _csy=+(r.d.csy||r.d.cs),
    _n=v=>(+v).toLocaleString('pt-BR',{maximumFractionDigits:2}),
    _cel=Math.abs(_cs-_csy)<1e-4? `${_n(_cs)} m` : `${_n(_cs)} × ${_n(_csy)} m`,
    _resTxt=`<b>${r.d.nc}×${r.d.nr}</b> · <b>${_cel}</b>/célula`+
      (r.d.resampled>1? ` <span style="color:var(--amber)">(tela ÷${r.d.resampled})</span>` : ' (nativa)');
  document.getElementById('rasInfo').innerHTML=tinTag+
    `${srcHTML(r.src,true)}<br>Resolução: ${_resTxt}<br>${rot}: <b>${st.mn.toFixed(1)}</b> – <b>${st.mx.toFixed(1)}</b>${un?' '+un:''} · X ${r.d.xll.toFixed(0)}–${(r.d.xll+r.d.nc*r.d.cs).toFixed(0)} · Y ${r.d.yll.toFixed(0)}–${(r.d.yll+r.d.nr*r.d.cs).toFixed(0)}`;
  { const b=document.querySelector('#rasInfo [data-open-src]');
    if(b)b.onclick=()=>abreLocalFonteRaster(r); }
  { const be=document.getElementById('btnTinExpObj');
    if(be)be.onclick=()=>{
      const T=r.d.tin;if(!T)return;
      let s='# CCMGIS — Superfície TIN\n# '+r.name+'\n';
      for(let i=0;i<T.xs.length;i++)
        s+='v '+T.xs[i].toFixed(3)+' '+T.ys[i].toFixed(3)+' '+T.zs[i].toFixed(3)+'\n';
      for(let t=0;t<T.tri.length;t+=3)
        s+='f '+(T.tri[t]+1)+' '+(T.tri[t+1]+1)+' '+(T.tri[t+2]+1)+'\n';
      download(new Blob([s],{type:'model/obj'}),
        r.name.replace(/[^\w\-]+/g,'_')+'.obj');
    }; }
  rasResInfo();
  rasProjectStoreInfo();
  document.getElementById('rasFullRes').checked=!!S.fullRes;
  { const im=document.getElementById('rasResampleM'); if(im) im.value=''; }
  document.getElementById('rasModal').classList.add('on');
}
function rasProjectStoreInfo(){
  const e=document.getElementById('rasProjectStore'),b=document.getElementById('rasSaveProject');
  if(!e||!rasCur)return;
  if(rasCur.projectFile){
    const dt=rasCur.projectSavedAt?new Date(rasCur.projectSavedAt).toLocaleString('pt-BR'):'data não registrada';
    e.innerHTML=`<span style="color:var(--ok)">✓ Salvo</span> em <b>${esc(rasCur.projectFile)}</b><br>`+
      `<span class="hint">Última gravação: ${esc(dt)}</span>`;
    if(b)b.textContent='↻ Salvar novamente na pasta de trabalho';
  }else{
    e.innerHTML='<span style="color:var(--amber)"><b>Somente na memória do projeto.</b></span> '+
      'Ainda não existe GeoTIFF deste produto na pasta de trabalho.';
    if(b)b.textContent='💾 Salvar GeoTIFF nativo na pasta de trabalho';
  }
}
async function abreLocalFonteRaster(r){
  if(!r)return;
  if(!window.showOpenFilePicker){
    toast('O navegador não permite mostrar a pasta. Use “Carregar grade nativa” para indicar novamente o arquivo.');return;
  }
  let h=null,start='documents';
  try{h=await recuperaFonte(r);if(h)start=h;}catch(e){}
  if(!h&&r.projectFile){
    try{const ds=await projectDirs(false);if(ds)start=ds.rasters;}catch(e){}
  }
  try{
    const hs=await showOpenFilePicker({id:'alagis-raster-source',startIn:start,multiple:false,
      types:[{description:'Raster / GeoTIFF',accept:{'image/tiff':['.tif','.tiff'],
        'text/plain':['.asc','.txt']}}]});
    if(!hs||!hs[0])return;
    const nh=hs[0],f=await nh.getFile();
    if(/\.(tif|tiff)$/i.test(f.name)){
      showLoad('Verificando o arquivo original…');
      const ok=await religaFonte(r,f);hideLoad();
      if(ok){await lembraFonte(r,nh);r.src=r.src||{};r.src.file=f.name;
        r.src.size=f.size;r.src.at=new Date().toISOString();openRasProps(r);}
    }else toast('Arquivo localizado: '+f.name);
  }catch(e){
    if(e&&e.name!=='AbortError')toast('Não foi possível abrir a localização: '+(e.message||e));
  }
}
function rasResInfo(){
  const r=rasCur; if(!r) return;
  const d=r.d, el=document.getElementById('rasRes'); if(!el) return;
  const cel=(dd)=>(Number.isFinite(+dd?.cs)
    ?(+dd.cs).toLocaleString('pt-BR',{maximumFractionDigits:2}):'—')+' m/célula';
  if(!(d.resampled>1)){
    el.innerHTML=`Grade <b>nativa</b> ${d.nc}×${d.nr} · ${cel(d)} — nada foi reamostrado.`;
  } else if(d._full){
    el.innerHTML=`Tela: ${d.nc}×${d.nr} · ${cel(d)} (média ÷${d.resampled})<br>`+
      `Produto: <b>nativa ${d._full.nc}×${d._full.nr}</b> · ${cel(d._full)} — <b>carregada</b> ✔`;
  } else {
    const W0=Number.isFinite(+d._W0)&&+d._W0>0?+d._W0:
      (Array.isArray(d.srcDims)&&Number.isFinite(+d.srcDims[0])?+d.srcDims[0]:null);
    const H0=Number.isFinite(+d._H0)&&+d._H0>0?+d._H0:
      (Array.isArray(d.srcDims)&&Number.isFinite(+d.srcDims[1])?+d.srcDims[1]:null);
    let cs0=Number.isFinite(+d.cs)?+d.cs/Math.max(1,+d.resampled||1):NaN;
    if(W0&&d._bb&&Number.isFinite(d._bb[2]-d._bb[0]))cs0=(d._bb[2]-d._bb[0])/W0;
    el.innerHTML=`Tela: ${d.nc}×${d.nr} · ${cel(d)} (média ÷${d.resampled})<br>`+
      (W0&&H0
        ?`Produto: nativa <b>${W0}×${H0}</b> · ${Number.isFinite(cs0)?cs0.toFixed(2):'—'} m/célula — arquivo original ainda não carregado`
        :`Produto: <b>grade nativa ainda não vinculada</b> — indique o GeoTIFF original`);
  }
}
/* O botão de propriedades é um gesto direto do usuário. Se a grade plena não
   estiver mais em memória, abre imediatamente o seletor do sistema; cancelar
   simplesmente devolve false e preserva integralmente a camada atual. */
async function rasEscolherNativoAgora(r){
  if(!r)return false;
  if(window.showOpenFilePicker&&fsApiOK()){
    try{
      const opt={id:'alagis-grade-nativa',multiple:false,
        types:[{description:'GeoTIFF nativo',accept:{'image/tiff':['.tif','.tiff']}}]};
      if(S._lastDir)opt.startIn=S._lastDir;
      const hs=await window.showOpenFilePicker(opt);
      if(!hs||!hs[0])return false;
      const h=hs[0];lembraLocal(h);
      showLoad('Lendo e conferindo a grade nativa…');
      const ok=await religaFonte(r,await h.getFile());
      hideLoad();
      if(ok)await lembraFonte(r,h);
      return !!ok;
    }catch(e){
      hideLoad();
      if(e&&e.name==='AbortError')return false;
      /* Em file:// alguns navegadores bloqueiam a File System Access API.
         O input abaixo abre o mesmo seletor sem exigir essa API. */
      if(!(e&&e.name==='SecurityError'))
        toast('Não foi possível abrir a grade nativa: '+((e&&e.message)||e));
    }
  }
  return await new Promise(resolve=>{
    const inp=document.createElement('input');
    inp.type='file';inp.accept='.tif,.tiff,image/tiff';inp.style.display='none';
    document.body.appendChild(inp);
    let terminou=false;
    const fim=v=>{if(terminou)return;terminou=true;try{inp.remove();}catch(_){}resolve(v);};
    inp.onchange=async()=>{
      const f=inp.files&&inp.files[0];
      if(!f)return fim(false);
      showLoad('Lendo e conferindo a grade nativa…');
      try{fim(!!(await religaFonte(r,f)));}
      catch(e){toast('Falha ao ler o GeoTIFF: '+((e&&e.message)||e));fim(false);}
      finally{hideLoad();}
    };
    inp.addEventListener('cancel',()=>fim(false),{once:true});
    inp.click();
  });
}
function bindRasModal(){
  const close=()=>document.getElementById('rasModal').classList.remove('on');
  document.getElementById('rasClose').onclick=close;
  const bgc=document.getElementById('rasClassGen');if(bgc)bgc.onclick=rasGerarClasses;
  const bsp=document.getElementById('rasSaveProject');
  if(bsp)bsp.onclick=async()=>{
    if(!rasCur)return;
    bsp.disabled=true;
    showLoad('Gravando GeoTIFF na resolução plena…');
    const ok=await projectAutoSaveRaster(rasCur,true);
    hideLoad();bsp.disabled=false;rasProjectStoreInfo();
    toast(ok?'Raster salvo na pasta de trabalho':'Raster não foi salvo — escolha ou autorize a pasta de trabalho');
  };
  /* Mostra a cor só no modo sólido: um campo de cor visível num modo que não
     o usa faria o usuário mexer nele e não ver nada mudar. */
  window.rasSolidaSync=()=>{
    const md=document.getElementById('rasMode'), bx=document.getElementById('rasSolidaBox');
    if(bx) bx.style.display=(md&&md.value==='solida')?'grid':'none';
  };
  const rmd=document.getElementById('rasMode');
  if(rmd)rmd.onchange=()=>{ rasClassListRender(); rasSolidaSync(); };
  {
    const cs=document.getElementById('rasSolidaCor');
    if(cs){
      const grava=()=>{ if(!rasCur)return;
        rasCur.style=rasCur.style||{}; rasCur.style.solidColor=cs.value; };
      /* 'input' junto de 'change': o seletor de cor do navegador só dispara
         change quando a paleta FECHA, e o arraste precisa acompanhar. */
      cs.addEventListener('input',grava); cs.addEventListener('change',grava);
    }
  }
  {
    const info=document.getElementById('tinCorteInfo');
    const bc=document.getElementById('btnTinCorta');
    if(bc)bc.onclick=()=>{
      if(!rasCur||!rasCur.d||!rasCur.d.tin)return;
      const limId=(document.getElementById('tinCorteLim')||{}).value||'';
      const supId=(document.getElementById('tinCorteSup')||{}).value||'';
      let res;
      if(limId){
        const L=S.layers.find(l=>String(l.id)===String(limId));
        res=tinCortaPorLimite(rasCur,L,(document.getElementById('tinCorteLimModo')||{}).value||'dentro');
      }else if(supId){
        const r2=S.rasters.find(x=>String(x.id)===String(supId));
        res=tinCortaPorSuperficie(rasCur,r2,(document.getElementById('tinCorteSupModo')||{}).value||'acima');
      }else{ if(info)info.textContent='Escolha um limite ou uma superfície de corte.'; return; }
      if(res.err){ if(info)info.innerHTML='<b>Não cortou:</b> '+esc(res.err); return; }
      if(info)info.innerHTML=`Corte aplicado: <b>${res.antes.toLocaleString('pt-BR')}</b> → <b>${res.depois.toLocaleString('pt-BR')}</b> triângulos.`;
      const db=document.getElementById('btnTinCorteDesfaz'); if(db)db.disabled=false;
      const faixa=document.getElementById('rasInfo');
      try{ openRasProps(rasCur); }catch(e){}
    };
    const bd=document.getElementById('btnTinCorteDesfaz');
    if(bd)bd.onclick=()=>{
      if(!rasCur)return;
      if(tinDesfazCorte(rasCur)){ if(info)info.textContent='Corte desfeito — malha original restaurada.';
        try{ openRasProps(rasCur); }catch(e){} }
    };
    const aplicaCaixa=()=>{
      if(!rasCur)return;
      rasCur._v3=rasCur._v3||{papel:'terreno',cor:'#8d5524',limId:''};
      const co=document.getElementById('tinCaixaOn'), cz=document.getElementById('tinCaixaZ'),
        cc=document.getElementById('tinCaixaCor');
      rasCur._v3.caixa={on:!!(co&&co.checked), zbase:cz?+String(cz.value).replace(',','.'):0,
        userSet:true};
      if(cc)rasCur._v3.caixaCor=cc.value;
      if(typeof v3Auto==='function')v3Auto();
    };
    ['tinCaixaOn','tinCaixaZ','tinCaixaCor'].forEach(id=>{
      const e=document.getElementById(id); if(e)e.onchange=aplicaCaixa;
    });
  }
  {
    /* A superfície de elevação já está no projeto: este seletor só troca
       qual camada existente está sendo configurada; não abre importação nem
       duplica o MDT. */
    const atualizaMdt3D=()=>{
      const box=document.getElementById('rasV3MdtBox'), sel=document.getElementById('rasV3Mdt');
      if(!box||!sel)return;
      const rs=(S.rasters||[]).filter(r=>r&&r.d&&r.d.z);
      box.style.display=rs.length?'':'none';
      sel.innerHTML=rs.map(r=>`<option value="${r.id}"${r===rasCur?' selected':''}>${esc(r.name)}</option>`).join('');
      sel.onchange=()=>{
        const r=rs.find(q=>String(q.id)===String(sel.value));
        if(!r||r===rasCur)return;
        S.selRaster=r; S.activeId=null;
        openRasProps(r);
      };
    };
    const infoOrto=()=>{
      const box=document.getElementById('rasTexImgInfo');
      const t=document.getElementById('rasTex3D');
      if(!box)return;
      if(t&&t.value==='orto'){
        box.style.display='';
        const ortos=listaOrtofotosCarregadas(), escolhida=ortofoto3DSelecionada(rasCur);
        const nome=escolhida&&escolhida.o&&escolhida.o.name;
        box.innerHTML=ortos.length
          ?`<label class="field" style="margin:0 0 3px">Ortofoto renderizada neste MDT</label>`+
            `<div class="row2" style="grid-template-columns:1fr auto"><select id="rasTexOrto">`+
            ortos.map(q=>`<option value="${esc(q.id)}"${escolhida&&q.id===escolhida.id?' selected':''}>${esc(q.o.name||'Ortofoto')}</option>`).join('')+
            `</select><button class="tbtn" id="btnRasTexImg" style="padding:2px 8px">＋ Ortofoto…</button></div>`+
            `<div class="hint" style="margin-top:3px">A escolha é individual para este MDT.</div>`
          :'<b>Nenhuma ortofoto carregada</b> — a superfície ficará hipsométrica. '+
            '<button class="tbtn" id="btnRasTexImg" style="padding:2px 8px;margin-left:6px">＋ Carregar ortofoto…</button>';
        const so=document.getElementById('rasTexOrto');
        if(so)so.onchange=()=>{ if(!rasCur)return; rasCur._v3=rasCur._v3||{};
          rasCur._v3.ortoId=so.value; if(typeof v3Auto==='function')v3Auto(); };
        const bb=document.getElementById('btnRasTexImg');
        if(bb)bb.onclick=()=>{
          /* reusa o fluxo existente da imagem de fundo: escolher o arquivo,
             informar os cantos e Posicionar — depois o drape usa essa imagem */
          const fi=document.getElementById('imgIn');
          document.getElementById('rasModal').classList.remove('on');
          try{ switchView('map'); }catch(e){}
          try{ syncSideSecs(); }catch(e){}
          if(fi)fi.click();
          toast('Escolha a ortofoto; depois informe os cantos e toque em Posicionar. A superfície em 3D passa a usá-la.');
        };
      } else box.style.display='none';
    };
    const aplicaTex=()=>{
      if(!rasCur)return;
      const t=document.getElementById('rasTex3D'), tc=document.getElementById('rasTex3DCor');
      rasCur._v3=rasCur._v3||{papel:'terreno',cor:'#8d5524',limId:''};
      if(t) rasCur._v3.tex=t.value;
      if(tc) rasCur._v3.cor=tc.value;
      /* Textura é só aparência. O papel geométrico permanece intacto para
         não trocar contenção por furo (ou vice-versa) ao mudar a cor. */
      infoOrto();
      if(typeof v3Auto==='function') v3Auto();
    };
    const t=document.getElementById('rasTex3D'); if(t)t.onchange=aplicaTex;
    const tc=document.getElementById('rasTex3DCor');
    /* O seletor de cor do navegador só dispara 'change' quando a paleta
       FECHA; sem 'input' a cor do 3D só mudaria depois de fechar a janelinha. */
    if(tc){ tc.onchange=aplicaTex; tc.addEventListener('input',aplicaTex); }
    atualizaMdt3D();
    infoOrto();
  }
  const rsu=document.getElementById('rasSlopeUnit');
  if(rsu)rsu.onchange=()=>{if(rasCur)rasConverteDeclividade(rasCur,rsu.value);};
  const cbFR=document.getElementById('rasFullRes');
  if(cbFR) cbFR.onchange=e=>{ S.fullRes=e.target.checked;
    toast(S.fullRes?'Produtos: resolução PLENA':'Produtos: grade de tela (rápido, com perda)'); };
  const bLF=document.getElementById('rasLoadFull');
  if(bLF) bLF.onclick=async()=>{
    if(!rasCur) return;
    const r=rasCur,d=r.d;
    if(!(d.resampled>1)){ toast('Este raster já está em resolução nativa'); return; }
    let g=null;
    if(d._full||d._img0){
      try{g=await demFull(d);}catch(_){}
    }else{
      /* Não mostra primeiro uma mensagem de erro: abre o Finder/seletor. */
      if(!await rasEscolherNativoAgora(r))return;
      g=r.d._full||r.d;
    }
    rasResInfo();
    if(r.dispFull&&g){try{renderRaster(r);}catch(e){}}
    if(g)toast(`Grade nativa ${g.nc}×${g.nr} carregada`);
  };
  const cDF=document.getElementById('rasDispFull');
  // --- Reamostrar a superfície para X m/célula (bloco Resolução) ---
  const inM=document.getElementById('rasResampleM'), btM=document.getElementById('rasResampleBtn'),
        outM=document.getElementById('rasResampleOut');
  function rasResamplePrev(){
    if(!rasCur||!outM) return;
    const d=rasCur.d, base=d._full||d;                 // parte da grade mais fina disponível
    const alvo=inM? parseFloat(String(inM.value).replace(',','.')) : NaN;
    if(inM){ inM.min=base.cs.toFixed(2); if(!inM.placeholder) inM.placeholder=base.cs.toFixed(2); }
    if(!isFinite(alvo)||alvo<=0){
      outM.innerHTML='Reduz a grade de trabalho por média de bloco — deixa mapa, 3D e Hidro mais leves. Os produtos releem o GeoTIFF nativo se disponível.'; return; }
    if(alvo<=base.cs*1.01){
      outM.innerHTML=`<span style="color:var(--amber)">${alvo} m é menor ou igual à célula atual (${base.cs.toFixed(2)} m) — nada a reduzir.</span>`; return; }
    const f=Math.max(1,Math.round(alvo/base.cs));
    const nc=Math.max(2,Math.floor(base.nc/f)), nr=Math.max(2,Math.floor(base.nr/f));
    const M=nc*nr/1e6;
    outM.innerHTML=`Ficará <b>${nc}×${nr}</b> = ${M.toFixed(2)} M células · ${(base.cs*f).toFixed(2)} m/célula`+
      (M>12?' <span style="color:var(--amber)">(ainda pesado)</span>':' <span style="color:var(--ok)">(leve)</span>');
  }
  if(inM) inM.oninput=rasResamplePrev;
  if(btM) btM.onclick=()=>{
    if(!rasCur){ return; }
    const d=rasCur.d, base=d._full||d;
    const alvo=inM? parseFloat(String(inM.value).replace(',','.')) : NaN;
    if(!isFinite(alvo)||alvo<=base.cs*1.01){ toast('Informe uma célula MAIOR que a atual ('+base.cs.toFixed(2)+' m)'); return; }
    const f=Math.max(1,Math.round(alvo/base.cs));
    if(f<=1){ toast('Fator resultante = 1 — nada a reduzir'); return; }
    showLoad('Reamostrando a superfície…');
    setTimeout(()=>{
      try{
        const gg=reduceGridFactor(base, f);
        gg.resampled=(base===d ? (d.resampled||1) : 1)*f;  // marca procedência p/ produtos
        gg.srcDims=base.srcDims||[base.nc,base.nr];
        gg.native=false;
        gg._full=d._full||null;                            // preserva o nativo p/ os produtos
        rasCur.d=gg;
        rasCur._geomInfo=null; rasCur._st=null; rasCur._url=null; rasCur._urlHi=null; // invalida caches
        try{ renderRaster(rasCur); }catch(e){}
        try{ rasResInfo(); }catch(e){}
        document.getElementById('rasMeta').textContent=gg.nc+'×'+gg.nr+' · '+gg.cs.toFixed(2)+' m';
        rasResamplePrev();
        if(typeof refreshUI==='function') refreshUI();
        toast(`Superfície reamostrada para ${gg.nc}×${gg.nr} (${gg.cs.toFixed(2)} m)`);
        if(typeof cmdLog==='function') cmdLog(`superfície "${rasCur.name}" reamostrada → ${gg.nc}×${gg.nr} (${gg.cs.toFixed(2)} m)`,'info');
      }catch(e){ toast('Falha ao reamostrar: '+(e&&e.message||e)); }
      finally{ hideLoad(); }
    },30);
  };
  if(cDF) cDF.onchange=async()=>{
    if(!rasCur) return;
    rasCur.dispFull=cDF.checked;
    if(cDF.checked){
      if(!rasCur.d._full){
        showLoad('Lendo a grade nativa para o desenho…');
        try{ await gridBruto(rasCur,'desenhar o mapa na grade nativa'); }catch(e){}
        hideLoad();
      }
      if(!rasCur.d._full){ cDF.checked=false; rasCur.dispFull=false;
        toast('Grade nativa indisponível — indique o GeoTIFF de origem'); return; }
      const n=rasCur.d._full.nc*rasCur.d._full.nr;
      toast(`Mapa na grade nativa (${(n/1e6).toFixed(1)} M células) — pode demorar a desenhar`);
    }
    try{ renderRaster(rasCur); rasResInfo(); }catch(e){ toast('Falha ao desenhar: '+e.message); }
  };
  { const cHD=document.getElementById('rasDemHD');
    if(cHD){
      cHD.checked=!!(rasCur&&rasCur.demHD);
      /* Sem o GeoTIFF desta sessão não há o que reler por janela: a opção
         fica indisponível em vez de prometer o que não entrega. */
      const podeHD=!!(rasCur&&rasCur.d&&rasCur.d._img0);
      cHD.disabled=!podeHD;
      const inf=document.getElementById('rasDemHDInfo');
      if(inf&&!podeHD)inf.innerHTML='<b>Indisponível para esta superfície:</b> o GeoTIFF de origem não está carregado nesta sessão (projeto reaberto ou grade gerada no app). Recarregue o .tif para habilitar os tiles.';
      cHD.onchange=()=>{
        if(!rasCur) return;
        rasCur.demHD=cHD.checked;
        try{ syncDemTiles(rasCur); }catch(e){ toast('Falha ao ligar os tiles: '+(e&&e.message||e)); }
        if(cHD.checked){
          const p=rasCur.d.resampled>1?` (tela ${rasCur.d.nc}×${rasCur.d.nr} · nativo ${rasCur.d._W0}×${rasCur.d._H0})`:'';
          toast('Tiles em alta resolução ligados'+p);
        }
      };
    }
  }
  { const c=document.getElementById('rasDispFull');
    if(c) c.checked=!!(rasCur && rasCur.dispFull);
    const t=document.getElementById('rasTeto');
    if(t) t.innerHTML=`Teto de desenho nesta máquina: <b>${(RASTER_MAX_CELLS/1e6).toFixed(0)} M células</b>`+
      ` (${EH_MOVEL?'aparelho móvel':'desktop, '+((navigator.deviceMemory||8))+' GB'}).`+
      ` Abaixo disso o mapa já sai na grade nativa e não há deslocamento de desenho.`; }
  { const be=document.getElementById('btnRasExp');
    if(be) be.onclick=()=>exportaMDT(rasCur); }
  const bCT=document.getElementById('rasContour');
  if(bCT) bCT.onclick=async()=>{
    if(!rasCur) return;
    const iv=+document.getElementById('rasCInt').value;
    if(!(iv>0)){ toast('Equidistância inválida'); return; }
    const g=await gridProd(rasCur,'gerar a imagem da superfície');
    if(g.nc*g.nr>60e6 && !confirm(`Grade de ${(g.nc*g.nr/1e6).toFixed(0)} M células — a geração pode levar minutos. Continuar?`)) return;
    showLoad(`Curvas ${iv} m sobre ${g.nc}×${g.nr}…`);
    await new Promise(rs=>setTimeout(rs,10));
    let lines=[];
    try{ lines=contourGrid(g, iv); }catch(e){ hideLoad(); toast('Falha: '+e.message); return; }
    hideLoad();
    if(!lines.length){ toast('Nenhuma curva gerada — verifique o intervalo'); return; }
    addLayer({name:rasCur.name+' — curvas '+iv+' m', gtype:'line', crs:S.workCRS,
      features:lines.map(ln=>({geom:ln.pts, multi:false, props:{COTA:+ln.z.toFixed(2)}})),
      fields:[{name:'COTA',type:'N',length:12,decimal:2}], color:'#37c0aa'});
    toast(`${lines.length} polilinhas a cada ${iv} m (grade ${g.native?'nativa':'de tela'} ${g.cs.toFixed(2)} m)`);
    close();
  };
  document.getElementById('rasRenameBtn').onclick=()=>{
    if(!rasCur) return;
    const n=document.getElementById('rasRename').value.trim();
    if(!n){ toast('Informe um nome'); return; }
    rasCur.name=n; document.getElementById('rasName').textContent=n;
    refreshUI(); toast('Raster renomeado para "'+n+'"');
  };
  document.getElementById('rasModal').addEventListener('click',e=>{if(e.target.id==='rasModal')close();});
  document.getElementById('rasApply').onclick=()=>{
    if(!rasCur)return;
    rasCur.style.mode=document.getElementById('rasMode').value;
    rasCur.style.opacity=+document.getElementById('rasOp').value;
    { const cs=document.getElementById('rasSolidaCor');
      if(cs) rasCur.style.solidColor=cs.value; }
    /* Aplicar estilo significa aplicar ao mesmo tempo em 2D, Layout e 3D.
       Apenas uma ortofoto escolhida explicitamente permanece como drape. */
    rasCur._v3=rasCur._v3||{papel:'terreno',cor:'#8d5524',limId:''};
    if(rasCur._v3.tex!=='orto')rasCur._v3.tex='hipso';
    showLoad('Renderizando…'); setTimeout(()=>{renderRaster(rasCur);hideLoad();toast('Estilo aplicado');},20);
  };
  /* ESTILO DO RASTER AO VIVO — qualquer propriedade, sem passar pelo Aplicar.
     Antes só o modo e a opacidade acompanhavam; cor de classe, nome de classe
     e "Gerar classes" mudavam o modelo e o mapa só obedecia depois do botão,
     o que faz a tela mentir sobre o estado do projeto.
     O ouvinte é DELEGADO no #rasModal porque a lista de classes é recriada por
     rasClassListRender a cada geração — ligar um a um perderia os novos.
     Atraso de 320 ms: redesenhar a grade custa bem mais que um vetor, e o
     seletor de cor dispara uma enxurrada de eventos durante o arraste. */
  {
    let t=null;
    const VIVO='#rasMode,#rasOp,#rasSolidaCor,#rasTex3D,#rasTex3DCor,#rasSlopeUnit,[data-rci],[data-rli]';
    window.rasEstiloVivo=()=>{
      if(!rasCur) return;
      clearTimeout(t);
      t=setTimeout(()=>{
        if(!rasCur) return;
        const md=document.getElementById('rasMode'), op=document.getElementById('rasOp'),
              sc=document.getElementById('rasSolidaCor');
        if(md) rasCur.style.mode=md.value;
        if(op) rasCur.style.opacity=+op.value;
        if(sc) rasCur.style.solidColor=sc.value;
        /* De propósito NÃO mexe em _v3.tex aqui. O botão Aplicar força a
           textura do 3D para o estilo da camada; fazer isso a cada ajuste de
           opacidade trocaria em silêncio uma "Cor sólida" escolhida à mão. A
           textura tem ouvinte próprio (aplicaTex) e continua ao vivo. */
        try{ renderRaster(rasCur); }catch(e){}
      }, 320);
    };
    const mod=document.getElementById('rasModal');
    if(mod){
      ['input','change'].forEach(ev=>mod.addEventListener(ev,e=>{
        if(e.target && e.target.closest && e.target.closest(VIVO)) rasEstiloVivo();
      }));
      /* "Gerar classes" troca a legenda inteira: o mapa acompanha na hora. */
      mod.addEventListener('click',e=>{
        if(e.target && e.target.id==='rasClassGen') setTimeout(rasEstiloVivo,0);
      });
    }
  }
  document.getElementById('rasHidro').onclick=async()=>{
    if(!rasCur)return;
    const g=await hidroGrid(rasCur,'usar esta superfície como MDE do Hidro');
    if(!g){ toast('MDE não definido — sem o GeoTIFF original'); return; }
    if(typeof hShadeOff==='function') hShadeOff(true);
    const d=rasCur.d;
    S.hidro.dem=g;
    document.getElementById('hDemOut').innerHTML=
      hidroDemHTML(g,d)+`<br>Fonte: raster "${esc(rasCur.name)}"`;
    ['btnFill','btnShade','btnRaw','btnD8Dir'].forEach(id=>{const e=document.getElementById(id); if(e) e.disabled=false;});
    if(g.acc) document.getElementById('btnStreams').disabled=false;
    if(g.zf || g._bruto===true || g.acc) document.getElementById('btnBasin').disabled=false;
    if(typeof hResHintUpd==="function") hResHintUpd(); if(typeof hInundStats==="function") try{hInundStats();}catch(e){}
    close(); toast('Raster definido como MDE do módulo Hidro');
  };

  document.getElementById('rasZoom').onclick=()=>{
    if(rasCur && rasCur.overlay && rasCur.overlay.getBounds){
      safeFit(rasCur.overlay.getBounds()); close();
    }
  };
  document.getElementById('rasWarp').onclick=()=>{
    if(!rasCur) return;
    const src=document.getElementById('rasCRS').value;
    if(src===S.workCRS){ toast('CRS de origem = CRS de trabalho — nada a reprojetar'); return; }
    const r=rasCur;
    showLoad('Reprojetando raster ('+(CRS_LABELS[src]||src)+' → '+(CRS_LABELS[S.workCRS]||S.workCRS)+')…');
    setTimeout(()=>{
      try{
        const fwd=(xx,yy)=>reproj(src,S.workCRS,xx,yy);
        const inv=(XX,YY)=>reproj(S.workCRS,src,XX,YY);
        const wasHidro=(S.hidro && S.hidro.dem===r.d);
        const full0=r.d._full;                       // grade nativa (se já carregada)
        const nd=warpRaster(r.d,fwd,inv);
        if(full0){                                   // reprojeta também a nativa: produtos seguem plenos
          const nf=warpRaster(full0,fwd,inv); nf.native=true;
          nd._full=nf; nd.resampled=Math.max(2, Math.round(nf.nc/nd.nc));
          nd._W0=nf.nc; nd._H0=nf.nr;
        } else if(r.d.resampled>1){
          toast('⚠ Reprojetado a partir da grade de tela — carregue a grade nativa antes de reprojetar para manter a resolução plena');
        }
        r.d=nd; r._st=null; r._url=null; r._urlHi=null; r._hiKey=null;
        if(wasHidro){ S.hidro.dem=nd;
          const o=document.getElementById('hDemOut');
          if(o) o.innerHTML=`<b>${nd.nc}×${nd.nr}</b> células · ${nd.cs.toFixed(2)} m (reprojetado)`; }
        renderRaster(r);
        if(r.overlay&&r.overlay.getBounds) safeFit(r.overlay.getBounds());
        hideLoad(); close(); refreshUI();
        toast('Raster reprojetado: '+nd.nc+'×'+nd.nr+' células');
      }catch(e){ hideLoad(); toast('Falha na reprojeção: '+e.message); }
    },30);
  };
  document.getElementById('rasDel').onclick=()=>{
    if(!rasCur)return;
    if(!confirm(`Remover a superfície "${rasCur.name}"?\nEsta ação não pode ser desfeita.`)) return;
    const r=rasCur; rasCur=null; close(); deleteRaster(r);
  };
}

/* ---------- PERFIS ---------- */

