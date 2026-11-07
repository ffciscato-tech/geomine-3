
/* Atual 134 — edição manual antes da rampa.
   Cristas, pés e bermas continuam editáveis. No modo cava bruta essas
   alterações não redesenham a rampa; são guardadas como linhas de controle
   e reaplicadas quando o operador finalmente escolhe o novo ponto. Somente
   as duas bordas da própria rampa permanecem protegidas contra edição. */
(function edicaoBrutaAntesDaRampa134(){
  const P=p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])?
    [+p[0],+p[1]]:null;
  const ring=g=>{
    if(!Array.isArray(g))return null;
    const r=g.filter(P).map(P);
    if(r.length>3&&Math.hypot(r[0][0]-r.at(-1)[0],r[0][1]-r.at(-1)[1])<1e-7)r.pop();
    return r.length>=3?r:null;
  };
  const item=q=>{
    const L=q&&(q.layer||(typeof S!=='undefined'&&(S.layers||[]).find(x=>
      String(x.id)===String(q.layerId)))),f=L&&L.features&&L.features[q.idx];
    return {L,f};
  };
  const rampa=(L,f)=>!L?false:String(f&&f.props&&f.props.CLASSE||'')==='rb31-rampa';
  const linhaRb31=(L,f)=>!!(L&&f&&L._rb31Recipe&&f.props&&
    ['rb31-crista','rb31-pe'].includes(String(f.props.CLASSE||'')));
  const linhaEditavel=(L,f,st)=>!!(L&&f&&st&&st.lays&&L===st.lays.uni&&f.props&&
    ['rb31-crista','rb31-pe'].includes(String(f.props.CLASSE||''))&&ring(f.geom));
  const chave=q=>[+q.banco||0,q.classe||'',q.berma?1:0].join(':');
  const descritor=f=>{const p=f&&f.props||{};return {
    banco:+p.BANCO||0,classe:String(p.CLASSE||''),berma:p.BERMA!=null,
    tipo:String(p.TIPO||'')};};
  const copiaMapa=m=>{
    const out={};
    for(const q of Object.values(m||{}))if(q&&ring(q.geom))out[chave(q)]={
      banco:+q.banco||0,classe:String(q.classe||''),berma:!!q.berma,
      tipo:String(q.tipo||''),geom:ring(q.geom)};
    return out;
  };
  const copiaOmissoes=m=>{
    const out={};
    for(const [k,v] of Object.entries(m||{})){
      if(v===true){out[k]=true;continue;}
      if(!v||!['rb31-crista','rb31-pe'].includes(String(v.classe||'')))continue;
      const q={banco:+v.banco||0,classe:String(v.classe||''),berma:!!v.berma,
        tipo:String(v.tipo||'')};
      out[chave(q)]=q;
    }
    return out;
  };
  const juntaOmissoes=(...ms)=>{
    const out={};for(const m of ms)Object.assign(out,copiaOmissoes(m));return out;
  };
  const receita=st=>st&&st.lays&&st.lays.uni&&st.lays.uni._rb31Recipe;
  /* A geometria fechada depois de Quebrar é uma decisão posterior aos
     snapshots do botão Voltar. Esses snapshots contêm st.feats completo e,
     ao serem reaplicados, traziam de volta o anel anterior apesar de a
     receita já guardar corretamente o trecho novo. Injeta a autoridade
     manual somente quando o banco já existe no estado restaurado; assim
     Voltar ainda pode remover uma bancada inteira, mas nunca desfaz o corte
     consolidado dentro de uma bancada que permanece. */
  const aplicaManuaisNoEstado=(st,mapa)=>{
    if(!st||!Array.isArray(st.feats))return 0;
    let n=0;
    for(const q of Object.values(copiaMapa(mapa))){
      const k=chave(q),f=st.feats.find(x=>x&&x.props&&
        ['rb31-crista','rb31-pe'].includes(String(x.props.CLASSE||''))&&
        chave(descritor(x))===k);
      if(!f)continue;
      const g=ring(q.geom);if(!g)continue;
      const gf=g.map(p=>p.slice());gf.push(gf[0].slice());
      f.geom=gf;f.multi=false;
      /* _geomProjeto não pode continuar apontando para o anel completo:
         Offset/Iteração consultam essa cópia quando ela existe. */
      f._geomProjeto=gf.map(p=>p.slice());
      if(Array.isArray(f.zg)){
        const z=f.zg.find(Number.isFinite),zc=Number.isFinite(z)?z:
          (Number.isFinite(+(f.props&&f.props.COTA))?+(f.props.COTA):0);
        f.zg=gf.map(()=>zc);
      }
      n++;
    }
    return n;
  };
  const grava=st=>{const R=receita(st);if(R){
    R.linhasManuais134=copiaMapa(st._linhasManuais134);
    R.linhasOmitidas134=copiaOmissoes(st._linhasOmitidas134);
  }};
  const estadoDaCamada=L=>{
    let st=(typeof S!=='undefined'&&S)&&S._rb31;
    if(L&&L._rb31Recipe&&(!st||!st.lays||st.lays.uni!==L)&&
      typeof rb31EstadoDaReceita==='function')st=rb31EstadoDaReceita(L)||st;
    return st;
  };
  /* A exclusão é parte da receita, não ausência acidental na camada. O anel
     continua em st.feats para calcular offsets paralelos dos bancos internos;
     somente a sua publicação no mapa permanece suprimida. */
  const registraExclusao=(L,f)=>{
    let mudou=false;
    if(L&&L.cavaDesign&&Number.isFinite(+f?._ringIx)){
      const D=L.cavaDesign,s=new Set((D.omitidos||[]).map(Number));
      s.add(+f._ringIx);D.omitidos=[...s].sort((a,b)=>a-b);
      D.omitidosExplicitos=true;mudou=true;
    }
    if(linhaRb31(L,f)){
      const st=estadoDaCamada(L),q=descritor(f),k=chave(q),
        atuais=juntaOmissoes(L._rb31Recipe.linhasOmitidas134,
          st&&st._linhasOmitidas134);
      atuais[k]=q;
      if(st){st._linhasOmitidas134=atuais;
        st._linhasManuais134=copiaMapa(st._linhasManuais134);
        delete st._linhasManuais134[k];grava(st);
      }else{
        L._rb31Recipe.linhasOmitidas134=atuais;
        const man=copiaMapa(L._rb31Recipe.linhasManuais134);delete man[k];
        L._rb31Recipe.linhasManuais134=man;
      }
      mudou=true;
    }
    return mudou;
  };
  const aplicaOmissoes=st=>{
    const L=st&&st.lays&&st.lays.uni,R=L&&L._rb31Recipe,
      mapa=juntaOmissoes(R&&R.linhasOmitidas134,st&&st._linhasOmitidas134),
      ks=new Set(Object.keys(mapa));
    if(!L||!ks.size)return 0;
    const antes=(L.features||[]).length;
    L.features=(L.features||[]).filter(f=>!linhaRb31(L,f)||!ks.has(chave(descritor(f))));
    const removidas=antes-L.features.length;
    if(removidas){
      try{if(S.selFeat&&S.selFeat.layer===L&&
        !L.features.includes(S.selFeat.f)){S.selFeat=null;clearVertices();}}catch(e){}
      try{drawLayer(L);refreshUI();}catch(e){}
    }
    return removidas;
  };
  const desfazExclusao=(L,f)=>{
    let mudou=false;
    if(L&&L.cavaDesign&&Number.isFinite(+f?._ringIx)){
      const ix=+f._ringIx,D=L.cavaDesign,
        restantes=(D.omitidos||[]).map(Number).filter(x=>x!==ix);
      D.omitidos=restantes.length?restantes:null;
      D.omitidosExplicitos=restantes.length>0;mudou=true;
    }
    if(linhaRb31(L,f)){
      const st=estadoDaCamada(L),k=chave(descritor(f)),
        omit=juntaOmissoes(L._rb31Recipe.linhasOmitidas134,
          st&&st._linhasOmitidas134);
      const havia=Object.prototype.hasOwnProperty.call(omit,k);
      if(havia){
        delete omit[k];L._rb31Recipe.linhasOmitidas134=omit;
        if(st){st._linhasOmitidas134=omit;
          /* Se era uma geometria suavizada, o próprio Ctrl+Z a restaura como
             controle. Uma parte de linha quebrada não cria omissão e, por
             isso, é restaurada apenas pelo undo normal. */
          if(ring(f.geom))registra(st,L,f);else grava(st);
        }
        mudou=true;
      }
    }
    return mudou;
  };
  const registra=(st,L,f)=>{
    if(!linhaEditavel(L,f,st))return false;
    const p=f.props||{},q={banco:+p.BANCO||0,classe:String(p.CLASSE||''),
      berma:p.BERMA!=null,tipo:String(p.TIPO||''),geom:ring(f.geom)};
    st._linhasManuais134=copiaMapa(st._linhasManuais134);
    st._linhasManuais134[chave(q)]=q;
    /* Uma linha fechada manualmente é uma decisão explícita de conservar o
       trecho restante. Ela substitui tanto a forma automática antiga quanto
       uma eventual omissão do mesmo anel. */
    st._linhasOmitidas134=juntaOmissoes(st._linhasOmitidas134,
      L&&L._rb31Recipe&&L._rb31Recipe.linhasOmitidas134);
    delete st._linhasOmitidas134[chave(q)];
    grava(st);return true;
  };
  const esqueceControle=(L,f)=>{
    if(!linhaRb31(L,f))return false;
    const st=estadoDaCamada(L),q=descritor(f),k=chave(q);
    if(st){st._linhasManuais134=copiaMapa(st._linhasManuais134);
      delete st._linhasManuais134[k];
      /* A quebra invalida também a memória curta da Atual 105. Sem isto o
         próximo Gerar ignorava as partes recém-cortadas e reutilizava o anel
         completo anterior, alongando a rampa e alterando a declividade. */
      const u=st._ultimaLinhaEditada105;
      if(u&&chave(u)===k)st._ultimaLinhaEditada105=null;
      if(!q.berma&&+q.banco===+st.banco)delete st._peControle105;
      const R=receita(st);if(R&&R.ultimaLinhaEditada105&&
        chave(R.ultimaLinhaEditada105)===k)R.ultimaLinhaEditada105=null;
      grava(st);
    }else if(L&&L._rb31Recipe){const m=copiaMapa(L._rb31Recipe.linhasManuais134);
      delete m[k];L._rb31Recipe.linhasManuais134=m;
      if(L._rb31Recipe.ultimaLinhaEditada105&&
        chave(L._rb31Recipe.ultimaLinhaEditada105)===k)
        L._rb31Recipe.ultimaLinhaEditada105=null;}
    return true;
  };
  const avisa=()=>{
    const msg='A borda da rampa é calculada e não pode ser arrastada. Clique em “Alterar rampa”, '+
      'ajuste livremente as cristas/pés na cava bruta e depois desenhe a rampa no novo ponto.';
    try{toast(msg);}catch(e){}try{cmdLog(msg,'avisa');}catch(e){}
  };
  window.rb134EhDerivadaProtegida=rampa;

  const vertices0=window.showVertices;
  if(typeof vertices0==='function')window.showVertices=function(){
    const {L,f}=item((typeof S!=='undefined')&&S.selFeat);
    if(!rampa(L,f))return vertices0.apply(this,arguments);
    try{clearVertices();}catch(e){}avisa();return false;
  };
  const apagar0=window.apagarSelecao;
  if(typeof apagar0==='function')window.apagarSelecao=function(q){
    const {L,f}=item(q||((typeof S!=='undefined')&&S.selFeat));
    const qid=f&&f._rb134QuebraId,
      parteQuebrada=!!(qid&&L&&(L.features||[]).some(x=>x!==f&&
        x&&x._rb134QuebraId===qid));
    if(rampa(L,f)){avisa();return false;}
    const r=apagar0.apply(this,arguments);
    if(r&&!Number.isInteger(q&&q.partIdx)){
      if(parteQuebrada){
        /* O apagar da seleção comum recebe cada trecho quebrado como uma
           feição, mas ele ainda é somente uma parte do mesmo pé/crista. */
        esqueceControle(L,f);
      }else if(registraExclusao(L,f))aplicaOmissoes(estadoDaCamada(L));
    }
    return r;
  };

  /* O editor vetorial possui um botão próprio de apagar e não passa por
     apagarSelecao. Registra a mesma decisão quando ele remove a feição. */
  const edApagar0=window.edApagarFeicao;
  if(typeof edApagar0==='function')window.edApagarFeicao=function(){
    const s=typeof ED!=='undefined'&&ED&&ED.sel,L=s&&s.L,f=s&&s.f,
      tinha=!!(L&&f&&(L.features||[]).includes(f)),qid=f&&f._rb134QuebraId,
      parteQuebrada=!!(qid&&L&&(L.features||[]).some(x=>x!==f&&
        x&&x._rb134QuebraId===qid));
    if(rampa(L,f)){avisa();return false;}
    const r=edApagar0.apply(this,arguments);
    if(tinha&&L&&!L.features.includes(f)){
      if(parteQuebrada){
        /* A parte escolhida foi eliminada de uma quebra CAD; não significa
           apagar a crista/pé inteiro. Descarta a memória da forma completa
           antiga e deixa o trecho irmão disponível para ser fechado. */
        esqueceControle(L,f);
      }else if(registraExclusao(L,f))aplicaOmissoes(estadoDaCamada(L));
    }
    return r;
  };

  /* QUEBRAR → APAGAR UMA PARTE → FECHAR é uma única decisão geométrica.
     Marca somente as partes nascidas da mesma quebra, para que a exclusão de
     uma delas não seja confundida com a exclusão de todo o anel paramétrico. */
  const quebrar0=window.edQuebrarEm;
  if(typeof quebrar0==='function')window.edQuebrarEm=function(){
    const s=typeof ED!=='undefined'&&ED&&ED.sel,L=s&&s.L,f=s&&s.f,
      antes=new Set(L&&L.features||[]),ok=quebrar0.apply(this,arguments);
    try{
      if(linhaRb31(L,f)&&L.features.includes(f)){
        const k=chave(descritor(f)),novas=(L.features||[]).filter(x=>
          !antes.has(x)&&linhaRb31(L,x)&&chave(descritor(x))===k);
        if(novas.length){
          const id='rb134-'+Date.now()+'-'+Math.random().toString(36).slice(2);
          f._rb134QuebraId=id;novas.forEach(x=>x._rb134QuebraId=id);
          esqueceControle(L,f);
        }
      }
    }catch(e){console.warn('quebra paramétrica 134',e);}
    return ok;
  };

  const fechar0=window.edFechar;
  if(typeof fechar0==='function')window.edFechar=function(){
    const r=fechar0.apply(this,arguments);
    try{
      const s=typeof ED!=='undefined'&&ED&&ED.sel,L=s&&s.L,f=s&&s.f,
        g=f&&f.geom,fechada=Array.isArray(g)&&g.length>3&&P(g[0])&&P(g.at(-1))&&
          Math.hypot(g[0][0]-g.at(-1)[0],g[0][1]-g.at(-1)[1])<1e-7;
      if(fechada&&linhaRb31(L,f)){
        delete f._rb134QuebraId;
        registra(estadoDaCamada(L),L,f);
        const st=estadoDaCamada(L);if(st)aplicaOmissoes(st);
      }
    }catch(e){console.warn('fecho paramétrico 134',e);}
    return r;
  };

  /* A seleção múltipla também deve respeitar a omissão persistente. */
  const msel0=window.mselDelete;
  if(typeof msel0==='function')window.mselDelete=function(){
    const cand=[];
    try{for(const it of S.msel&&S.msel.items||[]){
      if(Number.isInteger(it.partIdx))continue;
      const L=(S.layers||[]).find(x=>String(x.id)===String(it.layerId)),
        f=L&&L.features&&L.features[it.idx];if(L&&f)cand.push({L,f});
    }}catch(e){}
    const r=msel0.apply(this,arguments),sts=new Set();
    for(const q of cand)if(!q.L.features.includes(q.f)){
      const id=q.f&&q.f._rb134QuebraId,
        parte=!!(id&&(q.L.features||[]).some(x=>x&&x._rb134QuebraId===id));
      if(parte)esqueceControle(q.L,q.f);
      else if(registraExclusao(q.L,q.f)){
        const st=estadoDaCamada(q.L);if(st)sts.add(st);
      }
    }
    sts.forEach(aplicaOmissoes);return r;
  };

  /* Uma crista/pé inteira apagada é uma decisão da receita e não deve ser
     ressuscitada pelo Ctrl+Z. Essas exclusões ficam fora da volta operacional;
     o atalho volta a última etapa CONSTRUTIVA (ou o próximo undo comum).
     Partes nascidas de Quebrar continuam no undo normal e voltam exatamente
     como trecho, pois não criam omissão do anel inteiro. */
  const undo0=window.doUndo;
  if(typeof undo0==='function')window.doUndo=function(){
    /* Um traçado ainda aberto não entrou em nenhuma pilha: mantém a prioridade
       nativa de retirar o último vértice antes de consultar os históricos. */
    if(typeof S!=='undefined'&&S&&['line','poly'].includes(S.tool)&&
       Array.isArray(S.drawBuf)&&S.drawBuf.length)
      return undo0.apply(this,arguments);
    const pilha=(typeof S!=='undefined'&&Array.isArray(S.undo))?S.undo:null;
    let pulou=false;
    if(pilha)while(pilha.length){
      const a=pilha.at(-1),L=a&&a.L,
        fs=a&&a.t==='featdel'?[a.feat]:
          (a&&['mselmixdel','mseldel'].includes(a.t)?
            (a.ops||a.rem||[]).filter(q=>q.whole!==false).map(q=>q.before||q.feat):[]),
        persistente=fs.some(f=>{
          if(!linhaRb31(L,f)||f._rb134QuebraId)return false;
          const st=estadoDaCamada(L),m=juntaOmissoes(L._rb31Recipe&&
            L._rb31Recipe.linhasOmitidas134,st&&st._linhasOmitidas134);
          return Object.prototype.hasOwnProperty.call(m,chave(descritor(f)));
        });
      if(!persistente)break;
      pilha.pop();pulou=true;
    }
    /* S.undo (CAD/camadas) e _acoesVoltar132 (cava) são pilhas distintas.
       Decide pela ordem global gravada em cada ação. Assim uma camada apagada
       só reaparece depois de desfazer todos os desenhos e ajustes posteriores.
       Projetos antigos, sem ordem, conservam o comportamento anterior. */
    try{
      const st=(typeof S!=='undefined'&&S)&&S._rb31,
        pa=st&&Array.isArray(st._acoesVoltar132)&&st._acoesVoltar132.at(-1),
        ga=pilha&&pilha.at(-1),
        po=Number(pa&&(pa.ord??pa.ts))||0,
        go=Number(ga&&(ga._undoOrd??ga._ts??ga.ts))||0;
      if(st&&+st.banco>0&&typeof rb31Voltar==='function'&&
         (pulou||(pa&&po>0&&(go===0||po>=go))))return rb31Voltar();
    }catch(e){}
    return undo0.apply(this,arguments);
  };

  /* Guarda cada crista/pé editado — não apenas a última linha — para que
     várias quinas possam ser suavizadas antes de inserir a rampa. */
  const pos0=window.rb31PosEdicao;
  if(typeof pos0==='function')window.rb31PosEdicao=function(L,f){
    const r=pos0.apply(this,arguments);
    try{
      let st=(typeof S!=='undefined'&&S)&&S._rb31;
      if(L&&L._rb31Recipe&&(!st||!st.lays||st.lays.uni!==L)&&
        typeof rb31EstadoDaReceita==='function')st=rb31EstadoDaReceita(L)||st;
      if(registra(st,L,f)&&st._edicaoBruta134){
        const info=document.getElementById('rb31Info');
        if(info)info.textContent='Crista/pé suavizado e preservado. A rampa continua ausente; '+
          'faça os demais ajustes e depois clique em “Desenhar rampa no ponto”.';
      }
    }catch(e){console.warn('linha manual 134',e);}
    return r;
  };

  const estado0=window.rb31EstadoDaReceita;
  if(typeof estado0==='function')window.rb31EstadoDaReceita=function(alvo){
    const st=estado0.apply(this,arguments),R=receita(st);
    if(st&&R){st._linhasManuais134=copiaMapa(R.linhasManuais134);
      st._linhasOmitidas134=juntaOmissoes(R.linhasOmitidas134,
        st._linhasOmitidas134);}
    return st;
  };

  /* rb31Desenha substitui a camada inteira e regrava a receita. Conserva as
     omissões através dessa troca, filtra apenas a saída visual e mantém os
     anéis calculados em st.feats — condição necessária para o paralelismo. */
  const desenha0=window.rb31Desenha;
  if(typeof desenha0==='function')window.rb31Desenha=function(st){
    const L0=st&&st.lays&&st.lays.uni,R0=L0&&L0._rb31Recipe,
      omit=juntaOmissoes(R0&&R0.linhasOmitidas134,st&&st._linhasOmitidas134),
      /* Se a receita possui o campo, inclusive vazio, ela é mais nova que
         qualquer snapshot de Voltar. O fallback atende projetos antigos. */
      man=R0&&Object.prototype.hasOwnProperty.call(R0,'linhasManuais134')?
        copiaMapa(R0.linhasManuais134):copiaMapa(st&&st._linhasManuais134);
    if(st){st._linhasManuais134=man;aplicaManuaisNoEstado(st,man);}
    const r=desenha0.apply(this,arguments);
    try{if(st){st._linhasManuais134=man;st._linhasOmitidas134=omit;
      grava(st);aplicaOmissoes(st);}}
    catch(e){console.warn('omissões paramétricas 134',e);}
    return r;
  };

  /* HIERARQUIA PARAMÉTRICA COM EXCEÇÕES EXPLÍCITAS: mover o limite recalcula
     toda linha que ainda é derivada. Uma crista/pé que o operador já editou,
     porém, passa a ser uma linha de controle e não pode voltar à geometria
     automática anterior. O replay abaixo já sabe reinjetar essas geometrias
     no banco correspondente; aqui apenas conservamos o mapa persistente. */
  const live0=window.rb31LiveSync;
  if(typeof live0==='function')window.rb31LiveSync=function(op){
    try{
      const Led=op&&op.sourceLayer;
      if(Led){
        const afetadas=(typeof S!=='undefined'&&S&&S.layers||[]).filter(L=>L&&L._rb31Recipe&&
          String(L._rb31Recipe.srcLayerId)===String(Led.id));
        if(afetadas.length){
          for(const L of afetadas){
            L._rb31Recipe.linhasManuais134=copiaMapa(
              L._rb31Recipe.linhasManuais134);
          }
          let st=(typeof S!=='undefined'&&S)&&S._rb31;
          const U=afetadas.find(L=>!st||!st.lays||st.lays.uni===L)||afetadas[0];
          if(U&&(!st||!st.lays||st.lays.uni!==U)&&typeof rb31EstadoDaReceita==='function')
            st=rb31EstadoDaReceita(U)||st;
          if(st){
            /* O núcleo executa o replay a partir de S._rb31. Depois de
               salvar/reabrir, esse objeto podia continuar ligado à camada
               antiga, ainda que U já fosse a receita que contém as linhas
               desenhadas posteriormente. */
            if(U&&st.lays&&st.lays.uni===U&&typeof S!=='undefined')S._rb31=st;
            st._linhasManuais134=copiaMapa(
              (U&&U._rb31Recipe.linhasManuais134)||st._linhasManuais134);
            grava(st);
          }
        }
      }
    }catch(e){console.warn('controles manuais do limite paramétrico',e);}
    return live0.apply(this,arguments);
  };

  /* Durante o replay integral, injeta a linha manual exatamente no banco
     correspondente. A partida controla a crista/pé que recebe a rampa; a
     chegada usa o mesmo controle de pé já aceito pelo núcleo geométrico. */
  const gerar0=window.rb31Gerar;
  if(typeof gerar0==='function')window.rb31Gerar=function(){
    const st=typeof rb31Estado==='function'?rb31Estado():((typeof S!=='undefined'&&S)&&S._rb31),
      mapa=copiaMapa(window.__rb134ManualReplay||(st&&st._linhasManuais134)),k=(+(st&&st.banco)||0)+1,
      partida=Object.values(mapa).find(q=>q.berma&&+q.banco===k-1),
      chegada=Object.values(mapa).find(q=>!q.berma&&+q.banco===k);
    if(st&&partida){
      st.crista=ring(partida.geom);
      st._ultimaLinhaEditada105={...partida,geom:ring(partida.geom)};
      const f=(st.feats||[]).find(x=>{const p=x.props||{};return +p.BANCO===k-1&&
        p.BERMA!=null&&['rb31-crista','rb31-pe'].includes(String(p.CLASSE||''));});
      if(f){f.geom=ring(partida.geom);f.geom.push(f.geom[0].slice());
        if(Array.isArray(f.zg)){const z=f.zg[0]||+(f.props&&f.props.COTA)||0;f.zg=f.geom.map(()=>z);}}
    }
    if(st&&chegada)st._peControle105=ring(chegada.geom);
    try{return gerar0.apply(this,arguments);}
    finally{if(st)delete st._peControle105;}
  };

  const replay0=window.rb31Replay;
  if(typeof replay0==='function')window.rb31Replay=function(){
    const st=(typeof S!=='undefined'&&S)&&S._rb31,
      mapa=copiaMapa((st&&st._linhasManuais134)||(receita(st)&&receita(st).linhasManuais134)),
      omit=juntaOmissoes(receita(st)&&receita(st).linhasOmitidas134,
        st&&st._linhasOmitidas134);
    window.__rb134ManualReplay=mapa;
    try{return replay0.apply(this,arguments);}
    finally{
      const sf=(typeof S!=='undefined'&&S)&&S._rb31;
      if(sf){sf._linhasManuais134=copiaMapa(mapa);sf._linhasOmitidas134=omit;
        grava(sf);aplicaOmissoes(sf);}
      delete window.__rb134ManualReplay;
    }
  };
})();
