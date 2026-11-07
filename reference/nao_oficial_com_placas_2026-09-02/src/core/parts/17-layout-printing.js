/* ============================================================================
   LAYOUT (SVG) — grade UTM, escala, norte, título
   ========================================================================== */
const PAPER={a4l:[297,210],a4p:[210,297],a3l:[420,297],a3p:[297,420]};

/* ---------- Signika embutida (para o SVG/PNG exportado manter a fonte) ---------- */
async function signikaCSS(){
  if(S._signikaCSS!==undefined) return S._signikaCSS;
  try{
    const css=await (await fetch('https://fonts.googleapis.com/css2?family=Signika:wght@400;600;700&display=swap')).text();
    // pegar apenas as faces "latin" (uma por peso)
    const faces=[...css.matchAll(/\/\* latin \*\/\s*(@font-face\s*{[^}]*})/g)].map(m=>m[1]);
    const out=[];
    for(const face of faces){
      const u=face.match(/url\((https:[^)]+\.woff2)\)/); if(!u) continue;
      const buf=await (await fetch(u[1])).arrayBuffer();
      const b=new Uint8Array(buf); let bin='';
      for(let i=0;i<b.length;i+=1024) bin+=String.fromCharCode(...b.subarray(i,i+1024));
      out.push(face.replace(u[1],'data:font/woff2;base64,'+btoa(bin)));
    }
    S._signikaCSS=out.join('\n');
  }catch(e){ console.warn('Signika indisponível p/ export:',e.message); S._signikaCSS=''; }
  return S._signikaCSS;
}

/* ---------- Captura do basemap (tiles Web Mercator) para o layout ----------
   Recebe extensão no CRS de trabalho; devolve {dataURL,bounds:[W,S,E,N] no CRS de trabalho}. */
const TILE_URLS={
  'Satélite (Google)': z=>`https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z=${z}`,
  'Híbrido (Google)':  z=>`https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z=${z}`,
  'Satélite (Esri)':   z=>`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/{y}/{x}`,
  'Ruas (OSM)':        z=>`https://a.tile.openstreetmap.org/${z}/{x}/{y}.png`,
  'Topográfico (OpenTopo)': z=>`https://a.tile.opentopomap.org/${z}/{x}/{y}.png`,
};
function lonlat2tile(lon,lat,z){ const n=Math.pow(2,z);
  const x=(lon+180)/360*n;
  const y=(1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*n;
  return [x,y]; }
function tile2lonlat(x,y,z){ const n=Math.pow(2,z);
  const lon=x/n*360-180;
  const lat=Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI;
  return [lon,lat]; }
async function captureBasemap(x0,y0,x1,y1,crs,targetPx){
  const base=S._base||'Satélite (Google)';
  const urlFn=TILE_URLS[base]; if(!urlFn) return null; // 'Sem fundo'
  // cache: evita rebaixar tiles a cada ajuste de legenda/símbolo com a mesma extensão
  const ck=[base,crs,x0.toFixed(1),y0.toFixed(1),x1.toFixed(1),y1.toFixed(1),Math.round(targetPx/64)].join('|');
  if(S._capCache && S._capCache.k===ck) return S._capCache.v;
  // extensão em WGS84 (amostrando os 4 cantos p/ cobrir distorção)
  const corners=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(p=>toWGS(crs,p[0],p[1]));
  const lons=corners.map(c=>c[0]), lats=corners.map(c=>c[1]);
  const W=Math.min(...lons), E=Math.max(...lons), Sl=Math.min(...lats), N=Math.max(...lats);
  // ---- escolha do zoom ----
  // 1) zoom "ideal" pela resolução pedida (targetPx px de largura)
  let zIdeal=3;
  for(; zIdeal<20; zIdeal++){ const [tx0]=lonlat2tile(W,N,zIdeal), [tx1]=lonlat2tile(E,N,zIdeal);
    if((tx1-tx0)*256>=targetPx) break; }
  zIdeal=Math.min(zIdeal,19);
  // 2) desce o zoom até caber no orçamento de tiles — não desiste da captura.
  //    (antes: abortava se passasse de 120 tiles, o que acontecia sempre no A4,
  //     porque a folha retrato é alta e a área coberta fica grande)
  const MAXTILES=400;
  let z=zIdeal, tX0,tY0,tX1,tY1,nX,nY;
  for(; z>=2; z--){
    const [a0,b0]=lonlat2tile(W,N,z), [a1,b1]=lonlat2tile(E,Sl,z);
    tX0=Math.floor(a0); tY0=Math.floor(b0); tX1=Math.floor(a1); tY1=Math.floor(b1);
    nX=tX1-tX0+1; nY=tY1-tY0+1;
    if(nX*nY<=MAXTILES) break;
  }
  if(!(nX*nY<=MAXTILES)){ toast('Área grande demais para o fundo de satélite'); return null; }
  if(z<zIdeal-1) toast(`Fundo de satélite em zoom ${z} (área extensa) — resolução menor`);
  const cv=document.createElement('canvas'); cv.width=nX*256; cv.height=nY*256;
  const ctx=cv.getContext('2d'); ctx.fillStyle='#e8e8e8'; ctx.fillRect(0,0,cv.width,cv.height);
  const jobs=[];
  for(let tx=tX0;tx<=tX1;tx++) for(let ty=tY0;ty<=tY1;ty++){
    const url=urlFn(z).replace('{x}',tx).replace('{y}',ty);
    jobs.push(new Promise(res=>{ const im=new Image(); im.crossOrigin='anonymous';
      im.onload=()=>{ ctx.drawImage(im,(tx-tX0)*256,(ty-tY0)*256); res(1); };
      im.onerror=()=>res(0); im.src=url; }));
  }
  showLoad(`Capturando satélite (${jobs.length} tiles, z${z})…`);
  await Promise.all(jobs); hideLoad();
  // recortar exatamente para a extensão WGS pedida
  const [px0,py0]=lonlat2tile(W,N,z), [px1,py1]=lonlat2tile(E,Sl,z);
  const cx=(px0-tX0)*256, cy=(py0-tY0)*256, cw=(px1-px0)*256, ch=(py1-py0)*256;
  const out=document.createElement('canvas'); out.width=Math.max(1,Math.round(cw)); out.height=Math.max(1,Math.round(ch));
  out.getContext('2d').drawImage(cv,cx,cy,cw,ch,0,0,out.width,out.height);
  let dataURL;
  try{ dataURL=out.toDataURL('image/jpeg',0.85); }
  catch(e){ toast('Provedor bloqueou a captura (CORS) — tente Esri ou OSM'); return null; }
  // bounds em WGS -> CRS de trabalho (usa retângulo; aproximação adequada em escala de planta)
  const sw=fromWGS(crs,W,Sl), ne=fromWGS(crs,E,N);
  const outObj={dataURL, b:[sw[0],sw[1],ne[0],ne[1]]};
  S._capCache={k:ck, v:outObj};
  return outObj;
}
/* Monta a lista hierárquica de itens da legenda (grupo → camada → classes visíveis) */
function legendItems(){
  const items=[];
  displayList().forEach(it=>{
    if(it.kind==='group'){
      const mem=groupMembers(it.g.id).filter(n=>n.o.visible!==false);
      if(mem.length) items.push({label:it.g.name, grp:true, indent:0});
      return;
    }
    const o=it.n.o;
    if(o.visible===false) return;
    const ind=o.groupId!=null?1:0;
    if(it.kind==='raster'){
      const rc=o.style&&o.style.classes;
      if(rc&&rc.length&&(o.style.mode==='cn'||o.style.mode==='slopeclass'||o.style.mode==='classes')){
        items.push({label:o.name||'Raster classificado',header:true,indent:ind});
        rc.forEach(c=>{if(c.vis===false)return;items.push({
          label:c.label||(c.value!=null?String(c.value):`${fmt(c.min)} – ${fmt(c.max)}`),
          color:c.color||'#777',stroke:c.color||'#777',kind:'poly',indent:ind+1,hatch:'solid'});});
      }else{
        /* Raster contínuo só entrava com o nome. Sem a faixa de valores a
           rampa de cores não significa nada: quem lê a prancha não sabe o que
           é verde e o que é marrom. Sai agora como cabeçalho + barra, no mesmo
           padrão que o raster classificado já usava. */
        let st=null; try{ st=o._st||(o._st=rasterStats(o.d)); }catch(e){}
        const rampa=loRampaRaster(o);
        const un=(typeof rasUnidadeValor==='function')?rasUnidadeValor(o):'';
        if(st&&isFinite(st.mn)&&isFinite(st.mx)&&st.mx>st.mn){
          items.push({label:o.name||'MDE',header:true,indent:ind});
          /* Quando a rampa está recortada no percentil 2–98, os extremos do
             raster ficam fora dela e são pintados com a cor da ponta. Marcar
             com ≤ e ≥ é o que diz a verdade sobre o que a cor significa. */
          /* Faixa larga (relevo) não precisa de decimal; faixa estreita
             (declividade em grau, índice 0–5) precisa. */
          const amp=st.mx-st.mn, arred=v=>(amp>=20?Math.round(v):v);
          const su=(un?' '+un:'');
          const ini=(st.cauda?'≤ ':'')+fmt(arred(st.mn))+su+' '+loT('mín');
          const fimv=(st.cauda?'≥ ':'')+fmt(arred(st.mx))+su+' '+loT('máx');
          items.push({label:ini+' · '+fimv,
            kind:'ras',ramp:rampa,indent:ind+1,
            cauda:!!st.cauda,mnAbs:st.mnAbs,mxAbs:st.mxAbs});
        }else items.push({label:o.name||'MDE',kind:'ras',ramp:rampa,indent:ind});
      }
      return;
    }
    if(it.kind==='img'){    items.push({label:o.name||'ortofoto', kind:'img', indent:ind}); return; }
    const L=o, sy=L.sym, kind=L.gtype==='polygon'?'poly':L.gtype==='line'?'line':'pt';
    const pcfg=(kind==='pt')? ptCfg(L) : null;
    const classed=(sy.mode==='grad'&&sy.classes.length)||(sy.mode==='cat'&&sy.cats.length);
    if(classed){
      items.push({label:L.name+' · '+sy.field, header:true, indent:ind});
      (sy.mode==='grad'?sy.classes:sy.cats).forEach(c=>{
        if(c.vis===false) return;
        items.push({label:sy.mode==='grad'?`${fmt(c.min)} – ${fmt(c.max)}`:String(c.value),
          color:c.color, stroke:(c.stroke||sy.stroke||c.color),
          kind, hatch:c.hatch??sy.hatch, hatchScale:c.hatchScale??sy.hatchScale??1, dash:c.dash??sy.dash, indent:ind+1,
          shape:(c.shape||(pcfg&&pcfg.shape)), weight:c.weight??sy.weight});
      });
    } else {
      items.push({label:L.name, color:sy.color, stroke:(sy.stroke||sy.color),
        kind, hatch:sy.hatch, hatchScale:sy.hatchScale??1, dash:sy.dash, indent:ind,
        shape:(pcfg&&pcfg.shape), weight:sy.weight});
    }
  });
  /* WMS não faz parte da pilha vetorial/raster local, mas é uma camada
     cartográfica real e precisa constar na legenda da prancha. */
  (S.wms||[]).forEach(w=>{
    if(!w || w.visible===false) return;
    items.push({label:w.name||w.layers||'Camada WMS',kind:'wms',indent:0,
      provider:w.provider||w.attribution||'WMS'});
  });
  return items;
}
function layoutWmsUrl(w,x0,y0,x1,y1,workCrs,pw,ph){
  /* O mapa Leaflet consulta WMS em Web Mercator. Fazemos o mesmo no Layout
     para maximizar a compatibilidade dos serviços públicos. */
  const sw=toWGS(workCrs,x0,y0), ne=toWGS(workCrs,x1,y1);
  const p0=L2.CRS.EPSG3857.project(L2.latLng(sw[1],sw[0]));
  const p1=L2.CRS.EPSG3857.project(L2.latLng(ne[1],ne[0]));
  const ver=String(w.version||'1.3.0'), v13=ver.indexOf('1.3')===0;
  const u=new URL(w.url,location.href);
  const p={SERVICE:'WMS',REQUEST:'GetMap',VERSION:ver,LAYERS:w.layers,STYLES:'',
    FORMAT:'image/png',TRANSPARENT:'TRUE',
    BBOX:[p0.x,p0.y,p1.x,p1.y].join(','),
    WIDTH:Math.max(64,Math.min(4096,Math.round(pw))),
    HEIGHT:Math.max(64,Math.min(4096,Math.round(ph)))};
  p[v13?'CRS':'SRS']='EPSG:3857';
  Object.entries(p).forEach(([k,v])=>u.searchParams.set(k,String(v)));
  return u.toString();
}
/* Arredonda a escala para um valor "cheio" de projeto (1:100, 1:250, 1:500, 1:1.000…).
   Sempre arredonda PARA CIMA, para que a extensão pedida caiba na figura. */
function niceScale(raw){
  if(!isFinite(raw) || raw<=0) return 1000;
  const MANT=[1,1.25,1.5,2,2.5,3,4,5,6,7.5,8,10];
  const dec=Math.pow(10, Math.floor(Math.log10(raw)));
  const m=raw/dec;
  for(const k of MANT) if(m<=k+1e-9) return Math.round(k*dec);
  return Math.round(10*dec);
}

/* A prévia da ortofoto é salva já reamostrada para Web Mercator, porque é esse
   o plano em que o Leaflet a exibe. Seus pixels, portanto, NÃO ocupam mais o
   retângulo UTM original de `I.b`: eles ocupam `I._llbounds`. Usar `I.b` para
   recolocar essa PNG na prancha deslocava aparentemente todos os vetores.

   Devolvemos os quatro cantos reais no CRS da prancha. Quatro cantos (e não só
   SW/NE) preservam a pequena rotação entre a malha UTM e o Web Mercator. */
function layoutOrthoWarpInfo(I,crs){
  if(!I || !I._warpWM || !Array.isArray(I._llbounds) ||
     !Array.isArray(I._llbounds[0]) || !Array.isArray(I._llbounds[1])) return null;
  const south=+I._llbounds[0][0], west=+I._llbounds[0][1];
  const north=+I._llbounds[1][0], east=+I._llbounds[1][1];
  if(![south,west,north,east].every(Number.isFinite) || north<=south || east<=west) return null;
  const nw=fromWGS(crs,west,north), ne=fromWGS(crs,east,north);
  const sw=fromWGS(crs,west,south), se=fromWGS(crs,east,south);
  const pts=[nw,ne,sw,se];
  if(pts.some(p=>!p || !Number.isFinite(+p[0]) || !Number.isFinite(+p[1]))) return null;
  const xs=pts.map(p=>+p[0]), ys=pts.map(p=>+p[1]);
  return {nw,ne,sw,se,
    bounds:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)],
    ll:[[south,west],[north,east]]};
}
function layoutOrthoBoundsWork(I,crs){
  const w=layoutOrthoWarpInfo(I,crs);
  return w?w.bounds:(I&&I.b);
}

