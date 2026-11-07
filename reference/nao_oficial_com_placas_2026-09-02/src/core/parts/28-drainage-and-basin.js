/* ============================================================================
   ÍCONES do módulo HIDRO + DRENAGEM — desenhos distintos e detalhados.
   Convenção do app: traço currentColor (âmbar), contexto cinza #8b949e,
   preenchimento suave via .softamb / .fillamb. Registrados em RIB_SVG.
   ========================================================================== */
(function iconesHidroDren(){
  const A='<svg viewBox="0 0 24 24">', Z='</svg>', g='stroke="#8b949e"';
  const H={};

  /* ----- chuva: nuvem + gotas ----- */
  H.chuva = A+'<path class="softamb" d="M7 13a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 13z"/>'+
    '<path '+g+' d="M7 13a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 13z"/>'+
    '<path d="M8 16l-1 3M12 16l-1 3M16 16l-1 3" stroke-width="2"/>'+Z;

  /* ----- IDF: eixos + curvas i-d-f decrescentes ----- */
  H.idf = A+'<path '+g+' d="M4 4v16h16"/>'+
    '<path d="M5 7c5 0 6 9 14 10" fill="none"/>'+
    '<path d="M5 10c4 0 6 6 13 7" fill="none" opacity=".7"/>'+
    '<path d="M5 13c3 0 6 4 11 4.5" fill="none" opacity=".45"/>'+Z;

  /* ----- fluxo D8: setas convergindo p/ um canal ----- */
  H.fluxo = A+'<path '+g+' d="M12 3v18"/>'+
    '<path d="M5 6l6 4M19 6l-6 4M6 11l5 4M18 11l-5 4" stroke-width="1.4"/>'+
    '<path class="fillamb" d="M12 21l-2.4-4h4.8z"/>'+Z;

  /* ----- inundação: relevo + lâmina d'água com ondinha ----- */
  H.inundacao = A+'<path '+g+' d="M2 18l5-6 4 4 4-8 7 10z"/>'+
    '<path class="softamb" d="M2 14h20v4H2z"/>'+
    '<path d="M2 15.5c2-1.2 4 1.2 6 0s4 1.2 6 0 4 1.2 6 0" fill="none"/>'+Z;

  /* ----- topografia: curvas de nível aninhadas + cume ----- */
  H.topografia = A+'<path '+g+' d="M3 20c3-3 6-3 9-6s5-6 9-9"/>'+
    '<path d="M5 20c3-2.5 5-2.5 8-5.5s4-5 8-7.5" fill="none" opacity=".6"/>'+
    '<path class="fillamb" d="M20 4l1.4 2.6-2.8 0z"/>'+Z;

  /* ----- dimension: cotas com setas e traço de medida ----- */
  H.dimension = A+'<path '+g+' d="M4 8v8M20 8v8"/>'+
    '<path d="M4 12h16" stroke-width="1.6"/><path d="M7 9l-3 3 3 3M17 9l3 3-3 3" fill="none"/>'+
    '<rect class="softamb" x="9" y="4" width="6" height="4" rx="1"/>'+Z;

  /* ----- drenagem: canaleta em perspectiva com fluxo ----- */
  H.drenagem = A+'<path '+g+' d="M4 6l4 12M20 6l-4 12"/>'+
    '<path class="softamb" d="M8 18h8l-2-12H10z"/>'+
    '<path d="M12 7v9" stroke-dasharray="2 2"/><path class="fillamb" d="M12 19l-2-3h4z"/>'+Z;

  /* ----- bacia: divisor fechado + gota no exutório ----- */
  H.bacia = A+'<path '+g+' d="M12 3c5 1 8 5 7 10-1 4-5 6-9 5S3 13 5 9s4-5 7-6z" stroke-dasharray="3 2"/>'+
    '<path d="M9 10c1 3 3 5 5 6" fill="none"/>'+
    '<path class="fillamb" d="M15 15c1.2 1.4 1.8 2.4 1.8 3a1.8 1.8 0 0 1-3.6 0c0-.6.6-1.6 1.8-3z"/>'+Z;

  /* ----- barramento: reservatório + parede + vale ----- */
  H.barramento = A+'<path class="softamb" d="M2 11h9v8H2z"/><path '+g+' d="M2 11h9"/>'+
    '<path class="fillamb" d="M11 4h3v15h-3z"/><path d="M14 19l3-5 5 5"/><path '+g+' d="M2 19h20"/>'+Z;

  /* ----- tempo de concentração: relógio + gota ----- */
  H.tempoconc = A+'<circle '+g+' cx="9" cy="14" r="6"/><path d="M9 10.5V14l2.6 1.6"/>'+
    '<path class="fillamb" d="M18 3.5c2.1 2.6 3.2 4.3 3.2 5.5a3.2 3.2 0 0 1-6.4 0c0-1.2 1.1-2.9 3.2-5.5z"/>'+Z;

  /* ----- lâmina a partir da chuva: gota grande + nível ----- */
  H.lamina = A+'<path class="softamb" d="M12 3c3.5 4.2 5.5 7 5.5 9.2a5.5 5.5 0 0 1-11 0C6.5 10 8.5 7.2 12 3z"/>'+
    '<path '+g+' d="M12 3c3.5 4.2 5.5 7 5.5 9.2a5.5 5.5 0 0 1-11 0C6.5 10 8.5 7.2 12 3z"/>'+
    '<path d="M7.5 13c1.2-.9 2.3.9 4.5 0s3.3.9 4.5 0" fill="none"/>'+Z;

  /* ----- inundação: encher a partir de um ponto ----- */
  H.inund_ponto = A+'<path '+g+' d="M2 19l4-7 4 5 4-9 6 11z"/><path d="M3 15h17"/>'+
    '<circle class="fillamb" cx="9" cy="15" r="2.4"/>'+Z;
  H.inund_fundo = A+'<path '+g+' d="M2 19l4-7 4 5 4-9 6 11z"/><path d="M3 15h17"/>'+
    '<path d="M9 4v6M6.6 7.6L9 10l2.4-2.4"/><circle class="fillamb" cx="9" cy="16.6" r="1.8"/>'+Z;
  H.inund_tudo = A+'<path '+g+' d="M2 19l4-7 4 5 4-9 6 11z"/><path class="softamb" d="M2 15h20v4H2z"/>'+
    '<path d="M2 15h20"/><path '+g+' d="M2 19h20"/>'+Z;
  H.inund_limpa = A+'<path '+g+' d="M2 19l4-7 4 5 4-9 6 11z"/><path d="M2 15h9"/>'+
    '<path d="M15 12.5l5 5M20 12.5l-5 5" stroke-width="1.9"/>'+Z;

  /* ===== ícones das FEIÇÕES de drenagem (cada tipo é distinto) ===== */
  // dreno: vala trapezoidal com brita (pontinhos)
  H.dren_dreno = A+'<path class="softamb" d="M6 6l3 12h6l3-12z"/><path '+g+' d="M6 6l3 12h6l3-12"/>'+
    '<circle class="fillamb" cx="10" cy="13" r="1"/><circle class="fillamb" cx="13" cy="15" r="1"/><circle class="fillamb" cx="12" cy="11" r="1"/>'+Z;
  // sarjeta: seção triangular junto ao meio-fio
  H.dren_sarjeta = A+'<path '+g+' d="M3 8v10h18"/><path class="softamb" d="M5 18l10-6v6z"/>'+
    '<path class="fillamb" d="M15 12l-10 6"/><path d="M15 12l-10 6" stroke="currentColor"/>'+Z;
  // valeta escavada: terreno com um rasgo trapezoidal (talude/base/talude) e água no fundo
  H.dren_valeta = A+'<path class="softamb" d="M2 7h20v11H2z"/>'+
    '<path '+g+' d="M2 7h6l3 7h2l3-7h6"/>'+
    '<path class="fillamb" d="M8.6 12h6.8l-1.3 3H9.9z"/>'+
    '<path d="M8.6 12h6.8l-1.3 3H9.9z" stroke="currentColor" fill="none"/>'+Z;
  // sarjetão: dois planos convergindo p/ o eixo
  H.dren_sarjetao = A+'<path '+g+' d="M2 8l10 8 10-8"/><path class="softamb" d="M6 11l6 5 6-5-6 3z"/>'+
    '<path d="M12 16v4" stroke-width="1.6"/>'+Z;
  // canaleta: retângulo aberto com fluxo
  H.dren_canaleta = A+'<path '+g+' d="M5 6v12h14V6"/><path class="softamb" d="M7 12h10v6H7z"/>'+
    '<path d="M12 9v9" stroke-dasharray="2 2"/><path class="fillamb" d="M12 20l-2-3h4z"/>'+Z;
  // meio-fio: bloco de guia
  H.dren_meiofio = A+'<path class="softamb" d="M4 10h16v5H4z"/><path '+g+' d="M4 10h16v5H4z"/>'+
    '<path d="M4 15v3M20 15v3M4 10l2-3h12l2 3" fill="none"/>'+Z;
  // manilha: tubo circular (elipse frontal + corpo)
  H.dren_manilha = A+'<ellipse '+g+' cx="8" cy="12" rx="3" ry="6"/><path '+g+' d="M8 6h8M8 18h8"/>'+
    '<ellipse class="softamb" cx="16" cy="12" rx="3" ry="6"/><ellipse cx="16" cy="12" rx="3" ry="6" fill="none" stroke="currentColor"/>'+Z;
  // descida d'água: rápido em degraus
  H.dren_descida = A+'<path '+g+' d="M4 4h5v4h5v4h5v8"/><path class="fillamb" d="M6 6l1.5 2H4.5z"/>'+
    '<path d="M9 10l1.5 2H7.5zM14 14l1.5 2h-3z" class="fillamb"/>'+Z;
  // dissipador: bacia com blocos de amortecimento
  H.dren_dissipador = A+'<path '+g+' d="M3 9v9h18V9"/><path class="softamb" d="M3 14h18v4H3z"/>'+
    '<rect class="fillamb" x="7" y="11" width="2" height="4"/><rect class="fillamb" x="11" y="11" width="2" height="4"/><rect class="fillamb" x="15" y="11" width="2" height="4"/>'+Z;
  // bueiro: tubo passando sob aterro
  H.dren_bueiro = A+'<path class="softamb" d="M2 8c4-4 16-4 20 0v3H2z"/><path '+g+' d="M2 11c4-4 16-4 20 0"/>'+
    '<ellipse '+g+' cx="12" cy="16" rx="4" ry="3"/><path d="M8 16h8" opacity=".5"/>'+Z;
  // talvegue: linha de fundo de vale com setinha
  H.dren_talvegue = A+'<path '+g+' d="M4 5l8 14 8-14"/><path d="M8 8l4 7 4-7" opacity=".5"/>'+
    '<path class="fillamb" d="M12 19l-2-3h4z"/>'+Z;
  // divisor: crista com águas p/ os dois lados
  H.dren_divisor = A+'<path '+g+' d="M12 4v16"/><path d="M12 8L6 14M12 8l6 6M12 13l-4 4M12 13l4 4" stroke-dasharray="2 2"/>'+
    '<path class="fillamb" d="M12 4l-2.2 3.6h4.4z"/>'+Z;

  // leira / camalhão: cordão trapezoidal elevado + fluxo que é desviado ao chegar nele
  H.dren_leira = A+'<path class="softamb" d="M4 18l4-8h8l4 8z"/><path '+g+' d="M4 18l4-8h8l4 8"/>'+
    '<path d="M2 7h7" stroke-dasharray="2 2"/><path class="fillamb" d="M9 7l-2.4-1.6v3.2z"/>'+
    '<path d="M22 7h-6" stroke-dasharray="2 2"/><path class="fillamb" d="M16 7l2.4-1.6v3.2z"/>'+Z;

  try{ if(typeof RIB_SVG==='object') Object.keys(H).forEach(k=>{ RIB_SVG[k]=H[k]; }); }catch(e){}
  try{ if(typeof EDI==='object'){} }catch(e){}
  window.HIDRO_ICONS=H;
})();

/* ===== MÓDULO DRENAGEM ===== */
/* ============================================================================
   DRENAGEM — feições lineares de drenagem (drenos, sarjetas, manilhas,
   canaletas, meio-fio, descidas, dissipadores, bueiros) com:
     • biblioteca de tipos, cada um com sua simbologia e seção padrão;
     • desenho por toque; ao concluir, a feição CARREGA os dados geométricos
       do MDT carregado — cota inicial, cota final, comprimento 2D/3D,
       desnível e declividade média em % e em graus;
     • dimensionamento hidráulico (Manning) e desenho da SEÇÃO transversal,
       usando a declividade lida do terreno como declividade de fundo.
   ========================================================================== */

/* --- biblioteca de tipos de feição --------------------------------------- */
var DREN_TIPOS = {
  dreno:      {nome:'Dreno',            cor:'#0a5f4e', dash:'',          w:0.6, secao:'trap', desc:'Dreno de fundo / vala drenante — coleta e conduz água subterrânea ou de fundo de vala; seção trapezoidal.'},
  sarjeta:    {nome:'Sarjeta',          cor:'#8a4b00', dash:'',          w:0.7, secao:'tri',  desc:'Sarjeta de via — canal triangular junto ao meio-fio que conduz a água da pista até a boca-de-lobo.'},
  valeta:     {nome:'Valeta',           cor:'#6b5a12', dash:'',          w:0.7, secao:'trapV',rev:'Terra', desc:'Valeta escavada — canal em solo ao longo das vias de acesso e estradas de mina; drenagem padrão dos acessos, que são temporários e não se revestem. Seção trapezoidal em terra. Em rampas íngremes (>~5%) a água ganha velocidade erosiva: quebre a energia com soleiras/degraus ou lance em bueiros a intervalos curtos.'},
  sarjetao:   {nome:'Sarjetão',         cor:'#7a3b00', dash:'3 1.5',     w:0.9, secao:'tri',  desc:'Sarjetão — canal maior no encontro de pistas ou em greides baixos, para vazões concentradas.'},
  canaleta:   {nome:'Canaleta',         cor:'#123a6b', dash:'',          w:0.7, secao:'ret',  desc:'Canaleta de concreto — seção retangular, drenagem de plataforma, banqueta ou pé de talude.'},
  meiofio:    {nome:'Meio-fio',         cor:'#3a3f47', dash:'',          w:0.5, secao:'nen',  desc:'Meio-fio / guia — delimita a pista e direciona o escoamento superficial para a sarjeta.'},
  manilha:    {nome:'Manilha',          cor:'#4a2a6b', dash:'5 3',       w:0.8, secao:'circ', desc:'Manilha / tubo — conduto enterrado de seção circular (rede de águas pluviais).'},
  descida:    {nome:"Descida d'água",   cor:'#7a1515', dash:'2 2.5',     w:0.8, secao:'ret',  desc:"Descida d'água — conduz a água talude abaixo em rápido ou degraus, evitando erosão do talude."},
  dissipador: {nome:'Dissipador',       cor:'#6b1447', dash:'1.5 1.5',   w:0.9, secao:'ret',  desc:'Dissipador de energia — bacia ou blocos que reduzem a velocidade da água na saída de um conduto.'},
  bueiro:     {nome:'Bueiro / BSTC',    cor:'#3a2a00', dash:'7 3',       w:1.0, secao:'circ', desc:'Bueiro (tubular BSTC ou celular BSCC) — travessia sob aterro/estrada.'},
  talvegue:   {nome:'Talvegue',         cor:'#0a4a3a', dash:'4 3',       w:0.6, secao:'nen',  desc:'Talvegue — linha natural de fundo de vale por onde a água escoa; referência para lançamento.'},
  divisor:    {nome:'Divisor',          cor:'#5a3a00', dash:'8 3 1.5 3', w:0.6, secao:'nen',  desc:'Divisor de águas / crista — limita a bacia de contribuição; separa águas para lados opostos.'},
  leira:      {nome:'Leira',            cor:'#6b4a1a', dash:'6 2 1 2',   w:0.9, secao:'leira', rev:'Terra', desc:'Leira / camalhão — cordão de solo ou estéril elevado, executado ao longo de bermas, praças e estradas de mina para BARRAR ou DIRECIONAR o escoamento superficial (não conduz em canal, desvia o fluxo). Útil como divisor construído e para conduzir a água até valetas, bueiros ou bacias. Em greides longos, associe a saídas periódicas para não concentrar vazão erosiva.'},
};
/* seções: tri=triangular, trap=trapezoidal, ret=retangular, circ=circular, nen=sem seção */
var DREN_SECAO_PAD = {
  tri:  {tipo:'tri',  z1:3, z2:3, y:0.15},                 // taludes 1V:3H, lâmina 15 cm
  trap: {tipo:'trap', b:0.40, z1:1, z2:1, y:0.40},         // base 40 cm, taludes 1:1
  trapV:{tipo:'trap', b:0.40, z1:1.5, z2:1.5, y:0.50},     // valeta escavada: base 40 cm, taludes 1V:1,5H, prof. 50 cm
  ret:  {tipo:'ret',  b:0.40, y:0.40},                     // 40×40 cm
  circ: {tipo:'circ', D:0.60},                             // Ø 600 mm
  leira:{tipo:'leira', b:0.60, z1:1.5, z2:1.5, h:0.60},    // cordão/camalhão: base 60 cm, taludes 1V:1,5H, altura 60 cm
  nen:  {tipo:'nen'},
};
var DREN_MANNING = {                                        // n de Manning por revestimento
  'Concreto liso':0.013, 'Concreto rugoso':0.017, 'Terra':0.025,
  'Terra com vegetação':0.035, 'Enrocamento (rip-rap)':0.030, 'Gabião':0.027, 'PVC/PEAD':0.011,
};
/* velocidade máxima ADMISSÍVEL (não erosiva) por revestimento — m/s.
   Faixas usuais de projeto (DNIT/manuais de drenagem); solo depende muito
   do tipo, por isso a terra fica conservadora.                            */
var DREN_VADM = {
  'Concreto liso':6.0, 'Concreto rugoso':5.0, 'Terra':1.5,
  'Terra com vegetação':1.8, 'Enrocamento (rip-rap)':3.5, 'Gabião':4.5, 'PVC/PEAD':6.0,
};

/* --- geometria da feição: cotas e declividade a partir do MDT ------------- */
function drenGrade(){
  // 1) MDT escolhido explicitamente pelo usuário (seletor da tabela / painel)
  if(S.drenMDT){
    if(S.drenMDT==='hidro'){ if(S.hidro && S.hidro.dem) return S.hidro.dem; }
    else { const r=(S.rasters||[]).find(r=>r.id===S.drenMDT && r.d && r.d.z); if(r) return r.d; }
    // se a escolha não existe mais, cai no automático abaixo
  }
  // 2) automático: o do Hidro, senão o 1º raster com grade
  if(S.hidro && S.hidro.dem) return S.hidro.dem;
  const r=(S.rasters||[]).find(r=>r.d && r.d.z);
  return r? r.d : null;
}
/* lista de MDTs disponíveis para o seletor (Hidro + rasters com grade) */
function drenMDTsDisponiveis(){
  const out=[];
  if(S.hidro && S.hidro.dem) out.push({id:'hidro', nome:'MDT do Hidro'+(S.hidro.demName?(' — '+S.hidro.demName):'')});
  (S.rasters||[]).forEach(r=>{ if(r.d && r.d.z) out.push({id:r.id, nome:r.name||('Raster '+r.id)}); });
  return out;
}
function drenDadosGeom(ptsCRS, d){
  // amostra a cota do terreno em cada vértice e integra comprimento 2D/3D
  const n=ptsCRS.length;
  const z=ptsCRS.map(p=>{ let v=null; try{ v=sampleZbil(d,p[0],p[1]); }catch(e){} return (v!=null&&isFinite(v))?v:null; });
  let L2=0, L3=0;
  for(let i=0;i<n-1;i++){
    const dx=ptsCRS[i+1][0]-ptsCRS[i][0], dy=ptsCRS[i+1][1]-ptsCRS[i][1];
    const dl=Math.hypot(dx,dy); L2+=dl;
    const za=z[i], zb=z[i+1];
    L3 += (za!=null&&zb!=null)? Math.hypot(dl, zb-za) : dl;
  }
  const zIni=z[0], zFim=z[n-1];
  const dH=(zIni!=null&&zFim!=null)? (zIni-zFim) : null;    // positivo = desce no sentido do traçado
  const decl = (dH!=null && L2>0)? dH/L2 : null;            // m/m (sinal = sentido)
  const declAbs = decl!=null? Math.abs(decl) : null;
  return {
    z, zIni, zFim, dH,
    COMP_2D:+L2.toFixed(2), COMP_3D:+L3.toFixed(2),
    COTA_INI: zIni!=null?+zIni.toFixed(3):null,
    COTA_FIM: zFim!=null?+zFim.toFixed(3):null,
    DESNIVEL_M: dH!=null?+dH.toFixed(3):null,
    DECL_PCT: declAbs!=null?+(declAbs*100).toFixed(3):null,
    DECL_GR:  declAbs!=null?+(Math.atan(declAbs)*180/Math.PI).toFixed(3):null,
    SENTIDO: dH==null?'—':(dH>0?'desce no traçado':(dH<0?'sobe no traçado':'plano')),
  };
}
function drenCampos(){
  return [
    {name:'NOME',      type:'C', length:32, decimal:0},
    {name:'TIPO',      type:'C', length:20, decimal:0},
    {name:'REVEST',    type:'C', length:24, decimal:0},
    {name:'COTA_INI',  type:'N', length:12, decimal:3},
    {name:'COTA_FIM',  type:'N', length:12, decimal:3},
    {name:'DESNIVEL_M',type:'N', length:10, decimal:3},
    {name:'COMP_2D',   type:'N', length:12, decimal:2},
    {name:'COMP_3D',   type:'N', length:12, decimal:2},
    {name:'DECL_PCT',  type:'N', length:10, decimal:3},
    {name:'DECL_GR',   type:'N', length:10, decimal:3},
    {name:'SENTIDO',   type:'C', length:20, decimal:0},
    {name:'SECAO',     type:'C', length:60, decimal:0},
    {name:'Q_PROJ_M3S',type:'N', length:12, decimal:4},
    {name:'V_MS',      type:'N', length:10, decimal:3},
  ];
}
/* camada de destino de um tipo (uma por tipo, reaproveitada) */
function drenCamada(tipoKey){
  const T=DREN_TIPOS[tipoKey]; const nome='Drenagem — '+T.nome;
  let L=(S.layers||[]).find(x=>x.name===nome && x.gtype==='line');
  if(!L){
    L=addLayer({name:nome, gtype:'line', crs:S.workCRS, features:[], fields:drenCampos(), color:T.cor});
    if(L){ L.sym=Object.assign(L.sym||{}, {color:T.cor, stroke:T.cor, weight:(T.w||0.6), dash:T.dash}); L.dash=T.dash; L.color=T.cor; L._dren=tipoKey; }
  }
  return L;
}
/* aplica cotas/declividade a uma feição já existente (recalcular) */
function drenAplicaGeom(L, f){
  const d=drenGrade(); if(!d) return null;
  const ring=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom[0]:f.geom;
  const ptsCRS=ring.map(p=>{ if(L.crs===S.workCRS) return [p[0],p[1]];
    const w=toWGS(L.crs,p[0],p[1]); const c=fromWGS(S.workCRS,w[0],w[1]); return [c[0],c[1]]; });
  const G=drenDadosGeom(ptsCRS, d);
  f.props=Object.assign(f.props||{}, {
    COTA_INI:G.COTA_INI, COTA_FIM:G.COTA_FIM, DESNIVEL_M:G.DESNIVEL_M,
    COMP_2D:G.COMP_2D, COMP_3D:G.COMP_3D, DECL_PCT:G.DECL_PCT, DECL_GR:G.DECL_GR, SENTIDO:G.SENTIDO});
  f.zg=G.z.map(v=>v==null?NaN:v);          // guarda as cotas nos vértices
  return G;
}

/* --- desenho por toque ---------------------------------------------------- */
/* nomes por trecho: varre as feições da camada e deduz o próximo nome-base
   ("Dreno 1", "Dreno 2"...) e o próximo número de trecho de um nome-base.     */
