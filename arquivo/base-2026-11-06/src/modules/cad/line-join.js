/* Unir trabalha sobre a seleção já feita. Cada ponta original é conservada:
   quando há um vão, o segmento entre as duas pontas passa a fazer parte da
   linha. A geometria inteira é preparada antes de tocar nas feições. */
(function(root){
'use strict';
const copy=v=>v==null?v:structuredClone(v);
const nested=f=>Array.isArray(f.geom?.[0]?.[0]);
const rings=f=>nested(f)?f.geom:[f.geom];
const stamp=L=>JSON.stringify(L.features);
let pending=null;
function writable(L,items){
  if(!S.layers.includes(L)||L.gtype!=='line')throw Error('Selecione somente linhas para unir.');
  if(L.locked)throw Error('Desbloqueie a camada “'+L.name+'” antes de unir.');
  if(L._geology||L.cavaDesign||L.tinSurface||L._cava2DesignId||L._rb31Recipe||L._channelLink||
    items.some(i=>root.rb134EhDerivadaProtegida?.(L,i.f)||root.GeoMineDimensions?.isFeature?.(L,i.f)))
    throw Error('A camada “'+L.name+'” possui geometria calculada; ajuste-a pela ferramenta que a gerou.');
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){
    collabCanEditLayer(L,true);throw Error('Reserve a camada “'+L.name+'” antes de unir.');
  }
}
function selected(items){
  const by=new Map();
  for(const item of items){
    const {L,f}=item;if(L.gtype!=='line'||!S.layers.includes(L)||L.features[item.idx]!==f)
      throw Error('A seleção mudou. Selecione as linhas novamente.');
    let entry=by.get(f);if(!entry){entry={L,f,idx:item.idx,parts:new Set(),whole:false};by.set(f,entry);}
    if(item.partIdx==null)entry.whole=true;
    else if(Number.isInteger(item.partIdx)&&item.partIdx>=0&&item.partIdx<rings(f).length)entry.parts.add(item.partIdx);
    else throw Error('A parte selecionada não existe mais. Selecione a linha novamente.');
  }
  return [...by.values()].map(e=>({...e,parts:e.whole?new Set(rings(e.f).map((_,i)=>i)):e.parts}));
}
function zRing(f,ri){
  const r=rings(f)[ri],raw=nested(f)?f.zg?.[ri]:f.zg;
  return r.map((p,i)=>Number.isFinite(p[2])?p[2]:Array.isArray(raw)&&Number.isFinite(raw[i])?raw[i]:null);
}
function linePart(f,ri){
  const g=rings(f)[ri];
  if(!Array.isArray(g)||g.length<2||g.some(p=>!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])))
    throw Error('Uma das linhas não possui pelo menos dois vértices válidos.');
  if(g.length>2&&g[0][0]===g.at(-1)[0]&&g[0][1]===g.at(-1)[1])
    throw Error('Uma linha está fechada. Abra-a no ponto de ligação antes de unir.');
  return {geom:g.map(p=>p.slice()),z:zRing(f,ri)};
}
function distance(a,b,crs){
  if(/^(EPSG:)?(4326|4674|4618|4258|4269)$/i.test(crs||'')){
    const rad=Math.PI/180,dlat=(b[1]-a[1])*rad,dlon=(b[0]-a[0])*rad;
    return Math.sin(dlat/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dlon/2)**2;
  }
  return (a[0]-b[0])**2+(a[1]-b[1])**2;
}
function reverse(c){return {geom:c.geom.slice().reverse(),z:c.z.slice().reverse()};}
function samePoint(a,za,b,zb){return za===zb&&a.length===b.length&&a.every((v,i)=>v===b[i]);}
function concat(a,b){
  const skip=samePoint(a.geom.at(-1),a.z.at(-1),b.geom[0],b.z[0])?1:0;
  return {geom:a.geom.concat(b.geom.slice(skip)),z:a.z.concat(b.z.slice(skip))};
}
/* Cresce a cadeia pela ponta mais próxima, podendo inverter cada trecho.
   Empates mantêm a ordem de seleção, tornando o resultado reproduzível. */
