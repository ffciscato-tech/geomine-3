/* Native-grid least-cost drainage. Elevations are never filled or carved.
   Process from known boundary outlets toward the interior in elevation order;
   unresolved pits use the discovery path, while downhill cells use D8 slopes.
   A point query expands its native window until the upstream mask is interior
   and unchanged in a larger window. Never return a clipped, unstable basin.

   GRADE-GUIA (options.guide). As bordas da janela funcionam como saídas
   falsas: uma depressão grande a montante (uma cava) cortada pela borda escoa
   para a borda em vez de transbordar para o exutório, e a máscara fica
   "interna e estável" em duas janelas seguidas faltando a cava e tudo o que
   drena para ela (caso de 14/11/2026: num terreno de teste, 88% da bacia de
   fora, sem aviso). Uma grade mais grossa do mesmo MDT, roteada INTEIRA
   (routeGuide), enxerga a cava toda. Quando a regra de sempre aceita uma
   bacia, a grade-guia diz o que mais drena para dentro dela; se isso passa da
   janela, a janela é ampliada para conter essa área e o cálculo nativo é
   refeito. A grade-guia só indica ONDE olhar: o resultado continua vindo das
   cotas nativas. Sem guia, ou quando ela não aponta nada fora da janela, o
   resultado é exatamente o de antes; e a janela ampliada contém a anterior,
   então a bacia nunca sai menor do que saía. */
