
/* CAVA PARAMÉTRICA PRESERVADA: definições do arquivo aprovado. */
function cavaTrechosVisiveisNoMdt(L,f){
  const D=L&&L.cavaDesign;
  if(!D||L.gtype!=='line'||!f?.geom||f.geom.length<2)return null;
  const classe=String(f.props?.CLASSE||''),tipo=String(f.props?.TIPO||'');
  if(classe==='daylight'||/interse[cç][aã]o/i.test(tipo))return null;
  /* Enquanto a própria cava está sendo editada, mostra-se a geometria bruta:
     assim nenhum vértice fica inacessível só porque está sob o MDT. */
  if((S.tool==='vertex'||S.tool==='edit')&&String(S.activeId)===String(L.id))
    return null;
  const R=(S.rasters||[]).find(r=>String(r.id)===String(D.rasterId)),g=R&&R.d;
  if(!g||typeof sampleZbil!=='function')return null;
  const src=f.geom,zp=f.zg||[],cota=Number.isFinite(+f.props?.COTA)?+f.props.COTA:NaN,
    zAt=i=>Number.isFinite(+zp[i])?+zp[i]:
      (Number.isFinite(+src[i]?.[2])?+src[i][2]:cota);
  if(!src.some((_,i)=>Number.isFinite(zAt(i))))return null;
  const passo=Math.max(.2,Math.min(.75,g.cs||.5)),pts=[];
  for(let i=1;i<src.length;i++){
    const a=src[i-1],b=src[i],za=zAt(i-1),zb=zAt(i);
    if(!Number.isFinite(za)||!Number.isFinite(zb))continue;
    const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/passo));
    if(!pts.length)pts.push([a[0],a[1],za]);
    for(let k=1;k<=n;k++){const t=k/n;pts.push([
      a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,za+(zb-za)*t]);}
  }
  if(pts.length<2)return null;
  const eps=Math.max(.02,(g.cs||.5)*.03),
    vis=p=>{const zt=sampleZbil(g,p[0],p[1]);
      if(!Number.isFinite(zt))return true;
      /* Cava descendente: z de projeto menor que o MDT fica encoberto.
         Aterro ascendente: vale a relação inversa. */
      return D.up?p[2]<=zt+eps:p[2]>=zt-eps;},
    fronteira=(a,b,va)=>{
      let lo=a.slice(),hi=b.slice();
      for(let n=0;n<28;n++){
        const m=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2];
        if(vis(m)===va)lo=m;else hi=m;
      }
      return [(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2];
    };
  const runs=[];let atual=vis(pts[0])?[pts[0]]:[];
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i],va=vis(a),vb=vis(b);
    if(va===vb){if(vb){if(!atual.length)atual=[a];atual.push(b);}continue;}
    const q=fronteira(a,b,va);
    if(va){atual.push(q);if(atual.length>1)runs.push(atual);atual=[];}
    else atual=[q,b];
  }
  if(atual.length>1)runs.push(atual);
  return runs.map(r=>({geom:r.map(p=>[p[0],p[1]]),zg:r.map(p=>p[2]),
    multi:false,props:f.props||{}}));
}

