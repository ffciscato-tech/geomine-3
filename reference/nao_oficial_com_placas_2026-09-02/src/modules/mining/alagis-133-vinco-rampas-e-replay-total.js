
/* Atual 133 — rampas independentes com vinco reversível e replay total.
   Regras construtivas:
   1) uma nova rampa nasce num par de pontos pertencente à própria linha de
      partida (crista na cava, pé na pilha);
   2) esse par tem exatamente a largura W e é entregue ao mesmo mecanismo de
      soleira usado pela chegada — início e fim compartilham a mesma peça;
   3) finalizar uma rampa não finaliza a cava: as próximas bancadas podem ser
      geradas sem corredor até o operador marcar uma nova rampa;
   4) editar o limite nunca reduz silenciosamente o plano: todas as bancadas
      continuam no alvo e a última atualização obrigatória refaz a família
      inteira. */
(function vincoRampasReplayTotal133(){
  const P=p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])?
    [+p[0],+p[1]]:null;
  const copiaVinco=v=>v&&P(v.A)&&P(v.B)?{A:P(v.A),B:P(v.B),linha:v.linha||null,
    banco:+v.banco||null}:null;
  const copiaHist=h=>Array.isArray(h)?h.map(q=>({
    startP:P(q&&q.startP),degrau:!!(q&&q.degrau),sem:!!(q&&q.sem),
    vinco:copiaVinco(q&&q.vinco),rampaId:q&&q.rampaId||null
  })):[];
  const copiaRampas=r=>Array.isArray(r)?r.map(q=>({
    id:q.id||null,nome:q.nome||null,status:q.status||'ativa',
    banco:+q.banco||1,ateBanco:+q.ateBanco||+q.banco||1,
    ate:Number.isFinite(+q.ate)?+q.ate:null,startP:P(q.startP),
    vinco:copiaVinco(q.vinco)
  })):[];
  const bancoDa=f=>Math.max(0,+((f&&f.props||{}).BANCO)||0);
  const planoTotal=(st,R,L)=>{
    const fontes=[st&&st.hist,st&&st._histAlvo,st&&st._planoCompleto133,
      R&&R.hist,R&&R.histAlvo,R&&R.planoCompleto133].filter(Array.isArray),
      feats=[...((st&&st.feats)||[]),...((L&&L.features)||[])],
      maxFeat=feats.reduce((m,f)=>Math.max(m,bancoDa(f)),0),
      alvo=Math.max(+((st&&st.banco)||0),+((R&&R.banco)||0),maxFeat,
        ...fontes.map(h=>h.length),Array.isArray(st&&st.paramBancos)?st.paramBancos.length:0),
      rampas=copiaRampas((st&&st.rampas)||R&&R.rampas133||R&&R.rampas),out=[];
    for(let i=0;i<alvo;i++){
      const disponiveis=fontes.map(h=>h[i]).filter(Boolean);
      if(disponiveis.length){
        const q=copiaHist([disponiveis[0]])[0];
        for(const s of disponiveis.slice(1)){
          if(!q.startP&&P(s.startP))q.startP=P(s.startP);
          if(!q.vinco&&copiaVinco(s.vinco))q.vinco=copiaVinco(s.vinco);
          if(!q.rampaId&&s.rampaId)q.rampaId=s.rampaId;
        }
        out.push(q);continue;
      }
      const banco=i+1,fr=feats.filter(f=>bancoDa(f)===banco&&
          String((f.props||{}).CLASSE||'')==='rb31-rampa'),
        rd=rampas.find(q=>+q.banco===banco&&P(q.startP)),
        p=rd&&P(rd.startP)||((banco===1&&fr[0]&&fr[0].geom&&P(fr[0].geom[0]))?
          P(fr[0].geom[0]):null);
      out.push({startP:p,degrau:banco>1&&!p,sem:!fr.length,
        vinco:rd&&copiaVinco(rd.vinco),rampaId:rd&&rd.id||null});
    }
    return copiaHist(out);
  };
  const ring=g=>{
    if(!Array.isArray(g))return null;
    const r=g.filter(P).map(P);
    if(r.length>3&&Math.hypot(r[0][0]-r.at(-1)[0],r[0][1]-r.at(-1)[1])<1e-7)r.pop();
    return r.length>=3?r:null;
  };
  const area=R=>{
    let a=0;for(let i=0;i<R.length;i++){const p=R[i],q=R[(i+1)%R.length];a+=p[0]*q[1]-q[0]*p[1];}
    return a/2;
  };
  const cadeia=R=>{
    R=ring(R);if(!R)return null;
    let total=0;const seg=[];
    for(let i=0;i<R.length;i++){
      const a=R[i],b=R[(i+1)%R.length],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);
      if(L>1e-9){seg.push({a,b,dx,dy,L,s:total});total+=L;}
    }
    return total>1e-8?{R,seg,total}:null;
  };
  const noArco=(C,s)=>{
    if(!C||!C.seg.length)return null;
    s=((s%C.total)+C.total)%C.total;
    for(let i=0;i<C.seg.length;i++){
      const e=C.seg[i];
      if(s<=e.s+e.L||i===C.seg.length-1){
        const t=e.L?(s-e.s)/e.L:0;
        return [e.a[0]+t*e.dx,e.a[1]+t*e.dy];
      }
    }
    return C.R[0].slice();
  };
  const projeta=(C,p)=>{
    p=P(p);if(!C||!p)return null;
    let best=null;
    for(const e of C.seg){
      const L2=e.dx*e.dx+e.dy*e.dy;
      let t=((p[0]-e.a[0])*e.dx+(p[1]-e.a[1])*e.dy)/L2;
      t=Math.max(0,Math.min(1,t));
      const q=[e.a[0]+t*e.dx,e.a[1]+t*e.dy],d=Math.hypot(q[0]-p[0],q[1]-p[1]);
      if(!best||d<best.d)best={p:q,d,s:e.s+t*e.L};
    }
    return best;
  };
  const setaEntre=(p,t,L)=>{
    p=P(p);t=P(t);if(!p||!t)return null;
    let dx=t[0]-p[0],dy=t[1]-p[1],d=Math.hypot(dx,dy);if(d<1e-8)return null;
    dx/=d;dy/=d;const len=Math.max(3,Math.min(Math.abs(+L||8),d)),
      tip=[p[0]+dx*len,p[1]+dy*len],asa=Math.max(1.4,len*.32),recuo=len*.34,
      w1=[tip[0]-dx*recuo-dy*asa,tip[1]-dy*recuo+dx*asa],
      w2=[tip[0]-dx*recuo+dy*asa,tip[1]-dy*recuo-dx*asa];
    return [p,tip,w1,tip,w2];
  };
  const setaNoAnel=(p,R,dir,L)=>{
    const C=cadeia(R),q=projeta(C,p);if(!C||!q)return null;
    const sg=((dir==='ccw')===(area(C.R)>0))?1:-1,
      t=noArco(C,q.s+sg*Math.max(3,Math.abs(+L||8)));
    return setaEntre(q.p,t,L);
  };
  const setaNaRampa=(p,g,L)=>{
    const pts=(g||[]).filter(P).map(P);if(pts.length<2)return null;
    const d0=Math.hypot(p[0]-pts[0][0],p[1]-pts[0][1]),
      d1=Math.hypot(p[0]-pts.at(-1)[0],p[1]-pts.at(-1)[1]);
    return d0<=d1?setaEntre(p,pts[Math.min(1,pts.length-1)],L):
      setaEntre(p,pts[Math.max(0,pts.length-2)],L);
  };
  const removeMarcaTemporaria=()=>{
    try{const m=S&&S._rb31StartDirection133;if(m&&typeof map!=='undefined'){
      for(const q of m)try{map.removeLayer(q);}catch(e){}S._rb31StartDirection133=null;}}
    catch(e){}
  };
  const marca0=window.rb31MarcaInicio,limpaMarca0=window.rb31LimpaMarcaInicio;
  window.rb31MarcaInicio=function(p,R,dir){
    try{if(typeof marca0==='function')marca0.apply(this,arguments);}catch(e){}
    removeMarcaTemporaria();
    const st=(typeof S!=='undefined'&&S)&&S._rb31,W=+
      ((document.getElementById('rb31W')||{}).value||10),g=setaNoAnel(p,R,dir,W*.85);
    if(st)st._inicioMarcado133={p:P(p),dir:dir==='cw'?'cw':'ccw',geom:g};
    try{if(g&&typeof window.L!=='undefined'&&typeof map!=='undefined'){
      const ll=g.map(q=>{const w=toWGS(S.workCRS,q[0],q[1]);return[w[1],w[0]];}),
        cor='#f59e0b',linha=window.L.polyline(ll,{color:cor,weight:4,opacity:1,
          interactive:false,pane:'markerPane'}).addTo(map),
        ponto=window.L.circleMarker(ll[0],{radius:6,color:'#fff3cf',weight:2,
          fillColor:cor,fillOpacity:1,interactive:false,pane:'markerPane'}).addTo(map);
      ponto.bindTooltip('Início da rampa · '+(dir==='cw'?'horário':'anti-horário'),
        {permanent:true,direction:'right',offset:[8,0],className:'meas-lbl'});
      S._rb31StartDirection133=[linha,ponto];
    }}catch(e){console.warn('marcador direcional da rampa',e);}
    return g;
  };
  window.rb31LimpaMarcaInicio=function(){
    removeMarcaTemporaria();
    try{if(typeof limpaMarca0==='function')return limpaMarca0.apply(this,arguments);}catch(e){}
  };
  const publicaMarcadores=(st,L)=>{
    if(!L||!Array.isArray(L.features))return;
    L.features=L.features.filter(f=>String((f.props||{}).CLASSE||'')!=='rb31-inicio');
    const W=+((document.getElementById('rb31W')||{}).value||10),
      dir=((document.getElementById('rb31Dir')||{}).value||'ccw'),
      rr=copiaRampas(st&&st.rampas),ini=[];
    for(const r of rr)if(P(r.startP))ini.push({banco:+r.banco||1,p:P(r.startP),id:r.id||null});
    if(!ini.length){
      const h=copiaHist(st&&st.hist);h.forEach((q,i)=>{
        if(P(q.startP)&&!q.sem&&(!q.degrau||i===0))ini.push({banco:i+1,p:P(q.startP),id:q.rampaId});
      });
    }
    if(!ini.length&&P(st&&st.startP))ini.push({banco:1,p:P(st.startP),id:null});
    const vistos=new Set();
    for(const q of ini){
      const k=q.banco+':'+q.p.map(v=>v.toFixed(3)).join(':');if(vistos.has(k))continue;vistos.add(k);
      const ramps=L.features.filter(f=>bancoDa(f)===q.banco&&
        String((f.props||{}).CLASSE||'')==='rb31-rampa'),
        g=(ramps.map(f=>setaNaRampa(q.p,f.geom,W*.85)).find(Boolean))||
          (st&&st._inicioMarcado133&&P(st._inicioMarcado133.p)&&
            Math.hypot(q.p[0]-st._inicioMarcado133.p[0],q.p[1]-st._inicioMarcado133.p[1])<.1?
              (st._inicioMarcado133.geom||[]).map(P).filter(Boolean):null);
      if(!g)continue;
      const z=ramps[0]&&Array.isArray(ramps[0].zg)&&Number.isFinite(+ramps[0].zg[0])?
        +ramps[0].zg[0]:null;
      L.features.push({geom:g,multi:false,zg:z==null?null:g.map(()=>z),
        props:{TIPO:'Início da rampa — sentido '+(dir==='cw'?'horário':'anti-horário'),
          BANCO:q.banco,COTA:z,ALTURA:null,BERMA:null,ANGULO:null,CLASSE:'rb31-inicio'}});
    }
    try{if(typeof cavaV02AplicaLinhas==='function')cavaV02AplicaLinhas(L,'CLASSE');
      if(typeof drawLayer==='function')drawLayer(L);}catch(e){}
  };
  /* Resolve a primeira interseção da linha com o círculo de raio W. Assim
     a largura é uma CORDA exata mesmo numa curva, não W medidos no arco. */
  const pontoNaCorda=(C,s0,sg,W)=>{
    const A=noArco(C,s0),passo=Math.max(.05,Math.min(.25,W/40)),
      limite=Math.min(C.total*.48,Math.max(W*5,W+5));
    if(!A)return null;
    let u0=0,d0=0;
    for(let u=passo;u<=limite+passo*.5;u+=passo){
      const p=noArco(C,s0+sg*u),d=Math.hypot(p[0]-A[0],p[1]-A[1]);
      if(d>=W-1e-9&&d0<W){
        let lo=u0,hi=u;
        for(let k=0;k<48;k++){
          const m=(lo+hi)/2,q=noArco(C,s0+sg*m);
          if(Math.hypot(q[0]-A[0],q[1]-A[1])<W)lo=m;else hi=m;
        }
        return noArco(C,s0+sg*(lo+hi)/2);
      }
      u0=u;d0=d;
    }
    return null;
  };
  function vincoNaLinha(R,p,W,dir){
    const C=cadeia(R),q=projeta(C,p),larg=Math.abs(+W||0);
    if(!C||!q||!(larg>.05)||larg>=C.total*.48)return null;
    const ccw=area(C.R)>0,sg=((dir==='ccw')===ccw)?1:-1,
      /* A acompanha a marcha; B é o ponto escolhido pelo operador. Essa é
         a mesma ordem usada pelas duas bordas na soleira de chegada. */
      A=pontoNaCorda(C,q.s,sg,larg),B=q.p.slice();
    if(!A||Math.abs(Math.hypot(A[0]-B[0],A[1]-B[1])-larg)>Math.max(.002,larg*1e-5))return null;
    return {A,B,dist:q.d,linha:C.R};
  }
  window.rb133VincoNaLinha=vincoNaLinha;

  const estadoVivo=()=>{
    let st=(typeof S!=='undefined'&&S)?S._rb31:null;
    if(st&&st.banco>0)return st;
    try{
      const L=(S.layers||[]).find(x=>x&&x._rb31Recipe&&+x._rb31Recipe.banco>0);
      if(L&&typeof rb31EstadoDaReceita==='function')st=rb31EstadoDaReceita(L);
    }catch(e){}
    return st&&st.banco>0?st:null;
  };
  const nomeLinha=st=>{
    try{return typeof rb31NomePartida==='function'?rb31NomePartida(st):
      ((st&&st.travaUp)?'Pé':'Crista');}catch(e){return 'Crista/Pé';}
  };
  const proximoId=st=>{
    const usados=copiaRampas(st.rampas).map(r=>{
      const m=String(r.id||'').match(/\d+/);return (m?+m[0]:0)+1;
    });
    st._proximaRampa133=Math.max(+st._proximaRampa133||1,...usados);
    return 'rampa-'+(st._proximaRampa133++);
  };
  const resumo=st=>{
    const box=document.getElementById('rb31RampasResumo');if(!box)return;
    if(!st||!st.banco){box.textContent='Nenhuma rampa em edição.';return;}
    const rr=copiaRampas(st.rampas),fechadas=rr.filter(r=>r.status==='finalizada').length,
      ativa=rr.find(r=>r.status==='ativa');
    box.innerHTML=fechadas+' rampa(s) finalizada(s) · '+(st.rampaPausada133?
      '<b>sem rampa ativa</b> — marque a próxima na linha de '+nomeLinha(st).toLowerCase():
      (ativa?'<b>'+String(ativa.nome||'Rampa ativa')+'</b>':'<b>rampa ativa</b>'))+'.';
    const alt=document.getElementById('btnRb31AlterarRampa');
    if(alt)alt.textContent=st&&st._edicaoBruta134?
      '◎ Desenhar rampa no ponto':'↻ Alterar rampa inteira';
    const cota=document.getElementById('rb31MoverAteZ');
    if(cota&&st&&st.banco&&!String(cota.value||'').trim())try{
      cota.value=+rb31CotaPe(st,st.banco).toFixed(2);
    }catch(e){}
  };
  window.rb133AtualizaResumo=resumo;

  /* A soleira de uma nova rampa é uma seção plena: o núcleo recebe o par
     direto, exatamente como recebe a soleira terminal da rampa anterior. */
  const bancada0=window.rb31Bancada;
  if(typeof bancada0==='function')window.rb31Bancada=function(crista,z,opt){
    if(opt&&Array.isArray(opt.soleira)&&P(opt.soleira[0])&&P(opt.soleira[1])){
      opt={...opt,startP:P(opt.soleira[0]),entradaDegrau:true,solDireto:true,
        solIniA:P(opt.soleira[0]),solIniB:P(opt.soleira[1]),vincoNovo133:true};
    }
    return bancada0.call(this,crista,z,opt);
  };

  /* Pausa operacional: o wrapper 105 limpa os sinalizadores antigos antes
     de gerar. Injeta semRampa no último ponto comum, já dentro do gerador,
     sem tocar na geometria das rampas existentes. */
  const sem0=window.rb31GeraSemCruzar;
  if(typeof sem0==='function')window.rb31GeraSemCruzar=function(crista,z,opt){
    if(window.__rb133ForcaSem&&opt)opt.semRampa=true;
    return sem0.apply(this,arguments);
  };

  const desenha0=window.rb31Desenha;
  if(typeof desenha0==='function')window.rb31Desenha=function(st){
    const L0=st&&st.lays&&st.lays.uni,R0=L0&&L0._rb31Recipe,
      planoAntes=planoTotal(st,R0,L0);
    if(st&&planoAntes.length)st._planoCompleto133=copiaHist(planoAntes);
    const r=desenha0.apply(this,arguments);
    try{
      const L=st&&st.lays&&st.lays.uni,R=L&&L._rb31Recipe;
      if(R){
        const plano=planoTotal(st,R0||R,L);
        st._planoCompleto133=copiaHist(plano);
        R.hist=plano.map(q=>({...q,startP:P(q.startP),vinco:copiaVinco(q.vinco)}));
        R.planoCompleto133=copiaHist(plano);R.rampas133=copiaRampas(st.rampas);
        R.rampaPausada133=!!st.rampaPausada133;
        R.rampaAtivaId133=st.rampaAtivaId133||null;
        R.proximaRampa133=+st._proximaRampa133||1;
        R.vincoPendente133=copiaVinco(st._vincoPendente133);
        R.edicaoBruta134=!!st._edicaoBruta134;
      }
      publicaMarcadores(st,L);
      resumo(st);
    }catch(e){}
    return r;
  };

  const receita0=window.rb31EstadoDaReceita;
  if(typeof receita0==='function')window.rb31EstadoDaReceita=function(alvo){
    const st=receita0.apply(this,arguments),L=alvo||(st&&st.lays&&st.lays.uni),
      R=L&&L._rb31Recipe;
    try{if(st&&R){
      const plano=planoTotal(st,R,L);
      st._planoCompleto133=copiaHist(plano);
      if((+st.banco||0)>=plano.length)st.hist=copiaHist(plano);
      else if(plano.length)st._histAlvo=copiaHist(plano);
      R.hist=copiaHist(plano);R.planoCompleto133=copiaHist(plano);
      st.rampas=copiaRampas(R.rampas133&&R.rampas133.length?R.rampas133:R.rampas);
      st.rampaPausada133=!!R.rampaPausada133;
      st.rampaAtivaId133=R.rampaAtivaId133||null;
      st._proximaRampa133=+R.proximaRampa133||1;
      st._vincoPendente133=copiaVinco(R.vincoPendente133);
      st._edicaoBruta134=!!R.edicaoBruta134;
      /* A feição ◈ atual é sempre a autoridade. srcGeom é apenas o retrato
         para Voltar e não pode recolocar a linha anterior ao desenhar. */
      const src=(typeof S!=='undefined'&&S.layers||[]).find(x=>
          String(x.id)===String(st.srcLayerId)),f=src&&src.features&&src.features[st.srcFeatIdx||0];
      if(f&&Array.isArray(f.geom)){
        const g=(f.multi&&Array.isArray(f.geom[0]&&f.geom[0][0])?f.geom[0]:f.geom)
          .filter(P).map(P);
        if(g.length>=3){st.srcGeom=g.map(P);
          try{st.srcHash=typeof cavaGeomHash==='function'?cavaGeomHash({f}):st.srcHash;}catch(e){}}
      }
      resumo(st);
    }}catch(e){}
    return st;
  };

  const gerar0=window.rb31Gerar;
  if(typeof gerar0==='function')window.rb31Gerar=function(sil){
    const st=typeof rb31Estado==='function'?rb31Estado():((typeof S!=='undefined'&&S)&&S._rb31),
      replay=window.__rb133ReplayMeta,
      idx=st?+st.banco:0,
      hReplay=replay&&replay.hist&&replay.hist[idx],
      pend=copiaVinco((hReplay&&hReplay.vinco)||st&&st._vincoPendente133),
      ultimo=st&&st.hist&&idx>0?st.hist[idx-1]:null,
      semInicioMarcado=!!(st&&!replay&&!pend&&!st.novoInicioP&&!st.novoSoleira&&
        (idx===0?!st.startP:!!(ultimo&&ultimo.sem))),
      /* Durante replay, a verdade é o plano de CADA banco. O estado global
         pode estar pausado hoje, mas isso não apaga as rampas finalizadas
         que pertencem aos bancos anteriores. */
      forcaSem=replay?!!(hReplay&&hReplay.sem):
        !!(st&&(st.rampaPausada133||semInicioMarcado)&&!pend&&
          !st.novoInicioP&&!st.novoSoleira);
    /* A ausência de clique é um plano bruto persistente, não uma rampa
       provisória ancorada no primeiro vértice. */
    if(st&&semInicioMarcado){st.rampaPausada133=true;st.rampaAtivaId133=null;}
    if(st&&replay){
      st._planoCompleto133=copiaHist(replay.hist);st.rampas=copiaRampas(replay.rampas);
      st.rampaPausada133=!!replay.pausada;st.rampaAtivaId133=replay.ativa||null;
      st._proximaRampa133=+replay.proxima||1;
    }
    if(st&&pend&&idx>0){
      st.novoSoleira=[P(pend.A),P(pend.B)];st.novoInicioP=P(pend.A);
      st._vincoPendente133=pend;st.rampaPausada133=false;
    }
    window.__rb133ForcaSem=forcaSem;
    let ok=false;
    try{ok=gerar0.apply(this,arguments);}
    finally{window.__rb133ForcaSem=false;}
    try{if(ok&&st){
      const hh=st.hist&&st.hist[st.banco-1];
      if(hh){
        if(forcaSem)hh.sem=true;
        if(pend){hh.degrau=false;hh.vinco=copiaVinco({...pend,banco:st.banco});
          hh.rampaId=(hReplay&&hReplay.rampaId)||st.rampaAtivaId133||null;}
      }
      if(pend){
        const rr=copiaRampas(st.rampas),id=(hReplay&&hReplay.rampaId)||
          st.rampaAtivaId133||proximoId(st);
        let ra=rr.find(q=>q.id===id);
        if(!ra){ra={id,nome:'Rampa '+(rr.length+1),status:'ativa',banco:st.banco,
          ateBanco:st.banco,ate:null,startP:P(pend.A),vinco:copiaVinco(pend)};rr.push(ra);}
        ra.status='ativa';ra.banco=Math.min(+ra.banco||st.banco,st.banco);
        ra.ateBanco=Math.max(+ra.ateBanco||st.banco,st.banco);ra.startP=P(pend.A);
        ra.vinco=copiaVinco(pend);st.rampas=rr;st.rampaAtivaId133=id;
        st._vincoPendente133=null;
      }else if(!forcaSem){
        const rr=copiaRampas(st.rampas),ra=rr.find(q=>q.id===st.rampaAtivaId133);
        if(ra){ra.ateBanco=Math.max(+ra.ateBanco||0,st.banco);st.rampas=rr;}
      }
      if(!window.__rb133ReplayMeta){
        const atual=copiaHist(st.hist);
        if(atual.length>=(st._planoCompleto133||[]).length)st._planoCompleto133=atual;
      }
      rb31Desenha(st); /* persiste vinco/pausa acrescentados após o núcleo */
    }}catch(e){console.warn('vinco/rampa 133',e);}
    return ok;
  };

  const replay0=window.rb31Replay;
  if(typeof replay0==='function')window.rb31Replay=function(){
    const st=(typeof S!=='undefined'&&S)&&S._rb31;
    if(!st)return replay0.apply(this,arguments);
    const alterando=!!window.__rb133AlterandoRampa;
    const L=st.lays&&st.lays.uni,R=L&&L._rb31Recipe,
      hist=planoTotal(st,R,L),
      meta={hist,rampas:copiaRampas(st.rampas),pausada:alterando?false:!!st.rampaPausada133,
        ativa:st.rampaAtivaId133||null,proxima:+st._proximaRampa133||1,
        bruta:!!st._edicaoBruta134};
    st._planoCompleto133=hist;window.__rb133ReplayMeta=meta;
    try{return replay0.apply(this,arguments);}
    finally{
      const sf=(typeof S!=='undefined'&&S)&&S._rb31;
      if(sf){sf._planoCompleto133=copiaHist(hist);sf.rampas=copiaRampas(meta.rampas);
        sf.rampaPausada133=meta.pausada;sf.rampaAtivaId133=meta.ativa;
        sf._proximaRampa133=meta.proxima;
        sf._edicaoBruta134=alterando?false:meta.bruta;
        if(alterando){
          const ini=hist.findIndex(h=>h&&!h.sem),fim=hist.reduce((m,h,i)=>h&&!h.sem?i:m,-1);
          if(ini>=0){const id=proximoId(sf),h=hist[ini];sf.rampas=[{id,nome:'Rampa 1',
            status:'ativa',banco:ini+1,ateBanco:fim+1,ate:null,startP:P(h.startP),
            vinco:copiaVinco(h.vinco)}];sf.rampaAtivaId133=id;sf.rampaPausada133=false;}
          window.__rb133AlterandoRampa=false;clearTimeout(window.__rb133AlterandoTm);
        }
        if(+sf.banco<hist.length)sf._histAlvo=copiaHist(hist);
        try{rb31Desenha(sf);}catch(e){}
      }
      window.__rb133ReplayMeta=null;
    }
  };

  /* A atualização durante o arraste pode encontrar uma forma intermediária
     inviável. O evento obrigatório de soltura repete o replay com o plano
     integral e só então aceita a nova família. */
  const live0=window.rb31LiveSync;
  if(typeof live0==='function')window.rb31LiveSync=function(op){
    let st=(typeof S!=='undefined'&&S)&&S._rb31;
    try{
      const Led=op&&op.sourceLayer;
      if(Led&&(!st||String(st.srcLayerId)!==String(Led.id))){
        const U=(S.layers||[]).find(x=>x&&x._rb31Recipe&&
          String(x._rb31Recipe.srcLayerId)===String(Led.id));
        if(U)st=rb31EstadoDaReceita(U)||st;
      }
    }catch(e){}
    const U0=st&&st.lays&&st.lays.uni,
      plano=st?planoTotal(st,U0&&U0._rb31Recipe,U0):[];
    if(st&&plano.length){st._planoCompleto133=plano;st._histAlvo=copiaHist(plano);}
    const r=live0.apply(this,arguments);
    if(op&&op.force&&plano.length){
      const token=window.__rb133LiveToken=(window.__rb133LiveToken||0)+1;
      setTimeout(()=>{
        if(token!==window.__rb133LiveToken)return;
        let sf=(typeof S!=='undefined'&&S)&&S._rb31;
        try{
          const Led=op.sourceLayer;
          if(Led&&(!sf||String(sf.srcLayerId)!==String(Led.id))){
            const U=(S.layers||[]).find(x=>x&&x._rb31Recipe&&
              String(x._rb31Recipe.srcLayerId)===String(Led.id));
            if(U)sf=rb31EstadoDaReceita(U)||sf;
          }
          if(!sf)return;
          sf._planoCompleto133=copiaHist(plano);sf._histAlvo=copiaHist(plano);
          /* Mesmo com o mesmo hash, força a passada final: o hash pode ter
             sido visto numa posição intermediária antes de todos os bancos. */
          rb31Replay();sf=S._rb31||sf;
          if(+sf.banco<plano.length){sf._histAlvo=copiaHist(plano);rb31Desenha(sf);
            const msg='O limite foi atualizado, mas a bancada '+(+sf.banco+1)+
              ' ainda não coube nesta posição. O plano completo foi preservado; continue ajustando o vértice.';
            try{toast(msg);cmdLog(msg,'avisa');}catch(e){}
          }else{
            sf._histAlvo=null;sf._planoCompleto133=copiaHist(sf.hist);
            try{const L=op.sourceLayer,f=op.sourceFeature;
              if(f&&f.geom)sf.srcGeom=JSON.parse(JSON.stringify(f.geom));}catch(e){}
            rb31Desenha(sf);
            const info=document.getElementById('rb31Info');
            if(info)info.innerHTML='Limite editado: <b>todas as '+sf.banco+
              ' bancadas</b>, cristas, pés e rampas foram atualizados.';
          }
        }catch(e){console.warn('replay final 133',e);}
      },320);
    }
    return r;
  };

  function finalizarRampa(){
    const st=estadoVivo();
    if(!st){toast('Gere ao menos uma bancada antes de finalizar a rampa');return false;}
    const rr=copiaRampas(st.rampas),id=st.rampaAtivaId133||
      (rr.filter(r=>r.status!=='finalizada').at(-1)||{}).id||proximoId(st);
    let ra=rr.find(r=>r.id===id);
    if(!ra){
      const h=(st.hist||[]).findIndex(q=>q&&!q.sem);
      ra={id,nome:'Rampa '+(rr.length+1),status:'ativa',banco:h>=0?h+1:1,
        ateBanco:st.banco,ate:null,startP:P(st.startP),vinco:null};rr.push(ra);
    }
    ra.status='finalizada';ra.ateBanco=st.banco;
    try{ra.ate=typeof rb31CotaPe==='function'?rb31CotaPe(st,st.banco):st.zPe;}catch(e){}
    st.rampas=rr;st.rampaPausada133=true;st.rampaAtivaId133=null;
    st._vincoPendente133=null;st.novoInicioP=null;st.novoSoleira=null;
    st._planoCompleto133=copiaHist(st.hist);
    rb31Desenha(st);
    const info=document.getElementById('rb31Info');
    if(info)info.innerHTML='<b>'+String(ra.nome||'Rampa')+'</b> finalizada na bancada <b>'+st.banco+
      '</b>, exatamente na linha de '+(st.fase==='pe'?nomeLinha(st).toLowerCase():'partida')+
      '. As próximas bancadas podem seguir sem rampa.';
    toast('Rampa finalizada na bancada '+st.banco+' — a cava continua independente');
    return true;
  }
  window.rb133FinalizarRampa=finalizarRampa;

  function novaRampa(){
    const st=estadoVivo();
    if(!st){toast('Gere a cava/pilha antes de iniciar outra rampa');return false;}
    if(st.fase==='pe'){
      toast('Aplique primeiro o Offset da berma; a nova rampa deve nascer na linha de partida seguinte');
      return false;
    }
    if(typeof switchView==='function'&&S._view!=='map')switchView('map');
    setTool('select');
    const info=document.getElementById('rb31Info');
    if(info)info.textContent='Toque exatamente na linha de '+nomeLinha(st).toLowerCase()+
      ': o vinco de início será o vinco terminal espelhado, com largura W.';
    rb31CapturaClique(ll=>{
      const vivo=estadoVivo();if(!vivo||!ring(vivo.crista))return;
      const c=fromWGS(S.workCRS,ll.lng,ll.lat),W=+
        ((document.getElementById('rb31W')||{}).value||11),
        dir=(document.getElementById('rb31Dir')||{}).value||'ccw',
        v=vincoNaLinha(vivo.crista,[c[0],c[1]],W,dir),
        tol=Math.max(5,W);
      if(!v||v.dist>tol){
        toast('Início rejeitado: toque sobre a linha de '+nomeLinha(vivo).toLowerCase());return;
      }
      const id=proximoId(vivo),vinco={A:P(v.A),B:P(v.B),linha:nomeLinha(vivo),banco:vivo.banco+1};
      vivo._vincoPendente133=vinco;vivo.novoSoleira=[P(v.A),P(v.B)];
      vivo.novoInicioP=P(v.A);vivo.rampaPausada133=false;vivo.rampaAtivaId133=id;
      const rr=copiaRampas(vivo.rampas);rr.forEach(r=>{if(r.status==='ativa')r.status='finalizada';});
      rr.push({id,nome:'Rampa '+(rr.length+1),status:'ativa',banco:vivo.banco+1,
        ateBanco:vivo.banco+1,ate:null,startP:P(v.A),vinco:copiaVinco(vinco)});
      vivo.rampas=rr;
      if(typeof rb31DesenhaSoleira==='function')rb31DesenhaSoleira(vivo);else rb31Desenha(vivo);
      if(info)info.innerHTML='Novo vinco cravado na linha de <b>'+nomeLinha(vivo).toLowerCase()+
        '</b>: largura <b>'+Math.hypot(v.A[0]-v.B[0],v.A[1]-v.B[1]).toFixed(2)+
        ' m</b>. Clique em <b>Gerar bancada</b> ou <b>Iteração</b>.';
      toast('Nova rampa pronta para nascer — vinco exato na '+nomeLinha(vivo).toLowerCase());
    });
    return true;
  }
  window.rb133NovaRampa=novaRampa;

  /* Limpeza v2: volta TODOS os anéis ao offset bruto. Cristas, pés e bermas
     são realmente recompostos; não se trata apenas de esconder a camada. */
  function limparRampaETaludes(){
    let st=estadoVivo();
    if(!st){toast('Gere a cava/DCE antes de limpar a rampa');return null;}
    try{
      if(typeof rb31Snap==='function'){
        st.undoPilha=st.undoPilha||[];st.undoPilha.push(rb31Snap(st));
        if(st.undoPilha.length>30)st.undoPilha.shift();
      }
    }catch(e){}
    try{
      if(typeof rb31LimparRampa!=='function')throw new Error('limpeza indisponível');
      rb31LimparRampa();
      st=estadoVivo();
      if(!st)throw new Error('estado bruto não recuperado');
      st.rampaPausada133=true;st.rampaAtivaId133=null;st._vincoPendente133=null;
      st.rampas=[];st._edicaoBruta134=true;rb31Desenha(st);
      const info=document.getElementById('rb31Info');
      if(info)info.textContent='Rampa removida. Cristas, pés e bermas voltaram ao desenho bruto; '+
        'você pode suavizar os vértices antes de mover a rampa.';
      toast('Rampa limpa — taludes recompostos na versão bruta');
      return st;
    }catch(e){
      console.warn('limpar rampa v2',e);
      toast('Não foi possível recompor os taludes brutos');
      return null;
    }
  }
  window.rb133LimparRampaETaludes=limparRampaETaludes;

  /* Move a rampa inteira: limpa o corredor antigo, conserva os taludes
     brutos e pede um único ponto na crista/pé. O planejador existente
     reconstrói automaticamente todos os bancos até a cota informada. */
  function moverRampaAteCota(){
    let st=estadoVivo();
    if(!st){toast('Gere a cava/DCE antes de mover a rampa');return false;}
    const inp=document.getElementById('rb31MoverAteZ'),
      alvo=Number.parseFloat(String(inp&&inp.value||'').replace(',','.'));
    if(!Number.isFinite(alvo)){
      toast('Informe a cota final da rampa antes de escolher o novo ponto');
      try{inp&&inp.focus();}catch(e){}
      return false;
    }
    st=limparRampaETaludes();if(!st)return false;
    const bancoFim=Math.max(1,rb31BancoDaCota(st,alvo)),id=proximoId(st);
    st.rampas=[{id,nome:'Rampa 1',status:'ativa',banco:1,ateBanco:bancoFim,
      ate:alvo,startP:null,_cotaFixa:true,_cotaSolicitada:alvo}];
    st.rampaPausada133=false;st.rampaAtivaId133=id;st.semRampa=false;
    st._histAlvo=null;st._planoCompleto133=null;
    const info=document.getElementById('rb31Info');
    if(info)info.textContent='Taludes brutos prontos. Clique exatamente na crista ou no pé '+
      'onde a rampa deve nascer; ela será reconstruída até a cota '+alvo.toFixed(2)+' m.';
    if(typeof rb31RampaDefinePonto!=='function'){
      toast('O seletor do ponto da rampa não está disponível');return false;
    }
    rb31RampaDefinePonto(0);
    return true;
  }
  window.rb133MoverRampaAteCota=moverRampaAteCota;

  /* Compatibilidade com o antigo botão combinado. */
  function alterarRampaInteira(){
    let st=estadoVivo();
    if(!st){toast('Gere a cava/pilha antes de alterar a rampa');return false;}
    /* SEGUNDA ETAPA: depois de suavizar livremente cristas/pés na cava
       bruta, o mesmo botão passa a pedir somente o ponto da nova rampa. */
    if(st._edicaoBruta134){
      if(typeof rb31ReposicionaRampa!=='function'){
        toast('O reposicionamento da rampa não está disponível');return false;
      }
      const info=document.getElementById('rb31Info');
      if(info)info.textContent='Agora toque na crista ou no pé já ajustado onde a rampa deve nascer…';
      window.__rb133AlterandoRampa=true;
      clearTimeout(window.__rb133AlterandoTm);
      window.__rb133AlterandoTm=setTimeout(()=>{window.__rb133AlterandoRampa=false;},120000);
      rb31ReposicionaRampa();
      return true;
    }
    return !!limparRampaETaludes();
  }
  window.rb133AlterarRampaInteira=alterarRampaInteira;

  function novoLimite(){
    const st=estadoVivo();
    if(st)try{rb31Desenha(st);}catch(e){} /* congela a receita atual, sem apagar */
    if(typeof S!=='undefined'&&S)S._rb31=null;
    try{if(typeof rb31LimpaMarcaInicio==='function')rb31LimpaMarcaInicio();}catch(e){}
    const info=document.getElementById('rb31Info');
    if(info)info.textContent='A cava atual foi mantida. Selecione outra linha/polígono de limite e clique em “Marcar início da rampa”.';
    toast('Pronto para um novo limite — a cava anterior foi preservada');
    return true;
  }
  window.rb133NovoLimite=novoLimite;

  const bFim=document.getElementById('btnRb31FinalizarRampa'),
    bNova=document.getElementById('btnRb31NovoPonto'),
    bLim=document.getElementById('btnRb31NovoLimite'),
    bAlt=document.getElementById('btnRb31AlterarRampa'),
    bLimpar=document.getElementById('btnRb31LimparRampa'),
    bMover=document.getElementById('btnRb31MoverRampa');
  if(bFim)bFim.onclick=()=>rb31AcaoComVolta(finalizarRampa);
  if(bNova)bNova.onclick=novaRampa;
  if(bLim)bLim.onclick=novoLimite;
  if(bAlt)bAlt.onclick=alterarRampaInteira;
  if(bLimpar)bLimpar.onclick=()=>!!limparRampaETaludes();
  if(bMover)bMover.onclick=moverRampaAteCota;
  try{resumo(estadoVivo());}catch(e){}
})();
