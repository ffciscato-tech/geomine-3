/* DESENHO À MÃO LIVRE (pedido do usuário em 14/11/2026, para a Apple Pencil)
   Com o modo ligado (botão da mãozinha, ao lado do ✓) e uma ferramenta de
   traçado ativa, arrastar a caneta sobre o mapa desenha: o traço segue a
   ponta e, ao levantar, vira vértices enxutos no MESMO rascunho que os toques
   ponto a ponto alimentam. Nada muda nas ferramentas: o traço entra pelo
   mesmo buffer (linha e polígono do CAD, feição de drenagem, régua por
   pontos) e a conclusão continua no ✓. Na seleção por polígono o traço
   funciona como laço e seleciona ao levantar. O Perfil fica de fora: cada
   vértice dele ganha um rótulo (A, B, C…) no mapa e no gráfico.

   - Caneta desenha, dedos navegam. Num aparelho em que nunca se usou caneta,
     um dedo desenha e dois dedos movem o mapa; no computador, o botão
     esquerdo do mouse desenha. Com a caneta em contato, a palma apoiada na
     tela não desenha nem move o mapa.
   - Um toque curto continua criando um vértice, como antes.
   - O ímã vale na primeira e na última ponta do traço; os vértices do meio
     ficam onde a caneta passou (o modo ortogonal não entra no traço).
   - Desfazer tira o traço inteiro de uma vez.
   - Pairar a caneta sobre o mapa (iPad com esse recurso) move a leitura de
     coordenadas e a mira do ímã, como o mouse. */
