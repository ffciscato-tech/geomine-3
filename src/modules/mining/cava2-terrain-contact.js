/* Contato da Cava 2 com o MDT. Não completa arcos, não extrapola a cava e
   não reamostra o raster. Os triângulos de projeto são subdivididos até a
   célula do terreno; cada cruzamento é resolvido na amostra do próprio MDT.
   Entre dois anéis (pé e crista) a malha cobre exatamente a faixa e a cota do
   projeto vem de uma função — razão das distâncias aos dois anéis, com a
   rampa da bancada dentro dela —, não da correspondência entre os vértices. */
(function(root){
'use strict';
const MITER_LIMIT=3; // mesmo limite de junta de canto do motor da Cava 2 (offsetU)
const CHUNK=8;       // arestas por trecho nas caixas de busca
const BLEND=.2;      // faixa (±20%) em que pista e anel se misturam como limite do talude
/* Polilinha (anel fechado ou borda aberta) como vetores de arestas, com uma
   caixa por trecho de arestas: o ponto mais próximo é achado sem percorrer a
   linha inteira. Arestas nulas ficam de fora. */
function polyData(P,closed){
  const x=[],y=[],dx=[],dy=[],za=[],zb=[],m=closed?P.length:P.length-1;
  for(let i=0;i<m;i++){const a=P[i],b=P[(i+1)%P.length],ex=b[0]-a[0],ey=b[1]-a[1];
    if(ex*ex+ey*ey<1e-18)continue;x.push(a[0]);y.push(a[1]);dx.push(ex);dy.push(ey);za.push(a[2]??0);zb.push(b[2]??0);}
  const n=x.length,nc=Math.ceil(n/CHUNK),bx0=new Float64Array(nc).fill(Infinity),by0=new Float64Array(nc).fill(Infinity),
    bx1=new Float64Array(nc).fill(-Infinity),by1=new Float64Array(nc).fill(-Infinity);
  for(let i=0;i<n;i++){const c=(i/CHUNK)|0,u=x[i]+dx[i],v=y[i]+dy[i];
    bx0[c]=Math.min(bx0[c],x[i],u);bx1[c]=Math.max(bx1[c],x[i],u);by0[c]=Math.min(by0[c],y[i],v);by1[c]=Math.max(by1[c],y[i],v);}
  return {n,nc,closed:!!closed,x:Float64Array.from(x),y:Float64Array.from(y),dx:Float64Array.from(dx),dy:Float64Array.from(dy),
    za:Float64Array.from(za),zb:Float64Array.from(zb),bx0,by0,bx1,by1,hint:0,bi:-1,bt:0};
}
// Distância comum ao ponto mais próximo; guarda em R.bi/R.bt a aresta e o
// parâmetro. Com "list" só as arestas indicadas são testadas.
function polyPlain(R,px,py,list){
  const n=R.n,x=R.x,y=R.y,dx=R.dx,dy=R.dy;let best=Infinity,bi=-1,bt=0;
  if(list){
    for(let k=0;k<list.length;k++){const i=list[k],ux=px-x[i],uy=py-y[i],vx=dx[i],vy=dy[i],t=(ux*vx+uy*vy)/(vx*vx+vy*vy),
      tc=t<0?0:t>1?1:t,qx=ux-tc*vx,qy=uy-tc*vy,d2=qx*qx+qy*qy;if(d2<best){best=d2;bi=i;bt=t;}}
    R.bi=bi;R.bt=bt;return Math.sqrt(best);
  }
  const hc=(R.hint/CHUNK)|0;
  for(let k=-1;k<R.nc;k++){
    const c=k<0?hc:k;if(k===hc)continue;
    if(k>=0){const ex=px<R.bx0[c]?R.bx0[c]-px:px>R.bx1[c]?px-R.bx1[c]:0,ey=py<R.by0[c]?R.by0[c]-py:py>R.by1[c]?py-R.by1[c]:0;
      if(ex*ex+ey*ey>=best)continue;}
    for(let i=c*CHUNK,e=Math.min(n,i+CHUNK);i<e;i++){
      const ux=px-x[i],uy=py-y[i],vx=dx[i],vy=dy[i],t=(ux*vx+uy*vy)/(vx*vx+vy*vy),tc=t<0?0:t>1?1:t,
        qx=ux-tc*vx,qy=uy-tc*vy,d2=qx*qx+qy*qy;
      if(d2<best){best=d2;bi=i;bt=t;}
    }
  }
  if(bi>=0)R.hint=bi;R.bi=bi;R.bt=bt;return Math.sqrt(best);
}
/* Distância "de offset" de um ponto a uma polilinha. No interior de uma aresta
   é a distância perpendicular. Na cunha de um vértice vale a maior distância
   às retas das duas arestas vizinhas (junta miter, com o limite do motor): as
   faces de um canto seguem planas até a aresta de encontro, em vez de virarem
   um cone em torno do vértice. Em R.zn fica a cota do ponto mais próximo e em
   R.dp a distância comum. */
function polyDist(R,px,py,list){
  const d=polyPlain(R,px,py,list),bi=R.bi,bt=R.bt,n=R.n;R.dp=d; // dp: distância comum
  if(bi<0){R.zn=NaN;R.act=-1;return Infinity;}
  R.zn=R.za[bi]+(R.zb[bi]-R.za[bi])*(bt<0?0:bt>1?1:bt);R.act=bi; // reta que define a distância
  if(bt>0&&bt<1)return d;
  let j=bt<=0?bi-1:bi+1;
  if(R.closed)j=(j+n)%n;else if(j<0||j>=n)return d; // ponta de borda aberta
  const pi=polyPerp(R,bi,px,py),pj=polyPerp(R,j,px,py),m=pi>=pj?pi:pj;
  if(pj>pi)R.act=j;
  if(d/MITER_LIMIT>m){R.act=-1;return d/MITER_LIMIT;}
  return m;
}
// Distância de um ponto à RETA de uma aresta.
function polyPerp(R,i,px,py){return Math.abs((px-R.x[i])*R.dy[i]-(py-R.y[i])*R.dx[i])/Math.hypot(R.dx[i],R.dy[i]);}
/* Arestas que podem ser a mais próxima de ALGUM ponto de um disco (centro e
   raio): as que distam do centro até a menor distância + 2 raios. Reduz a
   lista herdada do triângulo pai; o triângulo filho cabe no disco do pai. */
const SCRATCH={d:new Float64Array(64)};
function polyNarrow(R,list,mx,my,rad){
  const m=list?list.length:R.n;if(m<=1)return list;
  if(SCRATCH.d.length<m)SCRATCH.d=new Float64Array(m*2);
  const d=SCRATCH.d,x=R.x,y=R.y,dx=R.dx,dy=R.dy;let dmin=Infinity;
  for(let k=0;k<m;k++){const i=list?list[k]:k,ux=mx-x[i],uy=my-y[i],vx=dx[i],vy=dy[i];
    let t=(ux*vx+uy*vy)/(vx*vx+vy*vy);t=t<0?0:t>1?1:t;const qx=ux-t*vx,qy=uy-t*vy,v=Math.sqrt(qx*qx+qy*qy);d[k]=v;if(v<dmin)dmin=v;}
  const lim=dmin+2*rad+1e-9;let cnt=0;for(let k=0;k<m;k++)if(d[k]<=lim)cnt++;
  if(cnt===m)return list;
  const out=new Int32Array(cnt);for(let k=0,q=0;k<m;k++)if(d[k]<=lim)out[q++]=list?list[k]:k;
  return out;
}
function inRing(P,px,py){
  let ins=false;
  for(let i=0,j=P.length-1;i<P.length;j=i++){const a=P[i],b=P[j];
    if((a[1]>py)!==(b[1]>py)&&px<(b[0]-a[0])*(py-a[1])/(b[1]-a[1])+a[0])ins=!ins;}
  return ins;
}
/* Rampas na ordem de viagem: bordas de fora (b1) e de dentro (b2), pareadas e
   com cota. Dois trechos consecutivos na mesma cota ganham o patamar que os
   liga (a mesma "ponte" do motor): as bordas do trecho seguinte são
   estendidas até o fim do anterior. A pista é a sequência de quadriláteros
   entre seções consecutivas; cada seção é uma linha de nível. Retornos em
   patamar não entram na superfície das faces. */
function prepRamps(list){
  const out=[];let prev=null;
  const ok=P=>Array.isArray(P)&&P.length>=2&&P.every(p=>Array.isArray(p)&&p.length>=3&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])&&Number.isFinite(+p[2]));
  for(const r of list||[]){
    if(r?.flat)continue; // retorno em patamar: não entra nem interrompe a sequência dos trechos
    if(!ok(r?.b1)||!ok(r?.b2)||r.b1.length!==r.b2.length){prev=null;continue;}
    const b1=r.b1.map(p=>[+p[0],+p[1],+p[2]]),b2=r.b2.map(p=>[+p[0],+p[1],+p[2]]);let e1=b1,e2=b2;
    if(prev){
      const a1=prev.b1.at(-1),a2=prev.b2.at(-1),w=Math.hypot(b1[0][0]-b2[0][0],b1[0][1]-b2[0][1]),
        gap=Math.hypot((a1[0]+a2[0]-b1[0][0]-b2[0][0])/2,(a1[1]+a2[1]-b1[0][1]-b2[0][1])/2);
      if(Math.abs(a1[2]-b1[0][2])<=1e-6*Math.max(1,Math.abs(a1[2]))&&gap<=6*w+20){
        e1=[[a1[0],a1[1],b1[0][2]]].concat(b1);e2=[[a2[0],a2[1],b2[0][2]]].concat(b2);}
    }
    prev={b1,b2};
    const m=e1.length-1,nc=Math.ceil(m/CHUNK),qx0=new Float64Array(nc).fill(Infinity),qy0=new Float64Array(nc).fill(Infinity),
      qx1=new Float64Array(nc).fill(-Infinity),qy1=new Float64Array(nc).fill(-Infinity);
    let zlo=Infinity,zhi=-Infinity,width=Infinity;
    for(let i=0;i<=m;i++){const c=Math.min(nc-1,(i/CHUNK)|0);
      for(const cc of i%CHUNK===0&&i>0&&i<m?[c-1,c]:[c])for(const p of [e1[i],e2[i]]){
        qx0[cc]=Math.min(qx0[cc],p[0]);qx1[cc]=Math.max(qx1[cc],p[0]);qy0[cc]=Math.min(qy0[cc],p[1]);qy1[cc]=Math.max(qy1[cc],p[1]);}
      zlo=Math.min(zlo,e1[i][2],e2[i][2]);zhi=Math.max(zhi,e1[i][2],e2[i][2]);
      const w=Math.hypot(e1[i][0]-e2[i][0],e1[i][1]-e2[i][1]);if(w>1e-6)width=Math.min(width,w);}
    // contorno da pista: borda de fora, borda de dentro e as duas tampas
    out.push({e1,e2,m,nc,qx0,qy0,qx1,qy1,zlo,zhi,width,E1:polyData(e1,false),E2:polyData(e2,false),
      C0:polyData([e1[0],e2[0]],false),C1:polyData([e1[m],e2[m]],false),z0:(e1[0][2]+e2[0][2])/2,z1:(e1[m][2]+e2[m][2])/2});
  }
  return out;
}
// Cota da pista no ponto, ou NaN fora dela.
function rampZ(r,px,py){
  const e1=r.e1,e2=r.e2;
  for(let c=0;c<r.nc;c++){
    if(px<r.qx0[c]||px>r.qx1[c]||py<r.qy0[c]||py>r.qy1[c])continue;
    for(let i=c*CHUNK,e=Math.min(r.m,i+CHUNK);i<e;i++){
      const a=e1[i],b=e1[i+1],d=e2[i],f=e2[i+1];let ins=false;
      // quadrilátero a → b → f → d
      if((a[1]>py)!==(b[1]>py)&&px<(b[0]-a[0])*(py-a[1])/(b[1]-a[1])+a[0])ins=!ins;
      if((b[1]>py)!==(f[1]>py)&&px<(f[0]-b[0])*(py-b[1])/(f[1]-b[1])+b[0])ins=!ins;
      if((f[1]>py)!==(d[1]>py)&&px<(d[0]-f[0])*(py-f[1])/(d[1]-f[1])+f[0])ins=!ins;
      if((d[1]>py)!==(a[1]>py)&&px<(a[0]-d[0])*(py-d[1])/(a[1]-d[1])+d[0])ins=!ins;
      if(!ins)continue;
      // distância a cada seção (linha de nível); seção degenerada vale como ponto
      const sec=(u,v)=>{const ex=v[0]-u[0],ey=v[1]-u[1],l=Math.hypot(ex,ey);
        return l>1e-9?Math.abs((px-u[0])*ey-(py-u[1])*ex)/l:Math.hypot(px-u[0],py-u[1]);},
        d0=sec(a,d),d1=sec(b,f),z0=(a[2]+d[2])/2,z1=(b[2]+f[2])/2;
      return d0+d1>1e-12?(z0*d1+z1*d0)/(d0+d1):z0;
    }
  }
  return NaN;
}
/* Superfície de projeto entre dois anéis consecutivos (A por fora, B por
   dentro). A cota de um ponto é a razão das distâncias aos dois anéis — a
   regra que o motor da Cava 2 usa na seção (cotaEm) — e não depende de como os
   anéis foram digitalizados nem do seu comprimento. Rampa: dentro da pista
   vale o greide dela; ao lado, o talude liga o anel de fora à borda de fora,
   ou a borda de dentro ao anel de dentro, e conserva o ângulo da face. */
