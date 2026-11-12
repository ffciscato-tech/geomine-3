
/* ============================================================================
   SERVIÇOS WMS / OGC — catálogo oficial por país e tema, GetCapabilities e
   camadas no projeto.
   Cada entrada tem país (ISO-2), temas e órgão. Entradas 'wms' preenchem a
   URL para a leitura das capacidades; entradas 'link' abrem o portal ou a
   norma em nova aba (cadastros sem WMS público e marco legal). 'camadas'
   lista nomes técnicos conferidos em 26/10/2026, úteis quando o servidor não
   deixa o navegador ler as capacidades. 'verificado' é a data da última
   conferência automática (GetCapabilities ou página); vazio = não conferido.
   ========================================================================== */
const WMS_PAISES={BR:'Brasil',AR:'Argentina',UY:'Uruguai',CO:'Colômbia',GF:'Guiana Francesa'};
const WMS_PAISES_SUL=['AR','UY','CO','GF'];
const WMS_TEMAS={geologia:'Geologia',mineracao:'Mineração',ambiente:'Meio ambiente',legal:'Legal e infraestrutura',base:'Cartografia base'};
const WMS_CATALOG=[
  /* ---------------- Brasil ---------------- */
  {pais:'BR',temas:['base'],provider:'IBGE',title:'IBGE — Geosserviços nacionais',url:'https://geoservicos.ibge.gov.br/geoserver/ows',
   keywords:'ibge cartografia limites territoriais geografia geociências mapas brasil'},
  {pais:'BR',temas:['mineracao','legal'],provider:'ANM',title:'ANM — SIGMINE / dados minerários',url:'https://geo.anm.gov.br/arcgis/services/SIGMINE/dados_anm/MapServer/WMSServer',
   keywords:'anm sigmine mineração processos minerários requerimentos títulos minas'},
  {pais:'BR',temas:['mineracao','ambiente'],provider:'ANM',title:'ANM — Barragens de mineração',url:'https://geo.anm.gov.br/arcgis/services/Producao/Barragens_Dashboard_Publico/MapServer/WMSServer',
   keywords:'anm barragens mineração segurança barragem'},
  {pais:'BR',temas:['mineracao','ambiente'],provider:'ANM',title:'ANM — Manchas de inundação de barragens',url:'https://geo.anm.gov.br/arcgis/services/Producao/Manchas_Inunda%C3%A7%C3%A3o_das_Barragens/MapServer/WMSServer',
   keywords:'anm barragens mancha inundação dam break'},
  {pais:'BR',temas:['geologia'],provider:'SGB / CPRM',title:'Serviço Geológico do Brasil — Geosserviços',url:'https://geoservicos.sgb.gov.br/geoserver/ows',
   keywords:'sgb cprm geologia recursos minerais geodiversidade hidrologia'},
  {pais:'BR',temas:['ambiente'],provider:'ANA / SNIRH',title:'ANA — Sistema Nacional de Recursos Hídricos',url:'https://www.snirh.gov.br/arcgis/services/INDE/Camadas/MapServer/WMSServer',
   keywords:'ana snirh hidrografia rios bacias recursos hídricos'},
  {pais:'BR',temas:['base'],provider:'INDE',title:'INDE — Diretório Brasileiro de Dados Geoespaciais',url:'https://geoservicos.inde.gov.br/geoserver/ows',
   keywords:'inde dados geoespaciais brasil catálogo infraestrutura nacional'},
  {pais:'BR',temas:['ambiente','legal'],provider:'ICMBio / INDE',title:'ICMBio — Unidades de conservação',url:'https://geoservicos.inde.gov.br/geoserver/ICMBio/ows',
   keywords:'icmbio unidades conservação parques reservas meio ambiente'},

  /* ---------------- Argentina ---------------- */
  {pais:'AR',temas:['base','mineracao'],provider:'IGN Argentina',title:'IGN — Cartografia base, extração mineral e áreas protegidas',url:'https://wms.ign.gob.ar/geoserver/ows',
   keywords:'argentina ign cartografia cantera canteira salar salina afloramento zona de extracción minera cartas 50k 100k 500k',
   camadas:'ign:areas_de_estructura_asociada_010601, ign:areas_de_extraccion_AA012, ign:area_protegida, ign:edafologia_salina, ign:edafologia_afloramiento_rocoso',
   nota:'192 camadas: zonas de extração mineral, canteiras, salares, afloramentos, áreas protegidas, hidrografia e cartas 1:50k/100k/500k.',verificado:'2026-10-26'},
  {pais:'AR',temas:['ambiente','legal'],provider:'MAyDS · IDE Ambiental',title:'IDE Ambiental — Áreas protegidas, bosques nativos (OTBN), bacias',url:'https://geo.ambiente.gob.ar/geoserver/ows',
   keywords:'argentina ambiente areas protegidas parques nacionales otbn bosque nativo ley 26331 cuencas ecorregiones comunidades indigenas humedales',
   camadas:'areas_protegidas:APN_limite_areas_wgs84, areas_protegidas:ParquesNacionale_limites_marzo2022, areas_protegidas:ecoregiones2021, dgarh:cuencas_argentinas_interjurisdiccionales, bosque_nativo:autoridad_local_aplicacion',
   nota:'421 camadas: APN e SiFAP, parques nacionais, OTBN por província (Lei 26.331), bacias interjurisdicionais, ecorregiões, comunidades indígenas, sítios de patrimônio.',verificado:'2026-10-26'},
  {pais:'AR',temas:['legal'],provider:'Transporte · IDE',title:'IDE Transporte — Ferrovias, aeroportos e fluxo de cargas',url:'https://ide.transporte.gob.ar/geoserver/ows',
   keywords:'argentina transporte infraestrutura ferrocarril ferrovia aeropuertos puertos carga mineria logistica',
   camadas:'idera:Ferrocarril, idera:Estacion_Ferroviaria, idera:Aeropuertos, orsna:Aeropuertos_y_predios',
   nota:'182 camadas: rede ferroviária, estações, aeroportos, obras e fluxo de cargas de mineração em caminhões (2018).',verificado:'2026-10-26'},
  {pais:'AR',temas:['geologia','mineracao'],provider:'SEGEMAR · SIGAM',kind:'link',title:'SIGAM — Visualizador geológico-mineiro do SEGEMAR',url:'https://sigam.segemar.gov.ar/mapstore/',
   keywords:'argentina segemar sigam geologia cartas geologicas depositos minerales recursos catastro',
   nota:'Cartas geológicas, depósitos e recursos minerais. O SEGEMAR não expõe WMS aberto (endereços testados em 26/10 retornaram 404); use o visualizador.',verificado:'2026-10-26'},
  {pais:'AR',temas:['legal','mineracao'],provider:'Argentina.gob.ar',kind:'link',title:'Código de Minería — Ley 1.919 (texto ordenado)',url:'https://www.argentina.gob.ar/normativa/nacional/ley-1919-43797',
   keywords:'argentina codigo de mineria ley 1919 concesion mina cateo exploracion explotacion canon',
   nota:'Regime de concessão, cateo, exploração e exploração; canon mineiro. Domínio originário das províncias.',verificado:'2026-10-26'},
  {pais:'AR',temas:['legal','ambiente','mineracao'],provider:'Argentina.gob.ar',kind:'link',title:'Ley 24.585 — Proteção ambiental da atividade mineira',url:'https://www.argentina.gob.ar/normativa/nacional/ley-24585-30096/texto',
   keywords:'argentina ley 24585 impacto ambiental mineria informe de impacto ambiental IIA declaracion',
   nota:'Título complementar do Código: Informe de Impacto Ambiental (IIA) e Declaração de Impacto Ambiental por autoridade provincial.',verificado:'2026-10-26'},
  {pais:'AR',temas:['legal','ambiente'],provider:'Argentina.gob.ar',kind:'link',title:'Ley 25.675 — Ley General del Ambiente',url:'https://www.argentina.gob.ar/normativa/nacional/ley-25675-79980/texto',
   keywords:'argentina ley general del ambiente 25675 presupuestos minimos evaluacion impacto participacion',
   nota:'Pressupostos mínimos: avaliação de impacto, participação cidadã, seguro ambiental.',verificado:'2026-10-26'},
  {pais:'AR',temas:['mineracao','legal'],provider:'Secretaría de Minería',kind:'link',title:'Secretaría de Minería de la Nación',url:'https://www.argentina.gob.ar/economia/mineria',
   keywords:'argentina secretaria mineria nacion politica minera RIGI inversiones',
   nota:'Portal nacional de mineração: normativa, estatísticas e programas.',verificado:'2026-10-26'},
  {pais:'AR',temas:['legal'],provider:'Vialidad Nacional',kind:'link',title:'Vialidad Nacional — Rede rodoviária nacional',url:'https://www.argentina.gob.ar/transporte/vialidad-nacional',
   keywords:'argentina vialidad rutas nacionales infraestructura rodovias',verificado:'2026-10-26'},

  /* ---------------- Uruguai ---------------- */
  {pais:'UY',temas:['geologia'],provider:'DINAMIGE / MIEM',title:'Unidades geológicas — mapa base',url:'https://geoportal.miem.gub.uy/arcgis1091/services/Dinamige_GeoS/MapaBaseUnidadesGeologicasGeoS/MapServer/WMSServer',
   keywords:'uruguai uruguay dinamige geologia unidades geologicas falhas contatos lineamentos',
   camadas:'0, 1',nota:'Unidades geológicas (cor e trama), falhas, contatos e lineamentos.',verificado:'2026-10-26'},
  {pais:'UY',temas:['geologia'],provider:'DINAMIGE / MIEM',title:'Unidades geológicas 2017 — diques e estruturas',url:'https://geoportal.miem.gub.uy/arcgis1091/services/Dinamige_GeoS/Mapa_Base_Unidades_Geologicas_2017_GeoS/MapServer/WMSServer',
   keywords:'uruguai dinamige geologia unidades geologicas 2017 diques estruturas',
   camadas:'0, 2, 3',nota:'Edição 2017: unidades geológicas, diques e estruturas.',verificado:'2026-10-26'},
  {pais:'UY',temas:['mineracao','geologia'],provider:'DINAMIGE / MIEM',title:'Regiões mineiras',url:'https://geoportal.miem.gub.uy/arcgis1091/services/Dinamige_GeoS/GeologiaGeoS/MapServer/WMSServer',
   keywords:'uruguai dinamige regiones mineras mineracao distritos',camadas:'0',verificado:'2026-10-26'},
  {pais:'UY',temas:['mineracao','legal'],provider:'DINAMIGE / MIEM',title:'Cadastro mineiro — pedimentos e títulos',url:'https://geoportal.miem.gub.uy/arcgis1091/services/Dinamige_GeoS/CatastroMineroGeoS/MapServer/WMSServer',
   keywords:'uruguai dinamige catastro minero pedimentos otorgados canteras obra publica permisos concesiones titulos',
   camadas:'0, 1',nota:'6 camadas: pedimentos outorgados, canteiras de obra pública e demais títulos mineiros.',verificado:'2026-10-26'},
  {pais:'UY',temas:['mineracao','legal'],provider:'DINAMIGE / MIEM',title:'Cadastro mineiro — trâmite, reservas, servidões e exclusões',url:'https://geoportal.miem.gub.uy/arcgis1091/services/Dinamige_VGM/Catastro_Minero_JS_2016/MapServer/WMSServer',
   keywords:'uruguai dinamige catastro minero pedimentos en tramite reserva minera servidumbres zonas de exclusion canteras',
   camadas:'0, 1, 2, 3, 4, 5',nota:'Canteiras de obra pública, pedimentos outorgados e em trâmite, reserva mineira, servidões e zonas de exclusão.',verificado:'2026-10-26'},
  {pais:'UY',temas:['ambiente','geologia'],provider:'DINAMIGE / MIEM',title:'Hidrogeologia — poços',url:'https://geoportal.miem.gub.uy/arcgis1091/services/Dinamige_GeoS/HidrogeologiaGeoS/MapServer/WMSServer',
   keywords:'uruguai dinamige hidrogeologia pozos aguas subterraneas',camadas:'0',verificado:'2026-10-26'},
  {pais:'UY',temas:['ambiente'],provider:'DINAMIGE / MIEM',title:'Vigilância radiológica ambiental',url:'https://geoportal.miem.gub.uy/arcgis1091/services/Dinamige_GeoS/LaboratorioGeoS/MapServer/WMSServer',
   keywords:'uruguai dinamige laboratorio vigilancia radiologica ambiental',camadas:'0',verificado:'2026-10-26'},
  {pais:'UY',temas:['geologia','base'],provider:'IDEuy',title:'IDEuy — Geofísica DINAMIGE, MDT e ortoimagens',url:'https://mapas.ide.uy/geoserver-raster/ows',
   keywords:'uruguai ideuy raster campo magnetico anomalo torio potasio mdt relieve ortofoto ortoimagens dinamige',
   camadas:'raster:_500K_Campo_Magnetico_Anomalo, raster:_500K_Cociente_de_Torio_Equivalente_Potasio, Capas_raster_DINAMIGE_ivincon, relieve:mdt_nacional, ortofotos:ortofoto_nacional',
   nota:'Campo magnético anômalo e razão Th/K 1:500k (DINAMIGE), MDT nacional, ortoimagens 2017-2018 e mosaico 1966.',verificado:'2026-10-26'},
  {pais:'UY',temas:['legal','mineracao'],provider:'IMPO',kind:'link',title:'Código de Minería — Ley 15.242',url:'https://www.impo.com.uy/bases/codigo-mineria/15242-1981',
   keywords:'uruguai codigo de mineria ley 15242 prospeccion exploracion explotacion concesion canon',
   nota:'Prospecção, exploração e concessão de exploração; canon de produção e superfície.',verificado:'2026-10-26'},
  {pais:'UY',temas:['legal','ambiente'],provider:'IMPO',kind:'link',title:'Ley 16.466 — Avaliação de Impacto Ambiental',url:'https://www.impo.com.uy/bases/leyes/16466-1994',
   keywords:'uruguai ley 16466 evaluacion impacto ambiental autorizacion ambiental previa AAP',
   nota:'Autorização Ambiental Prévia (AAP) obrigatória para extração mineral; regulamentada pelo Decreto 349/005.',verificado:'2026-10-26'},
  {pais:'UY',temas:['legal','ambiente'],provider:'IMPO',kind:'link',title:'Decreto 349/005 — Regulamento de avaliação ambiental',url:'https://www.impo.com.uy/bases/decretos/349-2005',
   keywords:'uruguai decreto 349/005 reglamento evaluacion impacto ambiental categorias A B C',verificado:'2026-10-26'},
  {pais:'UY',temas:['mineracao','geologia'],provider:'DINAMIGE / MIEM',kind:'link',title:'Geoportal MIEM — DINAMIGE (visualizador e serviços)',url:'https://geoportal.miem.gub.uy/',
   keywords:'uruguai geoportal miem dinamige visualizador catastro minero geologia',verificado:'2026-10-26'},
  {pais:'UY',temas:['ambiente','legal'],provider:'Ministerio de Ambiente',kind:'link',title:'Ministerio de Ambiente — licenciamento e áreas protegidas (SNAP)',url:'https://www.gub.uy/ministerio-ambiente/',
   keywords:'uruguai ministerio ambiente dinacea snap areas protegidas licenciamiento',verificado:'2026-10-26'},
  {pais:'UY',temas:['base'],provider:'IDEuy',kind:'link',title:'IDEuy — Infraestrutura de Dados Espaciais (visualizador)',url:'https://visualizador.ide.uy/',
   keywords:'uruguai ideuy visualizador datos espaciales ortofotos mdt limites',verificado:'2026-10-26'},
  {pais:'UY',temas:['legal'],provider:'MTOP',kind:'link',title:'MTOP — Transporte e obras públicas',url:'https://www.gub.uy/ministerio-transporte-obras-publicas/',
   keywords:'uruguai mtop rutas vialidad infraestructura transporte obras publicas',verificado:'2026-10-26'},

  /* ---------------- Colômbia ---------------- */
  {pais:'CO',temas:['geologia','mineracao'],provider:'Servicio Geológico Colombiano',title:'SGC — Depósitos minerais e subprovíncias metalogênicas',url:'https://srvags.sgc.gov.co/arcgis/services/Anomalias_Geoquimica/Depositos_Minerales/MapServer/WMSServer',
   keywords:'colombia sgc servicio geologico depositos minerales subprovincias metalogenicas geoquimica',
   camadas:'0, 1',nota:'Subprovíncias metalogênicas e depósitos minerais. Servidor lento: aguarde a leitura das capacidades.',verificado:'2026-10-26'},
  {pais:'CO',temas:['legal','base'],provider:'IGAC',title:'IGAC — Infraestrutura viária, abastecimento e saneamento',url:'https://mapas.igac.gov.co/server/services/infraestructura/infraestructurabasica/MapServer/WMSServer',
   keywords:'colombia igac infraestructura vial vias abastecimiento saneamiento ptap lagunas',
   camadas:'0, 1, 2, 3, 4, 5',nota:'Infraestrutura viária, disposição regional, PTAP, lagoas, abastecimento e saneamento.',verificado:'2026-10-26'},
  {pais:'CO',temas:['ambiente','legal'],provider:'IGAC',title:'IGAC — POMCAs (planos de ordenação de bacias)',url:'https://mapas.igac.gov.co/server/services/ambiente/pomcas/MapServer/WMSServer',
   keywords:'colombia igac pomca planes ordenacion manejo cuencas hidrograficas aprobados elaboracion',
   camadas:'0, 1, 2',nota:'POMCAs sem formular, em elaboração e aprovados.',verificado:'2026-10-26'},
  {pais:'CO',temas:['base'],provider:'IGAC',title:'IGAC — Curvas de nível 1:100.000',url:'https://mapas.igac.gov.co/server/services/carto/carto100000curvasdenivel/MapServer/WMSServer',
   keywords:'colombia igac curvas de nivel 100k topografia relieve',camadas:'0',verificado:'2026-10-26'},
  {pais:'CO',temas:['ambiente','legal'],provider:'Parques Nacionales',title:'PNN — Limites oficiais dos parques nacionais',url:'https://mapas.parquesnacionales.gov.co/arcgis/services/pnn/Limites_oficiales_Poligono/MapServer/WMSServer',
   keywords:'colombia parques nacionales naturales limites oficiales areas protegidas sinap',
   camadas:'0',nota:'Sem CORS: se a leitura de capacidades falhar, informe a camada manualmente (0). O RUNAP completo está no portal (link abaixo).',verificado:'2026-10-26'},
  {pais:'CO',temas:['legal','mineracao'],provider:'Función Pública',kind:'link',title:'Código de Minas — Ley 685 de 2001',url:'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=9202',
   keywords:'colombia codigo de minas ley 685 2001 contrato de concesion titulo minero regalias',
   nota:'Contrato de concessão único (30 anos), zonas excluídas e restringidas, PTO e licença ambiental.',verificado:'2026-10-26'},
  {pais:'CO',temas:['legal','ambiente'],provider:'Función Pública',kind:'link',title:'Decreto 1076 de 2015 — Setor Ambiente (licença ambiental)',url:'https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=78153',
   keywords:'colombia decreto 1076 2015 licencia ambiental ANLA CAR estudio impacto ambiental',verificado:'2026-10-26'},
  {pais:'CO',temas:['mineracao','legal'],provider:'ANM',kind:'link',title:'AnnA Minería — Cadastro mineiro nacional',url:'https://annamineria.anm.gov.co/',
   keywords:'colombia anm anna mineria catastro minero titulos solicitudes areas libres',
   nota:'Consulta de títulos, solicitações e áreas livres. Sem WMS público aberto (endereços testados em 26/10).',verificado:'2026-10-26'},
  {pais:'CO',temas:['mineracao','legal'],provider:'ANM',kind:'link',title:'Agencia Nacional de Minería',url:'https://www.anm.gov.co/',
   keywords:'colombia agencia nacional mineria anm fiscalizacion titulos',verificado:'2026-10-26'},
  {pais:'CO',temas:['geologia'],provider:'Servicio Geológico Colombiano',kind:'link',title:'SGC — Serviço Geológico Colombiano (portal)',url:'https://www.sgc.gov.co/',
   keywords:'colombia sgc geologia mapa geologico amenazas geoportal',nota:'Portal bloqueou a verificação automática de 26/10; abrir no navegador.',verificado:''},
  {pais:'CO',temas:['ambiente','legal'],provider:'ANLA',kind:'link',title:'ANLA — Autoridade Nacional de Licenças Ambientais',url:'https://www.anla.gov.co/',
   keywords:'colombia anla licencias ambientales vital geovisor',nota:'Não respondeu à verificação automática de 26/10.',verificado:''},
  {pais:'CO',temas:['ambiente','legal'],provider:'Minambiente',kind:'link',title:'Ministerio de Ambiente y Desarrollo Sostenible',url:'https://www.minambiente.gov.co/',
   keywords:'colombia minambiente politica ambiental normativa',verificado:'2026-10-26'},
  {pais:'CO',temas:['ambiente','legal'],provider:'Parques Nacionales',kind:'link',title:'RUNAP — Consulta de áreas protegidas',url:'https://runap.parquesnacionales.gov.co/',
   keywords:'colombia runap areas protegidas sinap consulta',verificado:'2026-10-26'},
  {pais:'CO',temas:['base'],provider:'IGAC',kind:'link',title:'IGAC — Instituto Geográfico Agustín Codazzi',url:'https://www.igac.gov.co/',
   keywords:'colombia igac cartografia catastro geodesia',verificado:'2026-10-26'},
  {pais:'CO',temas:['legal'],provider:'INVÍAS',kind:'link',title:'INVÍAS — Rede rodoviária nacional',url:'https://www.invias.gov.co/',
   keywords:'colombia invias vias carreteras red vial nacional',verificado:'2026-10-26'},
  {pais:'CO',temas:['legal'],provider:'ANI',kind:'link',title:'ANI — Agencia Nacional de Infraestructura (concessões)',url:'https://www.ani.gov.co/',
   keywords:'colombia ani infraestructura concesiones carreteras ferreas puertos aeropuertos',
   nota:'Concessões rodoviárias, férreas, portuárias e aeroportuárias. Os serviços ArcGIS da ANI não têm WMS habilitado (26/10).',verificado:'2026-10-26'},

  /* ---------------- Guiana Francesa ---------------- */
  {pais:'GF',temas:['geologia'],provider:'BRGM',title:'BRGM — Carta geológica da Guiana 1:500k e ultramar',url:'https://geoservices.brgm.fr/geologie',
   keywords:'guiana francesa guyane brgm geologie carte geologique 500000 outre-mer bss forages litologia',
   camadas:'GEOL_GUYTest, GEOLOGIE_OUTRE_MER, SCAN_D_GEOL50, BSS',
   nota:'77 camadas: carta geológica da Guiana 1:500.000, cartas impressas do ultramar, 1:50.000 e Banque du Sous-Sol (sondagens).',verificado:'2026-10-26'},
  {pais:'GF',temas:['ambiente','geologia'],provider:'BRGM',title:'BRGM — Riscos naturais (sismicidade, movimentos de terreno, cavidades)',url:'https://geoservices.brgm.fr/risques',
   keywords:'guiana francesa brgm risques sismicite mouvements de terrain cavites remontees de nappe',
   camadas:'SIS_OUTREMER, MVT_LOCALISE, CAVITE_LOCALISEE',verificado:'2026-10-26'},
  {pais:'GF',temas:['mineracao','legal'],provider:'GéoGuyane · DGTM',title:'GéoGuyane — SDOM, AEX, minas e carreiras',url:'https://datacarto.geoguyane.fr/wms',
   keywords:'guiana francesa geoguyane sdom schema departemental orientation miniere zone 0 1 2 aex autorisation exploitation mine carriere granulats orpaillage garimpo',
   camadas:'zone_0_s_973, zone_1_s_973, zone_2_s_973, l_mine_aex_s_973, MINE_CARRIERE_GRANULATS, sdc_zones_potentielles_s_973, deforestations_orpaillage_plateau_des_guyanes_2008',
   nota:'SDOM 2021 (zonas 0, 1 e 2), autorizações de exploração (AEX), minas e carreiras de granulados, esquema regional de carreiras e desmatamento por garimpo.',verificado:'2026-10-26'},
  {pais:'GF',temas:['ambiente','legal'],provider:'GéoGuyane · DEAL / ONF',title:'GéoGuyane — Reservas, Parque Amazônico, ZNIEFF, desmatamento',url:'https://datacarto.geoguyane.fr/wms',
   keywords:'guiana francesa geoguyane reserve naturelle apb biotope parc amazonien pag pnrg znieff deforestation onf',
   camadas:'n_enp_rnn_s_973, n_enp_apb_s_973, zonage_pag_harmonise, ParcnaturelregionaldeGuyanezon, znieff1_2014_csrpn_copy1, znieff2_terre_2014_s_973, deforest_2022_onf_guyane',
   nota:'Reservas naturais nacionais e regionais, APB, zoneamento do Parque Amazônico e do PNRG, ZNIEFF 2014, desmatamento ONF 2016-2022.',verificado:'2026-10-26'},
  {pais:'GF',temas:['legal','base'],provider:'GéoGuyane · DGTM',title:'GéoGuyane — Cadastro, estradas, fundiário e PPRT',url:'https://datacarto.geoguyane.fr/wms',
   keywords:'guiana francesa geoguyane cadastre plan cadastral routes pci foncier pprt risques technologiques hydrographie carthage',
   camadas:'PLAN_CADASTRAL, n_pcitronconsrouteenvigueur_s_973, l_potentielfoncier2019_p_973, PPRTPlansdepreventiondesrisque, bdcg_bvelementaires',
   nota:'911 camadas no total: cadastro, troços de estrada PCI, potencial fundiário, PPRT, BD Carthage (bacias) e ortofotos.',verificado:'2026-10-26'},
  {pais:'GF',temas:['base','legal','ambiente'],provider:'IGN · Géoplateforme',title:'Géoplateforme IGN — Limites, parcelas, rodovias, rede elétrica, CORINE DOM',url:'https://data.geopf.fr/wms-r/wms',
   keywords:'guiana francesa ign geoplateforme admin express parcellaire express cadastre routes voie ferree reseau electrique forets publiques corine land cover dom',
   camadas:'ADMINEXPRESS-COG-CARTO.LATEST, CADASTRALPARCELS.PARCELLAIRE_EXPRESS, IGNF_TRANSPORTNETWORKS.ROADS, IGNF_UTILITYANDGOVERNMENTALSERVICES.ALL, FORETS.PUBLIQUES, LANDCOVER.CLC18_DOM',
   nota:'Sem CORS: se a leitura de capacidades falhar, informe a camada manualmente.',verificado:'2026-10-26'},
  {pais:'GF',temas:['legal','mineracao'],provider:'Légifrance',kind:'link',title:'Code minier — Légifrance',url:'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006071785/',
   keywords:'guiana francesa code minier permis exclusif de recherches concession aex arm orpaillage',
   nota:'Permis exclusif de recherches, concessão, AEX e ARM. O site bloqueia a verificação automática; abrir no navegador.',verificado:''},
  {pais:'GF',temas:['legal','ambiente'],provider:'Légifrance',kind:'link',title:'Code de l’environnement — Légifrance',url:'https://www.legifrance.gouv.fr/codes/texte_lc/LEGITEXT000006074220/',
   keywords:'guiana francesa code environnement autorisation environnementale etude impact icpe',
   nota:'Autorização ambiental, estudo de impacto e ICPE. Abrir no navegador.',verificado:''},
  {pais:'GF',temas:['mineracao','legal'],provider:'Camino · DGALN',kind:'link',title:'Camino — Cadastre minier (títulos e autorizações)',url:'https://camino.beta.gouv.fr/',
   keywords:'guiana francesa camino cadastre minier titres miniers permis concessions aex demarches',
   nota:'Cadastro mineiro nacional com todos os títulos da Guiana. Não respondeu à verificação automática de 26/10.',verificado:''},
  {pais:'GF',temas:['base','mineracao','ambiente'],provider:'GéoGuyane',kind:'link',title:'GéoGuyane — Portal de dados da Guiana',url:'https://www.geoguyane.fr/accueil',
   keywords:'guiana francesa geoguyane portail donnees catalogue cartes',verificado:'2026-10-26'},
  {pais:'GF',temas:['legal'],provider:'Préfecture de la Guyane',kind:'link',title:'Services de l’État en Guyane (préfecture, DGTM)',url:'https://www.guyane.gouv.fr/',
   keywords:'guiana francesa prefecture dgtm arretes mines environnement police',
   nota:'Arrêtés préfectoraux (SDOM, AEX, autorizações ambientais) e DGTM.',verificado:'2026-10-26'}
];
S.wms=S.wms||[];
let WMS_LAST_PROVIDER='', WMS_CAP_LAYERS=[];
const WMS_FILTRO={pais:'',tema:''};

