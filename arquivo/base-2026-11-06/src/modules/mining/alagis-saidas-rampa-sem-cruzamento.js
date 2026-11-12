
/* Saídas auditadas: largura, greide e ângulo de face preservados. */
function rb31AnelAzimute(rd,ch,ctr,P){
  const aT=Math.atan2(P[1]-ctr[1],P[0]-ctr[0]);
  let bi=0,bv=Infinity;
  for(let i=0;i<rd.length;i++){
    let dA=Math.atan2(rd[i][1]-ctr[1],rd[i][0]-ctr[0])-aT;
    while(dA>Math.PI)dA-=2*Math.PI;while(dA<-Math.PI)dA+=2*Math.PI;
    dA=Math.abs(dA);
    if(dA<bv){bv=dA;bi=i;}
  }
  return ch[bi];
}

function rb31AreaSinal(r){
  let a=0;
  for(let i=0;i<r.length;i++){
    const p=r[i],q=r[(i+1)%r.length];
    a+=p[0]*q[1]-q[0]*p[1];
  }
  return a/2;
}

function rb31Walker(anel){
  const n=anel.length,ch=[0],nE=[],len=[];
  for(let i=0;i<n;i++){
    const a=anel[i],b=anel[(i+1)%n],dx=b[0]-a[0],dy=b[1]-a[1],
      L=Math.hypot(dx,dy)||1e-12;
    len.push(L);nE.push([dy/L,-dx/L]);
    if(i<n-1)ch.push(ch[i]+L);
  }
  const per=ch[n-1]+len[n-1];
  /* orientar as normais p/ FORA do anel */
  let k=0;for(let i=1;i<n;i++)if(len[i]>len[k])k=i;
  const mid=[(anel[k][0]+anel[(k+1)%n][0])/2,(anel[k][1]+anel[(k+1)%n][1])/2],
    probe=[mid[0]+nE[k][0]*.5,mid[1]+nE[k][1]*.5];
  if(pointInRing(probe[0],probe[1],anel))for(const v of nE){v[0]*=-1;v[1]*=-1;}
  const norm=s=>((s%per)+per)%per;
  const idxDe=s=>{
    s=norm(s);
    let lo=0,hi=n-1;
    if(s>=ch[hi])return hi;
    while(lo<hi-1){const m=(lo+hi)>>1;if(ch[m]<=s)lo=m;else hi=m;}
    return lo;
  };
  const noS=s=>{
    s=norm(s);
    const i=idxDe(s),u=s-ch[i],a=anel[i],b=anel[(i+1)%n],
      f=Math.min(1,u/len[i]);
    return {p:[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f],n:nE[i],i};
  };
  /* ponto de MITRA do vértice v_i (entre arestas i-1 e i) à distância
     d (positiva p/ fora, negativa p/ dentro), fator limitado a 4× */
  const mitra=(iv,d)=>{
    const i0=(iv-1+n)%n,i1=iv%n,
      mx=nE[i0][0]+nE[i1][0],my=nE[i0][1]+nE[i1][1],
      mm=Math.hypot(mx,my);
    if(mm<1e-9)return null; /* dobradiça de 180° */
    const ux=mx/mm,uy=my/mm,c=ux*nE[i0][0]+uy*nE[i0][1],
      f=1/Math.max(c,0.25); /* cap 4× como CAD */
    return [anel[iv%n][0]+ux*d*f,anel[iv%n][1]+uy*d*f];
  };
  return {n,ch,nE,len,per,norm,idxDe,noS,mitra,anel};
}

function rb31OffsetAnel(anel,dist){
  if(!anel||anel.length<3)return []; /* anel degenerado: falha graciosa */
  const wk=rb31Walker(anel),out=[];
  /* de que lado do anel-pai o offset deve ficar (dentro/fora): amostra o
     ponto médio da 1ª aresta deslocado — referência para validar mitras */
  let ladoEsperado=null;
  try{
    const a0=anel[0],b0=anel[1%anel.length],
      em=[(a0[0]+b0[0])/2+wk.nE[0][0]*dist,(a0[1]+b0[1])/2+wk.nE[0][1]*dist];
    ladoEsperado=pointInRing(em[0],em[1],anel);
  }catch(e){}
  for(let i=0;i<wk.n;i++){
    const i0=(i-1+wk.n)%wk.n,
      mx=wk.nE[i0][0]+wk.nE[i][0],my=wk.nE[i0][1]+wk.nE[i][1],
      mm=Math.hypot(mx,my);
    if(mm<1e-9){ /* dobradiça 180°: bevel com as duas paralelas */
      out.push([anel[i][0]+wk.nE[i0][0]*dist,anel[i][1]+wk.nE[i0][1]*dist]);
      out.push([anel[i][0]+wk.nE[i][0]*dist,anel[i][1]+wk.nE[i][1]*dist]);
      continue;
    }
    const ux=mx/mm,uy=my/mm,c=ux*wk.nE[i0][0]+uy*wk.nE[i0][1];
    /* MITRA EXATA por padrão: é ela que mantém os taludes ACOMPANHANDO em
       paralelo nos grampos (bisel chanfrava o canto e cada anel sucessivo
       cortava mais — desalinhava). O bisel entra SÓ quando a mitra cai do
       lado errado do anel-pai (offset além do raio local — era isso, e não
       a mitra em si, que fazia a berma cruzar o pé no gargalo). */
    if(c<0.5){
      const fM=1/Math.max(c,0.05);          /* cap alto: 20× */
      const P=[anel[i][0]+ux*dist*fM,anel[i][1]+uy*dist*fM];
      if(ladoEsperado===null||pointInRing(P[0],P[1],anel)===ladoEsperado){
        out.push(P);                         /* mitra exata: paralelismo */
      }else{
        out.push([anel[i][0]+wk.nE[i0][0]*dist,anel[i][1]+wk.nE[i0][1]*dist]);
        out.push([anel[i][0]+wk.nE[i][0]*dist,anel[i][1]+wk.nE[i][1]*dist]);
      }
      continue;
    }
    const f=1/Math.max(c,0.125);
    out.push([anel[i][0]+ux*dist*f,anel[i][1]+uy*dist*f]);
  }
  return rb31LimpaSaida(out);
}

/* Offset CAD que pertence ao núcleo de curvas da versão 69. A rampa usa
   esta mitra fiel (cap 8×); os offsets gerais e a berma continuam usando
   rb31OffsetAnel, que conserva as proteções modernas de concavidade. */
function rb31OffsetCurva69(anel,dist){
  if(!anel||anel.length<3)return [];
  const wk=rb31Walker(anel),out=[];
  for(let i=0;i<wk.n;i++){
    const i0=(i-1+wk.n)%wk.n,
      mx=wk.nE[i0][0]+wk.nE[i][0],my=wk.nE[i0][1]+wk.nE[i][1],
      mm=Math.hypot(mx,my);
    if(mm<1e-9){
      out.push([anel[i][0]+wk.nE[i0][0]*dist,anel[i][1]+wk.nE[i0][1]*dist]);
      out.push([anel[i][0]+wk.nE[i][0]*dist,anel[i][1]+wk.nE[i][1]*dist]);
      continue;
    }
    const ux=mx/mm,uy=my/mm,c=ux*wk.nE[i0][0]+uy*wk.nE[i0][1],
      f=1/Math.max(c,.125);
    out.push([anel[i][0]+ux*dist*f,anel[i][1]+uy*dist*f]);
  }
  return rb31LimpaSaida(out);
}

function rb31PontoProtegido(p,proteger,tol){
  if(!p||!proteger||!proteger.length)return false;
  const e=tol==null?0.03:+tol;
  return proteger.some(q=>q&&Math.hypot(p[0]-q[0],p[1]-q[1])<=e);
}

function rb31SemAgulha(r,proteger){
  let pts=r,mexeu=true,guard=0;
  while(mexeu&&guard++<8){
    mexeu=false;
    const o=[];
    for(let i=0;i<pts.length;i++){
      const a2=pts[(i-1+pts.length)%pts.length],b2=pts[i],c2=pts[(i+1)%pts.length],
        v1=[b2[0]-a2[0],b2[1]-a2[1]],v2=[c2[0]-b2[0],c2[1]-b2[1]],
        l1=Math.hypot(v1[0],v1[1]),l2=Math.hypot(v2[0],v2[1]);
      if(l1>1e-9&&l2>1e-9){
        const cos=(v1[0]*v2[0]+v1[1]*v2[1])/(l1*l2),
          sen=Math.abs(v1[0]*v2[1]-v1[1]*v2[0])/(l1*l2);
        if(cos<-0.999&&sen<0.045&&!rb31PontoProtegido(b2,proteger)){
          mexeu=true;continue;
        }
      }
      o.push(b2);
    }
    pts=o;
  }
  return pts;
}

function rb31LimpaSaida(r,proteger){
  let ring=rb31SemAgulha(r,proteger);
  try{
    const cand=cavaDeloop(ring);
    /* O deloop não conhece a função construtiva dos vértices. Ele só é
       aceito se conservar literalmente TODOS os nós protegidos da junta. */
    if(!proteger||proteger.every(q=>rb31PontoProtegido(q,cand,0.03)))ring=cand;
  }catch(e){}
  ring=rb31SemAgulha(ring,proteger); /* pode expor agulha nova */
  const ded=[];
  for(const p of ring){
    const u=ded[ded.length-1];
    if(!u||Math.hypot(p[0]-u[0],p[1]-u[1])>0.02)ded.push([p[0],p[1]]);
  }
  while(ded.length>1&&Math.hypot(ded[0][0]-ded[ded.length-1][0],ded[0][1]-ded[ded.length-1][1])<=0.02)ded.pop();
  return ded;
}

function rb31ConformaFaceEstrita(linha,peNat,z0,dz,runS,WS,wk,chD,angAlvo,controlRing,mouthAnchor,guiaMarcha,bordaModelo){
  const bruta=(linha||[]).map(p=>[+p[0],+p[1],Number.isFinite(+p[2])?+p[2]:z0]),
    estacoesRecebidas=(guiaMarcha&&Array.isArray(guiaMarcha.estacoes)&&
      guiaMarcha.estacoes.length===bruta.length)?
      guiaMarcha.estacoes.map(s=>wk.norm(+s)):null,
    passoA=Math.max(2,Math.min(5,Math.abs(WS||10)/2)),densifica=g=>{
      if(g.length<2)return g;
      const out=[g[0].slice()];
      for(let i=1;i<g.length;i++){
        const a=g[i-1],b=g[i],L=Math.hypot(b[0]-a[0],b[1]-a[1]),N=Math.max(1,Math.ceil(L/passoA));
        for(let k=1;k<=N;k++){
          const t=k/N;out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,
            a[2]+(b[2]-a[2])*t]);
        }
      }
      return out;
    };
  /* A marcha de curva da v69 já é densificada a cada 2 m e traz a
     estação correspondente de cada seção. Densificá-la novamente faria
     pontos novos sem identidade longitudinal e permitiria que dezenas
     deles convergissem para o mesmo canto. */
  let A=estacoesRecebidas?bruta.map(p=>p.slice()):densifica(bruta);
  if(A.length<2||!peNat||peNat.length<2||!wk)return null;
  const modeloA=A.map(p=>p.slice()),
    modeloB=(bordaModelo||[]).filter(p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1]))
      .map(p=>[+p[0],+p[1],Number.isFinite(+p[2])?+p[2]:z0]),
    cadeiaAberta=g=>{
      const ar=[0];for(let i=1;i<g.length;i++)ar.push(ar[i-1]+Math.hypot(g[i][0]-g[i-1][0],g[i][1]-g[i-1][1]));
      return {g,ar,L:ar.at(-1)||1};
    },amostra=(c,t)=>{
      const s=Math.max(0,Math.min(1,t))*c.L;
      for(let i=1;i<c.ar.length;i++)if(s<=c.ar[i]+1e-9){
        const q=(s-c.ar[i-1])/((c.ar[i]-c.ar[i-1])||1),a=c.g[i-1],b=c.g[i];
        return [a[0]+(b[0]-a[0])*q,a[1]+(b[1]-a[1])*q];
      }
      return c.g.at(-1).slice(0,2);
    },usaModelo=modeloA.length>1&&modeloB.length>1,
    cModA=usaModelo?cadeiaAberta(modeloA):null,cModB=usaModelo?cadeiaAberta(modeloB):null;
  const clamp=t=>Math.max(0,Math.min(1,t)),
    /* A curva v69 trabalha por segmentos e liga diretamente as amostras
       dos dois lados do canto. Conservar a normal literal de cada estação
       mantém esse bisel trafegável; interpolar a normal através de uma
       concavidade estreita criaria uma cúspide no offset. */
    noFace=s=>wk.noS(s),
    ringC=(controlRing||[]).map(p=>[+p[0],+p[1]]),
    chC=ringC.length>2?cavaChain(ringC):null;
  /* GUIA LONGITUDINAL DA MARCHA.
     O ponto euclidiano mais próximo não identifica sozinho uma estação do
     anel: num gargalo há dois ramos quase paralelos a poucos metros. A antiga
     conformação repetia essa busca para CADA vértice e podia alternar entre
     os ramos, produzindo o cotovelo que cortava crista, pé e berma. A geração
     já conhece início, fim, sentido e arco percorrido; essa sequência passa a
     ser a autoridade e mantém todas as projeções no mesmo ramo. */
  const temGuia=!!(guiaMarcha&&Number.isFinite(+guiaMarcha.sIni)&&
      (Number.isFinite(+guiaMarcha.sFim)||Number.isFinite(+guiaMarcha.arco))),
    dirGuia=guiaMarcha&&+guiaMarcha.dir<0?-1:1,
    estacoesGuiadas=(pts,arc,total)=>{
      if(!temGuia)return null;
      if(estacoesRecebidas&&estacoesRecebidas.length===pts.length)
        return estacoesRecebidas.slice();
      const s0=wk.norm(+guiaMarcha.sIni);
      let span=Number.isFinite(+guiaMarcha.arco)&&+guiaMarcha.arco>1e-7?
        Math.abs(+guiaMarcha.arco):
        (dirGuia>0?wk.norm(+guiaMarcha.sFim-s0):wk.norm(s0-(+guiaMarcha.sFim)));
      /* início e fim podem coincidir após uma volta completa */
      if(span<1e-7&&total>wk.per*.25)span=Math.min(wk.per,total);
      /* A estação longitudinal é uma LEI, não uma nova busca do ponto mais
         próximo. A busca independente acumulava dezenas de amostras no
         mesmo canto (segmentos de 1–3 cm) e depois saltava 80 m, criando os
         dentes vistos no projeto real. A fração do comprimento da rampa é
         transportada diretamente sobre o arco do pé; as cinco iterações
         abaixo apenas compatibilizam essa fração com o recuo variável da
         face. Assim cada amostra progride, sem voltar nem ficar parada. */
      return pts.map((p,k)=>wk.norm(s0+dirGuia*span*clamp(arc[k]/(total||1))));
    };
  /* ORIGEM REAL DA MARCHA. A v79 projetava só A[0] na linha preta; A[1]
     continuava na estação antiga e formava o conector oblíquo medido em
     22°. Aqui calculamos a diferença de estação no pé natural e aplicamos
     a MESMA translação circular a todos os pontos antes da conformação.
     A direção longitudinal, portanto, nasce tangente à linha de controle. */
  let sBoca=null,ancora=null,faceStations=null,transicaoFace=null;
  if(chC&&mouthAnchor){
    const sc=cavaNearestChain(ringC,chC,mouthAnchor),q=cavaPointChain(ringC,chC,sc);
    ancora=[q[0],q[1]];
    const sAlvo=temGuia?wk.norm(+guiaMarcha.sIni):cavaNearestChain(peNat,chD,ancora),
      sAtual=cavaNearestChain(peNat,chD,A[0]);
    let ds=wk.norm(sAlvo-sAtual);
    if(ds>wk.per/2)ds-=wk.per;
    /* Com guia, a reconstrução abaixo já leva todos os pontos à estação
       correta. Não aplique antes uma translação baseada em sAtual, pois essa
       própria busca global pode ter escolhido o ramo vizinho. */
    if(!temGuia&&Math.abs(ds)>1e-8){
      const arc0=[0];
      for(let i=1;i<A.length;i++)
        arc0.push(arc0[i-1]+Math.hypot(A[i][0]-A[i-1][0],A[i][1]-A[i-1][1]));
      const tot0=arc0.at(-1)||1;
      A=A.map((p,i)=>{
        const t=clamp(arc0[i]/tot0),s0=cavaNearestChain(peNat,chD,p),w=noFace(s0+ds),
          r=(1-t)*runS;
        return [w.p[0]+w.n[0]*r,w.p[1]+w.n[1]*r,z0+dz*t];
      });
    }
    sBoca=sAlvo;
  }
  /* Cinco iterações resolvem simultaneamente: estação no anel, posição
     sobre a face e cota linear pelo comprimento horizontal efetivo. */
  for(let it=0;it<5;it++){
    const arc=[0];
    for(let i=1;i<A.length;i++)
      arc.push(arc[i-1]+Math.hypot(A[i][0]-A[i-1][0],A[i][1]-A[i-1][1]));
    const total=arc.at(-1)||1,sg=estacoesGuiadas(A,arc,total);
    A=A.map((p,i)=>{
      const t=clamp(arc[i]/total),z=z0+dz*t,
        s=sg?sg[i]:cavaNearestChain(peNat,chD,p),w=noFace(s),r=(1-t)*runS;
      return [w.p[0]+w.n[0]*r,w.p[1]+w.n[1]*r,z];
    });
  }
  /* ENCAIXE ESTÁVEL v87.
     Mantém a marcha que estava visualmente correta na v85, mas substitui
     a translação cartesiana (que entortava a pista e alterava a face) por
     uma correção de ESTAÇÃO sobre o próprio pé/crista. Primeiro projetamos
     a quebra na curva teórica da face; depois a diferença longitudinal é
     dissipada suavemente até 2W. Cada ponto continua sendo reconstruído
     por r=(1-t)·runS, portanto permanece exatamente em dz/tan(ângulo).
     Apenas o vértice da mitra é soldado no fim — sem mover os anéis. */
  if(ancora){
    const transBase=Math.max(2*Math.abs(WS),12),arc=[0];
    for(let i=1;i<A.length;i++)arc.push(arc[i-1]+Math.hypot(A[i][0]-A[i-1][0],A[i][1]-A[i-1][1]));
    const total=arc.at(-1)||1,sRaw=estacoesGuiadas(A,arc,total)||
      A.map(p=>cavaNearestChain(peNat,chD,p));
    /* Estação da curva de face mais próxima da quebra. A correção usa a
       tangente real da cadeia, não um vetor XY arbitrário. */
    let sFace=sBoca===null?sRaw[0]:sBoca;
    for(let k=0;k<8;k++){
      const w=noFace(sFace),q=[w.p[0]+w.n[0]*runS,w.p[1]+w.n[1]*runS],
        eps=Math.max(.05,Math.min(.5,wk.per/10000)),
        pm=cavaPointChain(peNat,chD,sFace-eps),pp=cavaPointChain(peNat,chD,sFace+eps),
        tx=pp[0]-pm[0],ty=pp[1]-pm[1],tl=Math.hypot(tx,ty)||1,
        ds=(ancora[0]-q[0])*tx/tl+(ancora[1]-q[1])*ty/tl;
      if(Math.abs(ds)<1e-7)break;
      sFace=wk.norm(sFace+Math.max(-Math.abs(WS),Math.min(Math.abs(WS),ds)));
    }
    /* wk.noS não precisa expor a estação; normaliza explicitamente para
       manter compatibilidade com os walkers antigos. */
    sFace=wk.norm(sFace);
    let ds0=wk.norm(sFace-sRaw[0]);
    if(ds0>wk.per/2)ds0-=wk.per;
    /* A correção de estação da boca não pode ser dissipada numa distância
       menor que o próprio deslocamento longitudinal. Em uma curva fechada,
       isso comprimia várias seções no mesmo canto e formava a seta da
       rampa. Alongar somente esta transição limita sua derivada, sem mover
       a boca, a chegada ou qualquer trecho posterior já aprovado. */
    const trans=Math.max(transBase,3*Math.abs(ds0));
    transicaoFace={ds0,trans};
    faceStations=sRaw.map((s,i)=>{
      const t=clamp(arc[i]/total),f0=clamp(1-arc[i]/trans),
        f=f0*f0*(3-2*f0);
      return wk.norm(s+ds0*f);
    });
    A=A.map((p,i)=>{
      const t=clamp(arc[i]/total),w=noFace(faceStations[i]),r=(1-t)*runS;
      return [w.p[0]+w.n[0]*r,w.p[1]+w.n[1]*r,z0+dz*t];
    });
    A[0]=[ancora[0],ancora[1],z0];
  }else if(temGuia){
    const arc=[0];
    for(let i=1;i<A.length;i++)arc.push(arc[i-1]+Math.hypot(A[i][0]-A[i-1][0],A[i][1]-A[i-1][1]));
    faceStations=estacoesGuiadas(A,arc,arc.at(-1)||1);
  }
  /* Sem uma boca construtiva explícita, os extremos recebidos são as
     âncoras. A normal suavizada vale somente no interior: estendê-la para
     fora da rampa poderia fazer o primeiro segmento andar para trás ao
     contornar justamente o vértice inicial do anel. */
  if(!ancora&&bruta.length>1){
    A[0]=bruta[0].slice();
  }
  const B=[],E=[];
  let faceMin=Infinity,faceMax=-Infinity,wMin=Infinity,wMax=-Infinity,total=0;
  const zPe=z0+dz,arcA=[0];
  for(let i=1;i<A.length;i++)arcA.push(arcA[i-1]+Math.hypot(A[i][0]-A[i-1][0],A[i][1]-A[i-1][1]));
  const totalA=arcA.at(-1)||1,
    /* LADO DO OFFSET 2D. O modelo original só escolhe esquerda/direita;
       não dita a orientação de cada seção. A borda B passa a ser a
       paralela da própria borda A, eliminando o zigue-zague alternado. */
    ladoOffset=(()=>{
      if(!usaModelo)return -Math.sign(WS||1)||-1;
      let soma=0;
      for(let k=0;k<=12;k++){
        const t=k/12,qa=amostra(cModA,t),qb=amostra(cModB,t),
          e=.01,pm=amostra(cModA,Math.max(0,t-e)),pp=amostra(cModA,Math.min(1,t+e)),
          tx=pp[0]-pm[0],ty=pp[1]-pm[1],tl=Math.hypot(tx,ty)||1;
        soma+=Math.sign((qb[0]-qa[0])*(-ty/tl)+(qb[1]-qa[1])*(tx/tl));
      }
      return soma>=0?1:-1;
    })();
  for(let i=0;i<A.length;i++){
    /* Na vizinhança de uma mitra, a projeção euclidiana pode saltar para
       o lado adjacente do canto. Isso girava a normal da borda B e fazia
       a pista parecer torcida. Usa a mesma estação que construiu A. */
    const p=A[i],s=(faceStations&&Number.isFinite(faceStations[i]))?
        faceStations[i]:cavaNearestChain(peNat,chD,p),w=noFace(s),
      pa=A[Math.max(0,i-1)],pp=A[Math.min(A.length-1,i+1)],
      tx=pp[0]-pa[0],ty=pp[1]-pa[1],tl=Math.hypot(tx,ty)||1,
      uAlvo=[-ty/tl*ladoOffset,tx/tl*ladoOffset],
      b=[p[0]+uAlvo[0]*Math.abs(WS),p[1]+uAlvo[1]*Math.abs(WS),p[2]],
      e=[(p[0]+b[0])/2,(p[1]+b[1])/2,p[2]],
      largura=Math.hypot(b[0]-p[0],b[1]-p[1]);
    B.push(b);E.push(e);wMin=Math.min(wMin,largura);wMax=Math.max(wMax,largura);
    if(i)total+=Math.hypot(p[0]-A[i-1][0],p[1]-A[i-1][1]);
    /* Audita a face pelos dois lados. Nos extremos uma das razões é 0/0
       e é ignorada; todos os pontos intermediários têm de dar angAlvo. */
    const rPe=Math.abs((p[0]-w.p[0])*w.n[0]+(p[1]-w.p[1])*w.n[1]),
      hPe=Math.abs(p[2]-zPe);
    /* Os dois vértices de mitra são juntas topológicas: neles a normal é
       multivalorada e a face não é uma seção mensurável. A auditoria vale
       em todos os pontos físicos internos da rampa. */
    if(i>0&&i<A.length-1&&rPe>1e-8&&hPe>1e-8){
      const a=Math.atan2(hPe,rPe)*180/Math.PI;
      faceMin=Math.min(faceMin,a);faceMax=Math.max(faceMax,a);
    }
  }
  const gradeReal=total>1e-9?Math.abs(dz)/total*100:Infinity,
    audit={faceMin:Number.isFinite(faceMin)?faceMin:+angAlvo,
      faceMax:Number.isFinite(faceMax)?faceMax:+angAlvo,
      widthMin:wMin,widthMax:wMax,grade:gradeReal,targetAngle:+angAlvo,
      transition:transicaoFace};
  return {A,B,E,audit,stations:faceStations?faceStations.slice():null};
}