function bandSurface(A,B,zA,zB,ramps){
  const RA=polyData(A,true),RB=polyData(B,true),dz=zB-zA,lo=Math.min(zA,zB),hi=Math.max(zA,zB),widths=[];
  for(const p of B)widths.push(polyPlain(RA,p[0],p[1]));for(const p of A)widths.push(polyPlain(RB,p[0],p[1]));
  widths.sort((a,b)=>a-b);
  const wmin=widths[0],wmed=widths[widths.length>>1],wmax=widths.at(-1),e=1e-6*Math.max(1,Math.abs(dz)),near=[];
  let zlo=lo,zhi=hi,wr=Infinity;
  /* Rampas que interessam à faixa. Num talude, só a da própria bancada (cotas
     entre as dos dois anéis). Numa berma, só o trecho que chega ou parte na
     cota dela e que de fato corre por cima dela com outra cota — o começo de
     um trecho que ainda sobe sobre a berma. Rampas de outras bancadas não
     mexem na faixa, mesmo que os polígonos se sobreponham num topo espremido. */
  const flat=!(Math.abs(dz)>1e-9),ez=1e-6*Math.max(1,Math.abs(zA));
  const invade=r=>{ // amostra as duas bordas (a cada ~1 m, no máximo 16 pontos por trecho)
    for(const P of [r.e1,r.e2])for(let i=0;i<P.length-1;i++){
      const a=P[i],b=P[i+1],n=Math.max(1,Math.min(16,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1]))));
      for(let k=0;k<=n;k++){const t=k/n,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,z=a[2]+(b[2]-a[2])*t;
        if(Math.abs(z-zA)<=1e-3)continue;
        if(inRing(A,x,y)&&!inRing(B,x,y)&&polyPlain(RA,x,y)>1e-6&&polyPlain(RB,x,y)>1e-6)return true;}
    }
    return false;
  };
  for(const r of ramps||[]){
    if(flat?!((Math.abs(r.z0-zA)<=ez||Math.abs(r.z1-zA)<=ez)&&invade(r)):!(r.zhi>lo+e&&r.zlo<hi-e))continue;
    near.push(r);zlo=Math.min(zlo,r.zlo);zhi=Math.max(zhi,r.zhi);wr=Math.min(wr,r.width);
  }
  if(!near.length&&!(Math.abs(dz)>1e-9))return null; // berma sem rampa: cota única, não precisa de função
  const hd=Math.min(1,Math.max(.25,wmed/6)),check=Math.max(hd,wmed/3),checkR=Math.max(hd,Math.min(check,wr/2)),
    slope=wmin>1e-6?MITER_LIMIT*Math.abs(dz)/wmin:Infinity;
  // junto de rampa? (caixas dos trechos da pista, alargadas pela largura da faixa, com folga)
  const reach=wmax*1.25+1e-6,nearRamp=(x0,y0,x1,y1)=>{
    for(const r of near)for(let c=0;c<r.nc;c++)
      if(x1>=r.qx0[c]-reach&&x0<=r.qx1[c]+reach&&y1>=r.qy0[c]-reach&&y0<=r.qy1[c]+reach)return true;
    return false;
  };
  // cand: o que interessa a um triângulo — arestas candidatas de cada anel
  // (A, B) e se ele está junto de rampa (nr)
  const z=(px,py,cand)=>{
    // A pista vem primeiro, inclusive em cima de um anel que ela atravesse:
    // as duas faixas vizinhas veem ali a mesma cota.
    const nr=near.length>0&&(cand?cand.nr:nearRamp(px,py,px,py));
    if(nr)for(const r of near){const zr=rampZ(r,px,py);if(zr===zr)return zr;}
    const dA=polyDist(RA,px,py,cand?cand.A:null),pA=RA.dp,dB=polyDist(RB,px,py,cand?cand.B:null),pB=RB.dp;
    if(!(dA>1e-9))return zA;if(!(dB>1e-9))return zB;
    if(nr){
      /* Fora da pista, o trecho do contorno dela mais próximo do ponto diz
         o papel da pista ali. Borda de fora (e tampa na cota do anel de
         dentro): a pista é o limite ALTO do talude que sobe do anel de fora.
         Borda de dentro (e tampa na cota do anel de fora): a pista é o limite
         BAIXO do talude que vai até o anel de dentro. O anel correspondente
         continua valendo onde está mais perto que a pista; na vizinhança da
         igualdade (±20%) os dois limites são misturados, para a superfície não
         ganhar um degrau onde um anel passa sob a pista com outra cota. Lado e
         precedência usam a distância comum (a de offset encurta muito além
         de um canto fechado da borda); a cota usa a de offset. */
      let d=0,pd=Infinity,zc=0,high=true,f=0;
      for(const r of near){ // com mais de uma rampa, vale a de contorno aplicável mais próximo
        const d1=polyDist(r.E1,px,py),p1=r.E1.dp,d2=polyDist(r.E2,px,py),p2=r.E2.dp,
          q0=r.C0.n?polyPlain(r.C0,px,py):Infinity,q1=r.C1.n?polyPlain(r.C1,px,py):Infinity,m=Math.min(p1,p2,q0,q1);
        if(!(m<pd))continue;
        let dd,zz,hh;
        if(m===p1){dd=d1;zz=r.E1.zn;hh=true;}
        else if(m===p2){dd=d2;zz=r.E2.zn;hh=false;}
        else if(m===q0){dd=q0;zz=r.z0;hh=Math.abs(zz-zB)<Math.abs(zz-zA);}
        else{dd=q1;zz=r.z1;hh=Math.abs(zz-zB)<Math.abs(zz-zA);}
        const ratio=m/(hh?pB:pA);
        if(ratio<1+BLEND){pd=m;d=dd;zc=zz;high=hh;f=ratio<=1-BLEND?0:(ratio-(1-BLEND))/(2*BLEND);}
      }
      if(pd<Infinity){
        if(high){const zh=zc+(zB-zc)*f,dh=d+(dB-d)*f;return zA+(zh-zA)*dA/(dA+dh);}
        const zl=zc+(zA-zc)*f,dl=d+(dA-d)*f;return zl+(zB-zl)*dl/(dl+dB);
      }
    }
    return zA+dz*dA/(dA+dB);
  };
  const tolLin=Math.max(1e-3,Math.abs(dz)*5e-4),tolD=1e-7*Math.max(1,wmax),
    box=(a,b,c)=>nearRamp(Math.min(a[0],b[0],c[0]),Math.min(a[1],b[1],c[1]),Math.max(a[0],b[0],c[0]),Math.max(a[1],b[1],c[1])),
    // a função coincide com o plano do triângulo numa grade de pontos (n divisões por lado)?
    planar=(a,b,c,n,cand)=>{
      for(let i=0;i<=n;i++)for(let j=0;j<=n-i;j++){
        const k=n-i-j;if(i===n||j===n||k===n)continue;const u=i/n,v=j/n,w=k/n;
        if(Math.abs(z(a[0]*u+b[0]*v+c[0]*w,a[1]*u+b[1]*v+c[1]*w,cand)-(a[2]*u+b[2]*v+c[2]*w))>tolLin)return false;}
      return n%3===0||Math.abs(z((a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,cand)-(a[2]+b[2]+c[2])/3)<=tolLin;
    },
    // só a aresta i e as suas vizinhas podem ser as mais próximas?
    local=(R,list,i)=>{if(!list||list.length>3)return false;
      for(let k=0;k<list.length;k++){const d=Math.abs(list[k]-i);if(d>1&&d!==R.n-1)return false;}return true;},
    /* Face plana sem amostrar: nos três vértices (e no baricentro) a distância
       a cada anel é a distância à MESMA reta, as duas retas são paralelas e só
       arestas vizinhas concorrem. A região onde uma reta manda é convexa
       (fica entre as bissetrizes dos seus dois cantos), logo o triângulo
       inteiro está nela e a cota é linear. */
    facet=(a,b,c,cand)=>{
      if(!cand||cand.nr)return false;
      const mx=(a[0]+b[0]+c[0])/3,my=(a[1]+b[1]+c[1])/3;
      polyDist(RA,mx,my,cand.A);const i=RA.act;polyDist(RB,mx,my,cand.B);const j=RB.act;
      if(i<0||j<0||!local(RA,cand.A,i)||!local(RB,cand.B,j))return false;
      if(Math.abs(RA.dx[i]*RB.dy[j]-RA.dy[i]*RB.dx[j])>1e-9*Math.hypot(RA.dx[i],RA.dy[i])*Math.hypot(RB.dx[j],RB.dy[j]))return false;
      for(const p of [a,b,c])if(Math.abs(polyDist(RA,p[0],p[1],cand.A)-polyPerp(RA,i,p[0],p[1]))>tolD||
        Math.abs(polyDist(RB,p[0],p[1],cand.B)-polyPerp(RB,j,p[0],p[1]))>tolD)return false;
      return true;
    };
  return {z,lo:zlo,hi:zhi,hd,
    // arestas dos dois anéis que interessam a um triângulo (herdadas do pai)
    narrow:(cand,a,b,c)=>{
      const mx=(a[0]+b[0]+c[0])/3,my=(a[1]+b[1]+c[1])/3,
        rad=Math.sqrt(Math.max((a[0]-mx)**2+(a[1]-my)**2,(b[0]-mx)**2+(b[1]-my)**2,(c[0]-mx)**2+(c[1]-my)**2));
      const nr=near.length>0&&(!cand||cand.nr)&&box(a,b,c);
      if(rad>4*wmax&&!(cand&&(cand.A||cand.B)))return {A:null,B:null,nr}; // muito maior que a faixa: a lista não encurtaria
      return {A:polyNarrow(RA,cand?cand.A:null,mx,my,rad),B:polyNarrow(RB,cand?cand.B:null,mx,my,rad),nr};
    },
    // margem para os limites de cota de um triângulo: longe de rampa a função
    // tem inclinação limitada; junto de rampa vale a faixa inteira
    margin:(L,cand)=>cand.nr?Infinity:slope*L,
    // triângulo que já pode ser tratado como plano: pequeno, face plana
    // reconhecida pelas retas, ou conferido numa grade tanto mais fina quanto
    // maior ele for (junto de rampa, mais fina)
    flatEnough:(a,b,c,L,cand)=>{
      if(L<=hd||facet(a,b,c,cand))return true;
      const n=2*Math.ceil(L/(cand.nr?checkR:check));
      return n<=12&&planar(a,b,c,n,cand);
    }};
}
/* Triângulos que cobrem exatamente a região entre dois anéis aninhados. A
   malha serve só de suporte: a cota vem de bandSurface. Devolve null se os
   anéis não estiverem aninhados ou se a triangulação não fechar a área. */