(function(root){
'use strict';
const N=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
const abort=()=>Object.assign(Error('Cálculo cancelado.'),{name:'AbortError'});
async function routeWindow(source,window,options={}){
  const [left,top,right,bottom]=window,W=right-left,H=bottom-top,total=W*H,cs=source.cs,cy=source.csy||cs,
    maxBytes=(options.maxMemoryMB||96)*1048576,cellBytes=source.float32?4:8;
  // code:'memory' deixa o chamador repetir a análise numa grade agregada.
  if(total*(cellBytes+1.125)>maxBytes*.83)throw Object.assign(Error('A bacia ainda exige uma área maior de análise na resolução nativa. A memória disponível não permite concluí-la neste aparelho; nenhum resultado parcial foi salvo.'),{code:'memory',window});
  const z=source.float32?new Float32Array(total):new Float64Array(total),state=new Uint8Array(total),
    weight=N.map(([x,y])=>1/Math.hypot(x*cs,y*cy));
  let last=Date.now(),lastProgress=0,processed=0,valid=0,heap=new Uint32Array(4096),size=0,peak=0;
  const check=()=>{if(options.signal?.aborted||source.isCurrent&&source.isCurrent()===false)throw abort();};
  const pause=async(phase,extra={})=>{check();const now=Date.now();if(now-lastProgress>100){lastProgress=now;options.onProgress?.({phase,processed,total,...extra});}
    if(now-last>12){await new Promise(r=>setTimeout(r,0));last=Date.now();check();}};
  const less=(a,b)=>z[a]<z[b]||(z[a]===z[b]&&a<b);
  function push(i){
    if(size===heap.length){const capacity=heap.length*2;if(total*(cellBytes+1.125)+capacity*4+heap.byteLength>maxBytes)throw Object.assign(Error('A continuidade do escoamento excedeu a memória disponível. Nenhuma área parcial foi salva.'),{code:'memory',window});const next=new Uint32Array(capacity);next.set(heap);heap=next;}
    let p=size++;while(p){const parent=(p-1)>>1;if(!less(i,heap[parent]))break;heap[p]=heap[parent];p=parent;}heap[p]=i;peak=Math.max(peak,size);
  }
  function pop(){const first=heap[0],v=heap[--size];let p=0;while(p*2+1<size){let c=p*2+1;if(c+1<size&&less(heap[c+1],heap[c]))c++;if(!less(heap[c],v))break;heap[p]=heap[c];p=c;}if(size)heap[p]=v;return first;}
  // Narrow native windows also keep uncompressed scanline TIFFs below mobile
  // decoder budgets. No width/height request or overview is permitted.
  for(let y=top;y<bottom;y+=32)for(let x=left;x<right;x+=4096){
    const x1=Math.min(right,x+4096),y1=Math.min(bottom,y+32),values=await source.readWindow([x,y,x1,y1]);check();
    if(values.length!==(x1-x)*(y1-y))throw Error('Bloco incompleto do MDT original.');
    for(let r=y;r<y1;r++)for(let c=x;c<x1;c++){
      const v=values[(r-y)*(x1-x)+c-x],i=(r-top)*W+c-left;
      if(Number.isFinite(v)&&(source.noData==null||v!==source.noData)){
        if(source.float32&&Math.fround(v)!==v)throw Error('A precisão das cotas não corresponde à fonte Float32.');z[i]=v;valid++;
      }else{z[i]=NaN;state[i]=73;}
    }
    await pause('read',{readRows:y-top});
  }
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const i=y*W+x;if(state[i]&64)continue;
      let edge=x===0||y===0||x===W-1||y===H-1;
      if(!edge)for(const [dx,dy]of N)if((state[(y+dy)*W+x+dx]&15)===9){edge=true;break;}
      if(edge){state[i]=32;push(i);}
    }
    if((y&31)===0)await pause('outlets');
  }
  while(size){
    const i=pop(),x=i%W,y=Math.floor(i/W),v=z[i];state[i]|=64;processed++;
    let best=0,dir=state[i]&15;
    // Only processed receivers are eligible, so even routed depressions form
    // an acyclic graph. On ordinary slopes this is exactly steepest-descent D8.
    for(let j=0;j<8;j++){
      const [dx,dy]=N[j],a=x+dx,b=y+dy;if(a<0||b<0||a>=W||b>=H)continue;
      const k=b*W+a;if((state[k]&15)===9)continue;
      if(state[k]&64){const slope=(v-z[k])*weight[j];if(slope>best){best=slope;dir=j+1;}}
    }
    state[i]=(state[i]&~15)|dir;
    for(let j=0;j<8;j++){
      const [dx,dy]=N[j],a=x+dx,b=y+dy;if(a<0||b<0||a>=W||b>=H)continue;
      const k=b*W+a;if(state[k]&(32|64))continue;
      state[k]=32+((j+4)%8+1);push(k);
    }
    if((processed&16383)===0)await pause('routing');
  }
  check();
  if(options.routingOnly&&!options.seed)return {window,W,H,state};
  const seed=options.seed,x=seed.col-left,y=seed.row-top,start=y*W+x;
  if(x<0||y<0||x>=W||y>=H||(state[start]&15)===9)throw Error('O ponto está fora da área válida do MDT original.');
  if(options.routingOnly)return {window,W,H,state,start};
  const seedZ=z[start],queue=new Uint32Array(z.buffer,0,total),mask=new Uint8Array(Math.ceil(total/8));
  let a=0,b=1,edge=false,noData=false,crop=false,sides=0,hash1=0,hash2=0,bounds=[x,y,x,y];queue[0]=start;mask[start>>3]|=1<<(start&7);
  while(a<b){
    const i=queue[a++],x=i%W,y=Math.floor(i/W),gx=x+left,gy=y+top,k=gy*source.nc+gx;
    hash1=(hash1+Math.imul(k^0x9e3779b9,0x85ebca6b))>>>0;hash2=(hash2^Math.imul(k^k>>>16,0xc2b2ae35))>>>0;
    edge=edge||gx===0||gy===0||gx===source.nc-1||gy===source.nr-1;
    // lados da janela em que a máscara encosta: 1 esquerda, 2 cima, 4 direita, 8 baixo
    if(left>0&&x<=1)sides|=1;if(top>0&&y<=1)sides|=2;if(right<source.nc&&x>=W-2)sides|=4;if(bottom<source.nr&&y>=H-2)sides|=8;
    bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);
    for(let j=0;j<8;j++){
      const [dx,dy]=N[j],xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;
      const n=yy*W+xx,d=state[n]&15;if(d===9){noData=true;continue;}
      if(d!==((j+4)%8+1)||(mask[n>>3]&(1<<(n&7))))continue;
      mask[n>>3]|=1<<(n&7);queue[b++]=n;
    }
    if((a&16383)===0)await pause('upstream',{cells:b});
  }
  crop=sides!==0;
  return {window,W,H,mask,cells:b,seedZ,hash:hash1+':'+hash2,crop,cropSides:sides,touchesEdge:edge,touchesNoData:noData,bounds,valid,
    memoryBytes:total*(cellBytes+1)+mask.byteLength+heap.byteLength,heapPeak:peak};
}
/* Contorno e área de uma máscara de células já delimitada numa janela. */
async function contour(source,w,r,seed,options,extra){
  const g={...source,nc:r.W,nr:r.H,xll:source.xll+w[0]*source.cs,yll:source.yll+(source.nr-w[3])*(source.csy||source.cs)},
    c=root.GeoMineNativeFloodEngine.createCellMask(g,options);
  try{
    for(let y=r.bounds[1];y<=r.bounds[3];y++){
      for(let x=r.bounds[0];x<=r.bounds[2];x++){const i=y*r.W+x;if(r.mask[i>>3]&(1<<(i&7))){const p=c.address(x,y,true);c.setBit(c.mask(p.tile,'wet'),p.index);}}
      if((y&31)===0)await c.checkpoint();
    }
    c.progress('contour',{cells:r.cells},true);const geometry=await root.GeoMineNativeFloodEngine.traceCellMask(c);c.abort();
    return {...geometry,cells:r.cells,areaM2:r.cells*c.areaCell,seed:{...seed},seedZ:r.seedZ,
      outlet:[source.xll+(seed.col+.5)*source.cs,source.yll+(source.nr-seed.row-.5)*(source.csy||source.cs)],
      nativeResolution:true,filled:false,continuous:true,stable:true,...extra,window:w,
      touchesEdge:r.touchesEdge,touchesNoData:r.touchesNoData,resolution:{x:c.cs*c.unitScale,y:c.csy*c.unitScale},memoryPeakBytes:r.memoryBytes+c.stats.memoryPeakBytes};
  }finally{c.dispose();}
}
async function analyze(source,options={}){
  if(!Number.isSafeInteger(source.nc)||source.nc<1||!Number.isSafeInteger(source.nr)||source.nr<1||
    ![source.cs,source.csy??source.cs,source.unitScale??1].every(v=>Number.isFinite(v)&&v>0)||
    ![source.xll,source.yll].every(Number.isFinite))throw Error('Georreferenciamento do MDT inválido.');
  const seed=options.seed;if(!seed||!Number.isInteger(seed.col)||!Number.isInteger(seed.row)||seed.col<0||seed.row<0||seed.col>=source.nc||seed.row>=source.nr)throw Error('O ponto está fora do MDT.');
  const radius=Math.max(64,Math.ceil((options.initialRadiusM||64)/Math.min(source.cs,source.csy||source.cs)/(source.unitScale||1))),
    guide=usableGuide(source,options.guide),area=(source.unitScale||1)**2;
  /* Extensão da janela a partir do exutório: esquerda, cima, direita, baixo.
     É o quadrado de sempre, crescendo igual nos quatro lados (1,5× enquanto a
     máscara encosta na borda; 1,25× para conferir), até a grade-guia pedir
     mais área. Daí em diante a janela só cresce nos lados necessários. */
  let ext=[radius,radius,radius,radius],previous=null,round=0,extended=false,accepted=null,interior=null,info=null;
  /* O que a guia fez, para quem chama poder dizer à pessoa: extended = a janela
     foi ampliada por ela; gainedM2 = quanto a bacia cresceu com isso; areaM2 =
     área que, na guia, drena para a bacia encontrada; unverified = a janela que
     ela pediu não coube na memória. */
  const report=(cells,extra={})=>guide?{guide:{resolution:{x:guide.cs*(source.unitScale||1),y:guide.csy*(source.unitScale||1)},extended,
    gainedM2:accepted?(cells-accepted.r.cells)*source.cs*(source.csy||source.cs)*area:0,
    areaM2:info?info.cells*guide.cs*guide.csy*area:null,...extra}}:{};
  for(;;){
    const w=[Math.max(0,seed.col-ext[0]),Math.max(0,seed.row-ext[1]),Math.min(source.nc,seed.col+ext[2]+1),Math.min(source.nr,seed.row+ext[3]+1)],full=w[0]===0&&w[1]===0&&w[2]===source.nc&&w[3]===source.nr;
    let r;
    try{r=await routeWindow(source,w,{...options,onProgress:p=>options.onProgress?.({...p,round,window:w,guided:extended})});}
    catch(e){
      /* A janela pedida pela grade-guia (ou a rodada de conferência dela) não
         coube na memória. Fica a maior bacia já obtida inteira dentro de uma
         janela: a da janela ampliada, se houve; senão a que a regra de sempre
         já tinha aceitado — com o aviso de que a guia indica mais área. */
      if(e.code!=='memory'&&!(e instanceof RangeError)||!extended)throw e;
      const keep=interior||accepted;
      return contour(source,keep.w,keep.r,seed,options,{rounds:round,...report(keep.r.cells,{unverified:true}),...(keep===accepted?{}:{stable:false})});
    }
    const stable=previous&&previous.cells===r.cells&&previous.hash===r.hash;
    if(!r.crop&&(full||stable)){
      const need=guide&&!full?guideNeed(source,guide,w,r,seed):null;
      if(need)info=need;
      // A guia aponta área que drena para esta bacia e passa da janela: amplia e refaz.
      const m=need?Math.ceil(2*Math.max(guide.cs/source.cs,guide.csy/(source.csy||source.cs))):0,
        wide=need&&[seed.col-(need.rect[0]-m),seed.row-(need.rect[1]-m),need.rect[2]+m-1-seed.col,need.rect[3]+m-1-seed.row],
        beyond=need&&((need.rect[0]<w[0]+2&&w[0]>0)||(need.rect[1]<w[1]+2&&w[1]>0)||(need.rect[2]>w[2]-2&&w[2]<source.nc)||(need.rect[3]>w[3]-2&&w[3]<source.nr));
      if(!beyond)return contour(source,w,r,seed,options,{rounds:round+1,...report(r.cells)});
      if(!extended)accepted={w,r};else interior={w,r};
      extended=true;previous=null;round++;ext=ext.map((v,i)=>Math.max(v,wide[i]));
      options.onProgress?.({phase:'guide',round,cells:r.cells});
      await new Promise(resolve=>setTimeout(resolve,0));
      continue;
    }
    if(extended&&!r.crop)interior={w,r};
    previous={cells:r.cells,hash:r.hash};if(!(extended&&!r.crop))r.mask=null;round++;
    if(extended&&r.crop)ext=ext.map((v,i)=>r.cropSides&(1<<i)?v+Math.max(96,Math.ceil(v*.25)):v);
    else{const f=r.crop?1.5:1.25;ext=ext.map(v=>Math.ceil(v*f));}
    options.onProgress?.({phase:'expand',round,cells:r.cells});
    await new Promise(resolve=>setTimeout(resolve,0));
  }
}
/* GRADE-GUIA: uma grade mais grossa do mesmo MDT, no mesmo CRS e orientação,
   roteada inteira. routeGuide guarda só a direção de cada célula (1 byte). */
