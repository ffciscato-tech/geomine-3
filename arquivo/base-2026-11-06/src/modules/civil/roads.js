/* ============================================================
   CIVIL — ALINHAMENTO AUTOMÁTICO A→B POR MÍNIMO MOVIMENTO DE TERRA
   O traçado NÃO é a reta: é o caminho que exige menos corte e aterro.
   Busca de menor custo (Dijkstra) num espaço de estados (célula ×
   cota do greide): cada passo paga o volume de terra movido para
   levar o terreno à cota da estrada, mais um peso pequeno de
   comprimento; a inclinação entre estados respeita a rampa máxima.
   ============================================================ */
function civSample(g,x,y){
  // A grade pode ter pixels retangulares; sampleZbil usa cs nas duas direções.
  return sampleZbil(g,x,g.tin?y:g.yll+(y-g.yll)*(g.cs/(g.csy||g.cs)));
}
function civVolumes(d1,d2,W,d){
  if(d1*d2<0){const f=Math.abs(d1)/(Math.abs(d1)+Math.abs(d2));
    return {corte:W*d*(d1<0?-d1*f:-d2*(1-f))/2,aterro:W*d*(d1>0?d1*f:d2*(1-f))/2};}
  const v=(d1+d2)/2*W*d;return {corte:Math.max(0,-v),aterro:Math.max(0,v)};
}
function civGrade(g,cols,linhas,x0,y0,passo){
  /* reamostra o MDT numa malha de trabalho (no máx. ~150×150) */
  const Z=new Float64Array(cols*linhas);
  for(let r=0;r<linhas;r++)for(let c=0;c<cols;c++){
    const x=x0+(c+0.5)*passo,y=y0+(r+0.5)*passo,z=civSample(g,x,y);
    Z[r*cols+c]=Number.isFinite(z)?z:NaN;
  }
  return Z;
}
/* fila de prioridade binária (sem dependências) */
function civHeap(){
  const a=[];
  return {
    tam:()=>a.length,
    push(no){a.push(no);let i=a.length-1;
      while(i>0){const p=(i-1)>>1;if(a[p].c<=a[i].c)break;[a[p],a[i]]=[a[i],a[p]];i=p;}},
    pop(){const t=a[0],u=a.pop();
      if(a.length){a[0]=u;let i=0;
        for(;;){const l=2*i+1,r=l+1;let m=i;
          if(l<a.length&&a[l].c<a[m].c)m=l;
          if(r<a.length&&a[r].c<a[m].c)m=r;
          if(m===i)break;[a[m],a[i]]=[a[i],a[m]];i=m;}}
      return t;}
  };
}
function civAlinhamento(g,A,B,opt){
  opt=opt||{};
  if(!g||!A||!B||![...A,...B].every(Number.isFinite))return {erro:'Informe pontos A e B válidos'};
  if(Math.hypot(B[0]-A[0],B[1]-A[1])<0.001)return {erro:'Os pontos A e B devem ser diferentes'};
  const W=Math.max(1,+opt.W||8),           /* largura da plataforma */
    gmax=Math.max(0.005,(+opt.grade||8)/100), /* rampa máxima */
    dz=Math.max(0.5,+opt.dz||2),           /* passo do greide */
    pesoComp=(opt.pesoComp==null?0.35:Math.max(0,+opt.pesoComp||0)), /* custo por metro (m³ equiv.) */
    pesoVol=(opt.pesoVol==null?1:Math.max(0,+opt.pesoVol||0)), /* peso do movimento de terra */
    raioMin=Math.max(0,+opt.raioMin||0); /* NOVO: raio mínimo de curva (m); 0 = desativado */
  /* A e B precisam estar DENTRO do MDT (nada de encostar na borda) */
  const gx1=g.xll+g.nc*g.cs,gy1=g.yll+g.nr*(g.csy||g.cs),
    foraDoMdt=P=>P[0]<g.xll||P[0]>gx1||P[1]<g.yll||P[1]>gy1;
  if(foraDoMdt(A)||foraDoMdt(B))
    return {erro:'Os pontos A e B precisam estar dentro do MDT'};
  /* janela de trabalho: retângulo A-B com folga, recortada no MDT */
  const folga=Math.max(60,Math.hypot(B[0]-A[0],B[1]-A[1])*0.6);
  let x0=Math.min(A[0],B[0])-folga,y0=Math.min(A[1],B[1])-folga,
    x1=Math.max(A[0],B[0])+folga,y1=Math.max(A[1],B[1])+folga;
  x0=Math.max(x0,g.xll);y0=Math.max(y0,g.yll);x1=Math.min(x1,gx1);y1=Math.min(y1,gy1);
  /* MALHA E NÍVEIS ACOPLADOS À RAMPA MÁXIMA: subir um nível tem de
     caber numa aresta diagonal, senão o greide nunca muda de cota e a
     busca declara "sem traçado" (armadilha real: 4% num terreno de
     150 m de amplitude). Por isso o passo horizontal nunca é menor que
     o necessário para vencer um degrau de cota.
     Com RAIO MÍNIMO ativo o estado ganha uma dimensão de RUMO (8
     direções) — para o número de estados continuar tratável no
     navegador, a malha e os níveis de greide usam um teto menor. */
  const alvoN=raioMin>0?80:140,nzCap=raioMin>0?40:90;
  let amp=0;
  {
    const passoTeste=Math.max(g.cs||1,Math.max(x1-x0,y1-y0)/alvoN),
      ct=Math.max(3,Math.ceil((x1-x0)/passoTeste)),
      lt=Math.max(3,Math.ceil((y1-y0)/passoTeste)),
      Zt=civGrade(g,ct,lt,x0,y0,passoTeste);
    let mn=Infinity,mx=-Infinity;
    for(const v of Zt)if(Number.isFinite(v)){if(v<mn)mn=v;if(v>mx)mx=v;}
    if(!Number.isFinite(mn))return {erro:'MDT sem células válidas nessa área'};
    amp=Math.max(1,(mx-mn)+2*dz);
  }
  /* o degrau de cota nunca pode ficar maior do que o teto de níveis
     permite, senão o acoplamento acima se perde e nada sobe */
  const stepZ=Math.max(0.5,Math.min(dz,amp),amp/(nzCap-1)),
    passoMin=stepZ/(gmax*1.414),
    passo=Math.max(g.cs||1,Math.max(x1-x0,y1-y0)/alvoN,passoMin),
    cols=Math.max(3,Math.ceil((x1-x0)/passo)),
    linhas=Math.max(3,Math.ceil((y1-y0)/passo));
  const Z=civGrade(g,cols,linhas,x0,y0,passo);
  const cel=(x,y)=>[Math.min(cols-1,Math.max(0,Math.floor((x-x0)/passo))),
    Math.min(linhas-1,Math.max(0,Math.floor((y-y0)/passo)))];
  const [ca,ra]=cel(A[0],A[1]),[cb,rb]=cel(B[0],B[1]);
  const zA=Z[ra*cols+ca],zB=Z[rb*cols+cb];
  if(!Number.isFinite(zA)||!Number.isFinite(zB))
    return {erro:'Os pontos A e B precisam estar dentro do MDT'};
  /* níveis do greide: cobrem o terreno da janela, com folga */
  let zmin=Infinity,zmax=-Infinity;
  for(const v of Z)if(Number.isFinite(v)){if(v<zmin)zmin=v;if(v>zmax)zmax=v;}
  if(!Number.isFinite(zmin))return {erro:'MDT sem células válidas nessa área'};
  zmin=Math.min(zmin,zA,zB)-dz;zmax=Math.max(zmax,zA,zB)+dz;
  /* a treliça de cotas é ANCORADA na cota do ponto A: assim o greide
     pode encostar exatamente no terreno nas pontas (num terreno plano
     a terraplenagem tem de dar zero, não um resto de arredondamento) */
  const passoZ=stepZ;
  zmin=zA-Math.ceil((zA-zmin)/passoZ)*passoZ;
  const nz=Math.min(nzCap,Math.max(2,Math.ceil((zmax-zmin)/passoZ)+1)),
    zDe=k=>zmin+k*passoZ,
    kDe=z=>Math.min(nz-1,Math.max(0,Math.round((z-zmin)/passoZ)));
  const viz=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  const kA=kDe(zA),kB=kDe(zB);
  let achou=false,visitados=0,cam=[],custoFim=Infinity;
  if(raioMin>0){
    /* ---- busca com RUMO: estado (célula × cota × direção da última
       aresta) — só assim dá para proibir uma curva mais fechada do
       que o raio pedido. O nó inicial nasce em HNONE (sem rumo ainda:
       a 1ª aresta é sempre livre, não há curva antes dela). ---- */
    const nDir=viz.length,HNONE=nDir,nH=nDir+1;
    const nEst=cols*linhas*nz*nH,
      custo=new Float64Array(nEst).fill(Infinity),
      prev=new Int32Array(nEst).fill(-1),
      fechado=new Uint8Array(nEst);
    const id=(c,r,k,h)=>((r*cols+c)*nz+k)*nH+h;
    /* ângulo entre duas das 8 direções (matriz fixa, calculada 1x) */
    const ANG=[];
    for(let i=0;i<nDir;i++){
      ANG[i]=[];
      const la=Math.hypot(viz[i][0],viz[i][1]);
      for(let j=0;j<nDir;j++){
        const lb=Math.hypot(viz[j][0],viz[j][1]),
          cos=Math.max(-1,Math.min(1,(viz[i][0]*viz[j][0]+viz[i][1]*viz[j][1])/(la*lb)));
        ANG[i][j]=Math.acos(cos);
      }
    }
    const hp=civHeap();
    const iniId=id(ca,ra,kA,HNONE);
    custo[iniId]=0;hp.push({c:0,i:iniId});
    let fimId=-1;
    while(hp.tam()){
      const no=hp.pop();
      if(fechado[no.i])continue;
      fechado[no.i]=1;visitados++;
      let rem=no.i,hh=rem%nH;rem=(rem-hh)/nH;
      const k=rem%nz;rem=(rem-k)/nz;
      const c=rem%cols,r=(rem-c)/cols,z=zDe(k);
      if(c===cb&&r===rb&&k===kB){achou=true;fimId=no.i;custoFim=no.c;break;}
      for(let di=0;di<nDir;di++){
        const dc=viz[di][0],dr=viz[di][1],c2=c+dc,r2=r+dr;
        if(c2<0||r2<0||c2>=cols||r2>=linhas)continue;
        const t2=Z[r2*cols+c2];
        if(!Number.isFinite(t2))continue;
        const dist=Math.hypot(dc,dr)*passo;
        /* RAIO MÍNIMO: só se já existe rumo anterior (2ª aresta em diante) */
        if(hh!==HNONE){
          const ang=ANG[hh][di];
          if(ang>1e-9){
            const raio=dist/(2*Math.sin(ang/2));
            if(raio<raioMin-1e-6)continue; /* curva mais fechada que o pedido */
          }
        }
        const dzMax=gmax*dist,kLo=kDe(z-dzMax),kHi=kDe(z+dzMax);
        for(let k2=kLo;k2<=kHi;k2++){
          const z2=zDe(k2);
          if(Math.abs(z2-z)>dzMax+1e-9)continue;
          const t1=Z[r*cols+c];
          const desnivel=(Math.abs(z-t1)+Math.abs(z2-t2))/2,
            vol=desnivel*W*dist,
            nc2=id(c2,r2,k2,di),
            novo=no.c+pesoVol*vol+pesoComp*dist;
          if(novo<custo[nc2]){custo[nc2]=novo;prev[nc2]=no.i;hp.push({c:novo,i:nc2});}
        }
      }
    }
    if(!achou)return {erro:'Não há traçado possível com essa rampa máxima e esse raio mínimo de curva'};
    let cur=fimId;
    while(cur>=0){
      let rem=cur,hh=rem%nH;rem=(rem-hh)/nH;
      const k=rem%nz;rem=(rem-k)/nz;
      const c=rem%cols,r=(rem-c)/cols;
      cam.push({x:x0+(c+0.5)*passo,y:y0+(r+0.5)*passo,z:zDe(k),t:Z[r*cols+c]});
      cur=prev[cur];
    }
    cam.reverse();
  }else{
    /* ---- busca ORIGINAL (sem rumo) — idêntica à linha anterior, byte
       a byte, quando raioMin===0: nenhuma regressão para quem não pediu
       raio mínimo. ---- */
    const nEst=cols*linhas*nz,
      custo=new Float64Array(nEst).fill(Infinity),
      prev=new Int32Array(nEst).fill(-1),
      fechado=new Uint8Array(nEst);
    const id=(c,r,k)=>(r*cols+c)*nz+k;
    const hp=civHeap();
    custo[id(ca,ra,kA)]=0;hp.push({c:0,i:id(ca,ra,kA)});
    const fim=id(cb,rb,kB);
    while(hp.tam()){
      const no=hp.pop();
      if(fechado[no.i])continue;
      fechado[no.i]=1;visitados++;
      if(no.i===fim){achou=true;custoFim=no.c;break;}
      const k=no.i%nz,cr=(no.i-k)/nz,c=cr%cols,r=(cr-c)/cols,z=zDe(k);
      for(const [dc,dr] of viz){
        const c2=c+dc,r2=r+dr;
        if(c2<0||r2<0||c2>=cols||r2>=linhas)continue;
        const t2=Z[r2*cols+c2];
        if(!Number.isFinite(t2))continue;
        const dist=Math.hypot(dc,dr)*passo,
          dzMax=gmax*dist,
          kLo=kDe(z-dzMax),kHi=kDe(z+dzMax);
        for(let k2=kLo;k2<=kHi;k2++){
          const z2=zDe(k2);
          if(Math.abs(z2-z)>dzMax+1e-9)continue;
          const t1=Z[r*cols+c];
          /* volume movido no trecho: média |greide − terreno| × largura × comprimento */
          const desnivel=(Math.abs(z-t1)+Math.abs(z2-t2))/2,
            vol=desnivel*W*dist,
            nc2=id(c2,r2,k2),
            novo=no.c+pesoVol*vol+pesoComp*dist;
          if(novo<custo[nc2]){custo[nc2]=novo;prev[nc2]=no.i;hp.push({c:novo,i:nc2});}
        }
      }
    }
    if(!achou)return {erro:'Não há traçado possível com essa rampa máxima'};
    /* reconstrói o caminho */
    let cur=fim;
    while(cur>=0){
      const k=cur%nz,cr=(cur-k)/nz,c=cr%cols,r=(cr-c)/cols;
      cam.push({x:x0+(c+0.5)*passo,y:y0+(r+0.5)*passo,z:zDe(k),t:Z[r*cols+c]});
      cur=prev[cur];
    }
    cam.reverse();
  }
  // O resultado deve começar/terminar nas coordenadas escolhidas, não no
  // centro da célula. Nunca aceitar uma conexão que viole a rampa ou o raio.
  const endpoint=P=>({x:P[0],y:P[1],z:civSample(g,P[0],P[1]),t:civSample(g,P[0],P[1])});
  const pa=endpoint(A),pb=endpoint(B);
  if(!Number.isFinite(pa.z)||!Number.isFinite(pb.z))return {erro:'Ponto inicial ou final sem cota válida no MDT'};
  if(cam.length<2)cam=[pa,pb];else {cam[0]=pa;cam[cam.length-1]=pb;}
  const raioEstrada=Math.max(raioMin||60,W/2+1);
  let curvas;
  try{curvas=civCurvasTangentes(cam,raioEstrada,Math.min(3,Math.max(.5,raioEstrada/40)));cam=curvas.points;}
  catch(e){return {erro:e.message};}
  for(const p of cam){p.t=civSample(g,p.x,p.y);if(!Number.isFinite(p.t))return {erro:'Uma curva sai da cobertura válida do MDT. Ajuste os pontos do traçado.'};}
  for(let i=1;i<cam.length;i++){
    const a=cam[i-1],b=cam[i],d=Math.hypot(b.x-a.x,b.y-a.y);
    if(d<1e-8||Math.abs(b.z-a.z)>gmax*d+1e-7)return {erro:'A conexão exata com A/B excede a rampa máxima. Reduza o passo do greide ou ajuste os pontos.'};
  }
  /* Estatísticas do eixo; volumes aproximados, sem a contribuição dos taludes. */
  let corte=0,aterro=0,comp=0,rampaMax=0,raioReal=Infinity;
  for(let i=1;i<cam.length;i++){
    const a=cam[i-1],b=cam[i],d=Math.hypot(b.x-a.x,b.y-a.y);
    comp+=d;
    const v=civVolumes(a.z-a.t,b.z-b.t,W,d);corte+=v.corte;aterro+=v.aterro;
    if(d>0)rampaMax=Math.max(rampaMax,Math.abs(b.z-a.z)/d);
    if(i<cam.length-1){
      const c=cam[i+1],
        ang=Math.atan2(b.y-a.y,b.x-a.x),ang2=Math.atan2(c.y-b.y,c.x-b.x),
        dth=Math.abs(Math.atan2(Math.sin(ang2-ang),Math.cos(ang2-ang)));
      if(dth>1e-9){
        const raio=d/(2*Math.sin(dth/2));
        if(raio<raioReal)raioReal=raio;
      }
    }
  }
  return {caminho:cam,corte,aterro,comprimento:comp,rampaMax,
    raioMin:curvas.curves.length?raioEstrada:null,curvasTangentes:true,controls:curvas.controls,
    passo,celulas:cols*linhas,niveis:nz,visitados,custo:custoFim};
}
/* volume de terra de um traçado RETO A→B (referência para comparar) */
function civVolumeReta(g,A,B,opt){
  opt=opt||{};
  const W=Math.max(1,+opt.W||8),n=Math.max(2,Math.ceil(Math.hypot(B[0]-A[0],B[1]-A[1])/(g.cs||1)));
  const zA=civSample(g,A[0],A[1]),zB=civSample(g,B[0],B[1]);
  if(!Number.isFinite(zA)||!Number.isFinite(zB))return null;
  let corte=0,aterro=0,comp=0;
  let ant=null;
  for(let i=0;i<=n;i++){
    const f=i/n,x=A[0]+(B[0]-A[0])*f,y=A[1]+(B[1]-A[1])*f,
      z=zA+(zB-zA)*f,t=civSample(g,x,y);
    if(!Number.isFinite(t))return null;
    const p={x,y,z,t:Number.isFinite(t)?t:z};
    if(ant){
      const d=Math.hypot(p.x-ant.x,p.y-ant.y),v=civVolumes(ant.z-ant.t,p.z-p.t,W,d);
      comp+=d;corte+=v.corte;aterro+=v.aterro;
    }
    ant=p;
  }
  return {corte,aterro,comprimento:comp,total:corte+aterro};
}


