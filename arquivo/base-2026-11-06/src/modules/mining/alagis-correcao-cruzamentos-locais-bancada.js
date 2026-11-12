
/* A função efetiva aceita contatos concentrados da ligação entre bermas,
   mas continua recusando cruzamentos reais espalhados pelo desenho. */
function rb31Gerar(sil){
  const st=rb31Estado(),el=id=>document.getElementById(id);
  /* FONTE TROCADA: a seleção do passo 1 aponta uma fonte que NÃO é a do
     estado corrente (ex.: uma crista da pilha antiga para continuar em
     alteamento). O estado antigo não pode capturar o clique — zera e
     segue como projeto novo daquela fonte; a pilha antiga permanece
     desenhada e com a própria receita. */
  if(st.banco>0&&!window.__rb31EmReplay){
    try{
      const bs=cavaItemSelecionado();
      if(bs&&bs.L){
        const mesma=String(bs.L.id)===String(st.srcLayerId)||
          (S.layers||[]).some(x=>x._cavaLimiteDin&&
            String(x.id)===String(st.srcLayerId)&&
            String(x._cavaLimiteOrig)===String(bs.L.id)&&
            (x._cavaLimiteOrigFeat==null||+x._cavaLimiteOrigFeat===+(bs.i||0)));
        if(!mesma){ S._rb31=null; return rb31Gerar(sil); }
      }
    }catch(e){}
  }
  if(!window.__rb31EmReplay&&st.banco===0&&(!st.feats||!st.feats.length)&&
    rb31Reconecta(sil))return true;
  /* regeração sem resquícios: antes da berma, um novo clique refaz a
     bancada com os parâmetros atuais. No banco 1, TUDO é reconstruído
     do zero (relê o limite, o início e a cota — troca de limite ou de
     clique não deixa sobras); nos bancos seguintes, só o banco atual
     é substituído. */
  if(st.fase==='pe'){
    if(st.banco<=1){
      st.feats=[];st.crista=null;st.banco=0;st.z=null;
      st.hist=[];st.paramBancos=[];st.eixos=[];
      const zEl=document.getElementById('rb31Z0');
      /* a cota volta a ser lida do desenho/clique, salvo edição manual */
    }else{
      st.feats=st.feats.filter(f=>+(f.props&&f.props.BANCO)!==st.banco);
      st.banco--;
      if(st.hist&&st.hist.length)st.hist.pop();
      if(st.paramBancos&&st.paramBancos.length)st.paramBancos.pop();
      if(st.eixos&&st.eixos.length)st.eixos.pop();
    }
    st.fase='crista';
  }
  if(!st.crista&&st.banco>0&&!window.__rb31EmReplay){
    /* estado restaurado da RECEITA (reabertura do arquivo/comando) ainda
       sem geometria: reconstrói pelo replay. Ler o LIMITE aqui geraria a
       bancada N+1 a partir do anel da cota inicial, por cima dos bancos
       já desenhados — era a recusa com 8 cruzamentos após reabrir. */
    try{ rb31Replay(); }catch(e){}
    if(S._rb31&&S._rb31.crista)return rb31Gerar(sil);
  }
  if(!st.crista&&!rb31LeLimite(st))return false;
  rb31SincronizaCrista(st); /* crista intermediária editada manda na próxima */
  const ang=+el('rb31Ang').value,H=+el('rb31H').value,W=+el('rb31W').value,
    g=+el('rb31G').value,dir=el('rb31Dir').value;
  if(!(ang>0&&ang<90&&H>0&&W>0&&g>0&&g<=30)){toast('Revise talude, altura, largura e declividade');return false;}
  /* Lado/Vertical do painel da cava valem também aqui: "Outside" gera os
     bancos PARA FORA do limite e "Up" faz cada banco SUBIR (pilha/aterro) */
  /* LADO/VERTICAL TRAVADOS POR PILHA. Estes dois selects eram relidos a cada
     banco; bastava o painel voltar para "Inside" entre um clique e outro para
     o banco seguinte nascer com o offset INVERTIDO — o anel degenerava e a
     rampa saía com 3 vértices cortando as bermas (medido: fora=true → 49
     vértices; fora=false na mesma crista → 3). O banco 1 define o lado e o
     sentido; os seguintes usam o que ficou gravado no estado, e os selects
     são resincronizados para o painel dizer a verdade. */
  let fora,up;
  if(st.banco===0){
    /* banco 0 com trava JÁ definida = replay/receita: a trava manda e o
       painel é ressincronizado; sem trava, é um projeto novo e o painel
       define. */
    if(st.travaFora!==undefined){
      fora=!!st.travaFora; up=!!st.travaUp;
      try{const sl=document.getElementById('cavaLado'),sv=document.getElementById('cavaSentido');
        if(sl)sl.value=fora?'outside':'inside';
        if(sv)sv.value=up?'up':'down';}catch(e){}
    }else{
      fora=(document.getElementById('cavaLado')||{}).value==='outside';
      up=(document.getElementById('cavaSentido')||{}).value==='up';
      st.travaFora=fora; st.travaUp=up;
    }
  }else{
    fora=(st.travaFora!==undefined)?!!st.travaFora
        :((document.getElementById('cavaLado')||{}).value==='outside');
    up=(st.travaUp!==undefined)?!!st.travaUp
        :((document.getElementById('cavaSentido')||{}).value==='up');
    try{
      const sl=document.getElementById('cavaLado'), sv=document.getElementById('cavaSentido');
      if(sl&&((sl.value==='outside')!==fora)){ sl.value=fora?'outside':'inside';
        toast('Lado retravado em '+(fora?'Outside (pilha)':'Inside (cava)')+' — definido no banco 1'); }
      if(sv&&((sv.value==='up')!==up)) sv.value=up?'up':'down';
    }catch(e){}
  }
  const opt={ang,H,W,grade:g,dir,fora,up,
    berma:+el('rb31B').value||0};
  if(Array.isArray(st._peControle105)&&st._peControle105.length>2)
    opt.peControle=st._peControle105.map(p=>[+p[0],+p[1]]);
  let modoNovo=false;
  const novoInicioSolicitado=!!(st.novoInicioP||st.novoSoleira||st._vincoPendente133);
  /* A rampa é opt-in. Sem um ponto marcado pelo usuário, o primeiro
     vértice do limite NÃO pode virar uma origem implícita. Nesse caso a
     bancada será publicada em estado bruto (talude + berma completa). */
  if(st.banco===0)opt.startP=st.startP?st.startP.slice():null;
  else if(st.novoInicioP||st.novoSoleira){
    /* CONTINUAÇÃO EM OUTRO PONTO: a bancada nasce na SOLEIRA marcada
       (reta ortogonal à crista) — o vão entre a chegada da rampa de
       cima e este início é o que o usuário escolheu, não o offset.
       A soleira é relida da camada: se foi arrastada, vale a nova
       posição. */
    const sol=rb31LeSoleira(st);
    opt.startP=(sol?sol[0]:st.novoInicioP).slice();
    if(sol)opt.soleira=sol.map(p=>p.slice());
    modoNovo=true;st.novoInicioP=null;st.novoSoleira=null;
    st.feats=st.feats.filter(f=>!(f.props&&f.props.CLASSE==='rb31-soleira'));
  }else{
    /* CONTINUAÇÃO ENTRE BERMAS: a rampa anterior termina na linha de
       chegada fechada. O offset de B metros gera a linha de PARTIDA da
       bancada seguinte; a nova rampa nasce diretamente nesse par, sem
       desenhar as bordas roxas atravessando a berma. */
    const cA=st.proxIniA?st.proxIniA.slice():null,
      cB=st.proxIniB?st.proxIniB.slice():null;
    opt.startP=cA||st.pFim;opt.entradaDegrau=true;
    if(cA&&cB){
      opt.solIniA=cA;opt.solIniB=cB;opt.solDireto=true;
    }else{
      if(st.pFim)opt.solIniA=st.pFim.slice();
      if(st.pFimB)opt.solIniB=st.pFimB.slice();
    }
    if(st.pFimDir)opt.solDir=st.pFimDir.slice();
  }
  /* AUTOCORREÇÃO: se a bancada sair com linhas cruzadas (bico fechado
     demais no limite), a crista é chanfrada e a bancada refeita, até
     que não haja mais cruzamento. */
  const ultimoHist=(st.hist&&st.hist.length)?st.hist[st.hist.length-1]:null,
    semInicioMarcado=st.banco===0?!st.startP:
      !!(ultimoHist&&ultimoHist.sem&&!novoInicioSolicitado),
    semR=!!st.semRampa||((st.banco+1)<=(+st.semRampaAte||0))||!!st._semEste||
      semInicioMarcado;
  st._semEste=false; /* consumo por banco: setado pelo replay do plano de rampas */
  opt.semRampa=semR;
  opt.zonasDeg=((st.hist||[]).map(h=>h&&h.startP).filter(Boolean))
    .concat(st.pFim?[st.pFim]:[]);
  let tent=rb31GeraSemCruzar(st.crista,st.z,opt,W,rb31LinhasAnteriores(st)),r=tent.r;
  if(!r||!r.peEntregue){toast((r&&r.warn)||'Não foi possível gerar a bancada');return false;}
  /* GRADE EXATA POR CONVERGÊNCIA BIDIRECIONAL. A limpeza/mitra pode deixar a
     borda entregue mais curta OU mais longa que H/grade. Ajusta o arco nos
     dois sentidos e conserva o melhor resultado; assim o Z final continua
     sendo exatamente H e a declividade não depende da forma do anel. */
  try{
    const Lalvo=H/(g/100);
    let melhor={tent,r,erro:Infinity},acima=null,abaixo=null,amostras=[];
    for(let volta=0;volta<24&&r&&r.bordaA&&r.bordaA.length>1;volta++){
      /* A lei longitudinal pertence ao EIXO da pista. Em curva, as duas
         bordas paralelas têm comprimentos diferentes por definição. */
      const linhaG=(r.eixo&&r.eixo.length>1)?r.eixo:r.bordaA;
      let Lf=0;
      for(let i=1;i<linhaG.length;i++)
        Lf+=Math.hypot(linhaG[i][0]-linhaG[i-1][0],linhaG[i][1]-linhaG[i-1][1]);
      const erro=Math.abs(Lf-Lalvo)/Math.max(1e-9,Lalvo);
      if(erro<melhor.erro)melhor={tent,r,erro};
      if(erro<=0.0005)break; /* 0,05%: 5 cm em 100 m */
      const fatorAtual=(opt._fatorL)||1,gradeAtual=Math.abs(H)/Math.max(1e-9,Lf)*100,
        ponto={f:fatorAtual,g:gradeAtual};
      amostras.push(ponto);
      if(gradeAtual>=g){
        if(!acima||Math.abs(gradeAtual-g)<Math.abs(acima.g-g))acima=ponto;
      }else if(!abaixo||Math.abs(gradeAtual-g)<Math.abs(abaixo.g-g))abaixo=ponto;
      if(acima&&abaixo&&Math.abs(acima.g-abaixo.g)>1e-10){
        /* A limpeza pode mudar discretamente o número de vértices e fazer
           a correção multiplicativa oscilar dos dois lados do greide. Uma
           vez obtido o intervalo, interpola o fator onde grade = alvo. */
        let f=abaixo.f+(g-abaixo.g)*(acima.f-abaixo.f)/(acima.g-abaixo.g);
        const f0=Math.min(acima.f,abaixo.f),f1=Math.max(acima.f,abaixo.f);
        if(!(f>f0+1e-7&&f<f1-1e-7))f=(f0+f1)/2;
        /* Em mudança discreta de topologia a secante pode devolver sempre
           o mesmo fator já ensaiado. Nesse caso, subdivide o maior vão
           ainda não amostrado dentro do intervalo. A busca continua
           convergindo sem alongar ou podar artificialmente a curva. */
        if(amostras.some(q=>Math.abs(q.f-f)<1e-7)){
          const xs=[f0,f1].concat(amostras.map(q=>q.f).filter(x=>x>f0&&x<f1))
            .sort((a,b)=>a-b);
          let ga=-1,k=0;for(let j=1;j<xs.length;j++)if(xs[j]-xs[j-1]>ga){ga=xs[j]-xs[j-1];k=j;}
          f=(xs[k-1]+xs[k])/2;
        }
        opt._fatorL=Math.max(.25,Math.min(4,f));
      }else{
        const razao=Math.max(.65,Math.min(1.55,Lalvo/Math.max(1e-6,Lf)));
        opt._fatorL=Math.max(.25,Math.min(4,fatorAtual*razao));
      }
      const t2=rb31GeraSemCruzar(st.crista,st.z,opt,W,rb31LinhasAnteriores(st));
      if(t2&&t2.r&&t2.r.peEntregue){tent=t2;r=t2.r;}
      else break;
    }
    /* A última tentativa pode ultrapassar o alvo; publica a mais próxima. */
    if(melhor.r){tent=melhor.tent;r=melhor.r;}
    opt._fatorL=null;
  }catch(e){}
  /* Contrato único v77: nenhuma ferramenta publica uma rampa se o limite
     controlador não conservar o ângulo da face ou se a pista afunilar.
     O usuário mantém a última bancada válida em vez de receber geometria
     aparentemente pronta, porém impraticável para caminhões. */
  if(!opt.semRampa&&r&&r.faceAudit){
    const a=r.faceAudit,erro=Math.max(Math.abs(a.faceMin-ang),Math.abs(a.faceMax-ang)),
      erroW=Math.max(Math.abs(a.widthMin-W),Math.abs(a.widthMax-W)),
      erroG=Math.abs(a.grade-g);
    /* A topologia poligonal pode alternar uma amostra inteira no limite do
       comprimento. Aceita no máximo 0,10 ponto percentual de diferença,
       sempre com greide uniforme na pista; nunca uma inclinação variável. */
    if(erro>0.10||erroW>Math.max(.03,Math.abs(W)*.005)||erroG>Math.max(.10,g*.005)){
      const msg=`Rampa recusada: face ${a.faceMin.toFixed(2)}°–${a.faceMax.toFixed(2)}° `+
        `(alvo ${ang.toFixed(2)}°), largura ${a.widthMin.toFixed(2)}–${a.widthMax.toFixed(2)} m `+
        `(alvo ${W.toFixed(2)} m), declividade ${a.grade.toFixed(3)}% (alvo ${g.toFixed(3)}%).`;
      toast(msg);try{cmdLog('rb31: '+msg,'erro');}catch(e){}return false;
    }
  }
  /* MODO SEM RAMPA (pilha "bruta"): os anéis saem limpos — pé NATURAL
     (offset puro, sem o vinco/jog da entrada) e nenhuma borda de rampa é
     desenhada. Usado por "Limpar rampa"; o reposicionamento religa. */
  if(opt.semRampa){
    if(tent.corrigido&&tent.crista!==st.crista){
      st.crista=tent.crista;
      rb31AtualizaCristaDesenhada(st,tent.crista);
    }
    st.banco++;st.fase='pe';
    st.zPe=st.z+(opt.up?+H:-H);
    st.pe=r.peNatural;
    /* A cava bruta não tem boca de rampa. Estes pontos pertencem apenas ao
       cálculo auxiliar e não podem condicionar o offset da berma seguinte. */
    st.pFim=null;st.pFimB=null;st.pFimDir=null;
    st.proxIniA=null;st.proxIniB=null;
    st.hist=st.hist||[];
    st.hist.push({startP:opt.startP?opt.startP.slice():null,degrau:!!opt.entradaDegrau,
      sem:true,ang,H,W,grade:g,dir,fora,up});
    st.paramBancos=st.paramBancos||[];
    st.paramBancos.push({banco:st.banco,ang,H,W,grade:g,dir,fora,up,
      zCrista:st.z,zPe:st.zPe});
    const gPeN=rb31Fecha(rb31DespikeFechado(rb31Fecha(r.peNatural)).slice(0,-1));
    st.pe=gPeN.map(p=>p.slice());
    const nomeFim=up?'Crista':'Pé',classeFim=up?'rb31-crista':'rb31-pe';
    st.feats.push({geom:gPeN,multi:false,zg:gPeN.map(()=>st.zPe),
      props:{TIPO:nomeFim+' banco '+st.banco,BANCO:st.banco,COTA:+st.zPe.toFixed(3),
        ALTURA:H,BERMA:null,ANGULO:ang,CLASSE:classeFim}});
    rb31Desenha(st);
    try{ if(typeof rb31LimpaMarcaInicio==='function')rb31LimpaMarcaInicio(); }catch(e){}
    if(!sil)toast('Bancada '+st.banco+' (sem rampa) — '+nomeFim.toLowerCase()+
      ' na cota '+st.zPe.toFixed(2));
    return true;
  }
  /* Rampa DEGENERADA não é entregue. O sintoma do lado invertido é a borda
     sair com meia dúzia de vértices em linhas retas cruzando as bermas — a
     limpeza de spikes engolia o zigue-zague e sobrava um Z de 3 pontos. O
     comprimento esperado do eixo é dz/grade: borda muito curta em vértices
     para esse comprimento = geração inválida, e o certo é recusar dizendo a
     causa provável, não desenhar lixo. */
  {
    const Lesp=(H/g)*100;
    const nMin=2; /* a pista por MITRA é esparsa por projeto — num trecho
      reto ela tem 2-3 pontos e está PERFEITA; degeneração é só por
      COMPRIMENTO */
    const curta=l=>{
      if(!l||l.length<2)return true;
      if(l.length<nMin)return true;
      let Lc=0;
      for(let i=1;i<l.length;i++)
        Lc+=Math.hypot(l[i][0]-l[i-1][0],l[i][1]-l[i-1][1]);
      return Lc<Lesp*0.55;
    };
    if(curta(r.bordaA)||curta(r.bordaB)){
      /* AUTO-REPARO ANTES DE RECUSAR: quando só a borda INTERNA colapsou
         (canto fechado engolido pela limpeza) e a externa está íntegra, a
         interna é reconstruída como PARALELA AMOSTRADA da externa — mesma
         técnica da prova de largura — e a bancada é entregue. A recusa
         fica só para o caso em que a própria externa degenerou. */
      let reparou=false;
      if(!curta(r.bordaA)&&r.bordaA&&r.bordaA.length>=nMin){
        try{
          /* preserva a boca REAL já escolhida na quebra. Usar solIniB
             recolocava a borda na chegada do trecho anterior e desfazia
             silenciosamente a solda v83 durante o auto-reparo. */
          const A=r.bordaA,Wr=Math.abs(W),
            alvoIniB=(r.bordaB&&r.bordaB.length)?r.bordaB[0].slice():null;
          const paralela=sg=>{
            const out=[];let ultArc=-9;
            const arc=[0];
            for(let i=1;i<A.length;i++)
              arc.push(arc[i-1]+Math.hypot(A[i][0]-A[i-1][0],A[i][1]-A[i-1][1]));
            for(let i=0;i<A.length;i++){
              if(arc[i]-ultArc<2&&i>0&&i<A.length-1)continue;
              ultArc=arc[i];
              const i0=Math.max(0,i-1),i1=Math.min(A.length-1,i+1);
              const tx=A[i1][0]-A[i0][0],ty=A[i1][1]-A[i0][1],
                tl=Math.hypot(tx,ty)||1;
              out.push([A[i][0]+(-ty/tl)*sg*Wr,A[i][1]+(tx/tl)*sg*Wr,A[i][2]||0]);
            }
            return out;
          };
          const c1=paralela(1),c2=paralela(-1);
          const alvoB=r.pFimB||(r.bordaB&&r.bordaB[r.bordaB.length-1])||null;
          const dfim=P=>alvoB?Math.hypot(P[P.length-1][0]-alvoB[0],
            P[P.length-1][1]-alvoB[1]):1e9;
          let nB=(dfim(c1)<=dfim(c2))?c1:c2;
          /* folga exata: em curva côncava a paralela crua toca a externa —
             cada ponto é empurrado pelo ponto mais próximo até W, e ponto
             que regride (dobra fechada) fica de fora */
          {
            const projA=p=>{
              let m=1e9,q=[A[0][0],A[0][1]];
              for(let i=1;i<A.length;i++){
                const a=A[i-1],b=A[i],dx=b[0]-a[0],dy=b[1]-a[1],
                  L2=dx*dx+dy*dy||1;
                let t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L2;
                t=Math.max(0,Math.min(1,t));
                const x=a[0]+t*dx,y=a[1]+t*dy,d=Math.hypot(p[0]-x,p[1]-y);
                if(d<m){m=d;q=[x,y];}
              }
              return {q,d:m};
            };
            const fx=[];let ant=null;
            for(const p of nB){
              let px=p[0],py=p[1];
              const pr=projA([px,py]);
              if(pr.d>1e-6&&pr.d<Wr-0.05){
                px=pr.q[0]+(px-pr.q[0])/pr.d*Wr;
                py=pr.q[1]+(py-pr.q[1])/pr.d*Wr;
              }
              if(ant&&Math.hypot(px-ant[0],py-ant[1])<0.3)continue;
              fx.push([px,py,p[2]||0]);ant=[px,py];
            }
            if(fx.length>2)nB=fx;
          }
          nB=rb31DesenrolaLinha(nB);
          if(nB.length>=nMin){
            if(alvoIniB)nB[0]=[alvoIniB[0],alvoIniB[1],nB[0][2]||0];
            if(alvoB)nB[nB.length-1]=[alvoB[0],alvoB[1],nB[nB.length-1][2]||0];
            r.bordaB=nB;
            if(r.eixo&&r.eixo.length){
              r.eixo=A.map(p=>{
                let m=1e9,q=nB[0];
                for(let i=1;i<nB.length;i++){
                  const a=nB[i-1],b=nB[i],dx=b[0]-a[0],dy=b[1]-a[1],
                    L2=dx*dx+dy*dy||1;
                  let t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L2;
                  t=Math.max(0,Math.min(1,t));
                  const x=a[0]+t*dx,y=a[1]+t*dy,d=Math.hypot(p[0]-x,p[1]-y);
                  if(d<m){m=d;q=[x,y];}
                }
                return [(p[0]+q[0])/2,(p[1]+q[1])/2,p[2]||0];
              });
            }
            /* ACEITE: o reparo só vale se devolver corredor de verdade —
               largura mínima ≥ 0,5·W fora das pontas; senão é recusa
               honesta, não desenho de 0,3 m (limite editado de 23/08). */
            let wOk=1e9;
            for(let i2=4;i2<A.length-3;i2++){
              let m2=1e9;
              for(let j2=1;j2<nB.length;j2++){
                const a2=nB[j2-1],b2=nB[j2],dx=b2[0]-a2[0],dy=b2[1]-a2[1],
                  L4=dx*dx+dy*dy||1;
                let t2=((A[i2][0]-a2[0])*dx+(A[i2][1]-a2[1])*dy)/L4;
                t2=Math.max(0,Math.min(1,t2));
                m2=Math.min(m2,Math.hypot(A[i2][0]-(a2[0]+t2*dx),A[i2][1]-(a2[1]+t2*dy)));
              }
              wOk=Math.min(wOk,m2);
            }
            if(wOk<0.5*Wr){reparou=false;}
            else{
            reparou=true;
            try{cmdLog('rb31: borda interna degenerada reconstruída como paralela da externa no banco '+
              (st.banco+1),'avisa');}catch(e){}
            }
          }
        }catch(e){}
      }
      if(!reparou){
        const nA=(r.bordaA||[]).length,nB2=(r.bordaB||[]).length;
        toast('Rampa degenerada (externa '+nA+' / interna '+nB2+' vértices para ~'+
          Lesp.toFixed(0)+' m de eixo). Confira Lado e Vertical no painel e gere de novo — nada foi desenhado.');
        try{ cmdLog('rb31: rampa degenerada recusada no banco '+(st.banco+1)+
          ' — bordaA='+nA+', bordaB='+nB2+', fora='+opt.fora+', up='+opt.up,'erro'); }catch(e){}
        return false;
      }
    }
  }
  /* Cruzamentos com bancos anteriores são publicados e ficam editáveis. */
  if(tent.ant>0){
    const aviso='A bancada '+(st.banco+1)+' foi desenhada com '+tent.ant+
      ' cruzamento(s) com bancos anteriores. Edite a crista ou o pé nessa região; '+
      'a rampa se ajustará automaticamente e a iteração poderá continuar.';
    const iEl=el('rb31Info');if(iEl)iEl.textContent=aviso;
    if(!sil)toast(aviso);
    try{ cmdLog(aviso,'avisa'); }catch(e){}
  }
  let avisoCruz='';
  if(tent.corrigido&&tent.crista!==st.crista){
    st.crista=tent.crista;
    rb31AtualizaCristaDesenhada(st,tent.crista);
    avisoCruz=tent.restou?
      'Geometria cruzada corrigida em parte — reveja o canto marcado':
      'Canto fechado corrigido automaticamente: a crista foi ajustada para não cruzar linhas';
  }
  st.banco++;st.fase='pe';st.pe=r.peEntregue;
  /* O offset da berma parte do pé natural, contínuo e paralelo. O pé
     entregue contém a abertura transversal da rampa e continua sendo o que
     aparece no desenho; guardá-los separadamente impede que o offset copie o
     dente da abertura para todas as cristas seguintes. */
  st.peNatural=(r.peNatural||r.peEntregue).map(p=>[p[0],p[1]]);
  st.peBerma=(r.peBerma||r.peEntregue).map(p=>[p[0],p[1]]);
  st.ultimaRampaA=(r.bordaA||[]).map(p=>[p[0],p[1]]);
  st.ultimaRampaB=(r.bordaB||[]).map(p=>[p[0],p[1]]);
  st.pFim=[r.pFim[0],r.pFim[1]];
  st.pFimB=r.pFimB?[r.pFimB[0],r.pFimB[1]]:null;
  /* direção de CHEGADA (último trecho da borda externa): a travessia da
     berma continua reta nessa direção — corredor sem quebra */
  try{
    const gA=r.bordaA,n2=gA.length;
    const dx=gA[n2-1][0]-gA[n2-2][0],dy=gA[n2-1][1]-gA[n2-2][1],
      dn=Math.hypot(dx,dy)||1;
    st.pFimDir=[dx/dn,dy/dn];
  }catch(e){st.pFimDir=null;}
  /* TRAVESSIA DA BERMA NO PAR EXATO: a berma desenhada herdava o eco da
     parede da junta anterior (jog 2–8 m deslocado do par) — sobravam o
     degrau duplo e linhas que não se encontravam nos cantos. O trecho da
     berma que cruza o corredor é substituído pelo próprio par da soleira:
     tudo fecha nos dois cantos, como na referência Datamine. */
  /* v81: PROIBIDO talhar a berma/crista para receber a rampa. O encaixe
     acontece somente nas bordas roxas e usa a quebra que o offset já
     produziu. */
  if(false&&opt.entradaDegrau&&opt.solIniA&&opt.solIniB){
    try{
      const fb=st.feats.find(f=>f.props&&f.props.TIPO===
        'Berma banco '+(st.banco-1)+' (crista da bancada seguinte)');
      if(fb&&fb.geom&&fb.geom.length>6){
        /* o talho é PROJETO (conserta o anel para a próxima marcha): opera
           na geometria de projeto; o clip de apresentação re-deriva depois */
        const g=(fb._geomProjeto&&fb._geomProjeto.length>6)?fb._geomProjeto:fb.geom,
          Wa=Math.abs(W);
        const proj=q=>{
          let best={d:1e9,i:0,t:0};
          for(let i=1;i<g.length;i++){
            const a=g[i-1],b=g[i],dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy||1;
            let t=((q[0]-a[0])*dx+(q[1]-a[1])*dy)/L2;
            t=Math.max(0,Math.min(1,t));
            const d=Math.hypot(q[0]-(a[0]+t*dx),q[1]-(a[1]+t*dy));
            if(d<best.d)best={d,i:i-1,t};
          }
          return best;
        };
        /* o par da SAÍDA é o início real das bordas entregues (depois da
           translação rígida) — solIniA/B são o par de CHEGADA do trecho
           anterior e podem cair metros antes da boca */
        if(!r.bordaA||!r.bordaA.length||!r.bordaB||!r.bordaB.length)throw 0;
        const pA=[r.bordaA[0][0],r.bordaA[0][1]],
          pB=[r.bordaB[0][0],r.bordaB[0][1]];
        /* trecho contíguo da berma DENTRO da boca: pontos a <1,2·W do
           SEGMENTO do par, em volta do ponto mais próximo. Só esse run é
           substituído pelo par — a berma que acompanha o pé da face ao
           lado da rampa fica intacta. */
        const dSeg=q=>{
          const dx=pB[0]-pA[0],dy=pB[1]-pA[1],L2=dx*dx+dy*dy||1;
          let t=((q[0]-pA[0])*dx+(q[1]-pA[1])*dy)/L2;
          t=Math.max(0,Math.min(1,t));
          return Math.hypot(q[0]-(pA[0]+t*dx),q[1]-(pA[1]+t*dy));
        };
        let mi0=0,md0=1e9;
        for(let i=0;i<g.length;i++){const d=dSeg(g[i]);if(d<md0){md0=d;mi0=i;}}
        if(md0<1.2*Wa){
          let i0=mi0,i1=mi0;
          while(i0>1&&dSeg(g[i0-1])<1.2*Wa)i0--;
          while(i1<g.length-2&&dSeg(g[i1+1])<1.2*Wa)i1++;
          let span=0;
          for(let i=i0+1;i<=i1;i++)
            span+=Math.hypot(g[i][0]-g[i-1][0],g[i][1]-g[i-1][1]);
          if(span<=3*Wa&&i1>i0){
            /* ordem do par conforme o sentido da linha */
            const dA=Math.hypot(g[i0][0]-pA[0],g[i0][1]-pA[1]),
              dB=Math.hypot(g[i0][0]-pB[0],g[i0][1]-pB[1]);
            const pFirst=dA<=dB?pA:pB,pSecond=dA<=dB?pB:pA;
            g.splice(i0,i1-i0+1,[pFirst[0],pFirst[1]],[pSecond[0],pSecond[1]]);
            if(g!==fb.geom){ /* desenho re-derivado da projeto talhada */
              fb.geom=g.map(p=>p.slice());
            }
            if(fb.zg&&fb.zg.length){const zc=fb.zg[0];fb.zg=fb.geom.map(()=>zc);}
          }
        }
      }
    }catch(e){}
  }
  st.zPe=st.z+(up?H:-H);
  st.fora=fora;st.up=up; /* o estado guarda o sentido usado */
  st.hist=st.hist||[];st.eixos=st.eixos||[];
  st.hist.push({startP:opt.startP?opt.startP.slice():null,
    degrau:!!opt.entradaDegrau||!!opt._autoCont,ang,H,W,grade:g,dir,fora,up});
  st.paramBancos=st.paramBancos||[];
  st.paramBancos.push({banco:st.banco,ang,H,W,grade:g,dir,fora,up,
    zCrista:+st.z,zPe:+st.zPe});
  st.eixos.push(r.eixo.map(p=>p.slice()));
  const P={ALTURA:H,BERMA:null,ANGULO:ang,CLASSE:'rb31-rampa'};
  /* AS BORDAS DA RAMPA PARAM NO PAR: a travessia da berma fica LIMPA (sem
     as duas linhas da pista cruzando o patamar) — decisão dele em 23/08
     ("estas linhas da rampa entre a crista e o pé não devem aparecer
     nunca"); a ligação desenhada na travessia (73.53) foi revertida. */
  st.feats.push({geom:r.bordaA.map(p=>[p[0],p[1]]),multi:false,zg:r.bordaA.map(p=>p[2]),
    props:{TIPO:'Rampa banco '+st.banco+' — borda externa',BANCO:st.banco,COTA:null,...P}});
  st.feats.push({geom:r.bordaB.map(p=>[p[0],p[1]]),multi:false,zg:r.bordaB.map(p=>p[2]),
    props:{TIPO:'Rampa banco '+st.banco+' — borda interna',BANCO:st.banco,COTA:null,...P}});
  /* peEntregue já passou pela limpeza construtiva. Uma segunda remoção de
     espinhos aqui apagava justamente um dos vértices da junta seca; então a
     rampa estava correta nos dados, mas parecia chegar no vazio no mapa. */
  /* SANEAMENTO DO ANEL DE PÉ (24/08): em algumas bancadas o pé chegava
     aqui ANINHADO ([anel, [null,null], …]) e o desenho quebrava a partir
     da 4ª bancada ("Invalid LatLng (NaN,NaN)") — com ele, os degraus
     circulados. Achata um nível quando vier assim e descarta qualquer
     ponto não finito antes de publicar. */
  let _pe=r.peEntregue;
  if(Array.isArray(_pe)&&_pe.length&&Array.isArray(_pe[0])&&Array.isArray(_pe[0][0])){
    let maior=_pe[0];
    for(const an of _pe)if(Array.isArray(an)&&an.length>maior.length)maior=an;
    _pe=maior;
  }
  _pe=(_pe||[]).filter(q=>Array.isArray(q)&&Number.isFinite(q[0])&&Number.isFinite(q[1]));
  const gPe=rb31Fecha(_pe);
  /* A linha de CHEGADA é sempre fechada. Na subida ela é a CRISTA
     laranja; somente rb31OffsetBerma cria depois o próximo PÉ preto. */
  st.pe=gPe.map(p=>p.slice());
  r.peEntregue=st.pe.map(p=>p.slice());
  const nomeFim=up?'Crista':'Pé',classeFim=up?'rb31-crista':'rb31-pe';
  st.feats.push({geom:gPe,multi:false,zg:gPe.map(()=>st.zPe),
    props:{TIPO:nomeFim+' banco '+st.banco,BANCO:st.banco,COTA:+st.zPe.toFixed(3),...P,
      CLASSE:classeFim}});
  rb31Desenha(st);
  const info=el('rb31Info');
  if(info)info.innerHTML='Bancada gerada: '+nomeFim.toLowerCase()+' na cota <b>'+st.zPe.toFixed(2)+
    '</b>'+(r.faceAudit?` · face auditada <b>${r.faceAudit.faceMin.toFixed(2)}°–${r.faceAudit.faceMax.toFixed(2)}°</b>`+
      ` · pista <b>${r.faceAudit.widthMin.toFixed(2)} m</b>`:'')+
    '. Ajuste parâmetros e clique de novo para redesenhar.';
  if(r.warn)toast(r.warn);
  else if(avisoCruz){if(!sil)toast(avisoCruz);}
  else if(!sil)toast('Bancada '+st.banco+' gerada — '+nomeFim.toLowerCase()+
    ' na cota '+st.zPe.toFixed(2));
  try{ if(typeof rb31LimpaMarcaInicio==='function')rb31LimpaMarcaInicio(); }catch(e){}
  return true;
}
