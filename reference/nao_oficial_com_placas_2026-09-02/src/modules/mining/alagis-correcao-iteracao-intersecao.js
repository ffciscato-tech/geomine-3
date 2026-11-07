
/* Correção focal: próxima bancada + interseção dinâmica. */
function rb31GeraSemCruzar(crista,z,opt,W,anteriores){
  /* A ligação entre duas bancadas cruza a berma por definição. Esse encontro
     é válido e não pode ser interpretado como fechamento da cava. */
  const zonasDeg=[];
  if(opt&&opt.startP)zonasDeg.push(opt.startP);
  if(opt&&Array.isArray(opt.zonasDeg))opt.zonasDeg.forEach(p=>{if(p)zonasDeg.push(p);});
  try{
    const st=S&&S._rb31;
    (st&&st.hist||[]).forEach(h=>{if(h&&h.startP)zonasDeg.push(h.startP);});
    if(st&&st.pFim)zonasDeg.push(st.pFim);
  }catch(e){}
  const raioDeg=4.5*Math.max(1,Math.abs(W)||10),
    foraDeg=p=>!zonasDeg.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<=raioDeg);
  const conta=(cr,rr)=>{
    const proprio=rb31CruzamentosDaBancada(cr,rr,null).filter(foraDeg),
      todos=rb31CruzamentosDaBancada(cr,rr,anteriores).filter(foraDeg);
    return {pts:todos,proprio:proprio.length,ant:todos.length-proprio.length};
  };
  let r=rb31Bancada(crista,z,opt);
  if(!r||!r.peEntregue)return {r,crista,corrigido:0,restou:-1,ant:0};
  let c0=conta(crista,r),pts=c0.pts;
  if(!pts.length)return {r,crista,corrigido:0,restou:0,ant:0};
  /* Cruzamento agora é uma condição editável. A antiga busca aplicava até
     seis chanfros na crista escolhida pelo operador para tentar escondê-lo;
     além do custo, isso desfazia a edição manual que deveria comandar a
     rampa. Mantém literalmente crista/pé e devolve os encontros apenas para
     aviso — a bancada continua publicável. */
  return {r,crista,corrigido:0,restou:pts.length,ant:c0.ant,pts};
}
function cavaSaiaIntersecao(linhas,g,modoUp){
  const rs=(linhas||[]).filter(q=>q?.ring?.length>=3&&Number.isFinite(+q.z));
  if(rs.length<2||!g)return [];
  const areas=rs.map(q=>Math.abs(cavaArea2(q.ring))/2),
    outerI=areas.indexOf(Math.max(...areas));
  let outer=rs[outerI].ring.map(p=>[+p[0],+p[1]]);
  if(outer.length>2&&Math.hypot(outer[0][0]-outer.at(-1)[0],outer[0][1]-outer.at(-1)[1])<1e-8)outer.pop();
  if(outer.length<3)return [];
  const zExt=+rs[outerI].z;
  /* inclinação da face: medida entre os dois anéis mais externos, ou seja, o
     ângulo do próprio projeto — sem depender de parâmetro passado */
  const ordem=areas.map((a,i)=>({i,a})).sort((x,y)=>y.a-x.a),
    B=ordem[1]?rs[ordem[1].i]:null;
  let tanFace=0;
  if(B&&Number.isFinite(+B.z)&&+B.z!==zExt){
    const passo=Math.max(1,Math.floor(B.ring.length/48));
    let s=0,n=0;
    for(let k=0;k<B.ring.length;k+=passo){
      const dd=cavaDistAoAnel(B.ring[k],outer);
      if(Number.isFinite(dd)&&dd>1e-6){s+=dd;n++;}
    }
    if(n&&s/n>1e-6)tanFace=Math.abs((+B.z)-zExt)/(s/n);
  }
  if(!(tanFace>0.05))tanFace=1;                    // 45°: reserva conservadora
  /* SENTIDO LIDO DA GEOMETRIA, não do parâmetro. A Rampa por bancada chama a
     interseção com modoUp fixo em false; numa PILHA isso invertia o lado da
     busca e a saia nunca era criada. Os próprios anéis dizem a verdade: se o
     anel de dentro é MAIS ALTO que o externo, o projeto sobe (pilha/DCE); se
     é mais baixo, desce (cava). */
  let up=!!modoUp;
  if(B&&Number.isFinite(+B.z)&&+B.z!==zExt)up=(+B.z>zExt);
  const nv=outer.length, ccw=cavaArea2(outer)>0, sg=ccw?1:-1,
    nrm=i=>{const a=outer[i],b=outer[(i+1)%nv],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1;
      return [dy/L*sg,-dx/L*sg];};
  const cel=Math.max(g.cs||1,g.csy||g.cs||1);
  let per=0;for(let i=0;i<nv;i++)per+=Math.hypot(outer[(i+1)%nv][0]-outer[i][0],outer[(i+1)%nv][1]-outer[i][1]);
  const N=Math.max(240,Math.min(3000,Math.ceil(per/Math.max(1,cel/2)))),
    passoM=Math.max(.5,cel/3),alcance=Math.min(400,cel*40);
  const hits=[];
  for(let k=0;k<N;k++){
    /* ponto e normal na fração k/N do perímetro */
    let alvo=per*k/N,acc=0,i=0,t=0;
    for(i=0;i<nv;i++){
      const a=outer[i],b=outer[(i+1)%nv],L=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(acc+L>=alvo||i===nv-1){t=L>1e-9?(alvo-acc)/L:0;break;}
      acc+=L;
    }
    const a=outer[i],b=outer[(i+1)%nv],
      P=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],n=nrm(i);
    const t0=sampleZbil(g,P[0],P[1]);
    if(!Number.isFinite(t0)){hits.push(null);continue;}
    const d0=up?(zExt-t0):(t0-zExt);
    if(d0<=0){hits.push(null);continue;}           // já cruza por dentro: é da malha
    const dir=up?-1:1;
    let pAnt=P,zAnt=zExt,dAnt=zExt-t0,achou=null;
    for(let s=passoM;s<=alcance;s+=passoM){
      const q=[P[0]+n[0]*s,P[1]+n[1]*s],z=zExt+dir*tanFace*s,tz=sampleZbil(g,q[0],q[1]);
      if(!Number.isFinite(tz))break;
      const dd=z-tz;
      if(dAnt*dd<=0){
        const f=Math.abs(dAnt)/(Math.abs(dAnt)+Math.abs(dd)||1);
        achou=[pAnt[0]+(q[0]-pAnt[0])*f,pAnt[1]+(q[1]-pAnt[1])*f,zAnt+(z-zAnt)*f];
        break;
      }
      pAnt=q;zAnt=z;dAnt=dd;
    }
    hits.push(achou);
  }
  /* junta amostras vizinhas em polilinhas; a lacuna fica aberta de propósito
     (é onde a malha já respondeu) */
  const feats=[],salto=Math.max(cel*4,per/N*6);
  let run=[];
  const fecha=()=>{ if(run.length>=2)feats.push({geom:run.map(p=>[p[0],p[1]]),
      zg:run.map(p=>p[2]),_metodo:'saia-externa-x-mdt'}); run=[]; };
  for(let k=0;k<hits.length;k++){
    const q=hits[k];
    if(!q){fecha();continue;}
    if(run.length&&Math.hypot(q[0]-run.at(-1)[0],q[1]-run.at(-1)[1])>salto)fecha();
    run.push(q);
  }
  fecha();
  /* volta inteira contínua: fecha o anel */
  if(feats.length===1&&hits.every(Boolean)&&feats[0].geom.length>=N){
    feats[0].geom.push(feats[0].geom[0].slice());
    feats[0].zg.push(feats[0].zg[0]);
  }
  return feats;
}