(function(root){
'use strict';if(root.GeoMineFreehand)return;
const KEY='geomine.maoLivre.v1',PEN_KEY='geomine.maoLivre.caneta.v1',TAP_PX=8,JOIN_PX=14;
let on=false,stroke=null,penEver=false,swallow=null,frame=0,lastMouse=0,touchGuard=0;
const strokes=[];   // traços já entregues: {tool,project,start,end,first,last} no buffer da ferramenta
try{on=localStorage.getItem(KEY)==='1';penEver=localStorage.getItem(PEN_KEY)==='1';}catch(_){}
/* Aparelho com caneta: daqui em diante só ela desenha; os dedos navegam. */
function sawPen(){if(penEver)return;penEver=true;try{localStorage.setItem(PEN_KEY,'1');}catch(_){}}
const mapOk=()=>typeof map!=='undefined'&&!!map&&typeof mapaVista2D==='function'&&mapaVista2D();
const container=()=>map.getContainer();
/* Ferramentas que recebem uma sequência livre de vértices. */
function supports(tool){
  if(['line','poly','dren','selpoly'].includes(tool))return true;
  if(tool==='measure')return typeof measMode!=='function'||measMode()==='points';
  return false;
}
function buffer(tool){
  if(tool==='line'||tool==='poly')return S.drawBuf;
  if(tool==='dren')return S._drenBuf||(S._drenBuf=[]);
  if(tool==='measure')return S.meas.buf;
  if(tool==='selpoly')return S.msel.buf;
  return null;
}
/* A caixa de comprimento/ângulo do CAD abre ao lado do último vértice. Com
   caneta ou dedo ela ficaria parada em cima da continuação do traço; por isso
   só volta com o mouse, que a carrega junto do cursor. */
const dynamicOff=type=>{if(type!=='mouse')try{root.GeoMineDynamicSegment?.reset();}catch(_){}};
function redraw(tool,type){
  try{
    if(tool==='line'||tool==='poly'){root.GeoMineDynamicSegment?.reset();redrawDraw();
      if(type==='mouse'){const b=S.drawBuf,p=b[b.length-1];if(p)root.GeoMineDynamicSegment?.beginAt(L2.latLng(p[0],p[1]));}}
    else if(tool==='dren')drenRedrawTmp();
    else if(tool==='measure'){redrawMeas();void updateMeas();}
    else if(tool==='selpoly')mselSketch();
  }catch(e){console.warn('mão livre: redesenho',e);}
}
/* Douglas–Peucker em pixels de tela: mantém a forma e descarta o excesso. */
function simplify(points,tolerance){
  if(points.length<3)return points.slice();
  const keep=new Uint8Array(points.length),stack=[[0,points.length-1]],t2=tolerance*tolerance;keep[0]=keep[points.length-1]=1;
  while(stack.length){
    const [a,b]=stack.pop(),A=points[a],B=points[b],dx=B.x-A.x,dy=B.y-A.y,d=dx*dx+dy*dy;let worst=0,at=-1;
    for(let i=a+1;i<b;i++){
      const P=points[i],t=d?Math.max(0,Math.min(1,((P.x-A.x)*dx+(P.y-A.y)*dy)/d)):0,ex=P.x-A.x-t*dx,ey=P.y-A.y-t*dy,e=ex*ex+ey*ey;
      if(e>worst){worst=e;at=i;}
    }
    if(at>0&&worst>t2){keep[at]=1;stack.push([a,at],[at,b]);}
  }
  return points.filter((_,i)=>keep[i]);
}
const snapped=ll=>{try{if(S.snapOn&&typeof snapLatLng==='function'){const s=snapLatLng(ll,null,{flash:true});if(s&&s.latlng)return s.latlng;}}catch(_){}return ll;};
/* Entrega o traço à ferramenta. A primeira ponta passa pelo caminho normal do
   clique (camada de destino, ímã, validações); o resto entra direto no buffer. */
function feed(tool,lls,event,type){
  let buf=buffer(tool);if(!buf)return false;
  const before=buf.length,magnet=tool!=='measure'&&tool!=='selpoly';let loose=false;
  if(before){   // continua o rascunho: emenda quando o traço começa na ponta atual
    const last=buf[before-1],p=map.latLngToContainerPoint(L2.latLng(last[0],last[1])),q=map.latLngToContainerPoint(lls[0]);
    if(Math.hypot(p.x-q.x,p.y-q.y)<=JOIN_PX)lls=lls.slice(1);else loose=true;   // solto: a primeira ponta também usa o ímã
  }else{
    if(tool==='dren')S._drenLastClick=0;
    onMapClick({latlng:lls[0],originalEvent:event,freehand:true});
    buf=buffer(tool);if(!buf||buf.length===before)return false;   // sem destino ou recusado: nada a traçar
    lls=lls.slice(1);
  }
  if(!lls.length){redraw(tool,type);return true;}
  const end=lls.length-1;
  lls.forEach((ll,i)=>{
    const p=magnet&&(i===end||loose&&i===0)?snapped(ll):ll,prev=buf[buf.length-1];
    if(prev&&Math.abs(prev[0]-p.lat)<1e-10&&Math.abs(prev[1]-p.lng)<1e-10)return;
    if(tool==='measure')(S.meas.pointRefs||(S.meas.pointRefs=[])).push(null);
    buf.push([p.lat,p.lng]);
  });
  if(buf.length>before)strokes.push({tool,project:S.projectId,start:before,end:buf.length,first:buf[before].slice(),last:buf[buf.length-1].slice()});
  redraw(tool,type);
  if(tool==='selpoly'){if(!before&&buf.length>=3)try{mselFinish();}catch(e){console.warn('mão livre: laço',e);}strokes.length=0;return true;}
  try{cmdLog('traço à mão livre: '+(buf.length-before)+' vértice(s)'+(tool==='dren'||tool==='line'||tool==='poly'?' — ✓ conclui':''),'info');}catch(_){}
  return true;
}
/* Desfazer: o último traço sai inteiro, não vértice por vértice. */
/* O registro só vale enquanto o rascunho ainda contém aquele traço, no mesmo
   lugar: depois de concluir ou cancelar, um rascunho novo não o herda. */
const same=(p,q)=>!!p&&!!q&&p[0]===q[0]&&p[1]===q[1];
function valid(t){
  if(t.tool!==S.tool||t.project!==S.projectId)return false;
  const buf=buffer(t.tool);
  return !!buf&&buf.length>=t.end&&same(buf[t.start],t.first)&&same(buf[t.end-1],t.last);
}
function lastStroke(){
  while(strokes.length){
    const t=strokes[strokes.length-1];
    if(valid(t))return buffer(t.tool).length===t.end?t:null;   // pontos avulsos depois do traço saem primeiro
    strokes.pop();
  }
  return null;
}
const inDraft=()=>strokes.some(valid);
function undoStroke(){
  const t=lastStroke();if(!t)return false;
  const buf=buffer(t.tool);strokes.pop();buf.length=t.start;
  if(t.tool==='measure'&&S.meas.pointRefs)S.meas.pointRefs.length=Math.min(S.meas.pointRefs.length,t.start);
  if((t.tool==='line'||t.tool==='poly')&&!buf.length){try{clearDraw();}catch(_){redraw(t.tool);}}else redraw(t.tool);
  toast('Traço à mão livre desfeito');return true;
}
/* ---------- captura do traço ---------- */
function wants(e){
  if(!on||stroke||!mapOk()||!supports(S.tool))return false;
  if(root.GeoMineTouchWorkspace?.secondaryArmed)return false;   // o "botão direito" armado tem a vez
  const t=e.target,c=container();if(!c.contains(t))return false;
  if(t.closest?.('.leaflet-control,button,input,select,textarea,a,label,#gmDynamicSegment,.leaflet-marker-icon,.gm-vtx-hit,.vtx,.vtx-mid,.vtx-mover,.modal,.feat-menu,.a3-float-menu'))return false;
  if(e.pointerType==='pen')return e.button<=0;
  if(e.pointerType==='mouse')return e.button===0&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey;
  if(e.pointerType==='touch')return !penEver&&e.isPrimary!==false;
  return false;
}
const local=e=>{const r=container().getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
function sample(e){
  const s=stroke,p=local(e),last=s.pts[s.pts.length-1],d=Math.hypot(p.x-last.x,p.y-last.y);
  if(d<1.5)return;
  s.len+=d;s.far=Math.max(s.far,Math.hypot(p.x-s.pts[0].x,p.y-s.pts[0].y));
  s.pts.push({x:p.x,y:p.y,ll:map.containerPointToLatLng([p.x,p.y])});
}
function paint(){
  frame=0;const s=stroke;if(!s||s.far<TAP_PX)return;
  const lls=s.pts.map(p=>p.ll);
  if(!s.preview){
    const pane=map.getPane('alagis_desenho')?'alagis_desenho':'overlayPane';
    s.preview=L2.layerGroup([L2.polyline(lls,{pane,color:'#1a1206',weight:5,opacity:.45,interactive:false}),
      L2.polyline(lls,{pane,color:'#f5a524',weight:2.5,interactive:false})]).addTo(map);
  }else s.preview.eachLayer(l=>l.setLatLngs(lls));
}
function end(apply,event){
  const s=stroke;if(!s)return;stroke=null;
  if(frame){cancelAnimationFrame(frame);frame=0;}
  if(s.preview)try{map.removeLayer(s.preview);}catch(_){}
  try{map.off('zoomstart',abort);}catch(_){}
  try{container().releasePointerCapture?.(s.id);}catch(_){}
  // No iPad o "touchend" da caneta chega depois do pointerup: também é deste gesto.
  if(s.type!=='mouse')touchGuard=Date.now()+350;
  if(!apply||s.project!==S.projectId||s.tool!==S.tool||!mapOk())return;
  const first=s.pts[0],final=s.pts[s.pts.length-1];
  swallow={x:event?.clientX??0,y:event?.clientY??0,until:Date.now()+700};
  try{
    if(s.far<TAP_PX){onMapClick({latlng:first.ll,originalEvent:event});dynamicOff(s.type);return;}   // toque: um vértice, como sempre
    const tolerance=s.type==='pen'?2:3,simple=simplify(s.pts,tolerance);
    if(simple[simple.length-1]!==final)simple.push(final);
    feed(s.tool,simple.map(p=>p.ll),event,s.type);
  }catch(error){console.warn('mão livre',error);toast('Não foi possível usar o traço: '+(error?.message||error));}
}
function abort(){end(false);}
function down(e){
  if(e.pointerType==='pen')sawPen();
  if(stroke){
    if(e.pointerId===stroke.id)return;
    if(stroke.type==='touch'&&e.pointerType==='pen')abort();                    // a caneta chegou: o traço do dedo (ou da palma) é descartado
    else if(stroke.type==='touch'&&e.pointerType==='touch'){abort();return;}    // segundo dedo: vira navegação
    else{e.stopPropagation();return;}                                           // palma durante o traço: não chega ao mapa
  }
  if(!wants(e))return;
  const p=local(e);
  stroke={id:e.pointerId,type:e.pointerType,tool:S.tool,project:S.projectId,len:0,far:0,preview:null,
    pts:[{x:p.x,y:p.y,ll:map.containerPointToLatLng([p.x,p.y])}]};
  /* Um arrasto do mapa já em curso (a palma chegou antes da caneta) termina
     aqui. O arrasto volta a ficar habilitado na hora — o mapa só não recebe
     este gesto —, para a área de toque do mapa continuar a mesma. */
  if(map.dragging?.enabled?.())try{map.dragging.disable();map.dragging.enable();}catch(_){}
  map.on('zoomstart',abort);
  // O "segurar" e o toque do módulo de toque não podem agir sobre este gesto.
  const release=()=>{try{root.GeoMineTouchWorkspace?.release?.();}catch(_){}};release();setTimeout(release,0);
  try{container().setPointerCapture?.(e.pointerId);}catch(_){}
  if(e.cancelable)e.preventDefault();e.stopPropagation();
}
function move(e){
  if(!stroke||e.pointerId!==stroke.id){hover(e);return;}
  const events=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():null;
  if(events&&events.length)events.forEach(sample);else sample(e);
  if(!frame)frame=requestAnimationFrame(paint);
  if(e.cancelable)e.preventDefault();e.stopPropagation();
}
function up(e){
  if(!stroke||e.pointerId!==stroke.id)return;
  sample(e);if(e.cancelable)e.preventDefault();e.stopPropagation();end(true,e);
}
function cancel(e){if(stroke&&e.pointerId===stroke.id)abort();}
/* No iPad a caneta também gera eventos de toque; durante o traço eles não
   podem chegar ao mapa (que arrastaria) nem virar clique. */
function touch(e){
  const mine=!!stroke&&stroke.type!=='mouse';
  if(!mine&&!(touchGuard&&Date.now()<touchGuard))return;
  if(!mapOk()||!container().contains(e.target))return;   // botões e painéis fora do mapa seguem normais
  if(e.cancelable)e.preventDefault();e.stopPropagation();
  if(!mine&&(e.type==='touchend'||e.type==='touchcancel')&&!e.touches?.length)touchGuard=0;
}
function mouse(e){   // navegadores que ainda mandam mousedown depois do pointerdown
  if(stroke){e.stopPropagation();if(e.cancelable)e.preventDefault();}
}
function click(e){
  const q=swallow;if(!q||Date.now()>q.until)return;
  if(Math.hypot((e.clientX??q.x)-q.x,(e.clientY??q.y)-q.y)>30)return;
  swallow=null;e.preventDefault();e.stopImmediatePropagation();
}
/* Caneta pairando (sem tocar): o mapa recebe o mesmo "mousemove" do mouse, a
   menos que o navegador já o envie. */
function hover(e){
  if(e.pointerType!=='pen'||e.buttons||!mapOk())return;
  sawPen();
  if(Date.now()-lastMouse<120)return;
  const c=container();if(!c.contains(e.target))return;
  try{const p=local(e),point=L2.point(p.x,p.y);
    map.fire('mousemove',{latlng:map.containerPointToLatLng(point),containerPoint:point,layerPoint:map.containerPointToLayerPoint(point),originalEvent:e});}catch(_){}
}
function key(e){
  if(typeof gmUndoShortcut!=='function'||!gmUndoShortcut(e))return;
  if(typeof gmUndoFocoDeTexto==='function'&&gmUndoFocoDeTexto())return;
  if(!lastStroke())return;
  e.preventDefault();e.stopImmediatePropagation();undoStroke();
}
function set(value,quiet){
  on=!!value;abort();
  try{localStorage.setItem(KEY,on?'1':'0');}catch(_){}
  try{root.GeoMineTouchWorkspace?.sync?.();}catch(_){}
  if(!quiet)toast(on
    ?'Mão livre ligada: com uma ferramenta de desenho, arraste a caneta para traçar; os dedos movem o mapa. O ✓ conclui.'
    :'Mão livre desligada: o desenho volta a ser ponto a ponto.');
  return on;
}
function boot(){
  const o={capture:true,passive:false};
  document.addEventListener('pointerdown',down,o);document.addEventListener('pointermove',move,o);
  document.addEventListener('pointerup',up,o);document.addEventListener('pointercancel',cancel,{capture:true});
  for(const type of ['touchstart','touchmove','touchend','touchcancel'])document.addEventListener(type,touch,o);
  document.addEventListener('mousedown',mouse,o);
  document.addEventListener('mousemove',e=>{if(e.isTrusted)lastMouse=Date.now();},{capture:true,passive:true});
  document.addEventListener('click',click,{capture:true});
  document.addEventListener('keydown',key,true);
  root.addEventListener('blur',abort);
  // Desfazer pelos botões da tela: o traço sai inteiro; na drenagem, sai o último ponto.
  const undo=root.doUndo;
  if(typeof undo==='function')root.doUndo=function(){
    if(undoStroke())return;
    if(S.tool==='dren'&&S._drenBuf&&S._drenBuf.length){S._drenBuf.pop();try{drenRedrawTmp();}catch(_){}
      toast(S._drenBuf.length?'Ponto desfeito ('+S._drenBuf.length+' restantes)':'Traçado vazio');return;}
    return undo.apply(this,arguments);
  };
  const load=root.loadProject;
  if(typeof load==='function')root.loadProject=function(){abort();strokes.length=0;return load.apply(this,arguments);};
}
root.GeoMineFreehand={get on(){return on;},get drawing(){return !!stroke;},toggle:()=>set(!on),set,supports,undo:undoStroke,inDraft};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