function bandFaces(A,B){
  const T=root.THREE;if(!T?.ShapeUtils?.triangulateShape||!T.Vector2)return null;
  // origem local: com coordenadas UTM as áreas perderiam a precisão do teste
  const ox=A[0][0],oy=A[0][1],
    area=r=>{let s=0;for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length];s+=(p[0]-ox)*(q[1]-oy)-(q[0]-ox)*(p[1]-oy);}return Math.abs(s)/2;},
    aA=area(A),aB=area(B);
  if(!(aA>aB)||!(aB>0))return null;
  // o anel de dentro tem de estar inteiro dentro do de fora (encostar pode)
  const RA=polyData(A,true),folga=1e-7*Math.max(1,Math.sqrt(aA));
  for(const p of B)if(!inRing(A,p[0],p[1])&&polyPlain(RA,p[0],p[1])>folga)return null;
  let faces;const C=A.map(p=>new T.Vector2(p[0]-ox,p[1]-oy)),H=B.map(p=>new T.Vector2(p[0]-ox,p[1]-oy));
  try{faces=T.ShapeUtils.triangulateShape(C,[H]);}catch(e){return null;}
  if(C.length!==A.length||H.length!==B.length||!faces?.length)return null;
  const P=C.concat(H),out=[];let sum=0;
  for(const f of faces){const a=P[f[0]],b=P[f[1]],c=P[f[2]];if(!a||!b||!c)return null;
    sum+=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2;out.push([f[0],f[1],f[2]]);}
  if(Math.abs(sum-(aA-aB))>1e-6*aA+1e-9)return null;
  return out;
}
function intersect(input,g,options={}){
  if(!g||(!input?.length&&!options.triangles?.length))return [];
  const sample=options.sample||root.sampleZbil;
  if(typeof sample!=='function')throw new Error('Amostrador do MDT indisponível.');
  const cell=Math.max(.001,Math.min(Math.abs(g.cs)||1,Math.abs(g.csy||g.cs)||1)),
    step=cell*.75,tol=Math.max(1e-6,cell*1e-5),epsZ=1e-7,segments=[];
  const clean=ring=>{const q=(ring||[]).map(p=>[+p[0],+p[1]]).filter(p=>p.every(Number.isFinite));
    if(q.length>2&&Math.hypot(q[0][0]-q.at(-1)[0],q[0][1]-q.at(-1)[1])<tol)q.pop();return q;};
  const prep=ring=>{const cum=[0];for(let i=1;i<=ring.length;i++){
    const a=ring[i-1],b=ring[i%ring.length];cum.push(cum.at(-1)+Math.hypot(b[0]-a[0],b[1]-a[1]));}
    const per=cum.at(-1)||1;return {ring,cum:cum.map(v=>v/per)};};
  const at=(p,u)=>{u=((u%1)+1)%1;let lo=0,hi=p.ring.length-1;
    while(lo<hi){const m=(lo+hi)>>1;if(p.cum[m+1]<u-1e-12)lo=m+1;else hi=m;}
    const a=p.ring[lo],b=p.ring[(lo+1)%p.ring.length],du=p.cum[lo+1]-p.cum[lo],t=du>1e-12?(u-p.cum[lo])/du:0;
    return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];};
  // A fase e o sentido não fazem parte da geometria. Alinhá-los impede
  // torcer a faixa quando uma linha foi digitalizada no sentido contrário.
  const align=(ref,raw)=>{const A=prep(ref);let best=null;
    for(const rev of [false,true]){const r=rev?raw.slice().reverse():raw;
      for(let k=0;k<r.length;k++){const ring=r.slice(k).concat(r.slice(0,k)),B=prep(ring);let cost=0;
        for(let j=0;j<48;j++){const a=at(A,j/48),b=at(B,j/48);cost+=(a[0]-b[0])**2+(a[1]-b[1])**2;}
        if(!best||cost<best.cost)best={ring,cost};}}
    return best.ring;};
  const rings=[];
  for(const q of input){const ring=clean(q.ring);if(ring.length<3||!Number.isFinite(+q.z))continue;rings.push({ring,z:+q.z});}
  if(rings.length<2&&!options.triangles?.length)return [];
  const emit=typeof options.onPolygon==='function'?options.onPolygon:null,
    keep=p=>options.keepAbove?p[3]>=-epsZ:p[3]<=epsZ;
  // Numa faixa com superfície por função (surf) a cota de um ponto novo vem
  // dela; nos demais casos é a interpolação linear da aresta.
  const vertex=(x,y,z)=>[x,y,z,z-sample(g,x,y)],
    mid=(a,b,surf,cand)=>{const x=(a[0]+b[0])/2,y=(a[1]+b[1])/2;return vertex(x,y,surf?surf.z(x,y,cand):(a[2]+b[2])/2);};
  const cross=(a,b,surf,cand)=>{
    if(!Number.isFinite(a[3])||!Number.isFinite(b[3]))return null;
    if(Math.abs(a[3])<=epsZ)return a.slice(0,3);if(Math.abs(b[3])<=epsZ)return b.slice(0,3);
    if(a[3]*b[3]>=0)return null;
    let lo=a,hi=b;
    for(let k=0;k<40;k++){const m=mid(lo,hi,surf,cand);if(!Number.isFinite(m[3]))return null;
      if(Math.abs(m[3])<=epsZ||Math.hypot(lo[0]-hi[0],lo[1]-hi[1])<tol*.05)return m.slice(0,3);
      if((m[3]<0)===(lo[3]<0))lo=m;else hi=m;}
    return mid(lo,hi,surf,cand).slice(0,3);
  };
  // Limites conservadores do terreno sob um triângulo: pula apenas triângulos
  // inteiramente acima/abaixo de TODAS as cotas da sua caixa. Isso mantém
  // depressões internas e reduz o custo durante o arraste das bermas. Caixa
  // de poucas células: cotas das próprias células; caixa grande: blocos.
  const tiles=new Map(),tileSize=16,grid=ArrayBuffer.isView(g.z)||Array.isArray(g.z)&&!Array.isArray(g.z[0]);
  const range=(a,b,c)=>{
    if(!grid||g.tin||options.sample)return null;
    const x0=Math.min(a[0],b[0],c[0]),x1=Math.max(a[0],b[0],c[0]),y0=Math.min(a[1],b[1],c[1]),y1=Math.max(a[1],b[1],c[1]);
    const sy=Math.abs(g.csy||g.cs),fc0=(x0-g.xll)/g.cs-.5,fc1=(x1-g.xll)/g.cs-.5,
      fr0=g.nr-.5-(y1-g.yll)/sy,fr1=g.nr-.5-(y0-g.yll)/sy,
      c0=Math.max(0,Math.floor(fc0)),c1=Math.min(g.nc-1,Math.ceil(fc1)),
      r0=Math.max(0,Math.floor(fr0)),r1=Math.min(g.nr-1,Math.ceil(fr1));
    if(c0>c1||r0>r1)return [Infinity,-Infinity,false];let min=Infinity,max=-Infinity,
      valid=fc0>=0&&fc1<=g.nc-1&&fr0>=0&&fr1<=g.nr-1;
    if((c1-c0+1)*(r1-r0+1)<=36){
      for(let j=r0;j<=r1;j++)for(let i=c0;i<=c1;i++){
        const z=g.z[j*g.nc+i];if(Number.isFinite(z)){if(z<min)min=z;if(z>max)max=z;}else valid=false;}
      return [min,max,valid];
    }
    for(let r=Math.floor(r0/tileSize);r<=Math.floor(r1/tileSize);r++)for(let c=Math.floor(c0/tileSize);c<=Math.floor(c1/tileSize);c++){
      const key=r+','+c;let v=tiles.get(key);
      if(!v){v=[Infinity,-Infinity,true];for(let j=r*tileSize;j<Math.min(g.nr,(r+1)*tileSize);j++)for(let i=c*tileSize;i<Math.min(g.nc,(c+1)*tileSize);i++){
        const z=g.z[j*g.nc+i];if(Number.isFinite(z)){v[0]=Math.min(v[0],z);v[1]=Math.max(v[1],z);}else v[2]=false;}
        tiles.set(key,v);}
      min=Math.min(min,v[0]);max=Math.max(max,v[1]);valid=valid&&v[2];}
    return [min,max,valid];
  };
  let visited=0;
  // Face inteira do lado mantido, numa faixa com cota por função: só é
  // entregue em pedaços que já são planos.
  const emitSurf=(a,b,c,depth,part,surf,cand,ready)=>{
    const ab=Math.hypot(a[0]-b[0],a[1]-b[1]),bc=Math.hypot(b[0]-c[0],b[1]-c[1]),ca=Math.hypot(c[0]-a[0],c[1]-a[1]);
    if(!ready)cand=surf.narrow(cand,a,b,c);
    if(depth>=48||surf.flatEnough(a,b,c,Math.max(ab,bc,ca),cand)){emit([a,b,c].map(p=>p.slice(0,3)),part);return;}
    const pt=(p,q)=>{const x=(p[0]+q[0])/2,y=(p[1]+q[1])/2;return [x,y,surf.z(x,y,cand)];};
    if(ab>=bc&&ab>=ca){const m=pt(a,b);emitSurf(a,m,c,depth+1,part,surf,cand);emitSurf(m,b,c,depth+1,part,surf,cand);}
    else if(bc>=ca){const m=pt(b,c);emitSurf(a,b,m,depth+1,part,surf,cand);emitSurf(a,m,c,depth+1,part,surf,cand);}
    else{const m=pt(c,a);emitSurf(a,b,m,depth+1,part,surf,cand);emitSurf(m,b,c,depth+1,part,surf,cand);}
  };
  const triangle=(a,b,c,depth=0,part='surface',surf=null,cand=null)=>{
    visited++;
    const ab=Math.hypot(a[0]-b[0],a[1]-b[1]),bc=Math.hypot(b[0]-c[0],b[1]-c[1]),ca=Math.hypot(c[0]-a[0],c[1]-a[1]),
      L=Math.max(ab,bc,ca),r=range(a,b,c);
    if(r&&r[0]===Infinity)return;
    if(surf)cand=surf.narrow(cand,a,b,c);
    if(r){
      let zmin=Math.min(a[2],b[2],c[2]),zmax=Math.max(a[2],b[2],c[2]);
      if(surf){const m=surf.margin(L,cand);zmin=Math.max(surf.lo,zmin-m);zmax=Math.min(surf.hi,zmax+m);}
      const below=zmax<r[0]-epsZ,above=zmin>r[1]+epsZ;
      if(below||above){
        if(!emit)return;
        if(options.keepAbove?below:above)return;
        if(r[2]){if(surf)emitSurf(a,b,c,depth,part,surf,cand,true);else emit([a,b,c].map(p=>p.slice(0,3)),part);return;}
      }
    }
    if((L>step||surf&&!surf.flatEnough(a,b,c,L,cand))&&depth<48){
      if(ab>=bc&&ab>=ca){const m=mid(a,b,surf,cand);triangle(a,m,c,depth+1,part,surf,cand);triangle(m,b,c,depth+1,part,surf,cand);}
      else if(bc>=ca){const m=mid(b,c,surf,cand);triangle(a,b,m,depth+1,part,surf,cand);triangle(a,m,c,depth+1,part,surf,cand);}
      else{const m=mid(c,a,surf,cand);triangle(a,b,m,depth+1,part,surf,cand);triangle(m,b,c,depth+1,part,surf,cand);}return;
    }
    // Não cruza vazios do MDT nem cria uma borda falsa na fronteira NoData.
    if(![a,b,c].every(p=>Number.isFinite(p[3])))return;
    if(emit){
      const p=[a,b,c],clipped=[];
      for(let i=0;i<3;i++){const u=p[i],v=p[(i+1)%3],iu=keep(u),iv=keep(v);
        if(iu)clipped.push(u.slice(0,3));if(iu!==iv){const q=cross(u,v,surf,cand);if(q)clipped.push(q);}}
      if(clipped.length>=3)emit(clipped,part);
    }
    if([a,b,c].every(p=>Math.abs(p[3])<=epsZ))return; // superfícies coincidentes não definem uma linha única
    const points=[];
    for(const p of [cross(a,b,surf,cand),cross(b,c,surf,cand),cross(c,a,surf,cand)])if(p&&!points.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<=tol))points.push(p);
    if(points.length===2&&Math.hypot(points[0][0]-points[1][0],points[0][1]-points[1][1])>tol)segments.push(points);
  };
  /* Faixa entre anéis consecutivos. A malha cobre exatamente a região entre os
     dois anéis e a cota vem da função da faixa: a correspondência por
     comprimento de arco torcia a faixa junto de cantos e dos degraus da rampa
     e criava dentes falsos na linha de contato. Sem triangulação disponível
     ou com anéis não aninhados, vale a faixa antiga por comprimento de arco. */
  const ramps=prepRamps(options.ramps);let bands=0,strips=0;
  for(let k=0;k<rings.length-1;k++){
    const A=rings[k],B=rings[k+1],faces=options.strips?null:bandFaces(A.ring,B.ring);
    if(faces){
      bands++;
      const surf=Math.abs(A.z-B.z)>1e-9||ramps.length?bandSurface(A.ring,B.ring,A.z,B.z,ramps):null,nA=A.ring.length,
        P=A.ring.concat(B.ring),V=P.map((p,i)=>vertex(p[0],p[1],surf?surf.z(p[0],p[1]):i<nA?A.z:B.z));
      for(const f of faces)triangle(V[f[0]],V[f[1]],V[f[2]],0,'surface',surf);
      continue;
    }
    strips++;
    const PA=prep(A.ring),PB=prep(align(A.ring,B.ring)),us=[...new Set(PA.cum.concat(PB.cum).map(v=>+v.toFixed(12)))].sort((a,b)=>a-b);
    for(let i=1;i<us.length;i++){
      const a0=at(PA,us[i-1]),a1=at(PA,us[i]),b0=at(PB,us[i-1]),b1=at(PB,us[i]),
        va=vertex(...a0,A.z),vb=vertex(...a1,A.z),vc=vertex(...b0,B.z),vd=vertex(...b1,B.z);
      triangle(va,vc,vd);triangle(va,vd,vb);
    }
  }
  // Piso/topo faz parte da superfície. A triangulação respeita concavidades.
  const inner=rings.at(-1);
  if(inner&&options.floor!==false&&root.THREE?.ShapeUtils){
    const p=inner.ring,faces=root.THREE.ShapeUtils.triangulateShape(p.map(q=>new root.THREE.Vector2(q[0],q[1])),[]);
    for(const face of faces)triangle(...face.map(i=>vertex(...p[i],inner.z)),0,'floor');
  }
  for(const face of options.triangles||[])triangle(...face.map(p=>vertex(...p)),0,'detail');
  const bins=new Map(),nodes=[],edges=[],seen=new Set();
  const node=p=>{const ix=Math.floor(p[0]/tol),iy=Math.floor(p[1]/tol);
    for(let x=ix-1;x<=ix+1;x++)for(let y=iy-1;y<=iy+1;y++)for(const n of bins.get(x+','+y)||[])
      if(Math.hypot(n.p[0]-p[0],n.p[1]-p[1])<=tol&&Math.abs(n.p[2]-p[2])<=tol*10)return n;
    const n={id:nodes.length,p,e:[]},key=ix+','+iy;nodes.push(n);if(!bins.has(key))bins.set(key,[]);bins.get(key).push(n);return n;};
  for(const s of segments){const a=node(s[0]),b=node(s[1]);if(a===b)continue;
    const key=Math.min(a.id,b.id)+','+Math.max(a.id,b.id);if(seen.has(key))continue;seen.add(key);
    const e={a,b,used:false};edges.push(e);a.e.push(e);b.e.push(e);}
  const out=[],trace=start=>{const p=[start.p];let cur=start,guard=edges.length+1;
    while(guard-->0){const e=cur.e.find(e=>!e.used);if(!e)break;e.used=true;cur=e.a===cur?e.b:e.a;p.push(cur.p);if(cur===start||cur.e.length!==2)break;}
    if(p.length>1)out.push({geom:p.map(q=>q.slice(0,2)),zg:p.map(q=>q[2]),_metodo:'malha-adaptativa-x-mdt',_cell:cell});};
  for(const n of nodes)if(n.e.length!==2)while(n.e.some(e=>!e.used))trace(n);
  for(const e of edges)if(!e.used)trace(e.a);
  if(options.stats)Object.assign(options.stats,{visited,segments:segments.length,components:out.length,cell,tiles:tiles.size,bands,strips});
  return out;
}
function clipPolygon(points,g,options={}){
  if(!root.THREE?.ShapeUtils)throw new Error('Triangulação da cava indisponível.');
  const p=(points||[]).map(q=>q.slice(0,3));
  if(p.length>3&&Math.hypot(p[0][0]-p.at(-1)[0],p[0][1]-p.at(-1)[1])<1e-7)p.pop();
  if(p.length<3||p.some(q=>!q.every(Number.isFinite)))return [];
  const faces=root.THREE.ShapeUtils.triangulateShape(p.map(q=>new root.THREE.Vector2(q[0],q[1])),[]),out=[];
  intersect([],g,{...options,triangles:faces.map(f=>f.map(i=>p[i])),onPolygon:q=>out.push(q)});return out;
}
// Dissolve apenas as divisões internas da tesselação. Os nós da borda
// conservam Z da superfície; não se usa o MDT para inventar cotas do projeto.
function mergePolygons(polygons,g){
  if(!polygons?.length)return [];
  if(!root.ClipperLib?.Clipper)throw new Error('União das faces da cava indisponível.');
  const origin=polygons[0][0],tol=Math.max(1e-6,Math.min(Math.abs(g.cs)||1,Math.abs(g.csy||g.cs)||1)*1e-4),zs=new Map();
  const key=(x,y)=>Math.round(x)+','+Math.round(y);
  const paths=[];
  for(const p of polygons){
    const ring=[];
    for(const q of p){const x=Math.round((q[0]-origin[0])/tol),y=Math.round((q[1]-origin[1])/tol),k=key(x,y);
      if(!ring.length||key(...ring.at(-1))!==k)ring.push([x,y]);if(!zs.has(k))zs.set(k,q[2]);}
    if(ring.length<3)continue;
    if(key(...ring[0])!==key(...ring.at(-1)))ring.push(ring[0]);
    if(Math.abs(ring.reduce((a,p,i)=>{const q=ring[(i+1)%ring.length];return a+p[0]*q[1]-p[1]*q[0];},0))<1)continue;
    const path=ring.slice(0,-1).map(([X,Y])=>({X,Y}));
    if(!root.ClipperLib.Clipper.Orientation(path))path.reverse();paths.push(path);
  }
  if(!paths.length)return [];
  const unite=items=>{
    const clipper=new root.ClipperLib.Clipper(),result=[];
    clipper.StrictlySimple=true;clipper.AddPaths(items,root.ClipperLib.PolyType.ptSubject,true);
    if(!clipper.Execute(root.ClipperLib.ClipType.ctUnion,result,root.ClipperLib.PolyFillType.pftNonZero,root.ClipperLib.PolyFillType.pftNonZero))
      throw new Error('Não foi possível unir as faces do recorte.');
    return result;
  };
  // Uniões locais retiram as arestas compartilhadas antes da união geral.
  // Os anéis resultantes mantêm a orientação dos vazios (NonZero).
  const spatialUnion=items=>{
    if(items.length<=256)return unite(items.map(item=>item.path));
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
    for(const item of items){minX=Math.min(minX,item.x);maxX=Math.max(maxX,item.x);minY=Math.min(minY,item.y);maxY=Math.max(maxY,item.y);}
    const axis=maxX-minX>=maxY-minY?'x':'y';items.sort((a,b)=>a[axis]-b[axis]);
    const mid=items.length>>1;
    return unite([...spatialUnion(items.slice(0,mid)),...spatialUnion(items.slice(mid))]);
  };
  const solution=spatialUnion(paths.map(path=>({path,x:path.reduce((s,p)=>s+p.X,0)/path.length,y:path.reduce((s,p)=>s+p.Y,0)/path.length})))
    .map(ring=>root.ClipperLib.Clipper.CleanPolygon(ring,1)).filter(ring=>ring.length>=3);
  let index=null;
  const candidates=(X,Y)=>{
    if(!index){
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      for(const poly of polygons)for(const p of poly){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);}
      const cell=Math.max(tol*16,Math.sqrt((maxX-minX)*(maxY-minY)/polygons.length)*2),buckets=new Map(),large=[];
      for(const poly of polygons)for(let i=1;i<poly.length-1;i++){
        const a=poly[0],b=poly[i],c=poly[i+1],triangle=[a,b,c],pad=tol*8;
        const x0=Math.floor((Math.min(a[0],b[0],c[0])-minX-pad)/cell),x1=Math.floor((Math.max(a[0],b[0],c[0])-minX+pad)/cell),
          y0=Math.floor((Math.min(a[1],b[1],c[1])-minY-pad)/cell),y1=Math.floor((Math.max(a[1],b[1],c[1])-minY+pad)/cell);
        if((x1-x0+1)*(y1-y0+1)>64){large.push(triangle);continue;}
        for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const k=x+','+y,list=buckets.get(k)||[];list.push(triangle);buckets.set(k,list);}
      }
      index={minX,minY,cell,buckets,large};
    }
    return [...(index.buckets.get(Math.floor((X-index.minX)/index.cell)+','+Math.floor((Y-index.minY)/index.cell))||[]),...index.large];
  };
  const elevation=(x,y)=>{
    const exact=zs.get(key(x,y));if(Number.isFinite(exact))return exact;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const z=zs.get(key(x+dx,y+dy));if(Number.isFinite(z))return z;}
    const X=x*tol+origin[0],Y=y*tol+origin[1];
    let nearest=null,best=Infinity;
    for(const [a,b,c] of candidates(X,Y)){
      const bx=b[0]-a[0],by=b[1]-a[1],cx=c[0]-a[0],cy=c[1]-a[1],den=bx*cy-by*cx;
      if(Math.abs(den)<tol*tol)continue;
      const u=((X-a[0])*cy-(Y-a[1])*cx)/den,v=(bx*(Y-a[1])-by*(X-a[0]))/den;
      const z=a[2]+u*(b[2]-a[2])+v*(c[2]-a[2]);
      if(u>=-1e-9&&v>=-1e-9&&u+v<=1+1e-9)return z;
      // A união inteira pode deslocar a borda por poucos micrômetros.
      // Nesse limite, conserva-se o mesmo plano XYZ da face original.
      for(const [p,q] of [[a,b],[b,c],[c,a]]){
        const dx=q[0]-p[0],dy=q[1]-p[1],d2=dx*dx+dy*dy,t=d2?Math.max(0,Math.min(1,((X-p[0])*dx+(Y-p[1])*dy)/d2)):0,
          distance=(X-p[0]-t*dx)**2+(Y-p[1]-t*dy)**2;
        if(distance<best){best=distance;nearest=z;}
      }
    }
    if(best<=(tol*8)**2&&Number.isFinite(nearest))return nearest;
    throw new Error('Não foi possível conservar a cota de uma borda do recorte.');
  };
  return solution.filter(ring=>ring.length>=3).map(ring=>ring.map(({X:x,Y:y})=>[x*tol+origin[0],y*tol+origin[1],elevation(x,y)]));
}
/* Rasteriza as faces já recortadas. Fora delas fica NoData; a rampa
   substitui a face de talude no seu próprio domínio, mantendo seu greide. */
