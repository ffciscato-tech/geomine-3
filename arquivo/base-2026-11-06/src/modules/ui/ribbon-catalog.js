const CATS=[
  {id:'projeto', nome:'PROJETO', view:'map', grupos:[
    {label:'Projeto', it:[
      {ic:'novo',nome:'Novo',act:()=>startNewProjectWizard()},
      {ic:'abrir',nome:'Abrir projeto',act:()=>actClick('projIn')},
      {ic:'salvar',nome:'Salvar',act:()=>saveProject(false)},
      {ic:'salvarcomo',nome:'Salvar como',act:()=>saveProject(true)},
    ]},
    {label:'Dados', it:[
      {ic:'importar',nome:'Importar',act:()=>actClick('fileIn')},
      {ic:'exportar',nome:'Exportar',act:()=>actClick('btnExport')},
      {ic:'kmz',nome:'KMZ',act:()=>{ if(typeof exportProjectKMZ==='function') exportProjectKMZ(); }},
      {ic:'qgis',nome:'QGIS',act:()=>actClick('btnQGIS')},
    ]},
    {label:'Publicar', it:[
      {ic:'recuperar',nome:'Recuperar',act:()=>{ if(typeof recuperarAutosave==='function') recuperarAutosave(); }},
      {ic:'publicar',nome:'Publicar',act:()=>actClick('btnPubOpen')},
    ]},
  ]},
  {id:'arquivo', nome:'ARQUIVO', view:'map', grupos:[
    {label:'Arquivo', it:[
      {ic:'novo',nome:'Novo',act:()=>{ if(confirm('Novo projeto? O trabalho não salvo será perdido.')) location.reload(); }},
      {ic:'abrir',nome:'Abrir',act:()=>actClick('projIn')},
      {ic:'salvar',nome:'Salvar',act:()=>saveProject(false)},
      {ic:'importar',nome:'Importar',act:()=>actClick('fileIn')},
      {ic:'exportar',nome:'Exportar',act:()=>actClick('btnExport')},
      {ic:'imprimir',nome:'Imprimir',act:()=>switchView('layout')},
    ]},
    {label:'Formatos (em breve)', it:[
      {ic:'pdf',nome:'PDF',soon:1},
      {ic:'compactar',nome:'Compactar',soon:1},
    ]},
  ]},
  {id:'gis', nome:'GIS', view:'geo', grupos:[
    {label:'Camadas', it:[
      {ic:'adicionar-camada',nome:'Camadas',act:()=>{ const r=document.getElementById('right'); if(r) r.classList.add('open'); }},
      {ic:'tabela',nome:'Atributos',act:()=>{ const L=activeLayer(); if(L){ S.activeId=L.id; openAttr(); } else toast('Sem camada ativa'); }},
      {ic:'wms',nome:'Serviços WMS',act:b=>{
        const sec=document.getElementById('secWMS');
        if(sec) ribbonOpen(sec,b,'Serviços WMS / OGC');
        else toast('Painel de serviços WMS não encontrado');
      }},
      {ic:'anm',nome:'ANM',act:b=>{
        if(typeof anmAbrePainel==='function'){ anmAbrePainel(b); return; }
        const sec=document.getElementById('secANM');
        if(sec) ribbonOpen(sec,b,'ANM · Processos Minerários'); else toast('Painel da ANM não encontrado');
      }},
    ]},
    {label:'Vetores', it:[
      {ic:'mescla',nome:'Mesclar',act:b=>ribMiniMenu(b,'Mesclar / combinar',[
        {nome:'Mesclar camadas marcadas', run:()=>actClick('btnMerge')},
        {nome:'Poligonizar linhas', run:()=>actClick('btnPz')},
        {sep:1},
        {nome:'Abrir painel completo…', secKey:'mescla'},
      ])},
      {ic:'dissolver',nome:'Dissolver',act:b=>ribMiniMenu(b,'Dissolver',[
        {nome:'Dissolver polígonos (gera limite)', run:()=>actClick('btnDs')},
        {sep:1},
        {nome:'Abrir painel completo…', secKey:'mescla'},
      ])},
      {ic:'limpeza',nome:'Limpeza',act:b=>ribMiniMenu(b,'Limpeza',[
        {nome:'Remover duplicadas / linhas curtas', secKey:'limpeza'},
      ])},
      {ic:'geometria',nome:'Geometria',act:b=>ribMiniMenu(b,'Ferramentas de geometria',[
        {nome:'Densificar linhas', run:()=>actClick('btnGtDens')},
        {nome:'Extrair vértices → pontos', run:()=>actClick('btnGtVtx')},
        {nome:'Extrair Z para pontos', run:()=>actClick('btnGtZ')},
        {sep:1},
        {nome:'Abrir painel completo…', secKey:'geometria'},
      ])},
      {ic:'diferenca',nome:'Diferença',act:()=>gisBoolean('difference')},
      {ic:'buffer',nome:'Buffer',act:()=>gisBuffer()},
      {ic:'converter',nome:'Converter',act:()=>gisConverter()},
    ]},
    {label:'Raster', it:[
      {ic:'clip',nome:'Recortar',act:()=>actClick('btnClip')||emBreve('Recortar')},
      {ic:'mosaico',nome:'Mosaico',act:()=>actClick('btnMosaic')||emBreve('Mosaico')},
      {ic:'cortar',nome:'Limite',act:()=>rasterLimite()},
    ]},
  ]},
  {id:'topografia', nome:'TOPOGRAFIA', view:'geo', grupos:[
    {label:'Superfícies', it:[
      {ic:'tin',nome:'Triangular (TIN)',secKey:'triangula'},
      {ic:'curvas',nome:'Curvas de nível',secKey:'curvas'},
      {ic:'cotas',nome:'Pontos cotados',secKey:'cotado'},
    ]},
    {label:'Linha', it:[
      {ic:'intersecao',nome:'Interseção',secKey:'interseção'},
      {ic:'cortar',nome:'Cortar',secKey:'linha-limite'},
      {ic:'estaca',nome:'Estaqueamento',secKey:'estaquea'},
    ]},
    {label:'Perfil', it:[
      {ic:'perfilsup',nome:'Superfícies',act:b=>abrePerfilTopografia(b,'secPrSuperficies','Superfícies do perfil')},
      {ic:'perfillinha',nome:'Linha',act:b=>abrePerfilTopografia(b,'secPrLinha','Linha do perfil')},
      {ic:'perfilres',nome:'Resultado',act:b=>abrePerfilTopografia(b,'secPrResultado','Resultado do perfil')},
    ]},
  ]},
  {id:'geologia', nome:'GEOLOGIA', view:'geo', grupos:[
    {label:'Sondagem (em breve)', it:[
      {ic:'sondagem',nome:'Sondagem',soon:1},{ic:'log',nome:'Log',soon:1},
      {ic:'testemunho',nome:'Testemunho',soon:1},
    ]},
    {label:'Estrutural (em breve)', it:[
      {ic:'falha',nome:'Falha',soon:1},{ic:'dobra',nome:'Dobra',soon:1},
      {ic:'foliacao',nome:'Foliação',soon:1},{ic:'estereograma',nome:'Estereograma',soon:1},
    ]},
    {label:'Modelo (em breve)', it:[
      {ic:'blocos',nome:'Modelo de blocos',soon:1},{ic:'secaogeol',nome:'Seção geológica',soon:1},
    ]},
  ]},
  {id:'mineracao', nome:'MINERAÇÃO', view:'map', grupos:[
    {label:'Cubagem', it:[
      {ic:'cava',nome:'Superfícies',secKey:'superf'},
      {ic:'restricao',nome:'Restrições',secKey:'restri'},
      {ic:'bloco',nome:'Bloco',secKey:'bloco'},
      {ic:'relatorio',nome:'Relatório',secKey:'relat'},
      {ic:'sequencia',nome:'Sequência',secKey:'sequenc'},
      {ic:'saidas',nome:'Saídas',secKey:'saída'},
    ]},
    {label:'Mina (em breve)', it:[
      {ic:'pitotimizado',nome:'Pit otimizado',soon:1},{ic:'reservas',nome:'Reservas',soon:1},
      {ic:'planejamento',nome:'Planejamento',soon:1},{ic:'controle',nome:'Controle',soon:1},
    ]},
  ]},
  {id:'hidrologia', nome:'HIDROLOGIA', view:'hidro', grupos:[
    {label:'Chuva', it:[
      {ic:'chuva',nome:'Precipitação',act:b=>ribMiniMenu(b,'Série de precipitação',[
        {nome:'Buscar série (estação ANA)', run:()=>actClick('btnANA')},
        {nome:'Colar série manual', run:()=>actClick('btnPaste')},
        {sep:1},
        {nome:'Abrir painel completo…', secKey:'precipita'},
      ])},
      {ic:'idf',nome:'IDF',act:b=>ribMiniMenu(b,'Curva IDF',[
        {nome:'Ajustar IDF da série', run:()=>actClick('btnIDF')},
        {nome:'Inserir IDF manual (K,a,b,c)', run:()=>actClick('btnIdfManual')},
        {nome:'Exportar IDF (CSV)', run:()=>actClick('btnIdfCSV')},
        {nome:'Exportar IDF (PNG)', run:()=>actClick('btnIdfPNG')},
        {sep:1},
        {nome:'Abrir painel completo…', secKey:'idf'},
      ])},
    ]},
    {label:'Fluxo', it:[
      {ic:'fluxo',nome:'Fluxo (D8)',act:b=>ribMiniMenu(b,'MDE e linhas de fluxo',[
        {nome:'Preencher depressões', run:()=>actClick('btnFill')},
        {nome:'D8 sem preencher (MDT bruto)', run:()=>actClick('btnRaw')},
        {nome:'Gerar linhas de fluxo', run:()=>actClick('btnStreams')},
        {nome:'Delimitar bacia (toque no mapa)', run:()=>actClick('btnBasin')},
        {nome:'Sombreado no mapa', run:()=>actClick('btnShade')},
        {sep:1},
        {nome:'Limpar linhas e bacias', run:()=>actClick('btnHidroLimpa')},
        {nome:'Abrir painel completo…', secKey:'fluxo'},
      ])},
      {ic:'inundacao',nome:'Simular Inundação',act:b=>ribMiniMenu(b,'Simulação por cotas',[
        {ic:'inund_ponto',nome:'Simular a partir de um ponto', run:()=>actClick('btnInundRun')},
        {ic:'inund_fundo',nome:'Partir do ponto mais baixo', run:()=>actClick('btnInundFundo')},
        {ic:'inund_tudo',nome:'Todas as células abaixo da cota', run:()=>actClick('btnInundTudo')},
        {sep:1},
        {nome:'Abrir painel completo…',secKey:'simulação de inundação'},
      ])},
      {ic:'mancha-inundacao',nome:'Mancha de Inundação',act:b=>ribMiniMenu(b,'Chuva e armazenamento',[
        {ic:'inund_ponto',nome:'Calcular chuva e indicar receptor',run:()=>actClick('btnLamina')},
        {ic:'bacia-hidrografica',nome:'Desenhar área contribuinte',run:()=>actClick('btnLamBaciaDraw')},
        {sep:1},
        {ic:'inund_limpa',nome:'Limpar resultados',run:()=>actClick('btnInundLimpa')},
        {nome:'Abrir painel completo…',secKey:'mancha de inundação'},
      ])},
      {ic:'barramento',nome:'Barramento',act:b=>ribMiniMenu(b,'Barramento',[
        {ic:'barramento',nome:'Traçar barramento no mapa', run:()=>actClick('btnBarrDraw')},
        {sep:1},
        {nome:'Abrir painel completo…', secKey:'mancha de inundação'},
      ])},
      {ic:'topografia',nome:'Topografia',secKey:'topografia'},
      {ic:'dimension',nome:'Dimensionar',secKey:'dimensiona'},
    ]},
    {label:'Drenagem', it:[
      {ic:'drenagem',nome:'Feições de drenagem',act:b=>ribMiniMenu(b,'Desenhar feição de drenagem',
        Object.keys(DREN_TIPOS).map(k=>({ic:'dren_'+k, nome:DREN_TIPOS[k].nome, desc:DREN_TIPOS[k].desc,
          run:()=>{ try{ if(typeof ED!=='undefined'&&ED.on) edLigar(false);}catch(e){}
            const sel=document.getElementById('drenTipo'); if(sel){ sel.value=k; sel.dispatchEvent(new Event('change')); }
            try{ drenBackstop(); }catch(e){} drenArma(k); } }))
        .concat([{sep:1},{nome:'Abrir painel completo…', secKey:'drenagem'}]))},
      {ic:'dimension',nome:'Dimensionar seção',act:b=>ribMiniMenu(b,'Dimensionamento',[
        {ic:'dimension',nome:'Dimensionar a feição selecionada', run:()=>actClick('btnDrenDimBtn')},
        {nome:'Recalcular geometria pelo MDT', run:()=>actClick('btnDrenRecalc')},
        {sep:1},
        {nome:'Abrir painel completo…', secKey:'drenagem'},
      ])},
    ]},
    {label:'Bacia de retenção', it:[
      {ic:'bacia',nome:'Bacia de retenção',sec:'#secBacia'},
    ]},
    {label:'Bacia (em breve)', it:[
      {ic:'drenagem',nome:'Rede de drenagem',soon:1},
      {ic:'tempoconc',nome:'Tempo de concentração',soon:1},
    ]},
  ]},
  {id:'geotecnia', nome:'GEOTECNIA', view:'perfis', grupos:[
    {label:'Seção', it:[
      {ic:'perfilsup',nome:'Superfícies',secKey:'superf'},
      {ic:'perfillinha',nome:'Linha',secKey:'linha do perfil'},
      {ic:'perfilres',nome:'Resultado',secKey:'resultado'},
    ]},
    {label:'Estabilidade (em breve)', it:[
      {ic:'estabilidade',nome:'Estabilidade FS',soon:1},{ic:'bishop',nome:'Bishop',secKey:'bishop'},
      {ic:'talude',nome:'Talude',soon:1},
    ]},
  ]},
  {id:'ambiente', nome:'MEIO AMBIENTE', view:'map', grupos:[
    {label:'Favorabilidade', it:[
      {ic:'favorab',nome:'Estudo de Favorabilidade',act:()=>abreFavorabilidade()},
      {ic:'favorab_calc',nome:'Calcular',act:()=>{ abreFavorabilidade(); setTimeout(()=>{const b=document.getElementById('fvRodar'); if(b) b.click();},250); }},
      {ic:'favorab_rel',nome:'Relatório',act:()=>{ abreFavorabilidade(); setTimeout(()=>{const b=document.getElementById('fvRelatorio'); if(b) b.click();},250); }},
    ]},
  ]},
  {id:'analises', nome:'ANÁLISES', view:'map', grupos:[
    {label:'Medição', it:[
      {ic:'medir',nome:'Medir distância',act:()=>actTool('measure')},
      {ic:'medarea',nome:'Medir área',act:()=>actTool('measure')},
      {ic:'identificar',nome:'Identificar',act:()=>actTool('info')},
    ]},
    {label:'Terreno', it:[
      {ic:'volume',nome:'Volume',act:()=>{RIB_CAT_ATUAL='mineracao';switchView('map')}},
      {ic:'mdt',nome:'MDT',act:()=>switchView('geo')},
    ]},
  ]},
  {id:'cad', nome:'CAD', view:'map', grupos:[
    {label:'Desenho', it:[
      {ic:'cad',nome:'CAD',sec:'#secCAD'},
      {ic:'ponto',nome:'Ponto',act:()=>actTool('point')},
      {ic:'linha',nome:'Linha',act:()=>actTool('line')},
      {ic:'poligono',nome:'Polígono',act:()=>actTool('poly')},
      {ic:'poligono',nome:'Formas',act:b=>formaMenu(b)},
      {ic:'hachura',nome:'Hachura',act:()=>cadHatchOpen()},
    ]},
    {label:'Editar (em breve)', it:[
      {ic:'offset',nome:'Offset',soon:1},{ic:'buffer',nome:'Buffer',soon:1},
      {ic:'aparar',nome:'Aparar',soon:1},{ic:'estender',nome:'Estender',soon:1},
    ]},
  ]},
  {id:'visualizacao', nome:'VISUALIZAÇÃO', view:'v3d', grupos:[
    {label:'Vistas', it:[
      {ic:'mapa2d',nome:'Mapa 2D',act:()=>switchView('map')},
      {ic:'visao3d',nome:'Visão 3D',act:()=>switchView('v3d')},
      {ic:'layout',nome:'Layout',act:(b)=>abreLayout(b)},
    ]},
    {label:'3D', it:[
      {ic:'mdt',nome:'Superfícies',secKey:'superf'},
      {ic:'medicao',nome:'Medição 3D',secKey:'medi'},
      {ic:'aparencia',nome:'Aparência',secKey:'apar'},
    ]},
    {label:'Navegação', it:[
      {ic:'zoomtotal',nome:'Zoom total',act:()=>{ if(typeof fitAll==='function') fitAll(); else emBreve('Zoom total'); }},
      {ic:'pan',nome:'Pan',act:()=>actTool('pan')},
    ]},
  ]},
  {id:'janela', nome:'JANELA', view:'map', grupos:[
    {label:'Painéis', it:[
      {ic:'adicionar-camada',nome:'Camadas',act:()=>{ const r=document.getElementById('right'); if(r) r.classList.toggle('open'); }},
      {ic:'comandos',nome:'Comandos',act:()=>actClick('btnCmd')},
    ]},
  ]},
  {id:'config', nome:'CONFIGURAÇÕES', view:'map', grupos:[
    {label:'Aparência', it:[
      {ic:'iconsz',nome:'Tamanho dos ícones',act:()=>abrePrefs()},
      {ic:'fonte',nome:'Fonte e tema',act:()=>abrePrefs()},
    ]},
    {label:'Painéis', it:[
      {ic:'adicionar-camada',nome:'Camadas',act:()=>{ const r=document.getElementById('right'); if(r) r.classList.toggle('open'); }},
      {ic:'comandos',nome:'Comandos',act:()=>actClick('btnCmd')},
    ]},
  ]},
  {id:'ajuda', nome:'AJUDA', view:'map', grupos:[
    {label:'Ajuda (em breve)', it:[
      {ic:'ajuda',nome:'Ajuda',soon:1},{ic:'manual',nome:'Manual',soon:1},
      {ic:'tutoriais',nome:'Tutoriais',soon:1},{ic:'sobre',nome:'Sobre',soon:1},
    ]},
  ]},
];

