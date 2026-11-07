
/* ============================================================================
   CAR / SICAR — imóveis rurais por WFS, recortados pela área
   O catálogo global do GeoServer do SICAR esconde as camadas; o capabilities
   RESTRITO AO WORKSPACE (…/geoserver/sicar/ows) revela as 27, uma por UF —
   sicar_imoveis_ac … sicar_imoveis_to. É a mesma base que alimenta o mapa do
   consulta.car.gov.br, sem o captcha da página de download.
   ========================================================================== */
(function carSICAR(){
  const $=id=>document.getElementById(id);
  const BASE='https://geoserver.car.gov.br/geoserver/sicar/ows';
  const UFS=['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA',
             'PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
  /* status do imóvel, com as cores do próprio visualizador público */
  const STATUS={AT:['Ativo','#e0a11e'],PE:['Pendente','#e0641e'],
                SU:['Suspenso','#8a4fd4'],CA:['Cancelado','#c0392b']};
  /* Temas do CAR e o prefixo da camada correspondente no GeoServer. A lista
     de que temas EXISTEM não é fixa: vem do capabilities do workspace a cada
     abertura. Hoje o SICAR só publica os imóveis por serviço; APP, reserva
     legal e os demais saem apenas pelo download oficial com captcha — se um
     dia entrarem no serviço, o painel os liga sozinho, sem mexer em código. */
  const CAR_TEMAS=[
    {pref:'sicar_imoveis',               rot:'Área do imóvel',          cor:'#e0a11e'},
    {pref:'sicar_app',                   rot:'APP',                     cor:'#1b7a3d'},
    {pref:'sicar_reserva_legal',         rot:'Reserva legal',           cor:'#2e9b32'},
    {pref:'sicar_servidao_administrativa',rot:'Servidão administrativa',cor:'#8a4fd4'},
    {pref:'sicar_vegetacao_nativa',      rot:'Vegetação nativa',        cor:'#4f8b3a'},
    {pref:'sicar_uso_restrito',          rot:'Uso restrito',            cor:'#b8860b'},
    {pref:'sicar_area_consolidada',      rot:'Área consolidada',        cor:'#c07a3a'},
    {pref:'sicar_pousio',                rot:'Área de pousio',          cor:'#9aa53a'},
    {pref:'sicar_hidrografia',           rot:'Hidrografia',             cor:'#1565c0'}
  ];
  let CAR_DISP=null;      // Set de prefixos publicados, lido do capabilities
  async function carDescobre(){
    if(CAR_DISP) return CAR_DISP;
    try{
      const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),15000);
      const r=await fetch(BASE+'?service=WFS&request=GetCapabilities&version=2.0.0',{signal:ctl.signal});
      clearTimeout(t);
      const tx=await r.text();
      const doc=new DOMParser().parseFromString(tx,'application/xml');
      const tipos=[...doc.getElementsByTagName('*')].filter(n=>n.localName==='FeatureType');
      const texto=(n,tag)=>{const e=[...n.children].find(c=>c.localName===tag);return e?e.textContent.trim():'';};
      CAR_DISP=new Set(tipos.map(n=>texto(n,'Name').replace(/^sicar:/,'').replace(/_[a-z]{2}$/,'')));
    }catch(e){ CAR_DISP=new Set(['sicar_imoveis']); }   // sem rede: o que se sabe que existe
    return CAR_DISP;
  }
  async function carMontaTemas(){
    const box=$('carTemas'), nota=$('carTemasNota'); if(!box) return;
    await carDescobre();
    const disp=CAR_TEMAS.filter(t=>CAR_DISP.has(t.pref));
    const indisp=CAR_TEMAS.filter(t=>!CAR_DISP.has(t.pref));
    box.innerHTML=
      disp.map(t=>`<label class="snap-opt" style="font-size:11.5px"><input type="checkbox" value="${t.pref}"${t.pref==='sicar_imoveis'?' checked':''}><span>${t.rot}</span></label>`).join('')+
      indisp.map(t=>`<label class="snap-opt" style="font-size:11.5px;opacity:.55" title="O SICAR não publica este tema por serviço — confirmado no catálogo do servidor. Baixe no site oficial e arraste a pasta."><input type="checkbox" disabled><span>${t.rot} <a href="https://consultapublica.car.gov.br" target="_blank" rel="noopener" style="font-size:9.5px;color:var(--cyan)">site&nbsp;oficial ↗</a></span></label>`).join('');
    if(nota) nota.innerHTML=indisp.length
      ? `<b>Limitação do SICAR, não do CCMGIS:</b> o serviço público do governo publica apenas a Área do Imóvel `+
        `(verificado no catálogo do servidor a cada abertura). Os demais temas saem só pelo `+
        `<a href="https://consultapublica.car.gov.br" target="_blank" rel="noopener">download oficial por UF</a>, com captcha — `+
        `baixe lá e <b>arraste a pasta para cá</b>. Se o órgão os publicar no serviço, eles acendem aqui sozinhos.`
      : 'Todos os temas publicados pelo serviço estão disponíveis.';
  }

  function caixa(){
    const v=($('carArea')||{}).value||'vista';
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
  function infoArea(){
    const el=$('carInfo'); if(!el) return;
    const c=caixa(); if(!c){ el.textContent='Camada sem geometria.'; return; }
    const km=111.32, a=Math.abs((c.n-c.s)*km)*Math.abs((c.e-c.w)*km*Math.cos((c.n+c.s)/2*Math.PI/180));
    el.textContent=`${c.de} · ${a.toLocaleString('pt-BR',{maximumFractionDigits:1})} km²`;
  }
  function preencheArea(){
    const sel=$('carArea'); if(!sel) return;
    const atual=sel.value, polis=(S.layers||[]).filter(l=>l.gtype==='polygon');
    sel.innerHTML='<option value="vista">Extensão da tela</option>'+
      polis.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('');
    if([...sel.options].some(o=>o.value===atual)) sel.value=atual;
    infoArea();
  }
  /* UF sugerida pelo centro da tela, via toWGS — sem chute: só pré-seleciona */
  function chuteUF(){
    try{ const c=map.getCenter();
      // faixas grosseiras só para PRÉ-seleção; o usuário confirma no seletor
      const lat=c.lat, lon=c.lng;
      if(lat<-11&&lat>-19&&lon<-38&&lon>-46.7) return 'BA';
      if(lat<0&&lat>-10&&lon<-46&&lon>-59) return 'PA';
      if(lat<-19&&lat>-25&&lon<-40&&lon>-51) return 'MG';
    }catch(e){}
    return '';
  }
  /* SEM teto por tema: o download é PAGINADO — lotes de 5.000 até o servidor
     esgotar o que há na área. A única trava é uma válvula de segurança bem
     acima de qualquer área de trabalho, para um engano de área (um estado
     inteiro) não derrubar o navegador — e ela avisa quando age. */
  /* COMPLETO OU NADA. A primeira página traz o TOTAL que existe na área
     (totalFeatures); o download só é dado por bom quando a soma bate com
     esse total. Qualquer divergência — deriva de ordenação entre páginas,
     truncamento, área grande demais — vira ERRO declarado, e nada parcial
     entra no projeto disfarçado de camada completa. */
  const CAR_PAG=5000, CAR_TRAVA=100000;
  async function baixaTema(pref,uf,c,progresso){
    const vistos=new Set(), feats=[]; let ini=0, total=null;
    for(;;){
      const u=BASE+'?service=WFS&version=2.0.0&request=GetFeature'+
        '&typeNames='+encodeURIComponent('sicar:'+pref+'_'+uf.toLowerCase())+
        '&count='+CAR_PAG+'&startIndex='+ini+
        '&outputFormat=application/json&srsName=EPSG:4326'+
        `&bbox=${c.w},${c.s},${c.e},${c.n},urn:ogc:def:crs:OGC:1.3:CRS84`;
      const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),120000);
      let gj;
      try{
        const r=await fetch(u,{signal:ctl.signal});
        const tx=await r.text();
        if(r.status!==200) throw new Error('HTTP '+r.status+' — '+tx.replace(/<[^>]+>/g,' ').trim().slice(0,110));
        gj=JSON.parse(tx);
      }finally{ clearTimeout(t); }
      if(total==null){
        const tf=+gj.totalFeatures || +gj.numberMatched;
        if(isFinite(tf)&&tf>0) total=tf;
        if(total!=null && total>CAR_TRAVA)
          throw new Error(`a área tem ${total.toLocaleString('pt-BR')} feições — acima do que o navegador aguenta de uma vez. Reduza a área; NADA foi importado.`);
      }
      const lote=(gj.features||[]);
      /* dedup por id: se duas páginas trouxerem a mesma feição (deriva de
         ordenação), a repetida cai — e a checagem do total acusa o buraco. */
      lote.forEach(ft=>{ const id=ft.id!=null?String(ft.id):null;
        if(id){ if(vistos.has(id)) return; vistos.add(id); }
        feats.push(ft); });
      if(progresso&&feats.length) progresso(feats.length,total);
      if(total!=null && feats.length>=total) break;
      if(lote.length<CAR_PAG) break;
      if(feats.length>=CAR_TRAVA)
        throw new Error('passou da trava de 100 mil sem o servidor informar o total. Reduza a área; NADA foi importado.');
      ini+=CAR_PAG;
    }
    if(total!=null && feats.length<total)
      throw new Error(`veio incompleto: ${feats.length.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} feições. Nada foi importado — tente de novo ou reduza a área.`);
    return {type:'FeatureCollection',features:feats,_total:total};
  }
  async function baixar(){
    const uf=($('carUF')||{}).value;
    if(!uf){ toast('Escolha a UF'); return; }
    const c=caixa(); if(!c){ toast('Área inválida'); return; }
    const temas=[...document.querySelectorAll('#carTemas input:checked')]
      .map(x=>CAR_TEMAS.find(t=>t.pref===x.value)).filter(Boolean);
    if(!temas.length){ toast('Marque ao menos um tema'); return; }
    const vRec=($('carArea')||{}).value;
    const polyRec=(vRec&&vRec!=='vista'&&($('carClip')||{}).checked)
      ? (S.layers||[]).find(l=>String(l.id)===String(vRec)) : null;
    const out=$('carOut'); const linhas=[]; let total=0;
    for(let i=0;i<temas.length;i++){
      const t=temas[i];
      showLoad(`CAR · ${t.rot} (${i+1}/${temas.length}) — ${uf}…`);
      if(out) out.innerHTML=`Baixando <b>${t.rot}</b> (${i+1} de ${temas.length})…`;
      let gj=null;
      try{ gj=await baixaTema(t.pref,uf,c,(q,tot)=>{
        showLoad(`CAR · ${t.rot} — ${q.toLocaleString('pt-BR')}${tot?' de '+tot.toLocaleString('pt-BR'):''} feições…`); }); }
      catch(err){
        const msg=(err&&err.name==='AbortError')?'sem resposta em 2 min':(err.message||String(err));
        linhas.push(`· ${t.rot}: falhou — ${esc(msg)}`); continue;
      }
      const n=(gj.features||[]).length;
      if(!n){ linhas.push(`· ${t.rot}: nada na área`); continue; }
      importGeoJSON(gj,'CAR — '+t.rot+' ('+uf+')');
      const L=(S.layers||[])[0];
      try{
        if(L&&L.sym){
          if(t.pref==='sicar_imoveis'){
            /* imóveis: contorno por STATUS, como no visualizador público */
            L.sym.mode='cat'; L.sym.field='status_imovel'; L.sym.fill=0.08;
            const usados=[...new Set(L.features.map(f=>String(f.props.status_imovel||'')))];
            L.sym.cats=usados.map(v=>({value:v,color:(STATUS[v]||['', '#e0a11e'])[1],
              count:L.features.filter(f=>String(f.props.status_imovel||'')===v).length}));
          }else{
            L.sym.color=t.cor; L.sym.stroke=t.cor; L.sym.fill=0.25; L.color=t.cor;
          }
          drawLayer(L);
        }
      }catch(e){ console.warn('estilo CAR',e); }
      let rec=0;
      if(polyRec){ try{ rec=window.alagisRecortaPorPoligono(L,polyRec); }catch(e){} }
      total+=L.features.length;
      linhas.push(`· ${t.rot}: ${L.features.length.toLocaleString('pt-BR')} feições`+
        (gj._total?` <span style="color:var(--ok,#2e9b32)">— completo (${gj._total.toLocaleString('pt-BR')} na caixa do servidor)</span>`:'')+
        (rec?`<br>&nbsp;&nbsp;↳ ${rec.toLocaleString('pt-BR')} fora da poligonal descartadas`:''));
      await new Promise(r=>setTimeout(r,250));
    }
    hideLoad();
    if(out) out.innerHTML=linhas.join('<br>')+
      `<br><br><b>${total.toLocaleString('pt-BR')} feições</b> importadas.`+
      '<br><span style="font-size:10.5px">Fonte: SICAR / Serviço Florestal Brasileiro. O CAR é declaratório — não é comprovação de posse ou propriedade.</span>';
    try{ refreshUI(); }catch(e){}
    toast(total? 'CAR: '+total.toLocaleString('pt-BR')+' feições importadas' : 'CAR: nada na área');
    try{ cmdLog('CAR '+uf+': '+linhas.join(' | ').replace(/<[^>]+>/g,''),'ok'); }catch(e){}
  }
  function abrePainel(btn){
    const sec=$('secCAR');
    if(!sec){ toast('Painel do CAR não encontrado'); return; }
    const su=$('carUF');
    if(su&&!su.options.length){
      su.innerHTML='<option value="">— UF —</option>'+UFS.map(u=>`<option>${u}</option>`).join('');
      const g=chuteUF(); if(g) su.value=g;
    }
    preencheArea();
    carMontaTemas();
    /* pedido do projeto: a área padrão é SEMPRE a tela; a poligonal é escolha */
    const sa=$('carArea'); if(sa && !sa.value) sa.value='vista';
    if(typeof ribbonOpen==='function') ribbonOpen(sec,btn,'CAR — Cadastro Ambiental Rural');
    /* o commandUseActive do ribbonOpen pré-seleciona a camada ativa em
       qualquer <select>; aqui a área padrão é SEMPRE a tela (pedido do
       projeto) — a poligonal fica a um clique. */
    setTimeout(()=>{ const sa=document.getElementById('carArea');
      if(sa){ sa.value='vista'; sa.dispatchEvent(new Event('change')); } },0);
  }
  function liga(){
    try{
      if(typeof RIB_SVG==='object') RIB_SVG.car=
        '<svg viewBox="0 0 32 32" fill="none"><title>CAR — Cadastro Ambiental Rural</title>'+
        '<defs><linearGradient id="al3_car_g" x1="0" y1="0" x2="1" y2="1">'+
        '<stop offset="0" stop-color="#FFE08A"/><stop offset="1" stop-color="#E08A1E"/></linearGradient></defs>'+
        '<path d="M5 12l6-3 6 2 5-2 5 3v9l-6 3-5-2-6 2-5-3z" fill="url(#al3_car_g)" stroke="#173B57" stroke-width="1.4" stroke-linejoin="round"/>'+
        '<path d="M11 9v13M17 11v13M22 9v12" stroke="#173B57" stroke-width="0.9" opacity="0.6"/>'+
        '<path d="M16 24.5v5M11.5 29.5h9" stroke="#173B57" stroke-width="1.6" stroke-linecap="round"/></svg>';
    }catch(e){}
    try{
      const cat=(typeof CATS!=='undefined')&&CATS.find(c=>c.id==='gis');
      if(cat) for(const g of cat.grupos||[]) for(const cmd of g.it||[])
        if(cmd.ic==='car'){ cmd.visual=0; cmd.soon=0; cmd.act=abrePainel; }
      if(typeof ribbonBuild==='function') ribbonBuild();
    }catch(e){ console.warn('CAR: ligação da ribbon',e); }
    const lig=(id,ev,fn)=>{ const e=$(id); if(e&&!e['_l'+ev]){ e['_l'+ev]=1; e.addEventListener(ev,fn); } };
    lig('carBaixar','click',()=>baixar().catch(err=>{ try{hideLoad();}catch(_){}
      toast('CAR falhou: '+(err&&err.message||err)); }));
    lig('carArea','change',infoArea);
    lig('carArea','mousedown',preencheArea);
    lig('carArea','focus',preencheArea);
    try{ if(typeof map!=='undefined'&&map&&map.on) map.on('moveend zoomend',infoArea); }catch(e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(liga,0));
  else setTimeout(liga,0);
  window.carAbrePainel=abrePainel;
  window.carBaixaArea=baixar;
})();
