/* Delimitação no mapa e extração do talvegue principal em células nativas. */
(function(root){
'use strict';
const TOOL='thalwegRegion',el=s=>document.getElementById('thal'+s),gen=()=>root.GeoMineSessionAutosave?.state?.generation;
const fmt=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2});
let region=null,drawing=null,outline=null,job=null,context=null,describing=0;
const abort=()=>Object.assign(new Error('Extração cancelada: a área, o MDT ou o projeto mudou.'),{name:'AbortError'});
function status(text){if(el('Status'))el('Status').textContent=text||'';}
function removeOutline(){if(outline){map.removeLayer(outline);outline=null;}}
function resetProject(){cancel();endDrawing();removeOutline();region=null;context=null;describing++;el('Modal')?.classList.remove('on');}
function syncContext(){const key=String(S.projectId)+'|'+String(gen());if(context!==key){resetProject();context=key;}}
function rasters(){return (S.rasters||[]).filter(r=>root.GeoMineChannelDEM.isElevation(r));}
function selectedRaster(){return rasters().find(r=>String(r.id)===el('Raster')?.value);}
function regionCurrent(r=region){return !!r&&r.project===S.projectId&&r.generation===gen()&&r.crs===S.workCRS&&
  (!r.source||S.layers.includes(r.source)&&r.source.features.includes(r.feature)&&r.source.crs===r.sourceCRS&&JSON.stringify(r.feature.geom)===r.sourceGeom);}
function metricScale(sampler){const p=proj4(sampler.sourceCRS).oProj,scale=Number(p.to_meter??1);
  if(p.projName==='longlat'||!(scale>0&&Number.isFinite(scale)))throw Error('Use um MDT com CRS projetado para extrair o talvegue em metros.');return scale;}