/* Organização CCMGIS 3.0. Nenhum comando da 2.0 é descartado: as categorias
   originais são reaproveitadas e Configurações é incorporada em Janela. */
(function organizaAlagis3(){
  const by=id=>CATS.find(c=>c.id===id);
  const projeto=by('projeto');
  if(projeto) projeto.grupos=[
    {label:'Projeto',it:[
      {ic:'novo-projeto',nome:'Novo Projeto',act:()=>startNewProjectWizard()},
      {ic:'abrir',nome:'Abrir',act:()=>actClick('projIn')},
      {ic:'salvar',nome:'Salvar',act:()=>saveProject(false)},
      {ic:'salvar-como',nome:'Salvar Como',act:()=>saveProject(true)},
    ]},
    {label:'Camadas',it:[
      {ic:'adicionar-camada',nome:'Camadas',act:()=>{const r=document.getElementById('right');if(r)r.classList.add('open')}},
      {ic:'tabela-atributos',nome:'Tabela',act:()=>{const L=activeLayer();if(L){S.activeId=L.id;openAttr()}else toast('Sem camada ativa')}},
      {ic:'identificar',nome:'Atributos',act:()=>actTool('info')},
    ]},
    {label:'Seleção',it:[
      {ic:'selecionar',nome:'Selecionar',act:()=>actTool('select')},
      {ic:'selecionar-poligono',nome:'Selecionar por Polígono',act:()=>actTool('selpoly')},
      {ic:'limpar-selecao',nome:'Limpar Seleção',act:()=>{
        try{if(typeof clearSelection==='function')clearSelection();else{S.selected=[];refreshUI()}}catch(e){actTool('select')}
      }},
    ]},
    {label:'Navegação',it:[
      {ic:'zoom-in',nome:'Zoom In',act:()=>map.zoomIn()},
      {ic:'zoom-out',nome:'Zoom Out',act:()=>map.zoomOut()},
      {ic:'pan',nome:'Pan',act:()=>actTool('pan')},
    ]},
    {label:'Análises',it:[
      {ic:'medir-distancia',nome:'Medir',act:()=>actTool('measure')},
      {ic:'perfil-longitudinal',nome:'Perfil',act:()=>{RIB_CAT_ATUAL='topografia';switchView('perfis')}},
      {ic:'calculo-volume',nome:'Volume',act:()=>{RIB_CAT_ATUAL='mineracao';switchView('map')}},
    ]},
    {label:'Terreno',it:[
      {ic:'mdt',nome:'MDT',act:()=>{RIB_CAT_ATUAL='topografia';switchView('geo')}},
      {ic:'curvas-nivel',nome:'Curvas de Nível',act:()=>{RIB_CAT_ATUAL='topografia';switchView('geo')}},
      {ic:'bacia-hidrografica',nome:'Hidrologia',act:()=>{RIB_CAT_ATUAL='hidrologia';switchView('hidro')}},
    ]},
    {label:'Mineração/Geotecnia',it:[
      {ic:'cava',nome:'Cava',act:b=>{
        RIB_CAT_ATUAL='mineracao';switchView('map');
        setTimeout(()=>{
          try{refreshCavaMineracao();}catch(e){}
          const sec=document.getElementById('secCavaMineracao');
          const ancora=[...document.querySelectorAll('#ribbon .rbtn')]
            .find(x=>x.textContent.trim()==='Cava')||b;
          if(sec&&ancora)ribbonOpen(sec,ancora,'Projeto geométrico da cava',true);
        },0);
      }},
      {ic:'sondagem',nome:'Sondagem',act:()=>{RIB_CAT_ATUAL='geologia';switchView('geo')}},
      {ic:'talude-geotecnia',nome:'Talude',act:()=>{RIB_CAT_ATUAL='geotecnia';switchView('perfis')}},
    ]},
    {label:'Sistema',it:[
      {ic:'opcoes',nome:'Configurações',act:()=>abrePrefs()},
      /* A prancha compacta da aba Projeto não tem uma célula exclusiva para
         publicação; usa o ícone oficial Compartilhar da biblioteca principal,
         que representa corretamente a entrega do portal ao cliente. */
      {ic:'compartilhar',nome:'Publicar',act:()=>actClick('btnPubOpen')},
    ]},
  ];
  const inicio={id:'inicio',nome:'INÍCIO',view:'map',grupos:[
    {label:'Camadas',it:[
      {ic:'adicionar-camada',nome:'Camadas',act:()=>{const r=document.getElementById('right');if(r)r.classList.add('open')}},
      {ic:'tabela',nome:'Tabela',act:()=>{const L=activeLayer();if(L){S.activeId=L.id;openAttr()}else toast('Sem camada ativa')}},
      {ic:'atributos',nome:'Atributos',act:()=>actTool('info')},
    ]},
    {label:'Seleção',it:[
      {ic:'selecionar',nome:'Selecionar',act:()=>actTool('select')},
      {ic:'selpoligono',nome:'Selecionar por polígono',act:()=>actTool('selpoly')},
      {ic:'limparselecao',nome:'Limpar seleção',act:()=>{if(typeof clearSelection==='function')clearSelection();else actTool('select')}},
    ]},
    {label:'Navegação',it:[
      {ic:'zoomin',nome:'Zoom In',act:()=>map.zoomIn()},
      {ic:'zoomout',nome:'Zoom Out',act:()=>map.zoomOut()},
      {ic:'zoomtotal',nome:'Zoom total',act:()=>fitAll()},
      {ic:'pan',nome:'Pan',act:()=>actTool('pan')},
    ]},
    {label:'Análises',it:[
      {ic:'medicao',nome:'Medir',act:()=>actTool('measure')},
      {ic:'perfil',nome:'Perfil',act:()=>{RIB_CAT_ATUAL='topografia';switchView('perfis')}},
      {ic:'volume',nome:'Volume',act:()=>{RIB_CAT_ATUAL='mineracao';switchView('map')}},
    ]},
  ]};
  const barragens={id:'barragens',nome:'BARRAGENS',view:'perfis',grupos:[
    {label:'Implantação',it:[
      {ic:'barragem',nome:'Barragem',act:b=>ribMiniMenu(b,'Barragens e estruturas',[
        {nome:'Caixa de retenção / bacia',run:()=>actClick('btnBacia')},
        {nome:'Abrir ferramentas geotécnicas',secKey:'caixa'},
      ])},
      {ic:'talude',nome:'Talude e bermas',secKey:'caixa'},
      {ic:'perfilres',nome:'Seção construtiva',secKey:'construt'},
    ]},
    {label:'Geotecnia',it:[
      {ic:'estabilidade',nome:'Estabilidade (FS)',secKey:'bishop'},
      {ic:'bishop',nome:'Bishop',secKey:'bishop'},
      {ic:'perfil',nome:'Perfil',act:()=>switchView('perfis')},
    ]},
    {label:'Hidrologia',it:[
      {ic:'bacia',nome:'Bacia hidrográfica',act:()=>{RIB_CAT_ATUAL='hidrologia';switchView('hidro')}},
      {ic:'fluxo',nome:'Drenagem',act:()=>{RIB_CAT_ATUAL='hidrologia';switchView('hidro')}},
    ]},
  ]};
  const drone={id:'drone',nome:'DRONE',view:'map',grupos:[
    {label:'Fotogrametria',it:[
      {ic:'drone',nome:'Drone',soon:1},{ic:'missao',nome:'Planejar voo',soon:1},
      {ic:'imagem',nome:'Fotos',act:()=>actClick('fileIn')},{ic:'mosaico',nome:'Ortomosaico',act:()=>actClick('fileIn')},
    ]},
    {label:'Produtos',it:[
      {ic:'mdt',nome:'MDT / DSM',act:()=>actClick('fileIn')},
      {ic:'relatorio',nome:'Relatório de voo',soon:1},
    ]},
  ]};
  const lidar={id:'lidar',nome:'LIDAR',view:'map',grupos:[
    {label:'Nuvem de pontos',it:[
      {ic:'lidar',nome:'LAS / LAZ',soon:1},{ic:'ponto',nome:'Nuvem de pontos',soon:1},
      {ic:'filtro',nome:'Classificar',soon:1},{ic:'clip',nome:'Recortar nuvem',soon:1},
    ]},
    {label:'Superfícies',it:[
      {ic:'tin',nome:'Malha 3D',act:()=>{RIB_CAT_ATUAL='topografia';switchView('geo')}},
      {ic:'mdt',nome:'Gerar MDT',act:()=>{RIB_CAT_ATUAL='topografia';switchView('geo')}},
    ]},
  ]};
  const jan=by('janela'),cfg=by('config'),vis=by('visualizacao');
  if(jan&&cfg) jan.grupos=[...(jan.grupos||[]),...(cfg.grupos||[])];
  if(vis) vis.grupos=[
    {label:'Vistas',it:[
      {ic:'mapa2d',nome:'Mapa 2D',act:()=>switchView('map')},
      {ic:'visao3d',nome:'Visão 3D',act:()=>switchView('v3d')},
      {ic:'layout',nome:'Layout',act:()=>abreLayout()},
    ]},
    {label:'Cena 3D',it:[
      {ic:'mdt',nome:'Superfícies',secKey:'superfícies'},
      {ic:'imagem',nome:'Textura RGB',secKey:'aparência'},
      {ic:'talude',nome:'Exagero vertical',secKey:'aparência'},
      {ic:'aparencia',nome:'Aparência',secKey:'aparência'},
    ]},
    {label:'Renderização',it:[
      {ic:'visao3d',nome:'Atualizar cena',act:()=>{switchView('v3d');setTimeout(()=>{try{mina3DAuto(true);}catch(e){}},30);}},
      {ic:'medicao',nome:'Medição 3D',secKey:'medição'},
      {ic:'zoomtotal',nome:'Enquadrar',act:()=>{switchView('v3d');setTimeout(()=>{try{if(typeof v3Fit==='function')v3Fit();else mina3DAuto(true);}catch(e){}},30);}},
    ]},
    {label:'Saída',it:[
      {ic:'imprimir',nome:'Capturar vista',act:()=>{switchView('v3d');emBreve('Capturar vista 3D')}},
      {ic:'configuracoes',nome:'Configurações',secKey:'aparência'},
    ]},
  ];
  /* CIVIL: estrada e alinhamento automático A→B pelo menor movimento
     de terra (o traçado é escolhido pelo corte/aterro, não pela reta) */
  const civil={id:'civil',nome:'CIVIL',view:'map',grupos:[
    {label:'Estrada',it:[
      {ic:'estrada',nome:'Estrada',sec:'#secCivil'},
      {ic:'alinhamento',nome:'Alinhar A→B',act:()=>actClick('btnCivAlinha')},
      {ic:'greide',nome:'Perfil da estrada',act:()=>actClick('btnCivProfile')},
    ]},
    {label:'Pontos',it:[
      {ic:'ponto',nome:'Ponto A',act:()=>actClick('btnCivA')},
      {ic:'ponto',nome:'Ponto B',act:()=>actClick('btnCivB')},
    ]},
  ]};
  /* Drone e LiDAR saem da barra; Visualização também (já tem aba própria) */
  /* Projeto + Arquivo + Início viram uma única porta de entrada. */
  /* MEIO AMBIENTE — estudo de favorabilidade para seleção de áreas. Fica
     entre HIDROLOGIA e GEOTECNIA porque o estudo consome as camadas de
     restrição (UC, TI, APP) e alimenta a decisão locacional. */
  const ambiente={id:'ambiente',nome:'MEIO AMBIENTE',view:'map',grupos:[
    {label:'Favorabilidade',it:[
      {ic:'restricao',nome:'Estudo de Favorabilidade',sec:'#secFavor'},
      {ic:'restricao',nome:'Critérios sugeridos',act:()=>{ if(typeof favorPreset==='function') favorPreset(); }},
      {ic:'relatorio',nome:'Relatório',act:()=>actClick('btnFavorRel')},
    ]},
  ]};
  const ordem=['inicio','gis','topografia','geologia','mineracao','hidrologia',
    'ambiente','geotecnia','barragens','civil','analises','cad','janela','ajuda'];
  const extras={inicio,barragens,civil,ambiente};
  const novos=ordem.map(id=>extras[id]||by(id)).filter(Boolean);
  CATS.splice(0,CATS.length,...novos);
})();