function rb31ParQuebraPreta(anel,pA,pB,W){
  if(!anel||anel.length<3||!pA||!pB||!(Math.abs(W)>0))return null;
  const r=anel.map(p=>[+p[0],+p[1]]);
  if(r.length>3&&Math.hypot(r[0][0]-r.at(-1)[0],r[0][1]-r.at(-1)[1])<1e-7)r.pop();
  const Wa=Math.abs(W),tolW=Math.max(.03,.005*Wa);let best=null;
  for(let i=0;i<r.length;i++){
    for(let passo=1;passo<=Math.min(3,r.length-1);passo++){
      const u=r[i],v=r[(i+passo)%r.length],L=Math.hypot(v[0]-u[0],v[1]-u[1]);
      if(Math.abs(L-Wa)>tolW)continue;
      const s1=Math.hypot(pA[0]-u[0],pA[1]-u[1])+Math.hypot(pB[0]-v[0],pB[1]-v[1]),
        s2=Math.hypot(pA[0]-v[0],pA[1]-v[1])+Math.hypot(pB[0]-u[0],pB[1]-u[1]),
        score=Math.min(s1,s2)+100*Math.abs(L-Wa)+.01*passo;
      if(!best||score<best.score)best={score,
        A:(s1<=s2?u:v).slice(),B:(s1<=s2?v:u).slice(),i,passo,L};
    }
  }
  return best;
}

function rb31CravaExtremosRampa(A,B,E,iniA,iniB,fimA,fimB,zIni,zFim){
  if(!A||!B||!E||!A.length||A.length!==B.length||A.length!==E.length)return false;
  const fixa=(i,adj,pA,pB,z)=>{
    /* As COORDENADAS da boca são imutáveis. Já os nomes A/B são apenas
       rótulos internos: escolhe qual canto continua cada borda sem que os
       dois primeiros/últimos segmentos se cruzem. Isso conserva exatamente
       o par indicado pelo operador e evita o corredor em X. */
    if(pA&&pB&&A[adj]&&B[adj]){
      const cruza=(a,b,c,d)=>{
        const den=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]);
        if(Math.abs(den)<1e-12)return false;
        const t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/den,
          u=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/den;
        return t>1e-7&&t<1-1e-7&&u>1e-7&&u<1-1e-7;
      },
        custo=(qA,qB)=>(cruza(qA,A[adj],qB,B[adj])?1e9:0)+
          Math.hypot(A[adj][0]-qA[0],A[adj][1]-qA[1])+
          Math.hypot(B[adj][0]-qB[0],B[adj][1]-qB[1]),
        direto=custo(pA,pB),trocado=custo(pB,pA);
      if(trocado+1e-7<direto){const q=pA;pA=pB;pB=q;}
    }
    if(pA)A[i]=[+pA[0],+pA[1],z];
    if(pB)B[i]=[+pB[0],+pB[1],z];
    E[i]=[(A[i][0]+B[i][0])/2,(A[i][1]+B[i][1])/2,z];
  };
  if(iniA||iniB)fixa(0,Math.min(1,A.length-1),iniA,iniB,zIni);
  const n=A.length-1;
  if(fimA||fimB)fixa(n,Math.max(0,n-1),fimA,fimB,zFim);
  return true;
}

/* Resolve as DUAS bocas em conjunto. Escolher a correspondência A/B em
   cada ponta isoladamente pode evitar o X entre as bordas e, ainda assim,
   lançar a primeira perna através da crista ou do pé. As quatro combinações
   possíveis conservam o mesmo conjunto de coordenadas; vence a que produz
   corredor sem cruzar as linhas de controle. */
function rb31CravaCorredorTrafegavel(A,B,E,iniA,iniB,fimA,fimB,zIni,zFim,crista,pe){
  if(!A||!B||A.length<2||A.length!==B.length||A.length!==E.length)return false;
  const baseA=A.map(p=>p.slice()),baseB=B.map(p=>p.slice()),n=A.length-1,
    fecha=R=>{
      const g=(R||[]).map(p=>[+p[0],+p[1]]);
      if(g.length>1&&Math.hypot(g[0][0]-g.at(-1)[0],g[0][1]-g.at(-1)[1])>1e-8)
        g.push(g[0].slice());
      return g;
    },C=fecha(crista),P=fecha(pe),
    cruza=(X,Y)=>{
      let q=0;
      for(let i=0;i<X.length-1;i++)for(let j=0;j<Y.length-1;j++){
        const a=X[i],b=X[i+1],c=Y[j],d=Y[j+1],
          den=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]);
        if(Math.abs(den)<1e-12)continue;
        const t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/den,
          u=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/den;
        /* contato exato de ponta é a boca; só interseção própria invalida */
        if(t>1e-7&&t<1-1e-7&&u>1e-7&&u<1-1e-7)q++;
      }
      return q;
    },comprimento=g=>{
      let L=0;for(let i=1;i<g.length;i++)L+=Math.hypot(g[i][0]-g[i-1][0],g[i][1]-g[i-1][1]);
      return L;
    };
  let best=null,candidatos=[];
  for(let mi=0;mi<2;mi++)for(let mf=0;mf<2;mf++){
    const a=baseA.map(p=>p.slice()),b=baseB.map(p=>p.slice()),
      iA=mi?iniB:iniA,iB=mi?iniA:iniB,
      fA=mf?fimB:fimA,fB=mf?fimA:fimB;
    if(iA)a[0]=[+iA[0],+iA[1],zIni];
    if(iB)b[0]=[+iB[0],+iB[1],zIni];
    if(fA)a[n]=[+fA[0],+fA[1],zFim];
    if(fB)b[n]=[+fB[0],+fB[1],zFim];
    const ab=cruza(a,b),contorno=cruza(C,a)+cruza(C,b)+cruza(P,a)+cruza(P,b),
      X=ab+contorno,
      /* em empate, escolhe a continuação de menor percurso; isso evita
         cotovelos sem mover um único canto da boca */
      custo=ab*1e12+contorno*1e9+comprimento(a)+comprimento(b);
    candidatos.push({mi,mf,cruzamentos:X,ab,contorno,custo});
    if(!best||custo<best.custo)best={a,b,custo,cruzamentos:X,mi,mf};
  }
  if(!best)return false;
  for(let i=0;i<A.length;i++){
    A[i]=best.a[i];B[i]=best.b[i];
    E[i]=[(A[i][0]+B[i][0])/2,(A[i][1]+B[i][1])/2,A[i][2]];
  }
  best.candidatos=candidatos;return best;
}

/* Última defesa do CORREDOR, não dos anéis. Em curvas fechadas, a paralela
   teórica de B pode cortar uma corda longa do pé embora todos os offsets
   tenham a distância correta. Mantém A e as quatro coordenadas das bocas;
   em cada seção interna procura, sobre o círculo de raio W, a orientação
   mais próxima da original que não atravesse crista, pé nem a outra borda.
   É uma otimização global da sequência, evitando correções locais em S. */
function rb31CorredorSemCruzamento(A,B,E,crista,pe,W){
  if(!A||!B||A.length<3||A.length!==B.length||A.length!==E.length||!(Math.abs(W)>0))
    return {ajustou:false,antes:0,depois:0};
  const fecha=R=>{
      const g=(R||[]).map(p=>[+p[0],+p[1]]);
      if(g.length>1&&Math.hypot(g[0][0]-g.at(-1)[0],g[0][1]-g.at(-1)[1])>1e-8)
        g.push(g[0].slice());
      return g;
    },C=fecha(crista),P=fecha(pe),controles=[C,P].filter(g=>g.length>2),
    segX=(a,b,c,d)=>{
      const den=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]);
      if(Math.abs(den)<1e-12)return false;
      const t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/den,
        u=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/den;
      return t>1e-7&&t<1-1e-7&&u>1e-7&&u<1-1e-7;
    },segLinha=(a,b,g)=>{
      let n=0;for(let j=0;j<g.length-1;j++)if(segX(a,b,g[j],g[j+1]))n++;
      return n;
    },cruzaEntre=(X,Y)=>{
      let n=0;for(let i=1;i<X.length;i++)for(let j=1;j<Y.length;j++)
        if(segX(X[i-1],X[i],Y[j-1],Y[j]))n++;
      return n;
    },colisoes=(externa,interna)=>{
      let n=0;
      for(let i=1;i<externa.length;i++)for(const R of controles)
        n+=segLinha(externa[i-1],externa[i],R);
      for(let i=1;i<interna.length;i++){
        for(const R of controles)n+=segLinha(interna[i-1],interna[i],R);
        n+=segLinha(interna[i-1],interna[i],externa);
      }
      return n;
    },pontua=(externa,interna)=>cruzaEntre(externa,interna)*1e6+
      colisoes(externa,interna),antes=pontua(A,B);
  if(!antes)return {ajustou:false,antes:0,depois:0};
  const Wa=Math.abs(W),n=A.length,NC=24,cands=[];
  for(let i=0;i<n;i++){
    if(i===0||i===n-1){cands.push([B[i].slice()]);continue;}
    const pref=Math.atan2(B[i][1]-A[i][1],B[i][0]-A[i][0]),q=[];
    for(let k=0;k<NC;k++){
      /* k=0 é a direção original; depois alterna ±15°, ±30°... */
      const m=k===0?0:(k%2?Math.ceil(k/2):-Math.ceil(k/2)),ang=pref+m*2*Math.PI/NC;
      q.push([A[i][0]+Math.cos(ang)*Wa,A[i][1]+Math.sin(ang)*Wa,B[i][2],ang,pref]);
    }
    cands.push(q);
  }
  let custos=[0],backs=[];
  for(let i=1;i<n;i++){
    const novos=new Array(cands[i].length).fill(Infinity),volta=new Array(cands[i].length).fill(-1),
      LA=Math.hypot(A[i][0]-A[i-1][0],A[i][1]-A[i-1][1]);
    for(let j=0;j<cands[i].length;j++){
      const q=cands[i][j],ladoPenalty=(i===n-1?0:controles.reduce((s,R)=>{
        try{return s+(pointInRing(q[0],q[1],R.slice(0,-1))===
          pointInRing(A[i][0],A[i][1],R.slice(0,-1))?0:1);}catch(e){return s;}
      },0));
      for(let h=0;h<cands[i-1].length;h++){
        if(!Number.isFinite(custos[h]))continue;
        const p=cands[i-1][h],LB=Math.hypot(q[0]-p[0],q[1]-p[1]);
        let xCtrl=0;for(const R of controles)xCtrl+=segLinha(p,q,R);
        const xA=segLinha(p,q,A);
        const desvio=(q[3]==null?0:Math.abs(Math.atan2(Math.sin(q[3]-q[4]),Math.cos(q[3]-q[4])))),
          custo=custos[h]+xA*1e12+xCtrl*1e9+ladoPenalty*1e8+
            Math.abs(LB-LA)*5+desvio*desvio*Wa;
        if(custo<novos[j]){novos[j]=custo;volta[j]=h;}
      }
    }
    backs.push(volta);custos=novos;
  }
  let j=0;for(let k=1;k<custos.length;k++)if(custos[k]<custos[j])j=k;
  const rota=new Array(n);rota[n-1]=j;
  for(let i=n-1;i>0;i--)rota[i-1]=backs[i-1][rota[i]];
  if(rota.some(k=>k<0))return {ajustou:false,antes,depois:antes};
  const nova=cands.map((q,i)=>q[rota[i]].slice(0,3));
  let melhorA=A.map(p=>p.slice()),melhorB=B.map(p=>p.slice()),depois=antes,
    dNova=pontua(A,nova);
  if(dNova<depois){melhorB=nova;depois=dNova;}
  /* Se o cruzamento é produzido por uma amostra que retorna na boca, não
     há orientação de largura capaz de corrigi-la. Remove o PAR interno que
     cria o laço (nunca os extremos), escolhendo globalmente a maior redução.
     A linha continua sobre a mesma face, apenas com um segmento mais longo. */
  let guarda=0;
  while(depois>0&&melhorA.length>3&&guarda++<12){
    let cand=null;
    for(let k=1;k<melhorA.length-1;k++){
      const a=melhorA.slice(0,k).concat(melhorA.slice(k+1)),
        b=melhorB.slice(0,k).concat(melhorB.slice(k+1)),d=pontua(a,b);
      if(d<depois&&(!cand||d<cand.d))cand={a,b,d};
    }
    /* Ganchos de boca podem exigir retirar duas ou mais amostras antes que
       a contagem diminua. Testa o corte do prefixo/sufixo interno em bloco,
       sempre preservando os quatro pinos extremos. */
    for(let k=1;k<=melhorA.length-3;k++){
      let a=[melhorA[0]].concat(melhorA.slice(k+1)),
        b=[melhorB[0]].concat(melhorB.slice(k+1)),d=pontua(a,b);
      if(d<depois&&(!cand||d<cand.d))cand={a,b,d};
      const corte=melhorA.length-1-k;
      a=melhorA.slice(0,corte).concat([melhorA.at(-1)]);
      b=melhorB.slice(0,corte).concat([melhorB.at(-1)]);d=pontua(a,b);
      if(d<depois&&(!cand||d<cand.d))cand={a,b,d};
    }
    if(!cand)break;
    melhorA=cand.a;melhorB=cand.b;depois=cand.d;
  }
  if(depois>=antes)return {ajustou:false,antes,depois:antes};
  A.splice(0,A.length,...melhorA);B.splice(0,B.length,...melhorB);E.length=0;
  for(let i=0;i<A.length;i++){
    E.push([(A[i][0]+B[i][0])/2,(A[i][1]+B[i][1])/2,A[i][2]]);
  }
  return {ajustou:true,antes,depois};
}

