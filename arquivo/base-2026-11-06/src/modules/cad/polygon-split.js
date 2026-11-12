/* DIVIDIR POLÍGONOS (Editor de vetores › Polígono; comandos dividir / partesiguais)
   · Por reta: dois cliques (snap e orto como no desenho). Como no CAD, o corte
     só vale onde a reta atravessa o polígono de lado a lado — um trecho de
     contorno que a reta não alcança continua inteiro, mesmo em polígono
     côncavo. Age nos polígonos selecionados ou, sem seleção, nos da camada
     ativa que a reta cruzar. A ferramenta fica armada para o próximo corte.
   · Em partes iguais: N faixas de mesma área, com cortes paralelos na direção
     automática (transversal ao comprimento — eixo principal de inércia da
     área) ou num azimute informado/medido no mapa. Prévia antes de aplicar.
   As partes substituem a feição original na mesma posição da camada, herdam
   os atributos e têm AREA_M2/AREA_HA/AREA_KM2/PERIM_M/PERIM_KM recalculados;
   FID novo para as partes além da primeira. Nenhuma parte é descartada: a
   soma das áreas é conferida com o original antes de aplicar. Um Ctrl+Z
   desfaz a operação. */
(function(){
'use strict';
const TOOL='cad-polysplit';
const $=id=>document.getElementById('gmPsplit'+id);

/* ---------------- motor (coordenadas métricas locais) ---------------- */
const engine=(function(){
  const area=r=>{let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=r[j][0]*r[i][1]-r[i][0]*r[j][1];return a/2;};
  const fechado=r=>{const a=r[0],b=r[r.length-1];return a[0]===b[0]&&a[1]===b[1]?r:r.concat([a.slice()]);};
  /* externo anti-horário (+), furos horários (−): a área de qualquer recorte
     fica sendo a soma das áreas com sinal dos anéis recortados */
  function orienta(mp){
    return mp.map(poly=>poly.map((r,i)=>{const a=area(r);return (i===0)===(a>0)?r:r.slice().reverse();}));
  }
  function areaMP(mp){let t=0;for(const poly of mp)for(const r of poly)t+=area(r);return Math.abs(t);}
  function perimetroMP(mp){let t=0;for(const poly of mp)for(const r of poly){const q=fechado(r);for(let i=1;i<q.length;i++)t+=Math.hypot(q[i][0]-q[i-1][0],q[i][1]-q[i-1][1]);}return t;}
  /* Sutherland–Hodgman contra o semiplano s·p <= c (vale para anel côncavo
     quando só a ÁREA interessa: as arestas degeneradas sobre a reta não somam) */
  function corta(r,s,c){
    const out=[],n=r.length;
    for(let i=0;i<n;i++){
      const p=r[i],q=r[(i+1)%n],dp=s[0]*p[0]+s[1]*p[1]-c,dq=s[0]*q[0]+s[1]*q[1]-c;
      if(dp<=0)out.push(p);
      if((dp<0&&dq>0)||(dp>0&&dq<0)){const t=dp/(dp-dq);out.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);}
    }
    return out;
  }
  function areaAte(mpo,s,c){let t=0;for(const poly of mpo)for(const r of poly){const q=corta(r,s,c);if(q.length>2)t+=area(q);}return t;}
  function extensao(mp){let x0=1/0,y0=1/0,x1=-1/0,y1=-1/0;for(const poly of mp)for(const r of poly)for(const p of r){if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1];}return [x0,y0,x1,y1];}
  /* eixo principal de inércia da área: a direção do "comprimento" */
  function eixoPrincipal(mpo){
    let A=0,Sx=0,Sy=0,Ixx=0,Iyy=0,Ixy=0;
    for(const poly of mpo)for(const r of poly){
      for(let i=0,n=r.length;i<n;i++){
        const [x0,y0]=r[i],[x1,y1]=r[(i+1)%n],c=x0*y1-x1*y0;
        A+=c/2;Sx+=(x0+x1)*c/6;Sy+=(y0+y1)*c/6;
        Iyy+=(x0*x0+x0*x1+x1*x1)*c/12;Ixx+=(y0*y0+y0*y1+y1*y1)*c/12;
        Ixy+=(x0*y1+2*x0*y0+2*x1*y1+x1*y0)*c/24;
      }
    }
    const cx=Sx/A,cy=Sy/A,sxx=Iyy/A-cx*cx,syy=Ixx/A-cy*cy,sxy=Ixy/A-cx*cy;
    return 0.5*Math.atan2(2*sxy,sxx-syy);
  }
  const quad=(a,u,n,R,lado)=>{  // semiplano à esquerda (lado=1) ou direita (-1) da reta por a, direção u
    const p1=[a[0]-u[0]*R,a[1]-u[1]*R],p2=[a[0]+u[0]*R,a[1]+u[1]*R];
    return [[p1,p2,[p2[0]+lado*n[0]*R,p2[1]+lado*n[1]*R],[p1[0]+lado*n[0]*R,p1[1]+lado*n[1]*R],p1]];
  };
  /* POR RETA (segmento AB). Divide pela reta infinita e depois refaz a união
     dos pedaços cuja fronteira comum sobre a reta fica FORA do segmento —
     ali a reta desenhada não passou, então não há corte. */
  function porReta(PC,mp,A,B){
    const dx=B[0]-A[0],dy=B[1]-A[1],len=Math.hypot(dx,dy);
    if(!(len>1e-9))throw Error('A reta de corte precisa de dois pontos distintos.');
    const u=[dx/len,dy/len],n=[-u[1],u[0]],ext=extensao(mp);
    let R=len;for(const x of [ext[0],ext[2]])for(const y of [ext[1],ext[3]])R=Math.max(R,Math.hypot(x-A[0],y-A[1]));
    R=R*2+1;
    const esq=PC.intersection(mp,quad(A,u,n,R,1)),dir=PC.intersection(mp,quad(A,u,n,R,-1));
    if(!esq.length||!dir.length)return null;
    const eps=Math.max(1e-7,R*1e-9);
    const sobre=poly=>{const out=[];for(const r of poly)for(let i=1;i<r.length;i++){
      const p=r[i-1],q=r[i],dp=n[0]*(p[0]-A[0])+n[1]*(p[1]-A[1]),dq=n[0]*(q[0]-A[0])+n[1]*(q[1]-A[1]);
      if(Math.abs(dp)<=eps&&Math.abs(dq)<=eps){const t1=u[0]*(p[0]-A[0])+u[1]*(p[1]-A[1]),t2=u[0]*(q[0]-A[0])+u[1]*(q[1]-A[1]);
        if(Math.abs(t2-t1)>eps)out.push([Math.min(t1,t2),Math.max(t1,t2)]);}}return out;};
    const pecas=esq.map(p=>({poly:p,lado:1,iv:sobre(p)})).concat(dir.map(p=>({poly:p,lado:-1,iv:sobre(p)})));
    const pai=pecas.map((_,i)=>i),raiz=i=>pai[i]===i?i:(pai[i]=raiz(pai[i])),une=(a,b)=>{a=raiz(a);b=raiz(b);if(a!==b)pai[b]=a;};
    const cortada=new Set();
    pecas.forEach((a,i)=>{if(a.lado!==1)return;pecas.forEach((b,j)=>{if(b.lado!==-1)return;
      for(const x of a.iv)for(const y of b.iv){const o0=Math.max(x[0],y[0]),o1=Math.min(x[1],y[1]);
        if(o1-o0<=eps)continue;
        if(o0<-eps||o1>len+eps)une(i,j);else{cortada.add(i);cortada.add(j);}}});});
    const grupos=new Map();pecas.forEach((p,i)=>{const k=raiz(i);if(!grupos.has(k))grupos.set(k,[]);grupos.get(k).push(p);});
    let lista=[...grupos.values()].map(g=>({pecas:g,cortado:g.some(p=>cortada.has(pecas.indexOf(p)))}));
    if(lista.length<2||!lista.some(g=>g.cortado))return null;
    /* ilhas da multiparte que a reta não tocou ficam com a maior parte cortada */
    const soltos=lista.filter(g=>!g.cortado);lista=lista.filter(g=>g.cortado);
    if(lista.length<2)return null;
    const mpDe=g=>g.pecas.length===1?[g.pecas[0].poly]:PC.union(...g.pecas.map(p=>[p.poly]));
    let partes=lista.map(mpDe);
    if(soltos.length){
      const k=partes.reduce((m,p,i)=>areaMP(p)>areaMP(partes[m])?i:m,0);
      partes[k]=PC.union(partes[k],...soltos.map(mpDe));
    }
    return partes;
  }
  /* EM PARTES IGUAIS: cortes paralelos de direção d; varre ao longo de s ⟂ d */
  function iguais(PC,mp,N,azimute){
    const mpo=orienta(mp),total=areaMP(mpo);
    if(!(total>0))throw Error('Polígono sem área.');
    let s;
    if(azimute==null||!Number.isFinite(azimute)){const phi=eixoPrincipal(mpo);s=[Math.cos(phi),Math.sin(phi)];}
    else{const a=azimute*Math.PI/180;s=[Math.cos(a),-Math.sin(a)];}           // ⟂ à direção (sen az, cos az)
    const d=[-s[1],s[0]];
    let tmin=1/0,tmax=-1/0;for(const poly of mpo)for(const r of poly)for(const p of r){const t=s[0]*p[0]+s[1]*p[1];if(t<tmin)tmin=t;if(t>tmax)tmax=t;}
    const cortes=[];let lo0=tmin;
    for(let k=1;k<N;k++){
      const alvo=total*k/N;let lo=lo0,hi=tmax;
      for(let it=0;it<200&&hi-lo>1e-9*Math.max(1,Math.abs(tmax-tmin));it++){const m=(lo+hi)/2;if(areaAte(mpo,s,m)<alvo)lo=m;else hi=m;}
      const c=(lo+hi)/2;cortes.push(c);lo0=c;
    }
    const ext=extensao(mpo),R=Math.hypot(ext[2]-ext[0],ext[3]-ext[1])*2+1,lim=[tmin-1].concat(cortes,[tmax+1]);
    const partes=[];
    for(let k=0;k<N;k++){
      const a=lim[k],b=lim[k+1],o=[s[0]*a,s[1]*a],o2=[s[0]*b,s[1]*b];
      const faixa=[[[o[0]-d[0]*R,o[1]-d[1]*R],[o2[0]-d[0]*R,o2[1]-d[1]*R],[o2[0]+d[0]*R,o2[1]+d[1]*R],[o[0]+d[0]*R,o[1]+d[1]*R],[o[0]-d[0]*R,o[1]-d[1]*R]]];
      const p=PC.intersection(mp,faixa);if(p.length)partes.push(p);
    }
    let az=Math.atan2(d[0],d[1])*180/Math.PI;az=((az%180)+180)%180;
    return {partes,cortes,s,d,azimute:az,total};
  }
  /* trechos da reta s·p = c dentro do polígono (prévia dos cortes) */
  function cordas(mp,s,c){
    const d=[-s[1],s[0]],ts=[];
    for(const poly of mp)for(const r of poly)for(let i=0,n=r.length;i<n;i++){
      const p=r[i],q=r[(i+1)%n],dp=s[0]*p[0]+s[1]*p[1]-c,dq=s[0]*q[0]+s[1]*q[1]-c;
      if((dp<0&&dq>=0)||(dp>=0&&dq<0)){const t=dp/(dp-dq),x=p[0]+t*(q[0]-p[0]),y=p[1]+t*(q[1]-p[1]);ts.push(d[0]*x+d[1]*y);}
    }
    ts.sort((a,b)=>a-b);const out=[];
    for(let i=0;i+1<ts.length;i+=2)out.push([[s[0]*c+d[0]*ts[i],s[1]*c+d[1]*ts[i]],[s[0]*c+d[0]*ts[i+1],s[1]*c+d[1]*ts[i+1]]]);
    return out;
  }
  return {area,areaMP,perimetroMP,orienta,porReta,iguais,cordas,eixoPrincipal};
})();

