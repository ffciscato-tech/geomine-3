
/* Substitutos neutros. buildLayout e legendItems chamam loT/loRampa* e são
   definidos ANTES do bloco 126; se aquele bloco falhar ou for removido, estes
   mantêm o Layout desenhando exatamente como antes, em português e com o
   gradiente padrão. O bloco 126 sobrescreve os quatro. */
window.loT = window.loT || function(s){ return s; };
window.loRampaRaster = window.loRampaRaster || function(){ return null; };
window.loRampaId = window.loRampaId || function(){ return 'lg_ras'; };
window.loRampaDef = window.loRampaDef || function(id){
  return '<linearGradient id="'+id+'"><stop offset="0" stop-color="#1a6b3c"/>'+
         '<stop offset="0.5" stop-color="#e8e07a"/><stop offset="1" stop-color="#8d6e63"/></linearGradient>';
};
