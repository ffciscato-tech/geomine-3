/* ==========================================================================
   GeoMine — área de trabalho de Geologia.
   Os comandos da faixa compartilham este catálogo para criar camadas com
   esquema, simbologia e geometria consistentes. O estado analítico (seções)
   fica separado das camadas e é serializado pelo projeto .ccmgis.
   ========================================================================== */
(function(){
'use strict';

const SCHEMA_VERSION=1;
const fC=(name,length=80)=>({name,type:'C',length,decimal:0});
const fN=(name,length=12,decimal=2)=>({name,type:'N',length,decimal});
const FID={name:'FID',type:'N',length:9,decimal:0};

const GEOLOGY_TOOL_DEFS={
  'litologia':{
    name:'Litologia',gtype:'polygon',tool:'poly',family:'mapeamento',color:'#d7a74b',hatch:'solid',
    fields:[FID,fC('CODIGO',24),fC('UNIDADE',60),fC('LITOLOGIA',60),fC('IDADE',40),fC('FONTE',80),fC('CONFIANCA',16),fC('OBS',180)]
  },
  'contato-geologico':{
    name:'Contatos geológicos',gtype:'line',tool:'line',family:'mapeamento',color:'#744c2e',weight:3,dash:'8 4',
    fields:[FID,fC('TIPO',30),fC('UNID_A',60),fC('UNID_B',60),fC('METODO',30),fC('CONFIANCA',16),fC('OBS',180)]
  },
  'falha':{
    name:'Falhas',gtype:'line',tool:'line',family:'estruturas',color:'#cf3f3f',weight:4,dash:'12 4',defaults:{REF_ORIENT:'strike_rhr'},
    fields:[FID,fC('NOME',60),fC('TIPO',30),fC('CINEMATICA',30),fC('ATIVIDADE',24),fN('DIRECAO',8,1),fN('MERGULHO',8,1),fC('REF_ORIENT',16),fN('REJEITO_M',12,2),fC('CONFIANCA',16),fC('OBS',180)]
  },
  'dobra':{
    name:'Traços axiais de dobra',gtype:'line',tool:'line',family:'estruturas',color:'#7a3eb1',weight:3,dash:'4 3',
    fields:[FID,fC('NOME',60),fC('TIPO',30),fC('VERGENCIA',24),fN('AZIMUTE',8,1),fN('CAIMENTO',8,1),fC('OBS',180)]
  },
  'acamamento':{
    name:'Acamamentos',gtype:'point',tool:'point',family:'estruturas',color:'#23384b',shape:'sd_bed',rotField:'DIRECAO',dipField:'MERGULHO',defaults:{REF_ORIENT:'strike_rhr'},
    fields:[FID,fC('ID',24),fN('DIRECAO',8,1),fN('MERGULHO',8,1),fC('REF_ORIENT',16),fC('UNIDADE',60),fC('QUALIDADE',16),fN('PREC_LOC_M',10,2),fN('PREC_ORI_G',10,2),fC('FONTE',80),fC('DATA',16),fC('OBS',180)]
  },
  'xistosidade':{
    name:'Xistosidade',gtype:'point',tool:'point',family:'estruturas',color:'#4c3978',shape:'sd_fol',rotField:'DIRECAO',dipField:'MERGULHO',defaults:{REF_ORIENT:'strike_rhr'},
    fields:[FID,fC('ID',24),fN('DIRECAO',8,1),fN('MERGULHO',8,1),fC('REF_ORIENT',16),fC('UNIDADE',60),fC('INTENSID',20),fC('QUALIDADE',16),fN('PREC_LOC_M',10,2),fN('PREC_ORI_G',10,2),fC('FONTE',80),fC('DATA',16),fC('OBS',180)]
  },
  'fratura':{
    name:'Fraturas',gtype:'line',tool:'line',family:'estruturas',color:'#506579',weight:2,dash:'5 4',defaults:{REF_ORIENT:'strike_rhr'},
    fields:[FID,fC('ID',24),fC('TIPO',30),fN('DIRECAO',8,1),fN('MERGULHO',8,1),fC('REF_ORIENT',16),fN('ABERTURA',10,3),fC('PREENCH',50),fC('CONFIANCA',16)]
  },
  'veio':{
    name:'Veios',gtype:'line',tool:'line',family:'estruturas',color:'#9b5ba6',weight:4,defaults:{REF_ORIENT:'strike_rhr'},
    fields:[FID,fC('ID',24),fC('MINERAL',50),fN('DIRECAO',8,1),fN('MERGULHO',8,1),fC('REF_ORIENT',16),fN('ESP_M',10,3),fC('CONFIANCA',16),fC('OBS',180)]
  },
  'dique':{
    name:'Diques',gtype:'polygon',tool:'poly',family:'estruturas',color:'#b94c67',hatch:'solid',defaults:{REF_ORIENT:'strike_rhr'},
    fields:[FID,fC('ID',24),fC('LITOLOGIA',60),fN('DIRECAO',8,1),fN('MERGULHO',8,1),fC('REF_ORIENT',16),fN('ESP_M',10,2),fC('IDADE',40),fC('OBS',180)]
  },
  'zona-cisalhamento':{
    name:'Zonas de cisalhamento',gtype:'polygon',tool:'poly',family:'estruturas',color:'#da6a3a',hatch:'solid',defaults:{REF_ORIENT:'strike_rhr'},
    fields:[FID,fC('ID',24),fC('TIPO',30),fC('CINEMATICA',30),fN('DIRECAO',8,1),fN('MERGULHO',8,1),fC('REF_ORIENT',16),fN('LARGURA_M',12,2),fC('OBS',180)]
  },
  'sondagem':{
    name:'Sondagens',gtype:'point',tool:'point',family:'investigacao',color:'#137c8b',shape:'drill',rotField:'AZIMUTE',
    fields:[FID,fC('ID_FURO',30),fN('COTA_BOCA',12,3),fN('PROF_M',12,2),fN('AZIMUTE',8,1),fN('INCLINACAO',8,1),fC('STATUS',24),fC('DATA',16),fC('OBS',180)]
  },
  'spt':{
    name:'Ensaios SPT',gtype:'point',tool:'point',family:'investigacao',color:'#337aaa',shape:'well',
    fields:[FID,fC('ID_SPT',30),fN('COTA_BOCA',12,3),fN('PROF_M',12,2),fN('NSPT',8,0),fN('NA_M',10,2),fC('STATUS',24),fC('DATA',16),fC('OBS',180)]
  },
  'trincheira':{
    name:'Trincheiras',gtype:'line',tool:'line',family:'investigacao',color:'#8d5524',weight:5,dash:'7 3',
    fields:[FID,fC('CODIGO',30),fN('PROF_M',10,2),fN('COMPR_M',12,2),fC('LITOLOGIA',60),fC('STATUS',24),fC('OBS',180)]
  },
  'afloramento':{
    name:'Afloramentos',gtype:'point',tool:'point',family:'investigacao',color:'#c96d25',shape:'prospect',
    fields:[FID,fC('CODIGO',30),fC('UNIDADE',60),fC('LITOLOGIA',60),fC('ALTERACAO',50),fC('CONFIANCA',16),fC('OBS',180)]
  },
  'ponto-amostra':{
    name:'Pontos de amostra',gtype:'point',tool:'point',family:'investigacao',color:'#bd3555',shape:'sample',
    fields:[FID,fC('COD_AMOSTRA',30),fC('TIPO',30),fC('MATERIAL',50),fN('PROF_M',10,2),fC('RESULTADO',80),fC('UNIDADE',24),fC('DATA',16),fC('OBS',180)]
  },
  'dominio-geologico':{
    name:'Domínios geológicos',gtype:'polygon',tool:'poly',family:'modelo',color:'#7e8f55',hatch:'solid',
    fields:[FID,fC('DOMINIO',60),fC('UNIDADE',60),fC('LITOLOGIA',60),fN('DENSIDADE',10,3),fN('TEOR',12,4),fC('CONFIANCA',16),fC('OBS',180)]
  },
  'lineacao':{
    name:'Lineações',gtype:'point',tool:'point',family:'estruturas',color:'#145f76',shape:'lineation',rotField:'DIRECAO',dipField:'CAIMENTO',
    fields:[FID,fC('ID',24),fN('DIRECAO',8,1),fN('CAIMENTO',8,1),fC('TIPO',30),fC('QUALIDADE',16),fC('OBS',180)]
  },
  'foliacao':{
    name:'Foliações',gtype:'point',tool:'point',family:'estruturas',color:'#5a4c9b',shape:'sd_fol',rotField:'DIRECAO',dipField:'MERGULHO',defaults:{REF_ORIENT:'strike_rhr'},
    fields:[FID,fC('ID',24),fN('DIRECAO',8,1),fN('MERGULHO',8,1),fC('REF_ORIENT',16),fC('TIPO',30),fC('UNIDADE',60),fC('QUALIDADE',16),fN('PREC_LOC_M',10,2),fN('PREC_ORI_G',10,2),fC('FONTE',80),fC('DATA',16),fC('OBS',180)]
  },
  'plunging':{
    name:'Eixos de dobra — atitude',gtype:'point',tool:'point',family:'estruturas',color:'#7a3eb1',shape:'foldaxis',rotField:'DIRECAO',dipField:'CAIMENTO',
    fields:[FID,fC('ID',24),fN('DIRECAO',8,1),fN('CAIMENTO',8,1),fC('TIPO',30),fC('QUALIDADE',16),fC('OBS',180)]
  }
};

function escGeo(value){return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function cloneGeo(value){try{return JSON.parse(JSON.stringify(value));}catch(_){return null;}}
function prepareNewGeologyFeatures(layer,def){
  if(!def.defaults)return;
  const mapping=layer._geology&&layer._geology.fieldMap||{},destinations={},
    fm=window.GeoMineGeology&&window.GeoMineGeology.fieldMapping,
    inferred=fm&&typeof fm.inferFieldMap==='function'?fm.inferFieldMap(layer,layer._geology&&layer._geology.kind):{};
  layer.fields=Array.isArray(layer.fields)?layer.fields:[];
  // Acrescente somente o esquema: observações antigas mantêm todos os seus
  // atributos, inclusive a ausência de convenção. _defProps é lido apenas
  // quando addFeature cria uma nova feição, nunca para interpretar o legado.
  def.fields.filter(field=>['DIRECAO','MERGULHO','REF_ORIENT'].includes(field.name)).forEach(field=>{
    const wanted=mapping[field.name]||inferred[field.name]||field.name,
      existing=layer.fields.find(item=>String(item.name||item).toUpperCase()===String(wanted).toUpperCase());
    if(!existing)layer.fields.push(Object.assign(cloneGeo(field),{name:wanted}));
    destinations[field.name]=existing?(existing.name||existing):wanted;
  });
  const defaults=Object.assign({},layer._defProps||{});
  Object.entries(def.defaults).forEach(([name,value])=>{
    const target=destinations[name]||mapping[name]||name;
    if(defaults[target]==null||defaults[target]==='')
      defaults[target]=name==='REF_ORIENT'&&layer._geology&&layer._geology.orientationRef||value;
  });
  layer._defProps=defaults;
}
function ensureState(){
  if(!S.geology||typeof S.geology!=='object')S.geology={schemaVersion:SCHEMA_VERSION,sections:[],settings:{}};
  S.geology.schemaVersion=SCHEMA_VERSION;
  if(!Array.isArray(S.geology.sections))S.geology.sections=[];
  if(!S.geology.settings||typeof S.geology.settings!=='object')S.geology.settings={};
  return S.geology;
}
function snapshot(){
  const source=ensureState(),meshes=window.GeoMineGeology?.meshes;
  const data=cloneGeo(meshes&&Array.isArray(source.meshes)?{...source,meshes:meshes.snapshotMeshes()}:source)||{schemaVersion:SCHEMA_VERSION,sections:[],settings:{}};
  /* O gráfico é sempre recalculável a partir da linha, MDT e camadas. Não
     grave centenas de amostras/cotas no .ccmgis a cada salvamento. */
  if(data.section&&typeof data.section==='object')delete data.section.result;
  return data;
}
function restore(data,options={}){
  // loadProject adopts parsed feature geometry already. Its geological mesh
  // geometry can use the same ownership rule, without a second large JSON copy.
  // Standalone callers retain the historical isolated-copy behavior.
  const clean=data&&typeof data==='object'?(options.borrowGeometry===true?data:(cloneGeo(data)||{})):{};
  S.geology=Object.assign({schemaVersion:SCHEMA_VERSION,sections:[],settings:{}},clean);
  S.geology.schemaVersion=SCHEMA_VERSION;
  if(!Array.isArray(S.geology.sections))S.geology.sections=[];
  if(!S.geology.settings||typeof S.geology.settings!=='object')S.geology.settings={};
  (S.layers||[]).forEach(layer=>{
    // A restauração do domínio geológico não pode recongelar uma camada
    // que o usuário já descongelou e salvou.
    if(typeof layer?.locked!=='boolean'&&
       (layer?._geology?.kind==='surpac-mesh'||layer?._geology?.importedBoreholes===true))layer.locked=true;
    const def=layer&&layer._geology&&GEOLOGY_TOOL_DEFS[layer._geology.kind];
    if(def)prepareNewGeologyFeatures(layer,def);
  });
  window.GeoMineGeology?.meshes?.restoreLayers?.();
  return S.geology;
}

function geologyGroup(){
  let group=(S.groups||[]).find(g=>String(g.name||'').toLocaleLowerCase('pt-BR')==='geologia');
  if(!group){
    group={id:gid++,name:'Geologia',collapsed:false};
    S.groups.push(group);
    S.stack=S.stack||[];
    if(!S.stack.includes('G:'+group.id))S.stack.unshift('G:'+group.id);
  }
  return group;
}
function activateLayer(layer){
  if(!layer)return null;
  S.activeId=layer.id;S.selRaster=null;layer.visible=true;
  try{if(typeof drawLayer==='function')drawLayer(layer);}catch(e){console.warn('Geologia: desenho da camada',e);}
  try{if(typeof zApply==='function')zApply();}catch(e){}
  try{if(typeof refreshUI==='function')refreshUI();}catch(e){}
  try{if(typeof propRefresh==='function')propRefresh();}catch(e){}
  return layer;
}
function applyPreset(layer,def,kind,options){
  options=options||{};
  /* Preserve proveniência e o mapa de campos quando uma camada importada
     opta por receber também a simbologia padrão. */
  layer._geology=Object.assign({},layer._geology||{}, {schemaVersion:layer._geology&&layer._geology.schemaVersion||SCHEMA_VERSION,kind,family:def.family||'geologia'});
  if(options.moveToGroup!==false)layer.groupId=geologyGroup().id;
  layer.color=def.color;layer.weight=def.weight||2;layer.fill=def.gtype==='polygon'?0.34:0;
  layer.sym=Object.assign(layer.sym||{}, {
    mode:'single',color:def.color,stroke:def.color,weight:def.weight||2,
    fill:def.gtype==='polygon'?0.34:0,dash:def.dash||'',hatch:def.hatch||(def.gtype==='polygon'?'solid':'none'),hatchScale:1
  });
  if(def.gtype==='point')layer.sym.pt={shape:def.shape||'circle',size:18,rot:0,rotField:def.rotField||'',dipField:def.dipField||''};
  prepareNewGeologyFeatures(layer,def);
  if(def.gtype==='point'){layer.labelField='';layer.lbl=Object.assign(layer.lbl||{}, {unique:false,onMap:false});}
  return layer;
}
function createOrActivate(kind){
  const def=GEOLOGY_TOOL_DEFS[kind];
  if(!def)throw new Error('Ferramenta geológica desconhecida: '+kind);
  ensureState();
  /* A camada importada mantém collar, survey e trajetória vinculados.
     Não reutilizá-la para desenhar furos avulsos: além de estar bloqueada,
     misturaria observações manuais com um conjunto de sondagens importado. */
  let layer=(S.layers||[]).find(L=>L&&L._geology&&L._geology.kind===kind&&L._geology.importedBoreholes!==true);
  if(!layer){
    layer=addLayer({name:def.name,gtype:def.gtype,crs:S.workCRS,features:[],fields:cloneGeo(def.fields),color:def.color});
    applyPreset(layer,def,kind);
  }else{
    layer._geology=Object.assign({schemaVersion:SCHEMA_VERSION,kind,family:def.family},layer._geology||{});
    if(layer.groupId==null)layer.groupId=geologyGroup().id;
    prepareNewGeologyFeatures(layer,def);
  }
  activateLayer(layer);
  return layer;
}
function arm(kind){
  const def=GEOLOGY_TOOL_DEFS[kind],layer=createOrActivate(kind);
  RIB_CAT_ATUAL='geologia';
  try{if(typeof switchView==='function')switchView('map');}catch(e){}
  setTimeout(async()=>{
    try{
      const collaboration=window.GeoMineCollaboration;
      if(collaboration&&collaboration.snapshot&&collaboration.snapshot().roomId){
        const reserved=await collaboration.acquireActiveLayer();
        if(!reserved){toast(def.name+': a camada não pôde ser reservada para edição.');return;}
      }
      setTool(def.tool);
    }catch(e){console.warn('Geologia: ferramenta',e);return;}
    toast(`${def.name}: ${def.tool==='point'?'clique no mapa':def.tool==='line'?'desenhe a linha e finalize com duplo clique':'desenhe o polígono e finalize com duplo clique'}.`);
  },0);
  return layer;
}

function boreholeLayers(){return (S.layers||[]).filter(L=>L&&L._geology&&['sondagem','spt'].includes(L._geology.kind));}
function boreholeName(feature,index){
  const p=feature&&feature.props||{};
  return String(p.ID_FURO||p.ID_SPT||p.FURO||p.CODIGO||('Furo '+(index+1)));
}
function ensureLogTarget(selection){
  const layers=boreholeLayers(),populated=layers.filter(L=>L.features&&L.features.length);
  let selected=populated.includes(selection?.layer)?selection.layer:populated.includes(S.selFeat?.layer)?S.selFeat.layer:populated.find(L=>L.id===S.activeId)||populated[0];
  if(!selected)return null;
  let index=selected===selection?.layer?Number(selection.index??selection.idx??0):(S.selFeat&&S.selFeat.layer===selected)?+S.selFeat.idx:0;
  if(!Number.isInteger(index)||!selected.features[index])index=0;
  return {layers,layer:selected,index,feature:selected.features[index]};
}
function downloadText(name,text,type='text/csv;charset=utf-8'){
  const blob=new Blob(['\ufeff'+text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function intervalNumber(value){
  if(value==null||typeof value==='string'&&value.trim()==='')return null;
  return typeof value==='number'||typeof value==='string'?Number(value):NaN;
}
function cloneIntervalData(value){
  // JSON transforma NaN/Infinity em null antes que a validação os veja.
  // Mantenha os valores do editor intactos; a serialização do projeto é separada.
  if(Array.isArray(value))return value.map(cloneIntervalData);
  if(value&&typeof value==='object'){
    if(Object.prototype.toString.call(value)==='[object Date]')return new Date(value.getTime());
    return Object.fromEntries(Object.keys(value).map(key=>[key,cloneIntervalData(value[key])]));
  }
  return value;
}
function intervalFingerprint(value){
  const encode=item=>{
    if(item===null)return ['null'];
    const type=typeof item;
    if(type==='number')return ['number',Number.isNaN(item)?'NaN':item===Infinity?'+Infinity':item===-Infinity?'-Infinity':Object.is(item,-0)?'-0':item];
    if(Array.isArray(item))return ['array',item.map(encode)];
    if(type==='object'){
      if(Object.prototype.toString.call(item)==='[object Date]')return ['date',String(item.getTime())];
      return ['object',Object.keys(item).sort().map(key=>[key,encode(item[key])])];
    }
    return [type,type==='string'||type==='boolean'?item:String(item)];
  };
  return JSON.stringify(encode(value));
}
function boreholeDepth(layer,feature){
  const fm=window.GeoMineGeology&&window.GeoMineGeology.fieldMapping;
  return fm&&typeof fm.fieldValue==='function'?fm.fieldValue(layer,feature,'PROF_M'):feature&&feature.props&&feature.props.PROF_M;
}
function validateBoreholeIntervals(rows,options){
  options=options||{};
  const errors=[],rowErrors=[],normalized=[],ranges=[],depth=intervalNumber(options.depth);
  if(!Array.isArray(rows))return {valid:false,errors:['A tabela de intervalos deve ser uma lista.'],rowErrors,rows:[]};
  if(depth!=null&&(!Number.isFinite(depth)||depth<0))errors.push('A profundidade do furo deve ser um número finito, zero ou positivo. Corrija a ficha do furo.');
  const addError=(index,message)=>{rowErrors[index].push(message);errors.push(`Intervalo ${index+1}: ${message}`);};
  rows.forEach((row,index)=>{
    rowErrors[index]=[];
    if(!row||typeof row!=='object'||Array.isArray(row)){normalized.push(row);addError(index,'registro inválido.');return;}
    const clean=cloneIntervalData(row),from=intervalNumber(row.DE_M),to=intervalNumber(row.ATE_M);
    normalized.push(clean);
    if(from==null||!Number.isFinite(from))addError(index,'informe uma profundidade inicial numérica.');
    else if(from<0)addError(index,'a profundidade inicial não pode ser negativa.');
    if(to==null||!Number.isFinite(to))addError(index,'informe uma profundidade final numérica.');
    if(from!=null&&to!=null&&Number.isFinite(from)&&Number.isFinite(to)){
      clean.DE_M=from;clean.ATE_M=to;
      if(to<=from)addError(index,'a profundidade final deve ser maior que a inicial.');
      else if(from>=0)ranges.push({index,from,to});
      if(Number.isFinite(depth)&&depth>=0&&to>depth+1e-8)addError(index,`a profundidade final ultrapassa os ${depth} m do furo.`);
    }
    ['REC_PCT','RQD_PCT'].forEach(key=>{
      if(!Object.prototype.hasOwnProperty.call(row,key))return;
      const value=intervalNumber(row[key]);
      if(value!=null&&(!Number.isFinite(value)||value<0||value>100))addError(index,`${key==='REC_PCT'?'Recuperação':'RQD'} deve estar entre 0 e 100%.`);
      else clean[key]=value;
    });
  });
  ranges.sort((a,b)=>a.from-b.from||a.to-b.to);
  let previous=null;
  ranges.forEach(range=>{
    if(previous&&range.from<previous.to-1e-8){
      addError(range.index,`há sobreposição com o intervalo ${previous.index+1}.`);
      addError(previous.index,`há sobreposição com o intervalo ${range.index+1}.`);
    }
    if(!previous||range.to>previous.to)previous=range;
  });
  return {valid:errors.length===0,errors,rowErrors,rows:normalized};
}
function createBoreholeIntervalDraft(mode){
  const arrayKey=mode==='core'?'coreRuns':'geologyLog',entries=new Map();
  const entryFor=(layer,index)=>{
    const feature=layer&&layer.features&&layer.features[index];
    if(!feature)throw new Error('Furo não encontrado.');
    if(!entries.has(feature)){
      const original=Array.isArray(feature[arrayKey])?feature[arrayKey]:[],rows=cloneIntervalData(original);
      entries.set(feature,{layer,feature,index,original:intervalFingerprint(original),rows});
    }
    return entries.get(feature);
  };
  const changed=entry=>intervalFingerprint(entry.rows)!==entry.original;
  const check=entry=>validateBoreholeIntervals(entry.rows,{depth:boreholeDepth(entry.layer,entry.feature)});
  return {
    arrayKey,
    rowsFor(layer,index){return entryFor(layer,index).rows;},
    validationFor(layer,index){return check(entryFor(layer,index));},
    hasChanges(){return [...entries.values()].some(changed);},
    discard(){entries.clear();},
    commit(){
      const errors=[],updates=[];
      // Concluir valida todos os furos visitados, mesmo sem edições; somente
      // os efetivamente alterados serão gravados após a validação conjunta.
      entries.forEach(entry=>{
        const label=boreholeName(entry.feature,entry.index),result=check(entry);
        result.errors.forEach(error=>errors.push(`${label}: ${error}`));
        const current=Array.isArray(entry.feature[arrayKey])?entry.feature[arrayKey]:[];
        if(!(S.layers||[]).includes(entry.layer)||!entry.layer.features.includes(entry.feature)||intervalFingerprint(current)!==entry.original)
          errors.push(`${label}: o furo ou seus intervalos foram alterados durante a edição. Reabra a tabela para revisar os dados atuais.`);
        if(changed(entry)&&typeof collabCanEditLayer==='function'&&!collabCanEditLayer(entry.layer,false))
          errors.push(`${label}: a camada não está disponível para edição.`);
        if(changed(entry))updates.push({entry,rows:result.rows});
      });
      if(errors.length)return {valid:false,errors,count:0};
      updates.forEach(({entry,rows})=>{entry.feature[arrayKey]=rows;entry.layer._rev=(Number(entry.layer._rev)||0)+1;entry.original=intervalFingerprint(rows);entry.rows=cloneIntervalData(rows);});
      return {valid:true,errors:[],count:updates.length};
    }
  };
}
function openBoreholeEditor(mode,selection){
  const target=ensureLogTarget(selection);
  if(!target){
    document.querySelector('.gmgeo-backdrop')?.remove();
    const empty=document.createElement('div');empty.className='gmgeo-backdrop';
    empty.innerHTML='<section class="gmgeo-modal" role="dialog" aria-modal="true" aria-label="Log de sondagem"><header class="gmgeo-head"><h2>Log de sondagem</h2></header><div class="gmgeo-form-body"><p>Não há furos cadastrados neste projeto. Use o cadastro de sondagem já disponível na aba Geologia ou importe collar e tabelas de sondagem.</p></div><footer class="gmgeo-foot"><button class="tbtn" data-close>Fechar</button><button class="btn primary" data-new>＋ Novo furo no mapa</button></footer></section>';
    document.body.appendChild(empty);empty.querySelector('[data-close]').onclick=()=>empty.remove();empty.querySelector('[data-new]').onclick=()=>{empty.remove();arm('sondagem');};return;
  }
  const isCore=mode==='core';
  const columns=isCore?
    [{k:'DE_M',n:'De (m)',num:1},{k:'ATE_M',n:'Até (m)',num:1},{k:'REC_PCT',n:'Rec. (%)',num:1},{k:'RQD_PCT',n:'RQD (%)',num:1},{k:'LITOLOGIA',n:'Litologia'},{k:'OBS',n:'Observação'}]:
    [{k:'DE_M',n:'De (m)',num:1},{k:'ATE_M',n:'Até (m)',num:1},{k:'LITOLOGIA',n:'Litologia'},{k:'ALTERACAO',n:'Alteração'},{k:'DESCRICAO',n:'Descrição'}];
  document.querySelector('.gmgeo-backdrop')?.remove();
  const root=document.createElement('div');root.className='gmgeo-backdrop';
  root.innerHTML=`<section class="gmgeo-modal gm-borehole-log" role="dialog" aria-modal="true" aria-label="${isCore?'Testemunhos':'Log de sondagem'}">
    <header class="gmgeo-head"><div><h2>${isCore?'Testemunhos e recuperação':'Log de sondagem'}</h2><p>Concluir salva os furos editados. Fechar ou cancelar descarta as alterações desta janela.</p></div><button class="gmgeo-x" data-act="close" aria-label="Fechar sem salvar">×</button></header>
    <div class="gmgeo-pickers"><label>Camada<select data-role="layer"></select></label><label>Furo<select data-role="feature"></select></label><button class="tbtn" data-act="map">Localizar no mapa</button><div class="gm-bhp-actions"><button class="tbtn" data-act="selected">Usar furo selecionado no mapa</button><button class="tbtn" data-act="properties">Propriedades do furo</button><button class="tbtn" data-act="new">＋ Novo furo no mapa</button></div></div>
    <div class="gm-borehole-log-body"><figure class="gm-borehole-log-graphic"><canvas aria-label="Log gráfico por profundidade medida"></canvas><figcaption>O desenho acompanha os intervalos da tabela. Lacunas não recebem litologia presumida; dados inválidos não são desenhados.</figcaption></figure><div class="gmgeo-table-wrap"><div class="gm-borehole-log-pages"><button class="tbtn" data-page="prev">Anterior</button><span data-page-status></span><button class="tbtn" data-page="next">Próxima</button></div><table class="gmgeo-table"><thead><tr>${columns.map(c=>`<th>${escGeo(c.n)}</th>`).join('')}<th></th></tr></thead><tbody></tbody></table></div></div>
    <div class="gmgeo-preview" data-role="validation" role="status" aria-live="polite"></div>
    <footer class="gmgeo-foot"><span class="gmgeo-hint">Use profundidades sem sobreposição e dentro do furo.</span><button class="tbtn" data-act="csv">Exportar CSV</button><button class="tbtn" data-act="add">＋ Adicionar intervalo</button><button class="tbtn" data-act="cancel">Cancelar</button><button class="btn primary" data-act="done">Concluir</button></footer>
  </section>`;
  document.body.appendChild(root);
  const layerSel=root.querySelector('[data-role="layer"]'),featureSel=root.querySelector('[data-role="feature"]'),tbody=root.querySelector('tbody'),validation=root.querySelector('[data-role="validation"]');
  const state={layer:target.layer,index:target.index,page:0},draft=createBoreholeIntervalDraft(mode),pageSize=100;
  const arr=()=>draft.rowsFor(state.layer,state.index);
  const renderFeatures=()=>{
    featureSel.innerHTML=(state.layer.features||[]).map((f,i)=>`<option value="${i}">${escGeo(boreholeName(f,i))}</option>`).join('');
    state.index=Math.min(state.index,Math.max(0,state.layer.features.length-1));featureSel.value=String(state.index);renderRows();
  };
  const renderRows=()=>{
    const rows=arr();state.page=Math.min(state.page,Math.max(0,Math.ceil(rows.length/pageSize)-1));
    const start=state.page*pageSize;
    root.querySelector('[data-page-status]').textContent=rows.length?`${start+1}–${Math.min(start+pageSize,rows.length)} de ${rows.length} intervalos`:'Sem intervalos';
    root.querySelector('[data-page="prev"]').disabled=state.page===0;root.querySelector('[data-page="next"]').disabled=start+pageSize>=rows.length;
    tbody.innerHTML=rows.slice(start,start+pageSize).map((row,j)=>{const i=start+j;return `<tr data-row="${i}">${columns.map(c=>`<td><input data-key="${c.k}" ${c.num?'type="number" step="any" min="0"'+(/_PCT$/.test(c.k)?' max="100"':''):'type="text"'} value="${escGeo((row&&row[c.k])??'')}"></td>`).join('')}<td><button class="gmgeo-del" data-del="${i}" title="Excluir">×</button></td></tr>`;}).join('')||`<tr><td colspan="${columns.length+1}" class="gmgeo-empty">Nenhum intervalo cadastrado.</td></tr>`;
    tbody.querySelectorAll('input[data-key]').forEach(input=>input.addEventListener('input',()=>{
      const row=+input.closest('tr').dataset.row,key=input.dataset.key,col=columns.find(c=>c.k===key);
      if(!arr()[row]||typeof arr()[row]!=='object')arr()[row]={};
      arr()[row][key]=col&&col.num?(input.value.trim()===''?(input.validity&&input.validity.badInput?'inválido':null):Number(input.value)):input.value;
      renderValidity();
    }));
    tbody.querySelectorAll('[data-del]').forEach(button=>button.onclick=()=>{arr().splice(+button.dataset.del,1);renderRows();});
    renderValidity();
  };
  const renderValidity=()=>{
    const result=draft.validationFor(state.layer,state.index);
    tbody.querySelectorAll('tr[data-row]').forEach(tr=>tr.classList.toggle('bad',!!result.rowErrors[+tr.dataset.row]?.length));
    validation.textContent=result.errors.join(' · ')||'Intervalos válidos. As alterações serão salvas ao concluir.';
    validation.className='gmgeo-preview '+(result.valid?'valid':'invalid');
    window.GeoMineGeology?.boreholeProperties?.drawLog(root.querySelector('canvas'),{layer:state.layer,feature:state.layer.features[state.index],rows:arr().filter((row,i)=>!result.rowErrors[i]?.length),isCore});
  };
  const populatedLayers=target.layers.filter(layer=>layer.features&&layer.features.length);
  layerSel.innerHTML=populatedLayers.map(L=>`<option value="${L.id}">${escGeo(L.name)}</option>`).join('');layerSel.value=String(state.layer.id);
  layerSel.onchange=()=>{state.layer=populatedLayers.find(L=>String(L.id)===layerSel.value)||populatedLayers[0];state.index=0;state.page=0;renderFeatures();};
  featureSel.onchange=()=>{state.index=+featureSel.value||0;state.page=0;renderRows();};
  root.querySelectorAll('[data-page]').forEach(button=>button.onclick=()=>{state.page+=button.dataset.page==='next'?1:-1;renderRows();});
  root.querySelector('[data-act="add"]').onclick=()=>{const rows=arr(),de=rows.length?Number(rows.at(-1).ATE_M)||0:0;const row={};columns.forEach(c=>row[c.k]=c.num?(c.k==='DE_M'?de:c.k==='ATE_M'?de+1:null):'');rows.push(row);state.page=Math.floor((rows.length-1)/pageSize);renderRows();tbody.querySelector('tr:last-child input')?.focus();};
  const leave=callback=>{if(draft.hasChanges()&&!window.confirm('Descartar as alterações desta janela e continuar?'))return;draft.discard();root.remove();callback();};
  root.querySelector('[data-act="new"]').onclick=()=>leave(()=>arm('sondagem'));
  root.querySelector('[data-act="properties"]').onclick=()=>leave(()=>window.GeoMineGeology?.boreholeProperties?.open({layer:state.layer,index:state.index}));
  root.querySelector('[data-act="selected"]').onclick=()=>{const sel=S.selFeat;if(!populatedLayers.includes(sel?.layer)||!sel.layer.features[sel.idx]){toast('Selecione um ponto de sondagem no mapa primeiro.');return;}state.layer=sel.layer;state.index=sel.idx;state.page=0;layerSel.value=String(state.layer.id);renderFeatures();};
  root.querySelector('[data-act="map"]').onclick=()=>{
    if(draft.hasChanges()&&!window.confirm('Descartar as alterações desta janela e localizar o furo no mapa?'))return;
    S.activeId=state.layer.id;S.selFeat={layer:state.layer,layerId:state.layer.id,idx:state.index};draft.discard();root.remove();switchView('map');try{highlightSel();zoomToSel();}catch(e){}
  };
  root.querySelector('[data-act="csv"]').onclick=()=>{
    const result=draft.validationFor(state.layer,state.index);if(!result.valid){validation.textContent=result.errors.join(' · ');toast(result.errors[0]);return;}
    const headers=['FURO',...columns.map(c=>c.k)],name=boreholeName(state.layer.features[state.index],state.index),rows=arr();
    const csv=[headers.join(';'),...rows.map(r=>[name,...columns.map(c=>r[c.k]??'')].map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';'))].join('\n');
    downloadText((isCore?'testemunho_':'log_')+name.replace(/[^\w.-]+/g,'_')+'.csv',csv);
  };
  const close=()=>{draft.discard();root.remove();};
  root.querySelector('[data-act="close"]').onclick=close;root.querySelector('[data-act="cancel"]').onclick=close;
  root.querySelector('[data-act="done"]').onclick=()=>{
    const result=draft.commit();
    if(!result.valid){validation.textContent=result.errors.join(' · ');validation.className='gmgeo-preview invalid';toast(result.errors[0]);return;}
    try{target.layers.forEach(layer=>drawLayer(layer));refreshUI();}catch(e){}
    root.remove();toast(result.count?'Intervalos salvos.':'Nenhuma alteração nos intervalos.');
  };
  root.addEventListener('mousedown',event=>{if(event.target===root)close();});
  renderFeatures();
}

function structuralRows(){
  const planar=new Set(['acamamento','xistosidade','foliacao']),linear=new Set(['lineacao','plunging']);
  const out=[];
  (S.layers||[]).forEach(L=>{
    const kind=L&&L._geology&&L._geology.kind;if(!kind||(!planar.has(kind)&&!linear.has(kind)))return;
    (L.features||[]).forEach((feature,index)=>{
      const fm=window.GeoMineGeology&&window.GeoMineGeology.fieldMapping;
      if(fm&&typeof fm.isUsableObservation==='function'&&!fm.isUsableObservation(feature))return;
      const record=fm&&typeof fm.fieldRecord==='function'?fm.fieldRecord(L,feature,index):null,
        p=record&&record.values||feature.props||{};
      if(fm&&typeof fm.orientationOf==='function'){
        const orientation=fm.orientationOf(L,feature);
        if(!orientation.valid)return;
        const dir=planar.has(kind)?orientation.strike:orientation.azimuth,dip=planar.has(kind)?orientation.dip:orientation.plunge;
        if(!Number.isFinite(dir)||!Number.isFinite(dip))return;
        out.push({layer:L,index,kind,dir,dip,plane:planar.has(kind)});return;
      }
      let dir=intervalNumber(p.DIRECAO??p.AZIMUTE),dip=intervalNumber(p.MERGULHO??p.CAIMENTO);
      if(!Number.isFinite(dir)||!Number.isFinite(dip)||dir<0||dir>360||dip<0||dip>90)return;
      const ref=String(p.REF_ORIENT||L._geology.orientationRef||'strike_rhr').toLowerCase();
      if(planar.has(kind)&&/dip[_ -]?direction|dipdir|direcao[_ -]?merg/.test(ref))dir-=90;
      out.push({layer:L,index,kind,dir:((dir%360)+360)%360,dip,plane:planar.has(kind)});
    });
  });
  return out;
}
function openStereonet(){
  const rows=structuralRows();
  document.querySelector('.gmgeo-backdrop')?.remove();
  const root=document.createElement('div');root.className='gmgeo-backdrop';
  root.innerHTML=`<section class="gmgeo-modal gmgeo-stereo" role="dialog" aria-modal="true"><header class="gmgeo-head"><div><h2>Estereograma estrutural</h2><p>Rede de Schmidt · hemisfério inferior · direção RHR.</p></div><button class="gmgeo-x" data-act="close">×</button></header><div class="gmgeo-stereo-body"><canvas width="760" height="760"></canvas><aside><b>${rows.length} medida(s)</b><p>Planos são representados por seus polos; lineações e eixos, por trend/caimento.</p><div class="gmgeo-stereo-legend"><span class="plane">● Planos</span><span class="linear">● Lineações/eixos</span></div>${rows.length?'':'<p class="warn">Cadastre direção e mergulho/caimento nas camadas estruturais.</p>'}</aside></div><footer class="gmgeo-foot"><span class="gmgeo-hint">Prévia analítica; valores fora de 0–90° são ignorados.</span><button class="tbtn" data-act="png">Exportar PNG</button><button class="btn primary" data-act="done">Fechar</button></footer></section>`;
  document.body.appendChild(root);
  const canvas=root.querySelector('canvas'),ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height,cx=W/2,cy=H/2,R=W*.43;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#173b57';ctx.lineWidth=3;ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.stroke();
  ctx.lineWidth=1;ctx.strokeStyle='#c7d5e0';
  for(let a=0;a<360;a+=10){const q=(a-90)*Math.PI/180,major=a%90===0,r0=R*(major?.94:.975);ctx.beginPath();ctx.moveTo(cx+r0*Math.cos(q),cy+r0*Math.sin(q));ctx.lineTo(cx+R*Math.cos(q),cy+R*Math.sin(q));ctx.stroke();}
  for(let plunge=10;plunge<90;plunge+=10){const r=R*Math.SQRT2*Math.sin((90-plunge)*Math.PI/360);ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();}
  ctx.fillStyle='#173b57';ctx.font='700 22px Signika, sans-serif';ctx.textAlign='center';ctx.fillText('N',cx,cy-R-13);ctx.fillText('S',cx,cy+R+30);ctx.fillText('E',cx+R+20,cy+7);ctx.fillText('W',cx-R-20,cy+7);
  rows.forEach(row=>{
    const trend=row.plane?(row.dir+270)%360:row.dir,plunge=row.plane?90-row.dip:row.dip;
    const radius=R*Math.SQRT2*Math.sin((90-plunge)*Math.PI/360),q=(trend-90)*Math.PI/180,x=cx+radius*Math.cos(q),y=cy+radius*Math.sin(q);
    ctx.beginPath();ctx.arc(x,y,row.plane?6:7,0,Math.PI*2);ctx.fillStyle=row.plane?'#f09a21':'#1687a7';ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle='#173b57';ctx.stroke();
  });
  const close=()=>root.remove();root.querySelector('[data-act="close"]').onclick=close;root.querySelector('[data-act="done"]').onclick=close;
  root.querySelector('[data-act="png"]').onclick=()=>{const a=document.createElement('a');a.download='estereograma_geologia.png';a.href=canvas.toDataURL('image/png');a.click();};
}

function showStructuralMap(){
  const kinds=new Set(['contato-geologico','falha','dobra','acamamento','xistosidade','fratura','veio','dique','zona-cisalhamento','lineacao','foliacao','plunging']);
  const layers=(S.layers||[]).filter(L=>L&&L._geology&&kinds.has(L._geology.kind));
  if(!layers.length){arm('acamamento');toast('A camada estrutural foi criada; registre as primeiras medidas no mapa.');return;}
  layers.forEach(L=>{L.visible=true;try{drawLayer(L);}catch(e){}});S.activeId=layers[0].id;switchView('map');refreshUI();fitAll();toast(`Mapa estrutural: ${layers.length} camada(s) visível(is).`);
}
function open3D(){
  const layers=(S.layers||[]).filter(L=>L&&L._geology);
  if(!layers.length){toast('Crie ou importe camadas geológicas antes de abrir a prévia 3D.');return;}
  switchView('v3d');setTimeout(()=>{try{if(typeof mina3DAuto==='function')mina3DAuto(true);else if(typeof build3D==='function')build3D();}catch(e){console.warn('Geologia 3D',e);}},60);
  toast('Visualização geológica 3D: malhas, sondagens e camadas visíveis do projeto. Esta prévia não calcula volumes geológicos.');
}
function run(kind,button){
  try{
    if(GEOLOGY_TOOL_DEFS[kind])return arm(kind);
    if(kind==='mapeamento-campo'){
      const fm=window.GeoMineGeology&&window.GeoMineGeology.fieldMapping;
      if(fm&&typeof fm.openFieldMapping==='function')return fm.openFieldMapping(typeof activeLayer==='function'?activeLayer():null);
      toast('O módulo de mapeamento de campo não foi carregado.');return;
    }
    if(kind==='ficha-campo'){
      const fm=window.GeoMineGeology&&window.GeoMineGeology.fieldMapping;
      if(fm&&typeof fm.openSelectedObservation==='function')return fm.openSelectedObservation();
      toast('O módulo de ficha geológica não foi carregado.');return;
    }
    if(kind==='log-sondagem')return openBoreholeEditor('log');
    if(kind==='testemunho')return openBoreholeEditor('core');
    if(kind==='importar-furos-string'||kind==='importar-furos-csv'){
      const importer=window.GeoMineGeology&&window.GeoMineGeology.boreholes;
      if(importer&&typeof importer.open==='function')return importer.open(kind==='importar-furos-string'?'str':'csv');
      toast('O módulo de importação de sondagens não foi carregado.');return;
    }
    if(kind==='modelo-geologico-3d')return open3D();
    if(kind==='surpac-superficies')return window.GeoMineGeology?.meshes?.open();
    if(kind==='secao-geologica'){
      if(window.GeoMineGeology&&typeof window.GeoMineGeology.openSection==='function')return window.GeoMineGeology.openSection(button);
      toast('O módulo de seções geológicas não foi carregado.');return;
    }
    if(kind==='mapa-estrutural')return showStructuralMap();
    if(kind==='estereograma')return openStereonet();
    toast('Comando geológico não reconhecido: '+kind);
  }catch(error){console.error('GeoMine Geologia',error);toast('Geologia: '+(error&&error.message||error));}
}

ensureState();
window.GEOLOGY_TOOL_DEFS=GEOLOGY_TOOL_DEFS;
window.GeoMineGeology=Object.assign(window.GeoMineGeology||{}, {
  schemaVersion:SCHEMA_VERSION,presets:GEOLOGY_TOOL_DEFS,run,arm,createOrActivate,activateLayer,applyPreset,
  ensureGroup:geologyGroup,openBoreholeEditor,validateBoreholeIntervals,createBoreholeIntervalDraft,openStereonet,showStructuralMap,open3D,
  state:ensureState,snapshot,restore
});
})();
