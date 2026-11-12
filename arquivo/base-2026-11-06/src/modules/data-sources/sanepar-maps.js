/* Public sanitation attributes by street segment, Paraná Interativo layer 14. */
(function(){
'use strict';
const SOURCE='https://paranainterativo.pr.gov.br/interativo/rest/services/BaseDadosParanaInterativo/FeatureServer/14';
const THEMES={agua:{field:'TipoAbstDeAgua',name:'Abastecimento de água',color:'#248bc7'},esgoto:{field:'TipoColetaEsgoto',name:'Coleta de esgoto',color:'#a26c39'},vias:{field:null,name:'Malha viária e saneamento',color:'#617a92'}};
let active=null;
const $=id=>document.getElementById('san'+id),status=text=>{if($('Status'))$('Status').textContent=text;};
async function request(path,params,signal){
 const ctl=new AbortController(),stop=()=>ctl.abort();
 signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)ctl.abort();
 const timer=setTimeout(stop,90000);
 try{
  const response=await fetch(SOURCE+path+'?'+new URLSearchParams(params),{signal:ctl.signal});
  if(!response.ok)throw Error('O serviço retornou HTTP '+response.status+'.');
  const data=await response.json();if(data.error)throw Error(data.error.message||'Consulta recusada pelo serviço.');return data;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);}
}
async function fetchArea(bbox,{signal,onProgress=()=>{}}={}){
 if(bbox.length!==4||!bbox.every(Number.isFinite)||bbox[0]>=bbox[2]||bbox[1]>=bbox[3])throw Error('Área inválida.');
 const meta=await request('',{f:'json'},signal);
 if(meta.geometryType!=='esriGeometryPolyline')throw Error('O tipo da camada mudou. Confira a fonte antes de importar.');
 const oid=meta.objectIdField;if(!oid)throw Error('A fonte não informou o identificador das feições.');
 const index=await request('/query',{f:'json',where:'1=1',geometry:bbox.join(','),geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects',returnIdsOnly:'true'},signal);
 if(!Array.isArray(index.objectIds)&&index.objectIds!==null)throw Error('O serviço não informou os trechos da área.');
 const ids=[...new Set(index.objectIds||[])].sort((a,b)=>a-b);
 if(index.exceededTransferLimit||ids.length>25000)throw Error('Área muito extensa. Aproxime o mapa e tente novamente.');
 if(!ids.every(Number.isSafeInteger))throw Error('Identificadores inválidos na fonte.');
 const features=[],seen=new Set(),batch=Math.max(1,Math.min(250,Number(meta.maxRecordCount)||250));
 for(let offset=0;offset<ids.length;offset+=batch){
  if(signal?.aborted)throw new DOMException('Consulta cancelada.','AbortError');
  const selected=ids.slice(offset,offset+batch),expected=new Set(selected.map(String));
  const data=await request('/query',{f:'geojson',objectIds:selected.join(','),outFields:'*',outSR:'4326',returnGeometry:'true'},signal);
  if(data.type!=='FeatureCollection'||!Array.isArray(data.features)||(data.exceededTransferLimit||data.properties?.exceededTransferLimit))throw Error('Resposta incompleta; nenhuma camada foi importada.');
  for(const f of data.features){
   const id=String(f.properties?.[oid]??f.id);
   if(!expected.has(id)||seen.has(id)||!['LineString','MultiLineString'].includes(f.geometry?.type))throw Error('Resposta inconsistente; nenhuma camada foi importada.');
   seen.add(id);features.push(f);
  }
  if(selected.some(id=>!seen.has(String(id))))throw Error('Faltam trechos na resposta; nenhuma camada foi importada.');
  onProgress(features.length,ids.length);
 }
 return {type:'FeatureCollection',features};
}
function cancel(){if(active){active.controller.abort();active=null;}if($('Import'))$('Import').disabled=false;status('Consulta cancelada.');}
function close(){cancel();$('Modal')?.classList.remove('on');}
function open(){
 if(!$('Modal')){
  const el=document.createElement('div');el.id='sanModal';el.className='modal-bg';
  el.innerHTML=`<div class="modal" style="width:min(520px,95vw)"><div class="modal-h"><b>Mapas da Sanepar · Paraná</b><div style="flex:1"></div><button class="tbtn" id="sanClose" aria-label="Fechar">✕</button></div><div class="modal-b">
  <p>Importe informações de água e esgoto dos trechos que cruzam a área visível do mapa.</p>
  <label class="field" for="sanTheme">Tema</label><select id="sanTheme"><option value="agua">Abastecimento de água por via</option><option value="esgoto">Coleta de esgoto por via</option><option value="vias">Malha viária com todos os atributos</option></select>
  <p class="hint">Fonte: Paraná Interativo — Malha Viária. Os dados descrevem o atendimento das vias; não representam o traçado cadastral das tubulações. Consulte as datas e os atributos de cada trecho na tabela.</p>
  <p><a style="color:#8cd8ff" href="${SOURCE}" target="_blank" rel="noopener noreferrer">Consultar fonte e metadados</a></p>
  <div style="display:flex;gap:8px"><button class="tbtn" id="sanImport">Importar área visível</button><button class="tbtn" id="sanCancel">Cancelar consulta</button></div>
  <p class="hout" id="sanStatus" role="status">Aproxime o mapa da área de interesse antes de importar.</p></div></div>`;
  document.body.appendChild(el);$('Close').onclick=close;$('Cancel').onclick=cancel;$('Import').onclick=()=>download();
 }
 $('Modal').classList.add('on');
}
async function download(){
 if(active)return;
 const bounds=map.getBounds(),bbox=[bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()],theme=THEMES[$('Theme').value];
 if(!theme)return;
 const job={controller:new AbortController(),project:S.projectId};active=job;$('Import').disabled=true;status('Consultando trechos na área visível…');
 try{
  const data=await fetchArea(bbox,{signal:job.controller.signal,onProgress:(n,total)=>{if(active===job)status('Recebidos '+n+' de '+total+' trechos…');}});
  if(active!==job||job.controller.signal.aborted)return;
  if(S.projectId!==job.project)throw Error('O projeto mudou. Abra o painel e repita a consulta.');
  if(!data.features.length){status('Nenhum trecho encontrado nesta área.');return;}
  if(theme.field&&!data.features.some(f=>Object.hasOwn(f.properties||{},theme.field)))throw Error('O tema não está disponível nos atributos da fonte.');
  const before=new Set(S.layers),center=map.getCenter(),zoom=map.getZoom();
  try{importGeoJSON(data,'Paraná Interativo — '+theme.name);}finally{map.setView(center,zoom,{animate:false});}
  const layer=S.layers.find(L=>!before.has(L));if(!layer)throw Error('Não foi possível criar a camada.');
  layer.sourceOfficial=true;layer.sourceUrl=SOURCE;layer.sourceAccessedAt=new Date().toISOString();
  layer.color=theme.color;layer.sym.color=theme.color;layer.sym.stroke=theme.color;
  if(theme.field){
   const values=[...new Set(layer.features.map(f=>String(f.props?.[theme.field])))].sort(),colors=['#248bc7','#35a67c','#dc9634','#b064bc','#7c8e9c','#e16961'];
   layer.sym.mode='cat';layer.sym.field=theme.field;
   layer.sym.cats=values.map((value,i)=>({value,color:!['null','undefined',''].includes(value)?colors[i%colors.length]:'#9a9a9a',label:['null','undefined',''].includes(value)?'Sem informação':value}));
  }
  drawLayer(layer);refreshUI();status(layer.features.length.toLocaleString('pt-BR')+' trechos importados. Consulte os tipos de atendimento e datas na tabela de atributos.');
 }catch(error){if(active===job)status(error.name==='AbortError'?'Consulta interrompida. Tente novamente.':error.message);}
 finally{if(active===job){active=null;$('Import').disabled=false;}}
}
function install(){
 const cat=CATS.find(c=>c.id==='ambiente');if(!cat||cat.grupos.some(g=>g.it?.some(i=>i.ic==='sanepar_maps')))return;
 let group=cat.grupos.find(g=>g.label==='Bases de saneamento');if(!group){group={label:'Bases de saneamento',it:[]};cat.grupos.push(group);}
 group.it.push({ic:'sanepar_maps',nome:'Mapas da Sanepar',desc:'Consultar água e esgoto por via no Paraná Interativo',act:open});
}
if(typeof RIB_SVG!=='undefined')RIB_SVG.sanepar_maps='<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M5 10l12-4 14 4 12-4v32l-12 4-14-4-12 4z" fill="#d8eee9" stroke="#245f72" stroke-width="2"/><path d="M17 6v32m14-28v32M8 31l10-8 12 7 10-12" fill="none" stroke="#70a395" stroke-width="2"/><path d="M25 7c-4 6-8 10-8 15a8 8 0 0 0 16 0c0-5-4-9-8-15z" fill="#318fca" stroke="#185474" stroke-width="2"/><path d="M21 22q0 5 5 5" fill="none" stroke="white" stroke-width="2"/></svg>';
const base=window.ribbonBuild;if(base)window.ribbonBuild=function(){install();return base.apply(this,arguments);};install();setTimeout(()=>ribbonBuild(),0);
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('Modal')?.classList.contains('on')){e.preventDefault();e.stopImmediatePropagation();close();}},true);
window.GeoMineSanepar={open,close,cancel,download,fetchArea,install,SOURCE};
})();
