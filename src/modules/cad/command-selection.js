/* Fonte comum dos próximos comandos: a seleção explícita sempre vence uma
   antiga feição do editor. O snapshot prende objetos e dados, não só índices. */
(function(){
'use strict';
const geometry=f=>JSON.stringify([f.geom,!!f.multi,f.zg]);
const props=f=>JSON.stringify(f.props||{});
const gen=()=>window.GeoMineSessionAutosave?.state.generation;
function capture({gtype,stamp=true}={}){
 let kind='none',refs=[];
 if(S.msel?.items?.length){kind='multiple';refs=S.msel.items;}
 else if(S.selFeat){kind='single';refs=[S.selFeat];}
 else if(typeof ED!=='undefined'&&ED.on&&ED.sel&&S.selRaster==null&&
   S.layers.includes(ED.sel.L)&&S.activeId===ED.sel.L.id){
  kind='editor';refs=[{layer:ED.sel.L,layerId:ED.sel.L.id,idx:ED.sel.L.features.indexOf(ED.sel.f),feature:ED.sel.f}];
 }
 const items=[],seen=new Set();
 for(const ref of refs){
  const id=ref.layerId??ref.layer?.id,L=S.layers.find(l=>l.id===id),idx=ref.idx,f=L?.features?.[idx];
  if(!L||!Number.isInteger(idx)||!f?.geom||(ref.layer&&ref.layer!==L)||(ref.feature&&ref.feature!==f))
   throw Error('A seleção mudou ou contém uma feição removida. Selecione novamente.');
  if(gtype&&L.gtype!==gtype)throw Error(gtype==='polygon'?'Selecione somente polígonos para este comando.':gtype==='line'?'Selecione somente linhas para este comando.':'A seleção não corresponde ao tipo deste comando.');
  const partIdx=Number.isInteger(ref.partIdx)?ref.partIdx:null,key=L.id+':'+idx+':'+(partIdx??'*');
  if(seen.has(key))continue;seen.add(key);
  items.push({L,f,idx,partIdx,crs:L.crs,gtype:L.gtype,
   geometryStamp:stamp?geometry(f):undefined,propsStamp:stamp?props(f):undefined});
 }
 const layers=[...new Set(items.map(i=>i.L))];
 return {explicit:kind!=='none',kind,items,layers,project:S.projectId,generation:gen(),workCRS:S.workCRS,
  layerState:layers.map(L=>({L,crs:L.crs,gtype:L.gtype,fields:stamp?JSON.stringify(L.fields):undefined}))};
}
function assertCurrent(q){
 if(q.project!==S.projectId||q.generation!==gen()||q.workCRS!==S.workCRS)throw Error('O projeto mudou durante o comando. Execute novamente.');
 for(const state of q.layerState){const {L}=state;
  if(!S.layers.includes(L)||L.crs!==state.crs||L.gtype!==state.gtype||
   (state.fields!==undefined&&JSON.stringify(L.fields)!==state.fields))throw Error('A camada de origem mudou durante o comando. Execute novamente.');
 }
 for(const item of q.items){const {L,f,idx}=item;
  if(L.features[idx]!==f||(item.geometryStamp!==undefined&&geometry(f)!==item.geometryStamp)||
   (item.propsStamp!==undefined&&props(f)!==item.propsStamp))throw Error('As feições selecionadas mudaram durante o comando. Execute novamente.');
 }
 return q;
}
function uniqueItems(q){
 const seen=new Set();return q.items.filter(i=>{if(seen.has(i.f))return false;seen.add(i.f);return true;});
}
window.GeoMineCommandSelection={capture,assertCurrent,uniqueItems};
})();
