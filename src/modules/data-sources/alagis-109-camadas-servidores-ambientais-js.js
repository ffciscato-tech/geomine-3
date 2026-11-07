
(function ambienteCamadasEServidores(){
  const ORGAOS={
    ibama:{nome:'Ibama'},
    icmbio:{nome:'ICMBio',wms:['ICMBio / INDE']},
    iphan:{nome:'IPHAN',extra:[{provider:'IPHAN',title:'IPHAN — patrimônio cultural e arqueologia',url:'https://geoserver.iphan.gov.br/geoserver/ows',keywords:'iphan sicg patrimônio arqueologia bens tombados'}]},
    mma:{nome:'MMA · CNUC'},
    funai:{nome:'Funai',extra:[{provider:'Funai',title:'Funai — terras indígenas',url:'https://geoserver.funai.gov.br/geoserver/ows',keywords:'funai terras indígenas aldeias limites'}]},
    incra:{nome:'Incra'},
    car:{nome:'SICAR · CAR'},
    anm:{nome:'ANM',wms:['ANM']},
    ana:{nome:'ANA',wms:['ANA / SNIRH']},
    ibge:{nome:'IBGE',wms:['IBGE']},
    inde:{nome:'INDE',wms:['INDE']},
    sgb:{nome:'SGB',wms:['SGB / CPRM']},
    embrapa:{nome:'Embrapa',extra:[{provider:'Embrapa GeoInfo',title:'Embrapa — GeoInfo',url:'https://geoinfo.dados.embrapa.br/geoserver/ows',keywords:'embrapa geoinfo solos aptidão agrícola zoneamento terraclass'}]},
    inpe:{nome:'INPE'}
  };
  function servidores(key){
    const o=ORGAOS[key]||{},out=[];
    if(typeof WMS_CATALOG!=='undefined'){
      (o.wms||[]).forEach(p=>WMS_CATALOG.filter(x=>x.provider===p).forEach(x=>out.push(x)));
      (o.extra||[]).forEach(x=>{
        if(!WMS_CATALOG.some(y=>y.url===x.url))WMS_CATALOG.push(x);
        out.push(WMS_CATALOG.find(y=>y.url===x.url)||x);
      });
    }
    return out;
  }
  function abreWms(s,btn){
    const sec=document.getElementById('secWMS'),url=document.getElementById('wmsUrl'),busca=document.getElementById('wmsSearch');
    if(!sec||!url||typeof ribbonOpen!=='function'){toast('O painel WMS não está disponível nesta sessão.');return;}
    url.value=s.url; if(busca)busca.value=s.provider||'';
    if(typeof WMS_LAST_PROVIDER!=='undefined')WMS_LAST_PROVIDER=s.provider||s.title||'';
    if(typeof wmsCatalogRender==='function')wmsCatalogRender(s.provider||'');
    ribbonOpen(sec,btn||document.querySelector('#ribbon .rbtn.on'),(s.provider||'Servidor')+' · camadas WMS');
    setTimeout(()=>{
      const status=document.getElementById('wmsStatus');
      if(status)status.textContent=(s.provider||'Servidor')+' selecionado. Consultando a lista oficial de camadas…';
      if(typeof wmsConnect==='function')wmsConnect();
      else document.getElementById('btnWmsConnect')?.click();
    },60);
  }
  function aprimoraPainel(key){
    const sec=document.getElementById('secAmbOrgao');if(!sec)return;
    const temas=sec.querySelector('.ao-themes');
    if(temas&&!temas.dataset.catalogo109){
      temas.dataset.catalogo109='1';
      temas.querySelectorAll('.ao-theme').forEach(x=>x.setAttribute('title','Camada ou tema disponível neste órgão'));
      const tit=temas.previousElementSibling;if(tit)tit.textContent='Camadas disponíveis para baixar ou consultar';
      const nota=document.createElement('div');nota.className='ao-catalog-note';
      nota.textContent='A ferramenta do órgão permite escolher as camadas efetivamente disponíveis. Em servidores WMS, a lista é lida ao vivo pelo GetCapabilities.';
      temas.after(nota);
    }
    const ss=servidores(key);if(!ss.length||sec.querySelector('.ao-server-list'))return;
    const nota=sec.querySelector('.ao-catalog-note');
    const bloco=document.createElement('div');bloco.innerHTML='<div class="ao-title">Servidores WMS / OGC do órgão</div>';
    const lista=document.createElement('div');lista.className='ao-server-list';
    ss.forEach(s=>{
      const b=document.createElement('button');b.type='button';b.className='ao-server';
      b.innerHTML='<span class="ao-server-globe">◎</span><span><b>'+esc(s.title)+'</b><small>'+esc(s.url)+'</small></span><em>LISTAR CAMADAS</em>';
      b.onclick=()=>abreWms(s,b);lista.appendChild(b);
    });
    bloco.appendChild(lista);(nota||temas).after(bloco);
  }
  const abrirAntigo=window.abreMenuAmbientalOrgao;
  function abre109(btn,key){
    if(typeof window.alagisAtualizaAreasFederais==='function')window.alagisAtualizaAreasFederais();
    if(typeof abrirAntigo==='function')abrirAntigo(btn,key);
    setTimeout(()=>aprimoraPainel(key),90);
  }
  function abreCatalogoWms(btn){
    RIB_CAT_ATUAL='ambiente';if(typeof switchView==='function')switchView('map');RIB_CAT_ATUAL='ambiente';
    if(typeof ribbonBuild==='function')ribbonBuild();
    setTimeout(()=>{
      const atual=[...document.querySelectorAll('#ribbon .rbtn')].find(b=>b.textContent.trim()==='Servidores WMS')||btn;
      const sec=document.getElementById('secWMS');if(!sec||!atual)return;
      const busca=document.getElementById('wmsSearch');if(busca)busca.value='';
      if(typeof wmsCatalogRender==='function')wmsCatalogRender('');
      if(typeof ribbonOpen==='function')ribbonOpen(sec,atual,'Servidores WMS / OGC ambientais');
    },30);
  }
  function liga109(){
    if(typeof CATS==='undefined')return;
    if(typeof WMS_CATALOG!=='undefined')Object.values(ORGAOS).forEach(o=>(o.extra||[]).forEach(x=>{
      if(!WMS_CATALOG.some(y=>y.url===x.url))WMS_CATALOG.push(x);
    }));
    const amb=CATS.find(c=>c.id==='ambiente');if(!amb)return;
    let geo=(amb.grupos||[]).find(g=>g.label==='Geosserviços');
    if(!geo){geo={label:'Geosserviços',it:[]};amb.grupos.push(geo);}
    geo.it=geo.it||[];
    if(!geo.it.some(x=>x.nome==='Servidores WMS'))geo.it.unshift({ic:'wms',nome:'Servidores WMS',act:abreCatalogoWms});
    Object.keys(ORGAOS).forEach(key=>{
      const nome=ORGAOS[key].nome;
      for(const g of amb.grupos||[])for(const it of g.it||[])if(it.nome===nome)it.act=btn=>abre109(btn,key);
    });
    if(typeof RIB_CAT_ATUAL!=='undefined'&&RIB_CAT_ATUAL==='ambiente'&&typeof ribbonBuild==='function')ribbonBuild();
  }
  window.abreServidorWmsAmbiental=abreWms;
  window.abreMenuAmbientalOrgao=abre109;
  liga109();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',liga109,{once:true});else setTimeout(liga109,0);
})();
