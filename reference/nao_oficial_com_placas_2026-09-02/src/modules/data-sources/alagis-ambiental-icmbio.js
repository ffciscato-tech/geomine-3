
/* ============================================================================
   CAMADAS AMBIENTAIS — ICMBio via INDE (WFS aberto ao navegador)
   Mesmo padrão do CAR: área = tela ou poligonal, recorte por caixa, uma
   camada por tema, cor de trabalho por tema. A lista nasce de nomes reais
   conferidos no capabilities; se algum sair do ar, o painel avisa no item.
   ========================================================================== */
(function ambIcmbio(){
  const $=id=>document.getElementById(id);
  const BASE='https://geoservicos.inde.gov.br/geoserver/ICMBio/ows';
  const TEMAS=[
    {nome:'ICMBio:limiteucsfederais_a', rot:'Unidades de Conservação federais', cor:'#2e9b32', on:true},
    {nome:'ICMBio:canie_052026_p',      rot:'Cavidades naturais (CANIE)',       cor:'#c0392b', on:true},
    {nome:'ICMBio:embargos_icmbio',     rot:'Áreas embargadas',                 cor:'#e0641e', on:false},
    {nome:'ICMBio:autos_infracao_icmbio',rot:'Autos de infração',               cor:'#8a4fd4', on:false},
    {nome:'ICMBio:amazonia_2a_atualizacao',        rot:'Áreas prioritárias — Amazônia',          cor:'#1b7a3d', on:false},
    {nome:'ICMBio:caatinga_2a_atualizacao',        rot:'Áreas prioritárias — Caatinga',          cor:'#b8860b', on:false},
    {nome:'ICMBio:cerrado_pantanal_2a_atualizacao',rot:'Áreas prioritárias — Cerrado/Pantanal',  cor:'#9aa53a', on:false},
    {nome:'ICMBio:mataatlantica_2a_atualiz',       rot:'Áreas prioritárias — Mata Atlântica',    cor:'#4f8b3a', on:false}
  ];
  function caixa(){
    const v=($('ucArea')||{}).value||'vista';
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
    const el=$('ucInfo'); if(!el) return;
    const c=caixa(); if(!c){ el.textContent='Camada sem geometria.'; return; }
    const km=111.32, a=Math.abs((c.n-c.s)*km)*Math.abs((c.e-c.w)*km*Math.cos((c.n+c.s)/2*Math.PI/180));
    el.textContent=`${c.de} · ${a.toLocaleString('pt-BR',{maximumFractionDigits:1})} km²`;
  }
  function preencheArea(){
    const sel=$('ucArea'); if(!sel) return;
    const atual=sel.value, polis=(S.layers||[]).filter(l=>l.gtype==='polygon');
    sel.innerHTML='<option value="vista">Extensão da tela</option>'+
      polis.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('');
    if([...sel.options].some(o=>o.value===atual)) sel.value=atual;
    infoArea();
  }
  function montaTemas(){
    const box=$('ucTemas'); if(!box||box._pronto) return; box._pronto=1;
    box.innerHTML=TEMAS.map((t,i)=>
      `<label class="snap-opt" style="font-size:11.5px"><input type="checkbox" value="${i}"${t.on?' checked':''}><span>${t.rot}</span></label>`).join('');
  }
  /* COMPLETO OU NADA — mesma regra do CAR: o total do servidor é a régua. */
  const UC_PAG=5000, UC_TRAVA=100000;
  async function baixaTema(t,c,progresso){
    const vistos=new Set(), feats=[]; let ini=0, total=null;
    for(;;){
      const u=BASE+'?service=WFS&version=2.0.0&request=GetFeature'+
        '&typeNames='+encodeURIComponent(t.nome)+'&count='+UC_PAG+'&startIndex='+ini+
        '&outputFormat=application/json&srsName=EPSG:4326'+
        `&bbox=${c.w},${c.s},${c.e},${c.n},urn:ogc:def:crs:OGC:1.3:CRS84`;
      const ctl=new AbortController(); const tt=setTimeout(()=>ctl.abort(),120000);
      let gj;
      try{
        const r=await fetch(u,{signal:ctl.signal});
        const tx=await r.text();
        if(r.status!==200) throw new Error('HTTP '+r.status+' — '+tx.replace(/<[^>]+>/g,' ').trim().slice(0,110));
        gj=JSON.parse(tx);
      }finally{ clearTimeout(tt); }
      if(total==null){
        const tf=+gj.totalFeatures || +gj.numberMatched;
        if(isFinite(tf)&&tf>0) total=tf;
        if(total!=null && total>UC_TRAVA)
          throw new Error(`a área tem ${total.toLocaleString('pt-BR')} feições — reduza a área; NADA foi importado.`);
      }
      const lote=(gj.features||[]);
      lote.forEach(ft=>{ const id=ft.id!=null?String(ft.id):null;
        if(id){ if(vistos.has(id)) return; vistos.add(id); }
        feats.push(ft); });
      if(progresso&&feats.length) progresso(feats.length,total);
      if(total!=null && feats.length>=total) break;
      if(lote.length<UC_PAG) break;
      if(feats.length>=UC_TRAVA)
        throw new Error('passou da trava de 100 mil sem total informado. Reduza a área; NADA foi importado.');
      ini+=UC_PAG;
    }
    if(total!=null && feats.length<total)
      throw new Error(`veio incompleto: ${feats.length} de ${total}. Nada foi importado — tente de novo.`);
    return {type:'FeatureCollection',features:feats,_total:total};
  }
  async function baixar(){
    const c=caixa(); if(!c){ toast('Área inválida'); return; }
    const marc=[...document.querySelectorAll('#ucTemas input:checked')].map(x=>TEMAS[+x.value]).filter(Boolean);
    if(!marc.length){ toast('Marque ao menos uma camada'); return; }
    const vRec=($('ucArea')||{}).value;
    const polyRec=(vRec&&vRec!=='vista'&&($('ucClip')||{}).checked)
      ? (S.layers||[]).find(l=>String(l.id)===String(vRec)) : null;
    const out=$('ucOut'), linhas=[]; let total=0;
    for(let i=0;i<marc.length;i++){
      const t=marc[i];
      showLoad(`ICMBio · ${t.rot} (${i+1}/${marc.length})…`);
      if(out) out.innerHTML=`Baixando <b>${t.rot}</b> (${i+1} de ${marc.length})…`;
      let gj=null;
      try{ gj=await baixaTema(t,c,(q,tot)=>{
        showLoad(`ICMBio · ${t.rot} — ${q.toLocaleString('pt-BR')}${tot?' de '+tot.toLocaleString('pt-BR'):''} feições…`); }); }
      catch(err){
        const msg=(err&&err.name==='AbortError')?'sem resposta em 2 min':(err.message||String(err));
        linhas.push(`· ${t.rot}: falhou — ${esc(msg)}`); continue;
      }
      const n=(gj.features||[]).length;
      if(!n){ linhas.push(`· ${t.rot}: nada na área`); continue; }
      importGeoJSON(gj,t.rot);
      const L=(S.layers||[])[0];
      try{ if(L&&L.sym){ L.sym.color=t.cor; L.sym.stroke=t.cor; L.sym.fill=0.18; L.color=t.cor;
        /* UC categorizada pelo grupo, quando o atributo vier: proteção
           integral escura, uso sustentável clara — leitura imediata. */
        if(/UnidadesdeConserva|limiteucs/i.test(t.nome.replace(/\s/g,''))||/limiteucs/.test(t.nome)){
          const campo=['GrupoUC','grupo','GRUPO','grupouc'].find(k=>L.features.some(f=>f.props&&f.props[k]!=null));
          if(campo){ L.sym.mode='cat'; L.sym.field=campo;
            const vs=[...new Set(L.features.map(f=>String(f.props[campo]||'')))];
            L.sym.cats=vs.map(v=>({value:v,
              color:/PI|integral/i.test(v)?'#1b7a3d':'#7fc64e',
              count:L.features.filter(f=>String(f.props[campo]||'')===v).length}));
          }
        }
        drawLayer(L); } }catch(e){ console.warn('estilo ICMBio',e); }
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
      '<br><span style="font-size:10.5px">Fonte: ICMBio via INDE. Conferir a data de atualização de cada camada antes de uso em licenciamento.</span>';
    try{ refreshUI(); }catch(e){}
    toast(total? 'ICMBio: '+total.toLocaleString('pt-BR')+' feições importadas' : 'ICMBio: nada na área');
    try{ cmdLog('ICMBio: '+linhas.join(' | ').replace(/<[^>]+>/g,''),'ok'); }catch(e){}
  }
  function abrePainel(btn){
    const sec=$('secUC');
    if(!sec){ toast('Painel ambiental não encontrado'); return; }
    montaTemas(); preencheArea();
    const sa=$('ucArea'); if(sa && !sa.value) sa.value='vista';
    if(typeof ribbonOpen==='function') ribbonOpen(sec,btn,'Camadas ambientais — ICMBio');
    /* o commandUseActive do ribbonOpen pré-seleciona a camada ativa em
       qualquer <select>; aqui a área padrão é SEMPRE a tela (pedido do
       projeto) — a poligonal fica a um clique. */
    setTimeout(()=>{ const sa=document.getElementById('ucArea');
      if(sa){ sa.value='vista'; sa.dispatchEvent(new Event('change')); } },0);
  }
  function liga(){
    try{
      if(typeof RIB_SVG==='object') RIB_SVG.uc=
        '<svg viewBox="0 0 32 32" fill="none"><title>Camadas ambientais — ICMBio</title>'+
        '<defs><linearGradient id="al3_uc_g" x1="0" y1="0" x2="0" y2="1">'+
        '<stop offset="0" stop-color="#8FE388"/><stop offset="1" stop-color="#1B7A3D"/></linearGradient></defs>'+
        '<path d="M6 21c0-8 4-14 10-16 6 2 10 8 10 16l-10 4z" fill="url(#al3_uc_g)" stroke="#173B57" stroke-width="1.4" stroke-linejoin="round"/>'+
        '<path d="M16 8v13M16 12l-3.5-3M16 12l3.5-3M16 17l-4-3.4M16 17l4-3.4" stroke="#173B57" stroke-width="1.1" stroke-linecap="round"/>'+
        '<path d="M16 25v4.5M11.5 29.5h9" stroke="#173B57" stroke-width="1.6" stroke-linecap="round"/></svg>';
    }catch(e){}
    try{
      const cat=(typeof CATS!=='undefined')&&CATS.find(c=>c.id==='gis');
      if(cat) for(const g of cat.grupos||[]) for(const cmd of g.it||[])
        if(cmd.ic==='uc'){ cmd.visual=0; cmd.soon=0; cmd.act=abrePainel; }
      if(typeof ribbonBuild==='function') ribbonBuild();
    }catch(e){ console.warn('ICMBio: ligação da ribbon',e); }
    const lig=(id,ev,fn)=>{ const e=$(id); if(e&&!e['_l'+ev]){ e['_l'+ev]=1; e.addEventListener(ev,fn); } };
    lig('ucBaixar','click',()=>baixar().catch(err=>{ try{hideLoad();}catch(_){}
      toast('ICMBio falhou: '+(err&&err.message||err)); }));
    lig('ucArea','change',infoArea);
    lig('ucArea','mousedown',preencheArea);
    lig('ucArea','focus',preencheArea);
    try{ if(typeof map!=='undefined'&&map&&map.on) map.on('moveend zoomend',infoArea); }catch(e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(liga,0));
  else setTimeout(liga,0);
  window.ucAbrePainel=abrePainel;
  window.ucBaixaArea=baixar;
})();
