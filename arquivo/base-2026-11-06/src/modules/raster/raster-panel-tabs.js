
/* ==========================================================================
   PAINEL DO RASTER EM TRÊS ABAS
   O modal era uma coluna única com estilo, resolução, gravação, curvas,
   exportação e reprojeção enfileirados — para chegar em "Exportar" era preciso
   rolar por tudo, e o que se usa toda hora (estilo) ficava misturado com o que
   se usa uma vez (reprojetar). As abas seguem o uso: ESTILO é o cotidiano,
   RESOLUÇÃO é a decisão de peso × detalhe, DADOS é entrada e saída de arquivo.
   Os blocos são MOVIDOS, não recriados: ids e handlers continuam os mesmos.
   O texto de ORIGEM fica FORA das abas, sempre visível, porque é o que
   identifica de onde a superfície veio; e a linha de Zoom/Hidro/Remover fica
   no rodapé, também fora, por valer para qualquer aba.
   ========================================================================== */
(function(){
  const corpo=document.querySelector('#rasModal .modal-b');
  if(!corpo || corpo.dataset.abas) return;
  const info=document.getElementById('rasInfo');
  const blocoDe=id=>{ const e=document.getElementById(id);
    if(!e) return null;
    let n=e; while(n && n.parentElement!==corpo) n=n.parentElement;
    return n; };
  const bRes=blocoDe('rasRes'), bArq=blocoDe('rasSaveProject'),
        bCur=blocoDe('rasContour'), bExp=blocoDe('btnRasExp'),
        bWarp=blocoDe('rasWarp'), bRodape=blocoDe('rasZoom');
  /* Se a estrutura do modal mudar, desiste em silêncio e deixa a coluna única
     — melhor um painel comprido do que um painel quebrado. */
  if(!info||!bRes||!bArq||!bCur||!bExp||!bWarp||!bRodape) return;
  const filhos=[...corpo.children];
  const iInfo=filhos.indexOf(info), iRes=filhos.indexOf(bRes);
  if(iInfo<0||iRes<0||iRes<=iInfo) return;

  const abas=[
    {id:'est', rot:'Estilo',     nos:filhos.slice(iInfo+1, iRes)},
    {id:'res', rot:'Resolução',  nos:[bRes]},
    {id:'dad', rot:'Dados',      nos:[bArq,bCur,bExp,bWarp]},
  ];
  const barra=document.createElement('div');
  barra.id='rasAbas';
  barra.style.cssText='display:flex;gap:4px;margin:8px 0 6px';
  const caixas={};
  abas.forEach((a,k)=>{
    const bt=document.createElement('button');
    bt.type='button'; bt.className='mini'; bt.dataset.aba=a.id; bt.textContent=a.rot;
    bt.style.cssText='flex:1;padding:6px 4px';
    barra.appendChild(bt);
    const box=document.createElement('div');
    box.id='rasAba_'+a.id;
    a.nos.forEach(n=>{ if(n) box.appendChild(n); });   // MOVE (não clona)
    caixas[a.id]=box;
  });
  info.insertAdjacentElement('afterend', barra);
  let ant=barra;
  abas.forEach(a=>{ ant.insertAdjacentElement('afterend', caixas[a.id]); ant=caixas[a.id]; });
  corpo.appendChild(bRodape);                          // rodapé sempre por último
  corpo.dataset.abas='1';

  window.rasAbaSel=function(id){
    abas.forEach(a=>{
      const on=a.id===id;
      caixas[a.id].style.display=on?'block':'none';
      const bt=barra.querySelector(`[data-aba="${a.id}"]`);
      if(bt){ bt.style.background=on?'var(--amber)':'';
              bt.style.color=on?'#1a1206':'';
              bt.style.fontWeight=on?'700':''; }
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