async function routeGuide(grid,options={}){
  const r=await routeWindow(grid,[0,0,grid.nc,grid.nr],{...options,seed:null,routingOnly:true});
  return {nc:grid.nc,nr:grid.nr,cs:grid.cs,csy:grid.csy||grid.cs,xll:grid.xll,yll:grid.yll,state:r.state};
}
function usableGuide(source,g){
  if(!g||!g.state||!Number.isSafeInteger(g.nc)||!Number.isSafeInteger(g.nr)||g.state.length!==g.nc*g.nr)return null;
  const csy=g.csy||g.cs,cy=source.csy||source.cs;
  if(![g.cs,csy,g.xll,g.yll].every(Number.isFinite)||!(g.cs>0)||!(csy>0))return null;
  // Só serve se for mais grossa que a grade em análise e cobrir a mesma área (meia célula da guia de folga).
  if(g.cs<source.cs*1.5||csy<cy*1.5)return null;
  const tol=Math.max(g.cs,csy);
  if(Math.abs(g.xll-source.xll)>tol||Math.abs(g.yll+g.nr*csy-(source.yll+source.nr*cy))>tol||
    Math.abs(g.nc*g.cs-source.nc*source.cs)>2*tol||Math.abs(g.nr*csy-source.nr*cy)>2*tol)return null;
  return {...g,csy};
}
/* O que a grade-guia diz que drena para dentro da bacia encontrada: parte das
   células da guia cobertas pela máscara (ao menos 60% de cada uma), sobe por
   todas as que drenam para elas e devolve o retângulo dessa área em células da
   grade em análise. A célula da guia em que cai o exutório NÃO entra sozinha:
   junto de uma confluência ela costuma ser a do rio maior, e a guia acusaria
   a bacia do outro afluente como se faltasse (alarme falso). Bacia menor que
   uma célula da guia fica, por isso, sem conferência. */
