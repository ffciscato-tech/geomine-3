/* Atual 135 — motor v2 no comando paramétrico unificado.
   - A geração automática usa offsets incrementais, densificados e suavizados
     do cava_pilha_v02, preservando as soleiras/chegadas e o corte pelo MDT.
   - A construção por bancadas conserva o núcleo RB31 já calibrado.
   - Os dois métodos usam rigorosamente a mesma convenção visual v2. */
(function cavaV02Unificado135(root){
  'use strict';
  const copia=P=>(P||[]).filter(p=>Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1]))
    .map(p=>[+p[0],+p[1]]);
  const dedup=P=>{
    const out=[];
    for(const p of copia(P))if(!out.length||Math.hypot(p[0]-out.at(-1)[0],p[1]-out.at(-1)[1])>.03)out.push(p);
    if(out.length>3&&Math.hypot(out[0][0]-out.at(-1)[0],out[0][1]-out.at(-1)[1])<=.03)out.pop();
    return out;
  };
  const area=P=>{
    let s=0;for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];s+=a[0]*b[1]-b[0]*a[1];}
    return s/2;
  };
  const cumul=P=>{
    const c=[0];for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];c.push(c[i]+Math.hypot(b[0]-a[0],b[1]-a[1]));}
    return c;
  };
  const ponto=(P,c,s)=>{
    const per=c.at(-1);if(!(per>0))return P[0]&&P[0].slice();
    s=((s%per)+per)%per;
    let lo=0,hi=P.length;
    while(lo<hi-1){const m=(lo+hi)>>1;if(c[m]<=s)lo=m;else hi=m;}
    const a=P[lo],b=P[(lo+1)%P.length],t=(s-c[lo])/Math.max(1e-9,c[lo+1]-c[lo]);
    return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  };
  const passoDe=P=>Math.max(2,Math.min(8,(cumul(P).at(-1)||0)/300));
  const resample=(P,passo)=>{
    P=dedup(P);if(P.length<3)return P;
    const c=cumul(P),per=c.at(-1),n=Math.max(24,Math.min(5000,Math.round(per/Math.max(.2,passo))));
    return Array.from({length:n},(_,k)=>ponto(P,c,k*per/n));
  };
  const suaviza=(P,l,it=1)=>{
    let Q=copia(P);
    for(let k=0;k<it;k++){
      const n=Q.length,ant=Q;
      Q=ant.map((p,i)=>{const a=ant[(i-1+n)%n],b=ant[(i+1)%n];return[
        p[0]+l*((a[0]+b[0])/2-p[0]),p[1]+l*((a[1]+b[1])/2-p[1])];});
    }
    return Q;
  };
  const normais=P=>{
    const n=P.length,ccw=area(P)>=0,s=ccw?1:-1;
    return P.map((_,i)=>{
      const a=P[(i-1+n)%n],b=P[i],c=P[(i+1)%n],
        l1=Math.hypot(b[0]-a[0],b[1]-a[1])||1,l2=Math.hypot(c[0]-b[0],c[1]-b[1])||1,
        nx=((b[1]-a[1])/l1+(c[1]-b[1])/l2)*s,
        ny=-((b[0]-a[0])/l1+(c[0]-b[0])/l2)*s,L=Math.hypot(nx,ny)||1;
      return[nx/L,ny/L];
    });
  };
  const segInt=(a,b,c,d)=>{
    const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],den=rx*sy-ry*sx;
    if(Math.abs(den)<1e-12)return null;
    const t=((c[0]-a[0])*sy-(c[1]-a[1])*sx)/den,u=((c[0]-a[0])*ry-(c[1]-a[1])*rx)/den;
    return t>1e-9&&t<1-1e-9&&u>1e-9&&u<1-1e-9?[a[0]+t*rx,a[1]+t*ry]:null;
  };
  const removeLacos=P=>{
    let Q=dedup(P),mudou=true,passes=0;
    while(mudou&&passes++<10){
      mudou=false;const n=Q.length;if(n<8)break;
      busca:for(let i=0;i<n;i++)for(let j=i+2;j<n;j++){
        if(i===0&&j===n-1)continue;
        const X=segInt(Q[i],Q[(i+1)%n],Q[j],Q[(j+1)%n]);if(!X)continue;
        const dentro=Q.slice(i+1,j+1).concat([X]),fora=Q.slice(0,i+1).concat([X],Q.slice(j+1));
        Q=Math.abs(area(fora))>=Math.abs(area(dentro))?fora:dentro;mudou=true;break busca;
      }
    }
    return Q;
  };
  const limpa=P=>{P=dedup(P);return P.length<3?P:resample(removeLacos(suaviza(P,.25,1)),passoDe(P));};
  /* O v02 trabalha em passos curtos. Aqui o sinal também atende offsets para
     dentro; a normal é orientada pela área do próprio anel, não pela ordem de
     desenho fornecida pelo usuário. */
  const offsetIncremental=(P,dist)=>{
    let Q=resample(dedup(P),passoDe(P)),rest=Math.abs(dist),s=Math.sign(dist)||1;
    while(rest>1e-9&&Q.length>=3){
      const d=Math.min(2.5,rest);rest-=d;
      const N=normais(Q);Q=Q.map((p,i)=>[p[0]+N[i][0]*d*s,p[1]+N[i][1]*d*s]);
      Q=suaviza(Q,Math.min(.30,d/2.5*.30),1);Q=resample(Q,passoDe(Q));
      Q=removeLacos(Q);
    }
    return limpa(Q);
  };

  root.cavaV02Geometria={area,resample,suaviza,normais,removeLacos,offsetIncremental};

  const elemento=(f,up=false)=>{
    const p=f&&f.props||{},c=String(p.CLASSE||'').toLowerCase(),
      t=String(p.TIPO||'').toLowerCase();
    if(c==='rb31-inter'||c==='daylight'||/interse[cç][aã]o/.test(t))return 'Interseção';
    if(['rb31-rampa','rb31-inicio','rb31-eixo'].includes(c)||/rampa|eixo/.test(t))return 'Rampa';
    if(c==='rb31-pe'||/(^|\s)pé(\s|$)|pe de banco/.test(t))return 'Pé';
    if(c==='rb31-crista'||/crista/.test(t))return 'Crista';
    if(/^limite superior/.test(t))return up?'Pé':'Crista';
    return null;
  };
  const categorias=()=>[
    {value:'Crista',color:'#111111',weight:1.5,dash:''},
    {value:'Pé',color:'#111111',weight:1.5,dash:'6 4'},
    {value:'Rampa',color:'#7b3fd4',weight:1.5,dash:''},
    {value:'Interseção',color:'#111111',weight:1.5,dash:'9 4'}];
  const aplicaLinhas=(L,campo='TIPO',up=false)=>{
    if(typeof root.cavaV02AplicaLinhas==='function')return root.cavaV02AplicaLinhas(L,campo,up);
    if(!L)return L;
    (L.features||[]).forEach(f=>{
      if(!f)return;f.props=f.props||{};
      const e=elemento(f,up);if(e)f.props.ELEMENTO=e;
    });
    L.fields=L.fields||[];
    if(!L.fields.some(f=>String(f.name).toUpperCase()==='ELEMENTO'))
      L.fields.push({name:'ELEMENTO',type:'C',length:16,decimal:0});
    L.color='#111111';L.weight=1.5;L.sym={...(L.sym||{}),
      mode:'cat',field:'ELEMENTO',weight:1.5,cats:categorias()};return L;
  };
  const aplicaPoligono=P=>{
    if(typeof root.cavaV02AplicaPoligono==='function')return root.cavaV02AplicaPoligono(P);
    if(!P)return P;P.color='#7b3fd4';P.weight=1.5;P.fill=.08;
    P.sym={...(P.sym||{}),mode:'single',color:'#7b3fd4',stroke:'#7b3fd4',
      hatch:'solid',hatchScale:1,weight:1.5,fill:.08,dash:'',field:'',
      classes:[],cats:[],ramp:'purple'};return P;
  };
  root.cavaV02Estilo={categorias,aplicaLinhas,aplicaPoligono};

  const offsetAnterior=root.cavaOffsetSeguro;
  if(typeof offsetAnterior==='function')root.cavaOffsetSeguro=function(original,atual,passo,total,expand){
    /* Esta função pertence exclusivamente ao gerador automático cavaDesign.
       O RB31/DCE possui offset próprio e não passa por este ponto. */
    try{
      let q=offsetIncremental(atual,passo);
      /* Recompõe a distância construtiva solicitada depois da suavização. Isso
         combina as curvas limpas do v02 com largura de berma/face do CCMGIS. */
      if(typeof cavaAfastamentoFiel==='function')
        q=cavaAfastamentoFiel(q,atual,Math.abs(passo),1.18,.985);
      q=removeLacos(q);
      const valido=typeof cavaOffsetValido==='function'
        ?cavaOffsetValido(atual,q,expand)
        :(q.length>=3&&Math.abs(area(q))>1);
      if(valido)return{ring:q,modo:'v02-incremental-densificado'};
    }catch(e){try{console.warn('offset v02; usando proteção CCMGIS',e);}catch(_){}}
    return offsetAnterior.apply(this,arguments);
  };

  const gerarAnterior=root.cavaGerar;
  if(typeof gerarAnterior==='function')root.cavaGerar=function(){
    const L=gerarAnterior.apply(this,arguments);if(!L||!L.cavaDesign)return L;
    const up=!!L.cavaDesign.up;
    L.cavaDesign.engine='cava-v02-curvas+ccmgis-soleiras-mdt';
    aplicaLinhas(L,'TIPO',up);
    /* O polígono auxiliar da pista deixa de usar o âmbar antigo: fica quase
       transparente e com a mesma borda roxa das linhas de rampa do DCE. */
    try{
      const RP=(typeof S!=='undefined'&&S.layers||[]).find(x=>
        String(x._cavaRampOf||'')===String(L.id));
      if(RP){
        aplicaPoligono(RP);
        if(typeof drawLayer==='function')drawLayer(RP);
      }
    }catch(e){}
    try{if(typeof drawLayer==='function')drawLayer(L);}catch(e){}
    return L;
  };
})(typeof window!=='undefined'?window:globalThis);
