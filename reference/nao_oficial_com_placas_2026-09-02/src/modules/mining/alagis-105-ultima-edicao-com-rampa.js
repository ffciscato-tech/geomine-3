
/* Atual 105 — base integral: Atual 102, inclusive dentes, crista preta e
   pé laranja. Única responsabilidade deste bloco:
   1) offset/iteração usam a ÚLTIMA linha de crista ou pé editada;
   2) a origem longitudinal da rampa não muda ao apagar/reordenar vértices;
   3) a origem é encaixada na linha nova, evitando ficar solta e ser recusada;
   4) toda nova bancada pede uma rampa (modo sem-rampa desativado).
   Nenhuma feição existente é suavizada, deslocada, limpa ou reestilizada. */
(function ultimaEdicaoComRampa105(){
  const P=p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])?
    [+p[0],+p[1]]:null;
  const ring=g=>{
    if(!Array.isArray(g))return null;
    const r=g.filter(p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1]))
      .map(p=>[+p[0],+p[1]]);
    if(r.length>3&&Math.hypot(r[0][0]-r[r.length-1][0],r[0][1]-r[r.length-1][1])<1e-7)r.pop();
    return r.length>=3?r:null;
  };
  const linha=g=>{
    if(!Array.isArray(g))return null;
    const r=g.filter(p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1]))
      .map(p=>[+p[0],+p[1]]);
    return r.length>=2?r:null;
  };
  const dist=(a,b)=>a&&b?Math.hypot(a[0]-b[0],a[1]-b[1]):Infinity;
  const fechada=g=>{
    const r=linha(g);return !!(r&&r.length>3&&dist(r[0],r.at(-1))<1e-7);
  };
  const papelOk=(q,papel)=>papel==='partida'?!!q.berma:!q.berma;
  const desc=f=>{const p=f&&f.props||{};return {banco:+p.BANCO||0,
    classe:String(p.CLASSE||''),berma:p.BERMA!=null};};
  /* O editor CAD divide um anel fechado em duas linhas abertas com o mesmo
     identificador. Para continuar a rampa depois de Cortar/Quebrar, junta
     exclusivamente essas partes VIVAS pelos extremos coincidentes. Não usa
     a diagonal implícita de um fragmento isolado e não ressuscita a antiga
     _geomProjeto que o operador já cortou. */
  const juntaQuebra=fs=>{
    const partes=(fs||[]).map(f=>linha(f&&f.geom)).filter(Boolean);
    if(partes.length<2)return null;
    const tol=1e-6,usadas=new Set([0]),out=partes[0].map(p=>p.slice());
    while(usadas.size<partes.length){
      let achou=false;
      for(let i=0;i<partes.length&&!achou;i++)if(!usadas.has(i)){
        const p=partes[i],a=out[0],b=out.at(-1),c=p[0],d=p.at(-1);
        if(dist(b,c)<=tol){out.push(...p.slice(1).map(q=>q.slice()));achou=true;}
        else if(dist(b,d)<=tol){out.push(...p.slice(0,-1).reverse().map(q=>q.slice()));achou=true;}
        else if(dist(a,d)<=tol){out.unshift(...p.slice(0,-1).map(q=>q.slice()));achou=true;}
        else if(dist(a,c)<=tol){out.unshift(...p.slice(1).reverse().map(q=>q.slice()));achou=true;}
        if(achou)usadas.add(i);
      }
      if(!achou)return null;
    }
    if(out.length<4||dist(out[0],out.at(-1))>tol)return null;
    out.pop();return out.length>=3?out:null;
  };
  const proj=(R,p)=>{
    R=ring(R);p=P(p);if(!R||!p)return null;
    let total=0,best=null;
    const seg=[];
    for(let i=0;i<R.length;i++){
      const a=R[i],b=R[(i+1)%R.length],L=Math.hypot(b[0]-a[0],b[1]-a[1]);
      seg.push({a,b,L,s:total});total+=L;
    }
    for(const e of seg){
      const dx=e.b[0]-e.a[0],dy=e.b[1]-e.a[1],L2=dx*dx+dy*dy||1;
      let t=((p[0]-e.a[0])*dx+(p[1]-e.a[1])*dy)/L2;t=Math.max(0,Math.min(1,t));
      const q=[e.a[0]+t*dx,e.a[1]+t*dy],d=Math.hypot(p[0]-q[0],p[1]-q[1]);
      if(!best||d<best.d)best={p:q,d,s:e.s+t*e.L,total,tan:e.L>1e-9?[dx/e.L,dy/e.L]:[1,0]};
    }
    return best;
  };
  const at=(R,s)=>{
    R=ring(R);if(!R)return null;
    let total=0,Ls=[];
    for(let i=0;i<R.length;i++){const a=R[i],b=R[(i+1)%R.length],L=Math.hypot(b[0]-a[0],b[1]-a[1]);Ls.push(L);total+=L;}
    if(total<1e-9)return R[0].slice();
    s=((s%total)+total)%total;
    let acc=0;
    for(let i=0;i<R.length;i++){
      const L=Ls[i];if(s<=acc+L||i===R.length-1){const a=R[i],b=R[(i+1)%R.length],t=L?(s-acc)/L:0;return[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];}acc+=L;
    }
    return R[0].slice();
  };
  const copiaO=o=>o?{A:P(o.A),B:P(o.B),usaProx:!!o.usaProx,banco:+o.banco||null}:null;
  const captura=(st)=>{
    if(!st||!(st.banco>0))return null;
    const usa=!!(st.proxIniA&&st.proxIniB),A=P(usa?st.proxIniA:st.pFim),B=P(usa?st.proxIniB:st.pFimB);
    if(!A)return st._origemRampa105||null;
    return st._origemRampa105={A,B,usaProx:usa,banco:+st.banco+1};
  };
  const remapeia=(R,o,W)=>{
    R=ring(R);o=copiaO(o);if(!R||!o||!o.A)return null;
    const a=proj(R,o.A);if(!a)return null;
    const largura=Math.max(.2,Math.abs(+W||0)),v=o.B?[o.B[0]-o.A[0],o.B[1]-o.A[1]]:null;
    let sinal=1;
    if(v){
      const pf=at(R,a.s+largura),pb=at(R,a.s-largura),
        df=(pf[0]-a.p[0])*v[0]+(pf[1]-a.p[1])*v[1],
        db=(pb[0]-a.p[0])*v[0]+(pb[1]-a.p[1])*v[1];
      sinal=df>=db?1:-1;
    }
    return {A:a.p.slice(),B:at(R,a.s+sinal*largura),usaProx:o.usaProx,banco:o.banco,s:a.s};
  };
  const aplica=(st,o)=>{
    if(!st||!o||!o.A)return false;
    if(o.usaProx){st.proxIniA=o.A.slice();st.proxIniB=o.B?o.B.slice():null;}
    else{st.pFim=o.A.slice();st.pFimB=o.B?o.B.slice():null;}
    return true;
  };
  const grava=(st)=>{
    try{
      const L=st&&st.lays&&st.lays.uni;
      if(!L||!L._rb31Recipe)return;
      L._rb31Recipe.origemRampa105=copiaO(st._origemRampa105);
      const u=st._ultimaLinhaEditada105;
      L._rb31Recipe.ultimaLinhaEditada105=u?{banco:u.banco,classe:u.classe,
        berma:!!u.berma,geom:ring(u.geom)}:null;
    }catch(e){}
  };
  const registra=(st,f)=>{
    if(!st||!f||!f.props||!(st.banco>0))return false;
    const cl=String(f.props.CLASSE||'');if(cl!=='rb31-crista'&&cl!=='rb31-pe')return false;
    const R=ring(f._geomProjeto||f.geom),b=+f.props.BANCO||0,berma=f.props.BERMA!=null,
      chegada=(b>=1&&!berma),partida=(berma&&b>=0),limitePrimeiro=(b===0&&!berma),
      bancoAfetado=partida?b+1:(limitePrimeiro?1:b);
    if(!R||(!chegada&&!partida&&!limitePrimeiro)||bancoAfetado<1||bancoAfetado>+st.banco+1)return false;
    st._ultimaLinhaEditada105={banco:b,classe:cl,berma,
      geom:R.map(p=>p.slice()),tipo:String(f.props.TIPO||'')};
    if(chegada&&b===+st.banco){
      st.pe=R.map(p=>p.slice());st.peNatural=R.map(p=>p.slice());
      st.peBerma=R.map(p=>p.slice());
    }
    else if(partida&&b===+st.banco)st.crista=R.map(p=>p.slice());
    grava(st);return true;
  };
  const atual=(st,papel)=>{
    if(!st)return null;
    const banco=+st.banco,
      manual=Object.values(st._linhasManuais134||{}).filter(q=>q&&+q.banco===banco&&
        ['rb31-crista','rb31-pe'].includes(String(q.classe||''))&&papelOk(q,papel)&&ring(q.geom));
    /* Uma linha fechada manualmente depois da quebra é a autoridade máxima. */
    if(manual.length)return ring(manual.at(-1).geom);
    const u=st._ultimaLinhaEditada105;
    if(u&&+u.banco===banco&&papelOk(u,papel)&&ring(u.geom))return ring(u.geom);
    const escolhe=F=>{
      const candidatas=(F||[]).filter(f=>{
        const q=desc(f);return q.banco===banco&&
          ['rb31-crista','rb31-pe'].includes(q.classe)&&papelOk(q,papel);
      });
      if(!candidatas.length)return {tem:false,anel:null};
      /* Se a linha foi quebrada, todas as partes do mesmo corte formam um
         único controlador. A ordem na camada não pode escolher só uma. */
      const ids=[...new Set(candidatas.map(f=>f&&f._rb134QuebraId).filter(Boolean))];
      for(let i=ids.length-1;i>=0;i--){
        const g=juntaQuebra(candidatas.filter(f=>f._rb134QuebraId===ids[i]));
        if(g)return {tem:true,anel:g};
      }
      /* Geometria viva fechada. Nunca prefere _geomProjeto quando geom foi
         cortada/editada: aquela cópia é apenas o desenho bruto anterior. */
      const fechados=candidatas.filter(f=>fechada(f&&f.geom));
      if(fechados.length)return {tem:true,anel:ring(fechados.at(-1).geom)};
      return {tem:true,anel:null};
    };
    const L=st.lays&&st.lays.uni,vivo=escolhe(L&&L.features);
    if(vivo.anel)return vivo.anel;
    /* Havendo fragmentos vivos ainda abertos, não cai na memória antiga. */
    if(vivo.tem)return null;
    const calculado=escolhe(st.feats||[]);
    return calculado.anel;
  };

  /* EDIÇÃO PARAMÉTRICA EM CASCATA. A linha editada é controle geométrico da
     bancada ligada; todas as bancadas posteriores são refeitas com os
     parâmetros que possuíam. */
  let timerAuto=null;
  const autoAjusta=(st,u)=>{
    if(!st||st!==S._rb31||!u||!(st.banco>0))return false;
    const total=+st.banco,b=+u.banco,n=u.berma?b+1:(b===0?1:b),
      saida=!u.berma&&b>=1,entrada=!saida;
    /* A última berma é a partida ainda sem bancada posterior. */
    if(n>total){if(b===total&&u.berma)st.crista=ring(u.geom);grava(st);return true;}
    const F=st.feats||[],anel=f=>ring(f&&(f._geomProjeto||f.geom)),
      inicio=entrada?ring(u.geom):anel(n===1?
        F.find(f=>f&&f.props&&+f.props.BANCO===0&&
          (f.props.CLASSE==='rb31-crista'||f.props.CLASSE==='rb31-pe')):
        F.filter(f=>f&&f.props&&+f.props.BANCO===n-1&&f.props.BERMA!=null&&
          (f.props.CLASSE==='rb31-crista'||f.props.CLASSE==='rb31-pe')).pop()),
      fInicio=n===1?F.find(f=>f&&f.props&&+f.props.BANCO===0):
        F.filter(f=>f&&f.props&&+f.props.BANCO===n-1&&f.props.BERMA!=null).pop();
    if(!inicio)return false;
    const ramps=F.filter(f=>f&&f.props&&+f.props.BANCO===n&&f.props.CLASSE==='rb31-rampa'),
      ext=ramps.find(f=>/externa/i.test(String(f.props.TIPO||'')))||ramps[0],
      int=ramps.find(f=>/interna/i.test(String(f.props.TIPO||'')))||ramps[1],
      ge=anel(ext),gi=anel(int),histPlano=(st.hist||[]).map(h=>({...h,
        startP:P(h&&h.startP)})),paramPlano=(st.paramBancos||[]).map(q=>({...q})),
      faseAntes=st.fase,snap=typeof rb31Snap==='function'?rb31Snap(st):null,
      zInicio=Number.isFinite(+(fInicio&&fInicio.props&&fInicio.props.COTA))?
        +(fInicio.props.COTA):((st.paramBancos&&st.paramBancos[n-1]&&
          +st.paramBancos[n-1].zCrista)||+st.z||0);
    const set=(id,v)=>{const e=document.getElementById(id);if(e&&v!=null&&v===v)e.value=v;},
      aplicaParam=k=>{const q=paramPlano[k-1]||{};
        set('rb31Ang',q.ang);set('rb31H',q.H);set('rb31B',q.B);set('rb31W',q.W);
        set('rb31G',q.grade);set('rb31Dir',q.dir);};
    try{
      st.feats=F.filter(f=>!f||!f.props||+f.props.BANCO<n);
      st.hist=(st.hist||[]).slice(0,n-1);
      st.paramBancos=(st.paramBancos||[]).slice(0,n-1);
      st.eixos=(st.eixos||[]).slice(0,n-1);
      st.banco=n-1;st.fase='crista';st.crista=inicio.map(p=>p.slice());st.z=zInicio;
      st.pe=null;st.peNatural=null;st.peBerma=null;st.ultimaRampaA=null;
      st.ultimaRampaB=null;st.zPe=null;
      if(n===1){
        const h0=histPlano[0]||{};
        st.startP=h0.startP?h0.startP.slice():(ge&&ge[0]?ge[0].slice():st.startP);
        st.proxIniA=null;st.proxIniB=null;
      }else if(ge&&ge.length){
        const A=ge[0].slice(),B=gi&&gi.length?gi[0].slice():null;
        st.proxIniA=A;st.proxIniB=B;st.pFim=A.slice();st.pFimB=B&&B.slice();
        st._origemRampa105={A:A.slice(),B:B&&B.slice(),usaProx:true,banco:n};
      }
      st._ultimaLinhaEditada105=entrada?{...u,geom:inicio.map(p=>p.slice())}:null;
      st._peControle105=saida?ring(u.geom):null;
      for(let k=n;k<=total;k++){
        aplicaParam(k);
        const hk=histPlano[k-1]||{};
        if(k>n&&!hk.degrau&&hk.startP)st.novoInicioP=hk.startP.slice();
        if(typeof rb31Gerar!=='function'||!rb31Gerar(true))
          throw new Error('regeneração da rampa '+k);
        delete st._peControle105;
        if(k<total||faseAntes==='crista'){
          if(typeof rb31OffsetBerma!=='function'||!rb31OffsetBerma(true))
            throw new Error('regeneração da berma '+k);
        }
      }
      const info=document.getElementById('rb31Info');
      if(info)info.innerHTML='Cava paramétrica atualizada da bancada <b>'+n+'</b> até a <b>'+total+
        '</b>: cristas, pés e rampas recalculados · declividade e face preservadas.';
      try{
        const L=st.lays&&st.lays.uni,idx=L&&L.features?L.features.findIndex(f=>
          String((f.props||{}).TIPO||'')===String(u.tipo||'')):-1;
        if(idx>=0&&S.selFeat&&S.selFeat.layer===L){S.selFeat.idx=idx;S.selFeat.f=L.features[idx];
          S._vtxSelPreserve=true;if(typeof showVertices==='function')showVertices();}
      }catch(e){}
      grava(st);return true;
    }catch(e){
      try{if(snap&&typeof rb31AplicaSnap==='function')rb31AplicaSnap(st,snap);delete st._peControle105;rb31Desenha(st);}catch(_){ }
      try{toast('A linha foi mantida, mas a atualização automática da rampa precisa de nova tentativa');}catch(_){ }
      return false;
    }
  };
  const agendaAuto=(st,f)=>{
    const u=st&&st._ultimaLinhaEditada105;
    if(!u)return;
    const copia={...u,geom:ring(u.geom)};
    clearTimeout(timerAuto);
    const dispara=()=>{
      if(typeof S!=='undefined'&&S&&S._vtxDragging){timerAuto=setTimeout(dispara,180);return;}
      autoAjusta(st,copia);
    };
    timerAuto=setTimeout(dispara,180);
  };

  window.rb31CapturaOrigem105=captura;

  const emp0=window.rb31EmpilhaEdicao;
  if(typeof emp0==='function')window.rb31EmpilhaEdicao=function(L,f){
    try{
      let st=typeof S!=='undefined'&&S?S._rb31:null;
      if(L&&L._rb31Recipe&&(!st||!st.lays||st.lays.uni!==L)&&typeof rb31EstadoDaReceita==='function')
        st=rb31EstadoDaReceita(L);
      captura(st);
    }catch(e){}
    return emp0.apply(this,arguments);
  };
  const pos0=window.rb31PosEdicao;
  if(typeof pos0==='function')window.rb31PosEdicao=function(L,f){
    const r=pos0.apply(this,arguments);
    try{
      let st=typeof S!=='undefined'&&S?S._rb31:null;
      if(L&&L._rb31Recipe&&(!st||!st.lays||st.lays.uni!==L)&&typeof rb31EstadoDaReceita==='function')
        st=rb31EstadoDaReceita(L);
      if(registra(st,f)){
        /* MODO CAVA BRUTA (Atual 134): a crista/pé está sendo preparada
           para RECEBER a rampa. A edição deve permanecer literal; não
           redesenha corredor algum até o operador escolher o novo ponto. */
        if(st&&(st._edicaoBruta134||st.rampaPausada133||st.semRampa)){
          grava(st);
          const info=document.getElementById('rb31Info');
          if(info)info.textContent='Linha ajustada e mantida na cava bruta. '+
            'A rampa continua ausente até você clicar em “Desenhar rampa no ponto”.';
        }else agendaAuto(st,f);
      }
    }catch(e){}
    return r;
  };

  const sync0=window.rb31SincronizaCrista;
  if(typeof sync0==='function')window.rb31SincronizaCrista=function(st){
    if(st&&st.banco>0){const R=atual(st,'partida');if(R)st.crista=R.map(p=>p.slice());return;}
    return sync0.apply(this,arguments);
  };

  const off0=window.rb31OffsetBerma;
  if(typeof off0==='function')window.rb31OffsetBerma=function(sil){
    const st=typeof rb31Estado==='function'?rb31Estado():(typeof S!=='undefined'&&S?S._rb31:null);
    try{
      captura(st);
      if(st&&st.fase==='pe'){
        const R=atual(st,'chegada');if(R)st.pe=R.map(p=>p.slice());
      }
    }catch(e){}
    const ok=off0.apply(this,arguments);
    try{if(ok){/* conserva a origem longitudinal anterior ao offset */grava(st);}}catch(e){}
    return ok;
  };

  const ger0=window.rb31Gerar;
  if(typeof ger0==='function')window.rb31Gerar=function(sil){
    const st=typeof rb31Estado==='function'?rb31Estado():(typeof S!=='undefined'&&S?S._rb31:null);
    try{
      /* Regra solicitada: uma iteração nunca herda banco sem rampa. */
      if(st){st.semRampa=false;st.semRampaAte=0;st._semEste=false;}
      if(st&&st.banco>0&&!st.novoInicioP&&!st.novoSoleira){
        const R=atual(st,'partida');if(R)st.crista=R.map(p=>p.slice());
        const W=+((document.getElementById('rb31W')||{}).value||0),
          fila=window.__rb31OrigensReplay105,
          origem=(Array.isArray(fila)&&fila[st.banco])?fila[st.banco]:(st._origemRampa105||captura(st)),
          /* A Atual 106 já transportou este par pelo MESMO offset que criou
             a nova crista. Remapeá-lo outra vez por distância global anulava
             essa proteção e, num gargalo, saltava a boca para o ramo vizinho. */
          jaTransportada=!!(origem&&origem.usaProx&&st.proxIniA&&st.proxIniB),
          encaixada=jaTransportada?null:remapeia(st.crista,origem,W);
        if(encaixada){aplica(st,encaixada);st._origemRampa105=copiaO(origem);}
      }
    }catch(e){console.warn('origem da rampa 105',e);}
    const ok=ger0.apply(this,arguments);
    try{if(ok&&st){st._origemRampa105=null;st._ultimaLinhaEditada105=null;grava(st);}}catch(e){}
    return ok;
  };

  const rec0=window.rb31EstadoDaReceita;
  if(typeof rec0==='function')window.rb31EstadoDaReceita=function(alvo){
    const st=rec0.apply(this,arguments);
    try{
      const L=alvo||(st&&st.lays&&st.lays.uni),r=L&&L._rb31Recipe;
      if(st&&r&&r.origemRampa105)st._origemRampa105=copiaO(r.origemRampa105);
      if(st&&r&&r.ultimaLinhaEditada105&&ring(r.ultimaLinhaEditada105.geom)){
        st._ultimaLinhaEditada105={...r.ultimaLinhaEditada105,geom:ring(r.ultimaLinhaEditada105.geom)};
        const u=st._ultimaLinhaEditada105;
        if(u.berma&&+u.banco===+st.banco)st.crista=ring(u.geom);
        else if(!u.berma&&+u.banco===+st.banco){
          st.pe=ring(u.geom);st.peNatural=ring(u.geom);st.peBerma=ring(u.geom);
        }
      }
    }catch(e){}
    return st;
  };

  /* Reabrir o painel não gera nem desfaz nada: apenas religa o estado
     operacional salvo. A última linha editada já foi aplicada acima e será a
     autoridade da próxima ação. */
  window.rb31RetomaAoAbrir=function(){
    try{
      let st=typeof S!=='undefined'&&S?S._rb31:null,L=st&&st.lays&&st.lays.uni;
      const layers=(S&&S.layers)||[],ativa=layers.find(x=>String(x.id)===String(S.activeId)),
        sel=S.selFeat&&S.selFeat.layer,
        receitas=layers.filter(x=>x&&x._rb31Recipe&&+x._rb31Recipe.banco>0);
      if(!(st&&st.banco>0&&(st.fase==='pe'?ring(st.pe):ring(st.crista)))){
        L=(sel&&sel._rb31Recipe?sel:null)||(ativa&&ativa._rb31Recipe?ativa:null)||
          receitas.find(x=>ativa&&String(x._rb31Recipe.srcLayerId)===String(ativa.id))||
          receitas[receitas.length-1]||null;
        if(L&&typeof rb31EstadoDaReceita==='function')st=rb31EstadoDaReceita(L);
      }
      if(!st||!(st.banco>0))return false;
      const info=document.getElementById('rb31Info'),qual=st._ultimaLinhaEditada105?' editada':'',
        acao=st.fase==='pe'?'a berma/iteração seguirá deste pé':'a próxima rampa seguirá desta crista';
      if(info)info.innerHTML='Projeto retomado na bancada <b>'+st.banco+'</b>: linha'+qual+
        ' preservada; '+acao+'.';
      return true;
    }catch(e){return false;}
  };

  const replay0=window.rb31Replay;
  if(typeof replay0==='function')window.rb31Replay=function(){
    const st=typeof S!=='undefined'&&S?S._rb31:null,
      hist=st&&((Array.isArray(st._histAlvo)&&st._histAlvo.length>(st.hist||[]).length)?st._histAlvo:st.hist)||[];
    const fila=hist.map((h,i)=>{
      if(!h||!h.startP)return null;
      const b=i+1,ram=(st.feats||[]).filter(f=>f&&f.props&&+f.props.BANCO===b&&f.props.CLASSE==='rb31-rampa'),
        inte=ram.find(f=>/interna/i.test(String(f.props.TIPO||'')))||ram[1];
      return {A:P(h.startP),B:P(inte&&inte.geom&&inte.geom[0]),usaProx:false,banco:b};
    });
    window.__rb31OrigensReplay105=fila;
    try{return replay0.apply(this,arguments);}
    finally{delete window.__rb31OrigensReplay105;}
  };
})();