function drenNomeBase(nomeTipo){ return nomeTipo; }
function drenProxNumero(L, nomeTipo){
  // maior índice N usado em "<Tipo> N" → devolve N+1 (novo dreno)
  let mx=0;
  (L?L.features:[]).forEach(f=>{ const nm=(f.props&&f.props.NOME)||'';
    const m=new RegExp('^'+nomeTipo.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s+(\\d+)').exec(nm);
    if(m){ const n=+m[1]; if(n>mx) mx=n; } });
  return mx+1;
}
function drenProxTrecho(L, base){
  // maior "T<k>" dentro do mesmo nome-base → devolve k+1
  let mx=1;
  (L?L.features:[]).forEach(f=>{ const nm=(f.props&&f.props.NOME)||'';
    if(nm===base){ if(1>mx) mx=1; return; }
    const m=new RegExp('^'+base.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s+·\\s+T(\\d+)$').exec(nm);
    if(m){ const k=+m[1]; if(k>mx) mx=k; } });
  return mx+1;
}
/* garante que um nome não colida com nenhum já usado na camada (exceto na
   continuação, que reaproveita de propósito). Se colidir, incrementa o sufixo. */
function drenNomeExiste(L, nome, ignoraIdx){
  return (L?L.features:[]).some((f,i)=>i!==ignoraIdx && f.props && f.props.NOME===nome);
}
/* varre uma camada de drenagem e renomeia nomes DUPLICADOS (mantém a 1ª
   ocorrência; as seguintes ganham nome único). Corrige feições antigas.      */
function drenCorrigeDuplicados(L, tipoNome){
  if(!L || !L.features) return 0;
  const vistos=new Set(); let n=0;
  L.features.forEach((f,i)=>{
    if(!f.props) f.props={};
    let nm=f.props.NOME || (tipoNome+' 1');
    if(vistos.has(nm)){
      nm=drenNomeUnicoBase(L, nm, tipoNome, i);   // acha um livre, ignorando a própria
      f.props.NOME=nm; n++;
    }
    vistos.add(nm);
  });
  return n;
}
function drenNomeUnicoBase(L, nomeDesejado, tipoNome, ignoraIdx){
  const existe=(nm)=>drenNomeExiste(L, nm, ignoraIdx);
  if(!existe(nomeDesejado)) return nomeDesejado;
  const mT=/^(.*)\s+·\s+T(\d+)$/.exec(nomeDesejado);
  if(mT){ let k=+mT[2]; let nm; do{ k++; nm=mT[1]+' · T'+k; }while(existe(nm)); return nm; }
  const mN=new RegExp('^('+tipoNome.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')\\s+(\\d+)$').exec(nomeDesejado);
  if(mN){ let x=+mN[2]; let nm; do{ x++; nm=mN[1]+' '+x; }while(existe(nm)); return nm; }
  let c=2, nm; do{ nm=nomeDesejado+' ('+c+')'; c++; }while(existe(nm)); return nm;
}
function drenNomeUnico(L, nomeDesejado, tipoNome){
  return drenNomeUnicoBase(L, nomeDesejado, tipoNome, -1);
}
function drenArma(tipoKey, modo, contIdx){
  if(!drenGrade()){ toast('Carregue o MDT (MDE / fluxo) antes — a feição precisa das cotas'); return; }
  // limpa qualquer tooltip/mini-menu pendente para não ficar sobre o mapa
  const _tp=document.getElementById('ribTip'); if(_tp) _tp.style.display='none';
  document.querySelectorAll('.ribmini').forEach(m=>m.remove());
  const nome=DREN_TIPOS[tipoKey].nome;
  // já existe feição desse tipo? pergunta: dreno novo / novo trecho / continuação
  const L=(S.layers||[]).find(x=>x.name==='Drenagem — '+nome && x.gtype==='line');
  if(modo===undefined && L && L.features && L.features.length){
    drenPerguntaContinuar(tipoKey, L);
    return;
  }
  S._drenTipo=tipoKey; S._drenBuf=[]; S._drenCont=null; S._drenNome=null;
  // feição a continuar/derivar: a escolhida (contIdx) ou a última
  const idxAlvo = (contIdx!=null && L && L.features[contIdx]) ? contIdx
                 : (L && L.features.length ? L.features.length-1 : -1);
  const ultima = idxAlvo>=0 ? L.features[idxAlvo] : null;
  const nomeUlt = (ultima && ultima.props && ultima.props.NOME) || (nome+' 1');
  // nome-base do último traçado (sem o sufixo "· Tk")
  const baseUlt = nomeUlt.replace(/\s+·\s+T\d+$/,'');

  if(modo==='continua' && ultima){
    // CONTINUAÇÃO: mesmo nome, retoma EXATAMENTE do último ponto do traçado escolhido
    S._drenNome=nomeUlt;
    const ring=(ultima.multi&&Array.isArray(ultima.geom[0][0]))?ultima.geom[0]:ultima.geom;
    S._drenCont={L, idx:idxAlvo};
    S._drenBuf=ring.map(pt=>{ let w; if(L.crs===S.workCRS) w=toWGS(S.workCRS,pt[0],pt[1]);
      else w=toWGS(L.crs,pt[0],pt[1]); return [w[1],w[0]]; });
    cmdLog('Continuando '+esc(nomeUlt)+' — o traçado retoma do último ponto; toque para acrescentar; Esc salva','info');
  } else if(modo==='trecho' && ultima){
    // NOVO TRECHO: mesmo dreno (nome-base), próximo número de trecho, feição nova
    const k=drenProxTrecho(L, baseUlt);
    S._drenNome=drenNomeUnico(L, baseUlt+' · T'+k, nome);   // garante nome diferente
    cmdLog('Novo trecho de '+esc(baseUlt)+' → '+esc(S._drenNome)+'; toque os vértices; Esc salva','info');
  } else {
    // DRENO NOVO (ou 1ª feição do tipo): novo nome-base
    const n=drenProxNumero(L, nome);
    S._drenNome=drenNomeUnico(L, nome+' '+n, nome);         // garante nome diferente
    cmdLog('Novo '+esc(nome)+' → '+esc(S._drenNome)+'; toque os vértices; Esc salva','info');
  }

  if(S._drenTmp){ try{ map.removeLayer(S._drenTmp); }catch(e){} S._drenTmp=null; }
  setTool('dren');
  const b=document.getElementById('btnDrenDraw'); if(b) b.textContent='✓ Concluir '+nome+' (Esc)';
  map.getContainer().style.cursor='crosshair';
  if(S._drenBuf.length){ drenRedrawTmp(); }
  if(window.matchMedia('(max-width:720px)').matches){ const s=document.getElementById('side'); if(s) s.classList.remove('open'); }
}
function drenRedrawTmp(){
  if(S._drenTmp){ try{ map.removeLayer(S._drenTmp); }catch(e){} S._drenTmp=null; }
  const buf=S._drenBuf||[]; if(!buf.length) return;
  // mesmo estilo do desenho de linha/polígono: halo escuro + traço branco tracejado + vértices
  const PN={pane:'alagis_desenho', interactive:false};
  const g=L2.layerGroup([],PN).addTo(map);
  L2.polyline(buf,{color:'#1a1206',weight:4,opacity:.45,...PN}).addTo(g);
  L2.polyline(buf,{color:'#fff',weight:1.5,dashArray:'4',...PN}).addTo(g);
  buf.forEach(p=>L2.circleMarker(p,{radius:4,color:'#fff',weight:1.5,
    fillColor:'#f5a524',fillOpacity:1,...PN}).addTo(g));
  S._drenTmp=g;
}
/* modal: dreno novo × novo trecho × continuação — com escolha de QUAL feição */
function drenPerguntaContinuar(tipoKey, L){
  const nome=DREN_TIPOS[tipoKey].nome;
  // lista de feições existentes (nome + índice) para o usuário escolher qual continuar
  const feics=L.features.map((f,i)=>({i, nm:(f.props&&f.props.NOME)||(nome+' '+(i+1))}));
  const ultIdx=L.features.length-1;
  const nomeUlt=feics[ultIdx]?feics[ultIdx].nm:(nome+' 1');
  const bg=document.createElement('div'); bg.className='modal-bg on';
  const opts=feics.map(o=>`<option value="${o.i}" ${o.i===ultIdx?'selected':''}>${esc(o.nm)}</option>`).join('');
  bg.innerHTML=`<div class="modal" style="width:min(480px,94%)">
    <div class="modal-h"><b>${esc(nome)}</b></div>
    <div style="padding:14px 16px;font-size:13px;color:var(--ink)">
      Já existem <b>${feics.length}</b> feição(ões) de ${esc(nome)}. O que você quer desenhar agora?
      <label class="field" style="margin-top:12px">Feição a continuar / derivar</label>
      <select id="drenAlvo">${opts}</select>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px">
        <button class="tbtn" id="drenCont" style="justify-content:flex-start;background:var(--amber);color:#1a1206;font-weight:600">↳ Continuar a feição escolhida — retoma de onde parou, mantém o nome</button>
        <button class="tbtn" id="drenTrecho" style="justify-content:flex-start">⋯ Novo trecho da feição escolhida — mesmo ${esc(nome)}, nome próprio</button>
        <button class="tbtn" id="drenNova" style="justify-content:flex-start">✚ ${esc(nome)} novo — feição independente</button>
      </div>
      <div class="hint" id="drenPrev" style="margin-top:10px;font-size:11px"></div>
    </div></div>`;
  document.body.appendChild(bg);
  const sel=bg.querySelector('#drenAlvo');
  const prev=bg.querySelector('#drenPrev');
  const atualizaPrev=()=>{
    const idx=+sel.value; const alvo=feics.find(o=>o.i===idx);
    const base=(alvo?alvo.nm:nomeUlt).replace(/\s+·\s+T\d+$/,'');
    const nmTrecho=drenNomeUnico(L, base+' · T'+drenProxTrecho(L, base), nome);
    const nmNova=drenNomeUnico(L, nome+' '+drenProxNumero(L, nome), nome);
    prev.innerHTML='Continuação mantém <b>'+esc(alvo?alvo.nm:'')+'</b> · '+
      'novo trecho → <b>'+esc(nmTrecho)+'</b> · novo → <b>'+esc(nmNova)+'</b>. '+
      'Tudo fica na camada "Drenagem — '+esc(nome)+'".';
  };
  sel.onchange=atualizaPrev; atualizaPrev();
  bg.querySelector('#drenCont').onclick  =()=>{ const i=+sel.value; bg.remove(); drenArma(tipoKey, 'continua', i); };
  bg.querySelector('#drenTrecho').onclick=()=>{ const i=+sel.value; bg.remove(); drenArma(tipoKey, 'trecho', i); };
  bg.querySelector('#drenNova').onclick  =()=>{ bg.remove(); drenArma(tipoKey, 'nova'); };
  bg.addEventListener('click',e=>{ if(e.target===bg) bg.remove(); });
}
/* remove vértices redundantes de uma polilinha em coordenadas do CRS:
   (1) pontos a menos de MIN_D do anterior; (2) vértices praticamente colineares.
   Preserva sempre o primeiro e o último ponto. */
function drenLimpaVertices(pts, minD){
  const MIN=minD||0.20;
  if(!pts || pts.length<3) return pts? pts.slice():pts;
  // 1) remove quase-coincidentes consecutivos
  let out=[pts[0].slice()];
  for(let i=1;i<pts.length;i++){
    const a=out[out.length-1], b=pts[i];
    if(Math.hypot(b[0]-a[0], b[1]-a[1])>=MIN) out.push(b.slice());
  }
  // garante o último ponto original
  const lastO=pts[pts.length-1], lastN=out[out.length-1];
  if(Math.hypot(lastO[0]-lastN[0], lastO[1]-lastN[1])>1e-6) out.push(lastO.slice());
  if(out.length<3) return out;
  // 2) remove vértices colineares (desvio < 5 cm em relação ao segmento vizinho)
  const TOL=0.05;
  const keep=[out[0]];
  for(let i=1;i<out.length-1;i++){
    const a=keep[keep.length-1], p=out[i], b=out[i+1];
    const dx=b[0]-a[0], dy=b[1]-a[1], L2=dx*dx+dy*dy;
    let t = L2? ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L2 : 0; t=Math.max(0,Math.min(1,t));
    const dist=Math.hypot(p[0]-(a[0]+t*dx), p[1]-(a[1]+t*dy));
    if(dist>=TOL) keep.push(p);        // desvia o suficiente: é um vértice real
  }
  keep.push(out[out.length-1]);
  return keep;
}
/* limpa vértices redundantes de TODAS as feições das camadas de drenagem já
   existentes (corrige feições geradas antes do conserto do duplo-clique) e
   recalcula a geometria. Retorna quantos vértices foram removidos. */
function drenLimpaCamadas(){
  let totRem=0, feicoes=0;
  (S.layers||[]).forEach(L=>{
    if(L.gtype!=='line' || !/^Drenagem — /.test(L.name||'')) return;
    const d=(typeof drenGrade==='function')?drenGrade():null;
    L.features.forEach(f=>{
      if(!f.geom) return;
      const r=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom[0]:f.geom;
      const antes=r.length;
      const limpo=drenLimpaVertices(r);
      if(limpo.length<antes){
        totRem+=antes-limpo.length; feicoes++;
        if(f.multi&&Array.isArray(f.geom[0][0])) f.geom[0]=limpo; else f.geom=limpo;
        // recalcula cotas/geometria se houver MDT
        if(d && typeof drenDadosGeom==='function'){
          try{ const G=drenDadosGeom(limpo, d);
            f.zg=G.z.map(v=>v==null?NaN:v);
            Object.assign(f.props, {COTA_INI:G.COTA_INI, COTA_FIM:G.COTA_FIM, DESNIVEL_M:G.DESNIVEL_M,
              COMP_2D:G.COMP_2D, COMP_3D:G.COMP_3D, DECL_PCT:G.DECL_PCT, DECL_GR:G.DECL_GR, SENTIDO:G.SENTIDO});
          }catch(e){}
        }
      }
    });
    try{ drawLayer(L); }catch(e){}
  });
  refreshUI();
  if(totRem) toast(totRem+' vértice(s) redundante(s) removido(s) em '+feicoes+' feição(ões)');
  else toast('Nenhum vértice redundante encontrado');
  return totRem;
}
/* ============================================================================
   FORMAS GEOMÉTRICAS — quadrado, retângulo, círculo, elipse, polígono regular,
   estrela. Desenho por 2 cliques: base (canto ou centro) → extensão.
   Gera um POLÍGONO fechado no CRS de trabalho.
   ========================================================================== */
var FORMA = { tipo:null, dim:null, nlados:6, ang:0, prev:null, _lastClick:0 };
var FORMA_DEFS = {
  retangulo: {nome:'Retângulo'},
  quadrado:  {nome:'Quadrado'},
  circulo:   {nome:'Círculo'},
  elipse:    {nome:'Elipse'},
  regular:   {nome:'Polígono regular'},
  estrela:   {nome:'Estrela'},
};
/* abre o modal para digitar as dimensões da forma; ao confirmar, arma o clique
   de posicionamento (um toque define o CENTRO e a forma é criada).            */
function formaArma(tipo){
  const def=FORMA_DEFS[tipo]; if(!def){ return; }
  formaModal(tipo);
}
function formaModal(tipo){
  const def=FORMA_DEFS[tipo];
  let m=document.getElementById('formaModal');
  if(!m){ m=document.createElement('div'); m.id='formaModal'; m.className='modal-bg';
    document.body.appendChild(m); }
  // campos por tipo
  let campos='';
  if(tipo==='retangulo') campos=
    '<label class="field">Comprimento (m)</label><input type="number" id="fmC" value="20" step="0.5" min="0.1">'+
    '<label class="field">Largura (m)</label><input type="number" id="fmL" value="10" step="0.5" min="0.1">';
  else if(tipo==='quadrado') campos=
    '<label class="field">Lado (m)</label><input type="number" id="fmC" value="10" step="0.5" min="0.1">';
  else if(tipo==='circulo') campos=
    '<label class="field">Raio (m)</label><input type="number" id="fmR" value="10" step="0.5" min="0.1">';
  else if(tipo==='elipse') campos=
    '<label class="field">Semi-eixo X / raio maior (m)</label><input type="number" id="fmRx" value="15" step="0.5" min="0.1">'+
    '<label class="field">Semi-eixo Y / raio menor (m)</label><input type="number" id="fmRy" value="8" step="0.5" min="0.1">';
  else if(tipo==='regular') campos=
    '<label class="field">Nº de lados</label><input type="number" id="fmN" value="6" step="1" min="3" max="60">'+
    '<label class="field">Raio (centro→vértice, m)</label><input type="number" id="fmR" value="10" step="0.5" min="0.1">';
  else if(tipo==='estrela') campos=
    '<label class="field">Nº de pontas</label><input type="number" id="fmN" value="5" step="1" min="3" max="30">'+
    '<label class="field">Raio externo (m)</label><input type="number" id="fmR" value="12" step="0.5" min="0.1">'+
    '<label class="field">Raio interno (m)</label><input type="number" id="fmRi" value="5" step="0.5" min="0.1">';
  const temAng=(tipo!=='circulo');
  m.innerHTML='<div class="modal" style="width:min(380px,94vw)">'+
    '<div class="modal-h"><b>'+esc(def.nome)+'</b><div style="flex:1"></div><button class="tbtn" id="fmX">✕</button></div>'+
    '<div class="modal-b">'+campos+
    (temAng?'<label class="field">Rotação (°)</label><input type="number" id="fmAng" value="0" step="1">':'')+
    '<button class="tbtn" id="fmOk" style="width:100%;justify-content:center;margin-top:12px;background:var(--amber);color:#1a1206;font-weight:600">Posicionar no mapa (toque o centro)</button>'+
    '<div class="hint" style="margin-top:6px">Depois de confirmar, toque no mapa para posicionar o centro. A forma é criada na hora.</div>'+
    '</div></div>';
  m.classList.add('on');
  const num=id=>{ const e=document.getElementById(id); return e?parseFloat(String(e.value).replace(',','.')):NaN; };
  document.getElementById('fmX').onclick=()=>m.classList.remove('on');
  document.getElementById('fmOk').onclick=()=>{
    const dim={};
    if(tipo==='retangulo'){ dim.C=num('fmC'); dim.L=num('fmL'); if(!(dim.C>0&&dim.L>0)){ toast('Confira as dimensões'); return; } }
    else if(tipo==='quadrado'){ dim.C=dim.L=num('fmC'); if(!(dim.C>0)){ toast('Confira o lado'); return; } }
    else if(tipo==='circulo'){ dim.R=num('fmR'); if(!(dim.R>0)){ toast('Confira o raio'); return; } }
    else if(tipo==='elipse'){ dim.Rx=num('fmRx'); dim.Ry=num('fmRy'); if(!(dim.Rx>0&&dim.Ry>0)){ toast('Confira os eixos'); return; } }
    else if(tipo==='regular'){ dim.N=num('fmN')|0; dim.R=num('fmR'); if(!(dim.N>=3&&dim.R>0)){ toast('Confira lados e raio'); return; } }
    else if(tipo==='estrela'){ dim.N=num('fmN')|0; dim.R=num('fmR'); dim.Ri=num('fmRi'); if(!(dim.N>=3&&dim.R>0&&dim.Ri>0)){ toast('Confira os parâmetros'); return; } }
    FORMA.tipo=tipo; FORMA.dim=dim; FORMA.ang=(temAng?(num('fmAng')||0):0);
    m.classList.remove('on');
    const iniciar=()=>{
      if(typeof setTool==='function') setTool('forma');
      try{ formaBackstop(); }catch(e){}
      cmdLog(esc(def.nome)+': toque no mapa para posicionar o centro; Esc cancela','info');
      toast('Toque no mapa para posicionar o centro');
    };
    /* Formas também são desenhos: antes de posicioná-las, o usuário escolhe
       entre conservar os atributos da camada ativa ou criar outra camada. */
    if(typeof askDrawDest==='function') askDrawDest('poly',iniciar); else iniciar();
  };
}
/* rotaciona [dx,dy] por ang (graus, horário a partir do eixo X) */
function formaRot(dx,dy,ang){ const a=ang*Math.PI/180, c=Math.cos(a), s=Math.sin(a); return [dx*c-dy*s, dx*s+dy*c]; }
/* gera os vértices (CRS) a partir do CENTRO e das dimensões digitadas */
function formaGeom(tipo, ctr, dim, ang){
  const pts=[]; ang=ang||0;
  const add=(dx,dy)=>{ const r=formaRot(dx,dy,ang); pts.push([ctr[0]+r[0], ctr[1]+r[1]]); };
  if(tipo==='retangulo' || tipo==='quadrado'){
    const hx=dim.C/2, hy=dim.L/2; add(-hx,-hy); add(hx,-hy); add(hx,hy); add(-hx,hy);
  } else if(tipo==='circulo'){
    const N=72; for(let i=0;i<N;i++){ const a=2*Math.PI*i/N; add(dim.R*Math.cos(a), dim.R*Math.sin(a)); }
  } else if(tipo==='elipse'){
    const N=72; for(let i=0;i<N;i++){ const a=2*Math.PI*i/N; add(dim.Rx*Math.cos(a), dim.Ry*Math.sin(a)); }
  } else if(tipo==='regular'){
    const N=dim.N; for(let i=0;i<N;i++){ const a=2*Math.PI*i/N - Math.PI/2; add(dim.R*Math.cos(a), dim.R*Math.sin(a)); }
  } else if(tipo==='estrela'){
    const N=dim.N; for(let i=0;i<N*2;i++){ const a=Math.PI*i/N - Math.PI/2; const rr=(i%2===0)?dim.R:dim.Ri; add(rr*Math.cos(a), rr*Math.sin(a)); }
  }
  if(pts.length){ pts.push([pts[0][0],pts[0][1]]); }
  return pts;
}
function formaClick(latlng){
  if(!FORMA.tipo || !FORMA.dim) return;
  const agora=Date.now();
  if(FORMA._lastClick && (agora-FORMA._lastClick)<250) return;
  FORMA._lastClick=agora;
  const sn=(typeof snapLatLng==='function')?snapLatLng(latlng,null,{flash:false}):{latlng,snapped:false};
  const ll0=sn.snapped?sn.latlng:latlng;
  const ctr=fromWGS(S.workCRS, ll0.lng, ll0.lat);
  const ptsCRS=formaGeom(FORMA.tipo, ctr, FORMA.dim, FORMA.ang);
  formaLimpaPrev();
  if(ptsCRS.length<4){ toast('Forma degenerada'); return; }
  formaCria(ptsCRS);
  // encerra: uma forma por confirmação (evita criar várias sem querer)
  FORMA.tipo=null; FORMA.dim=null;
  if(typeof setTool==='function') setTool('select');
}
function formaCria(ptsCRS){
  const tipoNome=FORMA_DEFS[FORMA.tipo]? FORMA_DEFS[FORMA.tipo].nome : 'Forma';
  let alvo=activeLayer();
  if(!alvo || alvo.gtype!=='polygon'){
    alvo=(S.layers||[]).find(x=>x.name==='Formas' && x.gtype==='polygon');
    if(!alvo){ alvo=addLayer({name:'Formas', gtype:'polygon', crs:S.workCRS, features:[],
      fields:[{name:'FID',type:'N',length:9,decimal:0},{name:'FORMA',type:'C',length:20,decimal:0},
              {name:'AREA_M2',type:'N',length:16,decimal:2},{name:'PERIM_M',type:'N',length:12,decimal:2}],
      color:'#4aa3df'}); }
  }
  if(!alvo){ toast('Não consegui criar a camada'); return; }
  let A=0,P=0;
  for(let i=0;i<ptsCRS.length-1;i++){ const a=ptsCRS[i],b=ptsCRS[i+1];
    A+=a[0]*b[1]-b[0]*a[1]; P+=Math.hypot(b[0]-a[0],b[1]-a[1]); }
  A=Math.abs(A)/2;
  (['FORMA','AREA_M2','PERIM_M']).forEach(nm=>{ if(!(alvo.fields||[]).some(f=>f.name===nm)){
    const t=nm==='FORMA'?{name:nm,type:'C',length:20,decimal:0}:{name:nm,type:'N',length:16,decimal:2};
    alvo.fields=alvo.fields||[]; alvo.fields.push(t); } });
  const props={FID:(alvo.features.length+1), FORMA:tipoNome, AREA_M2:+A.toFixed(2), PERIM_M:+P.toFixed(2)};
  // polígono no CCMGIS: geom = [anel] (multi-anel), multi:true — igual ao desenho normal
  const feat={geom:[ptsCRS], multi:true, props};
  alvo.features.push(feat);
  if(typeof undoPush==='function') undoPush({t:'feat',L:alvo,feat});
  try{ drawLayer(alvo); }catch(e){}
  refreshUI();
  if(typeof openFeatForm==='function') openFeatForm(alvo,feat);
  else toast(tipoNome+' criada · '+((typeof fmtArea==='function')?fmtArea(A):(A.toFixed(1)+' m²')));
}
function formaPreview(latlng){
  if(!FORMA.tipo || !FORMA.dim) return;
  const sn=(typeof snapLatLng==='function')?snapLatLng(latlng,null,{flash:false}):{latlng,snapped:false};
  const ll0=sn.snapped?sn.latlng:latlng;
  const ctr=fromWGS(S.workCRS, ll0.lng, ll0.lat);
  const ptsCRS=formaGeom(FORMA.tipo, ctr, FORMA.dim, FORMA.ang);
  const ll=ptsCRS.map(p=>{ const w=toWGS(S.workCRS,p[0],p[1]); return [w[1],w[0]]; });
  formaLimpaPrev();
  try{ FORMA.prev=L2.polygon(ll,{color:'#4aa3df',weight:2,dashArray:'5 4',fill:true,fillOpacity:0.12,
    interactive:false, pane:'alagis_desenho'}).addTo(map); }catch(e){}
}
function formaLimpaPrev(){ if(FORMA.prev){ try{ map.removeLayer(FORMA.prev); }catch(e){} FORMA.prev=null; } }
function formaCancela(){ FORMA.tipo=null; FORMA.dim=null; formaLimpaPrev(); }
function formaMenu(btn){
  const itens=Object.keys(FORMA_DEFS).map(k=>({ic:'poligono', nome:FORMA_DEFS[k].nome, run:()=>formaArma(k)}));
  if(typeof ribMiniMenu==='function') ribMiniMenu(btn,'Formas geométricas',itens);
}

function formaBackstop(){
  if(typeof map==='undefined' || !map || !map.getContainer) return false;
  const cont=map.getContainer(); if(cont._formaBS) return true; cont._formaBS=true;
  const LIMIAR=6;
  const llDe=ev=>{ const r=cont.getBoundingClientRect();
    return map.containerPointToLatLng([ev.clientX-r.left, ev.clientY-r.top]); };
  cont.addEventListener('pointerdown', ev=>{
    if(S.tool!=='forma') return; if(ev.button===1||ev.button===2) return;
    cont._formaDown={x:ev.clientX, y:ev.clientY, moved:false};
  }, true);
  cont.addEventListener('pointermove', ev=>{
    if(S.tool!=='forma') return;
    if(cont._formaDown && (Math.abs(ev.clientX-cont._formaDown.x)>LIMIAR||Math.abs(ev.clientY-cont._formaDown.y)>LIMIAR))
      cont._formaDown.moved=true;
    if(FORMA.tipo && FORMA.dim){ try{ formaPreview(llDe(ev)); }catch(e){} }   // prévia segue o ponteiro
  }, true);
  cont.addEventListener('pointerup', ev=>{
    if(S.tool!=='forma') return;
    const d=cont._formaDown; cont._formaDown=null;
    if(d && d.moved) return;                    // foi pan/arraste do mapa
    try{ formaClick(llDe(ev)); }catch(e){}
    ev.preventDefault(); ev.stopPropagation();
  }, true);
  return true;
}
/* ============================================================================
   BACIA DE RETENÇÃO / CONTENÇÃO paramétrica
   Dimensões de FUNDO C×L, profundidade P, ângulo, talude das paredes (H:V),
   rampa de acesso (largura/declividade/azimute). Amostra o MDT, escava o
   terreno (fundo plano na cota MÍNIMA da boca − P), gera as feições e calcula
   o volume de corte.
   ========================================================================== */
var BACIA = { armado:false, params:null, fase:null, ctr:null, ang:0, prev:null };
function baciaMDTs(){ return (typeof drenMDTsDisponiveis==='function')? drenMDTsDisponiveis() : []; }
function baciaPreencheMDT(){
  const sel=document.getElementById('bcMDT'); if(!sel) return;
  const mdts=baciaMDTs();
  sel.innerHTML='<option value="">MDT: automático</option>'+
    mdts.map(m=>'<option value="'+m.id+'">'+esc(m.nome)+'</option>').join('');
}
function baciaGrade(){
  const sel=document.getElementById('bcMDT'); const v=sel?sel.value:'';
  if(v==='hidro'){ if(S.hidro&&S.hidro.dem) return S.hidro.dem; }
  else if(v){ const r=(S.rasters||[]).find(r=>String(r.id)===v && r.d && r.d.z); if(r) return r.d; }
  return (typeof drenGrade==='function')? drenGrade() : null;
}
/* Grade nula: amostra NaN em qualquer ponto. A rampa usa a grade só para
   limitar o talude ao terreno natural, e todo ponto de amostragem já tem
   alternativa quando a cota não existe — a cota que manda é a da própria
   caixa. Com isto a rampa sai de uma caixa puramente vetorial, sem raster. */
function baciaGradeVazia(){
  return {xll:0, yll:0, cs:1, nc:1, nr:1, z:[NaN], vazia:true};
}
function baciaExtravasorParametros(){
  const num=id=>parseFloat(String((document.getElementById(id)||{}).value).replace(',','.'));
  const azTxt=String((document.getElementById('bcExtAz')||{}).value||'').trim();
  return {
    on:!!(document.getElementById('bcExtOn')||{}).checked,
    tipo:(document.getElementById('bcExtTipo')||{}).value||'ret',
    Q:Math.max(0,num('bcExtQ')||0),H:Math.max(0,num('bcExtH')||0),
    C:Math.max(.01,num('bcExtCd')||0),bordaLivre:Math.max(0,num('bcExtBL')||0),
    comp:Math.max(.5,num('bcExtComp')||6),decl:Math.max(0,num('bcExtI')||0),
    az:azTxt===''?null:((num('bcExtAz')%360)+360)%360
  };
}
function baciaDimensionaExtravasor(E,zTopo,zFundo){
  E=Object.assign({},E||baciaExtravasorParametros());
  if(!E.on)return Object.assign(E,{ok:false,descricao:'Não previsto'});
  if(!(E.Q>0&&E.H>0&&E.C>0))
    return Object.assign(E,{ok:false,erro:'Informe vazão, carga hidráulica e coeficiente positivos.'});
  if(E.tipo==='tubo'){
    const A=E.Q/(E.C*Math.sqrt(2*9.80665*E.H));
    E.area=A;E.diametro=Math.sqrt(4*A/Math.PI);
    E.descricao=`Tubo circular Ø ${(E.diametro*1000).toFixed(0)} mm`;
    E.formula='Q = Cd·A·√(2gH)';
    E.cotaSoleira=Number.isFinite(zFundo)?zFundo:null;
  }else{
    E.largura=E.Q/(E.C*Math.pow(E.H,1.5));
    E.descricao=`Vertedor retangular com largura útil ${E.largura.toFixed(2)} m`;
    E.formula='Q = C·L·H^1,5';
    E.cotaSoleira=Number.isFinite(zTopo)?zTopo-E.bordaLivre-E.H:null;
  }
  E.ok=true;return E;
}
function baciaExtravasorAtualiza(){
  const E=baciaDimensionaExtravasor(baciaExtravasorParametros());
  const out=document.getElementById('bcExtOut');if(!out)return E;
  if(!E.on){out.innerHTML='Saída hidráulica não prevista.';return E;}
  if(!E.ok){out.innerHTML=`<span style="color:var(--sel)">${esc(E.erro||'Dados inválidos')}</span>`;return E;}
  out.innerHTML=`<b>${esc(E.descricao)}</b><br>Q = ${E.Q.toFixed(3)} m³/s · H = ${E.H.toFixed(2)} m · `+
    `${E.tipo==='tubo'?'Cd':'C'} = ${E.C.toFixed(2)} · borda livre ${E.bordaLivre.toFixed(2)} m<br>`+
    `Comprimento ${E.comp.toFixed(2)} m · caimento ${E.decl.toFixed(2)}% · `+
    (E.az==null?'orientação perpendicular à borda':`azimute ${E.az.toFixed(1)}°`);
  return E;
}
function baciaArma(){
  try{ cmdLog('Gerar bacia: iniciando…','info'); }catch(e){}
  const g=baciaGrade();
  if(!g){ toast('Carregue um MDT/MDE antes — a bacia precisa da topografia'); 
    try{ cmdLog('Gerar bacia ABORTADO: nenhum MDT encontrado (baciaGrade retornou vazio)','avisa'); }catch(e){}
    const out=document.getElementById('bcOut'); if(out) out.innerHTML='<span style="color:var(--amber)">Sem MDT: carregue uma superfície de elevação (GeoTIFF) ou gere a topografia no Hidro antes de criar a bacia.</span>';
    return; }
  const num=id=>parseFloat(String((document.getElementById(id)||{}).value).replace(',','.'));
  const modo=(document.getElementById('bcModo')||{}).value||'ret';
  const p={
    modo, P:num('bcP'),
    angInt:Math.max(10,Math.min(89,num('bcAngInt')||75)),
    angCorte:Math.max(10,Math.min(89,num('bcAngCorte')||45)),
    bermOn:!!(document.getElementById('bcBermOn')||{}).checked,
    talH:Math.max(1,num('bcTalH')||10),
    bermW:Math.max(0,num('bcBermW')||0),
    bermMinH:Math.max(0,num('bcBermMinH')||10),
    talSym:!!(document.getElementById('bcTalSym')||{}).checked,
    C:num('bcC'), L:num('bcL'), ang:num('bcAng')||0,
    rampaOn:(document.getElementById('bcRampaOn')||{}).checked,
    rampaW:num('bcRampaW'), rampaI:num('bcRampaI'), rampaAz:num('bcRampaAz')||0,
    extravasor:baciaExtravasorParametros(), g
  };
  if(!(p.P>0)){ toast('Confira a profundidade P'); return; }
  if(modo==='feicao'){
    const sel=document.getElementById('bcFeic'); const fid=sel? sel.value : '';
    const alvo=baciaFeicaoBoca(fid);
    if(!alvo){ toast('Escolha um polígono fechado como boca'); return; }
    BACIA.params=p;
    try{ baciaGeraBoca(alvo.ring, p); }catch(e){ toast('Falha ao gerar: '+(e&&e.message||e)); }
    BACIA.params=null; return;
  }
  if(!(p.C>0&&p.L>0)){ toast('Confira C e L'); return; }
  // MODO RETÂNGULO por 2 cliques: 1) centro  2) girar movendo o ponteiro e clicar
  // de novo para confirmar. Só desenha limite superior (aresta) e inferior (fundo).
  BACIA.params=p; BACIA.fase='centro'; BACIA.ctr=null; BACIA.ang=p.ang||0;
  if(typeof setTool==='function') setTool('bacia');
  try{ baciaBackstop(); }catch(e){}
  cmdLog('Bacia: 1) toque o CENTRO da caixa','info');
  toast('Toque o CENTRO da caixa');
  const out=document.getElementById('bcOut');
  if(out) out.innerHTML='<b style="color:var(--amber)">Passo 1:</b> toque o centro da caixa. Depois gire e toque de novo para confirmar.';
}
/* backstop de ponteiro: capta o toque de posicionamento no tablet/caneta/mouse */
function baciaBackstop(){
  if(typeof map==='undefined' || !map || !map.getContainer) return false;
  const cont=map.getContainer(); if(cont._baciaBS) return true; cont._baciaBS=true;
  const LIMIAR=6;
  const llDe=ev=>{ const r=cont.getBoundingClientRect();
    return map.containerPointToLatLng([ev.clientX-r.left, ev.clientY-r.top]); };
  cont.addEventListener('pointerdown', ev=>{
    if(S.tool!=='bacia') return; if(ev.button===1||ev.button===2) return;
    cont._baciaDown={x:ev.clientX, y:ev.clientY, moved:false};
  }, true);
  cont.addEventListener('pointermove', ev=>{
    if(S.tool!=='bacia') return;
    if(cont._baciaDown &&
       (Math.abs(ev.clientX-cont._baciaDown.x)>LIMIAR||Math.abs(ev.clientY-cont._baciaDown.y)>LIMIAR))
      cont._baciaDown.moved=true;
    // FASE GIRAR: o ponteiro define o ângulo (azimute do centro ao ponteiro) e mostra preview
    if(BACIA.fase==='girar' && BACIA.ctr){
      const ll=llDe(ev); const c=fromWGS(S.workCRS, ll.lng, ll.lat);
      const dx=c[0]-BACIA.ctr[0], dy=c[1]-BACIA.ctr[1];
      BACIA.ang = Math.atan2(dx,dy)*180/Math.PI;   // azimute topográfico (0=N, horário)
      baciaPreviewCaixa();
    }
  }, true);
  cont.addEventListener('pointerup', ev=>{
    if(S.tool!=='bacia') return;
    const d=cont._baciaDown; cont._baciaDown=null;
    if(d && d.moved && BACIA.fase!=='girar') return;   // arraste = pan (exceto girando)
    try{ baciaClick(llDe(ev)); }catch(e){ toast('Falha: '+(e&&e.message||e)); }
    ev.preventDefault(); ev.stopPropagation();
  }, true);
  return true;
}
/* preview do retângulo (aresta + fundo) enquanto gira, no pane de desenho */
function baciaPreviewCaixa(){
  const p=BACIA.params, ctr=BACIA.ctr; if(!p||!ctr) return;
  if(!S.drawLayer) return;
  S.drawLayer.clearLayers();
  const aresta=baciaRet(ctr, p.C, p.L, BACIA.ang);
  const offInt=baciaTaludeDistParaH(p.P,Math.tan(p.angInt*Math.PI/180),p);
  const fundo=(typeof bufferPoligono==='function'? bufferPoligono(aresta.concat([aresta[0]]), -offInt, false, 8) : null) || aresta;
  const toLL=r=>r.map(c=>{ const w=toWGS(S.workCRS,c[0],c[1]); return [w[1],w[0]]; });
  const aLL=toLL(aresta), fLL=toLL(fundo);
  L2.polygon(aLL,{color:'#c25b1a',weight:2,fill:false,dashArray:'4 3'}).addTo(S.drawLayer);        // aresta (limite superior)
  L2.polygon(fLL,{color:'#f5c542',weight:1.5,fill:false,dashArray:'2 2'}).addTo(S.drawLayer);      // fundo (limite inferior)
  // marca o centro e o ângulo
  const cLL=(()=>{ const w=toWGS(S.workCRS,ctr[0],ctr[1]); return [w[1],w[0]]; })();
  L2.circleMarker(cLL,{radius:3,color:'#fff',fillColor:'#c25b1a',fillOpacity:1}).addTo(S.drawLayer);
}
function baciaFeicaoBoca(fid){
  let L=null, f=null;
  (S.layers||[]).forEach(ly=>{ if(ly.gtype!=='polygon') return;
    (ly.features||[]).forEach((ft,i)=>{ if(String(ly.id)+':'+i===fid){ L=ly; f=ft; } }); });
  if(!f){ if(S.selFeat && S.selFeat.layer && S.selFeat.layer.gtype==='polygon'){
      L=S.selFeat.layer; f=L.features[S.selFeat.idx]; } }
  if(!f||!f.geom) return null;
  let ring=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom[0]:f.geom;
  ring=ring.map(pt=>{ if(L.crs===S.workCRS) return [pt[0],pt[1]];
    const w=toWGS(L.crs,pt[0],pt[1]); const c=fromWGS(S.workCRS,w[0],w[1]); return [c[0],c[1]]; });
  return {ring, L, f};
}
function baciaPreencheFeic(){
  const sel=document.getElementById('bcFeic'); if(!sel) return;
  const opts=[];
  (S.layers||[]).forEach(L=>{ if(L.gtype!=='polygon') return;
    (L.features||[]).forEach((f,i)=>{ const nm=(f.props&&(f.props.NOME||f.props.NAME))||(L.name+' #'+(i+1));
      opts.push('<option value="'+L.id+':'+i+'">'+esc(nm)+'</option>'); }); });
  sel.innerHTML= opts.length? opts.join('') : '<option value="">(nenhum polígono na tela)</option>';
}
function baciaRot(dx, dy, azDeg){
  const a=azDeg*Math.PI/180, s=Math.sin(a), c=Math.cos(a);
  return [ dx*s + dy*c, dx*c - dy*s ];
}
function baciaClick(latlng){
  const p=BACIA.params; if(!p){ return; }
  const agora=Date.now();
  if(BACIA._lastClick && (agora-BACIA._lastClick)<250) return;
  BACIA._lastClick=agora;
  const c=fromWGS(S.workCRS, latlng.lng, latlng.lat);
  if(BACIA.fase==='centro'){
    // 1º clique: fixa o centro, entra na fase de girar
    BACIA.ctr=[c[0],c[1]]; BACIA.fase='girar';
    baciaPreviewCaixa();
    cmdLog('Bacia: 2) mova para GIRAR e toque de novo para confirmar (ou toque no mesmo ponto p/ manter)','info');
    toast('Gire a caixa e toque para confirmar');
    const out=document.getElementById('bcOut');
    if(out) out.innerHTML='<b style="color:var(--amber)">Passo 2:</b> mova o ponteiro para girar a caixa e toque para confirmar.';
    return;
  }
  if(BACIA.fase==='girar'){
    // 2º clique: confirma a rotação atual e gera a caixa
    const ctr=BACIA.ctr;
    // atualiza o ângulo pelo ponto do 2º clique (se afastou do centro)
    const dx=c[0]-ctr[0], dy=c[1]-ctr[1];
    if(Math.hypot(dx,dy)>0.5) BACIA.ang=Math.atan2(dx,dy)*180/Math.PI;
    p.ang=BACIA.ang;
    if(S.drawLayer) S.drawLayer.clearLayers();
    const aresta=baciaRet(ctr, p.C, p.L, p.ang); aresta.push(aresta[0].slice());
    BACIA.fase=null;
    try{ baciaGeraBoca(aresta, p, ctr); }
    catch(e){ toast('Falha ao gerar: '+(e&&e.message||e)); try{ cmdLog('ERRO baciaGeraBoca: '+(e&&e.stack||e),'erro'); }catch(_){} }
    // NÃO volta ao pan aqui: baciaGeraBoca arma a fase da rampa (baciaArmaRampa)
    return;
  }
}
function baciaRet(ctr, C, L, ang){
  const h=[[+C/2,+L/2],[+C/2,-L/2],[-C/2,-L/2],[-C/2,+L/2]];
  return h.map(([dx,dy])=>{ const o=baciaRot(dx,dy,ang); return [ctr[0]+o[0], ctr[1]+o[1]]; });
}
function baciaArea(ring){ let A=0; for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1];A+=a[0]*b[1]-b[0]*a[1];} return Math.abs(A)/2; }
/* Talude escalonado: cada lance vence no máximo talH e, entre lances, entra
   uma berma horizontal de bermW. A regra só é ativada acima de bermMinH. */
function baciaUsaBermas(p,altura){
  return !!(p&&p.bermOn&&p.talH>0&&p.bermW>=0&&altura>=p.bermMinH&&altura>p.talH);
}
function baciaTaludeDistParaH(altura,tanA,p){
  if(!(altura>0)) return 0;
  const nB=baciaUsaBermas(p,altura)?Math.floor((altura-1e-7)/p.talH):0;
  return altura/(tanA||1)+nB*p.bermW;
}
function baciaTaludeHEmDist(dist,tanA,p,alturaAlvo){
  if(!(dist>0)) return 0;
  if(!baciaUsaBermas(p,alturaAlvo)) return dist*tanA;
  const corrida=p.talH/(tanA||1), ciclo=corrida+p.bermW;
  const n=Math.floor(dist/ciclo), resto=dist-n*ciclo;
  return n*p.talH+Math.min(resto,corrida)*tanA;
}
function baciaPontoMaisProximoRing(q,ring){
  let best=null,bd=Infinity;
  for(let i=0;i<(ring||[]).length-1;i++){
    const a=ring[i],b=ring[i+1],dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
    let t=den?((q[0]-a[0])*dx+(q[1]-a[1])*dy)/den:0;t=Math.max(0,Math.min(1,t));
    const p=[a[0]+t*dx,a[1]+t*dy],d=(p[0]-q[0])**2+(p[1]-q[1])**2;
    if(d<bd){bd=d;best=p;}
  }
  return best;
}
/* Contrato geométrico das breaklines laterais da bacia. Mantido em função
   pura para que a geração e os testes usem exatamente a mesma validação. */
function baciaValidaQuebrasLimite(limite,talE,talD,peE,peD,tol){
  tol=Math.max(1e-6,+tol||.05);
  const falhas=[];
  if(!Array.isArray(limite)||limite.length<4)
    return {ok:false,falhas:['limite externo ausente ou incompleto']};
  const dentroOuBorda=q=>Array.isArray(q)&&q.length>=2&&
    (baciaDentro(q[0],q[1],limite)||baciaDistRing(q[0],q[1],limite)<=tol),
    mesmoNo=q=>Array.isArray(q)&&limite.some(p=>Math.hypot(p[0]-q[0],p[1]-q[1])<=1e-7);
  [[talE,peE,'esquerdo'],[talD,peD,'direito']].forEach(([tal,pe0,lado])=>{
    const pes=tal&&Array.isArray(tal.pe)?tal.pe:[],
      cristas=tal&&Array.isArray(tal.encontro)?tal.encontro:[];
    [...pes,...cristas].forEach(q=>{
      if(!dentroOuBorda(q))falhas.push(lado+' fora do limite');
    });
    if(!cristas.length||!pe0||Math.hypot(cristas[0][0]-pe0[0],cristas[0][1]-pe0[1])>1e-7)
      falhas.push('crista '+lado+' desconectada do pé');
    const fim=cristas[cristas.length-1],fimPe=pes[pes.length-1];
    if(!fim||!mesmoNo(fim))
      falhas.push('crista '+lado+' desconectada do limite');
    if(!fimPe||!mesmoNo(fimPe))falhas.push('pé '+lado+' desconectado do limite');
  });
  const unicas=[...new Set(falhas)];
  return {ok:unicas.length===0,falhas:unicas};
}
function baciaCriaSimbolos(p,arestaR,fundoR,daylightR,zAresta,zFundo,excluir){
  const temBermaInt=baciaUsaBermas(p,p.P);
  const zDay=(daylightR||[]).map(q=>sampleZbil(p.g,q[0],q[1])).filter(Number.isFinite);
  const hExt=zDay.length?Math.max(0,Math.max(...zDay)-zAresta):0;
  const temBermaExt=baciaUsaBermas(p,hExt);
  if(!p.talSym&&!temBermaInt&&!temBermaExt) return null;
  const feats=[],passo=8;
  const fechado=r=>{
    const a=(r||[]).map(q=>[q[0],q[1]]);
    if(a.length&&Math.hypot(a[0][0]-a[a.length-1][0],a[0][1]-a[a.length-1][1])>1e-7)
      a.push(a[0].slice());
    return a;
  };
  const adicionaLinha=(ring,z,tipo)=>{
    const r=fechado(ring);
    for(let i=0;i<r.length-1;i++){
      const a=r[i],b=r[i+1],mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;
      if(excluir&&baciaDentro(mx,my,excluir)) continue;
      feats.push({geom:[a.slice(),b.slice()],multi:false,zg:[z,z],props:{TIPO:tipo}});
    }
  };
  /* As bermas antes existiam somente na função de cota. Agora suas duas
     bordas são feições reais: isto deixa o escalonamento legível em planta,
     disponível no TIN e exportável para implantação. */
  if(temBermaInt){
    const tanI=Math.tan(p.angInt*Math.PI/180);
    const dTotal=baciaTaludeDistParaH(p.P,tanI,p);
    const n=Math.floor((p.P-1e-7)/p.talH);
    for(let k=1;k<=n;k++){
      const h=k*p.talH,z=zFundo+h;
      const dPe=h/(tanI||1)+(k-1)*p.bermW;
      const dCrista=dPe+p.bermW;
      const rPe=bufferPoligono(arestaR,-Math.max(0,dTotal-dPe),false,8);
      const rCrista=bufferPoligono(arestaR,-Math.max(0,dTotal-dCrista),false,8);
      if(rPe) adicionaLinha(rPe,z,'Berma interna — pé '+k);
      if(rCrista) adicionaLinha(rCrista,z,'Berma interna — crista '+k);
    }
  }
  /* No corte externo a altura varia com o MDT. Para cada ponto amostrado do
     daylight, a borda da berma é colocada na distância de projeto e só é
     ligada onde existe altura de corte suficiente. */
  if(temBermaExt&&daylightR&&daylightR.length>2){
    const tanC=Math.tan(p.angCorte*Math.PI/180);
    const n=Math.floor((hExt-1e-7)/p.talH);
    for(let k=1;k<=n;k++){
      const h=k*p.talH,z=zAresta+h;
      [0,p.bermW].forEach((bw,bi)=>{
        const dAlvo=h/(tanC||1)+(k-1)*p.bermW+bw;
        /* Gera a linha por EXTRAPOLAÇÃO e só depois a corta. O código antigo
           descartava a primeira amostra inválida e deixava a berma terminar
           "voando" até uma célula antes da interseção. A margem abaixo mede
           simultaneamente altura disponível e largura disponível; quando
           muda de sinal, interpolamos o ponto exato de término. */
        const am=[];
        for(let i=0;i<daylightR.length;i++){
          const d=daylightR[i],q=baciaPontoMaisProximoRing(d,arestaR);
          const zt=sampleZbil(p.g,d[0],d[1]),L=q?Math.hypot(d[0]-q[0],d[1]-q[1]):0;
          if(!q||!isFinite(zt)||L<1e-9){am.push(null);continue;}
          const ux=(d[0]-q[0])/L,uy=(d[1]-q[1])/L;
          am.push({
            pt:[q[0]+ux*dAlvo,q[1]+uy*dAlvo],
            margem:Math.min(zt-zAresta-h,L-dAlvo)
          });
        }
        const tipo='Berma externa — '+(bi?'crista ':'pé ')+k;
        const adiciona=(a,b)=>{
          if(!a||!b||Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7)return;
          const mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2;
          if(!(excluir&&baciaDentro(mx,my,excluir)))
            feats.push({geom:[a,b],multi:false,zg:[z,z],props:{TIPO:tipo}});
        };
        for(let i=1;i<am.length;i++){
          const a=am[i-1],b=am[i];if(!a||!b)continue;
          const va=a.margem>=-1e-6,vb=b.margem>=-1e-6;
          if(va&&vb){adiciona(a.pt,b.pt);continue;}
          if(va===vb)continue;
          const den=a.margem-b.margem;
          const t=Math.max(0,Math.min(1,Math.abs(den)>1e-12?a.margem/den:.5));
          const hit=[a.pt[0]+(b.pt[0]-a.pt[0])*t,
                     a.pt[1]+(b.pt[1]-a.pt[1])*t];
          if(va)adiciona(a.pt,hit);else adiciona(hit,b.pt);
        }
      });
    }
  }
  const cria=(orig,dest,tipo,z0,z1)=>{
    for(let i=0;i<orig.length-1;i++){
      const a=orig[i],b=orig[i+1],L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.floor(L/passo));
      for(let k=0;k<n;k++){const t=(k+.5)/n,q=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],e=baciaPontoMaisProximoRing(q,dest);
        if(!e||(excluir&&baciaDentro(q[0],q[1],excluir)))continue;const u=[q[0]+(e[0]-q[0])*.42,q[1]+(e[1]-q[1])*.42];
        feats.push({geom:[q,u],multi:false,zg:[z0,z0+(z1-z0)*.42],props:{TIPO:tipo}});
      }
    }
  };
  if(p.talSym){
    cria(arestaR,daylightR,'Símbolo talude externo',zAresta,zAresta);
    cria(arestaR,fundoR,'Símbolo talude interno',zAresta,zFundo);
  }
  if(!feats.length)return null;
  const Ls=addLayer({name:'Pés, cristas e bermas — bacia',gtype:'line',crs:S.workCRS,features:feats,
    fields:[{name:'TIPO',type:'C',length:36,decimal:0}],color:'#8a5a2b'});
  if(Ls){Ls.weight=1;if(Ls.sym){Ls.sym.weight=1;}Ls._baciaEng=1;drawLayer(Ls);}
  return Ls;
}
function baciaDentro(px,py,ring){ let dentro=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){ const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    if(((yi>py)!==(yj>py)) && (px<(xj-xi)*(py-yi)/(yj-yi)+xi)) dentro=!dentro; } return dentro; }
function baciaDistRing(x,y,ring){ let mn=Infinity;
  for(let i=0;i<ring.length-1;i++){ const a=ring[i],b=ring[i+1];
    const dx=b[0]-a[0],dy=b[1]-a[1], L2=dx*dx+dy*dy;
    let tt=L2? ((x-a[0])*dx+(y-a[1])*dy)/L2 : 0; tt=Math.max(0,Math.min(1,tt));
    const d=Math.hypot(x-(a[0]+tt*dx), y-(a[1]+tt*dy)); if(d<mn) mn=d; } return mn; }
