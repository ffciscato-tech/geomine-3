
/* ============================================================================
   VETORES DO SGB / CPRM — download por WFS, recortado pela tela
   O catálogo NÃO é fixo no código: vem do GetCapabilities do próprio servidor.
   Assim a lista acompanha o que o SGB publica, sem depender de nomes chutados
   aqui dentro que quebram na primeira reorganização do GeoServer.
   ========================================================================== */
(function sgbWFS(){
  const $=id=>document.getElementById(id);
  let CATALOGO=[];                 // [{nome,titulo,resumo}]
  const TEMPO=90000;

  function url(base,params){
    const u=new URL(base);
    Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));
    return u.toString();
  }
  async function pega(u,comoTexto){
    const ctl=new AbortController(), t=setTimeout(()=>ctl.abort(),TEMPO);
    try{
      const r=await fetch(u,{signal:ctl.signal});
      if(!r.ok) throw new Error('HTTP '+r.status);
      return comoTexto? await r.text() : await r.json();
    }finally{ clearTimeout(t); }
  }

  /* ---- catálogo: GetCapabilities do WFS ---- */
  async function listar(){
    const base=($('sgbServidor')||{}).value;
    const out=$('sgbOut');
    if(out) out.textContent='Consultando o catálogo do servidor…';
    showLoad('Lendo o catálogo WFS…');
    let xml=null, erro=null;
    /* 2.0.0 primeiro; servidores antigos ainda só falam 1.1.0. */
    for(const ver of ['2.0.0','1.1.0']){
      try{ xml=await pega(url(base,{service:'WFS',request:'GetCapabilities',version:ver}),true); break; }
      catch(e){ erro=e; }
    }
    hideLoad();
    if(!xml){
      if(out) out.innerHTML='<b style="color:var(--sel)">Não foi possível ler o catálogo.</b><br>'+
        (erro&&erro.message||'')+'<br><span style="font-size:10.5px">Se a mensagem citar CORS, o servidor não autoriza leitura direta pelo navegador — nesse caso só o WMS (imagem) funciona.</span>';
      return;
    }
    const doc=new DOMParser().parseFromString(xml,'application/xml');
    if(doc.querySelector('parsererror')){ if(out)out.textContent='Resposta do servidor não é um XML válido.'; return; }
    const tipos=[...doc.getElementsByTagName('*')].filter(n=>n.localName==='FeatureType');
    const texto=(n,tag)=>{ const e=[...n.children].find(c=>c.localName===tag); return e? e.textContent.trim():''; };
    CATALOGO=tipos.map(n=>({nome:texto(n,'Name'),titulo:texto(n,'Title')||texto(n,'Name'),
                            resumo:texto(n,'Abstract')})).filter(t=>t.nome);
    desenhaLista();
    if(out) out.innerHTML=`<b>${CATALOGO.length}</b> camadas publicadas neste servidor. Filtre, marque e baixe.`;
    toast(`${CATALOGO.length} camadas no catálogo do servidor`);
  }
  function desenhaLista(){
    const box=$('sgbLista'); if(!box) return;
    const q=String(($('sgbBusca')||{}).value||'').trim().toLowerCase();
    const vis=CATALOGO.filter(t=>!q ||
      (t.titulo+' '+t.nome+' '+t.resumo).toLowerCase().includes(q));
    if(!vis.length){ box.innerHTML='<div class="hint" style="padding:6px">Nada encontrado.</div>'; return; }
    const marcadas=new Set([...box.querySelectorAll('input:checked')].map(c=>c.value));
    box.innerHTML=vis.slice(0,400).map(t=>
      `<label class="snap-opt" style="display:flex;gap:6px;align-items:flex-start;font-size:11.5px;padding:2px 3px">
         <input type="checkbox" value="${esc(t.nome)}"${marcadas.has(t.nome)?' checked':''}>
         <span><b>${esc(t.titulo)}</b><br><span style="color:var(--ink-dim);font-size:10px">${esc(t.nome)}</span></span>
       </label>`).join('')+
      (vis.length>400?`<div class="hint" style="padding:4px">Mostrando 400 de ${vis.length} — refine o filtro.</div>`:'');
  }

  /* ---- área: a tela ou uma camada de polígono ---- */
  function caixa(){
    const v=($('sgbArea')||{}).value||'vista';
    if(v==='vista'){
      const b=map.getBounds();
      return {w:b.getWest(),s:b.getSouth(),e:b.getEast(),n:b.getNorth(),de:'extensão da tela'};
    }
    const L=(S.layers||[]).find(l=>String(l.id)===String(v));
    if(!L) return null;
    let s0=Infinity,w0=Infinity,n0=-Infinity,e0=-Infinity;
    (L.features||[]).forEach(f=>{ let lls; try{ lls=featToLatLngs(L,f); }catch(err){ return; }
      (function achata(a){ if(!a) return;
        if(typeof a[0]==='number'){ s0=Math.min(s0,a[0]); n0=Math.max(n0,a[0]);
                                    w0=Math.min(w0,a[1]); e0=Math.max(e0,a[1]); return; }
        a.forEach(achata); })(lls); });
    if(!isFinite(s0)) return null;
    return {w:w0,s:s0,e:e0,n:n0,de:'camada “'+L.name+'”'};
  }
  function infoArea(){
    const c=caixa(), el=$('sgbAreaInfo'); if(!el) return;
    el.textContent=c? `${c.de} · ${c.w.toFixed(4)}, ${c.s.toFixed(4)} → ${c.e.toFixed(4)}, ${c.n.toFixed(4)}`
                    : 'Camada sem geometria.';
  }
  function preencheArea(){
    const sel=$('sgbArea'); if(!sel) return;
    const atual=sel.value, polis=(S.layers||[]).filter(l=>l.gtype==='polygon');
    sel.innerHTML='<option value="vista">Extensão da tela</option>'+
      polis.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('');
    if([...sel.options].some(o=>o.value===atual)) sel.value=atual;
    infoArea();
  }

  /* ---- download ----
     A ordem dos eixos em EPSG:4326 é a armadilha clássica do WFS: a norma diz
     lat,lon e boa parte dos servidores entrega lon,lat. CRS:84 não tem essa
     ambiguidade — é sempre lon,lat — por isso é o pedido na caixa. */
  /* Mesma divisão usada no OSM: área grande vira grade de consultas. Aqui o
     limite que pesa é o número de feições — bater no teto significa resultado
     truncado, e truncado sem avisar é pior que demorado. */
  const SGB_QUAD_KM2=2500;   // sem teto: a grade cresce com a área
  function sgbAreaKm2(c){
    const km=111.32;
    return Math.abs((c.n-c.s)*km)*Math.abs((c.e-c.w)*km*Math.cos((c.n+c.s)/2*Math.PI/180));
  }
  function sgbQuadriculas(c){
    const a=sgbAreaKm2(c);
    if(a<=SGB_QUAD_KM2) return [c];
    const n=Math.max(1,Math.ceil(Math.sqrt(a/SGB_QUAD_KM2)));
    const dw=(c.e-c.w)/n, dh=(c.n-c.s)/n, out=[];
    for(let j=0;j<n;j++) for(let i=0;i<n;i++)
      out.push({w:c.w+i*dw,e:c.w+(i+1)*dw,s:c.s+j*dh,n:c.s+(j+1)*dh});
    return out;
  }
  /* Baixa um tipo em quadrículas e junta, descartando a feição repetida que
     chega por tocar mais de uma célula. */
  async function baixaTipoQuad(base,tipo,c,aviso){
    const quads=sgbQuadriculas(c);
    if(quads.length===1) return await baixaTipo(base,tipo,c,
      q=>{ if(aviso) aviso(1,1,q); });
    const vistos=new Set(), feats=[];
    for(let i=0;i<quads.length;i++){
      if(aviso) aviso(i+1,quads.length);
      const gj=await baixaTipo(base,tipo,quads[i],
        q=>{ if(aviso) aviso(i+1,quads.length,q); });
      (gj.features||[]).forEach(ft=>{
        const ch=String(ft.id||'')||JSON.stringify(ft.geometry&&ft.geometry.coordinates&&ft.geometry.coordinates[0]||'').slice(0,80);
        if(vistos.has(ch)) return; vistos.add(ch); feats.push(ft);
      });
      await new Promise(r=>setTimeout(r,200));
    }
    return {type:'FeatureCollection',features:feats,_quads:quads.length};
  }
  /* SEM teto por camada: lotes de 5.000 até o servidor esgotar a área, com
     válvula de segurança bem acima de qualquer trabalho normal. As três
     tentativas de formato continuam valendo para o PRIMEIRO lote; achado o
     formato que o servidor fala, os lotes seguintes usam o mesmo. */
  const SGB_PAG=5000, SGB_TRAVA=100000;
  async function baixaTipo(base,tipo,c,progresso){
    const comum={service:'WFS',request:'GetFeature',srsName:'EPSG:4326',
                 bbox:`${c.w},${c.s},${c.e},${c.n},urn:ogc:def:crs:OGC:1.3:CRS84`};
    const tentativas=[
      {version:'2.0.0',typeNames:tipo,outputFormat:'application/json'},
      {version:'2.0.0',typeNames:tipo,outputFormat:'json'},
      {version:'1.1.0',typeName:tipo,outputFormat:'application/json'}
    ];
    let modo=null, erro=null;
    for(const t of tentativas){
      try{
        const p=Object.assign({},comum,t);
        if(t.version==='2.0.0'){ p.count=SGB_PAG; p.startIndex=0; } else p.maxFeatures=SGB_TRAVA;
        const gj=await pega(url(base,p),false);
        if(gj && (gj.features||gj.type)){ modo=t; var primeiro=gj; break; }
      }catch(e){ erro=e; }
    }
    if(!modo) throw erro||new Error('servidor não devolveu GeoJSON');
    /* COMPLETO OU NADA: o total da primeira página é a régua da entrega. */
    const total=(v=>isFinite(v)&&v>0?v:null)(+primeiro.totalFeatures||+primeiro.numberMatched);
    if(total!=null && total>SGB_TRAVA)
      throw new Error(`a área tem ${total.toLocaleString('pt-BR')} feições — reduza a área; NADA foi importado.`);
    const vistos=new Set(), feats=[];
    const junta=lote=>lote.forEach(ft=>{ const id=ft.id!=null?String(ft.id):null;
      if(id){ if(vistos.has(id)) return; vistos.add(id); }
      feats.push(ft); });
    junta(primeiro.features||[]);
    if(progresso&&feats.length) progresso(feats.length,total);
    if(modo.version==='2.0.0'){
      let ini=SGB_PAG;
      while((primeiro.features||[]).length===SGB_PAG && (total==null||feats.length<total)){
        const p=Object.assign({},comum,modo,{count:SGB_PAG,startIndex:ini});
        const gj=await pega(url(base,p),false);
        const lote=(gj.features||[]);
        junta(lote);
        if(progresso&&feats.length) progresso(feats.length,total);
        if(lote.length<SGB_PAG) break;
        if(feats.length>=SGB_TRAVA && total==null)
          throw new Error('passou da trava de 100 mil sem total informado. Reduza a área; NADA foi importado.');
        ini+=SGB_PAG;
      }
    }
    if(total!=null && feats.length<total)
      throw new Error(`veio incompleto: ${feats.length} de ${total}. Nada foi importado — tente de novo.`);
    return {type:'FeatureCollection',features:feats,_total:total};
  }
  async function baixar(){
    const base=($('sgbServidor')||{}).value;
    const tipos=[...document.querySelectorAll('#sgbLista input:checked')].map(c=>c.value);
    if(!tipos.length){ toast('Marque ao menos uma camada da lista'); return; }
    const c=caixa(); if(!c){ toast('Área inválida'); return; }
    const vRec=($('sgbArea')||{}).value;
    const polyRec=(vRec&&vRec!=='vista'&&($('sgbClip')||{}).checked)
      ? (S.layers||[]).find(l=>String(l.id)===String(vRec)) : null;
    const out=$('sgbOut'), linhas=[]; let total=0;
    for(let i=0;i<tipos.length;i++){
      const tipo=tipos[i];
      const meta=CATALOGO.find(t=>t.nome===tipo)||{titulo:tipo};
      showLoad(`SGB: ${meta.titulo} (${i+1}/${tipos.length})…`);
      if(out) out.innerHTML=`Baixando <b>${esc(meta.titulo)}</b> (${i+1} de ${tipos.length})…`;
      try{
        const gj=await baixaTipoQuad(base,tipo,c,(i2,n2,q)=>{
          showLoad(`SGB: ${meta.titulo} · quadrícula ${i2}/${n2}${q?` · ${q.toLocaleString('pt-BR')} feições`:''}…`);
          if(out) out.innerHTML=`Baixando <b>${esc(meta.titulo)}</b> · quadrícula ${i2} de ${n2}…`; });
        const n=(gj.features||[]).length;
        if(!n){ linhas.push(`· ${meta.titulo}: nada na área`); continue; }
        importGeoJSON(gj, meta.titulo);
        try{ if(typeof sgbAplicaPadrao==='function') sgbAplicaPadrao(S.layers[0]); }catch(e){}
        if(polyRec){ try{ window.alagisRecortaPorPoligono(S.layers[0],polyRec); }catch(e){} }
        total+=(S.layers[0]&&S.layers[0].features.length)||n;
        linhas.push(`· ${meta.titulo}: ${n.toLocaleString('pt-BR')} feições`+
          (gj._trava? ' <b style="color:var(--sel)">(trava de segurança de 100 mil — reduza a área)</b>':''));
      }catch(err){ linhas.push(`· ${meta.titulo}: falhou — ${err.message||err}`); }
      await new Promise(r=>setTimeout(r,250));
    }
    hideLoad();
    if(out) out.innerHTML=linhas.join('<br>')+`<br><br><b>${total.toLocaleString('pt-BR')} feições</b> importadas.`+
      '<br><span style="font-size:10.5px">Fonte: Serviço Geológico do Brasil (SGB/CPRM). Citar a fonte e a data do acesso nas pranchas.</span>';
    try{ refreshUI(); }catch(e){}
    toast(total? `SGB: ${total.toLocaleString('pt-BR')} feições importadas` : 'SGB: nada encontrado na área');
    try{ cmdLog('SGB WFS: '+linhas.join(' | ').replace(/<[^>]+>/g,''),'ok'); }catch(e){}
  }

  /* ---- modo automático, no espírito do comando da ANM ----
     Um clique e o que interessa da área entra. A litoestratigrafia é buscada
     da escala MAIS DETALHADA para a menos: o mapeamento fino do SGB só existe
     em parte do país, então a primeira escala que devolver feições é a melhor
     disponível ali — pedir 1:1.000.000 direto jogaria fora o 1:50.000 quando
     ele existe, e pedir todas encheria o projeto de camadas repetidas. */
  const LITO_ESCALAS=['geosgb:litoestratigrafia_25k','geosgb:litoestratigrafia_50k',
    'geosgb:litoestratigrafia_100k','geosgb:litoestratigrafia_150k',
    'geosgb:litoestratigrafia_250k','geosgb:litoestratigrafia_1m'];
  const COMPLEMENTOS=['geosgb:ocorrencias_recursos_minerais','geosgb:afloramentos',
    'geosgb:petrografia','geosgb:geocronologia','hidrogeologia:siagas'];
  async function automatico(){
    const base=($('sgbServidor')||{}).value;
    const out=$('sgbOut');
    const c=caixa(); if(!c){ toast('Área inválida'); return; }
    const vRec=($('sgbArea')||{}).value;
    const polyRec=(vRec&&vRec!=='vista'&&($('sgbClip')||{}).checked)
      ? (S.layers||[]).find(l=>String(l.id)===String(vRec)) : null;
    if(!CATALOGO.length){
      if(out) out.textContent='Lendo o catálogo do servidor…';
      try{ await listar(); }catch(e){}
      if(!CATALOGO.length){ toast('Não consegui ler o catálogo do servidor'); return; }
    }
    const tem=n=>CATALOGO.some(t=>t.nome===n);
    const rotulo=n=>(CATALOGO.find(t=>t.nome===n)||{}).titulo||n;
    const linhas=[]; let total=0;
    /* 1) litoestratigrafia: para na primeira escala com dado na área */
    let achouLito=false;
    for(const tipo of LITO_ESCALAS.filter(tem)){
      showLoad('SGB · procurando geologia em '+rotulo(tipo).replace(/^.*Escala /,'')+'…');
      if(out) out.innerHTML=`Procurando geologia em <b>${esc(rotulo(tipo))}</b>…`;
      try{
        const gj=await baixaTipoQuad(base,tipo,c,(i2,n2,q)=>{
          showLoad(`SGB · ${rotulo(tipo)} · quadrícula ${i2}/${n2}${q?` · ${q.toLocaleString('pt-BR')}`:''}…`); });
        const n=(gj.features||[]).length;
        if(!n){ linhas.push(`· ${rotulo(tipo)}: sem cobertura aqui`); continue; }
        importGeoJSON(gj,rotulo(tipo));
        /* carta no padrão do SGB: cor cronoestratigráfica por sigla */
        try{ if(typeof sgbAplicaPadrao==='function') sgbAplicaPadrao(S.layers[0]); }catch(e){}
        if(polyRec){ try{ window.alagisRecortaPorPoligono(S.layers[0],polyRec); }catch(e){} }
        total+=(S.layers[0]&&S.layers[0].features.length)||n; achouLito=true;
        linhas.push(`<b>· ${rotulo(tipo)}: ${n.toLocaleString('pt-BR')} feições</b>`);
        break;                       // a mais detalhada já entrou
      }catch(err){ linhas.push(`· ${rotulo(tipo)}: falhou — ${err.message||err}`); }
    }
    if(!achouLito) linhas.push('· nenhuma escala de litoestratigrafia cobre esta área');
    /* 2) complementos: entram só quando há algo na área */
    for(const tipo of COMPLEMENTOS.filter(tem)){
      showLoad('SGB · '+rotulo(tipo)+'…');
      if(out) out.innerHTML=linhas.join('<br>')+`<br>Consultando <b>${esc(rotulo(tipo))}</b>…`;
      try{
        const gj=await baixaTipoQuad(base,tipo,c,(i2,n2,q)=>{
          showLoad(`SGB · ${rotulo(tipo)} · quadrícula ${i2}/${n2}${q?` · ${q.toLocaleString('pt-BR')}`:''}…`); });
        const n=(gj.features||[]).length;
        if(!n) continue;                       // silêncio quando não há nada
        importGeoJSON(gj,rotulo(tipo));
        try{ if(typeof sgbAplicaPadrao==='function') sgbAplicaPadrao(S.layers[0]); }catch(e){}
        if(polyRec){ try{ window.alagisRecortaPorPoligono(S.layers[0],polyRec); }catch(e){} }
        total+=(S.layers[0]&&S.layers[0].features.length)||n;
        linhas.push(`· ${rotulo(tipo)}: ${((S.layers[0]&&S.layers[0].features.length)||n).toLocaleString('pt-BR')} feições`);
      }catch(err){ linhas.push(`· ${rotulo(tipo)}: falhou — ${err.message||err}`); }
      await new Promise(r=>setTimeout(r,200));
    }
    hideLoad();
    if(out) out.innerHTML=linhas.join('<br>')+
      `<br><br><b>${total.toLocaleString('pt-BR')} feições</b> importadas de ${c.de}.`+
      '<br><span style="font-size:10.5px">Fonte: Serviço Geológico do Brasil (SGB/CPRM). Citar a fonte e a data do acesso nas pranchas.</span>';
    try{ refreshUI(); }catch(e){}
    toast(total? `SGB: ${total.toLocaleString('pt-BR')} feições da área importadas`
               : 'SGB: nada publicado nesta área');
    try{ cmdLog('SGB automático: '+linhas.join(' | ').replace(/<[^>]+>/g,''),'ok'); }catch(e){}
  }
  function abrePainel(btn){
    const sec=$('secSGB');
    if(!sec){ toast('Painel do SGB não encontrado'); return; }
    preencheArea();
    if(typeof ribbonOpen==='function') ribbonOpen(sec,btn,'Vetores do SGB / CPRM');
    /* o commandUseActive do ribbonOpen pré-seleciona a camada ativa em
       qualquer <select>; aqui a área padrão é SEMPRE a tela (pedido do
       projeto) — a poligonal fica a um clique. */
    setTimeout(()=>{ const sa=document.getElementById('sgbArea');
      if(sa){ sa.value='vista'; sa.dispatchEvent(new Event('change')); } },0);
  }
  function liga(){
    try{
      if(typeof RIB_SVG==='object') RIB_SVG.sgb=
        '<svg viewBox="0 0 32 32" fill="none"><title>Vetores do SGB</title>'+
        '<defs><linearGradient id="al3_sgb_g" x1="0" y1="0" x2="1" y2="1">'+
        '<stop offset="0" stop-color="#FFD27A"/><stop offset="1" stop-color="#B4530A"/></linearGradient>'+
        '<linearGradient id="al3_sgb_b" x1="0" y1="0" x2="1" y2="1">'+
        '<stop offset="0" stop-color="#8FD3FF"/><stop offset="1" stop-color="#1565C0"/></linearGradient></defs>'+
        '<path d="M4 21l7-13 6 9 4-5 7 9z" fill="url(#al3_sgb_g)" stroke="#173B57" stroke-width="1.4" stroke-linejoin="round"/>'+
        '<path d="M4 21h24" stroke="#173B57" stroke-width="1.4"/>'+
        '<path d="M7 16.5c4 1.6 8-1.6 12 0s5 .6 6 0" stroke="url(#al3_sgb_b)" stroke-width="1.5"/>'+
        '<path d="M16 24.5v5M11 29.5h10" stroke="#173B57" stroke-width="1.6" stroke-linecap="round"/></svg>';
    }catch(e){}
    try{
      const cat=(typeof CATS!=='undefined')&&CATS.find(c=>c.id==='gis');
      if(cat) for(const g of cat.grupos||[]) for(const cmd of g.it||[])
        if(cmd.ic==='sgb'){ cmd.visual=0; cmd.soon=0; cmd.act=abrePainel; }
      if(typeof ribbonBuild==='function') ribbonBuild();
    }catch(e){ console.warn('SGB: ligação da ribbon',e); }
    const lig=(id,ev,fn)=>{ const e=$(id); if(e&&!e['_lig'+ev]){ e['_lig'+ev]=1; e.addEventListener(ev,fn); } };
    lig('sgbAuto','click',()=>automatico().catch(err=>{ try{hideLoad();}catch(_){}
      toast('SGB falhou: '+(err&&err.message||err)); }));
    lig('sgbListar','click',()=>listar().catch(err=>{ try{hideLoad();}catch(_){}
      toast('Catálogo falhou: '+(err&&err.message||err)); }));
    lig('sgbBaixar','click',()=>baixar().catch(err=>{ try{hideLoad();}catch(_){}
      toast('Download falhou: '+(err&&err.message||err)); }));
    lig('sgbBusca','input',desenhaLista);
    lig('sgbArea','change',infoArea);
    lig('sgbArea','mousedown',preencheArea);   // lista viva: polígono criado com o painel aberto
    lig('sgbArea','focus',preencheArea);
    lig('sgbLimpar','click',()=>document.querySelectorAll('#sgbLista input').forEach(c=>c.checked=false));
    lig('sgbServidor','change',()=>{ CATALOGO=[]; const b=$('sgbLista');
      if(b) b.innerHTML='<div class="hint" style="padding:6px">Liste as camadas deste servidor.</div>'; });
    try{ if(typeof map!=='undefined'&&map&&map.on) map.on('moveend zoomend',infoArea); }catch(e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(liga,0));
  else setTimeout(liga,0);
  window.sgbAbrePainel=abrePainel;
  window.sgbListaCatalogo=listar;
  window.sgbBaixaSelecionadas=baixar;
  window.sgbAutomatico=automatico;
  window.sgbCatalogo=()=>CATALOGO;
})();