async function rasterize(parts,options={}){
  const cs=options.cellSize??.2;
  if(!(cs>0)||!Number.isFinite(cs))throw new Error('Resolução inválida para o MDT recortado.');
  const polygons=[...(parts?.surface||[]),...(parts?.floor||[]),...(parts?.ramps||[])];
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const p of polygons)for(const q of p){
    if(!q.slice(0,3).every(Number.isFinite))throw new Error('Face sem cota válida no recorte.');
    minX=Math.min(minX,q[0]);maxX=Math.max(maxX,q[0]);minY=Math.min(minY,q[1]);maxY=Math.max(maxY,q[1]);
  }
  if(!Number.isFinite(minX))throw new Error('Nenhuma face válida para gerar o MDT recortado.');
  const xll=Math.floor(minX/cs)*cs,yll=Math.floor(minY/cs)*cs,
    nc=Math.max(1,Math.ceil((maxX-xll)/cs)),nr=Math.max(1,Math.ceil((maxY-yll)/cs));
  let z;try{z=new Float32Array(nc*nr);z.fill(NaN);}catch(e){throw new Error('Memória insuficiente para o MDT de 0,20 m. A resolução foi preservada.');}
  const north=yll+nr*cs,check=()=>{if(options.isCurrent&&!options.isCurrent())
    throw Object.assign(new Error('Geração do MDT cancelada: o projeto mudou.'),{name:'AbortError'});};
  let tick=Date.now();
  for(let k=0;k<polygons.length;k++){
    check();const p=polygons[k];
    for(let i=1;i<p.length-1;i++){
      const a=p[0],b=p[i],c=p[i+1],bx=b[0]-a[0],by=b[1]-a[1],cx=c[0]-a[0],cy=c[1]-a[1],det=bx*cy-by*cx;
      if(Math.abs(det)<1e-12)continue;
      const c0=Math.max(0,Math.ceil((Math.min(a[0],b[0],c[0])-xll)/cs-.5-1e-7)),
        c1=Math.min(nc-1,Math.floor((Math.max(a[0],b[0],c[0])-xll)/cs-.5+1e-7)),
        r0=Math.max(0,Math.ceil((north-Math.max(a[1],b[1],c[1]))/cs-.5-1e-7)),
        r1=Math.min(nr-1,Math.floor((north-Math.min(a[1],b[1],c[1]))/cs-.5+1e-7));
      for(let row=r0;row<=r1;row++){
        const dy=north-(row+.5)*cs-a[1];
        for(let col=c0;col<=c1;col++){
          const dx=xll+(col+.5)*cs-a[0],u=(dx*cy-dy*cx)/det,v=(bx*dy-by*dx)/det;
          if(u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8)z[row*nc+col]=a[2]+u*(b[2]-a[2])+v*(c[2]-a[2]);
        }
        if(Date.now()-tick>24){options.onProgress?.(Math.round(100*k/polygons.length));await new Promise(r=>setTimeout(r,0));check();tick=Date.now();}
      }
    }
    if(Date.now()-tick>24){options.onProgress?.(Math.round(100*k/polygons.length));await new Promise(r=>setTimeout(r,0));tick=Date.now();}
  }
  // A célula do produto só existe onde há terreno e o projeto permanece do
  // lado correto do MDT. Não fecha pequenas ilhas NoData por interpolação.
  // Onde a pessoa apagou a linha de contato (máscara de heal), vale o projeto:
  // a célula fica mesmo do lado "errado" do MDT, sem somar volume negativo.
  let volume=0,validCells=0;const mask=options.mask||parts?.mask||null;
  if(options.terrain){
    const sample=options.sample||root.sampleZbil;
    for(let row=0;row<nr;row++){
      for(let col=0;col<nc;col++){
        const i=row*nc+col;if(!Number.isFinite(z[i]))continue;
        const x=xll+(col+.5)*cs,y=north-(row+.5)*cs,t=sample(options.terrain,x,y),eps=Math.max(1e-4,Math.abs(t)*1e-7),
          m=mask&&Number.isFinite(t)?mask.at(x,y):0;
        if(!Number.isFinite(t)||m<0||(!m&&(options.keepAbove?z[i]<t-eps:z[i]>t+eps)))z[i]=NaN;
        else{validCells++;volume+=Math.max(0,options.keepAbove?z[i]-t:t-z[i])*cs*cs;}
      }
      if(Date.now()-tick>24){await new Promise(r=>setTimeout(r,0));check();tick=Date.now();}
    }
  }
  check();options.onProgress?.(100);
  return {nc,nr,cs,csy:cs,xll,yll,z,crs:options.crs,srcCRS:options.crs,native:true,resampled:1,srcDims:[nc,nr],
    cutVolume:options.terrain?{volume,validCells,area:validCells*cs*cs,cellSize:cs,sourceCellSize:options.terrain.cs,
      method:'diferença projeto × MDT nos centros das células',kind:options.keepAbove?'pilha':'cava'}:null};
}
/* LINHA DE CONTATO APAGADA PELA PESSOA (22/11/2026 — "essas pequenas
   interseções, se eu apagá-las, o desenho bruto deve ser mantido"). Uma linha
   de contato separa uma região em que o projeto fica (lado mantido) de outra
   em que o MDT o corta. Apagar a linha desfaz essa separação: a região cortada
   volta a seguir o projeto. Para saber que região é essa — a linha pode ser um
   laço fechado ou um arco que termina na borda do projeto ou num vazio do MDT —
   o projeto é rasterizado numa grade fina e cada região conexa ganha um rótulo.

   faces(): 0 = fora do projeto ou sem terreno, 1 = mantido, 2 = cortado.
   "kept" são os polígonos que intersect() entrega em onPolygon; "rings", os
   anéis do projeto (a união deles é a área projetada). */
