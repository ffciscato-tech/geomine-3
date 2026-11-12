/* Pincel contínuo por feição. A aparência é um retrato independente da
   classificação da camada; geometria, atributos e rótulos não são copiados. */
(function(){
'use strict';
const TOOL='feature-style-brush',KEY='_featureStyle';
const keys=['color','stroke','hatch','hatchScale','weight','fill','dash','arrowEnd','arrowSize'];
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
const clone=v=>v===undefined?undefined:structuredClone(v);
const generation=()=>window.GeoMineSessionAutosave?.state.generation;
const icon='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none"><path d="m9 14 10-11a2 2 0 0 1 3 3L12 17Z" fill="#60a5fa" stroke="#173b57" stroke-width="1.5"/><path d="M11 16c-5-3-5 4-8 5 7 2 10-1 8-5Z" fill="#f5a524" stroke="#173b57" stroke-width="1.5"/></svg>';
let current=null;
function has(L,f){
 const o=f?.[KEY];return !!(o&&o.version===1&&o.gtype===L?.gtype&&o.style&&typeof o.style==='object');
}
function effective(L,f,base){
 if(!has(L,f))return base;
 const out={...base},style=f[KEY].style;
 for(const key of keys)if(own(style,key)&&['string','number'].includes(typeof style[key]))out[key]=style[key];
 return out;
}
function pointStyle(L,f){
 const p=has(L,f)&&L.gtype==='point'?f[KEY].point:null;
 if(!p||typeof p.shape!=='string'||!Number.isFinite(p.size))return null;
 return {shape:p.shape,size:ptSizePx(p.size,14),rot:p.rot,dip:p.dip,params:p.params||null};
}
function editable(L){return S.layers.includes(L)&&!L.locked&&(typeof collabCanEditLayer!=='function'||collabCanEditLayer(L,false));}
function isActive(L,idx){
 const q=S.selFeat,f=L?.features?.[idx];
 return !!(f&&S.layers.includes(L)&&S.activeId===L.id&&S.selRaster==null&&q&&
  (q.layerId??q.layer?.id)===L.id&&(!q.layer||q.layer===L)&&q.idx===idx&&
  (!q.feature||q.feature===f)&&!S.msel?.items?.length);
}
/* Uma ação de estilo tem um único destino explícito. Não reaproveita a
   seleção múltipla nem a feição antiga do editor ou do painel lateral. */
function activate(L,idx,expected){
 const f=L?.features?.[idx];
 if(!f||!S.layers.includes(L)||(expected&&expected!==f))throw Error('A feição de destino mudou. Selecione-a novamente.');
 if(S.msel?.items?.length&&typeof mselClear==='function')mselClear(true);
 if(S._vtxCtx&&typeof clearVertices==='function')clearVertices();
 S.selRaster=null;S.activeId=L.id;
 if(typeof ED!=='undefined'&&ED.on){
  ED.pend=null;ED.drag=null;
  if(typeof edSelecionar==='function')edSelecionar({L,idx,f},true);
 }
 S.selFeat={layer:L,layerId:L.id,idx,feature:f,partIdx:null};
 refreshUI();try{highlightSel();}catch(_){}
 return f;
}
function requireActive(L,idx){
 if(!isActive(L,idx))throw Error('O estilo só pode ser aplicado à feição ativa. Selecione o destino novamente.');
}
function cancel(resetTool=true){
 const old=current;current=null;old?.hint.remove();
 if(typeof map!=='undefined')map.getContainer().classList.remove('gm-style-brush-on');
 if(resetTool&&S.tool===TOOL)setTool('select');
}
function active(){
 if(!current)return false;
 if(S.tool!==TOOL||S.projectId!==current.project||generation()!==current.generation){cancel(false);return false;}
 return true;
}
function instruction(){
 if(current)current.text.textContent='Pincel · '+current.count+' aplicação(ões) · clique nas feições · Esc encerra';
}
function snapshot(L,f){
 const effectiveStyle=featureStyle(L,f),style={};
 for(const key of keys)if(effectiveStyle[key]!==undefined)style[key]=clone(effectiveStyle[key]);
  const p=L.gtype==='point'?ptStyleOf(L,f,effectiveStyle):null;
 // RGB é uma aparência efetiva dos pontos importados, não um atributo a
 // transferir. Congele a cor vista sem transportar as colunas R/G/B.
 if(p&&(p.shape==='circle'||L.features.length>BIG_LAYER)&&!has(L,f)&&f.props?.R!=null&&f.props?.G!=null&&f.props?.B!=null&&L._pintaRGB!==false){
  style.color=style.stroke=`rgb(${f.props.R|0},${f.props.G|0},${f.props.B|0})`;
  style.weight=0.4;
 }
 const out={version:1,gtype:L.gtype,style};
 if(L.gtype==='point'){
  out.point={shape:p.shape,size:p.size,rot:p.rot,dip:p.dip,params:clone(p.params)};
 }
 return out;
}
function start(L,idx){
 try{
  const f=L?.features?.[idx];
  if(!S.layers.includes(L)||!f||!['point','line','polygon'].includes(L.gtype))throw Error('Escolha uma feição vetorial para copiar o estilo.');
  if(!mapaVista2D())throw Error('Use o pincel no mapa 2D.');
  const copied=snapshot(L,f);
  cancel(false);setTool(TOOL);
  if(typeof ED!=='undefined'){ED.pend=null;ED.drag=null;try{edRedraw();}catch(_){}}
  closeFeatMenu();
  activate(L,idx,f);
  const hint=document.createElement('div');hint.id='gmStyleBrushHint';hint.className='gm-style-brush-hint';hint.setAttribute('role','status');
  hint.innerHTML=icon;
  const text=document.createElement('span');hint.append(text);
  const end=document.createElement('button');end.type='button';end.textContent='Encerrar';end.title='Encerrar pincel (Esc)';end.onclick=()=>cancel();hint.append(end);
  L2.DomEvent.disableClickPropagation(hint);L2.DomEvent.disableScrollPropagation(hint);
  map.getContainer().append(hint);map.getContainer().classList.add('gm-style-brush-on');
  current={copied,project:S.projectId,generation:generation(),hint,text,count:0};instruction();
  toast('Pincel de estilo: clique nas feições de destino. Esc ou botão direito encerra.');
  return true;
 }catch(e){toast(e.message||String(e));return false;}
}
function refresh(L){
 drawLayer(L);refreshUI();
 try{layoutSeVisivel();}catch(_){}
 window.GeoMineSessionAutosave?.markDirty('estilo da feição alterado');
}
function change(L,f,next){
 const before={had:own(f,KEY),value:clone(f[KEY])};
 try{
  if(next===undefined)delete f[KEY];else f[KEY]=clone(next);
  refresh(L);
  undoPush({t:'featurestylebrush',project:S.projectId,L,f,before,after:JSON.stringify(f[KEY])});
 }catch(e){
  if(before.had)f[KEY]=before.value;else delete f[KEY];
  try{refresh(L);}catch(_){}throw e;
 }
}
function pick(L,idx){
 if(!active())return false;
 try{
  const f=L?.features?.[idx];
  if(!f||!S.layers.includes(L))throw Error('Escolha uma feição de destino.');
  if(L.gtype!==current.copied.gtype)throw Error('O destino precisa ter o mesmo tipo de geometria da origem.');
  if(!editable(L))throw Error('A camada de destino está congelada ou sem permissão de edição.');
  requireActive(L,idx);
  if(JSON.stringify(f[KEY])===JSON.stringify(current.copied))return true;
  change(L,f,current.copied);current.count++;instruction();
  return true;
 }catch(e){toast(e.message||String(e));return false;}
}
/* Painting an unfilled area is intentional. Keep this hit policy local to
   the brush: ordinary selection must still pass through transparent areas.
   Prefer containment before tolerance, so an adjacent quadrant's nearer
   outline cannot steal a click that is inside the intended destination. */
function targetAt(ll){
 const type=current?.copied.gtype,selected=activeLayer();
 const order=[selected,...camadasNaOrdemDeSelecao().filter(L=>L!==selected)]
  .filter(L=>L&&L.visible!==false&&L.gtype===type&&L.features?.length);
 if(type==='polygon')for(const L of order){
  const hit=poligonoSobPonto(ll,L,{includeTransparent:true});
  if(hit)return hit;
 }
 for(const L of order){
  const hit=feicaoMaisProximaPx(ll,S.touch?Math.round(SNAP_PX*1.6):SNAP_PX,false,[L]);
  if(hit)return hit;
 }
 return null;
}
function mapClick(e){
 if(!active())return false;
 const ll=e?.latlng;if(!ll)return false;
 const hit=targetAt(ll);
 if(!hit){toast('Pincel: clique em uma feição de destino.');return false;}
 // Só o clique explícito de destino troca a feição ativa. Chamadas de
 // colagem/programáticas não podem escolher uma feição inativa por índice.
 if(hit.L.gtype!==current.copied.gtype||!editable(hit.L))return pick(hit.L,hit.idx);
 try{activate(hit.L,hit.idx,hit.f||hit.L.features[hit.idx]);}catch(error){toast(error.message);return false;}
 return pick(hit.L,hit.idx);
}
function clear(L,idx){
 try{
  const f=L?.features?.[idx];if(!f||!has(L,f))return false;
  if(!editable(L))throw Error('A camada está congelada ou sem permissão de edição.');
  requireActive(L,idx);
  change(L,f,undefined);toast('Estilo da camada restaurado nesta feição. Ctrl+Z desfaz.');return true;
 }catch(e){toast(e.message||String(e));return false;}
}
function getStyle(L,idx){
 const f=L?.features?.[idx];
 if(!S.layers.includes(L)||!f)throw Error('A feição não está mais neste projeto.');
 return snapshot(L,f);
}
function edit(L,idx,next){
 const f=L?.features?.[idx];
 if(!f||!editable(L))throw Error('A camada está congelada ou sem permissão de edição.');
 requireActive(L,idx);
 if(next?.version!==1||next.gtype!==L.gtype||!next.style)throw Error('Estilo incompatível com a feição.');
 if(JSON.stringify(f[KEY])===JSON.stringify(next))return false;
 change(L,f,next);return true;
}
/* Propriedades da camada: aplicar um estilo geral devolve as feições ao
   padrão. Não cria um undo só da limpeza: o estilo geral é aplicado junto
   pelo editor da camada, que já administra a transação de propriedades. */
function resetLayer(L,{predicate}={}){
 if(!S.layers.includes(L)||(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)))return 0;
 let n=0;
 for(const f of L.features||[])if(own(f,KEY)&&(!predicate||predicate(f))){delete f[KEY];n++;}
 if(n)window.GeoMineSessionAutosave?.markDirty('estilo da camada restaurado nas feições');
 return n;
}
function undo(a){
 if(a.project!==S.projectId||!S.layers.includes(a.L)||!a.L.features.includes(a.f)||!editable(a.L)||JSON.stringify(a.f[KEY])!==a.after){
  toast('Não foi possível desfazer: a feição mudou ou a camada está bloqueada.');return false;
 }
 if(a.before.had)a.f[KEY]=clone(a.before.value);else delete a.f[KEY];
 if(S.undo.at(-1)===a)S.undo.pop();refresh(a.L);
 if(active()){current.count=Math.max(0,current.count-1);instruction();}
 toast('Estilo da feição desfeito.');return true;
}
document.addEventListener('keydown',e=>{
 if(!active()||!['Escape','Enter'].includes(e.key))return;
 const t=e.target;if(t&&(/INPUT|TEXTAREA|SELECT/.test(t.tagName)||t.isContentEditable))return;
 e.preventDefault();e.stopImmediatePropagation();cancel();
},true);
window.GeoMineFeatureStyleBrush={start,pick,mapClick,cancel,undo,clear,active,effective,pointStyle,has,icon,getStyle,edit,resetLayer,isActive,activate};
})();
