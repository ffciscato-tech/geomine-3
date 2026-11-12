/* Estado inicial do projeto. Sem DOM, mapa ou acesso a armazenamento.
   O adaptador legado conserva S como a mesma instância durante a migração. */
(function(root){
'use strict';
function create(options={}){
  const meta=options.projectMeta||null;
  return {
    layers:[], groups:[], touch:!!options.touch, fullRes:true,
    activeId:null, tool:'select', workCRS:(meta&&meta.crs)||'EPSG:31983',
    projectMeta:meta,
    projectId:'gm_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10),
    collaboration:null, img:null, stack:[], drawBuf:[], drawLayer:null,
    vtxLayer:null, selFeat:null
  };
}
root.GeoMineProjectState=Object.freeze({create});
})(typeof window!=='undefined'?window:globalThis);