/* Reconstrói somente a pequena boca do pé sobre a paralela limpa usada
   pela berma. É acionada quando a limpeza antiga deixa o pé cruzar a própria
   crista. O restante do anel não muda e os dois pinos de chegada sobrevivem. */
function rb31PeEntregueSemCruzar(peAtual,peBase,crista,pA,pB){
  if(!peBase||peBase.length<3||!pA||!pB)return peAtual;
  const fecha=R=>{
      const g=(R||[]).map(p=>[+p[0],+p[1]]);
      if(g.length>1&&Math.hypot(g[0][0]-g.at(-1)[0],g[0][1]-g.at(-1)[1])>1e-8)
        g.push(g[0].slice());
      return g;
    },segX=(a,b,c,d)=>{
      const den=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]);
      if(Math.abs(den)<1e-12)return false;
      const t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/den,
        u=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/den;
      return t>1e-7&&t<1-1e-7&&u>1e-7&&u<1-1e-7;
    },C=fecha(crista),conta=(R,Q,self)=>{
      let n=0;const A=fecha(R),B=self?A:fecha(Q);
      for(let i=0;i<A.length-1;i++)for(let j=0;j<B.length-1;j++){
        if(self&&(Math.abs(i-j)<=1||(i===0&&j===B.length-2)))continue;
        if(segX(A[i],A[i+1],B[j],B[j+1]))n++;
      }
      return n;
    },score=R=>conta(R,C,false)*1000+conta(R,R,true),atual=score(peAtual);
  if(!atual)return peAtual;
  const base=peBase.map(p=>[+p[0],+p[1]]);let bi=0,bt=0,bd=Infinity;
  for(let i=0;i<base.length;i++){
    const a=base[i],b=base[(i+1)%base.length],dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy||1,
      t=Math.max(0,Math.min(1,((pB[0]-a[0])*dx+(pB[1]-a[1])*dy)/L2)),
      d=Math.hypot(pB[0]-(a[0]+dx*t),pB[1]-(a[1]+dy*t));
    if(d<bd){bd=d;bi=i;bt=t;}
  }
  const q=[base[bi][0]+(base[(bi+1)%base.length][0]-base[bi][0])*bt,
      base[bi][1]+(base[(bi+1)%base.length][1]-base[bi][1])*bt],
    monta=ord=>{
      const out=[];
      for(let i=0;i<base.length;i++){
        out.push(base[i].slice());
        if(i===bi){
          if(Math.hypot(out.at(-1)[0]-q[0],out.at(-1)[1]-q[1])>.02)out.push(q.slice());
          for(const p of ord)if(Math.hypot(out.at(-1)[0]-p[0],out.at(-1)[1]-p[1])>.02)
            out.push([+p[0],+p[1]]);
        }
      }
      return rb31LimpaSaida(out,[pA,pB]);
    };
  const c1=monta([pB,pA]),c2=monta([pA,pB]),s1=score(c1),s2=score(c2),
    best=s1<=s2?c1:c2,sb=Math.min(s1,s2);
  return sb<atual?best:peAtual;
}

/* CRISTA HÍBRIDA DA BERMA.
   O anel normal continua sendo o offset do pé natural. Só o arco ocupado
   pela rampa é substituído pela paralela 2D da borda interna, à largura da
   berma. Isso impede duas falhas opostas: copiar a boca/dentes para o anel
   inteiro ou ignorar a pista e atravessá-la com a crista seguinte. */
function rb31CristaSegueRampa2D(cristaNormal,bordaRampaA,bordaRampaB,B){
  /* compatibilidade com a assinatura provisória (normal, B, berma) */
  if(B===undefined){B=bordaRampaB;bordaRampaB=bordaRampaA;bordaRampaA=null;}
  if(!cristaNormal||cristaNormal.length<3||!bordaRampaB||bordaRampaB.length<2||!(B>0))
    return cristaNormal;
  const limpaAberta=g=>{
    const a=[];
    for(const p of g||[]){
      if(!p||!Number.isFinite(+p[0])||!Number.isFinite(+p[1]))continue;
      const q=[+p[0],+p[1]],u=a.at(-1);
      if(!u||Math.hypot(q[0]-u[0],q[1]-u[1])>.08)a.push(q);
    }
    /* Remove somente retorno curto/agulha. Curvas reais permanecem. */
    let mudou=true,guard=0;
    while(mudou&&guard++<24&&a.length>3){
      mudou=false;
      for(let i=1;i<a.length-1;i++){
        const u=[a[i][0]-a[i-1][0],a[i][1]-a[i-1][1]],
          v=[a[i+1][0]-a[i][0],a[i+1][1]-a[i][1]],
          lu=Math.hypot(...u),lv=Math.hypot(...v);
        if(lu<.08||lv<.08){a.splice(i,1);mudou=true;break;}
        const ang=Math.abs(Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]));
        if(ang>125*Math.PI/180&&Math.min(lu,lv)<2.5*B){
          a.splice(i,1);mudou=true;break;
        }
      }
    }
    return a;
  },densifica=g=>{
    const passo=Math.max(2,Math.min(4,B/2)),out=[g[0].slice()];
    for(let i=1;i<g.length;i++){
      const a=g[i-1],b=g[i],L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(L/passo));
      for(let k=1;k<=n;k++){const t=k/n;out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
    }
    return out;
  },R=densifica(limpaAberta(bordaRampaB)),
    RA=bordaRampaA&&bordaRampaA.length>1?densifica(limpaAberta(bordaRampaA)):null,
    G=cristaNormal.map(p=>[+p[0],+p[1]]);
  if(R.length<2||G.length<3)return cristaNormal;
  while(G.length>3&&Math.hypot(G[0][0]-G.at(-1)[0],G[0][1]-G.at(-1)[1])<1e-7)G.pop();
  const ch=cavaChain(G),per=ch.at(-1);
  if(!(per>0))return cristaNormal;
  const proj=p=>{
    const s=cavaNearestChain(G,ch,p),q=cavaPointChain(G,ch,s);
    return {s,p:[q[0],q[1]],d:Math.hypot(p[0]-q[0],p[1]-q[1])};
  },paralela=(linha,lado)=>linha.map((p,i)=>{
    const a=linha[Math.max(0,i-1)],b=linha[Math.min(linha.length-1,i+1)],
      tx=b[0]-a[0],ty=b[1]-a[1],tl=Math.hypot(tx,ty)||1;
    return [p[0]-ty/tl*lado*B,p[1]+tx/tl*lado*B];
  }),cands=[1,-1].map(lado=>({B:paralela(R,lado),A:RA?paralela(RA,lado):null,lado}));
  /* O lado correto é o que se encontra com o offset normal nas duas bocas
     e permanece mais próximo dele no restante do arco. */
  const score=C=>{
    const L=C.B,aFim=C.A&&C.A.at(-1),qa=aFim?proj(aFim):null;
    let s=0;
    for(let i=0;i<L.length;i+=Math.max(1,Math.floor(L.length/12)))s+=proj(L[i]).d;
    return 8*(proj(L[0]).d+(qa?qa.d:proj(L.at(-1)).d))+s;
  };
  const cand=score(cands[0])<=score(cands[1])?cands[0]:cands[1];
  let local=cand.B,q0=proj(local[0]),
    parFim=cand.A&&cand.A.length?cand.A.at(-1).slice():proj(local.at(-1)).p,
    q1=proj(parFim);
  const norm=s=>((s%per)+per)%per,d01=norm(q1.s-q0.s),d10=per-d01,
    LL=(()=>{let s=0;for(let i=1;i<local.length;i++)s+=Math.hypot(local[i][0]-local[i-1][0],local[i][1]-local[i-1][1]);return s;})();
  /* Substitui o arco cujo comprimento corresponde ao da rampa; o outro
     arco, que representa todo o restante da cava, fica intocado. */
  const invertida=Math.abs(d10-LL)<Math.abs(d01-LL);
  let sIni=invertida?q1.s:q0.s,sFim=invertida?q0.s:q1.s,
    substituto=invertida?
      [q1.p.slice(),parFim.slice()].concat(local.slice().reverse(),[q0.p.slice()]):
      [q0.p.slice()].concat(local,[parFim.slice(),q1.p.slice()]);
  const arcoMantido=[];
  /* Após o trecho local, conserva-se o arco complementar sFim → sIni. */
  arcoMantido.push((invertida?q0:q1).p.slice());
  for(let volta=0;volta<2;volta++)for(let i=0;i<G.length;i++){
    let sv=ch[i]+volta*per,ini=sFim,fim=sIni;
    while(fim<=ini)fim+=per;
    while(sv<ini)sv+=per;
    if(sv>ini+1e-7&&sv<fim-1e-7)arcoMantido.push(G[i].slice());
  }
  arcoMantido.push((invertida?q1:q0).p.slice());
  const out=[];
  for(const p of substituto.concat(arcoMantido)){
    const u=out.at(-1);if(!u||Math.hypot(p[0]-u[0],p[1]-u[1])>.05)out.push(p.slice());
  }
  while(out.length>3&&Math.hypot(out[0][0]-out.at(-1)[0],out[0][1]-out.at(-1)[1])<.05)out.pop();
  /* União simples do trecho local com o anel: se os conectores cortarem
     um canto muito fechado, elimina apenas o pequeno laço produzido pela
     interseção e conserva o contorno de maior área. */
  const inter=(a,b,c,d)=>{
    const den=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]);
    if(Math.abs(den)<1e-12)return null;
    const t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/den,
      u=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/den;
    return t>1e-7&&t<1-1e-7&&u>1e-7&&u<1-1e-7?
      [a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]:null;
  };
  let g=out,guard=0;
  const contemLocal=C=>{
    let n=0;
    for(const p of local){
      let md=Infinity;
      for(let i=0;i<C.length;i++){
        const a=C[i],b=C[(i+1)%C.length],dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy||1,
          t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L2));
        md=Math.min(md,Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy)));
      }
      if(md<.12)n++;
    }
    return n;
  };
  while(g.length>4&&guard++<32){
    const hAntes=contemLocal(g);
    let achou=null;
    busca:for(let i=0;i<g.length;i++)for(let j=i+2;j<g.length;j++){
      if(i===0&&j===g.length-1)continue;
      const q=inter(g[i],g[(i+1)%g.length],g[j],g[(j+1)%g.length]);
      if(q){achou={i,j,q};break busca;}
    }
    if(!achou)break;
    const {i,j,q}=achou,
      a=[q].concat(g.slice(i+1,j+1)),
      b=[q].concat(g.slice(j+1),g.slice(0,i+1)),
      ha=contemLocal(a),hb=contemLocal(b),
      aa=Math.abs(rb31AreaSinal(a)),ab=Math.abs(rb31AreaSinal(b));
    if(Math.max(ha,hb)<hAntes-1)break; /* nunca corta o trecho da pista */
    /* A união nunca pode apagar justamente o offset local da rampa. Em
       empate de aderência, fica o contorno principal de maior área. */
    g=(ha!==hb?(ha>hb?a:b):(aa>=ab?a:b)).map(p=>p.slice());
  }
  /* Mantém o sentido topológico do offset normal. */
  if(g.length>3&&Math.sign(rb31AreaSinal(g))!==Math.sign(rb31AreaSinal(G)))g.reverse();
  return g.length>3?g:cristaNormal;
}

function rb31EscolheQuebraOffset(crista,P0,W,dirPadrao,ctr,solDir,berma){
  if(!crista||crista.length<3||!P0||!(W>0))return null;
  const ring=crista.map(p=>[+p[0],+p[1]]),ch=cavaChain(ring),per=ch.at(-1);
  if(!(per>0))return null;
  const norm=s=>((s%per)+per)%per,sRef=cavaNearestChain(ring,ch,P0);
  let dirBusca=dirPadrao>=0?1:-1;
  /* A direção do último segmento é a verdade operacional e resolve Down
     sem depender do sinal topológico do anel. */
  if(solDir&&Number.isFinite(+solDir[0])&&Number.isFinite(+solDir[1])){
    const e=Math.max(.2,Math.min(1,Math.abs(W)*.08)),
      qm=cavaPointChain(ring,ch,sRef-e),qp=cavaPointChain(ring,ch,sRef+e),
      tx=qp[0]-qm[0],ty=qp[1]-qm[1],tl=Math.hypot(tx,ty)||1,
      dl=Math.hypot(+solDir[0],+solDir[1])||1,
      dot=(tx/tl)*(+solDir[0]/dl)+(ty/tl)*(+solDir[1]/dl);
    if(Math.abs(dot)>.15)dirBusca=dot>=0?1:-1;
  }
  /* A saída correta é a quebra do offset atingida pela continuação reta
     da chegada anterior. A v85 usava folga mínima fixa de 1,25·W: com
     pista de 10 m e berma de 6 m, ela pulava justamente a quebra correta
     e escolhia a seguinte — o erro visto na imagem. Localiza primeiro o
     encontro do rumo do caminhão com o anel novo e usa esse ponto para
     ordenar as quebras existentes; nenhuma linha do offset é alterada. */
  let alvoSaida=null;
  if(solDir&&Number.isFinite(+solDir[0])&&Number.isFinite(+solDir[1])){
    const dl=Math.hypot(+solDir[0],+solDir[1])||1,
      D=[+solDir[0]/dl,+solDir[1]/dl];
    let bt=Infinity;
    for(let i=0;i<ring.length;i++){
      const A=ring[i],B=ring[(i+1)%ring.length],rx=B[0]-A[0],ry=B[1]-A[1],
        det=D[0]*ry-D[1]*rx;
      if(Math.abs(det)<1e-12)continue;
      const ex=A[0]-P0[0],ey=A[1]-P0[1],
        t=(ex*ry-ey*rx)/det,u=(ex*D[1]-ey*D[0])/det;
      if(t>.05&&u>=-1e-7&&u<=1+1e-7&&t<bt){
        bt=t;alvoSaida=[P0[0]+D[0]*t,P0[1]+D[1]*t];
      }
    }
  }
  /* Só pula a própria travessa de chegada (meia largura a partir de um
     dos cantos). A distância entre chegada e nova saída é governada pela
     BERMA, não por 1,25·W. */
  const Bm=Number.isFinite(+berma)&&+berma>0?+berma:0,
    minProg=Math.max(.55*Math.abs(W),.5*Bm,.5),
    maxProg=Math.min(per*.48,Math.max(12*Math.abs(W),per*.22)),cands=[];
  for(let i=0;i<ring.length;i++){
    const vA=ring[i],vB=ring[(i+1)%ring.length],
      salto=Math.hypot(vB[0]-vA[0],vB[1]-vA[1]);
    /* A travessa é a própria largura da pista. Aceitar qualquer aresta
       apenas "parecida" com W foi o que escolheu 7,47 m para uma pista
       de 10 m. */
    if(Math.abs(salto-Math.abs(W))>Math.max(.03,.005*Math.abs(W)))continue;
    const eD=[(vB[0]-vA[0])/salto,(vB[1]-vA[1])/salto],
      mx=(vA[0]+vB[0])/2-ctr[0],my=(vA[1]+vB[1])/2-ctr[1],
      mr=Math.hypot(mx,my)||1,
      radial=Math.abs((eD[0]*mx+eD[1]*my)/mr),
      vP=ring[(i-1+ring.length)%ring.length],
      vN=ring[(i+2)%ring.length],
      pDx=vA[0]-vP[0],pDy=vA[1]-vP[1],pL=Math.hypot(pDx,pDy)||1,
      nDx=vN[0]-vB[0],nDy=vN[1]-vB[1],nL=Math.hypot(nDx,nDy)||1,
      /* |cross|=1 significa quebra a 90° da linha local. Considera os
         dois lados porque um deles pode ser o pequeno tampo da boca. */
      normalLocal=Math.max(
        Math.abs(eD[0]*(pDy/pL)-eD[1]*(pDx/pL)),
        Math.abs(eD[0]*(nDy/nL)-eD[1]*(nDx/nL))),
      /* a aresta curta do FUNDO da boca também é transversal às duas
         paredes, mas não é uma saída. Uma quebra real encosta em pelo
         menos um trecho longitudinal do offset, maior que a sua largura. */
      apoioLongitudinal=Math.max(pL,nL)>=1.25*Math.abs(W);
    if((normalLocal<.62||!apoioLongitudinal)&&radial<.7)continue;
    const sMid=norm(ch[i]+salto/2),
      prog=dirBusca>0?norm(sMid-sRef):norm(sRef-sMid);
    if(prog<=minProg||prog>maxProg)continue;
    const meio=[(vA[0]+vB[0])/2,(vA[1]+vB[1])/2],
      dAlvo=alvoSaida?Math.hypot(meio[0]-alvoSaida[0],meio[1]-alvoSaida[1]):Infinity;
    cands.push({prog,vA:vA.slice(),vB:vB.slice(),dirBusca,sRef,sMid,dAlvo});
  }
  cands.sort((a,b)=>alvoSaida?((a.dAlvo-b.dAlvo)||a.prog-b.prog):(a.prog-b.prog));
  return cands[0]||null;
}

function rb31LimpaLinha(pts,ang,lado){
  ang=ang||150;lado=lado||10;
  const cosLim=Math.cos((180-ang)*Math.PI/180);
  let g=pts.map(p=>p.slice()),mexeu=true,guard=0;
  while(mexeu&&guard++<64){
    mexeu=false;
    for(let i=1;i<g.length-1;i++){
      const a2=g[i-1],b2=g[i],c2=g[i+1],
        v1x=b2[0]-a2[0],v1y=b2[1]-a2[1],v2x=c2[0]-b2[0],v2y=c2[1]-b2[1],
        l1=Math.hypot(v1x,v1y),l2=Math.hypot(v2x,v2y);
      if(l1<1e-9||l2<1e-9){g.splice(i,1);mexeu=true;break;}
      const cos=(v1x*v2x+v1y*v2y)/(l1*l2);
      if(cos<=-cosLim&&Math.min(l1,l2)<=lado){g.splice(i,1);mexeu=true;break;}
    }
  }
  return g;
}

function rb31RemoveZigue(pts,angMin,janela){
  angMin=angMin||95;janela=janela||8;
  if(!pts||pts.length<8)return pts;
  const turn=(g,i)=>{
    const v1=[g[i][0]-g[i-1][0],g[i][1]-g[i-1][1]],v2=[g[i+1][0]-g[i][0],g[i+1][1]-g[i][1]],
      n1=Math.hypot(...v1),n2=Math.hypot(...v2);
    if(n1<1e-9||n2<1e-9)return 180;
    return Math.acos(Math.max(-1,Math.min(1,(v1[0]*v2[0]+v1[1]*v2[1])/(n1*n2))))*180/Math.PI;
  };
  let g=pts.map(p=>p.slice()),guard=0,mexeu=true;
  while(mexeu&&guard++<12&&g.length>8){
    mexeu=false;
    for(let i=3;i<g.length-4;i++){
      if(turn(g,i)<=angMin)continue;
      for(let j=i+1;j<=Math.min(i+janela,g.length-4);j++){
        if(turn(g,j)<=angMin)continue;
        g.splice(i,j-i+1);
        mexeu=true;break;
      }
      if(mexeu)break;
    }
  }
  return g;
}

