
(function ambienteOrgaosSeparados(){
  if(typeof RIB_SVG!=='undefined'){
    const ico=(id,body)=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><defs><linearGradient id="'+id+'g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E7F3D6"/><stop offset="1" stop-color="#78A85C"/></linearGradient><linearGradient id="'+id+'b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DDEEFF"/><stop offset="1" stop-color="#5A91C7"/></linearGradient><linearGradient id="'+id+'s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F8E8C7"/><stop offset="1" stop-color="#D19B59"/></linearGradient></defs><g stroke="#25445B" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">'+body.replace(/@g/g,'url(#'+id+'g)').replace(/@b/g,'url(#'+id+'b)').replace(/@s/g,'url(#'+id+'s)')+'</g></svg>';
    Object.assign(RIB_SVG,{
      org_ibama:ico('oib','<path d="M4 16c4-6 8-9 12-9s8 3 12 9c-4 6-8 9-12 9S8 22 4 16z" fill="@g"/><circle cx="16" cy="16" r="4" fill="@b"/><path d="M16 12c1.5-4 5-5 8-4-1 4-4 6-8 6" fill="@s"/>'),
      org_icmbio:ico('oic','<path d="M16 4c6 3 10 8 10 14l-10 9L6 18C6 12 10 7 16 4z" fill="@g"/><path d="M16 8v14m0-8-5-4m5 7 5-4M11 24h10"/>'),
      org_funai:ico('ofu','<path d="M6 24 9 9l7-5 7 5 3 15-10 4z" fill="@s"/><path d="m9 9 7 7 7-7M16 16v12M7 23h18"/><circle cx="16" cy="8" r="2" fill="@g"/>'),
      org_incra:ico('oin','<path d="M5 6h22v21H5z" fill="@s"/><path d="M5 14h22M13 6v21m7-13v13M13 21h14"/><path d="m7 12 3-3 3 3" fill="@g"/>'),
      org_iphan:ico('oip','<path d="m5 11 11-6 11 6z" fill="@s"/><path d="M7 12h18M9 12v11m5-11v11m4-11v11m5-11v11M6 24h20M4 27h24"/>'),
      org_car:ico('oca','<path d="M5 7h22v20H5z" fill="@s"/><path d="m5 20 7-6 6 4 9-8M13 27V14"/><path d="M17 12c0-5 4-8 9-7 0 5-3 8-9 7z" fill="@g"/>'),
      org_ana:ico('oan','<path d="M16 4C12 10 8 14 8 20a8 8 0 0 0 16 0c0-6-4-10-8-16z" fill="@b"/><path d="M5 26c4-2 7 2 11 0s7 2 11 0"/>'),
      org_ibge:ico('oibg','<circle cx="16" cy="16" r="11" fill="@b"/><path d="M5 16h22M16 5c4 4 6 7 6 11s-2 7-6 11M16 5c-4 4-6 7-6 11s2 7 6 11M8 10h16M8 22h16"/>'),
      org_inde:ico('oid','<circle cx="16" cy="16" r="4" fill="@b"/><circle cx="6" cy="8" r="2" fill="@g"/><circle cx="26" cy="7" r="2" fill="@s"/><circle cx="27" cy="24" r="2" fill="@g"/><circle cx="6" cy="25" r="2" fill="@s"/><path d="m8 9 5 5m6-1 5-5m-5 11 6 4m-12-4-5 5"/>'),
      org_sgb:ico('osg','<path d="m4 22 8-15 6 8 4-6 6 13z" fill="@s"/><path d="M5 22h22M9 17h15M11 13h10M15 9h2"/><path d="m20 25 3 3 5-6" stroke="#568A55" stroke-width="1.7"/>'),
      org_inpe:ico('oinp','<circle cx="16" cy="16" r="5" fill="@b"/><path d="M4 19c5-7 14-12 24-9M5 22c9 4 18 1 23-7"/><path d="m23 5 4 1 1 4-4-1z" fill="@s"/><path d="M8 8 5 5m19 19 3 3"/>'),
      org_anm:ico('oanm','<path d="M7 25 20 7m5 18L12 7" stroke="#6E4D37" stroke-width="2.5"/><path d="m17 8 5-4 5 5-6 2zM15 8 10 4 5 9l6 2z" fill="@s"/><path d="M5 27h22"/>'),
      org_mma:ico('omm','<circle cx="16" cy="16" r="11" fill="@g"/><path d="M8 19c5-1 8-5 10-10 4 4 5 9 1 13-3 3-8 2-11-3z" fill="#EAF5DE"/><path d="M9 23c4-5 8-7 13-9"/>')
    });
  }

  const NOME={ibama:'Ibama',icmbio:'ICMBio',funai:'Funai',incra:'Incra',iphan:'IPHAN',car:'SICAR · CAR',ana:'ANA',ibge:'IBGE',inde:'INDE',sgb:'SGB',inpe:'INPE',anm:'ANM',mma:'MMA · CNUC'};
  function botaoAtual(nome,antigo){
    return [...document.querySelectorAll('#ribbon .rbtn')].find(b=>b.textContent.trim()===nome)||antigo;
  }
  function prepara(nome,btn,cb){
    RIB_CAT_ATUAL='ambiente';
    if(typeof switchView==='function')switchView('map');
    RIB_CAT_ATUAL='ambiente';
    if(typeof ribbonBuild==='function')ribbonBuild();
    setTimeout(()=>cb(botaoAtual(nome,btn)),25);
  }
  function destaca(el){
    if(!el)return;
    document.querySelectorAll('.fv-org-focus').forEach(x=>x.classList.remove('fv-org-focus'));
    el.classList.add('fv-org-focus');el.scrollIntoView({block:'center',behavior:'smooth'});
    try{el.focus({preventScroll:true});}catch(e){}
    setTimeout(()=>el.classList.remove('fv-org-focus'),2600);
  }
  function abreFonte(btn,key){
    const nome=NOME[key];
    prepara(nome,btn,ancora=>{
      const sec=document.getElementById('sideAmb');
      if(sec&&typeof ribbonOpen==='function')ribbonOpen(sec,ancora,nome+' · fonte oficial');
      const step=document.querySelector('#sideAmb .fv-step[data-step="5"]');if(step)step.scrollIntoView({block:'start'});
      setTimeout(()=>{
        let alvo=null;
        if(['ibama','funai'].includes(key)||key==='incra'){
          const valor=key==='incra'?'incra_assent':key;
          const ck=document.querySelector('.fv-federal-checks input[value="'+valor+'"]');
          if(ck){ck.checked=true;alvo=ck.closest('label');}
        }
        if(!alvo){
          const aliases={iphan:['IPHAN'],ibge:['IBGE'],inde:['INDE'],inpe:['INPE'],mma:['MMA','CNUC']};
          const termos=aliases[key]||[nome];
          alvo=[...document.querySelectorAll('#sideAmb .fv-source-grid a')].find(a=>termos.some(t=>a.textContent.toUpperCase().includes(t.toUpperCase())));
        }
        destaca(alvo||document.getElementById('fvFederalDireto'));
      },60);
    });
  }
  function abrePainel(btn,key){
    const nome=NOME[key];
    prepara(nome,btn,ancora=>{
      const fn={car:window.carAbrePainel,icmbio:window.ucAbrePainel,ana:window.anaAbrePainel,sgb:window.sgbAbrePainel}[key];
      if(typeof fn==='function'){fn(ancora);return;}
      if(key==='anm'){
        const sec=document.getElementById('secANM');
        if(sec&&typeof ribbonOpen==='function')ribbonOpen(sec,ancora,'ANM · Processos Minerários');
        else abreFonte(ancora,key);
        return;
      }
      abreFonte(ancora,key);
    });
  }
  function abreEstadual(btn){
    prepara('Órgão estadual',btn,ancora=>{
      if(typeof window.estAbrePainel==='function')window.estAbrePainel(ancora);
      else abreFonte(ancora,'mma');
    });
  }

  const item=(ic,nome,key,painel)=>({ic,nome,act:btn=>(painel?abrePainel(btn,key):abreFonte(btn,key))});
  const aplica=()=>{
    if(typeof CATS==='undefined')return;
    const amb=CATS.find(c=>c.id==='ambiente');if(!amb)return;
    amb.nome='MEIO AMBIENTE';amb.view='map';
    amb.grupos=[
      {label:'Estudo',it:[
        {ic:'ambiente_estudo',nome:'Favorabilidade',act:btn=>window.abreFavorabilidade(btn,1)},
        {ic:'ambiente_criterios',nome:'Critérios',act:btn=>window.abreFavorabilidade(btn,2)}]},
      {label:'Análise e resultados',it:[
        {ic:'ambiente_calcular',nome:'Calcular',act:btn=>window.abreFavorabilidade(btn,3)},
        {ic:'ambiente_poligonos',nome:'Classes vetoriais',act:btn=>window.abreFavorabilidade(btn,4)},
        {ic:'ambiente_relatorio',nome:'Relatório',act:btn=>window.abreFavorabilidade(btn,4,'fvRelatorio')}]},
      {label:'Licenciamento federal',it:[
        item('org_ibama','Ibama','ibama',false),item('org_icmbio','ICMBio','icmbio',true),
        item('org_iphan','IPHAN','iphan',false),item('org_mma','MMA · CNUC','mma',false)]},
      {label:'Território federal',it:[
        item('org_funai','Funai','funai',false),item('org_incra','Incra','incra',false),
        item('org_car','SICAR · CAR','car',true),item('org_anm','ANM','anm',true)]},
      {label:'Bases nacionais',it:[
        item('org_ana','ANA','ana',true),item('org_ibge','IBGE','ibge',false),
        item('org_inde','INDE','inde',false),item('org_sgb','SGB','sgb',true),
        item('org_inpe','INPE','inpe',false)]},
      {label:'Estados',it:[{ic:'ambiente_estaduais',nome:'Órgão estadual',act:abreEstadual}]}
    ];
    if(RIB_CAT_ATUAL==='ambiente'&&typeof ribbonBuild==='function')ribbonBuild();
  };
  aplica();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',aplica,{once:true});
  else setTimeout(aplica,0);
})();
