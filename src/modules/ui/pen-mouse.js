/* CANETA NO PAPEL DO MOUSE (pedido do usuário em 14/11/2026)
   Sem mouse, a caneta faz o papel dele; os dedos continuam sendo o toque.

   - Arrastar com a caneta NÃO move o mapa (isso é com os dedos), como o botão
     esquerdo do mouse no computador: na seta desenha a caixa de seleção
     (janela ou cruzando), move a feição já selecionada, arrasta vértices.
   - Nas ferramentas de clique (desenho ponto a ponto, régua, perfil, pontos
     da hidrologia), encostar e arrastar é "mirar": a leitura de coordenadas,
     a mira do ímã e a prévia do segmento acompanham a ponta, e o ponto entra
     onde a caneta é levantada — o mesmo que mover o mouse e clicar. O toque
     curto continua valendo como clique.
   - Com a caneta em contato no mapa, a palma apoiada na tela não move o mapa
     nem dá zoom.
   - Botão direito: segurar meio segundo ou o botão ◨ (touch-workspace.js).
   - Mão livre ligada (freehand-drawing.js): nas ferramentas que ela atende, o
     traço tem a vez.

   O modo vem ligado e fica guardado por aparelho; o menu ••• devolve o
   comportamento antigo (a caneta arrasta o mapa, como um dedo).

   O Leaflet embutido (1.9.4) recebe a caneta como TOQUE (no tablet ele escuta
   os eventos de toque nativos, não os de ponteiro). Aqui só os dois
   manipuladores do MAPA — arrasto e pinça — passam a ignorá-la; os marcadores
   arrastáveis (alças de vértice) continuam recebendo a caneta normalmente. A
   caneta é reconhecida no evento de toque pelo tipo ("stylus", no iPad) ou
   por ser o toque que nasceu junto do ponteiro da caneta. */
