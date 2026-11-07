/* COPIAR E COLAR feições (menu da feição, Ctrl+C / Ctrl+V).
   Copiar guarda um retrato das feições (ou das partes selecionadas): editar a
   origem depois não muda o que foi copiado. Colar põe as cópias na camada
   ativa, se for do mesmo tipo, senão na camada de origem, no mesmo lugar, e já
   arma o Mover: arraste até o destino ou clique na base e no destino. Esc
   deixa a cópia onde está; um Ctrl+Z desfaz a colagem inteira. Atributos,
   CRS e partes seguem as mesmas regras de "Copiar para outra camada". */
(function(){
'use strict';
let clip=null;
const H=()=>window.GeoMineFeatureCopy?.helpers;
const TYPES={point:'pontos',line:'linhas',polygon:'polígonos'};
// mesma precedência do Mover e do Delete: seleção múltipla, editor, seleção simples
function selecao(){
  if(S.msel?.items?.length)return S.msel.items.map(x=>({...x}));
  if(typeof ED!=='undefined'&&ED.on&&ED.sel&&S.layers.includes(ED.sel.L)){
    const i=ED.sel.L.features.indexOf(ED.sel.f);if(i>=0)return [{layerId:ED.sel.L.id,idx:i}];
  }
  if(S.selFeat){const id=S.selFeat.layerId??S.selFeat.layer?.id;if(id!=null)return [{layerId:id,idx:S.selFeat.idx,partIdx:S.selFeat.partIdx}];}
  return [];
}
function copy(refs){
  const h=H();if(!h){toast('Copiar indisponível nesta versão');return false;}
  const items=h.resolve(refs||selecao());
  if(!items.length){toast('Selecione uma feição para copiar');return false;}
  const gtypes=[...new Set(items.map(i=>i.L.gtype))];
  if(gtypes.length>1){toast('Copie feições de um mesmo tipo (pontos, linhas ou polígonos)');return false;}
  if(!TYPES[gtypes[0]]){toast('Este tipo de camada não pode ser copiado');return false;}
  clip={gtype:gtypes[0],from:items[0].L.id,items:items.map(it=>{
    const p=h.piece(it);
    return {crs:it.L.crs,geom:h.plain(p.geom),multi:p.multi,zg:p.zg==null?undefined:h.plain(p.zg),props:h.plain(it.f.props||{})};
  })};
  const n=clip.items.length;
  toast((n===1?'1 feição copiada':n+' feições copiadas')+' — Colar (Ctrl+V) na camada ativa');
  return true;
}
function destino(){
  const h=H(),ok=L=>!!L&&L.gtype===clip.gtype&&S.layers.includes(L)&&!h.special(L)&&!L._channelLink&&h.editable(L);
  const A=typeof activeLayer==='function'?activeLayer():null;
  if(ok(A))return A;
  const O=S.layers.find(L=>L.id===clip.from);
  return ok(O)?O:null;
}
function paste(){
  try{
    const h=H();if(!clip||!h)throw Error('Nada copiado. Use Copiar (Ctrl+C) numa feição.');
    if(typeof ED!=='undefined'&&(ED.drag||ED.pend)||S.drawBuf?.length)throw Error('Conclua o desenho ou a edição em andamento antes de colar.');
    const T=destino();
    if(!T)throw Error('Ative uma camada de '+TYPES[clip.gtype]+' editável para colar.');
    // tudo preparado antes de alterar a camada: uma falha não deixa colagem parcial
    const fields=(T.fields||[]).map(f=>({...f}));
    const feats=clip.items.map(it=>{
      const feat={geom:h.transform(it.geom,h.converter(it.crs,T.crs)),multi:it.multi,props:h.props(fields,{props:it.props})};
      if(it.zg!==undefined)feat.zg=h.plain(it.zg);return feat;
    });
    const start=T.features.length;
    feats.forEach((f,i)=>{if(Object.prototype.hasOwnProperty.call(f.props,'FID'))f.props.FID=start+i;});
    T.features.push(...feats);
    undoPush({t:'featadd',L:T,feats});
    drawLayer(T);S.activeId=T.id;
    if(typeof closeFeatMenu==='function')closeFeatMenu();
    if(S.msel?.items?.length&&typeof mselClear==='function')mselClear(true);
    if(feats.length===1){
      const idx=T.features.indexOf(feats[0]);S.selFeat={layer:T,layerId:T.id,idx};
      if(typeof ED!=='undefined'&&ED.on&&typeof edSelecionar==='function')edSelecionar({L:T,f:feats[0],idx},true);
    }else{S.selFeat=null;S.msel.items=feats.map(f=>({layerId:T.id,idx:T.features.indexOf(f)}));try{mselHL();mselCount();}catch(_){}}
    refreshUI();try{highlightSel();}catch(_){}
    const n=feats.length,txt=(n===1?'1 feição colada':n+' feições coladas')+' em “'+T.name+'”';
    if(window.GeoMineDragMove?.arm())toast(txt+': arraste até o destino (ou clique na base e no destino) · Esc deixa no lugar · Ctrl+Z desfaz');
    else toast(txt+' no mesmo lugar · Ctrl+Z desfaz');
    return true;
  }catch(e){toast(e.message||String(e));return false;}
}
document.addEventListener('keydown',ev=>{
  if(!(ev.ctrlKey||ev.metaKey)||ev.altKey||ev.shiftKey)return;
  const k=String(ev.key||'').toLowerCase();if(k!=='c'&&k!=='v')return;
  const t=ev.target;if(t&&(/INPUT|TEXTAREA|SELECT/.test(t.tagName)||t.isContentEditable))return;
  if(S._view&&S._view!=='map'&&S._view!=='2d')return;
  if(String(window.getSelection?.()||'').trim())return;   // texto marcado na página: cópia normal
  if(k==='c'){if(!selecao().length)return;ev.preventDefault();copy();}
  else{if(!clip)return;ev.preventDefault();paste();}
});
window.GeoMineClipboard={copy,paste,has:()=>!!clip,count:()=>clip?clip.items.length:0,clear:()=>{clip=null;}};
})();