function rasterRings(sampler){return region.rings.map(r=>r.map(p=>sampler.toRaster(p)));}
function drawOutline(){removeOutline();if(!regionCurrent())return;
  const coords=region.rings.map(r=>r.map(p=>{const w=toWGS(region.crs,p[0],p[1]);return [w[1],w[0]];}));
  outline=L2.polygon(coords,{pane:'alagis_desenho',color:'#e6aa38',weight:2,dashArray:'6 4',fillOpacity:.06,interactive:false}).addTo(map);
}
function regionLabel(){el('Region').textContent=regionCurrent()?'Área delimitada · '+region.rings.reduce((n,r)=>n+r.length-1,0)+' vértices':'Área ainda não delimitada';}
async function describe(){
  const r=selectedRaster(),token=++describing,p=S.projectId,g=gen(),area=region;
  if(!r){el('Info').textContent='Selecione o MDT.';return;}
  el('Info').textContent='Verificando resolução nativa…';let sampler;
  const current=()=>token===describing&&S.projectId===p&&gen()===g&&selectedRaster()===r&&region===area&&!job;
  try{
    sampler=await root.GeoMineChannelDEM.prepare(r,{workCRS:S.workCRS,isCurrent:current});if(!current())return;
    const scale=metricScale(sampler),dx=sampler.grid.cs*scale,dy=sampler.grid.csy*scale;
    let text='Resolução nativa: '+fmt(dx)+(Math.abs(dx-dy)>1e-8?' × '+fmt(dy):'')+' m';
    if(regionCurrent()){
      const estimate=root.GeoMineThalwegEngine.estimate({...sampler.grid,unitScale:scale},rasterRings(sampler));
      text+=' · '+estimate.cells.toLocaleString('pt-BR')+' células na envolvente'+(estimate.compact?' · leitura em blocos':'');
    }
    el('Info').textContent=text;
  }catch(e){if(current()&&e.name!=='AbortError')el('Info').textContent=e.message;}
  finally{sampler?.close();}
}
function refresh(){
  const previous=el('Raster').value,list=rasters(),chosen=list.find(r=>String(r.id)===previous)||list.find(r=>r===S.selRaster)||list.find(r=>r.id===S.hidro?.sourceRasterId)||list[0];
  el('Raster').replaceChildren(new Option('— selecione o MDT —',''),...list.map(r=>new Option(r.name||'MDT',String(r.id))));
  el('Raster').value=chosen?String(chosen.id):'';
  const oldDestination=el('Destination')?.value;
  root.GeoMineVectorDestination.mount(el('DestinationHost'),'thalDestination',null,'line',false);
  if(oldDestination&&[...el('Destination').options].some(o=>o.value===oldDestination))el('Destination').value=oldDestination;
  else if(!oldDestination&&!S.layers.some(L=>String(L.id)===el('Destination').value&&L.id===S.activeId))el('Destination').value='new';
  el('Destination').addEventListener('change',()=>{el('NameWrap').hidden=el('Destination').value!=='new';});
  el('NameWrap').hidden=el('Destination').value!=='new';regionLabel();describe();
}
function ensure(){
  if(el('Modal'))return;
  const bg=document.createElement('div');bg.id='thalModal';bg.className='modal-bg';
  bg.innerHTML=`<style>
  #thalModal [hidden],#thalDrawHud[hidden]{display:none!important}
  #thalModal .modal{width:min(430px,95vw)}
  #thalModal label.field{display:block;margin:10px 0 4px}
  #thalModal input,#thalModal select{width:100%}
  #thalModal .thal-row{display:flex;gap:8px;margin:10px 0}
  #thalModal .thal-row>.tbtn{flex:1;justify-content:center;white-space:normal}
  #thalModal .hint{font-size:12px;line-height:1.4}
  #thalDestinationHost>.hint{display:none}
  #thalStatus{white-space:pre-line;overflow-wrap:anywhere;max-height:110px;overflow:auto;margin-top:10px}
  #thalStatus:empty{display:none}#thalProgress{width:100%;margin-top:10px;accent-color:var(--cyan)}
  #thalDrawHud{position:absolute;left:12px;top:12px;z-index:1100;display:flex;align-items:center;flex-wrap:wrap;gap:8px;max-width:calc(100% - 80px);padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink);box-shadow:0 3px 14px #0003;font-size:12px}
  </style><div class="modal"><div class="modal-h"><b>Extração de talvegue</b><button class="tbtn" id="thalClose" aria-label="Fechar extração de talvegue">Fechar</button></div>
  <div class="modal-b"><label class="field" for="thalRaster">MDT</label><select id="thalRaster"></select>
  <div id="thalInfo" class="hint" style="margin-top:6px" aria-live="polite"></div>
  <div class="thal-row"><button class="tbtn" id="thalDraw">Desenhar área</button><button class="tbtn" id="thalUse">Usar polígono selecionado</button></div>
  <div id="thalRegion" class="hint"></div><div id="thalDestinationHost"></div>
  <div id="thalNameWrap"><label class="field" for="thalName">Nome da camada</label><input id="thalName" value="Talvegue MDT" maxlength="120"></div>
  <progress id="thalProgress" max="1" value="0" hidden></progress><div id="thalStatus" role="status"></div>
  <div class="thal-row"><button class="tbtn" id="thalCancel" hidden>Cancelar cálculo</button><button class="tbtn" id="thalRun" style="background:var(--amber);color:#201707;font-weight:700">Extrair talvegue</button></div>
  </div></div>`;
  document.body.append(bg);
  el('Close').onclick=()=>{cancel();describing++;bg.classList.remove('on');removeOutline();};
  el('Raster').onchange=()=>{cancel();describe();};el('Draw').onclick=beginDraw;el('Use').onclick=useSelected;el('Run').onclick=run;el('Cancel').onclick=cancel;
}
function selectedRegion(){
  const q=S.selFeat,L=q&&(q.layer||S.layers.find(l=>l.id===q.layerId)),saved=L?.features[q?.idx]?._thalweg;
  if(saved?.version!==2||!saved.region?.crs||!Array.isArray(saved.region.rings))return;
  try{
    const rings=saved.region.rings.map(r=>{if(!Array.isArray(r)||r.length<4)throw Error();return r.map(p=>{
      if(!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1]))throw Error();
      const xy=reproj(saved.region.crs,S.workCRS,p[0],p[1]);if(!xy.every(Number.isFinite))throw Error();return xy;});});
    region={project:S.projectId,generation:gen(),crs:S.workCRS,rings};
    const source=rasters().find(r=>String(r.id)===String(saved.source?.id)||r.name===saved.source?.name);
    if(source)el('Raster').replaceChildren(new Option(source.name,String(source.id)));
  }catch(_){/* A malformed/legacy receipt never prevents opening the tool. */}
}
function open(){syncContext();ensure();if(job){el('Modal').classList.add('on');return;}if(!regionCurrent())selectedRegion();refresh();drawOutline();status('');el('Modal').classList.add('on');}
function renderRegion(cursor){
  if(!drawing)return;drawing.group.clearLayers();const coords=drawing.points.map(p=>[p.lat,p.lng]);if(cursor)coords.push([cursor.lat,cursor.lng]);
  if(coords.length>1)(coords.length>2?L2.polygon:L2.polyline)(coords,{pane:'alagis_desenho',color:'#e6aa38',weight:2,fillOpacity:.12,interactive:false}).addTo(drawing.group);
  const label=el('DrawCount');if(label)label.textContent='Área do talvegue · '+drawing.points.length+' pontos';
}
function beginDraw(){
  if(job)return;syncContext();ensure();
  if(!mapaVista2D())switchView('map');
  if(S.drawBuf?.length){status('Conclua o desenho atual antes de delimitar a área.');return;}
  ferramentaEncerraComando(TOOL);if(typeof ED!=='undefined'&&ED.on)edLigar(false,true);
  removeOutline();el('Modal').classList.remove('on');describing++;setTool(TOOL);
  drawing={project:S.projectId,generation:gen(),crs:S.workCRS,points:[],group:L2.layerGroup().addTo(map)};
  map.doubleClickZoom.disable();
  let hud=el('DrawHud');if(!hud){hud=document.createElement('div');hud.id='thalDrawHud';hud.className='leaflet-control';hud.innerHTML='<span id="thalDrawCount"></span><button class="tbtn" id="thalFinish">Concluir</button><button class="tbtn" id="thalDrawCancel">Cancelar</button>';map.getContainer().append(hud);L2.DomEvent.disableClickPropagation(hud);el('Finish').onclick=finishRegion;el('DrawCancel').onclick=cancelDrawing;}
  hud.hidden=false;renderRegion();toast('Delimite a área. Enter, botão direito ou duplo clique conclui. Esc cancela.');
}
function mapClick(e){if(!drawing||S.tool!==TOOL||e?.originalEvent?.detail>1)return;
  const p=e?.latlng;if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng))return;
  const last=drawing.points.at(-1);if(last&&Math.abs(last.lat-p.lat)+Math.abs(last.lng-p.lng)<1e-11)return;
  drawing.points.push({lat:p.lat,lng:p.lng});renderRegion();
}
function endDrawing(){if(drawing){map.removeLayer(drawing.group);drawing=null;}if(el('DrawHud'))el('DrawHud').hidden=true;}
function cancelDrawing(){endDrawing();setTool('select');open();}
function finishRegion(){
  if(!drawing)return;
  if(drawing.points.length<3){toast('Marque pelo menos três pontos para fechar a área.');return;}
  if(drawing.project!==S.projectId||drawing.generation!==gen()||drawing.crs!==S.workCRS){cancelDrawing();return;}
  const ring=drawing.points.map(p=>fromWGS(drawing.crs,p.lng,p.lat));ring.push(ring[0].slice());
  region={project:S.projectId,generation:gen(),crs:S.workCRS,rings:[ring]};endDrawing();setTool('select');open();
}
function useSelected(){
  try{
    const q=S.selFeat,L=q&&(q.layer||S.layers.find(l=>l.id===q.layerId)),f=L?.features[q.idx];
    if(!f||L.gtype!=='polygon')throw Error('Selecione um polígono no mapa para usar como limite.');
    const rings=(f.multi&&Array.isArray(f.geom?.[0]?.[0])?f.geom:[f.geom]).map(r=>{
      const points=r.map(p=>reproj(L.crs,S.workCRS,p[0],p[1]));if(points.length<3||points.some(p=>!p.every(Number.isFinite)))throw Error('O polígono contém coordenadas inválidas.');
      if(points[0][0]!==points.at(-1)[0]||points[0][1]!==points.at(-1)[1])points.push(points[0].slice());return points;});
    region={project:S.projectId,generation:gen(),crs:S.workCRS,rings,source:L,feature:f,sourceCRS:L.crs,sourceGeom:JSON.stringify(f.geom)};
    drawOutline();regionLabel();status('');describe();
  }catch(e){status(e.message);toast(e.message);}
}
function busy(value){for(const id of ['Raster','Draw','Use','Destination','Name','Run'])if(el(id))el(id).disabled=value;el('Cancel').hidden=!value;el('Progress').hidden=!value;}
function cancel(){job?.controller.abort();}
async function run(){
  if(job)return;
  if(!regionCurrent()){status('Desenhe uma área ou selecione novamente o polígono de limite.');return;}
  const r=selectedRaster();if(!r){status('Selecione o MDT.');return;}
  let destination;try{destination=root.GeoMineVectorDestination.captureGenerated(el('Destination').value,'line',{color:'#168eb0'});}catch(e){status(e.message);return;}
  const q={controller:new AbortController(),project:S.projectId,generation:gen(),region,crs:S.workCRS,r,d:r.d,name:el('Name').value.trim()||'Talvegue MDT'};
  job=q;describing++;busy(true);el('Progress').removeAttribute('value');status('Abrindo o MDT na resolução nativa…');let sampler;
  const current=()=>job===q&&!q.controller.signal.aborted&&S.projectId===q.project&&gen()===q.generation&&S.workCRS===q.crs&&region===q.region&&regionCurrent()&&S.rasters.includes(r)&&r.d===q.d;
  const check=()=>{if(!current()||sampler&&!sampler.isCurrent())throw abort();};
  const phase={validate:'Validando limite',read:'Lendo MDT',mask:'Delimitando área',route:'Resolvendo depressões',direction:'Calculando escoamento',accumulation:'Identificando o fundo do vale',line:'Traçando talvegue',sections:'Localizando as menores cotas',refine:'Acompanhando o fundo do vale',verify:'Conferindo o traçado',done:'Concluído'};
  try{
    sampler=await root.GeoMineChannelDEM.prepare(r,{workCRS:q.crs,signal:q.controller.signal,isCurrent:current});check();
    const signature=root.GeoMineChannelExtraction.sourceSignature(r);
    const scale=metricScale(sampler),rings=rasterRings(sampler),source={...sampler.grid,unitScale:scale,readWindow:sampler.readWindow,isCurrent:current};
    const result=await root.GeoMineThalwegEngine.extract(source,{rings,signal:q.controller.signal,isCurrent:current,onProgress:p=>{
      check();const fraction=Number.isFinite(p.progress)?p.progress:Number.isFinite(p.fraction)?p.fraction:null;
      if(fraction===null)el('Progress').removeAttribute('value');else el('Progress').value=fraction;
      status((phase[p.phase]||'Extraindo talvegue')+(fraction===null?'…':' · '+Math.round(fraction*100)+'%'));
    }});check();if(root.GeoMineChannelExtraction.sourceSignature(r)!==signature)throw abort();root.GeoMineVectorDestination.current(destination);
    const stats=result.stats,line=result.line;if(!line||line.length<2)throw Error('Não foi encontrado um talvegue contínuo nesta área.');
    const numeric=['COMP_M','Z_INI_M','Z_FIM_M','DESNIV_M','RES_X_M','RES_Y_M','AREA_LOCAL','CORR_MAX_M'];
    const fields=[{name:'NOME',type:'C',length:120},{name:'MDT',type:'C',length:120},...numeric.map(name=>({name,type:'N',length:20,decimal:3})),{name:'METODO',type:'C',length:50},{name:'AVISOS',type:'C',length:254}];
    const messages=[];
    if(stats.pathFilledCells)messages.push('Depressões no percurso: roteamento ajustado até '+fmt(stats.maxPathFillM)+' m; cotas originais preservadas.');
    if(stats.flags?.includes('disconnected_terrain'))messages.push('Área com trechos desconectados: extraído somente o talvegue principal.');
    if(stats.originalElevationRises)messages.push('O perfil original contém subidas locais; confira esses trechos.');
    if(stats.flags?.includes('weak_valley_support'))messages.push('Fundo de vale pouco definido nesta área; confira o traçado estimado.');
    const feature={geom:line.map(p=>p.slice(0,2)),zg:line.map(p=>p[2]),multi:false,
      _thalweg:{version:2,region:{crs:q.crs,rings:structuredClone(q.region.rings)},source:{id:r.id,name:r.name,crs:sampler.sourceCRS,resolution:{x:sampler.grid.cs*scale,y:sampler.grid.csy*scale}},method:'native-floor-path'},
      props:{NOME:q.name,MDT:r.name||'MDT',COMP_M:stats.lengthM,Z_INI_M:line[0][2],Z_FIM_M:line.at(-1)[2],DESNIV_M:stats.dropM,RES_X_M:sampler.grid.cs*scale,RES_Y_M:sampler.grid.csy*scale,AREA_LOCAL:stats.contributingAreaM2,CORR_MAX_M:stats.maxPathFillM||0,METODO:'Fundo do MDT · caminho nativo conectado',AVISOS:messages.join(' ')}};
    const target=root.GeoMineVectorDestination.save(destination,{features:[feature],fields,crs:sampler.sourceCRS,name:q.name});
    if(![...el('Destination').options].some(o=>o.value===String(target.id)))el('Destination').append(new Option(target.name,String(target.id)));
    el('Destination').value=String(target.id);el('NameWrap').hidden=true;
    status('Talvegue em “'+target.name+'” · '+fmt(stats.lengthM)+' m · resolução '+fmt(sampler.grid.cs*scale)+' m'+(messages.length?'\n'+messages.join('\n'):''));
    cmdLog('Extração de talvegue: '+target.name+' · '+fmt(stats.lengthM)+' m · MDT nativo · contribuição limitada à área delimitada.','ok');
    toast('Talvegue gerado. Ctrl+Z desfaz.');removeOutline();
  }catch(e){const message=e.name==='AbortError'?'Extração cancelada. Nenhuma feição foi alterada.':e.message;status(message);toast(message);}
  finally{sampler?.close();if(job===q){job=null;busy(false);}}
}
function install(catalog){
  const cat=catalog.find(c=>c.id==='ambiente');if(!cat)return;
  let group=cat.grupos.find(g=>g.label.toLowerCase()==='preservação permanente');if(!group){group={label:'Preservação permanente',it:[]};cat.grupos.unshift(group);}
  if(group.it[0]?.ic==='thalweg_mdt')return;
  for(const g of cat.grupos)g.it=g.it.filter(i=>i.ic!=='thalweg_mdt');
  group.it.unshift({ic:'thalweg_mdt',nome:'Extração de talvegue',desc:'Delimitar uma área e extrair o talvegue principal no MDT',act:open});
}
RIB_SVG.thalweg_mdt='<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M5 8l15-3 22 6-4 30-23 2-10-15z" fill="#dfe9c9" stroke="#759558" stroke-width="2" stroke-dasharray="4 3"/><path d="M8 14c8-1 10 12 17 11s8-8 14-7M7 22c8-1 10 12 17 11s8-8 14-7" fill="none" stroke="#99ae76" stroke-width="2"/><path d="M23 8c-12 11 17 14 4 24s-7 5-7 9" fill="none" stroke="#087ea2" stroke-width="3.5" stroke-linecap="round"/><path d="m16 36 4 5 5-4" fill="none" stroke="#087ea2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
root.GeoMineRibbon.register('environmental.thalweg',install);install(CATS);
setTimeout(()=>{ribbonBuild();map.on('mousemove',e=>{if(drawing&&S.tool===TOOL)renderRegion(e.latlng);});map.on('dblclick',e=>{if(drawing&&S.tool===TOOL){L2.DomEvent.stop(e);finishRegion();}});},0);
root.addEventListener('keydown',e=>{
  if(/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)||e.target?.isContentEditable)return;
  if(job&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();cancel();return;}
  if(!drawing||S.tool!==TOOL||!['Enter','Escape','Backspace'].includes(e.key))return;
  e.preventDefault();e.stopImmediatePropagation();if(e.key==='Enter')finishRegion();else if(e.key==='Escape')cancelDrawing();else{drawing.points.pop();renderRegion();}
},true);
root.GeoMineThalweg={open,beginDraw,mapClick,endDrawing,finishRegion,useSelected,run,cancel,resetProject,state:()=>({drawing:!!drawing,busy:!!job,region:region?.rings})};
})(window);