function wmsNorm(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();}
function wmsStatus(msg,kind){
  const e=document.getElementById('wmsStatus'); if(!e)return;
  e.textContent=msg; e.style.color=kind==='err'?'#dc3636':kind==='ok'?'#18884b':'';
}
function wmsPaisOk(x){
  const p=WMS_FILTRO.pais; if(!p)return true;
  return p==='SUL'?WMS_PAISES_SUL.includes(x.pais):x.pais===p;
}
/* Filtros de país e tema acima dos resultados. O painel é montado uma vez no
   template; os chips são recriados a cada mudança para refletir a seleção. */
function wmsFiltrosRender(){
  const box=document.getElementById('wmsFiltros'); if(!box)return;
  const chip=(cls,val,label,on)=>`<span class="chip ${cls}${on?' on':''}" data-${cls}="${val}">${esc(label)}</span>`;
  let h=chip('pais','','Todos',!WMS_FILTRO.pais)+chip('pais','SUL','América do Sul',WMS_FILTRO.pais==='SUL');
  Object.keys(WMS_PAISES).forEach(k=>h+=chip('pais',k,WMS_PAISES[k],WMS_FILTRO.pais===k));
  h+='<span class="sep"></span>'+chip('tema','','Todos os temas',!WMS_FILTRO.tema);
  Object.keys(WMS_TEMAS).forEach(k=>h+=chip('tema',k,WMS_TEMAS[k],WMS_FILTRO.tema===k));
  box.innerHTML=h;
  box.querySelectorAll('.chip').forEach(c=>c.onclick=()=>{
    if(c.dataset.pais!==undefined)WMS_FILTRO.pais=c.dataset.pais; else WMS_FILTRO.tema=c.dataset.tema||'';
    wmsFiltrosRender(); wmsCatalogRender((document.getElementById('wmsSearch')||{}).value||'');
  });
}
function wmsCatalogRender(query){
  const box=document.getElementById('wmsCatalogResults'); if(!box)return;
  const q=wmsNorm(query);
  const found=WMS_CATALOG.filter(x=>wmsPaisOk(x)
    &&(!WMS_FILTRO.tema||(x.temas||[]).includes(WMS_FILTRO.tema))
    &&(!q||wmsNorm([x.provider,x.title,x.keywords,WMS_PAISES[x.pais],(x.temas||[]).map(t=>WMS_TEMAS[t]).join(' '),x.camadas,x.nota].join(' ')).includes(q)));
  box.innerHTML='';
  if(!found.length){
    box.innerHTML='<div class="hint">Nenhum servidor conhecido encontrado para o filtro. Informe a URL abaixo para conectar manualmente.</div>';
    return;
  }
  let paisAtual=null;
  found.forEach(x=>{
    if(x.pais!==paisAtual){
      paisAtual=x.pais;
      const h=document.createElement('div'); h.className='wmsPais';
      const n=found.filter(y=>y.pais===x.pais).length;
      h.innerHTML=esc(WMS_PAISES[x.pais]||x.pais)+'<small>'+n+(n===1?' item':' itens')+'</small>';
      box.appendChild(h);
    }
    const link=x.kind==='link';
    const e=document.createElement('div'); e.className='wmsCard'+(link?' link':'');
    const temas=(x.temas||[]).map(t=>'<span class="tag">'+esc(WMS_TEMAS[t]||t)+'</span>').join('');
    const ver=x.verificado?'<span class="tag" title="Serviço ou página conferidos nesta data">✓ '+esc(x.verificado)+'</span>':'';
    e.innerHTML=`<b>${link?'↗':'🌐'} ${esc(x.title)}</b><div class="wmsMeta"><span class="tag">${esc(x.provider)}</span>${temas}${ver}</div><small>${esc(x.url)}</small>${x.nota?'<div class="wmsNota">'+esc(x.nota)+'</div>':''}`;
    e.title=link?'Abre o portal ou a norma em nova aba':'Preenche o endereço WMS para conectar';
    e.onclick=()=>{
      if(link){window.open(x.url,'_blank','noopener');wmsStatus(`${x.provider}: aberto em nova aba do navegador.`);return;}
      box.querySelectorAll('.wmsCard').forEach(n=>n.classList.remove('sel'));e.classList.add('sel');
      document.getElementById('wmsUrl').value=x.url; WMS_LAST_PROVIDER=x.provider;
      const man=document.getElementById('wmsManualLayer');
      if(man&&x.camadas)man.placeholder='Ex.: '+x.camadas.split(',')[0].trim();
      wmsStatus(`${x.provider} selecionado. Clique em “Conectar e listar camadas”.`+(x.camadas?` Camadas conferidas: ${x.camadas}.`:''));
    };
    box.appendChild(e);
  });
}
/* Botão da aba MEIO AMBIENTE: abre o painel já filtrado em Argentina,
   Uruguai, Colômbia e Guiana Francesa, com todos os temas. */
