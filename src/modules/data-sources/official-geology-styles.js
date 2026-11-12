(function(root){
  'use strict';
  function value(n,p){if(n.property!==undefined){const key=n.property;return p[key]??p[key.split(':').pop()];}if(n.literal!==undefined)return n.literal;if(n.function==='Concatenate'||n.function==='strConcat')return (n.args||[]).map(a=>value(a,p)??'').join('');return evaluate(n,p);}
  function evaluate(n,p){
    if(!n)return true;if(n.unsupported)return false;const a=n.args||[],v=i=>value(a[i],p),op=n.op;
    if(op==='Filter'||op==='LowerBoundary'||op==='UpperBoundary')return a.length?value(a[0],p):true;
    if(op==='And')return a.every(x=>evaluate(x,p));if(op==='Or')return a.some(x=>evaluate(x,p));if(op==='Not')return !evaluate(a[0],p);
    if(op==='PropertyIsNull')return v(0)==null;
    if(op==='PropertyIsEqualTo'||op==='PropertyIsNotEqualTo'){let x=v(0),y=v(1);if(n.matchCase==='false'){x=String(x).toLowerCase();y=String(y).toLowerCase();}const eq=typeof x==='number'?x===Number(y):String(x)===String(y);return op==='PropertyIsEqualTo'?eq:!eq;}
    if(op==='PropertyIsBetween')return Number(v(0))>=Number(v(1))&&Number(v(0))<=Number(v(2));
    if(op==='PropertyIsGreaterThan')return Number(v(0))>Number(v(1));if(op==='PropertyIsGreaterThanOrEqualTo')return Number(v(0))>=Number(v(1));if(op==='PropertyIsLessThan')return Number(v(0))<Number(v(1));if(op==='PropertyIsLessThanOrEqualTo')return Number(v(0))<=Number(v(1));
    if(op==='PropertyIsLike'){const pattern=String(v(1)),wild=n.wildCard||'*',single=n.singleChar||'?',escape=n.escapeChar||'!';let regex='',escaped=false;for(const c of pattern){if(!escaped&&c===escape){escaped=true;continue;}regex+=!escaped&&c===wild?'.*':!escaped&&c===single?'.':c.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');escaped=false;}return new RegExp('^'+regex+'$',n.matchCase==='false'?'i':'').test(String(v(0)??''));}
    return false;
  }
  function classify(features,official){
    if(!official?.rules?.length)return null;const rules=official.rules,keys=new Set(features.flatMap(f=>Object.keys(f.properties||{})));let field='CLASSE_OFICIAL';while(keys.has(field))field+='_';
    const categories=new Map(),labels=new Map();rules.forEach(r=>labels.set(r.label,(labels.get(r.label)||0)+1));let unmatched=0;
    const supported=n=>!n||!n.unsupported&&(!n.function||['Concatenate','strConcat'].includes(n.function))&&(n.args||[]).every(supported);
    for(const f of features){const p=f.properties||(f.properties={});let rule=rules.find(r=>r.filter&&!r.else&&supported(r.filter)&&evaluate(r.filter,p))||rules.find(r=>r.else)||rules.find(r=>!r.filter&&!r.else);
      if(!rule){unmatched++;rule={id:'unmatched',label:'Sem classe correspondente na legenda oficial',style:{color:'#b0b0b0',stroke:'#808080',fill:1,weight:.5}};}
      const name=labels.get(rule.label)>1?rule.label+' ('+rule.id+')':rule.label;p[field]=name;
      if(!categories.has(name))categories.set(name,{value:name,label:rule.label,...rule.style,count:0});categories.get(name).count++;
    }
    return {field,cats:[...categories.values()],unmatched,source:official.source,country:official.country,provider:official.provider,specialSymbols:rules.some(r=>r.specialSymbols)};
  }
  function apply(layer,prepared){
    if(!prepared)return;const counts=new Map();for(const f of layer.features){const v=f.props?.[prepared.field];counts.set(v,(counts.get(v)||0)+1);}layer.sym={...layer.sym,color:prepared.cats[0]?.color||layer.sym.color,stroke:prepared.cats[0]?.stroke||layer.sym.stroke,mode:'cat',field:prepared.field,cats:prepared.cats.map(c=>({...c,count:counts.get(c.value)||0})).filter(c=>c.count),fill:1};
    layer.color=prepared.cats[0]?.color||layer.color;layer.fill=1;const field=layer.fields?.find(f=>f.name===prepared.field);if(field)field.alias='Classe da legenda oficial';
    layer.src={...layer.src,symbology:{provider:prepared.provider,country:prepared.country,source:prepared.source,unmatchedSourceFeatures:prepared.unmatched,specialSymbolsSimplified:prepared.specialSymbols}};
  }
  function arcgis(renderer,source){
    if(!renderer)return null;const hex=a=>a?'#'+a.slice(0,3).map(x=>Number(x).toString(16).padStart(2,'0')).join(''):'#808080';
    const style=s=>({color:hex(s?.color||s?.outline?.color),stroke:hex(s?.outline?.color||s?.color),fill:(s?.color?.[3]??255)/255,weight:Number(s?.outline?.width??s?.width??.8)*4/3,dash:''});
    const rules=[];
    if(renderer.type==='uniqueValue')for(const [i,c]of(renderer.uniqueValueInfos||[]).entries()){
      const fields=[renderer.field1,renderer.field2,renderer.field3].filter(Boolean),values=fields.length>1?String(c.value).split(renderer.fieldDelimiter||', '):[String(c.value)];
      const filters=fields.map((field,j)=>({op:'PropertyIsEqualTo',args:[{property:field},{literal:values[j]}]}));rules.push({id:String(i),label:c.label||String(c.value),filter:filters.length===1?filters[0]:{op:'And',args:filters},style:style(c.symbol)});
    }
    if(renderer.type==='simple')rules.push({id:'single',label:renderer.label||source.title,filter:null,style:style(renderer.symbol)});
    if(renderer.defaultSymbol)rules.push({id:'default',label:renderer.defaultLabel||'Demais classes da fonte',else:true,style:style(renderer.defaultSymbol)});
    return rules.length?{rules,country:source.pais,provider:source.provider,source:source.url}:null;
  }
  const api={evaluate,classify,apply,arcgis};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GeoMineOfficialStyles=api;
})(typeof window==='undefined'?globalThis:window);