/* ============================================================
   CIVIL — SAIA DE TALUDES ATÉ A INTERSEÇÃO COM O TERRENO
   Da borda da plataforma para fora, o talude marcha em BANCADAS:
   sobe (corte) ou desce (aterro) a altura H com a inclinação
   escolhida, intercala a berma e repete, até a superfície do
   talude encontrar o terreno (daylight). Devolve, por estaca e por
   lado, os pontos de quebra (pé/crista de cada bancada) e o ponto
   de interseção — é isso que vira o desenho da saia.
   ============================================================ */
/* Local moving frame. Signed curvature bounds the regular offset surface:
   inside a curve, neighboring normals meet at its centre of curvature. */
function civRoadFrame(axis,i){
  const n=axis.length,j=Math.max(0,Math.min(n-1,i)),p=axis[j];
  const dir=(a,b)=>{const x=b.x-a.x,y=b.y-a.y,d=Math.hypot(x,y);return d>1e-9?[x/d,y/d]:null;};
  const u=j>0?dir(axis[j-1],p):null,v=j<n-1?dir(p,axis[j+1]):null;
  let tx=(u?.[0]||0)+(v?.[0]||0),ty=(u?.[1]||0)+(v?.[1]||0),len=Math.hypot(tx,ty);
  if(len<1e-8){tx=(v||u||[1,0])[0];ty=(v||u||[1,0])[1];len=1;}
  tx/=len;ty/=len;
  let curvature=0;
  if(n>2){
    const k=Math.max(1,Math.min(n-2,j)),a=axis[k-1],b=axis[k],c=axis[k+1],
      ux=b.x-a.x,uy=b.y-a.y,vx=c.x-b.x,vy=c.y-b.y,
      den=Math.hypot(ux,uy)*Math.hypot(vx,vy)*Math.hypot(c.x-a.x,c.y-a.y);
    if(den>1e-12)curvature=2*(ux*vy-uy*vx)/den;
  }
  return {tx,ty,nx:-ty,ny:tx,curvature};
}
function civSlopeOptions(opt,curvature,side){
  const requested=Math.max(0,Number.isFinite(+opt.maxOff)?+opt.maxOff:120),k=(+curvature||0)*side;
  if(k<=1e-10)return {...opt,maxOff:requested,curveLimited:false};
  // Leave a small positive Jacobian: a folded offset is not a slope surface.
  const radius=1/k,limit=Math.max(0,radius-Math.max(1,+opt.W||8)/2-Math.max(.05,radius*.001));
  return {...opt,maxOff:Math.min(requested,limit),curveLimited:limit<requested};
}
function civTaludeNaEstaca(g,P,N,zr,opt={}){
  const norm=Math.hypot(N[0],N[1]);
  if(norm<1e-12||!Number.isFinite(zr))return null;
  N=[N[0]/norm,N[1]/norm];
  const terrain=o=>civSample(g,P[0]+N[0]*o,P[1]+N[1]*o),point=(off,z)=>({x:P[0]+N[0]*off,y:P[1]+N[1]*off,z,off});
  const t0=terrain(0);if(!Number.isFinite(t0))return null;
  const corte=t0>zr+.0001,aterro=t0<zr-.0001,modo=corte?'corte':aterro?'aterro':'nivel';
  if(!corte&&!aterro)return {off:0,pontos:[],inter:point(0,t0),modo};
  const sub=corte?1:-1,angle=Math.max(5,Math.min(89,Number(corte?opt.angCorte:opt.angAterro)||(corte?60:34)))*Math.PI/180,
    tan=Math.tan(angle),H=Math.max(.5,+opt.H||8),B=Math.max(0,opt.berma==null?3:+opt.berma),
    step=Math.max(.02,+opt.passo||1),maxOff=Math.max(0,Number.isFinite(+opt.maxOff)?+opt.maxOff:120);
  let off=0,z=zr;const pontos=[];
  const open=reason=>({off,pontos,inter:null,modo,aberto:true,reason});
  const cellStep=(o,limit)=>{
    if(g.tin)return limit;
    // Stop at bilinear cell boundaries. Within each cell the terrain along
    // this ray is quadratic, so an intervening first contact cannot be skipped.
    for(const [coordinate,direction,origin,cell]of [[P[0],N[0],g.xll,g.cs],[P[1],N[1],g.yll,g.csy||g.cs]]){
      if(!Number.isFinite(cell)||cell<=0||Math.abs(direction)<1e-12)continue;
      const q=(coordinate+direction*o-origin)/cell-.5,
        edge=direction>0?Math.floor(q+1e-9)+1:Math.ceil(q-1e-9)-1,
        delta=((edge+.5)*cell+origin-coordinate)/direction-o;
      if(delta>1e-8)limit=Math.min(limit,delta);
    }
    return limit;
  };
  const contact=(a,b,za,zb)=>{
    const mid=(a+b)/2,tm=terrain(mid),tb=terrain(b);
    if(!Number.isFinite(tm)||!Number.isFinite(tb))return {missing:true};
    const fa=sub*(za-terrain(a)),fm=sub*((za+zb)/2-tm),fb=sub*(zb-tb);
    let lo=a,hi=null;
    if(fm>=0)hi=mid;
    else if(fb>=0){lo=mid;hi=b;}
    else if(!g.tin){
      const qa=2*(fa+fb-2*fm),qb=fb-fa-qa,t=qa<0?-qb/(2*qa):-1;
      if(t>0&&t<1&&qa*t*t+qb*t+fa>=0){
        const peak=a+(b-a)*t,tp=terrain(peak),zp=za+(zb-za)*t;
        if(Number.isFinite(tp)&&sub*(zp-tp)>=0)hi=peak;
      }
    }
    if(hi==null)return null;
    for(let i=0;i<30&&hi-lo>1e-7;i++){
      const o=(lo+hi)/2,t=terrain(o),h=za+(zb-za)*(o-a)/(b-a);
      if(!Number.isFinite(t))return {missing:true};
      if(sub*(h-t)>=0)hi=o;else lo=o;
    }
    const o=(lo+hi)/2;return point(o,za+(zb-za)*(o-a)/(b-a));
  };
  for(let banco=1,guard=0;guard<30000;banco++){
    for(const phase of [{length:H/tan,slope:sub*tan,tipo:corte?'Crista de bancada':'Pé de bancada'},
                       {length:B,slope:0,tipo:corte?'Pé de bancada':'Crista de bancada'}]){
      if(phase.length<=0)continue;
      const end=off+phase.length;
      while(off<end-1e-9){
        if(++guard>=30000)return open('limite-amostragem');
        if(off>=maxOff-1e-8)return open(opt.curveLimited?'convergencia-curva':'alcance');
        const delta=cellStep(off,Math.min(step,end-off,maxOff-off)),next=off+delta,h=z+phase.slope*delta,
          hit=contact(off,next,z,h);
        if(hit?.missing)return open('mdt-sem-dados');
        if(hit)return {off:hit.off,pontos,inter:hit,modo};
        off=next;z=h;
      }
      pontos.push({...point(off,z),banco,tipo:phase.tipo});
    }
  }
  return open('limite-amostragem');
}
/* saia completa ao longo do eixo: bordas da plataforma, linhas de
   bancada (por índice e por lado) e a linha de interseção */