function faces(kept,rings,g,options={}){
  const sample=options.sample||root.sampleZbil,
    R=(rings||[]).map(r=>(r.ring||r).map(p=>[+p[0],+p[1]])).filter(r=>r.length>=3);
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const r of R)for(const p of r){if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1];}
  if(!(x1>x0)||!(y1>y0)||typeof sample!=='function')return null;
  const cell=Math.max(.001,Math.min(Math.abs(g.cs)||1,Math.abs(g.csy||g.cs)||1)),lim=options.maxCells||2e6;
  let h=options.cellSize||Math.min(1,Math.max(.25,cell/4));
  if((x1-x0)*(y1-y0)/(h*h)>lim)h=Math.sqrt((x1-x0)*(y1-y0)/lim);
  const ox=x0-3*h,oy=y0-3*h,nc=Math.ceil((x1-x0)/h)+6,nr=Math.ceil((y1-y0)/h)+6,st=new Uint8Array(nc*nr),xs=[];
  // área projetada: união dos anéis, por varredura (linha j fica em y = oy + (j + ½)·h)
  for(const r of R){
    let a0=Infinity,a1=-Infinity;for(const p of r){if(p[1]<a0)a0=p[1];if(p[1]>a1)a1=p[1];}
    for(let j=Math.max(0,Math.ceil((a0-oy)/h-.5)),je=Math.min(nr-1,Math.floor((a1-oy)/h-.5));j<=je;j++){
      const y=oy+(j+.5)*h;xs.length=0;
      for(let i=0,k=r.length-1;i<r.length;k=i++){const a=r[i],b=r[k];
        if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));}
      xs.sort((a,b)=>a-b);
      for(let q=0;q+1<xs.length;q+=2)
        for(let c=Math.max(0,Math.ceil((xs[q]-ox)/h-.5)),ce=Math.min(nc-1,Math.floor((xs[q+1]-ox)/h-.5));c<=ce;c++)st[j*nc+c]=2;
    }
  }
  // lado mantido: os polígonos do contato são convexos (triângulos recortados)
  for(const p of kept||[])for(let i=1;i<p.length-1;i++){
    const a=p[0],b=p[i],c=p[i+1],bx=b[0]-a[0],by=b[1]-a[1],cx=c[0]-a[0],cy=c[1]-a[1],det=bx*cy-by*cx;
    if(Math.abs(det)<1e-12)continue;
    const c0=Math.max(0,Math.ceil((Math.min(a[0],b[0],c[0])-ox)/h-.5-1e-7)),c1=Math.min(nc-1,Math.floor((Math.max(a[0],b[0],c[0])-ox)/h-.5+1e-7)),
      r0=Math.max(0,Math.ceil((Math.min(a[1],b[1],c[1])-oy)/h-.5-1e-7)),r1=Math.min(nr-1,Math.floor((Math.max(a[1],b[1],c[1])-oy)/h-.5+1e-7));
    for(let j=r0;j<=r1;j++){const dy=oy+(j+.5)*h-a[1];
      for(let k=c0;k<=c1;k++){const dx=ox+(k+.5)*h-a[0],u=(dx*cy-dy*cx)/det,v=(bx*dy-by*dx)/det;
        if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)st[j*nc+k]=1;}}
  }
  // sem terreno não há lado: fica de fora
  for(let j=0;j<nr;j++)for(let c=0;c<nc;c++){const i=j*nc+c;
    if(st[i]===2&&!Number.isFinite(sample(g,ox+(c+.5)*h,oy+(j+.5)*h)))st[i]=0;}
  // rótulos das regiões conexas (4 vizinhos), sem recursão
  const lab=new Int32Array(nc*nr),area=[0],state=[0],stack=new Int32Array(nc*nr),last=nc*(nr-1);
  for(let s=0;s<nc*nr;s++){
    if(!st[s]||lab[s])continue;
    const id=area.length,e=st[s];let n=0,top=0;stack[top++]=s;lab[s]=id;
    while(top){const i=stack[--top],c=i%nc;n++;
      if(c>0&&st[i-1]===e&&!lab[i-1]){lab[i-1]=id;stack[top++]=i-1;}
      if(c<nc-1&&st[i+1]===e&&!lab[i+1]){lab[i+1]=id;stack[top++]=i+1;}
      if(i>=nc&&st[i-nc]===e&&!lab[i-nc]){lab[i-nc]=id;stack[top++]=i-nc;}
      if(i<last&&st[i+nc]===e&&!lab[i+nc]){lab[i+nc]=id;stack[top++]=i+nc;}
    }
    area.push(n*h*h);state.push(e);
  }
  return {h,nc,nr,ox,oy,st,lab,area,state,total:area.reduce((a,b)=>a+b,0),
    at:(x,y)=>{const c=Math.floor((x-ox)/h),j=Math.floor((y-oy)/h);return c<0||j<0||c>=nc||j>=nr?0:lab[j*nc+c];}};
}
/* As duas regiões vizinhas de uma linha, em pontos de prova ao longo dela (até
   ~60), dos dois lados e a três distâncias. Chama fn(a, b) com os rótulos. */