function cavaLimpaRuidoInter(feats,cs){
  /* calibração: com MDE grosseiro (célula ~30 m) um lado de limpeza
     proporcional à célula comia a linha INTEIRA. O lado fica pequeno
     (espinhos isolados) e a "hachura" densa é tratada por um colapso de
     ZIGUE-ZAGUE: onde 3+ reversões se acumulam em janela curta, o trecho
     todo é substituído pela travessia reta. */
  const lado=Math.max(3,Math.min(12,cs*1.2)),
    minLen=Math.max(2,Math.min(24,cs*2)),
    minFech=Math.min(72,cs*6),
    len=g=>{let L=0;for(let i=1;i<g.length;i++)L+=Math.hypot(g[i][0]-g[i-1][0],g[i][1]-g[i-1][1]);return L;},
    ehRev=(g,i)=>{
      if(i<1||i>=g.length-1)return false;
      const v1=[g[i][0]-g[i-1][0],g[i][1]-g[i-1][1]],v2=[g[i+1][0]-g[i][0],g[i+1][1]-g[i][1]],
        n1=Math.hypot(...v1),n2=Math.hypot(...v2);
      if(n1<1e-9||n2<1e-9)return true;
      return (v1[0]*v2[0]+v1[1]*v2[1])/(n1*n2)<-0.5;
    },
    colapsaZigue=g=>{
      let guard=0,mexeu=true;
      while(mexeu&&guard++<10&&g.length>6){
        mexeu=false;
        for(let i=1;i<g.length-1;i++){
          if(!ehRev(g,i))continue;
          /* estende a janela enquanto houver reversões próximas */
          let j=i,ult=i,k=i+1;
          let cont=1;
          while(k<g.length-1&&k<=ult+3){ if(ehRev(g,k)){cont++;ult=k;} k++; }
          if(cont>=3){ g=g.slice(0,i).concat(g.slice(ult+1)); mexeu=true; break; }
        }
      }
      return g;
    },
    out=[];
  for(const f of feats||[]){
    let pts=f.geom.map((p,i)=>[p[0],p[1],
      Number.isFinite(f.zg&&f.zg[i])?f.zg[i]:(p[2]||0)]);
    const closed=pts.length>3&&
      Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])<1e-7;
    try{ if(typeof rb31LimpaLinha==='function')pts=rb31LimpaLinha(pts,150,lado); }catch(e){}
    pts=colapsaZigue(pts);
    if(!pts||pts.length<2)continue;
    const L=len(pts);
    if(L<(closed?minFech:minLen))continue;
    out.push({geom:pts.map(p=>[p[0],p[1]]),zg:pts.map(p=>p[2])});
  }
  return out;
}

