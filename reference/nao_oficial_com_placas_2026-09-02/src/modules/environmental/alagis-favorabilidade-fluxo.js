
(function ambienteUX(){
  /* Ícones próprios: a paisagem identifica o estudo; camadas com marcas
     representam critérios; a matriz 0/1/2 é o cálculo; mapa e documento são
     saídas. Todos usam a mesma gramática SVG do restante do CCMGIS. */
  if(typeof RIB_SVG!=='undefined'){
    /* Família ambiental no padrão ilustrado do CCMGIS: tons naturais suaves,
       contorno terroso fino e sem botão/moldura desenhada dentro do SVG. */
    const fvIcon=(id,body)=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><defs><linearGradient id="'+id+'g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E8F2D5"/><stop offset="1" stop-color="#8FB46B"/></linearGradient><linearGradient id="'+id+'s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7E8CB"/><stop offset="1" stop-color="#D5A86D"/></linearGradient><filter id="'+id+'d" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy=".7" stdDeviation=".55" flood-color="#785A42" flood-opacity=".18"/></filter></defs><g stroke="#89684F" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round" filter="url(#'+id+'d)">'+body.replace(/@g/g,'url(#'+id+'g)').replace(/@s/g,'url(#'+id+'s)')+'</g></svg>';
    Object.assign(RIB_SVG,{
      ambiente_estudo:fvIcon('fvae','<path d="M4 25h24L22 11l-5 6-4-4z" fill="@g"/><path d="M5 25h22M8 21c4-3 7 2 11-2 3-3 5 0 8-3" stroke="#F7F0DB"/><path d="M19 8c3-3 7-2 8 2-3 2-7 2-8-2z" fill="@s"/>'),
      ambiente_criterios:fvIcon('fvac','<path d="m5 8 11-4 11 5-11 5z" fill="@g"/><path d="m6 14 10 5 11-5-4-2-7 3-7-3z" fill="@s"/><path d="m6 20 10 5 11-5-4-2-7 3-7-3z" fill="@g"/><path d="m9 16 2 2 4-5m5 7 2 2 4-5" stroke="#6F8D55" stroke-width="1.35"/>'),
      ambiente_calcular:fvIcon('fvam','<rect x="5" y="5" width="22" height="22" rx="2" fill="@s"/><path d="M12 5v22M20 5v22M5 12h22M5 20h22" stroke="#B7834F"/><path d="m8 9 2 2 3-4m3 9 2 2 3-4m1 8 2 2 3-4" stroke="#668653" stroke-width="1.3"/>'),
      ambiente_poligonos:fvIcon('fvap','<path d="m5 22 4-13 10-4 8 8-3 13-12 1z" fill="@g"/><path d="M9 9l8 8 10-4M17 17l-5 10" stroke="#6F8D55"/><circle cx="9" cy="9" r="1.4" fill="@s"/><circle cx="17" cy="17" r="1.4" fill="@s"/><circle cx="24" cy="26" r="1.4" fill="@s"/>'),
      ambiente_relatorio:fvIcon('fvar','<path d="M7 4h13l5 5v19H7z" fill="@s"/><path d="M20 4v6h6M11 14h10M11 18h10M11 22h7"/><path d="m10 9 2 2 4-4" stroke="#668653" stroke-width="1.45"/>'),
      ambiente_fontes:fvIcon('fvaf','<ellipse cx="13" cy="8" rx="8" ry="3" fill="@g"/><path d="M5 8v12c0 2 4 3 8 3s8-1 8-3V8M5 14c0 2 4 3 8 3s8-1 8-3" fill="@g"/><path d="M18 18h9v9M27 18l-10 10" stroke="#668653" stroke-width="1.7"/>'),
      ambiente_federais:fvIcon('fvafed','<path d="M16 4c5.8 0 10.5 4.7 10.5 10.5S21.8 25 16 25 5.5 20.3 5.5 14.5 10.2 4 16 4z" fill="@g"/><path d="M5.8 13h20.4M16 4c2.5 2.8 3.8 6.3 3.8 10.5S18.5 22.2 16 25M16 4c-2.5 2.8-3.8 6.3-3.8 10.5S13.5 22.2 16 25"/><path d="M9 27h14M11 24.5v2.5m10-2.5V27" stroke="#668653" stroke-width="1.25"/>'),
      ambiente_estaduais:fvIcon('fvaest','<path d="M6 11 16 5l10 6v14H6z" fill="@s"/><path d="M4 11h24M9 11v11m4-11v11m6-11v11m4-11v11M5 25h22"/><path d="M13 7.8h6" stroke="#668653" stroke-width="1.35"/>')
    });
  }
  const labels={1:'Favorabilidade',2:'Critérios',3:'Calcular',4:'Classes vetoriais',5:'Órgãos federais'};
  function abrirAmbiente(btn,step,actionId,anchorName){
    RIB_CAT_ATUAL='ambiente';
    if(typeof switchView==='function')switchView('map');
    RIB_CAT_ATUAL='ambiente';
    if(typeof ribbonBuild==='function')ribbonBuild();
    try{if(typeof fvPreencheArea==='function')fvPreencheArea();if(typeof fvRenderFatores==='function')fvRenderFatores();}catch(e){}
    setTimeout(()=>{
      const sec=document.getElementById('sideAmb');
      const nomeAncora=anchorName||labels[step];
      const anchor=[...document.querySelectorAll('#ribbon .rbtn')].find(b=>b.textContent.trim()===nomeAncora)||btn;
      if(sec&&anchor&&typeof ribbonOpen==='function')ribbonOpen(sec,anchor,'Favorabilidade ambiental');
      const target=document.querySelector('#sideAmb .fv-step[data-step="'+step+'"]');
      if(target)target.scrollIntoView({block:'start',behavior:'smooth'});
      if(step===5)detectarUF(true);
      if(actionId){const action=document.getElementById(actionId);if(action)action.click();}
    },30);
  }
  window.abreFavorabilidade=function(btn,step,actionId){abrirAmbiente(btn,step||1,actionId);};
  function abrirFontesFederais(btn){
    abrirAmbiente(btn,5,null,'Órgãos federais');
    setTimeout(()=>{
      const territorio=document.getElementById('fvFontesFederaisTerritorio');
      const meio=document.getElementById('fvFontesFederaisMeioFisico');
      const estaduais=document.getElementById('fvFontesEstaduais');
      if(territorio)territorio.open=true;
      if(meio)meio.open=true;
      if(estaduais)estaduais.open=false;
      const direto=document.getElementById('fvFederalDireto');
      if(direto)direto.scrollIntoView({block:'nearest',behavior:'smooth'});
    },80);
  }
  function abrirFontesEstaduais(btn){
    abrirAmbiente(btn,5,null,'Órgão estadual');
    setTimeout(()=>{
      const territorio=document.getElementById('fvFontesFederaisTerritorio');
      const meio=document.getElementById('fvFontesFederaisMeioFisico');
      const estaduais=document.getElementById('fvFontesEstaduais');
      if(territorio)territorio.open=false;
      if(meio)meio.open=false;
      if(estaduais){estaduais.open=true;estaduais.scrollIntoView({block:'nearest',behavior:'smooth'});}
      detectarUF(false);
    },80);
  }
  function abrirANM(){
    RIB_CAT_ATUAL='gis';
    if(typeof ribbonBuild==='function')ribbonBuild();
    setTimeout(()=>{
      const btn=[...document.querySelectorAll('#ribbon .rbtn')].find(b=>/^ANM\b/i.test(b.textContent.trim()));
      if(btn){btn.click();return;}
      const sec=document.getElementById('secANM');
      if(sec&&typeof ribbonOpen==='function')ribbonOpen(sec,document.getElementById('fvFonteANM')||sec,'ANM · Processos Minerários');
    },20);
  }
  const UF_PORTAIS={
    AC:[['IMAC','https://imac.ac.gov.br/','Instituto de Meio Ambiente do Acre']],AL:[['IMA/AL','https://www.ima.al.gov.br/','Instituto do Meio Ambiente de Alagoas']],AP:[['SEMA/AP','https://sema.portal.ap.gov.br/','Secretaria de Meio Ambiente do Amapá']],AM:[['IPAAM','https://www.ipaam.am.gov.br/','Instituto de Proteção Ambiental do Amazonas']],
    BA:[['Inema','https://www.inema.ba.gov.br/','Meio ambiente e recursos hídricos da Bahia']],CE:[['Semace','https://www.semace.ce.gov.br/','Superintendência Estadual do Meio Ambiente']],DF:[['Brasília Ambiental','https://www.ibram.df.gov.br/','Instituto Brasília Ambiental']],ES:[['Iema/ES','https://iema.es.gov.br/','Instituto Estadual de Meio Ambiente']],
    GO:[['Semad/GO','https://goias.gov.br/meioambiente/','Secretaria de Meio Ambiente de Goiás']],MA:[['SEMA/MA','https://www.sema.ma.gov.br/','Secretaria de Meio Ambiente do Maranhão']],MT:[['SEMA/MT','https://www.sema.mt.gov.br/','Secretaria de Meio Ambiente de Mato Grosso']],MS:[['Imasul','https://www.imasul.ms.gov.br/','Instituto de Meio Ambiente de Mato Grosso do Sul']],
    MG:[['Sisema/MG','https://meioambiente.mg.gov.br/','Sistema Estadual de Meio Ambiente de Minas Gerais']],PA:[['Semas/PA','https://www.semas.pa.gov.br/','Secretaria de Meio Ambiente do Pará']],PB:[['Sudema','https://sudema.pb.gov.br/','Superintendência de Administração do Meio Ambiente']],PE:[['CPRH','https://www2.cprh.pe.gov.br/','Agência Estadual de Meio Ambiente']],
    PI:[['Semarh/PI','https://www.semarh.pi.gov.br/','Secretaria de Meio Ambiente do Piauí']],RJ:[['Inea','https://www.inea.rj.gov.br/','Instituto Estadual do Ambiente']],RN:[['Idema','https://www.idema.rn.gov.br/','Instituto de Desenvolvimento Sustentável e Meio Ambiente']],RS:[['SEMA/RS','https://www.sema.rs.gov.br/','Secretaria de Meio Ambiente do Rio Grande do Sul']],
    RO:[['Sedam','https://sedam.ro.gov.br/','Secretaria de Desenvolvimento Ambiental']],RR:[['Femarh','https://www.femarh.rr.gov.br/','Fundação Estadual do Meio Ambiente']],SC:[['IMA/SC','https://www.ima.sc.gov.br/','Instituto do Meio Ambiente de Santa Catarina']],SE:[['Adema','https://www.adema.se.gov.br/','Administração Estadual do Meio Ambiente']],TO:[['Semarh/TO','https://www.to.gov.br/semarh','Secretaria de Meio Ambiente do Tocantins']],
    PR:[['IAT · GeoPR','https://www.iat.pr.gov.br/Pagina/Geodados-Aplicacoes','Geodados e aplicações ambientais'],['IAT · downloads','https://www.iat.pr.gov.br/Pagina/Mapas-e-Dados-Espaciais','Mapas e dados espaciais']],
    SP:[['DataGEO','https://datageo.ambiente.sp.gov.br/pt','Infraestrutura de dados ambientais'],['CETESB','https://www.cetesb.sp.gov.br/cetesb/qualidade_ambiental/dados_abertos','Dados de qualidade ambiental']]
  };
  function ufNosAtributos(){
    const valid=new Set(Object.keys(UF_PORTAIS)),keys=/^(UF|SIGLA_UF|ESTADO|STATE)$/i;
    const camadas=(typeof S!=='undefined'&&S.layers)||[];
    for(const L of camadas)for(const f of (L.features||[]).slice(0,80))for(const [k,v] of Object.entries(f.props||{})){
      if(!keys.test(k))continue;const s=String(v||'').trim().toUpperCase();if(valid.has(s))return s;
      const hit=s.match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);if(hit)return hit[1];
    }return '';
  }
  function ufAproximada(lat,lng){
    /* Retângulos de segurança apenas para funcionamento offline nos dois estados
       mais usados pelos projetos atuais; divisas são confirmadas pela consulta. */
    if(lat>=-25.35&&lat<=-19.75&&lng>=-53.2&&lng<=-44.0)return 'SP';
    if(lat>=-26.8&&lat<=-22.45&&lng>=-54.7&&lng<=-48.0)return 'PR';
    return '';
  }
  function renderUF(uf,origem){
    const sel=document.getElementById('fvUFProjeto'),box=document.getElementById('fvPortaisUF'),st=document.getElementById('fvUFStatus');if(!box)return;
    if(uf&&sel)sel.value=uf;if(st)st.textContent=uf?(origem||'UF selecionada'):'selecione a UF';
    const rows=UF_PORTAIS[uf]||[];box.innerHTML=rows.length?rows.map(r=>'<a href="'+r[1]+'" target="_blank" rel="noopener noreferrer" title="Abrir '+r[2]+'"><b>'+uf+' · '+r[0]+'</b><span>'+r[2]+'</span></a>').join(''):'<span class="muted">UF não identificada. Selecione-a acima.</span>';
  }
  async function detectarUF(force){
    const manual=document.getElementById('fvUFProjeto');if(!force&&manual&&manual.value){renderUF(manual.value,'seleção manual');return;}
    let uf=ufNosAtributos();if(uf){renderUF(uf,'identificada nos atributos');return;}
    let c=null;try{c=(typeof map!=='undefined'&&map.getCenter)?map.getCenter():null;}catch(e){}
    if(c&&isFinite(c.lat)&&isFinite(c.lng)){
      try{
        const u='https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=5&addressdetails=1&lat='+encodeURIComponent(c.lat)+'&lon='+encodeURIComponent(c.lng);
        const j=await fetch(u,{headers:{'Accept-Language':'pt-BR'}}).then(r=>r.ok?r.json():Promise.reject());
        const iso=String(j.address&&j.address['ISO3166-2-lvl4']||'');uf=(iso.split('-')[1]||'').toUpperCase();
      }catch(e){uf=ufAproximada(c.lat,c.lng);}
    }
    renderUF(UF_PORTAIS[uf]?uf:'',uf?'identificada pela localização':'detecção inconclusiva');
  }
  window.fvDetectarUFProjeto=detectarUF;
  if(typeof CATS!=='undefined'){
    const amb=CATS.find(c=>c.id==='ambiente');
    if(amb){
      amb.nome='MEIO AMBIENTE'; amb.view='map';
      amb.grupos=[
        {label:'Estudo',it:[
          {ic:'ambiente_estudo',nome:'Favorabilidade',act:btn=>abrirAmbiente(btn,1)},
          {ic:'ambiente_criterios',nome:'Critérios',act:btn=>abrirAmbiente(btn,2)}
        ]},
        {label:'Análise',it:[
          {ic:'ambiente_calcular',nome:'Calcular',act:btn=>abrirAmbiente(btn,3)}
        ]},
        {label:'Resultados',it:[
          {ic:'ambiente_poligonos',nome:'Classes vetoriais',act:btn=>abrirAmbiente(btn,4)},
          {ic:'ambiente_relatorio',nome:'Relatório',act:btn=>abrirAmbiente(btn,4,'fvRelatorio')}
        ]},
        {label:'Dados oficiais',it:[
          {ic:'ambiente_federais',nome:'Órgãos federais',act:btn=>abrirFontesFederais(btn)},
          {ic:'ambiente_estaduais',nome:'Órgão estadual',act:btn=>abrirFontesEstaduais(btn)}
        ]}
      ];
      /* Meio Ambiente fica junto de GIS, antes das disciplinas de projeto. */
      const old=CATS.indexOf(amb); if(old>=0)CATS.splice(old,1);
      const gis=CATS.findIndex(c=>c.id==='gis'); CATS.splice(gis>=0?gis+1:1,0,amb);
    }
  }
  const mark=()=>{
    const area=document.getElementById('fvArea'), lista=document.getElementById('fvLista');
    const steps=[...document.querySelectorAll('#sideAmb .fv-step')];
    if(!steps.length)return;
    const hasArea=!!(area&&area.value), hasFactors=!!(lista&&lista.querySelector('.cls'));
    steps[0].classList.toggle('is-done',hasArea);
    steps[1].classList.toggle('is-done',hasFactors);
    steps.forEach(s=>s.classList.remove('is-active'));
    (steps[!hasArea?0:!hasFactors?1:(typeof FV!=='undefined'&&FV.ultimo)?3:2]||steps[0]).classList.add('is-active');
    steps[2].classList.toggle('is-done',!!(typeof FV!=='undefined'&&FV.ultimo));
  };
  setTimeout(()=>{
    const legacy=document.getElementById('secFavor'); if(legacy)legacy.style.display='none';
    const box=document.getElementById('fvLista'); if(box)new MutationObserver(mark).observe(box,{childList:true,subtree:true});
    ['fvArea','fvCel','fvSubs'].forEach(id=>{const e=document.getElementById(id);if(e)e.addEventListener('change',mark);});
    ['fvRodar','fvAuto','fvAdd','fvPoligonos','fvRelatorio'].forEach(id=>{const e=document.getElementById(id);if(e)e.addEventListener('click',()=>setTimeout(mark,150));});
    const anm=document.getElementById('fvFonteANM');if(anm)anm.addEventListener('click',abrirANM);
    const uf=document.getElementById('fvUFProjeto');if(uf)uf.addEventListener('change',()=>uf.value?renderUF(uf.value,'seleção manual'):detectarUF(true));
    const det=document.getElementById('fvDetectarUF');if(det)det.addEventListener('click',()=>detectarUF(true));
    detectarUF(false);
    mark(); if(typeof ribbonBuild==='function')ribbonBuild();
  },0);
})();