function sides(F,geom,fn){
  const m=geom.length-1,skip=Math.max(1,Math.floor(m/60));let probes=0;
  for(let i=0;i<m;i+=skip){
    const a=geom[i],b=geom[i+1],ex=b[0]-a[0],ey=b[1]-a[1],l=Math.hypot(ex,ey);if(!(l>1e-9))continue;
    const px=(a[0]+b[0])/2,py=(a[1]+b[1])/2,nx=-ey/l,ny=ex/l;probes++;
    for(const d of [1.5*F.h,2.5*F.h,4*F.h]){
      const p=F.at(px+nx*d,py+ny*d),q=F.at(px-nx*d,py-ny*d);
      if(!p||!q||p===q)continue;
      fn(p,q);break;
    }
  }
  return probes;
}
/* Decide o que muda com as linhas apagadas ("lines": geometria de cada uma).
   A região cortada vizinha passa a mantida — o desenho bruto continua inteiro
   ali —, salvo quando a mantida é uma ilha pequena (menor que a vizinha e que
   10% do projeto): aí é a ilha que sai. Devolve:
     mask.at(x, y)  +1 = vale o projeto, −1 = fica cortado, 0 = não mexe
     separates(geom) a linha ainda separa dois lados diferentes?
     flips          regiões que mudaram; unresolved, linhas sem dois lados claros */
