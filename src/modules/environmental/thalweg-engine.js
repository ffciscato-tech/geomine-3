/* Native-cell main thalweg inside a polygon. Conditioning is used only for
   routing: output Z always comes from the unmodified source cell. */
(function(root){
'use strict';
const MEMORY=192*1024*1024, TILE=256, BYTES_PER_CELL=39, RESERVE=12*1024*1024;
const DC=[1,1,0,-1,-1,-1,0,1],DR=[0,1,1,1,0,-1,-1,-1];
function fail(code,message){const e=new Error(message);e.code=code;return e;}
function abort(){const e=new Error('Extração cancelada: a área, o MDT ou o projeto mudou.');e.name='AbortError';return e;}
function outline(rings){
 if(!Array.isArray(rings)||!rings.length)throw fail('THALWEG_REGION','Desenhe ou selecione um polígono para a região.');
 return rings.map(r=>{
  if(!Array.isArray(r))throw fail('THALWEG_REGION','Polígono da região inválido.');
  const a=[];for(const p of r){if(!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1]))throw fail('THALWEG_REGION','Coordenada inválida no polígono.');
   if(!a.length||p[0]!==a.at(-1)[0]||p[1]!==a.at(-1)[1])a.push([p[0],p[1]]);}
  if(a.length>1&&a[0][0]===a.at(-1)[0]&&a[0][1]===a.at(-1)[1])a.pop();
  if(a.length<3)throw fail('THALWEG_REGION','A região precisa de pelo menos três vértices distintos.');return a;
 });
}
function estimate(source,rings,limit=MEMORY){
 const {nc,nr,cs,xll,yll}=source||{},csy=source?.csy??cs,scale=source?.unitScale??1;
 if(![nc,nr].every(n=>Number.isSafeInteger(n)&&n>0)||![cs,csy,scale].every(n=>Number.isFinite(n)&&n>0)||![xll,yll].every(Number.isFinite))throw fail('THALWEG_SOURCE','Grade nativa do MDT inválida.');
 const rs=outline(rings);let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 for(const r of rs)for(const p of r){minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);}
 const north=yll+nr*csy,x0=Math.max(0,Math.ceil((minX-xll)/cs-.5)),y0=Math.max(0,Math.ceil((north-maxY)/csy-.5)),
  x1=Math.min(nc,Math.floor((maxX-xll)/cs-.5)+1),y1=Math.min(nr,Math.floor((north-minY)/csy-.5)+1),w=x1-x0,h=y1-y0,cells=w*h;
 if(w<=0||h<=0||!Number.isSafeInteger(cells)||!cells)throw fail('THALWEG_EMPTY','A região não contém células do MDT.');
 const memoryLimitBytes=Math.min(MEMORY,Number.isFinite(limit)&&limit>0?limit:MEMORY),estimatedBytes=BYTES_PER_CELL*cells+RESERVE+rs.reduce((n,r)=>n+r.length,0)*256;
 // The rectangular envelope is only an address space. A curved corridor
 // and the empty parts of a TIFF must not reserve a full set of flow arrays.
 // Large envelopes are scanned in bounded native windows before allocating
 // the graph; only valid cells inside the polygon receive a node.
 return {rings:rs,window:[x0,y0,x1,y1],width:w,height:h,cells,estimatedBytes,memoryLimitBytes,compact:estimatedBytes>memoryLimitBytes,nativeResolution:{x:cs*scale,y:csy*scale},cs,csy,scale,north};
}
function orient(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
function intersects(a,b,c,d){
 const p=orient(a,b,c),q=orient(a,b,d),r=orient(c,d,a),s=orient(c,d,b);
 return ((p<=0&&q>=0)||(p>=0&&q<=0))&&((r<=0&&s>=0)||(r>=0&&s<=0));
}
async function validRings(rings,tick){
 const edges=[];let id=0;
 for(let ri=0;ri<rings.length;ri++){
  const r=rings[ri],origin=r[0];let area=0;
  for(let i=0;i<r.length;i++){
   const a=r[i],b=r[(i+1)%r.length],c=r[(i+2)%r.length];area+=(a[0]-origin[0])*(b[1]-origin[1])-(b[0]-origin[0])*(a[1]-origin[1]);
   if(orient(a,b,c)===0&&(b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1])<0)throw fail('THALWEG_REGION','O polígono tem segmentos sobrepostos. Corrija o limite da região.');
   edges.push({a,b,ri,i,n:r.length,id:id++,x0:Math.min(a[0],b[0]),x1:Math.max(a[0],b[0]),y0:Math.min(a[1],b[1]),y1:Math.max(a[1],b[1])});
  }
  if(!Number.isFinite(area)||area===0)throw fail('THALWEG_REGION','O polígono não tem área válida ou cruza a si mesmo.');
 }
 edges.sort((a,b)=>a.x0-b.x0||a.id-b.id);let active=[],work=0;
 for(const e of edges){
  active=active.filter(a=>a.x1>=e.x0);
  for(const a of active){
   if(++work>8e6)throw fail('THALWEG_REGION_COMPLEX','O limite da região é complexo demais para validar. Use um polígono de recorte mais simples.');
   if((work&4095)===0)await tick('validate');
   if(a.y1<e.y0||e.y1<a.y0)continue;
   if(a.ri===e.ri&&(Math.abs(a.i-e.i)===1||Math.abs(a.i-e.i)===a.n-1))continue;
   if(intersects(a.a,a.b,e.a,e.b))throw fail('THALWEG_REGION','O polígono cruza a si mesmo ou seus anéis se cruzam. Corrija o limite da região.');
  }
  active.push(e);
 }
 return edges;
}
async function exteriorGrid(rows,w,h,tick,allocate){
 // Four-connected complement runs reproduce the dense exterior flood,
 // including a concavity whose opening is narrower than one native cell.
 // NoData is not in these runs: an interior missing cell remains a wall.
 let count=0;
 for(const row of rows){let c=0;for(let i=0;i<row.length;i+=2){if(row[i]>c)count++;c=row[i+1];}if(c<w)count++;}
 allocate((h+1)*4+count*13);
 const offsets=new Uint32Array(h+1),left=new Int32Array(count),right=new Int32Array(count),parent=new Uint32Array(count),edge=new Uint8Array(count);
 function find(k){let root=k;while(parent[root]!==root)root=parent[root];while(k!==root){const next=parent[k];parent[k]=root;k=next;}return root;}
 function join(a,b){a=find(a);b=find(b);if(a!==b){if(a>b)[a,b]=[b,a];parent[b]=a;edge[a]|=edge[b];}}
 let at=0;
 for(let row=0;row<h;row++){
  offsets[row]=at;let col=0;
  function append(a,b){left[at]=a;right[at]=b;parent[at]=at;edge[at]=!row||row===h-1||!a||b===w?1:0;at++;}
  for(let i=0;i<rows[row].length;i+=2){if(rows[row][i]>col)append(col,rows[row][i]);col=rows[row][i+1];}if(col<w)append(col,w);
  if(row){let a=offsets[row-1],b=offsets[row];while(a<offsets[row]&&b<at){
   if(left[a]<right[b]&&left[b]<right[a])join(a,b);
   if(right[a]<right[b])a++;else b++;
  }}
  if((row&127)===0)await tick('mask',row/h);
 }
 offsets[h]=at;
 function contains(row,col){if(row<0||col<0||row>=h||col>=w)return true;
  let a=offsets[row],b=offsets[row+1]-1;while(a<=b){const i=(a+b)>>>1;if(col<left[i])b=i-1;else if(col>=right[i])a=i+1;else return !!edge[find(i)];}return false;
 }
 return {contains,bytes:offsets.byteLength+left.byteLength+right.byteLength+parent.byteLength+edge.byteLength};
}
async function compactGrid(source,e,tick,check){
 const {rings,width:w,height:h,window:[x0,y0],cs,csy,north,memoryLimitBytes}=e;
 const reserve=RESERVE+rings.reduce((n,r)=>n+r.length,0)*256+(h+1)*96,
  coordinateBytes=e.cells<=0xffffffff?4:8,bytesPerCell=BYTES_PER_CELL+coordinateBytes;
 if(reserve>=memoryLimitBytes)throw fail('THALWEG_MEMORY','O limite da região exige mais memória que a disponível. Use uma área mais próxima do curso; a resolução nativa será preservada.');
 let regionCells=0,validCells=0,readWindows=0,min=Infinity,max=-Infinity,runCount=0,regionRuns=0,exteriorBytes=0;
 const rows=new Array(h),validRows=new Array(h),nd=source.noData??source.nodata;
 function memory(count=validCells,runs=runCount){
  const bytes=reserve+count*bytesPerCell+runs*96+regionRuns*32+exteriorBytes;
  if(bytes>memoryLimitBytes)throw fail('THALWEG_MEMORY','As células válidas dentro da área excedem a memória disponível. A área vazia já foi descartada e o MDT continua na resolução nativa.');
  return bytes;
 }
 // Scan-line parity represents concavities, holes and separate parts using
 // native column intervals, with no bitmap of the rectangular envelope.
 for(let row=0;row<h;row++){
  const y=north-(y0+row+.5)*csy,cross=[];
  for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
   const a=ring[j],b=ring[i];if((a[1]>y)!==(b[1]>y))cross.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
  }
  cross.sort((a,b)=>a-b);const intervals=[];
  for(let j=0;j+1<cross.length;j+=2){const a=Math.max(0,Math.ceil((cross[j]-source.xll)/cs-.5)-x0),b=Math.min(w,Math.ceil((cross[j+1]-source.xll)/cs-.5)-x0);
   if(b>a){intervals.push(a,b);regionCells+=b-a;regionRuns++;}
  }
  rows[row]=intervals;validRows[row]=[];
  memory();
  if((row&127)===0)await tick('mask',row/h);
 }
 if(!regionCells)throw fail('THALWEG_EMPTY','A região não contém centros de células do MDT.');
 const isValid=value=>Number.isFinite(value)&&!(Number.isFinite(nd)&&(value===nd||value===Math.fround(nd)));
 // Each source read is a bounded tile. An empty part of the rectangle does
 // not cause a read and a NoData cell never receives a graph allocation.
 async function visit(intervalRows,phase,accept){
  for(let row=0;row<h;row+=TILE){
   const columns=new Set(),hh=Math.min(TILE,h-row);
   for(let r=row;r<row+hh;r++)for(let i=0;i<intervalRows[r].length;i+=2){
    for(let c=Math.floor(intervalRows[r][i]/TILE);c<=Math.floor((intervalRows[r][i+1]-1)/TILE);c++)columns.add(c);
   }
   for(const tileCol of [...columns].sort((a,b)=>a-b)){
    const col=tileCol*TILE,ww=Math.min(TILE,w-col);check();
    const data=await source.readWindow([x0+col,y0+row,x0+col+ww,y0+row+hh]);check();readWindows++;
    if(!data||data.length!==ww*hh)throw fail('THALWEG_SOURCE','O MDT retornou um bloco nativo incompleto.');
    for(let r=0;r<hh;r++){const intervals=intervalRows[row+r];
     for(let i=0;i<intervals.length;i+=2){const a=Math.max(col,intervals[i]),b=Math.min(col+ww,intervals[i+1]);
      if(b>a)accept(row+r,a,b,data,r*ww-col);
     }
    }
    await tick(phase,Math.min(1,(row+hh)/h));
   }
  }
 }
 await visit(rows,'read',(row,a,b,data,offset)=>{
  const runs=validRows[row];let start=-1;
  for(let c=a;c<b;c++){
   const value=data[offset+c];
   if(isValid(value)){if(start<0)start=c;validCells++;min=Math.min(min,value);max=Math.max(max,value);}
   else if(start>=0){append(start,c);start=-1;}
  }
  if(start>=0)append(start,b);
  function append(a,b){if(runs.length&&runs.at(-1)===a)runs[runs.length-1]=b;else{runs.push(a,b);runCount++;}memory();}
 });
 if(validCells<3)throw fail('THALWEG_EMPTY','A região não tem cotas válidas suficientes no MDT.');
 memory();
 const exterior=await exteriorGrid(rows,w,h,tick,bytes=>{exteriorBytes=bytes;memory();});
 const rowOffsets=new Uint32Array(h+1),left=new Int32Array(runCount),right=new Int32Array(runCount),starts=new Uint32Array(runCount),
  nativeIndex=coordinateBytes===4?new Uint32Array(validCells):new Float64Array(validCells),z=new Float64Array(validCells);
 let at=0,node=0;
 for(let row=0;row<h;row++){
  rowOffsets[row]=at;
  for(let i=0;i<validRows[row].length;i+=2){const a=validRows[row][i],b=validRows[row][i+1];left[at]=a;right[at]=b;starts[at++]=node;
   for(let c=a;c<b;c++)nativeIndex[node++]=row*w+c;
  }
  rows[row]=null;
  if((row&127)===0)await tick('mask',row/h);
 }
 rowOffsets[h]=at;
 function idAt(row,col){
  if(row<0||col<0||row>=h||col>=w)return -1;
  let a=rowOffsets[row],b=rowOffsets[row+1]-1;
  while(a<=b){const i=(a+b)>>>1;if(col<left[i])b=i-1;else if(col>=right[i])a=i+1;else return starts[i]+col-left[i];}return -1;
 }
 await visit(validRows,'read',(row,a,b,data,offset)=>{
  let k=idAt(row,a);for(let c=a;c<b;c++){const value=data[offset+c];if(!isValid(value))throw abort();z[k++]=value;}
 });
 const exteriorAt=exterior.contains;
 e.estimatedBytes=memory();
 return {z,N:validCells,regionCells,validCells,min,max,readWindows,idAt,exteriorAt,
  rowOf:k=>Math.floor(nativeIndex[k]/w),colOf:k=>nativeIndex[k]%w,compact:true,runCount};
}
async function extract(source,options={}){
 const {signal,onProgress}=options;
 const check=()=>{if(signal?.aborted||source?.isCurrent&&!source.isCurrent()||options.isCurrent&&!options.isCurrent())throw abort();};
 let steps=0;
 const tick=async(phase,progress)=>{check();if(typeof onProgress==='function')onProgress({phase,progress});await new Promise(resolve=>setTimeout(resolve,0));check();};
 check();if(typeof source?.readWindow!=='function')throw fail('THALWEG_SOURCE','Leitor nativo do MDT indisponível.');
 const e=estimate(source,options.rings,options.memoryLimitBytes),{rings,window:[x0,y0,x1,y1],width:w,height:h,cs,csy,scale,north}=e;
 const edges=await validRings(rings,tick);check();
 let N=e.cells;const compact=e.compact?await compactGrid(source,e,tick,check):null;if(compact)N=compact.N;
 const rowOf=compact?compact.rowOf:k=>Math.floor(k/w),colOf=compact?compact.colOf:k=>k%w,
  idAt=compact?compact.idAt:(r,c)=>r<0||c<0||r>=h||c>=w?-1:r*w+c;
 // This bound includes the largest heap/queue and a decoded window. Arrays
 // are allocated only for the cropped region, never for the complete TIFF.
 const z=compact?compact.z:new Float64Array(N),filled=new Float64Array(N),receiver=new Int32Array(N).fill(-1),mask=new Uint8Array(N),
  indegree=new Uint8Array(N),blocked=new Uint8Array(N),acc=new Uint32Array(N),queue=new Int32Array(N),heap=new Int32Array(N);
 let regionCells=compact?.regionCells||0,validCells=compact?.validCells||0,min=compact?.min??Infinity,max=compact?.max??-Infinity,readWindows=compact?.readWindows||0;
 if(compact)mask.fill(2);
 else {
 for(let row=0;row<h;row++){
  const y=north-(y0+row+.5)*csy,cross=[];
  for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
   const a=ring[j],b=ring[i];if((a[1]>y)!==(b[1]>y))cross.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
  }
  cross.sort((a,b)=>a-b);
  for(let j=0;j+1<cross.length;j+=2){const a=Math.max(0,Math.ceil((cross[j]-source.xll)/cs-.5)-x0),b=Math.min(w,Math.ceil((cross[j+1]-source.xll)/cs-.5)-x0);
   for(let col=a;col<b;col++){const k=row*w+col;if(!mask[k]){mask[k]=1;regionCells++;}}
  }
  if((row&127)===0)await tick('mask',row/h);
 }
 if(!regionCells)throw fail('THALWEG_EMPTY','A região não contém centros de células do MDT.');
 const nd=source.noData??source.nodata;
 const tileWidth=Math.min(w,Math.max(TILE,Math.floor(262144/Math.min(h,TILE)))),tileHeight=Math.min(h,Math.max(1,Math.floor(262144/tileWidth)));
 for(let row=0;row<h;row+=tileHeight)for(let col=0;col<w;col+=tileWidth){
  const ww=Math.min(tileWidth,w-col),hh=Math.min(tileHeight,h-row);let any=false;
  for(let r=0;r<hh&&!any;r++)for(let c=0;c<ww;c++)if(mask[(row+r)*w+col+c]===1){any=true;break;}
  if(!any)continue;check();const data=await source.readWindow([x0+col,y0+row,x0+col+ww,y0+row+hh]);check();readWindows++;
  if(!data||data.length!==ww*hh)throw fail('THALWEG_SOURCE','O MDT retornou um bloco nativo incompleto.');
  for(let r=0;r<hh;r++)for(let c=0;c<ww;c++){
   const k=(row+r)*w+col+c;if(mask[k]!==1)continue;const value=data[r*ww+c];
   if(!Number.isFinite(value)||Number.isFinite(nd)&&(value===nd||value===Math.fround(nd))){mask[k]=5;continue;}
   z[k]=value;mask[k]=2;validCells++;min=Math.min(min,value);max=Math.max(max,value);
  }
  await tick('read',Math.min(1,(row*w+col+ww)/N));
 }
 }
 if(validCells<3)throw fail('THALWEG_EMPTY','A região não tem cotas válidas suficientes no MDT.');
 if(max-min<=Math.max(1,Math.abs(min),Math.abs(max))*1e-12)throw fail('THALWEG_FLAT','O MDT é plano nessa região; não há direção de talvegue confiável. Delimite uma área com fundo e saída identificáveis.');
 // A hole narrower than a cell may have no excluded cell centre. Block any
 // neighbour edge intersecting a polygon boundary, so a native-cell path
 // cannot jump across that hole or a narrow concavity of the region.
 let boundaryWork=0;
 for(const edge of edges){
  const a=[(edge.a[0]-source.xll)/cs-.5-x0,(north-edge.a[1])/csy-.5-y0],
   b=[(edge.b[0]-source.xll)/cs-.5-x0,(north-edge.b[1])/csy-.5-y0],dx=b[0]-a[0],dy=b[1]-a[1];
  let lo=0,hi=1,ok=true;
  for(const [p,q]of [[-dx,a[0]+1],[dx,w-a[0]],[-dy,a[1]+1],[dy,h-a[1]]]){
   if(!p){if(q<0){ok=false;break;}}else{const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);}
  }
  if(!ok||lo>hi)continue;
  const count=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))*(hi-lo)));
  for(let i=0;i<=count;i++){
   const t=lo+(hi-lo)*i/count,c0=Math.floor(a[0]+dx*t),r0=Math.floor(a[1]+dy*t);
   for(let r=Math.max(0,r0-1);r<=Math.min(h-1,r0+1);r++)for(let c=Math.max(0,c0-1);c<=Math.min(w-1,c0+1);c++){
    const k=idAt(r,c);if(k<0||mask[k]!==2)continue;
    for(let d=0;d<8;d++){
     if(blocked[k]&(1<<d))continue;const rr=r+DR[d],cc=c+DC[d];if(rr<0||rr>=h||cc<0||cc>=w||mask[idAt(rr,cc)]!==2)continue;
     if(Math.max(c,cc)<Math.min(a[0],b[0])||Math.min(c,cc)>Math.max(a[0],b[0])||Math.max(r,rr)<Math.min(a[1],b[1])||Math.min(r,rr)>Math.max(a[1],b[1]))continue;
     if(intersects([c,r],[cc,rr],a,b)){blocked[k]|=1<<d;blocked[idAt(rr,cc)]|=1<<((d+4)%8);}
    }
   }
   if((++boundaryWork&2047)===0)await tick('mask');
  }
 }
 // Mark only outside connected to the exterior. Interior polygon holes and
 // interior NoData remain walls; they must never become artificial outlets.
 let head=0,tail=0;
 function outside(k){if(mask[k]===0){mask[k]=4;queue[tail++]=k;}}
 if(!compact){
 for(let c=0;c<w;c++){outside(c);outside((h-1)*w+c);}for(let r=0;r<h;r++){outside(r*w);outside(r*w+w-1);}
 while(head<tail){const k=queue[head++],r=rowOf(k),c=colOf(k);
  if(c>0)outside(k-1);if(c+1<w)outside(k+1);if(r>0)outside(k-w);if(r+1<h)outside(k+w);
  if((head&16383)===0)await tick('route',0);
 }
 }
 let heapSize=0;
 const less=(a,b)=>filled[a]<filled[b]||filled[a]===filled[b]&&a<b;
 function push(k){let i=heapSize++;while(i){const p=(i-1)>>1;if(!less(k,heap[p]))break;heap[i]=heap[p];i=p;}heap[i]=k;}
 function pop(){const out=heap[0],x=heap[--heapSize];if(heapSize){let i=0;while(i*2+1<heapSize){let c=i*2+1;if(c+1<heapSize&&less(heap[c+1],heap[c]))c++;if(!less(heap[c],x))break;heap[i]=heap[c];i=c;}heap[i]=x;}return out;}
 function link(k,r,c,d){if(blocked[k]&(1<<d))return -1;const rr=r+DR[d],cc=c+DC[d];if(rr<0||cc<0||rr>=h||cc>=w)return -1;const q=idAt(rr,cc);if(q<0)return -1;
  if(mask[q]!==2&&mask[q]!==3)return -1;
  if(DC[d]&&DR[d]&&(![2,3].includes(mask[idAt(r,cc)])||![2,3].includes(mask[idAt(rr,c)])))return -1;
  return q;
 }
 let outletSeeds=0;
 for(let k=0;k<N;k++){if((k&16383)===0)await tick('route',0);if(mask[k]!==2)continue;const r=rowOf(k),c=colOf(k);
  if(!r||!c||r===h-1||c===w-1||(compact?compact.exteriorAt(r,c-1)||compact.exteriorAt(r,c+1)||compact.exteriorAt(r-1,c)||compact.exteriorAt(r+1,c):mask[k-1]===4||mask[k+1]===4||mask[k-w]===4||mask[k+w]===4)){mask[k]=3;filled[k]=z[k];push(k);outletSeeds++;}
 }
 if(!outletSeeds)throw fail('THALWEG_NO_OUTLET','Não há saída contínua do terreno para a borda da região. Redesenhe a área sem lacunas de MDT.');
 let routedCells=0,filledCells=0,maxFillM=0;head=tail=0;
 while(heapSize||head<tail){const k=head<tail?queue[head++]:pop(),r=rowOf(k),c=colOf(k);routedCells++;
  for(let d=0;d<8;d++){const q=link(k,r,c,d);if(q<0||mask[q]!==2)continue;
   mask[q]=3;receiver[q]=k;filled[q]=Math.max(z[q],filled[k]);
   const depth=filled[q]-z[q];if(depth>0){filledCells++;maxFillM=Math.max(maxFillM,depth);}
   if(z[q]<=filled[k])queue[tail++]=q;else push(q);
  }
  if((routedCells&8191)===0)await tick('route',routedCells/validCells);
 }
 // Replace the flood tree by steepest descent wherever relief is positive.
 // A flat keeps its flood parent: no artificial epsilon and no flow cycles.
 const distances=DC.map((dc,i)=>Math.hypot(dc*cs*scale,DR[i]*csy*scale));
 for(let k=0;k<N;k++)if(mask[k]===3){
  const r=rowOf(k),c=colOf(k);let best=0,next=receiver[k];
  for(let d=0;d<8;d++){const q=link(k,r,c,d);if(q<0||mask[q]!==3)continue;const slope=(filled[k]-filled[q])/distances[d];if(slope>best){best=slope;next=q;}}
  receiver[k]=next;acc[k]=1;if(next>=0)indegree[next]++;
  if((++steps&16383)===0)await tick('direction',k/N);
 }
 head=tail=0;for(let k=0;k<N;k++)if(mask[k]===3&&!indegree[k])queue[tail++]=k;
 let accumulated=0;
 while(head<tail){const k=queue[head++],q=receiver[k];accumulated++;if(q>=0){acc[q]+=acc[k];if(--indegree[q]===0)queue[tail++]=q;}
  if((head&16383)===0)await tick('accumulation',head/routedCells);
 }
 if(accumulated!==routedCells)throw fail('THALWEG_TOPOLOGY','A direção de fluxo não formou um percurso válido. Nenhuma linha foi gerada.');
 // Keep a bounded ranking, rather than sorting every boundary cell. A hole
 // may make the largest drainage tree a hillside route; examine the next
 // independent outlet instead of returning an unsupported valley.
 const candidates=[];let outletCount=0;
 const better=(a,b)=>acc[a]>acc[b]||acc[a]===acc[b]&&(z[a]<z[b]||z[a]===z[b]&&a<b);
 for(let k=0;k<N;k++){
  if(mask[k]===3&&receiver[k]<0){outletCount++;if(acc[k]<2)continue;
   let j=candidates.length;while(j&&better(k,candidates[j-1]))j--;
   if(j<64){candidates.splice(j,0,k);if(candidates.length>64)candidates.pop();}
  }
  if((k&16383)===0)await tick('line');
 }
 if(!candidates.length)throw fail('THALWEG_NO_CHANNEL','Não foi encontrado um percurso contínuo na região. Amplie o limite para incluir o fundo do vale.');
 let outlet=-1,count=0,pathFilledCells=0,maxPathFillM=0,supportCount=0,reliableSupport=false,firstGuide=null,
  trimLow=0,trimHigh=0,candidatesExamined=0,searchWork=0;
 // Both traversal and transverse tests have explicit budgets. No hidden
 // resampling or fabricated fallback is used when the region is unsuitable.
 const searchBudget=Math.max(2000000,Math.min(24000000,N*32));
 for(const candidate of candidates){
  outlet=candidate;count=0;candidatesExamined++;
 // Walk upstream using only real receiver edges. Independent minima, holes
 // and tributaries never acquire a straight connector in the result.
 let cur=outlet;
 while(cur>=0){queue[count++]=cur;const depth=filled[cur]-z[cur];if(depth>0){pathFilledCells++;maxPathFillM=Math.max(maxPathFillM,depth);}
  const r=rowOf(cur),c=colOf(cur);let upstream=-1;
  for(let d=0;d<8;d++){const q=link(cur,r,c,d);if(q<0||receiver[q]!==cur)continue;if(upstream<0||acc[q]>acc[upstream]||acc[q]===acc[upstream]&&z[q]<z[upstream])upstream=q;}
  if(++searchWork>searchBudget)throw fail('THALWEG_SEARCH_LIMIT','A busca de talvegue excedeu o limite de trabalho. Delimite uma região menor ao redor do fundo do vale.');
  cur=upstream;if(count>routedCells)throw fail('THALWEG_TOPOLOGY','Ciclo no percurso de drenagem.');
  if((count&8191)===0)await tick('line');
 }
 if(count<2)continue;
 // Flow paths can start on a hillslope. Identify the useful orientation
 // guide here; this path is refined against original cross-section lows
 // below and is never returned as the final extracted geometry.
 // Both sides must eventually rise near the floor (up to four cells of
 // D8 quantization). A mere inclined plane is not a valley. Sparse support
 // cannot collapse a long flow path to two apparently supported vertices.
 if(e.estimatedBytes+count*160>e.memoryLimitBytes)throw fail('THALWEG_MEMORY','A linha nativa excede o limite de memória. Delimite um trecho menor; nenhum vértice será descartado.');
 if(!firstGuide)firstGuide=queue.slice(0,count);
 const supported=indegree; supported.fill(0,0,count);supportCount=0;
 for(let i=0;i<count;i++){
  const k=queue[i],r=rowOf(k),c=colOf(k),u=queue[i===0?Math.min(count-1,32):i],v=queue[Math.max(0,i-32)],
   ur=rowOf(u),uc=colOf(u),vr=rowOf(v),vc=colOf(v),tx=(vc-uc)*cs,ty=(vr-ur)*csy,tlen=Math.hypot(tx,ty);
  if(!tlen)continue;let dir=0,alignment=Infinity;
  for(let d=0;d<4;d++){const px=DC[d]*cs,py=DR[d]*csy,dot=Math.abs(tx*px+ty*py)/(tlen*Math.hypot(px,py));if(dot<alignment){alignment=dot;dir=d;}}
  const rise=[false,false],depthTol=Math.max(1,Math.abs(z[k]))*1e-10,
   floorTolerance=Math.max(depthTol,2*Math.abs(z[u]-z[v])/Math.max(1,Math.max(Math.abs(vc-uc),Math.abs(vr-ur))));
  for(let side=0;side<2;side++){
   const d=side?(dir+4)%8:dir;let prev=k,rr=r,cc=c,lowest=z[k];
   for(let n=1;n<=128;n++){
    if(++searchWork>searchBudget)throw fail('THALWEG_SEARCH_LIMIT','A busca de talvegue excedeu o limite de trabalho. Delimite uma região menor ao redor do fundo do vale.');
    const q=link(prev,rr,cc,d);if(q<0||mask[q]!==3)break;rr+=DR[d];cc+=DC[d];prev=q;
    if(z[q]<lowest-depthTol){lowest=z[q];if(n>4||z[k]-lowest>floorTolerance)break;}
    if(z[q]>z[k]+depthTol){rise[side]=true;break;}
   }
  }
  if(rise[0]&&rise[1]){supported[i]=1;supportCount++;}
  if((i&2047)===0)await tick('line');
 }
 reliableSupport=supportCount>=Math.max(3,Math.ceil(count*.1));
 if(!reliableSupport)continue;
 trimLow=0;trimHigh=count-1;
 while(trimLow<trimHigh&&!supported[trimLow])trimLow++;
 while(trimHigh>trimLow&&!supported[trimHigh])trimHigh--;
 // Three native cells is the minimum supported extent, never a two-point
 // connector created between isolated hints of a valley.
 if(trimHigh-trimLow<2){reliableSupport=false;continue;}
 break;
 }
 if(!reliableSupport){if(!firstGuide)throw fail('THALWEG_NO_VALLEY','Não foi identificado um fundo de vale contínuo nessa região.');queue.set(firstGuide);count=firstGuide.length;}
 // The flow tree is an orientation guide, not the extracted floor. In a
 // filled depression its parent can run along a bank, and contributing area
 // alone does not identify the lowest original terrain in a cross section.
 const originalPointCount=count,trimmedHeadCells=reliableSupport?count-1-trimHigh:0,trimmedTailCells=reliableSupport?trimLow:0;
 if(trimmedTailCells||trimmedHeadCells){queue.copyWithin(0,trimLow,trimHigh+1);count=trimHigh-trimLow+1;}
 const contributingCells=acc[queue[0]],nativeDepth=new Float32Array(N);
 for(let k=0;k<N;k++){if(mask[k]===3)nativeDepth[k]=filled[k]-z[k];if((k&32767)===0)await tick('sections');}
 firstGuide=null;
 let nativeGuide=queue.slice(0,count),refinementPasses=0,sectionMeanAboveM=0,sectionMaxAboveM=0,lastSectionRelief=null,refinedTrimmedHeadCells=0,refinedTrimmedTailCells=0;
 const stepM=Math.min(cs,csy),costHeightM=.15,refineBudget=Math.max(2000000,Math.min(24000000,N*32));
 const xy=k=>{const r=rowOf(k);return [colOf(k)*cs,r*csy];};
 async function refineFloor(guide,curved){
  const first=xy(guide[0]),last=xy(guide.at(-1)),chord=Math.hypot(last[0]-first[0],last[1]-first[1]);
  if(!chord)throw fail('THALWEG_NO_CHANNEL','O percurso não tem extensão útil para extrair o fundo.');
  // A short moving average is only an orientation aid. The final geometry
  // still consists exclusively of adjacent, unmodified native source cells.
  const stride=16,radius=16,gx=[],gy=[],gs=[],anchors=[];let sectionLength=chord;
  if(curved){
   let sx=0,sy=0,lo=0,hi=-1;
   for(let i=0;i<guide.length;i+=stride){
    const a=Math.max(0,i-radius),b=Math.min(guide.length-1,i+radius);
    while(hi<b){const p=xy(guide[++hi]);sx+=p[0];sy+=p[1];}
    while(lo<a){const p=xy(guide[lo++]);sx-=p[0];sy-=p[1];}
    const p=i===0?first:[sx/(b-a+1),sy/(b-a+1)];gx.push(p[0]);gy.push(p[1]);anchors.push(i);
   }
   if(anchors.at(-1)!==guide.length-1){gx.push(last[0]);gy.push(last[1]);anchors.push(guide.length-1);}
   gs.push(0);for(let i=1;i<gx.length;i++)gs.push(gs[i-1]+Math.hypot(gx[i]-gx[i-1],gy[i]-gy[i-1]));sectionLength=gs.at(-1);
  }
  const bins=Math.max(2,Math.round(sectionLength/stepM)+1);
  if(!Number.isSafeInteger(bins)||e.estimatedBytes+guide.length*160+bins*12>e.memoryLimitBytes)throw fail('THALWEG_MEMORY','As seções nativas excedem o limite de memória. Delimite um trecho menor; a resolução do MDT será mantida.');
  const floor=new Float64Array(bins).fill(Infinity),floorCell=new Int32Array(bins).fill(-1),tx=(last[0]-first[0])/chord,ty=(last[1]-first[1])/chord;
  // Native geodesic ownership keeps separate components apart. Propagation
  // uses the same boundary, hole and NoData tests as the final path graph.
  queue.fill(-1);let head=0,tail=0,work=0;
  for(let i=0;i<guide.length;i++){const k=guide[i];if(queue[k]<0){queue[k]=curved?Math.min(gx.length-2,Math.floor(i/stride)):0;receiver[tail++]=k;}}
  while(head<tail){const k=receiver[head++],r=rowOf(k),c=colOf(k);
   for(let d=0;d<8;d++){const q=link(k,r,c,d);if(q<0||queue[q]>=0)continue;queue[q]=queue[k];receiver[tail++]=q;}
   if((head&8191)===0)await tick('sections',head/Math.max(1,routedCells));
  }
  for(let k=0;k<N;k++){
   if(queue[k]<0)continue;const p=xy(k);let at=0,valid=true;
   if(!curved){at=(p[0]-first[0])*tx+(p[1]-first[1])*ty;valid=at>=-stepM*.5&&at<=chord+stepM*.5;}
   else{
    let best=Infinity,bestSeg=-1,bestT=0;
    const seed=queue[k],a=Math.max(0,seed-3),b=Math.min(gx.length-2,seed+3);
    for(let j=a;j<=b;j++){
     if(++work>refineBudget)throw fail('THALWEG_SEARCH_LIMIT','A busca do fundo excedeu o limite de trabalho. Delimite uma região menor; a resolução nativa será mantida.');
     const dx=gx[j+1]-gx[j],dy=gy[j+1]-gy[j],den=dx*dx+dy*dy;if(!den)continue;
     const t=((p[0]-gx[j])*dx+(p[1]-gy[j])*dy)/den,u=Math.max(0,Math.min(1,t)),dd=(p[0]-gx[j]-u*dx)**2+(p[1]-gy[j]-u*dy)**2;
     if(dd<best){best=dd;bestSeg=j;bestT=t;at=gs[j]+u*(gs[j+1]-gs[j]);}
    }
    valid=bestSeg>=0&&!(bestSeg===0&&bestT<0)&&!(bestSeg===gx.length-2&&bestT>1);
   }
   if(!valid){queue[k]=-1;continue;}const bin=Math.max(0,Math.min(bins-1,Math.round(at/stepM)));queue[k]=bin;
   if(z[k]<floor[bin]||z[k]===floor[bin]&&k<floorCell[bin]){floor[bin]=z[k];floorCell[bin]=k;}
   if((k&16383)===0)await tick('sections',k/N);
  }
  let low=0,high=bins-1;while(low<high&&floorCell[low]<0)low++;while(high>low&&floorCell[high]<0)high--;
  if(low===high)throw fail('THALWEG_NO_CHANNEL','Não há seções contínuas suficientes para extrair o fundo.');
  let start=floorCell[low],goal=floorCell[high];if(z[start]<z[goal])[start,goal]=[goal,start];
  filled.fill(Infinity);receiver.fill(-1);acc.fill(0);let size=0,popped=0;
  const costLess=(a,b)=>filled[a]<filled[b]||filled[a]===filled[b]&&a<b;
  function offer(k){let i=acc[k]?acc[k]-1:size++;while(i){const p=(i-1)>>1;if(!costLess(k,heap[p]))break;heap[i]=heap[p];acc[heap[i]]=i+1;i=p;}heap[i]=k;acc[k]=i+1;}
  function take(){const out=heap[0],x=heap[--size];acc[out]=0xffffffff;if(size){let i=0;while(i*2+1<size){let c=i*2+1;if(c+1<size&&costLess(heap[c+1],heap[c]))c++;if(!costLess(heap[c],x))break;heap[i]=heap[c];acc[heap[i]]=i+1;i=c;}heap[i]=x;acc[x]=i+1;}return out;}
  const weight=k=>1+64*(Math.max(0,z[k]-floor[queue[k]])/costHeightM)**2;
  filled[start]=0;offer(start);work=0;await tick('refine',0);
  while(size){const k=take();if(k===goal)break;const r=rowOf(k),c=colOf(k),a=weight(k);popped++;
   for(let d=0;d<8;d++){
    const q=link(k,r,c,d);if(q<0||queue[q]<0||acc[q]===0xffffffff)continue;
    if(++work>refineBudget)throw fail('THALWEG_SEARCH_LIMIT','A busca do fundo excedeu o limite de trabalho. Delimite uma região menor; a resolução nativa será mantida.');
    const up=Math.max(0,z[q]-z[k]),cost=filled[k]+distances[d]*((a+weight(q))*.5+8*(up/costHeightM)**2);
    if(cost<filled[q]){filled[q]=cost;receiver[q]=k;offer(q);}
   }
   if((popped&8191)===0)await tick('refine',popped/Math.max(1,tail));
  }
  if(!Number.isFinite(filled[goal]))throw fail('THALWEG_NO_CHANNEL','Os fundos encontrados não têm continuidade na região. Nenhuma conexão artificial foi criada.');
  const result=[];let cur=goal,total=0,peak=0;
  while(cur>=0){result.push(cur);if(e.estimatedBytes+result.length*160>e.memoryLimitBytes)throw fail('THALWEG_MEMORY','A linha nativa excede o limite de memória. Delimite um trecho menor; nenhum vértice será descartado.');const above=Math.max(0,z[cur]-floor[queue[cur]]);total+=above;peak=Math.max(peak,above);cur=receiver[cur];if(result.length>routedCells)throw fail('THALWEG_TOPOLOGY','Ciclo no caminho do fundo.');}
  lastSectionRelief=Float32Array.from(result,k=>Math.max(0,z[k]-floor[queue[k]]));sectionMeanAboveM=total/result.length;sectionMaxAboveM=peak;refinementPasses++;return Int32Array.from(result);
 }
 // A nearly monotone guide benefits from a first broad transverse pass: it
 // can leave an arbitrary bank route created by depression filling. Strong
 // bends use locally oriented sections immediately, including U-shaped ROIs.
 {const a=xy(nativeGuide[0]),b=xy(nativeGuide.at(-1)),dx=b[0]-a[0],dy=b[1]-a[1],chord=Math.hypot(dx,dy);let length=0,forward=0;
  for(let i=1;i<nativeGuide.length;i++){const p=xy(nativeGuide[i-1]),q=xy(nativeGuide[i]);length+=Math.hypot(q[0]-p[0],q[1]-p[1]);if((q[0]-p[0])*dx+(q[1]-p[1])*dy>=0)forward++;}
  if(chord>0&&length/chord<1.65&&forward>=.9*(nativeGuide.length-1))nativeGuide=await refineFloor(nativeGuide,false);
 }
 nativeGuide=await refineFloor(nativeGuide,true);queue.set(nativeGuide);count=nativeGuide.length;
 // Verify the final native path against its local cross-valley direction.
 // A bare plane must not become a fabricated channel along the ROI boundary.
 supportCount=0;indegree.fill(0,0,count);
 for(let i=0;i<count;i++){
  const k=queue[i],r=rowOf(k),c=colOf(k),a=xy(queue[Math.max(0,i-16)]),b=xy(queue[Math.min(count-1,i+16)]),tx=b[0]-a[0],ty=b[1]-a[1],len=Math.hypot(tx,ty);if(!len)continue;
  const u=queue[Math.max(0,i-16)],v=queue[Math.min(count-1,i+16)],rise=[false,false],tol=Math.max(1,Math.abs(z[k]))*1e-10,
   floorTolerance=Math.max(tol,4*Math.abs(z[u]-z[v])/Math.max(1,len/stepM)),nx=-ty/len,ny=tx/len;
  // The transverse test uses a continuous normal. Rounding it to one of
  // eight directions can turn longitudinal grade into a false bank drop
  // on broad, shallow valleys. Interpolation is evaluation only: output XY
  // and Z remain exact native cells, and invalid raster corners stop a ray.
  function profile(px,py){if(px<0||py<0||px>w-1||py>h-1||w<2||h<2)return null;const cc=Math.min(w-2,Math.floor(px)),rr=Math.min(h-2,Math.floor(py));
   const q=idAt(rr,cc),qe=idAt(rr,cc+1),qs=idAt(rr+1,cc),qse=idAt(rr+1,cc+1);if(mask[q]!==3||mask[qe]!==3||mask[qs]!==3||mask[qse]!==3)return null;
   if(link(q,rr,cc,0)!==qe||link(q,rr,cc,2)!==qs||link(qe,rr,cc+1,2)!==qse||link(qs,rr+1,cc,0)!==qse)return null;
   const fx=px-cc,fy=py-rr;return z[q]*(1-fx)*(1-fy)+z[qe]*fx*(1-fy)+z[qs]*(1-fx)*fy+z[qse]*fx*fy;
  }
  for(let side=0;side<2;side++){const sign=side?-1:1;for(let n=1;n<=128;n++){const value=profile(c+sign*nx*n*stepM/cs,r+sign*ny*n*stepM/csy);if(value===null)break;if(value<z[k]-floorTolerance)break;if(value>z[k]+tol){rise[side]=true;break;}}}
  if(rise[0]&&rise[1]){supportCount++;indegree[i]=1;}
  if((i&2047)===0)await tick('verify',i/count);
 }
 reliableSupport=supportCount>=Math.max(3,Math.ceil(count*.1));
 if(!reliableSupport)throw fail('THALWEG_NO_VALLEY','Não foi identificado um fundo de vale nessa região. Inclua as duas margens e um trecho do fundo; nenhuma linha foi gerada.');
 // Section end caps can contain only a bank cell near the crop boundary or
 // a barrier. Remove those unsupported tails, never an internal connector.
 {let a=0,b=count-1;while(a<b&&!indegree[a])a++;while(b>a&&!indegree[b])b--;
  if(b-a<2)throw fail('THALWEG_NO_VALLEY','Não foi identificado um trecho contínuo de fundo de vale.');
  refinedTrimmedTailCells=a;refinedTrimmedHeadCells=count-1-b;
  if(a||b<count-1){queue.copyWithin(0,a,b+1);count=b-a+1;let total=0;sectionMaxAboveM=0;for(let i=a;i<=b;i++){total+=lastSectionRelief[i];sectionMaxAboveM=Math.max(sectionMaxAboveM,lastSectionRelief[i]);}sectionMeanAboveM=total/count;}
 }
 pathFilledCells=0;maxPathFillM=0;
 for(let i=0;i<count;i++){const depth=nativeDepth[queue[i]];if(depth>0){pathFilledCells++;maxPathFillM=Math.max(maxPathFillM,depth);}}

 // Reserve room for JavaScript XYZ arrays and serialization as well as raster
 // arrays. Large paths fail explicitly; no vertex is silently decimated.
 if(e.estimatedBytes+count*160>e.memoryLimitBytes)throw fail('THALWEG_MEMORY','A linha nativa excede o limite de memória. Delimite um trecho menor; nenhum vértice será descartado.');
 const line=[];let lengthM=0,rises=0;
 for(let i=count-1;i>=0;i--){const k=queue[i],row=rowOf(k),col=colOf(k),p=[source.xll+(x0+col+.5)*cs,north-(y0+row+.5)*csy,z[k]],lastPoint=line.at(-1);
  if(lastPoint){lengthM+=Math.hypot(p[0]-lastPoint[0],p[1]-lastPoint[1])*scale;if(p[2]>lastPoint[2]+1e-9)rises++;}line.push(p);
  if((line.length&8191)===0)await tick('line',line.length/count);
 }
 const flags=[];if(pathFilledCells)flags.push('conditioned_depressions');if(rises)flags.push('original_elevation_rises');if(routedCells<validCells)flags.push('disconnected_terrain');
 if(!reliableSupport)flags.push('weak_valley_support');flags.push('contributing_area_clipped');
 const stats={nativeResolution:e.nativeResolution,validCells,regionCells,routedCells,unroutedCells:validCells-routedCells,readWindows,
  lengthM,dropM:line[0][2]-line.at(-1)[2],filledCells,maxFillM,pathFilledCells,maxPathFillM,originalElevationRises:rises,
  valleySupportedCells:supportCount,candidatesExamined,trimmedHeadCells,trimmedTailCells,originalPointCount,contributingCells,contributingAreaM2:contributingCells*cs*csy*scale*scale,contributingAreaFromGuide:true,refinementPasses,sectionMeanAboveM,sectionMaxAboveM,refinedTrimmedHeadCells,refinedTrimmedTailCells,outletCount,pointCount:line.length,
  memoryEstimateBytes:e.estimatedBytes+count*160,window:e.window,windowCells:e.cells,compactNativeGraph:!!compact,graphCells:N,flags};
 await tick('done',1);check();return {line,stats};
}
root.GeoMineThalwegEngine=Object.freeze({extract,estimate});
})(typeof window!=='undefined'?window:globalThis);
