/* Une as categorias JANELA e AJUDA numa única aba da faixa.

   O catálogo CATS é montado pelo núcleo; aqui apenas os grupos de AJUDA são
   transferidos para JANELA e a categoria vazia é retirada. Nenhum comando é
   descartado, e a caixa de busca — que o núcleo posiciona depois de AJUDA —
   cai no seu próprio caminho de reserva (fim da lista) quando a aba não
   existe mais. */
(function(){
'use strict';

const NOME_UNIDO='JANELA E AJUDA';

function une(){
  if(typeof CATS==='undefined'||!Array.isArray(CATS))return false;
  const jan=CATS.find(c=>c.id==='janela');
  if(!jan)return false;
  const aju=CATS.find(c=>c.id==='ajuda');
  if(aju){
    jan.grupos=jan.grupos||[];
    (aju.grupos||[]).forEach(g=>{
      if(!jan.grupos.some(x=>x.label===g.label))jan.grupos.push(g);
    });
    CATS.splice(CATS.indexOf(aju),1);
    /* Quem estivesse com AJUDA aberta passa a ver a aba unida em vez de cair
       numa categoria inexistente. */
    if(typeof RIB_CAT_ATUAL!=='undefined'&&RIB_CAT_ATUAL==='ajuda')RIB_CAT_ATUAL='janela';
  }
  jan.nome=NOME_UNIDO;
  return true;
}

function aplica(){
  if(!une())return false;
  if(typeof ribbonBuild==='function'){try{ribbonBuild();}catch(e){}}
  return true;
}

if(!aplica()){
  /* O módulo pode ser avaliado antes de o catálogo existir; nesse caso a
     união é tentada de novo na carga do documento e por algumas vezes
     espaçadas, sem ficar tentando para sempre. */
  let restantes=20;
  const timer=setInterval(()=>{ if(aplica()||--restantes<=0)clearInterval(timer); },250);
  document.addEventListener('DOMContentLoaded',()=>{ if(aplica())clearInterval(timer); });
}

})();