function guideNeed(source,g,w,r,seed){
  const cy=source.csy||source.cs,top=source.yll+source.nr*cy,gtop=g.yll+g.nr*g.csy,W=r.W,
    colOf=x=>Math.floor((source.xll+(x+.5)*source.cs-g.xll)/g.cs),rowOf=y=>Math.floor((gtop-(top-(y+.5)*cy))/g.csy),
    [bx0,by0,bx1,by1]=r.bounds,C0=colOf(w[0]+bx0),C1=colOf(w[0]+bx1),R0=rowOf(w[1]+by0),R1=rowOf(w[1]+by1),
    cw=C1-C0+1,ch=R1-R0+1,cover=new Uint32Array(cw*ch),columns=new Int32Array(bx1-bx0+1);
  for(let x=bx0;x<=bx1;x++)columns[x-bx0]=colOf(w[0]+x)-C0;
  for(let y=by0;y<=by1;y++){
    const line=(rowOf(w[1]+y)-R0)*cw,row=y*W;
    for(let x=bx0;x<=bx1;x++){const i=row+x;if(r.mask[i>>3]&(1<<(i&7)))cover[line+columns[x-bx0]]++;}
  }
  const full=(g.cs/source.cs)*(g.csy/cy),enough=Math.max(1,Math.ceil(full*(g.overlap??.6))),total=g.nc*g.nr,
    seen=new Uint8Array(Math.ceil(total/8)),inside=(C,R)=>C>=0&&R>=0&&C<g.nc&&R<g.nr&&(g.state[R*g.nc+C]&15)!==9;
  let queue=new Uint32Array(Math.max(1024,cw*ch)),a=0,b=0;
  const push=k=>{if(seen[k>>3]&(1<<(k&7)))return;seen[k>>3]|=1<<(k&7);
    if(b===queue.length){const next=new Uint32Array(queue.length*2);next.set(queue);queue=next;}queue[b++]=k;};
  for(let R=R0;R<=R1;R++)for(let C=C0;C<=C1;C++)if(cover[(R-R0)*cw+C-C0]>=enough&&inside(C,R))push(R*g.nc+C);
  if(!b)return null;
  let minC=Infinity,minR=Infinity,maxC=-1,maxR=-1;
  while(a<b){
    const k=queue[a++],x=k%g.nc,y=Math.floor(k/g.nc);
    if(x<minC)minC=x;if(y<minR)minR=y;if(x>maxC)maxC=x;if(y>maxR)maxR=y;
    for(let j=0;j<8;j++){
      const xx=x+N[j][0],yy=y+N[j][1];if(xx<0||yy<0||xx>=g.nc||yy>=g.nr)continue;
      const n=yy*g.nc+xx;if((g.state[n]&15)===((j+4)%8+1))push(n);
    }
  }
  const clampX=v=>Math.max(0,Math.min(source.nc,v)),clampY=v=>Math.max(0,Math.min(source.nr,v));
  return {cells:b,rect:[clampX(Math.floor((g.xll+minC*g.cs-source.xll)/source.cs)),clampY(Math.floor((top-(gtop-minR*g.csy))/cy)),
    clampX(Math.ceil((g.xll+(maxC+1)*g.cs-source.xll)/source.cs)),clampY(Math.ceil((top-(gtop-(maxR+1)*g.csy))/cy))]};
}
/* Exutório no talvegue. O toque, ou o ponto projetado numa linha vetorial, quase
   nunca cai na célula exata por onde o escoamento passa no MDT: uma célula de
   encosta ao lado devolve só alguns metros quadrados em vez da bacia. Numa
   janela local, calcula quantas células drenam para cada célula e procura,
   dentro do raio de busca, a linha de escoamento dominante. Se o ponto já está
   nela, fica onde está; senão vai para a célula MAIS PRÓXIMA dessa linha, sem
   descer o rio. As cotas não são alteradas. */