/* CCMGIS 3.0 — organização visual literal da prancha 4K.
   As funções antigas permanecem no código; estas famílias definem primeiro a
   nova interface. Botões marcados como visual recebem implementação aos poucos. */
(function aplicaBibliotecaPng4K(){
  const cat=id=>CATS.find(c=>c.id===id);
  const V=(ic,nome)=>({ic,nome,visual:1});
  const G=(label,arr)=>({label,it:arr.map(x=>V(x[0],x[1]))});
  const set=(id,grupos)=>{const c=cat(id);if(c)c.grupos=grupos};
  set('inicio',[
    /* Primeiro grupo reproduz a hierarquia visual indicada pelo usuário. */
    G('Projeto',[['novo-projeto','Novo Projeto'],['abrir','Abrir'],['salvar','Salvar'],['salvar-como','Salvar Como']]),
    G('Dados e saída',[['importar','Importar'],['exportar','Exportar'],['projetos-recentes','Recuperar'],['imprimir','Layout']]),
    /* A colaboração pertence ao projeto inteiro, não somente à Geologia.
       O módulo carregado ao fim da montagem implementa as salas e mantém o
       fluxo local intacto quando o HTML é usado fora do portal Firebase. */
    G('Colaboração',[['sala-projeto','Sala do Projeto'],['convidar-colaborador','Convidar'],['sincronizar-colaboracao','Sincronizar'],['historico-colaboracao','Histórico']]),
    G('Navegação',[['zoom-in','Zoom In'],['zoom-out','Zoom Out'],['zoom-total','Zoom Total'],['zoom-anterior','Voltar Vista'],['zoom-proximo','Avançar Vista'],['pan','Pan']]),
    G('Vista',[['centralizar','Centralizar'],['atualizar','Atualizar'],['tela-cheia','Tela Cheia']]),
    G('Seleção',[['selecionar','Selecionar'],['selecionar-multiplos','Seleção Múltipla'],['selecionar-poligono','Por Polígono'],['limpar-selecao','Limpar Seleção']]),
  ]);
  set('gis',[
    /* A faixa antiga de Gerenciamento/Consulta ocupava quase toda a largura
       com ações já disponíveis na árvore de camadas. Esta versão mantém só
       as ações recorrentes e dá destaque ao geoprocessamento solicitado. */
    G('Camadas',[['adicionar-camada','Adicionar'],['propriedades','Propriedades'],['renomear','Renomear'],['visibilidade','Visibilidade'],['filtro','Filtro']]),
    /* "Mesclar Camadas" existia só no painel e na busca de comandos: sem
       botão na faixa, ninguém achava. Entra junto dos demais vetoriais, ao
       lado do "Mesclar Rasters" do grupo de raster. */
    G('Vetorial',[['mesclar-camadas','Mesclar Camadas'],['poligonizar-gis','Poligonizar Linhas'],['dissolver-gis','Dissolver'],['extrair-limite-gis','Limite da Camada'],['buffer','Buffer'],['intersecao','Interseção'],['uniao','União']]),
    G('Raster e TIN',[['poligonizar-raster-gis','Poligonizar Raster'],['mosaico','Mesclar Rasters'],['corte','Cortar Raster/TIN'],['declividade','Declividade'],['aspecto','Aspecto'],['sombreado','Relevo Sombreado'],['curvas-nivel','Curvas de Nível']]),
    G('Superfícies',[['intersecao-superficies','Interseção A × B']]),
    G('Pesquisa mineral',[['requerimento-pesquisa','Requerimento de Pesquisa']]),
    G('Serviços',[['wms','WMS'],['anm','ANM'],['osm','OpenStreetMap'],['sgb','Geologia SGB'],['mde','MDE global'],['car','CAR'],['uc','Ambiental ICMBio'],['ana','Hidro ANA'],['est','Estaduais']]),
  ]);
  set('topografia',[
    /* Aba enxugada a pedido do usuário: saíram MDT, MDS, Curvas de Nível e
       Quebrar Linha. Das curvas ficam só duas, com os nomes que ele usa:
       PRINCIPAIS (antigo preset 'mestre') e SECUNDÁRIAS (antigo
       'intermediarias'); 'curvas-indice' foi descartado por ser a mesma
       coisa que as principais. */
    /* Ordem pedida: importar a nuvem vem antes; depois a superfície RASTER
       (grade, p/ drenagem e produtos de imagem) e a superfície TIN (leve e
       fiel, prioritária no 3D, como Surpac/Deswik). Ícones antigos: 'las',
       'mdt' e 'triangular-tin' já existem na cartela. */
    G('Superfícies',[['lidar','Importar LiDAR'],['mdt','Superfície Raster'],['triangular-tin','Superfície TIN'],['pontos-cotados','Pontos Cotados']]),
    G('Extração',[['extrair-solidos','Extração de Sólidos']]),
    G('Perfis e eixo',[['perfil-longitudinal','Perfil Longitudinal'],['secoes-transversais','Seções Transversais'],['perfil-transversal','Perfil Transversal'],['regua','Progressiva'],['talude','Talude']]),
    G('Terreno',[['grade','Grade'],['declividade','Declividade'],['aspecto','Aspecto'],['exposicao-solar','Exposição Solar'],['sombreado','Sombreado']]),
    G('Curvas',[['curvas-mestre','Curvas Principais'],['curvas-intermediarias','Curvas Secundárias'],['curvas-depressao','Curvas Depressão'],['editar-curvas','Editar Curvas']]),
  ]);
  set('geologia',[
    G('Campo',[['mapeamento-campo','Adotar Camada'],['ficha-campo','Ficha Geológica']]),
    G('Mapeamento',[['litologia','Litologia'],['contato-geologico','Contato Geológico'],['falha','Falha'],['dobra','Traço Axial de Dobra'],['acamamento','Acamamento']]),
    G('Estruturas',[['xistosidade','Xistosidade'],['fratura','Fratura'],['veio','Veio'],['dique','Dique'],['zona-cisalhamento','Zona de Cisalhamento']]),
    G('Investigação',[['sondagem','Sondagem'],['spt','SPT'],['trincheira','Trincheira'],['afloramento','Afloramento'],['ponto-amostra','Ponto de Amostra']]),
    G('Importar sondagens',[['importar-furos-string','Furos · String Surpac'],['importar-furos-csv','Furos · CSV']]),
    G('Modelo',[['log-sondagem','Log Sondagem'],['testemunho','Testemunho'],['dominio-geologico','Domínio Geológico'],['surpac-superficies','Superfícies / Sólidos Surpac'],['modelo-geologico-3d','Visualização Geológica 3D'],['secao-geologica','Seção Geológica']]),
    G('Estrutural',[['mapa-estrutural','Mapa Estrutural'],['estereograma','Estereograma'],['lineacao','Lineação'],['foliacao','Foliação'],['plunging','Eixo de Dobra']]),
  ]);
  set('mineracao',[
    G('Sólidos e volumes',[['volume-corte-aterro','Sólido'],['volume-superficies','Restrições'],['calculo-volume','Cubagem'],['balanco-massa','Balanço'],['modelo-blocos','Blocos']]),
    G('Pilhas de estoque',[['pilha','Desenhar Saia'],['estoque','Volume da Pilha']]),
    G('Cava',[['cava-parametrica','Cava Paramétrica'],['congelar-cava','Congelar'],['crista-pe','Crista e Pé'],['banco','Banco'],['projecoes','Projeções']]),
    G('Recursos',[['estimativa','Estimativa'],['reserva','Reserva'],['recursos','Recursos'],['teor','Teor']]),
    G('Planejamento',[['secao-mina','Seção de Mina'],['long-section','Long Section'],['controle-producao','Controle de Produção'],['planejamento','Planejamento'],['relatorio-lavra','Relatório de Lavra']]),
  ]);
  set('hidrologia',[
    G('Dados de chuva',[['serie-historica','Série Histórica'],['extremos-gev','Extremos GEV'],['idf','Curva IDF'],['chuva','Chuva de Projeto'],['evaporacao','Evaporação']]),
    G('Terreno hidrológico · D8',[['mde-hidrologico','Carregar MDE'],['preencher-depressoes','Preencher Depressões'],['cn','Determinar CN'],['direcao-fluxo','Direção de Fluxo'],['acumulacao-fluxo','Acumulação de Fluxo'],['rede-drenagem','Rede de Drenagem'],['sombreado-hidrologico','Sombreado']]),
    G('Bacia e resposta',[['bacia-hidrografica','Delimitar Bacia'],['rio-curso','Curso d’Água'],['declividade-hidrica','Declividade Hidráulica'],['tempo-concentracao','Tempo de Concentração']]),
    G('Hidráulica',[['secao-hidraulica','Seção Hidráulica'],['obra-arte-corrente','Obra de Arte Corrente'],['bueiro','Drenagem']]),
    G('Inundação',[['inundacao','Simular Inundação'],['mancha-inundacao','Mancha de Inundação']]),
    /* Taludes, bermas e chegada da rampa são etapas internas de “Gerar
       Caixa”. Não aparecem como comandos independentes para evitar dois
       fluxos diferentes produzindo a mesma obra. */
    G('Caixa de retenção',[['caixa-retencao','Gerar Caixa'],['relatorio-geotecnico','Memorial da Caixa']]),
  ]);
  set('geotecnia',[
    G('Estabilidade',[['talude-geotecnia','Talude'],['secao-geotecnica','Seção Geotécnica'],['estabilidade-fs','Estabilidade (FS)'],['nivel-agua','NA (Nível d’Água)'],['dreno','Dreno']]),
    G('Instrumentação',[['piezometro','Piezômetro'],['inclinometro','Inclinômetro'],['marco-superficial','Marco Superficial'],['instrumentacao','Instrumentação'],['monitoramento','Monitoramento']]),
    G('Comportamento',[['deformacao','Deformação'],['analise-sismica','Análise Sísmica'],['relatorio-geotecnico','Relatório Geotécnico']]),
  ]);
  set('barragens',[
    G('Barragens',[['barragem','Barragem'],['dique-geotecnia','Dique'],['talude-geotecnia','Talude'],['secao-geotecnica','Seção Geotécnica'],['estabilidade-fs','Estabilidade (FS)']]),
    G('Monitoramento',[['piezometro','Piezômetro'],['inclinometro','Inclinômetro'],['marco-superficial','Marco Superficial'],['dreno','Dreno'],['nivel-agua','NA (Nível d’Água)']]),
  ]);
  set('drone',[
    G('Aquisição',[['drone','Drone'],['planejar-voo','Planejar Voo'],['missao','Missão'],['fotos','Fotos'],['rtk-ppk','RTK / PPK']]),
    G('Produtos',[['fotogrametria','Fotogrametria'],['ortomosaico','Ortomosaico'],['dsm','DSM'],['nuvem-densa','Nuvem Densa'],['relatorio-voo','Relatório de Voo']]),
    G('Processamento',[['gcp','GCP'],['check-point','Check Point'],['camera','Câmera'],['processar','Processar'],['metadados-drone','Metadados']]),
  ]);
  set('lidar',[
    G('Nuvem de pontos',[['nuvem-pontos','Nuvem de Pontos'],['las','LAS'],['laz','LAZ'],['classificar-pontos','Classificar Pontos'],['filtros-lidar','Filtros']]),
    G('Processamento',[['recortar-nuvem','Recortar Nuvem'],['regiao-interesse','Região de Interesse'],['amostragem','Amostragem'],['densidade','Densidade'],['converter-lidar','Converter']]),
    G('Produtos',[['perfil-nuvem','Perfil na Nuvem'],['voxel','Voxel'],['malha-3d','Malha 3D'],['intensidade','Intensidade'],['colorizar-rgb','Colorizar (RGB)']]),
  ]);
  set('analises',[
    G('Terreno',[['declividade','Declividade'],['aspecto','Aspecto'],['exposicao-solar','Exposição Solar'],['sombreado','Sombreado'],['grade','Grade']]),
    G('Medição',[['medir-distancia','Medir Distância'],['medir-area','Medir Área'],['estatisticas','Estatísticas'],['calculadora','Calculadora'],['regua','Régua']]),
    G('Transformação',[['georreferenciar','Georreferenciar'],['converter-crs','Converter CRS'],['transformar','Transformar'],['unidades','Unidades'],['metadados','Metadados']]),
  ]);
  set('cad',[
    G('Desenho',[['ponto','Ponto'],['linha','Linha'],['polilinha','Polilinha'],['poligono','Polígono'],['retangulo','Retângulo'],['circulo','Círculo'],['elipse','Elipse'],['arco','Arco'],['spline','Spline'],['texto','Texto']]),
    G('Edição',[['excluir','Excluir'],['mover','Mover'],['copiar','Copiar'],['offset','Offset'],['buffer','Buffer'],['intersecao','Interseção'],['uniao','União'],['diferenca','Diferença'],['clip','Clip'],['dissolver','Dissolver']]),
    G('Geometria',[['explodir','Explodir'],['unir','Unir'],['simplificar','Simplificar'],['suavizar','Suavizar'],['converter','Converter']]),
  ]);
  set('visualizacao',[
    G('Vistas',[['selecionar','Mapa 2D'],['modelo-geologico-3d','Visão 3D'],['layout','Layout']]),
    G('Cena 3D',[['mdt','Superfícies'],['imagem','Textura RGB'],['talude','Exagero Vertical'],['sombreado','Aparência']]),
    G('Renderização',[['malha-3d','Atualizar cena'],['medir-distancia','Medição 3D'],['zoom-total','Enquadrar Cena'],['tela-cheia','Tela Cheia']]),
    G('Saída',[['png','Capturar Vista PNG'],['opcoes','Configurações 3D']]),
  ]);
  set('janela',[
    G('Ferramentas',[['calculadora','Calculadora'],['regua','Régua'],['grade-ferramenta','Grade'],['alinhar','Alinhar'],['snap','Snap']]),
    G('Configuração',[['georreferenciar','Georreferenciar'],['converter-crs','Converter CRS'],['transformar','Transformar'],['unidades','Unidades'],['metadados','Metadados']]),
    G('Automação',[['script-python','Script (Python)'],['macro','Macro'],['personalizar','Personalizar'],['atalhos','Atalhos'],['opcoes','Opções']]),
  ]);
  set('ajuda',[
    G('Ajuda e suporte',[['ajuda','Ajuda'],['manual','Manual'],['tutoriais','Tutoriais'],['novidades','Novidades'],['suporte','Suporte'],['sobre','Sobre'],['licenca','Licença'],['verificar-atualizacoes','Verificar Atualizações'],['feedback','Feedback'],['ativar','Ativar']]),
  ]);
})();