/* ---------------- feições ⇄ coordenadas locais ---------------- */
function metrico(L,f){
  const def=proj4.defs(S.workCRS);
  if(def&&def.projName!=='longlat')return S.workCRS;
  const r=edRings(L,f)[0]||[[0,0]],w=toWGS(L.crs,r[0][0],r[0][1]),zone=Math.max(1,Math.min(60,Math.floor((w[0]+180)/6)+1));
  return '+proj=utm +zone='+zone+(w[1]<0?' +south':'')+' +datum=WGS84 +units=m +no_defs';
}
function paraLocal(L,f){
  const M=metrico(L,f),rings=edRings(L,f).map(r=>r.map(p=>reproj(L.crs,M,+p[0],+p[1])).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])))
    .filter(r=>r.length>=3).map(r=>{const a=r[0],b=r[r.length-1];return Math.hypot(a[0]-b[0],a[1]-b[1])>1e-9?r.concat([a.slice()]):r;});
  if(!rings.length)return null;
  const e=rings.flat(),O=[e.reduce((t,p)=>t+p[0],0)/e.length,e.reduce((t,p)=>t+p[1],0)/e.length];
  let mp=ringsToPolys(rings.map(r=>r.map(p=>[p[0]-O[0],p[1]-O[1]])));
  try{const u=polygonClipping.union(mp);if(u.length)mp=u;}catch(_){}
  return {mp,O,M};
}
const toLocal=(ctx,crs,p)=>{const q=reproj(crs,ctx.M,p[0],p[1]);return [q[0]-ctx.O[0],q[1]-ctx.O[1]];};
const fromLocal=(ctx,crs,p)=>reproj(ctx.M,crs,p[0]+ctx.O[0],p[1]+ctx.O[1]);