function connect(parts,crs){
  if(parts.length<2)throw Error('Selecione pelo menos duas linhas ou duas partes para unir.');
  let chain=parts[0],left=parts.slice(1),connections=0;
  while(left.length){
    let best=null;
    left.forEach((p,i)=>{
      const options=[[chain.geom.at(-1),p.geom[0],0],[chain.geom.at(-1),p.geom.at(-1),1],
        [chain.geom[0],p.geom.at(-1),2],[chain.geom[0],p.geom[0],3]];
      options.forEach(([a,b,mode])=>{const d=distance(a,b,crs);if(!best||d<best.d)best={i,mode,d};});
    });
    const next=left.splice(best.i,1)[0];
    if(best.d>0)connections++;
    chain=best.mode===0?concat(chain,next):best.mode===1?concat(chain,reverse(next)):
      best.mode===2?concat(next,chain):concat(reverse(next),chain);
  }
  return {...chain,connections};
}
function withParts(f,rs,zs){
  const out=copy(f);out.multi=rs.length>1;out.geom=out.multi?rs:rs[0];
  if(zs.some(z=>z.some(Number.isFinite)))out.zg=out.multi?zs:zs[0];else delete out.zg;
  return out;
}
function plan(items){
  const entries=selected(items);if(!entries.length)throw Error('Selecione as linhas que deseja unir.');
  const L=entries[0].L;
  if(entries.some(e=>e.L!==L))throw Error('As linhas precisam estar na mesma camada para unir.');
  writable(L,entries);
  const anchor=entries[0],parts=entries.flatMap(e=>[...e.parts].sort((a,b)=>a-b).map(ri=>linePart(e.f,ri))),joined=connect(parts,L.crs),replacements=new Map();
  for(const e of entries){
    const rs=[],zs=[];let inserted=false;
    rings(e.f).forEach((r,ri)=>{
      if(e.parts.has(ri)){
        if(e===anchor&&!inserted){rs.push(joined.geom);zs.push(joined.z);inserted=true;}
      }else{rs.push(r.map(p=>p.slice()));zs.push(zRing(e.f,ri));}
    });
    replacements.set(e.f,rs.length?withParts(e.f,rs,zs):null);
  }
  const next=L.features.flatMap(f=>replacements.has(f)?replacements.get(f)?[replacements.get(f)]:[]:[f]);
  return {L,entries,anchor:replacements.get(anchor.f),next,joined};
}
function selectionState(){return {active:S.activeId,tool:S.tool,sel:S.selFeat&&{...S.selFeat},
  multi:(S.msel?.items||[]).map(i=>({...i})),editor:typeof ED!=='undefined'&&ED.sel&&{...ED.sel},
  legacy:!!S._vtxCtx||S.tool==='vertex'};}