function rb31DesenrolaLinha(pts){
  if(!pts||pts.length<4)return pts;
  let g=pts.map(p=>p.slice()),guard=0,mexeu=true;
  const X=(a,b,c,d)=>{
    const dd=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]);
    if(Math.abs(dd)<1e-12)return null;
    const t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/dd,
      u=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/dd;
    if(t<=0.001||t>=0.999||u<=0.001||u>=0.999)return null;
    return [a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];
  };
  while(mexeu&&guard++<48&&g.length>3){
    mexeu=false;
    busca:for(let i=0;i<g.length-3;i++){
      for(let j=i+2;j<g.length-1;j++){
        const q=X(g[i],g[i+1],g[j],g[j+1]);
        if(q){
          const z=((g[i][2]||0)+(g[j+1][2]||0))/2;
          g.splice(i+1,j-i,[q[0],q[1],z]);
          mexeu=true;break busca;
        }
      }
    }
  }
  return g;
}

function rb31Bancada(crista,z0,opt){
  const ang=+opt.ang,H=+opt.H,W=+opt.W,g=+opt.grade;
  if(!(ang>0&&ang<90&&H>0&&W>0&&g>0))return {warn:'Parâmetros inválidos'};
  /* SENTIDO DA GERAÇÃO (mesma geometria, espelhada):
     · fora=false (padrão, cava): bancos avançam p/ DENTRO do limite
     · fora=true  (pilha/aterro): avançam p/ FORA do limite
     · up=false: cada banco desce H;  up=true: sobe H
     sg inverte TODA distância lateral assinada; dz inverte a cota. */
  const sg=opt.fora?-1:1,dz=opt.up?H:-H;
  const run=H/Math.tan(ang*Math.PI/180),
    L=H/(g/100)*((opt&&opt._fatorL)||1), /* fator de convergência da grade */
    runS=run*sg,WS=W*sg;
  /* pé natural: offset paralelo EXATO (fiel, sem suavizar). Quando o pé foi
     editado manualmente, ele próprio vira a linha de controle da face e da
     rampa; a edição deixa de ser apenas visual. */
  if(!crista||crista.length<3)return {warn:'A crista não comporta a bancada'};
  let peNat=null;
  if(opt&&Array.isArray(opt.peControle)){
    peNat=opt.peControle.filter(p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1]))
      .map(p=>[+p[0],+p[1]]);
    if(peNat.length>3&&Math.hypot(peNat[0][0]-peNat.at(-1)[0],peNat[0][1]-peNat.at(-1)[1])<1e-7)peNat.pop();
    if(peNat.length<3)peNat=null;
  }
  if(!peNat)peNat=rb31OffsetAnel(crista,-runS);
  if(!peNat||peNat.length<3)return {warn:'O anel não comporta a bancada (recuo do talude)'};
  /* BASE DA BERMA. Ela é consolidada depois de construir o pé entregue.
     Não se desloca o anel inteiro por W: isso somaria a largura da pista
     a CADA bancada e acabaria colapsando uma cava estreita. A largura W
     existe somente no arco ocupado pela rampa. */
  let peBerma=peNat;
  const res={aviso:''};
  const wk=rb31Walker(peNat),per=wk.per;
  let cx=0,cy=0;for(const p of peNat){cx+=p[0];cy+=p[1];}
  const ctr=[cx/peNat.length,cy/peNat.length];
  const anelCCW=rb31AreaSinal(peNat)>0;
  let dirA=((opt.dir==='ccw')===anelCCW)?1:-1;
  const chD=peNat.map((_,i)=>wk.ch[i]);
  let sIni=Number.isFinite(opt.sIni)?wk.norm(opt.sIni):
    (opt.startP?cavaNearestChain(peNat,chD,opt.startP):0);
  /* o ponto indicado é a PARTIDA EXATA da 1ª rampa: projeção por
     segmento (nearest), não por azimute — a soleira nasce nele */
  if(opt.avancoIni>0)sIni=wk.norm(sIni+dirA*opt.avancoIni);
  /* ENTRADA PELO DEGRAU (bancadas encadeadas): a junta seca da bancada
     anterior deixa um degrau de ~W na crista nova — ele é a abertura da
     pista. A rampa nova nasce EXATAMENTE nele: procura no pé natural o
     par de vértices consecutivos com salto ~W perto do ponto indicado e
     ancora no vértice do lado NATURAL (o de fora). Nada de soleira nova
     cortando a crista adiante — o caminhão desce, cruza a berma reta e
     entra no degrau. */
  const degrau=!!opt.entradaDegrau;
  let solA=null,solB=null; /* soleira CRAVADA nos vértices do degrau da crista */
  if(degrau){
    /* A quebra escolhida é a PRIMEIRA à frente da chegada, nunca a mais
       próxima em linha reta. Isso preserva o trecho trafegável da berma e
       deixa a quebra de chegada com sua função original. */
    const P0=opt.startP||peNat[0];
    /* A próxima rampa já recebe do offset da berma o par exato situado
       6 m depois do pé anterior. Nesse caso não procura outra quebra e
       não reaproveita a linha de pé como se fosse crista. */
    let melhor=(opt.solDireto&&opt.solIniA&&opt.solIniB)?
      {vA:opt.solIniA.slice(),vB:opt.solIniB.slice(),_rigido:true,dirBusca:dirA}:
      rb31EscolheQuebraOffset(crista,P0,W,dirA,ctr,opt.solDir,opt.berma);
    if(melhor)dirA=melhor.dirBusca;
    if(!melhor&&opt.solIniA&&opt.solIniB){
      /* ANCORAGEM DIRETA E RETA: prolonga a DIREÇÃO de chegada até cruzar
         a crista nova — a travessia da berma fica colinear com o percurso
         (sem jog lateral). Sem interseção, cai na projeção mais próxima. */
      const rayHit=(P,D)=>{
        if(!D)return null;
        let best=null;
        for(let i=0;i<crista.length;i++){
          const A2=crista[i],B2=crista[(i+1)%crista.length],
            rx=B2[0]-A2[0],ry=B2[1]-A2[1],
            det=rx*D[1]-ry*D[0];
          if(Math.abs(det)<1e-12)continue;
          const ex=A2[0]-P[0],ey=A2[1]-P[1];
          const t=(rx*ey-ry*ex)/det;      /* ao longo do raio */
          const u=(D[0]*ey-D[1]*ex)/det;  /* ao longo do segmento */
          if(t>0.05&&t<=8*W&&u>=-1e-6&&u<=1+1e-6){
            if(!best||t<best.t)best={t,q:[P[0]+D[0]*t,P[1]+D[1]*t]};
          }
        }
        return best&&best.q;
      };
      const proj=P=>{
        let best=null;
        for(let i=0;i<crista.length;i++){
          const A2=crista[i],B2=crista[(i+1)%crista.length],
            dx=B2[0]-A2[0],dy=B2[1]-A2[1],den=dx*dx+dy*dy||1;
          let t=((P[0]-A2[0])*dx+(P[1]-A2[1])*dy)/den;t=Math.max(0,Math.min(1,t));
          const q=[A2[0]+dx*t,A2[1]+dy*t],d=Math.hypot(q[0]-P[0],q[1]-P[1]);
          if(!best||d<best.d)best={d,q};
        }
        return best&&best.d<=6*W?best.q:null;
      };
      /* TRANSLAÇÃO RÍGIDA DO PAR: o par (canto externo, canto interno) da
         junta anterior desliza pela DIREÇÃO DE CHEGADA até o canto EXTERNO
         cravar no anel novo — o corredor atravessa a berma colinear, a
         soleira mantém a largura exata e o canto externo fica NA linha. */
      const hitA=rayHit(opt.solIniA,opt.solDir)||proj(opt.solIniA);
      let qa=null,qb=null;
      if(hitA){
        const ddx=hitA[0]-opt.solIniA[0],ddy=hitA[1]-opt.solIniA[1];
        qa=hitA;
        qb=[opt.solIniB[0]+ddx,opt.solIniB[1]+ddy];
      }else{ qa=proj(opt.solIniA); qb=proj(opt.solIniB); }
      if(qa&&qb&&Math.hypot(qa[0]-qb[0],qa[1]-qb[1])>=0.4*W)
        melhor={dP:0,vA:qa,vB:qb,_rigido:true};
    }
    if(melhor){
      /* qual dos dois cantos é o de FORA? Quando o par veio da ANCORAGEM
         DIRETA, a resposta já é conhecida (vA=topo/externa, vB=base/-W) —
         re-decidir aqui virava a parede. Só o par da BUSCA de assinatura
         precisa do teste da marcha. */
      let solAp,solBp;
      if(melhor._rigido){
        solAp=melhor.vA; solBp=melhor.vB;
      }else{
        const meio=[(melhor.vA[0]+melhor.vB[0])/2,(melhor.vA[1]+melhor.vB[1])/2],
          sM=rb31AnelAzimute(peNat,chD,ctr,meio),
          wT=wk.noS(wk.norm(sM+dirA*(W+2))),
          aT=[wT.p[0]+wT.n[0]*runS,wT.p[1]+wT.n[1]*runS],
          dA=Math.hypot(melhor.vA[0]-aT[0],melhor.vA[1]-aT[1]),
          dB=Math.hypot(melhor.vB[0]-aT[0],melhor.vB[1]-aT[1]);
        solAp=(dA<=dB?melhor.vA:melhor.vB);
        solBp=(dA<=dB?melhor.vB:melhor.vA);
      }
      solA=solAp.slice();
      solB=solBp.slice();
      /* âncora da marcha: o vértice do pé natural mais próximo (euclid)
         do canto de fora — a âncora ANGULAR caía no canto errado do
         degrau do pé (dois vértices no mesmo azimute) e a marcha
         nascia na aresta radial do vão */
      /* estação EXATA por segmento. A antiga escolha pelo vértice mais
         próximo deslocava o início até o canto seguinte e era a origem do
         vão mostrado entre a linha preta e o trecho 2. */
      sIni=wk.norm(cavaNearestChain(peNat,chD,solA)+dirA*0.05);
    }else sIni=wk.norm(sIni+dirA*0.05); /* sem degrau visível: segue do ponto */
  }
  const Lent=degrau?0:1.75*W, /* diagonal só na 1ª bancada (soleira na crista) */
    lin=x=>degrau?1:Math.max(0,Math.min(1,x));
  /* ---------- marcha das bordas (A na face, B=A−W, eixo no meio) ---
     amostras a cada ~2 m na cadeia + vértices de MITRA nos cantos
     cruzados (a cada distância própria: A→rec, B→rec−W, E→rec−W/2) */
  const A=[],Bq=[],E=[],exA=[];
  /* A versão 69 é a referência geométrica aprovada para curvas. O corpo
     dela será recomposto mais abaixo e guardado para não ser redesenhado
     pelas correções modernas de face; somente as quatro pontas e o greide
     continuam sob responsabilidade da versão atual. */
  let corpoCurva69=false,curva69Guardada=null,curva69Estacoes=null;
  /* canto AGUDO (fator de mitra > 2×): a mitra única voava até 4× o
     offset pela bissetriz — com pista de 10 m isso lançava um vértice
     20–30 m para o lado e a borda interna CRUZAVA a externa (o
     zigue-zague roxo). Em canto agudo o CAD usa BISEL: dois pontos,
     um por aresta, na ordem da marcha. */
  const cantoAgudo=vi=>{
    const i0=(vi-1+wk.n)%wk.n,i1=vi%wk.n,
      mx=wk.nE[i0][0]+wk.nE[i1][0],my=wk.nE[i0][1]+wk.nE[i1][1],
      mm=Math.hypot(mx,my);
    if(mm<1e-9)return true;
    return (mx/mm)*wk.nE[i0][0]+(my/mm)*wk.nE[i0][1]<0.5;
  };
  const biselPts=(vi,d)=>{
    const i0=(vi-1+wk.n)%wk.n,i1=vi%wk.n,v=wk.anel[vi%wk.n],
      p0=[v[0]+wk.nE[i0][0]*d,v[1]+wk.nE[i0][1]*d],
      p1=[v[0]+wk.nE[i1][0]*d,v[1]+wk.nE[i1][1]*d];
    return dirA>0?[p0,p1]:[p1,p0];
  };
  const distDesde=si=>dirA>0?wk.norm(si-sIni):wk.norm(sIni-si);
  let s=degrau?wk.norm(sIni+dirA*0.1):wk.norm(sIni+dirA*W),eixoAcum=0,guard=0,tFim=false;
  let iAnt=wk.noS(s).i;
  const passo=2,maxPassos=Math.ceil(per*3/passo)+peNat.length*3+10;
  const pushTrio=(p,nv,t,fE,sAtual)=>{
    /* GEOMETRIA usa o t do passo (rec); a COTA usa o eixo acumulado JÁ COM
       esta perna — sem isso a primeira perna (travessia da berma) saía a
       0% e o resto compensava mais íngreme que o projeto */
    const rec=(1-t)*runS,
      a=[p[0]+nv[0]*rec,p[1]+nv[1]*rec,0];
    let b;
    if(fE<1){
      const sB=wk.norm(sAtual-dirA*(1-fE)*W),nb=wk.noS(sB),
        bl=[nb.p[0]+nb.n[0]*runS,nb.p[1]+nb.n[1]*runS],
        bf=[nb.p[0]+nb.n[0]*(rec-WS),nb.p[1]+nb.n[1]*(rec-WS)];
      b=[bl[0]+(bf[0]-bl[0])*fE,bl[1]+(bf[1]-bl[1])*fE,0];
    }else b=[p[0]+nv[0]*(rec-WS),p[1]+nv[1]*(rec-WS),0];
    const e=[(a[0]+b[0])/2,(a[1]+b[1])/2,0];
    if(E.length){eixoAcum+=Math.hypot(e[0]-E[E.length-1][0],e[1]-E[E.length-1][1]);}
    const z=z0+dz*Math.min(1,eixoAcum/L);
    a[2]=z;b[2]=z;e[2]=z;
    A.push(a);Bq.push(b);E.push(e);exA.push(eixoAcum);
  };
  if(degrau&&solA){
    /* soleira FORÇADA: A0 e B0 são os próprios vértices do degrau
       (coincidência de vértices — a aresta do offset É a medida) */
    A.push([solA[0],solA[1],z0]);
    Bq.push([solB[0],solB[1],z0]);
    E.push([(solA[0]+solB[0])/2,(solA[1]+solB[1])/2,z0]);exA.push(0);
    /* MARCHA NASCE DEPOIS DO ENTALHE: quando a soleira crava depois de um
       canto/entalhe do anel (o jog herdado da junta), o começo do anel
       ainda passa POR CIMA da boca — marchar dali contorna o entalhe e o
       bolsão cruza as bordas (projeto Massari, banco 2). Avança o s de
       partida, sem empurrar pontos, até o trio candidato sair da boca
       (a <0,8·W do pino oposto ou atrás do rumo de chegada); a travessia
       sai RETA e o eixo não gasta comprimento no contorno. */
    if(solB){
      const limW=0.8*Math.abs(W);
      let av=0;
      while(av<4*Math.abs(W)){
        const wq=wk.noS(s),
          aq=[wq.p[0]+wq.n[0]*runS,wq.p[1]+wq.n[1]*runS],
          bq2=[wq.p[0]+wq.n[0]*(runS-WS),wq.p[1]+wq.n[1]*(runS-WS)];
        const dA0=Math.hypot(aq[0]-solB[0],aq[1]-solB[1]),
          dB0=Math.hypot(bq2[0]-solA[0],bq2[1]-solA[1]);
        let atras=false;
        if(opt.solDir){
          const dl=Math.hypot(opt.solDir[0],opt.solDir[1])||1,
            mx=(aq[0]+bq2[0])/2,my=(aq[1]+bq2[1])/2;
          /* só o que está DE FATO atrás da boca: o primeiro trio nasce
             rente ao par (projeção ~0) e isso é normal */
          atras=((mx-(solA[0]+solB[0])/2)*opt.solDir[0]+
                 (my-(solA[1]+solB[1])/2)*opt.solDir[1])/dl<-0.5;
        }
        if(dA0>=limW&&dB0>=limW&&!atras)break;
        s=wk.norm(s+dirA*passo);av+=passo;
      }
      iAnt=wk.noS(s).i;
    }
  }else{
    const w0=wk.noS(s);
    pushTrio(w0.p,w0.n,0,degrau?1:0,s);
  }
  const marchaCorpo=()=>{
  while(guard++<maxPassos&&!tFim){
    const sN=wk.norm(s+dirA*passo),wN=wk.noS(sN);
    /* cantos cruzados entre s e sN: inserir mitras na ordem */
    if(wN.i!==iAnt){
      const cruzados=[];
      /* vértices com cadeia entre s e sN na direção da marcha */
      for(let vi=0;vi<wk.n;vi++){
        const dv=distDesde(wk.ch[vi])-distDesde(s);
        const dpasso=distDesde(sN)-distDesde(s);
        if(dv>1e-9&&dv<dpasso-1e-9)cruzados.push({vi,dv});
      }
      cruzados.sort((u,v)=>u.dv-v.dv);
      for(const c of cruzados){
        const t=Math.min(1,eixoAcum/L),fE=lin(eixoAcum/Lent),rec=(1-t)*runS,
          z=z0+dz*t;
        if(fE>=1){
          if(cantoAgudo(c.vi)){
            const lA=biselPts(c.vi,rec),lB=biselPts(c.vi,rec-WS),
              lE=biselPts(c.vi,rec-WS/2);
            for(let bi=0;bi<2;bi++){
              if(E.length){eixoAcum+=Math.hypot(lE[bi][0]-E[E.length-1][0],lE[bi][1]-E[E.length-1][1]);}
              const zc=z0+dz*Math.min(1,eixoAcum/L);
              A.push([lA[bi][0],lA[bi][1],zc]);Bq.push([lB[bi][0],lB[bi][1],zc]);
              E.push([lE[bi][0],lE[bi][1],zc]);exA.push(eixoAcum);
            }
          }else{
            const mA=wk.mitra(c.vi,rec),mB=wk.mitra(c.vi,rec-WS),
              mE=wk.mitra(c.vi,rec-WS/2);
            if(mA&&mB&&mE){
              if(E.length){eixoAcum+=Math.hypot(mE[0]-E[E.length-1][0],mE[1]-E[E.length-1][1]);}
              const zc=z0+dz*Math.min(1,eixoAcum/L);
              A.push([mA[0],mA[1],zc]);Bq.push([mB[0],mB[1],zc]);E.push([mE[0],mE[1],zc]);exA.push(eixoAcum);
            }
          }
        }
      }
      iAnt=wN.i;
    }
    s=sN;
    const t=Math.min(1,eixoAcum/L),fE=lin(eixoAcum/Lent);
    pushTrio(wN.p,wN.n,t,fE,s);
    if(eixoAcum>=L){
      /* retro-interpolar o s exato onde o eixo cravou L (evita vinco
         de largura no último trecho antes da junta) */
      const sobra=eixoAcum-L;
      if(sobra>1e-6&&E.length>1){
        const e1=E[E.length-1],e0=E[E.length-2],
          dE=Math.hypot(e1[0]-e0[0],e1[1]-e0[1]);
        if(dE>1e-9)s=wk.norm(s-dirA*passo*(sobra/dE));
      }
      tFim=true;
    }
  }
  };
  marchaCorpo();
  if(guard>=maxPassos)return {warn:'A rampa não coube na bancada (comprimento > 3 voltas do perímetro)'};
  /* PODA DA EXCURSÃO DE ENTRADA (junta herdada): quando a soleira cravada
     cai depois de um canto/entalhe do anel, a marcha nasce ATRÁS do par e
     contorna o entalhe antes de entrar no rumo — a excursão vira um bolsão
     que cruza a boca do corredor (visto no projeto Massari, banco 2). Todo
     ponto inicial cuja projeção no RUMO DE CHEGADA (solDir) fica atrás da
     boca sai das quatro listas em bloco; a travessia segue reta, colinear,
     como na referência dele. */
  if(degrau&&solA&&opt.solDir&&A.length>4){
    const Dj=opt.solDir,dl=Math.hypot(Dj[0],Dj[1])||1,
      dx0=Dj[0]/dl,dy0=Dj[1]/dl,
      alcance=4*Math.abs(W);
    let acc=0,ultimo=0;
    for(let i=1;i<A.length-2&&acc<alcance;i++){
      acc+=Math.hypot(E[i][0]-E[i-1][0],E[i][1]-E[i-1][1]);
      const pr=(E[i][0]-E[0][0])*dx0+(E[i][1]-E[0][1])*dy0;
      if(pr<0.3)ultimo=i;
    }
    if(ultimo>0){
      A.splice(1,ultimo);Bq.splice(1,ultimo);
      E.splice(1,ultimo);exA.splice(1,ultimo);
    }
    /* excursão LATERAL: a marcha contornando o entalhe passa por cima da
       BOCA — qualquer ponto inicial de uma borda a menos de 0,8·W do pino
       da borda OPOSTA é bolsão, não corredor; sai em bloco (as quatro
       listas andam juntas) */
    const pertoDe=(arr,P,lim)=>{
      let acc=0,ult=0;
      for(let i=1;i<arr.length-2&&acc<alcance;i++){
        acc+=Math.hypot(arr[i][0]-arr[i-1][0],arr[i][1]-arr[i-1][1]);
        if(Math.hypot(arr[i][0]-P[0],arr[i][1]-P[1])<lim)ult=i;
      }
      return ult;
    };
    const limW=0.8*Math.abs(W),
      u2=Math.max(pertoDe(A,Bq[0],limW),pertoDe(Bq,A[0],limW));
    if(u2>0&&u2<A.length-2){
      A.splice(1,u2);Bq.splice(1,u2);
      E.splice(1,u2);exA.splice(1,u2);
    }
    /* A GRADE É LEI: as podas encurtaram o eixo — a marcha CONTINUA até
       repor o comprimento dz/grade, senão a rampa sai mais íngreme que o
       projeto (14% medido com 10% pedido, 23/08). */
    {
      let eixoReal=0;
      for(let i=1;i<E.length;i++)
        eixoReal+=Math.hypot(E[i][0]-E[i-1][0],E[i][1]-E[i-1][1]);
      if(L-eixoReal>1&&guard<maxPassos){
        eixoAcum=eixoReal;tFim=false;
        marchaCorpo();
      }
    }
  }
  /* ===== PISTA POR MITRA PROGRESSIVA (23/08) =====
     O comprimento da rampa é LEI: L = H/declividade (12 m a 10% = 120 m).
     A poligonal marchada ziguezagueava em anéis angulosos e a limpeza
     encurtava a pista (14% entregues com 10% pedidos). A pista agora é
     reconstruída por MITRA vértice a vértice — retas entre cantos, como o
     DXF de referência dele — e CORTADA exatamente em L. As âncoras da
     junta (par herdado) são preservadas; se a reconstrução não fechar,
     a poligonal marchada continua valendo. */
  let pistaMitra=false;
  try{
    const ancA=A[0]?A[0].slice():null,ancB=Bq[0]?Bq[0].slice():null;
    if(ancA&&ancB&&wk.n>3){
      const arcoM=Math.min(per*1.5,distDesde(s)+Math.abs(run)+4*Math.abs(W));
      const vs=[];
      for(let vi=0;vi<wk.n;vi++){
        const dd=distDesde(wk.ch[vi]);
        if(dd>0.4&&dd<arcoM)vs.push({vi,dd});
      }
      vs.sort((u,v)=>u.dd-v.dd);
      const nA=[[ancA[0],ancA[1],0]],nB=[[ancB[0],ancB[1],0]],ddA=[0];
      let eAc=0,cortou=false,ddCorte=null;
      const limPino=0.8*Math.abs(W);
      const pdir=(opt&&opt.solDir)?[opt.solDir[0],opt.solDir[1]]:null;
      const meio0=[(ancA[0]+ancB[0])/2,(ancA[1]+ancB[1])/2];
      for(const q of vs){
        const tM=Math.min(1,eAc/L),rec=(1-tM)*runS,
          fE=degrau?1:Math.min(1,eAc/Math.max(1e-6,Lent));
        const dB=rec-WS*fE;
        let pontos;
        if(cantoAgudo(q.vi)){
          const parA=biselPts(q.vi,rec),parB=biselPts(q.vi,dB);
          pontos=[[parA[0],parB[0]],[parA[1],parB[1]]];
        }else{
          const mA=wk.mitra(q.vi,rec),mB=wk.mitra(q.vi,dB);
          pontos=(mA&&mB)?[[mA,mB]]:[];
        }
        for(const [pa,pb] of pontos){
          if(pdir){
            const pr=(pa[0]-meio0[0])*pdir[0]+(pa[1]-meio0[1])*pdir[1];
            if(pr<0.3)continue; /* atrás da boca (entalhe herdado) */
          }
          if(eAc<4*Math.abs(W)&&
             Math.hypot(pa[0]-ancB[0],pa[1]-ancB[1])<limPino)continue;
          const ult=nA[nA.length-1];
          const dseg=Math.hypot(pa[0]-ult[0],pa[1]-ult[1]);
          if(dseg<0.05)continue;
          if(eAc+dseg>=L){
            /* corte EXATO em L dentro deste segmento */
            const tC=(L-eAc)/dseg;
            nA.push([ult[0]+(pa[0]-ult[0])*tC,ult[1]+(pa[1]-ult[1])*tC,0]);
            const ultB=nB[nB.length-1];
            nB.push([ultB[0]+(pb[0]-ultB[0])*tC,ultB[1]+(pb[1]-ultB[1])*tC,0]);
            const ddAnt=ddA[ddA.length-1];
            ddCorte=ddAnt+(q.dd-ddAnt)*tC;
            eAc=L;cortou=true;
            break;
          }
          eAc+=dseg;
          nA.push([pa[0],pa[1],0]);
          nB.push([pb[0],pb[1],0]);
          ddA.push(q.dd);
        }
        if(cortou)break;
      }
      /* PROLONGAMENTO: anel de retas longas tem poucos vértices — quando
         eles acabam antes de L, a pista segue amostrada ao longo do anel
         (caso reto: sem zigue) até completar o comprimento da LEI. */
      if(!cortou){
        let ddExtra=ddA.length?ddA[ddA.length-1]:0.5;
        let g3=0;
        while(!cortou&&g3++<300){
          ddExtra+=8;
          if(ddExtra>per*1.4)break;
          const sv=wk.norm(sIni+dirA*ddExtra),wv=wk.noS(sv);
          const tM=Math.min(1,eAc/L),rec=(1-tM)*runS,
            fE=degrau?1:Math.min(1,eAc/Math.max(1e-6,Lent));
          const pa=[wv.p[0]+wv.n[0]*rec,wv.p[1]+wv.n[1]*rec],
            pb=[wv.p[0]+wv.n[0]*(rec-WS*fE),wv.p[1]+wv.n[1]*(rec-WS*fE)];
          const ult=nA[nA.length-1];
          const dseg=Math.hypot(pa[0]-ult[0],pa[1]-ult[1]);
          if(dseg<0.05)continue;
          if(eAc+dseg>=L){
            const tC=(L-eAc)/dseg;
            nA.push([ult[0]+(pa[0]-ult[0])*tC,ult[1]+(pa[1]-ult[1])*tC,0]);
            const ultB=nB[nB.length-1];
            nB.push([ultB[0]+(pb[0]-ultB[0])*tC,ultB[1]+(pb[1]-ultB[1])*tC,0]);
            const ddAnt=ddA.length?ddA[ddA.length-1]:0;
            ddCorte=ddAnt+(ddExtra-ddAnt)*tC;
            eAc=L;cortou=true;
            break;
          }
          eAc+=dseg;
          nA.push([pa[0],pa[1],0]);
          nB.push([pb[0],pb[1],0]);
          ddA.push(ddExtra);
        }
      }
      /* A mitra é ótima em reta, mas num raio fechado pode ultrapassar o
         próprio canto e formar a seta mostrada no banco curvo. Valida a
         alternativa ANTES de substituir a marcha contínua. Se houver
         retorno, dente curto ou cruzamento, somente este trecho conserva a
         marcha original; as rampas retas continuam usando mitra. */
      const retornoMax=G=>{
        let m=0;for(let i=1;i<G.length-1;i++){
          const a=G[i-1],p=G[i],b=G[i+1],ux=p[0]-a[0],uy=p[1]-a[1],
            vx=b[0]-p[0],vy=b[1]-p[1],ang=Math.abs(Math.atan2(
              ux*vy-uy*vx,ux*vx+uy*vy))*180/Math.PI;
          if(ang>m)m=ang;
        }return m;
      },mitraTrafegavel=retornoMax(nA)<120&&retornoMax(nB)<120;
      if(nA.length>2&&(cortou||eAc>L*0.85)&&mitraTrafegavel){
        pistaMitra=true;
        if(cortou&&ddCorte!=null)s=wk.norm(sIni+dirA*ddCorte);
        A.length=0;nA.forEach(p=>A.push(p));
        Bq.length=0;nB.forEach(p=>Bq.push(p));
        E.length=0;exA.length=0;
        let ac2=0;
        for(let i=0;i<A.length;i++){
          E.push([(A[i][0]+Bq[i][0])/2,(A[i][1]+Bq[i][1])/2,0]);
          if(i)ac2+=Math.hypot(E[i][0]-E[i-1][0],E[i][1]-E[i-1][1]);
          exA.push(ac2);
        }
        eixoAcum=ac2;
      }
    }
  }catch(e){}
  /* NÚCLEO DE CURVA DA VERSÃO 69.
     A marcha simples por cadeia + mitras independentes era a geometria que
     já contornava corretamente os raios da cava. Reconstruímos apenas o
     corpo longitudinal e deixamos, abaixo, a entrada/saída atual soldar as
     quatro pontas. Assim não misturamos o algoritmo de curva com a junta. */
  {
    const anel69=peNat.map(p=>p.slice()),wk69=rb31Walker(anel69),
      ch69=anel69.map((_,i)=>wk69.ch[i]),
      pIni69=(degrau&&solA)?solA:wk.noS(sIni).p,
      base69=cavaNearestChain(anel69,ch69,pIni69),
      sIni69=wk69.norm(base69+(degrau?dirA*.05:0)),
      A69=[],B69=[],E69=[],X69=[],S69=[],
      dist69=si=>dirA>0?wk69.norm(si-sIni69):wk69.norm(sIni69-si);
    let s69=degrau?wk69.norm(sIni69+dirA*.1):wk69.norm(sIni69+dirA*W),
      acum69=0,guard69=0,fim69=false,i69=wk69.noS(s69).i;
    const passo69=2,max69=Math.ceil(wk69.per*3/passo69)+anel69.length*3+10,
      push69=(p,nv,t,fE,sAtual)=>{
        /* Resolve a fração NA EXTREMIDADE da nova perna. A v69 original
           usava acum69/L antes de somar essa perna; em uma curva/mitra de
           15 m a cota ficava atrasada enquanto o recuo já havia mudado,
           fazendo 33° aparecer como 27°. Como a posição depende de t,
           uma iteração escalar curta fecha comprimento, cota e face. */
        const monta=tt=>{
          const rec=(1-tt)*runS,z=z0+dz*tt,
            a=[p[0]+nv[0]*rec,p[1]+nv[1]*rec,z];
          let b;
          if(fE<1){
            const sB=wk69.norm(sAtual-dirA*(1-fE)*W),nb=wk69.noS(sB),
              bl=[nb.p[0]+nb.n[0]*runS,nb.p[1]+nb.n[1]*runS],
              bf=[nb.p[0]+nb.n[0]*(rec-WS),nb.p[1]+nb.n[1]*(rec-WS)];
            b=[bl[0]+(bf[0]-bl[0])*fE,bl[1]+(bf[1]-bl[1])*fE,z];
          }else b=[p[0]+nv[0]*(rec-WS),p[1]+nv[1]*(rec-WS),z];
          return {a,b,e:[(a[0]+b[0])/2,(a[1]+b[1])/2,z]};
        };
        let tt=Math.max(0,Math.min(1,t)),g69=monta(tt),d69=0;
        if(E69.length)for(let k=0;k<12;k++){
          d69=Math.hypot(g69.e[0]-E69.at(-1)[0],g69.e[1]-E69.at(-1)[1]);
          const tn=Math.min(1,(acum69+d69)/L);
          if(Math.abs(tn-tt)<1e-10){tt=tn;break;}
          tt=tn;g69=monta(tt);
        }
        g69=monta(tt);
        d69=E69.length?Math.hypot(g69.e[0]-E69.at(-1)[0],g69.e[1]-E69.at(-1)[1]):0;
        acum69+=d69;
        const a=g69.a,b=g69.b,e=g69.e;
        A69.push(a);B69.push(b);E69.push(e);X69.push(acum69);
        S69.push(wk69.norm(sAtual));
      };
    if(degrau&&solA&&solB){
      A69.push([solA[0],solA[1],z0]);B69.push([solB[0],solB[1],z0]);
      E69.push([(solA[0]+solB[0])/2,(solA[1]+solB[1])/2,z0]);X69.push(0);
      S69.push(sIni69);
    }else{
      const w0=wk69.noS(s69);push69(w0.p,w0.n,0,degrau?1:0,s69);
    }
    while(guard69++<max69&&!fim69){
      const sN=wk69.norm(s69+dirA*passo69),wN=wk69.noS(sN);
      if(wN.i!==i69){
        /* A amostragem de 2 m já chega aos dois lados do canto. Inserir
           também a mitra exata entre essas amostras duplica a seção e,
           em concavidade curta, lança um ponto até 4× o recuo para fora.
           A ligação direta entre as amostras é o chanfro densificado:
           conserva o ramo e não cria laço nem ponta de seta. */
        i69=wN.i;
      }
      s69=sN;
      push69(wN.p,wN.n,Math.min(1,acum69/L),lin(acum69/Lent),s69);
      if(acum69>=L){
        const sobra=acum69-L;
        if(sobra>1e-6&&E69.length>1){
          const e1=E69.at(-1),e0=E69.at(-2),d=Math.hypot(e1[0]-e0[0],e1[1]-e0[1]);
          if(d>1e-9)s69=wk69.norm(s69-dirA*passo69*(sobra/d));
        }
        fim69=true;
      }
    }
    /* JUNTA DE MITRA EM CURVA.
       Quando uma amostra regular cai imediatamente depois de uma mitra,
       as duas seções podem ficar a poucos centímetros uma da outra. Em
       raio fechado isso cria o pequeno “dente” visível, embora o restante
       da curva esteja correto. Remove somente a seção redundante quando:
       1) há retorno concentrado acima de 55°;
       2) uma das pernas adjacentes é menor que 15% da largura; e
       3) ligar as seções vizinhas reduz o retorno local em pelo menos 25°.
       A, B, eixo e estação são podados juntos; entrada e saída nunca são
       candidatas e nenhum vértice restante é deslocado. */
    {
      const angulo69=(G,i)=>{
        if(i<=0||i>=G.length-1)return 0;
        const a=G[i-1],p=G[i],b=G[i+1],
          ux=p[0]-a[0],uy=p[1]-a[1],vx=b[0]-p[0],vy=b[1]-p[1];
        return Math.abs(Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy))*180/Math.PI;
      },piorLocal69=(AA,BB,i)=>{
        let m=0;
        for(let j=Math.max(1,i-2);j<=Math.min(AA.length-2,i+1);j++)
          m=Math.max(m,angulo69(AA,j),angulo69(BB,j));
        return m;
      };
      let limpa69=0;
      while(limpa69++<12&&A69.length>7){
        let melhor=null;
        for(let i=2;i<A69.length-1;i++){
          const perna=Math.min(
            Math.hypot(A69[i][0]-A69[i-1][0],A69[i][1]-A69[i-1][1]),
            Math.hypot(A69[i+1][0]-A69[i][0],A69[i+1][1]-A69[i][1]),
            Math.hypot(B69[i][0]-B69[i-1][0],B69[i][1]-B69[i-1][1]),
            Math.hypot(B69[i+1][0]-B69[i][0],B69[i+1][1]-B69[i][1]));
          const antes=piorLocal69(A69,B69,i);
          const concentrado=perna<=Math.max(.5,.15*Math.abs(W));
          /* Um retorno quase completo (>100°) também identifica uma
             excursão de mitra, mesmo quando sua perna é longa. Esse é o
             laço estreito que aparece nas bancadas seguintes da curva. */
          if((concentrado&&antes<=35)||(!concentrado&&antes<=100))continue;
          const a=A69.slice(),b=B69.slice();a.splice(i,1);b.splice(i,1);
          const depois=piorLocal69(a,b,i-1),ganho=antes-depois;
          if(ganho<(concentrado?12:25)||
             depois>(concentrado?35:Math.max(45,antes-35)))continue;
          if(!melhor||depois<melhor.depois||
             (Math.abs(depois-melhor.depois)<1e-9&&ganho>melhor.ganho))
            melhor={i,depois,ganho};
        }
        if(!melhor)break;
        A69.splice(melhor.i,1);B69.splice(melhor.i,1);
        E69.splice(melhor.i,1);X69.splice(melhor.i,1);S69.splice(melhor.i,1);
      }
    }
    if(guard69<max69&&A69.length>2&&A69.length===B69.length){
      A.length=0;Bq.length=0;E.length=0;exA.length=0;
      A69.forEach(p=>A.push(p));B69.forEach(p=>Bq.push(p));
      E69.forEach(p=>E.push(p));X69.forEach(x=>exA.push(x));
      curva69Estacoes=S69.slice();
      /* A saída moderna continua no anel protegido atual; leva para ele a
         estação final alcançada pela marcha 69 por projeção espacial. */
      s=cavaNearestChain(peNat,chD,wk69.noS(s69).p);
      eixoAcum=acum69;pistaMitra=false;corpoCurva69=true;
    }
  }
  /* ENTRADA RETIFICADA (1ª bancada): as DUAS bordas nascem literalmente
     sobre a crista. A boca é medida ao longo do próprio anel da crista,
     com largura W, e não pela projeção inversa do pé. Essa projeção era
     apenas aproximada nas mitras e deixava a primeira chegada alguns
     metros fora da linha de crista. */
  if(!degrau&&Bq.length>2){
    const wkC=rb31Walker(crista),chC=crista.map((_,i)=>wkC.ch[i]),
      alvoB=opt.startP||Bq[0],
      sC=cavaNearestChain(crista,chC,alvoB),
      cB=wkC.noS(sC).p,
      cA=wkC.noS(sC+dirA*Math.abs(W)).p,
      B0=[cB[0],cB[1]],A0=[cA[0],cA[1]];
    let k=0;while(k<exA.length&&exA[k]<Lent)k++;
    if(k>0&&k<Bq.length){
      A[0]=[A0[0],A0[1],z0];
      Bq[0]=[B0[0],B0[1],z0];
      for(let i=1;i<k;i++){
        const f=exA[i]/exA[k];
        A[i]=[A0[0]+(A[k][0]-A0[0])*f,A0[1]+(A[k][1]-A0[1])*f,A[i][2]];
        Bq[i]=[B0[0]+(Bq[k][0]-B0[0])*f,B0[1]+(Bq[k][1]-B0[1])*f,Bq[i][2]];
        E[i]=[(A[i][0]+Bq[i][0])/2,(A[i][1]+Bq[i][1])/2,E[i][2]];
      }
      E[0]=[(A[0][0]+Bq[0][0])/2,(A[0][1]+Bq[0][1])/2,E[0][2]];
    }
  }
  /* ESTAÇÃO FINAL CONTÍNUA. A seleção antiga herdava `s` do último canto
     de mitra alcançado. Ao variar o fator do greide ela saltava entre dois
     vértices: no projeto real, 9,32% ↔ 10,73%, sem existir solução a 10%.
     O desenvolvimento longitudinal sobre o pé é contínuo; em reta,
     L² = arco² + run². Em curva a convergência externa refina o mesmo arco,
     agora sem mudança discreta de ramo ou de quantidade de cantos. */
  if(!corpoCurva69){
    const arcoAlvo=Math.min(per*.48,Math.sqrt(Math.max(1,L*L-run*run)));
    if(Number.isFinite(arcoAlvo)&&arcoAlvo>1)
      s=wk.norm(sIni+dirA*arcoAlvo);
  }
  /* cravar o fim exatamente em t=1 no pé */
  const wF=wk.noS(s),pF=wF.p,nF=wF.n;
  A[A.length-1]=[pF[0],pF[1],z0+dz];
  Bq[Bq.length-1]=[pF[0]-nF[0]*WS,pF[1]-nF[1]*WS,z0+dz];
  E[E.length-1]=[pF[0]-nF[0]*WS/2,pF[1]-nF[1]*WS/2,z0+dz];
  if(curva69Estacoes&&curva69Estacoes.length)
    curva69Estacoes[curva69Estacoes.length-1]=s;
  /* O ajuste exato da estação final pode deixar a penúltima amostra a
     poucos centímetros da chegada. Retira somente essa seção redundante;
     o par final continua literalmente no mesmo lugar. */
  if(corpoCurva69&&A.length>3){
    const giroFim=G=>{
      const i=G.length-2,a=G[i-1],p=G[i],b=G[i+1],
        ux=p[0]-a[0],uy=p[1]-a[1],vx=b[0]-p[0],vy=b[1]-p[1];
      return Math.abs(Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy))*180/Math.PI;
    };
    let gf=0;
    while(gf++<3&&A.length>3){
      const i=A.length-2,curto=Math.min(
        Math.hypot(A[i][0]-A[i-1][0],A[i][1]-A[i-1][1]),
        Math.hypot(A[i+1][0]-A[i][0],A[i+1][1]-A[i][1]),
        Math.hypot(Bq[i][0]-Bq[i-1][0],Bq[i][1]-Bq[i-1][1]),
        Math.hypot(Bq[i+1][0]-Bq[i][0],Bq[i+1][1]-Bq[i][1]));
      if(curto>Math.max(.5,.15*Math.abs(W))||
         Math.max(giroFim(A),giroFim(Bq))<=35)break;
      A.splice(i,1);Bq.splice(i,1);E.splice(i,1);exA.splice(i,1);
      if(curva69Estacoes)curva69Estacoes.splice(i,1);
    }
  }
  if(corpoCurva69)curva69Guardada={
    A:A.map(p=>p.slice()),B:Bq.map(p=>p.slice()),E:E.map(p=>p.slice())
  };
  const sFim=wk.norm(s),arco=distDesde(sFim);
  /* no degrau: o jog engole o canto herdado (0,1 antes dele) — o canto
     de fora deslocado −W coincide com o nível de dentro herdado e o pé
     atravessa a entrada LISO, sem junta (o degrau herdado é aproveitado
     como a própria abertura da pista) */
  const sJog=degrau?wk.norm(sIni-dirA*0.1):sIni,
    distJog=si=>dirA>0?wk.norm(si-sJog):wk.norm(sJog-si),
    arcoJog=distJog(sFim);
  /* ---------- pé entregue: PARALELA EXATA −W no arco ----------
     · fora do arco: vértices naturais intactos
     · entrada: diagonal reta de sIni (natural) ao offset em sIni+Lent
     · dentro: vértices de MITRA a −W (paralela CAD)
     · saída: junta radial SECA (offset e natural no MESMO s) */
  const offW=si=>{const w=wk.noS(si);return [w.p[0]-w.n[0]*WS,w.p[1]-w.n[1]*WS];};
  const natS=si=>wk.noS(si).p.slice();
  const pontos=[];
  for(let vi=0;vi<wk.n;vi++){
    const sv=wk.ch[vi],dd=distJog(sv);
    /* vértice colado na junta de saída (±0,05 na cadeia) sai da lista:
       um ponto de mitra entre os dois vértices da junta quebrava a
       coincidência seca (11,00 virava 10,25/11,41) */
    if(dd>=arcoJog-0.05&&dd<=arcoJog+0.05)continue;
    if(dd<=1e-9||dd>=arcoJog-1e-9){pontos.push({s:sv,pt:peNat[vi].slice()});continue;}
    if(!degrau&&dd<=Lent+1e-9)continue; /* engolidos pela diagonal de entrada */
    if(cantoAgudo(vi)){
      const par=biselPts(vi,-WS);
      pontos.push({s:sv,ord:0,pt:par[0]},{s:sv,ord:1,pt:par[1]});
      continue;
    }
    const m=wk.mitra(vi,-WS);
    pontos.push({s:sv,pt:m||offW(sv)});
  }
  const sLE=wk.norm(sIni+dirA*Lent);
  const esp=degrau?[
    /* pé LISO na entrada (o jog cancela o degrau herdado); só saída seca */
    {s:sFim,ord:0,pt:offW(sFim)},
    {s:sFim,ord:1,pt:natS(sFim)}
  ]:[
    {s:sIni,ord:0,pt:natS(sIni)},          /* início da diagonal de entrada */
    {s:sLE,ord:0,pt:offW(sLE)},            /* fim da diagonal, já a −W */
    {s:sFim,ord:0,pt:offW(sFim)},          /* canto interno no pé deslocado */
    {s:sFim,ord:1,pt:natS(sFim)}           /* canto externo no pé natural:
      junta NORMAL ao anel, coincidente com as duas bordas da rampa */
  ];
  if(dirA<0){ /* varredura invertida: ordem espelhada na junta de saída */
    const k=esp.length-2;
    esp[k].ord=1;esp[k+1].ord=0;
  }
  pontos.push(...esp);
  pontos.sort((u,v)=>(u.s-v.s)||((u.ord||0)-(v.ord||0)));
  /* Os dois cantos da chegada são nós estruturais. A primeira borda
     termina em natS(sFim) e a segunda em offW(sFim); ambos precisam
     sobreviver às limpezas para a rampa não acabar no vazio. */
  const juntaProtegida=[natS(sFim),offW(sFim)];
  let peD=rb31LimpaSaida(pontos.map(q=>[q.pt[0],q.pt[1]]),juntaProtegida);
  /* ESPINHO no pé (reversão >134° com perna curta): sobrava um triângulo
     fino atravessando o canto — o pé deixa de acompanhar a crista em
     paralelo. Remove iterativamente o vértice da ponta. */
  {
    let guard=0,mexeu=true;
    while(mexeu&&guard++<24&&peD.length>4){
      mexeu=false;
      for(let i=1;i<peD.length-1;i++){
        const v1=[peD[i][0]-peD[i-1][0],peD[i][1]-peD[i-1][1]],
          v2=[peD[i+1][0]-peD[i][0],peD[i+1][1]-peD[i][1]],
          n1=Math.hypot(...v1),n2=Math.hypot(...v2);
        if(n1<1e-9||n2<1e-9){
          if(rb31PontoProtegido(peD[i],juntaProtegida))continue;
          peD.splice(i,1);mexeu=true;break;
        }
        const c=(v1[0]*v2[0]+v1[1]*v2[1])/(n1*n2);
        if(c<-0.7&&Math.min(n1,n2)<=Math.max(3,Math.abs(W)*0.3)&&
           !rb31PontoProtegido(peD[i],juntaProtegida)){
          peD.splice(i,1);mexeu=true;break;
        }
      }
    }
  }
  /* LÍNGUA no pé (ida-e-volta estreita de VÁRIOS vértices): a mitra em
     curva com raio menor que W devolve pontos que avançam e recuam — sobra
     um dente de ~1 m de largura e vários metros atravessado no pé (junta
     3→4 do projeto Massari). Onde o caminho anda ≥4 m para voltar a
     <1,2 m de um ponto anterior, o trecho vira ligação direta. */
  {
    let g2=0,mx2=true;
    while(mx2&&g2++<12&&peD.length>6){
      mx2=false;
      busca3: for(let i=0;i<peD.length-3;i++){
        let arco2=Math.hypot(peD[i+1][0]-peD[i][0],peD[i+1][1]-peD[i][1]);
        for(let j=i+2;j<Math.min(peD.length,i+60);j++){
          arco2+=Math.hypot(peD[j][0]-peD[j-1][0],peD[j][1]-peD[j-1][1]);
          if(arco2>22)break;
          const d=Math.hypot(peD[j][0]-peD[i][0],peD[j][1]-peD[i][1]);
          /* 2,2 m: bem menor que a berma (6 m) e que a boca (W) — só a
             língua da mitra cabe nesse vão */
          if(d<2.2&&arco2>=4){
            /* uma língua pode ser cortada, uma junta seca não */
            const apaga=peD.slice(i+1,j);
            if(apaga.some(p=>rb31PontoProtegido(p,juntaProtegida)))continue;
            peD.splice(i+1,j-i-1);mx2=true;break busca3;
          }
        }
      }
    }
  }
  peD=rb31PeEntregueSemCruzar(peD,peNat,crista,juntaProtegida[0],juntaProtegida[1]);
  /* Contrato topológico verificável: se qualquer rotina futura voltar a
     remover a junta, a bancada é recusada em vez de publicar linhas roxas
     flutuantes. */
  if(!juntaProtegida.every(q=>rb31PontoProtegido(q,peD,0.03)))
    return {warn:'A junta de chegada da rampa não pôde ser preservada no pé'};
  /* `peBerma` permanece o pé natural. O recorte local da pista será unido
     ao offset apenas em rb31CristaSegueRampa2D, quando a berma for criada. */
  peBerma=peNat.map(p=>p.slice());
  /* TRAVA DE LARGURA: em côncava fechada o offset da borda interna pode
     flipar de lado (raio local < offset) e cruzar a externa. Onde a largura
     assinada cai abaixo de 25% de W, a interna é recolocada a W exato da
     externa, perpendicular à marcha. A zona de entrada em diagonal (largura
     crescendo de 0 a W por projeto) fica de fora. */
  if(A.length===Bq.length&&A.length>2){
    const Wabs=Math.abs(W);
    let sSum=0;
    for(let i=1;i<A.length-1;i++){
      const tx=A[i+1][0]-A[i-1][0],ty=A[i+1][1]-A[i-1][1],tl=Math.hypot(tx,ty)||1;
      sSum+=Math.sign((Bq[i][0]-A[i][0])*(-ty/tl)+(Bq[i][1]-A[i][1])*(tx/tl));
    }
    const sgn=sSum>=0?1:-1;
    /* EXTREMOS (soleira herdada e junta final): a atribuição dos dois
       vértices às bordas é por LADO — se o par chegou invertido em
       relação à marcha (acontece quando o degrau herdado fica num canto
       distorcido do limite), permuta-se A e B naquele extremo; a
       geometria não muda, só a continuidade de cada borda */
    const ladoExtremo=(e,adj,dirFix)=>{
      const tx=(A[adj][0]-A[e][0])*dirFix,ty=(A[adj][1]-A[e][1])*dirFix,
        tl=Math.hypot(tx,ty)||1;
      return (Bq[e][0]-A[e][0])*(-ty/tl*sgn)+(Bq[e][1]-A[e][1])*(tx/tl*sgn);
    };
    if(!(degrau&&opt.solIniA)&&ladoExtremo(0,1,1)<0){const t0=A[0];A[0]=Bq[0];Bq[0]=t0;}
    const nU=A.length-1;
    if(ladoExtremo(nU,nU-1,-1)<0){const t1=A[nU];A[nU]=Bq[nU];Bq[nU]=t1;}
    let lantX=0,lantY=0;
    for(let i=1;i<A.length-1;i++){
      /* na diagonal de entrada a largura NOMINAL cresce de 0 a W por
         projeto; a trava usa essa largura esperada — assim a reta da
         entrada também não cruza a externa quando um canto do limite
         cai dentro dela */
      const Wexp=(!degrau&&Lent>1e-6&&exA[i]<Lent)?
        Wabs*Math.max(0.05,exA[i]/Lent):Wabs;
      /* lateral pela BISSETRIZ das normais dos dois segmentos: num grampo
         (~180°) a diferença central degenera e apontava a trava para
         qualquer lado — aí vale a última lateral válida */
      const u1x=A[i][0]-A[i-1][0],u1y=A[i][1]-A[i-1][1],n1=Math.hypot(u1x,u1y),
        u2x=A[i+1][0]-A[i][0],u2y=A[i+1][1]-A[i][1],n2=Math.hypot(u2x,u2y);
      let bx=(n1>1e-9?u1x/n1:0)+(n2>1e-9?u2x/n2:0),
        by=(n1>1e-9?u1y/n1:0)+(n2>1e-9?u2y/n2:0);
      const bl=Math.hypot(bx,by);
      let lx,ly;
      if(bl>0.35){ lx=-by/bl*sgn; ly=bx/bl*sgn; lantX=lx;lantY=ly; }
      else if(lantX||lantY){ lx=lantX; ly=lantY; }
      else continue;
      const d=(Bq[i][0]-A[i][0])*lx+(Bq[i][1]-A[i][1])*ly;
      if(d<Wexp*0.25){
        Bq[i]=[A[i][0]+lx*Wexp,A[i][1]+ly*Wexp,Bq[i][2]];
        E[i]=[(A[i][0]+Bq[i][0])/2,(A[i][1]+Bq[i][1])/2,E[i][2]];
      }
    }
  }
  /* bordas sem spikes de geração (mesma regra da ferramenta de limpeza) */
  /* numa pista de largura W nenhuma borda legítima reverte >150° num
     lado de até ~2W — spikes dessa escala são resíduo de offset/trava */
  const ladoR=Math.max(10,2.2*Math.abs(W));
  /* GEOMETRIA CONSTRUTIVA: a distância crista→pé é run=H/tan(ângulo).
     Portanto as bordas não podem receber Chaikin depois de calculadas:
     suavizar A, B e eixo separadamente muda esse recuo e, com ele, o
     ângulo real da face. Mantemos as paralelas/mitras exatas e removemos
     somente laços e reversões degeneradas. */
  const A2=rb31DesenrolaLinha(rb31LimpaLinha(A.map(p=>p.slice()),150,ladoR));
  let B2=rb31DesenrolaLinha(rb31LimpaLinha(Bq.map(p=>p.slice()),150,ladoR)),
    E2=rb31DesenrolaLinha(rb31LimpaLinha(E.map(p=>p.slice()),150,ladoR));
  /* SAÍDA COM O ÂNGULO DA FACE DESDE O COMEÇO (degrau): o desvio da marcha
     em volta do degrau herdado deixava a borda externa COLADA no anel da
     berma pelos primeiros ~10–15 m — a face lia 90° na partida. Nos
     primeiros 3W cada linha vira a RETA do canto cravado do par ao ponto
     de descolamento pleno: o talude aparece já no primeiro metro e a
     inclinação não muda (o descolamento é linear: h·run/H). */
  {
    const reta=P=>{
      if(!P||P.length<7)return;
      const arcT=[0];
      for(let i=1;i<P.length;i++)
        arcT.push(arcT[i-1]+Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]));
      const LsA=3*Math.abs(W);
      let ia=1;while(ia<P.length-2&&arcT[ia]<LsA)ia++;
      if(ia>2)P.splice(1,ia-1);
    };
    const a0=A2.map(p=>p.slice()),b0=B2.map(p=>p.slice()),e0=E2.map(p=>p.slice());
    if(pistaMitra){/* mitra já é reta por construção */}
    else if(degrau&&solA){reta(A2);reta(B2);reta(E2);}
    else{
      /* BOCA da 1ª bancada: o taper do DXF é RETA pura da ponta ao ponto de
         largura plena — a suavização deixava um espigão de 6–8 m (a interna
         ia junto da externa e virava 73° de volta: a lâmina fina vista no
         canto arrastado do limite). A externa segue o anel; interna e eixo
         saem em reta. */
      reta(B2);reta(E2);
    }
    /* SANIDADE: quando o trecho começa numa CURVA, a corda da reta corta
       por dentro e estrangula o corredor (medido 0,3 m no limite editado
       de 23/08). Se a boca reta estreitar abaixo de 0,8·W, volta tudo. */
    {
      const dPLr=(p,ln)=>{let m=1e9;
        for(let i=1;i<ln.length;i++){
          const a=ln[i-1],b=ln[i],dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy||1;
          let t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L2;t=Math.max(0,Math.min(1,t));
          m=Math.min(m,Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy)));
        }
        return m;
      };
      let dmin=1e9,acc=0;
      for(let i=1;i<A2.length-1&&acc<3.5*Math.abs(W);i++){
        acc+=Math.hypot(A2[i][0]-A2[i-1][0],A2[i][1]-A2[i-1][1]);
        if(degrau||acc>1.5*Math.abs(W)) /* fora do taper de projeto da boca */
          dmin=Math.min(dmin,dPLr(A2[i],B2));
      }
      if(dmin<0.8*Math.abs(W)){
        A2.length=0;a0.forEach(p=>A2.push(p));
        B2.length=0;b0.forEach(p=>B2.push(p));
        E2.length=0;e0.forEach(p=>E2.push(p));
      }
    }
  }
  /* PROVA FINAL: as bordas de uma pista jamais podem se cruzar. Se depois
     de toda a marcha ainda houver cruzamento (limite com grampo fechado
     bem na rampa), a interna é RECONSTRUÍDA como paralela direta da
     externa — largura nominal (progressiva na diagonal de entrada),
     soleira e chegada cravadas — e o eixo refeito no meio. */
  const temCruz=(P,Q)=>{
    const self=P===Q;
    /* tangência nos extremos CRAVADOS (soleira/chegada/entrada, onde a
       largura é 0 por projeto) não conta como cruzamento */
    const tang=pt=>!self&&(Math.hypot(pt[0]-Q[0][0],pt[1]-Q[0][1])<0.6||
      Math.hypot(pt[0]-Q[Q.length-1][0],pt[1]-Q[Q.length-1][1])<0.6);
    for(let i=0;i<P.length-1;i++)for(let j=self?i+2:0;j<Q.length-1;j++){
      if(self&&i===0&&j===P.length-2)continue;
      const a=P[i],b=P[i+1],c=Q[j],d=Q[j+1],
        dd=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]);
      if(Math.abs(dd)<1e-12)continue;
      const t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/dd,
        u=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/dd;
      if(t>0.001&&t<0.999&&u>0.001&&u<0.999){
        const px=a[0]+t*(b[0]-a[0]),py=a[1]+t*(b[1]-a[1]);
        if(tang([px,py]))continue;
        return true;
      }
    }
    return false;
  };
  /* PROVA FINAL REFORÇADA: as bordas de uma pista jamais se cruzam NEM o
     corredor estreita abaixo da largura de projeto. Quando isso acontece
     (boca da rampa perto de canto do limite, espinho de mitra, resíduo da
     suavização), a interna é REFEITA como PARALELA DE MITRA da externa já
     limpa — na 1ª bancada a boca é a diagonal RETA do DXF dele (v0→v2);
     no degrau, largura plena desde o par herdado. Extremos cravados. */
  {
    const Wabs2=Math.abs(W);
    const dPL2=(p,ln)=>{let m=1e9;
      for(let i2=1;i2<ln.length;i2++){
        const a2=ln[i2-1],b2=ln[i2],dx=b2[0]-a2[0],dy=b2[1]-a2[1],
          L4=dx*dx+dy*dy||1;
        let t2=((p[0]-a2[0])*dx+(p[1]-a2[1])*dy)/L4;
        t2=Math.max(0,Math.min(1,t2));
        m=Math.min(m,Math.hypot(p[0]-(a2[0]+t2*dx),p[1]-(a2[1]+t2*dy)));
      }
      return m;
    };
    const projPL2=(p,ln)=>{let m=1e9,q=ln[0].slice(0,2);
      for(let i2=1;i2<ln.length;i2++){
        const a2=ln[i2-1],b2=ln[i2],dx=b2[0]-a2[0],dy=b2[1]-a2[1],
          L4=dx*dx+dy*dy||1;
        let t2=((p[0]-a2[0])*dx+(p[1]-a2[1])*dy)/L4;
        t2=Math.max(0,Math.min(1,t2));
        const x=a2[0]+t2*dx,y=a2[1]+t2*dy,d=Math.hypot(p[0]-x,p[1]-y);
        if(d<m){m=d;q=[x,y];}
      }
      return q;
    };
    const arcA2=[0];
    for(let i2=1;i2<A2.length;i2++)
      arcA2.push(arcA2[i2-1]+Math.hypot(A2[i2][0]-A2[i2-1][0],A2[i2][1]-A2[i2-1][1]));
    const projArc=p=>{
      const q=projPL2(p,A2);
      let m=1e9,ia=0;
      for(let i2=0;i2<A2.length;i2++){
        const d=Math.hypot(q[0]-A2[i2][0],q[1]-A2[i2][1]);
        if(d<m){m=d;ia=i2;}
      }
      return arcA2[ia];
    };
    const LentEff=(typeof Lent==='number'&&Lent>Wabs2/2)?Lent:2*Wabs2;
    const arc0=B2.length?projArc(B2[0]):0;
    /* largura esperada no arco s: diagonal da boca na 1ª bancada */
    const Wesp=si=>degrau?Wabs2:
      Math.min(Wabs2,Wabs2*Math.max(0,(si-arc0))/LentEff);
    const estreito=()=>{
      for(let i2=2;i2<A2.length-2;i2++){
        const esperado=Wesp(arcA2[i2]);
        if(esperado>Wabs2*0.3&&dPL2(A2[i2],B2)<0.9*esperado)return true;
      }
      return false;
    };
    if(B2.length>2&&A2.length>3&&
       (temCruz(A2,B2)||temCruz(B2,B2)||estreito())){
      /* lado da interna: maioria das laterais atuais de B2 sobre A2 */
      let sm2=0;
      for(let i2=1;i2<Math.min(A2.length,B2.length)-1;i2++){
        const tx=A2[Math.min(i2+1,A2.length-1)][0]-A2[Math.max(i2-1,0)][0],
          ty=A2[Math.min(i2+1,A2.length-1)][1]-A2[Math.max(i2-1,0)][1],
          tl=Math.hypot(tx,ty)||1;
        sm2+=Math.sign((B2[i2][0]-A2[i2][0])*(-ty/tl)+(B2[i2][1]-A2[i2][1])*(tx/tl));
      }
      const sg2=sm2>=0?1:-1;
      const P0=B2[0].slice(),P1=B2[B2.length-1].slice();
      const arcFim=projArc(P1);
      /* PARALELA POR AMOSTRAGEM (junção redonda): a externa limpa é
         reamostrada a cada ~2 m; cada ponto da interna nasce na lateral
         local e é EMPURRADO até a folga exata pelo ponto mais próximo da
         externa — curva côncava vira filete a W constante, sem a corda
         que a mitra + desenrolo deixavam raspando a externa. */
      const AM=[];{
        let acc=0;AM.push({p:A2[0],arc:0});
        for(let i2=1;i2<A2.length;i2++){
          const d=Math.hypot(A2[i2][0]-A2[i2-1][0],A2[i2][1]-A2[i2-1][1]);
          acc+=d;
          if(acc-AM[AM.length-1].arc>=2||i2===A2.length-1)AM.push({p:A2[i2],arc:acc});
        }
      }
      const nB=[P0];
      let bAnt=P0;
      for(let i2=1;i2<AM.length-1;i2++){
        const si=AM[i2].arc;
        if(!degrau&&si<arc0+LentEff-1e-6)continue; /* boca = diagonal reta */
        if(si<=arc0+0.3||si>=arcFim-0.3)continue;
        const d3=Wesp(si)||Wabs2;
        const tp=AM[i2+1].p,ta=AM[i2-1].p,
          tx=tp[0]-ta[0],ty=tp[1]-ta[1],tl=Math.hypot(tx,ty)||1;
        let bx=AM[i2].p[0]+(-ty/tl)*sg2*d3,
          by=AM[i2].p[1]+(tx/tl)*sg2*d3;
        /* folga exata pelo ponto mais próximo da externa */
        const q=projPL2([bx,by],A2),dq=Math.hypot(bx-q[0],by-q[1]);
        if(dq>1e-6&&dq<d3-0.05){
          bx=q[0]+(bx-q[0])/dq*d3;
          by=q[1]+(by-q[1])/dq*d3;
        }
        /* progresso: ponto que anda para trás (dobra fechada) fica de fora */
        if(((bx-bAnt[0])*(tx/tl)+(by-bAnt[1])*(ty/tl))<=0.05)continue;
        nB.push([bx,by,AM[i2].p[2]]);
        bAnt=[bx,by];
      }
      nB.push(P1);
      let B3=rb31DesenrolaLinha(nB);
      if(B3.length>1){
        B3[0]=P0.slice();B3[B3.length-1]=P1.slice();
        /* troca somente se de fato melhorou o pior ponto do corredor */
        const pior=Bx=>{let m=1e9;
          for(let i2=2;i2<A2.length-2;i2++){
            const esperado=Wesp(arcA2[i2]);
            if(esperado>Wabs2*0.3)m=Math.min(m,dPL2(A2[i2],Bx)-0.9*esperado);
          }
          return m;
        };
        if(pior(B3)>=pior(B2)-1e-9){
          B2=B3;
          E2=A2.map(p=>{
            const q=projPL2(p,B2);
            return [(p[0]+q[0])/2,(p[1]+q[1])/2,p[2]];
          });
        }
      }
    }
  }
