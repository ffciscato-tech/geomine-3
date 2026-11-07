/* Extensões da faixa registram a preparação por identidade, sem substituir
   ribbonBuild. Registrar novamente o mesmo recurso atualiza sua preparação. */
(function(root){
'use strict';
function create(){
  const hooks=new Map();
  function register(id,prepare){
    if(typeof id!=='string'||!id.trim()||typeof prepare!=='function')
      throw new TypeError('A extensão da faixa precisa de identidade e função.');
    hooks.set(id,prepare);
    return ()=>{if(hooks.get(id)===prepare)hooks.delete(id);};
  }
  function prepare(catalog){
    for(const hook of Array.from(hooks.values()))hook(catalog);
  }
  return Object.freeze({register,prepare});
}
root.GeoMineRibbon=Object.freeze({...create(),create});
})(typeof window!=='undefined'?window:globalThis);