function civSaia(g,eixo,opt){
  if(!g||!eixo||eixo.length<2)return {erro:'Gere o alinhamento antes de desenhar os taludes'};
  const W=Math.max(1,+opt.W||8),meia=W/2,lados=[{s:-1,nome:'direita'},{s:1,nome:'esquerda'}],
    cell=Math.min(g.cs||1,g.csy||g.cs||1),tol=Math.max(.025,Math.min(.15,cell*.2)),minStep=Math.max(.05,Math.min(.25,cell*.25));
  const at=(p)=>{
    const q={...p,sides:{}};
    for(const l of lados){
      const N=[p.nx*l.s,p.ny*l.s],P=[p.x+N[0]*meia,p.y+N[1]*meia],
        options=civSlopeOptions(opt,p.curvature,l.s),r=civTaludeNaEstaca(g,P,N,p.z,options);
      q.sides[l.nome]={P,N,zr:p.z,r,options};
    }
    return q;
  };
  let chain=0;
  const initial=eixo.map((p,i)=>{
    if(i)chain+=Math.hypot(p.x-eixo[i-1].x,p.y-eixo[i-1].y);
    const frame=[p.nx,p.ny,p.curvature].every(Number.isFinite)?{nx:p.nx,ny:p.ny,curvature:p.curvature}:civRoadFrame(eixo,i);
    return at({...p,...frame,s:chain});
  });
  const interpolate=(a,b,t)=>{
    const nx=a.nx+(b.nx-a.nx)*t,ny=a.ny+(b.ny-a.ny)*t,len=Math.hypot(nx,ny)||1;
    return at({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,s:a.s+(b.s-a.s)*t,
      nx:nx/len,ny:ny/len,curvature:a.curvature+(b.curvature-a.curvature)*t});
  };
  // Refine the actual MDT contact, not a smoothed line floating above/below it.
  const samples=[initial[0]];let evaluated=initial.length,limited=0;
  const refine=(a,b,depth)=>{
    const mid=interpolate(a,b,.5);evaluated++;
    const errors={};let split=false;
    for(const l of lados){
      const ar=a.sides[l.nome].r,br=b.sides[l.nome].r,mr=mid.sides[l.nome].r;
      let error=0;
      if(ar?.inter&&br?.inter&&mr?.inter){
        const ai=ar.inter,bi=br.inter,mi=mr.inter,
          chord=[(ai.x+bi.x)/2,(ai.y+bi.y)/2,(ai.z+bi.z)/2],terrain=civSample(g,chord[0],chord[1]);
        error=Math.max(Math.hypot(mi.x-chord[0],mi.y-chord[1]),Math.abs(mi.z-chord[2]),Number.isFinite(terrain)?Math.abs(chord[2]-terrain):Infinity);
      }else if(Boolean(ar?.inter)!==Boolean(br?.inter)||Boolean(ar?.inter)!==Boolean(mr?.inter))error=Infinity;
      errors[l.nome]=error;
      if(error>tol||ar?.modo!==br?.modo||ar?.pontos?.length!==br?.pontos?.length)split=true;
    }
    if(split&&depth<10&&b.s-a.s>minStep&&evaluated<20000){refine(a,mid,depth+1);refine(mid,b,depth+1);return;}
    b.breakBefore={};
    for(const l of lados)if(errors[l.nome]>tol){b.breakBefore[l.nome]=true;limited++;}
    samples.push(b);
  };
  for(let i=1;i<initial.length;i++)refine(initial[i-1],initial[i],0);
  const saidas={};
  for(const l of lados){
    const d=saidas[l.nome]={borda:[],inter:[],bancos:{},secoes:[],aberto:0,curva:0,breakBefore:[]};
    samples.forEach((p,i)=>{
      const sec=p.sides[l.nome],r=sec.r;d.secoes[i]=sec;d.borda.push([...sec.P,sec.zr]);d.inter[i]=r?.inter?[r.inter.x,r.inter.y,r.inter.z]:null;
      d.breakBefore[i]=!!p.breakBefore?.[l.nome];
      if(!r||r.aberto){d.aberto++;if(r?.reason==='convergencia-curva')d.curva++;}
      for(const q of r?.pontos||[]){
        const key=q.banco+'|'+q.tipo+'|'+r.modo;
        (d.bancos[key]??=Array(samples.length).fill(null))[i]=[q.x,q.y,q.z];
      }
    });
    d.bancoPartes={};
    const contact=(i,j,key)=>{
      const a=d.secoes[i],b=d.secoes[j];
      if(!a?.r?.inter||!b?.r?.inter||a.r.modo!==b.r.modo)return null;
      const [bank,type,mode]=key.split('|');
      const at=t=>{
        const sec=interpolate(samples[i],samples[j],t).sides[l.nome],r=sec.r;
        if(!r?.inter||r.modo!==mode)return null;
        return r.pontos.find(p=>p.banco===+bank&&p.tipo===type)||null;
      };
      let lo=0,hi=1,p=at(0);if(!p)return null;
      for(let k=0;k<28;k++){const t=(lo+hi)/2,q=at(t);if(q){lo=t;p=q;}else hi=t;}
      const terrain=civSample(g,p.x,p.y);
      return Number.isFinite(terrain)&&Math.abs(p.z-terrain)<.002?[p.x,p.y,p.z]:null;
    };
    for(const [key,points]of Object.entries(d.bancos)){
      const parts=[];let part=[];
      const flush=()=>{if(part.length>1)parts.push(part);part=[];};
      points.forEach((p,i)=>{
        if(!p){flush();return;}
        if(d.breakBefore[i])flush();
        if(i>0&&!points[i-1]){const end=contact(i,i-1,key);if(end)part.push(end);}
        if(part.length&&i>0&&points[i-1]){
          const a=samples[i-1],b=samples[i],q=part.at(-1),dx=b.x-a.x,dy=b.y-a.y;
          if((p[0]-q[0])*dx+(p[1]-q[1])*dy<=0)flush();
        }
        part.push(p);
        if(i<points.length-1&&!points[i+1]){const end=contact(i,i+1,key);if(end)part.push(end);flush();}
      });flush();d.bancoPartes[key]=parts;
    }
  }
  return {lados:saidas,eixo:samples,refinementLimited:limited};
}
/* ===== CIVIL — ligação do painel de estrada ===== */
function civDesenhaSaia(precomputed=null){
  const info=document.getElementById('civInfo'),C=GeoMineCivil.current();
  if(!C.alignmentConfirmed||C.alignmentPending){toast('Confirme o alinhamento e o greide antes de gerar taludes.');return;}
  if(!C.eixo||C.eixo.length<2){toast('Gere o alinhamento A→B antes de desenhar os taludes');return;}
  const R=civMdt();
  if(!R){toast('Escolha o MDT para encontrar a interseção dos taludes');return;}
  if(C.crs!==S.workCRS){toast('Volte ao CRS da estrada: '+C.crs);return;}
  if(!GeoMineCivil.readParams(C))return;
  if(!C.horizontalCurved){toast('Este eixo é anterior às curvas tangentes. Gere novamente com Alinhar A→B antes dos taludes.');return;}
  const el=id=>document.getElementById(id),
    opt={W:+((el('civW')||{}).value||C.W||8),
      angCorte:+((el('civAngC')||{}).value||60),
      angAterro:+((el('civAngA')||{}).value||34),
      H:+((el('civH')||{}).value||8),
      berma:Number(el('civBerma')?.value??3),
      passo:+((el('civPasso')||{}).value||1),
      maxOff:+((el('civMaxOff')||{}).value||120)};
  if(info)info.textContent='Marchando os taludes até encontrar o terreno…';
  const s=precomputed?.lados?precomputed:civSaia(R.d,C.eixo,opt);
  if(s.erro){toast(s.erro);if(info)info.textContent=s.erro;return;}
  const fields=[{name:'TIPO',type:'C',length:40},{name:'LADO',type:'C',length:10},
    {name:'BANCO',type:'N',length:6,decimal:0},{name:'ALTURA',type:'N',length:8,decimal:2},
    {name:'BERMA',type:'N',length:8,decimal:2},{name:'ANGULO',type:'N',length:8,decimal:2},
    {name:'CLASSE',type:'C',length:14}];
  const feats=[];let abertos=0,nBanc=0,curvas=0;
  const desenho=s.eixo||C.eixo;
  const põe=(pts,tipo,lado,banco,ang,classe,indexado=true,breakBefore=[])=>{
    if(!pts||pts.length<2)return;
    let part=[];
    const flush=()=>{if(part.length>1)feats.push({geom:part.map(p=>[p[0],p[1]]),multi:false,zg:part.map(p=>p[2]),props:{TIPO:tipo,LADO:lado,BANCO:banco,ALTURA:opt.H,BERMA:opt.berma,ANGULO:ang,CLASSE:classe}});part=[];};
    pts.forEach((p,i)=>{
      if(!p){flush();return;}
      if(breakBefore[i])flush();
      if(indexado&&part.length&&i>0){const a=desenho[i-1],b=desenho[i],q=part.at(-1),dx=b.x-a.x,dy=b.y-a.y;
        if((p[0]-q[0])*dx+(p[1]-q[1])*dy<0)flush();}
      part.push(p);
    });flush();
  };
  for(const lado of ['direita','esquerda']){
    const d=s.lados[lado];if(!d)continue;
    abertos+=d.aberto||0;curvas+=d.curva||0;
    põe(d.borda,'Borda da plataforma',lado,0,null,'civ-plataforma');
    for(const ch of Object.keys(d.bancos)){
      const [banco,tipo,modo]=ch.split('|');
      const ang=modo==='corte'?opt.angCorte:opt.angAterro;
      const indices=new Map(d.bancos[ch].flatMap((point,i)=>point?[[point.join('|'),i]]:[]));
      for(const part of d.bancoPartes[ch]){
        let previous=null;
        const breaks=part.map(point=>{
          const index=indices.get(point.join('|'));if(index==null)return false;
          let broken=!!d.breakBefore[index];
          if(previous!=null)for(let k=previous+1;k<=index;k++)broken=broken||!!d.breakBefore[k];
          previous=index;return broken;
        });
        põe(part,tipo+' '+banco,lado,+banco,ang,'civ-bancada',false,breaks);
      }
      nBanc++;
    }
    põe(d.inter,'Interseção talude × terreno',lado,null,null,'civ-inter',true,d.breakBefore);
  }
  if(!feats.length){toast('Nada a desenhar: o terreno já está no nível da estrada');return;}
  const ativa=S.activeId;
  let L=(S.layers||[]).find(q=>String(q.id)===String(C.slopesId)&&q._civilDesignId===C.id);
  if(L){L.features=feats;L.fields=fields;drawLayer(L);}
  else{
    L=addLayer({name:C.name+' — taludes (saia)',gtype:'line',crs:S.workCRS,
      features:feats,fields,color:'#8a5a2b'});
    L._civSaia=true;
  }
  L._civilDesignId=C.id;L.visible=true;C.slopesId=L.id;
  if(L.sym){
    L.sym.mode='cat';L.sym.field='CLASSE';L.sym.cats=[
      {value:'civ-plataforma',color:'#1f7ae0',weight:2.6},
      {value:'civ-bancada',color:'#8a5a2b',weight:1.8},
      {value:'civ-inter',color:'#111111',weight:2.6,dash:'9 4'}];
    drawLayer(L);
  }
  S.activeId=ativa;refreshUI();
  if(info)info.innerHTML='<b>Taludes desenhados.</b> '+nBanc+' linha(s) de bancada · '+
    'talude de corte '+opt.angCorte+'° · aterro '+opt.angAterro+'° · bancada '+
    opt.H+' m · berma '+opt.berma+' m'+
    (abertos?'<br><span style="color:var(--amber)">'+abertos+
      ' seção(ões) sem encontro válido com o MDT.</span>':'')+
    (curvas?'<br><span style="color:var(--amber)">'+curvas+' seção(ões) atingiram a convergência da curva. Aumente o raio ou ajuste o greide.</span>':'')+
    (s.refinementLimited?'<br>Contatos descontínuos no MDT foram separados em trechos.':'');
  toast('Saia desenhada até a interseção com o terreno');
}
/* marcadores visuais PERSISTENTES dos pontos A/B do alinhamento civil:
   camada própria (não é S.drawLayer, que outras ferramentas limpam) —
   um circleMarker + rótulo por ponto, redesenhados a cada nova marcação */
