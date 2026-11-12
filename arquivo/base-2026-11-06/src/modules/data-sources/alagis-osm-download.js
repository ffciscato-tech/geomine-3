
/* ============================================================================
   DADOS DO OPENSTREETMAP — download por área via Overpass API
   Um tema = uma consulta = uma camada vetorial no CRS de trabalho. A resposta
   vem com `out geom`, que já traz a geometria embutida: dispensa a segunda
   volta para resolver nós e corta o tempo de espera pela metade.
   Licença ODbL: o dado é livre, mas a atribuição é obrigatória ao publicar.
   ========================================================================== */
/* Mantém na camada só o que TOCA a poligonal de recorte: vértice da feição
   dentro dela, ou a poligonal dentro da feição. O servidor responde pela
   CAIXA envolvente — quem fecha o recorte no contorno é este filtro. */
window.alagisRecortaPorPoligono=function(L,Lp){
  /* União POR FEIÇÃO — o par/ímpar global fazia XOR entre polígonos
     sobrepostos e "cancelava" a área comum (mesmo defeito do recorte do MDE). */
  const feicoes=[];
  (Lp.features||[]).forEach(f=>{
    const partes=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
    const grupo=[];
    partes.forEach(r=>{ if(r&&r.length>2)
      grupo.push(r.map(q=>{const w=toWGS(Lp.crs,q[0],q[1]);return [w[0],w[1]];})); });
    if(grupo.length) feicoes.push(grupo);
  });
  if(!feicoes.length) return 0;
  const aneis=feicoes.flat();
  let bx0=1e9,by0=1e9,bx1=-1e9,by1=-1e9;
  aneis.forEach(r=>r.forEach(p=>{bx0=Math.min(bx0,p[0]);by0=Math.min(by0,p[1]);
    bx1=Math.max(bx1,p[0]);by1=Math.max(by1,p[1]);}));
  const dentroDe=(grupo,x,y)=>{let d=false;
    for(const r of grupo) for(let i=0,j=r.length-1;i<r.length;j=i++){
      const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];
      if(((yi>y)!==(yj>y)) && x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi) d=!d; }
    return d;};
  const dentro=(x,y)=>feicoes.some(g=>dentroDe(g,x,y));
  const toca=f=>{
    const pts=[];(function a(g){ if(!Array.isArray(g)) return;
      if(typeof g[0]==='number'){ pts.push(g); return; } g.forEach(a); })(f.geom);
    if(!pts.length) return false;
    let fx0=1e9,fy0=1e9,fx1=-1e9,fy1=-1e9;
    const ll=pts.map(p=>{const w=toWGS(L.crs,p[0],p[1]);
      fx0=Math.min(fx0,w[0]);fy0=Math.min(fy0,w[1]);
      fx1=Math.max(fx1,w[0]);fy1=Math.max(fy1,w[1]);return w;});
    if(fx1<bx0||fx0>bx1||fy1<by0||fy0>by1) return false;   // caixas nem se tocam
    for(const w of ll) if(dentro(w[0],w[1])) return true;   // vértice dentro
    if(L.gtype==='polygon'){                                // poligonal dentro da feição
      const p0=aneis[0][0];
      const anel=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom[0]:f.geom;
      let d=false;
      const a2=anel.map(q=>toWGS(L.crs,q[0],q[1]));
      for(let i=0,j=a2.length-1;i<a2.length;j=i++){
        const xi=a2[i][0],yi=a2[i][1],xj=a2[j][0],yj=a2[j][1];
        if(((yi>p0[1])!==(yj>p0[1])) && p0[0]<(xj-xi)*(p0[1]-yi)/((yj-yi)||1e-12)+xi) d=!d; }
      if(d) return true;
    }
    return false;};
  const antes=L.features.length;
  L.features=L.features.filter(toca);
  const rem=antes-L.features.length;
  if(rem){ try{ drawLayer(L); refreshUI(); }catch(e){} }
  return rem;
};
(function osmDownload(){
  const OSM_TEMAS=[
    {k:'vias',    rot:'Vias e estradas',    gt:'line',    sel:'way["highway"]',                  campo:'highway'},
    {k:'edif',    rot:'Edificações',        gt:'polygon', sel:'way["building"]',                 campo:'building', rel:'relation["building"]'},
    {k:'hidro',   rot:'Drenagem',           gt:'line',    sel:'way["waterway"]',                 campo:'waterway'},
    {k:'agua',    rot:'Massas d’água', gt:'polygon', sel:'way["natural"="water"]',          campo:'natural', rel:'relation["natural"="water"]'},
    {k:'ferrovia',rot:'Ferrovias',          gt:'line',    sel:'way["railway"]',                  campo:'railway'},
    {k:'uso',     rot:'Uso do solo',        gt:'polygon', sel:'way["landuse"]',                  campo:'landuse', rel:'relation["landuse"]'},
    {k:'mata',    rot:'Vegetação',          gt:'polygon', sel:'way["natural"~"wood|scrub|grassland"]', campo:'natural', rel:'relation["natural"~"wood|scrub|grassland"]'},
    {k:'poi',     rot:'Pontos de interesse',gt:'point',   sel:'node["amenity"]',                 campo:'amenity'},
    {k:'limites', rot:'Limites administrativos', gt:'line', sel:'way["boundary"="administrative"]', campo:'admin_level'},
    {k:'energia', rot:'Linhas de energia',  gt:'line',    sel:'way["power"~"line|minor_line"]',  campo:'power'}
  ];
  /* Espelhos oficiais: o primeiro que responder atende. O de Kumi costuma ter
     fila menor nos horários de pico da Europa. */
  const ESPELHOS=['https://overpass-api.de/api/interpreter',
                  'https://overpass.kumi.systems/api/interpreter'];
  /* O Overpass estoura o tempo em área grande. Em vez de recusar o trabalho,
     a área é FATIADA em quadrículas e cada uma vai numa consulta. O alvo por
     quadrícula é conservador de propósito: consulta que volta rápido é melhor
     que consulta que volta com 504 e precisa ser repetida. */
  const AREA_QUAD_KM2=120;         // alvo de cada quadrícula
  /* SEM teto de quadrículas: a divisão existe exatamente para que área grande
     não seja recusada. O painel informa o tamanho do trabalho e o tempo é o
     que for — quem decide é o usuário. */

  const $=id=>document.getElementById(id);
  const marcados=()=>[...document.querySelectorAll('#osmTemas input[type=checkbox]:checked')]
    .map(c=>OSM_TEMAS.find(t=>t.k===c.value)).filter(Boolean);

  /* Caixa em WGS84 (S,W,N,E) da área escolhida: a tela ou uma camada do projeto. */
  function osmCaixa(){
    const v=($('osmArea')||{}).value||'vista';
    if(v==='vista'){
      const b=map.getBounds();
      return {s:b.getSouth(), w:b.getWest(), n:b.getNorth(), e:b.getEast(), de:'extensão da tela'};
    }
    const L=(S.layers||[]).find(l=>String(l.id)===String(v));
    if(!L) return null;
    let s0=Infinity,w0=Infinity,n0=-Infinity,e0=-Infinity;
    (L.features||[]).forEach(f=>{
      let lls; try{ lls=featToLatLngs(L,f); }catch(err){ return; }
      (function achata(a){ if(!a) return;
        if(typeof a[0]==='number'){ s0=Math.min(s0,a[0]); n0=Math.max(n0,a[0]);
                                    w0=Math.min(w0,a[1]); e0=Math.max(e0,a[1]); return; }
        a.forEach(achata); })(lls);
    });
    if(!isFinite(s0)) return null;
    return {s:s0,w:w0,n:n0,e:e0, de:'camada “'+L.name+'”'};
  }
  function areaKm2(c){
    const km=111.32;
    return Math.abs((c.n-c.s)*km) * Math.abs((c.e-c.w)*km*Math.cos((c.n+c.s)/2*Math.PI/180));
  }
  /* Fatia a caixa numa grade cujas células cabem no limite prático do
     servidor. A feição que cruza a borda volta em mais de uma quadrícula —
     por isso a montagem final descarta repetidas pelo id do OSM. */
  function quadriculas(c){
    const a=areaKm2(c);
    if(a<=AREA_QUAD_KM2) return [c];
    const n=Math.max(1,Math.ceil(Math.sqrt(a/AREA_QUAD_KM2)));
    const dw=(c.e-c.w)/n, dh=(c.n-c.s)/n, out=[];
    for(let j=0;j<n;j++) for(let i=0;i<n;i++)
      out.push({w:c.w+i*dw, e:c.w+(i+1)*dw, s:c.s+j*dh, n:c.s+(j+1)*dh});
    return out;
  }
  function atualizaInfo(){
    const c=osmCaixa(), el=$('osmAreaInfo'); if(!el) return;
    if(!c){ el.textContent='Camada sem geometria.'; return; }
    const a=areaKm2(c), q=quadriculas(c).length;
    el.innerHTML=`${c.de} · ${a.toLocaleString('pt-BR',{maximumFractionDigits:1})} km²`+
      (q>1? ` · será baixada em <b>${q} quadrículas</b>`:'')+
      (q>60? ` <span style="color:var(--amber)">(~${Math.ceil(q*2/60)} min por tema)</span>`:'');
  }
  function preencheArea(){
    const sel=$('osmArea'); if(!sel) return;
    const atual=sel.value;
    const polis=(S.layers||[]).filter(l=>l.gtype==='polygon');
    sel.innerHTML='<option value="vista">Extensão da tela</option>'+
      polis.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('');
    if([...sel.options].some(o=>o.value===atual)) sel.value=atual;
    atualizaInfo();
  }
  function preencheTemas(){
    const box=$('osmTemas'); if(!box||box._pronto) return; box._pronto=1;
    box.innerHTML=OSM_TEMAS.map(t=>
      `<label class="snap-opt" style="font-size:11.5px"><input type="checkbox" value="${t.k}"${
        ['vias','hidro','edif'].includes(t.k)?' checked':''}><span>${t.rot}</span></label>`).join('');
  }

  /* Consulta uma vez por tema. `out geom` traz lat/lon em cada nó do caminho. */
  async function consulta(tema,c){
    const bbox=`(${c.s.toFixed(6)},${c.w.toFixed(6)},${c.n.toFixed(6)},${c.e.toFixed(6)})`;
    /* Lago, praça e quadra grandes quase sempre são MULTIPOLÍGONO — uma
       relation, não um way. Pedindo só way, eles somem sem aviso: medido no
       Parque Barigui, 6 ways e 1 relation de água, e a relation era o lago. */
    const alvos=[tema.sel+bbox].concat(tema.rel? [tema.rel+bbox] : []);
    const q=`[out:json][timeout:90];(${alvos.join(';')};);out geom;`;
    let ultimoErro=null;
    /* Duas rodadas pelos espelhos: 429 (fila cheia) e 504 (tempo esgotado) são
       rotina no Overpass e passam sozinhos em segundos. Sem repetir, um 504
       isolado matava o tema inteiro — foi o que aconteceu com "massas d'água". */
    for(const rodada of [0,1])
    for(const url of ESPELHOS){
      if(rodada) await new Promise(r=>setTimeout(r,2500));
      /* Tempo limite por espelho: sem isto, um servidor que aceita a conexão e
         não responde deixa a espera pendurada para sempre, com a cortina de
         carregamento na tela e sem caminho de saída. Passado o prazo, aborta e
         tenta o espelho seguinte. */
      const ctl=new AbortController();
      const t=setTimeout(()=>ctl.abort(),120000);
      try{
        const r=await fetch(url,{method:'POST',body:'data='+encodeURIComponent(q),
          headers:{'Content-Type':'application/x-www-form-urlencoded'},
          signal:ctl.signal});
        if(!r.ok){ ultimoErro=new Error('HTTP '+r.status); continue; }
        return await r.json();
      }catch(err){
        ultimoErro=(err&&err.name==='AbortError')
          ? new Error('sem resposta em 2 min') : err;
      }finally{ clearTimeout(t); }
    }
    throw ultimoErro||new Error('sem resposta dos servidores Overpass');
  }
  /* OSM → feições no CRS de trabalho. Caminho fechado num tema de área vira
     polígono; nos temas de linha continua linha, mesmo fechado. */
  /* Costura os trechos de um multipolígono em anéis fechados. No OSM a borda
     de um lago vem partida em vários ways; cada membro é um pedaço solto, e
     só emendando ponta com ponta é que se obtém o anel. */
  function costuraAneis(membros){
    const pedacos=membros.map(m=>m.slice()).filter(p=>p.length>1);
    const aneis=[], iguais=(a,b)=>Math.abs(a[0]-b[0])<1e-9 && Math.abs(a[1]-b[1])<1e-9;
    while(pedacos.length){
      let anel=pedacos.shift();
      let mudou=true;
      while(mudou && !iguais(anel[0],anel[anel.length-1])){
        mudou=false;
        for(let i=0;i<pedacos.length;i++){
          const p=pedacos[i], fim=anel[anel.length-1], ini=anel[0];
          if(iguais(fim,p[0])){ anel=anel.concat(p.slice(1)); pedacos.splice(i,1); mudou=true; break; }
          if(iguais(fim,p[p.length-1])){ anel=anel.concat(p.slice(0,-1).reverse()); pedacos.splice(i,1); mudou=true; break; }
          if(iguais(ini,p[p.length-1])){ anel=p.slice(0,-1).concat(anel); pedacos.splice(i,1); mudou=true; break; }
          if(iguais(ini,p[0])){ anel=p.slice(1).reverse().concat(anel); pedacos.splice(i,1); mudou=true; break; }
        }
      }
      if(anel.length>=3){
        if(!iguais(anel[0],anel[anel.length-1])) anel.push(anel[0].slice());
        if(anel.length>=4) aneis.push(anel);
      }
    }
    return aneis;
  }
  function areaAnel(r){ let a=0; for(let i=0,j=r.length-1;i<r.length;j=i++) a+=r[j][0]*r[i][1]-r[i][0]*r[j][1]; return Math.abs(a/2); }
  function pontoEmAnel(p,r){ let d=false;
    for(let i=0,j=r.length-1;i<r.length;j=i++){ const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];
      if(((yi>p[1])!==(yj>p[1])) && p[0]<(xj-xi)*(p[1]-yi)/((yj-yi)||1e-12)+xi) d=!d; }
    return d; }
  function converte(tema,json){
    const feats=[];
    const paraCRS=(lat,lon)=>{ const p=fromWGS(S.workCRS,lon,lat); return [p[0],p[1]]; };
    (json.elements||[]).forEach(el=>{
      /* RELATION: monta os anéis externos e encaixa cada buraco no externo que
         o contém — é o que faz a ilha aparecer como ilha, e não como terra. */
      if(el.type==='relation'){
        if(tema.gt!=='polygon' || !Array.isArray(el.members)) return;
        const tg=el.tags||{};
        const pr={OSM_ID:String(el.id||''), TIPO:String(tg[tema.campo]||''), NOME:String(tg.name||'')};
        const geo=p=>(p.geometry||[]).filter(q=>q&&isFinite(q.lat)).map(q=>paraCRS(q.lat,q.lon));
        const fora=costuraAneis(el.members.filter(m=>m.role!=='inner').map(geo));
        const dentro=costuraAneis(el.members.filter(m=>m.role==='inner').map(geo));
        fora.sort((a,b)=>areaAnel(b)-areaAnel(a));
        fora.forEach(ext=>{
          const buracos=dentro.filter(h=>pontoEmAnel(h[0],ext));
          feats.push({geom:[ext].concat(buracos), multi:true, props:pr});
        });
        return;
      }
      const tags=el.tags||{};
      const props={OSM_ID:String(el.id||''), TIPO:String(tags[tema.campo]||''),
                   NOME:String(tags.name||'')};
      if(el.type==='node' && isFinite(el.lat)){
        feats.push({geom:[paraCRS(el.lat,el.lon)], multi:false, props});
        return;
      }
      const g=el.geometry;
      if(!Array.isArray(g)||g.length<2) return;
      const pts=g.filter(q=>q&&isFinite(q.lat)).map(q=>paraCRS(q.lat,q.lon));
      if(pts.length<2) return;
      if(tema.gt==='polygon'){
        const a=pts[0], b=pts[pts.length-1];
        if(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-6) pts.push(a.slice());
        if(pts.length<4) return;
        feats.push({geom:[pts], multi:true, props});
      }else{
        feats.push({geom:pts, multi:false, props});
      }
    });
    return feats;
  }

  async function baixar(){
    const temas=marcados();
    if(!temas.length){ toast('Marque ao menos um tema'); return; }
    const c=osmCaixa();
    if(!c){ toast('Área inválida'); return; }
    const quads=quadriculas(c);
    const vRec=($('osmArea')||{}).value;
    const polyRec=(vRec&&vRec!=='vista'&&($('osmClip')||{}).checked)
      ? (S.layers||[]).find(l=>String(l.id)===String(vRec)) : null;
    const out=$('osmOut');
    const linhas=[];
    let total=0;
    for(let i=0;i<temas.length;i++){
      const t=temas[i];
      showLoad(`OSM: ${t.rot} (${i+1}/${temas.length})…`);
      if(out) out.innerHTML=`Baixando <b>${t.rot}</b> (${i+1} de ${temas.length})…`;
      try{
        /* Uma consulta por quadrícula, resultado somado. A feição que cruza a
           borda chega repetida: a chave junta id do OSM e primeiro vértice,
           porque um multipolígono rende várias feições com o MESMO id e todas
           precisam sobreviver. */
        const vistos=new Set(); const feats=[];
        for(let qi=0; qi<quads.length; qi++){
          if(quads.length>1){
            showLoad(`OSM: ${t.rot} · quadrícula ${qi+1}/${quads.length}…`);
            if(out) out.innerHTML=`Baixando <b>${t.rot}</b> (${i+1} de ${temas.length}) · quadrícula ${qi+1} de ${quads.length}…`;
          }
          const json=await consulta(t,quads[qi]);
          converte(t,json).forEach(f=>{
            const p0=(f.geom&&f.geom[0]&&(typeof f.geom[0][0]==='number'? f.geom[0] : f.geom[0][0]))||[0,0];
            const chave=(f.props.OSM_ID||'')+'|'+p0[0].toFixed(2)+','+p0[1].toFixed(2);
            if(vistos.has(chave)) return;
            vistos.add(chave); feats.push(f);
          });
          if(quads.length>1) await new Promise(r=>setTimeout(r,250));
        }
        if(!feats.length){ linhas.push(`· ${t.rot}: nada na área`); continue; }
        const Lnv=addLayer({name:'OSM — '+t.rot, gtype:t.gt, crs:S.workCRS,
          fields:[{name:'OSM_ID',type:'C',length:20,decimal:0},
                  {name:'TIPO',  type:'C',length:40,decimal:0},
                  {name:'NOME',  type:'C',length:80,decimal:0}],
          features:feats});
        let rec=0;
        if(polyRec&&Lnv){ try{ rec=window.alagisRecortaPorPoligono(Lnv,polyRec); }catch(e){} }
        total+=Lnv?Lnv.features.length:feats.length;
        linhas.push(`· ${t.rot}: ${(Lnv?Lnv.features.length:feats.length).toLocaleString('pt-BR')} feições`+
          (quads.length>1?` (${quads.length} quadrículas)`:'')+
          (rec?` · ${rec.toLocaleString('pt-BR')} fora da poligonal descartadas`:''));
      }catch(err){
        linhas.push(`· ${t.rot}: falhou — ${err.message||err}`);
      }
      await new Promise(r=>setTimeout(r,300));   // respeita o limite de uso do serviço
    }
    hideLoad();
    if(out) out.innerHTML=linhas.join('<br>')+
      `<br><br><b>${total.toLocaleString('pt-BR')} feições</b> importadas.`+
      `<br><span style="font-size:10.5px">Fonte: OpenStreetMap, sob ODbL. Citar “© colaboradores do OpenStreetMap” nas pranchas.</span>`;
    try{ refreshUI(); }catch(e){}
    toast(total? `OSM: ${total.toLocaleString('pt-BR')} feições importadas` : 'OSM: nada encontrado na área');
    try{ cmdLog('OSM baixado: '+linhas.join(' | '),'ok'); }catch(e){}
  }

  function abrePainel(btn){
    const sec=$('secOSM');
    if(!sec){ toast('Painel do OpenStreetMap não encontrado'); return; }
    preencheTemas(); preencheArea();
    if(typeof ribbonOpen==='function') ribbonOpen(sec,btn,'Dados OpenStreetMap');
    /* o commandUseActive do ribbonOpen pré-seleciona a camada ativa em
       qualquer <select>; aqui a área padrão é SEMPRE a tela (pedido do
       projeto) — a poligonal fica a um clique. */
    setTimeout(()=>{ const sa=document.getElementById('osmArea');
      if(sa){ sa.value='vista'; sa.dispatchEvent(new Event('change')); } },0);
  }

  function liga(){
    /* Ícone próprio, no mesmo padrão vetorial da ribbon. */
    try{
      if(typeof RIB_SVG==='object') RIB_SVG.osm=
        '<svg viewBox="0 0 32 32" fill="none"><title>Dados OpenStreetMap</title>'+
        '<defs><linearGradient id="al3_osm_g" x1="0" y1="0" x2="0" y2="1">'+
        '<stop offset="0" stop-color="#8FE388"/><stop offset="1" stop-color="#2E9B32"/></linearGradient></defs>'+
        '<circle cx="16" cy="13" r="9.5" fill="url(#al3_osm_g)" stroke="#173B57" stroke-width="1.4"/>'+
        '<path d="M6.5 13h19M16 3.6c2.6 3 2.6 15.8 0 18.8M16 3.6c-2.6 3-2.6 15.8 0 18.8" stroke="#173B57" stroke-width="1.1"/>'+
        '<path d="M16 24.5v5M11 29.5h10" stroke="#173B57" stroke-width="1.6" stroke-linecap="round"/>'+
        '<path d="M23 22.5l3.5 3.5M26.5 22.5L23 26" stroke="#F57C00" stroke-width="1.8" stroke-linecap="round"/></svg>';
    }catch(e){}
    /* A ribbon é montada a partir de CATS; o registrador `comando` vive dentro
       de outra IIFE, então a ação é ligada direto na entrada do catálogo. */
    try{
      const cat=(typeof CATS!=='undefined')&&CATS.find(c=>c.id==='gis');
      if(cat) for(const g of cat.grupos||[]) for(const cmd of g.it||[])
        if(cmd.ic==='osm'){ cmd.visual=0; cmd.soon=0; cmd.act=abrePainel; }
      if(typeof ribbonBuild==='function') ribbonBuild();
    }catch(e){ console.warn('OSM: ligação da ribbon',e); }
    const b=$('osmBaixar');
    if(b&&!b._lig){ b._lig=1; b.onclick=()=>baixar().catch(err=>{
      try{hideLoad();}catch(_){}
      toast('OSM falhou: '+(err&&err.message||err)); }); }
    const sa=$('osmArea');
    if(sa&&!sa._lig){ sa._lig=1; sa.onchange=atualizaInfo;
      /* A lista era montada só na abertura do painel. Como a janela fica
         aberta durante o trabalho, um polígono desenhado DEPOIS nunca
         aparecia — parecia que a opção de baixar por limite tinha sumido.
         Repovoar no gesto de abrir o seletor conserta sem custo. */
      sa.addEventListener('mousedown',preencheArea);
      sa.addEventListener('focus',preencheArea);
    }
    const bt=$('osmTodos'), bn=$('osmNenhum');
    if(bt&&!bt._lig){ bt._lig=1; bt.onclick=()=>document.querySelectorAll('#osmTemas input').forEach(c=>c.checked=true); }
    if(bn&&!bn._lig){ bn._lig=1; bn.onclick=()=>document.querySelectorAll('#osmTemas input').forEach(c=>c.checked=false); }
    try{ if(typeof map!=='undefined'&&map&&map.on) map.on('moveend zoomend',atualizaInfo); }catch(e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(liga,0));
  else setTimeout(liga,0);
  window.osmAbrePainel=abrePainel;
  window.osmBaixaDados=baixar;
})();
