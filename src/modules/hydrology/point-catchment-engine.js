/* Reverse D8 catchment on native, unmodified elevations. Only the upstream
   cells and bounded decoded tiles are retained. Flat routing changes pointers,
   never elevations; closed depressions are not filled or breached. */
(function(root){
'use strict';
const N=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
async function analyze(source,options={}){
  const engine=root.GeoMineNativeFloodEngine,c=engine.createCellMask(source,options),seed=options.seed;
  let count=0,ticks=0,touchesEdge=false,touchesNoData=false,flatCells=0,head=null,tail=null,bounds=null;
  const inside=(x,y)=>x>=0&&y>=0&&x<c.nc&&y<c.nr;
  const code=(x,y)=>{const p=c.address(x,y);return p?.tile.direction?.[p.index]||0;};
  const put=(x,y,value)=>{const p=c.address(x,y,true);c.mask(p.tile,'direction',8)[p.index]=value;};
  // A 3x3 tile neighborhood covers the center cell, its inflow neighbors and
  // all eight candidates used to determine each neighbor's downstream pointer.
  async function neighborhood(tx,ty){
    const blocks=new Map();
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const x=tx+dx,y=ty+dy;if(x<0||y<0||x>=c.cols||y>=c.rows)continue;
      blocks.set(x+','+y,{data:await c.read(x,y),w:Math.min(c.tileSize,c.nc-x*c.tileSize)});
    }
    return (x,y)=>{
      if(!inside(x,y))return NaN;
      const a=Math.floor(x/c.tileSize),b=Math.floor(y/c.tileSize),q=blocks.get(a+','+b);
      if(!q)throw Error('Vizinhança nativa incompleta.');
      return q.data[(y-b*c.tileSize)*q.w+x-a*c.tileSize];
    };
  }
  function direct(x,y,zAt){
    const old=code(x,y);if(old)return old;
    const z=zAt(x,y);if(!c.valid(z)){put(x,y,9);return 9;}
    let best=0,drop=0,equal=false;
    for(let j=0;j<8;j++){
      const [dx,dy]=N[j],v=zAt(x+dx,y+dy);if(!c.valid(v))continue;
      if(v===z)equal=true;
      const slope=(z-v)/Math.hypot(dx*c.cs,dy*c.csy);
      if(slope>drop){drop=slope;best=j+1;}
    }
    const value=best||(equal?10:11);put(x,y,value);return value;
  }
  async function resolveFlat(x,y){
    const nodes=new Map(),list=[],outlets=[];let allocated=0,currentKey='',zAt;
    const readAt=async(a,b)=>{
      const tx=Math.floor(a/c.tileSize),ty=Math.floor(b/c.tileSize),key=tx+','+ty;
      if(key!==currentKey){zAt=await neighborhood(tx,ty);currentKey=key;}return zAt;
    };
    const first=await readAt(x,y),level=first(x,y);
    const add=(a,b)=>{const key=b*c.nc+a;if(nodes.has(key))return; c.reserve(160);allocated+=160;
      const n={x:a,y:b,key,route:0};nodes.set(key,n);list.push(n);};
    try{
      add(x,y);
      for(let i=0;i<list.length;i++){
        const n=list[i],z=await readAt(n.x,n.y),d=direct(n.x,n.y,z);
        if(d>=1&&d<=8){n.route=d;outlets.push(n);}
        for(const [dx,dy]of N){const a=n.x+dx,b=n.y+dy;if(inside(a,b)&&z(a,b)===level)add(a,b);}
        if((++ticks&255)===0){c.progress('flat',{cells:count,flatCells:list.length});await c.checkpoint();}
      }
      // Multi-source BFS from lower exits. Every equal-elevation pointer goes
      // to an earlier BFS level, preventing cycles without raising the DEM.
      for(let i=0;i<outlets.length;i++){
        const n=outlets[i];
        for(let j=0;j<8;j++){
          const [dx,dy]=N[j],a=n.x+dx,b=n.y+dy;if(!inside(a,b))continue;
          const p=nodes.get(b*c.nc+a);if(!p||p.route)continue;
          p.route=(j+4)%8+1;outlets.push(p);
        }
        if((++ticks&1023)===0)await c.checkpoint();
      }
      for(const n of list)put(n.x,n.y,n.route||11);
      flatCells+=list.length;
    }finally{c.release(allocated);}
  }
  function enqueue(x,y){
    if(!inside(x,y))return;
    const p=c.address(x,y,true);if(c.bit(p.tile.wet,p.index))return;
    c.setBit(c.mask(p.tile,'wet'),p.index);count++;
    touchesEdge=touchesEdge||x===0||y===0||x===c.nc-1||y===c.nr-1;
    if(!bounds)bounds=[x,y,x,y];else{bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);}
    c.reserve(16);p.tile.pending.push(p.index);
    if(!p.tile.queued){p.tile.queued=true;if(tail)tail.next=p.tile;else head=p.tile;tail=p.tile;}
  }
  try{
    if(!seed||!Number.isInteger(seed.col)||!Number.isInteger(seed.row)||!inside(seed.col,seed.row))throw Error('O ponto está fora do MDT.');
    let zAt=await neighborhood(Math.floor(seed.col/c.tileSize),Math.floor(seed.row/c.tileSize));
    const seedZ=zAt(seed.col,seed.row);if(!c.valid(seedZ))throw Error('O ponto está em uma célula sem dados no MDT original.');
    let seedCode=direct(seed.col,seed.row,zAt);
    if(seedCode===10){await resolveFlat(seed.col,seed.row);seedCode=code(seed.col,seed.row);
      if(seedCode===11)throw Error('O ponto está numa área plana fechada, sem direção de saída definida no MDT. Marque um ponto da linha com escoamento definido.');}
    enqueue(seed.col,seed.row);c.reserve(c.tileSize*c.tileSize*4);
    const queue=new Uint32Array(c.tileSize*c.tileSize);
    while(head){
      const tile=head;head=tile.next;if(!head)tail=null;tile.next=null;tile.queued=false;
      const pending=tile.pending;tile.pending=[];c.release(pending.length*16);
      let start=0,end=pending.length;queue.set(pending);
      zAt=await neighborhood(tile.tx,tile.ty);
      while(start<end){
        const i=queue[start++],x=tile.tx*c.tileSize+i%tile.w,y=tile.ty*c.tileSize+Math.floor(i/tile.w);
        for(let j=0;j<8;j++){
          const [dx,dy]=N[j],a=x+dx,b=y+dy;if(!inside(a,b)||c.isWet(a,b))continue;
          let d=direct(a,b,zAt);if(d===9){touchesNoData=true;continue;}
          if(d===10){await resolveFlat(a,b);d=code(a,b);}
          if(d!==((j+4)%8+1))continue;
          // Process an upstream cell locally whenever possible. Cross-tile
          // inflows queue that tile again; accepted cells are visited once.
          const p=c.address(a,b,true);
          if(p.tile===tile){c.setBit(c.mask(tile,'wet'),p.index);count++;queue[end++]=p.index;
            touchesEdge=touchesEdge||a===0||b===0||a===c.nc-1||b===c.nr-1;
            bounds[0]=Math.min(bounds[0],a);bounds[1]=Math.min(bounds[1],b);bounds[2]=Math.max(bounds[2],a);bounds[3]=Math.max(bounds[3],b);
          }else enqueue(a,b);
        }
        if((++ticks&255)===0){c.progress('upstream',{cells:count,areaM2:count*c.areaCell});await c.checkpoint();}
      }
      c.stats.tilesProcessed++;await c.checkpoint();
    }
    c.release(queue.byteLength);
    c.progress('contour',{cells:count,areaM2:count*c.areaCell},true);await c.checkpoint(true);
    const geometry=await engine.traceCellMask(c);c.abort();
    return {...geometry,cells:count,areaM2:count*c.areaCell,seed:{...seed},seedZ,
      outlet:[c.xll+(seed.col+.5)*c.cs,c.yll+(c.nr-seed.row-.5)*c.csy],
      nativeResolution:true,filled:false,touchesEdge,touchesNoData,flatCells,
      outletDepression:seedCode===11,cellBounds:bounds,resolution:{x:c.cs*c.unitScale,y:c.csy*c.unitScale},...c.stats};
  }catch(e){
    if(e.code==='GEOMINE_FLOOD_MEMORY_LIMIT')throw Error('A área contribuinte excedeu a memória disponível. O cálculo foi interrompido sem reduzir a resolução do MDT e sem salvar resultado parcial.');
    throw e;
  }finally{c.dispose();}
}
root.GeoMinePointCatchmentEngine={analyze};
})(typeof window!=='undefined'?window:globalThis);