async function buildLayout(){
  if(typeof loBlobInvalida==='function') loBlobInvalida();
  /* modo PROPOSTA: não é uma planta — desenha as páginas A4 da proposta
     comercial e sai. O mapa dela é capturado à parte, pelo modo Figura. */
  if((S.loMode||'fig')==='prop'){ if(typeof propBuild==='function') propBuild(); return; }
  /* O instantâneo da prancha só governa a árvore ENQUANTO o usuário está no
     Layout. Sliders e a abertura de projeto podem deixar um buildLayout
     atrasado na fila; executá-lo já no Mapa/3D restaurava silenciosamente a
     visibilidade antiga da prancha e trocava a cava recém-gerada por outra
     camada. Isso também explicava vetores que sumiam ao sair do Layout. */
  if(S._view==='layout'&&S.loFrozen&&!S._loRestoringVis&&
     typeof layoutFrozenApply==='function')layoutFrozenApply();
  const mode=S.loMode||'fig';
  const gvn=(id,d)=>{const e=document.getElementById(id); const v=e?+e.value:NaN; return isFinite(v)?v:d;};
  const gcb=(id,d)=>{const e=document.getElementById(id); return e?e.checked:d;};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  let paper=document.getElementById('loPaper').value;
  // modo A4·selo: papel escolhido no seletor próprio (guardado por prancha)
  if(mode==='a4'){
    const e=document.getElementById('loSeloPaper');
    // As abas têm formato fixo. Isso impede que o valor antigo salvo numa
    // prancha transforme o A3 novamente em retrato.
    if(S.loPranchaFormato==='a3') paper='a3l';
    else if(S.loPranchaFormato==='a4') paper='a4p';
    else paper=(e && PAPER[e.value])? e.value : 'a4p';
    if(e && e.value!==paper) e.value=paper;
  }
  let scale=Math.max(100,Math.min(100000000,+document.getElementById('loScale').value||5000));
  const gridRaw=document.getElementById('loGrid'); const gridV=gridRaw? +gridRaw.value : 500;
  let gridM=(isFinite(gridV) && gridV>0)? gradeDegrau(gridV) : (gridV===0? 0 : 500);   // 0 = grade desligada
  const scaleAuto=gcb('loScaleAuto',gcb('loFitW',true));
  const gridAuto=gcb('loGridAuto',true);
  const title=document.getElementById('loTitle').value;
  const sub=document.getElementById('loSub').value;
  const crs=S.workCRS; const isGeo=/4326|4674|4618/.test(crs);
  const wrap=document.getElementById('sheetWrap');

  // ---- fatores de escala visual ----
  const legSc =clamp(gvn('loLegSc',0.7),0.5,3);   // tamanho GERAL da legenda
  const legFS =clamp(gvn('loLegFS',1),0.7,3)*legSc;   // fonte da legenda
  const symFS =clamp(gvn('loSym',1),0.7,4)*legSc;     // símbolos da legenda
  const legColGap=clamp(gvn('loLegColGap',4),0,20);   // vão entre colunas (mm)
  const mapSym=clamp(gvn('loMapSym',1),0.7,4);  // pontos e linhas no mapa
  /* Legenda e coordenadas permanecem vinculadas. A escala gráfica possui um
     multiplicador próprio para mudar apenas números, unidade e denominador. */
  const txtFS=legFS;
  const barTextFS=clamp(gvn('loBarFS',1),0.5,3);
  const barLengthScale=clamp(gvn('loBarSc',0.7),0.3,1.5); // comprimento desejado da régua
  const cartFS=clamp(gvn('loCartFS',1),0.5,3)*txtFS;  // fonte da cartela (selo da figura)
  const titFS=clamp(gvn('loTitFS',1),0.4,1.6);        // multiplicador só do TÍTULO da cartela
  const showCoords=gcb('loCoords',true);
  /* Os quatro lados são independentes. Os padrões repetem a apresentação
     histórica do CCMGIS (topo, esquerda e direita); a borda inferior passa a
     ser uma opção explícita do usuário. */
  const coordTop   =showCoords&&gcb('loCoordTop',true);
  const coordBottom=showCoords&&gcb('loCoordBottom',false);
  const coordLeft  =showCoords&&gcb('loCoordLeft',true);
  const coordRight =showCoords&&gcb('loCoordRight',true);
  const showCart  =(mode==='a4')?true:gcb('loCart',true);
  const wantLeg   =gcb('loLegend',true);
  const legOut    =(mode!=='a4') && wantLeg && gcb('loLegOut',false);
  const legPosEl=document.getElementById('loLegPos'), legPosRaw=legPosEl?legPosEl.value:'auto';
  const legPos=['br','bl','tr','tl'].includes(legPosRaw)?legPosRaw:'br';

  // extensão em CRS de trabalho: vetores + rasters (MDE) + ortofoto
  let minE=Infinity,minN=Infinity,maxE=-Infinity,maxN=-Infinity;
  const grow=(e,n)=>{ if(e<minE)minE=e; if(n<minN)minN=n; if(e>maxE)maxE=e; if(n>maxN)maxN=n; };
  /* Vetor é conteúdo cartográfico completo: raster e ortofoto são opcionais.
     A rotina antiga aceitava somente `visible === true` e achatava a geometria
     apenas um nível; projetos antigos (visible indefinido) e MultiLineString /
     MultiPolygon mais aninhados ficavam sem extensão e o Layout dizia que não
     havia nada para plotar. Percorremos agora qualquer profundidade e seguimos
     a regra global do CCMGIS: só `visible === false` significa desligado. */
  const growGeom=(L,g)=>{
    if(!Array.isArray(g))return;
    if(g.length>=2&&isFinite(+g[0])&&isFinite(+g[1])){
      const c=reproj(L.crs,crs,+g[0],+g[1]);
      if(isFinite(c[0])&&isFinite(c[1]))grow(c[0],c[1]);
      return;
    }
    g.forEach(q=>growGeom(L,q));
  };
  S.layers.filter(L=>L.visible!==false).forEach(L=>(L.features||[]).forEach(f=>{
    if(!f.geom||!featureVisible(L,f))return;
    growGeom(L,f.geom);
  }));
  const rasVis=(S.rasters||[]).filter(r=>r.visible!==false);
  rasVis.forEach(r=>{ const b=rasterVisibleBounds(r); grow(b[0],b[1]); grow(b[2],b[3]); });
  const imgVis=(S.img && S.img.url && S.img.b && S.img.visible!==false);
  if(imgVis){ const b=layoutOrthoBoundsWork(S.img,crs); grow(b[0],b[1]); grow(b[2],b[3]); }
  if(!isFinite(minE)){ wrap.innerHTML='<div style="padding:40px;color:#888">Nada visível para plotar — ligue ao menos uma camada, raster ou a ortofoto.</div>'; return; }
  const padPct=clamp(gvn('loPad',4),0,30)/100;
  const spanEData=((maxE-minE)||50)*(1+padPct), spanNData=((maxN-minN)||50)*(1+padPct);

  let mmPerM=1000/scale;                    // mm de papel por metro de terreno

  // ---- legenda: itens e caixa (dimensionados ANTES do papel) ----
  const legIt = wantLeg ? legendItems() : [];
  const LG={
    pad:3.0*Math.max(1,legFS*0.85),
    row:Math.max(6.2*legFS, 4.0*symFS+2.0),
    sw:8.2*symFS, sh:4.0*symFS,
    ind:4.2*legFS, tit:7.4*legFS,
    fTit:4.1*legFS, fGrp:3.7*legFS, fHdr:3.5*legFS, fItm:3.5*legFS
  };
  /* Largura justa pelo conteúdo. A fórmula antiga sempre reservava o símbolo
     até para títulos/grupos e ainda multiplicava o maior texto por uma largura
     fixa exagerada; isso criava a coluna branca vazia à direita da legenda. */
  const legItemW=it=>{
    const ind=(it.indent||0)*LG.ind;
    const fs=it.grp?LG.fGrp:(it.header?LG.fHdr:LG.fItm);
    const texto=String(it.label==null?'':it.label).length*fs*0.51;
    const simbolo=(it.grp||it.header)?0:(LG.sw+2.2);
    return ind+simbolo+texto;
  };
  const legConteudo=Math.max(18,7*LG.fTit*0.58,...legIt.map(legItemW));
  LG.w=Math.max(30,LG.pad*2+legConteudo+1.2);
  LG.h=LG.pad*2 + LG.tit + legIt.length*LG.row;
  LG.k=1;   // fator de encolhimento aplicado adiante, se a caixa não couber no mapa

  // ---- margens (mm) ----
  // A4·selo: margens de impressão — direita 25 mm (encadernação), demais 7 mm
  // Figura: margem definida pelo usuário (0 = sem borda branca) + espaço p/ coordenadas
  const marU=(mode==='a4'?0:clamp(gvn('loMar',0),0,25));
  const lblX=(showCoords && !isGeo)? 6.0*txtFS : 0;   // reserva lateral
  const lblY=(showCoords && !isGeo)? 4.5*txtFS : 0;   // reserva horizontal
  const mL=(mode==='a4'? 25 : marU+(coordLeft?lblX:0));
  const mR=(mode==='a4'? 7  : marU+(coordRight?lblX:0));
  const mT=(mode==='a4'? 7+(coordTop?lblY:0) : marU+(coordTop?lblY:0));
  /* Na prancha o selo começa logo abaixo do mapa; ao ligar a coordenada
     inferior, reservamos uma faixa adicional acima dele. */
  const marB=(mode==='a4'? 7+(coordBottom?lblY:0) : marU+(coordBottom?lblY:0));
  const CART_H=(mode==='a4'? 16 : (showCart? 16*cartFS : 0));   // cartela cresce com a fonte
  const gapLeg=(legOut && legIt.length)? 2.0 : 0;
  const legCol=(legOut && legIt.length)? LG.w : 0;

  let PW,PH,mapW,mapH,seloH;
  if(mode!=='a4' && paper==='auto'){
    // papel ajustado ao dado: sem excesso de espaço branco
    const spanE=spanEData, spanN=spanNData;
    // ---- A LARGURA DA FIGURA É FIXA (a que o usuário pediu, em mm) ----
    // A escala não muda o tamanho do papel: muda o ZOOM dentro dele — quanto
    // terreno cabe na mesma largura, ou seja, quanto detalhe aparece.
    const fitW=scaleAuto||gcb('loFitW',false);
    const figW=clamp(gvn('loFigW',160),60,400);
    const figH=clamp(gvn('loFigH',0),0,400);      // 0 = altura automática
    const usable=Math.max(30, figW-mL-mR-gapLeg-legCol);
    mapW=usable;                                   // largura do mapa: fixa
    if(fitW){
      // "Ajustar pela largura": calcula a escala que faz o dado caber exatamente
      // nessa largura (arredondada p/ valor cheio). Serve de ponto de partida.
      scale=Math.min(10000000,niceScale(spanE*1000/usable));
      mmPerM=1000/scale;
      const sIn=document.getElementById('loScale');
      if(sIn && +sIn.value!==scale) sIn.value=scale;
    }
    // com fitW desligado, mmPerM já veio da escala digitada → zoom livre:
    //   1:2.000 numa figura de 160 mm  ->  ~288 m de terreno (muito detalhe)
    //   1:10.000 na mesma figura       -> ~1.440 m de terreno (visão geral)
    // altura: 0 = automática (mantém a proporção do dado); >0 = altura TOTAL em mm
    const aspecto = (spanN>0 && spanE>0) ? (spanN/spanE) : 0.72;
    mapH = figH>0 ? clamp(figH-mT-CART_H-marB, 30, 900)
                  : clamp(mapW*aspecto, 40, 900);
    // legenda em faixa lateral: só estica a figura quando a altura é automática
    if(legOut && legIt.length && figH<=0) mapH=Math.max(mapH, Math.min(LG.h,900));
    PW=mL+mapW+gapLeg+legCol+mR;
    PH=mT+mapH+CART_H+marB;
    seloH=0;
  } else {
    const [pw,ph]=PAPER[paper]||PAPER.a4l;
    PW=pw; PH=ph;
    mapW=PW-mL-mR-gapLeg-legCol;
    // O selo original do A4 retrato ocupa metade dos 178 mm úteis: 89 mm.
    // O A3 paisagem reutiliza exatamente esse tamanho físico e o mesmo texto.
    const seloW=(mode==='a4'? 89 : 0);
    seloH=(mode==='a4'? seloW*(380/800) : 0);
    const mB=(mode==='a4'? seloH+marB : CART_H+marB);
    mapH=PH-mT-mB;                                 // moldura encosta no selo/cartela (sem vão)
    if(scaleAuto){
      scale=Math.min(10000000,niceScale(Math.max(spanEData*1000/Math.max(1,mapW),spanNData*1000/Math.max(1,mapH))));
      mmPerM=1000/scale;
      const sIn=document.getElementById('loScale');if(sIn)sIn.value=scale;
    }
  }
  const spanE_max=mapW/mmPerM, spanN_max=mapH/mmPerM;
  if(gridAuto&&gridM>0){
    gridM=gradeDegrau(spanE_max/6,true);
    if(gridRaw)gridRaw.value=gridM;
  }else if(gridRaw&&gridM>0&&+gridRaw.value!==gridM){
    gridRaw.value=gridM;
  }
  // centro dos dados
  const cE=S.loCenter?S.loCenter[0]:(minE+maxE)/2;
  const cN=S.loCenter?S.loCenter[1]:(minN+maxN)/2;
  // ajustar escala se dados não couberem? Mantemos escala fixa e centralizamos.
  const x0=cE-spanE_max/2, x1=cE+spanE_max/2, y0=cN-spanN_max/2, y1=cN+spanN_max/2;
  const sx=e=>mL+(e-x0)*mmPerM, sy=n=>mT+(y1-n)*mmPerM; // y invertido
  S._loT={x0,y1,mmPerM,mL,mT,mapW,mapH,PW,PH}; // p/ o modo 🎯 centro
  const dimEl=document.getElementById('loDims');
  const paperLabel={a4p:'A4 retrato',a4l:'A4 paisagem',a3p:'A3 retrato',a3l:'A3 paisagem'}[paper]||paper.toUpperCase();
  let dim = mode==='a4'
    ? `Prancha ${paperLabel} · ${PW} × ${PH} mm · escala 1:${scale}`
    : `Figura ${PW.toFixed(0)} × ${PH.toFixed(0)} mm · mapa ${mapW.toFixed(0)} × ${mapH.toFixed(0)} mm · escala 1:${scale}`;
  if(S._orthoPx){
    const gsd=(mapW/mmPerM)/S._orthoPx;                    // metros por pixel na figura
    dim += ` · ortofoto ${S._orthoPx} px (${(gsd*100).toFixed(0)} cm/px)`;
  }
  if(dimEl) dimEl.textContent = dim;
  // Fonte única para exportação: dimensões e formato EXATOS do layout aberto.
  // O PDF não volta a consultar o seletor nem dados antigos da prancha.
  S._loPaper={PW,PH,mode,format:paper};

  const NS='http://www.w3.org/2000/svg';
  const fontCSS=await signikaCSS();
  let svg=`<svg xmlns="${NS}" width="${PW}mm" height="${PH}mm" viewBox="0 0 ${PW} ${PH}" style="background:#fff">`;
  svg+=`<style>${fontCSS} text{font-family:'Signika',sans-serif}</style>`;
  svg+=`<rect x="0" y="0" width="${PW}" height="${PH}" fill="#fff"/>`;
  // clip do mapa
  svg+=`<defs><clipPath id="mapclip"><rect x="${mL}" y="${mT}" width="${mapW}" height="${mapH}"/></clipPath></defs>`;
  svg+=`<g clip-path="url(#mapclip)">`;

  // fundo de satélite (captura de tiles) se marcado e houver basemap ativo
  const wantSat=document.getElementById('loSat').checked && (S._base && S._base!=='Sem fundo');
  if(wantSat){
    try{
      const cap=await captureBasemap(x0,y0,x1,y1,crs, Math.round(mapW*8)); // ~200dpi
      if(cap){ const b=cap.b;
        const ix=sx(b[0]), iy=sy(b[3]), iw=(b[2]-b[0])*mmPerM, ih=(b[3]-b[1])*mmPerM;
        svg+=`<image href="${cap.dataURL}" x="${ix.toFixed(2)}" y="${iy.toFixed(2)}" width="${iw.toFixed(2)}" height="${ih.toFixed(2)}" preserveAspectRatio="none"/>`;
      }
    }catch(e){ console.error(e); toast('Não foi possível capturar o satélite: '+e.message); }
  }

  // Mantém no Layout/exportação a mesma máscara poligonal escolhida no mapa.
  // O WMS continua sendo uma imagem, mas o SVG limita sua pintura exatamente
  // aos anéis da camada poligonal, inclusive respeitando eventuais furos.
  function layoutWmsClip(w){
    const Lp=w&&w.clipLayerId&&(S.layers||[]).find(L=>String(L.id)===String(w.clipLayerId));
    if(!Lp||Lp.gtype!=='polygon') return '';
    let d='';
    const anel=g=>{
      if(!Array.isArray(g)||g.length<3) return;
      if(Array.isArray(g[0])&&typeof g[0][0]==='number'){
        const q=g.map(p=>reproj(Lp.crs||crs,crs,+p[0],+p[1]));
        if(q.length<3) return;
        d+=q.map((p,i)=>(i?'L':'M')+sx(p[0]).toFixed(3)+' '+sy(p[1]).toFixed(3)).join('')+'Z';
      }else g.forEach(anel);
    };
    (Lp.features||[]).forEach(f=>anel(f.geom));
    if(!d) return '';
    const id='wmsLayoutClip_'+String(w.id||w.layers||'camada').replace(/[^\w-]/g,'');
    svg+=`<defs><clipPath id="${id}"><path d="${d}" fill-rule="evenodd" clip-rule="evenodd"/></clipPath></defs>`;
    return id;
  }

  // camadas WMS visíveis — sobre o fundo e sob os dados locais
  (S.wms||[]).filter(w=>w&&w.visible!==false&&w.layers&&w.url).forEach(w=>{
    try{
      const wu=layoutWmsUrl(w,x0,y0,x1,y1,crs,mapW*8,mapH*8);
      const clipId=layoutWmsClip(w);
      svg+=`<image href="${esc(wu)}" x="${mL}" y="${mT}" width="${mapW}" height="${mapH}" `+
        `${clipId?'clip-path="url(#'+clipId+')" ':''}opacity="${Math.max(0,Math.min(1,Number(w.opacity??0.85)))}" preserveAspectRatio="none"/>`;
    }catch(e){ console.warn('WMS no layout:',w.name||w.layers,e.message); }
  });

  // defs de hachura para o layout (por cor sob demanda, escala mm)
  const hatchDefs={}; // key -> svg string
  function layoutHatch(hatch,color,spacing){
    if(hatch==='solid'||hatch==='none'||!hatch) return null;
    const tpl=PATTERN_TPL[hatch]; if(!tpl) return null;
    const hs=Math.max(.25,Math.min(8,+spacing||1));
    const id='lh_'+hatch+'_'+color.replace('#','')+'_'+String(hs).replace('.','_');
    if(!hatchDefs[id]){
      const k=0.45*hs; // espaçamento do tile em mm
      hatchDefs[id]=`<pattern id="${id}" width="${(tpl.w*k).toFixed(2)}" height="${(tpl.h*k).toFixed(2)}" patternUnits="userSpaceOnUse"><g transform="scale(${k})">${hatchBodyAtSpacing(tpl,color,hs)}</g></pattern>`;
    }
    return id;
  }
  // SVG de uma camada vetorial (extraído para poder intercalar com os rasters)
  /* Normaliza Point/MultiPoint para a plotagem. A maior parte dos importadores
     grava [[x,y]], mas ferramentas antigas e alguns projetos salvos também
     possuem [x,y] ou níveis adicionais de agrupamento. O mapa 2D consegue
     tolerar parte dessas variantes; o Layout antes tentava ler um número como
     se fosse um par e produzia coordenadas NaN, embora a camada continuasse
     aparecendo corretamente na legenda. */
  function layoutPointCoords(geom,out){
    out=out||[];
    if(!Array.isArray(geom))return out;
    if(geom.length>=2 && Number.isFinite(+geom[0]) && Number.isFinite(+geom[1])){
      out.push([+geom[0],+geom[1]]);return out;
    }
    geom.forEach(g=>layoutPointCoords(g,out));
    return out;
  }
  function svgDaCamada(L,soPontos){
    /* Pontos são compostos numa passada vetorial final. Assim um marcador
       nunca fica soterrado por ortofoto, MDT/TIN ou polígonos semitransparentes
       durante a montagem assíncrona da prancha. As demais geometrias continuam
       obedecendo rigorosamente à pilha intercalada. */
    if((L.gtype==='point')!==!!soPontos)return '';
    let s='';
    L.features.forEach(f=>{ if(!f.geom || !featureVisible(L,f))return;
      const st=featureStyle(L,f);
      const col=st.color;
      const scol=st.stroke||st.color;
      /* Espessura zero significa literalmente SEM contorno. A soma fixa de
         0,15 mm usada antes ressuscitava a borda no Layout. Valores entre
         zero e um continuam válidos e recebem apenas um mínimo visual de
         0,04 mm para sobreviver à rasterização da prévia/PDF. */
      const peso=Number(st.weight),w=Number.isFinite(peso)&&peso>0?
        Math.max(.04,peso*.3*mapSym):0;
      if(L.gtype==='point'){
        const ps=ptStyleOf(L,f,st);
        const mm=(ps.size/14)*3.4*mapSym;
        layoutPointCoords(f.geom).forEach(pt=>{
          const c=reproj(L.crs,crs,pt[0],pt[1]);
          if(!c || !Number.isFinite(+c[0]) || !Number.isFinite(+c[1]))return;
          const px=sx(+c[0]),py=sy(+c[1]);
          if(!Number.isFinite(px)||!Number.isFinite(py))return;
          /* Usa exatamente a mesma biblioteca de símbolos do Mapa 2D e da
             legenda, inclusive para o círculo simples. O atalho antigo tinha
             regra própria de contorno e fazia pontos brancos/vazados ou com
             espessura zero desaparecerem somente na prancha. */
          s+=ptPlotSVG(ps, col||'#ffffff', scol||col||'#111111', st.weight, px, py, mm);
        }); }
      else { const rings=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
        rings.forEach(r=>{ const d=r.map((pt,i)=>{const c=reproj(L.crs,crs,pt[0],pt[1]);return (i?'L':'M')+sx(c[0]).toFixed(2)+' '+sy(c[1]).toFixed(2);}).join(' ')+(L.gtype==='polygon'?' Z':'');
          let fill='none', fo=0;
          if(L.gtype==='polygon'){
            if(st.hatch==='none'){ fill='none'; }
            else { const hid=layoutHatch(st.hatch,col,st.hatchScale); fill=hid?`url(#${hid})`:col; fo=hid?1:st.fill; }
          }
          s+=`<path d="${d}" fill="${fill}" fill-opacity="${fo}" stroke="${w>0?scol:'none'}" stroke-width="${w}" ${w>0&&st.dash?`stroke-dasharray="${escalaDash(st.dash,w)}"`:''}/>`; }); }
    });
    return s;
  }

  /* LAÇO ÚNICO na ordem da pilha: rasters e vetores intercalados.
     Antes o layout desenhava TODAS as imagens e só então TODOS os vetores —
     por isso um polígono "embaixo" na lista ainda cobria o MDT na plotagem,
     mesmo depois de o mapa já respeitar a ordem.                            */
  const stk=stackSync();
  for(let si=stk.length-1; si>=0; si--){
    const nd=stk[si], ob=nd.o;
    if(ob.visible===false) continue;

    if(nd.t==='L'){ svg+=svgDaCamada(ob,false); continue; }

    let url=null, bb=null, op=1, orthoWarp=null;
    if(nd.t==='I'){
      if(!ob.url || !ob.b) continue;
      /* A opacidade da ortofoto ficava presa em 1 aqui: só o raster lia o
         valor, então mexer no controle mudava o MAPA e não a PRANCHA. Vem do
         overlay (fonte viva) e, na falta dele, do controle do painel. */
      {
        const o1=(ob.overlay && ob.overlay.options && ob.overlay.options.opacity);
        const el=document.getElementById('imgOp');
        const o2=el? parseFloat(el.value) : NaN;
        const v=Number.isFinite(o1)? o1 : (Number.isFinite(o2)? o2 : 1);
        op=Math.max(0, Math.min(1, v));
      }
      const win=[x0, y1-mapH/mmPerM, x0+mapW/mmPerM, y1];
      const paraTela=!S._exporting;
      const dpiAlvo=paraTela? Math.min(300, Math.max(150, 96*(S.loZoom||1)*1.4)) : 300;
      const alvoPx=Math.round((mapW/25.4)*dpiAlvo*1.15);
      let hi=null;
      try{ hi=await orthoWindow(win, alvoPx); }catch(e){ console.warn('ortofoto:',e.message); }
      if(hi){ url=hi.dataURL; bb=hi.bb; S._orthoPx=hi.px; }
      else  {
        url=ob.url;
        /* Projeto reaberto: não há mais o TIFF para gerar uma janela UTM e a
           URL disponível é a prévia já warpada. Mantém os cantos usados pelo
           Mapa 2D e aplica na prancha a mesma rotação, sem tocar nos vetores. */
        orthoWarp=layoutOrthoWarpInfo(ob,crs);
        bb=orthoWarp?orthoWarp.bounds:ob.b;
        S._orthoPx=null;
      }
      S._lastOrthoDpi=dpiAlvo;
    }
    else if(nd.t==='R'){
      try{ url=await rasterURLPlot(ob); }catch(e){ console.warn('raster plot:',e.message); url=ob._url; }
      if(!url) continue;
      /* rasterURLPlot pode reler o GeoTIFF nativo. A imagem resultante deve
         usar a extensão DESSA grade, nunca a extensão da grade reduzida de
         tela; misturar as duas deslocava o MDT em relação ao limite da cava. */
      bb=ob._urlPlotBounds||rasterBounds(ob); op=(ob.style.opacity??0.8);
    } else continue;
    if(orthoWarp){
      const nw=[sx(orthoWarp.nw[0]),sy(orthoWarp.nw[1])];
      const ne=[sx(orthoWarp.ne[0]),sy(orthoWarp.ne[1])];
      const sw=[sx(orthoWarp.sw[0]),sy(orthoWarp.sw[1])];
      const a=ne[0]-nw[0], b=ne[1]-nw[1], c=sw[0]-nw[0], d=sw[1]-nw[1];
      svg+=`<image href="${url}" x="0" y="0" width="1" height="1" `+
        `transform="matrix(${a.toFixed(6)} ${b.toFixed(6)} ${c.toFixed(6)} ${d.toFixed(6)} ${nw[0].toFixed(6)} ${nw[1].toFixed(6)})" `+
        `opacity="${op}" preserveAspectRatio="none"/>`;
    }else{
      const ix=sx(bb[0]), iy=sy(bb[3]), iw=(bb[2]-bb[0])*mmPerM, ih=(bb[3]-bb[1])*mmPerM;
      svg+=`<image href="${url}" x="${ix.toFixed(2)}" y="${iy.toFixed(2)}" width="${iw.toFixed(2)}" height="${ih.toFixed(2)}" opacity="${op}" preserveAspectRatio="none"/>`;
    }
  }

  // ---- rótulos (por cima de tudo): fonte, cor, halo, posição e formato da camada ----
  let lblSVG='';
  S.layers.slice().reverse().filter(l=>l.visible && l.labelField).forEach(L=>{
    const c=labelCfg(L);
    const labelUnicas=labelUniqueSet(L);
    const it=c.style.includes('italic')?'italic':'normal';
    const bd=c.style.includes('bold')?'700':'400';
    const fs=(+c.size||8)*0.3528;                      // pt -> mm (1 pt = 0,3528 mm)
    const [ddx,ddy]=labelShift(c);
    const hw=+c.haloW||0;
    const modoCurva = (c.place==='curva' && L.gtype!=='point');
    const gira = String(c.rot??'1')!=='0';
    const emite=(X,Y,txt,ang,anchorOverride)=>{
      const tr = (ang!=null && gira) ? ` transform="rotate(${ang.toFixed(1)} ${X} ${Y})"` : '';
      const anchor=anchorOverride||(modoCurva?'middle':c.anchor);
      /* Rótulo de vários campos: uma <tspan> por linha, com o bloco CENTRADO
         na vertical sobre o ponto — senão a primeira linha ficaria no lugar
         do rótulo antigo e as demais empurrariam o conjunto para baixo. */
      const linhas=String(txt).split('\n');
      const passo=fs*1.15;
      const y0=Y-(linhas.length-1)*passo/2;
      const corpo=linhas.map((ln,i)=>
        `<tspan x="${X}" y="${(y0+i*passo).toFixed(2)}">${esc(ln)}</tspan>`).join('');
      const base=`x="${X}" y="${Y}" text-anchor="${anchor}" font-family="${c.font}" `+
                 `font-size="${fs.toFixed(2)}" font-style="${it}" font-weight="${bd}"${tr}`;
      // halo primeiro (traço grosso por baixo), texto por cima
      if(hw>0) lblSVG+=`<text ${base} fill="none" stroke="${c.halo}" stroke-width="${(hw*0.25).toFixed(2)}" stroke-linejoin="round">${corpo}</text>`;
      lblSVG+=`<text ${base} fill="${c.color}">${corpo}</text>`;
    };
    L.features.forEach(f=>{
      if(!f.geom || !featureVisible(L,f)) return;
      if(labelUnicas&&!labelUnicas.has(f))return;
      const txt=labelText(L,f); if(txt==null) return;
      if(modoCurva){
        // mesma colocação do mapa: sobre o traçado, repetida e girada
        labelPontosCurva(L,f,+c.rep||0).forEach(q=>{
          const p=reproj(L.crs,crs,q.pt[0],q.pt[1]);
          emite(sx(p[0]).toFixed(2), (sy(p[1])+fs*0.35).toFixed(2), txt, q.ang);
        });
        return;
      }
      /* Rótulo centralizado em ponto cobria exatamente o símbolo com o texto
         e, sobretudo, com o halo branco. Era possível ver o nome e a amostra
         na legenda, mas não o ponto no corpo da prancha. Quando o usuário não
         informou deslocamento, colocamos o texto à direita do marcador; um
         deslocamento manual continua sendo respeitado integralmente. */
      const ap=L.gtype==='point'?layoutPointCoords(f.geom)[0]:labelAnchorPt(L,f); if(!ap) return;
      const p=reproj(L.crs,crs,ap[0],ap[1]);
      const autoPonto=L.gtype==='point' && Math.abs(+c.dx||0)<1e-9 && Math.abs(+c.dy||0)<1e-9 && c.place==='center';
      let lx=sx(p[0])+ddx,ly=sy(p[1])+ddy+fs*0.35,anc=null;
      if(autoPonto){
        const ps=ptStyleOf(L,f,featureStyle(L,f));
        const mm=(ps.size/14)*3.4*mapSym;
        lx+=mm*.48+1.1; anc='start';
      }
      emite(lx.toFixed(2),ly.toFixed(2),txt,null,anc);
    });
  });
  svg+=lblSVG;

  /* Sobreposição cartográfica de pontos: desenhada depois das superfícies e
     dos rótulos. O texto pontual padrão já é afastado do marcador; quando o
     usuário escolhe posição manual/central, o símbolo ainda permanece visível
     e selecionável visualmente em vez de desaparecer sob o halo. Mantemos a
     ordem relativa entre as próprias camadas de pontos. */
  for(let si=stk.length-1;si>=0;si--){
    const nd=stk[si],ob=nd.o;
    if(nd.t==='L'&&ob.visible!==false&&ob.gtype==='point')svg+=svgDaCamada(ob,true);
  }
  svg+=`</g>`;

  // grade UTM (linhas + rótulos) se projetado — gridM=0 desliga a grade
  if(!isGeo && gridM>0){
    const gs=Math.ceil(x0/gridM)*gridM;
    svg+=`<g stroke="#0a0a0a" stroke-width="0.12" opacity="0.6" font-family="Signika, sans-serif" font-size="${(2.2*txtFS).toFixed(2)}" fill="#111">`;
    for(let e=gs; e<=x1; e+=gridM){ const X=sx(e);
      svg+=`<line x1="${X.toFixed(2)}" y1="${mT}" x2="${X.toFixed(2)}" y2="${mT+mapH}"/>`;
      if(coordTop) svg+=`<text x="${X.toFixed(2)}" y="${(mT-1).toFixed(2)}" text-anchor="middle">${Math.round(e)}</text>`;
      if(coordBottom) svg+=`<text x="${X.toFixed(2)}" y="${(mT+mapH+3.2*txtFS).toFixed(2)}" text-anchor="middle">${Math.round(e)}</text>`;
    }
    const gn=Math.ceil(y0/gridM)*gridM;
    for(let n=gn; n<=y1; n+=gridM){ const Y=sy(n);
      svg+=`<line x1="${mL}" y1="${Y.toFixed(2)}" x2="${mL+mapW}" y2="${Y.toFixed(2)}"/>`;
      if(showCoords && (mT+mapH-Y)>6 && (Y-mT)>4){ // sem coordenada na linha junto ao selo/topo
        if(coordLeft){
          svg+=`<text x="${(mL-1.2).toFixed(2)}" y="${(Y+0.7).toFixed(2)}" text-anchor="end" transform="rotate(-90 ${(mL-1.2).toFixed(2)} ${Y.toFixed(2)})">${Math.round(n)}</text>`;
        }
        if(coordRight){
          const XR=mL+mapW+1.2;
          svg+=`<text x="${XR.toFixed(2)}" y="${(Y+0.7).toFixed(2)}" text-anchor="start" transform="rotate(-90 ${XR.toFixed(2)} ${Y.toFixed(2)})">${Math.round(n)}</text>`;
        }
      }
    }
    svg+=`</g>`;
  }
  // moldura
  svg+=`<rect x="${mL}" y="${mT}" width="${mapW}" height="${mapH}" fill="none" stroke="#111" stroke-width="0.4"/>`;

  // seta norte
  const nx=mL+mapW-8, ny=mT+10;
  svg+=`<g transform="translate(${nx},${ny})"><path d="M0 -6 L2.4 5 L0 2.6 L-2.4 5 Z" fill="#111"/><text x="0" y="9" text-anchor="middle" font-family="sans-serif" font-size="3" font-weight="700" fill="#111">N</text></g>`;

  // ---- barra de escala gráfica (caixa branca, 4 segmentos, valor "bonito") ----
  // O usuário controla o comprimento pretendido. O valor padrão (0,7×)
  // reduz a régua de 36% para cerca de 25% do mapa, preservando a relação
  // rigorosa entre milímetros no papel e distância representada.
  let NSEG=4;
  const passoFixo=(typeof barPassoAtual==='function')? barPassoAtual() : null;
  const barTargetFrac=clamp(0.36*barLengthScale,0.10,0.54);
  const barMaxFrac=clamp(barTargetFrac*1.28,0.13,0.69);
  const tgtM=(barTargetFrac*mapW)/mmPerM/NSEG;              // metros por segmento (alvo)
  const pow=Math.pow(10,Math.floor(Math.log10(Math.max(tgtM,1e-6))));
  const NICE=[1,2,2.5,5,10].map(v=>v*pow);                  // 1/2/2,5/5 × 10^k
  let segM=NICE.reduce((a,b)=>Math.abs(b-tgtM)<Math.abs(a-tgtM)?b:a);
  if(passoFixo){
    /* Passo digitado pelo usuário: é respeitado como está. Se 4 divisões não
       couberem, a barra perde divisões — nunca muda o valor pedido. */
    segM=passoFixo;
    while(NSEG>1 && NSEG*segM*mmPerM > barMaxFrac*mapW) NSEG--;
    try{
      const hint=document.getElementById('loBarHint');
      if(hint) hint.innerHTML=(NSEG<2)
        ? '<b style="color:var(--sel)">Passo de '+segM.toLocaleString('pt-BR')+
          ' m é grande para 1:'+scale+'</b> — a barra ficou com uma única divisão. Reduza o passo ou aumente a escala.'
        : 'Barra com '+NSEG+' divisões de '+segM.toLocaleString('pt-BR')+
          ' m (total '+(NSEG*segM).toLocaleString('pt-BR')+' m).';
    }catch(e){}
  }else{
    // guarda: a barra acompanha o comprimento escolhido sem perder exatidão
    while(NSEG*segM*mmPerM > barMaxFrac*mapW){
      const k=NICE.indexOf(segM);
      if(k>0) segM=NICE[k-1]; else { segM=segM/2; break; }
    }
  }
  const segMM=segM*mmPerM, barMM=NSEG*segMM;
  /* Em escalas pequenas, rótulos em metros como 2.500 / 5.000 / 7.500 se
     atropelavam. Acima de 1 km por segmento usamos km com uma casa decimal:
     2,5 / 5 / 7,5 / 10 km, muito mais curto e igualmente preciso. */
  const km=(segM>=1000);
  const unit=km?'km':'m';
  const nf=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
  const lbl=i=>nf.format(i*segM/(km?1000:1));
  const barBaseFS=1.25;
  const barFS=barBaseFS*barTextFS;                           // somente a tipografia da escala
  const BH=2.35*barBaseFS, BOXPAD=2.6;                       // a barra mantém sua espessura
  /* A caixa apenas ganha a folga necessária para não cortar uma fonte maior;
     os segmentos e sua geometria não são redimensionados por este controle. */
  const barTextRoom=Math.max(barBaseFS,barFS);
  const boxW=barMM+2*BOXPAD+11*barTextRoom, boxH=BH+11.2*barTextRoom;
  const boxX=mL+3, boxY=mT+mapH-boxH-3;                      // canto inferior esquerdo da moldura
  const bx=boxX+BOXPAD, by=boxY+4.5*barTextRoom;
  svg+=`<g font-family="Signika, sans-serif" fill="#111">`;
  svg+=`<rect x="${boxX.toFixed(2)}" y="${boxY.toFixed(2)}" width="${boxW.toFixed(2)}" height="${boxH.toFixed(2)}" fill="#fff" fill-opacity="0.9" stroke="#111" stroke-width="0.25" rx="0.8"/>`;
  for(let i=0;i<NSEG;i++)
    svg+=`<rect x="${(bx+i*segMM).toFixed(2)}" y="${by.toFixed(2)}" width="${segMM.toFixed(2)}" height="${BH}" fill="${i%2?'#fff':'#111'}" stroke="#111" stroke-width="0.25"/>`;
  /* Mantém os marcos de todas as divisões, mas omite rótulos intermediários
     quando a largura física do segmento é insuficiente. O primeiro e o
     último valor sempre aparecem; portanto a leitura continua completa sem
     números sobrepostos. */
  const barLabels=Array.from({length:NSEG+1},(_,i)=>lbl(i));
  const widestLabel=Math.max(...barLabels.map(s=>String(s).length));
  const minLabelGap=Math.max(5.2, widestLabel*3.25*barFS*0.56+1.2);
  const labelStride=Math.max(1,Math.ceil(minLabelGap/Math.max(segMM,0.01)));
  for(let i=0;i<=NSEG;i++){
    svg+=`<line x1="${(bx+i*segMM).toFixed(2)}" y1="${(by+BH).toFixed(2)}" x2="${(bx+i*segMM).toFixed(2)}" y2="${(by+BH+1).toFixed(2)}" stroke="#111" stroke-width="0.25"/>`;
    const showLabel=(i===0 || i===NSEG || (i%labelStride===0 && NSEG-i>=labelStride));
    if(showLabel) svg+=`<text x="${(bx+i*segMM).toFixed(2)}" y="${(by+BH+4.7*barFS).toFixed(2)}" text-anchor="middle" font-size="${(3.25*barFS).toFixed(2)}">${barLabels[i]}</text>`;
  }
  svg+=`<text x="${(bx+barMM+4.0*barFS).toFixed(2)}" y="${(by+BH+4.7*barFS).toFixed(2)}" font-size="${(3.25*barFS).toFixed(2)}" font-weight="700">${unit}</text>`;
  svg+=`<text x="${bx.toFixed(2)}" y="${(by-1.35).toFixed(2)}" font-size="${(3.15*barFS).toFixed(2)}" font-weight="700">1:${Math.round(scale).toLocaleString('pt-BR')}</text>`;
  svg+=`</g>`;

  // legenda das camadas visíveis (dentro do mapa, ou em faixa lateral fora dele)
  let bandItems=null; // legenda da faixa do selo (modo A4)
  if(wantLeg){
    const items=legIt;
    /* PRANCHA (A4/A3): a folha tem um espaço próprio para a legenda, ao lado
       do selo. Ela nunca é desenhada em caixa flutuante sobre o mapa — a
       posição por cantos existe apenas no modo Figura, que não tem essa
       faixa. Antes, escolher um canto na prancha mandava a legenda para
       cima do mapa e deixava o quadro destinado a ela vazio. */
    if(mode==='a4'){ bandItems=items; }
    else if(items.length){
      // Espaço disponível para a caixa. Se os itens não couberem, a legenda ENCOLHE
      // (até 55%) em vez de cortar itens — antes ela truncava com "… +N itens".
      const avail = legOut? mapH : (mapH-6);
      let k = (LG.h>avail && avail>0) ? Math.max(0.55, avail/LG.h) : 1;
      LG.k = k;
      const pad=LG.pad*k, indMM=LG.ind*k, sw=LG.sw*k, sh=LG.sh*k;
      const tit=LG.tit*k, fTit=LG.fTit*k, fGrp=LG.fGrp*k, fHdr=LG.fHdr*k, fItm=LG.fItm*k;
      const lgW=legOut? LG.w : Math.min(0.72*mapW, LG.w);
      /* Quebra os textos pelo espaço REAL restante na caixa. A estimativa em
         milímetros é deliberadamente conservadora para que nomes extensos,
         como os de unidades de conservação, nunca escapem do fundo branco. */
      const wrapLegend=(it,fs)=>{
        const ind=(it.indent||0)*indMM;
        const symbolW=(it.grp||it.header)?0:(sw+2);
        const maxW=Math.max(10,lgW-pad*2-ind-symbolW);
        const maxChars=Math.max(7,Math.floor(maxW/Math.max(fs*0.56,0.5)));
        const words=String(it.label||'').trim().split(/\s+/).filter(Boolean);
        const lines=[]; let cur='';
        const pushWord=w=>{
          if(w.length<=maxChars){
            if(!cur) cur=w;
            else if((cur+' '+w).length<=maxChars) cur+=' '+w;
            else { lines.push(cur); cur=w; }
            return;
          }
          if(cur){ lines.push(cur); cur=''; }
          for(let p=0;p<w.length;p+=maxChars) lines.push(w.slice(p,p+maxChars));
        };
        words.forEach(pushWord); if(cur) lines.push(cur);
        return lines.length?lines:[''];
      };
      const wrapped=items.map(it=>wrapLegend(it,it.grp?fGrp:(it.header?fHdr:fItm)));
      const lineHeight=fs=>fs*1.18;
      const rowHeights=wrapped.map((lines,i)=>{
        const it=items[i], fs=it.grp?fGrp:(it.header?fHdr:fItm);
        return Math.max(LG.row*k,lines.length*lineHeight(fs)+1.0*k);
      });
      const boxH=pad*2 + tit + rowHeights.reduce((a,b)=>a+b,0);
      const lgH=Math.min(boxH, avail);
      const atLeft=legPos.endsWith('l'), atTop=legPos.startsWith('t');
      const lx=legOut? (mL+mapW+gapLeg) : (atLeft?mL+3:mL+mapW-lgW-3);
      const ly=legOut? mT               : (atTop?mT+4:mT+mapH-lgH-4);
      // + 1e-6: sem isso, (n*row)/row dava 3,9999… e o último item sumia
      let maxRows=items.length;
      if(boxH>avail+1e-6){
        const budget=Math.max(0,lgH-pad*2-tit); let used=0; maxRows=0;
        while(maxRows<rowHeights.length && used+rowHeights[maxRows]<=budget+1e-6){
          used+=rowHeights[maxRows++];
        }
        maxRows=Math.max(1,maxRows);
      }
      svg+=`<g font-family="Signika, sans-serif">`;
      svg+=`<rect x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" width="${lgW.toFixed(2)}" height="${lgH.toFixed(2)}" fill="#ffffff" fill-opacity="${legOut?1:0.93}" stroke="#111" stroke-width="0.25" rx="0.8"/>`;
      svg+=`<text x="${(lx+pad).toFixed(2)}" y="${(ly+pad+fTit*0.9).toFixed(2)}" font-size="${fTit.toFixed(2)}" font-weight="700" fill="#111" letter-spacing="0.3">${loT('LEGENDA')}</text>`;
      svg+=`<line x1="${(lx+pad).toFixed(2)}" y1="${(ly+pad+tit-1.4).toFixed(2)}" x2="${(lx+lgW-pad).toFixed(2)}" y2="${(ly+pad+tit-1.4).toFixed(2)}" stroke="#111" stroke-width="0.25"/>`;
      const legendText=(x,cy,fs,weight,fill,lines)=>{
        const lh=lineHeight(fs), y0=cy-(lines.length-1)*lh/2+fs*0.36;
        return lines.map((ln,j)=>`<text x="${x.toFixed(2)}" y="${(y0+j*lh).toFixed(2)}" font-size="${fs.toFixed(2)}" font-weight="${weight}" fill="${fill}">${esc(ln)}</text>`).join('');
      };
      let yy=ly+pad+tit, n=0;    // yy = topo da linha corrente
      for(const it of items){
        if(n>=maxRows){
          svg+=`<text x="${(lx+pad).toFixed(2)}" y="${(yy+fItm*0.8).toFixed(2)}" font-size="${(fItm*0.85).toFixed(2)}" fill="#888">… +${items.length-n} itens</text>`;
          break;
        }
        const ix=lx+pad+(it.indent||0)*indMM;
        const rowH=rowHeights[n]||LG.row*k;
        const cy=yy+rowH/2;                       // centro vertical da linha
        const lines=wrapped[n]||[String(it.label||'')];
        if(it.grp){
          svg+=legendText(ix,cy,fGrp,700,'#111',lines);
          svg+=`<line x1="${ix.toFixed(2)}" y1="${(cy+rowH/2-0.6).toFixed(2)}" x2="${(lx+lgW-pad).toFixed(2)}" y2="${(cy+rowH/2-0.6).toFixed(2)}" stroke="#999" stroke-width="0.15"/>`;
        } else if(it.header){
          svg+=legendText(ix,cy,fHdr,600,'#333',lines);
        } else {
          if(it.kind==='ras' || it.kind==='img'){
            const gid2 = it.ramp ? loRampaId(it.ramp) : ('lg_'+it.kind);
            if(it.ramp){ if(!hatchDefs[gid2]) hatchDefs[gid2]=loRampaDef(gid2,it.ramp); }
            else if(!hatchDefs[gid2]) hatchDefs[gid2]= it.kind==='ras'
              ? `<linearGradient id="${gid2}"><stop offset="0" stop-color="#1a6b3c"/><stop offset="0.5" stop-color="#e8e07a"/><stop offset="1" stop-color="#8d6e63"/></linearGradient>`
              : `<linearGradient id="${gid2}"><stop offset="0" stop-color="#4c7a34"/><stop offset="0.6" stop-color="#9ab87a"/><stop offset="1" stop-color="#cfcfc4"/></linearGradient>`;
            svg+=`<rect x="${ix.toFixed(2)}" y="${(cy-sh/2).toFixed(2)}" width="${sw.toFixed(2)}" height="${sh.toFixed(2)}" fill="url(#${gid2})" stroke="#111" stroke-width="${(0.25*symFS).toFixed(2)}"/>`;
          } else if(it.kind==='poly'){
            let fill=it.color;
            if(it.hatch && it.hatch!=='solid' && it.hatch!=='none'){ const hid=layoutHatch(it.hatch,it.color,it.hatchScale); if(hid){fill=`url(#${hid})`;} }
            if(it.hatch==='none') fill='none';
            svg+=`<rect x="${ix.toFixed(2)}" y="${(cy-sh/2).toFixed(2)}" width="${sw.toFixed(2)}" height="${sh.toFixed(2)}" fill="${fill}" fill-opacity="${it.hatch==='none'?0:(it.hatch&&it.hatch!=='solid'?1:0.7)}" stroke="${it.stroke||it.color}" stroke-width="${(0.35*symFS).toFixed(2)}"/>`;
          } else if(it.kind==='line'){
            svg+=`<line x1="${ix.toFixed(2)}" y1="${cy.toFixed(2)}" x2="${(ix+sw).toFixed(2)}" y2="${cy.toFixed(2)}" stroke="${it.color}" stroke-width="${(0.8*symFS).toFixed(2)}" ${it.dash?`stroke-dasharray="${escalaDash(it.dash,0.8*symFS)}"`:''}/>`;
          } else {
            const shp=it.shape&&PT_SYMS[it.shape]? it.shape:'circle';
            if(shp==='circle')
              svg+=`<circle cx="${(ix+sw/2).toFixed(2)}" cy="${cy.toFixed(2)}" r="${(1.3*symFS).toFixed(2)}" fill="${it.color}" stroke="${it.stroke||it.color}" stroke-width="0.25"/>`;
            else
              svg+=ptPlotSVG({shape:shp,def:PT_SYMS[shp],rot:0,dip:null}, it.color, it.stroke||it.color, it.weight||1.5, ix+sw/2, cy, 3.6*symFS);
          }
          svg+=legendText(ix+sw+2,cy,fItm,400,'#111',lines);
        }
        yy+=rowH; n++;
      }
      svg+=`</g>`;
    }
  }

  // cartela de título (rodapé)
  const CY=mT+mapH+(coordBottom?lblY:0); // coordenadas inferiores ficam entre mapa e cartela/selo
  const CW=mapW+gapLeg+legCol;      // cartela cobre mapa + faixa de legenda (se houver)
  if(mode!=='a4'){
    // cartela simples (modo Figura) — bordas coincidentes com a moldura
    if(showCart){
      const logoW=26*cartFS, logoH=logoW*476/1250, pad=3;
      const logoX=mL+CW-pad-logoW, logoY=CY+(CART_H-logoH)/2;   // logo centralizado na vertical
      const infoR=logoX-2;                                       // texto termina antes do logo
      svg+=`<g font-family="'Signika',sans-serif" fill="#111">
      <rect x="${mL}" y="${CY.toFixed(2)}" width="${CW.toFixed(2)}" height="${CART_H.toFixed(2)}" fill="none" stroke="#111" stroke-width="0.3"/>
      <text x="${mL+3}" y="${(CY+7.2*cartFS).toFixed(2)}" font-size="${(6.0*cartFS*titFS).toFixed(2)}" font-weight="700">${esc(title)}</text>
      <text x="${mL+3}" y="${(CY+13.2*cartFS).toFixed(2)}" font-size="${(3.4*cartFS).toFixed(2)}" fill="#444">${esc(sub)}</text>
      <text x="${infoR.toFixed(2)}" y="${(CY+13.2*cartFS).toFixed(2)}" text-anchor="end" font-size="${(3.0*cartFS).toFixed(2)}" fill="#444">${loT('Esc. 1:')}${scale} · ${CRS_LABELS[crs]||crs} · ${new Date().toLocaleDateString('pt-BR')}</text>
      <image href="${CCM_LOGO}" x="${logoX.toFixed(2)}" y="${logoY.toFixed(2)}" width="${logoW.toFixed(2)}" height="${logoH.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>
    </g>`;
    }
  } else {
    // ---- SELO A4 — reprodução fiel do modelo (metade direita) + LEGENDA (metade esquerda) ----
    const gv=id=>{const e=document.getElementById(id);return e?e.value:'';};
    const V={proj:title, area:gv('loArea')||'—', cli:gv('loCli')||'—', end:gv('loLoc')||'—',
      prjt:gv('loRT')||'—', des:gv('loDes')||'—', exec:gv('loExec')||'—',
      num:gv('loNum')||'—', cont1:(gv('loCont')||sub||'—'), cont2:(CRS_LABELS[crs]||crs),
      esc:'1:'+scale, folha:gv('loFolha')||'01/01', revN:gv('loRevN')||'—',
      data:new Date().toLocaleDateString('pt-BR')};
    const SW=89, SH=seloH;
    const SX=mL+mapW-SW, SY=CY;              // selo abaixo da faixa opcional de coordenadas
    const X=f=>SX+f*SW, Y=f=>SY+f*SH;        // frações do modelo (800×380)
    // frações medidas do modelo
    const fLogo=.4125, fSub=.15, fR1=.3026, fR2=.4526, fR3=.60, fR4=.7447, fR5=.8684,
          fNum=.34, fRev=.17, fCol=.7375;
    const FS=Math.max(0.7,Math.min(1.5,+gv('loFS')||1));
    const fit=(t,maxW,base)=>Math.min(base*FS, (maxW-1)/(0.58*Math.max(1,String(t).length)));
    const LN=(x1,y1,x2,y2,w)=>`<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#111" stroke-width="${w||0.3}"/>`;
    const LB=(x,y,t)=>`<text x="${(x+1.1).toFixed(2)}" y="${(y+2.0).toFixed(2)}" font-size="${(1.45*FS).toFixed(2)}" fill="#333">${t}</text>`;
    const VL=(x,y,t,fs,anchor,xa)=>`<text x="${(xa!==undefined?xa:x+2.5).toFixed(2)}" y="${y.toFixed(2)}" font-size="${fs||2.5}" font-weight="700" fill="#111" ${anchor?`text-anchor="${anchor}"`:''}>${esc(t)}</text>`;
    svg+=`<g font-family="Signika, sans-serif">`;
    // moldura externa
    svg+=`<rect x="${SX}" y="${SY}" width="${SW}" height="${SH}" fill="#fff" stroke="#111" stroke-width="0.5"/>`;
    // ---- linhas ----
    svg+=LN(X(0),Y(fR1),X(1),Y(fR1));                       // base linha 1
    svg+=LN(X(0),Y(fR2),X(1),Y(fR2));                       // base linha 2
    svg+=LN(X(0),Y(fR3),X(1),Y(fR3));                       // base linha 3
    svg+=LN(X(0),Y(fR4),X(1),Y(fR4));                       // base linha 4
    svg+=LN(X(0),Y(fR5),X(fNum),Y(fR5));                    // sub-linha REVISÃO (só à esquerda)
    svg+=LN(X(fCol),Y(fR5),X(1),Y(fR5));                    // sub-linha FOLHA (coluna direita)
    svg+=LN(X(fLogo),Y(0),X(fLogo),Y(fR2));                 // vertical do logo (até fim CLIENTE)
    svg+=LN(X(fLogo),Y(fSub),X(1),Y(fSub));                 // divisa PROJETO/TÍTULO
    svg+=LN(X(fCol),Y(fR2),X(fCol),Y(1));                   // coluna direita (DESENHISTA→FOLHA)
    svg+=LN(X(fNum),Y(fR4),X(fNum),Y(1));                   // vertical ANM/CONTEÚDO
    svg+=LN(X(fRev),Y(fR5),X(fRev),Y(1));                   // divisa REVISÃO/REVISOR
    // ---- células ----
    // logo (fundo cinza como no modelo)
    svg+=`<rect x="${X(0)}" y="${Y(0)}" width="${(fLogo*SW).toFixed(2)}" height="${(fR1*SH).toFixed(2)}" fill="#fff" stroke="none"/>`;
    svg+=`<rect x="${SX}" y="${SY}" width="${SW}" height="${SH}" fill="none" stroke="#111" stroke-width="0.5"/>`;
    { // logo oficial CCM ENG (proporção 1250:476), com respiro de 6% na célula
      const cw=fLogo*SW, ch=fR1*SH, pad=Math.min(cw,ch)*0.08;
      let lw=cw-2*pad, lh=lw*476/1250;
      if(lh>ch-2*pad){ lh=ch-2*pad; lw=lh*1250/476; }
      svg+=`<image href="${CCM_LOGO}" x="${(X(0)+(cw-lw)/2).toFixed(2)}" y="${(Y(0)+(ch-lh)/2).toFixed(2)}" width="${lw.toFixed(2)}" height="${lh.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`;
      // logo do CLIENTE: canto direito da faixa PROJETO/TÍTULO, se enviada
      if(S.cliLogo){
        const cw2=(1-fLogo)*SW*0.22, ch2=fR1*SH-2*pad;
        svg+=`<image href="${S.cliLogo}" x="${(X(1)-cw2-pad).toFixed(2)}" y="${(Y(0)+pad).toFixed(2)}" width="${cw2.toFixed(2)}" height="${ch2.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`;
      }
    }
    // PROJETO / TÍTULO
    svg+=LB(X(fLogo),Y(0),loT('PROJETO'))+VL(0,Y(fSub*0.78),V.proj,fit(V.proj,(1-fLogo)*SW-4,3.0),'middle',X(fLogo+(1-fLogo)/2));
    svg+=LB(X(fLogo),Y(fSub),loT('TÍTULO'))+VL(0,Y(fR1*0.84),V.area,fit(V.area,(1-fLogo)*SW-4,3.0),'middle',X(fLogo+(1-fLogo)/2));
    // CLIENTE / ENDEREÇO
    svg+=LB(X(0),Y(fR1),loT('CLIENTE'))+VL(X(0),Y(fR2)-1.2,V.cli,fit(V.cli,fLogo*SW-4,2.6),null);
    svg+=LB(X(fLogo),Y(fR1),loT('ENDEREÇO DA OBRA'))+VL(X(fLogo),Y(fR2)-1.2,V.end,fit(V.end,(1-fLogo)*SW-4,2.6),null);
    // PROJETISTA / DESENHISTA
    svg+=LB(X(0),Y(fR2),loT('PROJETISTA'))+VL(X(0),Y(fR3)-1.2,V.prjt,fit(V.prjt,fCol*SW-4,2.6),null);
    svg+=LB(X(fCol),Y(fR2),loT('DESENHISTA'))+VL(X(fCol),Y(fR3)-1.1,V.des,fit(V.des,(1-fCol)*SW-3,2.3),null);
    // EXECUÇÃO / DATA
    svg+=LB(X(0),Y(fR3),loT('EXECUÇÃO'))+VL(X(0),Y(fR4)-1.2,V.exec,fit(V.exec,fCol*SW-4,2.6),null);
    svg+=LB(X(fCol),Y(fR3),loT('DATA'))+VL(X(fCol),Y(fR4)-1.1,V.data,fit(V.data,(1-fCol)*SW-3,2.3),null);
    // ANM / CONTEÚDO / ESCALAS
    svg+=LB(X(0),Y(fR4),loT('ANM'))+VL(X(0),Y(fR5)-0.9,V.num,fit(V.num,fNum*SW-4,2.1),null);
    svg+=LB(X(fNum),Y(fR4),loT('CONTEÚDO'));
    svg+=VL(0,Y(fR4+(1-fR4)*0.48),V.cont1,fit(V.cont1,(fCol-fNum)*SW-3,2.5),'middle',X(fNum+(fCol-fNum)/2));
    svg+=VL(0,Y(fR4+(1-fR4)*0.80),V.cont2,fit(V.cont2,(fCol-fNum)*SW-3,1.9),'middle',X(fNum+(fCol-fNum)/2));
    svg+=LB(X(fCol),Y(fR4),loT('ESCALAS'))+VL(X(fCol),Y(fR5)-0.9,V.esc,fit(V.esc,(1-fCol)*SW-3,2.1),null);
    // REVISÃO / REVISOR
    svg+=LB(X(0),Y(fR5),loT('REVISÃO'))+VL(X(0),Y(1)-1.0,V.data,fit(V.data,fRev*SW-3,2.0),null);
    svg+=LB(X(fRev),Y(fR5),loT('REVISOR'))+VL(X(fRev),Y(1)-1.0,V.revN,fit(V.revN,(fNum-fRev)*SW-3,2.0),null);
    // FOLHA (borda grossa, como no modelo)
    svg+=LB(X(fCol),Y(fR5),loT('FOLHA'));
    svg+=VL(0,Y(1)-1.3,V.folha,fit(V.folha,(1-fCol)*SW-6,3.0),'middle',X(fCol+(1-fCol)/2));
    svg+=`<rect x="${X(fCol).toFixed(2)}" y="${Y(fR5).toFixed(2)}" width="${((1-fCol)*SW).toFixed(2)}" height="${((1-fR5)*SH).toFixed(2)}" fill="none" stroke="#111" stroke-width="0.3"/>`;
    svg+=`</g>`;

    // ---- LEGENDA na metade esquerda da faixa ----
    let LX=mL, LY=SY, LW=mapW-SW; const LH=SH;  // legenda ocupa o espaço restante à esquerda
    /* CAIXA DE TEXTO (notas) — SOMENTE NA PRANCHA A3.
       Fica DENTRO da faixa da legenda, encostada no selo, com moldura e
       título próprios. Ela reserva a sua largura ANTES de a legenda calcular
       as colunas, para que os dois quadros nunca se sobreponham. Em A4 o
       espaço é curto demais e a caixa não é oferecida. */
    const NT=(typeof loNotaGet==='function')? loNotaGet() : null;
    const notaOn = !!(NT && NT.on && S.loPranchaFormato==='a3');
    let notaW=0;
    if(notaOn){
      const pedido=Math.max(30, Math.min(140, +NT.larg||70));
      notaW=Math.min(pedido, Math.max(0, LW-40));   // a legenda nunca fica com menos de 40 mm
      if(notaW<25) notaW=0;                          // sem espaço digno: não desenha
    }
    if(notaW>0) LW=LW-notaW;
    svg+=`<g font-family="Signika, sans-serif">`;
    svg+=`<rect x="${LX}" y="${LY}" width="${LW.toFixed(2)}" height="${LH.toFixed(2)}" fill="#fff" stroke="#111" stroke-width="0.45"/>`;
    svg+=`<text x="${LX+2}" y="${(LY+3.6).toFixed(2)}" font-size="2.6" font-weight="700" letter-spacing="0.5" fill="#111">${loT('LEGENDA')}</text>`;
    svg+=`<line x1="${LX}" y1="${(LY+5).toFixed(2)}" x2="${(LX+LW).toFixed(2)}" y2="${(LY+5).toFixed(2)}" stroke="#111" stroke-width="0.25"/>`;
    if(bandItems && bandItems.length){
      // Legenda maior que o selo => DIVIDE EM COLUNAS (até 4); só depois de
      // esgotar as colunas é que encolhe, e cortar itens é o último recurso.
      const n0=bandItems.length;
      const rowH0=Math.max(3.8*legFS, 2.4*symFS+1.4);
      const rowsFit1=Math.max(1, Math.floor((LH-8)/rowH0 + 1e-6));
      const minColW=Math.max(19, 10*legFS);            // largura mínima legível (mm)
      /* O vão é descontado da largura útil; assim aumentar o espaçamento não
         empurra a última coluna para dentro do selo. */
      const maxCols=Math.max(1, Math.min(4,
        Math.floor((LW+legColGap)/(minColW+legColGap))));
      let ncols=Math.min(maxCols, Math.ceil(n0/rowsFit1));
      let rowsPer=Math.ceil(n0/ncols);
      // encolhe ITERANDO (a altura de linha tem parcela fixa de 1,4 mm que
      // não escala com ks — a fórmula fechada subestimava o encolhimento)
      let ks=1, rowH=rowH0, rowsFit=rowsFit1;
      for(let t=0;t<8 && rowsFit<rowsPer && ks>0.55;t++){
        ks=Math.max(0.55, ks*0.9);
        rowH=Math.max(3.8*legFS*ks, 2.4*symFS*ks+1.4);
        rowsFit=Math.max(1, Math.floor((LH-8)/rowH + 1e-6));
      }
      const sw2=5*symFS*ks, sh2=2.4*symFS*ks;
      const indMM=3*legFS*ks;
      rowsPer=Math.min(rowsPer, rowsFit);
      const maxRows=rowsPer*ncols;                     // capacidade total das colunas
      const f1=2.2*legFS*ks, f2=2.0*legFS*ks;
      /* COLUNAS JUSTAS: cada coluna recebe apenas a largura que o seu maior
         rótulo pede e encosta na seguinte pelo vão escolhido. Distribuir a
         largura da faixa igualmente entre as colunas (comportamento antigo)
         afastava os itens uns dos outros e deixava um vazio enorme entre a
         legenda e o selo. Se o empacotamento natural não couber na faixa,
         volta-se à divisão igual, que nunca ultrapassa o espaço útil. */
      const larguraItem=it=>{
        const fs=it.grp?f1:f2,
          txt=String(it.label==null?'':it.label).length*fs*0.58,
          sym=(it.grp||it.header)?0:(sw2+1.3);
        return (it.indent||0)*indMM+sym+txt;
      };
      const dispon=LW-4;
      let colW=(dispon-(ncols-1)*legColGap)/ncols, colNat=null;
      {
        const nat=[];
        for(let c=0;c<ncols;c++){
          let w=0;
          for(let r=0;r<rowsPer;r++){const it=bandItems[c*rowsPer+r];if(it)w=Math.max(w,larguraItem(it));}
          nat.push(w+1.5);
        }
        const total=nat.reduce((a,b)=>a+b,0)+(ncols-1)*legColGap;
        if(total<=dispon)colNat=nat;
      }
      const colX=c=>{
        if(!colNat)return LX+2+c*(colW+legColGap);
        let x=LX+2;
        for(let k=0;k<c;k++)x+=colNat[k]+legColGap;
        return x;
      };
      // divisórias sutis entre colunas
      for(let c=1;c<ncols;c++){
        const dx=colX(c)-legColGap/2;
        svg+=`<line x1="${dx.toFixed(2)}" y1="${(LY+6).toFixed(2)}" x2="${dx.toFixed(2)}" y2="${(LY+LH-2).toFixed(2)}" stroke="#ddd" stroke-width="0.2"/>`;
      }
      let count=0;
      for(const it of bandItems){
        if(count>=maxRows){ svg+=`<text x="${colX(ncols-1).toFixed(2)}" y="${(LY+8.2+(rowsPer-1)*rowH).toFixed(2)}" font-size="${(1.9*legFS*ks).toFixed(2)}" fill="#888">… +${bandItems.length-count+1} itens</text>`; break; }
        const col=Math.floor(count/rowsPer), row=count%rowsPer;
        const yy=LY+8.2+row*rowH;
        const ix=colX(col)+(it.indent||0)*indMM;
        if(it.grp){ svg+=`<text x="${ix.toFixed(2)}" y="${yy.toFixed(2)}" font-size="${f1.toFixed(2)}" font-weight="700" fill="#111">${esc(it.label)}</text>`; }
        else if(it.header){ svg+=`<text x="${ix.toFixed(2)}" y="${yy.toFixed(2)}" font-size="${f2.toFixed(2)}" font-weight="600" fill="#333">${esc(it.label)}</text>`; }
        else{
          if(it.kind==='ras'||it.kind==='img'||it.kind==='wms'){
            const gid2 = it.ramp ? loRampaId(it.ramp) : ('lg_'+it.kind);
            if(it.ramp){ if(!hatchDefs[gid2]) hatchDefs[gid2]=loRampaDef(gid2,it.ramp); }
            else if(!hatchDefs[gid2]) hatchDefs[gid2]= it.kind==='ras'
              ? `<linearGradient id="${gid2}"><stop offset="0" stop-color="#1a6b3c"/><stop offset="0.5" stop-color="#e8e07a"/><stop offset="1" stop-color="#8d6e63"/></linearGradient>`
              : it.kind==='wms'
              ? `<linearGradient id="${gid2}"><stop offset="0" stop-color="#d9f0ff"/><stop offset="0.48" stop-color="#4699cf"/><stop offset="1" stop-color="#174f78"/></linearGradient>`
              : `<linearGradient id="${gid2}"><stop offset="0" stop-color="#4c7a34"/><stop offset="0.6" stop-color="#9ab87a"/><stop offset="1" stop-color="#cfcfc4"/></linearGradient>`;
            svg+=`<rect x="${ix.toFixed(2)}" y="${(yy-sh2*0.82).toFixed(2)}" width="${sw2.toFixed(2)}" height="${sh2.toFixed(2)}" fill="url(#${gid2})" stroke="#111" stroke-width="0.25"/>`;
          } else if(it.kind==='poly'){ let fill=it.color;
            if(it.hatch&&it.hatch!=='solid'&&it.hatch!=='none'){const hid=layoutHatch(it.hatch,it.color,it.hatchScale);if(hid)fill=`url(#${hid})`;}
            if(it.hatch==='none')fill='none';
            svg+=`<rect x="${ix.toFixed(2)}" y="${(yy-sh2*0.82).toFixed(2)}" width="${sw2.toFixed(2)}" height="${sh2.toFixed(2)}" fill="${fill}" fill-opacity="${it.hatch==='none'?0:(it.hatch&&it.hatch!=='solid'?1:0.7)}" stroke="${it.stroke||it.color}" stroke-width="${(0.3*symFS).toFixed(2)}"/>`;
          } else if(it.kind==='line'){
            svg+=`<line x1="${ix.toFixed(2)}" y1="${(yy-0.8).toFixed(2)}" x2="${(ix+sw2).toFixed(2)}" y2="${(yy-0.8).toFixed(2)}" stroke="${it.color}" stroke-width="${(0.55*symFS).toFixed(2)}" ${it.dash?`stroke-dasharray="${escalaDash(it.dash,0.55*symFS)}"`:''}/>`;
          } else {
            const shp=it.shape&&PT_SYMS[it.shape]? it.shape:'circle';
            if(shp==='circle')
              svg+=`<circle cx="${(ix+sw2/2).toFixed(2)}" cy="${(yy-0.8).toFixed(2)}" r="${(0.9*symFS).toFixed(2)}" fill="${it.color}" stroke="${it.stroke||it.color}" stroke-width="0.25"/>`;
            else
              svg+=ptPlotSVG({shape:shp,def:PT_SYMS[shp],rot:0,dip:null}, it.color, it.stroke||it.color, it.weight||1.5, ix+sw2/2, yy-0.8, 3*symFS);
          }
          svg+=`<text x="${(ix+sw2+1.3).toFixed(2)}" y="${yy.toFixed(2)}" font-size="${f2.toFixed(2)}" fill="#111">${esc(it.label)}</text>`;
        }
        count++;
      }
    } else {
      svg+=`<text x="${LX+2}" y="${(LY+9).toFixed(2)}" font-size="1.9" fill="#999">(sem itens — ligue camadas ou a opção Legenda)</text>`;
    }
    // ---- CAIXA DE TEXTO ao lado da legenda (A3) ----
    if(notaW>0){
      const NX=LX+LW, NY=LY, NW=notaW, NH=LH;
      svg+=`<rect x="${NX.toFixed(2)}" y="${NY.toFixed(2)}" width="${NW.toFixed(2)}" height="${NH.toFixed(2)}" fill="#fff" stroke="#111" stroke-width="0.45"/>`;
      const tit=String(NT.titulo==null?'NOTAS':NT.titulo).trim();
      let y=NY+3.6;
      if(tit){
        svg+=`<text x="${(NX+2).toFixed(2)}" y="${y.toFixed(2)}" font-size="2.6" font-weight="700" letter-spacing="0.5" fill="#111">${esc(tit)}</text>`;
        svg+=`<line x1="${NX.toFixed(2)}" y1="${(NY+5).toFixed(2)}" x2="${(NX+NW).toFixed(2)}" y2="${(NY+5).toFixed(2)}" stroke="#111" stroke-width="0.25"/>`;
        y=NY+8.2;
      }else y=NY+4.4;
      /* Quebra de linha por largura ESTIMADA (0,55×corpo por caractere), o
         mesmo critério do resto do layout: determinístico, sem medir no DOM,
         e portanto igual na tela, no PDF e no PNG. Respeita as quebras que o
         usuário digitou e marca com “…” o que não couber na altura. */
      const fs=Math.max(1.4, Math.min(3.2, (+NT.fs||2.0)));
      const maxCh=Math.max(6, Math.floor((NW-4)/(fs*0.55)));
      const linhas=[];
      String(NT.texto||'').split(/\r?\n/).forEach(par=>{
        const p2=par.replace(/\s+$/,'');
        if(!p2){ linhas.push(''); return; }
        let atual='';
        p2.split(/\s+/).forEach(pal=>{
          if(!atual){ atual=pal; return; }
          if((atual+' '+pal).length<=maxCh) atual+=' '+pal;
          else { linhas.push(atual); atual=pal; }
        });
        // palavra maior que a linha: parte no limite
        const quebraLonga=t=>{ while(t.length>maxCh){ linhas.push(t.slice(0,maxCh)); t=t.slice(maxCh); } return t; };
        atual=quebraLonga(atual);
        if(atual) linhas.push(atual);
      });
      const passo=fs*1.45, cabem=Math.max(0, Math.floor((NY+NH-1.5-y)/passo));
      const mostra=linhas.slice(0, cabem);
      if(linhas.length>cabem && mostra.length) mostra[mostra.length-1]=mostra[mostra.length-1].replace(/.{0,2}$/,'…');
      mostra.forEach((ln,i)=>{
        if(!ln) return;
        svg+=`<text x="${(NX+2).toFixed(2)}" y="${(y+i*passo).toFixed(2)}" font-size="${fs.toFixed(2)}" fill="#111">${esc(ln)}</text>`;
      });
      if(!String(NT.texto||'').trim())
        svg+=`<text x="${(NX+2).toFixed(2)}" y="${y.toFixed(2)}" font-size="1.9" fill="#999">(caixa vazia — escreva no botão A da barra)</text>`;
    }
    svg+=`</g>`;
  }

  svg+=`<defs>${Object.values(hatchDefs).join('')}</defs>`;
  svg+='</svg>';
  const Z=S.loZoom||1;
  wrap.innerHTML=`<div class="sheet" style="width:${(PW*3*Z).toFixed(1)}px;height:${(PH*3*Z).toFixed(1)}px">${svg}</div>`;
  const s=wrap.querySelector('svg'); s.setAttribute('width','100%'); s.setAttribute('height','100%');
  S._lastSVG=svg;
  syncZoomUI();
}

