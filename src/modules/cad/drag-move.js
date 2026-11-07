/* MOVER POR ARRASTO — as feições selecionadas acompanham o ponteiro.

   Dois caminhos para o mesmo gesto:
   1) Comando armado (botão Mover): apertar, arrastar e soltar move o conjunto;
      apertar e soltar sem mover marca o ponto BASE e o clique seguinte é o
      DESTINO, com a prévia seguindo o cursor (tablet, destino fora da tela).
   2) Arrasto direto: com a ferramenta de seleção, arrastar com mouse/caneta
      uma feição JÁ selecionada a move, sem armar nada.

   O conjunto vem da seleção do app na mesma precedência do Delete: seleção
   múltipla (S.msel.items), depois a simples (S.selFeat), depois a feição do
   editor (ED.sel). A geometria só muda ao soltar: a prévia é um canvas
   privado, então Esc não deixa rastro no autosave, na colaboração nem nos
   derivados. O deslocamento é calculado POR CAMADA, no CRS dela, e o gesto
   inteiro vira uma única entrada de desfazer ('geomlote'). */
(function(root){
'use strict';
let g=null,suppress=null,engolir=null,armadoUI=false,vigia=null,frame=null,hoverFrame=null,hoverUltimo=null,hoverTempo=0;
const HOVER_MS=45,HOVER_VTX=60000;   // mesmo corte de atualizaCursorSnap; mesmo orçamento da prévia
const cache=new WeakMap();
const cont=()=>map.getContainer();
const COR='#f5a524',GEO=/^(EPSG:)?(4326|4674|4618)$/;
const meu=()=>typeof ED!=='undefined'&&!!ED.pend&&ED.pend.cmd==='mover'&&ED.pend.drag===true;
const local=ev=>{const r=cont().getBoundingClientRect();return [ev.clientX-r.left,ev.clientY-r.top];};
const stop=ev=>{if(ev.cancelable)ev.preventDefault();ev.stopImmediatePropagation();};
const ehControle=ev=>!!ev.target?.closest?.('.leaflet-control,.edbox,.modal,.gm-vtx-hit,input,button,select,textarea,a');
const noMapa=()=>mapaVista2D();
const lat=q=>q.lat??q[0],lng=q=>q.lng??q[1];
const fmt=m=>m.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const feicoes=n=>n+(n>1?' feições':' feição');
/* tolerância para distinguir clique de arrasto: dedo e caneta tremem mais que o mouse */
const limiar=(d,ev)=>d.modo==='direto'?6:(ev.pointerType==='touch'?14:ev.pointerType==='pen'?8:4);

/* ---------- conjunto a mover ---------- */
function itensSelecao(){
  if(S.msel?.items?.length)return S.msel.items;
  /* editor ligado: a feição do editor vale por REFERÊNCIA (o índice de S.selFeat
     pode ter ficado para trás, p.ex. depois de Unir). Desligado, ED.sel pode ser
     antiga e invisível, então não conta. A parte (partIdx) só é mantida quando
     S.selFeat aponta para a mesma feição. */
  if(typeof ED!=='undefined'&&ED.on&&ED.sel&&S.layers.includes(ED.sel.L)){
    const i=ED.sel.L.features.indexOf(ED.sel.f);
    if(i>=0){
      const q=S.selFeat,mesma=!!q&&(q.layerId??q.layer?.id)===ED.sel.L.id&&q.idx===i;
      return [{layerId:ED.sel.L.id,idx:i,partIdx:mesma?q.partIdx:undefined}];
    }
  }
  if(S.selFeat){
    const id=S.selFeat.layerId??S.selFeat.layer?.id;
    if(id!=null)return [{layerId:id,idx:S.selFeat.idx,partIdx:S.selFeat.partIdx}];
  }
  return [];
}
/* Em polígono multiparte, o furo acompanha a casca selecionada. */
function comFuros(e){
  const P=e.partes,rs=e.f.geom;
  if(e.L.gtype==='polygon'&&Array.isArray(rs)){
    const sel=[...P];
    rs.forEach((r,j)=>{
      if(P.has(j)||!r?.length)return;
      if(sel.some(i=>rs[i]?.length>2&&edInRing(r[0],rs[i])))P.add(j);
    });
  }
  return Array.isArray(rs)&&P.size>=rs.length?null:P;
}
function conjunto(){
  const by=new Map();
  for(const it of itensSelecao()){
    const L=S.layers.find(l=>l.id===it.layerId),f=L&&L.features[it.idx];
    if(!L||!f||!Array.isArray(f.geom)||!f.geom.length)continue;
    const k=L.id+':'+it.idx;let e=by.get(k);
    if(!e){e={L,f,idx:it.idx,partes:new Set(),inteira:false};by.set(k,e);}
    /* cota CAD é um objeto só: mover uma peça dela a desmontaria */
    const cota=!!root.GeoMineDimensions?.isFeature?.(L,f);
    if(!cota&&typeof selParteValida==='function'&&selParteValida(it,L,f))e.partes.add(it.partIdx);else e.inteira=true;
  }
  const out=[...by.values()];
  for(const e of out){e.partes=e.inteira?null:comFuros(e);delete e.inteira;}
  return out;
}
/* null = pode mover; texto = motivo ('' quando a colaboração já avisou). */
function bloqueio(es){
  for(const {L,f} of es){
    if(!S.layers.includes(L)||!L.features.includes(f))return 'A seleção mudou. Selecione as feições de novo.';
    if(L.visible===false)return 'A camada "'+L.name+'" está oculta.';
    if(L.locked)return 'A camada "'+L.name+'" está bloqueada. Desbloqueie-a para mover.';
    if(typeof featureVisible==='function'&&!featureVisible(L,f))return 'Há feição selecionada oculta pelo filtro da camada "'+L.name+'".';
    if(root.rb134EhDerivadaProtegida&&root.rb134EhDerivadaProtegida(L,f))return 'A camada "'+L.name+'" tem geometria calculada pelo projeto; ajuste-a pelos parâmetros.';
    if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);return '';}
  }
  return null;
}