(function(root){
'use strict';if(root.GeoMinePen)return;
const KEY='geomine.canetaMouse.v1',TIP_KEY='geomine.canetaMouse.aviso.v1',TAP_PX=8;
/* Ferramentas em que um clique marca um ponto: nelas, levantar a caneta depois
   de arrastar vale como o clique do mouse naquele lugar. */
const AIM=['point','line','poly','dren','measure','profile','info','basin','barr','inund','lamina','cotado','estpick'];
let asMouse=true,gesture=null,penDownAt=-1e9,penX=0,penY=0,penTouch=null,lastMapClick=-1e9,patched=false,penMode=false,delivered=null;
try{asMouse=localStorage.getItem(KEY)!=='0';}catch(_){}
const mapOk=()=>typeof map!=='undefined'&&!!map&&typeof mapaVista2D==='function'&&mapaVista2D();
const container=()=>map.getContainer();
const local=e=>{const r=container().getBoundingClientRect();return L2.point(e.clientX-r.left,e.clientY-r.top);};
const now=()=>performance.now();
const isPen=t=>!!t&&(t.touchType==='stylus'||penTouch!=null&&t.identifier===penTouch);
/* O arrasto e a pinça do mapa deixam de responder à caneta. Os métodos são
   trocados com o manipulador desligado, para o Leaflet registrar e remover
   sempre a mesma função. */
function patch(){
  if(patched||typeof map==='undefined'||!map)return;
  const drag=map.dragging,d=drag&&drag._draggable,zoom=map.touchZoom;
  if(!d||typeof d._onDown!=='function')return;   // outro Leaflet: fica como está
  patched=true;
  try{
    const on=drag.enabled();if(on)drag.disable();
    const base=d._onDown;
    d._onDown=function(e){
      if(asMouse&&e&&(e.pointerType==='pen'||
          e.type==='mousedown'&&now()-penDownAt<150||                    // "mousedown" de compatibilidade logo após o toque da caneta
          e.touches&&e.touches.length===1&&isPen(e.touches[0]))){        // toque nativo da caneta
        /* O Leaflet zera aqui o "acabou de arrastar"; sem isso, depois de um
           arrasto do mapa com o dedo ele descartaria o clique da caneta. */
        if(this._enabled)this._moved=false;
        return;
      }
      return base.apply(this,arguments);
    };
    if(on)drag.enable();
    if(zoom&&typeof zoom._onTouchStart==='function'){
      const zon=zoom.enabled();if(zon)zoom.disable();
      const start=zoom._onTouchStart;
      zoom._onTouchStart=function(e){
        if(asMouse&&e&&(e.pointerType==='pen'||Array.from(e.touches||[]).some(t=>t&&(t.pointerType==='pen'||isPen(t)))))return;   // caneta + palma não é pinça
        return start.apply(this,arguments);
      };
      if(zon)zoom.enable();
    }
  }catch(error){console.warn('caneta como mouse: Leaflet',error);}
}
/* O mapa recebe o "mousemove" que o mouse daria: coordenadas, mira do ímã e
   prévia do segmento seguem a ponta da caneta. */
function feedback(e){
  try{const p=local(e);map.fire('mousemove',{latlng:map.containerPointToLatLng(p),containerPoint:p,layerPoint:map.containerPointToLayerPoint(p),originalEvent:e});}catch(_){}
}
function leave(){   // a caneta saiu da tela: não há cursor para manter a mira
  setTimeout(()=>{if(!gesture&&mapOk())try{map.fire('mouseout',{});}catch(_){}},140);
}
/* A caixa de comprimento/ângulo do CAD acompanha o cursor do mouse. A caneta
   levantada não deixa cursor: a caixa ficaria parada ao lado do último
   vértice, na frente do próximo ponto. Com a caneta ela fica compacta (só os
   dois campos, que mostram o segmento ao mirar), estaciona ao lado da
   mãozinha quando a caneta levanta e abre inteira ao tocar num campo para
   digitar. O mouse devolve a caixa normal. */
const DYN_CSS='#gmDynamicSegment.gm-dyn-pen:not(:focus-within){width:176px!important;padding:3px 6px 5px!important}'+
  '#gmDynamicSegment.gm-dyn-pen:not(:focus-within)>div:not(:first-child){display:none!important}'+
  '#gmDynamicSegment.gm-dyn-pen:not(:focus-within) label{display:flex;flex-direction:column;min-width:0;font-size:9px;line-height:11px;white-space:nowrap}'+
  '#gmDynamicSegment.gm-dyn-pen:not(:focus-within) input{font-size:12px;height:20px;padding:0 4px}';
function dynamicPen(on){
  try{
    const box=document.getElementById('gmDynamicSegment');if(!box)return null;
    if(on&&!document.getElementById('gmDynPenStyle')){const s=document.createElement('style');s.id='gmDynPenStyle';s.textContent=DYN_CSS;document.head.append(s);}
    box.classList.toggle('gm-dyn-pen',!!on);return box;
  }catch(_){return null;}
}
function parkDynamic(){
  const box=dynamicPen(true);
  try{
    if(!box||box.style.display==='none'||box.contains(document.activeElement)||gesture)return;
    // na mesma fileira do ✓ e da mãozinha, logo à direita deles
    const mp=container().getBoundingClientRect(),hb=(document.getElementById('gmTouchFreehand')||document.getElementById('gmTouchFinish'))?.getBoundingClientRect(),
      bh=box.getBoundingClientRect().height||40,ok=!!hb&&hb.width>0;
    box.style.left=(ok?Math.round(hb.right-mp.left+8):74)+'px';
    box.style.top=(ok?Math.max(2,Math.round(hb.top-mp.top+(hb.height-bh)/2)):6)+'px';
  }catch(_){}
}
function firstTip(){
  try{if(localStorage.getItem(TIP_KEY)==='1')return;localStorage.setItem(TIP_KEY,'1');}catch(_){return;}
  try{toast('Caneta no papel do mouse: arrastar com ela seleciona ou mira o ponto; o mapa se move com os dedos. Para voltar ao modo antigo, menu ••• › “Caneta: voltar a arrastar o mapa”.');}catch(_){}
}
function down(e){
  if(e.pointerType==='touch'){
    // Palma: com a caneta em contato no mapa, este toque não chega ao mapa.
    const q=gesture;
    if(q&&asMouse&&now()-q.seen<1500&&mapOk()&&container().contains(e.target))e.stopPropagation();
    return;
  }
  if(e.pointerType!=='pen')return;
  penDownAt=now();penX=e.clientX;penY=e.clientY;gesture=null;
  if(!asMouse||e.button>0||!mapOk())return;
  const t=e.target;if(!container().contains(t))return;
  patch();
  const control=!!t.closest?.('.leaflet-control,button,input,select,textarea,a,label,#gmDynamicSegment,.modal,.edbox,.feat-menu,.a3-float-menu');
  const handle=!!t.closest?.('.leaflet-marker-icon,.gm-vtx-hit,.vtx,.vtx-mid,.vtx-mover');
  const fh=root.GeoMineFreehand,freehand=!!(fh&&fh.on&&fh.supports(S.tool));
  const plain=!control&&!handle&&!freehand;
  penMode=true;if(S.tool==='line'||S.tool==='poly')dynamicPen(true);
  gesture={id:e.pointerId,x:e.clientX,y:e.clientY,far:0,seen:now(),tool:S.tool,project:S.projectId,plain,fed:false,
    aim:plain&&AIM.includes(S.tool)&&!root.GeoMineTouchWorkspace?.secondaryArmed};
  if(plain){feedback(e);gesture.fed=true;}
}
function move(e){
  if(e.pointerType==='mouse'){if(penMode){penMode=false;dynamicPen(false);}return;}   // voltou o mouse: caixa normal
  const q=gesture;if(!q||e.pointerId!==q.id)return;
  q.seen=now();q.far=Math.max(q.far,Math.hypot(e.clientX-q.x,e.clientY-q.y));
  if(q.plain&&!root.GeoMineFreehand?.drawing)feedback(e);
  if(q.plain&&q.far>TAP_PX&&!q.tip){q.tip=true;firstTip();}
}
function up(e){
  const q=gesture;if(!q||e.pointerId!==q.id)return;
  gesture=null;
  if(e.type==='pointerup'&&q.aim&&q.far>TAP_PX&&mapOk()&&S.tool===q.tool&&S.projectId===q.project){
    const over=document.elementFromPoint(e.clientX,e.clientY);
    if(over&&container().contains(over)&&!over.closest?.('.leaflet-control,button,input,select,textarea,a,label,#gmDynamicSegment')){
      /* No tablet não existe clique depois de arrastar; no computador o
         navegador o entrega sozinho. Espera um instante e só então completa. */
      const ll=map.containerPointToLatLng(local(e)),at=now();
      setTimeout(()=>{
        if(lastMapClick>=at-5)return;   // o navegador já clicou
        if(!mapOk()||S.tool!==q.tool||S.projectId!==q.project)return;
        delivered={x:e.clientX,y:e.clientY,until:now()+350};   // um clique atrasado do navegador para este gesto não vale de novo
        try{onMapClick({latlng:ll,originalEvent:e});}catch(error){console.warn('caneta como mouse: clique ao levantar',error);}
      },60);
    }
  }
  if(q.fed)leave();
  if(q.tool==='line'||q.tool==='poly')setTimeout(parkDynamic,160);
}
function set(value,quiet){
  asMouse=!!value;gesture=null;
  try{localStorage.setItem(KEY,asMouse?'1':'0');}catch(_){}
  if(!quiet)try{toast(asMouse
    ?'Caneta no papel do mouse: arrastar seleciona ou mira o ponto; os dedos movem o mapa.'
    :'Caneta como o dedo: arrastar com ela volta a mover o mapa.');}catch(_){}
  return asMouse;
}
/* Qual toque nativo é a caneta: o do tipo "stylus" ou o que nasce junto do
   ponteiro da caneta, no mesmo lugar. Lido na janela, antes do Leaflet. */
function touchStart(e){
  for(const t of Array.from(e.changedTouches||[])){
    if(t.touchType==='stylus'||now()-penDownAt<150&&Math.abs(t.clientX-penX)<=3&&Math.abs(t.clientY-penY)<=3){penTouch=t.identifier;return;}
  }
  /* Palma: com a caneta em contato no mapa, um toque novo não chega ao mapa
     (nem como arrasto, nem como pinça). */
  const q=gesture;
  if(q&&asMouse&&now()-q.seen<1500&&mapOk()&&container().contains(e.target))e.stopPropagation();
}
function touchEnd(e){
  if(penTouch==null)return;
  if(Array.from(e.changedTouches||[]).some(t=>t.identifier===penTouch)){const id=penTouch;setTimeout(()=>{if(penTouch===id)penTouch=null;},0);}
}
function boot(){
  const o={capture:true,passive:true};
  root.addEventListener('touchstart',touchStart,o);root.addEventListener('touchend',touchEnd,o);root.addEventListener('touchcancel',touchEnd,o);
  document.addEventListener('pointerdown',down,o);document.addEventListener('pointermove',move,o);
  document.addEventListener('pointerup',up,o);document.addEventListener('pointercancel',up,o);
  // Lido na janela, antes de qualquer módulo que possa engolir o clique.
  root.addEventListener('click',e=>{
    try{
      if(!mapOk()||!container().contains(e.target))return;
      const d=delivered;
      if(d&&now()<d.until&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<30){delivered=null;e.preventDefault();e.stopImmediatePropagation();return;}
      lastMapClick=now();
    }catch(_){}
  },true);
  root.addEventListener('blur',()=>{gesture=null;});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')gesture=null;});
  const load=root.loadProject;
  if(typeof load==='function')root.loadProject=function(){gesture=null;return load.apply(this,arguments);};
  // O Leaflet só é ajustado quando uma caneta toca o mapa: quem não usa caneta não é afetado.
}
root.GeoMinePen={get asMouse(){return asMouse;},get active(){return !!gesture;},set,toggle:()=>set(!asMouse)};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