/* Liga a estética da biblioteca 4K às ferramentas reais já existentes.
   O catálogo visual continua sendo a fonte da organização e dos ícones, mas
   Arquivo e CAD deixam de ser botões decorativos. */
(function integraComandosAlagis3(){
  /* O catálogo tem centenas de itens. Antes, cada vínculo percorria todas as
     categorias e um segundo vínculo para a mesma chave substituía o primeiro
     silenciosamente. O índice torna a inicialização O(1) por comando; o
     orquestrador também audita chaves repetidas antes de montar o HTML. */
  const comandosPorChave=new Map();
  CATS.forEach(cat=>(cat.grupos||[]).forEach(grp=>(grp.it||[]).forEach(cmd=>
    comandosPorChave.set(cat.id+'\u0000'+cmd.ic,cmd))));
  const comando=(catId,icone,acao)=>{
    const cmd=comandosPorChave.get(catId+'\u0000'+icone); if(!cmd) return false;
    cmd.visual=0; cmd.soon=0; cmd.act=acao; return true;
  };
  const editor=(fn)=>()=>{
    let q,items;
    try{q=GeoMineCommandSelection.capture({stamp:false});items=GeoMineCommandSelection.uniqueItems(q);}
    catch(e){toast(e.message);return;}
    if(items.length>1){toast('Este comando edita uma feição por vez. Mantenha somente uma selecionada.');return;}
    const item=items[0],L=item?.L||activeLayer();
    const collabBloqueada=!!(L&&typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false));
    if(L&&(collabBloqueada||L.locked)){
      if(collabBloqueada)collabCanEditLayer(L,true);
      else toast('A camada "'+L.name+'" está bloqueada');
      return;
    }
    // Sincroniza o editor com o clique atual antes de executar um comando.
    // Uma seleção antiga não pode tomar o lugar da feição recém-selecionada.
    if(typeof ED!=='undefined')ED.sel=item?{L:item.L,f:item.f,idx:item.idx}:null;
    if(typeof edLigar==='function' && (!window.ED || !ED.on)) edLigar(true,true);
    if(item){edSelecionar(item,true);S.selFeat={layer:item.L,layerId:item.L.id,idx:item.idx,partIdx:item.partIdx};}
    fn();
  };
  const nova=()=>startNewProjectWizard();
  const navHist={v:[],i:-1,lock:false};
  const navView=()=>{ const c=map.getCenter(); return {lat:c.lat,lng:c.lng,z:map.getZoom()}; };
  const navPush=()=>{
    if(navHist.lock){ navHist.lock=false; return; }
    const v=navView(), a=navHist.v[navHist.i];
    if(a && Math.abs(a.lat-v.lat)<1e-9 && Math.abs(a.lng-v.lng)<1e-9 && a.z===v.z) return;
    navHist.v.splice(navHist.i+1);
    navHist.v.push(v);
    if(navHist.v.length>40) navHist.v.shift();
    navHist.i=navHist.v.length-1;
  };
  const navGo=d=>{
    const ni=navHist.i+d;
    if(ni<0 || ni>=navHist.v.length){ toast(d<0?'Não há extensão anterior':'Não há extensão seguinte'); return; }
    navHist.i=ni; navHist.lock=true;
    const v=navHist.v[ni]; map.setView([v.lat,v.lng],v.z,{animate:false});
  };
  const navClearSelection=()=>{
    if(typeof mselClear==='function') mselClear(true);
    S.selFeat=null; clearVertices(); refreshUI(); setTool('select');
  };
  const navSelectLayer=()=>{
    const L=activeLayer();
    if(!L){ toast('Selecione uma camada vetorial'); return; }
    S.msel.items=L.features.map((f,idx)=>({layerId:L.id,idx})).filter((x,i)=>L.features[i]&&L.features[i].geom&&featureVisible(L,L.features[i]));
    mselHL(); mselCount(); toast(`${S.msel.items.length} feição(ões) selecionada(s) na camada`);
  };
  const navSelectView=()=>{
    const b=map.getBounds();
    mselSelect([[b.getSouth(),b.getWest()],[b.getNorth(),b.getWest()],
      [b.getNorth(),b.getEast()],[b.getSouth(),b.getEast()]]);
  };
  const navInvert=()=>{
    const atuais=new Set((S.msel.items||[]).map(x=>`${x.layerId}:${x.idx}`));
    const inv=[];
    S.layers.filter(L=>L.visible).forEach(L=>L.features.forEach((f,idx)=>{
      if(f&&f.geom&&featureVisible(L,f)&&!atuais.has(`${L.id}:${idx}`)) inv.push({layerId:L.id,idx});
    }));
    S.msel.items=inv; mselHL(); mselCount();
    toast(`${inv.length} feição(ões) na seleção invertida`);
  };
  const navFullscreen=()=>{
    const el=document.getElementById('main');
    if(document.fullscreenElement) document.exitFullscreen&&document.exitFullscreen();
    else el&&el.requestFullscreen&&el.requestFullscreen();
  };
  const nav3D=async tipo=>{
    switchView('v3d');
    try{
      if((typeof V3==='undefined'||!V3.cam) && typeof build3D==='function') await build3D();
      if(typeof V3==='undefined'||!V3.cam){ toast('Carregue uma superfície para navegar em 3D'); return; }
      if(tipo==='rotacionar') V3.theta+=Math.PI/12;
      else V3.phi=Math.max(-1.35,Math.min(1.35,V3.phi+Math.PI/18));
      v3ApplyCam();
    }catch(e){ toast('Não foi possível preparar a navegação 3D'); }
  };
  const gisNode=()=>{
    const L=activeLayer(); if(L) return {t:'L',id:L.id,o:L};
    const r=S.selRaster;
    if(r && (S.rasters||[]).includes(r)) return {t:'R',id:r.id,o:r};
    if(S.img && r===S.img) return {t:'I',id:0,o:S.img};
    return null;
  };
  const gisNeedNode=()=>{
    const n=gisNode();
    if(!n) toast('Selecione uma camada, superfície ou ortofoto');
    return n;
  };
  const gisMove=dir=>{
    const n=gisNeedNode(); if(!n) return;
    const key=nodeKey(n.t,n.id), itens=displayList();
    const i=itens.findIndex(x=>x.n&&nodeKey(x.n.t,x.n.id)===key);
    if(i<0) return;
    if(dir<0 && i===0){ toast('A camada já está no topo'); return; }
    if(dir>0 && i===itens.length-1){ toast('A camada já está na base'); return; }
    reorderModel('node',key,dir<0?i-1:i+2);
    toast(dir<0?'Camada movida para cima':'Camada movida para baixo');
  };
  const gisRemove=()=>{
    const n=gisNeedNode(); if(!n) return;
    const nome=n.o.name||'ortofoto';
    if(!confirm(`Remover "${nome}"?`)) return;
    if(n.t==='L') deleteVectorLayer(n.o);
    else if(n.t==='R') deleteRaster(n.o);
    else document.getElementById('btnDropImg')?.click();
  };
  const gisVisibility=()=>{
    const n=gisNeedNode(); if(!n) return;
    nodeSetVis(n,n.o.visible===false); zApply(); refreshUI();
    toast(n.o.visible===false?'Camada ocultada':'Camada visível');
  };
  const gisRename=()=>{
    const n=gisNeedNode(); if(!n) return;
    if(n.t==='L'&&!collabCanEditLayer(n.o,true))return;
    const nome=prompt('Novo nome:',n.o.name||'Camada');
    if(!nome||!nome.trim()) return;
    n.o.name=nome.trim(); refreshUI(); toast('Camada renomeada');
  };
  const gisDuplicate=()=>{
    const n=gisNeedNode(); if(!n) return;
    if(n.t==='I'){ toast('O projeto aceita uma ortofoto principal por vez'); return; }
    if(n.t==='L'){
      const src=n.o;
      const cp=addLayer({name:src.name+' — cópia',gtype:src.gtype,crs:src.crs,
        features:JSON.parse(JSON.stringify(src.features)),fields:JSON.parse(JSON.stringify(src.fields)),
        color:src.color,labelField:src.labelField,labelFields:Array.isArray(src.labelFields)?src.labelFields.slice():null,
        lbl:JSON.parse(JSON.stringify(src.lbl||{})),src:src.src});
      cp.weight=src.weight; cp.fill=src.fill; cp.sym=JSON.parse(JSON.stringify(src.sym));
      drawLayer(cp); refreshUI();
    }else{
      const src=n.o, cp=Object.assign({},src,{id:uid++,name:src.name+' — cópia',
        overlay:null,style:JSON.parse(JSON.stringify(src.style||{})),_geomInfo:src._geomInfo});
      S.rasters.unshift(cp); renderRaster(cp); S.selRaster=cp; refreshUI(); zApply();
    }
    toast('Camada duplicada');
  };
  const gisGroup=()=>{
    const n=gisNeedNode(); if(!n) return;
    const nome=prompt('Nome do novo grupo:','Grupo '+gid); if(!nome) return;
    const g={id:gid++,name:nome.trim()||('Grupo '+gid),collapsed:false};
    S.groups.push(g); n.o.groupId=g.id; refreshUI(); toast('Camada agrupada em "'+g.name+'"');
  };
  const gisUngroup=()=>{
    const n=gisNeedNode(); if(!n) return;
    if(n.o.groupId==null){ toast('A camada não pertence a um grupo'); return; }
    n.o.groupId=null; refreshUI(); toast('Camada desagrupada');
  };
  const gisGroupFold=collapsed=>{
    const n=gisNode();
    const g=n&&n.o.groupId!=null?S.groups.find(x=>x.id===n.o.groupId):null;
    if(g) g.collapsed=collapsed;
    else S.groups.forEach(x=>x.collapsed=collapsed);
    refreshUI(); toast(collapsed?'Grupo(s) recolhido(s)':'Grupo(s) expandido(s)');
  };
  const gisSaveStyle=async()=>{
    const n=gisNeedNode(); if(!n) return;
    const estilo=n.t==='L'
      ? {type:'ALAGIS_STYLE',version:1,layerType:n.o.gtype,sym:n.o.sym,
          color:n.o.color,weight:n.o.weight,fill:n.o.fill,labelField:n.o.labelField,lbl:n.o.lbl}
      : {type:'ALAGIS_RASTER_STYLE',version:1,style:n.o.style||{},visible:n.o.visible!==false};
    const nome=(n.o.name||'camada').replace(/[^\w.-]+/g,'_')+'.alagis-style.json';
    try{
      await download(new Blob([JSON.stringify(estilo,null,2)],{type:'application/json'}),nome);
      toast('Simbologia salva');
    }catch(e){ if(!e||e.name!=='AbortError') toast('Não foi possível salvar a simbologia'); }
  };
  const gisStats=()=>{
    const L=activeLayer();
    if(!L){ toast('Selecione uma camada vetorial para calcular estatísticas'); return; }
    const t=layerTotals(L), linhas=[
      `Camada: ${L.name}`,`Tipo: ${L.gtype}`,`Feições: ${L.features.length}`,
      L.gtype==='polygon'?`Área total: ${fmtArea(t.area)}`:`Comprimento total: ${fmtLen(t.comp)}`
    ];
    const campos=(L.fields||[]).map(f=>typeof f==='string'?f:f.name).filter(Boolean);
    campos.forEach(c=>{
      const v=L.features.map(f=>+(f.props&&f.props[c])).filter(Number.isFinite);
      if(!v.length) return;
      let mn=Infinity,mx=-Infinity,soma=0;
      v.forEach(x=>{if(x<mn)mn=x;if(x>mx)mx=x;soma+=x});
      linhas.push(`${c}: mín ${fmt(mn)} · máx ${fmt(mx)} · média ${fmt(soma/v.length)}`);
    });
    alert(linhas.join('\n'));
  };
  try{ navPush(); map.on('moveend',navPush); }catch(e){}

  comando('inicio','novo-projeto',nova);
  comando('inicio','abrir',()=>openProjectFile());
  comando('inicio','salvar',()=>saveProject(false));
  comando('inicio','salvar-como',()=>saveProject(true));
  comando('inicio','fechar',()=>{
    if(!confirm('Fechar o projeto atual? Salve antes de continuar.')) return;
    try{ window.close(); }catch(e){}
    setTimeout(()=>toast('O navegador bloqueou o fechamento desta aba. Você pode fechá-la com segurança.'),80);
  });
  comando('inicio','importar',()=>actClick('fileIn'));
  comando('inicio','exportar',()=>actClick('btnExport'));
  comando('inicio','imprimir',()=>switchView('layout'));
  comando('inicio','pdf',()=>{ switchView('layout'); setTimeout(()=>exportLayoutPDF(),80); });
  comando('inicio','configurar-pagina',()=>switchView('layout'));
  comando('inicio','projetos-recentes',()=>recuperarAutosave());
  comando('inicio','propriedades-projeto',()=>abrePrefs());
  comando('inicio','compartilhar',()=>actClick('btnPubOpen'));
  comando('inicio','compactar',()=>saveProject(true));
  comando('inicio','descompactar',()=>openProjectFile());
  comando('inicio','sala-projeto',()=>{
    if(window.GeoMineCollaboration?.open)window.GeoMineCollaboration.open('room');
    else toast('Colaboração disponível na versão online do GeoMine');
  });
  comando('inicio','convidar-colaborador',()=>{
    if(window.GeoMineCollaboration?.open)window.GeoMineCollaboration.open('people');
    else toast('Colaboração disponível na versão online do GeoMine');
  });
  comando('inicio','sincronizar-colaboracao',()=>{
    if(window.GeoMineCollaboration?.syncActiveLayer)window.GeoMineCollaboration.syncActiveLayer();
    else toast('Colaboração disponível na versão online do GeoMine');
  });
  comando('inicio','historico-colaboracao',()=>{
    if(window.GeoMineCollaboration?.open)window.GeoMineCollaboration.open('history');
    else toast('Colaboração disponível na versão online do GeoMine');
  });

  comando('inicio','zoom-in',()=>map.zoomIn());
  comando('inicio','zoom-out',()=>map.zoomOut());
  comando('inicio','zoom-total',()=>fitAll());
  comando('inicio','zoom-anterior',()=>navGo(-1));
  comando('inicio','zoom-proximo',()=>navGo(1));
  comando('inicio','pan',()=>{
    actTool('select');
    toast('Pan: mantenha pressionado o botão central/scroll e arraste o mapa');
  });
  comando('inicio','extensao-anterior',()=>navGo(-1));
  comando('inicio','extensao-proxima',()=>navGo(1));
  comando('inicio','rotacionar',()=>nav3D('rotacionar'));
  comando('inicio','inclinar',()=>nav3D('inclinar'));
  comando('inicio','selecionar-vista',navSelectView);
  comando('inicio','selecionar-camada',navSelectLayer);
  comando('inicio','centralizar',()=>{
    const L=activeLayer(); if(L) fitLayer(L); else fitAll();
  });
  comando('inicio','atualizar',()=>{
    refreshUI(); map.invalidateSize(); updateReadout(map.getCenter()); updateScale();
    toast('Vista atualizada');
  });
  comando('inicio','tela-cheia',navFullscreen);
  comando('inicio','selecionar',()=>actTool('select'));
  comando('inicio','selecionar-multiplos',()=>actTool('selpoly'));
  comando('inicio','limpar-selecao',navClearSelection);
  comando('inicio','inverter-selecao',navInvert);
  comando('inicio','selecionar-poligono',()=>actTool('selpoly'));

  comando('gis','adicionar-camada',()=>actClick('fileIn'));
  comando('gis','remover-camada',gisRemove);
  comando('gis','mover-acima',()=>gisMove(-1));
  comando('gis','mover-abaixo',()=>gisMove(1));
  comando('gis','salvar-simbologia',gisSaveStyle);
  comando('gis','propriedades',()=>{
    const L=activeLayer();
    if(L){ openLayerProps(L); return; }
    const r=S.selRaster;
    if(r && (S.rasters||[]).includes(r)){ openRasProps(r); return; }
    if(S.img && (!r || r===S.img)){ openImgProps(); return; }
    toast('Selecione uma camada, superfície ou ortofoto para abrir as propriedades');
  });
  comando('gis','visibilidade',gisVisibility);
  comando('gis','bloquear',()=>{
    const L=activeLayer();
    if(!L){ toast('Selecione uma camada vetorial'); return; }
    setLayerFrozen(L,!L.locked);
  });
  comando('gis','renomear',gisRename);
  comando('gis','duplicar',gisDuplicate);
  comando('gis','agrupar',gisGroup);
  comando('gis','desagrupar',gisUngroup);
  comando('gis','expandir-grupo',()=>gisGroupFold(false));
  comando('gis','recolher-grupo',()=>gisGroupFold(true));
  comando('gis','filtro',()=>{
    const q=document.getElementById('layerSearch');
    if(q){ q.focus(); q.select(); toast('Digite o nome da camada para filtrar'); }
  });
  comando('gis','tabela-atributos',()=>openAttr());
  comando('gis','consulta-espacial',()=>setTool('selpoly'));
  comando('gis','consulta',()=>setTool('info'));
  comando('gis','identificar',()=>setTool('info'));
  comando('gis','estatisticas',gisStats);
  const abreGeoVetorial=(btn,alvo,titulo)=>{
    switchView('geo');
    try{refreshVecOpsPanel();}catch(e){}
    /* Cada comando abre somente a sua própria caixa. O nó real é movido
       temporariamente para o popover (não é clonado), preservando listeners,
       valores e resultado; ao fechar ele volta ao painel de origem. */
    const ferramenta=document.getElementById(alvo);
    if(!ferramenta){toast('Ferramenta de geoprocessamento não encontrada');return;}
    ribbonOpen(ferramenta,btn,titulo,true);
    setTimeout(()=>{
      const campo=ferramenta.querySelector('select,input,button');
      if(campo&&campo.focus)campo.focus({preventScroll:true});
    },40);
  };
  comando('gis','mesclar-camadas',btn=>{
    try{ refreshMergePanel(); }catch(e){}
    abreGeoVetorial(btn,'opMergeLayers','Mesclar camadas vetoriais');
    if(!(S.layers||[]).length) toast('Nenhuma camada vetorial carregada para mesclar');
  });
  comando('gis','poligonizar-gis',btn=>abreGeoVetorial(btn,'opCloseLines','Poligonizar linhas · criar polígonos'));
  comando('gis','poligonizar-raster-gis',btn=>{
    try{refreshVecOpsPanel();}catch(e){}
    const ferramenta=document.getElementById('opPolygonizeRaster');
    if(ferramenta)ferramenta.hidden=false;
    abreGeoVetorial(btn,'opPolygonizeRaster','Poligonizar raster · gerar polígonos e atributos');
    if(!(S.rasters||[]).some(r=>r&&r.d&&r.d.z))toast('Carregue ou gere primeiro um raster');
  });
  comando('gis','dissolver-gis',btn=>abreGeoVetorial(btn,'opDissolve','Dissolver polígonos'));
  comando('gis','extrair-limite-gis',btn=>abreGeoVetorial(btn,'opExtractBoundary','Extrair limite da camada'));
  comando('gis','buffer',()=>gisBuffer());
  comando('gis','intersecao',()=>gisBoolean('intersection'));
  comando('gis','uniao',()=>gisBoolean('union'));
  comando('gis','mosaico',btn=>{
    try{refreshMosaicPanel();}catch(e){}
    abreGeoVetorial(btn,'opMosaicRaster','Mesclar rasters / MDTs');
  });
  comando('gis','intersecao-superficies',btn=>{
    try{refreshIntersectPanel();}catch(e){}
    abreGeoVetorial(btn,'opIntersectSurfaces','Interseção de superfícies A × B');
  });
  comando('gis','corte',btn=>{
    const r=(S.selRaster&&(S.rasters||[]).includes(S.selRaster))?S.selRaster:null;
    const ehTin=!!(r&&(r.tinPuro||(r.d&&r.d.tin)));
    if(ehTin){
      openRasProps(r);
      setTimeout(()=>{
        const el=document.getElementById('rasTinFerr');
        if(el)el.scrollIntoView({block:'center',behavior:'smooth'});
      },40);
      return;
    }
    abreGeoVetorial(btn,'opClipRaster','Cortar TIN/Raster');
    if(r){
      setTimeout(()=>{
        const s=document.getElementById('clRaster');
        if(s){s.value=String(r.id);if(s.value!==String(r.id))s.value='';}
      },60);
    }
  });

  comando('cad','ponto',()=>actTool('point'));
  comando('cad','linha',()=>actTool('line'));
  comando('cad','polilinha',()=>actTool('line'));
  comando('cad','poligono',()=>actTool('poly'));
  comando('cad','retangulo',()=>formaArma('retangulo'));
  comando('cad','circulo',()=>formaArma('circulo'));
  comando('cad','elipse',()=>formaArma('elipse'));
  comando('cad','arco',()=>{ actTool('line'); toast('Arco: indique os vértices do traçado'); });
  comando('cad','spline',()=>{ actTool('line'); toast('Spline: desenhe a linha e aplique Suavizar'); });
  comando('cad','texto',()=>toast('Use a ferramenta Texto no Layout para inserir anotações'));

  comando('cad','excluir',editor(()=>edApagarFeicao()));
  /* O Mover valida camada por camada do conjunto (GeoMineDragMove.arm); o
     wrapper editor() olhava só a camada ativa e barrava a seleção múltipla. */
  comando('cad','mover',()=>{
    if(!window.GeoMineDragMove){ editor(()=>edTransform('mover'))(); return; }
    if(typeof edLigar==='function' && (!window.ED || !ED.on)) edLigar(true,true);
    edTransform('mover');
  });
  comando('cad','copiar',editor(()=>edTransform('copiar')));
  comando('cad','offset',editor(()=>edTransform('paralela')));
  comando('cad','buffer',()=>gisBuffer());
  comando('cad','intersecao',()=>gisBoolean('intersection'));
  comando('cad','uniao',()=>gisBoolean('union'));
  comando('cad','diferenca',()=>gisBoolean('difference'));
  /* CLIP ≠ INTERSEÇÃO: os dois davam a mesma geometria, mas o clip é
     ASSIMÉTRICO — B é só o molde e o resultado herda os ATRIBUTOS de A.
     Antes os campos da APP se perdiam no recorte. */
  comando('cad','clip',()=>gisBoolean('clip'));
  comando('cad','dissolver',()=>actClick('btnDs'));
  comando('cad','explodir',editor(()=>edExplodir()));
  comando('cad','unir',()=>edUnir());
  comando('cad','simplificar',()=>edAbreSimplificar());
  comando('cad','suavizar',()=>edAbreSuavizar());
  comando('cad','converter',()=>gisConverter());

  const abrePerfis=(btn,modo='longitudinal')=>{
    RIB_CAT_ATUAL='topografia';
    S.prof=S.prof||{}; S.prof.modo=modo;
    try{ refreshProfPanel(); }catch(e){}
    // Abrir o painel não troca a fonte escolhida pelo MDT de trabalho.
    // A sugestão inicial fica a cargo de refreshProfPanel.
    const p=document.getElementById('sidePerfis');
    if(p){
      let info=document.getElementById('prModeBanner');
      if(!info){ info=document.createElement('div');info.id='prModeBanner';p.insertBefore(info,p.firstChild); }
      const cfg={
        longitudinal:['Perfil longitudinal','Trace ou selecione o eixo no sentido do desenvolvimento do terreno.'],
        transversal:['Perfil transversal','Trace uma linha perpendicular ao eixo para obter uma seção transversal única.'],
        secoes:['Seções transversais','Trace cada linha perpendicular ao eixo e gere as seções; salve cada resultado com um nome diferente.']
      }[modo]||['Perfil topográfico','Trace ou selecione a linha de análise.'];
      info.innerHTML='<b>'+cfg[0]+'</b><br>'+cfg[1];
      const nm=document.getElementById('prName');
      if(nm && (modo==='transversal'||modo==='secoes') && (!nm.value||nm.value==='A'))
        nm.value=modo==='transversal'?'T':'S1';
    }
    if(p&&btn){ p.scrollTop=0; ribbonOpen(p,btn,
      modo==='longitudinal'?'Perfil Longitudinal':modo==='transversal'?'Perfil Transversal':'Seções Transversais'); }
    else switchView('perfis');
    toast('Perfil: escolha Vetor 3D ou MDT/TIFF, defina o eixo e clique em Gerar perfil');
  };
  const abreSolidos=(btn,tipo='solido')=>{
    RIB_CAT_ATUAL='mineracao';
    /* Mineração é concebida e editada sempre sobre a planta. O painel de
       sólidos continua completo em popover; a aba 3D serve somente para
       visualizar/renderizar o resultado quando o usuário a escolher. */
    switchView('map');
    setTimeout(()=>{
      try{ refreshCubPanel(); }catch(e){}
      const p=document.getElementById('sideCub'); if(!p) return;
      const chave=tipo==='importado'?'importar modelo Surpac':tipo==='bloco'?'modelo de blocos':
        tipo==='relatorio'?'relatório por bancada':'superfícies e restrições';
      const titulo=tipo==='importado'?'Importar modelo de blocos Surpac':tipo==='bloco'?'Modelo de blocos e cubagem':
        tipo==='relatorio'?'Balanço de massa e relatório':'Gerar sólido · superfícies e restrições';
      const sec=ribFindSec(p,chave);
      const nome=tipo==='importado'?'Modelo de Blocos':tipo==='bloco'?'Modelo de Blocos':
        tipo==='relatorio'?'Balanço de Massa':
        (btn&&btn.textContent.includes('Restrições')?'Restrições':'Gerar Sólido');
      const ancora=[...document.querySelectorAll('#ribbon .rbtn')].find(b=>b.textContent.includes(nome))||btn;
      if(sec&&ancora) ribbonOpen(sec,ancora,titulo);
      else p.scrollTop=0;
    },0);
    toast('Volume: marque as superfícies, defina as restrições e renderize o sólido');
  };
  /* Raster e TIN são produtos distintos. O comando da faixa sugere o tipo
     inicial, mas o seletor permanece visível para o usuário trocar o produto
     sem precisar fechar e reabrir a ferramenta. */
  const tinDefineModo=(modo)=>{
    const m=modo==='raster'?'raster':'tin',tf=document.getElementById('tinFormato');
    if(tf)tf.value=m;
    const cw=document.getElementById('tinCSwrap'),tt=document.getElementById('tinTitulo'),
      inf=document.getElementById('tinModoInfo'),bt=document.getElementById('btnTIN');
    if(cw)cw.style.display=m==='raster'?'':'none';
    if(tt)tt.innerHTML=m==='raster'?'Gerar Superfície Raster <span class="tag">grade</span>':'Gerar Superfície TIN <span class="tag">Delaunay</span>';
    if(inf)inf.innerHTML=m==='raster'
      ?'Gera uma superfície <b>Raster</b> a partir da camada carregada. Informe a resolução da grade; cada célula recebe a cota interpolada da triangulação.'
      :'Gera uma superfície <b>TIN</b> a partir da camada carregada. O produto são os vértices e triângulos Delaunay; não há tamanho de célula para configurar.';
    if(bt)bt.textContent=m==='raster'?'Gerar Superfície Raster':'Gerar Superfície TIN';
  };
  window.tinDefineModo=tinDefineModo;
  const abreTin=(btn,modo='tin')=>{
    RIB_CAT_ATUAL='gis';
    switchView('geo');
    setTimeout(()=>{
      try{ refreshTinPanel(); refreshTinClip(); tinDefineModo(modo); }catch(e){}
      const sec=document.getElementById('secTin')||
        ribFindSec(document.getElementById('sideGeo'),'superfície tin');
      if(sec&&btn) ribbonOpen(sec,btn,modo==='raster'?'Gerar Superfície Raster':'Gerar Superfície TIN');
    },0);
    toast(modo==='raster'?'Geração de superfície Raster aberta':'Triangulação TIN aberta');
  };
  const abrePilha=(btn,volume)=>{
    RIB_CAT_ATUAL='mineracao'; switchView('geo');
    RIB_CAT_ATUAL='mineracao'; ribbonBuild();
    setTimeout(()=>{
      refreshPilhaPanel();
      const sec=document.getElementById('secPilhaEstoque');
      const ancora=[...document.querySelectorAll('#ribbon .rbtn')].find(b=>
        b.textContent.includes(volume?'Volume da Pilha':'Desenhar Saia'))||btn;
      if(sec&&ancora) ribbonOpen(sec,ancora,'Pilha de estoque · saia e volume');
      if(!volume) setTimeout(()=>pilhaDesenharSaia(),60);
    },0);
  };
  const topoRaster=()=>S.rasters.find(r=>String(r.id)===String(S.topoRasterId))
    ||(S.rasters||[]).find(r=>r===S.selRaster)||S.rasters[0]||null;
  const topoAplicaRaster=r=>{
    if(!r) return;
    S.topoRasterId=r.id; S.selRaster=r; S.activeId=null;
    try{ propRefresh(); }catch(e){}
    try{ refreshCtPanel(); }catch(e){}
    try{ refreshCotPanel(); }catch(e){}
    ['ctRaster','cotSurf','estSurf'].forEach(id=>{
      const s=document.getElementById(id);
      if(s&&[...s.options].some(o=>String(o.value)===String(r.id))) s.value=String(r.id);
    });
    const perfil=document.getElementById('prRasterSel');
    if(perfil&&S.prof.rasterPick==null&&!(S.prof.sourceRasterIds||[]).length&&[...perfil.options].some(o=>String(o.value)===String(r.id)))perfil.value=String(r.id);
    refreshUI();
    toast('Superfície de trabalho: '+r.name);
  };
  const topoEscolheRaster=(btn,tipo)=>{
    if(!S.rasters.length){
      toast('Importe ou gere primeiro um MDT/MDS');
      actClick('fileIn'); return;
    }
    ribMiniMenu(btn,'Escolher '+tipo,S.rasters.map(r=>({
      nome:(String(r.id)===String(S.topoRasterId)?'✓ ':'')+r.name,
      desc:`${r.d.nc}×${r.d.nr} · resolução ${Number(r.d.cs||0).toFixed(2)} m`,
      run:()=>topoAplicaRaster(r)
    })));
  };
  const topoAbreSec=(btn,chave,titulo,refresh)=>{
    RIB_CAT_ATUAL='topografia';
    setTimeout(()=>{
      try{ if(refresh) refresh(); }catch(e){}
      const sec=ribFindSec(document.getElementById('sideGeo'),chave);
      if(sec) ribbonOpen(sec,btn,titulo);
      const r=topoRaster(); if(r) topoAplicaRaster(r);
    },0);
  };
  const topoQuebraLinha=()=>{
    const r=topoRaster();
    if(!r){ toast('Escolha primeiro o MDT/MDS de trabalho'); return; }
    let L=addLayer({name:'Linhas de quebra — '+r.name,gtype:'line',crs:S.workCRS,
      features:[],fields:[
        {name:'FID',type:'N',length:9,decimal:0},
        {name:'NOME',type:'C',length:60,decimal:0},
        {name:'SUPERFICIE',type:'C',length:80,decimal:0},
        {name:'OBS',type:'C',length:120,decimal:0}
      ],color:'#3aa76d'});
    L=activeLayer()||L;
    L._topoBreakRasterId=r.id; L.weight=3;
    if(L.sym){ L.sym.weight=3; L.sym.color='#3aa76d'; }
    setTool('line');
    toast('Quebra de linha 3D: desenhe sobre '+r.name+' e finalize com duplo clique');
  };
  const topoAbreBacia=(btn,foco,categoria='topografia')=>{
    RIB_CAT_ATUAL=categoria;
    const sec=document.getElementById('secBacia');
    if(!sec){ toast('Painel de projeto de taludes indisponível'); return; }
    ribbonOpen(sec,btn,foco==='rampa'?'Rampa de acesso':'Taludes e bermas');
    sec.classList.remove('collapsed');
    const r=topoRaster();
    try{ if(typeof refreshBaciaPanel==='function') refreshBaciaPanel(); }catch(e){}
    if(r){
      topoAplicaRaster(r);
      const s=document.getElementById('bcMDT');
      if(s&&[...s.options].some(o=>String(o.value)===String(r.id))) s.value=String(r.id);
    }
    if(foco==='rampa'){
      const ck=document.getElementById('bcRampaOn'); if(ck) ck.checked=true;
      const alvo=document.getElementById('bcRampaW'); if(alvo) alvo.focus();
      toast('Rampa: informe largura e declividade; após gerar a caixa, indique no mapa onde ela chega ao fundo');
    }else{
      const alvo=document.getElementById('bcAngInt'); if(alvo) alvo.focus();
      toast('Talude: configure inclinações, altura dos lances, bermas e simbologia; depois gere a superfície');
    }
  };
  const topoRampa=(btn)=>{
    if(typeof BACIA!=='undefined' && BACIA.ultima){
      try{ baciaArmaRampaBotao(); return; }
      catch(e){ toast('Não foi possível iniciar a rampa: '+(e&&e.message||e)); }
    }
    topoAbreBacia(btn,'rampa');
  };
  const topoProgressiva=(btn)=>{
    RIB_CAT_ATUAL='topografia';
    const r=topoRaster();
    if(r){
      topoAplicaRaster(r);
    }
    abreEstModal({button:btn,rasterId:r&&r.id,formato:'km'});
  };
  const abreSecaoExistente=(btn,painel,chave,titulo,categoria)=>{
    RIB_CAT_ATUAL=categoria||RIB_CAT_ATUAL;
    const sec=ribFindSec(document.getElementById(painel),chave);
    if(!sec){ toast('Ferramenta "'+titulo+'" não encontrada'); return; }
    ribbonOpen(sec,btn,titulo);
  };
  const topoDerivado=(tipo,unidade)=>{
    const src=topoRaster();
    if(!src){ toast('Escolha primeiro o MDT/MDS de trabalho'); return; }
    const d=src.d, nc=d.nc, nr=d.nr, cs=+d.cs||1, csy=+(d.csy||d.cs)||cs;
    if(!d||!d.z||nc<2||nr<2){ toast('A superfície escolhida não possui uma grade válida'); return; }
    showLoad('Calculando '+tipo+'…');
    setTimeout(()=>{
      try{
        const z=new Float32Array(nc*nr), Z=(r,c)=>{
          r=Math.max(0,Math.min(nr-1,r)); c=Math.max(0,Math.min(nc-1,c));
          return d.z[r*nc+c];
        };
        for(let r=0;r<nr;r++) for(let c=0;c<nc;c++){
          const k=r*nc+c, z1=Z(r,c-1),z2=Z(r,c+1),z3=Z(r-1,c),z4=Z(r+1,c);
          if([z1,z2,z3,z4,d.z[k]].some(v=>!Number.isFinite(v))){ z[k]=NaN; continue; }
          const dzdx=(z2-z1)/(2*cs), dzdy=(z3-z4)/(2*csy);
          const slope=Math.atan(Math.hypot(dzdx,dzdy));
          let aspect=(Math.atan2(dzdx,dzdy)*180/Math.PI+360)%360;
          if(tipo==='Declividade')
            z[k]=unidade==='pct' ? Math.tan(slope)*100 : slope*180/Math.PI;
          else if(tipo==='Aspecto') z[k]=aspect;
          else{
            const az=315*Math.PI/180, alt=45*Math.PI/180, asp=aspect*Math.PI/180;
            z[k]=Math.max(0,Math.sin(alt)*Math.cos(slope)+Math.cos(alt)*Math.sin(slope)*Math.cos(az-asp))*100;
          }
        }
        const nd={nc,nr,cs,csy:d.csy,xll:d.xll,yll:d.yll,z,
          native:false,resampled:d.resampled||1,srcCRS:d.srcCRS};
        const ehDecl=tipo==='Declividade', un=ehDecl?(unidade==='pct'?'pct':'deg'):null;
        const rotUn=un==='pct'?' (%)':un==='deg'?' (graus)':'';
        const out={id:rid++,name:`${tipo}${rotUn} — ${src.name}`,d:nd,
          src:{file:`${tipo.toLowerCase()}(${src.name})`,size:0,at:new Date().toISOString()},
          style:{mode:tipo==='Aspecto'?'hipso':tipo==='Declividade'?'hipso':'gray',opacity:.85},
          quantity:ehDecl?'slope':(tipo==='Aspecto'?'aspect':null),
          unit:ehDecl?un:(tipo==='Aspecto'?'deg':null),
          visible:true,overlay:null,groupId:src.groupId??null};
        S.rasters.push(out); S.selRaster=out; S.activeId=null;
        projectAutoSaveRaster(out);
        renderRaster(out); refreshUI(); zApply(); hideLoad();
        const b=out.overlay&&out.overlay.getBounds?out.overlay.getBounds():null; if(b) safeFit(b);
        toast(`✅ ${tipo} gerado em nova camada raster`);
      }catch(e){ hideLoad(); toast('Falha ao calcular '+tipo+': '+(e&&e.message||e)); }
    },20);
  };
  const topoSombreado=()=>{
    const r=topoRaster(); if(!r){ toast('Escolha primeiro o MDT/MDS de trabalho'); return; }
    r.style=r.style||{}; r.style.mode='hs'; r.style.opacity=.85;
    renderRaster(r); refreshUI(); toast('Sombreado aplicado à superfície de trabalho');
  };
  const topoGrade=()=>{
    const r=topoRaster(); if(!r){ toast('Escolha primeiro o MDT/MDS de trabalho'); return; }
    S.selRaster=r; openRasProps(r);
    toast('Grade: ajuste resolução, reamostragem e uso da grade nativa');
  };
  const topoCurvasPreset=(btn,tipo)=>{
    const cfg={
      indice:{iv:5,master:25,split:true,titulo:'Curvas índice e mestras'},
      intermediarias:{iv:1,master:5,split:true,titulo:'Curvas intermediárias'},
      mestre:{iv:25,master:25,split:false,titulo:'Curvas mestre'},
      depressao:{iv:5,master:25,split:true,titulo:'Curvas de depressão'}
    }[tipo];
    topoAbreSec(btn,'curvas de nível',cfg.titulo,refreshCtPanel);
    setTimeout(()=>{
      const iv=document.getElementById('ctInt'),ma=document.getElementById('ctMaster'),sp=document.getElementById('ctSplit');
      if(iv) iv.value=cfg.iv; if(ma) ma.value=cfg.master; if(sp) sp.checked=cfg.split;
      if(tipo==='depressao') toast('Curvas de depressão: gere as curvas e edite/inverta a simbologia das fechadas conforme o sentido do relevo');
    },0);
  };
  const topoEditarCurvas=(btn)=>{
    const linhas=S.layers.filter(L=>L.gtype==='line' && /curva|contorno/i.test(L.name||''));
    if(!linhas.length){ toast('Gere ou importe primeiro uma camada de curvas de nível'); return; }
    ribMiniMenu(btn,'Editar curvas de nível',linhas.map(L=>({
      nome:L.name,desc:`${L.features.length} feição(ões)`,
      run:()=>{ S.activeId=L.id; S.selFeat=null; refreshUI(); setTool('select');
        toast('Camada ativa: '+L.name+' — selecione uma curva para editar seus vértices'); }
    })));
  };
  comando('topografia','mdt',btn=>abreTin(btn,'raster'));
  comando('topografia','mds',btn=>topoEscolheRaster(btn,'MDS'));
  comando('topografia','curvas-nivel',btn=>
    topoAbreSec(btn,'curvas de nível','Curvas de Nível',refreshCtPanel));
  comando('topografia','pontos-cotados',btn=>
    topoAbreSec(btn,'pontos cotados','Pontos Cotados',refreshCotPanel));
  comando('topografia','quebrar-linha',topoQuebraLinha);
  comando('mineracao','crista-pe',abreCristaPe);
  comando('topografia','perfil-longitudinal',btn=>abrePerfis(btn,'longitudinal'));
  comando('topografia','secoes-transversais',btn=>abrePerfis(btn,'secoes'));
  comando('topografia','perfil-transversal',btn=>abrePerfis(btn,'transversal'));
  comando('topografia','regua',topoProgressiva);
  comando('topografia','talude',btn=>topoAbreBacia(btn,'talude'));
  comando('topografia','triangular-tin',abreTin);
  const abreImportacaoLidar=()=>{
    const bg=document.getElementById('lidarModal');
    if(bg)bg.classList.add('on');
  };
  comando('topografia','lidar',abreImportacaoLidar);
  comando('topografia','las',abreImportacaoLidar); // compatibilidade com atalhos salvos
  /* A mesma aquisição também fica disponível em Arquivo, onde o fluxo começa
     pela entrada/saída de dados. Mantém os ícones e o comportamento da faixa
     Projeto anterior. */
  comando('inicio','lidar',abreImportacaoLidar);
  comando('inicio','drone',()=>{ RIB_CAT_ATUAL='drone'; switchView('map');
    toast('Aquisição por drone: importe fotos, ortomosaico ou produtos processados.'); });
  comando('topografia','extrair-solidos',btn=>{
    RIB_CAT_ATUAL='topografia'; switchView('geo');
    setTimeout(()=>{
      try{ refreshExtracaoSolidosPanel(); }catch(e){}
      const sec=document.getElementById('secExtracaoSolidos');
      if(sec&&btn)ribbonOpen(sec,btn,'Extração de sólidos');
    },0);
    toast('Extração: escolha o levantamento e a superfície-base');
  });
  comando('topografia','grade',topoGrade);
  comando('topografia','declividade',btn=>ribMiniMenu(btn,'Unidade da declividade',[
    {nome:'Declividade em porcentagem (%)',
      desc:'Gera 100 × tangente do ângulo da vertente. É a unidade mais usada em topografia e projetos de drenagem.',
      run:()=>topoDerivado('Declividade','pct')},
    {nome:'Declividade em graus (°)',
      desc:'Gera o ângulo da vertente em relação ao plano horizontal.',
      run:()=>topoDerivado('Declividade','deg')}
  ]));
  comando('topografia','aspecto',()=>topoDerivado('Aspecto'));
  comando('topografia','exposicao-solar',()=>topoDerivado('Exposição solar'));
  comando('topografia','sombreado',topoSombreado);
  comando('topografia','curvas-indice',btn=>topoCurvasPreset(btn,'indice'));
  comando('topografia','curvas-intermediarias',btn=>topoCurvasPreset(btn,'intermediarias'));
  comando('topografia','curvas-mestre',btn=>topoCurvasPreset(btn,'mestre'));
  comando('topografia','curvas-depressao',btn=>topoCurvasPreset(btn,'depressao'));
  comando('topografia','editar-curvas',topoEditarCurvas);

  /* Produtos de terreno tambem pertencem ao fluxo de geoprocessamento GIS.
     Cada resultado e uma nova camada (exceto o sombreado de visualizacao),
     mantendo a superficie original intacta. */
  comando('gis','declividade',btn=>ribMiniMenu(btn,'Gerar declividade',[
    {nome:'Declividade em porcentagem (%)',desc:'Nova camada raster com 100 × tangente do ângulo.',run:()=>topoDerivado('Declividade','pct')},
    {nome:'Declividade em graus (°)',desc:'Nova camada raster com o ângulo em relação ao plano horizontal.',run:()=>topoDerivado('Declividade','deg')}
  ]));
  comando('gis','aspecto',()=>topoDerivado('Aspecto'));
  comando('gis','sombreado',()=>topoDerivado('Relevo sombreado'));
  /* GIS concentra os processos espaciais da 2.0. Os mesmos painéis técnicos
     continuam sendo usados; muda apenas o lugar de acesso na faixa 3.0. */
  comando('gis','wms',btn=>{
    const sec=document.getElementById('secWMS');
    if(sec) ribbonOpen(sec,btn,'Serviços WMS / OGC');
    else toast('Painel de serviços WMS não encontrado');
  });
  /* ANM: abre o painel e baixa direto os processos da área da tela (sem UF) */
  comando('gis','anm',btn=>{
    if(typeof anmAbrePainel==='function'){ anmAbrePainel(btn); return; }
    const sec=document.getElementById('secANM');
    if(sec) ribbonOpen(sec,btn,'ANM · Processos Minerários'); else toast('Painel da ANM não encontrado');
  });
  comando('gis','requerimento-pesquisa',()=>window.GeoMineResearch.open());
  comando('gis','clip',btn=>abreSecaoExistente(btn,'sideGeo','recortar raster','Recortar TIFF por máscara','gis'));
  /* União, buffer e interseção vetoriais já foram ligados acima. Os antigos
     vínculos repetidos deste ponto abriam, respectivamente, fusão de MDT,
     encaixe 3D e interseção de superfícies — ferramentas que já possuem os
     comandos próprios “Mesclar Rasters” e “Interseção A × B”. */
  comando('gis','grade',btn=>abreSecaoExistente(btn,'sideHidro','topografia de trabalho','Topografia de Trabalho','gis'));
  comando('gis','triangular-tin',abreTin);
  comando('gis','curvas-nivel',btn=>topoAbreSec(btn,'curvas de nível','Gerar Curvas de Nível',refreshCtPanel));
  comando('gis','pontos-cotados',btn=>topoAbreSec(btn,'pontos cotados','Extrair Pontos Cotados',refreshCotPanel));

  /* Mineração concentra toda a cubagem antes exposta na Topografia:
     corte/aterro, volume entre superfícies, restrições, sólido e blocos. */
  comando('mineracao','volume-corte-aterro',btn=>abreSolidos(btn,'solido'));
  comando('mineracao','volume-superficies',btn=>abreSolidos(btn,'solido'));
  comando('mineracao','calculo-volume',btn=>abreSolidos(btn,'bloco'));
  comando('mineracao','balanco-massa',btn=>abreSolidos(btn,'relatorio'));
  comando('mineracao','modelo-blocos',btn=>abreSolidos(btn,'importado'));
  comando('mineracao','pilha',btn=>abrePilha(btn,false));
  comando('mineracao','estoque',btn=>abrePilha(btn,true));
  /* Cava e DCE voltam a compartilhar o mesmo comando. A referência de cota,
     o sentido e o lado dos bancos definem o resultado sem duplicar a UI. */
  comando('mineracao','projecoes',btn=>window.abreProjecoes?.(btn));
  window.cavaDefineModoPainel=function(){
    const sec=document.getElementById('secCavaMineracao'),
      titulo=document.getElementById('cavaPainelTitulo'),desc=document.getElementById('cavaPainelDescricao'),
      auto=document.getElementById('cavaStepBancadas'),rampa=document.getElementById('secCavaRampaMineracao'),
      rb=document.getElementById('secRb31'),acoes=document.getElementById('cavaAcoesAutomaticas');
    if(typeof S!=='undefined'&&S)S._cavaPainelModo='unificado';
    if(sec)sec.dataset.cavaModo='unificado';
    if(titulo)titulo.textContent='Cava Paramétrica';
    if(desc)desc.textContent='Fluxo único para cava e DCE: use a geração automática ou construa por bancadas. O motor v2 mantém a mesma convenção de crista, pé, rampa, interseção e polígonos nos dois métodos.';
    if(auto)auto.style.display='';
    /* A rampa automática antiga permanece apenas como estrutura de
       compatibilidade para projetos salvos. O fluxo visível é o motor v2
       por bancadas, com Limpar e Mover rampa. */
    if(rampa)rampa.style.display='none';
    if(rb)rb.style.display='';
    if(acoes)acoes.style.display='';
    return sec;
  };
  function abrePainelCava(btn){
    RIB_CAT_ATUAL='mineracao';
    switchView('map');
    setTimeout(()=>{
      refreshCavaMineracao();
      if(typeof cavaCarregaPainelProjetoAtual==='function')cavaCarregaPainelProjetoAtual();
      const sec=window.cavaDefineModoPainel(),rotulo='Cava Paramétrica';
      /* switchView reconstrói a ribbon; usa o novo botão como âncora. */
      const ancora=[...document.querySelectorAll('#ribbon .rbtn')]
        .find(b=>b.textContent.trim()===rotulo)||btn;
      if(sec&&ancora){
        ribbonOpen(sec,ancora,'Cava e DCE paramétricos · motor v2',true);
        if(typeof rb31RetomaAoAbrir==='function'&&
          ((typeof S!=='undefined'&&S&&S._rb31)||
           (typeof S!=='undefined'&&S&&(S.layers||[]).some(L=>L&&L._rb31Recipe))))
          rb31RetomaAoAbrir();
      }
      else toast('Painel paramétrico não encontrado');
    },0);
  }
  const abreCava2=()=>{
    RIB_CAT_ATUAL='mineracao';
    switchView('cava2');
    /* Não abre um segundo motor: reapresenta exatamente a instância da aba
       2D, com o mesmo desenho ativo e as mesmas camadas do projeto. */
    requestAnimationFrame(()=>{
      try{window.CCMGISCava2&&window.CCMGISCava2.openMiningMode();}catch(e){console.warn('Modo Cava 2D',e);}
    });
  };
  /* O motor rápido da Área 2D substitui o fluxo paramétrico antigo. O alias
     cava2 permanece apenas para projetos/atalhos gravados por versões prévias. */
  comando('mineracao','cava-parametrica',abreCava2);
  comando('mineracao','cava2',abreCava2);
  comando('mineracao','congelar-cava',btn=>{
    RIB_CAT_ATUAL='mineracao';
    switchView('map');
    setTimeout(()=>{
      refreshCavaMineracao();
      if(typeof cavaCarregaPainelProjetoAtual==='function')cavaCarregaPainelProjetoAtual();
      const sec=document.getElementById('secCavaCongelamento');
      const ancora=[...document.querySelectorAll('#ribbon .rbtn')]
        .find(b=>b.textContent.trim()==='Congelar')||btn;
      if(sec&&ancora) ribbonOpen(sec,ancora,'Congelamento da cava paramétrica',true);
      else toast('Painel de congelamento da cava não encontrado');
    },0);
  });
  comando('mineracao','rampas-cava',btn=>{
    RIB_CAT_ATUAL='mineracao';
    switchView('map');
    setTimeout(()=>{
      refreshCavaMineracao();
      if(typeof cavaCarregaPainelProjetoAtual==='function')cavaCarregaPainelProjetoAtual();
      if(typeof rb31RampasRender==='function')rb31RampasRender();
      const sec=document.getElementById('secCavaRampas');
      const ancora=[...document.querySelectorAll('#ribbon .rbtn')]
        .find(b=>b.textContent.trim()==='Rampas')||btn;
      if(sec&&ancora) ribbonOpen(sec,ancora,'Rampas da cava paramétrica',true);
      else toast('Painel de rampas não encontrado');
    },0);
  });
  comando('mineracao','corte-final-cava',btn=>{
    RIB_CAT_ATUAL='mineracao';
    switchView('map');
    setTimeout(()=>{
      refreshCavaMineracao();
      if(typeof cavaCarregaPainelProjetoAtual==='function')cavaCarregaPainelProjetoAtual();
      if(typeof rb31CorteFinalPrepara==='function')rb31CorteFinalPrepara();
      const sec=document.getElementById('secCavaCorteFinal');
      const ancora=[...document.querySelectorAll('#ribbon .rbtn')]
        .find(b=>b.textContent.trim()==='Corte Final')||btn;
      if(sec&&ancora) ribbonOpen(sec,ancora,'Corte final pela topografia',true);
      else toast('Painel de corte final não encontrado');
    },0);
  });
  comando('mineracao','rampa-mina',btn=>{
    RIB_CAT_ATUAL='mineracao';
    switchView('map');
    setTimeout(()=>{
      const sec=document.getElementById('secCavaRampaMineracao');
      const ancora=[...document.querySelectorAll('#ribbon .rbtn')]
        .find(b=>b.textContent.trim()==='Rampa')||btn;
      const chk=document.getElementById('cavaRampa'),box=document.getElementById('cavaRampaBox');
      if(chk)chk.checked=true;
      if(box)box.style.display='grid';
      if(sec&&ancora){
        ribbonOpen(sec,ancora,'Rampa dinâmica da cava',true);
        const L=typeof cavaProjetoAtual==='function'&&cavaProjetoAtual();
        if(!L||!L.cavaDesign) toast('Gere ou selecione uma cava antes de indicar a rampa');
        else{
          const R=L.cavaDesign.ramp||{},set=(id,v)=>{const e=document.getElementById(id);if(e&&v!=null)e.value=v;};
          set('cavaRampaW',R.width);set('cavaRampaG',R.grade);set('cavaRampaDir',R.dir);
          set('cavaRampaPatamar',0);
          const sw=document.getElementById('cavaRampaSwitch'),
            swn=document.getElementById('cavaRampaSwitchN');
          if(sw)sw.checked=!!R.switchback;
          set('cavaRampaSwitchN',R.switchEvery??1);
          if(swn)swn.disabled=!R.switchback;
          set('cavaRampaFimModo',R.endMode==='elevation'?'cota':'final');
          set('cavaRampaFimZ',Number.isFinite(+R.endZ)?R.endZ:'');
          const z=document.getElementById('cavaRampaFimZ');if(z)z.disabled=R.endMode!=='elevation';
          if(typeof cavaRampaAtualizaLinhasEdicao==='function')cavaRampaAtualizaLinhasEdicao();
        }
      }else toast('Painel de rampa da cava não encontrado');
    },0);
  });

  /* A rampa indicada por um ponto de chegada pertence exclusivamente ao
     projeto da caixa de retenção, dentro de Hidrologia. */
  comando('hidrologia','caixa-retencao',btn=>topoAbreBacia(btn,'caixa','hidrologia'));
  comando('hidrologia','relatorio-geotecnico',btn=>baciaMemorialEscolher(btn));
  comando('hidrologia','taludes-hidricos',btn=>topoAbreBacia(btn,'talude','hidrologia'));
  comando('hidrologia','rampa-hidrica',btn=>{
    RIB_CAT_ATUAL='hidrologia';
    if(typeof BACIA!=='undefined' && BACIA.ultima){ topoRampa(btn); return; }
    topoAbreBacia(btn,'rampa','hidrologia');
  });
  /* Hidrologia usa IDs estáveis. A busca textual antiga fazia “Drenagem”
     abrir a PRIMEIRA seção que continha essa palavra — “Rede de drenagem” —
     em vez do catálogo de valeta/sarjeta/meio-fio. */
  const hidroAbreId=(btn,id,titulo,foco)=>{
    RIB_CAT_ATUAL='hidrologia';
    const sec=document.getElementById(id);
    if(!sec){ toast('Ferramenta “'+titulo+'” não encontrada'); return false; }
    ribbonOpen(sec,btn,titulo);
    if(id==='secHidroInund')window.GeoMineNativeFlood?.refresh(true);
    setTimeout(()=>{ const e=foco&&document.getElementById(foco); if(e) e.focus(); },0);
    return true;
  };
  comando('hidrologia','serie-historica',btn=>
    hidroAbreId(btn,'secHidroSerie','Série Histórica','btnANA'));
  comando('hidrologia','extremos-gev',btn=>
    hidroAbreId(btn,'secHidroIDF','Extremos GEV e L-momentos','btnIDF'));
  comando('hidrologia','idf',btn=>
    hidroAbreId(btn,'secHidroIDF','Curva IDF','btnIDF'));
  comando('hidrologia','chuva',btn=>
    hidroAbreId(btn,'secHidroIDF','Chuva de Projeto','btnIDF'));
  comando('hidrologia','evaporacao',btn=>
    hidroAbreId(btn,'secHidroSerie','Dados de Evaporação','btnPaste'));
  comando('hidrologia','mde-hidrologico',btn=>
    hidroAbreId(btn,'secHidroMDE','Carregar MDE','hResM'));
  comando('hidrologia','preencher-depressoes',btn=>{
    const b=document.getElementById('btnFill');
    hidroAbreId(btn,'secHidroFill','Preencher Depressões','btnFill');
    if(!b||b.disabled) toast('Carregue o MDE para habilitar o preenchimento de depressões');
  });
  comando('hidrologia','direcao-fluxo',btn=>
    hidroAbreId(btn,'secHidroDir','Direção de Fluxo D8','btnD8Dir'));
  comando('hidrologia','acumulacao-fluxo',btn=>
    hidroAbreId(btn,'secHidroAcc','Acumulação de Fluxo','btnD8Acc'));
  comando('hidrologia','rede-drenagem',btn=>
    hidroAbreId(btn,'secHidroRede','Extrair Rede de Drenagem','hThr'));
  comando('hidrologia','sombreado-hidrologico',btn=>
    hidroAbreId(btn,'secHidroShade','Sombreado Hidrológico','btnShade'));
  /* Abre o catálogo de drenagem e, quando solicitado, seleciona/arma uma
     feição específica. Curso d'água e obras correntes são desenho vetorial;
     não reutilizam a extração automática da rede D8. */
  const hidroDrenagem=(btn,tipo,titulo,armar)=>{
    if(!hidroAbreId(btn,'secDrenagem',titulo||'Drenagem e Dimensionamento'))return;
    setTimeout(()=>{
      const sel=document.getElementById('drenTipo');
      if(tipo && sel && [...sel.options].some(o=>o.value===tipo)){
        sel.value=tipo;
        sel.dispatchEvent(new Event('change'));
      }
      if(armar){
        try{
          /* Chama o comando real, sem depender de um botão intermediário e
             sem cair na extração automática da rede D8. */
          drenArma(tipo||sel.value);
        }catch(e){
          const msg='Não foi possível iniciar '+(titulo||'a drenagem')+': '+((e&&e.message)||e);
          try{cmdLog(msg,'erro');}catch(_){}
          toast(msg);
        }
      }
    },0);
  };
  const hidroArmaBacia=async(btn)=>{
    hidroAbreId(btn,'secHidroBacia','Delimitar Bacia','btnBasin');
    const d=S.hidro&&S.hidro.dem;
    if(!d){
      toast('Carregue ou defina o MDE hidrológico antes de marcar o exutório');
      return;
    }
    /* O usuário só precisa preencher as depressões. Direção e acumulação são
       pré-cálculos internos da bacia; seus botões servem apenas para materializar
       setas/raster no projeto e permanecem opcionais. */
    const b=document.getElementById('btnBasin');
    if(S.tool!=='basin' && b&&typeof b.onclick==='function') await b.onclick();
  };
  comando('hidrologia','bacia-hidrografica',btn=>{
    hidroArmaBacia(btn);
  });
  comando('hidrologia','rio-curso',btn=>
    hidroDrenagem(btn,'talvegue','Curso d’Água',true));
  comando('hidrologia','declividade-hidrica',btn=>
    hidroAbreId(btn,'secHidroVazao','Declividade Hidráulica'));
  comando('hidrologia','tempo-concentracao',btn=>
    hidroAbreId(btn,'secHidroVazao','Tempo de Concentração e Vazão'));
  comando('hidrologia','inundacao',btn=>
    hidroAbreId(btn,'secHidroInund','Simulação de Inundação','btnInundRun'));
  comando('hidrologia','mancha-inundacao',btn=>
    hidroAbreId(btn,'secHidroMancha','Mancha de Inundação'));
  comando('hidrologia','cn',btn=>
    hidroAbreId(btn,'secCNOrto','Determinar CN pela Ortofoto','btnCnOrto'));
  comando('hidrologia','secao-hidraulica',btn=>
    hidroAbreId(btn,'secHidroVazao','Seção Hidráulica','btnCanal'));
  comando('hidrologia','obra-arte-corrente',btn=>ribMiniMenu(btn,'Obra de arte corrente',[
    {ic:'dren_bueiro',nome:'Bueiro / BSTC',desc:DREN_TIPOS.bueiro.desc,
      run:()=>hidroDrenagem(btn,'bueiro','Bueiro / BSTC',true)},
    {ic:'dren_manilha',nome:'Manilha / tubo',desc:DREN_TIPOS.manilha.desc,
      run:()=>hidroDrenagem(btn,'manilha','Manilha / tubo',true)},
    {ic:'dren_descida',nome:"Descida d'água",desc:DREN_TIPOS.descida.desc,
      run:()=>hidroDrenagem(btn,'descida',"Descida d'água",true)},
    {ic:'dren_dissipador',nome:'Dissipador',desc:DREN_TIPOS.dissipador.desc,
      run:()=>hidroDrenagem(btn,'dissipador','Dissipador',true)},
    {sep:1},
    {nome:'Abrir dimensionamento completo…',
      run:()=>hidroDrenagem(btn,'bueiro','Obras de Arte Corrente',false)}
  ]));
  /* O antigo botão isolado de bueiro passa a ser a entrada geral para todas
     as feições: dreno, valeta, sarjeta, meio-fio, canaleta, manilha,
     descida d'água, dissipador, bueiro/BSTC, talvegue, divisor e leira. */
  comando('hidrologia','bueiro',btn=>
    hidroDrenagem(btn,null,'Drenagem — Feições e Dimensionamento',false));

  /* GEOLOGIA — a faixa deixou de ser somente visual. Cada adapter é literal
     para também participar da auditoria de comandos do build; a lógica e os
     esquemas das camadas ficam no módulo modular geology-workspace.js. */
  const geoRun=(chave,btn)=>{
    if(window.GeoMineGeology&&typeof window.GeoMineGeology.run==='function')
      return window.GeoMineGeology.run(chave,btn);
    toast('O módulo de Geologia ainda não foi carregado');
  };
  comando('geologia','litologia',btn=>geoRun('litologia',btn));
  comando('geologia','mapeamento-campo',btn=>geoRun('mapeamento-campo',btn));
  comando('geologia','ficha-campo',btn=>geoRun('ficha-campo',btn));
  comando('geologia','contato-geologico',btn=>geoRun('contato-geologico',btn));
  comando('geologia','falha',btn=>geoRun('falha',btn));
  comando('geologia','dobra',btn=>geoRun('dobra',btn));
  comando('geologia','acamamento',btn=>geoRun('acamamento',btn));
  comando('geologia','xistosidade',btn=>geoRun('xistosidade',btn));
  comando('geologia','fratura',btn=>geoRun('fratura',btn));
  comando('geologia','veio',btn=>geoRun('veio',btn));
  comando('geologia','dique',btn=>geoRun('dique',btn));
  comando('geologia','zona-cisalhamento',btn=>geoRun('zona-cisalhamento',btn));
  comando('geologia','sondagem',btn=>geoRun('sondagem',btn));
  comando('geologia','importar-furos-string',btn=>geoRun('importar-furos-string',btn));
  comando('geologia','importar-furos-csv',btn=>geoRun('importar-furos-csv',btn));
  comando('geologia','spt',btn=>geoRun('spt',btn));
  comando('geologia','trincheira',btn=>geoRun('trincheira',btn));
  comando('geologia','afloramento',btn=>geoRun('afloramento',btn));
  comando('geologia','ponto-amostra',btn=>geoRun('ponto-amostra',btn));
  comando('geologia','log-sondagem',btn=>geoRun('log-sondagem',btn));
  comando('geologia','testemunho',btn=>geoRun('testemunho',btn));
  comando('geologia','dominio-geologico',btn=>geoRun('dominio-geologico',btn));
  comando('geologia','modelo-geologico-3d',btn=>geoRun('modelo-geologico-3d',btn));
  comando('geologia','secao-geologica',btn=>geoRun('secao-geologica',btn));
  comando('geologia','surpac-superficies',btn=>geoRun('surpac-superficies',btn));
  comando('geologia','mapa-estrutural',btn=>geoRun('mapa-estrutural',btn));
  comando('geologia','estereograma',btn=>geoRun('estereograma',btn));
  comando('geologia','lineacao',btn=>geoRun('lineacao',btn));
  comando('geologia','foliacao',btn=>geoRun('foliacao',btn));
  comando('geologia','plunging',btn=>geoRun('plunging',btn));

  const v3Abre=(btn,chave,titulo)=>{
    RIB_CAT_ATUAL='visualizacao'; switchView('v3d');
    setTimeout(()=>abreSecaoExistente(btn,'sideV3d',chave,titulo,'visualizacao'),0);
  };
  const v3Captura=()=>{
    switchView('v3d');
    const cv=document.querySelector('#v3dCanvasWrap canvas');
    if(!cv){ toast('Renderize uma cena 3D antes de capturar'); return; }
    try{
      cv.toBlob(async blob=>{
        if(!blob){ toast('Não foi possível capturar a cena 3D'); return; }
        await download(blob,'ALAGIS_vista_3D_'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')+'.png');
        toast('Vista 3D exportada em PNG');
      },'image/png');
    }catch(e){ toast('Falha na captura 3D: '+(e&&e.message||e)); }
  };
  comando('visualizacao','selecionar',()=>switchView('map'));
  comando('visualizacao','modelo-geologico-3d',()=>switchView('v3d'));
  comando('visualizacao','layout',()=>abreLayout());
  comando('visualizacao','mdt',btn=>v3Abre(btn,'superfícies','Superfícies da Cena'));
  comando('visualizacao','imagem',btn=>v3Abre(btn,'textura rgb','Textura RGB'));
  comando('visualizacao','talude',btn=>v3Abre(btn,'exagero vertical','Exagero Vertical'));
  comando('visualizacao','sombreado',btn=>v3Abre(btn,'aparência','Aparência 3D'));
  comando('visualizacao','malha-3d',()=>{ switchView('v3d'); setTimeout(()=>{try{mina3DAuto(true);}catch(e){}},30); });
  comando('visualizacao','medir-distancia',()=>{ switchView('v3d'); setTimeout(()=>actClick('btnV3Meas'),30); });
  comando('visualizacao','zoom-total',()=>{ switchView('v3d'); setTimeout(()=>{try{if(typeof v3Fit==='function')v3Fit();else mina3DAuto(true);}catch(e){}},30); });
  comando('visualizacao','tela-cheia',navFullscreen);
  comando('visualizacao','png',v3Captura);
  comando('visualizacao','opcoes',btn=>v3Abre(btn,'aparência','Configurações 3D'));

  comando('janela','opcoes',()=>abrePrefs());
  comando('janela','personalizar',()=>abrePrefs());
  comando('janela','snap',()=>document.getElementById('btnSnap')?.click());
})();