/* ---------- geometria ---------- */
function soma(v,dx,dy){
  if(!Array.isArray(v))return v;
  if(typeof v[0]==='number')return [v[0]+dx,v[1]+dy,...v.slice(2)];
  return v.map(x=>soma(x,dx,dy));
}
function desloca(geom,dx,dy,partes){
  if(!partes)return soma(geom,dx,dy);
  return geom.map((parte,i)=>partes.has(i)?soma(parte,dx,dy):soma(parte,0,0));
}
function deslocaHachuras(hs,dx,dy){
  if(!Array.isArray(hs))return hs;
  return hs.map(h=>h&&Array.isArray(h.segments)?{...h,segments:soma(h.segments,dx,dy)}:h);
}
/* movimento parcial: acompanham só os segmentos cujo ponto médio cai nos anéis movidos */
function deslocaHachurasParte(hs,dx,dy,geom,partes){
  if(!Array.isArray(hs))return undefined;
  const rs=[...partes].map(i=>geom[i]).filter(r=>Array.isArray(r)&&r.length>2);
  if(!rs.length)return undefined;
  const dentro=sg=>{
    if(!Array.isArray(sg)||sg.length<2)return false;
    const a=sg[0],b=sg[sg.length-1],m=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    let d=false;for(const r of rs)if(edInRing(m,r))d=!d;return d;
  };
  return hs.map(h=>h&&Array.isArray(h.segments)?{...h,segments:h.segments.map(sg=>dentro(sg)?soma(sg,dx,dy):sg)}:h);
}
const COTA_ANCORAS=['A_X','A_Y','B_X','B_Y','POS_X','POS_Y','TXT_X','TXT_Y'];

/* ---------- partes em lat/lng e teste de toque ---------- */
function partesLL(e){
  let c=cache.get(e.f);
  if(!c||c.geomRef!==e.f.geom||c.crs!==e.L.crs){
    let partes=[];try{partes=(featPartesLatLng(e.L,e.f)||[]).filter(p=>Array.isArray(p)&&p.length);}catch(_){}
    let s=Infinity,w=Infinity,n=-Infinity,o=-Infinity;
    for(const p of partes)for(const q of p){const a=lat(q),b=lng(q);if(a<s)s=a;if(a>n)n=a;if(b<w)w=b;if(b>o)o=b;}
    c={geomRef:e.f.geom,crs:e.L.crs,partes,bbox:[s,w,n,o]};cache.set(e.f,c);
  }
  return c;
}
function partesDe(e){
  const c=partesLL(e);
  return e.partes?c.partes.filter((_,i)=>e.partes.has(i)):c.partes;
}
/* 'traco' = em cima do contorno/ponto; 'dentro' = interior de polígono; null = fora */
function toque(e,p,ll,tol){
  const c=partesLL(e);if(!c.partes.length)return null;
  const q=map.containerPointToLatLng([p[0]+tol,p[1]+tol]),dLa=Math.abs(q.lat-ll.lat)*1.5,dLo=Math.abs(q.lng-ll.lng)*1.5;
  if(ll.lat<c.bbox[0]-dLa||ll.lat>c.bbox[2]+dLa||ll.lng<c.bbox[1]-dLo||ll.lng>c.bbox[3]+dLo)return null;
  const tipo=e.L.gtype;let dentro=false;
  for(const parte of partesDe(e)){
    const px=parte.map(v=>{const k=map.latLngToContainerPoint([lat(v),lng(v)]);return [k.x,k.y];});
    if(tipo==='point'){
      if(px.some(k=>Math.hypot(k[0]-p[0],k[1]-p[1])<=Math.max(tol,11)))return 'traco';
      continue;
    }
    const n=px.length,fim=tipo==='polygon'?n:n-1;
    for(let i=0;i<fim;i++)if(edSegDist(p,px[i],px[(i+1)%n]).d<=tol)return 'traco';
    if(tipo==='polygon'&&n>2&&edInRing(p,px))dentro=!dentro;
  }
  return dentro?'dentro':null;
}
function toqueNoConjunto(es,p,ll,tol){
  let dentro=false;
  for(const e of es){const t=toque(e,p,ll,tol);if(t==='traco')return 'traco';if(t==='dentro')dentro=true;}
  return dentro?'dentro':null;
}

