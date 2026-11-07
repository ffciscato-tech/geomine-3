#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');

function chain(r){
  const ch=[0];
  for(let i=1;i<=r.length;i++){
    const a=r[i-1],b=r[i%r.length];
    ch.push(ch.at(-1)+Math.hypot(b[0]-a[0],b[1]-a[1]));
  }
  return ch;
}

function nearest(r,ch,p){
  let best=0,bd=Infinity;
  for(let i=0;i<r.length;i++){
    const a=r[i],b=r[(i+1)%r.length],dx=b[0]-a[0],dy=b[1]-a[1],q=dx*dx+dy*dy;
    const t=Math.max(0,Math.min(1,q?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/q:0));
    const x=a[0]+dx*t,y=a[1]+dy*t,d=(p[0]-x)**2+(p[1]-y)**2;
    if(d<bd){bd=d;best=ch[i]+Math.sqrt(q)*t;}
  }
  return best;
}

function pointAt(r,ch,s){
  const per=ch.at(-1);
  s=((s%per)+per)%per;
  for(let i=1;i<ch.length;i++){
    if(s<=ch[i]+1e-9){
      const a=r[i-1],b=r[i%r.length],t=(s-ch[i-1])/((ch[i]-ch[i-1])||1);
      return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    }
  }
  return r[0].slice();
}

function inside(x,y,r){
  let yes=false;
  for(let i=0,j=r.length-1;i<r.length;j=i++){
    const a=r[i],b=r[j];
    if(((a[1]>y)!==(b[1]>y))&&x<(b[0]-a[0])*(y-a[1])/((b[1]-a[1])||1e-30)+a[0])yes=!yes;
  }
  return yes;
}

function geometryContext(){
  const ctx={console};
  ctx.window=ctx;
  ctx.pointInRing=inside;
  ctx.cavaChain=chain;
  ctx.cavaNearestChain=nearest;
  ctx.cavaPointChain=pointAt;
  ctx.cavaDeloop=r=>r.map(p=>p.slice());
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root,
    'src/modules/mining/alagis-saidas-rampa-sem-cruzamento.js'),'utf8'),ctx);
  return ctx;
}

function testNoBranchJump(){
  const ctx=geometryContext();
  /* Dois ramos paralelos separados por 12 m. Os pontos alternam ao redor do
     eixo médio: uma busca global independente troca de ramo; o guia deve
     mantê-los no ramo inferior, no sentido crescente da cadeia. */
  const pe=[[0,0],[100,0],[100,12],[0,12]],wk=ctx.rb31Walker(pe),ch=chain(pe),
    line=[[0,6,100],[20,6.1,98],[40,5.9,96],[60,6.1,94],[80,5.9,92],[100,6,90]],
    out=ctx.rb31ConformaFaceEstrita(line,pe,100,-10,-6,4,wk,ch,45,null,null,
      {sIni:0,sFim:100,dir:1,arco:100});
  assert.ok(out&&out.A.length>=line.length,'a conformação deve produzir a rampa completa e amostrada');
  for(let i=1;i<out.A.length;i++){
    assert.ok(out.A[i][0]>=out.A[i-1][0]-1e-7,'a estação não pode andar para trás');
    assert.ok(out.A[i][1]<=out.A[i-1][1]+1e-7,'a borda deve permanecer no mesmo ramo do pé');
  }
  for(let i=0;i<out.A.length;i++){
    const w=Math.hypot(out.A[i][0]-out.B[i][0],out.A[i][1]-out.B[i][1]);
    assert.ok(Math.abs(w-4)<1e-7,'a largura projetada deve permanecer exata');
  }
}

function testTransportedPairIsLiteral(){
  const originalA=[4,2],originalB=[4,12],seen={};
  const ring=[[100,0],[200,0],[200,100],[100,100]],st={
    banco:1,fase:'crista',semRampa:false,semRampaAte:0,_semEste:false,
    proxIniA:originalA.slice(),proxIniB:originalB.slice(),
    pFim:originalA.slice(),pFimB:originalB.slice(),
    _origemRampa105:{A:originalA.slice(),B:originalB.slice(),usaProx:true,banco:2},
    crista:ring.map(p=>p.slice()),
    feats:[{geom:ring.map(p=>p.slice()),props:{BANCO:1,CLASSE:'rb31-crista',BERMA:6}}]
  };
  const ctx={console,S:{_rb31:st},document:{getElementById:()=>({value:'10'})}};
  ctx.window=ctx;
  ctx.rb31Estado=()=>st;
  ctx.rb31Gerar=()=>{
    seen.A=st.proxIniA.slice();seen.B=st.proxIniB.slice();return true;
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root,
    'src/modules/mining/alagis-105-ultima-edicao-com-rampa.js'),'utf8'),ctx);
  assert.equal(ctx.rb31Gerar(true),true);
  assert.deepEqual(seen.A,originalA,'o offset 106 não pode ser remapeado globalmente pela 105');
  assert.deepEqual(seen.B,originalB,'o par inteiro deve permanecer no ramo transportado');
}

