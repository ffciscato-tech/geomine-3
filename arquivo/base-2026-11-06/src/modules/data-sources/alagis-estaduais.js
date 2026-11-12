
/* ============================================================================
   ÓRGÃOS ESTADUAIS — dados por UF
   O vetor vem do CNUC/MMA (07/2026), que consolida as UCs de TODAS as esferas
   com esfera, uf, grupo, categoria e órgão gestor — é de lá que saem as UCs
   estaduais (ITERPA/IDEFLOR no PA) e municipais de qualquer estado, sem
   depender dos geosservidores estaduais, que bloqueiam o navegador (SEMAS,
   IDEFLOR e SIGLAB testados). Os portais de cada estado ficam como links.
   ========================================================================== */
(function orgEstaduais(){
  const $=id=>document.getElementById(id);
  const BASE='https://geoservicos.inde.gov.br/geoserver/ows';
  const CAMADA='MMA:cnuc_26_07_31';
  const UFS=['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA',
             'PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
  const TEMAS=[
    {esfera:'Estadual',  rot:'UCs estaduais (CNUC/MMA)',  cor:'#1b7a3d', on:true},
    {esfera:'Municipal', rot:'UCs municipais (CNUC/MMA)', cor:'#7fc64e', on:false},
    {esfera:'Federal',   rot:'UCs federais (CNUC/MMA)',   cor:'#0d5c2a', on:false}
  ];
  const LINKS={
    PA:[['ITERPA — Unidades de Conservação','https://portal.iterpa.pa.gov.br/unidade-de-conservacao/'],
        ['FAPESPA — Radar (tabela de UCs 2020)','https://www.fapespa.pa.gov.br/sistemas/radar2021/tabelas/meio-ambiente/tab-4.6-unidades-de-conservacao-do-estado-do-para-2020.htm'],
        ['SEMAS-PA','https://www.semas.pa.gov.br/'],
        ['IDEFLOR-Bio','https://ideflorbio.pa.gov.br/']],
    BA:[['GeoBahia / INEMA','http://www.inema.ba.gov.br/'],
        ['SEIA Bahia','http://www.seia.ba.gov.br/']],
    MG:[['IDE-Sisema','https://idesisema.meioambiente.mg.gov.br/']]
  };
  function montaUF(){ const su=$('estUF'); if(!su||su.options.length) return;
    su.innerHTML=UFS.map(u=>`<option${u==='PA'?' selected':''}>${u}</option>`).join(''); }
  function montaTemas(){ const box=$('estTemas'); if(!box||box._pronto) return; box._pronto=1;
    box.innerHTML=TEMAS.map((t,i)=>
      `<label class="snap-opt" style="font-size:11.5px"><input type="checkbox" value="${i}"${t.on?' checked':''}><span>${t.rot}</span></label>`).join(''); }
  function montaLinks(){ const uf=($('estUF')||{}).value, el=$('estLinks'); if(!el) return;
    const ls=LINKS[uf]||[];
    el.innerHTML=ls.length
      ? ls.map(([r,u])=>`· <a href="${u}" target="_blank" rel="noopener">${esc(r)} ↗</a>`).join('<br>')+
        '<br><span style="font-size:10px">Dados desses portais: baixe lá e arraste a pasta para cá.</span>'
      : 'Nenhum portal cadastrado para esta UF — me diga os órgãos e eu incluo.'; }
  /* O firewall da INDE derruba cql_filter (aspas ativam a proteção contra
     SQL) sem cabeçalho CORS — o navegador vê só "Failed to fetch". O caminho
     que passa é o de sempre: BBOX da UF no servidor e o filtro de esfera/UF
     AQUI, nos atributos que o CNUC traz em cada feição. */
  const UF_BBOX={AC:[-74.1,-11.2,-66.6,-7.1],AL:[-38.3,-10.6,-35.1,-8.8],AM:[-73.9,-9.9,-56.1,2.3],
    AP:[-55.1,-1.3,-49.8,4.5],BA:[-46.7,-18.4,-37.3,-8.5],CE:[-41.5,-7.9,-37.2,-2.7],
    DF:[-48.3,-16.1,-47.3,-15.5],ES:[-41.9,-21.3,-38.6,-17.9],GO:[-53.3,-19.5,-45.9,-12.4],
    MA:[-48.9,-10.3,-41.8,-1.0],MG:[-51.1,-23.0,-39.8,-14.2],MS:[-58.2,-24.1,-50.9,-17.1],
    MT:[-61.7,-18.1,-50.2,-7.3],PA:[-59.9,-10.0,-45.9,2.9],PB:[-38.8,-8.3,-34.8,-6.0],
    PE:[-41.4,-9.5,-32.3,-7.2],PI:[-45.9,-11.0,-40.4,-2.7],PR:[-54.7,-26.8,-48.0,-22.5],
    RJ:[-44.9,-23.4,-40.9,-20.7],RN:[-38.6,-6.9,-34.9,-4.8],RO:[-66.9,-13.7,-59.7,-7.9],
    RR:[-64.9,-1.6,-58.8,5.3],RS:[-57.7,-33.8,-49.7,-27.0],SC:[-53.9,-29.4,-48.3,-25.9],
    SE:[-38.3,-11.6,-36.4,-9.5],SP:[-53.2,-25.4,-44.1,-19.7],TO:[-50.8,-13.5,-45.6,-5.1]};
  const EST_PAG=500;
  async function pega(u){
    const ctl=new AbortController(); const tt=setTimeout(()=>ctl.abort(),120000);
    try{ const r=await fetch(u,{signal:ctl.signal});
      const tx=await r.text();
      if(r.status!==200) throw new Error('HTTP '+r.status);
      return JSON.parse(tx);
    }finally{ clearTimeout(tt); } }
  async function baixaEsfera(t,uf,soVista,progresso){
    let bb;
    if(soVista){ const b=map.getBounds(); bb=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()]; }
    else bb=UF_BBOX[uf]||[-74,-34,-34,6];
    const base=BASE+'?service=WFS&version=2.0.0&request=GetFeature&typeNames='+encodeURIComponent(CAMADA)+
      '&outputFormat=application/json&srsName=EPSG:4326'+
      `&bbox=${bb[0]},${bb[1]},${bb[2]},${bb[3]},urn:ogc:def:crs:OGC:1.3:CRS84`;
    const vistos=new Set(), feats=[]; let ini=0, total=null;
    for(;;){
      const gj=await pega(base+`&count=${EST_PAG}&startIndex=${ini}`);
      if(total==null){ const tf=+gj.totalFeatures||+gj.numberMatched;
        if(isFinite(tf)&&tf>0) total=tf; }
      const lote=(gj.features||[]);
      lote.forEach(ft=>{ const id=ft.id!=null?String(ft.id):null;
        if(id){ if(vistos.has(id)) return; vistos.add(id); }
        feats.push(ft); });
      if(progresso) progresso(feats.length,total);
      if(total!=null && feats.length>=total) break;
      if(lote.length<EST_PAG) break;
      ini+=EST_PAG;
    }
    if(total!=null && feats.length<total)
      throw new Error(`veio incompleto: ${feats.length} de ${total}`);
    /* filtro no cliente: esfera exata e UF contida no campo (UC pode cruzar
       mais de um estado — o campo lista todos). */
    const alvo=feats.filter(ft=>{ const p=ft.properties||{};
      return String(p.esfera||'').toLowerCase()===t.esfera.toLowerCase()
          && String(p.uf||'').toUpperCase().includes(uf); });
    return {type:'FeatureCollection',features:alvo,_total:alvo.length,_caixa:feats.length};
  }
  async function baixar(){
    const uf=($('estUF')||{}).value; if(!uf){ toast('Escolha a UF'); return; }
    const soVista=(($('estArea')||{}).value==='vista');
    const marc=[...document.querySelectorAll('#estTemas input:checked')].map(x=>TEMAS[+x.value]).filter(Boolean);
    if(!marc.length){ toast('Marque ao menos uma esfera'); return; }
    const out=$('estOut'), linhas=[]; let total=0;
    for(let i=0;i<marc.length;i++){
      const t=marc[i];
      showLoad(`CNUC · ${t.rot} — ${uf}…`);
      if(out) out.innerHTML=`Baixando <b>${t.rot}</b> (${uf})…`;
      let gj=null;
      try{ gj=await baixaEsfera(t,uf,soVista,(q,tt)=>{
        showLoad(`CNUC · ${uf} — ${q.toLocaleString('pt-BR')}${tt?' de '+tt.toLocaleString('pt-BR'):''} na caixa…`); }); }
      catch(err){
        const msg=(err&&err.name==='AbortError')?'sem resposta em 2 min':(err.message||String(err));
        linhas.push(`· ${t.rot}: falhou — ${esc(msg)}`); continue;
      }
      const n=(gj.features||[]).length;
      if(!n){ linhas.push(`· ${t.rot}: nenhuma na UF ${uf}`); continue; }
      importGeoJSON(gj,`UCs ${t.esfera.toLowerCase()}s — ${uf} (CNUC)`);
      const L=(S.layers||[])[0];
      try{ if(L&&L.sym){
        L.sym.mode='cat'; L.sym.field='grupo'; L.sym.fill=0.20; L.labelField='nome_uc';
        const vs=[...new Set(L.features.map(f=>String(f.props.grupo||'')))];
        L.sym.cats=vs.map(v=>({value:v,color:/PI|integral/i.test(v)?'#1b7a3d':'#7fc64e',
          count:L.features.filter(f=>String(f.props.grupo||'')===v).length}));
        drawLayer(L); } }catch(e){}
      total+=n;
      linhas.push(`· ${t.rot}: ${n.toLocaleString('pt-BR')} UCs `+
        `<span style="color:var(--ok,#2e9b32)">(filtradas de ${gj._caixa} na caixa da UF — conferido)</span>`);
    }
    hideLoad();
    if(out) out.innerHTML=linhas.join('<br>')+
      `<br><br><b>${total.toLocaleString('pt-BR')} UCs</b> importadas.`+
      '<br><span style="font-size:10.5px">Fonte: CNUC/MMA via INDE, 07/2026. Categoria, grupo e órgão gestor vêm nos atributos.</span>';
    try{ refreshUI(); }catch(e){}
    toast(total? 'CNUC: '+total+' UCs importadas ('+uf+')' : 'CNUC: nada para a seleção');
  }
  function abrePainel(btn){
    const sec=$('secEST'); if(!sec){ toast('Painel estadual não encontrado'); return; }
    montaUF(); montaTemas(); montaLinks();
    if(typeof ribbonOpen==='function') ribbonOpen(sec,btn,'Órgãos estaduais');
    setTimeout(()=>{ const sa=$('estArea'); if(sa) sa.value='uf'; },0);
  }
  function liga(){
    try{
      if(typeof RIB_SVG==='object') RIB_SVG.est=
        '<svg viewBox="0 0 32 32" fill="none"><title>Órgãos estaduais</title>'+
        '<defs><linearGradient id="al3_est_g" x1="0" y1="0" x2="1" y2="1">'+
        '<stop offset="0" stop-color="#8FE388"/><stop offset="1" stop-color="#1565C0"/></linearGradient></defs>'+
        '<path d="M6 5h13l-2.5 3.5L19 12H6z" fill="url(#al3_est_g)" stroke="#173B57" stroke-width="1.4" stroke-linejoin="round"/>'+
        '<path d="M6 5v19" stroke="#173B57" stroke-width="1.6" stroke-linecap="round"/>'+
        '<path d="M12 24.5v5M16 29.5h-8" stroke="#173B57" stroke-width="1.6" stroke-linecap="round"/>'+
        '<path d="M22 18l4 8h-8z" fill="#FFD27A" stroke="#173B57" stroke-width="1.2" stroke-linejoin="round"/></svg>';
    }catch(e){}
    try{
      const cat=(typeof CATS!=='undefined')&&CATS.find(c=>c.id==='gis');
      if(cat) for(const g of cat.grupos||[]) for(const cmd of g.it||[])
        if(cmd.ic==='est'){ cmd.visual=0; cmd.soon=0; cmd.act=abrePainel; }
      if(typeof ribbonBuild==='function') ribbonBuild();
    }catch(e){ console.warn('Estaduais: ligação da ribbon',e); }
    const lig=(id,ev,fn)=>{ const e=$(id); if(e&&!e['_l'+ev]){ e['_l'+ev]=1; e.addEventListener(ev,fn); } };
    lig('estBaixar','click',()=>baixar().catch(err=>{ try{hideLoad();}catch(_){}
      toast('Estaduais falhou: '+(err&&err.message||err)); }));
    lig('estUF','change',montaLinks);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(liga,0));
  else setTimeout(liga,0);
  window.estAbrePainel=abrePainel;
  window.estBaixaUF=baixar;
})();