function clear(){
  root.GeoMineDragMove?.cancel();root.GeoMinePolygonEdgeDrag?.clear();root.GeoMineVertexGuides?.end();
  if(typeof clearVertices==='function')clearVertices();
  if(typeof mselClear==='function')mselClear(true);else if(S.msel)S.msel.items=[];
  if(typeof ED!=='undefined'){ED.drag=null;ED.pend=null;ED.vi=-1;ED.ring=0;}
}
function refresh(L,state){
  drawLayer(L);refreshUI();if(typeof zApply==='function')zApply();
  if(state.legacy&&S.selFeat?.layer===L&&typeof showVertices==='function')showVertices();
  if(typeof edRedraw==='function')edRedraw();if(typeof edPainelSync==='function')edPainelSync();
  if(S.msel?.items?.length&&typeof mselHL==='function')mselHL();else if(typeof highlightSel==='function')highlightSel();
  if(document.getElementById('attrPanel')?.classList.contains('open'))openAttr();
}
function restore(state){
  clear();S.activeId=state.active;S.selFeat=state.sel;if(S.msel)S.msel.items=state.multi.map(i=>({...i}));
  if(typeof ED!=='undefined')ED.sel=state.editor;
}
function apply(q){
  root.GeoMineCommandSelection.assertCurrent(q);
  const p=plan(q.items),before=p.L.features,state=selectionState(),release=root.GeoMineChannelLive?.suspend?.()||(()=>{});
  try{
    clear();p.L.features=p.next;S.activeId=p.L.id;
    const idx=p.next.indexOf(p.anchor);S.selFeat={layer:p.L,layerId:p.L.id,idx};
    if(typeof ED!=='undefined')ED.sel={L:p.L,f:p.anchor,idx};
    refresh(p.L,state);
    undoPush({t:'linejoin',L:p.L,project:S.projectId,before,after:p.next,afterStamp:stamp(p.L),selection:state});
    pending=null;root.GeoMineSessionAutosave?.markDirty?.('unir linhas');
    toast('Linhas unidas'+(p.joined.connections?' · '+p.joined.connections+' ligação(ões) entre as pontas':'')+'.');return true;
  }catch(e){p.L.features=before;restore(state);try{refresh(p.L,state);}catch(_){}throw e;}
  finally{release();}
}
function start(){
  try{
    const q=root.GeoMineCommandSelection.capture({gtype:'line'});
    if(!q.items.length){toast('Selecione as linhas que deseja unir.');return false;}
    const es=selected(q.items);if(es.some(e=>e.L!==es[0].L))throw Error('As linhas precisam estar na mesma camada para unir.');
    writable(es[0].L,es);
    if(es.reduce((n,e)=>n+e.parts.size,0)>1)return apply(q);
    const item=q.items[0];linePart(item.f,item.partIdx??0);
    root.GeoMineDragMove?.cancel();
    if(typeof ED!=='undefined'&&!ED.on&&typeof edLigar==='function')edLigar(true,true);
    edSelecionar(item,true);S.selFeat={layer:item.L,layerId:item.L.id,idx:item.idx,partIdx:item.partIdx};
    pending=q;ED.pend={cmd:'unir',pts:[]};toast('Toque na outra linha para unir.');return true;
  }catch(e){toast(e.message);return false;}
}
function complete(target){
  try{
    const q=pending;pending=null;if(!q)throw Error('Selecione as linhas e execute Unir novamente.');
    root.GeoMineCommandSelection.assertCurrent(q);
    if(!target?.L||target.L.features[target.idx]!==target.f)throw Error('A linha de destino não existe mais.');
    const first=q.items[0],partIdx=Number.isInteger(target.partIdx)?target.partIdx:null;
    if(first.f===target.f&&(first.partIdx==null||partIdx==null||first.partIdx===partIdx))throw Error('Escolha outra linha para unir.');
    const item={...target,partIdx},layers=[...new Set([...q.layers,target.L])];
    return apply({...q,layers,items:q.items.concat(item)});
  }catch(e){toast(e.message);return false;}
}
function undo(a){
  try{
    if(a.project!==S.projectId||!S.layers.includes(a.L)||a.L.features!==a.after||stamp(a.L)!==a.afterStamp)
      throw Error('Não foi possível desfazer: as linhas foram alteradas depois da união.');
    writable(a.L,[]);const current=a.L.features,state=selectionState(),release=root.GeoMineChannelLive?.suspend?.()||(()=>{});
    try{a.L.features=a.before;restore(a.selection);refresh(a.L,a.selection);if(S.undo.at(-1)===a)S.undo.pop();root.GeoMineSessionAutosave?.markDirty?.('união desfeita');toast('União desfeita.');return true;}
    catch(e){a.L.features=current;restore(state);try{refresh(a.L,state);}catch(_){}throw e;}
    finally{release();}
  }catch(e){toast(e.message);return false;}
}
root.GeoMineLineJoin={start,complete,undo,plan,connect};
})(window);
