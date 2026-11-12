/* ==========================================================================
   GeoMine — exportação em lote de vetores, rasters e ortofotos.
   A lista é um retrato independente da árvore: preserva ordem, grupos e
   subgrupos sem chamar displayList()/stackSync() nem alterar o projeto.
   ========================================================================== */
(function(){
'use strict';

const GM_BATCH_SCHEMA='geomine.layer-export-batch/5';
const GM_BATCH_FORMATS={
  shp:{label:'Shapefile',ext:'shp',family:'vector',crs:'select'},
  geojson:{label:'GeoJSON',ext:'geojson',family:'vector',crs:'EPSG:4326'},
  kml:{label:'KML',ext:'kml',family:'vector',crs:'EPSG:4326'},
  dxf:{label:'DXF 3D',ext:'dxf',family:'vector',crs:'project'},
  tif:{label:'GeoTIFF',ext:'tif',family:'raster',crs:'source'},
  asc:{label:'ESRI ASCII Grid',ext:'asc',family:'raster',crs:'source'},
  xyz:{label:'XYZ',ext:'xyz',family:'raster',crs:'source'},
  tifsrc:{label:'GeoTIFF original',ext:'tif',family:'image',crs:'embedded'},
  png:{label:'PNG da prévia + PGW',ext:'png',family:'image',crs:'source'}
};
const GM_BATCH_DEFAULT_FORMAT={vector:'shp',raster:'tif',image:'png'};
const GM_BATCH_SAFE_SHP_CRS=['EPSG:4326','EPSG:4674','EPSG:4618','EPSG:3857','EPSG:29101'];
for(let zone=18;zone<=25;zone++)GM_BATCH_SAFE_SHP_CRS.push('EPSG:'+(31960+zone),'EPSG:'+(29170+zone),'EPSG:'+(22500+zone),'EPSG:'+(32600+zone),'EPSG:'+(32700+zone));
for(let zone=18;zone<=22;zone++)GM_BATCH_SAFE_SHP_CRS.push('EPSG:'+(31954+zone));
const GM_BATCH_WEB_MERCATOR_WKT='PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Mercator_1SP"],PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1],AXIS["Easting",EAST],AXIS["Northing",NORTH]]';
const GM_BATCH_WGS84_WKT='GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
const GM_BATCH_SIRGAS_WKT='GEOGCS["SIRGAS 2000",DATUM["SIRGAS_2000",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
const GM_BATCH_SAD69_WKT='GEOGCS["SAD69",DATUM["South_American_Datum_1969",SPHEROID["GRS 1967 Modified",6378160,298.25],TOWGS84[-66.87,4.37,-38.52,0,0,0,0]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
const GM_BATCH_CORREGO_WKT='GEOGCS["Corrego Alegre 1970-72",DATUM["Corrego_Alegre_1970-72",SPHEROID["International 1924",6378388,297],TOWGS84[-206.048,168.279,-3.283,0,0,0,0]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
let gmBatchSources=new Map(),gmBatchGroups=new Map(),gmBatchTreeEntries=[];
let gmBatchCollapsed=new Set(),gmBatchTreeWarnings=[];

function gmBatchEsc(value){
  return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function gmBatchNowName(){
  const d=new Date(),p=n=>String(n).padStart(2,'0');
  return `GeoMine_camadas_${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.zip`;
}
function gmBatchSafeName(value,used){
  let base=String(value||'camada').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[\\/\u0000-\u001f<>:"|?*]+/g,'_').replace(/\.\.+/g,'_')
    .replace(/[^A-Za-z0-9_.-]+/g,'_').replace(/^[_ .]+|[_ .]+$/g,'').slice(0,72)||'camada';
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base))base='camada_'+base;
  const seen=used||new Set(),stem=base;let i=2;
  while(seen.has(base.toLocaleLowerCase('pt-BR')))base=stem+'_'+i++;
  seen.add(base.toLocaleLowerCase('pt-BR'));return base;
}
function gmBatchValidNumber(value){return value!==null&&value!==''&&Number.isFinite(Number(value));}
function gmBatchState(){return typeof S!=='undefined'&&S?S:{};}
function gmBatchNodeKey(type,id){return type+':'+String(id);}
function gmBatchGroupId(value){return value==null?'':String(value);}
function gmBatchPad(value){return String(Math.max(1,+value||1)).padStart(3,'0');}
function gmBatchGroupParent(group,groupById){
  if(!group)return null;
  const raw=group.parentId!=null?group.parentId:(group.parentGroupId!=null?group.parentGroupId:group.groupId);
  const id=gmBatchGroupId(raw);
  return id&&id!==gmBatchGroupId(group.id)&&groupById.has(id)?id:null;
}
function gmBatchRawGroupPath(groupId,groupById,warnings){
  const out=[],seen=new Set();let id=gmBatchGroupId(groupId);
  while(id&&groupById.has(id)&&!seen.has(id)){
    seen.add(id);const group=groupById.get(id);out.unshift(group);id=gmBatchGroupParent(group,groupById);
  }
  if(id&&seen.has(id)&&warnings)warnings.push('Ciclo de subgrupos ignorado no grupo '+id+'.');
  return out;
}
function gmBatchSourceKind(type,source){
  if(type==='L')return 'vector';
  if(type==='I')return 'image';
  return source&&(source.tinPuro||(source.d&&source.d.tin))?'tin':'raster';
}
function gmBatchOriginalRaster(source){
  const raw=source&&source._sourceRaw;
  if(!raw)return null;
  if(typeof Blob!=='undefined'&&raw instanceof Blob)return raw.size>0?raw:null;
  if(typeof ArrayBuffer!=='undefined'&&raw instanceof ArrayBuffer)return raw.byteLength>0?raw:null;
  if(typeof ArrayBuffer!=='undefined'&&ArrayBuffer.isView&&ArrayBuffer.isView(raw))return raw.byteLength>0?raw:null;
  return typeof raw.arrayBuffer==='function'&&Number(raw.size)>0?raw:null;
}
function gmBatchDetectFormat(sourceOrDescriptor){
  const kind=sourceOrDescriptor&&(sourceOrDescriptor.sourceKind||sourceOrDescriptor.kind),
    source=sourceOrDescriptor&&(sourceOrDescriptor.source||sourceOrDescriptor);
  if(kind==='image'&&gmBatchOriginalRaster(source))return 'tifsrc';
  return GM_BATCH_DEFAULT_FORMAT[kind]||null;
}
function gmBatchTreeSnapshot(state){
  state=state||gmBatchState();
  const warnings=[],groups=Array.isArray(state.groups)?state.groups.slice():[];
  const groupById=new Map(groups.map(group=>[gmBatchGroupId(group.id),group]));
  const nodes=[];
  (Array.isArray(state.layers)?state.layers:[]).forEach(source=>nodes.push({type:'L',id:source.id,key:gmBatchNodeKey('L',source.id),source}));
  (Array.isArray(state.rasters)?state.rasters:[]).forEach(source=>nodes.push({type:'R',id:source.id,key:gmBatchNodeKey('R',source.id),source}));
  if(state.img&&state.img.url)nodes.push({type:'I',id:0,key:'I:0',source:state.img});
  const nodeByKey=new Map(nodes.map(node=>[node.key,node]));
  const hasGroupContent=id=>nodes.some(node=>gmBatchRawGroupPath(node.source&&node.source.groupId,groupById)
    .some(group=>gmBatchGroupId(group.id)===id));
  const order=[],seenOrder=new Set();
  (Array.isArray(state.stack)?state.stack:[]).forEach(raw=>{
    const key=String(raw);if(seenOrder.has(key))return;
    if(nodeByKey.has(key)){order.push(key);seenOrder.add(key);}
    else if(key.startsWith('G:')){
      const id=key.slice(2);if(groupById.has(id)&&!hasGroupContent(id)){order.push(key);seenOrder.add(key);}
    }
  });
  groups.forEach(group=>{
    const id=gmBatchGroupId(group.id),key='G:'+id;
    if(!hasGroupContent(id)&&!seenOrder.has(key)){order.unshift(key);seenOrder.add(key);}
  });
  nodes.forEach(node=>{
    if(seenOrder.has(node.key))return;
    if(node.type==='L')order.unshift(node.key);else order.push(node.key);
    seenOrder.add(node.key);
  });

  const entries=[],emittedGroups=new Set(),groupEntries=new Map(),sourceEntries=[];
  const emitGroupPath=id=>{
    const path=gmBatchRawGroupPath(id,groupById,warnings);
    path.forEach((group,depth)=>{
      const groupId=gmBatchGroupId(group.id);if(emittedGroups.has(groupId))return;
      const ancestors=path.slice(0,depth).map(parent=>gmBatchGroupId(parent.id));
      const entry={kind:'group',key:'G:'+groupId,id:group.id,name:group.name||'Grupo',group,
        depth,collapsed:!!group.collapsed,parentId:gmBatchGroupParent(group,groupById),
        ancestorGroupIds:ancestors,treeOrder:entries.length+1,memberKeys:[]};
      entries.push(entry);groupEntries.set(groupId,entry);emittedGroups.add(groupId);
    });
    return path;
  };
  order.forEach(key=>{
    if(key.startsWith('G:')){emitGroupPath(key.slice(2));return;}
    const node=nodeByKey.get(key);if(!node)return;
    const rawGroupId=gmBatchGroupId(node.source&&node.source.groupId);
    const validGroupId=rawGroupId&&groupById.has(rawGroupId)?rawGroupId:'';
    if(rawGroupId&&!validGroupId)warnings.push(`A camada “${node.source.name||key}” referencia um grupo inexistente; foi mantida na raiz do pacote.`);
    const rawPath=validGroupId?emitGroupPath(validGroupId):[],sourceKind=gmBatchSourceKind(node.type,node.source);
    const entry={kind:'source',key:node.key,type:node.type,id:node.id,source:node.source,
      sourceKind,exportable:sourceKind!=='tin',defaultFormat:GM_BATCH_DEFAULT_FORMAT[sourceKind]||null,
      depth:rawPath.length,treeOrder:entries.length+1,visible:node.source.visible!==false,groupPath:[]};
    entries.push(entry);sourceEntries.push(entry);
  });
  groups.forEach(group=>{if(!emittedGroups.has(gmBatchGroupId(group.id)))emitGroupPath(group.id);});
  sourceEntries.forEach(entry=>{
    const path=gmBatchRawGroupPath(entry.source&&entry.source.groupId,groupById,warnings);
    entry.groupPath=path.map(group=>{
      const ge=groupEntries.get(gmBatchGroupId(group.id));
      return {id:group.id,key:'G:'+gmBatchGroupId(group.id),name:group.name||'Grupo',treeOrder:ge?ge.treeOrder:1};
    });
    entry.groupPath.forEach(group=>{const ge=groupEntries.get(gmBatchGroupId(group.id));if(ge)ge.memberKeys.push(entry.key);});
  });
  return {entries,sources:sourceEntries,groups:[...groupEntries.values()],warnings};
}

function gmBatchUsableGeometry(feature,gtype){
  let count=0,invalid=false;
  (function walk(value){
    if(invalid||!Array.isArray(value))return;
    if(value.length>=2&&!Array.isArray(value[0])&&!Array.isArray(value[1])){
      count++;if(!gmBatchValidNumber(value[0])||!gmBatchValidNumber(value[1]))invalid=true;return;
    }
    value.forEach(walk);
  })(feature&&feature.geom);
  const minimum=gtype==='point'?1:gtype==='line'?2:3;return !invalid&&count>=minimum;
}
function gmBatchFeatures(layer,useFilter){
  return (layer&&Array.isArray(layer.features)?layer.features:[]).filter(feature=>{
    if(!feature||!feature.geom||!gmBatchUsableGeometry(feature,layer.gtype))return false;
    if(!useFilter||typeof attrFilterMatch!=='function')return true;
    try{return !!attrFilterMatch(layer,feature);}catch(_){return true;}
  });
}
function gmBatchLayerCopy(layer,features){return Object.assign({},layer,{features:features.slice()});}
function gmBatchGrid(source){
  const base=source&&source.d;if(base&&base._full&&base._full.z)return base._full;return base||null;
}
function gmBatchRasterCRS(source,grid){
  const state=gmBatchState();return (grid&&grid.srcCRS)||(source&&source.d&&source.d.srcCRS)||(source&&source.crs)||state.workCRS||'';
}
function gmBatchImageCRS(source,format){
  if(format==='tifsrc')return source&&source._sourceCRS||gmBatchState().workCRS||'';
  return source&&source._warpWM?'EPSG:3857':(source&&source._sourceCRS||gmBatchState().workCRS||'');
}
function gmBatchJobDescriptor(job){
  if(job&&job.descriptor)return job.descriptor;
  const source=job&&(job.source||job.layer),kind=job&&(job.sourceKind||(job.layer?'vector':null));
  return {kind:'source',key:job&&job.key||'',source,sourceKind:kind||
    (source&&source.features?'vector':source&&source.url?'image':source&&(source.tinPuro||(source.d&&source.d.tin))?'tin':'raster'),
    exportable:true,treeOrder:job&&job.treeOrder||job&&job.ordinal||1,groupPath:job&&job.groupPath||[]};
}
function gmBatchResolveFormat(job,descriptor){
  const requested=job&&job.format;return !requested||requested==='auto'?gmBatchDetectFormat(descriptor):requested;
}
function gmBatchValidateGrid(source,format){
  let grid=gmBatchGrid(source);
  if(!grid||!grid.z)throw Object.assign(new Error('A superfície não possui uma grade raster exportável'),{code:'EMPTY_RASTER'});
  const nc=+grid.nc,nr=+grid.nr,cs=+grid.cs,csy=+(grid.csy||grid.cs),xll=+grid.xll,yll=+grid.yll;
  if(!Number.isInteger(nc)||!Number.isInteger(nr)||nc<1||nr<1||!Number.isFinite(cs)||cs<=0||
     !Number.isFinite(csy)||csy<=0||!Number.isFinite(xll)||!Number.isFinite(yll)||grid.z.length!==nc*nr)
    throw Object.assign(new Error('Metadados ou dimensões inválidos na grade raster'),{code:'INVALID_RASTER'});
  if(format==='tif'&&(nc>65535||nr>65535))
    throw Object.assign(new Error('GeoTIFF excede o limite de 65.535 células por eixo deste gravador'),{code:'RASTER_TOO_LARGE'});
  if(format==='asc'&&Math.abs(csy-cs)>Math.max(1,Math.abs(cs))*1e-8)
    throw Object.assign(new Error('ESRI ASCII Grid exige células quadradas; use GeoTIFF ou XYZ'),{code:'RECTANGULAR_ASC'});
  let finite=0,repair=false;
  for(let i=0;i<grid.z.length;i++){
    const value=Number(grid.z[i]);if(Number.isFinite(value))finite++;else if(!Number.isNaN(value))repair=true;
  }
  if(!finite)throw Object.assign(new Error('A superfície não contém células com valor'),{code:'EMPTY_RASTER'});
  if(repair){
    const z=new Float64Array(grid.z.length);
    for(let i=0;i<z.length;i++){const value=Number(grid.z[i]);z[i]=Number.isFinite(value)?value:NaN;}
    grid=Object.assign({},grid,{z});
  }
  return grid;
}
function validateJob(job){
  const descriptor=gmBatchJobDescriptor(job),source=descriptor.source;
  if(!source)throw Object.assign(new Error('Camada não encontrada'),{code:'LAYER_NOT_FOUND'});
  if(descriptor.sourceKind==='tin')throw Object.assign(new Error('A superfície TIN precisa ser rasterizada antes da exportação em lote'),{code:'TIN_REQUIRES_RASTER'});
  const format=gmBatchResolveFormat(job,descriptor),definition=GM_BATCH_FORMATS[format];
  if(!definition||definition.family!==descriptor.sourceKind)
    throw Object.assign(new Error('Formato incompatível com o tipo da camada'),{code:'UNSUPPORTED_FORMAT'});
  if(descriptor.sourceKind==='vector'){
    const features=gmBatchFeatures(source,job.useFilter!==false);
    if(!features.length)throw Object.assign(new Error('Nenhuma geometria exportável'),{code:'EMPTY_LAYER'});
    if(format==='shp'&&!GM_BATCH_SAFE_SHP_CRS.includes(job.targetCRS))
      throw Object.assign(new Error('CRS de saída não suportado com segurança pelo Shapefile'),{code:'UNSUPPORTED_CRS'});
    return {descriptor,source,sourceKind:'vector',format,features};
  }
  if(descriptor.sourceKind==='raster')return {descriptor,source,sourceKind:'raster',format,grid:gmBatchValidateGrid(source,format)};
  if(format==='tifsrc'){
    if(!gmBatchOriginalRaster(source))throw Object.assign(new Error('O GeoTIFF original não está ligado; use PNG da prévia ou religue o arquivo'),{code:'IMAGE_SOURCE_NOT_LINKED'});
    return {descriptor,source,sourceKind:'image',format};
  }
  if(!source.url)throw Object.assign(new Error('Imagem sem pixels exportáveis'),{code:'INVALID_IMAGE'});
  try{gmBatchImageBounds(source);}catch(error){
    if(!error.code)error.code='INVALID_IMAGE';throw error;
  }
  return {descriptor,source,sourceKind:'image',format};
}

function gmBatchDefaultCRS(layer){
  const project=gmBatchState().workCRS||'';if(GM_BATCH_SAFE_SHP_CRS.includes(project))return project;
  if(layer&&GM_BATCH_SAFE_SHP_CRS.includes(layer.crs))return layer.crs;return 'EPSG:4674';
}
function gmBatchCRSOptions(selected){
  return GM_BATCH_SAFE_SHP_CRS.filter(code=>typeof CRS_DEFS==='undefined'||CRS_DEFS[code])
    .map(code=>`<option value="${code}"${code===selected?' selected':''}>${gmBatchEsc((typeof CRS_LABELS!=='undefined'&&CRS_LABELS[code])||code)}</option>`).join('');
}
function gmBatchFormatOptions(descriptor){
  if(!descriptor.exportable)return '<option value="">Rasterize o TIN antes</option>';
  const detected=gmBatchDetectFormat(descriptor),auto=GM_BATCH_FORMATS[detected];
  const options=Object.entries(GM_BATCH_FORMATS).filter(([,definition])=>definition.family===descriptor.sourceKind)
    .map(([value,definition])=>{
      const grid=descriptor.sourceKind==='raster'?gmBatchGrid(descriptor.source):null;
      const rectangular=value==='asc'&&grid&&Math.abs(+(grid.csy||grid.cs)-(+grid.cs))>Math.max(1,Math.abs(+grid.cs))*1e-8;
      const unlinked=value==='tifsrc'&&!gmBatchOriginalRaster(descriptor.source),disabled=rectangular||unlinked;
      return `<option value="${value}"${disabled?' disabled':''}>${gmBatchEsc(definition.label)}${rectangular?' · célula retangular':unlinked?' · religue a fonte':''}</option>`;
    }).join('');
  return `<option value="auto">Automático · ${gmBatchEsc(auto.label)}</option>${options}`;
}
function gmBatchTypeLabel(descriptor){
  if(descriptor.sourceKind==='vector')return 'Vetor · '+(descriptor.source.gtype==='point'?'Ponto':descriptor.source.gtype==='line'?'Linha':'Polígono');
  if(descriptor.sourceKind==='raster')return 'Raster numérico';if(descriptor.sourceKind==='image')return 'Raster · Imagem';return 'Superfície TIN';
}
function gmBatchTypeGlyph(descriptor){
  if(descriptor.sourceKind==='vector')return descriptor.source.gtype==='point'?'●':descriptor.source.gtype==='line'?'╱':'⬡';
  if(descriptor.sourceKind==='raster')return '▦';if(descriptor.sourceKind==='image')return '▧';return '△';
}
function gmBatchTypeClass(descriptor){return descriptor.sourceKind!=='vector'?descriptor.sourceKind:(descriptor.source.gtype||'polygon');}
function gmBatchSourceMeta(descriptor){
  const source=descriptor.source;
  if(descriptor.sourceKind==='vector')return gmBatchFeatures(source,true).length.toLocaleString('pt-BR')+' feição(ões) exportável(is)';
  if(descriptor.sourceKind==='raster'){
    const grid=gmBatchGrid(source);return grid&&grid.nc&&grid.nr?`${(+grid.nc).toLocaleString('pt-BR')} × ${(+grid.nr).toLocaleString('pt-BR')} células`:'grade indisponível';
  }
  if(descriptor.sourceKind==='image'){
    const previewWidth=+source._w||0,previewHeight=+source._h||0,nativeWidth=+source._W0||0,nativeHeight=+source._H0||0;
    if(previewWidth&&previewHeight&&nativeWidth&&nativeHeight&&(previewWidth!==nativeWidth||previewHeight!==nativeHeight))
      return `prévia ${previewWidth.toLocaleString('pt-BR')} × ${previewHeight.toLocaleString('pt-BR')} · fonte ${nativeWidth.toLocaleString('pt-BR')} × ${nativeHeight.toLocaleString('pt-BR')}`;
    const width=previewWidth||nativeWidth,height=previewHeight||nativeHeight;
    return width&&height?`${width.toLocaleString('pt-BR')} × ${height.toLocaleString('pt-BR')} pixels`:'prévia georreferenciada';
  }
  return 'rasterize a malha para habilitar a exportação';
}
function gmBatchPreselected(descriptors){
  const state=gmBatchState(),keys=state._layerMulti instanceof Set?state._layerMulti:null;
  const marked=keys?descriptors.filter(descriptor=>keys.has(descriptor.key)):[];
  if(marked.length)return new Set(marked.map(descriptor=>descriptor.key));
  const active=descriptors.find(descriptor=>descriptor.type==='L'&&String(descriptor.id)===String(state.activeId));
  if(active)return new Set([active.key]);
  const visible=descriptors.filter(descriptor=>descriptor.visible);
  return new Set((visible.length?visible:descriptors.slice(0,1)).map(descriptor=>descriptor.key));
}

function gmBatchProjectPoint(sourceCRS,targetCRS,point){
  if(!point||!gmBatchValidNumber(point[0])||!gmBatchValidNumber(point[1]))throw new Error('Coordenada inválida');
  const x=+point[0],y=+point[1];let out;
  if(sourceCRS===targetCRS)out=[x,y];
  else{if(typeof proj4!=='function')throw new Error('Motor de reprojeção indisponível');out=proj4(sourceCRS,targetCRS,[x,y]);}
  if(!out||!Number.isFinite(+out[0])||!Number.isFinite(+out[1]))throw new Error('Falha na reprojeção');return [+out[0],+out[1]];
}
function gmBatchShpFeatures(layer,features,targetCRS){
  const sourceCRS=layer.crs||gmBatchState().workCRS,targetPoint=point=>gmBatchProjectPoint(sourceCRS,targetCRS,point);
  return features.map(feature=>{
    let geom;if(layer.gtype==='point')geom=[targetPoint(feature.geom[0])];
    else if(feature.multi&&Array.isArray(feature.geom[0])&&Array.isArray(feature.geom[0][0]))geom=feature.geom.map(part=>part.map(targetPoint));
    else geom=feature.geom.map(targetPoint);
    return {geom,multi:!!feature.multi,props:Object.assign({},feature.props||{})};
  });
}
function gmBatchFields(layer){
  const fields=Array.isArray(layer.fields)?layer.fields.filter(Boolean):[];return fields.length?fields:[{name:'FID',type:'N',length:9,decimal:0}];
}
function gmBatchGeoJSON(layer,features){
  const sourceCRS=layer.crs||gmBatchState().workCRS;
  const toLL=(point,z)=>{
    if(!point||!gmBatchValidNumber(point[0])||!gmBatchValidNumber(point[1]))throw new Error('Coordenada inválida');
    const w=(typeof toWGS==='function')?toWGS(sourceCRS,+point[0],+point[1]):[+point[0],+point[1]];
    if(!w||!Number.isFinite(+w[0])||!Number.isFinite(+w[1])||Math.abs(+w[0])>180||Math.abs(+w[1])>90)throw new Error('Não foi possível converter a geometria para WGS84');
    return z!=null&&Number.isFinite(+z)?[+w[0],+w[1],+z]:[+w[0],+w[1]];
  };
  const zAt=(feature,part,index)=>{
    const z=feature&&feature.zg;if(!z)return null;if(Array.isArray(z[part]))return z[part][index];if(part===0&&Array.isArray(z))return z[index];return null;
  };
  const out={type:'FeatureCollection',name:layer.name,crs:{type:'name',properties:{name:'urn:ogc:def:crs:OGC:1.3:CRS84'}},features:[]};
  features.forEach(feature=>{
    let geometry;
    if(layer.gtype==='point')geometry={type:'Point',coordinates:toLL(feature.geom[0],zAt(feature,0,0))};
    else if(layer.gtype==='line'){
      const multi=feature.multi&&Array.isArray(feature.geom[0])&&Array.isArray(feature.geom[0][0]);
      geometry=multi?{type:'MultiLineString',coordinates:feature.geom.map((part,pi)=>part.map((point,index)=>toLL(point,zAt(feature,pi,index))))}
        :{type:'LineString',coordinates:feature.geom.map((point,index)=>toLL(point,zAt(feature,0,index)))};
    }else{
      const rings=feature.multi&&Array.isArray(feature.geom[0])&&Array.isArray(feature.geom[0][0])?feature.geom:[feature.geom];
      geometry={type:'Polygon',coordinates:rings.map((ring,ri)=>ring.map((point,index)=>toLL(point,zAt(feature,ri,index))))};
    }
    out.features.push({type:'Feature',geometry,properties:Object.assign({},feature.props||{})});
  });
  return out;
}
function gmBatchUtmWKT(name,geog,zone,south){
  const meridian=-183+zone*6;
  return `PROJCS["${name} / UTM zone ${zone}${south?'S':'N'}",${geog},PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",${meridian}],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",${south?10000000:0}],UNIT["metre",1]]`;
}
function gmBatchPrjText(crs){
  const normalized=String(crs||'').trim().toUpperCase(),match=normalized.match(/^EPSG:(\d+)$/),code=match?+match[1]:0;
  if(normalized==='EPSG:4326')return GM_BATCH_WGS84_WKT;
  if(normalized==='EPSG:4674')return GM_BATCH_SIRGAS_WKT;
  if(normalized==='EPSG:4618')return GM_BATCH_SAD69_WKT;
  if(normalized==='EPSG:3857')return GM_BATCH_WEB_MERCATOR_WKT;
  if(code>=31972&&code<=31976)return gmBatchUtmWKT('SIRGAS 2000',GM_BATCH_SIRGAS_WKT,code-31954,false);
  if(code>=31978&&code<=31985)return gmBatchUtmWKT('SIRGAS 2000',GM_BATCH_SIRGAS_WKT,code-31960,true);
  if(code>=29188&&code<=29195)return gmBatchUtmWKT('SAD69',GM_BATCH_SAD69_WKT,code-29170,true);
  if(code>=22518&&code<=22525)return gmBatchUtmWKT('Corrego Alegre 1970-72',GM_BATCH_CORREGO_WKT,code-22500,true);
  if(code>=32601&&code<=32660)return gmBatchUtmWKT('WGS 84',GM_BATCH_WGS84_WKT,code-32600,false);
  if(code>=32701&&code<=32760)return gmBatchUtmWKT('WGS 84',GM_BATCH_WGS84_WKT,code-32700,true);
  if(normalized==='EPSG:29101')return `PROJCS["SAD69 / Brazil Polyconic",${GM_BATCH_SAD69_WKT},PROJECTION["Polyconic"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",-54],PARAMETER["false_easting",5000000],PARAMETER["false_northing",10000000],UNIT["metre",1]]`;
  throw Object.assign(new Error('Não há definição WKT segura para '+(normalized||'o CRS da camada')),{code:'UNSUPPORTED_CRS_WKT'});
}
function gmBatchMercatorPoint(lng,lat){
  if(typeof proj4==='function'){
    try{const point=proj4('EPSG:4326','EPSG:3857',[+lng,+lat]);if(point&&point.every(Number.isFinite))return point;}catch(_){}
  }
  const radius=6378137,clamped=Math.max(-85.05112878,Math.min(85.05112878,+lat));
  return [radius*(+lng)*Math.PI/180,radius*Math.log(Math.tan(Math.PI/4+clamped*Math.PI/360))];
}
function gmBatchImageBounds(source){
  if(source&&source._warpWM){
    const ll=source._llbounds,sw=Array.isArray(ll)&&ll[0],ne=Array.isArray(ll)&&ll[1];
    if(!sw||!ne||sw.length<2||ne.length<2||![sw[0],sw[1],ne[0],ne[1]].every(gmBatchValidNumber))
      throw Object.assign(new Error('A prévia warpada perdeu os limites geográficos; religue o GeoTIFF original'),{code:'IMAGE_WARP_BOUNDS_MISSING'});
    const south=+sw[0],west=+sw[1],north=+ne[0],east=+ne[1];
    if(Math.abs(south)>90||Math.abs(north)>90||Math.abs(west)>180||Math.abs(east)>180||north<=south||east<=west)
      throw Object.assign(new Error('Os limites geográficos da prévia warpada são inválidos'),{code:'IMAGE_WARP_BOUNDS_INVALID'});
    const a=gmBatchMercatorPoint(west,south),b=gmBatchMercatorPoint(east,north);
    if(a.every(Number.isFinite)&&b.every(Number.isFinite)&&b[0]>a[0]&&b[1]>a[1])return {bounds:[a[0],a[1],b[0],b[1]],crs:'EPSG:3857'};
    throw Object.assign(new Error('Não foi possível converter os limites da prévia para Web Mercator'),{code:'IMAGE_WARP_BOUNDS_INVALID'});
  }
  const bounds=source&&Array.isArray(source.b)?source.b.map(Number):[];
  if(bounds.length<4||!bounds.every(Number.isFinite)||bounds[2]<=bounds[0]||bounds[3]<=bounds[1])
    throw Object.assign(new Error('Imagem sem extensão geográfica válida'),{code:'INVALID_IMAGE_BOUNDS'});
  const crs=gmBatchImageCRS(source,'png');gmBatchPrjText(crs);
  return {bounds,crs};
}
async function gmBatchImagePNG(source){
  if(typeof Image==='undefined')throw new Error('Decodificador de imagem indisponível');
  const image=new Image();
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('Não foi possível ler os pixels da imagem'));image.src=source.url;});
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
  if(!width||!height)throw new Error('Imagem sem dimensões válidas');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext&&canvas.getContext('2d');if(!context)throw new Error('Canvas indisponível para exportar a imagem');
  context.drawImage(image,0,0);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Falha ao gerar o PNG')),'image/png'));
  const georef=gmBatchImageBounds(source);gmBatchPrjText(georef.crs);
  const bounds=georef.bounds,pixelX=(bounds[2]-bounds[0])/width,pixelY=(bounds[3]-bounds[1])/height;
  if(!Number.isFinite(pixelX)||!Number.isFinite(pixelY)||!pixelX||!pixelY)throw new Error('Limites inválidos para o arquivo de georreferência');
  const pgw=`${pixelX}\n0\n0\n${-pixelY}\n${bounds[0]+pixelX/2}\n${bounds[3]-pixelY/2}\n`;
  return {blob,pgw,crs:georef.crs,width,height,bounds};
}
function gmBatchFolder(job,descriptor){
  if(job&&job.folderMode==='flat')return '';
  const groups=(descriptor.groupPath||job.groupPath||[]).map(group=>gmBatchPad(group.treeOrder)+'_'+gmBatchSafeName(group.name,new Set()));
  return 'camadas/'+(groups.length?groups.join('/')+'/':'');
}
function gmBatchLayerBase(job,descriptor,source,folder,usedNames){
  const order=descriptor.treeOrder||job.treeOrder||job.ordinal||1,
    clean=gmBatchSafeName(source.name||'camada',new Set()),
    stem=job&&job.folderMode==='flat'?clean:gmBatchPad(order)+'_'+clean,used=usedNames||new Set();
  let base=stem,index=2,key=(folder+base).toLocaleLowerCase('pt-BR');
  while(used.has(key)){base=stem+'_'+index++;key=(folder+base).toLocaleLowerCase('pt-BR');}
  return base;
}
async function buildLayerExportArtifact(job,usedNames){
  const initialDescriptor=gmBatchJobDescriptor(job),initialSource=initialDescriptor.source;
  if(initialDescriptor.sourceKind==='vector'&&initialSource&&initialSource.gtype==='polygon'&&typeof autoAreaSyncLayer==='function')autoAreaSyncLayer(initialSource);
  const checked=validateJob(job),descriptor=checked.descriptor,source=checked.source,format=checked.format,used=usedNames||new Set();
  const folder=gmBatchFolder(job,descriptor),base=gmBatchLayerBase(job,descriptor,source,folder,used),files=[],warnings=[];
  let actualCRS='',featureCount=null,cellCount=null,dimensions=null,sourceDimensions=null;
  if(checked.sourceKind==='vector'){
    const features=checked.features,clone=gmBatchLayerCopy(source,features);featureCount=features.length;
    if(format==='shp'){
      actualCRS=job.targetCRS;const feats=gmBatchShpFeatures(source,features,actualCRS);
      const parts=writeSHP(source.gtype,feats),declared=Array.isArray(source.fields)&&source.fields.some(Boolean),fields=gmBatchFields(source);
      const rows=feats.map((feature,index)=>declared?feature.props:{FID:index});
      files.push({path:folder+base+'.shp',data:parts.shp},{path:folder+base+'.shx',data:parts.shx},
        {path:folder+base+'.dbf',data:writeDBF(fields,rows)},{path:folder+base+'.prj',data:gmBatchPrjText(actualCRS)},
        {path:folder+base+'.cpg',data:dbfCpgText()});
    }else if(format==='geojson'){
      actualCRS='EPSG:4326';files.push({path:folder+base+'.geojson',data:JSON.stringify(gmBatchGeoJSON(source,features),null,2)});
    }else if(format==='kml'){
      actualCRS='EPSG:4326';files.push({path:folder+base+'.kml',data:layerToKML(clone)});
    }else if(format==='dxf'){
      actualCRS=gmBatchState().workCRS||source.crs;files.push({path:folder+base+'_3D.dxf',data:dxfFromLayers([clone])});
    }
  }else if(checked.sourceKind==='raster'){
    const grid=checked.grid;actualCRS=gmBatchRasterCRS(source,grid);cellCount=grid.nc*grid.nr;dimensions=[grid.nc,grid.nr];
    if(format==='tif'){
      if(typeof gridParaGeoTIFF!=='function')throw new Error('Gravador GeoTIFF indisponível');
      files.push({path:folder+base+'.tif',data:gridParaGeoTIFF(grid,actualCRS,-9999)});
    }else if(format==='asc'){
      if(typeof gridParaASC!=='function')throw new Error('Gravador ASCII Grid indisponível');
      files.push({path:folder+base+'.asc',data:gridParaASC(grid,-9999)});
    }else{
      if(typeof gridParaXYZ!=='function')throw new Error('Gravador XYZ indisponível');
      files.push({path:folder+base+'.xyz',data:gridParaXYZ(grid)});
    }
    if(format!=='tif')files.push({path:folder+base+'.prj',data:gmBatchPrjText(actualCRS)});
    if(source.d&&source.d.resampled>1&&grid===source.d)warnings.push('Foi exportada a grade de tela reamostrada; a fonte nativa não estava carregada na memória.');
    if(cellCount>20000000)warnings.push('Arquivo raster grande; formatos de texto podem ocupar muito espaço.');
  }else if(format==='tifsrc'){
    const raw=gmBatchOriginalRaster(source);actualCRS=gmBatchImageCRS(source,format);
    dimensions=[+source._W0||null,+source._H0||null];sourceDimensions=dimensions.slice();
    files.push({path:folder+base+'.tif',data:raw});
  }else{
    const payload=await gmBatchImagePNG(source);actualCRS=payload.crs;dimensions=[payload.width,payload.height];cellCount=payload.width*payload.height;
    sourceDimensions=[+source._W0||payload.width,+source._H0||payload.height];
    files.push({path:folder+base+'.png',data:payload.blob},{path:folder+base+'.pgw',data:payload.pgw},
      {path:folder+base+'.prj',data:gmBatchPrjText(actualCRS)});
    if(actualCRS==='EPSG:3857')warnings.push('A prévia exibida já estava reamostrada em Web Mercator; o PGW e o PRJ foram gerados nesse CRS para evitar deslocamento.');
    if(sourceDimensions[0]!==payload.width||sourceDimensions[1]!==payload.height)
      warnings.push(`Foi exportada a prévia ${payload.width}×${payload.height}; a fonte ${sourceDimensions[0]}×${sourceDimensions[1]} deve ser religada para exportar o GeoTIFF original.`);
  }
  used.add((folder+base).toLocaleLowerCase('pt-BR'));
  return {layerId:String(source.id!=null?source.id:descriptor.id),layerKey:descriptor.key||null,layerName:source.name||'Camada',
    sourceKind:checked.sourceKind,geometryType:checked.sourceKind==='vector'?source.gtype:null,format,
    requestedFormat:job.requestedFormat||job.format||'auto',requestedCRS:job.targetCRS||null,actualCRS,
    featureCount,cellCount,dimensions,sourceDimensions,treeOrder:descriptor.treeOrder||job.treeOrder||job.ordinal||1,
    groupPath:(descriptor.groupPath||[]).map(group=>group.name),files,warnings};
}

