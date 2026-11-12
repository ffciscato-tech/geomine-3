(function(root){
  'use strict';
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  function text(v){if(v==null)return '';if(Array.isArray(v))return v.map(text).filter(Boolean).join(', ');if(typeof v==='object')return text(v.nom??v.name??v.nombre??v.label??v.libelle);const s=String(v).trim();return /^(null|undefined|n\/a|s\/d|none|-)?$/i.test(s)?'':s;}
  function apply(layer,source=layer.src||{}){
    const features=layer.features||[],fields=layer.fields||(layer.fields=[]),keySet=new Set();
    for(const f of features)for(const k of Object.keys(f.props||{}))keySet.add(k);
    const keys=[...keySet];if(!keys.length)return null;
    const byName=new Map(keys.map(k=>[norm(k),k]));
    const pick=names=>names.map(n=>byName.get(norm(n))).find(k=>k&&features.some(f=>text(f.props?.[k])));
    const mining=source.miningKind||source.substanceField||/miningrights|direitosminer|pedimento|catastro|titulominero|titleminier|titresminiers|depositos|deposits|minasativas|yacimientos|sigmine|processosminerarios/.test(norm(layer.name+' '+(source.provider||'')));
    let field;
    if(mining){
      const explicit=source.substanceField&&byName.get(norm(source.substanceField));
      const names=['SUBSTANCIA','SUSTANCIA','SUSTANCIAS','MINERALES','MINERAL','MINERAL_PRINCIPAL','SUBSTANCES','SUBSTANCE','SUBSTANCES_NOMS','SUBS_NOM','MATERIAU','MINERAI','subst_1','subst_2'];
      const candidates=explicit?[explicit]:names.map(n=>byName.get(norm(n))).filter(Boolean);
      field='SUBSTANCIA_ROTULO';
      for(const f of features){const values=[...new Set(candidates.map(k=>text(f.props?.[k])).filter(v=>v&&!/^\d+$/.test(v)))];f.props=f.props||{};f.props[field]=values.join(', ')||'Substância não informada na fonte';}
      if(!fields.some(f=>f.name===field))fields.push({name:field,alias:'Substância mineral',type:'C',length:254,decimal:0});
    }else{
      field=source.labelField&&byName.get(norm(source.labelField));
      field=field||pick(['SIGLA','SimboloUC','SimboloTer','SIMBOLO','COD_UNIDADE','CODIGO_UNIDADE','NOME_UNIDADE','NOMBRE_UNIDAD','NOME','NOMBRE','NOM','NAME','NombreTerr','LIBELLE','TITLE','CLASSE_OFICIAL']);
      if(!field)return null;
    }
    layer.labelField=field;layer.labelFields=[field];layer.lbl={...(typeof defaultLabelCfg==='function'?defaultLabelCfg():{}),...(layer.lbl||{}),onMap:true,unique:false};
    layer.src={...layer.src,labelDefaults:{field,kind:mining?'substance':'principal'}};
    return {field,mining:!!mining};
  }
  const api={apply,text};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GeoMineAutomaticLabels=api;
})(typeof window==='undefined'?globalThis:window);