/* "Manter as partes, não excluir nada": a soma das partes tem de fechar com a
   área original. Se não fechar (geometria degenerada, falha da biblioteca),
   a feição NÃO é dividida — fica exatamente como estava. */
function confere(ctx,partes){
  const a0=engine.areaMP(engine.orienta(ctx.mp)),soma=partes.reduce((t,p)=>t+engine.areaMP(engine.orienta(p)),0);
  if(Math.abs(soma-a0)>Math.max(0.01,a0*1e-7))
    throw Error('a soma das partes ('+soma.toFixed(2)+' m²) não fecha com o polígono ('+a0.toFixed(2)+' m²) — nada foi alterado');
  return partes;
}
const CAMPOS={AREA_M2:(a,p)=>a,AREA_HA:a=>a/1e4,AREA_KM2:a=>a/1e6,PERIM_M:(a,p)=>p,PERIMETRO:(a,p)=>p,PERIM_KM:(a,p)=>p/1e3};
function cotasDasPartes(L,f,ctx){
  const rs=edRings(L,f),nested=Array.isArray(f.geom?.[0]?.[0]),vertices=new Map(),edges=[];
  const key=p=>Math.round(p[0]*1e7)+':'+Math.round(p[1]*1e7),number=z=>typeof z==='number'&&Number.isFinite(z)?z:null;let hasZ=false,span=1;
  for(let ri=0;ri<rs.length;ri++){
    const ring=rs[ri],zg=nested&&Array.isArray(f.zg?.[ri])?f.zg[ri]:f.zg;
    const points=ring.map((p,i)=>{
      const xy=toLocal(ctx,L.crs,p),closed=i===ring.length-1&&p[0]===ring[0][0]&&p[1]===ring[0][1];
      const z=number(zg?.[i])??(closed?number(zg?.[0]):null)??number(p[2]);
      if(z!==null)hasZ=true;span=Math.max(span,Math.abs(xy[0]),Math.abs(xy[1]));vertices.set(key(xy),z);return {xy,z};
    });
    for(let i=1;i<points.length;i++)edges.push([points[i-1],points[i]]);
    if(points.length>1&&(points[0].xy[0]!==points.at(-1).xy[0]||points[0].xy[1]!==points.at(-1).xy[1]))edges.push([points.at(-1),points[0]]);
  }
  if(!hasZ)return null;
  const eps=Math.max(1e-7,span*1e-10),eps2=eps*eps;
  return p=>{
    const id=key(p);if(vertices.has(id))return vertices.get(id);
    // New vertices are intersections of the cut with an original edge. Their
    // Z comes from that edge, never from a terrain guessed for the polygon.
    for(const [a,b] of edges){
      if(p[0]<Math.min(a.xy[0],b.xy[0])-eps||p[0]>Math.max(a.xy[0],b.xy[0])+eps||p[1]<Math.min(a.xy[1],b.xy[1])-eps||p[1]>Math.max(a.xy[1],b.xy[1])+eps)continue;
      const dx=b.xy[0]-a.xy[0],dy=b.xy[1]-a.xy[1],den=dx*dx+dy*dy;if(!den)continue;
      const t=Math.max(0,Math.min(1,((p[0]-a.xy[0])*dx+(p[1]-a.xy[1])*dy)/den));
      if((p[0]-a.xy[0]-t*dx)**2+(p[1]-a.xy[1]-t*dy)**2<=eps2)return a.z!==null&&b.z!==null?a.z+(b.z-a.z)*t:null;
    }
    return null;
  };
}
function montaPartes(L,f,ctx,partes,fidLivre){
  const copia=x=>x==null?x:JSON.parse(JSON.stringify(x)),fid=(L.fields||[]).find(fd=>String(fd.name).toUpperCase()==='FID');
  const zAt=cotasDasPartes(L,f,ctx);
  return partes.map((mp,k)=>{
    const rings=[],zr=[];mp.forEach(poly=>poly.forEach(r=>{rings.push(r.map(p=>fromLocal(ctx,L.crs,p)));if(zAt)zr.push(r.map(zAt));}));
    const g={};for(const [key,v] of Object.entries(f))if(!['geom','multi','zg','props'].includes(key)&&key[0]!=='_')g[key]=copia(v);
    g.props=copia(f.props||{});
    g.geom=rings.length>1?rings:rings[0];g.multi=rings.length>1;
    if(zAt)g.zg=g.multi?zr:zr[0];
    const a=engine.areaMP(mp),per=engine.perimetroMP(mp);
    for(const fd of L.fields||[]){
      const calc=CAMPOS[String(fd.name).toUpperCase()];if(!calc)continue;
      const casas=Number.isInteger(fd.decimal)&&fd.decimal>0?fd.decimal:(/HA|KM/i.test(fd.name)?4:2);
      g.props[fd.name]=+calc(a,per).toFixed(casas);
    }
    if(fid&&k>0)g.props[fid.name]=fidLivre();
    return g;
  });
}

