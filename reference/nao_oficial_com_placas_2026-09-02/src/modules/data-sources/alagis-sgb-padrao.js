
/* ============================================================================
   PADRÃO CROMÁTICO DO SGB — cores cronoestratigráficas (ICS/CGMW)
   O WFS do SGB não devolve cor, mas devolve sistema/era/éon de cada unidade.
   A carta do SGB pinta a litoestratigrafia pela idade, com a tabela de cores
   internacional — é isso que se aplica aqui, categorizado pela SIGLA.
   ========================================================================== */
(function sgbPadrao(){
  const ICS={
    // Fanerozoico — sistemas
    'quaternario':'#F9F97F','neogeno':'#FFE619','paleogeno':'#FD9A52',
    'cretaceo':'#7FC64E','jurassico':'#34B2C9','triassico':'#812B92',
    'permiano':'#F04028','carbonifero':'#67A599','devoniano':'#CB8C37',
    'siluriano':'#B3E1B6','ordoviciano':'#009270','cambriano':'#7FA056',
    // Proterozoico — períodos
    'ediacarano':'#FED96A','criogeniano':'#FECC5C','toniano':'#FEBF4E',
    'esteniano':'#FED99A','ectasiano':'#FDCC8A','calimiano':'#FDC07A',
    'estateriano':'#F875A7','orosiriano':'#F76898','riaciano':'#F75B89',
    'sideriano':'#F74F7C',
    // eras / éons, como recuo
    'neoproterozoico':'#FEB342','mesoproterozoico':'#FDB462',
    'paleoproterozoico':'#F74370','proterozoico':'#F73563',
    'neoarqueano':'#F99BC1','mesoarqueano':'#F768A9','paleoarqueano':'#F0047F',
    'eoarqueano':'#DA037F','arqueano':'#F0047F','hadeano':'#AE027E',
    'wenloquiano':'#B3E1C2'
  };
  const norm=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
  function corOficial(p){
    const campos=['cor','COR','cor_rgb','COR_RGB','rgb','RGB','hex','HEX','fill','color','cor_unidade','COR_UNIDADE'];
    for(const k of campos){
      let v=p&&p[k]; if(v==null||v==='') continue; v=String(v).trim();
      if(/^#?[0-9a-f]{6}$/i.test(v)) return v[0]==='#'?v:'#'+v;
      const m=v.match(/(?:rgb\s*\()?\s*(\d{1,3})\s*[,; ]\s*(\d{1,3})\s*[,; ]\s*(\d{1,3})/i);
      if(m) return '#'+[m[1],m[2],m[3]].map(n=>Math.max(0,Math.min(255,+n)).toString(16).padStart(2,'0')).join('');
    }
    return null;
  }
  function corDaFeicao(p){
    const oficial=corOficial(p); if(oficial) return oficial;
    for(const k of ['periodo_min','periodo_max','sistema_min','sistema_max','era_min','era_max','eon_min','eon_max','periodo','sistema','era','eon','idade']){
      const c=ICS[norm(p[k])]; if(c) return c;
    }
    return null;
  }
  /* Categoriza a camada por SIGLA, cor pela idade. Não mexe em camada que não
     tenha os campos do SGB — pontos de afloramento, poços etc. ficam como são. */
  window.sgbAplicaPadrao=function(L){
    if(!L||!L.sym||L.gtype!=='polygon') return false;
    const fs=L.features||[];
    if(!fs.length) return false;
    const amostra=fs.find(f=>f&&f.props)||{props:{}};
    const nomes=Object.keys(amostra.props||{});
    const campo=nomes.find(k=>['sigla','codigo','cod_unidade','unidade','nome_unidade','nome'].includes(norm(k).replace(/\s+/g,'_')));
    if(!campo || !fs.some(f=>f.props&&(corDaFeicao(f.props)||f.props[campo]!=null))) return false;
    const porSigla={};
    fs.forEach(f=>{
      const sg=String(f.props[campo]||'—');
      if(!porSigla[sg]) porSigla[sg]={n:0,cor:corDaFeicao(f.props)};
      porSigla[sg].n++;
      if(!porSigla[sg].cor) porSigla[sg].cor=corDaFeicao(f.props);
    });
    L.sym.mode='cat'; L.sym.field=campo; L.sym.fill=0.65; L.sym.weight=0.8;
    L.sym.cats=Object.entries(porSigla).map(([v,i])=>({value:v,color:i.cor||'#c9c9c9',count:i.n}));
    L.labelField=campo;
    try{ drawLayer(L); }catch(e){}
    return true;
  };
})();
