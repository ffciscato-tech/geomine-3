/* Calha estimada por perfis normais ao eixo e desnível local sobre o MDT.
   Não identifica automaticamente leito regular, vazão ou nível de cheia. */
(function(){
'use strict';
function engine(){
  // Autocontido para serialização no worker. O raster é amostrado fora do motor.
  const LIMITS={maxSamples:250000,maxSections:2000,maxLinePoints:10000};
  // Limiares operacionais explícitos, não critérios universais de bankfull/leito
  // regular. Quando a forma não satisfaz a heurística, exigir altura manual.
  const AUTO_RULES={windowPixels:[1,1.5,2,3],minRisingSlope:.05,maxOutsideSlopeRatio:.5,minRelief:.15,minResidualTolerance:.025,residualRatio:.15,minInlierFraction:.75,minModelImprovement:.30,minModelGain:.01,refinePixels:1,returnDrop:.15};
  const FLOOR_RULES={mergeRelief:.15,guideBarrierRelief:.15,ambiguityPixels:1};
  const failure=(code,message)=>{const error=Error(message);error.code=code;return error;};
  const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
  const finitePoint=p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
  const positive=(n,name)=>{if(!Number.isFinite(n)||n<=0)throw failure('CHANNEL_INVALID_INPUT',name+' deve ser um número positivo.');return n;};
  const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
  function geometry(points,closed,label){
    const origin=points[0],local=points.map(p=>[p[0]-origin[0],p[1]-origin[1]]);
    let span=0;for(const p of local)span=Math.max(span,Math.abs(p[0]),Math.abs(p[1]));
    const eps=Math.max(1e-8,span*1e-12),edges=[];
    for(let i=0;i<local.length-1;i++){
      const a=local[i],b=local[i+1],v=[b[0]-a[0],b[1]-a[1]],length=Math.hypot(...v);
      if(!(length>eps))throw failure('CHANNEL_INVALID_GEOMETRY',label+': vértices consecutivos repetidos ou próximos demais. Revise a geometria.');
      edges.push({a,b,v,length,i,box:[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])]});
    }
    function tree(items){
      const box=[Infinity,Infinity,-Infinity,-Infinity];for(const e of items){box[0]=Math.min(box[0],e.box[0]);box[1]=Math.min(box[1],e.box[1]);box[2]=Math.max(box[2],e.box[2]);box[3]=Math.max(box[3],e.box[3]);}
      if(items.length<=8)return {box,items};const k=box[2]-box[0]>=box[3]-box[1]?0:1;
      items.sort((a,b)=>(a.box[k]+a.box[k+2])-(b.box[k]+b.box[k+2]));const m=items.length>>1;
      return {box,left:tree(items.slice(0,m)),right:tree(items.slice(m))};
    }
    const overlaps=(a,b)=>a[0]<=b[2]+eps&&a[2]>=b[0]-eps&&a[1]<=b[3]+eps&&a[3]>=b[1]-eps;
    function intersects(a,b){
      const tol=eps*(a.length+b.length),sign=v=>Math.abs(v)<=tol?0:Math.sign(v);
      const ac=[b.a[0]-a.a[0],b.a[1]-a.a[1]],ad=[b.b[0]-a.a[0],b.b[1]-a.a[1]],ca=[a.a[0]-b.a[0],a.a[1]-b.a[1]],cb=[a.b[0]-b.a[0],a.b[1]-b.a[1]];
      return sign(cross(a.v,ac))*sign(cross(a.v,ad))<=0&&sign(cross(b.v,ca))*sign(cross(b.v,cb))<=0;
    }
    const root=tree(edges.slice());let visits=0;
    for(const e of edges){
      const next=edges[(e.i+1)%edges.length];
      if((closed||e.i+1<edges.length)&&Math.abs(cross(e.v,next.v))<=eps*(e.length+next.length)&&e.v[0]*next.v[0]+e.v[1]*next.v[1]<0)throw failure('CHANNEL_INVALID_GEOMETRY',label+': borda sobreposta ou retorno sobre o mesmo segmento. Revise o eixo e o intervalo.');
      const stack=[root];while(stack.length){
        if(++visits>4000000)throw failure('CHANNEL_LIMIT',label+': geometria muito complexa. Divida o eixo em trechos.');
        const node=stack.pop();if(!overlaps(e.box,node.box))continue;
        if(node.items){for(const f of node.items){if(f.i<=e.i+1||(closed&&e.i===0&&f.i===edges.length-1))continue;
          if(overlaps(e.box,f.box)&&intersects(e,f))throw failure('CHANNEL_INVALID_GEOMETRY',label+': cruzamento ou toque da própria geometria. Revise o eixo, as curvas e o intervalo entre seções.');
        }}else stack.push(node.left,node.right);
      }
    }
    if(closed){let twiceArea=0;for(let i=0;i<local.length-1;i++)twiceArea+=cross(local[i],local[i+1]);if(Math.abs(twiceArea)<=eps*span)throw failure('CHANNEL_INVALID_GEOMETRY',label+': polígono sem área mensurável.');}
    return {eps,edges,origin,root,overlaps,intersects};
  }
  function prepareGuide(input,{interval,lateralStep}={}){
    if(input.length<=1000)return {line:input,mandatory:null,metadata:null};
    if(input.length>1000000)throw failure('CHANNEL_LIMIT','Eixo acima de 1 milhão de vértices. Simplifique uma cópia ou processe por trechos.');
    const points=[];for(const p of input)if(!points.length||!same(p,points.at(-1)))points.push(p.slice(0,2));
    if(points.length<2)throw failure('CHANNEL_INVALID_GEOMETRY','O eixo não tem extensão mensurável.');
    // The computational guide retains every change larger than 1 mm. Its
    // raster-sized stairs, however, are not compulsory survey stations: their
    // alternating 45-degree edges do not describe the direction of the valley.
    const anchors=[0],cosCorner=Math.cos(Math.PI/12);
    for(let i=1;i<points.length-1;i++){
      const a=points[i-1],b=points[i],c=points[i+1],ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-b[0],vy=c[1]-b[1];
      if((ux*vx+uy*vy)/(Math.hypot(ux,uy)*Math.hypot(vx,vy))<cosCorner)anchors.push(i);
    }
    anchors.push(points.length-1);
    const keep=new Uint8Array(points.length),stack=[],tol=.001;let work=0;
    for(let i=0;i<anchors.length;i++){keep[anchors[i]]=1;if(i)stack.push([anchors[i-1],anchors[i]]);}
    // Bounded-distance simplification, never the local-collinearity filter
    // that used to replace entire densely sampled curves by their chord.
    while(stack.length){
      const [a,b]=stack.pop(),p=points[a],q=points[b],dx=q[0]-p[0],dy=q[1]-p[1],den=dx*dx+dy*dy;
      let far=-1,max=tol*tol;
      for(let i=a+1;i<b;i++){
        if(++work>20000000)throw failure('CHANNEL_LIMIT','Geometria do eixo muito complexa para preparar. Simplifique uma cópia ou processe por trechos.');
        const v=points[i],t=den?Math.max(0,Math.min(1,((v[0]-p[0])*dx+(v[1]-p[1])*dy)/den)):0,
          ex=v[0]-p[0]-t*dx,ey=v[1]-p[1]-t*dy,d2=ex*ex+ey*ey;
        if(d2>max){max=d2;far=i;}
      }
      if(far>=0){keep[far]=1;stack.push([a,far],[far,b]);}
    }
    const line=[],originalIndex=[];
    for(let i=0;i<points.length;i++)if(keep[i]){line.push(points[i]);originalIndex.push(i);}
    // Use a separate pixel-scale outline only to identify sustained corners.
    // It never replaces the guide or supplies elevations/section centres.
    const support=interval/2,stationTolerance=Math.max(tol,Math.min(lateralStep*2,interval/8)),outline=new Set([0,points.length-1]),outlineStack=[[0,points.length-1]];
    while(outlineStack.length){
      const [a,b]=outlineStack.pop(),p=points[a],q=points[b],dx=q[0]-p[0],dy=q[1]-p[1],den=dx*dx+dy*dy;
      let far=-1,max=stationTolerance*stationTolerance;
      for(let i=a+1;i<b;i++){
        if(++work>40000000)throw failure('CHANNEL_LIMIT','Geometria do eixo muito complexa para preparar. Simplifique uma cópia ou processe por trechos.');
        const v=points[i],t=den?Math.max(0,Math.min(1,((v[0]-p[0])*dx+(v[1]-p[1])*dy)/den)):0,d2=(v[0]-p[0]-t*dx)**2+(v[1]-p[1]-t*dy)**2;
        if(d2>max){max=d2;far=i;}
      }
      if(far>=0){outline.add(far);outlineStack.push([a,far],[far,b]);}
    }
    const outlineIndices=[...outline].sort((a,b)=>a-b),corners=new Set([0,points.length-1]);
    for(let j=1;j<outlineIndices.length-1;j++){
      const i=outlineIndices[j],a=points[outlineIndices[j-1]],b=points[i],c=points[outlineIndices[j+1]],u=[b[0]-a[0],b[1]-a[1]],v=[c[0]-b[0],c[1]-b[1]],ul=Math.hypot(...u),vl=Math.hypot(...v);
      if(Math.min(ul,vl)>=support&&(u[0]*v[0]+u[1]*v[1])/(ul*vl)<cosCorner)corners.add(i);
    }
    const mandatory=new Set();for(let i=0;i<line.length;i++)if(corners.has(originalIndex[i]))mandatory.add(i);
    return {line,mandatory,metadata:{inputVertices:input.length,calculationVertices:line.length,tolerance:tol,cornerAngle:15,tangentSpan:interval,cornerSupport:support,stationTolerance}};
  }
  function plan(line,{interval,lateralStep,reach,sampleBudget=LIMITS.maxSamples}={}){
    // O modo por profundidade usa perfis, não uma grade 2D. Um teto maior
    // e limitado permite MDTs finos sem alterar seu passo nativo.
    const maxSamples=Number.isInteger(sampleBudget)?Math.max(LIMITS.maxSamples,Math.min(1000000,sampleBudget)):LIMITS.maxSamples;
    positive(interval,'O intervalo entre seções');positive(lateralStep,'O passo lateral');positive(reach,'O alcance de cada margem');
    if(!Array.isArray(line)||line.length<2||line.some(p=>!finitePoint(p)))throw failure('CHANNEL_INVALID_INPUT','Escolha um eixo aberto com pelo menos dois pontos XY válidos.');
    if(same(line[0],line.at(-1)))throw failure('CHANNEL_INVALID_GEOMETRY','O eixo deve ser aberto; linhas fechadas e voltas completas não são aceitas.');
    const prepared=prepareGuide(line,{interval,lateralStep});line=prepared.line;
    if(line.length>LIMITS.maxLinePoints)throw failure('CHANNEL_LIMIT','O eixo ainda tem mais de 10.000 vértices necessários após retirar redundâncias. Simplifique uma cópia ou processe por trechos.');
    const checked=geometry(line,false,'Eixo'),distances=[0];for(const e of checked.edges)distances.push(distances.at(-1)+e.length);
    const length=distances.at(-1),n=Math.ceil(length/interval),halfCount=Math.ceil(reach/lateralStep);
    if(!Number.isFinite(length)||!Number.isFinite(n)||!Number.isFinite(halfCount))throw failure('CHANNEL_INVALID_INPUT','Dimensões do levantamento inválidas.');
    if(n+1>LIMITS.maxSections||(!prepared.mandatory&&line.length>LIMITS.maxSections))throw failure('CHANNEL_LIMIT','Mais de 2.000 seções seriam necessárias. Divida o eixo ou aumente o intervalo, preservando os vértices.');
    if((2*halfCount+1)*(n+1)>maxSamples)throw failure('CHANNEL_LIMIT','O levantamento excede '+(maxSamples===250000?'250 mil':maxSamples.toLocaleString('pt-BR'))+' amostras. Aumente o espaçamento das seções ou reduza a faixa de busca; a resolução lateral do MDT será mantida.');
    // A grade uniforme usa o comprimento total: inverter o eixo mantém as mesmas
    // estações físicas. Eixos densos preservam os cantos; os demais mantêm seus vértices.
    const candidates=distances.map((station,vertex)=>({station,vertex})).filter(c=>!prepared.mandatory||prepared.mandatory.has(c.vertex));
    for(let i=0;i<=n;i++)candidates.push({station:length*i/n});candidates.sort((a,b)=>a.station-b.station);
    const stations=[];for(const c of candidates){const prev=stations.at(-1);if(prev&&Math.abs(prev.station-c.station)<=checked.eps){if(c.vertex!==undefined)stations[stations.length-1]=c;}else stations.push(c);}
    if(prepared.metadata){
      // A tight U or a real short zigzag must not disappear between uniform
      // stations. Add its actual guide vertex, without replacing the curve by
      // the outline used only for corner detection.
      const curveTolerance=Math.max(lateralStep*2,interval/4),pending=[];
      for(let i=1;i<stations.length;i++)pending.push([stations[i-1],stations[i]]);
      while(pending.length){
        const [a,b]=pending.pop(),p=pointAtStation(a.station),q=pointAtStation(b.station),dx=q[0]-p[0],dy=q[1]-p[1],den=dx*dx+dy*dy;
        let far=-1,max=curveTolerance*curveTolerance;
        for(let i=1;i<line.length-1;i++)if(distances[i]>a.station+checked.eps&&distances[i]<b.station-checked.eps){
          const v=line[i],t=den?Math.max(0,Math.min(1,((v[0]-p[0])*dx+(v[1]-p[1])*dy)/den)):0,d2=(v[0]-p[0]-t*dx)**2+(v[1]-p[1]-t*dy)**2;
          if(d2>max){max=d2;far=i;}
        }
        if(far>=0){const at={station:distances[far],vertex:far};stations.push(at);pending.push([a,at],[at,b]);if(stations.length>LIMITS.maxSections)throw failure('CHANNEL_LIMIT','Mais de 2.000 seções ao preservar as curvas do eixo. Divida o eixo ou aumente o intervalo.');}
      }
      stations.sort((a,b)=>a.station-b.station);prepared.metadata.curveTolerance=curveTolerance;
    }
    if(stations.length>LIMITS.maxSections)throw failure('CHANNEL_LIMIT','Mais de 2.000 seções ao preservar os vértices. Divida o eixo ou aumente o intervalo.');
    const sampleCount=stations.length*(2*halfCount+1);
    if(sampleCount>maxSamples)throw failure('CHANNEL_LIMIT','Os perfis excedem '+(maxSamples===250000?'250 mil':maxSamples.toLocaleString('pt-BR'))+' amostras ao preservar os vértices. Divida o eixo ou reduza a faixa de busca.');
    const actualStep=reach/halfCount,offsets=Array.from({length:2*halfCount+1},(_,i)=>(i-halfCount)*actualStep),sections=[];
    function pointAtStation(station){
      station=Math.max(0,Math.min(length,station));let lo=0,hi=distances.length-1;
      while(lo+1<hi){const mid=(lo+hi)>>1;if(distances[mid]<=station)lo=mid;else hi=mid;}
      const edge=checked.edges[Math.min(lo,checked.edges.length-1)],f=(station-distances[edge.i])/edge.length;
      return [line[edge.i][0]+edge.v[0]*f,line[edge.i][1]+edge.v[1]*f];
    }
    let edgeIndex=0;
    for(const at of stations){
      while(edgeIndex<checked.edges.length-1&&distances[edgeIndex+1]<at.station-checked.eps)edgeIndex++;
      let center,tangent;
      if(at.vertex!==undefined){
        center=line[at.vertex].slice(0,2);
        const previous=checked.edges[at.vertex-1],next=checked.edges[at.vertex];
        tangent=previous&&next?[previous.v[0]/previous.length+next.v[0]/next.length,previous.v[1]/previous.length+next.v[1]/next.length]:(previous||next).v.slice();
      }else{
        const edge=checked.edges[edgeIndex],f=(at.station-distances[edgeIndex])/edge.length;
        center=[line[edgeIndex][0]+edge.v[0]*f,line[edgeIndex][1]+edge.v[1]*f];tangent=edge.v.slice();
      }
      if(prepared.metadata?.tangentSpan){
        // A metric arc window is independent of raster stair direction and
        // reverses exactly with the guide. Centres stay on the original path.
        let span=prepared.metadata.tangentSpan;
        const minimumSpan=Math.max(lateralStep*4,.001);
        while(span>=minimumSpan){
          const a=pointAtStation(at.station-span/2),b=pointAtStation(at.station+span/2),candidate=[b[0]-a[0],b[1]-a[1]],covered=Math.min(length,at.station+span/2)-Math.max(0,at.station-span/2);
          if(Math.hypot(...candidate)>=covered*.5){tangent=candidate;break;}
          span/=2;
        }
      }
      const norm=Math.hypot(...tangent);if(!(norm>1e-10))throw failure('CHANNEL_INVALID_GEOMETRY','Mudança de direção indefinida no eixo. Divida ou revise a curva.');
      const normal=[-tangent[1]/norm,tangent[0]/norm],points=offsets.map(d=>[center[0]+normal[0]*d,center[1]+normal[1]*d]);
      sections.push({station:at.station,center,normal,offsets,points});
    }
    return {sections,length,sampleCount,interval,lateralStep:actualStep,reach,guideLine:line.map(p=>p.slice(0,2)),guidePreparation:prepared.metadata,limits:{...LIMITS,maxSamples}};
  }
  function findFloor(offsets,z,axisIndex,source,resolution,label){
    // O eixo é um guia, não uma obrigação de passar no talvegue. Procurar só
    // dentro do corredor original e da componente de MDT válido que contém o
    // guia; nunca saltar NoData para alcançar um mínimo mais baixo.
    let lo=axisIndex,hi=axisIndex;
    while(lo>0&&Number.isFinite(z[lo-1]))lo--;
    while(hi+1<z.length&&Number.isFinite(z[hi+1]))hi++;
    const eps=1e-8,minima=[];
    for(let a=lo;a<=hi;){
      let b=a;while(b<hi&&Math.abs(z[b+1]-z[a])<=eps)b++;
      if(a>lo&&b<hi&&z[a-1]>z[a]+eps&&z[b+1]>z[b]+eps)minima.push({a,b,z:z[a]});
      a=b+1;
    }
    // Oscilações de pequeno relevo pertencem à mesma bacia. Um vale remoto
    // separado por uma crista significativa permanece uma alternativa distinta.
    const basins=[];
    for(const m of minima){
      const previous=basins.at(-1);let crest=-Infinity;
      if(previous)for(let j=previous.last.b;j<=m.a;j++)crest=Math.max(crest,z[j]);
      if(previous&&crest-Math.max(previous.last.z,m.z)<=FLOOR_RULES.mergeRelief+eps){previous.b=m.b;previous.last=m;}
      else basins.push({a:m.a,b:m.b,last:m});
    }
    const point=j=>[source.center[0]+source.normal[0]*offsets[j],source.center[1]+source.normal[1]*offsets[j]];
    function preferred(a,b){
      if(z[a]<z[b]-eps)return true;if(z[a]>z[b]+eps)return false;
      if(Math.abs(offsets[a])<Math.abs(offsets[b])-eps)return true;if(Math.abs(offsets[a])>Math.abs(offsets[b])+eps)return false;
      // Empate físico, independente do sentido do guia e do sinal do normal.
      const p=point(a),q=point(b);return p[0]<q[0]-eps||(Math.abs(p[0]-q[0])<=eps&&p[1]<q[1]);
    }
    const pathCrest=[];pathCrest[axisIndex]=z[axisIndex];
    for(let j=axisIndex-1;j>=lo;j--)pathCrest[j]=Math.max(pathCrest[j+1],z[j]);
    for(let j=axisIndex+1;j<=hi;j++)pathCrest[j]=Math.max(pathCrest[j-1],z[j]);
    const candidates=[];
    for(const basin of basins){
      let index=basin.a;for(let j=basin.a+1;j<=basin.b;j++)if(preferred(j,index))index=j;
      const crest=pathCrest[index];
      if(crest-z[axisIndex]>FLOOR_RULES.guideBarrierRelief+eps)continue;
      candidates.push({index,distance:Math.abs(offsets[index]),crest});
    }
    candidates.sort((a,b)=>a.distance-b.distance);
    if(!candidates.length){
      // Um perfil totalmente plano ainda pode produzir o diagnóstico habitual
      // de ausência de margem, mas nunca uma borda artificial no limite.
      let min=Infinity,max=-Infinity;for(let j=lo;j<=hi;j++){min=Math.min(min,z[j]);max=Math.max(max,z[j]);}
      if(max-min<=eps&&lo===0&&hi===z.length-1)candidates.push({index:axisIndex,distance:0,crest:z[axisIndex]});
      else if(lo>0||hi<z.length-1)throw failure('CHANNEL_NO_DATA',label+': NoData impede delimitar um fundo conectado ao guia. Não se pode atravessar essa lacuna.');
      else if(basins.length)throw failure('CHANNEL_BARRIER',label+': há uma crista separando o guia dos fundos de vale encontrados. Não atravesse essa barreira ampliando a busca; confira o perfil.');
      else{
        const canContinue=(z[lo]<=z[lo+1]+eps&&pathCrest[lo]<=z[axisIndex]+FLOOR_RULES.guideBarrierRelief+eps)||(z[hi]<=z[hi-1]+eps&&pathCrest[hi]<=z[axisIndex]+FLOOR_RULES.guideBarrierRelief+eps);
        throw failure(canContinue?'CHANNEL_REACH_FLOOR':'CHANNEL_BARRIER',label+': não há fundo de vale delimitado e acessível dentro do corredor. Confira o perfil e o alcance; nenhum fundo foi extrapolado.');
      }
    }
    if(candidates.length>1&&candidates[1].distance-candidates[0].distance<=resolution*FLOOR_RULES.ambiguityPixels+eps)throw failure('CHANNEL_AMBIGUOUS_FLOOR',label+': há fundos de vales concorrentes a distâncias semelhantes do guia. A escolha é ambígua; confira o perfil ou delimite melhor o corredor.');
    const index=candidates[0].index;
    return {index,floorOffset:offsets[index],zFloor:z[index],floorPoint:point(index),floorDetection:{method:'Fundo de bacia local mais próxima do guia, sem cruzar crista ou NoData',candidateCount:candidates.length,rules:{...FLOOR_RULES},reviewRequired:true}};
  }
  function detectBank(offsets,z,centerIndex,direction,zAxis,resolution,label){
    const samples=[];let hasNoData=false;
    for(let i=centerIndex;i>=0&&i<offsets.length;i+=direction){
      if(!Number.isFinite(z[i])){hasNoData=true;break;}
      samples.push({d:Math.abs(offsets[i]),z:z[i]});
    }
    const lastDistance=samples.at(-1)?.d||0;
    const median=values=>{const a=values.slice().sort((x,y)=>x-y),m=a.length>>1;return a.length%2?a[m]:(a[m-1]+a[m])/2;};
    function valueAt(distance){
      let lo=0,hi=samples.length-1;
      while(lo+1<hi){const m=(lo+hi)>>1;if(samples[m].d<distance)lo=m;else hi=m;}
      const a=samples[lo],b=samples[hi];return a.d===b.d?a.z:a.z+(b.z-a.z)*(distance-a.d)/(b.d-a.d);
    }
    function fitPoints(pts){
      const slopes=[];
      for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++)if(pts[j].d-pts[i].d>=resolution-1e-9)slopes.push((pts[j].z-pts[i].z)/(pts[j].d-pts[i].d));
      const slope=median(slopes),intercept=median(pts.map(p=>p.z-slope*p.d)),residuals=pts.map(p=>Math.abs(p.z-slope*p.d-intercept));
      return {slope,intercept,residuals,mad:median(residuals),points:pts};
    }
    function fit(start,window){
      // Posições a meio pixel apenas interpolam o MDT; as inclinações usam
      // pares separados por pelo menos um pixel nativo, em todas as escalas.
      const n=Math.round(window/resolution*2);
      return fitPoints(Array.from({length:n+1},(_,i)=>({d:start+window*i/n,z:valueAt(start+window*i/n)})));
    }
    const candidates=[];
    for(const sample of samples)for(const scale of AUTO_RULES.windowPixels){
      const d=sample.d,window=resolution*scale;
      if(d+1e-9<window||d+window>lastDistance+1e-9)continue;
      const before=fit(d-window,window),after=fit(d,window);
      if(before.slope<AUTO_RULES.minRisingSlope||Math.abs(after.slope)>before.slope*AUTO_RULES.maxOutsideSlopeRatio+1e-10)continue;
      const tolerance=Math.max(AUTO_RULES.minResidualTolerance,before.slope*window*AUTO_RULES.residualRatio),inliers=f=>f.residuals.filter(v=>v<=tolerance+1e-9).length/f.residuals.length;
      if(inliers(before)<AUTO_RULES.minInlierFraction||inliers(after)<AUTO_RULES.minInlierFraction)continue;
      const whole=fitPoints([...before.points,...after.points.slice(1)]),splitLoss=median([...before.residuals,...after.residuals.slice(1)]),gain=whole.mad-splitLoss,improvement=gain/Math.max(whole.mad,AUTO_RULES.minResidualTolerance);
      // Uma rampa uniforme (V) não ganha explicação por duas tendências. A
      // melhora absoluta também evita promover apenas oscilação numérica.
      if(gain<AUTO_RULES.minModelGain||improvement<AUTO_RULES.minModelImprovement)continue;
      const topDistance=(after.intercept-before.intercept)/(before.slope-after.slope),fitElevation=before.slope*topDistance+before.intercept;
      if(!Number.isFinite(topDistance)||!Number.isFinite(fitElevation)||Math.abs(topDistance-d)>Math.max(resolution,window/2)+1e-9||topDistance<=0||topDistance>lastDistance)continue;
      // A interseção de retas numa margem arredondada pode ficar acima da
      // superfície: a cota adotada vem do próprio perfil amostrado, sem extrapolar.
      const elevation=valueAt(topDistance);
      if(elevation>zAxis&&elevation-zAxis<AUTO_RULES.minRelief)continue;
      const score=Math.abs(after.slope)/before.slope+(before.mad+after.mad)/(before.slope*window)-.25*improvement;
      candidates.push({distance:topDistance,offset:direction*topDistance,elevation,fitElevation,risingSlope:before.slope,outsideSlope:after.slope,windowMeters:window,windowPixels:scale,fitTolerance:tolerance,modelImprovement:improvement,score});
    }
    candidates.sort((a,b)=>a.distance-b.distance);
    const firstDistance=candidates[0]?.distance,cluster=candidates.filter(c=>c.distance<=firstDistance+resolution*AUTO_RULES.refinePixels+1e-9);
    let best=null;
    for(const candidate of cluster){
      candidate.supportScales=[...new Set(cluster.filter(c=>Math.abs(c.distance-candidate.distance)<=resolution).map(c=>c.windowPixels))].sort((a,b)=>a-b);
      if(!best||candidate.score<best.score-1e-10||(Math.abs(candidate.score-best.score)<=1e-10&&candidate.risingSlope>best.risingSlope))best=candidate;
    }
    if(!best){
      if(hasNoData)throw failure('CHANNEL_NO_DATA',label+': NoData antes de confirmar a quebra da margem. Confira o perfil e use a altura manual ou um MDT mais adequado.');
      // Uma ampliação só é admissível quando não há barreira interna já visível.
      guardReturn(offsets,z,centerIndex,direction,lastDistance,zAxis,resolution,label);
      throw failure('CHANNEL_REACH_BREAK',label+': Não há quebra de declive consistente entre margem ascendente e patamar exterior no alcance atual. Confira o perfil e use a altura manual ou um MDT mais adequado.');
    }
    if(!(best.elevation>zAxis))throw failure('CHANNEL_BARRIER',label+': o fundo selecionado está acima da borda inferida. Confira a bacia e o MDT; não se pode elevar o nível automaticamente para ultrapassar essa borda.');
    guardReturn(offsets,z,centerIndex,direction,best.distance,zAxis,resolution,label);
    delete best.score;return best;
  }
  function guardReturn(offsets,z,centerIndex,direction,distance,zAxis,resolution,label){
    // Não alcançar uma quebra ou interseção distante atravessando uma crista e
    // voltando a outra depressão. A mediana ignora um único dente subpixel.
    const samples=[];
    for(let i=centerIndex;i>=0&&i<offsets.length;i+=direction){samples.push({d:Math.abs(offsets[i]),z:z[i]});if(Math.abs(offsets[i])>=distance)break;}
    const median=values=>values.slice().sort((a,b)=>a-b)[1];
    function valueAt(d){
      let lo=0,hi=samples.length-1;while(lo+1<hi){const m=(lo+hi)>>1;if(samples[m].d<d)lo=m;else hi=m;}
      const a=samples[lo],b=samples[hi];return a.d===b.d?a.z:a.z+(b.z-a.z)*(d-a.d)/(b.d-a.d);
    }
    let peak=zAxis;
    for(let d=resolution/2;d<distance-resolution/2;d+=resolution/2){
      const value=median([valueAt(Math.max(0,d-resolution/2)),valueAt(d),valueAt(Math.min(distance,d+resolution/2))]);
      const allowedDrop=Math.max(AUTO_RULES.returnDrop,.15*Math.max(0,peak-zAxis));
      if(peak-zAxis>=AUTO_RULES.minRelief&&peak-value>allowedDrop)throw failure('CHANNEL_BARRIER',label+': há uma crista seguida de outra depressão antes da borda candidata. Não atravesse essa barreira automaticamente; confira o eixo e o perfil.');
      peak=Math.max(peak,value);
    }
  }
  function analyze(layout,heights2D,{mode='height',height,resolution,allowPartial=false}={}){
    if(!['auto','height','depth','axisHeight'].includes(mode))throw failure('CHANNEL_INVALID_INPUT','Modo de identificação da calha inválido.');
    if(mode!=='auto')positive(height,mode==='depth'?'A profundidade acima do fundo':'O desnível acima do fundo');positive(resolution,'A resolução nativa do MDT');
    const input=layout?.sections;
    if(!Array.isArray(input)||input.length<2||input.length>LIMITS.maxSections||!Array.isArray(heights2D)||heights2D.length!==input.length)throw failure('CHANNEL_INVALID_INPUT','Plano e alturas do MDT não correspondem às seções solicitadas.');
    const maxSamples=(mode==='depth'||mode==='axisHeight'||mode==='auto')?Math.min(1000000,Math.max(LIMITS.maxSamples,layout.limits?.maxSamples||0)):LIMITS.maxSamples;
    if(input.reduce((n,s)=>n+(s.offsets?.length||0),0)>maxSamples)throw failure('CHANNEL_LIMIT','O plano excede o limite de amostras. Divida o eixo ou aumente o espaçamento das seções.');
    const sections=[],runs=[[]],omitted=[];
    const recoverable=code=>['CHANNEL_NO_DATA','CHANNEL_BARRIER','CHANNEL_AMBIGUOUS_FLOOR','CHANNEL_REACH_BANK','CHANNEL_REACH_BREAK','CHANNEL_REACH_FLOOR'].includes(code);
    for(let i=0;i<input.length;i++){
      const source=input[i],offsets=source.offsets,z=heights2D[i],label='Seção '+(i+1)+' ('+Number(source.station).toFixed(2)+' m)';
      let floor=null,level=null;
      try{
      if(!finitePoint(source.center)||!finitePoint(source.normal)||Math.abs(Math.hypot(...source.normal)-1)>1e-8||!Array.isArray(offsets)||offsets.length<3||!z||z.length!==offsets.length)throw failure('CHANNEL_INVALID_INPUT',label+': perfil inválido ou alturas incompletas.');
      const centerIndex=offsets.findIndex(d=>d===0);
      if(centerIndex<=0||centerIndex>=offsets.length-1)throw failure('CHANNEL_INVALID_INPUT',label+': falta a amostra do eixo entre as duas margens.');
      for(let j=0;j<offsets.length;j++){
        if(!Number.isFinite(offsets[j])||(j&&offsets[j]<=offsets[j-1]))throw failure('CHANNEL_INVALID_INPUT',label+': offsets fora de ordem.');
        if(j&&offsets[j]-offsets[j-1]>resolution/2+Math.max(1e-9,resolution*1e-10))throw failure('CHANNEL_RESOLUTION',label+': o passo lateral deve ser no máximo metade do pixel nativo do MDT.');
      }
      const zAxis=z[centerIndex];if(!Number.isFinite(zAxis))throw failure('CHANNEL_NO_DATA',label+': MDT sem cota válida no eixo. Nenhuma calha foi criada.');
      floor=mode==='axisHeight'?{index:centerIndex,floorOffset:0,zFloor:zAxis,floorPoint:source.center.slice(),floorDetection:null}:findFloor(offsets,z,centerIndex,source,resolution,label);
      const {index:floorIndex,floorOffset,zFloor,floorPoint,floorDetection}=floor,relativeOffsets=offsets.map(d=>d-floorOffset);
      let detection=null;
      if(mode==='auto'){
        const find=(direction,side)=>{try{const bank=detectBank(relativeOffsets,z,floorIndex,direction,zFloor,resolution,label+' — '+side);bank.offset+=floorOffset;return {bank};}catch(error){if(error.code==='CHANNEL_REACH_BREAK')return {bank:null,error};throw error;}};
        const r=find(-1,'direita'),l=find(1,'esquerda'),right=r.bank,left=l.bank,supportSides=Number(!!left)+Number(!!right);
        if(!supportSides)throw r.error||l.error;
        level=left&&right?Math.min(left.elevation,right.elevation):(left||right).elevation;
        detection={method:supportSides===2?'Primeira quebra sustentada de declive':'Nível por uma margem; oposta por interseção',supportSides,confidence:supportSides===2?'Duas quebras geométricas; requer revisão':'Apoio unilateral; revisão reforçada',left,right,rules:{...AUTO_RULES,windowPixels:AUTO_RULES.windowPixels.slice()}};
        if(!(level>zFloor))throw failure('CHANNEL_BARRIER',label+': o fundo selecionado está acima da margem mais baixa inferida. Confira o perfil e o MDT.');
      }else level=zFloor+height;
      if(!Number.isFinite(level)||!(level>zFloor))throw failure('CHANNEL_INVALID_INPUT',label+': desnível fora da precisão numérica das cotas.');
      function firstCrossing(direction,side){
        // O ajuste automático pode diferir de um patamar constante por ruído
        // numérico nanométrico, especialmente após rotação/reprojeção UTM.
        const numericalTolerance=mode!=='height'?Math.max(1e-9,Math.abs(level)*1e-12):0;
        let last=floorIndex;
        for(let j=floorIndex+direction;j>=0&&j<offsets.length;j+=direction){
          if(!Number.isFinite(z[j]))throw failure('CHANNEL_NO_DATA',label+': NoData ou limite do MDT antes da margem '+side+'. Nenhuma calha foi criada.');
          if(z[j]>=level-numericalTolerance){
            const fraction=Math.max(0,Math.min(1,(level-z[last])/(z[j]-z[last]))),at=offsets[last]+fraction*(offsets[j]-offsets[last]);
            // "height" mantém a política antiga das receitas já salvas.
            // "depth" preenche a componente conectada abaixo do nível local:
            // uma crista submersa faz parte dela, não é uma barreira seca.
            // O primeiro terreno >= nível sempre encerra a seção neste lado.
            if(mode!=='depth'&&mode!=='axisHeight')guardReturn(relativeOffsets,z,floorIndex,direction,Math.abs(at-floorOffset),zFloor,resolution,label+' — '+side);
            return at;
          }
          last=j;
        }
        if(mode!=='depth'&&mode!=='axisHeight')guardReturn(relativeOffsets,z,floorIndex,direction,Math.abs(relativeOffsets[last]),zFloor,resolution,label+' — '+side);
        throw failure('CHANNEL_REACH_BANK',label+': margem '+side+' não encontrada no alcance. O perfil pode estar aberto ou o alcance ser insuficiente. Nenhuma calha foi criada.');
      }
      const rightOffset=firstCrossing(-1,'direita'),leftOffset=firstCrossing(1,'esquerda'),width=leftOffset-rightOffset;
      if(mode==='auto'&&detection.supportSides===1){
        if(!detection.left)guardReturn(relativeOffsets,z,floorIndex,1,leftOffset-floorOffset,zFloor,resolution,label+' — esquerda');
        if(!detection.right)guardReturn(relativeOffsets,z,floorIndex,-1,floorOffset-rightOffset,zFloor,resolution,label+' — direita');
      }
      if(!Number.isFinite(width)||!(width>0))throw failure('CHANNEL_INVALID_GEOMETRY',label+': as margens não delimitam uma largura positiva.');
      const resolutionLimited=width<2*resolution-Math.max(1e-8,resolution*1e-9);
      // Keep the legacy recipe policy. Current modes may interpolate a narrow
      // connected band; flag its precision, never widen it to two pixels.
      if(mode==='height'&&resolutionLimited)throw failure('CHANNEL_RESOLUTION',label+': largura de '+width.toFixed(3)+' m menor que dois pixels nativos ('+(2*resolution).toFixed(3)+' m). Use o modo Profundidade acima do fundo para gerar a faixa estimada.');
      const point=d=>[source.center[0]+source.normal[0]*d,source.center[1]+source.normal[1]*d];
      sections.push({referenceKind:mode==='axisHeight'?'axis':'floor',station:source.station,center:source.center.slice(),normal:source.normal.slice(),width,resolutionLimited,left:point(leftOffset),right:point(rightOffset),leftOffset,rightOffset,zAxis,floorOffset,zFloor,floorPoint:floorPoint.slice(),floorDetection,level,mode,method:mode==='axisHeight'?'Altura sobre o eixo por perfis':mode==='depth'?'Profundidade informada':mode==='height'?'Altura informada (legado)':detection.method,effectiveHeight:level-zFloor,detection,profile:offsets.map((offset,j)=>({offset,z:Number.isFinite(z[j])?z[j]:null}))});
      runs[runs.length-1].push(sections[sections.length-1]);
      }catch(error){
        const e=error instanceof Error?error:Error(String(error)),axisIndex=Array.isArray(offsets)?offsets.findIndex(d=>d===0):-1;
        e.code=e.code||'CHANNEL_INVALID_INPUT';
        e.diagnostic={station:source.station,center:Array.isArray(source.center)?source.center.slice():null,normal:Array.isArray(source.normal)?source.normal.slice():null,zAxis:Number.isFinite(z?.[axisIndex])?z[axisIndex]:null,floorOffset:floor?.floorOffset??null,zFloor:floor?.zFloor??null,floorPoint:floor?.floorPoint?.slice()??null,level:Number.isFinite(level)?level:null,effectiveHeight:Number.isFinite(level)&&Number.isFinite(floor?.zFloor)?level-floor.zFloor:null,mode,method:mode==='axisHeight'?'Altura sobre o eixo por perfis':mode==='depth'?'Profundidade informada':mode==='height'?'Altura informada (legado)':'Margens automáticas por relevo',profile:Array.isArray(offsets)?offsets.map((offset,j)=>({offset,z:Number.isFinite(z?.[j])?z[j]:null})):[],code:e.code,message:e.message};
        if(allowPartial&&recoverable(e.code)){omitted.push(e.diagnostic);if(runs[runs.length-1].length)runs.push([]);continue;}
        throw e;
      }
    }
    if(allowPartial){
      const segments=[];
      // Never join sections across a rejected profile. Cap each valid run at
      // its last measured section; geometry failures split only that run.
      const divide=rows=>{
        if(!rows.length)return;
        if(rows.length<2){omitted.push({...rows[0],code:'CHANNEL_ISOLATED_SECTION',message:'Seção isolada, sem outra seção válida para formar área.'});return;}
        try{segments.push(finish(rows));}
        catch(e){
          if(e.code!=='CHANNEL_INVALID_GEOMETRY')throw e;
          if(rows.length===2){rows.forEach(row=>omitted.push({...row,code:e.code,message:e.message}));return;}
          const mid=Math.floor(rows.length/2);divide(rows.slice(0,mid));divide(rows.slice(mid));
        }
      };
      runs.forEach(divide);
      const partial=omitted.length>0||segments.length>1;
      return {...(segments[0]||{ring:null,mode}),guidePreparation:layout.guidePreparation||null,segments,polygons:segments.map(s=>[s.ring]),
        sections:segments.flatMap(s=>s.sections),omitted,partial,
        warnings:[...new Set(segments.flatMap(s=>s.warnings)),...(partial?[omitted.length+' seção(ões) não aproveitada(s). '+segments.length+' trecho(s) fechado(s) para refinamento manual; as lacunas não foram conectadas.']:[])]};
    }
    return finish(sections);
    function finish(sections){
    const ring=[...sections.map(s=>s.left.slice()),...sections.slice().reverse().map(s=>s.right.slice())];ring.push(ring[0].slice());
    const polygon=geometry(ring,true,'Calha estimada');
    // Valida a continuidade da componente escolhida, não a inclusão do guia:
    // a linha original pode legitimamente estar acima ou fora da calha.
    geometry(sections.map(s=>s.floorPoint),false,'Percurso dos fundos');
    function inside(p){let hit=false;for(let i=0,j=ring.length-2;i<ring.length-1;j=i++){
      const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
    }return hit;}
    const first=sections[0].floorPoint,second=sections[1].floorPoint;
    if(!inside([(first[0]+second[0])/2,(first[1]+second[1])/2]))throw failure('CHANNEL_INVALID_GEOMETRY','As margens interpoladas deixam o percurso dos fundos fora da calha. Revise as curvas e o intervalo entre seções.');
    let visits=0;
    for(let i=1;i<sections.length;i++){
      const a=sections[i-1].floorPoint.map((v,k)=>v-polygon.origin[k]),b=sections[i].floorPoint.map((v,k)=>v-polygon.origin[k]),v=[b[0]-a[0],b[1]-a[1]];
      const edge={a,b,v,length:Math.hypot(...v),box:[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])]},stack=[polygon.root];
      while(stack.length){
        if(++visits>4000000)throw failure('CHANNEL_LIMIT','Calha muito complexa para validar. Divida o eixo em trechos.');
        const node=stack.pop();if(!polygon.overlaps(edge.box,node.box))continue;
        if(node.items){for(const bank of node.items){
          // O primeiro/último fundo está sobre o fechamento transversal.
          if((i===1&&bank.i===ring.length-2)||(i===sections.length-1&&bank.i===sections.length-1))continue;
          if(polygon.overlaps(edge.box,bank.box)&&polygon.intersects(edge,bank))throw failure('CHANNEL_INVALID_GEOMETRY','O percurso dos fundos atravessa uma margem da calha interpolada. Confira seções concorrentes, curvas e intervalo.');
        }}else stack.push(node.left,node.right);
      }
    }
    return {ring,sections,mode,guidePreparation:layout.guidePreparation||null,method:mode==='axisHeight'?'Altura sobre o eixo por perfis':mode==='depth'?'Profundidade informada':mode==='height'?'Altura informada (legado)':'Margens automáticas por relevo',warnings:[
      ...(layout.guidePreparation?[layout.guidePreparation.inputVertices+' vértices no eixo original; '+layout.guidePreparation.calculationVertices+' usados no cálculo, com desvio máximo de 1 mm. O eixo original foi preservado; perfis com direção medida em janela métrica, no espaçamento informado e com seções extras nos cantos sustentados e nas curvas.']:[]),
      ...(sections.some(s=>s.resolutionLimited)?['Há seções com largura inferior a dois pixels nativos. Faixa gerada por interpolação, com precisão limitada pelo MDT; confira as margens.']:[]),
      mode==='axisHeight'?'Nível local = cota do MDT no eixo + altura informada. Margens interpoladas nos perfis, sem grade 2D; acompanha a inclinação longitudinal do eixo.':mode==='auto'?'Nível local sugerido por quebras de declive: usa a menor cota quando há duas bordas, ou uma borda observada e a primeira interseção oposta, com revisão reforçada. Não identifica bankfull, leito regular ou nível de cheia.':mode==='depth'?'Profundidade informada: preenche, em cada seção, a componente conectada até fundo local + profundidade. Ondulações abaixo desse nível ficam submersas; o primeiro terreno que alcança o nível encerra cada lado. O nível acompanha o fundo longitudinal, não é uma cota global nem uma simulação hidráulica.':'Calha estimada pelo desnível local acima do fundo inferido no corredor; não identifica automaticamente o leito regular ou um nível de cheia.',
      mode==='axisHeight'?'A referência é o terreno no eixo, sem deslocamento para outro fundo.':'O eixo original é apenas guia. O fundo estimado é a amostra mais baixa da bacia local selecionada dentro do corredor, sem atravessar crista significativa ou NoData; vales próximos concorrentes exigem revisão.',
      'Primeiro cruzamento no perfil amostrado, com interpolação linear. Obstáculos entre amostras ou menores que a resolução do MDT podem não ser identificados.',
      'O passo de amostragem não aumenta a resolução nativa do MDT. As extremidades do eixo fecham a calha artificialmente; revise as seções e os limites.'
    ]};
    }
  }
  return {plan,analyze};
}
window.GeoMineChannelEngine={engine};
})();