/* Acumulação de fluxo D8: quantas células drenam para cada célula, pelas
   direções já roteadas. O roteamento é acíclico: soma das cabeceiras a jusante. */
function receiverOf(state,W,H,i){
  const d=state[i]&15;if(!d||d===9)return -1;
  const x=i%W+N[d-1][0],y=Math.floor(i/W)+N[d-1][1];
  return x<0||y<0||x>=W||y>=H||(state[y*W+x]&15)===9?-1:y*W+x;
}
function accumulate(state,W,H){
  const total=W*H,pending=new Uint8Array(total),count=new Uint32Array(total),order=new Uint32Array(total);
  for(let i=0;i<total;i++){if((state[i]&15)===9)continue;count[i]=1;const k=receiverOf(state,W,H,i);if(k>=0)pending[k]++;}
  let head=0,tail=0;for(let i=0;i<total;i++)if(count[i]&&!pending[i])order[tail++]=i;
  while(head<tail){const i=order[head++],k=receiverOf(state,W,H,i);if(k<0)continue;count[k]+=count[i];if(--pending[k]===0)order[tail++]=k;}
  return count;
}
/* Dentro do raio de busca, a célula MAIS PRÓXIMA da linha de escoamento
   dominante (acumulação de pelo menos metade da maior do entorno). Se o ponto
   já está nela, fica onde está. Não desce o rio. */