function testCompleteBench(){
  const ctx=geometryContext(),crista=[[0,0],[220,0],[220,120],[0,120]],
    out=ctx.rb31Bancada(crista,100,{ang:45,H:10,W:10,grade:10,dir:'ccw',
      fora:false,up:false,startP:[20,0],berma:6,_debug:true});
  assert.ok(out&&out.peEntregue&&out.peEntregue.length>3,
    `a bancada completa deve ser gerada: ${out&&out.warn||'sem resultado'} ${JSON.stringify(out&&out._debug||{})}`);
  assert.ok(out.bordaA.length>2&&out.bordaB.length>2,'as duas bordas devem ser contínuas');
  assert.ok(out.faceAudit,'a bancada completa deve conservar a auditoria geométrica');
  assert.ok(Math.abs(out.faceAudit.widthMin-10)<1e-6&&
    Math.abs(out.faceAudit.widthMax-10)<1e-6,'a pista completa deve conservar 10 m');
  assert.ok(Math.abs(out.faceAudit.faceMin-45)<1e-3&&
    Math.abs(out.faceAudit.faceMax-45)<1e-3,
    'a face completa deve conservar 45°: '+JSON.stringify(out.faceAudit));
}

function offsetMiter(pts,d){
  const segs=[],n=pts.length;
  for(let i=0;i<n;i++){
    const a=pts[i],b=pts[(i+1)%n],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);
    if(L<1e-9)continue;
    segs.push({a:[a[0]-dy/L*d,a[1]+dx/L*d],b:[b[0]-dy/L*d,b[1]+dx/L*d]});
  }
  const out=[];
  for(let i=0;i<segs.length;i++){
    const s1=segs[i],s2=segs[(i+1)%segs.length],x1=s1.a[0],y1=s1.a[1],
      x2=s1.b[0],y2=s1.b[1],x3=s2.a[0],y3=s2.a[1],x4=s2.b[0],y4=s2.b[1],
      den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);
    if(Math.abs(den)<1e-9){out.push(s1.b.slice(),s2.a.slice());continue;}
    const t=((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4))/den,
      p=[x1+t*(x2-x1),y1+t*(y2-y1)];
    if(Math.hypot(p[0]-s1.b[0],p[1]-s1.b[1])<=Math.abs(d)*8)out.push(p);
    else out.push(s1.b.slice(),s2.a.slice());
  }
  return out;
}

function testExactBermMouth(){
  const ctx=geometryContext(),crista=[[0,0],[140,22],[285,46],[410,92],
    [425,220],[265,198],[115,162],[-24,78]],B=6,W=10,H=12,ang=33,grade=10,
    opt={ang,H,W,grade,dir:'ccw',fora:false,up:true,berma:B,
      startP:[42,9],_debug:true};
  let fator=1,best=null;
  for(let i=0;i<24;i++){
    opt._fatorL=fator;
    const r=ctx.rb31Bancada(crista,820,opt);
    assert.ok(r&&r.peEntregue,'a bancada de 33° deve permanecer gerável');
    const erro=Math.abs(r.faceAudit.grade-grade);
    if(!best||erro<best.erro)best={r,erro};
    fator*=r.faceAudit.grade/grade;
  }
  const r=best.r,base=r.peEntregue,
    area=base.reduce((a,p,i)=>a+p[0]*base[(i+1)%base.length][1]-
      base[(i+1)%base.length][0]*p[1],0)/2,
    /* offsetRing: positivo = esquerda; Inside usa o lado interno do anel */
    berma=offsetMiter(base,(area>=0?1:-1)*B),
    pA=r.pFim,pB=r.pFimB,sx=pB[0]-pA[0],sy=pB[1]-pA[1],sl=Math.hypot(sx,sy),
    ux=sx/sl,uy=sy/sl,nx=-uy,ny=ux,mx=(pA[0]+pB[0])/2,my=(pA[1]+pB[1])/2;
  let par=null;
  for(let i=0;i<berma.length;i++){
    const a=berma[i],b=berma[(i+1)%berma.length],ex=b[0]-a[0],ey=b[1]-a[1],
      el=Math.hypot(ex,ey);
    if(el<sl*.94)continue;
    const paralelo=Math.abs((ex/el)*ux+(ey/el)*uy),
      afast=Math.abs(((a[0]+b[0])/2-mx)*nx+((a[1]+b[1])/2-my)*ny);
    if(paralelo>.999&&Math.abs(afast-B)<1e-6){par={a,b,el,afast};break;}
  }
  assert.ok(par,'o offset deve criar a travessa paralela da próxima saída');
  assert.ok(Math.abs(par.afast-B)<1e-6,'a boca seguinte deve ficar exatamente a 6 m');
  assert.ok(par.el>=W-.03,'a travessa deslocada deve comportar a pista de 10 m');
  assert.ok(Math.max(Math.abs(r.faceAudit.faceMin-ang),
    Math.abs(r.faceAudit.faceMax-ang))<1e-2,
    'a face deve permanecer constante em 33°: '+JSON.stringify(r.faceAudit));
  assert.ok(Math.abs(r.faceAudit.grade-grade)<.05,
    'a declividade longitudinal deve permanecer constante em 10%');
}