const CIV_PT_COR={A:'#37c0aa',B:'#f5a524'};
function civDesenhaPontos(){
  if(!S._civMarkers)S._civMarkers=L2.layerGroup([],{pane:'alagis_desenho'}).addTo(map);
  const grp=S._civMarkers;grp.clearLayers();
  const C=S._civ||{};
  ['A','B'].forEach(qual=>{
    const c=C[qual];if(!c)return;
    const ll=toWGS(S.workCRS,c[0],c[1]),latlng=[ll[1],ll[0]];
    L2.circleMarker(latlng,{radius:7,color:'#1a1206',weight:2,
      fillColor:CIV_PT_COR[qual],fillOpacity:1}).addTo(grp);
    L2.marker(latlng,{interactive:false,icon:L2.divIcon({className:'',
      html:'<div class="lbl" style="font-weight:700">'+qual+'</div>',
      iconAnchor:[-10,10]})}).addTo(grp);
  });
}
function civUpdateSteps(){
  const C=S._civ,busy=!!window.GeoMineRoadAlternatives?.busy(),ready=!!(C?.eixo?.length>1&&!C.alignmentPending&&!busy);
  const next=document.getElementById('civNextSteps');if(next)next.hidden=!ready;
  const generate=document.getElementById('btnCivAlinha');
  if(generate){generate.disabled=busy||!(C?.A&&C?.B);generate.textContent=busy?'Comparando traçados…':'Gerar 3 opções pelo MDT';}
  const cancel=document.getElementById('civCancelAlternatives');if(cancel)cancel.hidden=!busy;
  const confirmed=ready&&!!C.alignmentConfirmed;
  const stage=document.getElementById('civCorridorStage');if(stage)stage.hidden=!confirmed;
  for(const id of ['btnCivProfile','civConfirmAlignment','btnCivSaia','civCorridor']){const b=document.getElementById(id);if(b)b.disabled=(id==='btnCivProfile'||id==='civConfirmAlignment')?!ready:!confirmed;}
  const confirm=document.getElementById('civConfirmAlignment');if(confirm)confirm.hidden=confirmed;
}
function civMarcaPonto(qual){
  GeoMineCivil.current();
  if(typeof switchView==='function'&&S._view!=='map')switchView('map');
  setTool('select');
  const info=document.getElementById('civInfo');
  if(info)info.textContent='Toque no mapa para fixar o ponto '+qual+'…';
  rb31CapturaClique(ll=>{
    const c=fromWGS(S.workCRS,ll.lng,ll.lat);
    const C=GeoMineCivil.current();
    if(C.crs!==S.workCRS){toast('Volte ao CRS da estrada: '+C.crs);return;}
    C[qual]=[c[0],c[1]];
    C.alignmentPending=true;C.alignmentConfirmed=false;C.alternatives=null;window.GeoMineRoadAlternatives?.cancel();window.GeoMineRoadEditor?.close();window.GeoMineRoadAlternatives?.render(C);civUpdateSteps();
    civDesenhaPontos();
    const A=S._civ.A,B=S._civ.B;
    if(info)info.innerHTML='Ponto <b>'+qual+'</b>: E '+c[0].toFixed(2)+' · N '+c[1].toFixed(2)+
      (A&&B?' — pronto para alinhar.':' — marque o ponto '+(qual==='A'?'B':'A')+'.');
    toast('Ponto '+qual+' marcado');
  });
}
function refreshCivilMdt(){
 const el=document.getElementById('civMdtSel');if(!el)return;
 const rs=(S.rasters||[]).filter(r=>r.d),selected=el.value||S._civ?.params?.civMdtSel||'';
 el.innerHTML='<option value="">— selecione o MDT —</option>'+rs.map(r=>'<option value="'+r.id+'">'+esc(r.name)+'</option>').join('');
 if(selected&&rs.some(r=>String(r.id)===selected))el.value=selected;
 else if(rs.length===1)el.value=String(rs[0].id);
 else if(selected){el.add(new Option('MDT indisponível — selecione outro',selected));el.value=selected;}
}
function civMdt(){
 refreshCivilMdt();
 const rid=document.getElementById('civMdtSel')?.value;
 return (S.rasters||[]).find(r=>String(r.id)===rid&&r.d)||null;
}
// The first stage creates only the baseline. Road design constraints belong
// to profile editing and confirmation, not to drawing the A-B line.
function civEixoInicial(g,A,B){
 const length=Math.hypot(B[0]-A[0],B[1]-A[1]);
 if(!(length>.01))return {erro:'Escolha pontos A e B distintos.'};
 const za=civSample(g,A[0],A[1]),zb=civSample(g,B[0],B[1]);
 if(!Number.isFinite(za)||!Number.isFinite(zb))return {erro:'A ou B está fora das cotas válidas do MDT.'};
 const n=Math.min(10000,Math.max(1,Math.ceil(length/2))),caminho=[];
 for(let i=0;i<=n;i++){const t=i/n;caminho.push({x:A[0]+(B[0]-A[0])*t,y:A[1]+(B[1]-A[1])*t,z:za+(zb-za)*t});}
 return {caminho,comprimento:length,rampaMax:Math.abs(zb-za)/length,controls:[caminho[0],caminho[n]],raioMin:null};
}
async function civAlinha(){
  return window.GeoMineRoadAlternatives.compare();
}