function cavaIntersecaoSuperficies(linhas,g,H,modoUp){
  if(!g||!linhas?.length)return [];
  let saia=[];
  try{ saia=cavaSaiaIntersecao(linhas,g,!!modoUp); }catch(e){ console.warn('saia externa',e); }
  /* Além de inserir os nós nos anéis antes da triangulação, conserva a lista
     para validar as pontas de cada componente resultante. */
  const nosContrato=cavaPreparaNosExatos(linhas,g);
  /* A interseção principal vem da superfície triangulada formada pelos
     anéis completos. Ligar apenas os nós por proximidade cria uma polilinha
     aparente, mas não representa o corte entre as duas superfícies. */
  const exata=cavaIntersecaoMalhaAneis(linhas,g);
  if(exata.length){
    const vex=cavaValidaComponentesIntersecao(exata,nosContrato,g);
    /* a validação pode reprovar TODOS os componentes exatos (MDT com
       cobertura parcial: os anéis saem e voltam do dado). Retornar vazio
       aqui escondia a interseção mesmo havendo terreno válido — nesse
       caso cai para o caminho da grade, que lida com NaN célula a célula. */
    if(vex.length)return vex.concat(saia);
  }
  const rs=linhas.filter(q=>q?.ring?.length>=3&&Number.isFinite(+q.z));
  if(rs.length<2)return [];
  const area=r=>Math.abs(cavaArea2(r))/2,areas=rs.map(q=>area(q.ring)),
    outerI=areas.indexOf(Math.max(...areas)),outer=rs[outerI].ring;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  outer.forEach(p=>{minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);});
  let cs=Math.max(.2,Math.min(g.cs||1,g.csy||g.cs||1));
  const est=Math.max(1,(maxX-minX)/cs)*Math.max(1,(maxY-minY)/cs),lim=450000;
  if(est>lim)cs*=Math.sqrt(est/lim);
  /* Colar a malha à extensão dos anéis evita que o arredondamento das
     dimensões desloque os centros das células entre uma atualização e outra. */
  const pad=cs*1.5,nc=Math.max(3,Math.ceil((maxX-minX+2*pad)/cs)+1),
    nr=Math.max(3,Math.ceil((maxY-minY+2*pad)/cs)+1),xll=minX-pad,yll=minY-pad,
    dif=new Float32Array(nc*nr).fill(NaN),expanding=areas.at(-1)>areas[0];
  const prep=rs.map(q=>{
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    q.ring.forEach(p=>{x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);});
    return {...q,x0,y0,x1,y1};
  }),dentro=(q,x,y)=>x>=q.x0&&x<=q.x1&&y>=q.y0&&y<=q.y1&&pointInRing(x,y,q.ring);
  let valid=0;
  for(let row=0;row<nr;row++){
    const y=yll+(nr-1-row+.5)*cs;
    for(let col=0;col<nc;col++){
      const x=xll+(col+.5)*cs;if(!dentro(prep[outerI],x,y))continue;
      let zv=null,A=null,B=null;
      if(expanding){
        if(dentro(prep[0],x,y))zv=+prep[0].z;
        else for(let i=1;i<prep.length;i++)if(dentro(prep[i],x,y)){A=prep[i-1];B=prep[i];break;}
      }else{
        let ultimo=prep[0];
        for(let i=1;i<prep.length;i++){if(!dentro(prep[i],x,y)){A=ultimo;B=prep[i];break;}ultimo=prep[i];}
        if(!A)zv=+prep.at(-1).z;
      }
      if(A&&B){const da=tinCavaDist(A.ring,x,y),db=tinCavaDist(B.ring,x,y),s=da+db;
        zv=s>1e-9?(A.z*db+B.z*da)/s:(+A.z + +B.z)/2;}
      const zt=sampleZbil(g,x,y);if(!Number.isFinite(zv)||!Number.isFinite(zt))continue;
      dif[row*nc+col]=zv-zt;valid++;
    }
  }
  if(valid<4)return [];
  const curvas=contourLevel({nc,nr,cs,xll,yll,z:dif},0),
    feats=cavaLimpaRuidoInter(
      curvas.map(geom=>({geom:geom.map(p=>p.slice()),
        zg:geom.map(p=>sampleZbil(g,p[0],p[1]))})).filter(f=>f.geom.length>=2),cs),
    nos=cavaPreparaNosExatos(rs,g),tol=Math.max(cs*2.5,(g.cs||1)*2.5),eps=Math.max(1e-8,cs*1e-8);
  /* O zero da superfície passa matematicamente por cada cruzamento da
     breakline. A discretização pode deixá-lo entre duas células; injeta o
     ponto analítico na cadeia zero mais próxima e usa o mesmo XY/Z. */
  for(const no of nos){
    let best=null;
    for(const f of feats)for(let i=1;i<f.geom.length;i++){
      const a=f.geom[i-1],b=f.geom[i],dx=b[0]-a[0],dy=b[1]-a[1],dd=dx*dx+dy*dy,
        t=Math.max(0,Math.min(1,dd?((no[0]-a[0])*dx+(no[1]-a[1])*dy)/dd:0)),
        q=[a[0]+dx*t,a[1]+dy*t],d=Math.hypot(no[0]-q[0],no[1]-q[1]);
      if(!best||d<best.d)best={f,i,d};
    }
    if(!best||best.d>tol)continue;
    const p=[no[0],no[1]],z=Number.isFinite(no[2])?no[2]:sampleZbil(g,no[0],no[1]),F=best.f,i=best.i;
    if(Math.hypot(F.geom[i-1][0]-p[0],F.geom[i-1][1]-p[1])<=eps){F.geom[i-1]=p;F.zg[i-1]=z;}
    else if(Math.hypot(F.geom[i][0]-p[0],F.geom[i][1]-p[1])<=eps){F.geom[i]=p;F.zg[i]=z;}
    else{F.geom.splice(i,0,p);F.zg.splice(i,0,z);}
  }
  feats.forEach(f=>{f._metodo='superficie-aneis-x-mdt';f._cell=cs;});
  return cavaValidaComponentesIntersecao(feats,nos,g).concat(saia);
}