function baciaChegadaOrtogonal(x,y,ring,ctr){
  let best=[x,y], dir=[1,0], mn=Infinity, bestAlign=-Infinity;
  const rvx=x-ctr[0],rvy=y-ctr[1],rvl=Math.hypot(rvx,rvy)||1;
  for(let i=0;i<ring.length-1;i++){
    const a=ring[i],b=ring[i+1], dx=b[0]-a[0],dy=b[1]-a[1], den=dx*dx+dy*dy;
    let t=den?((x-a[0])*dx+(y-a[1])*dy)/den:0; t=Math.max(0,Math.min(1,t));
    const q=[a[0]+t*dx,a[1]+t*dy], d=Math.hypot(x-q[0],y-q[1]);
    const L=Math.sqrt(den)||1, tx=dx/L,ty=dy/L;
    let nx=-ty,ny=tx;
    // Das duas normais possíveis, escolhe a que aponta para fora da caixa.
    if((q[0]-ctr[0])*nx+(q[1]-ctr[1])*ny<0){nx=-nx;ny=-ny;}
    const align=nx*(rvx/rvl)+ny*(rvy/rvl);
    // Perto de um canto, dois segmentos podem ter praticamente a mesma
    // distância. O clique desempata pelo lado para o qual o usuário apontou.
    if(d<mn-0.25 || (Math.abs(d-mn)<=0.25 && align>bestAlign)){
      mn=d;best=q;dir=[nx,ny];bestAlign=align;
    }
  }
  return {p:best,dir};
}
/* cota de engenharia da caixa num ponto (x,y). Usa a distância ao anel do FUNDO
   como régua contínua (sem o facetamento em leque do dF/(dF+dA)):
   - dentro do fundo → zFundo
   - subindo: primeiro o talude INTERNO (tan angInt) até zAresta,
     depois o talude de CORTE (tan angCorte) até o terreno.
   Assim a superfície é contínua e monotônica saindo do fundo.               */
function baciaCotaEng(x,y, ctr,p, fundoR, arestaR, daylightR, zFundo, zAresta, zTerr){
  if(baciaDentro(x,y,fundoR)) return zFundo;
  // fora do daylight (limite do corte) → mantém o terreno
  if(daylightR && !baciaDentro(x,y,daylightR)) return null;
  const tanI=Math.tan(p.angInt*Math.PI/180);
  const tanC=Math.tan(p.angCorte*Math.PI/180);
  const dFundo=baciaDistRing(x,y,fundoR);       // distância horizontal ao fundo (contínua)
  // altura do talude interno até a aresta:
  const hInt=zAresta - zFundo;                   // = P
  const dIntMax=baciaTaludeDistParaH(hInt,tanI,p);
  let z;
  if(dFundo<=dIntMax){
    z = zFundo + baciaTaludeHEmDist(dFundo,tanI,p,hInt);
  } else {
    const hExt=isFinite(zTerr)?Math.max(0,zTerr-zAresta):1e6;
    z = zAresta + baciaTaludeHEmDist(dFundo-dIntMax,tanC,p,hExt);
  }
  // nunca acima do terreno (o corte "aflora" onde encosta na superfície)
  return Math.min(z, isFinite(zTerr)? zTerr : z);
}
function baciaRampaCota(x,y, ctr,p, zFundo, rampaLen){
  const dirO=baciaRot(1,0,p.rampaAz);
  const proj=(x-ctr[0])*dirO[0]+(y-ctr[1])*dirO[1];
  const meiaC=p.C/2, meiaL=p.L/2;
  const alcance=Math.abs(dirO[0])*meiaC+Math.abs(dirO[1])*meiaL;
  const s=proj-alcance;
  if(s<=0) return zFundo;
  if(s>=rampaLen) return null;
  return zFundo + (s/rampaLen)*p.P;
}
function baciaEscava(g, ctr, p, fundoR, arestaR, daylightR, zFundo, zAresta, rampaInfo){
  const csx=g.cs, csy=(g.csy||g.cs), cellA=csx*csy;
  // raster NOVO só da bacia: começa TODO NoData (NaN); preenche apenas a caixa.
  const zB=new Float32Array(g.nc*g.nr); zB.fill(NaN);
  // caixa delimitadora: daylight (ou aresta) + rampa
  const lim = (daylightR||arestaR).slice();
  const obraRampa=rampaInfo?(rampaInfo.corredor||rampaInfo.pista):[];
  const allX=lim.map(c=>c[0]).concat(obraRampa.map(c=>c[0]));
  const allY=lim.map(c=>c[1]).concat(obraRampa.map(c=>c[1]));
  const xmin=Math.min(...allX), xmax=Math.max(...allX), ymin=Math.min(...allY), ymax=Math.max(...allY);
  const c0=Math.max(0,Math.floor((xmin-g.xll)/csx)-1), c1=Math.min(g.nc-1,Math.ceil((xmax-g.xll)/csx)+1);
  const r0=Math.max(0,Math.floor((g.yll+g.nr*csy-ymax)/csy)-1), r1=Math.min(g.nr-1,Math.ceil((g.yll+g.nr*csy-ymin)/csy)+1);
  let vol=0, nCel=0;
  for(let rr=r0;rr<=r1;rr++){ for(let cc=c0;cc<=c1;cc++){
    const x=g.xll+(cc+0.5)*csx, y=g.yll+(g.nr-1-rr+0.5)*csy;
    const k=rr*g.nc+cc; const zT=g.z[k];
    // cota de engenharia da caixa neste ponto (null = fora do limite da bacia)
    let zBacia=baciaCotaEng(x,y, ctr,p, fundoR, arestaR, daylightR, zFundo, zAresta, isFinite(zT)?zT:1e9);
    if(rampaInfo && baciaDentro(x,y,rampaInfo.corredor||rampaInfo.pista)){
      let zR=baciaRampaCotaPista(x,y, rampaInfo, zFundo);
      if(zR!=null && rampaInfo.tanC && rampaInfo.perp && rampaInfo.hw){
        const v=Math.abs((x-rampaInfo.pFundo[0])*rampaInfo.perp[0]+
                         (y-rampaInfo.pFundo[1])*rampaInfo.perp[1]);
        if(v>rampaInfo.hw) zR+=rampaInfo.tanC*(v-rampaInfo.hw);
      }
      if(zR!=null) zBacia=(zBacia==null)? zR : Math.min(zBacia,zR);
    }
    if(zBacia!=null){                          // dentro da bacia → grava a cota da caixa
      zB[k]=zBacia;
      if(isFinite(zT) && zT>zBacia){ vol+=(zT-zBacia)*cellA; nCel++; }   // volume de corte
    }
  }}
  const z2=zB;                                  // o raster é SÓ a bacia
  let nova=null;
  try{
    // herda metadados do raster de origem (CRS etc.) p/ renderizar igual aos outros
    const orig=(S.rasters||[]).find(rr=>rr.d===g) || (S.rasters||[]).find(rr=>rr.d && rr.d.nc===g.nc && rr.d.nr===g.nr);
    const dNovo={nc:g.nc,nr:g.nr,cs:g.cs,csy:g.csy,xll:g.xll,yll:g.yll,z:z2};
    if(g.srcCRS) dNovo.srcCRS=g.srcCRS; else if(orig&&orig.d&&orig.d.srcCRS) dNovo.srcCRS=orig.d.srcCRS;
    if(g._bb) dNovo._bb=g._bb.slice();
    const r={id:(typeof rid!=='undefined'?rid++:Date.now()),
      name:'Bacia — superfície de projeto', d:dNovo,
      src:{file:'bacia', at:new Date().toISOString()},
      style:{mode:'hipso_hs', opacity:0.9}, visible:true, overlay:null};
    const Llim=BACIA.ultima&&(BACIA.ultima.Lfinal||BACIA.ultima.Lrampa||BACIA.ultima.Lv);
    if(Llim)r._v3={papel:'projeto',cor:'#4f8b3a',limId:Llim.id};
    /* garante o par do corte: terreno FURADO no mesmo anel em que esta
       superfície de projeto é CONTIDA — as duas bordas se encontram na
       linha de interseção, na cota do terreno */
    if(Llim)try{ baciaLigaFuroTerreno(g,Llim); }catch(e){}
    /* MALHA EXATA no 3D: o raster continua para perfis/volume, mas a cena 3D
       passa a usar a triangulação feita pelas próprias linhas (r._tinMesh) —
       fundo, pés, cristas, bermas e interseção são ARESTAS da malha, no
       mesmíssimo XYZ das linhas. Sem grade, sem chanfro. */
    try{
      const Dsup=Llim&&Llim.tinSurface;
      if(Dsup&&Dsup.kind==='bacia-rampa-v1'){
        (async()=>{ try{
          const M=await baciaMalhaExata(Dsup,g);
          if(M&&M.indices.length){
            r._tinMesh={positions:M.positions,indices:M.indices};
            r._tinMethod='bacia-exata'; r._rev=(r._rev||0)+1;
            try{cmdLog('Superfície EXATA da caixa: '+(M.indices.length/3)+' triângulos — linhas e superfície no mesmo XYZ','info');}catch(_){}
            if(typeof v3Auto==='function')v3Auto();
          }
        }catch(e2){ try{cmdLog('Malha exata da caixa falhou ('+(e2&&e2.message||e2)+') — usando a grade','avisa');}catch(_){} } })();
      }
    }catch(e){}
    S.rasters.push(r);
    projectAutoSaveRaster(r);
    try{ if(typeof renderRaster==='function') renderRaster(r); }
    catch(e){ try{ cmdLog('MDT cortado criado, mas renderRaster falhou: '+(e&&e.message||e),'avisa'); }catch(_){} }
    nova=r.name;
  }catch(e){ try{ cmdLog('Falha ao criar o raster escavado: '+(e&&e.message||e),'erro'); }catch(_){} }
  return {vol, nCel, nova};
}
/* cota da pista da rampa num ponto: projeta na direção da rampa e desce linear */
function baciaRampaCotaPista(x,y, rampaInfo, zFundo){
  const {pFundo, dirO, rampaLen, P} = rampaInfo;
  const s=(x-pFundo[0])*dirO[0]+(y-pFundo[1])*dirO[1];   // distância ao longo da rampa
  if(s<=0) return zFundo;
  /* Na rampa nova cada borda termina na sua própria interseção com o MDT.
     Interpola o comprimento final pela posição transversal; assim o raster
     também é cortado pela linha de encontro oblíqua, sem avançar no terreno. */
  if(rampaInfo.ir&&rampaInfo.perp&&rampaInfo.hw){
    const v=(x-pFundo[0])*rampaInfo.perp[0]+(y-pFundo[1])*rampaInfo.perp[1];
    const t=Math.max(0,Math.min(1,(v+rampaInfo.hw)/(2*rampaInfo.hw)));
    const sEnd=rampaInfo.sRight+(rampaInfo.sLeft-rampaInfo.sRight)*t;
    if(s>=sEnd) return null;
    return zFundo+s*rampaInfo.ir;
  }
  if(s>=rampaLen) return null;
  return zFundo + (s/rampaLen)*P;
}
/* ========================================================================
   INTERSEÇÃO EXATA DA BACIA/CAIXA COM O MDT

   A cava já usa a regra correta: primeiro existe uma superfície contínua de
   projeto, depois calcula-se o nível zero de (Zprojeto - ZMDT), e somente no
   fim pés/cristas são recortados. A bacia ainda fazia o inverso: unia em 2D
   boca, pista e dois polígonos laterais e chamava essa união de "limite".
   Em terreno inclinado a união não é uma interseção de superfícies; por isso
   as linhas pareciam coincidir em planta, mas ficavam metros separadas no 3D.

   As rotinas abaixo aplicam à bacia o mesmo contrato geométrico da cava:
     1. extrapolam a superfície completa, com todos os patamares e a rampa;
     2. extraem Zprojeto = ZMDT por marching squares;
     3. refinam cada vértice sobre a raiz real por bisseção;
     4. recortam cada linha 3D pela MESMA igualdade;
     5. inserem os extremos exatos de crista/pé no próprio anel de contato.
   Assim limite, linhas, DXF, malha de projeto e furo do terreno compartilham
   literalmente os mesmos nós XYZ.                                           */
function baciaFechaAnel(r){
  const q=(r||[]).map(p=>[+p[0],+p[1]]).filter(p=>p.every(Number.isFinite));
  if(q.length>2&&Math.hypot(q[0][0]-q.at(-1)[0],q[0][1]-q.at(-1)[1])>1e-8)
    q.push(q[0].slice());
  else if(q.length>2)q[q.length-1]=q[0].slice();
  return q;
}
function baciaMdtDaSuperficie(L){
  const D=L&&L.tinSurface;if(!D)return null;
  if(D.rasterId!=null){const R=(S.rasters||[]).find(r=>String(r.id)===String(D.rasterId));if(R&&R.d)return R;}
  const ligados=(S.rasters||[]).filter(r=>r&&r.d&&r._v3&&
    (r._v3.papel||'terreno')==='terreno'&&String(r._v3.limId||'')===String(L.id));
  if(ligados.length)return ligados[0];
  /* Compatibilidade com projetos antigos: escolhe o raster cuja cota melhor
     reproduz a linha de encontro gravada. Superfícies de projeto não entram
     como primeira escolha, pois o objetivo é sempre o terreno original. */
  const f=(L.features||[]).find(q=>/^(?:Limite externo|Crista do corte \/ encontro com terreno)$/i
    .test(String(q.props?.TIPO||''))&&Array.isArray(q.zg));
  const cand=[];
  for(const R of S.rasters||[]){if(!R?.d)continue;const e=[];
    if(f)for(let i=0;i<f.geom.length;i+=Math.max(1,Math.floor(f.geom.length/80))){
      const z=sampleZbil(R.d,f.geom[i][0],f.geom[i][1]),zf=+f.zg[i];
      if(Number.isFinite(z)&&Number.isFinite(zf))e.push(Math.abs(z-zf));
    }
    e.sort((a,b)=>a-b);const med=e.length?e[(e.length/2)|0]:Infinity,
      terreno=(R._v3?.papel||'terreno')==='terreno';
    cand.push({R,med,n:e.length,terreno});
  }
  cand.sort((a,b)=>(b.terreno-a.terreno)||(a.med-b.med)||(b.n-a.n));
  return cand[0]&&cand[0].n>=3?cand[0].R:null;
}
function baciaRefinaRaizSuperficies(dif,p,passo){
  const f0=dif(p[0],p[1]);if(!Number.isFinite(f0))return p.slice();
  const h=Math.max(.05,passo*.55),fx1=dif(p[0]+h,p[1]),fx0=dif(p[0]-h,p[1]),
    fy1=dif(p[0],p[1]+h),fy0=dif(p[0],p[1]-h);
  let gx=(Number.isFinite(fx1)&&Number.isFinite(fx0))?(fx1-fx0)/(2*h):0,
    gy=(Number.isFinite(fy1)&&Number.isFinite(fy0))?(fy1-fy0)/(2*h):0,
    gn=Math.hypot(gx,gy);
  if(!(gn>1e-12))return p.slice();gx/=gn;gy/=gn;
  let A=null,B=null;
  for(let k=1;k<=5&&!A;k++){
    const d=h*k,a=[p[0]-gx*d,p[1]-gy*d],b=[p[0]+gx*d,p[1]+gy*d],
      fa=dif(a[0],a[1]),fb=dif(b[0],b[1]);
    if(Number.isFinite(fa)&&Number.isFinite(fb)&&fa*fb<=0)A={p:a,f:fa},B={p:b,f:fb};
  }
  if(!A)return p.slice();
  for(let k=0;k<34;k++){
    const m=[(A.p[0]+B.p[0])/2,(A.p[1]+B.p[1])/2],fm=dif(m[0],m[1]);
    if(!Number.isFinite(fm)){B={p:m,f:fm};continue;}
    if(A.f*fm<=0)B={p:m,f:fm};else A={p:m,f:fm};
  }
  return [(A.p[0]+B.p[0])/2,(A.p[1]+B.p[1])/2];
}
function baciaIntersecaoSuperficieCompleta(D,g){
  if(!D||D.kind!=='bacia-rampa-v1'||!g)return {ok:false,erro:'superfície ou MDT ausente'};
  const suporte=[];
  [D.fundoR,D.arestaR,D.daylightR,...(D.limites||[]),D.rampa?.corredor,D.rampa?.pista]
    .forEach(r=>(r||[]).forEach(p=>{if(p&&Number.isFinite(+p[0])&&Number.isFinite(+p[1]))suporte.push(p);}));
  if(suporte.length<3)return {ok:false,erro:'geometria insuficiente'};
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  suporte.forEach(p=>{minX=Math.min(minX,+p[0]);maxX=Math.max(maxX,+p[0]);
    minY=Math.min(minY,+p[1]);maxY=Math.max(maxY,+p[1]);});
  let cs=Math.max(.2,Math.min(g.cs||1,g.csy||g.cs||1));
  const basePad=Math.max(10,cs*12,(+D.p?.bermW||0)*3,(+D.p?.talH||0)*2),
    gx0=g.xll,gy0=g.yll,gx1=g.xll+g.nc*g.cs,gy1=g.yll+g.nr*(g.csy||g.cs),
    padX=Math.min(basePad,Math.max(0,(gx1-gx0)*.2)),padY=Math.min(basePad,Math.max(0,(gy1-gy0)*.2));
  minX=Math.max(gx0+cs*.6,minX-padX);maxX=Math.min(gx1-cs*.6,maxX+padX);
  minY=Math.max(gy0+cs*.6,minY-padY);maxY=Math.min(gy1-cs*.6,maxY+padY);
  const est=Math.max(1,(maxX-minX)/cs)*Math.max(1,(maxY-minY)/cs),lim=650000;
  if(est>lim)cs*=Math.sqrt(est/lim);
  const pad=cs*1.5,nc=Math.max(4,Math.ceil((maxX-minX+2*pad)/cs)+1),
    nr=Math.max(4,Math.ceil((maxY-minY+2*pad)/cs)+1),xll=minX-pad,yll=minY-pad,
    dom=[[minX-pad,minY-pad],[maxX+pad,minY-pad],[maxX+pad,maxY+pad],
      [minX-pad,maxY+pad],[minX-pad,minY-pad]],
    /* Remove somente a MÁSCARA antiga. A receita da superfície — fundo,
       ângulos, bermas, pista e taludes laterais — permanece idêntica. */
    DC={...D,daylightR:null,limites:[dom]},difGrid=new Float32Array(nc*nr).fill(NaN);
  /* A superfície da rampa também precisa existir ANTES de tocar o MDT.
     sLeft/sRight e corredor antigos já eram produtos de três marches
     independentes no terreno; mantê-los reproduziria o mesmo erro com outra
     aparência. Extrapola pista e taludes laterais até a borda do domínio e
     deixa o nível zero decidir onde cada um realmente termina. */
  if(D.rampa?.pFundo&&D.rampa?.dirO&&D.rampa?.perp&&D.rampa?.corredor){
    const R={...D.rampa},pf=R.pFundo.slice(),u=R.dirO.slice(),un=Math.hypot(u[0],u[1])||1;
    u[0]/=un;u[1]/=un;const v=(R.perp&&R.perp.slice())||[-u[1],u[0]],
      hw=Math.max(.1,+R.hw||(+R.largura||1)/2),corners=dom.slice(0,-1),
      sMax=Math.max(10,...corners.map(q=>(q[0]-pf[0])*u[0]+(q[1]-pf[1])*u[1])),
      wMax=Math.max(hw+5,...corners.map(q=>Math.abs((q[0]-pf[0])*v[0]+(q[1]-pf[1])*v[1]))),
      pt=(s,w)=>[pf[0]+u[0]*s+v[0]*w,pf[1]+u[1]*s+v[1]*w];
    R.dirO=u;R.perp=v;R.hw=hw;R.sLeft=R.sRight=R.sCenter=R.rampaLen=sMax;
    R.pista=[pt(0,hw),pt(sMax,hw),pt(sMax,-hw),pt(0,-hw),pt(0,hw)];
    R.corredor=[pt(0,wMax),pt(sMax,wMax),pt(sMax,-wMax),pt(0,-wMax),pt(0,wMax)];
    R.lados=null;DC.rampa=R;
  }
  const dif=(x,y)=>{const zp=tinSurfaceZ(DC,x,y),zt=sampleZbil(g,x,y);
    return Number.isFinite(zp)&&Number.isFinite(zt)?zp-zt:NaN;};
  let valid=0,neg=0,pos=0;
  for(let r=0;r<nr;r++){
    const y=yll+(nr-1-r+.5)*cs;
    for(let c=0;c<nc;c++){
      const x=xll+(c+.5)*cs,d=dif(x,y);if(!Number.isFinite(d))continue;
      difGrid[r*nc+c]=d;valid++;if(d<=0)neg++;if(d>=0)pos++;
    }
  }
  if(valid<4||!neg||!pos)return {ok:false,erro:'as superfícies não formaram uma linha fechada',valid,neg,pos};
  const brutas=contourLevel({nc,nr,cs,xll,yll,z:difGrid},0),centro=D.ctr||D.fundoR?.[0],
    fechaTol=Math.max(cs*2.2,(g.cs||1)*1.5),candidatas=[];
  for(const ln0 of brutas){
    const ln=ln0.map(p=>p.slice());if(ln.length<3)continue;
    const dFim=Math.hypot(ln[0][0]-ln.at(-1)[0],ln[0][1]-ln.at(-1)[1]);
    if(dFim>fechaTol)continue;ln[ln.length-1]=ln[0].slice();
    let ring=ln.map(p=>baciaRefinaRaizSuperficies(dif,p,cs)),limpa=[];
    for(const p of ring)if(!limpa.length||Math.hypot(p[0]-limpa.at(-1)[0],p[1]-limpa.at(-1)[1])>1e-7)limpa.push(p);
    ring=baciaFechaAnel(limpa);if(ring.length<4)continue;
    let area=0;for(let i=1;i<ring.length;i++)area+=ring[i-1][0]*ring[i][1]-ring[i][0]*ring[i-1][1];
    area=Math.abs(area/2);const contem=centro?baciaDentro(centro[0],centro[1],ring):false;
    candidatas.push({ring,area,contem});
  }
  candidatas.sort((a,b)=>(b.contem-a.contem)||(b.area-a.area));
  if(!candidatas.length)return {ok:false,erro:'a interseção tocou o limite do MDT e não fechou',componentes:brutas.length};
  const ring=candidatas[0].ring,zg=ring.map(p=>{const z=sampleZbil(g,p[0],p[1]);return Number.isFinite(z)?z:NaN;}),
    dz=ring.map((p,i)=>{const zp=tinSurfaceZ(DC,p[0],p[1]);return Number.isFinite(zp)&&Number.isFinite(zg[i])?Math.abs(zp-zg[i]):0;});
  return {ok:true,ring,zg,cell:cs,valid,componentes:brutas.length,
    maxDz:dz.length?Math.max(...dz):0,metodo:'superfície completa da bacia × MDT'};
}
/* Recorte transacional de uma linha 3D. Segmentos inteiramente válidos
   preservam os vértices originais; a densificação existe apenas para achar
   cruzamentos intermediários e não infla desnecessariamente o projeto. */
function baciaRecortaLinhaNoMdt(f,g){
  if(!f?.geom||f.geom.length<2||!Array.isArray(f.zg)||f.zg.length!==f.geom.length)
    return {partes:[f],nos:[]};
  const passo=Math.max(.2,Math.min(.65,g.cs||.5)),am=[],eps=1e-9;
  for(let i=1;i<f.geom.length;i++){
    const a=f.geom[i-1],b=f.geom[i],za=+f.zg[i-1],zb=+f.zg[i],
      n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/passo));
    if(!am.length)am.push([a[0],a[1],za]);
    for(let k=1;k<=n;k++){const t=k/n;am.push([a[0]+(b[0]-a[0])*t,
      a[1]+(b[1]-a[1])*t,za+(zb-za)*t]);}
  }
  const d=p=>{const z=sampleZbil(g,p[0],p[1]);return Number.isFinite(z)?z-p[2]:NaN;},
    dentro=p=>{const q=d(p);return Number.isFinite(q)&&q>=-eps;},vals=am.map(d),
    validos=vals.filter(Number.isFinite);
  if(!validos.length)return {partes:[f],nos:[],semMdt:true};
  if(vals.every(q=>Number.isFinite(q)&&q>=-eps))return {partes:[f],nos:[]};
  if(vals.every(q=>!Number.isFinite(q)||q<-eps))return {partes:[],nos:[]};
  const raiz=(a,b,ia)=>{let lo=a.slice(),hi=b.slice();
    for(let k=0;k<36;k++){const m=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2];
      if(dentro(m)===ia)lo=m;else hi=m;}
    return [(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2];};
  const runs=[],nos=[];let cur=dentro(am[0])?[am[0].slice()]:[];
  for(let i=1;i<am.length;i++){
    const a=am[i-1],b=am[i],da=vals[i-1],db=vals[i],ia=Number.isFinite(da)&&da>=-eps,
      ib=Number.isFinite(db)&&db>=-eps;
    if(!Number.isFinite(da)||!Number.isFinite(db)){
      if(cur.length>1)runs.push(cur);cur=[];continue;
    }
    if(ia===ib){if(ib){if(!cur.length)cur=[a.slice()];cur.push(b.slice());}continue;}
    const q=raiz(a,b,ia);nos.push(q.slice());
    if(ia){cur.push(q);if(cur.length>1)runs.push(cur);cur=[];}else cur=[q,b.slice()];
  }
  if(cur.length>1)runs.push(cur);
  const fechado=Math.hypot(f.geom[0][0]-f.geom.at(-1)[0],f.geom[0][1]-f.geom.at(-1)[1])<1e-7;
  if(fechado&&runs.length>1){const A=runs[0],B=runs.at(-1);
    if(Math.hypot(A[0][0]-B.at(-1)[0],A[0][1]-B.at(-1)[1])<=passo*1.1){
      runs[0]=B.concat(A.slice(1));runs.pop();}}
  return {nos,partes:runs.filter(q=>q.length>1).map(q=>({geom:q.map(p=>[p[0],p[1]]),
    multi:false,zg:q.map(p=>p[2]),props:{...(f.props||{})}}))};
}
function baciaInjetaNosNoLimite(ring,zg,nos,g,D,cell){
  const unicos=[];for(const p of nos||[])if(p&&p.every(Number.isFinite)&&
    !unicos.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<=1e-7))unicos.push(p);
  /* Só absorve o erro local da célula do marching. Um nó mais distante não
     pertence a esta componente e jamais deve puxar o limite por vários
     metros para fabricar uma coincidência visual. */
  const tol=Math.max(.25,(cell||g.cs||1)*2.25,(g.cs||1)*1.5),eps=1e-7;
  let maxAntes=0,fora=0;
  for(const no of unicos){let best=null;
    for(let i=1;i<ring.length;i++){
      const a=ring[i-1],b=ring[i],dx=b[0]-a[0],dy=b[1]-a[1],dd=dx*dx+dy*dy,
        t=Math.max(0,Math.min(1,dd?((no[0]-a[0])*dx+(no[1]-a[1])*dy)/dd:0)),
        q=[a[0]+dx*t,a[1]+dy*t],dist=Math.hypot(no[0]-q[0],no[1]-q[1]);
      if(!best||dist<best.dist)best={i,dist};
    }
    if(!best||best.dist>tol){fora++;continue;}maxAntes=Math.max(maxAntes,best.dist);
    const i=best.i,p=[no[0],no[1]],z=no[2];
    if(Math.hypot(ring[i-1][0]-p[0],ring[i-1][1]-p[1])<=eps){ring[i-1]=p;zg[i-1]=z;}
    else if(Math.hypot(ring[i][0]-p[0],ring[i][1]-p[1])<=eps){ring[i]=p;zg[i]=z;}
    else{ring.splice(i,0,p);zg.splice(i,0,z);}
  }
  if(ring.length){ring[ring.length-1]=ring[0].slice();zg[zg.length-1]=zg[0];}
  return {nos:unicos.length-fora,fora,maxAntes,total:unicos.length};
}
function baciaAplicaIntersecaoSuperficie(L,g,opt){
  opt=opt||{};const D=L&&L.tinSurface;if(!L||L.gtype!=='line'||!D)return {changed:false,ok:false};
  const Rmdt=g?{d:g}:baciaMdtDaSuperficie(L);g=g||(Rmdt&&Rmdt.d);
  if(!g)return {changed:false,ok:false,erro:'MDT da bacia não localizado'};
  const I=baciaIntersecaoSuperficieCompleta(D,g);if(!I.ok)return {changed:false,...I};
  const antigos=L.features||[],limAnt=antigos.find(f=>/^(?:Limite externo|Crista do corte \/ encontro com terreno)$/i
    .test(String(f.props?.TIPO||''))),base=antigos.filter(f=>f!==limAnt),out=[],nos=[];
  for(const f of base){
    const tipo=String(f.props?.TIPO||''),ehQuebra=/Fundo|Crista|Pé|Berma|Eixo da rampa|Chegada no fundo/i.test(tipo);
    if(!ehQuebra||!Array.isArray(f.zg)){out.push(f);continue;}
    const q=baciaRecortaLinhaNoMdt(f,g);out.push(...q.partes);nos.push(...q.nos);
    for(const p of q.partes)for(const ix of [0,p.geom.length-1]){
      const z=+p.zg[ix],xy=p.geom[ix],zt=sampleZbil(g,xy[0],xy[1]);
      if(Number.isFinite(z)&&Number.isFinite(zt)&&Math.abs(z-zt)<=Math.max(1e-5,(g.cs||1)*1e-6))
        nos.push([xy[0],xy[1],z]);
    }
  }
  const ring=I.ring.map(p=>p.slice()),zg=I.zg.slice(),solda=baciaInjetaNosNoLimite(ring,zg,nos,g,D,I.cell),
    props={...(limAnt?.props||{}),TIPO:limAnt?.props?.TIPO||'Limite externo',
      METODO:'superfície completa da bacia × MDT',NOS_SOLDADOS:solda.nos};
  out.push({geom:ring,multi:false,zg,props});L.features=out;L._tinClipRings=[ring.map(p=>p.slice())];
  D.daylightR=ring.map(p=>p.slice());D.limites=[ring.map(p=>p.slice())];D.rasterId=D.rasterId??
    ((S.rasters||[]).find(r=>r.d===g)?.id??null);D.intersecaoVersion=2;
  D.intersecaoMetodo='superfície completa da bacia × MDT';D.intersecaoNos=solda.nos;
  if(D.rampa){D.rampa.limiteUnico=ring.map(p=>p.slice());D.rampa.interseccao=ring.map(p=>p.slice());}
  L._baciaIntersecao={version:2,metodo:D.intersecaoMetodo,nos:solda.nos,fora:solda.fora,
    maxAntes:solda.maxAntes,maxDz:I.maxDz,cell:I.cell};
  if(typeof BACIA!=='undefined'&&BACIA.ultima&&(BACIA.ultima.Lv===L||BACIA.ultima.Lfinal===L)){
    BACIA.ultima.daylightR=ring.map(p=>p.slice());
    if(BACIA.ultima.rampaInfo){BACIA.ultima.rampaInfo.limiteUnico=ring.map(p=>p.slice());
      BACIA.ultima.rampaInfo.interseccao=ring.map(p=>p.slice());}
  }
  if(opt.soldar!==false)try{baciaSoldaQuebras3D(L);}catch(e){}
  return {changed:true,ok:true,ring,nos:solda.nos,fora:solda.fora,maxAntes:solda.maxAntes,
    maxDz:I.maxDz,cell:I.cell,features:out.length};
}
/* Triangulação por corte de orelhas para os pedaços pequenos que sobram do
   recorte pelo corredor da rampa. Anel aberto [x,y]; devolve trincas de
   índices locais. */
function baciaEarClip(ring){
  const pts=ring, tris=[], idx=pts.map((_,i)=>i);
  const area2=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  let A=0; for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];A+=a[0]*b[1]-b[0]*a[1];}
  const sgn=A>=0?1:-1;
  let guard=idx.length*idx.length+16;
  while(idx.length>3&&guard-->0){
    let cortou=false;
    for(let k=0;k<idx.length;k++){
      const i0=idx[(k-1+idx.length)%idx.length],i1=idx[k],i2=idx[(k+1)%idx.length];
      const a=pts[i0],b=pts[i1],c=pts[i2];
      if(sgn*area2(a,b,c)<=1e-12)continue;
      let dentro=false;
      for(const mm of idx){ if(mm===i0||mm===i1||mm===i2)continue; const q=pts[mm];
        if(sgn*area2(a,b,q)>=-1e-12&&sgn*area2(b,c,q)>=-1e-12&&sgn*area2(c,a,q)>=-1e-12){dentro=true;break;} }
      if(dentro)continue;
      tris.push([i0,i1,i2]); idx.splice(k,1); cortou=true; break;
    }
    if(!cortou)break;
  }
  if(idx.length===3)tris.push([idx[0],idx[1],idx[2]]);
  return tris;
}
/* MALHA EXATA DA CAIXA — a superfície de projeto triangulada A PARTIR DAS
   PRÓPRIAS LINHAS: fundo, pés, cristas, bermas e interseção entram como
   ARESTAS de triângulo, vértice por vértice (mesmo XYZ). Nada de grade, nada
   de chanfro: entre duas superfícies a linha de interseção é o conjunto de
   pontos comuns, e é assim que ela é construída aqui.
   - colunas: a aresta é densificada EXATAMENTE como em baciaDaylight, e cada
     coluna liga fundo → bermas → aresta → bermas externas → interseção;
   - cotas por quebra de projeto (zF+h / zA+h), idênticas às das linhas;
   - com rampa: pista e taludes viram tiras regradas (mesma diagonal da curva
     de nível de baciaContornoTaludeCota) e a caixa é recortada no corredor,
     com os vértices novos pousados na superfície via baciaCotaEng — a mesma
     função que gerou a crista do talude (encontro).                        */