/* ---------------- alvos, permissões e aplicação ---------------- */
const sharedChannel=L=>L._channelLink?.version===2&&L._channelLink.role==='polygon'&&L.gtype==='polygon'&&Array.isArray(L._channelLink.entries);
const especial=L=>!!(L._geology||L.cavaDesign||L.tinSurface||L._cava2DesignId||L._rb31Recipe||L._channelLink&&!sharedChannel(L));
function liberada(L){
  if(L.locked){toast('A camada "'+L.name+'" está bloqueada');return false;}
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);return false;}
  if(especial(L)){toast('"'+L.name+'" é gerada por uma ferramenta própria e não pode ser dividida aqui');return false;}
  return true;
}
function selecionados(){
  const out=[],vistos=new Set();
  const add=(L,idx)=>{const f=L&&L.features[idx];if(!f||!f.geom||L.gtype!=='polygon')return;const k=L.id+':'+idx;if(vistos.has(k))return;vistos.add(k);out.push({L,f});};
  for(const i of S.msel?.items||[])add(S.layers.find(L=>L.id===i.layerId),i.idx);
  if(!out.length&&S.selFeat)add(S.selFeat.layer||S.layers.find(L=>L.id===S.selFeat.layerId),S.selFeat.idx);
  if(!out.length&&typeof ED!=='undefined'&&ED.on&&ED.sel)add(ED.sel.L,ED.sel.L.features.indexOf(ED.sel.f));
  return out;
}
function aplica(ops,msg,selecionar){
  /* ops: [{L,f,partes:[feições]}] — uma entrada de desfazer para tudo */
  const grupos=new Map();
  for(const o of ops){if(!grupos.has(o.L))grupos.set(o.L,[]);grupos.get(o.L).push(o);}
  const reg=[],release=window.GeoMineChannelLive?.suspend?.()||(()=>{});
  try{
  for(const [L,lista] of grupos){
    const g={L,ops:[],channelEntries:[]};
    if(sharedChannel(L)){
      const ids=new Set(lista.map(o=>o.f._channelRecipeId).filter(Boolean));
      for(const recipe of L._channelLink.entries)if(ids.has(recipe.id)){
        const before=JSON.parse(JSON.stringify(recipe));recipe.state='detached';recipe.message='Trecho dividido manualmente; atualização pelo eixo pausada para preservar as partes.';
        g.channelEntries.push({id:recipe.id,before,after:JSON.stringify(recipe)});
      }
    }
    lista.map(o=>({...o,idx:L.features.indexOf(o.f)})).filter(o=>o.idx>=0).sort((a,b)=>b.idx-a.idx)
      .forEach(o=>{L.features.splice(o.idx,1,...o.partes);g.ops.push({idx:o.idx,before:o.f,parts:o.partes});});
    reg.push(g);drawLayer(L);
  }
  undoPush({t:'featsplit',L:reg[0].L,grupos:reg,msg});
  if(typeof ED!=='undefined'&&ED.sel&&ops.some(o=>o.f===ED.sel.f)){ED.sel=null;try{edRedraw();edPainelSync();}catch(_){}}
  S.selFeat=null;
  if(typeof mselClear==='function'&&S.msel?.items?.length)mselClear(true);
  if(selecionar){
    S.msel.items=ops.flatMap(o=>o.partes.map(f=>({layerId:o.L.id,idx:o.L.features.indexOf(f)})));
    try{mselHL();mselCount();}catch(_){}
  }
  try{highlightSel();}catch(_){}
  refreshUI();window.GeoMineSessionAutosave?.markDirty(msg);
  }finally{release();}
}
/* um contador por camada e por operação: várias feições divididas de uma vez
   não repetem FID entre si */
