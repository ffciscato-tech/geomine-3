/* Contato da Cava 2 com o MDT. Não completa arcos, não extrapola a cava e
   não reamostra o raster. Os triângulos de projeto são subdivididos até a
   célula do terreno; cada cruzamento é resolvido na amostra do próprio MDT. */
(function(root){
'use strict';
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
  for(const q of input){let ring=clean(q.ring);if(ring.length<3||!Number.isFinite(+q.z))continue;
    if(rings.length)ring=align(rings.at(-1).ring,ring);rings.push({ring,z:+q.z});}
  if(rings.length<2&&!options.triangles?.length)return [];
  const emit=typeof options.onPolygon==='function'?options.onPolygon:null,
    keep=p=>options.keepAbove?p[3]>=-epsZ:p[3]<=epsZ;
  const vertex=(x,y,z)=>[x,y,z,z-sample(g,x,y)],mid=(a,b)=>vertex((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);
  const cross=(a,b)=>{
    if(!Number.isFinite(a[3])||!Number.isFinite(b[3]))return null;
    if(Math.abs(a[3])<=epsZ)return a.slice(0,3);if(Math.abs(b[3])<=epsZ)return b.slice(0,3);
    if(a[3]*b[3]>=0)return null;
    let lo=a,hi=b;
    for(let k=0;k<40;k++){const m=mid(lo,hi);if(!Number.isFinite(m[3]))return null;
      if(Math.abs(m[3])<=epsZ||Math.hypot(lo[0]-hi[0],lo[1]-hi[1])<tol*.05)return m.slice(0,3);
      if((m[3]<0)===(lo[3]<0))lo=m;else hi=m;}
    return mid(lo,hi).slice(0,3);
  };
  // Limites conservadores por blocos de células: pula apenas triângulos
  // inteiramente acima/abaixo de TODAS as cotas da sua caixa. Isso mantém
  // depressões internas e reduz o custo durante o arraste das bermas.
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
    for(let r=Math.floor(r0/tileSize);r<=Math.floor(r1/tileSize);r++)for(let c=Math.floor(c0/tileSize);c<=Math.floor(c1/tileSize);c++){
      const key=r+','+c;let v=tiles.get(key);
      if(!v){v=[Infinity,-Infinity,true];for(let j=r*tileSize;j<Math.min(g.nr,(r+1)*tileSize);j++)for(let i=c*tileSize;i<Math.min(g.nc,(c+1)*tileSize);i++){
        const z=g.z[j*g.nc+i];if(Number.isFinite(z)){v[0]=Math.min(v[0],z);v[1]=Math.max(v[1],z);}else v[2]=false;}
        tiles.set(key,v);}
      min=Math.min(min,v[0]);max=Math.max(max,v[1]);valid=valid&&v[2];}
    return [min,max,valid];
  };
  let visited=0;
  const triangle=(a,b,c,depth=0,part='surface')=>{
    visited++;const r=range(a,b,c);
    if(r){
      if(r[0]===Infinity)return;
      const below=Math.max(a[2],b[2],c[2])<r[0]-epsZ,above=Math.min(a[2],b[2],c[2])>r[1]+epsZ;
      if(below||above){
        if(!emit)return;
        if(options.keepAbove?below:above)return;
        if(r[2]){emit([a,b,c].map(p=>p.slice(0,3)),part);return;}
      }
    }
    const ab=Math.hypot(a[0]-b[0],a[1]-b[1]),bc=Math.hypot(b[0]-c[0],b[1]-c[1]),ca=Math.hypot(c[0]-a[0],c[1]-a[1]);
    if(Math.max(ab,bc,ca)>step&&depth<48){
      if(ab>=bc&&ab>=ca){const m=mid(a,b);triangle(a,m,c,depth+1,part);triangle(m,b,c,depth+1,part);}
      else if(bc>=ca){const m=mid(b,c);triangle(a,b,m,depth+1,part);triangle(a,m,c,depth+1,part);}
      else{const m=mid(c,a);triangle(a,b,m,depth+1,part);triangle(m,b,c,depth+1,part);}return;
    }
    // Não cruza vazios do MDT nem cria uma borda falsa na fronteira NoData.
    if(![a,b,c].every(p=>Number.isFinite(p[3])))return;
    if(emit){
      const p=[a,b,c],clipped=[];
      for(let i=0;i<3;i++){const u=p[i],v=p[(i+1)%3],iu=keep(u),iv=keep(v);
        if(iu)clipped.push(u.slice(0,3));if(iu!==iv){const q=cross(u,v);if(q)clipped.push(q);}}
      if(clipped.length>=3)emit(clipped,part);
    }
    if([a,b,c].every(p=>Math.abs(p[3])<=epsZ))return; // superfícies coincidentes não definem uma linha única
    const points=[];
    for(const p of [cross(a,b),cross(b,c),cross(c,a)])if(p&&!points.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<=tol))points.push(p);
    if(points.length===2&&Math.hypot(points[0][0]-points[1][0],points[0][1]-points[1][1])>tol)segments.push(points);
  };
  for(let k=0;k<rings.length-1;k++){
    const A=prep(rings[k].ring),B=prep(rings[k+1].ring),us=[...new Set(A.cum.concat(B.cum).map(v=>+v.toFixed(12)))].sort((a,b)=>a-b);
    for(let i=1;i<us.length;i++){
      const a0=at(A,us[i-1]),a1=at(A,us[i]),b0=at(B,us[i-1]),b1=at(B,us[i]),
        va=vertex(...a0,rings[k].z),vb=vertex(...a1,rings[k].z),vc=vertex(...b0,rings[k+1].z),vd=vertex(...b1,rings[k+1].z);
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
  if(options.stats)Object.assign(options.stats,{visited,segments:segments.length,components:out.length,cell,tiles:tiles.size});
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
  let volume=0,validCells=0;
  if(options.terrain){
    const sample=options.sample||root.sampleZbil;
    for(let row=0;row<nr;row++){
      for(let col=0;col<nc;col++){
        const i=row*nc+col;if(!Number.isFinite(z[i]))continue;
        const t=sample(options.terrain,xll+(col+.5)*cs,north-(row+.5)*cs),eps=Math.max(1e-4,Math.abs(t)*1e-7);
        if(!Number.isFinite(t)||(options.keepAbove?z[i]<t-eps:z[i]>t+eps))z[i]=NaN;
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
root.GeoMineCavaTerrain={intersect,clipPolygon,mergePolygons,rasterize};
})(typeof window==='object'?window:globalThis);
