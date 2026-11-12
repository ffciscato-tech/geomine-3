/* ==================== CAVA — bancos, bermas e encontro com o terreno =========
   Adaptação do gerador geométrico do MODELAGEM 3D. A linha inicial é o fundo
   da cava; cada talude muda a cota e cada berma mantém a cota. Quando existe
   MDT, as linhas são densificadas e terminam exatamente no daylight.          */
function cavaPoligonos(){
  const out=[];
  (S.layers||[]).forEach(L=>{
    /* Produtos da propria cava nunca podem reaparecer como candidatos a
       limite superior. Reutiliza-los acumulava offsets a cada regeneracao.
       Vale tambem para a pilha 3.1: as cristas/pes/bermas da camada unica
       (e dos aneis cortados pelo MDT) sao SAIDAS do gerador — inundavam o
       seletor com dezenas de "feicao N (linha fechada)". */
    if(L.cavaDesign||L._cavaRampOf||L._cavaControl||L._cavaFreezeOf||
       L._rb31Recipe||L._cavaMdtCutOf||L._rb31CutOf||L._cavaCutVectorOf||
       L._cavaCutMode)return;
    /* SÓ O QUE ESTÁ NO DESENHO: camada com o olho desligado não é
       candidata a limite — a lista enchia de camadas ocultas (BACIAS,
       Caixas…) que "já não estão no desenho". Para usar uma delas,
       basta ligar a visibilidade. */
    if(L.visible===false)return;
    if(L.gtype!=='polygon'&&L.gtype!=='line') return;
    (L.features||[]).forEach((f,i)=>{
      if(!f||!f.geom) return;
      let ring=Array.isArray(f.geom[0]?.[0])?f.geom[0]:f.geom;
      if(!ring||ring.length<3)return;
      /* Uma camada ◈ já foi validada como limite de trabalho. Mesmo que a
         feição line não repita o primeiro ponto no fim (metadado "aberta"),
         ela entra no seletor; o motor fecha apenas o anel de cálculo. */
      const fechada=!!L._cavaLimiteDin||L.gtype==='polygon'||
        Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<1e-7;
      if(fechada){
        const ic=L._cavaLimiteDin?'◈ ':
          ((S.layers||[]).some(x=>x._cavaLimiteDin&&String(x._cavaLimiteOrig)===String(L.id))?'◇ referência · ':'');
        out.push({L,f,i,label:`${ic}${L.name} · feição ${i+1}${L._cavaLimiteDin?
          ' (limite paramétrico)':(L.gtype==='line'?' (linha fechada)':'')}`});
      }
    });
  });
  return out;
}
function cavaRingWork(item){
  let r=Array.isArray(item.f.geom[0]?.[0])?item.f.geom[0]:item.f.geom;
  r=r.map(p=>reproj(item.L.crs,S.workCRS,p[0],p[1]));
  if(r.length>2 && Math.hypot(r[0][0]-r[r.length-1][0],r[0][1]-r[r.length-1][1])<1e-7) r.pop();
  return r;
}
function cavaArea2(r){
  let a=0; for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length];a+=p[0]*q[1]-q[0]*p[1];} return a;
}
function cavaOffset(r,dist){
  if(!r||r.length<3||!dist) return (r||[]).map(p=>p.slice());
  const n=r.length, ccw=cavaArea2(r)>0, sgn=ccw?1:-1, out=[];
  const normal=i=>{const a=r[i],b=r[(i+1)%n],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1;return [dy/L*sgn,-dx/L*sgn];};
  /* Um chanfro reto entre A e B fica cada vez maior quando o afastamento e
     acumulado. Em cantos agudos ele aparecia como uma aresta solta cruzando
     varios bancos. O encontro limitado passa a ser um arco do proprio
     offset: nenhum segmento artificial atravessa a cava. */
  const juntaArredondada=(P,A,B)=>{
    const raio=Math.abs(dist);if(!(raio>1e-9))return [A,B];
    const a0=Math.atan2(A[1]-P[1],A[0]-P[0]),
      a1=Math.atan2(B[1]-P[1],B[0]-P[0]),
      da=Math.atan2(Math.sin(a1-a0),Math.cos(a1-a0)),
      arco=Math.abs(da)*raio,
      partes=Math.max(2,Math.min(48,Math.ceil(Math.max(Math.abs(da)/(Math.PI/18),arco/2)))),
      pts=[];
    for(let k=0;k<=partes;k++){
      const a=a0+da*k/partes;
      pts.push([P[0]+raio*Math.cos(a),P[1]+raio*Math.sin(a)]);
    }
    return pts;
  };
  for(let i=0;i<n;i++){
    const ip=(i+n-1)%n, na=normal(ip),nb=normal(i), P=r[i];
    const A=[P[0]+na[0]*dist,P[1]+na[1]*dist],B=[P[0]+nb[0]*dist,P[1]+nb[1]*dist];
    const ea=[P[0]-r[ip][0],P[1]-r[ip][1]], eb=[r[(i+1)%n][0]-P[0],r[(i+1)%n][1]-P[1]];
    const den=ea[0]*eb[1]-ea[1]*eb[0];
    let x=B[0],y=B[1];
    if(Math.abs(den)>1e-10){
      const t=((B[0]-A[0])*eb[1]-(B[1]-A[1])*eb[0])/den;
      x=A[0]+ea[0]*t; y=A[1]+ea[1]*t;
      const dx=x-P[0],dy=y-P[1],m=Math.hypot(dx,dy),
        turn=ea[0]*eb[1]-ea[1]*eb[0],
        /* Só a quina EXTERNA pode ser chanfrada. Chanfrar a quina interna
           faz o segmento atravessar o próprio anel. */
        outerJoin=turn*dist>0,
        /* Interseções de paralelas em quinas fechadas criavam os “spikes”.
           O limite curto mantém quinas normais; acima dele fazemos um
           chanfro real com as duas pontas dos segmentos deslocados. */
        lim=Math.abs(dist)*1.50+1e-6;
      if(outerJoin&&m>lim){
        for(const q of juntaArredondada(P,A,B)){
          const u=out.at(-1);
          if(!u||Math.hypot(q[0]-u[0],q[1]-u[1])>.01)out.push(q);
        }
        continue;
      }
    }
    out.push([x,y]);
  }
  return out;
}
function cavaOffsetRadial(r,dist){
  /* Última proteção para polígonos irregulares: conserva exatamente a forma
     angular do limite e altera apenas sua escala em torno do centroide. Não
     suaviza nem cria curvas; é usada somente quando uma quina faz o offset
     ortogonal comum se auto-intersectar. */
  if(!r||r.length<3)return[];
  let cx=0,cy=0;for(const p of r){cx+=p[0];cy+=p[1];}cx/=r.length;cy/=r.length;
  const re=Math.sqrt(Math.abs(cavaArea2(r))/2/Math.PI),k=(re+dist)/re;
  if(!(k>.025))return[];
  return r.map(p=>[cx+(p[0]-cx)*k,cy+(p[1]-cy)*k]);
}
function cavaOffsetValido(base,next,expand){
  if(!next||next.length<3||Math.abs(cavaArea2(next))<1||cavaRingCruza(next))return false;
  const a0=Math.abs(cavaArea2(base)),a1=Math.abs(cavaArea2(next));
  return expand?a1>a0:a1<a0;
}
function cavaDistAoAnel(p,r){
  let bd=Infinity;
  for(let i=0;i<r.length;i++){
    const a=r[i],b=r[(i+1)%r.length],dx=b[0]-a[0],dy=b[1]-a[1],q=dx*dx+dy*dy,
      t=Math.max(0,Math.min(1,q?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/q:0)),
      x=a[0]+dx*t,y=a[1]+dy*t,d=(p[0]-x)**2+(p[1]-y)**2;
    if(d<bd)bd=d;
  }
  return Math.sqrt(bd);
}
/* Paralela interna APARADA por distância: o lugar geométrico correto do
   offset é o conjunto de pontos a distância exatamente |req| do limite.
   Qualquer ponto do offset bruto mais PERTO do que isso é resíduo de laço
   (ponta que colapsou, lâmina no eixo medial) e é removido; os
   sobreviventes, em ordem, formam o anel aparado. Robusto onde o corte de
   laços por interseção falha (múltiplos laços, anéis-lâmina). */
function cavaAparaParalela(refRing,rawPts,req,tol){
  const keep=[];
  for(let i=0;i<rawPts.length;i++){
    const need=Math.abs(Array.isArray(req)?req[i]:req);
    if(need<1e-9){keep.push(rawPts[i]);continue;}
    if(cavaDistAoAnel(rawPts[i],refRing)>=need-tol)keep.push(rawPts[i]);
  }
  return keep;
}
/* Afina um anel DENSO preservando a forma: corda gulosa com erro máximo
   eps. Diferente do cavaLimpaRing (limiar fixo de 0,02, pensado p/ anéis
   esparsos), aqui o erro é controlado — arcos densos não são engolidos. */
function cavaAfinaAnel(r,eps){
  if(!r||r.length<8)return r||[];
  const n=r.length,out=[];
  let i=0;
  while(i<n){
    let j=i+2;
    for(;j<=Math.min(n,i+240);j++){
      const a=r[i],b=r[j%n];
      const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1;
      let ok=true;
      for(let k=i+1;k<j;k++){
        const p=r[k%n],
          d=Math.abs(dx*(p[1]-a[1])-dy*(p[0]-a[0]))/L;
        if(d>eps){ok=false;break;}
      }
      if(!ok)break;
    }
    out.push([r[i][0],r[i][1]]);
    i=Math.max(i+1,j-1);
  }
  return out;
}
/* Remove espigões de anel (viradas > ~100° — sujeira de costura/laço).
   Quinas legítimas de projeto (até 90°) são preservadas. */
function cavaDespiga(r,maxAng){
  if(!r||r.length<5)return r;
  const lim=Math.cos((maxAng||100)*Math.PI/180);
  for(let pass=0;pass<5;pass++){
    let rem=false;
    for(let i=0;i<r.length&&r.length>4;i++){
      const a=r[(i-1+r.length)%r.length],p=r[i],b=r[(i+1)%r.length],
        v1x=p[0]-a[0],v1y=p[1]-a[1],v2x=b[0]-p[0],v2y=b[1]-p[1],
        l1=Math.hypot(v1x,v1y),l2=Math.hypot(v2x,v2y);
      if(l1<1e-9||l2<1e-9){r.splice(i,1);i--;rem=true;continue;}
      const co=(v1x*v2x+v1y*v2y)/(l1*l2);
      if(co<lim){r.splice(i,1);i--;rem=true;}
    }
    if(!rem)break;
  }
  return r;
}
/* AFASTAMENTO FIEL AO PROJETO.
   Todo vértice de um anel deve estar a |total| do limite original — é a
   definição do afastamento acumulado. Medido na cava paramétrica com o limite
   real (talude 55°, H 12, berma 6): a berma saía de 0,63 m a 39,03 m em vez
   dos 6,00 m pedidos, e o recuo do talude de 1,07 m a 10,45 m em vez de 8,40.
   Berma de 0,63 m não é berma, e recuo de 1,07 m para 12 m de altura é um
   talude de 85° onde o projeto pede 55° — os dois lados importam.
   Aqui cada vértice fora da faixa é reprojetado para a distância de projeto,
   na direção dele mesmo: o que estourou volta (quina chanfrada), o que
   encolheu é empurrado para fora (berma recomposta). */
function cavaAfastamentoFiel(nova,base,dist,folgaMax,folgaMin){
  if(!nova||!base||!(dist>0))return nova;
  const teto=dist*(folgaMax||1.2), piso=dist*(folgaMin||0.98);
  return nova.map(p=>{
    const d=cavaDistAoAnel(p,base);
    if(!Number.isFinite(d)||(d<=teto&&d>=piso))return p;
    let q=null,bd=Infinity;
    for(let i=0;i<base.length;i++){
      const a=base[i],b=base[(i+1)%base.length],dx=b[0]-a[0],dy=b[1]-a[1],
        qq=dx*dx+dy*dy,
        t=Math.max(0,Math.min(1,qq?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/qq:0)),
        x=a[0]+dx*t,y=a[1]+dy*t,dd=(p[0]-x)**2+(p[1]-y)**2;
      if(dd<bd){bd=dd;q=[x,y];}
    }
    if(!q)return p;
    const L=Math.hypot(p[0]-q[0],p[1]-q[1]);
    if(!(L>1e-9))return p;                 // sobre o próprio anel: sem direção
    return [q[0]+(p[0]-q[0])/L*dist, q[1]+(p[1]-q[1])/L*dist];
  });
}
function cavaOffsetSeguro(original,atual,passo,total,expand){
  /* Todas as linhas são paralelas ao MESMO limite superior. O afastamento
     usado aqui é acumulado (talude + berma + talude...), nunca o resultado
     geométrico do banco anterior. Isso impede que um pequeno chanfro de uma
     quina se propague e altere a largura das bermas seguintes. */
  const fiel=r=>cavaLimpaRing(cavaAfastamentoFiel(r,original,Math.abs(total)));
  let q=fiel(cavaDespiga(cavaLimpaRing(cavaOffset(original,total))));
  if(cavaOffsetValido(original,q,expand))return{ring:q,modo:'direto'};
  /* Quando o afastamento supera o raio de curvatura de uma ponta, a
     paralela se auto-intersecta (laço de andorinha). O CERTO é cortar o
     laço e conservar o paralelismo em todo o resto — nunca escalar o anel
     pelo centroide: numa cava alongada a escala movia as pontas demais e
     os flancos de menos, amontoando cristas e pés (linhas a 1–2 px). */
  if(q.length>3){
    const per=cavaChain(original).at(-1),passoD=Math.max(.4,per/1500),
      rd=cavaDensifica(original,passoD),
      raw=cavaOffsetVariavel(rd,rd.map(()=>total)),
      tol=Math.max(Math.abs(total)*.02,passoD*.9);
    let ap=cavaAparaParalela(original,raw,total,tol);
    /* dedup leve + afinamento com erro controlado (preserva os arcos) */
    const dd=[];ap.forEach(p=>{if(!dd.length||Math.hypot(p[0]-dd.at(-1)[0],p[1]-dd.at(-1)[1])>.03)dd.push(p);});
    ap=cavaDespiga(cavaAfinaAnel(dd,passoD*.25));
    if(ap.length>3&&cavaRingCruza(ap))ap=cavaDeloop(ap);
    ap=fiel(ap);
    if(cavaOffsetValido(original,ap,expand))return{ring:ap,modo:'direto-aparado'};
  }
  /* Se ainda falhar, tenta o passo a partir do último anel válido. */
  q=fiel(cavaLimpaRing(cavaOffset(atual,passo)));
  if(cavaOffsetValido(atual,q,expand))return{ring:q,modo:'incremental'};
  /* Últimas recuperações (raras): escala angular. Mantidas apenas como
     rede de segurança para anéis já degenerados. */
  q=fiel(cavaLimpaRing(cavaOffsetRadial(atual,passo)));
  if(cavaOffsetValido(atual,q,expand))return{ring:q,modo:'radial'};
  q=fiel(cavaLimpaRing(cavaOffsetRadial(original,total)));
  if(cavaOffsetValido(original,q,expand))return{ring:q,modo:'radial-acumulado'};
  return{ring:[],modo:'falhou'};
}
function cavaSegInter(a,b,c,d){
  const o=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const ab1=o(a,b,c),ab2=o(a,b,d),cd1=o(c,d,a),cd2=o(c,d,b),eps=1e-7;
  return ((ab1>eps&&ab2<-eps)||(ab1<-eps&&ab2>eps))&&
         ((cd1>eps&&cd2<-eps)||(cd1<-eps&&cd2>eps));
}
function cavaRingCruza(r){
  const n=r?.length||0;if(n<4)return false;
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
    if(j===i||j===(i+1)%n||i===(j+1)%n)continue;
    if(cavaSegInter(r[i],r[(i+1)%n],r[j],r[(j+1)%n]))return true;
  }
  return false;
}
function cavaExtremosZ(r,g){
  if(!g||!r.length) return {min:NaN,max:NaN,pMax:null,n:0,vertexMax:NaN,pVertexMax:null};
  const xs=r.map(p=>p[0]),ys=r.map(p=>p[1]),cs=g.cs,csy=g.csy||cs;
  const c0=Math.max(0,Math.floor((Math.min(...xs)-g.xll)/cs-.5));
  const c1=Math.min(g.nc-1,Math.ceil((Math.max(...xs)-g.xll)/cs-.5));
  const r0=Math.max(0,Math.floor((g.nr-.5)-(Math.max(...ys)-g.yll)/csy));
  const r1=Math.min(g.nr-1,Math.ceil((g.nr-.5)-(Math.min(...ys)-g.yll)/csy));
  const idx=indiceAnel(r); let min=Infinity,max=-Infinity,pMax=null,n=0;
  /* O coroamento nunca ignora um vértice. A varredura das células internas
     representa o terreno contido pela poligonal; esta amostragem explícita
     garante que um pico localizado exatamente num vértice também prevaleça. */
  let pMin=null,vertexMax=-Infinity,pVertexMax=null;
  for(const p of r){
    const v=sampleZbil(g,p[0],p[1]);
    if(!Number.isFinite(v))continue;
    if(v<min){min=v;pMin=[p[0],p[1]];}
    if(v>max){max=v;pMax=[p[0],p[1]];}
    if(v>vertexMax){vertexMax=v;pVertexMax=[p[0],p[1]];}
    n++;
  }
  for(let rr=r0;rr<=r1;rr++){const y=g.yll+(g.nr-.5-rr)*csy;
    for(let c=c0;c<=c1;c++){const x=g.xll+(c+.5)*cs;
      if(pointInRing(x,y,r,idx)){const v=g.z[rr*g.nc+c];if(Number.isFinite(v)){
        n++; if(v<min){min=v;pMin=[x,y];} if(v>max){max=v;pMax=[x,y];}
      }}
    }
  }
  if(!n){for(const p of cavaDensifica(r,Math.max(.5,Math.min(3,cs||1)))){
    const v=sampleZbil(g,p[0],p[1]);if(!Number.isFinite(v))continue;
    n++;if(v<min){min=v;pMin=[p[0],p[1]];}if(v>max){max=v;pMax=[p[0],p[1]];}
  }}
  return {min:Number.isFinite(min)?min:NaN,max:Number.isFinite(max)?max:NaN,pMin,pMax,n,
    vertexMax:Number.isFinite(vertexMax)?vertexMax:NaN,pVertexMax};
}
function cavaArredondaCota(z,passo,referencia='max'){
  passo=Math.max(.1,Math.abs(+passo||5));
  if(!Number.isFinite(z))return NaN;
  /* epsilon evita que uma cota já múltipla salte para o próximo intervalo.
     Cava adota o teto; pilha adota o piso, sempre do lado conservador. */
  return referencia==='min'
    ?Math.floor((z+1e-8)/passo)*passo
    :Math.ceil((z-1e-8)/passo)*passo;
}
function cavaGravaCotaLimite(item,z){
  if(!item||!item.f||!Number.isFinite(z))return;
  const f=item.f,nested=!!(f.multi&&Array.isArray(f.geom&&f.geom[0]&&f.geom[0][0]));
  if(nested)f.zg=(f.geom||[]).map(r=>(r||[]).map(()=>z));
  else f.zg=(f.geom||[]).map(()=>z);
  f.props=f.props||{};f.props.COTA_SUP=+z.toFixed(3);
  item.L.fields=item.L.fields||[];
  if(!item.L.fields.some(q=>q.name==='COTA_SUP'))
    item.L.fields.push({name:'COTA_SUP',type:'N',length:14,decimal:3});
  try{drawLayer(item.L);}catch(_){}
}
function cavaDensifica(r,passo){
  const out=[]; passo=Math.max(.2,passo||2);
  for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/passo));
    for(let k=0;k<n;k++)out.push([a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n]);
  }
  return out;
}
function cavaCortaNoMdt(r,z,g,modoUp){
  if(!g) return {partes:[r],cortes:[]};
  const d=cavaDensifica(r,Math.max(.35,Math.min(2,g.cs||1))), pts=d.concat([d[0]]);
  const partes=[],cortes=[]; let atual=[];
  const diff=p=>{const v=sampleZbil(g,p[0],p[1]);return Number.isFinite(v)?(modoUp?z-v:v-z):NaN;};
  /* A fronteira do recorte e a linha de daylight usam a MESMA igualdade
     Zprojeto = ZMDT. A antiga folga de -0,02 m deslocava os extremos das
     cristas/pés e fazia a interseção parecer solta, embora os dois cálculos
     estivessem próximos. O epsilon abaixo serve apenas ao ruído de ponto
     flutuante; a bisseção continua resolvendo a raiz geométrica. */
  const epsZ=1e-9;
  let da=diff(pts[0]),ina=Number.isFinite(da)&&da>=-epsZ;
  if(ina)atual=[pts[0]];
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i],db=diff(b),inb=Number.isFinite(db)&&db>=-epsZ;
    if(ina!==inb && Number.isFinite(da)&&Number.isFinite(db)){
      const t=Math.max(0,Math.min(1,da/(da-db))),q=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
      cortes.push(q);
      if(ina){atual.push(q);if(atual.length>1)partes.push(atual);atual=[];}
      else atual=[q];
    }
    if(inb)atual.push(b);
    da=db; ina=inb;
  }
  if(atual.length>1)partes.push(atual);
  if(partes.length>1){
    const A=partes[0],B=partes[partes.length-1];
    if(Math.hypot(A[0][0]-B[B.length-1][0],A[0][1]-B[B.length-1][1])<Math.max(.5,g.cs||1)){
      partes[0]=B.concat(A.slice(1)); partes.pop();
    }
  }
  return {partes,cortes};
}
function cavaRecortaFeicaoNoMdt(f,g,modoUp,passo){
  const src=f&&f.geom||[];if(!g||src.length<2)return[];
  const cotaProp=Number.isFinite(+f.props?.COTA)?+f.props.COTA:NaN,
    zsrc=src.map((p,i)=>Number.isFinite(+f.zg?.[i])?+f.zg[i]:
      (Number.isFinite(+p[2])?+p[2]:cotaProp));
  if(!zsrc.some(Number.isFinite))return[];
  for(let i=1;i<zsrc.length;i++)if(!Number.isFinite(zsrc[i]))zsrc[i]=zsrc[i-1];
  for(let i=zsrc.length-2;i>=0;i--)if(!Number.isFinite(zsrc[i]))zsrc[i]=zsrc[i+1];
  const fechado=Math.hypot(src[0][0]-src.at(-1)[0],src[0][1]-src.at(-1)[1])<1e-7,
    maxPasso=Math.max(.2,passo||Math.min(1,g.cs||1)),pts=[];
  for(let i=1;i<src.length;i++){
    const a=src[i-1],b=src[i],za=zsrc[i-1],zb=zsrc[i],
      n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/maxPasso));
    if(!pts.length)pts.push([a[0],a[1],za]);
    for(let k=1;k<=n;k++){
      const t=k/n;pts.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,za+(zb-za)*t]);
    }
  }
  if(pts.length<2)return[];
  const dif=p=>{const t=sampleZbil(g,p[0],p[1]);
    return Number.isFinite(t)?(modoUp?p[2]-t:t-p[2]):NaN;},
    /* Sem tolerância construtiva: o extremo retornado deve ser literalmente
       o mesmo nó analítico usado pela interseção cava × MDT. */
    dentro=p=>{const d=dif(p);return Number.isFinite(d)&&d>=-1e-9;},
    fronteira=(a,b,estadoA)=>{
      let lo=a.slice(),hi=b.slice();
      for(let n=0;n<30;n++){
        const m=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2];
        if(dentro(m)===estadoA)lo=m;else hi=m;
      }
      return [(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2];
    };
  const runs=[];let atual=dentro(pts[0])?[pts[0].slice()]:[];
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i],ia=dentro(a),ib=dentro(b);
    if(ia===ib){if(ib){if(!atual.length)atual=[a.slice()];atual.push(b.slice());}continue;}
    const x=fronteira(a,b,ia);
    if(ia){atual.push(x);if(atual.length>1)runs.push(atual);atual=[];}
    else atual=[x,b.slice()];
  }
  if(atual.length>1)runs.push(atual);
  if(fechado&&runs.length>1){
    const A=runs[0],B=runs.at(-1);
    if(Math.hypot(A[0][0]-B.at(-1)[0],A[0][1]-B.at(-1)[1])<=maxPasso*1.1){
      runs[0]=B.concat(A.slice(1));runs.pop();
    }
  }
  return runs.filter(r=>r.length>1).map(r=>({
    geom:r.map(p=>[p[0],p[1]]),multi:false,zg:r.map(p=>p[2]),
    props:{...(f.props||{}),CLASSE:'cava-cortada'}}));
}
/* Recalcula o produto visível SEM mutilar a geometria de projeto. Cada
   crista/pé nasce de um anel completo, fechado independentemente, e somente
   depois é classificado por projeto Z × MDT. Isso elimina o erro de tratar
   como anel os pedaços que já haviam sido cortados e fecha o segmento final
   inclusive em arquivos antigos que não repetiam o primeiro vértice. */
function cavaAnelFechadoFeature(f){
  if(!f||!Array.isArray(f.geom)||f.geom.length<3)return null;
  const geom=f.geom.map(p=>[+p[0],+p[1]]),z0=Array.isArray(f.zg)?f.zg.slice():[],
    cota=Number.isFinite(+f.props?.COTA)?+f.props.COTA:
      (Number.isFinite(+f.props?.COTA_MIN)?+f.props.COTA_MIN:NaN);
  const zg=geom.map((p,i)=>Number.isFinite(+z0[i])?+z0[i]:
    (Number.isFinite(+f.geom[i]?.[2])?+f.geom[i][2]:cota));
  if(Math.hypot(geom[0][0]-geom.at(-1)[0],geom[0][1]-geom.at(-1)[1])>1e-7){
    geom.push(geom[0].slice());zg.push(zg[0]);
  }else{geom[geom.length-1]=geom[0].slice();zg[zg.length-1]=zg[0];}
  if(!zg.some(Number.isFinite))return null;
  return {...f,geom,multi:false,zg,props:{...(f.props||{})}};
}
function cavaEhAnelProjeto(f){
  const t=String(f?.props?.TIPO||''),c=String(f?.props?.CLASSE||'');
  return /^(Limite superior|Pé de banco|Crista de banco|Limite \((crista|pé)|Pé banco|Crista banco|Berma banco)/i.test(t)||
    ['rb31-crista','rb31-pe'].includes(c);
}
function cavaRecortaAneisFechadosNoMdt(feats,g,modoUp,passo){
  const out=[],aneis=[],inter=[];let processados=0,partes=0,descartados=0;
  for(const f of feats||[]){
    if(!cavaEhAnelProjeto(f)){
      const classe=String(f?.props?.CLASSE||''),tipo=String(f?.props?.TIPO||''),
        ehInter=tipo==='Interseção cava × terreno'||['daylight','rb31-inter'].includes(classe),
        temZ=Array.isArray(f?.zg)&&f.zg.some(Number.isFinite);
      /* A rampa e demais linhas auxiliares continuam no mesmo produto e
         obedecem ao mesmo corte. A interseção antiga, por outro lado, nunca é
         reaproveitada: ela será calculada novamente a partir dos anéis. */
      if(!ehInter&&Array.isArray(f?.geom)&&f.geom.length>1&&temZ){
        const rs=cavaRecortaFeicaoNoMdt(f,g,!!modoUp,passo);
        rs.forEach(q=>{q.props={...(f.props||{}),CLASSE:classe||'cava-cortada'};out.push(q);partes++;});
      }else if(!ehInter)out.push(f);
      continue;
    }
    const anel=cavaAnelFechadoFeature(f);
    if(!anel){out.push(f);continue;}
    aneis.push(anel);processados++;
    const rs=cavaRecortaFeicaoNoMdt(anel,g,!!modoUp,passo);
    if(!rs.length){descartados++;continue;}
    rs.forEach(q=>{q.props={...(anel.props||{}),CLASSE:'cava-cortada'};out.push(q);partes++;});
  }
  /* A interseção é novamente derivada dos MESMOS anéis e da MESMA
     topografia; não se reaproveita a curva que veio de outro raster. */
  const linhas=aneis.map(f=>{
    const ring=f.geom.slice(0,-1).map(p=>p.slice()),zs=(f.zg||[]).filter(Number.isFinite),
      z=Number.isFinite(+f.props?.COTA)?+f.props.COTA:(zs.length?zs.reduce((a,b)=>a+b,0)/zs.length:NaN);
    return {ring,z,bench:+f.props?.BANCO||0};
  }).filter(q=>q.ring.length>=3&&Number.isFinite(q.z));
  if(linhas.length>=2){
    linhas.sort((a,b)=>modoUp?a.z-b.z:b.z-a.z);
    const cotas=linhas.map(q=>q.z),H=Math.max(.1,...cotas.slice(1).map((z,i)=>Math.abs(z-cotas[i])).filter(x=>x>.01));
    (cavaIntersecaoSuperficies(linhas,g,H,!!modoUp)||[]).forEach(s=>inter.push({geom:s.geom,multi:false,zg:s.zg,
      props:{TIPO:'Interseção cava × terreno',BANCO:null,COTA:null,ALTURA:H,BERMA:null,
        ANGULO:null,CLASSE:'daylight',METODO:'superfície por anéis × MDT'}}));
  }
  const semInter=out.filter(f=>String(f?.props?.TIPO||'')!=='Interseção cava × terreno'&&
    !['daylight','rb31-inter'].includes(String(f?.props?.CLASSE||'')));
  semInter.push(...inter);
  cavaForcaExtremosNaIntersecao(semInter,inter,g);
  cavaSoldaRecorteNaIntersecao(semInter,inter,g);
  cavaSoldaIntersecaoAneis(semInter,Math.max(1e-8,(g?.cs||1)*1e-8));
  return {feats:cavaFeatsSemDuplicar(semInter),processados,partes,descartados,intersecoes:inter.length};
}
/* Recorta também a ÁREA preenchida da rampa pela mesma igualdade projeto ×
   MDT usada nas linhas. Cada arco interno do contorno é fechado exatamente
   entre os dois cruzamentos; assim nenhuma faixa dourada permanece além da
   interseção apenas porque estava em um layer poligonal separado. */
function cavaRecortaPoligonoNoMdt(f,g,modoUp,passo){
  const src=(f&&f.geom||[]).map(p=>p.slice()),zs=(f&&f.zg||[]).slice();
  if(!g||src.length<3)return[];
  if(Math.hypot(src[0][0]-src.at(-1)[0],src[0][1]-src.at(-1)[1])<1e-7){
    src.pop();if(zs.length>src.length)zs.pop();
  }
  if(src.length<3)return[];
  const cota=Number.isFinite(+f.props?.COTA)?+f.props.COTA:NaN,zv=src.map((p,i)=>
    Number.isFinite(+zs[i])?+zs[i]:(Number.isFinite(+p[2])?+p[2]:cota));
  for(let i=1;i<zv.length;i++)if(!Number.isFinite(zv[i]))zv[i]=zv[i-1];
  for(let i=zv.length-2;i>=0;i--)if(!Number.isFinite(zv[i]))zv[i]=zv[i+1];
  if(!zv.some(Number.isFinite))return[];
  const ds=Math.max(.2,passo||Math.min(.75,g.cs||.5)),pts=[];
  for(let i=0;i<src.length;i++){
    const a=src[i],b=src[(i+1)%src.length],za=zv[i],zb=zv[(i+1)%zv.length],
      n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/ds));
    for(let k=0;k<n;k++){const t=k/n;pts.push([
      a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,za+(zb-za)*t]);}
  }
  const dentro=p=>{const t=sampleZbil(g,p[0],p[1]);
    return Number.isFinite(t)&&(modoUp?p[2]-t:t-p[2])>=-1e-9;};
  const flags=pts.map(dentro),nin=flags.filter(Boolean).length;
  if(!nin)return[];
  const limpa=run=>{
    const q=[];for(const p of run){
      if(!q.length||Math.hypot(p[0]-q.at(-1)[0],p[1]-q.at(-1)[1])>1e-5)q.push(p);
    }
    if(q.length<3)return null;
    if(Math.hypot(q[0][0]-q.at(-1)[0],q[0][1]-q.at(-1)[1])>1e-7)q.push(q[0].slice());
    let area=0;for(let i=1;i<q.length;i++)area+=q[i-1][0]*q[i][1]-q[i][0]*q[i-1][1];
    return Math.abs(area)>1e-4?q:null;
  };
  if(nin===pts.length){
    const q=limpa(pts);return q?[{geom:q.map(p=>[p[0],p[1]]),multi:false,
      zg:q.map(p=>p[2]),props:{...(f.props||{}),CLASSE:'rampa-cortada'}}]:[];
  }
  const fronteira=(a,b,estadoA)=>{
    let lo=a.slice(),hi=b.slice();
    for(let n=0;n<30;n++){const m=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2];
      if(dentro(m)===estadoA)lo=m;else hi=m;}
    return [(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2];
  };
  /* Começa num ponto externo; cada sequência interna vira uma peça simples.
     O fecho é a própria corda local da interseção, nunca uma ligação entre
     duas peças distantes da pista. */
  const k0=flags.findIndex(v=>!v),rot=pts.slice(k0).concat(pts.slice(0,k0));
  rot.push(rot[0].slice());
  const runs=[];let cur=[];
  for(let i=1;i<rot.length;i++){
    const a=rot[i-1],b=rot[i],ia=dentro(a),ib=dentro(b);
    if(!ia&&ib){cur=[fronteira(a,b,ia),b.slice()];continue;}
    if(ia&&ib){if(!cur.length)cur=[a.slice()];cur.push(b.slice());continue;}
    if(ia&&!ib){
      cur.push(fronteira(a,b,ia));const q=limpa(cur);if(q)runs.push(q);cur=[];
    }
  }
  return runs.map(q=>({geom:q.map(p=>[p[0],p[1]]),multi:false,zg:q.map(p=>p[2]),
    props:{...(f.props||{}),CLASSE:'rampa-cortada'}}));
}
/* Encontra os nós EXATOS em que uma crista/pé de cota constante cruza o MDT.
   A mesma bisseção é usada pelo recorte das linhas; estes nós são injetados
   na interseção radial para que as duas geometrias compartilhem literalmente
   o vértice, em vez de apenas parecerem coincidentes na tela. */
function cavaNosExatosNoMdt(linhas,g){
  if(!g||!linhas?.length)return [];
  const passo=Math.max(.2,Math.min(.75,g.cs||.5)),nos=[];
  const add=(p,ln)=>{
    if(!p||!p.every(Number.isFinite))return;
    const tol=Math.max(1e-7,(g.cs||1)*1e-7);
    let q=nos.find(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<=tol);
    if(!q){q=p;q._linhas=[];nos.push(q);}
    if(ln&&!q._linhas.includes(ln))q._linhas.push(ln);
  };
  for(const ln of linhas){
    const r=ln&&ln.ring;if(!r||r.length<2||!Number.isFinite(+ln.z))continue;
    for(let i=0;i<r.length;i++){
      const a=r[i],b=r[(i+1)%r.length],L=Math.hypot(b[0]-a[0],b[1]-a[1]),
        n=Math.max(1,Math.ceil(L/passo));
      let ant=null;
      for(let k=0;k<=n;k++){
        const t=k/n,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],
          zt=sampleZbil(g,p[0],p[1]),d=Number.isFinite(zt)?+ln.z-zt:NaN,
          cur={p,t,d};
        if(Number.isFinite(d)&&Math.abs(d)<=1e-10)add([p[0],p[1],+ln.z],ln);
        if(ant&&Number.isFinite(ant.d)&&Number.isFinite(d)&&ant.d*d<0){
          let lo=ant.t,hi=t,dlo=ant.d;
          for(let j=0;j<32;j++){
            const m=(lo+hi)/2,x=a[0]+(b[0]-a[0])*m,y=a[1]+(b[1]-a[1])*m,
              zm=sampleZbil(g,x,y),dm=Number.isFinite(zm)?+ln.z-zm:NaN;
            if(!Number.isFinite(dm)){hi=m;continue;}
            if(dlo*dm<=0)hi=m;else{lo=m;dlo=dm;}
          }
          const m=(lo+hi)/2;
          add([a[0]+(b[0]-a[0])*m,a[1]+(b[1]-a[1])*m,+ln.z],ln);
        }
        ant=cur;
      }
    }
  }
  return nos;
}
/* Torna cada encontro terreno × crista/pé um vértice real do próprio anel.
   O traçado anterior acrescentava o ponto somente à linha de interseção: as
   duas linhas pareciam cruzar, mas não compartilhavam nó e podiam abrir uma
   fresta no DXF, no TIN ou após um recorte. */
function cavaInjetaNoAnel(ring,p,tol){
  if(!ring||ring.length<2||!p)return false;
  tol=Math.max(1e-8,+tol||1e-6);
  let best=null;
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],dd=dx*dx+dy*dy,
      t=Math.max(0,Math.min(1,dd?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/dd:0)),
      q=[a[0]+dx*t,a[1]+dy*t],d=Math.hypot(p[0]-q[0],p[1]-q[1]);
    if(!best||d<best.d)best={i,t,d};
  }
  if(!best||best.d>tol)return false;
  const i=best.i,j=(i+1)%ring.length,q=[p[0],p[1]],eps=Math.max(1e-9,tol*1e-3);
  if(Math.hypot(ring[i][0]-q[0],ring[i][1]-q[1])<=eps){ring[i]=q;return true;}
  if(Math.hypot(ring[j][0]-q[0],ring[j][1]-q[1])<=eps){ring[j]=q;return true;}
  /* No segmento de fecho, inserir no fim mantém a ordem circular. */
  ring.splice(i+1,0,q);return true;
}
function cavaPreparaNosExatos(linhas,g){
  const nos=cavaNosExatosNoMdt(linhas,g),tol=Math.max(1e-6,(g?.cs||1)*1e-5);
  nos.forEach(no=>(no._linhas||[]).forEach(ln=>cavaInjetaNoAnel(ln.ring,no,tol)));
  return nos;
}
function cavaInjetaNosNaIntersecao(feats,nos,cx,cy,N,g){
  if(!feats?.length||!nos?.length)return feats||[];
  const eps=Math.max(1e-8,(g.cs||1)*1e-8);
  for(const no of nos){
    let best=null;
    for(const f of feats){
      for(let i=1;i<(f.geom||[]).length;i++){
        const a=f.geom[i-1],b=f.geom[i],dx=b[0]-a[0],dy=b[1]-a[1],dd=dx*dx+dy*dy,
          t=Math.max(0,Math.min(1,dd?((no[0]-a[0])*dx+(no[1]-a[1])*dy)/dd:0)),
          x=a[0]+dx*t,y=a[1]+dy*t,d=Math.hypot(no[0]-x,no[1]-y);
        if(!best||d<best.d)best={f,i,t,d};
      }
    }
    if(!best)continue;
    /* O limite cresce com o espaçamento angular local. Evita ligar um nó a
       outro ramo distante, mas absorve a diferença normal entre dois raios. */
    const raio=Math.hypot(no[0]-cx,no[1]-cy),
      tol=Math.max((g.cs||1)*2,raio*2*Math.PI/N*1.75);
    if(best.d>tol)continue;
    const f=best.f,i=best.i,p=[no[0],no[1]],z=Number.isFinite(no[2])?no[2]:sampleZbil(g,no[0],no[1]);
    if(Math.hypot(f.geom[i-1][0]-p[0],f.geom[i-1][1]-p[1])<=eps){
      f.geom[i-1]=p;f.zg[i-1]=z;
    }else if(Math.hypot(f.geom[i][0]-p[0],f.geom[i][1]-p[1])<=eps){
      f.geom[i]=p;f.zg[i]=z;
    }else{
      f.geom.splice(i,0,p);f.zg.splice(i,0,z);
    }
  }
  return feats;
}
function cavaSoldaRecorteNaIntersecao(rec,inter,g){
  const nos=[];
  for(const f of inter||[])for(let i=0;i<(f.geom||[]).length;i++)
    nos.push({p:f.geom[i],z:Array.isArray(f.zg)&&Number.isFinite(f.zg[i])?f.zg[i]:NaN});
  if(!nos.length)return rec||[];
  const tol=Math.max(.03,(g.cs||1)*.08);
  for(const f of rec||[]){
    if(!f.geom?.length)continue;
    for(const i of [...new Set([0,f.geom.length-1])]){
      const p=f.geom[i],zp=Array.isArray(f.zg)&&Number.isFinite(f.zg[i])?f.zg[i]:NaN,
        zt=sampleZbil(g,p[0],p[1]);
      /* Só solda extremos que são realmente um encontro projeto × terreno;
         início/fim construtivo interno continua livre. */
      if(!Number.isFinite(zp)||!Number.isFinite(zt)||Math.abs(zp-zt)>tol)continue;
      let b=null,bd=Infinity;
      for(const n of nos){const d=Math.hypot(p[0]-n.p[0],p[1]-n.p[1]);if(d<bd){bd=d;b=n;}}
      if(b&&bd<=Math.max(tol,(g.cs||1)*.2)){
        f.geom[i]=b.p.slice();if(Array.isArray(f.zg))f.zg[i]=Number.isFinite(b.z)?b.z:zp;
      }
    }
  }
  return rec||[];
}
/* Garante topologia literal após o recorte. Cada extremo de crista/pé que
   satisfaz projeto Z = MDT é inserido na cadeia daylight mais próxima e a
   própria extremidade passa a usar a MESMA coordenada. O nó XY/Z fica
   compartilhado no 2D, 3D, DXF e no projeto reaberto. */
function cavaForcaExtremosNaIntersecao(rec,inter,g){
  if(!g||!inter?.length)return {nos:0,maxAntes:0};
  const tolEq=Math.max(.05,(g.cs||1)*.1),tolBusca=Math.max((g.cs||1)*3,.25);
  let nos=0,maxAntes=0;
  const projeta=p=>{
    let best=null;
    for(const f of inter)for(let i=1;i<(f.geom||[]).length;i++){
      const a=f.geom[i-1],b=f.geom[i],dx=b[0]-a[0],dy=b[1]-a[1],dd=dx*dx+dy*dy,
        t=Math.max(0,Math.min(1,dd?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/dd:0)),
        q=[a[0]+dx*t,a[1]+dy*t],d=Math.hypot(p[0]-q[0],p[1]-q[1]);
      if(!best||d<best.d)best={f,i,q,d};
    }
    return best;
  };
  for(const f of rec||[]){
    if(!cavaEhAnelProjeto(f)||!f.geom?.length)continue;
    for(const ix of [...new Set([0,f.geom.length-1])]){
      const p=f.geom[ix],zp=Array.isArray(f.zg)&&Number.isFinite(+f.zg[ix])?+f.zg[ix]:NaN,
        zt=sampleZbil(g,p[0],p[1]);
      if(!Number.isFinite(zp)||!Number.isFinite(zt)||Math.abs(zp-zt)>tolEq)continue;
      const b=projeta(p);if(!b||b.d>tolBusca)continue;
      maxAntes=Math.max(maxAntes,b.d);
      /* A solução por bisseção no anel prevalece sobre a aproximação radial. */
      const q=[p[0],p[1]],z=zp,eps=Math.max(1e-8,(g.cs||1)*1e-8),F=b.f,i=b.i;
      if(Math.hypot(F.geom[i-1][0]-q[0],F.geom[i-1][1]-q[1])<=eps){F.geom[i-1]=q.slice();F.zg[i-1]=z;}
      else if(Math.hypot(F.geom[i][0]-q[0],F.geom[i][1]-q[1])<=eps){F.geom[i]=q.slice();F.zg[i]=z;}
      else{F.geom.splice(i,0,q.slice());F.zg.splice(i,0,z);}
      f.geom[ix]=q.slice();if(Array.isArray(f.zg))f.zg[ix]=z;nos++;
    }
  }
  return {nos,maxAntes};
}
/* Contrato topológico da linha de daylight.
   Uma componente ABERTA da interseção só é fisicamente representável se as
   duas pontas forem encontros reais com uma crista ou um pé. O marching da
   malha pode produzir componentes abertas na borda de um band/triângulo;
   desenhá-las como “interseção” cria exatamente os traços soltos e paralelos
   que não representam a superfície. Componentes fechadas continuam válidas.
   Nas abertas válidas, solda literalmente as pontas aos nós analíticos dos
   anéis, para que 2D, 3D e DXF compartilhem o mesmo XY/Z. */
function cavaValidaComponentesIntersecao(curvas,nos,g){
  const src=(curvas||[]).filter(f=>f&&Array.isArray(f.geom)&&f.geom.length>1),
    cand=(nos||[]).filter(p=>p&&Number.isFinite(p[0])&&Number.isFinite(p[1])),
    tol=Math.max(.05,(g?.cs||1)*.2),fechTol=Math.max(1e-7,(g?.cs||1)*1e-6),out=[];
  const perto=p=>{let b=null,bd=Infinity;for(const q of cand){const d=Math.hypot(p[0]-q[0],p[1]-q[1]);
    if(d<bd){bd=d;b=q;}}return b&&bd<=tol?{p:b,d:bd}:null;};
  /* MDT de COBERTURA PARCIAL: a linha termina legitimamente na borda do
     dado (vizinhança com células NaN). Exigir nó analítico nas duas pontas
     descartava a interseção inteira nesses projetos. */
  const bordaDado=p=>{
    const r0=Math.max(1,(g&&g.cs)||1)*1.6;
    let fin=0,nan=0;
    for(let k=0;k<8;k++){
      const a2=k*Math.PI/4,
        v=sampleZbil(g,p[0]+Math.cos(a2)*r0,p[1]+Math.sin(a2)*r0);
      if(Number.isFinite(v))fin++;else nan++;
    }
    return nan>0;
  };
  for(const f of src){
    const a=f.geom[0],b=f.geom.at(-1),fechada=Math.hypot(a[0]-b[0],a[1]-b[1])<=fechTol;
    if(fechada){f.geom[f.geom.length-1]=f.geom[0].slice();
      if(Array.isArray(f.zg)&&f.zg.length)f.zg[f.zg.length-1]=f.zg[0];out.push(f);continue;}
    const A=perto(a),B=perto(b);
    const okA=!!A||bordaDado(a),okB=!!B||bordaDado(b);
    if(!okA||!okB)continue;
    if(A&&B&&(A.p===B.p||Math.hypot(A.p[0]-B.p[0],A.p[1]-B.p[1])<=fechTol))continue;
    if(A){f.geom[0]=[A.p[0],A.p[1]];
      if(Array.isArray(f.zg))f.zg[0]=Number.isFinite(A.p[2])?A.p[2]:sampleZbil(g,A.p[0],A.p[1]);}
    if(B){f.geom[f.geom.length-1]=[B.p[0],B.p[1]];
      if(Array.isArray(f.zg))f.zg[f.zg.length-1]=Number.isFinite(B.p[2])?B.p[2]:sampleZbil(g,B.p[0],B.p[1]);}
    out.push(f);
  }
  return out;
}
/* Confere o contrato topológico antes de publicar a atualização. Cada ponto
   analítico em que uma crista ou um pé cruza o MDT precisa pertencer à linha
   de interseção calculada, e não apenas parecer próximo na vista em planta. */
function cavaAuditaIntersecao(curvas,linhas,g){
  const nos=cavaNosExatosNoMdt(linhas,g),tol=Math.max(.03,(g?.cs||1)*.12);
  if(!nos.length)return {ok:true,total:0,cobertos:0,faltantes:[]};
  const distSeg=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],dd=dx*dx+dy*dy,
    t=Math.max(0,Math.min(1,dd?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/dd:0));
    return Math.hypot(p[0]-(a[0]+dx*t),p[1]-(a[1]+dy*t));};
  const falta=[];
  for(const p of nos){let bd=Infinity;
    for(const f of curvas||[])for(let i=1;i<(f.geom||[]).length;i++)
      bd=Math.min(bd,distSeg(p,f.geom[i-1],f.geom[i]));
    if(!(bd<=tol))falta.push(p);
  }
  return {ok:falta.length===0,total:nos.length,cobertos:nos.length-falta.length,faltantes:falta};
}
/* Constrói a linha de contato diretamente pelos nós analíticos em que cada
   anel fechado encontra o MDT. É o contrato geométrico mais importante do
   produto: toda crista e todo pé termina EM uma dessas cadeias, nunca ao
   lado dela. Os nós de anéis consecutivos são associados pela menor distância
   com continuidade de direção; assim não dependemos do vértice inicial nem
   do sentido em que cada anel foi digitalizado. */
function cavaIntersecaoPorNosDosAneis(linhas,g){
  const rs=(linhas||[]).filter(q=>q?.ring?.length>=3&&Number.isFinite(+q.z));
  if(!g||rs.length<2)return [];
  const nos=cavaPreparaNosExatos(rs,g),tol=Math.max(1e-6,(g.cs||1)*1e-6),por=rs.map(ln=>{
    const a=nos.filter(p=>(p._linhas||[]).includes(ln)).map(p=>[p[0],p[1],p[2]]),out=[];
    for(const p of a)if(!out.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<=tol))out.push(p);
    return out;
  });
  const edges=[],adj=new Map(),key=p=>p[0].toFixed(7)+','+p[1].toFixed(7),P=new Map();
  const edgeKey=(a,b)=>{const ka=key(a),kb=key(b);return ka<kb?ka+'|'+kb:kb+'|'+ka;},seen=new Set();
  const addEdge=(a,b)=>{if(!a||!b||Math.hypot(a[0]-b[0],a[1]-b[1])<=tol)return;
    const ek=edgeKey(a,b);if(seen.has(ek))return;seen.add(ek);const ka=key(a),kb=key(b);
    P.set(ka,a);P.set(kb,b);if(!adj.has(ka))adj.set(ka,[]);if(!adj.has(kb))adj.set(kb,[]);
    adj.get(ka).push(kb);adj.get(kb).push(ka);edges.push([ka,kb]);};
  /* Ligações recíprocas por menor distância. A quantidade de encontros pode
     mudar entre dois níveis (a curva separa ou se junta); por isso um
     casamento estritamente 1:1 deixaria nós verdadeiros sem interseção.
     A união A→B e B→A conserva todos os encontros, admite bifurcações e só
     conecta anéis construtivamente consecutivos. */
  for(let i=0;i<por.length-1;i++){
    const A=por[i],B=por[i+1];if(!A.length||!B.length)continue;
    for(const a of A){let b=B[0],bd=Infinity;for(const q of B){const d=Math.hypot(a[0]-q[0],a[1]-q[1]);if(d<bd){bd=d;b=q;}}addEdge(a,b);}
    for(const b of B){let a=A[0],bd=Infinity;for(const q of A){const d=Math.hypot(b[0]-q[0],b[1]-q[1]);if(d<bd){bd=d;a=q;}}addEdge(a,b);}
  }
  if(!edges.length)return [];
  const used=new Set(),eid=(a,b)=>a<b?a+'|'+b:b+'|'+a,trace=start=>{
    const out=[],walk=(cur,prev)=>{let guard=edges.length+2;while(guard-->0){out.push(P.get(cur));
      const nx=(adj.get(cur)||[]).find(q=>q!==prev&&!used.has(eid(cur,q)));if(!nx)break;
      used.add(eid(cur,nx));prev=cur;cur=nx;}};walk(start,null);return out;};
  const chains=[];
  for(const [k,a] of adj)if(a.length!==2)while(a.some(q=>!used.has(eid(k,q)))){const q=trace(k);if(q.length>1)chains.push(q);}
  for(const [a,b] of edges)if(!used.has(eid(a,b))){const q=trace(a);if(q.length>1)chains.push(q);}
  return chains.map(q=>({geom:q.map(p=>[p[0],p[1]]),zg:q.map(p=>Number.isFinite(p[2])?p[2]:sampleZbil(g,p[0],p[1])),
    _metodo:'nos-exatos-aneis-x-mdt'}));
}
/* Interseção diretamente na MALHA da cava. Os anéis consecutivos formam
   faixas trianguladas (taludes e bermas); cada triângulo recebe o sinal
   Zprojeto − Zmdt nos vértices e é cortado no nível zero. Como os anéis já
   contêm os cruzamentos exatos com o MDT, esses pontos são vértices da malha
   e, consequentemente, vértices obrigatórios da curva resultante. */
function cavaIntersecaoMalhaAneis(linhas,g){
  if(!g||!linhas?.length)return [];
  const src=linhas.filter(q=>q?.ring?.length>=3&&Number.isFinite(+q.z));if(src.length<2)return [];
  /* Dois anéis fechados podem ter sido digitalizados em sentidos opostos e
     começar em vértices totalmente diferentes. Associar ambos por sua
     posição bruta no vetor cria uma “costura” diagonal de dezenas de metros
     (a linha voando vista no 3D). Antes de triangular, escolhe para cada anel
     o sentido e a fase circular que minimizam a distância à faixa anterior.
     A geometria não muda: só muda a parametrização usada para formar a
     superfície entre crista, berma e pé. */
  const limpaAnel=r=>{
    const q=(r||[]).map(p=>[+p[0],+p[1]]).filter(p=>p.every(Number.isFinite));
    if(q.length>2&&Math.hypot(q[0][0]-q.at(-1)[0],q[0][1]-q.at(-1)[1])<1e-8)q.pop();
    return q;
  };
  const prepFase=r=>{
    const cum=[0];for(let i=1;i<=r.length;i++){const a=r[i-1],b=r[i%r.length];
      cum.push(cum.at(-1)+Math.hypot(b[0]-a[0],b[1]-a[1]));}
    const per=cum.at(-1)||1;return {q:r,cum:cum.map(v=>v/per)};
  };
  const amostra=(P,u)=>{
    u=((u%1)+1)%1;let i=0;while(i+1<P.cum.length&&P.cum[i+1]<u-1e-12)i++;
    i=Math.min(i,P.q.length-1);const a=P.q[i],b=P.q[(i+1)%P.q.length],du=P.cum[i+1]-P.cum[i],
      t=du>1e-12?(u-P.cum[i])/du:0;return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  };
  const alinha=(ref,raw)=>{
    if(!ref?.length||!raw?.length)return raw||[];
    const A=prepFase(ref),N=48;let best=null;
    for(const rev of [false,true]){
      const base=rev?raw.slice().reverse():raw.slice();
      for(let k=0;k<base.length;k++){
        const r=base.slice(k).concat(base.slice(0,k)),B=prepFase(r);let s=0;
        for(let j=0;j<N;j++){const a=amostra(A,j/N),b=amostra(B,j/N),dx=a[0]-b[0],dy=a[1]-b[1];s+=dx*dx+dy*dy;}
        if(!best||s<best.s)best={s,r};
      }
    }
    return best?best.r:raw;
  };
  const rs=[];
  for(const q of src){const raw=limpaAnel(q.ring);if(raw.length<3)continue;
    rs.push({...q,ring:rs.length?alinha(rs.at(-1).ring,raw):raw});}
  if(rs.length<2)return [];
  const nosExatos=cavaPreparaNosExatos(rs,g),tolNo=Math.max(1e-7,(g.cs||1)*1e-7),segs=[];
  const prepara=r=>{
    const q=r.slice();if(q.length>2&&Math.hypot(q[0][0]-q.at(-1)[0],q[0][1]-q.at(-1)[1])<1e-9)q.pop();
    const cum=[0];for(let i=1;i<=q.length;i++){const a=q[i-1],b=q[i%q.length];cum.push(cum.at(-1)+Math.hypot(b[0]-a[0],b[1]-a[1]));}
    const per=cum.at(-1)||1;return {q,cum:cum.map(v=>v/per),per};
  };
  const ponto=(P,u)=>{
    u=((u%1)+1)%1;let i=0;while(i+1<P.cum.length&&P.cum[i+1]<u-1e-12)i++;
    i=Math.min(i,P.q.length-1);const a=P.q[i],b=P.q[(i+1)%P.q.length],du=P.cum[i+1]-P.cum[i],t=du>1e-12?(u-P.cum[i])/du:0;
    return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  };
  const addSeg=(a,b)=>{if(!a||!b||Math.hypot(a[0]-b[0],a[1]-b[1])<=1e-8)return;segs.push([a,b]);};
  const cortaTri=tri=>{
    const pts=[],add=p=>{if(!pts.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<=tolNo))pts.push(p);};
    for(let e=0;e<3;e++){
      const a=tri[e],b=tri[(e+1)%3],da=a[3],db=b[3],ea=Math.abs(da)<=1e-9,eb=Math.abs(db)<=1e-9;
      if(ea)add([a[0],a[1],a[2]]);if(eb)add([b[0],b[1],b[2]]);
      if(!ea&&!eb&&da*db<0){const t=Math.abs(da)/(Math.abs(da)+Math.abs(db));
        add([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]);}
    }
    if(pts.length===2)addSeg(pts[0],pts[1]);
    else if(pts.length>2){
      /* Caso degenerado: o zero passa por vértice/aresta. Liga pelo par mais
         distante; triângulos vizinhos fornecerão a continuidade. */
      let A=pts[0],B=pts[1],bd=0;for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
        const d=Math.hypot(pts[i][0]-pts[j][0],pts[i][1]-pts[j][1]);if(d>bd){bd=d;A=pts[i];B=pts[j];}}
      addSeg(A,B);
    }
  };
  for(let k=0;k<rs.length-1;k++){
    const A=prepara(rs[k].ring),B=prepara(rs[k+1].ring),
      us=[...new Set(A.cum.slice(0,-1).concat(B.cum.slice(0,-1),[0,1]).map(u=>+u.toFixed(12)))].sort((a,b)=>a-b);
    for(let i=1;i<us.length;i++){
      const u0=us[i-1],u1=us[i],a0=ponto(A,u0),a1=ponto(A,u1),b0=ponto(B,u0),b1=ponto(B,u1),
        va=p=>{const zt=sampleZbil(g,p[0],p[1]);return Number.isFinite(zt)?zt:NaN;},
        A0=[a0[0],a0[1],+rs[k].z,+rs[k].z-va(a0)],A1=[a1[0],a1[1],+rs[k].z,+rs[k].z-va(a1)],
        B0=[b0[0],b0[1],+rs[k+1].z,+rs[k+1].z-va(b0)],B1=[b1[0],b1[1],+rs[k+1].z,+rs[k+1].z-va(b1)];
      if([A0,A1,B0,B1].every(p=>Number.isFinite(p[3]))){cortaTri([A0,B0,B1]);cortaTri([A0,B1,A1]);}
    }
  }
  if(!segs.length)return [];
  /* Costura topológica por nós, priorizando coordenadas analíticas exatas. */
  const tol=Math.max(1e-6,(g.cs||1)*1e-6),nodes=[],edges=[],node=p=>{
    let n=nodes.find(q=>Math.hypot(q.p[0]-p[0],q.p[1]-p[1])<=tol);
    const ex=nosExatos.find(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<=Math.max(tol,tolNo));
    const pp=ex?[ex[0],ex[1],Number.isFinite(ex[2])?ex[2]:p[2]]:p;
    if(!n){n={p:pp.slice(),e:[]};nodes.push(n);}else if(ex)n.p=pp.slice();return n;
  };
  for(const s of segs){const a=node(s[0]),b=node(s[1]);if(a===b)continue;
    if(edges.some(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a)))continue;
    const e={a,b,used:false};edges.push(e);a.e.push(e);b.e.push(e);}
  const linhasOut=[],trace=start=>{const out=[start.p.slice()];let cur=start,prev=null,guard=edges.length+2;
    while(guard-->0){const e=cur.e.find(q=>!q.used&&q!==prev);if(!e)break;e.used=true;
      const nx=e.a===cur?e.b:e.a;out.push(nx.p.slice());prev=e;cur=nx;if(cur===start)break;}
    return out;};
  nodes.filter(n=>n.e.length!==2).forEach(n=>{while(n.e.some(e=>!e.used)){const q=trace(n);if(q.length>1)linhasOut.push(q);}});
  edges.forEach(e=>{if(!e.used){const q=trace(e.a);if(q.length>1)linhasOut.push(q);}});
  return linhasOut.map(q=>({geom:q.map(p=>[p[0],p[1]]),zg:q.map(p=>p[2]),
    _metodo:'malha-faixas-aneis-x-mdt'}));
}
/* SUPERFÍCIE DE PROJETO POR ANÉIS → INTERSEÇÃO COM O MDT.
   1. todos os pés/cristas permanecem fechados e viram breaklines;
   2. cada faixa entre anéis consecutivos recebe interpolação contínua;
   3. calcula-se a grade de diferença Zcava − Zmdt;
   4. marching squares extrai exclusivamente o nível zero;
   5. os cruzamentos analíticos de cada breakline são inseridos na curva.
   Portanto a linha final não é um envelope radial: é a interseção real das
   duas superfícies e obrigatoriamente compartilha nós com pés e cristas. */
/* SAIA EXTERNA — o encontro que fica FORA da pegada.
   A superfície de projeto é montada só ENTRE os anéis, então o zero da
   diferença projeto−terreno só pode ser achado DENTRO do anel externo. Numa
   PILHA apoiada no terreno, começada pela cota mais baixa, os setores em que
   o terreno é mais BAIXO que a base têm a coluna inteira positiva: o encontro
   está fora, no PÉ DE ATERRO — e a interseção aparecia só em parte da volta.
   Aqui a face do banco externo é prolongada para fora, no ângulo do próprio
   projeto, e o encontro é procurado ao longo da NORMAL de cada amostra do
   perímetro. Não se monta um anel deslocado de propósito: num contorno com
   reentrâncias o afastamento se auto-intersecta (medido: 3 cruzamentos já a
   5 m no caso real), enquanto a marcha por normal trata cada amostra sozinha.
   Só roda nos setores em que o anel externo está do lado errado do terreno;
   onde a coluna já cruza por dentro, quem responde é a malha. */
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
/* Ruído da interseção cava × terreno: em zona RASANTE (cava quase paralela
   ao terreno) o contorno-zero oscila na escala da célula do raster — vira
   uma "hachura" de idas-e-vindas e dezenas de fragmentos soltos (89 no
   projeto Massari com o MDE de 30 m). O que está abaixo da resolução do
   raster é artefato por construção: remove rebatimentos com lado até
   ~1,2 célula e descarta fragmentos menores que 2 células (anéis fechados:
   6 células). Num MDT fino (célula sub-métrica) o filtro é imperceptível. */
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
/* Interseção coerente cava × MDT. Em vez de misturar e ordenar por ângulo os
   pontos soltos de todos os bancos (o que criava uma estrela), lança raios a
   partir do centro e interpola somente entre dois anéis vizinhos cujo sinal
   projeto-terreno muda. O resultado nunca conecta bancos aleatórios. */
function cavaIntersecaoRadial(linhas,g,H){
  if(!g||!linhas?.length)return [];
  const base=linhas[0].ring,cx=base.reduce((s,p)=>s+p[0],0)/base.length,
    cy=base.reduce((s,p)=>s+p[1],0)/base.length,
    raioMax=Math.max(...linhas.flatMap(ln=>(ln.ring||[]).map(p=>Math.hypot(p[0]-cx,p[1]-cy))),1),
    alvo=Math.max(.35,Math.min(1.5,Math.max(g.cs||1,g.csy||g.cs||1)*.65)),
    /* Resolução vinculada ao MDT: 240 raios deixavam cordas de vários metros
       em cavas grandes. O teto evita custo excessivo em projetos enormes. */
    N=Math.max(240,Math.min(1440,Math.ceil(2*Math.PI*raioMax/alvo))),
    nosQuebra=cavaPreparaNosExatos(linhas,g);
  const noRaio=(ring,ux,uy)=>{
    let best=null,bt=Infinity;
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],vx=b[0]-a[0],vy=b[1]-a[1],
        den=ux*vy-uy*vx;
      if(Math.abs(den)<1e-10)continue;
      const wx=a[0]-cx,wy=a[1]-cy,t=(wx*vy-wy*vx)/den,s=(wx*uy-wy*ux)/den;
      if(t>=0&&s>=-1e-8&&s<=1+1e-8&&t<bt){bt=t;best=[cx+ux*t,cy+uy*t];}
    }
    return best&&{p:best,t:bt};
  };
  const gx0=g.xll,gy0=g.yll,gx1=g.xll+g.nc*g.cs,
    gy1=g.yll+g.nr*(g.csy||g.cs),am=[];
  for(let k=0;k<N;k++){
    const ang=2*Math.PI*k/N,ux=Math.cos(ang),uy=Math.sin(ang),ss=[];
    for(const ln of linhas){
      const q=noRaio(ln.ring,ux,uy);if(!q)continue;
      const tz=sampleZbil(g,q.p[0],q.p[1]);if(!Number.isFinite(tz))continue;
      ss.push({p:q.p,t:q.t,z:ln.z,d:ln.z-tz});
    }
    ss.sort((a,b)=>a.t-b.t);
    let hitInterno=null;
    for(let i=0;i<ss.length;i++){
      if(i&&ss[i-1].d*ss[i].d<=0){
        const a=ss[i-1],b=ss[i],f=Math.abs(a.d)/(Math.abs(a.d)+Math.abs(b.d)||1);
        const p=[a.p[0]+(b.p[0]-a.p[0])*f,a.p[1]+(b.p[1]-a.p[1])*f],
          z=sampleZbil(g,p[0],p[1]);
        hitInterno={p,z:Number.isFinite(z)?z:a.z+(b.z-a.z)*f};
      }
    }
    /* A cava pode daylightar FORA do último banco. Prolonga linearmente o
       último talude até o limite do MDT e procura a raiz projeto-terreno.
       Esse encontro externo tem precedência sobre uma raiz interna: é ele
       que permite uma cava de encosta, aberta onde o terreno não intercepta. */
    let hit=null;
    if(ss.length>=2){
      const b=ss.at(-1),a=ss.at(-2),dt=b.t-a.t,
        slope=Math.abs(dt)>1e-8?(b.z-a.z)/dt:0;
      let tLim=Infinity;
      if(ux>1e-10)tLim=Math.min(tLim,(gx1-cx)/ux);
      else if(ux<-1e-10)tLim=Math.min(tLim,(gx0-cx)/ux);
      if(uy>1e-10)tLim=Math.min(tLim,(gy1-cy)/uy);
      else if(uy<-1e-10)tLim=Math.min(tLim,(gy0-cy)/uy);
      const step=Math.max(.35,g.cs||1,Math.abs(dt)/4),span=Math.max(0,tLim-b.t),
        nn=Math.min(360,Math.ceil(span/step));
      let p0=b.p.slice(),z0=b.z,d0=b.d;
      for(let j=1;j<=nn;j++){
        const t=Math.min(tLim,b.t+j*step),p=[cx+ux*t,cy+uy*t],
          z=b.z+slope*(t-b.t),tz=sampleZbil(g,p[0],p[1]),d=Number.isFinite(tz)?z-tz:NaN;
        if(Number.isFinite(d0)&&Number.isFinite(d)&&d0*d<=0){
          const f=Math.abs(d0)/(Math.abs(d0)+Math.abs(d)||1),
            q=[p0[0]+(p[0]-p0[0])*f,p0[1]+(p[1]-p0[1])*f],
            qz=z0+(z-z0)*f;
          hit={p:q,z:qz};break;
        }
        if(Number.isFinite(d)){p0=p;z0=z;d0=d;}
        if(t>=tLim-1e-8)break;
      }
    }
    if(!hit)hit=hitInterno;
    am.push(hit);
  }
  let runs=[],run=[];
  for(const h of am){if(h)run.push(h);else if(run.length){runs.push(run);run=[];}}
  if(run.length)runs.push(run);
  if(runs.length>1&&am[0]&&am.at(-1)){
    runs[0]=runs.at(-1).concat(runs[0]);runs.pop();
  }
  const feats=runs.filter(x=>x.length>=2).map(x=>{
    /* Nunca fecha uma lacuna de interseção com uma corda reta. O anel só é
       fechado quando TODOS os raios encontraram o terreno; se faltar uma
       única direção, o trecho permanece deliberadamente aberto. */
    const fechar=x.length>=N;
    const geom=x.map(q=>q.p),zg=x.map(q=>q.z);
    if(fechar){geom.push(geom[0].slice());zg.push(zg[0]);}
    return {geom,zg};
  });
  return cavaInjetaNosNaIntersecao(feats,nosQuebra,cx,cy,N,g);
}
/* Solda topologicamente uma linha de interseção às cristas e aos pés que ela
   cruza. Cada cruzamento é injetado nas DUAS feições com a mesma coordenada e
   a mesma cota. Funciona também em projetos antigos já salvos. */
function cavaSoldaIntersecaoAneis(feats,tol){
  const fs=(feats||[]).filter(f=>f&&Array.isArray(f.geom)&&f.geom.length>=2),
    inter=fs.filter(f=>String(f.props?.TIPO||'')==='Interseção cava × terreno'||
      ['daylight','rb31-inter'].includes(String(f.props?.CLASSE||''))),
    aneis=fs.filter(f=>/^(Limite superior|Pé de banco|Crista de banco|Limite \((crista|pé)|Pé banco|Crista banco|Berma banco)/i
      .test(String(f.props?.TIPO||''))||['rb31-crista','rb31-pe'].includes(String(f.props?.CLASSE||'')));
  if(!inter.length||!aneis.length)return {cruzamentos:0,insercoes:0};
  const eps=Math.max(1e-9,+tol||1e-7),orig=new Map(fs.map(f=>[f,f.geom.map(p=>p.slice())])),xs=[];
  const cruza=(a,b,c,d)=>{
    const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],den=rx*sy-ry*sx;
    if(Math.abs(den)<1e-12)return null;
    const qx=c[0]-a[0],qy=c[1]-a[1],t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
    if(t<-eps||t>1+eps||u<-eps||u>1+eps)return null;
    const tt=Math.max(0,Math.min(1,t));return [a[0]+rx*tt,a[1]+ry*tt];
  };
  for(const fi of inter)for(const fa of aneis){
    const gi=orig.get(fi),ga=orig.get(fa),z=Number.isFinite(+fa.props?.COTA)?+fa.props.COTA:NaN;
    for(let i=1;i<gi.length;i++)for(let j=1;j<ga.length;j++){
      const p=cruza(gi[i-1],gi[i],ga[j-1],ga[j]);if(!p)continue;
      if(!xs.some(x=>x.fi===fi&&x.fa===fa&&Math.hypot(x.p[0]-p[0],x.p[1]-p[1])<=eps*10))
        xs.push({fi,fa,p,z});
    }
  }
  const injeta=(f,p,z)=>{
    let best=null;
    for(let i=1;i<f.geom.length;i++){
      const a=f.geom[i-1],b=f.geom[i],dx=b[0]-a[0],dy=b[1]-a[1],dd=dx*dx+dy*dy,
        t=Math.max(0,Math.min(1,dd?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/dd:0)),
        q=[a[0]+dx*t,a[1]+dy*t],d=Math.hypot(p[0]-q[0],p[1]-q[1]);
      if(!best||d<best.d)best={i,t,d};
    }
    if(!best||best.d>Math.max(eps,1e-5))return false;
    const q=[p[0],p[1]],zz=Number.isFinite(z)?z:null,e=Math.max(1e-8,eps*10);
    if(Math.hypot(f.geom[best.i-1][0]-q[0],f.geom[best.i-1][1]-q[1])<=e){
      f.geom[best.i-1]=q;if(Array.isArray(f.zg)&&zz!=null)f.zg[best.i-1]=zz;return true;
    }
    if(Math.hypot(f.geom[best.i][0]-q[0],f.geom[best.i][1]-q[1])<=e){
      f.geom[best.i]=q;if(Array.isArray(f.zg)&&zz!=null)f.zg[best.i]=zz;return true;
    }
    f.geom.splice(best.i,0,q);
    if(Array.isArray(f.zg)){
      const za=f.zg[best.i-1],zb=f.zg[best.i],zi=zz!=null?zz:
        (Number.isFinite(za)&&Number.isFinite(zb)?za+(zb-za)*best.t:(Number.isFinite(za)?za:zb));
      f.zg.splice(best.i,0,zi);
    }
    return true;
  };
  let insercoes=0;
  xs.forEach(x=>{if(injeta(x.fi,x.p,x.z))insercoes++;if(injeta(x.fa,x.p,x.z))insercoes++;});
  return {cruzamentos:xs.length,insercoes};
}
/* O traçado bruto conserva os anéis inteiros para que a cava continue
   editável. Para a saída construtiva, porém, cada crista/pé deve TERMINAR no
   daylight: caso contrário sobra o trecho que já está fora do terreno e a
   linha parece simplesmente atravessar a interseção. Esta rotina recorta os
   anéis pela própria linha de interseção — sem depender outra vez do MDT — e
   reutiliza literalmente os nós já soldados acima. */
function cavaRecortaAneisNaIntersecao(feats,modoUp){
  const fs=(feats||[]).filter(f=>f&&Array.isArray(f.geom)&&f.geom.length>=2),
    inter=fs.filter(f=>String(f.props?.TIPO||'')==='Interseção cava × terreno'||
      ['daylight','rb31-inter'].includes(String(f.props?.CLASSE||''))),
    alvo=fs.filter(f=>/^(Limite superior|Pé de banco|Crista de banco|Limite \((crista|pé)|Pé banco|Crista banco|Berma banco)/i
      .test(String(f.props?.TIPO||''))||['rb31-crista','rb31-pe'].includes(String(f.props?.CLASSE||'')));
  if(!inter.length||!alvo.length)return {feats:feats||[],recortadas:0,partes:0};
  /* O limite pode vir em mais de uma cadeia. Para decidir o lado, usa só as
     cadeias realmente fechadas; em um daylight aberto não há região interna
     inequívoca e o recorte permanece a cargo do MDT. */
  const aneisInter=inter.map(f=>f.geom).filter(r=>r.length>=4&&
    Math.hypot(r[0][0]-r.at(-1)[0],r[0][1]-r.at(-1)[1])<1e-6);
  if(!aneisInter.length)return {feats:feats||[],recortadas:0,partes:0};
  const dentro=p=>aneisInter.some(r=>pointInRing(p[0],p[1],r)),
    tiposAlvo=new Set(alvo),out=[],limpa=r=>{
      const q=[];for(const p of r){if(!q.length||Math.hypot(p[0]-q.at(-1)[0],p[1]-q.at(-1)[1])>1e-8)q.push(p);}
      return q;
    }, corta=f=>{
      const g=f.geom,z=Array.isArray(f.zg)?f.zg:[],runs=[];let cur=[];
      for(let i=1;i<g.length;i++){
        const a=g[i-1],b=g[i],ia=dentro(a),ib=dentro(b),
          /* cava e pilha ocupam o interior do seu próprio daylight; o que
             muda entre down/up é o teste projeto × MDT, não este lado 2D */
          ficaA=ia,ficaB=ib;
        if(ficaA&&!cur.length)cur.push({p:a.slice(),z:z[i-1]});
        if(ficaA===ficaB){if(ficaB)cur.push({p:b.slice(),z:z[i]});continue;}
        /* A solda prévia garante um nó coincidente neste segmento. Quando há
           mais de um, seleciona o que cai entre seus extremos. */
        let best=null;
        for(const fi of inter)for(let k=1;k<fi.geom.length;k++){
          const c=fi.geom[k-1],d=fi.geom[k],rx=b[0]-a[0],ry=b[1]-a[1],
            sx=d[0]-c[0],sy=d[1]-c[1],den=rx*sy-ry*sx;
          if(Math.abs(den)<1e-12)continue;
          const qx=c[0]-a[0],qy=c[1]-a[1],t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
          if(t>=-1e-8&&t<=1+1e-8&&u>=-1e-8&&u<=1+1e-8){
            const tt=Math.max(0,Math.min(1,t)),p=[a[0]+rx*tt,a[1]+ry*tt];
            if(!best||Math.abs(tt-.5)<Math.abs(best.t-.5))best={p,t:tt};
          }
        }
        const x=best?best.p:(ficaA?a:b).slice(),za=z[i-1],zb=z[i],
          zx=Number.isFinite(za)&&Number.isFinite(zb)?za+(zb-za)*(best?best.t:0):
            (Number.isFinite(za)?za:zb);
        if(ficaA){cur.push({p:x,z:zx});const q=limpa(cur.map(v=>v.p));
          if(q.length>1)runs.push({geom:q,zg:cur.slice(0,q.length).map(v=>v.z)});cur=[];}
        else cur=[{p:x,z:zx},{p:b.slice(),z:z[i]}];
      }
      if(cur.length>1){const q=limpa(cur.map(v=>v.p));if(q.length>1)runs.push({geom:q,zg:cur.slice(0,q.length).map(v=>v.z)});}
      return runs;
    };
  let recortadas=0,partes=0;
  for(const f of fs){
    if(!tiposAlvo.has(f)){out.push(f);continue;}
    const rs=corta(f);
    if(!rs.length)continue;
    recortadas++;partes+=rs.length;
    rs.forEach(r=>out.push({...f,geom:r.geom,zg:r.zg,props:{...(f.props||{}),CLASSE:f.props?.CLASSE||'cava-cortada'}}));
  }
  /* preserva quaisquer feições não lineares/curtas que não entraram em fs */
  (feats||[]).forEach(f=>{if(!fs.includes(f))out.push(f);});
  cavaSoldaIntersecaoAneis(out,1e-7);
  return {feats:out,recortadas,partes};
}
/* Compatibilidade com projetos 66/anteriores, nos quais a camada ainda se
   chamava “bruta + interseção” e não guardava a receita cavaDesign. Mantém a
   camada original editável e cria/atualiza uma derivada realmente aparada,
   que é a representação correta para 2D, 3D e exportação. */
function cavaReparaCamadaLegada(L){
  if(!L||L.gtype!=='line'||L.cavaDesign||L._cavaCutVectorOf||L._cavaCutMode||
    (S.layers||[]).some(x=>String(x._cavaMdtCutOf||'')===String(L.id)))return null;
  const fs=L.features||[],temInter=fs.some(f=>String(f.props?.TIPO||'')==='Interseção cava × terreno'),
    temBanco=fs.some(f=>/^(Limite superior|Pé de banco|Crista de banco)$/i.test(String(f.props?.TIPO||'')));
  if(!temInter||!temBanco)return null;
  const r=cavaRecortaAneisNaIntersecao(fs,false);if(!r.recortadas)return null;
  let C=(S.layers||[]).find(x=>String(x._cavaLegacyCutOf||'')===String(L.id));
  const features=cavaFeatsSemDuplicar(r.feats),ativa=S.activeId;
  if(C){C.features=features;C.fields=(L.fields||[]).map(x=>({...x}));C.visible=true;}
  else C=addLayer({sourceLayer:L,name:'Cava cortada pela interseção',gtype:'line',crs:L.crs||S.workCRS,
    features,fields:(L.fields||[]).map(x=>({...x})),color:L.color||'#111111'});
  C._cavaLegacyCutOf=L.id;C._cavaCutMode='daylight';C.groupId=L.groupId||null;
  C.sym=JSON.parse(JSON.stringify(L.sym||defSym(L.color||'#111111')));
  /* Evita duas representações visíveis sobrepostas. A bruta permanece no
     painel e pode ser religada para inspeção ou edição. */
  L.visible=false;try{drawLayer(L);drawLayer(C);}catch(e){}
  S.activeId=ativa;return {layer:C,recortadas:r.recortadas,partes:r.partes};
}
/* Escolhe a topografia que realmente produziu uma interseção antiga. A
   comparação usa o erro vertical nos vértices daylight; nomes como "MDT" e
   "Topografia final" entram somente como desempate. No projeto de validação,
   o MDT correto retorna erro mediano zero, enquanto a outra topografia difere
   cerca de 10 m. */
function cavaMdtDaIntersecao(L){
  const ints=(L?.features||[]).filter(f=>String(f?.props?.TIPO||'')==='Interseção cava × terreno'||
    ['daylight','rb31-inter'].includes(String(f?.props?.CLASSE||'')));
  const cand=[];
  for(const R of S.rasters||[]){
    const erros=[];
    for(const f of ints)for(let i=0;i<(f.geom||[]).length;i++){
      const p=f.geom[i],z=Array.isArray(f.zg)&&Number.isFinite(+f.zg[i])?+f.zg[i]:
        (Number.isFinite(+p?.[2])?+p[2]:NaN),zt=sampleZbil(R.d,p?.[0],p?.[1]);
      if(Number.isFinite(z)&&Number.isFinite(zt))erros.push(Math.abs(z-zt));
    }
    if(erros.length){erros.sort((a,b)=>a-b);cand.push({R,n:erros.length,
      med:erros[(erros.length/2)|0],rms:Math.sqrt(erros.reduce((s,x)=>s+x*x,0)/erros.length)});}
  }
  /* Elimina primeiro rasters que cobrem apenas um pequeno pedaço da curva.
     Entre superfícies com cobertura comparável, vence o erro vertical: uma
     cava histórica menor não pode ganhar por coincidência em poucos pontos. */
  const maxN=Math.max(0,...cand.map(q=>q.n)),bons=cand.filter(q=>q.n>=Math.max(3,Math.floor(maxN*.6)));
  bons.sort((a,b)=>a.med-b.med||a.rms-b.rms||b.n-a.n||
    (/^mdt$/i.test(a.R.name||'')?-1:1));
  return bons[0]||cand[0]||null;
}
function cavaRecalculaCamadaPeloMdt(L,R,opt={}){
  if(!L||!R||L.gtype!=='line')return null;
  const fonte=(L.cavaDesign&&Array.isArray(L.cavaDesign.rings)&&L.cavaDesign.rings.length)
    ?L.cavaDesign.rings.map((q,i)=>({geom:(q.ring||[]).map(p=>p.slice()),multi:false,
       zg:(q.ring||[]).map(()=>q.z),props:{TIPO:q.bench===0?'Limite superior':
         (q.kind==='toe'?'Pé de banco':'Crista de banco'),BANCO:q.bench,COTA:q.z,
         CLASSE:'cava-bruta'}})).concat((L.features||[]).filter(f=>!cavaEhAnelProjeto(f)))
    :(L.features||[]).filter(cavaEhAnelProjeto);
  if(!fonte.length)return null;
  const up=opt.up!=null?!!opt.up:!!L.cavaDesign?.up,
    q=cavaRecortaAneisFechadosNoMdt(fonte,R.d,up,Math.max(.2,Math.min(.75,R.d.cs||.5)));
  if(!q.processados)return null;
  let C=(S.layers||[]).find(x=>String(x._cavaMdtCutOf||'')===String(L.id));
  const ativa=S.activeId;
  if(C){C.features=q.feats;C.fields=(L.fields||[]).map(x=>({...x}));C.visible=true;drawLayer(C);}
  else{
    C=addLayer({sourceLayer:L,name:(L.name||'Cava').replace(/\s*[+—-]*\s*interseção.*$/i,'')+
      ' — anéis cortados pelo MDT',gtype:'line',crs:L.crs||S.workCRS,
      features:q.feats,fields:(L.fields||[]).map(x=>({...x})),color:L.color||'#111111'});
    C._cavaMdtCutOf=L.id;
  }
  C._cavaCutMode='mdt-ring';C._cavaMdtRasterId=R.id;C._cavaMdtCutUp=up;C.groupId=L.groupId??null;
  C.sym=JSON.parse(JSON.stringify(L.sym||defSym(L.color||'#111111')));
  /* A bruta continua armazenada e editável, mas só a derivada cortada fica
     visível. No 3D, isso impede que dois conjuntos ocupem a cena.
     EXCEÇÃO — pilha/cava 3.1 com receita: a bruta é o objeto de TRABALHO
     (o usuário edita o limite olhando para ela); escondê-la fazia "as
     bancadas sumirem" a cada edição do limite. */
  if(!L._rb31Recipe)L.visible=false;
  try{drawLayer(L);drawLayer(C);}catch(e){}
  S.activeId=ativa;
  return {layer:C,...q,raster:R};
}
function cavaRecalculaAnelMdtEscolhido(){
  const rid=document.getElementById('cavaMdtSel')?.value,
    R=(S.rasters||[]).find(x=>String(x.id)===String(rid)),
    A=(typeof activeLayer==='function')?activeLayer():null,
    L=(A&&((A.features||[]).some(cavaEhAnelProjeto)||A.cavaDesign)?A:cavaProjetoAtual())||
      [...(S.layers||[])].reverse().find(x=>(x.features||[]).some(cavaEhAnelProjeto));
  if(!R){toast('Escolha a topografia no campo MDT associado');return;}
  if(!L){toast('Selecione a camada da cava que contém as cristas e os pés completos');return;}
  const q=cavaRecalculaCamadaPeloMdt(L,R,{up:!!L.cavaDesign?.up});
  if(!q){toast('A camada escolhida não possui anéis completos de crista/pé');return;}
  refreshUI();
  const out=document.getElementById('cavaOut');if(out)out.innerHTML=
    `<b>${q.processados}</b> anel(is) fechado(s) conferido(s) · <b>${q.partes}</b> trecho(s) após o corte · `+
    `topografia <b>${esc(R.name)}</b>.<br>A camada bruta foi preservada e desligada.`;
  toast('Anéis fechados e recortados pelo MDT '+R.name);
}
function cavaLimpaRing(r){
  if(!r||r.length<3)return r||[];
  let out=[];
  r.forEach(p=>{if(!out.length||Math.hypot(p[0]-out.at(-1)[0],p[1]-out.at(-1)[1])>.03)out.push([p[0],p[1]]);});
  for(let pass=0;pass<6&&out.length>3;pass++){
    let mudou=false,n=out.length,keep=[];
    for(let i=0;i<n;i++){
      const a=out[(i+n-1)%n],b=out[i],c=out[(i+1)%n];
      const acx=c[0]-a[0],acy=c[1]-a[1],L=Math.hypot(acx,acy)||1;
      const d=Math.abs(acx*(b[1]-a[1])-acy*(b[0]-a[0]))/L;
      const u=[a[0]-b[0],a[1]-b[1]],v=[c[0]-b[0],c[1]-b[1]];
      const co=(u[0]*v[0]+u[1]*v[1])/((Math.hypot(...u)*Math.hypot(...v))||1);
      if(d<.02||co>.9986){mudou=true;continue;} keep.push(b);
    }
    if(keep.length>=3)out=keep;if(!mudou)break;
  }
  return out;
}
function cavaGeomHash(item){
  if(!item||!item.f)return '';
  const g=item.f.geom||[];
  let h=2166136261,n=0;
  const walk=a=>Array.isArray(a)&&typeof a[0]!=='number'?a.forEach(walk):(()=>{
    if(!Array.isArray(a))return;for(let i=0;i<Math.min(3,a.length);i++){const s=Math.round((+a[i]||0)*1000);h^=s;h=Math.imul(h,16777619);n++;}
  })();
  walk(g);return `${n}:${h>>>0}`;
}
function cavaChain(r){
  const ch=[0];for(let i=1;i<=r.length;i++){const a=r[i-1],b=r[i%r.length];ch.push(ch.at(-1)+Math.hypot(b[0]-a[0],b[1]-a[1]));}return ch;
}
function cavaNearestChain(r,ch,p){
  let best=0,bd=Infinity;
  for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],dx=b[0]-a[0],dy=b[1]-a[1],q=dx*dx+dy*dy;
    const t=Math.max(0,Math.min(1,q?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/q:0));
    const x=a[0]+dx*t,y=a[1]+dy*t,d=(p[0]-x)**2+(p[1]-y)**2;
    if(d<bd){bd=d;best=ch[i]+Math.sqrt(q)*t;}
  }return best;
}
function cavaPointChain(r,ch,s){
  const per=ch.at(-1);s=((s%per)+per)%per;
  for(let i=1;i<ch.length;i++)if(s<=ch[i]+1e-9){const a=r[i-1],b=r[i%r.length],t=(s-ch[i-1])/((ch[i]-ch[i-1])||1);return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];}
  return r[0].slice();
}
/* Projeta um ponto no anel sem alterar sua cota. É usado nas costuras da
   rampa: as duas bordas precisam terminar exatamente sobre a mesma
   crista/pé. Deixar apenas a borda interna presa ao anel fazia a borda
   paralela conservar Z de bancada sobre um XY do talude — a conhecida
   "linha voando" quando a cava era vista de perfil no 3D. */
function cavaPrendeNoAnel(r,ch,p,z){
  /* Projeção mínima, sem deslocar a extremidade pela largura da pista.
     Forçar uma separação ao longo do anel alterava localmente a aparência
     da berma. A abertura da rampa passa a ser feita somente pelo recorte do
     seu polígono, preservando integralmente os offsets da cava. */
  const s=cavaNearestChain(r,ch,p),q=cavaPointChain(r,ch,s);
  return [q[0],q[1],z];
}
function cavaRingIntervalo(r,s0,s1,dir,passo){
  const ch=cavaChain(r),per=ch.at(-1);if(!(per>0))return[];
  let len=dir>0?((s1-s0+per)%per):((s0-s1+per)%per);
  if(len<1e-6)len=per;
  const n=Math.max(2,Math.ceil(len/Math.max(.15,passo||1))),out=[];
  for(let i=0;i<=n;i++)out.push(cavaPointChain(r,ch,s0+dir*len*i/n));
  return out;
}
function cavaRingRemanescente(r,s0,s1,dir,passo){
  /* O trecho retirado vai de s0 a s1 no sentido da rampa; a feição restante
     percorre o arco oposto. É aberta de propósito: as bordas da rampa passam
     a ser as novas breaklines, sem linhas atravessando a pista. */
  return cavaRingIntervalo(r,s1,s0,dir,passo);
}
function cavaRecortaAnelPelasRampas(ring,polys,passo){
  const valid=(polys||[]).filter(p=>p&&p.geom&&p.geom.length>=4);
  const fecha=r=>{
    const a=(r||[]).map(p=>p.slice());if(!a.length)return a;
    if(Math.hypot(a[0][0]-a.at(-1)[0],a[0][1]-a.at(-1)[1])>1e-7)a.push(a[0].slice());
    return a;
  };
  if(!valid.length)return [fecha(ring)];
  let pts=cavaDensifica(ring,Math.max(.15,passo||.4)).map(p=>[p[0],p[1]]);
  if(pts.length>2&&Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])<1e-7)pts.pop();
  if(pts.length<3)return [];
  const dentro=p=>valid.some(q=>pointInRing(p[0],p[1],q.geom));
  const flags=pts.map(dentro),qtd=flags.filter(Boolean).length;
  if(!qtd)return [fecha(pts)];
  if(qtd===pts.length)return [];
  /* Começa dentro de uma pista para que nenhum trecho externo seja partido
     artificialmente na emenda do anel fechado. */
  const k=flags.findIndex(Boolean),rot=pts.slice(k).concat(pts.slice(0,k));
  rot.push(rot[0].slice());
  const fronteira=(a,b,estadoA)=>{
    let lo=a.slice(),hi=b.slice();
    for(let n=0;n<28;n++){
      const m=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2];
      if(dentro(m)===estadoA)lo=m;else hi=m;
    }
    return [(lo[0]+hi[0])/2,(lo[1]+hi[1])/2];
  };
  const runs=[];let cur=[];
  for(let i=0;i<rot.length-1;i++){
    const a=rot[i],b=rot[i+1],ia=dentro(a),ib=dentro(b);
    if(!ia&&!cur.length)cur=[a.slice()];
    if(ia===ib){
      if(!ia)cur.push(b.slice());
      continue;
    }
    const x=fronteira(a,b,ia);
    if(!ia&&ib){
      cur.push(x);if(cur.length>1)runs.push(cur);cur=[];
    }else{
      cur=[x,b.slice()];
    }
  }
  if(cur.length>1)runs.push(cur);
  return runs.filter(r=>r.length>1);
}
/* ============================================================
   RAMPA ESPIRAL ACOPLADA — a pista faz parte da parede.
   Os bancos ABAIXO da rampa são deslocados para dentro pela
   largura da pista em todo o arco já percorrido por ela
   (offset variável com transição na boca), exatamente como no
   desenho de referência de planejamento de lavra. A pista tem
   gradiente constante do início ao fim (sem patamar na berma).
   ============================================================ */
function cavaOffsetVariavel(r,dists){
  const n=r.length,ccw=cavaArea2(r)>0,sgn=ccw?1:-1,out=[];
  for(let i=0;i<n;i++){
    const a=r[(i+n-1)%n],p=r[i],b=r[(i+1)%n];
    let d1x=p[0]-a[0],d1y=p[1]-a[1],L1=Math.hypot(d1x,d1y)||1;
    let d2x=b[0]-p[0],d2y=b[1]-p[1],L2=Math.hypot(d2x,d2y)||1;
    const n1=[d1y/L1*sgn,-d1x/L1*sgn],n2=[d2y/L2*sgn,-d2x/L2*sgn];
    let nx=n1[0]+n2[0],ny=n1[1]+n2[1],Ln=Math.hypot(nx,ny);
    if(Ln<1e-9){nx=n2[0];ny=n2[1];Ln=1;}
    nx/=Ln;ny/=Ln;
    /* fator de mitra limitado: quinas fechadas não geram picos */
    const co=Math.max(.35,(1+(n1[0]*n2[0]+n1[1]*n2[1]))/2);
    const m=Math.min(2,1/Math.sqrt(co));
    out.push([p[0]+nx*dists[i]*m,p[1]+ny*dists[i]*m]);
  }
  return out;
}
function cavaDeloop(r){
  /* remove laços de auto-interseção (corta o laço menor) */
  let pts=r.map(p=>p.slice()),guard=0;
  while(guard++<8){
    const n=pts.length;let cortou=false;
    outer:
    for(let i=0;i<n;i++)for(let j=i+2;j<n;j++){
      if(i===0&&j===n-1)continue;
      if(cavaSegInter(pts[i],pts[(i+1)%n],pts[j],pts[(j+1)%n])){
        const dentro=j-i,fora=n-dentro;
        pts=dentro<=fora
          ?pts.slice(0,i+1).concat(pts.slice(j+1))
          :pts.slice(i+1,j+1);
        cortou=true;break outer;
      }
    }
    if(!cortou)break;
  }
  return pts;
}
function cavaChaikin3(pts,it){
  for(let k=0;k<(it||1);k++){
    if(!pts||pts.length<5)break;
    const out=[pts[0].slice()];
    for(let i=0;i<pts.length-1;i++){
      const a=pts[i],b=pts[i+1];
      out.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25,(a[2]??0)*.75+(b[2]??0)*.25]);
      out.push([a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75,(a[2]??0)*.25+(b[2]??0)*.75]);
    }
    out.push(pts[pts.length-1].slice());
    pts=out;
  }
  return pts;
}
function cavaRampaEspiral(linhas,opt){
  const vazio={features:[],cuts:new Map(),center:[],polygon:null,polygons:[],clipPolygons:[]};
  if(!opt.on||!(opt.width>0)||!(opt.grade>0)||!linhas.length)
    return {linhas,plan:vazio,warn:''};
  /* v77: não existe mais um segundo algoritmo geométrico para a mesma
     obra. Toda chamada antiga da espiral é encaminhada ao núcleo auditado
     pé/crista, evitando que uma tela gere 33° e outra volte a entregar uma
     face quase vertical. */
  if(typeof cavaRampaPlano==='function'){
    const control=opt.control||((+opt.dz>0)?'toe':'crest'),
      plan=cavaRampaPlano(linhas,{...opt,control});
    return {linhas,plan,warn:plan.warn||''};
  }
  const W=+opt.width,grade=opt.grade/100,
    passo=Math.max(.25,Math.min(1.5,W/10)),
    H=Math.abs(opt.H||10),B=Math.max(0,+opt.berm||0),
    usaCota=opt.endMode==='elevation'&&Number.isFinite(+opt.endZ),
    cotaFim=+opt.endZ,
    switchback=!!opt.switchback,
    switchEvery=Math.max(1,Math.round(+opt.switchEvery||1));
  let dir=opt.dir==='ccw'?-1:1,warn='';
  const faces=linhas.map((ln,i)=>({ln,i})).filter(q=>q.ln.tipo==='face');
  if(!faces.length)return {linhas,plan:vazio,warn:''};
  let ancora=opt.start||linhas[0].ring[0];
  const pernas=[],pathPts=[],landings=[]; /* landings: âncora da transição por cota */
  let fim=false;
  for(let fi=0;fi<faces.length&&!fim;fi++){
    const {ln:T,i}=faces[fi],C=linhas[Math.max(0,i-1)];
    if(switchback&&fi>0&&fi%switchEvery===0)dir*=-1;
    let zA=C.z,zB=T.z;
    if(usaCota&&((zB<zA&&zA<=cotaFim+1e-6)||(zB>zA&&zA>=cotaFim-1e-6)))break;
    if(usaCota&&((zB<zA&&zB<cotaFim)||(zB>zA&&zB>cotaFim))){zB=cotaFim;fim=true;}
    const rC=cavaDensifica(C.ring,passo),chC=cavaChain(rC),
      rT=cavaDensifica(T.ring,passo),chT=cavaChain(rT),
      perMin=Math.min(chC.at(-1),chT.at(-1));
    let len=Math.abs(zA-zB)/grade;
    if(len>perMin*.96){
      len=perMin*.96;
      warn=`A pista precisaria de ${(Math.abs(zA-zB)/grade).toFixed(0)} m no banco ${T.bench}, `+
        `mas o perímetro só oferece ${(perMin*.96).toFixed(0)} m; o gradiente local ficou mais forte.`;
    }
    const sC=cavaNearestChain(rC,chC,ancora),
      pEnt=cavaPointChain(rC,chC,sC),
      sT=cavaNearestChain(rT,chT,pEnt),
      np=Math.max(12,Math.ceil(len/passo)),
      aR=[],nR=[];
    for(let j=0;j<=np;j++){
      const t=j/np,
        pC=cavaPointChain(rC,chC,sC+dir*len*t),
        pT=cavaPointChain(rT,chT,sT+dir*len*t),
        /* BORDA INTERNA = alinhamento NATURAL da parede: desce a face da
           crista (t=0) ao pé (t=1), como no DXF de exemplo. A externa é
           DERIVADA depois (interna + W·normal) — largura sempre igual. */
        x=pC[0]+(pT[0]-pC[0])*t,y=pC[1]+(pT[1]-pC[1])*t,
        z=zA+(zB-zA)*t;
      let nx=pC[0]-pT[0],ny=pC[1]-pT[1],Ln=Math.hypot(nx,ny);
      if(Ln<1e-6){
        const q1=aR.at(-1)||[x,y],tx=x-q1[0],ty=y-q1[1],Lt=Math.hypot(tx,ty)||1;
        nx=ty/Lt*dir;ny=-tx/Lt*dir;Ln=1;
      }
      aR.push([x,y,z]);nR.push([nx/Ln,ny/Ln]);
      pathPts.push([x,y,z]);
    }
    pernas.push({aR,nR,tipo:'descida',_i0:pathPts.length-aR.length,
      _ringT:T.ring});
    ancora=[aR.at(-1)[0],aR.at(-1)[1]];
    /* PATAMAR plano: atravessa a berma na cota do pé, do pé do trecho até
       a crista do banco seguinte — comprimento = berma (como no exemplo). */
    const Cnext=linhas[i+1]&&linhas[i+1].tipo==='berm'?linhas[i+1]:null;
    if(Cnext&&!fim&&fi<faces.length-1&&B>1e-7){
      const rN=cavaDensifica(Cnext.ring,passo),chN=cavaChain(rN),
        sN=cavaNearestChain(rN,chN,ancora),
        pN=cavaPointChain(rN,chN,sN),
        npp=Math.max(2,Math.ceil(Math.hypot(pN[0]-ancora[0],pN[1]-ancora[1])/passo)),
        vx=pN[0]-ancora[0],vy=pN[1]-ancora[1],Lv=Math.hypot(vx,vy)||1,
        aR=[];
      for(let j=0;j<=npp;j++){
        const t=j/npp,x=ancora[0]+vx*t,y=ancora[1]+vy*t;
        aR.push([x,y,zB]);
        pathPts.push([x,y,zB]);
      }
      /* JUNTA RETA: a direção da junta é a do próprio patamar; a normal
         externa dele é constante = −v̂. As tampas dos trechos vizinhos
         serão alinhadas a essa MESMA reta. */
      const jN=[-(vx/Lv),-(vy/Lv)];
      pernas.push({aR,tipo:'patamar',juncN:jN,_i0:pathPts.length-aR.length,_ringT:T.ring});
      /* os 4 vértices EXATOS da junta: cantos internos (sobre pé/crista
         naturais) e externos (+W) — a travessia dos anéis é grampeada
         NELES: coincidência de vértice com a pista. */
      landings.push({z:zB,juncN:jN,mid:[(aR[0][0]+aR.at(-1)[0])/2,(aR[0][1]+aR.at(-1)[1])/2],
        pIni:[ancora[0],ancora[1]],pFim:[pN[0],pN[1]],
        qIni:[ancora[0]+jN[0]*W,ancora[1]+jN[1]*W],
        qFim:[pN[0]+jN[0]*W,pN[1]+jN[1]*W]});
      ancora=[pN[0],pN[1]];
    }
  }
  if(!pernas.length)return {linhas,plan:vazio,warn:warn};
  const ultDesc=[...pernas].reverse().find(p=>p.tipo==='descida'),
    priDesc=pernas.find(p=>p.tipo==='descida');
  let capFim=null,capIni=null; /* definidos após o acabamento, com os
    cantos REAIS desenhados (a/b finais) — coincidência de vértice. */
  /* -------- acabamento das pernas: LARGURA CONSTANTE e JUNTA RETA --------
     A externa é sempre DERIVADA da interna (b = a + W·n) — a pista nunca
     muda de largura. Nas pontas de cada descida a normal converge (smooth-
     step) para a direção da junta do patamar vizinho: a tampa que chega, o
     patamar e a tampa que sai caem na MESMA reta transversal. */
  const ssm=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  for(let pi=0;pi<pernas.length;pi++){
    const p=pernas[pi];
    if(p.tipo==='patamar'){
      p.a=p.aR;
      p.b=p.aR.map(q=>[q[0]+p.juncN[0]*W,q[1]+p.juncN[1]*W,q[2]]);
      p.seg=p.aR.map(q=>[q[0]+p.juncN[0]*W/2,q[1]+p.juncN[1]*W/2,q[2]]);
      continue;
    }
    const nAntes=pi>0&&pernas[pi-1].tipo==='patamar'?pernas[pi-1].juncN:null,
      nDepois=pi<pernas.length-1&&pernas[pi+1].tipo==='patamar'?pernas[pi+1].juncN:null,
      a=cavaChaikin3(p.aR,1),
      ch2=[0];
    for(let i=1;i<a.length;i++)
      ch2.push(ch2[i-1]+Math.hypot(a[i][0]-a[i-1][0],a[i][1]-a[i-1][1]));
    const L=ch2.at(-1)||1,LB=Math.min(W,L/2.5),
      b=[],seg=[];
    for(let i=0;i<a.length;i++){
      /* normal geométrica da interna suavizada */
      const i0=Math.max(0,i-1),i1=Math.min(a.length-1,i+1),
        tx=a[i1][0]-a[i0][0],ty=a[i1][1]-a[i0][1],Lt=Math.hypot(tx,ty)||1;
      let nx=-ty/Lt,ny=tx/Lt;
      const ref=p.nR[Math.min(p.nR.length-1,Math.round(i*(p.nR.length-1)/(a.length-1)))];
      if(nx*ref[0]+ny*ref[1]<0){nx=-nx;ny=-ny;}
      /* mistura para a direção da junta nas pontas */
      if(nAntes&&ch2[i]<LB){
        const w2=ssm(ch2[i]/LB);
        nx=nAntes[0]*(1-w2)+nx*w2;ny=nAntes[1]*(1-w2)+ny*w2;
      }
      if(nDepois&&(L-ch2[i])<LB){
        const w2=ssm((L-ch2[i])/LB);
        nx=nDepois[0]*(1-w2)+nx*w2;ny=nDepois[1]*(1-w2)+ny*w2;
      }
      const Ln=Math.hypot(nx,ny)||1;nx/=Ln;ny/=Ln;
      b.push([a[i][0]+nx*W,a[i][1]+ny*W,a[i][2]]);
      seg.push([a[i][0]+nx*W/2,a[i][1]+ny*W/2,a[i][2]]);
    }
    p.a=a;p.b=b;p.seg=seg;
  }
  /* ---------- deslocamento dos anéis: p/ FORA onde a pista já passou
     ABAIXO da cota do anel (a cava EXPANDE ao redor da rampa) ---------- */
  if(ultDesc&&ultDesc.a&&ultDesc.b){
    const pI=ultDesc.a.at(-1),pX=ultDesc.b.at(-1),
      L2=Math.hypot(pX[0]-pI[0],pX[1]-pI[1])||1;
    capFim={p:[pI[0],pI[1]],pExt:[pX[0],pX[1]],n:[(pX[0]-pI[0])/L2,(pX[1]-pI[1])/L2]};
  }
  if(priDesc&&priDesc.a&&priDesc.b){
    const pI=priDesc.a[0],pX=priDesc.b[0],
      L2=Math.hypot(pX[0]-pI[0],pX[1]-pI[1])||1;
    capIni={p:[pI[0],pI[1]],pExt:[pX[0],pX[1]],n:[(pX[0]-pI[0])/L2,(pX[1]-pI[1])/L2]};
  }
  const taper=Math.max(W,2*B,6*passo),
    ss=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);},
    amost=pathPts.filter((_,i)=>i%2===0),
    pathFim=pathPts[pathPts.length-1];
  /* ângulo DESENROLADO do caminho em torno do centroide do limite: base da
     CONTAGEM DE VOLTAS — cada passagem da pista abaixo de um anel empurra
     o anel mais W p/ fora (multi-volta: setores com 2W, 3W...). */
  const ctr=(()=>{let sx=0,sy=0;const r0=linhas[0].ring;
    for(const q of r0){sx+=q[0];sy+=q[1];}return [sx/r0.length,sy/r0.length];})();
  const phiPath=[];{
    let acc=0,prev=null;
    for(const p of pathPts){
      const a=Math.atan2(p[1]-ctr[1],p[0]-ctr[0]);
      if(prev!=null){let d2=a-prev;
        while(d2>Math.PI)d2-=2*Math.PI;while(d2<-Math.PI)d2+=2*Math.PI;acc+=d2;}
      prev=a;phiPath.push(acc);
    }
  }
  const contaVoltas=(th,fs,fe)=>{
    if(fe<fs){const t=fs;fs=fe;fe=t;}
    const k0=Math.ceil((fs-th)/(2*Math.PI)-1e-9),
      k1=Math.floor((fe-th)/(2*Math.PI)+1e-9);
    return Math.max(0,k1-k0+1);
  };
  let retornoGlobal=null; /* um único ponto físico de retorno p/ TODAS
    as cotas: cada anel o projeta em si (projeção de ponto próximo é
    estável) ⇒ afunilamentos no mesmo azimute, linhas paralelas. */
  /* âncora ANGULAR: cadeia onde o anel cruza o raio ctr→P. A projeção por
     nearestChain de ponto profundo/externo cai em azimute errado perto de
     canto (medido: taper começando ~100 m antes da ponta em cotas médias,
     esmagando o corredor da pista de 2,6 p/ 1,1 m na janela) — o raio dá o
     MESMO azimute em todos os anéis por construção. */
  const anelAzimute=(rd2,ch2,P2)=>{
    const aT=Math.atan2(P2[1]-ctr[1],P2[0]-ctr[0]);
    let bi=0,bv=Infinity;
    for(let i=0;i<rd2.length;i++){
      let dA=Math.atan2(rd2[i][1]-ctr[1],rd2[i][0]-ctr[0])-aT;
      while(dA>Math.PI)dA-=2*Math.PI;while(dA<-Math.PI)dA+=2*Math.PI;
      dA=Math.abs(dA);
      if(dA<bv){bv=dA;bi=i;}
    }
    return ch2[bi];
  };
  const novas=linhas.map(ln=>{
    const zm=ln.z;
    const abaixo=amost.filter(p=>p[2]<zm-1e-6);
    if(!abaixo.length){
      /* FUNDO (cota da chegada): incorpora a TAMPA — vértices exatos nos
         dois cantos finais da pista e o arco natural entre eles removido
         (o anel contorna a pista, como no DXF). */
      if(!switchback&&capFim&&Math.abs(zm-pathFim[2])<1e-6&&ln.ring.length>5){
        const rd2=cavaDensifica(ln.ring,passo*2),ch2=cavaChain(rd2),per2=ch2.at(-1),
          cInt=[capFim.p[0],capFim.p[1]],
          cExt=[capFim.pExt[0],capFim.pExt[1]],
          sI=cavaNearestChain(rd2,ch2,cInt),
          sX=cavaNearestChain(rd2,ch2,cExt),
          gap=Math.min(Math.abs(sX-sI),per2-Math.abs(sX-sI));
        if(gap<per2*.4){
          const dentroTampa=c=>{
            const a2=Math.min(sI,sX),b2=Math.max(sI,sX);
            return (b2-a2<=per2/2)?(c>a2+1e-9&&c<b2-1e-9):(c<a2-1e-9||c>b2+1e-9);
          };
          /* remove o arco e insere os cantos NO VÃO exato deixado */
          const q2=[];let gapPos=-1,removeu=false;
          for(let i=0;i<rd2.length;i++){
            if(dentroTampa(ch2[i])){
              if(!removeu){gapPos=q2.length;removeu=true;}
              continue;
            }
            q2.push([rd2[i][0],rd2[i][1]]);
          }
          if(removeu&&q2.length>3){
            const gp=gapPos%Math.max(1,q2.length),
              antes=q2[(gp-1+q2.length)%q2.length],
              dI=Math.hypot(antes[0]-cInt[0],antes[1]-cInt[1]),
              dX=Math.hypot(antes[0]-cExt[0],antes[1]-cExt[1]),
              ordIC=dI<=dX;
            if(ordIC)q2.splice(gp,0,[cInt[0],cInt[1]],[cExt[0],cExt[1]]);
            else q2.splice(gp,0,[cExt[0],cExt[1]],[cInt[0],cInt[1]]);
            /* religamento OBLÍQUO: vizinhos naturais colados ao canto
               externo fariam a linha voltar por cima (espeto ~170°);
               remove até ~1,2W do cExt no lado adjacente a ele, e o
               religamento salta adiante como no DXF (~1,5W). */
            {
              const idxExt=ordIC?gp+1:gp;
              let guarda=0;
              /* lado depois do cExt (ordem interna→externa) ou antes */
              const passoRem=ordIC?1:-1;
              let k3=(idxExt+passoRem+q2.length)%q2.length;
              while(guarda++<25&&q2.length>4){
                const v=q2[k3];
                if(v===undefined)break;
                const dv=Math.hypot(v[0]-cExt[0],v[1]-cExt[1]);
                if(dv>=W*1.2)break;
                if(Math.hypot(v[0]-cInt[0],v[1]-cInt[1])<1e-6)break;
                q2.splice(k3,1);
                if(passoRem<0)k3=(k3-1+q2.length)%q2.length;
                else k3=k3%q2.length;
              }
            }
            return {...ln,ring:q2};
          }
        }
      }
      return ln;   /* pista nunca desce abaixo desta cota */
    }
    const rd=cavaDensifica(ln.ring,passo*2),ch=cavaChain(rd),per=ch.at(-1);
    let q=null;
    if(!switchback){
      /* ============ MONTAGEM EXPLÍCITA POR NÍVEIS ============
         nº de voltas da pista abaixo da cota ⇒ o anel alterna entre os
         níveis n·W e (n+1)·W em dois setores, decididos POR CADEIA.
         As travessias são pares de VÉRTICES EXATOS inseridos nas duas
         retas: a JUNTA da própria cota e a TAMPA DE CHEGADA da pista
         (a chegada no fundo vira uma junta como as outras). */
      let i0=0;while(i0<pathPts.length&&pathPts[i0][2]>=zm-1e-6)i0++;
      const Th=Math.abs(phiPath[phiPath.length-1]-phiPath[Math.min(i0,phiPath.length-1)]),
        nLow=Math.max(0,Math.floor(Th/(2*Math.PI)+1e-9)),
        land=landings.find(o=>Math.abs(o.z-zm)<1e-6);
      /* âncora de INÍCIO do setor alto: junta da cota (ou a boca p/ o limite) */
      let Pb,uB;
      if(land){Pb=ln.kind==='crest'?land.pFim:land.pIni;uB=land.juncN;}
      else if(capIni&&Math.abs(zm-linhas[0].z)<1e-6){Pb=[capIni.p[0],capIni.p[1]];uB=capIni.n;}
      else{const p0=abaixo[0]||pathPts[0];
        const s0=cavaNearestChain(rd,ch,p0);Pb=cavaPointChain(rd,ch,s0);
        uB=null;}
      const sB=cavaNearestChain(rd,ch,Pb);
      /* FIM DO SETOR — regra da CHEGADA medida no DXF: os anéis voltam
         ao natural ESCALONADOS atrás do fim da pista (o mais fundo
         primeiro; par pé/crista da mesma cota junto), com um SEGMENTO
         RETO direto entre os ramos. Recuo em cadeia por nível de cota. */
      const zFim2=pathFim[2],
        TtapG=Math.max(4*W,30),
        /* AFUNILAMENTO INTEIRO DEPOIS DA PONTA: recuo = taper + berma —
           na ponta tudo ainda deslocado, o desvio do fundo pela tampa
           corre POR DENTRO da crista deslocada (a crista nunca cai em
           cima do pé; antes o taper começava antes do fim). */
        recuo=TtapG+Math.max(B,2*passo), /* margem única além do fim: TODOS os retornos no
          MESMO azimute — afunilando juntos, com o mesmo perfil, as
          linhas ficam PARALELAS no pé da rampa (o escalonamento por
          cota fazia a separação variar na janela entre afunilamentos;
          com taper suave sincronizado não há inversão nem precisa
          escalonar). */
        dirA=opt.dir==='ccw'?-1:1,
        _z0=0;
      /* RETORNO CASADO POR COTA: o primeiro anel da cota calcula o ponto
         de retorno (projeção do fim + recuo escalonado); o PAR HERDA o
         mesmo ponto, projetando-o (ponto vizinho ~5 m: projeção estável;
         projetar o fim da pista ~180 m longe desalinhava os retornos do
         par e invertia o aninhamento — 2 cruzamentos por par). */
      let sE;
      if(retornoGlobal){
        sE=anelAzimute(rd,ch,retornoGlobal);
      }else{
        const sT=anelAzimute(rd,ch,capFim?capFim.p:pathFim),
          sSt=((sT+dirA*recuo)%per+per)%per;
        sE=sSt;
        retornoGlobal=cavaPointChain(rd,ch,sSt);
      }
        circ=(a2,b2)=>dirA>0?((b2-a2)%per+per)%per:((a2-b2)%per+per)%per,
        Larc=circ(sB,sE)||per;
      /* dois anéis de offset EXATO (mapeamento 1:1 com rd) */
      const nivel=nv=>{
        /* offset por NORMAIS SUAVIZADAS (janela ∝ distância): sem mitra e
           sem dobra em canto côncavo — o offsetVariavel dobrava sobre si
           mesmo a 2W em trecho côncavo do limite e o dedup preservava a
           dobra (níveis impossíveis 3–9 m medidos na cava real). Distância
           exata por construção. */
        if(nv<=0)return rd.map(p2=>[p2[0],p2[1]]);
        const dW=nv*W,win=Math.max(2,Math.ceil(dW/(passo*2))),
          nSeg=rd.map((p2,i3)=>{
            const q3=rd[(i3+1)%rd.length],dx=q3[0]-p2[0],dy=q3[1]-p2[1],
              L3=Math.hypot(dx,dy)||1;
            return [dy/L3,-dx/L3];
          });
        /* orientação p/ FORA */
        let s0x=0,s0y=0;
        for(let k3=-win;k3<=win;k3++){const nn=nSeg[(k3+rd.length)%rd.length];s0x+=nn[0];s0y+=nn[1];}
        const L0=Math.hypot(s0x,s0y)||1,
          teste=[rd[0][0]+s0x/L0*.5,rd[0][1]+s0y/L0*.5],
          sinal=pointInRing(teste[0],teste[1],rd)?-1:1,
          o2=[];
        for(let i3=0;i3<rd.length;i3++){
          let sx=0,sy=0;
          for(let k3=-win;k3<=win;k3++){
            const nn=nSeg[(i3+k3+rd.length)%rd.length];sx+=nn[0];sy+=nn[1];
          }
          const L3=Math.hypot(sx,sy)||1;
          o2.push([rd[i3][0]+sinal*sx/L3*dW,rd[i3][1]+sinal*sy/L3*dW]);
        }
        return o2;
      };
      const Q1=nivel(nLow),Q2=nivel(nLow+1),
        dentro=i=>circ(sB,ch[i])<Larc-1e-9,
        /* interseção mais próxima de um raio (P,u) com uma polilinha */
        raioInter=(P,u2,poly)=>{
          let melhorT=Infinity,pt=null;
          const f2=[P[0]+u2[0]*per,P[1]+u2[1]*per];
          for(let i=0;i<poly.length;i++){
            const a2=poly[i],b2=poly[(i+1)%poly.length];
            if(!cavaSegInter(P,f2,a2,b2))continue;
            const dx=b2[0]-a2[0],dy=b2[1]-a2[1],
              den=u2[0]*dy-u2[1]*dx;
            if(Math.abs(den)<1e-12)continue;
            const t=((a2[0]-P[0])*dy-(a2[1]-P[1])*dx)/den;
            if(t>=-1e-9&&t<melhorT){melhorT=t;pt=[P[0]+u2[0]*t,P[1]+u2[1]*t];}
          }
          return pt;
        },
        /* TRAVESSIA COLINEAR: os dois pontos são as interseções exatas da
           RETA (junta ou tampa de chegada) com os anéis dos dois níveis —
           todas as travessias correm SOBRE a mesma reta e nunca se cruzam. */
        parNaReta=(P,u2,lvlDe,lvlPara,iRef)=>{
          const QDe=lvlDe<=nLow?Q1:Q2,QPara=lvlPara<=nLow?Q1:Q2,
            base=[P[0]-u2[0]*2*W,P[1]-u2[1]*2*W],  /* recua p/ pegar interseções atrás */
            A2=raioInter(base,u2,QDe),B2=raioInter(base,u2,QPara);
          if(A2&&B2)return [A2,B2];
          /* fallback: normal local */
          const i2=Math.max(0,Math.min(rd.length-1,iRef|0)),
            v2=[Q2[i2][0]-rd[i2][0],Q2[i2][1]-rd[i2][1]],L2=Math.hypot(v2[0],v2[1])||1,
            ux=v2[0]/L2,uy=v2[1]/L2;
          return [[P[0]+ux*lvlDe*W,P[1]+uy*lvlDe*W],
                  [P[0]+ux*lvlPara*W,P[1]+uy*lvlPara*W]];
        };
      /* RETORNO CONTÍNUO ("tem que ser limpo, contínuo"): degrau seco é
         SÓ para a JUNTA (cruzar a pista); o retorno da expansão AFUNILA
         suave (smoothstep sobre T) terminando em sE — pares e cotas
         vizinhas afunilam em perfis paralelos (mesmo T, sE escalonado e
         casado por cota) ⇒ aninhamento por construção, sem degraus em Z
         no flanco. */
      /* taper ancorado em DOIS pontos físicos: começa na PONTA+margem e
         termina no retorno — consistente em ÂNGULO p/ todos os anéis (o
         comprimento fixo em metros virava ângulos diferentes por raio e
         o taper dos anéis internos começava ANTES da ponta). */
      const sTip=anelAzimute(rd,ch,capFim?capFim.p:pathFim),
        margemT=Math.max(B,2*passo),
        sIniT=((sTip+dirA*margemT)%per+per)%per,
        Ttap=Math.max(passo*2,Math.min(Larc*.9,circ(sIniT,sE)));
      q=[];
      for(let i=0;i<rd.length;i++){
        const cI=ch[i],tIn=circ(sB,cI);
        let f2=0;
        if(tIn<Larc-1e-9){
          const dBack=Larc-tIn;
          f2=dBack>=Ttap?1:ss(dBack/Ttap);
        }
        q.push([Q1[i][0]+(Q2[i][0]-Q1[i][0])*f2,
                Q1[i][1]+(Q2[i][1]-Q1[i][1])*f2]);
        const j2=(i+1)%rd.length,
          dIn=dentro(i),dJn=dentro(j2);
        if(dIn===dJn)continue;
        const ehB=dJn; /* entrando no setor alto ⇒ reta da junta (sB) */
        if(!ehB)continue; /* saída: o taper resolve, sem par inserido */
        const de=dIn?nLow+1:nLow,para=dJn?nLow+1:nLow;
        if(land&&nLow===0){
          /* junta primária: COINCIDÊNCIA DE VÉRTICE com os cantos da pista */
          const anc=ln.kind==='crest'?land.pFim:land.pIni,
            dst=ln.kind==='crest'?land.qFim:land.qIni;
          q.push([anc[0],anc[1]],[dst[0],dst[1]]);
        }else if(uB){
          /* empilhado DIRETO na âncora (Pb está sobre o anel natural;
             níveis a k·W ao longo de uB) — a caça por raio (parNaReta)
             pegava lóbulo errado perto da boca e criava segmentos de
             59–87 m. */
          q.push([Pb[0]+uB[0]*de*W,Pb[1]+uB[1]*de*W],
                 [Pb[0]+uB[0]*para*W,Pb[1]+uB[1]*para*W]);
        }
      }
    }else{
      /* switchback: cobertura por bins com ponte + fechamento (geral) */
      const nb=Math.max(24,Math.ceil(per/(passo*2))),bin=per/nb,
        cob=new Array(nb).fill(0);
      let kAnt=null;
      const salto=Math.max(3,Math.ceil(2*passo/bin)+2);
      for(const p of amost){
        if(p[2]>=zm-1e-6){kAnt=null;continue;}
        let bi=0,bd=Infinity;
        for(let i=0;i<rd.length;i++){
          const d=(rd[i][0]-p[0])**2+(rd[i][1]-p[1])**2;
          if(d<bd){bd=d;bi=i;}
        }
        const k=Math.min(nb-1,Math.floor(ch[bi]/bin));
        cob[k]=1;
        if(kAnt!=null&&kAnt!==k){
          const gf=(k-kAnt+nb)%nb,gb=(kAnt-k+nb)%nb;
          if(Math.min(gf,gb)<=salto){
            const g2=gf<=gb?gf:-gb,n2=Math.abs(g2);
            for(let j=1;j<n2;j++)cob[((kAnt+Math.sign(g2)*j)%nb+nb)%nb]=1;
          }
        }
        kAnt=k;
      }
      if(!cob.some(v=>v))return ln;
      for(let i=0;i<nb;i++){
        if(cob[i])continue;
        let esq=0,dirt=0;
        for(let d2=1;d2<=2*salto;d2++){if(cob[(i-d2+nb)%nb]){esq=1;break;}}
        for(let d2=1;d2<=2*salto;d2++){if(cob[(i+d2)%nb]){dirt=1;break;}}
        if(esq&&dirt)cob[i]=2;
      }
      for(let i=0;i<nb;i++)if(cob[i]===2)cob[i]=1;
      const dist=new Array(nb).fill(Infinity);
      for(let i=0;i<nb;i++)if(!cob[i])dist[i]=0;
      if(dist.every(v=>v===Infinity))dist.fill(nb);
      else{
        for(let k=0;k<2*nb;k++){const i2=k%nb,pr=(i2+nb-1)%nb;
          if(dist[pr]+1<dist[i2])dist[i2]=dist[pr]+1;}
        for(let k=2*nb-1;k>=0;k--){const i2=k%nb,nx2=(i2+1)%nb;
          if(dist[nx2]+1<dist[i2])dist[i2]=dist[nx2]+1;}
      }
      const dists=rd.map((_,i)=>{
        const bi=Math.min(nb-1,Math.floor(ch[i]/bin));
        if(!cob[bi])return 0;
        return W*ss(Math.min(1,dist[bi]*bin/taper));
      });
      if(dists.some(v=>v>0))q=cavaOffsetVariavel(rd,dists);
    }
    if(!q)return ln;
    if(!switchback){
      /* a montagem por níveis já sai limpa e com vértices exatos — o
         afinador (tolerância métrica) desfazia a colinearidade das
         travessias; aqui só dedup de pontos coincidentes. */
      const q2=[];
      for(const p2 of q)
        if(!q2.length||Math.hypot(p2[0]-q2.at(-1)[0],p2[1]-q2.at(-1)[1])>.02)q2.push(p2);
      if(q2.length>1&&Math.hypot(q2[0][0]-q2.at(-1)[0],q2[0][1]-q2.at(-1)[1])<=.02)q2.pop();
      q=cavaDespiga(q2,145); /* reversões e cotovelos curtos das costuras;
        travessias das juntas (~90–120°) preservadas */
    }else{
      q=cavaDespiga(cavaAfinaAnel(q,passo*.3),130);
      if(q.length>3&&cavaRingCruza(q))q=cavaDeloop(q);
    }
    if(q.length<3)return ln;
    return {...ln,ring:q};
  });
  /* GARANTIA DE ANINHAMENTO (acabamento executável): nenhum anel pode
     invadir o anel imediatamente mais fundo — onde a volta ao natural
     espetar um canto do vizinho, o vértice é grampeado para fora com
     folga de 0,3 m. Processa do fundo para o topo. */
  for(let m=novas.length-2;m>=0&&switchback;m--){
    /* grampo só no caminho switchback (bins): a montagem por níveis
       garante o aninhamento por construção (retas compartilhadas), e o
       grampo densificava/mexia nos anéis criando sujeira na chegada. */
    const fundo=novas[m+1].ring;if(!fundo||fundo.length<3)continue;
    /* densifica antes: um segmento pode furar um canto do vizinho SEM ter
       vértice dentro — com vértices a cada passo o furo ganha vértice. */
    const r=cavaDensifica(novas[m].ring,passo);let mudou=false;
    for(let i=0;i<r.length;i++){
      if(!pointInRing(r[i][0],r[i][1],fundo))continue;
      /* pontos SOBRE a reta compartilhada (junta/tampa) ficam colineares
         com o vizinho — não são invasão; só grampeia invasão real. */
      {let bd2=1e18;
        for(let j3=0;j3<fundo.length;j3++){
          const a3=fundo[j3],b3=fundo[(j3+1)%fundo.length],
            dx=b3[0]-a3[0],dy=b3[1]-a3[1],qq=dx*dx+dy*dy,
            t=Math.max(0,Math.min(1,qq?((r[i][0]-a3[0])*dx+(r[i][1]-a3[1])*dy)/qq:0)),
            x=a3[0]+dx*t,y=a3[1]+dy*t,dd=(r[i][0]-x)**2+(r[i][1]-y)**2;
          if(dd<bd2)bd2=dd;
        }
        if(Math.sqrt(bd2)<0.12)continue;
      }
      /* projeta no anel mais fundo e empurra p/ fora */
      let bq=null,bd=Infinity;
      for(let j=0;j<fundo.length;j++){
        const a=fundo[j],b2=fundo[(j+1)%fundo.length],
          dx=b2[0]-a[0],dy=b2[1]-a[1],qq=dx*dx+dy*dy,
          t=Math.max(0,Math.min(1,qq?((r[i][0]-a[0])*dx+(r[i][1]-a[1])*dy)/qq:0)),
          x=a[0]+dx*t,y=a[1]+dy*t,dd=(r[i][0]-x)**2+(r[i][1]-y)**2;
        if(dd<bd){bd=dd;bq=[x,y,dx,dy];}
      }
      if(!bq)continue;
      let nx=bq[3],ny=-bq[2],Ln=Math.hypot(nx,ny)||1;nx/=Ln;ny/=Ln;
      if(pointInRing(bq[0]+nx*.05,bq[1]+ny*.05,fundo)){nx=-nx;ny=-ny;}
      r[i]=[bq[0]+nx*.3,bq[1]+ny*.3];mudou=true;
    }
    if(mudou){
      let q2=cavaAfinaAnel(r,passo*.3);
      if(q2.length>3&&cavaRingCruza(q2))q2=cavaDeloop(q2);
      if(q2.length>3)novas[m]={...novas[m],ring:q2};
    }
    /* reparo final: se algum segmento ainda cruzar o vizinho fundo,
       grampeia o ponto médio do segmento p/ fora e repete (até 3×). */
    for(let rep=0;rep<3;rep++){
      const rr=novas[m].ring,fd=novas[m+1].ring;let houve=false;
      for(let i=0;i<rr.length;i++){
        const a=rr[i],b2=rr[(i+1)%rr.length];
        for(let j=0;j<fd.length;j++){
          if(!cavaSegInter(a,b2,fd[j],fd[(j+1)%fd.length]))continue;
          const mx=(a[0]+b2[0])/2,my=(a[1]+b2[1])/2;
          let bq=null,bd=Infinity;
          for(let k2=0;k2<fd.length;k2++){
            const c2=fd[k2],d2=fd[(k2+1)%fd.length],
              dx=d2[0]-c2[0],dy=d2[1]-c2[1],qq=dx*dx+dy*dy,
              t=Math.max(0,Math.min(1,qq?((mx-c2[0])*dx+(my-c2[1])*dy)/qq:0)),
              x=c2[0]+dx*t,y=c2[1]+dy*t,dd=(mx-x)**2+(my-y)**2;
            if(dd<bd){bd=dd;bq=[x,y,dx,dy];}
          }
          if(!bq)continue;
          let nx=bq[3],ny=-bq[2],Ln=Math.hypot(nx,ny)||1;nx/=Ln;ny/=Ln;
          if(pointInRing(bq[0]+nx*.05,bq[1]+ny*.05,fd)){nx=-nx;ny=-ny;}
          rr.splice(i+1,0,[bq[0]+nx*.3,bq[1]+ny*.3]);
          houve=true;break;
        }
        if(houve)break;
      }
      if(!houve)break;
    }
  }
  /* ---------- PISTA DESLOCADA NAS VOLTAS SOBREPOSTAS (multi-volta) ----------
     Onde a volta seguinte passa POR BAIXO, o banco em que a pista assenta é
     empurrado W p/ fora — a pista da volta anterior desloca junto (o
     espaçamento natural entre bancos, run+berma, é MENOR que W: sem isso o
     anel deslocado invade o corredor natural da cota de cima — medido).
     PILHA no azimute θ: anéis logo ACIMA da pista a (k+1)·W, logo ABAIXO a
     k·W, com k = nº de passagens futuras = voltas líquidas restantes; o
     corredor ocupa exatamente a faixa entre as duas pilhas ⇒
       d = W·( floor((Uend−U)/2π) + taper de janela )
     U = ângulo desenrolado do vértice (só o número LÍQUIDO de voltas — sem
     azimute de ponto projetado, que falha no côncavo); o taper usa os
     MESMOS anchors em CADEIA dos anéis (proj. da ponta+margem → retorno no
     anel do pé da própria perna) e a mesma ss(dBack/Ttap): pista e anéis
     afunilam com o mesmo perfil físico, contínuo nas duas bordas da janela.
     Os pares empilhados das juntas (Pb+k·W·uB) já caem sobre esta pista
     deslocada; landings e capIni/capFim permanecem naturais. */
  if(!switchback&&retornoGlobal&&pathPts.length>2){
    const sgnPhi=Math.sign(phiPath[phiPath.length-1]-phiPath[0])||1,
      U=phiPath.map(v=>v*sgnPhi),Uend=U[U.length-1],
      margemT2=Math.max(B,2*passo),
      tipP=capFim?capFim.p:pathFim,
      dirA2=opt.dir==='ccw'?-1:1;
    for(const p of pernas){
      if(!p.a||!p.b||p._i0==null||!p._ringT)continue;
      /* quadro local: anel do pé densificado como nos anéis (passo*2) */
      const rdL=cavaDensifica(p._ringT,passo*2),chL=cavaChain(rdL),perL=chL.at(-1),
        circL=(a2,b2)=>dirA2>0?((b2-a2)%perL+perL)%perL:((a2-b2)%perL+perL)%perL,
        sTipL=anelAzimute(rdL,chL,tipP),
        sEL=anelAzimute(rdL,chL,retornoGlobal),
        janela=circL(sTipL,sEL),
        sIniTL=((sTipL+dirA2*margemT2)%perL+perL)%perL,
        TtapL=Math.max(passo*2,Math.min(perL*.9,circL(sIniTL,sEL)));
      /* janela e taper convertidos p/ ÂNGULO na cadeia deste anel: um único
         frame p/ contagem de wraps E taper — dois frames (floor por phi ×
         janela por cadeia) criavam lasca de dupla contagem na entrada da
         janela (espícula de +1W por 1–2 vértices, medida raspando o anel
         de cima no canto SE) */
      const angJan=janela/perL*2*Math.PI,
        angTtap=Math.max(1e-4,TtapL/perL*2*Math.PI),
        n0=p.aR.length-1||1,nA=p.a.length-1||1,
        ns=p.a.map((q,i)=>[(p.b[i][0]-q[0])/W,(p.b[i][1]-q[1])/W]);
      for(let i=0;i<p.a.length;i++){
        const iOr=Math.min(p.aR.length-1,Math.round(i*n0/nA)),
          fu=U[Math.min(U.length-1,p._i0+iOr)],
          D=Uend-fu;
        let d=0;
        for(let j=1;j<=8;j++){
          const t=D-2*Math.PI*j;
          if(t>=0){d+=1;continue;}      /* passagem completa antes da ponta */
          const g=-t;                    /* excesso além da ponta */
          if(g>=angJan)break;            /* fora da janela do retorno */
          const dBackA=angJan-g;         /* distância angular até o retorno */
          d+=dBackA>=angTtap?1:ss(dBackA/angTtap);
          break;
        }
        d*=W;
        if(d<1e-9)continue;
        p.a[i]=[p.a[i][0]+ns[i][0]*d,p.a[i][1]+ns[i][1]*d,p.a[i][2]];
        p.b[i]=[p.b[i][0]+ns[i][0]*d,p.b[i][1]+ns[i][1]*d,p.b[i][2]];
        p.seg[i]=[p.seg[i][0]+ns[i][0]*d,p.seg[i][1]+ns[i][1]*d,p.seg[i][2]];
      }
    }
  }
  /* ---------- feições/planos de saída ---------- */
  const mk=(pts,tipo)=>({geom:pts.map(p=>[p[0],p[1]]),multi:false,zg:pts.map(p=>p[2]),props:{
    TIPO:tipo,BANCO:null,COTA:null,ALTURA:opt.H,BERMA:W,ANGULO:opt.grade,CLASSE:'rampa'}});
  for(const p of pernas){
    if(p.a.length>1)vazio.features.push(mk(p.a,'Rampa — borda interna'));
    if(p.b.length>1)vazio.features.push(mk(p.b,'Rampa — borda externa'));
    if(p.seg.length>1&&p.tipo==='descida')vazio.features.push(mk(p.seg,'Rampa — eixo'));
    if(p.tipo==='descida'&&p.a.length>1&&p.b.length>1){
      /* contorno SÓ nas descidas, inteiras: o vão entre os quadriláteros é
         o PRÓPRIO PATAMAR (comprimento = berma), a métrica do DXF de
         exemplo do usuário. As BORDAS 3D permanecem contínuas — são elas
         que entram como breaklines do MDT. */
      const pts=p.a.concat(p.b.slice().reverse());
      if(Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])>1e-7)pts.push(pts[0].slice());
      vazio.polygons.push({geom:pts.map(q=>[q[0],q[1]]),zg:pts.map(q=>q[2])});
    }
    vazio.center.push(...p.seg);
  }
  /* SEM clipPolygons: os anéis são FECHADOS e nunca cortados — o desvio
     para fora já abre o espaço da pista, como no DXF de exemplo. */
  vazio.polygon=vazio.polygons[0]||null;
  return {linhas:novas,plan:vazio,warn};
}


function cavaRampaPlanoLegado74(linhas,opt){
  const vazio={features:[],cuts:new Map(),center:[],polygon:null,polygons:[],clipPolygons:[]};
  if(!opt.on||!(opt.width>0)||!(opt.grade>0)||!linhas.length)return vazio;
  /* Compatibilidade de projetos antigos: a receita 74 também usa o mesmo
     núcleo v77. Manter a implementação histórica ativa permitiria recriar
     rampas com regra diferente ao abrir um arquivo antigo. */
  if(typeof cavaRampaPlano==='function')
    return cavaRampaPlano(linhas,{...opt,
      control:opt.control||((+opt.dz>0)?'toe':'crest')});
  const faces=linhas.map((ln,i)=>({ln,i})).filter(q=>q.ln.tipo==='face');
  if(!faces.length)return vazio;
  vazio.control=opt.control||'auto';
  let dir=opt.dir==='ccw'?-1:1;
  const grade=opt.grade/100,
    passo=Math.max(.25,Math.min(1,opt.width/8)),
    /* A rampa volta a ser contínua: não existe intervalo independente entre
       bancos e, portanto, não há faixa sobreposta nem ponta triangular. */
    patamar=0,
    switchback=!!opt.switchback,
    switchEvery=Math.max(1,Math.round(+opt.switchEvery||1)),
    usaCota=opt.endMode==='elevation'&&Number.isFinite(+opt.endZ),
    cotaFim=+opt.endZ;
  let ancora=opt.start||linhas[0].ring[0],centro=[],zAtual=linhas[0].z;
  const pernas=[];
  for(let fi=0;fi<faces.length;fi++){
    const {ln,i}=faces[fi];
    /* Cada face é precedida pela sua CRISTA: [crista] → face → [pé].
       A versão anterior construía todo o eixo sobre o anel do pé (`ln.ring`);
       por isso a boca da rampa aparecia no meio do talude. Agora o primeiro
       ponto pertence rigorosamente à crista anterior e, ao longo do trecho,
       a planta migra progressivamente até o pé do banco. */
    const crista=linhas[Math.max(0,i-1)]||linhas[0];
    if(switchback&&fi>0&&fi%switchEvery===0)dir*=-1;
    const r=cavaDensifica(ln.ring,passo),ch=cavaChain(r),per=ch.at(-1),
      rCrista=cavaDensifica(crista.ring,passo),chCrista=cavaChain(rCrista),
      perCrista=chCrista.at(-1);
    if(!(per>opt.width*2)||!(perCrista>opt.width*2))continue;
    if(usaCota&&((opt.dz<0&&zAtual<=cotaFim+1e-6)||(opt.dz>0&&zAtual>=cotaFim-1e-6)))break;
    let zFim=ln.z,encerra=false;
    if(usaCota&&((opt.dz<0&&ln.z<=cotaFim)||(opt.dz>0&&ln.z>=cotaFim))){
      zFim=cotaFim;encerra=true;
    }
    let s0Crista=cavaNearestChain(rCrista,chCrista,ancora),seg=[];
    /* A concordância é construída depois que as duas bordas do novo trecho
       estiverem prontas. Criá-la antes, a partir de uma normal do eixo,
       produzia a ponta triangular mostrada no mapa. */
    const pEntrada=cavaPointChain(rCrista,chCrista,s0Crista),
      s0Pe=cavaNearestChain(r,ch,pEntrada);
    const requerido=Math.abs(zFim-zAtual)/grade,
      len=Math.min(Math.max(passo,requerido),
        Math.max(passo,Math.min(per,perCrista)-opt.width*2)),
      zAlcancada=zAtual+Math.sign(zFim-zAtual||opt.dz||-1)*grade*len,
      zTermino=Math.abs(zAlcancada-zAtual)>Math.abs(zFim-zAtual)?zFim:zAlcancada,
      np=Math.max(12,Math.ceil(len/passo));
    for(let j=0;j<=np;j++){
      const t=j/np,
        pc=cavaPointChain(rCrista,chCrista,s0Crista+dir*len*t),
        pp=cavaPointChain(r,ch,s0Pe+dir*len*t);
      /* t=0: exatamente na crista; t=1: exatamente no pé. Não há ponto
         inicial arbitrário dentro do plano do talude. */
      seg.push([pc[0]+(pp[0]-pc[0])*t,pc[1]+(pp[1]-pc[1])*t,
        zAtual+(zTermino-zAtual)*t]);
    }
    let a=[],b=[];
    /* A pista não é centralizada sobre a crista. A borda de montante nasce
       exatamente nela e toda a largura avança para o lado do pé do banco.
       Centralizar (± largura/2) era o motivo visual de a boca começar no meio
       do talude, embora o eixo matemático estivesse sobre a crista. */
    for(let j=0;j<seg.length;j++){
      const p=seg[Math.max(0,j-1)],q=seg[Math.min(seg.length-1,j+1)],
        dx=q[0]-p[0],dy=q[1]-p[1],L=Math.hypot(dx,dy)||1,nx=-dy/L,ny=dx/L,
        t=j/Math.max(1,seg.length-1),
        pc=cavaPointChain(rCrista,chCrista,s0Crista+dir*len*t),
        pp=cavaPointChain(r,ch,s0Pe+dir*len*t),
        lado=(nx*(pp[0]-pc[0])+ny*(pp[1]-pc[1]))>=0?1:-1;
      a.push([seg[j][0],seg[j][1],seg[j][2]]);
      b.push([seg[j][0]+nx*opt.width*lado,seg[j][1]+ny*opt.width*lado,seg[j][2]]);
    }
    /* Costura topológica e altimétrica da chegada. A seção inicial inteira
       pertence à crista e a seção final inteira pertence ao pé. Portanto,
       não basta o eixo (borda A) tocar o anel: a borda B também é projetada
       no MESMO anel e recebe exatamente o mesmo Z. Isto elimina cunhas,
       travessas inclinadas e pontas suspensas no 3D sem suavizar a rampa. */
    if(a.length&&b.length){
      a[0]=cavaPrendeNoAnel(rCrista,chCrista,a[0],zAtual);
      b[0]=cavaPrendeNoAnel(rCrista,chCrista,b[0],zAtual);
      a[a.length-1]=cavaPrendeNoAnel(r,ch,a.at(-1),zTermino);
      b[b.length-1]=cavaPrendeNoAnel(r,ch,b.at(-1),zTermino);
      /* O eixo analítico é a média das bordas já costuradas. Assim as curvas
         transversais e o polígono da pista compartilham os mesmos nós. */
      seg[0]=[(a[0][0]+b[0][0])/2,(a[0][1]+b[0][1])/2,zAtual];
      seg[seg.length-1]=[(a.at(-1)[0]+b.at(-1)[0])/2,
        (a.at(-1)[1]+b.at(-1)[1])/2,zTermino];
    }
    /* Na inversão do switchback, esquerda/direita trocam. Reassocia as
       bordas pela menor distância para impedir a diagonal que cruzaria a
       pista entre um trecho e o seguinte. */
    if(pernas.length&&a.length){
      const pa=pernas.at(-1).a.at(-1),pb=pernas.at(-1).b.at(-1),
        normal=Math.hypot(pa[0]-a[0],pa[1]-a[1])+Math.hypot(pb[0]-b[0],pb[1]-b[1]),
        trocado=Math.hypot(pa[0]-b[0],pa[1]-b[1])+Math.hypot(pb[0]-a[0],pb[1]-a[1]);
      if(trocado<normal){const t=a;a=b;b=t;}
    }
    /* Patamar contínuo, sem espaço: liga literalmente os quatro cantos do
       trecho anterior aos quatro cantos do novo trecho. Como zAtual é a
       chegada anterior e também a partida atual, esta união é plana. Ela
       não recalcula crista, pé, berma ou ângulo de talude. */
    if(pernas.length&&a.length&&b.length){
      const prev=pernas.at(-1),pa=prev.a.at(-1),pb=prev.b.at(-1),
        da=Math.hypot(pa[0]-a[0][0],pa[1]-a[0][1]),
        db=Math.hypot(pb[0]-b[0][0],pb[1]-b[0][1]);
      if(Math.max(da,db)>1e-7){
        const ca=[pa.slice(),a[0].slice()],cb=[pb.slice(),b[0].slice()],
          cm=ca.map((q,k)=>[(q[0]+cb[k][0])/2,(q[1]+cb[k][1])/2,zAtual]);
        pernas.push({a:ca,b:cb,seg:cm,tipo:'concordancia'});
        centro.push(cm[1]);
      }
    }
    pernas.push({a,b,seg,tipo:'descida'});
    centro.push(...seg);
    /* Cada anel deve ser aberto pela seção que realmente o intercepta.
       Antes, a entrada da borda A era combinada com a chegada da borda B em
       ambos os anéis. Isso torcia o recorte e deixava um degrau/diagonal na
       chegada. A crista usa os dois pontos de entrada; o pé usa os dois
       pontos de chegada, sempre na mesma cota transversal. */
    const secoes=[];
    if(i>0)secoes.push({ix:i-1,pa:a[0],pb:b[0]});
    secoes.push({ix:i,pa:a.at(-1),pb:b.at(-1)});
    for(const s of secoes){
      const rr=cavaDensifica(linhas[s.ix].ring,passo),cc=cavaChain(rr),
        aa=cavaNearestChain(rr,cc,s.pa),bb=cavaNearestChain(rr,cc,s.pb);
      const corte=cavaRingRemanescente(rr,aa,bb,dir,passo);
      if(corte.length>1){
        /* A linha restante e a rampa compartilham literalmente os mesmos
           nós. Isso vale para crista e pé e também para seus valores Z. */
        const normal=Math.hypot(corte[0][0]-s.pb[0],corte[0][1]-s.pb[1])+
          Math.hypot(corte.at(-1)[0]-s.pa[0],corte.at(-1)[1]-s.pa[1]),
          inverso=Math.hypot(corte[0][0]-s.pa[0],corte[0][1]-s.pa[1])+
          Math.hypot(corte.at(-1)[0]-s.pb[0],corte.at(-1)[1]-s.pb[1]);
        if(inverso<normal)corte.reverse();
        corte[0]=[s.pb[0],s.pb[1]];
        corte[corte.length-1]=[s.pa[0],s.pa[1]];
      }
      vazio.cuts.set(s.ix,corte);
    }
    ancora=seg.at(-1);zAtual=zTermino;
    if(encerra)break;
  }
  const mk=(pts,tipo)=>({geom:pts.map(p=>[p[0],p[1]]),multi:false,zg:pts.map(p=>p[2]),props:{
    TIPO:tipo,BANCO:null,COTA:null,ALTURA:opt.H,BERMA:opt.width,ANGULO:opt.grade,CLASSE:'rampa'}});
  /* Primeiro mantém os pares de bordas de cada perna consecutivos. O gerador
     do MDT usa exatamente esses pares como breaklines da superfície. */
  for(const p of pernas){
    if(p.a.length>1)vazio.features.push(mk(p.a,'Rampa — borda interna'));
    if(p.b.length>1)vazio.features.push(mk(p.b,'Rampa — borda externa'));
    /* Curvas transversais da pista: deixam explícita a progressão de cotas e
       entram como breaklines. Ao contrário de uma interpolação suavizada,
       cada linha liga diretamente as duas bordas na mesma cota. */
    if(p.tipo==='descida'&&p.seg.length>2){
      const zi=p.seg[0][2],zf=p.seg.at(-1)[2],
        dzc=Math.max(.5,Math.min(2,Math.abs(opt.H||5)/5)),
        lo=Math.min(zi,zf),hi=Math.max(zi,zf);
      for(let zc=Math.ceil((lo+1e-7)/dzc)*dzc;zc<hi-1e-7;zc+=dzc){
        let j=1;while(j<p.seg.length&&
          !((p.seg[j-1][2]-zc)*(p.seg[j][2]-zc)<=0))j++;
        if(j>=p.seg.length)continue;
        const z0=p.seg[j-1][2],z1=p.seg[j][2],
          t=Math.abs(z1-z0)>1e-9?(zc-z0)/(z1-z0):0,
          qa=[p.a[j-1][0]+(p.a[j][0]-p.a[j-1][0])*t,
            p.a[j-1][1]+(p.a[j][1]-p.a[j-1][1])*t,zc],
          qb=[p.b[j-1][0]+(p.b[j][0]-p.b[j-1][0])*t,
            p.b[j-1][1]+(p.b[j][1]-p.b[j-1][1])*t,zc];
        vazio.features.push(mk([qa,qb],'Rampa — curva de nível'));
      }
    }
    /* Mascara tecnica local. Cada banco sera recortado apenas pela perna
       que cruza sua propria cota; jamais pelo corredor completo em outro
       lado de uma cava concava. Esta mascara nao e desenhada. */
    if(p.a.length>1&&p.b.length>1){
      const pts=p.a.concat(p.b.slice().reverse());
      if(Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])>1e-7)pts.push(pts[0].slice());
      vazio.clipPolygons.push({geom:pts.map(q=>[q[0],q[1]]),zg:pts.map(q=>q[2])});
    }
  }
  /* A rampa construtiva e um UNICO corredor. Desenhar um poligono para
     cada face/berma deixava juntas, bicos triangulares e sobreposicoes nos
     encontros. As pernas ja estao topologicamente ordenadas; concatena-se
     toda a borda de crista e toda a borda de pe, retirando apenas o no
     repetido de cada costura. O fecho ocorre somente entre as duas secoes
     extremas, exatamente como no desenho de referencia. */
  const bordaA=[],bordaB=[],anexa=(dst,src)=>{
    for(const q of src||[]){
      const p=q.slice(),u=dst.at(-1);
      if(!u||Math.hypot(u[0]-p[0],u[1]-p[1])>1e-7||Math.abs((u[2]||0)-(p[2]||0))>1e-7)dst.push(p);
    }
  };
  for(const p of pernas){anexa(bordaA,p.a);anexa(bordaB,p.b);}
  if(bordaA.length>2&&bordaB.length>2){
    const pts=bordaA.concat(bordaB.slice().reverse());
    if(Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])>1e-7)pts.push(pts[0].slice());
    vazio.polygons.push({geom:pts.map(q=>[q[0],q[1]]),zg:pts.map(q=>q[2])});
  }
  vazio.polygon=vazio.polygons[0]||null;
  vazio.center=centro;return vazio;
}
/* ============================================================
   RAMPA TRAFEGÁVEL 3D (v76)
   - cada face tem faixa própria e recorta somente seu pé/crista;
   - PILHA: o desenvolvimento acompanha a linha de PÉ;
   - CAVA: o desenvolvimento acompanha a linha de CRISTA;
   - greide calculado pela distância horizontal realmente percorrida;
   - cada ponto da descida/subida pertence à superfície regrada entre
     crista e pé, preservando a geometria do ângulo do talude;
   - a berma é atravessada mantendo o rumo de chegada;
   - largura constante, eixo e bordas contínuos; as duas bordas cruzam
     crista/pé em pontos próprios, em vez de serem colapsadas por projeção.
   ============================================================ */
function cavaRampaPlano(linhas,opt){
  const vazio={features:[],cuts:new Map(),center:[],polygon:null,
    polygons:[],clipPolygons:[],trafegavel3d:true};
  if(!opt.on||!(opt.width>0)||!(opt.grade>0)||!linhas.length)return vazio;
  const faces=linhas.map((ln,i)=>({ln,i})).filter(q=>q.ln.tipo==='face');
  if(!faces.length)return vazio;
  vazio.control=opt.control||'auto';

  const W=+opt.width,grade=+opt.grade/100,
    passo=Math.max(.25,Math.min(.8,W/12)),
    dirBase=opt.dir==='ccw'?-1:1,
    switchback=!!opt.switchback,
    switchEvery=Math.max(1,Math.round(+opt.switchEvery||1)),
    usaCota=opt.endMode==='elevation'&&Number.isFinite(+opt.endZ),
    cotaFim=+opt.endZ,
    eps=1e-7;
  const trajetoria=[],refs=[],trechos=[],faixas=[];
  let aviso='';

  const addP=(p,ref,tag)=>{
    if(!p||!Number.isFinite(p[0])||!Number.isFinite(p[1])||!Number.isFinite(p[2]))return;
    const u=trajetoria.at(-1);
    if(u&&Math.hypot(u[0]-p[0],u[1]-p[1])<1e-8&&Math.abs(u[2]-p[2])<1e-8){
      if(ref&&Math.hypot(ref[0]||0,ref[1]||0)>1e-9)refs[refs.length-1]=ref.slice(0,2);
      return;
    }
    trajetoria.push(p.slice());refs.push(ref?ref.slice(0,2):[0,0]);
    if(tag)trechos.push({i:trajetoria.length-1,tag});
  };
  const ringDenso=r=>cavaDensifica((r||[]).map(p=>[p[0],p[1]]),passo);
  const ringIntermediario=(ra,rb,f)=>{
    f=Math.max(0,Math.min(1,f));
    const A=ringDenso(ra),B=ringDenso(rb),ca=cavaChain(A),cb=cavaChain(B),
      pa=ca.at(-1),pb=cb.at(-1),n=Math.max(48,Math.ceil(Math.max(pa,pb)/passo)),out=[];
    const a0=cavaNearestChain(A,ca,A[0]),b0=cavaNearestChain(B,cb,A[0]);
    for(let k=0;k<n;k++){
      const u=k/n,a=cavaPointChain(A,ca,a0+u*pa),b=cavaPointChain(B,cb,b0+u*pb);
      out.push([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f]);
    }
    return out;
  };
  const tangenteAnel=(r,ch,s,dir)=>{
    const h=Math.max(.15,passo*.75),a=cavaPointChain(r,ch,s-dir*h),b=cavaPointChain(r,ch,s+dir*h),
      dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy)||1;
    return [dx/L,dy/L];
  };
  const projNoAnel=(ring,p)=>{
    const r=ringDenso(ring),ch=cavaChain(r),s=cavaNearestChain(r,ch,p),q=cavaPointChain(r,ch,s);
    return {r,ch,s,p:q};
  };
  const cruzaRaioAnel=(P,d,ring)=>{
    const Ld=Math.hypot(d[0],d[1])||1,ux=d[0]/Ld,uy=d[1]/Ld;
    let best=null;
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length],vx=b[0]-a[0],vy=b[1]-a[1],
        den=ux*vy-uy*vx;
      if(Math.abs(den)<1e-11)continue;
      const wx=a[0]-P[0],wy=a[1]-P[1],t=(wx*vy-wy*vx)/den,
        u=(wx*uy-wy*ux)/den;
      if(t>1e-5&&u>=-1e-8&&u<=1+1e-8&&(!best||t<best.t))
        best={p:[P[0]+ux*t,P[1]+uy*t],t};
    }
    return best;
  };
  const appendReta=(A,B,z,ref,tag)=>{
    const i0=Math.max(0,trajetoria.length-1);
    const L=Math.hypot(B[0]-A[0],B[1]-A[1]),n=Math.max(1,Math.ceil(L/passo));
    for(let j=0;j<=n;j++){
      const t=j/n;addP([A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t,z],ref,tag&&j===0?tag:null);
    }
    return {i0,i1:trajetoria.length-1,tipo:tag||'berma',z};
  };
  /* Curva de retorno sobre a berma. É usada só quando o usuário pediu
     switchback; o raio interno automático evita a antiga dobra pontual. */
  const appendRetorno=(A,tA,anel,z,dirNovo,ref)=>{
    const i0=Math.max(0,trajetoria.length-1);
    const Q=projNoAnel(anel,A),Rmin=Math.max(W*1.25,2.5),
      sFim=Q.s+dirNovo*Math.PI*Rmin,
      B=cavaPointChain(Q.r,Q.ch,sFim),tB=tangenteAnel(Q.r,Q.ch,sFim,dirNovo),
      c=Math.min(Rmin*1.35,Math.max(Rmin*.8,Math.hypot(B[0]-A[0],B[1]-A[1])*.45)),
      C1=[A[0]+tA[0]*c,A[1]+tA[1]*c],C2=[B[0]-tB[0]*c,B[1]-tB[1]*c],
      n=Math.max(12,Math.ceil(Math.PI*Rmin/passo));
    for(let j=0;j<=n;j++){
      const t=j/n,u=1-t,
        x=u*u*u*A[0]+3*u*u*t*C1[0]+3*u*t*t*C2[0]+t*t*t*B[0],
        y=u*u*u*A[1]+3*u*u*t*C1[1]+3*u*t*t*C2[1]+t*t*t*B[1];
      addP([x,y,z],ref,j===0?'retorno':null);
    }
    return {p:B,faixa:{i0,i1:trajetoria.length-1,tipo:'retorno',z}};
  };

  /* Caminho sobre UMA face. Para cada passo horizontal ds, dz=greide*ds.
     O XY é interpolado entre pontos homólogos dos dois anéis pela fração
     vertical lambda. Assim o greide usa o comprimento real e o ponto nunca
     abandona a superfície definida pelo pé/crista do talude. */
  const appendFace=(A,B,ancora,dir,fi)=>{
    const i0=Math.max(0,trajetoria.length-1);
    const rA=ringDenso(A.ring),rB=ringDenso(B.ring),chA=cavaChain(rA),chB=cavaChain(rB),
      perA=chA.at(-1),perB=chB.at(-1);
    if(!(perA>W*2)||!(perB>W*2))return null;
    const sA=cavaNearestChain(rA,chA,ancora),p0=cavaPointChain(rA,chA,sA),dz=B.z-A.z;
    let Lreq=Math.abs(dz)/grade,Lmax=Math.min(perA,perB)*.94;
    if(Lreq>Lmax){
      aviso=`A face ${B.bench||fi+1} exigia ${Lreq.toFixed(1)} m para o greide `+
        `${(+opt.grade).toFixed(2)}%, mas dispõe de ${Lmax.toFixed(1)} m; o greide local foi ajustado.`;
      Lreq=Lmax;
    }
    if(!(Lreq>passo))return null;
    const n=Math.max(16,Math.ceil(Lreq/passo)),ds=Lreq/n,
      gLocal=Math.abs(dz)/Lreq;
    let av=0,prev=p0;
    const ponto=(avance,lam)=>{
      const pa=cavaPointChain(rA,chA,sA+dir*avance),
        /* Correspondência NORMAL real: o ponto homólogo no segundo anel é
           a projeção mínima do ponto da primeira linha. Usar a mesma fração
           de perímetro deslocava as quinas e fazia a rampa sair até ~0,5 m
           da face teórica, alterando localmente o ângulo do talude. */
        sb=cavaNearestChain(rB,chB,pa),pb=cavaPointChain(rB,chB,sb);
      return {p:[pa[0]+(pb[0]-pa[0])*lam,pa[1]+(pb[1]-pa[1])*lam,
        A.z+dz*lam],ref:[pb[0]-pa[0],pb[1]-pa[1]]};
    };
    let q0=ponto(0,0);addP(q0.p,q0.ref,'face-'+fi);
    for(let j=1;j<=n;j++){
      const lam=j/n;
      /* Resolve o avanço ao longo dos anéis para que a corda horizontal
         deste passo tenha exatamente ds. */
      let lo=0,hi=ds*1.35,cand=ponto(av+hi,lam),d=Math.hypot(cand.p[0]-prev[0],cand.p[1]-prev[1]);
      for(let ex=0;ex<8&&d<ds;ex++){
        hi*=1.7;cand=ponto(av+hi,lam);d=Math.hypot(cand.p[0]-prev[0],cand.p[1]-prev[1]);
      }
      const d0=Math.hypot(ponto(av,lam).p[0]-prev[0],ponto(av,lam).p[1]-prev[1]);
      if(d0<=ds&&d>=ds){
        for(let it=0;it<24;it++){
          const m=(lo+hi)/2,q=ponto(av+m,lam),dm=Math.hypot(q.p[0]-prev[0],q.p[1]-prev[1]);
          if(dm<ds)lo=m;else hi=m;
        }
        av+=(lo+hi)/2;
      }else av+=Math.max(0,hi);
      const q=ponto(av,lam);q.p[2]=A.z+Math.sign(dz||1)*gLocal*(Lreq*j/n);
      if(j===n)q.p[2]=B.z;
      addP(q.p,q.ref);prev=q.p;
    }
    /* O último ponto pertence literalmente ao anel de chegada. */
    const ult=trajetoria.at(-1),pr=projNoAnel(B.ring,ult);
    ult[0]=pr.p[0];ult[1]=pr.p[1];ult[2]=B.z;
    const nT=trajetoria.length,tg=nT>1?[ult[0]-trajetoria[nT-2][0],ult[1]-trajetoria[nT-2][1]]:[1,0],
      Lt=Math.hypot(tg[0],tg[1])||1;
    return {p:ult.slice(),t:[tg[0]/Lt,tg[1]/Lt],ref:refs.at(-1).slice(),
      z:B.z,ringA:A.ring,ringB:B.ring,grade:gLocal,
      faixa:{i0,i1:trajetoria.length-1,tipo:'face',ringIni:A.ring,ringFim:B.ring,
        zIni:A.z,zFim:B.z,banco:B.bench,controle:opt.control||'auto'}};
  };

  let ancora=(opt.start||linhas[0].ring[0]).slice(),prevFace=null,
    primeiroAnel=null,ultimoAnel=null,zAtual=linhas[0].z;
  for(let fi=0;fi<faces.length;fi++){
    const {ln:B,i}=faces[fi],A=linhas[Math.max(0,i-1)],
      dir=dirBase*(switchback&&(Math.floor(fi/switchEvery)%2)?-1:1);
    if(usaCota&&((B.z<A.z&&zAtual<=cotaFim+1e-6)||(B.z>A.z&&zAtual>=cotaFim-1e-6)))break;
    let Buse=B;
    if(usaCota&&((B.z<A.z&&B.z<cotaFim)||(B.z>A.z&&B.z>cotaFim))){
      const f=Math.abs(B.z-A.z)>1e-9?(cotaFim-A.z)/(B.z-A.z):0;
      Buse={...B,z:cotaFim,ring:ringIntermediario(A.ring,B.ring,f)};
    }
    /* Entre faces existe uma berma. A ligação avança na direção em que o
       caminhão chegou até interceptar o anel seguinte; não busca o ponto
       euclidiano mais próximo (que gerava o V quase ortogonal). */
    if(prevFace&&Math.hypot(prevFace.p[0]-ancora[0],prevFace.p[1]-ancora[1])<eps){
      const ref=[A.ring[0][0]-prevFace.p[0],A.ring[0][1]-prevFace.p[1]];
      if(dir!==prevFace.dir){
        const ret=appendRetorno(prevFace.p,prevFace.t,A.ring,A.z,dir,prevFace.ref);
        ancora=ret.p;faixas.push(ret.faixa);
      }else{
        const hit=cruzaRaioAnel(prevFace.p,prevFace.t,ringDenso(A.ring));
        if(hit&&hit.t<Math.max(500,W*40)){
          faixas.push(appendReta(prevFace.p,hit.p,A.z,prevFace.ref,'berma'));ancora=hit.p;
        }else{
          /* Fallback côncavo: projeta um ponto à frente, nunca o próprio
             extremo. Conserva componente longitudinal e evita a travessia
             radial curta da versão 74. */
          const alvo=[prevFace.p[0]+prevFace.t[0]*Math.max(W*2,+opt.berm*3||W*2),
            prevFace.p[1]+prevFace.t[1]*Math.max(W*2,+opt.berm*3||W*2)],
            q=projNoAnel(A.ring,alvo);
          faixas.push(appendReta(prevFace.p,q.p,A.z,prevFace.ref,'berma-fallback'));ancora=q.p;
        }
      }
    }else{
      const q=projNoAnel(A.ring,ancora);ancora=q.p;
    }
    if(!primeiroAnel)primeiroAnel=A.ring;
    const face=appendFace(A,Buse,ancora,dir,fi);if(!face)continue;
    faixas.push(face.faixa);
    face.dir=dir;prevFace=face;ancora=face.p.slice();ultimoAnel=B.ring;zAtual=Buse.z;
    if(usaCota&&Math.abs(zAtual-cotaFim)<1e-6)break;
  }
  if(trajetoria.length<3)return vazio;

  /* Normais contínuas do corredor. A referência crista→pé escolhe sempre
     o mesmo lado físico; a média local elimina picos de mitra nas quinas. */
  const normals=[];
  for(let i=0;i<trajetoria.length;i++){
    const p=trajetoria[Math.max(0,i-1)],q=trajetoria[Math.min(trajetoria.length-1,i+1)],
      dx=q[0]-p[0],dy=q[1]-p[1],L=Math.hypot(dx,dy)||1;
    let nx=-dy/L,ny=dx/L,ref=refs[i]||[0,0];
    /* Depois do primeiro ponto, a continuidade da normal tem precedência.
       Reforçar o lado crista→pé em cada amostra fazia a normal inverter de
       uma vez no retorno e deslocava o eixo quase uma largura inteira. */
    if(i){if(nx*normals[i-1][0]+ny*normals[i-1][1]<0){nx=-nx;ny=-ny;}}
    else if(Math.hypot(ref[0],ref[1])>1e-8&&nx*ref[0]+ny*ref[1]<0){nx=-nx;ny=-ny;}
    normals.push([nx,ny]);
  }
  for(let pass=0;pass<2;pass++)for(let i=1;i<normals.length-1;i++){
    let nx=normals[i-1][0]+2*normals[i][0]+normals[i+1][0],
      ny=normals[i-1][1]+2*normals[i][1]+normals[i+1][1],L=Math.hypot(nx,ny)||1;
    normals[i]=[nx/L,ny/L];
  }
  /* A trajetória calculada sobre a superfície crista↔pé é a BORDA DE
     CONTROLE da rampa. Por isso ela conserva o ângulo da face: na pilha
     nasce no pé; na cava nasce na crista. A pista inteira abre para um só
     lado, e não ±W/2 para os dois lados (o que tirava ambas as bordas da
     face teórica e produzia a leitura angular errada mostrada na Régua). */
  const bordaAFull=trajetoria.map(p=>p.slice()),
    bordaBFull=trajetoria.map((p,i)=>[p[0]+normals[i][0]*W,p[1]+normals[i][1]*W,p[2]]),
    eixo=trajetoria.map((p,i)=>[p[0]+normals[i][0]*W/2,p[1]+normals[i][1]*W/2,p[2]]);

  const segInter=(a,b,c,d)=>{
    const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],den=rx*sy-ry*sx;
    if(Math.abs(den)<1e-12)return null;
    const qx=c[0]-a[0],qy=c[1]-a[1],t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
    if(t<-1e-8||t>1+1e-8||u<-1e-8||u>1+1e-8)return null;
    return {t:Math.max(0,Math.min(1,t)),p:[a[0]+rx*t,a[1]+ry*t]};
  };
  const hitsPolyRing=(poly,ring)=>{
    const hs=[];
    for(let i=1;i<poly.length;i++)for(let j=0;j<ring.length;j++){
      const h=segInter(poly[i-1],poly[i],ring[j],ring[(j+1)%ring.length]);
      if(h&&!hs.some(x=>Math.hypot(x.p[0]-h.p[0],x.p[1]-h.p[1])<1e-6))
        hs.push({i,t:h.t,p:h.p});
    }
    return hs.sort((a,b)=>(a.i-1+a.t)-(b.i-1+b.t));
  };
  /* Estende as paralelas antes de recortá-las. Em uma rampa oblíqua, cada
     borda cruza a crista/pé em uma progressiva diferente; começar as duas
     na mesma seção era justamente o triângulo/V da versão anterior. */
  const estende=borda=>{
    const p0=eixo[0],p1=eixo[Math.min(eixo.length-1,2)],
      q0=eixo[Math.max(0,eixo.length-3)],q1=eixo.at(-1),
      n0=Math.hypot(p1[0]-p0[0],p1[1]-p0[1])||1,
      n1=Math.hypot(q1[0]-q0[0],q1[1]-q0[1])||1,Lext=Math.max(W*3,12),
      a=borda[0],b=borda.at(-1);
    return [[a[0]-(p1[0]-p0[0])/n0*Lext,a[1]-(p1[1]-p0[1])/n0*Lext,a[2]]]
      .concat(borda.map(p=>p.slice()),
        [[b[0]+(q1[0]-q0[0])/n1*Lext,b[1]+(q1[1]-q0[1])/n1*Lext,b[2]]]);
  };
  const aExt=estende(bordaAFull),bExt=estende(bordaBFull),
    recortaBorda=poly=>{
      let ini={i:1,t:0,p:[poly[1][0],poly[1][1]]},
        fim={i:poly.length-1,t:1,p:[poly.at(-2)[0],poly.at(-2)[1]]};
      if(primeiroAnel){const hs=hitsPolyRing(poly,ringDenso(primeiroAnel));if(hs.length)ini=hs[0];}
      if(ultimoAnel){const hs=hitsPolyRing(poly,ringDenso(ultimoAnel));if(hs.length)fim=hs.at(-1);}
      const sIni=ini.i-1+ini.t,sFim=fim.i-1+fim.t;
      if(sFim<=sIni+1e-7)return poly.slice(1,-1);
      const out=[[ini.p[0],ini.p[1],eixo[0][2]]];
      for(let k=ini.i;k<fim.i;k++)out.push(poly[k].slice());
      out.push([fim.p[0],fim.p[1],eixo.at(-1)[2]]);
      return out;
    };
  let bordaA=recortaBorda(aExt),bordaB=recortaBorda(bExt);
  if(bordaA.length<2)bordaA=bordaAFull.map(p=>p.slice());
  if(bordaB.length<2)bordaB=bordaBFull.map(p=>p.slice());

  const arcoCurto=(ring,P,Q,z)=>{
    const r=ringDenso(ring),ch=cavaChain(r),per=ch.at(-1),s0=cavaNearestChain(r,ch,P),s1=cavaNearestChain(r,ch,Q),
      d1=(s1-s0+per)%per,d2=(s0-s1+per)%per,dir=d1<=d2?1:-1,
      pts=cavaRingIntervalo(r,s0,s1,dir,Math.max(.15,passo*.6));
    if(pts.length){pts[0]=[P[0],P[1]];pts[pts.length-1]=[Q[0],Q[1]];}
    return pts.map(p=>[p[0],p[1],z]);
  };
  /* FAIXAS LOCAIS POR FACE. O erro da v75 foi procurar entrada e saída nas
     bordas do corredor de TODAS as bancadas. Uma borda podia então usar a
     interseção de outro nível, e o mesmo polígono recortava anéis vizinhos,
     formando laços. Aqui cada face conhece somente seu pé e sua crista. */
  const faixaPoligono=f=>{
    let i0=Math.max(0,Math.min(trajetoria.length-1,+f.i0||0)),
      i1=Math.max(i0+1,Math.min(trajetoria.length-1,+f.i1||i0+1));
    let A=bordaAFull.slice(i0,i1+1).map(p=>p.slice()),
      B=bordaBFull.slice(i0,i1+1).map(p=>p.slice());
    if(A.length<2||B.length<2)return null;
    const estendeLocal=arr=>{
      const p0=eixo[i0],p1=eixo[Math.min(eixo.length-1,i0+2)],
        q0=eixo[Math.max(0,i1-2)],q1=eixo[i1],
        l0=Math.hypot(p1[0]-p0[0],p1[1]-p0[1])||1,
        l1=Math.hypot(q1[0]-q0[0],q1[1]-q0[1])||1,L=Math.max(W*2.5,10),
        a=arr[0],b=arr.at(-1);
      return [[a[0]-(p1[0]-p0[0])/l0*L,a[1]-(p1[1]-p0[1])/l0*L,a[2]]]
        .concat(arr,[[b[0]+(q1[0]-q0[0])/l1*L,b[1]+(q1[1]-q0[1])/l1*L,b[2]]]);
    };
    const recLocal=(arr,rIni,rFim,zIni,zFim)=>{
      const ex=estendeLocal(arr),h0=hitsPolyRing(ex,ringDenso(rIni)),
        h1=hitsPolyRing(ex,ringDenso(rFim));
      if(!h0.length||!h1.length)return arr;
      const ini=h0[0],fim=h1.at(-1),s0=ini.i-1+ini.t,s1=fim.i-1+fim.t;
      if(!(s1>s0+1e-7))return arr;
      const out=[[ini.p[0],ini.p[1],zIni]];
      for(let k=ini.i;k<fim.i;k++)out.push(ex[k].slice());
      out.push([fim.p[0],fim.p[1],zFim]);return out;
    };
    if(f.tipo==='face'&&f.ringIni&&f.ringFim){
      A=recLocal(A,f.ringIni,f.ringFim,f.zIni,f.zFim);
      B=recLocal(B,f.ringIni,f.ringFim,f.zIni,f.zFim);
    }
    /* Une os quadriláteros elementares da faixa. Em curvas fechadas, uma
       paralela pode se sobrepor a si própria; concatenar as duas bordas
       preservaria esse laço. A união booleana devolve somente o contorno
       exterior válido — exatamente a área realmente ocupada pela pista. */
    if(typeof polygonClipping!=='undefined'&&A.length===B.length&&A.length>1){
      try{
        const quads=[];
        for(let k=1;k<A.length;k++){
          const r=[[A[k-1][0],A[k-1][1]],[A[k][0],A[k][1]],
            [B[k][0],B[k][1]],[B[k-1][0],B[k-1][1]],[A[k-1][0],A[k-1][1]]];
          if(Math.abs((r[1][0]-r[0][0])*(r[2][1]-r[0][1])-
            (r[1][1]-r[0][1])*(r[2][0]-r[0][0]))>1e-10)quads.push([r]);
        }
        const un=quads.length?polygonClipping.union(...quads):[],area=r=>Math.abs(cavaArea2(r));
        let best=null,ba=-1;
        for(const poly of un||[]){const r=poly&&poly[0];if(r&&r.length>=4&&area(r)>ba){best=r;ba=area(r);}}
        if(best){
          const zNo=p=>{let bd=Infinity,bz=A[0][2];
            for(let k=1;k<trajetoria.length&&k<=i1;k++){
              if(k<i0+1)continue;const a=trajetoria[k-1],b=trajetoria[k],dx=b[0]-a[0],dy=b[1]-a[1],
                d=dx*dx+dy*dy,t=Math.max(0,Math.min(1,d?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d:0)),
                x=a[0]+dx*t,y=a[1]+dy*t,e=(p[0]-x)**2+(p[1]-y)**2;
              if(e<bd){bd=e;bz=a[2]+(b[2]-a[2])*t;}
            }return bz;};
          return {geom:best.map(p=>[p[0],p[1]]),zg:best.map(zNo),_tipo:f.tipo,
            _banco:f.banco,_controle:f.controle};
        }
      }catch(e){console.warn('união local da faixa de rampa',e);}
    }
    const pts=A.map(p=>p.slice());
    /* A tampa é a seção reta da pista entre as duas bordas já recortadas
       no mesmo pé/crista. Seguir o arco do anel entre esses pontos podia
       escolher o lado longo em geometria côncava e cruzar o corpo da faixa. */
    pts.push(B.at(-1).slice());
    pts.push(...B.slice().reverse().slice(1));
    pts.push(A[0].slice());
    if(Math.hypot(pts[0][0]-pts.at(-1)[0],pts[0][1]-pts.at(-1)[1])>1e-8)pts.push(pts[0].slice());
    let geom=pts.map(p=>[p[0],p[1]]),zg=pts.map(p=>p[2]);
    if(typeof cavaRingCruza==='function'&&typeof cavaDeloop==='function'&&cavaRingCruza(geom)){
      let aberta=geom.slice();if(Math.hypot(aberta[0][0]-aberta.at(-1)[0],aberta[0][1]-aberta.at(-1)[1])<1e-8)aberta.pop();
      aberta=cavaDeloop(aberta);
      if(aberta.length>=3){aberta.push(aberta[0].slice());geom=aberta;
        zg=geom.map(q=>{let bd=Infinity,bz=trajetoria[i0][2];for(let k=Math.max(1,i0+1);k<=i1;k++){
          const a=trajetoria[k-1],b=trajetoria[k],dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy,
            t=Math.max(0,Math.min(1,d?((q[0]-a[0])*dx+(q[1]-a[1])*dy)/d:0)),
            x=a[0]+dx*t,y=a[1]+dy*t,e=(q[0]-x)**2+(q[1]-y)**2;
          if(e<bd){bd=e;bz=a[2]+(b[2]-a[2])*t;}}return bz;});}
    }
    return {geom,zg,_tipo:f.tipo,
      _banco:f.banco,_controle:f.controle};
  };
  const polysLocais=faixas.map(faixaPoligono).filter(p=>p&&p.geom.length>=4),
    polysFace=polysLocais.filter(p=>p._tipo==='face');
  const densificaAberta3=pts=>{
    const out=[];
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i],L=Math.hypot(b[0]-a[0],b[1]-a[1]),
        n=Math.max(1,Math.ceil(L/passo));
      if(!out.length)out.push(a.slice());
      for(let k=1;k<=n;k++)out.push([a[0]+(b[0]-a[0])*k/n,
        a[1]+(b[1]-a[1])*k/n,a[2]+(b[2]-a[2])*k/n]);
    }
    return out;
  },eixoOut=densificaAberta3(eixo);
  const pol=bordaA.map(p=>p.slice());
  if(ultimoAnel){const cap=arcoCurto(ultimoAnel,bordaA.at(-1),bordaB.at(-1),bordaA.at(-1)[2]);pol.push(...cap.slice(1));}
  else pol.push(bordaB.at(-1).slice());
  const rev=bordaB.slice().reverse();pol.push(...rev.slice(1));
  if(primeiroAnel){const cap=arcoCurto(primeiroAnel,bordaB[0],bordaA[0],bordaA[0][2]);pol.push(...cap.slice(1));}
  else pol.push(bordaA[0].slice());
  if(Math.hypot(pol[0][0]-pol.at(-1)[0],pol[0][1]-pol.at(-1)[1])>1e-8)pol.push(pol[0].slice());

  const mk=(pts,tipo)=>({geom:pts.map(p=>[p[0],p[1]]),multi:false,zg:pts.map(p=>p[2]),props:{
    TIPO:tipo,BANCO:null,COTA:null,ALTURA:opt.H,BERMA:W,ANGULO:opt.grade,CLASSE:'rampa'}});
  /* As breaklines exportadas permanecem contínuas; o recorte visual e dos
     anéis, porém, usa as faixas locais acima. */
  vazio.features.push(mk(bordaAFull,'Rampa — borda interna'),mk(bordaBFull,'Rampa — borda externa'),
    mk(eixoOut,'Rampa — eixo'));
  /* Curvas transversais: ambos os lados recebem literalmente a mesma cota,
     deixando a pista horizontal na seção e auditável no 3D. */
  const zs=trajetoria.map(p=>p[2]),lo=Math.min(...zs),hi=Math.max(...zs),
    dzc=Math.max(.5,Math.min(2,Math.abs(opt.H||5)/5));
  for(let zc=Math.ceil((lo+1e-7)/dzc)*dzc;zc<hi-1e-7;zc+=dzc){
    let j=1;while(j<zs.length&&(zs[j-1]-zc)*(zs[j]-zc)>0)j++;
    if(j>=zs.length||Math.abs(zs[j]-zs[j-1])<1e-10)continue;
    const t=(zc-zs[j-1])/(zs[j]-zs[j-1]),
      qa=[bordaAFull[j-1][0]+(bordaAFull[j][0]-bordaAFull[j-1][0])*t,
        bordaAFull[j-1][1]+(bordaAFull[j][1]-bordaAFull[j-1][1])*t,zc],
      qb=[bordaBFull[j-1][0]+(bordaBFull[j][0]-bordaBFull[j-1][0])*t,
        bordaBFull[j-1][1]+(bordaBFull[j][1]-bordaBFull[j-1][1])*t,zc];
    vazio.features.push(mk([qa,qb],'Rampa — curva de nível'));
  }
  const poly={geom:pol.map(p=>[p[0],p[1]]),zg:pol.map(p=>p[2])};
  vazio.polygons=polysLocais.length?polysLocais:[poly];
  vazio.clipPolygons=polysFace.length?polysFace:[poly];
  vazio.polygon=vazio.polygons[0]||null;
  vazio.center=eixoOut.map(p=>p.slice());vazio.warn=aviso;
  /* Auditoria comum a cava e pilha. A distância crista↔pé registrada em
     refs deve corresponder a H/tan(ângulo). Se anéis editados ou um canto
     impossível quebrarem essa lei, a rampa é marcada inválida e o chamador
     conserva a última geometria correta. */
  try{
    const alvo=+opt.faceAngle,angulos=[];
    if(alvo>0&&alvo<90){
      for(const f of faixas){
        if(f.tipo!=='face')continue;
        const h=Math.abs((+f.zFim||0)-(+f.zIni||0));
        if(!(h>1e-8))continue;
        for(let i=Math.max(0,f.i0);i<=Math.min(refs.length-1,f.i1);i++){
          const rr=refs[i],run=Math.hypot(rr&&rr[0]||0,rr&&rr[1]||0);
          if(run>1e-8)angulos.push(Math.atan2(h,run)*180/Math.PI);
        }
      }
      angulos.sort((a,b)=>a-b);
      const faceMin=angulos.length?angulos[0]:alvo,
        faceMax=angulos.length?angulos.at(-1):alvo,
        faceMed=angulos.length?angulos[Math.floor((angulos.length-1)/2)]:alvo,
        /* Cantos em mitra têm corrida maior na bissetriz; o ângulo de
           projeto é auditado na seção normal predominante da face. Isso
           não mascara parede errada: se a faixa inteira vier com 84°, a
           mediana também será 84° e a geração será recusada. */
        erro=Math.abs(faceMed-alvo);
      let wMin=Infinity,wMax=-Infinity;
      for(let i=0;i<Math.min(bordaAFull.length,bordaBFull.length);i++){
        const w=Math.hypot(bordaAFull[i][0]-bordaBFull[i][0],bordaAFull[i][1]-bordaBFull[i][1]);
        wMin=Math.min(wMin,w);wMax=Math.max(wMax,w);
      }
      vazio.faceAudit={targetAngle:alvo,faceMin,faceMax,faceMedian:faceMed,error:erro,
        widthMin:wMin,widthMax:wMax,control:opt.control||'auto'};
      if(erro>0.35||wMin<W*.98||wMax>W*1.02){
        vazio.invalid=true;
        vazio.warn=`Rampa recusada: a seção normal da face resultou em ${faceMed.toFixed(2)}° `+
          `(alvo ${alvo.toFixed(2)}°) ou a largura não permaneceu ${W.toFixed(2)} m.`;
      }
    }
  }catch(e){
    vazio.invalid=true;vazio.warn='Rampa recusada: não foi possível auditar o ângulo da face e a largura da pista.';
  }
  return vazio;
}

/* Convenção visual única do motor v2. Ela é usada tanto na geração automática
   quanto na construção por bancadas e em todas as camadas derivadas/cortadas. */
function cavaV02Elemento(f,up=false){
  const p=f&&f.props||{},c=String(p.CLASSE||'').toLowerCase(),
    t=String(p.TIPO||'').toLowerCase();
  if(c==='rb31-inter'||c==='daylight'||/interse[cç][aã]o/.test(t))return 'Interseção';
  if(['rb31-rampa','rb31-inicio','rb31-eixo'].includes(c)||/rampa|eixo/.test(t))return 'Rampa';
  if(c==='rb31-pe'||/(^|\s)pé(\s|$)|pe de banco/.test(t))return 'Pé';
  if(c==='rb31-crista'||/crista/.test(t))return 'Crista';
  if(/^limite superior/.test(t))return up?'Pé':'Crista';
  return null;
}
function cavaV02Categorias(){
  return[
    {value:'Crista',color:'#111111',weight:1.5,dash:''},
    {value:'Pé',color:'#111111',weight:1.5,dash:'6 4'},
    {value:'Rampa',color:'#7b3fd4',weight:1.5,dash:''},
    {value:'Interseção',color:'#111111',weight:1.5,dash:'9 4'}];
}
function cavaV02AplicaLinhas(L,campo='TIPO',up=false){
  if(!L)return L;
  (L.features||[]).forEach(f=>{
    if(!f)return;f.props=f.props||{};
    const e=cavaV02Elemento(f,up);if(e)f.props.ELEMENTO=e;
  });
  L.fields=L.fields||[];
  if(!L.fields.some(f=>String(f.name).toUpperCase()==='ELEMENTO'))
    L.fields.push({name:'ELEMENTO',type:'C',length:16,decimal:0});
  L.color='#111111';L.weight=1.5;L.sym=L.sym||{};
  /* CLASSE/TIPO continuam intactos para o motor reconhecer subtipos. A
     classificação apresentada ao operador é deliberadamente limitada aos
     quatro elementos construtivos acordados. */
  L.sym={...L.sym,mode:'cat',field:'ELEMENTO',weight:1.5,
    cats:cavaV02Categorias('ELEMENTO',up)};
  return L;
}
function cavaV02AplicaPoligono(P){
  if(!P)return P;
  P.color='#7b3fd4';P.weight=1.5;P.fill=.08;
  P.sym={...(P.sym||{}),mode:'single',color:'#7b3fd4',stroke:'#7b3fd4',
    hatch:'solid',hatchScale:1,weight:1.5,fill:.08,dash:'',field:'',
    classes:[],cats:[],ramp:'purple'};
  return P;
}

function cavaRampaAtualizaPoligono(cavaL,rampaPlano){
  if(!cavaL)return null;
  const antigoId=cavaL.cavaDesign&&cavaL.cavaDesign.rampLayerId;
  let RP=(S.layers||[]).find(x=>String(x.id)===String(antigoId))||
    (S.layers||[]).find(x=>String(x._cavaRampOf)===String(cavaL.id));
  const polys=(rampaPlano&&rampaPlano.polygons&&rampaPlano.polygons.length
    ?rampaPlano.polygons:[rampaPlano&&rampaPlano.polygon]).filter(p=>p&&p.geom&&p.geom.length>=4);
  if(!polys.length){
    if(RP){RP.features=[];RP.visible=false;drawLayer(RP);}
    return RP||null;
  }
  const feats=polys.map((p,i)=>({geom:p.geom.map(q=>q.slice()),multi:false,zg:(p.zg||[]).slice(),
    props:{TIPO:'Pista da rampa',TRECHO:i+1,ORIGEM:cavaL.name}}));
  if(!RP){
    const ativa=S.activeId;
    RP=addLayer({sourceLayer:cavaL,name:'Rampa da cava — pista',gtype:'polygon',crs:cavaL.crs,
      features:feats,fields:[{name:'TIPO',type:'C',length:30},{name:'TRECHO',type:'N',length:6},
        {name:'ORIGEM',type:'C',length:80}],
      color:'#7b3fd4'});
    RP._cavaRampOf=cavaL.id;RP.groupId=cavaL.groupId||null;
    S.activeId=ativa;
  }else{
    RP.features=feats;RP.visible=true;RP._cavaRampOf=cavaL.id;
  }
  cavaV02AplicaPoligono(RP);
  /* A pista fica imediatamente abaixo das cristas e pés, para a cor não
     encobrir as linhas construtivas. */
  const ip=S.layers.indexOf(RP);if(ip>=0)S.layers.splice(ip,1);
  const ic=S.layers.indexOf(cavaL);S.layers.splice(ic>=0?ic+1:S.layers.length,0,RP);
  drawLayer(RP);
  zApply();
  if(cavaL.cavaDesign)cavaL.cavaDesign.rampLayerId=RP.id;
  return RP;
}
function cavaFeatsSemDuplicar(feats){
  const seen=new Set(),out=[];
  for(const f of feats||[]){
    const pts=f.geom||[],tipo=String(f.props?.TIPO||''),serial=a=>
      a.map(p=>Array.isArray(p)&&typeof p[0]!=='number'?serial(p):
        `${(+p[0]).toFixed(3)},${(+p[1]).toFixed(3)},${Number.isFinite(+p[2])?(+p[2]).toFixed(3):''}`).join(';');
    const ida=serial(pts),volta=serial(pts.slice().reverse()),key=tipo+'|'+(ida<volta?ida:volta);
    if(seen.has(key))continue;seen.add(key);out.push(f);
  }
  return out;
}
function cavaRampaRemoveMarcadorInicio(){
  const m=S._cavaRampStartMarker;
  if(m){try{map.removeLayer(m);}catch(e){} S._cavaRampStartMarker=null;}
}
function cavaRampaMostraMarcadorInicio(p){
  cavaRampaRemoveMarcadorInicio();
  if(!p||!Number.isFinite(+p[0])||!Number.isFinite(+p[1])||typeof L==='undefined'||!map)return;
  try{
    const w=toWGS(S.workCRS,+p[0],+p[1]);
    S._cavaRampStartMarker=L.circleMarker([w[1],w[0]],{
      radius:7,weight:3,color:'#fff3cf',fillColor:'#f59e0b',fillOpacity:1,
      opacity:1,pane:'markerPane',interactive:false
    }).addTo(map);
    S._cavaRampStartMarker.bindTooltip('Saída da rampa',{permanent:true,direction:'right',offset:[9,0],className:'meas-lbl'});
  }catch(e){console.warn('marcador inicio rampa',e);}
}
function cavaRampaIndicarInicio(){
  /* mesma regra do 3.1: o painel só fecha quando o usuário fechar */
  if(typeof switchView==='function'&&S._view!=='map')switchView('map');
  const chk=document.getElementById('cavaRampa'),box=document.getElementById('cavaRampaBox');
  if(chk)chk.checked=true;if(box)box.style.display='grid';
  setTool('select');
  const info=document.getElementById('cavaRampaInicioInfo'),
    pilha=document.getElementById('cavaSentido')?.value==='up',
    nomeControle=pilha?'linha de pé da pilha':'linha de crista da cava';
  if(info)info.textContent=`Toque na ${nomeControle} para fixar a saída da rampa…`;
  const handler=ll=>{
    const c=fromWGS(S.workCRS,ll.lng,ll.lat),
      item=cavaFonteOriginal(cavaItemSelecionado());
    if(!item){
      if(info)info.textContent=`Escolha primeiro a ${nomeControle}.`;
      toast(`Escolha ou gere primeiro a ${nomeControle}`);return;
    }
    const ring=cavaLimpaRing(cavaRingWork(item)),q=rb31PontoNaCrista(ring,[c[0],c[1]]),
      dist=q?Math.hypot(c[0]-q.p[0],c[1]-q.p[1]):Infinity,
      largura=Math.max(.5,+((document.getElementById('cavaRampaW')||{}).value||10)),
      tol=Math.max(5,largura);
    if(!q||dist>tol){
      if(info)info.textContent=Number.isFinite(dist)
        ?`O toque ficou ${dist.toFixed(1)} m distante da ${nomeControle}. Toque novamente sobre a linha.`
        :`Não foi possível projetar o toque sobre a ${nomeControle}.`;
      toast(`Saída rejeitada: toque a no máximo ${tol.toFixed(1)} m da linha controladora`);
      rb31CapturaClique(handler);return;       /* continua armado após um toque perdido */
    }
    S._cavaRampStart=q.p.slice();
    cavaRampaMostraMarcadorInicio(S._cavaRampStart);
    if(info)info.innerHTML=`Saída projetada na ${nomeControle}: <b>E ${q.p[0].toFixed(2)} · N ${q.p[1].toFixed(2)}</b>`+
      ` · distância do toque ${dist.toFixed(2)} m.`;
    const L=cavaProjetoAtual();
    if(L&&L.cavaDesign){
      L.cavaDesign.ramp={...(L.cavaDesign.ramp||{}),start:S._cavaRampStart.slice(),on:true};
      const fonte=cavaResolverFonte(L.cavaDesign),src=fonte&&fonte.L,f=fonte&&fonte.f;
      if(fonte)cavaGerar({item:fonte,params:L.cavaDesign,
        replaceLayer:L,liveEdit:true});
    }
    toast(`Saída da rampa presa à ${nomeControle} e projeto redesenhado`);
  };
  /* Captura tanto o mapa vazio quanto um clique diretamente sobre a feição.
     O caminho antigo usava só map.once e o clique na crista era engolido
     pelo menu de seleção da camada. */
  rb31CapturaClique(handler);
}
function cavaRampaLimpar(){
  clearTimeout(S._cavaRampParamTimer);
  S._cavaRampStart=null;
  cavaRampaRemoveMarcadorInicio();
  const chk=document.getElementById('cavaRampa'),box=document.getElementById('cavaRampaBox'),
    info=document.getElementById('cavaRampaInicioInfo'),L=cavaProjetoAtual();
  if(chk)chk.checked=false;
  if(box)box.style.display='none';
  if(info)info.textContent='Nenhum início definido. Ative a rampa e indique um novo ponto quando desejar.';
  if(L&&L.cavaDesign){
    const D=L.cavaDesign;
    D.ramp={...(D.ramp||{}),on:false,start:null};
    const fonte=cavaResolverFonte(D);
    if(fonte)cavaGerar({item:fonte,params:D,
      replaceLayer:L,silent:true,liveEdit:true});
    const RP=(S.layers||[]).find(x=>String(x._cavaRampOf||'')===String(L.id));
    if(RP){RP.features=[];RP.visible=false;drawLayer(RP);}
  }
  refreshUI();
  toast('Rampa desfeita; cristas e pés da cava foram recompostos');
}
function cavaRampaParametrosSync(){
  try{cavaAtualizaPreview();}catch(_){ }
  const L=cavaProjetoAtual();if(!L||!L.cavaDesign)return;
  const D=L.cavaDesign,el=id=>document.getElementById(id);
  const inicio=(D.ramp&&D.ramp.start)||S._cavaRampStart||null;
  D.ramp={...(D.ramp||{}),on:!!el('cavaRampa')?.checked&&!!inicio,
    width:+(el('cavaRampaW')?.value||10),grade:+(el('cavaRampaG')?.value||10),
    dir:el('cavaRampaDir')?.value||'cw',
    landing:0,
    switchback:!!el('cavaRampaSwitch')?.checked,
    switchEvery:Math.max(1,Math.round(+(el('cavaRampaSwitchN')?.value||1))),
    endMode:el('cavaRampaFimModo')?.value==='cota'?'elevation':'final',
    endZ:parseFloat(String(el('cavaRampaFimZ')?.value||'').replace(',','.')),
    start:inicio};
  const fonte=cavaResolverFonte(D);if(!fonte)return;
  clearTimeout(S._cavaRampParamTimer);
  S._cavaRampParamTimer=setTimeout(()=>cavaGerar({
    item:fonte,params:D,replaceLayer:L,silent:true,liveEdit:true
  }),100);
}
function cavaRampaAtualizaLinhasEdicao(){
  const sel=document.getElementById('cavaRampaEditLine');if(!sel)return;
  const atual=sel.value,L=cavaProjetoAtual(),rings=L&&L.cavaDesign&&L.cavaDesign.rings||[];
  sel.innerHTML='<option value="upper">Limite superior (padrão)</option>'+
    rings.map((r,i)=>{
      if(i===0)return '';
      const tipo=r.kind==='crest'?'Crista':'Pé',etapa=r.tipo==='berm'?' · após berma':'';
      return `<option value="ring:${i}">${tipo} ${r.bench||i}${etapa} · ${(+r.z).toFixed(2)} m</option>`;
    }).join('');
  if(atual&&[...sel.options].some(o=>o.value===atual))sel.value=atual;
}
function cavaAnelSemFecho(r){
  const a=(r||[]).map(p=>p.slice());
  if(a.length>3&&Math.hypot(a[0][0]-a.at(-1)[0],a[0][1]-a.at(-1)[1])<1e-7)a.pop();
  return a;
}
/* Congela uma fronteira CONSTRUTIVA, não apenas uma feição desenhada. O
   retrato inclui o anel tocado e todos os anéis de área menor (portanto
   geometricamente internos), independentemente da numeração dos bancos. */
function cavaCongelarAplicar(projeto,ringIndex){
  const D=projeto&&projeto.cavaDesign,rings=D&&D.rings||[],ref=rings[ringIndex];
  if(!D||!ref||ringIndex===0){toast('Clique numa crista ou pé da cava, não no limite superior');return false;}
  const areaRef=Math.abs(cavaArea2(cavaAnelSemFecho(ref.ring))),frozen={};
  rings.forEach((r,i)=>{
    const anel=cavaAnelSemFecho(r.ring),a=Math.abs(cavaArea2(anel));
    if(anel.length>=3&&a<=areaRef+Math.max(1,areaRef*1e-8))frozen[i]=anel.map(p=>[p[0],p[1]]);
  });
  if(!Object.keys(frozen).length){toast('Não foi possível identificar os anéis internos');return false;}
  D.freezeRingIndex=ringIndex;D.frozenRings=frozen;
  /* Uma única linha azul indica visualmente a fronteira imobilizada. */
  let F=(S.layers||[]).find(x=>String(x._cavaFreezeOf||'')===String(projeto.id));
  const fechado=cavaAnelSemFecho(ref.ring);fechado.push(fechado[0].slice());
  const feat={geom:fechado,multi:false,zg:fechado.map(()=>+ref.z),props:{
    TIPO:'Limite congelado',BANCO:ref.bench,COTA:+ref.z}};
  if(F){F.features=[feat];F.visible=true;}
  else{
    F=addLayer({sourceLayer:projeto,name:`Congelamento — ${ref.kind==='toe'?'pé':'crista'} ${ref.bench}`,
      gtype:'line',crs:projeto.crs,features:[feat],fields:[
        {name:'TIPO',type:'C',length:30},{name:'BANCO',type:'N',length:6},{name:'COTA',type:'N',length:14,decimal:3}],color:'#22b8cf'});
    F._cavaFreezeOf=projeto.id;
  }
  F.name=`Congelamento — ${ref.kind==='toe'?'pé':'crista'} ${ref.bench}`;
  F.sym.stroke='#22b8cf';F.sym.color='#22b8cf';F.sym.weight=3.5;F.sym.dash='5 4';
  drawLayer(F);refreshUI();
  toast(`${Object.keys(frozen).length} linha(s) congelada(s) da fronteira escolhida para dentro`);
  return true;
}
function cavaCongelarIndiceMaisProximo(projeto,latlng){
  const rings=projeto?.cavaDesign?.rings||[];if(!latlng||!rings.length)return null;
  const p=fromWGS(S.workCRS,latlng.lng,latlng.lat);let best=null,bd=Infinity;
  rings.forEach((r,i)=>{
    if(i===0)return;const a=cavaAnelSemFecho(r.ring);
    for(let j=0;j<a.length;j++){
      const u=a[j],v=a[(j+1)%a.length],dx=v[0]-u[0],dy=v[1]-u[1],d=dx*dx+dy*dy,
        t=Math.max(0,Math.min(1,d?((p[0]-u[0])*dx+(p[1]-u[1])*dy)/d:0)),
        d2=(p[0]-u[0]-dx*t)**2+(p[1]-u[1]-dy*t)**2;
      if(d2<bd){bd=d2;best=i;}
    }
  });
  return bd<=25*25?best:null;
}
function cavaCongelarArmar(){
  const projeto=cavaProjetoAtual();
  if(!projeto||!projeto.cavaDesign){toast('Gere ou selecione uma cava paramétrica antes de congelar');return;}
  setTool('select');closeFeatMenu();
  toast('Congelar: clique numa linha de crista ou pé; tudo que estiver para dentro ficará imóvel');
  const escolher=(L,idx,latlng)=>{
    const f=L&&L.features&&L.features[idx],P=L&&L.cavaDesign?L:projeto;
    const ringIx=f&&f._ringIx!=null?+f._ringIx:cavaCongelarIndiceMaisProximo(P,latlng);
    if(!f||String(L.id)!==String(P.id)||ringIx==null){
      toast('A linha tocada não é uma crista ou pé desta cava — clique novamente');
      S._pickCavaFreeze=escolher;return;
    }
    cavaCongelarAplicar(P,ringIx);
  };
  S._pickCavaFreeze=escolher;
}
function cavaEditarLinhaControladora(){
  const escolha=document.getElementById('cavaRampaEditLine')?.value||'upper';
  if(escolha==='upper'){cavaEditarLimite();return;}
  const projeto=cavaProjetoAtual(),D=projeto&&projeto.cavaDesign,
    ix=+(String(escolha).split(':')[1]);
  if(!projeto||!D||!D.rings||!D.rings[ix]){toast('Gere a cava e escolha uma linha intermediária válida');return;}
  const fonte=cavaResolverFonte(D),src=fonte&&fonte.L,sf=fonte&&fonte.f;
  if(!fonte){toast('O limite superior que controla esta cava não foi encontrado');return;}
  const baseDriver=cavaAnelSemFecho(D.rings[ix].ring),
    baseSource=cavaAnelSemFecho(cavaRingWork({L:src,f:sf,i:D.sourceFeature}));
  if(baseDriver.length<3||baseSource.length<3){toast('A linha escolhida não pode ser editada');return;}
  const fechado=baseDriver.concat([baseDriver[0].slice()]),
    z=+D.rings[ix].z,feat={geom:fechado,multi:false,zg:fechado.map(()=>z),
      props:{TIPO:'Linha controladora',BANCO:D.rings[ix].bench,COTA:z}};
  let C=(S.layers||[]).find(x=>x._cavaControl&&String(x._cavaControl.projectId)===String(projeto.id));
  if(C){C.features=[feat];C.visible=true;C.name=`Controle dinâmico — ${D.rings[ix].kind==='crest'?'crista':'pé'} ${D.rings[ix].bench}`;}
  else C=addLayer({sourceLayer:projeto,name:`Controle dinâmico — ${D.rings[ix].kind==='crest'?'crista':'pé'} ${D.rings[ix].bench}`,
    gtype:'line',crs:projeto.crs,features:[feat],
    fields:[{name:'TIPO',type:'C',length:30},{name:'BANCO',type:'N',length:6},{name:'COTA',type:'N',length:14,decimal:3}],
    color:'#23a6d5'});
  const modo=document.getElementById('cavaEditModo')?.value||'propagar';
  C._cavaControl={projectId:projeto.id,sourceLayer:src.id,sourceFeature:fonte.i,sourceLimitId:D.sourceLimitId,
    ringIndex:ix,modo,baseDriver:baseDriver.map(p=>p.slice()),baseSource:baseSource.map(p=>p.slice()),
    lastValidGeom:fechado.map(p=>p.slice())};
  C.sym.stroke='#23a6d5';C.sym.color='#23a6d5';C.sym.weight=3;C.sym.dash='7 4';
  C._cavaControl.lastHash=cavaGeomHash({f:C.features[0]});
  S.activeId=C.id;S.selFeat={layer:C,layerId:C.id,idx:0};
  drawLayer(C);refreshUI();setTool('vertex');showVertices(); /* painel persiste: fecha so no X */
  toast(modo==='congelar'
    ? 'Linha ativa · congelado daqui para dentro: arraste para abrir ou fechar a berma'
    : 'Linha intermediária ativa: arraste os vértices ou clique/arraste um ponto médio');
}
function cavaPropagaLinhaControladora(C){
  const K=C&&C._cavaControl,f=C&&C.features&&C.features[0];if(!K||!f)return false;
  const hash=cavaGeomHash({f});if(!hash||hash===K.lastHash)return false;
  const fonte=cavaResolverFonte(K),src=fonte&&fonte.L,sf=fonte&&fonte.f;
  if(!fonte)return false;
  const anelEditado=cavaAnelSemFecho(f.geom),invalido=anelEditado.length<3||
    Math.abs(cavaArea2(anelEditado))<1||cavaRingCruza(anelEditado),
    restaura=msg=>{
      if(K.lastValidGeom&&K.lastValidGeom.length>=4){
        f.geom=K.lastValidGeom.map(p=>p.slice());
        if(Array.isArray(f.zg)){const z=+f.props?.COTA||0;f.zg=f.geom.map(()=>z);}
        try{drawLayer(C);}catch(e){}
      }
      K.lastHash=cavaGeomHash({f});toast(msg);return false;
    };
  if(invalido)return restaura('Edição rejeitada: a linha controladora ficou vazia, degenerada ou auto-intersectante');
  /* MODO CONGELAR: a linha editada NÃO volta para o limite superior. Ela é
     gravada como anel manual do projeto e a cava é refeita a partir do
     limite intacto — os anéis internos nascem do anel original e ficam
     parados, de modo que a berma entre eles e a linha arrastada abre ou
     fecha conforme o arraste. */
  if(K.modo==='congelar'&&K.ringIndex!=null){
    const proj=(S.layers||[]).find(x=>String(x.id)===String(K.projectId));
    if(proj&&proj.cavaDesign){
      const anel=anelEditado;
      proj.cavaDesign.overrides=proj.cavaDesign.overrides||{};
      proj.cavaDesign.overrides[K.ringIndex]=anel.map(q=>[q[0],q[1]]);
      K.lastHash=hash;
      const it={L:src,f:sf,i:fonte.i};
      try{ cavaGerar({item:it,params:proj.cavaDesign,replaceLayer:proj,
        silent:true,liveEdit:true}); }
      catch(e){ console.warn('cava congelar',e); }
      K.lastValidGeom=f.geom.map(p=>p.slice());
      return true;
    }
  }
  const bd=cavaAnelSemFecho(K.baseDriver),cd=cavaAnelSemFecho(f.geom),bs=K.baseSource;
  if(bd.length<3||cd.length<3||bs.length<3)return false;
  const cb=cavaChain(bd),cc=cavaChain(cd),pb=cb.at(-1),pc=cc.at(-1);
  const novo=bs.map((p,i)=>{
    /* Uma bancada offset não possui as quinas na mesma porcentagem de
       perímetro do limite superior. A correspondência antiga por índice/u
       deslocava as quinas lateralmente e fazia as bermas abrirem ou
       estreitarem durante o arraste. Projeta cada vértice do limite na
       posição espacial mais próxima da linha controladora original; aplica
       ali exatamente o vetor observado na linha editada. Depois cavaGerar()
       recompõe toda a família a partir de um único limite, conservando H,
       ângulo, largura de berma e quantidade de bancos. */
    const sb=cavaNearestChain(bd,cb,p),
      u=pb?sb/pb:i/bs.length,
      a=cavaPointChain(bd,cb,u*pb),b=cavaPointChain(cd,cc,u*pc),
      q=[p[0]+b[0]-a[0],p[1]+b[1]-a[1]],
      local=reproj(S.workCRS,src.crs,q[0],q[1]);
    return [local[0],local[1]];
  });
  const raw=sf.geom,eraFechado=raw&&raw.length>3&&typeof raw[0]?.[0]==='number'&&
    Math.hypot(raw[0][0]-raw.at(-1)[0],raw[0][1]-raw.at(-1)[1])<1e-7;
  if(eraFechado)novo.push(novo[0].slice());
  const novoWork=cavaAnelSemFecho(novo.map(p=>reproj(src.crs,S.workCRS,p[0],p[1])));
  if(novoWork.length<3||Math.abs(cavaArea2(novoWork))<1||cavaRingCruza(novoWork))
    return restaura('Edição rejeitada: a propagação produziria um limite auto-intersectante');
  if(sf.multi&&Array.isArray(sf.geom?.[0]?.[0]))sf.geom[0]=novo;else sf.geom=novo;
  K.lastHash=hash;K.lastValidGeom=f.geom.map(p=>p.slice());drawLayer(src);return true;
}
function refreshCavaMineracao(){
  const b=document.getElementById('cavaBaseSel'),m=document.getElementById('cavaMdtSel'); if(!b||!m)return;
  /* o dropdown sempre reflete as camadas atuais: repovoa ao abrir */
  if(!b._espelhoVivo){
    b._espelhoVivo=true;
    b.addEventListener('mousedown',()=>{try{refreshCavaMineracao();}catch(e){}},{capture:true});
  }
  const bv=b.value,mv=m.value,polys=cavaPoligonos();
  b.innerHTML='<option value="selected">— polígono selecionado no mapa —</option>'+
    polys.map((p,i)=>`<option value="${p.L.id}:${p.i}">${esc(p.label)}</option>`).join('');
  if(bv&&[...b.options].some(o=>o.value===bv))b.value=bv;
  m.innerHTML='<option value="">— escolha o MDT associado —</option>'+
    (S.rasters||[]).map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('');
  if(mv&&[...m.options].some(o=>o.value===mv))m.value=mv;
  else if(S.rasters&&S.rasters.length)m.value=S.rasters[0].id;
  if(typeof refreshCivilMdt==='function')refreshCivilMdt();
  cavaRampaAtualizaLinhasEdicao();
  /* a lista de MDTs acabou de mudar (importação, remoção, novo limite):
     a cota construtiva tem de acompanhar, senão o campo fica com o valor
     velho — ou vazio — até o usuário mexer no seletor à mão */
  try{ if(typeof cavaAtualizaCotaInfo==='function') cavaAtualizaCotaInfo(); }catch(e){}
}
/* Selecionar o polígono no mapa passa a APARECER no seletor do limite.
   Antes o seletor ficava na opção genérica "— polígono selecionado no mapa —":
   funcionava, mas não dizia QUAL polígono, e a cota construtiva só era
   calculada quando se escolhia o item na lista à mão. Agora a seleção do mapa
   aponta o item correspondente e dispara o mesmo 'change' da escolha manual,
   então a cota, a prévia e o caminho construtivo já saem preenchidos. */
function cavaSincronizaSelecao(){
  const b=document.getElementById('cavaBaseSel');
  if(!b||S._cavaSincSel)return;
  const sf=S.selFeat,L=sf&&sf.layer,i=sf&&sf.idx;
  if(!L||!Number.isFinite(+i))return;
  /* produto da própria cava nunca vira limite (mesma regra de cavaPoligonos) */
  if(L.cavaDesign||L._cavaRampOf||L._cavaControl||L._cavaFreezeOf)return;
  if(L.gtype!=='polygon'&&L.gtype!=='line')return;
  const f=L.features&&L.features[i];if(!f||!f.geom)return;
  const ring=Array.isArray(f.geom[0]?.[0])?f.geom[0]:f.geom;
  if(!ring||ring.length<3)return;
  const fechada=!!L._cavaLimiteDin||L.gtype==='polygon'||
    Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<1e-7;
  if(!fechada)return;                       // linha aberta não serve de limite
  const v=`${L.id}:${i}`;
  S._cavaSincSel=true;
  try{
    /* camada recém-criada ainda não está na lista */
    if(![...b.options].some(o=>o.value===v))refreshCavaMineracao();
    if([...b.options].some(o=>o.value===v)&&b.value!==v){
      b.value=v;
      b.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }finally{S._cavaSincSel=false;}
}
function cavaItemSelecionado(){
  const v=document.getElementById('cavaBaseSel')?.value;
  if(v==='selected' && (S.selFeat?.layer?.gtype==='polygon'||S.selFeat?.layer?.gtype==='line')){
    const it={L:S.selFeat.layer,f:S.selFeat.layer.features[S.selFeat.idx],i:S.selFeat.idx};
    const r=Array.isArray(it.f?.geom?.[0]?.[0])?it.f.geom[0]:it.f?.geom;
    if(r&&r.length>=3&&(it.L._cavaLimiteDin||it.L.gtype==='polygon'||
      Math.hypot(r[0][0]-r.at(-1)[0],r[0][1]-r.at(-1)[1])<1e-7))return it;
  }
  const [lid,idx]=String(v||'').split(':');
  const L=S.layers.find(x=>String(x.id)===lid),f=L&&L.features[+idx];
  return L&&f?{L,f,i:+idx}:null;
}
/* Vínculo persistente limite → cava. O índice da feição não é identidade:
   muda quando uma linha é apagada, poligonizada ou reorganizada. Cada limite
   recebe um UUID leve gravado na própria feição (features são serializadas no
   .ccmgis) e toda receita passa a resolver a fonte por esse UUID. */
function cavaNovoId(prefix='lim'){
  try{if(globalThis.crypto&&crypto.randomUUID)return `${prefix}_${crypto.randomUUID()}`;}catch(_){ }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,10)}`;
}
function cavaIdFonte(item,criar=true){
  const f=item&&item.f;if(!f)return null;
  let v=f._cavaLimitId||f.props?._ALAGIS_CAVA_LIMIT_ID||null;
  if(!v&&criar){v=cavaNovoId('limite');f._cavaLimitId=v;}
  else if(v)f._cavaLimitId=String(v);
  return v?String(v):null;
}
function cavaResolverFonte(D){
  if(!D)return null;
  const alvo=D.sourceLimitId?String(D.sourceLimitId):null;
  let L=(S.layers||[]).find(q=>String(q.id)===String(D.sourceLayer)),i=-1,f=null;
  if(L&&alvo)i=(L.features||[]).findIndex(q=>String(q?._cavaLimitId||q?.props?._ALAGIS_CAVA_LIMIT_ID||'')===alvo);
  if(L&&i>=0)f=L.features[i];
  if(!f&&L&&Number.isInteger(+D.sourceFeature)){
    const cand=L.features&&L.features[+D.sourceFeature];
    /* Para receitas antigas, o índice ainda é a única referência disponível.
       Assim que localizado, ele é promovido ao novo vínculo estável. */
    if(cand&&(!alvo||!cand._cavaLimitId||String(cand._cavaLimitId)===alvo)){
      f=cand;i=+D.sourceFeature;
    }
  }
  if(!f&&alvo){
    for(const q of (S.layers||[])){
      const qi=(q.features||[]).findIndex(x=>String(x?._cavaLimitId||x?.props?._ALAGIS_CAVA_LIMIT_ID||'')===alvo);
      if(qi>=0){L=q;i=qi;f=q.features[qi];break;}
    }
  }
  if(!L||!f)return null;
  const id=cavaIdFonte({L,f,i},true);
  D.sourceLayer=L.id;D.sourceFeature=i;D.sourceLimitId=id;
  return {L,f,i};
}
function cavaFonteOriginal(item){
  if(!item||!item.L)return item;
  let D=item.L.cavaDesign||null;
  if(!D&&item.L._cavaRampOf){
    const P=(S.layers||[]).find(q=>String(q.id)===String(item.L._cavaRampOf));
    D=P&&P.cavaDesign||null;
  }
  if(!D&&item.L._cavaControl){
    const K=item.L._cavaControl;
    D={sourceLayer:K.sourceLayer,sourceFeature:K.sourceFeature,sourceLimitId:K.sourceLimitId};
  }
  if(!D)return item;
  return cavaResolverFonte(D)||item;
}
function cavaDesenharLimite(){
  RIB_CAT_ATUAL='mineracao';
  if(typeof switchView==='function') switchView('map');
  const L=addLayer({name:'Limite de cava ou pilha',gtype:'polygon',crs:S.workCRS,features:[],
    fields:[{name:'NOME',type:'C',length:50}],color:'#c66a24'});
  L._cavaLimitDraft=true;L._cavaReferencia=true;
  L._defProps={NOME:'Limite de cava ou pilha'}; refreshUI(); ribbonClose(); setTool('poly');
  toast('Desenhe o limite; toque duplo ou Esc fecha. Depois escolha máxima/mínima, down/up e inside/outside.');
}
function cavaEditarLimite(){
  RIB_CAT_ATUAL='mineracao';
  if(typeof switchView==='function'&&S._view!=='map')switchView('map');
  /* ENTRADA DIRETA: se o limite já é conhecido (3.1 ativo, cava viva ou
     feição selecionada), entra em edição sem exigir o toque de escolha */
  {
    const st=S._rb31;
    if(st&&st.srcLayerId!=null){
      const L=(S.layers||[]).find(q=>String(q.id)===String(st.srcLayerId)),
        f=L&&L.features&&L.features[st.srcFeatIdx];
      if(L&&f){cavaEditarLimiteItem({L,f,i:st.srcFeatIdx});return;}
    }
    const CV=cavaProjetoAtual();
    if(CV){
      const fonte=cavaResolverFonte(CV.cavaDesign);
      if(fonte){S._cavaProjectId=CV.id;cavaEditarLimiteItem(fonte);return;}
    }
    const sf=S.selFeat;
    if(sf&&sf.layer&&(sf.layer.gtype==='line'||sf.layer.gtype==='polygon')&&
      sf.layer.features&&sf.layer.features[sf.idx]){
      cavaEditarLimiteItem({L:sf.layer,f:sf.layer.features[sf.idx],i:sf.idx});return;
    }
  }
  /* o usuário ESCOLHE qual linha é o limite: um toque no mapa localiza
     a feição de linha/polígono mais próxima (≤20 m), que vira o limite
     em edição — as feições derivadas (3.1) acompanham dinamicamente */
  setTool('select');
  const infoR=document.getElementById('rb31Info');
  if(infoR)infoR.textContent='Toque na linha que será o LIMITE: ela entra em edição de vértices…';
  toast('Toque na linha que será o limite dinâmico');
  /* toque EM CIMA da feição: entrega direta (o clique era engolido);
     toque perto (fora da linha): varredura por distância ≤20 m */
  const hMapa=ev=>{S._pickLimite=null;acheiPorPonto(ev.latlng);};
  S._pickLimite=(L,idx)=>{try{map.off('click',hMapa);}catch(e){}
    if(L&&L.features&&L.features[idx])cavaEditarLimiteItem({L,f:L.features[idx],i:idx});
  };
  map.once('click',hMapa);
  function acheiPorPonto(ll){
    const c=fromWGS(S.workCRS,ll.lng,ll.lat);
    let ach=null,bd=20*20; /* raio de 20 m */
    for(const L of (S.layers||[])){
      if(!L.visible&&L.visible!==undefined)continue;
      if(L.gtype!=='line'&&L.gtype!=='polygon')continue; /* FIX: era 'poly' — polígonos (o limite!) nunca eram encontrados */
      (L.features||[]).forEach((f,i)=>{
        if(!f.geom)return;
        const rs=(f.multi&&Array.isArray(f.geom[0]&&f.geom[0][0]))?f.geom:[f.geom];
        for(const r of rs){
          for(let q=0;q<r.length-1;q++){
            const a2=r[q],b2=r[q+1];
            if(!Array.isArray(a2)||typeof a2[0]!=='number')continue;
            const dx=b2[0]-a2[0],dy=b2[1]-a2[1],qq=dx*dx+dy*dy,
              t=Math.max(0,Math.min(1,qq?((c[0]-a2[0])*dx+(c[1]-a2[1])*dy)/qq:0)),
              d2=(c[0]-a2[0]-dx*t)**2+(c[1]-a2[1]-dy*t)**2;
                    /* empate técnico: o LIMITE do 3.1 tem preferência sobre as
               linhas derivadas da cava desenhadas por cima dele */
            const st31=S._rb31,ehLimite=st31&&String(L.id)===String(st31.srcLayerId),
              peso=ehLimite?d2*0.5:d2;
            if(peso<bd){bd=peso;ach={L,f,i};}
          }
        }
      });
    }
    if(!ach){
      /* o comando NÃO morre num toque perdido: continua armado */
      toast('Nenhuma linha a até 20 m do toque — toque de novo, mais perto da linha');
      S._pickLimite=(L2x,idx2)=>{try{map.off('click',hMapa);}catch(e){}
        if(L2x&&L2x.features&&L2x.features[idx2])
          cavaEditarLimiteItem({L:L2x,f:L2x.features[idx2],i:idx2});};
      map.once('click',hMapa);
      return;
    }
    cavaEditarLimiteItem(ach);
  }
}
function cavaEditarLimiteItem(item){
  /* Se a linha tocada é uma cava calculada, a edição volta ao limite
     que a controla — nunca aos pés/cristas derivados. */
  const P=(item&&item.L&&item.L.cavaDesign)?item.L:null;
  if(P&&P.cavaDesign){
    const fonte=cavaResolverFonte(P.cavaDesign);
    if(fonte)item=fonte;
  }
  if(!item||!item.L||!item.f){
    toast('Escolha ou gere primeiro o limite superior da cava');return;
  }
  /* O limite inicial é documento de referência. A ferramenta de vértices
     só pode abrir a cópia ◈; assim nenhum clique acidental destrói a base
     usada para comparar a cava e a interseção. */
  if(!item.L._cavaLimiteDin){
    const ref=item,rel=(S.layers||[]).filter(x=>x._cavaLimiteDin&&
      String(x._cavaLimiteOrig)===String(ref.L.id)&&
      (x._cavaLimiteOrigFeat==null||+x._cavaLimiteOrigFeat===+(ref.i||0))).at(-1);
    if(rel&&rel.features&&rel.features[0])item={L:rel,f:rel.features[0],i:0};
    else{
      const ne=document.getElementById('rb31NomeLim');
      if(ne&&!ne.value.trim())ne.value=cavaNomeLimiteParametrico(ref);
      toast('A referência é protegida. Crie primeiro o limite paramétrico ◈ para editar os vértices.');
      ne?.focus();return;
    }
  }
  /* Entrar em edição do limite significa edição dinâmica. Builds/projetos
     antigos podiam trazer live=false e pareciam aceitar o arraste sem
     recalcular nada; reativa explicitamente todos os projetos vinculados. */
  const sourceLimitId=cavaIdFonte(item,true);
  (S.layers||[]).forEach(q=>{
    const d=q.cavaDesign;
    if(!d)return;
    const ligada=(sourceLimitId&&String(d.sourceLimitId||'')===sourceLimitId)||
      (String(d.sourceLayer)===String(item.L.id)&&+d.sourceFeature===+item.i);
    if(ligada){d.live=true;d.sourceLayer=item.L.id;d.sourceFeature=item.i;d.sourceLimitId=sourceLimitId;S._cavaProjectId=q.id;}
  });
  const liveChk=document.getElementById('cavaLive');if(liveChk)liveChk.checked=true;
  S.activeId=item.L.id;
  S.selFeat={layer:item.L,layerId:item.L.id,idx:item.i};
  /* A linha tocada passa a ser também a escolha formal do passo 1. Isso
     mantém seleção do mapa, seletor do painel e cálculo máximo/mínimo usando
     exatamente a mesma feição. */
  try{
    refreshCavaMineracao();const s=document.getElementById('cavaBaseSel'),v=`${item.L.id}:${item.i}`;
    if(s&&[...s.options].some(o=>o.value===v))s.value=v;
    cavaAtualizaCotaInfo();cavaAtualizaCaminhoInfo();
  }catch(e){console.warn('sincronização do limite escolhido',e);}
  /* o painel/aba só fecha quando o usuário fechar (regra do projeto) */
  refreshUI();setTool('vertex');showVertices();
  try{
    const lls=featToLatLngs(item.L,item.f),pts=[];
    (function flat(a){if(!a)return;if(typeof a[0]==='number')pts.push(a);else a.forEach(flat);})(lls);
    if(pts.length)safeFit(L2.latLngBounds(pts).pad(.25));
  }catch(e){}
  toast('Edite ou arraste vértices e pontos médios: bancos, rampa e interseção acompanham dinamicamente');
}
/* ============================================================
   CCMGIS 3.1 — RAMPA POR BANCADA (modo de teste) — NÚCLEO v2
   OFFSET PARALELO VERDADEIRO (estilo CAD, figura de referência):
   normal EXATA de cada aresta + vértice de MITRA em cada canto —
   nada de normais suavizadas (elas arredondavam e cortavam os
   cantos: d(jog→natural) caía a 8,45 onde devia ser W constante).
   Modelo medido do teste.dxf:
   · pé natural = offset do limite p/ dentro por recuo = H/tan(α)
   · sob a rampa o pé desloca +W P/ DENTRO (paralela exata com mitra;
     d(pé_arco→limite) = recuo+W constante)
   · borda EXTERNA cola na face interpolada; INTERNA = externa − W
   · L nominal medido NO EIXO; soleira enviesada em cima da crista
     (B0 no ponto indicado, A0 entra W à frente na cadeia)
   · entrada: diagonal reta de ~1,75·W (anatomia do DXF, v0→v2≈19,7 m)
   · saída: junta radial SECA com coincidência de vértices
   ============================================================ */

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

/* andarilho de arestas do anel: posição e normal EXATA da aresta na
   cadeia s; base do offset paralelo (sem suavização) */
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

/* offset paralelo EXATO de um anel (estilo CAD): arestas deslocadas
   pela normal exata + vértice de MITRA em cada canto (cap 8×), sem
   nenhum arredondamento/suavização. Pós-processo: só remoção de laços
   de auto-interseção (cavaDeloop), agulhas degeneradas e duplicatas —
   nada que mude a forma fiel. */
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

/* OFFSET 2D CONSTANTE de um anel fechado.
   A operação booleana elimina automaticamente sobreposições locais:
   - dist > 0: dilatação exterior do polígono;
   - dist < 0: erosão interior do polígono.
   Retângulos paralelos às arestas + discos nos vértices formam o tubo de
   raio |dist|. Assim o novo contorno inteiro fica à distância configurada,
   inclusive nos cantos, sem a remoção posterior de nós que criava cordas e
   fazia o pé preto encostar novamente na crista laranja. */
function rb31Offset2DConstante(anel,dist){
  const pc=(typeof polygonClipping!=='undefined')?polygonClipping:
    ((typeof window!=='undefined')?window.polygonClipping:null),
    D=Math.abs(+dist||0),base=[],snap=x=>Math.round(+x*1000)/1000;
  if(!pc||typeof pc.union!=='function'||typeof pc.difference!=='function')
    return {ring:null,warn:'Biblioteca do offset 2D indisponível'};
  if(!(D>0))return {ring:null,warn:'Distância do offset inválida'};
  for(const p of anel||[]){
    if(!p||!Number.isFinite(+p[0])||!Number.isFinite(+p[1]))continue;
    const q=[snap(p[0]),snap(p[1])],u=base[base.length-1];
    if(!u||Math.hypot(q[0]-u[0],q[1]-u[1])>1e-8)base.push(q);
  }
  while(base.length>2&&Math.hypot(base[0][0]-base.at(-1)[0],
    base[0][1]-base.at(-1)[1])<1e-8)base.pop();
  if(base.length<3)return {ring:null,warn:'A linha fechada não comporta o offset 2D'};
  const fecha=r=>r.concat([[r[0][0],r[0][1]]]),polBase=[fecha(base)],tubo=[],
    nArco=48;
  for(let i=0;i<base.length;i++){
    const a=base[i],b=base[(i+1)%base.length],dx=b[0]-a[0],dy=b[1]-a[1],
      L=Math.hypot(dx,dy);
    if(L<1e-9)continue;
    const nx=-dy/L*D,ny=dx/L*D,q=[[snap(a[0]+nx),snap(a[1]+ny)],
      [snap(b[0]+nx),snap(b[1]+ny)],[snap(b[0]-nx),snap(b[1]-ny)],
      [snap(a[0]-nx),snap(a[1]-ny)]];
    q.push(q[0].slice());tubo.push([q]);
  }
  for(const v of base){
    const c=[];
    for(let j=0;j<=nArco;j++){
      const a=2*Math.PI*j/nArco,q=[snap(v[0]+D*Math.cos(a)),snap(v[1]+D*Math.sin(a))],
        u=c[c.length-1];
      if(!u||q[0]!==u[0]||q[1]!==u[1])c.push(q);
    }
    if(c.length&&((c[0][0]!==c.at(-1)[0])||(c[0][1]!==c.at(-1)[1])))c.push(c[0].slice());
    tubo.push([c]);
  }
  const uneLotes=geoms=>{
    let acc=geoms[0];
    /* Coordenadas já estão estabilizadas ao milímetro; lotes pequenos
       reduzem tempo e memória sem reunir todos os eventos num único sweep. */
    for(let i=1;i<geoms.length;i+=8)acc=pc.union(acc,...geoms.slice(i,i+8));
    return acc;
  };
  try{
    const faixa=uneLotes(tubo),xs=base.map(p=>p[0]),ys=base.map(p=>p[1]),
      span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),D),
      pad=span+4*D,
      caixa=[[Math.min(...xs)-pad,Math.min(...ys)-pad],
        [Math.max(...xs)+pad,Math.min(...ys)-pad],
        [Math.max(...xs)+pad,Math.max(...ys)+pad],
        [Math.min(...xs)-pad,Math.max(...ys)+pad]];
    caixa.push(caixa[0].slice());
    let mp;
    if(dist>0){
      mp=pc.union(polBase,faixa);
    }else{
      const exterior=pc.difference([caixa],polBase),
        exteriorComFaixa=pc.union(exterior,faixa);
      mp=pc.difference([caixa],exteriorComFaixa);
    }
    let melhor=null,areaMelhor=-1;
    const area=r=>{let s=0;for(let i=0;i<r.length-1;i++)
      s+=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1];return Math.abs(s/2);};
    for(const poly of mp||[]){
      const r=poly&&poly[0],a=r&&r.length>=4?area(r):-1;
      if(a>areaMelhor){melhor=r;areaMelhor=a;}
    }
    if(!melhor)return {ring:null,warn:'O contorno não comporta esse offset 2D'};
    const ring=[];
    for(const p of melhor){
      const q=[+p[0],+p[1]],u=ring[ring.length-1];
      if(!u||Math.hypot(q[0]-u[0],q[1]-u[1])>1e-7)ring.push(q);
    }
    while(ring.length>2&&Math.hypot(ring[0][0]-ring.at(-1)[0],
      ring[0][1]-ring.at(-1)[1])<1e-7)ring.pop();
    if(ring.length<3)return {ring:null,warn:'O contorno não comporta esse offset 2D'};
    /* Auditoria geométrica: amostra todos os segmentos publicados e mede
       a menor distância ao anel laranja. Uma aproximação de arco com 48
       lados admite menos de 8 mm de erro numa berma de 6 m. */
    const dFonte=p=>{
      let bd=Infinity;
      for(let i=0;i<base.length;i++){
        const a=base[i],b=base[(i+1)%base.length],dx=b[0]-a[0],dy=b[1]-a[1],
          q=dx*dx+dy*dy,t=Math.max(0,Math.min(1,q?((p[0]-a[0])*dx+
            (p[1]-a[1])*dy)/q:0)),ex=p[0]-a[0]-dx*t,ey=p[1]-a[1]-dy*t;
        bd=Math.min(bd,Math.hypot(ex,ey));
      }
      return bd;
    };
    let minimo=Infinity,maximo=0;
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      for(const t of [0,.25,.5,.75]){
        const d=dFonte([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
        minimo=Math.min(minimo,d);maximo=Math.max(maximo,d);
      }
    }
    const tol=Math.max(.05,D*.01);
    if(minimo<D-tol||maximo>D+tol)return {ring:null,
      warn:'O offset 2D não conservou a distância da berma'};
    return {ring,warn:'',minimo,maximo};
  }catch(e){
    return {ring:null,warn:'Falha ao calcular o offset 2D fechado: '+(e&&e.message?e.message:e)};
  }
}

/* Paralela CAD 2D: interseção das retas deslocadas de cada par de arestas.
   Diferente do método antigo, não existe bisel nem exclusão de vértice —
   portanto nenhuma corda pode voltar em direção à linha de origem. */
function rb31Offset2DExato(anel,dist){
  const pc=(typeof polygonClipping!=='undefined')?polygonClipping:
    ((typeof window!=='undefined')?window.polygonClipping:null),D=Math.abs(+dist||0),base=[];
  if(!(D>0))return {ring:null,warn:'Distância do offset inválida'};
  for(const p of anel||[]){
    if(!p||!Number.isFinite(+p[0])||!Number.isFinite(+p[1]))continue;
    const q=[+p[0],+p[1]],u=base.at(-1);
    if(!u||Math.hypot(q[0]-u[0],q[1]-u[1])>1e-8)base.push(q);
  }
  while(base.length>2&&Math.hypot(base[0][0]-base.at(-1)[0],
    base[0][1]-base.at(-1)[1])<1e-8)base.pop();
  if(base.length<3)return {ring:null,warn:'A linha fechada não comporta o offset 2D'};
  const wk=rb31Walker(base),raw=[];
  for(let i=0;i<base.length;i++){
    const im=(i-1+base.length)%base.length,ip=(i+1)%base.length,p=base[i],
      a=[p[0]+wk.nE[im][0]*dist,p[1]+wk.nE[im][1]*dist],
      b=[p[0]+wk.nE[i][0]*dist,p[1]+wk.nE[i][1]*dist],
      v=[p[0]-base[im][0],p[1]-base[im][1]],
      w=[base[ip][0]-p[0],base[ip][1]-p[1]],den=v[0]*w[1]-v[1]*w[0];
    let q;
    if(Math.abs(den)<1e-10)q=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    else{
      const t=((b[0]-a[0])*w[1]-(b[1]-a[1])*w[0])/den;
      q=[a[0]+v[0]*t,a[1]+v[1]*t];
    }
    if(Number.isFinite(q[0])&&Number.isFinite(q[1]))raw.push(q);
  }
  if(raw.length<3)return {ring:null,warn:'O contorno não comporta esse offset 2D'};
  const fecha=r=>r.concat([[r[0][0],r[0][1]]]),candidatos=[];
  if(pc&&typeof pc.union==='function'){
    try{
      const mp=pc.union([fecha(raw)]);
      for(const poly of mp||[])if(poly&&poly[0]&&poly[0].length>=4)candidatos.push(poly[0]);
    }catch(e){}
  }
  if(!candidatos.length)candidatos.push(fecha(raw));
  const area=r=>{let s=0;for(let i=0;i<r.length-1;i++)
    s+=r[i][0]*r[i+1][1]-r[i+1][0]*r[i][1];return Math.abs(s/2);},
    querDentro=dist<0;
  let melhor=null,melhorArea=-1;
  for(const r of candidatos){
    let confere=0,total=0;
    for(let i=0;i<r.length-1;i+=Math.max(1,Math.floor((r.length-1)/24))){
      confere+=(pointInRing(r[i][0],r[i][1],base)===querDentro)?1:0;total++;
    }
    const a=area(r);
    if(confere>=Math.max(1,Math.ceil(total*.75))&&a>melhorArea){melhor=r;melhorArea=a;}
  }
  if(!melhor)return {ring:null,warn:'O offset 2D ficou do lado incorreto da crista'};
  const ring=[];
  for(const p of melhor){
    const q=[+p[0],+p[1]],u=ring.at(-1);
    if(!u||Math.hypot(q[0]-u[0],q[1]-u[1])>1e-7)ring.push(q);
  }
  while(ring.length>2&&Math.hypot(ring[0][0]-ring.at(-1)[0],
    ring[0][1]-ring.at(-1)[1])<1e-7)ring.pop();
  const dFonte=p=>{
    let bd=Infinity;
    for(let i=0;i<base.length;i++){
      const a=base[i],b=base[(i+1)%base.length],dx=b[0]-a[0],dy=b[1]-a[1],
        q=dx*dx+dy*dy,t=Math.max(0,Math.min(1,q?((p[0]-a[0])*dx+
          (p[1]-a[1])*dy)/q:0)),ex=p[0]-a[0]-dx*t,ey=p[1]-a[1]-dy*t;
      bd=Math.min(bd,Math.hypot(ex,ey));
    }
    return bd;
  };
  let minimo=Infinity;
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length];
    for(const t of [0,.25,.5,.75])minimo=Math.min(minimo,
      dFonte([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]));
  }
  if(minimo<D-Math.max(.03,D*.005))return {ring:null,
    warn:'O offset 2D se aproximou da crista em vez de manter a berma'};
  return {ring,warn:'',minimo};
}

/* limpeza FIEL de anel de saída: remove só agulhas (reversão ~180°),
   laços de auto-interseção e duplicatas — nunca arredonda um canto.
   Preserva a junta seca (degrau radial não é agulha nem laço). */
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

/* ---------- GERAR UMA BANCADA ----------
   crista: anel fechado (cota z0);
   opt: {ang,H,W,grade,dir,startP|sIni,avancoIni}
   Devolve {peNatural,peEntregue,bordaA,bordaB,eixo,sIni,sFim,pFim,
            run,L,arco,per,warn}. */
/* SEPARAÇÃO EM LÓBULOS.
   Quando o contorno tem um istmo, o recuo acumulado das bancadas fecha aquele
   trecho e o anel passa a se dobrar sobre si mesmo. Medido no limite real: o
   gargalo tem 40,2 m e cada bancada come 24,48 m de cada lado (talude 33°,
   H 12, berma 6) — na 2ª o istmo some e na 3ª o gerador recusava a bancada
   INTEIRA, embora sobrasse área nos dois lados. O certo é a cava/pilha SE
   DIVIDIR ali e cada lóbulo seguir por conta.
   Regra: em cada auto-interseção nascem dois laços. O que gira no MESMO
   sentido do anel é lóbulo de verdade; o de sentido invertido é artefato do
   afastamento e vai fora. */
function cavaSeparaLobos(ring,areaMin){
  const r=(ring||[]).map(p=>[+p[0],+p[1]]);
  if(r.length>2&&Math.hypot(r[0][0]-r.at(-1)[0],r[0][1]-r.at(-1)[1])<1e-9)r.pop();
  if(r.length<4)return r.length>=3?[r]:[];
  const sinal=Math.sign(cavaArea2(r))||1, minA=Math.max(1e-6,+areaMin||0);
  const cruzou=(a,b,c,d)=>{
    const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],den=rx*sy-ry*sx;
    if(Math.abs(den)<1e-12)return null;
    const t=((c[0]-a[0])*sy-(c[1]-a[1])*sx)/den,
          u=((c[0]-a[0])*ry-(c[1]-a[1])*rx)/den;
    if(t<=1e-9||t>=1-1e-9||u<=1e-9||u>=1-1e-9)return null;
    return [a[0]+rx*t,a[1]+ry*t];
  };
  const saida=[],fila=[r];
  let guarda=0;
  while(fila.length&&guarda++<400){
    const q=fila.shift(),n=q.length;
    if(n<3)continue;
    let achou=null;
    for(let i=0;i<n&&!achou;i++)
      for(let j=i+2;j<n;j++){
        if(i===0&&j===n-1)continue;
        const P=cruzou(q[i],q[(i+1)%n],q[j],q[(j+1)%n]);
        if(P){achou={i,j,P};break;}
      }
    if(!achou){
      if(Math.abs(cavaArea2(q))/2>=minA&&Math.sign(cavaArea2(q))===sinal)saida.push(q);
      continue;
    }
    const {i,j,P}=achou;
    const laco=[P].concat(q.slice(i+1,j+1)),
      resto=q.slice(0,i+1).concat([P],q.slice(j+1));
    if(laco.length>=3)fila.push(laco);
    if(resto.length>=3)fila.push(resto);
  }
  return saida.sort((a,b)=>Math.abs(cavaArea2(b))-Math.abs(cavaArea2(a)));
}
/* CORREÇÃO GEOMÉTRICA FINAL DA RAMPA (v77).
   A linha A é o limite controlador da pista sobre a face teórica. Para
   cada cota, sua distância normal ao pé varia exatamente com
   dz/tan(ângulo). A linha B abre a largura total da estrada para o lado
   operacional, mantendo a mesma cota de A. Assim:
     · pilha: o controle acompanha o PÉ;
     · cava:  o controle acompanha a CRISTA;
     · a face restante entre rampa e pé/crista conserva o ângulo pedido;
     · não existe a antiga boca afunilada, inadequada a caminhões.
   A iteração conjunta de posição e cota mantém também o greide uniforme
   ao longo do traçado já calculado. Na v80, somente o canto controlador
   nasce no vértice de saída da linha pós-offset. A estação de TODA a
   marcha é transladada junto, em vez de puxar apenas o primeiro vértice:
   assim a rampa já sai acompanhando a tangente da crista/pé, sem a
   diagonal artificial de 22°, e a chegada anterior continua separada. */
function rb31ConformaFaceEstrita(linha,peNat,z0,dz,runS,WS,wk,chD,angAlvo,controlRing,mouthAnchor){
  let A=(linha||[]).map(p=>[+p[0],+p[1],Number.isFinite(+p[2])?+p[2]:z0]);
  if(A.length<2||!peNat||peNat.length<2||!wk)return null;
  const clamp=t=>Math.max(0,Math.min(1,t)),
    ringC=(controlRing||[]).map(p=>[+p[0],+p[1]]),
    chC=ringC.length>2?cavaChain(ringC):null;
  /* ORIGEM REAL DA MARCHA. A v79 projetava só A[0] na linha preta; A[1]
     continuava na estação antiga e formava o conector oblíquo medido em
     22°. Aqui calculamos a diferença de estação no pé natural e aplicamos
     a MESMA translação circular a todos os pontos antes da conformação.
     A direção longitudinal, portanto, nasce tangente à linha de controle. */
  let sBoca=null,ancora=null,faceStations=null;
  if(chC&&mouthAnchor){
    const sc=cavaNearestChain(ringC,chC,mouthAnchor),q=cavaPointChain(ringC,chC,sc);
    ancora=[q[0],q[1]];
    const sAlvo=cavaNearestChain(peNat,chD,ancora),
      sAtual=cavaNearestChain(peNat,chD,A[0]);
    let ds=wk.norm(sAlvo-sAtual);
    if(ds>wk.per/2)ds-=wk.per;
    if(Math.abs(ds)>1e-8){
      const arc0=[0];
      for(let i=1;i<A.length;i++)
        arc0.push(arc0[i-1]+Math.hypot(A[i][0]-A[i-1][0],A[i][1]-A[i-1][1]));
      const tot0=arc0.at(-1)||1;
      A=A.map((p,i)=>{
        const t=clamp(arc0[i]/tot0),s0=cavaNearestChain(peNat,chD,p),w=wk.noS(s0+ds),
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
    const total=arc.at(-1)||1;
    A=A.map((p,i)=>{
      const t=clamp(arc[i]/total),z=z0+dz*t,
        s=cavaNearestChain(peNat,chD,p),w=wk.noS(s),r=(1-t)*runS;
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
    const trans=Math.max(2*Math.abs(WS),12),arc=[0];
    for(let i=1;i<A.length;i++)arc.push(arc[i-1]+Math.hypot(A[i][0]-A[i-1][0],A[i][1]-A[i-1][1]));
    const total=arc.at(-1)||1,sRaw=A.map(p=>cavaNearestChain(peNat,chD,p));
    /* Estação da curva de face mais próxima da quebra. A correção usa a
       tangente real da cadeia, não um vetor XY arbitrário. */
    let sFace=sBoca===null?sRaw[0]:sBoca;
    for(let k=0;k<8;k++){
      const w=wk.noS(sFace),q=[w.p[0]+w.n[0]*runS,w.p[1]+w.n[1]*runS],
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
    faceStations=sRaw.map((s,i)=>{
      const t=clamp(arc[i]/total),f0=clamp(1-arc[i]/trans),
        f=f0*f0*(3-2*f0);
      return wk.norm(s+ds0*f);
    });
    A=A.map((p,i)=>{
      const t=clamp(arc[i]/total),w=wk.noS(faceStations[i]),r=(1-t)*runS;
      return [w.p[0]+w.n[0]*r,w.p[1]+w.n[1]*r,z0+dz*t];
    });
    A[0]=[ancora[0],ancora[1],z0];
  }
  const B=[],E=[];
  let faceMin=Infinity,faceMax=-Infinity,wMin=Infinity,wMax=-Infinity,total=0;
  const zPe=z0+dz,arcA=[0];
  for(let i=1;i<A.length;i++)arcA.push(arcA[i-1]+Math.hypot(A[i][0]-A[i-1][0],A[i][1]-A[i-1][1]));
  for(let i=0;i<A.length;i++){
    /* Na vizinhança de uma mitra, a projeção euclidiana pode saltar para
       o lado adjacente do canto. Isso girava a normal da borda B e fazia
       a pista parecer torcida. Usa a mesma estação que construiu A. */
    const p=A[i],s=(faceStations&&Number.isFinite(faceStations[i]))?
        faceStations[i]:cavaNearestChain(peNat,chD,p),w=wk.noS(s),
      uAlvo=[-w.n[0]*Math.sign(WS||1),-w.n[1]*Math.sign(WS||1)],
      ul=Math.hypot(uAlvo[0],uAlvo[1])||1,
      b=[p[0]+uAlvo[0]/ul*Math.abs(WS),p[1]+uAlvo[1]/ul*Math.abs(WS),p[2]],
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
      widthMin:wMin,widthMax:wMax,grade:gradeReal,targetAngle:+angAlvo};
  return {A,B,E,audit};
}
/* CRAVAÇÃO TOPOLOGICA FINAL (v83).
   A conformação da face pode reprojetar os extremos alguns metros ao
   recalcular cota/estação. Isso fazia a linha desenhada terminar no vazio,
   embora o estado ainda guardasse o par correto da quebra. Esta é a ÚLTIMA
   operação geométrica da rampa: as duas bordas coincidem literalmente com
   os dois vértices da saída e com os dois vértices da chegada. Nenhum anel
   de crista, pé ou offset é movido para receber a pista. */
/* Resolve o PAR da quebra diretamente nos vértices do anel preto. Não
   projeta a rampa na aresta e não inventa coordenadas. A boca de uma
   quebra pode conter um ou dois vértices intermediários depois do offset;
   por isso procura pares LOCAIS (até três arestas), mas só aceita o par
   cuja distância já é a largura W dentro da tolerância construtiva. */
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
  const fixa=(i,pA,pB,z)=>{
    if(pA)A[i]=[+pA[0],+pA[1],z];
    if(pB)B[i]=[+pB[0],+pB[1],z];
    E[i]=[(A[i][0]+B[i][0])/2,(A[i][1]+B[i][1])/2,z];
  };
  if(iniA||iniB)fixa(0,iniA,iniB,zIni);
  const n=A.length-1;
  if(fimA||fimB)fixa(n,fimA,fimB,zFim);
  return true;
}
/* ESCOLHA DA QUEBRA EXISTENTE DO OFFSET (v85).
   Há duas assinaturas próximas: a quebra de CHEGADA do trecho anterior e
   a quebra de SAÍDA do trecho seguinte. A distância euclidiana escolhia a
   chegada — exatamente o erro apontado. Agora a busca é 1D ao longo da
   cadeia: parte da chegada, segue o sentido real do tráfego e toma a
   primeira quebra radial completa depois de uma folga mínima de berma.
   Nenhum vértice do anel é criado, removido ou deslocado.

   A v82 confirmava a transversal pelo vetor até o CENTRO GLOBAL. Isso só
   funciona em anéis aproximadamente circulares: no trecho 3 curvo, uma
   quebra correta pode apontar quase tangente a esse vetor e era rejeitada.
   A v85 usa primeiro a geometria LOCAL — a aresta da quebra deve ser
   transversal às arestas vizinhas do próprio offset. É a mesma leitura que
   funcionava visualmente no trecho 2, agora válida em qualquer curva. */
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
  /* pé natural: offset paralelo EXATO (fiel, sem suavizar) */
  if(!crista||crista.length<3)return {warn:'A crista não comporta a bancada'};
  const peNat=rb31OffsetAnel(crista,-runS);
  if(!peNat||peNat.length<3)return {warn:'O anel não comporta a bancada (recuo do talude)'};
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
      if(nA.length>2&&(cortou||eAc>L*0.85)){
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
  /* cravar o fim exatamente em t=1 no pé */
  const wF=wk.noS(s),pF=wF.p,nF=wF.n;
  A[A.length-1]=[pF[0],pF[1],z0+dz];
  Bq[Bq.length-1]=[pF[0]-nF[0]*WS,pF[1]-nF[1]*WS,z0+dz];
  E[E.length-1]=[pF[0]-nF[0]*WS/2,pF[1]-nF[1]*WS/2,z0+dz];
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
  /* Contrato topológico verificável: se qualquer rotina futura voltar a
     remover a junta, a bancada é recusada em vez de publicar linhas roxas
     flutuantes. */
  if(!juntaProtegida.every(q=>rb31PontoProtegido(q,peD,0.03)))
    return {warn:'A junta de chegada da rampa não pôde ser preservada no pé'};
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
  /* A correção anterior era apenas provisória: podia ser rejeitada pelos
     testes de largura/cruzamento e ainda preservava uma zona sem correção
     nas pontas. Foi exatamente aí que a Régua encontrou 84,26°. Esta
     passagem é mandatória e usa a face como lei, não como suavização. */
  const ancoraBoca=solA||(opt.startP?opt.startP:null);
  const faceFinal=rb31ConformaFaceEstrita(A3,peNat,z0,dz,runS,WS,wk,chD,ang,crista,ancoraBoca);
  if(faceFinal){A3=faceFinal.A;B2=faceFinal.B;E2=faceFinal.E;res.faceAudit=faceFinal.audit;}
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
    iniA=degrau?(parPreto?parPreto.A:solA):null,
    iniB=degrau?(parPreto?parPreto.B:solB):null;
  rb31CravaExtremosRampa(A3,B2,E2,
    iniA,iniB,
    fimA,fimB,z0,z0+dz);
  if(res.faceAudit){
    const w0=Math.hypot(A3[0][0]-B2[0][0],A3[0][1]-B2[0][1]),
      n3=A3.length-1,w1=Math.hypot(A3[n3][0]-B2[n3][0],A3[n3][1]-B2[n3][1]);
    res.faceAudit.widthMin=Math.min(res.faceAudit.widthMin,w0,w1);
    res.faceAudit.widthMax=Math.max(res.faceAudit.widthMax,w0,w1);
  }
  return {peNatural:peNat,peEntregue:peD,bordaA:A3,bordaB:B2,eixo:E2,
    sIni,sFim,
    /* Par exato da chegada: os dois cantos pertencem à linha de pé e a
       junta entre eles é normal ao anel. A próxima bancada prolonga esse
       par rigidamente pela direção efetiva da rampa. */
    pFim:A3[A3.length-1].slice(),
    pFimB:B2[B2.length-1].slice(),
    run,L,arco,per,faceAudit:res.faceAudit||null,warn:res.aviso||''};
}

/* SUAVIZAÇÃO de pista (Chaikin, extremos cravados): a marcha das bordas
   projeta um raio por normal local a cada ~2 m — em cantos densos da
   crista a normal vira a cada amostra e a borda sai SERRILHADA. Uma
   pista de rolagem não tem quina: dois cortes de canto arredondam com
   desvio máximo de ~1/4 do lado local, mantendo soleira e chegada
   exatas (o Z é interpolado junto, a grade fica contínua). */
function rb31SuavizaLinha(pts,iter){
  let g=(pts||[]).map(p=>p.slice());
  for(let k=0;k<(iter||2);k++){
    if(g.length<4)break;
    const n2=[g[0].slice()];
    for(let i=0;i<g.length-1;i++){
      const a=g[i],b=g[i+1];
      n2.push([a[0]*0.75+b[0]*0.25,a[1]*0.75+b[1]*0.25,(a[2]||0)*0.75+(b[2]||0)*0.25]);
      n2.push([a[0]*0.25+b[0]*0.75,a[1]*0.25+b[1]*0.75,(a[2]||0)*0.25+(b[2]||0)*0.75]);
    }
    n2.push(g[g.length-1].slice());
    g=n2;
  }
  return g;
}
/* remove JOGS EM Z numa borda de pista: duas dobras fortes (>angMin) a
   poucos vértices de distância são artefato (a estrada não faz zigue) —
   o trecho entre elas vira ligação reta. Só interior profundo: as juntas
   cravadas (soleira/chegada/entrada) ficam intactas. */
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
/* remove LAÇOS de auto-interseção numa linha ABERTA 3D: quando dois
   segmentos não adjacentes se cruzam, o trecho entre eles é um laço
   parasita do offset — substitui-se pelo próprio ponto de cruzamento.
   Extremos preservados (soleira/chegada cravadas). */
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
/* ESPINHO em anel FECHADO (inclusive na costura): remove vértices onde a
   direção reverte >134° com perna curta — o triângulo fino que fazia o pé
   deixar de acompanhar a crista. Indexação circular; devolve fechado. */
function rb31DespikeFechado(gg){
  if(!gg||gg.length<5)return gg;
  let g=gg.slice(0,-1).map(p=>p.slice());   /* abre a costura */
  let guard=0,mexeu=true;
  while(mexeu&&guard++<32&&g.length>4){
    mexeu=false;
    for(let i=0;i<g.length;i++){
      const a=g[(i-1+g.length)%g.length],b=g[i],c2=g[(i+1)%g.length],
        v1=[b[0]-a[0],b[1]-a[1]],v2=[c2[0]-b[0],c2[1]-b[1]],
        n1=Math.hypot(...v1),n2=Math.hypot(...v2);
      if(n1<1e-9||n2<1e-9){g.splice(i,1);mexeu=true;break;}
      const c=(v1[0]*v2[0]+v1[1]*v2[1])/(n1*n2);
      if(c<-0.7&&Math.min(n1,n2)<=3){g.splice(i,1);mexeu=true;break;}
    }
  }
  g.push(g[0].slice());
  return g;
}
/* limpeza de SPIKES numa linha ABERTA 3D (bordas da rampa): remove
   vértice interno cuja direção reverte (desvio ≥ ang) com lado curto
   (≤ lado). Preserva SEMPRE o 1º e o último vértice (soleira/chegada
   cravadas). Não é suavização: canto legítimo fica. */
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

/* ---------- OFFSET DA BERMA ---------- */
function rb31Berma(pe,B,fora){
  if(!(B>0))return {warn:'Berma inválida'};
  /* A linha de chegada chega FECHADA. Na subida ela é a CRISTA laranja.
     A repetição do primeiro ponto no final é
     removida apenas para o cálculo CAD; a geometria-fonte continua sendo
     o anel completo e separado do novo PÉ preto. */
  const base=(pe||[]).map(p=>[+p[0],+p[1]]);
  if(base.length>3&&Math.hypot(base[0][0]-base.at(-1)[0],base[0][1]-base.at(-1)[1])<1e-8)
    base.pop();
  if(base.length<3)return {warn:'A linha fechada não comporta a berma'};
  let ring=rb31OffsetAnel(base,fora?B:-B); /* offset EXATO, fiel, sem suavizar */
  if(!ring||ring.length<3)return {warn:'O anel não comporta a berma'};
  ring=rb31SaneiaOffset(ring,base,B);
  if(!ring||ring.length<3)return {warn:'O anel não comporta a berma'};
  return {ring,warn:''};
}
/* Usa literalmente o mesmo núcleo do comando CAD → Offset. A única
   automação adicional é escolher entre esquerda/direita conforme o lado
   configurado para os bancos; nenhum saneamento, buffer ou auditoria muda
   a polilinha devolvida pelo CAD. */
function rb31OffsetCad(anel,B,fora){
  if(!(B>0)||typeof offsetRing!=='function')return {ring:null,warn:'Offset CAD indisponível'};
  const base=[];
  for(const p of anel||[]){
    if(!p||!Number.isFinite(+p[0])||!Number.isFinite(+p[1]))continue;
    const q=[+p[0],+p[1]],u=base.at(-1);
    if(!u||Math.hypot(q[0]-u[0],q[1]-u[1])>1e-8)base.push(q);
  }
  while(base.length>2&&Math.hypot(base[0][0]-base.at(-1)[0],
    base[0][1]-base.at(-1)[1])<1e-8)base.pop();
  if(base.length<3)return {ring:null,warn:'A crista fechada não comporta o offset CAD'};
  /* offsetRing: distância positiva = lado ESQUERDO da polilinha.
     Em anel anti-horário o interior está à esquerda; em horário, à direita.
     Logo Inside/Outside define o sinal sem qualquer tentativa heurística. */
  const sinalDentro=rb31AreaSinal(base)>0?1:-1,
    dCad=(fora?-sinalDentro:sinalDentro)*B,
    ring=offsetRing(base,dCad,true);
  if(!ring||ring.length<3)return {ring:null,warn:'Não foi possível gerar o offset CAD'};
  return {ring:ring.map(p=>[p[0],p[1]]),warn:'',distCad:dCad};
}
/* Par inicial da próxima rampa ENTRE AS BERMAS.
   Na SUBIDA, localiza no PÉ preto a travessa paralela que o offset criou
   a B metros da CRISTA laranja. Resultado: largura preservada, afastamento
   exato e nenhuma linha roxa desenhada no patamar. */
function rb31ParOffsetBerma(pA,pB,linhaNova,B){
  if(!pA||!pB||!linhaNova||linhaNova.length<3||!(B>0))return null;
  const sx=pB[0]-pA[0],sy=pB[1]-pA[1],sl=Math.hypot(sx,sy);
  if(!(sl>1e-8))return null;
  const ux=sx/sl,uy=sy/sl,nx=-uy,ny=ux,
    mx=(pA[0]+pB[0])/2,my=(pA[1]+pB[1])/2;
  let melhor=null;
  /* O offset CAD desloca a ARESTA exatamente B, mas seus vértices andam
     pelas mitras dos cantos. Por isso procura a própria aresta paralela
     produzida no novo anel; trasladar os vértices antigos deixava uma das
     pontas fora da linha. */
  for(let i=0;i<linhaNova.length;i++){
    const a=linhaNova[i],b=linhaNova[(i+1)%linhaNova.length],
      ex=b[0]-a[0],ey=b[1]-a[1],el=Math.hypot(ex,ey);
    if(el<sl*.94)continue;
    const vx=ex/el,vy=ey/el,par=Math.abs(vx*ux+vy*uy);
    if(par<.985)continue;
    const emx=(a[0]+b[0])/2,emy=(a[1]+b[1])/2,
      afast=Math.abs((emx-mx)*nx+(emy-my)*ny),
      erroA=Math.abs(afast-B);
    if(erroA>Math.max(.25,.05*B))continue;
    /* Recorta sobre a própria aresta uma boca de largura exatamente igual
       à anterior. O centro mais próximo da travessa antiga é usado, mas
       sempre limitado ao trecho realmente existente no offset. */
    const ta=(a[0]-mx)*ux+(a[1]-my)*uy,
      tb=(b[0]-mx)*ux+(b[1]-my)*uy,
      lo=Math.min(ta,tb),hi=Math.max(ta,tb);
    if(hi-lo<sl-.03)continue;
    let tc=Math.max(lo+sl/2,Math.min(hi-sl/2,0));
    const t0=tc-sl/2,t1=tc+sl/2,
      ponto=t=>{
        const den=tb-ta;
        if(Math.abs(den)<1e-10)return null;
        const q=(t-ta)/den;
        return [a[0]+ex*q,a[1]+ey*q];
      },
      A=ponto(t0),C=ponto(t1);
    if(!A||!C)continue;
    const score=erroA*20+(1-par)*100+Math.abs(tc)*.02+Math.abs(el-sl)*.01;
    if(!melhor||score<melhor.score)melhor={A,C,score};
  }
  if(melhor)return {A:melhor.A,B:melhor.C};
  /* O buffer 2D pode subdividir uma travessa reta em vários segmentos
     colineares. Nesse caso, projeta as duas pontas teóricas da travessa
     deslocada sobre o próprio anel; não cria ligação sobre a berma. */
  const projeta=p=>{
    let best=null,bd=Infinity;
    for(let i=0;i<linhaNova.length;i++){
      const a=linhaNova[i],b=linhaNova[(i+1)%linhaNova.length],dx=b[0]-a[0],dy=b[1]-a[1],
        q=dx*dx+dy*dy,t=Math.max(0,Math.min(1,q?((p[0]-a[0])*dx+
          (p[1]-a[1])*dy)/q:0)),x=a[0]+dx*t,y=a[1]+dy*t,d=Math.hypot(p[0]-x,p[1]-y);
      if(d<bd){bd=d;best=[x,y];}
    }
    return {p:best,d:bd};
  };
  let fb=null;
  for(const s of [-1,1]){
    const tA=[pA[0]+nx*B*s,pA[1]+ny*B*s],tB=[pB[0]+nx*B*s,pB[1]+ny*B*s],
      a=projeta(tA),b=projeta(tB),larg=a.p&&b.p?Math.hypot(a.p[0]-b.p[0],a.p[1]-b.p[1]):Infinity,
      erro=a.d+b.d+Math.abs(larg-sl);
    if(a.d<=.08&&b.d<=.08&&Math.abs(larg-sl)<=.08&&(!fb||erro<fb.erro))
      fb={A:a.p,B:b.p,erro};
  }
  return fb?{A:fb.A,B:fb.B}:null;
}
/* Vértice ISOLADO cuja mitra ficou mais curta que o offset pedido (canto
   que inverte a concavidade quando a geração é para fora): os dois
   vizinhos estão na distância certa, então o vértice é artefato e sai —
   a aresta entre os vizinhos já respeita a largura. Critério estrito:
   nada é removido quando o offset saiu correto (o modo para dentro,
   calibrado, passa intocado). */
function rb31SaneiaOffset(ring,base,dist){
  const d=p=>{
    let bd=Infinity;const n=base.length;
    for(let i=0;i<n;i++){
      const a=base[i],b=base[(i+1)%n],dx=b[0]-a[0],dy=b[1]-a[1],q=dx*dx+dy*dy,
        t=Math.max(0,Math.min(1,q?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/q:0)),
        e=(p[0]-a[0]-dx*t)**2+(p[1]-a[1]-dy*t)**2;
      if(e<bd)bd=e;
    }
    return Math.sqrt(bd);
  };
  const n=ring.length,ds=ring.map(d),fora=[];
  for(let i=0;i<n;i++){
    if(ds[i]>=dist*0.9)continue;                       /* está na largura */
    const a=ds[(i-1+n)%n],b=ds[(i+1)%n];
    if(a>=dist*0.97&&b>=dist*0.97)fora.push(i);        /* isolado entre bons */
  }
  if(!fora.length)return ring;
  const rm=new Set(fora);
  const out=ring.filter((_,i)=>!rm.has(i));
  return out.length>=3?out:ring;
}


/* ===== UI 3.1 — rampa por bancada (modo de teste iterativo) ===== */
function rb31Estado(){
  if(!S._rb31)S._rb31={fase:'crista',banco:0,crista:null,z:null,zPe:null,
    pe:null,startP:null,pFim:null,feats:[],layer:null,
    eixos:[],hist:[],paramBancos:[],novoInicioP:null};
  return S._rb31;
}
/* Semântica construtiva das linhas:
   · SUBIDA (pilha): a rampa nasce no PÉ preto e termina na CRISTA laranja;
     o offset da crista cria o pé da bancada seguinte.
   · DESCIDA (cava): a ordem é inversa e permanece no fluxo original.
   Internamente `crista` continua sendo o nome legado do anel de partida. */
function rb31EhSubida(st){
  if(st&&st.travaUp!==undefined)return !!st.travaUp;
  return (document.getElementById('cavaSentido')||{}).value==='up';
}
function rb31ClassePartida(st){return rb31EhSubida(st)?'rb31-pe':'rb31-crista';}
function rb31ClasseChegada(st){return rb31EhSubida(st)?'rb31-crista':'rb31-pe';}
function rb31NomePartida(st){return rb31EhSubida(st)?'Pé':'Crista';}
function rb31NomeChegada(st){return rb31EhSubida(st)?'Crista':'Pé';}
/* anel fechado p/ desenho: repete o 1º vértice no fim (regra do
   usuário: sempre gerar linhas fechadas) */
function rb31Fecha(ring){
  const g=ring.map(p=>[p[0],p[1]]);
  if(g.length&&(g[0][0]!==g[g.length-1][0]||g[0][1]!==g[g.length-1][1]))g.push([g[0][0],g[0][1]]);
  return g;
}
function rb31Fields(){
  return [{name:'TIPO',type:'C',length:45},{name:'BANCO',type:'N',length:6,decimal:0},
    {name:'COTA',type:'N',length:14,decimal:3},{name:'ALTURA',type:'N',length:10,decimal:2},
    {name:'BERMA',type:'N',length:10,decimal:2},{name:'ANGULO',type:'N',length:8,decimal:2},
    {name:'CLASSE',type:'C',length:15}];
}
/* LIMPEZA DE DEGRAUS (24/08): dente curto (dois giros fortes com uma perna
   menor que 60% da largura da pista) numa linha de crista/pé é resíduo de
   offset — não é a abertura da rampa, que mede ~W e nasce colada nas bordas
   roxas. Esses dentes são colapsados; a quebra da boca é preservada. */
function rb31TiraDegraus(st){
  try{
    if(!st||!st.feats)return;
    const W=Math.abs(+((document.getElementById('rb31W')||{}).value)||10);
    const bordas=st.feats.filter(f=>/rb31-rampa/.test((f.props||{}).CLASSE||''))
      .map(f=>f.geom).filter(g=>g&&g.length);
    const pertoDaBoca=q=>{
      for(const g of bordas){
        for(const e of [g[0],g[g.length-1]])
          if(Math.hypot(q[0]-e[0],q[1]-e[1])<1.6*W)return true;
      }
      return false;
    };
    st.feats.forEach(f=>{
      const cl=(f.props||{}).CLASSE||'';
      if(cl!=='rb31-pe'&&cl!=='rb31-crista')return;
      let g=f.geom;
      if(!g||g.length<7)return;
      let mexeu=false,guard=0;
      while(guard++<20){
        let alvo=-1;
        for(let i=1;i<g.length-2;i++){
          const v1=[g[i][0]-g[i-1][0],g[i][1]-g[i-1][1]],
            v2=[g[i+1][0]-g[i][0],g[i+1][1]-g[i][1]],
            v3=[g[i+2][0]-g[i+1][0],g[i+2][1]-g[i+1][1]];
          const n1=Math.hypot(v1[0],v1[1]),n2=Math.hypot(v2[0],v2[1]),n3=Math.hypot(v3[0],v3[1]);
          if(n1<1||n2<0.2||n3<1||n2>0.6*W)continue;
          const a1=Math.acos(Math.max(-1,Math.min(1,(v1[0]*v2[0]+v1[1]*v2[1])/(n1*n2))))*180/Math.PI;
          const a2=Math.acos(Math.max(-1,Math.min(1,(v2[0]*v3[0]+v2[1]*v3[1])/(n2*n3))))*180/Math.PI;
          if(a1>60&&a2>60&&!pertoDaBoca(g[i])&&!pertoDaBoca(g[i+1])){alvo=i;break;}
        }
        if(alvo<0)break;
        /* colapsa o dente: os dois vértices viram um único ponto médio */
        const m=[(g[alvo][0]+g[alvo+1][0])/2,(g[alvo][1]+g[alvo+1][1])/2,
          g[alvo][2]!==undefined?g[alvo][2]:undefined];
        g.splice(alvo,2,m.filter(v=>v!==undefined));
        mexeu=true;
      }
      if(mexeu){
        f.geom=g;
        if(Array.isArray(f.zg)&&f.zg.length!==g.length){
          const z0=f.zg.find(z=>Number.isFinite(z));
          f.zg=g.map(()=>Number.isFinite(z0)?z0:0);
        }
      }
    });
  }catch(e){}
}
/* ===== LINHAS ACOMPANHAM A PROJEÇÃO DA RAMPA (24/08) =====
   Onde a rampa passa, o anel de crista/pé não pode ser o offset cego do anel
   anterior: ele tem de ficar PARALELO à borda da pista, afastado pelo talude
   do projeto ( |Δcota| / tan(ang) ). Era esse descasamento que produzia os
   degraus em L circulados. Mexe SÓ nas linhas de crista/pé geradas; a rampa
   não é tocada. */
function rb31LinhasSeguemRampa(st){
  try{
    if(!st||!st.feats)return;
    const el=id=>document.getElementById(id);
    const ang=+((el('rb31Ang')||{}).value||33),
      W=Math.abs(+((el('rb31W')||{}).value)||10),
      tan=Math.tan(ang*Math.PI/180);
    const bordas=st.feats.filter(f=>/rb31-rampa/.test((f.props||{}).CLASSE||'')&&
      f.geom&&f.geom.length>1&&f.zg&&f.zg.length===f.geom.length);
    if(!bordas.length)return;
    /* projeção no conjunto de bordas: ponto mais próximo + cota interpolada */
    const projBordas=P=>{
      let best=null;
      for(const b of bordas){
        const g=b.geom,zg=b.zg;
        for(let i=1;i<g.length;i++){
          const a=g[i-1],c=g[i],dx=c[0]-a[0],dy=c[1]-a[1],L2=dx*dx+dy*dy;
          if(L2<1e-9)continue;
          let t=((P[0]-a[0])*dx+(P[1]-a[1])*dy)/L2;
          t=Math.max(0,Math.min(1,t));
          const x=a[0]+t*dx,y=a[1]+t*dy,d=Math.hypot(P[0]-x,P[1]-y);
          if(!best||d<best.d)best={d,q:[x,y],z:(zg[i-1]||0)+t*((zg[i]||0)-(zg[i-1]||0))};
        }
      }
      return best;
    };
    st.feats.forEach(f=>{
      const cl=(f.props||{}).CLASSE||'';
      if(cl!=='rb31-pe'&&cl!=='rb31-crista')return;
      const zL=+((f.props||{}).COTA);
      if(!Number.isFinite(zL))return;
      const g=f.geom;
      if(!g||g.length<6)return;
      const zona=2.2*W+Math.abs(12/tan);
      const novo=g.map(p=>p.slice());
      const tocado=new Array(g.length).fill(false);
      for(let i=0;i<g.length;i++){
        const pr=projBordas(g[i]);
        if(!pr||pr.d>zona)continue;
        const dAlvo=Math.abs(zL-pr.z)/tan;
        if(!(dAlvo>0.2))continue;            /* na cota da pista: não mexe */
        if(Math.abs(pr.d-dAlvo)<0.6)continue; /* já está certo */
        if(pr.d<1e-6)continue;
        const ux=(g[i][0]-pr.q[0])/pr.d, uy=(g[i][1]-pr.q[1])/pr.d;
        novo[i]=[pr.q[0]+ux*dAlvo,pr.q[1]+uy*dAlvo,
          g[i][2]!==undefined?g[i][2]:undefined].filter(v=>v!==undefined);
        tocado[i]=true;
      }
      /* transição suave nas pontas da zona ajustada: sem criar degrau novo */
      const suav=(arr)=>{
        const out=arr.map(p=>p.slice());
        for(let i=1;i<arr.length-1;i++){
          if(tocado[i]===tocado[i-1]&&tocado[i]===tocado[i+1])continue;
          out[i][0]=(arr[i-1][0]+2*arr[i][0]+arr[i+1][0])/4;
          out[i][1]=(arr[i-1][1]+2*arr[i][1]+arr[i+1][1])/4;
        }
        return out;
      };
      let res=suav(novo);
      res=suav(res);
      /* FOLGA MÍNIMA: a suavização não pode reaproximar a linha da pista —
         ponto mais perto que o talude permite é empurrado de volta. */
      for(let i=0;i<res.length;i++){
        const pr=projBordas(res[i]);
        if(!pr||!Number.isFinite(pr.z)||pr.d>zona)continue;
        const dAlvo=Math.abs(zL-pr.z)/tan;
        if(!(dAlvo>0.2)||pr.d<1e-6)continue;
        if(pr.d<dAlvo-0.15){
          const ux=(res[i][0]-pr.q[0])/pr.d,uy=(res[i][1]-pr.q[1])/pr.d;
          res[i]=[pr.q[0]+ux*dAlvo,pr.q[1]+uy*dAlvo,
            res[i][2]!==undefined?res[i][2]:undefined].filter(v=>v!==undefined);
        }
      }
      /* fecho preservado */
      if(g.length>3&&Math.hypot(g[0][0]-g[g.length-1][0],g[0][1]-g[g.length-1][1])<1e-6)
        res[res.length-1]=res[0].slice();
      f.geom=res;
      if(Array.isArray(f.zg)&&f.zg.length!==res.length)
        f.zg=res.map(()=>zL);
    });
  }catch(e){}
}
/* PONTAS SEM RETORNO (24/08): a linha de crista/pé termina no canto da
   rampa — não deve voltar em "V" para encostar na pista do outro lado.
   Esse retorno era a "linha ligando a rampa entre crista e pé na berma".
   Poda só os primeiros/últimos segmentos que caminham CONTRA o rumo da
   linha; o restante do anel não é tocado. */
function rb31PontasSemRetorno(st){
  try{
    if(!st||!st.feats)return;
    const W=Math.abs(+((document.getElementById('rb31W')||{}).value)||10);
    const rumo=(g,i,j)=>{const dx=g[j][0]-g[i][0],dy=g[j][1]-g[i][1],
      n=Math.hypot(dx,dy)||1;return [dx/n,dy/n];};
    st.feats.forEach(f=>{
      const cl=(f.props||{}).CLASSE||'';
      if(cl!=='rb31-pe'&&cl!=='rb31-crista')return;
      let g=f.geom;
      if(!g||g.length<12)return;
      const fechada=Math.hypot(g[0][0]-g.at(-1)[0],g[0][1]-g.at(-1)[1])<0.5;
      if(fechada)return;                    /* anel fechado: nada a podar */
      /* início */
      let corte=0;
      const base=rumo(g,Math.min(4,g.length-1),Math.min(9,g.length-1));
      for(let i=0;i<Math.min(5,g.length-6);i++){
        const u=rumo(g,i,i+1);
        const seg=Math.hypot(g[i+1][0]-g[i][0],g[i+1][1]-g[i][1]);
        if(u[0]*base[0]+u[1]*base[1]<-0.2&&seg<1.4*W)corte=i+1;else break;
      }
      if(corte>0)g=g.slice(corte);
      /* fim */
      let corte2=0;
      const n2=g.length;
      const base2=rumo(g,Math.max(0,n2-10),Math.max(1,n2-5));
      for(let i=0;i<Math.min(5,n2-6);i++){
        const a=n2-1-i,b=n2-2-i;
        const u=rumo(g,b,a);
        const seg=Math.hypot(g[a][0]-g[b][0],g[a][1]-g[b][1]);
        if(u[0]*base2[0]+u[1]*base2[1]<-0.2&&seg<1.4*W)corte2=i+1;else break;
      }
      if(corte2>0)g=g.slice(0,g.length-corte2);
      if(g.length>=8&&g.length!==f.geom.length){
        f.geom=g;
        if(Array.isArray(f.zg)&&f.zg.length!==g.length){
          const z0=f.zg.find(z=>Number.isFinite(z));
          f.zg=g.map(()=>Number.isFinite(z0)?z0:0);
        }
      }
    });
  }catch(e){}
}
function rb31Desenha(st){
  try{rb31LinhasSeguemRampa(st);}catch(e){}
  try{rb31PontasSemRetorno(st);}catch(e){}
  try{rb31TiraDegraus(st);}catch(e){}
  /* REDE DE SEGURANÇA (24/08): nenhuma feição vai ao mapa com geometria
     aninhada ou ponto não finito — era o "Invalid LatLng (NaN,NaN)" que
     quebrava o desenho da 4ª bancada em diante. */
  try{
    (st&&st.feats||[]).forEach(f=>{
      let g=f.geom;
      if(Array.isArray(g)&&g.length&&Array.isArray(g[0])&&Array.isArray(g[0][0])&&!f.multi){
        let maior=g[0];
        for(const an of g)if(Array.isArray(an)&&an.length>maior.length)maior=an;
        g=maior;
      }
      if(Array.isArray(g)){
        const lim=g.filter(q=>Array.isArray(q)&&Number.isFinite(q[0])&&Number.isFinite(q[1]));
        if(lim.length!==g.length||g!==f.geom){
          f.geom=lim;
          if(Array.isArray(f.zg)&&f.zg.length!==lim.length){
            const z0=f.zg.find(z=>Number.isFinite(z));
            f.zg=lim.map(()=>Number.isFinite(z0)?z0:0);
          }
        }
      }
    });
  }catch(e){}
  /* nenhuma crista/pé atravessa a pista fora da zona da junta */
  try{rb31ClipAneisNoCorredor(st);}catch(e){}
  const fields=rb31Fields(),ativo=S.activeId;
  /* CAMADA ÚNICA de linhas: cristas, pés, bordas da pista e a linha de
     centro progressiva juntas, com os atributos (TIPO/CLASSE/BANCO/
     COTA/…) na tabela de atributos */
  st.lays=st.lays||{};
  /* migração: remove as camadas separadas antigas, se existirem */
  for(const k of ['cri','pe','ram','eixo']){
    const Lv=st.lays[k];
    if(Lv&&(S.layers||[]).includes(Lv))try{deleteVectorLayer(Lv);}catch(e){}
    delete st.lays[k];
  }
  /* a linha de centro acompanha automaticamente cada redesenho */
  if(st.eixoOn)st.eixoFeats=rb31CalcEixoFeats(st)||[];
  /* a INTERSEÇÃO cava × terreno também acompanha: recalculada a cada
     redesenho enquanto houver MDT escolhido e o checkbox ligado */
  const inter=rb31CalcInterFeats(st)||[];
  const feats=st.feats.concat(st.eixoOn&&st.eixoFeats?st.eixoFeats:[],inter);
  /* A linha dinâmica e as cristas/pés passam a compartilhar nós reais.
     Como st.feats entra por referência, o mesmo encaixe permanece no
     histórico da bancada e no DXF — não é apenas um efeito visual. */
  cavaSoldaIntersecaoAneis(feats,1e-7);
  let L=st.lays.uni;
  if(L&&!(S.layers||[]).includes(L))L=null;
  if(L){L.features=feats;L.fields=fields;drawLayer(L);
    /* MARCADORES ÓRFÃOS PÓS-REGENERAÇÃO: a camada única troca TODAS as
       feições a cada replay; quem estava editando uma crista/pé daqui
       ficava com marcadores presos à feição morta ("pontos de marcação
       depois de feito"). Religa pela mesma TIPO e reconstrói; durante um
       arraste ativo só religa a referência (o dragend reconstrói). */
    try{
      if(S._vtxCtx&&S._vtxCtx.L===L&&S.selFeat&&S.selFeat.layer===L){
        const tipoAnt=((S._vtxCtx.f&&S._vtxCtx.f.props)||{}).TIPO;
        const ni=L.features.findIndex(q=>(q.props||{}).TIPO===tipoAnt);
        if(ni>=0){
          S.selFeat.f=L.features[ni];S.selFeat.idx=ni;
          if(!S._vtxDragging){S._vtxSelPreserve=true;showVertices();}
        }else clearVertices();
      }
    }catch(e){}
  }
  else{
    L=addLayer({name:'Rampa por bancada',gtype:'line',
      crs:S.workCRS,features:feats,fields,color:'#c35d18'});
    st.lays.uni=L;
  }
  /* RECEITA GRAVADA NA CAMADA. O acompanhamento ao vivo dependia de S._rb31,
     que existe só enquanto o comando está aberto: saindo dele (ou reiniciando
     o app), arrastar o limite não regenerava mais nada. Com a receita na
     própria camada, editar o limite volta a refazer a pilha/cava em qualquer
     momento — que foi o que ele pediu. */
  if(L){
    const el=id=>document.getElementById(id),
      n=id=>parseFloat(String((el(id)||{}).value||'').replace(',','.')),
      cp=p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])?
        [+p[0],+p[1]]:null,
      cg=g=>Array.isArray(g)?g.map(cp).filter(Boolean):null;
    L._rb31Recipe={srcLayerId:st.srcLayerId,srcFeatIdx:st.srcFeatIdx,
      banco:st.banco,fase:st.fase,eixoOn:!!st.eixoOn,
      startP:cp(st.startP),
      z0:st.z0!=null?st.z0:(st.feats&&st.feats[0]&&+st.feats[0].props.COTA),
      par:{ang:n('rb31Ang'),H:n('rb31H'),B:n('rb31B'),W:n('rb31W'),
        grade:n('rb31G'),dir:(el('rb31Dir')||{}).value,
        mdt:(el('cavaMdtSel')||{}).value},
      hist:(st.hist||[]).map(h=>({startP:cp(h.startP),degrau:!!h.degrau,sem:!!h.sem})),
      rampas:Array.isArray(st.rampas)?st.rampas.map(r=>({nome:r.nome,banco:r.banco,
        ateBanco:r.ateBanco,ate:r.ate,startP:cp(r.startP)})):null,
      histAlvo:Array.isArray(st._histAlvo)?st._histAlvo.map(h=>({startP:cp(h.startP),
        degrau:!!h.degrau,sem:!!h.sem})):null,
      travaFora:st.travaFora,travaUp:st.travaUp,semRampa:!!st.semRampa,
      semRampaAte:+st.semRampaAte||0,
      /* Estado exato do ponto onde o operador parou. Sem ele a geometria
         reabria visível, mas o próximo banco não sabia qual crista, pé e
         par de chegada continuavam comandando a iteração. */
      runtime:{z:Number.isFinite(+st.z)?+st.z:null,
        zPe:Number.isFinite(+st.zPe)?+st.zPe:null,fora:!!st.fora,up:!!st.up,
        crista:cg(st.crista),pe:cg(st.pe),peNatural:cg(st.peNatural),
        peBerma:cg(st.peBerma),ultimaRampaA:cg(st.ultimaRampaA),
        ultimaRampaB:cg(st.ultimaRampaB),pFim:cp(st.pFim),pFimB:cp(st.pFimB),
        pFimDir:cp(st.pFimDir),proxIniA:cp(st.proxIniA),proxIniB:cp(st.proxIniB),
        paramBancos:Array.isArray(st.paramBancos)?st.paramBancos.map(q=>({...q})):[],
        eixos:Array.isArray(st.eixos)?st.eixos.map(cg).filter(Boolean):[]}};
  }
  /* simbologia por CLASSE: cada elemento com a sua cor e a interseção
     tracejada grossa, para não passar despercebida */
  if(L){
    cavaV02AplicaLinhas(L,'CLASSE');
    drawLayer(L);
  }
  /* o limite continua a camada ativa: os comandos de edição operam
     nele, não na camada derivada */
  if(st.srcLayerId!=null)S.activeId=st.srcLayerId;
  else if(ativo!=null)S.activeId=ativo;
  refreshUI();
  cavaAtualizaPreview();
}
/* INTERSEÇÃO cava × terreno da rampa por bancada: usa o MDT escolhido no
   painel da cava automática e a mesma superfície topológica por anéis. Some quando
   não há MDT ou quando "Mostrar a linha de interseção dinâmica" está
   desmarcado — nunca derruba o desenho por falta de raster. */
/* ATERRO EXTERNO ATÉ O TERRENO
   Regra do usuário: a linha de PÉ de um PDE nasce ABAIXO da cota mais baixa
   do terreno, para nunca "voar". Quando ele arrasta o limite e um trecho fica
   ACIMA do terreno, o projeto tem de continuar por FORA e para BAIXO — em
   bancadas de verdade, com o mesmo talude, altura e berma do painel — até
   cruzar o terreno. Numa cava é o mesmo com o sinal trocado: por fora e para
   CIMA, cortando. Assim a interseção deixa de sair em cacos: ela cai na
   última bancada.
   Sem teto de bancadas (pedido dele). A parada é GEOMÉTRICA: encerra quando
   o anel inteiro já passou do terreno, quando o anel deixa de ser gerável,
   ou quando a cota para de andar. */
function rb31GradeMDT(){
  const sel=document.getElementById('cavaMdtSel'),
    R=(S.rasters||[]).find(x=>String(x.id)===String(sel&&sel.value))||
      ((S.rasters||[]).length===1?S.rasters[0]:null);
  return R&&R.d||null;
}
/* Quanto o anel ainda está NO AR (pilha) ou ENTERRADO (cava) — 0 = já
   encostou no terreno em toda a volta.
   ATENÇÃO ao sinal, que eu já errei uma vez aqui: numa PILHA o que pede
   mais aterro é o trecho com terreno ABAIXO do anel (o anel voando), e
   NÃO o trecho enterrado — descer ali só afunda mais, e o laço não para
   nunca (medido: 27 bancadas e 324 m de desnível no caso real, quando o
   certo era não aterrar nada). */
function rb31FaltaTerreno(ring,z,g,pilha){
  let falta=0,n=0;
  for(const p of ring){
    const t=sampleZbil(g,p[0],p[1]);
    if(!Number.isFinite(t))continue;
    n++;
    const d=pilha?(z-t):(t-z);   // pilha: anel acima do terreno = falta aterro
    if(d>falta)falta=d;
  }
  return n?falta:0;
}
/* TRAVA DE MITRA. Afastar PARA FORA num contorno com reentrâncias faz a
   quina projetar uma agulha: medido no limite real dele, com afastamento de
   projeto de 4,02 m saíram vértices a 32,2 m do anel de origem — 8 vezes o
   previsto. São exatamente os picos que ele viu no mapa. Aqui todo vértice
   que passa do previsto é trazido de volta para a distância de projeto, na
   direção dele mesmo: a quina fica chanfrada em vez de virar espinho, e
   nenhuma parte do anel encolhe abaixo do afastamento pedido. */
function cavaLimitaMitra(nova,base,dist,fator){
  if(!nova||!base||!(dist>0))return nova;
  const lim=dist*(fator||1.2);
  return nova.map(p=>{
    const d=cavaDistAoAnel(p,base);
    if(!Number.isFinite(d)||d<=lim)return p;
    /* ponto mais próximo no anel de origem, para saber a direção */
    let q=null,bd=Infinity;
    for(let i=0;i<base.length;i++){
      const a=base[i],b=base[(i+1)%base.length],dx=b[0]-a[0],dy=b[1]-a[1],
        qq=dx*dx+dy*dy,
        t=Math.max(0,Math.min(1,qq?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/qq:0)),
        x=a[0]+dx*t,y=a[1]+dy*t,dd=(p[0]-x)**2+(p[1]-y)**2;
      if(dd<bd){bd=dd;q=[x,y];}
    }
    if(!q)return p;
    const L=Math.hypot(p[0]-q[0],p[1]-q[1])||1;
    return [q[0]+(p[0]-q[0])/L*dist, q[1]+(p[1]-q[1])/L*dist];
  });
}
function rb31Aterrar(sil){
  const st=rb31Estado(),el=id=>document.getElementById(id);
  if(!st.crista&&!rb31LeLimite(st))return false;
  const g=rb31GradeMDT();
  if(!g){ if(!sil)toast('Escolha o MDT no painel da cava'); return false; }
  /* IDEMPOTENTE: roda a cada bancada, então limpa o aterro anterior antes de
     refazer — senão as bancadas externas se acumulariam a cada iteração. */
  st.feats=(st.feats||[]).filter(f=>!/^Aterro externo/.test(f.props&&f.props.TIPO||''));
  const ang=+el('rb31Ang').value,H=+el('rb31H').value,B=+el('rb31B').value;
  if(!(ang>0&&ang<90&&H>0&&B>0)){toast('Revise talude, altura e berma');return false;}
  /* o sentido do aterro é o OPOSTO do corpo: por fora, indo ao encontro do
     terreno — para baixo na pilha, para cima na cava */
  /* SENTIDO LIDO DA GEOMETRIA JÁ GERADA, não do seletor do painel.
     Aqui já me queimei duas vezes: o corpo do projeto é construído pelo
     gerador da Rampa por bancada, que não obedece ao #cavaSentido — dá para
     ter os anéis SUBINDO para dentro (pilha) com o seletor marcado em
     "Down · descer". Quando eu lia o seletor, a extensão externa saía
     CORTANDO por fora numa pilha, e a interseção aparecia como uma linha
     contornando todo o limite por fora (foi exatamente o que ele viu).
     Os próprios anéis dizem a verdade: se as bancadas geradas estão ACIMA
     da cota do limite, o projeto sobe para dentro — é pilha. */
  let up=(document.getElementById('cavaSentido')||{}).value==='up';
  {
    let alta=null;
    (st.feats||[]).forEach(f=>{
      const c=f.props&&+f.props.COTA;
      if(!Number.isFinite(c)||/^Aterro externo/.test(f.props.TIPO||''))return;
      if(alta===null||Math.abs(c-(+st.z))>Math.abs(alta-(+st.z)))alta=c;
    });
    if(alta!==null&&Math.abs(alta-(+st.z))>1e-6)up=(alta>+st.z);
  }
  const desce=up;                   // pilha sobe por dentro → aterra descendo
  const opt={ang,H,W:Math.max(1,+el('rb31W').value||10),
    grade:Math.max(0.5,+el('rb31G').value||10),dir:el('rb31Dir').value,
    fora:true,up:!desce};
  /* parte do LIMITE (o pé) e da cota dele */
  let ring=st.crista.map(p=>p.slice()),z=+st.z;
  const zIni=z;
  const pilha=desce;                       // pilha aterra descendo por fora
  const falta0=rb31FaltaTerreno(ring,z,g,pilha);
  if(falta0<=0.01){
    if(!sil){
      const msg=pilha
        ?'O pé já está abaixo do terreno em toda a volta — nada a aterrar (é a condição correta do PDE)'
        :'A crista já está acima do terreno em toda a volta — nada a cortar';
      const i0=el('rb31Info');if(i0)i0.textContent=msg;
      toast(msg);
    }
    rb31Desenha(st);
    return false;
  }
  const antes=(st.feats||[]).length;
  let n=0,aviso='';
  st.feats=st.feats||[];
  while(rb31FaltaTerreno(ring,z,g,pilha)>0.01){
    const bc=rb31Bancada(ring,z,opt);
    if(!bc||!bc.peEntregue){aviso=bc&&bc.warn||'o anel deixou de comportar a bancada';break;}
    const zPe=z+(desce?-H:H);
    /* trava de mitra + limpeza de laço antes de virar feição */
    const run=H/Math.tan(ang*Math.PI/180);
    let anelPe=cavaLimitaMitra(bc.peEntregue,ring,run,1.2);
    try{ anelPe=rb31LimpaSaida(anelPe); }catch(e){}
    const gPe=rb31Fecha(anelPe);
    st.feats.push({geom:gPe,multi:false,zg:gPe.map(()=>zPe),
      props:{TIPO:'Aterro externo — pé '+(n+1),BANCO:-(n+1),COTA:+zPe.toFixed(3),
        ALTURA:H,BERMA:null,ANGULO:ang,CLASSE:'rb31-pe'}});
    const bm=rb31Berma(anelPe,B,true);
    if(!bm.ring){aviso=bm.warn||'a berma externa não pôde ser gerada';z=zPe;ring=anelPe;n++;break;}
    let anelBm=cavaLimitaMitra(bm.ring,anelPe,B,1.2);
    try{ anelBm=rb31LimpaSaida(anelBm); }catch(e){}
    const gBm=rb31Fecha(anelBm);
    st.feats.push({geom:gBm,multi:false,zg:gBm.map(()=>zPe),
      props:{TIPO:'Aterro externo — berma '+(n+1),BANCO:-(n+1),COTA:+zPe.toFixed(3),
        ALTURA:null,BERMA:B,ANGULO:null,CLASSE:'rb31-crista'}});
    ring=anelBm;z=zPe;n++;
    if(n>400){aviso='parada de segurança em 400 bancadas';break;}   // laço, não teto de projeto
  }
  rb31Desenha(st);
  const desnivel=Math.abs(z-zIni);
  const msg=n?((pilha?'Aterro':'Corte')+' por fora: '+n+' bancada(s), '+desnivel.toFixed(1)+
      ' m de desnível, até a cota '+z.toFixed(2)+(aviso?' — parou porque '+aviso:''))
    :('Não foi possível '+(pilha?'aterrar':'cortar')+' por fora: '+
      (aviso||'a primeira bancada externa não pôde ser gerada'));
  if(!sil){const info=el('rb31Info');if(info)info.textContent=msg;toast(msg);}
  try{ cmdLog(msg, n?'ok':'avisa'); }catch(e){}
  return n>0;
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
/* feições da linha de centro (cálculo puro; trechos separados quando a
   bancada nasce "em outro ponto") */
function rb31CalcEixoFeats(st){
  if(!st.eixos||!st.eixos.length)return null;
  const partes=[];let atual=[];
  for(let k=0;k<st.eixos.length;k++){
    const e=st.eixos[k],h=(st.hist&&st.hist[k])||{};
    const conectada=k>0&&h.degrau;
    if(k===0||conectada)atual.push(...e.map(p=>p.slice()));
    else{if(atual.length)partes.push(atual);atual=e.map(p=>p.slice());}
  }
  if(atual.length)partes.push(atual);
  return partes.map((g,i)=>({
    geom:g.map(p=>[p[0],p[1]]),multi:false,zg:g.map(p=>p[2]),
    props:{TIPO:'Linha de centro progressiva'+(partes.length>1?' — trecho '+(i+1):''),
      BANCO:null,COTA:null,ALTURA:null,BERMA:null,ANGULO:null,CLASSE:'rb31-eixo'}}));
}
/* cota do limite no ponto P: vértice mais próximo do desenho; um
   desenho plano em 0 sem cota real cai para a COTA_SUP gravada ou a
   cota calculada pelo MDT no painel da cava (cavaZ0) */
function rb31CotaDoPonto(item,P){
  const g=(item&&item.f&&item.f.geom)||[],zg=(item&&item.f&&item.f.zg)||[];
  let zc=null;
  if(P&&g.length){
    let bi=-1,bd=Infinity;
    for(let i=0;i<g.length;i++){
      if(!Array.isArray(g[i])||typeof g[i][0]!=='number')continue;
      const d=(g[i][0]-P[0])**2+(g[i][1]-P[1])**2;
      if(d<bd){bd=d;bi=i;}
    }
    if(bi>=0&&Number.isFinite(+zg[bi]))zc=+zg[bi];
  }
  const sup=item&&item.f&&item.f.props&&+item.f.props.COTA_SUP,
    painel=parseFloat(String((document.getElementById('cavaZ0')||{}).value||'').replace(',','.'));
  if((zc===null||zc===0)&&Number.isFinite(sup)&&sup!==0)zc=sup;
  if((zc===null||zc===0)&&Number.isFinite(painel)&&painel!==0)zc=painel;
  if(zc===null){
    const zs=zg.filter(Number.isFinite);
    zc=zs.length?zs.reduce((x,y)=>x+y,0)/zs.length:0;
  }
  return zc;
}

/* Civil: cálculo e estado em modules/civil/roads.js. */
/* ============================================================
   AUTOCORREÇÃO DE LINHAS CRUZADAS
   Em cantos muito fechados do limite, o offset da bancada e a pista
   se cruzam (bico invertido). O programa detecta o cruzamento real
   (interseção própria de segmentos, ignorando toques em vértice, que
   são legítimos nas juntas) e CORRIGE MOVENDO A CRISTA: chanfra o
   bico local, cada vez mais fundo, até o cruzamento sumir.
   ============================================================ */
function rb31SegCruza(a,b,c,d){
  const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],
    den=rx*sy-ry*sx;
  if(Math.abs(den)<1e-12)return null;         /* paralelos/colineares */
  const qx=c[0]-a[0],qy=c[1]-a[1],
    t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den,e=1e-6;
  /* cruzamento PRÓPRIO: dentro dos dois segmentos. Toque em ponta
     (t ou u em 0/1) é a junta seca/soleira e não conta. */
  if(t<=e||t>=1-e||u<=e||u>=1-e)return null;
  return [a[0]+rx*t,a[1]+ry*t];
}
function rb31CruzaLinhas(A,B){
  const out=[];
  if(!A||!B||A.length<2||B.length<2)return out;
  for(let i=0;i<A.length-1;i++)
    for(let j=0;j<B.length-1;j++){
      const p=rb31SegCruza(A[i],A[i+1],B[j],B[j+1]);
      if(p)out.push(p);
    }
  return out;
}
function rb31AutoCruza(A){
  const out=[];
  if(!A||A.length<4)return out;
  for(let i=0;i<A.length-1;i++)
    for(let j=i+2;j<A.length-1;j++){
      if(i===0&&j===A.length-2)continue;      /* fecho do anel */
      const p=rb31SegCruza(A[i],A[i+1],A[j],A[j+1]);
      if(p)out.push(p);
    }
  return out;
}
/* linhas já desenhadas dos bancos ANTERIORES (a bancada nova não pode
   cruzar nem elas) — o eixo e a interseção ficam de fora */
function rb31LinhasAnteriores(st){
  if(!st||!st.feats)return [];
  /* Tudo o que já está desenhado, MENOS a própria linha de partida
     (pé na subida; crista na descida), que é conferida à parte. */
  const classePartida=rb31ClassePartida(st);
  return st.feats.filter(f=>f.props&&
    (f.props.CLASSE==='rb31-crista'||f.props.CLASSE==='rb31-pe'||
     f.props.CLASSE==='rb31-rampa')&&
    !(f.props.CLASSE===classePartida&&+f.props.BANCO===+st.banco))
    .map(f=>f.geom.map(p=>[p[0],p[1]]));
}
/* todos os cruzamentos de uma bancada recém-calculada contra a crista
   que a gerou, entre as próprias linhas dela e contra o que já existe */
function rb31CruzamentosDaBancada(crista,r,anteriores){
  const C=rb31Fecha(crista),pts=[];
  for(const ln of [r.bordaA,r.bordaB,r.peEntregue]){
    if(!ln)continue;
    pts.push(...rb31CruzaLinhas(C,ln.map(p=>[p[0],p[1]])));
  }
  const pe=(r.peEntregue||[]).map(p=>[p[0],p[1]]);
  pts.push(...rb31AutoCruza(rb31Fecha(pe)));
  if(r.bordaA)pts.push(...rb31CruzaLinhas(pe,r.bordaA.map(p=>[p[0],p[1]])));
  if(r.bordaB)pts.push(...rb31CruzaLinhas(pe,r.bordaB.map(p=>[p[0],p[1]])));
  if(r.bordaA&&r.bordaB)pts.push(...rb31CruzaLinhas(
    r.bordaA.map(p=>[p[0],p[1]]),r.bordaB.map(p=>[p[0],p[1]])));
  /* contra os bancos já desenhados */
  if(anteriores&&anteriores.length){
    const novas=[C,pe];
    if(r.bordaA)novas.push(r.bordaA.map(p=>[p[0],p[1]]));
    if(r.bordaB)novas.push(r.bordaB.map(p=>[p[0],p[1]]));
    for(const velha of anteriores)
      for(const nova of novas)pts.push(...rb31CruzaLinhas(velha,nova));
  }
  return pts;
}
/* chanfra os bicos do anel que estão perto dos pontos de cruzamento:
   o vértice agudo é substituído por dois, recuados `corte` ao longo
   das duas arestas vizinhas — o bico deixa de existir e o offset para
   de se dobrar sobre si mesmo. */
function rb31ChanfraBicos(ring,pts,corte,raio,limiarGrau){
  if(!ring||ring.length<3||!pts||!pts.length)return null;
  const n=ring.length,out=[],lim=Math.cos(Math.PI*(180-(limiarGrau||70))/180);
  let mexeu=0;
  for(let i=0;i<n;i++){
    const a=ring[(i-1+n)%n],v=ring[i],b=ring[(i+1)%n],
      u1x=v[0]-a[0],u1y=v[1]-a[1],u2x=b[0]-v[0],u2y=b[1]-v[1],
      l1=Math.hypot(u1x,u1y)||1e-12,l2=Math.hypot(u2x,u2y)||1e-12,
      cos=(u1x*u2x+u1y*u2y)/(l1*l2);
    const agudo=cos<lim;                     /* deflexão grande = bico */
    const perto=pts.some(p=>Math.hypot(p[0]-v[0],p[1]-v[1])<=raio);
    if(agudo&&perto){
      const d=Math.min(corte,l1*0.45,l2*0.45);
      if(d>1e-3){
        out.push([v[0]-u1x/l1*d,v[1]-u1y/l1*d]);
        out.push([v[0]+u2x/l2*d,v[1]+u2y/l2*d]);
        mexeu++;
        continue;
      }
    }
    out.push(v.slice());
  }
  return mexeu?out:null;
}
/* Substitui a linha de partida desenhada (pé na subida, crista na descida). */
function rb31AtualizaCristaDesenhada(st,ring){
  const classe=rb31ClassePartida(st);
  const alvo=(st.feats||[]).filter(f=>f.props&&f.props.CLASSE===classe&&
    +f.props.BANCO===+st.banco).pop();
  if(!alvo)return;
  const g=rb31Fecha(ring),z=+alvo.props.COTA||0;
  alvo.geom=g;alvo.zg=g.map(()=>z);
}
/* GERAÇÃO IMUTÁVEL (v81): a crista/linha pós-offset é dado de projeto e
   NUNCA pode ser chanfrada para acomodar uma rampa. A rampa se encaixa na
   quebra já existente; se houver cruzamento, ele é apenas diagnosticado.
   Devolve sempre a mesma referência/mesmos vértices recebidos em `crista`. */
function rb31GeraSemCruzar(crista,z,opt,W,anteriores){
  /* a ZONA DO DEGRAU é atravessada por projeto: a cauda da rampa anterior
     cruza a berma reta para entregar a soleira da próxima bancada. Um
     cruzamento ali não é "cava fechou" nem bico para chanfrar — contá-lo
     recusava bancada válida (visto no projeto Massari, banco 4). */
  const zonasDeg=[];
  if(opt&&opt.startP)zonasDeg.push(opt.startP);
  if(opt&&Array.isArray(opt.zonasDeg))opt.zonasDeg.forEach(z2=>{if(z2)zonasDeg.push(z2);});
  const rDeg=4.5*Math.max(1,Math.abs(W)||10),
    foraDeg=pt=>!zonasDeg.some(z2=>Math.hypot(pt[0]-z2[0],pt[1]-z2[1])<=rDeg);
  const conta=(cr,rr)=>{
    const proprio=rb31CruzamentosDaBancada(cr,rr,null).filter(foraDeg),
      todos=rb31CruzamentosDaBancada(cr,rr,anteriores).filter(foraDeg);
    return {pts:todos,proprio:proprio.length,ant:todos.length-proprio.length};
  };
  let r=rb31Bancada(crista,z,opt);
  if(!r||!r.peEntregue)return {r,crista,corrigido:0,restou:-1,ant:0,pts:[]};
  let c0=conta(crista,r),pts=c0.pts;
  /* CONTRATO: nenhuma tentativa posterior tem autorização para alterar o
     anel. A antiga autocorreção por chanfros foi a origem dos degraus
     circulados pelo usuário. */
  return {r,crista,corrigido:0,restou:pts.length,ant:c0.ant,pts};
}
/* LIMITE DINÂMICO — camada própria, em COTA ÚNICA, que serve de fonte para
   os ajustes paramétricos.
   Por quê: o polígono escolhido costuma vir do cliente, de shapefile ou de um
   estudo de alternativas, e arrastar vértices nele contamina o original. Além
   disso ele pode chegar com Z por vértice (drapejado, vindo de DXF ou 3D), e
   o projeto exige COTA ÚNICA para a interseção fechar. A cópia nasce achatada
   na cota adotada e é o que o usuário arrasta daqui em diante. */
/* Douglas-Peucker com desvio máximo `tol`: o limite dinâmico deve ter
   SÓ os vértices verdadeiros. Anéis vindos de produtos reamostrados
   (bordas de rampa a ~0,5 m, anéis cortados pelo MDT) viravam limites
   com centenas de vértices uniformes — a edição mostrava um colar de
   bolinhas em vez dos cantos. 15 cm não muda a forma de nada. */
function cavaDecimaVertices(pts,tol){
  if(!pts||pts.length<4)return pts;
  tol=tol||0.15;
  const keep=new Uint8Array(pts.length);keep[0]=keep[pts.length-1]=1;
  const pilha=[[0,pts.length-1]];
  while(pilha.length){
    const par=pilha.pop(),i0=par[0],i1=par[1];
    if(i1-i0<2)continue;
    const A=pts[i0],B=pts[i1],dx=B[0]-A[0],dy=B[1]-A[1],den=dx*dx+dy*dy;
    let bi=-1,bd=tol;
    for(let i=i0+1;i<i1;i++){
      let d;
      if(den<1e-12)d=Math.hypot(pts[i][0]-A[0],pts[i][1]-A[1]);
      else{
        let t=((pts[i][0]-A[0])*dx+(pts[i][1]-A[1])*dy)/den;
        t=Math.max(0,Math.min(1,t));
        d=Math.hypot(A[0]+t*dx-pts[i][0],A[1]+t*dy-pts[i][1]);
      }
      if(d>bd){bd=d;bi=i;}
    }
    if(bi>=0){keep[bi]=1;pilha.push([i0,bi],[bi,i1]);}
  }
  return pts.filter((_,i)=>keep[i]);
}
function cavaReferenciaDoLimite(item){
  if(!item||!item.L)return item;
  if(!item.L._cavaLimiteDin)return item;
  const L=(S.layers||[]).find(x=>String(x.id)===String(item.L._cavaLimiteOrig)),
    i=+(item.L._cavaLimiteOrigFeat||0),f=L&&L.features&&L.features[i];
  return L&&f?{L,f,i}:item;
}
function cavaNomeLimiteParametrico(item){
  const el=document.getElementById('rb31NomeLim'),atual=(el&&el.value||'').trim();
  if(atual)return atual.slice(0,60);
  const base=String(item?.L?.name||'Nova cava').replace(/\s*[—-]\s*limite paramétrico\s*$/i,'').trim();
  return `${base||'Nova cava'} — limite paramétrico`.slice(0,60);
}
function cavaEstilizaLimiteParametrico(L,up){
  if(!L)return L;
  const classe=up?'rb31-pe':'rb31-crista',tipo=up?'Limite paramétrico — pé':'Limite paramétrico — crista';
  L.color='#111111';L.weight=1.5;L.fill=0;L._cavaTipoInicial=up?'pe':'crista';
  L.sym={...(L.sym||{}),mode:'single',color:'#111111',stroke:'#111111',
    weight:1.5,fill:0,dash:up?'6 4':'',field:'',classes:[],cats:[]};
  if(!(L.fields||[]).some(x=>x.name==='CLASSE'))(L.fields=L.fields||[]).push({name:'CLASSE',type:'C',length:20,decimal:0});
  for(const f of (L.features||[])){f.props=f.props||{};f.props.TIPO=tipo;f.props.CLASSE=classe;}
  return L;
}
function cavaLimiteDinamico(item,z,opt={}){
  if(!item||!item.L)return null;
  const subida=typeof rb31EhSubida==='function'?rb31EhSubida(S._rb31):
    document.getElementById('cavaSentido')?.value==='up';
  if(item.L._cavaLimiteDin&&!opt.forceNew){
    cavaEstilizaLimiteParametrico(item.L,subida);try{drawLayer(item.L);}catch(e){}
    return item;
  }
  item=cavaReferenciaDoLimite(item);
  if(!item||!item.L||item.L._cavaLimiteDin)return null;
  const ring=cavaLimpaRing(cavaRingWork(item));
  if(!ring||ring.length<3)return null;
  let fech=ring.map(p=>[p[0],p[1]]);
  if(Math.hypot(fech[0][0]-fech.at(-1)[0],fech[0][1]-fech.at(-1)[1])>1e-9)fech.push(fech[0].slice());
  const nomeEl=document.getElementById('rb31NomeLim');
  const zz=Number.isFinite(+z)?+z:0,
    nome=String(opt.name||cavaNomeLimiteParametrico(item)).trim().slice(0,60),
    corLimite='#111111';
  let L=opt.forceNew?null:(S.layers||[]).filter(x=>x._cavaLimiteDin&&
    String(x._cavaLimiteOrig)===String(item.L.id)&&
    (x._cavaLimiteOrigFeat==null||+x._cavaLimiteOrigFeat===+(item.i||0))).at(-1);
  /* Uma cópia existente pode já ter recebido suavização manual antes da
     rampa. Ela é a verdade paramétrica e jamais volta a ser achatada pela
     referência original. */
  if(L&&L.features&&L.features[0])return {L,f:L.features[0],i:0};
  /* LINHA FECHADA, não polígono: um polígono transparente do tamanho do
     projeto capturava todo clique do mapa no interior (só se conseguia
     selecionar o limite). Linha fechada tem o mesmo papel geométrico no
     pipeline (cavaRingWork/seletor aceitam) e só o traço é clicável. */
  const refId=cavaIdFonte(item,true),feat={geom:fech,multi:false,zg:fech.map(()=>zz),
    props:{FID:1,NOME:nome,COTA:+zz.toFixed(3),ORIGEM:item.L.name,
      TIPO:subida?'Limite paramétrico — pé':'Limite paramétrico — crista',
      CLASSE:subida?'rb31-pe':'rb31-crista',REFERENCIA:refId||String(item.L.id)}};
  feat._cavaReferenceId=refId||null;
  if(L){ L.features=[feat]; L.name=nome;L.color=corLimite; }
  else{
    L=addLayer({sourceLayer:item.L,name:nome,gtype:'line',crs:item.L.crs||S.workCRS,features:[feat],
      fields:[{name:'FID',type:'N',length:9,decimal:0},
              {name:'NOME',type:'C',length:60,decimal:0},
              {name:'COTA',type:'N',length:12,decimal:3},
              {name:'ORIGEM',type:'C',length:60,decimal:0},
              {name:'TIPO',type:'C',length:30,decimal:0},
              {name:'CLASSE',type:'C',length:20,decimal:0},
              {name:'REFERENCIA',type:'C',length:60,decimal:0}],
      color:corLimite});
    L._cavaLimiteDin=true;L._cavaLimiteOrig=item.L.id;
    L._cavaLimiteOrigFeat=+(item.i||0); /* continuação: cada anel de origem
      pode gerar o seu próprio alteamento */
    L._cavaReferenceId=refId||null;L._cavaParametricIcon='◈';
    L.weight=1;L.fill=0;
  }
  /* A referência nunca é alterada nem escondida: ela permanece disponível
     para conferir os vértices e comparar com a linha de interseção. */
  item.L._cavaReferencia=true;item.L.visible=true;
  cavaEstilizaLimiteParametrico(L,subida);
  try{drawLayer(item.L);drawLayer(L);refreshUI();}catch(e){}
  if(nomeEl)nomeEl.value=nome;
  return {L,f:L.features[0],i:0};
}
function cavaCriarLimiteParametrico(){
  /* O botão usa primeiro o ◈ selecionado na árvore/mapa. Assim a opção
     genérica ainda exibida no select não impede a escolha da camada DCE. */
  const sf=S.selFeat,selecionado=sf&&sf.layer&&sf.layer._cavaLimiteDin&&
    sf.layer.features&&sf.layer.features[sf.idx]?
      {L:sf.layer,f:sf.layer.features[sf.idx],i:sf.idx}:null,
    bruto=selecionado||cavaItemSelecionado();
  /* Uma camada ◈ já é o limite paramétrico de trabalho. Quando o usuário a
     escolhe novamente, reutiliza exatamente a mesma geometria como origem
     de uma NOVA sequência de cristas/pés; não cria cópia da cópia. */
  if(bruto&&bruto.L&&bruto.L._cavaLimiteDin){
    S._rb31=null;S._cavaProjectId=null;
    S._rb31NovoDoLimiteId=bruto.L.id;
    S.activeId=bruto.L.id;
    S.selFeat={layer:bruto.L,layerId:bruto.L.id,idx:bruto.i};
    try{
      const ne=document.getElementById('rb31NomeLim'),
        info=document.getElementById('cavaLimiteParamInfo'),
        botao=document.getElementById('btnCavaCriarLimiteParam');
      if(ne)ne.value=bruto.L.name||'';
      if(info)info.innerHTML=`◈ <b>${esc(bruto.L.name||'Limite paramétrico')}</b> será reutilizado diretamente como novo limite. Nenhuma camada foi criada.`;
      if(botao){botao.textContent='◈ Usar como novo limite';
        botao.title='Reutiliza esta camada paramétrica sem duplicá-la';}
      if(typeof rb31LimpaMarcaInicio==='function')rb31LimpaMarcaInicio();
      refreshCavaMineracao();
      const sel=document.getElementById('cavaBaseSel'),v=`${bruto.L.id}:${bruto.i}`;
      if(sel&&[...sel.options].some(o=>o.value===v))sel.value=v;
      refreshUI();setTool('select');
    }catch(e){console.warn('reutilização do limite paramétrico',e);}
    toast(`◈ "${bruto.L.name||'Limite paramétrico'}" selecionado como novo limite; nenhuma camada foi duplicada`);
    return bruto;
  }
  const ref=cavaReferenciaDoLimite(cavaFonteOriginal(bruto));
  if(!ref||!ref.L||!ref.f){toast('Escolha primeiro o limite inicial de referência');return null;}
  const nomeEl=document.getElementById('rb31NomeLim'),digitado=(nomeEl&&nomeEl.value||'').trim();
  if(!digitado){
    if(nomeEl){nomeEl.value=cavaNomeLimiteParametrico(ref);nomeEl.focus();nomeEl.select();}
    toast('Confirme ou altere o nome do novo limite paramétrico e clique novamente');return null;
  }
  if((S.layers||[]).some(x=>x!==bruto?.L&&String(x.name||'').trim().toLowerCase()===digitado.toLowerCase())){
    toast(`Já existe uma camada chamada "${digitado}". Escolha outro nome.`);nomeEl?.focus();return null;
  }
  const zEls=['rb31Z0','cavaZ0'];let z=NaN;
  for(const id of zEls){const e=document.getElementById(id),v=parseFloat(String(e&&e.value||'').replace(',','.'));if(Number.isFinite(v)){z=v;break;}}
  if(!Number.isFinite(z))z=+(ref.f.props?.COTA_SUP??ref.f.props?.COTA??0);
  const din=cavaLimiteDinamico(ref,z,{forceNew:true,name:digitado});
  if(!din)return null;
  /* Novo limite = novo projeto. Os resultados existentes não são apagados,
     mas deixam de ser o estado ativo desta nova mina. */
  S._rb31=null;S._cavaProjectId=null;S.activeId=din.L.id;
  S.selFeat={layer:din.L,layerId:din.L.id,idx:0};
  try{
    refreshCavaMineracao();const s=document.getElementById('cavaBaseSel'),v=`${din.L.id}:0`;
    if(s&&[...s.options].some(o=>o.value===v))s.value=v;
    const info=document.getElementById('cavaLimiteParamInfo');
    if(info)info.innerHTML=`◈ <b>${esc(din.L.name)}</b> criado. A referência <b>${esc(ref.L.name)}</b> foi preservada.`;
    refreshUI();setTool('vertex');showVertices();
  }catch(e){console.warn('criação do limite paramétrico',e);}
  toast(`◈ Limite paramétrico "${digitado}" criado; a referência original foi preservada`);
  return din;
}
function rb31LeLimite(st){
  /* REPLAY/receita: o estado sabe qual é o limite (srcLayerId). Depender
     do select do painel quebrava o vínculo dinâmico ao reabrir o projeto:
     o select vinha vazio, o replay falhava no banco 1 e a pilha parava de
     acompanhar o limite. A UI só decide quando o estado ainda não sabe. */
  let item=null;
  if(st&&st.srcLayerId!=null){
    const Ls=(S.layers||[]).find(x=>String(x.id)===String(st.srcLayerId));
    const fi=st.srcFeatIdx||0;
    if(Ls&&Ls.features&&Ls.features[fi])item={L:Ls,f:Ls.features[fi],i:fi};
  }
  if(!item){
    const bruto=cavaItemSelecionado();
    /* CONTINUAÇÃO (alteamento): o usuário escolheu um ANEL específico de
       uma pilha já gerada — esse anel é a fonte, literalmente. O resolvedor
       de fonte original redirecionava para o limite antigo da pilha e a
       bancada nascia na cota errada, sobre a base. */
    if(bruto&&bruto.L&&(bruto.L._cavaLimiteDin||bruto.L._rb31Recipe))item=bruto;
    else item=cavaFonteOriginal(bruto);
  }
  if(!item){toast('Selecione um polígono ou linha fechada como limite');return false;}
  /* daqui em diante quem manda é a cópia dinâmica, em cota única */
  {
    const elz=document.getElementById('rb31Z0');
    let z0=parseFloat(String(elz&&elz.value||'').replace(',','.'));
    if(!Number.isFinite(z0)){try{z0=rb31CotaDoPonto(item,st.startP||null);}catch(e){}}
    const din=cavaLimiteDinamico(item,z0);
    if(din){
      item=din;
      const sel=document.getElementById('cavaBaseSel');
      if(sel){
        refreshCavaMineracao();
        const v=din.L.id+':0';
        if([...sel.options].some(o=>o.value===v))sel.value=v;
      }
    }
  }
  const ring=cavaLimpaRing(cavaRingWork(item));
  if(!ring||ring.length<3){toast('O limite selecionado é inválido');return false;}
  st.crista=ring;
  const el=document.getElementById('rb31Z0');
  let z=parseFloat(String(el&&el.value||'').replace(',','.'));
  if(!Number.isFinite(z)){
    z=rb31CotaDoPonto(item,st.startP||null);
    if(el)el.value=+z.toFixed(2);
  }
  /* o desenho do limite passa a carregar a cota (como o gerador da
     cava faz) — nada de saída na cota zero. Só grava se mudou: gravar
     redesenha a camada do limite, o que derrubaria os marcadores de
     vértice durante a edição dinâmica. */
  if(Number.isFinite(z)&&z!==0&&
     (!item.f.props||+item.f.props.COTA_SUP!==+(+z).toFixed(3)*1))
    try{cavaGravaCotaLimite(item,z);}catch(e){}
  /* LIMITE NOVO = PROJETO NOVO. st.feats acumula bancada após bancada; sem
     esta limpeza, escolher outro limite empilhava a cava nova sobre os restos
     da anterior — cristas e pés de outra geometria na mesma camada. A camada
     antiga não é apagada: ela se desliga do estado e fica como produto
     concluído, e a nova nasce limpa. */
  if(st.srcLayerId!=null &&
     (String(st.srcLayerId)!==String(item.L.id)||+st.srcFeatIdx!==+item.i)){
    st.feats=[];st.banco=0;st.fase='crista';st.pe=null;st.pFim=null;st.zPe=null;
    st.eixos=[];st.eixoFeats=null;st.hist=[];st.paramBancos=[];
    st.novoInicioP=null;st.startP=null;st.undoPilha=[];
    st.lays=null;                       // a próxima geração cria camada nova
    try{ if(S._cavaRampStart)S._cavaRampStart=null; }catch(e){}
    try{ cmdLog('limite trocado: projeto reiniciado do zero','info'); }catch(e){}
  }
  st.srcLayerId=item.L.id;st.srcFeatIdx=item.i;
  if(S._rb31NovoDoLimiteId&&String(S._rb31NovoDoLimiteId)===String(item.L.id))
    S._rb31NovoDoLimiteId=null;
  st.srcGeom=ring.map(p=>p.slice()); /* retrato do limite p/ o Voltar */
  try{st.srcHash=cavaGeomHash({f:item.f});}catch(e){st.srcHash='';}
  st.z=z;
  const gL=rb31Fecha(ring);
  const subida=rb31EhSubida(st),nome0=subida?'pé':'crista';
  st.feats.push({geom:gL,multi:false,
    zg:gL.map(()=>z),props:{TIPO:'Limite ('+nome0+' inicial 3.1)',BANCO:0,
      COTA:+z.toFixed(3),ALTURA:null,BERMA:null,ANGULO:null,
      CLASSE:subida?'rb31-pe':'rb31-crista'}});
  return true;
}
/* CONTINUAÇÃO: se o limite selecionado no passo 1 já comanda uma pilha
   desenhada (é o limite dinâmico dela, ou o polígono de origem dele), um
   Gerar com estado zerado NÃO cria pilha nova — reconecta na existente e
   segue da última bancada. Sem isto, re-selecionar o limite achatava a
   geometria editada e nascia uma segunda pilha por cima da primeira. */
function rb31PilhaDoItem(){
  try{
    const item=cavaItemSelecionado();
    if(!item||!item.L)return null;
    let lim=null;
    if(item.L._cavaLimiteDin)lim=item.L;
    else lim=(S.layers||[]).find(x=>x._cavaLimiteDin&&
      String(x._cavaLimiteOrig)===String(item.L.id)&&
      (x._cavaLimiteOrigFeat==null||+x._cavaLimiteOrigFeat===+(item.i||0)))||null;
    if(!lim)return null;
    const uni=(S.layers||[]).find(x=>x._rb31Recipe&&x._rb31Recipe.banco>0&&
      String(x._rb31Recipe.srcLayerId)===String(lim.id));
    return uni?{uni,lim}:null;
  }catch(e){ return null; }
}
function rb31Reconecta(sil){
  /* "Usar como novo limite" tem precedência sobre a retomada automática.
     Sem essa marca, selecionar um ◈ já utilizado continua reconectando ao
     projeto anterior, que é o comportamento seguro para uma continuação. */
  try{
    const novo=S._rb31NovoDoLimiteId,item=cavaItemSelecionado();
    if(novo&&item&&item.L&&String(item.L.id)===String(novo))return false;
    if(novo)S._rb31NovoDoLimiteId=null;
  }catch(e){}
  const par=rb31PilhaDoItem();
  if(!par)return false;
  const st=rb31EstadoDaReceita(par.uni);
  if(!st)return false;
  /* o select passa a apontar o limite dinâmico (é ele quem comanda) */
  try{
    const sel=document.getElementById('cavaBaseSel');
    if(sel){refreshCavaMineracao();
      const v=par.lim.id+':0';
      if([...sel.options].some(o=>o.value===v))sel.value=v;}
  }catch(e){}
  try{ rb31Replay(); }catch(e){}
  const st2=S._rb31||st;
  if(!st2||!(st2.banco>0)){
    /* o replay não reconstruiu — melhor avisar do que fingir sucesso */
    const m2='Este limite já comanda a pilha "'+(par.uni.name||'')+
      '", mas a reconstrução falhou. Use Reiniciar nela ou revise o limite.';
    const inf2=document.getElementById('rb31Info');
    if(inf2)inf2.textContent=m2;
    toast(m2);
    return true; /* consome o clique: não deixa nascer pilha duplicada */
  }
  const msg='Continuação: "'+(par.uni.name||'pilha')+'" reconectada na bancada '+
    (st2.banco||st.banco)+' — Gerar/Iterar segue a partir dela.';
  const info=document.getElementById('rb31Info');
  if(info)info.textContent=msg;
  if(!sil)toast(msg);
  try{ cmdLog(msg,'ok'); }catch(e){}
  return true;
}
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
  let modoNovo=false;
  const novoInicioSolicitado=!!(st.novoInicioP||st.novoSoleira||st._vincoPendente133);
  /* Rampa somente com origem explicitamente marcada. O primeiro vértice
     do limite nunca é usado como início automático. */
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
  /* GRADE EXATA POR CONVERGÊNCIA: a limpeza da marcha encurta o eixo em
     limites angulosos (14% medido com 10% pedido, 23/08). Se o eixo
     entregue ficou curto, regenera com alvo proporcionalmente maior —
     uma ou duas voltas bastam; a grade entregue volta ao projeto. */
  try{
    const Lalvo=H/(g/100);
    for(let volta=0;volta<4&&r&&r.bordaA&&r.bordaA.length>1;volta++){
      /* a régua é a BORDA ENTREGUE (limpa) — o eixo cru vem inflado pelo
         zigue da marcha e mascarava o encurtamento */
      let Lf=0;
      for(let i=1;i<r.bordaA.length;i++)
        Lf+=Math.hypot(r.bordaA[i][0]-r.bordaA[i-1][0],r.bordaA[i][1]-r.bordaA[i-1][1]);
      if(Lf>=Lalvo*0.97)break;
      opt._fatorL=Math.min(1.9,((opt._fatorL)||1)*(Lalvo/Math.max(30,Lf)));
      const t2=rb31GeraSemCruzar(st.crista,st.z,opt,W,rb31LinhasAnteriores(st));
      if(t2&&t2.r&&t2.r.peEntregue){tent=t2;r=t2.r;}
      else break;
    }
    opt._fatorL=null;
  }catch(e){}
  /* Contrato único v77: nenhuma ferramenta publica uma rampa se o limite
     controlador não conservar o ângulo da face ou se a pista afunilar.
     O usuário mantém a última bancada válida em vez de receber geometria
     aparentemente pronta, porém impraticável para caminhões. */
  if(!opt.semRampa&&r&&r.faceAudit){
    const a=r.faceAudit,erro=Math.max(Math.abs(a.faceMin-ang),Math.abs(a.faceMax-ang)),
      erroW=Math.max(Math.abs(a.widthMin-W),Math.abs(a.widthMax-W));
    if(erro>0.10||erroW>Math.max(.03,Math.abs(W)*.005)){
      const msg=`Rampa recusada: face ${a.faceMin.toFixed(2)}°–${a.faceMax.toFixed(2)}° `+
        `(alvo ${ang.toFixed(2)}°), largura ${a.widthMin.toFixed(2)}–${a.widthMax.toFixed(2)} m `+
        `(alvo ${W.toFixed(2)} m).`;
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
    /* Sem rampa não existe boca nem travessa a transportar para a berma.
       Manter pFim/pFimB do cálculo auxiliar fazia o offset exigir uma
       concordância de rampa inexistente e recusava uma berma perfeitamente
       válida. A berma bruta deve nascer do anel inteiro. */
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
  /* Cruzar bancos JÁ desenhados significa que a cava fechou nessa
     região: não há área para mais um banco. Nesse caso a bancada não
     é entregue — melhor recusar do que desenhar linhas por cima. */
  if(tent.ant>0){
    /* Antes isto era recusa seca. Agora tenta SEPARAR EM LÓBULOS: o istmo
       fechou, mas os dois lados continuam válidos. Só desiste se nem assim
       sobrar mais de um pedaço com área útil. */
    const areaMin=Math.max(4*W*W,50);
    const lobos=cavaSeparaLobos(r.peEntregue,areaMin);
    if(lobos.length>1){
      const zPe=st.z+((document.getElementById('cavaSentido')||{}).value==='up'?+H:-H);
      st.feats=st.feats.filter(f=>!(f.props&&/^Lóbulo/.test(f.props.TIPO||'')));
      lobos.slice(1).forEach((lo,k)=>{
        const g2=rb31Fecha(lo);
        const nomeL=up?'Crista':'Pé',classeL=up?'rb31-crista':'rb31-pe';
        st.feats.push({geom:g2,multi:false,zg:g2.map(()=>zPe),
          props:{TIPO:'Lóbulo separado '+(k+2)+' — '+nomeL.toLowerCase()+' banco '+(st.banco+1),
            BANCO:st.banco+1,COTA:+zPe.toFixed(3),ALTURA:H,BERMA:null,
            ANGULO:+el('rb31Ang').value,CLASSE:classeL}});
      });
      /* o maior lóbulo continua sendo o anel de trabalho: a rampa segue nele */
      r.peEntregue=lobos[0];
      const areas=lobos.map(l=>Math.abs(cavaArea2(l))/2/10000);
      const aviso='A cava se dividiu na bancada '+(st.banco+1)+': '+lobos.length+
        ' lóbulos ('+areas.map(a=>a.toFixed(2)+' ha').join(' · ')+
        '). A rampa segue no maior; os outros ficam desenhados na cota '+zPe.toFixed(2)+'.';
      const iEl=el('rb31Info');if(iEl)iEl.textContent=aviso;
      if(!sil)toast(aviso);
      try{ cmdLog(aviso,'avisa'); }catch(e){}
    }else if((()=>{
      /* aperto LOCAL × fechamento GERAL: agrupa os pontos de cruzamento
         em focos de raio 3W. Um ou dois focos = região apertada (gargalo,
         entalhe) — a bancada segue com aviso; muitos focos espalhados =
         a cava fechou de fato. O número bruto de cruzamentos engana: um
         único gargalo morto gera 6–8 pontos (visto no projeto Massari). */
      const pts=tent.pts||[],rC=3*Math.max(1,Math.abs(W)||10),focos=[];
      for(const pt of pts){
        if(!focos.some(F=>Math.hypot(F[0]-pt[0],F[1]-pt[1])<=rC))
          focos.push([pt[0],pt[1]]);
      }
      return (focos.length>0&&focos.length<=2)||tent.ant<=4;
    })()){
      const aviso='A bancada '+(st.banco+1)+' cruza linhas de bancos anteriores numa região apertada ('+
        tent.ant+' ponto(s)) — o espaço fechou ali. '+
        'A bancada foi desenhada no restante; ajuste o limite nessa região ou reduza largura/berma.';
      const iEl=el('rb31Info');if(iEl)iEl.textContent=aviso;
      if(!sil)toast(aviso);
      try{ cmdLog(aviso,'avisa'); }catch(e){}
    }else{
      rb31Desenha(st);
      const msg='A cava fechou aqui: a bancada '+(st.banco+1)+
        ' cruzaria os bancos já desenhados ('+tent.ant+
        ' cruzamento(s)) e não há área para dividir em lóbulos. '+
        'Reduza a largura/berma ou pare neste banco.';
      const iEl=el('rb31Info');if(iEl)iEl.textContent=msg;
      toast(msg);
      return false;
    }
  }
  let avisoCruz='';
  if(tent.corrigido&&tent.crista!==st.crista){
    st.crista=tent.crista;
    rb31AtualizaCristaDesenhada(st,tent.crista);
    avisoCruz=tent.restou?
      'Geometria cruzada corrigida em parte — reveja o canto marcado':
      'Canto fechado corrigido automaticamente: a crista foi ajustada para não cruzar linhas';
  }
  st.banco++;st.fase='pe';st.pe=r.peEntregue;st.pFim=[r.pFim[0],r.pFim[1]];
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
/* A linha de onde a próxima bancada nasce é a feição desenhada — PÉ na
   subida e CRISTA na descida. */
function rb31SincronizaCrista(st){
  if(!st||!st.crista)return;
  let alvo=null;
  if(st.banco>0){
    /* A LINHA EDITADA MANDA NA PRÓXIMA ITERAÇÃO (23/08): a bancada
       seguinte parte da BERMA DESENHADA do banco corrente — se o usuário
       a editou, a edição vale. No REPLAY a berma calculada continua
       mandando: arrastar o limite recomanda a pilha inteira (quem quiser
       fixar uma linha editada usa o Congelar). */
    if(window.__rb31EmReplay)return;
    const uni=st.lays&&st.lays.uni;
    const fbv=uni&&(uni.features||[]).find(x=>{
      const p=x.props||{};
      return +p.BANCO===+st.banco&&p.BERMA!=null&&
        p.CLASSE===rb31ClassePartida(st);
    });
    /* o recorte de apresentação não realimenta: lê a geometria de projeto */
    alvo=fbv?{geom:(fbv._geomProjeto&&fbv._geomProjeto.length>3)?fbv._geomProjeto:fbv.geom}:null;
  }else{ /* banco 0: a crista é o próprio limite, lido da feição fonte */
    const L=(S.layers||[]).find(x=>String(x.id)===String(st.srcLayerId)),
      f=L&&L.features&&L.features[st.srcFeatIdx];
    if(f&&f.geom&&f.geom.length>2){
      const r=cavaLimpaRing(f.geom.map(p=>[p[0],p[1]]));
      if(r&&r.length>2)st.crista=r;
    }
    return;
  }
  if(!alvo||!alvo.geom||alvo.geom.length<3)return;
  const g=alvo.geom.map(p=>[p[0],p[1]]);
  if(g.length>3&&Math.hypot(g[0][0]-g[g.length-1][0],g[0][1]-g[g.length-1][1])<1e-7)g.pop();
  const igual=g.length===st.crista.length&&g.every((p,i)=>
    Math.abs(p[0]-st.crista[i][0])<1e-9&&Math.abs(p[1]-st.crista[i][1])<1e-9);
  if(!igual)st.crista=g; /* segue a edição do usuário */
}
/* Uma edição dinâmica (arrasto/inserção/remoção de vértice no limite ou
   em qualquer linha da cava) também entra na pilha do Voltar, com o
   retrato da geometria do limite — assim dá para voltar edição a
   edição até o limite original. */
/* SOMENTE O LIMITE É DINÂMICO (decisão do usuário nesta fase). A
   crista do banco 0 desenhada na camada da cava É o limite: arrastá-la
   equivale a arrastar o limite, então a geometria é espelhada na feição
   fonte — é isso que faz a edição dinâmica responder quando o usuário
   mexe na linha que está vendo, e não na camada oculta. Cristas de
   bancos intermediários são desenho livre: não realimentam a geração
   nem disparam recálculo. */
function rb31MarcaCristaEditada(L,f){
  const st=S._rb31;
  if(!st||!f||!f.props||f.props.CLASSE!=='rb31-crista')return false;
  if(!(st.lays&&st.lays.uni&&L===st.lays.uni))return false;
  const banco=+f.props.BANCO||0,
    anel=(f.geom||[]).map(p=>[p[0],p[1]]);
  if(anel.length>3&&Math.hypot(anel[0][0]-anel[anel.length-1][0],
    anel[0][1]-anel[anel.length-1][1])<1e-7)anel.pop();
  if(anel.length<3)return false;
  if(banco===0){                       /* é o limite: espelha na fonte */
    const src=(S.layers||[]).find(x=>String(x.id)===String(st.srcLayerId)),
      fl=src&&src.features&&src.features[st.srcFeatIdx];
    if(!src||!fl)return false;
    const multi=fl.multi&&Array.isArray(fl.geom[0]&&fl.geom[0][0]);
    const fechado=rb31Fecha(anel);
    if(multi)fl.geom[0]=fechado.map(p=>p.slice());
    else fl.geom=fechado.map(p=>p.slice());
    if(Array.isArray(fl.zg)){
      const z=+f.props.COTA||0;
      fl.zg=multi?[fechado.map(()=>z)]:fechado.map(()=>z);
    }
    st.crista=anel.map(p=>p.slice());
    try{drawLayer(src);}catch(e){}
    try{st.srcHash=cavaGeomHash({f:fl});}catch(e){}
    st.srcGeom=(multi?fl.geom[0]:fl.geom).map(p=>p.slice());
    return true;
  }
  /* POR ORA SÓ O LIMITE É DINÂMICO: editar uma crista intermediária
     não realimenta a geração nem dispara recálculo — a linha fica como
     desenho livre até o usuário mandar gerar de novo. */
  return false;
}
function rb31EmpilhaEdicao(L,f){
  try{ if(f&&f._geomProjeto)delete f._geomProjeto; }catch(e){}
  const st=S._rb31;
  if(!st||!st.banco)return;
  const doLimite=L&&String(L.id)===String(st.srcLayerId);
  const daCava=st.lays&&st.lays.uni&&L===st.lays.uni;
  if(!doLimite&&!daCava)return;
  const src=(S.layers||[]).find(x=>String(x.id)===String(st.srcLayerId)),
    fl=src&&src.features&&src.features[st.srcFeatIdx];
  if(fl&&fl.geom)st.srcGeom=fl.geom.map(p=>p.slice()); /* estado ANTES do gesto */
  st.undoPilha=st.undoPilha||[];
  st.undoPilha.push(rb31Snap(st));
  if(st.undoPilha.length>30)st.undoPilha.shift();
}
/* chamado DEPOIS do gesto (o arrasto já mexeu na geometria) */
function rb31PosEdicao(L,f){
  try{
    if(rb31MarcaCristaEditada(L,f)&&typeof cavaLiveSync==='function')cavaLiveSync();
  }catch(e){console.warn('rb31PosEdicao',e);}
}
/* devolve ao limite a geometria do retrato (usado pelo Voltar) */
function rb31RestauraLimite(st){
  if(!st||!st.srcGeom||st.srcLayerId==null)return false;
  const L=(S.layers||[]).find(x=>String(x.id)===String(st.srcLayerId)),
    f=L&&L.features&&L.features[st.srcFeatIdx];
  if(!L||!f||!f.geom)return false;
  const atual=f.geom,alvo=st.srcGeom;
  const igual=atual.length===alvo.length&&alvo.every((p,i)=>
    Math.abs(p[0]-atual[i][0])<1e-9&&Math.abs(p[1]-atual[i][1])<1e-9);
  if(igual)return false;
  f.geom=alvo.map(p=>p.slice());
  if(Array.isArray(f.zg)&&f.zg.length!==f.geom.length){
    const z=f.zg.length?f.zg[0]:0;f.zg=f.geom.map(()=>z);
  }
  drawLayer(L);
  /* o hash volta junto: sem isso o live-sync veria "mudou" e refaria tudo */
  try{st.srcHash=cavaGeomHash({f});}catch(e){}
  if(S._vtxCtx&&S._vtxCtx.f===f&&typeof showVertices==='function'){
    S._vtxSelPreserve=true;showVertices();
  }
  return true;
}
/* CICATRIZA a berma na zona da junta: o degrau da chegada fica no PÉ
   (com a rampa encostada — fig. 2); o REMANESCENTE que subiria para a
   berma não serve mais (a bancada seguinte abre a própria soleira no
   pFim) e virava degrau órfão. Alisa só a janela de ~2,5·W em volta do
   ponto de entrega. */
function rb31CicatrizaJunta(anel,P,W){
  const n=anel?anel.length:0;
  if(n<8||!P)return anel;
  const R=2.5*Math.max(1,Math.abs(W)||10);
  const inSet=new Set();
  for(let i=0;i<n;i++)if(Math.hypot(anel[i][0]-P[0],anel[i][1]-P[1])<=R)inSet.add(i);
  if(inSet.size<3||inSet.size>=n-2)return anel;
  let iA=-1;
  for(const i of inSet){ if(!inSet.has((i-1+n)%n)){iA=i;break;} }
  if(iA<0)return anel;
  let len=0;while(inSet.has((iA+len)%n)&&len<n)len++;
  const arco=[];for(let k=0;k<len;k++)arco.push(anel[(iA+k)%n].slice());
  const simp=(typeof cavaDecimaVertices==='function')?
    cavaDecimaVertices(arco,0.6*Math.max(1,Math.abs(W)||10)):arco;
  if(simp.length>=arco.length)return anel;
  const novo=[];
  for(let k=0;k<n-len;k++)novo.push(anel[(iA+len+k)%n].slice());
  simp.forEach(p=>novo.push(p.slice()));
  return novo;
}
function rb31OffsetBerma(sil){
  const st=rb31Estado(),el=id=>document.getElementById(id);
  if(st.fase!=='pe'){toast('Gere uma bancada antes do offset da berma');return false;}
  const B=+el('rb31B').value;
  if(!(B>0)){toast('Informe a largura da berma');return false;}
  const classeFim=rb31ClasseChegada(st),nomeFim=rb31NomeChegada(st),
    classeProx=rb31ClassePartida(st),
    nomeProx=rb31NomePartida(st);
  /* A linha de CHEGADA editada manda na berma. Na subida, o offset parte
     da CRISTA laranja fechada e gera o próximo PÉ preto. */
  if(!window.__rb31EmReplay){
    try{
      const uni=st.lays&&st.lays.uni;
      const fp=uni&&(uni.features||[]).find(x=>{
        const p=x.props||{};
        return +p.BANCO===+st.banco&&p.BERMA==null&&p.CLASSE===classeFim;
      });
      const gpz=fp&&((fp._geomProjeto&&fp._geomProjeto.length>3)?fp._geomProjeto:fp.geom);
      if(fp&&gpz&&gpz.length>3){
        const g=gpz.map(p=>[p[0],p[1]]);
        if(Math.hypot(g[0][0]-g[g.length-1][0],g[0][1]-g[g.length-1][1])<1e-7)g.pop();
        const peAtual=(st.pe||[]).map(p=>[p[0],p[1]]);
        if(peAtual.length>3&&Math.hypot(peAtual[0][0]-peAtual.at(-1)[0],
          peAtual[0][1]-peAtual.at(-1)[1])<1e-7)peAtual.pop();
        const igual=g.length===peAtual.length&&g.every((p,i)=>
          Math.abs(p[0]-peAtual[i][0])<1e-6&&Math.abs(p[1]-peAtual[i][1])<1e-6);
        if(!igual&&g.length>2)st.pe=rb31Fecha(g);
      }
    }catch(e){}
  }
  /* Primeiro trecho da SUBIDA: a geometria da rampa e a crista laranja
     ficam intocadas. O pé preto é exclusivamente o offset 2D fechado da
     crista, para fora/para dentro conforme a configuração selecionada. */
  const primeiroOffset=rb31EhSubida(st)&&+st.banco===1;
  /* OFFSET DA BERMA = OFFSET DO CAD (24/08, pedido dele): TODAS as bermas
     usam o mesmo núcleo da aba CAD → Offset (offsetRing), com a distância
     de projeto B. O offset interno antigo fica só como reserva, para o
     caso de o CAD não conseguir devolver anel. */
  /* O OFFSET É DO ANEL SEM A BOCA: na região onde a rampa entra, a linha
     tem o entalhe; o offset CAD colapsa ali (medido: distância caindo de
     6,00 para 0). O entalhe é fechado por uma reta ANTES do offset — a
     berma sai paralela em toda a volta e a abertura é recriada depois,
     pelo par da rampa. */
  let _peOff=st.pe;
  try{
    const bordasR=(st.feats||[]).filter(f=>/rb31-rampa/.test((f.props||{}).CLASSE||'')
      &&f.geom&&f.geom.length>1).map(f=>f.geom);
    if(bordasR.length&&Array.isArray(st.pe)&&st.pe.length>8){
      const Wp=Math.abs(+((document.getElementById('rb31W')||{}).value)||10);
      const perto=P=>{
        for(const g of bordasR)for(let i=1;i<g.length;i++){
          const a=g[i-1],b=g[i],dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy||1;
          let t=((P[0]-a[0])*dx+(P[1]-a[1])*dy)/L2;t=Math.max(0,Math.min(1,t));
          if(Math.hypot(P[0]-(a[0]+t*dx),P[1]-(a[1]+t*dy))<0.9*Wp)return true;
        }
        return false;
      };
      const limpo=st.pe.filter(P=>!perto(P));
      if(limpo.length>=Math.max(8,st.pe.length*0.5))_peOff=limpo;
    }
  }catch(e){}
  let bm=rb31OffsetCad(_peOff,B,!!st.fora);
  if(!bm||!bm.ring){
    const alt=rb31Berma(st.pe,B,!!st.fora);
    if(alt&&alt.ring)bm=alt;
  }
  if(!bm.ring){toast(bm.warn||'Não foi possível gerar a berma');return false;}
  /* DISTÂNCIA DE PROJETO GARANTIDA (24/08): o offset do CAD entrega a
     paralela, mas em cantos e junto à boca alguns vértices ficam mais
     perto que B. Cada ponto fora da tolerância é empurrado até B, medido
     contra a própria linha de origem. */
  try{
    const alvoB=+B;
    const base=st.pe;
    if(Array.isArray(base)&&base.length>2&&alvoB>0){
      const projBase=P=>{
        let m=1e9,q=null;
        for(let i=1;i<base.length;i++){
          const a=base[i-1],b=base[i],dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy;
          if(L2<1e-12)continue;
          let t=((P[0]-a[0])*dx+(P[1]-a[1])*dy)/L2;t=Math.max(0,Math.min(1,t));
          const x=a[0]+t*dx,y=a[1]+t*dy,d=Math.hypot(P[0]-x,P[1]-y);
          if(d<m){m=d;q=[x,y];}
        }
        return {d:m,q};
      };
      bm.ring=bm.ring.map(P=>{
        const pr=projBase(P);
        if(!pr.q||!Number.isFinite(pr.d))return P;
        if(Math.abs(pr.d-alvoB)<=0.25)return P;
        if(pr.d<1e-6)return P;
        const ux=(P[0]-pr.q[0])/pr.d,uy=(P[1]-pr.q[1])/pr.d;
        return [pr.q[0]+ux*alvoB,pr.q[1]+uy*alvoB];
      });
    }
  }catch(e){}
  /* A nova rampa não reutiliza a linha de chegada. Seu par inicial é a
     mesma travessa trasladada rigidamente B metros até a nova partida. */
  const ultimoHist=st.hist&&st.hist[st.hist.length-1],
    temRampaBanco=(st.feats||[]).some(f=>String(f.props&&f.props.CLASSE||'')==='rb31-rampa'&&
      +((f.props||{}).BANCO)===+st.banco);
  let semBanco=!!(ultimoHist&&ultimoHist.sem)||!!st.semRampa||
      !!st.rampaPausada133||!!st._edicaoBruta134||!temRampaBanco,
    prox=semBanco?null:rb31ParOffsetBerma(st.pFim,st.pFimB,bm.ring,B);
  if(!semBanco&&st.pFim&&st.pFimB&&!prox&&!primeiroOffset){
    /* Não cria aproximação nem perde a bancada: conserva o offset paralelo
       completo e pausa a próxima rampa até o operador indicar outro ponto. */
    semBanco=true;st.rampaPausada133=true;st._edicaoBruta134=true;
    try{cmdLog('A boca da rampa não admitiu translação exata; berma completa mantida e próxima rampa pausada.','avisa');}catch(e){}
  }
  st.proxIniA=prox?prox.A.slice():null;
  st.proxIniB=prox?prox.B.slice():null;
  if(semBanco){st.pFim=null;st.pFimB=null;st.pFimDir=null;}
  st.crista=bm.ring;st.z=st.zPe;st.fase='crista';
  /* A largura pertence à bancada que acabou de ser concluída. Guardá-la
     no histórico faz o perfil refletir cada iteração real, inclusive quando
     os parâmetros mudam de uma bancada para outra. */
  const pb=st.paramBancos&&st.paramBancos[st.paramBancos.length-1];
  if(pb&&+pb.banco===+st.banco)pb.B=B;
  const gBm=rb31Fecha(bm.ring);
  st.feats.push({geom:gBm,multi:false,zg:gBm.map(()=>st.z),
    props:{TIPO:'Berma banco '+st.banco+' ('+nomeProx.toLowerCase()+' da bancada seguinte)',
      BANCO:st.banco,COTA:+st.z.toFixed(3),ALTURA:null,BERMA:B,ANGULO:null,
      CLASSE:classeProx}});
  /* A EXTENSÃO EXTERNA NÃO RODA MAIS A CADA CICLO. Ela criava bancadas de
     verdade, então uma iteração entregava 1 bancada de projeto + N externas
     (medido: 1 interna e 6 externas numa só iteração) e ele via "mais de uma
     bancada". Iteração = UMA bancada. O encontro com o terreno continua
     aparecendo a cada ciclo, mas como LINHA DE INTERSEÇÃO (rb31CalcInterFeats),
     que é o que ele quer ver desde a primeira iteração; o aterro/corte por
     fora em bancadas fica para o fecho do projeto. */
  rb31Desenha(st);
  const info=el('rb31Info');
  if(info)info.innerHTML='Berma do banco <b>'+st.banco+'</b> pronta: '+nomeFim.toLowerCase()+
    ' fechada e '+nomeProx.toLowerCase()+' 2D a '+B.toFixed(1)+' m na cota '+st.z.toFixed(2)+'.';
  if(!sil)toast('Berma '+B.toFixed(1)+' m aplicada — '+nomeProx.toLowerCase()+' fechado pronto');
  return true;
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
/* captura um toque: no mapa vazio OU em cima de feição (gancho no
   pickFeature) — o que vier primeiro; o outro caminho é cancelado */
function rb31CapturaClique(cb){
  const h=ev=>{S._pickPonto=null;S._pickCancel=null;cb(ev.latlng);};
  S._pickPonto=ll=>{try{map.off('click',h);}catch(e){}cb(ll);};
  /* Esc precisa DESARMAR o clique pendente — zerar só a referência deixava
     o map.once vivo e o próximo clique disparava o comando antigo */
  S._pickCancel=()=>{try{map.off('click',h);}catch(e){}S._pickPonto=null;S._pickCancel=null;};
  map.once('click',h);
}
function rb31Inicio(){
  /* a aba/painel da rampa NÃO pode sumir sozinha: switchView reconstrói
     a ribbon (ribbonBuild→ribbonClose) e fechava o painel — só troca de
     view se realmente não estiver no mapa */
  if(typeof switchView==='function'&&S._view!=='map')switchView('map');
  setTool('select');
  const info=document.getElementById('rb31Info');
  if(info)info.textContent='Toque no mapa, sobre a '+rb31NomeLinhaBase(S._rb31)+', para fixar o início da 1ª rampa…';
  rb31CapturaClique(ll=>{
    const c=fromWGS(S.workCRS,ll.lng,ll.lat);
    /* CONTINUAÇÃO: anel escolhido de uma pilha gerada é a fonte literal —
       sem redirecionar para o limite antigo da pilha */
    const bruto=cavaItemSelecionado();
    const item=(bruto&&bruto.L&&(bruto.L._cavaLimiteDin||bruto.L._rb31Recipe))?
      bruto:cavaFonteOriginal(bruto);
    if(!item||!item.f||!item.f.geom){toast('Selecione primeiro uma linha ou polígono de limite');return;}
    let st=rb31Estado();
    /* Trocar o limite inicia uma sequência nova. Reaproveitar bancos, cota ou
       undo da fonte anterior produz uma geometria aparentemente válida, mas
       topologicamente pertencente a outro polígono. */
    const fonteMudou=st.srcLayerId!=null&&
      (String(st.srcLayerId)!==String(item.L.id)||+st.srcFeatIdx!==+item.i);
    if(fonteMudou){
      /* pilha COM receita fica desenhada e dinâmica (continuação em
         alteamento parte dela); só sequência de teste sem receita — era o
         comportamento antigo — é removida */
      const uniAnt=st.lays&&st.lays.uni;
      const temReceita=!!(uniAnt&&uniAnt._rb31Recipe&&uniAnt._rb31Recipe.banco>0);
      if(!temReceita&&st.lays)for(const k of Object.keys(st.lays)){
        const q=st.lays[k];
        if(q&&(S.layers||[]).includes(q))try{deleteVectorLayer(q);}catch(e){}
      }
      S._rb31=null;st=rb31Estado();
      const zAnt=document.getElementById('rb31Z0');if(zAnt)zAnt.value='';
      toast(temReceita?
        'Nova fonte: a pilha anterior fica desenhada (e dinâmica); começa uma sequência nova daqui':
        'Novo limite: sequência anterior encerrada e cota inicial relida');
    }
    let ring=item.f.multi&&Array.isArray(item.f.geom[0]&&item.f.geom[0][0])?item.f.geom[0]:item.f.geom;
    ring=cavaLimpaRing((ring||[]).map(p=>[p[0],p[1]]));
    const q=rb31PontoNaCrista(ring,[c[0],c[1]]);
    if(!q){toast('Não foi possível projetar o ponto sobre a crista');return;}
    const dist=Math.sqrt(q?((c[0]-q.p[0])**2+(c[1]-q.p[1])**2):Infinity),
      tol=Math.max(5,+((document.getElementById('rb31W')||{}).value||11));
    if(dist>tol){
      if(info)info.textContent='O toque ficou '+dist.toFixed(1)+' m distante da crista. Toque novamente sobre o limite.';
      toast('Início rejeitado: toque a no máximo '+tol.toFixed(1)+' m da crista');
      return;
    }
    /* O início usado é a projeção exata na crista, não a posição livre
       do clique. Isso elimina deslocamentos laterais silenciosos. */
    st.startP=q.p.slice();
    st.novoInicioP=null;st.novoSoleira=null;
    st.semRampa=false;st.semRampaAte=0;st._semEste=false;
    st.rampaPausada133=false;st._edicaoBruta134=false;
    if(st.banco===0){st.crista=null;st.z=null;st.srcLayerId=null;st.srcFeatIdx=null;}
    const zc=rb31CotaDoPonto(item,q.p),zEl=document.getElementById('rb31Z0');
    if(zEl)zEl.value=Number.isFinite(zc)?+(+zc).toFixed(2):'';
    try{ rb31MarcaInicio(q.p, ring, (document.getElementById('rb31Dir')||{}).value); }catch(e){}
    if(info)info.innerHTML='Início projetado na crista: <b>E '+q.p[0].toFixed(2)+' · N '+
      q.p[1].toFixed(2)+'</b> · distância do toque '+dist.toFixed(2)+' m'+
      (Number.isFinite(zc)?' · cota lida: <b>'+(+zc).toFixed(2)+'</b>':'')+
      (st.banco>0?' (vale para um novo ciclo)':'');
    toast(Number.isFinite(zc)?('Início definido na crista — cota '+(+zc).toFixed(2)):'Início definido na crista');
  });
}
/* ponto da crista mais próximo do clique + tangente local do anel */
function rb31PontoNaCrista(ring,P){
  let bd=Infinity,melhor=null;
  for(let i=0;i<ring.length;i++){
    const a=ring[i],b=ring[(i+1)%ring.length],
      dx=b[0]-a[0],dy=b[1]-a[1],q=dx*dx+dy*dy;
    if(q<1e-12)continue;
    const t=Math.max(0,Math.min(1,((P[0]-a[0])*dx+(P[1]-a[1])*dy)/q)),
      px=a[0]+dx*t,py=a[1]+dy*t,d=(P[0]-px)**2+(P[1]-py)**2;
    if(d<bd){bd=d;const L=Math.hypot(dx,dy);
      melhor={p:[px,py],tan:[dx/L,dy/L],i,t};}
  }
  return melhor;
}
/* SOLEIRA DA RAMPA NOVA: no ponto clicado nasce uma reta ORTOGONAL à
   crista, do comprimento da pista (W). É ela que define onde a próxima
   rampa começa — e não mais o offset automático. Como fica na camada
   editável, o usuário pode arrastar as pontas para acertar o traçado
   (um platô, por exemplo) antes de gerar a bancada. */
function rb31MontaSoleira(st,P,W){
  const ring=st.crista;
  if(!ring||ring.length<3)return null;
  const q=rb31PontoNaCrista(ring,P);
  if(!q)return null;
  /* Lado DETERMINÍSTICO pela orientação do anel (shoelace): num anel
     anti-horário o interior fica à esquerda da marcha, logo a normal
     interna é (-ty, tx). Nada de teste ponto-em-polígono aqui: onde a
     rampa anterior abriu o entalhe a crista vira uma fita estreita e o
     teste responde "fora" dos dois lados. */
  let area=0;
  for(let i=0;i<ring.length;i++){
    const p=ring[i],r=ring[(i+1)%ring.length];
    area+=p[0]*r[1]-r[0]*p[1];
  }
  const ccw=area>0,s=(ccw?1:-1)*(st.fora?-1:1);
  const nx=-q.tan[1]*s,ny=q.tan[0]*s;          /* normal para o lado da rampa */
  return [q.p.slice(),[q.p[0]+nx*W,q.p[1]+ny*W]];
}
function rb31DesenhaSoleira(st){
  st.feats=(st.feats||[]).filter(f=>!(f.props&&f.props.CLASSE==='rb31-soleira'));
  if(st.novoSoleira&&st.novoSoleira.length===2){
    const z=+st.z||0;
    st.feats.push({geom:st.novoSoleira.map(p=>p.slice()),multi:false,
      zg:[z,z],props:{TIPO:'Soleira da rampa nova (banco '+(st.banco+1)+')',
        BANCO:st.banco+1,COTA:+z.toFixed(3),ALTURA:null,BERMA:null,
        ANGULO:null,CLASSE:'rb31-soleira'}});
  }
  rb31Desenha(st);
}
/* relê a soleira da camada: se o usuário arrastou as pontas, é a
   posição arrastada que manda no início da rampa */
function rb31LeSoleira(st){
  const f=(st.feats||[]).filter(x=>x.props&&x.props.CLASSE==='rb31-soleira').pop();
  if(f&&f.geom&&f.geom.length>=2){
    st.novoSoleira=[f.geom[0].slice(),f.geom[f.geom.length-1].slice()];
    st.novoInicioP=f.geom[0].slice();
  }
  return st.novoSoleira||null;
}
function rb31NovoPonto(){
  const st=rb31Estado();
  if(!st.banco){toast('Gere a primeira bancada antes de continuar em outro ponto');return;}
  if(st.fase==='pe'){toast('Faça o Offset da berma antes de escolher o novo ponto');return;}
  if(typeof switchView==='function'&&S._view!=='map')switchView('map');
  setTool('select');
  const info=document.getElementById('rb31Info');
  if(info)info.textContent='Toque na '+rb31NomeLinhaBase(st)+
    ': nasce ali uma soleira reta, ortogonal à linha…';
  rb31CapturaClique(ll=>{
    const c=fromWGS(S.workCRS,ll.lng,ll.lat),
      W=+((document.getElementById('rb31W')||{}).value||11);
    const sol=rb31MontaSoleira(st,[c[0],c[1]],W);
    if(!sol){toast('Gere/escolha a crista antes de marcar o novo início');return;}
    st.novoSoleira=sol;st.novoInicioP=sol[0].slice();
    rb31DesenhaSoleira(st);
    if(info)info.innerHTML='Soleira nova marcada (ortogonal à crista, '+W.toFixed(1)+
      ' m): <b>E '+sol[0][0].toFixed(2)+' · N '+sol[0][1].toFixed(2)+
      '</b>. Arraste as pontas se quiser ajustar o traçado e gere a bancada.';
    toast('Soleira ortogonal criada — arraste as pontas para ajustar; a rampa nasce nela');
  });
}
function rb31EixoProgressivo(){
  const st=rb31Estado();
  if(!st.eixos||!st.eixos.length){toast('Gere ao menos uma bancada para traçar a linha de centro');return;}
  /* A linha de centro vive na mesma camada e a janela independente permite
     configurar a progressiva, as estacas, as cotas e o perfil sem abandonar
     o comando de Rampa por bancada. Reabrir não remove uma linha existente. */
  if(!st.eixoOn){
    st.eixoOn=true;
    st.eixoFeats=rb31CalcEixoFeats(st)||[];
    rb31Desenha(st);
    toast('Linha de centro na camada da cava: '+
      st.eixoFeats.length+' trecho(s) — acompanha as próximas bancadas');
  }
  const uni=st.lays&&st.lays.uni&&(S.layers||[]).includes(st.lays.uni)?st.lays.uni:null;
  abreEstModal({layerId:uni&&uni.id,formato:'km'});
}
function cavaAbreProgressiva(){
  const L=cavaProjetoAtual();
  if(!L){toast('Gere ou selecione a cava antes de configurar a progressiva');return;}
  const temEixo=(L.features||[]).some(f=>/rampa\s*[—-]\s*eixo/i.test(String(f.props&&f.props.TIPO||'')));
  if(!temEixo){toast('Ative e gere a rampa da cava para criar a linha progressiva');return;}
  abreEstModal({layerId:L.id,rasterId:L.cavaDesign&&L.cavaDesign.rasterId,formato:'km'});
}
/* CORTE DA CAVA pela interseção com o terreno: as linhas da camada
   única (cristas, pés, bordas e linha de centro) são recortadas pelo
   MDT selecionado no painel da cava e o resultado vai para OUTRA
   camada ("Rampa por bancada — cortada"), junto com a linha de
   interseção; a camada bruta permanece intacta para seguir editando. */
function rb31ExportaDXF(){
  const st=S._rb31;
  const camadas=S.layers||[], selecionada=S.selFeat&&S.selFeat.layer,
    ativa=typeof activeLayer==='function'?activeLayer():null;
  /* O estado vivo desaparece ao fechar/reabrir o projeto. A receita gravada
     na camada é a fonte persistente para o modo Exportação. */
  const uni=(st&&st.lays&&st.lays.uni&&camadas.includes(st.lays.uni)?st.lays.uni:null)||
    (selecionada&&selecionada._rb31Recipe?selecionada:null)||
    (ativa&&ativa._rb31Recipe?ativa:null)||
    camadas.slice().reverse().find(q=>q._rb31Recipe&&q.visible!==false)||
    camadas.slice().reverse().find(q=>q._rb31Recipe)||null;
  const uid=uni&&String(uni.id),
    cort=camadas.find(q=>uid&&String(q._rb31CutOf||'')===uid)||
      camadas.find(q=>String(q._rb31CutOf||'')==='rb31');
  const Ls=[uni,cort].filter(Boolean);
  if(!Ls.length){toast('Gere a cava (bancadas) antes de exportar');return;}
  const dxf=dxfFromLayers(Ls);
  download(new Blob([dxf],{type:'application/dxf'}),'rampa_por_bancada_3d.dxf');
  toast('DXF 3D: '+Ls.map(l=>l.name).join(' + ')+' — cota real em cada vértice');
}
/* Máscara construtiva final: o corte pelo MDT nunca pode conservar um
   trecho do lado externo ao limite paramétrico. O recorte é feito segmento
   a segmento (inclusive em limites côncavos) e interpola a cota no ponto
   exato em que a linha cruza a borda. Limites editáveis abertos são fechados
   apenas para esta máscara, sem modificar a feição que o usuário desenhou. */
function cavaRecortaFeicoesNoLimite(feats,limite){
  let ring=(limite||[]).map(p=>[+p[0],+p[1]]).filter(p=>p.every(Number.isFinite));
  if(ring.length>3&&Math.hypot(ring[0][0]-ring.at(-1)[0],ring[0][1]-ring.at(-1)[1])<1e-8)ring.pop();
  if(ring.length<3)return (feats||[]).slice();
  const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]),escala=Math.max(
    Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),1),eps=escala*1e-10,
    cruza=(a,b,c,d)=>{
      const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],
        den=rx*sy-ry*sx,qx=c[0]-a[0],qy=c[1]-a[1],rr=rx*rx+ry*ry;
      if(Math.abs(den)<=eps){
        if(!rr||Math.abs(qx*ry-qy*rx)>eps*Math.sqrt(rr))return [];
        return [((c[0]-a[0])*rx+(c[1]-a[1])*ry)/rr,
          ((d[0]-a[0])*rx+(d[1]-a[1])*ry)/rr].filter(t=>t>-eps&&t<1+eps);
      }
      const t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
      return t>-eps&&t<1+eps&&u>-eps&&u<1+eps?[Math.max(0,Math.min(1,t))]:[];
    },naBorda=p=>{
      for(let i=0;i<ring.length;i++){
        const a=ring[i],b=ring[(i+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],dd=dx*dx+dy*dy,
          t=Math.max(0,Math.min(1,dd?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/dd:0)),
          qx=a[0]+dx*t,qy=a[1]+dy*t;
        if(Math.hypot(p[0]-qx,p[1]-qy)<=eps*8)return true;
      }
      return false;
    },dentro=p=>naBorda(p)||pointInRing(p[0],p[1],ring),out=[];
  for(const f of feats||[]){
    const g=f&&f.geom||[];if(g.length<2)continue;
    const cota=Number.isFinite(+f.props?.COTA)?+f.props.COTA:NaN,
      zAt=i=>Number.isFinite(+f.zg?.[i])?+f.zg[i]:
        (Number.isFinite(+g[i]?.[2])?+g[i][2]:cota),runs=[];
    let cur=[];
    const fecha=()=>{if(cur.length>1){
      const len=cur.slice(1).reduce((s,p,i)=>s+Math.hypot(p.p[0]-cur[i].p[0],p.p[1]-cur[i].p[1]),0);
      if(len>eps)runs.push(cur);
    }cur=[];},anexa=(p,z)=>{
      if(!cur.length||Math.hypot(p[0]-cur.at(-1).p[0],p[1]-cur.at(-1).p[1])>eps*8)cur.push({p,z});
      else if(Number.isFinite(z))cur.at(-1).z=z;
    };
    for(let i=1;i<g.length;i++){
      const a=g[i-1],b=g[i],za=zAt(i-1),zb=zAt(i),ts=[0,1];
      for(let k=0;k<ring.length;k++)ts.push(...cruza(a,b,ring[k],ring[(k+1)%ring.length]));
      const us=[...new Set(ts.map(t=>Math.max(0,Math.min(1,t))).map(t=>+t.toFixed(12)))].sort((x,y)=>x-y);
      for(let k=1;k<us.length;k++){
        const t0=us[k-1],t1=us[k];if(t1-t0<1e-12)continue;
        const tm=(t0+t1)/2,m=[a[0]+(b[0]-a[0])*tm,a[1]+(b[1]-a[1])*tm];
        if(!dentro(m)){fecha();continue;}
        const p0=[a[0]+(b[0]-a[0])*t0,a[1]+(b[1]-a[1])*t0],
          p1=[a[0]+(b[0]-a[0])*t1,a[1]+(b[1]-a[1])*t1],
          z0=Number.isFinite(za)&&Number.isFinite(zb)?za+(zb-za)*t0:(Number.isFinite(za)?za:zb),
          z1=Number.isFinite(za)&&Number.isFinite(zb)?za+(zb-za)*t1:(Number.isFinite(zb)?zb:za);
        anexa(p0,z0);anexa(p1,z1);
      }
    }
    fecha();
    runs.forEach(r=>out.push({...f,geom:r.map(q=>q.p),multi:false,
      zg:r.map(q=>q.z),props:{...(f.props||{})}}));
  }
  return out;
}
function rb31Cortar(){
  const st=S._rb31;
  if(!st||!st.banco||!st.feats||!st.feats.length){
    toast('Gere a cava (bancadas) antes de cortar');return;
  }
  const rid=(document.getElementById('cavaMdtSel')||{}).value,
    R=(S.rasters||[]).find(x=>String(x.id)===String(rid)),g=R&&R.d;
  if(!g){toast('Selecione o MDT (TIFF do terreno) no painel da cava automática');return;}
  const alturas=(st.paramBancos||[]).map(q=>+q.H).filter(Number.isFinite),
    H=alturas.length?Math.max(...alturas):+((document.getElementById('rb31H')||{}).value||15),
    passo=Math.max(.2,Math.min(.75,g.cs||.5)),
    rec=[];
  const receita=st.lays&&st.lays.uni&&st.lays.uni._rb31Recipe,
    modoUp=st.travaUp!==undefined?!!st.travaUp:
      (st.up!==undefined?!!st.up:
        (receita&&receita.travaUp!==undefined?!!receita.travaUp:
          !!(receita&&receita.runtime&&receita.runtime.up)));
  /* linha de interseção cava × terreno (mesma topologia XYZ da cava) */
  let interFeats=[];
  try{
    const linhas=[];
    for(const f of st.feats){
      if(f.props.CLASSE!=='rb31-crista'&&f.props.CLASSE!=='rb31-pe')continue;
      const ring=f.geom.map(p=>p.slice());
      if(ring.length>3&&Math.hypot(ring[0][0]-ring[ring.length-1][0],
        ring[0][1]-ring[ring.length-1][1])<1e-7)ring.pop();
      linhas.push({ring,z:+f.props.COTA||0});
    }
    if(linhas.length)interFeats=cavaIntersecaoSuperficies(linhas,g,H,modoUp).map(s2=>({
      geom:s2.geom,multi:false,zg:s2.zg,
      props:{TIPO:'Interseção cava × terreno',BANCO:null,COTA:null,
        ALTURA:H,BERMA:null,ANGULO:null,CLASSE:'rb31-inter'}}));
  }catch(e){console.warn('rb31 interseção',e);}
  /* recorte de cada linha: fica só o que está DENTRO da cava aberta */
  const todas=st.feats.concat(st.eixoOn&&st.eixoFeats?st.eixoFeats:[]);
  for(const f of todas){
    cavaRecortaFeicaoNoMdt(f,g,modoUp,passo).forEach(q=>{
      let len=0;
      for(let i=1;i<q.geom.length;i++)len+=Math.hypot(
        q.geom[i][0]-q.geom[i-1][0],q.geom[i][1]-q.geom[i-1][1]);
      if(len>Math.max(.05,(g.cs||1)*.1))rec.push(q); /* nada voando */
    });
  }
  cavaForcaExtremosNaIntersecao(rec,interFeats,g);
  cavaSoldaRecorteNaIntersecao(rec,interFeats,g);
  if(!rec.length&&!interFeats.length){
    toast('Nenhuma linha ficou dentro da interseção — confira o MDT selecionado');return;
  }
  const feats=rec.concat(interFeats),fields=rb31Fields(),ativa=S.activeId;
  cavaSoldaIntersecaoAneis(feats,Math.max(1e-8,(g.cs||1)*1e-8));
  {
    const q=cavaRecortaAneisNaIntersecao(feats,modoUp);
    if(q.recortadas){feats.length=0;feats.push(...cavaFeatsSemDuplicar(q.feats));}
  }
  const fonte=(S.layers||[]).find(x=>String(x.id)===String(st.srcLayerId)),
    fLim=fonte&&fonte.features&&fonte.features[st.srcFeatIdx||0];
  if(fLim&&fLim.geom&&fLim.geom.length>=3){
    const dentro=cavaRecortaFeicoesNoLimite(feats,fLim.geom);
    feats.length=0;feats.push(...cavaFeatsSemDuplicar(dentro));
  }
  const uni=st.lays&&st.lays.uni&&(S.layers||[]).includes(st.lays.uni)?st.lays.uni:null,
    corteId=uni?String(uni.id):'rb31';
  let C=(S.layers||[]).find(q=>String(q._rb31CutOf||'')===corteId)||
    (S.layers||[]).find(q=>String(q._rb31CutOf||'')==='rb31');
  if(C){C.features=feats;C.fields=fields;C.visible=true;drawLayer(C);}
  else{
    C=addLayer({name:'Rampa por bancada — cortada',gtype:'line',
      crs:S.workCRS,features:feats,fields,color:'#111111'});
  }
  C._rb31CutOf=corteId;
  C._cavaCutMode='daylight';
  C._cavaMdtCutUp=modoUp;
  cavaV02AplicaLinhas(C,'CLASSE');drawLayer(C);
  S.activeId=ativa;refreshUI();
  toast('Cava cortada pela interseção: '+rec.length+' linha(s) em camada própria');
}
/* VOLTAR (pilha, uma etapa por vez): cada clique de ação (gerar /
   berma / iteração) empilha um retrato do estado ANTES de agir; cada
   Voltar restaura UM retrato — pode voltar quantas vezes for preciso,
   sempre uma etapa por clique. O replay dinâmico não grava retratos
   (não é ação do usuário). */
function rb31Snap(st){
  const o={};
  for(const k of Object.keys(st)){
    if(k==='lays'||k==='srcLayerId'||k==='srcFeatIdx'||k==='srcHash'||
      k==='undoSnap'||k==='undoPilha')continue; /* a pilha NUNCA entra no retrato */
    o[k]=st[k];
  }
  return JSON.stringify(o);
}
function rb31AplicaSnap(st,snap){
  const o=JSON.parse(snap),
    guard=new Set(['lays','srcLayerId','srcFeatIdx','srcHash','undoSnap','undoPilha']);
  for(const k of Object.keys(st))if(!guard.has(k)&&!(k in o))delete st[k];
  for(const k of Object.keys(o))st[k]=o[k];
}
function rb31AcaoComVolta(fn){
  const st=S._rb31;
  const cand=st?rb31Snap(st):null;
  const antes=st?st.banco+'|'+st.fase+'|'+(st.feats?st.feats.length:0):'';
  const r=fn();
  const st2=S._rb31;
  if(cand&&st2===st){
    const depois=st.banco+'|'+st.fase+'|'+(st.feats?st.feats.length:0);
    if(depois!==antes){ /* só se a ação mudou algo */
      st.undoPilha=st.undoPilha||[];
      st.undoPilha.push(cand);
      if(st.undoPilha.length>30)st.undoPilha.shift(); /* cap de memória */
    }
  }
  return r;
}
function rb31Voltar(){
  try{ if(S._rb31)S._rb31._histAlvo=null; }catch(e){} /* voltar é intencional */
  const st=S._rb31;
  if(!st||!st.undoPilha||!st.undoPilha.length){
    toast('Nada para voltar — gere uma bancada ou berma primeiro');return;
  }
  rb31AplicaSnap(st,st.undoPilha.pop()); /* UMA etapa por clique */
  const voltouLimite=rb31RestauraLimite(st); /* edição dinâmica também volta */
  rb31Desenha(st);
  const info=document.getElementById('rb31Info');
  if(info)info.textContent=(voltouLimite?'Edição do limite desfeita — banco ':'Etapa desfeita — banco ')+st.banco+
    (st.fase==='pe'?' ('+rb31NomeChegada(st).toLowerCase()+' pendente de berma)':
      ' ('+rb31NomePartida(st).toLowerCase()+' pronto)')+
    (st.undoPilha.length?' · restam '+st.undoPilha.length+' etapa(s) para voltar.':' · nada mais para voltar.');
  toast('Etapa desfeita'+(st.undoPilha.length?' — pode voltar mais '+st.undoPilha.length:''));
  refreshUI();
}
/* RAMPA PARAMÉTRICA — os dois gestos:
   · Limpar rampa: replay da pilha inteira em modo SEM RAMPA (anéis
     limpos, pé natural — a "cava bruta" que ele pediu);
   · Reposicionar: um clique na crista do limite refaz tudo com a 1ª
     rampa nascendo ali (bancos seguintes continuam por degrau). */
function rb31EstadoVivo(){
  let st=S._rb31;
  if(!st||!st.banco){
    const uni=(S.layers||[]).find(x=>x._rb31Recipe&&x._rb31Recipe.banco>0);
    if(uni){ try{ st=rb31EstadoDaReceita(uni); }catch(e){ st=null; } }
  }
  return (st&&st.banco)?st:null;
}
/* após um replay disparado por botão, a camada DERIVADA (anéis cortados
   pelo MDT) precisa acompanhar — senão a geometria antiga (com os vincos
   da rampa removida) fica desenhada por cima das linhas limpas */
/* NENHUMA LINHA ATRAVESSA O CORREDOR: as linhas de crista/pé/berma que
   invadem a faixa da rampa (bordas + travessia) são contornadas pelo
   PERÍMETRO da faixa — o jog curto pela boca mais próxima, nunca o corte
   oblíquo por cima da pista (círculos de 23/08). Idempotente: linha já
   fora da faixa não é tocada. */
function rb31ClipAneisNoCorredor(st){
  try{
    /* v91 — ABERTURA REAL, SEM DEGRAU.
       A versão antiga desviava a crista/pé pelo perímetro da pista. Esse
       desvio criava exatamente os pequenos U/V circulados pelo usuário.
       Agora o anel de PROJETO continua fechado e intocado em _geomProjeto,
       enquanto o desenho/exportação recebe partes abertas: todo segmento
       dentro da faixa roxa e as duas travessas das bocas são simplesmente
       omitidos. As pontas remanescentes são soldadas nos vértices roxos. */
    {
      if(!st||!st.feats||!st.feats.length)return;
      const distSeg91=(p,a,b)=>{
        const dx=b[0]-a[0],dy=b[1]-a[1],q=dx*dx+dy*dy||1;
        let t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/q;t=Math.max(0,Math.min(1,t));
        return Math.hypot(p[0]-(a[0]+dx*t),p[1]-(a[1]+dy*t));
      };
      const dentro91=(p,poly)=>{
        let c=false;
        for(let i=0,j=poly.length-1;i<poly.length;j=i++){
          const a=poly[i],b=poly[j];
          if(((a[1]>p[1])!==(b[1]>p[1]))&&
             p[0]<(b[0]-a[0])*(p[1]-a[1])/((b[1]-a[1])||1e-12)+a[0])c=!c;
        }
        return c;
      };
      const rampas91=[];
      for(let k=1;k<=st.banco;k++){
        const A=st.feats.find(f=>f.props&&f.props.TIPO==='Rampa banco '+k+' — borda externa'),
          B=st.feats.find(f=>f.props&&f.props.TIPO==='Rampa banco '+k+' — borda interna');
        if(!A||!B||A.multi||B.multi||!A.geom||!B.geom||A.geom.length<2||B.geom.length<2)continue;
        const ag=A.geom.map(p=>[+p[0],+p[1]]),bg=B.geom.map(p=>[+p[0],+p[1]]),
          poly=ag.concat(bg.slice().reverse()),
          W91=Math.max(.1,Math.hypot(ag[0][0]-bg[0][0],ag[0][1]-bg[0][1]));
        rampas91.push({poly,W:W91,
          bocas:[[ag[0].slice(),bg[0].slice()],[ag.at(-1).slice(),bg.at(-1).slice()]],
          pinos:[ag[0].slice(),bg[0].slice(),ag.at(-1).slice(),bg.at(-1).slice()]});
      }
      /* Recorta UMA cadeia sem criar qualquer conector novo. Cada intervalo
         é classificado pelo ponto médio depois de injetar todas as
         interseções exatas com o perímetro da pista. */
      const corta91=(linha,R)=>{
        if(!linha||linha.length<2)return {partes:[],mudou:false};
        const partes=[];let atual=[],mudou=false;
        const add=(arr,p)=>{
          const u=arr[arr.length-1];
          if(!u||Math.hypot(u[0]-p[0],u[1]-p[1])>1e-7)arr.push([p[0],p[1]]);
        };
        for(let i=1;i<linha.length;i++){
          const a=linha[i-1],b=linha[i],dx=b[0]-a[0],dy=b[1]-a[1],ts=[0,1];
          for(let j=0;j<R.poly.length;j++){
            const c=R.poly[j],d=R.poly[(j+1)%R.poly.length],
              sx=d[0]-c[0],sy=d[1]-c[1],den=dx*sy-dy*sx;
            if(Math.abs(den)<1e-12)continue;
            const qx=c[0]-a[0],qy=c[1]-a[1],t=(qx*sy-qy*sx)/den,u=(qx*dy-qy*dx)/den;
            if(t>-1e-8&&t<1+1e-8&&u>-1e-8&&u<1+1e-8)
              ts.push(Math.max(0,Math.min(1,t)));
          }
          ts.sort((x,y)=>x-y);
          const tt=ts.filter((t,j)=>!j||Math.abs(t-ts[j-1])>1e-8);
          for(let j=1;j<tt.length;j++){
            const t0=tt[j-1],t1=tt[j];if(t1-t0<1e-10)continue;
            const p0=[a[0]+dx*t0,a[1]+dy*t0],p1=[a[0]+dx*t1,a[1]+dy*t1],
              pm=[(p0[0]+p1[0])/2,(p0[1]+p1[1])/2],
              tolB=Math.max(.05,.02*R.W),
              /* A travessa pode ser colinear ao perímetro; nesse caso não
                 há interseção algébrica, mas ela continua sendo obstáculo
                 e precisa sair. */
              naBoca=R.bocas.some(q=>distSeg91(pm,q[0],q[1])<=tolB&&
                distSeg91(p0,q[0],q[1])<=tolB&&distSeg91(p1,q[0],q[1])<=tolB),
              remove=dentro91(pm,R.poly)||naBoca;
            if(remove){
              mudou=true;
              if(atual.length>1)partes.push(atual);
              atual=[];
            }else{add(atual,p0);add(atual,p1);}
          }
        }
        if(atual.length>1)partes.push(atual);
        /* cadeia originalmente fechada: as partes das duas extremidades
           pertencem ao mesmo arco externo e devem continuar juntas. */
        const fechada=Math.hypot(linha[0][0]-linha.at(-1)[0],linha[0][1]-linha.at(-1)[1])<1e-7;
        if(fechada&&partes.length>1){
          const p0=partes[0],pn=partes.at(-1);
          if(Math.hypot(pn.at(-1)[0]-p0[0][0],pn.at(-1)[1]-p0[0][1])<1e-6){
            partes[0]=pn.concat(p0.slice(1));partes.pop();
          }
        }
        /* solda numérica: se a ponta ficou a poucos centímetros do canto
           roxo, usa literalmente a coordenada roxa. */
        const tolP=Math.max(.12,.04*R.W);
        for(const g of partes)for(const ix of [0,g.length-1]){
          let bp=null,bd=Infinity;
          for(const p of R.pinos){const d=Math.hypot(g[ix][0]-p[0],g[ix][1]-p[1]);if(d<bd){bd=d;bp=p;}}
          if(bp&&bd<=tolP)g[ix]=bp.slice();
        }
        return {partes:partes.filter(g=>g.length>1),mudou};
      };
      for(const f of st.feats){
        const pr=f.props||{},cl=pr.CLASSE;
        if(cl!=='rb31-pe'&&cl!=='rb31-crista')continue;
        if(/Limite/.test(pr.TIPO||''))continue;
        /* PRIMEIRO TRECHO DA SUBIDA: crista laranja e pé preto são anéis
           construtivos completos. Não abre nenhuma das duas linhas para
           apresentação. A crista é fechada primeiro; o offset usa essa
           geometria fechada e o valor B informado; o pé resultante também
           permanece fechado. Os demais trechos serão tratados depois. */
        if(rb31EhSubida(st)&&+pr.BANCO===1){
          let fonte=(f._geomProjeto&&f._geomProjeto.length>2)?f._geomProjeto:
            (!f.multi&&f.geom&&f.geom.length>2?f.geom:null);
          if(fonte){
            let aberto=fonte.map(p=>[+p[0],+p[1]]);
            if(aberto.length>3&&Math.hypot(aberto[0][0]-aberto.at(-1)[0],
              aberto[0][1]-aberto.at(-1)[1])<1e-7)aberto.pop();
            const fechado=rb31Fecha(aberto),zc=Number.isFinite(+pr.COTA)?+pr.COTA:0;
            f.multi=false;f.geom=fechado;f.zg=fechado.map(()=>zc);
            f._geomProjeto=fechado.map(p=>p.slice());delete f._rb31GapV;
          }
          continue;
        }
        /* Sempre deriva do anel fechado original; redesenhar não acumula
           recortes e a próxima bancada continua usando a geometria exata. */
        let base;
        if(f._geomProjeto&&f._geomProjeto.length>2)base=f._geomProjeto.map(p=>p.slice());
        else if(!f.multi&&f.geom&&f.geom.length>2){
          base=f.geom.map(p=>p.slice());f._geomProjeto=base.map(p=>p.slice());
        }else continue;
        let partes=[base],clipou=false;
        for(const R of rampas91){
          const novas=[];
          for(const g of partes){const c=corta91(g,R);novas.push(...c.partes);clipou=clipou||c.mudou;}
          partes=novas.length?novas:partes;
        }
        if(clipou&&partes.length){
          f.multi=partes.length>1;
          f.geom=f.multi?partes:partes[0];
          const zc=Number.isFinite(+(f.props||{}).COTA)?+(f.props||{}).COTA:
            (Array.isArray(f.zg)&&Number.isFinite(+f.zg[0])?+f.zg[0]:0);
          f.zg=f.multi?partes.map(g=>g.map(()=>zc)):f.geom.map(()=>zc);
          f._rb31GapV=91;
        }else{
          f.multi=false;f.geom=base.map(p=>p.slice());
          const zc=Number.isFinite(+(f.props||{}).COTA)?+(f.props||{}).COTA:0;
          f.zg=f.geom.map(()=>zc);delete f._rb31GapV;
        }
      }
      return;
    }
    if(!st||!st.feats||!st.feats.length)return;
    const dentro=(p,poly)=>{
      let c=false;
      for(let i=0,j=poly.length-1;i<poly.length;j=i++){
        const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];
        if(((yi>p[1])!==(yj>p[1]))&&
           (p[0]<(xj-xi)*(p[1]-yi)/((yj-yi)||1e-12)+xi))c=!c;
      }
      return c;
    };
    const interSeg=(a,b,c,d)=>{
      const dd=(b[0]-a[0])*(d[1]-c[1])-(b[1]-a[1])*(d[0]-c[0]);
      if(Math.abs(dd)<1e-12)return null;
      const t=((c[0]-a[0])*(d[1]-c[1])-(c[1]-a[1])*(d[0]-c[0]))/dd,
        u=((c[0]-a[0])*(b[1]-a[1])-(c[1]-a[1])*(b[0]-a[0]))/dd;
      /* tangência de canto NÃO é atravessamento: o pé encosta na borda por
         projeto nas juntas — excluída aqui (era a corrupção em cadeia) */
      if(t<0.02||t>0.98||u<0.02||u>0.98)return null;
      return {t,u,p:[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]};
    };
    const faixas=[];
    for(let k=1;k<=st.banco;k++){
      const A=st.feats.find(f=>f.props&&f.props.TIPO==='Rampa banco '+k+' — borda externa'),
        B=st.feats.find(f=>f.props&&f.props.TIPO==='Rampa banco '+k+' — borda interna');
      if(!A||!B||A.geom.length<2||B.geom.length<2)continue;
      const poly=A.geom.map(p=>[p[0],p[1]])
        .concat(B.geom.slice().reverse().map(p=>[p[0],p[1]]));
      faixas.push(poly);
    }
    if(!faixas.length)return;
    const rota=(poly,e1,e2)=>{
      /* caminho MAIS CURTO pelo perímetro entre dois pontos de cruzamento
         (cada um {i:índice do segmento, t, p}) */
      const n=poly.length;
      const arco=[0];
      for(let i=1;i<=n;i++)
        arco.push(arco[i-1]+Math.hypot(poly[i%n][0]-poly[i-1][0],poly[i%n][1]-poly[i-1][1]));
      const per=arco[n];
      const pos=e=>arco[e.i]+e.t*(arco[e.i+1]-arco[e.i]);
      let s1=pos(e1),s2=pos(e2),inv=false;
      if(s2<s1){const tq=s1;s1=s2;s2=tq;const te=e1;e1=e2;e2=te;inv=true;}
      const direto=s2-s1,volta=per-direto;
      const pontos=[];
      if(direto<=volta){
        pontos.push(e1.p.slice());
        for(let i=e1.i+1;i<=e2.i;i++)pontos.push(poly[i%n].slice());
        pontos.push(e2.p.slice());
      }else{
        pontos.push(e1.p.slice());
        for(let i=e1.i;i>e2.i- n;i--){
          const idx=((i)%n+n)%n;
          pontos.push(poly[idx].slice());
          if(idx===((e2.i+1)%n))break;
        }
        pontos.push(e2.p.slice());
      }
      return inv?pontos.reverse():pontos;
    };
    st.feats.forEach(f=>{
      const cl=(f.props||{}).CLASSE;
      if(cl!=='rb31-pe'&&cl!=='rb31-crista')return;
      if(/Limite/.test((f.props||{}).TIPO||''))return;
      /* GEOMETRIA DE PROJETO × DESENHO: o recorte é só apresentação — a
         geração (sincronização de crista/pé) lê _geomProjeto intacta.
         Editar a linha no mapa apaga _geomProjeto: a edição do usuário
         vira a verdade e realimenta como antes. */
      const base=(f._geomProjeto&&f._geomProjeto.length>3)?f._geomProjeto:f.geom;
      let gBase=base.map(p=>p.slice()),clipou=false;
      for(const poly of faixas){
        let g=gBase,mudou=false,guard=0;
        while(guard++<8){
          /* TODOS os cruzamentos com o perímetro, em ordem ao longo da linha */
          const cruzes=[];
          for(let i=0;i<g.length-1;i++){
            const hits=[];
            for(let j=0;j<poly.length;j++){
              const h=interSeg(g[i],g[i+1],poly[j],poly[(j+1)%poly.length]);
              if(h)hits.push({seg:i,t:h.t,u:h.u,p:h.p,i:j});
            }
            hits.sort((a,b)=>a.t-b.t);
            cruzes.push(...hits);
          }
          if(cruzes.length<2)break;
          /* primeiro PAR consecutivo cujo trecho intermediário está DENTRO */
          let e1=null,e2=null;
          for(let m=0;m<cruzes.length-1;m++){
            const c1=cruzes[m],c2=cruzes[m+1];
            let meio;
            if(c1.seg===c2.seg)meio=[(c1.p[0]+c2.p[0])/2,(c1.p[1]+c2.p[1])/2];
            else meio=g[c1.seg+1];
            if(dentro(meio,poly)){e1=c1;e2=c2;break;}
          }
          if(!e1)break;
          const contorno=rota(poly,{i:e1.i,t:e1.u,p:e1.p},{i:e2.i,t:e2.u,p:e2.p});
          /* SANIDADE antes de aplicar: contorno curto e a linha não pode
             encolher além de 40% */
          let Lcont=0;
          for(let ci=1;ci<contorno.length;ci++)
            Lcont+=Math.hypot(contorno[ci][0]-contorno[ci-1][0],contorno[ci][1]-contorno[ci-1][1]);
          const Ltot=(gg=>{let L=0;for(let i=1;i<gg.length;i++)L+=Math.hypot(gg[i][0]-gg[i-1][0],gg[i][1]-gg[i-1][1]);return L;})(g);
          if(Lcont>Math.max(45,Ltot*0.35))break;
          const novo=g.slice(0,e1.seg+1).concat(contorno,g.slice(e2.seg+1));
          if(novo.length<4)break;
          const Lnovo=(gg=>{let L=0;for(let i=1;i<gg.length;i++)L+=Math.hypot(gg[i][0]-gg[i-1][0],gg[i][1]-gg[i-1][1]);return L;})(novo);
          if(Lnovo<Ltot*0.4)break;
          g=novo;mudou=true;
        }
        if(mudou){gBase=g;clipou=true;}
      }
      if(clipou){
        if(!f._geomProjeto)f._geomProjeto=base.map(p=>p.slice());
        f.geom=gBase;
        if(Array.isArray(f.zg)&&f.zg.length){
          const zc=f.zg[0];f.zg=gBase.map(()=>zc);
        }
      }
    });
  }catch(e){}
}
/* GARANTIA DE COMPLETUDE: depois de gerar/iterar/regenerar, cada banco
   precisa ter pé, berma (quando fechada) e bordas de rampa (quando o banco
   tem rampa). Linha faltando não passa em silêncio — o aviso diz QUAL
   ("uma linha de crista sumiu" de 23/08 ficou sem diagnóstico por falta
   disto). */
function rb31AuditaCompletude(st,ctx){
  try{
    if(!st||!st.banco||!st.lays||!st.lays.uni)return;
    const ff=st.lays.uni.features||[],classeFim=rb31ClasseChegada(st),
      classePartida=rb31ClassePartida(st),nomeFim=rb31NomeChegada(st).toLowerCase(),
      nomePartida=rb31NomePartida(st).toLowerCase();
    const tipos=ff.map(f=>(f.props||{}).TIPO);
    const falta=[];
    for(let k=1;k<=st.banco;k++){
      if(!ff.some(f=>{const p=f.props||{};return +p.BANCO===k&&p.BERMA==null&&p.CLASSE===classeFim;}))
        falta.push(nomeFim+' do banco '+k);
      const precisaBerma=(k<st.banco)||st.fase==='crista';
      if(precisaBerma&&!ff.some(f=>{const p=f.props||{};return +p.BANCO===k&&
        p.BERMA!=null&&p.CLASSE===classePartida;}))
        falta.push('berma do banco '+k+' / '+nomePartida+' seguinte');
      const h=st.hist&&st.hist[k-1];
      const temRampa=!(h&&h.sem)&&!st.semRampa&&!(k<=(+st.semRampaAte||0));
      if(temRampa){
        if(!tipos.includes('Rampa banco '+k+' — borda externa'))
          falta.push('borda externa da rampa '+k);
        if(!tipos.includes('Rampa banco '+k+' — borda interna'))
          falta.push('borda interna da rampa '+k);
      }
    }
    if(falta.length){
      const msg='Atenção ('+ctx+'): faltou no desenho — '+falta.join(', ')+
        '. Regenere a pilha (arraste um vértice do limite) ou ajuste o limite na região apertada.';
      toast(msg);
      try{cmdLog(msg,'avisa');}catch(e){}
    }
  }catch(e){}
}
function rb31AtualizaCorteDerivado(){
  try{
    const st=S._rb31, uniL=st&&st.lays&&st.lays.uni;
    if(!uniL)return;
    const C=(S.layers||[]).find(x=>String(x._cavaMdtCutOf||'')===String(uniL.id));
    if(!C)return;
    const R=(S.rasters||[]).find(x=>String(x.id)===String(C._cavaMdtRasterId));
    if(R)cavaRecalculaCamadaPeloMdt(uniL,R,{up:!!C._cavaMdtCutUp});
  }catch(e){}
}
function rb31LimparRampa(){
  const st=rb31EstadoVivo();
  if(!st){ toast('Gere a pilha/cava primeiro'); return; }
  st.semRampa=true;
  st._histAlvo=null;
  st.rampas=null; /* o plano de rampas é rederivado do hist na próxima leitura */
  try{ rb31Replay(); }catch(e){}
  rb31AtualizaCorteDerivado();
  const info=document.getElementById('rb31Info');
  if(info)info.textContent='Rampa removida — a pilha está em linhas brutas. '+
    'Use "Reposicionar rampa" e clique no novo ponto da crista para religá-la.';
  toast('Rampa removida — pilha refeita em linhas brutas');
}
function rb31NomeLinhaBase(st){
  const up=st&&st.travaUp!==undefined?st.travaUp:
    ((document.getElementById('cavaSentido')||{}).value==='up');
  /* pilha (sobe): o limite é a BASE = linha de PÉ; cava (desce): CRISTA */
  return up?'linha de PÉ (base da pilha)':'linha de CRISTA (cava)';
}
function rb31ReposicionaRampa(){
  const st0=rb31EstadoVivo();
  if(!st0){ toast('Gere a pilha/cava primeiro'); return; }
  if(typeof switchView==='function'&&S._view!=='map')switchView('map');
  setTool('select');
  const info=document.getElementById('rb31Info');
  if(info)info.textContent='Toque na '+rb31NomeLinhaBase(st0)+' onde a nova 1ª rampa deve nascer…';
  rb31CapturaClique(ll=>{
    const st=rb31EstadoVivo();
    if(!st)return;
    const c=fromWGS(S.workCRS,ll.lng,ll.lat);
    const lim=(S.layers||[]).find(x=>x._cavaLimiteDin&&
      String(x.id)===String(st.srcLayerId))||
      (S.layers||[]).find(x=>x._cavaLimiteDin);
    if(!lim||!lim.features[0]){ toast('Limite dinâmico não encontrado'); return; }
    /* CANDIDATOS: a rampa pode nascer em QUALQUER linha-base — o limite
       (banco 1) ou a base de qualquer bancada (berma anterior; o pé
       vizinho também vale como atalho, projetado na berma). Os bancos
       ABAIXO do escolhido saem em linhas brutas (sem rampa). */
    const f=lim.features[0];
    let ring0=f.multi&&Array.isArray(f.geom[0]&&f.geom[0][0])?f.geom[0]:f.geom;
    ring0=cavaLimpaRing(ring0.map(p=>[p[0],p[1]]));
    const cands=[{banco:1,ring:ring0}];
    const uni=st.lays&&st.lays.uni;
    if(uni)for(let k=2;k<=st.banco;k++){
      const fb=uni.features.find(x=>{const p=x.props||{};return +p.BANCO===k-1&&
        p.BERMA!=null&&p.CLASSE===rb31ClassePartida(st);});
      if(fb&&fb.geom&&fb.geom.length>3)
        cands.push({banco:k,ring:cavaLimpaRing(fb.geom.map(p=>[p[0],p[1]]))});
    }
    const tol=Math.max(8,+((document.getElementById('rb31W')||{}).value||11)*1.5);
    let alvo=null;
    for(const cd of cands){
      const q2=rb31PontoNaCrista(cd.ring,[c[0],c[1]]);
      if(!q2)continue;
      const d=Math.hypot(c[0]-q2.p[0],c[1]-q2.p[1]);
      if(d<=tol*1.4&&(!alvo||d<alvo.d))alvo={...cd,q:q2,d};
    }
    if(!alvo){
      toast('Rampa '+((st.travaUp!==false)?'ASCENDENTE sai de um PÉ (linha-base de uma bancada)':
        'DESCENDENTE sai de uma CRISTA')+' — toque numa dessas linhas');
      return;
    }
    const q=alvo.q;
    /* nova parametrização: bancos < escolhido SEM rampa; 1ª rampa no ponto */
    const n=st.banco;
    st.semRampaAte=alvo.banco-1;
    st.startP=alvo.banco===1?q.p.slice():st.startP;
    st.hist=[];
    for(let k=1;k<alvo.banco;k++)st.hist.push({startP:null,degrau:true});
    st.hist.push({startP:q.p.slice(),degrau:false});
    for(let k=alvo.banco+1;k<=n;k++)st.hist.push({startP:null,degrau:true});
    if(alvo.banco===1)st.startP=q.p.slice();
    st.novoInicioP=null;st.novoSoleira=null;
    st.semRampa=false;
    st._histAlvo=null;
    st.rampas=null; /* reposicionar redefine a 1ª rampa: o plano é rederivado */
    try{ rb31MarcaInicio(q.p,alvo.ring,(document.getElementById('rb31Dir')||{}).value); }catch(e){}
    try{ rb31Replay(); }catch(e){}
    rb31AtualizaCorteDerivado();
    try{ if(typeof rb31LimpaMarcaInicio==='function')rb31LimpaMarcaInicio(); }catch(e){}
    const msg='Rampa reposicionada — 1ª rampa no banco '+alvo.banco+
      (alvo.banco>1?' (bancos anteriores em linhas brutas)':'')+
      ' em E '+q.p[0].toFixed(2)+' · N '+q.p[1].toFixed(2);
    if(info)info.textContent=msg;
    toast(msg);
    try{ cmdLog(msg,'ok'); }catch(e){}
  });
}
/* ===== RAMPAS MÚLTIPLAS (painel "Rampas") =====
   Modelo: st.rampas = [{nome, banco, ateBanco, ate, startP}] em faixas de
   cota SEQUENCIAIS. A tabela edita o plano; o plano vira st.hist (com
   sem:true nos bancos fora das faixas) e o replay reconstrói tudo. */
function rb31CotaPe(st,k){
  /* Cota da chegada da rampa: crista na subida, pé na descida. O nome
     legado é mantido porque o planejador já o utiliza em vários pontos. */
  const classe=rb31ClasseChegada(st),
    f=(st.feats||[]).find(x=>x.props&&+x.props.BANCO===+k&&
      x.props.BERMA==null&&String(x.props.CLASSE||'')===classe);
  if(f&&f.props.COTA!=null)return +f.props.COTA;
  const H=+((document.getElementById('rb31H')||{}).value)||10,
    up=(st.travaUp!==false),
    z0=st.z0!=null?+st.z0:
      +((st.feats&&st.feats[0]&&st.feats[0].props&&st.feats[0].props.COTA))||0;
  return z0+(up?+1:-1)*H*k;
}
function rb31BancoDaCota(st,z){
  /* menor banco cujo PÉ alcança a cota pedida (sobe na pilha, desce na cava).
     EXTRAPOLA além dos bancos existentes: depois de um replay que falhou no
     meio, st.banco fica menor que o plano — a cota "até" da rampa continua
     valendo e é ela que diz quantos bancos a pilha deve ter. */
  const n=+st.banco||0,up=(st.travaUp!==false);
  for(let k=1;k<=n;k++){
    const c=rb31CotaPe(st,k);
    if(up?c>=z-1e-6:c<=z+1e-6)return k;
  }
  if(n<1)return 1;
  const cN=rb31CotaPe(st,n),
    H=+((document.getElementById('rb31H')||{}).value)||10;
  const falta=up?(z-cN):(cN-z);
  return falta>1e-6?n+Math.ceil(falta/H-1e-6):n;
}
function rb31RampasDoEstado(st){
  if(!st)return [];
  if(Array.isArray(st.rampas)&&st.rampas.length)return st.rampas;
  /* migração: deduz as rampas do hist corrente (projetos existentes) */
  const n=+st.banco||0;if(!n){st.rampas=[];return st.rampas;}
  const hist=st.hist||[],ras=[];let cur=null;
  for(let k=1;k<=n;k++){
    const h=hist[k-1]||{};
    const sem=!!h.sem||!!st.semRampa||k<=(+st.semRampaAte||0);
    if(sem){cur=null;continue;}
    const novo=!cur||(k>1&&!h.degrau);
    if(novo){
      const p=h.startP||((k===1&&st.startP)?st.startP:null);
      cur={nome:'Rampa '+(ras.length+1),banco:k,ateBanco:k,
        startP:p?p.slice():null};
      ras.push(cur);
    }else cur.ateBanco=k;
  }
  ras.forEach(r=>{r.ate=rb31CotaPe(st,r.ateBanco);});
  st.rampas=ras;
  return ras;
}
function rb31RampasNormaliza(st){
  const ras=(st.rampas||[]).filter(Boolean);
  ras.sort((a,b)=>(+a.banco||1)-(+b.banco||1));
  /* o teto vem do PLANO (maior ateBanco), não do st.banco corrente: um
     replay interrompido não pode encolher as faixas das rampas */
  const n=Math.max(+st.banco||0,
    ras.length?Math.max(...ras.map(r=>+r.ateBanco||0)):0);
  for(let i=0;i<ras.length;i++){
    const r=ras[i],prox=ras[i+1];
    r.banco=Math.max(1,Math.min(n,+r.banco||1));
    r.ateBanco=Math.max(r.banco,Math.min(+r.ateBanco||r.banco,
      prox?Math.max(r.banco,(+prox.banco||n)-1):n));
    r.ate=rb31CotaPe(st,r.ateBanco);
    r.nome=r.nome||('Rampa '+(i+1));
  }
  st.rampas=ras;
  return ras;
}
function rb31AplicaRampas(){
  const st=rb31EstadoVivo();
  if(!st||!st.banco){toast('Gere a pilha/cava primeiro');return;}
  const ras=rb31RampasNormaliza(st).filter(r=>r.startP);
  /* o ALVO de bancos vem do plano, nunca do estado: um replay que falhou
     no meio deixa st.banco menor e, sem isto, o banco perdido nunca
     voltaria (o plano regeraria só os bancos restantes) */
  const n=Math.max(+st.banco||0,
    ras.length?Math.max(...ras.map(r=>+r.ateBanco||0)):0),plano=[];
  for(let k=1;k<=n;k++){
    const r=ras.find(x=>k>=x.banco&&k<=x.ateBanco);
    if(!r)plano.push({startP:null,degrau:true,sem:true});
    else if(k===r.banco)plano.push({startP:r.startP.slice(),degrau:false});
    else plano.push({startP:null,degrau:true});
  }
  st.hist=plano;
  st.banco=n;
  st._histAlvo=null; /* o plano de rampas é a nova verdade */
  st.semRampa=false;
  st.semRampaAte=ras.length?Math.max(0,ras[0].banco-1):0;
  st.novoInicioP=null;st.novoSoleira=null;
  if(ras.length&&ras[0].banco===1)st.startP=ras[0].startP.slice();
  try{rb31Replay();}catch(e){console.warn('rampas replay',e);}
  rb31AtualizaCorteDerivado();
  try{rb31RampasRender();}catch(e){}
  const stF=rb31EstadoVivo();
  if(stF&&+stF.banco<n){
    const aviso='A bancada '+(+stF.banco+1)+' não pôde ser gerada a partir desse '+
      'ponto (a rampa não coube ali). O plano de rampas foi mantido — '+
      'clique em ◎ e escolha outro ponto na linha-base.';
    toast(aviso);
    const info=document.getElementById('rb31RampasInfo');
    if(info)info.textContent=aviso;
    try{cmdLog('rampas: replay parou no banco '+stF.banco+' de '+n,'avisa');}catch(e){}
  }
}
function rb31LinhaBaseMaisProxima(st,c){
  /* mesmo critério do Reposicionar: limite (banco 1) ou berma anterior */
  const lim=(S.layers||[]).find(x=>x._cavaLimiteDin&&
    String(x.id)===String(st.srcLayerId))||
    (S.layers||[]).find(x=>x._cavaLimiteDin);
  if(!lim||!lim.features[0])return null;
  const f=lim.features[0];
  let ring0=f.multi&&Array.isArray(f.geom[0]&&f.geom[0][0])?f.geom[0]:f.geom;
  ring0=cavaLimpaRing(ring0.map(p=>[p[0],p[1]]));
  const cands=[{banco:1,ring:ring0}];
  const uni=st.lays&&st.lays.uni;
  if(uni)for(let k=2;k<=st.banco;k++){
    const fb=uni.features.find(x=>{const p=x.props||{};return +p.BANCO===k-1&&
      p.BERMA!=null&&p.CLASSE===rb31ClassePartida(st);});
    if(fb&&fb.geom&&fb.geom.length>3)
      cands.push({banco:k,ring:cavaLimpaRing(fb.geom.map(p=>[p[0],p[1]]))});
  }
  const tol=Math.max(8,+((document.getElementById('rb31W')||{}).value||11)*1.5);
  let alvo=null;
  for(const cd of cands){
    const q2=rb31PontoNaCrista(cd.ring,c);
    if(!q2)continue;
    const d=Math.hypot(c[0]-q2.p[0],c[1]-q2.p[1]);
    if(d<=tol*1.4&&(!alvo||d<alvo.d))alvo={...cd,q:q2,d};
  }
  return alvo;
}
function rb31RampaDefinePonto(i){
  const st0=rb31EstadoVivo();
  if(!st0){toast('Gere a pilha/cava primeiro');return;}
  if(typeof switchView==='function'&&S._view!=='map')switchView('map');
  setTool('select');
  const info=document.getElementById('rb31RampasInfo');
  const nome=(st0.rampas&&st0.rampas[i]&&st0.rampas[i].nome)||('rampa '+(i+1));
  if(info)info.textContent='Toque na '+rb31NomeLinhaBase(st0)+
    ' (ou numa berma) onde a '+nome+' deve nascer…';
  rb31CapturaClique(ll=>{
    const st=rb31EstadoVivo();if(!st)return;
    const ras=rb31RampasDoEstado(st),r=ras[i];if(!r)return;
    const c=fromWGS(S.workCRS,ll.lng,ll.lat);
    const alvo=rb31LinhaBaseMaisProxima(st,[c[0],c[1]]);
    if(!alvo){
      toast('Rampa '+((st.travaUp!==false)?
        'ASCENDENTE sai de um PÉ (linha-base de uma bancada)':
        'DESCENDENTE sai de uma CRISTA')+' — toque numa dessas linhas');
      return;
    }
    const cotaFixa=!!r._cotaFixa&&Number.isFinite(+r._cotaSolicitada),
      cotaPedida=cotaFixa?+r._cotaSolicitada:+r.ate,
      bancoCota=Number.isFinite(cotaPedida)?rb31BancoDaCota(st,cotaPedida):null;
    if(cotaFixa&&bancoCota<alvo.banco){
      toast('A cota final '+cotaPedida.toFixed(2)+' m fica antes do ponto escolhido. '+
        'Escolha uma crista/pé anterior ou informe uma cota mais distante.');
      return;
    }
    r.banco=alvo.banco;r.startP=alvo.q.p.slice();
    if(cotaFixa){
      r.ateBanco=bancoCota;r.ate=cotaPedida;
    }else if(!(+r.ate)||bancoCota<alvo.banco){
      r.ateBanco=st.banco;r.ate=rb31CotaPe(st,st.banco);
    }else r.ateBanco=bancoCota;
    try{rb31MarcaInicio(alvo.q.p,alvo.ring,
      (document.getElementById('rb31Dir')||{}).value);}catch(e){}
    rb31AplicaRampas();
    /* O clique conclui o modo bruto: daqui em diante a rampa volta a ser
       paramétrica e acompanha somente o limite controlador. */
    const stFinal=rb31EstadoVivo()||st;
    stFinal._edicaoBruta134=false;
    try{rb31Desenha(stFinal);}catch(e){} /* persiste o fim do modo bruto */
    try{if(typeof rb31LimpaMarcaInicio==='function')rb31LimpaMarcaInicio();}catch(e){}
    const msg=(r.nome||'Rampa')+' nasce no banco '+alvo.banco+
      ' — E '+alvo.q.p[0].toFixed(2)+' · N '+alvo.q.p[1].toFixed(2)+
      (cotaFixa?' · até a cota construtiva '+rb31CotaPe(stFinal,r.ateBanco).toFixed(2)+' m':'');
    if(info)info.textContent=msg;
    toast(msg);
    try{cmdLog(msg,'ok');}catch(e){}
  });
}
function rb31RampaAdd(){
  const st=rb31EstadoVivo();
  if(!st||!st.banco){toast('Gere a pilha/cava primeiro');return;}
  const ras=rb31RampasDoEstado(st),ult=ras[ras.length-1];
  if(ult&&ult.ateBanco>=st.banco){
    toast('A última rampa já chega ao topo — reduza a cota "até" dela para abrir espaço');
    return;
  }
  ras.push({nome:'Rampa '+(ras.length+1),
    banco:ult?Math.min(st.banco,ult.ateBanco+1):1,
    ateBanco:st.banco,ate:rb31CotaPe(st,st.banco),startP:null});
  st.rampas=ras;
  rb31RampasRender();
  rb31RampaDefinePonto(ras.length-1);
}
function rb31RampasRender(){
  const tb=document.getElementById('rb31RampasTbl'),
    info=document.getElementById('rb31RampasInfo');
  if(!tb)return;
  let st=null;try{st=rb31EstadoVivo();}catch(e){}
  if(!st||!st.banco){
    tb.innerHTML='';
    if(info)info.textContent='Gere a pilha/cava (Cava Paramétrica) — as rampas aparecem aqui.';
    return;
  }
  const ras=rb31RampasDoEstado(st),up=(st.travaUp!==false);
  if(info)info.textContent=(st.lays&&st.lays.uni?('Pilha/cava "'+
    (st.lays.uni.name||'')+'" — '):'')+st.banco+' banco(s), '+ras.length+
    ' rampa(s). Rampa '+(up?'ascendente sai de um PÉ':'descendente sai de uma CRISTA')+'.';
  let html='<tr style="text-align:left;border-bottom:1px solid var(--line)">'+
    '<th style="padding:3px 4px">Rampa</th><th>até a cota</th><th>início</th><th></th><th></th></tr>';
  ras.forEach((r,i)=>{
    html+='<tr style="border-bottom:1px dashed var(--line)">'+
      '<td style="padding:3px 4px">'+esc(r.nome||('Rampa '+(i+1)))+
      '<div class="hint" style="margin:0">bancos '+r.banco+'–'+r.ateBanco+'</div></td>'+
      '<td><input type="number" step="1" value="'+(+(+r.ate||0).toFixed(2))+
      '" data-cota="'+i+'" style="width:76px"></td>'+
      '<td style="font-size:11px">'+(r.startP?
        ('E '+(+r.startP[0]).toFixed(1)+'<br>N '+(+r.startP[1]).toFixed(1)):
        '<i>sem ponto</i>')+'</td>'+
      '<td><button class="mini" data-pt="'+i+
      '" title="Clicar no mapa o ponto onde a rampa nasce">◎</button></td>'+
      '<td><button class="mini" data-rm="'+i+
      '" title="Remover a rampa">✕</button></td></tr>';
  });
  tb.innerHTML=html;
  tb.querySelectorAll('[data-cota]').forEach(e=>{e.onchange=()=>{
    const st2=rb31EstadoVivo();if(!st2)return;
    const ras2=rb31RampasDoEstado(st2),r=ras2[+e.dataset.cota];if(!r)return;
    r.ate=+e.value;r.ateBanco=rb31BancoDaCota(st2,r.ate);
    rb31AplicaRampas();
  };});
  tb.querySelectorAll('[data-pt]').forEach(e=>{e.onclick=()=>rb31RampaDefinePonto(+e.dataset.pt);});
  tb.querySelectorAll('[data-rm]').forEach(e=>{e.onclick=()=>{
    const st2=rb31EstadoVivo();if(!st2)return;
    const ras2=rb31RampasDoEstado(st2);ras2.splice(+e.dataset.rm,1);
    st2.rampas=ras2;
    rb31AplicaRampas();
  };});
}
/* ===== CORTE FINAL (painel próprio) ===== */
function rb31CorteFinalPrepara(){
  const sel=document.getElementById('cfMdtSel'),
    nome=document.getElementById('cfNome'),
    info=document.getElementById('rb31CorteFinalInfo');
  if(!sel)return;
  let st=null;try{st=rb31EstadoVivo();}catch(e){}
  const v=sel.value;
  sel.innerHTML='<option value="">— escolha o MDT —</option>'+
    (S.rasters||[]).map(r=>'<option value="'+r.id+'">'+esc(r.name)+'</option>').join('');
  const uni=st&&st.lays&&st.lays.uni;
  /* default = MDT da interseção (painel da cava / receita gravada) */
  const pad=(document.getElementById('cavaMdtSel')||{}).value||
    (uni&&uni._rb31Recipe&&uni._rb31Recipe.par&&uni._rb31Recipe.par.mdt)||'';
  if(v&&[...sel.options].some(o=>String(o.value)===String(v)))sel.value=v;
  else if(pad&&[...sel.options].some(o=>String(o.value)===String(pad)))sel.value=pad;
  else if(S.rasters&&S.rasters.length)sel.value=S.rasters[0].id;
  if(nome&&!String(nome.value||'').trim())
    nome.value=uni?((uni.name||'Cava')+' — corte final'):'';
  if(info)info.textContent=uni?
    ('Pilha/cava "'+(uni.name||'')+'" — o corte usa os anéis atuais e a topografia escolhida.'):
    'Gere a pilha/cava primeiro (Cava Paramétrica).';
}
function rb31CorteFinalExecuta(){
  let st=null;try{st=rb31EstadoVivo();}catch(e){}
  const uni=st&&st.lays&&st.lays.uni;
  if(!uni){toast('Gere a pilha/cava primeiro');return;}
  const rid=(document.getElementById('cfMdtSel')||{}).value,
    R=(S.rasters||[]).find(x=>String(x.id)===String(rid));
  if(!R){toast('Escolha a topografia (MDT) do corte');return;}
  const up=(st.travaUp!==false);
  const q=cavaRecalculaCamadaPeloMdt(uni,R,{up});
  const C=q&&q.layer;
  if(!C){toast('O corte não retornou anéis — confira se o MDT cobre a pilha/cava');return;}
  const nome=String((document.getElementById('cfNome')||{}).value||'').trim();
  if(nome)C.name=nome;
  try{refreshUI();}catch(e){}
  const msg='Corte final gravado em "'+(C.name||'')+'" — topografia '+(R.name||'')+
    '. O corte acompanha a pilha: editar o limite ou as rampas o reaplica.';
  const info=document.getElementById('rb31CorteFinalInfo');
  if(info)info.textContent=msg;
  toast(msg);
  try{cmdLog(msg,'ok');}catch(e){}
}
function rb31Reset(){
  const st=S._rb31;
  /* REINICIAR TEM ESCOPO: apaga UMA pilha/cava — a da camada selecionada na
     árvore, ou a do comando aberto — nunca o projeto inteiro. Antes o reset
     varria TODOS os limites dinâmicos: reiniciar um teste levava junto a
     pilha boa do usuário (aconteceu no projeto Massari de 22/08). */
  const unis=(S.layers||[]).filter(L=>L._rb31Recipe);
  const dins=(S.layers||[]).filter(L=>L._cavaLimiteDin);
  const selecionada=(S.layers||[]).find(L=>String(L.id)===String(S.activeId))||
    (S.selFeat&&S.selFeat.layer)||null;
  /* pilha-alvo: uni selecionada; ou limite selecionado (acha a uni pela
     receita); ou a do estado corrente; ou a única existente */
  let uniAlvo=null, limAlvo=null;
  if(selecionada&&selecionada._rb31Recipe) uniAlvo=selecionada;
  else if(selecionada&&selecionada._cavaLimiteDin){ limAlvo=selecionada;
    uniAlvo=unis.find(u=>String(u._rb31Recipe.srcLayerId)===String(selecionada.id))||null; }
  if(!uniAlvo&&st&&st.lays&&st.lays.uni&&(S.layers||[]).includes(st.lays.uni)) uniAlvo=st.lays.uni;
  if(!uniAlvo&&unis.length===1) uniAlvo=unis[0];
  if(!uniAlvo&&st&&st.layer&&(S.layers||[]).includes(st.layer)) uniAlvo=st.layer;
  if(!uniAlvo&&!limAlvo){
    if(unis.length>1||dins.length>1){
      toast('Há mais de uma cava/pilha no projeto — selecione na árvore a que deve ser reiniciada');
      return;
    }
    if(dins.length===1) limAlvo=dins[0];
  }
  if(!limAlvo&&uniAlvo&&uniAlvo._rb31Recipe)
    limAlvo=dins.find(L=>String(L.id)===String(uniAlvo._rb31Recipe.srcLayerId))||null;
  if(!limAlvo&&st&&st.srcLayerId!=null)
    limAlvo=dins.find(L=>String(L.id)===String(st.srcLayerId))||null;
  const alvos=[];
  if(uniAlvo)alvos.push(uniAlvo);
  /* o estado corrente só entra se pertence à MESMA pilha */
  const doEstado=st&&(!uniAlvo||!st.lays||st.lays.uni===uniAlvo);
  if(doEstado&&st&&st.lays)for(const k of Object.keys(st.lays)){
    const L=st.lays[k];
    if(L&&(S.layers||[]).includes(L)&&!alvos.includes(L))alvos.push(L);
  }
  /* derivados SÓ da pilha-alvo */
  const ids=new Set(alvos.map(L=>String(L.id)));
  (S.layers||[]).forEach(L=>{
    if(ids.has(String(L._rb31CutOf||''))||ids.has(String(L._cavaCutVectorOf||''))||
       ids.has(String(L._cavaMdtCutOf||''))|| /* anéis cortados pelo MDT: sem isto o
         reiniciar deixava as 26 linhas antigas na tela (projeto Massari) */
       ids.has(String(L._cavaRampOf||'')))alvos.push(L);
  });
  /* apenas o limite dinâmico DESTA pilha; o polígono de origem dele volta */
  if(limAlvo){
    const orig=(S.layers||[]).find(x=>String(x.id)===String(limAlvo._cavaLimiteOrig));
    if(orig)orig.visible=true;
    alvos.push(limAlvo);
  }
  if(!alvos.length){ toast('Nada para reiniciar — selecione a camada da cava/pilha'); return; }
  alvos.forEach(L=>{ if((S.layers||[]).includes(L))try{deleteVectorLayer(L);}catch(e){} });
  try{ if(typeof rb31LimpaMarcaInicio==='function')rb31LimpaMarcaInicio(); }catch(e){}
  /* estado fora do S._rb31 que sobrevivia ao reiniciar */
  try{ S._cavaRampStart=null; }catch(e){}
  try{ S._rb31Live=null; }catch(e){}
  if(doEstado){
    const z0=document.getElementById('rb31Z0');if(z0)z0.value='';
    S._rb31=null;
  }
  if(S._rb31&&!(S.layers||[]).some(l=>String(l.id)===String(S._rb31.srcLayerId)))
    S._rb31=null; /* o limite do estado foi apagado: nada a ressuscitar */
  const info=document.getElementById('rb31Info');
  if(info)info.textContent='Pilha/cava reiniciada. Selecione o limite, indique o início e gere a primeira bancada.';
  cavaAtualizaPreview();
  toast('Reiniciado: só a cava/pilha alvo — as demais feições ficaram');
}
function cavaPreviewAbre(){
  cavaAtualizaPreview();
  const m=document.getElementById('cavaPreviewModal');if(m)m.classList.add('on');
}
function cavaPreviewFecha(){
  const m=document.getElementById('cavaPreviewModal');if(m)m.classList.remove('on');
}
(function(){
  const bind=(id,fn)=>{const b=document.getElementById(id);if(b)b.onclick=fn;};
  bind('btnRb31Inicio',rb31Inicio);
  bind('btnRb31Gerar',()=>rb31AcaoComVolta(()=>rb31Gerar(false)));
  bind('btnRb31Berma',()=>rb31AcaoComVolta(()=>rb31OffsetBerma(false)));
  bind('btnRb31Iterar',()=>rb31AcaoComVolta(rb31Iterar));
  bind('btnRb31NovoPonto',rb31NovoPonto);
  bind('btnRb31Eixo',rb31EixoProgressivo);
  bind('btnCavaPreview',cavaPreviewAbre);
  bind('cavaPreviewClose',cavaPreviewFecha);
  bind('btnCavaProgressiva',cavaAbreProgressiva);
  bind('btnCivA',()=>civMarcaPonto('A'));
  bind('btnCivB',()=>civMarcaPonto('B'));
  bind('btnCivAlinha',civAlinha);
  bind('btnCivSaia',civDesenhaSaia);
  bind('btnRb31Cortar',rb31Cortar);
  bind('btnRb31Voltar',rb31Voltar);
  bind('btnRb31Reset',rb31Reset);
  bind('btnRb31SemRampa',rb31LimparRampa);
  bind('btnRb31Reloca',rb31ReposicionaRampa);
  bind('btnRb31RampaAdd',rb31RampaAdd);
  bind('btnRb31RampasLimpar',()=>{rb31LimparRampa();try{rb31RampasRender();}catch(e){}});
  bind('btnRb31RampasReplay',()=>{
    const st=rb31EstadoVivo();
    if(!st){toast('Gere a pilha/cava primeiro');return;}
    rb31RampasDoEstado(st);rb31AplicaRampas();
  });
  bind('btnCorteFinalExec',rb31CorteFinalExecuta);
})();

/* Pré-dimensionamento da cava. Expõe antes da geração as grandezas que antes
   ficavam implícitas no cálculo (profundidade, afastamento, cota final e
   ângulo global) e verifica se o último banco ainda cabe na poligonal. */
function cavaAtualizaPreview(){
  const box=document.getElementById('cavaPreview');if(!box)return;
  const num=id=>parseFloat(String(document.getElementById(id)?.value||'').replace(',','.')),
    rb=S._rb31&&Array.isArray(S._rb31.paramBancos)?S._rb31.paramBancos.filter(p=>p&&p.H>0):[],
    P=cavaProjetoAtual(),D=P&&P.cavaDesign,
    fonte=rb.length?'Rampa por bancada':(D?'Cava bruta gerada':'Parâmetros atuais'),
    planejadoN=Math.round(num('cavaNB')),
    baseN=rb.length?rb.length:(D?Math.max(1,Math.round(+D.n||1)):planejadoN),
    banks=rb.length?rb.map(p=>({
      H:+p.H,ang:+p.ang,B:Number.isFinite(+p.B)?+p.B:0,
      z0:Number.isFinite(+p.zCrista)?+p.zCrista:NaN,z1:Number.isFinite(+p.zPe)?+p.zPe:NaN,
      up:(+p.zPe)>=(+p.zCrista),expand:!!p.fora
    })):Array.from({length:baseN},()=>({
      H:D?+D.H:num('cavaH'),ang:D?+D.ang:num('cavaAng'),B:D?+D.B:num('cavaB'),
      z0:D?+D.z0:num('cavaZ0'),z1:NaN,
      up:D?!!D.up:document.getElementById('cavaSentido')?.value==='up',
      expand:D?D.lado==='outside':document.getElementById('cavaLado')?.value==='outside'
    })),
    n=banks.length,H=banks[0]?.H,ang=banks[0]?.ang,B=banks[0]?.B,
    z0=banks[0]?.z0,
    up=!!banks[0]?.up,expand=!!banks[0]?.expand,
    rampOn=!!document.getElementById('cavaRampa')?.checked,
    grade=num('cavaRampaG'),fmt=(v,d=2)=>Number.isFinite(v)?v.toLocaleString('pt-BR',{
      minimumFractionDigits:d,maximumFractionDigits:d}):'—';
  if(!banks.length||banks.some(b=>!(b.H>0)||!(b.ang>0&&b.ang<90)||!(b.B>=0))||!(n<=200)){
    box.innerHTML='<div class="cava-preview-head"><b>Prévia das bancadas</b></div><div class="cava-preview-status" style="color:var(--sel)"><b>Parâmetros inválidos.</b> Use altura &gt; 0, ângulo entre 1° e 89°, berma ≥ 0 e 1–200 bancadas.</div>';
    return;
  }
  const faceRuns=banks.map(b=>b.H/Math.tan(b.ang*Math.PI/180)),
    depth=banks.reduce((s,b)=>s+b.H,0),
    /* na rampa iterativa a berma gravada conclui a própria iteração; na
       cava paramétrica a última bancada não recebe berma externa */
    horizontal=faceRuns.reduce((s,v)=>s+v,0)+banks.reduce((s,b,i)=>s+(rb.length||i<n-1?b.B:0),0),
    faceRun=faceRuns.reduce((s,v)=>s+v,0)/n,
    globalAng=Math.atan2(depth,Math.max(1e-9,horizontal))*180/Math.PI,
    zf=Number.isFinite(banks[n-1]?.z1)?banks[n-1].z1:(Number.isFinite(z0)?z0+(up?depth:-depth):NaN),
    rampLen=grade>0?depth*100/grade:NaN;
  const ft=document.getElementById('cavaPreviewFonte');
  if(ft)ft.textContent=fonte+' · '+n+' bancada'+(n===1?'':'s');
  let encaixe='',areaTxt='';
  try{
    const item=cavaFonteOriginal(cavaItemSelecionado());
    if(item){
      const ring=cavaLimpaRing(cavaRingWork(item)),a0=Math.abs(cavaArea2(ring))/2,
        sinal=expand?1:-1,
        teste=cavaOffsetSeguro(ring,ring,sinal*horizontal,sinal*horizontal,expand),
        ok=teste.ring&&teste.ring.length>=3,
        a1=ok?Math.abs(cavaArea2(teste.ring))/2:NaN;
      encaixe=ok
        ?'<span style="color:#4fae68"><b>✓ Encaixe preliminar compatível</b> com o limite escolhido.</span>'
        :'<span style="color:var(--sel)"><b>⚠ A última bancada pode não caber</b> no limite escolhido. Reduza bancadas, berma ou altura.</span>';
      areaTxt=`${fmt(a0,0)} → ${fmt(a1,0)} m²`;
    }
  }catch(_){encaixe='<span style="color:var(--amber)">Não foi possível verificar o encaixe da última bancada.</span>';}

  /* Corte esquemático normalizado. A geometria real continua sendo calculada
     pelas rotinas de offset; este SVG serve só para leitura rápida do projeto. */
  /* O viewBox acompanha a proporção real do painel. A escala horizontal e a
     vertical são independentes de propósito: trata-se de um perfil técnico,
     com exagero vertical implícito para ocupar todo o quadro e permanecer
     legível mesmo quando há somente uma bancada. */
  const W=720,SH=360,padL=88,padR=34,padT=50,padB=58,
    usableW=W-padL-padR,usableH=SH-padT-padB,
    totalX=Math.max(...faceRuns,horizontal),totalY=Math.max(...banks.map(b=>b.H),depth),
    sx=usableW/Math.max(totalX,1e-9),sy=usableH/Math.max(totalY,1e-9),
    dirX=expand?-1:1,dirY=up?-1:1,
    x0=expand?W-padR:padL,y0=up?SH-padB:padT;
  let x=x0,y=y0,path=`M ${x.toFixed(2)} ${y.toFixed(2)}`,segments='',benchLabels='';
  for(let i=0;i<n;i++){
    const bi=banks[i],fr=faceRuns[i],nx=x+dirX*fr*sx,ny=y+dirY*bi.H*sy;
    segments+=`<line class="cava-preview-face" x1="${x}" y1="${y}" x2="${nx}" y2="${ny}"/>`;
    path+=` L ${nx.toFixed(2)} ${ny.toFixed(2)}`;x=nx;y=ny;
    if((rb.length||i<n-1)&&bi.B>1e-9){
      const bx=x+dirX*bi.B*sx;
      segments+=`<line class="cava-preview-berm" x1="${x}" y1="${y}" x2="${bx}" y2="${y}"/>`;
      path+=` L ${bx.toFixed(2)} ${y.toFixed(2)}`;x=bx;
    }
    if(n<=10||i===0||i===n-1||i===Math.floor((n-1)/2)){
      benchLabels+=`<text x="${x+dirX*7}" y="${y+(dirY>0?-5:13)}" text-anchor="${dirX>0?'start':'end'}">B${i+1}</text>`;
    }
  }
  const dimX=x0+dirX*horizontal*sx,
    depthX=expand?W-20:20,
    arrowVert=up?'↑ subir':'↓ descer',arrowSide=expand?'← para fora':'→ para dentro';
  let zlabels='';
  if(Number.isFinite(z0)){
    zlabels=`<text class="strong" x="${x0}" y="${y0+(up?16:-10)}" text-anchor="middle">${fmt(z0,1)} m</text>`+
      `<text class="strong" x="${x}" y="${y+(up?-9:16)}" text-anchor="middle">${fmt(zf,1)} m</text>`;
  }
  const svg=`<svg class="cava-preview-svg" viewBox="0 0 ${W} ${SH}" role="img" aria-label="Prévia em corte das bancadas">`+
    `<defs><pattern id="cavaGrid" width="36" height="25" patternUnits="userSpaceOnUse"><path class="cava-preview-grid" d="M 36 0 L 0 0 0 25" fill="none"/></pattern></defs>`+
    `<rect width="${W}" height="${SH}" fill="url(#cavaGrid)" opacity=".55"/>`+
    `<text class="strong" x="18" y="25">CORTE DAS BANCADAS</text>`+
    `<text x="${W-18}" y="25" text-anchor="end">${arrowVert} · ${arrowSide}</text>`+
    `<path class="cava-preview-profile" d="${path}"/>${segments}${benchLabels}${zlabels}`+
    `<line class="cava-preview-dim" x1="${x0}" y1="${SH-30}" x2="${dimX}" y2="${SH-30}"/>`+
    `<text class="strong" x="${(x0+dimX)/2}" y="${SH-10}" text-anchor="middle">afastamento ${fmt(horizontal)} m</text>`+
    `<line class="cava-preview-dim" x1="${depthX}" y1="${y0}" x2="${depthX}" y2="${y}"/>`+
    `<text class="strong" x="${depthX+(expand?-11:11)}" y="${(y0+y)/2}" transform="rotate(-90 ${depthX+(expand?-11:11)} ${(y0+y)/2})" text-anchor="middle">${up?'elevação':'profundidade'} ${fmt(depth)} m</text>`+
    `</svg>`;

  const hMin=Math.min(...banks.map(b=>b.H)),hMax=Math.max(...banks.map(b=>b.H)),
    aMin=Math.min(...banks.map(b=>b.ang)),aMax=Math.max(...banks.map(b=>b.ang)),
    hTxt=Math.abs(hMax-hMin)<1e-9?`H ${fmt(hMin,1)} m`:`H ${fmt(hMin,1)}–${fmt(hMax,1)} m`,
    aTxt=Math.abs(aMax-aMin)<1e-9?`${fmt(aMin,1)}°`:`${fmt(aMin,1)}–${fmt(aMax,1)}°`;
  box.innerHTML=`<div class="cava-preview-head"><b>${fonte}</b><span class="cava-preview-badge">${n} bancada${n===1?'':'s'} · ${hTxt} · ${aTxt}</span></div>`+
    svg+
    `<div class="cava-preview-stats">`+
      `<div class="cava-preview-stat"><small>Avanço médio do talude</small><b>${fmt(faceRun)} m / bancada</b></div>`+
      `<div class="cava-preview-stat"><small>${up?'Elevação':'Profundidade'} total</small><b>${fmt(depth)} m · cota final ${fmt(zf)} m</b></div>`+
      `<div class="cava-preview-stat"><small>Afastamento total</small><b>${fmt(horizontal)} m${areaTxt?' · área '+areaTxt:''}</b></div>`+
      `<div class="cava-preview-stat"><small>Ângulo global aproximado</small><b>${fmt(globalAng,1)}°${rampOn?' · rampa ≥ '+fmt(rampLen)+' m':''}</b></div>`+
    `</div>`+
    `<div class="cava-preview-note">Perfil atualizado pela <b>${fonte.toLowerCase()}</b>. Cada iteração concluída da Rampa por bancada acrescenta exatamente uma bancada; Voltar e Reiniciar também atualizam este corte.</div>`+
    (encaixe?`<div class="cava-preview-status">${encaixe}</div>`:'');
}

function cavaParametrosSync(){
  cavaAtualizaPreview();
  const P=cavaProjetoAtual();
  if(!P||!P.cavaDesign)return;
  const D=P.cavaDesign,num=id=>parseFloat(String(document.getElementById(id)?.value||'').replace(',','.'));
  const H=num('cavaH'),B=num('cavaB'),ang=num('cavaAng'),n=Math.round(num('cavaNB'));
  if(!(H>0)||!(B>=0)||!(ang>0&&ang<90)||!(n>=1&&n<=200))return;
  D.H=H;D.B=B;D.ang=ang;D.n=n;
  D.up=document.getElementById('cavaSentido')?.value==='up';
  D.lado=document.getElementById('cavaLado')?.value||'inside';
  D.rasterId=document.getElementById('cavaMdtSel')?.value||D.rasterId;
  D.autoZ=!!document.getElementById('cavaAutoZ')?.checked;
  D.autoZRef=document.getElementById('cavaAutoZRef')?.value==='min'?'min':'max';
  D.linhaUnica=!!document.getElementById('cavaLinhaUnica')?.checked;
  D.roundStep=Math.max(.1,num('cavaRound')||5);D.z0=num('cavaZ0');
  const fonte=cavaResolverFonte(D);if(!fonte)return;
  clearTimeout(S._cavaParamTimer);
  S._cavaParamTimer=setTimeout(()=>{
    try{cavaGerar({item:fonte,params:D,replaceLayer:P,silent:true});}
    catch(e){console.warn('parâmetros da cava',e);}
  },180);
}

function cavaGerar(cfg={}){
  let item=cavaFonteOriginal(cfg.item||cavaItemSelecionado()); if(!item){toast('Selecione ou escolha um polígono fechado para a cava');return;}
  let ring=cavaLimpaRing(cavaRingWork(item)); if(ring.length<3){toast('O limite da cava é inválido');return;}
  const P=cfg.params||null,el=id=>document.getElementById(id);
  const rid=P?P.rasterId:el('cavaMdtSel').value;
  const R=(S.rasters||[]).find(x=>String(x.id)===String(rid)),g=R&&R.d;
  if(!g){toast('Escolha um MDT associado para posicionar o limite superior');return;}
  const ext=cavaExtremosZ(ring,g),autoZ=P?P.autoZ!==false:!!el('cavaAutoZ').checked,
    autoZRef=P?(P.autoZRef==='min'?'min':'max'):(el('cavaAutoZRef')?.value==='min'?'min':'max'),
    roundStep=Math.max(.1,P?+(P.roundStep||5):+(el('cavaRound').value||5));
  let z0=P&&!autoZ?+P.z0:parseFloat(String(el('cavaZ0').value).replace(',','.'));
  if(autoZ)z0=cavaArredondaCota(autoZRef==='min'?ext.min:ext.max,roundStep,autoZRef);
  if(!Number.isFinite(z0)){toast('Informe a cota inicial ou escolha um MDT válido');return;}
  /* Projeto novo: primeiro materializa a cópia nomeada. A geometria e os
     atributos da referência não recebem cota nem qualquer outra mutação. */
  if(!P&&!cfg.replaceLayer&&!item.L._cavaLimiteDin){
    const din=cavaLimiteDinamico(item,z0);
    if(!din){toast('Não foi possível criar o limite paramétrico');return;}
    item=din;ring=cavaLimpaRing(cavaRingWork(item));
  }
  const sourceLimitId=cavaIdFonte(item,true);
  cavaGravaCotaLimite(item,z0);
  if(!P&&el('cavaZ0'))el('cavaZ0').value=+z0.toFixed(3);
  const H=P?+P.H:+el('cavaH').value,B=P?+P.B:+el('cavaB').value,
    ang=P?+P.ang:+el('cavaAng').value,
    n=Math.max(1,Math.min(200,Math.round(P?+P.n:+el('cavaNB').value))),
    up=P?!!P.up:el('cavaSentido').value==='up',
    lado=P?(P.lado||'inside'):el('cavaLado').value,
    /* A prévia nunca é recortada: o MDT associado serve para calcular a
       interseção. O corte cirúrgico das linhas ocorre somente no comando
       final, preservando tanto a cava bruta quanto o MDT. */
    cortar=false,calcularIntersecao=!!g,
    /* A cava SEMPRE acompanha o limite. Isto já foi um campo opcional; virou
       invariante porque uma cava exibida com o limite já editado é um desenho
       mentiroso — quem olha a tela não tem como saber que está desatualizada. */
    live=true,
    linhaUnica=P?!!P.linhaUnica:!!el('cavaLinhaUnica')?.checked,
    ramp=P?.ramp||{on:el('cavaRampa').checked&&!!S._cavaRampStart,width:+el('cavaRampaW').value,grade:+el('cavaRampaG').value,
      dir:el('cavaRampaDir').value,
      landing:0,
      switchback:!!el('cavaRampaSwitch')?.checked,
      switchEvery:Math.max(1,Math.round(+(el('cavaRampaSwitchN')?.value||1))),
      endMode:el('cavaRampaFimModo')?.value==='cota'?'elevation':'final',
      endZ:parseFloat(String(el('cavaRampaFimZ')?.value||'').replace(',','.')),
      start:S._cavaRampStart?S._cavaRampStart.slice():null};
  if(!(H>0&&B>=0&&ang>0&&ang<90&&Number.isFinite(n))){toast('Revise altura, berma, ângulo e quantidade de bancos');return;}
  if(ramp.on&&(!(ramp.width>0)||!(ramp.grade>0&&ramp.grade<=30))){toast('Revise largura e gradiente da rampa');return;}
  const expand=lado==='outside',sgn=expand?1:-1,dz=up?H:-H,run=H/Math.tan(ang*Math.PI/180);
  /* O limite fornecido é sempre o limite SUPERIOR: ao descer ele é a crista
     do primeiro talude; ao subir ele é o pé. Cada banco nasce com o talude e
     só então recebe a berma, sem a ambiguidade do antigo “tipo inicial”. */
  let kind=up?'toe':'crest',elev=z0,cur=ring.slice(),offsetTotal=0,
    linhas=[{kind,bench:0,ring:cur,z:elev,tipo:'limite-superior'}],warn='',
    depths=[0];
  const passo=(tipo,banco)=>{
    const dist=sgn*(tipo==='face'?run:B);offsetTotal+=dist;
    const res=cavaOffsetSeguro(ring,cur,dist,offsetTotal,expand),next=res.ring;
    if(next.length<3){
      warn=`O limite não comporta geometricamente o banco ${banco} com H ${H} m, berma ${B} m e ${ang}°.`;
      return false;
    }
    cur=next;kind=kind==='toe'?'crest':'toe';if(tipo==='face')elev+=dz;
    linhas.push({kind,bench:banco,ring:cur,z:elev,tipo});
    depths.push(Math.abs(offsetTotal));return true;
  };
  for(let i=0;i<n;i++){
    if(!passo('face',i+1))break;
    if(i<n-1&&B>1e-7&&!passo('berm',i+1))break;
  }
  const bancosGerados=linhas.reduce((s,q)=>s+(q.tipo==='face'?1:0),0);
  if(bancosGerados!==n){
    const msg=`Não foi possível manter os ${n} bancos determinados com esta geometria.`;
    /* Durante o arraste, uma configuração intermediária inválida não pode
       apagar bancos da tela. Conserva a última versão completa e só troca a
       camada quando todos os bancos estiverem novamente válidos. */
    if(cfg.replaceLayer){
      if(!cfg.silent)toast(`${msg} Mantida a última cava completa.`);
      return cfg.replaceLayer;
    }
    toast(`${msg} Ajuste o limite, a altura, a berma ou o ângulo.`);
    return null;
  }
  /* Nunca deduz uma exclusão pela ausência de uma linha na camada anterior.
     Uma atualização intermediária inválida, um recorte da rampa ou uma
     versão antiga pode não conter todos os anéis; interpretar isso como
     exclusão manual fazia bancadas inteiras desaparecerem no arraste. */
  const alvoPrev=cfg.replaceLayer||(S.layers||[]).find(q=>q.cavaDesign&&(
      (sourceLimitId&&String(q.cavaDesign.sourceLimitId||'')===sourceLimitId)||
      (String(q.cavaDesign.sourceLayer)===String(item.L.id)&&
       +q.cavaDesign.sourceFeature===+item.i)))||null;
  let omit=null;
  if(cfg.liveEdit&&alvoPrev&&alvoPrev.cavaDesign&&!linhaUnica&&
     alvoPrev.cavaDesign.omitidosExplicitos===true){
    const prev=alvoPrev.cavaDesign;
    omit=new Set((prev.omitidos||[]).map(Number));
  }
  const omitidos=omit&&omit.size?omit:null;
  /* AJUSTE CONGELADO: um anel editado à mão entra AQUI, depois que toda a
     família já foi calculada a partir do limite. Como os anéis internos
     foram gerados a partir do anel ORIGINAL, eles não se mexem — é isso
     que faz a berma entre o anel editado e o de baixo mudar de largura,
     em vez de a cava inteira deslizar junto. */
  const ovr=(cfg.params&&cfg.params.overrides)||
    (cfg.replaceLayer&&cfg.replaceLayer.cavaDesign&&cfg.replaceLayer.cavaDesign.overrides)||null;
  if(ovr){
    Object.keys(ovr).forEach(k=>{
      const li=+k,anel=ovr[k];
      if(!linhas[li]||!Array.isArray(anel)||anel.length<3)return;
      linhas[li]={...linhas[li],ring:anel.map(q=>[q[0],q[1]]),manual:true};
    });
  }
  /* FRONTEIRA CONGELADA: recalcula primeiro a família completa para validar
     o novo limite externo e, só então, restaura exatamente todos os anéis
     que estavam geometricamente para dentro da linha escolhida. */
  const frozen=(cfg.params&&cfg.params.frozenRings)||
    (cfg.replaceLayer&&cfg.replaceLayer.cavaDesign&&cfg.replaceLayer.cavaDesign.frozenRings)||null,
    freezeRingIndex=(cfg.params&&cfg.params.freezeRingIndex)!=null?+cfg.params.freezeRingIndex:
      +(cfg.replaceLayer&&cfg.replaceLayer.cavaDesign&&cfg.replaceLayer.cavaDesign.freezeRingIndex);
  if(frozen){
    Object.keys(frozen).forEach(k=>{
      const li=+k,anel=frozen[k];
      if(!linhas[li]||!Array.isArray(anel)||anel.length<3)return;
      linhas[li]={...linhas[li],ring:anel.map(q=>[q[0],q[1]]),frozen:true};
    });
  }
  /* A rampa só existe depois de um ponto de partida explicitamente indicado.
     Ativar o checkbox ou alterar parâmetros não escolhe um início automático. */
  if(ramp.on&&!ramp.start)ramp.on=false;
  /* Referência geométrica única e explícita:
     - PILHA (up): cada trecho parte do PÉ e o acompanha longitudinalmente;
     - CAVA  (down): cada trecho parte da CRISTA e a acompanha.
     O afastamento transversal até a linha oposta vem da própria face
     H/tan(ângulo), sem deslocar globalmente os anéis da cava/pilha. */
  const controleRampa=up?'toe':'crest',
    rampPlan=cavaRampaPlano(linhas,{...ramp,H,dz,berm:B,start:ramp.start,
      control:controleRampa,faceAngle:ang});
  rampPlan.acoplado=false;rampPlan.control=controleRampa;
  if(rampPlan.invalid){
    const msg=rampPlan.warn||'Rampa recusada: ângulo da face ou largura fora do projeto.';
    if(cfg.replaceLayer){if(!cfg.silent)toast(msg+' Mantida a última cava/pilha válida.');return cfg.replaceLayer;}
    toast(msg);return null;
  }
  if(rampPlan.warn)warn=warn?warn+' '+rampPlan.warn:rampPlan.warn;
  /* Calcula antes de materializar as feições. A rotina injeta nos anéis os
     nós exatos terreno × crista/pé; assim as linhas desenhadas abaixo já
     nascem com os mesmos vértices usados pela interseção. */
  const mostraInter=(()=>{const e2=document.getElementById('cavaShowInter');return !e2||e2.checked;})(),
    intersecoesCava=(calcularIntersecao&&mostraInter)?cavaIntersecaoSuperficies(linhas,g,H,up):[];
  if(calcularIntersecao&&mostraInter){
    const auditoria=cavaAuditaIntersecao(intersecoesCava,linhas,g);
    if(!auditoria.ok){
      const msg=`Interseção rejeitada: ${auditoria.faltantes.length} encontro(s) com crista/pé não foram cobertos.`;
      if(cfg.replaceLayer){if(!cfg.silent)toast(msg+' Mantida a última cava completa.');return cfg.replaceLayer;}
      toast(msg+' Revise o limite ou o MDT.');return null;
    }
  }
  const feats=[];
  for(let li=0;li<linhas.length;li++){
    const ln=linhas[li],tolZ=Math.max(.01,Math.abs(H)*1e-5),
      /* Um banco só pode ser aberto pelo trecho da rampa que realmente
         alcança a sua cota. Aplicar todas as pistas a todos os anéis gerava
         cortes fantasma, linhas soltas e chegadas "voando" em 3D. */
      pistasNaCota=(rampPlan.clipPolygons||rampPlan.polygons||[]).filter(p=>{
        if(rampPlan.acoplado)return true;
        const zz=(p.zg||[]).filter(Number.isFinite);if(!zz.length)return false;
        const lo=Math.min(...zz),hi=Math.max(...zz);
        return ln.z>=lo-tolZ&&ln.z<=hi+tolZ;
      }),
      /* A rampa é uma obra independente sobre a geometria já calculada da
         cava. Ela só mascara/recorta o trecho que ocupa; nunca substitui os
         vértices dos anéis nem recalcula seus offsets. Assim permanecem
         invariáveis o ângulo do talude e a largura da berma, como no desenho
         construtivo de referência. */
      partes=cavaRecortaAnelPelasRampas(ln.ring,pistasNaCota,
        Math.max(.12,Math.min(.35,(ramp.width||5)/20)));
    /* o anel continua sendo CALCULADO (os de dentro dependem dele);
       apenas não é mais desenhado */
    if(omitidos&&omitidos.has(li))continue;
    for(const base of partes){
      if(base.length<2)continue;
      const geom=base.map(p=>p.slice());
      const nf={geom,multi:false,zg:geom.map(()=>ln.z),props:{
        TIPO:ln.bench===0?'Limite superior':(ln.kind==='toe'?'Pé de banco':'Crista de banco'),
        BANCO:ln.bench,COTA:+ln.z.toFixed(3),ALTURA:H,BERMA:B,ANGULO:ang,CLASSE:'cava-bruta'}};
      nf._ringIx=li;                      /* carimbo p/ apurar exclusões */
      feats.push(nf);
    }
  }
  /* A interseção acompanha a geometria da cava durante a edição. A camada
     derivada é substituída por inteiro a cada ciclo, portanto não conserva
     segmentos antigos nem cria feições duplicadas. */
  intersecoesCava.forEach(s=>feats.push({
    geom:s.geom,multi:false,zg:s.zg,props:{TIPO:'Interseção cava × terreno',
      BANCO:linhas.at(-1).bench,COTA:null,ALTURA:H,BERMA:B,ANGULO:ang,CLASSE:'daylight',
      METODO:'superfície por anéis × MDT'}}));
  const rampFeats=rampPlan.features,
    rampContornos=rampPlan.polygons.map((p,i)=>({
      geom:p.geom.map(q=>q.slice()),multi:false,zg:(p.zg||[]).slice(),props:{
        TIPO:'Rampa — contorno',BANCO:i+1,COTA:null,ALTURA:H,BERMA:ramp.width,
        ANGULO:ramp.grade,CLASSE:'rampa'}})),
    rampCurvas=rampFeats.filter(f=>/curva de nível|eixo/i.test(String(f.props?.TIPO||'')))
      .map(f=>({geom:f.geom.map(q=>q.slice()),multi:false,zg:(f.zg||[]).slice(),
        props:{...(f.props||{}),CLASSE:'rampa'}}));
  /* A pista fica como um único contorno fechado por trecho no layer da cava.
     As duas bordas separadas continuam somente como breaklines internas do
     MDT; não são desenhadas, evitando pontas soltas e travessas cruzadas. */
  feats.push(...rampContornos,...rampCurvas);
  cavaSoldaIntersecaoAneis(feats,Math.max(1e-8,(g.cs||1)*1e-8));
  const featsLimpas=cavaFeatsSemDuplicar(feats);
  feats.length=0;feats.push(...featsLimpas);
  if(!feats.length){toast('A cava não intercepta o MDT com esses parâmetros');return;}
  /* opção: toda a cava numa ÚNICA feição (multi-linha) — um objeto só
     p/ exportar/manipular */
  if(linhaUnica&&feats.length>1){
    const geoms=[],zgs=[],partProps=[];
    for(const f2 of feats){
      const rs=(f2.multi&&Array.isArray(f2.geom[0]&&f2.geom[0][0]))?f2.geom:[f2.geom],
        zs=(f2.multi&&Array.isArray(f2.geom[0]&&f2.geom[0][0]))?(f2.zg||rs.map(()=>null)):[f2.zg||null];
      rs.forEach((r2,ri)=>{geoms.push(r2);zgs.push(zs[ri]||r2.map(()=>null));
        partProps.push({...f2.props});});
    }
    const p0=feats[0].props||{};
    feats.length=0;
    feats.push({geom:geoms,multi:true,zg:zgs,props:{TIPO:'Cava completa (linha única)',
      BANCO:null,COTA:null,ALTURA:p0.ALTURA??null,BERMA:p0.BERMA??null,
      ANGULO:p0.ANGULO??null,CLASSE:'cava-unica'},_partProps:partProps});
  }
  const fields=[{name:'TIPO',type:'C',length:35},{name:'BANCO',type:'N',length:6,decimal:0},{name:'COTA',type:'N',length:14,decimal:3},
      {name:'ALTURA',type:'N',length:10,decimal:2},{name:'BERMA',type:'N',length:10,decimal:2},
      {name:'ANGULO',type:'N',length:8,decimal:2},{name:'CLASSE',type:'C',length:15},
      {name:'METODO',type:'C',length:40}];
  let L=cfg.replaceLayer;
  if(!L){
    L=(S.layers||[]).find(q=>q.cavaDesign&&(
      (sourceLimitId&&String(q.cavaDesign.sourceLimitId||'')===sourceLimitId)||
      (String(q.cavaDesign.sourceLayer)===String(item.L.id)&&
       +q.cavaDesign.sourceFeature===+item.i)))||null;
  }
  if(L){L.features=feats;L.fields=fields;drawLayer(L);}
  else L=addLayer({sourceLayer:item.L,name:'Cava bruta + interseção com o MDT',gtype:'line',crs:S.workCRS,features:feats,fields,color:'#c35d18'});
  /* Mantém as linhas analíticas COMPLETAS como cava bruta. Elas funcionam
     como breaklines; somente o comando final interpola e apara a superfície
     no encontro exato com o MDT. */
  const rampLayerId=L.cavaDesign&&L.cavaDesign.rampLayerId||null;
  const projectId=(L.cavaDesign&&L.cavaDesign.projectId)||cavaNovoId('cava');
  L.cavaDesign={version:11,projectId,sourceLayer:item.L.id,sourceFeature:item.i,sourceLimitId,rasterId:R?R.id:null,z0,H,B,ang,n,up,
    lado,cortar,autoZ,autoZRef,roundStep,live,linhaUnica,
    ramp:{...ramp,start:ramp.start?ramp.start.slice():null},sourceHash:cavaGeomHash(item),
    rampLayerId,
    overrides:ovr?JSON.parse(JSON.stringify(ovr)):null,
    freezeRingIndex:Number.isFinite(freezeRingIndex)?freezeRingIndex:null,
    frozenRings:frozen?JSON.parse(JSON.stringify(frozen)):null,
    omitidos:omitidos?[...omitidos]:null,
    omitidosExplicitos:!!(omitidos&&alvoPrev?.cavaDesign?.omitidosExplicitos),
    rings:linhas.map(x=>({ring:x.ring.map(p=>[p[0],p[1]]),z:x.z,kind:x.kind,
      bench:x.bench,tipo:x.tipo||'base'})),
    /* O MDT recebe apenas pares borda interna/externa. As transições fecham
       graficamente cada perna, mas não podem virar uma superfície entre dois
       trechos separados pelo vão operacional. */
    rampLines:rampFeats.filter(f=>/borda/i.test(String(f.props?.TIPO||'')))
      .map(f=>({geom:f.geom.map(p=>[p[0],p[1]]),zg:(f.zg||[]).slice(),
        tipo:(f.props||{}).TIPO||'Rampa'}))};
  cavaV02AplicaLinhas(L,'TIPO',up);
  drawLayer(L);
  S._cavaProjectId=L.id;
  cavaRampaAtualizaPoligono(L,rampPlan);
  cavaRampaAtualizaLinhasEdicao();
  if(!cfg.replaceLayer&&el('cavaOcultarBase').checked){item.L.visible=false;drawLayer(item.L);}
  refreshUI();
  const out=document.getElementById('cavaOut');
  if(out)out.innerHTML=`<b>${feats.length}</b> linha(s) 3D geradas · limite superior <b>${z0.toFixed(2)} m</b>`+
    (autoZ?(autoZRef==='min'
      ?` (mínima ${ext.min.toFixed(2)} m, arredondada para baixo em ${roundStep} m)`
      :` (máxima ${ext.max.toFixed(2)} m, arredondada para cima em ${roundStep} m)`):' (cota manual)')+
    `<br>${n} banco(s) · ${up?'up':'down'} · ${lado} · H ${H} m · berma ${B} m · ${ang}°`+
    (ramp.on?`<br>Rampa poligonal ${ramp.width} m · ${ramp.grade}% · ${ramp.dir==='cw'?'horária':'anti-horária'}`+
      `${ramp.landing?` · patamar ${ramp.landing} m`:''}`+
      `${ramp.switchback?` · switchback a cada ${ramp.switchEvery||1} banco(s)`:''}`+
      `${ramp.endMode==='elevation'&&Number.isFinite(+ramp.endZ)?` · até a cota ${(+ramp.endZ).toFixed(2)} m`:' · até o último banco'}`+
      (rampPlan.faceAudit?`<br>Face auditada: seção normal <b>${rampPlan.faceAudit.faceMedian.toFixed(2)}°</b>`+
        ` (alvo ${rampPlan.faceAudit.targetAngle.toFixed(2)}°) · controle <b>${controleRampa==='toe'?'pé':'crista'}</b>`:''):'')+
    (omitidos?`<br><b>${omitidos.size}</b> linha(s) apagada(s) por você seguem ocultas (o anel continua valendo no cálculo).`:'')+
    (R?`<br>Interseção <b>superfície completa por anéis × MDT ${esc(R.name)}</b>`:'')+
    `<br><b>Prévia:</b> cava bruta editável; nenhum raster foi cortado.`+
    (warn?`<br><span style="color:var(--amber)">${esc(warn)}</span>`:'');
  cavaAtualizaPreview();
  if(!cfg.silent)toast(cfg.replaceLayer?'Cava bruta e interseção atualizadas':'Cava bruta + interseção geradas; use Cortar cava somente ao finalizar');
  return L;
}
/* A COTA É CALCULADA MESMO SEM O TEXTO INFORMATIVO NA TELA.
   Bug real: a caixa #cavaCotaInfo foi retirada do painel numa entrega
   anterior e esta função abria com `if(!box)return` — com isso TODO o
   cálculo morria na primeira linha e o campo "Cota do limite superior"
   ficava vazio ao escolher o MDT. Agora o cálculo vem primeiro e o texto
   é apenas um destino opcional. */
function cavaAtualizaCotaInfo(){
  const box=document.getElementById('cavaCotaInfo');
  const escreve=t=>{ if(box) box.innerHTML=t; };
  const item=cavaItemSelecionado(),rid=document.getElementById('cavaMdtSel')?.value;
  const R=(S.rasters||[]).find(x=>String(x.id)===String(rid)),
    auto=document.getElementById('cavaAutoZ'),z=document.getElementById('cavaZ0'),
    ref=document.getElementById('cavaAutoZRef'),refModo=ref?.value==='min'?'min':'max',
    passo=Math.max(.1,parseFloat(String(document.getElementById('cavaRound')?.value||5).replace(',','.'))||5);
  if(z)z.readOnly=!!(auto&&auto.checked);
  if(ref)ref.disabled=!!auto&&!auto.checked;
  if(!item||!R){
    escreve('Escolha um limite superior e um MDT para calcular a cota construtiva.');
    if(z&&auto?.checked)z.value='';
    cavaAtualizaPreview();
    return;
  }
  try{
    const ex=cavaExtremosZ(cavaRingWork(item),R.d);
    const base=refModo==='min'?ex.min:ex.max,
      coroa=cavaArredondaCota(base,passo,refModo),
      rotulo=refModo==='min'?'mais baixa':'mais alta',
      direcao=refModo==='min'?'inferior':'superior';
    if(z&&auto?.checked&&Number.isFinite(coroa))z.value=+coroa.toFixed(3);
    escreve(Number.isFinite(ex.max)
      ?`MDT <b>${esc(R.name)}</b>: mínima <b>${ex.min.toFixed(2)} m</b> · máxima <b>${ex.max.toFixed(2)} m</b>`+
       `${Number.isFinite(ex.vertexMax)?` · maior vértice <b>${ex.vertexMax.toFixed(2)} m</b>`:''}.<br>`+
       `Referência ${rotulo}: <b>${coroa.toFixed(2)} m</b> (múltiplo ${direcao} de ${passo} m).`
      :'O limite não possui células válidas nesse MDT.');
  }catch(e){escreve('Não foi possível amostrar o MDT dentro desse limite.');}
  cavaAtualizaPreview();
}
function cavaAtualizaCaminhoInfo(){
  const box=document.getElementById('cavaCaminhoInfo');if(!box)return;
  const ref=document.getElementById('cavaAutoZRef')?.value==='min'?'min':'max',
    up=document.getElementById('cavaSentido')?.value==='up',
    lado=document.getElementById('cavaLado')?.value||'inside',
    tipico=(ref==='max'&&!up&&lado==='inside')||(ref==='min'&&up&&lado==='outside'),
    arred=ref==='max'?'para cima':'para baixo',
    esperado=ref==='max'?'Down + Inside':'Up + Outside';
  box.classList.toggle('cava-path-ok',tipico);box.classList.toggle('cava-path-custom',!tipico);
  box.innerHTML='<b>Configuração única do motor v2</b><br>'+ 
    `${ref==='max'?'máxima':'mínima'} arredondada ${arred} · <b>${up?'Up':'Down'}</b> · <b>${lado==='outside'?'Outside':'Inside'}</b>.`+
    (tipico?'<br><span style="color:#4fae68">✓ Combinação construtiva típica.</span>':
      `<br><span style="color:var(--amber)">Combinação especial; o padrão usual para esta referência é ${esperado}, mas a escolha atual será respeitada.</span>`);
}
/* Reconstrói o estado a partir da RECEITA gravada na camada, quando o comando
   já foi fechado. Sem isto, arrastar o limite depois de sair do comando (ou de
   ter ido desenhar outra coisa) não refazia a pilha. */
function rb31EstadoDaReceita(alvoUni){
  const alvo=alvoUni||(S.layers||[]).find(x=>x._rb31Recipe&&x._rb31Recipe.banco>0);
  if(!alvo||!alvo._rb31Recipe||!(alvo._rb31Recipe.banco>0))return null;
  const r=alvo._rb31Recipe, el=id=>document.getElementById(id);
  const set=(id,v)=>{const e=el(id);if(e&&v!=null&&v===v)e.value=v;};
  set('rb31Ang',r.par&&r.par.ang); set('rb31H',r.par&&r.par.H);
  set('rb31B',r.par&&r.par.B);     set('rb31W',r.par&&r.par.W);
  set('rb31G',r.par&&r.par.grade); set('rb31Dir',r.par&&r.par.dir);
  if(r.par&&r.par.mdt)set('cavaMdtSel',r.par.mdt);
  const st=rb31Estado();
  st.srcLayerId=r.srcLayerId; st.srcFeatIdx=r.srcFeatIdx;
  st.banco=r.banco; st.fase=r.fase||'crista'; st.eixoOn=!!r.eixoOn;
  st.startP=r.startP?r.startP.slice():null;
  st.hist=(r.hist||[]).map(h=>({startP:h.startP?h.startP.slice():null,degrau:!!h.degrau,sem:!!h.sem}));
  st.rampas=Array.isArray(r.rampas)?r.rampas.map(q=>({...q,startP:q.startP?q.startP.slice():null})):null;
  st._histAlvo=Array.isArray(r.histAlvo)?r.histAlvo.map(h=>({startP:h.startP?h.startP.slice():null,
    degrau:!!h.degrau,sem:!!h.sem})):null;
  st.semRampa=!!r.semRampa;
  st.semRampaAte=+r.semRampaAte||0;
  if(r.travaFora!==undefined){st.travaFora=!!r.travaFora;st.travaUp=!!r.travaUp;
    try{const sl=document.getElementById('cavaLado'),sv=document.getElementById('cavaSentido');
      if(sl)sl.value=st.travaFora?'outside':'inside';
      if(sv)sv.value=st.travaUp?'up':'down';}catch(e){}}
  /* o campo de nome mostra a feição corrente */
  try{const Ls=(S.layers||[]).find(x=>String(x.id)===String(r.srcLayerId));
    const ne=document.getElementById('rb31NomeLim');
    if(ne&&Ls&&!ne.value)ne.value=Ls.name;}catch(e){}
  st.lays=st.lays||{}; st.lays.uni=alvo;
  /* eixo/interseção são derivados e serão recalculados no redesenho; não os
     reinsere no estado construtivo para evitar duplicação na retomada. */
  st.feats=(alvo.features||[])
    .filter(f=>!f.props||!['rb31-eixo','rb31-inter','rb31-inicio'].includes(f.props.CLASSE))
    .map(f=>({geom:f.geom,multi:f.multi,zg:f.zg,props:f.props}));
  const rt=r.runtime||{},cp=p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])?
      [+p[0],+p[1]]:null,
    cg=g=>Array.isArray(g)?g.map(cp).filter(Boolean):null;
  st.z=Number.isFinite(+rt.z)?+rt.z:(r.z0!=null?+r.z0:st.z);
  st.zPe=Number.isFinite(+rt.zPe)?+rt.zPe:null;
  st.fora=rt.fora!==undefined?!!rt.fora:st.travaFora;
  st.up=rt.up!==undefined?!!rt.up:st.travaUp;
  st.crista=cg(rt.crista);st.pe=cg(rt.pe);st.peNatural=cg(rt.peNatural);
  st.peBerma=cg(rt.peBerma);st.ultimaRampaA=cg(rt.ultimaRampaA);
  st.ultimaRampaB=cg(rt.ultimaRampaB);
  st.pFim=cp(rt.pFim);st.pFimB=cp(rt.pFimB);st.pFimDir=cp(rt.pFimDir);
  st.proxIniA=cp(rt.proxIniA);st.proxIniB=cp(rt.proxIniB);
  st.paramBancos=Array.isArray(rt.paramBancos)?rt.paramBancos.map(q=>({...q})):[];
  st.eixos=Array.isArray(rt.eixos)?rt.eixos.map(cg).filter(Boolean):[];
  /* Compatibilidade com receitas anteriores ao estado operacional: recupera
     a linha corrente e as pontas das rampas diretamente da camada. */
  const atuais=st.feats.filter(f=>f&&f.props&&+f.props.BANCO===+st.banco),
    anel=f=>cg(f&&f.geom),cota=f=>Number.isFinite(+(f&&f.props&&f.props.COTA))?+f.props.COTA:null;
  if(st.fase==='pe'){
    const fPe=atuais.filter(f=>f.props.BERMA==null&&
      (f.props.CLASSE==='rb31-pe'||f.props.CLASSE==='rb31-crista')).pop();
    if(!st.pe&&fPe)st.pe=anel(fPe);
    if(st.zPe==null&&fPe)st.zPe=cota(fPe);
    const ramps=atuais.filter(f=>f.props.CLASSE==='rb31-rampa'),
      ext=ramps.find(f=>/externa/i.test(String(f.props.TIPO||'')))||ramps[0],
      int=ramps.find(f=>/interna/i.test(String(f.props.TIPO||'')))||ramps[1],
      ge=anel(ext),gi=anel(int);
    if(!st.ultimaRampaA&&ge)st.ultimaRampaA=ge.map(p=>p.slice());
    if(!st.ultimaRampaB&&gi)st.ultimaRampaB=gi.map(p=>p.slice());
    if(!st.pFim&&ge&&ge.length)st.pFim=ge.at(-1).slice();
    if(!st.pFimB&&gi&&gi.length)st.pFimB=gi.at(-1).slice();
    if(!st.pFimDir&&ge&&ge.length>1){const a=ge.at(-2),b=ge.at(-1),dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy)||1;st.pFimDir=[dx/d,dy/d];}
  }else{
    const fCr=atuais.filter(f=>f.props.BERMA!=null&&f.props.CLASSE==='rb31-crista').pop();
    if(!st.crista&&fCr)st.crista=anel(fCr);
    const zc=cota(fCr);if(zc!=null)st.z=zc;
  }
  return st;
}
function rb31LiveSync(op){
  let st=S._rb31;
  /* MULTI-PILHA: se a camada editada é um limite dinâmico de OUTRA pilha
     (continuação em alteamento), o estado religa na pilha DELA — sem isto
     toda edição regenerava só a primeira pilha do projeto */
  try{
    const Led=op&&op.sourceLayer;
    if(Led&&Led._cavaLimiteDin){
      const candidatas=(S.layers||[]).filter(x=>x&&x._rb31Recipe&&x._rb31Recipe.banco>0&&
        String(x._rb31Recipe.srcLayerId)===String(Led.id)),
        uniAtual=st&&st.lays&&st.lays.uni,
        /* Se o estado ainda aponta para a camada removida/substituída antes
           de salvar ou reabrir, a receita mais nova fica no fim da lista.
           Conservar o objeto órfão fazia apenas as bancadas antigas
           acompanharem o limite, embora todas compartilhassem o mesmo id de
           origem. */
        uniEd=(uniAtual&&candidatas.includes(uniAtual))?uniAtual:
          (candidatas.length?candidatas[candidatas.length-1]:null),
        desconectado=!!uniEd&&(!st||String(st.srcLayerId)!==String(Led.id)||
          !st.lays||st.lays.uni!==uniEd||!(S.layers||[]).includes(st.lays.uni));
      if(desconectado){
        const st2=rb31EstadoDaReceita(uniEd);
        /* Não basta trocar a variável local: rb31Replay lê S._rb31. Esta
           atribuição é o vínculo que faltava para as feições acrescentadas
           depois da reabertura entrarem no mesmo replay paramétrico. */
        if(st2){st=st2;S._rb31=st2;}
      }
    }
  }catch(e){}
  if(!st||!st.banco||st.srcLayerId==null){
    try{ st=rb31EstadoDaReceita(); }catch(e){ st=null; }
    if(!st||!st.banco||st.srcLayerId==null)return;
  }
  const L=(S.layers||[]).find(x=>String(x.id)===String(st.srcLayerId)),
    f=L&&L.features&&L.features[st.srcFeatIdx];
  if(!L||!f)return;
  let h='';try{h=cavaGeomHash({f});}catch(e){return;}
  if(h===st.srcHash)return;
  st.srcHash=h;
  clearTimeout(S._rb31LiveT);
  S._rb31LiveT=setTimeout(()=>{
    try{
      rb31Replay();
      /* o estado passa a valer com o limite JA editado: o proximo Voltar
         desfaz a edicao seguinte, e assim por diante ate o original */
      const st2=S._rb31;
      if(st2&&f&&f.geom)st2.srcGeom=f.geom.map(p=>p.slice());
    }catch(e){console.warn('rb31 live',e);}
  },120);
}
/* refaz do zero todas as bancadas já geradas com o limite editado —
   sem resquícios: o estado é reconstruído por inteiro */
function rb31Replay(){
  const st=S._rb31;if(!st||!st.banco)return;
  /* durante o replay o rb31Gerar roda com banco 0 — a checagem de
     CONTINUAÇÃO não pode disparar aqui (recursão infinita) */
  window.__rb31EmReplay=(window.__rb31EmReplay||0)+1;
  try{
  /* ALVO DE BANCOS: se um arraste passou por uma posição onde a bancada
     não coube, o replay truncava o estado e a receita gravava a pilha
     menor PARA SEMPRE (a "última berma sumiu" no projeto Massari). O
     plano completo fica guardado; quando o limite volta a comportar, a
     bancada volta sozinha. */
  const histBase=(Array.isArray(st._histAlvo)&&st._histAlvo.length>(st.hist||[]).length)?
    st._histAlvo:(st.hist||[]);
  const n=Math.max(st.banco,histBase.length),faseFinal=st.fase,startP=st.startP,
    lays=st.lays,srcL=st.srcLayerId,srcF=st.srcFeatIdx,srcH=st.srcHash,
    eixoOn=!!st.eixoOn,undoPilha=st.undoPilha||null,srcGeom=st.srcGeom||null,

    hist=histBase.map(h=>({startP:h.startP?h.startP.slice():null,degrau:h.degrau,sem:!!h.sem}));
  S._rb31={fase:'crista',banco:0,crista:null,z:null,zPe:null,pe:null,
    startP,pFim:null,feats:[],layer:null,lays,srcLayerId:srcL,
    srcFeatIdx:srcF,srcHash:srcH,eixos:[],hist:[],novoInicioP:null,
    eixoOn,undoPilha,srcGeom,
    /* as TRAVAS de lado/vertical viajam com o replay: sem isto, arrastar o
       limite com o painel em Inside regenerava a pilha para dentro */
    travaFora:st.travaFora,travaUp:st.travaUp,semRampa:!!st.semRampa,
    semRampaAte:+st.semRampaAte||0,
    rampas:Array.isArray(st.rampas)?st.rampas.map(r=>({...r,
      startP:r.startP?r.startP.slice():null})):null};
  for(let k=1;k<=n;k++){
    /* reproduz a escolha original: bancada iniciada "em outro ponto"
       volta a nascer no MESMO ponto clicado */
    const h=hist[k-1];
    if(h&&k>1&&!h.degrau&&h.startP)S._rb31.novoInicioP=h.startP.slice();
    S._rb31._semEste=!!(h&&h.sem); /* plano de rampas: banco sem corredor */
    if(!rb31Gerar(true))break;
    if(k<n||faseFinal==='crista'){if(!rb31OffsetBerma(true))break;}
  }
  if(S._rb31&&S._rb31.banco<n){
    S._rb31._histAlvo=hist.map(h=>({startP:h.startP?h.startP.slice():null,
      degrau:h.degrau,sem:!!h.sem}));
    try{
      if(window.__rb31AvisoTrunc!==S._rb31.banco){
        window.__rb31AvisoTrunc=S._rb31.banco;
        toast('A bancada '+(S._rb31.banco+1)+' não coube com o limite nesta posição — ela volta sozinha quando o espaço abrir.');
      }
    }catch(e){}
  }else if(S._rb31){S._rb31._histAlvo=null;window.__rb31AvisoTrunc=null;}
  try{rb31AuditaCompletude(S._rb31,'regeneração');}catch(e){}
  /* linha de centro ligada acompanha (o rb31Desenha final já a recalcula
     na camada única — basta garantir um redesenho com o estado completo) */
  if(eixoOn)try{rb31Desenha(S._rb31);}catch(e){}
  /* o CORTE derivado acompanha SEMPRE — mas com FÔLEGO: recalcular o corte
     no MDT a cada frame do arraste travava o gesto por segundos. No máximo
     um recálculo a cada 1,5 s durante o arraste, e um recálculo final
     agendado garante que o último estado nunca fica para trás. */
  try{
    const ag=Date.now();
    if(!window.__rb31CorteT0||ag-window.__rb31CorteT0>1500){
      window.__rb31CorteT0=ag;
      rb31AtualizaCorteDerivado();
    }else{
      clearTimeout(window.__rb31CorteTm);
      window.__rb31CorteTm=setTimeout(()=>{
        window.__rb31CorteT0=Date.now();
        try{rb31AtualizaCorteDerivado();}catch(e){}
      },900);
    }
  }catch(e){}
  }finally{ window.__rb31EmReplay--; }
}
/* O hash sozinho não basta para projetos gravados por builds antigos: uma
   falha no meio do arraste podia salvar o hash do limite novo junto com os
   anéis anteriores. Confere também a geometria materializada do primeiro
   anel. A comparação é por distância aos segmentos, portanto continua
   válida quando a interseção com o MDT apenas acrescenta vértices ao anel. */
function cavaLimiteProjetoDivergiu(d,item){
  try{
    const fonte=cavaLimpaRing(cavaRingWork(item)),
      salvo=cavaLimpaRing(cavaAnelSemFecho(d&&d.rings&&d.rings[0]?.ring));
    if(fonte.length<3||salvo.length<3)return true;
    const a0=Math.abs(cavaArea2(fonte)),a1=Math.abs(cavaArea2(salvo)),
      tol=.08; /* 8 cm: muito menor que uma berma, maior que ruído numérico */
    if(Math.abs(a0-a1)>Math.max(.02,Math.max(a0,a1)*1e-7))return true;
    const passo=(a,b)=>{
      const salto=Math.max(1,Math.floor(a.length/240));
      for(let i=0;i<a.length;i+=salto)if(cavaDistAoAnel(a[i],b)>tol)return true;
      return false;
    };
    return passo(fonte,salvo)||passo(salvo,fonte);
  }catch(_){return true;}
}
function cavaLiveSync(op={}){
  try{rb31LiveSync(op);}catch(e){}
  if(op===true)op={immediate:true,force:true};
  if(S._cavaLiveBusy){
    /* Não descarta o evento final: conserva a solicitação mais recente e a
       executa assim que a transação corrente terminar. */
    S._cavaLivePending={...(S._cavaLivePending||{}),...op,immediate:true,force:true};
    return;
  }
  /* Uma linha intermediária promovida a controladora desloca o limite
     superior por correspondência de comprimento ao longo do anel. Depois o
     projeto inteiro é reconstruído pela receita, sem editar pés/cristas
     derivados isoladamente. */
  (S.layers||[]).forEach(C=>{if(C._cavaControl)cavaPropagaLinhaControladora(C);});
  // Editing an ordinary feature must not create a mining recipe identifier.
  const source=op&&op.sourceFeature;
  const origem=source&&(source._cavaLimitId||source.props?._ALAGIS_CAVA_LIMIT_ID)||null;
  const jobs=[];
  (S.layers||[]).forEach(L=>{
    const d=L.cavaDesign;if(!d)return;
    const item=cavaResolverFonte(d);if(!item)return;
    if(source&&(origem?String(d.sourceLimitId||'')!==String(origem):item.f!==source))return;
    const hash=cavaGeomHash(item);
    if(hash&&(op.force||hash!==d.sourceHash||cavaLimiteProjetoDivergiu(d,item)))jobs.push({L});
  });
  if(!jobs.length)return;
  clearTimeout(S._cavaLiveTimer);
  S._cavaLiveTimer=setTimeout(()=>{
    if(S._cavaLiveBusy){S._cavaLivePending={...op,immediate:true,force:true};return;}
    S._cavaLiveBusy=true;
    let falhou=false;
    try{jobs.forEach(j=>{
      /* Releia tudo somente na hora de executar. Durante o debounce o
         usuário pode mover outro vértice, e um item/hash capturado antes
         representaria uma posição intermediária do arraste. */
      const d=j.L&&j.L.cavaDesign;if(!d)return;
      const item=cavaResolverFonte(d);if(!item)return;
      const hash=cavaGeomHash(item);
      if(!hash||(!op.force&&hash===d.sourceHash&&!cavaLimiteProjetoDivergiu(d,item)))return;
      try{
        /* TRANSAÇÃO: não grave o hash antes de cavaGerar concluir. O código
           anterior fazia isso e, quando uma forma intermediária não
           comportava todos os bancos, mantinha as linhas antigas mas
           marcava o novo limite como já processado. A cava então parava de
           acompanhar o limite. cavaGerar só troca features e sourceHash
           depois de validar a família completa. */
        cavaGerar({item,params:d,replaceLayer:j.L,silent:true,liveEdit:true});
        /* A PROVA da transação é o sourceHash: cavaGerar só o grava depois de
           validar a família inteira, e desiste sem gravar quando a forma
           intermediária não comporta os bancos. A comparação geométrica com o
           limite NÃO serve aqui — com rampa ligada o primeiro anel se afasta
           do limite de propósito (a cava se abre em volta da rampa, até a
           largura dela), então ela acusava falha em TODA atualização com
           rampa: o usuário via "posição intermediária inválida" com a cava
           correta na tela, e os derivados nunca eram refeitos. Ela continua
           valendo como GATILHO, lá na montagem dos jobs, que é onde detecta
           projeto salvo por versão antiga. */
        const confirmado=j.L.cavaDesign&&j.L.cavaDesign.sourceHash;
        if(confirmado!==hash)falhou=true;
        else cavaAtualizaDerivados(j.L, op);
      }catch(e){
        falhou=true;console.error('Atualização dinâmica da cava:',e);
      }
    });}
    catch(e){falhou=true;console.error('Atualização dinâmica da cava:',e);}
    finally{
      S._cavaLiveBusy=false;
      const pend=S._cavaLivePending;S._cavaLivePending=null;
      if(pend)setTimeout(()=>cavaLiveSync({...pend,immediate:true,force:true}),0);
    }
    if(falhou)toast('Posição intermediária inválida: mantida a última cava completa; continue ajustando o limite');
  },op.immediate?0:180);
}
/* DERIVADOS DA CAVA (corte pela interseção e MDT cortado).
   A cava já acompanhava o limite, mas o produto CORTADO ficava para trás:
   depois de "Gerar cava cortada", mexer no limite refazia os bancos e deixava
   a camada cortada com a forma antiga por cima — o desenho mais confiável da
   tela era justamente o desatualizado. Refazer o corte VETORIAL é barato e
   acontece ao soltar o arraste (não a cada quadro, para o arraste seguir
   fluido). O MDT cortado é caro e pode envolver gravação em disco, então ele
   não é refeito sozinho: é MARCADO como desatualizado, para ninguém o
   confundir com o vigente. */
function cavaAtualizaDerivados(L, op){
  if(!L) return;
  const cortada=(S.layers||[]).find(q=>String(q._cavaCutVectorOf||'')===String(L.id));
  if(cortada && op && op.force){
    try{ cavaCortarLinhas(L); }
    catch(e){ console.warn('recorte derivado da cava',e); }
  }
  const rasCorte=(S.rasters||[]).filter(r=>String(r._cavaCutLayer||'')===String(L.id));
  rasCorte.forEach(r=>{
    r._cavaCutStale=true;
    if(!/desatualizado/i.test(r.name)) r.name=r.name+' (desatualizado — limite mudou)';
  });
  if(rasCorte.length){
    try{ cmdLog('MDT cortado ficou desatualizado: o limite mudou — refaça "Cortar MDT"','avisa'); }catch(e){}
  }
}
function cavaProjetoAtual(){
  const A=(typeof activeLayer==='function')?activeLayer():null;
  if(A&&A.cavaDesign){S._cavaProjectId=A.id;return A;}
  if(S.selFeat&&S.selFeat.layer){
    const SL=S.selFeat.layer;
    if(SL.cavaDesign){S._cavaProjectId=SL.id;return SL;}
    const sf=SL.features&&SL.features[S.selFeat.idx],sid=sf&&cavaIdFonte({L:SL,f:sf,i:S.selFeat.idx},false);
    const ligada=sid&&[...(S.layers||[])].reverse().find(q=>q.cavaDesign&&String(q.cavaDesign.sourceLimitId||'')===sid);
    if(ligada){S._cavaProjectId=ligada.id;return ligada;}
  }
  if(A){
    const candidatas=[...(S.layers||[])].reverse().filter(L=>L.cavaDesign&&String(L.cavaDesign.sourceLayer)===String(A.id));
    if(candidatas.length===1){S._cavaProjectId=candidatas[0].id;return candidatas[0];}
  }
  const mem=(S.layers||[]).find(L=>String(L.id)===String(S._cavaProjectId)&&L.cavaDesign);
  if(mem)return mem;
  const ult=[...(S.layers||[])].reverse().find(L=>L.cavaDesign)||null;
  if(ult)S._cavaProjectId=ult.id;
  return ult;
}
function cavaCarregaPainelProjetoAtual(){
  const L=cavaProjetoAtual(),D=L&&L.cavaDesign;if(!D)return;
  const el=id=>document.getElementById(id),set=(id,v)=>{const e=el(id);if(e&&v!=null)e.value=v;};
  const fonte=cavaResolverFonte(D);
  const base=el('cavaBaseSel'),baseId=`${D.sourceLayer}:${D.sourceFeature}`;
  if(base&&[...base.options].some(o=>o.value===baseId))base.value=baseId;
  const mdt=el('cavaMdtSel');if(mdt&&[...mdt.options].some(o=>String(o.value)===String(D.rasterId)))mdt.value=D.rasterId;
  set('cavaZ0',D.z0);set('cavaNB',D.n);set('cavaH',D.H);set('cavaAng',D.ang);
  set('cavaB',D.B);set('cavaRound',D.roundStep);set('cavaSentido',D.up?'up':'down');
  set('cavaLado',D.lado||'inside');set('cavaAutoZRef',D.autoZRef==='min'?'min':'max');
  const checks={cavaAutoZ:D.autoZ!==false,cavaLive:D.live!==false,cavaLinhaUnica:!!D.linhaUnica};
  Object.entries(checks).forEach(([id,v])=>{const e=el(id);if(e)e.checked=v;});
  const vinc=el('cavaVinculoInfo');
  if(vinc)vinc.innerHTML=fonte
    ?`<b>Cava ativa:</b> ${esc(L.name)}<br><b>Limite vinculado:</b> ${esc(fonte.L.name)} · feição ${fonte.i+1}`+
      `<br><span style="color:#4fae68">✓ vínculo persistente ${esc(String(D.sourceLimitId||'').slice(0,18))}…</span>`
    :`<span style="color:var(--amber)">O limite vinculado não foi encontrado. Selecione novamente a feição de origem.</span>`;
  try{cavaAtualizaCotaInfo();cavaAtualizaPreview();}catch(_){ }
  try{cavaAtualizaCaminhoInfo();}catch(_){ }
}
function cavaGridDisplay(full){
  if(full.nc*full.nr<=RASTER_MAX_CELLS)return full;
  const f=Math.max(2,Math.ceil(Math.sqrt((full.nc*full.nr)/RASTER_MAX_CELLS)));
  const d=hReamostraGrid(full,f);
  d._W0=full.nc;d._H0=full.nr;d._full=full;d.native=false;
  return d;
}
async function cavaGravaParRasters(original,recortado,baseNome,ds){
  const nome0=projectSafeName(baseNome,'.tif');
  const nomeC=projectSafeName(baseNome+'_c','.tif');
  /* Cortar é uma operação de modelagem, não uma ordem de exportação. Sem
     pasta de trabalho previamente configurada, mantém os dois produtos em
     memória e não dispara download nem seletor de destino. */
  if(!ds)return {ds:null,nome0,nomeC,saved:false};
  showLoad('Gravando MDT original em resolução nativa…');
  let b0=gridParaGeoTIFF(original,S.workCRS,-9999);
  await projectWrite(ds.rasters,nome0,new Blob([b0],{type:'image/tiff'}));
  b0=null;
  await respira();
  showLoad('Gravando MDT cortado em resolução nativa…');
  let bc=gridParaGeoTIFF(recortado,S.workCRS,-9999);
  await projectWrite(ds.rasters,nomeC,new Blob([bc],{type:'image/tiff'}));
  bc=null;
  return {ds,nome0,nomeC,saved:true};
}
async function cavaCortarMDT(){
  const bt=document.getElementById('btnCavaCortar'),out=document.getElementById('cavaOut');
  const L=cavaProjetoAtual();
  if(!L||!L.cavaDesign){
    toast('Gere ou selecione primeiro a camada da cava automática');return;
  }
  const D=L.cavaDesign,R=(S.rasters||[]).find(r=>String(r.id)===String(D.rasterId));
  if(!R){
    toast('O MDT associado à cava não está disponível');return;
  }
  bt.disabled=true;
  try{
    /* Nunca pede destino ao cortar. Usa silenciosamente a pasta já associada
       ao projeto; sem ela, o MDT _c continua disponível em memória. */
    const ds=await projectDirs(false);
    showLoad('Carregando a resolução nativa do MDT…');
    const original=await gridBruto(R,'cortar e consolidar a cava');
    if(!original)throw new Error('grade nativa do MDT não disponível');
    if(original===R.d&&R.d.resampled>1&&!R.d._full)
      throw new Error('indique o GeoTIFF original; o corte não será gravado usando a grade reduzida da tela');
    if(original.nc*original.nr>FULL_MAX_CELLS)
      throw new Error(`a grade nativa tem ${(original.nc*original.nr/1e6).toFixed(1)} milhões de células; reduza ou recorte o MDT antes`);

    showLoad('Projetando bancos e rampa sobre o MDT nativo…');
    const projeto=await tinCavaToGrid(L,original.cs,{
      terrain:original,unlimited:true,forceCut:true
    });
    if(!projeto||!projeto.valid)throw new Error('a cava não intercepta o MDT com os parâmetros atuais');

    const csy=original.csy||original.cs,ztop=original.yll+original.nr*csy;
    const z=new Float32Array(original.z),xmin=projeto.xll,xmax=projeto.xll+projeto.nc*projeto.cs,
      ymin=projeto.yll,ymax=projeto.yll+projeto.nr*(projeto.csy||projeto.cs);
    const c0=Math.max(0,Math.floor((xmin-original.xll)/original.cs)-2),
      c1=Math.min(original.nc-1,Math.ceil((xmax-original.xll)/original.cs)+2),
      r0=Math.max(0,Math.floor((ztop-ymax)/csy)-2),
      r1=Math.min(original.nr-1,Math.ceil((ztop-ymin)/csy)+2);
    let alteradas=0,deltaMax=0;
    for(let r=r0;r<=r1;r++){
      if((r&127)===0){
        showLoad(`Cortando cava no MDT — ${Math.round(100*(r-r0+1)/Math.max(1,r1-r0+1))}%`);
        await respira();
      }
      const y=ztop-(r+.5)*csy,off=r*original.nc;
      for(let c=c0;c<=c1;c++){
        const x=original.xll+(c+.5)*original.cs,cv=sampleZbil(projeto,x,y);
        if(!Number.isFinite(cv))continue;
        const ov=original.z[off+c];if(!Number.isFinite(ov))continue;
        /* O raster da cava já foi aparado na igualdade projeto × terreno.
           Min/max é uma segunda trava: corte nunca cria aterro e cava ascendente
           nunca escava inadvertidamente o MDT original. */
        const nv=D.up?Math.max(ov,cv):Math.min(ov,cv);
        if(Math.abs(nv-ov)>1e-5){z[off+c]=nv;alteradas++;deltaMax=Math.max(deltaMax,Math.abs(nv-ov));}
      }
    }
    if(!alteradas)throw new Error('nenhuma célula foi cortada; confira sentido up/down e posição do limite');

    const full={nc:original.nc,nr:original.nr,cs:original.cs,csy:original.csy,
      xll:original.xll,yll:original.yll,z,native:true};
    const base=(R.name||'MDT').replace(/_c(?:_\\d+)?$/i,'');
    const salvo=await cavaGravaParRasters(original,full,base,ds);
    const nome=base+'_c';
    let rc=(S.rasters||[]).find(q=>q._cavaCutSource===R.id&&q._cavaCutLayer===L.id);
    const dTela=cavaGridDisplay(full);
    if(rc){
      if(rc.overlay){try{map.removeLayer(rc.overlay);}catch(e){}}
      rc.name=nome;rc.d=dTela;rc.style={...(R.style||{mode:'hipso_hs',opacity:.8})};
      rc.visible=true;rc._st=null;rc._url=null;
    }else{
      rc={id:rid++,name,d:dTela,style:{...(R.style||{mode:'hipso_hs',opacity:.8})},
        visible:true,overlay:null,_cavaCutSource:R.id,_cavaCutLayer:L.id};
      S.rasters.push(rc);placeProductAbove(rc,R);
    }
    if(salvo.saved){
      R.projectFile='ALAGIS/rasters/'+salvo.nome0;R.projectSavedAt=new Date().toISOString();
      rc.projectFile='ALAGIS/rasters/'+salvo.nomeC;rc.projectSavedAt=new Date().toISOString();
    }else{
      delete rc.projectFile;delete rc.projectSavedAt;
    }
    rc.src={file:salvo.nomeC,size:full.z.byteLength,at:new Date().toISOString(),
      generated:'cava-cut',original:R.name};
    rc._v3={papel:'projeto',cor:(L.sym&&L.sym.color)||L.color||'#4f8b3a'};
    R.visible=false;if(R.overlay){try{map.removeLayer(R.overlay);}catch(e){}}
    renderRaster(rc);S.selRaster=rc;S.activeId=null;
    if(salvo.ds)await projectWriteCatalog(salvo.ds);
    refreshUI();
    try{if(rc.overlay&&rc.overlay.getBounds)safeFit(rc.overlay.getBounds());}catch(e){}
    out.innerHTML=`<b>MDT consolidado: ${esc(nome)}</b><br>`+
      `${alteradas.toLocaleString('pt-BR')} célula(s) cortada(s) · profundidade máxima ${deltaMax.toFixed(2)} m.<br>`+
      (salvo.saved
        ?`Arquivos <b>${esc(salvo.nome0)}</b> e <b>${esc(salvo.nomeC)}</b> gravados em ALAGIS/rasters.`
        :`Resultado <b>${esc(salvo.nomeC)}</b> criado em memória, sem abrir janela para salvar.`);
    toast('✅ Cava cortada: MDT original preservado e '+nome+' gerado');
  }catch(e){
    console.error('Cortar cava:',e);
    if(out)out.innerHTML=`<span style="color:var(--sel)"><b>Não foi possível cortar a cava.</b><br>${esc(e.message||e)}</span>`;
    toast('Falha ao cortar a cava: '+(e.message||e));
  }finally{hideLoad();bt.disabled=false;}
}
function cavaCortarLinhas(alvo){
  const out=document.getElementById('cavaOut'),L=alvo||cavaProjetoAtual();
  if(!L||!L.cavaDesign){
    toast('Gere ou selecione primeiro a camada da cava automática');return;
  }
  const D=L.cavaDesign,R=(S.rasters||[]).find(r=>String(r.id)===String(D.rasterId)),g=R&&R.d;
  if(!g){toast('O MDT associado à cava não está disponível');return;}
  const inter=[],rec=[];
  for(const f0 of L.features||[]){
    /* “Linha única” é uma MultiLineString. O recortador trabalha numa linha
       por vez; expande as partes preservando cotas e atributos analíticos,
       corta cada uma e, ao final, recompõe um único objeto se solicitado. */
    const multi=!!(f0.multi&&Array.isArray(f0.geom?.[0]?.[0])),
      partes=multi?(f0.geom||[]).map((geom,i)=>({geom,multi:false,
        zg:Array.isArray(f0.zg?.[i])?f0.zg[i]:[],
      props:{...(f0._partProps?.[i]||f0.props||{})}})):[f0];
    for(const f of partes){
      const tipo=String(f.props?.TIPO||'');
      if(tipo==='Interseção cava × terreno'){
        inter.push({geom:(f.geom||[]).map(p=>p.slice()),multi:false,zg:(f.zg||[]).slice(),
          props:{...(f.props||{}),CLASSE:'cava-cortada'}});
        continue;
      }
      cavaRecortaFeicaoNoMdt(f,g,!!D.up,Math.max(.2,Math.min(.75,g.cs||.5))).forEach(q=>{
        let len=0;for(let i=1;i<q.geom.length;i++)len+=Math.hypot(
          q.geom[i][0]-q.geom[i-1][0],q.geom[i][1]-q.geom[i-1][1]);
        if(len>Math.max(.05,(g.cs||1)*.1))rec.push(q);
      });
    }
  }
  cavaForcaExtremosNaIntersecao(rec,inter,g);
  cavaSoldaRecorteNaIntersecao(rec,inter,g);
  let feats=cavaFeatsSemDuplicar(rec.concat(inter));
  cavaSoldaIntersecaoAneis(feats,Math.max(1e-8,(g.cs||1)*1e-8));
  {
    const q=cavaRecortaAneisNaIntersecao(feats,!!D.up);
    if(q.recortadas)feats=cavaFeatsSemDuplicar(q.feats);
  }
  if(!rec.length){
    if(out)out.innerHTML='<span style="color:var(--sel)"><b>Nenhuma linha ficou dentro da interseção.</b><br>Confira o sentido up/down e o MDT associado.</span>';
    toast('Nenhuma linha da cava pôde ser cortada pela interseção');return;
  }
  if(D.linhaUnica&&feats.length){
    const todas=feats;
    feats=[{geom:todas.map(f=>f.geom.map(p=>p.slice())),multi:true,
      zg:todas.map(f=>(f.zg||[]).slice()),
      props:{TIPO:'Cava cortada (linha única)',BANCO:null,COTA:null,
        ALTURA:D.H,BERMA:D.B,ANGULO:D.ang,CLASSE:'cava-unica-cortada'},
      _partProps:todas.map(f=>({...f.props}))}];
  }
  let C=(S.layers||[]).find(q=>String(q._cavaCutVectorOf||'')===String(L.id));
  if(C){
    C.features=feats;C.fields=(L.fields||[]).map(x=>({...x}));C.visible=true;
  }else{
    const ativa=S.activeId;
    C=addLayer({sourceLayer:L,name:'Cava cortada pela interseção',gtype:'line',crs:L.crs||S.workCRS,
      features:feats,fields:(L.fields||[]).map(x=>({...x})),color:'#111111'});
    C._cavaCutVectorOf=L.id;C.groupId=L.groupId||null;S.activeId=ativa;
  }
  C._cavaCutVectorOf=L.id;C._cavaSource=L.id;C._cavaCutMode='daylight';
  C.groupId=L.groupId||C.groupId||null;
  cavaV02AplicaLinhas(C,'TIPO',!!D.up);
  const ci=S.layers.indexOf(C);if(ci>=0)S.layers.splice(ci,1);
  const li=S.layers.indexOf(L);S.layers.splice(Math.max(0,li),0,C);
  /* A rampa preenchida vive em um layer poligonal próprio. Recorta suas
     peças com o mesmo MDT e cria uma derivada, em vez de deixar os polígonos
     brutos inteiros sobre a cava já cortada. */
  const RP=(S.layers||[]).find(q=>
    String(q.id)===String(D.rampLayerId||'')||
    String(q._cavaRampOf||'')===String(L.id));
  let rampRec=[],RC=null;
  if(RP){
    for(const f of RP.features||[])
      rampRec.push(...cavaRecortaPoligonoNoMdt(f,g,!!D.up,
        Math.max(.2,Math.min(.75,g.cs||.5))));
    RC=(S.layers||[]).find(q=>String(q._cavaCutRampOf||'')===String(L.id));
    if(rampRec.length){
      if(RC){RC.features=rampRec;RC.visible=true;}
      else{
        const ativa=S.activeId;
        RC=addLayer({sourceLayer:RP,name:'Rampa cortada pela interseção',gtype:'polygon',
          crs:RP.crs||L.crs||S.workCRS,features:rampRec,
          fields:(RP.fields||[]).map(x=>({...x})),color:'#7b3fd4'});
        RC._cavaCutRampOf=L.id;RC.groupId=L.groupId||RP.groupId||null;S.activeId=ativa;
      }
      RC._cavaCutRampOf=L.id;RC._cavaSource=L.id;
      cavaV02AplicaPoligono(RC);
      const ri=S.layers.indexOf(RC);if(ri>=0)S.layers.splice(ri,1);
      const ci2=S.layers.indexOf(C);S.layers.splice(Math.max(0,ci2+1),0,RC);
      drawLayer(RC);
    }else if(RC){RC.features=[];RC.visible=false;drawLayer(RC);}
    /* Preserva a pista bruta para edição/desfazer, mas ela não pode continuar
       desenhando as partes que acabaram de ser eliminadas pelo corte. */
    RP.visible=false;drawLayer(RP);
  }
  /* O mesmo vale para as linhas brutas: ficam preservadas no projeto, porém
     desligadas. Na tela permanece exclusivamente o produto cirúrgico. */
  L.visible=false;drawLayer(L);
  drawLayer(C);S.activeId=C.id;S.selFeat=null;refreshUI();
  if(out)out.innerHTML=`<b>Cava vetorial cortada pela interseção.</b><br>`+
    `${rec.length} trecho(s) construtivo(s) + ${inter.length} trecho(s) de interseção`+
    `${RP?` + ${rampRec.length} peça(s) da rampa`:''}.<br>`+
    `Tudo que ficou além do terreno foi removido do produto final. A cava bruta, a rampa bruta e o MDT <b>${esc(R.name)}</b> foram preservados, porém desligados.`;
  toast('✅ Cava e rampa cortadas integralmente pela interseção');
}
function cavaContinuar(){
  const L=cavaProjetoAtual(),out=document.getElementById('cavaOut');
  if(!L||!L.cavaDesign){toast('Gere ou selecione primeiro a cava que deseja continuar');return;}
  const D=L.cavaDesign,mais=Math.max(1,Math.round(+(document.getElementById('cavaContinuarN')?.value||1))),
    fonte=cavaResolverFonte(D);
  if(!fonte){toast('O limite superior que controla esta cava não foi encontrado');return;}
  D.n=Math.min(200,Math.max(1,+D.n||1)+mais);
  const nb=document.getElementById('cavaNB');if(nb)nb.value=D.n;
  const nova=cavaGerar({item:fonte,params:D,replaceLayer:L});
  if(nova&&out)out.insertAdjacentHTML('beforeend',
    `<br><b>Cava continuada:</b> +${mais} banco(s), total ${D.n}.`);
}
function cavaLimpar(){
  const L=cavaProjetoAtual();
  if(!L||!L.cavaDesign){toast('Selecione a cava que deseja limpar');return;}
  clearTimeout(S._cavaRampParamTimer);
  S._cavaRampStart=null;
  cavaRampaRemoveMarcadorInicio();
  const rampChk=document.getElementById('cavaRampa'),
    rampBox=document.getElementById('cavaRampaBox'),
    rampInfo=document.getElementById('cavaRampaInicioInfo');
  if(rampChk)rampChk.checked=false;
  if(rampBox)rampBox.style.display='none';
  if(rampInfo)rampInfo.textContent='Nenhum início definido. Ative a rampa e indique um novo ponto quando desejar.';
  const D=L.cavaDesign,
    fonte=cavaResolverFonte(D),
    src=fonte?.L||(S.layers||[]).find(x=>String(x.id)===String(D.sourceLayer)),
    apagar=(S.layers||[]).filter(x=>x===L||
      String(x._cavaRampOf||'')===String(L.id)||
      String(x._cavaCutVectorOf||'')===String(L.id)||
      String(x._cavaFreezeOf||'')===String(L.id)||
      String(x._cavaControl?.projectId||'')===String(L.id));
  for(const q of apagar){
    const i=S.layers.indexOf(q);
    if(i>=0){
      undoPush({t:'layer',L:q,idx:i});
      try{if(q.llayer)map.removeLayer(q.llayer);}catch(e){}
      S.layers.splice(i,1);
    }
  }
  /* Um MDT _c pertence ao resultado consolidado dessa cava. Limpar volta ao
     estado de projeto anterior ao corte, mas nunca remove o MDT original. */
  const cortes=(S.rasters||[]).filter(r=>String(r._cavaCutLayer||'')===String(L.id));
  for(const r of cortes)deleteRaster(r);
  if(src){
    src.visible=true;drawLayer(src);S.activeId=src.id;
    const ix=fonte?.L===src?fonte.i:
      Math.max(0,Math.min(+D.sourceFeature||0,(src.features||[]).length-1));
    S.selFeat=src.features?.[ix]?{layer:src,layerId:src.id,idx:ix}:null;
  }else{S.activeId=null;S.selFeat=null;}
  clearVertices();refreshUI();
  const out=document.getElementById('cavaOut');
  if(out)out.innerHTML='<b>Cava limpa.</b> Permaneceu somente a camada do limite superior.';
  toast('Cava, rampa, interseção e MDT cortado removidos; limite superior preservado');
}
function bindCavaMineracao(){
  const d=document.getElementById('btnCavaDesenhar'),e=document.getElementById('btnCavaEditar'),
    cp=document.getElementById('btnCavaCriarLimiteParam'),
    g=document.getElementById('btnCavaGerar'),c=document.getElementById('btnCavaCortar'),
    continuar=document.getElementById('btnCavaContinuar'),
    limpar=document.getElementById('btnCavaLimpar'),
    ri=document.getElementById('btnCavaRampaInicio'),
    rl=document.getElementById('btnCavaRampaLimpar'),
    elinha=document.getElementById('btnCavaEditarLinha'),
    congelar=document.getElementById('btnCavaCongelarEscolher');
  if(d)d.onclick=cavaDesenharLimite;
  if(cp)cp.onclick=cavaCriarLimiteParametrico;
  if(g)g.onclick=()=>{ /* gerar cava CORTADA: bruta + corte num passo */
    const L=cavaGerar();
    if(L&&typeof cavaCortarLinhas==='function')try{cavaCortarLinhas();}catch(e){console.warn('corte',e);}
  };
  const si=document.getElementById('cavaShowInter');
  if(si)si.onchange=()=>{ /* religa a interseção regerando o projeto atual */
    const P=typeof cavaProjetoAtual==='function'&&cavaProjetoAtual();
    if(P&&P.cavaDesign){
      const D=P.cavaDesign,fonte=cavaResolverFonte(D);
      if(fonte)cavaGerar({item:fonte,params:D,replaceLayer:P,silent:true});
    }
  };
  if(e)e.onclick=cavaEditarLimite;
  if(c)c.onclick=cavaCortarLinhas;
  if(continuar)continuar.onclick=cavaContinuar;
  if(limpar)limpar.onclick=cavaLimpar;
  if(ri)ri.onclick=cavaRampaIndicarInicio;
  if(rl)rl.onclick=cavaRampaLimpar;
  if(elinha)elinha.onclick=cavaEditarLinhaControladora;
  if(congelar)congelar.onclick=cavaCongelarArmar;
  /* #btnCavaRepararMdt removido do painel a pedido dele; a função
     cavaRecalculaAnelMdtEscolhido continua existindo para uso interno */
  {
    const bs=document.getElementById('btnCavaSoltarAjustes');
    if(bs)bs.onclick=()=>{
      const proj=cavaProjetoAtual();
      if(!proj||!proj.cavaDesign){toast('Nenhuma cava para soltar');return;}
      const nOvr=proj.cavaDesign.overrides?Object.keys(proj.cavaDesign.overrides).length:0,
        nFro=proj.cavaDesign.frozenRings?Object.keys(proj.cavaDesign.frozenRings).length:0,
        nOmi=(proj.cavaDesign.omitidos||[]).length;
      if(!nOvr&&!nFro&&!nOmi){toast('Nenhum anel congelado ou apagado nesta cava');return;}
      if(!confirm(`Recalcular tudo pelo limite superior? Isso libera ${nFro} anel(éis) internos, descarta ${nOvr} ajuste(s) manual(is) e traz de volta ${nOmi} linha(s) apagada(s).`))return;
      const D=proj.cavaDesign,fonte=cavaResolverFonte(D);
      D.overrides=null;D.omitidos=null;D.frozenRings=null;D.freezeRingIndex=null;
      (S.layers||[]).filter(x=>String(x._cavaFreezeOf||'')===String(proj.id)).forEach(x=>{
        try{if(x.llayer)map.removeLayer(x.llayer);}catch(e){}
        const ix=S.layers.indexOf(x);if(ix>=0)S.layers.splice(ix,1);
      });
      if(fonte){
        try{cavaGerar({item:fonte,params:D,
          replaceLayer:proj,silent:true});}catch(e){console.warn('soltar',e);}
      }
      toast('Ajustes manuais descartados; linhas apagadas restauradas');
    };
  }
  const r=document.getElementById('cavaRampa');if(r)r.onchange=()=>{
    document.getElementById('cavaRampaBox').style.display=r.checked?'grid':'none';
    if(!r.checked){cavaRampaLimpar();return;}
    const info=document.getElementById('cavaRampaInicioInfo');
    if(info&&!S._cavaRampStart)info.textContent='Rampa ativada. Agora clique em “Indicar início da rampa” e marque o ponto na crista.';
    /* Não chama cavaRampaParametrosSync aqui: marcar a opção nunca pode gerar
       uma rampa sem o ponto de partida escolhido pelo usuário. */
  };
  const fm=document.getElementById('cavaRampaFimModo'),fz=document.getElementById('cavaRampaFimZ');
  if(fm)fm.onchange=()=>{
    if(fz)fz.disabled=fm.value!=='cota';
    cavaRampaParametrosSync();
  };
  const sw=document.getElementById('cavaRampaSwitch'),swn=document.getElementById('cavaRampaSwitchN');
  if(sw)sw.onchange=()=>{
    if(swn)swn.disabled=!sw.checked;
    cavaRampaParametrosSync();
  };
  ['cavaRampaW','cavaRampaG','cavaRampaDir','cavaRampaFimZ','cavaRampaPatamar','cavaRampaSwitchN'].forEach(id=>{
    const x=document.getElementById(id);if(x)x.onchange=cavaRampaParametrosSync;
  });
  {
    const e=document.getElementById('cavaBaseSel');
    if(e)e.onchange=()=>{cavaAtualizaCotaInfo();cavaAtualizaPreview();
      try{ if(typeof rb31LimpaMarcaInicio==='function')rb31LimpaMarcaInicio(); }catch(_){}
      try{
        const par=typeof rb31PilhaDoItem==='function'?rb31PilhaDoItem():null;
        if(par){const info=document.getElementById('rb31Info');
          if(info)info.textContent='Este limite já comanda a pilha "'+
            (par.uni.name||'')+'" (bancada '+par.uni._rb31Recipe.banco+
            '). Gerar/Iterar CONTINUA essa pilha; para recomeçar, use Reiniciar.';}
      }catch(_){}
      /* CONTINUAÇÃO a partir de uma crista/berma já gerada: o anel traz a
         própria cota — a cota inicial do 3.1 segue a do anel escolhido
         (não a referência do MDT, que aponta a base da pilha antiga) —
         e Lado/Sentido herdam as travas da pilha de origem */
      try{
        const it2=cavaItemSelecionado();
        const ne=document.getElementById('rb31NomeLim'),li=document.getElementById('cavaLimiteParamInfo'),
          cp2=document.getElementById('btnCavaCriarLimiteParam');
        if(it2&&it2.L&&ne){
          if(it2.L._cavaLimiteDin)ne.value=it2.L.name||'';
          else if(!ne.value.trim())ne.value=cavaNomeLimiteParametrico(it2);
        }
        if(it2&&it2.L&&li)li.innerHTML=it2.L._cavaLimiteDin
          ?`◈ <b>${esc(it2.L.name)}</b> já é paramétrico: pode controlar o projeto atual ou ser reutilizado como novo limite sem duplicação.`
          :`◇ <b>${esc(it2.L.name)}</b> é a referência preservada. Crie a cópia ◈ antes de editar.`;
        if(cp2&&it2&&it2.L){
          cp2.textContent=it2.L._cavaLimiteDin?'◈ Usar como novo limite':'◈ Criar limite paramétrico';
          cp2.title=it2.L._cavaLimiteDin?
            'Reutiliza esta camada paramétrica sem duplicá-la':'Duplica a referência sem alterá-la';
        }
        if(it2&&it2.L&&it2.L._rb31Recipe&&it2.L._rb31Recipe.travaFora!==undefined){
          const R2=it2.L._rb31Recipe,
            sl2=document.getElementById('cavaLado'),
            sv2=document.getElementById('cavaSentido');
          if(sl2)sl2.value=R2.travaFora?'outside':'inside';
          if(sv2)sv2.value=R2.travaUp?'up':'down';
        }
        if(it2&&it2.f){
          let zc=NaN;
          const pr=it2.f.props||{};
          if(Number.isFinite(+pr.COTA))zc=+pr.COTA;
          else if(Array.isArray(it2.f.zg)){
            const zz=it2.f.zg.filter(Number.isFinite);
            if(zz.length&&Math.max(...zz)-Math.min(...zz)<0.05)zc=zz[0];
          }
          const z0e=document.getElementById('rb31Z0');
          if(z0e&&Number.isFinite(zc))z0e.value=+zc.toFixed(2);
        }
      }catch(_){}};
  }
  ['cavaMdtSel','cavaAutoZ','cavaAutoZRef','cavaRound','cavaLinhaUnica'].forEach(id=>{
    const e=document.getElementById(id);if(e)e.onchange=()=>{cavaAtualizaCotaInfo();cavaAtualizaCaminhoInfo();cavaParametrosSync();};
  });
  {
    const em=document.getElementById('cavaMdtSel');
    if(em){
      const antes=em.onchange;
      em.onchange=e2=>{
        try{ if(typeof antes==='function')antes(e2); }catch(_){}
        /* TERRENO TROCADO: a linha de interseção acompanha na hora, e a
           escolha fica gravada na receita da pilha (persiste no projeto) */
        try{
          const st2=S._rb31;
          if(st2&&st2.banco&&st2.feats&&st2.feats.length){
            st2.feats=st2.feats.filter(f2=>!(f2.props&&
              (f2.props.TIPO==='Interseção cava × terreno'||f2.props.CLASSE==='rb31-inter')));
            rb31Desenha(st2);
            const uni2=st2.lays&&st2.lays.uni;
            if(uni2&&uni2._rb31Recipe&&uni2._rb31Recipe.par)
              uni2._rb31Recipe.par.mdt=em.value;
            toast('Terreno trocado — linha de interseção recalculada');
          }
        }catch(_){}
      };
    }
  }
  ['cavaZ0','cavaNB','cavaH','cavaAng','cavaB','cavaSentido','cavaLado'].forEach(id=>{
    const e=document.getElementById(id);if(e){e.oninput=()=>{cavaAtualizaPreview();cavaAtualizaCaminhoInfo();};e.onchange=()=>{cavaAtualizaCaminhoInfo();cavaParametrosSync();};}
  });
  refreshCavaMineracao();cavaAtualizaCotaInfo();cavaAtualizaPreview();cavaAtualizaCaminhoInfo();
}
setTimeout(bindCavaMineracao,0);