function gmBatchReadJobs(modal){
  const useFilter=!!modal.querySelector('#gmbxUseFilter').checked,
    folderMode=modal.querySelector('#gmbxFolderMode').value==='flat'?'flat':'tree';
  return [...modal.querySelectorAll('.gmbx-row[data-exportable="1"]')].filter(row=>row.querySelector('.gmbx-check').checked).map((row,index)=>{
    const descriptor=gmBatchSources.get(row.dataset.key),requestedFormat=row.querySelector('.gmbx-format').value;
    const format=requestedFormat==='auto'?gmBatchDetectFormat(descriptor):requestedFormat;
    return {descriptor,source:descriptor&&descriptor.source,sourceKind:descriptor&&descriptor.sourceKind,
      layer:descriptor&&descriptor.sourceKind==='vector'?descriptor.source:null,layerId:descriptor?String(descriptor.id):row.dataset.key,
      format,requestedFormat,targetCRS:format==='shp'?row.querySelector('.gmbx-crs').value:null,
      useFilter,folderMode,ordinal:index+1,treeOrder:descriptor&&descriptor.treeOrder,groupPath:descriptor&&descriptor.groupPath};
  });
}
function gmBatchSetProgress(modal,done,total,labelText){
  if(!modal)return;
  const box=modal.querySelector('.gmbx-progress'),bar=modal.querySelector('.gmbx-progress-bar'),label=modal.querySelector('.gmbx-progress-text');
  box.classList.add('on');bar.style.width=(total?Math.round(done/total*100):0)+'%';label.textContent=labelText||'';
}
function gmBatchSetResult(modal,type,value){
  if(!modal)return;const element=modal.querySelector('.gmbx-result');
  if(!value){element.className='gmbx-result';element.textContent='';return;}
  element.className='gmbx-result on '+type;element.textContent=value;
}
async function exportarCamadasEmLote(jobs,options){
  options=options||{};
  if(typeof JSZip==='undefined')throw new Error('Compactador ZIP indisponível');
  if(!Array.isArray(jobs)||!jobs.length)throw new Error('Selecione pelo menos uma camada');
  const folderMode=options.folderMode==='flat'||(!options.folderMode&&jobs[0].folderMode==='flat')?'flat':'tree',
    zip=new JSZip(),used=new Set(),items=[],success=[];
  for(let index=0;index<jobs.length;index++){
    const job=Object.assign({},jobs[index],{ordinal:jobs[index].ordinal||index+1,folderMode}),descriptor=gmBatchJobDescriptor(job);
    const source=descriptor.source,name=source&&source.name||'camada';
    if(options.onProgress)options.onProgress(index,jobs.length,'Preparando '+name+'…');
    try{
      const artifact=await buildLayerExportArtifact(job,used);artifact.files.forEach(file=>zip.file(file.path,file.data));success.push(artifact);
      items.push(Object.assign({},artifact,{status:'ok',files:artifact.files.map(file=>file.path)}));
    }catch(error){
      items.push({layerId:String(job.layerId||source&&source.id||''),layerKey:descriptor.key||null,layerName:name,
        sourceKind:descriptor.sourceKind||null,treeOrder:descriptor.treeOrder||job.treeOrder||job.ordinal,
        groupPath:(descriptor.groupPath||[]).map(group=>group.name),format:gmBatchResolveFormat(job,descriptor)||job.format||'',
        requestedFormat:job.requestedFormat||job.format||'auto',status:'erro',code:error&&error.code||'EXPORT_FAILED',
        error:String(error&&error.message||error),files:[]});
    }
    if(options.onProgress)options.onProgress(index+1,jobs.length,(index+1)+' de '+jobs.length+' camada(s) processada(s)');
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  const byKind={vector:0,raster:0,image:0};success.forEach(item=>{if(Object.prototype.hasOwnProperty.call(byKind,item.sourceKind))byKind[item.sourceKind]++;});
  const manifest={schema:GM_BATCH_SCHEMA,createdAt:new Date().toISOString(),application:'GeoMine',
    folderMode,
    projectCRS:gmBatchState().workCRS||null,filtersApplied:jobs.some(job=>gmBatchJobDescriptor(job).sourceKind==='vector'&&job.useFilter!==false),
    treeWarnings:Array.isArray(options.treeWarnings)?options.treeWarnings.slice():[],
    totals:{requested:jobs.length,succeeded:success.length,failed:jobs.length-success.length},succeededByKind:byKind,items};
  if(!success.length){const error=new Error('Nenhuma camada pôde ser exportada');error.code='ALL_FAILED';error.manifest=manifest;throw error;}
  const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}},metadata=>{
    if(options.onZipProgress)options.onZipProgress(metadata.percent||0);
  });
  const name=options.fileName||gmBatchNowName();if(options.download!==false)await download(blob,name);
  return {blob,name,manifest,artifacts:success};
}