function fidsPorCamada(){const m=new Map();return L=>{if(!m.has(L))m.set(L,fidLivre(L));return m.get(L);};}
function fidLivre(L){
  const fd=(L.fields||[]).find(x=>String(x.name).toUpperCase()==='FID');if(!fd)return ()=>undefined;
  let m=-1;for(const f of L.features){const v=+(f.props||{})[fd.name];if(Number.isFinite(v)&&v>m)m=v;}
  return ()=>++m;
}
function undo(a){
  const grupos=(a.grupos||[]).filter(g=>S.layers.includes(g.L));
  const travada=grupos.find(g=>typeof collabCanEditLayer==='function'&&!collabCanEditLayer(g.L,false));
  if(travada){collabCanEditLayer(travada.L,true);return;}
  const release=window.GeoMineChannelLive?.suspend?.()||(()=>{});
  try{
  if(S.undo.at(-1)===a)S.undo.pop();
  S.selFeat=null;if(typeof mselClear==='function'&&S.msel?.items?.length)mselClear(true);
  if(typeof ED!=='undefined'&&ED.sel&&grupos.some(g=>g.L===ED.sel.L))ED.sel=null;
  let n=0;
  for(const g of grupos){
    const partes=new Set(g.ops.flatMap(o=>o.parts));
    for(let i=g.L.features.length-1;i>=0;i--)if(partes.has(g.L.features[i]))g.L.features.splice(i,1);
    g.ops.slice().sort((x,y)=>x.idx-y.idx).forEach(o=>{g.L.features.splice(Math.min(o.idx,g.L.features.length),0,o.before);n++;});
    if(sharedChannel(g.L))for(const change of g.channelEntries||[]){const index=g.L._channelLink.entries.findIndex(e=>e.id===change.id);if(index>=0&&JSON.stringify(g.L._channelLink.entries[index])===change.after)g.L._channelLink.entries[index]=change.before;}
    drawLayer(g.L);
  }
  try{edRedraw();highlightSel();}catch(_){}
  refreshUI();window.GeoMineSessionAutosave?.markDirty('divisão desfeita');
  toast('Divisão desfeita: '+n+' polígono(s) restaurado(s)');
  }finally{release();}
}

/* ---------------- ferramenta de reta (corte ou direção) ---------------- */
let cur=null,frame=null,swallowUntil=0,rend=null;
/* um único canvas para a reta e a prévia: um por desenho acumulava ~40 MB
   a cada atualização */