/* ---------------------------------------------------------------------------
   ZOOM DA FOLHA (modo Layout)
   A folha é um <div class="sheet"> em px com o SVG a 100%. Zoom = mudar o
   tamanho do div: o SVG é vetorial, então não perde nitidez, e todas as
   conversões mm↔px do arrastar/🎯 usam getBoundingClientRect — seguem certas.
   Roda        → zoom da folha (0,15×–10×), ancorado no cursor
   Ctrl+roda   → muda a ESCALA do mapa (1:X) e redesenha
   --------------------------------------------------------------------------- */
S.loZoom=1;
function syncZoomUI(){
  const b=document.getElementById('btnZoomFit');
  if(b) b.textContent=Math.round((S.loZoom||1)*100)+'%';
}
/* Re-render automático da ORTOFOTO quando o zoom da folha assenta: o MDT já
   sai da grade nativa (nítido em qualquer zoom), mas a ortofoto é lida no dpi
   do build — sem isto, aproximar a folha exigia clicar Renderizar de novo.  */
function loZoomAutoOrtho(){
  /* COLISÃO DE NOMES: este temporizador usava S._loT, o MESMO campo em que
     buildLayout guarda a transformação da moldura (x0/y1/mmPerM/mL/mT/...).
     Ao mexer no zoom da folha, o objeto virava um id de timer e o arrasto do
     CENTRO do mapa parava de funcionar (dentroDoMapa lia PW indefinido).
     O timer passa a ter campo próprio. */
  clearTimeout(S._loOrthoTimer);
  S._loOrthoTimer=setTimeout(()=>{
    if(document.getElementById('layout').style.display==='none') return;
    if(!(S.img && S.img._img0 && S.img.visible!==false)) return;
    const alvo=Math.min(300, Math.max(150, 96*(S.loZoom||1)*1.4));
    if(S._lastOrthoDpi && alvo<=S._lastOrthoDpi*1.15) return;  // já basta
    buildLayout();                                             // preserva S.loZoom
  }, 450);
}
function setLoZoom(z, ev){
  loZoomAutoOrtho();
  const wrap=document.getElementById('sheetWrap');
  const sheet=wrap && wrap.querySelector('.sheet');
  z=Math.max(0.15, Math.min(10, z));
  if(!sheet || !S._loPaper){ S.loZoom=z; syncZoomUI(); return; }
  const {PW,PH}=S._loPaper;
  const r0=sheet.getBoundingClientRect();
  // ponto do papel sob o cursor (fração 0..1) — âncora do zoom
  const fx=ev? Math.max(0,Math.min(1,(ev.clientX-r0.left)/r0.width)) : 0.5;
  const fy=ev? Math.max(0,Math.min(1,(ev.clientY-r0.top )/r0.height)) : 0.5;
  const ax=ev? ev.clientX : r0.left+r0.width/2;
  const ay=ev? ev.clientY : r0.top +r0.height/2;
  S.loZoom=z;
  sheet.style.width =(PW*3*z).toFixed(1)+'px';
  sheet.style.height=(PH*3*z).toFixed(1)+'px';
  const r1=sheet.getBoundingClientRect();
  wrap.scrollLeft += (r1.left + fx*r1.width ) - ax;
  wrap.scrollTop  += (r1.top  + fy*r1.height) - ay;
  syncZoomUI();
}
function fitLoZoom(){
  const wrap=document.getElementById('sheetWrap');
  if(!wrap || !S._loPaper) return;
  const {PW,PH}=S._loPaper;
  const z=Math.min((wrap.clientWidth-40)/(PW*3), (wrap.clientHeight-40)/(PH*3));
  setLoZoom(isFinite(z)&&z>0? z : 1, null);
  wrap.scrollLeft=(wrap.scrollWidth-wrap.clientWidth)/2;
  wrap.scrollTop =0;
}
(function(){
  const wrap=document.getElementById('sheetWrap');
  wrap.addEventListener('wheel', e=>{
    if(!S._loPaper) return;
    e.preventDefault();                       // sem isso a página/rolagem rouba o gesto
    if(e.ctrlKey||e.metaKey){                 // ---- escala cartográfica 1:X ----
      const inp=document.getElementById('loScale');
      const cur=+inp.value||5000;
      const PASSOS=(typeof ESCALA_PASSOS!=='undefined'&&ESCALA_PASSOS.length)? ESCALA_PASSOS :
                   [100,200,250,500,1000,1500,2000,2500,3000,4000,5000,7500,
                    10000,15000,20000,25000,50000,75000,100000,250000,500000,1000000];
      let i=PASSOS.findIndex(v=>v>=cur); if(i<0) i=PASSOS.length-1;
      if(e.deltaY<0) i=Math.max(0,i-1);        // roda p/ cima = aproxima (escala menor)
      else i=Math.min(PASSOS.length-1, (PASSOS[i]===cur? i+1 : i));
      const nv=PASSOS[i];
      if(nv!==cur){ inp.value=nv; buildLayout(); toast('Escala 1:'+nv.toLocaleString('pt-BR')); }
      return;
    }
    const f=Math.exp(-e.deltaY*0.0015);       // ---- zoom da folha ----
    setLoZoom((S.loZoom||1)*f, e);
  }, {passive:false});
  wrap.addEventListener('dblclick', e=>{      // duplo clique fora do papel = ajustar
    if(e.target.closest && e.target.closest('.sheet')) return;
    fitLoZoom();
  });
  const bi=document.getElementById('btnZoomIn'),  bo=document.getElementById('btnZoomOut'),
        bf=document.getElementById('btnZoomFit');
  if(bi) bi.onclick=()=>setLoZoom((S.loZoom||1)*1.25, null);
  if(bo) bo.onclick=()=>setLoZoom((S.loZoom||1)/1.25, null);
  if(bf) bf.onclick=fitLoZoom;
})();
function esc(s){return String(s).replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));}