async function baciaMalhaExata(D,g){
  const p=Object.assign({},D.p,{g}), ctr=(D.ctr||[0,0]).slice();
  const zA=+D.zAresta, zF=+D.zFundo;
  const fecha=r=>{const q=(r||[]).map(c=>[c[0],c[1]]);
    if(q.length&&Math.hypot(q[0][0]-q[q.length-1][0],q[0][1]-q[q.length-1][1])>1e-8)q.push(q[0].slice());
    return q;};
  const arestaR=fecha(D.arestaR), fundoR=fecha(D.fundoR);
  if(arestaR.length<4||fundoR.length<4||!isFinite(zA)||!isFinite(zF))return null;
  const tanI=Math.tan(p.angInt*Math.PI/180), tanC=Math.tan(p.angCorte*Math.PI/180);
  const dTot=baciaTaludeDistParaH(p.P,tanI,p);
  const R=D.rampa, temRampa=!!(R&&Array.isArray(R.corredor)&&R.corredor.length>2);
  if(temRampa) await ensurePolyClip();
  const corredor=temRampa?fecha(R.corredor):null;
  const limite=fecha((D.limites&&D.limites[0])||D.daylightR||arestaR);

  const pos=[],idx=[];
  const V=(x,y,z)=>{pos.push(x,y,z);return (pos.length/3)-1;};
  const T=(a,b,c)=>{ if(a!==b&&b!==c&&a!==c) idx.push(a,b,c); };

  // ---------- colunas: densificação idêntica à de baciaDaylight ----------
  const cell=Math.max(0.5,g.cs||1);
  /* A linha de interseção já foi calculada pela superfície completa da obra.
     Recalculá-la aqui pelo antigo lançamento radial fazia o 3D usar OUTRO
     contorno: em planta parecia soldado, mas a malha terminava vários metros
     antes/depois das cristas e pés. A malha e o terreno passam a consumir o
     mesmo anel XYZ persistido em tinSurface. */
  const dayRing=fecha((D.daylightR&&D.daylightR.length>2)?D.daylightR:
    ((D.limites&&D.limites[0]&&D.limites[0].length>2)?D.limites[0]:
      baciaDaylight(arestaR,ctr,g,arestaR.map(()=>zA),p)));
  const dens=[]; const m=arestaR.length-1;
  for(let i=0;i<m;i++){
    const A=arestaR[i],B=arestaR[i+1];
    const L=Math.hypot(B[0]-A[0],B[1]-A[1]);
    const nSub=Math.max(2,Math.ceil(L/cell));
    for(let s=0;s<nSub;s++){const t=s/nSub;dens.push([A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t]);}
  }
  const nCol=dens.length;
  const zDayEm=c=>{
    if(baciaDistRing(c[0],c[1],arestaR)<=1e-6)return zA;
    const z2=sampleZbil(g,c[0],c[1]);return isFinite(z2)?z2:zA;};

  // ---------- FUNDO: leque plano em zF ----------
  {
    let cx=0,cy=0; for(let i=0;i<fundoR.length-1;i++){cx+=fundoR[i][0];cy+=fundoR[i][1];}
    cx/=(fundoR.length-1);cy/=(fundoR.length-1);
    const c0=V(cx,cy,zF);
    for(let i=0;i<fundoR.length-1;i++){
      T(c0,V(fundoR[i][0],fundoR[i][1],zF),V(fundoR[i+1][0],fundoR[i+1][1],zF));
    }
  }

  // ---------- quebras internas de projeto (iguais às linhas) ----------
  const nBInt=baciaUsaBermas(p,p.P)?Math.floor((p.P-1e-7)/p.talH):0;
  const quebInt=[{dF:0,z:zF}];                                    // pé (fundo)
  for(let k=1;k<=nBInt;k++){const h=k*p.talH,dPe=h/tanI+(k-1)*p.bermW;
    quebInt.push({dF:dPe,z:zF+h},{dF:dPe+p.bermW,z:zF+h});}
  quebInt.push({dF:dTot,z:zA});                                   // aresta (crista interna)

  const parede=[];                                                // [ia,ib,ic] p/ recorte
  const costura=(A,B)=>{
    let i=0,j=0;
    while(i<A.length-1||j<B.length-1){
      const podeA=i<A.length-1, podeB=j<B.length-1;
      const usaA=!podeB?true:(!podeA?false:(A[i+1].t<=B[j+1].t));
      if(usaA){parede.push([A[i].vi,B[j].vi,A[i+1].vi]);i++;}
      else{parede.push([A[i].vi,B[j].vi,B[j+1].vi]);j++;}
    }
  };

  // ---------- banda INTERNA (aresta → fundo): colunas densificadas ----------
  const colInt=[];
  for(let i=0;i<nCol;i++){
    const Q=dens[i];
    const F2=baciaPontoMaisProximoRing(Q,fundoR)||Q;
    let ux=F2[0]-Q[0],uy=F2[1]-Q[1]; const un=Math.hypot(ux,uy);
    if(un>1e-9){ux/=un;uy/=un;}else{ux=ctr[0]-Q[0];uy=ctr[1]-Q[1];const c2=Math.hypot(ux,uy)||1;ux/=c2;uy/=c2;}
    const pontos=[];
    quebInt.forEach(qb=>{
      const dA=dTot-qb.dF;
      const P2=(qb.dF===0)?F2:[Q[0]+ux*dA,Q[1]+uy*dA];
      pontos.push({x:P2[0],y:P2[1],z:qb.z,t:qb.dF});
    });
    pontos.sort((a,b)=>a.t-b.t);
    colInt.push(pontos.map(q=>({vi:V(q.x,q.y,q.z),t:q.t})));
  }
  for(let i=0;i<nCol;i++) costura(colInt[i],colInt[(i+1)%nCol]);

  // ---------- banda EXTERNA (aresta → interseção): UMA coluna POR VÉRTICE
  //            do daylight, com a MESMA âncora e a MESMA margem das linhas
  //            de berma (baciaCriaSimbolos): q = pé da normal do vértice
  //            do daylight na crista; pontos a dAlvo ao longo de (d−q). ----
  const nDay=dayRing.length-1;
  const zDayTodos=[];for(let i=0;i<nDay;i++)zDayTodos.push(sampleZbil(g,dayRing[i][0],dayRing[i][1]));
  const hExtGlobal=Math.max(0,Math.max(...zDayTodos.filter(Number.isFinite))-zA);
  const temBermaExt=baciaUsaBermas(p,hExtGlobal)&&p.bermOn!==false;
  const nKExt=temBermaExt?Math.floor((hExtGlobal-1e-7)/p.talH):0;
  const colExt=[];
  for(let i=0;i<nDay;i++){
    const d2=dayRing[i];
    const q=baciaPontoMaisProximoRing(d2,arestaR);
    const zt=zDayTodos[i];
    const Lc=q?Math.hypot(d2[0]-q[0],d2[1]-q[1]):0;
    const pontos=[];
    if(q&&Lc>1e-9&&isFinite(zt)){
      const ux=(d2[0]-q[0])/Lc,uy=(d2[1]-q[1])/Lc;
      pontos.push({x:q[0],y:q[1],z:zA,t:0});
      for(let k=1;k<=nKExt;k++){
        const h=k*p.talH;
        for(const bw of [0,p.bermW]){
          const dAlvo=h/tanC+(k-1)*p.bermW+bw;
          const margem=Math.min(zt-zA-h,Lc-dAlvo);
          if(margem>=-1e-6)pontos.push({x:q[0]+ux*dAlvo,y:q[1]+uy*dAlvo,z:zA+h,t:dAlvo});
        }
      }
      pontos.push({x:d2[0],y:d2[1],z:zDayEm(d2),t:Lc});
    }else{
      const b=q||d2;
      pontos.push({x:b[0],y:b[1],z:zA,t:0},{x:d2[0],y:d2[1],z:zDayEm(d2),t:1e-6});
    }
    colExt.push(pontos.map(pp=>({vi:V(pp.x,pp.y,pp.z),t:pp.t})));
  }
  for(let i=0;i<nDay;i++) costura(colExt[i],colExt[(i+1)%nDay]);

  // ---------- recorte pelo corredor da rampa + superfícies da rampa ----------
  if(!temRampa){ parede.forEach(t3=>T(t3[0],t3[1],t3[2])); }
  else{
    const dentroCor=(x,y)=>baciaDentro(x,y,corredor);
    const zSup=(x,y)=>{const zt=sampleZbil(g,x,y);
      const zc=baciaCotaEng(x,y,ctr,p,fundoR,arestaR,dayRing,zF,zA,Number.isFinite(zt)?zt:Infinity);
      return (zc!=null&&isFinite(zc))?zc:(isFinite(zt)?zt:zF);};
    parede.forEach(t3=>{
      const P3=t3.map(vi=>[pos[3*vi],pos[3*vi+1]]);
      const ins=P3.map(q=>dentroCor(q[0],q[1]));
      const cen=[(P3[0][0]+P3[1][0]+P3[2][0])/3,(P3[0][1]+P3[1][1]+P3[2][1])/3];
      if(!ins[0]&&!ins[1]&&!ins[2]&&!dentroCor(cen[0],cen[1])){T(t3[0],t3[1],t3[2]);return;}
      if(ins[0]&&ins[1]&&ins[2])return;                            // todo dentro: sai
      let rec=null;
      try{rec=polygonClipping.difference([[P3.concat([P3[0]])]],[[corredor]]);}catch(e){rec=null;}
      if(!rec){T(t3[0],t3[1],t3[2]);return;}
      mpToFeatures(rec).forEach(f=>{
        const rings=(f.multi&&Array.isArray(f.geom[0]&&f.geom[0][0]))?f.geom:[f.geom];
        rings.forEach(ring=>{
          const ab=ring.slice(); if(ab.length>1&&Math.hypot(ab[0][0]-ab[ab.length-1][0],ab[0][1]-ab[ab.length-1][1])<1e-9)ab.pop();
          if(ab.length<3)return;
          const vis=ab.map(q=>{
            for(let k2=0;k2<3;k2++){ if(Math.hypot(q[0]-P3[k2][0],q[1]-P3[k2][1])<1e-9)return t3[k2]; }
            return V(q[0],q[1],zSup(q[0],q[1]));                   // novo nó: pousa na superfície da caixa
          });
          baciaEarClip(ab).forEach(tt=>T(vis[tt[0]],vis[tt[1]],vis[tt[2]]));
        });
      });
    });
    // ---- pista e taludes: mesmas funções e mesma diagonal das linhas ----
    const dirO=R.dirO.slice(),hw=(+R.hw)||((+R.largura||0)/2),decl=+R.ir||((+R.P||1)/Math.max(1e-6,+R.rampaLen||1));
    const perp=(R.perp&&R.perp.slice())||[-dirO[1],dirO[0]];
    const pF=R.pFundo.slice(), sE=+R.sLeft||+R.rampaLen, sD=+R.sRight||+R.rampaLen;
    const tolSolda=Math.max(.05,Math.min(2,(g.cs||1)*.75));
    const peE=[pF[0]+perp[0]*hw,pF[1]+perp[1]*hw], peD=[pF[0]-perp[0]*hw,pF[1]-perp[1]*hw];
    const talE=baciaRampaTaludeLateral(g,p,ctr,fundoR,arestaR,dayRing,zF,zA,pF,dirO,perp,+1,hw,decl,sE);
    const talD=baciaRampaTaludeLateral(g,p,ctr,fundoR,arestaR,dayRing,zF,zA,pF,dirO,perp,-1,hw,decl,sD);
    [[talE,peE],[talD,peD]].forEach(([tal,pe0])=>{
      tal.pe[0]=pe0.slice(); tal.zp[0]=zF;
      tal.encontro[0]=pe0.slice(); tal.ze[0]=zF;                   // crista nasce no pé (como a linha)
      [[tal.pe,tal.zp],[tal.encontro,tal.ze]].forEach(([geo,zz])=>{
        const j=geo.length-1,b=baciaProjLinha(geo[j],limite);
        if(b&&b.d<=tolSolda){geo[j]=[b.p[0],b.p[1]];
          const zl=sampleZbil(g,b.p[0],b.p[1]); if(Number.isFinite(zl))zz[j]=zl;}
      });
      const n2=Math.min(tal.pe.length,tal.encontro.length)-1;
      /* Recorta cada triângulo do talude AO corredor: quadriláteros torcidos
         (encontro escalando a parede) varrem fora da faixa e passariam por
         baixo das linhas da caixa. Vértices novos interpolam z NO PLANO do
         próprio triângulo (a superfície do talude não muda dentro da faixa). */
      const triTal=(A3,B3,C3)=>{
        const dentro=[A3,B3,C3].map(v=>baciaDentro(v[0],v[1],corredor));
        if(dentro[0]&&dentro[1]&&dentro[2]){T(V(...A3),V(...B3),V(...C3));return;}
        const den=(B3[1]-C3[1])*(A3[0]-C3[0])+(C3[0]-B3[0])*(A3[1]-C3[1]);
        const zNo=(x,y)=>{
          if(Math.abs(den)<1e-12)return (A3[2]+B3[2]+C3[2])/3;
          const w1=((B3[1]-C3[1])*(x-C3[0])+(C3[0]-B3[0])*(y-C3[1]))/den,
                w2=((C3[1]-A3[1])*(x-C3[0])+(A3[0]-C3[0])*(y-C3[1]))/den;
          return w1*A3[2]+w2*B3[2]+(1-w1-w2)*C3[2];};
        let rec=null;
        try{rec=polygonClipping.intersection([[[A3,B3,C3,A3].map(v=>[v[0],v[1]])]],[[corredor]]);}
        catch(e){rec=null;}
        if(!rec){T(V(...A3),V(...B3),V(...C3));return;}
        mpToFeatures(rec).forEach(f=>{
          const rings=(f.multi&&Array.isArray(f.geom[0]&&f.geom[0][0]))?f.geom:[f.geom];
          rings.forEach(ring=>{
            const ab=ring.slice();
            if(ab.length>1&&Math.hypot(ab[0][0]-ab[ab.length-1][0],ab[0][1]-ab[ab.length-1][1])<1e-9)ab.pop();
            if(ab.length<3)return;
            const vis=ab.map(q2=>V(q2[0],q2[1],zNo(q2[0],q2[1])));
            baciaEarClip(ab).forEach(tt=>T(vis[tt[0]],vis[tt[1]],vis[tt[2]]));
          });
        });
      };
      for(let i2=0;i2<n2;i2++){                                    // diagonal (a,b,c)+(a,c,d)
        const a=[tal.pe[i2][0],tal.pe[i2][1],tal.zp[i2]],
              b=[tal.pe[i2+1][0],tal.pe[i2+1][1],tal.zp[i2+1]],
              c=[tal.encontro[i2+1][0],tal.encontro[i2+1][1],tal.ze[i2+1]],
              d3=[tal.encontro[i2][0],tal.encontro[i2][1],tal.ze[i2]];
        triTal(a,b,c);triTal(a,c,d3);
      }
    });
    const colE=talE.pe.map((q,i2)=>({vi:V(q[0],q[1],talE.zp[i2]),t:i2/(talE.pe.length-1)}));
    const colD=talD.pe.map((q,i2)=>({vi:V(q[0],q[1],talD.zp[i2]),t:i2/(talD.pe.length-1)}));
    let i2=0,j2=0;
    while(i2<colE.length-1||j2<colD.length-1){
      const pa=i2<colE.length-1,pb=j2<colD.length-1;
      const ua=!pb?true:(!pa?false:(colE[i2+1].t<=colD[j2+1].t));
      if(ua){T(colE[i2].vi,colD[j2].vi,colE[i2+1].vi);i2++;}
      else{T(colE[i2].vi,colD[j2].vi,colD[j2+1].vi);j2++;}
    }
  }
  if(!idx.length)return null;
  return {positions:new Float64Array(pos),indices:idx};
}
/* CORTE DA CAIXA NO 3D: liga o furo do terreno na linha de interseção.
   O MDT que gerou a caixa passa a apontar (limId) para a camada da caixa;
   no 3D, papel 'terreno' FURA a malha exatamente nesse anel e a superfície
   de projeto — contida no MESMO anel — encaixa na abertura, com as duas
   bordas soldadas na cota do terreno. Não altera papel, aparência 2D nem
   camadas que já não sejam terreno. */
function baciaLigaFuroTerreno(g,L){
  if(!g||!L)return null;
  const r=(S.rasters||[]).find(x=>x&&x.d===g)||
          (S.rasters||[]).find(x=>x&&x.d&&x.d.z===g.z);
  if(!r)return null;
  r._v3=r._v3||{papel:'terreno',cor:'#b5651d',limId:''};
  if(r._v3.papel!=='terreno')return null;      // só fura terreno; projeto/cava ficam como estão
  if(String(r._v3.limId||'')!==String(L.id)){
    r._v3.limId=L.id;
    try{cmdLog('3D: o terreno "'+r.name+'" será cortado na linha de interseção da caixa ("'+L.name+'")','info');}catch(e){}
  }
  try{if(typeof refresh3DPanel==='function'&&document.getElementById('v3dRas'))refresh3DPanel();}catch(e){}
  try{if(typeof v3Auto==='function')v3Auto();}catch(e){}
  return r;
}
/* gera a bacia a partir da BOCA (anel fechado no CRS de trabalho, no terreno):
   - talude INTERNO (angInt) desce da boca ao fundo → offset p/ dentro = P/tan(angInt)
   - talude de CORTE (angCorte) sobe da boca ao terreno → offset p/ fora, com a
     interseção real na superfície (linha de borda/daylight)
   - rampa de acesso desce de uma borda até o fundo
   Gera as feições 3D (fundo, boca, borda/daylight, rampa) com cotas.          */
function baciaGeraBoca(bocaR, p, ctr){
  const g=p.g, crs=S.workCRS;
  // garante anel fechado
  if(Math.hypot(bocaR[0][0]-bocaR[bocaR.length-1][0], bocaR[0][1]-bocaR[bocaR.length-1][1])>1e-6)
    bocaR=bocaR.concat([bocaR[0].slice()]);
  // centro (se não veio): média dos vértices
  if(!ctr){ let sx=0,sy=0,n=bocaR.length-1; for(let i=0;i<n;i++){sx+=bocaR[i][0];sy+=bocaR[i][1];} ctr=[sx/n,sy/n]; }
  // O retângulo informado é a ARESTA SUPERIOR da caixa (topo dos taludes internos),
  // numa COTA ÚNICA. A caixa é geometria perfeita; a "boca" é o rebatimento dessa
  // aresta no terreno (linha de daylight do talude de corte).
  const zArestaAmostra = bocaR.map(c=>sampleZbil(g,c[0],c[1]));
  const zValid = zArestaAmostra.filter(v=>isFinite(v));
  if(!zValid.length){ toast('A caixa caiu fora do MDT — reposicione'); return; }
  // aresta na cota do ponto MAIS BAIXO do terreno sob a aresta. Assim o fundo
  // (zAresta − P) fica sempre abaixo do terreno em todo o perímetro → é SEMPRE
  // CORTE. Onde o terreno é mais alto que a aresta, o talude de corte sobe até
  // encontrá-lo (boca/daylight se afasta); em terreno plano, boca = aresta.
  const zAresta = Math.min(...zValid);
  const zFundo = zAresta - p.P;
  const arestaR = bocaR;                                    // o retângulo é a aresta superior

  // ---- FUNDO: offset p/ DENTRO da aresta pelo talude interno ----
  const offInt = baciaTaludeDistParaH(p.P,Math.tan(p.angInt*Math.PI/180),p);
  let fundoR = bufferPoligono(arestaR, -offInt, false, 8) || arestaR.slice();
  const aFundo = baciaArea(fundoR);
  const featFundo={geom:fundoR, multi:false, zg:fundoR.map(()=>zFundo),
    props:{TIPO:'Fundo / pé do talude interno', COTA_FUNDO:+zFundo.toFixed(2), AREA_M2:+aFundo.toFixed(1)}};

  // ---- ARESTA SUPERIOR: o retângulo perfeito, todo na cota zAresta ----
  const featAresta={geom:arestaR, multi:false, zg:arestaR.map(()=>zAresta),
    props:{TIPO:'Crista interna / pé do corte', COTA_MIN:+zAresta.toFixed(2), PROF_M:+p.P.toFixed(2), AREA_M2:+baciaArea(arestaR).toFixed(1)}};

  // ---- BOCA / DAYLIGHT: talude de corte sobe da aresta (zAresta) até o terreno ----
  // para cada vértice da aresta, marcha para fora; a cota do corte sobe com tan(angCorte)
  // a partir de zAresta; o daylight é onde essa cota alcança o terreno.
  const zgAresta = arestaR.map(()=>zAresta);
  let daylight = baciaDaylight(arestaR, ctr, g, zgAresta, p);

  const feats=[featFundo, featAresta];
  if(daylight && daylight.length>=3){
    feats.push({geom:daylight, multi:false, zg:daylight.map(c=>{
      /* onde a interseção ENCOSTA na aresta (terreno ≤ cota da aresta), a
         linha PASSA PELA CRISTA: cota exata zAresta, e não a reamostra do
         MDT — é isso que solda interseção e crista no mesmo nó em 3D */
      if(baciaDistRing(c[0],c[1],arestaR)<=1e-6) return zAresta;
      const z=sampleZbil(g,c[0],c[1]);return isFinite(z)?z:zAresta;}),
      props:{TIPO:'Crista do corte / encontro com terreno', AREA_M2:+baciaArea(daylight).toFixed(1)}});
  }

  // ---- RAMPA de acesso: NÃO gera aqui. Após a caixa, o usuário toca o ponto
  //      onde a rampa deve chegar no fundo (baciaArmaRampa). ----
  const nBacia=1+(S.layers||[]).filter(l=>/^Bacia de retenção(?:\s+\d+)?(?:\s+—\s+linhas)?$/i.test(l.name||'')).length;
  const Lv=addLayer({name:'Bacia de retenção '+String(nBacia).padStart(2,'0')+' — linhas', gtype:'line', crs, features:feats,
    fields:[{name:'TIPO',type:'C',length:50,decimal:0},{name:'COTA_MIN',type:'N',length:10,decimal:2},
            {name:'COTA_FUNDO',type:'N',length:10,decimal:2},{name:'PROF_M',type:'N',length:8,decimal:2},
            {name:'AREA_M2',type:'N',length:14,decimal:1},{name:'DECL_PCT',type:'N',length:8,decimal:1},
            {name:'LARG_M',type:'N',length:8,decimal:1},{name:'COMP_M',type:'N',length:10,decimal:1},
            {name:'COTA_TOPO',type:'N',length:10,decimal:2}],
    color:'#c25b1a'});
  const ext=baciaDimensionaExtravasor(p.extravasor,zAresta,zFundo);
  p.extravasor=ext;
  if(Lv){
    Lv.fill=0;if(Lv.sym){Lv.sym.fill=0;Lv.sym.weight=Math.max(2,+Lv.sym.weight||2);}
    /* A descrição analítica nasce junto com a caixa, antes mesmo de rampa e
       raster. Assim o Memorial da Caixa consegue listar e documentar todas
       as caixas do projeto, não apenas a última que recebeu uma rampa. */
    Lv.tinSurface={
      kind:'bacia-rampa-v1',cs:g.cs||1,ctr:ctr.slice(),
      p:{P:p.P,angInt:p.angInt,angCorte:p.angCorte,bermOn:!!p.bermOn,
        talH:p.talH,bermW:p.bermW,bermMinH:p.bermMinH,talSym:false,
        C:p.C,L:p.L,ang:p.ang,extravasor:ext},
      fundoR:fundoR.map(q=>q.slice()),arestaR:arestaR.map(q=>q.slice()),
      daylightR:((daylight&&daylight.length>=3)?daylight:arestaR).map(q=>q.slice()),
      zFundo,zAresta,
      limites:[((daylight&&daylight.length>=3)?daylight:arestaR).map(q=>q.slice())],
      rampa:null,extravasor:ext
    };
    /* Substitui o envelope radial pela interseção da superfície completa,
       antes de gerar bermas/símbolos. Todas as linhas seguintes já nascem
       recortadas no mesmo anel que comandará o 3D. */
    const interSup=baciaAplicaIntersecaoSuperficie(Lv,g,{soldar:false});
    if(interSup.ok)daylight=interSup.ring.map(q=>q.slice());
    else cmdLog('Bacia: não foi possível fechar a interseção por superfície ('+
      (interSup.erro||'sem contato')+'); mantido o contorno radial de segurança','avisa');
    try{ drawLayer(Lv); }catch(e){}
  }
  /* Mantém as linhas de engenharia (pés, cristas e bordas de berma), mas
     força talSym=false para retirar SOMENTE os pequenos traços decorativos
     conhecidos como cílios/dentes de talude. */
  /* Pés, cristas e bermas entram na MESMA camada da caixa. A rotina legada
     ainda é reaproveitada para calcular as linhas, mas a camada auxiliar é
     absorvida e removida imediatamente. */
  let Lsim=null;
  try{ Lsim=baciaCriaSimbolos(Object.assign({},p,{talSym:false}),arestaR,fundoR,
    (daylight&&daylight.length>=3)?daylight:arestaR,zAresta,zFundo,null); }catch(e){}
  if(Lv&&Lsim){
    (Lsim.features||[]).forEach(f=>Lv.features.push({geom:(f.geom||[]).map(q=>q.slice()),multi:false,
      zg:(f.zg||[]).slice(),props:{...(f.props||{}),ORIGEM:'Caixa'}}));
    try{if(Lsim.llayer)map.removeLayer(Lsim.llayer);}catch(e){}
    const ix=S.layers.indexOf(Lsim);if(ix>=0)S.layers.splice(ix,1);
    Lsim=null;try{drawLayer(Lv);}catch(e){}
  }
  /* As bermas são calculadas depois da superfície principal; passa a camada
     completa uma segunda vez pelo mesmo recorte para que também os extremos
     dessas novas breaklines virem nós do anel de interseção. */
  if(Lv){
    const finalSup=baciaAplicaIntersecaoSuperficie(Lv,g);
    if(finalSup.ok)daylight=finalSup.ring.map(q=>q.slice());
    try{drawLayer(Lv);}catch(e){}
  }
  const out=document.getElementById('bcOut');
  if(out) out.innerHTML='<b>Bacia criada</b><br>'+
    'Aresta sup. '+baciaArea(arestaR).toFixed(0)+' m² · fundo '+aFundo.toFixed(0)+' m² (cota '+zFundo.toFixed(2)+' m, prof '+p.P+' m abaixo da menor cota)<br>'+
    'Talude interno '+p.angInt+'° (aresta→fundo) · corte '+p.angCorte+'° (aresta→terreno)'+
    (baciaUsaBermas(p,p.P)? ' · bermas a cada '+p.talH+' m, largura '+p.bermW+' m':'')+
    (daylight&&daylight.length>=3? ' · boca/daylight '+baciaArea(daylight).toFixed(0)+' m²':' · boca = aresta (terreno plano)')+
    (ext&&ext.ok?'<br><b>Extravasor:</b> '+esc(ext.descricao)+' · Q '+ext.Q.toFixed(3)+' m³/s · H '+ext.H.toFixed(2)+' m':'')+
    '<br><span style="color:var(--ink-dim)">Uma única camada linear 3D: anéis fechados e linhas abertas com cotas.</span>';
  toast('Bacia de retenção criada');
  refreshUI();
  // guarda a geometria desta bacia para gerar o MDT cortado depois
  BACIA.ultima={
    Lv, g, ctr, p,
    fundoR: fundoR.concat([fundoR[0]]),
    arestaR: arestaR.slice(),                    // já fechado
    daylightR: (daylight&&daylight.length>=3)? daylight.slice() : arestaR.slice(),
    zFundo, zAresta, rampaInfo:null, Lsim:null,
    _baseDaylightR:((daylight&&daylight.length>=3)?daylight:arestaR).map(q=>q.slice()),
    _baseState:baciaCapturaEstadoBase(Lv)
  };
  baciaAtualizaBotaoMDT();
  // CORTE NO 3D: o terreno passa a ser furado na linha de interseção desta
  // caixa (a superfície de projeto/TIN, contida no mesmo anel, encaixa nele).
  try{ baciaLigaFuroTerreno(g,Lv); }catch(e){}
  // A rampa NÃO é armada automaticamente: o usuário decide onde ela entra
  // olhando a caixa já desenhada, pelo botão "Indicar chegada da rampa".
  if(!(p.rampaOn && p.rampaW>0 && p.rampaI>0)){
    try{ baciaEncadeiaExtravasor(); }catch(e){}   // sem rampa, o extravasor é o passo imediato
  }
  if(p.rampaOn && p.rampaW>0 && p.rampaI>0)
    cmdLog('Caixa pronta — use "⛰ Indicar chegada da rampa" para posicionar a rampa','info');
}
function baciaClonaDados(v){
  if(v==null)return v;
  try{return JSON.parse(JSON.stringify(v));}catch(e){return v;}
}
/* Estado transacional da caixa sem rampa. Relocar e limpar restauram
   exatamente esta geometria, em vez de tentar desfazer a união por filtros. */
function baciaCapturaEstadoBase(L){
  if(!L)return null;
  return {
    name:L.name,gtype:L.gtype,features:baciaClonaDados(L.features||[]),
    fields:baciaClonaDados(L.fields||[]),color:L.color,weight:L.weight,fill:L.fill,
    sym:baciaClonaDados(L.sym||null),tinSurface:baciaClonaDados(L.tinSurface||null),
    clip:baciaClonaDados(L._tinClipRings||null)
  };
}
function baciaAplicaEstadoCamada(U,B){
  if(!U||!U.Lv||!B)return false;
  const L=U.Lv;
  L.name=B.name;L.gtype=B.gtype;L.features=baciaClonaDados(B.features||[]);
  L.fields=baciaClonaDados(B.fields||[]);L.color=B.color;L.weight=B.weight;L.fill=B.fill;
  if(B.sym)L.sym=baciaClonaDados(B.sym);
  if(B.tinSurface)L.tinSurface=baciaClonaDados(B.tinSurface);else delete L.tinSurface;
  if(B.clip)L._tinClipRings=baciaClonaDados(B.clip);else delete L._tinClipRings;
  delete L._baciaIntersecao;delete L._baciaTopoVersion;
  L.visible=true;
  try{drawLayer(L);}catch(e){}
  try{baciaLigaFuroTerreno(U.g,L);}catch(e){}
  S.activeId=L.id;refreshUI();return true;
}
function baciaRestauraCaixaSemRampa(U){
  if(!U||!U._baseState||!baciaAplicaEstadoCamada(U,U._baseState))return false;
  U.Lrampa=null;U.Lfinal=null;U.rampaInfo=null;U.extravasorInfo=null;
  U.daylightR=(U._baseDaylightR||U.arestaR||[]).map(q=>q.slice());
  return true;
}
function baciaRollbackRelocacao(){
  const U=BACIA.ultima,K=U&&U._relocarRollback;if(!U||!K)return false;
  baciaAplicaEstadoCamada(U,K.state);
  U.rampaInfo=baciaClonaDados(K.rampaInfo);U.daylightR=baciaClonaDados(K.daylightR);
  U.extravasorInfo=baciaClonaDados(K.extravasorInfo);
  U.Lrampa=U.rampaInfo?U.Lv:null;U.Lfinal=U.rampaInfo?U.Lv:null;
  delete U._relocarRollback;baciaAtualizaBotaoMDT();return true;
}
function baciaRollbackGeracaoRampa(){
  const U=BACIA.ultima,K=U&&U._rampaTransaction;if(!U||!K)return false;
  baciaAplicaEstadoCamada(U,K.state);
  U.rampaInfo=baciaClonaDados(K.rampaInfo);U.daylightR=baciaClonaDados(K.daylightR);
  U.extravasorInfo=baciaClonaDados(K.extravasorInfo);
  U.Lrampa=U.rampaInfo?U.Lv:null;U.Lfinal=U.rampaInfo?U.Lv:null;
  delete U._rampaTransaction;baciaAtualizaBotaoMDT();return true;
}
/* mostra/habilita o botão de gerar MDT cortado quando há uma bacia pronta */
/* A CAIXA DE TRABALHO É A DA CAMADA SELECIONADA.
   Antes, rampa, extravasor, MDT cortado e detalhamento só funcionavam com
   BACIA.ultima — o estado em memória da última caixa gerada NESTA sessão.
   Ao abrir um projeto, ou ao alternar entre várias caixas, os botões diziam
   "Crie uma bacia antes…". A camada da caixa guarda toda a descrição
   analítica em L.tinSurface (kind 'bacia-rampa-v1'), então basta reconstruir
   o estado de trabalho a partir dela. */
function baciaCamadaSelecionada(){
  const ehCaixa=L=>!!(L&&L.tinSurface&&L.tinSurface.kind==='bacia-rampa-v1');
  const cands=[S.selFeat&&S.selFeat.layer,
    (S.layers||[]).find(l=>String(l.id)===String(S.activeId))];
  for(const L of cands)if(ehCaixa(L))return L;
  return null;
}
/* Reconstrói BACIA.ultima a partir da camada escolhida. Devolve o estado de
   trabalho (U) ou null quando não há caixa selecionada nem em memória. */
function baciaAdotaSelecionada(){
  const L=baciaCamadaSelecionada();
  if(!L)return BACIA.ultima||null;
  if(BACIA.ultima&&BACIA.ultima.Lv===L)return BACIA.ultima;
  /* Caixa adotada de um projeto sem raster: a grade do MDT não existe. A
     rampa só a usa como teto do talude, então entra a grade vazia e o projeto
     segue apoiado na geometria da própria caixa. */
  const D=L.tinSurface,g=baciaGrade()||baciaGradeVazia();
  const anel=r=>Array.isArray(r)?r.map(q=>q.slice()):null;
  const fundoR=anel(D.fundoR),arestaR=anel(D.arestaR);
  if(!fundoR||fundoR.length<3||!arestaR||arestaR.length<3){
    toast('A camada selecionada não guarda a geometria da caixa');
    return BACIA.ultima||null;
  }
  const daylightR=anel(D.daylightR)||arestaR.map(q=>q.slice());
  const rampaInfo=baciaClonaDados(D.rampa||null);
  const extInfo=baciaClonaDados(D.extravasor||(D.p&&D.p.extravasor)||null);
  /* O estado-base é a caixa SEM rampa: é ele que "Relocar" e "Limpar rampa"
     restauram. Numa caixa que já chega com rampa, ele é reconstruído tirando
     as feições da rampa e devolvendo o contorno anterior à fusão. */
  const semRampa=(L.features||[]).filter(f=>{
    const t=String((f.props||{}).TIPO||'');
    return !/^Rampa\b/i.test(t)&&!/^Contorno fundido$/i.test(t);
  });
  const base={name:L.name,gtype:L.gtype,features:baciaClonaDados(semRampa),
    fields:baciaClonaDados(L.fields||[]),color:L.color,weight:L.weight,fill:L.fill,
    sym:baciaClonaDados(L.sym||null),
    tinSurface:baciaClonaDados(Object.assign({},D,{rampa:null})),
    clip:baciaClonaDados(L._tinClipRings||null)};
  const U={
    Lv:L,g,ctr:Array.isArray(D.ctr)?D.ctr.slice():null,
    p:Object.assign({},D.p||{},{g}),
    fundoR,arestaR,daylightR,
    zFundo:D.zFundo,zAresta:D.zAresta,
    rampaInfo,extravasorInfo:extInfo,
    Lrampa:rampaInfo?L:null,Lfinal:rampaInfo?L:null,Lsim:null,
    volumeEscavacao:D.volumeEscavacao,
    _baseState:base,
    _baseDaylightR:(rampaInfo&&anel(D.daylightRSemRampa))||daylightR.map(q=>q.slice())
  };
  if(!U.ctr){ // centro de segurança: centroide da aresta
    let sx=0,sy=0;arestaR.forEach(q=>{sx+=q[0];sy+=q[1];});
    U.ctr=[sx/arestaR.length,sy/arestaR.length];
  }
  BACIA.ultima=U;
  try{cmdLog('Caixa adotada da camada selecionada: '+(L.name||''),'info');}catch(e){}
  return U;
}
function baciaAtualizaBotaoMDT(){
  /* O painel reflete a caixa da camada selecionada, e não apenas a última
     gerada na sessão. */
  try{baciaAdotaSelecionada();}catch(e){}
  const b=document.getElementById('btnBaciaMDT');
  if(b){ b.style.display = (BACIA.ultima? '' : 'none'); }
  const br=document.getElementById('btnBaciaRampa');
  // mostra "indicar rampa" só se há bacia e ela ainda não tem rampa
  if(br){ br.style.display = (BACIA.ultima && !BACIA.ultima.rampaInfo)? '' : 'none'; }
  const rr=document.getElementById('btnBaciaRelocar');
  const lr=document.getElementById('btnBaciaLimparRampa');
  if(rr)rr.style.display=(BACIA.ultima&&BACIA.ultima.rampaInfo)?'':'none';
  if(lr)lr.style.display=(BACIA.ultima&&BACIA.ultima.rampaInfo)?'':'none';
  const ex=document.getElementById('btnBaciaExtDesenhar');
  if(ex){
    let E=null;try{E=baciaDimensionaExtravasor(baciaExtravasorParametros());}catch(e){}
    /* Só fica morto quando ainda não existe caixa. Faltando um dado do
       extravasor ele continua clicável e diz o que falta — antes ficava cinza
       sem explicação e o comando parecia não existir. */
    ex.disabled=!BACIA.ultima;
    ex.title=!BACIA.ultima?'Gere ou selecione a caixa antes de posicionar o extravasor':
      (E&&E.on&&E.ok)?'Toque a aresta superior da caixa e o extravasor é desenhado':
      (E&&!E.on)?'Marque “Dimensionar saída / extravasor” acima':
      ((E&&E.erro)||'Confira vazão Q, carga H e o coeficiente');
    ex.textContent=(BACIA.ultima&&baciaExtravasorDesenhado(BACIA.ultima.Lv))?
      '✥ Relocar / redesenhar extravasor':'✎ Posicionar e desenhar extravasor';
  }
  const bd=document.getElementById('btnBaciaDetalhe');
  if(bd){ bd.style.display=(BACIA.ultima&&BACIA.ultima.Lv&&BACIA.ultima.Lv.tinSurface)?'':'none'; }
  const cx=document.getElementById('bcCaixaAtual');
  if(cx){
    const U=BACIA.ultima;
    cx.style.display=U&&U.Lv?'':'none';
    if(U&&U.Lv)cx.innerHTML='Caixa em uso: <b>'+esc(U.Lv.name||'sem nome')+'</b>'+
      (U.rampaInfo?' · com rampa':'')+(U.extravasorInfo?' · com extravasor':'')+
      '<br><span style="color:var(--ink-dim)">Selecione outra camada de caixa para trabalhar nela.</span>';
  }
}
function baciaProjetoDetalhe(){
  const Lsel=S.selFeat&&S.selFeat.layer;
  if(Lsel&&Lsel.tinSurface) return {L:Lsel,D:Lsel.tinSurface};
  const U=BACIA.ultima;
  if(U&&U.Lv&&U.Lv.tinSurface) return {L:U.Lv,D:U.Lv.tinSurface,U};
  return null;
}
function baciaMemorialEscolher(btn){
  const caixas=(S.layers||[]).filter(L=>L&&L.tinSurface&&L.tinSurface.kind==='bacia-rampa-v1');
  if(!caixas.length){
    toast('Gere uma caixa de retenção primeiro');return;
  }
  let m=document.getElementById('baciaMemorialEscolha');
  if(m)m.remove();
  m=document.createElement('div');m.id='baciaMemorialEscolha';m.className='modal-bg on';
  m.innerHTML=`<div class="modal" style="width:min(580px,96vw)">
    <div class="modal-h"><b>Memorial descritivo da caixa</b><div style="flex:1"></div>
      <button class="tbtn" data-bm="x">Fechar</button></div>
    <div class="modal-b">
      <label class="field">Caixa a documentar</label>
      <select id="bmCaixa">${caixas.map(L=>{const D=L.tinSurface,P=D.p||{};
        return `<option value="${L.id}">${esc(L.name)} · ${Number(P.C||0).toFixed(1)} × ${Number(P.L||0).toFixed(1)} m · prof. ${Number(P.P||0).toFixed(1)} m</option>`;
      }).join('')}</select>
      <div id="bmResumo" class="hout" style="margin-top:7px"></div>
      <div class="row2" style="margin-top:8px">
        <div><label class="field">Obra / empreendimento</label><input id="bmObra" type="text" placeholder="Nome da obra"></div>
        <div><label class="field">Local</label><input id="bmLocal" type="text" placeholder="Município / área"></div>
      </div>
      <div class="row2">
        <div><label class="field">Responsável pela emissão</label><input id="bmResp" type="text" placeholder="Nome / função"></div>
        <div><label class="field">Revisão</label><input id="bmRev" type="text" value="00"></div>
      </div>
      <label class="field" style="margin-top:9px">Desenhos que integrarão a figura</label>
      <div style="display:grid;gap:7px;padding:8px;border:1px solid var(--line);border-radius:8px">
        <label><input type="checkbox" id="bmPlanta" checked style="width:auto;accent-color:var(--amber)"> Planta construtiva</label>
        <label><input type="checkbox" id="bmLong" checked style="width:auto;accent-color:var(--amber)"> Corte longitudinal / perfil lateral (VL)</label>
        <label><input type="checkbox" id="bmTrans" checked style="width:auto;accent-color:var(--amber)"> Corte transversal (VT)</label>
      </div>
      <div class="hint" style="margin-top:8px">O memorial usa as cotas, taludes, bermas, rampa,
        volume e extravasor armazenados na própria caixa escolhida. O PDF completo inclui
        metodologia executiva, controle de qualidade, segurança, meio ambiente, medição e entrega.</div>
      <button class="tbtn" data-bm="gerar" style="width:100%;justify-content:center;margin-top:10px;background:var(--amber);color:#171006;font-weight:700">
        Gerar memorial, figura e cortes</button>
    </div></div>`;
  document.body.appendChild(m);
  const atualizaResumo=()=>{
    const L=caixas.find(x=>String(x.id)===String(m.querySelector('#bmCaixa').value));if(!L)return;
    const D=L.tinSurface,P=D.p||{},R=D.rampa||{},E=D.extravasor||P.extravasor||{};
    m.querySelector('#bmResumo').innerHTML=`<b>${esc(L.name)}</b><br>`+
      `Dimensões nominais ${Number(P.C||0).toFixed(2)} × ${Number(P.L||0).toFixed(2)} m · `+
      `profundidade ${Number(P.P||0).toFixed(2)} m · fundo ${Number(D.zFundo||0).toFixed(2)} m<br>`+
      `Rampa: ${R.rampaLen?Number(R.largura||0).toFixed(1)+' × '+Number(R.rampaLen).toFixed(1)+' m':'não prevista'} · `+
      `Bermas: ${P.bermOn?'sim':'não'} · Extravasor: ${E.ok?'dimensionado':'não dimensionado'}`;
  };
  m.querySelector('#bmCaixa').onchange=atualizaResumo;atualizaResumo();
  m.querySelector('[data-bm="x"]').onclick=()=>m.remove();
  m.addEventListener('click',e=>{if(e.target===m)m.remove();});
  m.querySelector('[data-bm="gerar"]').onclick=()=>{
    const L=caixas.find(x=>String(x.id)===String(m.querySelector('#bmCaixa').value));
    if(!L){toast('Escolha uma caixa válida');return;}
    const op={planta:m.querySelector('#bmPlanta').checked,longitudinal:m.querySelector('#bmLong').checked,
      transversal:m.querySelector('#bmTrans').checked,
      meta:{obra:m.querySelector('#bmObra').value.trim(),local:m.querySelector('#bmLocal').value.trim(),
        responsavel:m.querySelector('#bmResp').value.trim(),revisao:m.querySelector('#bmRev').value.trim()||'00'}};
    if(!op.planta&&!op.longitudinal&&!op.transversal){toast('Marque ao menos um desenho');return;}
    m.remove();baciaDetalhamento({L,D:L.tinSurface,op});
  };
}
/* Prancha construtiva rápida da caixa selecionada: planta e perfil pelo eixo
   da rampa. É deliberadamente vetorial no canvas (linhas/cotas nítidas) e usa
   a mesma função de superfície empregada pela TIN. */
