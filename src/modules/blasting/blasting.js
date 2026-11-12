/* GeoMine Blasting. The original BlastPal engine owns the grid and trajectory.
   GeoMine owns input, native topography, layers, project and presentation. */
(function(root){
'use strict';
const $=id=>document.getElementById(id),clone=v=>structuredClone(v),ENGINE_HASH='e3d3d337eddb7a58aed5a13fee979f05c860b0b6d826cc6eb410d2bd7269fc76';
let state={project:null,crs:null,ring:null,direction:null,boundary:null,draw:null},preview=null,job=null;
let dockCollapsed=false,dockFitFrame=0;
const num=id=>Number(String($(id).value).trim().replace(',','.'));
function message(text,error=false){const e=$('blStatus');if(e){e.textContent=text;e.style.color=error?'var(--red,#cb5252)':'';}if(error)toast(text);}
function context(){
 if(state.project!==S.projectId||state.crs!==S.workCRS){cancel();state={project:S.projectId,crs:S.workCRS,ring:null,direction:null,boundary:null,draw:null};if($('blMetres'))$('blMetres').checked=false;if($('blSurfaceInfo'))$('blSurfaceInfo').textContent='';}
 return state;
}
function metric(crs){let p;try{p=proj4(crs).oProj;}catch(_){throw Error('Defina um CRS projetado em metros antes de gerar a malha.');}
 if(!p||p.projName==='longlat'||p.to_meter!=null&&Math.abs(p.to_meter-1)>1e-12||p.units&&!['m','meter','metre','meters','metres'].includes(p.units))throw Error('A malha Blasting exige coordenadas projetadas em metros.');}
function transform(p,from,to){const q=String(from).toUpperCase()===String(to).toUpperCase()?[p[0],p[1]]:proj4(from,to,[p[0],p[1]]);if(!q.every(Number.isFinite))throw Error('Não foi possível transformar as coordenadas da bancada. Confira o CRS.');return q;}
function simpleRing(input){
 let ring=input.map(p=>p.slice(0,2));
 if(ring.length>1&&ring[0].every((v,i)=>v===ring.at(-1)[i]))ring.pop();
 if(ring.length<3||ring.some(p=>!p.every(Number.isFinite)))throw Error('A bancada precisa de pelo menos três vértices válidos.');
 const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 // Sweep by X bounding boxes: rejects crossed edges without quadratic scans
 // over distant edges in a large surveyed boundary.
 const edges=ring.map((a,i)=>{const b=ring[(i+1)%ring.length];return {a,b,i,min:Math.min(a[0],b[0]),max:Math.max(a[0],b[0]),lo:Math.min(a[1],b[1]),hi:Math.max(a[1],b[1])};}).sort((a,b)=>a.min-b.min);
 let active=[];
 for(const e of edges){active=active.filter(p=>p.max>=e.min);for(const p of active){
  if(p.hi<e.lo||e.hi<p.lo||Math.abs(p.i-e.i)===1||Math.abs(p.i-e.i)===ring.length-1)continue;
  const a=orient(p.a,p.b,e.a),b=orient(p.a,p.b,e.b),c=orient(e.a,e.b,p.a),d=orient(e.a,e.b,p.b);
  if((a===0||b===0||Math.sign(a)!==Math.sign(b))&&(c===0||d===0||Math.sign(c)!==Math.sign(d)))throw Error('O contorno da bancada cruza ou toca a si mesmo. Corrija o polígono antes de gerar.');
 }active.push(e);}
 return ring;
}
function chooseBoundary(){try{
 context();metric(S.workCRS);const q=GeoMineCommandSelection.capture({gtype:'polygon'}),items=GeoMineCommandSelection.uniqueItems(q);
 if(items.length!==1)throw Error('Selecione um único polígono de bancada.');
 const {L,f}=items[0],rings=Array.isArray(f.geom?.[0]?.[0])?f.geom:[f.geom];
 if(rings.length!==1)throw Error('O mecanismo original usa um único contorno, sem ilhas ou furos internos.');
 state.ring=simpleRing(rings[0].map(p=>transform(p,L.crs,S.workCRS)));state.boundary=q;render();sync();message('Bancada: '+L.name+'.');
 }catch(e){message(e.message,true);}}
function chooseDirection(){try{
 context();metric(S.workCRS);const q=GeoMineCommandSelection.capture({gtype:'line'}),items=GeoMineCommandSelection.uniqueItems(q);
 if(items.length!==1)throw Error('Selecione uma reta com dois vértices, orientada de A para B.');
 const {L,f}=items[0],rings=Array.isArray(f.geom?.[0]?.[0])?f.geom:[f.geom];
 if(rings.length!==1||rings[0].length!==2)throw Error('A direção deve ser uma reta com somente os pontos A e B.');
 state.direction=rings[0].map(p=>transform(p,L.crs,S.workCRS));render();sync();
 }catch(e){message(e.message,true);}}
function surfaces(){
 const select=$('blSurface');if(!select)return;
 const previous=select.value;select.replaceChildren();
 for(const r of S.rasters||[]){if(!r.d||!GeoMineChannelDEM.isElevation(r))continue;const o=document.createElement('option');o.value=String(r.id);o.textContent=r.name;select.append(o);}
 if([...select.options].some(o=>o.value===previous))select.value=previous;
 else if(S.selRaster&&[...select.options].some(o=>o.value===String(S.selRaster.id)))select.value=String(S.selRaster.id);
 if(!select.options.length){const o=document.createElement('option');o.value='';o.textContent='Carregue um MDT pela aba Topografia';select.append(o);}
}
function sync(){
 $('blBoundaryInfo').textContent=state.ring?'Bancada definida · '+state.ring.length+' vértices':'Bancada não definida';
 const d=state.direction;
 if(d){const az=(Math.atan2(d[1][0]-d[0][0],d[1][1]-d[0][1])*180/Math.PI+360)%360;
  $('blDirectionInfo').textContent='Furos A→B: '+az.toFixed(2)+'° · fileiras: '+((az+270)%360).toFixed(2)+'°';
 }else $('blDirectionInfo').textContent='Direção A→B não definida';
}
function render(){
 if(!preview)preview=L2.layerGroup().addTo(map);preview.clearLayers();
 const ll=p=>{const q=transform(p,S.workCRS,'EPSG:4326');return [q[1],q[0]];};
 if(state.ring)L2.polygon(state.ring.map(ll),{interactive:false,color:'#d69c25',weight:2,fillOpacity:.04,dashArray:'5 4'}).addTo(preview);
 const pts=state.draw?.points||state.direction;
 if(pts?.length){L2.polyline(pts.map(ll),{interactive:false,color:'#347cc7',weight:3}).addTo(preview);
  if(!state.draw||state.draw.kind==='direction')pts.slice(0,2).forEach((p,i)=>L2.circleMarker(ll(p),{interactive:false,radius:4,color:'#347cc7'}).bindTooltip(i?'B':'A',{permanent:true,direction:'top'}).addTo(preview));}
}
function arm(kind){try{
 context();metric(S.workCRS);if(job)throw Error('Aguarde a geração atual.');
 const returnTo3D=S._view==='v3d';
 if(returnTo3D)blastingView('map');
 if(typeof setTool==='function')setTool('select');if(typeof ED!=='undefined'){ED.pend=null;ED.on=false;edRedraw();}
 state.draw={kind,points:[],project:S.projectId,crs:S.workCRS,returnTo3D};S.tool=kind==='boundary'?'blastingBoundary':'blastingDirection';
 map.doubleClickZoom.disable();map.getContainer().style.cursor='crosshair';
 message(kind==='boundary'?'Marque a bancada. Enter ou botão direito conclui; Esc cancela.':'Marque A e depois B: direção horizontal dos furos.');render();
 }catch(e){message(e.message,true);}}
function cancel(){
 if(job){job.controller.abort();return;}
 if(state.draw){const d=state.draw;state.draw=null;S.tool='select';map.doubleClickZoom.enable();map.getContainer().style.cursor='';if(preview)render();if(d.returnTo3D&&d.project===S.projectId&&d.crs===S.workCRS)blastingView('v3d');}
}
function projectChanged(){
 if(job)job.controller.abort();
 if(state.draw){S.tool='select';map.doubleClickZoom.enable();map.getContainer().style.cursor='';}
 preview?.clearLayers();state={project:null,crs:null,ring:null,direction:null,boundary:null,draw:null};
 if($('blMetres'))$('blMetres').checked=false;if($('blSurfaceInfo'))$('blSurfaceInfo').textContent='';
}
function saveInput(kind,points){
 const poly=kind==='boundary',geometry=clone(points);if(poly)geometry.push(geometry[0].slice());
 const L=addLayer({name:poly?'Blasting — bancada':'Blasting — direção A→B',gtype:poly?'polygon':'line',crs:S.workCRS,
  color:poly?'#d69c25':'#347cc7',fields:[{name:'TIPO',type:'C',length:30}],features:[{geom:geometry,props:{TIPO:poly?'Bancada':'Direção dos furos A→B'}}]});
 L._blasting={version:1,role:kind,batchId:null};if(poly){L.fill=.03;L.sym.fill=.03;}drawLayer(L);refreshUI();
 return L;
}
function finish(){try{
 const d=state.draw;if(!d)return false;
 if(d.project!==S.projectId||d.crs!==S.workCRS)throw Error('O projeto ou o CRS mudou durante o desenho.');
 if(d.kind==='boundary'){state.ring=simpleRing(d.points);state.boundary=null;saveInput('boundary',state.ring);}
 else{if(d.points.length!==2||Math.hypot(d.points[1][0]-d.points[0][0],d.points[1][1]-d.points[0][1])===0)throw Error('Marque dois pontos distintos para A→B.');state.direction=clone(d.points);saveInput('direction',state.direction);}
 state.draw=null;S.tool='select';map.doubleClickZoom.enable();map.getContainer().style.cursor='';render();sync();if(d.returnTo3D)blastingView('v3d');return true;
 }catch(e){message(e.message,true);return false;}}
function mapClick(e){try{
 const d=state.draw;if(!d)return;
 if(d.project!==S.projectId||d.crs!==S.workCRS){cancel();throw Error('O projeto mudou. Inicie o desenho novamente.');}
 const p=transform([e.latlng.lng,e.latlng.lat],'EPSG:4326',S.workCRS),last=d.points.at(-1);
 if(last&&Math.hypot(p[0]-last[0],p[1]-last[1])<1e-6)return;
 d.points.push(p);render();if(d.kind==='direction'&&d.points.length===2)finish();
 }catch(e){message(e.message,true);}}
function parameters(){return {ring:clone(state.ring),direction:clone(state.direction),burden:num('blBurden'),spacing:num('blSpacing'),depthMD:num('blDepth'),inclination:num('blInclination'),staggered:$('blArrangement').value==='staggered',prefix:'F'};}
const fields=[['HOLE_ID','C'],['ROW','N'],['E_COL','N'],['N_COL','N'],['Z_COL','N'],['E_TOE','N'],['N_TOE','N'],['Z_TOE','N'],['MD_M','N'],['AZIMUTH','N'],['DIP_DEG','N'],['INC_VERT','N'],['STATUS','C'],['PIX_COL','N'],['PIX_ROW','N']].map(([name,type])=>({name,type,length:type==='C'?40:20,decimal:type==='N'?6:0}));
function output(result,params,sourceInfo,samples){
 const batchId=root.crypto?.randomUUID?.()||'blasting-'+Date.now(),date=new Date().toISOString(),label='Blasting '+new Date().toLocaleString('pt-BR'),added=[];
 const g={id:gid++,name:label,collapsed:false};
 const metadata={version:1,batchId,createdAt:date,sourceName:sourceInfo.name,engine:{name:'BlastPal',version:'1.33',sha256:ENGINE_HASH},params:{...params,rowAz:result.rowAz,drillAz:result.drillAz,crs:S.workCRS,sourceInfo,depthMeaning:'MD ao longo do furo',inclinationReference:'graus da vertical',rows:'perpendiculares a A→B'},counts:{valid:result.n,rejected:result.rejected.length},exports:{collarCSV:BlastPalOriginalEngine.collarCSV(result.holes),surveyCSV:BlastPalOriginalEngine.surveyCSV(result.holes)}};
 const cells=new Map(result.candidates.map((p,i)=>[GeoMineDrillingGeometry.pointKey(p[0],p[1]),samples.cells[i]]));
 const props=h=>{const cell=cells.get(GeoMineDrillingGeometry.pointKey(h.cx,h.cy));return {HOLE_ID:h.id,ROW:h.row+1,E_COL:h.cx,N_COL:h.cy,Z_COL:h.cz,E_TOE:h.tx,N_TOE:h.ty,Z_TOE:h.tz,MD_M:h.len,AZIMUTH:h.az,DIP_DEG:h.dip,INC_VERT:params.inclination,STATUS:'OK',PIX_COL:cell?.col,PIX_ROW:cell?.row};};
 function layer(role,name,gtype,features,color){if(!features.length)return;
  const L=addLayer({name,gtype,features,fields:clone(fields),crs:S.workCRS,color,labelField:role==='collar'?'HOLE_ID':''});added.push(L);
  L.groupId=g.id;L._blasting={...clone(metadata),role};L.sym.weight=role==='trace'?2:1.5;L.weight=L.sym.weight;
  if(gtype==='point'){L.sym.pointSize=role==='collar'?5:3;L.sym.size=L.sym.pointSize;}drawLayer(L);return L;
 }
 try{
  S.groups.push(g);S.stack.unshift('G:'+g.id);
  layer('trace','Trajetórias — '+label,'line',result.holes.map(h=>({geom:[[h.cx,h.cy,h.cz],[h.tx,h.ty,h.tz]],zg:[h.cz,h.tz],props:props(h)})),'#d2842a');
  layer('toe','Pés — '+label,'point',result.holes.map(h=>({geom:[[h.tx,h.ty,h.tz]],zg:[h.tz],props:props(h)})),'#c65353');
  const collar=layer('collar','Colares — '+label,'point',result.holes.map(h=>({geom:[[h.cx,h.cy,h.cz]],zg:[h.cz],props:props(h)})),'#257cb6');
  layer('nodata','Sem cota — '+label,'point',result.rejected.map((p,i)=>{const c=cells.get(GeoMineDrillingGeometry.pointKey(p.x,p.y));return {geom:[[p.x,p.y]],props:{HOLE_ID:'ND'+(i+1),ROW:p.row+1,E_COL:p.x,N_COL:p.y,STATUS:c?.status==='outside'?'Fora do MDT':'NoData',PIX_COL:c?.col,PIX_ROW:c?.row}};}),'#d02fd0');
  if(collar)S.activeId=collar.id;S.selFeat=null;S.selRaster=null;mselClear(true);if(typeof ED!=='undefined')ED.sel=null;
  undoPush({t:'blastingresult',layers:added,group:g,project:S.projectId});zApply();refreshUI();propRefresh();
  root.GeoMineSessionAutosave?.markDirty?.('malha Blasting');return {batchId,layers:added,metadata};
 }catch(e){for(const L of added){if(L.llayer)map.removeLayer(L.llayer);S.layers=S.layers.filter(l=>l!==L);}S.groups=S.groups.filter(v=>v!==g);S.stack=S.stack.filter(v=>v!=='G:'+g.id&&!added.some(l=>v==='L:'+l.id));refreshUI();throw e;}
}
function undo(a){
 if(a.project!==S.projectId){toast('O projeto mudou.');return false;}
 if(a.layers.some(L=>L.locked||!collabCanEditLayer(L,false))){toast('Desbloqueie as camadas deste lote para desfazer.');return false;}
 const activeWasRemoved=a.layers.some(L=>L.id===S.activeId);
 for(const L of a.layers){if(L.llayer)map.removeLayer(L.llayer);S.layers=S.layers.filter(l=>l!==L);}
 S.groups=S.groups.filter(g=>g!==a.group);S.stack=S.stack.filter(v=>v!=='G:'+a.group.id&&!a.layers.some(l=>v==='L:'+l.id));
 if(activeWasRemoved)S.activeId=S.layers[0]?.id??null;
 if(S.undo.at(-1)===a)S.undo.pop();S.selFeat=null;mselClear(true);if(typeof ED!=='undefined')ED.sel=null;
 refreshUI();root.GeoMineSessionAutosave?.markDirty?.('Blasting desfeito');return true;
}
async function generate(){
 if(job)return;let sampler,task;
 try{
  context();metric(S.workCRS);if(state.draw&&!finish())return;
  if(state.boundary)GeoMineCommandSelection.assertCurrent(state.boundary);
  const params=parameters(),plan=GeoMineDrillingGeometry.prepare(params),r=(S.rasters||[]).find(r=>String(r.id)===$('blSurface').value);
  if(!r)throw Error('Selecione uma superfície topográfica. Use os controles de importação da Topografia para carregar o MDT.');
  if(!plan.candidates.length)throw Error('Nenhum colar cabe na bancada com esse espaçamento e afastamento.');
  task={controller:new AbortController(),project:S.projectId,crs:S.workCRS,input:JSON.stringify(params)};job=task;$('blGenerate').disabled=true;
  const current=()=>job===task&&!task.controller.signal.aborted&&S.projectId===task.project&&S.workCRS===task.crs&&JSON.stringify(parameters())===task.input;
  showLoad('Blasting — lendo as células nativas do MDT…');
  sampler=await GeoMineBlastingNative.prepare(r,{workCRS:S.workCRS,signal:task.controller.signal,isCurrent:current,confirmVerticalMetres:$('blMetres').checked,onProgress:p=>{if(p?.message)message(p.message);}});
  if(!current())throw Error('A entrada ou o projeto mudou. Gere novamente.');
  message('MDT nativo: '+sampler.sourceInfo.resolutionX.toLocaleString('pt-BR',{maximumFractionDigits:6})+' × '+sampler.sourceInfo.resolutionY.toLocaleString('pt-BR',{maximumFractionDigits:6})+' m · '+sampler.sourceCRS);
  const samples=await sampler.sampleCells(plan.candidates),memo=new Map(plan.candidates.map((p,i)=>[GeoMineDrillingGeometry.pointKey(p[0],p[1]),samples.z[i]]));
  if(!current()||!sampler.isCurrent())throw Error('O MDT, a entrada ou o projeto mudou. Nenhum lote foi criado.');
  if(state.boundary)GeoMineCommandSelection.assertCurrent(state.boundary);
  const result=GeoMineDrillingGeometry.build({...params,topoZAt:(x,y)=>memo.get(GeoMineDrillingGeometry.pointKey(x,y))});
  const info={...sampler.sourceInfo,verticalMetresConfirmed:$('blMetres').checked},saved=output(result,params,info,samples);
  $('blSurfaceInfo').textContent=info.sourceCRS+' · '+info.resolutionX.toLocaleString('pt-BR',{maximumFractionDigits:6})+' × '+info.resolutionY.toLocaleString('pt-BR',{maximumFractionDigits:6})+' m nativos · célula original';
  message(result.n+' furo(s) · '+result.meters.toFixed(2)+' m de perfuração · '+result.rejected.length+' ponto(s) sem cota'+(result.rejected.length?' identificados em magenta; sem trajetória ou pé.':'.'));
  if(preview)preview.clearLayers();return {...saved,result,samples,sourceInfo:info};
 }catch(e){message(e.name==='AbortError'?'Geração cancelada. Nenhum lote foi criado.':e.message,true);return null;}
 finally{sampler?.close();if(job===task)job=null;$('blGenerate').disabled=false;hideLoad();}
}
function mount(){
 if($('secBlasting'))return $('secBlasting');
 const section=document.createElement('section');section.id='secBlasting';section.className='sec';section.style.display='none';
 section.innerHTML=`<div style="width:360px;max-width:84vw">
  <label class="field">Bancada</label><div style="display:flex;gap:6px"><button class="tbtn" id="blDrawBoundary">Desenhar polígono</button><button class="tbtn" id="blUseBoundary">Usar selecionado</button></div><div class="hint" id="blBoundaryInfo"></div>
  <label class="field">Direção dos furos A → B</label><div style="display:flex;gap:6px"><button class="tbtn" id="blDrawDirection">Desenhar A → B</button><button class="tbtn" id="blUseDirection">Usar reta selecionada</button></div><div class="hint" id="blDirectionInfo"></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><label class="field">Espaçamento entre furos (m)<input id="blSpacing" type="number" min="0.01" step="0.1" value="4"></label><label class="field">Afastamento entre fileiras (m)<input id="blBurden" type="number" min="0.01" step="0.1" value="3"></label><label class="field">Profundidade MD (m)<input id="blDepth" type="number" min="0.01" step="0.1" value="10"></label><label class="field">Inclinação da vertical (°)<input id="blInclination" type="number" min="0" max="45" step="1" value="15"></label></div>
  <div class="hint">MD: comprimento ao longo do furo. 0° = vertical. A→B orienta o mergulho; as fileiras são perpendiculares.</div>
  <label class="field" for="blArrangement">Arranjo</label><select id="blArrangement"><option value="staggered">Estagiado — pé de galinha</option><option value="rectangular">Retangular</option></select>
  <label class="field" for="blSurface">Superfície topográfica</label><select id="blSurface"></select><div class="hint" id="blSurfaceInfo"></div>
  <label style="display:flex;gap:6px;margin:10px 0;font-size:11px"><input id="blMetres" type="checkbox">Confirmar cotas em metros se o MDT não declarar unidade vertical</label>
  <div style="display:flex;gap:6px"><button class="tbtn primary" id="blGenerate" style="flex:1">Gerar furos</button><button class="tbtn" id="blCancel">Cancelar</button></div>
  <div id="blStatus" role="status" style="font-size:11px;line-height:1.45;margin-top:8px"></div>
  <div style="display:flex;gap:5px;margin-top:10px"><button class="tbtn" id="bl2d">2D</button><button class="tbtn" id="bl3d">3D</button><button class="tbtn" id="blPlan">Planta</button><button class="tbtn" id="blLayout">Layout</button><button class="tbtn" id="blExport">Exportar</button></div>
  <label style="display:flex;gap:6px;margin:10px 0;font-size:11px"><input id="blXray" type="checkbox" checked>Ver furos através do MDT (raio X)</label>
 </div>`;
 $('sideMain').appendChild(section);
 $('blDrawBoundary').onclick=()=>arm('boundary');$('blUseBoundary').onclick=chooseBoundary;
 $('blDrawDirection').onclick=()=>arm('direction');$('blUseDirection').onclick=chooseDirection;
 $('blGenerate').onclick=generate;$('blCancel').onclick=cancel;
  $('blSurface').onchange=()=>{$('blMetres').checked=false;$('blSurfaceInfo').textContent='A resolução nativa e as unidades serão conferidas antes da geração.';};
 for(const [id,v] of [['bl2d','2d'],['bl3d','3d'],['blPlan','plan'],['blLayout','layout']])$(id).onclick=()=>view(v);
 $('blExport').onclick=()=>root.GeoMineBlastingPresentation.exportData().catch(e=>message(e.message,true));
 $('blXray').onchange=()=>root.GeoMineBlastingPresentation.setXray($('blXray').checked);
 return section;
}
/* Blasting uses the native 3D workspace. Moving the existing section keeps
   its inputs and handlers intact; collapsing only resizes the same canvas. */
function blastingView(name){
 const previous=RIB_COMMAND_CAT;RIB_COMMAND_CAT='blasting';RIB_CAT_ATUAL='blasting';
 try{switchView(name);}finally{RIB_COMMAND_CAT=previous;}
}
function ensureDock(){
 if($('gmBlastingDock'))return;
 const host=$('v3d');if(!host)return;
 ribbonClose();
 const dock=document.createElement('aside');dock.id='gmBlastingDock';dock.setAttribute('aria-label','Parâmetros Blasting');dock.hidden=true;
 const heading=document.createElement('div');heading.className='gm-blasting-dock-heading';heading.textContent='Blasting';dock.append(heading,mount());host.append(dock);
 const toggle=document.createElement('button');toggle.id='gmBlastingDockToggle';toggle.type='button';toggle.hidden=true;toggle.setAttribute('aria-controls',dock.id);
 toggle.onclick=()=>{dockCollapsed=!dockCollapsed;syncWorkspace();};host.append(toggle);
 const resize=new ResizeObserver(scheduleDockFit);resize.observe(host);if($('cmdBox'))resize.observe($('cmdBox'));
}
function scheduleDockFit(){
 if(!dockFitFrame)dockFitFrame=requestAnimationFrame(()=>{dockFitFrame=0;fitDock();});
}
function fitDock(){
 const host=$('v3d'),dock=$('gmBlastingDock'),commands=$('cmdBox');if(!host||!dock)return;
 if(S._view!=='v3d'||RIB_CAT_ATUAL!=='blasting'||dock.hidden)return;
 const box=host.getBoundingClientRect(),cmd=commands?.getBoundingClientRect();
 const overlap=cmd&&cmd.height>0&&cmd.right>box.left&&cmd.left<box.right&&cmd.bottom>box.top?Math.max(0,box.bottom-cmd.top):0;
 const bottom=Math.min(box.height,overlap)+'px';if(dock.style.bottom!==bottom)dock.style.bottom=bottom;
}
function syncWorkspace(){
 ensureDock();const dock=$('gmBlastingDock'),toggle=$('gmBlastingDockToggle'),host=$('v3d');if(!dock||!toggle)return;
 const active=S._view==='v3d'&&RIB_CAT_ATUAL==='blasting';
 host.classList.toggle('gm-blasting-workspace',active);host.classList.toggle('gm-blasting-collapsed',active&&dockCollapsed);
 dock.hidden=!active||dockCollapsed;toggle.hidden=!active;
 toggle.textContent=dockCollapsed?'›':'‹';toggle.title=dockCollapsed?'Abrir parâmetros Blasting':'Recolher parâmetros Blasting';toggle.setAttribute('aria-label',toggle.title);toggle.setAttribute('aria-expanded',String(!dockCollapsed));
 $('secBlasting').style.display=active&&!dockCollapsed?'block':'none';
 scheduleDockFit();
 if(active){surfaces();sync();$('blXray').checked=root.GeoMineBlastingPresentation.xray;}
}
function open(){mount();context();surfaces();sync();dockCollapsed=false;blastingView('v3d');syncWorkspace();}
async function view(name){try{ribbonClose();if(name==='3d'||name==='plan')RIB_CAT_ATUAL='blasting';await root.GeoMineBlastingPresentation.view(name);syncWorkspace();}catch(e){message(e.message,true);}}
function register(){
 mount();const svg=paths=>'<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">'+paths+'</svg>';
 const icons={bl_bench:'<path d="M6 34V16l18-8 18 10v18l-18 7z" fill="#d9a33b" fill-opacity=".2"/><path d="M6 16l18 9 18-7M24 25v18"/>',bl_direction:'<path d="M8 39L39 9M27 9h12v12" stroke="#347cc7"/><circle cx="8" cy="39" r="3"/>',bl_grid:'<path d="M8 10h32M8 24h32M8 38h32" stroke="#8b949e"/>'+[10,24,38].flatMap(y=>[10,24,38].map(x=>`<circle cx="${x}" cy="${y}" r="3.5" fill="#d9a33b"/>`)).join(''),bl_hole:'<path d="M15 8l19 31M9 8h13M27 40h13" stroke="#d98b2a"/><circle cx="15" cy="8" r="4" fill="#347cc7"/><circle cx="34" cy="40" r="3" fill="#c65353"/>'};
 icons.bl_plan='<path d="M8 8h32v32H8z" stroke="#8b949e"/><path d="M16 32V16h16M16 16l16 16" stroke="#347cc7"/><path d="M32 32h-9m9 0v-9" stroke="#d69c25"/>';
 for(const [key,paths] of Object.entries(icons))RIB_SVG[key]=svg(paths);
 if(!CATS.some(c=>c.id==='blasting')){const cat={id:'blasting',nome:'Blasting',view:'v3d',grupos:[
  {label:'Bancada',it:[{ic:'bl_bench',nome:'Desenhar bancada',act:()=>{open();arm('boundary');}},{ic:'selecionar',nome:'Usar polígono',act:()=>{open();chooseBoundary();}}]},
  {label:'Direção',it:[{ic:'bl_direction',nome:'Direção A → B',act:()=>{open();arm('direction');}}]},
  {label:'Malha de furos',it:[{ic:'bl_grid',nome:'Parâmetros',act:open},{ic:'bl_hole',nome:'Gerar furos',act:b=>{open(b);generate();}}]},
  {label:'Conferência',it:[{ic:'mapa2d',nome:'2D',act:()=>view('2d')},{ic:'visao3d',nome:'3D',act:()=>view('3d')},{ic:'bl_plan',nome:'Planta',act:()=>view('plan')},{ic:'layout',nome:'Layout',act:()=>view('layout')}]},
  {label:'Dados',it:[{ic:'exportar',nome:'Exportar furos',act:()=>root.GeoMineBlastingPresentation.exportData().catch(e=>message(e.message,true))}]}
 ]};const i=CATS.findIndex(c=>c.id==='mineracao');CATS.splice(i<0?CATS.length:i,0,cat);}
 ribbonBuild();
}
document.addEventListener('keydown',e=>{
 if(!state.draw||/INPUT|SELECT|TEXTAREA/.test(e.target?.tagName))return;
 if(e.key==='Enter'||e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(e.key==='Escape')cancel();else finish();}
},true);
map.getContainer().addEventListener('contextmenu',e=>{if(!state.draw)return;e.preventDefault();e.stopImmediatePropagation();finish();},true);
root.GeoMineBlasting={open,arm,mapClick,finish,cancel,projectChanged,generate,undo,chooseBoundary,chooseDirection,view,syncWorkspace,get state(){return state;},get busy(){return !!job;},__test:{simpleRing,metric,output}};
register();
})(window);