async function exportLayoutSVG(){ if(!S._lastSVG){await buildLayout();} download(new Blob([S._lastSVG],{type:'image/svg+xml'}),'layout.svg'); }
function rasterizeLayout(dpi){ // Promise<canvas>
  return new Promise(async(res,rej)=>{
    // O SVG em tela pode ter a ortofoto em dpi reduzido (preview do Layout).
    // Exportar exige o build pleno: reconstrói com S._exporting antes de rasterizar.
    if(!S._lastSVG || (S._lastOrthoDpi && S._lastOrthoDpi<300)){
      S._exporting=true;
      try{ await buildLayout(); } finally{ S._exporting=false; }
    }
    // papel EFETIVO do último render (no modo A4·selo o seletor pode dizer outra coisa)
    const P=S._loPaper||(()=>{const [a,b]=PAPER[document.getElementById('loPaper').value]||PAPER.a4l;return {PW:a,PH:b};})();
    const scaleFactor=(dpi||200)/25.4;  // px por mm
    const img=new Image(); const svgBlob=new Blob([S._lastSVG],{type:'image/svg+xml;charset=utf-8'});
    const url=URL.createObjectURL(svgBlob);
    img.onload=()=>{ const cv=document.createElement('canvas');
      cv.width=Math.round(P.PW*scaleFactor); cv.height=Math.round(P.PH*scaleFactor);
      const ctx=cv.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);
      ctx.drawImage(img,0,0,cv.width,cv.height); URL.revokeObjectURL(url); res(cv); };
    img.onerror=()=>{URL.revokeObjectURL(url); rej(new Error('Falha ao rasterizar'));};
    img.src=url;
  });
}

/* ---------- Exportação PDF (autocontida, sem bibliotecas externas) ----------
   Gera um PDF de 1 página com o tamanho EXATO do papel do layout (A4 = 210×297 mm)
   e a folha rasterizada preenchendo a página inteira, 1:1. As margens do desenho
   (direita 25 mm, demais 7 mm no modo A4·selo) já vêm embutidas no SVG, de modo
   que o PDF sai idêntico à imagem exibida na tela.                              */