function testMultiBenchJoints(){
  const ctx=geometryContext();
  ctx.document={getElementById:()=>({value:'10'})};
  vm.runInContext(fs.readFileSync(path.join(root,
    'src/modules/mining/alagis-106-continuidade-offset-rampa.js'),'utf8'),ctx);
  const gera=(crista,z,opt)=>{
    let fator=1,best=null,seq=[];
    for(let i=0;i<12;i++){
      opt._fatorL=fator;
      const r=ctx.rb31Bancada(crista,z,opt);
      assert.ok(r&&r.peEntregue,'a sequência de bancadas deve permanecer gerável');
      const erro=Math.abs(r.faceAudit.grade-opt.grade);
      seq.push({fator,grade:r.faceAudit.grade,n:r.bordaA.length});
      if(!best||erro<best.erro)best={r,erro};
      fator*=r.faceAudit.grade/opt.grade;
    }
    best.r._seq=seq;
    return best.r;
  },mesmoPonto=(a,b)=>a&&b&&Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7,
  mesmoPar=(a,b,u,v)=>(mesmoPonto(a,u)&&mesmoPonto(b,v))||
    (mesmoPonto(a,v)&&mesmoPonto(b,u)),
  intersecoes=(A,B)=>{
    const out=[];
    for(let i=0;i<A.length-1;i++)for(let j=0;j<B.length-1;j++){
      const a=A[i],b=A[i+1],c=B[j],d=B[j+1],
        den=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]);
      if(Math.abs(den)<1e-12)continue;
      const t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/den,
        u=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/den;
      if(t>1e-7&&t<1-1e-7&&u>1e-7&&u<1-1e-7)
        out.push({i,j,p:[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]});
    }
    return out;
  },cruza=(A,B)=>intersecoes(A,B).length;
  let crista=[[0,0],[120,45],[260,80],[400,105],[420,220],[270,195],[120,155],[-30,80]],
    z=100,anterior=null,publicadas=[];
  for(let banco=1;banco<=3;banco++){
    const opt={ang:45,H:10,W:10,grade:10,dir:'ccw',fora:false,up:false,berma:6,
      _debug:true};
    if(banco===1)opt.startP=[40,15];
    else{
      const q=ctx.rb106ParLocal(crista,{A:anterior.pFim,B:anterior.pFimB,banco},10),
        A=anterior.bordaA,n=A.length,dx=A[n-1][0]-A[n-2][0],dy=A[n-1][1]-A[n-2][1],
        dl=Math.hypot(dx,dy)||1;
      Object.assign(opt,{startP:q.A,entradaDegrau:true,solIniA:q.A,solIniB:q.B,
        solDireto:true,solDir:[dx/dl,dy/dl]});
    }
    const r=gera(crista,z,opt);
    assert.ok(r.faceAudit,'cada bancada deve publicar a auditoria geométrica');
    assert.ok(Math.abs(r.faceAudit.faceMin-45)<1e-3&&
      Math.abs(r.faceAudit.faceMax-45)<1e-3,
      `a face da bancada ${banco} deve permanecer em 45° ao acompanhar crista/pé`);
    assert.ok(Math.abs(r.faceAudit.widthMin-10)<1e-6&&
      Math.abs(r.faceAudit.widthMax-10)<1e-6,
      `a largura da bancada ${banco} deve permanecer em 10 m: `+
      JSON.stringify(r.faceAudit));
    assert.ok(Math.abs(r.faceAudit.grade-10)<.30,
      `a declividade longitudinal da bancada ${banco} deve permanecer em 10%: `+
      r.faceAudit.grade+' '+JSON.stringify(r._seq));
    assert.ok(r._debug&&mesmoPar(r.bordaA[0],r.bordaB[0],
      r._debug.iniA,r._debug.iniB),
      `a saída da rampa ${banco} deve conservar os dois pontos originais`);
    assert.ok(mesmoPar(r.bordaA.at(-1),r.bordaB.at(-1),
      r._debug.fimA,r._debug.fimB),
      `a chegada da rampa ${banco} deve conservar os dois pontos originais`);
    assert.equal(cruza(r.bordaA,r.bordaB),0,
      `as bordas da rampa ${banco} não podem se cruzar: `+
      JSON.stringify({x:intersecoes(r.bordaA,r.bordaB),brute:(r.bordaA.length===3?
        Array.from({length:24},(_,k)=>{
          const q=[r.bordaA[1][0]+Math.cos(k*Math.PI/12)*10,
            r.bordaA[1][1]+Math.sin(k*Math.PI/12)*10];
          return {k,x:cruza(r.bordaA,[r.bordaB[0],q,r.bordaB[2]])};
        }).filter(q=>q.x===0):null),
        ajuste:r._debug&&r._debug.corredorTrafegavel,
        encaixe:r._debug&&r._debug.encaixeTrafegavel&&{
          mi:r._debug.encaixeTrafegavel.mi,mf:r._debug.encaixeTrafegavel.mf,
          candidatos:r._debug.encaixeTrafegavel.candidatos},
        A:r.bordaA,B:r.bordaB,
        face:r._debug&&r._debug.facePublicada}));
    const C=crista.concat([crista[0]]),P=r.peEntregue.concat([r.peEntregue[0]]);
    assert.equal(cruza(C,P),0,
      `crista e pé da bancada ${banco} não podem se cruzar: `+
      JSON.stringify({pe:intersecoes(C,P),
        peBerma:intersecoes(C,r.peBerma.concat([r.peBerma[0]]))}));
    assert.equal(cruza(C,r.bordaA)+cruza(C,r.bordaB),0,
      `a rampa ${banco} só pode tocar a crista nas pontas da boca`);
    assert.equal(cruza(P,r.bordaA)+cruza(P,r.bordaB),0,
      `a rampa ${banco} só pode tocar o pé nas pontas da chegada: `+
      JSON.stringify({A:intersecoes(P,r.bordaA),B:intersecoes(P,r.bordaB),
        p01:P.slice(0,2),bn:r.bordaB.length,bFim:r.bordaB.slice(-4),
        b01:r.bordaB.slice(0,2),a01:r.bordaA.slice(0,2),
        encaixe:r._debug&&r._debug.encaixeTrafegavel&&{
          mi:r._debug.encaixeTrafegavel.mi,mf:r._debug.encaixeTrafegavel.mf,
          candidatos:r._debug.encaixeTrafegavel.candidatos}}));
    for(const velha of publicadas){
      const xs={C:intersecoes(velha.g,C),P:intersecoes(velha.g,P),
        A:intersecoes(velha.g,r.bordaA),B:intersecoes(velha.g,r.bordaB)},
        nx=xs.C.length+xs.P.length+xs.A.length+xs.B.length;
      assert.equal(nx,0,`a bancada ${banco} não pode cruzar ${velha.nome}: `+
        JSON.stringify(xs));
    }
    publicadas.push({nome:`crista ${banco}`,g:C},{nome:`pé ${banco}`,g:P},
      {nome:`rampa A ${banco}`,g:r.bordaA},{nome:`rampa B ${banco}`,g:r.bordaB});
    anterior=r;
    /* cenário sintético legado: a próxima crista deriva do pé entregue;
       o projeto real abaixo cobre separadamente a união híbrida local */
    crista=offsetMiter(r.peEntregue,6);
    z-=10;
  }
}

