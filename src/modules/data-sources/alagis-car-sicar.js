
/* ============================================================================
   CAR / SICAR — imóveis rurais por WFS, recortados pela área
   Perímetros: WFS /sicar, uma camada por UF.
   Temas ambientais: WFS /consulta_publica, download ZIP nativo pela área.
   A importação preserva geometrias, atributos e projeção de cada shapefile.
   ========================================================================== */
(function carSICAR(){
  const $=id=>document.getElementById(id);
  const BASE='https://geoserver.car.gov.br/geoserver/sicar/ows';
  const UFS=['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA',
             'PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
  /* status do imóvel, com as cores do próprio visualizador público */
  const STATUS={AT:['Ativo','#e0a11e'],PE:['Pendente','#e0641e'],
                SU:['Suspenso','#8a4fd4'],CA:['Cancelado','#c0392b']};
  /* Public theme names verified against the current official Consulta CAR
     GetCapabilities and geoServices/getGeoServerLayerLink (17/11/2026).
     The old /sicar workspace lists only perimeters. It cannot determine
     availability of the separate /consulta_publica thematic workspace.
     Native ZIP navigation is intentional: the thematic server does not
     grant CORS to geomine-3.web.app. No third-party proxy is used. */
  const ZIP_BASE='https://consulta.car.gov.br/geoserver-download/consulta_publica/ows';
  const CAR_TEMAS=[
  {
    "pref": "sicar_imoveis",
    "code": "imovel_rural",
    "rot": "Área do imóvel",
    "cor": "#e0a11e",
    "tipos": [
      "consulta_publica:iru",
      "consulta_publica:ast",
      "consulta_publica:pct"
    ]
  },
  {
    "pref": "sicar_app",
    "code": "app",
    "rot": "APP",
    "cor": "#1b7a3d",
    "tipos": [
      "consulta_publica:app_rio_ate_10",
      "consulta_publica:app_escadinha_rio_ate_10",
      "consulta_publica:app_escadinha_rio_10_a_50",
      "consulta_publica:app_rio_10_a_50",
      "consulta_publica:app_escadinha_rio_50_a_200",
      "consulta_publica:app_rio_50_a_200",
      "consulta_publica:app_escadinha_rio_200_a_600",
      "consulta_publica:app_rio_200_a_600",
      "consulta_publica:app_escadinha_rio_acima_600",
      "consulta_publica:app_rio_acima_600",
      "consulta_publica:app_escadinha_nascente_olho_dagua",
      "consulta_publica:app_nascente_olho_dagua",
      "consulta_publica:app_escadinha_lago_natural",
      "consulta_publica:app_lago_natural",
      "consulta_publica:app_reservatorio_artificial_decorrente_barramento",
      "consulta_publica:app_vereda",
      "consulta_publica:app_escadinha_vereda",
      "consulta_publica:app_manguezal",
      "consulta_publica:app_banhado",
      "consulta_publica:app_restinga",
      "consulta_publica:app_reservatorio_geracao_energia_ate_24_08_2001",
      "consulta_publica:app_area_topo_morro",
      "consulta_publica:app_area_altitude_superior_1800",
      "consulta_publica:app_borda_chapada",
      "consulta_publica:app_area_declividade_maior_45"
    ]
  },
  {
    "pref": "sicar_reserva_legal",
    "code": "reserva_legal",
    "rot": "Reserva legal",
    "cor": "#2e9b32",
    "tipos": [
      "consulta_publica:arl_proposta",
      "consulta_publica:arl_averbada",
      "consulta_publica:arl_aprovada_nao_averbada"
    ]
  },
  {
    "pref": "sicar_servidao_administrativa",
    "code": "servidao_administrativa",
    "rot": "Servidão administrativa",
    "cor": "#8a4fd4",
    "tipos": [
      "consulta_publica:area_infraestrutura_publica",
      "consulta_publica:area_utilidade_publica",
      "consulta_publica:reservatorio_energia"
    ]
  },
  {
    "pref": "sicar_vegetacao_nativa",
    "code": "vegetacao_nativa",
    "rot": "Vegetação nativa",
    "cor": "#4f8b3a",
    "tipos": [
      "consulta_publica:vegetacao_nativa"
    ]
  },
  {
    "pref": "sicar_uso_restrito",
    "code": "uso_restrito",
    "rot": "Uso restrito",
    "cor": "#b8860b",
    "tipos": [
      "consulta_publica:area_uso_restrito_declividade_25_a_45",
      "consulta_publica:area_uso_restrito_pantaneira"
    ]
  },
  {
    "pref": "sicar_area_consolidada",
    "code": "area_consolidada",
    "rot": "Área consolidada",
    "cor": "#c07a3a",
    "tipos": [
      "consulta_publica:area_consolidada"
    ]
  },
  {
    "pref": "sicar_pousio",
    "code": "area_pousio",
    "rot": "Área de pousio",
    "cor": "#9aa53a",
    "tipos": [
      "consulta_publica:area_pousio"
    ]
  },
  {
    "pref": "sicar_hidrografia",
    "code": "hidrografia",
    "rot": "Hidrografia",
    "cor": "#1565c0",
    "tipos": [
      "consulta_publica:rio_ate_10",
      "consulta_publica:rio_10_a_50",
      "consulta_publica:rio_50_a_200",
      "consulta_publica:rio_200_a_600",
      "consulta_publica:rio_acima_600",
      "consulta_publica:lago_natural",
      "consulta_publica:reservatorio_artificial_decorrente_barramento",
      "consulta_publica:reservatorio_geracao_energia_ate_24_08_2001"
    ]
  }
];
  let ultimoZip=null,zipOcupado=false,diretoOcupado=false;
  function temasMarcados(){return [...document.querySelectorAll('#carTemas input:checked')]
    .map(x=>CAR_TEMAS.find(t=>t.pref===x.value)).filter(Boolean);}
  function carMontaTemas(){
    const box=$('carTemas');if(!box)return;
    if(!box.dataset.montado){box.dataset.montado='1';box.innerHTML=CAR_TEMAS.map(t=>
      `<label class="snap-opt" style="font-size:11.5px"><input type="checkbox" value="${t.pref}"${t.pref==='sicar_imoveis'?' checked':''}><span>${t.rot}</span></label>`).join('');}
    const nota=$('carTemasNota');if(nota)nota.textContent='Selecione os temas e baixe o ZIP oficial da área. Depois use “Importar ZIP do SICAR”.';
    atualizaZip();
  }
  function planoZip(){
    const uf=$('carUF')?.value,c=caixa(),temas=temasMarcados();
    if(!UFS.includes(uf)||!temas.length||!c||![c.w,c.s,c.e,c.n].every(Number.isFinite)||
      c.w>=c.e||c.s>=c.n||c.w< -180||c.e>180||c.s< -90||c.n>90)return null;
    const tipos=[...new Set(temas.flatMap(t=>t.tipos))],nums=[c.w,c.s,c.e,c.n].map(n=>String(+n.toFixed(8))),
      filtro=`uf='${uf}' AND BBOX(geom,${nums.join(',')},'EPSG:4326')`;
    // Parentheses mean independent WFS queries. A comma would be a JOIN and
    // omit/fail unrelated thematic layers ("Join query must specify a filter").
    const params={service:'WFS',version:'2.0.0',request:'GetFeature',
      typeNames:tipos.map(n=>'('+n+')').join(''),outputFormat:'SHAPE-ZIP',srsName:'EPSG:4326',
      cql_filter:tipos.map(()=>filtro).join(';'),format_options:`filename:CAR_${uf}_temas.zip`};
    return {uf,temas,tipos,params,area:c.de};
  }
  function atualizaZip(){
    const form=$('carZipForm'),fields=$('carZipParams'),button=$('carZipDownload');if(!form||!fields||!button)return;
    const plan=planoZip();form.action=ZIP_BASE;button.disabled=!plan||zipOcupado||diretoOcupado;
    fields.replaceChildren();if(plan)for(const [name,value] of Object.entries(plan.params)){
      const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;fields.append(input);}
    const direto=$('carBaixar');if(direto){direto.hidden=!temasMarcados().some(t=>t.pref==='sicar_imoveis');direto.disabled=!UFS.includes($('carUF')?.value)||zipOcupado||diretoOcupado;}
    if($('carZipImport'))$('carZipImport').disabled=zipOcupado||diretoOcupado;
  }
  function iniciaZip(ev){
    atualizaZip();const plan=planoZip();if(!plan||zipOcupado||diretoOcupado){ev.preventDefault();toast('Escolha a UF, a área e ao menos um tema');return;}
    const areaId=$('carArea')?.value,poly=areaId&&areaId!=='vista'&&$('carClip')?.checked
      ?S.layers.find(l=>String(l.id)===String(areaId)):null;
    ultimoZip={projectId:S.projectId,uf:plan.uf,poly:poly?JSON.parse(JSON.stringify({gtype:poly.gtype,crs:poly.crs,features:poly.features})):null};
    if($('carOut'))$('carOut').textContent='Download solicitado ao SICAR: '+plan.temas.map(t=>t.rot).join(', ')+'. Salve o ZIP e use “Importar ZIP do SICAR”.';
    // Leave native form navigation intact. The browser can download the ZIP
    // without reading a cross-origin response or circumventing CORS.
  }
  function temaDoArquivo(path){
    const base=String(path).split('/').pop().replace(/\.[^.]+$/,'').toLowerCase(),
      aliases=CAR_TEMAS.flatMap(t=>[t.code,t.pref,t.code==='imovel_rural'?'area_imovel':t.code,...t.tipos.map(n=>n.split(':')[1])].map(n=>({n,t})));
    aliases.sort((a,b)=>b.n.length-a.n.length);
    return aliases.find(({n})=>base===n||base.startsWith(n+'_')||base.startsWith(n+'-'))?.t||null;
  }
  async function importaZipSicar(files){
    if(zipOcupado||diretoOcupado)return;
    const projectId=S.projectId,plan=ultimoZip?.projectId===projectId?ultimoZip:null,staged=[];
    zipOcupado=true;atualizaZip();
    try{
      for(const file of files){
        if(!/\.zip$/i.test(file.name))throw Error('Escolha um arquivo ZIP com os shapefiles do SICAR.');
        showLoad('Lendo ZIP do SICAR…');
        const zip=await JSZip.loadAsync(await file.arrayBuffer()),bases=new Map();
        zip.forEach((path,entry)=>{if(entry.dir)return;const m=path.match(/^(.*)\.(shp|dbf|prj|cpg|cst)$/i);if(!m)return;
          const key=m[1].toLowerCase();if(!bases.has(key))bases.set(key,{name:m[1]});bases.get(key)[m[2].toLowerCase()]=entry;});
        let shapes=0;
        for(const g of bases.values()){
          if(!g.shp)continue;shapes++;
          if(!g.dbf||!g.prj)throw Error(g.name+': faltam .dbf ou .prj no ZIP. Nenhuma camada deste lote foi importada.');
          const [shp,dbf,prj,cpg]=await Promise.all([g.shp.async('arraybuffer'),g.dbf.async('arraybuffer'),g.prj.async('string'),(g.cpg||g.cst)?(g.cpg||g.cst).async('string'):null]);
          if(S.projectId!==projectId)throw Object.assign(Error('A importação foi cancelada porque outro projeto foi aberto.'),{name:'AbortError'});
          const crs=guessCRSfromPRJ(prj);if(!crs)throw Error(g.name+': projeção não reconhecida. Nenhuma camada deste lote foi importada.');
          const parsed=parseSHP(shp),attributes=parseDBF(dbf,cpg),theme=temaDoArquivo(g.name),base=g.name.split('/').pop();
          if(attributes.rows.length!==parsed.feats.length)throw Error(base+': geometrias e atributos não correspondem. Nenhuma camada deste lote foi importada.');
          const features=parsed.feats.flatMap((f,i)=>{
            const row=attributes.rows[i];if(!f.geom||row?._del)return [];
            const props={...row,CAR_TEMA:theme?.rot||'SICAR',CAR_CAMADA:base},ft={geom:f.geom,multi:!!f.multi,props};if(f.zg)ft.zg=f.zg;return [ft];});
          const fields=attributes.fields.filter(f=>!['CAR_TEMA','CAR_CAMADA'].includes(f.name)).concat([
            {name:'CAR_TEMA',type:'C',length:80,decimal:0},{name:'CAR_CAMADA',type:'C',length:120,decimal:0}]);
          staged.push({name:'CAR — '+(theme?.rot||base)+' · '+base,crs,gtype:parsed.gtype,features,fields,
            color:theme?.cor||'#4f8b3a',theme,src:{provider:'SICAR',url:ZIP_BASE,file:file.name}});
        }
        if(!shapes)throw Error('O ZIP não contém shapefiles (.shp, .dbf e .prj). Nenhuma camada deste lote foi importada.');
      }
      if(S.projectId!==projectId)throw Object.assign(Error('A importação foi cancelada porque outro projeto foi aberto.'),{name:'AbortError'});
      const created=[];
      for(const item of staged){
        if(!item.features.length)continue;
        const L=addLayer({...item,undo:true});L.sym.color=L.sym.stroke=item.color;L.sym.fill=item.theme?.pref==='sicar_imoveis' ? .08 : .25;
        if(plan?.poly)window.alagisRecortaPorPoligono(L,plan.poly);
        drawLayer(L);created.push(L);
      }
      const total=created.reduce((n,L)=>n+L.features.length,0);
      if($('carOut'))$('carOut').textContent=`${created.length} camada(s) do SICAR importada(s) · ${total.toLocaleString('pt-BR')} feições.`;
      refreshUI();if(created.length)fitAll();toast(created.length?'SICAR: ZIP importado':'SICAR: nenhuma feição no ZIP');
      return {layers:created.length,features:total};
    }catch(error){if($('carOut'))$('carOut').textContent=error.message;throw error;}
    finally{zipOcupado=false;hideLoad();atualizaZip();}
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
    el.textContent=`${c.de} · ${a.toLocaleString('pt-BR',{maximumFractionDigits:1})} km²`;atualizaZip();
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
      .map(x=>CAR_TEMAS.find(t=>t.pref===x.value)).filter(t=>t?.pref==='sicar_imoveis');
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
  async function baixarDireto(){
    if(zipOcupado||diretoOcupado)return;
    diretoOcupado=true;atualizaZip();
    try{return await baixar();}finally{diretoOcupado=false;atualizaZip();}
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
    lig('carBaixar','click',()=>baixarDireto().catch(err=>{ try{hideLoad();}catch(_){}
      toast('CAR falhou: '+(err&&err.message||err)); }));
    lig('carUF','change',atualizaZip);
    lig('carTemas','change',atualizaZip);
    lig('carZipForm','submit',iniciaZip);
    lig('carZipImport','click',()=>$('carZipInput')?.click());
    lig('carZipInput','change',ev=>{const files=[...ev.target.files];ev.target.value='';if(files.length)importaZipSicar(files).catch(err=>toast('SICAR: '+err.message));});
    lig('carArea','change',infoArea);
    lig('carArea','mousedown',preencheArea);
    lig('carArea','focus',preencheArea);
    try{ if(typeof map!=='undefined'&&map&&map.on) map.on('moveend zoomend',infoArea); }catch(e){}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(liga,0));
  else setTimeout(liga,0);
  window.carAbrePainel=abrePainel;
  window.carBaixaArea=baixarDireto;
  window.GeoMineCAR={themes:()=>CAR_TEMAS.map(t=>({...t,tipos:t.tipos.slice()})),zipPlan:planoZip,importZip:importaZipSicar};
})();
