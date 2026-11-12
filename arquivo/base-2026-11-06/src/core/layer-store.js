/* Modelo da pilha: não desenha no mapa nem altera controles da interface.
   Recebe o estado explicitamente e consulta os arrays atuais a cada operação,
   inclusive depois de abrir um projeto que substitui layers/groups/rasters. */
(function(root){
'use strict';
function nodeKey(type,id){return type+':'+id;}
function nodeLayer(node){return node.t==='L'?node.o.llayer:node.o.overlay;}
function allNodes(state){
  const out=[];
  state.layers.forEach(layer=>out.push({t:'L',id:layer.id,o:layer}));
  (state.rasters||[]).forEach(raster=>out.push({t:'R',id:raster.id,o:raster}));
  if(state.img&&state.img.url)out.push({t:'I',id:0,o:state.img});
  return out;
}
function stackSync(state){
  const nodes=allNodes(state),by={};
  nodes.forEach(node=>by[nodeKey(node.t,node.id)]=node);
  const emptyGroup=id=>{
    const group=state.groups.find(item=>item.id===id);
    return group&&!nodes.some(node=>node.o.groupId===id);
  };
  state.stack=(state.stack||[]).filter(key=>by[key]||(key.startsWith('G:')&&emptyGroup(+key.slice(2))));
  state.groups.forEach(group=>{
    const key='G:'+group.id;
    if(emptyGroup(group.id)&&!state.stack.includes(key))state.stack.unshift(key);
  });
  nodes.forEach(node=>{
    const key=nodeKey(node.t,node.id);
    if(!state.stack.includes(key)){
      if(node.t==='L')state.stack.unshift(key);else state.stack.push(key);
    }
  });
  return state.stack.filter(key=>by[key]).map(key=>by[key]);
}
root.GeoMineLayerStore=Object.freeze({nodeKey,nodeLayer,allNodes,stackSync});
})(typeof window!=='undefined'?window:globalThis);