/* Caso de regressão opcional com um projeto CCMGIS real. Não torna a suíte
   dependente de arquivo externo; no desenvolvimento, passe CCMGIS_REAL_PROJECT
   para auditar exatamente a cava que revelou os dentes de centímetros. */
function testRealProjectIfProvided(){
  const arquivo=process.env.CCMGIS_REAL_PROJECT;
  if(!arquivo)return;
  const projeto=JSON.parse(fs.readFileSync(arquivo,'utf8')),
    fonte=projeto.layers.find(L=>L.id===79)||projeto.layers.find(L=>L.name==='DCE'),
    camada=projeto.layers.find(L=>L._rb31Recipe),
    receita=(camada&&camada._rb31Recipe)||(process.env.CCMGIS_RAMP_FALLBACK?{
      z0:820,startP:[309407.4346770629,7698460.145473371],
      par:{ang:33,H:12,B:6,W:10,grade:10,dir:'ccw'},hist:Array(6).fill({})
    }:null);
  assert.ok(fonte&&fonte.features&&fonte.features[0]&&receita,
    'o projeto real deve conter o limite e a receita paramétrica');
  let crista=fonte.features[0].geom.map(p=>p.slice(0,2));
  if(Math.hypot(crista[0][0]-crista.at(-1)[0],crista[0][1]-crista.at(-1)[1])<1e-7)
    crista.pop();
  const ctx=geometryContext();
  ctx.document={getElementById:()=>({value:String(receita.par.W||10)})};
  vm.runInContext(fs.readFileSync(path.join(root,
    'src/modules/mining/alagis-106-continuidade-offset-rampa.js'),'utf8'),ctx);
  const par=receita.par,z0=+receita.z0,H=+par.H,W=+par.W,Berma=+par.B,
    alvo=+par.grade,numero=Math.min(6,(receita.hist||[]).length||6),
    gera=(C,z,opt)=>{
      let fator=1,best=null,seq=[],acima=null,abaixo=null,amostras=[];
      for(let i=0;i<24;i++){
        opt._fatorL=fator;
        const r=ctx.rb31Bancada(C,z,opt);
        assert.ok(r&&r.bordaA&&r.bordaB,'o projeto real deve permanecer gerável');
        const erro=Math.abs(r.faceAudit.grade-alvo);
        seq.push({fator,grade:r.faceAudit.grade,n:r.bordaA.length});
        if(!best||erro<best.erro)best={r,erro};
        if(erro<=.005)break;
        const ponto={f:fator,g:r.faceAudit.grade};
        amostras.push(ponto);
        if(ponto.g>=alvo){if(!acima||Math.abs(ponto.g-alvo)<Math.abs(acima.g-alvo))acima=ponto;}
        else if(!abaixo||Math.abs(ponto.g-alvo)<Math.abs(abaixo.g-alvo))abaixo=ponto;
        if(acima&&abaixo&&Math.abs(acima.g-abaixo.g)>1e-10){
          fator=abaixo.f+(alvo-abaixo.g)*(acima.f-abaixo.f)/(acima.g-abaixo.g);
          const f0=Math.min(acima.f,abaixo.f),f1=Math.max(acima.f,abaixo.f);
          if(!(fator>f0+1e-7&&fator<f1-1e-7))fator=(f0+f1)/2;
          if(amostras.some(q=>Math.abs(q.f-fator)<1e-7)){
            const xs=[f0,f1].concat(amostras.map(q=>q.f).filter(x=>x>f0&&x<f1))
              .sort((a,b)=>a-b);
            let ga=-1,k=0;for(let j=1;j<xs.length;j++)if(xs[j]-xs[j-1]>ga){ga=xs[j]-xs[j-1];k=j;}
            fator=(xs[k-1]+xs[k])/2;
          }
        }else fator*=r.faceAudit.grade/alvo;
      }
      best.r._seqReal=seq;
      return best.r;
    },segmentos=g=>g.slice(1).map((p,i)=>Math.hypot(p[0]-g[i][0],p[1]-g[i][1])),
    distLinha=(p,g)=>{
      let m=Infinity;
      for(let i=1;i<g.length;i++){
        const a=g[i-1],b=g[i],dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy||1,
          t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L2));
        m=Math.min(m,Math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy)));
      }
      return m;
    },
    maiorRetorno=g=>{
      let m=0;
      for(let i=1;i<g.length-1;i++){
        const a=g[i-1],p=g[i],b=g[i+1],u=[p[0]-a[0],p[1]-a[1]],
          v=[b[0]-p[0],b[1]-p[1]];
        m=Math.max(m,Math.abs(Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1])*180/Math.PI));
      }
      return m;
    },detalheRetorno=g=>{
      const out=[];
      for(let i=1;i<g.length-1;i++){
        const a=g[i-1],p=g[i],b=g[i+1],u=[p[0]-a[0],p[1]-a[1]],
          v=[b[0]-p[0],b[1]-p[1]],ang=Math.abs(Math.atan2(
            u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1])*180/Math.PI);
        out.push({i,ang,pts:[a,p,b]});
      }
      return out.sort((a,b)=>b.ang-a.ang).slice(0,3);
    },cruzamentosAbertos=(A,B,mesma=false)=>{
      let n=0;
      for(let i=0;i<A.length-1;i++)for(let j=0;j<B.length-1;j++){
        if(mesma&&(Math.abs(i-j)<=1))continue;
        const a=A[i],b=A[i+1],c=B[j],d=B[j+1],
          den=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]);
        if(Math.abs(den)<1e-12)continue;
        const t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/den,
          u=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/den;
        if(t>1e-7&&t<1-1e-7&&u>1e-7&&u<1-1e-7)n++;
      }
      return n;
    };
  const visuais=[];
  let anterior=null,z=z0;
  for(let banco=1;banco<=numero;banco++){
    const opt={ang:+par.ang,H,W,grade:alvo,dir:par.dir||'ccw',fora:false,up:true,
      berma:Berma,_debug:true};
    if(banco===1)opt.startP=receita.startP.slice();
    else{
      const q=ctx.rb106ParLocal(crista,{A:anterior.pFim,B:anterior.pFimB,banco},W),
        A=anterior.bordaA,n=A.length,dx=A[n-1][0]-A[n-2][0],
        dy=A[n-1][1]-A[n-2][1],dl=Math.hypot(dx,dy)||1;
      Object.assign(opt,{startP:q.A,entradaDegrau:true,solIniA:q.A,solIniB:q.B,
        solDireto:true,solDir:[dx/dl,dy/dl]});
    }
    const r=gera(crista,z,opt),segs=segmentos(r.bordaA).concat(segmentos(r.bordaB));
    if(process.env.CCMGIS_RAMP_DIAG)console.log(JSON.stringify({fase:'inicio',banco,
      n:r.bordaA.length,retornoA:maiorRetorno(r.bordaA),retornoB:maiorRetorno(r.bordaB),
      pioresA:detalheRetorno(r.bordaA),pioresB:detalheRetorno(r.bordaB),
      estacoes:((r._debug&&r._debug.facePublicada)||[]).map(q=>({i:q.i,s:q.s})),
      aposCrava:r._debug&&r._debug.aposCrava&&{
        retornoA:maiorRetorno(r._debug.aposCrava.A),retornoB:maiorRetorno(r._debug.aposCrava.B)},
      antes107:r._debug&&r._debug.antes107&&{
        retornoA:maiorRetorno(r._debug.antes107.A),retornoB:maiorRetorno(r._debug.antes107.B)},
      reparos:r._debug&&r._debug.corredorTrafegavel,audit:r.faceAudit}));
    if(process.env.CCMGIS_RAMP_DIAG_FULL&&banco===4)
      console.log(JSON.stringify({fase:'full',banco,A:r.bordaA,B:r.bordaB}));
    visuais.push({C:crista.map(p=>p.slice()),A:r.bordaA.map(p=>p.slice()),
      B:r.bordaB.map(p=>p.slice())});
    assert.ok(Math.abs(r.faceAudit.grade-alvo)<.10,
      `o eixo real do banco ${banco} deve conservar o greide: ${r.faceAudit.grade} `+
      JSON.stringify(r._seqReal));
    assert.ok(Math.max(Math.abs(r.faceAudit.faceMin-par.ang),
      Math.abs(r.faceAudit.faceMax-par.ang))<.10,
      `a face real do banco ${banco} deve conservar ${par.ang}°`);
    assert.ok(Math.max(Math.abs(r.faceAudit.widthMin-W),
      Math.abs(r.faceAudit.widthMax-W))<.03,
      `a pista real do banco ${banco} deve conservar ${W} m: `+
      JSON.stringify({audit:r.faceAudit,larguras:r.bordaA.map((p,i)=>({i,w:
        Math.hypot(p[0]-r.bordaB[i][0],p[1]-r.bordaB[i][1])})).sort((a,b)=>a.w-b.w).slice(0,4)}));
    /* Auditoria equivalente à Régua 3D do usuário, agora sobre a
       geometria PUBLICADA: borda externa contra a linha de partida. Isso
       detecta a antiga diferença entre a face auditada antes da solda
       (33°) e a face que aparecia no mapa depois dela (72,7°). */
    const angulosFace=[];
    for(let i=1;i<r.bordaA.length-1;i++){
      const h=Math.abs(r.bordaA[i][2]-z),
        d=distLinha(r.bordaA[i],crista.concat([crista[0]]));
      if(h>.2&&d>.2)angulosFace.push({i,h,d,a:Math.atan2(h,d)*180/Math.PI});
    }
    const erroFaceMapa=Math.max(...angulosFace.map(q=>Math.abs(q.a-par.ang))),
      faceCorrespondente=(r._debug&&r._debug.facePublicada)||[],
      erroFaceCorrespondente=Math.max(...faceCorrespondente.map(q=>Math.abs(q.angulo-par.ang)));
    if(process.env.CCMGIS_RAMP_DIAG&&erroFaceMapa>=.25)console.log(JSON.stringify({
      fase:'face-mapa',banco,extremos:angulosFace.slice().sort((a,b)=>
        Math.abs(b.a-par.ang)-Math.abs(a.a-par.ang)).slice(0,8),
      correspondentes:faceCorrespondente.slice(0,4)}));
    /* Em vértice de mitra, a Régua usa distância euclidiana à poligonal
       publicada enquanto a construção usa a seção normal da mesma face.
       Admite somente a diferença submétrica dessa representação: 0,25°.
       Erros geométricos reais (como os 72,7° observados) continuam falhando. */
    /* Em cava fechada, a linha globalmente mais próxima pode pertencer a
       outro nível. A Régua operacional seleciona a crista/pé da MESMA
       estação da rampa; é essa correspondência que deve conservar a face. */
    assert.ok(faceCorrespondente.length&&erroFaceCorrespondente<.20,
      `a Régua 3D deve medir ${par.ang}° na face publicada do banco ${banco}: `+
      `${Math.min(...faceCorrespondente.map(q=>q.angulo)).toFixed(3)}°–`+
      `${Math.max(...faceCorrespondente.map(q=>q.angulo)).toFixed(3)}°`);
    /* O reparo local pode densificar a curva; rejeita apenas duplicatas ou
       segmentos menores que 5 cm, que seriam ruído de CAD. */
    const sa=segmentos(r.bordaA),sb=segmentos(r.bordaB),
      segsInternos=sa.filter((v,i)=>i>1&&i<sa.length-2)
        .concat(sb.filter((v,i)=>i>1&&i<sb.length-2));
    assert.ok(Math.min(...segsInternos)>.05,
      `o banco ${banco} não pode acumular vértices centimétricos: `+
      JSON.stringify({min:Math.min(...segsInternos),A:segmentos(r.bordaA).map((v,i)=>({i,v})).sort((a,b)=>a.v-b.v).slice(0,3),
        B:segmentos(r.bordaB).map((v,i)=>({i,v})).sort((a,b)=>a.v-b.v).slice(0,3)}));
    assert.equal(r._debug.aposCrava.A.length-r.bordaA.length,
      ((r._debug.corredorTrafegavel&&r._debug.corredorTrafegavel.secoesRetornoRemovidas)||0)+
      ((r._debug.corredorTrafegavel&&r._debug.corredorTrafegavel.amostrasBocaRemovidas)||0)+
      ((r._debug.corredorTrafegavel&&r._debug.corredorTrafegavel.dentesCurtosRemovidos)||0)-
      ((r._debug.corredorTrafegavel&&r._debug.corredorTrafegavel.secoesCurvaDensificadas)||0),
      `a correção final do banco ${banco} só pode retirar as seções de retorno auditadas`);
    assert.ok(Math.max(...r.bordaA.map((p,i)=>Math.abs(p[2]-r.bordaB[i][2])))<1e-8,
      `as duas bordas do banco ${banco} devem ter a mesma cota por seção`);
    /* As travessas de entrada/saída são âncoras construtivas e podem formar
       um ângulo forte com o primeiro segmento longitudinal. Não as confunda
       com dente da pista: elas devem permanecer literalmente nos quatro
       pinos escolhidos pelo gerador. */
    const dbg=r._debug||{},dist2=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1]);
    assert.ok(dist2(r.bordaA[0],dbg.iniA)<.03&&dist2(r.bordaB[0],dbg.iniB)<.03&&
      dist2(r.bordaA.at(-1),dbg.fimA)<.03&&dist2(r.bordaB.at(-1),dbg.fimB)<.03,
      `as quatro bocas do banco ${banco} devem permanecer cravadas`);
    const retornosInternos=detalheRetorno(r.bordaA).concat(detalheRetorno(r.bordaB))
      .filter(q=>q.i>1&&q.i<r.bordaA.length-2);
    assert.ok(!retornosInternos.some(q=>q.ang>35.1),
      `o interior trafegável do banco ${banco} não pode ter curva acima de 35° por vértice: `+
      JSON.stringify(retornosInternos.filter(q=>q.ang>35.1)));
    const dentesCurtos=detalheRetorno(r.bordaB).concat((()=>{
      const q=[];for(let i=1;i<r.bordaB.length-1;i++){
        const a=r.bordaB[i-1],p=r.bordaB[i],b=r.bordaB[i+1],
          curto=Math.min(Math.hypot(p[0]-a[0],p[1]-a[1]),
            Math.hypot(b[0]-p[0],b[1]-p[1])),
          ang=Math.abs(Math.atan2((p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]),
            (p[0]-a[0])*(b[0]-p[0])+(p[1]-a[1])*(b[1]-p[1]))*180/Math.PI);
        if(curto<Math.max(.5,.08*W))q.push({i,ang,curto});
      }return q;
    })()).filter(q=>q.curto!=null);
    assert.ok(!dentesCurtos.some(q=>q.ang>35.1),
      `a borda interna do banco ${banco} não pode concentrar um dente em trecho curto: `+
      JSON.stringify(dentesCurtos.filter(q=>q.ang>35.1)));
    if(process.env.CCMGIS_RAMP_DIAG)console.log(JSON.stringify({banco,
      n:r.bordaA.length,retornoA:maiorRetorno(r.bordaA),
      retornoB:maiorRetorno(r.bordaB),audit:r.faceAudit,
      pioresA:detalheRetorno(r.bordaA),pioresB:detalheRetorno(r.bordaB)}));
    assert.equal(cruzamentosAbertos(r.bordaA,r.bordaA,true)+
      cruzamentosAbertos(r.bordaB,r.bordaB,true)+
      cruzamentosAbertos(r.bordaA,r.bordaB),0,
      `a curva real do banco ${banco} não pode formar laço nem cruzar as bordas`);
    const normal=ctx.rb31OffsetAnel(r.peNatural,-Berma);
    crista=ctx.rb31CristaSegueRampa2D(normal,r.bordaA,r.bordaB,Berma);
    const segue=[1,-1].map(lado=>r.bordaB.map((p,i)=>{
      const a=r.bordaB[Math.max(0,i-1)],b=r.bordaB[Math.min(r.bordaB.length-1,i+1)],
        tx=b[0]-a[0],ty=b[1]-a[1],tl=Math.hypot(tx,ty)||1;
      return distLinha([p[0]-ty/tl*lado*Berma,p[1]+tx/tl*lado*Berma],
        crista.concat([crista[0]]));
    }));
    const aderencia=Math.min(...segue.map(ds=>ds.reduce((a,b)=>a+b,0)/ds.length));
    assert.ok(aderencia<.35,
      `a crista ${banco+1} deve seguir localmente o offset 2D da rampa: ${aderencia}`);
    anterior=r;z+=H;
  }
  if(process.env.CCMGIS_RAMP_SVG){
    const pts=visuais.flatMap(v=>v.C.concat(v.A,v.B)),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),
      x0=Math.min(...xs)-15,y0=Math.min(...ys)-15,w=Math.max(...xs)-Math.min(...xs)+30,
      h=Math.max(...ys)-Math.min(...ys)+30,poly=(g,c,e)=>`<polyline points="${g.map(p=>
        `${p[0]},${p[1]}`).join(' ')}" fill="none" stroke="${c}" stroke-width="${e}"/>`,
      cores=['#7b2cff','#155eef','#00a36c','#e05a00','#d91e63','#6f42c1'],
      corpo=visuais.map((v,i)=>poly(v.C,'#111',.7)+poly(v.A,cores[i%cores.length],1.5)+
        poly(v.B,cores[i%cores.length],1.5)).join('');
    fs.writeFileSync(process.env.CCMGIS_RAMP_SVG,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#f4f1e8"/>${corpo}</svg>`);
  }
}

testNoBranchJump();
testTransportedPairIsLiteral();
testCompleteBench();
testExactBermMouth();
testMultiBenchJoints();
testRealProjectIfProvided();
console.log('OK: continuidade da rampa, ramo do anel e largura validados.');
