
/* ============================================================================
   CCMGIS · ANÁLISE MULTICRITÉRIO DE FAVORABILIDADE
   Multicriteria Favorability Analysis

   Combina critérios geológicos, ambientais, territoriais, legais, hidrológicos
   e logísticos numa grade comum e produz: potencial geológico, viabilidade de
   implantação, favorabilidade integrada, máscara legal independente, mapa
   classificado, polígonos de áreas prioritárias e a tabela de ranking.

   PRINCÍPIO CENTRAL DO MÉTODO
   A legalidade é PENEIRA, não nota. Uma célula com máscara legal igual a zero
   sai como classe "Excluded" e nunca participa da média ponderada — geologia
   ótima e logística ótima não podem transformá-la em favorável.

   Este bloco é aditivo: não remove nem altera nenhuma função anterior do
   CCMGIS. Apenas duas funções globais são ENVELOPADAS (projectData e
   loadProject), sempre chamando a versão original antes de acrescentar o
   próprio estado — mesmo padrão já usado em alagis-119-filtro-tabela-qgis.
   ========================================================================== */
(function(){
'use strict';
if(window.MCF){ console.info('[MCF] já instalado'); return; }
/* ===========================================================================
   NÚCLEO DE CÁLCULO — texto puro, sem dependência de DOM.
   O MESMO texto roda em duas situações: dentro do Web Worker (blob) e, quando
   o navegador recusa o worker (file:// em alguns navegadores), dentro de uma
   função construída no próprio documento. Ter um único texto é o que garante
   que os dois caminhos produzam exatamente o mesmo resultado.
   ========================================================================= */
const MCF_K1 = String.raw`
"use strict";
var MCF_NODATA_IN=NaN;

/* ---------- utilidades de grade ----------
   Convenção do CCMGIS: linha 0 é o TOPO; (xll,yll) é o canto inferior-esquerdo. */
function gCX(G,c){ return G.xll+(c+0.5)*G.cs; }
function gCY(G,r){ return G.yll+(G.nr-r-0.5)*G.cs; }
function gN(G){ return G.nc*G.nr; }
function newF32(n,v){ var a=new Float32Array(n); if(v!==undefined)a.fill(v); return a; }

/* ---------- ponto em polígono (par/ímpar sobre TODOS os anéis) ---------- */
function ringHas(ring,x,y){
  var d=false,n=ring.length;
  for(var i=0,j=n-1;i<n;j=i++){
    var xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    if(((yi>y)!==(yj>y)) && x < (xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi) d=!d;
  }
  return d;
}
function featHas(feat,x,y){
  var bb=feat.bb; if(x<bb[0]||x>bb[2]||y<bb[1]||y>bb[3]) return false;
  var d=false;
  for(var i=0;i<feat.rings.length;i++) if(ringHas(feat.rings[i],x,y)) d=!d;
  return d;
}
function bboxOfRings(rings){
  var x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(var i=0;i<rings.length;i++) for(var j=0;j<rings[i].length;j++){
    var p=rings[i][j];
    if(p[0]<x0)x0=p[0]; if(p[0]>x1)x1=p[0];
    if(p[1]<y0)y0=p[1]; if(p[1]>y1)y1=p[1];
  }
  return [x0,y0,x1,y1];
}
function prepFeats(feats){
  var out=[];
  for(var i=0;i<feats.length;i++){
    var rings=feats[i].rings||[]; if(!rings.length) continue;
    out.push({rings:rings, bb:bboxOfRings(rings), props:feats[i].props||null});
  }
  return out;
}

/* ---------- rasterização de polígono por VARREDURA DE LINHA ----------
   Percorre as arestas uma vez por linha da grade em vez de testar cada célula
   contra cada aresta: sem isto uma camada com 50 mil vértices numa grade de
   500x500 já custa minutos. */
function rasterPolygons(G,feats,out,val){
  var edges=[];
  for(var f=0;f<feats.length;f++){
    var rings=feats[f].rings;
    for(var ri=0;ri<rings.length;ri++){
      var R=rings[ri],n=R.length;
      for(var i=0,j=n-1;i<n;j=i++){
        var y0=R[j][1],y1=R[i][1];
        if(y0===y1) continue;                       /* horizontal não cruza */
        edges.push([R[j][0],y0,R[i][0],y1]);
      }
    }
  }
  if(!edges.length) return out;
  var xs=[];
  for(var r=0;r<G.nr;r++){
    var y=gCY(G,r); xs.length=0;
    for(var e=0;e<edges.length;e++){
      var E=edges[e],ya=E[1],yb=E[3];
      if((ya>y)!==(yb>y)) xs.push(E[0]+(y-ya)*(E[2]-E[0])/(yb-ya));
    }
    if(xs.length<2) continue;
    xs.sort(function(a,b){return a-b;});
    for(var k=0;k+1<xs.length;k+=2){
      var c0=Math.ceil((xs[k]-G.xll)/G.cs-0.5), c1=Math.floor((xs[k+1]-G.xll)/G.cs-0.5);
      if(c1<0||c0>=G.nc) continue;
      if(c0<0)c0=0; if(c1>=G.nc)c1=G.nc-1;
      var base=r*G.nc;
      for(var c=c0;c<=c1;c++) out[base+c]=val;
    }
  }
  return out;
}

/* Células ATRAVESSADAS por um segmento (DDA por amostragem densa). Usada para
   linhas e para o modo "sobreposição parcial" das máscaras. */
function rasterSegments(G,segs,out,val){
  for(var s=0;s<segs.length;s+=4){
    var ax=segs[s],ay=segs[s+1],bx=segs[s+2],by=segs[s+3];
    var L=Math.hypot(bx-ax,by-ay), n=Math.max(1,Math.ceil(L/(G.cs*0.45)));
    for(var i=0;i<=n;i++){
      var t=i/n, x=ax+(bx-ax)*t, y=ay+(by-ay)*t;
      var c=Math.floor((x-G.xll)/G.cs), r=G.nr-1-Math.floor((y-G.yll)/G.cs);
      if(c>=0&&c<G.nc&&r>=0&&r<G.nr) out[r*G.nc+c]=val;
    }
  }
  return out;
}
function rasterPoints(G,pts,out,val){
  for(var i=0;i<pts.length;i++){
    var c=Math.floor((pts[i][0]-G.xll)/G.cs), r=G.nr-1-Math.floor((pts[i][1]-G.yll)/G.cs);
    if(c>=0&&c<G.nc&&r>=0&&r<G.nr) out[r*G.nc+c]=val;
  }
  return out;
}
function segsOfFeats(feats,closeRings){
  var s=[];
  for(var f=0;f<feats.length;f++){
    var rings=feats[f].rings;
    for(var ri=0;ri<rings.length;ri++){
      var R=rings[ri];
      for(var i=1;i<R.length;i++) s.push(R[i-1][0],R[i-1][1],R[i][0],R[i][1]);
      if(closeRings&&R.length>2){
        var a=R[R.length-1],b=R[0];
        if(a[0]!==b[0]||a[1]!==b[1]) s.push(a[0],a[1],b[0],b[1]);
      }
    }
  }
  return s;
}

/* ---------- DISTÂNCIA EUCLIDIANA EXATA ATÉ A GEOMETRIA ----------
   Índice de baldes uniforme + busca em anéis crescentes. Diferente de uma
   transformada de distância sobre células, isto mede até o SEGMENTO real, e
   não até o centro da célula semente: para polígono a distância é até o
   limite geométrico mais próximo, como pede a metodologia. */
function segIndexBuild(segs,cell){
  var x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,i;
  for(i=0;i<segs.length;i+=2){
    var x=segs[i],y=segs[i+1];
    if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
  }
  if(!isFinite(x0)) return null;
  var nx=Math.max(1,Math.min(2048,Math.ceil((x1-x0)/cell)+1));
  var ny=Math.max(1,Math.min(2048,Math.ceil((y1-y0)/cell)+1));
  var cx=(x1-x0)/nx||1, cy=(y1-y0)/ny||1;
  var buckets=new Array(nx*ny); for(i=0;i<buckets.length;i++) buckets[i]=null;
  for(i=0;i<segs.length;i+=4){
    var ax=segs[i],ay=segs[i+1],bx=segs[i+2],by=segs[i+3];
    var ca0=Math.max(0,Math.min(nx-1,Math.floor((Math.min(ax,bx)-x0)/cx)));
    var ca1=Math.max(0,Math.min(nx-1,Math.floor((Math.max(ax,bx)-x0)/cx)));
    var ra0=Math.max(0,Math.min(ny-1,Math.floor((Math.min(ay,by)-y0)/cy)));
    var ra1=Math.max(0,Math.min(ny-1,Math.floor((Math.max(ay,by)-y0)/cy)));
    for(var r=ra0;r<=ra1;r++) for(var c=ca0;c<=ca1;c++){
      var k=r*nx+c; if(!buckets[k]) buckets[k]=[]; buckets[k].push(i);
    }
  }
  return {segs:segs,buckets:buckets,nx:nx,ny:ny,cx:cx,cy:cy,x0:x0,y0:y0,x1:x1,y1:y1};
}
function distSeg(x,y,ax,ay,bx,by){
  var dx=bx-ax,dy=by-ay,L=dx*dx+dy*dy;
  var t=L?((x-ax)*dx+(y-ay)*dy)/L:0;
  if(t<0)t=0; else if(t>1)t=1;
  return Math.hypot(x-(ax+t*dx), y-(ay+t*dy));
}
function segIndexNearest(IX,x,y,cap){
  if(!IX) return Infinity;
  var S=IX.segs,B=IX.buckets;
  var cc=Math.max(0,Math.min(IX.nx-1,Math.floor((x-IX.x0)/IX.cx)));
  var cr=Math.max(0,Math.min(IX.ny-1,Math.floor((y-IX.y0)/IX.cy)));
  var best=Infinity, step=Math.min(IX.cx,IX.cy);
  var maxRing=Math.max(IX.nx,IX.ny);
  for(var ring=0;ring<=maxRing;ring++){
    /* o anel anterior já garante a resposta quando a distância encontrada é
       menor que a menor distância possível do anel seguinte */
    if(best<Infinity && best<=(ring-1)*step) break;
    if(cap!==undefined && (ring-1)*step>cap && best===Infinity) return Infinity;
    var r0=cr-ring,r1=cr+ring,c0=cc-ring,c1=cc+ring,r,c,k,list,i,j;
    for(r=r0;r<=r1;r++){
      if(r<0||r>=IX.ny) continue;
      for(c=c0;c<=c1;c++){
        if(c<0||c>=IX.nx) continue;
        if(ring>0 && r!==r0 && r!==r1 && c!==c0 && c!==c1) continue;  /* só a casca */
        k=r*IX.nx+c; list=B[k]; if(!list) continue;
        for(i=0;i<list.length;i++){
          j=list[i];
          var d=distSeg(x,y,S[j],S[j+1],S[j+2],S[j+3]);
          if(d<best) best=d;
        }
      }
    }
  }
  return best;
}
function distanceRaster(G,segs,pts,opt,prog){
  var out=newF32(gN(G),NaN);
  var IX=segs&&segs.length?segIndexBuild(segs,Math.max(G.cs*4,50)):null;
  var PX=null;
  if(pts&&pts.length){
    var ps=[]; for(var i=0;i<pts.length;i++) ps.push(pts[i][0],pts[i][1],pts[i][0],pts[i][1]);
    PX=segIndexBuild(ps,Math.max(G.cs*4,50));
  }
  var inside=opt.insideMask||null, cap=(opt.max>0?opt.max:undefined);
  for(var r=0;r<G.nr;r++){
    if(prog&&(r%24===0)) prog(r/G.nr);
    var y=gCY(G,r), base=r*G.nc;
    for(var c=0;c<G.nc;c++){
      var k=base+c;
      if(inside&&inside[k]&&opt.insideZero){ out[k]=0; continue; }
      var x=gCX(G,c);
      var d=Infinity;
      if(IX) d=Math.min(d,segIndexNearest(IX,x,y,cap));
      if(PX) d=Math.min(d,segIndexNearest(PX,x,y,cap));
      if(!isFinite(d)) { out[k]=(cap!==undefined?cap:NaN); continue; }
      if(cap!==undefined&&d>cap) d=cap;
      out[k]=d;
    }
  }
  return out;
}

/* ---------- reamostragem de raster externo para a grade de análise ---------- */
function resampleTo(G,src,mode,work){
  var out=newF32(gN(G),NaN);
  var scy=src.csy||src.cs;
  for(var r=0;r<G.nr;r++){
    var y=gCY(G,r), base=r*G.nc;
    for(var c=0;c<G.nc;c++){
      if(work&&!work[base+c]) continue;
      var x=gCX(G,c);
      var fc=(x-src.xll)/src.cs-0.5, fr=(src.nr-1)-((y-src.yll)/scy-0.5);
      var v=NaN;
      if(mode==='bilinear'){
        var c0=Math.floor(fc),r0=Math.floor(fr),tx=fc-c0,ty=fr-r0;
        var s=0,w=0;
        for(var dr=0;dr<2;dr++) for(var dc=0;dc<2;dc++){
          var rr=r0+dr,ccc=c0+dc;
          if(rr<0||rr>=src.nr||ccc<0||ccc>=src.nc) continue;
          var q=src.z[rr*src.nc+ccc]; if(q==null||!isFinite(q)) continue;
          var ww=(dc?tx:1-tx)*(dr?ty:1-ty); s+=q*ww; w+=ww;
        }
        v=w>0?s/w:NaN;
      }else{
        var rc=Math.round(fc),rr2=Math.round(fr);
        if(rc>=0&&rc<src.nc&&rr2>=0&&rr2<src.nr){
          var q2=src.z[rr2*src.nc+rc]; v=(q2==null||!isFinite(q2))?NaN:q2;
        }
      }
      out[base+c]=v;
    }
  }
  return out;
}

/* ---------- padronização para a escala 0..5 ---------- */
function applyRules(v,rules){
  if(v==null||!isFinite(v)) return NaN;
  for(var i=0;i<rules.length;i++){
    var R=rules[i];
    var lo=(R.min===null||R.min===undefined)?-Infinity:+R.min;
    var hi=(R.max===null||R.max===undefined)?Infinity:+R.max;
    var okLo=R.incLow===false ? v>lo : v>=lo;
    var okHi=R.incHigh===true ? v<=hi : (hi===Infinity? true : v<hi);
    if(okLo&&okHi) return +R.score;
  }
  return NaN;
}
function applyLookup(v,lookup,fallback){
  var s=String(v);
  for(var i=0;i<lookup.length;i++){
    if(String(lookup[i].value)===s) return +lookup[i].score;
  }
  return (fallback===undefined||fallback===null)?NaN:+fallback;
}
function clamp05(v){ if(!isFinite(v)) return NaN; return v<0?0:(v>5?5:v); }
function linScore(v,a,b,increasing){
  if(!isFinite(v)) return NaN;
  if(b===a) return increasing?5:0;
  var t=(v-a)/(b-a); if(t<0)t=0; if(t>1)t=1;
  return increasing? t*5 : (1-t)*5;
}
function piecewise(v,pts){
  if(!isFinite(v)||!pts.length) return NaN;
  if(v<=pts[0].x) return +pts[0].y;
  for(var i=1;i<pts.length;i++){
    if(v<=pts[i].x){
      var t=(v-pts[i-1].x)/((pts[i].x-pts[i-1].x)||1e-12);
      return +pts[i-1].y+t*(+pts[i].y-+pts[i-1].y);
    }
  }
  return +pts[pts.length-1].y;
}
function fuzzy(v,f){
  if(!isFinite(v)) return NaN;
  var t;
  if(f.type==='gauss'){ var s=(+f.b)||1; t=Math.exp(-Math.pow((v-(+f.a))/s,2)/2); }
  else if(f.type==='sigmoid'){ var k=(+f.b)||1; t=1/(1+Math.exp(-(v-(+f.a))/k)); }
  else { var a=+f.a,b=+f.b; t=(b===a)?1:(v-a)/(b-a); if(t<0)t=0; if(t>1)t=1; }
  if(f.invert) t=1-t;
  return t*5;
}
function standardize(crit,raw,n){
  var out=newF32(n,NaN),i,v;
  var m=crit.method;
  if(m==='lookup'){
    for(i=0;i<n;i++) out[i]=clamp05(applyLookup(raw[i],crit.lookup||[],crit.lookupFallback));
  }else if(m==='linInc'||m==='linDec'){
    var a=+crit.lin.min,b=+crit.lin.max;
    for(i=0;i<n;i++) out[i]=clamp05(linScore(raw[i],a,b,m==='linInc'));
  }else if(m==='piecewise'){
    var pts=(crit.piecewise||[]).slice().sort(function(p,q){return p.x-q.x;});
    for(i=0;i<n;i++) out[i]=clamp05(piecewise(raw[i],pts));
  }else if(m==='fuzzy'){
    for(i=0;i<n;i++) out[i]=clamp05(fuzzy(raw[i],crit.fuzzy||{type:'linear',a:0,b:1}));
  }else if(m==='bool'){
    var si=+crit.boolInside, so=+crit.boolOutside;
    for(i=0;i<n;i++){ v=raw[i]; out[i]=isFinite(v)?clamp05(v>0.5?si:so):NaN; }
  }else{  /* reclass por intervalos — também usado por 'euclid' */
    var R=crit.rules||[];
    for(i=0;i<n;i++) out[i]=clamp05(applyRules(raw[i],R));
  }
  return out;
}
`;
const MCF_K2 = String.raw`
/* ---------- MÁSCARAS LEGAIS ----------
   Cada máscara devolve 1 (elegível) ou 0 (excluída). A máscara final é o
   PRODUTO de todas: basta um zero para a célula sair da análise. */
function buildMask(G,M,inArea){
  var n=gN(G), hit=new Uint8Array(n), i;
  if(M.raster){
    var rr=resampleTo(G,M.raster,'nearest');
    for(i=0;i<n;i++) hit[i]=(isFinite(rr[i])&&rr[i]>0.5)?1:0;
  }else{
    var feats=prepFeats(M.feats||[]);
    var segs=segsOfFeats(feats,true);
    if(M.gtype==='polygon'){
      rasterPolygons(G,feats,hit,1);
      if(M.overlap==='any') rasterSegments(G,segs,hit,1);   /* sobreposição parcial */
    }else if(M.gtype==='line'){
      rasterSegments(G,segs,hit,1);
    }else{
      rasterPoints(G,M.points||[],hit,1);
    }
    var buf=+M.buffer||0;
    if(buf>0){
      var pool=[];
      if(M.gtype==='point'){ for(i=0;i<(M.points||[]).length;i++){var p=M.points[i];pool.push(p[0],p[1],p[0],p[1]);} }
      else pool=segs;
      var IX=segIndexBuild(pool,Math.max(G.cs*4,50));
      for(var r=0;r<G.nr;r++){
        var y=gCY(G,r),base=r*G.nc;
        for(var c=0;c<G.nc;c++){
          var k=base+c; if(hit[k]) continue;
          if(segIndexNearest(IX,gCX(G,c),y,buf)<=buf) hit[k]=1;
        }
      }
    }
  }
  var out=newF32(n,NaN);
  var vin=(M.insideValue===undefined?0:+M.insideValue);
  var vout=(M.outsideValue===undefined?1:+M.outsideValue);
  for(i=0;i<n;i++){
    if(inArea&&!inArea[i]) continue;                 /* fora da análise = NoData */
    var h=hit[i]; if(M.invert) h=h?0:1;
    out[i]=h?vin:vout;
  }
  return out;
}

/* ---------- MÉDIA PONDERADA ----------
   strict:  qualquer critério OBRIGATÓRIO sem dado -> NoData.
   renorm:  critério não obrigatório sem dado sai da conta e o divisor passa a
            ser somente a soma dos pesos válidos naquela célula. */
function weightedOverlay(std,crits,n,mode,conf,idxFilter){
  var score=newF32(n,NaN), used=newF32(n,0);
  var sel=[],i,j;
  for(i=0;i<crits.length;i++){
    if(idxFilter && !idxFilter(crits[i])) continue;
    if(!(+crits[i].weight>0)) continue;
    sel.push(i);
  }
  if(!sel.length) return {score:score,weightUsed:used,members:sel};
  for(var k=0;k<n;k++){
    var sum=0,wt=0,bad=false;
    for(j=0;j<sel.length;j++){
      var ci=sel[j],C=crits[ci],v=std[ci][k],w=+C.weight;
      if(!isFinite(v)){
        if(mode==='strict'||C.mandatory){ bad=true; break; }
        continue;                                   /* renormaliza sem ele */
      }
      var f=conf?(conf[C.confidence]!==undefined?conf[C.confidence]:1):1;
      sum+=v*f*w; wt+=w;
    }
    if(bad||wt<=0){ score[k]=NaN; used[k]=0; continue; }
    score[k]=sum/wt; used[k]=wt;
  }
  return {score:score,weightUsed:used,members:sel};
}

/* ---------- CLASSIFICAÇÃO ---------- */
function breaksEqual(vals,k){
  var mn=Infinity,mx=-Infinity,i;
  for(i=0;i<vals.length;i++){var v=vals[i];if(isFinite(v)){if(v<mn)mn=v;if(v>mx)mx=v;}}
  if(!isFinite(mn)) return null;
  var b=[]; for(i=1;i<k;i++) b.push(mn+(mx-mn)*i/k);
  return {min:mn,max:mx,breaks:b};
}
function breaksQuantile(vals,k){
  var a=[],i;
  for(i=0;i<vals.length;i++) if(isFinite(vals[i])) a.push(vals[i]);
  if(!a.length) return null;
  a.sort(function(p,q){return p-q;});
  var b=[]; for(i=1;i<k;i++) b.push(a[Math.min(a.length-1,Math.floor(a.length*i/k))]);
  return {min:a[0],max:a[a.length-1],breaks:b};
}
/* Jenks sobre amostra: a matriz do algoritmo é O(m*k) e amostrar 2000 valores
   dá quebras estáveis sem estourar a memória em grades grandes. */
function breaksJenks(vals,k){
  var a=[],i,j;
  for(i=0;i<vals.length;i++) if(isFinite(vals[i])) a.push(vals[i]);
  if(a.length<k) return breaksEqual(vals,k);
  a.sort(function(p,q){return p-q;});
  var MAXS=2000;
  if(a.length>MAXS){ var s=[]; for(i=0;i<MAXS;i++) s.push(a[Math.floor(i*a.length/MAXS)]); a=s; }
  var m=a.length;
  var mat1=[],mat2=[];
  for(i=0;i<=m;i++){ mat1.push(new Int32Array(k+1)); mat2.push(new Float64Array(k+1).fill(Infinity)); }
  for(j=1;j<=k;j++){ mat1[1][j]=1; mat2[1][j]=0; }
  for(var l=2;l<=m;l++){
    var s1=0,s2=0,w=0;
    for(var mm=1;mm<=l;mm++){
      var i3=l-mm+1,val=a[i3-1];
      w++; s1+=val; s2+=val*val;
      var v=s2-(s1*s1)/w, i4=i3-1;
      if(i4!==0) for(j=2;j<=k;j++){
        if(mat2[l][j]>=(v+mat2[i4][j-1])){ mat1[l][j]=i3; mat2[l][j]=v+mat2[i4][j-1]; }
      }
    }
    mat1[l][1]=1; mat2[l][1]=s2-(s1*s1)/w;
  }
  var kk=m,b=[];
  for(j=k;j>=2;j--){ var id=mat1[kk][j]-1; b.unshift(a[id]); kk=id; }
  return {min:a[0],max:a[m-1],breaks:b};
}
function classesFromBreaks(base,br){
  var out=[],lo=br.min-1e-9,i;
  for(i=0;i<base.length;i++){
    var hi=(i<br.breaks.length)?br.breaks[i]:(br.max+1e-9);
    out.push({code:base[i].code,label:base[i].label,color:base[i].color,min:lo,max:hi});
    lo=hi;
  }
  return out;
}
function classify(score,mask,classes,n){
  var out=newF32(n,NaN),i,j;
  for(i=0;i<n;i++){
    var mv=mask?mask[i]:1;
    if(mask&&!isFinite(mv)){ out[i]=NaN; continue; }              /* fora da análise */
    if(mask&&mv<=0){ out[i]=0; continue; }                        /* EXCLUÍDA */
    var v=score[i];
    if(!isFinite(v)){ out[i]=NaN; continue; }                     /* não classificada */
    var got=NaN;
    for(j=0;j<classes.length;j++){
      var C=classes[j];
      if(v>=C.min && (j===classes.length-1 ? v<=C.max : v<C.max)){ got=C.code; break; }
    }
    out[i]=got;
  }
  return out;
}

/* ---------- REGRAS DE CONTROLE (rebaixamento) ---------- */
function applyControlRules(cls,ctx,n,rules,classes){
  var codes=classes.map(function(c){return c.code;}).sort(function(a,b){return a-b;});
  var demote={},i;
  for(i=0;i<codes.length;i++) demote[codes[i]]=(i>0?codes[i-1]:codes[i]);
  var top=codes[codes.length-1];
  var log={geoFloor:0,envSevere:0,lowConf:0};
  for(var k=0;k<n;k++){
    var c=cls[k]; if(!isFinite(c)||c<=0) continue;
    var cap=top+1;
    if(rules.geoFloor && rules.geoFloor.on && c===top){
      var g=ctx.geo[k];
      if(!isFinite(g)||g<+rules.geoFloor.min){ cap=Math.min(cap,demote[top]); log.geoFloor++; }
    }
    if(rules.envSevere && rules.envSevere.on && ctx.severe[k]){
      var envCap=(rules.envSevere.capClass===undefined||rules.envSevere.capClass===null)
        ? demote[top] : +rules.envSevere.capClass;
      if(isFinite(envCap) && c>envCap){ cap=Math.min(cap,envCap); log.envSevere++; }
    }
    if(rules.lowConf && rules.lowConf.on && isFinite(ctx.confMin[k]) &&
       ctx.confMin[k] < +rules.lowConf.minFactor){
      var lim=+rules.lowConf.capClass;
      if(isFinite(lim)&&c>lim){ cap=Math.min(cap,lim); log.lowConf++; }
    }
    if(cap<c) cls[k]=cap;
  }
  return log;
}

/* ---------- FILTRO DE MAIORIA ---------- */
function majorityFilter(cls,G,passes){
  var n=gN(G),cur=cls;
  for(var p=0;p<passes;p++){
    var nx=Float32Array.from(cur);
    for(var r=0;r<G.nr;r++) for(var c=0;c<G.nc;c++){
      var k=r*G.nc+c, v=cur[k]; if(!isFinite(v)) continue;
      var tally={},best=v,bn=0;
      for(var dr=-1;dr<=1;dr++) for(var dc=-1;dc<=1;dc++){
        if(!dr&&!dc) continue;
        var rr=r+dr,cc=c+dc; if(rr<0||rr>=G.nr||cc<0||cc>=G.nc) continue;
        var q=cur[rr*G.nc+cc]; if(!isFinite(q)) continue;
        tally[q]=(tally[q]||0)+1;
        if(tally[q]>bn){ bn=tally[q]; best=+q; }
      }
      if(bn>=5 && best!==v) nx[k]=best;
    }
    cur=nx;
  }
  return cur;
}

/* ---------- COMPONENTES CONECTADOS ---------- */
function components(cls,G,codes,conn){
  var n=gN(G), lab=new Int32Array(n).fill(-1), want={},i;
  for(i=0;i<codes.length;i++) want[codes[i]]=1;
  var comps=[],stack=new Int32Array(n),nid=0;
  var d4=[[-1,0],[1,0],[0,-1],[0,1]];
  var d8=d4.concat([[-1,-1],[-1,1],[1,-1],[1,1]]);
  var D=(conn===8)?d8:d4;
  for(var r0=0;r0<G.nr;r0++) for(var c0=0;c0<G.nc;c0++){
    var k0=r0*G.nc+c0;
    if(lab[k0]>=0) continue;
    var v0=cls[k0]; if(!isFinite(v0)||!want[v0]) continue;
    var top=0; stack[top++]=k0; lab[k0]=nid;
    var cells=[];
    while(top>0){
      var k=stack[--top]; cells.push(k);
      var r=(k/G.nc)|0,c=k%G.nc;
      for(i=0;i<D.length;i++){
        var rr=r+D[i][0],cc=c+D[i][1];
        if(rr<0||rr>=G.nr||cc<0||cc>=G.nc) continue;
        var kk=rr*G.nc+cc;
        if(lab[kk]>=0) continue;
        if(cls[kk]!==v0) continue;
        lab[kk]=nid; stack[top++]=kk;
      }
    }
    comps.push({id:nid,code:v0,cells:cells}); nid++;
  }
  return {lab:lab,comps:comps};
}

/* ---------- PREENCHIMENTO DE VAZIOS ----------
   Só fecha buracos MENORES que o limite e completamente cercados por uma única
   classe — nunca funde manchas distintas. */
function fillSmallHoles(cls,G,maxCells){
  var n=gN(G),seen=new Uint8Array(n),D=[[-1,0],[1,0],[0,-1],[0,1]];
  for(var k0=0;k0<n;k0++){
    if(seen[k0]) continue;
    var v0=cls[k0];
    if(isFinite(v0)&&v0>0) { seen[k0]=1; continue; }
    var q=[k0],idx=0,cells=[],border={},touchEdge=false;
    seen[k0]=1;
    while(idx<q.length){
      var k=q[idx++]; cells.push(k);
      var r=(k/G.nc)|0,c=k%G.nc;
      for(var i=0;i<4;i++){
        var rr=r+D[i][0],cc=c+D[i][1];
        if(rr<0||rr>=G.nr||cc<0||cc>=G.nc){ touchEdge=true; continue; }
        var kk=rr*G.nc+cc, vv=cls[kk];
        var same=(isFinite(v0)&&isFinite(vv)&&vv===v0)||(!isFinite(v0)&&!isFinite(vv));
        if(same){ if(!seen[kk]){seen[kk]=1;q.push(kk);} }
        else border[vv]= (border[vv]||0)+1;
      }
      if(cells.length>maxCells) break;
    }
    if(touchEdge||cells.length>maxCells) continue;
    var keys=Object.keys(border);
    if(keys.length!==1) continue;
    var fill=+keys[0]; if(!isFinite(fill)||fill<=0) continue;
    for(var j=0;j<cells.length;j++) cls[cells[j]]=fill;
  }
  return cls;
}
`;
const MCF_K3 = String.raw`
/* ---------- POLIGONIZAÇÃO POR ARESTAS DE CÉLULA ----------
   Cada componente conectado vira UM polígono próprio. Não há dissolução entre
   manchas da mesma classe: duas áreas separadas continuam separadas, como pede
   a metodologia. Buracos saem como anéis de orientação inversa. */
function polygonizeCells(G,cells){
  var inSet=new Set(cells);
  var nc=G.nc,nr=G.nr,W=nc+1;
  var vid=function(i,j){ return i*W+j; };
  var edges=new Map();                       /* vértice inicial -> [ {to,dir} ] */
  var push=function(a,b,dir){
    var L=edges.get(a); if(!L){ L=[]; edges.set(a,L); }
    L.push({to:b,dir:dir,used:false});
  };
  for(var t=0;t<cells.length;t++){
    var k=cells[t], r=(k/nc)|0, c=k%nc;
    var TL=vid(r,c),TR=vid(r,c+1),BL=vid(r+1,c),BR=vid(r+1,c+1);
    if(r+1>=nr || !inSet.has((r+1)*nc+c)) push(BL,BR,0);   /* base  -> leste  */
    if(c+1>=nc || !inSet.has(r*nc+c+1))   push(BR,TR,1);   /* direita -> norte */
    if(r-1<0    || !inSet.has((r-1)*nc+c)) push(TR,TL,2);  /* topo  -> oeste  */
    if(c-1<0    || !inSet.has(r*nc+c-1))   push(TL,BL,3);  /* esquerda -> sul */
  }
  var xy=function(v){
    var i=(v/W)|0, j=v%W;
    return [G.xll+j*G.cs, G.yll+(nr-i)*G.cs];
  };
  var rings=[];
  edges.forEach(function(list,start){
    for(var q=0;q<list.length;q++){
      if(list[q].used) continue;
      var ring=[], v=start, e=list[q];
      var guard=0, limit=cells.length*8+16;
      while(e && !e.used && guard++<limit){
        e.used=true; ring.push(xy(v));
        v=e.to;
        var out=edges.get(v); if(!out){ e=null; break; }
        /* No encontro em quina (duas manchas tocando-se pelo vértice) a curva
           mais à DIREITA mantém o interior à esquerda e devolve anéis simples,
           em vez de um "oito" que se auto-intersecta. */
        var d=e.dir, pref=[(d+3)%4,d,(d+1)%4,(d+2)%4], nx=null;
        for(var pi=0;pi<4&&!nx;pi++)
          for(var oi=0;oi<out.length;oi++)
            if(!out[oi].used && out[oi].dir===pref[pi]){ nx=out[oi]; break; }
        e=nx;
      }
      if(ring.length>=3){ ring.push(ring[0].slice()); rings.push(ring); }
    }
  });
  return rings;
}
function ringArea(R){
  var a=0;
  for(var i=0,j=R.length-1;i<R.length;j=i++) a+=(R[j][0]*R[i][1]-R[i][0]*R[j][1]);
  return a/2;                                  /* >0 anti-horário (casca) */
}
function simplifyRing(R,tol){
  if(tol<=0||R.length<5) return R;
  var closed=(R[0][0]===R[R.length-1][0]&&R[0][1]===R[R.length-1][1]);
  var pts=closed?R.slice(0,-1):R.slice();
  if(pts.length<4) return R;
  var keep=new Uint8Array(pts.length); keep[0]=1; keep[pts.length-1]=1;
  var st=[[0,pts.length-1]];
  while(st.length){
    var sg=st.pop(),a=sg[0],b=sg[1];
    var ax=pts[a][0],ay=pts[a][1],bx=pts[b][0],by=pts[b][1];
    var best=-1,bd=tol;
    for(var i=a+1;i<b;i++){
      var d=distSeg(pts[i][0],pts[i][1],ax,ay,bx,by);
      if(d>bd){ bd=d; best=i; }
    }
    if(best>=0){ keep[best]=1; st.push([a,best],[best,b]); }
  }
  var out=[];
  for(var j=0;j<pts.length;j++) if(keep[j]) out.push(pts[j]);
  if(out.length<3) return R;
  out.push(out[0].slice());
  return out;
}
/* Casca + buracos: anéis negativos contidos na casca viram furos dela. */
function assembleRings(rings){
  var shells=[],holes=[],i;
  for(i=0;i<rings.length;i++){
    var a=ringArea(rings[i]);
    if(Math.abs(a)<1e-9) continue;
    (a>0?shells:holes).push({ring:rings[i],area:a,bb:bboxOfRings([rings[i]])});
  }
  if(!shells.length && holes.length){                    /* orientação invertida */
    for(i=0;i<holes.length;i++) shells.push({ring:holes[i].ring.slice().reverse(),area:-holes[i].area,bb:holes[i].bb});
    holes=[];
  }
  shells.sort(function(a,b){return b.area-a.area;});
  var out=shells.map(function(s){return {rings:[s.ring],area:s.area,bb:s.bb};});
  for(i=0;i<holes.length;i++){
    var h=holes[i],p=h.ring[0];
    for(var j=0;j<out.length;j++){
      if(p[0]<out[j].bb[0]||p[0]>out[j].bb[2]||p[1]<out[j].bb[1]||p[1]>out[j].bb[3]) continue;
      if(ringHas(out[j].rings[0],p[0],p[1])){ out[j].rings.push(h.ring); out[j].area+=h.area; break; }
    }
  }
  return out;
}

/* ---------- distância em blocos de linhas (para poder ceder a interface) --- */
function distIndexes(G,segs,pts){
  var IX=(segs&&segs.length)?segIndexBuild(segs,Math.max(G.cs*4,50)):null, PX=null;
  if(pts&&pts.length){
    var ps=[]; for(var i=0;i<pts.length;i++) ps.push(pts[i][0],pts[i][1],pts[i][0],pts[i][1]);
    PX=segIndexBuild(ps,Math.max(G.cs*4,50));
  }
  return {IX:IX,PX:PX};
}
/* ---------------------------------------------------------------------------
   TRANSFORMADA DE DISTÂNCIA (Felzenszwalb & Huttenlocher, 2012)

   A busca em anel sobre o índice de baldes é exata, mas custa O(r²) por célula
   quando a feição mais próxima está a r anéis. Num raio de 137 km com teto de
   30 km isso dava ~23 mil visitas de balde POR CÉLULA, vezes 1,1 milhão de
   células: o cálculo não terminava.

   A transformada resolve em DUAS passadas lineares, independentemente da
   distância. Ela mede até o centro da célula que contém a feição, então o erro
   é de no máximo meia diagonal de célula (~0,7 célula). Para os limiares desta
   metodologia — 10 km, 30 km — isso é 0,7% em 100 m.

   Perto da feição, onde meia célula pesa, o resultado é REFINADO pela busca
   exata original: só as células a até 20 células da fonte, com o raio já
   limitado pelo valor da transformada. É barato e devolve a exatidão onde ela
   importa.
   --------------------------------------------------------------------------- */
function dt1d(f,n,d,v,z){
  var k=0; v[0]=0; z[0]=-Infinity; z[1]=Infinity;
  for(var q=1;q<n;q++){
    var s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*q-2*v[k]);
    while(s<=z[k]){ k--; s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*q-2*v[k]); }
    k++; v[k]=q; z[k]=s; z[k+1]=Infinity;
  }
  k=0;
  for(q=0;q<n;q++){
    while(z[k+1]<q) k++;
    d[q]=(q-v[k])*(q-v[k])+f[v[k]];
  }
}
function edtCells(G,src){
  var nc=G.nc,nr=G.nr,n=nc*nr,INF=1e18;
  var f=new Float64Array(Math.max(nc,nr));
  var d=new Float64Array(Math.max(nc,nr));
  var v=new Int32Array(Math.max(nc,nr)+1);
  var z=new Float64Array(Math.max(nc,nr)+2);
  var g=new Float64Array(n),i,r,c;
  for(i=0;i<n;i++) g[i]=src[i]?0:INF;
  for(c=0;c<nc;c++){                      /* colunas */
    for(r=0;r<nr;r++) f[r]=g[r*nc+c];
    dt1d(f,nr,d,v,z);
    for(r=0;r<nr;r++) g[r*nc+c]=d[r];
  }
  for(r=0;r<nr;r++){                      /* linhas */
    var b=r*nc;
    for(c=0;c<nc;c++) f[c]=g[b+c];
    dt1d(f,nc,d,v,z);
    for(c=0;c<nc;c++) g[b+c]=d[c];
  }
  return g;                               /* distância AO QUADRADO, em células */
}
function distanceGrid(G,ID,segs,pts,opt,out,work,prog){
  var nc=G.nc,nr=G.nr,n=nc*nr;
  var cap=(opt.max>0?opt.max:undefined), inside=opt.insideMask||null;
  var src=new Uint8Array(n);
  if(segs&&segs.length) rasterSegments(G,segs,src,1);
  if(pts&&pts.length) rasterPoints(G,pts,src,1);
  var temFonte=false;
  for(var i=0;i<n;i++) if(src[i]){ temFonte=true; break; }
  var g2=temFonte?edtCells(G,src):null;
  var LIM=20*20;                          /* refina a até 20 células da fonte */
  for(var k=0;k<n;k++){
    if(work&&!work[k]) continue;
    if(inside&&inside[k]&&opt.insideZero){ out[k]=0; continue; }
    if(!temFonte){ out[k]=(cap!==undefined?cap:NaN); continue; }
    var q=g2[k], dm=Math.sqrt(q)*G.cs;
    if(q<=LIM && ID){
      var xr=gCX(G,k%nc), yr=gCY(G,(k/nc)|0);
      var ex=Infinity;
      if(ID.IX) ex=Math.min(ex,segIndexNearest(ID.IX,xr,yr,dm+2*G.cs));
      if(ID.PX) ex=Math.min(ex,segIndexNearest(ID.PX,xr,yr,dm+2*G.cs));
      if(isFinite(ex)) dm=ex;
    }
    if(cap!==undefined&&dm>cap) dm=cap;
    out[k]=dm;
  }
  if(prog) prog(1);
}
function distRows(G,ID,opt,out,r0,r1){
  var cap=(opt.max>0?opt.max:undefined), inside=opt.insideMask||null;
  /* Célula fora da extensão de análise ou zerada por máscara legal nunca é
     lida a jusante: os dois índices e a classificação já a descartam. Calcular
     a distância dela era trabalho jogado fora — 42,7% da grade num raio de
     busca, que é um disco parcial dentro do próprio retângulo. */
  var work=opt.work||null;
  for(var r=r0;r<r1;r++){
    var y=gCY(G,r), base=r*G.nc;
    for(var c=0;c<G.nc;c++){
      var k=base+c;
      if(work&&!work[k]) continue;
      if(inside&&inside[k]&&opt.insideZero){ out[k]=0; continue; }
      var x=gCX(G,c),d=Infinity;
      if(ID.IX) d=Math.min(d,segIndexNearest(ID.IX,x,y,cap));
      if(ID.PX) d=Math.min(d,segIndexNearest(ID.PX,x,y,cap));
      if(!isFinite(d)){ out[k]=(cap!==undefined?cap:NaN); continue; }
      out[k]=(cap!==undefined&&d>cap)?cap:d;
    }
  }
}
/* ---------- média ponderada em faixa de índices ---------- */
function overlayRange(std,crits,sel,mode,conf,score,used,k0,k1,renorm){
  /* Missing data (spec 8): each criterion declares its own rule.
       conservative  -> takes missingScore (never assumed favourable)
       insufficient  -> the whole cell becomes "insufficient data", no score
       renorm        -> leaves the sum and the divisor is recomputed; recorded
     Absent rule falls back to the previous behaviour, so old configurations
     keep producing exactly the same numbers. */
  for(var k=k0;k<k1;k++){
    var sum=0,wt=0,bad=false,ren=0;
    for(var j=0;j<sel.length;j++){
      var ci=sel[j],C=crits[ci],v=std[ci][k],w=+C.weight;
      if(!isFinite(v)){
        var mr=C.missing||(C.mandatory?'insufficient':(mode==='strict'?'insufficient':'renorm'));
        if(mr==='conservative'){ v=+C.missingScore||0; }
        else if(mr==='renorm'){ ren++; continue; }
        else { bad=true; break; }
      }
      var f=conf?(conf[C.confidence]!==undefined?conf[C.confidence]:1):1;
      sum+=v*f*w; wt+=w;
    }
    if(bad||wt<=0){ score[k]=NaN; used[k]=0; }
    else { score[k]=sum/wt; used[k]=wt; if(ren&&renorm) renorm[k]=ren; }
  }
}
function selectMembers(crits,filter){
  var sel=[];
  for(var i=0;i<crits.length;i++){
    if(filter&&!filter(crits[i])) continue;
    if(!(+crits[i].weight>0)) continue;
    sel.push(i);
  }
  return sel;
}
`;
const MCF_K4 = String.raw`
/* ===========================================================================
   mcfRun — GERADOR. Cada 'yield' é um ponto de progresso E de cancelamento.
   No worker o laço consome tudo de uma vez; no documento o consumidor devolve
   o controle ao navegador entre os yields, e a interface não congela.
   ========================================================================= */
function* mcfRun(job){
  var t0=Date.now(), warn=[], G=job.grid, n=gN(G), i, j, k, ci;
  var stage=function(p,s){ return {type:'progress',pct:p,stage:s}; };

  /* ---- 1. área de análise ---- */
  yield stage(0.02,'Definindo a grade de análise');
  var inArea=new Uint8Array(n);
  if(job.areaFeats&&job.areaFeats.length) rasterPolygons(G,prepFeats(job.areaFeats),inArea,1);
  else inArea.fill(1);
  var nArea=0; for(i=0;i<n;i++) if(inArea[i]) nArea++;
  if(!nArea) throw new Error('A extensão de análise não cobre nenhuma célula da grade.');

  /* ---- 2. máscaras legais: produto lógico ----
     Vinham DEPOIS dos critérios. Não dependem de critério nenhum — só da
     grade, da especificação da máscara e de inArea —, então subir o bloco é
     seguro e permite que o laço dos critérios já pule o que foi excluído. */
  var masks=(job.masks||[]).filter(function(m){return m.enabled!==false;});
  var legal=newF32(n,NaN), reason=new Int16Array(n).fill(-1);
  for(i=0;i<n;i++) legal[i]=inArea[i]?1:NaN;
  for(var mi=0;mi<masks.length;mi++){
    var mv=buildMask(G,masks[mi],inArea);
    for(k=0;k<n;k++){
      if(!isFinite(legal[k])||!isFinite(mv[k])) continue;
      if(mv[k]<=0){ if(reason[k]<0) reason[k]=mi; legal[k]=0; }
    }
    yield stage(0.03+0.02*(mi+1)/Math.max(1,masks.length),'Máscara: '+masks[mi].name);
  }
  var nExcl=0; for(k=0;k<n;k++) if(legal[k]===0) nExcl++;

  /* célula que vale a pena calcular */
  var work=new Uint8Array(n), nWork=0;
  for(i=0;i<n;i++) if(inArea[i]&&legal[i]!==0){ work[i]=1; nWork++; }
  if(nWork<n) warn.push('Cálculo restrito a '+nWork.toLocaleString('pt-BR')+' de '+
    n.toLocaleString('pt-BR')+' células ('+(100*nWork/n).toFixed(1)+'%): o restante está '+
    'fora da extensão ou zerado por máscara legal.');

  /* ---- 3. critérios: bruto -> padronizado 0..5 ---- */
  var crits=job.criteria||[], std=[], raw=[];
  for(ci=0;ci<crits.length;ci++){
    var C=crits[ci], preScored=false;
    yield stage(0.05+0.45*ci/Math.max(1,crits.length),'Critério '+(ci+1)+'/'+crits.length+': '+C.name);
    var rv=newF32(n,NaN);

    if(C.raster){
      rv=resampleTo(G,C.raster,C.resample==='bilinear'?'bilinear':'nearest',work);

    }else if(C.method==='euclid'){
      var feats=prepFeats(C.feats||[]);
      var insideM=null;
      if(C.gtype==='polygon'&&C.dist&&C.dist.insideZero){
        insideM=new Uint8Array(n); rasterPolygons(G,feats,insideM,1);
      }
      var segs=[],pts=null;
      if(C.gtype==='point'){ pts=C.points||[]; }
      else if(C.dist&&C.dist.from==='centroid'){
        pts=[];
        for(i=0;i<feats.length;i++){
          var sx=0,sy=0,sn=0,R0=feats[i].rings[0]||[];
          for(j=0;j<R0.length;j++){ sx+=R0[j][0]; sy+=R0[j][1]; sn++; }
          if(sn) pts.push([sx/sn,sy/sn]);
        }
      }else segs=segsOfFeats(feats,C.gtype==='polygon');
      var ID=distIndexes(G,segs,pts);
      var opt={max:+(C.dist&&C.dist.max)||0,insideZero:!!(C.dist&&C.dist.insideZero),insideMask:insideM,work:work};
      yield stage(0.05+0.45*ci/Math.max(1,crits.length),'Distance: '+C.name);
      distanceGrid(G,ID,segs,pts,opt,rv,work,null);
      if(C.dist&&C.dist.unit==='km') for(i=0;i<n;i++) if(isFinite(rv[i])) rv[i]/=1000;

    }else if(C.method==='lookup'&&C.classField&&C.gtype==='polygon'){
      /* CATEGÓRICO VETORIAL: cada feição pinta DIRETAMENTE a nota da sua
         classe. Rasterizar um código numérico intermediário obrigaria a
         inventar códigos para rótulos de texto — aqui a tabela de-para do
         usuário é aplicada na própria feição. */
      var fe0=prepFeats(C.feats||[]), map={};
      for(i=0;i<(C.lookup||[]).length;i++) map[String(C.lookup[i].value)]=+C.lookup[i].score;
      var fb=(C.lookupFallback===''||C.lookupFallback===null||C.lookupFallback===undefined)?NaN:+C.lookupFallback;
      /* lookupFallback so cobre POLIGONO cuja classe nao esta na tabela. Celula
         que nao e coberta por poligono algum saia NaN, e nao havia como dizer
         outra coisa. Isso quebra criterios em que a AUSENCIA e informacao — na
         Tabela 6.1-1, terreno fora de qualquer processo da ANM e area livre, a
         condicao mais atrativa. lookupOutside da essa nota; sem ele, NaN, que
         e exatamente o comportamento anterior. */
      var fo=(C.lookupOutside===''||C.lookupOutside===null||C.lookupOutside===undefined)?NaN:+C.lookupOutside;
      if(fo===fo) for(k=0;k<n;k++) if(work[k]) rv[k]=fo;
      for(i=0;i<fe0.length;i++){
        var one=new Uint8Array(n); rasterPolygons(G,[fe0[i]],one,1);
        var key=fe0[i].props?fe0[i].props[C.classField]:null;
        var sc=map[String(key)]; if(sc===undefined) sc=fb;
        for(k=0;k<n;k++) if(one[k]&&work[k]) rv[k]=sc;
      }
      preScored=true;

    }else{
      var fe=prepFeats(C.feats||[]);
      if(C.gtype==='polygon'){
        var u=new Uint8Array(n); rasterPolygons(G,fe,u,1);
        if(C.overlap==='any') rasterSegments(G,segsOfFeats(fe,true),u,1);
        for(k=0;k<n;k++) rv[k]=u[k]?1:0;
      }else if(C.gtype==='line'){
        var u2=new Uint8Array(n); rasterSegments(G,segsOfFeats(fe,false),u2,1);
        for(k=0;k<n;k++) rv[k]=u2[k]?1:0;
      }else{
        var u3=new Uint8Array(n); rasterPoints(G,C.points||[],u3,1);
        for(k=0;k<n;k++) rv[k]=u3[k]?1:0;
      }
    }

    for(k=0;k<n;k++) if(!inArea[k]) rv[k]=NaN;
    raw.push(rv);
    var sv;
    if(preScored){ sv=newF32(n,NaN); for(k=0;k<n;k++) sv[k]=clamp05(rv[k]); }
    else sv=standardize(C,rv,n);
    for(k=0;k<n;k++) if(!inArea[k]) sv[k]=NaN;
    std.push(sv);
  }

  /* ---- 4. contexto de confiança e severidade ---- */
  var CF=job.confidenceApply?job.confidenceFactors:null;
  var confMin=newF32(n,1), severe=new Uint8Array(n);
  for(k=0;k<n;k++){
    if(!inArea[k]){ confMin[k]=NaN; continue; }
    var mnf=1;
    for(ci=0;ci<crits.length;ci++){
      if(!isFinite(std[ci][k])) continue;
      var f=CF?(CF[crits[ci].confidence]!==undefined?CF[crits[ci].confidence]:1):1;
      if(f<mnf) mnf=f;
      if(crits[ci].severe && std[ci][k]<=(+crits[ci].severeAtOrBelow||1)) severe[k]=1;
    }
    confMin[k]=mnf;
  }

  /* ---- 5. os dois índices e o integrado ---- */
  yield stage(0.60,'Potencial geológico e viabilidade de implantação');
  var mode=(job.weighting&&job.weighting.mode)||'renorm';
  var selGeo=selectMembers(crits,function(C){return C.index==='geo';});
  var selFea=selectMembers(crits,function(C){return C.index==='feas';});
  var geo=newF32(n,NaN), gwv=newF32(n,0), fea=newF32(n,NaN), fwv=newF32(n,0);
  var CH=Math.max(4096,Math.ceil(n/16));
  for(var ka=0;ka<n;ka+=CH){
    var kb=Math.min(n,ka+CH);
    if(selGeo.length) overlayRange(std,crits,selGeo,mode,CF,geo,gwv,ka,kb);
    if(selFea.length) overlayRange(std,crits,selFea,mode,CF,fea,fwv,ka,kb);
    yield stage(0.60+0.10*kb/n,'Média ponderada');
  }
  var fg=+((job.integration&&job.integration.geo)!==undefined?job.integration.geo:0.6);
  var ff=+((job.integration&&job.integration.feas)!==undefined?job.integration.feas:0.4);
  var integ=newF32(n,NaN);
  for(k=0;k<n;k++){
    if(!inArea[k]) continue;
    var s=0,w=0,miss=false;
    if(selGeo.length){ if(isFinite(geo[k])){ s+=fg*geo[k]; w+=fg; } else miss=true; }
    if(selFea.length){ if(isFinite(fea[k])){ s+=ff*fea[k]; w+=ff; } else miss=true; }
    integ[k]=(w<=0||(miss&&mode==='strict'))?NaN:s/w;
  }

  /* ---- 5b. WEIGHTED SUM over every active criterion (spec 4) ----
     S5 = SUM(wi * si) / 100. overlayRange divides by the weights actually
     used, which equals /100 when the weights sum to 100 — and validation
     refuses to run otherwise. The two indices above stay as informative
     outputs; the favourability itself is this single sum. */
  var selAll=selectMembers(crits,null);
  var s5=newF32(n,NaN), s5w=newF32(n,0), renorm=new Uint8Array(n);
  for(var kc=0;kc<n;kc+=CH){
    var kd=Math.min(n,kc+CH);
    if(selAll.length) overlayRange(std,crits,selAll,mode,CF,s5,s5w,kc,kd,renorm);
    yield stage(0.70+0.02*kd/n,'Weighted sum');
  }

  /* ---- 6. final score: an excluded cell gets NO score at all ----
     SCORE_100 = 20 * S5 (spec 5) · F = S5/5 (spec 6). The primary product is
     SCORE_100; S5 and F go out alongside it. */
  var s5Out=newF32(n,NaN), score100=newF32(n,NaN), fIdx=newF32(n,NaN);
  var finalScore=newF32(n,NaN);
  for(k=0;k<n;k++){
    if(!inArea[k]||legal[k]===0) continue;      /* Excluded: nothing numeric */
    var v5=s5[k];
    if(!isFinite(v5)) continue;
    s5Out[k]=v5; score100[k]=20*v5; fIdx[k]=v5/5;
    finalScore[k]=20*v5;
  }

  /* ---- 7. classificação ---- */
  yield stage(0.72,'Classificação final');
  var cl=job.classification||{}, base=(cl.classes||[]).slice();
  var classes=base.map(function(c){return {code:+c.code,label:c.label,color:c.color,min:+c.min,max:+c.max};});
  var brInfo=null;
  if(cl.method&&cl.method!=='fixed'&&base.length){
    var pool=[]; for(k=0;k<n;k++) if(legal[k]===1&&isFinite(finalScore[k])) pool.push(finalScore[k]);
    var br=(cl.method==='equal')?breaksEqual(pool,base.length)
          :(cl.method==='quantile')?breaksQuantile(pool,base.length)
          :breaksJenks(pool,base.length);
    if(br){ classes=classesFromBreaks(base,br); brInfo=br; }
    else warn.push('Sem células válidas para calcular quebras — mantidos os limiares fixos.');
  }
  var cls=classify(finalScore,legal,classes,n);
  var ruleLog=applyControlRules(cls,{geo:geo,severe:severe,confMin:confMin},n,job.rules||{},classes);

  /* ---- 8. pós-processamento ---- */
  var post=job.post||{}, cellHa=G.cs*G.cs/10000;
  var reimpose=function(){
    for(k=0;k<n;k++){ if(!inArea[k]) cls[k]=NaN; else if(legal[k]===0) cls[k]=0; }
  };
  if(post.majority&&+post.majorityPasses>0){
    yield stage(0.78,'Filtro de maioria');
    cls=majorityFilter(cls,G,Math.min(5,+post.majorityPasses)); reimpose();
  }
  if(post.fillHoles&&+post.fillMaxHa>0){
    yield stage(0.80,'Preenchendo vazios pequenos');
    cls=fillSmallHoles(cls,G,Math.max(1,Math.round(+post.fillMaxHa/cellHa))); reimpose();
  }

  /* ---- 9. regiões conectadas e polígonos ---- */
  yield stage(0.83,'Regiões conectadas');
  var want=(post.polyClasses&&post.polyClasses.length)?post.polyClasses.map(Number)
          :classes.filter(function(c){return c.code>0;}).map(function(c){return c.code;});
  var CC=components(cls,G,want,(+post.connectivity===4?4:8));
  var minCells=Math.max(0,Math.round((+post.minAreaHa||0)/cellHa));
  var kept=[],dropped=0;
  for(i=0;i<CC.comps.length;i++){
    if(minCells>0&&CC.comps[i].cells.length<minCells){ dropped++; continue; }
    kept.push(CC.comps[i]);
  }

  var GROUPS=['Environmental Constraints','Territorial and Social Constraints',
              'Infrastructure and Logistics','Terrain and Hydrology'];
  var polys=[];
  for(i=0;i<kept.length;i++){
    if(i%20===0) yield stage(0.85+0.06*i/Math.max(1,kept.length),'Polígonos '+(i+1)+'/'+kept.length);
    var comp=kept[i], cells=comp.cells, m=cells.length;
    var sInt=0,nInt=0,mxInt=-Infinity,sGeo=0,nGeo=0,sFea=0,nFea=0,sConf=0,nConf=0;
    var gsum={},gcnt={},reasonTally={};
    var csum=new Float64Array(crits.length), ccnt=new Float64Array(crits.length);
    for(j=0;j<m;j++){
      k=cells[j];
      var vi=integ[k]; if(isFinite(vi)){ sInt+=vi; nInt++; if(vi>mxInt)mxInt=vi; }
      if(isFinite(geo[k])){ sGeo+=geo[k]; nGeo++; }
      if(isFinite(fea[k])){ sFea+=fea[k]; nFea++; }
      if(isFinite(confMin[k])){ sConf+=confMin[k]; nConf++; }
      if(reason[k]>=0) reasonTally[reason[k]]=(reasonTally[reason[k]]||0)+1;
      for(ci=0;ci<crits.length;ci++){ var vv=std[ci][k]; if(isFinite(vv)){ csum[ci]+=vv; ccnt[ci]++; } }
    }
    for(ci=0;ci<crits.length;ci++){
      var gname=crits[ci].group;
      if(GROUPS.indexOf(gname)<0||!ccnt[ci]) continue;
      var wg=+crits[ci].weight||0;
      gsum[gname]=(gsum[gname]||0)+(csum[ci]/ccnt[ci])*wg;
      gcnt[gname]=(gcnt[gname]||0)+wg;
    }
    var bp=null,bpv=-Infinity,bn=null,bnv=-Infinity;
    for(ci=0;ci<crits.length;ci++){
      if(!ccnt[ci]||!(+crits[ci].weight>0)) continue;
      var mean=csum[ci]/ccnt[ci], w2=+crits[ci].weight;
      if(mean*w2>bpv){ bpv=mean*w2; bp=crits[ci].name; }
      if((5-mean)*w2>bnv){ bnv=(5-mean)*w2; bn=crits[ci].name; }
    }
    var rings=polygonizeCells(G,cells), tol=+post.simplifyTol||0;
    if(tol>0) rings=rings.map(function(R){return simplifyRing(R,tol);});
    var parts=assembleRings(rings);
    var rk=Object.keys(reasonTally).sort(function(a,b){return reasonTally[b]-reasonTally[a];});
    polys.push({
      code:comp.code, cells:m, areaHa:m*cellHa, _cells:cells,
      parts:parts.map(function(p){return p.rings;}),
      meanInteg:nInt?sInt/nInt:NaN, maxInteg:isFinite(mxInt)?mxInt:NaN,
      meanGeo:nGeo?sGeo/nGeo:NaN, meanFea:nFea?sFea/nFea:NaN,
      conf:nConf?sConf/nConf:NaN,
      groups:GROUPS.map(function(g){return gcnt[g]?gsum[g]/gcnt[g]:NaN;}),
      domPos:bp, domNeg:bn, excluded:comp.code===0,
      reasonIdx:rk.length?+rk[0]:-1
    });
  }
  var byScore=function(a,b){
    if(a.excluded!==b.excluded) return a.excluded?1:-1;
    var d=(isFinite(b.meanInteg)?b.meanInteg:-1)-(isFinite(a.meanInteg)?a.meanInteg:-1);
    return d||(b.areaHa-a.areaHa);
  };
  polys.sort(byScore);
  for(i=0;i<polys.length;i++){ polys[i].rank=i+1; polys[i].rankMin=i+1; polys[i].rankMax=i+1; }

  /* ---- 10. sensibilidade: variação automática dos pesos ---- */
  var sens=null, SS=job.sensitivity||{};
  if(SS.enabled&&+SS.n>0&&(selGeo.length+selFea.length)>0){
    var N=Math.min(200,Math.max(2,Math.round(+SS.n))), pct=Math.abs(+SS.pct||10)/100;
    var topCode=classes.reduce(function(a,c){return c.code>a?c.code:a;},-Infinity);
    var stable=new Float32Array(n), tally=new Float32Array(n);
    var critFlip=new Float64Array(crits.length), critN=new Float64Array(crits.length);
    var g2=newF32(n,NaN),wa=newF32(n,0),f2=newF32(n,NaN),wb=newF32(n,0);
    var baseW=crits.map(function(C){return +C.weight||0;});
    var baseCls=Float32Array.from(cls);
    for(var it=0;it<N;it++){
      yield stage(0.91+0.08*it/N,'Sensibilidade '+(it+1)+'/'+N);
      var pert=[];
      for(ci=0;ci<crits.length;ci++){
        var dv=(Math.random()*2-1)*pct;
        pert.push(Math.max(0,baseW[ci]*(1+dv)));
        crits[ci].weight=pert[ci];
      }
      if(selGeo.length) overlayRange(std,crits,selGeo,mode,CF,g2,wa,0,n);
      if(selFea.length) overlayRange(std,crits,selFea,mode,CF,f2,wb,0,n);
      var simI=new Float32Array(n);
      for(k=0;k<n;k++){
        if(!inArea[k]||legal[k]!==1){ simI[k]=NaN; continue; }
        var s2=0,w3=0,ms=false;
        if(selGeo.length){ if(isFinite(g2[k])){s2+=fg*g2[k];w3+=fg;} else ms=true; }
        if(selFea.length){ if(isFinite(f2[k])){s2+=ff*f2[k];w3+=ff;} else ms=true; }
        simI[k]=(w3<=0||(ms&&mode==='strict'))?NaN:s2/w3;
      }
      var sc=classify(simI,legal,classes,n);
      var flipped=0,counted=0;
      for(k=0;k<n;k++){
        if(!isFinite(sc[k])||sc[k]<=0) continue;
        tally[k]++; counted++;
        if(sc[k]===topCode) stable[k]++;
        if(isFinite(baseCls[k])&&baseCls[k]>0&&sc[k]!==baseCls[k]) flipped++;
      }
      /* posição de cada polígono nesta simulação (mesmas células, nota nova) */
      var sim=[];
      for(i=0;i<polys.length;i++){
        var P=polys[i], sv2=0,nv2=0;
        for(j=0;j<P._cells.length;j++){ var q=simI[P._cells[j]]; if(isFinite(q)){ sv2+=q; nv2++; } }
        sim.push({i:i,excluded:P.excluded,meanInteg:nv2?sv2/nv2:NaN,areaHa:P.areaHa});
      }
      sim.sort(byScore);
      for(i=0;i<sim.length;i++){
        var P2=polys[sim[i].i], rr=i+1;
        if(rr<P2.rankMin)P2.rankMin=rr; if(rr>P2.rankMax)P2.rankMax=rr;
      }
      for(ci=0;ci<crits.length;ci++){
        critFlip[ci]+=Math.abs(pert[ci]-baseW[ci])*(counted?flipped/counted:0);
        critN[ci]+=Math.abs(pert[ci]-baseW[ci]);
        crits[ci].weight=baseW[ci];
      }
    }
    for(k=0;k<n;k++) stable[k]=tally[k]>0?stable[k]/N:((inArea[k]&&legal[k]===1)?0:NaN);
    sens={stability:stable,n:N,pct:+SS.pct||10,
      critSens:Array.prototype.slice.call(critFlip).map(function(v,ix){return critN[ix]?v/critN[ix]:0;})};
    for(i=0;i<polys.length;i++) polys[i].unstable=(polys[i].rankMax-polys[i].rankMin)>Math.max(2,polys.length*0.15);
  }
  for(i=0;i<polys.length;i++) delete polys[i]._cells;

  return {
    grid:G, nArea:nArea, nExcluded:nExcl,
    geo:geo, feas:fea, integrated:integ, legal:legal, reason:reason,
    s5:s5Out, score100:score100, fIndex:fIdx, weightUsed:s5w, renorm:renorm,
    classified:cls, classes:classes, breaks:brInfo,
    standardized:std, raw:raw,
    polys:polys, droppedSmall:dropped, ruleLog:ruleLog,
    sensitivity:sens, warnings:warn, ms:Date.now()-t0,
    members:{geo:selGeo,feas:selFea}
  };
}
`;
const MCF_KERNEL_ALL = MCF_K1+MCF_K2+MCF_K3+MCF_K4;

/* Cola do worker: consome o gerador e devolve progresso e resultado. Arrays
   tipados vão por transferência sempre que possível — copiar 20 MB de grade
   por mensagem custaria mais que o próprio cálculo. */
const MCF_WORKER_GLUE = `
self.onmessage=function(ev){
  var job=ev.data;
  try{
    var it=mcfRun(job), step;
    while(!(step=it.next()).done) self.postMessage(step.value);
    var R=step.value, tr=[];
    ['geo','feas','integrated','legal','classified','reason',
     's5','score100','fIndex','weightUsed','renorm'].forEach(function(k){
      if(R[k]&&R[k].buffer) tr.push(R[k].buffer);
    });
    (R.standardized||[]).forEach(function(a){ if(a&&a.buffer) tr.push(a.buffer); });
    (R.raw||[]).forEach(function(a){ if(a&&a.buffer) tr.push(a.buffer); });
    if(R.sensitivity&&R.sensitivity.stability) tr.push(R.sensitivity.stability.buffer);
    self.postMessage({type:'done',result:R},tr);
  }catch(e){
    self.postMessage({type:'error',message:(e&&e.message)||String(e),stack:e&&e.stack});
  }
};`;

let MCF_workerURL=null, MCF_localKernel=null, MCF_workerOK=null;

function mcfLocalKernel(){
  if(!MCF_localKernel){
    /* O MESMO texto do worker, avaliado no documento. Usado quando o navegador
       recusa o worker (file:// em alguns navegadores) — assim o resultado é
       bit a bit o mesmo, e não uma segunda implementação "de reserva". */
    MCF_localKernel=new Function(MCF_KERNEL_ALL+'\nreturn {mcfRun:mcfRun};')();
  }
  return MCF_localKernel;
}
function mcfWorkerURL(){
  if(MCF_workerURL) return MCF_workerURL;
  const blob=new Blob([MCF_KERNEL_ALL+MCF_WORKER_GLUE],{type:'text/javascript'});
  MCF_workerURL=URL.createObjectURL(blob);
  return MCF_workerURL;
}

/* Executa o trabalho. Devolve {promise, cancel}. */
function mcfExecute(job,onProgress){
  let cancelled=false, worker=null, rejectRef=null;
  /* Cancelar precisa REJEITAR: encerrar o worker sem isso deixaria a promessa
     pendente para sempre e o botão travado em "calculando". */
  const cancel=()=>{
    cancelled=true;
    if(worker){ try{worker.terminate();}catch(e){} worker=null; }
    if(rejectRef){ const f=rejectRef; rejectRef=null; f(new Error('cancelado')); }
  };

  const promise=new Promise((resolve,reject)=>{
    rejectRef=reject;
    const done=v=>{ rejectRef=null; resolve(v); };
    const fail=e=>{ rejectRef=null; reject(e); };
    const runLocal=(motivo)=>{
      if(motivo) console.info('[MCF] cálculo no documento —',motivo);
      let it;
      try{ it=mcfLocalKernel().mcfRun(job); }catch(e){ fail(e); return; }
      const pump=()=>{
        if(cancelled){ fail(new Error('cancelado')); return; }
        const t0=performance.now();
        try{
          let step;
          /* fatia de ~40 ms: o suficiente para a barra andar sem travar o clique
             em Cancelar, e grande o bastante para não pagar um setTimeout por
             linha da grade. */
          while(performance.now()-t0<40){
            step=it.next();
            if(step.done){ done(step.value); return; }
          }
          if(step&&step.value&&onProgress) onProgress(step.value);
        }catch(e){ fail(e); return; }
        setTimeout(pump,0);
      };
      setTimeout(pump,0);
    };

    if(MCF_workerOK===false){ runLocal('worker indisponível nesta sessão'); return; }
    try{
      worker=new Worker(mcfWorkerURL());
    }catch(e){
      MCF_workerOK=false; runLocal(e.message); return;
    }
    let started=false;
    worker.onmessage=ev=>{
      const m=ev.data;
      if(m.type==='progress'){ started=true; MCF_workerOK=true; if(onProgress)onProgress(m); return; }
      if(m.type==='done'){ MCF_workerOK=true; worker.terminate(); worker=null; done(m.result); return; }
      if(m.type==='error'){ worker.terminate(); worker=null; fail(new Error(m.message)); }
    };
    worker.onerror=e=>{
      if(worker){ try{worker.terminate();}catch(_){} worker=null; }
      e.preventDefault&&e.preventDefault();
      if(cancelled) return;
      if(!started){ MCF_workerOK=false; runLocal(e.message||'falha ao iniciar o worker'); }
      else fail(new Error(e.message||'falha no worker'));
    };
    try{ worker.postMessage(job); }
    catch(e){
      /* estrutura não clonável: cai para o documento em vez de perder o trabalho */
      if(worker){ try{worker.terminate();}catch(_){} worker=null; }
      MCF_workerOK=false; runLocal('mensagem não clonável: '+e.message);
    }
  });
  return {promise,cancel};
}
/* ===========================================================================
   MODELO — estado da análise, extração de geometria e definição da grade.
   ========================================================================= */
const MCF_GROUPS=['Geological Prospectivity','Mineral Rights','Infrastructure and Logistics',
  'Environmental Constraints','Territorial and Social Constraints','Terrain and Hydrology','Data Confidence'];
const MCF_GROUP_PT={
  'Geological Prospectivity':'Prospectividade geológica',
  'Mineral Rights':'Direitos minerários',
  'Infrastructure and Logistics':'Infraestrutura e logística',
  'Environmental Constraints':'Restrições ambientais',
  'Territorial and Social Constraints':'Restrições territoriais e sociais',
  'Terrain and Hydrology':'Terreno e hidrologia',
  'Data Confidence':'Confiança do dado'};
/* Grupos que compõem cada índice. Direitos minerários, infraestrutura,
   ambiente, território, terreno e hidrologia respondem pela VIABILIDADE;
   apenas a prospectividade responde pelo POTENCIAL GEOLÓGICO. */
const MCF_INDEX_OF={
  'Geological Prospectivity':'geo','Mineral Rights':'feas','Infrastructure and Logistics':'feas',
  'Environmental Constraints':'feas','Territorial and Social Constraints':'feas',
  'Terrain and Hydrology':'feas','Data Confidence':'none'};

const MCF_INPUT_TYPES=[['polygon','Polígono'],['line','Linha'],['point','Ponto'],
  ['rasterCont','Raster contínuo'],['rasterCat','Raster categórico'],
  ['distance','Distância de feição'],['binary','Máscara binária']];
const MCF_METHODS=[['reclass','Reclassificação direta por intervalos'],
  ['lookup','De-para categórico'],['linInc','Linear crescente'],['linDec','Linear decrescente'],
  ['piecewise','Linear por partes'],['euclid','Distância euclidiana + intervalos'],
  ['bool','Máscara booleana'],['fuzzy','Pertinência fuzzy']];
const MCF_CONF=[['high','Alta'],['medium','Média'],['low','Baixa']];
const MCF_SCALE=[[5,'5 — Highly favorable'],[4,'4 — Favorable'],
  [3,'3 — Moderately favorable'],[2,'2 — Unfavorable'],
  [1,'1 — Very unfavorable'],[0,'0 — Incompatible or extremely unfavorable']];
/* Spec 2 — classification sense, offered explicitly instead of being implied
   by the standardization method. */
const MCF_DIRECTIONS=[['higher','Higher is better'],['lower','Lower is better'],
  ['class','Class-based'],['decay','Distance-decay'],['binary','Binary condition']];
/* Spec 8 — missing-data rule, per criterion. */
const MCF_MISSING=[['renorm','Exclude from calculation and renormalize weights'],
  ['conservative','Conservative score'],['insufficient','Insufficient data']];

/* Spec 7 — thresholds on SCORE_100. classify() already uses
   v >= min && (last ? v <= max : v < max), so the bounds neither overlap
   nor leave a gap. F = SCORE_100/100 gives 0.33 and 0.66 exactly. */
function mcfDefaultClasses(){
  return [
    {code:1,label:'Unfavorable',      min:0,  max:33, color:'#d9480f'},
    {code:2,label:'Favorable',        min:33, max:66, color:'#a3c847'},
    {code:3,label:'Highly Favorable', min:66, max:100,color:'#1b5e20'}
  ];
}
const MCF_EXCLUDED_COLOR='#8d8d8d', MCF_UNCLASS_COLOR='#d6d6d6';

function mcfNewState(){
  return {
    version:1,
    meta:{name:'Análise multicritério de favorabilidade', substance:'Caulim', notes:'', createdAt:new Date().toISOString()},
    grid:{areaLayerId:'', crs:(typeof S!=='undefined'&&S.workCRS)||'EPSG:31982', cell:250,
          refRasterId:'', align:'grid', nodata:-9999},
    criteria:[], masks:[],
    scenarios:[{id:'base',name:'Balanced · Equilibrado',weights:{}}], scenarioId:'base',
    weighting:{mode:'renorm'},
    confidenceApply:false, confidenceFactors:{high:1.00,medium:0.85,low:0.65},
    integration:{geo:0.60,feas:0.40},
    classification:{method:'fixed',classes:mcfDefaultClasses()},
    rules:{geoFloor:{on:true,min:3.0}, envSevere:{on:true,capClass:2},
           lowConf:{on:false,minFactor:0.85,capClass:2}},
    post:{majority:false,majorityPasses:1,minAreaHa:25,fillHoles:false,fillMaxHa:5,
          connectivity:8,simplifyTol:0,polyClasses:[],dropSmall:true},
    sensitivity:{enabled:false,pct:10,n:20},
    symbology:{opacity:0.75,excluded:MCF_EXCLUDED_COLOR,unclassified:MCF_UNCLASS_COLOR,hatchExcluded:true}
  };
}
const MCF={ state:mcfNewState(), last:null, running:null, uid:1 };
window.MCF=MCF;

const mcfId=p=>(p||'c')+(MCF.uid++)+'_'+Math.random().toString(36).slice(2,6);
const mcfNum=(v,d)=>{const q=parseFloat(v);return isFinite(q)?q:d;};
const mcfEsc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- CRS: métrica só existe em sistema projetado ---------- */
function mcfIsGeographic(crs){ return /4326|4674|4618|4989/.test(String(crs||'')); }

/* ---------- extração de geometria já no CRS da análise ---------- */
function mcfLayer(id){ return (S.layers||[]).find(l=>String(l.id)===String(id))||null; }
function mcfRaster(id){ return (S.rasters||[]).find(r=>String(r.id)===String(id))||null; }

/* ignoraVis: uma MÁSCARA LEGAL não pode depender de o usuário ter escondido
   uma classe na simbologia. No projeto Titan, duas das quatro UCs de proteção
   integral estavam com vis=false — a máscara as pularia em silêncio, e a
   restrição legal simplesmente não valeria naquelas áreas. Critérios mantêm o
   comportamento antigo; a validação avisa quando há classe oculta. */
function mcfFeatsOf(L,crs,filter,ignoraVis){
  if(!L) return {feats:[],points:[],gtype:'polygon',segLens:[]};
  const conv=(L.crs&&String(L.crs)!==String(crs))?((x,y)=>reproj(L.crs,crs,x,y)):null;
  const feats=[],points=[],segLens=[];
  (L.features||[]).forEach(f=>{
    if(!f||!f.geom) return;
    if(!ignoraVis && typeof featureVisible==='function' && !featureVisible(L,f)) return;
    if(ignoraVis && typeof attrFilterMatch==='function' && !attrFilterMatch(L,f)) return;
    if(filter && !filter(f)) return;
    if(L.gtype==='point'){
      /* Em CCMGIS o ponto guarda o PAR direto em f.geom ([x,y]); só o multiponto
         guarda uma lista de pares. Ler f.geom[0] como se fosse sempre um par
         devolvia [undefined,undefined] no caso comum — e aí rasterPoints não
         marcava nada e TODO critério de ponto saía com a distância no teto, sem
         erro nenhum. Mesmo engano que já apareceu no buffer e no edPickAt. */
      const g=f.geom;
      const um=q=>{
        if(!Array.isArray(q)||!isFinite(q[0])||!isFinite(q[1])) return;
        const c=conv?conv(q[0],q[1]):[q[0],q[1]];
        if(isFinite(c[0])&&isFinite(c[1])) points.push([c[0],c[1]]);
      };
      if(typeof g[0]==='number'&&typeof g[1]==='number') um(g);
      else if(Array.isArray(g)) g.forEach(um);
      return;
    }
    const parts=(f.multi&&Array.isArray(f.geom[0])&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
    const rings=[];
    parts.forEach(pt=>{
      if(!Array.isArray(pt)||pt.length<2) return;
      const q=pt.map(p=>{const c=conv?conv(p[0],p[1]):[p[0],p[1]];return [c[0],c[1]];});
      for(let i=1;i<q.length;i++) segLens.push(Math.hypot(q[i][0]-q[i-1][0],q[i][1]-q[i-1][1]));
      rings.push(q);
    });
    if(rings.length) feats.push({rings,props:f.props||{}});
  });
  return {feats,points,gtype:L.gtype,segLens};
}

/* Raster do CCMGIS reprojetado para o CRS de análise quando necessário. Todas
   as grades do programa vivem em S.workCRS; se a análise usa outro EPSG, a
   grade é reprojetada com o mesmo warp do restante do sistema. */
function mcfRasterGrid(r,crs){
  if(!r||!r.d) return null;
  const d=r.d;
  if(String(crs)===String(S.workCRS)||typeof warpRaster!=='function')
    return {nc:d.nc,nr:d.nr,cs:d.cs,csy:d.csy||d.cs,xll:d.xll,yll:d.yll,z:d.z};
  try{
    const w=warpRaster(d,(x,y)=>reproj(S.workCRS,crs,x,y),(X,Y)=>reproj(crs,S.workCRS,X,Y));
    return {nc:w.nc,nr:w.nr,cs:w.cs,csy:w.csy||w.cs,xll:w.xll,yll:w.yll,z:w.z};
  }catch(e){ return {nc:d.nc,nr:d.nr,cs:d.cs,csy:d.csy||d.cs,xll:d.xll,yll:d.yll,z:d.z}; }
}

/* ---------- definição da grade comum ---------- */
function mcfComputeGrid(st,opts){
  const g=st.grid, crs=g.crs;
  const out={ok:false,msg:'',warnings:[]};
  if(mcfIsGeographic(crs)){
    out.msg='CRS de trabalho geográfico ('+crs+'). Distância, célula e área são medidas em METROS — escolha um CRS projetado (UTM/SIRGAS).';
    return out;
  }
  const cs=mcfNum(g.cell,250);
  if(!(cs>0)){ out.msg='Tamanho de célula inválido.'; return out; }
  const LA=mcfLayer(g.areaLayerId);
  if(!LA){ out.msg='Selecione o polígono de extensão da análise.'; return out; }
  if(LA.gtype!=='polygon'){ out.msg='A extensão da análise precisa ser uma camada de POLÍGONO.'; return out; }
  const ex=mcfFeatsOf(LA,crs,null);
  if(!ex.feats.length){ out.msg='A camada de extensão não tem feições visíveis.'; return out; }
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  ex.feats.forEach(f=>f.rings.forEach(R=>R.forEach(p=>{
    if(p[0]<x0)x0=p[0]; if(p[0]>x1)x1=p[0];
    if(p[1]<y0)y0=p[1]; if(p[1]>y1)y1=p[1];
  })));
  let ox=0,oy=0;
  if(g.align==='ref'&&g.refRasterId){
    const R=mcfRaster(g.refRasterId), rg=R?mcfRasterGrid(R,crs):null;
    if(rg){ ox=rg.xll; oy=rg.yll; }
    else out.warnings.push('Raster de referência não encontrado — grade alinhada à origem do CRS.');
  }
  let xll=x0,yll=y0;
  if(g.align!=='none'){
    xll=ox+Math.floor((x0-ox)/cs)*cs;
    yll=oy+Math.floor((y0-oy)/cs)*cs;
  }
  const nc=Math.max(1,Math.ceil((x1-xll)/cs)), nr=Math.max(1,Math.ceil((y1-yll)/cs));
  out.ok=true;
  out.grid={nc,nr,cs,xll,yll,crs,nodata:mcfNum(g.nodata,-9999)};
  out.areaFeats=ex.feats;
  out.cells=nc*nr;
  out.areaKm2=(x1-x0)*(y1-y0)/1e6;
  /* memória: cada critério guarda bruto + padronizado, mais ~8 grades de
     trabalho (geo, viabilidade, integrado, máscara, classe, estabilidade…) */
  const nCrit=Math.max(1,(st.criteria||[]).length);
  out.memMB=out.cells*4*(2*nCrit+8)/1048576;
  if(out.cells>2.5e7) out.warnings.push('Mais de 25 milhões de células — aumente o tamanho da célula.');
  else if(out.cells>6e6) out.warnings.push('Grade grande ('+(out.cells/1e6).toFixed(1)+' M células): o cálculo pode levar minutos.');
  /* resolução x escala do dado */
  const lens=[];
  (st.criteria||[]).forEach(c=>{
    const L=mcfLayer(c.layerId); if(!L||L.gtype==='point') return;
    const q=mcfFeatsOf(L,crs,null).segLens;
    for(let i=0;i<q.length;i+=Math.max(1,Math.floor(q.length/200))) if(q[i]>0) lens.push(q[i]);
  });
  if(lens.length>20){
    lens.sort((a,b)=>a-b);
    const med=lens[Math.floor(lens.length/2)];
    if(cs<med/4) out.warnings.push('Célula de '+cs+' m é bem mais fina que o detalhe das camadas de entrada (vértices a ~'+med.toFixed(0)+' m). A grade fica mais detalhada do que o dado permite.');
  }
  return out;
}
/* ===========================================================================
   MONTAGEM DO TRABALHO E VALIDAÇÃO
   ========================================================================= */
function mcfActiveWeights(st){
  const sc=(st.scenarios||[]).find(s=>s.id===st.scenarioId);
  const w={};
  (st.criteria||[]).forEach(c=>{
    const v=(sc&&sc.weights&&sc.weights[c.id]!==undefined)?sc.weights[c.id]:c.weight;
    w[c.id]=mcfNum(v,0);
  });
  return w;
}
function mcfWeightTotal(st){
  const w=mcfActiveWeights(st); let t=0;
  (st.criteria||[]).forEach(c=>{ if(!c.locked||true) t+=mcfNum(w[c.id],0); });
  return t;
}
function mcfNormalizeWeights(st){
  const w=mcfActiveWeights(st);
  const free=(st.criteria||[]).filter(c=>!c.locked);
  const lockedSum=(st.criteria||[]).filter(c=>c.locked).reduce((s,c)=>s+mcfNum(w[c.id],0),0);
  const freeSum=free.reduce((s,c)=>s+mcfNum(w[c.id],0),0);
  const target=100-lockedSum;
  if(freeSum<=0||target<0) return false;
  const sc=(st.scenarios||[]).find(s=>s.id===st.scenarioId); if(!sc) return false;
  sc.weights=sc.weights||{};
  (st.criteria||[]).forEach(c=>{ if(c.locked) sc.weights[c.id]=mcfNum(w[c.id],0); });
  free.forEach(c=>{ sc.weights[c.id]=+(mcfNum(w[c.id],0)*target/freeSum).toFixed(4); });
  return true;
}

function mcfValidate(st){
  const err=[],warn=[];
  const w=mcfActiveWeights(st);
  const total=Object.values(w).reduce((s,v)=>s+v,0);
  (st.criteria||[]).forEach(c=>{
    if(mcfNum(w[c.id],0)<0) err.push('Peso negativo em "'+c.name+'" — pesos negativos não são permitidos.');
    const chk=v=>{ const q=mcfNum(v,NaN); return isFinite(q)&&q>=0&&q<=5; };
    /* Classe escondida na simbologia sai do cálculo do critério sem alarde.
       Pode ser intencional — mas tem de aparecer no relatório. */
    if(c.layerId && !c.rasterId){
      const L0=mcfLayer(c.layerId), s0=L0&&L0.sym;
      const oc=s0?((s0.mode==='cat'?s0.cats:s0.mode==='grad'?s0.classes:[])||[]).filter(x=>x&&x.vis===false).length:0;
      if(oc) warn.push('"'+c.name+'": '+oc+' classe(s) ocultas na simbologia de "'+L0.name+
        '" ficam de fora deste critério. Máscaras legais ignoram a visibilidade; critérios não.');
    }
    if(c.method==='reclass'||c.method==='euclid'){
      const R=c.rules||[];
      if(!R.length) err.push('"'+c.name+'" não tem nenhuma regra de reclassificação.');
      R.forEach((r,i)=>{
        if(!chk(r.score)) err.push('"'+c.name+'": nota '+r.score+' na faixa '+(i+1)+' fora do intervalo 0–5.');
        const lo=(r.min===''||r.min==null)?-Infinity:+r.min, hi=(r.max===''||r.max==null)?Infinity:+r.max;
        if(isFinite(lo)&&isFinite(hi)&&hi<=lo) err.push('"'+c.name+'": faixa '+(i+1)+' com máximo menor ou igual ao mínimo.');
      });
      const g=mcfRuleGaps(R);
      g.overlaps.forEach(o=>warn.push('"'+c.name+'": faixas '+o+' se sobrepõem.'));
      g.gaps.forEach(o=>warn.push('"'+c.name+'": intervalo sem regra entre '+o+' — a célula sairá como sem-dado.'));
    }
    if(c.method==='lookup'){
      if(!(c.lookup||[]).length) err.push('"'+c.name+'" não tem tabela de-para categórica.');
      (c.lookup||[]).forEach(L=>{ if(!chk(L.score)) err.push('"'+c.name+'": nota '+L.score+' fora de 0–5.'); });
    }
    if(c.method==='bool'){
      if(!chk(c.boolInside)||!chk(c.boolOutside)) err.push('"'+c.name+'": notas da máscara booleana fora de 0–5.');
    }
    if(c.method==='piecewise'){
      (c.piecewise||[]).forEach(p=>{ if(!chk(p.y)) err.push('"'+c.name+'": ponto da curva com nota fora de 0–5.'); });
    }
    if(c.method==='euclid'&&mcfIsGeographic(st.grid.crs))
      err.push('"'+c.name+'": distância métrica exige CRS projetado.');
    if(!c.layerId&&!c.rasterId) err.push('"'+c.name+'" está sem camada de entrada.');
  });
  (st.masks||[]).forEach(m=>{
    if(m.enabled===false) return;
    if(!m.layerId&&!m.rasterId) err.push('Máscara "'+m.name+'" está sem camada.');
    if(!m.reason) warn.push('Máscara "'+m.name+'" sem fundamento/motivo registrado.');
  });
  const cls=(st.classification&&st.classification.classes)||[];
  for(let i=1;i<cls.length;i++)
    if(+cls[i].min<+cls[i-1].max-1e-9) warn.push('Classes finais "'+cls[i-1].label+'" e "'+cls[i].label+'" se sobrepõem.');
  /* Spec 3 — the sum of the active weights MUST be 100%. It used to be a
     warning, so a run could go out with a divisor that was not 100 and a
     SCORE_100 that did not close at 100. It now blocks. */
  if(Math.abs(total-100)>0.01)
    err.push('Sum of active weights = '+total.toFixed(2)+'% — it must be exactly 100%. Use "Normalize weights".');
  const fg=mcfNum(st.integration.geo,0.6), ff=mcfNum(st.integration.feas,0.4);
  if(Math.abs(fg+ff-1)>1e-6) warn.push('Fatores de integração somam '+(fg+ff).toFixed(2)+' — o resultado é renormalizado por esta soma.');
  if(!(st.criteria||[]).length) err.push('Nenhum critério cadastrado.');
  return {err,warn,total};
}
function mcfRuleGaps(R){
  const rs=R.map((r,i)=>({i,lo:(r.min===''||r.min==null)?-Infinity:+r.min,hi:(r.max===''||r.max==null)?Infinity:+r.max}))
            .filter(r=>isFinite(r.lo)||isFinite(r.hi)).sort((a,b)=>a.lo-b.lo);
  const overlaps=[],gaps=[];
  for(let i=1;i<rs.length;i++){
    if(rs[i].lo<rs[i-1].hi-1e-9) overlaps.push((rs[i-1].i+1)+' e '+(rs[i].i+1));
    else if(rs[i].lo>rs[i-1].hi+1e-9) gaps.push(rs[i-1].hi+' e '+rs[i].lo);
  }
  return {overlaps,gaps};
}

/* ---------- filtro de feições por atributo (máscaras e critérios) ---------- */
function mcfAttrFilter(sel){
  if(!sel||!sel.field||sel.value===''||sel.value==null) return null;
  const f=sel.field, op=sel.op||'eq', want=String(sel.value).toLowerCase();
  const list=want.split(/\s*[;,]\s*/).filter(Boolean);
  return ft=>{
    const v=String((ft.props||{})[f]??'').toLowerCase();
    switch(op){
      case 'neq': return v!==want;
      case 'contains': return v.indexOf(want)>=0;
      case 'in': return list.indexOf(v)>=0;
      case 'gt': return parseFloat(v)>parseFloat(want);
      case 'lt': return parseFloat(v)<parseFloat(want);
      default: return v===want;
    }
  };
}

function mcfBuildJob(st,gridInfo){
  const crs=gridInfo.grid.crs, W=mcfActiveWeights(st);
  const criteria=(st.criteria||[]).map(c=>{
    const o={id:c.id,name:c.name,group:c.group,weight:mcfNum(W[c.id],0),
      index:MCF_INDEX_OF[c.group]||'feas',
      mandatory:!!c.mandatory, confidence:c.confidence||'high',
      severe:!!c.severe, severeAtOrBelow:mcfNum(c.severeAtOrBelow,1),
      method:c.method, rules:(c.rules||[]).map(r=>({min:(r.min===''||r.min==null)?null:+r.min,
        max:(r.max===''||r.max==null)?null:+r.max,score:+r.score,
        incLow:r.incLow!==false,incHigh:!!r.incHigh})),
      lookup:(c.lookup||[]).map(l=>({value:l.value,score:+l.score})),
      lookupFallback:(c.lookupFallback===''||c.lookupFallback==null)?null:+c.lookupFallback,
      lookupOutside:(c.lookupOutside===''||c.lookupOutside==null)?null:+c.lookupOutside,
      missing:c.missing||'renorm', missingScore:+c.missingScore||0,
      lin:{min:mcfNum(c.lin&&c.lin.min,0),max:mcfNum(c.lin&&c.lin.max,1)},
      piecewise:(c.piecewise||[]).map(p=>({x:+p.x,y:+p.y})),
      fuzzy:c.fuzzy||{type:'linear',a:0,b:1,invert:false},
      boolInside:mcfNum(c.boolInside,5), boolOutside:mcfNum(c.boolOutside,0),
      classField:c.classField||'', overlap:c.overlap||'center',
      resample:c.resample||'nearest',
      dist:{from:(c.dist&&c.dist.from)||'boundary',insideZero:!(c.dist&&c.dist.insideZero===false),
            max:mcfNum(c.dist&&c.dist.max,0),unit:(c.dist&&c.dist.unit)||'m'}};
    if(c.rasterId){
      const R=mcfRaster(c.rasterId); o.raster=R?mcfRasterGrid(R,crs):null;
      if(!o.raster) throw new Error('Raster do critério "'+c.name+'" não encontrado.');
    }else{
      const L=mcfLayer(c.layerId);
      if(!L) throw new Error('Camada do critério "'+c.name+'" não encontrada.');
      const g=mcfFeatsOf(L,crs,mcfAttrFilter(c.select));
      o.gtype=L.gtype; o.feats=g.feats; o.points=g.points;
      if(!g.feats.length&&!g.points.length)
        throw new Error('O critério "'+c.name+'" não tem nenhuma feição visível na camada "'+L.name+'".');
    }
    return o;
  });
  const masks=(st.masks||[]).filter(m=>m.enabled!==false).map(m=>{
    const o={id:m.id,name:m.name,reason:m.reason||'',invert:!!m.invert,
      overlap:m.overlap||'center', buffer:mcfNum(m.buffer,0),
      insideValue:mcfNum(m.insideValue,0), outsideValue:mcfNum(m.outsideValue,1),
      enabled:true};
    if(m.rasterId){
      const R=mcfRaster(m.rasterId); o.raster=R?mcfRasterGrid(R,crs):null;
      if(!o.raster) throw new Error('Raster da máscara "'+m.name+'" não encontrado.');
    }else{
      const L=mcfLayer(m.layerId);
      if(!L) throw new Error('Camada da máscara "'+m.name+'" não encontrada.');
      const g=mcfFeatsOf(L,crs,mcfAttrFilter(m.select),true);
      o.gtype=L.gtype; o.feats=g.feats; o.points=g.points;
      if(!g.feats.length&&!g.points.length)
        throw new Error('A máscara "'+m.name+'" não selecionou nenhuma feição na camada "'+L.name+'".');
    }
    return o;
  });
  return {
    grid:gridInfo.grid,
    areaFeats:gridInfo.areaFeats,
    criteria, masks,
    weighting:{mode:(st.weighting&&st.weighting.mode)||'renorm'},
    confidenceApply:!!st.confidenceApply,
    confidenceFactors:st.confidenceFactors||{high:1,medium:.85,low:.65},
    integration:{geo:mcfNum(st.integration.geo,.6),feas:mcfNum(st.integration.feas,.4)},
    classification:{method:(st.classification&&st.classification.method)||'fixed',
      classes:(st.classification.classes||[]).map(c=>({code:+c.code,label:c.label,color:c.color,min:+c.min,max:+c.max}))},
    rules:st.rules||{},
    post:st.post||{},
    sensitivity:st.sensitivity||{enabled:false}
  };
}
/* ===========================================================================
   SAÍDAS — rasters, polígonos e tabela de ranking dentro do CCMGIS
   ========================================================================= */
/* Reprojeta a grade da análise para o CRS de trabalho do projeto. Necessário
   porque toda grade do CCMGIS vive em S.workCRS: sem isto o raster apareceria
   deslocado quando a análise usa outro EPSG. Classe e máscara usam vizinho
   mais próximo — interpolar código de classe inventaria classes que não
   existem. */
function mcfRegrid(src,dstCRS,mode){
  if(String(src.crs)===String(dstCRS)) return src;
  const NB=32; let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
  for(let i=0;i<=NB;i++){
    const t=i/NB, W=src.xll+t*src.nc*src.cs, H=src.yll+t*src.nr*src.cs;
    [[W,src.yll],[W,src.yll+src.nr*src.cs],[src.xll,H],[src.xll+src.nc*src.cs,H]].forEach(([x,y])=>{
      const p=reproj(src.crs,dstCRS,x,y);
      if(p[0]<mnX)mnX=p[0]; if(p[0]>mxX)mxX=p[0]; if(p[1]<mnY)mnY=p[1]; if(p[1]>mxY)mxY=p[1];
    });
  }
  const cs=src.cs;
  const nc=Math.max(2,Math.ceil((mxX-mnX)/cs)), nr=Math.max(2,Math.ceil((mxY-mnY)/cs));
  const z=new Float32Array(nc*nr).fill(NaN);
  for(let r=0;r<nr;r++){
    const Y=mnY+(nr-r-0.5)*cs;
    for(let c=0;c<nc;c++){
      const X=mnX+(c+0.5)*cs;
      const p=reproj(dstCRS,src.crs,X,Y);
      const fc=(p[0]-src.xll)/cs-0.5, fr=(src.nr-1)-((p[1]-src.yll)/cs-0.5);
      let v=NaN;
      if(mode==='bilinear'){
        const c0=Math.floor(fc),r0=Math.floor(fr),tx=fc-c0,ty=fr-r0; let s=0,w=0;
        for(let dr=0;dr<2;dr++)for(let dc=0;dc<2;dc++){
          const rr=r0+dr,cc=c0+dc; if(rr<0||rr>=src.nr||cc<0||cc>=src.nc) continue;
          const q=src.z[rr*src.nc+cc]; if(!isFinite(q)) continue;
          const ww=(dc?tx:1-tx)*(dr?ty:1-ty); s+=q*ww; w+=ww;
        }
        v=w>0?s/w:NaN;
      }else{
        const rc=Math.round(fc),rr=Math.round(fr);
        if(rc>=0&&rc<src.nc&&rr>=0&&rr<src.nr){ const q=src.z[rr*src.nc+rc]; v=isFinite(q)?q:NaN; }
      }
      z[r*nc+c]=v;
    }
  }
  return {nc,nr,cs,csy:cs,xll:mnX,yll:mnY,z,crs:dstCRS};
}

const MCF_SCORE_RAMP=['#8c1d0a','#c1400f','#e07b18','#f0b429','#e5d43a','#c8d24a','#9dc44f','#6fae4e','#3f8f43','#1b5e20'];
function mcfScoreClasses(){
  return MCF_SCORE_RAMP.map((c,i)=>({min:i*0.5-(i===0?0.001:0),max:(i+1)*0.5+(i===9?0.001:0),
    color:c,label:(i*0.5).toFixed(1)+'–'+((i+1)*0.5).toFixed(1)}));
}
function mcfStabilityClasses(){
  const cols=['#b91c1c','#ea580c','#f59e0b','#a3c847','#1b5e20'];
  return cols.map((c,i)=>({min:i*0.2-(i===0?0.001:0),max:(i+1)*0.2+(i===4?0.001:0),color:c,
    label:(i*20)+'–'+((i+1)*20)+'%'}));
}
function mcfGroupId(){
  const nome='Favorabilidade multicritério';
  let g=(S.groups||[]).find(x=>x.name===nome);
  if(!g){ g={id:gid++,name:nome,collapsed:false}; S.groups.push(g);
    (S.stack=S.stack||[]).unshift('G:'+g.id); }
  return g.id;
}
function mcfPutRaster(name,grid,classes,opacity,meta){
  /* native:true / resampled:1 dizem a verdade sobre esta grade: ela NASCE na
     resolução da análise, não foi reamostrada de arquivo nenhum. Sem essas
     marcas, precisaFonte() considera a procedência desconhecida ao reabrir o
     projeto e o CCMGIS passa a pedir "o GeoTIFF original" de uma superfície
     que nunca teve arquivo de origem. */
  const d={nc:grid.nc,nr:grid.nr,cs:grid.cs,csy:grid.csy||grid.cs,xll:grid.xll,yll:grid.yll,z:grid.z,
    native:true,resampled:1};
  let R=(S.rasters||[]).find(r=>r.name===name);
  /* Todas as superfícies nasciam VISÍVEIS. Depois de um cálculo ficavam seis
     empilhadas — potencial geológico, viabilidade, integrada, máscara legal,
     classificada e estabilidade —, cada uma a 75% de opacidade. O mapa virava
     uma sobreposição de manchas que não é resultado nenhum. Só a classificada
     acende sozinha; as demais entram apagadas, para o usuário ligar a que
     quiser ver. Superfície que já existia mantém a visibilidade que tinha. */
  const novo=!R;
  if(!R){ R={id:rid++,name,visible:false,overlay:null,style:{}}; S.rasters.push(R); }
  if(novo) R.visible = !!(meta && meta.kind==='classified');
  R.d=d; R._st=null;                                  /* força recalcular min/max */
  R.style=Object.assign(R.style||{},{mode:'classes',opacity:opacity??0.75,classes});
  if(novo&&!mcfLayer(MCF.state?.grid?.areaLayerId))R.groupId=mcfGroupId();
  R._mcf=meta||{};
  if(novo)placeProductAbove(R,mcfLayer(MCF.state?.grid?.areaLayerId));
  /* Sem isto o painel de informação lê qualquer superfície como MDT e anuncia
     "Cota 4,129 m" para um índice adimensional de 0 a 5 — junto com uma
     declividade calculada sobre ele, que não significa nada. */
  R.quantity='mcfIndex'; R.unit='';
  try{ renderRaster(R); }catch(e){ console.warn('MCF render',e); }
  return R;
}
function mcfClassStyle(st,classes){
  const out=[{min:-0.5,max:0.5,color:st.symbology.excluded,label:'Excluded · Excluída por máscara legal'}];
  classes.forEach(c=>out.push({min:c.code-0.5,max:c.code+0.5,color:c.color,label:c.label}));
  return out;
}

const MCF_FIELDS=[
  {name:'RANK',type:'N',length:6,decimal:0},{name:'TARGET_ID',type:'C',length:14},
  {name:'AREA_HA',type:'N',length:14,decimal:2},{name:'CLASSE',type:'N',length:4,decimal:0},
  {name:'CLASSE_TXT',type:'C',length:44},
  {name:'SCORE_MED',type:'N',length:9,decimal:3},{name:'SCORE_MAX',type:'N',length:9,decimal:3},
  {name:'GEO_MED',type:'N',length:9,decimal:3},{name:'VIAB_MED',type:'N',length:9,decimal:3},
  {name:'AMB_MED',type:'N',length:9,decimal:3},{name:'TERR_MED',type:'N',length:9,decimal:3},
  {name:'LOG_MED',type:'N',length:9,decimal:3},{name:'HIDRO_MED',type:'N',length:9,decimal:3},
  {name:'CONFIANCA',type:'N',length:7,decimal:2},{name:'STATUS',type:'C',length:14},
  {name:'MOTIVO_EXC',type:'C',length:80},
  {name:'CRIT_POS',type:'C',length:44},{name:'CRIT_NEG',type:'C',length:44},
  {name:'RANK_MIN',type:'N',length:6,decimal:0},{name:'RANK_MAX',type:'N',length:6,decimal:0},
  {name:'ESTAVEL',type:'C',length:6}
];
function mcfPolyProps(P,st,res,i){
  const cl=(res.classes||[]).find(c=>c.code===P.code);
  const mk=(res._maskNames||[])[P.reasonIdx]||'';
  return {
    RANK:P.rank, TARGET_ID:'TGT-'+String(P.rank).padStart(4,'0'),
    AREA_HA:+P.areaHa.toFixed(2), CLASSE:P.code,
    CLASSE_TXT:P.excluded?'Excluded · Excluída':(cl?cl.label:''),
    SCORE_MED:isFinite(P.meanInteg)?+P.meanInteg.toFixed(3):null,
    SCORE_MAX:isFinite(P.maxInteg)?+P.maxInteg.toFixed(3):null,
    GEO_MED:isFinite(P.meanGeo)?+P.meanGeo.toFixed(3):null,
    VIAB_MED:isFinite(P.meanFea)?+P.meanFea.toFixed(3):null,
    AMB_MED:isFinite(P.groups[0])?+P.groups[0].toFixed(3):null,
    TERR_MED:isFinite(P.groups[1])?+P.groups[1].toFixed(3):null,
    LOG_MED:isFinite(P.groups[2])?+P.groups[2].toFixed(3):null,
    HIDRO_MED:isFinite(P.groups[3])?+P.groups[3].toFixed(3):null,
    CONFIANCA:isFinite(P.conf)?+P.conf.toFixed(2):null,
    STATUS:P.excluded?'Excluded':'Eligible',
    MOTIVO_EXC:P.excluded?(mk||'máscara legal'):'',
    CRIT_POS:P.domPos||'', CRIT_NEG:P.domNeg||'',
    RANK_MIN:P.rankMin??P.rank, RANK_MAX:P.rankMax??P.rank,
    ESTAVEL:res.sensitivity?(P.unstable?'não':'sim'):''
  };
}
function mcfApplyOutputs(st,res){
  const gA=res.grid, dst=S.workCRS;
  const src=g=>({nc:gA.nc,nr:gA.nr,cs:gA.cs,csy:gA.cs,xll:gA.xll,yll:gA.yll,z:g,crs:gA.crs});
  const cont=g=>mcfRegrid(src(g),dst,'bilinear');
  const disc=g=>mcfRegrid(src(g),dst,'nearest');
  const op=st.symbology.opacity;
  const made=[];
  const sc=mcfScoreClasses();
  if(res.members.geo.length) made.push(mcfPutRaster('MCF · Potencial geológico',cont(res.geo),sc,op,{kind:'geo'}));
  if(res.members.feas.length) made.push(mcfPutRaster('MCF · Viabilidade de implantação',cont(res.feas),sc,op,{kind:'feas'}));
  made.push(mcfPutRaster('MCF · Favorabilidade integrada',cont(res.integrated),sc,op,{kind:'integrated'}));
  made.push(mcfPutRaster('MCF · Máscara legal',disc(res.legal),
    [{min:-0.5,max:0.5,color:st.symbology.excluded,label:'0 · Excluída'},
     {min:0.5,max:1.5,color:'#a3c847',label:'1 · Elegível'}],op,{kind:'legal'}));
  made.push(mcfPutRaster('MCF · Favorabilidade classificada',disc(res.classified),
    mcfClassStyle(st,res.classes),op,{kind:'classified'}));
  if(res.sensitivity)
    made.push(mcfPutRaster('MCF · Estabilidade (sensibilidade)',cont(res.sensitivity.stability),
      mcfStabilityClasses(),op,{kind:'stability'}));

  /* recorte visual pelo limite da análise, no padrão do restante do CCMGIS */
  const rings=[];
  (res._areaRings||[]).forEach(R=>{
    const q=R.map(p=>{const c=(String(gA.crs)===String(dst))?p:reproj(gA.crs,dst,p[0],p[1]);return [c[0],c[1]];});
    if(q.length>=3) rings.push(q);
  });
  made.forEach(R=>{ R._exactClipRings=rings.length?rings.map(a=>a.map(p=>p.slice())):null; try{renderRaster(R);}catch(e){} });

  /* ---- polígonos das áreas prioritárias ---- */
  const feats=(res.polys||[]).map((P,i)=>{
    const geom=[];
    (P.parts||[]).forEach(part=>part.forEach(R=>{
      geom.push(R.map(p=>{const c=(String(gA.crs)===String(dst))?p:reproj(gA.crs,dst,p[0],p[1]);return [c[0],c[1]];}));
    }));
    return {geom,multi:true,zg:null,props:mcfPolyProps(P,st,res,i)};
  }).filter(f=>f.geom.length);
  const nome='MCF · Áreas prioritárias';
  const old=(S.layers||[]).find(l=>l.name===nome);
  if(old){
    try{ if(old.llayer) map.removeLayer(old.llayer); }catch(e){}
    S.layers=S.layers.filter(l=>l!==old);
    if(S.activeId===old.id) S.activeId=S.layers.length?S.layers[0].id:null;
    S.stack=(S.stack||[]).filter(k=>k!=='L:'+old.id);
  }
  let LP=null;
  if(feats.length){
    LP=addLayer({sourceLayer:mcfLayer(st.grid.areaLayerId),name:nome,gtype:'polygon',crs:dst,features:feats,fields:MCF_FIELDS,color:'#1b5e20'});
    if(!mcfLayer(st.grid.areaLayerId))LP.groupId=mcfGroupId();
    /* categorias no formato do CCMGIS: {value,color,vis} — é o que classOf lê */
    LP.sym.mode='cat'; LP.sym.field='CLASSE_TXT';
    LP.sym.cats=[{value:'Excluded · Excluída',color:st.symbology.excluded,vis:true}]
      .concat(res.classes.map(c=>({value:c.label,color:c.color,vis:true})));
    LP.sym.fill=0.45; LP.sym.weight=1.6; LP.fill=0.45; LP.weight=1.6;
    try{ drawLayer(LP); }catch(e){}
  }
  res._layerId=LP?LP.id:null;
  res._rasterIds=made.map(r=>r.id);
  try{ refreshUI(); zApply(); }catch(e){}
  return {rasters:made,layer:LP};
}
/* ===========================================================================
   AUDITORIA, RELATÓRIO E EXPORTAÇÃO
   ========================================================================= */
function mcfFmt(v,d){ return (v==null||!isFinite(v))?'—':Number(v).toLocaleString('pt-BR',
  {minimumFractionDigits:d??2,maximumFractionDigits:d??2}); }
function mcfRuleText(c){
  if(c.method==='lookup') return (c.lookup||[]).map(l=>l.value+' → '+l.score).join(' · ')||'(vazio)';
  if(c.method==='bool') return 'dentro='+c.boolInside+' · fora='+c.boolOutside;
  if(c.method==='linInc'||c.method==='linDec')
    return (c.method==='linInc'?'crescente':'decrescente')+' de '+mcfNum(c.lin&&c.lin.min,0)+' a '+mcfNum(c.lin&&c.lin.max,1);
  if(c.method==='piecewise') return (c.piecewise||[]).map(p=>p.x+'→'+p.y).join(' · ');
  if(c.method==='fuzzy') return 'fuzzy '+(c.fuzzy&&c.fuzzy.type||'linear')+' a='+(c.fuzzy&&c.fuzzy.a)+' b='+(c.fuzzy&&c.fuzzy.b);
  return (c.rules||[]).map(r=>{
    const lo=(r.min===''||r.min==null)?'-∞':r.min, hi=(r.max===''||r.max==null)?'∞':r.max;
    return '['+lo+', '+hi+') = '+r.score;
  }).join(' · ')||'(vazio)';
}
function mcfReport(st,res,val){
  const G=res.grid, L=[];
  const nome=(S.currentProjectName||(S.projectMeta&&S.projectMeta.name)||'projeto sem nome');
  const cellHa=G.cs*G.cs/10000;
  L.push('RELATÓRIO DE PROCESSAMENTO — ANÁLISE MULTICRITÉRIO DE FAVORABILIDADE');
  L.push('Multicriteria Favorability Analysis · CCMGIS');
  L.push(''.padEnd(74,'='));
  L.push('Data e hora ........ '+new Date().toLocaleString('pt-BR'));
  L.push('Projeto ............ '+nome);
  L.push('Estudo ............. '+(st.meta.name||'—')+(st.meta.substance?' · substância: '+st.meta.substance:''));
  L.push('Motor .............. '+(MCF_workerOK===false?'documento (Web Worker indisponível)':'Web Worker'));
  L.push('Tempo de cálculo ... '+(res.ms/1000).toFixed(1)+' s');
  L.push('');
  L.push('1. GRADE COMUM');
  L.push('   CRS de análise ... '+G.crs+(typeof CRS_LABELS!=='undefined'&&CRS_LABELS[G.crs]?' ('+CRS_LABELS[G.crs]+')':''));
  L.push('   CRS do projeto ... '+S.workCRS);
  L.push('   Extensão ......... X '+mcfFmt(G.xll,2)+' a '+mcfFmt(G.xll+G.nc*G.cs,2)+
         ' · Y '+mcfFmt(G.yll,2)+' a '+mcfFmt(G.yll+G.nr*G.cs,2));
  L.push('   Resolução ........ '+G.cs+' m · '+G.nc+' colunas × '+G.nr+' linhas = '+
         (G.nc*G.nr).toLocaleString('pt-BR')+' células');
  L.push('   Área por célula .. '+mcfFmt(cellHa,4)+' ha');
  L.push('   NoData ........... '+G.nodata);
  L.push('   Alinhamento ...... '+({grid:'origem do CRS',ref:'raster de referência',none:'extensão bruta'}[st.grid.align]||st.grid.align));
  L.push('   Extensão (camada)  '+((mcfLayer(st.grid.areaLayerId)||{}).name||'—'));
  L.push('   Células na análise '+res.nArea.toLocaleString('pt-BR')+' ('+mcfFmt(res.nArea*cellHa,2)+' ha)');
  L.push('');
  L.push('2. CRITÉRIOS E PESOS  (escala padronizada 0–5)');
  const W=mcfActiveWeights(st);
  const cen=(st.scenarios||[]).find(s=>s.id===st.scenarioId);
  L.push('   Cenário .......... '+((cen&&cen.name)||'—'));
  L.push('   Soma dos pesos ... '+mcfFmt(val.total,2)+' %');
  (st.criteria||[]).forEach((c,i)=>{
    const lay=c.rasterId?mcfRaster(c.rasterId):mcfLayer(c.layerId);
    L.push('   ['+(i+1)+'] '+c.name+'  —  peso '+mcfFmt(W[c.id],2)+' %');
    L.push('        grupo ...... '+c.group+' ('+(MCF_GROUP_PT[c.group]||'')+') → índice '+
           ({geo:'POTENCIAL GEOLÓGICO',feas:'VIABILIDADE',none:'não entra na média'}[MCF_INDEX_OF[c.group]||'feas']));
    L.push('        entrada .... '+(lay?lay.name:'?')+' · tipo '+c.inputType+' · método '+c.method);
    if(c.select&&c.select.field) L.push('        atributo ... '+c.select.field+' '+(c.select.op||'eq')+' "'+c.select.value+'"');
    if(c.classField) L.push('        campo class. '+c.classField);
    if(c.method==='euclid') L.push('        distância .. de '+((c.dist&&c.dist.from)==='centroid'?'centroide':'limite da geometria')+
      ' · interior '+((c.dist&&c.dist.insideZero===false)?'medido':'= 0')+
      ' · máx '+(mcfNum(c.dist&&c.dist.max,0)||'sem limite')+' · unidade '+((c.dist&&c.dist.unit)||'m'));
    L.push('        regras ..... '+mcfRuleText(c));
    L.push('        confiança .. '+c.confidence+(st.confidenceApply?' (fator '+st.confidenceFactors[c.confidence]+' APLICADO)':' (informativa)'));
    L.push('        obrigatório  '+(c.mandatory?'sim':'não')+(c.severe?' · restrição ambiental severa':''));
    if(c.source||c.sourceDate) L.push('        fonte ...... '+(c.source||'—')+(c.sourceDate?' · '+c.sourceDate:''));
    if(c.notes) L.push('        observação . '+c.notes);
  });
  L.push('');
  L.push('3. MÁSCARAS DE EXCLUSÃO LEGAL   (FINAL = M1 × M2 × … × Mn)');
  if(!(st.masks||[]).filter(m=>m.enabled!==false).length) L.push('   (nenhuma máscara ativa — nenhuma célula foi excluída por via legal)');
  (st.masks||[]).forEach(m=>{
    if(m.enabled===false){ L.push('   [desativada] '+m.name); return; }
    const lay=m.rasterId?mcfRaster(m.rasterId):mcfLayer(m.layerId);
    L.push('   · '+m.name+' — '+(lay?lay.name:'?'));
    L.push('        sobreposição '+(m.overlap==='any'?'PARCIAL (qualquer toque na célula)':'TOTAL (centro da célula)')+
           ' · buffer '+mcfNum(m.buffer,0)+' m'+(m.invert?' · INVERTIDA':''));
    L.push('        valores .... interior='+mcfNum(m.insideValue,0)+' exterior='+mcfNum(m.outsideValue,1));
    if(m.select&&m.select.field) L.push('        atributo ... '+m.select.field+' '+(m.select.op||'eq')+' "'+m.select.value+'"');
    L.push('        fundamento . '+(m.reason||'(não informado)'));
  });
  L.push('   Células excluídas . '+res.nExcluded.toLocaleString('pt-BR')+' ('+mcfFmt(res.nExcluded*cellHa,2)+' ha)');
  L.push('');
  L.push('4. FÓRMULA');
  L.push('   Nota do critério = padronização(valor bruto) → 0..5'+(st.confidenceApply?' × fator de confiança':''));
  L.push('   Média ponderada  = Σ(nota × peso) ÷ Σ(pesos válidos)');
  L.push('   Tratamento NoData: '+(st.weighting.mode==='strict'
    ? 'STRICT — qualquer critério sem dado devolve NoData'
    : 'RENORMALIZED — critério não obrigatório sem dado sai da conta e o divisor é recalculado'));
  L.push('   POTENCIAL GEOLÓGICO ..... critérios do grupo Geological Prospectivity ('+res.members.geo.length+' critério(s))');
  L.push('   VIABILIDADE ............. demais grupos ('+res.members.feas.length+' critério(s))');
  L.push('   INTEGRADO = '+mcfFmt(st.integration.geo,2)+' × GEO + '+mcfFmt(st.integration.feas,2)+' × VIABILIDADE');
  L.push('   FINAL     = INTEGRADO × MÁSCARA_LEGAL   (máscara 0 ⇒ classe Excluded, nunca nota 0)');
  L.push('');
  L.push('5. CLASSES FINAIS');
  L.push('   Método ........... '+({fixed:'limiares fixos',equal:'intervalos iguais',quantile:'quantis',jenks:'quebras naturais (Jenks)'}[st.classification.method]||st.classification.method));
  res.classes.forEach(c=>L.push('   ['+c.code+'] '+c.label+' : '+mcfFmt(c.min,2)+' – '+mcfFmt(c.max,2)));
  L.push('   [0] Excluded · excluída por máscara legal');
  L.push('   [NoData] Unclassified · dado insuficiente');
  const hist={};
  for(let i=0;i<res.classified.length;i++){ const v=res.classified[i]; if(isFinite(v)) hist[v]=(hist[v]||0)+1; }
  Object.keys(hist).sort((a,b)=>b-a).forEach(k=>{
    const c=res.classes.find(x=>x.code===+k);
    L.push('   área classe '+k+' ('+(+k===0?'Excluded':(c?c.label:'?'))+'): '+mcfFmt(hist[k]*cellHa,2)+' ha');
  });
  L.push('');
  L.push('6. REGRAS DE CONTROLE');
  const R=st.rules||{};
  L.push('   piso geológico p/ Highly Favorable ... '+(R.geoFloor&&R.geoFloor.on?('ativo, mínimo '+R.geoFloor.min+' — '+(res.ruleLog.geoFloor||0)+' célula(s) rebaixada(s)'):'inativo'));
  L.push('   restrição ambiental severa .......... '+(R.envSevere&&R.envSevere.on?('ativo, teto classe '+R.envSevere.capClass+' — '+(res.ruleLog.envSevere||0)+' célula(s)'):'inativo'));
  L.push('   confiança baixa limita a classe ..... '+(R.lowConf&&R.lowConf.on?('ativo, fator < '+R.lowConf.minFactor+' teto classe '+R.lowConf.capClass+' — '+(res.ruleLog.lowConf||0)+' célula(s)'):'inativo'));
  L.push('');
  L.push('7. PÓS-PROCESSAMENTO');
  const P=st.post||{};
  L.push('   filtro de maioria ... '+(P.majority?P.majorityPasses+' passada(s)':'não'));
  L.push('   preenchimento vazios  '+(P.fillHoles?'até '+P.fillMaxHa+' ha':'não'));
  L.push('   área mínima ......... '+mcfNum(P.minAreaHa,0)+' ha ('+res.droppedSmall+' polígono(s) descartado(s))');
  L.push('   conectividade ....... '+(P.connectivity||8)+' vizinhos');
  L.push('   simplificação ....... '+(mcfNum(P.simplifyTol,0)?P.simplifyTol+' m':'nenhuma'));
  L.push('   polígonos gerados ... '+(res.polys||[]).length);
  L.push('');
  if(res.sensitivity){
    L.push('8. ANÁLISE DE SENSIBILIDADE');
    L.push('   simulações ......... '+res.sensitivity.n+' · variação ±'+res.sensitivity.pct+'%');
    const inst=(res.polys||[]).filter(p=>p.unstable).length;
    L.push('   polígonos instáveis  '+inst+' de '+(res.polys||[]).length);
    (st.criteria||[]).forEach((c,i)=>{
      L.push('   sensibilidade a "'+c.name+'": '+mcfFmt(100*(res.sensitivity.critSens[i]||0),1)+'% de troca de classe por unidade de peso perturbado');
    });
    L.push('');
  }
  L.push('9. AVISOS E ERROS');
  const all=[...(val.err||[]).map(e=>'ERRO: '+e),...(val.warn||[]).map(w=>'aviso: '+w),
             ...(res.warnings||[]).map(w=>'aviso: '+w)];
  if(!all.length) L.push('   (nenhum)');
  all.forEach(a=>L.push('   · '+a));
  L.push('');
  L.push(''.padEnd(74,'='));
  L.push('Metadados suficientes para reproduzir a análise estão no JSON de configuração');
  L.push('(botão "Configuração .json") e ficam gravados dentro do arquivo .ccmgis.');
  return L.join('\n');
}

/* ---------- tabela de ranking em CSV ---------- */
function mcfRankingCSV(st,res){
  const head=MCF_FIELDS.map(f=>f.name);
  const rows=[head.join(';')];
  (res.polys||[]).forEach((P,i)=>{
    const p=mcfPolyProps(P,st,res,i);
    rows.push(head.map(h=>{
      const v=p[h];
      if(v==null) return '';
      return (typeof v==='number')?String(v).replace('.',','):('"'+String(v).replace(/"/g,'""')+'"');
    }).join(';'));
  });
  return '﻿'+rows.join('\r\n');
}
/* ---------- configuração metodológica ---------- */
function mcfConfigJSON(st,res){
  return JSON.stringify({
    app:'ALAGIS', tool:'Multicriteria Favorability Analysis', version:1,
    exportedAt:new Date().toISOString(),
    state:mcfSerializeState(st),
    result:res?{grid:{nc:res.grid.nc,nr:res.grid.nr,cs:res.grid.cs,xll:res.grid.xll,yll:res.grid.yll,
        crs:res.grid.crs,nodata:res.grid.nodata},
      classes:res.classes, breaks:res.breaks, ms:res.ms,
      nArea:res.nArea, nExcluded:res.nExcluded, nPolys:(res.polys||[]).length,
      ruleLog:res.ruleLog, warnings:res.warnings}:null
  },null,2);
}
function mcfSerializeState(st){
  const o=JSON.parse(JSON.stringify(st));
  return o;
}

function mcfNomeArquivo(s){
  return String(s||'criterio').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^0-9A-Za-z]+/g,'_').replace(/^_|_$/g,'').toLowerCase().slice(0,48) || 'criterio';
}

/* Publica cada critério padronizado como superfície do projeto. São as MESMAS
   grades que entram na média ponderada — nada é recalculado aqui. */
function mcfPublicaCriterios(st,res){
  if(!res||!res.standardized){ toast('Rode o cálculo antes'); return; }
  const G=res.grid, cls=[
    {min:-0.001,max:0.999,color:'#8d3b2f',label:'0'},{min:0.999,max:1.999,color:'#c9622f',label:'1'},
    {min:1.999,max:2.999,color:'#d8a13a',label:'2'},{min:2.999,max:3.999,color:'#bcc34a',label:'3'},
    {min:3.999,max:4.999,color:'#6fa14a',label:'4'},{min:4.999,max:5.001,color:'#1b5e20',label:'5'}
  ].map(c=>Object.assign({vis:true},c));
  let n=0;
  (res.standardized||[]).forEach((z,ci)=>{
    const c=(st.criteria||[])[ci];
    if(!z||!c) return;
    const nome='MCF '+String(ci+1).padStart(2,'0')+' · '+(c.name||'critério')+' (0–5)';
    const antigo=(S.rasters||[]).find(r=>r.name===nome);
    if(antigo){ const i=S.rasters.indexOf(antigo);
      if(antigo.overlay) try{ map.removeLayer(antigo.overlay); }catch(e){}
      S.rasters.splice(i,1); }
    const r={id:rid++, name:nome, quantity:'mcfIndex', unit:'',
      d:{nc:G.nc,nr:G.nr,cs:G.cs,csy:G.cs,xll:G.xll,yll:G.yll,z:z.slice(),native:true,resampled:1},
      src:{file:'multicriterio('+(c.name||'')+')',size:0,at:new Date().toISOString()},
      style:{mode:'classes',opacity:0.85,classes:cls.map(x=>Object.assign({},x))},
      visible:false, overlay:null, quantity:null, unit:null, groupId:null,
      _exactClipRings:null, _v3:{papel:'projeto',cor:'#8d5524',limId:''}};
    S.rasters.push(r);placeProductAbove(r,c.rasterId?mcfRaster(c.rasterId):mcfLayer(c.layerId)); try{ renderRaster(r); }catch(e){}
    n++;
  });
  try{ refreshUI(); }catch(e){}
  toast(n+' superfície(s) de critério publicadas (escala 0–5)');
  try{ cmdLog('Multicritério: '+n+' rasters de critério publicados na escala 0–5','ok'); }catch(e){}
}

/* ---------- pacote completo ---------- */
async function mcfExportPackage(st,res,val){
  if(typeof JSZip==='undefined'){ toast('JSZip indisponível'); return; }
  const zip=new JSZip(), G=res.grid, base='MCF_favorabilidade';
  const put=(nome,g,nd)=>{
    try{ zip.file(base+'/'+nome+'.tif', gridParaGeoTIFF(
      {nc:G.nc,nr:G.nr,cs:G.cs,csy:G.cs,xll:G.xll,yll:G.yll,z:g}, G.crs, nd));
      zip.file(base+'/'+nome+'.prj', prjText(G.crs));
    }catch(e){ console.warn('GeoTIFF '+nome,e); }
  };
  if(res.members.geo.length) put('01_potencial_geologico',res.geo,G.nodata);
  if(res.members.feas.length) put('02_viabilidade_implantacao',res.feas,G.nodata);
  put('03_favorabilidade_integrada',res.integrated,G.nodata);
  put('04_favorabilidade_classificada',res.classified,G.nodata);
  put('05_mascara_legal',res.legal,G.nodata);
  if(res.sensitivity) put('06_estabilidade_sensibilidade',res.sensitivity.stability,G.nodata);
  /* Um raster por critério, na escala padronizada 0–5, ANTES da ponderação.
     É o insumo de cada nota: sem ele não dá para auditar item a item nem
     refazer a soma ponderada por fora. */
  (res.standardized||[]).forEach(function(z,ci){
    const c=(st.criteria||[])[ci];
    if(!z||!c) return;
    put('10_criterio_'+String(ci+1).padStart(2,'0')+'_'+mcfNomeArquivo(c.name), z, G.nodata);
  });
  zip.file(base+'/ranking_poligonos.csv', mcfRankingCSV(st,res));
  zip.file(base+'/configuracao_metodologica.json', mcfConfigJSON(st,res));
  zip.file(base+'/relatorio_processamento.txt', mcfReport(st,res,val));
  const LP=(S.layers||[]).find(l=>l.id===res._layerId);
  if(LP){
    try{ zip.file(base+'/areas_prioritarias.geojson', JSON.stringify(layerToGeoJSON(LP))); }catch(e){}
    try{
      const feats=LP.features.filter(f=>f.geom).map(f=>({
        geom:(f.multi&&Array.isArray(f.geom[0][0]))?f.geom.map(r=>r.map(p=>reproj(LP.crs,G.crs,p[0],p[1])))
             :f.geom.map(p=>reproj(LP.crs,G.crs,p[0],p[1])),
        multi:f.multi, props:f.props}));
      const {shp,shx}=writeSHP('polygon',feats);
      const dbf=writeDBF(MCF_FIELDS,feats.map(f=>f.props));
      zip.file(base+'/areas_prioritarias.shp',shp); zip.file(base+'/areas_prioritarias.shx',shx);
      zip.file(base+'/areas_prioritarias.dbf',dbf); zip.file(base+'/areas_prioritarias.prj',prjText(G.crs));
      zip.file(base+'/areas_prioritarias.cpg',dbfCpgText());
    }catch(e){ console.warn('SHP',e); }
  }
  const blob=await zip.generateAsync({type:'blob'});
  await download(blob, base+'_'+new Date().toISOString().slice(0,10)+'.zip');
}
/* ===========================================================================
   INTERFACE — janela com abas, no padrão visual dos demais modais do CCMGIS
   ========================================================================= */
const MCF_CSS=`
.mcf-modal{width:min(1180px,100%);max-height:92vh}
.mcf-tabs{display:flex;gap:4px;padding:8px 14px 0;border-bottom:1px solid var(--line);flex-wrap:wrap}
.mcf-tabs button{background:none;border:1px solid transparent;border-bottom:none;color:var(--ink-dim);
  border-radius:8px 8px 0 0;padding:7px 11px;font-size:12px;cursor:pointer;white-space:nowrap}
.mcf-tabs button:hover{color:var(--ink)}
.mcf-tabs button.on{background:var(--panel2);border-color:var(--line);color:var(--amber);font-weight:600}
.mcf-body{padding:12px 14px;overflow-y:auto;flex:1;min-height:220px}
.mcf-body .tbtn{min-width:0;max-width:100%;height:auto;min-height:34px;white-space:normal;
  overflow-wrap:anywhere;line-height:1.18;text-align:center;justify-content:center}
.mcf-body .tbtn:disabled{opacity:.45;cursor:not-allowed}
.mcf-foot{display:flex;align-items:center;gap:10px;padding:9px 14px;border-top:1px solid var(--line);flex-wrap:wrap}
.mcf-foot .grow{flex:1;min-width:120px}
.mcf-bar{height:8px;background:var(--panel2);border:1px solid var(--line);border-radius:5px;overflow:hidden}
.mcf-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--amber-dim),var(--amber));transition:width .18s}
.mcf-stage{font-family:var(--mono);font-size:11px;color:var(--ink-dim);margin-top:3px;min-height:14px}
.mcf-card{border:1px solid var(--line);border-radius:9px;background:var(--panel2);padding:9px 10px;margin-bottom:8px}
.mcf-card>header{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap}
.mcf-card>header b{font-size:12.5px}
.mcf-card>header .sp{flex:1}
.mcf-chip{font-family:var(--mono);font-size:10px;border:1px solid var(--line);border-radius:20px;
  padding:2px 8px;color:var(--ink-dim);background:var(--panel)}
.mcf-chip.geo{color:#9ece6a;border-color:#9ece6a55}
.mcf-chip.feas{color:#7aa2f7;border-color:#7aa2f755}
.mcf-chip.legal{color:#e05252;border-color:#e0525255}
.mcf-grid{display:grid;gap:8px}
.mcf-g2{grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}
.mcf-g3{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.mcf-tbl{width:100%;border-collapse:collapse;font-family:var(--mono);font-size:11.5px}
.mcf-tbl th,.mcf-tbl td{border:1px solid var(--line);padding:4px 6px;text-align:right;white-space:nowrap}
.mcf-tbl th{background:var(--panel);color:var(--amber);position:sticky;top:0;z-index:2;cursor:pointer;user-select:none}
.mcf-tbl td.l,.mcf-tbl th.l{text-align:left}
.mcf-tbl tbody tr:hover{background:var(--hover2,#ffffff0d)}
.mcf-tbl tbody tr.sel{outline:1px solid var(--amber)}
.mcf-scroll{max-height:46vh;overflow:auto;border:1px solid var(--line);border-radius:8px}
.mcf-tbl input,.mcf-tbl select{padding:3px 5px;font-size:11.5px;border-radius:4px}
.mcf-inline{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.mcf-inline label{font-size:11px;color:var(--ink-dim);display:flex;align-items:center;gap:5px;margin:0}
.mcf-inline input[type=checkbox]{width:auto;accent-color:var(--amber)}
.mcf-warn{border-left:3px solid var(--amber);background:#f5a5241a;padding:6px 9px;border-radius:6px;
  font-size:11.5px;margin:5px 0;color:var(--ink)}
.mcf-err{border-left:3px solid var(--sel);background:#e052521a;padding:6px 9px;border-radius:6px;
  font-size:11.5px;margin:5px 0;color:var(--ink)}
.mcf-ok{border-left:3px solid var(--cyan);background:#37c0aa1a;padding:6px 9px;border-radius:6px;
  font-size:11.5px;margin:5px 0;color:var(--ink)}
.mcf-sw{width:26px;height:16px;border-radius:4px;border:1px solid #0006;display:inline-block;vertical-align:-3px}
.mcf-legend{display:flex;flex-wrap:wrap;gap:9px;font-size:11px;margin:6px 0}
.mcf-legend span{display:flex;align-items:center;gap:5px;color:var(--ink-dim)}
.mcf-x{cursor:pointer;color:var(--ink-dim);font-size:14px;padding:0 3px}
.mcf-x:hover{color:var(--sel)}
.mcf-prev{border:1px solid var(--line);border-radius:6px;background:var(--bg);image-rendering:pixelated;width:100%;height:auto}
.mcf-hatch{background-image:repeating-linear-gradient(45deg,#8d8d8d,#8d8d8d 3px,transparent 3px,transparent 7px)}
input[type=color]{width:100%;height:28px;padding:1px;background:var(--bg);border:1px solid var(--line);border-radius:6px}
`;
(function(){ const s=document.createElement('style'); s.id='mcf-style'; s.textContent=MCF_CSS;
  document.head.appendChild(s); })();

const MCF_TABS=[
  ['grade','1 · Grade'],['criterios','2 · Critérios'],['mascaras','3 · Máscaras legais'],
  ['pesos','4 · Pesos e cenários'],['calculo','5 · Cálculo e classes'],
  ['resultados','6 · Resultados e ranking'],['auditoria','7 · Auditoria e exportação']
];
let MCF_TAB='grade';

function mcfEnsureModal(){
  let bg=document.getElementById('mcfBg');
  if(bg) return bg;
  bg=document.createElement('div'); bg.className='modal-bg'; bg.id='mcfBg';
  bg.innerHTML=
    '<div class="modal mcf-modal">'+
      '<div class="modal-h"><b>◈ Análise multicritério de favorabilidade</b>'+
        '<span class="tag">Multicriteria Favorability Analysis</span>'+
        '<div style="flex:1"></div><span class="mcf-x" id="mcfClose">✕</span></div>'+
      '<div class="mcf-tabs" id="mcfTabs">'+
        MCF_TABS.map(t=>'<button data-tab="'+t[0]+'">'+t[1]+'</button>').join('')+'</div>'+
      '<div class="mcf-body" id="mcfBody"></div>'+
      '<div class="mcf-foot">'+
        '<div class="grow"><div class="mcf-bar"><i id="mcfBarFill"></i></div>'+
          '<div class="mcf-stage" id="mcfStage">pronto</div></div>'+
        '<button class="tbtn" id="mcfCancel" style="display:none;max-width:150px">✕ Cancelar</button>'+
        '<button class="tbtn" id="mcfRun" style="max-width:230px;border-color:var(--amber-dim);color:var(--amber)">▶ Calcular favorabilidade</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(bg);
  bg.querySelector('#mcfClose').onclick=()=>bg.classList.remove('on');
  bg.addEventListener('mousedown',e=>{ if(e.target===bg) bg.classList.remove('on'); });
  bg.querySelector('#mcfTabs').onclick=e=>{
    const b=e.target.closest('button[data-tab]'); if(!b) return;
    MCF_TAB=b.dataset.tab; mcfRender();
  };
  bg.querySelector('#mcfRun').onclick=()=>mcfExecuteAnalysis();
  bg.querySelector('#mcfCancel').onclick=()=>{ if(MCF.running){ MCF.running.cancel(); } };
  if(typeof modalDrag==='function'){ try{ modalDrag(bg.querySelector('.modal')); }catch(e){} }
  return bg;
}
function mcfOpen(tab){
  const bg=mcfEnsureModal();
  if(tab) MCF_TAB=tab;
  if(!MCF.state.grid.areaLayerId){
    const cand=(S.layers||[]).filter(l=>l.gtype==='polygon');
    if(cand.length===1) MCF.state.grid.areaLayerId=cand[0].id;
  }
  if(MCF.state.grid.crs!==S.workCRS && !MCF.state._crsTouched) MCF.state.grid.crs=S.workCRS;
  bg.classList.add('on'); mcfRender();
}
window.mcfOpen=mcfOpen;
function mcfClose(){ const bg=document.getElementById('mcfBg'); if(bg) bg.classList.remove('on'); }

function mcfProgress(pct,stage){
  const f=document.getElementById('mcfBarFill'), s=document.getElementById('mcfStage');
  if(f) f.style.width=Math.max(0,Math.min(100,pct*100)).toFixed(1)+'%';
  if(s) s.textContent=stage||'';
}
function mcfBusy(on){
  const r=document.getElementById('mcfRun'), c=document.getElementById('mcfCancel');
  if(r){ r.disabled=on; r.style.opacity=on?.5:1; }
  if(c) c.style.display=on?'':'none';
}
function mcfRender(){
  const body=document.getElementById('mcfBody'); if(!body) return;
  document.querySelectorAll('#mcfTabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===MCF_TAB));
  const fn={grade:mcfTabGrade,criterios:mcfTabCriterios,mascaras:mcfTabMascaras,
    pesos:mcfTabPesos,calculo:mcfTabCalculo,resultados:mcfTabResultados,auditoria:mcfTabAuditoria}[MCF_TAB];
  body.innerHTML=''; body.scrollTop=0;
  try{ fn(body); }catch(e){ body.innerHTML='<div class="mcf-err">Falha ao montar a aba: '+mcfEsc(e.message)+'</div>'; console.error(e); }
}

/* ---------- controles reutilizados pelas abas ---------- */
function mcfOptLayers(sel,types){
  const T=types||['polygon','line','point'];
  return '<option value="">— escolher camada —</option>'+
    (S.layers||[]).filter(l=>T.indexOf(l.gtype)>=0)
      .map(l=>'<option value="'+l.id+'"'+(String(l.id)===String(sel)?' selected':'')+'>'+
        mcfEsc(l.name)+' ('+({polygon:'polígono',line:'linha',point:'ponto'}[l.gtype])+', '+
        (l.features||[]).length+')</option>').join('');
}
function mcfOptRasters(sel){
  return '<option value="">— escolher raster —</option>'+
    (S.rasters||[]).map(r=>'<option value="'+r.id+'"'+(String(r.id)===String(sel)?' selected':'')+'>'+
      mcfEsc(r.name)+' ('+r.d.nc+'×'+r.d.nr+')</option>').join('');
}
function mcfOptFields(layerId,sel){
  const L=mcfLayer(layerId);
  const names=new Set();
  (L&&L.fields||[]).forEach(f=>names.add(typeof f==='string'?f:f.name));
  if(L&&!names.size)(L.features||[]).slice(0,200).forEach(f=>Object.keys(f.props||{}).forEach(k=>names.add(k)));
  return '<option value="">—</option>'+[...names].map(n=>
    '<option value="'+mcfEsc(n)+'"'+(n===sel?' selected':'')+'>'+mcfEsc(n)+'</option>').join('');
}
function mcfOptCRS(sel){
  const list=Object.keys(CRS_LABELS||{}).filter(k=>!mcfIsGeographic(k));
  if(list.indexOf(sel)<0&&sel) list.unshift(sel);
  return list.map(k=>'<option value="'+k+'"'+(k===sel?' selected':'')+'>'+k+' — '+
    mcfEsc(CRS_LABELS[k]||'')+'</option>').join('');
}
/* valores distintos de um campo — alimenta o de-para categórico */
function mcfDistinct(layerId,field,limit){
  const L=mcfLayer(layerId); if(!L||!field) return [];
  const s=new Set();
  for(const f of (L.features||[])){
    const v=(f.props||{})[field];
    if(v!=null&&String(v)!=='') s.add(String(v));
    if(s.size>=(limit||300)) break;
  }
  return [...s].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
}
/* ---------- ligação campo ↔ estado ---------- */
function mcfBind(root,sel,obj,key,kind,after){
  root.querySelectorAll(sel).forEach(el=>{
    const ev=(el.tagName==='SELECT'||el.type==='checkbox'||el.type==='color')?'change':'input';
    el.addEventListener(ev,()=>{
      let v=el.type==='checkbox'?el.checked:el.value;
      if(kind==='num') v=mcfNum(v,0);
      obj[key]=v;
      if(after) after(v,el);
    });
  });
}
function mcfHead(t,sub){
  return '<div style="margin:-2px 0 10px"><div style="font-size:13px;color:var(--ink-bright);font-weight:600">'+t+
    '</div><div class="hint" style="padding:0">'+sub+'</div></div>';
}

/* ======================= 1 · GRADE ======================= */
function mcfTabGrade(b){
  const st=MCF.state, g=st.grid;
  b.innerHTML=mcfHead('Grade comum de análise',
    'Todos os rasters produzidos terão exatamente a mesma extensão, CRS, célula, alinhamento e NoData.')+
   '<div class="mcf-card"><div class="mcf-grid mcf-g2">'+
     '<div><label class="field">Nome do estudo</label><input type="text" id="mcfName" value="'+mcfEsc(st.meta.name)+'"></div>'+
     '<div><label class="field">Substância / objetivo</label><input type="text" id="mcfSubs" value="'+mcfEsc(st.meta.substance)+'"></div>'+
   '</div></div>'+
   '<div class="mcf-card"><header><b>Extensão e resolução</b></header>'+
     '<div class="mcf-grid mcf-g2">'+
       '<div><label class="field">Polígono de extensão da análise</label>'+
         '<select id="mcfArea">'+mcfOptLayers(g.areaLayerId,['polygon'])+'</select></div>'+
       '<div><label class="field">CRS de trabalho (projetado)</label>'+
         '<select id="mcfCRS">'+mcfOptCRS(g.crs)+'</select></div>'+
       '<div><label class="field">Tamanho da célula (m)</label>'+
         '<input type="number" id="mcfCell" min="0.5" step="10" value="'+g.cell+'"></div>'+
       '<div><label class="field">Valor NoData</label>'+
         '<input type="number" id="mcfND" step="1" value="'+g.nodata+'"></div>'+
       '<div><label class="field">Alinhamento da grade</label><select id="mcfAlign">'+
         '<option value="grid"'+(g.align==='grid'?' selected':'')+'>Múltiplos do tamanho de célula (origem do CRS)</option>'+
         '<option value="ref"'+(g.align==='ref'?' selected':'')+'>Alinhar a um raster de referência</option>'+
         '<option value="none"'+(g.align==='none'?' selected':'')+'>Extensão bruta do polígono</option></select></div>'+
       '<div><label class="field">Raster de referência (opcional)</label>'+
         '<select id="mcfRef">'+mcfOptRasters(g.refRasterId)+'</select></div>'+
     '</div></div>'+
   '<div id="mcfGridInfo"></div>';

  mcfBind(b,'#mcfName',st.meta,'name');
  mcfBind(b,'#mcfSubs',st.meta,'substance');
  mcfBind(b,'#mcfArea',g,'areaLayerId','',()=>mcfGridInfo());
  mcfBind(b,'#mcfCRS',g,'crs','',()=>{st._crsTouched=true;mcfGridInfo();});
  mcfBind(b,'#mcfCell',g,'cell','num',()=>mcfGridInfo());
  mcfBind(b,'#mcfND',g,'nodata','num');
  mcfBind(b,'#mcfAlign',g,'align','',()=>mcfGridInfo());
  mcfBind(b,'#mcfRef',g,'refRasterId','',()=>mcfGridInfo());
  mcfGridInfo();
}
function mcfGridInfo(){
  const box=document.getElementById('mcfGridInfo'); if(!box) return;
  const st=MCF.state, r=mcfComputeGrid(st,null);
  if(!r.ok){ box.innerHTML='<div class="mcf-err">'+mcfEsc(r.msg)+'</div>'; return; }
  const G=r.grid, cellHa=G.cs*G.cs/10000;
  let h='<div class="mcf-card"><header><b>Grade resultante</b><span class="sp"></span>'+
    '<span class="mcf-chip">'+G.nc+' × '+G.nr+'</span></header>'+
    '<table class="mcf-tbl"><tbody>'+
    '<tr><td class="l">Colunas × linhas</td><td>'+G.nc+' × '+G.nr+'</td></tr>'+
    '<tr><td class="l">Células</td><td>'+(r.cells).toLocaleString('pt-BR')+'</td></tr>'+
    '<tr><td class="l">Área da célula</td><td>'+mcfFmt(cellHa,4)+' ha</td></tr>'+
    '<tr><td class="l">Área total do retângulo</td><td>'+mcfFmt(r.areaKm2,3)+' km²</td></tr>'+
    '<tr><td class="l">Memória estimada</td><td>'+mcfFmt(r.memMB,1)+' MB</td></tr>'+
    '<tr><td class="l">Origem (xll, yll)</td><td>'+mcfFmt(G.xll,2)+' ; '+mcfFmt(G.yll,2)+'</td></tr>'+
    '<tr><td class="l">NoData</td><td>'+G.nodata+'</td></tr>'+
    '</tbody></table></div>';
  if(String(G.crs)!==String(S.workCRS))
    h+='<div class="mcf-warn">O cálculo será feito em <b>'+G.crs+'</b> e os produtos serão reprojetados para o CRS do projeto (<b>'+S.workCRS+'</b>) ao entrar no mapa — classes e máscara por vizinho mais próximo, notas contínuas por bilinear.</div>';
  r.warnings.forEach(w=>h+='<div class="mcf-warn">'+mcfEsc(w)+'</div>');
  box.innerHTML=h;
}

/* ======================= 2 · CRITÉRIOS ======================= */
function mcfNewCriterion(){
  return {id:mcfId('crit'),name:'Novo critério',group:'Geological Prospectivity',
    layerId:'',rasterId:'',inputType:'polygon',method:'reclass',direction:'higher',
    select:{field:'',op:'eq',value:''},classField:'',overlap:'center',resample:'nearest',
    rules:[{min:'',max:'',score:5,incLow:true,incHigh:false}],
    lookup:[],lookupFallback:'',lookupOutside:'',lin:{min:0,max:1000},piecewise:[{x:0,y:5},{x:1000,y:0}],
    fuzzy:{type:'linear',a:0,b:1000,invert:false},boolInside:5,boolOutside:0,
    dist:{from:'boundary',insideZero:true,max:0,unit:'m'},
    weight:10,mandatory:false,severe:false,severeAtOrBelow:1,locked:false,
    missing:'renorm',missingScore:0,
    confidence:'high',notes:'',source:'',sourceDate:''};
}
function mcfDistRulesPadrao(){
  return [{min:0,max:2000,score:5},{min:2000,max:5000,score:4},{min:5000,max:10000,score:3},
          {min:10000,max:20000,score:2},{min:20000,max:'',score:1}];
}
function mcfTabCriterios(b){
  const st=MCF.state;
  b.innerHTML=mcfHead('Critérios',
    'Cada critério é padronizado para a escala 0–5 antes de qualquer soma. Rasters de unidades diferentes nunca são somados diretamente.')+
    '<div class="mcf-inline" style="margin-bottom:8px">'+
      '<button class="tbtn" id="mcfAddCrit" style="max-width:190px">＋ Adicionar critério</button>'+
      '<button class="tbtn" id="mcfSeedCrit" style="max-width:230px">⚙ Carregar conjunto sugerido</button>'+
      '<span class="hint">escala 0 = Unsuitable … 5 = Highly Favorable</span></div>'+
    '<div id="mcfCritList"></div>';
  b.querySelector('#mcfAddCrit').onclick=()=>{ st.criteria.push(mcfNewCriterion()); mcfRenderCrits(); };
  b.querySelector('#mcfSeedCrit').onclick=()=>{ mcfSeedCriteria(); mcfRenderCrits(); };
  mcfRenderCrits();
}
function mcfRenderCrits(){
  const box=document.getElementById('mcfCritList'); if(!box) return;
  const st=MCF.state, W=mcfActiveWeights(st);
  if(!st.criteria.length){ box.innerHTML='<div class="mcf-warn">Nenhum critério cadastrado.</div>'; return; }
  box.innerHTML=st.criteria.map((c,i)=>mcfCritCard(c,i,W)).join('');
  st.criteria.forEach((c,i)=>mcfWireCrit(box,c,i));
}
function mcfCritCard(c,i,W){
  const idx=MCF_INDEX_OF[c.group]||'feas';
  const isRaster=/^raster/.test(c.inputType);
  const chip=idx==='geo'?'<span class="mcf-chip geo">POTENCIAL GEOLÓGICO</span>'
           :idx==='feas'?'<span class="mcf-chip feas">VIABILIDADE</span>'
           :'<span class="mcf-chip">fora da média</span>';
  const p='mcfC'+i;
  return '<div class="mcf-card" data-ci="'+i+'">'+
   '<header><b>'+(i+1)+'.</b>'+
     '<input type="text" id="'+p+'name" value="'+mcfEsc(c.name)+'" style="max-width:280px">'+
     chip+'<span class="mcf-chip">peso '+mcfFmt(W[c.id],1)+'%</span>'+
     '<span class="sp"></span>'+
     '<span class="mcf-x" id="'+p+'up" title="Subir">▲</span>'+
     '<span class="mcf-x" id="'+p+'dn" title="Descer">▼</span>'+
     '<span class="mcf-x" id="'+p+'cp" title="Duplicar">⧉</span>'+
     '<span class="mcf-x" id="'+p+'rm" title="Remover">✕</span></header>'+
   '<div class="mcf-grid mcf-g3">'+
     '<div><label class="field">Grupo</label><select id="'+p+'grp">'+
       MCF_GROUPS.map(g=>'<option value="'+g+'"'+(c.group===g?' selected':'')+'>'+g+' · '+MCF_GROUP_PT[g]+'</option>').join('')+
       '</select></div>'+
     '<div><label class="field">Tipo de entrada</label><select id="'+p+'it">'+
       MCF_INPUT_TYPES.map(t=>'<option value="'+t[0]+'"'+(c.inputType===t[0]?' selected':'')+'>'+t[1]+'</option>').join('')+
       '</select></div>'+
     '<div><label class="field">'+(isRaster?'Raster de entrada':'Camada de entrada')+'</label>'+
       (isRaster?'<select id="'+p+'ras">'+mcfOptRasters(c.rasterId)+'</select>'
                :'<select id="'+p+'lay">'+mcfOptLayers(c.layerId)+'</select>')+'</div>'+
     '<div><label class="field">Método de processamento</label><select id="'+p+'mt">'+
       MCF_METHODS.map(m=>'<option value="'+m[0]+'"'+(c.method===m[0]?' selected':'')+'>'+m[1]+'</option>').join('')+
       '</select></div>'+
     '<div><label class="field">Direção da favorabilidade</label><select id="'+p+'dir">'+
       '<option value="higher"'+(c.direction==='higher'?' selected':'')+'>Maior valor = mais favorável</option>'+
       '<option value="lower"'+(c.direction==='lower'?' selected':'')+'>Menor valor = mais favorável</option></select></div>'+
     '<div><label class="field">Peso (%)</label><input type="number" id="'+p+'w" min="0" step="0.5" value="'+mcfNum(W[c.id],0)+'"></div>'+
   '</div>'+
   (isRaster?'':'<div class="mcf-grid mcf-g3">'+
     '<div><label class="field">Selecionar feições · campo</label><select id="'+p+'sf">'+mcfOptFields(c.layerId,c.select.field)+'</select></div>'+
     '<div><label class="field">Operador</label><select id="'+p+'so">'+
       [['eq','='],['neq','≠'],['contains','contém'],['in','está na lista'],['gt','>'],['lt','<']]
         .map(o=>'<option value="'+o[0]+'"'+(c.select.op===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+
       '</select></div>'+
     '<div><label class="field">Valor</label><input type="text" id="'+p+'sv" value="'+mcfEsc(c.select.value)+'" placeholder="todas as feições"></div>'+
   '</div>')+
   (c.method==='lookup'&&!isRaster?'<div class="mcf-grid mcf-g3"><div><label class="field">Campo da classe</label>'+
     '<select id="'+p+'cf">'+mcfOptFields(c.layerId,c.classField)+'</select></div></div>':'')+
   (c.method==='euclid'?'<div class="mcf-grid mcf-g3">'+
     '<div><label class="field">Medir a partir de</label><select id="'+p+'df">'+
       '<option value="boundary"'+(c.dist.from==='boundary'?' selected':'')+'>Limite da geometria</option>'+
       '<option value="centroid"'+(c.dist.from==='centroid'?' selected':'')+'>Centroide</option></select></div>'+
     '<div><label class="field">Distância máxima (0 = sem limite)</label><input type="number" id="'+p+'dm" min="0" step="100" value="'+mcfNum(c.dist.max,0)+'"></div>'+
     '<div><label class="field">Unidade</label><select id="'+p+'du">'+
       '<option value="m"'+(c.dist.unit==='m'?' selected':'')+'>metros</option>'+
       '<option value="km"'+(c.dist.unit==='km'?' selected':'')+'>quilômetros</option></select></div>'+
     '<div class="mcf-inline" style="align-self:end"><label><input type="checkbox" id="'+p+'dz"'+(c.dist.insideZero!==false?' checked':'')+'> Interior do polígono = 0</label></div>'+
   '</div>':'')+
   (!isRaster&&c.method!=='euclid'&&c.method!=='lookup'?'<div class="mcf-inline" style="margin-top:6px">'+
     '<label><input type="checkbox" id="'+p+'ov"'+(c.overlap==='any'?' checked':'')+'> Rasterizar por sobreposição parcial (qualquer toque na célula)</label></div>':'')+
   (isRaster?'<div class="mcf-grid mcf-g3"><div><label class="field">Reamostragem</label><select id="'+p+'rs">'+
     '<option value="nearest"'+(c.resample!=='bilinear'?' selected':'')+'>Vizinho mais próximo (categórico)</option>'+
     '<option value="bilinear"'+(c.resample==='bilinear'?' selected':'')+'>Bilinear (contínuo)</option></select></div></div>':'')+
   '<div class="mcf-inline" style="margin-top:8px">'+
     '<button class="tbtn" id="'+p+'ed" style="max-width:230px">✎ Regras de padronização…</button>'+
     '<span class="hint" style="flex:1">'+mcfEsc(mcfRuleText(c).slice(0,140))+'</span></div>'+
   '<div class="mcf-grid mcf-g3" style="margin-top:6px">'+
     '<div><label class="field">Confiança do dado</label><select id="'+p+'cf2">'+
       MCF_CONF.map(k=>'<option value="'+k[0]+'"'+(c.confidence===k[0]?' selected':'')+'>'+k[1]+'</option>').join('')+'</select></div>'+
     '<div><label class="field">Fonte</label><input type="text" id="'+p+'src" value="'+mcfEsc(c.source)+'"></div>'+
     '<div><label class="field">Data da fonte</label><input type="text" id="'+p+'sd" value="'+mcfEsc(c.sourceDate)+'" placeholder="ex.: 2024-11"></div>'+
   '</div>'+
   '<div><label class="field">Observações</label><input type="text" id="'+p+'nt" value="'+mcfEsc(c.notes)+'"></div>'+
   '<div class="mcf-inline" style="margin-top:7px">'+
     '<label><input type="checkbox" id="'+p+'mn"'+(c.mandatory?' checked':'')+'> Obrigatório (sem dado ⇒ NoData)</label>'+
     '<label><input type="checkbox" id="'+p+'lk"'+(c.locked?' checked':'')+'> Peso bloqueado</label>'+
     '<label><input type="checkbox" id="'+p+'sv2"'+(c.severe?' checked':'')+'> Restrição ambiental severa quando a nota ≤ </label>'+
     '<input type="number" id="'+p+'sa" step="0.5" min="0" max="5" value="'+mcfNum(c.severeAtOrBelow,1)+'" style="width:70px">'+
   '</div></div>';
}
function mcfWireCrit(box,c,i){
  const p='#mcfC'+i, q=s=>box.querySelector(p+s);
  const re=()=>mcfRenderCrits();
  const st=MCF.state;
  mcfBind(box,p+'name',c,'name',null,()=>{});
  q('grp').onchange=e=>{ c.group=e.target.value; re(); };
  q('it').onchange=e=>{
    c.inputType=e.target.value;
    if(/^raster/.test(c.inputType)){ c.layerId=''; c.resample=c.inputType==='rasterCat'?'nearest':'bilinear';
      if(c.method==='euclid') c.method='reclass'; }
    else { c.rasterId=''; }
    if(c.inputType==='distance'&&c.method!=='euclid'){ c.method='euclid'; if(!c.rules.length||!c.rules[0].max) c.rules=mcfDistRulesPadrao(); }
    if(c.inputType==='binary') c.method='bool';
    re();
  };
  if(q('lay')) q('lay').onchange=e=>{ c.layerId=e.target.value; c.select.field=''; c.classField=''; re(); };
  if(q('ras')) q('ras').onchange=e=>{ c.rasterId=e.target.value; };
  q('mt').onchange=e=>{
    c.method=e.target.value;
    if(c.method==='euclid'&&(!c.rules.length||c.rules.length===1)) c.rules=mcfDistRulesPadrao();
    re();
  };
  q('dir').onchange=e=>{ c.direction=e.target.value; };
  q('w').oninput=e=>{
    const sc=(st.scenarios||[]).find(s=>s.id===st.scenarioId);
    const v=mcfNum(e.target.value,0);
    c.weight=v; if(sc){ sc.weights=sc.weights||{}; sc.weights[c.id]=v; }
  };
  if(q('sf')) q('sf').onchange=e=>{ c.select.field=e.target.value; };
  if(q('so')) q('so').onchange=e=>{ c.select.op=e.target.value; };
  if(q('sv')) q('sv').oninput=e=>{ c.select.value=e.target.value; };
  if(q('cf')) q('cf').onchange=e=>{ c.classField=e.target.value;
    if(!(c.lookup||[]).length) c.lookup=mcfDistinct(c.layerId,c.classField,60).map(v=>({value:v,score:3}));
    re(); };
  if(q('df')) q('df').onchange=e=>{ c.dist.from=e.target.value; };
  if(q('dm')) q('dm').oninput=e=>{ c.dist.max=mcfNum(e.target.value,0); };
  if(q('du')) q('du').onchange=e=>{ c.dist.unit=e.target.value; };
  if(q('dz')) q('dz').onchange=e=>{ c.dist.insideZero=e.target.checked; };
  if(q('ov')) q('ov').onchange=e=>{ c.overlap=e.target.checked?'any':'center'; };
  if(q('rs')) q('rs').onchange=e=>{ c.resample=e.target.value; };
  q('cf2').onchange=e=>{ c.confidence=e.target.value; };
  q('src').oninput=e=>{ c.source=e.target.value; };
  q('sd').oninput=e=>{ c.sourceDate=e.target.value; };
  q('nt').oninput=e=>{ c.notes=e.target.value; };
  q('mn').onchange=e=>{ c.mandatory=e.target.checked; };
  q('lk').onchange=e=>{ c.locked=e.target.checked; };
  q('sv2').onchange=e=>{ c.severe=e.target.checked; };
  q('sa').oninput=e=>{ c.severeAtOrBelow=mcfNum(e.target.value,1); };
  q('ed').onclick=()=>mcfOpenRuleEditor(c);
  q('rm').onclick=()=>{ if(confirm('Remover o critério "'+c.name+'"?')){ st.criteria.splice(i,1); re(); } };
  q('cp').onclick=()=>{ const d=JSON.parse(JSON.stringify(c)); d.id=mcfId('crit'); d.name=c.name+' (cópia)';
    st.criteria.splice(i+1,0,d); re(); };
  q('up').onclick=()=>{ if(i>0){ const t=st.criteria[i-1]; st.criteria[i-1]=st.criteria[i]; st.criteria[i]=t; re(); } };
  q('dn').onclick=()=>{ if(i<st.criteria.length-1){ const t=st.criteria[i+1]; st.criteria[i+1]=st.criteria[i]; st.criteria[i]=t; re(); } };
}

/* Conjunto sugerido pela metodologia — usa as camadas já abertas quando o nome
   for reconhecível, mas nunca substitui uma configuração existente. */
const MCF_SEED=[
  ['Geological Units · Unidades geológicas','Geological Prospectivity',20,['geolog','litolog','formação','formacao','unidade']],
  ['Soils and Regolith · Solos e regolito','Geological Prospectivity',10,['solo','pedolog','regolito']],
  ['Known Kaolin Occurrences · Ocorrências','Geological Prospectivity',10,['ocorrên','ocorren','caulim','depósito','deposito','mina']],
  ['Mineral-Rights Availability · Direitos minerários','Mineral Rights',10,['anm','sigmine','process','requerim','concess']],
  ['Roads and Local Access · Acessos','Infrastructure and Logistics',10,['rodovia','estrada','acesso','via']],
  ['Port and Waterway Logistics · Porto e hidrovia','Infrastructure and Logistics',8,['porto','hidrovia','ferrovia','terminal']],
  ['Terrain and Slope · Terreno e declividade','Terrain and Hydrology',7,['declivid','slope','mdt','mde','terreno']],
  ['Hydrology and Flooding · Hidrologia','Terrain and Hydrology',8,['drenagem','hidrograf','rio','inunda','alaga']],
  ['Environmental Constraints · Restrições ambientais','Environmental Constraints',10,['app','uc','unidade de conserv','parque','reserva','ambient']],
  ['Territorial and Social Constraints · Restrições territoriais','Territorial and Social Constraints',7,['indígena','indigena','quilomb','assentamento','urban','comunidade']]
];
function mcfSeedCriteria(){
  const st=MCF.state;
  if(st.criteria.length && !confirm('Isto acrescenta os dez critérios sugeridos pela metodologia. Continuar?')) return;
  const sc=(st.scenarios||[]).find(s=>s.id===st.scenarioId); if(sc) sc.weights=sc.weights||{};
  MCF_SEED.forEach(([nome,grupo,peso,kw])=>{
    const c=mcfNewCriterion();
    c.name=nome; c.group=grupo; c.weight=peso;
    const L=(S.layers||[]).find(l=>kw.some(k=>String(l.name).toLowerCase().includes(k)));
    if(L){
      c.layerId=L.id; c.inputType=L.gtype;
      if(L.gtype!=='polygon'){ c.inputType='distance'; c.method='euclid'; c.rules=mcfDistRulesPadrao(); }
    }else{
      const R=(S.rasters||[]).find(r=>kw.some(k=>String(r.name).toLowerCase().includes(k)));
      if(R){ c.rasterId=R.id; c.inputType='rasterCont'; c.resample='bilinear';
             c.method='linDec'; c.lin={min:0,max:30}; }
    }
    if(/Infrastructure|Logistics/.test(grupo)&&c.method!=='euclid'){ c.inputType='distance'; c.method='euclid'; c.rules=mcfDistRulesPadrao(); }
    st.criteria.push(c);
    if(sc) sc.weights[c.id]=peso;
  });
  toast('Dez critérios sugeridos acrescentados — confira camadas, regras e pesos.');
}
/* ======================= 3 · MÁSCARAS LEGAIS ======================= */
const MCF_MASK_SEED=[
  ['Indigenous Lands · Terras indígenas',['indígena','indigena','funai','terra ind'],'Constituição Federal art. 231 — vedada a lavra sem lei específica'],
  ['Integral Protection Conservation Units · UC de proteção integral',['parque','reserva biol','estação ecol','estacao ecol','proteção integral','protecao integral'],'Lei 9.985/2000 — proteção integral não admite lavra'],
  ['ANM Blocked Areas · Áreas bloqueadas na ANM',['bloqueio','bloqueada','anm bloq'],'Bloqueio administrativo da ANM'],
  ['Confirmed Legal Restrictions · Restrições legais confirmadas',['restrição','restricao','embargo','ibama'],'Restrição legal confirmada em consulta oficial'],
  ['Third-Party Mineral Rights · Direitos minerários de terceiros',['anm','sigmine','process','concess','requerim'],'Área onerada por direito minerário de terceiro']
];
function mcfNewMask(nome,motivo){
  return {id:mcfId('mask'),name:nome||'Nova máscara',layerId:'',rasterId:'',
    select:{field:'',op:'eq',value:''},overlap:'center',buffer:0,
    insideValue:0,outsideValue:1,invert:false,reason:motivo||'',enabled:true};
}
function mcfTabMascaras(b){
  const st=MCF.state;
  b.innerHTML=mcfHead('Máscaras de exclusão legal',
    'FINAL_LEGAL_MASK = M1 × M2 × … × Mn. Uma célula com máscara igual a zero nunca recebe classificação de favorabilidade — sai como <b>Excluded</b>, e não como nota zero.')+
    '<div class="mcf-inline" style="margin-bottom:8px">'+
      '<button class="tbtn" id="mcfAddMask" style="max-width:190px">＋ Adicionar máscara</button>'+
      '<button class="tbtn" id="mcfSeedMask" style="max-width:250px">⚙ Máscaras típicas do Brasil</button></div>'+
    '<div id="mcfMaskList"></div>';
  b.querySelector('#mcfAddMask').onclick=()=>{ st.masks.push(mcfNewMask()); mcfRenderMasks(); };
  b.querySelector('#mcfSeedMask').onclick=()=>{
    MCF_MASK_SEED.forEach(([nome,kw,motivo])=>{
      if(st.masks.some(m=>m.name===nome)) return;
      const m=mcfNewMask(nome,motivo);
      const L=(S.layers||[]).find(l=>kw.some(k=>String(l.name).toLowerCase().includes(k)));
      if(L) m.layerId=L.id; else m.enabled=false;
      st.masks.push(m);
    });
    toast('Máscaras típicas acrescentadas — as sem camada correspondente ficam desativadas.');
    mcfRenderMasks();
  };
  mcfRenderMasks();
}
function mcfRenderMasks(){
  const box=document.getElementById('mcfMaskList'); if(!box) return;
  const st=MCF.state;
  if(!st.masks.length){ box.innerHTML='<div class="mcf-warn">Nenhuma máscara legal. Sem máscara, nenhuma célula é excluída por via jurídica.</div>'; return; }
  box.innerHTML=st.masks.map((m,i)=>{
    const p='mcfM'+i, isR=!!m.rasterId;
    return '<div class="mcf-card">'+
     '<header><input type="checkbox" id="'+p+'on"'+(m.enabled!==false?' checked':'')+' style="width:auto;accent-color:var(--amber)">'+
       '<input type="text" id="'+p+'nm" value="'+mcfEsc(m.name)+'" style="max-width:300px">'+
       '<span class="mcf-chip legal">EXCLUSÃO</span><span class="sp"></span>'+
       '<span class="mcf-x" id="'+p+'rm" title="Remover">✕</span></header>'+
     '<div class="mcf-grid mcf-g3">'+
       '<div><label class="field">Camada vetorial</label><select id="'+p+'lay">'+mcfOptLayers(m.layerId)+'</select></div>'+
       '<div><label class="field">…ou raster</label><select id="'+p+'ras">'+mcfOptRasters(m.rasterId)+'</select></div>'+
       '<div><label class="field">Buffer (m)</label><input type="number" id="'+p+'bf" min="0" step="50" value="'+mcfNum(m.buffer,0)+'"></div>'+
     '</div>'+
     (isR?'':'<div class="mcf-grid mcf-g3">'+
       '<div><label class="field">Selecionar feições · campo</label><select id="'+p+'sf">'+mcfOptFields(m.layerId,m.select.field)+'</select></div>'+
       '<div><label class="field">Operador</label><select id="'+p+'so">'+
         [['eq','='],['neq','≠'],['contains','contém'],['in','está na lista']]
           .map(o=>'<option value="'+o[0]+'"'+(m.select.op===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select></div>'+
       '<div><label class="field">Valor</label><input type="text" id="'+p+'sv" value="'+mcfEsc(m.select.value)+'" placeholder="todas as feições"></div>'+
     '</div>')+
     '<div class="mcf-grid mcf-g3">'+
       '<div><label class="field">Sobreposição</label><select id="'+p+'ov">'+
         '<option value="center"'+(m.overlap!=='any'?' selected':'')+'>Total — centro da célula dentro</option>'+
         '<option value="any"'+(m.overlap==='any'?' selected':'')+'>Parcial — qualquer toque na célula</option></select></div>'+
       '<div><label class="field">Valor interior</label><input type="number" id="'+p+'vi" step="1" value="'+mcfNum(m.insideValue,0)+'"></div>'+
       '<div><label class="field">Valor exterior</label><input type="number" id="'+p+'vo" step="1" value="'+mcfNum(m.outsideValue,1)+'"></div>'+
     '</div>'+
     '<div class="mcf-inline" style="margin-top:6px"><label><input type="checkbox" id="'+p+'iv"'+(m.invert?' checked':'')+'> Inverter máscara (excluir o que está FORA)</label></div>'+
     '<div><label class="field">Fundamento / motivo da exclusão</label><input type="text" id="'+p+'rs" value="'+mcfEsc(m.reason)+'" placeholder="dispositivo legal, processo, decisão…"></div>'+
     '</div>';
  }).join('');
  st.masks.forEach((m,i)=>{
    const q=s=>box.querySelector('#mcfM'+i+s);
    q('on').onchange=e=>{ m.enabled=e.target.checked; };
    q('nm').oninput=e=>{ m.name=e.target.value; };
    q('lay').onchange=e=>{ m.layerId=e.target.value; if(m.layerId)m.rasterId=''; m.select.field=''; mcfRenderMasks(); };
    q('ras').onchange=e=>{ m.rasterId=e.target.value; if(m.rasterId)m.layerId=''; mcfRenderMasks(); };
    q('bf').oninput=e=>{ m.buffer=mcfNum(e.target.value,0); };
    if(q('sf')) q('sf').onchange=e=>{ m.select.field=e.target.value; };
    if(q('so')) q('so').onchange=e=>{ m.select.op=e.target.value; };
    if(q('sv')) q('sv').oninput=e=>{ m.select.value=e.target.value; };
    q('ov').onchange=e=>{ m.overlap=e.target.value; };
    q('vi').oninput=e=>{ m.insideValue=mcfNum(e.target.value,0); };
    q('vo').oninput=e=>{ m.outsideValue=mcfNum(e.target.value,1); };
    q('iv').onchange=e=>{ m.invert=e.target.checked; };
    q('rs').oninput=e=>{ m.reason=e.target.value; };
    q('rm').onclick=()=>{ if(confirm('Remover a máscara "'+m.name+'"?')){ st.masks.splice(i,1); mcfRenderMasks(); } };
  });
}

/* ======================= 4 · PESOS E CENÁRIOS ======================= */
const MCF_SCEN_PRESETS={
  'Geology-Focused · Foco geológico':{'Geological Prospectivity':1.8,'Mineral Rights':1,'Infrastructure and Logistics':.6,
    'Environmental Constraints':1,'Territorial and Social Constraints':.8,'Terrain and Hydrology':.7},
  'Logistics-Focused · Foco logístico':{'Geological Prospectivity':.8,'Mineral Rights':1,'Infrastructure and Logistics':1.9,
    'Environmental Constraints':.9,'Territorial and Social Constraints':.8,'Terrain and Hydrology':1.1},
  'Environmental-Conservative · Ambientalmente conservador':{'Geological Prospectivity':.8,'Mineral Rights':1,
    'Infrastructure and Logistics':.8,'Environmental Constraints':1.9,'Territorial and Social Constraints':1.6,'Terrain and Hydrology':1.2}
};
function mcfTabPesos(b){
  const st=MCF.state, W=mcfActiveWeights(st);
  const total=Object.values(W).reduce((s,v)=>s+v,0);
  b.innerHTML=mcfHead('Pesos e cenários','O total obrigatório é 100%. Critérios bloqueados não são alterados pela normalização.')+
   '<div class="mcf-card"><header><b>Cenário</b><span class="sp"></span>'+
     '<span class="mcf-chip'+(Math.abs(total-100)<0.01?'':' legal')+'">total '+mcfFmt(total,2)+'%</span></header>'+
     '<div class="mcf-grid mcf-g3">'+
       '<div><label class="field">Cenário ativo</label><select id="mcfScen">'+
         st.scenarios.map(s=>'<option value="'+s.id+'"'+(s.id===st.scenarioId?' selected':'')+'>'+mcfEsc(s.name)+'</option>').join('')+
         '</select></div>'+
       '<div><label class="field">&nbsp;</label><button class="tbtn" id="mcfScenDup">⧉ Duplicar cenário</button></div>'+
       '<div><label class="field">&nbsp;</label><button class="tbtn" id="mcfScenDel">✕ Remover cenário</button></div>'+
     '</div>'+
     '<div class="mcf-inline" style="margin-top:8px">'+
       '<button class="tbtn" id="mcfNorm" style="max-width:200px">Σ Normalizar pesos</button>'+
       Object.keys(MCF_SCEN_PRESETS).map((k,i)=>'<button class="tbtn" data-preset="'+i+'" style="max-width:260px">'+mcfEsc(k)+'</button>').join('')+
     '</div></div>'+
   (Math.abs(total-100)>0.01?'<div class="mcf-warn">A soma dos pesos é '+mcfFmt(total,2)+'% — o esperado é 100%. A média ponderada divide pela soma real, mas a comparação entre cenários fica prejudicada.</div>':'')+
   '<div class="mcf-scroll"><table class="mcf-tbl"><thead><tr>'+
     '<th class="l">Critério</th><th class="l">Grupo</th><th>Índice</th><th>Peso %</th><th>Fração</th><th>Bloq.</th></tr></thead><tbody id="mcfWBody"></tbody>'+
     '<tfoot><tr><th class="l" colspan="3">Total</th><th id="mcfWTot">'+mcfFmt(total,2)+'</th><th>100%</th><th></th></tr></tfoot></table></div>'+
   '<div class="mcf-card" style="margin-top:10px"><header><b>Comparar cenários</b></header>'+
     '<div id="mcfScenCmp"></div></div>';

  const tb=b.querySelector('#mcfWBody');
  tb.innerHTML=st.criteria.map((c,i)=>{
    const w=mcfNum(W[c.id],0);
    return '<tr><td class="l">'+mcfEsc(c.name)+'</td><td class="l">'+mcfEsc(MCF_GROUP_PT[c.group]||c.group)+'</td>'+
      '<td>'+({geo:'GEO',feas:'VIAB',none:'—'}[MCF_INDEX_OF[c.group]||'feas'])+'</td>'+
      '<td><input type="number" min="0" step="0.5" value="'+w+'" data-wi="'+i+'" style="width:80px;text-align:right"></td>'+
      '<td>'+(total>0?mcfFmt(100*w/total,1):'—')+'%</td>'+
      '<td><input type="checkbox" data-lk="'+i+'"'+(c.locked?' checked':'')+' style="width:auto;accent-color:var(--amber)"></td></tr>';
  }).join('');
  tb.querySelectorAll('input[data-wi]').forEach(el=>el.oninput=()=>{
    const c=st.criteria[+el.dataset.wi], sc=st.scenarios.find(s=>s.id===st.scenarioId);
    const v=mcfNum(el.value,0); c.weight=v; if(sc){ sc.weights=sc.weights||{}; sc.weights[c.id]=v; }
    const t=Object.values(mcfActiveWeights(st)).reduce((s,x)=>s+x,0);
    const e=document.getElementById('mcfWTot'); if(e) e.textContent=mcfFmt(t,2);
  });
  tb.querySelectorAll('input[data-lk]').forEach(el=>el.onchange=()=>{ st.criteria[+el.dataset.lk].locked=el.checked; });
  b.querySelector('#mcfScen').onchange=e=>{ st.scenarioId=e.target.value; mcfRender(); };
  b.querySelector('#mcfNorm').onclick=()=>{ if(mcfNormalizeWeights(st)){ toast('Pesos normalizados para 100%'); mcfRender(); }
    else toast('Não foi possível normalizar (soma livre igual a zero)'); };
  b.querySelector('#mcfScenDup').onclick=()=>{
    const cur=st.scenarios.find(s=>s.id===st.scenarioId);
    const nome=prompt('Nome do novo cenário:',(cur?cur.name:'Cenário')+' (cópia)'); if(!nome) return;
    const id=mcfId('scen');
    st.scenarios.push({id,name:nome,weights:Object.assign({},mcfActiveWeights(st))});
    st.scenarioId=id; mcfRender();
  };
  b.querySelector('#mcfScenDel').onclick=()=>{
    if(st.scenarios.length<2){ toast('É preciso manter ao menos um cenário'); return; }
    st.scenarios=st.scenarios.filter(s=>s.id!==st.scenarioId);
    st.scenarioId=st.scenarios[0].id; mcfRender();
  };
  b.querySelectorAll('button[data-preset]').forEach(btn=>btn.onclick=()=>{
    const key=Object.keys(MCF_SCEN_PRESETS)[+btn.dataset.preset], mult=MCF_SCEN_PRESETS[key];
    const id=mcfId('scen'), w={};
    st.criteria.forEach(c=>{ w[c.id]=mcfNum(c.weight,0)*(mult[c.group]||1); });
    const t=Object.values(w).reduce((s,v)=>s+v,0);
    if(t>0) Object.keys(w).forEach(k=>w[k]=+(w[k]*100/t).toFixed(4));
    st.scenarios.push({id,name:key,weights:w}); st.scenarioId=id; mcfRender();
  });
  /* comparação */
  const cmp=b.querySelector('#mcfScenCmp');
  cmp.innerHTML='<div class="mcf-scroll" style="max-height:26vh"><table class="mcf-tbl"><thead><tr><th class="l">Critério</th>'+
    st.scenarios.map(s=>'<th>'+mcfEsc(s.name)+'</th>').join('')+'</tr></thead><tbody>'+
    st.criteria.map(c=>'<tr><td class="l">'+mcfEsc(c.name)+'</td>'+
      st.scenarios.map(s=>'<td>'+mcfFmt((s.weights&&s.weights[c.id]!==undefined)?s.weights[c.id]:c.weight,1)+'</td>').join('')+'</tr>').join('')+
    '<tr><th class="l">Total</th>'+st.scenarios.map(s=>{
      const t=st.criteria.reduce((q,c)=>q+mcfNum((s.weights&&s.weights[c.id]!==undefined)?s.weights[c.id]:c.weight,0),0);
      return '<th>'+mcfFmt(t,1)+'</th>';
    }).join('')+'</tr></tbody></table></div>';
}

/* ======================= 5 · CÁLCULO E CLASSES ======================= */
function mcfTabCalculo(b){
  const st=MCF.state, cl=st.classification, R=st.rules, P=st.post, SS=st.sensitivity;
  b.innerHTML=mcfHead('Cálculo, classes e regras de controle',
    'INTEGRATED = fator<sub>geo</sub> × GEO + fator<sub>viab</sub> × VIABILIDADE · FINAL = INTEGRATED × FINAL_LEGAL_MASK')+
  '<div class="mcf-card"><header><b>Tratamento de NoData na média ponderada</b></header>'+
    '<div class="mcf-inline">'+
      '<label><input type="radio" name="mcfNd" value="strict"'+(st.weighting.mode==='strict'?' checked':'')+' style="width:auto;accent-color:var(--amber)"> <b>Strict NoData</b> — critério obrigatório sem dado ⇒ resultado NoData</label></div>'+
    '<div class="mcf-inline">'+
      '<label><input type="radio" name="mcfNd" value="renorm"'+(st.weighting.mode!=='strict'?' checked':'')+' style="width:auto;accent-color:var(--amber)"> <b>Renormalized NoData</b> — critério não obrigatório sem dado sai da conta e o divisor é recalculado</label></div>'+
    '<div class="hint">O método utilizado fica registrado no relatório e no JSON de configuração.</div></div>'+
  '<div class="mcf-card"><header><b>Confiança do dado</b>'+
    (st.confidenceApply?'<span class="mcf-chip legal">FATOR ATIVO</span>':'<span class="mcf-chip">apenas informativa</span>')+'</header>'+
    '<div class="mcf-inline"><label><input type="checkbox" id="mcfConfOn"'+(st.confidenceApply?' checked':'')+'> Aplicar fator de confiança: <b>Nota ajustada = Nota × fator</b></label></div>'+
    '<div class="mcf-grid mcf-g3">'+
      ['high','medium','low'].map(k=>'<div><label class="field">'+({high:'Alta',medium:'Média',low:'Baixa'}[k])+
        '</label><input type="number" step="0.05" min="0" max="1" id="mcfCf_'+k+'" value="'+st.confidenceFactors[k]+'"'+
        (st.confidenceApply?'':' disabled')+'></div>').join('')+'</div></div>'+
  '<div class="mcf-card"><header><b>Integração dos dois índices</b></header>'+
    '<div class="mcf-grid mcf-g2">'+
      '<div><label class="field">Fator do potencial geológico</label><input type="number" step="0.05" min="0" max="1" id="mcfFg" value="'+st.integration.geo+'"></div>'+
      '<div><label class="field">Fator da viabilidade de implantação</label><input type="number" step="0.05" min="0" max="1" id="mcfFf" value="'+st.integration.feas+'"></div>'+
    '</div><div class="hint" id="mcfFsum"></div></div>'+
  '<div class="mcf-card"><header><b>Classificação final</b></header>'+
    '<div class="mcf-grid mcf-g2"><div><label class="field">Método</label><select id="mcfClsM">'+
      [['fixed','Limiares fixos (padrão — comparável entre áreas e cenários)'],
       ['equal','Intervalos iguais'],['quantile','Quantis'],['jenks','Quebras naturais (Jenks)']]
      .map(m=>'<option value="'+m[0]+'"'+(cl.method===m[0]?' selected':'')+'>'+m[1]+'</option>').join('')+'</select></div>'+
      '<div><label class="field">&nbsp;</label><button class="tbtn" id="mcfClsAdd">＋ Acrescentar classe</button></div></div>'+
    '<table class="mcf-tbl" style="margin-top:8px"><thead><tr><th>Código</th><th class="l">Rótulo</th><th>Mín.</th><th>Máx.</th><th>Cor</th><th></th></tr></thead>'+
    '<tbody id="mcfClsBody"></tbody></table>'+
    '<div class="mcf-legend"><span><i class="mcf-sw" style="background:'+st.symbology.excluded+'"></i> Excluded · máscara legal = 0</span>'+
      '<span><i class="mcf-sw" style="background:'+st.symbology.unclassified+'"></i> Unclassified · dado insuficiente</span></div>'+
    '<div class="mcf-grid mcf-g3"><div><label class="field">Cor de Excluded</label><input type="color" id="mcfColEx" value="'+st.symbology.excluded+'"></div>'+
      '<div><label class="field">Cor de Unclassified</label><input type="color" id="mcfColUn" value="'+st.symbology.unclassified+'"></div>'+
      '<div><label class="field">Opacidade dos rasters</label><input type="number" step="0.05" min="0.1" max="1" id="mcfOp" value="'+st.symbology.opacity+'"></div></div>'+
    '<div class="hint">Quando o método não é "limiares fixos", os limites da tabela são recalculados a partir da distribuição do resultado e ficam registrados no relatório.</div></div>'+
  '<div class="mcf-card"><header><b>Regras de controle</b></header>'+
    '<div class="mcf-inline"><label><input type="checkbox" id="mcfR1"'+(R.geoFloor.on?' checked':'')+'> Não permitir <b>Highly Favorable</b> com potencial geológico abaixo de</label>'+
      '<input type="number" step="0.1" min="0" max="5" id="mcfR1v" value="'+R.geoFloor.min+'" style="width:80px"></div>'+
    '<div class="mcf-inline"><label><input type="checkbox" id="mcfR2"'+(R.envSevere.on?' checked':'')+'> Restrição ambiental de severidade alta limita a classe a</label>'+
      '<input type="number" step="1" min="0" id="mcfR2v" value="'+R.envSevere.capClass+'" style="width:80px"></div>'+
    '<div class="mcf-inline"><label><input type="checkbox" id="mcfR3"'+(R.lowConf.on?' checked':'')+'> Confiança abaixo do fator</label>'+
      '<input type="number" step="0.05" min="0" max="1" id="mcfR3f" value="'+R.lowConf.minFactor+'" style="width:80px">'+
      '<label>limita a classe a</label><input type="number" step="1" min="0" id="mcfR3c" value="'+R.lowConf.capClass+'" style="width:80px"></div>'+
    '<div class="hint">Regras fixas do método, sempre ativas: célula excluída nunca entra na soma ponderada; nota fora de 0–5 é erro de validação; peso negativo é recusado.</div></div>'+
  '<div class="mcf-card"><header><b>Pós-processamento</b></header>'+
    '<div class="mcf-inline"><label><input type="checkbox" id="mcfPM"'+(P.majority?' checked':'')+'> Filtro de maioria —</label>'+
      '<input type="number" min="1" max="5" id="mcfPMp" value="'+P.majorityPasses+'" style="width:70px"><span class="hint">passada(s)</span></div>'+
    '<div class="mcf-inline"><label><input type="checkbox" id="mcfPF"'+(P.fillHoles?' checked':'')+'> Preencher vazios menores que</label>'+
      '<input type="number" min="0" step="1" id="mcfPFa" value="'+P.fillMaxHa+'" style="width:90px"><span class="hint">ha</span></div>'+
    '<div class="mcf-grid mcf-g3">'+
      '<div><label class="field">Área mínima do polígono (ha)</label><input type="number" min="0" step="5" id="mcfPMin" value="'+P.minAreaHa+'"></div>'+
      '<div><label class="field">Conectividade</label><select id="mcfPC">'+
        '<option value="8"'+(+P.connectivity===8?' selected':'')+'>8 vizinhos</option>'+
        '<option value="4"'+(+P.connectivity===4?' selected':'')+'>4 vizinhos</option></select></div>'+
      '<div><label class="field">Simplificação (m, 0 = nenhuma)</label><input type="number" min="0" step="5" id="mcfPS" value="'+P.simplifyTol+'"></div>'+
    '</div>'+
    '<label class="field">Classes convertidas em polígono</label><div class="mcf-inline" id="mcfPolyCls"></div>'+
    '<div class="hint">Regiões separadas nunca são unidas por pertencerem à mesma classe: cada região conectada vira um polígono próprio, com identificador único.</div></div>'+
  '<div class="mcf-card"><header><b>Análise de sensibilidade</b></header>'+
    '<div class="mcf-inline"><label><input type="checkbox" id="mcfSS"'+(SS.enabled?' checked':'')+'> Executar após o cálculo</label></div>'+
    '<div class="mcf-grid mcf-g3">'+
      '<div><label class="field">Variação dos pesos (±%)</label><input type="number" min="1" max="80" step="1" id="mcfSSp" value="'+SS.pct+'"></div>'+
      '<div><label class="field">Número de simulações</label><input type="number" min="2" max="200" step="1" id="mcfSSn" value="'+SS.n+'"></div>'+
      '<div><label class="field">&nbsp;</label><div class="hint">Gera o mapa de estabilidade, a variação de posição no ranking e a sensibilidade por critério.</div></div>'+
    '</div></div>';

  b.querySelectorAll('input[name=mcfNd]').forEach(r=>r.onchange=()=>{ st.weighting.mode=r.value; });
  b.querySelector('#mcfConfOn').onchange=e=>{ st.confidenceApply=e.target.checked; mcfRender(); };
  ['high','medium','low'].forEach(k=>{ const el=b.querySelector('#mcfCf_'+k);
    if(el) el.oninput=()=>{ st.confidenceFactors[k]=mcfNum(el.value,1); }; });
  const fs=()=>{ const t=mcfNum(st.integration.geo,0)+mcfNum(st.integration.feas,0);
    const e=b.querySelector('#mcfFsum');
    e.innerHTML='Soma dos fatores: <b>'+mcfFmt(t,2)+'</b>'+(Math.abs(t-1)>1e-6?' — o resultado é renormalizado por esta soma.':' ✓');
  };
  b.querySelector('#mcfFg').oninput=e=>{ st.integration.geo=mcfNum(e.target.value,.6); fs(); };
  b.querySelector('#mcfFf').oninput=e=>{ st.integration.feas=mcfNum(e.target.value,.4); fs(); };
  fs();
  b.querySelector('#mcfClsM').onchange=e=>{ cl.method=e.target.value; };
  b.querySelector('#mcfClsAdd').onclick=()=>{
    const code=cl.classes.reduce((m,c)=>Math.max(m,+c.code),0)+1;
    cl.classes.push({code,label:'Classe '+code,min:0,max:5,color:'#7aa2f7'}); mcfRender();
  };
  const cb=b.querySelector('#mcfClsBody');
  cb.innerHTML=cl.classes.map((c,i)=>'<tr>'+
    '<td><input type="number" step="1" min="1" value="'+c.code+'" data-cc="'+i+'" style="width:60px;text-align:right"></td>'+
    '<td class="l"><input type="text" value="'+mcfEsc(c.label)+'" data-cl="'+i+'"></td>'+
    '<td><input type="number" step="0.01" value="'+c.min+'" data-cn="'+i+'" style="width:80px;text-align:right"></td>'+
    '<td><input type="number" step="0.01" value="'+c.max+'" data-cx="'+i+'" style="width:80px;text-align:right"></td>'+
    '<td><input type="color" value="'+c.color+'" data-ck="'+i+'" style="width:52px"></td>'+
    '<td><span class="mcf-x" data-cd="'+i+'">✕</span></td></tr>').join('');
  cb.querySelectorAll('[data-cc]').forEach(el=>el.oninput=()=>cl.classes[+el.dataset.cc].code=mcfNum(el.value,1));
  cb.querySelectorAll('[data-cl]').forEach(el=>el.oninput=()=>cl.classes[+el.dataset.cl].label=el.value);
  cb.querySelectorAll('[data-cn]').forEach(el=>el.oninput=()=>cl.classes[+el.dataset.cn].min=mcfNum(el.value,0));
  cb.querySelectorAll('[data-cx]').forEach(el=>el.oninput=()=>cl.classes[+el.dataset.cx].max=mcfNum(el.value,5));
  cb.querySelectorAll('[data-ck]').forEach(el=>el.onchange=()=>cl.classes[+el.dataset.ck].color=el.value);
  cb.querySelectorAll('[data-cd]').forEach(el=>el.onclick=()=>{ cl.classes.splice(+el.dataset.cd,1); mcfRender(); });
  b.querySelector('#mcfColEx').onchange=e=>{ st.symbology.excluded=e.target.value; };
  b.querySelector('#mcfColUn').onchange=e=>{ st.symbology.unclassified=e.target.value; };
  b.querySelector('#mcfOp').oninput=e=>{ st.symbology.opacity=mcfNum(e.target.value,.75); };
  const rr=(id,obj,key,kind)=>{ const el=b.querySelector(id); if(el) el.onchange=el.oninput=()=>{
    obj[key]=(el.type==='checkbox')?el.checked:(kind==='num'?mcfNum(el.value,0):el.value); }; };
  rr('#mcfR1',R.geoFloor,'on'); rr('#mcfR1v',R.geoFloor,'min','num');
  rr('#mcfR2',R.envSevere,'on'); rr('#mcfR2v',R.envSevere,'capClass','num');
  rr('#mcfR3',R.lowConf,'on'); rr('#mcfR3f',R.lowConf,'minFactor','num'); rr('#mcfR3c',R.lowConf,'capClass','num');
  rr('#mcfPM',P,'majority'); rr('#mcfPMp',P,'majorityPasses','num');
  rr('#mcfPF',P,'fillHoles'); rr('#mcfPFa',P,'fillMaxHa','num');
  rr('#mcfPMin',P,'minAreaHa','num'); rr('#mcfPC',P,'connectivity','num'); rr('#mcfPS',P,'simplifyTol','num');
  rr('#mcfSS',SS,'enabled'); rr('#mcfSSp',SS,'pct','num'); rr('#mcfSSn',SS,'n','num');
  const pc=b.querySelector('#mcfPolyCls');
  pc.innerHTML=cl.classes.map(c=>'<label><input type="checkbox" data-pc="'+c.code+'"'+
    ((!P.polyClasses.length||P.polyClasses.indexOf(c.code)>=0)?' checked':'')+'> '+mcfEsc(c.label)+'</label>').join('')+
    '<label><input type="checkbox" data-pc="0"'+(P.polyClasses.indexOf(0)>=0?' checked':'')+'> Excluded (para registrar o motivo)</label>';
  pc.querySelectorAll('[data-pc]').forEach(el=>el.onchange=()=>{
    P.polyClasses=[...pc.querySelectorAll('[data-pc]')].filter(x=>x.checked).map(x=>+x.dataset.pc);
  });
}
/* ======================= 6 · RESULTADOS E RANKING ======================= */
let MCF_SORT={key:'RANK',dir:1}, MCF_FILTER='';
const MCF_COLS=[['RANK','#',0],['TARGET_ID','Alvo',0],['CLASSE_TXT','Classe',1],['AREA_HA','Área (ha)',0],
  ['SCORE_MED','Integrado méd.',0],['SCORE_MAX','Integrado máx.',0],['GEO_MED','Geológico',0],
  ['VIAB_MED','Viabilidade',0],['AMB_MED','Ambiental',0],['TERR_MED','Territorial',0],
  ['LOG_MED','Logística',0],['HIDRO_MED','Hidrologia',0],['CONFIANCA','Confiança',0],
  ['STATUS','Situação',1],['MOTIVO_EXC','Motivo da exclusão',1],
  ['CRIT_POS','Critério dominante +',1],['CRIT_NEG','Critério dominante −',1],
  ['RANK_MIN','Rank mín.',0],['RANK_MAX','Rank máx.',0],['ESTAVEL','Estável',1]];

function mcfTabResultados(b){
  const st=MCF.state, res=MCF.last;
  if(!res){ b.innerHTML=mcfHead('Resultados','Nenhum cálculo executado nesta sessão.')+
    '<div class="mcf-warn">Configure a grade, os critérios e as máscaras e use <b>▶ Calcular favorabilidade</b>.</div>'; return; }
  const G=res.grid, cellHa=G.cs*G.cs/10000;
  const hist={}; let nd=0;
  for(let i=0;i<res.classified.length;i++){ const v=res.classified[i];
    if(isFinite(v)) hist[v]=(hist[v]||0)+1; else nd++; }
  const linhas=res.classes.slice().sort((a,c)=>c.code-a.code).map(c=>
    '<tr><td class="l"><i class="mcf-sw" style="background:'+c.color+'"></i> ['+c.code+'] '+mcfEsc(c.label)+'</td>'+
    '<td>'+mcfFmt(c.min,2)+' – '+mcfFmt(c.max,2)+'</td>'+
    '<td>'+mcfFmt((hist[c.code]||0)*cellHa,2)+'</td>'+
    '<td>'+mcfFmt(res.nArea?100*(hist[c.code]||0)/res.nArea:0,1)+'%</td></tr>').join('')+
    '<tr><td class="l"><i class="mcf-sw mcf-hatch" style="background:'+st.symbology.excluded+'"></i> [0] Excluded · excluída</td><td>—</td>'+
    '<td>'+mcfFmt((hist[0]||0)*cellHa,2)+'</td><td>'+mcfFmt(res.nArea?100*(hist[0]||0)/res.nArea:0,1)+'%</td></tr>';

  b.innerHTML=mcfHead('Resultados','Balanço por classe e ranking dos polígonos gerados.')+
   '<div class="mcf-card"><header><b>Balanço por classe</b><span class="sp"></span>'+
     '<span class="mcf-chip">'+(res.ms/1000).toFixed(1)+' s</span>'+
     '<span class="mcf-chip">'+G.nc+'×'+G.nr+' · '+G.cs+' m</span></header>'+
     '<table class="mcf-tbl"><thead><tr><th class="l">Classe</th><th>Faixa</th><th>Área (ha)</th><th>% da análise</th></tr></thead>'+
     '<tbody>'+linhas+'</tbody></table>'+
     '<div class="hint" style="margin-top:6px">Células sem classificação (dado insuficiente): '+mcfFmt(Math.max(0,nd-(G.nc*G.nr-res.nArea))*cellHa,2)+' ha · '+
       'células excluídas por máscara legal: '+mcfFmt(res.nExcluded*cellHa,2)+' ha</div></div>'+
   (res.sensitivity?'<div class="mcf-ok">Sensibilidade executada: '+res.sensitivity.n+' simulações com ±'+res.sensitivity.pct+
     '%. Polígonos instáveis: <b>'+(res.polys||[]).filter(p=>p.unstable).length+'</b> de '+(res.polys||[]).length+
     '. O raster <b>MCF · Estabilidade</b> mostra a frequência com que cada célula permanece na classe mais alta.</div>':'')+
   '<div class="mcf-card"><header><b>Ranking dos polígonos</b><span class="sp"></span>'+
     '<input type="text" id="mcfRkQ" placeholder="filtrar…" style="max-width:200px" value="'+mcfEsc(MCF_FILTER)+'">'+
     '<button class="tbtn" id="mcfRkCsv" style="max-width:150px">⇩ CSV</button></header>'+
     '<div class="hint">Clique numa linha para selecionar e enquadrar o polígono no mapa. Clique no cabeçalho para ordenar.</div>'+
     '<div class="mcf-scroll" id="mcfRkBox"></div></div>';
  b.querySelector('#mcfRkQ').oninput=e=>{ MCF_FILTER=e.target.value; mcfRenderRank(); };
  b.querySelector('#mcfRkCsv').onclick=async()=>{
    await download(new Blob([mcfRankingCSV(st,res)],{type:'text/csv'}),'MCF_ranking_poligonos.csv');
  };
  mcfRenderRank();
}
function mcfRenderRank(){
  const box=document.getElementById('mcfRkBox'); if(!box) return;
  const st=MCF.state, res=MCF.last;
  const rows=(res.polys||[]).map((P,i)=>({p:mcfPolyProps(P,st,res,i),idx:i}));
  const q=MCF_FILTER.trim().toLowerCase();
  const vis=q?rows.filter(r=>MCF_COLS.some(c=>String(r.p[c[0]]??'').toLowerCase().includes(q))):rows;
  const k=MCF_SORT.key, d=MCF_SORT.dir;
  vis.sort((a,c)=>{
    const x=a.p[k], y=c.p[k];
    if(typeof x==='number'&&typeof y==='number') return (x-y)*d;
    return String(x??'').localeCompare(String(y??''),'pt-BR',{numeric:true})*d;
  });
  box.innerHTML='<table class="mcf-tbl"><thead><tr>'+
    MCF_COLS.map(c=>'<th class="'+(c[2]?'l':'')+'" data-k="'+c[0]+'">'+c[1]+(k===c[0]?(d>0?' ▲':' ▼'):'')+'</th>').join('')+
    '</tr></thead><tbody>'+
    (vis.length?vis.map(r=>'<tr data-i="'+r.idx+'">'+MCF_COLS.map(c=>{
      let v=r.p[c[0]];
      if(v==null) v='—';
      else if(typeof v==='number') v=mcfFmt(v,c[0]==='AREA_HA'?2:(/^(RANK|CLASSE)/.test(c[0])?0:3));
      return '<td class="'+(c[2]?'l':'')+'">'+mcfEsc(v)+'</td>';
    }).join('')+'</tr>').join('')
     :'<tr><td class="l" colspan="'+MCF_COLS.length+'">nenhum polígono corresponde ao filtro</td></tr>')+
    '</tbody></table>';
  box.querySelectorAll('th[data-k]').forEach(th=>th.onclick=()=>{
    const key=th.dataset.k;
    MCF_SORT=(MCF_SORT.key===key)?{key,dir:-MCF_SORT.dir}:{key,dir:1};
    mcfRenderRank();
  });
  box.querySelectorAll('tr[data-i]').forEach(tr=>tr.onclick=()=>{
    box.querySelectorAll('tr.sel').forEach(x=>x.classList.remove('sel'));
    tr.classList.add('sel'); mcfSelectPoly(+tr.dataset.i);
  });
}
function mcfSelectPoly(i){
  const res=MCF.last; if(!res) return;
  const L=(S.layers||[]).find(l=>l.id===res._layerId);
  if(!L){ toast('A camada de polígonos não está mais no projeto'); return; }
  const alvo='TGT-'+String((res.polys[i]||{}).rank||0).padStart(4,'0');
  const idx=L.features.findIndex(f=>(f.props||{}).TARGET_ID===alvo);
  if(idx<0){ toast('Polígono não localizado na camada'); return; }
  S.activeId=L.id; S.selFeat={layer:L,layerId:L.id,idx};
  try{ if(typeof highlightSel==='function') highlightSel(); }catch(e){}
  try{
    const lls=featToLatLngs(L,L.features[idx]);
    const flat=Array.isArray(lls[0][0])?lls.flat():lls;
    const bb=L2.latLngBounds(flat);
    if(bb.isValid()) safeFit(bb.pad(0.25));
  }catch(e){}
  try{ refreshUI(); }catch(e){}
}

/* ======================= 7 · AUDITORIA E EXPORTAÇÃO ======================= */
function mcfTabAuditoria(b){
  const st=MCF.state, res=MCF.last;
  const val=mcfValidate(st);
  b.innerHTML=mcfHead('Auditoria e exportação','Relatório completo do processamento e saídas em formatos abertos.')+
   (val.err.length?'<div class="mcf-err"><b>Erros de validação</b><br>'+val.err.map(mcfEsc).join('<br>')+'</div>':'')+
   (val.warn.length?'<div class="mcf-warn"><b>Avisos</b><br>'+val.warn.map(mcfEsc).join('<br>')+'</div>':'')+
   (!val.err.length&&!val.warn.length?'<div class="mcf-ok">Configuração validada, sem erros nem avisos.</div>':'')+
   '<div class="mcf-card"><header><b>Exportar</b></header><div class="mcf-grid mcf-g3">'+
     '<button class="tbtn" id="mcfExZip"'+(res?'':' disabled')+'>⇩ Pacote completo (.zip)</button>'+
     '<button class="tbtn" id="mcfExCsv"'+(res?'':' disabled')+'>⇩ Ranking (.csv)</button>'+
     '<button class="tbtn" id="mcfExJson">⇩ Configuração (.json)</button>'+
     '<button class="tbtn" id="mcfExRep"'+(res?'':' disabled')+'>⇩ Relatório (.txt)</button>'+
     '<button class="tbtn" id="mcfExGeo"'+(res&&res._layerId?'':' disabled')+'>⇩ Polígonos (.geojson)</button>'+
     '<button class="tbtn" id="mcfExShp"'+(res&&res._layerId?'':' disabled')+'>⇩ Polígonos (Shapefile .zip)</button>'+
     '<button class="tbtn" id="mcfPubCrit"'+(res?'':' disabled')+'>◈ Um raster por critério (0–5)</button>'+
     '<button class="tbtn" id="mcfImJson">⇧ Carregar configuração (.json)</button>'+
     '<button class="tbtn" id="mcfSelfTest">⚙ Rodar testes de validação</button>'+
     '<button class="tbtn" id="mcfReset">↺ Zerar configuração</button>'+
   '</div>'+
   '<div class="hint" style="margin-top:6px">O pacote traz os seis rasters de síntese <b>mais um GeoTIFF por critério, na escala 0–5</b> (com .prj), o ranking em CSV, os polígonos em GeoJSON e Shapefile, a configuração metodológica em JSON e o relatório de processamento.</div></div>'+
   '<div class="mcf-card"><header><b>Relatório de processamento</b></header>'+
     '<div class="hout" id="mcfRep" style="max-height:44vh;overflow:auto;font-size:11px">'+
       (res?mcfEsc(mcfReport(st,res,val)):'Execute o cálculo para gerar o relatório.')+'</div></div>';

  const g=id=>b.querySelector(id);
  if(res){
    g('#mcfExZip').onclick=async()=>{ try{ showLoad('Montando o pacote…'); await mcfExportPackage(st,res,val); } finally{ hideLoad(); } };
    g('#mcfExCsv').onclick=()=>download(new Blob([mcfRankingCSV(st,res)],{type:'text/csv'}),'MCF_ranking_poligonos.csv');
    g('#mcfExRep').onclick=()=>download(new Blob([mcfReport(st,res,val)],{type:'text/plain'}),'MCF_relatorio_processamento.txt');
    const LP=(S.layers||[]).find(l=>l.id===res._layerId);
    if(LP){
      g('#mcfExGeo').onclick=()=>download(new Blob([JSON.stringify(layerToGeoJSON(LP))],{type:'application/geo+json'}),'MCF_areas_prioritarias.geojson');
      g('#mcfExShp').onclick=()=>exportLayer(LP,res.grid.crs);
    }
  }
  if(res && g('#mcfPubCrit')) g('#mcfPubCrit').onclick=()=>mcfPublicaCriterios(st,res);
  g('#mcfExJson').onclick=()=>download(new Blob([mcfConfigJSON(st,res)],{type:'application/json'}),'MCF_configuracao.json');
  g('#mcfImJson').onclick=()=>{
    const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json';
    inp.onchange=async()=>{
      const f=inp.files&&inp.files[0]; if(!f) return;
      try{
        const j=JSON.parse(await f.text());
        const s=j.state||j;
        if(!s||!s.grid||!Array.isArray(s.criteria)) throw new Error('arquivo sem configuração da ferramenta');
        MCF.state=mcfMigrateState(s); MCF.last=null; mcfRender();
        toast('Configuração carregada: '+MCF.state.criteria.length+' critério(s), '+MCF.state.masks.length+' máscara(s)');
      }catch(e){ toast('Falha ao ler: '+e.message); }
    };
    inp.click();
  };
  g('#mcfSelfTest').onclick=()=>mcfSelfTest();
  g('#mcfReset').onclick=()=>{ if(confirm('Zerar toda a configuração da análise multicritério?')){
    MCF.state=mcfNewState(); MCF.last=null; mcfRender(); } };
}
/* ===========================================================================
   EDITOR DE REGRAS DE PADRONIZAÇÃO — intervalos, de-para, curva e prévia
   ========================================================================= */
/* A prévia roda o MESMO núcleo do cálculo definitivo, só que numa grade
   grosseira e com um único critério: o que aparece aqui é literalmente o que
   sairá no resultado, e não uma aproximação escrita à parte. */
function mcfPreview(crit,maxCells){
  const st=MCF.state;
  const info=mcfComputeGrid(st,null);
  if(!info.ok) throw new Error(info.msg);
  const G=info.grid;
  const f=Math.max(1,Math.sqrt((G.nc*G.nr)/(maxCells||9000)));
  const cs=G.cs*f;
  const nc=Math.max(2,Math.ceil(G.nc/f)), nr=Math.max(2,Math.ceil(G.nr/f));
  const g2={nc,nr,cs,xll:G.xll,yll:G.yll,crs:G.crs,nodata:G.nodata};
  const one=JSON.parse(JSON.stringify(st));
  one.criteria=[crit]; one.masks=[]; one.sensitivity={enabled:false};
  one.post={minAreaHa:1e12,dropSmall:true,polyClasses:[],connectivity:8};
  const job=mcfBuildJob(one,{grid:g2,areaFeats:info.areaFeats});
  const it=mcfLocalKernel().mcfRun(job);
  let step; while(!(step=it.next()).done){}
  const R=step.value;
  return {grid:g2,raw:R.raw[0],std:R.standardized[0]};
}
function mcfHistogram(vals,bins){
  let mn=Infinity,mx=-Infinity,n=0;
  for(let i=0;i<vals.length;i++){ const v=vals[i]; if(!isFinite(v))continue; n++;
    if(v<mn)mn=v; if(v>mx)mx=v; }
  if(!n||mn===Infinity) return null;
  if(mx===mn) mx=mn+1;
  const B=bins||36, h=new Float64Array(B);
  for(let i=0;i<vals.length;i++){ const v=vals[i]; if(!isFinite(v))continue;
    let k=Math.floor((v-mn)/(mx-mn)*B); if(k<0)k=0; if(k>=B)k=B-1; h[k]++; }
  return {mn,mx,h,n};
}
function mcfSvgHist(H,rules,scoreFn){
  if(!H) return '<div class="hint">Sem valores válidos para o histograma.</div>';
  const W=520,Hh=120,pad=22, mx=Math.max.apply(null,Array.from(H.h))||1;
  let bars='';
  for(let i=0;i<H.h.length;i++){
    const bw=(W-2*pad)/H.h.length, x=pad+i*bw, hh=(H.h[i]/mx)*(Hh-30);
    bars+='<rect x="'+x.toFixed(1)+'" y="'+(Hh-14-hh).toFixed(1)+'" width="'+Math.max(1,bw-1).toFixed(1)+
      '" height="'+hh.toFixed(1)+'" fill="#7aa2f7" opacity=".55"/>';
  }
  let cuts='';
  (rules||[]).forEach(r=>{
    [r.min,r.max].forEach(v=>{
      const q=parseFloat(v); if(!isFinite(q)||q<H.mn||q>H.mx) return;
      const x=pad+(q-H.mn)/(H.mx-H.mn)*(W-2*pad);
      cuts+='<line x1="'+x.toFixed(1)+'" y1="6" x2="'+x.toFixed(1)+'" y2="'+(Hh-14)+'" stroke="#f5a524" stroke-width="1" stroke-dasharray="3 3"/>';
    });
  });
  return '<svg viewBox="0 0 '+W+' '+Hh+'" style="width:100%;height:auto">'+
    '<rect x="0" y="0" width="'+W+'" height="'+Hh+'" fill="none"/>'+bars+cuts+
    '<line x1="'+pad+'" y1="'+(Hh-14)+'" x2="'+(W-pad)+'" y2="'+(Hh-14)+'" stroke="#888"/>'+
    '<text x="'+pad+'" y="'+(Hh-3)+'" font-size="9" fill="#999">'+mcfFmt(H.mn,2)+'</text>'+
    '<text x="'+(W-pad)+'" y="'+(Hh-3)+'" font-size="9" fill="#999" text-anchor="end">'+mcfFmt(H.mx,2)+'</text>'+
    '<text x="'+(W/2)+'" y="'+(Hh-3)+'" font-size="9" fill="#999" text-anchor="middle">valor bruto ('+H.n.toLocaleString('pt-BR')+' células)</text></svg>';
}
function mcfNormCrit(crit){
  const c=JSON.parse(JSON.stringify(crit));
  c.rules=(c.rules||[]).map(r=>({min:(r.min===''||r.min==null)?null:+r.min,
    max:(r.max===''||r.max==null)?null:+r.max,score:+r.score,
    incLow:r.incLow!==false,incHigh:!!r.incHigh}));
  c.lookup=(c.lookup||[]).map(l=>({value:l.value,score:+l.score}));
  c.lookupFallback=(c.lookupFallback===''||c.lookupFallback==null)?null:+c.lookupFallback;
  c.lookupOutside=(c.lookupOutside===''||c.lookupOutside==null)?null:+c.lookupOutside;
  c.piecewise=(c.piecewise||[]).map(q=>({x:+q.x,y:+q.y}));
  c.lin={min:mcfNum(c.lin&&c.lin.min,0),max:mcfNum(c.lin&&c.lin.max,1)};
  c.boolInside=mcfNum(c.boolInside,5); c.boolOutside=mcfNum(c.boolOutside,0);
  return c;
}
/* nota de UM valor pela MESMA função de padronização do núcleo */
function mcfStdMod(){
  if(!mcfStdMod._m) mcfStdMod._m=new Function(MCF_KERNEL_ALL+'\nreturn {std:standardize};')();
  return mcfStdMod._m;
}
function mcfScoreOf(normCrit,v){
  return mcfStdMod().std(normCrit,new Float32Array([v]),1)[0];
}
function mcfSvgCurve(crit,H){
  const W=520,Hh=130,pad=26;
  const mn=H?H.mn:0, mx=H?H.mx:1;
  const c=mcfNormCrit(crit), N=180, pts=[];
  for(let i=0;i<=N;i++){
    const v=mn+(mx-mn)*i/N;
    let s=NaN; try{ s=mcfScoreOf(c,v); }catch(e){}
    pts.push([v,s]);
  }
  const px=v=>pad+(v-mn)/((mx-mn)||1)*(W-2*pad);
  const py=s=>Hh-18-(isFinite(s)?s:0)/5*(Hh-34);
  let d='',open=false;
  pts.forEach(([v,s])=>{
    if(!isFinite(s)){ open=false; return; }
    d+=(open?'L':'M')+px(v).toFixed(1)+' '+py(s).toFixed(1)+' '; open=true;
  });
  let grid='';
  for(let s=0;s<=5;s++) grid+='<line x1="'+pad+'" y1="'+py(s).toFixed(1)+'" x2="'+(W-pad)+'" y2="'+py(s).toFixed(1)+
    '" stroke="#666" stroke-width=".5" stroke-dasharray="2 4"/><text x="4" y="'+(py(s)+3).toFixed(1)+'" font-size="9" fill="#999">'+s+'</text>';
  return '<svg viewBox="0 0 '+W+' '+Hh+'" style="width:100%;height:auto">'+grid+
    '<path d="'+d+'" fill="none" stroke="#37c0aa" stroke-width="2"/>'+
    '<text x="'+(W/2)+'" y="'+(Hh-3)+'" font-size="9" fill="#999" text-anchor="middle">curva de transformação → nota 0–5</text></svg>';
}
function mcfPrevCanvas(P){
  const {grid,std}=P, cv=document.createElement('canvas');
  cv.width=grid.nc; cv.height=grid.nr; cv.className='mcf-prev';
  const ctx=cv.getContext('2d'), im=ctx.createImageData(grid.nc,grid.nr), px=im.data;
  const ramp=MCF_SCORE_RAMP.map(c=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)]);
  for(let k=0;k<std.length;k++){
    const v=std[k], o=k*4;
    if(!isFinite(v)){ px[o+3]=0; continue; }
    const t=Math.max(0,Math.min(9,Math.floor(v/5*9.999)));
    px[o]=ramp[t][0]; px[o+1]=ramp[t][1]; px[o+2]=ramp[t][2]; px[o+3]=255;
  }
  ctx.putImageData(im,0,0);
  return cv;
}

function mcfOpenRuleEditor(crit){
  const bg=document.createElement('div'); bg.className='modal-bg on';
  bg.innerHTML='<div class="modal" style="width:min(940px,100%);max-height:92vh">'+
    '<div class="modal-h"><b>✎ Padronização — '+mcfEsc(crit.name)+'</b>'+
      '<span class="tag">0 … 5</span><div style="flex:1"></div><span class="mcf-x" id="rzX">✕</span></div>'+
    '<div class="modal-b" id="rzBody"></div>'+
    '<div class="mcf-foot"><span class="grow hint" id="rzMsg"></span>'+
      '<button class="tbtn" id="rzPrev" style="max-width:180px">◍ Pré-visualizar</button>'+
      '<button class="tbtn" id="rzOk" style="max-width:130px;border-color:var(--amber-dim);color:var(--amber)">✓ Concluir</button></div></div>';
  document.body.appendChild(bg);
  const close=()=>{ bg.remove(); mcfRenderCrits(); };
  bg.querySelector('#rzX').onclick=close;
  bg.querySelector('#rzOk').onclick=close;
  bg.addEventListener('mousedown',e=>{ if(e.target===bg) close(); });
  let PREV=null;
  const body=bg.querySelector('#rzBody'), msg=bg.querySelector('#rzMsg');

  function render(){
    const m=crit.method;
    let h='<div class="mcf-card"><header><b>Método:</b> '+
      mcfEsc((MCF_METHODS.find(x=>x[0]===m)||['',m])[1])+'</header>';
    if(m==='reclass'||m==='euclid'){
      h+='<table class="mcf-tbl"><thead><tr><th>Mínimo</th><th>Máximo</th><th>Nota 0–5</th>'+
        '<th>Inclui mín.</th><th>Inclui máx.</th><th></th></tr></thead><tbody id="rzRules"></tbody></table>'+
        '<div class="mcf-inline" style="margin-top:6px">'+
        '<button class="tbtn" id="rzAdd" style="max-width:150px">＋ Faixa</button>'+
        '<button class="tbtn" id="rzSort" style="max-width:160px">↑↓ Ordenar</button>'+
        (m==='euclid'?'<button class="tbtn" id="rzDef" style="max-width:230px">↺ Faixas padrão de distância</button>':'')+
        '</div><div id="rzChk"></div>';
    }else if(m==='lookup'){
      h+='<div class="mcf-grid mcf-g3"><div><label class="field">Nota para valores não listados</label>'+
        '<input type="number" id="rzFb" step="0.5" min="0" max="5" value="'+mcfEsc(crit.lookupFallback)+'" placeholder="vazio = sem dado"></div>'+
        '<div><label class="field">Nota fora de todo polígono</label>'+
        '<input type="number" id="rzFo" step="0.5" min="0" max="5" value="'+mcfEsc(crit.lookupOutside)+'" placeholder="vazio = sem dado"></div>'+
        '<div><label class="field">&nbsp;</label><button class="tbtn" id="rzFill">⟳ Ler valores distintos da camada</button></div></div>'+
        '<div class="hint" style="margin:2px 0 6px">A primeira coluna vale para o polígono cuja classe não está na tabela. '+
        'A segunda vale para a célula que <b>nenhum</b> polígono cobre — deixe vazia quando a ausência significa falta de dado, '+
        'e preencha quando ela significa alguma coisa (área livre de processo da ANM, por exemplo).</div>'+
        '<table class="mcf-tbl"><thead><tr><th class="l">Valor / classe</th><th>Nota 0–5</th><th></th></tr></thead>'+
        '<tbody id="rzLook"></tbody></table>'+
        '<button class="tbtn" id="rzAddL" style="max-width:150px;margin-top:6px">＋ Linha</button>';
    }else if(m==='linInc'||m==='linDec'){
      h+='<div class="mcf-grid mcf-g2">'+
        '<div><label class="field">Valor no início do domínio</label><input type="number" id="rzA" step="any" value="'+mcfNum(crit.lin.min,0)+'"></div>'+
        '<div><label class="field">Valor no fim do domínio</label><input type="number" id="rzB" step="any" value="'+mcfNum(crit.lin.max,1)+'"></div></div>'+
        '<div class="hint">'+(m==='linInc'?'início → nota 0 · fim → nota 5':'início → nota 5 · fim → nota 0')+
        '. Valores fora do domínio são fixados no extremo correspondente.</div>';
    }else if(m==='piecewise'){
      h+='<table class="mcf-tbl"><thead><tr><th>Valor</th><th>Nota 0–5</th><th></th></tr></thead><tbody id="rzPw"></tbody></table>'+
        '<button class="tbtn" id="rzAddP" style="max-width:150px;margin-top:6px">＋ Ponto</button>';
    }else if(m==='bool'){
      h+='<div class="mcf-grid mcf-g2">'+
        '<div><label class="field">Nota dentro / sobre a feição</label><input type="number" id="rzBi" min="0" max="5" step="0.5" value="'+mcfNum(crit.boolInside,5)+'"></div>'+
        '<div><label class="field">Nota fora</label><input type="number" id="rzBo" min="0" max="5" step="0.5" value="'+mcfNum(crit.boolOutside,0)+'"></div></div>';
    }else if(m==='fuzzy'){
      h+='<div class="mcf-grid mcf-g3">'+
        '<div><label class="field">Função</label><select id="rzFt">'+
          [['linear','Linear'],['gauss','Gaussiana'],['sigmoid','Sigmoide']]
          .map(o=>'<option value="'+o[0]+'"'+(crit.fuzzy.type===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select></div>'+
        '<div><label class="field">Parâmetro a (início / centro)</label><input type="number" id="rzFa" step="any" value="'+mcfNum(crit.fuzzy.a,0)+'"></div>'+
        '<div><label class="field">Parâmetro b (fim / dispersão)</label><input type="number" id="rzFb2" step="any" value="'+mcfNum(crit.fuzzy.b,1)+'"></div></div>'+
        '<div class="mcf-inline"><label><input type="checkbox" id="rzFi"'+(crit.fuzzy.invert?' checked':'')+'> Inverter a pertinência</label></div>';
    }
    h+='</div><div class="mcf-card"><header><b>Histograma e curva de transformação</b></header>'+
      '<div id="rzHist"><div class="hint">Use <b>◍ Pré-visualizar</b> para calcular o histograma sobre a área de análise.</div></div>'+
      '<div id="rzCurve"></div></div>'+
      '<div class="mcf-card"><header><b>Prévia do raster reclassificado</b></header>'+
      '<div id="rzPrevBox"><div class="hint">A prévia usa uma grade grosseira e o mesmo núcleo do cálculo definitivo.</div></div>'+
      '<div class="mcf-legend">'+MCF_SCORE_RAMP.map((c,i)=>'<span><i class="mcf-sw" style="background:'+c+'"></i>'+
        (i*0.5).toFixed(1)+'</span>').join('')+'</div></div>';
    body.innerHTML=h;
    wire();
  }
  function wire(){
    const m=crit.method;
    if(m==='reclass'||m==='euclid'){
      const tb=body.querySelector('#rzRules');
      tb.innerHTML=(crit.rules||[]).map((r,i)=>'<tr>'+
        '<td><input type="number" step="any" value="'+mcfEsc(r.min)+'" data-rn="'+i+'" placeholder="-∞" style="width:100px;text-align:right"></td>'+
        '<td><input type="number" step="any" value="'+mcfEsc(r.max)+'" data-rx="'+i+'" placeholder="∞" style="width:100px;text-align:right"></td>'+
        '<td><input type="number" step="0.5" min="0" max="5" value="'+mcfEsc(r.score)+'" data-rs="'+i+'" style="width:80px;text-align:right"></td>'+
        '<td><input type="checkbox" data-ri="'+i+'"'+(r.incLow!==false?' checked':'')+' style="width:auto;accent-color:var(--amber)"></td>'+
        '<td><input type="checkbox" data-rh="'+i+'"'+(r.incHigh?' checked':'')+' style="width:auto;accent-color:var(--amber)"></td>'+
        '<td><span class="mcf-x" data-rd="'+i+'">✕</span></td></tr>').join('');
      tb.querySelectorAll('[data-rn]').forEach(el=>el.oninput=()=>{crit.rules[+el.dataset.rn].min=el.value;check();});
      tb.querySelectorAll('[data-rx]').forEach(el=>el.oninput=()=>{crit.rules[+el.dataset.rx].max=el.value;check();});
      tb.querySelectorAll('[data-rs]').forEach(el=>el.oninput=()=>{crit.rules[+el.dataset.rs].score=mcfNum(el.value,0);check();});
      tb.querySelectorAll('[data-ri]').forEach(el=>el.onchange=()=>{crit.rules[+el.dataset.ri].incLow=el.checked;});
      tb.querySelectorAll('[data-rh]').forEach(el=>el.onchange=()=>{crit.rules[+el.dataset.rh].incHigh=el.checked;});
      tb.querySelectorAll('[data-rd]').forEach(el=>el.onclick=()=>{crit.rules.splice(+el.dataset.rd,1);render();});
      body.querySelector('#rzAdd').onclick=()=>{crit.rules.push({min:'',max:'',score:3,incLow:true,incHigh:false});render();};
      body.querySelector('#rzSort').onclick=()=>{
        crit.rules.sort((a,b)=>{const x=(a.min===''||a.min==null)?-Infinity:+a.min,y=(b.min===''||b.min==null)?-Infinity:+b.min;return x-y;});
        render();
      };
      const df=body.querySelector('#rzDef'); if(df) df.onclick=()=>{crit.rules=mcfDistRulesPadrao().map(r=>({...r,incLow:true,incHigh:false}));render();};
      check();
    }
    if(m==='lookup'){
      const tb=body.querySelector('#rzLook');
      tb.innerHTML=(crit.lookup||[]).map((L,i)=>'<tr>'+
        '<td class="l"><input type="text" value="'+mcfEsc(L.value)+'" data-lv="'+i+'"></td>'+
        '<td><input type="number" step="0.5" min="0" max="5" value="'+mcfEsc(L.score)+'" data-ls="'+i+'" style="width:80px;text-align:right"></td>'+
        '<td><span class="mcf-x" data-ld="'+i+'">✕</span></td></tr>').join('');
      tb.querySelectorAll('[data-lv]').forEach(el=>el.oninput=()=>crit.lookup[+el.dataset.lv].value=el.value);
      tb.querySelectorAll('[data-ls]').forEach(el=>el.oninput=()=>crit.lookup[+el.dataset.ls].score=mcfNum(el.value,0));
      tb.querySelectorAll('[data-ld]').forEach(el=>el.onclick=()=>{crit.lookup.splice(+el.dataset.ld,1);render();});
      body.querySelector('#rzAddL').onclick=()=>{(crit.lookup=crit.lookup||[]).push({value:'',score:3});render();};
      body.querySelector('#rzFb').oninput=e=>{crit.lookupFallback=e.target.value;};
      body.querySelector('#rzFo').oninput=e=>{crit.lookupOutside=e.target.value;};
      body.querySelector('#rzFill').onclick=()=>{
        if(!crit.classField){ toast('Escolha antes o campo da classe no cartão do critério'); return; }
        const vals=mcfDistinct(crit.layerId,crit.classField,200);
        const have=new Set((crit.lookup||[]).map(l=>String(l.value)));
        vals.forEach(v=>{ if(!have.has(v)) crit.lookup.push({value:v,score:3}); });
        render();
      };
    }
    if(m==='linInc'||m==='linDec'){
      body.querySelector('#rzA').oninput=e=>{crit.lin.min=mcfNum(e.target.value,0);};
      body.querySelector('#rzB').oninput=e=>{crit.lin.max=mcfNum(e.target.value,1);};
    }
    if(m==='piecewise'){
      const tb=body.querySelector('#rzPw');
      tb.innerHTML=(crit.piecewise||[]).map((p,i)=>'<tr>'+
        '<td><input type="number" step="any" value="'+p.x+'" data-px="'+i+'" style="width:110px;text-align:right"></td>'+
        '<td><input type="number" step="0.5" min="0" max="5" value="'+p.y+'" data-py="'+i+'" style="width:80px;text-align:right"></td>'+
        '<td><span class="mcf-x" data-pd="'+i+'">✕</span></td></tr>').join('');
      tb.querySelectorAll('[data-px]').forEach(el=>el.oninput=()=>crit.piecewise[+el.dataset.px].x=mcfNum(el.value,0));
      tb.querySelectorAll('[data-py]').forEach(el=>el.oninput=()=>crit.piecewise[+el.dataset.py].y=mcfNum(el.value,0));
      tb.querySelectorAll('[data-pd]').forEach(el=>el.onclick=()=>{crit.piecewise.splice(+el.dataset.pd,1);render();});
      body.querySelector('#rzAddP').onclick=()=>{crit.piecewise.push({x:0,y:3});render();};
    }
    if(m==='bool'){
      body.querySelector('#rzBi').oninput=e=>{crit.boolInside=mcfNum(e.target.value,5);};
      body.querySelector('#rzBo').oninput=e=>{crit.boolOutside=mcfNum(e.target.value,0);};
    }
    if(m==='fuzzy'){
      body.querySelector('#rzFt').onchange=e=>{crit.fuzzy.type=e.target.value;};
      body.querySelector('#rzFa').oninput=e=>{crit.fuzzy.a=mcfNum(e.target.value,0);};
      body.querySelector('#rzFb2').oninput=e=>{crit.fuzzy.b=mcfNum(e.target.value,1);};
      body.querySelector('#rzFi').onchange=e=>{crit.fuzzy.invert=e.target.checked;};
    }
    if(PREV) draw();
  }
  function check(){
    const box=body.querySelector('#rzChk'); if(!box) return;
    const g=mcfRuleGaps(crit.rules||[]);
    const bad=(crit.rules||[]).filter(r=>{const q=mcfNum(r.score,NaN);return !(isFinite(q)&&q>=0&&q<=5);}).length;
    let h='';
    if(bad) h+='<div class="mcf-err">'+bad+' faixa(s) com nota fora do intervalo 0–5.</div>';
    g.overlaps.forEach(o=>h+='<div class="mcf-warn">Sobreposição entre as faixas '+o+'.</div>');
    g.gaps.forEach(o=>h+='<div class="mcf-warn">Intervalo sem regra entre '+o+' — a célula sairá como sem-dado.</div>');
    if(!h) h='<div class="mcf-ok">Faixas contínuas, sem sobreposição, notas dentro de 0–5.</div>';
    box.innerHTML=h;
  }
  function draw(){
    const H=mcfHistogram(PREV.raw,36);
    body.querySelector('#rzHist').innerHTML=mcfSvgHist(H,crit.rules,null);
    body.querySelector('#rzCurve').innerHTML=(crit.method==='lookup')
      ? '<div class="hint">O de-para categórico não tem curva contínua.</div>'
      : mcfSvgCurve(crit,H);
    const pb=body.querySelector('#rzPrevBox'); pb.innerHTML='';
    pb.appendChild(mcfPrevCanvas(PREV));
    let ok=0,nd=0;
    for(let i=0;i<PREV.std.length;i++) isFinite(PREV.std[i])?ok++:nd++;
    const p=document.createElement('div'); p.className='hint';
    p.textContent='Grade da prévia: '+PREV.grid.nc+'×'+PREV.grid.nr+' células de '+
      PREV.grid.cs.toFixed(0)+' m · com nota: '+ok.toLocaleString('pt-BR')+' · sem dado: '+nd.toLocaleString('pt-BR');
    pb.appendChild(p);
  }
  bg.querySelector('#rzPrev').onclick=()=>{
    msg.textContent='calculando prévia…';
    setTimeout(()=>{
      try{ PREV=mcfPreview(crit,9000); draw(); msg.textContent='prévia atualizada'; }
      catch(e){ msg.textContent=''; toast('Prévia: '+e.message); }
    },20);
  };
  render();
}
/* ===========================================================================
   EXECUÇÃO
   ========================================================================= */
async function mcfExecuteAnalysis(){
  const st=MCF.state;
  const val=mcfValidate(st);
  if(val.err.length){
    MCF_TAB='auditoria'; mcfRender();
    toast('Corrija os '+val.err.length+' erro(s) de validação antes de calcular');
    return;
  }
  const info=mcfComputeGrid(st,null);
  if(!info.ok){ MCF_TAB='grade'; mcfRender(); toast(info.msg); return; }
  if(info.cells>2.5e7){ toast('Grade grande demais ('+(info.cells/1e6).toFixed(1)+' M células) — aumente a célula'); return; }
  if(info.memMB>1400 && !confirm('A análise deve usar cerca de '+info.memMB.toFixed(0)+
      ' MB de memória. Continuar?')) return;

  let job;
  try{ job=mcfBuildJob(st,info); }
  catch(e){ toast(e.message); return; }

  mcfBusy(true); mcfProgress(0,'iniciando…');
  const t0=performance.now();
  const run=mcfExecute(job,m=>mcfProgress(m.pct,m.stage));
  MCF.running=run;
  try{
    const res=await run.promise;
    res._maskNames=(st.masks||[]).filter(m=>m.enabled!==false).map(m=>m.reason||m.name);
    res._areaRings=[];
    (info.areaFeats||[]).forEach(f=>f.rings.forEach(R=>{ if(R.length>=3) res._areaRings.push(R); }));
    MCF.last=res;
    mcfProgress(1,'gerando camadas…');
    await new Promise(r=>setTimeout(r,10));
    const out=mcfApplyOutputs(st,res);
    mcfProgress(1,'concluído em '+((performance.now()-t0)/1000).toFixed(1)+' s');
    toast('Favorabilidade calculada: '+(res.polys||[]).length+' polígono(s) · '+
      out.rasters.length+' raster(s) · '+((performance.now()-t0)/1000).toFixed(1)+' s');
    try{ if(typeof cmdLog==='function') cmdLog('MCF: '+(res.polys||[]).length+' polígono(s), '+
      res.nExcluded.toLocaleString('pt-BR')+' célula(s) excluída(s) por máscara legal','info'); }catch(e){}
    MCF_TAB='resultados'; mcfRender();
  }catch(e){
    if(/cancelad/i.test(e.message||'')){ mcfProgress(0,'cancelado pelo usuário'); toast('Cálculo cancelado'); }
    else { mcfProgress(0,'falhou'); toast('Falha no cálculo: '+e.message); console.error(e); }
  }finally{ mcfBusy(false); MCF.running=null; }
}

/* ===========================================================================
   MIGRAÇÃO / PERSISTÊNCIA
   ========================================================================= */
function mcfMigrateState(s){
  const base=mcfNewState();
  const st=Object.assign(base,s||{});
  st.meta=Object.assign(base.meta,s&&s.meta||{});
  st.grid=Object.assign(base.grid,s&&s.grid||{});
  st.weighting=Object.assign(base.weighting,s&&s.weighting||{});
  st.confidenceFactors=Object.assign(base.confidenceFactors,s&&s.confidenceFactors||{});
  st.integration=Object.assign(base.integration,s&&s.integration||{});
  st.classification=Object.assign({},base.classification,s&&s.classification||{});
  if(!Array.isArray(st.classification.classes)||!st.classification.classes.length)
    st.classification.classes=mcfDefaultClasses();
  st.rules=Object.assign({},base.rules,s&&s.rules||{});
  ['geoFloor','envSevere','lowConf'].forEach(k=>st.rules[k]=Object.assign({},base.rules[k],st.rules[k]||{}));
  st.post=Object.assign({},base.post,s&&s.post||{});
  st.sensitivity=Object.assign({},base.sensitivity,s&&s.sensitivity||{});
  st.symbology=Object.assign({},base.symbology,s&&s.symbology||{});
  st.criteria=(s&&s.criteria||[]).map(c=>{
    const d=mcfNewCriterion();
    const o=Object.assign(d,c);
    o.select=Object.assign({field:'',op:'eq',value:''},c.select||{});
    o.dist=Object.assign({from:'boundary',insideZero:true,max:0,unit:'m'},c.dist||{});
    o.lin=Object.assign({min:0,max:1000},c.lin||{});
    o.fuzzy=Object.assign({type:'linear',a:0,b:1,invert:false},c.fuzzy||{});
    o.rules=Array.isArray(c.rules)?c.rules:d.rules;
    o.lookup=Array.isArray(c.lookup)?c.lookup:[];
    if(o.lookupOutside===undefined) o.lookupOutside='';
    if(!o.missing) o.missing = o.mandatory ? 'insufficient' : 'renorm';
    if(o.missingScore===undefined||o.missingScore===null) o.missingScore=0;
    o.piecewise=Array.isArray(c.piecewise)?c.piecewise:d.piecewise;
    if(!o.id) o.id=mcfId('crit');
    return o;
  });
  st.masks=(s&&s.masks||[]).map(m=>{
    const o=Object.assign(mcfNewMask(),m);
    o.select=Object.assign({field:'',op:'eq',value:''},m.select||{});
    if(!o.id) o.id=mcfId('mask');
    return o;
  });
  if(!Array.isArray(st.scenarios)||!st.scenarios.length)
    st.scenarios=[{id:'base',name:'Balanced · Equilibrado',weights:{}}];
  if(!st.scenarios.some(x=>x.id===st.scenarioId)) st.scenarioId=st.scenarios[0].id;
  return st;
}
/* Resumo pequeno do último resultado — o .ccmgis guarda a FICHA, nunca as
   matrizes: os rasters já viajam pelo mecanismo de raster do próprio CCMGIS. */
function mcfSummary(res){
  if(!res) return null;
  return {at:new Date().toISOString(),
    grid:{nc:res.grid.nc,nr:res.grid.nr,cs:res.grid.cs,xll:res.grid.xll,yll:res.grid.yll,
      crs:res.grid.crs,nodata:res.grid.nodata},
    classes:res.classes, breaks:res.breaks, ms:res.ms,
    nArea:res.nArea, nExcluded:res.nExcluded, ruleLog:res.ruleLog, warnings:res.warnings,
    maskNames:res._maskNames||[], layerId:res._layerId||null, rasterIds:res._rasterIds||[],
    ranking:(res.polys||[]).map((P,i)=>mcfPolyProps(P,MCF.state,res,i)),
    sensitivity:res.sensitivity?{n:res.sensitivity.n,pct:res.sensitivity.pct,critSens:res.sensitivity.critSens}:null};
}
(function mcfHookProject(){
  const basePD=window.projectData, baseLP=window.loadProject;
  if(typeof basePD==='function'){
    window.projectData=function(){
      const d=basePD.apply(this,arguments);
      try{ d.mcf={state:mcfSerializeState(MCF.state), summary:mcfSummary(MCF.last)}; }
      catch(e){ console.warn('MCF no projeto:',e); }
      return d;
    };
  }
  if(typeof baseLP==='function'){
    window.loadProject=function(d){
      const r=baseLP.apply(this,arguments);
      try{
        if(d&&d.mcf&&d.mcf.state){
          MCF.state=mcfMigrateState(d.mcf.state);
          MCF.last=null; MCF._summary=d.mcf.summary||null;
          if(MCF._summary) try{ cmdLog('Análise multicritério restaurada: '+
            MCF.state.criteria.length+' critério(s), '+MCF.state.masks.length+' máscara(s)','info'); }catch(e){}
        }else{ MCF.state=mcfNewState(); MCF.last=null; MCF._summary=null; }
        const bg=document.getElementById('mcfBg');
        if(bg&&bg.classList.contains('on')) mcfRender();
      }catch(e){ console.warn('MCF ao abrir o projeto:',e); }
      return r;
    };
  }
})();

/* ===========================================================================
   FAIXA (RIBBON) — entra em MEIO AMBIENTE e em GIS, sem tocar no que existe
   ========================================================================= */
(function mcfRibbon(){
  const ICON='mcf-multicriterio';
  if(typeof RIB_SVG!=='undefined'&&typeof _alagisIcon==='function'){
    try{
      RIB_SVG[ICON]=_alagisIcon('#1b5e20',
        '<path d="M4 26 8 8l7 4 6-6 7 8-3 12z" fill="@" opacity=".18"/>'+
        '<path d="M4 26 8 8l7 4 6-6 7 8-3 12z" stroke="@" stroke-width="1.9"/>'+
        '<path d="M8 8 14 20l8-14M14 20l11 6" opacity=".5"/>'+
        '<circle cx="14" cy="20" r="2.1" fill="@"/><circle cx="22" cy="6" r="1.6" fill="@"/>'+
        '<circle cx="25" cy="26" r="1.6" fill="@"/>');
    }catch(e){}
  }
  /* Dois pictogramas que faltavam na família ilustrada de MEIO AMBIENTE.
     Mesma gramática do restante do grupo (verde suave, contorno terroso,
     sombra curta) — misturar aqui o traço chapado do GIS destoaria. */
  if(typeof RIB_SVG!=='undefined'){
    const amb=(id,body)=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">'+
      '<defs><linearGradient id="'+id+'g" x1="0" y1="0" x2="1" y2="1">'+
      '<stop offset="0" stop-color="#E8F2D5"/><stop offset="1" stop-color="#8FB46B"/></linearGradient>'+
      '<linearGradient id="'+id+'s" x1="0" y1="0" x2="0" y2="1">'+
      '<stop offset="0" stop-color="#F7E8CB"/><stop offset="1" stop-color="#D5A86D"/></linearGradient>'+
      '<filter id="'+id+'d" x="-25%" y="-25%" width="150%" height="150%">'+
      '<feDropShadow dx="0" dy=".7" stdDeviation=".55" flood-color="#785A42" flood-opacity=".18"/></filter></defs>'+
      '<g stroke="#89684F" stroke-width="1.05" stroke-linecap="round" stroke-linejoin="round" filter="url(#'+id+'d)">'+
      body.replace(/@g/g,'url(#'+id+'g)').replace(/@s/g,'url(#'+id+'s)')+'</g></svg>';
    RIB_SVG.ambiente_mascaras=amb('fvamk',
      '<path d="m4 23 3-12 9-4 8 7-3 12-11 1z" fill="@g"/>'+
      '<path d="M20 12l7 2.5V21c0 4.2-3.3 6.4-7 7.6-3.7-1.2-7-3.4-7-7.6v-6.5z" fill="@s"/>'+
      '<path d="m16 18 8 6" stroke="#B0453A" stroke-width="2.1"/>');
    RIB_SVG.ambiente_pesos=amb('fvapw',
      '<path d="M16 6v19M10 27h12"/><path d="M5 11h22"/>'+
      '<path d="M5 11 1.5 18.5h7z" fill="@g"/><path d="M27 11l-3.5 7.5h7z" fill="@s"/>'+
      '<circle cx="16" cy="6" r="1.8" fill="@s"/>');
  }

  const abrirEm=tab=>()=>{ if(typeof switchView==='function') switchView('map'); mcfOpen(tab); };
  /* A ferramenta antiga (FV, escala 0/1/2) fazia exatamente estes cinco passos
     e a configuração dela nem sequer sobrevivia ao .ccmgis. Os botões passam a
     apontar para as etapas equivalentes do Multicritério; o motor e o painel
     do FV continuam no código e alcançáveis por window.abreFavorabilidade e
     pelo próprio painel de Fontes oficiais. */
  const PASSOS=[
    {ic:'ambiente_estudo',    nome:'Favorabilidade',     _mcf:1, act:abrirEm('grade')},
    {ic:'ambiente_criterios', nome:'Critérios',          _mcf:2, act:abrirEm('criterios')},
    {ic:'ambiente_mascaras',  nome:'Máscaras legais',    _mcf:3, act:abrirEm('mascaras')},
    {ic:'ambiente_pesos',     nome:'Pesos e cenários',   _mcf:4, act:abrirEm('pesos')},
    {ic:'ambiente_calcular',  nome:'Calcular',           _mcf:5, act:abrirEm('calculo')},
    {ic:'ambiente_poligonos', nome:'Áreas prioritárias', _mcf:6, act:abrirEm('resultados')},
    {ic:'ambiente_relatorio', nome:'Relatório',          _mcf:7, act:abrirEm('auditoria')}
  ];
  const FV_ICS=['ambiente_estudo','ambiente_criterios','ambiente_calcular',
                'ambiente_poligonos','ambiente_relatorio'];
  /* Idempotente de propósito: roda antes de cada ribbonBuild, então continua
     valendo mesmo que outro bloco reconstrua os grupos de MEIO AMBIENTE. */
  function mcfFixAmbiente(){
    if(typeof CATS==='undefined') return;
    const cat=CATS.find(c=>c.id==='ambiente');
    if(!cat||!Array.isArray(cat.grupos)) return;
    const antigo=i=>i&&FV_ICS.indexOf(i.ic)>=0&&!i._mcf;
    const meu=i=>i&&!!i._mcf;
    let pos=-1; const saida=[];
    cat.grupos.forEach(g=>{
      if(g.label==='Multicritério'){ if(pos<0) pos=saida.length; return; }
      const it=g.it||[], resto=it.filter(i=>!antigo(i)&&!meu(i));
      if(resto.length!==it.length && pos<0) pos=saida.length;
      if(resto.length) saida.push(Object.assign({},g,{it:resto}));
    });
    if(pos<0) pos=0;
    /* Um botão só. Os sete passos já são abas da própria janela (1 · Grade …
       7 · Auditoria) e o "Calcular" é o botão fixo do rodapé — sete ícones na
       faixa eram sete atalhos para a mesma janela. PASSOS segue inteiro: é o
       mapa passo→aba, usado por quem chamar mcfOpen('criterios') e afins. */
    saida.splice(pos,0,{label:'Multicritério',it:[Object.assign({},PASSOS[0],
      {desc:'Grade, critérios, máscaras legais, pesos e cenários, cálculo, '+
            'áreas prioritárias e auditoria — todas as etapas na mesma janela.'})]});
    cat.grupos=saida;
  }
  function mcfFixGis(){
    if(typeof CATS==='undefined') return;
    const cat=CATS.find(c=>c.id==='gis'); if(!cat) return;
    cat.grupos=cat.grupos||[];
    let g=cat.grupos.find(x=>x.label==='Multicritério');
    if(!g){ g={label:'Multicritério',it:[]}; cat.grupos.push(g); }
    if(!g.it.some(x=>x.ic===ICON))
      g.it.push({ic:ICON,nome:'Multicritério',act:abrirEm('grade')});
  }
  const baseBuild=window.ribbonBuild;
  if(typeof baseBuild==='function'){
    window.ribbonBuild=function(){
      try{ mcfFixAmbiente(); mcfFixGis(); }catch(e){ console.warn('MCF faixa:',e); }
      return baseBuild.apply(this,arguments);
    };
  }
  const instalar=()=>{ try{ if(typeof ribbonBuild==='function') ribbonBuild(); }catch(e){} };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',instalar,{once:true});
  else setTimeout(instalar,0);
  /* atalho de teclado no padrão dos demais: Ctrl+Shift+M */
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.shiftKey&&(e.key==='M'||e.key==='m')){
      e.preventDefault(); mcfOpen();
    }
  });
})();
/* ===========================================================================
   TESTES DE VALIDAÇÃO — rasters sintéticos, sem depender do projeto aberto.
   Rodam o MESMO núcleo do cálculo definitivo.
   ========================================================================= */
function mcfRunSync(job){
  const it=mcfLocalKernel().mcfRun(job);
  let s; while(!(s=it.next()).done){}
  return s.value;
}
function mcfTestGrid(nc,nr,cs){
  return {nc:nc||10,nr:nr||10,cs:cs||100,xll:0,yll:0,crs:'EPSG:31982',nodata:-9999};
}
function mcfSquare(x0,y0,x1,y1){ return {rings:[[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]],props:{}}; }
function mcfTestCrit(o){
  return Object.assign({id:'t'+Math.random().toString(36).slice(2,7),name:'crit',
    group:'Geological Prospectivity',weight:100,index:'geo',mandatory:false,confidence:'high',
    severe:false,severeAtOrBelow:1,method:'bool',rules:[],lookup:[],lookupFallback:null,
    lin:{min:0,max:1},piecewise:[],fuzzy:{type:'linear',a:0,b:1},
    boolInside:5,boolOutside:0,classField:'',overlap:'center',resample:'nearest',
    gtype:'polygon',feats:[],points:[],
    dist:{from:'boundary',insideZero:true,max:0,unit:'m'}},o);
}
function mcfTestJob(o){
  const G=(o&&o.grid)||mcfTestGrid();
  return Object.assign({
    grid:G, areaFeats:[mcfSquare(0,0,G.nc*G.cs,G.nr*G.cs)],
    criteria:[], masks:[],
    weighting:{mode:'renorm'}, confidenceApply:false,
    confidenceFactors:{high:1,medium:.85,low:.65},
    integration:{geo:.6,feas:.4},
    classification:{method:'fixed',classes:mcfDefaultClasses()},
    rules:{}, post:{minAreaHa:0,dropSmall:true,connectivity:8,polyClasses:[]},
    sensitivity:{enabled:false}
  },o||{});
}

function mcfSelfTest(){
  const T=[], near=(a,b,e)=>Math.abs(a-b)<=(e===undefined?1e-4:e);
  const ok=(nome,cond,det)=>T.push({nome,pass:!!cond,det:det||''});
  const G=mcfTestGrid(), FULL=mcfSquare(0,0,1000,1000);
  const at=(g,cx,cy)=>{ const c=Math.floor(cx/g.cs), r=g.nr-1-Math.floor(cy/g.cs); return r*g.nc+c; };

  /* 1 — soma ponderada conhecida: 5×60 + 0×40 = 300 ÷ 100 = 3,00 */
  try{
    const R=mcfRunSync(mcfTestJob({criteria:[
      mcfTestCrit({name:'A',weight:60,boolInside:5,feats:[FULL]}),
      mcfTestCrit({name:'B',weight:40,boolInside:0,feats:[FULL]})]}));
    const k=at(G,550,550);
    ok('1 · Soma ponderada conhecida (5×60 + 0×40)/100 = 3,00',
      near(R.integrated[k],3,1e-3),'obtido '+R.integrated[k].toFixed(4));
  }catch(e){ ok('1 · Soma ponderada conhecida',false,e.message); }

  /* 2 — normalização dos pesos */
  try{
    const st=mcfNewState();
    st.criteria=[mcfNewCriterion(),mcfNewCriterion(),mcfNewCriterion()];
    st.criteria[0].weight=30; st.criteria[1].weight=30; st.criteria[2].weight=30;
    st.criteria[2].locked=true;
    const sc=st.scenarios[0]; sc.weights={};
    st.criteria.forEach(c=>sc.weights[c.id]=c.weight);
    mcfNormalizeWeights(st);
    const W=mcfActiveWeights(st), tot=Object.values(W).reduce((s,v)=>s+v,0);
    ok('2 · Normalização dos pesos soma 100% e respeita o bloqueio',
      near(tot,100,1e-6)&&near(W[st.criteria[2].id],30,1e-6),
      'total '+tot.toFixed(4)+' · bloqueado '+W[st.criteria[2].id]);
  }catch(e){ ok('2 · Normalização dos pesos',false,e.message); }

  /* 3 — alinhamento da grade a múltiplos do tamanho de célula */
  try{
    const L={id:-991,name:'__mcf_test__',gtype:'polygon',crs:'EPSG:31982',visible:true,
      fields:[],features:[{geom:[[137,271],[1637,271],[1637,1271],[137,1271],[137,271]],multi:false,props:{}}],
      sym:{mode:'single',color:'#fff',classes:[],cats:[]},llayer:null};
    S.layers.unshift(L);
    const st=mcfNewState(); st.grid.areaLayerId=L.id; st.grid.crs='EPSG:31982';
    st.grid.cell=250; st.grid.align='grid';
    const r=mcfComputeGrid(st,null);
    S.layers=S.layers.filter(x=>x!==L);
    ok('3 · Alinhamento da grade (origem múltipla da célula)',
      r.ok&&r.grid.xll===0&&r.grid.yll===250&&r.grid.nc===7&&r.grid.nr===5,
      r.ok?('xll='+r.grid.xll+' yll='+r.grid.yll+' '+r.grid.nc+'×'+r.grid.nr):r.msg);
  }catch(e){ S.layers=S.layers.filter(x=>x.id!==-991); ok('3 · Alinhamento da grade',false,e.message); }

  /* 4 — propagação de NoData: strict devolve NoData, renorm usa só o válido */
  try{
    const buraco=mcfTestCrit({name:'lacuna',weight:50,method:'reclass',
      rules:[{min:5,max:9,score:5,incLow:true,incHigh:false}], feats:[FULL]});
    const bom=mcfTestCrit({name:'ok',weight:50,boolInside:4,feats:[FULL]});
    const k=at(G,550,550);
    const Rs=mcfRunSync(mcfTestJob({criteria:[buraco,bom],weighting:{mode:'strict'}}));
    const Rr=mcfRunSync(mcfTestJob({criteria:[JSON.parse(JSON.stringify(buraco)),
      JSON.parse(JSON.stringify(bom))],weighting:{mode:'renorm'}}));
    ok('4 · NoData — strict propaga, renorm recalcula o divisor',
      !isFinite(Rs.integrated[k]) && near(Rr.integrated[k],4,1e-3),
      'strict='+Rs.integrated[k]+' renorm='+Rr.integrated[k]);
  }catch(e){ ok('4 · Propagação de NoData',false,e.message); }

  /* 5 — máscara legal aplicada por multiplicação lógica */
  try{
    const R=mcfRunSync(mcfTestJob({
      criteria:[mcfTestCrit({name:'A',weight:100,boolInside:5,feats:[FULL]})],
      masks:[{id:'m1',name:'metade oeste',reason:'teste',gtype:'polygon',
        feats:[mcfSquare(0,0,500,1000)],overlap:'center',buffer:0,
        insideValue:0,outsideValue:1,invert:false,enabled:true}]}));
    const kw=at(G,250,550), ke=at(G,750,550);
    ok('5 · Máscara legal exclui a metade oeste e preserva a leste',
      R.legal[kw]===0 && R.legal[ke]===1 && R.classified[kw]===0 && R.classified[ke]===3,
      'oeste legal='+R.legal[kw]+' classe='+R.classified[kw]+
      ' · leste legal='+R.legal[ke]+' classe='+R.classified[ke]);
  }catch(e){ ok('5 · Aplicação da máscara',false,e.message); }

  /* 6 — reclassificação por intervalos (tabela de distância da metodologia) */
  try{
    const c=mcfTestCrit({method:'reclass',rules:[
      {min:0,max:2000,score:5,incLow:true,incHigh:false},
      {min:2000,max:5000,score:4,incLow:true,incHigh:false},
      {min:5000,max:10000,score:3,incLow:true,incHigh:false},
      {min:10000,max:20000,score:2,incLow:true,incHigh:false},
      {min:20000,max:null,score:1,incLow:true,incHigh:false}]});
    const n=mcfNormCrit(c);
    const casos=[[0,5],[1999,5],[2000,4],[4999.9,4],[5000,3],[10000,2],[20000,1],[999999,1]];
    const errado=casos.filter(([v,e])=>!near(mcfScoreOf(n,v),e,1e-6));
    ok('6 · Reclassificação por intervalos, inclusive nos limites',
      errado.length===0, errado.length?('falhou em '+JSON.stringify(errado)):'8 pontos conferidos');
  }catch(e){ ok('6 · Reclassificação por intervalos',false,e.message); }

  /* 7 — distância euclidiana a ponto, linha e polígono */
  try{
    const dist=(o)=>{
      const c=mcfTestCrit(Object.assign({method:'euclid',
        rules:[{min:null,max:null,score:5,incLow:true,incHigh:true}]},o));
      return mcfRunSync(mcfTestJob({criteria:[c]})).raw[0];
    };
    const dp=dist({gtype:'point',points:[[500,500]],dist:{from:'boundary',insideZero:false,max:0,unit:'m'}});
    const dl=dist({gtype:'line',feats:[{rings:[[[0,500],[1000,500]]],props:{}}],
      dist:{from:'boundary',insideZero:false,max:0,unit:'m'}});
    const dg=dist({gtype:'polygon',feats:[mcfSquare(200,200,800,800)],
      dist:{from:'boundary',insideZero:true,max:0,unit:'m'}});
    const kp=at(G,450,450), kl=at(G,150,450), ki=at(G,550,550), kf=at(G,50,50);
    const e1=near(dp[kp],Math.hypot(50,50),0.01);
    const e2=near(dl[kl],50,0.01);
    const e3=(dg[ki]===0)&&near(dg[kf],Math.hypot(150,150),0.01);
    ok('7 · Distância a ponto, linha e polígono (até o limite geométrico)',
      e1&&e2&&e3,'ponto '+dp[kp].toFixed(2)+' (esp. 70,71) · linha '+dl[kl].toFixed(2)+
      ' (esp. 50) · polígono interior '+dg[ki]+' · externo '+dg[kf].toFixed(2)+' (esp. 212,13)');
  }catch(e){ ok('7 · Rasters de distância',false,e.message); }

  /* 8 — células de borda recebem valor e não escapam da grade */
  try{
    const R=mcfRunSync(mcfTestJob({criteria:[mcfTestCrit({boolInside:5,feats:[FULL]})]}));
    const cantos=[at(G,50,50),at(G,950,50),at(G,50,950),at(G,950,950)];
    ok('8 · Células de borda classificadas corretamente',
      cantos.every(k=>R.classified[k]===3)&&R.nArea===100,
      'células na análise: '+R.nArea+' de 100');
  }catch(e){ ok('8 · Células de borda',false,e.message); }

  /* 9 — conversão para polígonos: duas manchas separadas continuam separadas */
  try{
    const R=mcfRunSync(mcfTestJob({
      criteria:[mcfTestCrit({name:'A',weight:100,method:'reclass',
        rules:[{min:0.5,max:null,score:5,incLow:true,incHigh:true},
               {min:null,max:0.5,score:1,incLow:true,incHigh:false}],
        gtype:'polygon',feats:[mcfSquare(0,0,200,200),mcfSquare(800,800,1000,1000)]})],
      post:{minAreaHa:0,dropSmall:true,connectivity:8,polyClasses:[3]}}));
    const P=R.polys.filter(p=>p.code===3);
    const areaOK=P.every(p=>near(p.areaHa,4,1e-6));      /* 4 células × 1 ha */
    const anelFechado=P.every(p=>p.parts.every(part=>part.every(ring=>
      ring.length>=5 && ring[0][0]===ring[ring.length-1][0] && ring[0][1]===ring[ring.length-1][1])));
    ok('9 · Poligonização: 2 manchas ⇒ 2 polígonos, anéis fechados, 4 ha cada',
      P.length===2&&areaOK&&anelFechado,
      P.length+' polígono(s) · áreas '+P.map(p=>p.areaHa.toFixed(2)).join(', '));
  }catch(e){ ok('9 · Conversão para polígonos',false,e.message); }

  /* 10 — ranking em ordem decrescente da nota integrada */
  try{
    const R=mcfRunSync(mcfTestJob({
      criteria:[mcfTestCrit({name:'A',weight:100,method:'reclass',
        rules:[{min:1.5,max:null,score:5,incLow:true,incHigh:true},
               {min:0.5,max:1.5,score:3.5,incLow:true,incHigh:false},
               {min:null,max:0.5,score:1,incLow:true,incHigh:false}],
        gtype:'polygon',
        feats:[Object.assign(mcfSquare(0,0,200,200),{}),
               Object.assign(mcfSquare(0,0,200,200),{}),   /* 2 sobreposições ⇒ ainda 1 */
               mcfSquare(800,800,1000,1000)]})],
      post:{minAreaHa:0,dropSmall:true,connectivity:8,polyClasses:[]}}));
    const rk=R.polys.map(p=>p.rank);
    const desc=R.polys.every((p,i)=>i===0||!(R.polys[i-1].meanInteg<p.meanInteg-1e-9));
    ok('10 · Ranking numerado 1..n e ordenado pela nota integrada',
      rk.join(',')===rk.map((_,i)=>i+1).join(',')&&desc,
      R.polys.length+' polígono(s): '+R.polys.map(p=>p.rank+'='+p.meanInteg.toFixed(2)).join(' '));
  }catch(e){ ok('10 · Ranking dos polígonos',false,e.message); }

  /* 11 — configuração sobrevive a serializar/reabrir (o mesmo caminho do .ccmgis) */
  try{
    const st=mcfNewState();
    st.criteria=[mcfNewCriterion()]; st.criteria[0].name='Geologia'; st.criteria[0].weight=42;
    st.criteria[0].rules=[{min:0,max:100,score:5,incLow:true,incHigh:false}];
    st.masks=[mcfNewMask('TI','art. 231')];
    st.integration.geo=0.7; st.integration.feas=0.3;
    st.classification.classes[2].min=4.25;
    const round=mcfMigrateState(JSON.parse(JSON.stringify(mcfSerializeState(st))));
    ok('11 · Salvar e reabrir a configuração sem perda',
      round.criteria.length===1&&round.criteria[0].weight===42&&
      round.criteria[0].rules[0].score===5&&round.masks.length===1&&
      round.masks[0].reason==='art. 231'&&near(round.integration.geo,0.7)&&
      near(round.classification.classes[2].min,4.25),
      'peso '+round.criteria[0].weight+' · fator geo '+round.integration.geo);
  }catch(e){ ok('11 · Persistência da configuração',false,e.message); }

  /* 13 — análise de sensibilidade produz estabilidade em 0..1 */
  try{
    const R=mcfRunSync(mcfTestJob({
      criteria:[mcfTestCrit({name:'A',weight:60,boolInside:5,feats:[FULL]}),
                mcfTestCrit({name:'B',weight:40,boolInside:2,feats:[FULL]})],
      sensitivity:{enabled:true,pct:10,n:6}}));
    const s=R.sensitivity;
    let fora=0;
    for(let i=0;i<s.stability.length;i++){ const v=s.stability[i];
      if(isFinite(v)&&(v<0||v>1)) fora++; }
    ok('13 · Sensibilidade: mapa de estabilidade dentro de 0..1',
      !!s&&s.n===6&&fora===0,'n='+(s&&s.n)+' · valores fora da faixa: '+fora);
  }catch(e){ ok('13 · Análise de sensibilidade',false,e.message); }

  /* 14 — TESTE OBRIGATÓRIO da metodologia:
     geologia 5 + logística 5, mas máscara legal 0 ⇒ o resultado TEM de ser Excluded */
  try{
    const R=mcfRunSync(mcfTestJob({
      criteria:[
        mcfTestCrit({name:'Geologia',group:'Geological Prospectivity',weight:50,boolInside:5,feats:[FULL]}),
        mcfTestCrit({name:'Logística',group:'Infrastructure and Logistics',weight:50,boolInside:5,feats:[FULL]})],
      masks:[{id:'mx',name:'Terra indígena',reason:'CF art. 231',gtype:'polygon',
        feats:[mcfSquare(400,400,600,600)],overlap:'center',buffer:0,
        insideValue:0,outsideValue:1,invert:false,enabled:true}]}));
    const kEx=at(G,550,550), kLivre=at(G,150,150);
    ok('14 · OBRIGATÓRIO — geologia 5 e logística 5 com máscara 0 ⇒ Excluded',
      R.classified[kEx]===0 && R.legal[kEx]===0 && R.classified[kLivre]===3,
      'célula mascarada: classe='+R.classified[kEx]+' (0 = Excluded) · célula livre: classe='+
      R.classified[kLivre]+' (3 = Highly Favorable)');
  }catch(e){ ok('14 · Exclusão legal prevalece sobre nota alta',false,e.message); }

  /* 12 — cancelamento (assíncrono; concluído depois da janela abrir) */
  const box=mcfShowTests(T,true);
  const job=mcfTestJob({grid:mcfTestGrid(220,220,10),
    criteria:[mcfTestCrit({name:'A',weight:100,method:'euclid',gtype:'polygon',
      feats:[mcfSquare(300,300,900,900)],dist:{from:'boundary',insideZero:true,max:0,unit:'m'},
      rules:[{min:null,max:null,score:5,incLow:true,incHigh:true}]})],
    sensitivity:{enabled:true,pct:10,n:60}});
  const run=mcfExecute(job,()=>{});
  setTimeout(()=>run.cancel(),120);
  run.promise.then(
    ()=>{ T.push({nome:'12 · Cancelamento interrompe o processamento',pass:false,det:'o cálculo terminou apesar do cancelamento'}); mcfShowTests(T,false,box); },
    e=>{ T.push({nome:'12 · Cancelamento interrompe o processamento',pass:/cancelad/i.test(e.message||''),det:e.message}); mcfShowTests(T,false,box); }
  );
  return T;
}
function mcfShowTests(T,parcial,existing){
  let bg=existing;
  if(!bg){
    bg=document.createElement('div'); bg.className='modal-bg on';
    bg.innerHTML='<div class="modal" style="width:min(880px,100%)">'+
      '<div class="modal-h"><b>⚙ Testes de validação — análise multicritério</b>'+
      '<div style="flex:1"></div><span class="mcf-x" id="tzX">✕</span></div>'+
      '<div class="modal-b" id="tzB"></div></div>';
    document.body.appendChild(bg);
    bg.querySelector('#tzX').onclick=()=>bg.remove();
    bg.addEventListener('mousedown',e=>{ if(e.target===bg) bg.remove(); });
  }
  const nOK=T.filter(t=>t.pass).length;
  bg.querySelector('#tzB').innerHTML=
    '<div class="'+(nOK===T.length&&!parcial?'mcf-ok':(T.some(t=>!t.pass)?'mcf-err':'mcf-warn'))+'">'+
      '<b>'+nOK+' de '+T.length+' testes aprovados</b>'+(parcial?' — o teste de cancelamento roda em segundo plano…':'')+'</div>'+
    '<table class="mcf-tbl"><thead><tr><th>—</th><th class="l">Teste</th><th class="l">Detalhe</th></tr></thead><tbody>'+
    T.map(t=>'<tr><td style="color:'+(t.pass?'#2e9e4f':'#e05252')+'">'+(t.pass?'✓':'✕')+'</td>'+
      '<td class="l">'+mcfEsc(t.nome)+'</td><td class="l">'+mcfEsc(t.det)+'</td></tr>').join('')+
    '</tbody></table>'+
    '<div class="hint" style="margin-top:8px">Os testes usam rasters sintéticos de 10×10 células de 100 m e o mesmo núcleo de cálculo da ferramenta. Nenhuma camada do projeto é alterada.</div>';
  return bg;
}
window.mcfSelfTest=mcfSelfTest;
})();
