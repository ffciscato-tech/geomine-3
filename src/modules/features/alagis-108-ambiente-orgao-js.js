
(function ambienteExclusivoPorOrgao(){
  if(typeof RIB_SVG!=='undefined'&&!RIB_SVG.org_embrapa)RIB_SVG.org_embrapa=
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><defs><linearGradient id="embg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8f4d8"/><stop offset="1" stop-color="#73a956"/></linearGradient><linearGradient id="embs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8e8c7"/><stop offset="1" stop-color="#c98d45"/></linearGradient></defs><g stroke="#25445b" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21h22v6H5z" fill="url(#embs)"/><path d="M5 24h22M10 21c0-7 4-12 11-15 1 7-3 13-11 15z" fill="url(#embg)"/><path d="M10 21c3-5 6-8 11-11M15 14l-1-4m3 1 4 1"/><circle cx="8" cy="24" r="1" fill="#75a85a"/><circle cx="15" cy="24" r="1" fill="#75a85a"/><circle cx="23" cy="24" r="1" fill="#75a85a"/></g></svg>';
  const D={
    ibama:{nome:'Ibama',ic:'org_ibama',sigla:'Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renováveis',
      temas:['Áreas embargadas','Autos de infração','Fiscalização ambiental','Recuperação ambiental'],downloads:['ibama'],
      links:[
        ['Áreas embargadas','Consulta oficial de termos de embargo','https://www.gov.br/ibama/pt-br/servicos/consultas/autuacoes-e-embargos/areas-embargadas'],
        ['Pamgia','Análise e monitoramento geoespacial','https://www.gov.br/ibama/pt-br/centrais-de-conteudo/pamgia'],
        ['Geosserviços Pamgia','Camadas ambientais em serviços OGC','https://pamgia.ibama.gov.br/geoservicos/'],
        ['Painéis analíticos','Embargos, fiscalização, resíduos e recuperação','https://www.gov.br/ibama/pt-br/centrais-de-conteudo/paineis-analiticos/paineis-analiticos/']]},
    icmbio:{nome:'ICMBio',ic:'org_icmbio',sigla:'Instituto Chico Mendes de Conservação da Biodiversidade',panel:'secUC',panelFn:'ucAbrePainel',downloads:['canie'],
      temas:['UCs federais','Cavernas','Embargos ICMBio','Planos de ação para espécies'],
      links:[
        ['Dados geoespaciais','SHP, KML, WMS e WFS oficiais','https://www.gov.br/icmbio/pt-br/assuntos/dados_geoespaciais'],
        ['Dados abertos','Conjuntos publicados pelo ICMBio','https://www.gov.br/icmbio/pt-br/acesso-a-informacao/dados-abertos'],
        ['Painéis dinâmicos','Indicadores e unidades de conservação','https://www.gov.br/icmbio/pt-br/centrais-de-conteudo/paineis-dinamicos-do-icmbio']]},
    iphan:{nome:'IPHAN',ic:'org_iphan',sigla:'Instituto do Patrimônio Histórico e Artístico Nacional',
      temas:['Bens tombados','Sítios arqueológicos','Áreas de entorno','Patrimônio cultural protegido'],
      links:[
        ['SICG — mapa','Bens protegidos e patrimônio cultural','https://sicg.iphan.gov.br/sicg/protecoes/mapa?'],
        ['Cadastro arqueológico','Consulta e orientação oficial do IPHAN','https://www.gov.br/iphan/pt-br/patrimonio-cultural/patrimonio-arqueologico/cadastro-de-sitios-arqueologicos'],
        ['GeoServer IPHAN','Download de dados geoespaciais arqueológicos','https://geoserver.iphan.gov.br/geoserver/web/'],
        ['Dados abertos','Catálogo institucional do IPHAN','https://www.gov.br/iphan/pt-br/acesso-a-informacao/dados-abertos']]},
    mma:{nome:'MMA · CNUC',ic:'org_mma',sigla:'Ministério do Meio Ambiente e Mudança do Clima',
      temas:['UCs federais','UCs estaduais','UCs municipais','RPPNs','Categorias SNUC'],
      links:[
        ['CNUC','Cadastro Nacional de Unidades de Conservação','https://cnuc.mma.gov.br/powerbi'],
        ['Unidades de conservação','Página oficial e acesso ao cadastro nacional','https://www.gov.br/icmbio/pt-br/assuntos/biodiversidade/unidade-de-conservacao'],
        ['Portal do MMA','Políticas e áreas protegidas','https://www.gov.br/mma/pt-br']]},
    funai:{nome:'Funai',ic:'org_funai',sigla:'Fundação Nacional dos Povos Indígenas',downloads:['funai'],
      temas:['Terras indígenas','Terras em estudo','Aldeias','Coordenações regionais e locais'],
      links:[
        ['Geoprocessamento e mapas','SHP, KML, CSV, ODS e serviços oficiais','https://www.gov.br/funai/pt-br/atuacao/terras-indigenas/geoprocessamento-e-mapas'],
        ['Painel Terras Indígenas','Limites, fases administrativas e indicadores','https://www.gov.br/funai/pt-br/atuacao/terras-indigenas/geoprocessamento-e-mapas/painel-terras-indigenas'],
        ['GeoServer Funai','Serviços geoespaciais institucionais','https://geoserver.funai.gov.br/geoserver/web/']]},
    incra:{nome:'Incra',ic:'org_incra',sigla:'Instituto Nacional de Colonização e Reforma Agrária',downloads:['incra_assent','incra_imovel'],
      temas:['Assentamentos','Imóveis certificados','Parcelas SIGEF/SNCI','Territórios quilombolas'],
      links:[
        ['Acervo Fundiário','Malha fundiária, assentamentos e certificações','https://acervofundiario.incra.gov.br/acervo/acv.php'],
        ['SIGEF','Gestão fundiária e imóveis georreferenciados','https://sigef.incra.gov.br/'],
        ['Resumo do acervo','Estatísticas das bases fundiárias','https://acervofundiario.incra.gov.br/acervo/dados_acervo_3.php']]},
    car:{nome:'SICAR · CAR',ic:'org_car',sigla:'Sistema Nacional de Cadastro Ambiental Rural',panel:'secCAR',panelFn:'carAbrePainel',
      temas:['Imóveis rurais','Reserva legal','APP','Uso restrito','Remanescentes de vegetação'],
      links:[
        ['Consulta pública CAR','Pesquisa de imóveis rurais cadastrados','https://www.car.gov.br/#/consultar'],
        ['Portal SICAR','Acesso ao sistema nacional','https://www.car.gov.br/']]},
    anm:{nome:'ANM',ic:'org_anm',sigla:'Agência Nacional de Mineração',panel:'secANM',panelFn:'anmAbrePainel',
      temas:['Processos minerários','Bloqueios','Servidões','Reservas garimpeiras','Proteção de fonte'],
      links:[
        ['SIGMINE — dados abertos','SHP e KML oficiais por UF e Brasil','https://dadosabertos.anm.gov.br/SIGMINE/'],
        ['Sistemas de exploração','Acesso oficial ao SIGMINE e sistemas minerários','https://www.gov.br/anm/pt-br/assuntos/exploracao-mineral/sistemas-de-exploracao-mineral'],
        ['Dados abertos ANM','Catálogo e documentação institucional','https://www.gov.br/anm/pt-br/assuntos/acesso-a-informacao/dados-abertos']]},
    ana:{nome:'ANA',ic:'org_ana',sigla:'Agência Nacional de Águas e Saneamento Básico',panel:'secANA',panelFn:'anaAbrePainel',
      temas:['Hidrografia','Massas d’água','Estações','Outorgas','Séries hidrológicas'],
      links:[
        ['Portal SNIRH','Dados, geosserviços, metadados e mapas','https://www.snirh.gov.br/hydroweb/'],
        ['Hidroweb','Estações e séries hidrometeorológicas','https://www.snirh.gov.br/hidroweb/'],
        ['CNARH','Usuários, usos e interferências hídricas','https://www.gov.br/ana/pt-br/assuntos/regulacao-e-fiscalizacao/cadastro-nacional-de-usuarios-recursos-hidricos-cnarh'],
        ['Sistemas ANA','Monitoramento, reservatórios e regulação','https://www.gov.br/ana/pt-br/assuntos/aplicativos-sistemas/acesso-aos-sistemas']]},
    ibge:{nome:'IBGE',ic:'org_ibge',sigla:'Instituto Brasileiro de Geografia e Estatística',
      temas:['Malhas territoriais','Cartografia','Setores censitários','Geociências','Toponímia'],
      links:[
        ['Downloads de geociências','Cartas, mapas, malhas e bases públicas','https://www.ibge.gov.br/geociencias/downloads-geociencias.html'],
        ['Malhas territoriais','Estados, municípios, distritos e setores','https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais.html'],
        ['Portal de mapas','Visualização cartográfica do IBGE','https://portaldemapas.ibge.gov.br/']]},
    inde:{nome:'INDE',ic:'org_inde',sigla:'Infraestrutura Nacional de Dados Espaciais',
      temas:['Catálogo nacional','Metadados','WMS/WFS','Camadas de órgãos públicos'],
      links:[
        ['Visualizador INDE','Visualizar e combinar camadas nacionais','https://visualizador.inde.gov.br/'],
        ['Catálogo de metadados','Pesquisar conjuntos e serviços geoespaciais','https://metadados.inde.gov.br/'],
        ['Diretório de geosserviços','Acesso técnico a serviços OGC','https://geoservicos.inde.gov.br/']]},
    sgb:{nome:'SGB',ic:'org_sgb',sigla:'Serviço Geológico do Brasil',panel:'secSGB',panelFn:'sgbAbrePainel',
      temas:['Geologia','Litoestratigrafia','Recursos minerais','Afloramentos','Poços'],
      links:[
        ['GeoSGB','Bases e mapas geocientíficos oficiais','https://geosgb.sgb.gov.br/geosgb/'],
        ['Geosserviços SGB','Catálogo WMS e WFS institucional','https://geoservicos.sgb.gov.br/geoserver/ows?service=WFS&request=GetCapabilities']]},
    embrapa:{nome:'Embrapa',ic:'org_embrapa',sigla:'Empresa Brasileira de Pesquisa Agropecuária',
      temas:['Solos','Aptidão agrícola','Uso e cobertura da terra','Zoneamentos','Diagnósticos agroambientais'],
      links:[
        ['GeoInfo Embrapa','Infraestrutura oficial de dados espaciais','https://geoinfo.dados.embrapa.br/'],
        ['Catálogo GeoInfo','Conjuntos, mapas, documentos e painéis','https://geoinfo.dados.embrapa.br/catalogue/'],
        ['Mapa de solos do Brasil','Metadados e downloads vetoriais','https://geoinfo.dados.embrapa.br/datasets/geonode%3Abrasil_solos_5m_20201104/metadata_detail'],
        ['GeoPortal TerraClass','Cobertura e uso da terra na Amazônia e Cerrado','https://www.embrapa.br/web/agricultura-digital/busca-de-solucoes-tecnologicas/-/produto-servico/5159/geoportal-terraclass']]},
    inpe:{nome:'INPE',ic:'org_inpe',sigla:'Instituto Nacional de Pesquisas Espaciais',
      temas:['PRODES','DETER','Queimadas','TerraClass','Monitoramento por satélite'],
      links:[
        ['TerraBrasilis','Mapas, séries e downloads do monitoramento','https://terrabrasilis.dpi.inpe.br/app/'],
        ['Dados de monitoramento','Catálogo oficial ambiental do INPE','https://www.gov.br/inpe/pt-br/acesso-a-informacao/dados-abertos/monitoramento-ambiental'],
        ['Programa Queimadas','Focos, risco e áreas queimadas','https://terrabrasilis.dpi.inpe.br/queimadas/portal/']]}
  };
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let chaveAtual=null,ancoraAtual=null;
  function garanteSec(){
    let sec=document.getElementById('secAmbOrgao');if(sec)return sec;
    sec=document.createElement('div');sec.id='secAmbOrgao';sec.className='hsec';sec.style.display='none';
    (document.getElementById('sideGeo')||document.body).appendChild(sec);return sec;
  }
  function icone(d){
    try{return typeof ribIcon==='function'?ribIcon({ic:d.ic}):'';}catch(e){return '';}
  }
  function areaHtml(d){
    if(!d.downloads)return '';
    return '<div class="ao-area"><label for="aoArea">Área da consulta espacial</label><select id="aoArea"><option value="vista">Extensão visível da tela</option></select></div>';
  }
  function toolsHtml(d){
    const a=[];
    if(d.panel||d.panelFn)a.push('<button class="ao-tool primary" type="button" data-ao-tool="painel">Abrir ferramenta '+esc(d.nome)+' no CCMGIS</button>');
    if(d.downloads){
      d.downloads.forEach(k=>{
        const rot={ibama:'Carregar áreas embargadas na área',funai:'Carregar terras indígenas na área',canie:'Carregar cavidades naturais (CANIE/CECAV) na área',incra_assent:'Carregar assentamentos na área',incra_imovel:'Carregar imóveis e parcelas na área'}[k]||'Carregar vetor na área';
        a.push('<button class="ao-tool '+(d.downloads.length===1?'primary':'')+'" type="button" data-ao-download="'+k+'">'+esc(rot)+'</button>');
      });
    }
    return a.length?'<div class="ao-title">Ferramentas CCMGIS</div>'+areaHtml(d)+'<div class="ao-tools">'+a.join('')+'</div>':'';
  }
  function render(key){
    const d=D[key],sec=garanteSec();if(!d)return sec;
    chaveAtual=key;
    sec.innerHTML='<div class="ao-head"><div class="ao-ico" aria-hidden="true">'+icone(d)+'</div><div><h2>'+esc(d.nome)+'</h2><p>'+esc(d.sigla)+'</p></div></div><div class="ao-body">'+
      '<div class="ao-exclusive"><b>✓</b><span>Este menu contém somente temas, ferramentas e fontes oficiais de <b>'+esc(d.nome)+'</b>. Os demais órgãos não aparecem aqui.</span></div>'+
      '<div class="ao-title">Quesitos e camadas do órgão</div><div class="ao-themes">'+d.temas.map(x=>'<span class="ao-theme">'+esc(x)+'</span>').join('')+'</div>'+
      toolsHtml(d)+'<div class="ao-title">Fontes oficiais</div><div class="ao-sources">'+d.links.map(x=>'<a class="ao-source" href="'+esc(x[2])+'" target="_blank" rel="noopener noreferrer"><b>'+esc(x[0])+' ↗</b><span>'+esc(x[1])+'</span></a>').join('')+'</div>'+
      '<div class="ao-foot">Fontes institucionais verificadas em 25/08/2026. Consultas externas abrem o portal oficial em nova aba; ferramentas CCMGIS mantêm o recorte espacial do projeto.</div></div>';
    const destino=document.getElementById('fvFederalArea'),sel=sec.querySelector('#aoArea');
    if(sel&&destino){
      sel.innerHTML=[...destino.options].map(o=>'<option value="'+esc(o.value)+'">'+esc(o.textContent)+'</option>').join('');
      sel.value=destino.value||'vista';
    }
    sec.querySelectorAll('[data-ao-download]').forEach(b=>b.onclick=()=>downloadUnico(b.dataset.aoDownload,b));
    const pb=sec.querySelector('[data-ao-tool="painel"]');if(pb)pb.onclick=()=>abreFerramenta(d);
    return sec;
  }
  function downloadUnico(key,btn){
    const alvo=document.querySelector('#fvFederalDireto input[value="'+key+'"]'),go=document.getElementById('fvFederalBaixar');
    if(!alvo||!go){toast('A consulta vetorial deste órgão não está disponível nesta sessão.');return;}
    document.querySelectorAll('#fvFederalDireto input[type="checkbox"]').forEach(x=>x.checked=false);alvo.checked=true;
    const area=document.querySelector('#secAmbOrgao #aoArea'),dest=document.getElementById('fvFederalArea');
    if(area&&dest&&[...dest.options].some(o=>o.value===area.value))dest.value=area.value;
    const old=btn.textContent;btn.disabled=true;btn.textContent='Consultando '+key.replace('_',' ')+'…';go.click();
    const t0=Date.now(),vigia=setInterval(()=>{
      const out=document.getElementById('fvFederalOut'),fim=!go.disabled||Date.now()-t0>90000;
      if(fim){clearInterval(vigia);btn.disabled=false;btn.textContent=old;if(out&&out.textContent)toast(out.textContent);}
    },350);
  }
  function abreFerramenta(d){
    const fn=d.panelFn&&window[d.panelFn];
    if(typeof fn==='function'){fn(ancoraAtual||document.querySelector('#ribbon .rbtn.on'));return;}
    const p=d.panel&&document.getElementById(d.panel);
    if(p&&typeof ribbonOpen==='function')ribbonOpen(p,ancoraAtual||document.querySelector('#ribbon .rbtn.on'),d.nome+' · ferramenta CCMGIS');
  }
  function botaoAtual(nome,antigo){return [...document.querySelectorAll('#ribbon .rbtn')].find(b=>b.textContent.trim()===nome)||antigo;}
  function abre(btn,key){
    const d=D[key];if(!d)return;
    RIB_CAT_ATUAL='ambiente';if(typeof switchView==='function')switchView('map');RIB_CAT_ATUAL='ambiente';
    if(typeof ribbonBuild==='function')ribbonBuild();
    setTimeout(()=>{
      const a=botaoAtual(d.nome,btn),sec=render(key);ancoraAtual=a;
      if(sec&&a&&typeof ribbonOpen==='function')ribbonOpen(sec,a,d.nome+' · dados e consultas');
    },25);
  }
  const liga=()=>{
    if(typeof CATS==='undefined')return;
    const amb=CATS.find(c=>c.id==='ambiente');if(!amb)return;
    const bases=(amb.grupos||[]).find(g=>g.label==='Bases nacionais');
    if(bases&&!(bases.it||[]).some(it=>it.nome==='Embrapa')){
      bases.it=bases.it||[];
      bases.it.push({ic:'org_embrapa',nome:'Embrapa',act:btn=>abre(btn,'embrapa')});
    }
    Object.keys(D).forEach(key=>{
      const d=D[key];
      for(const g of amb.grupos||[])for(const it of g.it||[])if(it.nome===d.nome)it.act=btn=>abre(btn,key);
    });
    if(typeof RIB_CAT_ATUAL!=='undefined'&&RIB_CAT_ATUAL==='ambiente'&&typeof ribbonBuild==='function')ribbonBuild();
  };
  window.abreMenuAmbientalOrgao=abre;
  liga();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',liga,{once:true});else setTimeout(liga,0);
})();
