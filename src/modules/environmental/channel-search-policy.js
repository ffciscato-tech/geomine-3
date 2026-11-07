/* Política de busca: o motor geométrico continua limitado ao plano de cada
   tentativa. A interface amostra o MDT de novo somente para falhas de alcance. */
(function(){
'use strict';
const AUTOMATIC_REACHES=Object.freeze([10,20,40,80,160,320]);
const RETRY_CODES=Object.freeze(['CHANNEL_REACH_BANK','CHANNEL_REACH_BREAK','CHANNEL_REACH_FLOOR']);
function reaches({searchLimited=true,reach}={}){
  if(searchLimited===false)return AUTOMATIC_REACHES.slice();
  if(!Number.isFinite(reach)||reach<=0){const error=Error('Informe um alcance manual positivo por lado.');error.code='CHANNEL_INVALID_INPUT';throw error;}
  return [reach];
}
function canExpand(error){
  // Não interpretar textos traduzidos nem permitir erro desconhecido. O código
  // de topo prevalece sobre diagnóstico: um erro fatal não pode virar retry.
  const code=typeof error?.code==='string'?error.code:error?.diagnostic?.code;
  return RETRY_CODES.includes(code);
}
window.GeoMineChannelSearchPolicy=Object.freeze({
  reaches,canExpand,
  limits:Object.freeze({maxReach:320,maxTotalWidth:640,maxAttempts:6,maxSamples:250000}),
  automaticWarning:'Busca automática em etapas, até 320 m por lado (640 m no total). O preenchimento por altura processa o MDT em blocos na resolução nativa. O processamento pode parar antes por cobertura do MDT ou memória. Confira o alcance efetivamente usado; não certifica leito regular ou nível de cheia.'
});
})();