function cavaPoligonos(){
  const out=[];
  (S.layers||[]).forEach(L=>{
    /* Produtos da propria cava nunca podem reaparecer como candidatos a
       limite superior. Reutiliza-los acumulava offsets a cada regeneracao. */
    if(L.cavaDesign||L._cavaRampOf||L._cavaControl||L._cavaFreezeOf||
       L._rb31Recipe||L._cavaMdtCutOf||L._rb31CutOf||L._cavaCutVectorOf||
       L._cavaCutMode)return;
    if(L.visible===false)return;
    if(L.gtype!=='polygon'&&L.gtype!=='line') return;
    (L.features||[]).forEach((f,i)=>{
      if(!f||!f.geom) return;
      let ring=Array.isArray(f.geom[0]?.[0])?f.geom[0]:f.geom;
      if(!ring||ring.length<3)return;
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

function cavaAparaParalela(refRing,rawPts,req,tol){
  const keep=[];
  for(let i=0;i<rawPts.length;i++){
    const need=Math.abs(Array.isArray(req)?req[i]:req);
    if(need<1e-9){keep.push(rawPts[i]);continue;}
    if(cavaDistAoAnel(rawPts[i],refRing)>=need-tol)keep.push(rawPts[i]);
  }
  return keep;
}

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
  return /^(Limite superior|Pé de banco|Crista de banco|Limite \(crista|Pé banco|Berma banco)/i.test(t)||
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

function cavaValidaComponentesIntersecao(curvas,nos,g){
  const src=(curvas||[]).filter(f=>f&&Array.isArray(f.geom)&&f.geom.length>1),
    cand=(nos||[]).filter(p=>p&&Number.isFinite(p[0])&&Number.isFinite(p[1])),
    tol=Math.max(.05,(g?.cs||1)*.2),fechTol=Math.max(1e-7,(g?.cs||1)*1e-6),out=[];
  const perto=p=>{let b=null,bd=Infinity;for(const q of cand){const d=Math.hypot(p[0]-q[0],p[1]-q[1]);
    if(d<bd){bd=d;b=q;}}return b&&bd<=tol?{p:b,d:bd}:null;};
  for(const f of src){
    const a=f.geom[0],b=f.geom.at(-1),fechada=Math.hypot(a[0]-b[0],a[1]-b[1])<=fechTol;
    if(fechada){f.geom[f.geom.length-1]=f.geom[0].slice();
      if(Array.isArray(f.zg)&&f.zg.length)f.zg[f.zg.length-1]=f.zg[0];out.push(f);continue;}
    const A=perto(a),B=perto(b);
    if(!A||!B||A.p===B.p||Math.hypot(A.p[0]-B.p[0],A.p[1]-B.p[1])<=fechTol)continue;
    f.geom[0]=[A.p[0],A.p[1]];f.geom[f.geom.length-1]=[B.p[0],B.p[1]];
    if(Array.isArray(f.zg)){f.zg[0]=Number.isFinite(A.p[2])?A.p[2]:sampleZbil(g,A.p[0],A.p[1]);
      f.zg[f.zg.length-1]=Number.isFinite(B.p[2])?B.p[2]:sampleZbil(g,B.p[0],B.p[1]);}
    out.push(f);
  }
  return out;
}

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

function cavaIntersecaoSuperficies(linhas,g,H,modoUp){
  if(!g||!linhas?.length)return [];
  /* Além de inserir os nós nos anéis antes da triangulação, conserva a lista
     para validar as pontas de cada componente resultante. */
  const nosContrato=cavaPreparaNosExatos(linhas,g);
  /* A interseção principal vem da superfície triangulada formada pelos
     anéis completos. Ligar apenas os nós por proximidade cria uma polilinha
     aparente, mas não representa o corte entre as duas superfícies. */
  const exata=cavaIntersecaoMalhaAneis(linhas,g);
  if(exata.length)return cavaValidaComponentesIntersecao(exata,nosContrato,g);
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
    feats=curvas.map(geom=>({geom:geom.map(p=>p.slice()),
      zg:geom.map(p=>sampleZbil(g,p[0],p[1]))})).filter(f=>f.geom.length>=2),
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
  return cavaValidaComponentesIntersecao(feats,nos,g);
}

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

function cavaSoldaIntersecaoAneis(feats,tol){
  const fs=(feats||[]).filter(f=>f&&Array.isArray(f.geom)&&f.geom.length>=2),
    inter=fs.filter(f=>String(f.props?.TIPO||'')==='Interseção cava × terreno'||
      ['daylight','rb31-inter'].includes(String(f.props?.CLASSE||''))),
    aneis=fs.filter(f=>/^(Limite superior|Pé de banco|Crista de banco|Limite \(crista|Pé banco|Berma banco)/i
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

function cavaRecortaAneisNaIntersecao(feats,modoUp){
  const fs=(feats||[]).filter(f=>f&&Array.isArray(f.geom)&&f.geom.length>=2),
    inter=fs.filter(f=>String(f.props?.TIPO||'')==='Interseção cava × terreno'||
      ['daylight','rb31-inter'].includes(String(f.props?.CLASSE||''))),
    alvo=fs.filter(f=>/^(Limite superior|Pé de banco|Crista de banco|Limite \(crista|Pé banco|Berma banco)/i
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
  else C=addLayer({name:'Cava cortada pela interseção',gtype:'line',crs:L.crs||S.workCRS,
    features,fields:(L.fields||[]).map(x=>({...x})),color:L.color||'#111111'});
  C._cavaLegacyCutOf=L.id;C._cavaCutMode='daylight';C.groupId=L.groupId||null;
  C.sym=JSON.parse(JSON.stringify(L.sym||defSym(L.color||'#111111')));
  /* Evita duas representações visíveis sobrepostas. A bruta permanece no
     painel e pode ser religada para inspeção ou edição. */
  L.visible=false;try{drawLayer(L);drawLayer(C);}catch(e){}
  S.activeId=ativa;return {layer:C,recortadas:r.recortadas,partes:r.partes};
}

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
    C=addLayer({name:(L.name||'Cava').replace(/\s*[+—-]*\s*interseção.*$/i,'')+
      ' — anéis cortados pelo MDT',gtype:'line',crs:L.crs||S.workCRS,
      features:q.feats,fields:(L.fields||[]).map(x=>({...x})),color:L.color||'#111111'});
    C._cavaMdtCutOf=L.id;
  }
  C._cavaCutMode='mdt-ring';C._cavaMdtRasterId=R.id;C._cavaMdtCutUp=up;C.groupId=L.groupId??null;
  C.sym=JSON.parse(JSON.stringify(L.sym||defSym(L.color||'#111111')));
  /* A bruta continua armazenada e editável, mas só a derivada cortada fica
     visível. No 3D, isso impede que dois conjuntos ocupem a cena. */
  L.visible=false;try{drawLayer(L);drawLayer(C);}catch(e){}
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

function cavaRampaPlano(linhas,opt){
  const vazio={features:[],cuts:new Map(),center:[],polygon:null,polygons:[],clipPolygons:[]};
  if(!opt.on||!(opt.width>0)||!(opt.grade>0)||!linhas.length)return vazio;
  const faces=linhas.map((ln,i)=>({ln,i})).filter(q=>q.ln.tipo==='face');
  if(!faces.length)return vazio;
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
    RP=addLayer({name:'Rampa da cava — pista',gtype:'polygon',crs:cavaL.crs,
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
    S._cavaRampStartMarker.bindTooltip('Início da rampa',{permanent:true,direction:'right',offset:[9,0],className:'meas-lbl'});
  }catch(e){console.warn('marcador inicio rampa',e);}
}

function cavaRampaIndicarInicio(){
  /* mesma regra do 3.1: o painel só fecha quando o usuário fechar */
  if(typeof switchView==='function'&&S._view!=='map')switchView('map');
  const chk=document.getElementById('cavaRampa'),box=document.getElementById('cavaRampaBox');
  if(chk)chk.checked=true;if(box)box.style.display='grid';
  setTool('select');
  const info=document.getElementById('cavaRampaInicioInfo');
  if(info)info.textContent='Toque no limite superior para fixar o início da rampa…';
  const handler=ll=>{
    const c=fromWGS(S.workCRS,ll.lng,ll.lat),bruto=cavaItemSelecionado(),
      /* A cópia ◈ editada é a autoridade geométrica. Voltar à referência
         aqui apagava os vértices ajustados assim que o operador mandava
         desenhar a primeira bancada. */
      item=(bruto&&bruto.L&&(bruto.L._cavaLimiteDin||bruto.L._rb31Recipe))?
        bruto:cavaFonteOriginal(bruto);
    if(!item){
      if(info)info.textContent='Escolha primeiro o limite superior da cava.';
      toast('Escolha ou gere primeiro o limite superior da cava');return;
    }
    const ring=cavaLimpaRing(cavaRingWork(item)),q=rb31PontoNaCrista(ring,[c[0],c[1]]),
      dist=q?Math.hypot(c[0]-q.p[0],c[1]-q.p[1]):Infinity,
      largura=Math.max(.5,+((document.getElementById('cavaRampaW')||{}).value||10)),
      tol=Math.max(5,largura);
    if(!q||dist>tol){
      if(info)info.textContent=Number.isFinite(dist)
        ?`O toque ficou ${dist.toFixed(1)} m distante da crista. Toque novamente sobre o limite superior.`
        :'Não foi possível projetar o toque sobre o limite superior.';
      toast(`Início rejeitado: toque a no máximo ${tol.toFixed(1)} m da crista`);
      rb31CapturaClique(handler);return;       /* continua armado após um toque perdido */
    }
    S._cavaRampStart=q.p.slice();
    cavaRampaMostraMarcadorInicio(S._cavaRampStart);
    if(info)info.innerHTML=`Início projetado na crista: <b>E ${q.p[0].toFixed(2)} · N ${q.p[1].toFixed(2)}</b>`+
      ` · distância do toque ${dist.toFixed(2)} m.`;
    const L=cavaProjetoAtual();
    if(L&&L.cavaDesign){
      L.cavaDesign.ramp={...(L.cavaDesign.ramp||{}),start:S._cavaRampStart.slice(),on:true};
      const fonte=cavaResolverFonte(L.cavaDesign),src=fonte&&fonte.L,f=fonte&&fonte.f;
      if(fonte)cavaGerar({item:fonte,params:L.cavaDesign,
        replaceLayer:L,liveEdit:true});
    }
    toast('Início da rampa definido e cava redesenhada');
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
    F=addLayer({name:`Congelamento — ${ref.kind==='toe'?'pé':'crista'} ${ref.bench}`,
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
  else C=addLayer({name:`Controle dinâmico — ${D.rings[ix].kind==='crest'?'crista':'pé'} ${D.rings[ix].bench}`,
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
  /* A referência original nunca entra na ferramenta de vértices. Se já há
     uma cópia ◈ ligada a ela, edita a cópia; caso contrário pede a criação
     nomeada no passo 1 do painel. */
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
  return {n,ch,nE,len,per,norm,idxDe,noS,mitra};
}

function rb31OffsetAnel(anel,dist){
  if(!anel||anel.length<3)return []; /* anel degenerado: falha graciosa */
  const wk=rb31Walker(anel),out=[];
  for(let i=0;i<wk.n;i++){
    const i0=(i-1+wk.n)%wk.n,
      mx=wk.nE[i0][0]+wk.nE[i][0],my=wk.nE[i0][1]+wk.nE[i][1],
      mm=Math.hypot(mx,my);
    if(mm<1e-9){ /* dobradiça 180°: bevel com as duas paralelas */
      out.push([anel[i][0]+wk.nE[i0][0]*dist,anel[i][1]+wk.nE[i0][1]*dist]);
      out.push([anel[i][0]+wk.nE[i][0]*dist,anel[i][1]+wk.nE[i][1]*dist]);
      continue;
    }
    const ux=mx/mm,uy=my/mm,c=ux*wk.nE[i0][0]+uy*wk.nE[i0][1],
      f=1/Math.max(c,0.125); /* cap 8× */
    out.push([anel[i][0]+ux*dist*f,anel[i][1]+uy*dist*f]);
  }
  return rb31LimpaSaida(out);
}

function rb31SemAgulha(r){
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
        if(cos<-0.999&&sen<0.045){mexeu=true;continue;}
      }
      o.push(b2);
    }
    pts=o;
  }
  return pts;
}

function rb31LimpaSaida(r){
  let ring=rb31SemAgulha(r);
  try{ring=cavaDeloop(ring);}catch(e){}
  ring=rb31SemAgulha(ring); /* o corte do laço pode expor agulha nova */
  const ded=[];
  for(const p of ring){
    const u=ded[ded.length-1];
    if(!u||Math.hypot(p[0]-u[0],p[1]-u[1])>0.02)ded.push([p[0],p[1]]);
  }
  while(ded.length>1&&Math.hypot(ded[0][0]-ded[ded.length-1][0],ded[0][1]-ded[ded.length-1][1])<=0.02)ded.pop();
  return ded;
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
  const run=H/Math.tan(ang*Math.PI/180),L=H/(g/100),runS=run*sg,WS=W*sg;
  /* pé natural: offset paralelo EXATO (fiel, sem suavizar) */
  if(!crista||crista.length<3)return {warn:'A crista não comporta a bancada'};
  const peNat=rb31OffsetAnel(crista,-runS);
  if(!peNat||peNat.length<3)return {warn:'O anel não comporta a bancada (recuo do talude)'};
  const res={aviso:''};
  const wk=rb31Walker(peNat),per=wk.per;
  let cx=0,cy=0;for(const p of peNat){cx+=p[0];cy+=p[1];}
  const ctr=[cx/peNat.length,cy/peNat.length];
  const anelCCW=rb31AreaSinal(peNat)>0,
    dirA=((opt.dir==='ccw')===anelCCW)?1:-1;
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
    /* o degrau fica NA CRISTA (a junta seca anterior deixou uma aresta
       radial de exatamente ~W — ela é a medida e a posição da soleira):
       par de vértices consecutivos com salto 0,7–1,4·W e direção RADIAL
       (arestas comuns têm tamanho parecido mas correm na tangente),
       o mais próximo do ponto de continuidade (pFim anterior). */
    const P0=opt.startP||peNat[0];
    let melhor=null;
    for(let i=0;i<crista.length;i++){
      const vA=crista[i],vB=crista[(i+1)%crista.length],
        salto=Math.hypot(vB[0]-vA[0],vB[1]-vA[1]);
      if(salto<0.7*W||salto>1.4*W)continue;
      const eD=[(vB[0]-vA[0])/salto,(vB[1]-vA[1])/salto],
        mx=(vA[0]+vB[0])/2-ctr[0],my=(vA[1]+vB[1])/2-ctr[1],
        mr=Math.hypot(mx,my)||1,
        radial=Math.abs((eD[0]*mx+eD[1]*my)/mr);
      if(radial<0.7)continue;
      const dP=Math.min(
        Math.hypot(vA[0]-P0[0],vA[1]-P0[1]),
        Math.hypot(vB[0]-P0[0],vB[1]-P0[1]));
      if(dP>6*W)continue;
      if(!melhor||dP<melhor.dP)melhor={dP,vA:vA.slice(),vB:vB.slice()};
    }
    if(melhor){
      /* qual dos dois cantos é o de FORA? o raio ao centróide engana em
         anel irregular (trocava os lados no banco 3) — o critério
         robusto é a PRÓPRIA MARCHA: a borda externa logo à frente fica
         em pé_natural+run·n; o vértice do par mais próximo dela é A0 */
      const meio=[(melhor.vA[0]+melhor.vB[0])/2,(melhor.vA[1]+melhor.vB[1])/2],
        sM=rb31AnelAzimute(peNat,chD,ctr,meio),
        wT=wk.noS(wk.norm(sM+dirA*(W+2))), /* bem DEPOIS do degrau: 1 m ainda caía na aresta radial do vão (normal tangencial → lado errado) */
        aT=[wT.p[0]+wT.n[0]*runS,wT.p[1]+wT.n[1]*runS],
        dA=Math.hypot(melhor.vA[0]-aT[0],melhor.vA[1]-aT[1]),
        dB=Math.hypot(melhor.vB[0]-aT[0],melhor.vB[1]-aT[1]);
      solA=(dA<=dB?melhor.vA:melhor.vB).slice();
      solB=(dA<=dB?melhor.vB:melhor.vA).slice();
      /* âncora da marcha: o vértice do pé natural mais próximo (euclid)
         do canto de fora — a âncora ANGULAR caía no canto errado do
         degrau do pé (dois vértices no mesmo azimute) e a marcha
         nascia na aresta radial do vão */
      let iPe=0,bd=Infinity;
      for(let q=0;q<wk.n;q++){
        const d=(peNat[q][0]-solA[0])**2+(peNat[q][1]-solA[1])**2;
        if(d<bd){bd=d;iPe=q;}
      }
      sIni=wk.norm(wk.ch[iPe]+dirA*0.05);
    }else sIni=wk.norm(sIni+dirA*0.05); /* sem degrau visível: segue do ponto */
  }
  const Lent=degrau?0:1.75*W, /* diagonal só na 1ª bancada (soleira na crista) */
    lin=x=>degrau?1:Math.max(0,Math.min(1,x));
  /* ---------- marcha das bordas (A na face, B=A−W, eixo no meio) ---
     amostras a cada ~2 m na cadeia + vértices de MITRA nos cantos
     cruzados (a cada distância própria: A→rec, B→rec−W, E→rec−W/2) */
  const A=[],Bq=[],E=[],exA=[];
  const distDesde=si=>dirA>0?wk.norm(si-sIni):wk.norm(sIni-si);
  let s=degrau?wk.norm(sIni+dirA*0.1):wk.norm(sIni+dirA*W),eixoAcum=0,guard=0,tFim=false;
  let iAnt=wk.noS(s).i;
  const passo=2,maxPassos=Math.ceil(per*3/passo)+peNat.length*3+10;
  const pushTrio=(p,nv,t,fE,sAtual)=>{
    const rec=(1-t)*runS,z=z0+dz*t,
      a=[p[0]+nv[0]*rec,p[1]+nv[1]*rec,z];
    let b;
    if(fE<1){
      const sB=wk.norm(sAtual-dirA*(1-fE)*W),nb=wk.noS(sB),
        bl=[nb.p[0]+nb.n[0]*runS,nb.p[1]+nb.n[1]*runS],
        bf=[nb.p[0]+nb.n[0]*(rec-WS),nb.p[1]+nb.n[1]*(rec-WS)];
      b=[bl[0]+(bf[0]-bl[0])*fE,bl[1]+(bf[1]-bl[1])*fE,z];
    }else b=[p[0]+nv[0]*(rec-WS),p[1]+nv[1]*(rec-WS),z];
    const e=[(a[0]+b[0])/2,(a[1]+b[1])/2,z];
    if(E.length){eixoAcum+=Math.hypot(e[0]-E[E.length-1][0],e[1]-E[E.length-1][1]);}
    A.push(a);Bq.push(b);E.push(e);exA.push(eixoAcum);
  };
  if(degrau&&solA){
    /* soleira FORÇADA: A0 e B0 são os próprios vértices do degrau
       (coincidência de vértices — a aresta do offset É a medida) */
    A.push([solA[0],solA[1],z0]);
    Bq.push([solB[0],solB[1],z0]);
    E.push([(solA[0]+solB[0])/2,(solA[1]+solB[1])/2,z0]);exA.push(0);
  }else{
    const w0=wk.noS(s);
    pushTrio(w0.p,w0.n,0,degrau?1:0,s);
  }
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
          const mA=wk.mitra(c.vi,rec),mB=wk.mitra(c.vi,rec-WS),
            mE=wk.mitra(c.vi,rec-WS/2);
          if(mA&&mB&&mE){
            if(E.length){eixoAcum+=Math.hypot(mE[0]-E[E.length-1][0],mE[1]-E[E.length-1][1]);}
            A.push([mA[0],mA[1],z]);Bq.push([mB[0],mB[1],z]);E.push([mE[0],mE[1],z]);exA.push(eixoAcum);
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
  if(guard>=maxPassos)return {warn:'A rampa não coube na bancada (comprimento > 3 voltas do perímetro)'};
  /* ENTRADA RETIFICADA (1ª bancada): a borda interna vai em RETA do
     ponto de partida (B0 = crista no ponto indicado, EXATO) até a
     posição plena a Lent de eixo — o blend por normais locais dobrava
     e CRUZAVA a borda externa quando a soleira caía perto de um canto
     do limite; a reta replica o DXF (v0→v2 quase reto) e não dobra. */
  if(!degrau&&Bq.length>2){
    const w0=wk.noS(sIni),
      B0=[w0.p[0]+w0.n[0]*runS,w0.p[1]+w0.n[1]*runS];
    let k=0;while(k<exA.length&&exA[k]<Lent)k++;
    if(k>0&&k<Bq.length){
      Bq[0]=[B0[0],B0[1],z0];
      for(let i=1;i<k;i++){
        const f=exA[i]/exA[k];
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
    if(Math.abs(dd-arcoJog)<=0.05)continue;
    if(dd<=1e-9||dd>=arcoJog-1e-9){pontos.push({s:sv,pt:peNat[vi].slice()});continue;}
    if(!degrau&&dd<=Lent+1e-9)continue; /* engolidos pela diagonal de entrada */
    const m=wk.mitra(vi,-WS);
    pontos.push({s:sv,pt:m||offW(sv)});
  }
  const sLE=wk.norm(sIni+dirA*Lent);
  const esp=degrau?[
    /* pé LISO na entrada (o jog cancela o degrau herdado); só saída seca */
    {s:sFim,ord:0,pt:offW(sFim)},
    {s:sFim,ord:1,pt:natS(sFim)}
  ]:[
    {s:sIni,ord:0,pt:natS(sIni)},          /* início da diagonal */
    {s:sLE,ord:0,pt:offW(sLE)},            /* fim da diagonal, já a −W */
    {s:sFim,ord:0,pt:offW(sFim)},          /* junta seca: offset… */
    {s:sFim,ord:1,pt:natS(sFim)}           /* …e natural coincidentes em s */
  ];
  if(dirA<0){ /* varredura invertida: ordem espelhada na junta de saída */
    const k=esp.length-2;
    esp[k].ord=1;esp[k+1].ord=0;
  }
  pontos.push(...esp);
  pontos.sort((u,v)=>(u.s-v.s)||((u.ord||0)-(v.ord||0)));
  const peD=rb31LimpaSaida(pontos.map(q=>[q.pt[0],q.pt[1]]));
  /* bordas sem spikes de geração (mesma regra da ferramenta de limpeza) */
  const A2=rb31LimpaLinha(A),B2=rb31LimpaLinha(Bq),E2=rb31LimpaLinha(E);
  return {peNatural:peNat,peEntregue:peD,bordaA:A2,bordaB:B2,eixo:E2,
    sIni,sFim,pFim:[pF[0],pF[1],z0+dz],run,L,arco,per,warn:res.aviso||''};
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

function rb31Berma(pe,B,fora){
  if(!(B>0))return {warn:'Berma inválida'};
  /* Usa literalmente o mesmo núcleo do comando CAD → Offset: paralelas
     com junção em MITRA (ou bisel somente quando a mitra ultrapassa o
     limite de segurança). Não passa por saneamento, de-loop, suavização ou
     arredondamento depois do offset. */
  const base=[];
  for(const p of pe||[]){
    if(!p||!Number.isFinite(+p[0])||!Number.isFinite(+p[1]))continue;
    const q=[+p[0],+p[1]],u=base[base.length-1];
    if(!u||Math.hypot(q[0]-u[0],q[1]-u[1])>1e-9)base.push(q);
  }
  while(base.length>2&&Math.hypot(base[0][0]-base[base.length-1][0],
    base[0][1]-base[base.length-1][1])<1e-9)base.pop();
  if(base.length<3)return {warn:'O anel não comporta a berma'};
  /* offsetRing usa d>0 à esquerda do sentido da linha. Converte
     Inside/Outside pelo sentido real do anel para que o resultado seja
     independente de horário/anti-horário. */
  const sinal=rb31AreaSinal(base)>=0?1:-1,
    dCad=(fora?-1:1)*sinal*B,
    ring=offsetRing(base,dCad,true);
  if(!ring||ring.length<3)return {warn:'O anel não comporta a berma'};
  return {ring,warn:''};
}

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

function rb31Estado(){
  if(!S._rb31)S._rb31={fase:'crista',banco:0,crista:null,z:null,zPe:null,
    pe:null,startP:null,pFim:null,feats:[],layer:null,
    eixos:[],hist:[],paramBancos:[],novoInicioP:null};
  return S._rb31;
}

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

function rb31Desenha(st){
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
  if(L){L.features=feats;L.fields=fields;drawLayer(L);}
  else{
    L=addLayer({name:'Rampa por bancada',gtype:'line',
      crs:S.workCRS,features:feats,fields,color:'#c35d18'});
    st.lays.uni=L;
  }
  /* RECEITA OPERACIONAL: além do histórico, guarda exatamente o estado no
     ponto em que o operador parou. Isso permite fechar o painel, editar uma
     crista/pé e retomar sem reproduzir bancadas antigas nem perder a linha
     que passou a comandar a próxima iteração. */
  if(L){
    const el=id=>document.getElementById(id),
      n=id=>parseFloat(String((el(id)||{}).value||'').replace(',','.')),
      cp=p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])?[+p[0],+p[1]]:null,
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
      runtime:{z:Number.isFinite(+st.z)?+st.z:null,zPe:Number.isFinite(+st.zPe)?+st.zPe:null,
        fora:!!st.fora,up:!!st.up,crista:cg(st.crista),pe:cg(st.pe),
        peNatural:cg(st.peNatural),peBerma:cg(st.peBerma),
        ultimaRampaA:cg(st.ultimaRampaA),ultimaRampaB:cg(st.ultimaRampaB),
        pFim:cp(st.pFim),pFimB:cp(st.pFimB),
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
      /* A linha visível pode estar aberta no corredor trafegável. Para a
         superfície da cava, usa sempre o anel construtivo fechado. */
      const fonte=f._geomProjeto||f.geom,
        ring=fonte.map(p=>p.slice());
      if(ring.length>3&&Math.hypot(ring[0][0]-ring[ring.length-1][0],
        ring[0][1]-ring[ring.length-1][1])<1e-7)ring.pop();
      if(ring.length>=3)linhas.push({ring,z:+f.props.COTA||0,bench:+f.props.BANCO||0});
    }
    if(linhas.length<2)return null; /* precisa de ao menos 2 cotas p/ cruzar */
    linhas.sort((a,b)=>b.z-a.z); /* da crista para o fundo */
    return (cavaIntersecaoSuperficies(linhas,g,H,false)||[]).map(s=>({
      geom:s.geom,multi:false,zg:s.zg,
      props:{TIPO:'Interseção cava × terreno',BANCO:null,COTA:null,
        ALTURA:H,BERMA:null,ANGULO:null,CLASSE:'rb31-inter'}}));
  }catch(e){console.warn('rb31 interseção dinâmica',e);return null;}
}

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

function rb31LinhasAnteriores(st){
  if(!st||!st.feats)return [];
  /* tudo o que já está desenhado, MENOS a própria crista de partida
     (essa é conferida à parte) — o pé e a pista do banco anterior
     contam, pois é neles que a cava fechada bate primeiro */
  return st.feats.filter(f=>f.props&&
    (f.props.CLASSE==='rb31-crista'||f.props.CLASSE==='rb31-pe'||
     f.props.CLASSE==='rb31-rampa')&&
    !(f.props.CLASSE==='rb31-crista'&&+f.props.BANCO===+st.banco))
    .map(f=>f.geom.map(p=>[p[0],p[1]]));
}

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

function rb31AtualizaCristaDesenhada(st,ring){
  const alvo=(st.feats||[]).filter(f=>f.props&&f.props.CLASSE==='rb31-crista'&&
    +f.props.BANCO===+st.banco).pop();
  if(!alvo)return;
  const g=rb31Fecha(ring),z=+alvo.props.COTA||0;
  alvo._geomProjeto=g.map(p=>p.slice());
  alvo.geom=g;alvo.zg=g.map(()=>z);
}

function rb31GeraSemCruzar(crista,z,opt,W,anteriores){
  const conta=(cr,rr)=>{
    const proprio=rb31CruzamentosDaBancada(cr,rr,null),
      todos=rb31CruzamentosDaBancada(cr,rr,anteriores);
    return {pts:todos,proprio:proprio.length,ant:todos.length-proprio.length};
  };
  let r=rb31Bancada(crista,z,opt);
  if(!r||!r.peEntregue)return {r,crista,corrigido:0,restou:-1,ant:0};
  let c0=conta(crista,r),pts=c0.pts;
  if(!pts.length)return {r,crista,corrigido:0,restou:0,ant:0};
  const base=Math.max(0.5,W||10),
    escala=[0.35,0.7,1.1,1.6,2.2,3.0],
    raio=base*3.5;
  let melhor={r,crista,restou:pts.length,ant:c0.ant},anel=crista;
  for(let k=0;k<escala.length;k++){
    const novo=rb31ChanfraBicos(anel,pts,base*escala[k],raio,70);
    if(!novo)break;                          /* nada mais a chanfrar */
    const rn=rb31Bancada(novo,z,opt);
    if(!rn||!rn.peEntregue)continue;         /* chanfro inviável: tenta mais fundo */
    const cn=conta(novo,rn);
    if(cn.pts.length<melhor.restou)
      melhor={r:rn,crista:novo,restou:cn.pts.length,ant:cn.ant};
    if(!cn.pts.length)return {r:rn,crista:novo,corrigido:k+1,restou:0,ant:0};
    pts=cn.pts;anel=novo;                    /* mira nos que sobraram */
  }
  return {...melhor,corrigido:melhor.restou<c0.pts.length?1:0};
}

function rb31LeLimite(st){
  let item=null;
  if(st&&st.srcLayerId!=null){
    const Ls=(S.layers||[]).find(x=>String(x.id)===String(st.srcLayerId)),fi=st.srcFeatIdx||0;
    if(Ls&&Ls.features&&Ls.features[fi])item={L:Ls,f:Ls.features[fi],i:fi};
  }
  if(!item){
    const bruto=cavaItemSelecionado();
    if(bruto&&bruto.L&&(bruto.L._cavaLimiteDin||bruto.L._rb31Recipe))item=bruto;
    else item=cavaFonteOriginal(bruto);
  }
  if(!item){toast('Selecione um polígono ou linha fechada como limite');return false;}
  /* A referência é apenas comparativa. A primeira geração cria/reutiliza a
     cópia ◈ e toda a receita passa a apontar exclusivamente para ela. */
  {
    const elz=document.getElementById('rb31Z0');
    let z0=parseFloat(String(elz&&elz.value||'').replace(',','.'));
    if(!Number.isFinite(z0)){try{z0=rb31CotaDoPonto(item,st.startP||null);}catch(e){}}
    const din=cavaLimiteDinamico(item,z0);
    if(din){
      item=din;refreshCavaMineracao();
      const sel=document.getElementById('cavaBaseSel'),v=din.L.id+':0';
      if(sel&&[...sel.options].some(o=>o.value===v))sel.value=v;
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
  if(st.srcLayerId!=null&&
     (String(st.srcLayerId)!==String(item.L.id)||+st.srcFeatIdx!==+item.i)){
    st.feats=[];st.banco=0;st.fase='crista';st.pe=null;st.pFim=null;st.zPe=null;
    st.eixos=[];st.eixoFeats=null;st.hist=[];st.paramBancos=[];
    st.novoInicioP=null;st.startP=null;st.undoPilha=[];st.lays=null;
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

function rb31Gerar(sil){
  const st=rb31Estado(),el=id=>document.getElementById(id);
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
  if(!st.crista&&!rb31LeLimite(st))return false;
  rb31SincronizaCrista(st); /* crista intermediária editada manda na próxima */
  const ang=+el('rb31Ang').value,H=+el('rb31H').value,W=+el('rb31W').value,
    g=+el('rb31G').value,dir=el('rb31Dir').value;
  if(!(ang>0&&ang<90&&H>0&&W>0&&g>0&&g<=30)){toast('Revise talude, altura, largura e declividade');return false;}
  /* Lado/Vertical do painel da cava valem também aqui: "Outside" gera os
     bancos PARA FORA do limite e "Up" faz cada banco SUBIR (pilha/aterro) */
  const fora=(document.getElementById('cavaLado')||{}).value==='outside',
    up=(document.getElementById('cavaSentido')||{}).value==='up';
  const opt={ang,H,W,grade:g,dir,fora,up};
  let modoNovo=false;
  if(st.banco===0)opt.startP=st.startP||st.crista[0].slice();
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
  }else{opt.startP=st.pFim;opt.entradaDegrau=true;} /* a rampa nova nasce NO degrau que a junta anterior deixou na crista — travessia reta da berma, trafegável */
  /* AUTOCORREÇÃO: se a bancada sair com linhas cruzadas (bico fechado
     demais no limite), a crista é chanfrada e a bancada refeita, até
     que não haja mais cruzamento. */
  const tent=rb31GeraSemCruzar(st.crista,st.z,opt,W,rb31LinhasAnteriores(st)),r=tent.r;
  if(!r||!r.peEntregue){toast((r&&r.warn)||'Não foi possível gerar a bancada');return false;}
  /* Cruzar bancos JÁ desenhados significa que a cava fechou nessa
     região: não há área para mais um banco. Nesse caso a bancada não
     é entregue — melhor recusar do que desenhar linhas por cima. */
  if(tent.ant>0){
    rb31Desenha(st);
    const msg='A cava fechou aqui: a bancada '+(st.banco+1)+
      ' cruzaria os bancos já desenhados ('+tent.ant+
      ' cruzamento(s)). Reduza a largura/berma ou pare neste banco.';
    const iEl=el('rb31Info');if(iEl)iEl.textContent=msg;
    toast(msg);
    return false;
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
  st.peNatural=(r.peNatural||r.peEntregue).map(p=>[p[0],p[1]]);
  st.peBerma=(r.peBerma||r.peEntregue).map(p=>[p[0],p[1]]);
  st.ultimaRampaA=r.bordaA.map(p=>[p[0],p[1]]);
  st.ultimaRampaB=r.bordaB.map(p=>[p[0],p[1]]);
  st.zPe=st.z+(up?H:-H);
  st.fora=fora;st.up=up; /* o estado guarda o sentido usado */
  st.hist=st.hist||[];st.eixos=st.eixos||[];
  st.hist.push({startP:opt.startP?opt.startP.slice():null,
    degrau:!!opt.entradaDegrau,ang,H,W,grade:g,dir,fora,up});
  st.paramBancos=st.paramBancos||[];
  st.paramBancos.push({banco:st.banco,ang,H,W,grade:g,dir,fora,up,
    zCrista:+st.z,zPe:+st.zPe});
  st.eixos.push(r.eixo.map(p=>p.slice()));
  const P={ALTURA:H,BERMA:null,ANGULO:ang,CLASSE:'rb31-rampa'};
  st.feats.push({geom:r.bordaA.map(p=>[p[0],p[1]]),multi:false,zg:r.bordaA.map(p=>p[2]),
    props:{TIPO:'Rampa banco '+st.banco+' — borda externa',BANCO:st.banco,COTA:null,...P}});
  st.feats.push({geom:r.bordaB.map(p=>[p[0],p[1]]),multi:false,zg:r.bordaB.map(p=>p[2]),
    props:{TIPO:'Rampa banco '+st.banco+' — borda interna',BANCO:st.banco,COTA:null,...P}});
  const gPe=rb31Fecha(r.peEntregue);
  st.feats.push({geom:gPe,multi:false,zg:gPe.map(()=>st.zPe),
    props:{TIPO:'Pé banco '+st.banco,BANCO:st.banco,COTA:+st.zPe.toFixed(3),...P,CLASSE:'rb31-pe'}});
  rb31Desenha(st);
  const info=el('rb31Info');
  if(info)info.innerHTML='Bancada gerada: pé na cota <b>'+st.zPe.toFixed(2)+
    '</b>. Ajuste parâmetros e clique de novo para redesenhar.';
  if(r.warn)toast(r.warn);
  else if(avisoCruz){if(!sil)toast(avisoCruz);}
  else if(!sil)toast('Bancada '+st.banco+' gerada — pé na cota '+st.zPe.toFixed(2));
  return true;
}

function rb31SincronizaCrista(st){
  if(!st||!st.crista)return;
  let alvo=null;
  if(st.banco>0){
    /* SOMENTE O LIMITE É DINÂMICO: a crista de partida dos bancos
       seguintes é a berma calculada, não a linha desenhada (editar a
       crista no mapa não realimenta mais a geração) */
    return;
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

function rb31PosEdicao(L,f){
  try{
    if(rb31MarcaCristaEditada(L,f)&&typeof cavaLiveSync==='function')cavaLiveSync();
  }catch(e){console.warn('rb31PosEdicao',e);}
}

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

function rb31OffsetBerma(sil){
  const st=rb31Estado(),el=id=>document.getElementById(id);
  if(st.fase!=='pe'){toast('Gere uma bancada antes do offset da berma');return false;}
  const B=+el('rb31B').value;
  if(!(B>0)){toast('Informe a largura da berma');return false;}
  /* LEI ÚNICA DA BERMA: o offset de B metros é calculado UMA VEZ sobre a
     linha de chegada que foi efetivamente desenhada. Ela já contém a
     travessa seca da boca da rampa; portanto o offset CAD também cria uma
     travessa paralela, afastada exatamente B, que será a saída da próxima
     rampa. Não misture offset do pé natural com uma paralela aproximada da
     borda roxa: essa união em duas etapas foi a origem das variações e dos
     dentes observados nas juntas. */
  const base=st.pe,
    bm=rb31Berma(base,B,!!st.fora);
  if(!bm.ring){toast(bm.warn||'Não foi possível gerar a berma');return false;}
  /* O par da próxima saída não é procurado por proximidade. Ele é a
     própria aresta transversal produzida pelo offset de B metros, com a
     mesma largura da chegada. Se essa relação exata não existir, nada é
     aproximado: a berma paralela é mantida inteira e a próxima rampa fica
     aguardando um novo ponto indicado pelo operador. */
  const ultimoHist=st.hist&&st.hist[st.hist.length-1],
    temRampaBanco=(st.feats||[]).some(f=>String(f.props&&f.props.CLASSE||'')==='rb31-rampa'&&
      +((f.props||{}).BANCO)===+st.banco);
  let semBanco=!!(ultimoHist&&ultimoHist.sem)||!!st.semRampa||
      !!st.rampaPausada133||!!st._edicaoBruta134||!temRampaBanco,
    prox=(!semBanco&&typeof rb31ParOffsetBerma==='function'&&st.pFim&&st.pFimB)?
      rb31ParOffsetBerma(st.pFim,st.pFimB,bm.ring,B):null;
  if(!semBanco&&st.pFim&&st.pFimB&&!prox){
    /* Nunca deforma o offset nem bloqueia a bancada por uma boca degenerada.
       A linha fica bruta, paralela e pronta para “Mover rampa”. */
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
    props:{TIPO:'Berma banco '+st.banco+' (crista da bancada seguinte)',
      BANCO:st.banco,COTA:+st.z.toFixed(3),ALTURA:null,BERMA:B,ANGULO:null,CLASSE:'rb31-crista'}});
  rb31Desenha(st);
  const info=el('rb31Info');
  if(info)info.innerHTML='Berma do banco <b>'+st.banco+'</b> pronta (cota '+
    st.z.toFixed(2)+'). Gere a próxima bancada ou itere.';
  if(!sil)toast('Berma '+B.toFixed(1)+' m aplicada — crista seguinte pronta');
  return true;
}

function rb31Iterar(){
  /* Operação TRANSACIONAL: ou o ciclo completo é concluído, ou o estado
     anterior é restaurado. Assim uma falha na nova bancada não deixa uma
     berma aplicada isoladamente nem altera a sequência parcialmente. */
  const st=rb31Estado(),snap=rb31Snap(st);
  const falha=msg=>{
    rb31AplicaSnap(st,snap);
    rb31RestauraLimite(st);
    rb31Desenha(st);
    const info=document.getElementById('rb31Info');
    if(info)info.textContent=msg+' O estado anterior foi restaurado integralmente.';
    toast(msg+' — nenhuma alteração foi mantida');
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
  const info=document.getElementById('rb31Info');
  if(info)info.innerHTML='Iteração: bancada <b>'+st.banco+'</b> completa (pé '+
    st.zPe.toFixed(2)+', berma pronta). Aperte de novo para a próxima.';
  toast('Bancada '+st.banco+' completa — pé na cota '+st.zPe.toFixed(2));
  return true;
}

function rb31CapturaClique(cb){
  const h=ev=>{S._pickPonto=null;cb(ev.latlng);};
  S._pickPonto=ll=>{try{map.off('click',h);}catch(e){}cb(ll);};
  map.once('click',h);
}

function rb31Inicio(){
  /* a aba/painel da rampa NÃO pode sumir sozinha: switchView reconstrói
     a ribbon (ribbonBuild→ribbonClose) e fechava o painel — só troca de
     view se realmente não estiver no mapa */
  if(typeof switchView==='function'&&S._view!=='map')switchView('map');
  setTool('select');
  const info=document.getElementById('rb31Info');
  if(info)info.textContent='Toque no mapa, sobre a crista, para fixar o início da 1ª rampa…';
  rb31CapturaClique(ll=>{
    const c=fromWGS(S.workCRS,ll.lng,ll.lat),bruto=cavaItemSelecionado(),
      item=(bruto&&bruto.L&&(bruto.L._cavaLimiteDin||bruto.L._rb31Recipe))?
        bruto:cavaFonteOriginal(bruto);
    if(!item||!item.f||!item.f.geom){toast('Selecione primeiro uma linha ou polígono de limite');return;}
    let st=rb31Estado();
    /* Trocar o limite inicia uma sequência nova. Reaproveitar bancos, cota ou
       undo da fonte anterior produz uma geometria aparentemente válida, mas
       topologicamente pertencente a outro polígono. */
    const fonteMudou=st.srcLayerId!=null&&
      (String(st.srcLayerId)!==String(item.L.id)||+st.srcFeatIdx!==+item.i);
    if(fonteMudou){
      if(st.lays)for(const k of Object.keys(st.lays)){
        const q=st.lays[k];
        if(q&&(S.layers||[]).includes(q))try{deleteVectorLayer(q);}catch(e){}
      }
      S._rb31=null;st=rb31Estado();
      const zAnt=document.getElementById('rb31Z0');if(zAnt)zAnt.value='';
      toast('Novo limite: sequência anterior encerrada e cota inicial relida');
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
    if(info)info.innerHTML='Início projetado na crista: <b>E '+q.p[0].toFixed(2)+' · N '+
      q.p[1].toFixed(2)+'</b> · distância do toque '+dist.toFixed(2)+' m'+
      (Number.isFinite(zc)?' · cota lida: <b>'+(+zc).toFixed(2)+'</b>':'')+
      (st.banco>0?' (vale para um novo ciclo)':'');
    toast(Number.isFinite(zc)?('Início definido na crista — cota '+(+zc).toFixed(2)):'Início definido na crista');
  });
}

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
  if(info)info.textContent='Toque na crista atual: nasce ali uma soleira reta, ortogonal à crista…';
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

function rb31ExportaDXF(){
  const st=S._rb31;
  const camadas=S.layers||[], selecionada=S.selFeat&&S.selFeat.layer,
    ativa=typeof activeLayer==='function'?activeLayer():null;
  /* A camada paramétrica conserva a receita depois de salvar/reabrir; o modo
     Exportação não depende de o painel da cava continuar aberto. */
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
  const st=S._rb31;
  if(!st||!st.undoPilha||!st.undoPilha.length){
    toast('Nada para voltar — gere uma bancada ou berma primeiro');return;
  }
  rb31AplicaSnap(st,st.undoPilha.pop()); /* UMA etapa por clique */
  const voltouLimite=rb31RestauraLimite(st); /* edição dinâmica também volta */
  rb31Desenha(st);
  const info=document.getElementById('rb31Info');
  if(info)info.textContent=(voltouLimite?'Edição do limite desfeita — banco ':'Etapa desfeita — banco ')+st.banco+
    (st.fase==='pe'?' (pé pendente de berma)':' (crista pronta)')+
    (st.undoPilha.length?' · restam '+st.undoPilha.length+' etapa(s) para voltar.':' · nada mais para voltar.');
  toast('Etapa desfeita'+(st.undoPilha.length?' — pode voltar mais '+st.undoPilha.length:''));
  refreshUI();
}

function rb31Reset(){
  const st=S._rb31;
  /* sem resquícios: desfazer o modo remove TODAS as camadas geradas */
  if(st&&st.lays)for(const k of Object.keys(st.lays)){
    const L=st.lays[k];
    if(L&&(S.layers||[]).includes(L))deleteVectorLayer(L);
  }
  if(st&&st.layer&&(S.layers||[]).includes(st.layer))deleteVectorLayer(st.layer);
  S._rb31=null;
  const info=document.getElementById('rb31Info');
  if(info)info.textContent='Modo reiniciado do zero. Selecione o limite, indique o início e gere a primeira bancada.';
  cavaAtualizaPreview();
  toast('Modo 3.1 reiniciado — camada de teste removida');
}

function cavaPreviewAbre(){
  cavaAtualizaPreview();
  const m=document.getElementById('cavaPreviewModal');if(m)m.classList.add('on');
}

function cavaPreviewFecha(){
  const m=document.getElementById('cavaPreviewModal');if(m)m.classList.remove('on');
}

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
  if(!P||!P.cavaDesign||document.getElementById('cavaLive')?.checked===false)return;
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
    live=P?P.live!==false:el('cavaLive').checked,
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
  /* Rampa ACOPLADA (espiral): descendo, a pista faz parte da parede — os
     bancos abaixo dela são deslocados para dentro pela largura + o
     esparramamento do alinhamento (fórmula e(s)=DouterR+W+parcial−D_l).
     É o comportamento do desenho de referência de planejamento de lavra.
     Subindo (cava invertida/pilha), permanece o traçado plano antigo. */
  let rampPlan;
  if(ramp.on&&!up){
    const acop=cavaRampaEspiral(linhas,{...ramp,H,dz,berm:B,start:ramp.start,
      depths,run,ang});
    linhas=acop.linhas;rampPlan=acop.plan;rampPlan.acoplado=true;
    if(acop.warn)warn=warn?warn+' '+acop.warn:acop.warn;
  }else{
    rampPlan=cavaRampaPlano(linhas,{...ramp,H,dz,berm:B,start:ramp.start});
  }
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
  else L=addLayer({name:'Cava bruta + interseção com o MDT',gtype:'line',crs:S.workCRS,features:feats,fields,color:'#c35d18'});
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
      `${ramp.endMode==='elevation'&&Number.isFinite(+ramp.endZ)?` · até a cota ${(+ramp.endZ).toFixed(2)} m`:' · até o último banco'}`:'')+
    (omitidos?`<br><b>${omitidos.size}</b> linha(s) apagada(s) por você seguem ocultas (o anel continua valendo no cálculo).`:'')+
    (R?`<br>Interseção <b>superfície completa por anéis × MDT ${esc(R.name)}</b>`:'')+
    `<br><b>Prévia:</b> cava bruta editável; nenhum raster foi cortado.`+
    (warn?`<br><span style="color:var(--amber)">${esc(warn)}</span>`:'');
  cavaAtualizaPreview();
  if(!cfg.silent)toast(cfg.replaceLayer?'Cava bruta e interseção atualizadas':'Cava bruta + interseção geradas; use Cortar cava somente ao finalizar');
  return L;
}

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

/* Mantida apenas como referência da versão preservada. A sincronização
   ativa é a implementação completa do núcleo, que também recompõe rampa,
   cristas e pés após a edição de qualquer vértice. */
function rb31LiveSyncPreservado(){
  const st=S._rb31;
  if(!st||!st.banco||st.srcLayerId==null)return;
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

function rb31ReplayPreservado(){
  const st=S._rb31;if(!st||!st.banco)return;
  const n=st.banco,faseFinal=st.fase,startP=st.startP,
    lays=st.lays,srcL=st.srcLayerId,srcF=st.srcFeatIdx,srcH=st.srcHash,
    eixoOn=!!st.eixoOn,undoPilha=st.undoPilha||null,srcGeom=st.srcGeom||null,

    hist=(st.hist||[]).map(h=>({startP:h.startP?h.startP.slice():null,degrau:h.degrau}));
  S._rb31={fase:'crista',banco:0,crista:null,z:null,zPe:null,pe:null,
    startP,pFim:null,feats:[],layer:null,lays,srcLayerId:srcL,
    srcFeatIdx:srcF,srcHash:srcH,eixos:[],hist:[],novoInicioP:null,
    eixoOn,undoPilha,srcGeom}; /* linha de centro, pilha do Voltar e retrato do limite sobrevivem ao replay */
  for(let k=1;k<=n;k++){
    /* reproduz a escolha original: bancada iniciada "em outro ponto"
       volta a nascer no MESMO ponto clicado */
    const h=hist[k-1];
    if(h&&k>1&&!h.degrau&&h.startP)S._rb31.novoInicioP=h.startP.slice();
    if(!rb31Gerar(true))break;
    if(k<n||faseFinal==='crista'){if(!rb31OffsetBerma(true))break;}
  }
  /* linha de centro ligada acompanha (o rb31Desenha final já a recalcula
     na camada única — basta garantir um redesenho com o estado completo) */
  if(eixoOn)try{rb31Desenha(S._rb31);}catch(e){}
}

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
  try{rb31LiveSync();}catch(e){}
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
    const d=L.cavaDesign;if(!d||d.live===false)return;
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
      const d=j.L&&j.L.cavaDesign;if(!d||d.live===false)return;
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
        const confirmado=j.L.cavaDesign&&j.L.cavaDesign.sourceHash;
        if(confirmado!==hash||cavaLimiteProjetoDivergiu(j.L.cavaDesign,item))falhou=true;
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
      S.rasters.push(rc);
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

function cavaCortarLinhas(){
  const out=document.getElementById('cavaOut'),L=cavaProjetoAtual();
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
    C=addLayer({name:'Cava cortada pela interseção',gtype:'line',crs:L.crs||S.workCRS,
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
        RC=addLayer({name:'Rampa cortada pela interseção',gtype:'polygon',
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