function wmsAbrirAmericaDoSul(btn){
  WMS_FILTRO.pais='SUL'; WMS_FILTRO.tema='';
  const sec=document.getElementById('secWMS');
  if(sec&&btn&&typeof ribbonOpen==='function'){try{ribbonOpen(sec,btn,'Geologia e mineração · América do Sul');}catch(_){}}
  const s=document.getElementById('wmsSearch'); if(s)s.value='';
  wmsFiltrosRender(); wmsCatalogRender('');
  const box=document.getElementById('wmsCatalogResults'); if(box)box.scrollTop=0;
  wmsStatus('Argentina, Uruguai, Colômbia e Guiana Francesa: escolha um serviço WMS ou abra um portal/norma. Filtre por tema acima.');
}
window.wmsAbrirAmericaDoSul=wmsAbrirAmericaDoSul;
/* Botão na aba MEIO AMBIENTE. Vários módulos posteriores reconstroem os grupos
   dessa aba por inteiro, então o grupo é reinstalado antes de cada montagem da
   faixa (mesmo padrão dos Mapas da Sanepar). O pictograma ambiente_americasul
   é registrado junto da família ambiental, em alagis-favorabilidade-fluxo. */
function wmsInstalarBotaoAmericaDoSul(){
  if(typeof CATS==='undefined')return;
  const cat=CATS.find(c=>c.id==='ambiente'); if(!cat||!Array.isArray(cat.grupos))return;
  if(cat.grupos.some(g=>(g.it||[]).some(i=>i.ic==='ambiente_americasul')))return;
  const grupo={label:'América do Sul',it:[{ic:'ambiente_americasul',nome:'Geologia e mineração',
    desc:'Serviços oficiais de geologia, mineração, meio ambiente e marco legal da Argentina, Uruguai, Colômbia e Guiana Francesa',
    act:btn=>wmsAbrirAmericaDoSul(btn)}]};
  /* logo após o grupo que já traz os Serviços WMS; senão, no fim da aba */
  const i=cat.grupos.findIndex(g=>(g.it||[]).some(x=>x.ic==='wms'||/^Servi[çc]os WMS/i.test(x.nome||'')));
  if(i>=0)cat.grupos.splice(i+1,0,grupo); else cat.grupos.push(grupo);
}
(function(){
  const base=window.ribbonBuild;
  if(typeof base==='function')window.ribbonBuild=function(){wmsInstalarBotaoAmericaDoSul();return base.apply(this,arguments);};
  wmsInstalarBotaoAmericaDoSul();
})();
function wmsCapabilitiesUrl(base,version){
  const u=new URL(base,location.href);
  ['service','request','version'].forEach(k=>{u.searchParams.delete(k);u.searchParams.delete(k.toUpperCase());});
  u.searchParams.set('SERVICE','WMS');u.searchParams.set('REQUEST','GetCapabilities');u.searchParams.set('VERSION',version||'1.3.0');
  return u.href;
}
function wmsDirect(el,name){
  return Array.from(el.children||[]).find(n=>(n.localName||n.nodeName).split(':').pop()===name)||null;
}
function wmsText(el,name){
  const n=wmsDirect(el,name);return n?(n.textContent||'').trim():'';
}
function wmsParseCapabilities(txt){
  const xml=new DOMParser().parseFromString(txt,'text/xml');
  const pe=xml.querySelector('parsererror'); if(pe)throw new Error('Resposta XML inválida');
  const all=Array.from(xml.getElementsByTagNameNS('*','Layer'));
  const out=[],seen=new Set();
  all.forEach(el=>{
    const name=wmsText(el,'Name'); if(!name||seen.has(name))return;seen.add(name);
    out.push({name,title:wmsText(el,'Title')||name,abstract:wmsText(el,'Abstract')});
  });
  return out;
}
async function wmsConnect(){
  const base=(document.getElementById('wmsUrl').value||'').trim();
  if(!/^https?:\/\//i.test(base)){wmsStatus('Informe uma URL WMS completa, iniciando com http:// ou https://.','err');return;}
  const btn=document.getElementById('btnWmsConnect'), versions=[document.getElementById('wmsVersion').value];
  versions.push(versions[0]==='1.3.0'?'1.1.1':'1.3.0');
  btn.disabled=true;wmsStatus('Consultando GetCapabilities…');
  let lastErr=null;
  for(const version of versions){
    try{
      const r=await fetch(wmsCapabilitiesUrl(base,version),{mode:'cors',cache:'no-store'});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const layers=wmsParseCapabilities(await r.text());
      if(!layers.length)throw new Error('O servidor não informou camadas publicáveis');
      WMS_CAP_LAYERS=layers;document.getElementById('wmsVersion').value=version;
      document.getElementById('wmsCapabilities').style.display='';
      wmsLayerRender('');
      wmsStatus(`Conectado: ${layers.length} camada(s) disponível(is) · WMS ${version}.`,'ok');
      btn.disabled=false;return;
    }catch(e){lastErr=e;}
  }
  WMS_CAP_LAYERS=[];document.getElementById('wmsCapabilities').style.display='none';
  wmsStatus(`Não foi possível ler o catálogo (${lastErr&&lastErr.message||'bloqueio do servidor'}). Informe abaixo o nome técnico da camada para adicioná-la manualmente.`,'err');
  btn.disabled=false;
}
function wmsLayerRender(query){
  const box=document.getElementById('wmsLayerList');if(!box)return;
  const q=wmsNorm(query); box.innerHTML='';
  WMS_CAP_LAYERS.filter(x=>!q||wmsNorm(x.name+' '+x.title+' '+x.abstract).includes(q)).forEach((x,i)=>{
    const id='wmsCap_'+i+'_'+Math.random().toString(36).slice(2,6), e=document.createElement('label');
    e.className='wmsLayerChoice';e.title=x.abstract||x.title;
    e.innerHTML=`<input type="checkbox" value="${esc(x.name)}" data-title="${esc(x.title)}">
      <span><b>${esc(x.title)}</b><small>${esc(x.name)}</small></span>`;
    box.appendChild(e);
  });
  if(!box.children.length)box.innerHTML='<div class="hint" style="padding:8px">Nenhuma camada corresponde ao filtro.</div>';
}
function wmsBaseUrl(url){
  const u=new URL(url,location.href);
  ['service','request','version','layers','styles','format','transparent','bbox','width','height','crs','srs']
    .forEach(k=>{u.searchParams.delete(k);u.searchParams.delete(k.toUpperCase());});
  return u.href;
}
function wmsCreateLayer(meta,doRefresh=true){
  if(meta.protocol==='WMTS')return window.GeoMineLatinOGC.createWMTS(meta,doRefresh);
  const o={id:meta.id||('W'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)),
    name:meta.name||meta.layers||'Camada WMS',provider:meta.provider||'',url:wmsBaseUrl(meta.url),
    layers:meta.layers,version:meta.version||'1.3.0',opacity:Number(meta.opacity??0.85),
    visible:meta.visible!==false,attribution:meta.attribution||meta.provider||'WMS',llayer:null};
  o.llayer=L2.tileLayer.wms(o.url,{layers:o.layers,styles:'',format:'image/png',transparent:true,
    version:o.version,opacity:o.opacity,attribution:o.attribution,maxZoom:24,uppercase:true});
  o.llayer.on('tileerror',()=>{if(!o._warned){o._warned=true;wmsStatus(`O servidor não entregou algumas imagens de “${o.name}”. Verifique camada, CRS e disponibilidade.`,'err');}});
  if(o.visible)o.llayer.addTo(map);
  S.wms.push(o);wmsApplyOrder();
  if(doRefresh){refreshUI();toast(`WMS adicionado: ${o.name}`);}
  return o;
}
function wmsAddSelected(){
  const url=(document.getElementById('wmsUrl').value||'').trim();
  if(!/^https?:\/\//i.test(url)){wmsStatus('Escolha um servidor ou informe a URL WMS.','err');return;}
  const checks=Array.from(document.querySelectorAll('#wmsLayerList input:checked'));
  const manual=(document.getElementById('wmsManualLayer').value||'').trim();
  const chosen=checks.map(c=>({layers:c.value,name:c.dataset.title||c.value}));
  if(manual)chosen.push({layers:manual,name:manual});
  if(!chosen.length){wmsStatus('Marque ao menos uma camada ou informe o nome técnico manual.','err');return;}
  const version=document.getElementById('wmsVersion').value,opacity=Number(document.getElementById('wmsOpacity').value);
  chosen.forEach(x=>wmsCreateLayer({url,layers:x.layers,name:x.name,version,opacity,provider:WMS_LAST_PROVIDER},false));
  refreshUI();wmsStatus(`${chosen.length} camada(s) WMS adicionada(s) ao mapa.`,'ok');
  toast(`${chosen.length} camada(s) WMS adicionada(s)`);
}
function wmsApplyOrder(){
  (S.wms||[]).forEach((w,i)=>{if(w.llayer&&w.llayer.setZIndex)w.llayer.setZIndex(120+i);});
}
function wmsDelete(w){
  if(w.llayer)map.removeLayer(w.llayer);
  S.wms=S.wms.filter(x=>x!==w);refreshUI();
}
function wmsEdit(w){
  const n=prompt('Nome da camada WMS:',w.name);if(n===null)return;
  const op=prompt('Opacidade (0 a 1):',String(w.opacity));
  w.name=n.trim()||w.name;
  if(op!==null&&!isNaN(Number(op))){w.opacity=Math.max(0,Math.min(1,Number(op)));w.llayer.setOpacity(w.opacity);}
  refreshUI();
}
function wmsRenderRows(){
  const list=document.getElementById('layerList');if(!list)return;
  const q=wmsNorm(S._layerQuery||'');
  (S.wms||[]).forEach(w=>{
    if(q&&!wmsNorm(w.name+' '+w.provider+' '+w.layers).includes(q))return;
    const el=document.createElement('div');el.className='layer';
    el.innerHTML=`<span class="drag" title="Camada remota WMS">⠿</span>
      <span class="eye ${w.visible?'on':''}" title="Visibilidade">${w.visible?'◉':'○'}</span>
      <span class="wmsGlobe">◎</span><span class="nm">${esc(w.name)}</span>
      <span class="cnt">${w.protocol==='WMTS'?'WMTS':'WMS'}</span><span class="lcfg" title="Nome e opacidade" style="cursor:pointer;padding:0 5px;opacity:.65">⚙</span>
      <span class="gdel wdel" title="Remover">✕</span>`;
    el.querySelector('.eye').onclick=e=>{e.stopPropagation();w.visible=!w.visible;
      if(w.visible)w.llayer.addTo(map);else map.removeLayer(w.llayer);wmsApplyOrder();refreshUI();};
    el.querySelector('.lcfg').onclick=e=>{e.stopPropagation();wmsEdit(w);};
    el.querySelector('.wdel').onclick=e=>{e.stopPropagation();if(confirm(`Remover a camada WMS “${w.name}”?`))wmsDelete(w);};
    el.ondblclick=()=>wmsEdit(w);list.appendChild(el);
  });
  const no=document.getElementById('noLayers');
  if(no&&(S.wms||[]).length)no.style.display='none';
}

/* ============================================================================
   ANM / SIGMINE — baixa direto os processos minerários da área da tela.
   Não há escolha de UF: a consulta é feita pela extensão visível e o estado
   é reconhecido pelos próprios processos encontrados.
   ========================================================================== */
function anmStatus(msg,kind){
  const e=document.getElementById('anmStatus'); if(!e)return;
  e.textContent=msg;
  e.style.color=kind==='err'?'#dc3636':kind==='ok'?'#18884b':'';
}
/* Extensão visível convertida para o CRS do SHP. Amostram-se bordas e centro,
   não só dois cantos, para o recorte continuar correto em projeções UTM. */
function anmRectVisivel(crs){
  const b=map.getBounds(), w=b.getWest(),e=b.getEast(),s=b.getSouth(),n=b.getNorth();
  const pts=[];
  [0,.5,1].forEach(ix=>[0,.5,1].forEach(iy=>{
    const p=fromWGS(crs,w+(e-w)*ix,s+(n-s)*iy);
    if(p&&isFinite(p[0])&&isFinite(p[1]))pts.push(p);
  }));
  if(!pts.length)throw new Error('Não foi possível converter a tela para o CRS da ANM');
  return {xmin:Math.min(...pts.map(p=>p[0])),xmax:Math.max(...pts.map(p=>p[0])),
          ymin:Math.min(...pts.map(p=>p[1])),ymax:Math.max(...pts.map(p=>p[1]))};
}
function anmGeomBBox(geom){
  let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;
  (function walk(v){
    if(!Array.isArray(v))return;
    if(v.length>=2&&isFinite(v[0])&&isFinite(v[1])){
      xmin=Math.min(xmin,+v[0]);xmax=Math.max(xmax,+v[0]);
      ymin=Math.min(ymin,+v[1]);ymax=Math.max(ymax,+v[1]);return;
    }
    v.forEach(walk);
  })(geom);
  return {xmin,ymin,xmax,ymax};
}
function anmBBoxToca(a,b){
  return a.xmax>=b.xmin&&a.xmin<=b.xmax&&a.ymax>=b.ymin&&a.ymin<=b.ymax;
}
/* Sutherland–Hodgman contra um retângulo: o limite resultante coincide
   matematicamente com a borda da tela, sem a aproximação serrilhada de raster. */
function anmClipRing(ring,R){
  if(!Array.isArray(ring)||ring.length<3)return null;
  let p=ring.slice();
  if(p.length>1&&p[0][0]===p[p.length-1][0]&&p[0][1]===p[p.length-1][1])p.pop();
  const edge=(arr,inside,cross)=>{
    const out=[]; if(!arr.length)return out;
    let A=arr[arr.length-1],Ai=inside(A);
    for(const B of arr){const Bi=inside(B);
      if(Bi){if(!Ai)out.push(cross(A,B));out.push(B);}
      else if(Ai)out.push(cross(A,B));
      A=B;Ai=Bi;
    }
    return out;
  };
  const vx=(A,B,x)=>{const d=B[0]-A[0],t=Math.abs(d)<1e-20?0:(x-A[0])/d;return [x,A[1]+(B[1]-A[1])*t];};
  const hy=(A,B,y)=>{const d=B[1]-A[1],t=Math.abs(d)<1e-20?0:(y-A[1])/d;return [A[0]+(B[0]-A[0])*t,y];};
  p=edge(p,q=>q[0]>=R.xmin,(a,b)=>vx(a,b,R.xmin));
  p=edge(p,q=>q[0]<=R.xmax,(a,b)=>vx(a,b,R.xmax));
  p=edge(p,q=>q[1]>=R.ymin,(a,b)=>hy(a,b,R.ymin));
  p=edge(p,q=>q[1]<=R.ymax,(a,b)=>hy(a,b,R.ymax));
  if(p.length<3)return null;
  const q=p[0];p.push([q[0],q[1]]);return p;
}
function anmClipFeature(f,R){
  const rings=(f.geom||[]).map(r=>anmClipRing(r,R)).filter(r=>r&&r.length>=4);
  if(!rings.length)return null;
  return {geom:rings,multi:true,props:f.props||{}};
}
function anmZipEntry(zip,ext,stem){
  const paths=Object.keys(zip.files).filter(p=>!zip.files[p].dir&&new RegExp('\\.'+ext+'$','i').test(p));
  if(!stem)return paths[0]||null;
  return paths.find(p=>p.replace(/^.*\//,'').replace(/\.[^.]+$/,'').toLowerCase()===stem)||null;
}
/* A ANM publica a camada vetorial no MapServer/0 (processos ativos, SIRGAS
   2000). Em 2026 a camada trocou o campo FID por OBJECTID e a consulta antiga
   (where=FID IS NOT NULL) passou a falhar com "Failed to execute query". O
   identificador agora vem dos metadados da própria camada, com alternativas
   de filtro caso o serviço mude de novo. */
const ANM_LAYER='https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/dados_anm/MapServer/0';
const ANM_FEATURE_QUERY=ANM_LAYER+'/query';
const ANM_MAX_TELA=20000;           /* acima disto, pede para aproximar */
let ANM_META=null,ANM_RODANDO=false;
function anmJsonp(url){
  return new Promise((resolve,reject)=>{
    const cb='__alagisAnm_'+Date.now().toString(36)+Math.random().toString(36).slice(2);
    const sc=document.createElement('script'),u=new URL(url);
    u.searchParams.set('f','json');u.searchParams.set('callback',cb);
    const fim=()=>{try{delete window[cb];}catch(e){window[cb]=undefined;}sc.remove();clearTimeout(tm);};
    window[cb]=v=>{fim();resolve(v);};
    sc.onerror=()=>{fim();reject(new Error('o serviço vetorial da ANM não respondeu'));};
    const tm=setTimeout(()=>{fim();reject(new Error('tempo esgotado no serviço da ANM'));},45000);
    sc.src=u.href;document.head.appendChild(sc);
  });
}
async function anmArcRequest(params,url=ANM_FEATURE_QUERY){
  const u=new URL(url);
  Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));
  u.searchParams.set('f','json');
  try{
    const r=await fetch(u.href,{mode:'cors',cache:'no-store'});
    if(!r.ok)throw new Error('ANM HTTP '+r.status);
    const j=await r.json();if(j.error)throw new Error(j.error.message||'consulta rejeitada');
    return j;
  }catch(e){
    /* sem CORS (outro domínio, proxy): JSONP. Erro de consulta não tenta de novo */
    if(/rejeitada|Failed to execute|Invalid|inválid/i.test(e&&e.message||''))throw e;
    const j=await anmJsonp(u.href);
    if(j&&j.error)throw new Error(j.error.message||'consulta rejeitada');
    return j;
  }
}
async function anmMeta(){
  if(ANM_META)return ANM_META;
  try{
    const j=await anmArcRequest({},ANM_LAYER);
    const oid=j.objectIdField||(j.fields||[]).find(f=>f.type==='esriFieldTypeOID')?.name||'OBJECTID';
    ANM_META={oid,max:Math.max(100,Math.min(+j.maxRecordCount||1000,2000)),fields:j.fields||[],
      paginacao:j.advancedQueryCapabilities?.supportsPagination!==false};
  }catch(e){ANM_META={oid:'OBJECTID',max:1000,fields:[],paginacao:true};}
  return ANM_META;
}
/* campos úteis: sem geometria e sem as medidas internas do SQL Server (em graus) */
const anmCampoUtil=f=>f&&f.name&&f.type!=='esriFieldTypeGeometry'&&!/[().]/.test(f.name);
async function anmImportarTela(){
  if(ANM_RODANDO)return;
  ANM_RODANDO=true;
  const btn=document.getElementById('btnAnmImport');if(btn)btn.disabled=true;
  anmStatus('Consultando os processos minerários da área da tela…');
  showLoad('ANM · consultando processos minerários…');
  try{
    const b=map.getBounds(),cl=(v,a,z)=>Math.max(a,Math.min(z,v));
    const env=[cl(b.getWest(),-180,180),cl(b.getSouth(),-90,90),cl(b.getEast(),-180,180),cl(b.getNorth(),-90,90)].join(',');
    const meta=await anmMeta();
    const base={geometry:env,geometryType:'esriGeometryEnvelope',inSR:4326,spatialRel:'esriSpatialRelIntersects'};
    /* 1º a lista de IDs da tela: é exata (a contagem do servidor usa a caixa
       envolvente de cada processo e superestima) e não tem o limite de 2.000 */
    let where,ids=null,erro=null;
    for(const w of [meta.oid+' IS NOT NULL','1=1',null]){
      try{const p={...base,returnIdsOnly:true};if(w)p.where=w;
        const r=await anmArcRequest(p);
        if(!Array.isArray(r.objectIds)&&r.objectIds!==null)throw new Error('resposta sem lista de IDs');
        ids=(r.objectIds||[]).slice().sort((x,y)=>x-y);where=w;break;}
      catch(e){erro=e;}
    }
    if(!ids)throw erro||new Error('o serviço da ANM não informou os processos da tela');
    const total=ids.length;
    if(!total)throw new Error('nenhum processo minerário ativo na área da tela');
    if(total>ANM_MAX_TELA)throw new Error(total.toLocaleString('pt-BR')+' processos na tela; aproxime o zoom (até '+ANM_MAX_TELA.toLocaleString('pt-BR')+' por vez)');
    /* 2º os processos em lotes de IDs (URL curta, sem depender de paginação) */
    const LOTE=Math.min(500,meta.max),features=[];let fields=null,faltaram=0;
    for(let i=0;i<total;i+=LOTE){
      showLoad('ANM · baixando processos da tela… '+Math.min(i,total).toLocaleString('pt-BR')+' de '+total.toLocaleString('pt-BR'));
      const p={objectIds:ids.slice(i,i+LOTE).join(','),outFields:'*',returnGeometry:true,returnZ:false,returnM:false,outSR:4674,geometryPrecision:8};
      let d;
      try{d=await anmArcRequest(p);}catch(e){d=await anmArcRequest(p);}   // uma nova tentativa por lote
      if(!fields)fields=(d.fields&&d.fields.length?d.fields:meta.fields);
      let vieram=0;
      for(const x of d.features||[]){
        if(!x.geometry||!x.geometry.rings)continue;
        const at=x.attributes||{},props={};
        for(const k of Object.keys(at))if(!/[().]/.test(k)&&k!=='Shape')props[k]=at[k];
        features.push({geom:x.geometry.rings,multi:true,props});vieram++;
      }
      faltaram+=Math.max(0,Math.min(LOTE,total-i)-vieram);
    }
    const incompleto=faltaram>0;
    if(!features.length)throw new Error('o serviço não devolveu geometria para a área da tela');
    /* só siglas válidas: há processos com UF "DADO NÃO CADASTRADO" */
    const ufs=[...new Set(features.map(f=>String(f.props.UF||'').trim().toUpperCase()).filter(u=>/^[A-Z]{2}$/.test(u)))].sort();
    const nome=('ANM — Processos na tela'+(ufs.length?' — '+ufs.join(', '):'')).slice(0,80);
    const flds=(fields||[]).filter(anmCampoUtil).map(f=>({name:f.name,
      type:/Integer|Double|Single|OID|SmallInteger/i.test(f.type)?'N':'C',
      length:f.length||80,decimal:/Double|Single/i.test(f.type)?6:0,alias:f.alias||f.name}));
    const L=addLayer({name:nome,gtype:'polygon',features,
      fields:flds.length?flds:[{name:meta.oid,type:'N',length:9,decimal:0}],
      crs:'EPSG:4674',color:'#268bd2',
      src:{url:ANM_FEATURE_QUERY,provider:'ANM / SIGMINE',official:true,
        importedAt:new Date().toISOString(),extent:env}});
    L._anm={uf:ufs.join(','),ufs,url:ANM_FEATURE_QUERY,recorte:'processos completos que intersectam a tela',
      fonte:'Serviço vetorial oficial ANM · SIGMINE'};
    L.fill=.16;L.weight=1.5;L.sym.fill=.16;L.sym.weight=1.5;
    drawLayer(L);refreshUI();
    const aviso=incompleto?' Atenção: '+faltaram.toLocaleString('pt-BR')+' processo(s) vieram sem geometria do servidor.':'';
    anmStatus(features.length.toLocaleString('pt-BR')+' processo(s) completo(s), com atributos'+(ufs.length?', em '+ufs.join(', '):'')+'.'+aviso,aviso?'err':'ok');
    toast('ANM: '+features.length.toLocaleString('pt-BR')+' processo(s) carregado(s)'+(ufs.length?' — '+ufs.join(', '):''));
  }catch(e){
    const m=e&&e.message||String(e);
    anmStatus('Não foi possível baixar: '+m+'.','err');
    toast('⚠ ANM: '+m);
  }finally{
    hideLoad();ANM_RODANDO=false;if(btn)btn.disabled=false;
  }
}
/* Botão ANM (faixa ou painel de órgãos): abre o painel e já baixa a área da tela */
function anmAbrePainel(anchor){
  const sec=document.getElementById('secANM');
  /* o painel precisa de um botão de referência; sem ele, baixa do mesmo jeito */
  const ref=anchor&&anchor.getBoundingClientRect?anchor:
    [...document.querySelectorAll('#ribbon .rbtn')].find(b=>/^\s*ANM\s*$/.test(b.textContent))||document.querySelector('#ribbon .rbtn.on');
  if(sec&&ref&&typeof ribbonOpen==='function'){try{ribbonOpen(sec,ref,'ANM · Processos Minerários');}catch(_){}}
  anmImportarTela();
}
window.anmAbrePainel=anmAbrePainel;

/* Acrescenta WMS à árvore sem alterar a renderização consolidada das demais camadas. */
const refreshUIBaseWMS=refreshUI;
refreshUI=function(){
  refreshUIBaseWMS();
  wmsRenderRows();
  // Projetos de cava vinculados acompanham a geometria da linha-guia. O
  // debounce evita regenerar dezenas de vezes durante um único arraste.
  if(typeof cavaLiveSync==='function') cavaLiveSync();
  // Camadas importadas/criadas enquanto a Mina está aberta entram na cena
  // automaticamente, sem uma segunda ação do usuário.
  if(S._view==='v3d' && typeof mina3DAuto==='function') mina3DAuto(false);
};

document.getElementById('btnWmsSearch').onclick=()=>wmsCatalogRender(document.getElementById('wmsSearch').value);
document.getElementById('wmsSearch').addEventListener('input',e=>wmsCatalogRender(e.target.value));
document.getElementById('wmsSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();wmsCatalogRender(e.target.value);}});
document.getElementById('btnWmsConnect').onclick=wmsConnect;
document.getElementById('wmsLayerFilter').addEventListener('input',e=>wmsLayerRender(e.target.value));
document.getElementById('btnWmsAdd').onclick=wmsAddSelected;
document.getElementById('btnAnmImport').onclick=anmImportarTela;
wmsFiltrosRender();
wmsCatalogRender('');
wmsRenderRows();
