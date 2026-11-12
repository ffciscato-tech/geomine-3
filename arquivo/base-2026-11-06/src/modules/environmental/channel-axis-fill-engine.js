/* Preenchimento geométrico 2D: terreno do eixo + altura; não é modelo hidráulico. */
(function(){
'use strict';
function engine(floodFactory,channelFactory,clipping){
  // Esta factory é serializada em worker; não depende de globals da aplicação.
  const MAX=250000,MAX_VISITS=12000000,NATIVE_CELLS=2000000,NATIVE_SAMPLES=3000000,NATIVE_MEMORY=192*1024*1024,NATIVE_RESERVE=48*1024*1024,NATIVE_CONTOUR_EDGES=32768,METHOD='Preenchimento 2D pela altura sobre o eixo';
  const fail=(code,message)=>Object.assign(Error(message),{code});
  const positive=(n,name)=>{if(!Number.isFinite(n)||n<=0)throw fail('CHANNEL_INVALID_INPUT',name+' deve ser positivo.');return n;};
  const xy=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
  function plan(line,o={}){
    const resolution=positive(o.resolution,'A resolução nativa'),reach=positive(o.reach,'O alcance');
    const nativeMode=o.mode==='axisHeight',maxCells=nativeMode?NATIVE_CELLS:MAX,maxSamples=nativeMode?NATIVE_SAMPLES:MAX;
    if(typeof floodFactory!=='function'||typeof channelFactory!=='function')throw fail('CHANNEL_INVALID_INPUT','Motores de preenchimento indisponíveis.');
    const base=channelFactory().plan(line,o),segments=[],distances=[0];
    line=base.guideLine||line; // Same computational guide and stations in both engines.
    for(let i=1;i<line.length;i++){
      const a=line[i-1].slice(0,2),b=line[i].slice(0,2),v=[b[0]-a[0],b[1]-a[1]],length=Math.hypot(...v);
      segments.push({a,b,v,length,station:distances.at(-1),box:[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])]});distances.push(distances.at(-1)+length);
    }
    const first=segments[0],last=segments.at(-1),start=line[0].slice(0,2),end=line.at(-1).slice(0,2);
    const tangentStart=nativeMode?[base.sections[0].normal[1],-base.sections[0].normal[0]]:first.v.map(v=>v/first.length),tangentEnd=nativeMode?[base.sections.at(-1).normal[1],-base.sections.at(-1).normal[0]]:last.v.map(v=>v/last.length);
    let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;
    for(const p of line){xmin=Math.min(xmin,p[0]);ymin=Math.min(ymin,p[1]);xmax=Math.max(xmax,p[0]);ymax=Math.max(ymax,p[1]);}
    // Ancoragem geográfica, independente do sentido e do intervalo das seções.
    const ng=nativeMode?o.nativeGrid:null;
    if(ng&&(!Number.isSafeInteger(ng.nc)||!Number.isSafeInteger(ng.nr)||ng.nc<=0||ng.nr<=0||![ng.cs,ng.csy??ng.cs].every(v=>Number.isFinite(v)&&v>0)||![ng.xll,ng.yll].every(Number.isFinite)))throw fail('CHANNEL_INVALID_INPUT','Geometria da grade nativa inválida.');
    const cs=ng?ng.cs:resolution,csy=ng?(ng.csy??ng.cs):resolution,nativeResolution=ng?Math.min(cs,csy):resolution;
    // Adjacent UTM cell centres differ by a few ulps after subtraction. A
    // nominal two half-pixel steps must not alternate between two and three.
    const subdivisions=(length,step)=>nativeMode?Math.max(1,Math.ceil(length/step-1e-7)):Math.ceil(length/step);
    const left=ng?Math.max(0,Math.floor((xmin-reach-ng.xll)/cs)):Math.floor((xmin-reach)/cs),bottom=ng?Math.max(0,Math.floor((ymin-reach-ng.yll)/csy)):Math.floor((ymin-reach)/csy);
    const right=ng?Math.min(ng.nc,Math.ceil((xmax+reach-ng.xll)/cs)):Math.ceil((xmax+reach)/cs),top=ng?Math.min(ng.nr,Math.ceil((ymax+reach-ng.yll)/csy)):Math.ceil((ymax+reach)/csy);
    const x0=(ng?ng.xll:0)+left*cs,y0=(ng?ng.yll:0)+bottom*csy,nc=right-left,nr=top-bottom,count=nc*nr;
    if(!Number.isSafeInteger(count)||count<1||count>maxCells)throw fail('CHANNEL_LIMIT',nativeMode?'A faixa nativa exige mais de 2 milhões de células. Reduza a largura da busca ou processe o eixo por trechos; a resolução do MDT será preservada.':'A grade 2D excede 250 mil células. Divida o eixo ou reduza a faixa de busca.');
    const profileStep=nativeMode?nativeResolution/2:Math.min(base.lateralStep,resolution/2),diagonal=Math.hypot(nc*cs,nr*csy),capacity=nativeMode?Math.min(maxSamples,count+base.sections.length*(Math.ceil(diagonal/profileStep)+4)+Math.ceil(base.length/(nativeResolution/2))+segments.length+2):0;
    const estimatedMemory=nativeMode?capacity*24+count*38+NATIVE_RESERVE:0;
    if(nativeMode&&estimatedMemory>NATIVE_MEMORY)throw fail('CHANNEL_LIMIT','A faixa exige mais de 192 MiB para o preenchimento nativo. Reduza a largura da busca ou processe por trechos; os pixels do MDT serão preservados.');
    function tree(items){
      const box=[Infinity,Infinity,-Infinity,-Infinity];for(const s of items)for(let j=0;j<4;j++)box[j]=j<2?Math.min(box[j],s.box[j]):Math.max(box[j],s.box[j]);
      if(items.length<=8)return {box,items};const k=box[2]-box[0]>=box[3]-box[1]?0:1;
      items.sort((a,b)=>(a.box[k]+a.box[k+2])-(b.box[k]+b.box[k+2]));const m=items.length>>1;return {box,left:tree(items.slice(0,m)),right:tree(items.slice(m))};
    }
    const root=tree(segments.slice());let visits=0;
    const boxDistance=(p,b)=>Math.max(b[0]-p[0],0,p[0]-b[2])**2+Math.max(b[1]-p[1],0,p[1]-b[3])**2;
    function nearest(p){
      let best=null,d2=Infinity;const pending=[root];
      while(pending.length){
        if(++visits>(nativeMode?256000000:MAX_VISITS))throw fail('CHANNEL_LIMIT','Eixo muito complexo para a grade 2D. Divida-o em trechos.');
        const node=pending.pop();if(boxDistance(p,node.box)>d2+1e-10)continue;
        if(node.items)for(const s of node.items){
          const t=Math.max(0,Math.min(1,((p[0]-s.a[0])*s.v[0]+(p[1]-s.a[1])*s.v[1])/(s.length*s.length))),q=[s.a[0]+t*s.v[0],s.a[1]+t*s.v[1]],d=(p[0]-q[0])**2+(p[1]-q[1])**2;
          // Empate decidido pela posição física, nunca pelo sentido do eixo.
          if(d<d2-1e-10||(Math.abs(d-d2)<=1e-10&&(!best||q[0]<best.point[0]-1e-10||(Math.abs(q[0]-best.point[0])<=1e-10&&q[1]<best.point[1])))){d2=d;best={station:s.station+t*s.length,point:q,distance:Math.sqrt(d)};}
        }else{
          const a=boxDistance(p,node.left.box),b=boxDistance(p,node.right.box);if(a<b)pending.push(node.right,node.left);else pending.push(node.left,node.right);
        }
      }return best;
    }
    const wall=new Uint8Array(count),stations=new Float64Array(count),gridSamples=new Int32Array(count);gridSamples.fill(-1);
    const packed=nativeMode?new Float64Array(capacity*2):null;
    const points=nativeMode?{length:0,push(p){if(this.length>=capacity)throw fail('CHANNEL_LIMIT','A faixa e os perfis excedem o orçamento de memória nativa. Reduza a largura da busca ou processe por trechos.');packed[this.length*2]=p[0];packed[this.length*2+1]=p[1];this.length++;}}:[];
    for(let r=0;r<nr;r++)for(let c=0;c<nc;c++){
      const k=r*nc+c,p=[x0+(c+.5)*cs,y0+(r+.5)*csy],n=nearest(p);stations[k]=n.station;
      // Caps locais da região projetada nas pontas; um plano infinito cortaria
      // partes internas de eixos curvos que retornam para além da ponta inicial.
      const cap=(n.station<=1e-9&&dot([p[0]-start[0],p[1]-start[1]],tangentStart)<-1e-9)||(n.station>=base.length-1e-9&&dot([p[0]-end[0],p[1]-end[1]],tangentEnd)>1e-9);
      wall[k]=cap?2:n.distance>reach+1e-9?1:0;
      if(!wall[k]){gridSamples[k]=points.length;points.push(p);}
    }
    const nativeGridSampleCount=ng?points.length:0,profileStarts=[];
    for(const s of base.sections){
      // A normal pode cruzar outro braço da mesma mancha numa curva. Interceptar
      // toda a grade evita truncar uma largura dentro da água em ±reach.
      let lo=-Infinity,hi=Infinity;
      for(let axis=0;axis<2;axis++)if(Math.abs(s.normal[axis])>1e-12){const origin=axis?y0:x0,extent=axis?nr*csy:nc*cs,a=(origin-s.center[axis])/s.normal[axis],b=(origin+extent-s.center[axis])/s.normal[axis];lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));}
      const negative=Math.ceil(-lo/profileStep),positiveCount=Math.ceil(hi/profileStep),size=negative+positiveCount+1;
      if(points.length+size>maxSamples)throw fail('CHANNEL_LIMIT',nativeMode?'Grade e perfis excedem 3 milhões de amostras nativas. Reduza a largura da busca ou processe por trechos.':'Grade e perfis completos excedem 250 mil amostras. Aumente o intervalo dos perfis de revisão (sem alterar o preenchimento), ou divida o eixo.');
      s.offsets=[];for(let j=negative;j>0;j--)s.offsets.push(lo*j/negative);s.offsets.push(0);for(let j=1;j<=positiveCount;j++)s.offsets.push(hi*j/positiveCount);
      s.points=s.offsets.map(t=>[s.center[0]+s.normal[0]*t,s.center[1]+s.normal[1]*t]);s.profileRange=[lo,hi];profileStarts.push(points.length);for(const p of s.points)points.push(p.slice());
    }
    // A referência altimétrica é densa e independente do intervalo escolhido
    // para os perfis de revisão. Nenhum vértice é inserido no eixo do usuário.
    const referencePoints=[],referenceStations=[],referenceStart=points.length;let refStep=0;
    for(const s of segments){const n=subdivisions(s.length,(nativeMode?nativeResolution:resolution)/2);
      if(points.length+n+1>maxSamples)throw fail('CHANNEL_LIMIT',nativeMode?'Grade e referência densa excedem o orçamento de 3 milhões de amostras nativas. Reduza a largura da busca ou processe por trechos.':'Grade, perfis e referência densa excedem 250 mil amostras. Aumente o intervalo dos perfis de revisão ou divida o eixo.');
      refStep=Math.max(refStep,s.length/n);
      for(let j=s===first?0:1;j<=n;j++){const f=j/n,p=j===n?s.b.slice():[s.a[0]+f*s.v[0],s.a[1]+f*s.v[1]];referencePoints.push(p);referenceStations.push(s.station+f*s.length);points.push(p.slice());}
    }
    if(points.length>maxSamples)throw fail('CHANNEL_LIMIT','Grade e perfis excedem o orçamento de amostras. Divida o eixo ou reduza a faixa de busca.');
    const seeds=new Set(),locate=p=>{const c=Math.floor((p[0]-x0)/cs),r=Math.floor((p[1]-y0)/csy);return c>=0&&c<nc&&r>=0&&r<nr?r*nc+c:-1;};
    for(const s of segments){const n=subdivisions(s.length,(nativeMode?nativeResolution:resolution)/3);if(n>maxSamples)throw fail('CHANNEL_LIMIT','Eixo longo demais para a resolução do MDT. Divida-o.');
      for(let j=0;j<=n;j++){let t=j/n;if(s===first&&j===0)t=Math.min(1,1e-7/s.length);if(s===last&&j===n)t=Math.max(0,1-1e-7/s.length);const k=locate([s.a[0]+t*s.v[0],s.a[1]+t*s.v[1]]);if(k>=0&&!wall[k])seeds.add(k);}
    }
    if(!seeds.size)throw fail('CHANNEL_RESOLUTION','O eixo é menor que a resolução útil da grade 2D.');
    return {...base,mode:nativeMode?'axisHeight':'axisDepth',...(nativeMode?{points:undefined,pointCoordinates:packed.slice(0,points.length*2),nativeGridSampleCount}:{points}),sampleCount:points.length,resolution,profileStarts,referencePoints,referenceStations,referenceStart,refStep,refCount:referencePoints.length,grid:{nc,nr,x0,y0,cs,csy,resolution,wall,stations,samples:gridSamples,seeds:[...seeds],alignment:ng?'native-grid':'project-grid-resampled',...(nativeMode?{contourEdgeLimit:NATIVE_CONTOUR_EDGES}:{})},limits:{maxSamples,maxCells,...(nativeMode?{memoryLimitBytes:NATIVE_MEMORY,estimatedMemoryBytes:estimatedMemory,maxContourEdges:NATIVE_CONTOUR_EDGES}:{})}};
  }
  function polygonize(mask,g){
    const {nc,nr,x0,y0,resolution:r}=g,cs=g.cs||r,csy=g.csy||r,stride=nc+1,out=new Map(),edges=[];
    const add=(a,b,d)=>{const e={a,b,d,used:false};edges.push(e);if(!out.has(a))out.set(a,[]);out.get(a).push(e);};
    for(let y=0;y<nr;y++)for(let x=0;x<nc;x++){const k=y*nc+x;if(!mask[k])continue;const a=y*stride+x;
      if(y===0||!mask[k-nc])add(a,a+1,0);if(x===nc-1||!mask[k+1])add(a+1,a+1+stride,1);
      if(y===nr-1||!mask[k+nc])add(a+1+stride,a+stride,2);if(x===0||!mask[k-1])add(a+stride,a,3);
    }
    const loops=[];
    for(const initial of edges){if(initial.used)continue;const ids=[initial.a];let e=initial;
      for(let steps=0;;steps++){
        if(e.used||steps>edges.length)throw fail('CHANNEL_INVALID_GEOMETRY','Não foi possível fechar a borda da máscara 2D.');e.used=true;ids.push(e.b);if(e.b===ids[0])break;
        const choices=(out.get(e.b)||[]).filter(v=>!v.used);if(!choices.length)throw fail('CHANNEL_INVALID_GEOMETRY','Borda 2D incompleta.');
        const rank=v=>{const turn=(v.d-e.d+4)%4;return turn===1?0:turn===0?1:turn===3?2:3;};choices.sort((a,b)=>rank(a)-rank(b));e=choices[0];
      }
      if(new Set(ids.slice(0,-1)).size!==ids.length-1)throw fail('CHANNEL_INVALID_GEOMETRY','A máscara forma um estreitamento pontual ambíguo. Use um MDT adequado ou divida o eixo.');
      const coords=ids.slice(0,-1).map(k=>[k%stride,Math.floor(k/stride)]),simple=[];
      for(let i=0;i<coords.length;i++){const a=coords[(i+coords.length-1)%coords.length],b=coords[i],c=coords[(i+1)%coords.length];if((b[0]-a[0])*(c[1]-b[1])!==(b[1]-a[1])*(c[0]-b[0]))simple.push(b);}
      let twice=0;for(let i=0;i<simple.length;i++){const a=simple[i],b=simple[(i+1)%simple.length];twice+=a[0]*b[1]-b[0]*a[1];}
      if(simple.length<4||!twice)throw fail('CHANNEL_INVALID_GEOMETRY','Contorno 2D sem área.');
      const ring=simple.map(p=>[x0+p[0]*cs,y0+p[1]*csy]);ring.push(ring[0].slice());loops.push({ring,area:twice*cs*csy/2,ids:new Set(ids)});
    }
    const inside=(p,ring)=>{let yes=false;for(let i=0,j=ring.length-2;i<ring.length-1;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
    const outer=loops.filter(v=>v.area>0).sort((a,b)=>b.area-a.area);for(const o of outer)o.holes=[];
    for(const hole of loops.filter(v=>v.area<0)){
      const a=hole.ring[0],b=hole.ring[1],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const p=[(a[0]+b[0])/2+(b[1]-a[1])/length*r*.1,(a[1]+b[1])/2-(b[0]-a[0])/length*r*.1];
      const parent=outer.filter(o=>inside(p,o.ring)).sort((a,b)=>a.area-b.area)[0];if(!parent)throw fail('CHANNEL_INVALID_GEOMETRY','Ilha seca sem contorno externo válido.');
      for(const id of hole.ids)if(parent.ids.has(id))throw fail('CHANNEL_INVALID_GEOMETRY','Ilha seca toca a margem em apenas um ponto. A topologia exige revisão.');parent.holes.push(hole.ring);
    }
    return {polygons:outer.map(o=>[o.ring,...o.holes]),area:loops.reduce((sum,v)=>sum+v.area,0)};
  }
  function dissolve(mask,g){
    if(typeof clipping?.union!=='function')throw fail('CHANNEL_INVALID_GEOMETRY','Dissolução robusta indisponível para os contatos entre pixels.');
    // Runs horizontais, fundidos verticalmente quando iguais: muito menos
    // entradas que uma união por pixel. Coordenadas inteiras locais evitam
    // perda de precisão UTM. Batches balanceados nunca espalham 250 mil args.
    const rectangles=[],{nc,nr,resolution:r,x0,y0}=g,cs=g.cs||r,csy=g.csy||r;let previous=new Map();
    for(let y=0;y<nr;y++){
      const current=new Map();for(let x=0;x<nc;){if(!mask[y*nc+x]){x++;continue;}const first=x;while(x<nc&&mask[y*nc+x])x++;const key=first+':'+x,rect=previous.get(key)||{x0:first,x1:x,y0:y,y1:y};rect.y1=y+1;current.set(key,rect);previous.delete(key);}
      for(const rectangle of previous.values())rectangles.push(rectangle);previous=current;
    }for(const rectangle of previous.values())rectangles.push(rectangle);
    let groups=rectangles.map(b=>[[[[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1],[b.x0,b.y0]]]]),started=Date.now();
    while(groups.length>1){const next=[];for(let i=0;i<groups.length;i+=32){
      if(Date.now()-started>170000)throw fail('CHANNEL_LIMIT','Dissolução 2D excedeu o tempo seguro. Divida o eixo em trechos.');
      next.push(clipping.union(...groups.slice(i,i+32)));
    }groups=next;}
    const local=groups[0]||[],outerAreas=new Map();let area=0;
    for(const polygon of local)for(let j=0;j<polygon.length;j++){const ring=polygon[j];let twice=0;for(let i=1;i<ring.length;i++)twice+=ring[i-1][0]*ring[i][1]-ring[i][0]*ring[i-1][1];area+=(j===0?1:-1)*Math.abs(twice)*cs*csy/2;if(j===0)outerAreas.set(polygon,Math.abs(twice));}
    local.sort((a,b)=>outerAreas.get(b)-outerAreas.get(a));
    return {polygons:local.map(p=>p.map(ring=>ring.map(p=>[x0+p[0]*cs,y0+p[1]*csy]))),area,dissolved:true};
  }
  function analyze(layout,values,{height,resolution,mode='axisDepth',allowPartial=false}={}){
    positive(height,'A altura sobre o eixo');positive(resolution,'A resolução nativa');
    const g=layout?.grid,input=layout?.sections,nativeMode=mode==='axisHeight',maxSamples=nativeMode?NATIVE_SAMPLES:MAX,maxCells=nativeMode?NATIVE_CELLS:MAX;
    if(!['axisDepth','axisHeight'].includes(mode)||!g||!Array.isArray(input)||input.length<2||!values||values.length!==(nativeMode?layout.sampleCount:layout.points?.length)||values.length>maxSamples||g.nc*g.nr>maxCells||Math.abs(resolution-g.resolution)>1e-9)throw fail('CHANNEL_INVALID_INPUT','Plano, resolução e amostras 2D incompatíveis.');
    const {nc,nr,x0,y0}=g,r=g.resolution,cs=g.cs||r,csy=g.csy||r,count=nc*nr,z=new Float64Array(count),levels=new Float64Array(count),residual=new Float64Array(count);z.fill(NaN);levels.fill(NaN);residual.fill(NaN);
    const axisZ=input.map((s,i)=>values[layout.profileStarts[i]+s.offsets.findIndex(t=>t===0)]),eps=r*1e-7;
    const refs=layout.referenceStations,referenceZ=layout.referencePoints?.map((p,i)=>values[layout.referenceStart+i]);
    if(!Array.isArray(refs)||refs.length<2||referenceZ?.length!==refs.length)throw fail('CHANNEL_INVALID_INPUT','Falta a referência densa do eixo para o preenchimento 2D.');
    const atStation=t=>{let lo=0,hi=refs.length-1;while(lo+1<hi){const m=(lo+hi)>>1;if(refs[m]<=t)lo=m;else hi=m;}const f=Math.max(0,Math.min(1,(t-refs[lo])/(refs[hi]-refs[lo])));return referenceZ[lo]+f*(referenceZ[hi]-referenceZ[lo])+height;};
    const indexAt=p=>{const c=Math.floor((p[0]-x0)/cs),row=Math.floor((p[1]-y0)/csy);return c>=0&&c<nc&&row>=0&&row<nr?row*nc+c:-1;};
    let mask=null;
    function profile(i){const s=input[i],shift=i===0?[s.normal[1]*eps,-s.normal[0]*eps]:i===input.length-1?[-s.normal[1]*eps,s.normal[0]*eps]:[0,0];
      return s.offsets.map((offset,j)=>{const p=s.points[j],k=indexAt([p[0]+shift[0],p[1]+shift[1]]),value=values[layout.profileStarts[i]+j];return {offset,z:Number.isFinite(value)?value:null,level:k>=0&&!g.wall[k]&&Number.isFinite(levels[k])?levels[k]:Number.isFinite(axisZ[i])?axisZ[i]+height:null,wet:!!(mask&&k>=0&&mask[k])};});
    }
    function diagnostic(error,i=0){const s=input[i],reference=Number.isFinite(axisZ[i])?axisZ[i]:null;error.diagnostic={station:s.station,center:s.center.slice(),normal:s.normal.slice(),zAxis:reference,zReference:reference,referenceKind:'axis',referencePoint:s.center.slice(),referenceOffset:0,zFloor:null,floorPoint:null,floorOffset:null,level:reference===null?null:reference+height,effectiveHeight:height,mode,method:METHOD,profile:profile(i),code:error.code,message:error.message};return error;}
    const sectionAtStation=t=>{let i=0;for(let j=1;j<input.length;j++)if(Math.abs(input[j].station-t)<Math.abs(input[i].station-t))i=j;return i;},sectionAt=k=>sectionAtStation(g.stations[k]);
    const partialAllowed=nativeMode&&allowPartial,omitted=[],invalidProfiles=new Set();let missingReferences=0,drySeeds=0,invalidSeeds=0,openBoundary=0,noDataBoundary=0;
    const note=(error,i)=>{const d=diagnostic(error,i).diagnostic;omitted.push(d);return d;};
    for(let i=0;i<input.length;i++)if(!Number.isFinite(axisZ[i])){const error=fail('CHANNEL_NO_DATA','MDT sem cota válida sobre o eixo.');if(!partialAllowed)throw diagnostic(error,i);invalidProfiles.add(i);note(error,i);}
    for(let i=0;i<referenceZ.length;i++)if(!Number.isFinite(referenceZ[i])){missingReferences++;if(!partialAllowed)throw diagnostic(fail('CHANNEL_NO_DATA','MDT sem cota válida na referência densa do eixo ('+refs[i].toFixed(2)+' m). Nenhum preenchimento foi criado.'),sectionAtStation(refs[i]));}
    for(let k=0;k<count;k++)if(!g.wall[k]){const value=values[g.samples[k]];z[k]=Number.isFinite(value)?value:NaN;levels[k]=atStation(g.stations[k]);if(!Number.isFinite(levels[k])){if(partialAllowed)continue;throw diagnostic(fail('CHANNEL_NO_DATA','Referência do MDT sem cota válida para o nível local.'),sectionAt(k));}if(!(levels[k]>levels[k]-height))throw diagnostic(fail('CHANNEL_INVALID_INPUT','Altura fora da precisão numérica das cotas.'),sectionAt(k));residual[k]=z[k]-levels[k];}
    const validSeeds=[];
    for(const k of g.seeds){if(!Number.isFinite(z[k])||!Number.isFinite(residual[k])){invalidSeeds++;if(!partialAllowed)throw diagnostic(fail('CHANNEL_NO_DATA','NoData ou limite do MDT junto ao eixo impede verificar a conexão 2D.'),sectionAt(k));continue;}if(!(residual[k]<0)){drySeeds++;if(!partialAllowed)throw diagnostic(fail('CHANNEL_RESOLUTION','O preenchimento junto ao eixo é menor que o pixel nativo. A grade não resolve esta altura.'),sectionAt(k));continue;}validSeeds.push(k);}
    mask=floodFactory().connectedBelow({nc,nr,z:residual},0,validSeeds,g.wall);
    let wetCount=0;
    for(let k=0;k<count;k++)if(mask[k]){
      wetCount++;const c=k%nc,row=Math.floor(k/nc),neighbors=[c? k-1:-1,c+1<nc?k+1:-1,row?k-nc:-1,row+1<nr?k+nc:-1];
      for(const next of neighbors){
        if(next>=0&&g.wall[next]===2)continue; // caps finais são fechamentos esperados, explicitamente não margens.
        if(next<0||(next>=0&&g.wall[next]===1)){openBoundary++;if(!partialAllowed)throw diagnostic(fail('CHANNEL_REACH_BANK','O preenchimento 2D alcança o limite lateral da busca. Amplie a faixa; nenhuma margem foi inventada.'),sectionAt(k));continue;}
        if(!Number.isFinite(z[next])||!Number.isFinite(levels[next])){noDataBoundary++;if(!partialAllowed)throw diagnostic(fail('CHANNEL_NO_DATA','NoData ou limite do MDT toca o preenchimento 2D. Não é possível confirmar a margem.'),sectionAt(k));}
      }
    }
    if(!wetCount)throw diagnostic(fail('CHANNEL_RESOLUTION','Nenhuma célula foi resolvida abaixo do nível informado.'));
    const sections=[];
    for(let i=0;i<input.length;i++){
      if(invalidProfiles.has(i))continue;
      const s=input[i],point=t=>[s.center[0]+s.normal[0]*t,s.center[1]+s.normal[1]*t],range=s.profileRange||[s.offsets[0],s.offsets.at(-1)],cuts=range.slice();
      for(let axis=0;axis<2;axis++)if(Math.abs(s.normal[axis])>1e-12){const origin=axis?y0:x0,n=axis?nr:nc,step=axis?csy:cs;for(let j=0;j<=n;j++){const t=(origin+j*step-s.center[axis])/s.normal[axis];if(t>range[0]+eps&&t<range[1]-eps)cuts.push(t);}}
      cuts.sort((a,b)=>a-b);const distinct=cuts.filter((v,j)=>!j||v-cuts[j-1]>eps),wetIntervals=[],shift=i===0?[s.normal[1]*eps,-s.normal[0]*eps]:i===input.length-1?[-s.normal[1]*eps,s.normal[0]*eps]:[0,0];
      for(let j=1;j<distinct.length;j++){const a=distinct[j-1],b=distinct[j],p=point((a+b)/2),k=indexAt([p[0]+shift[0],p[1]+shift[1]]);if(k<0||!mask[k])continue;
        const prev=wetIntervals.at(-1);if(prev&&Math.abs(prev.leftOffset-a)<=eps){prev.leftOffset=b;prev.left=point(b);prev.width=b-prev.rightOffset;prev.zlevelL=levels[k];}
        else wetIntervals.push({rightOffset:a,leftOffset:b,right:point(a),left:point(b),width:b-a,zlevelR:levels[k],zlevelL:levels[k]});
      }
      const width=wetIntervals.reduce((sum,w)=>sum+w.width,0);
      if(!(width>eps)){const error=fail('CHANNEL_RESOLUTION','Seção '+(i+1)+': o perfil não intercepta nenhuma célula molhada resolvida pelo MDT.');if(partialAllowed){note(error,i);continue;}throw diagnostic(error,i);}
      const right=wetIntervals[0],left=wetIntervals.at(-1),zAxis=axisZ[i];
      sections.push({station:s.station,center:s.center.slice(),normal:s.normal.slice(),zAxis,zReference:zAxis,referenceKind:'axis',referencePoint:s.center.slice(),referenceOffset:0,zFloor:null,floorPoint:null,floorOffset:null,floorDetection:null,detection:null,level:zAxis+height,effectiveHeight:height,mode,method:METHOD,width,spanWidth:left.leftOffset-right.rightOffset,left:left.left.slice(),right:right.right.slice(),leftOffset:left.leftOffset,rightOffset:right.rightOffset,wetIntervals,profile:profile(i)});
    }
    // Bound the object-heavy contour stage before allocating any edge Maps,
    // rings or dissolution rectangles. The native memory estimate reserves
    // 48 MiB for these structures, their fallback and the small guide/profile
    // arrays; no resolution or dry island is sacrificed to fit that budget.
    let contourEdgeCount=0;
    if(nativeMode)for(let k=0;k<count;k++)if(mask[k]){const c=k%nc;
      contourEdgeCount+=(k<nc||!mask[k-nc]?1:0)+(k>=count-nc||!mask[k+nc]?1:0)+(c===0||!mask[k-1]?1:0)+(c===nc-1||!mask[k+1]?1:0);
      if(contourEdgeCount>NATIVE_CONTOUR_EDGES)throw diagnostic(fail('CHANNEL_LIMIT','O contorno nativo excede o orçamento de memória (32.768 arestas). Processe um trecho menor; a resolução e as ilhas secas serão preservadas.'));
    }
    let geometry;try{geometry=polygonize(mask,g);}catch(error){
      if(error.code==='CHANNEL_INVALID_GEOMETRY'&&typeof clipping?.union==='function'){
        try{geometry=dissolve(mask,g);}catch(fallback){if(!fallback.code)fallback.code='CHANNEL_INVALID_GEOMETRY';throw diagnostic(fallback);}
      }else throw diagnostic(error);
    }
    if(Math.abs(geometry.area-wetCount*cs*csy)>Math.max(1e-6,wetCount*cs*csy*1e-10))throw diagnostic(fail('CHANNEL_INVALID_GEOMETRY','Área do contorno não corresponde à máscara molhada.'));
    const partial=omitted.length>0||drySeeds>0||invalidSeeds>0||missingReferences>0||openBoundary>0||noDataBoundary>0;
    return {...geometry,ring:geometry.polygons[0][0],sections,mode,guidePreparation:layout.guidePreparation||null,method:METHOD,wetCellCount:wetCount,resolution:r,pixelSize:{x:cs,y:csy},sourceAlignment:g.alignment||'project-grid-resampled',refStep:layout.refStep,refCount:referenceZ.length,...(nativeMode?{partial,omitted,contourEdgeCount,boundaryDiagnostics:{drySeedCells:drySeeds,noDataSeedCells:invalidSeeds,missingReferenceSamples:missingReferences,searchBoundaryEdges:openBoundary,noDataBoundaryEdges:noDataBoundary},limits:layout.limits}:{}),warnings:[
      'Preenchimento geométrico 2D: cota do terreno no eixo + altura informada; o nível acompanha o eixo por interpolação longitudinal. Não é simulação hidráulica, leito regular nem certificação de cheia.',
      'Conectividade por quatro vizinhos na resolução nativa do MDT. Cristas submersas são atravessadas; terreno no nível ou acima permanece seco e ilhas são preservadas.',
      'Margens e ilhas seguem os limites dos pixels; os perfis representam a máscara 2D final. A precisão não supera a resolução do MDT.',
      'O eixo é densificado somente no cálculo, em passo de até meio pixel nativo, para ler a cota local. O eixo original permanece intacto; o intervalo dos perfis de revisão não muda o nível de preenchimento.',
      'Os perfis cortam a mancha 2D inteira: em curvas, uma normal pode cruzar outro braço. A largura molhada soma os intervalos realmente molhados e não é necessariamente a largura local do leito.',
      'As extremidades do eixo fecham a faixa artificialmente nos pixels dos planos finais. Nas curvas, o nível é atribuído pelo trecho mais próximo do eixo; revise mudanças de nível e ramos próximos.',
      ...(nativeMode&&g.alignment!=='native-grid'?['MDT em outro CRS: a faixa é amostrada na grade local do projeto, no menor passo métrico do raster; os pixels de origem são interpolados.']:[]),
      ...(nativeMode&&partial?['Resultado parcial: '+drySeeds+' célula(s) do eixo sem largura molhada resolvida; '+invalidSeeds+' célula(s) do eixo sem MDT; '+openBoundary+' aresta(s) fechada(s) no limite da busca e '+noDataBoundary+' junto a NoData. Os trechos válidos foram preservados; nenhuma célula seca foi forçada a molhada.']:[]),
      ...(sections.some(s=>s.width<2*r-1e-8)?['Há seções com largura molhada inferior a dois pixels nativos: a faixa é representada pela máscara, mas a largura tem forte limitação de precisão e exige revisão.']:[])
    ]};
  }
  return {plan,analyze};
}
window.GeoMineChannelAxisFill={engine};
})();
