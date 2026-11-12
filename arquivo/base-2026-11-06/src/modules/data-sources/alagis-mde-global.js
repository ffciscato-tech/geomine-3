
/* ============================================================================
   MODELO DE ELEVAÇÃO GLOBAL — download por área
   Duas fontes, por um motivo prático: a que traz Copernicus e ALOS exige chave
   (o cadastro é gratuito, mas é um passo), e a que não exige nada é montada a
   partir de quadrículas de terreno. O comando nunca fica sem saída.
   A grade é reamostrada DIRETO no CRS de trabalho — chega pronta para a
   hidrologia, o TIN e os perfis, sem passo de reprojeção depois.
   ========================================================================== */
(function mdeGlobal(){
  const $=id=>document.getElementById(id);
  const CHAVE_DEMO='demoapikeyot2022';
  const TERRAIN='https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

  function caixa(){
    const v=($('mdeArea')||{}).value||'vista';
    if(v==='vista'){ const b=map.getBounds();
      return {w:b.getWest(),s:b.getSouth(),e:b.getEast(),n:b.getNorth(),de:'extensão da tela'}; }
    const L=(S.layers||[]).find(l=>String(l.id)===String(v));
    if(!L) return null;
    let s0=Infinity,w0=Infinity,n0=-Infinity,e0=-Infinity;
    (L.features||[]).forEach(f=>{ let lls; try{ lls=featToLatLngs(L,f); }catch(err){ return; }
      (function a(x){ if(!x) return;
        if(typeof x[0]==='number'){ s0=Math.min(s0,x[0]); n0=Math.max(n0,x[0]);
                                    w0=Math.min(w0,x[1]); e0=Math.max(e0,x[1]); return; }
        x.forEach(a); })(lls); });
    if(!isFinite(s0)) return null;
    return {w:w0,s:s0,e:e0,n:n0,de:'camada “'+L.name+'”'};
  }
  function areaKm2(c){ const km=111.32;
    return Math.abs((c.n-c.s)*km)*Math.abs((c.e-c.w)*km*Math.cos((c.n+c.s)/2*Math.PI/180)); }
  /* Grade de saída no CRS de trabalho, a partir da caixa em graus. */
  function gradeDestino(c,res){
    const p1=fromWGS(S.workCRS,c.w,c.s), p2=fromWGS(S.workCRS,c.e,c.n);
    const x0=Math.min(p1[0],p2[0]), x1=Math.max(p1[0],p2[0]);
    const y0=Math.min(p1[1],p2[1]), y1=Math.max(p1[1],p2[1]);
    /* O teto era por eixo (4000 em cada). Numa área que não fosse quadrada os
       dois eixos batiam no teto em resoluções diferentes e a célula saía
       retangular — 61,47 × 41,65 m numa caixa de 246 × 167 km. O teto passa a
       ser de células TOTAIS: quando estoura, os dois eixos encolhem pelo mesmo
       fator, a célula continua quadrada e só a resolução cede. */
    const TETO=16e6;
    let nc=Math.max(2,Math.round((x1-x0)/res));
    let nr=Math.max(2,Math.round((y1-y0)/res));
    if(nc*nr>TETO){
      const k=Math.sqrt(TETO/(nc*nr));
      nc=Math.max(2,Math.round(nc*k)); nr=Math.max(2,Math.round(nr*k));
    }
    return {x0,y0,x1,y1,nc,nr,cs:(x1-x0)/nc,csy:(y1-y0)/nr,noTeto:nc*nr>=TETO*0.98};
  }
  /* Resolução REAL de cada fonte. Pedir célula menor que isto não cria
     detalhe: repete o mesmo valor em várias células e produz um raster que
     PARECE mais fino do que o dado permite — engano perigoso num projeto. */
  const RES_NATIVA={aws:30, COP30:30, COP90:90, AW3D30:30, SRTMGL1:30, NASADEM:30};
  const NOME_FONTE={aws:'Terrain Tiles (SRTM/NASADEM)', COP30:'Copernicus GLO-30',
    COP90:'Copernicus GLO-90', AW3D30:'ALOS World 3D', SRTMGL1:'SRTM GL1', NASADEM:'NASADEM'};
  function info(){
    const el=$('mdeInfo'); if(!el) return;
    const c=caixa(); if(!c){ el.textContent='Camada sem geometria.'; return; }
    const res=Math.max(5,+($('mdeRes')||{}).value||30);
    const g=gradeDestino(c,res);
    const fonte=($('mdeFonte')||{}).value||'aws';
    const nativa=RES_NATIVA[fonte]||30;
    el.innerHTML=`${c.de} · ${areaKm2(c).toLocaleString('pt-BR',{maximumFractionDigits:1})} km²`+
      ` · grade ${g.nc} × ${g.nr} células de ${g.cs.toFixed(1)} m`+
      `<br>${NOME_FONTE[fonte]||fonte}: resolução nativa <b>${nativa} m</b>`+
      (g.cs < nativa*0.8
        ? ` <b style="color:var(--sel)">— a célula pedida é menor que o dado; o raster ganha células, não detalhe</b>`
        : '')+
      '<br><span style="font-size:10.5px">Todas estas fontes são de SUPERFÍCIE (DSM): a cota inclui copa de árvore e edificação, não o terreno nu.</span>';
  }
  function preencheArea(){
    const sel=$('mdeArea'); if(!sel) return;
    const atual=sel.value, polis=(S.layers||[]).filter(l=>l.gtype==='polygon');
    sel.innerHTML='<option value="vista">Extensão da tela</option>'+
      polis.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('');
    if([...sel.options].some(o=>o.value===atual)) sel.value=atual;
    info();
  }

  /* ---- fonte 1: quadrículas de terreno (sem cadastro) ----
     A elevação vem codificada no RGB do PNG: alt = R*256 + G + B/256 - 32768.
     O nível de zoom é escolhido pela resolução pedida, com teto de quadrículas
     para o download não virar um trabalho de minutos sem o usuário saber. */
  function nivelPara(res,lat){
    const mpp=156543.03392*Math.cos(lat*Math.PI/180);
    let z=Math.round(Math.log2(mpp/res));
    return Math.max(6,Math.min(14,z));
  }
  const lon2x=(lon,z)=>Math.floor((lon+180)/360*Math.pow(2,z));
  const lat2y=(lat,z)=>{ const r=lat*Math.PI/180;
    return Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z)); };
  function carregaPNG(u){
    return new Promise((ok,erro)=>{
      const im=new Image(); im.crossOrigin='anonymous';
      im.onload=()=>ok(im); im.onerror=()=>erro(new Error('quadrícula indisponível'));
      im.src=u;
    });
  }
  async function viaTerrain(c,res,aviso){
    const latm=(c.n+c.s)/2;
    let z=nivelPara(res,latm);
    let x0,x1,y0,y1,n;
    for(;;){
      x0=lon2x(c.w,z); x1=lon2x(c.e,z); y0=lat2y(c.n,z); y1=lat2y(c.s,z);
      n=(x1-x0+1)*(y1-y0+1);
      if(n<=64 || z<=6) break;
      z--;                                  // baixa o nível até caber no teto
    }
    const tam=256, larg=(x1-x0+1)*tam, alt=(y1-y0+1)*tam;
    const cv=document.createElement('canvas'); cv.width=larg; cv.height=alt;
    const ctx=cv.getContext('2d',{willReadFrequently:true});
    let ok=0;
    for(let ty=y0;ty<=y1;ty++) for(let tx=x0;tx<=x1;tx++){
      if(aviso) aviso(++ok,n,z);
      try{ const im=await carregaPNG(`${TERRAIN}/${z}/${tx}/${ty}.png`);
        ctx.drawImage(im,(tx-x0)*tam,(ty-y0)*tam); }catch(e){ /* buraco: fica sem dado */ }
    }
    const px=ctx.getImageData(0,0,larg,alt).data;
    /* leitura da altitude num ponto lat/lon, dentro do mosaico montado */
    const N=Math.pow(2,z);
    const cotaEm=(lat,lon)=>{
      const fx=(lon+180)/360*N, r=lat*Math.PI/180;
      const fy=(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*N;
      const ix=Math.round((fx-x0)*tam), iy=Math.round((fy-y0)*tam);
      if(ix<0||iy<0||ix>=larg||iy>=alt) return NaN;
      const k=(iy*larg+ix)*4;
      if(px[k+3]===0) return NaN;
      return px[k]*256+px[k+1]+px[k+2]/256-32768;
    };
    return {cotaEm, z, quadriculas:n};
  }

  /* ---- fonte 2: OpenTopography (Copernicus, ALOS, SRTM, NASADEM) ---- */
  async function viaOpenTopo(c,dem,chave){
    const u='https://portal.opentopography.org/API/globaldem?'+
      `demtype=${dem}&south=${c.s}&north=${c.n}&west=${c.w}&east=${c.e}`+
      `&outputFormat=GTiff&API_Key=${encodeURIComponent(chave||CHAVE_DEMO)}`;
    const r=await fetch(u);
    const buf=await r.arrayBuffer();
    if(r.status!==200){
      const txt=new TextDecoder().decode(buf).replace(/<[^>]+>/g,' ').trim();
      if(/rate limit/i.test(txt))
        throw new Error('a chave de demonstração esgotou a cota do dia — cadastre a sua em portal.opentopography.org (gratuito) e cole no campo acima');
      throw new Error(txt.slice(0,160)||('HTTP '+r.status));
    }
    await ensureGeoTIFF();
    const t=await GeoTIFF.fromArrayBuffer(buf);
    const im=await t.getImage(0);
    const bb=im.getBoundingBox();                 // [w,s,e,n] em graus
    const W=im.getWidth(), H=im.getHeight();
    const d=(await im.readRasters())[0];
    const nulo=(im.getGDALNoData&&im.getGDALNoData())??-32768;
    const cotaEm=(lat,lon)=>{
      const ix=Math.round((lon-bb[0])/(bb[2]-bb[0])*(W-1));
      const iy=Math.round((bb[3]-lat)/(bb[3]-bb[1])*(H-1));
      if(ix<0||iy<0||ix>=W||iy>=H) return NaN;
      const v=d[iy*W+ix];
      return (v===nulo||v<-1000)? NaN : v;
    };
    return {cotaEm, dims:W+'×'+H};
  }

  async function baixar(){
    const c=caixa(); if(!c){ toast('Área inválida'); return; }
    const res=Math.max(5,+($('mdeRes')||{}).value||30);
    const fonte=($('mdeFonte')||{}).value||'aws';
    const out=$('mdeOut');
    const g=gradeDestino(c,res);
    showLoad('MDE: preparando…');
    if(out) out.textContent='Buscando a topografia…';
    let amostra=null, origem='';
    try{
      if(fonte==='aws'){
        amostra=await viaTerrain(c,res,(i,n,z)=>{
          showLoad(`MDE: quadrícula ${i}/${n} (nível ${z})…`);
          if(out) out.innerHTML=`Montando o mosaico · quadrícula <b>${i}</b> de ${n}…`; });
        origem=`Terrain Tiles · nível ${amostra.z} · ${amostra.quadriculas} quadrículas`;
      }else{
        const chave=String(($('mdeChave')||{}).value||'').trim();
        if(chave) try{ localStorage.setItem('alagis_ot_key',chave); }catch(e){}
        showLoad('MDE: consultando o OpenTopography…');
        amostra=await viaOpenTopo(c,fonte,chave);
        origem=`${fonte} · OpenTopography · ${amostra.dims} px`;
      }
    }catch(err){
      hideLoad();
      if(out) out.innerHTML='<b style="color:var(--sel)">Não foi possível baixar.</b><br>'+esc(err.message||String(err));
      toast('MDE: '+(err.message||err));
      return;
    }
    /* Reamostra para a grade do CRS de trabalho. */
    showLoad('MDE: reamostrando no CRS do projeto…');
    await new Promise(r=>setTimeout(r,10));
    const z=new Float32Array(g.nc*g.nr).fill(NaN);
    let validos=0, zmin=Infinity, zmax=-Infinity;
    for(let r0=0;r0<g.nr;r0++){
      const yy=g.y1-(r0+0.5)*((g.y1-g.y0)/g.nr);
      for(let c0=0;c0<g.nc;c0++){
        const xx=g.x0+(c0+0.5)*g.cs;
        const w=toWGS(S.workCRS,xx,yy);
        const v=amostra.cotaEm(w[1],w[0]);
        if(isFinite(v)){ z[r0*g.nc+c0]=v; validos++;
          if(v<zmin)zmin=v; if(v>zmax)zmax=v; }
      }
      if(r0%64===0) await new Promise(q=>setTimeout(q,0));
    }
    hideLoad();
    if(!validos){
      if(out) out.innerHTML='<b style="color:var(--sel)">A fonte não tem dado nesta área.</b>';
      toast('MDE: sem dado na área'); return;
    }
    /* RECORTE pelo contorno: a caixa envolvente é retangular, e uma poligonal
       de estudo raramente é. Sem isto sobra topografia de fora da área dentro
       do arquivo salvo — e ela entra por engano em bacia, volume e perfil. */
    let recortadas=0;
    const vRec=($('mdeArea')||{}).value||'vista';
    if(vRec!=='vista' && ($('mdeRecorta')||{}).checked){
      const L=(S.layers||[]).find(l=>String(l.id)===String(vRec));
      /* UNIÃO POR FEIÇÃO. O par/ímpar através de TODOS os anéis juntos fazia
         XOR: duas cópias quase iguais do polígono (sobra comum de tentativas
         de CRS) cancelavam a sobreposição e abriam uma faixa SEM DADO dentro
         do limite — era o vazio da borda noroeste. Cada feição decide por si
         (furo continua valendo dentro dela); estar dentro de QUALQUER uma
         mantém a célula. */
      const feicoes=[];
      (L&&L.features||[]).forEach(ft=>{
        const partes=(ft.multi&&Array.isArray(ft.geom[0])&&Array.isArray(ft.geom[0][0]))?ft.geom:[ft.geom];
        const grupo=[];
        partes.forEach(rg=>{ if(Array.isArray(rg)&&rg.length>2)
          grupo.push(rg.map(q=>{ if(L.crs===S.workCRS) return [q[0],q[1]];
            const w2=toWGS(L.crs,q[0],q[1]); const p2=fromWGS(S.workCRS,w2[0],w2[1]); return [p2[0],p2[1]]; })); });
        if(grupo.length) feicoes.push(grupo);
      });
      if(feicoes.length){
        const dentroDe=(grupo,x,y)=>{ let d=false;
          for(const rg of grupo) for(let i=0,j=rg.length-1;i<rg.length;j=i++){
            const xi=rg[i][0],yi=rg[i][1],xj=rg[j][0],yj=rg[j][1];
            if(((yi>y)!==(yj>y)) && x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi) d=!d; }
          return d; };
        const dentro=(x,y)=>feicoes.some(g=>dentroDe(g,x,y));
        for(let r0=0;r0<g.nr;r0++){
          const yy=g.y1-(r0+0.5)*((g.y1-g.y0)/g.nr);
          for(let c0=0;c0<g.nc;c0++){
            const k=r0*g.nc+c0;
            if(!isFinite(z[k])) continue;
            if(!dentro(g.x0+(c0+0.5)*g.cs,yy)){ z[k]=NaN; recortadas++; validos--; }
          }
        }
      }
    }
    const nome=(fonte==='aws'?'MDE Terrain Tiles':'MDE '+fonte)+' — '+
      (new Date().toLocaleDateString('pt-BR'));
    const R={id:rid++, name:nome, visible:true, overlay:null, srcCRS:S.workCRS,
      style:{mode:'elev', opacity:0.85},
      d:{nc:g.nc, nr:g.nr, cs:g.cs, csy:(g.y1-g.y0)/g.nr, xll:g.x0, yll:g.y0, z}};
    S.rasters.push(R);
    try{ renderRaster(R); }catch(e){ console.warn('render do MDE',e); }
    try{ refreshUI(); }catch(e){}
    /* Grava o raster na pasta do projeto, como fazem todos os outros comandos
       que criam raster. Sem esta chamada o MDE baixado existia só na sessão e
       sumia ao reabrir o .ccmgis — o projeto guarda a ficha do raster, não a
       grade, e o pixel mora em ALAGIS/rasters. */
    try{ projectAutoSaveRaster(R); }catch(e){ console.warn('gravação do MDE',e); }
    if(out) out.innerHTML=`<b>${nome}</b><br>${origem}<br>Grade ${g.nc} × ${g.nr} · célula ${g.cs.toFixed(1)} m`+
      `<br>Cotas de <b>${zmin.toFixed(1)}</b> a <b>${zmax.toFixed(1)}</b> m · `+
      `${(100*validos/(g.nc*g.nr)).toFixed(1)}% das células com dado`+
      (recortadas? `<br>${recortadas.toLocaleString('pt-BR')} células fora do contorno foram descartadas`:'')+
      (fonte==='aws'? '<br><span style="font-size:10.5px">Fonte: Terrain Tiles (SRTM/NASADEM e outros), domínio público.</span>'
                    : '<br><span style="font-size:10.5px">Fonte: OpenTopography · '+fonte+'. Citar conforme a licença do produto.</span>');
    toast(`MDE importado · ${zmin.toFixed(0)} a ${zmax.toFixed(0)} m`);
    try{ cmdLog('MDE: '+origem+' · '+g.nc+'x'+g.nr+' células de '+g.cs.toFixed(1)+' m','ok'); }catch(e){}
  }

  function abrePainel(btn){
    const sec=$('secMDE');
    if(!sec){ toast('Painel do MDE não encontrado'); return; }
    preencheArea();
    try{ const k=localStorage.getItem('alagis_ot_key'); if(k&&$('mdeChave')) $('mdeChave').value=k; }catch(e){}
    if(typeof ribbonOpen==='function') ribbonOpen(sec,btn,'Modelo de elevação global');
    /* o commandUseActive do ribbonOpen pré-seleciona a camada ativa em
       qualquer <select>; aqui a área padrão é SEMPRE a tela (pedido do
       projeto) — a poligonal fica a um clique. */
    setTimeout(()=>{ const sa=document.getElementById('mdeArea');
      if(sa){ sa.value='vista'; sa.dispatchEvent(new Event('change')); } },0);
  }
  function liga(){
    try{
      if(typeof RIB_SVG==='object') RIB_SVG.mde=
        '<svg viewBox="0 0 32 32" fill="none"><title>MDE global</title>'+
        '<defs><linearGradient id="al3_mde_g" x1="0" y1="1" x2="0" y2="0">'+
        '<stop offset="0" stop-color="#2E9B32"/><stop offset="0.55" stop-color="#FFD27A"/>'+
        '<stop offset="1" stop-color="#FFFFFF"/></linearGradient></defs>'+
        '<path d="M3 23l7-11 5 7 4-6 8 10z" fill="url(#al3_mde_g)" stroke="#173B57" stroke-width="1.4" stroke-linejoin="round"/>'+
        '<path d="M3 23h24" stroke="#173B57" stroke-width="1.4"/>'+
        '<path d="M6 20h18M9 17h12M12 14h6" stroke="#173B57" stroke-width="0.8" opacity="0.55"/>'+
        '<path d="M16 25v4.5M11.5 29.5h9" stroke="#173B57" stroke-width="1.6" stroke-linecap="round"/></svg>';
    }catch(e){}
    try{
      const cat=(typeof CATS!=='undefined')&&CATS.find(c=>c.id==='gis');
      if(cat) for(const gr of cat.grupos||[]) for(const cmd of gr.it||[])
        if(cmd.ic==='mde'){ cmd.visual=0; cmd.soon=0; cmd.act=abrePainel; }
      if(typeof ribbonBuild==='function') ribbonBuild();
    }catch(e){ console.warn('MDE: ligação da ribbon',e); }
    const lig=(id,ev,fn)=>{ const e=$(id); if(e&&!e['_l'+ev]){ e['_l'+ev]=1; e.addEventListener(ev,fn); } };
    lig('mdeBaixar','click',()=>baixar().catch(err=>{ try{hideLoad();}catch(_){}
      toast('MDE falhou: '+(err&&err.message||err)); }));
    lig('mdeArea','change',info);
    lig('mdeArea','mousedown',preencheArea);   // lista viva: polígono criado com o painel aberto
    lig('mdeArea','focus',preencheArea);
    lig('mdeRes','input',info);
    lig('mdeFonte','change',()=>{
      const box=$('mdeChaveBox'); if(box) box.style.display=(($('mdeFonte')||{}).value==='aws')?'none':'block';
    });
    try{ if(typeof map!=='undefined'&&map&&map.on) map.on('moveend zoomend',info); }catch(e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(liga,0));
  else setTimeout(liga,0);
  window.mdeAbrePainel=abrePainel;
  window.mdeBaixaArea=baixar;
})();