/* ---------- prévia (canvas privado) ---------- */
function montaPrevia(d){
  let total=0;const pecas=[];
  for(const e of d.es)for(const parte of partesDe(e)){pecas.push({tipo:e.L.gtype,ll:parte});total+=parte.length;}
  /* a prévia é descartável: em conjunto muito grande, salta vértices */
  const passo=Math.max(1,Math.ceil(total/60000));
  d.pecas=pecas.map(pc=>{
    if(passo===1||pc.tipo==='point'||pc.ll.length<8)return pc;
    const ll=pc.ll.filter((_,i)=>i%passo===0||i===pc.ll.length-1);
    return {tipo:pc.tipo,ll};
  });
  d.pixChave=null;
  const cv=document.createElement('canvas');
  cv.id='gmMovePreview';cv.setAttribute('aria-hidden','true');
  cv.style.cssText='position:absolute;inset:0;z-index:695;pointer-events:none';
  cont().appendChild(cv);d.canvas=cv;d.ctx=cv.getContext('2d');
}
function pixels(d){
  const o=map.getPixelOrigin(),t=map.containerPointToLayerPoint([0,0]),chave=map.getZoom()+'|'+o.x+','+o.y+'|'+t.x+','+t.y;
  if(d.pixChave===chave)return;
  d.pixChave=chave;
  d.pix=d.pecas.map(pc=>{
    const a=new Float32Array(pc.ll.length*2);
    pc.ll.forEach((v,i)=>{const k=map.latLngToContainerPoint([lat(v),lng(v)]);a[i*2]=k.x;a[i*2+1]=k.y;});
    return a;
  });
}
function desenha(){
  frame=null;const d=g;if(!d||!d.canvas)return;
  const cv=d.canvas,ctx=d.ctx,size=map.getSize(),ratio=Math.min(root.devicePixelRatio||1,2);
  if(cv.width!==Math.round(size.x*ratio)||cv.height!==Math.round(size.y*ratio)){
    cv.width=Math.round(size.x*ratio);cv.height=Math.round(size.y*ratio);cv.style.width=size.x+'px';cv.style.height=size.y+'px';
  }
  ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,size.x,size.y);
  pixels(d);
  const b=map.latLngToContainerPoint(d.baseLL),t=map.latLngToContainerPoint(d.destLL||d.baseLL),ox=t.x-b.x,oy=t.y-b.y;
  ctx.strokeStyle=COR;ctx.fillStyle=COR;ctx.lineWidth=2;ctx.lineJoin='round';
  ctx.beginPath();
  d.pix.forEach((a,k)=>{
    const tipo=d.pecas[k].tipo;
    if(tipo==='point'){for(let i=0;i<a.length;i+=2){ctx.moveTo(a[i]+ox+6,a[i+1]+oy);ctx.arc(a[i]+ox,a[i+1]+oy,6,0,Math.PI*2);}return;}
    for(let i=0;i<a.length;i+=2){if(i===0)ctx.moveTo(a[i]+ox,a[i+1]+oy);else ctx.lineTo(a[i]+ox,a[i+1]+oy);}
    if(tipo==='polygon')ctx.closePath();
  });
  ctx.globalAlpha=.12;ctx.fill('evenodd');ctx.globalAlpha=1;ctx.stroke();
  ctx.lineWidth=1;ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(t.x,t.y);ctx.stroke();ctx.setLineDash([]);
  ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(b.x-7,b.y);ctx.lineTo(b.x+7,b.y);ctx.moveTo(b.x,b.y-7);ctx.lineTo(b.x,b.y+7);ctx.stroke();
}
const agenda=()=>{if(frame===null)frame=requestAnimationFrame(desenha);};

/* ---------- dica e cursor ---------- */
function dica(txt){
  let el=document.getElementById('gmMoveHint');
  if(!txt){el?.remove();return;}
  if(!el){
    el=document.createElement('div');el.id='gmMoveHint';el.setAttribute('role','status');
    el.style.cssText='position:absolute;bottom:30px;left:50%;transform:translateX(-50%);z-index:1000;max-width:90%;padding:9px 14px;border:1px solid '+COR+';border-radius:7px;background:#142334;color:#fff;pointer-events:none;font:600 12.5px/1.3 var(--font,sans-serif);text-align:center';
    cont().appendChild(el);
  }
  if(el.textContent!==txt)el.textContent=txt;
}
function dicaArmado(n){
  dica('Mover '+feicoes(n)+': arraste até o destino · ou clique no ponto base e depois no destino · Esc cancela');
}
function uiArmado(on,n){
  armadoUI=!!on;cont().classList.toggle('gm-move-armed',armadoUI);
  if(vigia){clearInterval(vigia);vigia=null;}
  if(armadoUI){
    dicaArmado(n);
    /* outro comando pode trocar ED.pend sem passar por aqui */
    vigia=setInterval(()=>{if(!meu()){cancelaGesto();uiArmado(false);}},400);
  }else if(!g)dica(null);
}
function distancia(a,b){
  try{
    if(GEO.test(S.workCRS))return map.distance(a,b);
    const p=fromWGS(S.workCRS,a.lng,a.lat),q=fromWGS(S.workCRS,b.lng,b.lat);
    if([p[0],p[1],q[0],q[1]].every(Number.isFinite))return Math.hypot(q[0]-p[0],q[1]-p[1]);
  }catch(_){}
  return map.distance(a,b);
}