function renderer(){if(!rend)rend=L2.canvas({pane:'alagis_desenho',padding:.3});return rend;}
function traco(lls,grupo){
  const r=renderer();
  return [L2.polyline(lls,{renderer:r,pane:'alagis_desenho',color:'#101820',weight:5,opacity:.75,interactive:false}).addTo(grupo),
          L2.polyline(lls,{renderer:r,pane:'alagis_desenho',color:'#ffffff',weight:2.2,dashArray:'7 5',interactive:false}).addTo(grupo)];
}
function hint(t){if(cur&&cur.hint.textContent!==t)cur.hint.textContent=t;}
function instrucao(){
  if(!cur)return;
  const alvo=cur.modo==='direcao'?'Direção dos cortes':'Dividir por reta'+(cur.alvos?' · '+cur.alvos.length+' polígono(s) selecionado(s)':' · camada "'+cur.camada.name+'"');
  hint(alvo+' · '+(cur.pts.length?'2/2 · clique no 2º ponto':'1/2 · clique no 1º ponto da reta')+' · Esc: sair'+(cur.pts.length?' · Backspace: voltar':''));
}
function valido(){return cur&&S.tool===TOOL&&S.projectId===cur.projeto;}
function cancel(restaura=true){
  if(!cur)return;const a=cur;cur=null;if(frame!==null)cancelAnimationFrame(frame);frame=null;
  map.removeLayer(a.grupo);a.hint.remove();if(!previa&&rend){map.removeLayer(rend);rend=null;}if(a.arrasto)map.dragging.enable();map.getContainer().style.cursor='';
  if(restaura&&S.tool===TOOL)setTool('select');
  if(a.modo==='direcao'&&a.volta)a.volta(null);
}
function inicia(modo,volta){
  let alvos=null,camada=null;
  if(modo==='reta'){
    const sel=selecionados();
    if(sel.length){if(!sel.every(o=>liberada(o.L)))return;alvos=sel;}
    else{camada=activeLayer();
      if(!camada||camada.gtype!=='polygon'){toast('Selecione os polígonos a dividir ou ative uma camada de polígonos');return;}
      if(!liberada(camada))return;}
  }
  cancel(false);setTool(TOOL);
  const grupo=L2.layerGroup().addTo(map),cont=map.getContainer();
  const linha=traco([],grupo);
  const marca=L2.circleMarker(map.getCenter(),{renderer:renderer(),pane:'alagis_desenho',radius:5,color:'#37c0aa',weight:2,fill:false,opacity:0,interactive:false}).addTo(grupo);
  const el=document.createElement('div');el.id='gmPsplitHint';el.setAttribute('role','status');
  el.style.cssText='position:absolute;bottom:56px;left:50%;transform:translateX(-50%);max-width:90%;padding:10px 14px;z-index:1000;background:#142334;color:white;border:1px solid #f5a524;border-radius:7px;pointer-events:none;font:13px sans-serif';
  cont.appendChild(el);
  cur={modo,volta,alvos,camada,pts:[],projeto:S.projectId,grupo,linha,marca,hint:el,arrasto:map.dragging.enabled()};
  map.dragging.disable();cont.style.cursor='crosshair';instrucao();
}
function resolve(ll){
  const a=cur,crs=S.workCRS,anc=a.pts.length?(()=>{const w=toWGS(crs,a.pts[0][0],a.pts[0][1]);return L2.latLng(w[1],w[0]);})():null;
  const hit=window.GeoMineOrtho?GeoMineOrtho.resolve(ll,{anchor:anc,crs}):(typeof snapLatLng==='function'?snapLatLng(ll,null,{flash:false}):{latlng:ll});
  a.marca.setLatLng(hit.latlng).setStyle({opacity:1,color:hit.snapped?'#37c0aa':'#f5a524'});
  return {p:fromWGS(crs,hit.latlng.lng,hit.latlng.lat),ll:hit.latlng};
}
function render(){
  frame=null;if(!valido()){cancel();return;}
  const a=cur;if(!a.hover)return;
  try{const r=resolve(a.hover);
    if(a.pts.length){const w=toWGS(S.workCRS,a.pts[0][0],a.pts[0][1]);a.linha.forEach(l=>l.setLatLngs([[w[1],w[0]],r.ll]));
      const dx=r.p[0]-a.pts[0][0],dy=r.p[1]-a.pts[0][1];let az=Math.atan2(dx,dy)*180/Math.PI;if(az<0)az+=360;
      hint((a.modo==='direcao'?'Direção':'Reta')+': '+Math.hypot(dx,dy).toFixed(2)+' m · azimute '+az.toFixed(2)+'° · clique no 2º ponto · Esc: sair · Backspace: voltar');}
  }catch(e){hint(e.message);}
}
function move(ll){if(!valido()){cancel();return;}cur.hover=ll;if(frame===null)frame=requestAnimationFrame(render);}
async function click(ll){
  if(!valido()){cancel();return;}
  const a=cur,r=resolve(ll);
  if(!a.pts.length){a.pts.push(r.p);instrucao();return;}
  const A=a.pts[0],B=r.p;a.pts=[];a.linha.forEach(l=>l.setLatLngs([]));
  if(Math.hypot(B[0]-A[0],B[1]-A[1])<1e-6){hint('Os dois pontos coincidem — marque a reta de novo');return;}
  if(a.modo==='direcao'){
    let az=Math.atan2(B[0]-A[0],B[1]-A[1])*180/Math.PI;az=((az%180)+180)%180;
    const volta=a.volta;a.volta=null;cancel();volta&&volta(az);return;
  }
  await cortaPorReta(a,A,B);
}
async function cortaPorReta(a,A,B){
  /* A e B no CRS de trabalho; candidatos pela caixa envolvente da reta */
  const W=[Math.min(A[0],B[0]),Math.min(A[1],B[1]),Math.max(A[0],B[0]),Math.max(A[1],B[1])];
  if(a.camada&&!S.layers.includes(a.camada)){cancel();return;}
  let cand=a.alvos?a.alvos.filter(o=>o.L.features.includes(o.f)):
    a.camada.features.filter(f=>f&&f.geom&&(typeof featureVisible!=='function'||featureVisible(a.camada,f))).map(f=>({L:a.camada,f}));
  cand=cand.filter(o=>{const rs=edRings(o.L,o.f);let x0=1/0,y0=1/0,x1=-1/0,y1=-1/0;
    for(const r of rs)for(const p of r){const q=reproj(o.L.crs,S.workCRS,+p[0],+p[1]);if(q[0]<x0)x0=q[0];if(q[0]>x1)x1=q[0];if(q[1]<y0)y0=q[1];if(q[1]>y1)y1=q[1];}
    return !(x1<W[0]||x0>W[2]||y1<W[1]||y0>W[3]);});
  const ops=[],fids=fidsPorCamada();let falhas=0,ultimaFalha='';
  for(const o of cand){
    try{
      const ctx=paraLocal(o.L,o.f);if(!ctx)continue;
      const pA=toLocal(ctx,S.workCRS,A),pB=toLocal(ctx,S.workCRS,B),partes=engine.porReta(polygonClipping,ctx.mp,pA,pB);
      if(partes&&partes.length>1)confere(ctx,partes);
      if(partes&&partes.length>1)ops.push({L:o.L,f:o.f,partes:montaPartes(o.L,o.f,ctx,partes,fids(o.L))});
    }catch(e){falhas++;ultimaFalha=e.message;console.warn('dividir por reta:',e);}
  }
  if(!ops.length){hint((falhas?'Nenhum polígono dividido: '+ultimaFalha:'A reta não atravessa nenhum polígono de lado a lado')+' · marque outra reta · Esc: sair');return;}
  const n=ops.reduce((t,o)=>t+o.partes.length,0);
  aplica(ops,'polígono dividido por reta',!!a.alvos);
  if(a.alvos)a.alvos=ops.flatMap(o=>o.partes.map(f=>({L:o.L,f}))).concat(a.alvos.filter(x=>!ops.some(o=>o.f===x.f)&&x.L.features.includes(x.f)));
  toast(ops.length+' polígono(s) dividido(s) em '+n+' partes — Ctrl+Z desfaz');
  hint(ops.length+' polígono(s) dividido(s) em '+n+' partes'+(falhas?' · '+falhas+' não dividido(s): '+ultimaFalha:'')+' · marque outra reta · Esc: sair');
}