function heal(F,lines,options={}){
  const none={mask:null,flips:[],unresolved:[],separates:()=>true};
  if(!F||!lines?.length)return none;
  const {h,nc,nr,ox,oy,st,lab,area,state}=F,final=state.slice(),pairs=[],unresolved=[],island=options.islandShare??.1;
  lines.forEach((geom,li)=>{
    const votes=new Map(),probes=sides(F,geom,(p,q)=>{
      if(state[p]===state[q])return;
      const key=state[p]===1?p+'|'+q:q+'|'+p;votes.set(key,(votes.get(key)||0)+1);});
    let best=null,bn=0;for(const [key,n] of votes)if(n>bn){bn=n;best=key;}
    if(!best||bn<Math.max(1,.25*probes)){unresolved.push(li);return;}
    pairs.push(best.split('|').map(Number));
  });
  // Várias linhas podem tocar a mesma região: repete até nenhuma separar mais nada.
  for(let pass=0,changed=true;changed&&pass<8;pass++){
    changed=false;
    for(const [p,q] of pairs){
      if(final[p]===final[q])continue;
      const k=final[p]===1?p:q,c=k===p?q:p;
      if(area[k]<area[c]&&area[k]<island*F.total)final[k]=2;else final[c]=1;
      changed=true;
    }
  }
  const fl=new Int8Array(nc*nr),flips=[];let any=false;
  for(let id=1;id<final.length;id++)if(final[id]!==state[id])flips.push({id,to:final[id]===1?1:-1,area:area[id]});
  if(!flips.length)return {...none,unresolved};
  for(let i=0;i<nc*nr;i++){const id=lab[i];if(id&&final[id]!==state[id]){fl[i]=final[id]===1?1:-1;any=true;}}
  if(!any)return {...none,unresolved};
  /* A borda da região na grade pode ficar até uma célula aquém do contato de
     verdade: a máscara avança duas células, só sobre o que já está do lado de
     destino (ou fora do projeto) — nunca sobre outra região a mudar. */
  for(let pass=0;pass<2;pass++){
    const src=fl.slice();
    for(let j=0;j<nr;j++)for(let c=0;c<nc;c++){
      const i=j*nc+c;if(src[i])continue;
      let v=0;
      for(let dj=-1;dj<=1&&!v;dj++){const jj=j+dj;if(jj<0||jj>=nr)continue;
        for(let dc=-1;dc<=1;dc++){const cc=c+dc;if(cc<0||cc>=nc)continue;const w=src[jj*nc+cc];if(w){v=w;break;}}}
      if(v&&(st[i]===0||st[i]===(v>0?1:2)))fl[i]=v;
    }
  }
  const stateAt=id=>id?final[id]:0;
  return {flips,unresolved,
    mask:{h,at:(x,y)=>{const c=Math.floor((x-ox)/h),j=Math.floor((y-oy)/h);return c<0||j<0||c>=nc||j>=nr?0:fl[j*nc+c];}},
    // em dúvida (um só lado visível, borda do projeto, vazio do MDT) a linha fica
    separates:geom=>{let dif=0,same=0;sides(F,geom,(p,q)=>{if(stateAt(p)!==stateAt(q))dif++;else same++;});return dif>=same;}};
}
root.GeoMineCavaTerrain={intersect,clipPolygon,mergePolygons,rasterize,faces,heal};
})(typeof window==='object'?window:globalThis);