function dominantCell(count,W,H,start,search,cs,cy){
  const x0=start%W,y0=Math.floor(start/W),limit=search*Math.min(cs,cy),inside=[];let dominant=0;
  for(let y=Math.max(0,y0-search);y<=Math.min(H-1,y0+search);y++)for(let x=Math.max(0,x0-search);x<=Math.min(W-1,x0+search);x++){
    const i=y*W+x,distance=Math.hypot((x-x0)*cs,(y-y0)*cy);if(!count[i]||distance>limit)continue;
    inside.push([i,distance]);if(count[i]>dominant)dominant=count[i];
  }
  let best=start,bestDistance=0;
  if(count[start]*2<dominant){
    bestDistance=Infinity;
    for(const [i,distance] of inside){
      if(count[i]*2<dominant)continue;
      if(distance<bestDistance-1e-9||Math.abs(distance-bestDistance)<=1e-9&&count[i]>count[best]){best=i;bestDistance=distance;}
    }
  }
  return {best,distance:bestDistance};
}
/* Exutório no talvegue. O toque, ou o ponto projetado numa linha vetorial, quase
   nunca cai na célula exata por onde o escoamento passa no MDT: uma célula de
   encosta ao lado devolve só alguns metros quadrados em vez da bacia. Numa
   janela local, calcula a acumulação de fluxo e ajusta o ponto à linha de
   escoamento dominante. As cotas não são alteradas. */
async function locateOutlet(source,seed,options={}){
  if(!seed||!Number.isInteger(seed.col)||!Number.isInteger(seed.row)||seed.col<0||seed.row<0||seed.col>=source.nc||seed.row>=source.nr)throw Error('O ponto está fora do MDT.');
  const search=Math.max(1,Math.min(48,Math.ceil(options.searchCells||3))),radius=Math.max(64,search*4),
    w=[Math.max(0,seed.col-radius),Math.max(0,seed.row-radius),Math.min(source.nc,seed.col+radius+1),Math.min(source.nr,seed.row+radius+1)],
    r=await routeWindow(source,w,{signal:options.signal,maxMemoryMB:options.maxMemoryMB,seed,routingOnly:true}),
    {W,H,state,start}=r,count=accumulate(state,W,H),pick=dominantCell(count,W,H,start,search,source.cs,source.csy||source.cs);
  return {col:w[0]+pick.best%W,row:w[1]+Math.floor(pick.best/W),moved:pick.best!==start,distance:pick.distance*(source.unitScale||1),
    searchCells:search,cellsAtTap:count[start],cellsAtOutlet:count[pick.best]};
}
/* MÉTODO D8 NA GRADE INTEIRA. Para grades que cabem na memória (a grade do MDT
   guardada no projeto): roteia todas as células de uma vez e calcula a
   acumulação de fluxo. O resultado pode ser guardado e reutilizado: cada novo
   ponto é só a busca a montante. */
