/* ==========================================================================
   GeoMine — mapeamento de campo e adoção de camadas geológicas.

   Este módulo não altera silenciosamente geometria, nome, estilo nem posição
   na árvore. Ele registra a função geológica da camada, mantém um mapa entre
   os atributos originais e o esquema GeoMine e acrescenta proveniência por
   feição. Assim SHP, GeoJSON, GPX, CSV e dados SGB podem alimentar seções sem
   perder seus campos de origem.
   ========================================================================== */
(function(){
'use strict';

const api=window.GeoMineGeology=window.GeoMineGeology||{};
const FIELD_SCHEMA_VERSION=1;
const LAYER_SCHEMA_VERSION=2;
const PLANAR=new Set(['acamamento','xistosidade','foliacao','falha','fratura','veio','dique','zona-cisalhamento']);
const LINEAR=new Set(['lineacao','plunging','dobra']);
const NONNEGATIVE=new Set(['PREC_LOC_M','PREC_ORI_G','ABERTURA','ESP_M','LARGURA_M','PROF_M','COMPR_M','NSPT','NA_M','REJEITO_M','DENSIDADE','TEOR']);
const REQUIRED={
  litologia:['LITOLOGIA'],
  'contato-geologico':['TIPO'],
  sondagem:['ID_FURO'],spt:['ID_SPT'],afloramento:['CODIGO'],
  'ponto-amostra':['COD_AMOSTRA'],'dominio-geologico':['DOMINIO']
};
const ENUMS={
  REF_ORIENT:[['','— confirme a convenção —'],['strike_rhr','Strike — regra da mão direita'],['dip_direction','Direção do mergulho']],
  CONFIANCA:[['','— não informado —'],['alta','Alta'],['media','Média'],['baixa','Baixa']],
  QUALIDADE:[['','— não informado —'],['boa','Boa'],['media','Média'],['baixa','Baixa']],
  STATUS:[['','— não informado —'],['planejado','Planejado'],['em_andamento','Em andamento'],['concluido','Concluído'],['abandonado','Abandonado']]
};
const ALIASES={
  FID:['FID','ID','OBJECTID','OGC_FID'],ID:['ID','CODIGO','COD','ID_MEDIDA'],CODIGO:['CODIGO','COD','ID'],
  ID_FURO:['ID_FURO','FURO','BOREHOLE','HOLEID','HOLE_ID'],ID_SPT:['ID_SPT','SPT','FURO'],
  COD_AMOSTRA:['COD_AMOSTRA','AMOSTRA','SAMPLE','SAMPLE_ID'],
  DIRECAO:['DIRECAO','DIREÇÃO','STRIKE','RUMO','AZIMUTE','AZIMUTH','DIPDIR','DIP_DIR','DIP_DIRECTION'],
  AZIMUTE:['AZIMUTE','AZIMUTH','DIRECAO','DIREÇÃO','BEARING'],
  MERGULHO:['MERGULHO','DIP','INCLINACAO','INCLINAÇÃO'],
  CAIMENTO:['CAIMENTO','PLUNGE','MERGULHO'],REF_ORIENT:['REF_ORIENT','ORIENT_REF','CONVENCAO','CONVENÇÃO'],
  PROF_M:['PROF_M','PROFUNDIDADE','DEPTH','DEPTH_M'],INCLINACAO:['INCLINACAO','INCLINAÇÃO','INCLINATION'],
  ESP_M:['ESP_M','ESPESSURA','THICKNESS'],LARGURA_M:['LARGURA_M','LARGURA','WIDTH'],
  COMPR_M:['COMPR_M','COMPRIMENTO','LENGTH'],COTA_BOCA:['COTA_BOCA','COLLAR_Z','ELEVATION'],
  UNIDADE:['UNIDADE','UNIT','UNID','FORMACAO','FORMAÇÃO','LITO','LITHOLOGY'],LITOLOGIA:['LITOLOGIA','LITO','LITHOLOGY','ROCHA'],
  DOMINIO:['DOMINIO','DOMÍNIO','DOMAIN'],TIPO:['TIPO','TYPE','CLASSE','CLASS'],
  CONFIANCA:['CONFIANCA','CONFIANÇA','CONFIDENCE'],QUALIDADE:['QUALIDADE','QUALITY'],
  FONTE:['FONTE','SOURCE','ORIGEM'],DATA:['DATA','DATE','DATA_CAMPO','OBS_DATE'],OBS:['OBS','OBSERVACAO','OBSERVAÇÃO','NOTES','DESCRICAO','DESCRIÇÃO'],
  PREC_LOC_M:['PREC_LOC_M','ACCURACY','PRECISAO_M','PRECISÃO_M','ERRO_M'],
  PREC_ORI_G:['PREC_ORI_G','ORI_ACC','PRECISAO_G','PRECISÃO_G','ERRO_GRAU']
};

function clone(value){
  try{if(typeof structuredClone==='function')return structuredClone(value);}catch(_){}
  // Preserva valores não finitos até a validação; JSON os transformaria em
  // null e uma medida inválida importada pareceria apenas não preenchida.
  if(value===null||typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(clone);
  if(value instanceof Date)return new Date(value.getTime());
  return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,clone(item)]));
}
function esc(value){return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function norm(value){return String(value==null?'':value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'').toUpperCase();}
function now(){return new Date().toISOString();}
function uuid(){
  try{if(crypto&&typeof crypto.randomUUID==='function')return crypto.randomUUID();}catch(_){}
  return 'geo-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,11);
}
function definition(kind){return api.presets&&api.presets[kind]||window.GEOLOGY_TOOL_DEFS&&window.GEOLOGY_TOOL_DEFS[kind]||null;}
function definitions(){return api.presets||window.GEOLOGY_TOOL_DEFS||{};}
function fieldsOf(layer){return Array.isArray(layer&&layer.fields)?layer.fields:[];}
function compatibleKinds(layer){
  if(!layer)return [];
  return Object.entries(definitions()).filter(([,def])=>def&&def.gtype===layer.gtype).map(([kind,def])=>({kind,def}));
}
function actualField(layer,name){
  const key=norm(name);return fieldsOf(layer).find(field=>norm(field.name)===key)?.name||'';
}
function inferOne(layer,canonical){
  const fields=fieldsOf(layer).filter(field=>canonical!=='FID'||['N','F'].includes(String(field.type||'').toUpperCase())),
    candidates=[canonical,...(ALIASES[canonical]||[])].map(norm);
  let found=candidates.map(candidate=>fields.find(field=>norm(field.name)===candidate)).find(Boolean);
  if(found)return found.name;
  found=fields.find(field=>norm(field.name).length>3&&candidates.some(candidate=>candidate.length>3&&(norm(field.name).startsWith(candidate)||candidate.startsWith(norm(field.name)))));
  return found?found.name:'';
}
function inferFieldMap(layer,kind){
  const def=definition(kind),map={};if(!layer||!def)return map;
  (def.fields||[]).forEach(field=>{map[field.name]=inferOne(layer,field.name);});
  return map;
}
function mappedField(layer,canonical){
  const map=layer&&layer._geology&&layer._geology.fieldMap||{};
  return map[canonical]||actualField(layer,canonical)||inferOne(layer,canonical)||canonical;
}
function fieldValue(layer,feature,canonical){
  const props=feature&&feature.props||{},name=mappedField(layer,canonical);
  if(Object.prototype.hasOwnProperty.call(props,name))return props[name];
  // Um mapeamento explícito não pode buscar silenciosamente outro atributo
  // homônimo quando a observação não preencheu o campo escolhido.
  if(layer&&layer._geology&&layer._geology.fieldMap&&layer._geology.fieldMap[canonical])return undefined;
  const fallback=inferOne({fields:Object.keys(props).map(name=>({name}))},canonical);
  return fallback?props[fallback]:undefined;
}
function orientationReference(layer,feature){
  const explicit=fieldValue(layer,feature,'REF_ORIENT');
  if(explicit!=null&&String(explicit).trim()!=='')return String(explicit).trim().toLowerCase();
  const inherited=layer&&layer._geology&&layer._geology.orientationRef;
  if(inherited!=null&&String(inherited).trim()!=='')return String(inherited).trim().toLowerCase();
  const props=feature&&feature.props||{},mapped=layer&&layer._geology&&layer._geology.fieldMap&&layer._geology.fieldMap.DIRECAO,
    source=mapped||actualField(layer,'DIRECAO')||inferOne(layer,'DIRECAO')||inferOne({fields:Object.keys(props).map(name=>({name}))},'DIRECAO');
  if(norm(source)==='STRIKE')return 'strike_rhr';
  if(['DIPDIR','DIPDIRECTION'].includes(norm(source)))return 'dip_direction';
  return '';
}
function canonicalValues(layer,feature,kind){
  kind=kind||layer&&layer._geology&&layer._geology.kind;
  const def=definition(kind),values={};
  (def&&def.fields||fieldsOf(layer)).forEach(field=>{values[field.name]=fieldValue(layer,feature,field.name);});
  if(PLANAR.has(kind)){
    values.DIRECAO=fieldValue(layer,feature,'DIRECAO');values.MERGULHO=fieldValue(layer,feature,'MERGULHO');
    values.REF_ORIENT=orientationReference(layer,feature);
  }else if(LINEAR.has(kind)){
    const key=kind==='dobra'?'AZIMUTE':'DIRECAO';
    values[key]=fieldValue(layer,feature,key);values.CAIMENTO=fieldValue(layer,feature,'CAIMENTO');
  }
  return values;
}
function createFieldMeta(layer,feature,context){
  context=context||{};const prior=feature&&feature._field&&typeof feature._field==='object'?feature._field:{};
  const imported=context.source&&context.source!=='manual-map';
  return Object.assign({schemaVersion:FIELD_SCHEMA_VERSION,id:uuid(),origin:'observed',source:imported?'import':'manual-map',
    sourceFile:'',importedAt:imported?now():'',observedAt:imported?'':now(),operator:'',accuracyM:null,
    orientationAccuracyDeg:null,altitudeSource:'unknown',identityConfidence:'',status:'draft',errors:[],attachments:[]},
    clone(prior)||{},context,{schemaVersion:FIELD_SCHEMA_VERSION,id:prior.id||context.id||uuid()});
}
function numberOrNull(value){
  if(value==null||(typeof value==='string'&&value.trim()===''))return null;
  if(typeof value!=='number'&&typeof value!=='string')return NaN;
  const text=typeof value==='string'?value.trim().replace(/^([+-]?\d+),(\d+)$/,'$1.$2'):value,
    n=Number(text);return Number.isFinite(n)?n:NaN;
}
function directionOrNull(value){const n=numberOrNull(value);return n===360?0:n;}
function validateObservation(kind,props,meta){
  // JSON-clone transforma NaN/Infinity em null e escondia erros preenchidos.
  props={...(props||{})};meta={...(meta||{})};const errors=[],warnings=[];
  const numeric=new Map((definition(kind)?.fields||[]).filter(f=>f.type==='N'||f.type==='F').map(f=>[f.name,f]));
  ['DIRECAO','AZIMUTE','MERGULHO','CAIMENTO','INCLINACAO',...NONNEGATIVE].forEach(key=>{
    if(Object.prototype.hasOwnProperty.call(props,key)&&!numeric.has(key))numeric.set(key,{name:key});
  });
  numeric.forEach((field,key)=>{
    const value=numberOrNull(props[key]);
    if(value===null){props[key]=null;return;}
    if(!Number.isFinite(value)){errors.push(key+' não é um número finito válido.');return;}
    if(['DIRECAO','AZIMUTE'].includes(key)){
      if(value<0||value>360)errors.push(key+' deve estar entre 0° e 360° (360° equivale a 0°).');
      else props[key]=directionOrNull(value);
    }else if(['MERGULHO','CAIMENTO','INCLINACAO'].includes(key)){
      if(value<0||value>90)errors.push(key+' deve estar entre 0° e 90°.');
      else props[key]=value;
    }else if(NONNEGATIVE.has(key)&&value<0)errors.push(key+' deve ser zero ou positivo.');
    else if(key==='NSPT'&&!Number.isInteger(value))errors.push('NSPT deve ser um número inteiro de golpes.');
    else props[key]=value;
  });
  const directionKey=PLANAR.has(kind)?'DIRECAO':LINEAR.has(kind)?(kind==='dobra'?'AZIMUTE':'DIRECAO'):kind==='sondagem'?'AZIMUTE':null;
  const dipKey=PLANAR.has(kind)?'MERGULHO':LINEAR.has(kind)?'CAIMENTO':null;
  if(directionKey){
    const partner=dipKey||(kind==='sondagem'?'INCLINACAO':null),direction=numberOrNull(props[directionKey]),dip=numberOrNull(props[partner]);
    if(direction==null&&dip==null&&kind!=='sondagem')warnings.push('Informe direção e '+partner.toLowerCase()+'.');
    else if((direction==null)!=(dip==null))warnings.push('Direção e '+partner.toLowerCase()+' devem formar um par completo.');
    if(PLANAR.has(kind)){
      const ref=String(props.REF_ORIENT||meta.orientationRef||'').trim().toLowerCase();
      if(ref&&!['strike_rhr','dip_direction'].includes(ref))errors.push('REF_ORIENT deve ser strike_rhr ou dip_direction.');
      else if(direction!=null&&dip!=null&&!ref)warnings.push('Informe se a direção é strike RHR ou direção do mergulho.');
      if(ref)props.REF_ORIENT=ref;
    }
  }
  ['accuracyM','orientationAccuracyDeg'].forEach(key=>{
    if(meta[key]==null||String(meta[key]).trim()===''){meta[key]=null;return;}
    const value=numberOrNull(meta[key]);if(!Number.isFinite(value)||value<0)errors.push(key+' deve ser zero ou positivo.');else meta[key]=value;
  });
  if(meta.observedAt&&!Number.isFinite(new Date(meta.observedAt).getTime()))errors.push('Data/hora observada inválida.');
  (REQUIRED[kind]||[]).forEach(key=>{if(props[key]==null||String(props[key]).trim()==='')warnings.push(key+' não foi informado.');});
  const status=errors.length?'invalid':warnings.length?'draft':'valid';
  meta.status=status;meta.errors=errors.concat(warnings);meta.schemaVersion=FIELD_SCHEMA_VERSION;
  return {valid:status==='valid',status,props,meta,errors,warnings,normalized:{props,meta}};
}
/* Contrato único para símbolo, estereograma e seção. Valores ausentes nunca
   viram norte/mergulho zero. Lineações usam azimute+caimento, não polos de plano. */
function orientationOf(layer,feature){
  const kind=layer&&layer._geology&&layer._geology.kind,type=PLANAR.has(kind)?'planar':LINEAR.has(kind)?'linear':kind==='sondagem'?'borehole':null,
    values=canonicalValues(layer,feature,kind),key=kind==='dobra'||type==='borehole'?'AZIMUTE':'DIRECAO',
    dipKey=type==='linear'?'CAIMENTO':type==='borehole'?'INCLINACAO':'MERGULHO',
    direction=directionOrNull(values[key]),angle=numberOrNull(values[dipKey]),ref=orientationReference(layer,feature),errors=[];
  if(!type)errors.push('A camada não representa uma orientação geológica.');
  if(direction===null||!Number.isFinite(direction)||direction<0||direction>=360)errors.push('Direção ausente ou inválida.');
  if(angle===null||!Number.isFinite(angle)||angle<0||angle>90)errors.push('Mergulho/caimento ausente ou inválido.');
  if(type==='planar'&&!['strike_rhr','dip_direction'].includes(ref))errors.push('Convenção da orientação ausente ou inválida.');
  const valid=errors.length===0,strike=valid&&type==='planar'?(ref==='dip_direction'?(direction+270)%360:direction):null;
  return {valid,type,kind,ref,errors,warnings:[],direction:valid?direction:null,
    azimuth:valid?direction:null,strike,dipDirection:strike===null?null:(strike+90)%360,
    dip:valid&&type==='planar'?angle:null,plunge:valid&&type==='linear'?angle:null,
    inclination:valid&&type==='borehole'?angle:null};
}
function toLocalDateTime(value){
  if(!value)return '';const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
  const pad=(n,len=2)=>String(n).padStart(len,'0');
  return `${pad(date.getFullYear(),4)}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`+
    (date.getSeconds()||date.getMilliseconds()?':'+pad(date.getSeconds()):'')+
    (date.getMilliseconds()?'.'+pad(date.getMilliseconds(),3):'');
}
function fromLocalDateTime(value,originalValue){
  if(!value)return '';
  // Preserva inclusive o lado correto de uma hora repetida no fim do horário
  // de verão quando o usuário apenas abriu e salvou a ficha sem alterar a data.
  if(originalValue&&value===toLocalDateTime(originalValue))return new Date(originalValue).toISOString();
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if(!match)return null;
  const [year,month,day,hour,minute,second,ms]=[+match[1],+match[2],+match[3],+match[4],+match[5],+(match[6]||0),+(match[7]||'').padEnd(3,'0')],
    date=new Date(year,month-1,day,hour,minute,second,ms);
  if(date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day||date.getHours()!==hour||date.getMinutes()!==minute||date.getSeconds()!==second)return null;
  return date.toISOString();
}
function isUsableObservation(feature){
  const status=feature&&feature._field&&feature._field.status;
  return status==null||status===''||status==='valid';
}
function fieldRecord(layer,feature,index){
  const kind=String(layer&&layer._geology&&layer._geology.kind||''),meta=createFieldMeta(layer,feature,feature&&feature._field||{}),
    values=canonicalValues(layer,feature,kind),check=validateObservation(kind,values,meta);
  const stored=feature&&feature._field&&feature._field.status;
  return {layerId:layer&&layer.id,featureIndex:index,kind,values:check.props,meta:Object.assign(meta,check.meta),status:check.status==='invalid'?'invalid':stored&&stored!=='valid'?stored:check.status,feature};
}
function ensureCanonicalFields(layer,kind,fieldMap){
  const def=definition(kind);if(!def)return fieldMap;
  layer.fields=fieldsOf(layer);layer.features=Array.isArray(layer.features)?layer.features:[];
  (def.fields||[]).forEach(field=>{
    let source=fieldMap[field.name]||actualField(layer,field.name);
    if(field.name==='FID'&&!fieldMap.FID&&source){
      const original=layer.fields.find(f=>f.name===source);
      if(original&&!['N','F'].includes(String(original.type||'').toUpperCase()))source='';
    }
    if(!source){
      source=field.name;
      if(actualField(layer,source)){
        let suffix=1;while(actualField(layer,source=field.name+'_GEO'+(suffix===1?'':suffix)))suffix++;
      }
      layer.fields.push({...clone(field),name:source});
      layer.features.forEach((feature,index)=>{
        feature.props=feature.props||{};
        feature.props[source]=field.name==='FID'?index:(field.type==='N'||field.type==='F'?null:'');
      });
    }
    fieldMap[field.name]=source;
  });
  return fieldMap;
}
function adoptLayer(layer,options){
  options=options||{};const kind=String(options.kind||''),def=definition(kind);
  if(!layer||!def)throw new Error('Escolha uma camada e um tipo geológico.');
  if(layer.gtype!==def.gtype)throw new Error(`“${def.name}” exige geometria ${def.gtype}; a camada é ${layer.gtype}.`);
  if(PLANAR.has(kind)&&!['strike_rhr','dip_direction'].includes(String(options.orientationRef||'')))
    throw new Error('Informe se a direção representa strike RHR ou direção do mergulho.');
  const oldGroup=layer.groupId,fieldMap=ensureCanonicalFields(layer,kind,Object.assign({},options.fieldMap||inferFieldMap(layer,kind)));
  layer._geology=Object.assign({},layer._geology||{}, {schemaVersion:LAYER_SCHEMA_VERSION,kind,family:def.family||'geologia',
    source:options.source||'imported',sourceFile:options.sourceFile||layer._geology&&layer._geology.sourceFile||'',
    adoptedAt:layer._geology&&layer._geology.adoptedAt||now(),orientationRef:options.orientationRef||'',fieldMap});
  if(options.applyStyle&&typeof api.applyPreset==='function')api.applyPreset(layer,def,kind,{moveToGroup:!!options.moveToGeologyGroup});
  if(options.moveToGeologyGroup&&typeof api.ensureGroup==='function')layer.groupId=api.ensureGroup().id;
  else layer.groupId=oldGroup;
  (layer.features||[]).forEach((feature,index)=>{
    feature.props=feature.props||{};
    const values=canonicalValues(layer,feature,kind),existing=feature._field&&typeof feature._field==='object'?feature._field:{},
      meta=createFieldMeta(layer,feature,Object.assign({source:options.source||existing.source||'import',origin:options.origin||existing.origin||'observed',
        sourceFile:options.sourceFile||existing.sourceFile||'',importedAt:existing.importedAt||now(),observedAt:existing.observedAt||''},existing)),
      check=validateObservation(kind,values,meta);
    feature._field=Object.assign(meta,check.meta,{status:check.status,errors:check.errors.concat(check.warnings)});
    if(fieldMap.FID&&feature.props[fieldMap.FID]==null)feature.props[fieldMap.FID]=index;
  });
  try{if(typeof drawLayer==='function')drawLayer(layer);}catch(e){console.warn('Geologia: redesenho da camada adotada',e);}
  try{if(typeof refreshUI==='function')refreshUI();if(typeof propRefresh==='function')propRefresh();}catch(e){}
  return layer;
}

function optionHTML(value,label,selected){return `<option value="${esc(value)}"${String(value)===String(selected)?' selected':''}>${esc(label)}</option>`;}
function fieldLabel(kind,name){return api.standards?.fieldLabel(name,kind)||name;}
function standardNote(kind){const text=api.standards?.description(kind);return text?`<p class="gmgeo-note" data-geology-standard>${esc(text)}</p>`:'';}
function closeExisting(){document.querySelector('.gmgeo-field-backdrop')?.remove();}
function layerById(id){return (S.layers||[]).find(layer=>String(layer.id)===String(id));}
function notify(message){try{if(typeof toast==='function')toast(message);else console.info(message);}catch(_){}}
function sourceGuess(layer){return String(layer&&[layer.sourceFile,layer.fileName,layer._sourceName,layer.name].find(Boolean)||'');}

function openFieldMapping(initialLayer){
  const layers=(S.layers||[]).filter(layer=>layer&&['point','line','polygon'].includes(layer.gtype));
  if(!layers.length){notify('Importe ou crie uma camada vetorial antes de adotá-la como geológica.');return false;}
  let current=initialLayer&&layers.includes(initialLayer)?initialLayer:layers.find(layer=>layer.id===S.activeId)||layers[0];
  closeExisting();const root=document.createElement('div');root.className='gmgeo-backdrop gmgeo-field-backdrop';
  root.innerHTML=`<section class="gmgeo-modal gmgeo-adopt" role="dialog" aria-modal="true" aria-label="Adotar camada geológica">
    <header class="gmgeo-head"><div><h2>Adotar camada como geológica</h2><p>Preserva os campos, a geometria, o estilo e a posição da camada por padrão.</p></div><button class="gmgeo-x" data-act="close" aria-label="Fechar">×</button></header>
    <div class="gmgeo-form-body"><div class="gmgeo-grid gmgeo-grid3">
      <label>Camada vetorial<select data-role="layer"></select></label>
      <label>Função geológica<select data-role="kind"></select></label>
      <label>Natureza dos dados<select data-role="origin"><option value="observed">Observação de campo</option><option value="interpreted">Interpretação</option><option value="assumed">Hipótese / assumido</option></select></label>
    </div><div class="gmgeo-grid gmgeo-grid2 gmgeo-orientation" hidden>
      <label>Convenção da direção<select data-role="orientation"><option value="">— confirme a convenção —</option><option value="strike_rhr">Strike — regra da mão direita</option><option value="dip_direction">Direção do mergulho</option></select></label>
      <div class="gmgeo-note">Esta escolha evita girar as atitudes em 90° por interpretação incorreta.</div>
    </div><label class="gmgeo-wide">Arquivo / fonte<input data-role="source" type="text" maxlength="180"></label>
    <section class="gmgeo-map-card"><div><b>Correspondência de atributos</b><p>O campo GeoMine fica ligado ao atributo original. Se deixar “criar”, o programa acrescenta apenas esse campo.</p></div><div class="gmgeo-map-grid" data-role="mapping"></div></section>
    <div class="gmgeo-preview" data-role="preview"></div>
    <div class="gmgeo-checks"><label><input data-role="move" type="checkbox"> Mover para o grupo Geologia</label><label><input data-role="style" type="checkbox"> Aplicar simbologia geológica padrão</label></div></div>
    <footer class="gmgeo-foot"><span class="gmgeo-hint">A adoção é idempotente: pode revisar o mapeamento depois sem duplicar dados.</span><button class="tbtn" data-act="cancel">Cancelar</button><button class="btn primary" data-act="apply">Adotar camada</button></footer>
  </section>`;
  document.body.appendChild(root);
  const layerSel=root.querySelector('[data-role="layer"]'),kindSel=root.querySelector('[data-role="kind"]'),mapping=root.querySelector('[data-role="mapping"]'),
    orientation=root.querySelector('[data-role="orientation"]'),orientationRow=root.querySelector('.gmgeo-orientation'),source=root.querySelector('[data-role="source"]'),preview=root.querySelector('[data-role="preview"]');
  layerSel.innerHTML=layers.map(layer=>optionHTML(layer.id,`${layer.name} · ${layer.gtype} · ${(layer.features||[]).length} feições`,current.id)).join('');
  function selectedKind(){return kindSel.value||'';}
  function mapFromUI(){const out={};mapping.querySelectorAll('select[data-canonical]').forEach(select=>{out[select.dataset.canonical]=select.value;});return out;}
  function renderPreview(){
    const kind=selectedKind(),def=definition(kind);if(!def){preview.textContent='Escolha uma função geológica.';return;}
    const map=mapFromUI();let valid=0,draft=0,invalid=0;
    (current.features||[]).forEach(feature=>{
      const values={};(def.fields||[]).forEach(field=>values[field.name]=map[field.name]?feature.props&&feature.props[map[field.name]]:null);
      if(PLANAR.has(kind)&&!values.REF_ORIENT)values.REF_ORIENT=orientation.value;
      const check=validateObservation(kind,values,{orientationRef:orientation.value});
      if(check.status==='valid')valid++;else if(check.status==='invalid')invalid++;else draft++;
    });
    preview.innerHTML=`<b>Prévia:</b> ${valid} válida(s) · ${draft} incompleta(s) · ${invalid} inválida(s). <span>Nada é descartado; incompletas ficam como rascunho.</span>`;
  }
  function renderMapping(){
    const kind=selectedKind(),def=definition(kind),saved=current._geology&&current._geology.kind===kind?current._geology.fieldMap:null,inferred=inferFieldMap(current,kind);
    orientationRow.hidden=!PLANAR.has(kind);orientation.value=current._geology&&current._geology.orientationRef||'';
    mapping.innerHTML=(def&&def.fields||[]).filter(field=>field.name!=='FID').map(field=>{
      const selected=saved&&saved[field.name]||inferred[field.name]||'';
      return `<label><span title="Atributo: ${esc(field.name)}">${esc(fieldLabel(kind,field.name))} <small>${field.type==='C'?'texto':'número'}</small></span><select data-canonical="${esc(field.name)}">${optionHTML('',`— criar ${field.name} —`,selected)}${fieldsOf(current).map(sourceField=>optionHTML(sourceField.name,sourceField.name,selected)).join('')}</select></label>`;
    }).join('');
    mapping.querySelectorAll('select').forEach(select=>select.onchange=renderPreview);orientation.onchange=renderPreview;renderPreview();
  }
  function renderKinds(){
    const compatible=compatibleKinds(current),selected=current._geology&&definition(current._geology.kind)&&current._geology.kind||compatible[0]?.kind||'';
    kindSel.innerHTML=compatible.map(({kind,def})=>optionHTML(kind,def.name,kind===selected?selected:'')).join('');
    source.value=current._geology&&current._geology.sourceFile||sourceGuess(current);renderMapping();
  }
  layerSel.onchange=()=>{current=layerById(layerSel.value)||current;renderKinds();};kindSel.onchange=renderMapping;
  const close=()=>root.remove();root.querySelector('[data-act="close"]').onclick=close;root.querySelector('[data-act="cancel"]').onclick=close;
  root.addEventListener('mousedown',event=>{if(event.target===root)close();});
  root.querySelector('[data-act="apply"]').onclick=()=>{
    try{
      adoptLayer(current,{kind:selectedKind(),fieldMap:mapFromUI(),orientationRef:orientation.value,origin:root.querySelector('[data-role="origin"]').value,
        sourceFile:source.value.trim(),source:'import',moveToGeologyGroup:root.querySelector('[data-role="move"]').checked,applyStyle:root.querySelector('[data-role="style"]').checked});
      S.activeId=current.id;close();notify(`“${current.name}” agora é uma camada geológica tipada.`);
    }catch(error){notify('Geologia: '+(error&&error.message||error));}
  };
  renderKinds();return true;
}

function fieldControl(field,value){
  const options=ENUMS[field.name];
  if(options){
    const imported=value!=null&&String(value)!==''&&!options.some(([v])=>String(v)===String(value))
      ?optionHTML(value,String(value)+' — valor importado (revise)',value):'';
    return `<select data-field="${esc(field.name)}">${imported}${options.map(([v,label])=>optionHTML(v,label,value??'')).join('')}</select>`;
  }
  if(field.name==='OBS')return `<textarea data-field="${esc(field.name)}" maxlength="${field.length||500}">${esc(value??'')}</textarea>`;
  if(field.name==='DATA'){
    const raw=String(value||''),day=raw.slice(0,10),date=day&&new Date(day+'T00:00:00Z'),
      valid=!raw||/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===day;
    return `<input data-field="${esc(field.name)}" type="${valid?'date':'text'}" value="${esc(valid?day:raw)}">`;
  }
  const numeric=field.type==='N'||field.type==='F',range=/^(DIRECAO|AZIMUTE)$/.test(field.name)?' min="0" max="360"':/^(MERGULHO|CAIMENTO|INCLINACAO)$/.test(field.name)?' min="0" max="90"':NONNEGATIVE.has(field.name)?' min="0"':'',
    parsed=numeric?numberOrNull(value):null,invalid=numeric&&parsed!==null&&!Number.isFinite(parsed),
    displayed=numeric?(invalid?(value&&typeof value==='object'?JSON.stringify(value):String(value)):parsed??''):value??'',
    hint=(field.name==='INCLINACAO'?'<small>Graus para baixo a partir da horizontal: 0° horizontal, 90° vertical.</small>':'')+
      (invalid?'<small>Valor importado inválido. Corrija ou limpe explicitamente este campo.</small>':'');
  // type=number apaga um valor importado não numérico já na criação do DOM.
  // Mantê-lo visível como texto evita transformar um erro em nulo ao salvar.
  return `<input data-field="${esc(field.name)}" type="${numeric&&!invalid?'number':'text'}"${numeric?(invalid?' inputmode="decimal"':' step="'+(field.name==='NSPT'?'1':'any')+'"'+range):` maxlength="${field.length||254}"`} value="${esc(displayed)}">${hint}`;
}
function openObservationForm(layer,feature,options){
  options=options||{};if(!layer||!feature||!layer._geology)return false;
  const kind=layer._geology.kind,def=definition(kind);if(!def)return false;
  closeExisting();const originalProps=clone(feature.props||{})||{},originalMeta=clone(feature._field||{})||{},values=canonicalValues(layer,feature,kind),
    meta=createFieldMeta(layer,feature,originalMeta),root=document.createElement('div');root.className='gmgeo-backdrop gmgeo-field-backdrop';
  root.innerHTML=`<section class="gmgeo-modal gmgeo-observation" role="dialog" aria-modal="true" aria-label="Ficha geológica">
    <header class="gmgeo-head"><div><h2>Ficha geológica · ${esc(def.name)}</h2><p>${esc(layer.name)} · os campos vazios permanecem nulos, nunca viram zero.</p></div><button class="gmgeo-x" data-act="close" aria-label="Fechar">×</button></header>
    <div class="gmgeo-form-body">${standardNote(kind)}<section class="gmgeo-fields" data-role="fields">${(def.fields||[]).filter(field=>field.name!=='FID').map(field=>`<label><span title="Atributo: ${esc(field.name)}">${esc(fieldLabel(kind,field.name))}${field.type==='N'||field.type==='F'?' <small>número</small>':''}</span>${fieldControl(field,values[field.name])}</label>`).join('')}</section>
    <section class="gmgeo-provenance"><h3>Proveniência da observação</h3><div class="gmgeo-grid gmgeo-grid3">
      <label>Natureza do dado<select data-meta="origin"><option value="observed">Observado em campo</option><option value="interpreted">Interpretado</option><option value="assumed">Hipótese / assumido</option></select></label>
      <label>Origem<select data-meta="source"><option value="manual-map">Digitado no mapa</option><option value="coordinate">Coordenada informada</option><option value="import">Importação</option><option value="gpx">GPX</option><option value="csv">CSV</option><option value="sgb">SGB</option></select></label>
      <label>Data/hora observada (horário local)<input data-meta="observedAt" type="datetime-local" step="0.001"></label>
      <label>Responsável<input data-meta="operator" type="text" maxlength="100"></label>
      <label>Precisão da posição (m)<input data-meta="accuracyM" type="number" min="0" step="0.01"></label>
      <label>Precisão da orientação (°)<input data-meta="orientationAccuracyDeg" type="number" min="0" step="0.1"></label>
      <label class="gmgeo-span2">Arquivo / fonte<input data-meta="sourceFile" type="text" maxlength="180"></label>
      <label>Confiança da identidade<select data-meta="identityConfidence"><option value="">— não informada —</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></label>
    </div></section><div class="gmgeo-preview" data-role="status"></div></div>
    <footer class="gmgeo-foot"><span class="gmgeo-hint">Dados incompletos podem ser salvos como rascunho; valores fora das faixas são bloqueados.</span><button class="tbtn" data-act="cancel">Cancelar</button><button class="btn primary" data-act="save">Salvar ficha</button></footer>
  </section>`;
  document.body.appendChild(root);
  const metaInputs=[...root.querySelectorAll('[data-meta]')];
  metaInputs.forEach(input=>{
    const key=input.dataset.meta,value=meta[key];
    if(input.tagName==='SELECT'&&value!=null&&String(value)!==''&&![...input.options].some(option=>option.value===String(value)))
      input.insertAdjacentHTML('beforeend',optionHTML(value,value,value));
    if(key==='observedAt'&&value){
      const local=toLocalDateTime(value);
      if(!local){input.type='text';input.placeholder='AAAA-MM-DDTHH:mm (horário local)';}
      input.value=local||String(value);
    }else if(['accuracyM','orientationAccuracyDeg'].includes(key)){
      const number=numberOrNull(value);
      if(number!==null&&!Number.isFinite(number)){
        input.type='text';input.setAttribute('inputmode','decimal');
        input.value=value&&typeof value==='object'?JSON.stringify(value):String(value);
      }else input.value=number===null?'':String(number);
    }else if(value!=null)input.value=String(value);
  });
  function draft(){
    const props={...values};root.querySelectorAll('[data-field]').forEach(input=>{const field=def.fields.find(f=>f.name===input.dataset.field),raw=input.value;props[field.name]=(field.type==='N'||field.type==='F')?(input.validity?.badInput?NaN:numberOrNull(raw)):raw;});
    const next={...meta};metaInputs.forEach(input=>{
      const key=input.dataset.meta;let value=input.value;
      if(['accuracyM','orientationAccuracyDeg'].includes(key))value=input.validity?.badInput?NaN:numberOrNull(value);
      if(key==='observedAt'&&value)value=fromLocalDateTime(value,meta.observedAt)||'data inválida';
      next[key]=value;
    });
    return validateObservation(kind,props,next);
  }
  const status=root.querySelector('[data-role="status"]');
  function showStatus(){const check=draft(),notes=check.errors.concat(check.warnings);status.className='gmgeo-preview '+check.status;status.innerHTML=`<b>${check.status==='valid'?'Ficha válida':check.status==='draft'?'Rascunho incompleto':'Corrija os valores'}</b>${notes.length?'<span>'+esc(notes.join(' · '))+'</span>':'<span>Pronta para uso nas seções geológicas.</span>'}`;}
  root.querySelectorAll('input,select,textarea').forEach(input=>input.addEventListener('input',showStatus));
  const close=()=>root.remove();root.querySelector('[data-act="close"]').onclick=close;root.querySelector('[data-act="cancel"]').onclick=close;root.addEventListener('mousedown',event=>{if(event.target===root)close();});
  root.querySelector('[data-act="save"]').onclick=()=>{
    const check=draft();if(check.errors.length){notify(check.errors[0]);showStatus();return;}
    feature.props=originalProps;
    (def.fields||[]).filter(field=>field.name!=='FID').forEach(field=>{const target=mappedField(layer,field.name);feature.props[target]=check.props[field.name];});
    feature._field=Object.assign(createFieldMeta(layer,feature,originalMeta),check.meta,{status:check.status,errors:check.warnings});
    try{if(typeof drawLayer==='function')drawLayer(layer);if(typeof refreshUI==='function')refreshUI();}catch(e){}
    close();notify(check.status==='valid'?'Ficha geológica salva.':'Ficha salva como rascunho.');
  };
  showStatus();return true;
}
function openSelectedObservation(){
  const selected=S.selFeat,layer=selected&&selected.layer||layerById(selected&&selected.layerId),index=selected&&Number(selected.idx);
  const feature=layer&&Number.isInteger(index)?layer.features&&layer.features[index]:null;
  if(!layer||!feature||!layer._geology){notify('Selecione uma feição de uma camada geológica.');return false;}
  return openObservationForm(layer,feature,{mode:'edit'});
}

const fieldMapping={schemaVersion:FIELD_SCHEMA_VERSION,definition,definitions,compatibleKinds,inferFieldMap,adoptLayer,
  validateObservation,createFieldMeta,fieldValue,canonicalValues,fieldRecord,isUsableObservation,orientationOf,numberOrNull,
  toLocalDateTime,fromLocalDateTime,openFieldMapping,openObservationForm,openSelectedObservation};
api.fieldMapping=fieldMapping;
Object.assign(api,{openFieldMapping,openObservationForm,openSelectedObservation});
})();
