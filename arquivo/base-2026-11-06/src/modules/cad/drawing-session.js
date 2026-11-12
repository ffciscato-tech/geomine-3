/* A seleção na árvore serve à consulta de propriedades, não é o destino
   de um traçado já iniciado. O rascunho mantém sua camada até concluir ou
   cancelar; ocultar/consultar um MDT nunca o transfere nem o descarta. */
(function(){
'use strict';
let draft=null;
const drawing=()=>S.tool==='line'||S.tool==='poly';
function layer(){
  if(!drawing())return activeLayer();
  if(!draft)return activeLayer();
  const L=draft.layer;
  return draft.project===S.projectId&&draft.tool===S.tool&&
    S.layers.includes(L)&&L.crs===draft.crs&&L.gtype===draft.gtype?L:null;
}
function acquire(){
  const L=layer();
  if(!L){
    toast(draft?'A camada de destino do traçado não está disponível ou foi alterada. O traçado foi preservado; cancele a ferramenta para iniciar outro.'
      :'Selecione uma camada vetorial para começar o desenho.');
    return null;
  }
  if(!drawing()||L.gtype!==(S.tool==='poly'?'polygon':'line')){
    toast('A camada de destino não corresponde ao tipo do desenho.');return null;
  }
  if(L.locked){toast('A camada "'+L.name+'" está bloqueada. O traçado foi preservado.');return null;}
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){
    collabCanEditLayer(L,true);return null;
  }
  if(!draft)draft={layer:L,project:S.projectId,tool:S.tool,crs:L.crs,gtype:L.gtype};
  return L;
}
function clear(){draft=null;}
window.GeoMineDrawingSession={layer,acquire,clear};
})();