/* ---------------- partes iguais: janela, prévia e aplicação ---------------- */
let previa=null,previaTimer=null;
function limpaPrevia(){if(previa){map.removeLayer(previa);previa=null;}if(!cur&&rend){map.removeLayer(rend);rend=null;}}
function leOpcoes(){
  const N=Math.round(+$('N').value),auto=$('Dir').value==='auto',az=+String($('Az').value).replace(',','.');
  if(!(N>=2&&N<=500))throw Error('Informe de 2 a 500 partes.');
  if(!auto&&!Number.isFinite(az))throw Error('Informe o azimute dos cortes em graus (0° = norte–sul).');
  return {N,az:auto?null:az};
}
function calculaIguais(alvos,o){
  return alvos.map(x=>{const ctx=paraLocal(x.L,x.f);if(!ctx)throw Error('Polígono sem geometria válida.');
    const r=engine.iguais(polygonClipping,ctx.mp,o.N,o.az);confere(ctx,r.partes);return {x,ctx,r};});
}
function mostraPrevia(){
  limpaPrevia();$('Status').textContent='';
  const alvos=selecionados();if(!alvos.length)return;
  let o;try{o=leOpcoes();}catch(e){$('Status').textContent=e.message;return;}
  try{
    const res=calculaIguais(alvos,o);previa=L2.layerGroup().addTo(map);let txt=[];
    for(const {x,ctx,r} of res){
      const mpo=engine.orienta(ctx.mp);
      for(const c of r.cortes)for(const seg of engine.cordas(mpo,r.s,c)){
        const ll=seg.map(p=>{const q=fromLocal(ctx,x.L.crs,p),w=toWGS(x.L.crs,q[0],q[1]);return [w[1],w[0]];});
        traco(ll,previa);
      }
      txt.push((r.total/o.N/1e4).toLocaleString('pt-BR',{maximumFractionDigits:4})+' ha cada · cortes a '+r.azimute.toFixed(1)+'°');
    }
    $('Status').textContent='Prévia: '+(txt.length===1?txt[0]:txt.length+' polígonos ('+txt[0]+' no 1º)');
  }catch(e){$('Status').textContent='Não foi possível calcular: '+e.message;}
}
function agendaPrevia(){clearTimeout(previaTimer);previaTimer=setTimeout(mostraPrevia,250);}
function resumo(){
  const alvos=selecionados();
  if(!alvos.length)return 'Nenhum polígono selecionado. Feche, selecione um ou mais polígonos no mapa e abra de novo.';
  let a=0;for(const x of alvos){const c=paraLocal(x.L,x.f);if(c)a+=engine.areaMP(c.mp);}
  return alvos.length+' polígono(s) selecionado(s) · '+(a/1e4).toLocaleString('pt-BR',{maximumFractionDigits:4})+' ha no total.';
}
function abreIguais(){
  const alvos=selecionados();
  if(!alvos.length){toast('Selecione um ou mais polígonos no mapa e depois use Dividir em partes iguais');return;}
  if(!alvos.every(o=>liberada(o.L)))return;
  let m=$('Modal');
  if(!m){
    m=document.createElement('div');m.id='gmPsplitModal';m.className='modal-bg';
    m.innerHTML='<style>#gmPsplitModal [hidden]{display:none!important}#gmPsplitModal label.field{display:block;margin-top:10px}#gmPsplitModal input,#gmPsplitModal select{width:100%}#gmPsplitStatus:empty{display:none}</style>'+
      '<div class="modal" style="width:min(440px,94vw)"><div class="modal-h"><b>Dividir em partes iguais</b><div style="flex:1"></div><button class="tbtn" id="gmPsplitClose">Fechar</button></div>'+
      '<div class="modal-b"><div id="gmPsplitResumo" class="hint"></div>'+
      '<label class="field" for="gmPsplitN">Número de partes</label><input id="gmPsplitN" type="number" min="2" max="500" step="1" value="2">'+
      '<label class="field" for="gmPsplitDir">Direção dos cortes</label><select id="gmPsplitDir"><option value="auto">Automática — transversal ao comprimento do polígono</option><option value="az">Azimute informado</option></select>'+
      '<div id="gmPsplitAzBox" hidden><label class="field" for="gmPsplitAz">Azimute dos cortes (°, 0 = norte–sul, sentido horário)</label>'+
      '<div style="display:flex;gap:8px"><input id="gmPsplitAz" type="text" inputmode="decimal" value="0" style="flex:1"><button class="tbtn" id="gmPsplitMedir" type="button">Medir no mapa</button></div></div>'+
      '<div class="hint" style="margin-top:8px">Os cortes são paralelos entre si e cada parte fica com a mesma área. Num polígono recortado, uma faixa pode sair em mais de um pedaço — continua sendo uma parte.</div>'+
      '<div id="gmPsplitStatus" class="hint" role="status" aria-live="polite" style="margin-top:8px;color:var(--amber)"></div></div>'+
      '<div style="padding:10px 12px;border-top:1px solid var(--border);display:flex;gap:8px"><button class="tbtn" id="gmPsplitOk" style="flex:1;background:var(--amber);color:#18130a">Dividir</button><button class="tbtn" id="gmPsplitCancel">Cancelar</button></div></div>';
    document.body.appendChild(m);
    const fecha=()=>{m.classList.remove('on');limpaPrevia();};
    $('Close').onclick=fecha;$('Cancel').onclick=fecha;
    $('Dir').onchange=()=>{$('AzBox').hidden=$('Dir').value!=='az';agendaPrevia();};
    $('N').oninput=agendaPrevia;$('Az').oninput=agendaPrevia;
    $('Medir').onclick=()=>{m.classList.remove('on');limpaPrevia();
      inicia('direcao',az=>{m.classList.add('on');if(az!=null){$('Az').value=az.toFixed(2);$('Dir').value='az';$('AzBox').hidden=false;}$('Resumo').textContent=resumo();agendaPrevia();});};
    $('Ok').onclick=()=>{
      try{
        const alvos=selecionados();if(!alvos.length)throw Error('Selecione os polígonos no mapa.');
        if(!alvos.every(x=>liberada(x.L)))return;
        const o=leOpcoes(),res=calculaIguais(alvos,o),fids=fidsPorCamada(),ops=res.map(({x,ctx,r})=>({L:x.L,f:x.f,partes:montaPartes(x.L,x.f,ctx,r.partes,fids(x.L))}));
        fecha();aplica(ops,'polígono dividido em partes iguais',true);
        const n=ops.reduce((t,q)=>t+q.partes.length,0);
        toast(ops.length+' polígono(s) dividido(s) em '+n+' partes iguais — Ctrl+Z desfaz');
      }catch(e){$('Status').textContent=e.message;}
    };
  }
  $('Resumo').textContent=resumo();$('AzBox').hidden=$('Dir').value!=='az';m.classList.add('on');agendaPrevia();
  requestAnimationFrame(()=>enquadra(alvos,m.querySelector('.modal')));
}
/* As janelas do GeoMine abrem no canto do mapa. Se a janela esconder os
   polígonos, o mapa se ajusta para mostrá-los ao lado dela — a prévia dos
   cortes precisa estar à vista. Nunca aproxima além do zoom atual. */