function b64ToBytes(b64){
  const bin=atob(b64); const u=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
  return u;
}
/* PDF multipágina — uma página por prancha. pages=[{jpeg,PW,PH,pxW,pxH}] */
function buildPDFmulti(pages){
  const MM2PT=72/25.4, enc=t=>new TextEncoder().encode(t);
  const n=pages.length;
  // objetos: 1=Catalog, 2=Pages, depois por página: Page, Contents, Image
  const kids=[]; for(let i=0;i<n;i++) kids.push(`${3+i*3} 0 R`);
  const objs=[];
  objs[1]={b:enc(`<< /Type /Catalog /Pages 2 0 R >>`)};
  objs[2]={b:enc(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${n} >>`)};
  pages.forEach((pg,i)=>{
    const o=3+i*3, W=pg.PW*MM2PT, H=pg.PH*MM2PT;
    objs[o]={b:enc(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] `+
      `/Resources << /XObject << /Im0 ${o+2} 0 R >> >> /Contents ${o+1} 0 R >>`)};
    const c=`q ${W.toFixed(2)} 0 0 ${H.toFixed(2)} 0 0 cm /Im0 Do Q`;
    objs[o+1]={b:enc(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`)};
    objs[o+2]={img:pg.jpeg, hdr:enc(`<< /Type /XObject /Subtype /Image /Width ${pg.pxW} /Height ${pg.pxH} `+
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`)};
  });
  const total=2+n*3;
  const parts=[]; let off=0; const xref=[];
  const push=u=>{parts.push(u); off+=u.length;};
  push(enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  for(let i=1;i<=total;i++){
    xref[i]=off;
    push(enc(`${i} 0 obj\n`));
    const o=objs[i];
    if(o.img){ push(o.hdr); push(o.img); push(enc('\nendstream')); }
    else push(o.b);
    push(enc('\nendobj\n'));
  }
  const xrefPos=off;
  let x=`xref\n0 ${total+1}\n0000000000 65535 f \n`;
  for(let i=1;i<=total;i++) x+=String(xref[i]).padStart(10,'0')+' 00000 n \n';
  x+=`trailer\n<< /Size ${total+1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  push(enc(x));
  return new Blob(parts,{type:'application/pdf'});
}

/* Exporta TODAS as pranchas num único PDF, uma página por prancha */
async function exportAllPlatesPDF(){
  if(S.loMode!=='a4'){ toast('Disponível no modo Prancha · selo'); return; }
  platesInit(); plateCapture();
  const volta=S.plateId;
  const pages=[];
  try{
    for(const pl of S.plates){
      showLoad(`Gerando “${pl.name}” (${pages.length+1}/${S.plates.length})…`);
      S.plateId=pl.id; plateApply(pl);
      await buildLayout();
      const P=S._loPaper;
      const cv=await rasterizeLayout(300);
      pages.push({jpeg:b64ToBytes(cv.toDataURL('image/jpeg',0.92).split(',')[1]),
                  PW:P.PW, PH:P.PH, pxW:cv.width, pxH:cv.height});
    }
    const blob=buildPDFmulti(pages);
    hideLoad();
    download(blob,'pranchas.pdf');
    toast(`PDF com ${pages.length} prancha(s) · 300 dpi`);
  }catch(e){ hideLoad(); toast('Falha ao gerar o PDF: '+e.message); }
  finally{
    const pl=S.plates.find(p=>p.id===volta);
    if(pl){ S.plateId=volta; plateApply(pl); renderPlateTabs(); buildLayout(); }
  }
}

function buildPDF(jpegBytes, PWmm, PHmm, pxW, pxH){
  const MM2PT=72/25.4;
  const W=(PWmm*MM2PT), H=(PHmm*MM2PT);
  const enc=s=>new TextEncoder().encode(s);
  const objs=[];
  objs[1]=enc('<< /Type /Catalog /Pages 2 0 R >>');
  objs[2]=enc('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objs[3]=enc(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(2)} ${H.toFixed(2)}] `+
              `/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`);
  const content=`q ${W.toFixed(2)} 0 0 ${H.toFixed(2)} 0 0 cm /Im0 Do Q`;
  objs[4]=enc(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const imgHdr=enc(`<< /Type /XObject /Subtype /Image /Width ${pxW} /Height ${pxH} `+
                   `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode `+
                   `/Length ${jpegBytes.length} >>\nstream\n`);
  const imgTail=enc('\nendstream');
  const parts=[]; let off=0; const xref=[];
  const push=u=>{parts.push(u); off+=u.length;};
  push(enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  for(let i=1;i<=5;i++){
    xref[i]=off;
    push(enc(`${i} 0 obj\n`));
    if(i===5){ push(imgHdr); push(jpegBytes); push(imgTail); }
    else push(objs[i]);
    push(enc('\nendobj\n'));
  }
  const xrefPos=off;
  let x='xref\n0 6\n0000000000 65535 f \n';
  for(let i=1;i<=5;i++) x+=String(xref[i]).padStart(10,'0')+' 00000 n \n';
  x+=`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  push(enc(x));
  return new Blob(parts,{type:'application/pdf'});
}
async function exportLayoutPDF(){
  try{
    showLoad('Gerando PDF…');
    /* Reaplica o estado GRAVADO na prancha antes de renderizar: o PDF sai com
       o que a prancha contém, e não com o que ficou ligado no modo Mapa.     */
    const plAtual=S.plates.find(p=>p.id===S.plateId);
    if(S.loMode==='a4' && plAtual) plateApply(plAtual);
    await buildLayout();                       // garante SVG e papel atuais
    const P=S._loPaper;
    const cv=await rasterizeLayout(300);        // 300 dpi
    const jpeg=b64ToBytes(cv.toDataURL('image/jpeg',0.92).split(',')[1]);
    const blob=buildPDF(jpeg,P.PW,P.PH,cv.width,cv.height);
    hideLoad();
    const pl=S.plates.find(p=>p.id===S.plateId);
    const fmt=P.format||'auto';
    const nome=(P.mode==='a4' && pl)? pl.name.replace(/[^\w\-]+/g,'_')+'_'+fmt.toUpperCase() : (P.mode==='a4'?'prancha_'+fmt.toUpperCase():'figura');
    download(blob, nome+'.pdf');
    const rot=P.format==='a3l'?'A3 paisagem':P.format==='a4p'?'A4 retrato':'Figura';
    toast(`PDF ${rot} · ${P.PW}×${P.PH} mm · 300 dpi`+(P.mode==='a4'?' · margens 7/7/7/25 mm':''));
  }catch(e){ hideLoad(); toast('Falha ao gerar PDF: '+e.message); }
}
async function exportLayoutPNG(){
  try{ const cv=await rasterizeLayout(); cv.toBlob(b=>download(b,'layout.png'),'image/png'); }
  catch(e){ toast(e.message+' — use SVG'); }
}
/* Entrega de imagem em cascata:
   1) área de transferência (desktop) — Ctrl+V no Word;
   2) folha de COMPARTILHAR (Android) — o Chrome do Android não suporta copiar
      imagem via ClipboardItem; a folha nativa manda direto ao Docs/WhatsApp;
   3) download do PNG, como último recurso.                                  */
async function entregarImagem(blob, nome){
  // 1) copiar
  try{
    if(navigator.clipboard && window.ClipboardItem){
      await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
      toast('Imagem copiada — cole no documento (Ctrl+V)');
      return;
    }
    throw new Error('ClipboardItem indisponível');
  }catch(e1){
    // 2) compartilhar (Android/iOS)
    try{
      const file=new File([blob], nome+'.png', {type:'image/png'});
      if(navigator.canShare && navigator.canShare({files:[file]})){
        await navigator.share({files:[file], title:nome});
        return;                                    // usuário escolheu o destino
      }
      throw new Error('share indisponível');
    }catch(e2){
      if(e2 && e2.name==='AbortError') return;     // usuário fechou a folha: silêncio
      // 3) baixar
      download(blob, nome+'.png');
      toast('Este navegador não copia/compartilha imagem — PNG baixado em Downloads');
    }
  }
}
/* Cache do PNG do layout. Existe por causa da ativação transiente: o
   clipboard só aceita escrita nos primeiros segundos após o clique, e
   rasterizar uma planta grande demora mais que isso. Com o blob pronto em
   mãos, a escrita é imediata — e escrever um blob PRONTO, e não uma promessa,
   é o que o Google Docs consegue colar.                                     */
let _loBlob=null, _loBlobKey=null;
function loBlobKey(){
  const P=S._loPaper||{};
  return (S._lastSVG?S._lastSVG.length:0)+'|'+(P.PW||0)+'x'+(P.PH||0)+'|'+(S._lastOrthoDpi||0);
}
function loBlobInvalida(){ _loBlob=null; _loBlobKey=null; }

async function copyLayoutIMG(){
  const chave=loBlobKey();
  // 1) cache válido: escreve o blob pronto, dentro da ativação do clique
  if(_loBlob && _loBlobKey===chave){
    try{
      await navigator.clipboard.write([new ClipboardItem({'image/png':_loBlob})]);
      toast('Imagem copiada — cole no documento (Ctrl+V)'); return;
    }catch(e){ await entregarImagem(_loBlob,'layout'); return; }
  }
  // 2) primeira vez: rasteriza, guarda e tenta copiar
  let blob=null;
  try{
    showLoad('Gerando imagem…');
    const cv=await rasterizeLayout();
    blob=await new Promise(r=>cv.toBlob(r,'image/png'));
  }catch(e){ hideLoad(); toast('Falha: '+(e&&e.message||e)); return; }
  finally{ hideLoad(); }
  if(!blob){ toast('Não foi possível gerar a imagem'); return; }
  _loBlob=blob; _loBlobKey=chave;
  try{
    await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
    toast('Imagem copiada — cole no documento (Ctrl+V)');
  }catch(e){
    // a rasterização consumiu a ativação; o próximo toque copia do cache
    toast('Imagem pronta — toque em Copiar novamente para colar');
  }
}

/* ============================================================================
   PUBLICAÇÃO PARA O CLIENTE
   Gera um HTML independente (viewer) contendo SÓ as camadas/rasters marcados:
   - vetores serializados em WGS84 com o estilo congelado (pontos já viram o
     SVG do símbolo, calculado AQUI — o viewer não precisa da biblioteca);
   - rasters/ortofoto entram como PNG (o canvas de tela) com bounds;
   - ferramentas do cliente: ligar/desligar camadas e RÉGUA 2D. Nada mais.
   A medição usa proj4 com o CRS de trabalho embutido — metros de verdade.
   ========================================================================== */
function refreshPubList(){
  const box=document.getElementById('pubList'); if(!box) return;
  const havia=box.querySelectorAll('input[type=checkbox]').length>0;
  const prev=new Set([...box.querySelectorAll('input:checked')].map(i=>i.dataset.k));
  const row=(k,nome,tipo,padrao)=>`<label style="display:flex;gap:7px;align-items:center;padding:2px 0;cursor:pointer">
    <input type="checkbox" data-k="${k}" ${(havia?prev.has(k):padrao)?'checked':''} style="width:auto;accent-color:var(--amber)">
    <span style="flex:1">${esc(nome)}</span><span class="tag">${tipo}</span></label>`;
  let h='';
  S.layers.forEach(L=>h+=row('L'+L.id, L.name, L.gtype, true));
  /* GeoTIFF/MDT nunca entra por suposição: precisa ser marcado pelo usuário. */
  S.rasters.forEach(r=>h+=row('R'+r.id, r.name, 'raster', false));
  if(S.img && S.img.url) h+=row('I0', S.img.name||'ortofoto', 'imagem', true);
  box.innerHTML=h||'<i style="color:var(--ink-dim)">Nada carregado ainda.</i>';
}
async function gerarPublicacao(){
  const marc=new Set([...document.querySelectorAll('#pubList input:checked')].map(i=>i.dataset.k));
  if(!marc.size){ toast('Marque ao menos uma camada'); return; }
  const views=(document.getElementById('pubViews')||{}).value||'ambos';
  let inicial=(document.getElementById('pubInitial')||{}).value||'2d';
  if(views==='2d') inicial='2d';
  if(views==='3d') inicial='3d';
  const permite3D=views!=='2d';
  const demEscolhido=(document.getElementById('pubDem')||{}).value||'';
  if(permite3D && !demEscolhido){
    toast('Escolha a superfície que será usada na visualização e medição 3D');
    return;
  }
  showLoad('Montando publicação…');
  await new Promise(r=>setTimeout(r,10));
  const titulo=document.getElementById('pubTitle').value||('Publicação — '+new Date().toLocaleDateString('pt-BR'));

  // ---- vetores (WGS84, estilo congelado) ----
  const lyrs=[];
  for(const L of S.layers){
    if(!marc.has('L'+L.id)) continue;
    const fts=[];
    for(const f of L.features){
      const st=featureStyle(L,f);
      const cls=(L.sym.mode!=='single')? classOf(L,f):null;
      if(cls && cls.vis===false) continue;
      const geo=(L.gtype==='point')? f.geom.map(pt=>{const w=toWGS(L.crs,pt[0],pt[1]);return [w[1],w[0]];})
        : (f.multi? f.geom.map(rg=>rg.map(pt=>{const w=toWGS(L.crs,pt[0],pt[1]);return [w[1],w[0]];}))
                  : [f.geom.map(pt=>{const w=toWGS(L.crs,pt[0],pt[1]);return [w[1],w[0]];})]);
      const o={g:geo, c:st.color, k:st.stroke, w:+st.weight||1.5, fo:+st.fill||0};
      if(st.dash&&st.dash!=='solid') o.d=st.dash;
      if(L.gtype==='point'){ const ps=ptStyleOf(L,f,st); o.svg=ptSVG(ps,st.color,st.stroke,st.weight); o.sz=ps.size; }
      const lb=labelText(L,f); if(lb) o.t=String(lb);
      fts.push(o);
    }
    lyrs.push({nome:L.name, tipo:L.gtype, fts});
  }
  // ---- rasters / ortofoto (PNG + bounds WGS) ----
  const rst=[];
  const bbWGS=bb=>{ const sw=toWGS(S.workCRS,bb[0],bb[1]), ne=toWGS(S.workCRS,bb[2],bb[3]);
    return [[sw[1],sw[0]],[ne[1],ne[0]]]; };
  for(const r of S.rasters){
    if(!marc.has('R'+r.id)) continue;
    if(!r._url){ try{ const cv=rasterCanvas(r); if(cv) r._url=cv.toDataURL('image/png'); }catch(e){} }
    if(r._url) rst.push({nome:r.name, url:r._url, b:bbWGS(rasterBounds(r)), op:r.style.opacity??0.8});
  }
  if(S.img && S.img.url && marc.has('I0')){
    const alvo=3072;                    // embutida em alta; o CLIENTE ajusta a exibição no viewer
    let url=S.img.url, b=S.img.b, bWGS=null;
    if(S.img._img0 && alvo!==S.img._w){                 // relê o TIFF no alvo do slider
      try{ const hi=await orthoWindow(S.img.b, alvo); if(hi){ url=hi.dataURL; b=hi.bb; } }
      catch(e){ console.warn('pub ortho:', e.message); }
    }
    /* O viewer já trabalha em Web Mercator/Leaflet: se caiu na prévia salva,
       reutiliza diretamente seus bounds WGS84, em vez de fingir que a PNG ainda
       corresponde ao retângulo UTM original. */
    if(url===S.img.url){ const wi=layoutOrthoWarpInfo(S.img,S.workCRS); if(wi)bWGS=wi.ll; }
    rst.push({nome:S.img.name||'Ortoimagem', url, b:bWGS||bbWGS(b), op:1});
  }

  // ---- grade do MDS para a medição 3D (quantizada em 16 bits) ----
  let dem=null;
  const demSel=document.getElementById('pubDem');
  const demR=permite3D ? S.rasters.find(r=>String(r.id)===demSel.value) : null;
  if(demR){
    showLoad('Preparando grade 3D…');
    const alvoC=(+document.getElementById('pubGrid').value||1)*1e6;
    let g=demR.d;
    if(g.nc*g.nr>alvoC) g=reduceGrid(g, alvoC, 8192);
    let zmin=Infinity, zmax=-Infinity;
    for(let i=0;i<g.z.length;i++){ const v=g.z[i]; if(!isNaN(v)){ if(v<zmin)zmin=v; if(v>zmax)zmax=v; } }
    const esc16=(zmax>zmin)? 65534/(zmax-zmin) : 1;
    const q=new Uint16Array(g.z.length);
    for(let i=0;i<g.z.length;i++){ const v=g.z[i]; q[i]=isNaN(v)?65535:Math.round((v-zmin)*esc16); }
    let bin=''; const u8=new Uint8Array(q.buffer);
    for(let i=0;i<u8.length;i+=32768) bin+=String.fromCharCode.apply(null,u8.subarray(i,i+32768));
    dem={nc:g.nc, nr:g.nr, cs:g.cs, xll:g.xll, yll:g.yll, zmin, esc:esc16, b64:btoa(bin)};
  }

  const dados={t:titulo, crs:S.workCRS, def:CRS_DEFS[S.workCRS]||'', lyrs, rst, dem,
               cfg:{views,inicial,dist:!!document.getElementById('pubMedDist').checked,
                    area:!!document.getElementById('pubMedArea').checked,
                    superficie:demR?demR.name:''},
               database:{catalog:'rasters/catalogo.json',nativeRasters:true,
                         project:S.projectMeta||null},
               logo:CCM_LOGO, cli:S.cliLogo||null, ger:new Date().toLocaleString('pt-BR')};
  const html=pubHTML(dados);
  hideLoad();
  const pubNome=titulo.replace(/[^\w\-]+/g,'_')+'.html';
  const pubBlob=new Blob([html],{type:'text/html'});
  download(pubBlob,pubNome);
  // Quando há pasta de projeto autorizada, mantém uma cópia do visualizador
  // junto do catálogo e dos GeoTIFFs nativos. Esse conjunto é o pacote que
  // deve ser hospedado/encaminhado, sem depender do raster reduzido do .ccmgis.
  try{
    const ds=await projectDirs(false);
    if(ds){ await projectWrite(ds.raiz,pubNome,pubBlob); await projectWriteCatalog(ds); }
  }catch(e){ console.warn('publicação na pasta do projeto:',e&&e.message); }
  const po=document.getElementById('pubOut');
  if(po) po.innerHTML=`Gerado: <b>${lyrs.length}</b> camada(s), <b>${rst.length}</b> imagem(ns)`+
    (dem?`, terreno 3D <b>${dem.nc}×${dem.nr}</b> — ${esc(demR.name)}`:', somente 2D')+
    ` · visualização <b>${views==='ambos'?'2D + 3D':views.toUpperCase()}</b> · <b>${(html.length/1e6).toFixed(1)} MB</b><br>`+
    `<span style="color:var(--ink-dim)">HTML pronto. Se a pasta de trabalho estiver autorizada,
      uma cópia foi gravada junto de rasters/catalogo.json e dos GeoTIFFs nativos.</span>`;
  toast(`Publicação gerada · ${(html.length/1e6).toFixed(1)} MB`);
}
function pubHTML(D){
  const J=JSON.stringify(D).replace(/<\/script/gi,'<\\/script');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(D.t)}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.11.0/proj4.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"><\/script>
<style>
html,body{margin:0;height:100%;font-family:'Signika',sans-serif}
#map{position:absolute;inset:0}
#scene3d{position:absolute;inset:0;display:none;background:linear-gradient(#b9d9ef,#eef4f7 55%,#d4d8cf)}
#top{position:absolute;top:0;left:0;right:0;z-index:800;background:#ffffffee;border-bottom:1px solid #ddd;
  display:flex;align-items:center;gap:12px;padding:6px 14px}
#top img{height:34px}
#top .t{font-weight:700;font-size:15px;color:#222}
#top .s{font-size:11px;color:#888;margin-left:auto;text-align:right}
#viewCtl{position:absolute;right:12px;top:62px;z-index:900;display:flex;gap:5px;background:#ffffffea;
  border:1px solid #ccc;border-radius:10px;padding:5px;box-shadow:0 2px 8px #0002}
#viewCtl button{border:1px solid #bbb;border-radius:7px;background:#fff;padding:7px 10px;font-weight:650;cursor:pointer}
#viewCtl button.on{background:#173b57;color:#fff;border-color:#173b57}
#measureCtl{position:absolute;right:12px;top:112px;z-index:900;display:flex;gap:5px}
#measureCtl button{width:44px;height:40px;border-radius:9px;border:1px solid #bbb;background:#fff;
  font-size:18px;cursor:pointer;box-shadow:0 2px 8px #0002}
#measureCtl button.on{background:#f5a524;border-color:#c77d00}
#mOut{position:absolute;right:12px;top:158px;z-index:900;background:#fff;border:1px solid #ccc;border-radius:10px;
  padding:9px 12px;font:12px/1.7 Signika,sans-serif;display:none;max-width:250px;box-shadow:0 2px 10px #0002;white-space:pre-wrap}
#imgCtl{position:absolute;left:12px;bottom:24px;z-index:800;background:#ffffffee;border:1px solid #ccc;
  border-radius:10px;padding:9px 12px;font-size:12px;box-shadow:0 2px 10px #0002;max-width:250px}
#imgCtl b{font-size:11px;color:#666;letter-spacing:.4px}
#imgCtl .rw{margin:6px 0 2px}
#imgCtl input[type=range]{width:100%;accent-color:#f5a524}
#imgCtl .nm{display:flex;justify-content:space-between;color:#333}
#imgCtl .nm span:last-child{color:#999}
#layer3Ctl{position:absolute;left:12px;top:66px;z-index:900;display:none;background:#ffffffee;border:1px solid #ccc;
  border-radius:10px;padding:9px 12px;font-size:12px;box-shadow:0 2px 10px #0002;max-width:260px;max-height:45vh;overflow:auto}
#layer3Ctl b{display:block;font-size:11px;color:#666;letter-spacing:.4px;margin-bottom:4px}
#layer3Ctl label{display:flex;align-items:center;gap:7px;padding:3px 0}
.gc-pt{background:none!important;border:none!important}
.lbl{background:#ffffffd9;border:1px solid #bbb;border-radius:4px;padding:0 4px;font-size:10.5px;white-space:nowrap}
</style></head><body>
<div id="map"></div>
<div id="scene3d"></div>
<div id="top"><img alt="CCM"><span class="t"></span>
  <span id="cliSlot"></span><span class="s"></span></div>
<div id="viewCtl"><button id="v2">Mapa 2D</button><button id="v3">Terreno 3D</button></div>
<div id="measureCtl"><button id="mDist" title="Medir distância 2D/3D">📏</button><button id="mArea" title="Medir área">▱</button></div>
<div id="mOut"></div>
<div id="imgCtl" style="display:none"></div>
<div id="layer3Ctl"></div>
<script>
const D=${J};
document.querySelector('#top .t').textContent=D.t;
document.querySelector('#top img').src=D.logo;
if(D.cli){const i=document.createElement('img');i.src=D.cli;document.getElementById('cliSlot').appendChild(i);}
document.querySelector('#top .s').innerHTML='gerado em '+D.ger+'<br>medições de caráter indicativo';
if(D.def) proj4.defs(D.crs,D.def);
const map=L.map('map',{zoomControl:true});
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {maxZoom:24,maxNativeZoom:19,attribution:'Esri'}).addTo(map);
const ovl={}, todos=L.featureGroup(), imgs=[];
for(const r of D.rst){ const ov=L.imageOverlay(r.url,r.b,{opacity:r.op}).addTo(map);
  ovl[r.nome+' (imagem)']=ov; imgs.push({r,ov});
  todos.addLayer(L.rectangle(r.b,{opacity:0,fillOpacity:0})); }
/* ---- barras de ajuste do cliente: resolução de exibição + opacidade ---- */
if(imgs.length){
  const ic=document.getElementById('imgCtl'); ic.style.display='block';
  let h='<b>IMAGENS</b>';
  imgs.forEach((o,i)=>{ h+='<div class="rw"><div class="nm"><span>'+o.r.nome+
    '</span><span id="op'+i+'">'+Math.round((o.r.op)*100)+'%</span></div>'+
    '<input type="range" min="0" max="100" value="'+Math.round(o.r.op*100)+'" data-i="'+i+'" class="op"></div>'; });
  h+='<div class="rw"><div class="nm"><span>Resolução de exibição</span><span id="rzv">100%</span></div>'+
     '<input type="range" min="25" max="100" step="25" value="100" id="rz"></div>';
  ic.innerHTML=h;
  ic.querySelectorAll('.op').forEach(sl=>sl.oninput=()=>{ const i=+sl.dataset.i;
    imgs[i].ov.setOpacity(sl.value/100);
    document.getElementById('op'+i).textContent=sl.value+'%'; });
  /* resolução de exibição: reamostra a imagem embutida via canvas — alivia
     aparelhos fracos; 100% volta ao original (que fica guardado em r.url)   */
  const rz=document.getElementById('rz');
  rz.oninput=()=>{ document.getElementById('rzv').textContent=rz.value+'%'; };
  rz.onchange=()=>{
    const k=rz.value/100;
    imgs.forEach(o=>{
      if(k>=1){ o.ov.setUrl(o.r.url); return; }
      const im=new Image();
      im.onload=()=>{ const cv=document.createElement('canvas');
        cv.width=Math.max(64,Math.round(im.width*k)); cv.height=Math.max(64,Math.round(im.height*k));
        cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);
        o.ov.setUrl(cv.toDataURL('image/jpeg',0.85)); };
      im.src=o.r.url;
    });
  };
}
for(const Ly of D.lyrs){
  const g=L.layerGroup();
  for(const f of Ly.fts){
    let m;
    if(Ly.tipo==='point'){
      f.g.forEach(pt=>{ const mk=f.svg? L.marker(pt,{icon:L.divIcon({className:'gc-pt',iconSize:[f.sz,f.sz],iconAnchor:[f.sz/2,f.sz/2],html:f.svg})})
        : L.circleMarker(pt,{radius:5,color:f.k,weight:f.w,fillColor:f.c,fillOpacity:.9});
        if(f.t) mk.bindTooltip(f.t,{permanent:true,direction:'right',className:'lbl',offset:[8,0]});
        g.addLayer(mk); todos.addLayer(mk); });
    } else if(Ly.tipo==='line'){
      f.g.forEach(seg=>{ m=L.polyline(seg,{color:f.c,weight:f.w,dashArray:f.d==='dash'?'8 5':f.d==='dot'?'2 4':null});
        if(f.t) m.bindTooltip(f.t,{permanent:true,direction:'center',className:'lbl'});
        g.addLayer(m); todos.addLayer(m); });
    } else {
      m=L.polygon(f.g,{color:f.k,weight:f.w,fillColor:f.c,fillOpacity:f.fo,dashArray:f.d==='dash'?'8 5':null});
      if(f.t) m.bindTooltip(f.t,{permanent:true,direction:'center',className:'lbl'});
      g.addLayer(m); todos.addLayer(m);
    }
  }
  g.addTo(map); ovl[Ly.nome]=g;
}
L.control.layers(null,ovl,{collapsed:false,position:'topleft'}).addTo(map);
try{ map.fitBounds(todos.getBounds().pad(0.06)); }catch(e){ map.setView([-15,-50],5); }

/* ---- medições 2D/3D e visualização real da superfície ---- */
let modoMed=null, vista='2d', buf=[], grp=L.layerGroup().addTo(map);
const out=document.getElementById('mOut'), bDist=document.getElementById('mDist'),
      bArea=document.getElementById('mArea'), b2=document.getElementById('v2'),
      b3=document.getElementById('v3'), box3=document.getElementById('scene3d');
const M=(lat,lng)=>{ try{ return proj4('WGS84',D.crs,[lng,lat]); }catch(e){ return null; } };
/* grade 3D embutida (Uint16 quantizado) — decodificada uma vez */
let G=null;
if(D.dem){
  const bs=atob(D.dem.b64), u8=new Uint8Array(bs.length);
  for(let i=0;i<bs.length;i++) u8[i]=bs.charCodeAt(i);
  G={nc:D.dem.nc,nr:D.dem.nr,cs:D.dem.cs,xll:D.dem.xll,yll:D.dem.yll,
     zmin:D.dem.zmin,esc:D.dem.esc,q:new Uint16Array(u8.buffer)};
}
function zAt(x,y){ // bilinear na grade quantizada
  if(!G) return NaN;
  const gc=(x-G.xll)/G.cs-0.5, gr=(G.nr-0.5)-(y-G.yll)/G.cs;
  const c0=Math.floor(gc), r0=Math.floor(gr);
  if(c0<0||r0<0||c0>=G.nc-1||r0>=G.nr-1) return NaN;
  const v=i=>{ const t=G.q[i]; return t===65535?NaN:G.zmin+t/G.esc; };
  const fx=gc-c0, fy=gr-r0;
  const z00=v(r0*G.nc+c0),z01=v(r0*G.nc+c0+1),z10=v((r0+1)*G.nc+c0),z11=v((r0+1)*G.nc+c0+1);
  if(isNaN(z00)||isNaN(z01)||isNaN(z10)||isNaN(z11)) return isNaN(z00)?NaN:z00;
  return z00*(1-fx)*(1-fy)+z01*fx*(1-fy)+z10*(1-fx)*fy+z11*fx*fy;
}
function drape(a,b){ // comprimento 3D de um segmento no CRS de trabalho
  const dh=Math.hypot(b[0]-a[0],b[1]-a[1]); if(dh<=0||!G) return dh;
  const n=Math.max(1,Math.min(2000,Math.ceil(dh/Math.max(G.cs*0.5,dh/2000))));
  let L3=0,zp=NaN;
  for(let i=0;i<=n;i++){ const t=i/n;
    const z=zAt(a[0]+t*(b[0]-a[0]), a[1]+t*(b[1]-a[1]));
    if(i>0){ const dz=(!isNaN(z)&&!isNaN(zp))?(z-zp):0; L3+=Math.hypot(dh/n,dz); }
    zp=z; }
  return L3;
}
const F=d=>d>=1000?(d/1000).toFixed(2)+' km':d.toFixed(1)+' m';
const FA=a=>a>=1e6?(a/1e6).toFixed(3)+' km²':a>=10000?(a/10000).toFixed(3)+' ha':a.toFixed(1)+' m²';
function areaXY(P){let a=0;for(let i=0,j=P.length-1;i<P.length;j=i++)a+=P[j][0]*P[i][1]-P[i][0]*P[j][1];return Math.abs(a)/2;}
function redraw(){
  grp.clearLayers();
  if(buf.length>=2) (modoMed==='area'?L.polygon(buf,{color:'#f5a524',weight:3,fillOpacity:.16}):
    L.polyline(buf,{color:'#f5a524',weight:3})).addTo(grp);
  buf.forEach((p,i)=>L.circleMarker(p,{radius:4,color:'#fff',weight:1.5,fillColor:i?'#f5a524':'#37c0aa',fillOpacity:1}).addTo(grp));
  if(buf.length<2){ out.textContent=buf.length?'1 ponto. Clique no próximo.':'Clique no mapa para medir.\\nDuplo clique encerra.'; return; }
  const P=buf.map(p=>M(p[0],p[1])).filter(Boolean);
  if(modoMed==='area'){
    const ar=P.length>=3?areaXY(P):0;
    out.textContent=P.length<3?'Marque pelo menos 3 vértices.':'Área horizontal: '+FA(ar)+'\\nVértices: '+P.length;
    return;
  }
  let t2=0,t3=0,tx='';
  for(let i=1;i<buf.length;i++){
    const a=P[i-1], b=P[i];
    const d2=(a&&b)? Math.hypot(b[0]-a[0],b[1]-a[1]) : map.distance(buf[i-1],buf[i]);
    t2+=d2;
    if(G&&a&&b){ const d3=drape(a,b); t3+=d3; tx+=i+': '+F(d2)+' · 3D '+F(d3)+'\\n'; }
    else tx+=i+': '+F(d2)+'\\n';
  }
  tx+='\\nTotal 2D: '+F(t2);
  if(G) tx+='\\nTotal 3D: '+F(t3)+'  (+'+(t2>0?(100*(t3-t2)/t2).toFixed(1):0)+'%)';
  const za=G?zAt.apply(null,M(buf[0][0],buf[0][1])||[NaN,NaN]):NaN,
        zb=G?zAt.apply(null,M(buf[buf.length-1][0],buf[buf.length-1][1])||[NaN,NaN]):NaN;
  if(!isNaN(za)&&!isNaN(zb)) tx+='\\nCotas A/B: '+za.toFixed(1)+' / '+zb.toFixed(1)+' m · Δz '+(zb-za>=0?'+':'')+(zb-za).toFixed(1)+' m';
  out.textContent=tx;
  L.marker(buf[buf.length-1],{interactive:false,icon:L.divIcon({className:'',html:'<div class="lbl" style="font-weight:700">'+F(G?t3:t2)+(G?' (3D)':'')+'</div>',iconAnchor:[-8,8]})}).addTo(grp);
}
function ativaMed(m){
  modoMed=modoMed===m?null:m; buf=[]; grp.clearLayers(); limpa3DMed();
  bDist.classList.toggle('on',modoMed==='dist'); bArea.classList.toggle('on',modoMed==='area');
  out.style.display=modoMed?'block':'none'; map.getContainer().style.cursor=modoMed?'crosshair':'';
  if(modoMed) redraw();
}
bDist.onclick=()=>ativaMed('dist'); bArea.onclick=()=>ativaMed('area');
map.on('click',e=>{ if(!modoMed||vista!=='2d')return; buf.push([e.latlng.lat,e.latlng.lng]); redraw(); });
map.on('dblclick',e=>{ if(modoMed&&vista==='2d'){L.DomEvent.stop(e);modoMed=null;bDist.classList.remove('on');bArea.classList.remove('on');map.getContainer().style.cursor='';}});

/* Terreno 3D. A malha é uma amostra da superfície escolhida; toda medição,
   porém, usa a grade quantizada completa por drape, não a malha reduzida. */
let renderer=null,scene=null,camera=null,controls=null,terrain=null,ray=null,mouse=null,med3=null,pts3=[];
function init3D(){
  if(renderer||!G||!window.THREE)return;
  scene=new THREE.Scene(); scene.background=new THREE.Color(0xcfe3ef);
  camera=new THREE.PerspectiveCamera(42,box3.clientWidth/box3.clientHeight,.1,1e8);
  renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(box3.clientWidth,box3.clientHeight); box3.appendChild(renderer.domElement);
  controls=new THREE.OrbitControls(camera,renderer.domElement); controls.enableDamping=true;
  scene.add(new THREE.HemisphereLight(0xffffff,0x586652,1.5));
  const dl=new THREE.DirectionalLight(0xffffff,1.1);dl.position.set(-1,2,1);scene.add(dl);
  const sx=(G.nc-1)*G.cs, sy=(G.nr-1)*G.cs, st=Math.max(1,Math.ceil(Math.max(G.nc,G.nr)/190));
  let mn=Infinity,mx=-Infinity;
  for(let r=0;r<G.nr;r+=st)for(let c=0;c<G.nc;c+=st){const z=zAt(G.xll+c*G.cs,G.yll+(G.nr-1-r)*G.cs);if(isFinite(z)){mn=Math.min(mn,z);mx=Math.max(mx,z);}}
  const ex=Math.max(1,Math.min(8,.14*Math.max(sx,sy)/Math.max(1,mx-mn))), cols=Math.ceil((G.nc-1)/st)+1, rows=Math.ceil((G.nr-1)/st)+1;
  const pos=[],cor=[],ind=[];
  for(let rr=0;rr<rows;rr++){const r=Math.min(G.nr-1,rr*st);for(let cc=0;cc<cols;cc++){const c=Math.min(G.nc-1,cc*st);
    let z=zAt(G.xll+c*G.cs,G.yll+(G.nr-1-r)*G.cs);if(!isFinite(z))z=mn;
    const q=(z-mn)/Math.max(1,mx-mn);pos.push(c*G.cs-sx/2,(z-mn)*ex,r*G.cs-sy/2);
    const col=new THREE.Color().setHSL(.30-.22*q,.48,.30+.36*q);cor.push(col.r,col.g,col.b);}}
  for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++){const a=r*cols+c,b=a+1,d=(r+1)*cols+c,e=d+1;ind.push(a,d,b,b,d,e);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(cor,3));geo.setIndex(ind);geo.computeVertexNormals();
  terrain=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82,metalness:0,side:THREE.DoubleSide}));
  terrain.userData={sx,sy,mn,ex};scene.add(terrain);
  const ctl=document.getElementById('layer3Ctl');ctl.innerHTML='<b>CAMADAS 3D</b>';
  const p3=ll=>{let p;try{p=proj4('WGS84',D.crs,[ll[1],ll[0]]);}catch(e){return null;}
    const z=zAt(p[0],p[1]);if(!isFinite(z))return null;
    return new THREE.Vector3(p[0]-G.xll-sx/2,(z-mn)*ex+Math.max(sx,sy)*.002,(G.yll+sy-p[1])-sy/2);};
  D.lyrs.forEach((Ly,li)=>{
    const gg=new THREE.Group();gg.name=Ly.nome;
    Ly.fts.forEach(f=>{
      let color=0x1479bd;try{color=new THREE.Color(f.c||f.k||'#1479bd');}catch(e){}
      if(Ly.tipo==='point'){
        const sg=new THREE.SphereGeometry(Math.max(sx,sy)*.0028,8,6),sm=new THREE.MeshBasicMaterial({color});
        f.g.forEach(pt=>{const v=p3(pt);if(v){const o=new THREE.Mesh(sg,sm);o.position.copy(v);gg.add(o);}});
      }else{
        f.g.forEach(seg=>{const vv=seg.map(p3).filter(Boolean);if(vv.length<2)return;
          const ge=new THREE.BufferGeometry().setFromPoints(vv),ma=new THREE.LineBasicMaterial({color});
          gg.add(Ly.tipo==='polygon'?new THREE.LineLoop(ge,ma):new THREE.Line(ge,ma));});
      }
    });
    scene.add(gg);
    const lb=document.createElement('label'),ck=document.createElement('input'),sp=document.createElement('span');
    ck.type='checkbox';ck.checked=true;ck.onchange=()=>gg.visible=ck.checked;sp.textContent=Ly.nome;
    lb.appendChild(ck);lb.appendChild(sp);ctl.appendChild(lb);
  });
  const grid=new THREE.GridHelper(Math.max(sx,sy)*1.08,10,0x31536a,0x7f9a9a);scene.add(grid);
  camera.position.set(sx*.72,Math.max(sx,sy)*.58,sy*.76);controls.target.set(0,(mx-mn)*ex*.2,0);controls.update();
  ray=new THREE.Raycaster();mouse=new THREE.Vector2();
  renderer.domElement.addEventListener('click',pick3D);
  const anim=()=>{requestAnimationFrame(anim);controls.update();renderer.render(scene,camera);};anim();
}
function limpa3DMed(){pts3=[];if(med3&&scene)scene.remove(med3);med3=null;}
function atualiza3DMed(){
  if(!scene||!terrain||!pts3.length)return;
  if(med3)scene.remove(med3);
  const a=terrain.userData, vv=[];
  pts3.forEach(p=>{const z=zAt(p[0],p[1]);vv.push(new THREE.Vector3(p[0]-G.xll-a.sx/2,(z-a.mn)*a.ex+Math.max(a.sx,a.sy)*.003,(G.yll+a.sy-p[1])-a.sy/2));});
  if(modoMed==='area'&&vv.length>2)vv.push(vv[0].clone());
  const ge=new THREE.BufferGeometry().setFromPoints(vv);med3=new THREE.Line(ge,new THREE.LineBasicMaterial({color:0xf5a524,linewidth:3}));scene.add(med3);
  if(modoMed==='area'){
    out.textContent=pts3.length<3?'Marque pelo menos 3 vértices.':'Área horizontal: '+FA(areaXY(pts3))+'\\nSuperfície: '+D.cfg.superficie;
  }else{
    let d2=0,d3=0;for(let i=1;i<pts3.length;i++){d2+=Math.hypot(pts3[i][0]-pts3[i-1][0],pts3[i][1]-pts3[i-1][1]);d3+=drape(pts3[i-1],pts3[i]);}
    out.textContent='Total 2D: '+F(d2)+'\\nTotal sobre '+D.cfg.superficie+': '+F(d3);
  }
}
function pick3D(e){
  if(!modoMed||vista!=='3d'||!terrain)return;
  const r=renderer.domElement.getBoundingClientRect();mouse.x=2*(e.clientX-r.left)/r.width-1;mouse.y=1-2*(e.clientY-r.top)/r.height;
  ray.setFromCamera(mouse,camera);const h=ray.intersectObject(terrain,false)[0];if(!h)return;
  const a=terrain.userData;pts3.push([G.xll+h.point.x+a.sx/2,G.yll+a.sy-(h.point.z+a.sy/2)]);atualiza3DMed();
}
function setVista(v){
  vista=v;const is3=v==='3d';document.getElementById('map').style.display=is3?'none':'block';box3.style.display=is3?'block':'none';
  b2.classList.toggle('on',!is3);b3.classList.toggle('on',is3);
  document.getElementById('imgCtl').style.display=(!is3&&imgs.length)?'block':'none';
  document.getElementById('layer3Ctl').style.display=is3&&D.lyrs.length?'block':'none';
  if(is3){init3D();if(renderer)renderer.setSize(box3.clientWidth,box3.clientHeight);}else setTimeout(()=>map.invalidateSize(),0);
}
const cfg=D.cfg||{views:'2d',inicial:'2d',dist:true,area:true};
b2.onclick=()=>setVista('2d');b3.onclick=()=>setVista('3d');
b2.style.display=cfg.views==='3d'?'none':'';b3.style.display=cfg.views==='2d'?'none':'';
bDist.style.display=cfg.dist?'':'none';bArea.style.display=cfg.area?'':'none';
if(!G)b3.style.display='none';
setVista((cfg.inicial==='3d'&&G&&cfg.views!=='2d')?'3d':'2d');
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modoMed){buf=[];grp.clearLayers();limpa3DMed();out.textContent='Medição limpa.';}});
window.addEventListener('resize',()=>{if(renderer&&camera){camera.aspect=box3.clientWidth/box3.clientHeight;camera.updateProjectionMatrix();renderer.setSize(box3.clientWidth,box3.clientHeight);}});
<\/script></body></html>`;
}
(function bindPub(){
  const md=document.getElementById('pubModal');
  const syncModoPub=()=>{
    const v=document.getElementById('pubViews').value, ini=document.getElementById('pubInitial'),
          dem=document.getElementById('pubDem'), row=document.getElementById('pubDemRow');
    [...ini.options].forEach(o=>o.disabled=(v==='2d'&&o.value==='3d')||(v==='3d'&&o.value==='2d'));
    if(v==='2d')ini.value='2d'; else if(v==='3d')ini.value='3d';
    dem.disabled=v==='2d'; if(row)row.style.opacity=v==='2d'?'.45':'1';
  };
  const bo=document.getElementById('btnPubOpen');
  if(bo) bo.onclick=()=>{ refreshPubList();
    const ds=document.getElementById('pubDem');
    ds.innerHTML='<option value="">— nenhuma (medição só 2D) —</option>'+
      S.rasters.filter(r=>r.d&&r.d.z).map(r=>`<option value="${r.id}">${esc(r.name)} — ${r.d.nc}×${r.d.nr}</option>`).join('');
    if(S.selRaster&&S.selRaster.d) ds.value=String(S.selRaster.id);
    else if(S.rasters.length) ds.value=String(S.rasters[0].id);
    document.getElementById('pubTitle').value=document.getElementById('pubTitle').value||
      (document.getElementById('loTitle').value||'Publicação');
    syncModoPub();
    md.classList.add('on'); };
  const pv=document.getElementById('pubViews'); if(pv)pv.onchange=syncModoPub;
  const pc=document.getElementById('pubClose'); if(pc) pc.onclick=()=>md.classList.remove('on');
  if(md) md.addEventListener('click',e=>{ if(e.target===md) md.classList.remove('on'); });
  const gr=document.getElementById('pubGrid');
  if(gr) gr.oninput=()=>{ document.getElementById('pubGridV').textContent=(+gr.value).toLocaleString('pt-BR',{minimumFractionDigits:1});
    const mb=(+gr.value*1e6*2/1e6*1.37).toFixed(1);
    document.getElementById('pubGridInfo').textContent='≈ '+mb+' MB no arquivo'; };
  const bp=document.getElementById('btnPub'); if(bp) bp.onclick=gerarPublicacao;
  const cf=document.getElementById('cliLogoFile');
  if(cf) cf.onchange=e=>{ const f=e.target.files[0]; if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{ S.cliLogo=rd.result;
      document.getElementById('cliLogoInfo').innerHTML=`Logo do cliente: <b>${esc(f.name)}</b> (${(f.size/1024).toFixed(0)} kB) ✔`;
      toast('Logo do cliente carregada — aparecerá no selo da prancha e na publicação'); };
    rd.readAsDataURL(f); e.target.value=''; };
  const cd=document.getElementById('cliLogoDrop');
  if(cd) cd.onclick=()=>{ S.cliLogo=null; document.getElementById('cliLogoInfo').textContent='Nenhuma logo de cliente.'; };
})();

/* ============================================================================
   IMAGEM DE FUNDO
   ========================================================================== */
let imgObjURL;
document.getElementById('imgIn').addEventListener('change',e=>{
  const f=e.target.files[0]; if(!f)return;
  const rd=new FileReader(); rd.onload=()=>{ if(imgObjURL)URL.revokeObjectURL(imgObjURL); imgObjURL=rd.result;
    S.imgPending=rd.result; S.imgName=(f&&f.name)?f.name.replace(/\.[^.]+$/,''):'imagem de fundo';
    try{ syncSideSecs(); }catch(e){}
    toast('Imagem carregada. Informe os cantos e toque em Posicionar.'); };
  rd.readAsDataURL(f);
});
document.getElementById('btnPlaceImg').onclick=()=>{
  if(!S.imgPending){toast('Carregue uma imagem primeiro');return;}
  const W=+imgW.value,Sv=+imgS.value,E=+imgE.value,N=+imgN.value;
  if([W,Sv,E,N].some(v=>isNaN(v))){toast('Preencha os 4 cantos (no CRS de trabalho)');return;}
  // cantos -> WGS bounds
  const sw=toWGS(S.workCRS,W,Sv), ne=toWGS(S.workCRS,E,N);
  if(!wgsBoundsOK(sw,ne)){ toast('⚠ Cantos incompatíveis com o CRS de trabalho — confira fuso e valores'); return; }
  const bounds=[[sw[1],sw[0]],[ne[1],ne[0]]];
  if(S.img)registraOrtoParaDrape(S.img);
  if(S.img&&S.img.overlay) map.removeLayer(S.img.overlay);
  const ov=L2.imageOverlay(S.imgPending,bounds,{opacity:0.85}).addTo(map);
  S.img={url:S.imgPending, overlay:ov, b:[W,Sv,E,N], name:(S.imgName||'imagem de fundo'), visible:true};
  refreshUI();
  safeFit(bounds); toast('Imagem posicionada');
};
document.getElementById('btnDropImg').onclick=()=>{ if(S.img&&S.img.overlay)map.removeLayer(S.img.overlay);
  S.img=null; S.imgPending=null; refreshUI(); toast('Imagem removida'); };

/* ============================================================================
   PROPRIEDADES DA ORTOFOTO / IMAGEM RGB (duplo toque na árvore)
   ========================================================================== */
function openImgProps(){
  if(!S.img || !S.img.url){ toast('Nenhuma ortofoto carregada'); return; }
  const g=id=>document.getElementById(id);
  const b=S.img.b||[0,0,0,0];
  g('imModName').textContent=S.img.name||'ortofoto';
  g('imModName2').value=S.img.name||'';
  g('imModMeta').textContent=S.img._w? `${S.img._w}×${S.img._h} px` : 'imagem';
  const ndTxt = S.img._id ? (S.img._ndPct!=null? ` · sem-dado: <b>${S.img._ndPct.toFixed(1)}%</b>` : '')
                          : ' · <i>pixel original indisponível (projeto salvo)</i>';
  let cogTxt='';
  if(S.img._cog){
    const c=S.img._cog;
    const okT=c.tiled, okO=c.nOv>0;
    cogTxt=`<br>Estrutura: blocos internos <b>${okT?(c.tw+'×'+c.th+' ✔'):'NÃO (strips) ✗'}</b>`+
           ` · pirâmides <b>${okO?(c.nOv+' níveis ✔'):'NENHUMA ✗'}</b>`;
    if(!okT || !okO)
      cogTxt+=`<br><span style="color:var(--amber)">Tiles dinâmicos ficarão lentos no zoom afastado. `+
        `Converta para COG no notebook:<br><code style="font-size:10.5px">gdal_translate entrada.tif saida.tif -of COG -co COMPRESS=JPEG -co QUALITY=90</code></span>`;
  }
  g('imModInfo').innerHTML=
    `${srcHTML(S.img.src)}<br>CRS: <b>${CRS_LABELS[S.workCRS]||S.workCRS}</b>`+
    `<br>X ${b[0].toFixed(0)}–${b[2].toFixed(0)} · Y ${b[1].toFixed(0)}–${b[3].toFixed(0)}`+
    ` · ${((b[2]-b[0])/1000).toFixed(2)} × ${((b[3]-b[1])/1000).toFixed(2)} km${ndTxt}${cogTxt}`;
  g('imModX0').value=b[0]; g('imModY0').value=b[1]; g('imModX1').value=b[2]; g('imModY1').value=b[3];
  // espelha os controles do painel lateral
  g('imModND').checked=g('imgND').checked;
  g('imModW').value=g('imgNDw').value; g('imModB').value=g('imgNDb').value;
  const op=+g('imgOp').value||1; g('imModOp').value=op; g('imModOpv').textContent=Math.round(op*100)+'%';
  // habilita/desabilita o recorte conforme exista o pixel original
  /* O "Aplicar" fica CLICÁVEL mesmo sem o pixel original: um botão inerte não
     diz nada a quem clica. Sem o arquivo ele explica o que falta e abre o
     seletor da ortofoto; os campos do recorte é que ficam desabilitados. */
  ['imModND','imModW','imModB'].forEach(id=>g(id).disabled=!S.img._id);
  { const ap=g('imModApply');
    if(ap){ ap.disabled=false;
      ap.textContent=S.img._id?'Aplicar':'Aplicar — precisa da ortofoto original';
      ap.title=S.img._id?'':'Sem o GeoTIFF de origem não há pixel para reprocessar'; } }
  const hdb=g('imModHD'); if(hdb) hdb.checked=!!S.orthoHD;
  /* Sem o TIFF de origem (caso típico de projeto reaberto) não há de onde
     reler pixel: a opção fica desabilitada e o painel diz o porquê e o que
     fazer, em vez de deixar a marca ligada sem efeito nenhum. */
  {
    const I=S.img, temArq=!!(I&&I._img0&&I._tiff), est=g('imModHDEstado');
    if(hdb) hdb.disabled=!temArq;
    if(est){
      if(temArq){
        const gsdN=((I.b[2]-I.b[0])/I._W0*100), gsdP=((I.b[2]-I.b[0])/(I._w||I._W0)*100);
        est.innerHTML=`Arquivo ligado: <b>${I._W0}×${I._H0}</b> px (${gsdN.toFixed(1)} cm/px). `+
          `Prévia da tela: ${I._w||I._W0}×${I._h||I._H0} px (${gsdP.toFixed(1)} cm/px)`+
          (I._cog&&I._cog.nOv?` · pirâmide com ${I._cog.nOv} nível(is)`:' · sem pirâmide (mais lento)');
      }else{
        est.innerHTML='<b>Sem o GeoTIFF de origem:</b> o projeto guarda só a prévia da ortofoto, '+
          'então o zoom não passa dela. Toque em <b>Buscar a ortofoto original</b> abaixo e indique o .tif '+
          'para voltar à resolução plena e ligar os tiles.';
      }
    }
  }
  g('imgModal').classList.add('on');
}
(function bindImgModal(){
  const g=id=>document.getElementById(id);
  const close=()=>g('imgModal').classList.remove('on');
  const hd=g('imModHD');
  if(hd) hd.onchange=e=>{ S.orthoHD=e.target.checked; _tileFails=0; syncOrthoTiles();
    toast(S.orthoHD?'Ortofoto por TILES: resolução acompanha o zoom':'Ortofoto: usando o preview fixo'); };
  g('imModClose').onclick=close;
  g('imgModal').addEventListener('click',e=>{ if(e.target.id==='imgModal') close(); });
  g('imModRen').onclick=()=>{ renameImg(g('imModName2').value); g('imModName').textContent=S.img?S.img.name:''; };
  g('imModName2').addEventListener('keydown',e=>{ if(e.key==='Enter') g('imModRen').click(); });
  { let tLay2=null;
    g('imModOp').addEventListener('input',()=>{
      const v=+g('imModOp').value; g('imModOpv').textContent=Math.round(v*100)+'%';
      g('imgOp').value=v;
      const t=document.getElementById('imgOpv'); if(t) t.textContent=Math.round(v*100)+'%';
      if(S.img&&S.img.overlay) S.img.overlay.setOpacity(v);
      clearTimeout(tLay2);                      // a prancha acompanha (agrupado)
      tLay2=setTimeout(()=>{ try{ layoutSeVisivel(); }catch(e){} },250);
    });
  }
  g('imModApply').onclick=()=>{
    if(!S.img){ toast('Nenhuma ortofoto carregada'); return; }
    if(!S.img._id){
      toast('Este projeto trouxe só a prévia da ortofoto — indique o .tif original para reprocessar e aumentar a resolução');
      const fi=document.getElementById('ortoReligarFile'); if(fi) fi.click();
      return;
    }
    // joga os valores para os controles do painel (fonte única de verdade) e reprocessa
    g('imgND').checked=g('imModND').checked;
    g('imgNDw').value=g('imModW').value; g('imgNDb').value=g('imModB').value;
    showLoad('Reprocessando ortofoto…');
    setTimeout(()=>{
      const r=applyImgNoData(); S.img._ndPct=r.pct;
      hideLoad(); openImgProps(); toast(`Sem-dado descartado: ${r.pct.toFixed(1)}% das células`);
    },20);
  };
  g('imModMove').onclick=()=>{
    if(!S.img) return;
    const v=id=>+g(id).value;
    const b=[v('imModX0'),v('imModY0'),v('imModX1'),v('imModY1')];
    if(b.some(x=>!isFinite(x)) || b[2]<=b[0] || b[3]<=b[1]){ toast('Cantos inválidos'); return; }
    const sw=toWGS(S.workCRS,b[0],b[1]), ne=toWGS(S.workCRS,b[2],b[3]);
    if(!wgsBoundsOK(sw,ne)){ toast('⚠ Cantos incompatíveis com o CRS de trabalho'); return; }
    S.img.b=b;
    S.img._llbounds=null;                       // bound cacheado ficou obsoleto
    if(S.img._id && typeof applyImgNoData==='function'){ applyImgNoData(); }  // re-warpa no novo lugar
    else if(S.img.overlay) S.img.overlay.setBounds(L2.latLngBounds([[sw[1],sw[0]],[ne[1],ne[0]]]));
    zApply(); openImgProps(); toast('Ortofoto reposicionada');
  };
  {
    const bt=g('btnOrtoReligar'), fi=g('ortoReligarFile');
    if(bt&&fi){
      bt.onclick=()=>fi.click();
      fi.onchange=async e=>{
        const f=e.target.files&&e.target.files[0];
        e.target.value='';
        if(!f) return;
        const ok=await ortoReligarTIFF(f);
        if(ok){ try{ openImgProps(); }catch(_){}} };
    }
  }
  g('imModDel').onclick=()=>{
    if(!confirm('Remover a ortofoto/imagem de fundo?')) return;
    if(S.img && S.img.overlay) map.removeLayer(S.img.overlay);
    S.img=null; close(); refreshUI(); toast('Ortofoto removida');
  };
})();

/* Estado da resolução da ortofoto nas PROPRIEDADES: diz o que está em uso
   agora, o que o arquivo poderia dar, e habilita a alta resolução só quando
   há GeoTIFF de onde reler. */
function imgResInfoSync(){
  const el=document.getElementById('imgResInfo'), cb=document.getElementById('imgHD'),
        bt=document.getElementById('btnImgReligar'), I=S.img;
  if(!el) return;
  if(!I || !I.b){
    el.textContent='Nenhuma ortofoto carregada.';
    if(cb){ cb.checked=false; cb.disabled=true; }
    if(bt) bt.disabled=true;
    return;
  }
  if(bt) bt.disabled=false;
  /* O .ccmgis não guarda as dimensões da prévia: sem isto o painel diria
     "—×— px" justamente no caso em que o usuário precisa saber o que tem. As
     dimensões vêm da própria imagem já carregada, uma vez só. */
  if(!I._w && I.url && !I._medindoPrev){
    I._medindoPrev=true;
    const im=new Image();
    im.onload=()=>{ if(S.img===I){ I._w=im.naturalWidth; I._h=im.naturalHeight; }
      I._medindoPrev=false; try{ imgResInfoSync(); }catch(e){} };
    im.onerror=()=>{ I._medindoPrev=false; };
    im.src=I.url;
  }
  const larg=I.b[2]-I.b[0], temArq=!!(I._img0&&I._tiff);
  const cm=v=>Number.isFinite(v)?v.toFixed(1)+' cm/px':'—';
  const prev=I._w? cm(larg/I._w*100) : '—';
  if(temArq){
    el.innerHTML=`Arquivo: <b>${I._W0}×${I._H0}</b> px · ${cm(larg/I._W0*100)}<br>`+
      `Prévia da tela: ${I._w||'—'}×${I._h||'—'} px · ${prev}`+
      (I._cog&&I._cog.nOv? ` · pirâmide de ${I._cog.nOv} nível(is)`:' · sem pirâmide (tiles mais lentos)');
    if(cb){ cb.disabled=false; cb.checked=!!S.orthoHD; }
  }else{
    el.innerHTML=`Em uso: apenas a <b>prévia</b> ${I._w||'—'}×${I._h||'—'} px · ${prev}<br>`+
      `<span style="color:#b3781a">Sem o GeoTIFF de origem: o zoom não passa disso.</span> `+
      `Toque em <b>Buscar a ortofoto original</b> abaixo e indique o .tif.`;
    if(cb){ cb.checked=false; cb.disabled=true;
      const lb=cb.closest('label');
      if(lb) lb.title='Indisponível sem o GeoTIFF — use o botão abaixo para indicar onde está a ortofoto';
    }
  }
}
(function bindImgResProps(){
  const cb=document.getElementById('imgHD'), bt=document.getElementById('btnImgReligar'),
        fi=document.getElementById('imgReligarFile');
  if(cb) cb.onchange=()=>{
    S.orthoHD=cb.checked;
    try{ _tileFails=0; }catch(e){}
    syncOrthoTiles();
    const hd=document.getElementById('imModHD'); if(hd) hd.checked=cb.checked;
    toast(cb.checked?'Ortofoto por TILES: resolução acompanha o zoom':'Ortofoto: usando a prévia fixa');
  };
  if(bt&&fi){
    bt.onclick=()=>fi.click();
    fi.onchange=async e=>{
      const f=e.target.files&&e.target.files[0]; e.target.value='';
      if(!f) return;
      const ok=await ortoReligarTIFF(f);
      try{ imgResInfoSync(); }catch(_){}
      if(ok){ try{ syncImgPanel(); }catch(_){} }
    };
  }
})();

/* ---- nome e origem da ortofoto ---- */
function syncImgPanel(){
  const src=document.getElementById('imgSrc'), inp=document.getElementById('imgRename');
  if(!src||!inp) return;
  if(!S.img || !S.img.url){
    src.textContent='Nenhuma ortofoto/imagem carregada.'; inp.value=''; return;
  }
  const px=S.img._w? ` · ${S.img._w}×${S.img._h} px`:'';
  src.innerHTML=srcHTML(S.img.src)+px;
  try{ imgResInfoSync(); }catch(e){}
  if(document.activeElement!==inp) inp.value=S.img.name||'';
}
function renameImg(n){
  if(!S.img){ toast('Nenhuma ortofoto carregada'); return; }
  n=(n||'').trim(); if(!n){ toast('Informe um nome'); return; }
  S.img.name=n; refreshUI(); toast('Ortofoto renomeada para "'+n+'"');
}
document.getElementById('imgRenameBtn').onclick=()=>renameImg(document.getElementById('imgRename').value);
document.getElementById('imgRename').addEventListener('keydown',e=>{
  if(e.key==='Enter') renameImg(e.target.value); });

/* ---- recorte de células sem dado + opacidade da ortofoto ---- */
(function(){
  let t=null;
  const redo=()=>{ clearTimeout(t); t=setTimeout(()=>{
    if(!S.img || !S.img._id){ toast('Recarregue a ortofoto (.tif) para aplicar o recorte'); return; }
    const r=applyImgNoData();
    toast(`Sem-dado descartado: ${r.pct.toFixed(1)}% das células`);
  },200); };
  const op=document.getElementById('imgOp'), opv=document.getElementById('imgOpv');
  if(op){
    let tLay=null;
    op.addEventListener('input',()=>{
      if(opv) opv.textContent=Math.round(op.value*100)+'%';
      if(S.img&&S.img.overlay) S.img.overlay.setOpacity(+op.value); // opacidade não exige reprocessar
      /* A prancha acompanha: sem isto era preciso renderizar de novo à mão
         para ver a mudança no modo Layout. Agrupado, porque o slider dispara
         um evento por pixel arrastado e refazer a prancha custa caro. */
      clearTimeout(tLay);
      tLay=setTimeout(()=>{ try{ layoutSeVisivel(); }catch(e){} },250);
    });
  }
  ['imgND','imgNDw','imgNDb'].forEach(id=>{
    const e=document.getElementById(id); if(e) e.addEventListener('change',redo);
  });
})();
['imgW','imgS','imgE','imgN'].forEach(id=>window[id]=document.getElementById(id));

/* ============================================================================
   EVENTOS GERAIS
   ========================================================================== */
document.getElementById('fileIn').addEventListener('change',e=>{handleFiles(e.target.files);e.target.value='';});
document.getElementById('fileIn').addEventListener('cancel',()=>hideLoad());
const _qgisInEl=document.getElementById('qgisIn');
if(_qgisInEl) _qgisInEl.addEventListener('cancel',()=>hideLoad());
const GT_LABEL={point:'ponto',line:'linha',poly:'polígono'};
const GT_OF_TOOL={point:'point',line:'line',poly:'polygon'};
function askDrawDest(tool, then){
  const need=GT_OF_TOOL[tool];
  const A=activeLayer();
  const compat=A && A.gtype===need;
  const bg=document.getElementById('drawDest');
  document.getElementById('ddTitle').textContent='Destino e atributos — '+GT_LABEL[tool];
  const rA=document.getElementById('ddAtiva'), rN=document.getElementById('ddNova');
  document.getElementById('ddAtivaNome').textContent=A?A.name:'—';
  document.getElementById('ddAtivaHint').textContent=
    !A?'(não há camada ativa)':
    !compat?`(é de ${A.gtype==='point'?'pontos':A.gtype==='line'?'linhas':'polígonos'} — incompatível com ${GT_LABEL[tool]})`:
    '(a nova feição usará os campos e atributos desta camada)';
  rA.disabled=!compat;
  rA.checked=compat; rN.checked=!compat;
  const box=document.getElementById('ddNovaBox');
  box.style.display=rN.checked?'block':'none';
  document.getElementById('ddNome').value='';
  const gs=document.getElementById('ddGrupo');
  gs.innerHTML='<option value="">(sem grupo)</option>'+
    S.groups.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('');
  const sync=()=>{ box.style.display=rN.checked?'block':'none'; };
  rA.onchange=rN.onchange=sync;
  bg.classList.add('on');
  document.getElementById('ddClose').onclick=()=>{ bg.classList.remove('on'); };
  document.getElementById('ddOk').onclick=()=>{
    if(rN.checked){
      const nome=(document.getElementById('ddNome').value||'').trim()||('desenho_'+GT_LABEL[tool]);
      addLayer({name:nome, gtype:need, crs:S.workCRS, features:[],
        fields:[{name:'FID',type:'N',length:9,decimal:0},{name:'NOME',type:'C',length:60,decimal:0},
                {name:'OBS',type:'C',length:120,decimal:0}]});
      const gv=document.getElementById('ddGrupo').value;
      if(gv){ const L=activeLayer(); L.groupId=+gv; refreshUI(); }
    } else if(A){ S.activeId=A.id; }
    bg.classList.remove('on');
    then();
  };
}
/* Acionar uma ferramenta da barra inferior encerra o comando cuja janela
   flutuante estiver aberta. A janela (#ribbonPop) tem z-index maior que o da
   Régua: aberta, escondia a Régua atrás de si e ainda cobria o miolo do mapa,
   engolindo os cliques. Os painéis armam suas ferramentas por botões internos,
   que não são .mtool — nenhum fluxo se perde. */
function ferramentaEncerraComando(destino){
  const pop=document.getElementById('ribbonPop');
  if(pop && pop.classList.contains('on')){ try{ ribbonClose(); }catch(e){} }
  try{ baciaDesarmaEstado(destino); }catch(e){}
}
/* Estado do projeto de caixa que sobrevivia à troca de comando: com fase e
   parâmetros antigos em pé, voltar à ferramenta 'bacia' confirmava a caixa no
   centro do uso anterior. */
function baciaDesarmaEstado(destino){
  const t=destino||S.tool;
  if(typeof BACIA==='object' && BACIA && t!=='bacia'){
    BACIA.armado=false; BACIA.fase=null; BACIA.ctr=null; BACIA.params=null;
  }
  if(t!=='baciaRampa' && typeof BACIA_RAMPA!=='undefined' && BACIA_RAMPA){
    try{ if(BACIA.ultima) delete BACIA.ultima._rampaTransaction; }catch(e){}
    BACIA_RAMPA=null;
  }
  if(t!=='baciaExt' && typeof BACIA_EXT!=='undefined' && BACIA_EXT) BACIA_EXT=null;
}
document.querySelectorAll('.mtool').forEach(b=>{
  if(b.id==='btnSnap') return;                 // o ímã tem seu próprio handler (menu de snap)
  b.onclick=()=>{
  ferramentaEncerraComando(b.dataset.tool);
  if(b.dataset.tool==='measure' && S.tool==='measure'){
    fechaMeas(); return;
  }
  if((b.dataset.tool==='line'||b.dataset.tool==='poly') && S.tool===b.dataset.tool && S.drawBuf.length>=2){ finishDraw(); return; }
  if(['point','line','poly'].includes(b.dataset.tool) && S.tool!==b.dataset.tool){
    askDrawDest(b.dataset.tool, ()=>setTool(b.dataset.tool));
    return;
  }
  setTool(b.dataset.tool);
  };
});
// duplo-toque para finalizar desenho
map_dblclick_hook();
function map_dblclick_hook(){ setTimeout(()=>{ if(map) map.on('dblclick',e=>{
  if(S.tool==='contBusca'){L2.DomEvent.stop(e);tinContBuscaFinaliza();return;}
  if(['line','poly'].includes(S.tool)){L2.DomEvent.stop(e);finishDraw();}
  if(S.tool==='measure'){ L2.DomEvent.stop(e);      // encerra a medição, mantém o traçado
    setTool('pan'); const mb=document.getElementById('measBox'); if(mb) mb.classList.add('on'); }
}); },300); }

/* ---- régua: botões da caixa, seleção de superfície e Esc ---- */
(function(){
  const u=document.getElementById('mbUndo'), c=document.getElementById('mbClear'),
        r=document.getElementById('mbRaster'), mm=document.getElementById('mbMeasureMode');
  if(u) u.onclick=()=>{
    if(measMode()==='lines'){
      S.meas.lineRefs.pop(); S.meas.lineResult=null;
      S.meas.buf=S.meas.lineRefs.map(q=>[q.latlng.lat,q.latlng.lng]); redrawMeas();
      const o=document.getElementById('mbOut');
      if(o)o.textContent=S.meas.lineRefs.length?'Ponto 1 mantido. Marque o ponto 2.':measInstrucao();
    }else { S.meas.buf.pop(); redrawMeas(); updateMeas(); }
  };
  if(c) c.onclick=fechaMeas;
  if(r) r.onchange=()=>{ S.meas.grid=null; S.meas.gridId=null; S.meas.lidar=null; S.meas.lidarId=null; updateMeas(); };
  if(mm) mm.onchange=()=>{
    S.meas.mode=mm.value; clearMeas();
    const cx=document.getElementById('mbSnapBox');
    if(cx) cx.style.display=(mm.value==='points')?'flex':'none';
    if(S.tool==='measure') cmdLog(mm.value==='lines'
      ?'▸ RÉGUA: marque dois pontos sobre uma ou duas linhas para calcular ΔZ e inclinação.'
      :'▸ RÉGUA: clique em pontos soltos — cai exatamente onde você tocar; com um MDT escolhido, sai distância 3D, Δz e inclinação.','cmd');
  };
  { const sn=document.getElementById('mbSnap');
    if(sn) sn.onchange=()=>{ if(!sn.checked) limpaCursorSnap(); }; }
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){ const stC=document.getElementById('cmdStatus');
      if((stC && stC.style.display!=='none') ||
         document.getElementById('loading').classList.contains('on')){ cancelLoad(); return; } }
    if(e.key==='Escape' && typeof featMenuEl!=='undefined' && featMenuEl){ closeFeatMenu(); return; }
    if(e.key==='Escape' && typeof janelaFechaTopo==='function' && !cmdEmAndamento() && janelaFechaTopo()) return;
    if(e.key==='Escape'){
      // 1º: uma janela aberta é preservada. Esc continua disponível para
      // comandos e campos, mas não fecha painéis nem modais.
      const mb=[...document.querySelectorAll('.modal-bg.on')].pop();
      if(mb){ e.preventDefault(); e.stopImmediatePropagation(); return; }
      // 2º: fechar painéis flutuantes
      const ap=document.getElementById('attrPanel');
      if(ap && ap.classList.contains('on')){ ap.classList.remove('on'); return; }
    }
    if(e.key==='Escape' && S.tool==='measure'){
      const tag=(document.activeElement&&document.activeElement.tagName)||'';
      if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
      /* Esc pertence primeiro à medição: apaga pontos, traçado e resultado,
         mas mantém a régua armada para o próximo levantamento. Sem deter o
         evento, os handlers universais abaixo trocavam a ferramenta para
         Seleção logo depois de clearMeas(). */
      e.preventDefault(); e.stopImmediatePropagation();
      clearMeas();
      toast('Medição limpa — ferramenta Medir continua ativa');
      return;
    }
    if(e.key==='Escape' && S.meas.buf.length) clearMeas();
    /* Enter encerra o traçado — no tablet o duplo clique costuma deslocar o
       último vértice, e num desenho longo isso obriga a refazer o final.     */
    if(e.key==='Enter' && ['line','poly'].includes(S.tool) && S.drawBuf.length){
      const tag=(e.target&&e.target.tagName)||'';
      if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
      e.preventDefault();
      if(S.drawBuf.length>=2) finishDraw();
      else { toast('Marque ao menos dois vértices'); }
    }
  });
})();

