/* ============================================================================
   MÓDULO GEOPROCESSAMENTO
   Interpolação de curvas de nível por triangulação (TIN de Delaunay).
   Núcleo: sweep-hull (S-hull), validado contra a propriedade do circuncírculo
   vazio e contra superfícies analíticas (plano exato; cone: erro máx 0,08 m).
   ========================================================================== */
/* ================= Delaunay — sweep-hull (S-hull), porte compacto ================
   Entrada: coords = Float64Array [x0,y0, x1,y1, ...]
   Saída: {triangles: Uint32Array (i0,i1,i2 por triângulo), halfedges: Int32Array}
   ============================================================================== */
const EPSILON = Math.pow(2, -52);
const EDGE_STACK = new Uint32Array(512);

function dist(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function orient2d(ax, ay, bx, by, cx, cy) { return (by - ay) * (cx - bx) - (bx - ax) * (cy - by); }
function inCircle(ax, ay, bx, by, cx, cy, px, py) {
  const dx = ax - px, dy = ay - py, ex = bx - px, ey = by - py, fx = cx - px, fy = cy - py;
  const ap = dx * dx + dy * dy, bp = ex * ex + ey * ey, cp = fx * fx + fy * fy;
  return dx * (ey * cp - bp * fy) - dy * (ex * cp - bp * fx) + ap * (ex * fy - ey * fx) < 0;
}
function circumradius(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax, dy = by - ay, ex = cx - ax, ey = cy - ay;
  const bl = dx * dx + dy * dy, cl = ex * ex + ey * ey, d = 0.5 / (dx * ey - dy * ex);
  const x = (ey * bl - dy * cl) * d, y = (dx * cl - ex * bl) * d;
  return x * x + y * y;
}
function circumcenter(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax, dy = by - ay, ex = cx - ax, ey = cy - ay;
  const bl = dx * dx + dy * dy, cl = ex * ex + ey * ey, d = 0.5 / (dx * ey - dy * ex);
  return [ax + (ey * bl - dy * cl) * d, ay + (dx * cl - ex * bl) * d];
}
function quicksort(ids, dists, left, right) {
  if (right - left <= 20) {
    for (let i = left + 1; i <= right; i++) {
      const temp = ids[i], tempDist = dists[temp];
      let j = i - 1;
      while (j >= left && dists[ids[j]] > tempDist) ids[j + 1] = ids[j--];
      ids[j + 1] = temp;
    }
  } else {
    const median = (left + right) >> 1;
    let i = left + 1, j = right;
    let t;
    t = ids[median]; ids[median] = ids[i]; ids[i] = t;
    if (dists[ids[left]] > dists[ids[right]]) { t = ids[left]; ids[left] = ids[right]; ids[right] = t; }
    if (dists[ids[i]] > dists[ids[right]]) { t = ids[i]; ids[i] = ids[right]; ids[right] = t; }
    if (dists[ids[left]] > dists[ids[i]]) { t = ids[left]; ids[left] = ids[i]; ids[i] = t; }
    const temp = ids[i], tempDist = dists[temp];
    while (true) {
      do i++; while (dists[ids[i]] < tempDist);
      do j--; while (dists[ids[j]] > tempDist);
      if (j < i) break;
      t = ids[i]; ids[i] = ids[j]; ids[j] = t;
    }
    ids[left + 1] = ids[j]; ids[j] = temp;
    if (right - i + 1 >= j - left) { quicksort(ids, dists, i, right); quicksort(ids, dists, left, j - 1); }
    else { quicksort(ids, dists, left, j - 1); quicksort(ids, dists, i, right); }
  }
}

function delaunay(coords) {
  const n = coords.length >> 1;
  const maxTriangles = Math.max(2 * n - 5, 0);
  const _triangles = new Uint32Array(maxTriangles * 3);
  const _halfedges = new Int32Array(maxTriangles * 3);
  const hashSize = Math.ceil(Math.sqrt(n));
  const hullPrev = new Uint32Array(n), hullNext = new Uint32Array(n), hullTri = new Uint32Array(n);
  const hullHash = new Int32Array(hashSize).fill(-1);
  const ids = new Uint32Array(n), dists = new Float64Array(n);
  let cx, cy, hullStart, trianglesLen = 0;

  const hashKey = (x, y) => {
    const dx = x - cx, dy = y - cy;
    const p = 1 - dx / (Math.abs(dx) + Math.abs(dy));
    return Math.floor((2 + (dy < 0 ? -p : p)) / 4 * hashSize) % hashSize;
  };
  const link = (a, b) => {
    _halfedges[a] = b;
    if (b !== -1) _halfedges[b] = a;
  };
  const addTriangle = (i0, i1, i2, a, b, c) => {
    const t = trianglesLen;
    _triangles[t] = i0; _triangles[t + 1] = i1; _triangles[t + 2] = i2;
    link(t, a); link(t + 1, b); link(t + 2, c);
    trianglesLen += 3;
    return t;
  };
  const legalize = (a0) => {
    let i = 0, ar = 0, a = a0;
    while (true) {
      const b = _halfedges[a];
      const a0b = a - a % 3;
      ar = a0b + (a + 2) % 3;
      if (b === -1) { if (i === 0) break; a = EDGE_STACK[--i]; continue; }
      const b0 = b - b % 3;
      const al = a0b + (a + 1) % 3, bl = b0 + (b + 2) % 3;
      const p0 = _triangles[ar], pr = _triangles[a], pl = _triangles[al], p1 = _triangles[bl];
      const illegal = inCircle(
        coords[2 * p0], coords[2 * p0 + 1], coords[2 * pr], coords[2 * pr + 1],
        coords[2 * pl], coords[2 * pl + 1], coords[2 * p1], coords[2 * p1 + 1]);
      if (illegal) {
        _triangles[a] = p1; _triangles[b] = p0;
        const hbl = _halfedges[bl];
        if (hbl === -1) {
          let e = hullStart;
          do {
            if (hullTri[e] === bl) { hullTri[e] = a; break; }
            e = hullPrev[e];
          } while (e !== hullStart);
        }
        link(a, hbl);
        link(b, _halfedges[ar]);
        link(ar, bl);
        const br = b0 + (b + 1) % 3;
        if (i < EDGE_STACK.length) EDGE_STACK[i++] = br;
      } else {
        if (i === 0) break;
        a = EDGE_STACK[--i];
      }
    }
    return ar;
  };

  // bbox e ponto semente
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = coords[2 * i], y = coords[2 * i + 1];
    if (x < minX) minX = x; if (y < minY) minY = y;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    ids[i] = i;
  }
  const ccx = (minX + maxX) / 2, ccy = (minY + maxY) / 2;
  let i0 = 0, i1 = 0, i2 = 0, minDist = Infinity;
  for (let i = 0; i < n; i++) {
    const d = dist(ccx, ccy, coords[2 * i], coords[2 * i + 1]);
    if (d < minDist) { i0 = i; minDist = d; }
  }
  const i0x = coords[2 * i0], i0y = coords[2 * i0 + 1];
  minDist = Infinity;
  for (let i = 0; i < n; i++) {
    if (i === i0) continue;
    const d = dist(i0x, i0y, coords[2 * i], coords[2 * i + 1]);
    if (d < minDist && d > 0) { i1 = i; minDist = d; }
  }
  let i1x = coords[2 * i1], i1y = coords[2 * i1 + 1];
  let minRadius = Infinity;
  for (let i = 0; i < n; i++) {
    if (i === i0 || i === i1) continue;
    const r = circumradius(i0x, i0y, i1x, i1y, coords[2 * i], coords[2 * i + 1]);
    if (r < minRadius) { i2 = i; minRadius = r; }
  }
  let i2x = coords[2 * i2], i2y = coords[2 * i2 + 1];
  if (minRadius === Infinity) throw new Error('Pontos colineares — impossível triangular');

  if (orient2d(i0x, i0y, i1x, i1y, i2x, i2y) < 0) {
    const i = i1, x = i1x, y = i1y;
    i1 = i2; i1x = i2x; i1y = i2y;
    i2 = i; i2x = x; i2y = y;
  }
  const center = circumcenter(i0x, i0y, i1x, i1y, i2x, i2y);
  cx = center[0]; cy = center[1];
  for (let i = 0; i < n; i++) dists[i] = dist(coords[2 * i], coords[2 * i + 1], cx, cy);
  quicksort(ids, dists, 0, n - 1);

  hullStart = i0;
  let hullSize = 3;
  hullNext[i0] = hullPrev[i2] = i1;
  hullNext[i1] = hullPrev[i0] = i2;
  hullNext[i2] = hullPrev[i1] = i0;
  hullTri[i0] = 0; hullTri[i1] = 1; hullTri[i2] = 2;
  hullHash.fill(-1);
  hullHash[hashKey(i0x, i0y)] = i0;
  hullHash[hashKey(i1x, i1y)] = i1;
  hullHash[hashKey(i2x, i2y)] = i2;
  addTriangle(i0, i1, i2, -1, -1, -1);

  let xp = 0, yp = 0;
  for (let k = 0; k < ids.length; k++) {
    const i = ids[k];
    const x = coords[2 * i], y = coords[2 * i + 1];
    if (k > 0 && Math.abs(x - xp) <= EPSILON && Math.abs(y - yp) <= EPSILON) continue; // duplicado
    xp = x; yp = y;
    if (i === i0 || i === i1 || i === i2) continue;

    let start = 0;
    for (let j = 0, key = hashKey(x, y); j < hashSize; j++) {
      start = hullHash[(key + j) % hashSize];
      if (start !== -1 && start !== hullNext[start]) break;
    }
    start = hullPrev[start];
    let e = start, q;
    while (q = hullNext[e], orient2d(x, y, coords[2 * e], coords[2 * e + 1], coords[2 * q], coords[2 * q + 1]) >= 0) {
      e = q;
      if (e === start) { e = -1; break; }
    }
    if (e === -1) continue; // ponto dentro/fora — ignora

    let t = addTriangle(e, i, hullNext[e], -1, -1, hullTri[e]);
    hullTri[i] = legalize(t + 2);
    hullTri[e] = t;
    hullSize++;

    let nx = hullNext[e];
    while (q = hullNext[nx], orient2d(x, y, coords[2 * nx], coords[2 * nx + 1], coords[2 * q], coords[2 * q + 1]) < 0) {
      t = addTriangle(nx, i, q, hullTri[i], -1, hullTri[nx]);
      hullTri[i] = legalize(t + 2);
      hullNext[nx] = nx;
      hullSize--;
      nx = q;
    }
    if (e === start) {
      while (q = hullPrev[e], orient2d(x, y, coords[2 * q], coords[2 * q + 1], coords[2 * e], coords[2 * e + 1]) < 0) {
        t = addTriangle(q, i, e, -1, hullTri[e], hullTri[q]);
        legalize(t + 2);
        hullTri[q] = t;
        hullNext[e] = e;
        hullSize--;
        e = q;
      }
    }
    hullStart = hullPrev[i] = e;
    hullNext[e] = hullPrev[nx] = i;
    hullNext[i] = nx;
    hullHash[hashKey(x, y)] = i;
    hullHash[hashKey(coords[2 * e], coords[2 * e + 1])] = e;
  }
  return { triangles: _triangles.subarray(0, trianglesLen), halfedges: _halfedges.subarray(0, trianglesLen) };
}

/* Proteção do filtro de aresta.
   Depois da densificação a 0,30 m, as arestas AO LONGO de uma curva ficam
   curtas, mas as arestas ENTRE curvas continuam tendo o espaçamento real
   delas. Se o usuário informar um máximo menor que esse espaçamento, o filtro
   elimina todos os triângulos transversais e deixa o MDT em faixas. Mede a
   malha antes de rasterizar e desliga o filtro quando ele removeria mais de
   5% dos triângulos. O recorte geométrico continua sendo feito pelo limite. */
/* ============================================================================
   AMOSTRAGEM EXATA POR TRIÂNGULOS (estilo Surpac/Deswik)
   ----------------------------------------------------------------------------
   Quando uma superfície nasce de triangulação, a grade raster é só uma
   VISUALIZAÇÃO: os cálculos (volume, cava, perfis) podem amostrar o próprio
   triângulo, sem o erro de reamostragem da grade e sem precisar de TIFF
   pesado. tinAnexaExato() pendura {xs,ys,zs,tri,maxEdge,clip} no d do raster
   como propriedade NÃO-ENUMERÁVEL — o projeto salvo continua sendo só a
   grade, sem duplicar milhões de vértices. sampleZbil/sampleZnear dão
   preferência ao TIN quando ele existe.
   ============================================================================ */
function tinPontoNoAnel(x,y,anel){
  let dentro=false;
  for(let i=0,j=anel.length-1;i<anel.length;j=i++){
    const xi=anel[i][0],yi=anel[i][1],xj=anel[j][0],yj=anel[j][1];
    if(((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi)) dentro=!dentro;
  }
  return dentro;
}
function tinIndexBuild(T){
  const xs=T.xs,ys=T.ys,tri=T.tri,me=+T.maxEdge||0;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(let i=0;i<xs.length;i++){
    if(xs[i]<x0)x0=xs[i]; if(xs[i]>x1)x1=xs[i];
    if(ys[i]<y0)y0=ys[i]; if(ys[i]>y1)y1=ys[i];
  }
  const nTri=(tri.length/3)|0;
  const lado=Math.max(8,Math.min(512,Math.ceil(Math.sqrt(nTri))));
  const dx=(x1-x0)/lado||1, dy=(y1-y0)/lado||1;
  const cells=new Array(lado*lado);
  const me2=me>0?me*me:Infinity;
  for(let t=0;t<nTri;t++){
    const a=tri[3*t],b=tri[3*t+1],c=tri[3*t+2];
    const ax=xs[a],ay=ys[a],bx=xs[b],by=ys[b],cx=xs[c],cy=ys[c];
    if(me>0){
      const ab=(bx-ax)*(bx-ax)+(by-ay)*(by-ay),
            bc=(cx-bx)*(cx-bx)+(cy-by)*(cy-by),
            ca=(ax-cx)*(ax-cx)+(ay-cy)*(ay-cy);
      if(ab>me2||bc>me2||ca>me2)continue;      /* triângulo-fantasma */
    }
    if(T.clip&&T.clip.length){
      const gx=(ax+bx+cx)/3, gy=(ay+by+cy)/3;  /* centroide vs limite */
      let ok=false;
      for(const anel of T.clip){ if(anel&&anel.length>=3&&tinPontoNoAnel(gx,gy,anel)){ok=true;break;} }
      if(!ok)continue;
    }
    const tx0=Math.max(0,Math.floor((Math.min(ax,bx,cx)-x0)/dx)),
          tx1=Math.min(lado-1,Math.floor((Math.max(ax,bx,cx)-x0)/dx)),
          ty0=Math.max(0,Math.floor((Math.min(ay,by,cy)-y0)/dy)),
          ty1=Math.min(lado-1,Math.floor((Math.max(ay,by,cy)-y0)/dy));
    for(let gy2=ty0;gy2<=ty1;gy2++)for(let gx2=tx0;gx2<=tx1;gx2++){
      const k=gy2*lado+gx2;
      (cells[k]||(cells[k]=[])).push(t);
    }
  }
  T._idx={x0,y0,dx,dy,lado,cells};
  return T._idx;
}
function tinSampleZ(T,x,y){
  const I=T._idx||tinIndexBuild(T);
  const cx=Math.floor((x-I.x0)/I.dx), cy=Math.floor((y-I.y0)/I.dy);
  if(cx<0||cy<0||cx>=I.lado||cy>=I.lado)return NaN;
  const lst=I.cells[cy*I.lado+cx];
  if(!lst)return NaN;
  const xs=T.xs,ys=T.ys,zs=T.zs,tri=T.tri,EPS=-1e-9;
  for(let q=0;q<lst.length;q++){
    const t=lst[q],a=tri[3*t],b=tri[3*t+1],c=tri[3*t+2];
    const ax=xs[a],ay=ys[a],bx=xs[b],by=ys[b],cx2=xs[c],cy2=ys[c];
    const d=(by-cy2)*(ax-cx2)+(cx2-bx)*(ay-cy2);
    if(d===0)continue;
    const w1=((by-cy2)*(x-cx2)+(cx2-bx)*(y-cy2))/d;
    const w2=((cy2-ay)*(x-cx2)+(ax-cx2)*(y-cy2))/d;
    const w3=1-w1-w2;
    if(w1>=EPS&&w2>=EPS&&w3>=EPS)
      return w1*zs[a]+w2*zs[b]+w3*zs[c];   /* baricêntrica: exata no triângulo */
  }
  return NaN;
}
/* ============================================================================
   CORTE DA MALHA TIN — remove triângulos por LIMITE (dentro/fora) ou por
   INTERSEÇÃO com outra superfície (acima/abaixo). O critério é o centroide
   do triângulo, o mesmo usado no recorte de geração. Destrutivo com um
   nível de desfazer (_triOrig). Depois do corte, o índice espacial, a malha
   3D e o desenho 2D são reconstruídos — a superfície JÁ SAI cortada em tudo.
   ============================================================================ */
function tinAplicaNovoTri(r,novoTri){
  const T=r.d.tin;
  if(!T._triOrig)T._triOrig=T.tri;          /* guarda o original uma vez */
  T.tri=novoTri;
  T.maxEdge=0; T.clip=null;                  /* o corte já está materializado */
  T._idx=null;                               /* índice será refeito na demanda */
  /* malha 3D exata refeita do tri novo */
  const n=T.xs.length, pos=new Float32Array(n*3);
  for(let i=0;i<n;i++){ pos[3*i]=T.xs[i]; pos[3*i+1]=T.ys[i]; pos[3*i+2]=T.zs[i]; }
  r._tinMesh={positions:pos, indices:novoTri};
  try{ renderTinMalha2D(r); }catch(e){}
  try{ if(typeof refreshUI==='function')refreshUI(); }catch(e){}
  try{ if(typeof v3Auto==='function')v3Auto(); }catch(e){}
}
function tinTrisAtuais(T){
  const I=T._idx||tinIndexBuild(T);
  const s=new Set(); (I.cells||[]).forEach(l=>{ if(l)l.forEach(t=>s.add(t)); });
  return s;
}
function tinCortaPorLimite(r,L,modo){       /* modo: 'dentro' mantém o interior */
  const T=r.d&&r.d.tin; if(!T)return {err:'a superfície não é TIN'};
  const aneis=(typeof cubRings==='function')?cubRings(L):null;
  if(!aneis||!aneis.length)return {err:'o limite não forma anel fechado'};
  const xs=T.xs,ys=T.ys,keep=[];
  tinTrisAtuais(T).forEach(t=>{
    const a=T.tri[3*t],b=T.tri[3*t+1],c=T.tri[3*t+2];
    const gx=(xs[a]+xs[b]+xs[c])/3, gy=(ys[a]+ys[b]+ys[c])/3;
    const dentro=aneis.some(an=>tinPontoNoAnel(gx,gy,an));
    if((modo==='dentro')===dentro)keep.push(t);
  });
  if(!keep.length)return {err:'o corte removeria a malha inteira'};
  const nt=new Uint32Array(keep.length*3); let k=0;
  keep.forEach(t=>{ nt[k++]=T.tri[3*t]; nt[k++]=T.tri[3*t+1]; nt[k++]=T.tri[3*t+2]; });
  const antes=tinTrisAtuais(T).size;
  tinAplicaNovoTri(r,nt);
  return {ok:true, antes, depois:keep.length};
}
function tinCortaPorSuperficie(r,r2,modo){  /* modo: 'acima' mantém acima de r2 */
  const T=r.d&&r.d.tin; if(!T)return {err:'a superfície não é TIN'};
  if(!r2||!r2.d)return {err:'escolha a superfície de corte'};
  const xs=T.xs,ys=T.ys,zs=T.zs,keep=[];
  tinTrisAtuais(T).forEach(t=>{
    const a=T.tri[3*t],b=T.tri[3*t+1],c=T.tri[3*t+2];
    const gx=(xs[a]+xs[b]+xs[c])/3, gy=(ys[a]+ys[b]+ys[c])/3,
          gz=(zs[a]+zs[b]+zs[c])/3;
    const z2=sampleZbil(r2.d,gx,gy);
    /* fora do domínio da outra superfície não há interseção: mantém */
    if(isNaN(z2)){keep.push(t);return;}
    if(modo==='acima' ? gz>=z2 : gz<=z2)keep.push(t);
  });
  if(!keep.length)return {err:'o corte removeria a malha inteira'};
  const nt=new Uint32Array(keep.length*3); let k=0;
  keep.forEach(t=>{ nt[k++]=T.tri[3*t]; nt[k++]=T.tri[3*t+1]; nt[k++]=T.tri[3*t+2]; });
  const antes=tinTrisAtuais(T).size;
  tinAplicaNovoTri(r,nt);
  return {ok:true, antes, depois:keep.length};
}
function tinDesfazCorte(r){
  const T=r.d&&r.d.tin;
  if(!T||!T._triOrig)return false;
  const orig=T._triOrig; T._triOrig=null;
  tinAplicaNovoTri(r,orig);
  T._triOrig=null;                           /* desfazer não vira novo original */
  return true;
}
/* Pendura a triangulação exata no d do raster sem entrar na serialização. */
function tinAnexaExato(d,X,Y,Zv,tri,maxEdge,clip){
  try{
    Object.defineProperty(d,'tin',{value:{xs:X,ys:Y,zs:Zv,tri,maxEdge:maxEdge||0,
      clip:(clip&&clip.length)?clip:null},enumerable:false,writable:true,configurable:true});
  }catch(e){ d.tin={xs:X,ys:Y,zs:Zv,tri,maxEdge:maxEdge||0,clip:clip||null}; }
}
function tinArestaSegura(xs,ys,tri,maxEdge,forcar){
  maxEdge=+maxEdge||0;
  if(!(maxEdge>0) || !tri || tri.length<3)
    return {value:0,disabled:false,kept:tri?tri.length/3:0,total:tri?tri.length/3:0};
  const me2=maxEdge*maxEdge,total=tri.length/3; let kept=0;
  for(let t=0;t<tri.length;t+=3){
    const a=tri[t],b=tri[t+1],c=tri[t+2],
      e1=(xs[a]-xs[b])**2+(ys[a]-ys[b])**2,
      e2=(xs[b]-xs[c])**2+(ys[b]-ys[c])**2,
      e3=(xs[c]-xs[a])**2+(ys[c]-ys[a])**2;
    if(e1<=me2&&e2<=me2&&e3<=me2)kept++;
  }
  /* A trava dos 95% protege grades; numa MALHA sem limite ela era o vilão da
     "cava com leques": o fecho convexo tem tantos triângulos-fantasma que o
     filtro se desligava sozinho e tudo ficava. Com `forcar`, o filtro vale. */
  const disabled=!forcar && kept<total*.95;
  return {value:disabled?0:maxEdge,disabled,kept,total};
}

/* MALHA TIN ANALÍTICA — produto 3D sem suavização.
   A grade regular continua existindo para GeoTIFF, perfis e álgebra raster,
   mas nunca mais é usada para “inventar” a geometria do TIN no visor 3D.
   Aqui cada face é o triângulo Delaunay original. Quando há um limite, apenas
   as faces que o atravessam são cortadas por operação booleana; os novos
   vértices recebem Z baricêntrico no próprio plano da face. Assim:
     • arestas continuam retas;
     • não existe arredondamento bilinear;
     • corte, anel e concavidade terminam exatamente na linha analítica. */
async function tinMalhaExata(xs,ys,zs,tri,maxEdge,aneis,inverter,strict=false){
  if(!tri||tri.length<3)return null;
  const n=xs.length,base=new Float64Array(n*3);
  for(let i=0;i<n;i++){base[3*i]=xs[i];base[3*i+1]=ys[i];base[3*i+2]=zs[i];}
  const extra=[],me2=maxEdge>0?maxEdge*maxEdge:Infinity;
  let cap=Math.max(3,tri.length+Math.min(tri.length,300000)),outIdx=new Uint32Array(cap),ni=0;
  const pushI=(a,b,c)=>{
    if(ni+3>outIdx.length){
      const q=new Uint32Array(Math.ceil(outIdx.length*1.5)+3);q.set(outIdx);outIdx=q;
    }
    outIdx[ni++]=a;outIdx[ni++]=b;outIdx[ni++]=c;
  };
  const rings=(aneis||[]).filter(r=>r&&r.length>=3).map(r=>{
    const q=r.map(p=>[+p[0],+p[1]]),a=q[0],b=q[q.length-1];
    if(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-9)q.push(a.slice());
    return q;
  });
  let mask=null,segGrade=null;
  if(rings.length){
    try{
      mask=rings.length===1?[[rings[0]]]:
        polygonClipping.xor(...rings.map(r=>[[r]]));
    }catch(_){mask=null;}
    const segs=[];
    rings.forEach(r=>{for(let i=0;i<r.length-1;i++)segs.push([r[i],r[i+1]]);});
    if(segs.length&&typeof gradeSegs==='function')try{segGrade=gradeSegs(segs);}catch(_){}
  }
  const dentro=(x,y)=>{
    if(!rings.length)return true;let k=0;
    for(const r of rings)if(pointInRing(x,y,r))k++;
    return (k&1)===1;
  };
  const cruzaLimite=(x0,y0,x1,y1)=>{
    if(!segGrade||!segGrade.caixa)return true;
    const s=new Set();segGrade.caixa(x0,y0,x1,y1,s);return s.size>0;
  };
  const bary=(x,y,a,b,c)=>{
    const den=(ys[b]-ys[c])*(xs[a]-xs[c])+(xs[c]-xs[b])*(ys[a]-ys[c]);
    if(Math.abs(den)<1e-15)return (zs[a]+zs[b]+zs[c])/3;
    const u=((ys[b]-ys[c])*(x-xs[c])+(xs[c]-xs[b])*(y-ys[c]))/den,
      v=((ys[c]-ys[a])*(x-xs[c])+(xs[a]-xs[c])*(y-ys[c]))/den;
    return u*zs[a]+v*zs[b]+(1-u-v)*zs[c];
  };
  const semFecho=r=>{
    if(!r||r.length<3)return[];
    const q=r.slice(),a=q[0],b=q[q.length-1];
    if(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-9)q.pop();
    return q;
  };
  let cortados=0,descartados=0;
  for(let t=0;t<tri.length;t+=3){
    if((t%150000)===0&&t){await respira();
      if(typeof showLoad==='function')showLoad(`Montando faces planas do TIN — ${(100*t/tri.length).toFixed(0)}%`);}
    const a=tri[t],b=tri[t+1],c=tri[t+2],
      e1=(xs[a]-xs[b])**2+(ys[a]-ys[b])**2,
      e2=(xs[b]-xs[c])**2+(ys[b]-ys[c])**2,
      e3=(xs[c]-xs[a])**2+(ys[c]-ys[a])**2;
    if(e1>me2||e2>me2||e3>me2){descartados++;continue;}
    if(!mask){pushI(a,b,c);continue;}
    const ia=dentro(xs[a],ys[a]),ib=dentro(xs[b],ys[b]),ic=dentro(xs[c],ys[c]);
    const xmin=Math.min(xs[a],xs[b],xs[c]),xmax=Math.max(xs[a],xs[b],xs[c]),
      ymin=Math.min(ys[a],ys[b],ys[c]),ymax=Math.max(ys[a],ys[b],ys[c]),
      cruza=cruzaLimite(xmin,ymin,xmax,ymax);
    // Três cantos internos não garantem um triângulo interno: um furo ou
    // reentrância pode atravessar seu interior sem conter nenhum vértice.
    if(ia&&ib&&ic&&!cruza){if(inverter)descartados++;else pushI(a,b,c);continue;}
    if(!(ia||ib||ic) &&
       !dentro((xs[a]+xs[b]+xs[c])/3,(ys[a]+ys[b]+ys[c])/3) &&
       !cruza){
      if(inverter)pushI(a,b,c);else descartados++;
      continue;
    }
    let inter;
    try{
      const tr=[[[[xs[a],ys[a]],[xs[b],ys[b]],[xs[c],ys[c]],[xs[a],ys[a]]]]];
      inter=inverter?polygonClipping.difference(tr,mask):polygonClipping.intersection(tr,mask);
    }catch(error){if(strict)throw new Error("Falha no recorte exato de uma face: "+error.message);inter=null;}
    if(!inter||!inter.length){descartados++;continue;}
    cortados++;
    for(const poly of inter){
      const cont=semFecho(poly[0]),holes=poly.slice(1).map(semFecho).filter(h=>h.length>=3);
      if(cont.length<3)continue;
      const cv=cont.map(p=>new THREE.Vector2(p[0],p[1])),
        hv=holes.map(h=>h.map(p=>new THREE.Vector2(p[0],p[1])));
      let faces;try{faces=THREE.ShapeUtils.triangulateShape(cv,hv);}catch(error){if(strict)throw error;faces=[];}
      if(strict&&!faces.length)throw new Error("Não foi possível triangular uma face recortada.");
      const flat=cont.concat(...holes),off=n+extra.length/3;
      flat.forEach(p=>extra.push(p[0],p[1],bary(p[0],p[1],a,b,c)));
      faces.forEach(f=>pushI(off+f[0],off+f[1],off+f[2]));
    }
  }
  const positions=new Float64Array(base.length+extra.length);positions.set(base);positions.set(extra,base.length);
  return {positions,indices:outIdx.slice(0,ni),exactClip:!!mask,
    triangles:ni/3,boundaryTriangles:cortados,discarded:descartados};
}

/* ============ interpolação TIN → grade regular (baricêntrica) ============ */
async function tinToGrid(xs, ys, zs, tri, cs, maxEdge) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] < minX) minX = xs[i]; if (xs[i] > maxX) maxX = xs[i];
    if (ys[i] < minY) minY = ys[i]; if (ys[i] > maxY) maxY = ys[i];
  }
  // grade cobrindo todo o domínio; célula amostrada no CENTRO (pixel-como-área).
  // Origem no próprio minX/minY (com margem de meia-célula) para não perder as
  // bordas — a fonte do deslocamento visual anterior era o corte da última fileira.
  const nc = Math.max(1, Math.round((maxX - minX) / cs) + 1);
  const nr = Math.max(1, Math.round((maxY - minY) / cs) + 1);
  const xll = minX - cs/2, yll = minY - cs/2;
  const z = new Float32Array(nc * nr).fill(NaN);
  const ME2 = maxEdge > 0 ? maxEdge * maxEdge : Infinity;
  let used = 0, skipped = 0;

  for (let t = 0; t < tri.length; t += 3) {
    if ((t % 30000) === 0){                       // respira: página nunca "trava"
      await respira();
      if (typeof showLoad==='function' && tri.length>300000)
        showLoad(`Interpolando TIN — ${(100*t/tri.length).toFixed(0)}%`);
    }
    const a = tri[t], b = tri[t + 1], c = tri[t + 2];
    const ax = xs[a], ay = ys[a], bx = xs[b], by = ys[b], cx2 = xs[c], cy2 = ys[c];
    // filtro de aresta longa (remove triângulos-fantasma fora do envelope das curvas)
    const e1 = (ax - bx) ** 2 + (ay - by) ** 2;
    const e2 = (bx - cx2) ** 2 + (by - cy2) ** 2;
    const e3 = (cx2 - ax) ** 2 + (cy2 - ay) ** 2;
    if (e1 > ME2 || e2 > ME2 || e3 > ME2) { skipped++; continue; }
    used++;
    const az = zs[a], bz = zs[b], czv = zs[c];
    const den = (by - cy2) * (ax - cx2) + (cx2 - bx) * (ay - cy2);
    if (Math.abs(den) < 1e-12) continue;
    // varre células cujo CENTRO (xll + (col+0.5)*cs) pode cair no triângulo
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx, cx2) - xll) / cs - 0.5));
    const c1 = Math.min(nc - 1, Math.ceil((Math.max(ax, bx, cx2) - xll) / cs - 0.5));
    const r0 = Math.max(0, Math.floor((Math.min(ay, by, cy2) - yll) / cs - 0.5));
    const r1 = Math.min(nr - 1, Math.ceil((Math.max(ay, by, cy2) - yll) / cs - 0.5));
    for (let r = r0; r <= r1; r++) {
      const py = yll + (r + 0.5) * cs;
      for (let col = c0; col <= c1; col++) {
        const px = xll + (col + 0.5) * cs;
        const l1 = ((by - cy2) * (px - cx2) + (cx2 - bx) * (py - cy2)) / den;
        const l2 = ((cy2 - ay) * (px - cx2) + (ax - cx2) * (py - cy2)) / den;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        z[(nr - 1 - r) * nc + col] = l1 * az + l2 * bz + l3 * czv;  // linha 0 = topo
      }
    }
  }
  return { nc, nr, cs, xll, yll, z, tris: used, skipped };
}
/* MDT derivado de pontos LAS classificados como ground: sob galpões, pilhas e
   outros objetos não há retorno “ground”, embora exista terreno ao redor.
   Fecha SOMENTE ilhas de NoData inteiramente cercadas por células válidas.
   Cada ilha recebe um plano ajustado aos seus contornos — uma interpolação
   estável do terreno, sem prolongar o MDT além da borda do levantamento. */
async function tinFechaLacunasInternasMDT(g){
  if(!g||!g.z||!g.nc||!g.nr)return {celulas:0,lacunas:0};
  const {z,nc,nr,cs,xll,yll}=g, total=nc*nr, visto=new Uint8Array(total);
  let celulas=0,lacunas=0;
  const xy=i=>{const r=(i/nc)|0,c=i-r*nc;
    return [xll+(c+.5)*cs,yll+(nr-r-.5)*cs];};
  const plano=(borda)=>{
    let sx=0,sy=0,n=0,media=0;
    borda.forEach(i=>{const p=xy(i);sx+=p[0];sy+=p[1];media+=z[i];n++;});
    if(!n)return null;
    const ox=sx/n,oy=sy/n; media/=n;
    let xx=0,xyv=0,x1=0,yy=0,y1=0,zz=0,xz=0,yz=0;
    borda.forEach(i=>{const p=xy(i),x=p[0]-ox,y=p[1]-oy,v=z[i];
      xx+=x*x;xyv+=x*y;x1+=x;yy+=y*y;y1+=y;zz+=v;xz+=x*v;yz+=y*v;});
    const a=[[xx,xyv,x1,xz],[xyv,yy,y1,yz],[x1,y1,n,zz]];
    for(let k=0;k<3;k++){
      let p=k;for(let q=k+1;q<3;q++)if(Math.abs(a[q][k])>Math.abs(a[p][k]))p=q;
      if(Math.abs(a[p][k])<1e-10)return {a:0,b:0,c:media,ox:0,oy:0};
      if(p!==k){const t=a[p];a[p]=a[k];a[k]=t;}
      const d=a[k][k];for(let j=k;j<4;j++)a[k][j]/=d;
      for(let q=0;q<3;q++)if(q!==k){const f=a[q][k];for(let j=k;j<4;j++)a[q][j]-=f*a[k][j];}
    }
    return {a:a[0][3],b:a[1][3],c:a[2][3],ox,oy};
  };
  for(let ini=0;ini<total;ini++){
    if(visto[ini]||isFinite(z[ini]))continue;
    const fila=[ini],comp=[],borda=new Set();visto[ini]=1;let tocaBorda=false;
    for(let h=0;h<fila.length;h++){
      const i=fila[h],r=(i/nc)|0,c=i-r*nc;comp.push(i);
      if(r===0||c===0||r===nr-1||c===nc-1)tocaBorda=true;
      const viz=[[r-1,c],[r+1,c],[r,c-1],[r,c+1]];
      for(const q of viz){const rr=q[0],cc=q[1];
        if(rr<0||cc<0||rr>=nr||cc>=nc){tocaBorda=true;continue;}
        const j=rr*nc+cc;
        if(isFinite(z[j]))borda.add(j);else if(!visto[j]){visto[j]=1;fila.push(j);}
      }
    }
    /* NoData conectado à borda significa ausência fora do envelope — não é
       uma lacuna de objeto e nunca deve ser preenchido automaticamente. */
    if(tocaBorda||borda.size<3)continue;
    const P=plano(borda);
    if(!P)continue;
    for(const i of comp){const p=xy(i);z[i]=P.a*(p[0]-P.ox)+P.b*(p[1]-P.oy)+P.c;}
    celulas+=comp.length;lacunas++;
    if((lacunas&15)===0)await respira();
  }
  return {celulas,lacunas};
}
/* ============ CAVA → grade condicionada por breaklines ================
   Delaunay pura só enxerga proximidade. Em uma cava isso permite que um
   triângulo atravesse uma berma e ligue diretamente dois taludes distantes.
   A superfície abaixo é construída por FAIXAS: cada par consecutivo de
   pé/crista delimita uma única faixa, e a cota é interpolada pela distância
   às duas breaklines. O resultado coincide exatamente com as linhas de
   projeto, não cria diagonais entre bancos e fica NoData fora da interseção. */
function tinCavaArea(r){
  let a=0; if(!r)return 0;
  for(let i=0,j=r.length-1;i<r.length;j=i++)a+=r[j][0]*r[i][1]-r[i][0]*r[j][1];
  return Math.abs(a/2);
}
function tinCavaDist(r,x,y){
  let best=Infinity;
  for(let i=0;i<r.length;i++){
    const a=r[i],b=r[(i+1)%r.length],dx=b[0]-a[0],dy=b[1]-a[1],q=dx*dx+dy*dy;
    const t=Math.max(0,Math.min(1,q?((x-a[0])*dx+(y-a[1])*dy)/q:0));
    const d=(x-a[0]-t*dx)**2+(y-a[1]-t*dy)**2;
    if(d<best)best=d;
  }
  return Math.sqrt(best);
}
function tinCavaTriZ(x,y,a,b,c){
  const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  if(Math.abs(den)<1e-12)return null;
  const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den;
  const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den,w=1-u-v;
  return u>=-1e-8&&v>=-1e-8&&w>=-1e-8?u*a[2]+v*b[2]+w*c[2]:null;
}
function tinCavaRampZ(lines,x,y){
  if(!lines||lines.length<2)return null;
  for(let k=0;k+1<lines.length;k+=2){
    const A=lines[k],B=lines[k+1],n=Math.min(A.geom.length,B.geom.length,A.zg.length,B.zg.length);
    for(let i=0;i<n-1;i++){
      const a=[A.geom[i][0],A.geom[i][1],A.zg[i]],b=[A.geom[i+1][0],A.geom[i+1][1],A.zg[i+1]],
        c=[B.geom[i+1][0],B.geom[i+1][1],B.zg[i+1]],d=[B.geom[i][0],B.geom[i][1],B.zg[i]];
      const z1=tinCavaTriZ(x,y,a,b,c); if(z1!=null)return z1;
      const z2=tinCavaTriZ(x,y,a,c,d); if(z2!=null)return z2;
    }
  }
  return null;
}
async function tinCavaToGrid(L,cs,opt){
  opt=opt||{};
  const D=L&&L.cavaDesign,rs=(D&&D.rings||[]).filter(q=>q.ring&&q.ring.length>=3&&isFinite(q.z));
  if(rs.length<2)return null;
  const areas=rs.map(q=>tinCavaArea(q.ring)),outerI=areas.indexOf(Math.max(...areas)),outer=rs[outerI].ring;
  const terrain=opt.terrain||(S.rasters||[]).find(r=>String(r.id)===String(D.rasterId))?.d||null;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  outer.forEach(p=>{minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);});
  /* Para a borda não virar uma escada grossa, tenta a resolução nativa do
     MDT. Em cavas enormes limita a grade a 600 mil células: conserva o
     acabamento sem transformar a classificação por bancos em uma espera
     excessiva ou esgotar a memória do navegador. */
  if(terrain&&terrain.cs>0)cs=Math.min(cs,terrain.cs);
  const est=Math.max(1,(maxX-minX)/cs)*(Math.max(1,(maxY-minY)/cs));
  if(!opt.unlimited&&est>600000)cs*=Math.sqrt(est/600000);
  const nc=Math.max(1,Math.round((maxX-minX)/cs)+1),nr=Math.max(1,Math.round((maxY-minY)/cs)+1),
    xll=minX-cs/2,yll=minY-cs/2,z=new Float32Array(nc*nr).fill(NaN);
  const expanding=areas.at(-1)>areas[0];
  const prep=rs.map(q=>{
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    q.ring.forEach(p=>{x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);});
    return {...q,x0,y0,x1,y1};
  });
  const dentro=(q,x,y)=>x>=q.x0&&x<=q.x1&&y>=q.y0&&y<=q.y1&&pointInRing(x,y,q.ring);
  let rampBox=null;
  if(D.rampLines&&D.rampLines.length){
    rampBox={x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity};
    D.rampLines.forEach(a=>a.geom.forEach(p=>{rampBox.x0=Math.min(rampBox.x0,p[0]);
      rampBox.x1=Math.max(rampBox.x1,p[0]);rampBox.y0=Math.min(rampBox.y0,p[1]);rampBox.y1=Math.max(rampBox.y1,p[1]);}));
  }
  let valid=0;
  for(let row=0;row<nr;row++){
    if((row&127)===0){await respira();if(typeof showLoad==='function'&&nr>500)
      showLoad(`Interpolando cava por bancos — ${(100*row/nr).toFixed(0)}%`);}
    const y=yll+(nr-1-row+.5)*cs;
    for(let col=0;col<nc;col++){
      const x=xll+(col+.5)*cs;
      if(!dentro(prep[outerI],x,y))continue;
      let zv=null,A=null,B=null;
      /* Os offsets da cava são anéis aninhados. Basta localizar a primeira
         mudança dentro/fora; não é necessário comparar todos os pares. */
      if(expanding){
        if(dentro(prep[0],x,y))zv=prep[0].z;
        else for(let i=1;i<prep.length;i++)if(dentro(prep[i],x,y)){A=prep[i-1];B=prep[i];break;}
      }else{
        let ultimo=prep[0];
        for(let i=1;i<prep.length;i++){
          if(!dentro(prep[i],x,y)){A=ultimo;B=prep[i];break;}
          ultimo=prep[i];
        }
        if(!A)zv=prep.at(-1).z;
      }
      if(A&&B){
        const da=tinCavaDist(A.ring,x,y),db=tinCavaDist(B.ring,x,y),s=da+db;
        zv=s>1e-9?(A.z*db+B.z*da)/s:(A.z+B.z)/2;
      }
      if(zv==null)continue;
      if(rampBox&&x>=rampBox.x0&&x<=rampBox.x1&&y>=rampBox.y0&&y<=rampBox.y1){
        const rz=tinCavaRampZ(D.rampLines,x,y);if(rz!=null)zv=rz;
      }
      /* Extrapola os taludes analíticos e corta somente no fim, exatamente
         no encontro projeto × terreno. Essa ordem evita bordas "voando". */
      if((D.cortar||opt.forceCut)&&terrain){
        const tz=sampleZbil(terrain,x,y);
        if(!Number.isFinite(tz)||(D.up?zv<tz-cs*.05:zv>tz+cs*.05))continue;
      }
      z[row*nc+col]=zv;valid++;
    }
  }
  return {nc,nr,cs,xll,yll,z,tris:0,skipped:0,cavaBreaklines:true,valid};
}
/* ---------- marching squares: curvas de nível a partir da grade ---------- */
function contourGrid(d, interval, origin=0){
  const {nc,nr,cs,xll,yll,z}=d;
  let mn=Infinity,mx=-Infinity;
  for(let k=0;k<z.length;k++){ const v=z[k]; if(!isNaN(v)){ if(v<mn)mn=v; if(v>mx)mx=v; } }
  if(!isFinite(mn)) return [];
  const out=[];
  const Z=(r,c)=>z[r*nc+c];
  const PX=(r,c)=>[xll+c*cs, yll+(nr-1-r)*cs];
  const lerp=(p1,p2,v1,v2,lv)=>{ const t=(lv-v1)/(v2-v1);
    return [p1[0]+t*(p2[0]-p1[0]), p1[1]+t*(p2[1]-p1[1])]; };
  /* `origin` alinha as curvas às cotas construtivas de uma cava/DCE. O valor
     padrão zero mantém exatamente o comportamento histórico dos demais MDT. */
  const lv0=origin+Math.ceil((mn-origin)/interval)*interval;
  for(let lv=lv0; lv<=mx; lv+=interval){
    const segs=[];
    for(let r=0;r<nr-1;r++) for(let c=0;c<nc-1;c++){
      const v=[Z(r,c),Z(r,c+1),Z(r+1,c+1),Z(r+1,c)];      // TL,TR,BR,BL
      if(v.some(isNaN)) continue;
      const p=[PX(r,c),PX(r,c+1),PX(r+1,c+1),PX(r+1,c)];
      const pts=[];
      for(let e=0;e<4;e++){
        const a=e, b=(e+1)%4;
        if((v[a]<lv)!==(v[b]<lv)) pts.push(lerp(p[a],p[b],v[a],v[b],lv));
      }
      if(pts.length===2) segs.push(pts);
      else if(pts.length===4){ segs.push([pts[0],pts[1]]); segs.push([pts[2],pts[3]]); }
    }
    if(!segs.length) continue;
    // costura dos segmentos em polilinhas
    const key=q=>q[0].toFixed(3)+','+q[1].toFixed(3);
    const idx=new Map();
    segs.forEach(s=>{ [0,1].forEach(i=>{ const k=key(s[i]);
      if(!idx.has(k)) idx.set(k,[]); idx.get(k).push(s); }); });
    const done=new Set();
    segs.forEach(s=>{
      if(done.has(s)) return;
      done.add(s);
      const line=[s[0],s[1]];
      for(const dir of [1,0]){                        // estende pelas duas pontas
        let end = dir ? line[line.length-1] : line[0];
        let guard=0;
        while(guard++ < 500000){
          const cand=(idx.get(key(end))||[]).find(t=>!done.has(t));
          if(!cand) break;
          done.add(cand);
          const nx = (key(cand[0])===key(end)) ? cand[1] : cand[0];
          if(dir) line.push(nx); else line.unshift(nx);
          end=nx;
        }
      }
      if(line.length>=2) out.push({z:lv, pts:line});
    });
  }
  return out;
}

/* ---------- Ferramentas de geometria (Geoproc) ----------
   Todas trabalham no CRS de trabalho; a saída é criada em S.workCRS.        */
function gtRings(L,f){          // anéis reprojetados p/ o CRS de trabalho
  if(!f.geom) return [];
  const rings=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
  return rings.map(r=>r.map(pt=>reproj(L.crs,S.workCRS,pt[0],pt[1])));
}
function gtZg(f){                // Z da geometria com o MESMO aninhamento de gtRings
  if(!f||!Array.isArray(f.geom)||!f.geom.length)return null;
  const vector=v=>Array.isArray(v)||ArrayBuffer.isView(v);
  const nested=Array.isArray(f.geom[0])&&Array.isArray(f.geom[0][0]);
  const rings=nested?f.geom:[f.geom],raw=f.zg;
  const number=v=>{
    if(typeof v==='number')return Number.isFinite(v)?v:null;
    if(typeof v!=='string'||!v.trim())return null;
    const s=v.trim().replace(',','.');
    return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s)&&Number.isFinite(Number(s))?Number(s):null;
  };
  const result=rings.map((ring,ri)=>{
    let values=raw;
    /* Mesclas antigas achataram uma única parte XY, mas deixaram zg=[zs].
       Desembrulhar essa parte é inequívoco; nunca achatar várias partes ou
       deslocar cotas quando a contagem de vértices não corresponde. */
    if(vector(raw)){
      if(vector(raw[0]))values=raw.length===rings.length?raw[ri]:null;
      else if(rings.length>1)values=raw.length===rings.length?raw[ri]:null;
    }
    if(vector(values)&&values.length!==ring.length)values=null;
    return ring.map((pt,vi)=>raw==null?number(pt[2]):number(vector(values)?values[vi]:values));
  });
  return result.some(r=>r.some(z=>z!==null))?result:null;
}
function gtZSource(){ return document.getElementById('gtZSrc').value; }
function gtActiveRaster(){
  const id=+document.getElementById('gtRaster').value;
  return S.rasters.find(r=>r.id===id)||null;
}

/* Núcleo único da densificação. Trata corretamente:
   - linhas abertas;
   - polígonos fechados mesmo quando o último vértice não repete o primeiro;
   - Z embutido no ponto e Z separado em `zg`;
   - segmentos menores que o passo, preservando sempre os vértices originais. */
function densificaRing(r,zr,step,closed){
  if(!Array.isArray(r)||r.length<2||!(step>0))
    return {pts:Array.isArray(r)?r.map(p=>p.slice()):[],zs:Array.isArray(zr)?zr.slice():null};
  const eq=(a,b)=>Math.hypot((a[0]||0)-(b[0]||0),(a[1]||0)-(b[1]||0))<1e-9;
  const repetido=closed&&r.length>2&&eq(r[0],r[r.length-1]);
  const base=repetido?r.slice(0,-1):r.slice();
  const zbase=Array.isArray(zr)&&zr.length===r.length
    ? (repetido?zr.slice(0,-1):zr.slice()) : null;
  if(base.length<2)return {pts:r.map(p=>p.slice()),zs:zbase?zbase.slice():null};
  const out=[],zo=zbase?[]:null, nseg=closed?base.length:base.length-1;
  for(let i=0;i<nseg;i++){
    const a=base[i],b=base[(i+1)%base.length];
    out.push(a.slice()); if(zo)zo.push(zbase[i]);
    const dx=b[0]-a[0],dy=b[1]-a[1],d=Math.hypot(dx,dy);
    if(!(d>1e-12))continue;
    const n=Math.floor(d/step-1e-10);
    for(let k=1;k<=n;k++){
      const t=k*step/d;if(t>=1-1e-10)break;
      const p=[a[0]+dx*t,a[1]+dy*t];
      // preserva dimensões adicionais presentes diretamente na geometria
      for(let j=2;j<Math.max(a.length,b.length);j++){
        const av=+a[j],bv=+b[j];
        p[j]=isFinite(av)&&isFinite(bv)?av+(bv-av)*t:(isFinite(av)?av:(isFinite(bv)?bv:undefined));
      }
      out.push(p);
      if(zo){
        const za=+zbase[i],zb=+zbase[(i+1)%zbase.length];
        zo.push(isFinite(za)&&isFinite(zb)?za+(zb-za)*t:(isFinite(za)?za:(isFinite(zb)?zb:null)));
      }
      if(out.length>2000000)throw new Error('densificação excederia 2 milhões de vértices; aumente o espaçamento');
    }
  }
  if(closed){
    out.push(out[0].slice()); if(zo)zo.push(zo[0]);
  }else{
    out.push(base[base.length-1].slice()); if(zo)zo.push(zbase[zbase.length-1]);
  }
  return {pts:out,zs:zo};
}

/* Variações de densificação usadas pela janela do Editor de Vetores.
   - distância: distância MÁXIMA entre vértices (cada segmento é dividido
     em ceil(comprimento/distância), portanto nunca ultrapassa o valor);
   - intervalos: divide cada segmento original em N partes iguais;
   - vertices: insere exatamente N vértices em cada segmento original.
   Todos os modos preservam os vértices e o Z original/interpolado. */
function densificaRingModo(r,zr,modo,valor,closed){
  if(modo==='distancia')return densificaRing(r,zr,valor,closed);
  const nInt=modo==='vertices'?Math.round(valor)+1:Math.round(valor);
  if(!Array.isArray(r)||r.length<2||!(nInt>=1))
    return {pts:Array.isArray(r)?r.map(p=>p.slice()):[],zs:Array.isArray(zr)?zr.slice():null};
  const eq=(a,b)=>Math.hypot((a[0]||0)-(b[0]||0),(a[1]||0)-(b[1]||0))<1e-9;
  const repetido=closed&&r.length>2&&eq(r[0],r[r.length-1]);
  const base=repetido?r.slice(0,-1):r.slice();
  const zbase=Array.isArray(zr)&&zr.length===r.length
    ?(repetido?zr.slice(0,-1):zr.slice()):null;
  const out=[],zo=zbase?[]:null,nseg=closed?base.length:base.length-1;
  for(let i=0;i<nseg;i++){
    const a=base[i],b=base[(i+1)%base.length];
    out.push(a.slice());if(zo)zo.push(zbase[i]);
    for(let k=1;k<nInt;k++){
      const t=k/nInt,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
      for(let j=2;j<Math.max(a.length,b.length);j++){
        const av=+a[j],bv=+b[j];
        p[j]=isFinite(av)&&isFinite(bv)?av+(bv-av)*t:(isFinite(av)?av:(isFinite(bv)?bv:undefined));
      }
      out.push(p);
      if(zo){
        const za=+zbase[i],zb=+zbase[(i+1)%zbase.length];
        zo.push(isFinite(za)&&isFinite(zb)?za+(zb-za)*t:(isFinite(za)?za:(isFinite(zb)?zb:null)));
      }
      if(out.length>2000000)throw new Error('densificação excederia 2 milhões de vértices; reduza os intervalos');
    }
  }
  if(closed){out.push(out[0].slice());if(zo)zo.push(zo[0]);}
  else{out.push(base[base.length-1].slice());if(zo)zo.push(zbase[zbase.length-1]);}
  return {pts:out,zs:zo};
}

/* Densificar: insere vértices a cada `step` m ao longo dos segmentos,
   preservando TODOS os vértices originais (a forma não muda).              */
function gtDensify(opcoes){
  opcoes=opcoes||{};
  const selEl=document.getElementById('gtLayer');
  const escolhido=selEl?S.layers.find(l=>String(l.id)===selEl.value):null;
  const selecionado=(typeof processingLayer==='function')?processingLayer():activeLayer();
  const L=(selecionado&&selecionado.gtype!=='point')?selecionado:escolhido;
  if(!L){ toast('Selecione uma camada'); return; }
  if(L.gtype==='point'){ toast('Densificação vale para linhas/polígonos'); return; }
  if(selEl)selEl.value=String(L.id);
  const modo=opcoes.modo||'distancia';
  const step=+(opcoes.valor??document.getElementById('gtStep').value);
  if(!(step>0)){ toast('Valor de densificação inválido'); return; }
  if(modo!=='distancia'&&!Number.isInteger(step)){toast('Intervalos/vértices devem ser números inteiros');return;}
  let nIn=0,nOut=0,feats;
  try{
    feats=L.features.map(f=>{
      const zgeo=gtZg(f),zgOut=[];
      const rings=gtRings(L,f).map((r,ri)=>{
        const zr=zgeo&&zgeo[ri]&&zgeo[ri].length===r.length?zgeo[ri]:null;
        const d=densificaRingModo(r,zr,modo,step,L.gtype==='polygon');
        nIn+=r.length;nOut+=d.pts.length;zgOut.push(d.zs);
        return d.pts;
      });
      const ft={geom:rings.length>1?rings:rings[0],multi:rings.length>1,props:{...f.props}};
      if(zgOut.some(Boolean))ft.zg=rings.length>1?zgOut.map(v=>v||[]):zgOut[0];
      return ft;
    });
  }catch(e){toast('Densificação cancelada: '+e.message);return;}
  const criterio=modo==='distancia'?step+' m':(modo==='intervalos'?step+' intervalos':step+' vértices/segmento');
  const nova=addLayer({sourceLayer:L,name:L.name+' — densif. '+criterio, gtype:L.gtype, crs:S.workCRS,
    features:feats, fields:(L.fields||[]).map(f=>({...f})), color:'#7aa2f7'});
  if(nova&&L.sym){nova.sym=JSON.parse(JSON.stringify(L.sym));drawLayer(nova);}
  document.getElementById('gtOut').innerHTML=
    `Densificação: <b>${nIn.toLocaleString('pt-BR')}</b> → <b>${nOut.toLocaleString('pt-BR')}</b> vértices `+
    `(${criterio}) em ${feats.length} feições.`;
  if(nOut===nIn)toast(modo==='distancia'
    ?`Nenhum segmento excede ${step} m; reduza o espaçamento`
    :'O critério informado não acrescentou vértices');
  else toast(`Densificação concluída: ${nIn.toLocaleString('pt-BR')} → ${nOut.toLocaleString('pt-BR')} vértices`);
  refreshTinPanel(); refreshGtPanel();
}

/* Extrair vértices: linhas/polígonos -> camada de PONTOS,
   com FID, VTX, X, Y e (opcional) Z amostrado de uma superfície.           */
async function gtExtractVertices(){
  const L=S.layers.find(l=>String(l.id)===document.getElementById('gtLayer').value);
  if(!L){ toast('Selecione uma camada'); return; }
  const wantZ=document.getElementById('gtVtxZ').checked;
  const src=gtZSource();                                  // 'surf' | 'geom'
  const R=(wantZ&&src==='surf')? gtActiveRaster() : null;
  if(wantZ && src==='surf' && !R){ toast('Marque uma superfície para amostrar o Z'); return; }
  const GR=R? await gridProd(R,'extrair os vértices') : null;                   // grade NATIVA da superfície
  if(wantZ && src==='geom' && !L.features.some(f=>f.zg)){
    toast('Esta camada não tem Z na geometria (shape 2D) — use a fonte "Superfície"'); return; }
  const feats=[]; let semZ=0;
  L.features.forEach((f,fi)=>{
    const zgeo=(wantZ&&src==='geom')? gtZg(f) : null;
    gtRings(L,f).forEach((ring,ri)=>{
      ring.forEach((pt,vi)=>{
        const props={FID:fi, ANEL:ri, VTX:vi,
          X:+pt[0].toFixed(3), Y:+pt[1].toFixed(3)};
        if(wantZ){
          let z=NaN;
          if(src==='geom'){ z=zgeo&&zgeo[ri]? zgeo[ri][vi] : NaN; }
          else { z=sampleZbil(GR,pt[0],pt[1]); }
          if(isNaN(z)) semZ++;
          props.Z=isNaN(z)? null : +z.toFixed(2);
        }
        feats.push({geom:[pt], multi:false, props});
      });
    });
  });
  if(!feats.length){ toast('Nenhum vértice extraído'); return; }
  const fields=[{name:'FID',type:'N',length:10,decimal:0},{name:'ANEL',type:'N',length:4,decimal:0},
    {name:'VTX',type:'N',length:8,decimal:0},{name:'X',type:'N',length:14,decimal:3},
    {name:'Y',type:'N',length:14,decimal:3}];
  if(wantZ) fields.push({name:'Z',type:'N',length:10,decimal:2});
  addLayer({sourceLayer:L,name:L.name+' — vértices'+(wantZ?' +Z':''), gtype:'point', crs:S.workCRS,
    features:feats, fields, color:'#e0af68'});
  const zsrc=wantZ? (src==='geom'?'Z da geometria (3D)':'superfície "'+esc(R.name)+'"') : '';
  document.getElementById('gtOut').innerHTML=
    `Vértices extraídos: <b>${feats.length.toLocaleString('pt-BR')}</b>`+
    (wantZ?` · Z de ${zsrc}${semZ?` · <b>${semZ}</b> sem Z (nulo)`:''}`:'')+`.`;
  refreshTinPanel(); refreshGtPanel();
}

/* Extrair Z: preenche/cria o campo Z nos PONTOS da camada,
   amostrando a superfície escolhida (bilinear).                            */
async function gtExtractZ(){
  const L=S.layers.find(l=>String(l.id)===document.getElementById('gtLayer').value);
  if(!L){ toast('Selecione uma camada'); return; }
  const src=gtZSource();
  const R=(src==='surf')? gtActiveRaster() : null;
  if(src==='surf' && !R){ toast('Marque a superfície de onde extrair o Z'); return; }
  const GR=R? await gridProd(R,'extrair a cota Z') : null;                   // grade NATIVA da superfície
  if(src==='geom' && !L.features.some(f=>f.zg)){
    toast('Esta camada não tem Z na geometria (shape 2D) — use a fonte "Superfície"'); return; }
  if(L.gtype!=='point'){
    toast('Para linhas/polígonos use "Extrair vértices" com a opção de Z'); return;
  }
  // Como no QGIS: GERA UMA CAMADA NOVA com o campo Z, sem alterar a original
  let ok=0, fora=0;
  const feats=L.features.map(f=>{
    const pt=reproj(L.crs,S.workCRS,f.geom[0][0],f.geom[0][1]);
    let z=NaN;
    if(src==='geom'){ const zg=gtZg(f); z=zg? zg[0][0] : NaN; }
    else z=sampleZbil(GR,pt[0],pt[1]);
    const props={...f.props};
    if(isNaN(z)){ props.Z=null; fora++; } else { props.Z=+z.toFixed(2); ok++; }
    return {geom:[[pt[0],pt[1]]], multi:false, props};
  });
  const fields=(L.fields||[]).map(f=>({...f}));
  if(!fields.some(f=>f.name==='Z')) fields.push({name:'Z',type:'N',length:10,decimal:2});
  addLayer({sourceLayer:L,name:L.name+' — com Z', gtype:'point', crs:S.workCRS,
    features:feats, fields, color:'#9ece6a'});
  const zsrc=(src==='geom')?'Z da geometria (3D)':'superfície "'+esc(R.name)+'"';
  document.getElementById('gtOut').innerHTML=
    `Nova camada "${esc(L.name)} — com Z" (${zsrc}): <b>${ok}</b> preenchido(s)`+
    (fora?` · <b>${fora}</b> sem Z (nulo)`:'')+`.`;
  refreshTinPanel(); refreshGtPanel();
}

function refreshGtPanel(){
  const sel=document.getElementById('gtLayer'); if(!sel) return;
  const cur=sel.value;
  sel.innerHTML=S.layers.length
    ? S.layers.map(l=>`<option value="${l.id}">${esc(l.name)} (${l.gtype}, ${l.features.length})</option>`).join('')
    : '<option value="">— nenhuma camada —</option>';
  const ativa=(typeof processingLayer==='function')?processingLayer():activeLayer();
  if(ativa&&S.layers.includes(ativa))sel.value=String(ativa.id);
  else if(S.layers.some(l=>String(l.id)===cur)) sel.value=cur;
  const rs=document.getElementById('gtRaster');
  const curR=rs.value;
  rs.innerHTML=S.rasters.length
    ? S.rasters.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')
    : '<option value="">— nenhuma superfície —</option>';
  if(S.rasters.some(r=>String(r.id)===curR)) rs.value=curR;
  refreshCtPanel();
  refreshMeasPanel();
  refreshClipPanel();
  refreshPubList();
}
/* ===========================================================================
   RECORTE DE RASTER POR MÁSCARA (Geoproc)
   Varredura por linha (scanline, regra par-ímpar): para cada linha da grade,
   cruza a cota Y do centro das células com todas as arestas dos polígonos,
   ordena as interseções e preenche os trechos ímpares. Custo O(linhas×arestas),
   não O(células×vértices) — por isso roda na grade nativa sem travar. Buracos
   (anéis internos) e multipartes saem de graça na regra par-ímpar.
   =========================================================================== */
function clipGridByRings(g, rings, opt){
  const {invert=false, crop=true, buf=0}=opt||{};
  const csy=g.csy||g.cs;
  // bbox dos anéis
  let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
  rings.forEach(r=>r.forEach(([x,y])=>{ if(x<mnX)mnX=x; if(x>mxX)mxX=x;
    if(y<mnY)mnY=y; if(y>mxY)mxY=y; }));
  if(!isFinite(mnX)) throw new Error('máscara sem geometria válida');
  mnX-=buf; mnY-=buf; mxX+=buf; mxY+=buf;

  // recorte da janela de saída (em índices da grade de entrada)
  const cx = c => g.xll+(c+0.5)*g.cs, cy = r => g.yll+(g.nr-0.5-r)*csy;
  let c0=0, c1=g.nc-1, r0=0, r1=g.nr-1;
  if(crop && !invert){
    c0=Math.max(0, Math.floor((mnX-g.xll)/g.cs));
    c1=Math.min(g.nc-1, Math.ceil((mxX-g.xll)/g.cs));
    r0=Math.max(0, Math.floor((g.yll+g.nr*csy-mxY)/csy));
    r1=Math.min(g.nr-1, Math.ceil((g.yll+g.nr*csy-mnY)/csy));
    if(c1<c0||r1<r0) throw new Error('a máscara não intersecta o raster');
  }
  const nc=c1-c0+1, nr=r1-r0+1;
  const z=new Float32Array(nc*nr); z.fill(NaN);

  // arestas
  const E=[];
  rings.forEach(r=>{ for(let i=0;i<r.length-1;i++){
    const a=r[i], b=r[i+1];
    if(a[1]!==b[1]) E.push([a[0],a[1],b[0],b[1]]);
  }
  // fecha o anel se vier aberto
  const a=r[r.length-1], b=r[0];
  if(a && b && (a[0]!==b[0]||a[1]!==b[1]) && a[1]!==b[1]) E.push([a[0],a[1],b[0],b[1]]);
  });

  let dentro=0;
  const xs=[];
  for(let r=r0;r<=r1;r++){
    const yc=cy(r);
    xs.length=0;
    for(let k=0;k<E.length;k++){
      const [x1,y1,x2,y2]=E[k];
      if((y1<=yc)!==(y2<=yc)) xs.push(x1+(yc-y1)*(x2-x1)/(y2-y1));
    }
    xs.sort((a,b)=>a-b);
    const dst=(r-r0)*nc;
    if(!invert){
      for(let i=0;i+1<xs.length;i+=2){
        /* Inclui qualquer célula tocada pelo intervalo do polígono. A máscara
           vetorial aplicada em rasterCanvas remove a meia célula excedente e
           entrega a borda final exatamente sobre o limite. */
        let ca=Math.max(c0, Math.floor((xs[i]-g.xll)/g.cs));
        let cb=Math.min(c1, Math.ceil((xs[i+1]-g.xll)/g.cs)-1);
        for(let c=ca;c<=cb;c++){ const v=g.z[r*g.nc+c];
          z[dst+(c-c0)]=v; if(!isNaN(v)) dentro++; }
      }
    } else {                       // inverter: começa cheio e apaga o que está dentro
      for(let c=c0;c<=c1;c++){ const v=g.z[r*g.nc+c]; z[dst+(c-c0)]=v; }
      for(let i=0;i+1<xs.length;i+=2){
        let ca=Math.max(c0, Math.floor((xs[i]-g.xll)/g.cs));
        let cb=Math.min(c1, Math.ceil((xs[i+1]-g.xll)/g.cs)-1);
        for(let c=ca;c<=cb;c++) z[dst+(c-c0)]=NaN;
      }
      for(let c=c0;c<=c1;c++) if(!isNaN(z[dst+(c-c0)])) dentro++;
    }
  }
  /* A varredura horizontal já é "all touched" em X. Complete também a
     vizinhança vertical de uma célula para que cantos e segmentos oblíquos
     não fiquem recuados até o centro da linha seguinte. A expansão não vaza
     no desenho: rasterCanvas recorta este anel pela geometria vetorial exata. */
  if(!invert){
    const centro=z.slice();
    for(let rr=0;rr<nr;rr++) for(let cc=0;cc<nc;cc++){
      const oi=rr*nc+cc;
      if(Number.isFinite(centro[oi])) continue;
      const gv=Number(g.z[(r0+rr)*g.nc+(c0+cc)]);
      if(!Number.isFinite(gv)) continue;
      let toca=false;
      for(let dr=-1;dr<=1&&!toca;dr++) for(let dc=-1;dc<=1;dc++){
        if(!dr&&!dc) continue;
        const ar=rr+dr,ac=cc+dc;
        if(ar>=0&&ar<nr&&ac>=0&&ac<nc&&Number.isFinite(centro[ar*nc+ac])){toca=true;break;}
      }
      if(toca){z[oi]=gv;dentro++;}
    }
  }
  return {nc, nr, cs:g.cs, csy, xll:g.xll+c0*g.cs, yll:g.yll+(g.nr-1-r1)*csy, z,
          native:true, dentro};
}
function refreshClipPanel(){
  const rs=document.getElementById('clRaster'), ms=document.getElementById('clMask');
  if(!rs||!ms) return;
  const cr=rs.value, cm=ms.value;
  rs.innerHTML=S.rasters.length
    ? S.rasters.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')
    : '<option value="">— nenhum raster —</option>';
  if(S.rasters.some(r=>String(r.id)===cr)) rs.value=cr;
  const pol=S.layers.filter(l=>l.gtype==='polygon');
  ms.innerHTML=pol.length
    ? pol.map(l=>`<option value="${l.id}">${esc(l.name)} (${l.features.length})</option>`).join('')
    : '<option value="">— nenhuma camada de polígonos —</option>';
  if(pol.some(l=>String(l.id)===cm)) ms.value=cm;
}
async function runClip(){
  const r=S.rasters.find(x=>String(x.id)===document.getElementById('clRaster').value);
  const L=S.layers.find(x=>String(x.id)===document.getElementById('clMask').value);
  if(!r){ toast('Selecione o raster'); return; }
  if(!L || L.gtype!=='polygon'){ toast('Selecione uma camada de polígonos'); return; }
  const crop=document.getElementById('clCrop').checked;
  const invert=document.getElementById('clInv').checked;
  const buf=Math.max(0,+document.getElementById('clBuf').value||0);

  const g=await gridProd(r,'recortar a superfície');
  showLoad(`Recortando ${g.nc}×${g.nr}…`);
  await new Promise(rs=>setTimeout(rs,10));
  const t0=performance.now();
  let out, rings=[];
  try{
    L.features.forEach(f=>gtRings(L,f).forEach(rg=>{ if(rg.length>=3) rings.push(rg); }));
    if(!rings.length) throw new Error('a camada não tem anéis de polígono');
    out=clipGridByRings(g, rings, {invert, crop, buf});
  }catch(e){ hideLoad(); toast('Falha no recorte: '+e.message); return; }
  const t1=performance.now();
  if(!out.dentro){ hideLoad(); toast('Nenhuma célula sobrou — confira o CRS da máscara'); return; }

  const nr2={id:rid++, name:r.name+' — recorte '+L.name, d:out,
    src:{file:'clip('+(r.src?r.src.file:r.name)+')', size:0, at:new Date().toISOString()},
    style:{mode:r.style.mode, opacity:r.style.opacity}, visible:true, overlay:null,
    _exactClipRings:rings.map(a=>a.map(p=>[p[0],p[1]])),
    _v3:{papel:'projeto',cor:(L.sym&&L.sym.color)||L.color||'#4f8b3a',limId:L.id}};
  S.rasters.push(nr2);placeProductAbove(nr2,r); renderRaster(nr2); refreshUI();
  projectAutoSaveRaster(nr2);
  const b=nr2.overlay&&nr2.overlay.getBounds?nr2.overlay.getBounds():null;
  if(b) safeFit(b);
  hideLoad();

  const areaHa=out.dentro*out.cs*out.cs/1e4;
  document.getElementById('clOut').innerHTML=
    `Entrada: <b>${g.nc}×${g.nr}</b> · ${g.cs.toFixed(2)} m (${g.native||!(r.d.resampled>1)?'nativa':'tela'})\n`+
    `Saída: <b>${out.nc}×${out.nr}</b> · células com dado <b>${out.dentro.toLocaleString('pt-BR')}</b> `+
    `(${(100*out.dentro/(out.nc*out.nr)).toFixed(1)}% do retângulo)\n`+
    `Área recortada: <b>${areaHa.toLocaleString('pt-BR',{maximumFractionDigits:2})} ha</b>\n`+
    `Redução de células: ${(g.nc*g.nr/1e6).toFixed(1)} M → <b>${(out.nc*out.nr/1e6).toFixed(2)} M</b> `+
    `· tempo ${(t1-t0).toFixed(0)} ms`;
  toast(`Recorte: ${out.nc}×${out.nr} · ${areaHa.toFixed(1)} ha`);
}

/* ---------------------------------------------------------------------------
   CURVAS DE NÍVEL (Geoproc) — marching squares sobre a grade NATIVA
   --------------------------------------------------------------------------- */
function ctActiveRaster(){
  const id=+document.getElementById('ctRaster').value;
  return S.rasters.find(r=>r.id===id)||null;
}
function refreshCtPanel(){
  const rs=document.getElementById('ctRaster'); if(!rs) return;
  const cur=rs.value;
  rs.innerHTML=S.rasters.length
    ? S.rasters.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')
    : '<option value="">— nenhuma superfície —</option>';
  if(S.rasters.some(r=>String(r.id)===cur)) rs.value=cur;
  ctResInfo();
}
function ctResInfo(){
  const el=document.getElementById('ctRes'); if(!el) return;
  const r=ctActiveRaster();
  if(!r){ el.innerHTML='Carregue um GeoTIFF (＋ Importar) ou gere um MDT acima.'; return; }
  const d=r.d;
  if(!(d.resampled>1)) el.innerHTML=`Grade <b>nativa</b> ${d.nc}×${d.nr} · ${d.cs.toFixed(2)} m/célula.`;
  else if(!S.fullRes)  el.innerHTML=`⚠ “Resolução plena” desligada — usará a grade de tela ${d.nc}×${d.nr} · ${d.cs.toFixed(2)} m.`;
  else el.innerHTML=`Grade nativa <b>${d._W0}×${d._H0}</b>`+(d._full?' (carregada)':' (será relida do GeoTIFF)')+
       ` · tela ${d.nc}×${d.nr} ÷${d.resampled}.`;
}
/* Chaikin: suaviza a polilinha cortando cantos (mantém as pontas) */
function chaikin(pts, iters){
  let P=pts;
  const fechada = P.length>2 && P[0][0]===P[P.length-1][0] && P[0][1]===P[P.length-1][1];
  for(let it=0; it<iters; it++){
    if(P.length<3) break;
    const Q=[];
    if(!fechada) Q.push(P[0]);
    for(let i=0;i<P.length-1;i++){
      const [x1,y1]=P[i], [x2,y2]=P[i+1];
      Q.push([0.75*x1+0.25*x2, 0.75*y1+0.25*y2]);
      Q.push([0.25*x1+0.75*x2, 0.25*y1+0.75*y2]);
    }
    if(fechada) Q.push(Q[0].slice()); else Q.push(P[P.length-1]);
    P=Q;
  }
  return P;
}
function polyLen(pts){ let L=0;
  for(let i=1;i<pts.length;i++) L+=Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]);
  return L; }

async function runContour(){
  const r=ctActiveRaster();
  if(!r){ toast('Selecione uma superfície'); return; }
  const iv=+document.getElementById('ctInt').value;
  if(!(iv>0)){ toast('Equidistância inválida'); return; }
  const mst=Math.max(0, +document.getElementById('ctMaster').value||0);
  const sm=Math.max(0, Math.min(4, +document.getElementById('ctSmooth').value||0));
  const minL=Math.max(0, +document.getElementById('ctMinLen').value||0);
  const split=document.getElementById('ctSplit').checked;

  const g=await gridProd(r,'gerar as curvas de nível');
  if(g.nc*g.nr>60e6 && !confirm(`Grade de ${(g.nc*g.nr/1e6).toFixed(0)} M células — pode levar minutos. Continuar?`)) return;

  showLoad(`Curvas ${iv} m sobre ${g.nc}×${g.nr}…`);
  await new Promise(rs=>setTimeout(rs,10));
  const t0=performance.now();
  let lines=[];
  try{ lines=contourGrid(g, iv); }
  catch(e){ hideLoad(); toast('Falha: '+e.message); return; }
  const t1=performance.now();
  if(!lines.length){ hideLoad(); toast('Nenhuma curva gerada — verifique a equidistância'); return; }

  const ehMestra=z => mst>0 && Math.abs(z/mst - Math.round(z/mst))<1e-6;
  let nDesc=0, nVtx=0;
  const feats=[];
  lines.forEach(ln=>{
    let pts=ln.pts;
    if(minL>0 && polyLen(pts)<minL){ nDesc++; return; }
    if(sm>0) pts=chaikin(pts, sm);
    nVtx+=pts.length;
    feats.push({geom:pts, multi:false,
      props:{COTA:+ln.z.toFixed(2), MESTRA: ehMestra(ln.z)?1:0,
             // com mst=0 não há classificação: o campo fica vazio em vez de
             // declarar todas como secundárias, o que seria falso
             TIPO: (mst>0 ? (ehMestra(ln.z)?'Mestra':'Secundária') : ''),
             COMPR:+polyLen(pts).toFixed(1)}});
  });
  if(!feats.length){ hideLoad(); toast('Todas as curvas ficaram abaixo do comprimento mínimo'); return; }

  const fields=[{name:'COTA',type:'N',length:12,decimal:2},
                {name:'MESTRA',type:'N',length:1,decimal:0},
                {name:'TIPO',type:'C',length:12,decimal:0},
                {name:'COMPR',type:'N',length:12,decimal:1}];
  const nM=feats.filter(f=>f.props.MESTRA===1).length;

  // addLayer não aceita espessura/rótulo direto: ajusta depois e redesenha
  const setStyle=(L,w,lbl)=>{ L.weight=w; L.sym.weight=w;
    if(lbl){ L.labelField=lbl; } drawLayer(L); };
  if(split && mst>0 && nM){
    const Lc=addLayer({sourceLayer:r,name:r.name+' — curvas '+iv+' m', gtype:'line', crs:S.workCRS,
      features:feats.filter(f=>f.props.MESTRA===0), fields:fields.map(f=>({...f})),
      color:'#37c0aa'});
    setStyle(Lc, 1, null);
    const Lm=addLayer({sourceLayer:r,name:r.name+' — mestras '+mst+' m', gtype:'line', crs:S.workCRS,
      features:feats.filter(f=>f.props.MESTRA===1), fields:fields.map(f=>({...f})),
      color:'#e0af68'});
    setStyle(Lm, 2.2, 'COTA');
  } else {
    const L1=addLayer({sourceLayer:r,name:r.name+' — curvas '+iv+' m', gtype:'line', crs:S.workCRS,
      features:feats, fields, color:'#37c0aa'});
    setStyle(L1, 1.2, null);
  }
  zApply();
  hideLoad();

  const zs=feats.map(f=>f.props.COTA);
  const nativa = g.native || !(r.d.resampled>1);
  document.getElementById('ctOut').innerHTML=
    `Superfície: <b>${esc(r.name)}</b> · grade <b>${nativa?'nativa':'de tela'}</b> `+
    `${g.nc}×${g.nr} · ${g.cs.toFixed(2)} m/célula\n`+
    `Equidistância: <b>${iv} m</b>`+(mst>0?` · mestras a cada <b>${mst} m</b> (${nM})`:'')+`\n`+
    `Polilinhas: <b>${feats.length.toLocaleString('pt-BR')}</b> · vértices ${nVtx.toLocaleString('pt-BR')}`+
    (nDesc?` · ${nDesc} descartadas (< ${minL} m)`:'')+(sm?` · suavizadas (${sm}×)`:'')+`\n`+
    `Cotas: <b>${Math.min(...zs).toFixed(1)}</b> – <b>${Math.max(...zs).toFixed(1)}</b> m · `+
    `tempo ${(t1-t0).toFixed(0)} ms`;
  refreshUI();
  toast(`${feats.length} curvas a cada ${iv} m`);
}

function bindGtPanel(){
  const bcl=document.getElementById('btnClip'); if(bcl) bcl.onclick=runClip;
  const bc=document.getElementById('btnContour'); if(bc) bc.onclick=runContour;
  const cr=document.getElementById('ctRaster');   if(cr) cr.onchange=ctResInfo;
  const b1=document.getElementById('btnGtDens');  if(b1) b1.onclick=gtDensify;
  const b2=document.getElementById('btnGtVtx');   if(b2) b2.onclick=gtExtractVertices;
  const b3=document.getElementById('btnGtZ');     if(b3) b3.onclick=gtExtractZ;
}

/* ============================================================================
   GEOPROCESSAMENTO VETORIAL — Sobreposição e mesclagem
   Diferença simétrica (A △ B) usa a biblioteca polygon-clipping
   (algoritmo Martinez–Rueda), carregada sob demanda com fallback de CDNs —
   o mesmo padrão do Three.js/GeoTIFF.
   ========================================================================== */
const PC_CDNS=[
  'https://cdn.jsdelivr.net/npm/polygon-clipping@0.15.7/dist/polygon-clipping.umd.min.js',
  'https://unpkg.com/polygon-clipping@0.15.7/dist/polygon-clipping.umd.min.js'];
function ensurePolyClip(){
  if(window.polygonClipping) return Promise.resolve();
  if(S._pc) return S._pc;
  S._pc=(async()=>{
    for(const url of PC_CDNS){
      try{
        await new Promise((res,rej)=>{ const sc=document.createElement('script');
          sc.src=url; sc.onload=res; sc.onerror=()=>rej(new Error('cdn'));
          document.head.appendChild(sc); });
        if(window.polygonClipping) return;
      }catch(e){}
    }
    throw new Error('não foi possível baixar a biblioteca de recorte (verifique a internet)');
  })();
  return S._pc;
}
/* camada de polígonos -> MultiPolygon [[anéis[pts]]] no CRS de trabalho */
/* Um polígono, para a biblioteca de recorte, é [anel externo, furo, furo…].
   Aqui TODOS os anéis da feição viravam um único polígono, então do 2º anel
   em diante tudo virava FURO — e numa feição MULTIPARTE (ilhas separadas,
   como a APP recortada dele) as ilhas eram SUBTRAÍDAS umas das outras em vez
   de somadas. É por isso que o recorte devolvia área ridícula.
   Agora cada anel é classificado: se o ponto representativo cai DENTRO de um
   anel externo já aceito, é furo dele; senão, é uma parte nova. */
function ringsToPolys(rings){
  // Hierarchy, not orientation or the first boundary vertex: a hole may
  // touch its shell at one point, and an island inside that hole is a shell.
  const ordem=rings.filter(r=>r.length>=4).map((r,i)=>({r,i,a:Math.abs(ringArea(r)),point:measureRingInteriorPoint(r),parent:null,depth:0,poly:null})).filter(x=>x.a>1e-12).sort((x,y)=>y.a-x.a);
  for(let i=0;i<ordem.length;i++){
    const item=ordem[i];
    for(let j=0;j<i;j++){const candidate=ordem[j];
      if(candidate.a>item.a&&(!item.parent||candidate.a<item.parent.a)&&measurePointInRing(item.point,candidate.r))item.parent=candidate;
    }
    item.depth=item.parent?item.parent.depth+1:0;
  }
  const polys=[];for(const item of ordem)if(item.depth%2===0){item.poly=[item.r];polys.push(item.poly);}
  for(const item of ordem)if(item.depth%2===1)item.parent.poly.push(item.r);
  return polys;
}
function layerToMP(L){
  const mp=[];
  L.features.forEach(f=>{
    if(!f.geom) return;
    const rings=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
    const conv=rings.map(r=>{
      const q=r.map(pt=>reproj(L.crs,S.workCRS,pt[0],pt[1]));
      // anel fechado (exigência da lib)
      const a=q[0], b=q[q.length-1];
      if(Math.abs(a[0]-b[0])>1e-9||Math.abs(a[1]-b[1])>1e-9) q.push([a[0],a[1]]);
      return q;
    });
    ringsToPolys(conv).forEach(poly=>mp.push(poly));
  });
  return mp;
}
function ringArea(r){return measureRingSignedArea(r);}
function mpToFeatures(mp){
  // resultado da lib -> feições (1 por polígono), com área/perímetro calculados
  const feats=[];
  mp.forEach((poly,i)=>{
    if(!poly.length) return;
    let area=0, per=0;
    poly.forEach((r,ri)=>{ const a=ringArea(r);
      area+= ri===0? Math.abs(a) : -Math.abs(a);
      for(let k=0;k<r.length-1;k++) per+= ri===0? Math.hypot(r[k+1][0]-r[k][0],r[k+1][1]-r[k][1]) : 0;
    });
    feats.push({geom:poly, multi:true,
      props:{FID:i, AREA_M2:+area.toFixed(2), AREA_HA:+(area/1e4).toFixed(4), PERIM_M:+per.toFixed(2)}});
  });
  return feats;
}
async function runSymDiff(){
  const A=S.layers.find(l=>String(l.id)===document.getElementById('sdA').value);
  const B=S.layers.find(l=>String(l.id)===document.getElementById('sdB').value);
  if(!A||!B){ toast('Selecione as duas camadas'); return; }
  if(A===B){ toast('Escolha camadas diferentes'); return; }
  if(A.gtype!=='polygon'||B.gtype!=='polygon'){ toast('Diferença simétrica exige polígonos'); return; }
  showLoad('Carregando biblioteca de recorte…');
  try{ await ensurePolyClip(); }catch(e){ hideLoad(); toast('⚠ '+e.message); return; }
  showLoad('Calculando A △ B…');
  await new Promise(r=>setTimeout(r,10));
  try{
    const t0=performance.now();
    const out=polygonClipping.xor(layerToMP(A), layerToMP(B));
    const feats=mpToFeatures(out);
    const t1=performance.now();
    if(!feats.length){ hideLoad(); toast('Resultado vazio (as camadas são idênticas?)'); return; }
    const fields=[{name:'FID',type:'N',length:9,decimal:0},
      {name:'AREA_M2',type:'N',length:16,decimal:2},{name:'AREA_HA',type:'N',length:12,decimal:4},
      {name:'PERIM_M',type:'N',length:12,decimal:2}];
    addLayer({sourceLayer:A,name:`DifSim ${A.name} △ ${B.name}`.slice(0,60), gtype:'polygon', crs:S.workCRS,
      features:feats, fields});
    hideLoad();
    const aT=feats.reduce((s,f)=>s+f.props.AREA_M2,0);
    document.getElementById('sdOut').innerHTML=
      `<b>${feats.length}</b> polígono(s) · área total <b>${(aT/1e4).toFixed(4)} ha</b> `+
      `(${aT.toFixed(0)} m²) · ${(t1-t0).toFixed(0)} ms\nGeometria que pertence a UMA das camadas mas não às duas.`;
  }catch(e){ hideLoad(); toast('Falha no recorte: '+e.message); }
}
/* -------------------- Mesclar camadas vetoriais -------------------- */
function refreshMergePanel(){
  const box=document.getElementById('mgList'); if(!box) return;
  box.innerHTML=S.layers.length
    ? S.layers.map(l=>`<label class="field" style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:3px 0">
        <input type="checkbox" class="mg-ck" data-id="${l.id}" style="width:auto;accent-color:var(--amber)">
        ${swatchHTML(l)} ${esc(l.name)} <span style="color:var(--ink-dim);font-size:11px">(${l.gtype}, ${l.features.length})</span></label>`).join('')
    : '<div class="hint">Nenhuma camada carregada.</div>';
}
function runMerge(){
  const ids=[...document.querySelectorAll('.mg-ck:checked')].map(i=>+i.dataset.id);
  const Ls=S.layers.filter(l=>ids.includes(l.id));
  if(Ls.length<2){ toast('Marque 2 ou mais camadas'); return; }
  const gt=Ls[0].gtype;
  if(!Ls.every(l=>l.gtype===gt)){ toast('Todas devem ser do MESMO tipo (só '+gt+', p.ex.)'); return; }
  showLoad('Mesclando…');
  setTimeout(()=>{
    // união de campos por nome (o primeiro define tipo/tamanho)
    const fields=[]; const seen=new Set();
    Ls.forEach(l=>(l.fields||[]).forEach(f=>{
      if(!seen.has(f.name)){ seen.add(f.name); fields.push({...f}); } }));
    if(!fields.some(f=>f.name==='ORIGEM'))
      fields.push({name:'ORIGEM',type:'C',length:60,decimal:0});
    const feats=[]; let nz=0;
    Ls.forEach(l=>l.features.forEach(f=>{
      if(!f.geom) return;
      // reprojeta para o CRS de trabalho (as camadas podem estar em fusos diferentes)
      const rings=(l.gtype==='point')?[f.geom]:((f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom]);
      const rp=rings.map(r=>r.map(pt=>[...reproj(l.crs,S.workCRS,pt[0],pt[1]),...pt.slice(2)]));
      const props={}; fields.forEach(fd=>props[fd.name]=f.props&&f.props[fd.name]!==undefined?f.props[fd.name]:null);
      props.ORIGEM=l.name;
      const ft={geom:(l.gtype==='point')?rp[0]:(rp.length>1?rp:rp[0]),
        multi:(l.gtype!=='point')&&rp.length>1, props};
      const zparts=gtZg(f);
      if(zparts){ ft.zg=ft.multi?zparts:zparts[0]; nz++; }
      feats.push(ft);
    }));
    addLayer({sourceLayer:Ls[0],name:'Mescla ('+Ls.length+' camadas)', gtype:gt, crs:S.workCRS, features:feats, fields});
    hideLoad();
    document.getElementById('mgOut').innerHTML=
      `<b>${feats.length}</b> feições de <b>${Ls.length}</b> camadas · ${fields.length} campos (campo ORIGEM adicionado)`+
      (nz?` · ${nz} feições 3D preservadas`:'');
    refreshTinPanel(); refreshGtPanel(); refreshMergePanel();
  },30);
}
function refreshOverlayPanel(){
  ['sdA','sdB'].forEach(id=>{
    const sel=document.getElementById(id); if(!sel) return;
    const cur=sel.value;
    const polys=S.layers.filter(l=>l.gtype==='polygon');
    sel.innerHTML=polys.length
      ? polys.map(l=>`<option value="${l.id}">${esc(l.name)} (${l.features.length})</option>`).join('')
      : '<option value="">— sem camadas de polígono —</option>';
    if(polys.some(l=>String(l.id)===cur)) sel.value=cur;
  });
  const sB=document.getElementById('sdB');
  if(sB && sB.options.length>1) sB.selectedIndex=1;
  refreshMergePanel();
}
function bindOverlayPanel(){
  const b1=document.getElementById('btnSymDiff'); if(b1) b1.onclick=runSymDiff;
  const b2=document.getElementById('btnMerge');   if(b2) b2.onclick=runMerge;
}

/* ============================================================================
   OPERAÇÕES ADICIONAIS — Mosaico de rasters · Poligonizar linhas · Dissolver
   ========================================================================== */

/* ---------------- Mosaico (unir rasters) ---------------- */
/* ============================================================================
   INTERSEÇÃO DE SUPERFÍCIES  +  CORTE DA CAVA POR SUPERFÍCIE
   ========================================================================== */

/* ---------- 1) LINHA DE INTERSEÇÃO ENTRE DUAS SUPERFÍCIES ----------
   A linha onde SupA == SupB é o contorno de nível ZERO da diferença D=A−B.
   Reaproveita marching squares numa grade de diferença amostrada nos centros. */
function refreshIntersectPanel(){
  const a=document.getElementById('ixA'), b=document.getElementById('ixB');
  if(!a||!b) return;
  const opts=S.rasters.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')
    || '<option value="">— nenhuma superfície —</option>';
  const ca=a.value, cb=b.value;
  a.innerHTML=opts; b.innerHTML=opts;
  if(S.rasters.some(r=>String(r.id)===ca)) a.value=ca;
  if(S.rasters.some(r=>String(r.id)===cb)) b.value=cb;
  else if(S.rasters[1]) b.value=S.rasters[1].id;
}
function runIntersect(){
  const A=S.rasters.find(r=>String(r.id)===document.getElementById('ixA').value);
  const B=S.rasters.find(r=>String(r.id)===document.getElementById('ixB').value);
  if(!A||!B){ toast('Escolha duas superfícies'); return; }
  if(A.id===B.id){ toast('Escolha superfícies diferentes'); return; }
  let cs=parseFloat(String(document.getElementById('ixCS').value).replace(',','.'));
  if(!isFinite(cs)||cs<=0) cs=Math.min(A.d.cs,B.d.cs);
  // extensão = interseção das duas (onde ambas existem)
  const ax0=A.d.xll, ay0=A.d.yll, ax1=A.d.xll+A.d.nc*A.d.cs, ay1=A.d.yll+A.d.nr*A.d.cs;
  const bx0=B.d.xll, by0=B.d.yll, bx1=B.d.xll+B.d.nc*B.d.cs, by1=B.d.yll+B.d.nr*B.d.cs;
  const x0=Math.max(ax0,bx0), y0=Math.max(ay0,by0), x1=Math.min(ax1,bx1), y1=Math.min(ay1,by1);
  if(x1-x0<cs||y1-y0<cs){ toast('As superfícies não se sobrepõem'); return; }
  const nc=Math.max(2,Math.ceil((x1-x0)/cs)), nr=Math.max(2,Math.ceil((y1-y0)/cs));
  showLoad(`Interseção ${nc}×${nr}…`);
  setTimeout(()=>{
    // grade da diferença D = A − B (NaN onde qualquer uma falta)
    const z=new Float32Array(nc*nr);
    let nPar=0;
    for(let r=0;r<nr;r++){ const Y=y0+(nr-1-r+0.5)*cs;
      for(let c=0;c<nc;c++){ const X=x0+(c+0.5)*cs;
        const va=sampleZbil(A.d,X,Y), vb=sampleZbil(B.d,X,Y);
        z[r*nc+c]=(isNaN(va)||isNaN(vb))?NaN:(va-vb);
        if(!isNaN(z[r*nc+c])) nPar++;
      }
    }
    if(!nPar){ hideLoad(); toast('Sem sobreposição válida entre as superfícies'); return; }
    // contorno de nível 0 na grade de diferença
    const dGrid={nc,nr,cs,xll:x0,yll:y0,z};
    const lines=contourLevel(dGrid, 0);
    hideLoad();
    if(!lines.length){
      document.getElementById('ixOut').innerHTML='As superfícies não se cruzam (uma está sempre acima da outra).';
      toast('Sem linha de interseção — superfícies não se cruzam'); return;
    }
    // camada de linhas 3D: a cota da interseção é o valor de A na linha
    const feats=lines.map((ln,i)=>{
      const zg=ln.map(p=>{ const v=sampleZbil(A.d,p[0],p[1]); return isFinite(v)?v:NaN; });
      return {geom:ln.map(p=>[p[0],p[1]]), multi:true, zg,
        props:{FID:i, TIPO:'interseção', A:A.name.slice(0,30), B:B.name.slice(0,30)}};
    });
    addLayer({sourceLayer:A,name:`Interseção: ${A.name} × ${B.name}`.slice(0,60), gtype:'line', crs:S.workCRS,
      features:feats, fields:[{name:'FID',type:'N',length:9,decimal:0},
        {name:'TIPO',type:'C',length:12,decimal:0},{name:'A',type:'C',length:30,decimal:0},
        {name:'B',type:'C',length:30,decimal:0}]});
    const nv=feats.reduce((s,f)=>s+f.geom.length,0);
    document.getElementById('ixOut').innerHTML=
      `<b>${lines.length}</b> linha(s) de interseção · ${nv.toLocaleString('pt-BR')} vértices · célula ${cs} m.`;
    toast(`✅ Interseção: ${lines.length} linha(s) onde as superfícies se cruzam`);
    refreshUI();
  },30);
}
/* marching squares para UM nível (usa o mesmo costurador do contourGrid) */
function contourLevel(d, lv){
  const {nc,nr,cs,xll,yll,z}=d;
  const Z=(r,c)=>z[r*nc+c];
  const PX=(r,c)=>[xll+(c+0.5)*cs, yll+(nr-1-r+0.5)*cs];
  const lerp=(p1,p2,v1,v2)=>{ const t=(lv-v1)/(v2-v1);
    return [p1[0]+t*(p2[0]-p1[0]), p1[1]+t*(p2[1]-p1[1])]; };
  const segs=[];
  for(let r=0;r<nr-1;r++) for(let c=0;c<nc-1;c++){
    const v=[Z(r,c),Z(r,c+1),Z(r+1,c+1),Z(r+1,c)];
    if(v.some(isNaN)) continue;
    const p=[PX(r,c),PX(r,c+1),PX(r+1,c+1),PX(r+1,c)];
    const pts=[];
    for(let e=0;e<4;e++){ const a=e,b=(e+1)%4;
      if((v[a]<lv)!==(v[b]<lv)) pts.push(lerp(p[a],p[b],v[a],v[b])); }
    if(pts.length===2) segs.push(pts);
    else if(pts.length===4){ segs.push([pts[0],pts[1]]); segs.push([pts[2],pts[3]]); }
  }
  if(!segs.length) return [];
  // costura em polilinhas
  const key=q=>q[0].toFixed(3)+','+q[1].toFixed(3);
  const idx=new Map();
  segs.forEach((s,i)=>{ [0,1].forEach(e=>{ const k=key(s[e]);
    if(!idx.has(k)) idx.set(k,[]); idx.get(k).push([i,e]); }); });
  const used=new Array(segs.length).fill(false);
  const lines=[];
  for(let i=0;i<segs.length;i++){
    if(used[i]) continue; used[i]=true;
    let line=[segs[i][0].slice(), segs[i][1].slice()];
    for(let dir=0;dir<2;dir++){
      let guard=segs.length+2;
      while(guard-->0){
        const tip=line[line.length-1];
        const cand=(idx.get(key(tip))||[]).find(([j])=>!used[j]);
        if(!cand){ break; }
        const [j,e]=cand; used[j]=true;
        const nx=segs[j][1-e];
        line.push(nx.slice());
      }
      line.reverse();
    }
    if(line.length>=2) lines.push(line);
  }
  return lines;
}

/* ---------- 2) CORTE DE FEIÇÕES POR SUPERFÍCIE ----------
   Divide cada polilinha/polígono da camada nos pontos onde ela cruza uma
   superfície de referência, mantendo só os trechos ACIMA (ou ABAIXO) dela.
   Uso típico: sobra da cava acima do greide de projeto -> depósito de estéril;
   ou recortar a cava executada abaixo do projeto.                            */
function refreshCutPanel(){
  const lay=document.getElementById('ctuLayer'), lim=document.getElementById('ctuLimit');
  if(!lay||!lim) return;
  const cands=S.layers.filter(l=>l.gtype==='line'||l.gtype==='polygon');
  const cl=lay.value, cli=lim.value;
  const rot=l=>`${esc(l.name)} (${l.gtype==='line'?'linhas':'polígonos'}, ${l.features.length}${l.features.some(f=>f.zg)?' · 3D':''})`;
  lay.innerHTML=cands.map(l=>`<option value="${l.id}">${rot(l)}</option>`).join('')
    || '<option value="">— sem linhas/polígonos —</option>';
  if(cands.some(l=>String(l.id)===cl)) lay.value=cl;
  else { const pref=cands.find(l=>/cava|dce|est[ée]ril|deposito|dep[óo]sito|lavra/i.test(l.name)&&!/interse|_c$/i.test(l.name));
    if(pref) lay.value=pref.id; }
  // linha-limite: só camadas de LINHA (a interseção)
  const lims=S.layers.filter(l=>l.gtype==='line');
  lim.innerHTML=lims.map(l=>`<option value="${l.id}">${rot(l)}</option>`).join('')
    || '<option value="">— sem camadas de linha —</option>';
  if(lims.some(l=>String(l.id)===cli)) lim.value=cli;
  else { const pref=lims.find(l=>/interse|limite|_c$/i.test(l.name));
    if(pref) lim.value=pref.id; }
}
/* geometria: interseções segmento×polilinha e teste de lado */
function segInt(p1,p2,p3,p4){
  const d=(p2[0]-p1[0])*(p4[1]-p3[1])-(p2[1]-p1[1])*(p4[0]-p3[0]);
  if(Math.abs(d)<1e-12) return null;
  const t=((p3[0]-p1[0])*(p4[1]-p3[1])-(p3[1]-p1[1])*(p4[0]-p3[0]))/d;
  const u=((p3[0]-p1[0])*(p2[1]-p1[1])-(p3[1]-p1[1])*(p2[0]-p1[0]))/d;
  if(t<-1e-9||t>1+1e-9||u<-1e-9||u>1+1e-9) return null;
  return {t, p:[p1[0]+t*(p2[0]-p1[0]), p1[1]+t*(p2[1]-p1[1])]};
}
/* corta uma polilinha nos cruzamentos com a linha-limite (multi-segmento) */
/* ===========================================================================
   ÍNDICE ESPACIAL DE SEGMENTOS
   O corte por linha-limite era O(vértices da cava × segmentos do limite). Com
   800 mil vértices e dezenas de milhares de segmentos isso passa de 10^10
   operações — trava a aba sem terminar. A grade uniforme abaixo reduz cada
   consulta aos segmentos de algumas células vizinhas.
   =========================================================================== */
function gradeSegs(segs){
  let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
  for(const s of segs){
    for(const p of s){
      if(p[0]<mnX)mnX=p[0]; if(p[0]>mxX)mxX=p[0];
      if(p[1]<mnY)mnY=p[1]; if(p[1]>mxY)mxY=p[1];
    }
  }
  const W=Math.max(1e-6,mxX-mnX), H=Math.max(1e-6,mxY-mnY);
  const n=Math.max(1, Math.min(512, Math.round(Math.sqrt(segs.length))||1));
  const cw=W/n, ch=H/n;
  const cel=new Map();
  const ij=(i,j)=>i*100000+j;
  segs.forEach((s,k)=>{
    const i0=Math.floor((Math.min(s[0][0],s[1][0])-mnX)/cw), i1=Math.floor((Math.max(s[0][0],s[1][0])-mnX)/cw);
    const j0=Math.floor((Math.min(s[0][1],s[1][1])-mnY)/ch), j1=Math.floor((Math.max(s[0][1],s[1][1])-mnY)/ch);
    for(let i=i0;i<=i1;i++) for(let j=j0;j<=j1;j++){
      const key=ij(i,j); let a=cel.get(key); if(!a){ a=[]; cel.set(key,a); } a.push(k);
    }
  });
  const caixa=(x0,y0,x1,y1,saida)=>{
    const i0=Math.floor((x0-mnX)/cw), i1=Math.floor((x1-mnX)/cw);
    const j0=Math.floor((y0-mnY)/ch), j1=Math.floor((y1-mnY)/ch);
    for(let i=i0;i<=i1;i++) for(let j=j0;j<=j1;j++){
      const a=cel.get(ij(i,j)); if(a) for(const k of a) saida.add(k);
    }
    return saida;
  };
  const nI=Math.ceil(W/cw)+1, nJ=Math.ceil(H/ch)+1;
  const passo=Math.min(cw,ch);
  const visto=new Int32Array(segs.length); let sel=0;
  const testa=(i,j,px,py,st)=>{
    const arr=cel.get(ij(i,j)); if(!arr) return st;
    for(const k of arr){
      if(visto[k]===sel) continue; visto[k]=sel;
      const q1=segs[k][0], q2=segs[k][1];
      const dx=q2[0]-q1[0], dy=q2[1]-q1[1], L2=dx*dx+dy*dy;
      let t=L2>0?((px-q1[0])*dx+(py-q1[1])*dy)/L2:0;
      t=t<0?0:(t>1?1:t);
      const ex=px-(q1[0]+t*dx), ey=py-(q1[1]+t*dy), d=ex*ex+ey*ey;
      if(d<st.d2){ st.d2=d; st.k=k; }
    }
    return st;
  };
  return {segs, cw, ch, mnX, mnY, mxX, mxY, caixa,
    /* segmento mais próximo: varre ANEL a ANEL (só o perímetro de cada anel,
       não a caixa inteira) e para quando o melhor já está dentro do raio      */
    maisProx(px,py){
      const i0=Math.floor((px-mnX)/cw), j0=Math.floor((py-mnY)/ch);
      const st={k:-1,d2:Infinity};
      sel++;
      const maxA=Math.max(nI,nJ);
      for(let a=0;a<=maxA;a++){
        if(a===0) testa(i0,j0,px,py,st);
        else{
          for(let i=i0-a;i<=i0+a;i++){ testa(i,j0-a,px,py,st); testa(i,j0+a,px,py,st); }
          for(let j=j0-a+1;j<=j0+a-1;j++){ testa(i0-a,j,px,py,st); testa(i0+a,j,px,py,st); }
        }
        if(st.k>=0){ const R=a*passo; if(st.d2<=R*R) break; }
      }
      return st;
    }};
}
function splitByLimit(W, zf, limitSegs, idx){
  // devolve lista de sub-trechos {pts,zg}, quebrados a cada cruzamento
  const parts=[]; let cur={pts:[W[0].slice()], zg:[zf[0]]};
  for(let i=0;i<W.length-1;i++){
    const a=W[i], b=W[i+1];
    // todos os cruzamentos deste segmento com o limite, ordenados por t.
    // Com índice, só os segmentos cuja célula toca a caixa do trecho.
    const hits=[];
    if(idx){
      const cand=idx.caixa(Math.min(a[0],b[0]),Math.min(a[1],b[1]),
                           Math.max(a[0],b[0]),Math.max(a[1],b[1]), new Set());
      for(const k of cand){ const [q1,q2]=idx.segs[k];
        const r=segInt(a,b,q1,q2); if(r) hits.push(r); }
    } else {
      for(const [q1,q2] of limitSegs){ const r=segInt(a,b,q1,q2); if(r) hits.push(r); }
    }
    hits.sort((x,y)=>x.t-y.t);
    for(const h of hits){
      const z=zf[i]+(zf[i+1]-zf[i])*h.t;
      cur.pts.push(h.p.slice()); cur.zg.push(z);
      if(cur.pts.length>=2) parts.push(cur);
      cur={pts:[h.p.slice()], zg:[z]};
    }
    cur.pts.push(b.slice()); cur.zg.push(zf[i+1]);
  }
  if(cur.pts.length>=2) parts.push(cur);
  return parts;
}
function cutFeaturesBySurface(L, surf, keepAbove, offset){
  // devolve novas feições (mesmo gtype) contendo só os trechos mantidos
  const zRef=(x,y)=>{ const v=sampleZbil(surf.d,x,y); return isFinite(v)?v+offset:NaN; };
  const zOf=(f)=>{
    // Z da feição: da geometria (zg) ou amostrado da própria superfície? Precisamos
    // do Z REAL da feição (a cava). Sem zg não dá para comparar cotas de forma robusta.
    if(f.zg){ const nested=(f.multi&&Array.isArray(f.geom[0][0])); return nested?f.zg:[f.zg]; }
    return null;
  };
  const out=[]; let semZ=0, foraDomínio=0;
  const proc=(ring, zgRing, closed)=>{
    // classifica cada vértice: mantido (lado certo) ou não; corta nas transições
    const W=ring.map(pt=>reproj(L.crs, S.workCRS, pt[0], pt[1]));
    const n=W.length;
    const zf=zgRing || new Array(n).fill(NaN);
    const keep=[]; // sub-trechos mantidos
    let cur=null;
    const inside=(i)=>{
      const zr=zRef(W[i][0],W[i][1]);
      if(isNaN(zr)){ foraDomínio++; return null; }
      const zv=zf[i];
      if(!isFinite(zv)){ semZ++; return null; }
      return keepAbove? (zv>=zr) : (zv<=zr);
    };
    const crossPt=(i,j)=>{
      // interpola o ponto onde zv cruza zr entre i e j
      const zra=zRef(W[i][0],W[i][1]), zrb=zRef(W[j][0],W[j][1]);
      const za=zf[i], zb=zf[j];
      const da=za-zra, db=zb-zrb;
      let t=0.5; if(isFinite(da)&&isFinite(db)&&(db-da)!==0) t=da/(da-db);
      t=Math.max(0,Math.min(1,t));
      return {p:[W[i][0]+t*(W[j][0]-W[i][0]), W[i][1]+t*(W[j][1]-W[i][1])],
        z: za+t*(zb-za)};
    };
    for(let i=0;i<n;i++){
      const ins=inside(i);
      if(ins===true){
        if(!cur){ cur={pts:[],zg:[],cutStart:false,cutEnd:false};
          const prev=(i>0)?i-1:(closed?n-1:-1);
          if(prev>=0 && inside(prev)===false){ const x=crossPt(prev,i);
            cur.pts.push(x.p); cur.zg.push(x.z); cur.cutStart=true; }  // ponta sobre a superfície
        }
        cur.pts.push(W[i].slice()); cur.zg.push(zf[i]);
      } else {
        if(cur){ const x=crossPt(i-1,i); cur.pts.push(x.p); cur.zg.push(x.z);
          cur.cutEnd=true;                                             // ponta sobre a superfície
          if(cur.pts.length>=2) keep.push(cur); cur=null;
        }
      }
    }
    if(cur && cur.pts.length>=2) keep.push(cur);
    return keep;
  };
  const segs=[];   // trechos em WORK CRS, com marcação de pontas de corte
  L.features.forEach(f=>{
    if(!f.geom) return;
    const rings=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
    const zg=zOf(f);
    rings.forEach((ring,ri)=>{
      const zgRing=zg? (Array.isArray(zg[ri])?zg[ri]:zg[ri]) : null;
      const kept=proc(ring, zgRing, L.gtype==='polygon');
      kept.forEach(k=>{
        segs.push({pts:k.pts, zg:k.zg, cutStart:k.cutStart, cutEnd:k.cutEnd, props:f.props});
        const back=k.pts.map(p=>reproj(S.workCRS,L.crs,p[0],p[1]));
        out.push({geom:back, multi:true, zg:k.zg.slice(),
          props:{...f.props, FID:out.length, CORTE:keepAbove?'acima':'abaixo'}});
      });
    });
  });
  return {out, segs, semZ, foraDomínio};
}
/* Costura os trechos cortados FECHANDO os contornos ao longo da linha de
   interseção (onde as feições cruzam a superfície). Cada trecho tem 0, 1 ou 2
   pontas "de corte" (sobre a superfície); pontas de corte próximas são unidas,
   e as lacunas restantes são fechadas seguindo os segmentos da interseção.
   Devolve anéis fechados (linhas), preservando o zg.                          */
function sewClosedContours(segs, ixLines, tol){
  // 1) trechos que já são anéis fechados (cutStart&&cutEnd e pontas coincidem)
  const rings=[]; const abertos=[];
  segs.forEach(s=>{
    const a=s.pts[0], b=s.pts[s.pts.length-1];
    if(s.pts.length>=4 && Math.hypot(a[0]-b[0],a[1]-b[1])<=tol){
      rings.push({pts:s.pts.slice(), zg:s.zg.slice(), props:s.props, closed:true});
    } else abertos.push(s);
  });
  // 2) pool de sub-segmentos da linha de interseção (podem preencher lacunas)
  const ixSegs=[];
  (ixLines||[]).forEach(ln=>{ for(let i=0;i<ln.length-1;i++)
    ixSegs.push({a:ln[i], b:ln[i+1]}); });
  const K=p=>Math.round(p[0]/tol)+'|'+Math.round(p[1]/tol);
  // índice de extremidades dos trechos abertos
  const usados=new Array(abertos.length).fill(false);
  const near=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1])<=tol;
  // caminho da interseção entre dois pontos (segue ixSegs por proximidade)
  const pathAlongIx=(from,to,maxHops)=>{
    if(!ixSegs.length) return [to.slice()];   // sem linha: fecha reto
    let cur=from, path=[], hops=0;
    const usedIx=new Set();
    while(hops++<maxHops){
      // segmento de ix cuja extremidade está mais perto de 'cur' e ainda não usado
      let best=-1,bend=0,bd=Infinity;
      ixSegs.forEach((sg,i)=>{ if(usedIx.has(i))return;
        [[sg.a,sg.b],[sg.b,sg.a]].forEach(([e0,e1],e)=>{
          const d=Math.hypot(e0[0]-cur[0],e0[1]-cur[1]);
          if(d<bd){ bd=d; best=i; bend=e; } });
      });
      if(best<0 || bd>tol*6) break;
      usedIx.add(best);
      const sg=ixSegs[best];
      const end=(bend===0)?sg.b:sg.a;
      path.push(end.slice()); cur=end;
      if(near(cur,to)) break;
    }
    path.push(to.slice());
    return path;
  };
  // 3) encadeia trechos abertos: ...trecho -> caminho de ix -> próximo trecho...
  // tolerância de emenda: pontas-vértice coincidentes (fecho do anel original) usam
  // tol pequeno; pontas de corte distantes são unidas ao longo da interseção (tol maior)
  const tolV=tol*0.5;
  for(let s=0;s<abertos.length;s++){
    if(usados[s]) continue;
    usados[s]=true;
    let chain=abertos[s].pts.map(p=>p.slice());
    let chainZ=abertos[s].zg.slice();
    const props=abertos[s].props;
    const headCut=abertos[s].cutStart; let tailCut=abertos[s].cutEnd;   // pontas sobre a superfície?
    let guard=abertos.length*2+4;
    while(guard-->0){
      const head=chain[0], tail=chain[chain.length-1];
      if(chain.length>=4 && near(head,tail)){ chain.push(head.slice()); chainZ.push(chainZ[0]); break; }
      // melhor emenda no TAIL: qualquer ponta de qualquer trecho não usado
      let best=-1, rev=false, bd=Infinity;
      for(let j=0;j<abertos.length;j++){ if(usados[j])continue;
        const A=abertos[j].pts[0], B=abertos[j].pts[abertos[j].pts.length-1];
        const dA=Math.hypot(A[0]-tail[0],A[1]-tail[1]);
        const dB=Math.hypot(B[0]-tail[0],B[1]-tail[1]);
        if(dA<bd){bd=dA;best=j;rev=false;}
        if(dB<bd){bd=dB;best=j;rev=true;}
      }
      if(best<0 || bd>tol*6) break;
      const nx=abertos[best];
      const npts=rev? nx.pts.slice().reverse() : nx.pts.slice();
      const nzg =rev? nx.zg.slice().reverse()  : nx.zg.slice();
      if(bd>tolV){ chain.push(npts[0].slice()); chainZ.push(npts[0][2]!==undefined?npts[0][2]:chainZ[chainZ.length-1]); }
      usados[best]=true;
      tailCut = rev? nx.cutStart : nx.cutEnd;      // ponta atual do caminho
      chain=chain.concat(npts.slice(1));
      chainZ=chainZ.concat(nzg.slice(1));
    }
    const h=chain[0], t=chain[chain.length-1];
    const dHT=Math.hypot(h[0]-t[0],h[1]-t[1]);
    let fechou=near(h,t);
    // fecha a BOCA quando ambas as pontas estão sobre o terreno (pontos de corte):
    // a lacuna é a própria linha de interseção -> liga (reta na escala local)
    if(!fechou && chain.length>=4 && ((headCut&&tailCut) || dHT<=tol*6)){
      chain.push(h.slice()); chainZ.push(chainZ[0]); fechou=true;
    }
    if(chain.length>=4) rings.push({pts:chain, zg:chainZ, props, closed:fechou});
  }
  return rings;
}
/* Costura fragmentos de linha (extremidade-a-extremidade) em cadeias contínuas.
   A linha de interseção costuma vir picada; sem costurar, o teste de lado é
   ambíguo. Devolve lista de polilinhas (cadeias).                            */
function sewChains(segs, tol){
  const S2=segs.map(s=>s.map(p=>p.slice()));
  const used=new Array(S2.length).fill(false);
  const near=(a,b)=>((a[0]-b[0])**2+(a[1]-b[1])**2)<=tol*tol;
  const chains=[];
  for(let i=0;i<S2.length;i++){
    if(used[i]) continue; used[i]=true;
    let chain=S2[i].slice();
    let changed=true;
    while(changed){ changed=false;
      const tail=chain[chain.length-1], head=chain[0];
      for(let j=0;j<S2.length;j++){ if(used[j]) continue;
        const a=S2[j][0], b=S2[j][S2[j].length-1];
        if(near(tail,a)){ chain=chain.concat(S2[j].slice(1)); used[j]=true; changed=true; break; }
        if(near(tail,b)){ chain=chain.concat(S2[j].slice().reverse().slice(1)); used[j]=true; changed=true; break; }
        if(near(head,b)){ chain=S2[j].slice(0,-1).concat(chain); used[j]=true; changed=true; break; }
        if(near(head,a)){ chain=S2[j].slice().reverse().slice(0,-1).concat(chain); used[j]=true; changed=true; break; }
      }
    }
    chains.push(chain);
  }
  return chains;
}
/* ponto-em-polígono (ray casting) — para cadeias fechadas.
   Com índice por faixas de Y, só as arestas que cruzam a linha do ponto são
   testadas: de O(vértices do anel) por consulta para O(poucas arestas).      */
function indiceAnel(ring){
  let mnY=Infinity,mxY=-Infinity;
  for(const p of ring){ if(p[1]<mnY)mnY=p[1]; if(p[1]>mxY)mxY=p[1]; }
  const nb=Math.max(1, Math.min(2048, Math.round(Math.sqrt(ring.length))||1));
  const h=Math.max(1e-9,(mxY-mnY)/nb);
  const faixas=Array.from({length:nb},()=>[]);
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const y0=Math.min(ring[i][1],ring[j][1]), y1=Math.max(ring[i][1],ring[j][1]);
    let b0=Math.floor((y0-mnY)/h), b1=Math.floor((y1-mnY)/h);
    b0=Math.max(0,Math.min(nb-1,b0)); b1=Math.max(0,Math.min(nb-1,b1));
    for(let b=b0;b<=b1;b++) faixas[b].push([i,j]);
  }
  return {ring,mnY,h,nb,faixas};
}
function pointInRing(px,py,ring,idx){
  if(idx && idx.ring===ring){
    const b=Math.floor((py-idx.mnY)/idx.h);
    if(b<0||b>=idx.nb) return false;
    let inside=false;
    for(const [i,j] of idx.faixas[b]){
      const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
      if(((yi>py)!==(yj>py)) && px < (xj-xi)*(py-yi)/(yj-yi)+xi) inside=!inside;
    }
    return inside;
  }
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    if(((yi>py)!==(yj>py)) && px < (xj-xi)*(py-yi)/(yj-yi)+xi) inside=!inside;
  }
  return inside;
}
function runCutByLimit(){
  const L=S.layers.find(l=>String(l.id)===document.getElementById('ctuLayer').value);
  const Lim=S.layers.find(l=>String(l.id)===document.getElementById('ctuLimit').value);
  if(!L||!Lim){ toast('Escolha a camada da cava e a linha-limite'); return; }
  if(L.id===Lim.id){ toast('A camada e o limite não podem ser a mesma'); return; }
  const keepIn=document.getElementById('ctuSide').value==='in';
  const unir=document.getElementById('ctuJoin').value==='yes';
  showLoad('Cortando pela linha-limite…');
  setTimeout(async ()=>{
    // segmentos do limite em WORK CRS
    const limitSegs=[]; const limPts=[];
    Lim.features.forEach(f=>{ if(!f.geom) return;
      const rings=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
      rings.forEach(r=>{ const W=r.map(pt=>reproj(Lim.crs,S.workCRS,pt[0],pt[1]));
        for(let i=0;i<W.length-1;i++) limitSegs.push([W[i],W[i+1]]);
        W.forEach(p=>limPts.push(p));
      });
    });
    if(!limitSegs.length){ hideLoad(); toast('Linha-limite vazia'); return; }
    // COSTURA os fragmentos do limite em cadeias contínuas (a interseção vem picada).
    const rawSegs=[]; { const byFeat=new Map();
      // reconstrói polilinhas do limite (não só segmentos soltos) p/ costurar
    }
    const limPolys=[]; Lim.features.forEach(f=>{ if(!f.geom) return;
      const rings=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
      rings.forEach(r=>{ if(r.length>=2) limPolys.push(r.map(pt=>reproj(Lim.crs,S.workCRS,pt[0],pt[1]))); });
    });
    let cx=0,cy=0; limPts.forEach(p=>{cx+=p[0];cy+=p[1];}); cx/=limPts.length; cy/=limPts.length;
    // costura progressiva: aumenta a tolerância até unir num contorno contínuo.
    // Fragmentos soltos dão teste de lado instável (o defeito do 'vaza'); a cadeia
    // ÚNICA e longa é estável mesmo aberta.
    // O limite pode ter VÁRIOS polígonos (multi-poligonal): a costura para
    // assim que todos os anéis significativos FECHAM — não força uma cadeia
    // única, senão a tolerância alta cola polígonos vizinhos entre si.
    let chains=null, tolUsada=5;
    for(const t of [1,3,5,10,15,25,40]){
      const cs2=sewChains(limPolys, t);
      const fechTol=Math.max(t,5);
      const abertas=cs2.filter(c=>c.length>=4 &&
        Math.hypot(c[0][0]-c[c.length-1][0],c[0][1]-c[c.length-1][1])>fechTol).length;
      chains=cs2; tolUsada=t;
      if(abertas===0) break;
    }
    chains.sort((a,b)=>b.length-a.length);
    let mainChain=chains[0];
    // extensão do limite p/ decidir se um anel fechado é "grande" (não micro-loop)
    let LxMn=Infinity,LxMx=-Infinity,LyMn=Infinity,LyMx=-Infinity;
    limPts.forEach(p=>{ if(p[0]<LxMn)LxMn=p[0]; if(p[0]>LxMx)LxMx=p[0];
      if(p[1]<LyMn)LyMn=p[1]; if(p[1]>LyMx)LyMx=p[1]; });
    const diag=Math.hypot(LxMx-LxMn, LyMx-LyMn);
    const ringSpan=c=>{ let a=Infinity,b=-Infinity,cc=Infinity,dd=-Infinity;
      c.forEach(p=>{if(p[0]<a)a=p[0];if(p[0]>b)b=p[0];if(p[1]<cc)cc=p[1];if(p[1]>dd)dd=p[1];});
      return Math.hypot(b-a,dd-cc); };
    // TODO anel fechado conta como polígono do limite — inclusive os pequenos
    // (a poligonal pode ter várias ilhas). Micro-loops criados pela costura
    // são descartados por ÁREA (≥ 0,1% do maior anel) e extensão mínima.
    const areaAnel=r=>{ let s=0; for(let i=0,j=r.length-1;i<r.length;j=i++)
      s+=r[j][0]*r[i][1]-r[i][0]*r[j][1]; return Math.abs(s/2); };
    const fechados=chains.filter(c=>c.length>=4 &&
      Math.hypot(c[0][0]-c[c.length-1][0],c[0][1]-c[c.length-1][1])<=Math.max(5,diag*0.02));
    const mxArea=fechados.length?Math.max(...fechados.map(areaAnel)):0;
    const bigRings=fechados.filter(c=>areaAnel(c)>=1 &&
      ringSpan(c)>=3*tolUsada);
    // Dentro-fora por PARIDADE sobre TODOS os anéis fechados significativos.
    // VALIDADO com o projeto Supremo: reproduz a _c de referência (11,16 km)
    // com 92,7% de concordância trecho a trecho — anéis aninhados dão a
    // paridade correta de profundidade (dentro de 2 anéis = fora de novo,
    // que é o certo para a linha de interseção MDT×cava).
    const usePIP=bigRings.length>0;
    // sideOf usa a CADEIA MAIS LONGA (contínua), não fragmentos soltos
    const mainSegs=[]; for(let i=0;i<mainChain.length-1;i++) mainSegs.push([mainChain[i],mainChain[i+1]]);
    const idxMain=gradeSegs(mainSegs);
    const idxLim =gradeSegs(limitSegs);
    const sideOf=(px,py)=>{
      const r=idxMain.maisProx(px,py);
      if(r.k<0) return 0;
      const [q1,q2]=mainSegs[r.k];
      return Math.sign((q2[0]-q1[0])*(py-q1[1])-(q2[1]-q1[1])*(px-q1[0]));
    };
    // lado de referência = o lado da MAIORIA dos vértices da própria cava
    // (a cava está majoritariamente de um lado do limite)
    // amostra: a maioria não muda com 800 mil pontos, e testar todos custa minutos
    let vTot=0;
    L.features.forEach(f=>{ if(!f.geom) return;
      const rings=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
      rings.forEach(r=>{ vTot+=r.length; }); });
    const passoV=Math.max(1, Math.floor(vTot/20000));
    let vp=0,vm=0,cnt=0;
    L.features.forEach(f=>{ if(!f.geom) return;
      const rings=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
      rings.forEach(r=>r.forEach(pt=>{
        if((cnt++ % passoV)!==0) return;
        const w=reproj(L.crs,S.workCRS,pt[0],pt[1]);
        const sd=sideOf(w[0],w[1]); if(sd>0)vp++; else if(sd<0)vm++; })); });
    const sideC = vp>=vm ? 1 : -1;   // lado dominante da cava = "dentro"
    const idxRings=usePIP? bigRings.map(indiceAnel) : null;
    const isInside=(px,py)=>{
      if(usePIP){ let n=0;
        for(let i=0;i<bigRings.length;i++) if(pointInRing(px,py,bigRings[i],idxRings[i])) n++;
        return (n%2)===1; }
      return sideOf(px,py)===sideC;
    };
    const zOf=f=>{ if(f.zg){ const nested=(f.multi&&Array.isArray(f.geom[0][0])); return nested?f.zg:[f.zg]; } return null; };
    const kept=[]; let semZ=0, nCortes=0;
    const nFeat=L.features.length; let iFeat=0;
    for(const f of L.features){
      iFeat++;
      if((iFeat & 31)===0){                       // respira: página nunca "trava"
        await respira();
        if(nFeat>500) showLoad(`Cortando pela linha-limite — ${(100*iFeat/nFeat).toFixed(0)}%`);
      }
      if(!f.geom) continue;
      const rings=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
      const zg=zOf(f);
      rings.forEach((r,ri)=>{
        const W=r.map(pt=>reproj(L.crs,S.workCRS,pt[0],pt[1]));
        const zr=zg?(Array.isArray(zg[ri])?zg[ri]:zg[ri]):new Array(W.length).fill(NaN);
        if(zr.some(v=>!isFinite(v))) semZ++;
        const parts=splitByLimit(W, zr, limitSegs, idxLim);
        if(parts.length>1) nCortes++;
        parts.forEach(pt=>{
          // VOTAÇÃO: testa vários pontos do trecho (evita erro quando o meio
          // cai exatamente sobre o limite ou num fragmento ambíguo)
          let votIn=0, votTot=0;
          const step=Math.max(1, Math.floor(pt.pts.length/5));
          for(let vi=0; vi<pt.pts.length; vi+=step){
            const q=pt.pts[vi]; votTot++; if(isInside(q[0],q[1])) votIn++;
          }
          const dentro = votIn*2 >= votTot;   // maioria dos pontos dentro
          if(dentro===keepIn){
            const back=pt.pts.map(q=>reproj(S.workCRS,L.crs,q[0],q[1]));
            kept.push({geom:back, multi:true, zg:pt.zg.slice(),
              props:{...f.props, FID:kept.length, ORIG:'cava'}});
          }
        });
      });
    }
    // une a própria linha-limite na saída
    if(unir){
      Lim.features.forEach(f=>{ if(!f.geom) return;
        const rings=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
        const zg=zOf(f);
        rings.forEach((r,ri)=>{
          const zr=zg?(Array.isArray(zg[ri])?zg[ri]:zg[ri]):null;
          const feat={geom:r.map(p=>[p[0],p[1]]), multi:true, props:{FID:kept.length, ORIG:'limite'}};
          // reprojeta limite p/ o CRS da camada de saída
          feat.geom=r.map(p=>reproj(Lim.crs,L.crs,p[0],p[1]));
          if(zr) feat.zg=zr.slice();
          kept.push(feat);
        });
      });
    }
    hideLoad();
    if(!kept.length){ document.getElementById('ctuOut').innerHTML='Nenhum trecho no lado escolhido.';
      toast('Nada mantido — inverta o lado?'); return; }
    const base=L.name.replace(/_c$/,'');
    const fields=[...(L.fields||[]).filter(f=>f.name!=='FID'),
      {name:'FID',type:'N',length:9,decimal:0},{name:'ORIG',type:'C',length:8,decimal:0}];
    const cLayer=addLayer({sourceLayer:L,name:(base+'_c').slice(0,60), gtype:'line', crs:L.crs, features:kept, fields});
    const nLim=unir?Lim.features.reduce((s,f)=>s+((f.multi&&Array.isArray(f.geom[0][0]))?f.geom.length:1),0):0;
    let msg=`<b>${kept.length-nLim}</b> trecho(s) da cava (${keepIn?'dentro':'fora'})`+
      (unir?` + <b>${nLim}</b> do limite`:'')+
      (usePIP?` · <b>${bigRings.length}</b> polígono(s) no limite`:'')+
      ` · ${nCortes} linha(s) cortada(s)`+(semZ?` · ${semZ} sem Z`:'')+'.';
    // MDT da camada cortada
    const querMDT=document.getElementById('ctuMDT').checked;
    if(querMDT){
      const temZ=kept.some(f=>f.zg);
      if(!temZ){ msg+='<br><span style="color:var(--warn,#e0a)">Sem Z na _c — MDT não gerado.</span>'; }
      else {
        let mcs=parseFloat(String(document.getElementById('ctuCS').value).replace(',','.'));
        if(!isFinite(mcs)||mcs<=0) mcs=2;
        showLoad('Gerando MDT da cava cortada…');
        await new Promise(r=>setTimeout(r,10));
        // o contorno do MDT é a PRÓPRIA linha-limite do corte — costurada em anel.
        // Para o MDT usam-se SÓ OS ANÉIS EXTERNOS (não contidos em nenhum outro):
        // a paridade completa sobre anéis aninhados removeria faixas alternadas
        // e deixava o MDT cheio de vazios; o recorte externo dá a superfície
        // contínua até o limite, como a versão clássica (anéis grandes) fazia.
        let clipRings=null;
        try{
          clipRings=(typeof tinRecorte==='function')? tinRecorte(Lim) : null;
          if(clipRings && clipRings.length>1 && typeof indiceAnel==='function'){
            const idxC=clipRings.map(indiceAnel);
            clipRings=clipRings.filter((r,i)=>{
              const p=r[0]; if(!p) return true;
              for(let j=0;j<clipRings.length;j++){
                if(i===j) continue;
                if(pointInRing(p[0],p[1],clipRings[j],idxC[j])) return false; // interno
              }
              return true;                                                    // externo
            });
          }
          if(!clipRings || !clipRings.length){
            const cs2=(typeof sewChains==='function')? sewChains(limPolys, Math.max(2,mcs*3)) : limPolys;
            clipRings=cs2.filter(c=>c.length>=3).map(c=>{ const a=c[0],b=c[c.length-1];
              return Math.hypot(a[0]-b[0],a[1]-b[1])>1e-6 ? c.concat([a.slice()]) : c; });
          }
        }catch(e){ clipRings=null; }
        const res=await buildTINFromLayer(cLayer||S.layers[S.layers.length-1], mcs, 0,
          {name:`${base}_c — MDT TIN (${mcs} m)`, clipRings});
        if(res.err){ msg+=`<br><span style="color:var(--warn,#e0a)">MDT: ${res.err}</span>`; }
        else {
          try{ if(res.raster.overlay && res.raster.overlay.getBounds) safeFit(res.raster.overlay.getBounds()); }catch(e){}
          msg+=`<br>✅ MDT <b>${res.nc}×${res.nr}</b> · cotas ${res.zmn.toFixed(1)}–${res.zmx.toFixed(1)} m`+
               (res.nCort? ` · <b>${res.nCort.toLocaleString('pt-BR')}</b> célula(s) fora do limite removida(s).` : '.');
        }
      }
    }
    hideLoad();
    document.getElementById('ctuOut').innerHTML=msg;
    toast(`✅ "${base}_c": ${kept.length} feição(ões)`+(querMDT?' + MDT':''));
    refreshUI();
  },30);
}
function bindSurfOpsPanel(){
  const b1=document.getElementById('btnIntersect'); if(b1) b1.onclick=runIntersect;
  const b2=document.getElementById('btnCutLimit');  if(b2) b2.onclick=runCutByLimit;
}

function refreshMosaicPanel(){
  const box=document.getElementById('moList'); if(!box) return;
  box.innerHTML=S.rasters.length
    ? S.rasters.map(r=>`<label class="field" style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:3px 0">
        <input type="checkbox" class="mo-ck" data-id="${r.id}" style="width:auto;accent-color:var(--amber)">
        ${esc(r.name)} <span style="color:var(--ink-dim);font-size:11px">(${r.d.nc}×${r.d.nr} · ${r.d.cs.toFixed(2)} m)</span></label>`).join('')
    : '<div class="hint">Nenhuma superfície carregada.</div>';
  const gs=document.getElementById('moGrade');
  if(gs){
    const old=gs.value;
    gs.innerHTML='<option value="">— primeiro raster marcado —</option>'+
      S.rasters.map(r=>`<option value="${r.id}">${esc(r.name)} · resolução original</option>`).join('');
    if(S.rasters.some(r=>String(r.id)===String(old)))gs.value=old;
  }
  const bf=document.getElementById('btnProjectFolder');
  if(bf&&!bf._bound){bf._bound=true;bf.onclick=projectChooseFolder;}
  projectDirs(false).then(ds=>{if(ds)projectFolderStatus('✓ pasta de rasters conectada',true);}).catch(()=>{});
}
async function runMosaic(){
  const ids=[...document.querySelectorAll('.mo-ck:checked')].map(i=>+i.dataset.id);
  const Rs=S.rasters.filter(r=>ids.includes(r.id));
  if(Rs.length<2){ toast('Marque 2 ou mais superfícies'); return; }
  const modo=document.getElementById('moModo').value;   // prior | mean | min | max
  const gradeId=(document.getElementById('moGrade')||{}).value;
  const gradeRaster=Rs.find(r=>String(r.id)===String(gradeId))||Rs[0];
  showLoad('Relendo as resoluções originais das superfícies…');
  const grids=[];
  for(const r of Rs){
    const g=await gridProd(r,'fundir na resolução original');
    if(!g){hideLoad();toast('Fusão cancelada — não foi possível obter a grade original de “'+r.name+'”');return;}
    grids.push(g);
  }
  const iGrade=Rs.indexOf(gradeRaster),grade=grids[Math.max(0,iGrade)];
  let cs=parseFloat(String(document.getElementById('moCS').value).replace(',','.'));
  if(!isFinite(cs)||cs<=0)cs=grade.cs;
  // extensão = união das extensões
  let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
  grids.forEach(d=>{
    mnX=Math.min(mnX,d.xll); mnY=Math.min(mnY,d.yll);
    mxX=Math.max(mxX,d.xll+d.nc*d.cs); mxY=Math.max(mxY,d.yll+d.nr*(d.csy||d.cs)); });
  // alinha a união à origem da grade escolhida: não desloca meia célula nem
  // inventa uma grade nova ao redor do produto final.
  mnX=grade.xll+Math.floor((mnX-grade.xll)/cs)*cs;
  mnY=grade.yll+Math.floor((mnY-grade.yll)/cs)*cs;
  mxX=grade.xll+Math.ceil((mxX-grade.xll)/cs)*cs;
  mxY=grade.yll+Math.ceil((mxY-grade.yll)/cs)*cs;
  const nc=Math.max(2,Math.ceil((mxX-mnX)/cs)), nr=Math.max(2,Math.ceil((mxY-mnY)/cs));
  if(nc*nr>RASTER_MAX_CELLS*4){
    const sug=Math.ceil(Math.sqrt((mxX-mnX)*(mxY-mnY)/(RASTER_MAX_CELLS*4))*10)/10;
    hideLoad();toast(`Grade ${nc}×${nr} grande demais — use célula ≥ ${sug} m`); return;
  }
  showLoad(`Mosaico ${nc}×${nr} de ${Rs.length} superfícies…`);
  await new Promise(r=>setTimeout(r,10));
  const t0=performance.now();
  const z=new Float32Array(nc*nr);
  let preench=0;
  for(let rr=0;rr<nr;rr++){
    const Y=mnY+(nr-1-rr+0.5)*cs;
    for(let cc=0;cc<nc;cc++){
      const X=mnX+(cc+0.5)*cs;
      let v=NaN;
      if(modo==='prior'){
        for(const g of grids){ const s0=sampleZbil(g,X,Y); if(!isNaN(s0)){ v=s0; break; } }
      } else {
        let sm=0,n=0,mn=Infinity,mx=-Infinity;
        for(const g of grids){ const s0=sampleZbil(g,X,Y);
          if(!isNaN(s0)){ sm+=s0; n++; if(s0<mn)mn=s0; if(s0>mx)mx=s0; } }
        if(n) v=(modo==='mean')? sm/n : (modo==='min'? mn : mx);
      }
      z[rr*nc+cc]=v;
      if(!isNaN(v)) preench++;
    }
  }
  const t1=performance.now();
  const nd={nc,nr,cs,xll:mnX,yll:mnY,z};
  const r={id:rid++, name:'Topografia final — MDT fundido ('+Rs.length+')', d:nd,
    src:{file:'topografia_final_mdt_fundido', at:new Date().toISOString()},
    style:{mode:'hipso_hs', opacity:0.85}, visible:true, overlay:null};
  S.rasters.push(r);placeProductAbove(r,gradeRaster); renderRaster(r); refreshUI(); hideLoad();
  projectAutoSaveRaster(r);
  if(r.overlay&&r.overlay.getBounds) safeFit(r.overlay.getBounds());
  document.getElementById('moOut').innerHTML=
    `<b>Topografia final criada</b><br>`+
    `Grade original de referência: <b>${esc(gradeRaster.name)}</b><br>`+
    `<b>${nc}×${nr}</b> células · ${cs.toFixed(3)} m · ${(100*preench/(nc*nr)).toFixed(0)}% preenchido · ${(t1-t0).toFixed(0)} ms`+
    `\nModo: ${ {prior:'prioridade (ordem da lista)',mean:'média',min:'mínimo',max:'máximo'}[modo] }.`;
  refreshMosaicPanel(); if(typeof refreshTinPanel==='function') refreshTinPanel();
  toast('✅ Topografia final criada pela fusão dos MDTs');
}

/* ---------------- Poligonizar linhas ---------------- */
function polygonizeLines(L, tol){
  /* Polygonizer topológico:
     1) reprojeta e explode as polilinhas em segmentos;
     2) cria nós em cruzamentos e encontros em T;
     3) ajusta pontas próximas pela tolerância;
     4) percorre as meias-arestas e extrai cada face fechada.
     O algoritmo antigo só ligava extremidade com extremidade e não conseguia
     fechar redes em que uma linha chegava no meio de outra. */
  const segs=[];
  L.features.forEach(f=>{
    if(!f.geom) return;
    const rs=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
    rs.forEach(r0=>{
      const r=r0.map(pt=>reproj(L.crs,S.workCRS,pt[0],pt[1]));
      for(let i=0;i<r.length-1;i++){
        const a=r[i],b=r[i+1],dx=b[0]-a[0],dy=b[1]-a[1];
        if(Math.hypot(dx,dy)>Math.max(1e-9,tol*1e-4))
          segs.push({a:[a[0],a[1]],b:[b[0],b[1]],cuts:[0,1],
            minx:Math.min(a[0],b[0]),maxx:Math.max(a[0],b[0]),
            miny:Math.min(a[1],b[1]),maxy:Math.max(a[1],b[1])});
      }
    });
  });
  if(!segs.length) return {rings:[],fechadas:0,descartadas:0,nos:0,intersecoes:0};
  const cross=(ax,ay,bx,by)=>ax*by-ay*bx;
  const addCut=(s,t)=>{ if(isFinite(t)&&t>=-1e-9&&t<=1+1e-9)s.cuts.push(Math.max(0,Math.min(1,t))); };
  const proj=(p,s)=>{
    const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],d=dx*dx+dy*dy;
    const t=d?((p[0]-s.a[0])*dx+(p[1]-s.a[1])*dy)/d:0;
    const tc=Math.max(0,Math.min(1,t));
    return {t:tc,d:Math.hypot(p[0]-(s.a[0]+tc*dx),p[1]-(s.a[1]+tc*dy))};
  };
  let intersecoes=0;
  // Varredura em X: evita comparar todos contra todos em desenhos extensos.
  const ord=segs.map((s,i)=>i).sort((i,j)=>segs[i].minx-segs[j].minx);
  for(let oi=0;oi<ord.length;oi++){
    const i=ord[oi],A=segs[i],rx=A.b[0]-A.a[0],ry=A.b[1]-A.a[1];
    for(let oj=oi+1;oj<ord.length;oj++){
      const j=ord[oj],B=segs[j];
      if(B.minx>A.maxx+tol) break;
      if(B.maxy<A.miny-tol||B.miny>A.maxy+tol) continue;
      const sx=B.b[0]-B.a[0],sy=B.b[1]-B.a[1];
      const qx=B.a[0]-A.a[0],qy=B.a[1]-A.a[1],den=cross(rx,ry,sx,sy);
      let marcou=false;
      if(Math.abs(den)>1e-12){
        const t=cross(qx,qy,sx,sy)/den,u=cross(qx,qy,rx,ry)/den;
        if(t>=-1e-9&&t<=1+1e-9&&u>=-1e-9&&u<=1+1e-9){
          addCut(A,t);addCut(B,u);marcou=true;
        }
      }
      // Encontro em T e pequenas folgas: projeta as quatro extremidades.
      [[A.a,0,B],[A.b,1,B],[B.a,0,A],[B.b,1,A]].forEach((it,k)=>{
        const pr=proj(it[0],it[2]);
        if(pr.d<=tol&&pr.t>=-1e-9&&pr.t<=1+1e-9){
          if(k<2){addCut(A,it[1]);addCut(B,pr.t);}
          else   {addCut(B,it[1]);addCut(A,pr.t);}
          marcou=true;
        }
      });
      if(marcou)intersecoes++;
    }
  }
  // Nós espaciais: procura também nos baldes vizinhos, não só no arredondado.
  const cell=Math.max(tol,1e-6),buckets=new Map(),nodes=[];
  const bk=(x,y)=>Math.floor(x/cell)+'|'+Math.floor(y/cell);
  const nodeFor=p=>{
    const bx=Math.floor(p[0]/cell),by=Math.floor(p[1]/cell);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)
      for(const id of (buckets.get((bx+dx)+'|'+(by+dy))||[])){
        const n=nodes[id];if(Math.hypot(n.p[0]-p[0],n.p[1]-p[1])<=tol)return id;
      }
    const id=nodes.length;nodes.push({p:[p[0],p[1]],out:[]});
    const k=bk(p[0],p[1]);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(id);return id;
  };
  const edges=[],edgeSet=new Set();
  segs.forEach(s=>{
    const ts=s.cuts.sort((a,b)=>a-b).filter((t,i,a)=>!i||t-a[i-1]>1e-8);
    for(let i=0;i<ts.length-1;i++){
      const t0=ts[i],t1=ts[i+1];if(t1-t0<=1e-9)continue;
      const p=t=>[s.a[0]+(s.b[0]-s.a[0])*t,s.a[1]+(s.b[1]-s.a[1])*t];
      const u=nodeFor(p(t0)),v=nodeFor(p(t1));if(u===v)continue;
      const ek=u<v?u+'|'+v:v+'|'+u;if(edgeSet.has(ek))continue;
      edgeSet.add(ek);edges.push([u,v]);
    }
  });
  // Duas meias-arestas por aresta; adjacências em ordem angular.
  const half=[];
  edges.forEach(([u,v])=>{
    const a=half.length,b=a+1;
    half.push({u,v,rev:b,used:false},{u:v,v:u,rev:a,used:false});
    nodes[u].out.push(a);nodes[v].out.push(b);
  });
  nodes.forEach(n=>n.out.sort((ia,ib)=>{
    const a=nodes[half[ia].v].p,b=nodes[half[ib].v].p;
    return Math.atan2(a[1]-n.p[1],a[0]-n.p[0])-Math.atan2(b[1]-n.p[1],b[0]-n.p[0]);
  }));
  const rings=[],minArea=Math.max(1e-8,tol*tol*0.01);
  for(let h0=0;h0<half.length;h0++){
    if(half[h0].used)continue;
    let h=h0,ring=[],guard=half.length+2,fechou=false;
    while(guard-->0&&!half[h].used){
      half[h].used=true;ring.push(nodes[half[h].u].p.slice());
      const v=half[h].v,out=nodes[v].out,ri=out.indexOf(half[h].rev);
      if(ri<0||!out.length)break;
      h=out[(ri-1+out.length)%out.length];       // mantém a face à esquerda
      if(h===h0){fechou=true;break;}
    }
    if(!fechou||ring.length<3)continue;
    ring.push(ring[0].slice());
    let area=0;for(let i=0;i<ring.length-1;i++)area+=ring[i][0]*ring[i+1][1]-ring[i+1][0]*ring[i][1];
    area/=2;
    if(area>minArea)rings.push(ring);             // descarta a face externa (horária)
  }
  const pontas=nodes.filter(n=>n.out.length===1).length;
  return {rings,fechadas:rings.length,descartadas:Math.ceil(pontas/2),
    nos:nodes.length,intersecoes};
}
/* ---------------- Poligonizar raster (lógica QGIS/GDAL) ----------------
   Regiões contíguas de células de mesmo valor viram feições independentes.
   A borda é extraída pelas arestas externas das células, sem criar um
   retângulo por pixel quando vários pixels vizinhos pertencem à mesma classe. */
function pgSimplifyRing(r){
  if(r.length<5)return r;
  const out=[];
  for(let i=0;i<r.length-1;i++){
    const a=r[(i-1+r.length-1)%(r.length-1)],b=r[i],c=r[(i+1)%(r.length-1)];
    if((a[0]===b[0]&&b[0]===c[0])||(a[1]===b[1]&&b[1]===c[1]))continue;
    out.push(b);
  }
  if(out.length>=3)out.push(out[0].slice());
  return out.length>=4?out:r;
}
function pgRingsFromEdges(edges,d){
  const at=new Map(),used=new Uint8Array(edges.length),key=p=>p[0]+'|'+p[1];
  edges.forEach((e,i)=>{const k=key(e[0]);if(!at.has(k))at.set(k,[]);at.get(k).push(i)});
  const rings=[],csy=d.csy||d.cs;
  for(let i=0;i<edges.length;i++){
    if(used[i])continue;
    const grid=[edges[i][0]],start=key(edges[i][0]);let ei=i,guard=edges.length+1;
    while(guard-->0){
      used[ei]=1;const p=edges[ei][1];grid.push(p);
      if(key(p)===start)break;
      const nx=(at.get(key(p))||[]).find(j=>!used[j]);
      if(nx==null)break;ei=nx;
    }
    if(grid.length<4||key(grid[grid.length-1])!==start)continue;
    const world=grid.map(p=>[d.xll+p[0]*d.cs,d.yll+(d.nr-p[1])*csy]);
    rings.push(pgSimplifyRing(world));
  }
  return rings;
}
function polygonizeRasterGrid(r,eight=false,maxCells=250000,dissolveMode='none'){
  const d=r&&r.d;if(!d||!d.z||!d.nc||!d.nr)throw new Error('raster sem grade válida');
  const classes=(r.style&&Array.isArray(r.style.classes))?r.style.classes:[];
  const classInfo=v=>{
    let idx=classes.findIndex(c=>c&&c.value!==null&&c.value!==''&&c.value!==undefined&&
      Number.isFinite(+c.value)&&Math.abs(v-(+c.value))<=1e-9);
    if(idx<0){const hit=rasterClassRangeFind(classes,v);idx=hit?hit.index:-1;}
    const achou=idx>=0?classes[idx]:null;
    if(!achou)return {label:String(v),color:null,key:'valor:'+String(v)};
    const label=String(achou.label||achou.nome||achou.name||
	      ((achou.min!==null&&achou.max!==null&&Number.isFinite(+achou.min)&&Number.isFinite(+achou.max))?(achou.min+' – '+achou.max):v));
	    return {label,color:achou.color||achou.cor||null,key:'classe:'+idx};
	  };
	  const noDataRaw=[r.nodata,r.noData,d.nodata,d.noData,d.NODATA].find(v=>v!==null&&v!==''&&Number.isFinite(+v));
	  const noData=noDataRaw!==undefined?+noDataRaw:null;
	  const validValue=v=>Number.isFinite(v)&&(noData==null||Math.abs(v-noData)>1e-12);
	  const mode=['value','class','all'].includes(dissolveMode)?dissolveMode:'none';
	  const n=d.nc*d.nr,z=d.z;let valid=0;
  for(let i=0;i<n;i++)if(validValue(z[i]))valid++;
  if(!valid)throw new Error('o raster não possui células válidas');
  if(valid>maxCells)throw new Error(`o raster possui ${valid.toLocaleString('pt-BR')} células válidas; recorte ou reclassifique antes (limite seguro: ${maxCells.toLocaleString('pt-BR')})`);
  const seen=new Uint8Array(n),feats=[],dirs=eight?
    [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]:
    [[-1,0],[1,0],[0,-1],[0,1]];
  const same=(a,b)=>a===b||(Number.isNaN(a)&&Number.isNaN(b));
  for(let seed=0;seed<n;seed++){
    if(seen[seed]||!validValue(z[seed]))continue;
    if(feats.length>=50000)throw new Error('mais de 50.000 regiões seriam criadas; reclassifique o raster antes de poligonizar');
    const val=z[seed],seedClass=classInfo(val),
	      groupKey=v=>mode==='all'?'__all__':mode==='class'?classInfo(v).key:v,
	      key0=groupKey(val),q=[seed],edges=[];
	    let head=0,cells=0,sum=0,min=Infinity,max=-Infinity,singleValue=true;seen[seed]=1;
    while(head<q.length){
      const k=q[head++],rr=Math.floor(k/d.nc),cc=k-rr*d.nc,cellVal=z[k];cells++;
	      sum+=cellVal;min=Math.min(min,cellVal);max=Math.max(max,cellVal);if(!same(cellVal,val))singleValue=false;
      for(const v of dirs){const nr=rr+v[0],nc=cc+v[1];
        if(nr<0||nc<0||nr>=d.nr||nc>=d.nc)continue;
        const nk=nr*d.nc+nc;if(!seen[nk]&&validValue(z[nk])&&same(groupKey(z[nk]),key0)){seen[nk]=1;q.push(nk);}
      }
      const eq=(nr,nc)=>nr>=0&&nc>=0&&nr<d.nr&&nc<d.nc&&validValue(z[nr*d.nc+nc])&&same(groupKey(z[nr*d.nc+nc]),key0);
      if(!eq(rr-1,cc))edges.push([[cc,rr],[cc+1,rr]]);
      if(!eq(rr,cc+1))edges.push([[cc+1,rr],[cc+1,rr+1]]);
      if(!eq(rr+1,cc))edges.push([[cc+1,rr+1],[cc,rr+1]]);
      if(!eq(rr,cc-1))edges.push([[cc,rr+1],[cc,rr]]);
    }
    const rings=pgRingsFromEdges(edges,d);if(!rings.length)continue;
    let per=0;rings.forEach(ring=>{for(let i=0;i<ring.length-1;i++)
      per+=Math.hypot(ring[i+1][0]-ring[i][0],ring[i+1][1]-ring[i][1]);});
	    const area=cells*d.cs*(d.csy||d.cs),ci=mode==='all'?{label:null,color:null}:seedClass;
	    feats.push({geom:rings,multi:true,props:{FID:feats.length+1,DN:singleValue?val:null,
	      CLASSE:ci.label,VAL_MIN:+min.toFixed(6),VAL_MAX:+max.toFixed(6),VAL_MED:+(sum/cells).toFixed(6),
	      CELULAS:cells,AREA_M2:+area.toFixed(3),AREA_HA:+(area/10000).toFixed(6),
	      PERIM_M:+per.toFixed(3),RASTER:String(r.name||'Raster').slice(0,80),
	      DISSOLVE:mode==='all'?'TOTAL':mode==='class'?'CLASSE':mode==='value'?'VALOR':'NÃO',_PG_COR:ci.color}});
  }
  return {features:feats,valid};
}
function runPolygonizeRaster(){
  const sel=document.getElementById('pgRaster'),r=(S.rasters||[]).find(x=>String(x.id)===String(sel&&sel.value));
  if(!r){toast('Escolha um raster para poligonizar');return;}
  const fldPedido=(String(document.getElementById('pgField').value||'DN').trim().replace(/[^A-Za-z0-9_]/g,'_').slice(0,10)||'DN');
	  const camposReservados=new Set(['FID','CLASSE','VAL_MIN','VAL_MAX','VAL_MED','CELULAS','AREA_M2','AREA_HA','PERIM_M','RASTER','DISSOLVE']);
	  const fld=camposReservados.has(fldPedido.toUpperCase())?'VALOR':fldPedido;
	  if(fld!==fldPedido)document.getElementById('pgField').value=fld;
  showLoad('Poligonizando o raster…');
  setTimeout(()=>{try{
    const dissolveMode=(document.getElementById('pgDissolve')||{}).value||'none';
    const res=polygonizeRasterGrid(r,!!document.getElementById('pgEight').checked,250000,dissolveMode);
    if(fld!=='DN')res.features.forEach(f=>{f.props[fld]=f.props.DN;delete f.props.DN;});
    const dissolveNome=dissolveMode==='all'?' · dissolvido':dissolveMode==='class'?' · dissolvido por CLASSE':
      dissolveMode==='value'?' · dissolvido por '+fld:'';
    const L=addLayer({sourceLayer:r,name:r.name+' — poligonizado'+dissolveNome,gtype:'polygon',crs:S.workCRS,features:res.features,
      fields:[{name:'FID',type:'N',length:9,decimal:0},{name:fld,type:'N',length:18,decimal:6},
        {name:'CLASSE',type:'C',length:80,decimal:0},{name:'VAL_MIN',type:'N',length:18,decimal:6},
        {name:'VAL_MAX',type:'N',length:18,decimal:6},{name:'VAL_MED',type:'N',length:18,decimal:6},
        {name:'CELULAS',type:'N',length:12,decimal:0},
        {name:'AREA_M2',type:'N',length:18,decimal:3},{name:'AREA_HA',type:'N',length:18,decimal:6},
        {name:'PERIM_M',type:'N',length:18,decimal:3},{name:'RASTER',type:'C',length:80,decimal:0},
        {name:'DISSOLVE',type:'C',length:12,decimal:0}]});
    const cats=[],vistos=new Set();
    res.features.forEach(f=>{const p=f.props||{},rot=String(p.CLASSE||p[fld]||'');
	      if(!vistos.has(rot)){vistos.add(rot);if(cats.length<60)cats.push({value:rot,
	        color:p._PG_COR||'#37a6c9',stroke:p._PG_COR||'#216a83',fill:.38,vis:true});}
      delete p._PG_COR;
    });
	    if(dissolveMode!=='all'&&cats.length&&vistos.size<=60){L.sym={...L.sym,mode:'cat',field:'CLASSE',cats};drawLayer(L);}
    S._pgRasterLayerId=L.id;
    ['btnPgTabela','btnPgFiltro'].forEach(id=>{const b=document.getElementById(id);if(b)b.disabled=false;});
    hideLoad();document.getElementById('pgOut').innerHTML='<b>'+res.features.length+'</b> região(ões) · <b>'+ 
      res.valid.toLocaleString('pt-BR')+'</b> células válidas · '+
      (dissolveMode==='all'?'dissolvido sem atributo':dissolveMode==='class'?'dissolvido por CLASSE':
       dissolveMode==='value'?'dissolvido por '+fld:'sem dissolução adicional')+
      '.<br>Campos gerados: <b>'+fld+', CLASSE, VAL_MIN, VAL_MAX, VAL_MED, CELULAS, AREA_M2, AREA_HA, PERIM_M, RASTER e DISSOLVE</b>.';
    refreshUI();if(L)fitLayer(L);toast('Raster poligonizado'+(dissolveMode==='none'?'':' e dissolvido')+' — atributos prontos para filtrar');
  }catch(e){hideLoad();document.getElementById('pgOut').textContent='Falha: '+e.message;toast('Poligonizar: '+e.message);}},30);
}

function pgResultadoAbrir(filtro){
  const L=(S.layers||[]).find(x=>x.id===S._pgRasterLayerId);
  if(!L){toast('Poligonize um raster primeiro');return;}
  S.activeId=L.id;refreshUI();
  if(typeof openAttr==='function')openAttr();
  if(filtro)setTimeout(()=>{
    const p=document.getElementById('attrFilterPanel'),b=document.getElementById('attrFilterToggle');
    if(p&&p.hidden&&b)b.click();
  },40);
}

/* Fechamento de linhas é uma operação CAD distinta de Poligonizar raster. */
let pzBusy=false;
function pzScopeState(stamp=true){
  const helper=window.GeoMineCommandSelection;
  if(!helper)throw Error('A seleção ainda está sendo preparada. Tente novamente.');
  const selection=helper.capture({gtype:'line',stamp});
  if(selection.explicit&&selection.layers.length!==1)
    throw Error('Poligonize linhas de uma camada por vez. A seleção foi mantida.');
  const L=selection.explicit?selection.layers[0]:
    S.layers.find(l=>String(l.id)===document.getElementById('pzLayer')?.value);
  if(!L||L.gtype!=='line')throw Error('Selecione uma linha ou uma camada de LINHAS');
  if(!selection.explicit)return {selection,L,features:L.features};
  // A seleção pode indicar apenas uma parte de uma linha multipartes.
  // Nunca acrescente as outras partes nem as outras feições da camada.
  const selected=new Map();
  for(const {f,partIdx} of selection.items){
    const parts=Array.isArray(f.geom?.[0]?.[0])?f.geom:[f.geom];
    let entry=selected.get(f);
    if(!entry){entry={parts,indices:new Set()};selected.set(f,entry);}
    if(partIdx==null)parts.forEach((_,i)=>entry.indices.add(i));
    else if(partIdx>=0&&partIdx<parts.length)entry.indices.add(partIdx);
    else throw Error('A parte selecionada não existe mais. Selecione a linha novamente.');
  }
  const features=[];
  for(const {parts,indices} of selected.values())
    for(const i of [...indices].sort((a,b)=>a-b))features.push({geom:parts[i],multi:false});
  return {selection,L,features};
}
function pzScopeSync(){
  const label=document.getElementById('pzScope'),select=document.getElementById('pzLayer'),button=document.getElementById('btnPz');
  let state=null,error=null;
  try{state=pzScopeState(false);}catch(e){error=e;}
  if(state?.selection.explicit&&select)select.value=String(state.L.id);
  if(select)select.disabled=pzBusy||!!state?.selection.explicit;
  if(button)button.disabled=pzBusy||!!error||!state?.features.length;
  if(label)label.textContent=error?error.message:state.selection.explicit?
    'Somente '+state.features.length+' linha(s) selecionada(s) — '+state.L.name:
    'Toda a camada — '+state.features.length+' feição(ões) de linha';
  return state;
}
function runPolygonize(){
  if(pzBusy)return;
  let scope;
  try{scope=pzScopeState();}catch(e){toast(e.message);pzScopeSync();return;}
  const {L,selection,features}=scope,helper=window.GeoMineCommandSelection;
  if(!features.length){toast('Nenhuma linha disponível para poligonizar');pzScopeSync();return;}
  const crs=L.crs,sourceStamp=selection.explicit?null:JSON.stringify(L.features);
  const assertSource=()=>{
    helper.assertCurrent(selection);
    if(!S.layers.includes(L)||L.gtype!=='line'||L.crs!==crs||
       !selection.explicit&&JSON.stringify(L.features)!==sourceStamp)
      throw Error('A origem mudou durante o cálculo. Execute novamente.');
  };
  const tol=Math.max(0.001, parseFloat(String(document.getElementById('pzTol').value).replace(',','.'))||0.5);
  const origin=selection.explicit?'somente '+features.length+' linha(s) selecionada(s)':features.length+' feição(ões) da camada inteira';
  pzBusy=true;pzScopeSync();
  showLoad('Poligonizando…');
  setTimeout(()=>{
    try{
    assertSource();
    const {rings,descartadas}=polygonizeLines({crs,features},tol);
    if(!rings.length){
      document.getElementById('pzOut').textContent='Nenhum anel fechado encontrado — origem: '+origin+'. Verifique se as linhas escolhidas fecham um contorno ou ajuste a tolerância.';
      toast('Nenhum polígono formado'); return;
    }
    const feats=rings.map((r,i)=>{
      let a=0; for(let k=0;k<r.length-1;k++) a+=r[k][0]*r[k+1][1]-r[k+1][0]*r[k][1];
      a=Math.abs(a/2);
      let per=0; for(let k=0;k<r.length-1;k++) per+=Math.hypot(r[k+1][0]-r[k][0],r[k+1][1]-r[k][1]);
      return {geom:[r.map(p=>[p[0],p[1]])], multi:true,
        props:{FID:i, AREA_M2:+a.toFixed(2), AREA_HA:+(a/1e4).toFixed(4), PERIM_M:+per.toFixed(2)}};
    });
    assertSource();
    addLayer({sourceLayer:L,name:L.name+' — polígonos'+(selection.explicit?' da seleção':''), gtype:'polygon', crs:S.workCRS, features:feats,
      fields:[{name:'FID',type:'N',length:9,decimal:0},{name:'AREA_M2',type:'N',length:16,decimal:2},
        {name:'AREA_HA',type:'N',length:12,decimal:4},{name:'PERIM_M',type:'N',length:12,decimal:2}]});
    document.getElementById('pzOut').innerHTML=
      `<b>${rings.length}</b> polígono(s) — rede dividida em nós e interseções`+
      (descartadas?`, <b>${descartadas}</b> cadeia(s) ainda aberta(s)`:'')+` · origem: ${origin}.`;
    refreshOverlayPanel(); refreshGtPanel(); if(typeof refreshTinPanel==='function') refreshTinPanel();
    }catch(e){document.getElementById('pzOut').textContent='Falha: '+e.message;toast('Poligonizar: '+e.message);}
    finally{hideLoad();pzBusy=false;pzScopeSync();}
  },30);
}

/* ---------------- Dissolver polígonos ---------------- */
let dsBusy=false;
function dsScopeState(stamp=true){
  const helper=window.GeoMineCommandSelection;
  if(!helper)throw Error('A seleção ainda está sendo preparada. Tente novamente.');
  const selection=helper.capture({gtype:'polygon',stamp});
  if(selection.explicit&&selection.layers.length!==1)
    throw Error('Dissolva polígonos de uma camada por vez. A seleção foi mantida.');
  const L=selection.explicit?selection.layers[0]:
    S.layers.find(l=>String(l.id)===document.getElementById('dsLayer')?.value);
  if(!L||L.gtype!=='polygon')throw Error('Selecione uma camada de POLÍGONOS');
  return {selection,L,items:selection.explicit?helper.uniqueItems(selection):
    L.features.map((f,idx)=>({L,f,idx}))};
}
function dsScopeSync(){
  const label=document.getElementById('dsScope'),select=document.getElementById('dsLayer'),button=document.getElementById('btnDs');
  let state=null,error=null;
  try{state=dsScopeState(false);}catch(e){error=e;}
  if(state?.selection.explicit&&select)select.value=String(state.L.id);
  if(select)select.disabled=!!state?.selection.explicit;
  if(button)button.disabled=dsBusy||!!error;
  if(label)label.textContent=error?error.message:state.selection.explicit?
    'Somente '+state.items.length+' polígono(s) selecionado(s) — '+state.L.name:
    'Toda a camada — '+state.items.length+' polígono(s)';
  return state;
}
async function runDissolve(){
  if(dsBusy)return;
  let scope;
  try{scope=dsScopeState();}catch(e){toast(e.message);dsScopeSync();return;}
  const {L,selection,items}=scope,helper=window.GeoMineCommandSelection;
  const chosenField=document.getElementById('dsField').value;
  const fld=(L.fields||[]).some(f=>f.name===chosenField)?chosenField:''; // '' = tudo em um
  const crs=L.crs,sourceStamp=selection.explicit?null:JSON.stringify(L.features);
  const assertSource=()=>{
    helper.assertCurrent(selection);
    if(!S.layers.includes(L)||L.gtype!=='polygon'||L.crs!==crs||
       !selection.explicit&&JSON.stringify(L.features)!==sourceStamp)
      throw Error('A origem mudou durante o cálculo. Execute novamente.');
  };
  dsBusy=true;dsScopeSync();
  try{
    showLoad('Carregando biblioteca de recorte…');
    await ensurePolyClip();
    assertSource();
    showLoad('Dissolvendo…');
    await new Promise(r=>setTimeout(r,10));
    assertSource();
    /* (1) Cada feição vira polígonos de verdade: os anéis são separados em
       partes e furos pela CONTENÇÃO (ringsToPolys). Antes todos os anéis de
       uma feição eram tomados como "contorno + furos" — numa APP com várias
       partes, as outras partes viravam furos inválidos.
       (2) REFERENCIAL LOCAL a 1 mm, como na APP: em UTM (~6,9 milhões de m) a
       biblioteca de recorte aborta com "Unable to find segment … SweepLine".
       (3) União em lotes; um lote que falha é dividido até isolar a feição
       problemática, que tenta de novo a 1 cm e, se ainda falhar, fica de fora
       e é listada — o resto é dissolvido. */
    const brutos=[],puladas=[];let ox=Infinity,oy=Infinity;
    items.forEach(({f,idx:fi})=>{
      if(!f.geom?.length){puladas.push(fi+1);return;}
      const key=fld? String(f.props?.[fld]??'') : '__all__';
      const rings=(f.multi&&Array.isArray(f.geom[0]?.[0]))?f.geom:[f.geom];
      const conv=rings.map(r=>{
        const q=r.map(pt=>reproj(L.crs,S.workCRS,pt[0],pt[1])).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
        if(q.length<3) return null;
        const a=q[0], b=q[q.length-1];
        if(Math.abs(a[0]-b[0])>1e-9||Math.abs(a[1]-b[1])>1e-9) q.push([a[0],a[1]]);
        for(const p of q){if(p[0]<ox)ox=p[0];if(p[1]<oy)oy=p[1];}
        return q;
      }).filter(Boolean);
      if(conv.length) brutos.push({key,fi,conv});
      else puladas.push(fi+1);
    });
    if(!brutos.length){ hideLoad(); toast('A camada não tem polígonos válidos'); return; }
    ox=Math.floor(ox); oy=Math.floor(oy);
    const arred=(g,k)=>Array.isArray(g)&&typeof g[0]==='number'?[Math.round(g[0]*k)/k,Math.round(g[1]*k)/k]:g.map(x=>arred(x,k));
    const limpa=r=>{const o=[];for(const p of r){const u=o.at(-1);if(!u||u[0]!==p[0]||u[1]!==p[1])o.push(p);}return o;};
    const groups=new Map();
    for(const b of brutos){
      const loc=b.conv.map(r=>limpa(arred(r.map(p=>[p[0]-ox,p[1]-oy]),1000))).filter(r=>r.length>=4);
      const mp=ringsToPolys(loc);
      if(!mp.length){puladas.push(b.fi+1);continue;}
      if(!groups.has(b.key)) groups.set(b.key,[]);
      groups.get(b.key).push({fi:b.fi,mp});
    }
    const uneLista=mps=>{let list=mps.slice();while(list.length>1){const next=[];for(let i=0;i<list.length;i+=16)next.push(polygonClipping.union(...list.slice(i,i+16)));list=next;}return list[0]?polygonClipping.union(list[0]):[];};
    const uneRobusto=itens=>{
      try{ return uneLista(itens.map(x=>x.mp)); }
      catch(e){
        if(itens.length===1){
          try{ return polygonClipping.union(arred(itens[0].mp,100)); }
          catch(e2){ puladas.push(itens[0].fi+1); return []; }
        }
        const m=itens.length>>1, a=uneRobusto(itens.slice(0,m)), b=uneRobusto(itens.slice(m));
        if(!a.length) return b; if(!b.length) return a;
        try{ return polygonClipping.union(a,b); }
        catch(e3){ try{ return polygonClipping.union(arred(a,100),arred(b,100)); }catch(e4){ return a.concat(b); } }
      }
    };
    const volta=g=>Array.isArray(g)&&typeof g[0]==='number'?[g[0]+ox,g[1]+oy]:g.map(volta);
    const feats=[]; const t0=performance.now();
    for(const [key,itens] of groups){
      showLoad('Dissolvendo… '+(fld?'grupo "'+key+'" · ':'')+itens.length+' feição(ões)');
      await new Promise(r=>setTimeout(r,0));
      const un=volta(uneRobusto(itens));
      un.forEach(poly=>{
        let a=0, per=0;
        poly.forEach((r,ri)=>{ let s=0;
          for(let k=0;k<r.length-1;k++){ s+=r[k][0]*r[k+1][1]-r[k+1][0]*r[k][1];
            if(ri===0) per+=Math.hypot(r[k+1][0]-r[k][0],r[k+1][1]-r[k][1]); }
          a+= ri===0? Math.abs(s/2) : -Math.abs(s/2); });
        const props={FID:feats.length, AREA_M2:+a.toFixed(2), AREA_HA:+(a/1e4).toFixed(4),
          PERIM_M:+per.toFixed(2)};
        if(fld) props[fld.slice(0,10)]=key;
        feats.push({geom:poly, multi:true, props});
      });
    }
    const t1=performance.now();
    const fields=[{name:'FID',type:'N',length:9,decimal:0},{name:'AREA_M2',type:'N',length:16,decimal:2},
      {name:'AREA_HA',type:'N',length:12,decimal:4},{name:'PERIM_M',type:'N',length:12,decimal:2}];
    if(fld) fields.push({name:fld.slice(0,10),type:'C',length:40,decimal:0});
    if(!feats.length)throw Error('Nenhum polígono resultante. As feições de origem foram preservadas.');
    assertSource();
    addLayer({sourceLayer:L,name:L.name+' — dissolvido'+(fld?' por '+fld:''), gtype:'polygon', crs:S.workCRS,
      features:feats, fields});
    hideLoad();
    document.getElementById('dsOut').innerHTML=
      `<b>${feats.length}</b> polígono(s)`+(fld?` em ${groups.size} grupo(s) de "${esc(fld)}"`:' (limite único)')+
      ` · origem: ${selection.explicit?'somente '+items.length+' selecionado(s)':items.length+' da camada inteira'}`+
      ` · ${(t1-t0).toFixed(0)} ms`+
      (puladas.length?`<br><span style="color:var(--amber)">${puladas.length} feição(ões) com geometria que a união não aceitou ficaram de fora: ${puladas.slice(0,20).join(', ')}${puladas.length>20?'…':''}</span>`:'');
    if(puladas.length) toast('Dissolvido; '+puladas.length+' feição(ões) com geometria inválida ficaram de fora — veja a lista');
    refreshOverlayPanel(); refreshGtPanel();
  }catch(e){toast('Falha no dissolve: '+e.message);}
  finally{hideLoad();dsBusy=false;dsScopeSync();}
}
function xlArea(r){let s=0;for(let i=0,j=r.length-1;i<r.length;j=i++)s+=r[j][0]*r[i][1]-r[i][0]*r[j][1];return Math.abs(s/2);}
function xlHull(points){
  const p=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<3)return [];
  const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lo=[],up=[];for(const x of p){while(lo.length>1&&cross(lo[lo.length-2],lo[lo.length-1],x)<=0)lo.pop();lo.push(x)}
  for(let i=p.length-1;i>=0;i--){const x=p[i];while(up.length>1&&cross(up[up.length-2],up[up.length-1],x)<=0)up.pop();up.push(x)}
  lo.pop();up.pop();const h=lo.concat(up);if(h.length)h.push(h[0].slice());return h;
}
function xlLineBoundary(L){
  let raw=[];L.features.forEach(f=>{const rs=(f.multi&&Array.isArray(f.geom&&f.geom[0]&&f.geom[0][0]))?f.geom:[f.geom];
    rs.forEach(a=>(a||[]).forEach(p=>raw.push(reproj(L.crs,S.workCRS,p[0],p[1]))));});
  if(raw.length<3)throw new Error('a camada não possui vértices suficientes');
  let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;raw.forEach(p=>{xmin=Math.min(xmin,p[0]);ymin=Math.min(ymin,p[1]);xmax=Math.max(xmax,p[0]);ymax=Math.max(ymax,p[1])});
  const snap=Math.max(.02,Math.hypot(xmax-xmin,ymax-ymin)/5000),seen=new Set();let pts=[];
  for(const p of raw){const k=Math.round(p[0]/snap)+'|'+Math.round(p[1]/snap);if(!seen.has(k)){seen.add(k);pts.push(p)}}
  if(pts.length>50000){const st=Math.ceil(pts.length/50000);pts=pts.filter((_,i)=>i%st===0)}
  const flat=[];pts.forEach(p=>flat.push(p[0],p[1]));const tri=delaunay(flat).triangles,lens=[];
  const len=(a,b)=>Math.hypot(pts[a][0]-pts[b][0],pts[a][1]-pts[b][1]);
  for(let i=0;i<tri.length;i+=3)lens.push(Math.max(len(tri[i],tri[i+1]),len(tri[i+1],tri[i+2]),len(tri[i+2],tri[i])));
  lens.sort((a,b)=>a-b);const q=x=>lens[Math.min(lens.length-1,Math.floor((lens.length-1)*x))]||0;
  const lim=Math.max(snap*3,Math.min(q(.95),Math.max(q(.82)*1.8,q(.5)*3))),em=new Map();
  const edge=(a,b)=>{const k=a<b?a+'|'+b:b+'|'+a,o=em.get(k);if(o)o.n++;else em.set(k,{a,b,n:1})};
  for(let i=0;i<tri.length;i+=3){const a=tri[i],b=tri[i+1],c=tri[i+2];if(Math.max(len(a,b),len(b,c),len(c,a))>lim)continue;edge(a,b);edge(b,c);edge(c,a)}
  const seg=[];em.forEach(e=>{if(e.n===1)seg.push([pts[e.a],pts[e.b]])});
  let rings=sewChains(seg,Math.max(.001,snap*.1)).filter(r=>r.length>=4&&Math.hypot(r[0][0]-r[r.length-1][0],r[0][1]-r[r.length-1][1])<=snap);
  rings=rings.map(r=>{if(Math.hypot(r[0][0]-r[r.length-1][0],r[0][1]-r[r.length-1][1])>1e-9)r.push(r[0].slice());return r});
  rings=tinAneisExternos(rings).filter(r=>xlArea(r)>1);
  if(!rings.length){const h=xlHull(pts);if(h.length)rings=[h];}
  return {rings,threshold:lim,points:pts.length};
}
async function runExtractBoundary(){
  const L=S.layers.find(l=>String(l.id)===String(document.getElementById('xlLayer').value));
  if(!L||!['line','polygon'].includes(L.gtype)){toast('Escolha uma camada de linhas ou polígonos');return;}
  showLoad('Extraindo o limite externo…');await new Promise(r=>setTimeout(r,20));
  try{
    let rings=[];
    if(L.gtype==='polygon'){
      await ensurePolyClip();const polys=[];
      L.features.forEach(f=>{if(!f.geom)return;const rs=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
        const p=rs.map(r=>{const q=r.map(pt=>reproj(L.crs,S.workCRS,pt[0],pt[1]));if(q.length&&Math.hypot(q[0][0]-q[q.length-1][0],q[0][1]-q[q.length-1][1])>1e-9)q.push(q[0].slice());return q});if(p.length)polys.push([p]);});
      const un=polys.length?polygonClipping.union(...polys):[];un.forEach(poly=>{if(poly&&poly[0])rings.push(poly[0])});
    }else{
      /* Uma cava contém muitos anéis internos de crista e pé. Para "extrair
         limite" interessa o contorno principal, não cada banco isolado. */
      rings=xlLineBoundary(L).rings.sort((a,b)=>xlArea(b)-xlArea(a)).slice(0,1);
    }
    if(!rings.length)throw new Error('não foi possível formar um contorno externo');
    const feats=rings.map((r,i)=>({geom:[r],multi:true,props:{FID:i+1,AREA_M2:+xlArea(r).toFixed(2),ORIGEM:L.name}}));
    const out=addLayer({sourceLayer:L,name:L.name+' — limite',gtype:'polygon',crs:S.workCRS,features:feats,
      fields:[{name:'FID',type:'N',length:9,decimal:0},{name:'AREA_M2',type:'N',length:18,decimal:2},{name:'ORIGEM',type:'C',length:80,decimal:0}]});
    hideLoad();document.getElementById('xlOut').innerHTML=`<b>${feats.length}</b> limite(s) externo(s) · ${fmtArea(feats.reduce((s,f)=>s+f.props.AREA_M2,0))}.`;
    refreshUI();if(out)fitLayer(out);toast('Limite externo criado');
  }catch(e){hideLoad();document.getElementById('xlOut').textContent='Falha: '+e.message;toast('Extrair limite: '+e.message);}
}
function refreshVecOpsPanel(){
  const pg=document.getElementById('pgRaster');
  if(pg){const cur=pg.value,rs=(S.rasters||[]).filter(r=>r&&r.d&&r.d.z);
    pg.innerHTML=rs.length?rs.map(r=>`<option value="${r.id}">${esc(r.name)} (${r.d.nc}×${r.d.nr})</option>`).join(''):'<option value="">— sem raster —</option>';
    if(rs.some(r=>String(r.id)===cur))pg.value=cur;}
  const pz=document.getElementById('pzLayer');
  if(pz){ const cur=pz.value;
    const ls=S.layers.filter(l=>l.gtype==='line');
    pz.innerHTML=ls.length? ls.map(l=>`<option value="${l.id}">${esc(l.name)} (${l.features.length})</option>`).join('')
      : '<option value="">— sem camadas de linha —</option>';
    const a=(typeof processingLayer==='function'?processingLayer():activeLayer());
    if(a&&ls.includes(a))pz.value=String(a.id);
    else if(ls.some(l=>String(l.id)===cur)) pz.value=cur;
    pzScopeSync(); }
  const ds=document.getElementById('dsLayer');
  if(ds){ const cur=ds.value;
    const ps=S.layers.filter(l=>l.gtype==='polygon');
    ds.innerHTML=ps.length? ps.map(l=>`<option value="${l.id}">${esc(l.name)} (${l.features.length})</option>`).join('')
      : '<option value="">— sem camadas de polígono —</option>';
    const a=(typeof processingLayer==='function'?processingLayer():activeLayer());
    if(a&&ps.includes(a))ds.value=String(a.id);
    else if(ps.some(l=>String(l.id)===cur)) ds.value=cur;
    dsFields(); }
  const xl=document.getElementById('xlLayer');
  if(xl){const cur=xl.value,vs=S.layers.filter(l=>l.gtype==='line'||l.gtype==='polygon');
    xl.innerHTML=vs.length?vs.map(l=>`<option value="${l.id}">${esc(l.name)} (${l.gtype==='line'?'linhas':'polígonos'})</option>`).join(''):'<option value="">— sem camada vetorial —</option>';
    const a=(typeof processingLayer==='function'?processingLayer():activeLayer());
    if(a&&vs.includes(a))xl.value=String(a.id);else if(vs.some(l=>String(l.id)===cur))xl.value=cur;}
}
function dsFields(){
  const ds=document.getElementById('dsLayer'), fs=document.getElementById('dsField');
  if(!fs) return;
  const current=fs.value,state=dsScopeSync();
  const L=state?.L||S.layers.find(l=>String(l.id)===ds.value);
  fs.innerHTML='<option value="">(tudo em um — limite)</option>'+
    ((L&&L.fields)||[]).map(f=>`<option value="${esc(f.name)}">${esc(f.name)}</option>`).join('');
  if((L?.fields||[]).some(f=>f.name===current))fs.value=current;
}
function bindVecOpsPanel(){
  const b1=document.getElementById('btnMosaic'); if(b1) b1.onclick=runMosaic;
  const b2=document.getElementById('btnPz');     if(b2) b2.onclick=runPolygonize;
  const pz=document.getElementById('pzLayer');   if(pz) pz.onchange=pzScopeSync;
  const b3=document.getElementById('btnDs');     if(b3) b3.onclick=runDissolve;
  const b4=document.getElementById('btnPgRaster');if(b4)b4.onclick=runPolygonizeRaster;
  const bt=document.getElementById('btnPgTabela');if(bt)bt.onclick=()=>pgResultadoAbrir(false);
  const bf=document.getElementById('btnPgFiltro');if(bf)bf.onclick=()=>pgResultadoAbrir(true);
  const b5=document.getElementById('btnXl');     if(b5)b5.onclick=runExtractBoundary;
  const ds=document.getElementById('dsLayer');   if(ds) ds.onchange=dsFields;
}

/* ---------- painel Geoproc ---------- */
function refreshTinPanel(){
  const sel=document.getElementById('tinLayer'); if(!sel) return;
  const cands=S.layers;                                  // linhas, pontos E polígonos
  const cur=sel.value;
  const ativa=(typeof processingLayer==='function')?processingLayer():
    ((typeof activeLayer==='function')?activeLayer():null);
  const rot={line:'linhas',point:'pontos',polygon:'polígonos'};
  sel.innerHTML=cands.length
    ? cands.map(l=>`<option value="${l.id}">${esc(l.name)} (${rot[l.gtype]||l.gtype}, ${l.features.length}${l.features.some(f=>gtZg(f))?' · 3D':''})</option>`).join('')
    : '<option value="">— nenhuma camada —</option>';
  if(ativa&&cands.includes(ativa)) sel.value=String(ativa.id);
  else if(cands.some(l=>String(l.id)===cur)) sel.value=cur;
  const sm=document.getElementById('tinInterMdt');
  if(sm){
    const rs=(S.rasters||[]).filter(r=>r&&r.d&&r.d.z), cur2=sm.value;
    sm.innerHTML='<option value="">— não vincular a MDT —</option>'+
      rs.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('');
    if(rs.some(r=>String(r.id)===cur2))sm.value=cur2;
    else sm.value='';
  }
  tinFields();
}
function tinFields(){
  const sel=document.getElementById('tinLayer'), fs=document.getElementById('tinField');
  const L=S.layers.find(l=>String(l.id)===sel.value);
  if(!L){ fs.innerHTML='<option value="">—</option>'; return; }
  const nums=(L.fields||[]).filter(f=>f.type==='N'||f.type==='F');
  const list=nums.length?nums:(L.fields||[]);
  fs.innerHTML=list.map(f=>`<option value="${esc(f.name)}">${esc(f.name)}</option>`).join('')
    || '<option value="">— sem campos —</option>';
  const pref=list.find(f=>/^(z|cota|elev|elevacao|elevation|altitude|alt|contour|nivel|n[ií]vel)$/i.test(f.name));
  if(pref) fs.value=pref.name;
  // auto-preferência da fonte: camada 3D => Z da geometria; senão => campo
  const zs=document.getElementById('tinZSrc');
  if(zs){
    const tem3d=!!(L.features&&L.features.some(f=>gtZg(f)));
    zs.value=tem3d?'geom':'field';
    zs.options[0].disabled=!tem3d;
  }
  /* A classe LAS ground representa o TERRENO. A saída adequada é um MDT
     raster contínuo; uma TIN exata preservaria as lacunas deixadas sob
     construções e outros objetos sem retorno ground. */
  if(L._lidarFiltroClasse==='ground'){
    const tf=document.getElementById('tinFormato'),cw=document.getElementById('tinCSwrap');
    if(typeof window.tinDefineModo==='function')window.tinDefineModo('raster');
    else {if(tf)tf.value='raster';if(cw)cw.style.display='';}
  }
}
/* Coleta de vértices para o TIN, nas duas fontes:
   - 'field': cota única por feição (curvas de nível clássicas com campo COTA)
   - 'geom' : Z POR VÉRTICE (PolyLineZ/DXF 3D/pontos 3D) — vértices sem Z são pulados */
/* Cota da superfície final de uma bacia+rampa. A descrição é serializável e
   acompanha a camada no projeto; assim a TIN pode amostrar o interior das
   superfícies, não apenas ligar seus contornos com triângulos gigantes. */
function tinSurfaceZ(D,x,y){
  if(!D || D.kind!=='bacia-rampa-v1') return null;
  const dentro=(D.limites||[]).some(r=>r&&r.length>=3&&baciaDentro(x,y,r));
  if(!dentro) return null;
  let z=baciaCotaEng(x,y,D.ctr,D.p,D.fundoR,D.arestaR,D.daylightR,
    D.zFundo,D.zAresta,Infinity);
  const R=D.rampa;
  if(R){
    if(R.pista&&baciaDentro(x,y,R.pista)){
      let s=Math.max(0,(x-R.pFundo[0])*R.dirO[0]+(y-R.pFundo[1])*R.dirO[1]);
      let zr;
      if(R.ir&&R.perp&&R.hw){
        const v=(x-R.pFundo[0])*R.perp[0]+(y-R.pFundo[1])*R.perp[1];
        const t=Math.max(0,Math.min(1,(v+R.hw)/(2*R.hw)));
        const sEnd=R.sRight+(R.sLeft-R.sRight)*t;
        s=Math.min(s,sEnd);zr=D.zFundo+s*R.ir;
      }else{
        s=Math.min(R.rampaLen,s);zr=D.zFundo+(s/R.rampaLen)*R.P;
      }
      z=(z==null)?zr:Math.min(z,zr);
    }
    /* Rampa linear nova: as laterais são planos de talude que primeiro são
       EXTRAPOLADOS e depois recortados pelo corredor de interseção. Sem esta
       amostragem, o TIN só conhecia as bordas da pista e projetava triângulos
       pelo vazio até o limite externo. */
    if(R.corredor&&R.perp&&R.hw&&R.ir&&R.tanC&&
       baciaDentro(x,y,R.corredor)){
      const s=(x-R.pFundo[0])*R.dirO[0]+(y-R.pFundo[1])*R.dirO[1];
      const v=(x-R.pFundo[0])*R.perp[0]+(y-R.pFundo[1])*R.perp[1];
      const t=Math.max(0,Math.min(1,(v+R.hw)/(2*R.hw)));
      const sEnd=R.sRight+(R.sLeft-R.sRight)*t;
      if(s>=-1e-6&&s<=sEnd+1e-6){
        let zr=D.zFundo+Math.max(0,s)*R.ir;
        const lateral=Math.max(0,Math.abs(v)-R.hw);
        zr+=lateral*R.tanC;
        z=(z==null)?zr:Math.min(z,zr);
      }
    }
    (R.lados||[]).forEach(Sd=>{
      if(!Sd.ring||!baciaDentro(x,y,Sd.ring)||!Sd.bp||Sd.bp.length<2) return;
      const s=Math.max(0,Math.min(R.rampaLen,
        (x-R.pFundo[0])*R.dirO[0]+(y-R.pFundo[1])*R.dirO[1]));
      const u=(s/R.rampaLen)*(Sd.bp.length-1), i=Math.min(Sd.bp.length-2,Math.floor(u)), t=u-i;
      const lerp=(a,b)=>a+(b-a)*t;
      const bp=[lerp(Sd.bp[i][0],Sd.bp[i+1][0]),lerp(Sd.bp[i][1],Sd.bp[i+1][1])];
      const bt=[lerp(Sd.bt[i][0],Sd.bt[i+1][0]),lerp(Sd.bt[i][1],Sd.bt[i+1][1])];
      const zp=lerp(Sd.zp[i],Sd.zp[i+1]),zt=lerp(Sd.zt[i],Sd.zt[i+1]);
      const vx=bt[0]-bp[0],vy=bt[1]-bp[1],den=vx*vx+vy*vy;
      let q=den?((x-bp[0])*vx+(y-bp[1])*vy)/den:0; q=Math.max(0,Math.min(1,q));
      const zr=zp+(zt-zp)*q;
      z=(z==null)?zr:Math.min(z,zr);
    });
  }
  return isFinite(z)?z:null;
}
function tinCollect(L, src, fld, sampleCS){
  const xs=[],ys=[],zs=[]; let semZ=0,nOrig=0,nSeg=0;
  /* Densificação ADAPTATIVA das breaklines.
     O antigo passo fixo de 0,30 m criava mais de 430 mil vértices numa cava
     com 130 km de linhas e tornava a Delaunay desnecessariamente lenta. Os
     vértices originais (quinas, mudanças de direção e cotas) continuam todos
     preservados; somente os pontos intermediários de segmentos retos são
     limitados a um orçamento seguro. Cavas finais usam ~60 mil amostras de
     linha, suficiente para manter a breakline métrica e reduzir fortemente o
     tempo e o pico de memória. */
  let comprimentoTotal=0;
  if(L.gtype!=='point'){
    (L.features||[]).forEach(f=>{
      if(!f||!f.geom)return;
      const rings=(f.multi&&Array.isArray(f.geom[0])&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
      rings.forEach(r=>{if(!Array.isArray(r))return;
        for(let i=0;i<r.length-1;i++){
          const A=reproj(L.crs,S.workCRS,r[i][0],r[i][1]),B=reproj(L.crs,S.workCRS,r[i+1][0],r[i+1][1]);
          comprimentoTotal+=Math.hypot(B[0]-A[0],B[1]-A[1]);
        }
      });
    });
  }
  const alvoIntermediarios=(typeof tinCavaFinalImportada==='function'&&tinCavaFinalImportada(L))?60000:120000;
  let passoLinha=Math.max(.30,comprimentoTotal/Math.max(1,alvoIntermediarios));
  if(passoLinha>.30)passoLinha=Math.ceil(passoLinha*10)/10;
  passoLinha=Math.min(5,passoLinha);
  const addSeg=(a,b,za,zb,ultimo)=>{
    const A=reproj(L.crs,S.workCRS,a[0],a[1]),B=reproj(L.crs,S.workCRS,b[0],b[1]),
      n=Math.max(1,Math.ceil(Math.hypot(B[0]-A[0],B[1]-A[1])/passoLinha));
    nSeg++;
    for(let k=0;k<(ultimo?n+1:n);k++){
      const t=k/n;xs.push(A[0]+(B[0]-A[0])*t);ys.push(A[1]+(B[1]-A[1])*t);zs.push(za+(zb-za)*t);
    }
  };
  const zgOf=gtZg;
  L.features.forEach(f=>{
    if(!f.geom) return;
    const rings=(L.gtype==='point')?[f.geom]:((f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom]);
    rings.forEach(r=>{ nOrig+=r.length; });
    if(src==='geom'){
      const zg=zgOf(f);
      if(!zg){ semZ+=rings.reduce((s,r)=>s+r.length,0); return; }
      rings.forEach((ring,ri)=>{
        const zr=zg[ri];
        if(L.gtype!=='point'&&ring.length>1){
          for(let vi=0;vi<ring.length-1;vi++){
            const za=zr?(Array.isArray(zr)?zr[vi]:zr):NaN,zb=zr?(Array.isArray(zr)?zr[vi+1]:zr):NaN;
            if(!Number.isFinite(za)||!Number.isFinite(zb)){semZ++;continue;}
            addSeg(ring[vi],ring[vi+1],za,zb,vi===ring.length-2);
          }
        }else ring.forEach((pt,vi)=>{
          const zv=zr?(Array.isArray(zr)?zr[vi]:zr):NaN;
          if(!Number.isFinite(zv)){semZ++;return;}
          const c=reproj(L.crs,S.workCRS,pt[0],pt[1]);xs.push(c[0]);ys.push(c[1]);zs.push(zv);
        });
      });
    } else {
      const zv=parseFloat(String(f.props[fld]).replace(',','.'));
      if(!isFinite(zv)){ semZ++; return; }
      rings.forEach(ring=>{
        if(L.gtype!=='point'&&ring.length>1){
          for(let vi=0;vi<ring.length-1;vi++)addSeg(ring[vi],ring[vi+1],zv,zv,vi===ring.length-2);
        }else ring.forEach(pt=>{const c=reproj(L.crs,S.workCRS,pt[0],pt[1]);xs.push(c[0]);ys.push(c[1]);zs.push(zv);});
      });
    }
  });
  /* Guarda a contagem antes das amostras internas de superfícies especiais,
     para o relatório informar exatamente o efeito da densificação das linhas. */
  const nDensificado=xs.length;
  /* Para uma superfície de projeto, acrescenta pontos internos regulares.
     O fundo recebe todos com a mesma cota; a rampa recebe seções transversais
     planas. A Delaunay passa a ser local e deixa de atravessar toda a caixa. */
  if(src==='geom' && L.tinSurface && L.tinSurface.kind==='bacia-rampa-v1'){
    const D=L.tinSurface, pts=(D.limites||[]).flat();
    if(pts.length){
      let xmin=Math.min(...pts.map(p=>p[0])),xmax=Math.max(...pts.map(p=>p[0])),
          ymin=Math.min(...pts.map(p=>p[1])),ymax=Math.max(...pts.map(p=>p[1]));
      /* A rampa precisa de várias amostras na transversal para que pista e
         taludes não sejam reduzidos a dois ou três triângulos oblíquos. */
      let passo=Math.max(0.15,Math.min(sampleCS||D.cs||1,D.cs||Infinity,
        D.rampa&&D.rampa.largura?D.rampa.largura/8:Infinity));
      const est=((xmax-xmin)/passo+1)*((ymax-ymin)/passo+1);
      if(est>80000) passo*=Math.sqrt(est/80000);
      for(let y=ymin;y<=ymax+passo*.1;y+=passo){
        for(let x=xmin;x<=xmax+passo*.1;x+=passo){
          const z=tinSurfaceZ(D,x,y);
          if(z!=null){ xs.push(x);ys.push(y);zs.push(z); }
        }
      }
    }
  }
  return {xs,ys,zs,semZ,nOrig,nSeg,nDensificado,comprimentoTotal,
    densifyStep:(L.gtype==='point'?0:passoLinha),densifyAdaptive:passoLinha>.300001};
}
/* Condiciona a triangulacao pelo limite externo escolhido.
   Recortar uma Delaunay pronta nao basta quando o limite ultrapassa o fecho
   convexo das breaklines: nessa faixa simplesmente nao existem triangulos e
   o resultado fica vazado. Aqui o anel entra como breakline adicional antes
   da triangulacao. O Z de cada no e herdado da amostra 3D mais proxima da
   rede de origem, que e a extrapolacao conservadora esperada para a ultima
   bancada ate o limite externo. */
function tinAcrescentaLimite(xs,ys,zs,aneis,passo){
  if(!aneis||!aneis.length||xs.length<1)return {adicionados:0,aneis:0};
  const nBase=xs.length;
  let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;
  for(let i=0;i<nBase;i++){
    if(xs[i]<xmin)xmin=xs[i];if(xs[i]>xmax)xmax=xs[i];
    if(ys[i]<ymin)ymin=ys[i];if(ys[i]>ymax)ymax=ys[i];
  }
  const diag=Math.max(1,Math.hypot(xmax-xmin,ymax-ymin));
  const cel=Math.max(.5,passo||1,diag/Math.max(32,Math.sqrt(nBase)));
  const bins=new Map(),key=(ix,iy)=>ix+'|'+iy;
  for(let i=0;i<nBase;i++){
    const k=key(Math.floor(xs[i]/cel),Math.floor(ys[i]/cel));
    let a=bins.get(k);if(!a)bins.set(k,a=[]);a.push(i);
  }
  const zVizinho=(x,y)=>{
    const bx=Math.floor(x/cel),by=Math.floor(y/cel);
    let melhor=-1,d2m=Infinity;
    /* Expande ate encontrar candidatos e percorre mais um anel para nao
       escolher por acaso o primeiro balde tocado. */
    let achou=-1;
    for(let r=0;r<=64;r++){
      for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++){
        if(r&&Math.abs(dx)!==r&&Math.abs(dy)!==r)continue;
        const a=bins.get(key(bx+dx,by+dy));if(!a)continue;
        if(achou<0)achou=r;
        for(const i of a){const ux=xs[i]-x,uy=ys[i]-y,d2=ux*ux+uy*uy;
          if(d2<d2m){d2m=d2;melhor=i;}}
      }
      if(achou>=0&&r>=achou+1)break;
    }
    return melhor>=0?zs[melhor]:NaN;
  };
  let adicionados=0,nAneis=0;
  for(const r0 of aneis){
    if(!r0||r0.length<3)continue;
    const r=r0.slice(),a=r[0],b=r[r.length-1];
    if(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-8)r.push(a);
    nAneis++;
    for(let i=0;i<r.length-1;i++){
      const p=r[i],q=r[i+1],len=Math.hypot(q[0]-p[0],q[1]-p[1]);
      const n=Math.max(1,Math.ceil(len/Math.max(.25,passo||1)));
      for(let j=0;j<n;j++){
        const t=j/n,x=p[0]+(q[0]-p[0])*t,y=p[1]+(q[1]-p[1])*t,z=zVizinho(x,y);
        if(Number.isFinite(z)){xs.push(x);ys.push(y);zs.push(z);adicionados++;}
      }
    }
  }
  return {adicionados,aneis:nAneis};
}
function tinDesligaAnteriores(L){
  if(!L)return;
  const pref=String(L.name||'')+' — MDT';
  (S.rasters||[]).forEach(r=>{
    if(String(r._tinSourceId||'')!==String(L.id)&&!String(r.name||'').startsWith(pref))return;
    r.visible=false;
    if(r.overlay&&typeof map!=='undefined'&&map.hasLayer&&map.hasLayer(r.overlay))map.removeLayer(r.overlay);
  });
}
/* Gera o MDT TIN de uma camada com Z na geometria (zg). Reutilizável:
   o corte por limite chama isto para já entregar cava_c + seu MDT.          */
async function buildTINFromLayer(L, cs, maxEdge, opts){
  opts=opts||{};
  if(L&&L.cavaDesign&&L.cavaDesign.rings&&L.cavaDesign.rings.length>1){
    const g=await tinCavaToGrid(L,cs);
    if(!g)return {err:'A cava não possui breaklines suficientes'};
    const r={id:rid++, name:(opts.name||L.name+' — MDT condicionado ('+cs+' m)'),
      d:{nc:g.nc,nr:g.nr,cs:g.cs,xll:g.xll,yll:g.yll,z:g.z},
      style:{mode:'hipso_hs',opacity:0.8},visible:true,overlay:null,groupId:opts.groupId??null,
      _tinSourceId:L.id,_tinMethod:'cava-breaklines',
      _v3:{papel:'projeto',cor:(L.sym&&L.sym.color)||L.color||'#9b5a2c',limId:L.id}};
    tinDesligaAnteriores(L);
    S.rasters.push(r);placeProductAbove(r,L);renderRaster(r);projectAutoSaveRaster(r);
    let zmn=Infinity,zmx=-Infinity,nCells=0;
    for(const v of g.z)if(!isNaN(v)){nCells++;if(v<zmn)zmn=v;if(v>zmx)zmx=v;}
    return {raster:r,nc:g.nc,nr:g.nr,nCells,zmn,zmx,nVert:0,nCort:g.nc*g.nr-nCells,conditioned:true};
  }
  const col=tinCollect(L, 'geom', null, cs);
  const xs=col.xs, ys=col.ys, zs=col.zs;
  if(xs.length<3) return {err:'Menos de 3 vértices com Z'};
  const seen=new Set(); const X=[],Y=[],Zv=[];
  for(let i=0;i<xs.length;i++){ const k=xs[i].toFixed(3)+'|'+ys[i].toFixed(3);
    if(seen.has(k)) continue; seen.add(k); X.push(xs[i]); Y.push(ys[i]); Zv.push(zs[i]); }
  if(X.length<3) return {err:'Menos de 3 vértices distintos'};
  let minX=X[0],maxX=X[0],minY=Y[0],maxY=Y[0];
  for(let i=1;i<X.length;i++){ if(X[i]<minX)minX=X[i]; if(X[i]>maxX)maxX=X[i];
    if(Y[i]<minY)minY=Y[i]; if(Y[i]>maxY)maxY=Y[i]; }
  const ncEst=Math.ceil((maxX-minX)/cs)+1, nrEst=Math.ceil((maxY-minY)/cs)+1;
  if(ncEst*nrEst > RASTER_MAX_CELLS*4){
    const sug=Math.ceil(Math.sqrt((maxX-minX)*(maxY-minY)/(RASTER_MAX_CELLS*4))*10)/10;
    return {err:`Grade ${ncEst}×${nrEst} grande — use célula ≥ ${sug} m`};
  }
  const coords=new Float64Array(2*X.length);
  for(let i=0;i<X.length;i++){ coords[2*i]=X[i]; coords[2*i+1]=Y[i]; }
  let D; try{ D=delaunay(coords); }catch(e){ return {err:'Triangulação: '+e.message}; }
  const edgeGuard=tinArestaSegura(X,Y,D.triangles,maxEdge||0);
  const g=await tinToGrid(X,Y,Zv,D.triangles,cs,edgeGuard.value);
  // Recorte pelo contorno: sem isto a triangulação preenche o fecho convexo e
  // sobram triângulos atravessando as concavidades do limite.
  let nCort=0;
  const clipRings=(opts.clipRings&&opts.clipRings.length)
    ?opts.clipRings:(typeof tinRecorteAutomatico==='function'?tinRecorteAutomatico(L):null);
  if(clipRings && clipRings.length && typeof tinAplicaRecorte==='function')
    nCort=await tinAplicaRecorte(g, clipRings);
  const malhaTIN=await tinMalhaExata(X,Y,Zv,D.triangles,edgeGuard.value,clipRings);
  const r={id:rid++, name:(opts.name||L.name+' — MDT TIN ('+cs+' m)'),
    d:{nc:g.nc,nr:g.nr,cs:g.cs,xll:g.xll,yll:g.yll,z:g.z},
    style:{mode:'hipso_hs', opacity:0.8}, visible:true, overlay:null, groupId:opts.groupId??null,
    _tinSourceId:L.id,_tinMethod:'delaunay'};
  /* cálculos (volume, cava, perfis) amostram os triângulos exatos daqui em diante */
  tinAnexaExato(r.d,X,Y,Zv,D.triangles,edgeGuard.value,clipRings);
  if(malhaTIN)r._tinMesh=malhaTIN;
  if(clipRings&&clipRings.length)r._exactClipRings=clipRings;
  /* Toda TIN recortada precisa levar o mesmo limite para a cena 3D.
     Antes somente bacia+rampa recebia esta associação: a grade era recortada
     no 2D, mas a malha 3D terminava em centros de célula e ficava afastada da
     linha vetorial. */
  const lim3d=opts.clipLayerId||
    ((clipRings&&clipRings.length)?L.id:'');
  if(lim3d)
    r._v3={papel:'projeto',cor:(L.sym&&L.sym.color)||L.color||'#4f8b3a',limId:lim3d};
  tinDesligaAnteriores(L);S.rasters.push(r);placeProductAbove(r,L); renderRaster(r);
  projectAutoSaveRaster(r);
  let nCells=0,zmn=Infinity,zmx=-Infinity;
  for(const v of g.z) if(!isNaN(v)){ nCells++; if(v<zmn)zmn=v; if(v>zmx)zmx=v; }
  return {raster:r, nc:g.nc, nr:g.nr, nCells, zmn, zmx, nVert:X.length, nCort,
    densifyStep:col.densifyStep,nOrig:col.nOrig,nDensificado:col.nDensificado,
    edgeFilterDisabled:edgeGuard.disabled,edgeFilterRequested:maxEdge||0};
}
/* Conserva somente contornos externos. Curvas de bancos aninhadas são
   breaklines de cota; tratá-las como furos por paridade cria faixas vazias. */
function tinAneisExternos(aneis){
  if(!aneis||aneis.length<2)return aneis||[];
  const area=r=>{let s=0;for(let i=0,j=r.length-1;i<r.length;j=i++)s+=r[j][0]*r[i][1]-r[i][0]*r[j][1];return Math.abs(s/2);};
  const ord=aneis.map((r,i)=>({r,i,a:area(r)})).filter(x=>x.a>1).sort((a,b)=>b.a-a.a),keep=[];
  for(const q of ord){
    let cx=0,cy=0,n=Math.max(1,q.r.length-1);
    for(let i=0;i<n;i++){cx+=q.r[i][0];cy+=q.r[i][1];}cx/=n;cy/=n;
    let p=[cx,cy];
    if(!pointInRing(p[0],p[1],q.r)){
      const a=q.r[0],b=q.r[1]||a;p=[a[0]+(b[0]-a[0])*.001,a[1]+(b[1]-a[1])*.001];
    }
    if(keep.some(k=>pointInRing(p[0],p[1],k.r)))continue;
    keep.push(q);
  }
  return keep.sort((a,b)=>a.i-b.i).map(x=>x.r);
}
/* Recorte do MDT pelo contorno.
   A triangulação de Delaunay preenche o FECHO CONVEXO do conjunto de pontos.
   Onde o contorno real é côncavo (uma pilha em L, uma cava recortada), sobram
   triângulos atravessando o vazio — e o filtro de aresta longa não os pega,
   porque suas arestas podem ser curtas. A solução determinística é recortar a
   grade por um contorno: polígono, ou linha fechada/costurada em anel.      */
function tinRecorte(L,estrito){
  if(!L) return null;
  const partes=[];
  L.features.forEach(f=>{ if(!f.geom) return;
    const rs=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
    rs.forEach(r=>{ if(r.length>=3) partes.push(r.map(pt=>reproj(L.crs,S.workCRS,pt[0],pt[1]))); });
  });
  if(!partes.length) return null;
  if(L.gtype==='polygon') return partes;
  // LINHA: costura fragmentos e fecha cada cadeia
  let ch=partes;
  if(typeof sewChains==='function'){
    // para assim que todos os anéis fecham — o limite pode ter vários
    // polígonos, e forçar cadeia única colaria polígonos vizinhos
    for(const tol of [1,3,8,20,40]){
      const cs=sewChains(partes,tol);
      const abertas=cs.filter(c=>c.length>=4 &&
        Math.hypot(c[0][0]-c[c.length-1][0],c[0][1]-c[c.length-1][1])>Math.max(tol,3)).length;
      ch=cs;
      if(abertas===0) break;
    }
  }
  const aneis=ch.filter(c=>{
    if(c.length<3)return false;
    if(!estrito||L.gtype==='polygon')return true;
    const a=c[0],b=c[c.length-1];
    /* Um limite de recorte não pode ser inventado com uma diagonal entre
       pontas distantes. Aceita somente linha realmente fechada (ou uma
       costura residual de até 3 m entre fragmentos). */
    return Math.hypot(a[0]-b[0],a[1]-b[1])<=3;
  }).map(c=>{
    const a=c[0], b=c[c.length-1];
    return Math.hypot(a[0]-b[0],a[1]-b[1])>1e-6 ? c.concat([a.slice()]) : c;
  });
  const area=r=>{ let s=0; for(let i=0,j=r.length-1;i<r.length;j=i++) s+=r[j][0]*r[i][1]-r[i][0]*r[j][1];
    return Math.abs(s/2); };
  const as=aneis.map(area), mx=Math.max(...as,0);
  // piso ABSOLUTO de 1 m²: anéis pequenos são legítimos (limites com várias
  // ilhas, linhas de interseção fragmentadas); só descarta degenerados
  const validos=aneis.filter((r,i)=>as[i]>=1);
  return L.gtype==='line'?tinAneisExternos(validos):validos;
}
/* Camadas de obra podem conter várias superfícies sobrepostas (fundo,
   taludes, pista), mas trazem uma feição específica que representa o único
   limite externo. Usá-la evita que os anéis internos virem falsos furos no
   recorte da TIN. */
function tinRecorteEstrutural(L){
  if(!L || !L.features) return null;
  const reLim=/^(?:Limite(?:\s+externo)?|Contorno(?:\s+(?:externo|fundido))?|Boundary|Interseção única(?:\s*—.*)?)$/i;
  const sf=L.sym&&L.sym.mode==='cat'?L.sym.field:'';
  const valoresLimite=new Set();
  if(sf)for(const c of (L.sym.cats||[])){
    /* Aceita tanto o valor efetivo quanto um rotulo visual legado. Em alguns
       projetos a arvore mostra "Limite", mas o atributo ainda e 3/6. */
    if(reLim.test(String(c.label!=null?c.label:c.value).trim())||reLim.test(String(c.value).trim()))
      valoresLimite.add(String(c.value));
  }
  const limites=L.features.filter(f=>{
    const p=f.props||{}, campos=['TIPO','CLASSE','CLASS','TYPE','NOME','NAME','CATEGORIA'];
    /* Arquivos finais importados normalmente trazem a borda como classe
       "Limite" (na mesma camada de Crista, Pe e Rampa), enquanto as obras
       geradas no CCMGIS usam TIPO="Limite externo"/"Contorno fundido". */
    return (sf&&valoresLimite.has(String(p[sf]))) ||
      campos.some(k=>reLim.test(String(p[k]||'').trim())) ||
      Object.values(p).some(v=>reLim.test(String(v==null?'':v).trim()));
  });
  if(!limites.length) return null;
  const aneis=[];
  limites.forEach(f=>{
    const rs=(f.multi&&Array.isArray(f.geom&&f.geom[0]&&f.geom[0][0]))?f.geom:[f.geom];
    rs.forEach(r=>{
      if(!r||r.length<3) return;
      const q=r.map(pt=>reproj(L.crs,S.workCRS,pt[0],pt[1]));
      const a=q[0],b=q[q.length-1];
      if(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-8) q.push(a.slice());
      aneis.push(q);
    });
  });
  return aneis.length?aneis:null;
}
/* Limite automático seguro. Prioriza a descrição analítica da obra e as
   feições técnicas; para uma linha comum usa somente o(s) anel(is) externo(s)
   realmente fechados. Isso evita o fecho convexo da Delaunay sem transformar
   cristas/pés internos em falsos furos. */
function tinRecorteAutomatico(L){
  if(!L)return null;
  if(L.tinSurface&&Array.isArray(L.tinSurface.limites)&&L.tinSurface.limites.length)
    return L.tinSurface.limites.filter(r=>r&&r.length>=3).map(r=>{
      const q=r.map(p=>[p[0],p[1]]),a=q[0],b=q[q.length-1];
      if(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-8)q.push(a.slice());return q;
    });
  if(Array.isArray(L._tinClipRings)&&L._tinClipRings.length)
    return L._tinClipRings.map(r=>r.map(p=>[p[0],p[1]]));
  const estrut=tinRecorteEstrutural(L);if(estrut&&estrut.length)return estrut;
  return tinRecorte(L,true);
}
/* aplica o recorte na grade já interpolada */
async function tinAplicaRecorte(g, aneis){
  if(!aneis || !aneis.length) return 0;
  /* SCANLINE em vez de ponto-em-polígono célula a célula.
     O método antigo custava (células × vértices dos anéis) — com um limite
     fragmentado (ex.: linha de interseção, centenas de anéis e dezenas de
     milhares de vértices) sobre um MDT fino, isso vira horas. Aqui cada LINHA
     da grade calcula uma única vez onde cruza as arestas de todos os anéis,
     ordena os cruzamentos e preenche por paridade — mesma regra meia-aberta
     do pointInRing, então o resultado é idêntico, só que ~milhares de vezes
     mais rápido. Um índice de arestas por faixa de Y evita varrer arestas
     longe da linha corrente.                                                */
  // 1) arestas de todos os anéis (horizontais não cruzam a scanline)
  const ex1=[],ey1=[],ex2=[],ey2=[];
  for(const r of aneis){
    for(let i=0,j=r.length-1;i<r.length;j=i++){
      const y1=r[j][1], y2=r[i][1];
      if(y1===y2) continue;
      ex1.push(r[j][0]); ey1.push(y1); ex2.push(r[i][0]); ey2.push(y2);
    }
  }
  const nE=ey1.length;
  if(!nE) return 0;
  // 2) índice por faixas de Y
  let mnY=Infinity,mxY=-Infinity;
  for(let k=0;k<nE;k++){ const a=Math.min(ey1[k],ey2[k]), b=Math.max(ey1[k],ey2[k]);
    if(a<mnY)mnY=a; if(b>mxY)mxY=b; }
  const nb=Math.max(1,Math.min(4096,g.nr));
  const h=Math.max(1e-9,(mxY-mnY)/nb);
  const bands=Array.from({length:nb},()=>[]);
  for(let k=0;k<nE;k++){
    let b0=Math.floor((Math.min(ey1[k],ey2[k])-mnY)/h),
        b1=Math.floor((Math.max(ey1[k],ey2[k])-mnY)/h);
    b0=Math.max(0,Math.min(nb-1,b0)); b1=Math.max(0,Math.min(nb-1,b1));
    for(let b=b0;b<=b1;b++) bands[b].push(k);
  }
  // 3) linha a linha: cruzamentos → paridade
  let cortadas=0; const xs=[];
  for(let j=0;j<g.nr;j++){
    if((j & 255)===0){                            // respira: página nunca "trava"
      await respira();
      if(typeof showLoad==='function' && g.nr>4000)
        showLoad(`Recortando MDT pelo limite — ${(100*j/g.nr).toFixed(0)}%`);
    }
    const Y=g.yll+(g.nr-1-j+0.5)*g.cs;
    xs.length=0;
    if(Y>=mnY && Y<=mxY){
      const bi=Math.max(0,Math.min(nb-1,Math.floor((Y-mnY)/h)));
      const cand=bands[bi];
      for(let c=0;c<cand.length;c++){ const k=cand[c];
        const y1=ey1[k], y2=ey2[k];
        if((y1>Y)!==(y2>Y))
          xs.push(ex1[k]+(ex2[k]-ex1[k])*(Y-y1)/(y2-y1));
      }
    }
    const base=j*g.nc;
    if(!xs.length){                               // linha inteira fora de todos os anéis
      for(let i=0;i<g.nc;i++){ const k=base+i;
        if(!isNaN(g.z[k])){ g.z[k]=NaN; cortadas++; } }
      continue;
    }
    xs.sort((a,b)=>a-b);
    let p=0;                                      // cruzamentos já à esquerda de X
    for(let i=0;i<g.nc;i++){
      const X=g.xll+(i+0.5)*g.cs;
      while(p<xs.length && xs[p]<X) p++;
      if((p%2)===0){ const k=base+i;              // nº PAR de cruzamentos = fora
        if(!isNaN(g.z[k])){ g.z[k]=NaN; cortadas++; } }
    }
  }
  return cortadas;
}
function refreshTinClip(){
  const sel=document.getElementById('tinClip'); if(!sel) return;
  const v=sel.value;
  const cands=S.layers.filter(l=>l.gtype==='polygon'||l.gtype==='line');
  sel.innerHTML='<option value="">— escolha o limite —</option>'+ 
    cands.map(l=>`<option value="${l.id}">${l.gtype==='line'?'〰 ':'▢ '}${esc(l.name)}</option>`).join('');
  if(v && [...sel.options].some(o=>o.value===v)) sel.value=v;
  tinAtualizaModoLimite();
}
function tinAtualizaModoLimite(){
  const modo=(document.getElementById('tinLimitMode')||{}).value||'auto';
  const wrap=document.getElementById('tinClipWrap'); if(wrap)wrap.style.display=modo==='layer'?'':'none';
  const st=document.getElementById('tinClipStatus'); if(!st)return;
  const srcSel=document.getElementById('tinLayer');
  const L=S.layers.find(l=>srcSel&&String(l.id)===String(srcSel.value));
  let alvo=null, aneis=null, texto='';
  if(modo==='open'){
    texto='Sem recorte: todas as linhas/pontos 3D serão triangulados.';
  }else if(modo==='layer'){
    const id=(document.getElementById('tinClip')||{}).value||'';
    alvo=S.layers.find(l=>String(l.id)===String(id));
    aneis=alvo?tinRecorte(alvo,true):null;
    texto=alvo?`Camada escolhida: ${alvo.name}`:'Escolha uma camada de limite.';
  }else{
    /* Anéis existentes numa camada linear podem ser curvas de nível fechadas,
       e portanto nunca são promovidos implicitamente a máscara externa. */
    alvo=null; aneis=null;
    texto=L?`Camada de entrada: ${L.name}. Todas as feições serão usadas como breaklines.`:
      'Escolha a camada de entrada.';
  }
  const ok=!!(aneis&&aneis.length);
  st.innerHTML=ok
    ?`<span style="color:var(--ok)"><b>✓ Limite fechado válido.</b></span><br>${esc(texto)} · ${aneis.length} contorno(s).`
    :`<span style="color:var(--ok)"><b>✓ Linhas abertas aceitas.</b></span><br>${esc(texto)} A superfície será gerada sem recorte fechado.`;
}

/* Cavas importadas de softwares de mina costumam chegar como uma rede 3D de
   cristas, pés e rampas já cortada no encontro com o terreno. A borda desse
   encontro é formada por vários trechos abertos em cotas diferentes; exigir
   que ela seja um único anel 2D impede a triangulação. Para esse caso, o MDT
   é o próprio limite físico: conserva somente a superfície de projeto que
   fica abaixo (ou coincide com) o terreno natural. */
function tinCavaFinalImportada(L){
  if(!L || L.gtype!=='line') return false;
  const norm=s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const nome=norm(L.name);
  /* Aceita também o nome histórico "cava_fnal..." (sem o i), presente em
     projetos reais. A identificação não pode depender somente de TIPO:
     arquivos SHP/SURPAC frequentemente chegam classificados por CAMADA. */
  const nomeCavaFinal=/\bcava\b/.test(nome)&&(/\bfinal\b/.test(nome)||/\bfnal\b/.test(nome));
  const fs=(L.features||[]).filter(f=>f&&f.geom);
  let comZ=0,fechadas=0; const classes=new Set();
  fs.forEach(f=>{
    const z=f.zg;
    const flat=Array.isArray(z)?z.flat(3):[];
    if(flat.some(Number.isFinite))comZ++;
    const rs=(f.multi&&Array.isArray(f.geom[0])&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
    if(rs.some(r=>Array.isArray(r)&&r.length>2&&
      Math.hypot(r[0][0]-r[r.length-1][0],r[0][1]-r[r.length-1][1])<0.05))fechadas++;
    Object.values(f.props||{}).forEach(v=>{const q=norm(v);if(q)classes.add(q);});
  });
  const temCrista=[...classes].some(v=>/\bcrista\b/.test(v));
  const temPe=[...classes].some(v=>v==='pe'||/\bpe\b/.test(v));
  const rede3D=comZ>=Math.max(3,Math.ceil(fs.length*.5));
  /* Uma cava final exportada possui várias breaklines 3D e, em geral,
     mistura anéis internos fechados com cristas/pés abertos no encontro com
     o terreno. Os anéis fechados NÃO são o contorno externo da superfície. */
  return rede3D&&((temCrista&&temPe)||(nomeCavaFinal&&fs.length>=3&&fechadas<fs.length));
}
function tinTerrenoCavaFinal(L){
  const rs=(S.rasters||[]).filter(r=>r&&r.d&&r.d.z&&r.d.nc&&r.d.nr);
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const fonte=String(L&&L.id||'');
  const validos=rs.filter(r=>String(r._tinSourceId||'')!==fonte);
  return validos.find(r=>/^mdt$/i.test(String(r.name||'').trim())) ||
    validos.find(r=>/^topografia(?:\s+natural)?$/i.test(String(r.name||'').trim())) ||
    validos.find(r=>/\b(mdt|terreno natural|topografia natural)\b/.test(norm(r.name))) || null;
}
/* ================== INTERSEÇÃO REAL LINHAS × MDT ==================
   Exigência: a interseção de duas superfícies é o conjunto de pontos XYZ
   comuns às duas. Nada de média nem interpolação de anel para anel: primeiro
   acham-se os NÓS EXATOS — os pontos onde cada linha de crista/pé FURA o
   terreno, resolvidos por bisseção sobre o próprio segmento (a cota da linha
   é linear no segmento; o terreno é reamostrado a cada passo) — e a curva de
   interseção é obrigada a passar por eles, porque eles entram como VÉRTICES
   da malha antes do corte no nível zero.                                   */
function tinNosLinhaTerreno(L,g){
  const nos=[]; const cs=Math.max(0.05,g.cs||1);
  const feats=(L&&L.features)||[];
  for(let fi=0;fi<feats.length;fi++){
    const f=feats[fi]; if(!f||!f.geom||!f.zg) continue;
    const nested=!!(f.multi&&Array.isArray(f.geom[0])&&Array.isArray(f.geom[0][0]));
    const rings=nested?f.geom:[f.geom], zrs=nested?f.zg:[f.zg];
    for(let ri=0;ri<rings.length;ri++){
      const ring=rings[ri], zr=zrs&&zrs[ri];
      if(!Array.isArray(ring)||!Array.isArray(zr)) continue;
      for(let i=1;i<ring.length;i++){
        const A=reproj(L.crs,S.workCRS,ring[i-1][0],ring[i-1][1]),
              B=reproj(L.crs,S.workCRS,ring[i][0],ring[i][1]);
        const za=+zr[i-1], zb=+zr[i];
        if(!Number.isFinite(za)||!Number.isFinite(zb)) continue;
        const Ls=Math.hypot(B[0]-A[0],B[1]-A[1]); if(!(Ls>0)) continue;
        const fT=t=>{const x=A[0]+(B[0]-A[0])*t,y=A[1]+(B[1]-A[1])*t,
          zt=sampleZbil(g,x,y);return Number.isFinite(zt)?(za+(zb-za)*t-zt):NaN;};
        /* varre em passos de meia célula: um segmento comprido pode furar o
           terreno mais de uma vez */
        const nSub=Math.max(1,Math.ceil(Ls/Math.max(cs*0.5,0.1)));
        let t0=0,d0=fT(0);
        for(let k=1;k<=nSub;k++){
          const t1=k/nSub,d1=fT(t1);
          if(Number.isFinite(d0)&&Number.isFinite(d1)&&d0*d1<0){
            let lo=t0,hi=t1;
            for(let it=0;it<48;it++){const tm=(lo+hi)/2,dm=fT(tm);
              if(!Number.isFinite(dm))break;
              if((dm<0)===(d0<0))lo=tm;else hi=tm;}
            const tm=(lo+hi)/2;
            nos.push([A[0]+(B[0]-A[0])*tm,A[1]+(B[1]-A[1])*tm,za+(zb-za)*tm,fi]);
          }
          t0=t1;d0=d1;
        }
      }
    }
  }
  return nos;
}
/* Descasque do fecho convexo: remove, DE FORA PARA DENTRO, apenas o
   triângulo comprido que encosta na borda da triangulação, propagando pelos
   vizinhos. O vão legítimo interno (patamar largo) sobrevive — o limiar é a
   cauda alta (p99,9 × 1,2), não o percentil típico. */
function tinPelaBordaLonga(X,Y,tri,half){
  const nT=(tri.length/3)|0, dead=new Uint8Array(nT);
  if(!nT||!half||!half.length)return dead;
  const eMax=t=>{const a=tri[3*t],b=tri[3*t+1],c=tri[3*t+2];
    return Math.max(Math.hypot(X[a]-X[b],Y[a]-Y[b]),
      Math.hypot(X[b]-X[c],Y[b]-Y[c]),Math.hypot(X[c]-X[a],Y[c]-Y[a]));};
  const amostra=Math.min(nT,60000),passo=Math.max(1,Math.floor(nT/amostra)),em=[];
  for(let t=0;t<nT;t+=passo)em.push(eMax(t));
  em.sort((u,v)=>u-v);
  const lim=Math.max(1,(em[Math.min(em.length-1,Math.floor(em.length*0.999))]||1)*1.2);
  const fila=[];
  for(let e=0;e<half.length;e++)if(half[e]===-1)fila.push((e/3)|0);
  while(fila.length){
    const t=fila.pop(); if(dead[t])continue;
    if(eMax(t)<=lim)continue;
    dead[t]=1;
    for(let k=0;k<3;k++){const h=half[3*t+k];
      if(h>=0){const v=(h/3)|0;if(!dead[v])fila.push(v);}}
  }
  return dead;
}
async function tinIntersecaoLinhasMDT(L,g,rNome){
  /* 1) vértices das linhas (com cota própria) + nós exatos */
  const X=[],Y=[],Z=[],chave=new Map();
  const põe=(x,y,z)=>{const k=x.toFixed(7)+','+y.toFixed(7);
    if(chave.has(k))return chave.get(k);
    const i=X.length;X.push(x);Y.push(y);Z.push(z);chave.set(k,i);return i;};
  (L.features||[]).forEach(f=>{
    if(!f.geom||!f.zg)return;
    const nested=!!(f.multi&&Array.isArray(f.geom[0])&&Array.isArray(f.geom[0][0]));
    const rings=nested?f.geom:[f.geom], zrs=nested?f.zg:[f.zg];
    rings.forEach((ring,ri)=>{const zr=zrs&&zrs[ri];
      if(!Array.isArray(ring)||!Array.isArray(zr))return;
      for(let i=0;i<ring.length;i++){const z=+zr[i];
        if(!Number.isFinite(z))continue;
        const c=reproj(L.crs,S.workCRS,ring[i][0],ring[i][1]);
        põe(c[0],c[1],z);}
    });
  });
  const nos=tinNosLinhaTerreno(L,g);
  const idxNo=new Set(nos.map(no=>põe(no[0],no[1],no[2])));
  if(X.length<3)return {feats:[],nos:0,vertices:X.length,tris:0};
  await respira();
  /* 2) superfície das linhas (Delaunay) com descasque do fecho */
  const coords=new Float64Array(2*X.length);
  for(let i=0;i<X.length;i++){coords[2*i]=X[i];coords[2*i+1]=Y[i];}
  const D=delaunay(coords), tri=D.triangles, half=D.halfedges;
  const dead=tinPelaBordaLonga(X,Y,tri,half);
  /* 3) diferença projeto − terreno em cada vértice */
  const dT=new Float64Array(X.length);
  for(let i=0;i<X.length;i++){const zt=sampleZbil(g,X[i],Y[i]);
    dT[i]=Number.isFinite(zt)?Z[i]-zt:NaN;
    if((i&8191)===0)await respira();}
  /* 4) corte no nível zero, aresta a aresta, com o terreno REAMOSTRADO na
        bisseção (a diferença não é linear na aresta — interpolar seria
        inventar ponto que não pertence às duas superfícies) */
  const eps=1e-9, raizes=new Map(), segs=[];
  const raiz=(a,b)=>{
    const k=a<b?a+'|'+b:b+'|'+a;
    if(raizes.has(k))return raizes.get(k);
    const fT=t=>{const x=X[a]+(X[b]-X[a])*t,y=Y[a]+(Y[b]-Y[a])*t,
      zt=sampleZbil(g,x,y);return Number.isFinite(zt)?(Z[a]+(Z[b]-Z[a])*t-zt):NaN;};
    let lo=0,hi=1;const d0=dT[a];
    for(let it=0;it<48;it++){const tm=(lo+hi)/2,dm=fT(tm);
      if(!Number.isFinite(dm))break;
      if((dm<0)===(d0<0))lo=tm;else hi=tm;}
    const tm=(lo+hi)/2,p=[X[a]+(X[b]-X[a])*tm,Y[a]+(Y[b]-Y[a])*tm,Z[a]+(Z[b]-Z[a])*tm];
    raizes.set(k,p);return p;
  };
  const nT=(tri.length/3)|0;
  for(let t=0;t<nT;t++){
    if(dead[t])continue;
    const a=tri[3*t],b=tri[3*t+1],c=tri[3*t+2];
    const da=dT[a],db=dT[b],dc=dT[c];
    if(!Number.isFinite(da)||!Number.isFinite(db)||!Number.isFinite(dc))continue;
    const pts=[],add=p=>{if(!pts.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<=1e-9))pts.push(p);};
    [[a,da],[b,db],[c,dc]].forEach(([v,d])=>{if(Math.abs(d)<=eps)add([X[v],Y[v],Z[v]]);});
    [[a,b],[b,c],[c,a]].forEach(([u,v])=>{
      if(Math.abs(dT[u])>eps&&Math.abs(dT[v])>eps&&dT[u]*dT[v]<0)add(raiz(u,v));});
    if(pts.length===2)segs.push([pts[0],pts[1]]);
    else if(pts.length>2){let A2=pts[0],B2=pts[1],bd=0;
      for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
        const d=Math.hypot(pts[i][0]-pts[j][0],pts[i][1]-pts[j][1]);
        if(d>bd){bd=d;A2=pts[i];B2=pts[j];}}
      segs.push([A2,B2]);}
    if((t&16383)===0)await respira();
  }
  /* 5) costura topológica dos segmentos em polilinhas */
  const tolNo=1e-7, mapa=new Map(), nodes=[];
  const node=p=>{const k=p[0].toFixed(6)+','+p[1].toFixed(6);
    let n=mapa.get(k);
    if(!n){n={p:[p[0],p[1],p[2]],e:[]};mapa.set(k,n);nodes.push(n);}return n;};
  const edges=[];
  for(const s of segs){
    if(Math.hypot(s[0][0]-s[1][0],s[0][1]-s[1][1])<=tolNo)continue;
    const a=node(s[0]),b=node(s[1]);if(a===b)continue;
    if(edges.some(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a)))continue;
    const e={a,b,used:false};edges.push(e);a.e.push(e);b.e.push(e);
  }
  const cadeias=[],trace=start=>{
    const out=[start.p.slice()];let cur=start,prev=null,guard=edges.length+2;
    while(guard-->0){const e=cur.e.find(q=>!q.used&&q!==prev);if(!e)break;
      e.used=true;const nx=e.a===cur?e.b:e.a;out.push(nx.p.slice());prev=e;cur=nx;
      if(cur===start)break;}
    return out;};
  nodes.filter(n=>n.e.length!==2).forEach(n=>{
    while(n.e.some(e=>!e.used)){const q=trace(n);if(q.length>1)cadeias.push(q);}});
  edges.forEach(e=>{if(!e.used){const q=trace(e.a);if(q.length>1)cadeias.push(q);}});
  const feats=cadeias.map((q,i)=>({
    geom:q.map(p=>[p[0],p[1]]),multi:false,
    zg:q.map(p=>p[2]),
    props:{ORDEM:i+1,MDT:rNome,LINHAS:L.name,PONTOS:q.length,
      METODO:'nós exatos por bisseção + zero da malha × MDT'}
  }));
  return {feats,nos:nos.length,vertices:X.length,tris:nT,
    descartados:Array.from(dead).reduce((s,v)=>s+v,0)};
}
async function runTinInterMdt(){
  const sel=document.getElementById('tinLayer');
  const L=S.layers.find(l=>String(l.id)===(sel&&sel.value));
  if(!L){toast('Escolha a camada de linhas');return;}
  const temZ=(L.features||[]).some(f=>{const zz=f.zg;if(!zz)return false;
    const flat=(f.multi&&Array.isArray(zz[0]))?zz.flat():zz;
    return Array.isArray(flat)&&flat.some(v=>v!=null&&isFinite(v));});
  if(!temZ){toast('A camada precisa ter cota própria (3D) nas linhas de crista e pé');return;}
  const selR=document.getElementById('tinInterMdt');
  const g=(S.rasters||[]).find(r=>String(r.id)===(selR&&selR.value));
  if(!g||!g.d){toast('Escolha o MDT');return;}
  showLoad('Interseção real: achando onde crista e pé furam o terreno…');
  await respira();
  try{
    const R=await tinIntersecaoLinhasMDT(L,g.d,g.name);
    if(!R.feats.length){hideLoad();
      toast('Nenhum cruzamento: as linhas não furam esse MDT (confira o CRS e as cotas)');return;}
    const nova=addLayer({sourceLayer:L,name:`${L.name} × ${g.name} — interseção`,gtype:'line',
      crs:S.workCRS,features:R.feats,
      fields:[{name:'ORDEM',type:'N'},{name:'MDT',type:'C'},{name:'LINHAS',type:'C'},
        {name:'PONTOS',type:'N'},{name:'METODO',type:'C'}],color:'#d81b60'});
    nova._interExata=1;
    hideLoad();
    const out=document.getElementById('tinOut');
    if(out)out.innerHTML=`Interseção real gerada: <b>${R.feats.length}</b> linha(s), `+
      `<b>${R.nos}</b> nós exatos onde crista/pé furam o terreno, `+
      `${R.tris.toLocaleString('pt-BR')} triângulos varridos (${R.descartados} do fecho descartados).`;
    toast(`Interseção com ${g.name}: ${R.feats.length} linha(s), ${R.nos} nós exatos`);
    try{refreshUI();}catch(e){}
    try{if(typeof v3Auto==='function')v3Auto();}catch(e){}
  }catch(e){hideLoad();toast('Falha na interseção: '+(e&&e.message||e));}
}
async function tinRecortaCavaNoTerreno(g,terreno){
  if(!g||!terreno)return {removidas:0,validas:0};
  const tol=Math.max(0.05,Math.min(1.0,Math.max(g.cs||0,terreno.cs||0)*0.35));
  let removidas=0,validas=0;
  for(let row=0;row<g.nr;row++){
    if((row&127)===0){
      await respira();
      if(g.nr>500)showLoad(`Recortando a cava no encontro com o MDT — ${(100*row/g.nr).toFixed(0)}%`);
    }
    const y=g.yll+(g.nr-1-row+.5)*g.cs;
    for(let col=0;col<g.nc;col++){
      const k=row*g.nc+col,zp=g.z[k];
      if(!Number.isFinite(zp))continue;
      const x=g.xll+(col+.5)*g.cs,zt=sampleZbil(terreno,x,y);
      if(!Number.isFinite(zt)||zp>zt+tol){g.z[k]=NaN;removidas++;}
      else validas++;
    }
  }
  return {removidas,validas,tol};
}

async function runTIN(){
  const sel=document.getElementById('tinLayer');
  let L=S.layers.find(l=>String(l.id)===sel.value);
  if(!L){ toast('Selecione a camada de curvas/pontos'); return; }
  /* Projetos salvos antes do modelo condicionado guardavam apenas as linhas
     já cortadas e, por isso, recaíam na Delaunay comum. Reconstrói a mesma
     cava silenciosamente a partir do limite/MDT originais antes de gerar o
     raster; o usuário não precisa apagar nem redesenhar a camada. */
  if(L.cavaDesign&&(!L.cavaDesign.rings||L.cavaDesign.rings.length<2)){
    const d=L.cavaDesign,fonte=typeof cavaResolverFonte==='function'&&cavaResolverFonte(d);
    if(fonte&&typeof cavaGerar==='function'){
      const rebuilt=cavaGerar({item:fonte,replaceLayer:L,params:d,silent:true});
      if(rebuilt)L=rebuilt;
    }
  }
  const src=(document.getElementById('tinZSrc')||{}).value||'field';
  const fld=document.getElementById('tinField').value;
  if(src==='field' && !fld){ toast('Selecione o campo da cota'); return; }
  if(src==='geom' && !L.features.some(f=>gtZg(f))){
    toast('Esta camada não tem Z na geometria — use a fonte "Campo da feição"'); return; }
  const isGroundLidar=L._lidarFiltroClasse==='ground';
  let cs=+document.getElementById('tinCS').value||5;
  /* DOIS PRODUTOS DISTINTOS: 'raster' = grade plena na célula escolhida,
     exatamente como sempre foi; 'tin' = superfície leve estilo Surpac —
     a grade vira só um retrato de exibição (célula automática) e quem
     manda em tudo é a triangulação. */
  /* Ground é sempre materializado como MDT em grade para permitir fechar
     as lacunas internas dos objetos removidos pela classificação LAS. */
  const tinFormato=isGroundLidar?'raster':((document.getElementById('tinFormato')||{}).value||'tin');
  const maxEdge=+document.getElementById('tinMaxEdge').value||0;
  /* O recorte é opcional. Curvas abertas e fechadas da camada de entrada são
     breaklines; somente uma camada escolhida explicitamente atua como máscara. */
  const limiteModo=(document.getElementById('tinLimitMode')||{}).value||'auto';
  const clipValue=(document.getElementById('tinClip')||{}).value||'';
  const LcPlanejado=limiteModo==='layer'
    ?(S.layers.find(l=>String(l.id)===String(clipValue))||null):null;
  const ehCavaFinalImportada=tinCavaFinalImportada(L);
  const cortarPeloMdt=!!((document.getElementById('tinCutMdt')||{}).checked);
  const mdtValue=(document.getElementById('tinInterMdt')||{}).value||'';
  const cavaFinalPorTerreno=cortarPeloMdt?
    (S.rasters||[]).find(r=>String(r.id)===String(mdtValue)&&r&&r.d&&r.d.z):null;
  if(cortarPeloMdt&&!cavaFinalPorTerreno){
    toast('Escolha o MDT que será usado no recorte ou desmarque o recorte pelo MDT.');
    return;
  }
  /* Uma cava final importada já é uma rede de breaklines 3D. Gerar a sua
     superfície NÃO depende de MDT: os pontos/linhas da própria cava entram
     na Delaunay e o filtro de arestas limita o fecho externo. Os 39 anéis
     fechados existentes no arquivo real são bancos internos, não um limite
     de recorte. O MDT fica reservado à ferramenta explícita de interseção. */
  const recortePorTerreno=!!cavaFinalPorTerreno;
  /* Nunca interpreta anéis da camada linear como limite externo automático:
     eles podem ser apenas curvas de nível fechadas misturadas às abertas. */
  const estrutPlanejado=null;
  const aneisPlanejados=recortePorTerreno?null:
    (limiteModo==='layer'?(LcPlanejado?tinRecorte(LcPlanejado,true):null):estrutPlanejado);
  /* Um limite é apenas uma máscara opcional. Linhas abertas, curvas de nível
     abertas e pontos sempre seguem para a Delaunay. Quando o usuário escolhe
     uma máscara inválida, ignora-se o recorte sem impedir a superfície. */
  if(limiteModo==='layer'&&(!aneisPlanejados||!aneisPlanejados.length))
    toast('A camada escolhida não forma um limite fechado; gerando a superfície pelas linhas abertas, sem recorte.');

  showLoad(L.gtype==='point'?'Coletando pontos…':'Preparando breaklines com densificação adaptativa…');
  await new Promise(r=>setTimeout(r,10));

  const col=tinCollect(L, src, fld, cs);
  const xs=col.xs, ys=col.ys, zs=col.zs; const semZ=col.semZ;
  if(xs.length<3){ hideLoad(); toast('Menos de 3 vértices com cota válida'); return; }

  /* O limite participa da propria triangulacao. Sem estes nos, o clip apenas
     cortava o que ja existia e deixava em branco toda porcao do poligono que
     ultrapassava o fecho das ultimas curvas (regressao visivel na Cava Final
     de argila). Nao se aplica ao corte por MDT, cujo bordo e uma intersecao
     calculada entre duas superficies. */
  const limiteCondicionado=(!recortePorTerreno&&aneisPlanejados&&aneisPlanejados.length)
    ?tinAcrescentaLimite(xs,ys,zs,aneisPlanejados,Math.max(.5,Math.min(2,cs||1)))
    :{adicionados:0,aneis:0};

  // deduplicação (curvas de nível costumam ter vértices coincidentes)
  /* NUVEM DE PONTOS: pontos empilhados no mesmo XY com Z diferente (parede de
     edificação, vegetação sobre o solo) criam as “agulhas” verticais na
     Delaunay 2D. Numa superfície 2.5D só cabe UM Z por posição: colapsa-se
     por célula fina (~espaçamento típico) guardando o PONTO MAIS ALTO —
     envelope superior: contêiner e telhado fecham como blocos, sem furos. */
  const ehNuvem=(L.gtype==='point'&&xs.length>20000);
  const X=[],Y=[],Zv=[]; let nDup=0, tolNuvem=0;
  if(ehNuvem){
    let bx0=Infinity,bx1=-Infinity,by0=Infinity,by1=-Infinity;
    for(let i=0;i<xs.length;i++){ if(xs[i]<bx0)bx0=xs[i]; if(xs[i]>bx1)bx1=xs[i];
                                  if(ys[i]<by0)by0=ys[i]; if(ys[i]>by1)by1=ys[i]; }
    tolNuvem=Math.max(0.05,Math.sqrt(Math.max(1,(bx1-bx0)*(by1-by0))/xs.length)*0.9);
    const M=new Map();
    for(let i=0;i<xs.length;i++){
      const k=Math.floor(xs[i]/tolNuvem)+':'+Math.floor(ys[i]/tolNuvem);
      const c=M.get(k);
      if(!c||zs[i]>c.z)M.set(k,{x:xs[i],y:ys[i],z:zs[i]});
    }
    M.forEach(c=>{X.push(c.x);Y.push(c.y);Zv.push(c.z);});
    nDup=xs.length-X.length;
  }else{
    const seen=new Set();
    for(let i=0;i<xs.length;i++){
      const k=xs[i].toFixed(3)+'|'+ys[i].toFixed(3);
      if(seen.has(k)) continue;
      seen.add(k); X.push(xs[i]); Y.push(ys[i]); Zv.push(zs[i]);
    }
    nDup=xs.length-X.length;
  }
  if(X.length<3){ hideLoad(); toast('Menos de 3 vértices distintos'); return; }

  let minX=X[0],maxX=X[0],minY=Y[0],maxY=Y[0];
  for(let i=1;i<X.length;i++){ if(X[i]<minX)minX=X[i]; if(X[i]>maxX)maxX=X[i];
                               if(Y[i]<minY)minY=Y[i]; if(Y[i]>maxY)maxY=Y[i]; }
  /* No TIN a grade existe apenas como retrato 2D/apoio de tela. Sua resolução
     é automática e não deriva de um “tamanho de célula” escolhido pelo usuário. */
  if(tinFormato==='tin'){
    const lado=Math.max(maxX-minX,maxY-minY)||1;
    cs=Math.max(.05,Math.ceil(lado/256*100)/100);
  }
  const ncEst=Math.ceil((maxX-minX)/cs)+1, nrEst=Math.ceil((maxY-minY)/cs)+1;
  if(ncEst*nrEst > RASTER_MAX_CELLS*4){
    hideLoad();
    const sug=Math.ceil(Math.sqrt((maxX-minX)*(maxY-minY)/(RASTER_MAX_CELLS*4))*10)/10;
    toast(`Grade ${ncEst}×${nrEst} grande demais para célula de ${cs} m — use ≥ ${sug} m`);
    return;
  }

  const t0=performance.now();
  const cavaCondicionada=!!(L.cavaDesign&&L.cavaDesign.rings&&L.cavaDesign.rings.length>1);
  const maxEdgeUso=maxEdge;
  let D=null,g,edgeGuard={value:0,disabled:false,kept:0,total:0};
  if(cavaCondicionada){
    showLoad('Construindo bancos com breaklines obrigatórias…');
    await new Promise(r=>setTimeout(r,10));
    g=await tinCavaToGrid(L,cs);
    if(!g){hideLoad();toast('A cava não possui linhas de pé/crista suficientes');return;}
  }else{
    showLoad(`Triangulando ${X.length.toLocaleString('pt-BR')} vértices…`);
    await new Promise(r=>setTimeout(r,10));
    const coords=new Float64Array(2*X.length);
    for(let i=0;i<X.length;i++){ coords[2*i]=X[i]; coords[2*i+1]=Y[i]; }
    try{ D=delaunay(coords); }
    catch(e){ hideLoad(); toast('Falha na triangulação: '+e.message); return; }
    /* Sem máscara fechada, a Delaunay usa o domínio dos vértices. A aresta
       máxima, quando informada, continua sendo apenas um controle adicional. */
    edgeGuard=tinArestaSegura(X,Y,D.triangles,maxEdgeUso,
      false);
    if(edgeGuard.disabled)
      showLoad(`Filtro de ${maxEdgeUso} m abriria a malha — usando TIN contínuo…`);
  }
  const t1=performance.now();

  if(!cavaCondicionada){
    showLoad(`Interpolando grade ${ncEst}×${nrEst}…`);
    await new Promise(r=>setTimeout(r,10));
    g=await tinToGrid(X,Y,Zv,D.triangles,cs,edgeGuard.value);
  }
  let lacunasGround={celulas:0,lacunas:0};
  if(isGroundLidar&&!cavaCondicionada){
    showLoad('Completando lacunas internas do MDT ground…');
    lacunasGround=await tinFechaLacunasInternasMDT(g);
  }
  // RECORTE PELO CONTORNO — remove os triângulos que a triangulação estende
  // sobre as concavidades (fecho convexo). Feito na grade, não na malha.
  let nCort=0, nomeClip=null, LcTIN=LcPlanejado, aneisTIN=aneisPlanejados;
  if(recortePorTerreno){
    showLoad('Recortando a Cava Final pela superfície do MDT…');
    const corte=await tinRecortaCavaNoTerreno(g,cavaFinalPorTerreno.d);
    nCort=corte.removidas;
    nomeClip=`${cavaFinalPorTerreno.name} · encontro projeto × terreno`;
    LcTIN=null;aneisTIN=null;
    if(corte.validas<3){
      hideLoad();toast('A Cava Final não possui área válida abaixo do MDT — confira o CRS e as cotas.');return;
    }
  }else if(aneisTIN&&aneisTIN.length){
    /* Quando o usuário escolhe uma máscara, o mesmo recorte é aplicado à
       grade e à malha exata. Sem máscara, a superfície permanece livre. 
       A versão anterior supunha que tinCavaToGrid já nascia limitada e,
       por isso, ignorava silenciosamente a camada escolhida no seletor.
       Na realidade a interpolação ainda ocupava o retângulo/fecho convexo,
       originando exatamente as grandes faces externas vistas no 3D. */
    nCort=await tinAplicaRecorte(g, aneisTIN);
    nomeClip=LcTIN?LcTIN.name:null;
  }else{
    nCort=0;nomeClip=null;LcTIN=null;aneisTIN=null;
  }
  /* O GeoTIFF abaixo permanece uma grade. A cena 3D recebe, em paralelo, a
     malha de faces originais — nunca uma reamostragem bilinear da grade. */
  let malhaTIN=null;
  if(!cavaCondicionada&&D&&!recortePorTerreno){
    showLoad(aneisTIN?'Cortando triângulos exatamente no limite…':'Preservando faces originais do TIN…');
    await new Promise(rs=>setTimeout(rs,10));
    malhaTIN=await tinMalhaExata(X,Y,Zv,D.triangles,edgeGuard.value,aneisTIN);
  }
  const t2=performance.now();

  const r={id:rid++, name:isGroundLidar
      ?L.name+' — MDT do terreno (ground · '+g.cs+' m)'+(nomeClip?' recortado':'')
      :L.name+(cavaCondicionada?' — MDT por bancos (':' — Superfície Raster (')+g.cs+' m)'+(nomeClip?' recortado':''),
    d:{nc:g.nc,nr:g.nr,cs:g.cs,xll:g.xll,yll:g.yll,z:g.z},
    style:{mode:'hipso_hs', opacity:0.8}, visible:true, overlay:null,
    _tinSourceId:L.id,_tinAutoClip:false,_tinMethod:isGroundLidar?'ground-interno-interpolado':(cavaCondicionada?'cava-breaklines':(recortePorTerreno?'delaunay-terrain-clip':'delaunay')),
    _lidarGroundMDT:isGroundLidar};
  if(malhaTIN&&!isGroundLidar)r._tinMesh=malhaTIN; // somente memória p/ o 3D exato
  if(tinFormato==='tin'&&!cavaCondicionada&&!recortePorTerreno&&D){
    tinAnexaExato(r.d,X,Y,Zv,D.triangles,edgeGuard?edgeGuard.value:0,aneisTIN);
    r.tinPuro=true;
    r.name=L.name+' — Superfície TIN'+(nomeClip?' (recortada)':'');
  }
  if(aneisTIN&&aneisTIN.length)r._exactClipRings=aneisTIN;
  /* Superfície de obra: o visualizador usa o limite vetorial analítico, não
     a escadinha das células NoData, e ainda permite drape da ortofoto. */
  /* No automático, o 3D deve usar exatamente os anéis já calculados, e não
     reinterpretar todas as cristas/pés da camada fonte como máscaras. */
  const lim3dTIN=LcTIN?LcTIN.id:'';
  if(lim3dTIN)
    r._v3={papel:'projeto',cor:(L.sym&&L.sym.color)||L.color||'#4f8b3a',limId:lim3dTIN};
  else if(recortePorTerreno)
    r._v3={papel:'projeto',cor:(L.sym&&L.sym.color)||L.color||'#4f8b3a',limId:''};
  tinDesligaAnteriores(L);S.rasters.push(r);
  placeProductAbove(r,L);
  renderRaster(r);
  projectAutoSaveRaster(r);
  // FEEDBACK IMPOSSÍVEL DE PERDER: zoom na grade nova + toast.
  // (Um MDT de cava tem centenas de metros num mapa de quilômetros —
  //  sem o zoom, a mancha nova passa despercebida e o botão é clicado de novo.)
  try{ if(r.overlay && r.overlay.getBounds) safeFit(r.overlay.getBounds()); }catch(e){}
  toast(`✅ ${r.tinPuro?'TIN triangulado':'Raster/MDT'} gerado: "${r.name}" `+
    `(${r.tinPuro?(r._tinMesh&&r._tinMesh.triangles||0).toLocaleString('pt-BR')+' faces':g.nc+'×'+g.nr+' células'}) — zoom aplicado`);

  let nCells=0, zmn=Infinity, zmx=-Infinity;
  for(let k=0;k<g.z.length;k++){ const v=g.z[k];
    if(!isNaN(v)){ nCells++; if(v<zmn)zmn=v; if(v>zmx)zmx=v; } }

  let out=`Produto: <b>${r.tinPuro?'Malha TIN com faces triangulares':'Imagem Raster / MDT em grade regular'}</b>\n`+
          (nCort? `<b>Recortado por “${esc(nomeClip)}”</b>: ${nCort.toLocaleString('pt-BR')} célula(s) `+
            `removida(s) fora do contorno.<br>` : '')+
          (col.densifyStep
            ?`Pré-processamento: <b>linhas densificadas a ${col.densifyStep.toFixed(2).replace('.',',')} m${col.densifyAdaptive?' (passo adaptativo)':''}</b>`+
             ` · ${col.nOrig.toLocaleString('pt-BR')} vértices originais → `+
             `${col.nDensificado.toLocaleString('pt-BR')} amostras 3D\n`
            :'')+
          (limiteCondicionado.adicionados
            ?`Limite condicionado na origem: <b>${limiteCondicionado.adicionados.toLocaleString('pt-BR')} nós 3D</b> `+
             `inseridos em ${limiteCondicionado.aneis} anel(is); TIN e MDT já nascem no contorno.\n`
            :'')+
          (edgeGuard.disabled
            ?`Proteção de continuidade: filtro de aresta de <b>${maxEdge} m desativado</b> `+
             `(${(edgeGuard.total-edgeGuard.kept).toLocaleString('pt-BR')} de `+
             `${edgeGuard.total.toLocaleString('pt-BR')} triângulos seriam descartados)\n`
            :'')+
          `Vértices: <b>${X.length.toLocaleString('pt-BR')}</b>`+
          (nDup?` (${nDup.toLocaleString('pt-BR')} duplicados removidos)`:'')+
          (semZ?` · ${semZ} feições sem cota ignoradas`:'')+`\n`;
  out+=cavaCondicionada
    ?`Método: <b>breaklines condicionadas</b> — cada pé, crista, berma e borda de rampa é obrigatória\n`
    :`Triângulos: <b>${(D.triangles.length/3).toLocaleString('pt-BR')}</b>`+
       (g.skipped?` · ${g.skipped.toLocaleString('pt-BR')} descartados (aresta > ${edgeGuard.value} m)`:'')+`\n`;
  if(malhaTIN)out+=`Malha 3D: <b>${malhaTIN.triangles.toLocaleString('pt-BR')} faces planas originais</b>`+
    (malhaTIN.exactClip?` · ${malhaTIN.boundaryTriangles.toLocaleString('pt-BR')} faces seccionadas exatamente no limite`:'')+`\n`;
  out+=`Grade: <b>${g.nc}×${g.nr}</b> · célula ${g.cs} m · ${nCells.toLocaleString('pt-BR')} células `+
       `(${(100*nCells/(g.nc*g.nr)).toFixed(0)}% do retângulo)\n`;
  if(isGroundLidar)out+=`MDT ground: <b>${lacunasGround.lacunas.toLocaleString('pt-BR')}</b> lacuna(s) interna(s) `+
       `interpolada(s) · <b>${lacunasGround.celulas.toLocaleString('pt-BR')}</b> célula(s) preenchida(s). `+
       `Áreas sem dado ligadas à borda foram preservadas como NoData.\n`;
  out+=`Cotas: <b>${zmn.toFixed(2)}</b> – <b>${zmx.toFixed(2)}</b> m\n`;
  out+=`Tempo: triangulação ${(t1-t0).toFixed(0)} ms · interpolação ${(t2-t1).toFixed(0)} ms\n`;

  if(document.getElementById('tinContour').checked){
    const iv=+document.getElementById('tinCInt').value||5;
    showLoad('Gerando curvas de nível…');
    await new Promise(rs=>setTimeout(rs,10));
    const lines=contourGrid(r.d, iv);
    if(lines.length){
      addLayer({sourceLayer:r,name:L.name+' — curvas '+iv+' m', gtype:'line', crs:S.workCRS,
        features:lines.map(ln=>({geom:ln.pts, multi:false, props:{COTA:+ln.z.toFixed(2)}})),
        fields:[{name:'COTA',type:'N',length:12,decimal:2}], color:'#37c0aa'});
      out+=`Curvas geradas: <b>${lines.length}</b> polilinhas a cada ${iv} m\n`;
    } else out+=`Curvas: nenhuma gerada (verifique o intervalo)\n`;
  }

  document.getElementById('tinOut').innerHTML=out;
  refreshUI(); hideLoad();
  const b=r.overlay&&r.overlay.getBounds?r.overlay.getBounds():null;
  if(b) safeFit(b);
  toast('MDT gerado: '+g.nc+'×'+g.nr+' células');
}
/* ==================== PILHA DE ESTOQUE ====================================
   Integra o volume entre duas superfícies somente dentro do polígono da saia.
   O limite pode conter várias feições/ilhas; a paridade dos anéis preserva
   eventuais vazios internos.                                                */
function refreshPilhaPanel(){
  const sl=document.getElementById('pilhaLimite'), st=document.getElementById('pilhaTopo'),
        sb=document.getElementById('pilhaBase');
  if(!sl||!st||!sb) return;
  const lv=sl.value, tv=st.value, bv=sb.value;
  const polys=S.layers.filter(l=>l.gtype==='polygon');
  sl.innerHTML=polys.length
    ?polys.map(l=>`<option value="${l.id}">${esc(l.name)} · ${l.features.length} feição(ões)</option>`).join('')
    :'<option value="">— desenhe ou importe uma saia —</option>';
  const ropts=(S.rasters||[]).map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('');
  st.innerHTML=ropts||'<option value="">— nenhuma superfície —</option>';
  sb.innerHTML=ropts||'<option value="">— nenhuma superfície —</option>';
  if(lv&&[...sl.options].some(o=>o.value===lv)) sl.value=lv;
  else {
    const a=polys.find(l=>String(l.id)===String(S.activeId));
    if(a) sl.value=String(a.id);
  }
  if(tv&&[...st.options].some(o=>o.value===tv)) st.value=tv;
  if(bv&&[...sb.options].some(o=>o.value===bv)) sb.value=bv;
  else if(S.rasters.length>1) sb.selectedIndex=1;
}
function pilhaDesenharSaia(){
  const mapa=document.getElementById('map');
  if(!mapa || mapa.style.display==='none') switchView('geo');
  let L=addLayer({name:'Saia da pilha',gtype:'polygon',crs:S.workCRS,features:[],
    fields:[{name:'NOME',type:'C',length:60,decimal:0},{name:'TIPO',type:'C',length:24,decimal:0}],
    color:'#d67a16'});
  L.fill=.18; L.weight=3;
  if(L.sym){ L.sym.fill=.18; L.sym.weight=3; L.sym.color='#d67a16'; L.sym.stroke='#d67a16'; }
  refreshUI(); refreshPilhaPanel();
  const sl=document.getElementById('pilhaLimite'); if(sl) sl.value=String(L.id);
  setTool('poly');
  toast('Desenhe a saia da pilha e finalize com duplo clique. ESC encerra o comando.');
}
function pilhaRings(L){
  const out=[];
  if(!L) return out;
  for(const f of L.features||[]){
    if(!f.geom) continue;
    const rs=(f.multi&&Array.isArray(f.geom[0]&&f.geom[0][0]))?f.geom:[f.geom];
    for(const r of rs){
      if(!r||r.length<3) continue;
      const q=r.map(p=>reproj(L.crs,S.workCRS,p[0],p[1]));
      const a=q[0],b=q[q.length-1];
      if(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-8) q.push(a.slice());
      out.push(q);
    }
  }
  return out;
}
async function pilhaCalcularVolume(){
  const L=S.layers.find(l=>String(l.id)===(document.getElementById('pilhaLimite')||{}).value);
  const topo=S.rasters.find(r=>String(r.id)===(document.getElementById('pilhaTopo')||{}).value);
  const base=S.rasters.find(r=>String(r.id)===(document.getElementById('pilhaBase')||{}).value);
  if(!L){ toast('Escolha ou desenhe o polígono da saia'); return; }
  if(!topo||!base){ toast('Escolha a superfície da pilha e o terreno de base'); return; }
  if(topo===base){ toast('Topo e base precisam ser superfícies diferentes'); return; }
  const rings=pilhaRings(L);
  if(!rings.length){ toast('A camada da saia ainda não possui polígono fechado'); return; }
  let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;
  rings.forEach(r=>r.forEach(p=>{xmin=Math.min(xmin,p[0]);xmax=Math.max(xmax,p[0]);
    ymin=Math.min(ymin,p[1]);ymax=Math.max(ymax,p[1]);}));
  let passo=Math.max(.1,+document.getElementById('pilhaPasso').value||1);
  const nEst=Math.ceil((xmax-xmin)/passo)*Math.ceil((ymax-ymin)/passo);
  if(nEst>5000000){
    const sug=Math.ceil(Math.sqrt((xmax-xmin)*(ymax-ymin)/5000000)*10)/10;
    toast(`Cálculo muito fino para esta saia — use passo ≥ ${sug} m`); return;
  }
  const indices=rings.map(indiceAnel);
  const dentro=(x,y)=>{ let n=0; for(let i=0;i<rings.length;i++) if(pointInRing(x,y,rings[i],indices[i])) n++; return n%2===1; };
  showLoad('Calculando volume da pilha…');
  await new Promise(r=>setTimeout(r,15));
  let vol=0,area=0,n=0,neg=0,zmin=Infinity,zmax=-Infinity;
  const nx=Math.ceil((xmax-xmin)/passo), ny=Math.ceil((ymax-ymin)/passo);
  for(let j=0;j<ny;j++){
    if((j&127)===0){ showLoad(`Calculando pilha — ${(100*j/ny).toFixed(0)}%`); await respira(); }
    const y=ymin+(j+.5)*passo;
    for(let i=0;i<nx;i++){
      const x=xmin+(i+.5)*passo; if(!dentro(x,y)) continue;
      const zt=sampleZbil(topo.d,x,y), zb=sampleZbil(base.d,x,y);
      if(!Number.isFinite(zt)||!Number.isFinite(zb)) continue;
      const dz=zt-zb; n++; area+=passo*passo;
      if(dz>0){ vol+=dz*passo*passo; if(dz<zmin)zmin=dz;if(dz>zmax)zmax=dz; }
      else neg++;
    }
  }
  hideLoad();
  if(!n){ toast('As superfícies não possuem dados coincidentes dentro da saia'); return; }
  const dens=Math.max(0,+document.getElementById('pilhaDens').value||0);
  S.pilhaVolume={limiteId:L.id,topoId:topo.id,baseId:base.id,passo,area,volume:vol,densidade:dens};
  document.getElementById('pilhaOut').innerHTML=
    `Saia: <b>${esc(L.name)}</b><br>Área calculada: <b>${fmtArea(area)}</b><br>`+
    `Volume positivo da pilha: <b>${fmt(vol)} m³</b>`+
    (dens?`<br>Massa estimada: <b>${fmt(vol*dens)} t</b> · densidade ${fmt(dens)} t/m³`:'')+
    `<br>Espessura: <b>${isFinite(zmin)?fmt(zmin):'0'} – ${isFinite(zmax)?fmt(zmax):'0'} m</b>`+
    (neg?`<br><span style="color:var(--ink-dim)">${neg.toLocaleString('pt-BR')} célula(s) abaixo da base foram desconsideradas.</span>`:'');
  toast(`✅ Volume da pilha: ${fmt(vol)} m³`);
}
/* ==================== ESTAQUEAMENTO DE LINHA ===============================
   Percorre uma polilinha marcando estacas a cada intervalo, com progressiva,
   cota e declividade entre estacas. Serve para a rampa de rolamento, acessos
   e canaletas: gera a camada de pontos e, se pedido, o perfil do traçado.  */
function refreshEstPanel(){
  const sl=document.getElementById('estLinha'); if(!sl) return;
  const linhas=S.layers.filter(l=>l.gtype==='line');
  const v=sl.value;
  sl.innerHTML = linhas.length
    ? linhas.map(l=>{
        const n=l.features.reduce((s,f)=>s+((f.multi&&Array.isArray(f.geom[0][0]))?f.geom.length:1),0);
        const z=l.features.some(f=>f.zg)?' · 3D':'';
        return `<option value="${l.id}">${esc(l.name)} (${n}${z})</option>`; }).join('')
    : '<option value="">— nenhuma linha carregada —</option>';
  if(v && [...sl.options].some(o=>o.value===v)) sl.value=v;
  else {
    const ativa=linhas.find(l=>String(l.id)===String(S.activeId));
    if(ativa) sl.value=String(ativa.id);
  }
  const ss=document.getElementById('estSurf');
  if(ss){ const w=ss.value;
    ss.innerHTML=S.rasters.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')
      || '<option value="">— nenhuma superfície carregada —</option>';
    if(w && [...ss.options].some(o=>o.value===w)) ss.value=w; }
  estZinfo();
}
/* Diz de onde a cota virá — a origem mais comum de "declividade vazia" é a
   linha não ter Z e nenhuma superfície estar escolhida.                     */
function estZinfo(){
  const el=document.getElementById('estZinfo'); if(!el) return;
  const L=S.layers.find(l=>String(l.id)===(document.getElementById('estLinha')||{}).value);
  const modo=(document.getElementById('estZ')||{}).value||'auto';
  const temZ=!!(L && L.features.some(f=>f.zg));
  const rs=S.rasters.find(r=>String(r.id)===(document.getElementById('estSurf')||{}).value);
  let msg, cor='var(--ink-dim)';
  if(!L) msg='Escolha a linha.';
  else if(modo==='geom'){ msg = temZ? 'Cotas virão da geometria da linha (3D).'
    : '⚠ Esta linha NÃO tem Z — as cotas e a declividade sairão vazias. Use “Automático” ou “Superfície”.';
    if(!temZ) cor='#e0a'; }
  else if(modo==='surf'){ msg = rs? `Cotas amostradas em “${esc(rs.name)}”.`
    : '⚠ Nenhuma superfície escolhida — as cotas sairão vazias.'; if(!rs) cor='#e0a'; }
  else { // automático
    if(temZ) msg='Cotas da própria linha (3D); onde faltar, da superfície.';
    else if(rs) msg=`Linha sem Z — cotas serão amostradas em “${esc(rs.name)}”.`;
    else { msg='⚠ Linha sem Z e nenhuma superfície: as cotas sairão vazias.'; cor='#e0a'; }
  }
  el.innerHTML=`<span style="color:${cor}">${msg}</span>`;
}

/* Extrai a polilinha mais longa da camada (a rampa costuma vir em vários
   trechos; o maior é o traçado principal).                                 */
function estTracado(L){
  if(!L) return null;
  const partes=[];
  /* Camadas de Rampa por bancada reúnem cristas, pés e o eixo. Quando o
     eixo progressivo está presente, ele é a única geometria elegível para o
     estaqueamento; escolher a linha mais longa de toda a camada marcava por
     engano uma crista ou um pé. */
  const fs=(L.features||[]).filter(f=>f&&f.geom),
    eixo=fs.filter(f=>String(f.props&&f.props.CLASSE||'').toLowerCase()==='rb31-eixo'||
      /linha de centro progressiva|rampa\s*[—-]\s*eixo/i.test(String(f.props&&f.props.TIPO||''))),
    fonte=eixo.length?eixo:fs;
  fonte.forEach(f=>{ if(!f.geom) return;
    const nested=(f.multi&&Array.isArray(f.geom[0][0]));
    const rs=nested?f.geom:[f.geom];
    const zs=f.zg? (nested?f.zg:[f.zg]) : null;
    rs.forEach((r,ri)=>{ if(r.length<2) return;
      const pts=r.map(pt=>reproj(L.crs,S.workCRS,pt[0],pt[1]));
      const zr=zs? (Array.isArray(zs[ri])? zs[ri] : zs) : null;
      let comp=0; for(let i=1;i<pts.length;i++) comp+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);
      partes.push({pts, z:zr, comp});
    });
  });
  if(!partes.length) return null;
  partes.sort((a,b)=>b.comp-a.comp);
  return partes[0];
}

/* Interpola um ponto a uma distância d ao longo da polilinha */
function estPontoEm(tr, d){
  const p=tr.pts; let acum=0;
  for(let i=1;i<p.length;i++){
    const seg=Math.hypot(p[i][0]-p[i-1][0], p[i][1]-p[i-1][1]);
    if(acum+seg >= d-1e-9){
      const t=seg>0? (d-acum)/seg : 0;
      const X=p[i-1][0]+(p[i][0]-p[i-1][0])*t;
      const Y=p[i-1][1]+(p[i][1]-p[i-1][1])*t;
      let Z=NaN;
      if(tr.z && tr.z.length===p.length && isFinite(tr.z[i-1]) && isFinite(tr.z[i]))
        Z=tr.z[i-1]+(tr.z[i]-tr.z[i-1])*t;
      return {X,Y,Z};
    }
    acum+=seg;
  }
  const u=p[p.length-1];
  return {X:u[0], Y:u[1], Z:(tr.z? tr.z[tr.z.length-1] : NaN)};
}

function estRotulo(fmt, d, i){
  if(fmt==='est'){ const e=Math.round(d/20); const r=d-e*20;
    return Math.abs(r)<0.05? String(e) : `${Math.floor(d/20)}+${(d%20).toFixed(1)}`; }
  if(fmt==='km'){ const km=Math.floor(d/1000); const m=d-km*1000;
    return `${km}+${m.toFixed(0).padStart(3,'0')}`; }
  return d.toFixed(0)+' m';
}

function estGerar(){
  const out=document.getElementById('estStakeOut');
  const L=S.layers.find(l=>String(l.id)===document.getElementById('estLinha').value);
  if(!L){ out.innerHTML='<span style="color:#e0a">Escolha a linha.</span>';
    toast('Progressiva: escolha uma camada de linha ou use o botão 🖱'); return; }
  const tr=estTracado(L);
  if(!tr){ out.innerHTML='<span style="color:#e0a">A camada não tem traçado válido.</span>';
    toast('A linha escolhida não possui ao menos dois vértices'); return; }
  let inter=parseFloat(String(document.getElementById('estInt').value).replace(',','.'));
  if(!isFinite(inter)||inter<=0) inter=20;
  let progIni=parseFloat(String((document.getElementById('estIni')||{}).value||'0').replace(',','.'));
  if(!isFinite(progIni)||progIni<0)progIni=0;
  const fonteZ=document.getElementById('estZ').value||'auto';
  const rSurf=S.rasters.find(r=>String(r.id)===(document.getElementById('estSurf')||{}).value);
  const temZ=!!(tr.z && tr.z.length===tr.pts.length && tr.z.some(v=>isFinite(v)));
  if(fonteZ==='surf' && !rSurf){ out.innerHTML='<span style="color:#e0a">Escolha a superfície de referência.</span>'; return; }
  if(fonteZ==='geom' && !temZ){ out.innerHTML='<span style="color:#e0a">Esta linha não tem Z. Use “Automático” ou “Superfície”.</span>'; return; }
  /* Sem Z ainda é possível estaquear planimetricamente. A versão anterior
     abortava silenciosamente e dava a impressão de que o botão não funcionava. */
  const semFonteZ=(fonteZ==='auto' && !temZ && !rSurf);
  const fmt=document.getElementById('estFmt').value;
  const comDecl=(document.getElementById('estDecl')||{}).checked;

  const n=Math.floor(tr.comp/inter);
  if(n>5000){ out.innerHTML=`<span style="color:#e0a">${n} estacas — aumente o intervalo.</span>`; return; }

  const est=[];
  for(let k=0;k<=n;k++){
    const d=k*inter;
    const q=estPontoEm(tr,d);
    let Z=q.Z;
    if(fonteZ==='surf' || !isFinite(Z)){ const zs=rSurf? sampleZbil(rSurf.d,q.X,q.Y) : NaN;
      if(isFinite(zs)) Z=zs; }
    est.push({d, prog:d+progIni, X:q.X, Y:q.Y, Z, rot:estRotulo(fmt,d+progIni,k)});
  }
  // fecha na ponta se sobrar trecho
  if(tr.comp - n*inter > inter*0.1){
    const q=estPontoEm(tr,tr.comp);
    let Z=q.Z; if(fonteZ==='surf'||!isFinite(Z)){ const zs=rSurf? sampleZbil(rSurf.d,q.X,q.Y):NaN; if(isFinite(zs)) Z=zs; }
    est.push({d:tr.comp, prog:tr.comp+progIni, X:q.X, Y:q.Y, Z,
      rot:estRotulo(fmt,tr.comp+progIni,n+1)});
  }
  // declividade entre estacas
  est.forEach((e,i)=>{
    if(!comDecl || i===0){ e.decl=null; e.declG=null; return; }
    const a=est[i-1];
    const dh=e.d-a.d, dz=(e.Z-a.Z);
    if(!isFinite(dz)||!(dh>0)){ e.decl=null; e.declG=null; return; }
    e.decl = 100*dz/dh;                      // percentagem = tangente × 100
    e.declG = Math.atan(dz/dh)*180/Math.PI;  // graus = arco-tangente (não é proporcional a %)
  });

  const feats=est.map((e,i)=>{
    const props={ESTACA:e.rot, PROG_M:+e.prog.toFixed(2),
      COTA:isFinite(e.Z)? +e.Z.toFixed(3):null,
      E:+e.X.toFixed(3), N:+e.Y.toFixed(3)};
    if(comDecl){ props.DECL_PC = (e.decl==null)? null : +e.decl.toFixed(2);
      props.DECL_GR = (e.declG==null)? null : +e.declG.toFixed(2); }
    const f={geom:[[e.X,e.Y]], multi:false, props};
    if(isFinite(e.Z)) f.zg=[+e.Z.toFixed(3)];
    return f;
  });
  const fields=[{name:'ESTACA',type:'C',length:12},{name:'PROG_M',type:'N',length:12,decimal:2},
    {name:'COTA',type:'N',length:12,decimal:3},{name:'E',type:'N',length:14,decimal:3},
    {name:'N',type:'N',length:14,decimal:3}];
  if(comDecl){ fields.push({name:'DECL_PC',type:'N',length:10,decimal:2});
    fields.push({name:'DECL_GR',type:'N',length:10,decimal:2}); }
  const rotular=((document.getElementById('estRot')||{}).value||'sim')!=='nao',
    nova=addLayer({sourceLayer:L,name:`Progressiva ${inter} m — ${L.name}`.slice(0,60), gtype:'point',
    crs:S.workCRS, features:feats, fields, color:'#37c0aa',
    labelField:rotular?'ESTACA':null,
    lbl:rotular?{size:8, halo:'#ffffff', haloW:1.4, place:'offset', dx:8, dy:-8}:null});
  if(nova){
    S.activeId=nova.id; S.selRaster=null;
    try{ fitLayer(nova); }catch(e){}
  }
  refreshUI();
  S._est={tr, est, inter, nome:L.name, id:L.id,
    rasterId:rSurf?rSurf.id:null};

  const zs=est.map(e=>e.Z).filter(v=>isFinite(v));
  const ds=est.map(e=>e.decl).filter(v=>v!=null);
  const f2=v=>v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  out.innerHTML=`<b>${est.length}</b> estaca(s) a cada <b>${inter} m</b>`+
    (progIni>0?`<br>Progressiva inicial: <b>${f2(progIni)} m</b>`:'')+
    `<br>Extensão do traçado: <b>${f2(tr.comp)} m</b>`+
    (zs.length? `<br>Cotas: ${Math.min(...zs).toFixed(2)} a ${Math.max(...zs).toFixed(2)} m `+
      `<span style="color:var(--ink-dim)">(desnível ${(Math.max(...zs)-Math.min(...zs)).toFixed(2)} m)</span>`:'')+
    (ds.length? `<br>Declividade média: <b>${f2(ds.reduce((a,b)=>a+Math.abs(b),0)/ds.length)}%</b> `+
      `<span style="color:var(--ink-dim)">(${f2(Math.atan(ds.reduce((a,b)=>a+Math.abs(b),0)/ds.length/100)*180/Math.PI)}°)</span>`+
      `<br>Declividade máxima: <b>${f2(Math.max(...ds.map(Math.abs)))}%</b> `+
      `<span style="color:var(--ink-dim)">(${f2(Math.atan(Math.max(...ds.map(Math.abs))/100)*180/Math.PI)}°)</span>`:
      '<br><span style="color:#e0a">Sem declividade — as estacas ficaram sem cota.</span>')+
    (zs.length&&tr.comp>0? `<br>Inclinação média do traçado: <b>${f2(100*(Math.max(...zs)-Math.min(...zs))/tr.comp)}%</b>`:'')+
    (semFonteZ?'<br><span style="color:var(--amber)">Estacas geradas em 2D. Escolha um MDT para acrescentar cota e declividade.</span>':'');
  toast(`✅ ${est.length} estacas geradas em nova camada · ${tr.comp.toFixed(0)} m`);
}

/* manda o traçado para a aba Perfis */
function estPerfil(){
  const linhaId=(document.getElementById('estLinha')||{}).value;
  let E=S._est;
  /* O botão de perfil é uma ação completa: se o eixo configurado ainda não
     tiver sido estaqueado (ou se o usuário trocou de linha), gera primeiro a
     progressiva atual. Assim ele não parece inerte nem reutiliza outro eixo. */
  if(!E||!E.tr||String(E.id)!==String(linhaId)){
    estGerar(); E=S._est;
  }
  if(!E||!E.tr||String(E.id)!==String(linhaId)){
    toast('Não foi possível preparar o eixo para o perfil'); return;
  }
  S.prof=S.prof||{};
  S.prof.axisSelection=null;
  S.prof.line=E.tr.pts.map(p=>[p[0],p[1]]);
  /* runProfile recebe o traçado interativo em [lat,lon]. Alimentar apenas
     S.prof.line deixava o botão sem eixo quando nenhuma feição estava
     selecionada no mapa. */
  S.prof.buf=S.prof.line.map(p=>{
    const w=toWGS(S.workCRS,p[0],p[1]); return [w[1],w[0]];
  });
  const nm=document.getElementById('prName');
  if(nm) nm.value=(E.nome||'Progressiva').slice(0,30);
  RIB_CAT_ATUAL='topografia';
  fechaEstModal();
  ribbonClose();
  switchView('perfis');
  setTimeout(()=>{
    try{
      refreshProfPanel();
      const r=(S.rasters||[]).find(x=>String(x.id)===String(E.rasterId))||
        (S.rasters||[]).find(x=>String(x.id)===String(S.topoRasterId))||S.rasters[0];
      if(r){ const sel=document.getElementById('prRasterSel'); if(sel) sel.value=String(r.id); }
      const vector=S.layers.find(L=>String(L.id)===String(E.id)&&profLinhaTemZ(L));
      const fromGeometry=document.getElementById('estZ')?.value!=='surf'&&E.tr.z?.some(Number.isFinite);
      if(vector&&(!r||fromGeometry)){
        profUpdateSourceMode('vector');S.prof.sourceLineIds=[];
        document.getElementById('prVectorSel').value=String(vector.id);profRenderVectorSources();
      }else profUpdateSourceMode('raster');
      Promise.resolve(runProfile()).catch(e=>{
        console.error('perfil da progressiva',e);
        toast('Traçado carregado — escolha o MDT e toque em Gerar perfil');
      });
    }catch(e){
      console.error('perfil da progressiva',e);
      toast('Traçado carregado — escolha o MDT e toque em Gerar perfil');
    }
  },160);
  toast('Progressiva enviada para o Perfil Topográfico');
}

/* Escolha da linha por toque no mapa: procura a linha mais próxima do ponto
   clicado (distância ponto-segmento) e seleciona a camada correspondente.  */
function estPickToggle(){
  S._estPick=!S._estPick;
  const b=document.getElementById('btnEstPick');
  if(S._estPick){
    S.tool='estpick';
    if(b){ b.classList.add('on'); b.textContent='✕'; b.title='Cancelar seleção no mapa'; }
    try{ map.getContainer().style.cursor='crosshair'; }catch(e){}
    toast('Toque na linha desejada no mapa');
  } else {
    if(S.tool==='estpick') S.tool=null;
    if(b){ b.classList.remove('on'); b.textContent='🖱'; b.title='Escolher tocando a linha no mapa'; }
    try{ map.getContainer().style.cursor=''; }catch(e){}
  }
}
function estPickClick(latlng){
  const c=fromWGS(S.workCRS, latlng.lng, latlng.lat);
  const px=c[0], py=c[1];
  let melhor=null, dmin=Infinity;
  const distSeg=(x,y,x1,y1,x2,y2)=>{
    const dx=x2-x1, dy=y2-y1, L2=dx*dx+dy*dy;
    let t=L2>0? ((x-x1)*dx+(y-y1)*dy)/L2 : 0; t=Math.max(0,Math.min(1,t));
    return Math.hypot(x-(x1+t*dx), y-(y1+t*dy));
  };
  S.layers.forEach(L=>{
    if(L.gtype!=='line' || L.visible===false) return;
    L.features.forEach(f=>{ if(!f.geom) return;
      const rs=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
      rs.forEach(r=>{
        for(let i=1;i<r.length;i++){
          const a=reproj(L.crs,S.workCRS,r[i-1][0],r[i-1][1]);
          const b=reproj(L.crs,S.workCRS,r[i][0],r[i][1]);
          const d=distSeg(px,py,a[0],a[1],b[0],b[1]);
          if(d<dmin){ dmin=d; melhor=L; }
        }
      });
    });
  });
  if(!melhor){ toast('Nenhuma linha visível por perto'); return; }
  // tolerância proporcional ao zoom (~30 px na tela)
  const tol=Math.max(5, 30*(map.getZoom? 156543.03392*Math.cos(latlng.lat*Math.PI/180)/Math.pow(2,map.getZoom()+8) : 1));
  if(dmin>tol){ toast(`Linha mais próxima a ${dmin.toFixed(1)} m — toque mais perto`); return; }
  const sel=document.getElementById('estLinha');
  if(sel){ refreshEstPanel(); sel.value=String(melhor.id); estZinfo(); }
  toast(`Linha escolhida: ${melhor.name}`);
  if(S._estPick) estPickToggle();
}

/* Janela própria da linha progressiva. O formulário continua sendo único:
   ele é apenas transferido temporariamente do painel de Geoprocessamento para
   o modal, evitando estados e valores duplicados entre dois conjuntos de
   controles. Ao fechar, a seção volta ao ponto original do DOM. */
function abreEstModal(opt={}){
  const bg=document.getElementById('estModal'),body=document.getElementById('estModalBody'),
    sec=document.getElementById('secEstProgressiva');
  if(!bg||!body||!sec){toast('Janela de progressiva indisponível');return;}
  if(!sec._estHome){
    sec._estHome={parent:sec.parentNode,next:sec.nextSibling};
  }
  if(sec.parentNode!==body)body.appendChild(sec);
  sec.style.display='block';sec.classList.remove('collapsed');
  bg.classList.add('on');
  try{refreshEstPanel();}catch(e){}
  const layerId=opt.layerId;
  if(layerId!=null){
    const sel=document.getElementById('estLinha');
    if(sel&&[...sel.options].some(o=>String(o.value)===String(layerId))){
      sel.value=String(layerId);estZinfo();
    }
  }
  if(opt.rasterId!=null){
    const sel=document.getElementById('estSurf');
    if(sel&&[...sel.options].some(o=>String(o.value)===String(opt.rasterId))){
      sel.value=String(opt.rasterId);estZinfo();
    }
  }
  if(opt.formato){const fmt=document.getElementById('estFmt');if(fmt)fmt.value=opt.formato;}
  const intervalo=document.getElementById('estInt');if(intervalo)setTimeout(()=>intervalo.focus(),0);
}
function fechaEstModal(){
  const bg=document.getElementById('estModal'),sec=document.getElementById('secEstProgressiva');
  if(S._estPick)estPickToggle();
  if(bg)bg.classList.remove('on');
  if(sec&&sec._estHome&&sec.parentNode!==sec._estHome.parent){
    const h=sec._estHome;
    if(h.next&&h.next.parentNode===h.parent)h.parent.insertBefore(sec,h.next);
    else h.parent.appendChild(sec);
    sec.style.display='';
  }
}

function bindEstPanel(){
  const on=(id,ev,fn)=>{ const e=document.getElementById(id); if(e) e[ev]=fn; };
  on('btnEst','onclick',estGerar);
  on('btnEstPerf','onclick',estPerfil);
  on('btnEstPick','onclick',estPickToggle);
  on('estLinha','onchange',estZinfo);
  on('estSurf','onchange',estZinfo);
  on('estZ','onchange',estZinfo);
  on('estModalClose','onclick',fechaEstModal);
}

/* ==================== PONTOS COTADOS ========================================
   Coleta interativa de cotas: escolhe-se a superfície, ativa-se a coleta e
   cada toque no mapa registra um ponto com o valor lido do MDT (bilinear).
   Ao final, gera uma camada de pontos 3D com ID, COTA, E e N.              */
S.cot = S.cot || {pts:[], ativo:false, camadaPrev:null};

function refreshCotPanel(){
  const sel=document.getElementById('cotSurf'); if(!sel) return;
  const v=sel.value;
  sel.innerHTML = S.rasters.length
    ? S.rasters.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')
    : '<option value="">— nenhuma superfície carregada —</option>';
  if(v && [...sel.options].some(o=>o.value===v)) sel.value=v;
  cotOut();
}

function cotOut(){
  const el=document.getElementById('cotOut'); if(!el) return;
  const n=S.cot.pts.length;
  if(!n){ el.innerHTML = S.cot.ativo
      ? '<b style="color:var(--amber)">Coleta ativa</b> — toque no mapa para marcar os pontos.'
      : 'Nenhum ponto coletado.'; return; }
  const zs=S.cot.pts.map(p=>p.z).filter(z=>!isNaN(z));
  const semZ=n-zs.length;
  el.innerHTML=`<b>${n}</b> ponto(s) coletado(s)`+
    (zs.length? `<br>Cotas de <b>${Math.min(...zs).toFixed(2)}</b> a <b>${Math.max(...zs).toFixed(2)}</b> m`:'')+
    (semZ? `<br><span style="color:#e0a">${semZ} fora do MDT (sem cota)</span>`:'')+
    (S.cot.ativo? '<br><span style="color:var(--amber)">Coleta ativa</span>':'');
}

/* camada de pré-visualização no mapa */
function cotRedraw(){
  if(!S.cot.camadaPrev){ S.cot.camadaPrev=L2.layerGroup().addTo(map); }
  S.cot.camadaPrev.clearLayers();
  const rotular=(document.getElementById('cotRot')||{}).checked;
  const dec=+((document.getElementById('cotDec')||{}).value ?? 2);
  S.cot.pts.forEach((p,i)=>{
    const cor=isNaN(p.z)? '#e05252' : '#f5a524';
    L2.circleMarker([p.lat,p.lng],{radius:5,color:'#fff',weight:1.5,
      fillColor:cor,fillOpacity:1}).addTo(S.cot.camadaPrev);
    if(rotular){
      const txt=isNaN(p.z)? '—' : p.z.toFixed(dec);
      L2.marker([p.lat,p.lng],{interactive:false, icon:L2.divIcon({className:'',
        html:`<div style="transform:translate(9px,-9px);white-space:nowrap;font:600 11px/1.1 var(--mono,monospace);
              color:#fff;text-shadow:0 0 3px #000,0 0 3px #000,0 0 3px #000">${txt}</div>`,
        iconSize:[0,0]})}).addTo(S.cot.camadaPrev);
    }
  });
}

/* clique no mapa em modo "cotado" */
function cotClick(latlng){
  const r=S.rasters.find(rr=>String(rr.id)===document.getElementById('cotSurf').value);
  if(!r){ toast('Selecione a superfície de referência'); return; }
  const c=fromWGS(S.workCRS, latlng.lng, latlng.lat);
  const z=sampleZbil(r.d, c[0], c[1]);
  S.cot.pts.push({lat:latlng.lat, lng:latlng.lng, E:c[0], N:c[1], z, surf:r.name});
  cotRedraw(); cotOut();
  if(isNaN(z)) toast('Ponto fora da superfície — registrado sem cota');
}

function cotToggle(){
  S.cot.ativo=!S.cot.ativo;
  const b=document.getElementById('btnCotColeta');
  if(S.cot.ativo){
    if(!S.rasters.length){ S.cot.ativo=false; toast('Carregue ou gere uma superfície primeiro'); return; }
    S.tool='cotado';
    if(b){ b.textContent='⏹ Encerrar coleta'; b.classList.add('on'); }
    try{ map.getContainer().style.cursor='crosshair'; }catch(e){}
    toast('Coleta ativa — toque no mapa para cotar');
  } else {
    if(S.tool==='cotado') S.tool=null;
    if(b){ b.textContent='🎯 Ativar coleta'; b.classList.remove('on'); }
    try{ map.getContainer().style.cursor=''; }catch(e){}
  }
  cotOut();
}

function cotUndo(){
  if(!S.cot.pts.length){ toast('Nada a desfazer'); return; }
  S.cot.pts.pop(); cotRedraw(); cotOut();
}
function cotClear(){
  if(!S.cot.pts.length) return;
  if(!confirm(`Descartar os ${S.cot.pts.length} pontos coletados?`)) return;
  S.cot.pts=[]; cotRedraw(); cotOut();
}

/* gera a camada de pontos com as cotas */
function cotLayer(){
  if(!S.cot.pts.length){ toast('Colete ao menos um ponto'); return; }
  const dec=+((document.getElementById('cotDec')||{}).value ?? 2);
  const pref=((document.getElementById('cotPref')||{}).value||'P').trim()||'P';
  const source=S.rasters.find(r=>String(r.id)===document.getElementById('cotSurf').value);
  const surf=source?.name||'MDT';
  const feats=S.cot.pts.map((p,i)=>{
    // formato do app: geom = array de coordenadas, zg = array de cotas
    const f={ geom:[[p.E,p.N]], multi:false,
      props:{ ID:`${pref}${String(i+1).padStart(3,'0')}`,
              COTA: isNaN(p.z)? null : +p.z.toFixed(dec),
              E:+p.E.toFixed(3), N:+p.N.toFixed(3) } };
    if(!isNaN(p.z)) f.zg=[+p.z.toFixed(dec)];
    return f;
  });
  addLayer({sourceLayer:source,
    name:`Pontos cotados — ${surf}`.slice(0,60),
    gtype:'point', crs:S.workCRS, features:feats,
    fields:[{name:'ID',type:'C',length:12},
            {name:'COTA',type:'N',length:12,decimal:dec},
            {name:'E',type:'N',length:14,decimal:3},
            {name:'N',type:'N',length:14,decimal:3}],
    color:'#f5a524',
    labelField:'COTA',                       // já nasce rotulada pela cota
    lbl:{size:8, dec:dec, halo:'#ffffff', haloW:1.4, place:'offset', dx:8, dy:-8, unique:false}});
  refreshUI();
  const n=feats.length, semZ=feats.filter(f=>f.props.COTA===null).length;
  toast(`✅ ${n} ponto(s) cotado(s)`+(semZ?` · ${semZ} sem cota`:''));
  // encerra a coleta e limpa a pré-visualização
  if(S.cot.ativo) cotToggle();
  S.cot.pts=[]; cotRedraw(); cotOut();
}

function bindCotPanel(){
  const on=(id,ev,fn)=>{ const e=document.getElementById(id); if(e) e[ev]=fn; };
  on('btnCotColeta','onclick',cotToggle);
  on('btnCotUndo','onclick',cotUndo);
  on('btnCotClear','onclick',cotClear);
  on('btnCotLayer','onclick',cotLayer);
  on('cotRot','onchange',cotRedraw);
  on('cotDec','onchange',cotRedraw);
}

function bindGeoPanel(){
  const s=document.getElementById('tinLayer'); if(s) s.onchange=()=>{tinFields();refreshTinClip();tinAtualizaModoLimite();};
  const lm=document.getElementById('tinLimitMode'); if(lm) lm.onchange=tinAtualizaModoLimite;
  const lc=document.getElementById('tinClip'); if(lc) lc.onchange=tinAtualizaModoLimite;
  const b=document.getElementById('btnTIN'); if(b) b.onclick=runTIN;
  const bi=document.getElementById('btnTinInterMdt'); if(bi) bi.onclick=runTinInterMdt;
  {
    /* na malha TIN não existe célula (fig. 3 do usuário) — o campo só vale
       para o formato raster */
    const tf=document.getElementById('tinFormato'), cw=document.getElementById('tinCSwrap');
    const sync=()=>{
      if(typeof window.tinDefineModo==='function') window.tinDefineModo(tf&&tf.value);
      else if(cw) cw.style.display=(tf&&tf.value==='raster')?'':'none';
    };
    if(tf){ tf.addEventListener('change',sync); sync(); }
  }
  {
    const bg=document.getElementById('lidarModal');
    const bx=document.getElementById('lidarClose');
    const br=document.getElementById('btnLidarRun');
    if(bx)bx.onclick=()=>bg.classList.remove('on');
    if(bg)bg.onclick=e=>{if(e.target===bg)bg.classList.remove('on');};
    if(br)br.onclick=lidarImporta;
    const fi=document.getElementById('lidarFile');
    const bf=document.getElementById('btnLidarFile');
    /* o tema esconde TODO input[type=file] (display:none) — sem este botão a
       janela de escolher arquivo nunca abria */
    if(bf&&fi)bf.onclick=()=>fi.click();
    const sr=document.getElementById('lidarSemRe');
    if(sr)sr.onchange=()=>{
      const on=sr.checked;
      const e1=document.getElementById('lidarEsp'), e2=document.getElementById('lidarMet');
      if(e1)e1.disabled=on; if(e2)e2.disabled=on;
    };
    if(fi)fi.onchange=()=>{
      const info=document.getElementById('lidarInfo'),f=fi.files&&fi.files[0];
      const nm=document.getElementById('lidarFileNome');
      if(nm)nm.textContent=f?f.name:'nenhum arquivo escolhido';
      if(info&&f)info.textContent=f.name+' · '+(f.size/1048576).toFixed(1)+' MB — '+
        (/\.(obj|ply|stl)$/i.test(f.name)?'malha: será importada como Superfície TIN.':'ajuste o espaçamento e importe.');
    };
  }
  const pd=document.getElementById('btnPilhaDesenhar'); if(pd) pd.onclick=pilhaDesenharSaia;
  const pa=document.getElementById('btnPilhaAtualizar'); if(pa) pa.onclick=refreshPilhaPanel;
  const pv=document.getElementById('btnPilhaVolume'); if(pv) pv.onclick=pilhaCalcularVolume;
  {
    const be=document.getElementById('btnTinExtrai');
    const em=document.getElementById('tinExtrModo'), ec=document.getElementById('tinExtrContainers');
    const syncExtrModo=()=>{ if(ec)ec.style.display=(em&&em.value==='containers')?'':'none';
      if(be)be.innerHTML=(em&&em.value==='containers')?'📦 Reconhecer e contar contêineres':'🧊 Extrair sólidos individuais'; };
    if(be)be.onclick=tinExtraiSolidosUI;
    if(em){em.onchange=syncExtrModo;syncExtrModo();}
    const st=document.getElementById('tinExtrTopo'); if(st)st.onchange=refreshExtracaoSolidosPanel;
    const sb=document.getElementById('tinExtrBase'); if(sb)sb.onchange=refreshExtracaoSolidosPanel;
    const sa=document.getElementById('tinContArea');
    if(sa)sa.onchange=()=>{const L=S.layers.find(l=>String(l.id)===String(sa.value));
      const rb=document.getElementById('tinContRaioBox');if(rb)rb.style.display=L&&L.gtype==='line'?'':'none';};
    const bd=document.getElementById('btnTinContDesenha');if(bd)bd.onclick=tinContBuscaDesenha;
    const bc=document.getElementById('btnTinContConclui');if(bc)bc.onclick=tinContBuscaFinaliza;
    const bl=document.getElementById('btnTinContLimpa');if(bl)bl.onclick=tinContBuscaLimpa;
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.tool==='contBusca'){
      e.preventDefault();tinContBuscaLimpa();toast('Desenho da busca temporária cancelado');
    }});
  }
}

/* ---------- Extração de crista e pé diretamente do MDT ----------
   Extrai a fronteira das faixas íngremes e classifica seus dois lados:
   terreno alto/plano = crista; terreno baixo/plano = pé. O Z original do
   MDT é preservado em cada vértice, tornando o resultado uma breakline 3D. */
function cristaPeRasterAtual(){
  if(S.selRaster&&(S.rasters||[]).includes(S.selRaster)&&S.selRaster.d)return S.selRaster;
  const r=(S.rasters||[]).find(q=>String(q.id)===String(S.topoRasterId));
  return r&&r.d?r:(S.rasters||[]).find(q=>q&&q.d&&q.d.z)||null;
}
function cristaPeSlope(d,suaviza){
  const n=d.nc*d.nr,o=new Float32Array(n);o.fill(NaN);
  const dx=Math.abs(d.cs||1),dy=Math.abs(d.csy||d.cs||1),z=d.z,nc=d.nc,nr=d.nr;
  const v=(r,c,f)=>{const q=z[r*nc+c];return Number.isFinite(q)?q:f;};
  for(let r=1;r<nr-1;r++)for(let c=1;c<nc-1;c++){
    const k=r*nc+c,zc=z[k];if(!Number.isFinite(zc))continue;
    const gx=(v(r,c+1,zc)-v(r,c-1,zc))/(2*dx),gy=(v(r-1,c,zc)-v(r+1,c,zc))/(2*dy);
    o[k]=Math.atan(Math.hypot(gx,gy))*180/Math.PI;
  }
  if(!suaviza)return o;
  // Filtro separável 5×5 apenas no campo de declividade. Reduz os anéis
  // espúrios de 1–2 pixels sem deslocar nem arredondar a linha extraída.
  const tmp=new Float32Array(n),sm=new Float32Array(n);tmp.fill(NaN);sm.fill(NaN);
  for(let r=0;r<nr;r++)for(let c=0;c<nc;c++){let s=0,w=0;
    for(let dc=-2;dc<=2;dc++){const cc=c+dc;if(cc<0||cc>=nc)continue;const q=o[r*nc+cc];if(Number.isFinite(q)){s+=q;w++;}}
    if(w>=3)tmp[r*nc+c]=s/w;
  }
  for(let r=0;r<nr;r++)for(let c=0;c<nc;c++){let s=0,w=0;
    for(let dr=-2;dr<=2;dr++){const rr=r+dr;if(rr<0||rr>=nr)continue;const q=tmp[rr*nc+c];if(Number.isFinite(q)){s+=q;w++;}}
    if(w>=3)sm[r*nc+c]=s/w;
  }
  return sm;
}
function cristaPeIsoSegmentos(d,a,nivel){
  const seg=[],nc=d.nc,nr=d.nr;
  const lerp=(p,q,vp,vq)=>{const t=Math.max(0,Math.min(1,(nivel-vp)/((vq-vp)||1e-12)));
    return[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];};
  for(let r=1;r<nr-2;r++)for(let c=1;c<nc-2;c++){
    const v=[a[r*nc+c],a[r*nc+c+1],a[(r+1)*nc+c+1],a[(r+1)*nc+c]];
    if(!v.every(Number.isFinite))continue;
    const p=[[c,r],[c+1,r],[c+1,r+1],[c,r+1]],x=[];
    if((v[0]>=nivel)!==(v[1]>=nivel))x.push(lerp(p[0],p[1],v[0],v[1]));
    if((v[1]>=nivel)!==(v[2]>=nivel))x.push(lerp(p[1],p[2],v[1],v[2]));
    if((v[2]>=nivel)!==(v[3]>=nivel))x.push(lerp(p[2],p[3],v[2],v[3]));
    if((v[3]>=nivel)!==(v[0]>=nivel))x.push(lerp(p[3],p[0],v[3],v[0]));
    if(x.length===2)seg.push([x[0],x[1]]);
    else if(x.length===4){const m=(v[0]+v[1]+v[2]+v[3])/4;
      if(m>=nivel)seg.push([x[0],x[3]],[x[1],x[2]]);else seg.push([x[0],x[1]],[x[2],x[3]]);
    }
  }return seg;
}
function cristaPeCostura(seg){
  const key=p=>Math.round(p[0]*1000)+','+Math.round(p[1]*1000),adj=new Map(),use=new Uint8Array(seg.length);
  seg.forEach((s,i)=>s.forEach((p,e)=>{const k=key(p),v=adj.get(k)||[];v.push([i,e]);adj.set(k,v);}));
  const linhas=[],cresce=(pts)=>{
    let k=key(pts[pts.length-1]);
    for(let guard=0;guard<seg.length;guard++){const q=(adj.get(k)||[]).find(e=>!use[e[0]]);if(!q)break;
      const s=seg[q[0]],lado=key(s[0])===k?0:1;use[q[0]]=1;pts.push(s[1-lado]);k=key(pts[pts.length-1]);
      if(k===key(pts[0]))break;
    }
  };
  for(let i=0;i<seg.length;i++)if(!use[i]){use[i]=1;const p=[seg[i][0],seg[i][1]];
    cresce(p);p.reverse();cresce(p);p.reverse();if(p.length>2)linhas.push(p);}
  return linhas;
}
function cristaPeWorld(d,p){
  const dy=Math.abs(d.csy||d.cs||1);
  return[d.xll+(p[0]+.5)*d.cs,d.yll+(d.nr-.5-p[1])*dy];
}
function cristaPeSampleGrade(d,a,x,y){
  const dy=Math.abs(d.csy||d.cs||1),c=Math.round((x-d.xll)/d.cs-.5),r=Math.round((d.nr-.5)-(y-d.yll)/dy);
  return r<0||c<0||r>=d.nr||c>=d.nc?NaN:a[r*d.nc+c];
}
function cristaPeComprimento(p){let n=0;for(let i=1;i<p.length;i++)n+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);return n;}
function cristaPeSimplifica(p,tol){
  if(p.length<4||!(tol>0))return p;
  const rec=(a,b,out)=>{const A=p[a],B=p[b],dx=B[0]-A[0],dy=B[1]-A[1],dd=dx*dx+dy*dy||1;let im=-1,dm=0;
    for(let i=a+1;i<b;i++){const q=p[i],t=Math.max(0,Math.min(1,((q[0]-A[0])*dx+(q[1]-A[1])*dy)/dd));
      const v=Math.hypot(q[0]-A[0]-t*dx,q[1]-A[1]-t*dy);if(v>dm){dm=v;im=i;}}
    if(dm>tol){rec(a,im,out);out.pop();rec(im,b,out);}else out.push(A,B);};
  const o=[];rec(0,p.length-1,o);return o.filter((q,i)=>!i||q[0]!==o[i-1][0]||q[1]!==o[i-1][1]);
}
function cristaPeTipoLocal(d,slope,p,i){
  const cel=Math.max(Math.abs(d.cs||1),Math.abs(d.csy||d.cs||1));
  const ia=Math.max(0,i-2),ib=Math.min(p.length-1,i+2),a=p[ia],b=p[ib],dx=b[0]-a[0],dy=b[1]-a[1],ln=Math.hypot(dx,dy);
  if(!ln)return null;
  const nx=-dy/ln,ny=dx/ln,q=p[i];let cr=0,pe=0;
  // A largura aparente do talude muda com a resolução. Uma única distância
  // podia cair dentro da própria rampa nos dois lados e inverter a classe.
  // A votação em três escalas reconhece qual lado é alto/plano e qual é
  // baixo/plano, separando a metade-crista da metade-pé no mesmo contorno.
  [3,5,8].forEach(mult=>{
    const passo=cel*mult,A=[q[0]+nx*passo,q[1]+ny*passo],B=[q[0]-nx*passo,q[1]-ny*passo];
    const sA=cristaPeSampleGrade(d,slope,A[0],A[1]),sB=cristaPeSampleGrade(d,slope,B[0],B[1]);
    const zA=sampleZbil(d,A[0],A[1]),zB=sampleZbil(d,B[0],B[1]);
    if(![sA,sB,zA,zB].every(Number.isFinite)||Math.abs(sA-sB)<.12||Math.abs(zA-zB)<.02)return;
    const ladoAltoA=zA>zB,altoPlano=ladoAltoA?sA<sB:sB<sA;
    altoPlano?cr++:pe++;
  });
  if(!cr&&!pe)return null;
  return cr>=pe?'Crista':'Pé';
}
function cristaPeClassifica(d,slope,p){
  let cr=0,pe=0;const salto=Math.max(1,Math.floor(p.length/40));
  for(let i=0;i<p.length;i+=salto){const t=cristaPeTipoLocal(d,slope,p,i);if(t==='Crista')cr++;else if(t==='Pé')pe++;}
  return cr>=pe?'Crista':'Pé';
}
function cristaPeSepara(d,slope,p){
  if(p.length<3)return[];
  let lab=p.map((q,i)=>cristaPeTipoLocal(d,slope,p,i));
  // Completa pontos ambíguos pela classe válida mais próxima.
  let last=null;for(let i=0;i<lab.length;i++){if(lab[i])last=lab[i];else if(last)lab[i]=last;}
  last=null;for(let i=lab.length-1;i>=0;i--){if(lab[i])last=lab[i];else if(last)lab[i]=last;}
  if(!lab.some(Boolean))lab.fill(cristaPeClassifica(d,slope,p));
  // Votação local evita alternância crista/pé causada por um único pixel.
  const lim=lab.slice();for(let i=0;i<lab.length;i++){let cr=0,pe=0;
    for(let j=Math.max(0,i-3);j<=Math.min(lab.length-1,i+3);j++)lab[j]==='Crista'?cr++:pe++;
    lim[i]=cr>=pe?'Crista':'Pé';
  }lab=lim;
  const out=[];let ini=0;
  for(let i=1;i<=p.length;i++)if(i===p.length||lab[i]!==lab[ini]){
    const a=Math.max(0,ini-(ini?1:0)),q=p.slice(a,i);if(q.length>=2)out.push({tipo:lab[ini],pts:q});ini=i;
  }
  return out;
}
function cristaPeExtrair(r,limiar,minComp,suaviza){
  const d=r.d,slope=cristaPeSlope(d,suaviza),linhas=cristaPeCostura(cristaPeIsoSegmentos(d,slope,limiar));
  const out={Crista:[],Pé:[]},tol=Math.max(Math.abs(d.cs||1),Math.abs(d.csy||d.cs||1))*.18;
  linhas.forEach(g=>{const densa=g.map(q=>cristaPeWorld(d,q));
    cristaPeSepara(d,slope,densa).forEach(sec=>{const p=cristaPeSimplifica(sec.pts,tol),comp=cristaPeComprimento(p);if(comp<minComp)return;
      const tipo=sec.tipo,zg=p.map(q=>sampleZbil(d,q[0],q[1])),zs=zg.filter(Number.isFinite);if(zs.length<2)return;
      const zm=zs.reduce((a,b)=>a+b,0)/zs.length;
      out[tipo].push({geom:p,multi:false,zg,props:{TIPO:tipo,COTA_MED:+zm.toFixed(3),COMP_M:+comp.toFixed(2),LIMIAR_G:+limiar,FONTE:r.name}});
    });
  });return out;
}
function abreCristaPe(){
  let bg=document.getElementById('cristaPeModal');
  if(!bg){bg=document.createElement('div');bg.id='cristaPeModal';bg.className='modal-bg';
    bg.innerHTML='<div class="modal" style="width:min(620px,96vw)"><div class="modal-h"><b>Extrair cristas e pés do MDT</b><div style="flex:1"></div><button class="tbtn" id="cpX">✕</button></div>'+
      '<div class="modal-b"><label class="field">MDT de trabalho</label><select id="cpRaster" class="inp"></select>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label class="field">Limiar de declividade (graus)</label><input id="cpLim" type="number" min="1" max="89" value="28"></div>'+
      '<div><label class="field">Comprimento mínimo (m)</label><input id="cpMin" class="inp" type="number" min="0" value="10"></div></div>'+
      '<label style="display:flex;gap:9px;align-items:center;margin:12px 0"><input id="cpSuave" type="checkbox" checked> Filtrar ruído de uma célula sem suavizar a geometria final</label>'+
      '<div class="hint">O lado alto da faixa íngreme vira <b>crista</b>; o lado baixo vira <b>pé</b>. As cotas originais do MDT são preservadas em cada vértice.</div>'+
      '<button id="cpRun" class="tbtn" style="width:100%;justify-content:center;margin-top:14px;background:var(--amber);color:#1a1206;font-weight:700">Extrair crista e pé</button><div id="cpOut" class="hout" style="margin-top:10px">Selecione o MDT e execute.</div></div></div>';
    document.body.appendChild(bg);bg.querySelector('#cpX').onclick=()=>bg.classList.remove('on');
    bg.addEventListener('mousedown',e=>{if(e.target===bg)bg.classList.remove('on');});
    bg.querySelector('#cpRun').onclick=()=>{const r=(S.rasters||[]).find(q=>String(q.id)===String(bg.querySelector('#cpRaster').value));
      if(!r||!r.d){toast('Selecione um MDT válido');return;}const lim=+bg.querySelector('#cpLim').value||28,min=Math.max(0,+bg.querySelector('#cpMin').value||0);
      const outEl=bg.querySelector('#cpOut'),bt=bg.querySelector('#cpRun');bt.disabled=true;outEl.textContent='Analisando a grade nativa do MDT…';
      setTimeout(()=>{try{const res=cristaPeExtrair(r,lim,min,bg.querySelector('#cpSuave').checked);
        const fields=[{name:'TIPO',type:'C',length:12,decimal:0},{name:'COTA_MED',type:'N',length:14,decimal:3},{name:'COMP_M',type:'N',length:14,decimal:2},{name:'LIMIAR_G',type:'N',length:8,decimal:1},{name:'FONTE',type:'C',length:60,decimal:0}];
        // Uma nova execução substitui somente os produtos anteriores deste MDT.
        // Assim não ficam cristas/pés antigos sobrepostos parecendo uma só camada.
        const nomes=new Set(['Cristas — '+r.name,'Pés — '+r.name]);
        S.layers.filter(L=>nomes.has(L.name)).forEach(L=>{try{if(L.llayer)map.removeLayer(L.llayer);}catch(e){}});
        S.layers=S.layers.filter(L=>!nomes.has(L.name));
        if(res.Crista.length){const L=addLayer({sourceLayer:r,name:'Cristas — '+r.name,gtype:'line',crs:S.workCRS,features:res.Crista,fields,color:'#e76f51'});L.weight=3;L.groupId=r.groupId||null;}
        if(res.Pé.length){const L=addLayer({sourceLayer:r,name:'Pés — '+r.name,gtype:'line',crs:S.workCRS,features:res.Pé,fields,color:'#277da1'});L.weight=3;L.groupId=r.groupId||null;}
        refreshUI();zApply();outEl.innerHTML='<b>'+res.Crista.length+'</b> crista(s) e <b>'+res.Pé.length+'</b> pé(s) gerados em 3D.';
        toast('Crista e pé extraídos — linhas prontas para a triangulação');
      }catch(e){console.error(e);outEl.textContent='Falha: '+e.message;toast('Falha na extração de crista e pé');}finally{bt.disabled=false;}},40);
    };
  }
  const sel=bg.querySelector('#cpRaster'),atual=cristaPeRasterAtual();
  sel.innerHTML=(S.rasters||[]).filter(r=>r&&r.d&&r.d.z).map(r=>'<option value="'+r.id+'">'+esc(r.name)+' — '+r.d.nc+'×'+r.d.nr+'</option>').join('');
  if(atual)sel.value=String(atual.id);bg.classList.add('on');
}

S.prof={buf:[], line:null, result:null, hist:[]};
function sampleZbil(d,x,y){ // bilinear nos centros de célula
  /* superfície triangulada: amostra o triângulo exato (estilo Surpac),
     a grade fica só para exibição */
  if(d&&d.tin)return tinSampleZ(d.tin,x,y);
  const gc=(x-d.xll)/d.cs-0.5, gr=(d.nr-0.5)-(y-d.yll)/d.cs;
  const c0=Math.floor(gc), r0=Math.floor(gr);
  if(c0<-1||r0<-1||c0>d.nc-1||r0>d.nr-1) return NaN;
  const fx=gc-c0, fy=gr-r0;
  const g=(rr,cc)=>{ rr=Math.max(0,Math.min(d.nr-1,rr)); cc=Math.max(0,Math.min(d.nc-1,cc));
    return d.z[rr*d.nc+cc]; };
  const v00=g(r0,c0), v01=g(r0,c0+1), v10=g(r0+1,c0), v11=g(r0+1,c0+1);
  let sw=0, sv=0;
  [[v00,(1-fx)*(1-fy)],[v01,fx*(1-fy)],[v10,(1-fx)*fy],[v11,fx*fy]].forEach(([v,w])=>{
    if(!isNaN(v)){ sv+=v*w; sw+=w; } });
  return sw>0.05 ? sv/sw : NaN;
}
function sampleZnear(d,x,y){ // cota CRUA da célula (sem interpolação)
  if(d&&d.tin)return tinSampleZ(d.tin,x,y);
  const c=Math.round((x-d.xll)/d.cs-0.5), r=Math.round((d.nr-0.5)-(y-d.yll)/d.cs);
  if(c<0||r<0||c>d.nc-1||r>d.nr-1) return NaN;
  const v=d.z[r*d.nc+c];
  return isNaN(v)? NaN : v;
}
function sampleProfile(ptsCRS, rasters, step, method){
  // ptsCRS: [[E,N],...] no CRS de trabalho
  const dist=[0]; for(let i=1;i<ptsCRS.length;i++)
    dist.push(dist[i-1]+Math.hypot(ptsCRS[i][0]-ptsCRS[i-1][0],ptsCRS[i][1]-ptsCRS[i-1][1]));
  const total=dist[dist.length-1];
  if(total<=0) return null;
  const n=Math.max(2,Math.ceil(total/step)+1);
  const xs=[], pts=[];
  for(let i=0;i<n;i++){
    const t=Math.min(total, i*step);
    // localizar segmento
    let j=1; while(j<dist.length-1 && dist[j]<t) j++;
    const f=(t-dist[j-1])/((dist[j]-dist[j-1])||1);
    const x=ptsCRS[j-1][0]+f*(ptsCRS[j][0]-ptsCRS[j-1][0]);
    const y=ptsCRS[j-1][1]+f*(ptsCRS[j][1]-ptsCRS[j-1][1]);
    xs.push(t); pts.push([x,y]);
  }
  const smp = (method==='near') ? sampleZnear : sampleZbil;
  const series=rasters.map(r=>({name:r.name, z:pts.map(pt=>smp(r.d,pt[0],pt[1]))}));
  return {dist:xs, total, series, pts, method:method||'bilinear'};
}
/* Nome do perfil e rótulos das extremidades.
   "A"            -> título "Perfil A – A′",   pontas A e A′
   "Talude Norte" -> título "Talude Norte",    pontas T e T′  */
function profNome(){
  const e=document.getElementById('prName');
  const v=(e && e.value.trim()) || 'A';
  return v;
}
/* Convenção de seção A – a : MAIÚSCULA na origem, minúscula na extremidade.
   Aceita o que o usuário digitar em qualquer caixa e normaliza o par.        */
function profRotulos(nome){
  const n=(nome||profNome()).trim();
  if(/^[A-Za-z0-9]{1,3}$/.test(n)){
    const A=n.toUpperCase(), a=n.toLowerCase();
    return {a:A, b:a, titulo:`Perfil ${A} – ${a}`};
  }
  const ini=n[0]||'A';
  return {a:ini.toUpperCase(), b:ini.toLowerCase(), titulo:n};
}
/* RÓTULOS POR VÉRTICE.
   Convenção de desenho: uma RETA (2 pontos) tem as pontas A e a — o clássico
   "A–a". Uma poligonal com mais pontos recebe UMA LETRA POR VÉRTICE, em
   sequência a partir da letra do perfil: A, B, C, D, E — assim cada mudança
   de direção fica identificada na planta e no gráfico. */
function profRotulosVertices(nome,n){
  const R=profRotulos(nome);
  if(!(n>2)) return [R.a,R.b];
  const nm=String(nome||profNome()).trim();
  const base=(R.a||'A').toUpperCase();
  const cod=base.charCodeAt(0);
  /* Nome curto (A, B, P1…) segue o alfabeto: A, B, C, D, E.
     Nome por extenso ("Talude Norte") NÃO vira T, U, V — as letras seguintes
     não teriam relação com o nome; usa-se a inicial numerada: T1, T2, T3. */
  const alfabetico=/^[A-Za-z]$/.test(nm);
  const letra=i=>{
    if(!alfabetico||cod<65||cod>90) return base+(i+1);
    const v=cod-65+i;
    return v<26 ? String.fromCharCode(65+v)
                : String.fromCharCode(65+(v%26))+(Math.floor(v/26)+1);
  };
  return Array.from({length:n},(_,i)=>letra(i));
}
/* Título coerente com a quantidade de vértices: reta = "Perfil A – a";
   poligonal = "Perfil A – E" (primeira e última letras). */
function profTituloVertices(nome,n){
  const R=profRotulos(nome), V=profRotulosVertices(nome,n);
  if(!(n>2)) return R.titulo;
  if(/^[A-Za-z0-9]{1,3}$/.test(String(nome||profNome()).trim()))
    return `Perfil ${V[0]} – ${V[V.length-1]}`;
  return R.titulo;
}
/* Distância acumulada de cada vértice ao longo do eixo (para marcar as
   letras no gráfico exatamente onde a linha muda de direção). */
function profDistVertices(pts){
  if(!Array.isArray(pts)||pts.length<2) return [];
  const d=[0];
  for(let i=1;i<pts.length;i++)
    d.push(d[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));
  return d;
}
/* próxima letra ainda não usada nos perfis já gerados nesta sessão */
function profProximaLetra(){
  const usados=new Set((S.prof.hist||[]).map(h=>h.toUpperCase()));
  for(let i=0;i<26;i++){ const c=String.fromCharCode(65+i); if(!usados.has(c)) return c; }
  return 'A'+((S.prof.hist||[]).length+1);
}

const PROF_CORES=['#b3781a','#2b6cb0','#c53030','#2f855a','#6b46c1','#0f8b8d','#d97706'];
function profEstiloPadrao(i){return {color:PROF_CORES[i%PROF_CORES.length],width:2,dash:'solid',visible:true};}
function profTracado(estilo){
  return estilo==='dash'?[9,5]:estilo==='dot'?[2,4]:estilo==='dashdot'?[9,4,2,4]:[];
}
function profAplicaEstilosGuardados(prof){
  S.prof.styles=S.prof.styles||{};
  (prof.series||[]).forEach((sr,i)=>{
    sr.sourceName=sr.sourceName||sr.name;
    const salvo=S.prof.styles[sr.sourceKey||sr.sourceName]||S.prof.styles[sr.sourceName]||{},pad=profEstiloPadrao(i);
    sr.style={...pad,...salvo,...(sr.style||{})};
    if(salvo.name)sr.name=salvo.name;
  });
}
function profAtualizaEditorEstilos(prof){
  const box=document.getElementById('prStyleBox'),list=document.getElementById('prStyleList');
  if(!box||!list)return;
  if(!prof||!prof.series||!prof.series.length){box.style.display='none';list.innerHTML='';return;}
  profAplicaEstilosGuardados(prof);box.style.display='block';
  list.innerHTML=prof.series.map((sr,i)=>{
    const s=sr.style||profEstiloPadrao(i);
    return `<div class="pr-style-row" data-i="${i}" style="display:grid;grid-template-columns:24px minmax(0,1fr) 36px 58px 82px;gap:5px;align-items:center;margin:4px 0">`+
      `<input class="pr-vis" type="checkbox" ${s.visible!==false?'checked':''} title="Mostrar ou ocultar esta linha" style="width:auto;accent-color:var(--amber)">`+
      `<input class="pr-nome" type="text" value="${esc(sr.name)}" title="Nome da linha no perfil">`+
      `<input class="pr-cor" type="color" value="${esc(s.color)}" title="Cor da linha" style="height:30px;padding:2px">`+
      `<input class="pr-peso" type="number" min="0.5" max="10" step="0.5" value="${+s.width||2}" title="Espessura da linha em pixels">`+
      `<select class="pr-traco" title="Padrão do traço"><option value="solid" ${s.dash==='solid'?'selected':''}>Sólida</option>`+
      `<option value="dash" ${s.dash==='dash'?'selected':''}>Tracejada</option>`+
      `<option value="dot" ${s.dash==='dot'?'selected':''}>Pontilhada</option>`+
      `<option value="dashdot" ${s.dash==='dashdot'?'selected':''}>Traço-ponto</option></select></div>`;
  }).join('');
  list.querySelectorAll('.pr-style-row').forEach(row=>{
    const i=+row.dataset.i,sr=prof.series[i];if(!sr)return;
    const redesenha=()=>{
      const s=sr.style||(sr.style=profEstiloPadrao(i));
      sr.name=row.querySelector('.pr-nome').value.trim()||sr.sourceName||`Linha ${i+1}`;
      s.visible=row.querySelector('.pr-vis').checked;
      s.color=row.querySelector('.pr-cor').value;
      s.width=Math.max(.5,Math.min(10,+row.querySelector('.pr-peso').value||2));
      s.dash=row.querySelector('.pr-traco').value||'solid';
      S.prof.styles=S.prof.styles||{};S.prof.styles[sr.sourceKey||sr.sourceName]={...s,name:sr.name};
      drawProfChart(prof,+document.getElementById('prVE')?.value||2);
    };
    row.querySelectorAll('input,select').forEach(e=>e.addEventListener(e.type==='text'?'change':'input',redesenha));
    row.querySelector('.pr-traco').addEventListener('change',redesenha);
    row.querySelector('.pr-vis').addEventListener('change',redesenha);
    row.querySelector('.pr-nome').addEventListener('change',redesenha);
  });
}

function drawProfChart(prof, VE){
  const cv=document.getElementById('profChart'); if(!cv||!cv.getContext) return;
  const mL2=56,mB2=40,mT2=18,mR2=16;
  const W=cv.width;                       // largura fixa (860)
  const plotW=W-mL2-mR2;
  let zmn=Infinity,zmx=-Infinity;
  prof.series.forEach(sr=>sr.z.forEach(v=>{ if(!isNaN(v)){ if(v<zmn)zmn=v; if(v>zmx)zmx=v; } }));
  if(!isFinite(zmn)){ toast('Linha fora do raster'); return; }
  const pad=(zmx-zmn)*0.05+0.5; zmn-=pad; zmx+=pad;

  // --- escala vertical: y = VE × escala horizontal ---
  // O EV é uma propriedade geométrica: NÃO se mexe nele para preencher a tela.
  // Em vez disso, a ALTURA DO GRÁFICO acompanha o que o perfil realmente ocupa,
  // eliminando o espaço morto (antes o canvas tinha altura fixa de 430 px).
  const sxp=plotW/prof.total;
  let syp=sxp*VE, veEff=VE;
  const H_MIN=170, H_MAX=620;                       // limites do canvas (px)
  let plotH=(zmx-zmn)*syp;                          // altura EXIGIDA pelo EV
  const plotH_MAX=H_MAX-mT2-mB2, plotH_MIN=H_MIN-mT2-mB2;
  if(plotH>plotH_MAX){                              // perfil alto demais: reduz o EV efetivo
    plotH=plotH_MAX; syp=plotH/(zmx-zmn); veEff=syp/sxp;
  } else if(plotH<plotH_MIN){                       // perfil baixo demais: garante altura mínima
    plotH=plotH_MIN; syp=plotH/(zmx-zmn); veEff=syp/sxp;
  }
  const H=Math.round(plotH+mT2+mB2);
  if(cv.height!==H) cv.height=H;                    // redimensiona (limpa o contexto)
  cv.style.display='block';
  const ctx=cv.getContext('2d');
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
  const yBase=mT2+plotH; // z mínimo na base
  const X=t=>mL2+t*sxp, Y=z=>yBase-(z-zmn)*syp;
  // grade
  ctx.strokeStyle='#e2e2e2'; ctx.fillStyle='#333'; ctx.font='11px Signika, sans-serif'; ctx.lineWidth=1;
  const dstep=[10,25,50,100,250,500,1000,2500,5000].find(v=>prof.total/v<=10)||5000;
  for(let t=0;t<=prof.total;t+=dstep){ ctx.beginPath();ctx.moveTo(X(t),mT2);ctx.lineTo(X(t),yBase);ctx.stroke();
    ctx.textAlign='center'; ctx.fillText(t>=1000?(t/1000)+' km':t+' m',X(t),yBase+15); }
  const zstep=[1,2,5,10,20,50,100].find(v=>(zmx-zmn)/v<=8)||100;
  for(let z=Math.ceil(zmn/zstep)*zstep;z<=zmx;z+=zstep){ ctx.beginPath();ctx.moveTo(mL2,Y(z));ctx.lineTo(W-mR2,Y(z));ctx.stroke();
    ctx.textAlign='right'; ctx.fillText(z.toFixed(0),mL2-5,Y(z)+4); }
  // séries
  profAplicaEstilosGuardados(prof);
  prof.series.forEach((sr,i)=>{
    const estilo=sr.style||profEstiloPadrao(i);if(estilo.visible===false)return;
    ctx.strokeStyle=estilo.color;ctx.lineWidth=Math.max(.5,+estilo.width||2);
    ctx.setLineDash(profTracado(estilo.dash));ctx.beginPath(); let started=false;
    sr.z.forEach((v,k)=>{ if(isNaN(v)){started=false;return;}
      if(!started){ctx.moveTo(X(prof.dist[k]),Y(v));started=true;} else ctx.lineTo(X(prof.dist[k]),Y(v)); });
    ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=estilo.color; ctx.textAlign='left';
    ctx.fillText(sr.name, mL2+6, mT2+14+i*14);
  });
  // moldura + A/A' + VE
  ctx.strokeStyle='#111'; ctx.strokeRect(mL2,mT2,plotW,plotH);
  // círculo crítico do Bishop (se houver, e se a série bater)
  const B=S.prof.bishop;
  if(B && prof===S.prof.result){
    // linha do NA (azul tracejada)
    if(B.zw){
      ctx.save(); ctx.beginPath(); ctx.rect(mL2,mT2,plotW,plotH); ctx.clip();
      ctx.beginPath();
      let fw=true;
      for(let i=0;i<B.dist.length;i++){ const px=X(B.dist[i]), py=Y(B.zw[i]);
        if(fw){ctx.moveTo(px,py);fw=false;} else ctx.lineTo(px,py); }
      ctx.strokeStyle='#3d7dd8'; ctx.lineWidth=1.6; ctx.setLineDash([6,3]); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font='600 11px Signika,sans-serif'; ctx.fillStyle='#3d7dd8';
      ctx.fillText('NA', mL2+6, Y(B.zw[0])-4);
      ctx.restore();
    }
    // linha do embasamento (modo pilha), tracejada cinza
    if(B.zb){
      ctx.save(); ctx.beginPath(); ctx.rect(mL2,mT2,plotW,plotH); ctx.clip();
      ctx.beginPath();
      let f1=true;
      for(let i=0;i<B.dist.length;i++){ const px=X(B.dist[i]), py=Y(B.zb[i]);
        if(f1){ctx.moveTo(px,py);f1=false;} else ctx.lineTo(px,py); }
      ctx.strokeStyle='#8a6a3a'; ctx.lineWidth=1.6; ctx.setLineDash([3,3]); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }
    const {xc,yc,R}=B.circle;
    ctx.save();
    ctx.beginPath(); ctx.rect(mL2,mT2,plotW,plotH); ctx.clip();
    ctx.beginPath();
    let first=true;
    for(let xx=B.xa; xx<=B.xb; xx+=(B.xb-B.xa)/160){
      const q=R*R-(xx-xc)*(xx-xc); if(q<=0) continue;
      const zz=yc-Math.sqrt(q);
      const px=X(xx), py=Y(zz);
      if(first){ctx.moveTo(px,py);first=false;} else ctx.lineTo(px,py);
    }
    ctx.strokeStyle='#e05252'; ctx.lineWidth=2.2; ctx.setLineDash([7,4]); ctx.stroke();
    ctx.setLineDash([]);
    // rótulo do FS
    const lx=X((B.xa+B.xb)/2), lyq=R*R-((B.xa+B.xb)/2-xc)**2;
    const ly=Y(yc-Math.sqrt(Math.max(0,lyq)))+18;
    ctx.font='700 13px Signika,sans-serif';
    const txt='FS = '+B.FS.toFixed(2);
    const tw=ctx.measureText(txt).width;
    ctx.fillStyle='#fff'; ctx.fillRect(lx-tw/2-5,ly-12,tw+10,17);
    ctx.strokeStyle='#e05252'; ctx.lineWidth=1; ctx.strokeRect(lx-tw/2-5,ly-12,tw+10,17);
    ctx.fillStyle='#e05252'; ctx.textAlign='center'; ctx.fillText(txt,lx,ly);
    ctx.textAlign='left';
    ctx.restore();
  }
  ctx.fillStyle='#111'; ctx.font='bold 13px Signika, sans-serif';
  const RT=profRotulos(prof.nome);
  const VD=Array.isArray(prof.vertDist)?prof.vertDist:[];
  const VL=profRotulosVertices(prof.nome, VD.length||2);
  ctx.textAlign='center';
  if(VD.length>2){
    /* Uma letra por VÉRTICE, na distância exata da quebra, com um traço
       vertical leve ligando a letra ao eixo — assim o gráfico e a planta
       falam a mesma língua (A, B, C, D, E). */
    const tot=prof.total||VD[VD.length-1]||1;
    VD.forEach((dv,i)=>{
      const xq=mL2+plotW*(dv/tot);
      if(i>0 && i<VD.length-1){
        ctx.save();
        ctx.strokeStyle='#b3781a88'; ctx.lineWidth=1; ctx.setLineDash([3,3]);
        ctx.beginPath(); ctx.moveTo(xq,mT2); ctx.lineTo(xq,mT2+plotH); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle='#111';
      ctx.fillText(VL[i]||'', xq, mT2-5);
    });
  }else{
    ctx.fillText(RT.a,mL2,mT2-5); ctx.fillText(RT.b,W-mR2,mT2-5);
  }
  // título do perfil
  ctx.save(); ctx.font='600 13px Signika, sans-serif'; ctx.fillStyle='#111';
  const tit=profTituloVertices(prof.nome, VD.length||2);
  if(VD.length>2){
    /* Com letra em cada quebra, o topo pode ficar disputado: se alguma letra
       cair perto do centro, o título vai para o rodapé à esquerda em vez de
       montar em cima dela. */
    const tot=prof.total||VD[VD.length-1]||1, xc=mL2+plotW/2;
    const meia=ctx.measureText(tit).width/2+26;   /* folga generosa: a fonte real é mais larga que a de fallback */
    const colide=VD.some(dv=>Math.abs((mL2+plotW*(dv/tot))-xc)<meia);
    if(colide){ ctx.textAlign='left'; ctx.fillText(tit, mL2, H-6); }
    else { ctx.textAlign='center'; ctx.fillText(tit, xc, mT2-5); }
  }else{
    ctx.textAlign='center'; ctx.fillText(tit, mL2+plotW/2, mT2-5);
  }
  ctx.restore();
  ctx.font='11px Signika, sans-serif'; ctx.textAlign='right';
  ctx.fillText('EV '+veEff.toFixed(1)+'× · cota (m) × distância', W-mR2, H-6);
  return veEff;
}
// Profile choices refer only to sources in the current project. Do not keep
// deleted IDs as synthetic layers or silently replace them with another one.
function profReconcileSources(){
  if(!S.prof)return false;
  const rasters=new Set((S.rasters||[]).filter(r=>r&&r.d).map(r=>String(r.id))),
    lines=new Set((S.layers||[]).filter(L=>L?.gtype==='line'&&profLinhaTemZ(L)).map(L=>String(L.id)));
  let changed=false;
  for(const [key,valid] of [['sourceRasterIds',rasters],['sourceLineIds',lines]]){
    const before=Array.isArray(S.prof[key])?S.prof[key]:[];
    if(before.some(id=>!valid.has(String(id))))changed=true;
    S.prof[key]=[...new Set(before.map(String))].filter(id=>valid.has(id));
  }
  for(const [key,id,valid] of [['rasterPick','prRasterSel',rasters],['vectorPick','prVectorSel',lines]]){
    const select=document.getElementById(id),value=S.prof[key]??select?.value;
    if(value&&!valid.has(String(value))){S.prof[key]='';if(select)select.value='';changed=true;}
  }
  const axisValid=(layer,idx,partIdx,feature)=>{
    if(!(S.layers||[]).includes(layer)||layer?.gtype!=='line'||!Number.isInteger(idx)||!Number.isInteger(partIdx))return false;
    const f=layer.features?.[idx];if(!f||feature&&f!==feature||!Array.isArray(f.geom))return false;
    const parts=Array.isArray(f.geom[0]?.[0])?f.geom:[f.geom];return parts[partIdx]?.length>=2;
  };
  const axis=S.prof.axisSelection;
  if(axis&&!axisValid(axis.layer,axis.idx,axis.partIdx,axis.feature)){
    S.prof.axisSelection=null;S.prof.buf=[];S.prof.line=null;changed=true;
    if(S.tool==='profile')redrawProfPreview();
  }
  const select=document.getElementById('prAxisVectorSel'),pick=S.prof.axisPick??select?.value;
  if(pick){
    const key=String(pick).split(':'),partIdx=Number(key.pop()),idx=Number(key.pop()),layer=(S.layers||[]).find(L=>String(L.id)===key.join(':'));
    if(!axisValid(layer,idx,partIdx)){S.prof.axisPick='';if(select)select.value='';changed=true;}
  }
  if(changed)profInvalidateResult();return changed;
}
function profSyncSources(){
  const changed=profReconcileSources();
  const panel=document.getElementById('sidePerfis');
  if(!panel||panel.style.display==='none')return;
  // A tree refresh need not rebuild the same profile lists on every style
  // or map update. Revisions capture edited geometries and elevation fields.
  const key=JSON.stringify([S.projectId,(S.rasters||[]).map(r=>[r.id,r.name,!!r.d]),
    (S.layers||[]).map(L=>[L.id,L.name,L.gtype,L._rev,L.features?.length])]);
  if(changed||S.prof._catalogKey!==key){refreshProfPanel();S.prof._catalogKey=key;}
}
function profSelectedRasters(){
  profReconcileSources();
  if(profSourceMode()==='vector')return [];
  const ids=new Set((S.prof.sourceRasterIds||[]).map(String)),picked=document.getElementById('prRasterSel')?.value;
  if(picked)ids.add(String(picked));
  return [...ids].map(id=>S.rasters.find(r=>String(r.id)===id)).filter(Boolean);
}
function profSelectedLines(){
  profReconcileSources();
  if(profSourceMode()==='raster')return [];
  const ids=new Set((S.prof.sourceLineIds||[]).map(String));
  const picked=document.getElementById('prVectorSel')?.value;
  if(picked)ids.add(String(picked));
  return [...ids].map(id=>S.layers.find(L=>String(L.id)===id&&profLinhaTemZ(L))).filter(Boolean);
}
function profSourceMode(){
  const mode=document.getElementById('prSourceMode')?.value||S.prof.sourceMode;
  return ['vector','mixed'].includes(mode)?mode:'raster';
}
function profZNumber(v){
  if(v==null||typeof v==='boolean'||(typeof v==='string'&&!v.trim()))return NaN;
  const n=Number(typeof v==='string'?v.trim().replace(',','.'):v);
  return Number.isFinite(n)&&n>-1e38?n:NaN;
}
function profLinhaZConst(f){
  const p=f.props||{};
  for(const k of Object.keys(p)){
    const key=k.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s_-]/g,'');
    if(/^(z|cota|elev|elevacao|elevation|altitude|nivel|elevacion|height)$/.test(key.toLowerCase())){
      const z=profZNumber(p[k]);if(Number.isFinite(z))return z;
    }
  }
  return NaN;
}
// Leitura somente: não reparar cotas ausentes nem modificar as geometrias importadas.
// DXF pode ter multi=true com uma linha plana; SHP usa arrays por parte.
function profVectorParts(f){
  if(!f||!Array.isArray(f.geom))return [];
  const nested=Array.isArray(f.geom[0]?.[0]),parts=nested?f.geom:[f.geom];
  const array=v=>Array.isArray(v)||ArrayBuffer.isView(v);
  return parts.map((xy,partIdx)=>{
    const zg=nested?f.zg?.[partIdx]:f.zg,hasZg=array(zg),zc=profLinhaZConst(f);
    return {xy:xy.map(p=>[p[0],p[1]]),partIdx,z:xy.map((p,i)=>{
      const z=hasZg?profZNumber(zg[i]):NaN;
      if(Number.isFinite(z))return z;
      if(p.length>2)return profZNumber(p[2]);
      return hasZg?NaN:zc;
    })};
  });
}
function profLinhaTemZ(L){
  if(L?.gtype!=='line'||!Array.isArray(L.features))return false;
  // Eligibility needs only one usable Z, not copies of every XY/Z vertex.
  for(const f of L.features){
    if(!f||!Array.isArray(f.geom))continue;
    const nested=Array.isArray(f.geom[0]?.[0]);let constant,readConstant=false;
    for(let partIdx=0;partIdx<(nested?f.geom.length:1);partIdx++){
      if(nested&&!(partIdx in f.geom))continue;
      const xy=nested?f.geom[partIdx]:f.geom,zg=nested?f.zg?.[partIdx]:f.zg,
        hasZg=Array.isArray(zg)||ArrayBuffer.isView(zg);
      if(!Array.isArray(xy))continue;
      for(let i=0;i<xy.length;i++){
        if(!(i in xy))continue; // Match map/some behavior for sparse arrays.
        if(hasZg&&Number.isFinite(profZNumber(zg[i])))return true;
        const p=xy[i];
        if(p==null)continue;
        if(p.length>2){if(Number.isFinite(profZNumber(p[2])))return true;}
        else if(!hasZg){
          if(!readConstant){constant=profLinhaZConst(f);readConstant=true;}
          if(Number.isFinite(constant))return true;
        }
      }
    }
  }
  return false;
}
function profSegInter(a,b,c,d){
  const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],den=rx*sy-ry*sx;
  if(Math.abs(den)<1e-10)return null;
  const qx=c[0]-a[0],qy=c[1]-a[1],t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
  return t>=-1e-8&&t<=1+1e-8&&u>=-1e-8&&u<=1+1e-8?[t,u]:null;
}
function sampleProfileLines(ptsCRS,layers,step,axisSelection){
  const base=[0];for(let i=1;i<ptsCRS.length;i++)base.push(base[i-1]+Math.hypot(ptsCRS[i][0]-ptsCRS[i-1][0],ptsCRS[i][1]-ptsCRS[i-1][1]));
  const total=base[base.length-1];if(!(total>0))return null;
  if(!(step>0)||!Number.isFinite(step))step=1;
  // Limita apenas a amostragem adicional; todos os vértices/interseções são mantidos.
  step=Math.max(step,total/50000);
  const stations=[0,total,...base];for(let s=step;s<total;s+=step)stations.push(s);
  const data=layers.map(L=>{
    const hit=[],spans=[];
    const own=axisSelection&&String(axisSelection.layer.id)===String(L.id);
    const features=own?[L.features[axisSelection.idx]]:L.features;
    const nativePart=own?profVectorParts(features[0]).find(p=>p.partIdx===axisSelection.partIdx):null;
    const nativeXY=nativePart?.xy.map(p=>reproj(L.crs,S.workCRS,p[0],p[1]));
    const direct=nativeXY?.length===ptsCRS.length&&nativeXY.every((p,i)=>Math.hypot(p[0]-ptsCRS[i][0],p[1]-ptsCRS[i][1])<1e-5);
    if(direct){
      // A progressiva distingue passagens pelo mesmo XY (linha que volta sobre
      // si mesma). Não procurar outro segmento espacialmente coincidente.
      for(let i=1;i<base.length;i++)if(base[i]>base[i-1])
        spans.push([base[i-1],base[i],nativePart.z[i-1],nativePart.z[i]]);
    }
    (direct?[]:features).filter(Boolean).forEach(f=>{
      profVectorParts(f).forEach(part=>{
        if(own&&Number.isInteger(axisSelection.partIdx)&&part.partIdx!==axisSelection.partIdx)return;
        const src=part.xy;if(!src||src.length<2)return;
        for(let j=1;j<src.length;j++){
          const c=reproj(L.crs,S.workCRS,src[j-1][0],src[j-1][1]),d=reproj(L.crs,S.workCRS,src[j][0],src[j][1]);
          const z0=part.z[j-1],z1=part.z[j],valid=Number.isFinite(z0)&&Number.isFinite(z1);
          for(let i=1;i<ptsCRS.length;i++){
            const a=ptsCRS[i-1],b=ptsCRS[i],rx=b[0]-a[0],ry=b[1]-a[1],seg=base[i]-base[i-1];
            if(seg<=1e-9)continue;
            // Coincidência longitudinal: amostrar o Z da própria linha, inclusive
            // sentido invertido e trechos sem Z (lacunas, nunca cotas inventadas).
            const cross=p=>Math.abs(rx*(p[1]-a[1])-ry*(p[0]-a[0]))/seg;
            if(cross(c)<1e-5&&cross(d)<1e-5){
              const tc=((c[0]-a[0])*rx+(c[1]-a[1])*ry)/(seg*seg),td=((d[0]-a[0])*rx+(d[1]-a[1])*ry)/(seg*seg);
              const lo=Math.max(0,Math.min(tc,td)),hi=Math.min(1,Math.max(tc,td));
              if(hi-lo>1e-10){
                const s0=base[i-1]+lo*seg,s1=base[i-1]+hi*seg;
                const at=t=>valid?z0+(z1-z0)*(t-tc)/(td-tc):NaN;
                spans.push([s0,s1,at(lo),at(hi)]);stations.push(s0,s1);
                continue;
              }
            }
            if(!valid)continue;
            const q=profSegInter(a,b,c,d);if(!q)continue;
            const s=base[i-1]+q[0]*seg;
            hit.push([s,z0+(z1-z0)*q[1]]);stations.push(s);
          }
        }
      });
    });
    hit.sort((a,b)=>a[0]-b[0]);spans.sort((a,b)=>a[0]-b[0]);
    const h=hit.filter((q,i)=>!i||Math.abs(q[0]-hit[i-1][0])>1e-7);
    // Mesmo com passo maior que a lacuna, o gráfico/DXF não pode fechar o vazio.
    let end=0;
    spans.forEach(p=>{if(p[0]>end+1e-7)stations.push((end+p[0])/2);
      if(!Number.isFinite(p[2])||!Number.isFinite(p[3]))stations.push((p[0]+p[1])/2);
      end=Math.max(end,p[1]);});
    if(spans.length&&end<total-1e-7)stations.push((end+total)/2);
    return {name:L.name,sourceKey:'L:'+L.id,h,spans};
  });
  stations.sort((a,b)=>a-b);
  const dist=stations.filter((s,i)=>!i||Math.abs(s-stations[i-1])>1e-7);
  const series=data.map(({name,sourceKey,h,spans})=>{
    let cursor=0;
    const z=dist.map(s=>{
      if(spans.length){
        while(cursor<spans.length&&spans[cursor][1]<s-1e-7)cursor++;
        let missingSpan=false;
        for(let i=cursor;i<spans.length&&spans[i][0]<=s+1e-7;i++){
          const p=spans[i];if(p[1]<s-1e-7)continue;
          if(!Number.isFinite(p[2])||!Number.isFinite(p[3])){missingSpan=true;continue;}
          return p[2]+(p[3]-p[2])*Math.max(0,Math.min(1,(s-p[0])/(p[1]-p[0])));
        }
        if(missingSpan)return NaN;
      }
      if(!h.length||s<h[0][0]-1e-7||s>h[h.length-1][0]+1e-7)return NaN;
      let lo=0,hi=h.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(h[m][0]<=s)lo=m;else hi=m;}
      if(h.length===1)return Math.abs(s-h[0][0])<=1e-7?h[0][1]:NaN;
      const A=h[lo],B=h[Math.min(lo+1,h.length-1)],t=(s-A[0])/((B[0]-A[0])||1);return A[1]+(B[1]-A[1])*t;
    });
    return{name,sourceKey,z,intersections:h.length,method:spans.length?(h.length?'mixed-vector':'native-vector'):'intersections'};
  });
  return{dist,total,series,source:'linhas'};
}
function profRenderVectorSources(){
  profReconcileSources();
  const box=document.getElementById('prVectorChosen');if(!box)return;
  const ids=new Set((S.prof.sourceLineIds||[]).map(String));
  S.prof.sourceLineIds=[...ids];
  box.innerHTML=S.prof.sourceLineIds.length?S.prof.sourceLineIds.map((id,i)=>{
    const L=S.layers.find(q=>String(q.id)===String(id));
    return `<span class="tag" style="display:inline-flex;align-items:center;gap:5px;max-width:100%"><span style="overflow:hidden;text-overflow:ellipsis">${i+1}. ${esc(L.name)}</span><button type="button" class="prSrcRemove" data-id="${esc(String(id))}" title="Remover esta fonte" style="border:0;background:none;color:inherit;cursor:pointer;padding:0">×</button></span>`;
  }).join(''):'<span class="hint">Sem fontes adicionais para comparação.</span>';
}
function profRenderRasterSources(){
  profReconcileSources();
  const box=document.getElementById('prRasterChosen');if(!box)return;
  S.prof.sourceRasterIds=[...new Set((S.prof.sourceRasterIds||[]).map(String))];
  box.innerHTML=S.prof.sourceRasterIds.length?S.prof.sourceRasterIds.map((id,i)=>{
    const r=S.rasters.find(r=>String(r.id)===id);
    return `<span class="tag" style="display:inline-flex;align-items:center;gap:5px;max-width:100%"><span style="overflow:hidden;text-overflow:ellipsis">${i+1}. ${esc(r.name)}</span><button type="button" class="prRasterRemove" data-id="${esc(id)}" title="Remover este MDT" style="border:0;background:none;color:inherit;cursor:pointer;padding:0">×</button></span>`;
  }).join(''):'<span class="hint">A superfície escolhida será utilizada. Use “Comparar” para manter mais de uma.</span>';
}
function profAxisOptions(){
  const out=[],layers=S.layers.filter(L=>L.gtype==='line'),counts=new Map();
  layers.forEach(L=>counts.set(L.name,(counts.get(L.name)||0)+1));
  const rawParts=f=>!Array.isArray(f?.geom)?[]:Array.isArray(f.geom[0]?.[0])?f.geom:[f.geom];
  const add=(layer,idx,partIdx,parts)=>{
    if(!parts[partIdx]||parts[partIdx].length<2)return;
    out.push({key:String(layer.id)+':'+idx+':'+partIdx,layer,idx,partIdx,
      name:layer.name+(counts.get(layer.name)>1?' · #'+layer.id:'')+(layer.features.length>1?' · feição '+(idx+1):'')+(parts.length>1?' · parte '+(partIdx+1):'')});
  };
  // A lista não precisa copiar cada vértice/cota de grandes bases de curvas.
  outer:for(const layer of layers)for(let idx=0;idx<(layer.features||[]).length;idx++){
    const parts=rawParts(layer.features[idx]);
    for(let partIdx=0;partIdx<parts.length;partIdx++){
      add(layer,idx,partIdx,parts);if(out.length>=1000)break outer;
    }
  }
  if(S.prof.axisPick&&!out.some(o=>o.key===S.prof.axisPick)){
    const key=String(S.prof.axisPick).split(':'),partIdx=+key.pop(),idx=+key.pop(),layer=layers.find(L=>String(L.id)===key.join(':'));
    if(layer&&Number.isInteger(idx)&&Number.isInteger(partIdx))add(layer,idx,partIdx,rawParts(layer.features[idx]));
  }
  return out;
}
function profRenderAxisChoices(){
  profReconcileSources();
  const select=document.getElementById('prAxisVectorSel');if(!select)return;
  const old=S.prof.axisPick??select.value,options=profAxisOptions();
  select.innerHTML='<option value="">— traçar no mapa ou usar a linha selecionada —</option>'+options.map(o=>'<option value="'+esc(o.key)+'">'+esc(o.name)+'</option>').join('');
  select.value=options.some(o=>o.key===old)?old:'';
}
function profDefaultVectorAxis(layer){
  if(S.prof.axisPick||S.prof.buf.length||S.selFeat||!layer||layer.features.length!==1)return;
  const parts=profVectorParts(layer.features[0]);
  if(parts.length===1&&parts[0].xy.length>=2){S.prof.axisPick=String(layer.id)+':0:'+parts[0].partIdx;profRenderAxisChoices();}
}
function profInvalidateResult(){
  S.prof.revision=(S.prof.revision||0)+1;
  S.prof.result=null;
  const cv=document.getElementById('profChart');if(cv)cv.style.display='none';
  const buttons=document.getElementById('prBtns');if(buttons)buttons.style.display='none';
  const styles=document.getElementById('prStyleBox');if(styles)styles.style.display='none';
  const out=document.getElementById('prOut');if(out)out.textContent='Fontes ou eixo alterados — clique em Gerar perfil.';
}
function profUpdateSourceMode(mode){
  mode=['vector','mixed'].includes(mode)?mode:'raster';S.prof.sourceMode=mode;
  const select=document.getElementById('prSourceMode');if(select)select.value=mode;
  for(const id of ['prRasWrap','prRasterSampling']){
    const e=document.getElementById(id);if(e)e.style.display=mode!=='vector'?'':'none';
  }
  const lines=document.getElementById('prLineWrap');if(lines)lines.style.display=mode!=='raster'?'':'none';
  const label=document.getElementById('prStepLabel');if(label)label.textContent=mode==='vector'
    ?'Passo adicional (m) — vértices e cotas originais são preservados'
    :'Passo de amostragem (m) — vazio = célula';
}
function profVectorAxisSelection(layers){
  const choice=document.getElementById('prAxisVectorSel')?.value;
  if(choice)return profAxisOptions().find(option=>option.key===choice)||null;
  const sel=S.selFeat;
  if(sel?.layer?.gtype==='line'&&(S.layers||[]).includes(sel.layer)){
    const parts=profVectorParts(sel.layer.features[sel.idx]);
    const part=Number.isInteger(sel.partIdx)?parts.find(p=>p.partIdx===sel.partIdx):parts.length===1?parts[0]:null;
    if(part?.xy.length>=2)return {...sel,partIdx:part.partIdx};
    return null;
  }
  if(layers.length===1&&layers[0].features.length===1){
    const parts=profVectorParts(layers[0].features[0]);
    if(parts.length===1&&parts[0].xy.length>=2&&parts[0].z.some(Number.isFinite))return {layer:layers[0],idx:0,partIdx:0};
  }
  return null;
}
function profUseVectorAxis(){
  const axis=profVectorAxisSelection(profSelectedLines());
  if(!axis){toast('Escolha o eixo na lista ou selecione no mapa a linha/parte desejada');return;}
  const part=profVectorParts(axis.layer.features[axis.idx]).find(p=>p.partIdx===axis.partIdx);
  const key=String(axis.layer.id)+':'+axis.idx+':'+axis.partIdx;
  resetProfile(false);S.prof.axisSelection={...axis,feature:axis.layer.features[axis.idx]};S.prof.axisPick=key;profRenderAxisChoices();
  S.prof.buf=part.xy.map(p=>{const w=toWGS(axis.layer.crs,p[0],p[1]);return [w[1],w[0]];});
  redrawProfPreview();toast('Eixo comum preparado — clique em Gerar perfil');
}
function refreshProfPanel(){
  profReconcileSources();
  const rs=document.getElementById('prRasterSel'),ls=document.getElementById('prVectorSel');
  if(!rs||!ls)return;
  const oldR=S.prof.rasterPick??rs.value,oldPick=S.prof.vectorPick??ls.value;
  rs.innerHTML='<option value="">— nenhuma —</option>'+S.rasters.filter(r=>r&&r.d).map(r=>
    `<option value="${esc(String(r.id))}">${esc(r.name)}${S.rasters.filter(x=>x.name===r.name).length>1?' · #'+esc(String(r.id)):''}</option>`).join('');
  if(oldR){
    rs.value=[...rs.options].some(o=>String(o.value)===String(oldR))?oldR:'';
  }else if(S.prof.rasterPick==null&&!(S.prof.sourceRasterIds||[]).length){
    const topo=S.rasters.find(r=>String(r.id)===String(S.topoRasterId))||S.rasters.find(r=>r===S.selRaster);
    rs.value=topo?String(topo.id):'';
  }
  const linhas=S.layers.filter(L=>L.gtype==='line'&&profLinhaTemZ(L));
  ls.innerHTML='<option value="">— escolha uma camada —</option>'+linhas.map(L=>
    `<option value="${esc(String(L.id))}">${esc(L.name)}${linhas.filter(x=>x.name===L.name).length>1?' · #'+esc(String(L.id)):''}</option>`).join('');
  if(oldPick){
    ls.value=[...ls.options].some(o=>String(o.value)===String(oldPick))?oldPick:'';
  }else ls.value='';
  ls.disabled=!linhas.length;
  if(S.prof.vectorPick==null&&!ls.value&&!(S.prof.sourceLineIds||[]).length){
    const active=linhas.find(L=>String(L.id)===String(S.selFeat?.layer?.id??S.activeId))||(linhas.length===1?linhas[0]:null);
    if(active)ls.value=String(active.id);
  }
  ls.title=linhas.length?'Escolha a fonte vetorial do perfil':'Nenhuma camada de linha com Z/cota';
  profRenderVectorSources();profRenderRasterSources();profRenderAxisChoices();
  profUpdateSourceMode(S.prof.sourceMode||(!S.rasters.length&&linhas.length?'vector':'raster'));
}
function redrawProfPreview(){
  S.drawLayer.clearLayers();
  if(S.prof.buf.length){
    L2.polyline(S.prof.buf,{pane:'alagis_desenho',interactive:false,color:'#ff5252',weight:2,dashArray:'6 4'}).addTo(S.drawLayer);
    const V=profRotulosVertices(null,S.prof.buf.length);
    S.prof.buf.forEach((p,i)=>L2.circleMarker(p,{pane:'alagis_desenho',interactive:false,radius:4,color:'#fff',fillColor:'#ff5252',fillOpacity:1})
      .bindTooltip(V[i]||'',{permanent:true,direction:'top',className:'prof-vert'})
      .addTo(S.drawLayer));
  }
}
function resetProfile(rearm){
  // limpa TUDO: traçado, resultado, gráfico e textos — e (opcional) rearma o traçado
  S.prof.buf=[]; S.prof.line=null; S.prof.result=null;S.prof.axisSelection=null;
  S.prof.revision=(S.prof.revision||0)+1;
  S.prof.axisPick='';const axisSelect=document.getElementById('prAxisVectorSel');if(axisSelect)axisSelect.value='';
  S.drawLayer.clearLayers();
  const cv=document.getElementById('profChart');
  if(cv){ const c=cv.getContext('2d'); c.clearRect(0,0,cv.width,cv.height); cv.style.display='none'; }
  document.getElementById('prOut').innerHTML='Nenhum perfil gerado.';
  document.getElementById('prBtns').style.display='none';
  const sb=document.getElementById('prStyleBox'),sl=document.getElementById('prStyleList');
  if(sb)sb.style.display='none';if(sl)sl.innerHTML='';
  S.prof.bishop=null;
  const bo=document.getElementById('bshOut'); if(bo) bo.innerHTML='Nenhuma análise executada.';
  if(typeof refreshBishopPanel==='function') refreshBishopPanel();
  if(rearm){
    setTool('profile');
    document.querySelectorAll('.mtool').forEach(b=>{ if(b.id!=='btnSnap'&&b.id!=='btnVertexGuides') b.classList.remove('on'); });
    map.getContainer().style.cursor='crosshair';
  } else {
    try{setTool('select');}catch(e){S.tool='select';map.getContainer().style.cursor='default';}
  }
}
function profResetProject(){
  // IDs e eixo são locais ao arquivo: não reutilizar uma seleção do anterior.
  try{resetProfile(false);}catch(e){}
  S.prof={buf:[],line:null,result:null,hist:[]};
  for(const id of ['prRasterSel','prVectorSel','prAxisVectorSel']){const el=document.getElementById(id);if(el){el.innerHTML='<option value="">— escolha uma fonte do projeto —</option>';el.value='';}}
  const name=document.getElementById('prName');if(name)name.value='A';
  profRenderRasterSources();profRenderVectorSources();
}
async function runProfile(){
  // Shortcuts such as the progressive line choose the DOM source directly.
  // Capture that choice before a panel refresh can restore the older pick.
  S.prof.rasterPick=document.getElementById('prRasterSel')?.value||'';
  S.prof.vectorPick=document.getElementById('prVectorSel')?.value||'';
  refreshProfPanel();
  profInvalidateResult();
  const profileState=S.prof,revision=S.prof.revision;
  const rs=profSelectedRasters(),ls=profSelectedLines();
  const missingR=profSourceMode()!=='vector'?(S.prof.sourceRasterIds||[]).concat(document.getElementById('prRasterSel')?.value||[]).filter(id=>!S.rasters.some(r=>String(r.id)===String(id))):[];
  const missingL=profSourceMode()!=='raster'?(S.prof.sourceLineIds||[]).concat(document.getElementById('prVectorSel')?.value||[]).filter(id=>!S.layers.some(L=>String(L.id)===String(id)&&profLinhaTemZ(L))):[];
  if(missingR.length||missingL.length){toast('Há fontes indisponíveis na comparação. Remova-as da lista ou carregue novamente as camadas.');return;}
  if(!rs.length&&!ls.length){toast('Selecione um raster ou ao menos uma camada vetorial 3D');return;}
  let ptsCRS=null,axisSelection=null;
  if(S.prof.buf.length>=2){
    ptsCRS=S.prof.buf.map(([lat,lng])=>{const c=fromWGS(S.workCRS,lng,lat);return[c[0],c[1]];});
    axisSelection=S.prof.axisSelection||null;
  } else {
    axisSelection=profVectorAxisSelection(ls);
    if(axisSelection){
      const part=profVectorParts(axisSelection.layer.features[axisSelection.idx]).find(p=>p.partIdx===axisSelection.partIdx);
      ptsCRS=part.xy.map(pt=>reproj(axisSelection.layer.crs,S.workCRS,pt[0],pt[1]));
    }
  }
  if(!ptsCRS||ptsCRS.length<2){toast('Trace o eixo do perfil ou selecione uma linha');return;}
  // grade: nativa (padrão, relê o TIFF se preciso) ou de trabalho (checkbox desmarcado).
  // O perfil é produto — na opção nativa não sai da grade reamostrada de tela;
  // se a fonte não estiver ao alcance, o app pede o arquivo em vez de suavizar calado.
  const usarNativo=(document.getElementById('prNativo')||{checked:true}).checked;
  const G=[];
  for(const r of rs){
    if(usarNativo){
      let g;
      try{g=await gridBruto(r, 'traçar o perfil', [ptsCRS]);}
      catch(e){toast('Não foi possível ler “'+r.name+'”: '+(e?.message||'erro na fonte raster'));return;}
      if(S.prof!==profileState||S.prof.revision!==revision||rs.some(source=>!(S.rasters||[]).includes(source))||ls.some(source=>!(S.layers||[]).includes(source))){toast('Fontes ou projeto alterados durante a leitura; gere novamente o perfil.');return;}
      if(!g){ toast('Perfil cancelado — sem a grade bruta de “'+r.name+'”'); return; }
      G.push(g);
    } else {
      G.push(r.d);                     // grade de trabalho (como está na tela)
    }
  }
  let step=+document.getElementById('prStep').value;
  if(!step||step<=0){step=G.length?Math.max(.5,Math.min(...G.map(g=>g.cs))):1;document.getElementById('prStep').value=step;}
  const VE=+document.getElementById('prVE').value||2;
  const mth=(document.getElementById('prMethod')||{}).value||'bilinear';
  let prof=null;
  const vectorProfile=ls.length?sampleProfileLines(ptsCRS,ls,step,axisSelection):null;
  if(!window.GeoMineLongitudinalComparison){toast('Módulo de comparação indisponível; atualize o aplicativo.');return;}
  prof=window.GeoMineLongitudinalComparison.sample({points:ptsCRS,
    rasters:rs.map((r,i)=>({id:r.id,name:r.name,d:G[i],_exactClipRings:r._exactClipRings,
      noData:r.noData??r.d?.noData,nodata:r.nodata??r.d?.nodata,_nd:r._nd??r.d?._nd,
      // srcCRS records the TIFF declaration, not a reprojection. The map
      // interprets untransformed raster extents in the project's work CRS.
      // Relinking native pixels must not silently move an existing surface.
      crs:G[i].crs||r.d?.crs||r.crs||S.workCRS})),
    vectorProfile,step,method:mth,workCRS:S.workCRS,reproject:reproj,sampleTin:typeof tinSampleZ==='function'?tinSampleZ:undefined});
  if(!prof){toast('Não foi possível gerar o perfil');return;}
  if(prof.effectiveStep)step=prof.effectiveStep;
  if(!prof.series.some(s=>s.z.some(Number.isFinite))){toast('O eixo não encontra cotas válidas nas fontes marcadas');return;}
  prof.nome=profNome();
  prof.vertices=ptsCRS.map(q=>[q[0],q[1]]);        // para rotular as quebras
  prof.vertDist=profDistVertices(ptsCRS);
  S.prof.result=prof; S.prof.line=ptsCRS;
  S.prof.hist=S.prof.hist||[];
  if(!S.prof.hist.includes(prof.nome)) S.prof.hist.push(prof.nome);
  const ve=drawProfChart(prof, VE);
  profAtualizaEditorEstilos(prof);
  const RT=profRotulos(prof.nome);
  const resTxt=G.map((g)=>{
    const cs=g.cs, csy=(g.csy&&Math.abs(g.csy-cs)>1e-4)? '×'+g.csy.toFixed(2) : '';
    return cs.toFixed(2)+csy+' m';
  }).join(', ');
  const gradeUsada = usarNativo ? 'nativa' : 'de trabalho (tela)';
  const _nv=(prof.vertDist||[]).length||2, _VL=profRotulosVertices(prof.nome,_nv);
  let out=`<b>${esc(profTituloVertices(prof.nome,_nv))}</b>`+
    (_nv>2? `\nVértices: <b>${_VL.join(' – ')}</b>`:'')+
    `\nExtensão: <b>${fmtLen(prof.total)}</b> · passo ${step} m · ${prof.dist.length} amostras`+
          (rs.length?` · raster em grade <b>${gradeUsada}</b> · resolução <b>${resTxt}</b> · amostragem <b>${mth==='near'?'crua':'bilinear'}</b>`:'')+
          (ls.length?` · <b>${ls.length} camada(s) vetorial(is) 3D</b>${rs.length?' · comparação com MDT':' · sem raster'} · vértices/interseções preservados`:'')+`\n`;
  if(rs.length&&usarNativo){
    const reduzidas=rs.filter((r,i)=>G[i]===r.d && (r.d.resampled>1 || r.d.native===false)).map(r=>r.name);
    if(reduzidas.length) out+=`<span style="color:var(--amber)">Sem o arquivo original de: ${reduzidas.map(esc).join(', ')} — usada a grade de trabalho (reduzida) nessas.</span>\n`;
  }
  rs.forEach((r,i)=>{
    const declared=G[i].srcCRS||r.d?.srcCRS||r.srcCRS,interpreted=G[i].crs||r.d?.crs||r.crs||S.workCRS;
    if(declared&&declared!==interpreted)out+=`<span style="color:var(--amber)">${esc(r.name)}: o GeoTIFF declara ${esc(declared)}, mas a superfície está interpretada em ${esc(interpreted)} no mapa. Perfil calculado nessa mesma referência. Confira o CRS do projeto antes de usar coordenadas de localização.</span>\n`;
  });
  // aviso: passo muito menor que a célula não cria detalhe — só interpola
  const csMin=G.length?Math.min(...G.map(g=>g.cs)):Infinity;
  if(rs.length&&step < csMin*0.5)
    out+=`<span style="color:var(--amber)">Passo (${step} m) menor que metade da célula (${csMin.toFixed(2)} m): os pontos extras são interpolação, não dado novo.</span>\n`;
  prof.series.forEach(sr=>{ let lo=Infinity,hi=-Infinity;for(const z of sr.z)if(Number.isFinite(z)){lo=Math.min(lo,z);hi=Math.max(hi,z);}
    if(Number.isFinite(lo)) out+=`${esc(sr.name)}: z <b>${lo.toFixed(1)}</b>–<b>${hi.toFixed(1)}</b> m · Δ ${(hi-lo).toFixed(1)} m${sr.method==='native-vector'?' · cotas da própria linha':sr.method==='intersections'?' · interpolação entre cruzamentos':sr.method==='mixed-vector'?' · cotas da linha e cruzamentos':''}\n`;
    else out+=`${esc(sr.name)}: fora da linha\n`; });
  document.getElementById('prOut').innerHTML=out;
  document.getElementById('prBtns').style.display='block';
  (function(){                                   // superfícies p/ o embasamento do GEO5
    const sf=document.getElementById('g5EmbSurf'); if(!sf||!prof||!prof.series) return;
    sf.innerHTML=prof.series.map(s=>'<option>'+esc(s.name)+'</option>').join('');
  })();
  profSalvaLinha(prof, ptsCRS);          // alinhamento vai para camada automaticamente
  S.prof.bishop=null; refreshBishopPanel();
  if(typeof drawBishopFig==='function') drawBishopFig();   // limpa a figura da ruptura
  // desarma a ferramenta: cliques no mapa não devem mais acrescentar vértices
  // ao traçado já processado (era isso que impedia gerar um segundo perfil)
  try{setTool('select');}catch(e){S.tool='select';map.getContainer().style.cursor='default';}
  toast('Perfil gerado — use “Traçar no mapa” ou “Limpar” para começar outro');
}
/* Salva o alinhamento do perfil como camada de linha, no padrão do app.
   Se já existir a camada daquele perfil (mesmo nome), ela é substituída —
   assim retraçar o perfil A não deixa vários "Perfil A – a" duplicados.     */
function profSalvaLinha(prof, ptsCRS){
  if(!ptsCRS||ptsCRS.length<2) return null;
  const RT=profRotulos(prof.nome);
  const V=profRotulosVertices(prof.nome, ptsCRS.length);
  const par=`${V[0]}-${V[V.length-1]}`;
  const nome=`Perfil ${par}`;
  const props={PERFIL:par, INICIO:V[0], FIM:V[V.length-1],
    VERTICES:V.join('-'),                       // ex.: A-B-C-D-E
    COMPR_M:+(prof.total||0).toFixed(1),
    Z_MIN:null, Z_MAX:null};
  let lo=Infinity,hi=-Infinity;
  prof.series.forEach(sr=>{for(const z of sr.z)if(Number.isFinite(z)){lo=Math.min(lo,z);hi=Math.max(hi,z);}});
  if(Number.isFinite(lo)){props.Z_MIN=+lo.toFixed(2);props.Z_MAX=+hi.toFixed(2);}
  const fields=[{name:'PERFIL',type:'C',length:20},{name:'INICIO',type:'C',length:5},
    {name:'FIM',type:'C',length:5},{name:'VERTICES',type:'C',length:60},
    {name:'COMPR_M',type:'N',length:12,decimal:1},
    {name:'Z_MIN',type:'N',length:12,decimal:2},{name:'Z_MAX',type:'N',length:12,decimal:2}];
  const feat={geom:ptsCRS.map(p=>[p[0],p[1]]), multi:false, props};
  const ja=S.layers.find(l=>l.name===nome && l.gtype==='line');
  if(ja){
    // Regenerating a profile may legitimately update its own saved axis.
    // Keep that reference current before reconciling the source lists.
    const axis=S.prof.axisSelection;
    if(axis?.layer===ja&&axis.idx===0&&axis.partIdx===0)axis.feature=feat;
    ja.features=[feat]; ja.fields=fields; drawLayer(ja); refreshUI();
    toast(`Alinhamento atualizado em “${nome}”`); return ja; }
  const L=addLayer({name:nome, gtype:'line', crs:S.workCRS, features:[feat], fields, color:'#ff5252'});
  if(L){ L.labelField='PERFIL'; try{ drawLayer(L); }catch(e){} }
  refreshUI();
  toast(`Alinhamento salvo em “${nome}”`);
  return L;
}
function bindProfPanel(){
  const sourceMode=document.getElementById('prSourceMode');if(sourceMode)sourceMode.onchange=()=>{profUpdateSourceMode(sourceMode.value);profInvalidateResult();};
  const axisSelect=document.getElementById('prAxisVectorSel');if(axisSelect)axisSelect.onchange=()=>{
    S.prof.axisPick=axisSelect.value;S.prof.axisSelection=null;S.prof.buf=[];S.prof.line=null;redrawProfPreview();profInvalidateResult();
  };
  const useAxis=document.getElementById('btnPrUseVectorAxis');if(useAxis)useAxis.onclick=profUseVectorAxis;
  { const add=document.getElementById('btnPrRasterAdd'),sel=document.getElementById('prRasterSel'),box=document.getElementById('prRasterChosen');
    if(sel)sel.onchange=()=>{S.prof.rasterPick=sel.value;profInvalidateResult();};
    if(add)add.onclick=()=>{const id=sel?.value;if(!id){toast('Escolha um MDT para comparar');return;}
      S.prof.sourceRasterIds=[...new Set([...(S.prof.sourceRasterIds||[]).map(String),String(id)])];
    profRenderRasterSources();sel.value='';S.prof.rasterPick='';profInvalidateResult();};
    if(box)box.onclick=e=>{const button=e.target.closest('.prRasterRemove');if(!button)return;
      S.prof.sourceRasterIds=(S.prof.sourceRasterIds||[]).filter(id=>String(id)!==String(button.dataset.id));
      if(sel.value===button.dataset.id)sel.value='';S.prof.rasterPick=sel.value;profRenderRasterSources();profInvalidateResult();}; }
  { const add=document.getElementById('btnPrVectorAdd'),sel=document.getElementById('prVectorSel'),box=document.getElementById('prVectorChosen');
    if(sel)sel.onchange=()=>{S.prof.vectorPick=sel.value;profInvalidateResult();};
    if(add)add.onclick=()=>{const id=sel&&sel.value;if(!id){toast('Escolha uma camada vetorial 3D');return;}
      const ids=new Set((S.prof.sourceLineIds||[]).map(String));ids.add(String(id));S.prof.sourceLineIds=[...ids];
      profDefaultVectorAxis(S.layers.find(L=>String(L.id)===String(id)));
      profRenderVectorSources();sel.value='';S.prof.vectorPick='';profInvalidateResult();};
    if(box)box.onclick=e=>{const b=e.target.closest('.prSrcRemove');if(!b)return;
      S.prof.sourceLineIds=(S.prof.sourceLineIds||[]).filter(id=>String(id)!==String(b.dataset.id));
      if(sel.value===b.dataset.id)sel.value='';S.prof.vectorPick=sel.value;profRenderVectorSources();profInvalidateResult();}; }
  document.getElementById('btnPrDraw').onclick=()=>{
    try{ refreshProfPanel(); }catch(e){}   // garante a lista de superfícies preenchida
    resetProfile(true);                 // zera perfil anterior E rearma o traçado
    if(window.matchMedia('(max-width:720px)').matches) document.getElementById('side').classList.remove('open');
    { const R=profRotulos(); toast(`Toque no mapa para os vértices do perfil (${R.a} → ${R.b}). Depois: Gerar perfil`); }
  };
  document.getElementById('btnPrClear').onclick=()=>{ resetProfile(false); toast('Perfil e traçado limpos'); };
  document.getElementById('btnPrRun').onclick=runProfile;
  document.getElementById('btnPrNext').onclick=()=>{
    document.getElementById('prName').value=profProximaLetra();
    redrawProfPreview();
    toast('Perfil '+document.getElementById('prName').value);
  };
  document.getElementById('prName').addEventListener('input',()=>{
    redrawProfPreview();                       // atualiza as pontas no mapa ao vivo
    const p=S.prof.result;
    if(p){ p.nome=profNome(); drawProfChart(p, +document.getElementById('prVE').value||2); }
  });
  document.getElementById('btnPrCSV').onclick=()=>{
    const p=S.prof.result; if(!p)return;
    let csv='dist_m;'+p.series.map(sr=>sr.name.replace(/;/g,',')).join(';')+'\n';
    p.dist.forEach((t,k)=>{ csv+=t.toFixed(1)+';'+p.series.map(sr=>isNaN(sr.z[k])?'':sr.z[k].toFixed(2)).join(';')+'\n'; });
    download(new Blob([csv],{type:'text/csv'}), 'perfil_'+profNome().replace(/[^\w-]+/g,'_')+'.csv');
  };
  document.getElementById('btnPrPNG').onclick=()=>{
    const cv=document.getElementById('profChart'); if(!cv||!cv.toBlob)return;
    cv.toBlob(b=>download(b,'perfil_'+profNome().replace(/[^\w-]+/g,'_')+'.png'),'image/png');
  };
  { const eb=document.getElementById('g5Emb'), ebx=document.getElementById('g5EmbBox');
    if(eb&&ebx) eb.onchange=()=>{ ebx.style.display=eb.checked?'block':'none'; };
    const em=document.getElementById('g5EmbModo');
    if(em) em.onchange=()=>{
      const v=em.value;
      const val=document.getElementById('g5EmbVal'), sf=document.getElementById('g5EmbSurf');
      if(val) val.style.display=(v==='surf')?'none':'block';
      if(sf){ sf.style.display=(v==='surf')?'block':'none';
        const pr=S.prof&&S.prof.result;
        sf.innerHTML=(pr&&pr.series||[]).map(s=>'<option>'+esc(s.name)+'</option>').join(''); } };
  }
  { const a=document.getElementById('btnPrDXF'); if(a) a.onclick=()=>profDXF(false);
    const b=document.getElementById('btnPrDXFG5'); if(b) b.onclick=()=>profDXF(true); }
  document.getElementById('btnPrSaveLine').onclick=()=>{
    if(!S.prof.line||S.prof.line.length<2){ toast('Sem traçado'); return; }
    const pr=S.prof.result||{nome:profNome(), total:0, series:[]};
    profSalvaLinha(pr, S.prof.line);
    refreshUI(); toast('Linha do perfil salva como camada');
  };
}

function dxfCab(){ return ['0','SECTION','2','ENTITIES']; }
function dxfFim(L){ L.push('0','ENDSEC','0','EOF'); return L.join('\n'); }
function dxfPoli(L, pts, layer, fechada, z){
  if(!pts || pts.length<2) return;
  L.push('0','POLYLINE','8',layer,'66','1','70', fechada?'1':'0');
  pts.forEach(p=>{
    L.push('0','VERTEX','8',layer,
      '10',(+p[0]).toFixed(4), '20',(+p[1]).toFixed(4), '30',(z==null?0:+z).toFixed(4));
  });
  L.push('0','SEQEND','8',layer);
}
function dxfLinha(L,x1,y1,x2,y2,layer){
  L.push('0','LINE','8',layer,'10',(+x1).toFixed(4),'20',(+y1).toFixed(4),'30','0.0',
         '11',(+x2).toFixed(4),'21',(+y2).toFixed(4),'31','0.0');
}
function dxfTexto(L,t,x,y,h,layer,alinha){
  L.push('0','TEXT','8',layer,'10',(+x).toFixed(4),'20',(+y).toFixed(4),'30','0.0',
         '40',(+h).toFixed(3),'1',String(t));
  if(alinha===1||alinha===2){ L.push('72',String(alinha),
    '11',(+x).toFixed(4),'21',(+y).toFixed(4),'31','0.0'); }
}
/* nome de camada aceito por CAD/GEO5: sem espaços nem acentos */
function dxfLayerNome(s,i){
  const base=String(s||'sup').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\w-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,24) || 'sup';
  return String(i+1).padStart(2,'0')+'_'+base;
}
/* quebra a série em trechos contínuos (sem NaN) — o GEO5 não aceita lacunas */
function profTrechos(dist, z){
  const out=[]; let cur=null;
  for(let i=0;i<z.length;i++){
    if(isFinite(z[i])){ if(!cur){ cur=[]; out.push(cur); } cur.push([dist[i], z[i]]); }
    else cur=null;
  }
  return out.filter(t=>t.length>=2);
}

function profDXF(paraGeo5){
  const prof=S.prof && S.prof.result;
  if(!prof || !prof.series || !prof.series.length){ toast('Gere o perfil primeiro'); return; }
  const RT=profRotulos(prof.nome);
  const L=dxfCab();

  // extensão em cota, para eixos e grade
  let zmin=Infinity, zmax=-Infinity;
  prof.series.forEach(s=>s.z.forEach(v=>{ if(isFinite(v)){ if(v<zmin)zmin=v; if(v>zmax)zmax=v; } }));
  if(!isFinite(zmin)){ toast('O perfil não tem cotas válidas'); return; }

  let nTre=0, nLac=0, nFec=0;
  const gv=(id,d)=>{ const e=document.getElementById(id); if(!e) return d;
    const v=parseFloat(String(e.value).replace(',','.')); return isFinite(v)? v : d; };
  const gc=(id,d)=>{ const e=document.getElementById(id); return e? e.checked : d; };

  if(paraGeo5 && gc('g5Fecha',true)){
    /* MODELO FECHADO — é assim que o GEO5 cria a região de solo:
       terreno no topo, verticais nas duas pontas e base horizontal, tudo numa
       polilinha FECHADA. Só as linhas soltas não bastam: sem o contorno o
       programa não tem como delimitar a área.                              */
    const terreno=prof.series[0];
    const t0=profTrechos(prof.dist, terreno.z);
    if(!t0.length){ toast('A superfície de topo não tem cotas'); return; }
    const topo=t0.reduce((a,b)=>b.length>a.length?b:a);   // trecho mais longo
    const baseModo=(document.getElementById('g5BaseModo')||{}).value||'prof';
    const zmn0=Math.min(...topo.map(p=>p[1]));
    const zbase = (baseModo==='cota') ? gv('g5BaseVal', zmn0-20)
                                      : zmn0 - Math.abs(gv('g5BaseVal',20));
    const xA=topo[0][0], xB=topo[topo.length-1][0];
    const contorno=[...topo, [xB,zbase], [xA,zbase]];
    dxfPoli(L, contorno, '01_contorno_modelo', true, 0);   // FECHADA
    nFec++;
    // a interface de topo também sai solta, para o GEO5 usar como terreno
    dxfPoli(L, topo, '02_terreno', false, 0); nTre++;

    // demais superfícies do perfil viram interfaces internas
    for(let i=1;i<prof.series.length;i++){
      const s=prof.series[i];
      const tr=profTrechos(prof.dist, s.z);
      if(tr.length>1) nLac+=tr.length-1;
      tr.forEach(t=>{ dxfPoli(L, t, dxfLayerNome(s.name, i+2), false, 0); nTre++; });
    }
    // embasamento opcional
    if(gc('g5Emb',false)){
      const modo=(document.getElementById('g5EmbModo')||{}).value||'prof';
      let emb=null;
      if(modo==='prof'){ const d=Math.abs(gv('g5EmbVal',10));
        emb=topo.map(p=>[p[0], p[1]-d]); }
      else if(modo==='cota'){ const z=gv('g5EmbVal',0);
        emb=[[xA,z],[xB,z]]; }
      else {
        const nm=(document.getElementById('g5EmbSurf')||{}).value;
        const sr=prof.series.find(s=>s.name===nm);
        if(sr){ const tr=profTrechos(prof.dist, sr.z);
          if(tr.length) emb=tr.reduce((a,b)=>b.length>a.length?b:a); }
      }
      if(emb && emb.length>=2){
        // não deixar o embasamento abaixo da base do modelo
        emb=emb.map(p=>[p[0], Math.max(p[1], zbase+0.01)]);
        dxfPoli(L, emb, '90_embasamento', false, 0); nTre++;
      }
    }
    zmin=Math.min(zmin, zbase);
  } else {
    prof.series.forEach((s,i)=>{
      const layer=dxfLayerNome(s.name,i);
      const trechos=profTrechos(prof.dist, s.z);
      if(trechos.length>1) nLac+=trechos.length-1;
      trechos.forEach(t=>{ dxfPoli(L, t, layer, false, 0); nTre++; });
    });
  }

  if(!paraGeo5){
    // ---- eixos, grade e rótulos (só no desenho) ----
    const X0=0, X1=prof.total;
    const passoZ = (zmax-zmin)>60? 10 : (zmax-zmin)>25? 5 : (zmax-zmin)>10? 2 : 1;
    const z0=Math.floor(zmin/passoZ)*passoZ, z1=Math.ceil(zmax/passoZ)*passoZ;
    const passoX = X1>800? 100 : X1>400? 50 : X1>150? 20 : 10;
    const h=Math.max(0.8, (z1-z0)*0.022);        // altura de texto proporcional
    for(let z=z0; z<=z1+1e-6; z+=passoZ){
      dxfLinha(L, X0, z, X1, z, 'GRADE');
      dxfTexto(L, z.toFixed(0), X0-2, z-h*0.35, h, 'COTAS', 2);
    }
    for(let d=0; d<=X1+1e-6; d+=passoX){
      dxfLinha(L, d, z0, d, z1, 'GRADE');
      dxfTexto(L, d.toFixed(0), d, z0-h*1.6, h, 'PROGRESSIVA', 1);
    }
    dxfLinha(L, X0, z0, X1, z0, 'EIXOS');
    dxfLinha(L, X0, z0, X0, z1, 'EIXOS');
    {
      const VD=Array.isArray(prof.vertDist)?prof.vertDist:[];
      const VL=profRotulosVertices(prof.nome, VD.length||2);
      if(VD.length>2){
        const tot=prof.total||VD[VD.length-1]||1;
        VD.forEach((dv,i)=>dxfTexto(L, VL[i], X0+(X1-X0)*(dv/tot), z1+h*0.6, h*1.6, 'ROTULOS', 1));
      }else{
        dxfTexto(L, RT.a, X0, z1+h*0.6, h*1.6, 'ROTULOS', 1);
        dxfTexto(L, RT.b, X1, z1+h*0.6, h*1.6, 'ROTULOS', 1);
      }
      dxfTexto(L, profTituloVertices(prof.nome, VD.length||2), (X0+X1)/2, z1+h*2.8, h*1.4, 'ROTULOS', 1);
    }
    prof.series.forEach((s,i)=>
      dxfTexto(L, s.name, X1+3, z1-i*h*1.5, h, 'LEGENDA', 0));
    dxfTexto(L, `extensao ${prof.total.toFixed(1)} m · passo ${(prof.dist[1]-prof.dist[0]).toFixed(1)} m`,
      X0, z0-h*3.4, h*0.85, 'LEGENDA', 0);
  }

  const _V=profRotulosVertices(prof.nome,(prof.vertDist||[]).length||2);
  const nome=`perfil_${_V[0]}-${_V[_V.length-1]}${paraGeo5?'_GEO5':''}.dxf`;
  download(new Blob([dxfFim(L)],{type:'application/dxf'}), nome);

  const aviso = nLac? ` · ${nLac} lacuna(s): a superfície ficou dividida em trechos` : '';
  toast(`⤓ ${nome} · ${nFec? 'contorno fechado + ':''}${nTre} polilinha(s)${aviso}`);
  if(paraGeo5 && nLac)
    setTimeout(()=>toast('⚠ O GEO5 espera interfaces contínuas — verifique as lacunas no CAD antes de importar'), 2600);
}

/* ---- grade do MDE <-> base64 (Float32) — para salvar o raster no projeto ---- */
/* Teto do que é GRAVADO no .ccmgis. Desde que o teto de desenho passou a
   acompanhar a memória do desktop, um raster nativo de 44 M células virava
   ~235 MB de base64 — o JSON estourava o limite de string do navegador e o
   salvamento falhava. A grade gravada volta a ser a de tela; a procedência
   (resampled/srcDims/src) fica registrada e os produtos releem o original. */
const SAVE_MAX_CELLS=12e6;
/* Estima o peso do projeto salvo para uma dada resolução-alvo (m/célula).
   Só os rasters dominam o tamanho; base64 ≈ 4 bytes/célula × 4/3. */
function estimaPesoMB(alvoCell){
  let cels=0;
  (S.rasters||[]).forEach(r=>{ const d=r.d; if(!d) return;
    let nc=d.nc, nr=d.nr;
    if(alvoCell && d.cs && alvoCell>d.cs*1.01){ const f=Math.max(1,Math.round(alvoCell/d.cs));
      nc=Math.floor(nc/f); nr=Math.floor(nr/f); }
    cels+=nc*nr; });
  return cels*4*4/3/1048576;   // MB aproximados só dos rasters
}
/* Diálogo: escolher a resolução com que os MDT vão para o arquivo salvo. */
function escolheResolucaoSalvar(noCel){
  return new Promise(resolve=>{
    // menor célula entre os rasters (a resolução nativa mais fina)
    const cells=(S.rasters||[]).map(r=>r.d&&r.d.cs).filter(v=>v>0);
    const csMin=cells.length?Math.min(...cells):1;
    const pesoNativo=estimaPesoMB(null);
    // opções de resolução: nativa, e múltiplos que aliviam o arquivo
    const alvos=[
      {cell:null, rot:'Nativa (máxima qualidade)'},
      {cell:Math.max(csMin,0.5), rot:'0,5 m'},
      {cell:Math.max(csMin,1),   rot:'1 m'},
      {cell:Math.max(csMin,2),   rot:'2 m'},
      {cell:Math.max(csMin,5),   rot:'5 m'},
    ];
    // remove alvos redundantes (célula ≤ nativa) e duplicados
    const vistos=new Set(); const opts=[];
    for(const a of alvos){
      const key=a.cell==null?'nat':a.cell.toFixed(2);
      if(vistos.has(key)) continue;
      if(a.cell!=null && a.cell<=csMin*1.01 && key!=='nat') continue;
      vistos.add(key); opts.push(a);
    }
    const bg=document.createElement('div'); bg.className='modal-bg on';
    const linhas=opts.map((a,i)=>{
      const mb=estimaPesoMB(a.cell);
      const risco = mb>380? 'style="color:#e5534b"' : (mb>200?'style="color:var(--amber)"':'');
      const rec = noCel
        ? (a.cell && mb<=60 ? ' · recomendado p/ celular' : '')
        : ((!a.cell && mb<=380) ? ' · recomendado' : '');
      return `<label class="loel" style="display:flex;align-items:center;gap:10px;padding:9px 11px;
        border:1px solid var(--line);border-radius:8px;margin:5px 0;cursor:pointer">
        <input type="radio" name="resSalvar" value="${i}" style="accent-color:var(--amber)">
        <div style="flex:1"><b>${a.rot}</b>${rec}</div>
        <div ${risco} style="font-family:var(--mono);font-size:12px">~${mb.toFixed(0)} MB</div></label>`;
    }).join('');
    // rádio inicial: no celular, a menor resolução que caiba num arquivo leve
    let idxIni=0;
    if(noCel){ for(let i=0;i<opts.length;i++){ if(estimaPesoMB(opts[i].cell)<=60){ idxIni=i; break; } }
      if(idxIni===0 && opts.length>1) idxIni=Math.min(2,opts.length-1); }
    bg.innerHTML=`<div class="modal" style="width:min(460px,100%)">
      <div class="modal-h"><b>Resolução das superfícies ao salvar</b><div style="flex:1"></div>
        <span class="gset" id="resX" style="font-size:16px;cursor:pointer">✕</span></div>
      <div class="modal-b">
        <div class="hint" style="margin-bottom:8px">${noCel
          ? 'No <b>celular/tablet</b>, projetos grandes podem exigir muita memória durante o salvamento. '+
            'Reduza a resolução das superfícies para um arquivo leve — os rasters na tela <b>não</b> mudam, '+
            'e o perfil/volume relê o TIFF original quando precisar de precisão.'
          : 'O peso do projeto vem dos MDT. O navegador grava com segurança até <b>~380 MB</b>. '+
            'Escolha a resolução com que as superfícies vão para o arquivo — os rasters na tela <b>não</b> mudam.'}</div>
        ${linhas}
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="tbtn" id="resCancel" style="flex:1;justify-content:center">Cancelar</button>
          <button class="tbtn" id="resOk" style="flex:1;justify-content:center;background:var(--amber);color:#1a1206;font-weight:600">Salvar</button>
        </div>
      </div></div>`;
    document.body.appendChild(bg);
    { const rs=bg.querySelectorAll('input[name="resSalvar"]'); if(rs[idxIni]) rs[idxIni].checked=true; }
    const fim=(val)=>{ bg.remove(); resolve(val); };
    bg.querySelector('#resX').onclick=()=>fim(false);
    bg.querySelector('#resCancel').onclick=()=>fim(false);
    bg.addEventListener('click',e=>{ if(e.target===bg) fim(false); });
    bg.querySelector('#resOk').onclick=()=>{
      const i=+bg.querySelector('input[name="resSalvar"]:checked').value;
      fim(opts[i].cell);   // null = nativa
    };
  });
}
function f32ToB64(a){
  const u=new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  if(typeof u.toBase64==='function')return u.toBase64();
  let bin=''; for(let i=0;i<u.length;i+=8192) bin+=String.fromCharCode.apply(null,u.subarray(i,i+8192));
  return btoa(bin);
}
/* devolve a grade a gravar: reduz por média de bloco acima do teto */
function gradeParaSalvar(d){
  if(!d) return d;
  // resolução-alvo escolhida no diálogo de salvamento (metros por célula):
  // reduz cada MDT para ~esse tamanho de célula, aliviando o arquivo salvo.
  if(S._saveTargetCell && d.cs && S._saveTargetCell > d.cs*1.01){
    try{
      const f=Math.max(1, Math.round(S._saveTargetCell/d.cs));
      if(f>1){
        const gg=reduceGridFactor(d, f);          // média de blocos f×f
        gg.resampled=(d.resampled||1)*f;          // marca que NÃO é mais o bruto…
        gg.srcDims=d.srcDims||[d.nc,d.nr];         // …e guarda as dimensões nativas
        gg.native=false;                           // some com a marca de nativo:
        // assim, ao reabrir e gerar um perfil, precisaFonte() detecta resampled>1
        // e o app OFERECE buscar o GeoTIFF original (dado bruto) em vez de suavizar.
        if(typeof cmdLog==='function')
          cmdLog(`“salvar” reduziu ${d.nc}×${d.nr} (${d.cs.toFixed(2)} m) → ${gg.nc}×${gg.nr} (${gg.cs.toFixed(2)} m) · perfil pedirá o TIFF original`,'info');
        return gg;
      }
    }catch(e){}
  }
  if(d.nc*d.nr<=SAVE_MAX_CELLS) return d;
  try{
    const g=reduceGrid(d, SAVE_MAX_CELLS, 16000);
    if(g!==d){
      g.resampled=(d.resampled||1)*Math.round(d.nc/g.nc);
      g.srcDims=d.srcDims||[d.nc,d.nr];
      g.native=false;
      if(typeof cmdLog==='function')
        cmdLog(`grade gravada reduzida: ${d.nc}×${d.nr} → ${g.nc}×${g.nr} (limite do arquivo)`,'avisa');
    }
    return g;
  }catch(e){ return d; }
}
/* redução por FATOR inteiro exato (média de blocos f×f) — para a resolução-alvo */
function reduceGridFactor(g, f){
  f=Math.max(1,Math.round(f)); if(f<=1) return g;
  const nc=Math.max(2,Math.floor(g.nc/f)), nr=Math.max(2,Math.floor(g.nr/f));
  const z=new Float32Array(nc*nr);
  for(let r=0;r<nr;r++) for(let c=0;c<nc;c++){
    let sv=0,n=0;
    for(let sr=r*f; sr<Math.min(g.nr,(r+1)*f); sr++)
      for(let sc=c*f; sc<Math.min(g.nc,(c+1)*f); sc++){
        const v=g.z[sr*g.nc+sc]; if(!isNaN(v)){ sv+=v; n++; } }
    z[r*nc+c]= n? sv/n : NaN;
  }
  return {nc,nr,cs:g.cs*f, csy:(g.csy?g.csy*f:undefined), xll:g.xll,yll:g.yll,z};
}
function b64ToF32(b64){
  if(typeof Uint8Array.fromBase64==='function'){
    const u=Uint8Array.fromBase64(b64);if(u.byteLength%4)throw new RangeError('Grade Float32 incompleta.');return new Float32Array(u.buffer,u.byteOffset,u.byteLength/4);
  }
  const bin=atob(b64); const u=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
  return new Float32Array(u.buffer);
}

function b64ToU32(b64){
  if(typeof Uint8Array.fromBase64==='function'){
    const u=Uint8Array.fromBase64(b64);if(u.byteLength%4)throw new RangeError('Índices Uint32 incompletos.');return new Uint32Array(u.buffer,u.byteOffset,u.byteLength/4);
  }
  const bin=atob(b64), u=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  return new Uint32Array(u.buffer);
}
/* Triângulos que SOBREVIVEM ao filtro de aresta/recorte — é isso que se salva,
   assim o projeto reabre sem precisar reaplicar maxEdge/clip. */
function tinTriFiltrados(T){
  const I=T._idx||tinIndexBuild(T);
  const usados=new Set();
  (I.cells||[]).forEach(l=>{ if(l)l.forEach(t=>usados.add(t)); });
  const out=new Uint32Array(usados.size*3); let k=0;
  usados.forEach(t=>{ out[k++]=T.tri[3*t]; out[k++]=T.tri[3*t+1]; out[k++]=T.tri[3*t+2]; });
  return out;
}