/* ---------- estado do gesto ---------- */
function politicaPan(){
  /* mesma regra de setTool: no desktop o botão esquerdo é da ferramenta */
  try{if(S.tool==='selpoly'||!S.touch)map.dragging.disable();else map.dragging.enable();}catch(_){}
}
function vigente(d){
  return S.projectId===d.projeto&&root.GeoMineSessionAutosave?.state?.generation===d.geracao&&noMapa()&&
    d.es.every(e=>S.layers.includes(e.L)&&e.L.features[e.idx]===e.f&&e.f.geom===e.geomRef&&e.L.crs===e.crs);
}
function cancelaGesto(){
  const d=g;g=null;
  if(frame!==null){cancelAnimationFrame(frame);frame=null;}
  if(!d)return false;
  /* botão possivelmente ainda apertado: o soltar e o click dele não podem virar seleção */
  if(d.fase==='arrasto'||(d.fase==='aperto'&&d.modo==='armado'))engolir=d.ponteiro;
  d.canvas?.remove();
  const c=cont();c.classList.remove('gm-move-active');
  if(d.alcas)d.alcas.style.visibility=d.alcasVis;
  try{if(d.capturado&&c.hasPointerCapture(d.ponteiro))c.releasePointerCapture(d.ponteiro);}catch(_){}
  root.GeoMineOrtho?.clearPreview();
  if(typeof limpaCursorSnap==='function')limpaCursorSnap();
  politicaPan();
  if(armadoUI&&meu())dicaArmado(d.es.length);else dica(null);
  return true;
}
/* cancela tudo: gesto e comando armado (troca de ferramenta, editor desligado) */
function cancel(){
  cancelaGesto();
  if(meu())ED.pend=null;
  if(armadoUI)uiArmado(false);
  cont().classList.remove('gm-move-hover');
}
function arm(){
  cancelaGesto();
  if(typeof ED==='undefined')return false;
  const es=conjunto();
  if(!es.length){toast('Selecione uma ou mais feições antes de usar Mover');return false;}
  const b=bloqueio(es);if(b!==null){if(b)toast(b);return false;}
  root.GeoMineMouseRotation?.cancel();root.GeoMinePolygonEdgeDrag?.clear();
  ED.drag=null;ED.pend={cmd:'mover',pts:[],drag:true};
  uiArmado(true,es.length);
  if(typeof edPainelSync==='function')try{edPainelSync();}catch(_){}
  return true;
}
function comecaArrasto(d,capturar=true){
  d.fase='arrasto';
  /* o pointerdown do editor pode ter trocado a seleção antes do limiar */
  if(d.modo==='direto'){
    S.selFeat=d.selFeat0;S.activeId=d.activeId0;
    if(typeof ED!=='undefined'&&ED.sel!==d.edSel0){
      ED.sel=d.edSel0;ED.ring=0;ED.vi=-1;
      /* alças e painel do editor voltam a corresponder a ED.sel */
      if(ED.on){try{edRedraw();edPainelSync();}catch(_){}}
    }
  }
  if(typeof closeFeatMenu==='function')try{closeFeatMenu();}catch(_){}
  root.GeoMinePolygonEdgeDrag?.clear();
  const c=cont();c.classList.add('gm-move-active');c.classList.remove('gm-move-hover');
  d.alcas=typeof ED!=='undefined'?ED.rend?._container:null;
  if(d.alcas){d.alcasVis=d.alcas.style.visibility;d.alcas.style.visibility='hidden';}
  if(capturar&&!d.capturado)try{c.setPointerCapture(d.ponteiro);d.capturado=true;}catch(_){}
  if(!d.canvas)montaPrevia(d);
}
function novoGesto(ev,es,modo){
  const p=local(ev),ll=map.containerPointToLatLng(p);
  /* ponto base com snap: inclusive o centro da própria feição, para mover de centro a centro */
  let baseLL=ll,baseKind=null;
  try{
    if(S.snapOn&&typeof snapLatLng==='function'){const h=snapLatLng(ll,null,{flash:false});if(h?.snapped){baseLL=h.latlng;baseKind=h.kind;}}
  }catch(_){}
  es.forEach(e=>{e.geomRef=e.f.geom;e.crs=e.L.crs;});
  g={modo,fase:'aperto',es,ponteiro:ev.pointerId,p,baseLL,baseKind,destLL:null,capturado:false,
    projeto:S.projectId,geracao:root.GeoMineSessionAutosave?.state?.generation,crsRef:es[0].L.crs,
    selFeat0:S.selFeat,activeId0:S.activeId,edSel0:typeof ED!=='undefined'?ED.sel:null,canvas:null};
  try{map.dragging.disable();}catch(_){}
  return g;
}
/* Destino com snap (vértice, meio, pontas, linha, centro) e ORTO. O que está
   sendo movido continua no mapa até soltar: fica fora do snap (exclude), senão
   o destino grudaria no próprio traçado ou no próprio centro. */
function destino(d,ev){
  const ll=map.containerPointToLatLng(local(ev));
  const livre={latlng:ll,snapped:false};
  if(!d.excluir)d.excluir=new Set(d.es.map(e=>e.f));
  let r=livre;
  try{r=root.GeoMineOrtho?GeoMineOrtho.resolve(ll,{anchor:d.baseLL,crs:d.crsRef,flash:false,exclude:d.excluir}):livre;}
  catch(_){r=livre;}
  d.snapKind=r.snapped?r.kind:null;
  try{if(typeof mostraCursorSnap==='function'){if(r.snapped)mostraCursorSnap(r);else limpaCursorSnap();}}catch(_){}
  return r.latlng;
}
function acompanha(d,ev){
  d.destLL=destino(d,ev);
  try{if(typeof updateReadout==='function')updateReadout(d.destLL);}catch(_){}
  dica('Deslocamento: '+fmt(distancia(d.baseLL,d.destLL))+' m'+(d.snapKind?' · snap: '+d.snapKind:'')+(d.baseKind?' (base: '+d.baseKind+')':'')+' · '+(d.fase==='arrasto'?'solte':'clique')+' para confirmar · Esc cancela');
  agenda();
}