/* ESC universal: encerra a ferramenta corrente e sempre devolve o mapa ao
   modo Seleção. Modais e campos de texto continuam recebendo o primeiro ESC
   para fechar/cancelar sua própria interface. */
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape') return;
  const modal=[...document.querySelectorAll('.modal-bg.on')].pop();
  const pop=document.getElementById('ribbonPop');
  const attr=document.getElementById('attrPanel');
  const tool=S.tool;
  const armado=!!tool && tool!=='select';
  /* ANTES: com a janela do comando (#ribbonPop) ou a tabela de atributos
     aberta, o Esc desistia AQUI e a ferramenta continuava armada — é o que
     ele relatou ("algumas vezes não mata o comando", tipicamente com a
     seleção de linhas, que se usa justamente com o painel aberto).
     AGORA: só um MODAL de verdade tem prioridade sobre o Esc; painéis não
     seguram o cancelamento quando há ferramenta armada. Sem ferramenta
     armada, o Esc segue como era e pertence ao painel. */
  if(modal) return;
  if(!armado && ((pop&&pop.classList.contains('on'))||(attr&&attr.classList.contains('on')))) return;
  const tag=(document.activeElement&&document.activeElement.tagName)||'';
  if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'){
    try{ document.activeElement.blur(); }catch(err){}
    if(!armado) return;            /* campo perde o foco; comando armado morre */
  }
  if(!armado){
    /* nada armado, mas pode haver gancho pendurado de um comando anterior */
    let limpou=false;
    if(typeof S._pickCancel==='function'){try{S._pickCancel();}catch(_){}limpou=true;}
    ['_pickLimite','_pickPonto','_barrBuf','_cavaRampStart'].forEach(k=>{
      if(S[k]){S[k]=null;limpou=true;}
    });
    /* a LINHA SELECIONADA volta ao normal: fecha a edição de vértices e o
       destaque — era a parte que o Esc não matava */
    const temVtx=S._vtxCtx||(S.vtxLayer&&S.vtxLayer.getLayers&&S.vtxLayer.getLayers().length);
    if(S.selFeat||temVtx){
      const Lx=S.selFeat&&S.selFeat.layer;
      S.selFeat=null;
      try{clearVertices();}catch(_){}
      try{ if(Lx)drawLayer(Lx); }catch(_){}
      try{ refreshUI(); }catch(_){}
      limpou=true;
    }
    if(limpou)toast('Comando encerrado');
    return;
  }
  /* Drenagem possui encerramento próprio e salva a feição com seus atributos. */
  if(tool==='dren') return;
  e.preventDefault();
  if(tool==='line'||tool==='poly'){
    const minimo=tool==='poly'?3:2;
    if((S.drawBuf||[]).length>=minimo){
      finishDraw();
      toast(tool==='poly'?'Polígono fechado e concluído':'Linha concluída');
    }else{
      clearDraw(); toast('Desenho cancelado');
    }
  }else if(tool==='cotado'){
    if(S.cot&&S.cot.ativo) cotToggle();
    toast('Coleta de pontos encerrada');
  }else if(tool==='profile'){
    redrawProfPreview();
    toast((S.prof.buf||[]).length>=2?'Traçado do perfil concluído':'Traçado do perfil cancelado');
  }else if(tool==='selpoly'){
    if(S.msel&&S.msel.buf&&S.msel.buf.length>=3) mselFinish();
    else if(typeof mselClearSketch==='function') mselClearSketch();
  }else if(tool==='forma' && typeof formaCancela==='function'){
    formaCancela(); toast('Forma cancelada');
  }else if(tool==='bacia'){
    try{ BACIA.armado=false; BACIA.fase=null; BACIA.ctr=null; S.drawLayer.clearLayers(); }catch(err){}
    toast('Desenho da bacia encerrado');
  }else if(tool==='baciaRampa'){
    try{ BACIA_RAMPA=null; }catch(err){}
    toast('Desenho da rampa encerrado');
  }else if(tool==='measure' && typeof clearMeas==='function'){
    /* Esc limpa somente a medição em andamento. A régua permanece armada
       e sua janela continua disponível para iniciar outra medida. */
    clearMeas();toast('Medição limpa — a Régua continua ligada');return;
  }else{
    if(S.drawBuf&&S.drawBuf.length) clearDraw();
    toast('Comando encerrado');
  }
  try{ setTool('select'); }catch(err){ S.tool='select'; map.getContainer().style.cursor='default'; }
},false);