function baciaDetalhamento(escolha){
  const Q=(escolha&&escolha.L&&escolha.D)?escolha:baciaProjetoDetalhe();
  if(!Q){ toast('Selecione uma caixa de retenção com superfície final e rampa'); return; }
  const op=Object.assign({planta:true,longitudinal:true,transversal:true},(escolha&&escolha.op)||{});
  const D=Q.D,W=1500,H=900,cv=document.createElement('canvas'); cv.width=W;cv.height=H;
  const c=cv.getContext('2d'); c.fillStyle='#fff';c.fillRect(0,0,W,H);
  c.strokeStyle='#111';c.fillStyle='#111';c.lineWidth=1.5;c.font='16px Signika';
  c.fillText('CCMGIS · DETALHAMENTO CONSTRUTIVO — CAIXA DE RETENÇÃO',45,38);
  c.font='12px Signika';c.fillStyle='#555';c.fillText(Q.L.name,45,59);
  const limites=D.limites||[], todos=limites.flat().concat(D.fundoR||[],D.arestaR||[],
    D.rampa&&D.rampa.pista?D.rampa.pista:[]);
  const xmin=Math.min(...todos.map(p=>p[0])),xmax=Math.max(...todos.map(p=>p[0])),
        ymin=Math.min(...todos.map(p=>p[1])),ymax=Math.max(...todos.map(p=>p[1]));
  const bx={x:45,y:90,w:850,h:650},pad=35,
        sc=Math.min((bx.w-2*pad)/Math.max(1,xmax-xmin),(bx.h-2*pad)/Math.max(1,ymax-ymin));
  const MP=p=>[bx.x+pad+(p[0]-xmin)*sc,bx.y+bx.h-pad-(p[1]-ymin)*sc];
  const linha=(r,cor,w,dash)=>{
    if(!r||r.length<2)return;c.beginPath();r.forEach((p,i)=>{const q=MP(p);i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]);});
    c.strokeStyle=cor;c.lineWidth=w;c.setLineDash(dash||[]);c.stroke();c.setLineDash([]);
  };
  c.strokeStyle='#bbb';c.strokeRect(bx.x,bx.y,bx.w,bx.h);
  c.fillStyle='#111';c.font='bold 15px Signika';c.fillText('PLANTA',bx.x+8,bx.y+22);
  if(op.planta){
    limites.forEach(r=>linha(r,'#111',2.5));
    linha(D.arestaR,'#b5651d',1.8,[8,4]); linha(D.fundoR,'#1769aa',2);
    if(D.rampa){
      linha(D.rampa.pista,'#c25b1a',2.5);
      (D.rampa.lados||[]).forEach(s=>linha(s.ring,'#c25b1a',1.2));
    }
  }else{
    c.fillStyle='#777';c.font='16px Signika';c.fillText('Planta não incluída nesta emissão.',bx.x+30,bx.y+60);
  }
  /* símbolos convencionais: traços curtos entre aresta e limite externo */
  if(D.p&&D.p.talSym&&D.arestaR&&D.arestaR.length>1){
    const ext=limites[0]||[];
    for(let i=0;i<D.arestaR.length-1;i++){
      const a=D.arestaR[i],b=D.arestaR[i+1],n=Math.max(2,Math.floor(Math.hypot(b[0]-a[0],b[1]-a[1])/8));
      for(let k=0;k<n;k++){ const t=(k+.5)/n,q=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
        let e=null,bd=Infinity; ext.forEach(v=>{const d=(v[0]-q[0])**2+(v[1]-q[1])**2;if(d<bd){bd=d;e=v;}});
        if(e){ const u=[q[0]+(e[0]-q[0])*.42,q[1]+(e[1]-q[1])*.42]; linha([q,u],'#777',.8); }
      }
    }
  }
  // perfil pelo eixo da rampa (ou pelo primeiro lado da caixa)
  let dir=D.rampa&&D.rampa.dirO;
  if(!dir&&D.arestaR&&D.arestaR.length>1){const a=D.arestaR[0],b=D.arestaR[1],n=Math.hypot(b[0]-a[0],b[1]-a[1])||1;dir=[(b[0]-a[0])/n,(b[1]-a[1])/n];}
  dir=dir||[1,0]; const proj=todos.map(p=>(p[0]-D.ctr[0])*dir[0]+(p[1]-D.ctr[1])*dir[1]);
  const s0=Math.min(...proj),s1=Math.max(...proj),sec=[];
  for(let i=0;i<=320;i++){const s=s0+(s1-s0)*i/320,x=D.ctr[0]+dir[0]*s,y=D.ctr[1]+dir[1]*s,z=tinSurfaceZ(D,x,y);if(z!=null)sec.push([s,z]);}
  const pb={x:945,y:90,w:510,h:305};c.strokeStyle='#bbb';c.strokeRect(pb.x,pb.y,pb.w,pb.h);
  c.fillStyle='#111';c.font='bold 15px Signika';c.fillText('PERFIL LATERAL — EIXO DA RAMPA',pb.x+8,pb.y+22);
  if(op.longitudinal&&sec.length){
    const z0=Math.min(...sec.map(p=>p[1]))-1,z1=Math.max(...sec.map(p=>p[1]))+1;
    const PX=s=>pb.x+35+(s-s0)/Math.max(1,s1-s0)*(pb.w-60), PZ=z=>pb.y+pb.h-35-(z-z0)/Math.max(1,z1-z0)*(pb.h-70);
    c.beginPath();sec.forEach((p,i)=>i?c.lineTo(PX(p[0]),PZ(p[1])):c.moveTo(PX(p[0]),PZ(p[1])));
    c.strokeStyle='#1769aa';c.lineWidth=2.5;c.stroke();
    c.strokeStyle='#999';c.lineWidth=1;c.beginPath();c.moveTo(PX(s0),PZ(D.zFundo));c.lineTo(PX(s1),PZ(D.zFundo));c.stroke();
    c.fillStyle='#1769aa';c.font='12px Signika';c.fillText('Cota fundo '+D.zFundo.toFixed(2)+' m',pb.x+42,PZ(D.zFundo)-5);
  }else if(!op.longitudinal){
    c.fillStyle='#777';c.font='14px Signika';c.fillText('Corte longitudinal não incluído.',pb.x+25,pb.y+60);
  }
  /* Corte transversal, ortogonal ao eixo longitudinal e passando pelo
     centro da caixa. Usa a mesma superfície analítica do TIN; por isso fundo,
     pés, cristas e bermas aparecem nas cotas efetivamente projetadas. */
  const tb={x:945,y:435,w:510,h:305};c.strokeStyle='#bbb';c.strokeRect(tb.x,tb.y,tb.w,tb.h);
  c.fillStyle='#111';c.font='bold 15px Signika';c.fillText('CORTE TRANSVERSAL — CENTRO DA CAIXA',tb.x+8,tb.y+22);
  if(op.transversal){
    const per=[-dir[1],dir[0]],prT=todos.map(p=>(p[0]-D.ctr[0])*per[0]+(p[1]-D.ctr[1])*per[1]),
      t0=Math.min(...prT),t1=Math.max(...prT),secT=[];
    for(let i=0;i<=320;i++){const s=t0+(t1-t0)*i/320,xq=D.ctr[0]+per[0]*s,yq=D.ctr[1]+per[1]*s,
      z=tinSurfaceZ(D,xq,yq);if(z!=null)secT.push([s,z]);}
    if(secT.length){
      const zz0=Math.min(...secT.map(p=>p[1]))-1,zz1=Math.max(...secT.map(p=>p[1]))+1;
      const TX=s=>tb.x+35+(s-t0)/Math.max(1,t1-t0)*(tb.w-60),
        TZ=z=>tb.y+tb.h-35-(z-zz0)/Math.max(1,zz1-zz0)*(tb.h-70);
      c.beginPath();secT.forEach((p,i)=>i?c.lineTo(TX(p[0]),TZ(p[1])):c.moveTo(TX(p[0]),TZ(p[1])));
      c.strokeStyle='#2f7d4a';c.lineWidth=2.5;c.stroke();
      c.strokeStyle='#999';c.lineWidth=1;c.beginPath();c.moveTo(TX(t0),TZ(D.zFundo));c.lineTo(TX(t1),TZ(D.zFundo));c.stroke();
      c.fillStyle='#2f7d4a';c.font='12px Signika';c.fillText('Fundo '+D.zFundo.toFixed(2)+' m',tb.x+42,TZ(D.zFundo)-5);
    }
  }else{
    c.fillStyle='#777';c.font='14px Signika';c.fillText('Corte transversal não incluído.',tb.x+25,tb.y+60);
  }
  const P=D.p||{},R=D.rampa||{},META=op.meta||{};c.fillStyle='#111';c.font='13px Signika';
  const dados=[
    `Profundidade: ${(P.P||0).toFixed(2)} m`,
    `Fundo: ${D.zFundo.toFixed(2)} m · aresta: ${D.zAresta.toFixed(2)} m`,
    `Talude interno: ${(P.angInt||0).toFixed(1)}° · corte: ${(P.angCorte||0).toFixed(1)}°`,
    `Bermas: ${P.bermOn?'SIM':'NÃO'} · lance ${(P.talH||0).toFixed(1)} m · largura ${(P.bermW||0).toFixed(1)} m`,
    `Ativação das bermas: altura ≥ ${(P.bermMinH||0).toFixed(1)} m`,
    R.rampaLen?`Rampa: ${R.largura.toFixed(1)} m × ${R.rampaLen.toFixed(1)} m · ${(100*P.P/R.rampaLen).toFixed(1)}%`:'Rampa: —',
    `Extravasor: ${((D.extravasor||P.extravasor)||{}).descricao||'não dimensionado'}`
  ];
  dados.forEach((t,i)=>c.fillText(t,55,780+i*18));

  /* Relatório técnico em A4 retrato. A própria prancha acima é inserida como
     figura, mantendo também uma saída PNG independente para Word/Docs. */
  const rc=document.createElement('canvas'),RW=1240,RH=1754;
  rc.width=RW;rc.height=RH;
  const x=rc.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,RW,RH);
  const azul='#0b2b46',laranja='#d78316',cinza='#536b7d',linhaCor='#c8d4dd';
  const margem=72,util=RW-2*margem;
  const txt=(t,px,py,tam=22,cor=azul,peso='400',align='left')=>{
    x.fillStyle=cor;x.font=`${peso} ${tam}px Signika`;x.textAlign=align;
    x.fillText(String(t),px,py);x.textAlign='left';
  };
  const hline=py=>{x.strokeStyle=linhaCor;x.lineWidth=2;x.beginPath();x.moveTo(margem,py);x.lineTo(RW-margem,py);x.stroke();};
  const fmt=(v,n=2)=>isFinite(v)?Number(v).toLocaleString('pt-BR',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
  const ringArea=r=>Math.abs(baciaArea((r||[]).slice(0,-1)));
  const perim=r=>{let s=0,q=r||[];for(let i=1;i<q.length;i++)s+=Math.hypot(q[i][0]-q[i-1][0],q[i][1]-q[i-1][1]);return s;};
  const aF=ringArea(D.fundoR),aA=ringArea(D.arestaR),aD=ringArea((D.limites||[])[0]||D.daylightR);
  const prof=Number(P.P)||Math.max(0,D.zAresta-D.zFundo);
  const volGeom=prof>0?(prof/3)*(aF+aA+Math.sqrt(Math.max(0,aF*aA))):0;
  const volEsc=isFinite(D.volumeEscavacao)?D.volumeEscavacao:
    (Q.U&&isFinite(Q.U.volumeEscavacao)?Q.U.volumeEscavacao:volGeom);
  const volFonte=isFinite(D.volumeEscavacao)||(Q.U&&isFinite(Q.U.volumeEscavacao))
    ?'integração célula a célula entre terreno e projeto'
    :'estimativa geométrica preliminar pelo tronco de pirâmide';
  const data=new Date().toLocaleDateString('pt-BR');

  x.fillStyle=azul;x.fillRect(0,0,RW,112);
  txt('CCMGIS 3.0',margem,55,34,'#fff','700');
  txt('CCM Engenharia',margem,87,18,'#cfe2ef','400');
  txt('MEMORIAL DESCRITIVO — CAIXA DE RETENÇÃO',RW-margem,62,25,'#fff','700','right');
  txt(`Emissão: ${data}`,RW-margem,88,16,'#cfe2ef','400','right');
  txt('1. IDENTIFICAÇÃO',margem,158,23,laranja,'700');hline(170);
  txt(`Elemento: ${Q.L.name}`,margem,205,20);
  txt(`Obra: ${META.obra||'não informada'} · Local: ${META.local||'não informado'}`,margem,236,18,cinza);
  txt(`Responsável pela emissão: ${META.responsavel||'não informado'} · Revisão: ${META.revisao||'00'}`,margem,264,18,cinza);
  txt(`Sistema de referência: ${S.workCRS||Q.L.crs||'não informado'}`,margem,292,18,cinza);

  txt('2. FIGURA DE IMPLANTAÇÃO E PERFIL',margem,330,23,laranja,'700');hline(342);
  const fy=360,fh=638;
  x.fillStyle='#f5f8fa';x.fillRect(margem,fy,util,fh);
  x.drawImage(cv,0,0,W,745,margem+12,fy+12,util-24,fh-24);
  txt('Figura 1 — Planta construtiva, corte longitudinal e corte transversal da caixa.',margem,1025,17,cinza,'400');

  txt('3. QUADRO GEOMÉTRICO E CONSTRUTIVO',margem,1072,23,laranja,'700');hline(1084);
  const Ext=D.extravasor||P.extravasor||{};
  const extResumo=Ext.ok
    ?`${Ext.descricao} · Q ${fmt(Ext.Q,3)} m³/s · H ${fmt(Ext.H,2)} m`
    :(Ext.descricao||'não dimensionado');
  const rows=[
    ['Área do fundo',`${fmt(aF,1)} m²`],['Área da aresta superior',`${fmt(aA,1)} m²`],
    ['Área do limite de implantação',`${fmt(aD,1)} m²`],['Perímetro externo',`${fmt(perim((D.limites||[])[0]||[]),1)} m`],
    ['Cota do fundo',`${fmt(D.zFundo)} m`],['Cota da aresta',`${fmt(D.zAresta)} m`],
    ['Profundidade de projeto',`${fmt(prof)} m`],['Volume de escavação',`${fmt(volEsc,0)} m³`],
    ['Talude interno / corte',`${fmt(P.angInt,1)}° / ${fmt(P.angCorte,1)}°`],
    ['Bermas',P.bermOn?`a cada ${fmt(P.talH,1)} m · largura ${fmt(P.bermW,1)} m`:'não previstas'],
    ['Rampa de acesso',R.rampaLen?`${fmt(R.largura,1)} × ${fmt(R.rampaLen,1)} m · ${fmt(100*prof/R.rampaLen,1)}%`:'não prevista'],
    ['Saída / extravasor',extResumo]
  ];
  let ry=1118;rows.forEach((r,i)=>{
    if(i%2===0){x.fillStyle='#eef3f6';x.fillRect(margem,ry-23,util,30);}
    txt(r[0],margem+12,ry,17,azul,i===7?'700':'400');
    txt(r[1],RW-margem-12,ry,17,i===7?laranja:azul,i===7?'700':'400','right');ry+=32;
  });

  txt('4. CRITÉRIOS E OBSERVAÇÕES',margem,1534,23,laranja,'700');hline(1546);
  const obs=[
    `Volume: ${volFonte}.`,
    Ext.ok?`Extravasor preliminar: ${Ext.formula}${isFinite(Ext.cotaSoleira)?` · soleira na cota ${fmt(Ext.cotaSoleira)} m`:''}.`:
      'O extravasor não foi dimensionado nesta emissão.',
    'As cotas e dimensões devem ser conferidas no levantamento topográfico antes da execução.',
    'O dimensionamento hidráulico, a estabilidade dos taludes e a destinação do material escavado',
    'devem ser verificados pelo responsável técnico conforme as condições reais de campo.'
  ];
  obs.forEach((t,i)=>txt((i?'':'• ')+t,margem+(i>2?18:0),1574+i*24,15,cinza));
  hline(RH-72);txt('Gerado pelo CCMGIS · relatório automático de apoio ao projeto',margem,RH-42,15,cinza);
  txt('Página 1 de 3',RW-margem,RH-42,15,cinza,'400','right');

  /* Páginas 2 e 3: memorial executivo propriamente dito. O texto é montado
     com os parâmetros da caixa selecionada, evitando instruções genéricas que
     contradigam a geometria realmente projetada. */
  const novaPag=(sub,pag)=>{
    const cvp=document.createElement('canvas');cvp.width=RW;cvp.height=RH;
    const g=cvp.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,RW,RH);
    g.fillStyle=azul;g.fillRect(0,0,RW,112);
    g.fillStyle='#fff';g.font='700 34px Signika';g.fillText('CCMGIS 3.0',margem,55);
    g.fillStyle='#cfe2ef';g.font='18px Signika';g.fillText('CCM Engenharia',margem,87);
    g.textAlign='right';g.fillStyle='#fff';g.font='700 25px Signika';g.fillText('MEMORIAL DESCRITIVO — CAIXA DE RETENÇÃO',RW-margem,62);
    g.fillStyle='#cfe2ef';g.font='16px Signika';g.fillText(sub,RW-margem,88);g.textAlign='left';
    g.strokeStyle=linhaCor;g.lineWidth=2;g.beginPath();g.moveTo(margem,RH-72);g.lineTo(RW-margem,RH-72);g.stroke();
    g.fillStyle=cinza;g.font='15px Signika';g.fillText(`Elemento: ${Q.L.name} · Revisão ${META.revisao||'00'}`,margem,RH-42);
    g.textAlign='right';g.fillText(`Página ${pag} de 3`,RW-margem,RH-42);g.textAlign='left';
    return {cv:cvp,g,y:154};
  };
  const relTitulo=(A,t)=>{A.g.fillStyle=laranja;A.g.font='700 22px Signika';A.g.fillText(t,margem,A.y);
    A.g.strokeStyle=linhaCor;A.g.lineWidth=2;A.g.beginPath();A.g.moveTo(margem,A.y+12);A.g.lineTo(RW-margem,A.y+12);A.g.stroke();A.y+=42;};
  const relPar=(A,t,opt)=>{
    opt=opt||{};const pref=opt.bullet?'• ':'';const rec=opt.indent||0,max=util-rec;
    A.g.font=`${opt.bold?'700':'400'} ${opt.size||15}px Signika`;A.g.fillStyle=opt.cor||azul;
    const palavras=String(t).split(/\s+/);let linha=pref,primeira=true;
    for(const w of palavras){const teste=linha+(linha.trim()?' ':'')+w;
      if(A.g.measureText(teste).width>max&&linha.trim()){
        A.g.fillText(linha,margem+rec,A.y);A.y+=opt.lh||22;linha=(primeira&&pref?'  ':'')+w;primeira=false;
      }else linha=teste;
    }
    if(linha.trim()){A.g.fillText(linha,margem+rec,A.y);A.y+=opt.lh||22;}A.y+=opt.after==null?8:opt.after;
  };
  const nomeCaixa=Q.L.name,dimC=Number(P.C||0),dimL=Number(P.L||0),angI=Number(P.angInt||0),angC=Number(P.angCorte||0);
  const pag2=novaPag('Procedimento executivo',2);
  relTitulo(pag2,'5. OBJETO E PREMISSAS DE EXECUÇÃO');
  relPar(pag2,`Este memorial estabelece a sequência recomendada para implantação da ${nomeCaixa}, com aresta nominal de ${fmt(dimC)} × ${fmt(dimL)} m, profundidade de ${fmt(prof)} m, fundo na cota ${fmt(D.zFundo)} m e limite de implantação indicado na prancha.`,{bullet:true});
  relPar(pag2,'A execução deverá seguir a locação topográfica, os desenhos emitidos, as especificações do responsável técnico e as condições efetivamente encontradas no terreno. Divergências de cota, solo, água ou interferências exigem paralisação localizada, registro e liberação técnica antes da continuidade.',{bullet:true});

  relTitulo(pag2,'6. SERVIÇOS PRELIMINARES E LOCAÇÃO');
  [
    `Realizar inspeção conjunta da área, reconhecer acessos, redes existentes, drenagens, áreas ambientalmente sensíveis e o local autorizado para depósito ou reaproveitamento do material escavado.`,
    `Implantar marcos topográficos fora da zona de movimentação, transferir e conferir o sistema ${S.workCRS||Q.L.crs||'de projeto'}, materializando eixo, vértices da aresta, limite externo do corte, fundo e referências de cota.`,
    `Isolar e sinalizar a frente de serviço. Preparar acesso compatível com os equipamentos, rota de caminhões, área de giro e faixa de segurança no coroamento, sem sobrecarga junto à borda da escavação.`,
    `Executar limpeza e destocamento somente dentro da área autorizada. Remover e estocar separadamente a camada vegetal para futura recomposição, impedindo mistura com solo impróprio ou material de escavação.`
  ].forEach(t=>relPar(pag2,t,{bullet:true}));

  relTitulo(pag2,'7. ESCAVAÇÃO, TALUDES E BERMAS');
  [
    `Iniciar a escavação pelo lado que permita saída contínua dos equipamentos e condução provisória das águas. Trabalhar em camadas, mantendo drenagem superficial ativa; não aprofundar uma cava fechada sem rota segura de saída e sem bombeamento disponível quando houver risco de afluxo.`,
    `Conformar o talude interno entre a aresta e o fundo com inclinação de ${fmt(angI,1)}°. O talude externo de corte até o encontro com o terreno deverá seguir ${fmt(angC,1)}°, sem extrapolar o limite de implantação salvo autorização do responsável técnico.`,
    P.bermOn?`Executar bermas intermediárias nos desníveis aplicáveis, com largura de ${fmt(P.bermW,1)} m e lances máximos de ${fmt(P.talH,1)} m, iniciando sua aplicação para alturas iguais ou superiores a ${fmt(P.bermMinH,1)} m. Cada berma deverá possuir caimento controlado para ponto drenante, sem empoçamentos.`:'Não foram previstas bermas no modelo selecionado. Caso a exposição geotécnica revele necessidade de patamares, a geometria deverá ser revisada antes da execução.',
    `Remover blocos soltos, raízes e bolsões instáveis à medida que forem expostos. É proibido manter material, equipamento pesado ou pilhas no coroamento em posição que aumente a solicitação do talude.`,
    `Transportar o excedente apenas para destino aprovado. Registrar volumes por levantamento topográfico ou controle equivalente, distinguindo material aproveitável, solo vegetal, material saturado e rejeito.`
  ].forEach(t=>relPar(pag2,t,{bullet:true}));

  relTitulo(pag2,'8. FUNDO, RAMPA E DISPOSITIVOS HIDRÁULICOS');
  [
    `Regularizar o fundo na cota ${fmt(D.zFundo)} m, eliminando pontos altos e depressões. O fundo deve permanecer contínuo, estável e com os caimentos definidos pelo projeto para direcionar água e sedimentos ao ponto de operação previsto.`,
    `Após a regularização, compactar ou selar o fundo somente conforme a finalidade hidráulica e a especificação geotécnica. Materiais amolecidos, orgânicos ou bombeantes deverão ser removidos e substituídos mediante liberação técnica.`,
    R.rampaLen?`Construir a rampa com largura útil de ${fmt(R.largura,1)} m, comprimento aproximado de ${fmt(R.rampaLen,1)} m e declividade de ${fmt(100*prof/R.rampaLen,1)}%. Conformar as transições de topo e fundo, garantir capacidade de suporte e implantar proteção contra erosão nas laterais.`:'A caixa selecionada não possui rampa modelada. O acesso de equipamentos ao fundo não poderá ser improvisado; se necessário, deverá ser projetado e incorporado à geometria antes da obra.',
    Ext.ok?`Executar o extravasor conforme o dimensionamento preliminar: ${Ext.descricao}; vazão de referência ${fmt(Ext.Q,3)} m³/s, carga ${fmt(Ext.H,2)} m${isFinite(Ext.cotaSoleira)?` e soleira na cota ${fmt(Ext.cotaSoleira)} m`:''}. Proteger entrada, saída e restituição contra erosão e recalques.`:'Não há extravasor dimensionado nesta emissão. A caixa não deverá entrar em operação sem que a descarga de emergência e a restituição a jusante sejam definidas e aprovadas.'
  ].forEach(t=>relPar(pag2,t,{bullet:true}));

  const pag3=novaPag('Controle, segurança, medição e entrega',3);
  relTitulo(pag3,'9. CONTROLE GEOMÉTRICO E DA QUALIDADE');
  [
    `Conferir topograficamente, no mínimo, limite externo, aresta, fundo, eixo da rampa, cotas de soleira e pontos de mudança de inclinação. A liberação de cada etapa deve ser registrada antes que a etapa seguinte oculte o serviço.`,
    `Verificar visualmente continuidade dos taludes, ausência de material solto, drenagem das bermas, acabamento do fundo e estabilidade dos acessos. Trincas, surgências, erosões, abatimentos ou deformações exigem registro fotográfico e avaliação técnica.`,
    `Como referência de controle, adotar tolerância planimétrica de ±0,10 m e altimétrica de ±0,05 m para fundo, arestas e dispositivos hidráulicos, salvo critério mais restritivo indicado no projeto ou pelo responsável técnico.`,
    `Quando houver compactação, definir previamente material, espessura de camada, umidade, energia e critério de aceitação; registrar origem do material, número de passadas, equipamentos e resultados dos ensaios aplicáveis.`
  ].forEach(t=>relPar(pag3,t,{bullet:true}));

  relTitulo(pag3,'10. SEGURANÇA, ÁGUA E MEIO AMBIENTE');
  [
    `Manter análise de risco atualizada, comunicação entre operadores e sinaleiro, inspeção diária dos taludes e controle de acesso. Suspender serviços durante chuva intensa, baixa visibilidade, instabilidade, inundação ou qualquer condição não prevista.`,
    `Prever valetas de desvio, proteção do coroamento, bombeamento e ponto de descarga estabilizado. A água bombeada não poderá provocar erosão, assoreamento ou carreamento de finos para áreas externas.`,
    `Controlar poeira, lama em vias, ruído, derramamentos e resíduos. Abastecimento e manutenção devem ocorrer em local protegido. Solo contaminado ou material inadequado terá manejo e destinação específicos.`,
    `Recompor as áreas temporárias, espalhar o solo vegetal preservado, estabilizar superfícies expostas e implantar proteção vegetal ou revestimento onde houver risco de erosão.`
  ].forEach(t=>relPar(pag3,t,{bullet:true}));

  relTitulo(pag3,'11. MEDIÇÃO, ACEITAÇÃO E ENTREGA');
  [
    `Medir a escavação por comparação entre levantamento do terreno original e levantamento final aceito. Volume de referência desta emissão: ${fmt(volEsc,0)} m³ (${volFonte}). Quantidades contratuais deverão usar o método definido para a obra.`,
    `Medir separadamente limpeza, escavação, carga, transporte, destinação, regularização, compactação, proteção superficial, rampa e dispositivos hidráulicos quando esses itens tiverem composições próprias. Não medir retrabalho decorrente de execução fora das tolerâncias.`,
    `A aceitação requer geometria conferida, fundo e taludes estáveis, drenagem funcional, dispositivos desobstruídos, área limpa, registros de controle completos e correção das não conformidades.`,
    `Entregar levantamento “as built”, planta e cortes atualizados, relatório fotográfico, volumes, registros topográficos, ensaios, ocorrências de campo, destinação de materiais e termo de liberação do responsável técnico.`
  ].forEach(t=>relPar(pag3,t,{bullet:true}));

  relTitulo(pag3,'12. OPERAÇÃO E MANUTENÇÃO');
  [
    `Inspecionar a caixa após a implantação, antes do período chuvoso e depois de eventos relevantes. Registrar nível atingido, erosões, assoreamento, obstruções, recalques, trincas e condição do extravasor.`,
    `Remover sedimentos quando reduzirem a capacidade útil ou bloquearem entradas e saídas; recompor proteções erodidas e manter acesso operacional. Qualquer alteração de geometria, uso ou descarga exige revisão do projeto.`,
    `Este memorial é apoio executivo gerado a partir do modelo ${nomeCaixa}. A responsabilidade pela adequação final, estabilidade, dimensionamento hidráulico e atendimento às exigências aplicáveis permanece com os profissionais e responsáveis pela obra.`
  ].forEach(t=>relPar(pag3,t,{bullet:true}));

  let m=document.getElementById('baciaDetModal');
  if(m)m.remove();m=document.createElement('div');m.id='baciaDetModal';m.className='a3-command-overlay';
  m.style.cssText='position:fixed;inset:0;z-index:3600;background:#000b;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px';
  m.innerHTML='<div style="width:min(96vw,1500px);display:flex;gap:8px;margin-bottom:8px;justify-content:flex-end;flex-wrap:wrap">'+
    '<button class="tbtn" data-bdp="fig">Prancha</button><button class="tbtn" data-bdp="1">Memorial p.1</button>'+
    '<button class="tbtn" data-bdp="2">Execução p.2</button><button class="tbtn" data-bdp="3">Controle p.3</button>'+
    '<button class="tbtn" id="bdFIG">⤓ Figura PNG</button>'+
    '<button class="tbtn" id="bdRELPNG">⤓ Memorial PNG</button>'+
    '<button class="tbtn" id="bdPDF" style="background:var(--amber);color:#171006;font-weight:700">⤓ Memorial PDF (3 páginas)</button>'+
    '<button class="tbtn" id="bdX">✕ Fechar</button></div>';
  const prev=document.createElement('div');prev.style.cssText='display:flex;align-items:center;justify-content:center;max-width:96vw;max-height:84vh';
  const mostraPrev=alvo=>{prev.innerHTML='';alvo.style.cssText='max-width:96vw;max-height:84vh;background:#fff;box-shadow:0 10px 35px #000';prev.appendChild(alvo);};
  m.appendChild(prev);document.body.appendChild(m);mostraPrev(rc);
  m.querySelectorAll('[data-bdp]').forEach(b=>b.onclick=()=>mostraPrev(b.dataset.bdp==='fig'?cv:b.dataset.bdp==='1'?rc:b.dataset.bdp==='2'?pag2.cv:pag3.cv));
  document.getElementById('bdX').onclick=()=>m.remove();
  document.getElementById('bdFIG').onclick=()=>cv.toBlob(b=>download(b,'figura_caixa_retencao.png'),'image/png');
  document.getElementById('bdRELPNG').onclick=()=>{const all=document.createElement('canvas');all.width=RW;all.height=RH*3;
    const ac=all.getContext('2d');ac.drawImage(rc,0,0);ac.drawImage(pag2.cv,0,RH);ac.drawImage(pag3.cv,0,RH*2);
    all.toBlob(b=>download(b,'memorial_descritivo_caixa_retencao.png'),'image/png');};
  document.getElementById('bdPDF').onclick=()=>{
    const pags=[rc,pag2.cv,pag3.cv].map(pg=>({jpeg:b64ToBytes(pg.toDataURL('image/jpeg',0.94).split(',')[1]),PW:210,PH:297,pxW:RW,pxH:RH}));
    download(buildPDFmulti(pags),'memorial_descritivo_caixa_retencao.pdf');
    toast('Memorial descritivo da caixa exportado em PDF');
  };
}
/* Arma ou reloca a rampa. Na relocação, a camada final é guardada para que
   Esc ou qualquer falha restaure integralmente a posição anterior. */
