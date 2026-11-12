/* ==========================================================================
   PAINEL DO RASTER EM DUAS ABAS
   ESTILO é o cotidiano; DADOS é entrada e saída de arquivo (pasta de trabalho,
   curvas, exportação e reprojeção). As abas e as seções estão no próprio HTML
   da janela (index.template.html); este módulo só troca a aba visível e avisa
   quando o arquivo original não está acessível.
   A exibição é sempre nativa e automática: os controles de resolução herdados
   ficam fora da tela (#rasResBloco) e o botão do aviso aciona o seletor deles.
   O nome e os dados de leitura ficam no botão i do cabeçalho; Aplicar, Zoom,
   Hidro e Remover ficam no rodapé, fora das abas, por valerem para as duas.
   ========================================================================== */
(function(){
  const barra=document.getElementById('rasAbas');
  const caixas={est:document.getElementById('rasAba_est'), dad:document.getElementById('rasAba_dad')};
  if(!barra||!caixas.est||!caixas.dad) return;
  const aviso=document.getElementById('rasNativeAviso'),
        status=document.getElementById('rasNativeStatus'),
        religar=document.getElementById('rasNativeReconnect');
  if(religar) religar.onclick=()=>document.getElementById('rasLoadFull').click();
  window.GeoMineNativeRasterPanel={refresh(r){
    const d=r.d,g=d._full||d,linked=!!d._img0||!rasterPrecisaFonteTela(g);
    if(status) status.textContent=linked?'':'O arquivo original não está acessível na pasta vinculada. A imagem disponível é uma prévia; localize o original para recuperar o detalhe.';
    if(aviso) aviso.hidden=linked;
  }};

  window.rasAbaSel=function(id){
    Object.keys(caixas).forEach(k=>{
      const on=k===id;
      caixas[k].style.display=on?'':'none';
      const bt=barra.querySelector(`[data-aba="${k}"]`);
      if(bt){ bt.classList.toggle('on',on); bt.setAttribute('aria-pressed',String(on)); }
    });
  };
  barra.addEventListener('click',e=>{
    const bt=e.target.closest('[data-aba]'); if(!bt) return;
    e.preventDefault(); rasAbaSel(bt.dataset.aba);
  });
  rasAbaSel('est');
  /* Reabrir o modal sempre volta para Estilo: é o que se procura em 9 de cada
     10 aberturas, e manter a última aba faria o usuário achar que o painel
     mudou de conteúdo sozinho. */
  const bt=document.getElementById('rasClose');
  if(bt) bt.addEventListener('click',()=>{ try{ rasAbaSel('est'); }catch(e){} });
})();