document.getElementById('workCRS').addEventListener('change',e=>{
  S.workCRS=e.target.value;
  updateReadout(map.getCenter());
  document.getElementById('loSub').value=`CCM Engenharia · ${CRS_LABELS[S.workCRS]||S.workCRS}`;
  // Rasters (MDT/TIN) e a ortofoto guardam coordenadas E,N interpretadas no CRS
  // de trabalho — ao trocar o fuso/datum eles PRECISAM ser reposicionados.
  // (Camadas vetoriais têm CRS próprio e não se movem — para reatribuir o CRS
  //  de uma camada, use "CRS da camada ativa" + Aplicar.)
  let moved=0;
  (S.rasters||[]).forEach(r=>{ renderRaster(r); moved++; });
  if(S.img && S.img.overlay && S.img.b){
    const b=S.img.b;
    const sw=toWGS(S.workCRS,b[0],b[1]), ne=toWGS(S.workCRS,b[2],b[3]);
    if(wgsBoundsOK(sw,ne)){
      // a orto foi reamostrada para o Mercator do CRS ANTERIOR; ao trocar de CRS é
      // preciso REFAZER o warp, não só reposicionar. Se temos o _id (pixels em RAM),
      // applyImgNoData regenera o overlay correto; senão, cai no setBounds simples.
      if(S.img._id && typeof applyImgNoData==='function'){ applyImgNoData(); }
      else S.img.overlay.setBounds(L2.latLngBounds([[sw[1],sw[0]],[ne[1],ne[0]]]));
      moved++;
    } else { map.removeLayer(S.img.overlay); toast('⚠ Imagem oculta: cantos incompatíveis com o novo CRS'); }
  }
  if(document.getElementById('layout').style.display!=='none') buildLayout();
  if(moved) toast(`CRS de trabalho: ${CRS_LABELS[S.workCRS]||S.workCRS} — ${moved} raster(s)/imagem reposicionados`);
  else toast(`CRS de trabalho: ${CRS_LABELS[S.workCRS]||S.workCRS}`);
});
/* Diagnóstico pelas FAIXAS: cada família de CRS ocupa uma região numérica
   própria — longitude fica em ±180, UTM E em ~166–834 mil, a Policônica do
   IBGE em E≈5 milhões / N≈8–10 milhões. Quando um shape cai a quilômetros do
   lugar, a faixa denuncia o sistema verdadeiro sem depender do .prj. */
window.alagisDiagnosticaCRS=function(L){
  if(!L||!L.features||!L.features.length) return null;
  let x0=1e15,y0=1e15,x1=-1e15,y1=-1e15,n=0;
  L.features.forEach(f=>{ (function a(g){ if(!Array.isArray(g)) return;
    if(typeof g[0]==='number'){ x0=Math.min(x0,g[0]); x1=Math.max(x1,g[0]);
      y0=Math.min(y0,g[1]); y1=Math.max(y1,g[1]); n++; return; }
    g.forEach(a); })(f.geom); });
  if(!n) return null;
  const d={x:[x0,x1], y:[y0,y1], atual:L.crs, sugest:[]};
  const noBR=(lon,lat)=>lon>-75&&lon<-30&&lat>-35&&lat<6;
  if(Math.abs(x0)<=180&&Math.abs(x1)<=180&&Math.abs(y0)<=90&&Math.abs(y1)<=90){
    d.sugest.push('coordenadas em GRAUS — geográfica (EPSG:4674 SIRGAS ou 4326 WGS84)');
  } else if(x0>2800000&&x1<7300000&&y0>6000000&&y1<10600000){
    /* Brasil inteiro na Policônica: E 2,8–7,3 mi (lon_0 −54, x_0 5 mi) e
       N 6,0–10,6 mi (y_0 10 mi). A faixa não colide com UTM (E < 0,9 mi). */
    d.sugest.push('faixa da POLICÔNICA do IBGE — experimente EPSG:29101 (SAD69 / Policônica)');
  } else if(x0>100000&&x1<900000){
    /* E de UTM não diz o fuso — qualquer zona tem a mesma faixa. Quem diz é a
       REGIÃO do trabalho: o fuso é sugerido pelo centro do mapa atual. */
    let dica='';
    try{ const cc=map.getCenter(); const z=Math.floor((cc.lng+180)/6)+1;
      dica=` — para a região em tela o fuso é ${z}S: SIRGAS EPSG:${31960+z}, SAD69 EPSG:${29170+z}`; }catch(e){}
    d.sugest.push('faixa de UTM'+dica+'. Se o desvio persistir, o fuso do arquivo é o vizinho.');
  } else d.sugest.push('faixa fora dos sistemas usuais — coordenadas locais de CAD?');
  return d;
};
document.getElementById('btnSetLayerCRS').onclick=()=>{const L=activeLayer();
  if(!L){ toast('Nenhuma camada VETORIAL ativa — para raster, abra as propriedades do raster (2 toques) e use “Reprojetar”'); return; }
  L.crs=document.getElementById('layerCRS').value; drawLayer(L); fitLayer(L); refreshUI();
  toast('CRS aplicado: '+(CRS_LABELS[L.crs]||L.crs));
  try{ const d=alagisDiagnosticaCRS(L);
    if(d) cmdLog(`CRS de "${L.name}": E ${d.x[0].toFixed(1)}…${d.x[1].toFixed(1)} · N ${d.y[0].toFixed(1)}…${d.y[1].toFixed(1)} → ${d.sugest.join(' | ')}`,'info');
  }catch(e){} };

// tabs
document.getElementById('tabMap').onclick=()=>switchView('map');
document.getElementById('tabLayout').onclick=()=>switchView('layout');
const VIEWS=['map','layout','hidro','perfis','geo','v3d','mina','cava2'];
const SIDE_OF={hidro:'sideHidro', perfis:'sidePerfis', geo:'sideGeo',
  v3d:'sideV3d', mina:'sideV3d', cub:'sideCub'};
/* Barra lateral linear: cada seção aparece só onde é usada.
   · Elementos do layout  -> apenas na aba Layout
   · Imagem/planta de fundo -> apenas quando há imagem carregada ou pendente */
function syncSideSecs(v){
  const on=document.querySelector('#tabBar .tbtn.on');
  v = v || (on && on.dataset.view) || 'map';
  const sl=document.getElementById('secLayout');
  if(sl){ const q=(v==='layout');
    sl.style.display=q?'block':'none'; sl.classList.toggle('collapsed', !q); }
  const si=document.getElementById('secImg');
  if(si){ const q=!!(S.imgPending || (S.img && (S.img.url||S.img.overlay)));
    si.style.display=q?'block':'none'; if(q) si.classList.remove('collapsed'); }
}
/* Ao ocultar o contêiner do Leaflet no Layout, alguns renderizadores SVG/
   Canvas podem permanecer destacados do mapa embora a árvore ainda indique
   a camada como visível. Reanexa apenas os vetores ligados e força um redraw
   depois que o mapa 2D voltou a ter dimensões reais. */
function mapa2DReanexaVetores(){
  const vetores=S.layers||[];
  vetores.forEach(L=>{
    if(L.visible===false){
      if(L.llayer&&map.hasLayer(L.llayer))map.removeLayer(L.llayer);
      return;
    }
    if(!L.llayer){
      try{drawLayer(L);}catch(e){console.warn('Redesenho 2D',L&&L.name,e);}
      return;
    }
    try{
      if(!map.hasLayer(L.llayer))L.llayer.addTo(map);
      if(typeof L.llayer.redraw==='function')L.llayer.redraw();
      if(typeof L.llayer.eachLayer==='function')L.llayer.eachLayer(q=>{
        if(q&&typeof q.redraw==='function')q.redraw();
      });
    }catch(e){console.warn('Reanexo 2D',L&&L.name,e);}
  });
  try{zApply();}catch(e){}
  map.invalidateSize({pan:false});
}
function switchView(v){
  /* VISÃO 3D UNIFICADA: existiam três áreas 3D separadas (Visão 3D, Mina e
     Cubagem) dividindo o mesmo canvas mas com painéis, regras de
     visibilidade e comandos de render distintos. Agora é UMA só: qualquer
     rota antiga cai em 'v3d', e o que estiver LIGADO na árvore de camadas
     aparece — sem botão de renderizar. */
  if(v==='mina'||v==='cub')v='v3d';
  const vistaAnterior=S._view||'map';
  /* O Layout congelado aplica sua própria fotografia de visibilidade. Antes
     de entrar, guarda o estado real do mapa para não devolvê-lo vazio ou com
     as camadas da prancha ao sair. */
  if(v==='layout'&&vistaAnterior!=='layout'){
    try{
      const visAtual=layoutVisSnapshot();
      S._preLayoutMapState={vis:{...visAtual},frozen:!!S.loFrozen,
        conv:(typeof layoutConventionSnapshot==='function')?layoutConventionSnapshot():null,
        stack:Array.isArray(S.stack)?S.stack.slice():[]};
      /* A fotografia existente NÃO é substituída ao entrar no Layout. O mapa
         atual fica guardado acima como candidato a uma atualização explícita;
         enquanto isso, a prancha continua exatamente como foi congelada. */
      S._loAppliedPlateId=null; S._loDraftConv=null; S._loDraftStack=null;
    }
    catch(e){S._preLayoutMapState=null;}
  }
  S._view=v;
  document.body.classList.toggle('mina-view',v==='mina');
  document.body.classList.toggle('cava2-view',v==='cava2');
  document.querySelectorAll('#tabBar .tbtn').forEach(b=>b.classList.toggle('on', b.dataset.view===v));
  const cava2Visible=v==='cava2';
  const mapVisible=(v!=='layout' && v!=='v3d' && v!=='mina' && v!=='cub' && !cava2Visible); // Layout, Cava 2 e ambientes 3D substituem o mapa
  document.getElementById('map').style.display=mapVisible?'block':'none';
  /* A barra CAD inferior pertence à aplicação, não apenas ao Leaflet. Na
     Área 2D ela mantém comandos, ferramentas, coordenadas, CRS e escala
     disponíveis exatamente como no mapa clássico e na Visão 3D. */
  document.getElementById('mapTools').style.display=(mapVisible||cava2Visible)?'flex':'none';
  const showRO = mapVisible || cava2Visible || (typeof acadOn==='function' && acadOn());
  document.querySelector('.readout').style.display=showRO?'flex':'none';
  document.getElementById('layout').style.display=v==='layout'?'flex':'none';
  document.getElementById('v3d').style.display=(v==='v3d'||v==='mina'||v==='cub')?'block':'none';
  const cava2=document.getElementById('cava2Workspace');
  if(cava2)cava2.classList.toggle('on',cava2Visible);
  let visibilidadeRestaurada=false;
  if(vistaAnterior==='layout'&&v!=='layout'){
    const anterior=S._preLayoutMapState;
    if(anterior&&anterior.frozen){
      try{
        if(anterior.conv&&typeof layoutConventionApply==='function')layoutConventionApply(anterior.conv);
        if(anterior.stack&&typeof layoutStackApply==='function')layoutStackApply(anterior.stack);
        if(anterior.vis)layoutVisRestore(anterior.vis);
        visibilidadeRestaurada=true;
      }catch(e){console.warn('Restauração do mapa 2D',e);}
    }
    S._loAppliedPlateId=null; S._loDraftConv=null; S._loDraftStack=null;
    S._preLayoutMapState=null;
  }
  // a lista de camadas permanece disponível em todas as abas
  const hasSide=!!SIDE_OF[v];
  document.getElementById('sideMain').style.display=hasSide?'none':'block';
  [...new Set(Object.values(SIDE_OF))].forEach(id=>{
    const el=document.getElementById(id); if(el) el.style.display=(SIDE_OF[v]===id)?'block':'none';
  });
  syncSideSecs(v);
  // Sincroniza a categoria ativa com a view somente quando não existe um
  // comando da ribbon em andamento. Um comando deve manter a aba de onde foi
  // disparado, mesmo que internamente precise trocar a view de trabalho.
  try{ if(typeof CATS!=='undefined'){
    if(RIB_COMMAND_CAT && CATS.some(c=>c.id===RIB_COMMAND_CAT)){
      RIB_CAT_ATUAL=RIB_COMMAND_CAT;
    }else{
      const cur=CATS.find(c=>c.id===RIB_CAT_ATUAL);
      if(v==='mina') RIB_CAT_ATUAL='mineracao';
      /* Várias categorias podem compartilhar a mesma área de trabalho. A
         categoria escolhida deve permanecer ativa sempre que sua view já é
         a solicitada; a exceção antiga só conhecia Topografia e Geotecnia e
         fazia Barragens exibir todos os comandos de Topografia. */
      else if(!cur || cur.view!==v){
        const nova=CATS.find(c=>c.view===v); if(nova) RIB_CAT_ATUAL=nova.id;
      }
    }
  } }catch(e){}
  try{ if(typeof ribbonBuild==='function') ribbonBuild(); }catch(e){}
  // no modo AutoCAD, as categorias substituem a barra de abas antiga
  try{ const tb=document.getElementById('tabBar'); if(tb) tb.style.display=acadOn()?'none':''; }catch(e){}
  try{ layoutDockSync(v); }catch(e){}
  if(v==='layout'){
    /* Se a última subvista foi Proposta, restaura o painel ao voltar para
       Figura/A4/A3. Antes o display:none permanecia preso no elemento. */
    try{ if(typeof syncLoBtns==='function')syncLoBtns(); }catch(e){}
    if(typeof layoutFrozenApply==='function')layoutFrozenApply();
    buildLayout();
  } else if(v!=='v3d'&&v!=='mina'&&v!=='cub'&&!cava2Visible){
    requestAnimationFrame(()=>{
      map.invalidateSize({pan:false});
      if(vistaAnterior==='layout'){
        mapa2DReanexaVetores();
        requestAnimationFrame(mapa2DReanexaVetores);
      }
    });
  }
  if(visibilidadeRestaurada){try{refreshUI();}catch(e){}}
  if(v==='perfis'){ try{ refreshProfPanel(); }catch(e){ console.warn('refreshProfPanel',e); } try{ refreshBishopPanel(); }catch(e){} }
  if(v==='geo'){ refreshTinPanel(); refreshGtPanel(); refreshOverlayPanel(); refreshMosaicPanel(); refreshVecOpsPanel();
    if(typeof refreshPilhaPanel==='function') refreshPilhaPanel(); }
  if(v==='v3d'){
    refresh3DPanel();
    v3AbaSync('v3d');
    requestAnimationFrame(()=>{ v3Resize(); setTimeout(v3Resize,120); });
    /* nativamente 3D: monta a cena com o que está ligado, sem comando manual */
    if(typeof mina3DAuto==='function') mina3DAuto(false);
  }
  /* as antigas áreas Mina e Cubagem foram absorvidas por 'v3d' acima; o
     painel de cubagem continua existindo e é atualizado junto */
  if(v==='v3d'&&typeof refreshCubPanel==='function'){ try{refreshCubPanel();}catch(e){} }
  if(cava2Visible){requestAnimationFrame(()=>{try{window.CCMGISCava2&&window.CCMGISCava2.open();}catch(e){console.warn('Cava 2',e);}});}
  if(v==='geo'){ refreshCotPanel(); refreshEstPanel(); refreshTinClip(); }
  if(v==='hidro' && typeof hTopoRefresh==='function') hTopoRefresh();
  if(hasSide && !(typeof acadOn==='function' && acadOn()) &&
     window.matchMedia('(max-width:720px)').matches)
    document.getElementById('side').classList.add('open');
  requestAnimationFrame(()=>{ try{ cmdAncora(); }catch(e){} });
}
document.querySelectorAll('#tabBar .tbtn').forEach(b=>{
  b.addEventListener('click',()=>{ if(!b._dragged) switchView(b.dataset.view); b._dragged=false; });
});
/* seletor de vista no canto do mapa (2D / 3D / Layout) */
(function(){
  const vs=document.getElementById('viewSwitch'); if(!vs) return;
  vs.querySelectorAll('button').forEach(b=>{
    b.addEventListener('click',()=>switchView(b.dataset.vw));
  });
})();
/* mantém o seletor destacando a vista atual — inclusive quando a troca vem da ribbon */
(function(){
  const _sv=switchView;
  switchView=function(v){
    _sv(v);
    const a3=document.getElementById('a3ViewTabs');
    if(a3){
      /* A aba 2D é a planta consolidada. O editor de cava continua sendo
         bidimensional, mas é aberto pela faixa Mineração e usa as mesmas
         camadas globais; clicar em 2D sempre volta ao conjunto completo. */
      const grupo3=(v==='v3d'||v==='mina'||v==='cub')?'v3d':
        (v==='layout'?'layout':(v==='cava2'?'cava2':'map'));
      a3.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('on',b.dataset.view===grupo3));
    }
    const vs=document.getElementById('viewSwitch');
    if(vs){
      // No Layout, a barra própria já ocupa o topo. Ocultar este seletor evita
      // que 2D / 3D / Layout fique por cima dos comandos da prancha.
      vs.style.display = (v==='layout'||v==='cava2') ? 'none' : 'flex';
      // 2D reúne todas as vistas que mostram o mapa; 3D cobre v3d e cubagem
      const grupo = (v==='v3d'||v==='mina'||v==='cub') ? 'v3d' : (v==='layout' ? 'layout' : 'map');
      vs.querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.vw===grupo));
    }
  };
})();

