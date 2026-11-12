/* Calha por altura: conexão entre células nativas, lidas sob demanda.
   O retângulo que envolve o eixo nunca é alocado como uma grade de cálculo. */
(function(){
'use strict';
const MB=1048576,PROFILE_BUDGET=160000,MAX_SECTIONS=2000;
const fail=(code,message)=>Object.assign(Error(message),{code});
const xy=p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
const stableCeil=v=>Math.max(1,Math.ceil(v-1e-7));
function signedArea(r){
  const o=r[0];let sum=0,correction=0;
  for(let i=1;i<r.length-1;i++){const term=(r[i][0]-o[0])*(r[i+1][1]-o[1])-(r[i+1][0]-o[0])*(r[i][1]-o[1]),v=term-correction,n=sum+v;correction=(n-sum)-v;sum=n;}
  return sum/2;
}
function interior(r){
  const levels=[...new Set(r.map(p=>p[1]))].sort((a,b)=>a-b);let gap=0,y=null;
  for(let i=1;i<levels.length;i++)if(levels[i]-levels[i-1]>gap){gap=levels[i]-levels[i-1];y=levels[i-1]+gap/2;}
  if(y===null)return null;
  const xs=[];for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[j],b=r[i];if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));}
  xs.sort((a,b)=>a-b);let width=0,p=null;
  for(let i=1;i<xs.length;i+=2)if(xs[i]-xs[i-1]>width){width=xs[i]-xs[i-1];p=[xs[i-1]+width/2,y];}return p;
}
function inside(p,r){
  if(!p)return false;let hit=false;
  for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;
}
function groupRings(rings){
  if(typeof ringsToPolys==='function')return ringsToPolys(rings);
  const rows=rings.map(r=>({r,area:Math.abs(signedArea(r)),p:interior(r),parent:null,depth:0})).sort((a,b)=>b.area-a.area);
  for(let i=0;i<rows.length;i++){const a=rows[i];for(let j=0;j<i;j++){const b=rows[j];if(b.area>a.area&&(!a.parent||b.area<a.parent.area)&&inside(a.p,b.r))a.parent=b;}a.depth=a.parent?a.parent.depth+1:0;}
  const out=[];for(const a of rows)if(!(a.depth%2)){a.poly=[a.r];out.push(a.poly);}for(const a of rows)if(a.depth%2)a.parent.poly.push(a.r);return out;
}
async function analyze(sampler,line,options={},context={}){
  const height=Number(options.height),interval=Number(options.interval),reach=Number(options.reach),resolution=Number(sampler?.resolution),g=sampler?.grid;
  if(![height,interval,reach,resolution].every(v=>Number.isFinite(v)&&v>0)||!g||typeof sampler.readWindow!=='function'||typeof sampler.sample!=='function'||typeof sampler.toWork!=='function'||typeof sampler.toRaster!=='function')throw fail('CHANNEL_INVALID_INPUT','Faltam parâmetros ou a leitura nativa do MDT para extrair a calha.');
  if(!window.GeoMineNativeFloodEngine?.analyzeByField)throw fail('CHANNEL_INVALID_INPUT','Atualize o aplicativo para usar a extração nativa em blocos.');
  if(!Array.isArray(line)||line.length<2||line.some(p=>!xy(p)))throw fail('CHANNEL_INVALID_INPUT','Escolha uma linha contínua com coordenadas válidas.');
  const memoryLimit=Math.max(16,Number(options.maxMemoryMB)||192)*MB;
  if(line.length*256>memoryLimit/3)throw fail('CHANNEL_LIMIT','O eixo excede o orçamento de memória para a análise nativa. Simplifique uma cópia do eixo; a resolução do MDT não será alterada.');
  let lastYield=Date.now(),lastProgress=0;
  const check=()=>{if(context.signal?.aborted||context.isCurrent?.()===false||sampler.isCurrent?.()===false){const e=fail('CHANNEL_CANCELLED','Análise cancelada ou dados alterados. Nenhuma calha foi gravada.');e.name='AbortError';throw e;}};
  const checkpoint=async(force=false)=>{check();if(force||Date.now()-lastYield>=8){await new Promise(r=>setTimeout(r,0));lastYield=Date.now();check();}};
  const progress=(phase,message,extra={},force=false)=>{check();if(force||Date.now()-lastProgress>=80){lastProgress=Date.now();context.onProgress?.({phase,message,...extra});}};
  check();progress('reference','Preparando o eixo e a referência do MDT…',{},true);
  const segments=[],distances=[0];let length=0,referenceCount=1;
  const sourceCRS=sampler.sourceCRS,workCRS=options.workCRS||options.crs;
  // Projection adapters are also valid when the native grid has another CRS.
  const originWork=sampler.toWork([g.xll,g.yll]),eastWork=sampler.toWork([g.xll+g.cs,g.yll]),northWork=sampler.toWork([g.xll,g.yll+(g.csy||g.cs)]);
  const nativeX=Math.hypot(eastWork[0]-originWork[0],eastWork[1]-originWork[1]),nativeY=Math.hypot(northWork[0]-originWork[0],northWork[1]-originWork[1]);
  const refStep=Math.min(resolution,nativeX,nativeY)/2;
  if(!(refStep>0&&Number.isFinite(refStep)))throw fail('CHANNEL_INVALID_INPUT','Não foi possível interpretar os pixels nativos do MDT em metros.');
  for(let i=1;i<line.length;i++){
    const a=line[i-1],b=line[i],v=[b[0]-a[0],b[1]-a[1]],size=Math.hypot(...v);if(size<=1e-10)continue;
    const divisions=stableCeil(size/refStep),s={a,b,v,length:size,station:length,divisions,box:[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])]};
    segments.push(s);length+=size;distances.push(length);referenceCount+=divisions;
    if((i&4095)===0)await checkpoint();
  }
  if(!segments.length)throw fail('CHANNEL_INVALID_GEOMETRY','O eixo não tem extensão mensurável.');
  const auxiliary=segments.length*256+referenceCount*16+32*MB;
  if(auxiliary>memoryLimit*.55)throw fail('CHANNEL_LIMIT','A referência do eixo excede a memória disponível. Processe uma cópia menor do eixo; a grade nativa será preservada.');
  const referenceStations=new Float64Array(referenceCount),referenceZ=new Float64Array(referenceCount);
  let cursor=0,batch=[],indices=[],missingReferences=0,actualRefStep=0;
  async function readPoints(points){
    // Read exact stored cells at native centres, including beside NoData.
    const values=new Array(points.length),native=[],nativeIndices=[],smooth=[],smoothIndices=[];
    for(let i=0;i<points.length;i++){
      const p=points[i],q=sampler.toRaster(p),c=(q[0]-g.xll)/g.cs-.5,r=g.nr-.5-(q[1]-g.yll)/(g.csy||g.cs),
        tolerance=32*Number.EPSILON*Math.max(1,Math.abs(q[0]),Math.abs(q[1]))/Math.min(g.cs,g.csy||g.cs),cell=sampler.locate?.(p);
      if(cell&&typeof sampler.cells==='function'&&Math.abs(c-Math.round(c))<=tolerance&&Math.abs(r-Math.round(r))<=tolerance){native.push([cell.col,cell.row]);nativeIndices.push(i);}
      else{smooth.push(p);smoothIndices.push(i);}
    }
    if(native.length){const z=await sampler.cells(native);nativeIndices.forEach((i,k)=>values[i]=z[k]);}
    if(smooth.length){const z=await sampler.sample(smooth);smoothIndices.forEach((i,k)=>values[i]=z[k]);}
    check();return values;
  }
  async function flush(){if(!batch.length)return;const z=await readPoints(batch);for(let j=0;j<z.length;j++){referenceZ[indices[j]]=Number.isFinite(z[j])?z[j]:NaN;if(!Number.isFinite(z[j]))missingReferences++;}batch=[];indices=[];progress('reference','Lendo as cotas do eixo no MDT original…',{progress:.1+.15*cursor/referenceCount});await checkpoint();}
  for(let si=0;si<segments.length;si++){
    const s=segments[si];actualRefStep=Math.max(actualRefStep,s.length/s.divisions);
    for(let j=si?1:0;j<=s.divisions;j++){
      const u=j/s.divisions;referenceStations[cursor]=s.station+u*s.length;
      batch.push(j===s.divisions?s.b.slice(0,2):[s.a[0]+u*s.v[0],s.a[1]+u*s.v[1]]);indices.push(cursor++);
      if(batch.length>=4096)await flush();
    }
  }
  await flush();
  function atStation(t){
    let lo=0,hi=referenceCount-1;while(lo+1<hi){const m=(lo+hi)>>1;if(referenceStations[m]<=t)lo=m;else hi=m;}
    const epsilon=64*Number.EPSILON*Math.max(1,length,Math.abs(t));
    // An exact valid reference must not become NaN through 0 * NaN in
    // the neighbouring sample. Only interpolation requires two valid ends.
    if(Math.abs(t-referenceStations[lo])<=epsilon)return referenceZ[lo];
    if(Math.abs(t-referenceStations[hi])<=epsilon)return referenceZ[hi];
    const u=Math.max(0,Math.min(1,(t-referenceStations[lo])/(referenceStations[hi]-referenceStations[lo])));
    return referenceZ[lo]+u*(referenceZ[hi]-referenceZ[lo]);
  }
  function atPoint(t){let lo=0,hi=segments.length;while(lo+1<hi){const m=(lo+hi)>>1;if(segments[m].station<=t)lo=m;else hi=m;}const s=segments[lo],u=Math.max(0,Math.min(1,(t-s.station)/s.length));return [s.a[0]+s.v[0]*u,s.a[1]+s.v[1]*u];}
  function tree(items){
    const box=[Infinity,Infinity,-Infinity,-Infinity];for(const s of items){box[0]=Math.min(box[0],s.box[0]);box[1]=Math.min(box[1],s.box[1]);box[2]=Math.max(box[2],s.box[2]);box[3]=Math.max(box[3],s.box[3]);}
    if(items.length<=8)return {box,items};const k=box[2]-box[0]>=box[3]-box[1]?0:1;items.sort((a,b)=>a.box[k]+a.box[k+2]-b.box[k]-b.box[k+2]);const m=items.length>>1;return {box,left:tree(items.slice(0,m)),right:tree(items.slice(m))};
  }
  const root=tree(segments.slice()),boxDistance=(p,b)=>Math.max(b[0]-p[0],0,p[0]-b[2])**2+Math.max(b[1]-p[1],0,p[1]-b[3])**2;
  function nearest(p){
    let best=null,d2=Infinity;const pending=[root];
    while(pending.length){const node=pending.pop();if(boxDistance(p,node.box)>d2+1e-10)continue;
      if(node.items){for(const s of node.items){const t=Math.max(0,Math.min(1,((p[0]-s.a[0])*s.v[0]+(p[1]-s.a[1])*s.v[1])/(s.length*s.length))),q=[s.a[0]+t*s.v[0],s.a[1]+t*s.v[1]],d=(p[0]-q[0])**2+(p[1]-q[1])**2;
        if(d<d2-1e-10||Math.abs(d-d2)<=1e-10&&(!best||q[0]<best.point[0]-1e-10||Math.abs(q[0]-best.point[0])<=1e-10&&q[1]<best.point[1])){d2=d;best={station:s.station+t*s.length,point:q,distance:Math.sqrt(d)};}
      }}else{const a=boxDistance(p,node.left.box),b=boxDistance(p,node.right.box);if(a<b)pending.push(node.right,node.left);else pending.push(node.left,node.right);}
    }return best;
  }
  const csy=g.csy||g.cs,north=g.yll+g.nr*csy,first=segments[0],last=segments.at(-1);
  const normalAt=t=>{let span=interval,tangent=null;while(span>=resolution*2){const a=atPoint(Math.max(0,t-span/2)),b=atPoint(Math.min(length,t+span/2)),v=[b[0]-a[0],b[1]-a[1]],covered=Math.min(length,t+span/2)-Math.max(0,t-span/2);if(Math.hypot(...v)>=covered*.5){tangent=v;break;}span/=2;}
    if(!tangent){const p=atPoint(t),s=segments.find(s=>t>=s.station-1e-8&&t<=s.station+s.length+1e-8)||first;tangent=s.v;}
    const norm=Math.hypot(...tangent);return [-tangent[1]/norm,tangent[0]/norm];};
  // End caps follow the guide itself. Changing the spacing of review
  // profiles must never change the extracted native cell mask.
  const n0=[-first.v[1]/first.length,first.v[0]/first.length],n1=[-last.v[1]/last.length,last.v[0]/last.length],start=first.a,end=last.b;
  const boundary={drySeedCells:0,noDataSeedCells:0,missingReferenceSamples:missingReferences,searchBoundaryEdges:0,noDataBoundaryEdges:0};
  const cellPoint=(col,row)=>sampler.toWork([g.xll+(col+.5)*g.cs,north-(row+.5)*csy]);
  function referenceAtCell(col,row){const p=cellPoint(col,row),n=nearest(p);return {p,n,level:atStation(n.station)+height};}
  function classifyCell(col,row,z){
    const {p,n,level}=referenceAtCell(col,row);
    const cap=n.station<=1e-8&&((p[0]-start[0])*n0[1]-(p[1]-start[1])*n0[0])< -1e-9||n.station>=length-1e-8&&((p[0]-end[0])*n1[1]-(p[1]-end[1])*n1[0])>1e-9;
    if(cap)return null;
    if(n.distance>reach+1e-9){boundary.searchBoundaryEdges++;return null;}
    if(!Number.isFinite(z)||!Number.isFinite(level)){boundary.noDataBoundaryEdges++;return null;}
    return level-z;
  }
  function* seeds(){
    for(const s of segments){
      const a=sampler.toRaster(s.a),b=sampler.toRaster(s.b),snap=v=>Math.abs(v-Math.round(v))<=1e-8?Math.round(v):v;
      let p=[snap((a[0]-g.xll)/g.cs),snap((north-a[1])/csy)],q=[snap((b[0]-g.xll)/g.cs),snap((north-b[1])/csy)];
      // Canonical order makes cell ownership at a grid corner independent
      // of the direction in which the same guide was drawn.
      if(p[0]>q[0]||p[0]===q[0]&&p[1]>q[1])[p,q]=[q,p];
      const dx=q[0]-p[0],dy=q[1]-p[1];
      let lo=0,hi=1;for(const [v,w]of [[-dx,p[0]],[dx,g.nc-p[0]],[-dy,p[1]],[dy,g.nr-p[1]]]){if(Math.abs(v)<1e-15){if(w<0){hi=-1;break;}}else{const t=w/v;if(v<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);}}
      if(lo>hi)continue;
      const x=snap(p[0]+dx*lo),y=snap(p[1]+dy*lo),ex=snap(p[0]+dx*hi),ey=snap(p[1]+dy*hi),sx=Math.sign(dx),sy=Math.sign(dy),duration=hi-lo;
      let col=Math.max(0,Math.min(g.nc-1,Math.floor(x))),row=Math.max(0,Math.min(g.nr-1,Math.floor(y))),ec=Math.max(0,Math.min(g.nc-1,Math.floor(ex))),er=Math.max(0,Math.min(g.nr-1,Math.floor(ey))),
        tx=sx?((sx>0?col+1:col)-x)/dx:Infinity,ty=sy?((sy>0?row+1:row)-y)/dy:Infinity,stepX=sx?Math.abs(1/dx):Infinity,stepY=sy?Math.abs(1/dy):Infinity;
      const maxSteps=Math.abs(ec-col)+Math.abs(er-row)+4;
      for(let count=0;count<=maxSteps;count++){
        if(col<0||row<0||col>=g.nc||row>=g.nr)break;yield {col,row};if(col===ec&&row===er)break;
        // The endpoint cell can be skipped by a corner tie. Bound the
        // parameter explicitly instead of extrapolating to the raster edge.
        const next=Math.min(tx,ty),epsilon=64*Number.EPSILON*Math.max(1,Math.abs(next),duration);
        if(!Number.isFinite(next)||next>duration+epsilon)break;
        if(Math.abs(tx-ty)<=epsilon){col+=sx;row+=sy;tx+=stepX;ty+=stepY;}
        else if(tx<ty){col+=sx;tx+=stepX;}else{row+=sy;ty+=stepY;}
      }
      yield {col:ec,row:er};
    }
  }
  let flood;
  try{
    progress('flood','Preenchendo a calha em blocos do MDT original…',{},true);
    flood=await GeoMineNativeFloodEngine.analyzeByField({nc:g.nc,nr:g.nr,cs:g.cs,csy,xll:g.xll,yll:g.yll,unitScale:resolution/Math.min(g.cs,csy),readWindow:window=>sampler.readWindow(window),isCurrent:()=>{check();return true;}},
      {seeds:seeds(),classifyCell,signal:context.signal,tileSize:options.tileSize||256,maxMemoryMB:(memoryLimit-auxiliary)/MB,decodedCacheMB:16,
        onProgress:p=>progress(p.phase,p.phase==='contour'?'Traçando o contorno das células molhadas…':'Lendo MDT em blocos · '+(p.readWindows||0)+' blocos · '+(p.nWet||0).toLocaleString('pt-BR')+' células molhadas',{...p,progress:undefined})});
    check();
    if(!flood.nWet||!flood.rings.length)throw fail('CHANNEL_RESOLUTION','Nenhuma célula foi resolvida abaixo do nível informado junto ao eixo. Confira a altura e o MDT.');
    boundary.drySeedCells=flood.nDrySeedCells||0;boundary.noDataSeedCells=flood.nNoDataSeedCells||0;
    // Transform in place: retaining two complete contour copies would defeat
    // the bounded memory of the tile engine.
    let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity,transformed=0;
    for(let ri=0;ri<flood.rings.length;ri++){const ring=flood.rings[ri];for(const p of ring){const q=sampler.toWork(p);p[0]=q[0];p[1]=q[1];xmin=Math.min(xmin,p[0]);ymin=Math.min(ymin,p[1]);xmax=Math.max(xmax,p[0]);ymax=Math.max(ymax,p[1]);if((++transformed&4095)===0)await checkpoint();}if((ri&127)===0)await checkpoint();}
    const polygons=groupRings(flood.rings),area=polygons.reduce((s,p)=>s+p.reduce((n,r,i)=>n+(i?-1:1)*Math.abs(signedArea(r)),0),0);
    if(!polygons.length||!(area>0))throw fail('CHANNEL_INVALID_GEOMETRY','Não foi possível formar o contorno da calha nativa.');
    const samplesPerSection=2*Math.ceil(reach/(resolution/2))+1,nominalCount=Math.ceil(length/interval)+1,
      sectionCount=Math.max(2,Math.min(nominalCount,MAX_SECTIONS,Math.max(2,Math.floor(PROFILE_BUDGET/Math.min(samplesPerSection,PROFILE_BUDGET/2))))),reviewInterval=length/(sectionCount-1),sections=[],omitted=[];
    const identical=(!workCRS||String(sourceCRS)===String(workCRS))&&Math.hypot(originWork[0]-g.xll,originWork[1]-g.yll)<1e-6&&Math.abs(nativeX-g.cs)<1e-6&&Math.abs(nativeY-csy)<1e-6;
    for(let si=0;si<sectionCount;si++){
      check();const station=length*si/(sectionCount-1),center=atPoint(station),normal=normalAt(station),point=t=>[center[0]+normal[0]*t,center[1]+normal[1]*t],off=p=>(p[0]-center[0])*normal[0]+(p[1]-center[1])*normal[1];
      const projected=[[xmin,ymin],[xmin,ymax],[xmax,ymin],[xmax,ymax]].map(off),lo=Math.min(0,Math.max(-reach,Math.min(...projected)-resolution*2)),hi=Math.max(0,Math.min(reach,Math.max(...projected)+resolution*2)),step=resolution/2,
        nLeft=stableCeil(-lo/step),nRight=stableCeil(hi/step),offsets=[];
      for(let i=nLeft;i>0;i--)offsets.push(lo*i/nLeft);offsets.push(0);for(let i=1;i<=nRight;i++)offsets.push(hi*i/nRight);
      if(offsets.length>PROFILE_BUDGET/2)throw fail('CHANNEL_LIMIT','O perfil de conferência excede o orçamento de memória. Reduza a faixa de busca; o preenchimento usa os pixels nativos.');
      const points=offsets.map(point),z=[];
      for(let j=0;j<points.length;j+=4096){z.push(...await readPoints(points.slice(j,j+4096)));await checkpoint();}
      const axisIndex=nLeft,zAxis=z[axisIndex];if(!Number.isFinite(zAxis)){omitted.push({station,center,normal,code:'CHANNEL_NO_DATA',message:'MDT sem cota válida no eixo desta seção.'});continue;}
      const cuts=[lo,hi];
      if(identical){for(let axis=0;axis<2;axis++)if(Math.abs(normal[axis])>1e-12){const origin=axis?g.yll:g.xll,cs=axis?csy:g.cs,a=center[axis]+normal[axis]*lo,b=center[axis]+normal[axis]*hi,start=Math.floor((Math.min(a,b)-origin)/cs),end=Math.ceil((Math.max(a,b)-origin)/cs);for(let j=start;j<=end;j++){const t=(origin+j*cs-center[axis])/normal[axis];if(t>lo+1e-8&&t<hi-1e-8)cuts.push(t);}}}
      else for(const t of offsets)if(t>lo&&t<hi)cuts.push(t);
      cuts.sort((a,b)=>a-b);const distinct=cuts.filter((v,i)=>!i||v-cuts[i-1]>1e-8),wetIntervals=[];
      const cellAt=p=>sampler.locate(p),wet=p=>{const q=cellAt(p);return q&&flood.isWet(q.col,q.row);},levelAt=p=>{const q=cellAt(p);return q?referenceAtCell(q.col,q.row).level:NaN;};
      for(let j=1;j<distinct.length;j++){const a=distinct[j-1],b=distinct[j],p=point((a+b)/2);if(!wet(p))continue;const level=levelAt(p),prev=wetIntervals.at(-1);
        if(prev&&Math.abs(prev.leftOffset-a)<=1e-8){prev.leftOffset=b;prev.left=point(b);prev.width=b-prev.rightOffset;prev.zlevelL=level;}
        else wetIntervals.push({rightOffset:a,leftOffset:b,right:point(a),left:point(b),width:b-a,zlevelR:level,zlevelL:level});
      }
      const width=wetIntervals.reduce((n,w)=>n+w.width,0);if(!(width>0)){omitted.push({station,center,normal,zAxis,code:'CHANNEL_RESOLUTION',message:'O perfil não intercepta células molhadas resolvidas pelo MDT.'});continue;}
      const right=wetIntervals[0],left=wetIntervals.at(-1),profile=offsets.map((offset,j)=>{const level=levelAt(points[j]);return {offset,z:Number.isFinite(z[j])?z[j]:null,level:Number.isFinite(level)?level:null,wet:!!wet(points[j])};});
      sections.push({station,center,normal,zAxis,zReference:zAxis,referenceKind:'axis',referencePoint:center.slice(),referenceOffset:0,zFloor:null,floorPoint:null,floorOffset:null,floorDetection:null,detection:null,
        level:zAxis+height,effectiveHeight:height,mode:'axisHeight',method:'Altura sobre o eixo · preenchimento nativo em blocos',width,spanWidth:left.leftOffset-right.rightOffset,left:left.left,right:right.right,leftOffset:left.leftOffset,rightOffset:right.rightOffset,wetIntervals,profile});
      progress('profiles','Preparando os perfis de conferência · '+(si+1)+'/'+sectionCount,{progress:.85+.15*(si+1)/sectionCount});await checkpoint();
    }
    const partial=omitted.length>0||Object.values(boundary).some(v=>v>0),warnings=[
      'Nível local = cota do MDT no eixo + altura informada, acompanhando a inclinação longitudinal. Preenchimento geométrico, não uma simulação hidráulica.',
      'Leitura em blocos na grade original do MDT. Células secas e ilhas são preservadas; a conexão usa quatro vizinhos e não atravessa NoData.',
      'O contorno reúne os blocos sem cortes de emenda. As extremidades do eixo e o limite de busca são fechamentos artificiais.',
      'Os perfis são de conferência: o intervalo entre eles não reduz a resolução nem altera a calha. Em curvas podem interceptar mais de um braço, dentro da faixa de busca.'
    ];
    if(sectionCount<nominalCount)warnings.push('Perfis de conferência espaçados a '+reviewInterval.toFixed(2)+' m para manter a memória limitada. A calha inteira foi calculada nas células nativas.');
    if(partial)warnings.push('Resultado parcial: '+boundary.drySeedCells+' células secas junto ao eixo; '+boundary.noDataSeedCells+' sem MDT; '+boundary.searchBoundaryEdges+' contatos no limite de busca; '+boundary.noDataBoundaryEdges+' junto a NoData; '+omitted.length+' perfis não aproveitados. Os trechos válidos foram preservados.');
    check();progress('done','Calha nativa pronta.',{progress:1},true);
    return {polygons,ring:polygons[0][0],area,sections,mode:'axisHeight',method:'Altura sobre o eixo · preenchimento nativo em blocos',wetCellCount:flood.nWet,resolution,pixelSize:{x:nativeX,y:nativeY},sourceAlignment:'native-grid',
      refStep:actualRefStep,refCount:referenceCount,partial,omitted,boundaryDiagnostics:boundary,warnings,reviewInterval,
      nativeProcessing:{readWindows:flood.readWindows,tilesProcessed:flood.tilesProcessed,maskTiles:flood.maskTiles,testedCells:flood.nTested,memoryPeakBytes:flood.memoryPeakBytes,fullRasterCells:g.nc*g.nr,tileSize:options.tileSize||256}};
  }finally{flood?.dispose();}
}
window.GeoMineChannelNativeFill={analyze};
})();