function enquadra(alvos,caixa){
  try{
    let b=null;
    for(const x of alvos)for(const r of edRings(x.L,x.f))for(const p of r){const w=toWGS(x.L.crs,+p[0],+p[1]),ll=L2.latLng(w[1],w[0]);b=b?b.extend(ll):L2.latLngBounds(ll,ll);}
    if(!b||!caixa)return;
    const c=map.getContainer().getBoundingClientRect(),k=caixa.getBoundingClientRect(),esq=Math.max(16,k.right-c.left+16);
    if(esq>c.width-120)return;                                   // tela estreita: não há lado livre
    const a=map.latLngToContainerPoint(b.getNorthWest()),z=map.latLngToContainerPoint(b.getSouthEast());
    if(a.x>=esq&&a.y>=8&&z.x<=c.width-8&&z.y<=c.height-8)return;  // já está à vista
    map.fitBounds(b,{paddingTopLeft:[esq,24],paddingBottomRight:[24,24],maxZoom:map.getZoom(),animate:false});
  }catch(_){}
}

/* ---------------- eventos do mapa ---------------- */
const cont=map.getContainer(),controle=e=>e.target.closest?.('.leaflet-control,.edbox,input,button,select,textarea');
cont.addEventListener('pointermove',e=>{if(!cur||controle(e)||e.buttons&4)return;e.stopImmediatePropagation();move(map.mouseEventToLatLng(e));},true);
cont.addEventListener('mousemove',e=>{if(cur&&!controle(e))e.stopImmediatePropagation();},true);
cont.addEventListener('pointerdown',e=>{if(!cur||e.button!==0||controle(e))return;e.preventDefault();e.stopImmediatePropagation();swallowUntil=Date.now()+400;
  click(map.mouseEventToLatLng(e)).catch(err=>{hint(err.message);toast(err.message);});},true);
cont.addEventListener('pointerup',()=>{if(cur)swallowUntil=Date.now()+400;},true);
cont.addEventListener('click',e=>{if(cur&&!controle(e)||Date.now()<swallowUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(cur){e.preventDefault();e.stopImmediatePropagation();cancel();return;}
    if($('Modal')?.classList.contains('on')){e.preventDefault();e.stopImmediatePropagation();$('Modal').classList.remove('on');limpaPrevia();}
    return;
  }
  if(!cur||e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  if(e.key==='Backspace'&&cur.pts.length){e.preventDefault();e.stopImmediatePropagation();cur.pts=[];cur.linha.forEach(l=>l.setLatLngs([]));instrucao();}
},true);
map.on('moveend zoomend',()=>{if(cur){if(!valido())cancel();else if(cur.hover)move(cur.hover);}});
window.GeoMinePolygonSplit={engine,start:inicia,openEqual:abreIguais,cancel,undo,state:()=>cur?{modo:cur.modo,pts:cur.pts.map(p=>p.slice())}:null};
})();