function rb31CalcInterFeats(st){
  try{
    if(!st||!st.feats||!st.feats.length)return null;
    const chk=document.getElementById('cavaShowInter');
    if(chk&&!chk.checked)return null;
    const sel=document.getElementById('cavaMdtSel'),
      rid=sel?sel.value:null,
      R=(S.rasters||[]).find(x=>String(x.id)===String(rid))||
        ((S.rasters||[]).length===1?S.rasters[0]:null),
      g=R&&R.d;
    if(!g)return null;
    const alturas=(st.paramBancos||[]).map(q=>+q.H).filter(Number.isFinite),
      H=alturas.length?Math.max(...alturas):+((document.getElementById('rb31H')||{}).value||15),
      linhas=[];
    for(const f of st.feats){
      if(f.props.CLASSE!=='rb31-crista'&&f.props.CLASSE!=='rb31-pe')continue;
      const ring=f.geom.map(p=>p.slice());
      if(ring.length>3&&Math.hypot(ring[0][0]-ring[ring.length-1][0],
        ring[0][1]-ring[ring.length-1][1])<1e-7)ring.pop();
      if(ring.length>=3)linhas.push({ring,z:+f.props.COTA||0,bench:+f.props.BANCO||0});
    }
    if(linhas.length<2)return null; /* precisa de ao menos 2 cotas p/ cruzar */
    /* MDT sem NENHUM dado amostrável (projeto guarda só a prévia): avisa.
       A sonda é MULTIPONTO — cobertura parcial (MDT que pega só parte da
       pilha) é normal e não pode bloquear: a grade lida com NaN célula a
       célula e desenha a interseção onde há terreno. */
    {
      let fin=0,tot=0;
      for(const ln of linhas){
        const g2=ln.ring,passo=Math.max(1,Math.floor(g2.length/12));
        for(let i=0;i<g2.length&&tot<80;i+=passo){
          tot++;
          if(Number.isFinite(sampleZbil(g,g2[i][0],g2[i][1])))fin++;
        }
        if(fin)break;
      }
      if(!fin){
        if(S._rb31AvisoMdtSemDados!==String(R.id)){
          S._rb31AvisoMdtSemDados=String(R.id);
          const m='O MDT "'+R.name+'" está sem os dados de elevação neste projeto (só a prévia). '+
            'Abra as propriedades da superfície e use "Indicar o GeoTIFF" — a linha de interseção volta em seguida.';
          toast(m); try{ cmdLog(m,'avisa'); }catch(e){}
        }
        return null;
      }
    }
    linhas.sort((a,b)=>b.z-a.z); /* da crista para o fundo */
    return (cavaIntersecaoSuperficies(linhas,g,H,false)||[]).map(s=>({
      geom:s.geom,multi:false,zg:s.zg,
      props:{TIPO:'Interseção cava × terreno',BANCO:null,COTA:null,
        ALTURA:H,BERMA:null,ANGULO:null,CLASSE:'rb31-inter'}}));
  }catch(e){console.warn('rb31 interseção dinâmica',e);return null;}
}