/* Shell CCMGIS 3.0: abas de trabalho, busca global e utilidades do cabeçalho. */
(function initAlagis3Shell(){
  document.body.classList.add('alagis3','acad');
  const tabs=document.getElementById('a3ViewTabs');
  if(tabs) tabs.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{
    const v=b.dataset.view;
    if(v==='v3d') RIB_CAT_ATUAL='visualizacao';
    if(v==='mina'||v==='cava2') RIB_CAT_ATUAL='mineracao';
    switchView(v);
  }));
  const plus=document.getElementById('a3ViewPlus');
  if(plus) plus.onclick=()=>ribMiniMenu(plus,'Áreas de trabalho',[
    {nome:'2D — todas as cavas e camadas',run:()=>switchView('map')},
    {nome:'Editor de Cava/DCE',run:()=>{RIB_CAT_ATUAL='mineracao';switchView('cava2')}},
    {nome:'Visão 3D',run:()=>{RIB_CAT_ATUAL='visualizacao';switchView('v3d')}},
    {nome:'Mina 3D',run:()=>{RIB_CAT_ATUAL='mineracao';switchView('mina')}},
    {nome:'Layout',run:()=>switchView('layout')},
    {sep:1},{nome:'Hidrologia',run:()=>{RIB_CAT_ATUAL='hidrologia';switchView('hidro')}},
    {nome:'Topografia / Perfil',run:()=>{RIB_CAT_ATUAL='topografia';switchView('perfis')}},
    {nome:'Mineração (Mapa 2D)',run:()=>{RIB_CAT_ATUAL='mineracao';switchView('map')}},
  ]);
  document.querySelectorAll('#a3MapNav [data-a3nav]').forEach(b=>b.addEventListener('click',()=>{
    const a=b.dataset.a3nav;
    if(a==='home'||a==='center'){try{fitAll()}catch(e){}}
    else if(a==='base') actClick('btnBaseToggle');
    else if(a==='full'){
      const el=document.getElementById('main');
      if(document.fullscreenElement) document.exitFullscreen&&document.exitFullscreen();
      else el&&el.requestFullscreen&&el.requestFullscreen();
    }else if(a==='settings'){RIB_CAT_ATUAL='janela';switchView('map')}
  }));
  const statusFull=document.querySelector('[data-a3status="full"]');
  if(statusFull) statusFull.onclick=()=>{
    const el=document.getElementById('main');
    if(document.fullscreenElement) document.exitFullscreen&&document.exitFullscreen();
    else el&&el.requestFullscreen&&el.requestFullscreen();
  };
  const layerTools=[...document.querySelectorAll('.a3-layer-tool')];
  if(layerTools[0]) layerTools[0].onclick=()=>{
    const list=document.getElementById('layerList'),search=document.getElementById('layerSearch');
    const hide=list&&list.style.display!=='none';
    if(list) list.style.display=hide?'none':'';
    if(search&&search.parentElement) search.parentElement.style.display=hide?'none':'';
    layerTools[0].textContent=hide?'›':'⌄';
  };
  layerTools.slice(1).forEach(b=>b.onclick=()=>{
    const search=document.getElementById('layerSearch');
    if(search){search.focus();search.select()}
  });

  const q=document.getElementById('a3CommandSearch');
  const out=document.getElementById('a3SearchResults');
  let rows=[];
  function positionResults(){
    if(!q||!out) return; const r=q.getBoundingClientRect();
    out.style.left=Math.max(8,Math.min(innerWidth-out.offsetWidth-8,r.left))+'px';
    out.style.top=(r.bottom+5)+'px';
  }
  function allCommands(){
    const a=[], vistos=new Set(), norm=x=>String(x||'').toLocaleLowerCase('pt-BR')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    CATS.forEach(c=>(c.grupos||[]).forEach(g=>(g.it||[]).forEach(cmd=>{
      /* Atalhos contextuais continuam em suas abas, mas a busca global mostra
         uma única ocorrência do mesmo ícone/comando. */
      const chave=norm(cmd.ic)+'\u0000'+norm(cmd.nome);
      if(vistos.has(chave))return;
      vistos.add(chave);a.push({cat:c,grp:g,cmd});
    })));
    return a;
  }
  function closeSearch(){if(out){out.classList.remove('on');out.innerHTML=''}rows=[]}
  function renderSearch(){
    if(!q||!out)return;
    const s=(q.value||'').trim().toLocaleLowerCase('pt-BR');
    if(!s){closeSearch();return}
    const norm=x=>(x||'').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const ns=norm(s);
    rows=allCommands().filter(x=>norm(x.cmd.nome+' '+x.cat.nome+' '+x.grp.label).includes(ns)).slice(0,18);
    out.innerHTML=rows.length?rows.map((x,i)=>
      `<div class="a3-search-row${i===0?' sel':''}" data-i="${i}"><span>${esc(x.cmd.nome)}</span><small>${esc(x.cat.nome)} · ${esc(x.grp.label||'')}</small></div>`
    ).join(''):'<div class="hint" style="padding:12px">Nenhum comando encontrado.</div>';
    out.classList.add('on');positionResults();
    out.querySelectorAll('.a3-search-row').forEach(el=>el.onclick=()=>execute(+el.dataset.i));
  }
  function execute(i){
    const x=rows[i];if(!x)return;
    RIB_CAT_ATUAL=x.cat.id;
    if(x.cat.view) switchView(x.cat.view); else ribbonBuild();
    closeSearch();q.value='';
    requestAnimationFrame(()=>{
      const bs=[...document.querySelectorAll('#ribbon .rbtn')];
      const b=bs.find(e=>e.title===x.cmd.nome);
      if(b)b.click();
    });
  }
  if(q){
    q.addEventListener('input',renderSearch);
    q.addEventListener('focus',renderSearch);
    q.addEventListener('keydown',e=>{
      if(e.key==='Escape'){closeSearch();q.blur()}
      if(e.key==='Enter'){e.preventDefault();execute(0)}
    });
  }
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='q'){e.preventDefault();q&&q.focus()}
  });
  document.addEventListener('pointerdown',e=>{
    if(out&&out.classList.contains('on')&&!out.contains(e.target)&&e.target!==q)closeSearch();
  });
  addEventListener('resize',positionResults);

  const theme=document.getElementById('a3Theme');
  if(theme) theme.onclick=()=>{
    const sel=document.getElementById('uiTheme');
    if(sel){sel.value=document.body.classList.contains('light')?'dark':'light';
      sel.dispatchEvent(new Event('change',{bubbles:true}));}
    else document.body.classList.toggle('light');
  };
  const help=document.getElementById('a3Help');
  if(help) help.onclick=()=>{RIB_CAT_ATUAL='ajuda';switchView('map')};
  const note=document.getElementById('a3Notify');
  if(note) note.onclick=()=>toast('CCMGIS 3.0 pronto para o trabalho de campo');
  const user=document.getElementById('a3User');
  if(user) user.onclick=()=>{RIB_CAT_ATUAL='janela';switchView('map')};
  requestAnimationFrame(()=>{try{ribbonBuild();switchView('map')}catch(e){console.warn('CCMGIS 3.0',e)}});
})();

/* ---------- abas rearranjáveis (arrastar com o mouse) ---------- */
(function enableTabDrag(){
  const bar=document.getElementById('tabBar');
  let src=null;
  bar.querySelectorAll('.tbtn').forEach(b=>{
    b.addEventListener('dragstart',e=>{
      src=b; b._dragged=true; b.classList.add('dragging');
      e.dataTransfer.effectAllowed='move';
      try{ e.dataTransfer.setData('text/plain', b.dataset.view); }catch(_){}
    });
    b.addEventListener('dragend',()=>{
      b.classList.remove('dragging');
      bar.querySelectorAll('.tbtn').forEach(t=>t.classList.remove('dropzone'));
      saveTabOrder();
      setTimeout(()=>{ b._dragged=false; },0);
    });
    b.addEventListener('dragover',e=>{
      e.preventDefault(); e.dataTransfer.dropEffect='move';
      if(!src || src===b) return;
      b.classList.add('dropzone');
      const r=b.getBoundingClientRect();
      const after=(e.clientX - r.left) > r.width/2;
      bar.insertBefore(src, after? b.nextSibling : b);
    });
    b.addEventListener('dragleave',()=>b.classList.remove('dropzone'));
    b.addEventListener('drop',e=>{ e.preventDefault(); b.classList.remove('dropzone'); });
  });
  restoreTabOrder();
})();
function saveTabOrder(){
  try{
    const ord=[...document.querySelectorAll('#tabBar .tbtn')].map(b=>b.dataset.view);
    localStorage.setItem('ccm_tab_order', JSON.stringify(ord));
  }catch(_){}   // file:// sem localStorage — a ordem vale só na sessão
}
function restoreTabOrder(){
  try{
    const ord=JSON.parse(localStorage.getItem('ccm_tab_order')||'null');
    if(!Array.isArray(ord)) return;
    const bar=document.getElementById('tabBar');
    ord.forEach(v=>{ const b=bar.querySelector(`[data-view="${v}"]`); if(b) bar.appendChild(b); });
  }catch(_){}
}
/* ============================================================================
   TEMA / FUNDO DA ÁREA DE TRABALHO (rodapé) — tema claro p/ prints
   ========================================================================== */
const BG_DEF={dark:'#0a0e14', light:'#ffffff'};
function applyTheme(theme, bg){
  document.body.classList.toggle('light', theme==='light');
  // fundo do mapa: se não vier explícito, usa o padrão do tema
  const cor=bg||BG_DEF[theme]||BG_DEF.dark;
  document.documentElement.style.setProperty('--map-bg', cor);
  const ci=document.getElementById('mapBg'); if(ci) ci.value=cor;
  const ts=document.getElementById('uiTheme'); if(ts) ts.value=theme;
  const at=document.getElementById('a3ThemeToggle');
  if(at){
    const ic=at.querySelector('.a3-theme-icon'), lb=at.querySelector('.a3-theme-label');
    // O texto indica o tema para o qual o botão alternará.
    if(ic) ic.textContent=theme==='light'?'☾':'☀';
    if(lb) lb.textContent=theme==='light'?'Escuro':'Claro';
    at.title=theme==='light'?'Mudar para tema escuro':'Mudar para tema claro';
  }
  // 3D: quando configurado para acompanhar o mapa, atualiza inclusive a cena já aberta.
  try{
    const s3=document.getElementById('v3dBg');
    if((!s3 || s3.value==='theme') && typeof v3dApplyCurrentBg==='function') v3dApplyCurrentBg(false);
  }catch(e){}
  try{ localStorage.setItem('ccm_theme', JSON.stringify({theme,bg:cor})); }catch(_){}
  try{window.CCMGISCava2&&window.CCMGISCava2.syncTheme();}catch(e){}
}
(function(){
  const ts=document.getElementById('uiTheme'), ci=document.getElementById('mapBg');
  ts.addEventListener('change',()=>applyTheme(ts.value, BG_DEF[ts.value]));   // troca o tema e o fundo padrão
  ci.addEventListener('input',()=>applyTheme(ts.value, ci.value));            // fundo livre, sem mexer no tema
  const bw=document.getElementById('btnBgWhite');
  const at=document.getElementById('a3ThemeToggle');
  if(at) at.onclick=()=>{
    const claro=document.body.classList.contains('light');
    applyTheme(claro?'dark':'light',claro?BG_DEF.dark:BG_DEF.light);
    toast(claro?'Tema escuro ativado':'Tema claro ativado');
  };
  const syncBW=()=>{ const claro=document.body.classList.contains('light');
    bw.textContent=claro?'⬛ Escuro':'⬜ Print';
    bw.title=claro?'Voltar ao tema escuro (fundo padrão)':'Fundo branco + tema claro (modo print)'; };
  bw.onclick=()=>{
    const claro=document.body.classList.contains('light');
    if(claro){ applyTheme('dark', BG_DEF.dark); toast('Tema escuro restaurado'); }
    else { applyTheme('light','#ffffff'); toast('Modo print: tema claro e fundo branco'); }
    syncBW();
  };
  const _apT=applyTheme; applyTheme=(t,b)=>{ _apT(t,b); syncBW(); };
  let st={theme:'dark',bg:BG_DEF.dark};
  try{ st=JSON.parse(localStorage.getItem('ccm_theme')||'null')||st; }catch(_){}
  applyTheme(st.theme||'dark', st.bg);
})();

/* ===== EPSG clicável na barra de status: mudar CRS do projeto ou da camada ===== */
(function crsBadge(){
  const badge=document.getElementById('roCRS');
  const menu=document.getElementById('crsMenu');
  if(!badge||!menu) return;
  const fechar=()=>menu.classList.remove('on');
  const abrir=()=>{
    const L=(typeof activeLayer==='function')?activeLayer():null;
    document.getElementById('crsProjNow').textContent = (CRS_LABELS[S.workCRS]||S.workCRS);
    const optLay=document.getElementById('crsLay');
    if(L){ optLay.style.display='flex';
      document.getElementById('crsLayNow').textContent = (L.name? L.name+' · ' : '')+(CRS_LABELS[L.crs]||L.crs);
    } else { optLay.style.display='none'; }
    menu.classList.add('on');
  };
  badge.onclick=(e)=>{ e.stopPropagation(); menu.classList.contains('on')?fechar():abrir(); };
  document.addEventListener('click',e=>{ if(!menu.contains(e.target) && e.target!==badge) fechar(); });

  // escolher um CRS num seletor rápido (reusa a lista fillCRSSelect)
  function pedeCRS(titulo, atual, onOk){
    // modal mínimo reaproveitando o padrão .modal-bg
    let m=document.getElementById('crsPickModal');
    if(!m){
      m=document.createElement('div'); m.id='crsPickModal'; m.className='modal-bg';
      m.innerHTML='<div class="modal" style="width:min(460px,94vw)">'+
        '<div class="modal-h"><b id="crsPickTtl">Escolher CRS</b><div style="flex:1"></div>'+
        '<button class="tbtn" id="crsPickX">✕</button></div>'+
        '<div class="modal-b"><label class="field">Sistema de coordenadas</label>'+
        '<select id="crsPickSel"></select>'+
        '<button class="tbtn" id="crsPickOk" style="width:100%;justify-content:center;margin-top:12px;'+
        'background:var(--amber);color:#1a1206;font-weight:600">Aplicar</button></div></div>';
      document.body.appendChild(m);
    }
    document.getElementById('crsPickTtl').textContent=titulo;
    const sel=document.getElementById('crsPickSel');
    fillCRSSelect(sel, atual);
    m.classList.add('on');
    document.getElementById('crsPickX').onclick=()=>m.classList.remove('on');
    document.getElementById('crsPickOk').onclick=()=>{ m.classList.remove('on'); onOk(sel.value); };
  }

  document.getElementById('crsProj').onclick=()=>{
    fechar();
    pedeCRS('CRS do projeto', S.workCRS, (code)=>{
      const sel=document.getElementById('workCRS');
      if(sel){ sel.value=code; sel.dispatchEvent(new Event('change')); }
      else { S.workCRS=code; }
    });
  };
  document.getElementById('crsLay').onclick=()=>{
    fechar();
    const L=(typeof activeLayer==='function')?activeLayer():null;
    if(!L){ toast('Nenhuma camada ativa'); return; }
    pedeCRS('CRS da camada "'+(L.name||'—')+'"', L.crs, (code)=>{
      L.crs=code; drawLayer(L); if(typeof fitLayer==='function') fitLayer(L); refreshUI();
      toast('CRS da camada: '+(CRS_LABELS[code]||code));
    });
  };
})();

document.getElementById('btnRedraw').onclick=loApplyAll;
function loApplyAll(){
  /* Este é o ÚNICO comando que substitui a composição congelada da prancha.
     Sliders continuam gravando os campos próprios, mas camadas, ordem,
     filtros e convenções só entram no instantâneo por esta ação explícita. */
  if(typeof plateCapture==='function')
    plateCapture(S.loMode==='a4'?{captureState:true}:undefined);
  buildLayout();
  toast(S.loMode==='a4'?'Prancha atualizada e congelada':'Layout atualizado');
}
document.getElementById('btnLoRedraw').onclick=loApplyAll;
document.getElementById('btnRedrawTop').onclick=loApplyAll;
document.getElementById('btnLoCenterReset2').onclick=()=>{
  S.loCenter=null; S._loPick=false; syncLoBtns();
  document.getElementById('sheetWrap').style.cursor='';
  loApplyAll(); toast('Centro automático restaurado');
};

/* Preset: figura para colar no corpo do texto (A4, largura útil 160 mm, sem margens) */
document.getElementById('btnFigTxt').onclick=()=>{
  const sv=(id,v)=>{const e=document.getElementById(id); if(e) e.value=v;};
  const sc=(id,v)=>{const e=document.getElementById(id); if(e) e.checked=v;};
  S.loMode='fig'; syncLoBtns();
  sv('loPaper','auto'); sv('loMar',0); sv('loPad',4);
  sc('loFitW',true); sc('loScaleAuto',true); sv('loFigW',160); sv('loFigWr',160); sv('loFigH',0); sv('loFigHr',0);
  sc('loCoords',true); sc('loCoordTop',true); sc('loCoordBottom',false);
  sc('loCoordLeft',true); sc('loCoordRight',true);
  sc('loCart',true); sc('loLegend',true);
  ['loLegFS','loBarFS','loBarSc','loSym','loMapSym','loDash','loDashGap','loTxt','loFigW','loFigH'].forEach(id=>{const e=document.getElementById(id); if(e) e.dispatchEvent(new Event('input'));});
  buildLayout();
  toast('Figura 160 mm, sem margens — use Exportar');
};

/* ---- controles de figura: margem, papel automático, fonte/símbolos da legenda ---- */
(function(){
  let t=null;
  const redraw=()=>{ clearTimeout(t); t=setTimeout(()=>buildLayout(),180); };  // debounce p/ sliders
  const nf=v=>Number(v).toFixed(1).replace('.',',')+'×';
  const bindSlider=(id,outId)=>{
    const el=document.getElementById(id), out=document.getElementById(outId);
    if(!el) return;
    const sync=()=>{ if(out) out.textContent=nf(el.value); };
    sync();
    el.addEventListener('input',()=>{ sync(); redraw(); });
  };
  bindSlider('loLegSc','loLegScv');
  bindSlider('loLegFS','loLegFSv');
  bindSlider('loBarFS','loBarFSv');
  bindSlider('loBarSc','loBarScv');
  bindSlider('loSym','loSymv');
  /* valor físico em milímetros, sem o sufixo de multiplicador */
  {
    const el=document.getElementById('loLegColGap'),out=document.getElementById('loLegColGapv');
    if(el){
      const sync=()=>{if(out)out.textContent=(+el.value).toFixed(1).replace(/\.0$/,'').replace('.',',')+' mm';};
      sync();el.addEventListener('input',()=>{sync();redraw();});
    }
  }
  bindSlider('loMapSym','loMapSymv');
  bindSlider('loDash','loDashv');
  bindSlider('loDashGap','loDashGapv');
  bindSlider('loTxt','loTxtv');
  bindSlider('loCartFS','loCartFSv');
  bindSlider('loTitFS','loTitFSv');
  // largura e altura: barra e campo numérico espelhados (altura 0 = automática)
  const mirror=(numId,rngId,tagId,fmt)=>{
    const n=document.getElementById(numId), r=document.getElementById(rngId), t=document.getElementById(tagId);
    if(!n||!r) return;
    const sync=v=>{ if(t) t.textContent=fmt(+v); };
    sync(n.value); r.value=n.value;
    r.addEventListener('input',()=>{ n.value=r.value; sync(r.value); redraw(); });
    n.addEventListener('input',()=>{ r.value=n.value; sync(n.value); redraw(); });
  };
  mirror('loFigW','loFigWr','loFigWv', v=>v+' mm');
  mirror('loFigH','loFigHr','loFigHv', v=>v>0? v+' mm' : 'auto');
  ['loPaper','loMar','loPad','loCoords','loCoordTop','loCoordBottom','loCoordLeft','loCoordRight',
    'loCart','loLegOut','loLegPos','loLegend','loSat']
    .forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('change',redraw); });
  /* O controle geral não apaga as escolhas por lado: apenas as suspende. Ao
     religá-lo, a combinação anterior volta exatamente como estava. */
  const coordMaster=document.getElementById('loCoords');
  const coordSides=['loCoordTop','loCoordBottom','loCoordLeft','loCoordRight']
    .map(id=>document.getElementById(id)).filter(Boolean);
  const syncCoordSides=()=>coordSides.forEach(el=>{
    el.disabled=coordMaster?!coordMaster.checked:false;
    const lab=el.closest('label'); if(lab) lab.style.opacity=el.disabled?'.45':'1';
  });
  window.loCoordUISync=syncCoordSides;
  if(coordMaster) coordMaster.addEventListener('change',syncCoordSides);
  syncCoordSides();
  const seloPaper=document.getElementById('loSeloPaper');
  const syncPranchaInfo=()=>{
    if(!seloPaper) return;
    const nomes={a4p:'A4 retrato · 210 × 297 mm',a4l:'A4 paisagem · 297 × 210 mm',
      a3p:'A3 retrato · 297 × 420 mm',a3l:'A3 paisagem · 420 × 297 mm'};
    const info=document.getElementById('loPranchaInfo');
    if(info) info.textContent='Prancha '+(nomes[seloPaper.value]||seloPaper.value.toUpperCase())+' · selo:';
  };
  if(seloPaper) seloPaper.addEventListener('change',()=>{
    syncPranchaInfo();
    if(S.loMode==='a4'){ syncLoBtns(); redraw(); }
  });
  syncPranchaInfo();

  /* Escala e grade não tinham listener nenhum: só redesenhavam ao clicar em
     "Renderizar". E, com "Ajustar pela largura" ligado, a escala digitada era
     sobrescrita pela calculada — parecia que o campo não fazia nada. */
  const fitEl  = document.getElementById('loFitW');
  const scAuto = document.getElementById('loScaleAuto');
  const grAuto = document.getElementById('loGridAuto');
  const scEl   = document.getElementById('loScale');
  const wEl    = document.getElementById('loFigW');
  const wrEl   = document.getElementById('loFigWr');
  const drvEl  = document.getElementById('loDrive');

  function syncDrive(){
    const fit = !!((fitEl&&fitEl.checked)||(scAuto&&scAuto.checked));
    // quem manda fica ativo; o derivado fica esmaecido (mas continua legível)
    if(scEl){ scEl.readOnly = !!fit; scEl.style.opacity = fit? .55 : 1;
              scEl.title = fit? 'Calculada a partir da largura (arredondada para valor cheio)' : 'Escala do desenho'; }
    if(drvEl) drvEl.innerHTML = fit
      ? 'Escala <b>calculada</b> para o dado caber na largura. Digite uma escala para assumir o controle do zoom.'
      : 'Largura <b>fixa</b>; a escala controla o <b>zoom</b> — quanto terreno (e quanto detalhe) cabe nela.';
  }
  if(fitEl) fitEl.addEventListener('change',()=>{ if(scAuto)scAuto.checked=fitEl.checked;syncDrive(); redraw(); });
  if(scAuto)scAuto.addEventListener('change',()=>{if(fitEl)fitEl.checked=scAuto.checked;syncDrive();redraw();});
  if(grAuto)grAuto.addEventListener('change',redraw);

  if(scEl) scEl.addEventListener('input',()=>{
    // digitar uma escala é um pedido explícito: desliga o "ajustar pela largura"
    const mudou=!!((fitEl&&fitEl.checked)||(scAuto&&scAuto.checked));
    if(fitEl)fitEl.checked=false;
    if(scAuto)scAuto.checked=false;
    if(mudou){ syncDrive();
      toast('Escala manual — “Ajustar pela largura” desligado'); }
    if(typeof escalaPassoPara==='function') scEl.step=escalaPassoPara(scEl.value);
    redraw();
  });
  if(scEl) scEl.addEventListener('change',()=>{
    const n=Math.max(100,Math.min(100000000,+scEl.value||5000));
    scEl.value=Math.round(n);
    if(typeof escalaPassoPara==='function') scEl.step=escalaPassoPara(scEl.value);
    redraw();
  });
  if(scEl && typeof escalaPassoPara==='function') scEl.step=escalaPassoPara(scEl.value);
  const gEl=document.getElementById('loGrid');
  if(gEl) gEl.addEventListener('input',()=>{
    if(grAuto)grAuto.checked=false;redraw();
  });
  if(gEl) gEl.addEventListener('change',()=>{
    const n=Math.max(0,Math.min(1000000,+gEl.value||0));
    gEl.value=n>0?gradeDegrau(n):0;
    redraw();
  });
  ['loTitle','loSub'].forEach(id=>{ const e=document.getElementById(id); if(e) e.addEventListener('input',redraw); });

  syncDrive();
})();
