
/* Atual 132 — Voltar confiável na cava/rampa por bancada.
   A pilha completa de snapshots é propositalmente temporária (pode conter
   milhares de vértices), mas o projeto precisa lembrar quais AÇÕES a criaram.
   Este módulo grava somente marcos compactos e, ao reabrir, reconstrói o
   estado anterior por replay da receita. Projetos antigos, sem os marcos,
   usam uma queda segura: primeiro retiram a berma; no clique seguinte, a
   última bancada. */
(function voltarCava132(){
  const copiaAcoes=a=>Array.isArray(a)?a.slice(-80).map(q=>({
    bancoAntes:+q.bancoAntes||0,faseAntes:q.faseAntes==='pe'?'pe':'crista',
    bancoDepois:+q.bancoDepois||0,faseDepois:q.faseDepois==='pe'?'pe':'crista',
    ts:Number.isFinite(+q.ts)?+q.ts:null,
    ord:Number.isFinite(+q.ord)?+q.ord:null
  })):[];

  const proximaOrdem=()=>{
    const agora=Date.now();
    if(typeof S!=='undefined'&&S){
      S._undoOrder=Math.max(Number(S._undoOrder)||0,agora)+1;
      return S._undoOrder;
    }
    return agora;
  };

  const camadaAlvo=()=>{
    const layers=(typeof S!=='undefined'&&S&&S.layers)||[];
    let L=null;
    try{L=(S.selFeat&&S.selFeat.layer)||
      (typeof activeLayer==='function'?activeLayer():null);}catch(e){}
    if(L&&L._rb31Recipe&&+L._rb31Recipe.banco>0)return L;
    if(L){
      const id=String(L.id);
      const q=layers.find(x=>x&&x._rb31Recipe&&+x._rb31Recipe.banco>0&&
        String(x._rb31Recipe.srcLayerId)===id);
      if(q)return q;
    }
    return layers.find(x=>x&&x._rb31Recipe&&+x._rb31Recipe.banco>0)||null;
  };

  const gravaAcoes=st=>{
    if(!st)return;
    const a=copiaAcoes(st._acoesVoltar132),
      L=(st.lays&&st.lays.uni)||camadaAlvo();
    st._acoesVoltar132=a;
    if(L&&L._rb31Recipe)L._rb31Recipe.acoesVoltar132=copiaAcoes(a);
  };

  const estadoVivo=()=>{
    let st=(typeof S!=='undefined'&&S)?S._rb31:null;
    const L=camadaAlvo();
    if(L&&(!st||!(st.banco>0)||
       (st.srcLayerId!=null&&String(st.srcLayerId)!==String(L._rb31Recipe.srcLayerId)))){
      try{if(typeof rb31EstadoDaReceita==='function')st=rb31EstadoDaReceita(L);}catch(e){}
    }
    if(st&&L&&(!Array.isArray(st._acoesVoltar132)||!st._acoesVoltar132.length))
      st._acoesVoltar132=copiaAcoes(L._rb31Recipe&&L._rb31Recipe.acoesVoltar132);
    return st;
  };

  /* Registra só a mudança de fase/banco; a geometria continua na receita. */
  const acao0=window.rb31AcaoComVolta;
  if(typeof acao0==='function')window.rb31AcaoComVolta=function(fn){
    const antes=estadoVivo(),m=antes?{banco:+antes.banco||0,fase:antes.fase}:null,
      r=acao0.apply(this,arguments),depois=(typeof S!=='undefined'&&S)?S._rb31:null;
    if(m&&depois&&(m.banco!==+depois.banco||m.fase!==depois.fase)){
      depois._acoesVoltar132=copiaAcoes(depois._acoesVoltar132);
      depois._acoesVoltar132.push({bancoAntes:m.banco,faseAntes:m.fase,
        bancoDepois:+depois.banco||0,faseDepois:depois.fase,ts:Date.now(),
        ord:proximaOrdem()});
      gravaAcoes(depois);
    }
    return r;
  };

  /* A reconstrução da receita também recupera os marcos compactos. */
  const receita0=window.rb31EstadoDaReceita;
  if(typeof receita0==='function')window.rb31EstadoDaReceita=function(alvo){
    const st=receita0.apply(this,arguments),L=alvo||camadaAlvo();
    if(st&&L&&L._rb31Recipe)
      st._acoesVoltar132=copiaAcoes(L._rb31Recipe.acoesVoltar132);
    return st;
  };

  /* rb31Desenha substitui a receita inteira. Os marcos do Voltar não fazem
     parte do núcleo geométrico e, sem esta ponte, desapareciam justamente
     depois de continuar a cava num projeto reaberto. Conserva-os através de
     qualquer redesenho, inclusive replay do limite paramétrico. */
  const desenha0=window.rb31Desenha;
  if(typeof desenha0==='function')window.rb31Desenha=function(st){
    const L=st&&st.lays&&st.lays.uni,
      a=copiaAcoes((st&&st._acoesVoltar132)||(L&&L._rb31Recipe&&
        L._rb31Recipe.acoesVoltar132));
    const r=desenha0.apply(this,arguments),Lf=st&&st.lays&&st.lays.uni;
    if(st){st._acoesVoltar132=a;
      if(Lf&&Lf._rb31Recipe)Lf._rb31Recipe.acoesVoltar132=copiaAcoes(a);}
    return r;
  };

  const limpaAteBanco=(st,n)=>{
    st.hist=(st.hist||[]).slice(0,n);
    if(Array.isArray(st._histAlvo))st._histAlvo=st._histAlvo.slice(0,n);
    if(Array.isArray(st.paramBancos))st.paramBancos=st.paramBancos.slice(0,n);
    if(Array.isArray(st.eixos))st.eixos=st.eixos.slice(0,n);
    if(Array.isArray(st.rampas))st.rampas=st.rampas.filter(q=>
      !(Number.isFinite(+q.banco)&&+q.banco>n));
  };

  const restauraMarco=(st,marco)=>{
    const bancoAtual=+st.banco||0,
      banco=Math.max(0,Math.min(bancoAtual,+marco.bancoAntes||0)),
      fase=marco.faseAntes==='pe'?'pe':'crista',
      acoes=copiaAcoes(st._acoesVoltar132);
    limpaAteBanco(st,banco);
    st._histAlvo=null;st.banco=banco;st.fase=fase;
    /* O replay troca S._rb31 por um objeto novo; os marcos são recolocados
       depois, sem carregar snapshots geométricos pesados. */
    if(banco>0&&typeof rb31Replay==='function'){
      rb31Replay();st=S._rb31||st;st._acoesVoltar132=acoes;
    }else{
      st.feats=[];st.eixos=[];st.paramBancos=[];st.hist=[];
      st.pe=null;st.crista=null;st.pFim=null;st.pFimB=null;st.pFimDir=null;
      st.proxIniA=null;st.proxIniB=null;st.zPe=null;
      st._acoesVoltar132=acoes;
      try{if(typeof rb31Desenha==='function')rb31Desenha(st);}catch(e){}
    }
    gravaAcoes(st);
    return st;
  };

  const voltar0=window.rb31Voltar;
  window.rb31Voltar=function(){
    let st=estadoVivo();
    if(!st||!(+st.banco>0)){
      if(typeof toast==='function')toast('Nada para voltar — gere uma bancada primeiro');
      return false;
    }
    if(st.undoPilha&&st.undoPilha.length&&typeof voltar0==='function'){
      /* O snapshot e o marco compacto descrevem a mesma ação. Consumir só o
         snapshot deixava um marco "fantasma", que depois fazia o Ctrl+Z
         saltar para uma etapa antiga e restaurar conteúdo fora de ordem. */
      const restantes=copiaAcoes(st._acoesVoltar132);if(restantes.length)restantes.pop();
      voltar0.call(this);st=(S&&S._rb31)||st;
      st._acoesVoltar132=restantes;gravaAcoes(st);return true;
    }
    let acoes=copiaAcoes(st._acoesVoltar132),marco=acoes.pop();
    if(!marco){
      /* Compatibilidade com projetos anteriores à Atual 132. Sem saber se a
         última crista veio de “Offset” ou “Iteração”, escolhe o recuo menos
         destrutivo: retira a berma; outro clique retira a bancada. */
      marco=st.fase==='crista'?
        {bancoAntes:+st.banco||0,faseAntes:'pe'}:
        {bancoAntes:Math.max(0,(+st.banco||0)-1),faseAntes:'crista'};
    }
    st._acoesVoltar132=acoes;
    st=restauraMarco(st,marco);
    const info=document.getElementById('rb31Info');
    if(info)info.textContent='Etapa desfeita — banco '+st.banco+
      (st.fase==='pe'?' (pé/crista de chegada pronto; berma retirada)':' (linha de partida pronta)')+
      ((st.undoPilha&&st.undoPilha.length)||st._acoesVoltar132.length?
        ' · ainda há etapas para voltar.':' · nada mais para voltar.');
    if(typeof toast==='function')toast('Etapa desfeita — Voltar funcionando');
    try{if(typeof refreshUI==='function')refreshUI();}catch(e){}
    return true;
  };

  /* O vínculo anterior guardava uma referência antiga da função. O callback
     dinâmico garante que o botão sempre invoque esta versão final. */
  const b=document.getElementById('btnRb31Voltar');
  if(b)b.onclick=()=>window.rb31Voltar();
})();
