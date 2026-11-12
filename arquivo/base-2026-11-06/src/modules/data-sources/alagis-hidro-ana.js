
/* Carimbo de versão: aparece na linha de comandos ao abrir e no título da
   aba. Existindo duas cópias do arquivo, fica evidente qual é a mais nova. */
window.ALAGIS_BUILD='73.62 OFFSET-CAD — 24/08/2026';
try{ document.title=document.title.replace(/\s*·\s*build.*$/,'')+' · build '+ALAGIS_BUILD; }catch(e){}
window.addEventListener('DOMContentLoaded',()=>{ try{ cmdLog('CCMGIS build '+ALAGIS_BUILD,'info'); }catch(e){} });
/* ============================================================================
   HIDRO ANA — geosserviço ArcGIS do SNIRH, recortado pela área
   Protocolo diferente do WFS: query com envelope, paginação por resultOffset
   e total por returnCountOnly — o que permite a MESMA regra do CAR/ICMBio:
   completo ou nada, conferido contra o total declarado pelo servidor.
   ========================================================================== */
(function hidroANA(){
  const $=id=>document.getElementById(id);
  const B='https://www.snirh.gov.br/arcgis/rest/services/';
  const TEMAS=[
    {u:'SGI/Base_Hidrografica_2013/MapServer/0', rot:'Hidrografia ottocodificada (trechos)', cor:'#1565c0', on:true},
    {u:'SGI/Espelhos_Dagua_do_Brasil/MapServer/0', rot:'Espelhos d’água',        cor:'#22a7d0', on:true},
    {u:'SGI/Regioes_Hidrograficas/MapServer/0',    rot:'Regiões hidrográficas',  cor:'#4f5963', on:false},
    {u:'SGH/REDE_HIDROMETEOROLOGICA_NACIONAL/MapServer/2', rot:'Estações fluviométricas', cor:'#0d7f6a', on:false},
    {u:'SGH/REDE_HIDROMETEOROLOGICA_NACIONAL/MapServer/0', rot:'Estações pluviométricas', cor:'#6a5acd', on:false},
    {u:'SGH/REDE_HIDROMETEOROLOGICA_NACIONAL/MapServer/9', rot:'Estações telemétricas',   cor:'#c05a1e', on:false},
    {u:'SRE/OutorgasFederais_FeatureLayer/FeatureServer/0', rot:'Outorgas federais (serviço às vezes fora do ar)', cor:'#8a4fd4', on:false}
  ];
  const PAG=2000, TRAVA=100000;
  function caixa(){
    const v=($('anaArea')||{}).value||'vista';
    if(v==='vista'){ const b=map.getBounds();
      return {w:b.getWest(),s:b.getSouth(),e:b.getEast(),n:b.getNorth(),de:'extensão da tela'}; }
    const L=(S.layers||[]).find(l=>String(l.id)===String(v));
    if(!L) return null;
    let s0=1e9,w0=1e9,n0=-1e9,e0=-1e9;
    (L.features||[]).forEach(f=>{ let lls; try{ lls=featToLatLngs(L,f); }catch(err){ return; }
      (function a(x){ if(!x) return;
        if(typeof x[0]==='number'){ s0=Math.min(s0,x[0]); n0=Math.max(n0,x[0]);
                                    w0=Math.min(w0,x[1]); e0=Math.max(e0,x[1]); return; }
        x.forEach(a); })(lls); });
    if(!isFinite(s0)||s0>1e8) return null;
    return {w:w0,s:s0,e:e0,n:n0,de:'camada “'+L.name+'”'};
  }
  function infoArea(){ const el=$('anaInfo'); if(!el) return;
    const c=caixa(); if(!c){ el.textContent='Camada sem geometria.'; return; }
    const km=111.32, a=Math.abs((c.n-c.s)*km)*Math.abs((c.e-c.w)*km*Math.cos((c.n+c.s)/2*Math.PI/180));
    el.textContent=`${c.de} · ${a.toLocaleString('pt-BR',{maximumFractionDigits:1})} km²`; }
  function preencheArea(){ const sel=$('anaArea'); if(!sel) return;
    const atual=sel.value, polis=(S.layers||[]).filter(l=>l.gtype==='polygon');
    sel.innerHTML='<option value="vista">Extensão da tela</option>'+
      polis.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('');
    if([...sel.options].some(o=>o.value===atual)) sel.value=atual;
    infoArea(); }
  function montaTemas(){ const box=$('anaTemas'); if(!box||box._pronto) return; box._pronto=1;
    box.innerHTML=TEMAS.map((t,i)=>
      `<label class="snap-opt" style="font-size:11.5px"><input type="checkbox" value="${i}"${t.on?' checked':''}><span>${t.rot}</span></label>`).join(''); }
  async function pega(u){
    const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),120000);
    try{ const r=await fetch(u,{signal:ctl.signal});
      const tx=await r.text();
      if(r.status!==200) throw new Error('HTTP '+r.status);
      return JSON.parse(tx);
    }finally{ clearTimeout(t); } }
  async function baixaTema(t,c,progresso){
    const env=`${c.w},${c.s},${c.e},${c.n}`;
    const base=B+t.u+'/query?where=1%3D1'+
      '&geometry='+encodeURIComponent(env)+'&geometryType=esriGeometryEnvelope&inSR=4326'+
      '&spatialRel=esriSpatialRelIntersects&outFields=*&outSR=4326';
    /* total primeiro: é ele que garante o COMPLETO OU NADA. */
    const tot=await pega(base+'&f=json&returnCountOnly=true');
    const total=+tot.count;
    if(!isFinite(total)) throw new Error('o serviço não informou o total');
    if(total===0) return {type:'FeatureCollection',features:[],_total:0};
    if(total>TRAVA) throw new Error(`a área tem ${total.toLocaleString('pt-BR')} feições — reduza a área; NADA foi importado.`);
    const vistos=new Set(), feats=[];
    for(let off=0; off<total; off+=PAG){
      const gj=await pega(base+`&f=geojson&resultOffset=${off}&resultRecordCount=${PAG}`);
      (gj.features||[]).forEach(ft=>{ const id=ft.id!=null?String(ft.id):null;
        if(id){ if(vistos.has(id)) return; vistos.add(id); }
        feats.push(ft); });
      if(progresso) progresso(feats.length,total);
      if(!(gj.features||[]).length) break;
    }
    if(feats.length<total)
      throw new Error(`veio incompleto: ${feats.length} de ${total}. Nada foi importado — tente de novo.`);
    return {type:'FeatureCollection',features:feats,_total:total};
  }
  async function baixar(){
    const c=caixa(); if(!c){ toast('Área inválida'); return; }
    const marc=[...document.querySelectorAll('#anaTemas input:checked')].map(x=>TEMAS[+x.value]).filter(Boolean);
    if(!marc.length){ toast('Marque ao menos uma camada'); return; }
    const vRec=($('anaArea')||{}).value;
    const polyRec=(vRec&&vRec!=='vista'&&($('anaClip')||{}).checked)
      ? (S.layers||[]).find(l=>String(l.id)===String(vRec)) : null;
    const out=$('anaOut'), linhas=[]; let total=0;
    for(let i=0;i<marc.length;i++){
      const t=marc[i];
      showLoad(`ANA · ${t.rot} (${i+1}/${marc.length})…`);
      if(out) out.innerHTML=`Baixando <b>${t.rot}</b> (${i+1} de ${marc.length})…`;
      let gj=null;
      try{ gj=await baixaTema(t,c,(q,tt)=>{
        showLoad(`ANA · ${t.rot} — ${q.toLocaleString('pt-BR')} de ${tt.toLocaleString('pt-BR')}…`); }); }
      catch(err){
        const msg=(err&&err.name==='AbortError')?'sem resposta em 2 min':(err.message||String(err));
        linhas.push(`· ${t.rot}: falhou — ${esc(msg)}`); continue;
      }
      const n=(gj.features||[]).length;
      if(!n){ linhas.push(`· ${t.rot}: nada na área`); continue; }
      importGeoJSON(gj,'ANA — '+t.rot);
      const L=(S.layers||[])[0];
      try{ if(L&&L.sym){ L.sym.color=t.cor; L.sym.stroke=t.cor; L.sym.fill=0.15; L.color=t.cor; drawLayer(L); } }catch(e){}
      let rec=0;
      if(polyRec){ try{ rec=window.alagisRecortaPorPoligono(L,polyRec); }catch(e){} }
      total+=L.features.length;
      linhas.push(`· ${t.rot}: ${L.features.length.toLocaleString('pt-BR')} feições`+
        ` <span style="color:var(--ok,#2e9b32)">— completo (${gj._total.toLocaleString('pt-BR')} na caixa)</span>`+
        (rec?`<br>&nbsp;&nbsp;↳ ${rec.toLocaleString('pt-BR')} fora da poligonal descartadas`:''));
      await new Promise(r=>setTimeout(r,200));
    }
    hideLoad();
    if(out) out.innerHTML=linhas.join('<br>')+
      `<br><br><b>${total.toLocaleString('pt-BR')} feições</b> importadas.`+
      '<br><span style="font-size:10.5px">Fonte: ANA / SNIRH. Citar a base e a data do acesso.</span>';
    try{ refreshUI(); }catch(e){}
    toast(total? 'ANA: '+total.toLocaleString('pt-BR')+' feições importadas' : 'ANA: nada na área');
  }
  function abrePainel(btn){
    const sec=$('secANA');
    if(!sec){ toast('Painel da ANA não encontrado'); return; }
    montaTemas(); preencheArea();
    if(typeof ribbonOpen==='function') ribbonOpen(sec,btn,'Hidrografia e recursos hídricos — ANA');
    setTimeout(()=>{ const sa=$('anaArea');
      if(sa){ sa.value='vista'; sa.dispatchEvent(new Event('change')); } },0);
  }
  function liga(){
    try{
      if(typeof RIB_SVG==='object') RIB_SVG.ana=
        '<svg viewBox="0 0 32 32" fill="none"><title>Hidro ANA</title>'+
        '<defs><linearGradient id="al3_ana_g" x1="0" y1="0" x2="0" y2="1">'+
        '<stop offset="0" stop-color="#8FD3FF"/><stop offset="1" stop-color="#1565C0"/></linearGradient></defs>'+
        '<path d="M16 3c5 6.2 8.5 10.6 8.5 15a8.5 8.5 0 0 1-17 0C7.5 13.6 11 9.2 16 3z" fill="url(#al3_ana_g)" stroke="#173B57" stroke-width="1.4"/>'+
        '<path d="M11 18c1.6 1.2 3.2 1.2 5 0s3.4-1.2 5 0" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>'+
        '<path d="M16 25v4.5M11.5 29.5h9" stroke="#173B57" stroke-width="1.6" stroke-linecap="round"/></svg>';
    }catch(e){}
    try{
      const cat=(typeof CATS!=='undefined')&&CATS.find(c=>c.id==='gis');
      if(cat) for(const g of cat.grupos||[]) for(const cmd of g.it||[])
        if(cmd.ic==='ana'){ cmd.visual=0; cmd.soon=0; cmd.act=abrePainel; }
      if(typeof ribbonBuild==='function') ribbonBuild();
    }catch(e){ console.warn('ANA: ligação da ribbon',e); }
    const lig=(id,ev,fn)=>{ const e=$(id); if(e&&!e['_l'+ev]){ e['_l'+ev]=1; e.addEventListener(ev,fn); } };
    lig('anaBaixar','click',()=>baixar().catch(err=>{ try{hideLoad();}catch(_){}
      toast('ANA falhou: '+(err&&err.message||err)); }));
    lig('anaArea','change',infoArea);
    lig('anaArea','mousedown',preencheArea);
    lig('anaArea','focus',preencheArea);
    try{ if(typeof map!=='undefined'&&map&&map.on) map.on('moveend zoomend',infoArea); }catch(e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(liga,0));
  else setTimeout(liga,0);
  window.anaAbrePainel=abrePainel;
  window.anaBaixaArea=baixar;
})();