async function routeGrid(source,options={}){
  const r=await routeWindow(source,[0,0,source.nc,source.nr],{...options,routingOnly:true});
  options.onProgress?.({phase:'accumulation'});await new Promise(resolve=>setTimeout(resolve,0));
  return {nc:r.W,nr:r.H,state:r.state,count:accumulate(r.state,r.W,r.H)};
}
async function analyzeRouted(source,routing,seed,options={}){
  const W=routing.nc,H=routing.nr,state=routing.state,count=routing.count;
  if(W!==source.nc||H!==source.nr)throw Error('A grade do MDT mudou; refaça o cálculo.');
  if(!seed||!Number.isInteger(seed.col)||!Number.isInteger(seed.row)||seed.col<0||seed.row<0||seed.col>=W||seed.row>=H)throw Error('O ponto está fora do MDT.');
  const tap=seed.row*W+seed.col;if(!count[tap])throw Error('O ponto está fora da área válida do MDT.');
  const check=()=>{if(options.signal?.aborted||source.isCurrent&&source.isCurrent()===false)throw abort();};
  const search=Math.max(1,Math.min(64,Math.ceil(options.searchCells||3))),
    pick=dominantCell(count,W,H,tap,search,source.cs,source.csy||source.cs),start=pick.best,
    cells=count[start],queue=new Uint32Array(cells),mask=new Uint8Array(Math.ceil(W*H/8)),x0=start%W,y0=Math.floor(start/W),bounds=[x0,y0,x0,y0];
  let a=0,b=1,edge=false,noData=false,last=Date.now();queue[0]=start;mask[start>>3]|=1<<(start&7);
  while(a<b){
    const i=queue[a++],x=i%W,y=Math.floor(i/W);
    edge=edge||x===0||y===0||x===W-1||y===H-1;
    if(x<bounds[0])bounds[0]=x;if(y<bounds[1])bounds[1]=y;if(x>bounds[2])bounds[2]=x;if(y>bounds[3])bounds[3]=y;
    for(let j=0;j<8;j++){
      const xx=x+N[j][0],yy=y+N[j][1];if(xx<0||yy<0||xx>=W||yy>=H)continue;
      const n=yy*W+xx,d=state[n]&15;if(d===9){noData=true;continue;}
      if(d!==((j+4)%8+1)||(mask[n>>3]&(1<<(n&7))))continue;
      mask[n>>3]|=1<<(n&7);queue[b++]=n;
    }
    if((a&32767)===0){check();options.onProgress?.({phase:'upstream',cells:b});
      if(Date.now()-last>12){await new Promise(resolve=>setTimeout(resolve,0));last=Date.now();check();}}
  }
  check();
  const outlet={col:x0,row:y0},value=await source.readWindow([x0,y0,x0+1,y0+1]);
  const result=await contour(source,[0,0,W,H],{W,H,mask,bounds,cells:b,seedZ:value[0],touchesEdge:edge,touchesNoData:noData,memoryBytes:state.byteLength+count.byteLength+mask.byteLength+queue.byteLength},
    outlet,options,{rounds:1,method:'d8-grid'});
  return {...result,moved:start!==tap,snapDistance:pick.distance*(source.unitScale||1),cellsAtTap:count[tap],cellsAtOutlet:cells};
}
/* DIREÇÃO D8 JÁ CALCULADA FORA DAQUI (o D8 do Hidro). receiver[i] é o índice
   da célula de jusante, ou negativo quando a célula não tem saída (sumidouro,
   borda). Converte para o mesmo roteamento de routeGrid e conta, de forma
   exata, quantas células drenam para cada uma. Nenhuma cota é lida. */
function routeReceivers(nc,nr,receiver,isNoData){
  const total=nc*nr;
  if(!Number.isSafeInteger(nc)||!Number.isSafeInteger(nr)||nc<1||nr<1||!receiver||receiver.length!==total)throw Error('A direção de fluxo D8 não corresponde à grade.');
  const state=new Uint8Array(total),code=new Uint8Array(9);
  N.forEach(([x,y],j)=>{code[(y+1)*3+x+1]=j+1;});
  for(let i=0;i<total;i++){
    if(isNoData&&isNoData(i)){state[i]=73;continue;}
    const k=receiver[i];if(!(k>=0)||k===i||k>=total)continue;
    const dx=k%nc-i%nc,dy=Math.floor(k/nc)-Math.floor(i/nc);
    if(dx<-1||dx>1||dy<-1||dy>1)continue;   // não é vizinha: tratada como sem saída
    state[i]=code[(dy+1)*3+dx+1];
  }
  return {nc,nr,state,count:accumulate(state,nc,nr)};
}
root.GeoMineContinuousCatchment={analyze,routeWindow,locateOutlet,routeGrid,analyzeRouted,routeReceivers,routeGuide};
})(typeof window!=='undefined'?window:globalThis);
