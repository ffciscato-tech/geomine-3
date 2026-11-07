/* Suavização das margens da calha. Entre duas seções as margens eram ligadas
   por cordas retas, e com seções espaçadas (ou MDT grosso) a calha ficava
   poligonal, nada parecida com um leito. Aqui a margem vira uma curva
   Catmull-Rom CENTRÍPETA que passa exatamente pelos pontos medidos em cada
   seção (larguras e seções continuam as medidas) e só arredonda o trecho entre
   elas; a parametrização centrípeta não cria laços nem pontas.

   No modo 2D (altura acompanhando o eixo) não há margem medida a preservar:
   o contorno é a borda de uma máscara de pixels e, com MDT grosso, vira uma
   escada. Ali o contorno é reamostrado em passo regular e suavizado por média
   gaussiana ao longo do perímetro (σ ≈ 1,5 pixel), o que remove o serrilhado
   sem deslocar a faixa.

   Só a geometria de saída muda. A curva é validada: não pode cruzar a si
   mesma, a outra margem nem o percurso dos fundos (no modo 2D, também não pode
   cruzar furos nem outras componentes). Se cruzar, tenta uma curva mais
   contida e, por fim, mantém as retas, com aviso.

   Autocontido: a factory é serializada para o worker da análise. */
(function(){
'use strict';
function engine(){
  const MAX_SUB=16,MAX_VERTICES=400000,BLENDS=[1,.5];
  const fin=p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
  const dist=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
  const lerp=(a,b,u)=>[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u];
  function dedupe(points){
    const out=[];
    for(const p of points||[]){if(!fin(p))continue;const u=out[out.length-1];if(!u||dist(u,p)>1e-9)out.push([+p[0],+p[1]]);}
    return out;
  }
  /* pontos internos do vão p1→p2 (Barry–Goldman, alfa 0,5); blend<1 aproxima da corda */
  function span(p0,p1,p2,p3,n,blend,out){
    const a=.5,t0=0,t1=t0+Math.pow(Math.max(dist(p0,p1),1e-12),a),
      t2=t1+Math.pow(Math.max(dist(p1,p2),1e-12),a),t3=t2+Math.pow(Math.max(dist(p2,p3),1e-12),a);
    const L=(pa,pb,ta,tb,t)=>lerp(pa,pb,(t-ta)/(tb-ta));
    for(let k=1;k<n;k++){
      const t=t1+(t2-t1)*k/n;
      const A1=L(p0,p1,t0,t1,t),A2=L(p1,p2,t1,t2,t),A3=L(p2,p3,t2,t3,t),B1=L(A1,A2,t0,t2,t),B2=L(A2,A3,t1,t3,t),C=L(B1,B2,t1,t2,t);
      out.push(blend===1?C:lerp(lerp(p1,p2,k/n),C,blend));
    }
  }
  /* curva pelos pontos; devolve {points, index} com o índice de cada ponto de entrada */
  function curve(points,closed,step,blend=1){
    let p=dedupe(points);
    if(closed&&p.length>1&&dist(p[0],p[p.length-1])<=1e-9)p.pop();
    const n=p.length,index=[];
    if(n<(closed?3:3)){const out=p.map(q=>q.slice());p.forEach((_,i)=>index.push(i));if(closed&&out.length)out.push(out[0].slice());return {points:out,index};}
    const out=[],m=closed?n:n-1;
    for(let i=0;i<m;i++){
      const p1=p[i],p2=p[(i+1)%n];
      const p0=closed?p[(i-1+n)%n]:(i>0?p[i-1]:[2*p1[0]-p2[0],2*p1[1]-p2[1]]);
      const p3=closed?p[(i+2)%n]:(i+2<n?p[i+2]:[2*p2[0]-p1[0],2*p2[1]-p1[1]]);
      index.push(out.length);out.push(p1.slice());
      const sub=Math.max(1,Math.min(MAX_SUB,Math.ceil(dist(p1,p2)/step)));
      if(sub>1)span(p0,p1,p2,p3,sub,blend,out);
    }
    if(closed)out.push(out[0].slice());else{index.push(out.length);out.push(p[n-1].slice());}
    return {points:out,index};
  }
  /* ---- interseções (grade uniforme, coordenadas locais para precisão em UTM) ---- */
  function orient(p,q,r){return (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);}
  function crossProper(a,b,c,d){
    const d1=orient(c,d,a),d2=orient(c,d,b),d3=orient(a,b,c),d4=orient(a,b,d);
    return ((d1>0&&d2<0)||(d1<0&&d2>0))&&((d3>0&&d4<0)||(d3<0&&d4>0));
  }
  function touch(a,b,c,d,eps){
    /* encostar/sobrepor também invalida um anel (exceto vizinhos, que o chamador pula) */
    const seg=(p,q,r)=>{const vx=q[0]-p[0],vy=q[1]-p[1],L2=vx*vx+vy*vy;let t=L2?((r[0]-p[0])*vx+(r[1]-p[1])*vy)/L2:0;t=Math.max(0,Math.min(1,t));return Math.hypot(p[0]+t*vx-r[0],p[1]+t*vy-r[1]);};
    return seg(a,b,c)<=eps||seg(a,b,d)<=eps||seg(c,d,a)<=eps||seg(c,d,b)<=eps;
  }
  function edgesOf(lines,origin){
    const E=[];
    lines.forEach((ln,li)=>{
      const p=ln.points.map(q=>[q[0]-origin[0],q[1]-origin[1]]),n=p.length-1;
      for(let i=0;i<n;i++)E.push({a:p[i],b:p[i+1],line:li,i,n,closed:!!ln.closed});
    });
    return E;
  }
  /* devolve true se alguma aresta cruza outra de forma proibida.
     pairAllowed(e,f) permite pares (p.ex. vizinhos que compartilham um vértice). */
  function anyCrossing(lines,{strictTouch=true,pairAllowed=null}={}){
    const all=lines.flatMap(l=>l.points);if(all.length<2)return false;
    const origin=all[0];
    const E=edgesOf(lines,origin);if(E.length<2)return false;
    let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity,len=0;
    for(const e of E){xmin=Math.min(xmin,e.a[0],e.b[0]);ymin=Math.min(ymin,e.a[1],e.b[1]);xmax=Math.max(xmax,e.a[0],e.b[0]);ymax=Math.max(ymax,e.a[1],e.b[1]);len+=Math.hypot(e.b[0]-e.a[0],e.b[1]-e.a[1]);}
    const span=Math.max(xmax-xmin,ymax-ymin,1e-9),eps=Math.max(1e-9,span*1e-10);
    const cell=Math.max(len/E.length*2,span/Math.sqrt(E.length)/2,1e-6);
    const nx=Math.max(1,Math.ceil((xmax-xmin)/cell)+1),grid=new Map();
    const key=(i,j)=>j*nx+i;
    E.forEach((e,k)=>{
      const i0=Math.floor((Math.min(e.a[0],e.b[0])-xmin)/cell),i1=Math.floor((Math.max(e.a[0],e.b[0])-xmin)/cell);
      const j0=Math.floor((Math.min(e.a[1],e.b[1])-ymin)/cell),j1=Math.floor((Math.max(e.a[1],e.b[1])-ymin)/cell);
      for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++){const q=key(i,j);let c=grid.get(q);if(!c)grid.set(q,c=[]);c.push(k);}
    });
    const seen=new Int32Array(E.length).fill(-1);
    const vizinho=(e,f)=>e.line===f.line&&(Math.abs(e.i-f.i)===1||(e.closed&&Math.abs(e.i-f.i)===e.n-1));
    for(const cellItems of grid.values()){
      for(let x=0;x<cellItems.length;x++){
        const k=cellItems[x],e=E[k];
        for(let y=x+1;y<cellItems.length;y++){
          const m=cellItems[y];if(seen[m]===k)continue;seen[m]=k;
          const f=E[m];
          if(pairAllowed&&pairAllowed(e,f))continue;
          if(vizinho(e,f))continue;
          if(Math.max(e.a[0],e.b[0])<Math.min(f.a[0],f.b[0])-eps||Math.max(f.a[0],f.b[0])<Math.min(e.a[0],e.b[0])-eps||
             Math.max(e.a[1],e.b[1])<Math.min(f.a[1],f.b[1])-eps||Math.max(f.a[1],f.b[1])<Math.min(e.a[1],e.b[1])-eps)continue;
          if(crossProper(e.a,e.b,f.a,f.b))return true;
          if(strictTouch&&touch(e.a,e.b,f.a,f.b,eps))return true;
        }
      }
    }
    return false;
  }
  function inRing(p,r){
    let d=false;
    for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];
      if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/((b[1]-a[1])||1e-20)+a[0])d=!d;}
    return d;
  }
  function area(r){let s=0;for(let i=0,j=r.length-1;i<r.length;j=i++)s+=(r[j][0]-r[0][0])*(r[i][1]-r[0][1])-(r[i][0]-r[0][0])*(r[j][1]-r[0][1]);return s/2;}
  /* passo de densificação: fino o bastante para a curva parecer contínua no mapa,
     sem estourar o total de vértices */
  function passo(o,comprimento){
    const interval=+o.interval>0?+o.interval:5,res=+o.resolution>0?+o.resolution:1;
    let step=Math.max(interval/8,res/4,.05);
    if(comprimento/step>MAX_VERTICES)step=comprimento/MAX_VERTICES;
    return step;
  }
  const comprimento=pts=>{let s=0;for(let i=1;i<pts.length;i++)s+=dist(pts[i-1],pts[i]);return s;};
  /* ---- modos por seção: margens esquerda/direita viram curvas abertas ---- */
  function bySections(result,o,meta){
    const ss=result.sections;
    const left=ss.map(s=>s.left),right=ss.map(s=>s.right);
    if(!left.every(fin)||!right.every(fin))throw Error('margens incompletas');
    const step=passo(o,comprimento(left)+comprimento(right));meta.step=step;
    const floor=ss.map(s=>s.floorPoint||s.referencePoint).filter(fin);
    for(const blend of BLENDS){
      const L=curve(left,false,step,blend),R=curve(right,false,step,blend);
      const ring=[...L.points,...R.points.slice().reverse()];ring.push(ring[0].slice());
      if(anyCrossing([{points:ring,closed:true}]))continue;
      /* o percurso dos fundos não pode atravessar as margens (as tampas transversais
         das pontas são o fechamento artificial e ficam de fora, como no motor) */
      if(floor.length>1&&anyCrossing([{points:floor},{points:L.points},{points:R.points}],{strictTouch:false,
        pairAllowed:(e,f)=>e.line===f.line||(e.line!==0&&f.line!==0)}))continue;
      meta.blend=blend;meta.leftCount=L.points.length;meta.leftIndex=L.index;meta.rightIndex=R.index;
      meta.verticesBefore=result.ring?.length||0;
      result.ring=ring;meta.verticesAfter=ring.length;meta.applied=true;
      return;
    }
    meta.reason='a curva cruzaria a outra margem, a si mesma ou o percurso dos fundos';
  }
  /* ---- modo 2D: anéis fechados do contorno (casca e furos) ---- */
  /* pontos em passo regular ao longo do perímetro (sem repetir o 1º no fim) */
  function resample(ring,step){
    let p=dedupe(ring);if(p.length>1&&dist(p[0],p[p.length-1])<=1e-9)p.pop();
    const n=p.length;if(n<3)return p;
    let per=0;for(let i=0;i<n;i++)per+=dist(p[i],p[(i+1)%n]);
    const m=Math.max(8,Math.round(per/step)),d=per/m,out=[];
    let i=0,acc=0,seg=dist(p[0],p[1%n]);
    for(let k=0;k<m;k++){
      const alvo=k*d;
      while(acc+seg<alvo&&i<n-1){acc+=seg;i++;seg=dist(p[i],p[(i+1)%n]);}
      const u=seg>0?Math.min(1,Math.max(0,(alvo-acc)/seg)):0;
      out.push(lerp(p[i],p[(i+1)%n],u));
    }
    return out;
  }
  /* média gaussiana circular; sigma em número de pontos */
  function gauss(pts,sigma){
    const n=pts.length,h=Math.min(Math.floor(n/2)-1,Math.ceil(3*sigma));
    if(!(sigma>0)||h<1)return pts.map(q=>q.slice());
    const w=[];for(let k=-h;k<=h;k++)w.push(Math.exp(-(k*k)/(2*sigma*sigma)));
    const W=w.reduce((x,y)=>x+y,0),o=pts[0],out=[];
    for(let i=0;i<n;i++){let x=0,y=0;
      for(let k=-h;k<=h;k++){const q=pts[(i+k+n)%n],c=w[k+h];x+=(q[0]-o[0])*c;y+=(q[1]-o[1])*c;}
      out.push([o[0]+x/W,o[1]+y/W]);}
    return out;
  }
  function byPolygons(result,o,meta){
    const polys=result.polygons,res=+o.resolution>0?+o.resolution:1;
    const total=polys.reduce((s,p)=>s+p.reduce((t,r)=>t+comprimento(r),0),0);
    let step=Math.max(res/2,.05);if(total/step>MAX_VERTICES)step=total/MAX_VERTICES;
    const sigmaM=1.5*res;meta.step=step;meta.sigma=sigmaM;
    meta.method='Contorno reamostrado e suavizado por média gaussiana ao longo do perímetro (σ = 1,5 pixel do MDT)';
    /* cada anel: base reamostrada e versão suavizada; anel pequeno demais para o
       filtro (perímetro < 8σ) fica como está */
    const prep=polys.map(p=>p.map(r=>{
      const base=resample(r,step),per=base.length*step,sig=Math.min(sigmaM,per/8)/step;
      const liso=sig>=.5?gauss(base,sig):null;
      return {r,base,liso};
    }));
    for(const blend of BLENDS){
      const out=prep.map(p=>p.map(({r,base,liso})=>{
        if(!liso||base.length<4)return r.map(q=>q.slice());
        const pts=blend===1?liso:base.map((q,i)=>lerp(q,liso[i],blend));
        /* o filtro não pode engolir o anel: área mínima de 60% da original */
        const ring=pts.concat([pts[0].slice()]);
        return Math.abs(area(ring))<.6*Math.abs(area(r))?r.map(q=>q.slice()):ring;
      }));
      const lines=out.flatMap(p=>p.map(r=>({points:r,closed:true})));
      if(lines.some(l=>l.points.length<4))continue;
      if(anyCrossing(lines))continue;
      if(out.some(p=>p.slice(1).some(h=>!inRing(h[0],p[0]))))continue;
      meta.blend=blend;
      meta.verticesBefore=polys.reduce((s,p)=>s+p.reduce((t,r)=>t+r.length,0),0);
      meta.verticesAfter=out.reduce((s,p)=>s+p.reduce((t,r)=>t+r.length,0),0);
      const areaAntes=result.area;
      result.polygons=out;result.ring=out[0][0];
      result.area=out.reduce((s,p)=>s+p.reduce((t,r,i)=>t+(i?-1:1)*Math.abs(area(r)),0),0);
      meta.areaBefore=areaAntes;meta.areaAfter=result.area;meta.applied=true;
      return;
    }
    meta.reason='a curva cruzaria um furo, outra componente ou a si mesma';
  }
  function apply(result,o={}){
    if(Array.isArray(result.segments)){
      result.segments.forEach(segment=>apply(segment,o));
      result.polygons=result.segments.map(segment=>[segment.ring]);result.ring=result.polygons[0]?.[0]||null;
      result.smoothing={applied:result.segments.length>0&&result.segments.every(s=>s.smoothing?.applied),method:'Margens suavizadas separadamente por trecho'};
      result.warnings=[...new Set([...(result.warnings||[]),...result.segments.flatMap(s=>s.warnings||[])])];return result;
    }
    const meta={applied:false,method:'Catmull-Rom centrípeta pelas margens medidas em cada seção',blend:0};
    try{
      if(Array.isArray(result.polygons)&&o.mode==='axisDepth')byPolygons(result,o,meta);
      else if(Array.isArray(result.sections)&&result.sections.length>=2)bySections(result,o,meta);
      else meta.reason='menos de duas seções';
    }catch(e){meta.reason=e&&e.message||String(e);}
    result.smoothing=meta;
    const w=meta.applied
      ?(meta.blend<1?'Margens suavizadas com curva contida para não cruzar a calha; confira as curvas fechadas.'
        :o.mode==='axisDepth'?'Contorno suavizado: serrilhado dos pixels do MDT removido por média ao longo do perímetro (σ = '+(meta.sigma||0).toFixed(2)+' m).'
        :'Margens suavizadas entre as seções (curva pelos pontos medidos); larguras das seções inalteradas.')
      :'Suavização não aplicada: '+(meta.reason||'geometria incompatível')+'. Mantidas as ligações retas entre seções.';
    (Array.isArray(result.warnings)?result.warnings:(result.warnings=[])).push(w);
    return result;
  }
  return {curve,apply,anyCrossing};
}
window.GeoMineChannelSmoothing={engine};
})();