/* Cada estrada conserva seus parâmetros, eixo e IDs das camadas. A receita
   é um objeto simples, independente do DOM/Leaflet, incluído no .ccmgis. */
(function(){
'use strict';
const defaults={civW:8,civG:8,civDz:2,civCrit:'terra',civRaioMin:60,civPasso:1,civAngC:60,civAngA:34,civH:8,civBerma:3,civMaxOff:120,civMdtSel:''};
const numeric={civW:[1,1e4],civG:[.5,30],civDz:[.5,1000],civRaioMin:[0,1e6],civPasso:[.25,1000],civAngC:[5,89],civAngA:[5,89],civH:[.5,1e4],civBerma:[0,1e4],civMaxOff:[5,1e5]};
const state=()=>S.civil||(S.civil={version:1,roads:[],activeId:null});
function sync(){
 const s=state(),select=document.getElementById('civRoadSel');
 if(select){select.innerHTML='<option value="">— nova estrada —</option>'+s.roads.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.name)+'</option>').join('');select.value=s.activeId||'';}
 const name=document.getElementById('civRoadName');if(name)name.value=S._civ?.name||'';
 civUpdateSteps();window.GeoMineRoadAlternatives?.render(S._civ);
}
function readParams(road,validate=true){
 const params={};
 for(const [id,def] of Object.entries(defaults)){
  const el=document.getElementById(id),v=el?el.value:def;
  params[id]=numeric[id]?Number(v):String(v);
  if(validate&&numeric[id]&&(v===''||!Number.isFinite(params[id])||params[id]<numeric[id][0]||params[id]>numeric[id][1])){
   toast('Valor inválido: '+(el?.previousElementSibling?.textContent||id));el?.focus();return false;
  }
 }
 road.params=params;const name=document.getElementById('civRoadName')?.value.trim();if(name)road.name=name;
 return true;
}
function show(road){
 window.GeoMineRoadAlternatives?.cancel();
 window.GeoMineRoadEditor?.close();
 S._civ=road||null;
 if(window.GeoMineCorridor)GeoMineCorridor.show(road);
 for(const [id,def] of Object.entries(defaults)){const el=document.getElementById(id);if(el)el.value=road?.params?.[id]??def;}
 if(road&&!document.getElementById('civMdtSel')?.value&&road.params?.civMdtSel){
  const el=document.getElementById('civMdtSel');el?.add(new Option('MDT indisponível — selecione outro',road.params.civMdtSel));if(el)el.value=road.params.civMdtSel;
 }
 refreshCivilMdt();sync();civDesenhaPontos();
}
function create(){
 if(S._civ)readParams(S._civ,false);
 const s=state(),r={id:'civil-'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2)),name:'Estrada '+(s.roads.length+1),crs:S.workCRS,params:{...defaults}};
 s.roads.push(r);s.activeId=r.id;show(r);return r;
}
function current(){
 if(S._civ)return S._civ;
 const pending={};readParams(pending,false);
 const r=create();r.params=pending.params;if(pending.name)r.name=pending.name;show(r);return r;
}
function snapshot(){
 if(S._civ)readParams(S._civ,false);
 return JSON.parse(JSON.stringify(state()));
}
function reset(){
 window.GeoMineRoadAlternatives?.cancel();
 if(S._civMarkers)S._civMarkers.clearLayers();
 S._civ=null;S.civil={version:1,roads:[],activeId:null};civUpdateSteps();
}
function restore(data){
 reset();
 if(data?.version===1&&Array.isArray(data.roads)){
  const ids=new Set();
  S.civil.roads=data.roads.filter(r=>r&&typeof r.id==='string'&&!ids.has(r.id)&&ids.add(r.id)).map(r=>({
   id:r.id,name:String(r.name||'Estrada'),crs:r.crs||S.workCRS,
   A:Array.isArray(r.A)&&r.A.length===2&&r.A.every(Number.isFinite)?r.A.slice():null,
   B:Array.isArray(r.B)&&r.B.length===2&&r.B.every(Number.isFinite)?r.B.slice():null,
   eixo:Array.isArray(r.eixo)?r.eixo.filter(p=>p&&[p.x,p.y,p.z].every(Number.isFinite)).map(p=>({x:p.x,y:p.y,z:p.z})):[],
   W:Number.isFinite(r.W)?r.W:8,alignmentId:r.alignmentId??null,slopesId:r.slopesId??null,params:{...defaults,...r.params},
   corridorSettings:r.corridorSettings||null,previousGrade:r.previousGrade||null,horizontalCurved:!!r.horizontalCurved,
   horizontalControls:r.horizontalControls||null,verticalDesign:r.verticalDesign||null,alignmentPending:!!r.alignmentPending,alignmentConfirmed:!!r.alignmentConfirmed,alternatives:r.alternatives||null,selectedAlternative:r.selectedAlternative??null
  }));
  S.civil.activeId=S.civil.roads.some(r=>r.id===data.activeId)?data.activeId:S.civil.roads[0]?.id||null;
 }
 show(S.civil.roads.find(r=>r.id===S.civil.activeId)||null);
}
window.GeoMineCivil={current,readParams,snapshot,restore,reset,sync,create};
civUpdateSteps();
document.getElementById('civConfirmAlignment').onclick=()=>{const C=current();if(C.alignmentPending||!C.eixo||C.eixo.length<2)return;const R=civMdt();if(!R){toast('Selecione o MDT base antes de confirmar.');return;}if(!readParams(C))return;for(let i=0;i<C.eixo.length;i++){const p=C.eixo[i];if(!Number.isFinite(civSample(R.d,p.x,p.y))){toast('O eixo sai do MDT. Ajuste o alinhamento antes de confirmar.');return;}if(i){const a=C.eixo[i-1],d=Math.hypot(p.x-a.x,p.y-a.y);if(d<=0||Math.abs(p.z-a.z)>C.params.civG/100*d+1e-7){toast('Ajuste o greide: a rampa excede o máximo de '+C.params.civG+'%.');return;}}}C.alignmentConfirmed=true;civUpdateSteps();toast('Alinhamento confirmado. Defina a seção e gere o corredor.');};
document.getElementById('civRoadNew').onclick=create;
document.getElementById('civRoadSel').onchange=e=>{
 if(S._civ)readParams(S._civ,false);
 if(!e.target.value){create();return;}
 state().activeId=e.target.value;show(state().roads.find(r=>r.id===state().activeId));
};
document.getElementById('civRoadName').onchange=()=>{readParams(current(),false);sync();};
})();
