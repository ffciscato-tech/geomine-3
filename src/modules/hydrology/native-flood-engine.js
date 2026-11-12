/* Inundação na grade nativa: leitura em blocos, conectividade 4 e contorno
   das células, sem reamostragem nem simplificação da geometria resultante. */
(function(){
'use strict';
const DEFAULT_MEMORY_MB=192,POINT_BYTES=96,TILE_OVERHEAD=256,NEIGHBORS=[[1,0],[-1,0],[0,1],[0,-1]];
function create(source,options={}){
  const nc=Number(source?.nc),nr=Number(source?.nr),cs=Number(source?.cs),csy=Number(source?.csy||source?.cs),
    xll=Number(source?.xll),yll=Number(source?.yll),unitScale=Number(source?.unitScale??1),zScale=Number(source?.zScale??1);
  if(!Number.isSafeInteger(nc)||!Number.isSafeInteger(nr)||nc<1||nr<1||![cs,csy,unitScale,zScale].every(v=>Number.isFinite(v)&&v>0)||![xll,yll].every(Number.isFinite)||typeof source.readWindow!=='function')throw Error('A fonte do MDT não contém uma grade nativa válida.');
  const tileSize=Math.max(8,Math.min(512,Math.floor(options.tileSize||256))),cols=Math.ceil(nc/tileSize),rows=Math.ceil(nr/tileSize),
    memoryLimit=Math.max(1,Number(options.maxMemoryMB)||DEFAULT_MEMORY_MB)*1048576,
    cacheLimit=Math.min(memoryLimit*.45,Math.max(.25,Number(options.decodedCacheMB)||32)*1048576),
    noData=source.noData==null?null:Number(source.noData),areaCell=cs*csy*unitScale*unitScale,
    tiles=new Map(),cache=new Map(),stats={readWindows:0,decodedTilesPeak:0,memoryPeakBytes:0,tilesProcessed:0};
  let memory=0,cacheBytes=0,lastYield=Date.now(),lastProgress=0;
  const abort=()=>{
    if(options.signal?.aborted||source.isCurrent&&source.isCurrent()===false){const e=Error('Cálculo cancelado: o MDT ou os parâmetros mudaram.');e.name='AbortError';throw e;}
  };
  const memoryError=()=>{const e=Error('A inundação na resolução nativa excedeu o limite de memória de '+Math.round(memoryLimit/1048576)+' MB. Recorte o MDT ou limite a área de análise e tente novamente. A resolução não foi reduzida.');e.code='GEOMINE_FLOOD_MEMORY_LIMIT';return e;};
  const evict=()=>{
    const first=cache.keys().next();if(first.done)return false;
    const q=cache.get(first.value);cache.delete(first.value);cacheBytes-=q.bytes;memory-=q.bytes;return true;
  };
  const reserve=bytes=>{
    while(memory+bytes>memoryLimit&&evict()){}
    if(memory+bytes>memoryLimit)throw memoryError();
    memory+=bytes;stats.memoryPeakBytes=Math.max(stats.memoryPeakBytes,memory);
  };
  const release=bytes=>{memory=Math.max(0,memory-bytes);};
  const checkpoint=async(force=false)=>{abort();if(force||Date.now()-lastYield>=8){await new Promise(resolve=>setTimeout(resolve,0));lastYield=Date.now();abort();}};
  const progress=(phase,extra={},force=false)=>{
    abort();if(!force&&Date.now()-lastProgress<80)return;lastProgress=Date.now();
    options.onProgress?.({phase,readWindows:stats.readWindows,tilesProcessed:stats.tilesProcessed,totalTiles:cols*rows,progress:null,...extra});
  };
  const valid=z=>Number.isFinite(z)&&(noData==null||z!==noData);
  const getMeta=(tx,ty,make=false)=>{
    const key=tx+','+ty;let tile=tiles.get(key);
    if(!tile&&make){reserve(TILE_OVERHEAD);tile={key,tx,ty,w:Math.min(tileSize,nc-tx*tileSize),h:Math.min(tileSize,nr-ty*tileSize),seen:null,wet:null,wall:null,traced:null,seeds:null,pending:[],queued:false,next:null};tiles.set(key,tile);}
    return tile;
  };
  const mask=(tile,name,bits=1)=>{
    if(!tile[name]){const bytes=Math.ceil(tile.w*tile.h*bits/8);reserve(bytes);tile[name]=new Uint8Array(bytes);}
    return tile[name];
  };
  const bit=(array,i)=>!!array&&(array[i>>3]&(1<<(i&7)))!==0;
  const setBit=(array,i)=>{array[i>>3]|=1<<(i&7);};
  const address=(col,row,make=false)=>{
    if(col<0||row<0||col>=nc||row>=nr)return null;
    const tx=Math.floor(col/tileSize),ty=Math.floor(row/tileSize),tile=getMeta(tx,ty,make);
    return tile?{tile,index:(row-ty*tileSize)*tile.w+col-tx*tileSize}:null;
  };
  const isWet=(col,row)=>{const q=address(col,row);return !!q&&bit(q.tile.wet,q.index);};
  const read=async(tx,ty)=>{
    abort();const key=tx+','+ty,old=cache.get(key);
    if(old){cache.delete(key);cache.set(key,old);return old.data;}
    const x0=tx*tileSize,y0=ty*tileSize,w=Math.min(tileSize,nc-x0),h=Math.min(tileSize,nr-y0),expected=w*h*8;
    while(cacheBytes+expected>cacheLimit&&evict()){}
    reserve(expected);let data;
    try{data=await source.readWindow([x0,y0,x0+w,y0+h]);abort();}
    catch(error){release(expected);throw error;}
    if(!(data instanceof Float32Array||data instanceof Float64Array)||data.length!==w*h){release(expected);throw Error('O bloco do MDT não corresponde à janela solicitada na resolução nativa.');}
    const bytes=data.byteLength;release(expected-bytes);cache.set(key,{data,bytes});cacheBytes+=bytes;
    stats.readWindows++;stats.decodedTilesPeak=Math.max(stats.decodedTilesPeak,cache.size);return data;
  };
  const clearWorking=()=>{
    while(evict()){}
    for(const tile of tiles.values())for(const name of ['seen','wall','traced','seeds'])if(tile[name]){release(tile[name].byteLength);tile[name]=null;}
  };
  const dispose=()=>{cache.clear();tiles.clear();cacheBytes=0;memory=0;};
  return {source,options,nc,nr,cs,csy,xll,yll,unitScale,zScale,tileSize,cols,rows,areaCell,tiles,stats,abort,reserve,release,checkpoint,progress,valid,getMeta,mask,bit,setBit,address,isWet,read,clearWorking,dispose};
}
async function scan(source,options={}){
  const c=create(source,options);let mn=Infinity,mx=-Infinity,nVal=0,minCell=null,ticks=0;
  c.progress('scan',{progress:0},true);
  for(let ty=0;ty<c.rows;ty++)for(let tx=0;tx<c.cols;tx++){
    const data=await c.read(tx,ty),w=Math.min(c.tileSize,c.nc-tx*c.tileSize);
    for(let i=0;i<data.length;i++){
      const z=data[i];if(c.valid(z)){nVal++;if(z<mn){mn=z;minCell={col:tx*c.tileSize+i%w,row:ty*c.tileSize+Math.floor(i/w)};}if(z>mx)mx=z;}
      if((++ticks&4095)===0)await c.checkpoint();
    }
    c.stats.tilesProcessed++;c.progress('scan',{progress:c.stats.tilesProcessed/(c.cols*c.rows),nVal});await c.checkpoint();
  }
  c.progress('scan',{progress:1,nVal},true);
  return {mn:nVal?mn:null,mx:nVal?mx:null,nVal,minCell,...c.stats};
}
// Supercover rasterization: a crossed cell is a dry wall, including both
// cells beside a line that lies exactly on a cell edge.
async function barriers(c,lines){
  let ticks=0,nWall=0;
  const wall=(col,row)=>{
    if(col<0||row<0||col>=c.nc||row>=c.nr)return;
    const q=c.address(col,row,true),m=c.mask(q.tile,'wall');if(!c.bit(m,q.index)){c.setBit(m,q.index);nWall++;}
  };
  const clip=(a,b)=>{
    let lo=0,hi=1;const dx=b[0]-a[0],dy=b[1]-a[1];
    for(const [p,q]of [[-dx,a[0]],[dx,c.nc-a[0]],[-dy,a[1]],[dy,c.nr-a[1]]]){
      if(Math.abs(p)<1e-15){if(q<0)return null;continue;}
      const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;
    }
    return [[a[0]+dx*lo,a[1]+dy*lo],[a[0]+dx*hi,a[1]+dy*hi]];
  };
  for(const line of lines||[]){
    if(!Array.isArray(line))continue;
    for(let i=1;i<line.length;i++){
      const a=line[i-1],b=line[i];if(!a||!b||![a[0],a[1],b[0],b[1]].every(Number.isFinite))continue;
      const snap=v=>Math.abs(v-Math.round(v))<1e-7?Math.round(v):v,
        seg=clip([snap((a[0]-c.xll)/c.cs),snap(c.nr-(a[1]-c.yll)/c.csy)],[snap((b[0]-c.xll)/c.cs),snap(c.nr-(b[1]-c.yll)/c.csy)]);if(!seg)continue;
      const [p,q]=seg,dx=q[0]-p[0],dy=q[1]-p[1],sx=Math.sign(dx),sy=Math.sign(dy),
        at=(v,n)=>Math.max(0,Math.min(n-1,Math.floor(v))),vertical=Math.abs(dx)<1e-12&&Math.abs(p[0]-Math.round(p[0]))<1e-8,
        horizontal=Math.abs(dy)<1e-12&&Math.abs(p[1]-Math.round(p[1]))<1e-8;
      let x=at(p[0],c.nc),y=at(p[1],c.nr),endX=at(q[0],c.nc),endY=at(q[1],c.nr),
        tx=sx?((sx>0?x+1:x)-p[0])/dx:Infinity,ty=sy?((sy>0?y+1:y)-p[1])/dy:Infinity;
      const stepX=sx?Math.abs(1/dx):Infinity,stepY=sy?Math.abs(1/dy):Infinity;
      for(let guard=0;guard<=c.nc+c.nr+2;guard++){
        wall(x,y);if(vertical)wall(Math.round(p[0])-1,y);if(horizontal)wall(x,Math.round(p[1])-1);
        if(x===endX&&y===endY)break;
        if(Math.abs(tx-ty)<1e-12){wall(x+sx,y);wall(x,y+sy);x+=sx;y+=sy;tx+=stepX;ty+=stepY;}
        else if(tx<ty){x+=sx;tx+=stepX;}else{y+=sy;ty+=stepY;}
        if(x<0||y<0||x>=c.nc||y>=c.nr)break;
        if((++ticks&4095)===0){c.progress('barriers',{nWall});await c.checkpoint();}
      }
    }
  }
  return nWall;
}
async function contours(c){
  const rings=[],ringInfo=[],directions=[[1,0],[0,1],[-1,0],[0,-1]];let ticks=0,nPoints=0;
  const edge=(x,y,dir)=>{
    let col,row,side,otherCol,otherRow;
    if(dir===0){col=x;row=y-1;side=2;otherCol=x;otherRow=y;}
    else if(dir===1){col=x;row=y;side=3;otherCol=x-1;otherRow=y;}
    else if(dir===2){col=x-1;row=y;side=0;otherCol=x-1;otherRow=y-1;}
    else{col=x-1;row=y-1;side=1;otherCol=x;otherRow=y-1;}
    const q=c.address(col,row);return q&&c.bit(q.tile.wet,q.index)&&!c.isWet(otherCol,otherRow)?{...q,x,y,dir,side}:null;
  };
  const traced=e=>!!e.tile.traced&&(e.tile.traced[e.index>>1]&(1<<((e.index&1)*4+e.side)))!==0;
  const mark=e=>{const m=c.mask(e.tile,'traced',4);m[e.index>>1]|=1<<((e.index&1)*4+e.side);};
  const trace=async start=>{
    const ring=[];let e=start,twiceArea=0;const ox=start.x,oy=start.y;
    const append=(x,y)=>{c.reserve(POINT_BYTES);ring.push([c.xll+x*c.cs,c.yll+(c.nr-y)*c.csy]);nPoints++;};
    append(e.x,e.y);
    for(;;){
      mark(e);const d=directions[e.dir],x=e.x+d[0],y=e.y+d[1];
      twiceArea+=(e.x-ox)*(y-oy)-(x-ox)*(e.y-oy);append(x,y);
      if(x===start.x&&y===start.y)break;
      let next=null;
      // Keep diagonal wet cells as separate boundaries at a shared vertex.
      for(const dir of [(e.dir+3)%4,e.dir,(e.dir+1)%4,(e.dir+2)%4]){const candidate=edge(x,y,dir);if(candidate&&!traced(candidate)){next=candidate;break;}}
      if(!next)throw Error('Não foi possível fechar o contorno nativo da inundação.');
      e=next;if((++ticks&4095)===0){c.progress('contour',{nPoints});await c.checkpoint();}
    }
    const areaM2=-twiceArea*c.areaCell/2;
    rings.push(ring);ringInfo.push({hole:areaM2<0,areaM2,pointCount:ring.length});
  };
  for(const tile of c.tiles.values()){
    if(!tile.wet)continue;
    for(let byte=0;byte<tile.wet.length;byte++){
      const value=tile.wet[byte];if(!value)continue;
      for(let b=0;b<8;b++)if(value&(1<<b)){
        const i=byte*8+b;if(i>=tile.w*tile.h)continue;
        const localX=i%tile.w,localY=Math.floor(i/tile.w),col=tile.tx*c.tileSize+localX,row=tile.ty*c.tileSize+localY;
        const visit=async(x,y,dir,side)=>{const e={tile,index:i,x,y,dir,side};if(!traced(e))await trace(e);};
        if(!(localY>0?c.bit(tile.wet,i-tile.w):c.isWet(col,row-1)))await visit(col+1,row,2,0);
        if(!(localX>0?c.bit(tile.wet,i-1):c.isWet(col-1,row)))await visit(col,row,1,3);
        if(!(localY<tile.h-1?c.bit(tile.wet,i+tile.w):c.isWet(col,row+1)))await visit(col,row+1,0,2);
        if(!(localX<tile.w-1?c.bit(tile.wet,i+1):c.isWet(col+1,row)))await visit(col+1,row+1,3,1);
        if((++ticks&4095)===0)await c.checkpoint();
      }
    }
    c.progress('contour',{nPoints});await c.checkpoint();
  }
  return {rings,ringInfo,nPoints};
}
async function analyze(source,options={}){
  const c=create(source,options),level=Number(options.level),mode=options.mode||'point';
  if(!Number.isFinite(level)||!['point','all'].includes(mode))throw Error('Informe uma cota de inundação válida e o modo de análise.');
  const seed=options.seed;
  if(mode==='point'&&(!seed||!Number.isInteger(seed.col)||!Number.isInteger(seed.row)||seed.col<0||seed.row<0||seed.col>=c.nc||seed.row>=c.nr))throw Error('O ponto de início deve estar dentro do MDT.');
  let nWet=0,sumDepth=0,compensation=0,seedZ=null,touchesEdge=false,ticks=0,bounds=null;
  const nWall=await barriers(c,options.barrierLines);
  if(seed&&Number.isInteger(seed.col)&&Number.isInteger(seed.row)&&seed.col>=0&&seed.row>=0&&seed.col<c.nc&&seed.row<c.nr){
    const tx=Math.floor(seed.col/c.tileSize),ty=Math.floor(seed.row/c.tileSize),w=Math.min(c.tileSize,c.nc-tx*c.tileSize),data=await c.read(tx,ty),z=data[(seed.row-ty*c.tileSize)*w+seed.col-tx*c.tileSize];
    if(c.valid(z))seedZ=z;
  }
  const wet=(tile,i,z)=>{
    c.setBit(c.mask(tile,'wet'),i);nWet++;
    const col=tile.tx*c.tileSize+i%tile.w,row=tile.ty*c.tileSize+Math.floor(i/tile.w),depth=(level-z)*c.zScale-compensation,next=sumDepth+depth;
    compensation=(next-sumDepth)-depth;sumDepth=next;
    touchesEdge=touchesEdge||col===0||row===0||col===c.nc-1||row===c.nr-1;
    if(!bounds)bounds=[col,row,col,row];else{bounds[0]=Math.min(bounds[0],col);bounds[1]=Math.min(bounds[1],row);bounds[2]=Math.max(bounds[2],col);bounds[3]=Math.max(bounds[3],row);}
  };
  if(mode==='all'){
    for(let ty=0;ty<c.rows;ty++)for(let tx=0;tx<c.cols;tx++){
      const data=await c.read(tx,ty);let tile=c.getMeta(tx,ty);
      for(let i=0;i<data.length;i++){
        const z=data[i];if(c.valid(z)&&z<level&&!c.bit(tile?.wall,i)){tile=tile||c.getMeta(tx,ty,true);wet(tile,i,z);}
        if((++ticks&4095)===0)await c.checkpoint();
      }
      c.stats.tilesProcessed++;c.progress('flood',{progress:c.stats.tilesProcessed/(c.cols*c.rows),nWet,areaM2:nWet*c.areaCell});await c.checkpoint();
    }
  }else if(seedZ!=null&&seedZ<level){
    let head=null,tail=null;
    const enqueue=(col,row)=>{
      if(col<0||row<0||col>=c.nc||row>=c.nr)return;
      const q=c.address(col,row,true);if(c.bit(q.tile.wall,q.index)||c.bit(q.tile.seen,q.index))return;
      c.setBit(c.mask(q.tile,'seen'),q.index);c.reserve(16);q.tile.pending.push(q.index);
      if(!q.tile.queued){q.tile.queued=true;if(tail)tail.next=q.tile;else head=q.tile;tail=q.tile;}
    };
    c.reserve(c.tileSize*c.tileSize*4);const queue=new Int32Array(c.tileSize*c.tileSize);
    enqueue(seed.col,seed.row);
    while(head){
      const tile=head;head=tile.next;if(!head)tail=null;tile.next=null;tile.queued=false;
      const seeds=tile.pending;tile.pending=[];c.release(seeds.length*16);let start=0,end=seeds.length;
      queue.set(seeds);const data=await c.read(tile.tx,tile.ty),seen=c.mask(tile,'seen');
      while(start<end){
        const i=queue[start++],z=data[i];
        if(c.valid(z)&&z<level&&!c.bit(tile.wall,i)){
          wet(tile,i,z);const x=i%tile.w,y=Math.floor(i/tile.w);
          for(const [dx,dy]of NEIGHBORS){
            const nx=x+dx,ny=y+dy;
            if(nx>=0&&ny>=0&&nx<tile.w&&ny<tile.h){const ni=ny*tile.w+nx;if(!c.bit(seen,ni)&&!c.bit(tile.wall,ni)){c.setBit(seen,ni);queue[end++]=ni;}}
            else enqueue(tile.tx*c.tileSize+nx,tile.ty*c.tileSize+ny);
          }
        }
        if((++ticks&4095)===0)await c.checkpoint();
      }
      c.stats.tilesProcessed++;c.progress('flood',{nWet,areaM2:nWet*c.areaCell});await c.checkpoint();
    }
    c.release(c.tileSize*c.tileSize*4);
  }
  c.progress('contour',{nWet,areaM2:nWet*c.areaCell},true);await c.checkpoint(true);
  const geometry=await contours(c);c.abort();
  const result={...geometry,areaM2:nWet*c.areaCell,volM3:sumDepth*c.areaCell,nWet,seedZ,touchesEdge,nWall,cellBounds:bounds,
    level,mode,resolution:{x:c.cs,y:c.csy},unitScale:c.unitScale,zScale:c.zScale,nativeResolution:true,
    ...c.stats,maskTiles:c.tiles.size};
  c.progress('done',{progress:1,nWet,areaM2:result.areaM2,volM3:result.volM3},true);return result;
}
// Connected native cells under a spatially varying level. The callback returns
// the positive depth in the source's Z units, or null/a nonpositive value for a
// dry cell. It also sees NoData samples, so the caller can report local gaps.
// No complete DEM or bounding-box array is allocated: only visited tile masks
// and a bounded decoded cache are retained. The returned lookup lasts until
// dispose(), allowing the caller to inspect sections before releasing it.
async function analyzeByField(source,options={}){
  if(typeof options.classifyCell!=='function')throw Error('Informe o critério de preenchimento na grade nativa.');
  const seeds=options.seeds;
  if(!seeds||typeof seeds[Symbol.iterator]!=='function'&&typeof seeds[Symbol.asyncIterator]!=='function')throw Error('Informe os pontos de início na grade nativa.');
  const c=create(source,options),classify=options.classifyCell;
  let nWet=0,nTested=0,nSeeds=0,nSeedCells=0,nWetSeedCells=0,nDrySeedCells=0,nNoDataSeedCells=0,sumDepth=0,compensation=0,touchesEdge=false,ticks=0,bounds=null,head=null,tail=null,disposed=false;
  const enqueue=(col,row,seed=false)=>{
    if(!Number.isInteger(col)||!Number.isInteger(row)||col<0||row<0||col>=c.nc||row>=c.nr)return;
    const q=c.address(col,row,true);
    if(seed&&!c.bit(q.tile.seeds,q.index)){
      c.setBit(c.mask(q.tile,'seeds'),q.index);nSeedCells++;
      if(c.bit(q.tile.wall,q.index))nDrySeedCells++;
    }
    if(c.bit(q.tile.wall,q.index)||c.bit(q.tile.seen,q.index))return;
    c.setBit(c.mask(q.tile,'seen'),q.index);c.reserve(16);q.tile.pending.push(q.index);
    if(!q.tile.queued){q.tile.queued=true;if(tail)tail.next=q.tile;else head=q.tile;tail=q.tile;}
  };
  const wet=(tile,i,z,depth)=>{
    c.setBit(c.mask(tile,'wet'),i);nWet++;
    const col=tile.tx*c.tileSize+i%tile.w,row=tile.ty*c.tileSize+Math.floor(i/tile.w),value=depth*c.zScale-compensation,next=sumDepth+value;
    compensation=(next-sumDepth)-value;sumDepth=next;
    touchesEdge=touchesEdge||col===0||row===0||col===c.nc-1||row===c.nr-1;
    if(!bounds)bounds=[col,row,col,row];else{bounds[0]=Math.min(bounds[0],col);bounds[1]=Math.min(bounds[1],row);bounds[2]=Math.max(bounds[2],col);bounds[3]=Math.max(bounds[3],row);}
  };
  try{
    const nWall=await barriers(c,options.barrierLines);
    c.progress('seeds',{nSeeds,nWet,nTested},true);
    const iterator=typeof seeds[Symbol.asyncIterator]==='function'?seeds[Symbol.asyncIterator]():seeds[Symbol.iterator]();
    for(;;){
      let step=iterator.next();if(step&&typeof step.then==='function')step=await step;if(step.done)break;
      const seed=step.value;if(seed){enqueue(seed.col,seed.row,true);nSeeds++;}
      if((++ticks&4095)===0){c.progress('seeds',{nSeeds,nWet,nTested});await c.checkpoint();}
    }
    c.reserve(c.tileSize*c.tileSize*4);const queue=new Int32Array(c.tileSize*c.tileSize);
    while(head){
      const tile=head;head=tile.next;if(!head)tail=null;tile.next=null;tile.queued=false;
      const pending=tile.pending;tile.pending=[];c.release(pending.length*16);let start=0,end=pending.length;
      queue.set(pending);const data=await c.read(tile.tx,tile.ty),seen=c.mask(tile,'seen');
      while(start<end){
        const i=queue[start++],z=data[i],x=i%tile.w,y=Math.floor(i/tile.w),col=tile.tx*c.tileSize+x,row=tile.ty*c.tileSize+y;
        nTested++;const depth=classify(col,row,z);
        if(c.bit(tile.seeds,i)){
          if(!c.valid(z))nNoDataSeedCells++;
          else if(Number.isFinite(depth)&&depth>0)nWetSeedCells++;
          else nDrySeedCells++;
        }
        if(c.valid(z)&&Number.isFinite(depth)&&depth>0&&!c.bit(tile.wall,i)){
          wet(tile,i,z,depth);
          for(const [dx,dy]of NEIGHBORS){
            const nx=x+dx,ny=y+dy;
            if(nx>=0&&ny>=0&&nx<tile.w&&ny<tile.h){const ni=ny*tile.w+nx;if(!c.bit(seen,ni)&&!c.bit(tile.wall,ni)){c.setBit(seen,ni);queue[end++]=ni;}}
            else enqueue(tile.tx*c.tileSize+nx,tile.ty*c.tileSize+ny);
          }
        }
        // A spatial criterion can cost more than a constant-level comparison.
        // Check often enough that cancellation and repaint stay responsive.
        if((++ticks&255)===0){c.progress('flood',{nSeeds,nWet,nTested,areaM2:nWet*c.areaCell});await c.checkpoint();}
      }
      c.stats.tilesProcessed++;c.progress('flood',{nSeeds,nWet,nTested,areaM2:nWet*c.areaCell});await c.checkpoint();
    }
    c.release(c.tileSize*c.tileSize*4);
    c.progress('contour',{nWet,nTested,areaM2:nWet*c.areaCell},true);await c.checkpoint(true);
    const geometry=await contours(c);c.abort();
    const result={...geometry,areaM2:nWet*c.areaCell,volM3:sumDepth*c.areaCell,nWet,nTested,nSeeds,nSeedCells,nWetSeedCells,nDrySeedCells,nNoDataSeedCells,touchesEdge,nWall,cellBounds:bounds,
      level:null,mode:'field',resolution:{x:c.cs,y:c.csy},unitScale:c.unitScale,zScale:c.zScale,nativeResolution:true,...c.stats,maskTiles:c.tiles.size,
      isWet:(col,row)=>!disposed&&c.isWet(col,row),dispose:()=>{if(!disposed){disposed=true;c.dispose();}}
    };
    c.clearWorking();c.progress('done',{progress:1,nWet,nTested,areaM2:result.areaM2,volM3:result.volM3},true);return result;
  }catch(error){disposed=true;c.dispose();throw error;}
}
window.GeoMineNativeFloodEngine={analyze,scan,analyzeByField,createCellMask:create,traceCellMask:contours};
})();
