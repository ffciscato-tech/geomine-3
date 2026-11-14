/* DICAS NO TOQUE (pedido do usuário em 14/11/2026: "não consegui ver o texto
   flutuante de cada comando")
   No tablet não existe "passar o mouse": a dica dos botões que só têm ícone
   nunca aparecia. Agora, segurar o dedo ou a caneta parados por meio segundo
   sobre um botão mostra a dica dele — a mesma do mouse — e, ao soltar, o
   comando NÃO é executado. Um toque normal continua executando o comando.

   A dica vem do que o botão já tem: os comandos da faixa de opções abrem a
   dica completa de sempre (o módulo só entrega o "mouseenter" que o mouse
   daria); os demais usam data-tooltip, title ou aria-label. Linhas da árvore
   de camadas e o mapa ficam de fora: ali, segurar já é o botão direito.
   O CSS (body.gm-touch-ui) impede o iPad de abrir a lupa/seleção de texto
   sobre os botões enquanto o dedo está parado. */
(function(root){
'use strict';if(root.GeoMineTouchTips)return;
const HOLD_MS=480,MOVE_PX=10,SHOW_MS=3200;
const CONTROLE='button,[role="button"],.tbtn,.mtool,.xbtn,.gset,.gdel,.a3-util,[data-a3nav],[data-touch-action],[data-tooltip],.layout-slider-row,summary';
let press=null,shown=null,hideTimer=0,block=null,guard=null;
const tipEl=()=>document.getElementById('ribHoverTip');
const visivel=()=>{const t=tipEl();return !!t&&t.classList.contains('on');};
function controle(t){
  if(!t||!t.closest)return null;
  // segurar numa linha da árvore (inclusive nos botões dela) ou no mapa já é o botão direito (touch-workspace.js)
  let mapa=null;try{mapa=typeof map!=='undefined'&&map?map.getContainer():null;}catch(_){}
  if(t.closest('.layer,.clsrow,.ghead,.grp'))return null;
  const el=t.closest(CONTROLE)||(!(mapa&&mapa.contains(t))?t.closest('[title]'):null);
  if(!el||el.disabled)return null;
  if(mapa&&mapa.contains(el)&&!el.closest('.leaflet-control,button'))return null;
  return el;
}
function texto(el){
  for(let e=el,i=0;e&&e.getAttribute&&i<3;e=e.parentElement,i++){
    const v=(e.getAttribute('data-tooltip')||e.getAttribute('title')||e.getAttribute('aria-label')||'').trim();
    if(v)return v;
  }
  return '';
}
function esconde(){
  clearTimeout(hideTimer);hideTimer=0;
  const s=shown;shown=null;if(!s)return;
  if(guard)guard.disconnect();
  try{s.el.dispatchEvent(new MouseEvent('mouseleave'));}catch(_){}
  const t=tipEl();if(t)t.classList.remove('on','ui-icon-tip');
}
/* Ao levantar o dedo o navegador ainda manda os eventos de mouse "de
   compatibilidade" (entra, clica, SAI), e a saída fecharia a dica na hora.
   Enquanto ela estiver no ar por causa do toque, é reposta como estava. */
function vigia(){
  const t=tipEl();if(!t)return;
  if(!guard)guard=new MutationObserver(()=>{
    const s=shown,tip=tipEl();if(!s||!tip||s.repondo)return;
    if(tip.classList.contains('on')&&tip.innerHTML===s.html)return;
    s.repondo=true;
    tip.innerHTML=s.html;tip.className=s.cls;tip.style.left=s.left;tip.style.top=s.top;
    Promise.resolve().then(()=>{s.repondo=false;});
  });
  guard.disconnect();guard.observe(t,{attributes:true,attributeFilter:['class'],childList:true,subtree:true,characterData:true});
}
function mostra(el){
  esconde();
  // primeiro, a dica que o mouse abriria (faixa de opções e botões de ícone)
  try{el.dispatchEvent(new MouseEvent('mouseenter'));}catch(_){}
  let own=false;
  if(!visivel()){
    const msg=texto(el);if(!msg)return false;
    let t=tipEl();
    if(!t){t=document.createElement('div');t.id='ribHoverTip';document.body.appendChild(t);}
    t.textContent='';const b=document.createElement('b');b.textContent=msg;t.appendChild(b);
    t.classList.add('on','ui-icon-tip');
    const r=el.getBoundingClientRect(),m=7,w=t.offsetWidth,h=t.offsetHeight;
    const left=Math.max(m,Math.min(r.left+r.width/2-w/2,innerWidth-w-m));let top=r.top-h-9;   // acima do dedo, quando couber
    if(top<m)top=r.bottom+9;
    t.style.left=Math.round(left)+'px';t.style.top=Math.round(Math.max(m,top))+'px';
    own=true;
  }else{
    // a dica do mouse abre embaixo do botão, onde o dedo a esconde: sobe quando couber
    const t=tipEl(),r=el.getBoundingClientRect(),h=t.offsetHeight;
    if(r.top-h-9>=7)t.style.top=Math.round(r.top-h-9)+'px';
  }
  const t=tipEl();
  shown={el,own,html:t.innerHTML,cls:t.className,left:t.style.left,top:t.style.top};
  vigia();hideTimer=setTimeout(esconde,SHOW_MS);
  return true;
}
function cancel(){if(press){clearTimeout(press.timer);press=null;}}
function down(e){
  if(e.pointerType!=='touch'&&e.pointerType!=='pen')return;
  cancel();
  if(shown)esconde();   // um toque em qualquer lugar fecha a dica aberta
  if(e.isPrimary===false)return;
  const el=controle(e.target);if(!el)return;
  const p=press={id:e.pointerId,x:e.clientX,y:e.clientY,el,timer:0};
  p.timer=setTimeout(()=>{
    if(press!==p||!el.isConnected)return;
    press=null;
    if(!mostra(el))return;
    // o "soltar" depois da dica não executa o comando (controles deslizantes não têm clique a segurar)
    if(!el.matches('.layout-slider-row'))block={el,until:Date.now()+2500};
  },HOLD_MS);
}
function move(e){
  if(press&&e.pointerId===press.id&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>MOVE_PX)cancel();
}
function up(e){if(press&&e.pointerId===press.id)cancel();}
function click(e){
  const b=block;if(!b)return;
  if(Date.now()>b.until){block=null;return;}
  if(b.el===e.target||b.el.contains(e.target)){block=null;e.preventDefault();e.stopImmediatePropagation();}
}
function boot(){
  const o={capture:true,passive:true};
  document.addEventListener('pointerdown',down,o);document.addEventListener('pointermove',move,o);
  document.addEventListener('pointerup',up,o);document.addEventListener('pointercancel',up,o);
  document.addEventListener('click',click,true);
  document.addEventListener('scroll',()=>{cancel();if(shown)esconde();},o);
  root.addEventListener('blur',cancel);
}
root.GeoMineTouchTips={show:mostra,hide:esconde,text:texto};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
