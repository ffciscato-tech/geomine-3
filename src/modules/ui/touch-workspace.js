/* Touch equivalents for the existing mouse/keyboard commands. No geometry
   engine or permission rule is bypassed: actions reuse the desktop handlers. */
(function(root){
'use strict';if(root.GeoMineTouchWorkspace)return;
const nav=root.navigator||{},ipad=/iPad|iPhone|iPod/i.test(nav.userAgent||'')||/Mac/i.test(nav.platform||'')&&nav.maxTouchPoints>1;
let enabled=ipad||/Android/i.test(nav.userAgent||'')||!!root.matchMedia?.('(pointer:coarse)').matches;
let additive=false,boxSelection=false,pan3D=false,hold=null,tap=null,lastSurface=null,lastPoint=null,consumed=null,frame=0;
/* CANETA SEM PRESSÃO (Apple Pencil USB-C) E BOTÃO DIREITO NA TELA
   O botão direito não depende de pressão: segurar o dedo ou a caneta parados
   por meio segundo já vale como botão direito. Para quem prefere não esperar,
   o botão ◨ da barra arma o "botão direito": o próximo toque (dedo ou caneta)
   numa feição do mapa ou numa linha da árvore abre as propriedades ou o menu,
   e o botão se desarma sozinho. Com a caneta em contato, a palma apoiada na
   tela não conta como segundo toque nem cancela o "segurar". */
let secondary=false,sec=null,pen=null,penSeen=0;
const penActive=()=>pen!=null&&Date.now()-penSeen<1500;
const SECONDARY_ICON='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 3v7M6 10h12"/><path d="M12.9 3.9a5.2 5.2 0 0 1 4.3 5.2H12.9z" fill="currentColor" stroke="none"/></svg>';
const contacts=new Set(),installed=new WeakSet();
const mapElement=()=>typeof map!=='undefined'?map?.getContainer?.():null;
const $=id=>document.getElementById(id),input=t=>t?.closest?.('input,textarea,select,[contenteditable="true"],button,a,.leaflet-control,.gm-touch-actions,.modal-bg,.modal,.feat-menu,.a3-float-menu');
const vertex=t=>t?.closest?.('.gm-vtx-hit,.vtx,.vtx-mid,.vtx-mover,.leaflet-marker-icon');
function cancelHold(){if(hold)clearTimeout(hold.timer);hold=null;}
function enable(){enabled=true;document.body.classList.add('gm-touch-ui');mount();sync();}
function key(value,modifiers={}){
 const target=lastSurface?.isConnected?lastSurface:mapElement()||$('main')||document.body;
 const active=target.ownerDocument?.activeElement;if(active&&/INPUT|TEXTAREA|SELECT/.test(active.tagName))active.blur();
 return !target.dispatchEvent(new KeyboardEvent('keydown',{key:value,code:value,bubbles:true,cancelable:true,...modifiers}));
}
function finish(){
 const draft=['line','poly'].includes(S.tool)&&S.drawBuf?.length;
 if(draft){if(!prepareDrawingCommand()){key('Escape');setTool('select');}sync();return;}
 const active=!['select','pan','vertex'].includes(S.tool)||typeof cmdEmAndamento==='function'&&cmdEmAndamento()||typeof S._pickPonto==='function'||typeof S._pickLimite==='function'||typeof ED!=='undefined'&&(ED.pend||ED.drag);
 if(active){if(!key('Enter'))key('Escape');sync();return;}
 if(typeof ED!=='undefined'&&ED.on&&typeof edLigar==='function')edLigar(false,true);
 if(typeof mselClear==='function')mselClear(true);S.selFeat=null;S.selRaster=null;
 if(typeof clearVertices==='function')clearVertices();if(typeof highlightSel==='function')highlightSel();
 setTool('select');refreshUI();sync();
}
function actions(){
 if(!['select','pan','vertex'].includes(S.tool))return key('Enter');
 const q=S.selFeat,L=q&&(q.layer||S.layers.find(l=>l.id===q.layerId)),f=L?.features[q.idx];
 if(L&&f){
  let ll=lastPoint?.project===S.projectId?lastPoint.ll:null;
  if(!ll){let g=f.geom;while(Array.isArray(g?.[0]?.[0]))g=g[0];const p=Array.isArray(g?.[0])?g[0]:g;
   if(p){const w=toWGS(L.crs,p[0],p[1]);ll=L2.latLng(w[1],w[0]);}}
  if(ll){showFeatureProperties();openFeatMenu(L,q.idx,ll);return true;}
 }
 if(S.msel?.items?.length){const it=S.msel.items[0],l=S.layers.find(l=>l.id===it.layerId),f=l?.features[it.idx];
  if(l&&f){let g=f.geom;while(Array.isArray(g?.[0]?.[0]))g=g[0];const p=Array.isArray(g?.[0])?g[0]:g,w=toWGS(l.crs,p[0],p[1]);openFeatMenu(l,it.idx,L2.latLng(w[1],w[0]));return true;}}
 toast('Toque em uma feição ou mantenha o dedo parado sobre ela para abrir as ações.');return false;
}
function suppressTap(e){return !!consumed&&Date.now()<consumed.until&&Math.hypot((e.clientX??consumed.x)-consumed.x,(e.clientY??consumed.y)-consumed.y)<28;}
function install(doc){
 if(!doc||installed.has(doc))return;installed.add(doc);
 doc.addEventListener('pointerdown',e=>{
  if(!contacts.size)consumed=null;
  if(e.pointerType!=='touch'&&e.pointerType!=='pen')return;enable();
  // Caneta em contato: a palma apoiada na tela é ignorada.
  if(e.pointerType==='touch'&&penActive())return;
  if(e.pointerType==='pen'){pen=e.pointerId;penSeen=Date.now();contacts.clear();}
  contacts.add(e.pointerId);cancelHold();
  const t=e.target,container=doc===document?mapElement():t.closest?.('canvas')||doc.body;
  const row=t.closest?.('.layer,.clsrow,.ghead,.grp'),inMap=container?.contains(t);
  tap=contacts.size===1&&e.pointerType==='touch'&&doc===document&&inMap&&!input(t)&&!vertex(t)&&['point','line','poly'].includes(S.tool)?
    {id:e.pointerId,x:e.clientX,y:e.clientY,at:Date.now(),project:S.projectId,tool:S.tool}:null;
  if(inMap){lastSurface=container;
   if(doc===document){const r=container.getBoundingClientRect();lastPoint={project:S.projectId,ll:map.containerPointToLatLng([e.clientX-r.left,e.clientY-r.top])};}}
  if(contacts.size!==1||e.isPrimary===false||input(t)||vertex(t)||!row&&!inMap)return;
  // Botão direito armado: este toque vale como botão direito ao soltar.
  if(secondary){tap=null;sec={id:e.pointerId,x:e.clientX,y:e.clientY,target:row||container,project:S.projectId};return;}
  const q=hold={id:e.pointerId,x:e.clientX,y:e.clientY,target:row||container,project:S.projectId,timer:0,pen:e.pointerType==='pen'};
  q.timer=setTimeout(()=>{
   if(hold!==q||contacts.size!==1||S.projectId!==q.project||!q.target.isConnected)return;
   hold=null;consumed={x:q.x,y:q.y,until:Date.now()+900};
   if(inMap&&doc===document&&!['select','pan'].includes(S.tool)){tap=null;key('Enter');return;}
   q.target.dispatchEvent(new MouseEvent('contextmenu',{clientX:q.x,clientY:q.y,button:2,buttons:0,bubbles:true,cancelable:true,view:doc.defaultView}));
  },550);
 },{capture:true,passive:true});
 doc.addEventListener('pointermove',e=>{
  if(e.pointerType==='pen'&&e.pointerId===pen)penSeen=Date.now();
  // O movimento da palma não cancela o "segurar" da caneta.
  if(hold&&(e.pointerId!==hold.id?!(hold.pen&&e.pointerType==='touch'):Math.hypot(e.clientX-hold.x,e.clientY-hold.y)>10))cancelHold();
  if(sec&&e.pointerId===sec.id&&Math.hypot(e.clientX-sec.x,e.clientY-sec.y)>12)sec=null;   // arrastou: é navegação, não toque
  if(tap&&(tap.id!==e.pointerId||Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>10))tap=null;},{capture:true,passive:true});
 doc.addEventListener('pointerup',e=>{
  const q=sec;if(!q||q.id!==e.pointerId)return;sec=null;
  if(!secondary||S.projectId!==q.project||!q.target.isConnected||Math.hypot(e.clientX-q.x,e.clientY-q.y)>12)return;
  secondary=false;consumed={x:q.x,y:q.y,until:Date.now()+900};sync();
  q.target.dispatchEvent(new MouseEvent('contextmenu',{clientX:q.x,clientY:q.y,button:2,buttons:0,bubbles:true,cancelable:true,view:doc.defaultView}));
 },{capture:true,passive:true});
 const finish=e=>{contacts.delete(e.pointerId);if(hold?.id===e.pointerId)cancelHold();if(pen===e.pointerId)pen=null;if(e.type==='pointercancel'&&sec?.id===e.pointerId)sec=null;};
 doc.addEventListener('pointerup',finish,{capture:true,passive:true});doc.addEventListener('pointercancel',finish,{capture:true,passive:true});
 doc.addEventListener('pointercancel',()=>{tap=null;},{capture:true,passive:true});
 // Leaflet may discard the first compatibility click after a touch box/pan.
 // CAD taps have one explicit entry point; cancel only the synthetic mouse
 // click, while allowing every touchend/pointerup cleanup handler to finish.
 doc.addEventListener('touchend',e=>{const q=tap;tap=null;
  if(!q||e.touches.length||Date.now()-q.at>600||S.projectId!==q.project||S.tool!==q.tool)return;
  if(e.cancelable)e.preventDefault();consumed={x:q.x,y:q.y,until:Date.now()+900};
  const container=mapElement(),r=container?.getBoundingClientRect();if(!r)return;
  const ll=map.containerPointToLatLng([q.x-r.left,q.y-r.top]);
  setTimeout(()=>{if(S.projectId===q.project&&S.tool===q.tool)onMapClick({latlng:ll,originalEvent:e});},0);
 },{capture:true,passive:false});
 // Allow pointerup/touchend cleanup to reach the editor. Only the subsequent
 // compatibility click is consumed; swallowing release events strands drags.
 doc.addEventListener('click',e=>{if(suppressTap(e)){e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
 doc.addEventListener('scroll',cancelHold,{capture:true,passive:true});
}
function more(anchor){
 const cb=root.GeoMineClipboard;
 ribMiniMenu(anchor,'Comandos por toque',[
  {nome:secondary?'Cancelar o botão direito':'Botão direito no próximo toque',run:()=>{secondary=!secondary;sec=null;sync();}},
  {nome:'Ações da feição',run:actions},{nome:'Concluir comando',run:()=>key('Enter')},{nome:'Cancelar comando',run:()=>key('Escape')},
  {nome:'Desfazer',run:()=>doUndo()},
  {nome:additive?'Desativar seleção aditiva':'Somar à seleção',run:()=>{additive=!additive;sync();}},
  {nome:boxSelection?'Arrastar para navegar':'Selecionar por caixa',run:()=>{boxSelection=!boxSelection;if(boxSelection)setTool('select');sync();}},
  {nome:'Copiar seleção',run:()=>cb?.copy()},
  {nome:'Colar',run:()=>cb?.paste()},
  {nome:'Apagar seleção',run:()=>{if(S.tool==='vertex'&&typeof ED!=='undefined'&&ED.on)edApagarVertice();else key('Delete');}},
  {nome:'Salvar projeto',run:()=>root.saveProject(false)},
  ...(root.GeoMineImportRecovery?.available()?[{nome:'Recuperar projeto anterior ao TIFF',run:()=>root.GeoMineImportRecovery.recover({manual:true})}]:[]),
  {sep:true},{nome:pan3D?'3D: arrastar para orbitar':'3D: arrastar para deslocar',run:()=>{pan3D=!pan3D;sync();}},
  {nome:'Ajuda dos gestos',run:()=>toast('Dedo ou caneta — Toque: selecionar · Dois toques na camada: propriedades · Segurar meio segundo: botão direito (menu, propriedades ou concluir comando) · Botão ◨: o próximo toque vale como botão direito · 3D: um dedo gira; dois dedos deslocam e fazem zoom.')}]);
 const menu=[...document.querySelectorAll('.ribmini')].at(-1);if(menu){const r=menu.getBoundingClientRect(),a=anchor.getBoundingClientRect();if(r.bottom>innerHeight-6)menu.style.top=Math.max(6,a.top-r.height-3)+'px';}
}
function mount(){
 if(!$('gmTouchFinish')){
 const done=document.createElement('button');done.id='gmTouchFinish';done.type='button';done.className='gm-touch-finish';done.textContent='✓';done.title='Finalizar comando · sem comando, limpar seleção';done.setAttribute('aria-label','Finalizar comando ou limpar seleção');done.onclick=finish;$('main')?.append(done);
 }
 if($('gmTouchActions'))return;
 const bar=document.createElement('nav');bar.id='gmTouchActions';bar.className='gm-touch-actions';bar.setAttribute('aria-label','Comandos de toque');
 const defs=[['secondary',SECONDARY_ICON,'Botão direito: o próximo toque (dedo ou caneta) abre o menu ou as propriedades'],['more','•••','Comandos por toque']];
 bar.innerHTML=defs.map(([id,icon,title])=>'<button type="button" data-touch-action="'+id+'" title="'+title+'" aria-label="'+title+'"'+(['add','box','secondary'].includes(id)?' aria-pressed="false"':'')+'>'+icon+'</button>').join('');
 ($('mapTools')||$('main'))?.append(bar);
 bar.addEventListener('click',e=>{
  const b=e.target.closest('[data-touch-action]');if(!b)return;
  switch(b.dataset.touchAction){
   case 'actions':actions();break;case 'finish':key('Enter');break;case 'cancel':key('Escape');break;case 'undo':if(typeof doUndo==='function')doUndo();break;
   case 'secondary':secondary=!secondary;sec=null;if(secondary)toast('Botão direito armado: toque na feição ou na camada.');break;
   case 'add':additive=!additive;break;
   case 'box':boxSelection=!boxSelection;if(boxSelection)setTool('select');break;
   case 'more':more(b);break;
  }sync();
 });
}
let layerTrack=null,layerScroller=null,scrollDrag=null;
function layerScroll(){
 if(!enabled)return;const list=$('layerList'),panel=$('right');if(!list||!panel)return;
 let target=list;while(target&&target!==panel.parentElement){const css=getComputedStyle(target);if(target.scrollHeight>target.clientHeight+2&&/auto|scroll/.test(css.overflowY))break;target=target.parentElement;}
 if(!target||target===panel.parentElement||panel.getBoundingClientRect().width===0){if(layerTrack)layerTrack.hidden=true;return;}
 if(!layerTrack){layerTrack=document.createElement('div');layerTrack.className='gm-layer-scroll';layerTrack.id='gmLayerScroll';layerTrack.setAttribute('role','scrollbar');layerTrack.setAttribute('aria-label','Rolar camadas');layerTrack.setAttribute('aria-orientation','vertical');layerTrack.tabIndex=0;layerTrack.innerHTML='<div class="gm-layer-scroll-thumb"></div>';document.body.append(layerTrack);
  layerTrack.addEventListener('pointerdown',e=>{const r=layerTrack.getBoundingClientRect(),thumb=layerTrack.firstChild.getBoundingClientRect();scrollDrag={id:e.pointerId,y:e.clientY,top:layerScroller.scrollTop,scale:(layerScroller.scrollHeight-layerScroller.clientHeight)/Math.max(1,r.height-thumb.height)};if(e.target===layerTrack){layerScroller.scrollTop=(e.clientY-r.top-thumb.height/2)*scrollDrag.scale;scrollDrag.top=layerScroller.scrollTop;}layerTrack.setPointerCapture(e.pointerId);e.preventDefault();});
  layerTrack.addEventListener('pointermove',e=>{if(scrollDrag?.id!==e.pointerId)return;layerScroller.scrollTop=scrollDrag.top+(e.clientY-scrollDrag.y)*scrollDrag.scale;layerScroll();});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])layerTrack.addEventListener(type,()=>{scrollDrag=null;});
  layerTrack.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End'].includes(e.key)){e.preventDefault();const step=e.key.startsWith('Page')?layerScroller.clientHeight*.8:27;layerScroller.scrollTop=e.key==='Home'?0:e.key==='End'?layerScroller.scrollHeight:layerScroller.scrollTop+(['ArrowUp','PageUp'].includes(e.key)?-step:step);layerScroll();}});
 }
 layerScroller=target;const r=target.getBoundingClientRect(),p=panel.getBoundingClientRect(),height=Math.max(30,r.height-8),thumb=Math.max(28,height*target.clientHeight/target.scrollHeight),range=target.scrollHeight-target.clientHeight;
 layerTrack.hidden=false;layerTrack.style.top=(r.top+4)+'px';layerTrack.style.left=(Math.min(r.right,p.right)-12)+'px';layerTrack.style.height=height+'px';layerTrack.firstChild.style.height=thumb+'px';layerTrack.firstChild.style.top=((height-thumb)*target.scrollTop/Math.max(1,range))+'px';layerTrack.setAttribute('aria-valuenow',Math.round(target.scrollTop));layerTrack.setAttribute('aria-valuemin','0');layerTrack.setAttribute('aria-valuemax',String(range));
}
function sync(){
 if(frame)return;frame=requestAnimationFrame(()=>{frame=0;mount();const bar=$('gmTouchActions');if(!bar)return;
  // Hydrology, Geology and Profiles share the same 2D map. Use the map's
  // own visibility rule, including when its view is restored from a project.
  const mapView=mapaVista2D();
  const visible=enabled&&(mapView||['v3d','layout','cava2'].includes(S._view));bar.hidden=!visible;
  const done=$('gmTouchFinish');
  if(done){done.hidden=!mapView;done.style.display=mapView?'flex':'none';}
  bar.dataset.additive=String(additive);bar.dataset.box=String(boxSelection);
  const sb=bar.querySelector('[data-touch-action="secondary"]');if(sb){sb.setAttribute('aria-pressed',String(secondary));sb.classList.toggle('on',secondary);}
  layerScroll();
 });
}
function boot(){
 install(document);mount();if(enabled)enable();else sync();
 const editable=t=>t?.closest?.('input,textarea,select,[contenteditable="true"],#cmdLog');
 const grips='.gm-panel-resizer,.command-resize-grip,.gm-layer-hscroll,.gm-layer-scroll,.modal-h,.drag,#cmdGrip,#cmdBar';
 document.addEventListener('selectstart',e=>{if(!editable(e.target)&&(enabled||e.target.closest?.(grips)))e.preventDefault();});
 document.addEventListener('pointerdown',e=>{if(!editable(e.target)&&e.target.closest?.(grips)){const s=root.getSelection?.();if(s&&!s.isCollapsed)s.removeAllRanges();}},{capture:true,passive:true});
 document.addEventListener('scroll',()=>{if(enabled)requestAnimationFrame(layerScroll);},{capture:true,passive:true});root.addEventListener('resize',()=>requestAnimationFrame(layerScroll));
 for(const name of ['setTool','switchView','refreshUI']){const base=root[name];if(typeof base==='function')root[name]=function(){const out=base.apply(this,arguments);sync();return out;};}
 const load=root.loadProject;if(typeof load==='function')root.loadProject=function(){cancelHold();contacts.clear();consumed=null;lastPoint=null;additive=false;boxSelection=false;secondary=false;sec=null;pen=null;const out=load.apply(this,arguments);sync();return out;};
 const attach=f=>{try{if(f.contentDocument)install(f.contentDocument);}catch(_){}};
 document.querySelectorAll('iframe').forEach(f=>{attach(f);f.addEventListener('load',()=>attach(f));});
 root.addEventListener('blur',()=>{cancelHold();tap=null;sec=null;pen=null;contacts.clear();});root.addEventListener('pagehide',()=>{cancelHold();tap=null;});
}
root.GeoMineTouchWorkspace={get enabled(){return enabled;},get additive(){return additive;},get boxSelection(){return boxSelection;},get pan3D(){return pan3D;},actions,key,finish,sync,suppressTap,install};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