/* REPARO TERMINAL: qualquer cruzamento residual entre as bordas (junta
     de chegada em canto distorcido, tecidos curtos) é resolvido podando o
     vértice INTERNO da borda interna envolvido — perde-se só o detalhe do
     ponto, nunca a continuidade; extremos ficam cravados. */
  {
    const X2=(a2,b2,c2,d2)=>{
      const dd=(b2[0]-a2[0])*(d2[1]-c2[1])-(b2[1]-a2[1])*(d2[0]-c2[0]);
      if(Math.abs(dd)<1e-12)return false;
      const t=((c2[0]-a2[0])*(d2[1]-c2[1])-(c2[1]-a2[1])*(d2[0]-c2[0]))/dd,
        u=((c2[0]-a2[0])*(b2[1]-a2[1])-(c2[1]-a2[1])*(b2[0]-a2[0]))/dd;
      return t>0.001&&t<0.999&&u>0.001&&u<0.999;
    };
    let gg=0;
    while(gg++<40&&B2.length>3&&A2.length>3){
      let xa=null,xb=null;
      busca2: for(let i2=0;i2<A2.length-1;i2++)
        for(let j2=0;j2<B2.length-1;j2++){
          if(!X2(A2[i2],A2[i2+1],B2[j2],B2[j2+1]))continue;
          /* tangência junto aos extremos cravados da interna: ignora */
          const a3=A2[i2],b3=A2[i2+1],c3=B2[j2],d3=B2[j2+1],
            dd3=(b3[0]-a3[0])*(d3[1]-c3[1])-(b3[1]-a3[1])*(d3[0]-c3[0]),
            t3=((c3[0]-a3[0])*(d3[1]-c3[1])-(c3[1]-a3[1])*(d3[0]-c3[0]))/dd3,
            px=a3[0]+t3*(b3[0]-a3[0]),py=a3[1]+t3*(b3[1]-a3[1]);
          if(Math.hypot(px-B2[0][0],py-B2[0][1])<0.6||
             Math.hypot(px-B2[B2.length-1][0],py-B2[B2.length-1][1])<0.6)continue;
          xa=i2;xb=j2;break busca2;
        }
      if(xb===null)break;
      let rm=(xb+1<B2.length-1)?xb+1:xb;
      if(rm>=1&&rm<B2.length-1){ B2.splice(rm,1); continue; }
      /* a interna não tem vértice podável neste trecho (extremos cravados,
         ex.: cruzamento na ENTRADA junto ao ponto de partida) — poda a
         EXTERNA, cujo interior também é ajustável */
      let ra=(xa+1<A2.length-1)?xa+1:xa;
      if(ra>=1&&ra<A2.length-1){ A2.splice(ra,1); continue; }
      break;
    }
  }
  if(!pistaMitra){B2=rb31RemoveZigue(B2);E2=rb31RemoveZigue(E2);}
  /* ===== CONFORMIDADE DA FACE (24/08) =====
     LEI: em qualquer ponto da pista, a distância horizontal até a linha de
     CRISTA vale (z − z_crista)/tan(ang) e até a linha de PÉ vale
     (z_pé − z)/tan(ang) — o talude entre a rampa e as linhas da pilha é
     SEMPRE o do projeto (33°). As limpezas/mitras deslocavam a pista
     lateralmente dentro da faixa (medido: 2,2 m da base onde a lei pede
     9,2). Aqui cada ponto é RECOLOCADO na lateral certa, mantendo a
     largura W, o traçado e as âncoras das juntas. */
  if(A2.length>2&&B2.length>1){
    try{
      const arcA=[0];
      for(let i=1;i<A2.length;i++)
        arcA.push(arcA[i-1]+Math.hypot(A2[i][0]-A2[i-1][0],A2[i][1]-A2[i-1][1]));
      const Ltot=arcA[arcA.length-1]||1;
      const nFix=Math.max(2,Math.round(A2.length*0.06)); /* âncoras cravadas */
      const zona=Math.max(2*Math.abs(W),12);
      const nA2=A2.map(p=>p.slice()),nB2=[];
      for(let i=0;i<A2.length;i++){
        const t=Math.min(1,Math.max(0,arcA[i]/Ltot));
        const sCh=cavaNearestChain(peNat,chD,[A2[i][0],A2[i][1]]);
        /* A normal de um vértice de uma polilinha muda de direção de uma
           vez. Em curva isso altera artificialmente a distância horizontal
           da face e, portanto, o ângulo medido. Usa a mesma normal distribuída
           da conformação final; os extremos continuam cravados abaixo. */
        const w=wk.noS(sCh);
        const rAtual=(A2[i][0]-w.p[0])*w.n[0]+(A2[i][1]-w.p[1])*w.n[1];
        const rAlvo=(1-t)*runS;
        let dr=rAlvo-rAtual;
        /* extremos: a junta manda — a correção entra progressivamente */
        const dIni=arcA[i],dFim=Ltot-arcA[i];
        if(i<nFix||i>=A2.length-nFix)dr=0;
        else{
          const fi=Math.min(1,dIni/zona),ff=Math.min(1,dFim/zona);
          dr*=Math.min(fi,ff);
        }
        nA2[i]=[A2[i][0]+w.n[0]*dr,A2[i][1]+w.n[1]*dr,A2[i][2]];
        nB2.push([nA2[i][0]-w.n[0]*WS,nA2[i][1]-w.n[1]*WS,A2[i][2]]);
      }
      /* só troca se não criou cruzamento entre as bordas */
      const cruzou=(P,Q)=>{
        const X=(a,b,c,d)=>{
          const dd=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]);
          if(Math.abs(dd)<1e-12)return false;
          const t1=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/dd,
            u1=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/dd;
          return t1>0.02&&t1<0.98&&u1>0.02&&u1<0.98;
        };
        for(let i=0;i<P.length-1;i++)for(let j=0;j<Q.length-1;j++)
          if(X(P[i],P[i+1],Q[j],Q[j+1]))return true;
        return false;
      };
      /* a conformidade NÃO pode estrangular a pista: se a largura mínima
         cair abaixo de 85% de W, o traçado anterior prevalece */
      const larguraMin=(P,Q)=>{
        const dPLq=(p,ln)=>{let m=1e9;
          for(let i=1;i<ln.length;i++){const a=ln[i-1],b=ln[i],
            dx=b[0]-a[0],dy=b[1]-a[1],L4=dx*dx+dy*dy||1;
            let t3=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L4;t3=Math.max(0,Math.min(1,t3));
            m=Math.min(m,Math.hypot(p[0]-(a[0]+t3*dx),p[1]-(a[1]+t3*dy)));}
          return m;};
        let mn=1e9;
        for(let i=2;i<P.length-2;i++)mn=Math.min(mn,dPLq(P[i],Q));
        return mn;
      };
      const okLarg=(A2.length<6)||
        (larguraMin(nA2,nB2)>=0.85*Math.abs(W))||
        (larguraMin(nA2,nB2)>=larguraMin(A2,B2));
      if(nA2.length>2&&nB2.length>2&&okLarg&&!cruzou(nA2,nB2)){
        /* pontas da INTERNA continuam nas âncoras herdadas */
        nB2[0]=B2[0].slice();
        nB2[nB2.length-1]=B2[B2.length-1].slice();
        for(let i=0;i<A2.length;i++)A2[i]=nA2[i];
        B2=nB2;
        E2=nA2.map((p,i)=>[(p[0]+nB2[i][0])/2,(p[1]+nB2[i][1])/2,p[2]]);
      }
    }catch(e){}
  }
  /* GRADE CONSTANTE EM CADA LINHA: a cota de cada borda/eixo é reamostrada
     pelo comprimento PRÓPRIO da linha (z0 → z0+dz linear). Sem isto, a
     diferença entre o comprimento da borda e o do eixo deixava trechos
     planos ou mais íngremes que o projeto nas entradas/chegadas (visto
     no 3D). O caminhão vê grade uniforme do início ao fim. */
  const gradeConstante=g=>{
    if(!g||g.length<2)return g;
    let tot=0;
    for(let i=1;i<g.length;i++)tot+=Math.hypot(g[i][0]-g[i-1][0],g[i][1]-g[i-1][1]);
    if(tot<1e-9)return g;
    let acc=0;g[0][2]=z0;
    for(let i=1;i<g.length;i++){
      acc+=Math.hypot(g[i][0]-g[i-1][0],g[i][1]-g[i-1][1]);
      g[i][2]=z0+dz*(acc/tot);
    }
    return g;
  };
  let A3=gradeConstante(pistaMitra?A2:rb31RemoveZigue(A2));
  B2=gradeConstante(B2);E2=gradeConstante(E2);
  if(curva69Guardada){
    /* Tudo entre a geração e este ponto pode sanear o anel do pé, mas não
       pode redesenhar o corredor aprovado. Recupera o corpo 69 já com a
       chegada contínua da versão atual e reaplica apenas as cotas. */
    /* Não reamostrar separadamente as cotas de A/B/E: a v69 calculou
       posição lateral e cota com a MESMA fração t. Separar essas duas leis
       é justamente o que fazia a Régua encontrar um ângulo diferente. */
    A3=curva69Guardada.A.map(p=>p.slice());
    B2=curva69Guardada.B.map(p=>p.slice());
    E2=curva69Guardada.E.map(p=>p.slice());
    let fMin69=Infinity,fMax69=-Infinity,wMin69=Infinity,wMax69=-Infinity,
      lE69=0;
    for(let i=0;i<A3.length;i++){
      const secaoPlena69=degrau||!Number.isFinite(exA[i])||exA[i]>=Lent-1e-6;
      if(secaoPlena69){
        const wi=Math.hypot(A3[i][0]-B2[i][0],A3[i][1]-B2[i][1]);
        /* A amostra que cruza Lent ainda pertence ao blend calculado na
           extremidade anterior; a primeira seção realmente plena é a que
           já alcançou pelo menos 95% de W. */
        if(degrau||wi>=.9999*Math.abs(W)){
          wMin69=Math.min(wMin69,wi);wMax69=Math.max(wMax69,wi);
        }
      }
      if(i)lE69+=Math.hypot(E2[i][0]-E2[i-1][0],E2[i][1]-E2[i-1][1]);
      /* A soleira diagonal da primeira bancada é piso de transição sobre
         a berma, não face de talude. A auditoria de face começa quando a
         largura plena foi alcançada (Lent); nas bancadas encadeadas ela
         vale desde a primeira seção interna. */
      const secaoFace69=degrau||!Number.isFinite(exA[i])||exA[i]>=Lent-1e-6;
      if(i>0&&i<A3.length-1&&secaoFace69&&curva69Estacoes&&Number.isFinite(curva69Estacoes[i])){
        const w69=wk.noS(curva69Estacoes[i]),
          r69=(A3[i][0]-w69.p[0])*w69.n[0]+(A3[i][1]-w69.p[1])*w69.n[1],
          d69=Math.abs(runS-r69),h69=Math.abs(A3[i][2]-z0);
        if(d69>1e-8&&h69>1e-8){const a69=Math.atan2(h69,d69)*180/Math.PI;
          fMin69=Math.min(fMin69,a69);fMax69=Math.max(fMax69,a69);}
      }
    }
    res.faceAudit={faceMin:Number.isFinite(fMin69)?fMin69:ang,
      faceMax:Number.isFinite(fMax69)?fMax69:ang,widthMin:wMin69,widthMax:wMax69,
      grade:lE69>1e-9?Math.abs(dz)/lE69*100:Infinity,fonte:'curva-v69'};
  }
  /* A boca da primeira bancada já foi construída com seus DOIS pontos na
     crista (separados por W ao longo dela). A conformação da face trabalha
     por normais e, sem guardar o par, recolocava só um ponto na crista e
     lançava o outro perpendicularmente para fora — o retângulo/gancho visto
     na ponta da rampa. */
  const bocaPrimeiraA=(!degrau&&A3.length)?A3[0].slice():null,
    bocaPrimeiraB=(!degrau&&B2.length)?B2[0].slice():null;
  /* A correção anterior era apenas provisória: podia ser rejeitada pelos
     testes de largura/cruzamento e ainda preservava uma zona sem correção
     nas pontas. Foi exatamente aí que a Régua encontrou 84,26°. Esta
     passagem é mandatória e usa a face como lei, não como suavização. */
  const ancoraBoca=solA||(opt.startP?opt.startP:null);
  let estacoesPublicadas=null;
  const faceFinal=curva69Guardada?null:
    rb31ConformaFaceEstrita(A3,peNat,z0,dz,runS,WS,wk,chD,ang,crista,ancoraBoca,
      {sIni,sFim,dir:dirA,arco,estacoes:curva69Estacoes},B2);
  if(faceFinal){A3=faceFinal.A;B2=faceFinal.B;E2=faceFinal.E;res.faceAudit=faceFinal.audit;
    estacoesPublicadas=faceFinal.stations;}
  /* A correção da face terminou. Agora, e somente agora, solda as quatro
     pontas nos pares construtivos. No trecho encadeado, a boca usa os dois
     vértices da MESMA quebra existente; na chegada, usa o par seco que foi
     inserido no pé. Up e Down compartilham a mesma regra — apenas a ordem
     dos pares já vem espelhada por dirA/WS. */
  const fimA=[pF[0],pF[1]],fimB=[pF[0]-nF[0]*WS,pF[1]-nF[1]*WS],
    /* O primeiro trecho nasce no ponto escolhido pelo operador e conserva
       sua largura original. Só os trechos encadeados (degrau=true) são
       soldados à quebra preta. Neles os DOIS vértices roxos copiam os
       DOIS vértices reais da boca de largura W — nunca uma aresta de 7,47 m. */
    parPreto=(degrau&&solA&&solB)?
      (opt.solDireto?{A:solA.slice(),B:solB.slice()}:
        rb31ParQuebraPreta(crista,solA,solB,W)):null,
    iniA=degrau?(parPreto?parPreto.A:solA):bocaPrimeiraA,
    iniB=degrau?(parPreto?parPreto.B:solB):bocaPrimeiraB;
  let encaixeTrafegavel=rb31CravaCorredorTrafegavel(A3,B2,E2,
    iniA,iniB,fimA,fimB,z0,z0+dz,crista,peD);
  /* FECHAMENTO DA FACE NA GEOMETRIA FINAL.
     A primeira conformação ocorre antes de soldar as quatro pontas. Em uma
     continuação entre bermas, essa solda pode alongar muito o primeiro
     segmento; o greide final passa então a atribuir mais desnível a esse
     trecho, mas o afastamento lateral ainda corresponde à estação antiga.
     Resultado medido: 72,7° no início com alvo de 33°.

     Reexecuta a lei da face DEPOIS da solda. A própria função densifica o
     segmento alongado e usa seu novo desenvolvimento; em seguida as mesmas
     quatro âncoras são cravadas novamente. Duas passagens convergem sem
     mover saída/chegada e sem alterar a largura W. */
  for(let fechaFace=0;!curva69Guardada&&fechaFace<2;fechaFace++){
    const ff=rb31ConformaFaceEstrita(A3,peNat,z0,dz,runS,WS,wk,chD,ang,
      crista,ancoraBoca,{sIni,sFim,dir:dirA,arco,estacoes:curva69Estacoes},B2);
    if(!ff||!ff.A||ff.A.length<2)break;
    A3=ff.A;B2=ff.B;E2=ff.E;res.faceAudit=ff.audit;
    estacoesPublicadas=ff.stations;
    encaixeTrafegavel=rb31CravaCorredorTrafegavel(A3,B2,E2,
      iniA,iniB,fimA,fimB,z0,z0+dz,crista,peD);
  }
  /* Não gire vértices internos para esconder cruzamentos. Essa otimização
     criava o dente de 130,7° no banco 5 do projeto real. A pista permanece
     como offset 2D fiel; eventual conflito topológico é publicado para a
     edição paramétrica da crista/pé, conforme o fluxo do operador. */
  const corredorTrafegavel={ajustou:false,preservouOffset2D:true};
  const debugAposCrava=opt&&opt._debug?{
    A:A3.map(p=>p.slice()),B:B2.map(p=>p.slice())
  }:null;
  /* A BOCA NÃO É PARTE DA OTIMIZAÇÃO. O par inicial e o par final acima
     ficam exatamente onde a construção original os colocou (figura 2).
     Reamostra-se somente a cota ao longo das linhas já cravadas; nenhuma
     poda, rotação, troca de lados ou suavização XY ocorre nas extremidades. */
  /* GREIDE DA PISTA, não de cada borda isolada. Em curva as paralelas têm
     comprimentos diferentes; atribuir 10% separadamente a A e B deixava
     os pontos da mesma seção com cotas distintas. A estação do eixo rege
     as três linhas: cada seção permanece transversal e o caminhão recebe
     um único greide longitudinal constante. */
  const gradeCorredor=(AA,BB,EE)=>{
    if(!AA||!BB||AA.length<2||AA.length!==BB.length)return 0;
    EE.length=0;
    for(let i=0;i<AA.length;i++)EE.push([(AA[i][0]+BB[i][0])/2,
      (AA[i][1]+BB[i][1])/2,0]);
    const ar=[0];for(let i=1;i<EE.length;i++)ar.push(ar[i-1]+
      Math.hypot(EE[i][0]-EE[i-1][0],EE[i][1]-EE[i-1][1]));
    const LT=ar.at(-1)||1;
    for(let i=0;i<EE.length;i++){
      const z=z0+dz*(ar[i]/LT);AA[i][2]=z;BB[i][2]=z;EE[i][2]=z;
    }
    return LT;
  };
  let LEixo=gradeCorredor(A3,B2,E2);
  /* FACE PUBLICADA = FACE MEDIDA PELA RÉGUA 3D.
     A borda externa da pista nasce na linha de partida (cota z0). Para
     cada seção de cota z, seu afastamento horizontal dessa linha deve ser
          d = |z - z0| / tan(ângulo).
     A solda e a reamostragem do greide já terminaram; portanto esta é a
     última restrição XY. A borda interna recebe a MESMA translação, o que
     conserva a largura W e não muda nenhuma cota. Depois recalcula-se o
     greide e repete-se até o acoplamento face/greide convergir. */
  /* Reutiliza EXATAMENTE as estações que produziram a geometria aprovada
     antes da solda das bocas. A tentativa anterior redistribuía todas as
     seções uniformemente entre início e fim; isso corrigia uma curva, mas
     criava dentes em rampas antigas que já estavam certas. */
  const estacoesFace=(estacoesPublicadas&&estacoesPublicadas.length===A3.length)?
    estacoesPublicadas.slice():A3.map((p,i)=>wk.norm(sIni+dirA*arco*
      (A3.length>1?i/(A3.length-1):0))),
  secaoGuiada=(t,i)=>{
    t=Math.max(0,Math.min(1,t));
    /* A estação é identificada pela própria seção, nunca por uma nova
       busca do ponto mais próximo. Assim um gargalo não troca de ramo. */
    const sFace=Number.isFinite(estacoesFace[i])?estacoesFace[i]:
      wk.norm(sIni+dirA*arco*t),
      w=wk.noS(sFace),
      qPartida=[w.p[0]+w.n[0]*runS,w.p[1]+w.n[1]*runS],
      qRampa=[w.p[0]+w.n[0]*(1-t)*runS,w.p[1]+w.n[1]*(1-t)*runS];
    return {qPartida,qRampa,s:sFace};
  },tanFace=Math.tan(ang*Math.PI/180);
  if(!curva69Guardada&&tanFace>1e-9&&A3.length===B2.length){
    const fracoes=A3.map((p,i)=>Math.abs(dz)>1e-9?
      Math.max(0,Math.min(1,Math.abs((p[2]-z0)/dz))):
      (A3.length>1?i/(A3.length-1):0)),
      resolveFaceGreide=()=>{
        for(let fecha=0;fecha<64;fecha++){
          let maiorFrac=0;
          for(let i=1;i<A3.length-1;i++){
            const sc=secaoGuiada(fracoes[i],i),dx=sc.qRampa[0]-A3[i][0],
              dy=sc.qRampa[1]-A3[i][1];
            A3[i][0]+=dx;A3[i][1]+=dy;B2[i][0]+=dx;B2[i][1]+=dy;
          }
          rb31CravaCorredorTrafegavel(A3,B2,E2,
            iniA,iniB,fimA,fimB,z0,z0+dz,crista,peD);
          LEixo=gradeCorredor(A3,B2,E2);
          for(let i=1;i<A3.length-1;i++){
            const f=Math.abs(dz)>1e-9?Math.abs((A3[i][2]-z0)/dz):fracoes[i];
            maiorFrac=Math.max(maiorFrac,Math.abs(f-fracoes[i]));fracoes[i]=f;
          }
          if(maiorFrac<1e-10)break;
        }
      },anguloLinha=(g,i)=>{
        const a=g[i-1],p=g[i],b=g[i+1],ux=p[0]-a[0],uy=p[1]-a[1],
          vx=b[0]-p[0],vy=b[1]-p[1];
        return Math.abs(Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy))*180/Math.PI;
      },anguloB=i=>anguloLinha(B2,i),
      retornoA=i=>anguloLinha(A3,i),
      defeitoB=i=>{
        const a=anguloB(i),u=B2[i-1],p=B2[i],b=B2[i+1],
          curto=Math.min(Math.hypot(p[0]-u[0],p[1]-u[1]),
            Math.hypot(b[0]-p[0],b[1]-p[1]));
        /* Uma curva ampla pode ter ângulo relevante sem ser defeito. Já um
           giro >35° concentrado em menos de 8% da largura é exatamente o
           pequeno dente/seta mostrado na tela. */
        return a>105||(a>35&&curto<Math.max(.5,.08*Math.abs(WS)));
      };
    /* Só muda o recuo da face na MESMA seção. B recebe a mesma translação
       de A, conservando o offset 2D e o desenho anterior da pista. Nenhum
       vértice é apagado, redistribuído ou girado. */
    resolveFaceGreide();
    /* A conformação pode densificar exatamente ao lado de uma quebra do
       anel. Se duas seções consecutivas passam a representar a mesma
       posição longitudinal, surge um retorno local embora a face esteja
       correta. Elimina somente a seção que reduz comprovadamente o pior
       giro das DUAS bordas; estação, fração, eixo e par caminham juntos.
       Depois de cada poda, face e greide são resolvidos novamente. */
    {
      const piorTrecho=(AA,BB,i)=>{
        let m=0;
        for(let j=Math.max(1,i-2);j<=Math.min(AA.length-2,i+1);j++)
          m=Math.max(m,anguloLinha(AA,j),anguloLinha(BB,j));
        return m;
      };
      let removidas=0;
      for(let passa=0;passa<24&&A3.length>7;passa++){
        let melhor=null;
        for(let i=2;i<A3.length-2;i++){
          const antes=piorTrecho(A3,B2,i);
          if(antes<=35.05)continue;
          const aa=A3.slice(),bb=B2.slice();aa.splice(i,1);bb.splice(i,1);
          const depois=piorTrecho(aa,bb,i-1),ganho=antes-depois;
          if(ganho<5||depois>Math.max(35.05,antes-12))continue;
          if(!melhor||depois<melhor.depois||
             (Math.abs(depois-melhor.depois)<1e-9&&ganho>melhor.ganho))
            melhor={i,depois,ganho};
        }
        if(!melhor)break;
        const i=melhor.i;
        A3.splice(i,1);B2.splice(i,1);E2.splice(i,1);
        fracoes.splice(i,1);estacoesFace.splice(i,1);
        removidas++;resolveFaceGreide();
      }
      if(removidas){
        corredorTrafegavel.ajustou=true;
        corredorTrafegavel.dentesCurtosRemovidos=
          (corredorTrafegavel.dentesCurtosRemovidos||0)+removidas;
      }
    }
    /* REPARO LOCAL DA CURVA. Em raio curto, a normal do polígono pode
       girar mais rápido que o avanço longitudinal e fazer somente B dar um
       passo para trás. Corrige exclusivamente os vértices com retorno
       superior a 105°, usando a normal da borda A na mesma seção. A e as
       quatro coordenadas das bocas permanecem literalmente inalteradas. */
    let somaLado=0,reparosCurva=0;
    for(let i=1;i<A3.length-1;i++){
      const pa=A3[i-1],pp=A3[i+1],tx=pp[0]-pa[0],ty=pp[1]-pa[1],
        bx=B2[i][0]-A3[i][0],by=B2[i][1]-A3[i][1];
      somaLado+=Math.sign(tx*by-ty*bx)||0;
    }
    const ladoB=somaLado>=0?1:-1;
    /* O corpo v69 já mantém A/B sincronizados por seção. Girar somente B
       depois disso quebra o offset 2D e pode recriar o dente que acabamos
       de podar; o reparo unilateral fica reservado ao gerador legado. */
    for(let bloco=0;!corpoCurva69&&bloco<4;bloco++){
      const ativos=new Set();
      for(let i=1;i<A3.length-1;i++)if(defeitoB(i))
        for(let j=Math.max(1,i-1);j<=Math.min(A3.length-2,i+1);j++)ativos.add(j);
      if(!ativos.size)break;
      /* Suavização restrita ao pequeno grupo defeituoso. Cada ponto
         continua no círculo de raio W da sua seção de A; só sua direção
         transversal é ajustada para ficar entre os vizinhos de B. */
      for(let it=0;it<48;it++){
        const nova=new Map();
        for(const i of ativos){
          const alvo=[(B2[i-1][0]+B2[i+1][0])/2,(B2[i-1][1]+B2[i+1][1])/2],
            pa=A3[i-1],pp=A3[i+1],tx=pp[0]-pa[0],ty=pp[1]-pa[1],tl=Math.hypot(tx,ty)||1;
          let vx=alvo[0]-A3[i][0],vy=alvo[1]-A3[i][1],vl=Math.hypot(vx,vy);
          if(vl<1e-9||Math.sign(tx*vy-ty*vx)!==ladoB){
            vx=-ty/tl*ladoB;vy=tx/tl*ladoB;vl=1;
          }
          nova.set(i,[A3[i][0]+vx/vl*Math.abs(WS),
            A3[i][1]+vy/vl*Math.abs(WS)]);
        }
        for(const [i,q] of nova){B2[i][0]=q[0];B2[i][1]=q[1];}
      }
      reparosCurva+=ativos.size;resolveFaceGreide();
    }
    if(reparosCurva)corredorTrafegavel.reparosCurva=reparosCurva;
  }
  if(res.faceAudit){
    let wMin=Infinity,wMax=-Infinity,faceMin=Infinity,faceMax=-Infinity;
    const facePublicada=[];
    for(let i=0;i<A3.length;i++){
      /* As bocas são pinos topológicos herdados do desenho anterior e não
         podem ser movidas. A largura paramétrica é auditada nas seções
         físicas internas; eventual diferença milimétrica do par encaixado
         permanece como veio do CAD, sem deslocar saída ou chegada. */
      if(!curva69Guardada&&B2[i]&&(A3.length<=2||(i>0&&i<A3.length-1))){
        const wi=Math.hypot(A3[i][0]-B2[i][0],A3[i][1]-B2[i][1]);
        wMin=Math.min(wMin,wi);wMax=Math.max(wMax,wi);
      }
      if(i>0&&i<A3.length-1&&!curva69Guardada){
        const t=Math.abs(dz)>1e-9?Math.abs((A3[i][2]-z0)/dz):0,
          sc=secaoGuiada(t,i),h=Math.abs(A3[i][2]-z0),
          d=Math.hypot(A3[i][0]-sc.qPartida[0],A3[i][1]-sc.qPartida[1]);
        if(d>1e-8&&h>1e-8){
          const af=Math.atan2(h,d)*180/Math.PI;
          if(opt&&opt._debug)facePublicada.push({i,t,s:sc.s,h,d,angulo:af,
            ponto:A3[i].slice(),partida:sc.qPartida.slice()});
          faceMin=Math.min(faceMin,af);faceMax=Math.max(faceMax,af);
        }
      }
    }
    if(!curva69Guardada){
      res.faceAudit.widthMin=Number.isFinite(wMin)?wMin:res.faceAudit.widthMin;
      res.faceAudit.widthMax=Number.isFinite(wMax)?wMax:res.faceAudit.widthMax;
      res.faceAudit.faceMin=Number.isFinite(faceMin)?faceMin:res.faceAudit.faceMin;
      res.faceAudit.faceMax=Number.isFinite(faceMax)?faceMax:res.faceAudit.faceMax;
    }
    res.faceAudit.grade=LEixo>1e-9?Math.abs(dz)/LEixo*100:Infinity;
    if(opt&&opt._debug){
      if(curva69Guardada)
        for(let i=1;i<A3.length-1;i++){
          if(!degrau&&Number.isFinite(exA[i])&&exA[i]<Lent-1e-6)continue;
          const w69=wk.noS(curva69Estacoes&&Number.isFinite(curva69Estacoes[i])?
              curva69Estacoes[i]:cavaNearestChain(peNat,chD,A3[i])),
            r69=(A3[i][0]-w69.p[0])*w69.n[0]+(A3[i][1]-w69.p[1])*w69.n[1],
            d69=Math.abs(runS-r69),h69=Math.abs(A3[i][2]-z0),
            a69=(d69>1e-8&&h69>1e-8)?Math.atan2(h69,d69)*180/Math.PI:ang;
          facePublicada.push({i,angulo:a69,ponto:A3[i].slice(),segueRampa:true});
        }
      res._facePublicada=facePublicada;
    }
  }
  /* ATUAL 107 — PROVA TERMINAL DA PISTA (depois da face e das soldas). */
  {
    const X107=(a,b,c,d)=>{
      const den=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]);
      if(Math.abs(den)<1e-12)return false;
      const t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/den,
        u=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/den;
      return t>1e-6&&t<1-1e-6&&u>1e-6&&u<1-1e-6;
    };
    const cruza107=(P,Q)=>{
      let n=0;
      for(let i=0;i<P.length-1;i++)for(let j=0;j<Q.length-1;j++)
        if(X107(P[i],P[i+1],Q[j],Q[j+1]))n++;
      return n;
    };
    const debugAntes107=opt&&opt._debug?{
      A:A3.map(p=>p.slice()),B:B2.map(p=>p.slice()),cruzamentos:cruza107(A3,B2)
    }:null;
    const nc107=cruza107(A3,B2);
    /* Cruzamento é condição EDITÁVEL, não impossibilidade geométrica. Não
       deslocamos vértices internos para escondê-lo, porque isso alteraria a
       lei da face e a declividade. Publica a bancada fiel aos parâmetros e
       deixa o operador corrigir crista/pé para a próxima iteração. */
    if(nc107)res.aviso=(res.aviso?res.aviso+' · ':'')+
      `rampa publicada com ${nc107} cruzamento(s); edite a crista ou o pé e continue`;
    if(opt&&opt._debug)res._debug={A:A3.map(p=>p.slice()),B:B2.map(p=>p.slice()),
      cruzamentos:nc107,aposCrava:debugAposCrava,antes107:debugAntes107,
      bocaPrimeiraA,bocaPrimeiraB,
      iniA:A3[0].slice(),iniB:B2[0].slice(),
      fimA:A3.at(-1).slice(),fimB:B2.at(-1).slice(),sIni,sFim,dirA,
      encaixeTrafegavel,corredorTrafegavel,
      facePublicada:(res._facePublicada||[]).sort((a,b)=>a.angulo-b.angulo)};
  }
  return {peNatural:peNat,peBerma:(peBerma&&peBerma.length>2?peBerma:peD),
    peEntregue:peD,bordaA:A3,bordaB:B2,eixo:E2,
    sIni,sFim,
    /* Par exato da chegada: os dois cantos pertencem à linha de pé e a
       junta entre eles é normal ao anel. A próxima bancada prolonga esse
       par rigidamente pela direção efetiva da rampa. */
    pFim:A3[A3.length-1].slice(),
    pFimB:B2[B2.length-1].slice(),
    run,L,arco,per,faceAudit:res.faceAudit||null,warn:res.aviso||'',_debug:res._debug};
}
