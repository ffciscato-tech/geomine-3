/* Native-grid least-cost drainage. Elevations are never filled or carved.
   Process from known boundary outlets toward the interior in elevation order;
   unresolved pits use the discovery path, while downhill cells use D8 slopes.
   A point query expands its native window until the upstream mask is interior
   and unchanged in a larger window. Never return a clipped, unstable basin. */
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
  const seed=options.seed,x=seed.col-left,y=seed.row-top,start=y*W+x;
  if(x<0||y<0||x>=W||y>=H||(state[start]&15)===9)throw Error('O ponto está fora da área válida do MDT original.');
  if(options.routingOnly)return {window,W,H,state,start};
  const seedZ=z[start],queue=new Uint32Array(z.buffer,0,total),mask=new Uint8Array(Math.ceil(total/8));
  let a=0,b=1,edge=false,noData=false,crop=false,hash1=0,hash2=0,bounds=[x,y,x,y];queue[0]=start;mask[start>>3]|=1<<(start&7);
  while(a<b){
    const i=queue[a++],x=i%W,y=Math.floor(i/W),gx=x+left,gy=y+top,k=gy*source.nc+gx;
    hash1=(hash1+Math.imul(k^0x9e3779b9,0x85ebca6b))>>>0;hash2=(hash2^Math.imul(k^k>>>16,0xc2b2ae35))>>>0;
    edge=edge||gx===0||gy===0||gx===source.nc-1||gy===source.nr-1;
    crop=crop||(left>0&&x<=1)||(top>0&&y<=1)||(right<source.nc&&x>=W-2)||(bottom<source.nr&&y>=H-2);
    bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);
    for(let j=0;j<8;j++){
      const [dx,dy]=N[j],xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=W||yy>=H)continue;
      const n=yy*W+xx,d=state[n]&15;if(d===9){noData=true;continue;}
      if(d!==((j+4)%8+1)||(mask[n>>3]&(1<<(n&7))))continue;
      mask[n>>3]|=1<<(n&7);queue[b++]=n;
    }
    if((a&16383)===0)await pause('upstream',{cells:b});
  }
  return {window,W,H,mask,cells:b,seedZ,hash:hash1+':'+hash2,crop,touchesEdge:edge,touchesNoData:noData,bounds,valid,
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
  let radius=Math.max(64,Math.ceil((options.initialRadiusM||64)/Math.min(source.cs,source.csy||source.cs)/(source.unitScale||1))),previous=null,round=0;
  for(;;){
    const w=[Math.max(0,seed.col-radius),Math.max(0,seed.row-radius),Math.min(source.nc,seed.col+radius+1),Math.min(source.nr,seed.row+radius+1)],full=w[0]===0&&w[1]===0&&w[2]===source.nc&&w[3]===source.nr;
    const r=await routeWindow(source,w,{...options,onProgress:p=>options.onProgress?.({...p,round,window:w})});
    const stable=previous&&previous.cells===r.cells&&previous.hash===r.hash;
    if(!r.crop&&(full||stable))return contour(source,w,r,seed,options,{rounds:round+1});
    previous={cells:r.cells,hash:r.hash};r.mask=null;round++;radius=Math.ceil(radius*(r.crop?1.5:1.25));
    options.onProgress?.({phase:'expand',round,cells:r.cells});
    await new Promise(resolve=>setTimeout(resolve,0));
  }
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
root.GeoMineContinuousCatchment={analyze,routeWindow,locateOutlet,routeGrid,analyzeRouted};
})(typeof window!=='undefined'?window:globalThis);