function rb31Iterar(){
  /* Operação TRANSACIONAL: ou o ciclo completo é concluído, ou o estado
     anterior é restaurado. Assim uma falha na nova bancada não deixa uma
     berma aplicada isoladamente nem altera a sequência parcialmente. */
  const st=rb31Estado(),snap=rb31Snap(st);
  /* o MOTIVO da recusa vinha sendo engolido pela transação — o usuário só
     via a frase genérica. Captura-se o último aviso emitido dentro do
     ciclo e ele é anexado à mensagem final. */
  const tOrig=window.toast;let motivo='';
  window.toast=m=>{motivo=String(m);};
  const solta=()=>{window.toast=tOrig;};
  const falha=msg=>{
    solta();
    rb31AplicaSnap(st,snap);
    rb31RestauraLimite(st);
    rb31Desenha(st);
    const full=msg+(motivo&&motivo!==msg?': '+motivo:'');
    const info=document.getElementById('rb31Info');
    if(info)info.textContent=full+' O estado anterior foi restaurado integralmente.';
    toast(full+' — nenhuma alteração foi mantida');
    try{ cmdLog('rb31Iterar falhou: '+full,'erro'); }catch(e){}
    return false;
  };
  try{
    if(st.fase==='pe'&&!rb31OffsetBerma(true))return falha('Não foi possível concluir a berma pendente');
    if(!rb31Gerar(true))return falha('Não foi possível gerar a próxima bancada');
    if(!rb31OffsetBerma(true))return falha('A bancada foi rejeitada porque a berma final não pôde ser gerada');
  }catch(e){
    console.error('rb31Iterar',e);
    return falha('A iteração foi interrompida por um erro geométrico');
  }
  solta();
  const info=document.getElementById('rb31Info');
  if(info)info.innerHTML='Iteração: bancada <b>'+st.banco+'</b> completa (pé '+
    st.zPe.toFixed(2)+', berma pronta). Aperte de novo para a próxima.';
  toast('Bancada '+st.banco+' completa — pé na cota '+st.zPe.toFixed(2));
  rb31AuditaCompletude(st,'iteração');
  return true;
}