function baciaArmaRampaBotao(relocar){
  const U=baciaAdotaSelecionada();
  if(!U){ toast('Selecione a camada de uma caixa (ou crie uma) antes de indicar a rampa'); return; }
  const num=id=>parseFloat(String((document.getElementById(id)||{}).value).replace(',','.'));
  U.p.rampaW=Math.max(1,num('bcRampaW')||4);
  U.p.rampaI=Math.max(.1,num('bcRampaI')||15);
  U.p.rampaAz=num('bcRampaAz')||0;
  U.p.bermOn=!!(document.getElementById('bcBermOn')||{}).checked;
  U.p.talH=Math.max(1,num('bcTalH')||10);
  U.p.bermW=Math.max(0,num('bcBermW')||0);
  U.p.bermMinH=Math.max(0,num('bcBermMinH')||0);
  if(relocar||U.rampaInfo){
    U._relocarRollback={
      state:baciaCapturaEstadoBase(U.Lv),rampaInfo:baciaClonaDados(U.rampaInfo),
      daylightR:baciaClonaDados(U.daylightR),extravasorInfo:baciaClonaDados(U.extravasorInfo)
    };
    if(!baciaRestauraCaixaSemRampa(U)){
      delete U._relocarRollback;toast('Não foi possível restaurar a caixa original para relocar a rampa');return;
    }
  }else if(!U._baseState){
    U._baseState=baciaCapturaEstadoBase(U.Lv);
    U._baseDaylightR=(U.daylightR||U.arestaR||[]).map(q=>q.slice());
  }
  U._rampaTransaction={
    state:baciaCapturaEstadoBase(U.Lv),rampaInfo:baciaClonaDados(U.rampaInfo),
    daylightR:baciaClonaDados(U.daylightR),extravasorInfo:baciaClonaDados(U.extravasorInfo)
  };
  baciaArmaRampa(U.Lv,U.p,U.ctr,U.fundoR,U.daylightR||U.arestaR,U.zFundo,U.zAresta,!!relocar);
}
function baciaLimpaRampa(){
  const U=baciaAdotaSelecionada();if(!U||!U.rampaInfo){toast('Não há rampa para limpar');return;}
  delete U._relocarRollback;
  delete U._rampaTransaction;
  if(!baciaRestauraCaixaSemRampa(U)){toast('Não foi possível restaurar a caixa original');return;}
  BACIA_RAMPA=null;if(typeof setTool==='function')setTool('select');
  baciaAtualizaBotaoMDT();
  const out=document.getElementById('bcOut');
  if(out)out.innerHTML+='<br><b>Rampa removida.</b> A geometria original da caixa foi restaurada.';
  toast('Rampa removida; caixa original restaurada');
}
/* gera o MDT cortado (escavado) no limite da última bacia criada */
function baciaGeraMDTCortado(){
  const U=baciaAdotaSelecionada();
  if(!U){ toast('Selecione a camada de uma caixa (ou crie uma) antes de gerar o MDT cortado'); return; }
  showLoad && showLoad('Escavando o MDT no limite da bacia…');
  setTimeout(()=>{
    try{
      // usa a grade de TRABALHO (a mesma que gerou a bacia): mais leve e alinhada
      // ao que se vê. A grade nativa poderia ter milhões de células e travar o 3D.
      const g=U.g;
      const R=baciaEscava(g, U.ctr, U.p, U.fundoR, U.arestaR, U.daylightR, U.zFundo, U.zAresta, U.rampaInfo);
      hideLoad && hideLoad();
      if(R.nova){
        U.volumeEscavacao=R.vol;
        if(U.Lv&&U.Lv.tinSurface) U.Lv.tinSurface.volumeEscavacao=R.vol;
        if(U.Lv&&U.Lv.tinSurface) U.Lv.tinSurface.celulasVolume=R.nCel;
        const out=document.getElementById('bcOut');
        if(out) out.innerHTML+='<br><b>Superfície da bacia gerada:</b> "'+R.nova+'" (grade '+(g.cs||1).toFixed(2)+' m)<br>'+
          'Só a caixa, recortada no limite (NoData fora). Trace o perfil com esta superfície + a topografia.<br>'+
          'Volume de escavação ≈ <b>'+R.vol.toLocaleString('pt-BR',{maximumFractionDigits:0})+' m³</b> · '+
          R.nCel.toLocaleString('pt-BR')+' células';
        toast('MDT cortado gerado — volume ≈ '+R.vol.toLocaleString('pt-BR',{maximumFractionDigits:0})+' m³');
        refreshUI();
      } else { toast('Não consegui criar o raster escavado'); }
    }catch(e){ hideLoad && hideLoad(); toast('Falha ao escavar: '+(e&&e.message||e)); }
  },30);
}
/* Após a caixa: o usuário TOCA o ponto onde a rampa chega (no fundo). */
var BACIA_RAMPA=null;
function baciaArmaRampa(Lv, p, ctr, fundoR, bocaR, zFundo, zMin,relocando){
  BACIA_RAMPA={Lv,p,ctr,fundoR,bocaR,zFundo,zMin,relocando:!!relocando};
  if(typeof setTool==='function') setTool('baciaRampa');
  try{ baciaRampaBackstop(); }catch(e){}
  cmdLog('Rampa: toque o ponto do FUNDO por onde a rampa deve descer; Esc pula a rampa','info');
  toast('Toque o ponto onde a rampa deve chegar (no fundo da caixa)');
  const out=document.getElementById('bcOut');
  if(out) out.innerHTML+='<br><b style="color:var(--amber)">Toque o ponto de chegada da rampa</b> (na borda do fundo).';
}
function baciaRampaBackstop(){
  if(typeof map==='undefined' || !map || !map.getContainer) return false;
  const cont=map.getContainer(); if(cont._baciaRampaBS) return true; cont._baciaRampaBS=true;
  const LIMIAR=6;
  const llDe=ev=>{ const r=cont.getBoundingClientRect();
    return map.containerPointToLatLng([ev.clientX-r.left, ev.clientY-r.top]); };
  cont.addEventListener('pointerdown', ev=>{
    if(S.tool!=='baciaRampa') return; if(ev.button===1||ev.button===2) return;
    cont._brDown={x:ev.clientX, y:ev.clientY, moved:false};
  }, true);
  cont.addEventListener('pointermove', ev=>{
    if(S.tool!=='baciaRampa'||!cont._brDown) return;
    if(Math.abs(ev.clientX-cont._brDown.x)>LIMIAR||Math.abs(ev.clientY-cont._brDown.y)>LIMIAR)
      cont._brDown.moved=true;
  }, true);
  cont.addEventListener('pointerup', ev=>{
    if(S.tool!=='baciaRampa') return;
    const d=cont._brDown; cont._brDown=null;
    if(d && d.moved) return;
    Promise.resolve(baciaRampaClick(llDe(ev))).catch(e=>{
      BACIA_RAMPA=null;
      if(!baciaRollbackRelocacao())baciaRollbackGeracaoRampa();
      hideLoad&&hideLoad(); toast('Falha na rampa: '+(e&&e.message||e));
      if(typeof setTool==='function') setTool('pan');
    });
    ev.preventDefault(); ev.stopPropagation();
  }, true);
  return true;
}
async function baciaRampaClick(latlng){
  const R=BACIA_RAMPA; if(!R){ return; }
  const c=fromWGS(S.workCRS, latlng.lng, latlng.lat);
  // O toque indica o lado desejado; o pé é encaixado exatamente na borda do
  // fundo. Assim um clique alguns pixels para dentro/fora nunca deixa a rampa
  // solta nem atravessando a caixa em posição acidental.
  const chegada=baciaChegadaOrtogonal(c[0],c[1],R.fundoR,R.ctr);
  await baciaGeraRampa(R.Lv, R.p, R.ctr, R.fundoR, R.bocaR, R.zFundo, R.zMin, chegada.p, chegada.dir);
  if(BACIA.ultima){delete BACIA.ultima._relocarRollback;delete BACIA.ultima._rampaTransaction;}
  BACIA_RAMPA=null;
  if(baciaEncadeiaExtravasor()) return;   // caixa → rampa → extravasor, só com cliques
  if(typeof setTool==='function') setTool('pan');
}
/* Posicionamento do extravasor: o toque é projetado na aresta superior e a
   implantação é desenhada para fora da caixa. Todas as linhas compartilham
   os mesmos nós XYZ e carregam dimensões/posição nos atributos. */
var BACIA_EXT=null;
/* Verdade de campo: extravasor EXISTE quando há feições desenhadas. O bloco
   `extravasor` do tinSurface guarda também o mero pré-dimensionamento, que não
   significa peça implantada — e por ele o encadeamento nunca disparava. */
function baciaExtravasorDesenhado(L){
  return (L&&L.features||[]).some(f=>String(f&&f.props&&f.props.ORIGEM||'')==='Extravasor');
}
/* Encadeamento do projeto: terminada a caixa (e a rampa, quando houver), o
   extravasor é o passo seguinte. Se está previsto e dimensionado, o programa
   já arma o toque na aresta — o usuário clica e ele sai desenhado. */
function baciaEncadeiaExtravasor(){
  const U=BACIA.ultima;
  if(!U||baciaExtravasorDesenhado(U.Lv)) return false;
  const chk=document.getElementById('bcExtOn');
  if(!chk||!chk.checked) return false;
  let E=null;
  try{ E=baciaDimensionaExtravasor(baciaExtravasorParametros(),U.zAresta,U.zFundo); }catch(e){ return false; }
  if(!E||!E.on||!E.ok) return false;
  try{ baciaArmaExtravasor(); }catch(e){ return false; }
  return S.tool==='baciaExt';
}
function baciaArmaExtravasor(){
  const U=baciaAdotaSelecionada();
  if(!U){toast('Selecione a camada de uma caixa (ou crie uma) antes de posicionar o extravasor');return;}
  const E=baciaDimensionaExtravasor(baciaExtravasorParametros(),U.zAresta,U.zFundo);
  if(!E.on||!E.ok){toast(E.erro||'Dimensione o extravasor antes de posicioná-lo');return;}
  const ring=(U.arestaR&&U.arestaR.length>2)?U.arestaR:U.daylightR;
  if(!ring||ring.length<3){toast('A bacia não possui uma aresta válida para o extravasor');return;}
  BACIA_EXT={U,E,ring};
  if(typeof setTool==='function')setTool('baciaExt');
  try{baciaExtBackstop();}catch(e){}
  const out=document.getElementById('bcOut');
  if(out)out.innerHTML+='<br><b style="color:var(--amber)">Extravasor:</b> toque a posição desejada na aresta superior da caixa.';
  cmdLog('Extravasor: toque a aresta superior da caixa para definir a posição','info');
  toast('Toque a aresta superior onde o extravasor será implantado');
}
function baciaExtBackstop(){
  if(typeof map==='undefined'||!map||!map.getContainer)return false;
  const cont=map.getContainer();if(cont._baciaExtBS)return true;cont._baciaExtBS=true;
  const LIMIAR=6,llDe=ev=>{const r=cont.getBoundingClientRect();
    return map.containerPointToLatLng([ev.clientX-r.left,ev.clientY-r.top]);};
  cont.addEventListener('pointerdown',ev=>{
    if(S.tool!=='baciaExt'||ev.button===1||ev.button===2)return;
    cont._beDown={x:ev.clientX,y:ev.clientY,moved:false};
  },true);
  cont.addEventListener('pointermove',ev=>{
    if(S.tool!=='baciaExt'||!cont._beDown)return;
    if(Math.abs(ev.clientX-cont._beDown.x)>LIMIAR||Math.abs(ev.clientY-cont._beDown.y)>LIMIAR)
      cont._beDown.moved=true;
  },true);
  cont.addEventListener('pointerup',ev=>{
    if(S.tool!=='baciaExt')return;const d=cont._beDown;cont._beDown=null;
    if(d&&d.moved)return;
    try{baciaExtravasorClick(llDe(ev));}catch(e){
      BACIA_EXT=null;toast('Falha ao desenhar o extravasor: '+(e&&e.message||e));
      if(typeof setTool==='function')setTool('select');
    }
    ev.preventDefault();ev.stopPropagation();
  },true);return true;
}
function baciaCamposExtravasor(L){
  const defs=[
    ['ORIGEM','C',16,0],['TIPO','C',50,0],['TIPO_EXT','C',16,0],
    ['Q_M3S','N',12,3],['LARG_M','N',12,2],['COMP_M','N',12,2],
    ['DECL_PCT','N',9,2],['AZIMUTE','N',9,2],['COTA_INI','N',12,2],
    ['COTA_FIM','N',12,2],['POS_E','N',16,3],['POS_N','N',16,3]
  ];
  L.fields=L.fields||[];
  defs.forEach(d=>{if(!L.fields.some(f=>String(f.name).toUpperCase()===d[0]))
    L.fields.push({name:d[0],type:d[1],length:d[2],decimal:d[3]});});
}
function baciaExtravasorClick(latlng){
  const X=BACIA_EXT;if(!X)return;const U=X.U,E=X.E,L=U.Lv;
  const c=fromWGS(S.workCRS,latlng.lng,latlng.lat);
  const encaixe=baciaChegadaOrtogonal(c[0],c[1],X.ring,U.ctr);
  const p0=encaixe.p.slice(),normal=encaixe.dir.slice();
  let dir;
  if(Number.isFinite(E.az)){
    const a=E.az*Math.PI/180;dir=[Math.sin(a),Math.cos(a)];
    if(dir[0]*normal[0]+dir[1]*normal[1]<0)dir=[-dir[0],-dir[1]];
  }else dir=normal;
  const dl=Math.hypot(dir[0],dir[1])||1;dir=[dir[0]/dl,dir[1]/dl];
  const perp=[-dir[1],dir[0]],comp=Math.max(.5,+E.comp||6);
  const largura=Math.max(.1,E.tipo==='tubo'?+E.diametro:+E.largura);
  const hw=largura/2,p1=[p0[0]+dir[0]*comp,p0[1]+dir[1]*comp];
  const z0=Number.isFinite(E.cotaSoleira)?E.cotaSoleira:U.zAresta;
  const z1=z0-(Math.max(0,+E.decl||0)/100)*comp;
  const e0=[p0[0]+perp[0]*hw,p0[1]+perp[1]*hw],
    d0=[p0[0]-perp[0]*hw,p0[1]-perp[1]*hw],
    e1=[p1[0]+perp[0]*hw,p1[1]+perp[1]*hw],
    d1=[p1[0]-perp[0]*hw,p1[1]-perp[1]*hw];
  const az=((Math.atan2(dir[0],dir[1])*180/Math.PI)%360+360)%360;
  const base={ORIGEM:'Extravasor',TIPO_EXT:E.tipo==='tubo'?'Tubo':'Vertedor',
    Q_M3S:+E.Q.toFixed(3),LARG_M:+largura.toFixed(2),COMP_M:+comp.toFixed(2),
    DECL_PCT:+E.decl.toFixed(2),AZIMUTE:+az.toFixed(2),COTA_INI:+z0.toFixed(2),
    COTA_FIM:+z1.toFixed(2),POS_E:+p0[0].toFixed(3),POS_N:+p0[1].toFixed(3)};
  const feat=(tipo,geom,zg)=>({geom:geom.map(q=>q.slice()),multi:false,zg:zg.slice(),
    props:{...base,TIPO:tipo}});
  const novas=[
    feat(E.tipo==='tubo'?'Faixa de implantação do tubo':'Contorno do vertedor',
      [e0,e1,d1,d0,e0],[z0,z1,z1,z0,z0]),
    feat('Eixo do extravasor',[p0,p1],[z0,z1]),
    feat('Seção de entrada do extravasor',[e0,d0],[z0,z0]),
    feat('Seção de saída do extravasor',[e1,d1],[z1,z1])
  ];
  L.features=(L.features||[]).filter(f=>String(f.props?.ORIGEM||'')!=='Extravasor').concat(novas);
  baciaCamposExtravasor(L);
  const info={...E,pos:p0.slice(),fim:p1.slice(),dir:dir.slice(),az,largura,comp,
    decl:+E.decl||0,cotaSoleira:z0,cotaSaida:z1};
  U.extravasorInfo=baciaClonaDados(info);U.p.extravasor=baciaClonaDados(info);
  if(L.tinSurface)L.tinSurface.extravasor=baciaClonaDados(info);
  L.visible=true;drawLayer(L);S.activeId=L.id;BACIA_EXT=null;
  if(typeof setTool==='function')setTool('select');
  baciaAtualizaBotaoMDT();refreshUI();
  const out=document.getElementById('bcOut');
  if(out)out.innerHTML+='<br><b>Extravasor desenhado em linhas 3D</b> · '+
    (E.tipo==='tubo'?'Ø ':'largura ')+largura.toFixed(2)+' m · comprimento '+
    comp.toFixed(2)+' m · azimute '+az.toFixed(1)+'° · posição E '+
    p0[0].toFixed(3)+' / N '+p0[1].toFixed(3)+'.';
  toast('Extravasor posicionado e desenhado na camada da caixa');
}
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const t=e.target;if(t&&/INPUT|TEXTAREA|SELECT/.test(t.tagName))return;
  if(S.tool==='baciaRampa'){
    const voltou=baciaRollbackRelocacao();BACIA_RAMPA=null;
    if(BACIA.ultima)delete BACIA.ultima._rampaTransaction;
    if(typeof setTool==='function')setTool('select');
    toast(voltou?'Relocação cancelada; rampa anterior restaurada':'Posicionamento da rampa cancelado');
  }else if(S.tool==='baciaExt'){
    BACIA_EXT=null;if(typeof setTool==='function')setTool('select');
    toast('Posicionamento do extravasor cancelado');
  }
});
/* Gera a rampa na feição da bacia. pDest é encaixado na borda do fundo e
   dirForcada é a normal externa do segmento: a chegada fica exatamente a 90°. */
async function baciaGeraRampa(Lv, p, ctr, fundoR, bocaR, zFundo, zMin, pDest, dirForcada){
  const g=p.g;
  const arestaProjeto=(BACIA.ultima&&BACIA.ultima.arestaR)
    ?BACIA.ultima.arestaR:((fundoR||[]).map(q=>q.slice()));
  let dx=pDest[0]-ctr[0], dy=pDest[1]-ctr[1]; const dn=Math.hypot(dx,dy)||1;
  const dirO=(dirForcada&&isFinite(dirForcada[0])&&isFinite(dirForcada[1]))
    ? [dirForcada[0],dirForcada[1]] : [dx/dn,dy/dn];
  const perp=[-dirO[1],dirO[0]], hw=p.rampaW/2;
  const tanC=Math.tan(p.angCorte*Math.PI/180);
  const ir=p.rampaI/100, rampaLen=p.P/ir;
  const pFundo=[pDest[0], pDest[1]];                          // pé da rampa = ponto tocado (no fundo)
  const pTopo =[pFundo[0]+dirO[0]*rampaLen, pFundo[1]+dirO[1]*rampaLen]; // sobe p/ fora até o terreno
  const feats=[];
  const pista=[
    [pFundo[0]+perp[0]*hw, pFundo[1]+perp[1]*hw],
    [pTopo[0]+perp[0]*hw,  pTopo[1]+perp[1]*hw],
    [pTopo[0]-perp[0]*hw,  pTopo[1]-perp[1]*hw],
    [pFundo[0]-perp[0]*hw, pFundo[1]-perp[1]*hw],
  ]; pista.push(pista[0].slice());
  /* A pista sobe exatamente a profundidade P: toda seção transversal é
     horizontal e o topo termina na cota da aresta da caixa. Usar a cota do
     terreno no ponto final deformava a pista e alterava a declividade pedida. */
  const zTopoPista=zFundo+p.P;
  /* Cada superfície abaixo é um polígono simples. Mantê-la como multi:true
     exigiria Z aninhado; isso fazia o coletor TIN repetir apenas o primeiro Z
     do anel. Como simples, cada vértice conserva sua cota real. */
  feats.push({geom:pista, multi:false, zg:[zFundo, zTopoPista, zTopoPista, zFundo, zFundo],
    props:{TIPO:'Rampa — pista', DECL_PCT:+p.rampaI.toFixed(1), LARG_M:+p.rampaW.toFixed(1),
           COMP_M:+rampaLen.toFixed(1), COTA_TOPO:+zTopoPista.toFixed(2), COTA_FUNDO:+zFundo.toFixed(2)}});
  const NS=Math.max(4,Math.round(rampaLen/Math.max(1,(g.cs||1))));
  const ladosInfo=[];
  for(let lado=-1; lado<=1; lado+=2){
    const bordaPista=[], bordaTopo=[], zgP=[], zgT=[];
    for(let s=0;s<=NS;s++){
      const t=s/NS; const x=pFundo[0]+dirO[0]*rampaLen*t, y=pFundo[1]+dirO[1]*rampaLen*t;
      const zPista=zFundo + p.P*t;
      const bx=x+perp[0]*lado*hw, by=y+perp[1]*lado*hw;
      const zT=sampleZbil(g,bx,by);
      /* O talude da rampa encontra a SUPERFÍCIE FINAL DA CAIXA, não o terreno
         original. Na chegada, bx/by estão sobre o fundo e zAdj=zFundo:
         rec=0, eliminando as asas/arestas que avançavam além do fundo. */
      const zCx=baciaCotaEng(bx,by,ctr,p,fundoR,arestaProjeto,bocaR,
        zFundo,zMin,isFinite(zT)?zT:Infinity);
      const zAdj=(zCx!=null&&isFinite(zCx))?zCx:(isFinite(zT)?zT:zPista);
      const prof=Math.max(0, zAdj - zPista);
      const rec=prof/(tanC||1);
      const tx=bx+perp[0]*lado*rec, ty=by+perp[1]*lado*rec;
      bordaPista.push([bx,by]); zgP.push(zPista);
      bordaTopo.push([tx,ty]);  zgT.push(zAdj);
    }
    const ring=bordaPista.concat(bordaTopo.slice().reverse()); ring.push(ring[0].slice());
    const zg=zgP.concat(zgT.slice().reverse()); zg.push(zg[0]);
    feats.push({geom:ring, multi:false, zg,
      props:{TIPO:'Rampa — talude '+(lado<0?'esq.':'dir.'), DECL_PCT:+p.angCorte.toFixed(1)}});
    ladosInfo.push({lado,ring:ring.map(q=>q.slice()),bp:bordaPista.map(q=>q.slice()),
      bt:bordaTopo.map(q=>q.slice()),zp:zgP.slice(),zt:zgT.slice()});
  }
  // FUNDE de verdade o limite externo da caixa com pista + taludes. Antes as
  // feições eram apenas concatenadas na mesma camada, deixando polígonos
  // sobrepostos e todas as linhas internas aparentes.
  showLoad&&showLoad('Fundindo a rampa com a caixa…');
  await ensurePolyClip();
  const fecha=r=>{
    const q=(r||[]).map(c=>[c[0],c[1]]);
    if(q.length){
      const a=q[0],b=q[q.length-1];
      if(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-8) q.push(a.slice());
    }
    return q;
  };
  const base=fecha(bocaR);
  const polys=[[base]];
  const polysRampa=[];
  feats.forEach(f=>{
    const rings=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
    if(rings&&rings.length){
      const poly=rings.map(fecha);
      polys.push(poly); polysRampa.push(poly);
    }
  });
  const rampaUniao=polygonClipping.union(...polysRampa.map(poly=>[poly]));
  const uniao=polygonClipping.union(...polys.map(poly=>[poly]));
  const contornos=mpToFeatures(uniao).map((f,i)=>{
    f.props=Object.assign({},f.props,{
      TIPO:'Contorno fundido',
      DECL_PCT:+p.rampaI.toFixed(1), LARG_M:+p.rampaW.toFixed(1),
      COMP_M:+rampaLen.toFixed(1), COTA_TOPO:+zTopoPista.toFixed(2),
      COTA_FUNDO:+zFundo.toFixed(2)
    });
    f.props.FID=i;
    return f;
  });
  /* Caixa e rampa são conectadas; portanto a obra deve possuir um único
     limite. Se uma operação booleana deixar algum fragmento numérico isolado,
     conserva-se o componente principal, de maior área. */
  contornos.sort((a,b)=>(b.props.AREA_M2||0)-(a.props.AREA_M2||0));
  const contorno=contornos.length?[contornos[0]]:[];
  if(!contorno.length) throw new Error('a união geométrica da caixa com a rampa ficou vazia');

  /* Reconstrói a cota do limite fundido. Os novos vértices criados nas
     interseções booleanas não existiam nas feições originais; a cota é
     interpolada no segmento de origem mais próximo. Em encontros de duas
     superfícies, prevalece a menor cota (superfície de corte/projeto). */
  const fontesZ=[];
  const incluiFonte=(ring,zs)=>{
    const r=fecha(ring); if(!r.length) return;
    let z=(zs||[]).slice();
    if(z.length===r.length-1) z.push(z[0]);
    while(z.length<r.length) z.push(z.length?z[z.length-1]:zMin);
    fontesZ.push({r,z});
  };
  incluiFonte(base,base.map(q=>{const z=sampleZbil(g,q[0],q[1]);return isFinite(z)?z:zMin;}));
  feats.forEach(f=>{
    const rs=(f.multi&&Array.isArray(f.geom[0]&&f.geom[0][0]))?f.geom:[f.geom];
    const zrs=(f.multi&&Array.isArray(f.zg&&f.zg[0]))?f.zg:[f.zg];
    rs.forEach((r,ri)=>incluiFonte(r,zrs[ri]||[]));
  });
  const zNoLimite=pt=>{
    let bd=Infinity,bz=NaN;
    fontesZ.forEach(F=>{
      for(let i=0;i<F.r.length-1;i++){
        const a=F.r[i],b=F.r[i+1],dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
        let t=den?((pt[0]-a[0])*dx+(pt[1]-a[1])*dy)/den:0;
        t=Math.max(0,Math.min(1,t));
        const qx=a[0]+t*dx,qy=a[1]+t*dy,d=(pt[0]-qx)**2+(pt[1]-qy)**2;
        const za=F.z[i],zb=F.z[i+1],z=isFinite(za)&&isFinite(zb)?za+t*(zb-za):(isFinite(za)?za:zb);
        if(d<bd-1e-8 || (Math.abs(d-bd)<=1e-8 && isFinite(z) && (!isFinite(bz)||z<bz))){
          bd=d;bz=z;
        }
      }
    });
    if(isFinite(bz)) return bz;
    const z=sampleZbil(g,pt[0],pt[1]); return isFinite(z)?z:zMin;
  };
  contorno.forEach(f=>{ f.zg=f.geom.map(r=>r.map(zNoLimite)); });
  // O contorno fundido elimina a sobreposição externa, mas o projeto precisa
  // continuar mostrando a caixa COMPLETA: fundo, aresta superior, pista e os
  // dois taludes. Copiamos essas superfícies 3D depois do contorno para que as
  // linhas internas fiquem visíveis e editáveis na mesma camada final.
  const internas=[];
  (Lv.features||[]).filter(f=>!/Boca|daylight/i.test(String((f.props||{}).TIPO||''))).forEach(f=>{
    const tipo=String((f.props||{}).TIPO||'');
    const zSecao=/Fundo/i.test(tipo)?zFundo:zMin;
    const rings=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
    const original=[rings.map(fecha)];
    let recortada;
    try{ recortada=polygonClipping.difference(original,rampaUniao); }
    catch(_){ recortada=original; }
    recortada.forEach(poly=>internas.push({
      geom:poly,multi:true,zg:poly.map(r=>r.map(()=>zSecao)),props:Object.assign({},f.props)
    }));
  });
  const rampas=feats.map(f=>({
    geom:f.geom, multi:f.multi, zg:f.zg, props:Object.assign({},f.props)
  }));
  /* A TIN elimina XY duplicado conservando a primeira ocorrência. Colocar as
     superfícies da rampa antes das seções antigas faz a cota escavada vencer
     exatamente nas interseções; depois entram caixa e limite externo. */
  const todas=rampas.concat(internas,contorno);
  const crs = Lv.crs || S.workCRS;
  const Lnovo = addLayer({
    name:'Bacia de retenção — caixa + rampa fundidas', gtype:'polygon', crs, features:todas,
    fields:[
      {name:'FID',type:'N',length:9,decimal:0},
      {name:'TIPO',type:'C',length:22,decimal:0},{name:'COTA_MIN',type:'N',length:10,decimal:2},
      {name:'COTA_FUNDO',type:'N',length:10,decimal:2},{name:'PROF_M',type:'N',length:8,decimal:2},
      {name:'AREA_M2',type:'N',length:14,decimal:1},{name:'DECL_PCT',type:'N',length:8,decimal:1},
      {name:'LARG_M',type:'N',length:8,decimal:1},{name:'COMP_M',type:'N',length:10,decimal:1},
      {name:'COTA_TOPO',type:'N',length:10,decimal:2},{name:'AREA_HA',type:'N',length:12,decimal:4},
      {name:'PERIM_M',type:'N',length:12,decimal:2}],
    color:'#c25b1a'
  });
  hideLoad&&hideLoad();
  if(Lnovo){
    Lnovo.fill=0.10; if(Lnovo.sym){Lnovo.sym.fill=0.10;}
    Lnovo._tinClipRings=contorno.flatMap(f=>f.geom.map(r=>r.map(q=>q.slice())));
    /* Descrição persistente da superfície única. O coletor TIN a usa para
       preencher o interior com cotas de projeto e impedir ligações diagonais
       entre seções que apenas se sobrepunham em planta. */
    Lnovo.tinSurface={
      kind:'bacia-rampa-v1',cs:g.cs||1,ctr:ctr.slice(),
      p:{P:p.P,angInt:p.angInt,angCorte:p.angCorte,bermOn:!!p.bermOn,
        talH:p.talH,bermW:p.bermW,bermMinH:p.bermMinH,talSym:!!p.talSym,C:p.C,L:p.L,ang:p.ang,
        extravasor:p.extravasor||null},
      fundoR:fecha(fundoR),arestaR:fecha(arestaProjeto),
      daylightR:base.map(q=>q.slice()),zFundo,zAresta:zMin,
      limites:contorno.flatMap(f=>f.geom.map(r=>r.map(q=>q.slice()))),
      rampa:{pFundo:pFundo.slice(),dirO:dirO.slice(),rampaLen,P:p.P,largura:p.rampaW,
        pista:pista.map(q=>q.slice()),lados:ladosInfo},
      extravasor:p.extravasor||null
    };
    try{ drawLayer(Lnovo); }catch(e){}
  }
  let Lsim=null;
  if(Lnovo){
    const antiga=BACIA.ultima&&BACIA.ultima.Lsim;
    if(antiga){ antiga.visible=false; try{ drawLayer(antiga); }catch(e){} }
    try{ Lsim=baciaCriaSimbolos(p,arestaProjeto,fundoR,base,zMin,zFundo,pista); }catch(e){}
    S.activeId=Lnovo.id;
  }
  // desliga a camada só-da-caixa (mantém no projeto, mas a nova é a boa)
  if(Lv){ Lv.visible=false; try{ drawLayer(Lv); }catch(e){} }
  refreshUI();
  // aponta a geometria da bacia para a NOVA camada e guarda a rampa (p/ MDT cortado)
  if(BACIA.ultima && BACIA.ultima.Lv===Lv){
    BACIA.ultima.Lv=Lnovo;
    BACIA.ultima.Lsim=Lsim;
    BACIA.ultima.rampaInfo={ pista: pista.slice(), pFundo:[pFundo[0],pFundo[1]], dirO:[dirO[0],dirO[1]], rampaLen, P:p.P };
  }
  const out=document.getElementById('bcOut');
  if(out) out.innerHTML+='<br><b>Rampa criada</b> · '+p.rampaW+' m × '+rampaLen.toFixed(1)+' m ('+p.rampaI+'%), taludes a '+p.angCorte+'°'+
    '<br><span style="color:var(--ink-dim)">Um único contorno externo; fundo, aresta, pista e taludes com Z por vértice, prontos para TIN e perfis.</span>';
  try{ baciaAtualizaBotaoMDT(); }catch(e){}
  toast('Caixa e rampa fundidas em uma única camada');
}

/* ==========================================================================
   RAMPA POR LINHAS DE QUEBRA — encontro real com o MDT

   A versão anterior criava polígonos de pista e dois polígonos de talude e
   depois tentava uni-los à caixa. Isso introduzia superfícies sobrepostas e
   arestas artificiais no TIN. A rampa agora é uma obra linear independente:
     • marcha sobre o MDT nas duas bordas e no eixo;
     • encontra, por bisseção, o primeiro ponto onde a cota de projeto alcança
       a cota do terreno;
     • corta cada borda na sua própria interseção;
     • cria somente linhas 3D: bordas, eixo, chegada e encontro com o terreno.
   A pista continua registrada em BACIA.ultima.rampaInfo para a geração do
   raster escavado, mas nenhum talude decorativo é criado.                    */
function baciaRampaIntersecao(g,pFundo,dirO,perp,afast,zFundo,decl,maxBase){
  const cel=Math.max(.25,Math.min(2,Math.max(g.cs||1,g.csy||g.cs||1)*.5));
  const maxD=Math.min(5000,Math.max(maxBase*4,maxBase+500,250));
  const ponto=s=>[pFundo[0]+dirO[0]*s+perp[0]*afast,
                   pFundo[1]+dirO[1]*s+perp[1]*afast];
  const amostra=s=>{
    const q=ponto(s),zt=sampleZbil(g,q[0],q[1]),zr=zFundo+decl*s;
    return {s,p:q,zt,zr,d:isFinite(zt)?zr-zt:NaN};
  };
  let ant=null,ultimo=null,melhor=null;
  for(let s=0;s<=maxD;s+=cel){
    const a=amostra(s); if(!isFinite(a.d))continue;
    ultimo=a;
    if(!melhor||Math.abs(a.d)<Math.abs(melhor.d))melhor=a;
    /* A rampa começa enterrada (d<0). A primeira mudança para d>=0 é o
       daylight real. Ignora um contato numérico no próprio pé. */
    if(ant&&ant.d<0&&a.d>=0&&a.s>cel){
      let lo=ant.s,hi=a.s;
      for(let k=0;k<24;k++){
        const mi=(lo+hi)/2,m=amostra(mi);
        if(!isFinite(m.d)){hi=mi;continue;}
        if(m.d>=0)hi=mi;else lo=mi;
      }
      const hit=amostra((lo+hi)/2);
      hit.zr=isFinite(hit.zt)?hit.zt:hit.zr; // fecha sem degrau no terreno
      return hit;
    }
    ant=a;
  }
  /* Um MDT recortado pode terminar antes do encontro. O perfil foi
     extrapolado por todo o trecho válido acima; recorta agora no ponto de
     menor diferença projeto–terreno, em vez de voltar ao comprimento teórico
     (que criava a ponta da rampa suspensa ou atravessando o terreno). */
  if(melhor) return Object.assign({},melhor,{zr:melhor.zt,fallback:true});
  const fb=amostra(Math.max(cel,Math.min(maxD,maxBase)));
  return Object.assign({},ultimo||fb,{fallback:true});
}

/* Linha de encontro do talude lateral da rampa com a superfície final.
   Em cada progressiva, parte do pé da pista e marcha transversalmente até o
   talude de corte alcançar a caixa/MDT. As pontas coincidem com a pista, por
   isso o polígono lateral é soldável ao daylight da caixa sem remendos. */
function baciaRampaTaludeLateral(g,p,ctr,fundoR,arestaR,bocaR,zFundo,zAresta,
  pFundo,dirO,perp,lado,largura,decl,comprimento){
  const tanC=Math.tan((p.angCorte||45)*Math.PI/180);
  const ds=Math.max(.5,Math.min(2,g.cs||1));
  const dt=Math.max(.35,Math.min(1.5,(g.cs||1)*.5));
  const n=Math.max(2,Math.ceil(comprimento/ds));
  const pe=[],encontro=[],zp=[],ze=[],ss=[];
  const superficie=(x,y)=>{
    const zt=sampleZbil(g,x,y);
    const zc=baciaCotaEng(x,y,ctr,p,fundoR,arestaR,bocaR,
      zFundo,zAresta,Number.isFinite(zt)?zt:Infinity);
    return Number.isFinite(zc)?zc:(Number.isFinite(zt)?zt:NaN);
  };
  /* Avaliação numa progressiva qualquer: o mesmo cálculo do laço principal,
     encapsulado para poder BISSECAR entre progressivas quando o encontro
     cruza uma linha de quebra da caixa (crista, berma, pé). */
  const avalia=s=>{
    const zr=zFundo+decl*s;
    const bx=pFundo[0]+dirO[0]*s+perp[0]*lado*largura;
    const by=pFundo[1]+dirO[1]*s+perp[1]*lado*largura;
    const B=[bx,by];
    let z0=superficie(bx,by),hit=B.slice(),zh=zr,achou=false;
    if(Number.isFinite(z0)&&z0>zr+.02){
      let ant={d:0,gap:zr-z0,p:B.slice(),zt:z0};
      let melhor={abs:Math.abs(ant.gap),p:B.slice(),zt:z0};
      const maxT=Math.max(50,Math.min(800,(z0-zr)/(tanC||1)*6+100));
      for(let d=dt;d<=maxT;d+=dt){
        const x=bx+perp[0]*lado*d,y=by+perp[1]*lado*d;
        const zt=superficie(x,y);if(!Number.isFinite(zt))break;
        const gap=zr+tanC*d-zt;
        if(Math.abs(gap)<melhor.abs)melhor={abs:Math.abs(gap),p:[x,y],zt};
        if(ant.gap<0&&gap>=0){
          let lo=ant.d,hi=d;
          for(let k=0;k<18;k++){
            const md=(lo+hi)/2,mx=bx+perp[0]*lado*md,my=by+perp[1]*lado*md;
            const mz=superficie(mx,my),mg=zr+tanC*md-mz;
            if(!Number.isFinite(mz)||mg>=0)hi=md;else lo=md;
          }
          const dd=(lo+hi)/2;
          hit=[bx+perp[0]*lado*dd,by+perp[1]*lado*dd];
          zh=superficie(hit[0],hit[1]);if(!Number.isFinite(zh))zh=zr+tanC*dd;
          achou=true;
          break;
        }
        ant={d,gap,p:[x,y],zt};
      }
      /* Se o recorte do MDT acaba antes da troca de sinal, não recolhe a
         crista para o pé da pista. Conserva o ponto extrapolado mais próximo
         da superfície, que é geometricamente muito mais estável e evita
         triângulos verticais/"voando" na borda. */
      if(!achou&&melhor&&melhor.p){
        hit=melhor.p.slice();zh=melhor.zt;
      }
    }
    return {B,zr,hit,zh};
  };
  for(let i=0;i<=n;i++){
    const s=comprimento*i/n, a=avalia(s);
    pe.push(a.B);zp.push(a.zr);encontro.push(a.hit);ze.push(a.zh);ss.push(s);
  }
  /* SEM CORDA NAS QUEBRAS: entre duas progressivas o encontro pode atravessar
     crista, berma ou pé da caixa; a corda mergulhava até ~1 m abaixo da linha
     ("arredondamento" que não existe no projeto). Para cada linha de quebra,
     acha-se por bisseção a progressiva em que o encontro cruza o anel em
     planta e insere-se ali um vértice EXATO — o mesmo ponto XYZ da quebra. */
  try{
    const fecha=r=>{const q=(r||[]).map(c=>[c[0],c[1]]);
      if(q.length&&Math.hypot(q[0][0]-q[q.length-1][0],q[0][1]-q[q.length-1][1])>1e-8)q.push(q[0].slice());
      return q;};
    const quebras=[fecha(arestaR),fecha(fundoR)];
    if(typeof bufferPoligono==='function'&&baciaUsaBermas(p,p.P)){
      const tanI=Math.tan(p.angInt*Math.PI/180);
      const dTot=baciaTaludeDistParaH(p.P,tanI,p);
      const nB=Math.floor((p.P-1e-7)/p.talH);
      for(let k=1;k<=nB;k++){
        const h=k*p.talH,dPe=h/tanI+(k-1)*p.bermW;
        const rPe=bufferPoligono(fecha(arestaR),-Math.max(0,dTot-dPe),false,8);
        const rCr=bufferPoligono(fecha(arestaR),-Math.max(0,dTot-dPe-p.bermW),false,8);
        if(rPe&&rPe.length>2)quebras.push(fecha(rPe));
        if(rCr&&rCr.length>2)quebras.push(fecha(rCr));
      }
    }
    /* BERMAS EXTERNAS: no corte alto o encontro escala a parede externa e
       cruza os anéis de berma (offset PARA FORA da crista). Sem esses anéis
       na lista, o encontro corta as bermas em corda e os quadriláteros do
       talude varrem por baixo das linhas. O alcance vem da altura que o
       encontro realmente atinge. */
    if(typeof bufferPoligono==='function'&&p.bermOn){
      let zeMax=-Infinity;for(let i=0;i<ze.length;i++)if(Number.isFinite(ze[i])&&ze[i]>zeMax)zeMax=ze[i];
      const hExt=zeMax-zAresta;
      if(baciaUsaBermas(p,hExt)){
        const kMax=Math.min(24,Math.floor((hExt-1e-7)/p.talH));
        for(let k=1;k<=kMax;k++){
          const h=k*p.talH,dPe=h/tanC+(k-1)*p.bermW;
          const rPe=bufferPoligono(fecha(arestaR),dPe,false,8);
          const rCr=bufferPoligono(fecha(arestaR),dPe+p.bermW,false,8);
          if(rPe&&rPe.length>2)quebras.push(fecha(rPe));
          if(rCr&&rCr.length>2)quebras.push(fecha(rCr));
        }
      }
    }
    const ladoDe=(pt,ring)=>baciaDentro(pt[0],pt[1],ring)?-1:1;
    quebras.forEach(ring=>{
      for(let i=encontro.length-1;i>=1;i--){
        const A=encontro[i-1],B=encontro[i];
        if(ladoDe(A,ring)===ladoDe(B,ring))continue;
        let lo=ss[i-1],hi=ss[i],eLo=A,alvo=ladoDe(A,ring);
        for(let k=0;k<22;k++){
          const sm=(lo+hi)/2,am=avalia(sm);
          if(ladoDe(am.hit,ring)===alvo){lo=sm;eLo=am.hit;}else hi=sm;
        }
        const sIns=(lo+hi)/2,aIns=avalia(sIns);
        /* A bisseção em s deixa o ponto a mícrons do anel; NÃO reprojetar no
           anel (em anéis grandes o ponto mais próximo pode saltar para outro
           trecho). Se por acaso ficou longe (tangência mal detectada), pula. */
        const q=aIns.hit;
        if(baciaDistRing(q[0],q[1],ring)>Math.max(0.5,(g.cs||1)))continue;
        const zq=superficie(q[0],q[1]);
        if(Math.hypot(q[0]-A[0],q[1]-A[1])<1e-6||Math.hypot(q[0]-B[0],q[1]-B[1])<1e-6)continue;
        encontro.splice(i,0,[q[0],q[1]]);
        ze.splice(i,0,Number.isFinite(zq)?zq:aIns.zh);
        pe.splice(i,0,aIns.B);
        zp.splice(i,0,aIns.zr);
        ss.splice(i,0,sIns);
      }
    });
  }catch(e){}
  const ring=pe.concat(encontro.slice().reverse());
  const zg=zp.concat(ze.slice().reverse());
  if(ring.length){ring.push(ring[0].slice());zg.push(zg[0]);}
  return {pe,encontro,zp,ze,ring,zg,lado};
}

