/* GeoMine — nomes e símbolos estruturais.
   Referência: FGDC-STD-013-2006, apêndice A, seções 4, 6, 7, 8 e 9.
   Desenhos próprios a partir das especificações; nenhuma fonte/glifo SGB
   foi copiada. Cores e tamanho são configuráveis. IDs de projeto preservados. */
(function(){
  'use strict';
  const api=window.GeoMineGeology=window.GeoMineGeology||{};
  const linear=new Set(['lineacao','plunging','dobra']);
  const planar=new Set(['acamamento','foliacao','xistosidade','falha','fratura','veio','dique','zona-cisalhamento']);
  const catalog={
    litologia:['Litologia','Unidade litológica mapeada em área. Cor e hachura devem corresponder à litologia informada; nenhuma composição é deduzida automaticamente.'],
    'contato-geologico':['Contato geológico','Limite entre unidades geológicas. O tipo de contato e a confiança devem ser informados; a linha não determina por si só sua natureza.'],
    falha:['Falha','Traçado da falha. Tipo, cinemática e atitude são atributos distintos; não se presume falha normal, inversa ou transcorrente.'],
    dobra:['Traço axial de dobra','Traço cartográfico da superfície axial. Não equivale à medida pontual do eixo de dobra; anticlinal/sinclinal exigem informação estratigráfica.'],
    acamamento:['Acamamento','Atitude do acamamento: direção do plano (strike) e mergulho (dip). Convenção FGDC 6.1–6.4; inversão estratigráfica nunca é inferida apenas pelo ângulo.'],
    xistosidade:['Xistosidade','Foliação metamórfica/tectônica: direção do plano e mergulho. Símbolos FGDC 8.3.1–8.3.3.'],
    fratura:['Fratura / junta','Descontinuidade mapeada. Fratura não implica rejeito ou cinemática de falha; a atitude planar é registrada separadamente.'],
    veio:['Veio','Corpo de preenchimento mineral representado pelo seu traçado. Mineral e espessura devem ser informados; não é tratado como falha.'],
    dique:['Dique','Corpo tabular intrusivo representado pela área aflorante. Litologia, espessura e atitude são informadas na ficha, sem pressupor diabásio.'],
    'zona-cisalhamento':['Zona de cisalhamento','Faixa de deformação representada em área quando sua largura é mapeável. Cinemática e atitude devem ser informadas, não deduzidas do polígono.'],
    sondagem:['Furo de sondagem','Boca e trajetória do furo. Azimute e inclinação da sondagem não são o mergulho de uma camada litológica.'],
    spt:['Sondagem a percussão / ensaio SPT','Local de investigação geotécnica; profundidade, N-SPT e nível de água são atributos do ensaio.'],
    trincheira:['Trincheira','Escavação de investigação representada pelo seu eixo. Profundidade e comprimento são atributos, não espessura litológica.'],
    afloramento:['Afloramento','Local de observação de rocha exposta. O marcador de localização não representa uma medida estrutural nem indica atividade de mineração.'],
    'ponto-amostra':['Ponto de amostragem','Local de coleta de amostra. Material, identificação e resultados devem permanecer como atributos da amostra.'],
    'dominio-geologico':['Domínio geológico','Área de domínio interpretado. O polígono não implica continuidade ou volume comprovado em profundidade.'],
    lineacao:['Lineação','Estrutura linear: direção (trend) e caimento (plunge). FGDC 9.3/9.5/9.7. Na atitude inclinada, a observação está na cauda da seta; a ponta indica o sentido de caimento.'],
    foliacao:['Foliação','Atitude de foliação de origem não especificada: direção do plano e mergulho. FGDC 8.1.1–8.1.3; foliação metamórfica/tectônica tem símbolo próprio, sem inferir a origem.'],
    plunging:['Eixo de dobra — direção e caimento','Medida pontual do eixo de dobra: direção (trend) e caimento (plunge), não mergulho de plano. FGDC 9.97/9.99; eixo vertical usa o símbolo de estrutura linear vertical 9.7.']
  };
  const labels={ID:'Identificação',ID_FURO:'Código do furo',ID_SPT:'Identificação da sondagem SPT',CODIGO:'Código',COD_AMOSTRA:'Código da amostra',
    UNIDADE:'Unidade geológica',LITOLOGIA:'Litologia',IDADE:'Idade geológica',FONTE:'Fonte dos dados',CONFIANCA:'Confiança',OBS:'Observações',
    TIPO:'Tipo',UNID_A:'Unidade A',UNID_B:'Unidade B',METODO:'Método',NOME:'Nome',CINEMATICA:'Cinemática',ATIVIDADE:'Atividade',
    REF_ORIENT:'Convenção da direção',REJEITO_M:'Rejeito (m)',VERGENCIA:'Vergência',QUALIDADE:'Qualidade da medida',
    PREC_LOC_M:'Precisão da localização (m)',PREC_ORI_G:'Precisão da orientação (°)',DATA:'Data',INTENSID:'Intensidade',
    ABERTURA:'Abertura (m)',PREENCH:'Preenchimento',MINERAL:'Mineral',ESP_M:'Espessura (m)',LARGURA_M:'Largura (m)',
    COTA_BOCA:'Cota da boca (m)',PROF_M:'Profundidade (m)',STATUS:'Situação',NSPT:'N-SPT',NA_M:'Profundidade do nível de água (m)',
    COMPR_M:'Comprimento (m)',ALTERACAO:'Alteração',MATERIAL:'Material',RESULTADO:'Resultado',DOMINIO:'Domínio geológico',DENSIDADE:'Densidade',TEOR:'Teor'};
  function fieldLabel(name,kind){
    if(name==='DIRECAO'||name==='AZIMUTE')return linear.has(kind)?'Direção / azimute (trend, °)':planar.has(kind)?'Direção informada (°)':'Azimute (°)';
    if(name==='MERGULHO')return 'Mergulho do plano (dip, °)';
    if(name==='CAIMENTO')return 'Caimento (plunge, °)';
    if(name==='INCLINACAO')return 'Inclinação do furo (°)';
    return labels[name]||name;
  }
  const families={sd_bed:['sd_bed_hz','sd_bed','sd_bed_vt'],sd_fol:['sd_fol_hz','sd_fol','sd_fol_vt'],
    sd_fol_generic:['sd_fol_generic_hz','sd_fol_generic','sd_fol_generic_vt'],
    sd_cliv:['sd_cliv_hz','sd_cliv','sd_cliv_vt'],sd_joint:['sd_joint_hz','sd_joint','sd_joint_vt'],
    lin_estir:['lin_estir_hz','lin_estir','lin_estir_vt'],
    lineation:['lineation_hz','lineation','lineation_vt'],foldaxis:['foldaxis_hz','foldaxis','foldaxis_vt']};
  function familyOf(shape){return Object.values(families).find(ids=>ids.includes(shape==='sd_xist'?'sd_fol':shape));}
  function isStructuralShape(shape){return !!familyOf(shape)||shape==='sd_bed_ov';}
  function resolveShape(shape,angle){
    if(angle==null||!['number','string'].includes(typeof angle)||typeof angle==='string'&&!angle.trim())return shape;
    const a=Number(angle);if(!Number.isFinite(a)||a<0||a>90)return shape;
    const family=familyOf(shape);
    return family?family[a===0?0:a===90?2:1]:shape;
  }
  function orientationLabels(kind,shape){
    const isLinear=linear.has(kind)||/^(lineation|foldaxis|lin_estir|eixo_)/.test(shape||'');
    const isPlanar=planar.has(kind)||/^sd_/.test(shape||'');
    return {direction:isLinear?'Direção / azimute (trend) — campo (°)':isPlanar?'Direção do plano (strike) — campo (°)':'Azimute — campo (°)',
      angle:isLinear?'Caimento (plunge) — campo (°)':isPlanar?'Mergulho (dip) — campo (°)':'Ângulo — campo (rótulo)',
      help:(isLinear?'Direção aponta para o sentido de caimento: 0° norte, 90° leste. Caimento: 0° horizontal e 90° vertical; não aplique a conversão de 90° usada para planos.':isPlanar?'Strike é a direção do plano; na regra da mão direita, o mergulho fica 90° à direita. Na ficha geológica escolha strike RHR ou direção do mergulho: o programa faz a conversão.':'A rotação segue o azimute informado. Marcadores de localização não são automaticamente medidas estruturais.')+
        (kind?' Em camadas geológicas, os atributos e a convenção da ficha prevalecem sobre a rotação fixa.':' Para dados de dip direction, adote a camada como geológica e confirme essa convenção.')};
  }
  const symbols=typeof PT_SYMS!=='undefined'?PT_SYMS:null;
  if(symbols){
    // Galeria legada continha desenhos convencionais sob a alegação USGS.
    // Só os símbolos realmente conferidos recebem a referência normativa.
    for(const def of Object.values(symbols))if(def.g==='Estruturais (USGS)')def.g='Geologia · convenções locais';
    const width=w=>Math.max(.35,Math.min(1.8,w*.45));
    const path=(d,k,w)=>`<path d="${d}" fill="none" stroke="${k}" stroke-width="${width(w)}"/>`;
    const filled=(d,k)=>`<path d="${d}" fill="${k}"/>`;
    const circle=(r,k,w)=>`<circle r="${r}" fill="none" stroke="${k}" stroke-width="${width(w)}"/>`;
    function def(id,label,ref,d,options={}){symbols[id]={lb:label+' · '+ref,g:'Estruturais · FGDC/USGS',standard:ref,d,oriented:true,dip:false,...options};}
    def('sd_bed','Acamamento inclinado — direção/mergulho','6.2',(f,k,w)=>path('M0,-10 V10 M0,0 H4',k,w),{dip:true});
    def('sd_bed_hz','Acamamento horizontal','6.1',(f,k,w)=>circle(5,k,w)+path('M-5,0 H5 M0,-5 V5',k,w),{oriented:false});
    def('sd_bed_vt','Acamamento vertical','6.3',(f,k,w)=>path('M0,-10 V10 M-4,0 H4',k,w));
    def('sd_bed_ov','Acamamento invertido — direção/mergulho','6.4',(f,k,w)=>path('M0,-10 V10 M0,0 H4 M0,-5 A2.5,2.5 0 0 0 0,0',k,w),{dip:true});
    def('sd_fol_generic','Foliação genérica inclinada','8.1.2',(f,k,w)=>path('M0,-10 V10 M0,-4 L4,0 L0,4',k,w),{dip:true});
    def('sd_fol_generic_hz','Foliação genérica horizontal','8.1.1',(f,k,w)=>circle(5,k,w)+path('M0,-3 L3,0 L0,3 L-3,0 Z M-5,0 H5 M0,-5 V5',k,w),{oriented:false});
    def('sd_fol_generic_vt','Foliação genérica vertical','8.1.3',(f,k,w)=>path('M0,-10 V10 M0,-4 L4,0 L0,4 L-4,0 Z',k,w));
    def('sd_fol','Foliação metamórfica/tectônica inclinada','8.3.2',(f,k,w)=>path('M0,-10 V10',k,w)+filled('M0,-2.31 L4,0 L0,2.31 Z',k),{dip:true});
    def('sd_fol_hz','Foliação metamórfica/tectônica horizontal','8.3.1',(f,k,w)=>circle(5,k,w)+filled('M0,-4 L2.31,0 L0,4 L-2.31,0 Z',k),{oriented:false});
    def('sd_fol_vt','Foliação metamórfica/tectônica vertical','8.3.3',(f,k,w)=>path('M0,-10 V10',k,w)+filled('M0,-2.31 L4,0 L0,2.31 L-4,0 Z',k));
    def('sd_cliv','Clivagem inclinada — direção/mergulho','7.2',(f,k,w)=>path('M4,-10 H0 V10 H4',k,w),{dip:true});
    def('sd_cliv_hz','Clivagem horizontal','7.1',(f,k,w)=>path('M0,-8 V8 M-8,0 H8 M-2,-8 H2 M-2,8 H2 M-8,-2 V2 M8,-2 V2',k,w),{oriented:false});
    def('sd_cliv_vt','Clivagem vertical','7.3',(f,k,w)=>path('M0,-10 V10 M-3,-10 H3 M-3,10 H3',k,w));
    def('sd_joint','Junta inclinada — direção/mergulho','4.3.2',(f,k,w)=>path('M0,-10 V10',k,w)+filled('M0,-2.25 H2.25 V2.25 H0 Z',k),{dip:true});
    def('sd_joint_hz','Junta horizontal','4.3.1',(f,k,w)=>circle(5,k,w)+filled('M-2.25,-2.25 H2.25 V2.25 H-2.25 Z',k),{oriented:false});
    def('sd_joint_vt','Junta vertical','4.3.3',(f,k,w)=>path('M0,-10 V10',k,w)+filled('M-2.25,-2.25 H2.25 V2.25 H-2.25 Z',k));
    // Haste fina preserva a diferença entre lineação simples e ornamentos
    // semânticos (ponto do eixo de dobra e elipse de estiramento).
    const shaftWeight=w=>Math.min(w*.35,1.4);
    const arrow=(k,w)=>path('M0,0 V-10',k,shaftWeight(w))+filled('M0,-10 L-.97,-7.917 L0,-8.4 L.97,-7.917 Z',k);
    const doubleArrow=(k,w)=>path('M0,-5 V5',k,shaftWeight(w))+filled('M0,-5 L-.97,-2.917 L0,-3.4 L.97,-2.917 Z M0,5 L-.97,2.917 L0,3.4 L.97,2.917 Z',k);
    const foldDot=(k,w,y=0)=>`<circle cy="${y}" r="${Math.max(.417,width(shaftWeight(w))*1.25)}" fill="${k}"/>`;
    const vertical=(k,w)=>path('M0,-7.5 V7.5 M-7.5,0 H7.5',k,w)+filled('M0,-1.625 L1.625,0 L0,1.625 L-1.625,0 Z',k);
    def('lineation','Lineação inclinada — direção/caimento','9.3',(f,k,w)=>arrow(k,w),{dip:true,anchor:'tail',dipOffset:[4,-10]});
    def('lineation_hz','Lineação horizontal','9.5',(f,k,w)=>doubleArrow(k,w),{anchor:'center'});
    def('lineation_vt','Lineação vertical','9.7',(f,k,w)=>vertical(k,w),{oriented:false,anchor:'center'});
    def('foldaxis','Eixo de dobra inclinado — direção/caimento','9.97',(f,k,w)=>arrow(k,w)+foldDot(k,w,-4.583),{dip:true,anchor:'tail',dipOffset:[4,-10]});
    def('foldaxis_hz','Eixo de dobra horizontal','9.99',(f,k,w)=>doubleArrow(k,w)+foldDot(k,w),{anchor:'center'});
    def('foldaxis_vt','Eixo de dobra vertical — estrutura linear','9.7',(f,k,w)=>vertical(k,w),{oriented:false,anchor:'center'});
    def('lin_estir','Lineação de estiramento inclinada','9.49',(f,k,w)=>arrow(k,w)+`<ellipse cy="-3.542" rx=".729" ry="1.458" fill="${k}"/>`,{dip:true,anchor:'tail',dipOffset:[4,-10]});
    def('lin_estir_hz','Lineação de estiramento horizontal','9.51',(f,k,w)=>doubleArrow(k,w)+`<ellipse rx=".729" ry="1.458" fill="${k}"/>`,{anchor:'center'});
    def('lin_estir_vt','Lineação de estiramento vertical — estrutura linear','9.7',(f,k,w)=>vertical(k,w),{oriented:false,anchor:'center'});
    // Xistosidade é uma foliação metamórfica; não um novo glifo inventado.
    if(symbols.sd_xist)symbols.sd_xist={...symbols.sd_fol,lb:'Xistosidade — direção/mergulho · 8.3.2'};
    if(symbols.sd_gnaisse)symbols.sd_gnaisse.lb='Bandamento gnáissico — convenção local';
  }
  // Somente o padrão de NOVAS camadas muda. Camadas e nomes existentes não
  // são percorridos, migrados ou sobrescritos por este módulo.
  if(api.presets?.foliacao)api.presets.foliacao.shape='sd_fol_generic';
  api.standards=Object.freeze({catalog:Object.freeze(catalog),families:Object.freeze(families),fieldLabel,resolveShape,isStructuralShape,orientationLabels,
    description:kind=>catalog[kind]?.[1]||'',
    sources:Object.freeze({sgb:'https://geosgb.sgb.gov.br/geosgb/symbology.html',fgdc:'https://ngmdb.usgs.gov/fgdc_gds/geolsymstd.php'})});
})();