/* ---------- confirmação: uma transação por gesto ---------- */
function aplica(d,destLL){
  if(!vigente(d))throw Error('A seleção ou o projeto mudou. O movimento foi cancelado.');
  const b=bloqueio(d.es);if(b!==null)throw Error(b||'A camada não pode ser editada agora.');
  const itens=d.es.map(e=>{
    const a=fromWGS(e.L.crs,d.baseLL.lng,d.baseLL.lat),c=fromWGS(e.L.crs,destLL.lng,destLL.lat);
    if(![a[0],a[1],c[0],c[1]].every(Number.isFinite))throw Error('Não foi possível converter o deslocamento para o CRS da camada "'+e.L.name+'".');
    const dx=c[0]-a[0],dy=c[1]-a[1],novo=desloca(e.f.geom,dx,dy,e.partes);
    let ok=true;(function v(x){if(!Array.isArray(x))return;if(typeof x[0]==='number'){if(!Number.isFinite(x[0])||!Number.isFinite(x[1]))ok=false;return;}x.forEach(v);})(novo);
    if(!ok)throw Error('O deslocamento gerou coordenada inválida na camada "'+e.L.name+'".');
    /* cota CAD: as âncoras do texto e das extremidades ficam nos atributos */
    let props,ancoras;
    if(root.GeoMineDimensions?.isFeature?.(e.L,e.f)){
      props={...e.f.props};ancoras={};
      for(const k of COTA_ANCORAS){
        const v=props[k],dv=k.endsWith('_X')?dx:dy;
        if(v!=null&&v!==''&&Number.isFinite(+v)){ancoras[k]=v;props[k]=+v+dv;}
      }
    }
    const hachuras=e.partes
      ?(e.L.gtype==='polygon'?deslocaHachurasParte(e.f.cadHatches,dx,dy,e.f.geom,e.partes):undefined)
      :deslocaHachuras(e.f.cadHatches,dx,dy);
    return {e,dx,dy,novo,props,ancoras,hachuras};
  });
  if(itens.every(i=>i.dx===0&&i.dy===0))return 0;
  const tem=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
  const antes=itens.map(({e,ancoras})=>({L:e.L,f:e.f,geom:e.f.geom,multi:e.f.multi,props:e.f.props,ancoras,
    temZg:tem(e.f,'zg'),zg:Array.isArray(e.f.zg)?JSON.parse(JSON.stringify(e.f.zg)):e.f.zg,
    temHachuras:tem(e.f,'cadHatches'),cadHatches:e.f.cadHatches,
    projGeom:Object.getOwnPropertyDescriptor(e.f,'_geomProjeto')}));
  const undo=S.undo?.slice(),rb=S._rb31,rbUndo=rb?.undoPilha?.slice(),rbGeom=rb?.srcGeom;
  const camadas=[...new Set(itens.map(i=>i.e.L))];
  try{
    if(typeof rb31EmpilhaEdicao==='function'){
      /* um retrato da cava por GESTO: o teste dela é por camada e o estado é o
         mesmo em todas as chamadas; um por feição expulsava o histórico real */
      const vistas=new Set();
      for(const {e} of itens){if(vistas.has(e.L))continue;vistas.add(e.L);rb31EmpilhaEdicao(e.L,e.f);}
      const pl=rb?.undoPilha,base=rbUndo||[];
      if(rb&&S._rb31===rb&&Array.isArray(pl)&&(pl.length!==base.length||pl.some((x,i)=>x!==base[i])))
        rb.undoPilha=[...base,pl[pl.length-1]].slice(-30);
    }
    for(const it of itens){
      it.e.f.geom=it.novo;
      if(it.props)it.e.f.props=it.props;
      if(Array.isArray(it.hachuras))it.e.f.cadHatches=it.hachuras;
    }
    undoPush({t:'geomlote',itens:antes.map(({projGeom,props,...a})=>a),
      msg:'mover '+feicoes(itens.length)});
    camadas.forEach(L=>drawLayer(L));
  }catch(err){
    antes.forEach(a=>{
      a.f.geom=a.geom;a.f.multi=a.multi;a.f.props=a.props;
      if(a.temHachuras)a.f.cadHatches=a.cadHatches;else delete a.f.cadHatches;
      if(a.projGeom)Object.defineProperty(a.f,'_geomProjeto',a.projGeom);else delete a.f._geomProjeto;
    });
    if(undo)S.undo=undo;if(rb){rb.undoPilha=rbUndo;rb.srcGeom=rbGeom;}
    try{camadas.forEach(L=>drawLayer(L));refreshUI();}catch(_){}
    throw err;
  }
  /* derivados e atributos só depois de a edição estar gravada */
  let grade;const recalc=new Set();
  for(const {e} of itens){
    try{if(typeof rb31PosEdicao==='function')rb31PosEdicao(e.L,e.f);}catch(x){console.warn(x);}
    try{
      if(e.L._autoCota&&typeof hFeicCotaUma==='function'){
        if(grade===undefined)grade=hFeicGrade()||null;
        if(grade){hFeicCotaUma(e.L,e.f,grade);recalc.add(e.L);}
      }
    }catch(x){console.warn(x);}
    try{if(typeof edEhDrenagem==='function'&&edEhDrenagem(e.L)){edRecalcGeom(e.L,e.f);recalc.add(e.L);}}catch(x){console.warn(x);}
  }
  /* rótulos por COTA_INI, DECL_PCT etc.: o desenho do commit é anterior ao recálculo */
  recalc.forEach(L=>{try{drawLayer(L);}catch(x){console.warn(x);}});
  try{if(typeof highlightSel==='function')highlightSel();}catch(_){}
  try{if(typeof mselHL==='function'&&S.msel?.items?.length)mselHL();}catch(_){}
  try{if(typeof edRedraw==='function')edRedraw();if(typeof edPainelSync==='function')edPainelSync();}catch(_){}
  try{if(S._vtxCtx&&typeof showVertices==='function'&&itens.some(i=>i.e.f===S._vtxCtx.f)){S._vtxSelPreserve=true;showVertices();}}catch(_){}
  refreshUI();
  try{if(typeof openAttr==='function'&&document.getElementById('attrPanel')?.classList.contains('open'))openAttr();}catch(_){}
  /* uma chamada só: cavaLiveSync tem UM timer, e chamar por item cancelava a cava
     do item anterior. Sem origem ele detecta por hash todas as fontes que mudaram. */
  try{if(typeof cavaLiveSync==='function')cavaLiveSync({immediate:true});}catch(x){console.warn(x);}
  try{if(typeof projecaoLiveSync==='function')projecaoLiveSync(true);}catch(x){console.warn(x);}
  return itens.length;
}
function conclui(destLL){
  const d=g;if(!d)return;
  const dist=distancia(d.baseLL,destLL);
  cancelaGesto();
  /* comando de um disparo, como os demais comandos do editor */
  if(meu())ED.pend=null;
  if(armadoUI)uiArmado(false);
  try{
    const n=aplica(d,destLL);
    if(n)toast(feicoes(n)+(n>1?' movidas ':' movida ')+fmt(dist)+' m — Ctrl+Z desfaz');
    else toast('Sem deslocamento: nada foi movido');
  }catch(err){toast(err.message||String(err));}
  if(typeof edPainelSync==='function')try{edPainelSync();}catch(_){}
}