function baciaMaiorAnel(mp){
  const fs=mpToFeatures(mp||[]);
  fs.sort((a,b)=>(b.props&&b.props.AREA_M2||0)-(a.props&&a.props.AREA_M2||0));
  if(!fs.length)return null;
  const f=fs[0],rings=(f.multi&&Array.isArray(f.geom&&f.geom[0]&&f.geom[0][0]))?f.geom:[f.geom];
  return rings&&rings[0]?rings[0].map(q=>q.slice()):null;
}

/* Converte TODAS as feições poligonais da caixa em linhas 3D. Nos pontos em
   que aresta/daylight atravessam o corredor da rampa, divide o segmento nas
   interseções e descarta somente o trecho interno à pista. Dessa forma a
   camada final conserva fundo, aresta e encontro com o terreno, mas não deixa
   linhas antigas cruzando por cima da rampa. */
function baciaConsolidaLinhas(feats,tol){
  tol=Math.max(1e-9,+tol||1e-7);
  const grupos=new Map(),soltas=[];
  (feats||[]).forEach((f,idx)=>{
    if(!f?.geom||f.geom.length<2)return;
    const zs=f.zg||[],z0=+zs[0],z1=+zs[zs.length-1],constante=Number.isFinite(z0)&&
      Number.isFinite(z1)&&Math.abs(z0-z1)<=1e-5;
    if(!constante){soltas.push(f);return;}
    const k=String(f.props?.ORIGEM||'')+'|'+String(f.props?.TIPO||'')+'|'+z0.toFixed(4);
    if(!grupos.has(k))grupos.set(k,[]);grupos.get(k).push(f);
  });
  const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  for(const fs of grupos.values()){
    const pend=fs.map(f=>({geom:f.geom.map(p=>p.slice()),zg:(f.zg||[]).slice(),
      multi:false,props:{...(f.props||{})}}));
    while(pend.length){
      const cur=pend.pop();let mudou=true;
      while(mudou){
        mudou=false;
        for(let i=0;i<pend.length;i++){
          const q=pend[i],a=cur.geom[0],b=cur.geom.at(-1),c=q.geom[0],d=q.geom.at(-1);
          if(dist(b,c)<=tol){
            q.geom[0]=b.slice();q.zg[0]=cur.zg.at(-1);
            cur.geom.push(...q.geom.slice(1));cur.zg.push(...q.zg.slice(1));
          }else if(dist(b,d)<=tol){
            q.geom.reverse();q.zg.reverse();q.geom[0]=b.slice();q.zg[0]=cur.zg.at(-1);
            cur.geom.push(...q.geom.slice(1));cur.zg.push(...q.zg.slice(1));
          }else if(dist(a,d)<=tol){
            q.geom[q.geom.length-1]=a.slice();q.zg[q.zg.length-1]=cur.zg[0];
            cur.geom=q.geom.slice(0,-1).concat(cur.geom);cur.zg=q.zg.slice(0,-1).concat(cur.zg);
          }else if(dist(a,c)<=tol){
            q.geom.reverse();q.zg.reverse();q.geom[q.geom.length-1]=a.slice();q.zg[q.zg.length-1]=cur.zg[0];
            cur.geom=q.geom.slice(0,-1).concat(cur.geom);cur.zg=q.zg.slice(0,-1).concat(cur.zg);
          }else continue;
          pend.splice(i,1);mudou=true;break;
        }
      }
      soltas.push(cur);
    }
  }
  return soltas;
}
function baciaCaixaParaLinhas(Lv,pista){
  const out=[];
  const cruzT=(a,b,c,d)=>{
    const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1];
    const den=rx*sy-ry*sx;if(Math.abs(den)<1e-12)return null;
    const qx=c[0]-a[0],qy=c[1]-a[1];
    const t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
    return t>1e-8&&t<1-1e-8&&u>=-1e-8&&u<=1+1e-8?t:null;
  };
  (Lv&&Lv.features||[]).forEach(f=>{
    const rings=(f.multi&&Array.isArray(f.geom&&f.geom[0]&&f.geom[0][0]))?f.geom:[f.geom];
    const zrs=(f.multi&&Array.isArray(f.zg&&f.zg[0]))?f.zg:[f.zg||[]];
    rings.forEach((ring,ri)=>{
      if(!ring||ring.length<2)return;const zs=zrs[ri]||[];
      for(let i=0;i<ring.length-1;i++){
        const a=ring[i],b=ring[i+1],za=isFinite(zs[i])?zs[i]:0,zb=isFinite(zs[i+1])?zs[i+1]:za;
        const ts=[0,1];
        for(let k=0;k<pista.length-1;k++){const t=cruzT(a,b,pista[k],pista[k+1]);if(t!=null)ts.push(t);}
        ts.sort((x,y)=>x-y);
        for(let k=0;k<ts.length-1;k++){
          const t0=ts[k],t1=ts[k+1];if(t1-t0<1e-8)continue;
          const tm=(t0+t1)/2,m=[a[0]+(b[0]-a[0])*tm,a[1]+(b[1]-a[1])*tm];
          if(baciaDentro(m[0],m[1],pista))continue;
          const p0=[a[0]+(b[0]-a[0])*t0,a[1]+(b[1]-a[1])*t0];
          const p1=[a[0]+(b[0]-a[0])*t1,a[1]+(b[1]-a[1])*t1];
          out.push({geom:[p0,p1],multi:false,zg:[za+(zb-za)*t0,za+(zb-za)*t1],
            props:Object.assign({},f.props,{ORIGEM:'Caixa'})});
        }
      }
    });
  });
  /* As bermas eram geradas originalmente segmento a segmento. A consolidação
     remove as falsas lacunas de renderização sem fechar o vão real da pista. */
  return baciaConsolidaLinhas(out,1e-6);
}

function baciaProjLinha(q,linha){
  let best=null;
  for(let i=1;i<(linha||[]).length;i++){
    const a=linha[i-1],b=linha[i],dx=b[0]-a[0],dy=b[1]-a[1],dd=dx*dx+dy*dy,
      t=Math.max(0,Math.min(1,dd?((q[0]-a[0])*dx+(q[1]-a[1])*dy)/dd:0)),
      p=[a[0]+dx*t,a[1]+dy*t],d=Math.hypot(q[0]-p[0],q[1]-p[1]);
    if(!best||d<best.d)best={p,d,i,t};
  }
  return best;
}
/* Insere o ponto na própria breakline. geom e zg são alterados juntos para
   que TIN, DXF e desenho 2D recebam a mesma topologia. */
function baciaInjetaPontoLinha(geom,zg,p,z,tol){
  const b=baciaProjLinha(p,geom);if(!b||b.d>tol)return null;
  const eps=Math.max(1e-8,tol*1e-5),q=[p[0],p[1]];
  if(Math.hypot(geom[b.i-1][0]-q[0],geom[b.i-1][1]-q[1])<=eps){
    geom[b.i-1]=q;if(zg)zg[b.i-1]=z;return q;
  }
  if(Math.hypot(geom[b.i][0]-q[0],geom[b.i][1]-q[1])<=eps){
    geom[b.i]=q;if(zg)zg[b.i]=z;return q;
  }
  geom.splice(b.i,0,q);if(zg)zg.splice(b.i,0,z);return q;
}
/* Projeta e insere no anel do limite; o retorno é o MESMO nó que deve ser
   atribuído ao extremo da crista/pé. */
function baciaSoldaPontoNoAnel(ring,p,tol){
  const b=baciaProjLinha(p,ring);if(!b||b.d>tol)return null;
  const q=b.p,eps=Math.max(1e-8,tol*1e-5);
  if(Math.hypot(ring[b.i-1][0]-q[0],ring[b.i-1][1]-q[1])<=eps)return ring[b.i-1].slice();
  if(Math.hypot(ring[b.i][0]-q[0],ring[b.i][1]-q[1])<=eps)return ring[b.i].slice();
  ring.splice(b.i,0,q.slice());return q.slice();
}
/* Curva de nível exata sobre o talude lateral da rampa. Cada quadrilátero é
   triangulado como no TIN e cortado pela cota da berma; as peças são depois
   encadeadas em uma breakline contínua. */
