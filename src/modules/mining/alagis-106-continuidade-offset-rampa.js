
/* Atual 106 — correção pontual da continuidade entre trechos.
   A chegada da rampa N é transportada pelo MESMO offset CAD que cria a
   linha de partida N+1. Assim não existe uma nova busca global pelo ponto
   mais próximo (que, em anéis estreitos, podia saltar para outro ramo a
   partir do 4º trecho). A Atual 105 continua responsável pela última linha
   editada e pela obrigatoriedade de rampa. */
(function continuidadeOffsetRampa106(){
  const P=p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])?[+p[0],+p[1]]:null;
  const R0=g=>{
    if(!Array.isArray(g))return null;
    const r=g.filter(p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])).map(p=>[+p[0],+p[1]]);
    if(r.length>3&&Math.hypot(r[0][0]-r[r.length-1][0],r[0][1]-r[r.length-1][1])<1e-7)r.pop();
    return r.length>=3?r:null;
  };
  const cadeia=R=>{
    R=R0(R);if(!R)return null;
    let total=0;const seg=[];
    for(let i=0;i<R.length;i++){
      const a=R[i],b=R[(i+1)%R.length],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);
      seg.push({a,b,dx,dy,L,s:total});total+=L;
    }
    return {R,seg,total};
  };
  const noArco=(C,s)=>{
    if(!C||C.total<1e-9)return C&&C.R[0]&&C.R[0].slice();
    s=((s%C.total)+C.total)%C.total;
    for(let i=0;i<C.seg.length;i++){
      const e=C.seg[i];if(s<=e.s+e.L||i===C.seg.length-1){const t=e.L?(s-e.s)/e.L:0;return[e.a[0]+t*e.dx,e.a[1]+t*e.dy];}
    }
    return C.R[0].slice();
  };
  /* Ponto sobre a própria crista cuja CORDA até A mede exatamente W.
     Somar W ao arco encurta a boca nas curvas (10 m viravam 8,39 m no
     projeto real). Marcha em passos curtos e resolve a primeira passagem
     pelo círculo de raio W por bisseção. */
  const noCorda=(C,s0,sg,W)=>{
    const A=noArco(C,s0),passo=Math.max(.05,Math.min(.25,W/40)),
      limite=Math.min(C.total*.45,Math.max(4*W,W+2)),d=p=>Math.hypot(p[0]-A[0],p[1]-A[1]);
    let u0=0,p0=A,d0=0;
    for(let u=passo;u<=limite+passo*.5;u+=passo){
      const p=noArco(C,s0+sg*u),du=d(p);
      if(du>=W-1e-9&&d0<W){
        let lo=u0,hi=u;
        for(let k=0;k<40;k++){
          const m=(lo+hi)/2,q=noArco(C,s0+sg*m);
          if(d(q)<W)lo=m;else hi=m;
        }
        return noArco(C,s0+sg*(lo+hi)/2);
      }
      u0=u;p0=p;d0=du;
    }
    return noArco(C,s0+sg*W);
  };
  /* Projeta LOCALMENTE o par inteiro. O escore usa simultaneamente A, B e
     a direção do par; duas linhas paralelas próximas deixam de ser ambíguas. */
  const parLocal=(R,o,W)=>{
    const C=cadeia(R),A=P(o&&o.A),B=P(o&&o.B);if(!C||!A)return null;
    const largura=Math.max(.2,Math.abs(+W||0)),v=B?[B[0]-A[0],B[1]-A[1]]:null,
      nv=v?(Math.hypot(v[0],v[1])||1):1;
    let best=null;
    for(const e of C.seg){
      const L2=e.dx*e.dx+e.dy*e.dy||1;
      let t=((A[0]-e.a[0])*e.dx+(A[1]-e.a[1])*e.dy)/L2;t=Math.max(0,Math.min(1,t));
      const qA=[e.a[0]+t*e.dx,e.a[1]+t*e.dy],sA=e.s+t*e.L;
      for(const sg of [1,-1]){
        const qB=noCorda(C,sA,sg,largura),cx=qB[0]-qA[0],cy=qB[1]-qA[1],nc=Math.hypot(cx,cy)||1,
          dA=Math.hypot(qA[0]-A[0],qA[1]-A[1]),dB=B?Math.hypot(qB[0]-B[0],qB[1]-B[1]):0,
          dot=v?(cx*v[0]+cy*v[1])/(nc*nv):1,
          score=dA+dB+largura*Math.max(0,1-dot)*3;
        if(!best||score<best.score)best={A:qA,B:qB,score,s:sA};
      }
    }
    return best&&{A:best.A.slice(),B:best.B.slice(),usaProx:true,banco:+o.banco||null,s:best.s};
  };
  const grava=(st,o)=>{
    if(!st||!o)return;
    st.proxIniA=o.A.slice();st.proxIniB=o.B.slice();st.pFim=o.A.slice();st.pFimB=o.B.slice();
    st._origemRampa105={A:o.A.slice(),B:o.B.slice(),usaProx:true,banco:o.banco||(+st.banco+1)};
    try{const L=st.lays&&st.lays.uni;if(L&&L._rb31Recipe)L._rb31Recipe.origemRampa105={
      A:o.A.slice(),B:o.B.slice(),usaProx:true,banco:st._origemRampa105.banco};}catch(e){}
  };
  window.rb106ParLocal=parLocal; /* auditoria geométrica do projeto */

  const offset105=window.rb31OffsetBerma;
  if(typeof offset105==='function')window.rb31OffsetBerma=function(sil){
    const st=typeof rb31Estado==='function'?rb31Estado():(typeof S!=='undefined'&&S?S._rb31:null),
      ultimo=st&&st.hist&&st.hist[st.hist.length-1],
      semBanco=!!(ultimo&&ultimo.sem)||!!(st&&st.semRampa)||
        !!(st&&st.rampaPausada133)||!!(st&&st._edicaoBruta134),
      /* usa SEMPRE a chegada recém-criada, nunca proxIni residual */
      chegada=st&&!semBanco?{A:P(st.pFim),B:P(st.pFimB),banco:+st.banco+1}:null,
      Bm=+((document.getElementById('rb31B')||{}).value||0);
    const ok=offset105.apply(this,arguments);
    if(!ok||!st||!chegada||!chegada.A||!R0(st.crista))return ok;
    try{
      let q=null;
      /* Este é o algoritmo CAD já aprovado: transporta o mesmo par pela
         berma de B metros, conservando o ramo e o sentido. */
      if(typeof rb31ParOffsetBerma==='function'&&chegada.B)
        q=rb31ParOffsetBerma(chegada.A,chegada.B,st.crista,Bm);
      if(q&&q.A&&q.B)q={A:P(q.A),B:P(q.B),usaProx:true,banco:+st.banco+1};
      /* Depois do offset não existe aproximação por ponto mais próximo.
         O núcleo já gravou o par transversal exato; uma projeção local de
         reserva poderia movê-lo para outro ramo ou reduzir os 6 m da
         berma. `parLocal` continua reservado somente para uma edição
         manual posterior da própria linha de partida. */
      if(q)grava(st,q);
    }catch(e){console.warn('continuidade do offset 106',e);}
    return ok;
  };

  const gerar105=window.rb31Gerar;
  if(typeof gerar105==='function')window.rb31Gerar=function(sil){
    const st=typeof rb31Estado==='function'?rb31Estado():(typeof S!=='undefined'&&S?S._rb31:null);
    try{
      /* Só há remapeamento quando a própria linha de partida foi editada.
         Sem edição, o par vindo do offset é usado literalmente. */
      const u=st&&st._ultimaLinhaEditada105;
      if(st&&st.banco>0&&u&&+u.banco===+st.banco&&!st.novoInicioP&&!st.novoSoleira){
        const W=+((document.getElementById('rb31W')||{}).value||0),
          q=parLocal(u.geom,st._origemRampa105||{A:st.proxIniA||st.pFim,B:st.proxIniB||st.pFimB,
            usaProx:true,banco:+st.banco+1},W);
        if(q){st.crista=R0(u.geom).map(p=>p.slice());grava(st,q);}
      }
    }catch(e){console.warn('continuidade editada 106',e);}
    return gerar105.apply(this,arguments);
  };
})();