/* ---------- ponteiro ---------- */
function diretoPermitido(ev){
  if(ev.pointerType==='touch'||ev.ctrlKey||ev.metaKey||ev.altKey||ev.shiftKey)return false;
  /* seleção simples ou múltipla (retângulo): como no CAD, quem aperta em cima
     do que já está selecionado arrasta o conjunto; no vazio, o retângulo segue */
  if(S.tool!=='select'&&S.tool!=='selpoly')return false;
  if(S.tool==='selpoly'&&S.msel?.buf?.length)return false;   // polígono de seleção em traçado
  if(S._pickPonto||S.drawBuf?.length||S._vtxDragging)return false;
  if(typeof ED!=='undefined'&&(ED.pend||ED.drag))return false;
  if(root.GeoMineVertexHandles?.legacyActive?.())return false;
  return true;
}
function alvoDireto(ev,esDado){
  const es=esDado||conjunto();if(!es.length||es.length>2000)return null;
  const p=local(ev),ll=map.containerPointToLatLng(p);
  /* vértices e pontos médios do editor continuam sendo dele */
  if(typeof ED!=='undefined'&&ED.on&&ED.sel&&typeof edHit==='function'&&
     (edHit({x:p[0],y:p[1]},ED.pts)||edHit({x:p[0],y:p[1]},ED.mids)))return null;
  /* a aresta do polígono em edição é do polygon-edge-drag (deforma, não move) */
  if(typeof ED!=='undefined'&&ED.on&&ED.sel?.L?.gtype==='polygon'&&root.GeoMinePolygonEdgeDrag){
    const e=es.find(x=>x.L===ED.sel.L&&x.f===ED.sel.f);
    if(e&&toque(e,p,ll,8)==='traco')return null;
  }
  const t=toqueNoConjunto(es,p,ll,8);if(!t)return null;
  /* onde o arrasto simples é o pan (tela de toque), o interior não inicia o Mover:
     só o traço. Para mover pelo interior, usa-se o comando Mover. */
  if(t==='dentro'&&S.touch)return null;
  if(t==='dentro'&&typeof feicaoSobPonto==='function'){
    /* interior de polígono selecionado, mas com OUTRA feição sob o cursor:
       o gesto é dela (seleção), não do polígono de fundo */
    try{
      const h=feicaoSobPonto(ll,8);
      if(h&&!es.some(e=>e.L===h.L&&e.f===h.f))return null;
    }catch(_){}
  }
  return es;
}
function onDown(ev){
  suppress=null;engolir=null;
  cont().classList.remove('gm-move-hover');
  if(g){
    if(g.fase==='destino'&&ev.pointerType==='touch'){
      /* toque: o dedo pode ser pan/pinça do mapa; só um toque curto, único e
         parado confirma (no soltar). Sem stop(): o Leaflet precisa do gesto. */
      if(ehControle(ev))return;
      (g.dedos||(g.dedos=new Map())).set(ev.pointerId,{x:ev.clientX,y:ev.clientY,t:Date.now()});
      g.tap=g.dedos.size===1;
      return;
    }
    if(g.fase==='destino'&&ev.button===0&&ev.isPrimary!==false&&!ehControle(ev)){
      stop(ev);suppress={time:Date.now(),x:ev.clientX,y:ev.clientY};
      if(!vigente(g)){cancelaGesto();toast('A seleção mudou. O movimento foi cancelado.');return;}
      conclui(destino(g,ev));return;
    }
    if(g.fase==='aperto')cancelaGesto();              // pressão anterior que terminou fora do mapa
    else{if(ev.pointerId!==g.ponteiro&&g.fase!=='destino'){cancelaGesto();stop(ev);}return;}
  }
  if(ev.button!==0||ev.isPrimary===false||ehControle(ev)||!noMapa())return;
  if(meu()){
    const es=conjunto();
    const b=es.length?bloqueio(es):'Selecione uma ou mais feições antes de usar Mover';
    stop(ev);
    if(b!==null){if(b)toast(b);engolir=ev.pointerId;cancel();return;}
    const d=novoGesto(ev,es,'armado');
    try{cont().setPointerCapture(ev.pointerId);d.capturado=true;}catch(_){}
    return;
  }
  if(!diretoPermitido(ev))return;
  let es=null;try{es=alvoDireto(ev);}catch(_){es=null;}
  if(!es||bloqueio0(es))return;
  /* não consome o pointerdown: sem arrasto, o clique segue normal (seleção, menu).
     Na seleção múltipla, porém, o retângulo (mselBind) não pode começar junto. */
  novoGesto(ev,es,'direto');
  if(S.tool==='selpoly')ev.stopImmediatePropagation();
}
/* versão silenciosa do bloqueio, para o arrasto direto não disparar avisos num simples clique */
function bloqueio0(es){
  return es.some(({L,f})=>L.visible===false||L.locked||
    (typeof featureVisible==='function'&&!featureVisible(L,f))||
    (root.rb134EhDerivadaProtegida&&root.rb134EhDerivadaProtegida(L,f))||
    (typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)));
}
function onMove(ev){
  const d=g;
  if(!d){hover(ev);return;}
  if(d.fase==='destino'){
    if(ehControle(ev))return;
    if(ev.pointerType==='touch'){
      const a=d.dedos?.get(ev.pointerId);
      if(a&&Math.hypot(ev.clientX-a.x,ev.clientY-a.y)>10)d.tap=false;
      return;                                         // navegação do mapa; a prévia acompanha pelo 'move'
    }
    stop(ev);
    if(!vigente(d)){cancelaGesto();return;}
    acompanha(d,ev);return;
  }
  if(ev.pointerId!==d.ponteiro)return;
  if(d.fase==='aperto'){
    const p=local(ev),lim=limiar(d,ev);
    if(d.modo==='armado')stop(ev);
    if(Math.hypot(p[0]-d.p[0],p[1]-d.p[1])<lim)return;
    if(!(ev.buttons&1)&&ev.pointerType==='mouse'){cancelaGesto();return;}
    if(!vigente(d)){cancelaGesto();return;}
    try{comecaArrasto(d);}catch(err){cancelaGesto();toast(err.message||String(err));return;}
  }
  stop(ev);
  if(!vigente(d)){cancelaGesto();toast('A seleção mudou. O movimento foi cancelado.');return;}
  acompanha(d,ev);
}
function marcaBase(d){
  d.fase='destino';d.destLL=d.baseLL;
  politicaPan();                                     // no toque, pan e pinça voltam para achar o destino
  dica('Ponto base marcado · mova e clique no destino · Esc cancela');agenda();
}
function onUp(ev){
  const d=g;
  if(!d){
    if(engolir===ev.pointerId){engolir=null;stop(ev);suppress={time:Date.now(),x:ev.clientX,y:ev.clientY};return;}
    /* soltar do clique de DESTINO (o commit foi no pointerdown): o click sai aqui */
    if(suppress)suppress={time:Date.now(),x:ev.clientX,y:ev.clientY};
    return;
  }
  engolir=null;
  if(d.fase==='destino'){
    if(ev.pointerType!=='touch')return;
    const a=d.dedos?.get(ev.pointerId);if(!a)return;
    d.dedos.delete(ev.pointerId);
    const tap=d.tap&&!d.dedos.size&&Math.hypot(ev.clientX-a.x,ev.clientY-a.y)<10&&Date.now()-a.t<700;
    if(!d.dedos.size)d.tap=false;
    if(!tap)return;
    suppress={time:Date.now(),x:ev.clientX,y:ev.clientY};   // sem stop(): o Leaflet precisa deste pointerup
    if(!vigente(d)){cancelaGesto();toast('A seleção mudou. O movimento foi cancelado.');return;}
    conclui(destino(d,ev));
    suppress={time:Date.now(),x:ev.clientX,y:ev.clientY};
    return;
  }
  if(ev.pointerId!==d.ponteiro)return;
  if(d.fase==='aperto'){
    if(d.modo==='direto'){g=null;politicaPan();return;}        // clique comum: nada a fazer
    /* armado, sem arrasto: este ponto é a BASE; o próximo clique é o destino */
    stop(ev);suppress={time:Date.now(),x:ev.clientX,y:ev.clientY};
    try{if(d.capturado&&cont().hasPointerCapture(d.ponteiro))cont().releasePointerCapture(d.ponteiro);}catch(_){}
    d.capturado=false;
    try{comecaArrasto(d,false);}catch(err){cancelaGesto();toast(err.message||String(err));return;}
    marcaBase(d);
    return;
  }
  /* dedo/caneta que passou do limiar e voltou: vale como ponto BASE, não como arrasto */
  if(d.modo==='armado'&&ev.pointerType!=='mouse'){
    const p=local(ev);
    if(Math.hypot(p[0]-d.p[0],p[1]-d.p[1])<limiar(d,ev)){
      stop(ev);suppress={time:Date.now(),x:ev.clientX,y:ev.clientY};
      try{if(d.capturado&&cont().hasPointerCapture(d.ponteiro))cont().releasePointerCapture(d.ponteiro);}catch(_){}
      d.capturado=false;
      root.GeoMineOrtho?.clearPreview();if(typeof limpaCursorSnap==='function')limpaCursorSnap();
      marcaBase(d);
      return;
    }
  }
  stop(ev);suppress={time:Date.now(),x:ev.clientX,y:ev.clientY};
  if(!vigente(d)){cancelaGesto();engolir=null;toast('A seleção mudou. O movimento foi cancelado.');return;}
  conclui(d.destLL||destino(d,ev));
  engolir=null;
  /* a janela do click conta a partir do fim do commit (que pode ser pesado) */
  suppress={time:Date.now(),x:ev.clientX,y:ev.clientY};
}
/* cursor de "mover" ao passar sobre a seleção (só mouse, conjunto pequeno) */
function totalVertices(es){
  let n=0;
  for(const e of es){for(const p of partesDe(e)){n+=p.length;if(n>HOVER_VTX)return n;}}
  return n;
}
function reavaliaHover(){
  if(hoverFrame!==null)return;
  hoverFrame=requestAnimationFrame(()=>{
    hoverFrame=null;const e=hoverUltimo;let sobre=false;
    try{
      if(e&&!g&&!meu()&&noMapa()&&!ehControle(e)&&diretoPermitido(e)&&(S.msel?.items?.length||0)<=400){
        const es=conjunto();
        if(es.length&&totalVertices(es)<=HOVER_VTX){const a=alvoDireto(e,es);sobre=!!a&&!bloqueio0(a);}
      }
    }catch(_){}
    cont().classList.toggle('gm-move-hover',sobre);
  });
}
function hover(ev){
  if(ev.pointerType!=='mouse')return;
  if(ev.buttons){hoverUltimo=null;reavaliaHover();return;}   // pan pelo botão do meio: tira o cursor de mover
  hoverUltimo=ev;
  const agora=performance.now();
  if(agora-hoverTempo<HOVER_MS)return;
  hoverTempo=agora;reavaliaHover();
}
function bind(){
  const el=cont();if(el.dataset.gmDragMoveBound)return;el.dataset.gmDragMoveBound='1';
  const style=document.createElement('style');
  style.textContent='#map.gm-move-armed,#map.gm-move-armed .leaflet-interactive,#map.gm-move-hover,#map.gm-move-hover .leaflet-interactive{cursor:move!important}'+
    '#map.gm-move-active,#map.gm-move-active .leaflet-interactive{cursor:grabbing!important}'+
    '.gm-move-active .gm-vtx-hit{visibility:hidden!important}';
  document.head.append(style);
  el.addEventListener('pointerdown',onDown,true);el.addEventListener('pointermove',onMove,true);el.addEventListener('pointerup',onUp,true);
  for(const type of ['pointercancel','lostpointercapture'])el.addEventListener(type,ev=>{
    if(g&&g.fase!=='destino'&&ev.pointerId===g.ponteiro){
      /* caneta/toque: a captura implícita do alvo do pointerdown é trocada pela do
         contêiner; essa troca não encerra o gesto, só a perda da do contêiner */
      if(type==='lostpointercapture'&&(!g.capturado||ev.target!==el))return;
      stop(ev);cancelaGesto();
    }
  },true);
  /* durante o gesto, os eventos sintéticos não chegam ao Leaflet nem às outras ferramentas */
  /* na fase de destino, o toque segue para o mapa (pan/pinça para achar o destino) */
  const ativo=type=>{
    if(!g)return false;
    if(g.fase==='destino')return type.startsWith('mouse');
    return g.fase!=='aperto'||g.modo==='armado';
  };
  /* o touchend que fecha o gesto não pode disparar a ferramenta de toque ativa */
  const recemConcluido=()=>!!suppress&&Date.now()-suppress.time<700;
  for(const type of ['mousedown','mousemove','touchstart','touchmove','touchend'])
    el.addEventListener(type,ev=>{
      if(ehControle(ev))return;
      if(ativo(type)||(type==='touchend'&&recemConcluido()))stop(ev);
    },{capture:true,passive:false});
  el.addEventListener('click',ev=>{
    /* o carimbo vale até o próximo pointerdown (que o zera); a posição é a do soltar */
    if(suppress&&Math.hypot(ev.clientX-suppress.x,ev.clientY-suppress.y)<8){suppress=null;stop(ev);return;}
    if(g&&g.fase==='destino'&&!ehControle(ev))stop(ev);
  },true);
  root.addEventListener('keydown',ev=>{
    if(!g&&!armadoUI)return;
    if(ev.key==='Escape'){
      const t=ev.target;if(t&&/INPUT|TEXTAREA|SELECT/.test(t.tagName))return;
      stop(ev);
      if(g&&(g.fase!=='aperto'||g.modo==='armado')){cancelaGesto();toast('Movimento cancelado');return;}
      cancel();toast('Comando cancelado');return;
    }
    /* desfazer no meio do gesto trocaria a geometria por baixo da prévia */
    if(g&&g.fase!=='aperto'&&(ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='z')stop(ev);
  },true);
  root.addEventListener('blur',()=>{if(g&&g.fase!=='destino')cancelaGesto();});
  map.on('move zoomend resize',()=>{if(g&&g.canvas)agenda();});
}
root.GeoMineDragMove={arm,cancel,conjunto,desloca,
  state:()=>({armado:meu(),fase:g?g.fase:null,modo:g?g.modo:null,itens:g?g.es.length:0})};
bind();
})(window);