function baciaContornoTaludeCota(tal,z,props){
  const segs=[],eps=1e-8;
  const cortaTri=vs=>{
    const pts=[];
    const add=p=>{if(!pts.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<1e-7))pts.push(p);};
    for(let k=0;k<3;k++){
      const a=vs[k],b=vs[(k+1)%3],da=a[2]-z,db=b[2]-z;
      if(Math.abs(da)<=eps)add([a[0],a[1]]);
      if(Math.abs(db)<=eps)add([b[0],b[1]]);
      if(da*db<-eps*eps){const t=(z-a[2])/(b[2]-a[2]);add([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
    }
    if(pts.length<2)return;
    let aa=pts[0],bb=pts[1],bd=Math.hypot(aa[0]-bb[0],aa[1]-bb[1]);
    for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
      const d=Math.hypot(pts[i][0]-pts[j][0],pts[i][1]-pts[j][1]);
      if(d>bd){bd=d;aa=pts[i];bb=pts[j];}
    }
    if(bd>1e-7)segs.push({geom:[aa,bb],zg:[z,z],multi:false,props:{...props}});
  };
  const n=Math.min(tal.pe.length,tal.encontro.length,tal.zp.length,tal.ze.length);
  for(let i=0;i<n-1;i++){
    const a=[...tal.pe[i],tal.zp[i]],b=[...tal.pe[i+1],tal.zp[i+1]],
      c=[...tal.encontro[i+1],tal.ze[i+1]],d=[...tal.encontro[i],tal.ze[i]];
    cortaTri([a,b,c]);cortaTri([a,c,d]);
  }
  return baciaConsolidaLinhas(segs,1e-5);
}
function baciaBermasDaRampa(talE,talD,caixa,p,g){
  const niveis=new Map();
  (caixa||[]).forEach(f=>{
    const tipo=String(f.props?.TIPO||'');if(!/berma/i.test(tipo)||!f.zg?.length)return;
    const z=+f.zg[0];if(!Number.isFinite(z))return;
    const k=tipo+'|'+z.toFixed(4);if(!niveis.has(k))niveis.set(k,{tipo,z,ends:[]});
    const o=niveis.get(k);o.ends.push(f.geom[0],f.geom.at(-1));
  });
  const out=[],tol=Math.max(2,(g.cs||1)*4,(p.rampaW||0)*2,(p.bermW||0)*3);
  for(const nv of niveis.values()){
    const usados=new Set();
    [[talE,'esquerdo'],[talD,'direito']].forEach(([tal,lado])=>{
      const fs=baciaContornoTaludeCota(tal,nv.z,{ORIGEM:'Rampa',CLASSE:'Berma',
        TIPO:'Berma na cota '+nv.z.toFixed(2)+' m (lado '+lado+') — talude da rampa'});
      for(const f of fs){
        let soldouCaixa=false;
        for(const j of [0,f.geom.length-1]){
          let bi=-1,bd=Infinity;
          nv.ends.forEach((q,i)=>{if(usados.has(i))return;const d=Math.hypot(q[0]-f.geom[j][0],q[1]-f.geom[j][1]);if(d<bd){bd=d;bi=i;}});
          if(bi>=0&&bd<=tol){f.geom[j]=nv.ends[bi].slice();usados.add(bi);soldouCaixa=true;}
          const q=f.geom[j],bp=baciaProjLinha(q,tal.pe),bc=baciaProjLinha(q,tal.encontro);
          const alvo=!bc||(bp&&bp.d<=bc.d)?[tal.pe,tal.zp,bp]:[tal.encontro,tal.ze,bc];
          if(alvo[2]&&alvo[2].d<=tol)baciaInjetaPontoLinha(alvo[0],alvo[1],q,nv.z,tol);
        }
        /* Uma curva sem contato com a caixa seria apenas um fragmento
           interno do TIN, não a continuação pedida da berma. */
        if(soldouCaixa)out.push(f);
      }
    });
  }
  return out;
}

/* Solda 3D das linhas de quebra da bacia.
   Em projetos antigos, as bermas foram recortadas no plano e o limite foi
   amostrado separadamente no MDT. Os XY quase coincidiam, mas as cotas
   diferiam até vários metros: em planta parecia correto e, ao orbitar, a
   crista/pé ficava literalmente voando. Para cada extremidade livre procura
   no limite/rampa o ponto de MESMA COTA, injeta esse nó no hospedeiro e faz
   ambas as linhas compartilharem o mesmo XYZ. */
function baciaSoldaQuebras3D(L){
  const D=L&&L.tinSurface,P=D&&D.p,R=D&&D.rampa;
  if(!L||L.gtype!=='line'||!D||D.kind!=='bacia-rampa-v1')
    return {changed:false,nos:0,maxXY:0,maxDZ:0};
  const fs=L.features||[],tipo=f=>String(f?.props?.TIPO||''),
    hosts=fs.filter(f=>/^(?:Limite externo|Crista do talude (?:esquerdo|direito).*encontro com terreno|Pé do talude (?:esquerdo|direito) da rampa)$/i.test(tipo(f))&&
      Array.isArray(f.geom)&&f.geom.length>1&&Array.isArray(f.zg)),
    bermas=fs.filter(f=>/Berma (?:externa|interna)/i.test(tipo(f))&&
      String(f?.props?.ORIGEM||'')!=='Rampa'&&Array.isArray(f.geom)&&f.geom.length>1);
  if(!hosts.length||!bermas.length)return {changed:false,nos:0,maxXY:0,maxDZ:0};
  const cs=Math.max(.1,+D.cs||1),tolNo=Math.max(1e-7,cs*1e-6),
    tolBusca=Math.max(12,cs*20,+P?.bermW*4||0,+R?.largura*2||0),grupos=new Map();
  for(const f of bermas){const k=tipo(f);if(!grupos.has(k))grupos.set(k,[]);grupos.get(k).push(f);}
  let nos=0,maxXY=0,maxDZ=0;
  /* Candidatos são interseções da polilinha hospedeira com o plano horizontal
     z = cota da berma. Não vale projetar só em XY: esse era o defeito. */
  const candidatos=z=>{
    const out=[];
    for(const f of hosts)for(let i=1;i<f.geom.length;i++){
      const za=+f.zg[i-1],zb=+f.zg[i];if(!Number.isFinite(za)||!Number.isFinite(zb))continue;
      const dz=zb-za,ea=Math.abs(za-z)<=1e-8,eb=Math.abs(zb-z)<=1e-8;
      if(ea)out.push({f,i,t:0,p:f.geom[i-1].slice(),z});
      if(eb)out.push({f,i,t:1,p:f.geom[i].slice(),z});
      if(!ea&&!eb&&(za-z)*(zb-z)<0){const t=(z-za)/dz;
        out.push({f,i,t,p:[f.geom[i-1][0]+(f.geom[i][0]-f.geom[i-1][0])*t,
          f.geom[i-1][1]+(f.geom[i][1]-f.geom[i-1][1])*t],z});}
    }
    return out;
  };
  const injetaHost=c=>{
    const f=c.f,i=c.i,p=c.p,z=c.z,eps=Math.max(1e-8,tolNo*.1);
    if(Math.hypot(f.geom[i-1][0]-p[0],f.geom[i-1][1]-p[1])<=eps){f.geom[i-1]=p.slice();f.zg[i-1]=z;return;}
    if(Math.hypot(f.geom[i][0]-p[0],f.geom[i][1]-p[1])<=eps){f.geom[i]=p.slice();f.zg[i]=z;return;}
    f.geom.splice(i,0,p.slice());f.zg.splice(i,0,z);
  };
  for(const partes of grupos.values()){
    /* Os bancos salvos são segmentados em centenas de feições de 2 pontos.
       Grau 1 identifica somente as duas extremidades construtivas da cadeia. */
    const nd=[];
    const add=(f,ix)=>{const p=f.geom[ix],z=Array.isArray(f.zg)?+f.zg[ix]:NaN;
      let n=nd.find(q=>Math.hypot(q.p[0]-p[0],q.p[1]-p[1])<=tolNo);
      if(n)n.refs.push({f,ix,z});else nd.push({p:p.slice(),refs:[{f,ix,z}]});};
    partes.forEach(f=>{add(f,0);add(f,f.geom.length-1);});
    for(const n of nd.filter(q=>q.refs.length===1)){
      const ref=n.refs[0],z=ref.z;if(!Number.isFinite(z))continue;
      let best=null;
      for(const c of candidatos(z)){const d=Math.hypot(c.p[0]-n.p[0],c.p[1]-n.p[1]);
        if(!best||d<best.d)best={...c,d};}
      if(!best||best.d>tolBusca)continue;
      /* Mede o erro Z antigo no ponto XY mais próximo apenas para diagnóstico;
         a correção usa o encontro de mesma cota calculado acima. */
      let dzAntes=0,prox=null;
      for(const f of hosts)for(let i=1;i<f.geom.length;i++){
        const a=f.geom[i-1],b=f.geom[i],dx=b[0]-a[0],dy=b[1]-a[1],dd=dx*dx+dy*dy,
          t=Math.max(0,Math.min(1,dd?((n.p[0]-a[0])*dx+(n.p[1]-a[1])*dy)/dd:0)),
          d=Math.hypot(n.p[0]-a[0]-dx*t,n.p[1]-a[1]-dy*t);
        if(!prox||d<prox.d)prox={d,z:+f.zg[i-1]+(+f.zg[i]-+f.zg[i-1])*t};}
      if(prox&&Number.isFinite(prox.z))dzAntes=Math.abs(z-prox.z);
      injetaHost(best);ref.f.geom[ref.ix]=best.p.slice();
      if(Array.isArray(ref.f.zg))ref.f.zg[ref.ix]=z;
      nos++;maxXY=Math.max(maxXY,best.d);maxDZ=Math.max(maxDZ,dzAntes);
    }
  }
  if(nos)L._baciaTopoVersion=3;
  return {changed:nos>0,nos,maxXY,maxDZ};
}

/* Reconstitui as continuações das bermas sobre os taludes laterais da rampa.
   Além de atender às novas gerações, é deliberadamente idempotente para
   reparar projetos já salvos: remove somente continuações automáticas antigas,
   calcula a curva de mesma cota no talude e a solda ao extremo da caixa e às
   linhas de pé/crista da rampa com o mesmo nó XY/Z. */
function baciaReparaLinhasExistentes(L){
  const D=L&&L.tinSurface,R=D&&D.rampa,P=D&&D.p;
  if(!L||L.gtype!=='line'||!D||D.kind!=='bacia-rampa-v1'||!P)return {changed:false,added:0};
  let inter={changed:false,ok:false};
  /* Migração automática: projetos antigos guardavam o limite proveniente da
     união 2D. Ao abrir o projeto, localiza o MDT correspondente e refaz o
     produto construtivo pelo mesmo método da cava. A versão impede trabalho
     repetido em todo refresh. */
  if(+D.intersecaoVersion<2){
    const M=baciaMdtDaSuperficie(L);
    if(M&&M.d)try{inter=baciaAplicaIntersecaoSuperficie(L,M.d,{soldar:false});}catch(e){
      console.warn('reparo da interseção por superfície da bacia',e);}
  }
  else if(!L._baciaIntersecao){
    L._baciaIntersecao={version:2,metodo:D.intersecaoMetodo||'superfície completa da bacia × MDT',
      nos:+D.intersecaoNos||0};
  }
  if(!R)return {changed:!!inter.changed,added:0,intersecao:inter};
  const acha=re=>(L.features||[]).find(f=>re.test(String(f.props?.TIPO||''))),
    peE=acha(/^Pé do talude esquerdo da rampa$/i),
    crE=acha(/^Crista do talude esquerdo .*encontro com terreno$/i),
    peD=acha(/^Pé do talude direito da rampa$/i),
    crD=acha(/^Crista do talude direito .*encontro com terreno$/i);
  if(!peE||!crE||!peD||!crD)return {changed:!!inter.changed,added:0,intersecao:inter};
  const auto=f=>f&&((f._baciaAutoInter===1)||
      (String(f.props?.ORIGEM||'')==='Rampa'&&/Berma na cota .*talude da rampa/i.test(String(f.props?.TIPO||'')))),
    atuais=(L.features||[]).filter(auto),base=(L.features||[]).filter(f=>!auto(f)),
    caixa=base.filter(f=>/Berma (?:externa|interna)/i.test(String(f.props?.TIPO||''))&&
      String(f.props?.ORIGEM||'')!=='Rampa'),
    talE={pe:peE.geom,zp:peE.zg||[],encontro:crE.geom,ze:crE.zg||[]},
    talD={pe:peD.geom,zp:peD.zg||[],encontro:crD.geom,ze:crD.zg||[]},
    p={...P,rampaW:+R.largura||+R.rampaW||0},g={cs:+D.cs||1},
    novas=baciaBermasDaRampa(talE,talD,caixa,p,g)||[];
  if(novas.length){
    novas.forEach(f=>{f._baciaAutoInter=1;f.props={...(f.props||{}),ORIGEM:'Rampa',CLASSE:'Berma'};});
    L.features=base.concat(novas);
  }
  const solda=baciaSoldaQuebras3D(L),mudouAuto=novas.length>0&&atuais.length!==novas.length;
  if(novas.length&&!solda.changed)L._baciaTopoVersion=Math.max(2,+L._baciaTopoVersion||0);
  return {changed:!!inter.changed||mudouAuto||solda.changed,added:novas.length,replaced:atuais.length,
    nos:solda.nos,maxXY:solda.maxXY,maxDZ:solda.maxDZ,intersecao:inter};
}

baciaGeraRampa = async function(Lv,p,ctr,fundoR,bocaR,zFundo,zMin,pDest,dirForcada){
  const g=p.g;
  /* Remove automaticamente a representação decorativa criada por versões
     anteriores deste comando; preserva as linhas e superfícies de engenharia. */
  (S.layers||[]).filter(L=>/^Bermas e simbologia de taludes — bacia$/i.test(L.name||'')).forEach(L=>{
    try{if(L.llayer)map.removeLayer(L.llayer);}catch(e){}
    const i=S.layers.indexOf(L);if(i>=0)S.layers.splice(i,1);
  });
  let dx=pDest[0]-ctr[0],dy=pDest[1]-ctr[1],dn=Math.hypot(dx,dy)||1;
  const dirO=(dirForcada&&isFinite(dirForcada[0])&&isFinite(dirForcada[1]))
    ?[dirForcada[0],dirForcada[1]]:[dx/dn,dy/dn];
  const dl=Math.hypot(dirO[0],dirO[1])||1;dirO[0]/=dl;dirO[1]/=dl;
  const perp=[-dirO[1],dirO[0]],hw=Math.max(.1,p.rampaW/2);
  const decl=Math.max(.0001,p.rampaI/100);
  const baseLen=Math.max(1,p.P/decl);
  const pFundo=[pDest[0],pDest[1]];

  showLoad&&showLoad('Cortando a rampa na interseção com o terreno…');
  await new Promise(r=>setTimeout(r,20));
  const esq=baciaRampaIntersecao(g,pFundo,dirO,perp,+hw,zFundo,decl,baseLen);
  const eixo=baciaRampaIntersecao(g,pFundo,dirO,perp,0,zFundo,decl,baseLen);
  const dir=baciaRampaIntersecao(g,pFundo,dirO,perp,-hw,zFundo,decl,baseLen);
  await ensurePolyClip();
  const peE=[pFundo[0]+perp[0]*hw,pFundo[1]+perp[1]*hw];
  const peD=[pFundo[0]-perp[0]*hw,pFundo[1]-perp[1]*hw];
  const arestaR=(BACIA.ultima&&BACIA.ultima.arestaR)||fundoR;
  const talE=baciaRampaTaludeLateral(g,p,ctr,fundoR,arestaR,bocaR,zFundo,zMin,
    pFundo,dirO,perp,+1,hw,decl,esq.s);
  const talD=baciaRampaTaludeLateral(g,p,ctr,fundoR,arestaR,bocaR,zFundo,zMin,
    pFundo,dirO,perp,-1,hw,decl,dir.s);
  const props=(tipo,comp)=>({TIPO:tipo,DECL_PCT:+p.rampaI.toFixed(2),
    LARG_M:+p.rampaW.toFixed(2),COMP_M:+comp.toFixed(2),
    COTA_INI:+zFundo.toFixed(2),COTA_FIM:+(zFundo+decl*comp).toFixed(2)});
  const featsRampa=[
    {geom:talE.pe,multi:false,zg:talE.zp,props:props('Pé do talude esquerdo da rampa',esq.s)},
    {geom:talE.encontro,multi:false,zg:talE.ze,
      props:props('Crista do talude esquerdo — encontro com terreno',esq.s)},
    {geom:[pFundo,eixo.p],multi:false,zg:[zFundo,eixo.zr],props:props('Eixo da rampa',eixo.s)},
    {geom:talD.pe,multi:false,zg:talD.zp,props:props('Pé do talude direito da rampa',dir.s)},
    {geom:talD.encontro,multi:false,zg:talD.ze,
      props:props('Crista do talude direito — encontro com terreno',dir.s)},
    {geom:[peE,pFundo,peD],multi:false,zg:[zFundo,zFundo,zFundo],
      props:Object.assign(props('Chegada no fundo',p.rampaW),{COTA_FIM:+zFundo.toFixed(2)})}
  ];
  featsRampa.forEach(f=>f.props.ORIGEM='Rampa');
  const pista=[peE,esq.p,dir.p,peD,peE.slice()];
  const fechaR=r=>{
    const q=(r||[]).map(p=>[p[0],p[1]]);
    if(q.length&&Math.hypot(q[0][0]-q[q.length-1][0],q[0][1]-q[q.length-1][1])>1e-8)
      q.push(q[0].slice());
    return q;
  };
  const baseR=fechaR(bocaR),pistaR=fechaR(pista),talER=fechaR(talE.ring),talDR=fechaR(talD.ring);
  const uniaoRampa=polygonClipping.union([[pistaR]],[[talER]],[[talDR]]);
  const corredor=baciaMaiorAnel(uniaoRampa)||pistaR;
  const uniaoTotal=polygonClipping.union([[baseR]],[[talER]],[[talDR]],[[pistaR]]);
  const limiteUnico=baciaMaiorAnel(uniaoTotal)||baseR;
  /* Solda a geometria linear no MESMO limite que recorta a superfície.
     O eixo era calculado separadamente no MDT e, em terreno irregular, seu
     último ponto podia parar alguns metros antes/depois do contorno fundido. */
  const raioLimite=(orig,vet,ring)=>{
    let best=null,bestT=Infinity;
    for(let i=0;i<ring.length-1;i++){
      const a=ring[i],b=ring[i+1],sx=b[0]-a[0],sy=b[1]-a[1];
      const den=vet[0]*sy-vet[1]*sx;if(Math.abs(den)<1e-12)continue;
      const qx=a[0]-orig[0],qy=a[1]-orig[1];
      const t=(qx*sy-qy*sx)/den,u=(qx*vet[1]-qy*vet[0])/den;
      if(t>1e-7&&u>=-1e-7&&u<=1+1e-7&&t<bestT){
        bestT=t;best=[orig[0]+vet[0]*t,orig[1]+vet[1]*t];
      }
    }
    return best;
  };
  const tolSolda=Math.max(.05,Math.min(2,(g.cs||1)*.75));
  let eixoLim=raioLimite(pFundo,dirO,limiteUnico)||
    baciaPontoMaisProximoRing(eixo.p,limiteUnico)||eixo.p;
  eixoLim=baciaSoldaPontoNoAnel(limiteUnico,eixoLim,tolSolda)||eixoLim;
  const eixoLenFinal=Math.hypot(eixoLim[0]-pFundo[0],eixoLim[1]-pFundo[1]);
  const eixoFeat=featsRampa.find(f=>/^Eixo da rampa$/i.test(String((f.props||{}).TIPO||'')));
  if(eixoFeat){
    const ze=sampleZbil(g,eixoLim[0],eixoLim[1]);
    eixoFeat.geom=[pFundo.slice(),eixoLim.slice()];
    eixoFeat.zg=[zFundo,Number.isFinite(ze)?ze:zFundo+decl*Math.hypot(eixoLim[0]-pFundo[0],eixoLim[1]-pFundo[1])];
    eixoFeat.props.COMP_M=+eixoLenFinal.toFixed(2);
    eixoFeat.props.COTA_FIM=+eixoFeat.zg[1].toFixed(2);
  }
  /* As duas bordas da pista também daylightam no limite. Antes elas eram
     calculadas numa marcha separada e podiam terminar a centímetros do anel. */
  [[talE,esq,1],[talD,dir,2]].forEach(([tal,hitP,ip])=>{
    if(!tal.pe.length)return;const j=tal.pe.length-1,
      q=baciaSoldaPontoNoAnel(limiteUnico,tal.pe[j],tolSolda);
    if(!q)return;
    tal.pe[j]=q.slice();hitP.p=q.slice();pista[ip]=q.slice();
    const z=sampleZbil(g,q[0],q[1]);if(Number.isFinite(z))tal.zp[j]=z;
  });
  /* A primeira ponta das cristas coincide com a chegada no fundo; a última
     é projetada no limite externo. Assim nenhuma linha de quebra fica com
     extremidade livre dentro da superfície. */
  [[talE,'esquerdo'],[talD,'direito']].forEach(([tal,lado])=>{
    const f=featsRampa.find(q=>new RegExp('^Crista do talude '+lado,'i')
      .test(String((q.props||{}).TIPO||'')));
    if(!f||!f.geom||!f.geom.length)return;
    f.geom[0]=(lado==='esquerdo'?peE:peD).slice();
    f.zg[0]=zFundo;
    const j=f.geom.length-1,hit=baciaSoldaPontoNoAnel(limiteUnico,f.geom[j],tolSolda);
    if(hit){
      f.geom[j]=hit;
      const zh=sampleZbil(g,hit[0],hit[1]);
      if(Number.isFinite(zh))f.zg[j]=zh;
    }
  });
  /* Guarda geométrica obrigatória: o limite fundido só é aceito se contiver
     todas as linhas de pé/crista dos taludes laterais, se as cristas nascerem
     exatamente nos pés da chegada e se terminarem no próprio limite. */
  {
    const tol=Math.max(.05,Math.min(1,(g.cs||1)*.5)),
      valida=baciaValidaQuebrasLimite(limiteUnico,talE,talD,peE,peD,tol);
    if(!valida.ok){hideLoad&&hideLoad();throw new Error('Limite da bacia inválido: '+valida.falhas.join('; '));}
  }
  const limiteZ=limiteUnico.map(q=>{
    const z=sampleZbil(g,q[0],q[1]);return Number.isFinite(z)?z:zMin;
  });
  featsRampa.push({geom:limiteUnico,multi:false,zg:limiteZ,
    props:Object.assign(props('Limite externo',eixoLenFinal),
      {ORIGEM:'Caixa + rampa'})});
  const semIntersecao=baciaCaixaParaLinhas(Lv,corredor).filter(f=>
    !/encontro com terreno|daylight|boca/i.test(String((f.props||{}).TIPO||'')));
  /* Consolida também os pés/cristas das bermas. Os cílios nunca entram aqui:
     eles não são mais gerados, enquanto as linhas de quebra permanecem. */
  const Lengenharia=BACIA.ultima&&BACIA.ultima.Lsim;
  const linhasEng=Lengenharia?baciaCaixaParaLinhas(Lengenharia,corredor):[];
  /* Na camada consolidada atual, as bermas da caixa já foram incorporadas a
     semIntersecao e Lsim é nula. Usar apenas Lsim deixava a continuidade sem
     nenhuma cota de referência. A própria caixa recortada é agora a fonte
     oficial; Lsim permanece somente como compatibilidade com projetos antigos. */
  const linhasFonteBermas=linhasEng.length?linhasEng:semIntersecao;
  /* As cotas das bermas da caixa são continuadas sobre os dois taludes
     laterais da rampa. O extremo é soldado ao extremo recortado da caixa e
     simultaneamente inserido na crista ou no pé da rampa. */
  const bermasRampa=baciaBermasDaRampa(talE,talD,linhasFonteBermas,p,g);
  const feats=semIntersecao.concat(linhasEng).concat(bermasRampa).concat(featsRampa);
  /* A rampa atualiza a própria camada da caixa. Não cria camada poligonal de
     limite nem uma segunda camada de cristas/pés: todo o projeto construtivo
     permanece em UMA camada de linhas, abertas e fechadas. */
  const Lr=Lv;
  if(Lr){
    Lr.name=(String(Lr.name||'Bacia de retenção').replace(/\s+—\s+linhas.*$/i,''))+' — linhas';
    Lr.gtype='line';Lr.features=feats;
    Lr.fields=[
      {name:'ORIGEM',type:'C',length:12,decimal:0},
      {name:'TIPO',type:'C',length:50,decimal:0},
      {name:'DECL_PCT',type:'N',length:9,decimal:2},
      {name:'LARG_M',type:'N',length:9,decimal:2},
      {name:'COMP_M',type:'N',length:12,decimal:2},
      {name:'COTA_INI',type:'N',length:12,decimal:2},
      {name:'COTA_FIM',type:'N',length:12,decimal:2}
    ];
    Lr.color='#e46d1a';Lr.weight=3;if(Lr.sym){Lr.sym.color='#e46d1a';Lr.sym.weight=3;Lr.sym.fill=0;}
    Lr._tinClipRings=[limiteUnico.map(q=>q.slice())];
    try{drawLayer(Lr);}catch(e){}
    S.activeId=Lr.id;
  }
  /* Polígono técnico apenas em memória para recortar o raster da pista.
     Não entra como feição e não aparece no painel de camadas. */
  const rampaInfo={
    pista:pista.map(q=>q.slice()),pFundo:pFundo.slice(),dirO:dirO.slice(),
    perp:perp.slice(),hw,ir:decl,sLeft:esq.s,sCenter:eixoLenFinal,sRight:dir.s,
    rampaLen:eixoLenFinal,P:decl*eixoLenFinal,largura:p.rampaW,tanC:Math.tan((p.angCorte||45)*Math.PI/180),
    corredor:corredor.map(q=>q.slice()),limiteUnico:limiteUnico.map(q=>q.slice()),
    taludes:{esq:talE.encontro.map(q=>q.slice()),dir:talD.encontro.map(q=>q.slice())},
    interseccao:limiteUnico.map(q=>q.slice()),bermasContinuadas:bermasRampa.length
  };
  if(BACIA.ultima&&BACIA.ultima.Lv===Lv){
    /* A descrição analítica fica na camada da CAIXA para que TIN, perfis e
       relatório continuem reconhecendo a superfície final. A camada nova da
       rampa permanece estritamente linear, como linha de quebra. */
    const descricaoSuperficie={
      kind:'bacia-rampa-v1',cs:g.cs||1,ctr:ctr.slice(),
      p:{P:p.P,angInt:p.angInt,angCorte:p.angCorte,bermOn:!!p.bermOn,
        talH:p.talH,bermW:p.bermW,bermMinH:p.bermMinH,talSym:false,C:p.C,L:p.L,ang:p.ang,
        extravasor:p.extravasor||null},
      fundoR:(fundoR||[]).map(q=>q.slice()),
      arestaR:(BACIA.ultima.arestaR||[]).map(q=>q.slice()),
      daylightR:limiteUnico.map(q=>q.slice()),zFundo,zAresta:zMin,
      limites:[limiteUnico.map(q=>q.slice())],
      rampa:rampaInfo,extravasor:p.extravasor||null
    };
    if(Lv) Lv.tinSurface=descricaoSuperficie;
    if(Lr){
      Lr.tinSurface=descricaoSuperficie;
      /* A união poligonal acima é apenas o domínio provisório necessário
         para montar a superfície. O limite definitivo vem agora do encontro
         superfície completa × MDT; depois as continuações de bermas usam os
         novos nós de crista/pé já recortados. */
      /* O daylight nasce do encontro da superfície de projeto com o TERRENO.
         Numa caixa puramente vetorial não existe terreno para encontrar: o
         limite continua sendo o da própria caixa e a rampa é gerada assim
         mesmo, em vez de abortar pedindo um MDT que o projeto não tem. */
      const semTerreno=!g||g.vazia;
      const interSup=semTerreno? {ok:false,semTerreno:true}
                               : baciaAplicaIntersecaoSuperficie(Lr,g,{soldar:false});
      if(!interSup.ok && !semTerreno){hideLoad&&hideLoad();throw new Error('Interseção da bacia com o MDT não fechou: '+
        (interSup.erro||'contato insuficiente'));}
      if(interSup.ok){
        limiteUnico.splice(0,limiteUnico.length,...interSup.ring.map(q=>q.slice()));
        rampaInfo.limiteUnico=interSup.ring.map(q=>q.slice());
        rampaInfo.interseccao=interSup.ring.map(q=>q.slice());
        BACIA.ultima.daylightR=interSup.ring.map(q=>q.slice());
      }else{
        rampaInfo.limiteUnico=limiteUnico.map(q=>q.slice());
        rampaInfo.semTerreno=true;
        BACIA.ultima.daylightR=limiteUnico.map(q=>q.slice());
        try{ cmdLog('Rampa gerada sem MDT: o limite externo é o da própria caixa (sem linha de daylight).','avisa'); }catch(e){}
      }
      const repTopo=baciaReparaLinhasExistentes(Lr);
      const interFinal=semTerreno? {ok:false} : baciaAplicaIntersecaoSuperficie(Lr,g);
      if(interFinal.ok){
        limiteUnico.splice(0,limiteUnico.length,...interFinal.ring.map(q=>q.slice()));
        rampaInfo.limiteUnico=interFinal.ring.map(q=>q.slice());
        rampaInfo.interseccao=interFinal.ring.map(q=>q.slice());
      }
      if(repTopo.changed)try{drawLayer(Lr);}catch(e){}
    }
    BACIA.ultima.Lrampa=Lr;
    BACIA.ultima.Lfinal=Lr;
    BACIA.ultima.rampaInfo=rampaInfo;
    BACIA.ultima.daylightR=limiteUnico.map(q=>q.slice());
    /* Não existe camada visual auxiliar: pés, cristas e bermas já estão
       incorporados à camada linear final. */
    BACIA.ultima.Lsim=null;
  }
  /* CORTE NO 3D: com a rampa, a linha de interseção vira o limite fundido
     (daylight + boca da rampa). O furo do terreno passa a apontar para a
     camada de linhas finais, cujos limites já são esse anel. */
  try{ baciaLigaFuroTerreno(g,Lr||Lv); }catch(e){}
  /* A camada linear única permanece visível e alimenta TIN, perfis e DXF. */
  if(Lv){Lv.visible=true;try{drawLayer(Lv);}catch(e){}}
  if(Lengenharia&&Lengenharia!==Lv){
    try{if(Lengenharia.llayer)map.removeLayer(Lengenharia.llayer);}catch(e){}
    const ix=S.layers.indexOf(Lengenharia);if(ix>=0)S.layers.splice(ix,1);
  }
  hideLoad&&hideLoad();refreshUI();
  const fallback=[esq,eixo,dir].some(h=>h.fallback);
  const out=document.getElementById('bcOut');
  if(out)out.innerHTML+='<br><b>Camada final da caixa e rampa criada em linhas 3D</b> · largura '+
    p.rampaW+' m · declividade '+p.rampaI+'% · eixo '+eixo.s.toFixed(1)+' m'+
    (bermasRampa.length?'<br><b>Bermas da rampa:</b> '+bermasRampa.length+
      ' linha(s) de mesma cota unida(s) às bermas da caixa.':'')+
    '<br><span style="color:var(--ink-dim)">Inclui fundo, pés, cristas, bermas, chegada, eixo, bordas e encontro com o MDT. Somente os cílios decorativos foram retirados.</span>'+
    (fallback?'<br><span style="color:#d88900">⚠ Parte do encontro ficou fora/sem dados no MDT; nessa borda foi mantido o comprimento de projeto.</span>':'');
  try{baciaAtualizaBotaoMDT();}catch(e){}
  toast(fallback?'Camada única criada; confira a borda sem dados no MDT':'Caixa e rampa intersectadas com o MDT em uma única camada de linhas');
  return Lr;
};

/* linha de daylight: para cada vértice da boca, marcha ao longo da normal
   externa; a cota do talude de corte sobe com tan(angCorte). O ponto onde essa
   cota alcança o terreno é o daylight daquele vértice.                        */
/* linha de daylight (boca): para cada vértice da ARESTA superior (cota fixa
   zAresta), o talude de corte sobe para fora com tan(angCorte) a partir de
   zAresta. O daylight é onde essa cota alcança o terreno.
   - lado ALTO (terreno acima da aresta): há corte; marcha até cruzar.
   - lado BAIXO (terreno abaixo/igual): não há corte — o daylight coincide com
     a própria aresta (a estrutura emerge; ali seria aterro, tratado à parte).  */
function baciaDaylight(arestaR, ctr, g, zgAresta, p){
  const tanC=Math.tan(p.angCorte*Math.PI/180);
  const m=arestaR.length-1;                          // último = 1º (fechado)
  const z0=zgAresta[0];                              // cota única da aresta (zAresta)
  const cell=Math.max(0.5, g.cs||1);
  const passoD=Math.max(0.5, cell*0.5);              // passo da marcha para fora
  const maxD=800;
  /* Normal externa em cada lado e em cada vértice. Interpolar as normais ao
     longo do lado evita o salto no canto que antes ligava dois daylight por
     uma diagonal reta. */
  const normais=[];
  for(let i=0;i<m;i++){
    const A=arestaR[i],B=arestaR[i+1],dx=B[0]-A[0],dy=B[1]-A[1],L=Math.hypot(dx,dy)||1;
    let nx=-dy/L,ny=dx/L;
    const mx=(A[0]+B[0])/2,my=(A[1]+B[1])/2;
    if((mx-ctr[0])*nx+(my-ctr[1])*ny<0){nx=-nx;ny=-ny;}
    normais.push([nx,ny]);
  }
  const normVert=[];
  for(let i=0;i<m;i++){
    const a=normais[(i-1+m)%m],b=normais[i],nx=a[0]+b[0],ny=a[1]+b[1],L=Math.hypot(nx,ny)||1;
    normVert.push([nx/L,ny/L]);
  }
  // Marcha sobre o MDT e refina a interseção talude–terreno por bisseção.
  const daylightEm=(Q, nx, ny)=>{
    const ztVert=sampleZbil(g,Q[0],Q[1]);
    if(isFinite(ztVert) && ztVert <= z0 + 1e-3) return Q.slice();   // terreno ≤ aresta: sem corte
    let prevGap=null, prevPt=null,bestPt=Q.slice(),bestAbs=Infinity,lastValid=Q.slice();
    for(let d=0; d<=maxD; d+=passoD){
      const x=Q[0]+nx*d, y=Q[1]+ny*d;
      const zt=sampleZbil(g,x,y); if(!isFinite(zt)) break;
      const hAlvo=Math.max(0,zt-z0);
      const zc=z0+baciaTaludeHEmDist(d,tanC,p,hAlvo);
      const gap=zc-zt;
      lastValid=[x,y];
      if(Math.abs(gap)<bestAbs){bestAbs=Math.abs(gap);bestPt=[x,y];}
      if(gap>=0 && prevGap!=null && prevGap<0){
        let lo=0,hi=1;
        for(let j=0;j<32;j++){ /* nó exato: mesmo refino da cava */
          const tt=(lo+hi)/2,xx=prevPt[0]+(x-prevPt[0])*tt,yy=prevPt[1]+(y-prevPt[1])*tt;
          const zz=sampleZbil(g,xx,yy),dd=Math.hypot(xx-Q[0],yy-Q[1]);
          const hh=Math.max(0,zz-z0),gg=z0+baciaTaludeHEmDist(dd,tanC,p,hh)-zz;
          if(gg>=0)hi=tt;else lo=tt;
        }
        const tt=(lo+hi)/2;
        return [prevPt[0]+(x-prevPt[0])*tt,prevPt[1]+(y-prevPt[1])*tt];
      }
      prevGap=gap; prevPt=[x,y];
    }
    /* Se o MDT termina ou não há cruzamento dentro do alcance, conserva o
       ponto de menor diferença (ou o último ponto válido). Nunca volta
       silenciosamente à aresta, comportamento que criava o lado reto. */
    return bestAbs<Infinity?bestPt:lastValid;
  };
  const out=[];
  for(let i=0;i<m;i++){
    const A=arestaR[i], B=arestaR[i+1];
    const segLen=Math.hypot(B[0]-A[0], B[1]-A[1]);
    // densifica o lado: 1 ponto a cada ~célula (mín. 2)
    const nSub=Math.max(2, Math.ceil(segLen/cell));
    for(let s=0;s<nSub;s++){                          // inclui A, exclui B (B entra no próximo lado)
      const t=s/nSub;
      const Q=[A[0]+(B[0]-A[0])*t, A[1]+(B[1]-A[1])*t];
      const n0=normVert[i],n1=normVert[(i+1)%m];
      let nx=n0[0]*(1-t)+n1[0]*t,ny=n0[1]*(1-t)+n1[1]*t;
      const nl=Math.hypot(nx,ny)||1;nx/=nl;ny/=nl;
      out.push(daylightEm(Q, nx, ny));
    }
  }
  out.push(out[0].slice());                           // fecha o anel
  return out;
}

function drenClick(latlng){

  if(!S._drenBuf) S._drenBuf=[];
  // Guard contra DUPLO registro: um mesmo toque dispara pointerup (backstop) E
  // click (Leaflet). Sem isto, cada vértice virava um PAR de pontos a ~0,1 m,
  // que se acumulavam visualmente. Ignora um 2º disparo dentro de 350 ms.
  const agora=Date.now();
  if(S._drenLastClick && (agora-S._drenLastClick)<350) return;
  S._drenLastClick=agora;
  // snap: atrai a ponta para vértices visíveis (inclui as feições de drenagem já traçadas)
  if(S.snapOn && typeof snapLatLng==='function'){
    try{ const s=snapLatLng(latlng); if(s&&s.latlng){ latlng=s.latlng; if(s.snapped) cmdLog('↳ snap em vértice','info'); } }catch(e){}
  }
  // descarta ponto praticamente em cima do anterior (evita micro-duplicatas)
  const buf=S._drenBuf;
  if(buf.length){
    const prev=buf[buf.length-1];
    const cprev=fromWGS(S.workCRS, prev[1], prev[0]);
    const cnow=fromWGS(S.workCRS, latlng.lng, latlng.lat);
    if(Math.hypot(cnow[0]-cprev[0], cnow[1]-cprev[1])<0.20){ return; }   // < 20 cm: ignora
  }
  S._drenBuf.push([latlng.lat,latlng.lng]);
  drenRedrawTmp();
  // prévia da cota no ponto tocado
  const d=drenGrade(); if(d){ const c=fromWGS(S.workCRS,latlng.lng,latlng.lat); let z=null;
    try{ z=sampleZbil(d,c[0],c[1]); }catch(e){}
    cmdLog(`ponto ${S._drenBuf.length}${z!=null?` · cota ${z.toFixed(2)} m`:''}`,'info'); }
}
function drenFinaliza(){
  const buf=S._drenBuf||[];
  if(S._drenTmp){ try{ map.removeLayer(S._drenTmp); }catch(e){} S._drenTmp=null; }
  S._drenBuf=null;
  try{ setTool('select'); }catch(e){ S.tool='select'; }
  const b=document.getElementById('btnDrenDraw'); if(b) b.textContent='✏ Desenhar feição';
  if(buf.length<2){ toast('A feição precisa de ao menos 2 pontos'); return; }
  const tipoKey=S._drenTipo||'dreno';
  const d=drenGrade();
  let ptsCRS=buf.map(([lat,lng])=>{ const c=fromWGS(S.workCRS,lng,lat); return [c[0],c[1]]; });
  ptsCRS=drenLimpaVertices(ptsCRS);       // remove vértices redundantes (< 20 cm) e colineares
  if(ptsCRS.length<2){ toast('A feição precisa de ao menos 2 pontos distintos'); return; }
  const G=drenDadosGeom(ptsCRS, d);
  const rev=DREN_TIPOS[tipoKey].rev || (document.getElementById('drenRevest')||{}).value || 'Concreto liso';
  const secao=drenSecaoPadraoStr(tipoKey);
  const feat={geom:ptsCRS, multi:true, zg:G.z.map(v=>v==null?NaN:v),
    props:{ NOME:(S._drenNome||DREN_TIPOS[tipoKey].nome+' 1'), TIPO:DREN_TIPOS[tipoKey].nome, REVEST:rev,
      COTA_INI:G.COTA_INI, COTA_FIM:G.COTA_FIM, DESNIVEL_M:G.DESNIVEL_M,
      COMP_2D:G.COMP_2D, COMP_3D:G.COMP_3D, DECL_PCT:G.DECL_PCT, DECL_GR:G.DECL_GR,
      SENTIDO:G.SENTIDO, SECAO:secao, Q_PROJ_M3S:null, V_MS:null }};
  const L=drenCamada(tipoKey);
  let idx;
  const contOk = S._drenCont && (S._drenCont.L===L || (S._drenCont.L && S._drenCont.L.id===L.id))
              && L.features[S._drenCont.idx];
  if(contOk){
    L.features[S._drenCont.idx]=feat; idx=S._drenCont.idx;   // continuou: atualiza a mesma feição
  } else { L.features.push(feat); idx=L.features.length-1; }  // nova feição na camada
  S._drenCont=null; S._drenNome=null;
  // corrige nomes duplicados antigos na camada (não mexe na feição recém-salva:
  // ela já saiu com nome único; a varredura mantém a 1ª ocorrência de cada nome)
  try{ drenCorrigeDuplicados(L, DREN_TIPOS[tipoKey].nome); }catch(e){}
  try{ drawLayer(L); }catch(e){}
  S.activeId=L.id; S.selFeat={layer:L, layerId:L.id, idx};
  refreshUI();                       // <- salva na árvore de camadas como shape (vai no .ccmgis)
  drenPainelInfo(L, feat);
  toast(`${esc(feat.props.NOME||DREN_TIPOS[tipoKey].nome)} salvo: ${fmtLen(G.COMP_2D)} · decl. ${G.DECL_PCT!=null?G.DECL_PCT.toFixed(2)+'%':'—'}`);
}
function drenSecaoPadraoStr(tipoKey){
  const s=DREN_SECAO_PAD[DREN_TIPOS[tipoKey].secao];
  if(!s||s.tipo==='nen') return '—';
  if(s.tipo==='tri')  return `triangular · taludes 1:${s.z1}/1:${s.z2}`;
  if(s.tipo==='trap') return `trapezoidal · base ${s.b} m · taludes 1:${s.z1}/1:${s.z2}`;
  if(s.tipo==='ret')  return `retangular · ${s.b}×${s.y} m`;
  if(s.tipo==='circ') return `circular · Ø ${(s.D*1000).toFixed(0)} mm`;
  if(s.tipo==='leira') return `leira (cordão) · base ${s.b} m · altura ${s.h} m · taludes 1:${s.z1}/1:${s.z2}`;
  return '—';
}

/* --- hidráulica (Manning) ------------------------------------------------- */
/* área molhada A e perímetro molhado P em função da lâmina y (ou enchimento) */
function drenAP(sec, y){
  if(sec.tipo==='tri'){ const z1=sec.z1,z2=sec.z2;
    const A=0.5*y*y*(z1+z2); const P=y*(Math.sqrt(1+z1*z1)+Math.sqrt(1+z2*z2)); const B=y*(z1+z2);
    return {A,P,B}; }
  if(sec.tipo==='trap'){ const b=sec.b,z1=sec.z1,z2=sec.z2;
    const A=y*(b+0.5*y*(z1+z2)); const P=b+y*(Math.sqrt(1+z1*z1)+Math.sqrt(1+z2*z2)); const B=b+y*(z1+z2);
    return {A,P,B}; }
  if(sec.tipo==='ret'){ const b=sec.b;
    const A=b*y; const P=b+2*y; const B=b; return {A,P,B}; }
  if(sec.tipo==='circ'){ const D=sec.D, r=D/2;
    const yy=Math.min(y,D);
    const th=2*Math.acos(1-yy/r);                 // ângulo molhado
    const A=r*r*(th-Math.sin(th))/2; const P=r*th; const B=2*Math.sqrt(Math.max(0,yy*(D-yy)));
    return {A,P,B}; }
  return {A:0,P:0,B:0};
}
function drenManningQ(sec, y, n, S0){
  const {A,P}=drenAP(sec,y); if(A<=0||P<=0) return {Q:0,V:0,A,Rh:0};
  const Rh=A/P; const V=(1/n)*Math.pow(Rh,2/3)*Math.sqrt(Math.max(S0,1e-6));
  return {Q:V*A, V, A, Rh};
}
/* dado Q, acha a lâmina y por bisseção (capacidade da seção) */
function drenLaminaPorQ(sec, Q, n, S0){
  const ymax = sec.tipo==='circ'? sec.D*0.98 : (sec.y||2);
  let lo=1e-4, hi=ymax;
  if(drenManningQ(sec,hi,n,S0).Q < Q) return {y:hi, cheia:true, ...drenManningQ(sec,hi,n,S0)};
  for(let i=0;i<40;i++){ const mid=(lo+hi)/2;
    if(drenManningQ(sec,mid,n,S0).Q < Q) lo=mid; else hi=mid; }
  const y=(lo+hi)/2; return {y, cheia:false, ...drenManningQ(sec,y,n,S0)};
}

/* --- desenho da SEÇÃO transversal (SVG) ----------------------------------- */
function drenDesenhaSecao(sec, y, opt){
  opt=opt||{}; const W=260, H=150, pad=22;
  // largura de topo p/ enquadrar
  let topo, alturaTot;
  if(sec.tipo==='circ'){ topo=sec.D; alturaTot=sec.D; }
  else if(sec.tipo==='tri'){ const yt=sec.y||Math.max(y||0.3,0.3); topo=yt*((sec.z1||0)+(sec.z2||0)); alturaTot=yt; }
  else if(sec.tipo==='trap'){ const yt=sec.y||Math.max(y||0.4,0.4); topo=sec.b+yt*((sec.z1||0)+(sec.z2||0)); alturaTot=yt; }
  else if(sec.tipo==='ret'){ topo=sec.b; alturaTot=sec.y||Math.max(y||0.4,0.4); }
  else return '<div style="color:var(--ink-dim);font-size:12px">Sem seção transversal (feição linear simples).</div>';
  const esc=Math.min((W-2*pad)/Math.max(topo,1e-3), (H-2*pad)/Math.max(alturaTot,1e-3));
  const cx=W/2, base=H-pad;
  const X=x=>cx+x*esc, Yc=yy=>base-yy*esc;   // x centrado, y para cima
  let paredes='', agua='';
  if(sec.tipo==='tri'){ const yt=alturaTot, z1=sec.z1,z2=sec.z2;
    const xL=-yt*z1, xR=yt*z2;
    paredes=`<path d="M${X(xL)},${Yc(yt)} L${X(0)},${Yc(0)} L${X(xR)},${Yc(yt)}" fill="none" stroke="#c9d1d9" stroke-width="2"/>`;
    if(y>0){ const xl=-y*z1, xr=y*z2; agua=`<path d="M${X(xl)},${Yc(y)} L${X(0)},${Yc(0)} L${X(xr)},${Yc(y)} Z" fill="#4aa3ff55" stroke="#4aa3ff" stroke-width="1"/>`; }
  } else if(sec.tipo==='trap'){ const yt=alturaTot, b=sec.b,z1=sec.z1,z2=sec.z2;
    const xLb=-b/2, xRb=b/2, xLt=-b/2-yt*z1, xRt=b/2+yt*z2;
    paredes=`<path d="M${X(xLt)},${Yc(yt)} L${X(xLb)},${Yc(0)} L${X(xRb)},${Yc(0)} L${X(xRt)},${Yc(yt)}" fill="none" stroke="#c9d1d9" stroke-width="2"/>`;
    if(y>0){ const xl=-b/2-y*z1, xr=b/2+y*z2; agua=`<path d="M${X(xl)},${Yc(y)} L${X(xLb)},${Yc(0)} L${X(xRb)},${Yc(0)} L${X(xr)},${Yc(y)} Z" fill="#4aa3ff55" stroke="#4aa3ff" stroke-width="1"/>`; }
  } else if(sec.tipo==='ret'){ const yt=alturaTot, b=sec.b;
    paredes=`<path d="M${X(-b/2)},${Yc(yt)} L${X(-b/2)},${Yc(0)} L${X(b/2)},${Yc(0)} L${X(b/2)},${Yc(yt)}" fill="none" stroke="#c9d1d9" stroke-width="2"/>`;
    if(y>0) agua=`<rect x="${X(-b/2)}" y="${Yc(y)}" width="${b*esc}" height="${y*esc}" fill="#4aa3ff55" stroke="#4aa3ff" stroke-width="1"/>`;
  } else if(sec.tipo==='circ'){ const r=sec.D/2;
    paredes=`<circle cx="${X(0)}" cy="${Yc(r)}" r="${r*esc}" fill="none" stroke="#c9d1d9" stroke-width="2"/>`;
    if(y>0){ const yy=Math.min(y,sec.D); const th=2*Math.acos(1-yy/r);
      const xL=-r*Math.sin(th/2), xR=r*Math.sin(th/2), yb=yy;
      agua=`<path d="M${X(xL)},${Yc(yy)} A${r*esc},${r*esc} 0 ${yy>r?1:0},1 ${X(xR)},${Yc(yy)} Z" fill="#4aa3ff55" stroke="#4aa3ff" stroke-width="1"/>`; }
  }
  // cotas de largura e lâmina
  const AP=drenAP(sec, y||0);
  const rot = y>0? `<text x="${cx}" y="14" text-anchor="middle" font-size="11" fill="#4aa3ff">lâmina ${(y).toFixed(2)} m</text>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:280px;background:#0d1117;border:1px solid var(--line);border-radius:8px">`+
    `<line x1="${pad}" y1="${base}" x2="${W-pad}" y2="${base}" stroke="#2b323d" stroke-width="1"/>`+
    agua+paredes+rot+`</svg>`;
}

/* --- painel: dimensionar e mostrar a seção -------------------------------- */
function drenPainelInfo(L, f){
  const out=document.getElementById('drenOut'); if(!out) return;
  const p=f.props||{};
  const tipoKey = L._dren || Object.keys(DREN_TIPOS).find(k=>DREN_TIPOS[k].nome===p.TIPO) || 'dreno';
  const n=(v,d)=>v==null?'—':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  let html=`<div style="font-weight:600;color:var(--ink-bright)">${esc(p.NOME||p.TIPO||'Feição')}</div>`+
    (p.NOME&&p.NOME!==p.TIPO?`<div style="font-size:11px;color:var(--ink-dim);margin-bottom:2px">${esc(p.TIPO||'')}</div>`:'')+
    `<table style="border-collapse:collapse;font-size:12px;margin-top:4px">`+
    `<tr><td style="color:var(--ink-dim);padding:1px 8px 1px 0">Cota inicial → final</td><td><b>${n(p.COTA_INI,3)}</b> → <b>${n(p.COTA_FIM,3)}</b> m</td></tr>`+
    `<tr><td style="color:var(--ink-dim);padding:1px 8px 1px 0">Desnível</td><td><b>${n(p.DESNIVEL_M,3)}</b> m · ${esc(p.SENTIDO||'—')}</td></tr>`+
    `<tr><td style="color:var(--ink-dim);padding:1px 8px 1px 0">Comprimento 2D / 3D</td><td><b>${n(p.COMP_2D,2)}</b> / ${n(p.COMP_3D,2)} m</td></tr>`+
    `<tr><td style="color:var(--ink-dim);padding:1px 8px 1px 0">Declividade média</td><td><b>${n(p.DECL_PCT,2)} %</b> · ${n(p.DECL_GR,2)}°</td></tr>`+
    `<tr><td style="color:var(--ink-dim);padding:1px 8px 1px 0">Seção</td><td>${esc(p.SECAO||'—')}</td></tr>`+
    (p.Q_PROJ_M3S!=null?`<tr><td style="color:var(--amber);padding:1px 8px 1px 0">Capacidade Q</td><td><b>${n(p.Q_PROJ_M3S,4)}</b> m³/s · V ${n(p.V_MS,2)} m/s</td></tr>`:'')+
    `</table>`;
  out.innerHTML=html;
  // seção padrão desenhada
  const secDiv=document.getElementById('drenSecao');
  if(secDiv){ const sec=Object.assign({}, DREN_SECAO_PAD[DREN_TIPOS[tipoKey].secao]);
    secDiv.innerHTML=drenDesenhaSecao(sec, sec.y? sec.y*0.6 : 0); }
  const btn=document.getElementById('btnDrenDim'); if(btn) btn.style.display=(DREN_TIPOS[tipoKey].secao==='nen')?'none':'block';
  S._drenSel={L, f, tipoKey};
}
/* dimensiona a feição selecionada com o Q informado e a declividade do terreno */
function drenDimensionar(){
  const sel=S._drenSel; if(!sel){ toast('Selecione uma feição de drenagem'); return; }
  const {L,f,tipoKey}=sel;
  const secTipo=DREN_TIPOS[tipoKey].secao;
  if(secTipo==='nen'){ toast('Esta feição não tem seção para dimensionar'); return; }
  if(secTipo==='leira'){
    const s=DREN_SECAO_PAD.leira;
    toast('Leira é barreira/direcionamento — não se dimensiona por Manning. '+
          `Seção padrão: base ${s.b} m · altura ${s.h} m · taludes 1:${s.z1}/1:${s.z2}.`, 5000);
    return;
  }
  const p=f.props||{};
  const S0=(p.DECL_PCT!=null && p.DECL_PCT>0)? p.DECL_PCT/100 : parseFloat((document.getElementById('drenS0')||{}).value)/100;
  if(!(S0>0)){ toast('Sem declividade: informe a declividade de fundo (%)'); return; }
  const Q=parseFloat(String((document.getElementById('drenQ')||{}).value).replace(',','.'));
  if(!(Q>0)){ toast('Informe a vazão de projeto Q (m³/s)'); return; }
  const rev=p.REVEST||(document.getElementById('drenRevest')||{}).value||'Concreto liso';
  const nMan=DREN_MANNING[rev]||0.013;
  // parte da seção padrão e verifica; para tri/trap/ret ajusta a lâmina; circ acha enchimento
  const sec=Object.assign({}, DREN_SECAO_PAD[secTipo]);
  const r=drenLaminaPorQ(sec, Q, nMan, S0);
  const AP=drenAP(sec, r.y);
  const secStr=drenSecaoPadraoStr(tipoKey)+` · lâmina ${r.y.toFixed(2)} m`+(r.cheia?' (SEÇÃO CHEIA)':'');
  f.props=Object.assign(f.props||{}, {Q_PROJ_M3S:+Q.toFixed(4), V_MS:+r.V.toFixed(3), SECAO:secStr, REVEST:rev});
  try{ drawLayer(L); }catch(e){}
  refreshUI();
  // relatório + seção com lâmina de projeto
  const out=document.getElementById('drenOut');
  const secDiv=document.getElementById('drenSecao');
  if(secDiv) secDiv.innerHTML=drenDesenhaSecao(sec, r.y);
  const Vadm=DREN_VADM[rev]||3.0;
  let fr='';
  if(r.cheia){
    fr='<span style="color:var(--sel,#e05252)">A seção padrão NÃO comporta o Q — está cheia. Aumente a seção ou reduza o Q.</span>';
  } else if(r.V>Vadm){
    const excesso=(r.V/Vadm-1)*100;
    fr='<span style="color:var(--sel,#e05252)">V = '+r.V.toFixed(2)+' m/s acima do admissível para '+rev+
       ' ('+Vadm.toFixed(1)+' m/s'+(excesso>0?', +'+excesso.toFixed(0)+'%':'')+') — a valeta vai erodir/ravinar.</span>'+
       '<br><span style="color:var(--ink-dim)">Nesta declividade ('+(S0*100).toFixed(1)+'%) a solução usual é <b>quebrar a energia ao longo da rampa</b>: '+
       'soleiras/barrinhas transversais a cada trecho, degraus (descida d\'água), ou lançar em bueiros de travessia a intervalos curtos '+
       'para a valeta não acumular vazão. Revestir o fundo sozinho não resolve — só transfere a erosão para a saída, onde entra o dissipador.</span>';
  } else if(r.V<0.4){
    fr='<span style="color:var(--amber)">V = '+r.V.toFixed(2)+' m/s baixa — risco de assoreamento; considere maior declividade ou seção menor.</span>';
  } else {
    fr='<span style="color:#37c0aa">V = '+r.V.toFixed(2)+' m/s dentro do admissível para '+rev+' ('+Vadm.toFixed(1)+' m/s). OK.</span>';
  }
  if(out) out.innerHTML += `<div style="border-top:1px dashed var(--line);margin-top:6px;padding-top:6px;font-size:12px">`+
    `Dimensionamento (Manning n=${nMan}): S₀=${(S0*100).toFixed(2)}%, `+
    `lâmina <b>${r.y.toFixed(2)} m</b>, A=${AP.A.toFixed(3)} m², Rh=${r.Rh.toFixed(3)} m, `+
    `V=<b>${r.V.toFixed(2)} m/s</b>, Q=<b>${r.Q.toFixed(3)} m³/s</b><br>${fr}</div>`;
  toast(`Dimensionado: lâmina ${r.y.toFixed(2)} m · V ${r.V.toFixed(2)} m/s`);
}


/* ---------- integração do módulo de drenagem ---------- */
(function drenInit(){
  // popula seletores
  const selT=document.getElementById('drenTipo');
  if(selT){ selT.innerHTML=Object.keys(DREN_TIPOS).map(k=>`<option value="${k}" title="${DREN_TIPOS[k].desc.replace(/"/g,'&quot;')}">${DREN_TIPOS[k].nome}</option>`).join('');
    const cur=document.getElementById('drenTipoCurrent'),menu=document.getElementById('drenTipoMenu');
    const ico=k=>(window.HIDRO_ICONS&&HIDRO_ICONS['dren_'+k])||'<svg viewBox="0 0 24 24"><path d="M3 12h18"/></svg>';
    const curta=s=>s.length>116?s.slice(0,113)+'…':s;
    const upd=()=>{
      const k=selT.value||'dreno',d=DREN_TIPOS[k]; if(!d)return;
      const box=document.getElementById('drenTipoDesc'); if(box)box.textContent=d.desc;
      if(cur)cur.innerHTML=`<span class="dren-type-icon">${ico(k)}</span>`+
        `<span><b>${esc(d.nome)}</b><small style="display:block;color:var(--ink-dim);font-weight:400;margin-top:2px">${esc(curta(d.desc))}</small></span>`+
        '<span aria-hidden="true">▾</span>';
      if(menu)menu.querySelectorAll('.dren-type-row').forEach(r=>r.classList.toggle('sel',r.dataset.tipo===k));
    };
    window.drenTipoVisualUpdate=upd;
    if(menu)menu.innerHTML=Object.keys(DREN_TIPOS).map(k=>{
      const d=DREN_TIPOS[k];
      return `<div class="dren-type-row" role="option" data-tipo="${k}">`+
        `<span class="dren-type-icon">${ico(k)}</span>`+
        `<span><b>${esc(d.nome)}</b><small>${esc(curta(d.desc))}</small></span></div>`;
    }).join('');
    if(cur&&menu){
      cur.onclick=e=>{e.stopPropagation();const on=!menu.classList.contains('on');
        if(on){const r=cur.getBoundingClientRect(),mh=Math.min(480,innerHeight*.62);
          menu.style.left=Math.max(6,r.left)+'px';menu.style.width=Math.min(r.width,innerWidth-12)+'px';
          menu.style.top=((r.bottom+4+mh>innerHeight&&r.top>mh)?Math.max(6,r.top-mh-4):r.bottom+4)+'px';}
        menu.classList.toggle('on',on);cur.classList.toggle('on',on);cur.setAttribute('aria-expanded',on?'true':'false');};
      menu.onclick=e=>{const row=e.target.closest('.dren-type-row');if(!row)return;
        selT.value=row.dataset.tipo;selT.dispatchEvent(new Event('change'));
        menu.classList.remove('on');cur.classList.remove('on');cur.setAttribute('aria-expanded','false');};
      document.addEventListener('click',()=>{menu.classList.remove('on');cur.classList.remove('on');cur.setAttribute('aria-expanded','false');});
    }
    selT.onchange=upd; upd(); }
  const selR=document.getElementById('drenRevest');
  if(selR) selR.innerHTML=Object.keys(DREN_MANNING).map(k=>`<option value="${k}">${k} (n=${DREN_MANNING[k]})</option>`).join('');
  // botões
  const bD=document.getElementById('btnDrenDraw');
  if(bD) bD.onclick=()=>{ if(S.tool==='dren'){ drenFinaliza(); return; }
    const t=(document.getElementById('drenTipo')||{}).value||'dreno';
    try{ if(typeof ED!=='undefined' && ED.on && typeof edLigar==='function') edLigar(false); }catch(e){}
    try{ drenBackstop(); }catch(e){}
    drenArma(t); };
  const bDim=document.getElementById('btnDrenDimBtn'); if(bDim) bDim.onclick=drenDimensionar;
  const bRc=document.getElementById('btnDrenRecalc'); if(bRc) bRc.onclick=()=>{
    const sel=S._drenSel; if(!sel){ toast('Selecione uma feição de drenagem'); return; }
    const G=drenAplicaGeom(sel.L, sel.f); if(!G){ toast('Carregue o MDT antes'); return; }
    try{ drawLayer(sel.L); }catch(e){} refreshUI(); drenPainelInfo(sel.L, sel.f); toast('Geometria recalculada pelo MDT'); };
  const bLp=document.getElementById('btnDrenLimpa'); if(bLp) bLp.onclick=()=>drenLimpaCamadas();
})();
/* init próprio da BACIA — independente do drenInit, para nunca falhar junto */
(function baciaInit(){
  try{
    const bBc=document.getElementById('btnBaciaArma');
    if(bBc){ bBc.onclick=()=>{ try{ baciaArma(); }catch(e){ toast('Falha: '+(e&&e.message||e)); } };
      try{ if(typeof baciaPreencheMDT==='function') baciaPreencheMDT(); }catch(e){}
      const selB=document.getElementById('bcMDT');
      if(selB) selB.addEventListener('mousedown',()=>{ try{ baciaPreencheMDT(); }catch(e){} }); }
    const bMdt=document.getElementById('btnBaciaMDT');
    if(bMdt) bMdt.onclick=()=>{ try{ baciaGeraMDTCortado(); }catch(e){ toast('Falha: '+(e&&e.message||e)); } };
    const bRmp=document.getElementById('btnBaciaRampa');
    if(bRmp) bRmp.onclick=()=>{ try{ baciaArmaRampaBotao(); }catch(e){ toast('Falha: '+(e&&e.message||e)); } };
    const bRel=document.getElementById('btnBaciaRelocar');
    if(bRel)bRel.onclick=()=>{try{baciaArmaRampaBotao(true);}catch(e){toast('Falha ao relocar: '+(e&&e.message||e));}};
    const bLim=document.getElementById('btnBaciaLimparRampa');
    if(bLim)bLim.onclick=()=>{try{baciaLimpaRampa();}catch(e){toast('Falha ao limpar a rampa: '+(e&&e.message||e));}};
    const bDet=document.getElementById('btnBaciaDetalhe');
    if(bDet) bDet.onclick=()=>{ try{ baciaDetalhamento(); }catch(e){ toast('Falha no detalhamento: '+(e&&e.message||e)); } };
    const bExt=document.getElementById('btnBaciaExt');
    if(bExt)bExt.onclick=()=>{try{baciaExtravasorAtualiza();}catch(e){toast('Falha no dimensionamento: '+(e&&e.message||e));}};
    const bExtD=document.getElementById('btnBaciaExtDesenhar');
    if(bExtD)bExtD.onclick=()=>{try{baciaArmaExtravasor();}catch(e){toast('Falha ao posicionar: '+(e&&e.message||e));}};
    ['bcExtTipo','bcExtQ','bcExtH','bcExtCd','bcExtBL','bcExtComp','bcExtI','bcExtAz','bcExtOn'].forEach(id=>{
      const e=document.getElementById(id);if(e)e.addEventListener('change',()=>{
        try{baciaExtravasorAtualiza();baciaAtualizaBotaoMDT();}catch(_){}
      });
    });
    try{baciaExtravasorAtualiza();}catch(e){}
    try{baciaAtualizaBotaoMDT();}catch(e){}
    const bcModo=document.getElementById('bcModo');
    if(bcModo){ const sync=()=>{ const fe=bcModo.value==='feicao';
        const pr=document.getElementById('bcRetParams'), pf=document.getElementById('bcFeicParams');
        if(pr) pr.style.display=fe?'none':''; if(pf) pf.style.display=fe?'':'none';
        if(fe){ try{ baciaPreencheFeic(); }catch(e){} }
        const b=document.getElementById('btnBaciaArma');
        if(b) b.textContent = fe? '◎ Gerar bacia (do polígono)' : '◎ Gerar bacia (toque o centro)'; };
      bcModo.onchange=sync; sync();
      const selF=document.getElementById('bcFeic');
      if(selF) selF.addEventListener('mousedown',()=>{ try{ baciaPreencheFeic(); }catch(e){} }); }
  }catch(e){ console.warn('baciaInit:',e); }
})();
/* captura do toque p/ desenhar drenagem (mesmo padrão da inundação) */
function drenBackstop(){
  if(typeof map==='undefined' || !map || !map.getContainer) return false;
  const cont=map.getContainer(); if(cont._drenBS) return true; cont._drenBS=true;
  // Distingue CLIQUE (fixa vértice) de ARRASTE (pan do MDT). Só decide no
  // pointerup: se o ponteiro andou além do limiar, foi pan — o Leaflet já
  // moveu o mapa e nós não fixamos vértice nenhum. Se ficou parado, é clique.
  const LIMIAR=6;   // px
  cont.addEventListener('pointerdown', ev=>{
    if(S.tool!=='dren') return;
    if(ev.button===1 || ev.button===2) return;         // meio/direito: deixa o Leaflet (pan/menu)
    cont._drenDown={x:ev.clientX, y:ev.clientY, moved:false};
    // NÃO faz preventDefault aqui — deixa o Leaflet iniciar o arraste do mapa
  }, true);
  cont.addEventListener('pointermove', ev=>{
    if(S.tool!=='dren' || !cont._drenDown) return;
    if(Math.abs(ev.clientX-cont._drenDown.x)>LIMIAR || Math.abs(ev.clientY-cont._drenDown.y)>LIMIAR)
      cont._drenDown.moved=true;                        // virou arraste (pan)
  }, true);
  cont.addEventListener('pointerup', ev=>{
    if(S.tool!=='dren') return;
    const d=cont._drenDown; cont._drenDown=null;
    if(!d) return;
    if(d.moved) return;                                 // foi pan: não fixa vértice
    const r=cont.getBoundingClientRect();
    let ll; try{ ll=map.containerPointToLatLng([ev.clientX-r.left, ev.clientY-r.top]); }catch(e){ return; }
    ev.preventDefault(); ev.stopPropagation();
    drenClick(ll);
  }, true);
  return true;
}
