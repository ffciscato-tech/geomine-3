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
/* warpRaster: reprojeta a grade usando malha de ancoras 33x33 para a
   transformacao (rapido: ~1k projecoes em vez de 1 por celula). O modo
   nearest e reservado para a visualizacao Original: evita inventar valores
   intermediarios e conserva a leitura pixel a pixel do GeoTIFF. */
function warpRaster(d, fwd /*fn (x,y)->[X,Y] de src p/ dst*/, inv /*dst->src*/, resample){
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
      if(resample==='nearest' || resample==='native'){
        zOut[r*nc2+c]=Z(Math.round(gr),Math.round(gc));
        continue;
      }
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
  // A fonte da triangulação não é necessariamente um limite: curvas de
  // nível fechadas podem estar misturadas às abertas. O gerador registra
  // sua política para que mapa, tiles e layout não inventem outro recorte.
  // Máscaras/anéis e limId explicitamente escolhidos continuam válidos.
  const autoClip=r._tinAutoClip!==false;
  const ids=[r._v3&&r._v3.limId,...(autoClip?[r._tinSourceId]:[])].filter(v=>v!==''&&v!=null);
  let L=null;
  for(const id of ids){L=(S.layers||[]).find(x=>String(x.id)===String(id));if(L)break;}
  if(!L&&autoClip){
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
function rasterClassNumber(v){
  if(v===null||v===undefined||v==='')return NaN;
  const n=Number(v);return Number.isFinite(n)?n:NaN;
}
/* Contrato único das faixas em todo o aplicativo. Os dois extremos são
   aceitos e, quando duas classes se encostam, a primeira da lista recebe o
   valor exato do corte — preserva o comportamento histórico do mapa 2D. */
function rasterClassRangeFind(classes,value){
  const v=rasterClassNumber(value),cs=Array.isArray(classes)?classes:[];
  if(!Number.isFinite(v))return null;
  for(let i=0;i<cs.length;i++){
    const c=cs[i],lo=rasterClassNumber(c&&c.min),hi=rasterClassNumber(c&&c.max);
    if(Number.isFinite(lo)&&Number.isFinite(hi)&&hi>lo&&v>=lo&&v<=hi)
      return {item:c,index:i,min:lo,max:hi};
  }
  return null;
}
function rasterPainter(r,mn,rng){
  if(r.style?.mode==='relevo_local')return ()=>false; // TPI is computed from the native halo in its worker, never from preview elevations.
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
      const hit=rasterClassRangeFind(cs,v),q=hit&&hit.item;
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
  const stNativo=r.dispFull&&r.d&&r.d._sourceStats&&
      (r.d._sourceStats.exact||d===r.d)?r.d._sourceStats:null,
    st=stNativo||(r.dispFull&&d!==r.d
      ?(r._stFull||(r._stFull=rasterStats(d)))
      :(r._st||(r._st=rasterStats(r.d)))),
    mn=st.mn,mx=st.mx,rng=(mx-mn)||1;
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

/* PLOTAGEM — imagem do raster no CRS de trabalho (a grade pode ser reduzida
   somente para caber no canvas). Cacheada por estilo, grade e revisão.       */
async function rasterURLPlot(r){
  let g=await gridProd(r,'plotar a superfície');
  /* `_url` pertence exclusivamente ao Mapa 2D: renderRaster() reprojeta sua
     grade para Web Mercator antes de criar esse bitmap. Reutilizar `_url` na
     prancha e posicioná-lo nos bounds UTM deformava/deslocava o DEM em relação
     ao limite vetorial. O Layout sempre gera aqui um bitmap próprio, direto
     na grade do CRS de trabalho, mesmo quando `g === r.d`. */
  const plotBounds=rasterBounds(r,g);
  g=reduceGrid(g, PLOT_MAX_CELLS, PLOT_MAX_SIDE);   // teto do canvas (média, sem alias)
  /* Limites e cores também fazem parte do bitmap. Sem essa assinatura, uma
     prancha em resolução plena podia reutilizar a imagem anterior enquanto
     a legenda já mostrava as faixas novas. Rótulos não entram: mudá-los altera
     apenas a legenda, sem exigir repintar milhões de células. */
  const styleKey=JSON.stringify({mode:r.style&&r.style.mode,
    solidColor:r.style&&r.style.solidColor,
    classes:((r.style&&r.style.classes)||[]).map(c=>({
      min:c&&c.min,max:c&&c.max,value:c&&c.value,color:c&&c.color,vis:c&&c.vis}))});
  const key=[styleKey,(+r._rev||0),g.nc+'x'+g.nr,g.xll,g.yll,g.cs,g.csy,
    plotBounds.join(',')].join('|');
  r._urlPlotBounds=plotBounds;
  if(r._urlHi && r._hiKey===key) return r._urlHi;
  showLoad(`Renderizando ${r.name} em ${g.nc}×${g.nr}…`);
  await new Promise(rs=>setTimeout(rs,0));
  const cv=rasterCanvas(r, g);
  hideLoad();
  /* Nunca cair para r._url: ela está em Web Mercator e não pode ser colocada
     no retângulo do CRS de trabalho. Sem canvas, é mais correto omitir a
     superfície e informar o erro do que desenhá-la fora do limite. */
  if(!cv) return null;
  r._hiKey=key; r._urlHi=cv.toDataURL('image/png');
  return r._urlHi;
}

/* Reprojeta a grade de exibição para Web Mercator, para que o retângulo do
   overlay coincida com a geometria real. Cacheado por grade+CRS. */
function gradeParaTela(g, resample){
  if(!g) return null;
  if(S.workCRS==='EPSG:3857') return g;
  const modo=(resample==='nearest'||resample==='native')?'nearest':'bilinear';
  if(g._wm && g._wmCRS===S.workCRS && g._wmResample===modo) return g._wm;
  try{
    const fwd=(x,y)=>reproj(S.workCRS,'EPSG:3857',x,y);
    const inv=(X,Y)=>reproj('EPSG:3857',S.workCRS,X,Y);
    const w=warpRaster(g, fwd, inv, modo);
    try{ Object.defineProperty(g,'_wm',{value:w,writable:true,enumerable:false,configurable:true});
         Object.defineProperty(g,'_wmCRS',{value:S.workCRS,writable:true,enumerable:false,configurable:true});
         Object.defineProperty(g,'_wmResample',{value:modo,writable:true,enumerable:false,configurable:true}); }
    catch(e){ g._wm=w; g._wmCRS=S.workCRS; g._wmResample=modo; }
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
function warpCanvasWM(cv, b, sourceCRS){
  const workCRS=sourceCRS||S.workCRS;
  if(!cv || workCRS==='EPSG:3857') return {cv, b, wm:false};
  try{
    const fwd=(x,y)=>reproj(workCRS,'EPSG:3857',x,y);
    const inv=(X,Y)=>reproj('EPSG:3857',workCRS,X,Y);
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

/* Decodifica a prévia incorporada ao projeto sem depender do GeoTIFF.
   O redimensionamento já acontece no primeiro canvas: evita manter duas
   imagens 4096 px + ImageData durante o warp, algo pesado em tablets. */
function orthoCanvasFromURL(url,maxSide){
  return new Promise((resolve,reject)=>{
    const im=new Image();
    im.onload=()=>{
      try{
        const w=im.naturalWidth||im.width, h=im.naturalHeight||im.height;
        if(!(w>0&&h>0))throw new Error('prévia sem dimensões');
        const lim=Number.isFinite(+maxSide)&&+maxSide>0?+maxSide:Math.max(w,h);
        const scale=Math.min(1,lim/Math.max(w,h));
        const dw=Math.max(1,Math.round(w*scale)), dh=Math.max(1,Math.round(h*scale));
        const cv=document.createElement('canvas');cv.width=dw;cv.height=dh;
        cv.getContext('2d').drawImage(im,0,0,dw,dh);resolve(cv);
      }catch(e){reject(e);}
    };
    im.onerror=()=>reject(new Error('não foi possível decodificar a prévia'));
    im.src=url;
  });
}

/* Projetos antigos guardavam a prévia ainda na grade UTM, mas o Leaflet a
   esticava entre apenas dois cantos em latitude/longitude. Isso desloca a
   imagem em relação aos vetores (até ~25 m no projeto que revelou o defeito).

   Durante esta sessão, a migração conserva o bitmap original em
   `_workPreviewURL`, para o Layout continuar no CRS de trabalho, e cria uma
   representação reprojetada para o Mapa 2D. Ao salvar, somente a versão WM é
   persistida; na próxima abertura o Layout usa a transformação inversa já
   existente, sem duplicar os megabytes da ortofoto no arquivo. É idempotente
   e não requer o GeoTIFF original. */
async function orthoMigrateLegacyPreview(I, sourceCRS){
  const workCRS=sourceCRS||S.workCRS;
  if(!I||I._warpWM||I._llbounds||!I.url||!Array.isArray(I.b)||I.b.length<4||workCRS==='EPSG:3857')
    return false;
  if(I._legacyWarpPromise)return I._legacyWarpPromise;
  const nativeURL=I._workPreviewURL||I.url;
  I._workPreviewURL=nativeURL;                // disponível ao Layout imediatamente
  const guarded=(S&&S.img===I);
  let pending;
  pending=(async()=>{
    try{
      const dm=(typeof navigator!=='undefined'&&Number.isFinite(+navigator.deviceMemory))?+navigator.deviceMemory:0;
      const mobile=(typeof EH_MOVEL!=='undefined'&&EH_MOVEL);
      const maxSide=mobile?(dm>4?2048:1536):3072;
      const cv=await orthoCanvasFromURL(nativeURL,maxSide);
      if(guarded&&S.img!==I)return false;      // outro projeto/imagem foi aberto no intervalo
      const wp=warpCanvasWM(cv,I.b,workCRS);
      if(!wp||!wp.wm||!wp.cv||!Array.isArray(wp.b))
        throw new Error('não foi possível reprojetar a prévia para Web Mercator');
      const sw=reproj('EPSG:3857','EPSG:4326',wp.b[0],wp.b[1]);
      const ne=reproj('EPSG:3857','EPSG:4326',wp.b[2],wp.b[3]);
      const ll=[[sw[1],sw[0]],[ne[1],ne[0]]];
      if(!ll.flat().every(Number.isFinite)||ll[1][0]<=ll[0][0]||ll[1][1]<=ll[0][1])
        throw new Error('limites reprojetados inválidos');
      const screenURL=wp.cv.toDataURL('image/png');
      if(guarded&&S.img!==I)return false;
      I.url=screenURL;I._llbounds=ll;I._warpWM=true;I._sourceCRS=workCRS;
      if(I.overlay){
        /* A camada pode estar invisível/removida do mapa; atualizar seu estado
           não pode transformar uma migração válida em erro só porque
           bringToBack exige a camada anexada ao Leaflet. */
        try{
          if(typeof I.overlay.setUrl==='function')I.overlay.setUrl(screenURL);
          if(typeof I.overlay.setBounds==='function')I.overlay.setBounds(ll);
          if(I.visible!==false&&typeof I.overlay.bringToBack==='function')I.overlay.bringToBack();
        }catch(e){console.warn('overlay da ortofoto migrada:',e&&e.message);}
      }
      try{orthoHDReset();}catch(e){}
      try{zApply();}catch(e){}
      try{if(typeof cmdLog==='function')cmdLog('ortofoto legada reprojetada automaticamente para o Mapa 2D','ok');}catch(e){}
      try{toast('✓ Ortofoto antiga corrigida no Mapa 2D — salve o projeto para gravar a correção');}catch(e){}
      return true;
    }catch(e){
      I._legacyWarpError=String(e&&e.message||e);
      console.warn('migração da ortofoto antiga:',I._legacyWarpError);
      try{toast('⚠ Não consegui corrigir automaticamente a ortofoto antiga; recarregue o GeoTIFF original');}catch(_){}
      return false;
    }finally{
      if(I._legacyWarpPromise===pending)I._legacyWarpPromise=null;
    }
  })();
  I._legacyWarpPromise=pending;
  return pending;
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
    if(modo==='classes'){
      const hit=rasterClassRangeFind(r.style&&r.style.classes,zm),
        col=String((hit&&hit.item&&hit.item.color)||'#777777');
      cr=(parseInt(col.slice(1,3),16)||0)/255;
      cg=(parseInt(col.slice(3,5),16)||0)/255;
      cb=(parseInt(col.slice(5,7),16)||0)/255;
    }
    else if(comHipso){ const hc=hypsoColor((zm-zmn)/dz); cr=hc[0];cg=hc[1];cb=hc[2]; }
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
    {opacity:(r.style&&r.style.opacity)??0.9, pane:panelDaCamada('R'+r.id)});
  if(r.visible!==false) r.overlay.addTo(map);
  zApply();
  return true;
}
function rasterPrecisaFonteTela(d){
  if(!d)return false;
  try{if(typeof precisaFonte==='function')return !!precisaFonte(d);}catch(e){}
  return !d.native&&(d.resampled>1||(d.fromProject&&d.resampled==null));
}
function rasterGradeCabeCanvas(g){
  return !!(g&&g.nc*g.nr<=DISP_MAX_CELLS&&g.nc<=16000&&g.nr<=16000);
}
function rasterGradeOriginalCanvas(r){
  const d=r&&r.d;if(!d)return null;
  if(d._full&&rasterGradeCabeCanvas(d._full))return d._full;
  if(!d._full&&!rasterPrecisaFonteTela(d)&&rasterGradeCabeCanvas(d))return d;
  return null;
}
function rasterDimensoesOriginais(d){
  if(!d)return [0,0];
  return [d._W0||(d._full&&d._full.nc)||d.nc,d._H0||(d._full&&d._full.nr)||d.nr];
}
function renderRaster(r,options={}){
  if(r&&!r.tinPuro){r.demHD=true;r.dispFull=true;}
  if(r?.style?.mode==='relevo_local'&&window.GeoMineLocalRelief){r.demHD=true;if(r.overlay)r.overlay.setOpacity(0);demTilesRefresh(r);syncDemTiles(r);zApply();return;}
  if(r)delete r._projectDrawDeferred;
  /* Uma superfície recalculada com as mesmas dimensões também precisa
     invalidar a malha 3D. */
  if(r){r._rev=(+r._rev||0)+1;
    if(S._view==='v3d'&&typeof v3Auto==='function')setTimeout(()=>v3Auto(),0);}
  /* Superfície TIN nunca é desenhada como raster */
  if(r&&r.tinPuro&&r.d&&r.d.tin){ if(renderTinMalha2D(r))return; }
  /* Religar o original não muda nenhum pixel da prévia já exibida. Não
     refazer warp, ImageData, canvas e PNG de milhões de células enquanto o
     seletor do iPad termina e os primeiros tiles nativos começam a ler.
     A grade e o overlay existentes permanecem; só a fonte dos tiles muda.
     Sem overlay, a própria GridLayer desenha a prévia por tile se a leitura
     nativa falhar, sem precisar criar um segundo bitmap da área inteira. */
  if(options.sourceOnly===true&&r&&!r.tinPuro&&
     (r.overlay||r.visible===false||demTilesAtivo(r))){
    demTilesRefresh(r);syncDemTiles(r);zApply();return;
  }
  /* "Original" nunca passa por media de bloco. Se a grade inteira nao cabe
     com seguranca num unico canvas, o preview permanece somente como fundo e
     os tiles HD releem o GeoTIFF por janela. Assim nao se promete resolucao
     nativa entregando uma imagem reduzida e suavizada. */
  /* A escolha explícita por tiles também vale para arquivos pequenos. O
     overlay fica apenas como prévia, ocultada quando a janela HD termina;
     não se desenha um segundo canvas nativo por cima dos mesmos pixels. */
  const usaTiles=demTilesAtivo(r);
  let gsrc=r.dispFull&&!usaTiles?rasterGradeOriginalCanvas(r):null,
    nativoNoOverlay=!!gsrc;
  /* Se a grade original inteira cabe no canvas, ela ja e a fonte de maior
     detalhe. Manter tambem a GridLayer ativa desenharia o mesmo MDT duas
     vezes e poderia alterar opacidade/cor sem acrescentar resolucao. */
  if(nativoNoOverlay&&r.demHD)r.demHD=false;
  if(r.dispFull&&!gsrc&&r.d._img0)r.demHD=true;
  const baseGrid=gsrc||r.d;
  const gw=gradeParaTela(baseGrid,r.dispFull?'nearest':'bilinear'); // grade ja em Web Mercator
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
    {opacity:r.style.opacity, pane:panelDaCamada('R'+r.id),
     className:nativoNoOverlay?'geomine-raster-native-pixels':''});
  if(r.visible) r.overlay.addTo(map);
  /* Com tiles ligados, o preview não pode voltar por cima: os tiles assumem e
     são redesenhados com o estilo novo. */
  try{ if(demTilesAtivo(r)){ demTilesRefresh(r); syncDemTiles(r); }
       else syncDemTiles(r); }catch(e){}
  zApply();
}

/* readRasters entrega os canais armazenados no TIFF. JPEG/YCbCr também tem
   três bandas, mas elas são Y, Cb, Cr: branco [255,128,128] virava rosa e não
   passava no recorte de borda branca. Convertemos somente o pixel de exibição,
   sem alterar bandas, cache, resolução ou TIFF. Cada overview usa sua própria
   tag PhotometricInterpretation; o pequeno buffer é reutilizado no laço. */
function orthoColorReader(image){
  const fd=image&&(image.fileDirectory||image.getFileDirectory?.())||{};
  if(Number(fd.PhotometricInterpretation)===6){
    const rgb=new Uint8ClampedArray(3);
    return (y,cb,cr,scale=1)=>{
      y*=scale;cb=cb*scale-128;cr=cr*scale-128;
      // Mesma conversão de GeoTIFF.readRGB para YCbCr de 8 bits.
      rgb[0]=y+1.402*cr;rgb[1]=y-.34414*cb-.71414*cr;rgb[2]=y+1.772*cb;
      return rgb;
    };
  }
  const rgb=new Float64Array(3);
  return (r,g,b,scale=1)=>{rgb[0]=r*scale;rgb[1]=g*scale;rgb[2]=b*scale;return rgb;};
}

/* ---------- GeoTIFF RGB (ortofoto): georreferência automática ----------
   Lê 3 bandas subamostradas para um canvas (máx ~2048 px no maior lado),
   registra a imagem em S.img com os bounds do próprio TIFF (CRS de trabalho)
   e cria o overlay no mapa 2D. A aba 3D passa a colar essa textura no terreno
   automaticamente — sem digitar cantos. Suporta pirâmides (COG) e leitura
   por blocos, como o parseTIFF de banda única.                              */
async function addRGBFromTIFF(f, fname, fsize,control){
  await window.GeoMineImportRecovery?.before(control);
  const originalFile=f;if(!control?.tiff)f=await window.GeoMineOriginalSources?.stageFile?.(f,{...control,sourceKind:'ortho'})||f;
  await rasterImportWait(ensureGeoTIFF(),control);
  fname=fname||f.name||'ortofoto'; fsize=fsize??(f.size||0);
  const tiff=await rasterImportOpen(f,control);
  const img0=await rasterImportWait(tiff.getImage(0),control);
  const bb=img0.getBoundingBox();
  if(!bb || bb.some(v=>!isFinite(v))) throw new Error('GeoTIFF sem georreferência');
  // Preview para a TELA. O arquivo original NÃO é descartado: fica indexado em
  // S.img._tiff e é relido em resolução plena na hora de plotar (ver orthoWindow).
  // Em aparelho móvel o teto de memória da aba é bem menor: preview menor evita
  // que o Chrome do Android mate a aba (sintoma: o app "recarrega sozinho").
  const movel=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||/Mac/i.test(navigator.platform||'')&&navigator.maxTouchPoints>1;
  const mem=navigator.deviceMemory||0;                 // GB (Chrome/Android informa)
  // A prévia serve para abrir o mapa; os tiles visíveis usam o TIFF original.
  const MAXPX = window.GeoMineOrthoFirstFrame?.previewLimit?.()||((!movel || mem>=6) ? 4096 : 2560);
  const W0=img0.getWidth(), H0=img0.getHeight();
  const fct=Math.max(1, Math.ceil(Math.max(W0,H0)/MAXPX));
  let w=Math.max(2,Math.floor(W0/fct)), h=Math.max(2,Math.floor(H0/fct));
  // melhor pirâmide disponível
  const runtime=globalThis.GeoMineTileRuntime;
  let img=img0;
  try{
    if(runtime&&typeof runtime.overview==='function'){
      const selected=await rasterImportWait(runtime.overview(tiff,img0,W0,H0,Math.min(W0/w,H0/h)),control),im=selected.im;
      if(im.getWidth()>=w&&im.getHeight()>=h&&im.getSamplesPerPixel()>=3)img=im;
    }else{
      const n=await rasterImportWait(tiff.getImageCount(),control);
      for(let i=1;i<n;i++){ const im=await rasterImportWait(tiff.getImage(i),control);
        if(im.getWidth()>=w && im.getHeight()>=h && im.getWidth()<img.getWidth()) img=im; }
    }
  }catch(e){if(e&&['AbortError','TimeoutError','NotReadableError'].includes(e.name))throw e;}
  const W=img.getWidth(), H=img.getHeight();
  if(runtime?.previewSize){const size=runtime.previewSize(img,w,h);w=size.width;h=size.height;}
  const spp=img.getSamplesPerPixel();
  if(spp<3) throw new Error('TIFF com '+spp+' banda(s) — para ortofoto RGB são necessárias 3+');
  const hasA=spp>=4;                                   // banda alfa (RGBA) — comum em ortomosaicos
  let nd=null; try{ nd=img.getGDALNoData(); }catch(e){} // valor nodata declarado no TIFF
  const color=orthoColorReader(img);
  const firstFrame=window.GeoMineOrthoFirstFrame?.create(w,h,bb.slice(),S.workCRS,nd,control?.signal,img);
  try{
  showLoad(`Lendo ortofoto ${W0}×${H0}…`);
  const cvs=document.createElement('canvas'); cvs.width=w; cvs.height=h;
  const ctx=cvs.getContext('2d');
  const id=ctx.createImageData(w,h);
  const smp=hasA?[0,1,2,3]:[0,1,2],previewOptions={samples:smp,window:[0,0,W,H],
    width:w,height:h,resampleMethod:'nearest'};
  /* O leitor direto de blocos produz só os pixels da prévia. Formatos sem
     esse suporte continuam nas faixas limitadas: readRasters convencional
     alocaria a janela nativa inteira antes de reduzi-la. nearestFloor mantém
     exatamente a seleção de pixels usada pela prévia anterior. */
  const fast=!!(runtime&&typeof runtime.read==='function'&&
    typeof runtime.canReadResampled==='function'&&runtime.canReadResampled(img,previewOptions));
  const readW=fast?w:W,readH=fast?h:H;
  const rows=fast?h:rasterImportRows(img,W,hasA?4:3);
  const srcRow=r=>fast?r:Math.min(H-1,Math.floor(r*H/h));
  const srcCol=c=>fast?c:Math.min(W-1,Math.floor(c*W/w));
  const colIdx=new Int32Array(w); for(let c=0;c<w;c++) colIdx[c]=srcCol(c);
  let r=0;
  while(r<h){
    rasterImportCheck(control);
    const y0=srcRow(r), y1=Math.min(readH,y0+rows);
    let rEnd=r; while(rEnd<h && srcRow(rEnd)<y1) rEnd++;
    showLoad(`Lendo ortofoto — ${(100*r/h).toFixed(0)}%`);
    await new Promise(rs=>setTimeout(rs,0));
    rasterImportCheck(control);
    const readOptions=fast?previewOptions:{samples:smp,window:[0,y0,W,y1]};
    let completedBlocks=0,lastPercent=-1;
    const readControl={isCurrent:()=>!(control&&control.signal&&control.signal.aborted),...(fast?{nearestFloor:true,onPreviewBlock:b=>firstFrame?.block(b)}:{}),
      onProgress:({loaded,total})=>{
        if(control&&control.signal&&control.signal.aborted)return;
        completedBlocks=loaded;
        const percent=Math.min(99,Math.floor(100*loaded/Math.max(1,total)));
        if(percent!==lastPercent){lastPercent=percent;showLoad(`Lendo ortofoto — ${percent}%`);}
      }};
    const ras=await rasterImportWait(runtime&&typeof runtime.read==='function'
      ?runtime.read(img,readOptions,readControl)
      :img.readRasters({...readOptions,signal:control&&control.signal}),
      fast?{...control,progress:()=>completedBlocks}:control);
    const R=ras[0],G=ras[1],B=ras[2],A=hasA?ras[3]:null; const bw=y1-y0;
    // normalização p/ 8 bits se vier em 16 bits
    const is16=(R instanceof Uint16Array)||(R instanceof Int16Array);
    const sc=is16?1/257:1;
    for(let rr=r; rr<rEnd; rr++){
      const sy=srcRow(rr)-y0; if(sy<0||sy>=bw) continue;
      const off=sy*readW, dst=rr*w*4;
      for(let c=0;c<w;c++){
        const k=off+colIdx[c], o=dst+4*c;
        const rv=R[k], gv=G[k], bv=B[k];
        // alfa 0 = sem dado; nodata do TIFF nas três bandas = sem dado
        let a=255;
        if(A && A[k]===0) a=0;
        else if(nd!=null && rv==nd && gv==nd && bv==nd) a=0;
        const rgb=color(rv,gv,bv,sc);
        id.data[o]=rgb[0]; id.data[o+1]=rgb[1]; id.data[o+2]=rgb[2]; id.data[o+3]=a;
      }
    }
    if(!fast)firstFrame?.rows(id.data,r,rEnd);
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
  let nOv=0;
  try{nOv=(await rasterImportWait(tiff.getImageCount(),control))-1;}catch(e){if(e&&['AbortError','TimeoutError','NotReadableError'].includes(e.name))throw e;}
  rasterImportCheck(control);
  if(globalThis.GeoMineRasterImport)GeoMineRasterImport.release(tiff);
  if(S.img)registraOrtoParaDrape(S.img);
  if(S.img&&S.img.overlay) map.removeLayer(S.img.overlay);
  S.img={url:null, overlay:null, b, name:fname.replace(/\.[^.]+$/,''), visible:true,
         src:{file:fname, size:fsize, at:new Date().toISOString()},
         _sourceCRS:S.workCRS,
         _id:id, _w:w, _h:h, _nd:(nd!=null),
         // --- índice do original, para releitura em resolução plena ---
         _tiff:tiff, _img0:img0, _W0:W0, _H0:H0, _hasA:hasA, _ndVal:nd, _cache:new Map(),
         // estrutura interna: define o desempenho dos tiles dinâmicos
         _cog:(()=>{ let tiled=false, tw=0, th=0;
           try{ tw=img0.getTileWidth(); th=img0.getTileHeight();
                tiled = th < H0;                    // strips têm "tile" da altura toda/da faixa
                if(img0.fileDirectory && img0.fileDirectory.TileWidth) tiled=true; }catch(e){}
         return {nOv, tiled, tw, th}; })()};
  /* Mantém apenas uma referência em memória aos bytes nativos. Não entra no
     projeto salvo e permite que a exportação em lote entregue o GeoTIFF sem
     passar pela prévia reamostrada. */
  try{Object.defineProperty(S.img,'_sourceRaw',{value:f,writable:true,configurable:true});}catch(e){S.img._sourceRaw=f;}
  const cut=applyImgNoData();          // gera url (PNG c/ alfa), overlay e recorte do sem-dado
  S.img._ndPct=cut.pct;
  /* O arquivo original acabou de ser autorizado: a ortofoto já entra no modo
     tile, inclusive no tablet. Uma falha conserva a intenção nativa; a
     prévia fica apenas como apoio enquanto o original está indisponível. */
  S.orthoHD=true;S.orthoDispFull=true;
  try{ syncOrthoTiles(); }
  catch(e){ S.img._nativeTileError=String(e&&e.message||e);
    if(typeof cmdLog==='function')cmdLog('ortofoto carregada; resolução nativa selecionada, tiles temporariamente indisponíveis: '+S.img._nativeTileError,'warn'); }
  safeFit(S.img.overlay.getBounds());
  refreshUI();
  if(!control)hideLoad(); // The batch importer still has to bind the source.
  const gsd=((b[2]-b[0])/W0*100).toFixed(1);
  toast(`TIFF: ${W0}×${H0} px (${gsd} cm/px) · resolução nativa por tiles · ${cut.pct.toFixed(1)}% de células sem dado descartadas`);
  window.GeoMineOrthoFirstFrame?.stabilize(tiff,f,S.img);
  if(f!==originalFile)await window.GeoMineOriginalSources?.rememberFile(S.img,'ortho',originalFile);
  }finally{firstFrame?.dispose();}
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
async function ortoReligarTIFF(file,options){
  const I=S.img;
  if(!I || !I.b){ toast('Não há ortofoto carregada para religar'); return false; }
  options=options||{};
  const handoff=options.handoffRequest;
  if(handoff!==undefined&&(!options.restoreNative||!Number.isInteger(handoff)||handoff<0||handoff!==(I._nativeRelinkRequest||0)))return false;
  const previousPreview=typeof projectNativePreview==='function'?projectNativePreview(I,'ortho'):null;
  const request=I._nativeRelinkRequest=handoff!==undefined?handoff:(I._nativeRelinkRequest||0)+1,
    project=S.projectId,generation=window.GeoMineSessionAutosave?.state?.generation;
  const current=()=>S.img===I&&S.projectId===project&&
    window.GeoMineSessionAutosave?.state?.generation===generation&&I._nativeRelinkRequest===request&&
    (!options.isCurrent||options.isCurrent());
  showLoad('Lendo o GeoTIFF da ortofoto…');
  try{
    if(!options.restoreNative)await window.GeoMineImportRecovery?.before(options);
    file=await window.GeoMineOriginalSources?.stageFile?.(file,{...options,sourceKind:'ortho',isCurrent:current})||file;
    await ensureGeoTIFF();
    if(!current())return false;
    // A prévia salva já está visível. Religamos por intervalos sem aguardar
    // uma segunda cópia integral do TIFF no provedor Android.
    const src=await bufferFonte(file,{preferDirect:true});
    const tiff=await rasterImportOpen(src);
    if(!current())return false;
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
    const cog=await (async()=>{ let nOv=0, tiled=false, tw=0, th=0;
      try{ nOv=(await tiff.getImageCount())-1; }catch(e){}
      try{ tw=img0.getTileWidth(); th=img0.getTileHeight(); tiled=th<H0;
           if(img0.fileDirectory && img0.fileDirectory.TileWidth) tiled=true; }catch(e){}
      return {nOv,tiled,tw,th};
    })();
    if(options.restoreNative&&I.url){
      if(!current())return false;
      // A prévia salva é recortada antes de substituir a fonte nativa.
      // Até o último await, inclusive o guard do chamador continua válido.
      if(!I._id&&orthoMaskOptions().enabled)await applyOrthoMask(I,{isCurrent:current});
      if(!current())return false;
      Object.assign(I,{_tiff:tiff,_img0:img0,_W0:W0,_H0:H0,_hasA:spp>=4,_ndVal:nd,_cog:cog,_cache:new Map()});
      Object.defineProperty(I,'_sourceRaw',{value:file,writable:true,configurable:true});
      window.GeoMineOriginalSources?.validated(I,'ortho',previousPreview);
      if(globalThis.GeoMineRasterImport)GeoMineRasterImport.release(tiff);
      S.orthoHD=true;S.orthoDispFull=true;orthoHDReset();syncOrthoTiles();orthoMaskRefreshUI(I);return true;
    }
    /* RECONSTRÓI O PIXEL ORIGINAL DA PRÉVIA (_id).
       Sem ele, "Aplicar" (recorte do sem-dado), a opacidade e o reposicionamento
       ficam desabilitados — era o que acontecia depois de reabrir um projeto:
       o arquivo voltava, mas o painel seguia inerte. Aqui a prévia é relida do
       próprio TIFF, no mesmo teto de pixels do carregamento normal. */
    showLoad('Reconstruindo a prévia da ortofoto…');
    const MAXPX=window.GeoMineOrthoFirstFrame?.previewLimit?.()||
      ((!EH_MOVEL || (navigator.deviceMemory||0)>=6) ? 4096 : 2560);
    const fct=Math.max(1, Math.ceil(Math.max(W0,H0)/MAXPX));
    let w=Math.max(2,Math.floor(W0/fct)), hh=Math.max(2,Math.floor(H0/fct));
    const runtime=globalThis.GeoMineTileRuntime;
    let im=img0;
    try{
      if(runtime&&typeof runtime.overview==='function'){
        const selected=await runtime.overview(tiff,img0,W0,H0,Math.min(W0/w,H0/hh)),cand=selected.im;
        if(cand.getWidth()>=w&&cand.getHeight()>=hh&&cand.getSamplesPerPixel()>=3)im=cand;
      }else{
        const n=await tiff.getImageCount();
        for(let i=1;i<n;i++){ const cand=await tiff.getImage(i);
          if(cand.getWidth()>=w && cand.getHeight()>=hh && cand.getWidth()<im.getWidth()) im=cand; }
      }
    }catch(e){if(e&&['AbortError','TimeoutError','NotReadableError'].includes(e.name))throw e;}
    if(!current())return false;
    const hasA=spp>=4;
    if(runtime?.previewSize){const size=runtime.previewSize(im,w,hh);w=size.width;hh=size.height;}
    const readOptions={samples:hasA?[0,1,2,3]:[0,1,2],window:[0,0,im.getWidth(),im.getHeight()],
      width:w,height:hh,resampleMethod:'nearest'};
    const ras=runtime&&typeof runtime.read==='function'
      ?await runtime.read(im,readOptions,{isCurrent:current,onProgress:({loaded,total})=>{
        if(current()&&total>0)showLoad('Reconstruindo a prévia da ortofoto — '+Math.round(100*loaded/total)+'%');
      }})
      :await im.readRasters(readOptions);
    // Uma leitura antiga não pode substituir uma fonte escolhida depois nem
    // atingir o projeto que foi aberto enquanto o TIFF estava sendo lido.
    if(!current())return false;
    const R=ras[0],G=ras[1],B=ras[2],A=hasA?ras[3]:null;
    const is16=(R instanceof Uint16Array)||(R instanceof Int16Array), sc=is16?1/257:1;
    const cvp=document.createElement('canvas'); cvp.width=w; cvp.height=hh;
    const idp=cvp.getContext('2d').createImageData(w,hh), DP=idp.data,color=orthoColorReader(im);
    for(let k=0;k<w*hh;k++){
      const o=k*4, v=R[k];
      const semDado=(nd!=null && R[k]===nd && G[k]===nd && B[k]===nd) ||
        (A && (is16? A[k]/257 : A[k])<8);
      if(semDado){ DP[o+3]=0; continue; }
      const rgb=color(R[k],G[k],B[k],sc);
      DP[o]=rgb[0]; DP[o+1]=rgb[1]; DP[o+2]=rgb[2]; DP[o+3]=255;
    }
    /* Só troca o estado depois que a leitura terminou. Se canvas/warp falhar
       (principalmente por memória no tablet), volta integralmente à ortofoto
       anterior e NÃO informa um sucesso falso. */
    const antes=Object.getOwnPropertyDescriptors(I), overlayAntes=I.overlay;
    try{
      delete I._visualMask;I._visualMaskRequest=(I._visualMaskRequest||0)+1;
      Object.assign(I,{
        _tiff:tiff, _img0:img0, _W0:W0, _H0:H0, _hasA:hasA, _ndVal:nd,
        /* Religar não muda o CRS em que os cantos já eram lidos: se o usuário
           tinha fixado um CRS de origem nas propriedades, ele continua valendo. */
        _sourceCRS:I._crsFixo||I._sourceCRS||S.workCRS,
        /* É uma nova fonte, ainda que tenha o mesmo nome e a mesma extensão.
           Nunca reutilizar janelas do TIFF anterior. */
        _cache:new Map(), _prevID:undefined,
        src:{file:file.name||'ortofoto.tif', size:file.size||0, at:new Date().toISOString()},
        _cog:cog, _id:idp, _w:w, _h:hh, _nd:(nd!=null)
      });
      try{Object.defineProperty(I,'_sourceRaw',{value:file,writable:true,configurable:true});}catch(e){I._sourceRaw=file;}
      /* Regenera o desenho a partir do pixel novo, preservando nome, cantos,
         opacidade e as opções de sem-dado que já estavam na tela. */
      const cut=applyImgNoData();
      if(!I.overlay||!I.url) throw new Error('não foi possível reconstruir a imagem da ortofoto');
      if(cut&&isFinite(cut.pct)) I._ndPct=cut.pct;
      if(!options.restoreNative){
        if(typeof projectNativeInvalidate==='function')projectNativeInvalidate(I);
        else{delete I.projectFile;delete I.projectSavedAt;delete I.projectNativeSource;I.projectSavePending=true;}
      }
    }catch(e){
      const overlayFalho=I.overlay;
      try{ if(overlayFalho&&overlayFalho!==overlayAntes&&map) map.removeLayer(overlayFalho); }catch(_){}
      for(const k of Object.getOwnPropertyNames(I)) if(!antes[k]){ try{delete I[k];}catch(_){} }
      try{Object.defineProperties(I,antes);}catch(_){}
      try{ if(overlayAntes&&I.visible!==false&&map&&!map.hasLayer(overlayAntes)) overlayAntes.addTo(map); }catch(_){}
      try{ if(S.orthoHD) syncOrthoTiles(); }catch(_){}
      throw e;
    }
    if(!options.restoreNative){S.orthoHD=true;S.orthoDispFull=true;}
    const cb=document.getElementById('imModHD'); if(cb){ cb.disabled=false; cb.checked=!!S.orthoHD; }
    const cb2=document.getElementById('imgHD'); if(cb2){ cb2.disabled=false; cb2.checked=!!S.orthoHD; }
    ['imModND','imModW','imModB','imModApply'].forEach(id=>{
      const e=document.getElementById(id); if(e) e.disabled=false; });
    try{ imgResInfoSync(); }catch(e){}
    try{ syncImgPanel(); }catch(e){}
    let hdAtivo=true;
    try{ orthoHDReset(); syncOrthoTiles(); }
    catch(e){
      /* A prévia nova já está válida. Se somente a grade HD falhar, mantém a
         atualização visível e degrada para a prévia em vez de deixar estado
         meio aplicado ou dizer que a troca inteira falhou. */
      hdAtivo=false;I._nativeTileError=String(e&&e.message||e);
      // Fonte vinculada e intenção nativa permanecem disponíveis para repetir.
      if(cb) cb.checked=true; if(cb2) cb2.checked=true;
      if(typeof cmdLog==='function') cmdLog('ortofoto atualizada; tiles HD indisponíveis: '+(e&&e.message||e),'warn');
    }
    try{if(typeof layoutInvalidateOrtho==='function')layoutInvalidateOrtho('ortofoto original atualizada');}catch(e){}
    const gsd=((I.b[2]-I.b[0])/W0*100).toFixed(1);
    toast(`Ortofoto religada: ${W0}×${H0} px (${gsd} cm/px) · `+
      (hdAtivo?'alta resolução ligada':'prévia atualizada; HD indisponível')+' · recorte e opacidade liberados');
    if(typeof cmdLog==='function') cmdLog(`ortofoto religada ao arquivo ${file.name||''} — ${W0}×${H0}`,'ok');
    if(globalThis.GeoMineRasterImport)GeoMineRasterImport.release(tiff);
    // A cópia opcional para os tiles começa só após reconstruir a prévia.
    // O TIFF nativo e a leitura do Layout conservam a resolução integral.
    window.GeoMineOrthoFirstFrame?.stabilize(tiff,file,I);
    window.GeoMineOriginalSources?.validated(I,'ortho',previousPreview);
    // Guarda a cópia verificada primeiro e então assume essa fonte estável
    // no mesmo pedido, sem manter dependência do File temporário do provedor.
    if(!options.restoreNative&&current())await window.GeoMineOriginalSources?.rememberFile(I,'ortho',file,{deferLocalHandoff:true});
    if(!current())return false;
    if(!options.restoreNative)await window.GeoMineRasterSourceUI?.preferLocal(I,current);
    if(!current())return false;
    orthoMaskRefreshUI(I);return true;
  }catch(e){
    if(current())toast('Não foi possível religar: '+(e&&e.message||e));
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
async function orthoWindow(bb, pxW, options){
  options=options||{};
  const I=options.source||S.img;
  if(!I || !I._img0 || !I.b) return null;
  const sourceImage=I._img0,sourceURL=I.url,sourceBounds=I.b.join(','),
    method=options.resampleMethod||(S.orthoDispFull?'nearest':'bilinear');
  const current=()=>S.img===I&&I._img0===sourceImage&&I.url===sourceURL&&I.b.join(',')===sourceBounds&&
    (!options.isCurrent||options.isCurrent());
  const check=()=>{if(!current()){const e=new Error('A fonte da ortofoto mudou durante a leitura');e.name='AbortError';throw e;}};
  const gcb=(id,d)=>{const e=document.getElementById(id); return e?e.checked:d;};
  const gvn=(id,d)=>{const e=document.getElementById(id); const v=e?+e.value:NaN; return isFinite(v)?v:d;};
  const on=gcb('imgND',true),wTh=gvn('imgNDw',250),bTh=gvn('imgNDb',4),nd=I._ndVal;
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
  const maxPixels=typeof EH_MOVEL!=='undefined'&&EH_MOVEL?4e6:16e6;
  let outW=Math.max(1,Math.min(nativeW,Math.round(pxW)||nativeW)),outH=Math.max(1,Math.round(outW*nativeH/nativeW));
  if(outW*outH>maxPixels){const factor=Math.sqrt(maxPixels/(outW*outH));outW=Math.max(1,Math.floor(outW*factor));outH=Math.max(1,Math.floor(outH*factor));}
  /* Cache pertence aos pixels da fonte, não só ao nome/extent do arquivo. */
  if(I._windowCacheImage!==sourceImage){I._cache=new Map();I._windowCacheImage=sourceImage;}
  if(!I._cache)I._cache=new Map();
  const key=[sourceBounds,px0,py0,px1,py1,outW,outH,method,on,wTh,bTh,nd].join(':');
  if(I._cache.has(key)) return I._cache.get(key);
  const smp=I._hasA?[0,1,2,3]:[0,1,2];
  const runtime=globalThis.GeoMineTileRuntime;
  let image=sourceImage,fx=1,fy=1;
  if(runtime&&I._tiff){
    const level=await runtime.overview(I._tiff,sourceImage,I._W0,I._H0,Math.min(nativeW/outW,nativeH/outH));
    image=level.im;fx=level.fx;fy=level.fy;
  }
  check();
  const cv=document.createElement('canvas'); cv.width=outW; cv.height=outH;
  const ctx=cv.getContext('2d'),color=orthoColorReader(image);
  /* readRasters aloca a JANELA ANTES de reduzir: pedir 2000px de um TIFF
     de 46000px inteiro ainda alocava gigabytes. Lemos faixas/colunas pequenas
     e amostramos na mesma grade global, sem costuras nem deslocar os bounds. */
  const stepX=nativeW/outW/fx,stepY=nativeH/outH/fy,
    beginX=px0/fx,beginY=py0/fy,
    blockW=Math.max(1,Math.min(256,Math.floor(1024/Math.max(1,stepX)))),
    blockH=Math.max(1,Math.min(128,Math.floor(128/Math.max(1,stepY))));
  for(let oy=0;oy<outH;oy+=blockH)for(let ox=0;ox<outW;ox+=blockW){
    check();
    const width=Math.min(blockW,outW-ox),height=Math.min(blockH,outH-oy),
      /* O pixel de saída representa seu CENTRO dentro do recorte. No modo
         suave o índice do centro do pixel fonte é deslocado em meio pixel. */
      sx0=beginX+(ox+.5)*stepX-(method==='nearest'?0:.5),sy0=beginY+(oy+.5)*stepY-(method==='nearest'?0:.5),
      sx1=beginX+(ox+width-.5)*stepX-(method==='nearest'?0:.5),sy1=beginY+(oy+height-.5)*stepY-(method==='nearest'?0:.5),
      left=Math.max(0,Math.floor(sx0)),top=Math.max(0,Math.floor(sy0)),
      right=Math.min(image.getWidth(),Math.floor(sx1)+(method==='nearest'?1:2)),
      bottom=Math.min(image.getHeight(),Math.floor(sy1)+(method==='nearest'?1:2));
    const readOptions={samples:smp,window:[left,top,right,bottom]};
    let bands;
    if(runtime)bands=await runtime.read(image,readOptions,{isCurrent:current,priority:0});
    else{await new Promise(resolve=>setTimeout(resolve,0));check();bands=await image.readRasters(readOptions);}
    check();
    const rw=right-left,rh=bottom-top,R=bands[0],G=bands[1],B=bands[2],A=I._hasA?bands[3]:null,
      sc=(R instanceof Uint16Array)||(R instanceof Int16Array)?1/257:1,
      pixels=ctx.createImageData(width,height),D=pixels.data;
    const value=(band,x,y)=>{
      x=Math.min(rw-1,Math.max(0,x));y=Math.min(rh-1,Math.max(0,y));
      const ix=Math.min(rw-1,Math.max(0,Math.floor(x))),iy=Math.min(rh-1,Math.max(0,Math.floor(y)));
      if(method==='nearest')return band[iy*rw+ix];
      const jx=Math.min(rw-1,ix+1),jy=Math.min(rh-1,iy+1),u=x-ix,v=y-iy;
      return (band[iy*rw+ix]*(1-u)+band[iy*rw+jx]*u)*(1-v)+(band[jy*rw+ix]*(1-u)+band[jy*rw+jx]*u)*v;
    };
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const X=sx0+x*stepX-left,Y=sy0+y*stepY-top,rr=value(R,X,Y),gg=value(G,X,Y),bbv=value(B,X,Y),
        rgb=color(rr,gg,bbv,sc),rv=rgb[0],gv=rgb[1],bv=rgb[2],o=(y*width+x)*4;
      let a=255;
      if(A&&value(A,X,Y)===0)a=0;
      else if(nd!=null&&rr===nd&&gg===nd&&bbv===nd)a=0;
      else if(on&&((rv>=wTh&&gv>=wTh&&bv>=wTh)||(rv<=bTh&&gv<=bTh&&bv<=bTh)))a=0;
      D[o]=rv;D[o+1]=gv;D[o+2]=bv;D[o+3]=a;
    }
    ctx.putImageData(pixels,ox,oy);
  }
  check();
  // bounds REAIS do recorte (alinhados à grade de pixels do TIFF)
  const out={
    dataURL:cv.toDataURL('image/png'),
    bb:[W0+px0*gsdX, N0-py1*gsdY, W0+px1*gsdX, N0-py0*gsdY],
    px:outW, py:outH, nativo:nativeW, sourceImage, resampleMethod:method
  };
  /* PNGs grandes não podem multiplicar o pico de memória em cada zoom. */
  I._cache.clear();
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
/* Cache de tiles PRONTOS separado dos blocos TIFF: voltar ao mesmo zoom não
   refaz nem a leitura nem a reprojeção. É local à grade/estilo, limitado em
   bytes e descartado ao substituir a fonte ou editar a simbologia. */
function rasterTileJob(gl,cv,coords,vigente){
  const epoch=gl._tileEpoch||0;
  let lastYield=Date.now();
  const isCurrent=()=>!cv._tileCancelled&&(gl._tileEpoch||0)===epoch&&vigente()&&
    (!map.getZoom||Math.round(map.getZoom())===coords.z);
  const checkpoint=async()=>{
    const check=()=>{if(!isCurrent()){const error=new Error('Tile substituído pela nova vista');error.name='AbortError';throw error;}};
    check();
    if(Date.now()-lastYield<12)return;
    await new Promise(resolve=>setTimeout(resolve,0));lastYield=Date.now();check();
  };
  return {isCurrent,checkpoint,priority:()=>{
    try{const c=map.project(map.getCenter(),coords.z);return Math.hypot(coords.x+.5-c.x/256,coords.y+.5-c.y/256);}catch(_){return 0;}
  }};
}
function rasterTileCacheGet(gl,cv,coords){
  const cache=gl._readyTileCache,key=[coords.z,coords.x,coords.y,cv.width].join('/');
  const saved=cache&&cache.get(key);
  if(!saved)return false;
  cache.delete(key);cache.set(key,saved);
  cv.getContext('2d').drawImage(saved.canvas,0,0);
  return true;
}
function rasterTileCachePut(gl,cv,coords){
  const cache=gl._readyTileCache||(gl._readyTileCache=new Map());
  const key=[coords.z,coords.x,coords.y,cv.width].join('/'),bytes=cv.width*cv.height*4;
  const old=cache.get(key);if(old){gl._readyTileBytes-=old.bytes;cache.delete(key);}
  cache.set(key,{canvas:cv,bytes});gl._readyTileBytes=(gl._readyTileBytes||0)+bytes;
  const limit=(EH_MOVEL?4:16)*1024*1024;
  while(gl._readyTileBytes>limit&&cache.size){const first=cache.keys().next().value;
    gl._readyTileBytes-=cache.get(first).bytes;cache.delete(first);}
}
function rasterTileBindLifecycle(gl){
  gl.on('tileunload',e=>{if(e.tile)e.tile._tileCancelled=true;});
  gl.on('remove',()=>{gl._tileEpoch=(gl._tileEpoch||0)+1;
    if(gl._readyTileCache)gl._readyTileCache.clear();gl._readyTileBytes=0;});
}
function rasterTileFinish(gl,cv,coords,done){
  /* Leaflet identifica o callback só por x/y/z. Um tile antigo que termina
     após redraw não pode marcar o NOVO canvas da mesma posição como pronto. */
  const record=gl._tiles&&gl._tiles[gl._tileCoordsToKey(coords)];
  if(record&&record.el===cv)done(null,cv);
}
function clearDemTiles(){
  const antigos=Array.from(_demGrids.values());
  _demGrids.clear();
  for(const gl of antigos){
    gl._demRetired=true;
    try{if(map&&map.hasLayer(gl))map.removeLayer(gl);}catch(e){}
  }
}
function demTilesAtivo(r){ return !!(r && !r._nativeCopyPending && !r._nativeSourceHolds?.size && r.demHD && r.d && (r.d._img0||r.d._full||!rasterPrecisaFonteTela(r.d)||r.style?.mode==='relevo_local') && r.visible!==false); }
function demPreviewOpacity(r,tilesProntos){
  if(!r||!r.overlay||typeof r.overlay.setOpacity!=='function')return;
  if(r.style?.mode==='relevo_local'){r.overlay.setOpacity(0);return;}
  r.overlay.setOpacity(tilesProntos?0:((r.style&&r.style.opacity)??0.9));
}
function demTileFallbackState(gl){
  let preview=false,hole=false;
  for(const record of Object.values(gl&&gl._tiles||{})){
    const cv=record.el;
    if(record.current===false||!cv||cv._tileCancelled)continue;
    preview=preview||!!cv._demPreviewFallback;
    hole=hole||!!cv._demFallbackHole;
  }
  return {preview,hole};
}
function demTilesUsingFallback(r){
  return !!(r&&r.demHD&&demTileFallbackState(_demGrids.get(String(r.id))).preview);
}
async function buildDemTileWithRetry(cv,coords,r,job){
  try{return await buildDemTile(cv,coords,r,false,job);}
  catch(error){
    if(error?.name==='AbortError'||!job.isCurrent())throw error;
    // Uma segunda leitura cobre falhas transitórias sem criar um ciclo de
    // redraw/retry. Um tile substituído pelo zoom nunca reinicia a leitura.
    await new Promise(resolve=>setTimeout(resolve,150));
    await job.checkpoint();
    return buildDemTile(cv,coords,r,false,job);
  }
}
function syncDemTiles(r){
  if(typeof map==='undefined'||!map) return;
  const alvos = r? [r] : (S.rasters||[]);
  for(const R of alvos){
    if(!R) continue;
    const id=String(R.id), quer=demTilesAtivo(R), atual=_demGrids.get(id);
    if(quer && !atual){
      const pane='demHD'+id;
      if(!map.getPane(pane)){
        const pn=map.createPane(pane),base=map.getPane(panelDaCamada('R'+R.id));
        pn.style.zIndex=String((parseInt(base&&base.style.zIndex,10)||410)+1);
      }
      const Grid=L2.GridLayer.extend({
        createTile:function(coords,done){
          const cv=document.createElement('canvas'),
            dpr=R.dispFull?Math.min(2,Math.max(1,window.devicePixelRatio||1)):1,
            px=Math.round(256*dpr);
          cv.width=cv.height=px;cv.style.width=cv.style.height='256px';
          if(R.dispFull){cv.classList.add('geomine-raster-native-pixels');cv.style.imageRendering='pixelated';}
          const gl=this,source=R.d;
          const vigente=()=>!gl._demRetired&&_demGrids.get(id)===gl&&R.d===source&&demTilesAtivo(R);
          const job=rasterTileJob(gl,cv,coords,vigente);
          const finish=()=>rasterTileFinish(gl,cv,coords,done);
          if(rasterTileCacheGet(gl,cv,coords)){setTimeout(finish,0);return cv;}
          buildDemTileWithRetry(cv,coords,R,job)
            .then(()=>{
              if(job.isCurrent())rasterTileCachePut(gl,cv,coords);
              finish();
            })
            .catch(async err=>{
              if(!job.isCurrent()||err?.name==='AbortError'){finish();return;}
              console.warn('tile MDT:',err&&err.message||err);
              /* A prévia mantém o mapa utilizável, mas não muda a escolha
                 persistida nem entra no cache de tiles bem-sucedidos. */
              let fallbackOk=false;
              try{await buildDemTile(cv,coords,R,true,job);fallbackOk=true;}catch(_){}
              if(!job.isCurrent()){finish();return;}
              cv._demPreviewFallback=true;cv._demFallbackHole=!fallbackOk;
              if(!fallbackOk)gl._demFallbackHole=true;
              if(rasCur===R){rasResInfo();rasSyncResolutionControls(R);}
              if(!gl._demFailureNotice){
                gl._demFailureNotice=true;
                toast('⚠ Falha ao ler tiles do MDT: prévia temporária. A resolução original continua selecionada; use “Tentar novamente” nas propriedades.');
              }
              finish();
            });
          return cv;
        }
      });
      const gl=new Grid({pane,tileSize:256,keepBuffer:1,updateWhenZooming:false,
        updateWhenIdle:false,updateInterval:100,opacity:(R.style&&R.style.opacity)??0.9});
      rasterTileBindLifecycle(gl);
      window.GeoMineLoadProgress?.bind(gl,'MDT · '+R.name,()=>demTileFallbackState(gl).preview);
      const vigente=()=>!gl._demRetired&&_demGrids.get(id)===gl&&demTilesAtivo(R);
      /* A previa aparece somente enquanto os tiles estao carregando. Quando
         a janela original fica pronta, some para nao somar duas opacidades
         (0,8 sobre 0,8 virava visualmente 0,96). */
      gl.on('loading',()=>{if(vigente()){gl._demFallbackHole=false;demPreviewOpacity(R,false);}});
      gl.on('load',()=>{if(vigente()){
        gl._demFallbackHole=demTileFallbackState(gl).hole;
        demPreviewOpacity(R,!gl._demFallbackHole);
        if(rasCur===R){rasResInfo();rasSyncResolutionControls(R);}
      }});
      _demGrids.set(id,gl);gl.addTo(map);
      /* O desenho normal continua por baixo: o mapa não pisca a cada pan. */
      if(R.overlay && R.visible!==false && !map.hasLayer(R.overlay)) R.overlay.addTo(map);
      demPreviewOpacity(R,false);
    }else if(quer&&atual){
      let carregando=false;
      try{carregando=typeof atual.isLoading==='function'&&atual.isLoading();}catch(e){}
      demPreviewOpacity(R,!carregando&&!atual._demFallbackHole);
    }
    if(!quer && atual){
      atual._demRetired=true;_demGrids.delete(id);
      map.removeLayer(atual);
      if(R.overlay && R.visible!==false && !map.hasLayer(R.overlay)) R.overlay.addTo(map);
      demPreviewOpacity(R,false);
    }else if(!quer){
      demPreviewOpacity(R,false);
    }
  }
}
/* Redesenha os tiles quando o estilo/limites da superfície mudam. */
function demTilesRefresh(r){
  const gl=_demGrids.get(String(r&&r.id));
  if(!gl) return false;
  gl.options.opacity=(r.style&&r.style.opacity)??0.9;
  gl.setOpacity(gl.options.opacity);
  gl._tileEpoch=(gl._tileEpoch||0)+1;
  gl._demFailureNotice=false;
  if(gl._readyTileCache)gl._readyTileCache.clear();gl._readyTileBytes=0;
  gl.redraw();
  return true;
}
async function buildDemTile(cv,coords,r,forcaPrevia,job){
  const d=(!r.d._img0&&r.d._full)?r.d._full:r.d, W0=d._W0||d.nc, H0=d._H0||d.nr;
  const bb=d._bb||[d.xll,d.yll,d.xll+d.nc*d.cs,d.yll+d.nr*(d.csy||d.cs)];
  const [Wb,Sb,Eb,Nb]=bb, gx=(Eb-Wb)/W0, gy=(Nb-Sb)/H0;     // m/pixel do NATIVO
  // grade de warp 9×9: pixel do tile -> pixel nativo do GeoTIFF
  const OUT=cv.width||256,N=9,stMapa=256/(N-1),st=OUT/(N-1),
    SX=new Float64Array(N*N), SY=new Float64Array(N*N);
  let mnx=Infinity,mny=Infinity,mxx=-Infinity,mxy=-Infinity;
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const pt=L2.point(coords.x*256+i*stMapa, coords.y*256+j*stMapa);
    const ll=map.unproject(pt,coords.z);
    const c=fromWGS(S.workCRS, ll.lng, ll.lat);
    const px=(c[0]-Wb)/gx, py=(Nb-c[1])/gy;
    SX[j*N+i]=px; SY[j*N+i]=py;
    if(px<mnx)mnx=px; if(px>mxx)mxx=px; if(py<mny)mny=py; if(py>mxy)mxy=py;
  }
  if(mxx<0||mxy<0||mnx>W0||mny>H0) return;                  // tile fora do raster
  const dpp=Math.max((mxx-mnx),(mxy-mny))/OUT,              // px nativos por px fisico do tile
    clipAceita=rasterTileClipper(r);
  if(r.style?.mode==='relevo_local'&&window.GeoMineLocalRelief)return GeoMineLocalRelief.paintTile(cv,r,{SX,SY,N,st,W0,H0,Wb,Nb,gx,gy,clipAceita},job);
  const fPrev=W0/d.nc;                                      // px nativos por px do preview
  const stats=(r.dispFull&&d._sourceStats)||(r._st||(r._st=rasterStats(r.d))),
    mn=stats.mn, rng=(stats.mx-stats.mn)||1;
  // --- zoom afastado: a grade de tela já basta (nada é lido do arquivo) ---
  if(forcaPrevia||!d._img0||(!r.dispFull&&dpp>=fPrev*0.95)){
    pintaTileDaGrade(cv,r,d,SX,SY,N,st,fPrev,mn,rng,W0,H0,
      clipAceita,Wb,Nb,gx,gy);
    return 'preview';
  }
  // --- pirâmide: a menor imagem que ainda atende esta densidade ---
  const runtime=globalThis.GeoMineTileRuntime;
  let im=d._img0, f=1, fY=1;
  if(runtime){const level=await runtime.overview(d._tiff,im,W0,H0,dpp);im=level.im;f=level.fx;fY=level.fy;}
  else try{
    const n=await d._tiff.getImageCount();
    for(let k=1;k<n;k++){ const cand=await d._tiff.getImage(k);
      const cf=W0/cand.getWidth();
      if(cf<=Math.max(1,dpp*1.4) && cf>f){ im=cand; f=cf; } }
  }catch(e){}
  fY=H0/im.getHeight();
  // janela de leitura com margem de 1 célula (o sombreado precisa dos vizinhos)
  const M=2*f, MY=2*fY;
  const wx0=Math.max(0,Math.floor((mnx-M)/f)), wy0=Math.max(0,Math.floor((mny-MY)/fY));
  const wx1=Math.min(im.getWidth(), Math.ceil((mxx+M)/f));
  const wy1=Math.min(im.getHeight(),Math.ceil((mxy+MY)/fY));
  if(wx1<=wx0||wy1<=wy0) return;
  const tetoBuffer=Math.ceil(OUT*1.25),
        rw=Math.max(3,Math.min(tetoBuffer,Math.ceil((wx1-wx0)*f/Math.max(f,dpp)))),
        rh=Math.max(3,Math.min(tetoBuffer,Math.ceil((wy1-wy0)*fY/Math.max(fY,dpp))));
  let ras;
  const readOptions={samples:[0],window:[wx0,wy0,wx1,wy1],
    width:rw,height:rh,resampleMethod:r.dispFull?'nearest':'bilinear'};
  if(runtime)ras=await runtime.read(im,readOptions,job);
  else{await ioSlot();try{ras=await im.readRasters(readOptions);}finally{ioLibera();}}
  const band=ras[0], nd=d._nd;
  const zb=new Float32Array(rw*rh);
  for(let k=0;k<zb.length;k++){
    const v=band[k];
    zb[k]=((nd!=null&&v===nd)||!isFinite(v)||v<-1e30)?NaN:v;
  }
  /* grade temporária da janela: o sombreado usa o tamanho REAL da célula
     lida, senão o relevo do tile sairia mais/menos dramático que o preview */
  const gt={nc:rw,nr:rh,z:zb,
    cs:((wx1-wx0)*f*gx)/rw, csy:((wy1-wy0)*fY*gy)/rh,
    xll:Wb+wx0*f*gx, yll:Nb-wy1*fY*gy};
  const ctx=cv.getContext('2d'), id=ctx.createImageData(OUT,OUT), D=id.data;
  const pinta=rasterPainter(r,mn,rng), cor=[0,0,0];
  const kx=rw/((wx1-wx0)*f), ky=rh/((wy1-wy0)*fY);           // px nativos -> px do buffer
  for(let v2=0;v2<OUT;v2++){
    if(job&&job.checkpoint&&(v2&31)===31)await job.checkpoint();
    const j=Math.min(N-2,Math.floor(v2/st)), fy=(v2-j*st)/st;
    for(let u=0;u<OUT;u++){
      const i=Math.min(N-2,Math.floor(u/st)), fx=(u-i*st)/st;
      const a=j*N+i;
      const X=(SX[a]*(1-fx)+SX[a+1]*fx)*(1-fy)+(SX[a+N]*(1-fx)+SX[a+N+1]*fx)*fy;
      const Y=(SY[a]*(1-fx)+SY[a+1]*fx)*(1-fy)+(SY[a+N]*(1-fx)+SY[a+N+1]*fx)*fy;
      if(X<0||Y<0||X>=W0||Y>=H0) continue;
      if(clipAceita&&!clipAceita(Wb+X*gx,Nb-Y*gy))continue;
      const bx=Math.min(rw-1,Math.max(0,(X-wx0*f)*kx|0)),
            by=Math.min(rh-1,Math.max(0,(Y-wy0*fY)*ky|0));
      if(!pinta(gt,by*rw+bx,zb,cor)) continue;
      const o=(v2*OUT+u)*4;
      D[o]=cor[0];D[o+1]=cor[1];D[o+2]=cor[2];D[o+3]=255;
    }
  }
  ctx.putImageData(id,0,0);
  return 'native';
}
function rasterTileClipper(r){
  const rings=rasterClipRings(r);
  if(!rings||!rings.length)return null;
  const rev=+r._rev||0,cache=r._tileClipCache;
  if(cache&&cache.rings===rings&&cache.rev===rev)return cache.aceita;
  const idx=rings.map(rg=>{
    try{return typeof indiceAnel==='function'?indiceAnel(rg):null;}catch(e){return null;}
  });
  const dentro=(x,y,rg,ix)=>{
    if(typeof pointInRing==='function')return pointInRing(x,y,rg,ix);
    let ok=false;
    for(let i=0,j=rg.length-1;i<rg.length;j=i++){
      const a=rg[i],b=rg[j];
      if(((a[1]>y)!==(b[1]>y))&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])ok=!ok;
    }
    return ok;
  };
  const aceita=(x,y)=>{let n=0;for(let i=0;i<rings.length;i++)if(dentro(x,y,rings[i],idx[i]))n++;return (n&1)===1;};
  r._tileClipCache={rings,rev,aceita};return aceita;
}
/* Pintura do tile a partir da grade que já está na memória. */
function pintaTileDaGrade(cv,r,d,SX,SY,N,st,fPrev,mn,rng,W0,H0,clipAceita,Wb,Nb,gx,gy){
  const OUT=cv.width||256,ctx=cv.getContext('2d'), id=ctx.createImageData(OUT,OUT), D=id.data;
  const z=d.zf||d.z;
  const pinta=rasterPainter(r,mn,rng), cor=[0,0,0];
  for(let v2=0;v2<OUT;v2++){
    const j=Math.min(N-2,Math.floor(v2/st)), fy=(v2-j*st)/st;
    for(let u=0;u<OUT;u++){
      const i=Math.min(N-2,Math.floor(u/st)), fx=(u-i*st)/st;
      const a=j*N+i;
      const X=(SX[a]*(1-fx)+SX[a+1]*fx)*(1-fy)+(SX[a+N]*(1-fx)+SX[a+N+1]*fx)*fy;
      const Y=(SY[a]*(1-fx)+SY[a+1]*fx)*(1-fy)+(SY[a+N]*(1-fx)+SY[a+N+1]*fx)*fy;
      if(X<0||Y<0||X>=W0||Y>=H0) continue;
      if(clipAceita&&!clipAceita(Wb+X*gx,Nb-Y*gy))continue;
      const cxi=Math.min(d.nc-1,Math.max(0,(X/fPrev)|0)),
            cyi=Math.min(d.nr-1,Math.max(0,(Y/(H0/d.nr))|0));
      if(!pinta(d,cyi*d.nc+cxi,z,cor)) continue;
      const o=(v2*OUT+u)*4;
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
S.orthoHD=true;S.orthoDispFull=true;
/* "Mostrar o mapa em resolução original" da ortofoto — mesma opção do MDT:
   tiles com os pixels do retina (até 2×), sem suavização. Desligado por padrão. */
S.orthoDispFull=true;

/* ===========================================================================
   ORTOFOTO POR TILES — pirâmide dinâmica no zoom
   Em vez de recarregar UMA janela grande a cada pan (v57), o overlay vira um
   L.GridLayer: cada tile de 256 px lê do GeoTIFF (em RAM) apenas a sua área,
   na densidade do zoom atual, usando a pirâmide COG quando houver. Tiles
   ficam num cache limitado — voltar a uma área recente evita reler o TIFF, e a
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
/* CRS EM QUE OS CANTOS DA ORTOFOTO SÃO LIDOS. Por padrão é o CRS de trabalho
   (como sempre foi: trocar o fuso do projeto reposiciona a ortofoto junto com os
   rasters). Só quando o usuário escolhe um CRS de origem nas propriedades é que
   a ortofoto passa a ter CRS próprio (_crsFixo) — igual ao "reprojetar" do MDT. */
function orthoCRS(I){ return (I&&I._crsFixo)||S.workCRS; }
/* OPACIDADE — UMA FUNÇÃO PARA OS DOIS CONTROLES (painel lateral e modal).
   Antes cada slider mexia só na PRÉVIA (S.img.overlay): com os tiles ligados a
   ortofoto continuava opaca, porque a grade de tiles guardava a opacidade do
   instante em que foi criada. E a prévia ficava por baixo com a MESMA opacidade
   — 0,8 sobre 0,8 é 0,96 na tela. Como no MDT (demPreviewOpacity), a prévia só
   aparece enquanto os tiles carregam; pronta a grade, ela some. */
function orthoOpacidade(){
  const e=document.getElementById('imgOp'); const v=e?+e.value:NaN;
  return Number.isFinite(v)?Math.min(1,Math.max(0,v)):1;
}
function orthoPreviewOpacity(tilesProntos){
  const I=S.img; if(!I||!I.overlay||typeof I.overlay.setOpacity!=='function') return;
  I.overlay.setOpacity((tilesProntos&&_orthoGrid)?0:orthoOpacidade());
}
function orthoSetOpacity(v){
  v=Math.min(1,Math.max(0,+v||0));
  const e=document.getElementById('imgOp'); if(e && +e.value!==v) e.value=String(v);
  if(_orthoGrid && typeof _orthoGrid.setOpacity==='function') _orthoGrid.setOpacity(v);
  let carregando=false; try{ carregando=!!(_orthoGrid&&_orthoGrid.isLoading&&_orthoGrid.isLoading()); }catch(_){}
  orthoPreviewOpacity(!!_orthoGrid && !carregando && !_orthoGrid._fallbackHole);
}
/* Os limiares de branco/preto do "Aplicar" — a MESMA regra de sem-dado que a
   prévia usa. Os tiles lidos do TIFF só olhavam o canal alfa, e com eles ligados
   as bordas brancas/pretas do mosaico reapareciam por cima da prévia recortada. */
function orthoSemDadoLimiares(){
  const gcb=(id,d)=>{const e=document.getElementById(id); return e?e.checked:d;};
  const gvn=(id,d)=>{const e=document.getElementById(id); const v=e?+e.value:NaN; return isFinite(v)?v:d;};
  return {on:gcb('imgND',true), w:gvn('imgNDw',250), b:gvn('imgNDb',4)};
}
/* Um fallback já mostrado pelo Leaflet continua sendo PRÉVIA. Duas novas
   leituras, no máximo, recuperam uma falha transitória na mesma vista sem
   redesenhar toda a grade. Retirar o tile ou trocar fonte/projeto cancela-as. */
function orthoTileRetryCancel(gl,cv){
  if(cv._orthoRetryTimer!=null)clearTimeout(cv._orthoRetryTimer);
  delete cv._orthoRetryTimer;gl._orthoRetryTiles?.delete(cv);
}
function orthoTileFallbackStatus(gl){
  gl._fallbackHole=!!gl._orthoFallbackTiles?.size;
  if(_orthoGrid!==gl||gl._retired)return;
  _tileFails=gl._orthoFallbackTiles?.size||0;
  if(!gl._fallbackHole)delete gl._nativeError;
  let loading=false;try{loading=!!gl.isLoading?.();}catch(_){}
  orthoPreviewOpacity(!loading&&!gl._fallbackHole);
}
function orthoTileReadComplete(gl,cv,coords,mode){
  cv._orthoReadMode=mode;
  const fallback=gl._orthoFallbackTiles||(gl._orthoFallbackTiles=new Set());
  if(mode==='native'||mode==='fora'){
    fallback.delete(cv);orthoTileRetryCancel(gl,cv);rasterTileCachePut(gl,cv,coords);
  }else fallback.add(cv);
  orthoTileFallbackStatus(gl);
}
function orthoTileRetry(gl,cv,coords,px,job,error){
  if(!job.isCurrent()||cv._orthoRetryTimer!=null||(cv._orthoRetryAttempts||0)>=2||
    error?.code==='RASTER_MEMORY_LIMIT'||error?.name==='RangeError')return;
  const attempt=cv._orthoRetryAttempts=(cv._orthoRetryAttempts||0)+1;
  const pending=gl._orthoRetryTiles||(gl._orthoRetryTiles=new Set());pending.add(cv);
  cv._orthoRetryTimer=setTimeout(async()=>{
    delete cv._orthoRetryTimer;
    if(!job.isCurrent()){orthoTileRetryCancel(gl,cv);return;}
    try{
      const mode=await buildOrthoTile(cv,coords,px,false,job);
      if(!job.isCurrent())return;
      orthoTileReadComplete(gl,cv,coords,mode);
    }catch(err){
      if(!job.isCurrent()||err?.name==='AbortError')return;
      gl._nativeError=String(err?.message||err);orthoTileRetry(gl,cv,coords,px,job,err);
    }finally{
      if(cv._orthoRetryTimer==null)pending.delete(cv);
      if(job.isCurrent()){
        orthoTileFallbackStatus(gl);
        gl.fire?.('tileload',{tile:cv,coords});
        if(!gl.isLoading?.())gl.fire?.('load');
      }
    }
  },attempt===1?400:1500);
}
function orthoTileBindRetries(gl){
  gl.on('tileunload',e=>{if(e.tile){orthoTileRetryCancel(gl,e.tile);gl._orthoFallbackTiles?.delete(e.tile);orthoTileFallbackStatus(gl);}});
  gl.on('remove',()=>{for(const cv of gl._orthoRetryTiles||[])orthoTileRetryCancel(gl,cv);gl._orthoFallbackTiles?.clear();});
}
function syncOrthoTiles(){
  const I=S.img;
  if(_orthoGrid&&_orthoGrid._orthoSourceCurrent&&!_orthoGrid._orthoSourceCurrent()){
    const old=_orthoGrid;old._retired=true;_orthoGrid=null;try{map.removeLayer(old);}catch(_){}
  }
  // Conferir e guardar o original vem antes das leituras de desenho. Os
  // decodificadores de grandes faixas JPEG podem atrasar até o fingerprint
  // do File e o IndexedDB se competirem com essa etapa no thread principal.
  const quer = S.orthoHD && I && I._img0 && !I._nativeSourceHolds?.size && I.visible!==false && map;
  if(quer && !_orthoGrid){
    if(!map.getPane('orthoHD')){ const pn=map.createPane('orthoHD'); pn.style.zIndex=350; }
    /* PIXELS NATIVOS NO RETINA (mesma opção "resolução original" do MDT): o
       canvas do tile ganha 2× os pixels e é mostrado em 256 px CSS; sem isto o
       tile de 256 era ampliado 2× em toda tela de alta densidade. */
    const dpr=S.orthoDispFull?Math.min(2,Math.max(1,window.devicePixelRatio||1)):1;
    const px=Math.round(256*dpr),sourceImage=I._img0,sourceTiff=I._tiff,sourceRaw=I._sourceRaw,
      sourceURL=I.url,sourceBounds=I.b?.join(','),sourceProject=S.projectId,
      sourceGeneration=window.GeoMineSessionAutosave?.state?.generation,sourceFull=!!S.orthoDispFull;
    const sourceCurrent=()=>S.img===I&&S.projectId===sourceProject&&
      window.GeoMineSessionAutosave?.state?.generation===sourceGeneration&&I._img0===sourceImage&&
      I._tiff===sourceTiff&&I._sourceRaw===sourceRaw&&I.url===sourceURL&&I.b?.join(',')===sourceBounds&&!!S.orthoDispFull===sourceFull;
    const Grid=L2.GridLayer.extend({
      createTile:function(coords, done){
        const gl=this;
        const cv=document.createElement('canvas');
        cv.width=cv.height=px; cv.style.width=cv.style.height='256px';
        if(S.orthoDispFull){ cv.classList.add('geomine-raster-native-pixels'); cv.style.imageRendering='pixelated'; }
        const vigente=()=>!gl._retired && _orthoGrid===gl && sourceCurrent();
        const job=rasterTileJob(gl,cv,coords,vigente);
        const finish=()=>rasterTileFinish(gl,cv,coords,done);
        if(rasterTileCacheGet(gl,cv,coords)){cv._orthoReadMode='native';setTimeout(finish,0);return cv;}
        cv._orthoReadMode='pending';
        buildOrthoTile(cv, coords, px, false,job)
          .then(mode=>{if(job.isCurrent())orthoTileReadComplete(gl,cv,coords,mode);finish();})
          .catch(async err=>{
            if(!job.isCurrent()||err?.name==='AbortError'){finish();return;}
            console.warn('tile ortofoto:', err&&err.message||err);
            // A prévia sustenta o desenho, mas nunca entra no cache nativo.
            try{await buildOrthoTile(cv,coords,px,true,job);}catch(_){}
            if(!job.isCurrent()){finish();return;}
            orthoTileReadComplete(gl,cv,coords,'fallback');
            gl._nativeError=String(err?.message||err);
            if(!gl._nativeNotice){gl._nativeNotice=true;toast('Original temporariamente indisponível. Prévia temporária; a resolução nativa continua selecionada.');}
            finish();orthoTileRetry(gl,cv,coords,px,job,err);
          });
        return cv;
      }
    });
    const novaGrade=new Grid({pane:'orthoHD', tileSize:256, keepBuffer:1,
      updateWhenZooming:false, updateWhenIdle:false, updateInterval:100,
      opacity:orthoOpacidade()});
    novaGrade._orthoSourceCurrent=sourceCurrent;
    rasterTileBindLifecycle(novaGrade);orthoTileBindRetries(novaGrade);
    window.GeoMineLoadProgress?.bind(novaGrade,'Ortofoto · '+(I.name||'imagem'),()=>novaGrade._fallbackHole);
    /* A prévia aparece somente enquanto os tiles estão carregando. Quando a
       grade fica pronta, some — para não somar duas opacidades. */
    novaGrade.on('loading',()=>{if(_orthoGrid===novaGrade){orthoTileFallbackStatus(novaGrade);orthoPreviewOpacity(false);}});
    novaGrade.on('load',()=>{ if(_orthoGrid===novaGrade) orthoPreviewOpacity(!novaGrade._fallbackHole); });
    try{ _orthoGrid=novaGrade; novaGrade.addTo(map);delete I._nativeTileError; }
    catch(e){ try{ map.removeLayer(novaGrade); }catch(_){} _orthoGrid=null; throw e; }
    /* A PRÉVIA FICA POR BAIXO. Antes ela era retirada e, enquanto os tiles não
       chegavam, a ortofoto sumia a cada pan — o que se sente como travamento.
       Mantida embaixo, o mapa nunca fica vazio e o tile só substitui o que já
       está visível quando fica pronto. */
    if(I.overlay && I.visible!==false && !map.hasLayer(I.overlay)) I.overlay.addTo(map);
    orthoPreviewOpacity(false);
  }else if(quer && _orthoGrid){
    let carregando=false;
    try{ carregando=typeof _orthoGrid.isLoading==='function'&&_orthoGrid.isLoading(); }catch(e){}
    orthoPreviewOpacity(!carregando && !_orthoGrid._fallbackHole);
  }
  if(!quer && _orthoGrid){
    _orthoGrid._retired=true;
    map.removeLayer(_orthoGrid); _orthoGrid=null;
    if(I && I.overlay && I.visible!==false && !map.hasLayer(I.overlay)) I.overlay.addTo(map);
  }
  if(!quer && I && I.overlay) orthoPreviewOpacity(false);   // sem tiles, a prévia volta à opacidade do controle
  /* Com a prévia por baixo, o pane dos tiles precisa ficar logo acima dela. */
  if(_orthoGrid){ const pn=map.getPane('orthoHD');
    const base=map.getPane('alagis_ortofoto');
    if(pn&&base) pn.style.zIndex=(parseInt(base.style.zIndex||405,10)+1); }
}
/* px = lado do canvas do tile (256, ou 512 com "resolução original" no retina);
   soPrevia = pintar SÓ da prévia em RAM (usado como fallback quando a leitura
   do TIFF falha — antes o tile ficava transparente e a ortofoto ganhava buracos). */
async function buildOrthoTile(cv, coords, px, soPrevia,job){
  const I=S.img;
  px=px||cv.width||256;
  const esc=256/px;                                     // px do canvas -> px CSS do tile
  const [Wb,Sb,Eb,Nb]=I.b, W0=I._W0, H0=I._H0;
  const gx=(Eb-Wb)/W0, gy=(Nb-Sb)/H0;                  // m/pixel do original
  const crs=orthoCRS(I);
  // --- grade de warp 9×9 (em px CSS): pixel do tile -> pixel (resolução plena) do TIFF ---
  const N=9, st=32, SX=new Float64Array(N*N), SY=new Float64Array(N*N);
  let mnx=Infinity,mny=Infinity,mxx=-Infinity,mxy=-Infinity;
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const p=L2.point(coords.x*256+i*st, coords.y*256+j*st);
    const ll=map.unproject(p, coords.z);
    const c=fromWGS(crs, ll.lng, ll.lat);
    const pxx=(c[0]-Wb)/gx, pyy=(Nb-c[1])/gy;
    SX[j*N+i]=pxx; SY[j*N+i]=pyy;
    if(pxx<mnx)mnx=pxx; if(pxx>mxx)mxx=pxx; if(pyy<mny)mny=pyy; if(pyy>mxy)mxy=pyy;
  }
  if(mxx<0 || mxy<0 || mnx>W0 || mny>H0) return 'fora';  // tile fora da imagem
  const dpp=Math.max((mxx-mnx),(mxy-mny))/px;          // px do TIFF por px do canvas
  /* Mantém a mesma interpolação e centros de pixel, mas sem criar um par
     [X,Y] para CADA pixel: no retina eram 262 mil arrays por tile. */
  const cellX=new Uint8Array(px),fracX=new Float64Array(px);
  for(let u=0;u<px;u++){const gi=((u+.5)*esc)/st;cellX[u]=Math.min(N-2,gi|0);fracX[u]=gi-cellX[u];}
  // Sem pirâmides, um tile de zoom afastado obrigaria a descomprimir o arquivo
  // quase inteiro. Nesses casos, pinta a partir do PREVIEW (já em RAM) — a
  // densidade do preview basta nesse nível de zoom, por definição.
  const fPrev=Math.max(W0/I._w,H0/I._h);
  /* A PRÉVIA JÁ ESTÁ EM RAM. Enquanto o zoom não pedir mais densidade do que
     ela tem, ler o arquivo é trabalho jogado fora — era isso que deixava o
     mapa pesado no zoom de trabalho, com dezenas de tiles indo ao TIFF a cada
     pan para devolver o mesmo pixel da prévia. Só abaixo desse limiar o tile
     vai ao arquivo. (Antes esse atalho valia apenas para arquivo SEM pirâmide.) */
  const usaPrevia = soPrevia || (!S.orthoDispFull && dpp >= fPrev*0.95);
  if(usaPrevia && I._prevID===undefined){
    /* Todos os tiles da vista compartilham UMA decodificação da prévia.
       Um relink enquanto ela decodifica não pode devolver o bitmap antigo. */
    const url=I.url,w=I._w,h=I._h,warped=I._warpWM;
    if(!I._prevDecode||I._prevDecode.url!==url||I._prevDecode.w!==w||I._prevDecode.h!==h){
      const pending={url,w,h};
      pending.promise=(async()=>{
        const c2=document.createElement('canvas');c2.width=w;c2.height=h;
        const im2=new Image();
        await new Promise((rs,rj)=>{im2.onload=rs;im2.onerror=rj;im2.src=url;});
        c2.getContext('2d').drawImage(im2,0,0);
        return c2.getContext('2d').getImageData(0,0,w,h);
      })();
      I._prevDecode=pending;
    }
    const pending=I._prevDecode;
    try{
      const decoded=await pending.promise;
      if(I.url===url&&I._w===w&&I._h===h&&I._prevID===undefined){I._prevID=decoded;I._prevGrid=warped?'mercator':'source';}
    }catch(e){if(I.url===url&&I._prevID===undefined)I._prevID=null;}
    finally{if(I._prevDecode===pending)delete I._prevDecode;}
    if(I.url!==url){const error=new Error('A prévia da ortofoto mudou');error.name='AbortError';throw error;}
  }
  if(usaPrevia){
    if(!I._prevID) throw new Error('prévia da ortofoto indisponível');
    const P=I._prevID.data, PW=I._prevID.width, PH=I._prevID.height,
          ctx2=cv.getContext('2d'), id2=ctx2.createImageData(px,px), D2=id2.data;
    if(I._prevGrid!=='source' && I._warpWM && Array.isArray(I._llbounds) && I._llbounds.length===2){
      /* A prévia em RAM (I.url) já foi REAMOSTRADA para Web Mercator — é a
         imagem do overlay, com os cantos em I._llbounds. Amostrá-la pela
         malha do CRS de origem (como se ainda fosse alinhada ao UTM) deslocava
         a ortofoto em relação ao MDT: a convergência meridiana da zona chega
         a ~0,4° e, num levantamento de 3 km, isso são ~12 m nas bordas. Em
         Mercator o tile é linear: basta a proporção dentro dos limites do warp. */
      const sw=reproj('EPSG:4326','EPSG:3857',I._llbounds[0][1],I._llbounds[0][0]);
      const ne=reproj('EPSG:4326','EPSG:3857',I._llbounds[1][1],I._llbounds[1][0]);
      const mundo=2*Math.PI*6378137, mpc=mundo/(256*Math.pow(2,coords.z))*esc;   // m (Mercator) por px do canvas
      const X0m=coords.x*256*(mpc/esc)-mundo/2, Y0m=mundo/2-coords.y*256*(mpc/esc);
      const kx=PW/(ne[0]-sw[0]), ky=PH/(ne[1]-sw[1]);
      for(let v=0;v<px;v++){
        if(job&&job.checkpoint&&(v&31)===31)await job.checkpoint();
        const rr=Math.floor((ne[1]-(Y0m-(v+0.5)*mpc))*ky);
        if(rr<0||rr>=PH) continue;
        for(let u=0;u<px;u++){
          const cc=Math.floor((X0m+(u+0.5)*mpc-sw[0])*kx);
          if(cc<0||cc>=PW) continue;
          const q=(rr*PW+cc)*4, o=(v*px+u)*4;
          if(P[q+3]<8) continue;                       // a prévia já traz o sem-dado recortado
          D2[o]=P[q]; D2[o+1]=P[q+1]; D2[o+2]=P[q+2]; D2[o+3]=P[q+3];
        }
      }
    } else {
      /* prévia ainda alinhada ao CRS de origem (sem warp): malha do original */
      const fx=PW/W0, fy=PH/H0;
      for(let v=0;v<px;v++){
        if(job&&job.checkpoint&&(v&31)===31)await job.checkpoint();
        const gj=((v+.5)*esc)/st,j=Math.min(N-2,gj|0),vf=gj-j,row=j*N;
        for(let u=0;u<px;u++){
          const a=row+cellX[u],uf=fracX[u],
            X=(SX[a]*(1-uf)+SX[a+1]*uf)*(1-vf)+(SX[a+N]*(1-uf)+SX[a+N+1]*uf)*vf,
            Y=(SY[a]*(1-uf)+SY[a+1]*uf)*(1-vf)+(SY[a+N]*(1-uf)+SY[a+N+1]*uf)*vf;
          if(X<0||Y<0||X>=W0||Y>=H0) continue;
          const q=(((Y*fy)|0)*PW+((X*fx)|0))*4, o=(v*px+u)*4;
          if(P[q+3]<8) continue;
          D2[o]=P[q]; D2[o+1]=P[q+1]; D2[o+2]=P[q+2]; D2[o+3]=P[q+3];
        }
      }
    }
    ctx2.putImageData(id2,0,0);
    return 'previa';
  }
  // --- pirâmide: a menor imagem que ainda atende esta densidade ---
  const runtime=globalThis.GeoMineTileRuntime;
  let im=I._img0, f=1;
  if(runtime){const level=await runtime.overview(I._tiff,im,W0,H0,dpp);im=level.im;f=level.fx;}
  else try{
    const n=await I._tiff.getImageCount();
    for(let k=1;k<n;k++){ const cand=await I._tiff.getImage(k);
      const cf=W0/cand.getWidth();
      if(cf<=Math.max(1,dpp*1.4) && cf>f){ im=cand; f=cf; } }
  }catch(e){}
  // --- janela de leitura (nos pixels da imagem escolhida) ---
  const fy=H0/im.getHeight(), M=2*f, My=2*fy;
  const wx0=Math.max(0, Math.floor((mnx-M)/f)), wy0=Math.max(0, Math.floor((mny-My)/fy));
  const wx1=Math.min(im.getWidth(),  Math.ceil((mxx+M)/f));
  const wy1=Math.min(im.getHeight(), Math.ceil((mxy+My)/fy));
  if(wx1<=wx0 || wy1<=wy0) return 'fora';
  const teto=Math.round(320*px/256);                    // buffer acompanha o tamanho do canvas
  const rw=Math.max(2, Math.min(teto, Math.ceil((wx1-wx0)*f/Math.max(f,dpp))));
  const rh=Math.max(2, Math.min(teto, Math.ceil((wy1-wy0)*fy/Math.max(fy,dpp))));
  const smp=I._hasA?[0,1,2,3]:[0,1,2];
  let ras;
  const readOptions={samples:smp, window:[wx0,wy0,wx1,wy1],
    width:rw, height:rh, resampleMethod:S.orthoDispFull?'nearest':'bilinear'};
  if(runtime)ras=await runtime.read(im,readOptions,job);
  else{await ioSlot();try{ras=await im.readRasters(readOptions);}finally{ioLibera();}}
  const R=ras[0],G=ras[1],B=ras[2],A=I._hasA?ras[3]:null;
  const is16=(R instanceof Uint16Array)||(R instanceof Int16Array), sc=is16?1/257:1;
  /* SEM-DADO: a MESMA regra do carregamento e do "Aplicar" — alfa, nodata GDAL
     nas três bandas e os limiares de branco/preto. Antes o tile só olhava o
     alfa, e as bordas brancas/pretas do mosaico voltavam com os tiles ligados. */
  const nd=(I._ndVal!=null)?I._ndVal:null, lim=orthoSemDadoLimiares(),color=orthoColorReader(im);
  // --- pintura: warp bilinear da grade para cada pixel do tile ---
  const ctx=cv.getContext('2d'), id=ctx.createImageData(px,px), D=id.data;
  const kx=rw/((wx1-wx0)*f), ky=rh/((wy1-wy0)*fy);     // cada eixo conserva sua extensão
  for(let v=0;v<px;v++){
    if(job&&job.checkpoint&&(v&31)===31)await job.checkpoint();
    const gj=((v+.5)*esc)/st,j=Math.min(N-2,gj|0),vf=gj-j,row=j*N;
    for(let u=0;u<px;u++){
      const a=row+cellX[u],uf=fracX[u],
        X=(SX[a]*(1-uf)+SX[a+1]*uf)*(1-vf)+(SX[a+N]*(1-uf)+SX[a+N+1]*uf)*vf,
        Y=(SY[a]*(1-uf)+SY[a+1]*uf)*(1-vf)+(SY[a+N]*(1-uf)+SY[a+N+1]*uf)*vf;
      if(X<0||Y<0||X>=W0||Y>=H0) continue;             // fora: transparente
      const bx=Math.max(0,Math.min(rw-1, Math.floor((X-wx0*f)*kx)));
      const by=Math.max(0,Math.min(rh-1, Math.floor((Y-wy0*fy)*ky)));
      const q=by*rw+bx, o=(v*px+u)*4;
      let al=A? (is16? A[q]/257 : A[q]) : 255;
      let r0=R[q], g0=G[q], b0=B[q];
      if(al<8){
        // Alguns mosaicos têm furos isolados na máscara alfa (ex.: a cada
        // 8 pixels). Interpola somente a exibição, sem alterar bandas/cache
        // ou o TIFF. Todos os oito vizinhos devem ser opacos e válidos:
        // bordas, lacunas conectadas e regiões NoData permanecem transparentes.
        if(bx===0||by===0||bx===rw-1||by===rh-1)continue;
        let red=0,green=0,blue=0,valid=true;
        for(let dy=-1;dy<=1&&valid;dy++)for(let dx=-1;dx<=1;dx++){
          if(!dx&&!dy)continue;
          const n=q+dy*rw+dx,nr=R[n],ng=G[n],nb=B[n],rgb=color(nr,ng,nb,sc);
          if(A[n]*sc<254||!Number.isFinite(nr+ng+nb)||
            nd!==null&&nr===nd&&ng===nd&&nb===nd||
            lim.on&&((rgb[0]>=lim.w&&rgb[1]>=lim.w&&rgb[2]>=lim.w)||
                     (rgb[0]<=lim.b&&rgb[1]<=lim.b&&rgb[2]<=lim.b))){valid=false;break;}
          red+=nr;green+=ng;blue+=nb;
        }
        if(!valid)continue;
        r0=red/8;g0=green/8;b0=blue/8;al=255;
      }
      if(nd!==null && r0===nd && g0===nd && b0===nd) continue;
      const rgb=color(r0,g0,b0,sc),r8=rgb[0],g8=rgb[1],b8=rgb[2];
      if(lim.on && ((r8>=lim.w&&g8>=lim.w&&b8>=lim.w)||(r8<=lim.b&&g8<=lim.b&&b8<=lim.b))) continue;
      D[o]=r8; D[o+1]=g8; D[o+2]=b8; D[o+3]=al;
    }
  }
  ctx.putImageData(id,0,0);
  return 'native';
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
      toast('Original temporariamente indisponível; resolução nativa continua selecionada. '+
            'Localize o .tif para retomar a leitura dos pixels originais.');
    }
  }
  finally{ _hdBusy=false; }
}
function imgLLBounds(bb){
  // se a imagem foi warpada para Mercator e o pedido é o extent original do preview,
  // devolve os cantos WGS84 já corretos (guardados no applyImgNoData) em vez de
  // reconverter S.img.b como UTM — o que deslocaria a orto ~30 m.
  if(S.img && S.img._llbounds && bb===S.img.b) return S.img._llbounds;
  const crs=orthoCRS(S.img);
  const sw=toWGS(crs,bb[0],bb[1]), ne=toWGS(crs,bb[2],bb[3]);
  return [[sw[1],sw[0]],[ne[1],ne[0]]];
}
function orthoHDReset(){
  _hdOn=false; _hdKey=''; _tileFails=0; S._hdFails=0;
  /* O L.GridLayer também guarda tiles próprios. Só zerar _cache não basta:
     ao atualizar um GeoTIFF com a mesma caixa, o Leaflet conservaria os
     canvases da fonte anterior. A próxima syncOrthoTiles cria uma grade nova. */
  if(_orthoGrid){
    _orthoGrid._retired=true;                          // tiles em voo desta grade não pintam mais
    try{ if(map&&map.hasLayer(_orthoGrid)) map.removeLayer(_orthoGrid); }catch(e){}
    _orthoGrid=null;
  }
  try{ if(S.img&&S.img._cache&&S.img._cache.clear) S.img._cache.clear(); }catch(e){}
}

/* A máscara visual também pode usar a prévia salva, que já pode estar em
   Web Mercator. Ela nunca é promovida a _id (grade do TIFF). A base imutável
   e a identidade anterior permitem desfazer e manter o vínculo do original. */
function orthoMaskState(I){
  const m=I&&I._visualMask;
  return m&&m.renderedURL===I.url&&(!m.nativeID||!I._id||m.nativeID===I._id)?m:null;
}
function orthoMaskPreviewIdentity(I){return orthoMaskState(I)?.identity||null;}
function orthoMaskOptions(){
  const get=(id,fallback)=>{const e=document.getElementById(id),v=e?Number(e.value):NaN;return Number.isFinite(v)?Math.max(0,Math.min(255,v)):fallback;};
  return {enabled:document.getElementById('imgND')?.checked!==false,w:get('imgNDw',250),b:get('imgNDb',4)};
}
function orthoMaskKeep(I,m){Object.defineProperty(I,'_visualMask',{value:m,writable:true,configurable:true});}
function orthoMaskForSave(I){
  const m=orthoMaskState(I);if(!m)return null;
  return {v:1,baseURL:m.baseURL,grid:m.grid,identity:m.identity,enabled:m.enabled,w:m.w,b:m.b};
}
function orthoMaskRestore(I,data){
  // Cada projeto começa com suas próprias opções, nunca com as da aba anterior.
  const on=document.getElementById('imgND'),w=document.getElementById('imgNDw'),b=document.getElementById('imgNDb');
  if(on)on.checked=true;if(w)w.value=250;if(b)b.value=4;
  if(I)delete I._visualMask;
  if(!I||!I.url||data?.v!==1||typeof data.baseURL!=='string'||!data.baseURL.startsWith('data:image/')||
    !['source','mercator'].includes(data.grid)||typeof data.identity!=='string'||!data.identity||data.identity.length>256||
    !Number.isFinite(data.w)||!Number.isFinite(data.b)||data.w<0||data.w>255||data.b<0||data.b>255)return false;
  orthoMaskKeep(I,{baseURL:data.baseURL,grid:data.grid,identity:data.identity,renderedURL:I.url,
    enabled:data.enabled!==false,w:data.w,b:data.b,pixels:null,nativeID:null});
  if(on)on.checked=data.enabled!==false;if(w)w.value=data.w;if(b)b.value=data.b;
  return true;
}
function orthoMaskRefreshUI(I){
  if(S.img!==I)return;
  try{refreshUI();}catch(_){}
  try{if(document.getElementById('imgModal')?.classList.contains('on'))openImgProps();}catch(_){}
}
async function applyOrthoMask(I=S.img,control={}){
  if(!I||S.img!==I||!I.url)throw new Error('Nenhuma prévia da ortofoto disponível.');
  const project=S.projectId,generation=window.GeoMineSessionAutosave?.state?.generation,
    request=I._visualMaskRequest=(I._visualMaskRequest||0)+1;
  const active=()=>S.img===I&&S.projectId===project&&window.GeoMineSessionAutosave?.state?.generation===generation&&I._visualMaskRequest===request&&(!control.isCurrent||control.isCurrent());
  const abort=()=>{const e=new Error('A ortofoto mudou durante o recorte.');e.name='AbortError';throw e;};
  if(I._legacyWarpPromise)await I._legacyWarpPromise;
  if(!active())abort();
  const inputURL=I.url,inputID=I._id,inputImage=I._img0,bounds=JSON.stringify([I.b,I._llbounds,I._warpWM]),
    current=()=>active()&&I.url===inputURL&&I._id===inputID&&I._img0===inputImage&&JSON.stringify([I.b,I._llbounds,I._warpWM])===bounds;
  const options=orthoMaskOptions();let m=orthoMaskState(I);
  const identity=typeof projectNativePreview==='function'?projectNativePreview(I,'ortho'):String(inputURL.length);
  if(!m||inputID&&m.nativeID!==inputID){
    let baseURL=inputURL,grid=I._warpWM?'mercator':'source',pixels=null;
    if(inputID){
      const cv=document.createElement('canvas');cv.width=inputID.width||I._w;cv.height=inputID.height||I._h;
      cv.getContext('2d').putImageData(inputID,0,0);baseURL=cv.toDataURL('image/png');cv.width=0;cv.height=0;
      grid='source';pixels=inputID;
    }
    m={baseURL,grid,identity,renderedURL:inputURL,pixels,nativeID:inputID||null,...options};
  }
  let result;
  if(inputID){
    if(!current())abort();
    result=applyImgNoData();
  }else{
    if(!m.pixels){
      const cv=await orthoCanvasFromURL(m.baseURL);
      if(!current())abort();
      m.pixels=cv.getContext('2d').getImageData(0,0,cv.width,cv.height);cv.width=0;cv.height=0;
    }
    if(!current())abort();
    const src=m.pixels,w=src.width,h=src.height,cv=document.createElement('canvas');cv.width=w;cv.height=h;
    const ctx=cv.getContext('2d'),out=ctx.createImageData(w,h);out.data.set(src.data);let cut=0;
    for(let k=0;k<w*h;k++){
      const p=k*4,D=out.data;if(!D[p+3]){cut++;continue;}
      if(options.enabled&&((D[p]>=options.w&&D[p+1]>=options.w&&D[p+2]>=options.w)||
        (D[p]<=options.b&&D[p+1]<=options.b&&D[p+2]<=options.b))){D[p+3]=0;cut++;}
    }
    ctx.putImageData(out,0,0);
    let url,workURL=null,ll=I._llbounds,warped=I._warpWM;
    if(m.grid==='mercator'){
      if(!Array.isArray(ll)||ll.length!==2)throw new Error('A prévia Mercator não possui limites geográficos válidos.');
      // O bitmap já ocupa esses limites: um novo warp deslocaria os vetores.
      url=options.enabled?cv.toDataURL('image/png'):m.baseURL;
    }else{
      const crs=orthoCRS(I),sourceURL=options.enabled?cv.toDataURL('image/png'):m.baseURL,
        wp=warpCanvasWM(cv,I.b,crs),b=wp.b;
      const sw=wp.wm?reproj('EPSG:3857','EPSG:4326',b[0],b[1]):toWGS(crs,b[0],b[1]),
        ne=wp.wm?reproj('EPSG:3857','EPSG:4326',b[2],b[3]):toWGS(crs,b[2],b[3]);
      ll=[[sw[1],sw[0]],[ne[1],ne[0]]];warped=!!wp.wm;
      url=wp.wm?wp.cv.toDataURL('image/png'):sourceURL;workURL=crs===S.workCRS?sourceURL:null;
    }
    if(!current())abort();
    if(I.overlay){I.overlay.setUrl(url);if(m.grid==='source')I.overlay.setBounds?.(ll);}
    else{
      const ov=L2.imageOverlay(url,ll,{opacity:Number(document.getElementById('imgOp')?.value??1),pane:'alagis_ortofoto'});
      if(I.visible!==false)ov.addTo(map);I.overlay=ov;
    }
    Object.assign(I,{url,_workPreviewURL:workURL,_llbounds:ll,_warpWM:warped,_prevID:out,
      _prevGrid:m.grid,_w:w,_h:h});
    result={pct:100*cut/(w*h),cut};
    try{zApply();}catch(_){}
  }
  Object.assign(m,options,{renderedURL:I.url});orthoMaskKeep(I,m);I._ndPct=result.pct;
  delete I._prevDecode;I._cache?.clear?.();
  try{orthoHDReset();syncOrthoTiles();}catch(_){}
  try{layoutInvalidateOrtho('recorte visual da ortofoto');}catch(_){}
  window.GeoMineSessionAutosave?.markDirty?.('recorte visual da ortofoto');
  orthoMaskRefreshUI(I);return result;
}

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
  /* Tiles e Layout usam a grade original, o overlay usa a cópia Mercator.
     A etiqueta acompanha o cache: _warpWM descreve I.url, não estes pixels.
     Recriar ambos ao aplicar/religar evita conservar o recorte ou a imagem
     da fonte anterior e dispensa uma segunda reamostragem dos tiles. */
  S.img._prevID=out;
  S.img._prevGrid='source';
  const crsOrto=orthoCRS(S.img);                              // CRS em que os cantos são lidos
  // O Layout só posiciona diretamente este bitmap quando sua grade é a do
  // projeto; com CRS próprio, conserva a transformação da prévia Mercator.
  S.img._workPreviewURL=crsOrto===S.workCRS?cv.toDataURL('image/png'):null;
  const wp=warpCanvasWM(cv, S.img.b, crsOrto);                // rotação da malha UTM
  const url=wp.cv.toDataURL('image/png');                     // PNG preserva o alfa
  const b=wp.b;
  const sw = wp.wm? reproj('EPSG:3857','EPSG:4326',b[0],b[1]) : toWGS(crsOrto,b[0],b[1]);
  const ne = wp.wm? reproj('EPSG:3857','EPSG:4326',b[2],b[3]) : toWGS(crsOrto,b[2],b[3]);
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
async function addRasterFromTIFF(f, fname, fsize,control){
  await window.GeoMineImportRecovery?.before(control);
  fname=fname||f.name||'raster'; fsize=fsize??(f.size||0);
  showLoad(`Abrindo ${fname} (${(fsize/1048576).toFixed(0)} MB)…`);
  const d=await parseTIFF(f,control);
  showLoad('Desenhando prévia do MDT…');
  await new Promise(resolve=>setTimeout(resolve,0));
  rasterImportCheck(control);
  if(globalThis.GeoMineRasterImport)GeoMineRasterImport.release(d._tiff);
  confereCRSraster(d, fname);
  const r={id:rid++, name:fname.replace(/\.[^.]+$/,''), d,
    src:{file:fname, size:fsize, at:new Date().toISOString()},
    style:{mode:'hipso_hs', opacity:0.8}, visible:true, overlay:null,
    // The original always supplies native tiles. Import may hold that grid
    // until its durable source and workspace have been committed.
    demHD:true, dispFull:true};
  if(control?.deferNative)Object.defineProperty(r,'_nativeCopyPending',{value:true,writable:true,configurable:true});
  /* Mantém a fonte intacta nesta sessão. Com a pasta configurada, o
     salvamento automático copia este GeoTIFF sem reamostrar seus pixels. */
  if(f instanceof Blob){
    if(typeof projectNativeBindRasterSource==='function')projectNativeBindRasterSource(r,f);
    else r._projectSourceRaw=f;
  }
  S.rasters.push(r); renderRaster(r); refreshUI();
  if(!control?.deferNative)projectAutoSaveRaster(r);
  const b=r.overlay&&r.overlay.getBounds?r.overlay.getBounds():null;
  if(b) safeFit(b);
  toast('Raster '+r.name+': original '+d._W0+'×'+d._H0+' células · resolução nativa por tiles');
  return r;
}

/* ---------- Modal de propriedades do raster ---------- */
let rasCur=null,rasClassDraft=null,rasClassDraftOk=true;
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
function rasClassAttr(v){
  return String(v??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function rasClassFmt(v){
  const n=rasterClassNumber(v);
  return Number.isFinite(n)?n.toLocaleString('pt-BR',{maximumFractionDigits:6}):'';
}
function rasClassRangeLabel(c,r){
  const un=rasUnidadeValor(r||rasCur),suf=un?' '+un:'';
  return `${rasClassFmt(c&&c.min)} – ${rasClassFmt(c&&c.max)}${suf}`;
}
function rasClassLabelPareceAuto(c){
  if(c&&typeof c._autoLabel==='boolean')return c._autoLabel;
  const label=String(c&&c.label||'').trim();if(!label)return true;
  const nums=label.match(/[-+]?\d+(?:[.,]\d+)?/g)||[];
  if(nums.length<2)return false;
  const a=Number(nums[0].replace(',','.')),b=Number(nums[1].replace(',','.')),
    mn=rasterClassNumber(c&&c.min),mx=rasterClassNumber(c&&c.max),
    tol=Math.max(1,Math.abs(mn),Math.abs(mx))*1e-6;
  return Number.isFinite(a)&&Number.isFinite(b)&&Number.isFinite(mn)&&Number.isFinite(mx)&&
    Math.abs(a-mn)<=tol&&Math.abs(b-mx)<=tol;
}
function rasClassClone(classes){
  return (Array.isArray(classes)?classes:[]).map(c=>{
    const q={...(c||{})},mn=rasterClassNumber(c&&c.min),mx=rasterClassNumber(c&&c.max);
    if(Number.isFinite(mn))q.min=mn;if(Number.isFinite(mx))q.max=mx;
    q._autoLabel=rasClassLabelPareceAuto(c);return q;
  });
}
function rasClassValidate(classes){
  const cs=Array.isArray(classes)?classes:[];
  if(!cs.length)return {ok:false,msg:'Gere pelo menos duas faixas antes de aplicar o estilo.'};
  const gaps=[];
  for(let i=0;i<cs.length;i++){
    const mn=rasterClassNumber(cs[i]&&cs[i].min),mx=rasterClassNumber(cs[i]&&cs[i].max);
    if(!Number.isFinite(mn)||!Number.isFinite(mx))
      return {ok:false,row:i,msg:`Faixa ${i+1}: informe os limites inicial e final.`};
    if(!(mx>mn))return {ok:false,row:i,msg:`Faixa ${i+1}: o final deve ser maior que o inicial.`};
    if(i){
      const ant=rasterClassNumber(cs[i-1]&&cs[i-1].max),
        tol=Math.max(1,Math.abs(ant),Math.abs(mn))*1e-10;
      if(mn<ant-tol)return {ok:false,row:i,msg:`Faixas ${i} e ${i+1}: há sobreposição (${rasClassFmt(mn)} começa antes de ${rasClassFmt(ant)}).`};
      if(mn>ant+tol)gaps.push(`${rasClassFmt(ant)}–${rasClassFmt(mn)}`);
    }
  }
  return {ok:true,warn:gaps.length?`Intervalo sem classe: ${gaps.join(', ')}. Esses valores aparecerão em cinza.`:''};
}
function rasClassShowValidation(res){
  rasClassDraftOk=!!(res&&res.ok);
  const msg=document.getElementById('rasClassMsg');if(!msg)return;
  msg.style.display='block';msg.classList.toggle('err',!rasClassDraftOk);
  msg.classList.toggle('warn',!!(rasClassDraftOk&&res.warn));
  msg.classList.toggle('ok',!!(rasClassDraftOk&&!res.warn));
  msg.textContent=!rasClassDraftOk?res.msg:(res.warn||
    'Faixas válidas. No limite compartilhado, o valor exato pertence à faixa anterior.');
  document.querySelectorAll('#rasClassList [data-rrow]').forEach((row,i)=>
    row.classList.toggle('invalid',!rasClassDraftOk&&i===res.row));
}
function rasClassCommitDraft(report){
  if(!rasCur||!Array.isArray(rasClassDraft))return false;
  const res=rasClassValidate(rasClassDraft);rasClassShowValidation(res);
  if(!res.ok){
    if(report){toast(res.msg);const row=document.querySelector(`#rasClassList [data-rrow="${res.row}"] input[type="number"]`);if(row){row.focus();row.reportValidity&&row.reportValidity();}}
    return false;
  }
  /* Encostes que diferem só por ruído numérico viram exatamente o mesmo
     corte; os demais limites continuam independentes e não são reordenados. */
  for(let i=1;i<rasClassDraft.length;i++){
    const ant=+rasClassDraft[i-1].max,mn=+rasClassDraft[i].min,
      tol=Math.max(1,Math.abs(ant),Math.abs(mn))*1e-10;
    if(Math.abs(mn-ant)<=tol)rasClassDraft[i].min=ant;
  }
  rasCur.style=rasCur.style||{};
  rasCur.style.classes=rasClassDraft.map(c=>({...c,min:+c.min,max:+c.max}));
  rasCur._urlHi=null;rasCur._hiKey=null;
  return true;
}
function rasConverteDeclividade(r,destino){
  if(!r||!rasEhDeclividade(r))return;
  const origem=r.unit==='pct'?'pct':'deg';
  if(origem===destino)return;
  const convValor=v=>destino==='pct'
    ?Math.tan(v*Math.PI/180)*100
    :Math.atan(v/100)*180/Math.PI;
  const conv=g=>{
    if(!g||!g.z)return;
    for(let i=0;i<g.z.length;i++){
      const v=g.z[i]; if(!Number.isFinite(v))continue;
      g.z[i]=convValor(v);
    }
  };
  const cs=(r.style&&r.style.classes)||[],preserva=r.style&&r.style.mode==='classes';
  const auto=preserva?cs.map(rasClassLabelPareceAuto):[];
  conv(r.d);
  if(r.d&&r.d._full&&r.d._full!==r.d)conv(r.d._full);
  r.quantity='slope';r.unit=destino;
  if(r.d)r.d._sourceStats=null;
  r._st=null;r._stFull=null;r._geomInfo=null;r._url=null;r._urlHi=null;
  /* Faixas manuais são convertidas junto com os pixels. Assim uma troca
     ° ↔ % não destrói os cortes escolhidos pelo usuário. */
  const n=cs.length;
  if(n&&preserva){
    cs.forEach((c,i)=>{
      const mn=rasterClassNumber(c.min),mx=rasterClassNumber(c.max);
      if(Number.isFinite(mn))c.min=convValor(mn);
      if(Number.isFinite(mx))c.max=convValor(mx);
      c._autoLabel=auto[i];if(auto[i])c.label=rasClassRangeLabel(c,r);
    });
    rasClassDraft=rasClassClone(cs);
    document.getElementById('rasClassN').value=n;
    rasClassListRender();
  }else if(n){
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
  const mode=(document.getElementById('rasMode')||{}).value||rasCur.style.mode,
    porFaixa=mode==='classes';
  if(!porFaixa){
    const msg=document.getElementById('rasClassMsg');if(msg)msg.style.display='none';
    const cs=rasCur.style.classes||[];
    box.innerHTML=cs.length?cs.map((c,i)=>`<div class="ras-class-simple">`+
      `<input type="color" data-rci="${i}" value="${rasClassAttr(c.color||'#777777')}">`+
      `<input type="text" data-rli="${i}" value="${rasClassAttr(c.label||String(c.value??''))}"></div>`).join(''):
      '<div class="hint">Gere classes para criar a legenda temática.</div>';
    box.querySelectorAll('[data-rci]').forEach(e=>e.oninput=()=>{cs[+e.dataset.rci].color=e.value;});
    box.querySelectorAll('[data-rli]').forEach(e=>e.onchange=()=>{cs[+e.dataset.rli].label=e.value;});
    return;
  }
  if(!Array.isArray(rasClassDraft))rasClassDraft=rasClassClone(rasCur.style.classes);
  const cs=rasClassDraft;
  box.innerHTML=cs.length?'<div class="ras-class-head"><span></span><span>Inicial</span><span></span><span>Final</span></div>'+cs.map((c,i)=>{
    if(typeof c._autoLabel!=='boolean')c._autoLabel=rasClassLabelPareceAuto(c);
    if(c._autoLabel&&!c.label)c.label=rasClassRangeLabel(c,rasCur);
    return `<div class="ras-class-row" data-rrow="${i}">`+
      `<input type="color" data-rci="${i}" value="${rasClassAttr(c.color||'#777777')}" title="Cor da faixa ${i+1}" aria-label="Cor da faixa ${i+1}">`+
      `<input type="number" step="any" inputmode="decimal" data-rmin="${i}" value="${rasClassAttr(c.min)}" aria-label="Limite inicial da faixa ${i+1}">`+
      `<span class="ras-class-sep">–</span>`+
      `<input type="number" step="any" inputmode="decimal" data-rmax="${i}" value="${rasClassAttr(c.max)}" aria-label="Limite final da faixa ${i+1}">`+
      `<input class="ras-class-label" type="text" data-rli="${i}" value="${rasClassAttr(c.label||rasClassRangeLabel(c,rasCur))}" placeholder="Rótulo da legenda" aria-label="Rótulo da faixa ${i+1}"></div>`;
  }).join(''):'<div class="hint">Gere classes para criar a legenda temática.</div>';
  const mudaLimite=e=>{
    const i=+(e.dataset.rmin??e.dataset.rmax),campo=e.dataset.rmin!==undefined?'min':'max',
      direto=e.valueAsNumber,n=Number.isFinite(direto)?direto:Number(String(e.value).replace(',','.'));
    cs[i][campo]=Number.isFinite(n)?n:NaN;
    e.setAttribute('aria-invalid',Number.isFinite(n)?'false':'true');
    if(cs[i]._autoLabel&&Number.isFinite(n)){
      cs[i].label=rasClassRangeLabel(cs[i],rasCur);
      const li=box.querySelector(`[data-rli="${i}"]`);if(li)li.value=cs[i].label;
    }
    rasClassCommitDraft(false);
  };
  box.querySelectorAll('[data-rmin],[data-rmax]').forEach(e=>{
    e.addEventListener('input',()=>mudaLimite(e));e.addEventListener('change',()=>mudaLimite(e));
  });
  box.querySelectorAll('[data-rci]').forEach(e=>e.oninput=()=>{
    cs[+e.dataset.rci].color=e.value;rasClassCommitDraft(false);
  });
  box.querySelectorAll('[data-rli]').forEach(e=>e.oninput=()=>{
    const c=cs[+e.dataset.rli],v=e.value.trim();
    c._autoLabel=!v;c.label=v||rasClassRangeLabel(c,rasCur);
    if(!v)e.value=c.label;rasClassCommitDraft(false);
  });
  rasClassShowValidation(rasClassValidate(cs));
}
function rasGerarClasses(){
  if(!rasCur)return;
  const N=Math.max(2,Math.min(15,+document.getElementById('rasClassN').value||7));
  const st=rasCur._st||(rasCur._st=rasterStats(rasCur.d)),cs=[];
  if(!st||!Number.isFinite(st.mn)||!Number.isFinite(st.mx)||!(st.mx>st.mn)){
    toast('Não foi possível gerar faixas: o raster não possui variação de valores.');return;
  }
  const step=(st.mx-st.mn)/N;
  for(let i=0;i<N;i++){
    const mn=st.mn+i*step,mx=i===N-1?st.mx:st.mn+(i+1)*step;
    const ci=Math.round(i*(RAS_CLASS_COL.length-1)/Math.max(1,N-1));
    const c={min:mn,max:mx,color:RAS_CLASS_COL[ci],vis:true,_autoLabel:true};
    c.label=rasClassRangeLabel(c,rasCur);cs.push(c);
  }
  rasCur.style.classes=cs;rasCur.style.mode='classes';
  rasClassDraft=rasClassClone(cs);rasClassDraftOk=true;
  document.getElementById('rasMode').value='classes';rasClassListRender();
  toast(`${N} classes geradas — os limites, nomes e cores podem ser editados`);
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
  if(r.style.mode==='classes'){
    rasClassDraft=rasClassClone(r.style.classes);
    rasClassDraftOk=rasClassValidate(rasClassDraft).ok;
  }else rasClassDraft=null;
  {const n=(r.style.classes||[]).length,inp=document.getElementById('rasClassN');
    if(inp&&n>=2&&n<=15)inp.value=n;}
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
  const tinTag=ehTIN?`<b style="color:#7fe0a8">▲ Superfície TIN</b> · ${((r.d.tin.tri.length/3)|0).toLocaleString('pt-BR')} triângulos · ${r.d.tin.xs.length.toLocaleString('pt-BR')} vértices — <button type="button" class="gm-prop-info" data-prop-help="" aria-label="Ajuda: Superfície TIN" aria-expanded="false"><span aria-hidden="true">i</span><span hidden>os cálculos amostram o triângulo exato; a grade abaixo é só a exibição 2D</span></button> · <button class="mini" id="btnTinExpObj" style="vertical-align:middle">⬇ Exportar OBJ</button><br>`:'';
  /* Resolução junto da origem: quem lê a faixa de cotas precisa saber em que
     pixel ela foi medida — 0,26 m e 30 m contam histórias diferentes sobre o
     mesmo terreno. Célula não quadrada aparece como "a × b" (csy perdido já
     deslocou MDT contra ortofoto antes) e grade reduzida é dita na hora. */
  const native=r.d._full||r.d,linked=!!r.d._img0||!rasterPrecisaFonteTela(native),nw=r.d._W0||native.nc,nh=r.d._H0||native.nr,
    _cs=r.d._bb?(r.d._bb[2]-r.d._bb[0])/nw:native.cs,_csy=r.d._bb?(r.d._bb[3]-r.d._bb[1])/nh:(native.csy||native.cs),
    _n=v=>(+v).toLocaleString('pt-BR',{maximumFractionDigits:3}),
    _cel=Math.abs(_cs-_csy)<1e-4?`${_n(_cs)} m`:`${_n(_cs)} × ${_n(_csy)} m`,
    _resTxt=`<b>${nw}×${nh}</b> · <b>${_cel}</b>/célula`+(linked?' (nativa; sem suavização)':' <span style="color:var(--amber)">(prévia; arquivo original indisponível)</span>');
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
  rasSyncResolutionControls(r);
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
  window.GeoMineNativeRasterPanel?.refresh(r);
  const d=r.d, el=document.getElementById('rasRes'); if(!el) return;
  const cel=(dd)=>(Number.isFinite(+dd?.cs)
    ?(+dd.cs).toLocaleString('pt-BR',{maximumFractionDigits:2}):'—')+' m/célula';
  if(r._nativeCopyPending){
    const p=window.GeoMineOriginalSources?.persistence?.(r,'raster'),
      percent=p?.total>0?Math.min(100,Math.floor(100*p.loaded/p.total)):0;
    el.innerHTML=`Tela leve: ${d.nc}×${d.nr} · ${cel(d)}<br>`+
      `<b style="color:var(--amber)">Preparando o original no iPad${percent?' — '+percent+'%':''}.</b> `+
      'A prévia permanece visível e os tiles nativos entram automaticamente ao terminar.';
    return;
  }
  if(!rasterPrecisaFonteTela(d)&&!d._full){
    el.innerHTML=`Grade <b>nativa</b> ${d.nc}×${d.nr} · ${cel(d)} — nada foi reamostrado.`;
  } else if(d._full){
    el.innerHTML=`Tela: ${d.nc}×${d.nr} · ${cel(d)} (${d.previewMethod==='sampled'?'prévia amostrada':'média'} ÷${d.resampled})<br>`+
      `Produto: <b>nativa ${d._full.nc}×${d._full.nr}</b> · ${cel(d._full)} — <b>carregada</b> ✔`;
  } else {
    const W0=Number.isFinite(+d._W0)&&+d._W0>0?+d._W0:
      (Array.isArray(d.srcDims)&&Number.isFinite(+d.srcDims[0])?+d.srcDims[0]:null);
    const H0=Number.isFinite(+d._H0)&&+d._H0>0?+d._H0:
      (Array.isArray(d.srcDims)&&Number.isFinite(+d.srcDims[1])?+d.srcDims[1]:null);
    let cs0=Number.isFinite(+d.cs)?+d.cs/Math.max(1,+d.resampled||1):NaN;
    if(W0&&d._bb&&Number.isFinite(d._bb[2]-d._bb[0]))cs0=(d._bb[2]-d._bb[0])/W0;
    const fonte=!!d._img0;
    el.innerHTML=`Tela leve: ${d.nc}×${d.nr} · ${cel(d)} (${d.previewMethod==='sampled'?'prévia amostrada':'média'} ÷${d.resampled})<br>`+
      (W0&&H0
        ?`Original: <b>${W0}×${H0}</b> · ${Number.isFinite(cs0)?cs0.toFixed(2):'—'} m/célula — `+
          (fonte?`<b style="color:var(--ok)">arquivo vinculado</b>${r.demHD
            ?(demTilesUsingFallback(r)?' · prévia temporária em tiles com falha':' · tiles do original conforme o zoom'):''}`:
            'arquivo ainda não vinculado'+((r.demHD||r.dispFull)?' · resolução original selecionada, aguardando o GeoTIFF':''))
        :`Original: <b>grade nativa ainda não vinculada</b> — indique o GeoTIFF`);
  }
}
/* Atualiza estes controles a cada abertura/troca de raster. Antes a
   inicializacao acontecia apenas no boot, com rasCur=null, e o HD ficava
   desabilitado permanentemente ou herdava o estado da camada anterior. */
function rasSyncResolutionControls(r){
  if(!r||!r.d)return;
  const d=r.d,mono=!!rasterGradeOriginalCanvas(r),fonte=!!d._img0;
  const cDF=document.getElementById('rasDispFull');
  if(cDF){cDF.checked=!!r.dispFull;cDF.disabled=false;}
  const cHD=document.getElementById('rasDemHD');
  if(cHD){cHD.checked=!!r.demHD;cHD.disabled=false;}
  const inf=document.getElementById('rasDemHDInfo');
  if(inf){
    if(r._nativeCopyPending)inf.innerHTML='<b style="color:var(--amber)">Preparando a cópia local do GeoTIFF.</b> <button type="button" class="gm-prop-info" data-prop-help="" aria-label="Ajuda: Original do MDT" aria-expanded="false"><span aria-hidden="true">i</span><span hidden>A prévia fica visível; a resolução nativa será ativada automaticamente ao concluir.</span></button>';
    else if(fonte)inf.innerHTML=r.demHD
      ?(demTilesUsingFallback(r)
        ?'<b style="color:var(--amber)">Prévia temporária:</b> houve falha na leitura de alguns tiles. <button type="button" class="gm-prop-info" data-prop-help="" aria-label="Ajuda: Original do MDT" aria-expanded="false"><span aria-hidden="true">i</span><span hidden>A resolução original continua selecionada. Use “Tentar novamente”; se a falha persistir, clique no nome do arquivo de origem para religar o GeoTIFF.</span></button>'
        :'<b style="color:var(--ok)">Ativo:</b> <button type="button" class="gm-prop-info" data-prop-help="" aria-label="Ajuda: Original do MDT" aria-expanded="false"><span aria-hidden="true">i</span><span hidden>o GeoTIFF original é relido por janela conforme o zoom.</span></button>')
      :'Arquivo original disponível. <button type="button" class="gm-prop-info" data-prop-help="" aria-label="Ajuda: Original do MDT" aria-expanded="false"><span aria-hidden="true">i</span><span hidden>Ative para reler cada janela na densidade do zoom.</span></button>';
    else if(mono)inf.innerHTML='A grade original já está em memória. <button type="button" class="gm-prop-info" data-prop-help="" aria-label="Ajuda: Original do MDT" aria-expanded="false"><span aria-hidden="true">i</span><span hidden>Para usar tiles, marque a opção e selecione o GeoTIFF desta camada.</span></button>';
    else inf.innerHTML=(r.demHD||r.dispFull)
      ?'<b style="color:var(--amber)">Resolução original selecionada, aguardando o GeoTIFF.</b> O mapa mostra a prévia. <button type="button" class="gm-prop-info" data-prop-help="" aria-label="Ajuda: Original do MDT" aria-expanded="false"><span aria-hidden="true">i</span><span hidden>Use o botão acima para selecionar o original ou autorize a pasta do projeto e reabra o .ccmgis.</span></button>'
      :'<b>Arquivo original não vinculado.</b> <button type="button" class="gm-prop-info" data-prop-help="" aria-label="Ajuda: Original do MDT" aria-expanded="false"><span aria-hidden="true">i</span><span hidden>Marque a opção para selecionar o GeoTIFF desta camada.</span></button>';
  }
  const b=document.getElementById('rasLoadFull');
  if(b){
    b.disabled=!!r._nativeCopyPending;
    b.innerHTML=r._nativeCopyPending?'Guardando o original no iPad…':fonte?
      (demTilesUsingFallback(r)?'↻ Tentar novamente em resolução original':'✓ Mostrar o arquivo original em alta resolução'):
      (mono?'✓ Mostrar os pixels originais':'⤓ Selecionar o GeoTIFF original e mostrar');
  }
  const t=document.getElementById('rasTeto');
  if(t)t.innerHTML=`Canvas nativo nesta máquina: até <b>${(DISP_MAX_CELLS/1e6).toFixed(0)} M células</b>. `+
    'Acima disso o GeoMine usa tiles do original, sem reduzir silenciosamente por média.';
}
/* O botão de propriedades é um gesto direto do usuário. Se a grade plena não
   estiver mais em memória, abre imediatamente o seletor do sistema; cancelar
   simplesmente devolve false e preserva integralmente a camada atual. */
function rasterNeedsStableLocalCopy(){
  const n=typeof navigator==='object'?navigator:{};
  return /iPad|iPhone|iPod/i.test(n.userAgent||'')||
    (/Mac/i.test((n.platform||'')+' '+(n.userAgent||''))&&Number(n.maxTouchPoints)>1);
}
const rasNativeSelections=new WeakMap();
function rasEscolherNativoAgora(r,options={}){
  if(!r||!r.d||options.signal?.aborted)return Promise.resolve(false);
  const pending=rasNativeSelections.get(r);
  if(pending?.current())return pending.promise;
  pending?.cancel();
  const projeto=S.projectId,grade=r.d,geracao=window.GeoMineSessionAutosave?.state?.generation,
    conta=window.GeoMineCloudProvider?.user?.uid;
  const controller=new AbortController();
  const mesmoProjeto=()=>S.projectId===projeto&&window.GeoMineSessionAutosave?.state?.generation===geracao&&
    window.GeoMineCloudProvider?.user?.uid===conta&&(S.rasters||[]).includes(r);
  const vigente=()=>!controller.signal.aborted&&mesmoProjeto()&&r.d===grade&&(!options.isCurrent||options.isCurrent())&&
    (!job.loading||(S._rasterImportController===controller&&!S._loadCancel));
  let committed=false;
  const abort=()=>{
    if(committed)return;
    controller.abort();
    if(job.loading&&mesmoProjeto()&&rasNativeSelections.get(r)===job)hideLoad();
    job.loading=false;
  };
  options.signal?.addEventListener('abort',abort,{once:true});
  const job={current:()=>committed?mesmoProjeto():vigente(),cancel:abort,promise:null,loading:false};
  let inp=null;
  async function ler(file,handle){
    if(!file||!vigente())return false;
    const sources=window.GeoMineOriginalSources,
      cacheFirst=!handle&&rasterNeedsStableLocalCopy();
    if(cacheFirst){
      r._nativeCopyPending=true;
      // If an earlier direct attempt left a tile layer alive, retire it before
      // the sequential provider copy starts. The saved preview stays visible.
      try{syncDemTiles(r);rasResInfo();rasSyncResolutionControls(r);}catch(_){}
    }
    try{
      await window.GeoMineImportRecovery?.before({signal:controller.signal});
      if(!vigente())return false;
      if(S._rasterImportController&&S._rasterImportController!==controller)S._rasterImportController.abort();
      S._rasterImportController=controller;S._loadCancel=false;
      job.loading=true;
      if(!await GeoMineImportHandoff.beforeRead({ownerId:'rasModal',message:'Conferindo o MDT original…',current:vigente})||!vigente())return false;
      const ok=await religaFonte(r,file,{isCurrent:vigente,signal:controller.signal});
      if(!ok||!mesmoProjeto())return false;
      committed=true;
      if(S._rasterImportController===controller)S._rasterImportController=null;
      if(job.loading&&rasNativeSelections.get(r)===job)hideLoad();
      job.loading=false;
      // The native link is already validated. On iPad a file-input File can
      // be a Google Drive/iCloud proxy: persist it sequentially, then re-open
      // the verified OPFS copy and attach THAT source before enabling tiles.
      let remembered=false;
      try{
        if(handle){
          remembered=await lembraFonte(r,handle);
        }else if(typeof sources?.rememberFile==='function'){
          remembered=await sources.rememberFile(r,'raster',file);
        }
        if(cacheFirst&&remembered&&mesmoProjeto()&&typeof sources?.resolve==='function'){
          const local=await sources.resolve(r,'raster');
          if(local?.file&&local.file!==file&&mesmoProjeto()){
            const rebound=await projectAttachNativeRaster(r,local.file,{original:local,isCurrent:mesmoProjeto});
            if(!rebound)console.warn('Cópia local concluída, mas a fonte nativa não pôde ser reaberta nesta sessão.');
          }
        }
      }catch(e){console.warn('Local do MDT disponível apenas nesta sessão:',e);}
      if(cacheFirst)delete r._nativeCopyPending;
      if(mesmoProjeto()){
        try{renderRaster(r,{sourceOnly:true});syncDemTiles(r);zApply();rasResInfo();rasSyncResolutionControls(r);}catch(e){console.warn('Ativação dos tiles nativos:',e);}
      }
      return mesmoProjeto()&&projectRasterReady(r);
    }catch(e){
      if(e?.name!=='AbortError'&&mesmoProjeto())toast('Falha ao ler o GeoTIFF: '+(e?.message||e));
      return false;
    }finally{
      if(cacheFirst&&r._nativeCopyPending){
        delete r._nativeCopyPending;
        if(mesmoProjeto())try{renderRaster(r,{sourceOnly:true});syncDemTiles(r);rasResInfo();rasSyncResolutionControls(r);}catch(_){}
      }
      if(S._rasterImportController===controller){
        S._rasterImportController=null;
        if(job.loading&&mesmoProjeto()&&rasNativeSelections.get(r)===job&&!controller.signal.aborted)hideLoad();
      }
      job.loading=false;
    }
  }
  async function escolher(){
    if(!vigente())return false;
    if(window.showOpenFilePicker&&fsApiOK()){
      let pickerReturned=false;
      try{
        const opt={id:'alagis-grade-nativa',multiple:false,
          types:[{description:'GeoTIFF nativo',accept:{'image/tiff':['.tif','.tiff']}}]};
        if(S._lastDir)opt.startIn=S._lastDir;
        const hs=await window.showOpenFilePicker(opt);
        pickerReturned=true;
        if(!hs?.[0]||!vigente())return false;
        const h=hs[0];lembraLocal(h);
        const file=await h.getFile();
        return vigente()?await ler(file,h):false;
      }catch(e){
        if(e?.name==='AbortError'||!vigente())return false;
        // file:// may block this API. Only that restriction falls back to
        // an input; a failed read must not open another picker unexpectedly.
        if(e?.name!=='SecurityError'||pickerReturned){
          toast('Não foi possível abrir a grade nativa: '+(e?.message||e));return false;
        }
      }
    }
    if(!vigente())return false;
    return new Promise(resolve=>{
      inp=document.createElement('input');
      inp.type='file';inp.accept='.tif,.tiff,application/octet-stream';inp.style.display='none';
      document.body.appendChild(inp);
      let terminou=false,lendo=false;
      const cancelou=()=>fim(false);
      const fim=v=>{
        if(terminou)return;terminou=true;
        controller.signal.removeEventListener('abort',cancelou);
        try{inp.remove();}catch(_){}resolve(!!v);
      };
      controller.signal.addEventListener('abort',cancelou,{once:true});
      inp.onchange=async()=>{
        if(terminou||lendo)return;
        lendo=true;
        const f=inp.files&&inp.files[0];
        if(!f||!vigente())return fim(false);
        fim(await ler(f,null));
      };
      inp.addEventListener('cancel',abort,{once:true});
      try{abrirSeletorGeoTIFF(inp);}catch(e){
        if(mesmoProjeto())toast('Não foi possível abrir o seletor: '+(e?.message||e));fim(false);
      }
    });
  }
  // Start now so the OS picker retains the user's click activation.
  job.promise=escolher().finally(()=>{
    options.signal?.removeEventListener('abort',abort);
    try{inp?.remove();}catch(_){}
    if(rasNativeSelections.get(r)===job)rasNativeSelections.delete(r);
  });
  rasNativeSelections.set(r,job);
  return job.promise;
}
function bindRasModal(){
  const close=()=>{document.getElementById('rasModal').classList.remove('on');rasClassDraft=null;rasClassDraftOk=true;};
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
  if(rmd)rmd.onchange=()=>{
    if(rasCur){
      rasCur.style=rasCur.style||{};rasCur.style.mode=rmd.value;
      if(rmd.value==='classes'&&!Array.isArray(rasClassDraft))
        rasClassDraft=rasClassClone(rasCur.style.classes);
    }
    rasClassListRender();rasSolidaSync();
  };
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
          /* Usa o mesmo importador genérico do MDT. No Android isto abre
             Arquivos/Drive, nunca Fotos/Câmera; GeoTIFF RGB é posicionado
             automaticamente e PNG/JPG continua seguindo pelos cantos. */
          const fi=document.getElementById('fileIn');
          document.getElementById('rasModal').classList.remove('on');
          try{ switchView('map'); }catch(e){}
          try{ syncSideSecs(); }catch(e){}
          if(fi)fi.click();
          toast('Escolha a ortofoto em Arquivos/Drive. GeoTIFF é posicionado automaticamente; PNG/JPG usa os cantos.');
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
    const r=rasCur;
    let d=r.d;
    if(rasterPrecisaFonteTela(d) && !d._full && !d._img0){
      /* Não mostra primeiro uma mensagem de erro: abre o Finder/seletor. */
      if(!await rasEscolherNativoAgora(r))return;
      d=r.d;
    }
    r.demHD=true;r.dispFull=true;renderRaster(r);syncDemTiles(r);rasResInfo();rasSyncResolutionControls(r);
    toast('Arquivo original vinculado; exibição nativa por tiles.');
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
        rasCur._geomInfo=null; rasCur._st=null;rasCur._stFull=null;
        rasCur._url=null; rasCur._urlHi=null; // invalida caches
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
    const r=rasCur,project=S.projectId;
    const vigente=()=>S.projectId===project&&(S.rasters||[]).includes(r);
    r.dispFull=cDF.checked;
    if(cDF.checked){
      let d=r.d;
      if(rasterPrecisaFonteTela(d)&&!d._img0&&!d._full){
        if(!await rasEscolherNativoAgora(r)){
          r.dispFull=false;if(rasCur===r)rasSyncResolutionControls(r);return;
        }
        if(!vigente())return;
        d=r.d;
      }
      const [W,H]=rasterDimensoesOriginais(d),cabe=W*H<=DISP_MAX_CELLS&&W<=16000&&H<=16000;
      if(!d._full&&d._img0&&rasterPrecisaFonteTela(d)&&cabe){
        showLoad('Lendo a grade original para o desenho…');
        try{await demFull(d);}catch(e){}finally{hideLoad();}
      }
      if(!vigente())return;
      const mono=rasterGradeOriginalCanvas(r);
      r.demHD=!mono&&!!d._img0;
      if(!mono&&!r.demHD){
        r.dispFull=false;if(rasCur===r)rasSyncResolutionControls(r);
        toast('A grade original é grande demais para o canvas e não pode ser lida por tiles sem o GeoTIFF.');return;
      }
      toast(mono
        ?`Mapa em resolução original (${(mono.nc*mono.nr/1e6).toFixed(1)} M células)`
        :`Mapa em resolução original por tiles (${W}×${H})`);
    }else{
      r.demHD=false;
    }
    try{renderRaster(r);syncDemTiles(r);zApply();if(rasCur===r){rasResInfo();rasSyncResolutionControls(r);}}
    catch(e){toast('Falha ao desenhar: '+e.message);}
  };
  { const cHD=document.getElementById('rasDemHD');
    if(cHD){
      cHD.onchange=async()=>{
        if(!rasCur) return;
        const r=rasCur,on=cHD.checked,project=S.projectId;
        if(on&&!r.d._img0){
          cHD.checked=false;
          if(!await rasEscolherNativoAgora(r)){
            if(rasCur===r)rasSyncResolutionControls(r);return;
          }
          if(S.projectId!==project||!(S.rasters||[]).includes(r))return;
          if(!r.d._img0){
            if(rasCur===r)rasSyncResolutionControls(r);
            toast('Não foi possível vincular o GeoTIFF para leitura por tiles.');return;
          }
        }
        r.demHD=on;
        if(on)r.dispFull=true;
        else if(!rasterGradeOriginalCanvas(r))r.dispFull=false;
        try{renderRaster(r);syncDemTiles(r);zApply();if(rasCur===r){rasResInfo();rasSyncResolutionControls(r);}}
        catch(e){toast('Falha ao ligar os tiles: '+(e&&e.message||e));}
        if(r.demHD){
          const p=rasterPrecisaFonteTela(r.d)?` (tela ${r.d.nc}×${r.d.nr} · nativo ${r.d._W0||'—'}×${r.d._H0||'—'})`:'';
          toast('Tiles em alta resolução ligados'+p);
        }
      };
    }
  }
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
    addLayer({sourceLayer:rasCur,name:rasCur.name+' — curvas '+iv+' m', gtype:'line', crs:S.workCRS,
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
    const novoModo=document.getElementById('rasMode').value;
    if(novoModo==='classes'&&!rasClassCommitDraft(true))return;
    rasCur.style.mode=novoModo;
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
    const VIVO='#rasMode,#rasOp,#rasSolidaCor,#rasTex3D,#rasTex3DCor,#rasSlopeUnit,[data-rci],[data-rli],[data-rmin],[data-rmax]';
    window.rasEstiloVivo=()=>{
      if(!rasCur) return;
      const md0=document.getElementById('rasMode');
      if(md0&&md0.value==='classes'&&(!rasClassDraftOk||!rasClassCommitDraft(false)))return;
      clearTimeout(t);
      t=setTimeout(()=>{
        if(!rasCur) return;
        const md=document.getElementById('rasMode'), op=document.getElementById('rasOp'),
              sc=document.getElementById('rasSolidaCor');
        if(md) rasCur.style.mode=md.value;
        if(op) rasCur.style.opacity=+op.value;
        if(sc) rasCur.style.solidColor=sc.value;
        rasCur._urlHi=null;rasCur._hiKey=null;
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
    const selected=rasCur,project=S.projectId,generation=window.GeoMineSessionAutosave?.state?.generation;
    const g=await hidroGrid(selected,'usar esta superfície como MDE do Hidro');
    if(rasCur!==selected||S.projectId!==project||window.GeoMineSessionAutosave?.state?.generation!==generation||!S.rasters.includes(selected))return;
    if(!g){ toast('MDE não definido — a superfície não possui uma grade utilizável'); return; }
    if(typeof hShadeOff==='function') hShadeOff(true);
    const d=rasCur.d;
    S.hidro.dem=g;
    window.GeoMineNativeFlood?.bindSource(selected,g);
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
          /* Os metadados pertenciam a outra grade/CRS. A rampa passa a usar
             os extremos efetivamente presentes na grade nativa reprojetada. */
          nd._sourceStats=rasterStats(nf);
        } else if(rasterPrecisaFonteTela(r.d)){
          toast('⚠ Reprojetado a partir da grade de tela — carregue a grade nativa antes de reprojetar para manter a resolução plena');
        }
        r.d=nd;r._st=null;r._stFull=null;r._url=null;r._urlHi=null;r._hiKey=null;
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