function gmBatchSyncRow(row){
  const descriptor=gmBatchSources.get(row.dataset.key),exportable=!!(descriptor&&descriptor.exportable);
  const check=row.querySelector('.gmbx-check'),checked=exportable&&check.checked,formatSelect=row.querySelector('.gmbx-format');
  const requested=formatSelect&&formatSelect.value,format=requested==='auto'?gmBatchDetectFormat(descriptor):requested;
  row.classList.toggle('off',!checked);row.classList.toggle('blocked',!exportable);check.disabled=!exportable;formatSelect.disabled=!checked;
  const crs=row.querySelector('.gmbx-crs'),fixed=row.querySelector('.gmbx-crs-fixed');
  if(!exportable){crs.hidden=true;crs.disabled=true;fixed.hidden=false;fixed.innerHTML='<b>TIN não é raster</b><br>rasterize a superfície primeiro';return;}
  if(format==='shp'){crs.hidden=false;crs.disabled=!checked;fixed.hidden=true;}
  else{
    crs.hidden=true;crs.disabled=true;fixed.hidden=false;let title='',detail='';
    if(format==='dxf'){title=gmBatchState().workCRS||'CRS do projeto';detail='cotas Z preservadas';}
    else if(format==='geojson'||format==='kml'){title='EPSG:4326 · WGS84';detail='conversão automática';}
    else if(descriptor.sourceKind==='raster'){title=gmBatchRasterCRS(descriptor.source,gmBatchGrid(descriptor.source))||'CRS da grade';detail='pixels não são reamostrados';}
    else if(format==='tifsrc'){title='CRS incorporado no GeoTIFF';detail='arquivo original, sem reamostragem';}
    else{title=gmBatchImageCRS(descriptor.source,format)||'CRS da imagem';detail='PNG da prévia, PGW e PRJ';}
    fixed.innerHTML=`<b>${gmBatchEsc(title)}</b><br>${gmBatchEsc(detail)}`;
  }
}
function gmBatchRowsForGroup(modal,groupId){
  return [...modal.querySelectorAll('.gmbx-row[data-exportable="1"]')].filter(row=>{
    const descriptor=gmBatchSources.get(row.dataset.key);return descriptor&&descriptor.groupPath.some(group=>gmBatchGroupId(group.id)===groupId);
  });
}
function gmBatchSyncGroups(modal){
  modal.querySelectorAll('.gmbx-group').forEach(row=>{
    const groupId=row.dataset.groupId,rows=gmBatchRowsForGroup(modal,groupId),check=row.querySelector('.gmbx-group-check');
    const checked=rows.filter(layerRow=>layerRow.querySelector('.gmbx-check').checked).length;
    check.disabled=!rows.length;check.checked=!!rows.length&&checked===rows.length;check.indeterminate=checked>0&&checked<rows.length;
    row.querySelector('.gmbx-group-count').textContent=rows.length?`${checked}/${rows.length}`:'vazio';
  });
}
function gmBatchApplyFolds(modal){
  modal.querySelectorAll('.gmbx-group').forEach(row=>{
    const entry=gmBatchGroups.get(row.dataset.groupId),hidden=entry&&entry.ancestorGroupIds.some(id=>gmBatchCollapsed.has(id));
    row.hidden=!!hidden;const button=row.querySelector('.gmbx-group-toggle');
    button.textContent=gmBatchCollapsed.has(row.dataset.groupId)?'▸':'▾';button.setAttribute('aria-expanded',gmBatchCollapsed.has(row.dataset.groupId)?'false':'true');
  });
  modal.querySelectorAll('.gmbx-row').forEach(row=>{
    const descriptor=gmBatchSources.get(row.dataset.key);row.hidden=!!(descriptor&&descriptor.groupPath.some(group=>gmBatchCollapsed.has(gmBatchGroupId(group.id))));
  });
}
function gmBatchUpdateSummary(modal){
  const rows=[...modal.querySelectorAll('.gmbx-row[data-exportable="1"]')],selected=rows.filter(row=>row.querySelector('.gmbx-check').checked);
  const kinds={vector:0,raster:0,image:0};
  selected.forEach(row=>{const descriptor=gmBatchSources.get(row.dataset.key);if(descriptor&&kinds[descriptor.sourceKind]!=null)kinds[descriptor.sourceKind]++;});
  const parts=[];if(kinds.vector)parts.push(kinds.vector+' vetor'+(kinds.vector===1?'':'es'));if(kinds.raster)parts.push(kinds.raster+' raster'+(kinds.raster===1?'':'s'));if(kinds.image)parts.push(kinds.image+' imagem'+(kinds.image===1?'':'ns'));
  modal.querySelector('.gmbx-summary').textContent=`${selected.length} de ${rows.length} · ${parts.join(' · ')||'nenhuma selecionada'}`;
  const button=modal.querySelector('.gmbx-export');button.disabled=!selected.length;button.textContent=selected.length?`Exportar ${selected.length} camada${selected.length===1?'':'s'}`:'Selecione camadas';
  const resolved=selected.map(row=>{const descriptor=gmBatchSources.get(row.dataset.key),value=row.querySelector('.gmbx-format').value;return value==='auto'?gmBatchDetectFormat(descriptor):value;});
  const flat=modal.querySelector('#gmbxFolderMode')&&modal.querySelector('#gmbxFolderMode').value==='flat',
    layout=flat?'Arquivos brutos na raiz, sem pastas ou numeração. ':'Pastas e numeração seguem a árvore. ';
  modal.querySelector('.gmbx-note').textContent=layout+(resolved.includes('png')?'Imagens incluem PNG, PGW e PRJ.':
    resolved.includes('shp')?'Cada Shapefile contém SHP, SHX, DBF, PRJ e CPG (UTF-8).':'Será gerado um único ZIP.');
  gmBatchSyncGroups(modal);
}
function gmBatchSelect(modal,mode){
  modal.querySelectorAll('.gmbx-row[data-exportable="1"]').forEach(row=>{
    const descriptor=gmBatchSources.get(row.dataset.key),check=row.querySelector('.gmbx-check');
    check.checked=mode==='all'||(mode==='visible'&&descriptor&&descriptor.visible);gmBatchSyncRow(row);
  });gmBatchUpdateSummary(modal);
}
function gmBatchSelectGroup(modal,groupId,value){
  gmBatchRowsForGroup(modal,groupId).forEach(row=>{row.querySelector('.gmbx-check').checked=value;gmBatchSyncRow(row);});gmBatchUpdateSummary(modal);
}
function gmBatchClose(modal){if(modal&&!modal.dataset.busy)modal.remove();}
function gmBatchGroupHTML(entry){
  return `<div class="gmbx-group" data-group-id="${gmBatchEsc(gmBatchGroupId(entry.id))}" style="--gmbx-depth:${entry.depth}">
    <button class="gmbx-group-toggle" type="button" aria-label="Expandir ou recolher ${gmBatchEsc(entry.name)}">▾</button>
    <input class="gmbx-group-check" type="checkbox" aria-label="Selecionar grupo ${gmBatchEsc(entry.name)}">
    <span class="gmbx-folder-icon">▰</span><span class="gmbx-group-name">${gmBatchEsc(entry.name)}</span>
    <span class="gmbx-group-tag">${entry.depth?'SUBGRUPO':'GRUPO'}</span><span class="gmbx-group-count"></span></div>`;
}
function gmBatchSourceHTML(descriptor,selected){
  const source=descriptor.source,on=descriptor.exportable&&selected.has(descriptor.key),defaultCRS=gmBatchDefaultCRS(source);
  return `<div class="gmbx-row${on?'':' off'}${descriptor.exportable?'':' blocked'}" data-key="${gmBatchEsc(descriptor.key)}" data-exportable="${descriptor.exportable?'1':'0'}" style="--gmbx-depth:${descriptor.depth}">
    <input class="gmbx-check" type="checkbox" ${on?'checked':''}${descriptor.exportable?'':' disabled'} aria-label="Selecionar ${gmBatchEsc(source.name||'camada')}">
    <div class="gmbx-layer"><span class="gmbx-type-icon ${gmBatchEsc(gmBatchTypeClass(descriptor))}">${gmBatchTypeGlyph(descriptor)}</span><div class="gmbx-layer-text"><div class="gmbx-layer-name" title="${gmBatchEsc(source.name||'Camada')}">${gmBatchEsc(source.name||'Camada')}</div><div class="gmbx-layer-meta">${gmBatchEsc(gmBatchSourceMeta(descriptor))}</div></div></div>
    <span class="gmbx-kind">${gmBatchEsc(gmBatchTypeLabel(descriptor))}</span>
    <select class="gmbx-format" ${on?'':'disabled'} aria-label="Formato">${gmBatchFormatOptions(descriptor)}</select>
    <div><select class="gmbx-crs" ${on?'':'disabled'} aria-label="CRS do Shapefile">${gmBatchCRSOptions(defaultCRS)}</select><div class="gmbx-crs-fixed" hidden></div></div></div>`;
}
function abreExportacaoLote(){
  const old=document.getElementById('gmBatchExportModal');if(old)old.remove();
  const snapshot=gmBatchTreeSnapshot(),sources=snapshot.sources,exportable=sources.filter(descriptor=>descriptor.exportable);
  if(!exportable.length){toast('Não há camadas vetoriais ou rasters exportáveis');return;}
  const selected=gmBatchPreselected(exportable);
  gmBatchSources=new Map(sources.map(descriptor=>[descriptor.key,descriptor]));gmBatchGroups=new Map(snapshot.groups.map(entry=>[gmBatchGroupId(entry.id),entry]));
  gmBatchTreeEntries=snapshot.entries;gmBatchTreeWarnings=snapshot.warnings;
  gmBatchCollapsed=new Set(snapshot.groups.filter(entry=>entry.collapsed).map(entry=>gmBatchGroupId(entry.id)));
  const backdrop=document.createElement('div');backdrop.id='gmBatchExportModal';backdrop.className='gmbx-backdrop';
  backdrop.innerHTML=`<section class="gmbx-modal" role="dialog" aria-modal="true" aria-labelledby="gmbxTitle">
    <header class="gmbx-head"><span class="gmbx-head-icon"><svg viewBox="0 0 24 24"><path d="M4 6.5 12 3l8 3.5-8 3.5-8-3.5Z"/><path d="m4 11 8 3.5 8-3.5M4 15.5 12 19l8-3.5"/><path d="M12 10v8"/></svg></span>
      <div><div class="gmbx-title" id="gmbxTitle">Exportar várias camadas</div><div class="gmbx-sub">Escolha a organização do ZIP; o formato é detectado para vetor ou raster.</div></div>
      <button class="gmbx-close" type="button" title="Fechar" aria-label="Fechar">×</button></header>
    <div class="gmbx-tools"><button class="tbtn" type="button" data-select="visible">Visíveis</button><button class="tbtn" type="button" data-select="all">Todas</button><button class="tbtn" type="button" data-select="none">Limpar</button>
      <span class="gmbx-spacer"></span><span class="gmbx-summary"></span></div>
    <div class="gmbx-body"><div class="gmbx-grid"><div class="gmbx-grid-head"><span></span><span>Camada</span><span>Tipo detectado</span><span>Formato</span><span>Referência espacial</span></div>
      ${gmBatchTreeEntries.map(entry=>entry.kind==='group'?gmBatchGroupHTML(entry):gmBatchSourceHTML(entry,selected)).join('')}
    </div></div>
    <footer class="gmbx-foot"><div class="gmbx-foot-options"><label class="gmbx-option"><input id="gmbxUseFilter" type="checkbox" checked> Aplicar os filtros de atributos ativos às camadas vetoriais</label>
      <label class="gmbx-output">Organização do ZIP <select id="gmbxFolderMode"><option value="tree">Pastas conforme a árvore</option><option value="flat">Arquivos brutos · sem pastas ou numeração</option></select></label></div>
      <div class="gmbx-progress"><div class="gmbx-progress-track"><div class="gmbx-progress-bar"></div></div><div class="gmbx-progress-text"></div></div><div class="gmbx-result"></div>
      <div class="gmbx-actions"><span class="gmbx-note"></span><button class="tbtn gmbx-cancel" type="button">Cancelar</button><button class="tbtn gmbx-export" type="button">Exportar</button></div></footer>
  </section>`;
  document.body.appendChild(backdrop);
  backdrop.querySelectorAll('.gmbx-row').forEach(row=>{
    row.querySelector('.gmbx-check').onchange=()=>{gmBatchSyncRow(row);gmBatchUpdateSummary(backdrop);};
    row.querySelector('.gmbx-format').onchange=()=>{gmBatchSyncRow(row);gmBatchUpdateSummary(backdrop);};gmBatchSyncRow(row);
  });
  backdrop.querySelectorAll('.gmbx-group').forEach(row=>{
    const id=row.dataset.groupId,check=row.querySelector('.gmbx-group-check'),toggle=row.querySelector('.gmbx-group-toggle');
    check.onchange=event=>{event.stopPropagation();gmBatchSelectGroup(backdrop,id,check.checked);};
    toggle.onclick=()=>{if(gmBatchCollapsed.has(id))gmBatchCollapsed.delete(id);else gmBatchCollapsed.add(id);gmBatchApplyFolds(backdrop);};
  });
  backdrop.querySelectorAll('[data-select]').forEach(button=>button.onclick=()=>gmBatchSelect(backdrop,button.dataset.select));
  backdrop.querySelector('#gmbxFolderMode').onchange=()=>gmBatchUpdateSummary(backdrop);
  backdrop.querySelector('.gmbx-close').onclick=()=>gmBatchClose(backdrop);backdrop.querySelector('.gmbx-cancel').onclick=()=>gmBatchClose(backdrop);
  backdrop.onclick=event=>{if(event.target===backdrop)gmBatchClose(backdrop);};
  backdrop.querySelector('.gmbx-export').onclick=async()=>{
    const jobs=gmBatchReadJobs(backdrop);if(!jobs.length)return;
    backdrop.dataset.busy='1';backdrop.querySelectorAll('button,select,input').forEach(element=>element.disabled=true);gmBatchSetResult(backdrop,'','');
    try{
      const result=await exportarCamadasEmLote(jobs,{treeWarnings:gmBatchTreeWarnings,
        onProgress:(done,total,text)=>gmBatchSetProgress(backdrop,done,total,text),
        onZipProgress:percent=>gmBatchSetProgress(backdrop,jobs.length,jobs.length,`Compactando pacote… ${Math.round(percent)}%`)});
      const failed=result.manifest.totals.failed;gmBatchSetProgress(backdrop,jobs.length,jobs.length,'Pacote concluído');
      const flat=result.manifest.folderMode==='flat';
      gmBatchSetResult(backdrop,failed?'warn':'ok',failed?`${result.manifest.totals.succeeded} camada(s) exportada(s); ${failed} falha(s). As demais foram mantidas no ZIP.`:`${result.manifest.totals.succeeded} camada(s) exportada(s) com sucesso${flat?', sem subpastas':', conforme a árvore'}.`);
      toast(failed?'Exportação concluída com avisos':'Exportação em lote concluída');
    }catch(error){gmBatchSetResult(backdrop,'err',String(error&&error.message||error));toast('Falha na exportação em lote');}
    finally{
      delete backdrop.dataset.busy;backdrop.querySelectorAll('button,select,input').forEach(element=>element.disabled=false);
      backdrop.querySelectorAll('.gmbx-row').forEach(gmBatchSyncRow);gmBatchUpdateSummary(backdrop);gmBatchApplyFolds(backdrop);
    }
  };
  gmBatchUpdateSummary(backdrop);gmBatchApplyFolds(backdrop);setTimeout(()=>backdrop.querySelector('.gmbx-export').focus(),0);
}
function gmBatchInstallMenuEntry(){
  const button=document.getElementById('btnExport');if(!button||button.dataset.gmBatchHook)return;
  button.dataset.gmBatchHook='1';const original=button.onclick;
  button.onclick=function(event){
    if(typeof original==='function')original.call(this,event);
    const menus=[...document.querySelectorAll('.a3-float-menu')],menu=menus.reverse().find(node=>node.querySelector('.xmi'));
    if(!menu||menu.querySelector('[data-gmbx-menu]'))return;
    const first=menu.querySelector('.xmi'),item=document.createElement('div');item.className='xmi';item.dataset.gmbxMenu='1';
    item.style.cssText='padding:10px 12px;cursor:pointer;display:flex;gap:9px;align-items:center;border-top:1px solid var(--line,#2a3446)';
    item.innerHTML='<span style="color:#20a7c7;font-size:17px">▦</span><div><b>Várias camadas</b><br><span style="font-size:11px;color:var(--ink-dim)">vetores e rasters, na ordem da árvore</span></div>';
    first.after(item);item.onclick=click=>{click.stopPropagation();menu.remove();abreExportacaoLote();};
  };
}

window.GeoMineBatchExport={open:abreExportacaoLote,run:exportarCamadasEmLote,buildArtifact:buildLayerExportArtifact,
  validateJob,safeName:gmBatchSafeName,treeSnapshot:gmBatchTreeSnapshot,detectFormat:gmBatchDetectFormat,
  prjText:gmBatchPrjText,imageBounds:gmBatchImageBounds,
  formats:Object.freeze(Object.assign({},GM_BATCH_FORMATS))};
window.abreExportacaoLote=abreExportacaoLote;window.exportarCamadasEmLote=exportarCamadasEmLote;
window.buildLayerExportArtifact=buildLayerExportArtifact;window.validateBatchExportJob=validateJob;
gmBatchInstallMenuEntry();
})();
