/* Calha estimada por seções do MDT. Não identifica automaticamente o leito
   regular, não modifica o MDT e não representa simulação hidráulica. */
(function(){
'use strict';
const TOOL='riverChannelAxis',$=id=>document.getElementById('chan'+id);
let job=null,review=null,preview=null,drawing=null,creating=false,locating=false,lastCreated=null,suggested='';
// Destino escolhido por tipo: calha e massa d'água nunca dividem a camada.
const choices={calha:'auto',agua:'auto'};
const GUIDE='Eixo da calha MDT',GUIDE_TYPE='Eixo para estimativa da calha';
const number=v=>typeof v==='string'&&v.trim()===''?NaN:Number(String(v).replace(',','.'));
const signed=v=>(v>0?'+':'')+v.toFixed(2);
const filling=mode=>mode==='depth'||mode==='axisDepth'||mode==='axisHeight';
/* "Gerar como": calha de rio ou massa de água é uma escolha explícita; a lista
   de métodos mostra só os do tipo escolhido (calha = margens no MDT; massa de
   água = preenchimento por altura ou profundidade). */
const MODES={calha:[['axisHeight','Altura']],agua:[['axisHeight','Altura']]};
const kind=()=>GeoMineChannelDestination.kindOf($('Mode').value);
let nameKind=null;   // tipo a que o nome sugerido no campo se refere
const kindLabel=k=>GeoMineChannelDestination.kinds[k];
function defaultNames(mode,axis){
  return [((mode==='axisDepth'||mode==='axisHeight')?'Seções por altura MDT — ':mode==='depth'?'Seções por profundidade MDT — ':'Seções da calha MDT — ')+axis,
    ((mode==='axisDepth'||mode==='axisHeight')?'Faixa por altura MDT — ':mode==='depth'?'Faixa por profundidade MDT — ':'Calha estimada MDT — ')+axis];
}
// Both workers use this serializer; legacy recipes keep the original engine.
function workerSource(mode){
  const axis=mode==='axisDepth'||mode==='axisHeight',polygonSource=axis?document.getElementById('geomine-polygon-clipping')?.textContent:'';
  if(axis&&!polygonSource)throw Error('Módulo de união de polígonos indisponível. Atualize o aplicativo.');
  const factory=axis?'('+GeoMineChannelAxisFill.engine.toString()+')(('+GeoMineFloodFill.engine.toString()+'),('+GeoMineChannelEngine.engine.toString()+'),polygonClipping)':'('+GeoMineChannelEngine.engine.toString()+')()';
  const contour=axis?'const contour=('+GeoMineChannelContour.engine.toString()+')(polygonClipping);':'';
  /* suavização das margens: depois da análise (e da simplificação do contorno 2D) */
  const smoothing=window.GeoMineChannelSmoothing?'const smoothing=('+GeoMineChannelSmoothing.engine.toString()+')();':'const smoothing=null;';
  return (polygonSource||'')+'\nconst api='+factory+';'+contour+smoothing+'onmessage=e=>{try{const result=api[e.data.method](...e.data.args);const opts=e.data.args[2];if(e.data.method==="analyze"&&opts?.mode==="axisDepth"&&opts.simplifyOutput===true){const simplified=contour.simplify(result.polygons,{spacing:opts.interval,resolution:opts.resolution});const {polygons,...metadata}=simplified;result.nativeArea=result.area;result.area=metadata.areaAfter??result.area;result.polygons=polygons;result.ring=polygons[0][0];result.contour={spacing:opts.interval,resolution:opts.resolution,...metadata};}if(e.data.method==="analyze"&&opts?.mode!=="axisHeight"&&opts?.smooth===true&&smoothing)smoothing.apply(result,opts);postMessage({result})}catch(e){postMessage({error:e.message||String(e),code:e.code,diagnostic:e.diagnostic})}};';
}
// Native height fills read and connect bounded tiles instead of preparing one
// rectangle for the entire guide. Live recalculation uses this same entrypoint.
async function analyzeNative(sampler,line,options,context={}){
  const api=window.GeoMineChannelNativeFill;
  if(typeof api?.analyze!=='function')throw Error('Módulo de preenchimento nativo indisponível. Atualize o aplicativo.');
  return api.analyze(sampler,line,{...options,mode:'axisHeight',resolution:sampler.resolution},context);
}
function status(text){$('Status').textContent=text;}
function selected(L){
  if(typeof ED!=='undefined'&&ED.on&&ED.sel?.L===L&&L.features.includes(ED.sel.f))return ED.sel.f;
  const s=S.selFeat;return s&&(s.layer===L||s.layerId===L.id)?L.features[s.idx]||null:null;
}
function rowsFor(L,scope){return (L?.features||[]).map((f,i)=>({f,index:i+1})).filter(r=>scope==='feature'?r.f===selected(L):scope==='all'||featureVisible(L,r.f));}
function read(){return {layer:$('Layer').value,raster:$('Raster').value,scope:$('Scope').value,mode:$('Mode').value,height:number($('Height').value),interval:number($('Interval').value),reach:number($('Reach').value)/2,searchLimited:$('Limit').checked,simplifyOutput:true,smooth:$('Mode').value!=='axisHeight'&&($('Smooth')?$('Smooth').checked:true)};}
// Packed coordinates keep native grids out of millions of temporary XY arrays.
// Legacy plans still use their original list of points or transverse profiles.
function layoutSamples(plan){
  if(plan.pointCoordinates){const xy=plan.pointCoordinates;return {length:xy.length/2,slice:(a,b)=>{const out=[];for(let i=a;i<Math.min(b,xy.length/2);i++)out.push([xy[2*i],xy[2*i+1]]);return out;}};}
  return plan.points||plan.sections.flatMap(s=>s.points);
}
function layoutHeights(plan,values){
  if(plan.grid)return values;
  let cursor=0;return plan.sections.map(s=>{const z=values.slice(cursor,cursor+s.points.length);cursor+=s.points.length;return z;});
}
async function sampleLayoutBatch(sampler,plan,samples,start,end){
  const points=samples.slice(start,end),nativeCount=Math.max(0,Math.min(points.length,(plan.nativeGridSampleCount||0)-start));
  if(!nativeCount||typeof sampler.cells!=='function'||typeof sampler.locate!=='function')return sampler.sample(points);
  // An aligned pixel must use its stored value. Bilinear evaluation at a
  // numerically rounded centroid could otherwise import a NoData neighbour.
  const cells=points.slice(0,nativeCount).map(p=>{const cell=sampler.locate(p);return cell?[cell.col,cell.row]:[-1,-1];});
  const values=await sampler.cells(cells);
  if(nativeCount<points.length)values.push(...await sampler.sample(points.slice(nativeCount)));
  return values;
}
function clearPreview(){if(preview){try{map.removeLayer(preview);}catch(_){}preview=null;}}
function invalidate(){review=null;clearPreview();$('Results').hidden=true;$('APP').hidden=true;$('DepthAlternative').hidden=true;$('LocateNative').hidden=true;$('Details').disabled=true;$('Commit').disabled=!!job||creating||locating;}
function fail(e){const msg=e?.message||String(e);status(msg);$('LocateNative').hidden=e?.code!=='CHANNEL_NATIVE_MISSING';toast(msg);}
async function locateNative(){
  if(job||creating||locating)return;
  const r=S.rasters.find(x=>String(x.id)===$('Raster').value),project=S.projectId;
  if(!r||typeof rasEscolherNativoAgora!=='function')return fail(Error('Selecione o MDT e abra suas propriedades para localizar o original.'));
  locating=true;const release=window.GeoMineChannelLive?.suspend();busy(false);
  try{
    // Keep the picker on the direct click, including Android's file input.
    const ok=await rasEscolherNativoAgora(r);
    if(S.projectId!==project||!S.rasters.includes(r))return;
    if(ok){invalidate();status('MDT original vinculado. Clique em Analisar ou Criar para continuar.');}
    else status('Seleção cancelada ou arquivo não confirmado. Nenhuma calha foi alterada.');
  }catch(e){fail(e);}
  finally{locating=false;release?.();busy(false);}
}
function sourceSignature(r){
  const d=r.d,rev=g=>typeof projectNativeGridRevision==='function'?projectNativeGridRevision(g):null;
  const keys=['crs','srcCRS','quantity','unit','noData','nodata','_nd','clip','_exactClipRings','_lidarGroundMDT','_tinSourceId','_tinMethod','resampled','native','fromProject','srcDims','_W0','_H0','_bb'];
  const metadata=g=>g?{...Object.fromEntries(keys.map(k=>[k,g[k]])),tinClip:g.tin?.clip||null}:null;
  return JSON.stringify({d:rev(d),full:rev(d?._full),rMeta:metadata(r),dMeta:metadata(d),fullMeta:metadata(d?._full)});
}
function current(q,deep=false){
  return S.projectId===q.project&&S.workCRS===q.crs&&S.layers.includes(q.L)&&S.rasters.includes(q.r)&&
    q.r.d===q.d&&q.d.z===q.z&&q.d._img0===q.img&&q.d._full===q.full&&q.d._tiff===q.tiff&&
    q.r._projectSourceRaw===q.raw&&q.r._projectNativeBinding===q.binding&&(!GeoMineChannelDEM.isElevation||GeoMineChannelDEM.isElevation(q.r))&&
    String(q.L.crs)===q.lcrs&&JSON.stringify(read())===q.optionsJSON&&
    JSON.stringify(rowsFor(q.L,q.o.scope).map(r=>r.index))===q.indices&&q.rows.every(row=>q.L.features[row.index-1]===row.f)&&
    (!deep||(JSON.stringify(q.rows.map(row=>row.f))===q.featuresJSON&&sourceSignature(q.r)===q.signature));
}
function validate(){
  const o=read(),L=S.layers.find(x=>String(x.id)===o.layer),r=S.rasters.find(x=>String(x.id)===o.raster);
  if(!L||L.gtype!=='line')throw Error('Selecione ou desenhe uma linha-guia ao longo do rio.');
  if(!r?.d||GeoMineChannelDEM.isElevation&&!GeoMineChannelDEM.isElevation(r))throw Error('Selecione um MDT com cotas do terreno em metros, não declividade, aspecto ou outro índice.');
  const p=proj4(S.workCRS).oProj;if(p.projName!=='utm'||Math.abs((p.to_meter||1)-1)>1e-10)throw Error('Use o CRS UTM em metros da região do projeto.');
  if(!['auto','depth','axisDepth','axisHeight'].includes(o.mode))throw Error('Escolha um modo de delimitação.');
  if(o.mode==='depth'&&(!(o.height>0)||o.height>100))throw Error('Informe uma profundidade positiva, até 100 m, acima do fundo encontrado no MDT. Não é uma cota absoluta nem a altura acima da linha-guia.');
  if((o.mode==='axisDepth'||o.mode==='axisHeight')&&(!(o.height>0)||o.height>100))throw Error('Informe a altura de preenchimento, maior que zero e até 100 m, acima do terreno no eixo. Não é uma cota absoluta.');
  if(!(o.interval>=.5&&o.interval<=100))throw Error('O intervalo entre seções deve ficar entre 0,5 e 100 m.');
  if(o.searchLimited&&!(o.reach>=1&&o.reach<=2000))throw Error('A largura total da busca deve ficar entre 2 e 4.000 m (metade para cada lado).');
  const rows=rowsFor(L,o.scope);if(!rows.length)throw Error(o.scope==='feature'?'Selecione uma linha desta camada no mapa.':'A camada não tem linhas neste escopo.');
  if(rows.length>100)throw Error('Processe no máximo 100 eixos por vez.');
  let convert;try{if(!L.crs)throw Error('CRS ausente');convert=proj4(L.crs,S.workCRS);}catch(_){throw Error('Defina um CRS válido para a camada de eixos antes de analisar.');}
  const q={o,L,r,rows,project:S.projectId,crs:S.workCRS,lcrs:String(L.crs),d:r.d,z:r.d.z,img:r.d._img0,full:r.d._full,tiff:r.d._tiff,raw:r._projectSourceRaw,binding:r._projectNativeBinding,
    optionsJSON:JSON.stringify(o),indices:JSON.stringify(rows.map(r=>r.index)),featuresJSON:JSON.stringify(rows.map(row=>row.f)),signature:sourceSignature(r)};
  q.lines=rows.map(row=>{
    let g=row.f.geom;while(Array.isArray(g)&&g.length===1&&Array.isArray(g[0]?.[0]))g=g[0];
    if(!Array.isArray(g)||g.length<2||g.some(p=>!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])))throw Error('Eixo '+row.index+': use uma linha contínua, sem multipartes. Separe os trechos antes de analisar.');
    return g.map(p=>{let xy;try{xy=L.crs===S.workCRS?p.slice(0,2):convert.forward(p.slice(0,2));}catch(_){throw Error('Eixo '+row.index+': falha na reprojeção das coordenadas.');}if(!xy.every(Number.isFinite))throw Error('Eixo '+row.index+': coordenadas reprojetadas inválidas.');return xy;});
  });return q;
}
function busy(on){
  const locked=on||creating||locating;
  ['Layer','Scope','Raster','Mode','Height','Interval','Limit','Reach','Live','Retry','Draw','Analyze','Close','Section','DepthAlternative','Details','Commit','Destination','NewName','KindCalha','KindAgua','LocateNative','LessDepth','MoreDepth'].forEach(id=>$(id).disabled=locked);
  $('Details').disabled=locked||!review||review.blocked;
  $('Reach').disabled=locked||!$('Limit').checked;
  $('Cancel').hidden=!on;$('Progress').hidden=!on;if(on)$('Progress').value=0;
}
function workerCall(j,method,args){
  return new Promise((resolve,reject)=>{
    if(j.cancelled||j.controller.signal.aborted){reject(Error(j.reason||'Análise cancelada. Nenhuma calha foi criada.'));return;}
    j.reject=reject;j.worker.onmessage=e=>{j.reject=null;e.data.error?reject(Object.assign(Error(e.data.error),{code:e.data.code,diagnostic:e.data.diagnostic})):resolve(e.data.result);};
    j.worker.onerror=e=>{j.reject=null;reject(Error(e.message||'Falha no cálculo das seções.'));};
    j.worker.postMessage({method,args});
  });
}
function cancel(){if(job){job.cancelled=true;job.controller.abort();job.worker?.terminate();job.reject?.(Error('Análise cancelada. Nenhuma calha foi criada.'));}}
async function generate(){
  if(job||locating)return;
  let j;
  try{
    invalidate();const q=validate();j=job={controller:new AbortController(),cancelled:false,q};busy(true);
    if(q.o.mode!=='axisHeight'){
      const url=URL.createObjectURL(new Blob([workerSource(q.o.mode)],{type:'text/javascript'}));
      j.worker=new Worker(url);URL.revokeObjectURL(url);
      j.timer=setTimeout(()=>{j.reason='Análise excedeu 3 minutos. Divida o eixo em trechos menores.';j.cancelled=true;j.controller.abort();j.worker.terminate();j.reject?.(Error(j.reason));},180000);
    }
    const check=()=>!j.cancelled&&current(q);
    status('Preparando a leitura do MDT na resolução original…');
    j.sampler=await GeoMineChannelDEM.prepare(q.r,{workCRS:q.crs,signal:j.controller.signal,isCurrent:check,onProgress:m=>{if(typeof m==='string')status(m);}});
    const resolution=j.sampler.resolution;if(!(resolution>0&&Number.isFinite(resolution)))throw Error('Não foi possível determinar a resolução do MDT em metros.');
    const outputs=[],reaches=GeoMineChannelSearchPolicy.reaches(q.o);let sampled=0;
    for(let i=0;i<q.lines.length;i++){
      for(let attempt=0;attempt<reaches.length;attempt++){
       const reach=reaches[attempt];
       if(!check())throw Error('Os dados mudaram ou a análise foi cancelada. Analise novamente.');
       status('Preparando seções do eixo '+q.rows[i].index+' · faixa de '+(2*reach)+' m…');
       if(q.o.mode==='axisHeight'){
        const result=await analyzeNative(j.sampler,q.lines[i],{...q.o,reach,resolution,allowPartial:true},{
          signal:j.controller.signal,isCurrent:check,onProgress:p=>{
            if(!check())return;
            status('Eixo '+(i+1)+'/'+q.lines.length+' · '+(p.message||'Preenchendo o MDT em blocos nativos')+(p.nWet?' · '+p.nWet.toLocaleString('pt-BR')+' células molhadas':''));
            if(Number.isFinite(p.progress))$('Progress').value=90*(i+Math.max(0,Math.min(1,p.progress)))/q.lines.length;
            else $('Progress').removeAttribute('value');
          }
        });
        if(!check())throw Error('Os dados mudaram ou a análise foi cancelada. Analise novamente.');
        if(attempt+1<reaches.length&&result.boundaryDiagnostics?.searchBoundaryEdges>0){
          status('Faixa insuficiente; ampliando a busca para '+(2*reaches[attempt+1])+' m…');continue;
        }
        outputs.push({...result,index:q.rows[i].index,searchReach:reach});break;
       }
       const nativeGrid=String(j.sampler.sourceCRS)===String(q.crs)?j.sampler.grid:null;
       const plan=await workerCall(j,'plan',[q.lines[i],{mode:q.o.mode,interval:q.o.interval,lateralStep:resolution/2,resolution,reach,nativeGrid,sampleBudget:q.o.mode!=='axisDepth'?1000000:250000}]);
       const points=layoutSamples(plan);sampled+=points.length;
       if(sampled>(q.o.mode!=='axisDepth'?4000000:500000))throw Error('Limite de leitura do conjunto atingido. Processe menos eixos por vez ou aumente o espaçamento das seções.');
       const values=plan.pointCoordinates?new Float64Array(points.length):[];
       for(let start=0;start<points.length;start+=4096){
        if(!check())throw Error('Os dados mudaram ou a análise foi cancelada. Analise novamente.');
        status('Lendo MDT original · eixo '+(i+1)+'/'+q.lines.length+' · faixa '+(2*reach)+' m · '+Math.round(100*start/points.length)+'%');
        const batch=await sampleLayoutBatch(j.sampler,plan,points,start,start+4096);
        if(plan.pointCoordinates)values.set(batch,start);else values.push(...batch);
        $('Progress').value=90*(i+Math.min(1,(start+4096)/points.length))/q.lines.length;
        await new Promise(r=>setTimeout(r,0));
       }
       if(!check())throw Error('Os dados mudaram ou a análise foi cancelada. Analise novamente.');
       const heights=layoutHeights(plan,values);
       status((q.o.mode==='axisHeight'||q.o.mode==='axisDepth'?'Preenchendo células conectadas ao eixo em 2D':q.o.mode==='depth'?'Preenchendo a partir do fundo local':'Encontrando fundo e margens')+' na faixa do eixo-guia '+q.rows[i].index+'…');
       try{
        const result=await workerCall(j,'analyze',[plan,heights,{mode:q.o.mode,height:q.o.height,interval:q.o.interval,simplifyOutput:q.o.simplifyOutput,smooth:q.o.smooth===true,resolution}]);
        outputs.push({...result,index:q.rows[i].index,searchReach:reach});break;
       }catch(e){
        if(attempt+1<reaches.length&&GeoMineChannelSearchPolicy.canExpand(e)){
         status('Faixa insuficiente; ampliando a busca para '+(2*reaches[attempt+1])+' m…');continue;
        }
        if(q.o.mode!=='axisDepth'&&(/^CHANNEL_(NO_DATA|BARRIER|AMBIGUOUS_FLOOR|REACH_BANK|REACH_BREAK|REACH_FLOOR|INVALID_GEOMETRY)$/.test(e.code||'')||q.o.mode==='axisHeight'&&e.code==='CHANNEL_RESOLUTION')){
          j.firstFailure=j.firstFailure||{code:e.code,diagnostic:e.diagnostic,axisIndex:q.rows[i].index,searchReach:reach};
          const result=await workerCall(j,'analyze',[plan,heights,{...q.o,resolution,allowPartial:true}]);
          if(attempt+1<reaches.length&&(result.boundaryDiagnostics?.searchBoundaryEdges>0||result.omitted?.some(d=>d.code==='CHANNEL_REACH_BANK'))){
            status('Faixa insuficiente; ampliando a busca para '+(2*reaches[attempt+1])+' m…');continue;
          }
          outputs.push({...result,index:q.rows[i].index,searchReach:reach});break;
        }
        throw Object.assign(Error('Eixo '+q.rows[i].index+': '+e.message),{code:e.code,diagnostic:e.diagnostic,axisIndex:q.rows[i].index,searchReach:reach});
       }
      }
    }
    if(!check()||!current(q,true))throw Error('Os dados mudaram durante a análise. Analise novamente.');
    const useful=outputs.filter(out=>out.sections.length>=2&&out.ring);
    if(!useful.length)throw Object.assign(Error('Nenhum trecho com duas seções válidas para formar um polígono. Ajuste a guia, a profundidade ou o alcance e tente novamente.'),j.firstFailure||{});
    // Keep diagnostics from wholly rejected axes in the review as well.
    const skipped=outputs.filter(out=>!useful.includes(out));
    if(skipped.length){useful[0].omitted=[...(useful[0].omitted||[]),...skipped.flatMap(out=>out.omitted||[])];useful[0].partial=true;useful[0].warnings.push(skipped.length+' eixo(s) sem trecho aproveitável. Os demais foram preservados.');}
    review={q,outputs:useful,resolution,label:j.sampler.label};
    showReview();$('Progress').value=100;
    status(review.outputs.some(out=>out.partial)?'Prévia pronta, com trechos interrompidos e fechados. Use Criar e refine o resultado na edição.':creating?'Prévia pronta. Criando as camadas…':'Prévia pronta. Use Criar para adicionar ao projeto.');
  }catch(e){
    invalidate();
    if(!j?.cancelled&&e.diagnostic&&j.q&&current(j.q,true)){
      review={q:j.q,outputs:[{index:e.axisIndex,sections:[e.diagnostic],searchReach:e.searchReach}],resolution:j.sampler.resolution,blocked:true};
      showReview();
    }
    fail(j?.cancelled?Error(j.reason||'Análise cancelada. Nenhuma calha foi criada.'):e);
  }
  finally{if(j){clearTimeout(j.timer);j.controller.abort();j.worker?.terminate();j.sampler?.close();job=null;busy(false);}}
}
function ll(p,crs){const w=toWGS(crs,p[0],p[1]);return [w[1],w[0]];}
function showReview(){
  clearPreview();const v=review;if(!v)return;
  const previewPane='geomine_channel_preview',pane=map.getPane(previewPane)||map.createPane(previewPane);
  pane.style.zIndex=String(Math.max(690,410+((typeof allNodes==='function'?allNodes().length:0)+1)*2+30));pane.style.pointerEvents='none';
  preview=L2.layerGroup().addTo(map);$('Section').replaceChildren();
  let count=0,min=Infinity,max=-Infinity;
  for(let i=0;i<v.outputs.length;i++){
    const out=v.outputs[i];for(const polygon of out.polygons||(out.ring?[[out.ring]]:[]))L2.polygon(polygon.map(ring=>ring.map(p=>ll(p,v.q.crs))),{pane:previewPane,color:'#2da9b9',weight:2,fillOpacity:.25,fillRule:'evenodd',interactive:false}).addTo(preview);
    out.sections.forEach((s,k)=>{count++;min=Math.min(min,s.width);max=Math.max(max,s.width);$('Section').append(new Option('Eixo '+out.index+' · '+s.station.toFixed(1)+' m · '+(v.blocked?'conferir perfil':'largura '+s.width.toFixed(2)+' m'),i+':'+k));
      if(v.blocked){const ends=[s.profile[0].offset,s.profile.at(-1).offset].map(d=>ll(s.center.map((x,k)=>x+s.normal[k]*d),v.q.crs));L2.polyline(ends,{pane:previewPane,color:'#e78d2d',weight:3,interactive:false}).addTo(preview);}
    });
  }
  const limited=v.outputs.reduce((n,out)=>n+out.sections.filter(s=>s.resolutionLimited||s.width<2*v.resolution-1e-8).length,0);
  const contours=v.outputs.map(out=>out.contour).filter(Boolean);
  const before=contours.reduce((n,c)=>n+c.verticesBefore,0),after=contours.reduce((n,c)=>n+c.verticesAfter,0);
  const omitted=v.outputs.reduce((n,out)=>n+(out.omitted?.length||0),0),partial=v.outputs.some(out=>out.partial);
  $('Summary').textContent=v.blocked?'Perfil da seção que interrompeu a análise.':
    count+' seções · largura '+min.toFixed(2)+'–'+max.toFixed(2)+' m'+
    (partial?' · parcial: '+(omitted?omitted+' seções não aproveitadas; ':'')+'confira os limites e as lacunas do MDT':'')+
    (contours.length?' · contorno '+before+' → '+after+' vértices':'')+
    (v.q.o.smooth===true?(v.outputs.every(out=>out.smoothing?.applied)?' · margens suavizadas':' · suavização não aplicada em '+v.outputs.filter(out=>!out.smoothing?.applied).length+' eixo(s): ver avisos'):'')+
    (limited?' · '+limited+' seções estreitas: precisão limitada pelo pixel do MDT':'');
  $('DepthAlternative').hidden=!(v.blocked&&v.q.o.mode==='auto');
  $('Details').disabled=!!v.blocked;
  $('Results').hidden=false;chart();
  if(v.blocked)requestAnimationFrame(()=>{
    if(review!==v||!$('Modal').classList.contains('on'))return;
    const body=$('Results').closest('.modal-b');if(!body)return;
    body.scrollTop+=$('Summary').getBoundingClientRect().top-body.getBoundingClientRect().top-8;
    // A mensagem pode ser longa: mantenha a curva diagnóstica inteira no
    // espaço rolável, sem empurrar os botões fixos para fora do tablet.
    const curve=$('Chart').getBoundingClientRect(),area=body.getBoundingClientRect();
    if(curve.height<=area.height-16&&curve.bottom>area.bottom-8)body.scrollTop+=curve.bottom-area.bottom+8;
  });
}
function chart(){
  if(!review)return;const [i,k]=$('Section').value.split(':').map(Number),s=review.outputs[i]?.sections[k];if(!s)return;
  $('Longitudinal').hidden=!!review.blocked;
  const pts=s.profile.filter(p=>Number.isFinite(p.z));if(!pts.length){$('Chart').textContent='Esta seção não tem cotas válidas no MDT.';return;}
  const elevations=[...pts.flatMap(p=>[p.z,p.level]),s.zAxis,s.zFloor,s.level].filter(Number.isFinite),W=650,H=290,pad=54,top=82,xmin=s.profile[0].offset,xmax=s.profile.at(-1).offset,zmin=elevations.reduce((m,z)=>Math.min(m,z),Infinity),zmax=elevations.reduce((m,z)=>Math.max(m,z),-Infinity),dz=Math.max(zmax-zmin,.1);
  const x=t=>pad+(t-xmin)/(xmax-xmin)*(W-2*pad),y=z=>H-pad-(z-zmin)/dz*(H-pad-top),hasFloor=Number.isFinite(s.zFloor)&&Number.isFinite(s.floorOffset);
  let path='',inRun=false;for(const p of s.profile){if(!Number.isFinite(p.z)){inRun=false;continue;}path+=(inRun?'L':'M')+x(p.offset).toFixed(2)+','+y(p.z).toFixed(2);inRun=true;}
  const off=p=>(p[0]-s.center[0])*s.normal[0]+(p[1]-s.center[1])*s.normal[1];
  let water='';if(s.left&&s.right&&Number.isFinite(s.level)){
    for(const band of s.wetIntervals||[s]){const a=x(off(band.left)),b=x(off(band.right)),lev=y(s.level);water+=`<path data-role="wet-interval" d="M${a},${lev}H${b}" stroke="#169cbd" stroke-width="3"/><circle cx="${a}" cy="${lev}" r="4" fill="#dc7335"/><circle cx="${b}" cy="${lev}" r="4" fill="#dc7335"/>`;}
  }
  if(s.referenceKind==='axis'&&s.profile.some(p=>Number.isFinite(p.level))){
    let levelPath='',inWet=false;
    for(const p of s.profile){if(!p.wet||!Number.isFinite(p.level)){inWet=false;continue;}levelPath+=(inWet?'L':'M')+x(p.offset).toFixed(2)+','+y(p.level).toFixed(2);inWet=true;}
    water=`<path data-role="wet-grid-level" d="${levelPath}" stroke="#169cbd" stroke-width="3" fill="none"/>`;
  }
  const tops=s.detection?[s.detection.left,s.detection.right].filter(Boolean).map(t=>`<circle cx="${x(t.offset)}" cy="${y(t.elevation)}" r="6" fill="none" stroke="#8c47b5" stroke-width="2"/>`).join(''):'';
  const floor=hasFloor?`<path data-role="located-floor" d="M${x(s.floorOffset)},${top}V${H-pad}" stroke="#267f5d" stroke-dasharray="2 4"/><circle data-role="floor-point" cx="${x(s.floorOffset)}" cy="${y(s.zFloor)}" r="5" fill="#267f5d" stroke="white" stroke-width="1.5"/>`:s.referenceKind==='axis'?`<circle data-role="axis-reference" cx="${x(0)}" cy="${y(s.zAxis)}" r="5" fill="#267f5d" stroke="white" stroke-width="1.5"/>`:'';
  const title=review.blocked?'Perfil do terreno · margens ainda não confirmadas':`Nível: ${s.level.toFixed(2)} m · ${s.referenceKind==='axis'?'largura molhada':'largura'}: ${s.width.toFixed(2)} m${s.detection?.supportSides===1?' · apoio em uma borda':''}`;
  const target=review.blocked&&Number.isFinite(s.level)?`<path data-role="unconfirmed-level" d="M${pad},${y(s.level)}H${W-pad}" stroke="#277fa2" stroke-width="1.5" stroke-dasharray="6 4"/><text x="${pad}" y="73" fill="#277fa2" font-size="12">Nível solicitado: ${s.level.toFixed(2)} m — faixa não fechada</text>`:
    s.width<2*review.resolution-1e-8?`<text x="${pad}" y="73" fill="#a45a14" font-size="12">Faixa gerada · precisão limitada pelo pixel de ${review.resolution.toFixed(2)} m</text>`:'';
  const referenceText=s.referenceKind==='axis'?'Referência: terreno no eixo + '+review.q.o.height.toFixed(2)+' m · sem localizar fundo':hasFloor?'Fundo encontrado: '+s.zFloor.toFixed(2)+' m · deslocamento '+signed(s.floorOffset)+' m':'Fundo ainda não definido nesta seção';
  $('Chart').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Seção do MDT, eixo-guia e nível de preenchimento"><rect x="0" y="0" width="${W}" height="${H}" fill="white"/><path d="M${pad},${top}V${H-pad}H${W-pad}" fill="none" stroke="#526779"/><path data-role="guide-axis" d="M${x(0)},${top}V${H-pad}" stroke="#8896a0" stroke-dasharray="4 3"/><path d="${path}" fill="none" stroke="#233a50" stroke-width="2"/>${water}${tops}${floor}${target}<text x="${pad}" y="20" fill="#233a50" font-size="13">${title}</text><text x="${pad}" y="38" fill="#233a50" font-size="12">Cotas: ${zmin.toFixed(2)} a ${zmax.toFixed(2)} m · guia: ${Number.isFinite(s.zAxis)?s.zAxis.toFixed(2)+' m':'sem cota'}</text><text x="${pad}" y="56" fill="#267f5d" font-size="12">${referenceText}</text><text x="${pad}" y="${H-12}" fill="#233a50" font-size="12">${xmin.toFixed(1)} m</text><text x="${x(0)}" y="${H-30}" text-anchor="middle" fill="#233a50" font-size="12">0 · eixo-guia</text><text x="${W-pad}" y="${H-12}" text-anchor="end" fill="#233a50" font-size="12">${xmax.toFixed(1)} m · distância à guia</text></svg>`;
  longitudinal(review.outputs[i],s);
}
function longitudinal(out,selectedSection){
  const box=$('Longitudinal'),sections=out.segments?.find(segment=>segment.sections.some(s=>s.station===selectedSection.station))?.sections||out.sections;
  box.hidden=!!review.blocked;
  if(box.hidden){box.replaceChildren();return;}
  const axis=['axisDepth','axisHeight'].includes(review.q.o.mode),referenceKey=axis?'zAxis':'zFloor';
  const W=650,H=250,pad=66,top=62,bottom=H-56,start=sections[0],end=sections.at(-1),z=sections.flatMap(s=>[s[referenceKey],s.level]),zmin=Math.min(...z),zmax=Math.max(...z),dz=Math.max(.1,zmax-zmin);
  const x=s=>pad+(s-start.station)/Math.max(.001,end.station-start.station)*(W-2*pad),y=z=>bottom-(z-zmin)/dz*(bottom-top);
  const coords=(rows,key)=>rows.map(s=>x(s.station).toFixed(2)+','+y(s[key]).toFixed(2));
  const floor=coords(sections,referenceKey),level=coords(sections,'level');
  const selected=selectedSection,depth=review.q.o.mode==='depth';
  box.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Perfil longitudinal da referência e do nível local"><rect width="${W}" height="${H}" fill="white"/><text x="${pad}" y="20" fill="#233a50" font-size="14">Perfil longitudinal · eixo ${out.index}</text><text x="${pad}" y="39" fill="#233a50" font-size="12">Verde: ${axis?'terreno no eixo':'fundo do MDT'} · azul: nível local${axis?' = eixo + '+review.q.o.height.toFixed(2)+' m':depth?' = fundo + '+review.q.o.height.toFixed(2)+' m':''}</text><path d="M${pad},${top}V${bottom}H${W-pad}" fill="none" stroke="#526779"/><polygon points="${[...level,...floor.slice().reverse()].join(' ')}" fill="#169cbd" fill-opacity=".18"/><polyline data-role="longitudinal-floor" points="${floor.join(' ')}" fill="none" stroke="#267f5d" stroke-width="2"/><polyline data-role="longitudinal-level" points="${level.join(' ')}" fill="none" stroke="#169cbd" stroke-width="2"/><path d="M${x(selected.station)},${top}V${bottom}" stroke="#e78d2d" stroke-dasharray="4 3"/><circle cx="${x(selected.station)}" cy="${y(selected.level)}" r="4" fill="#e78d2d"/><text x="${pad-6}" y="${top+4}" text-anchor="end" fill="#233a50" font-size="11">${zmax.toFixed(2)} m</text><text x="${pad-6}" y="${bottom}" text-anchor="end" fill="#233a50" font-size="11">${zmin.toFixed(2)} m</text><text x="${pad}" y="${H-36}" fill="#233a50" font-size="11">${start.station.toFixed(1)} m</text><text x="${W-pad}" y="${H-36}" text-anchor="end" fill="#233a50" font-size="11">${end.station.toFixed(1)} m</text><text x="${pad}" y="${H-14}" fill="#526779" font-size="11">Distância na guia · escalas horizontal e vertical distintas para conferência</text></svg>`;
}
function fields(features){return Object.keys(features[0].props).map(name=>{const numeric=typeof features[0].props[name]==='number'||/^(TOPO_ESQ|TOPO_DIR|Z_EIXO|Z_FUNDO|Z_REF|DESLOC_M)$/.test(name);return {name,type:numeric?'N':'C',size:numeric?18:254,dec:3};});}
function buildSpecs(v){
  const {q}=v,date=new Date().toISOString(),common=out=>{
    const reach=out.searchReach??q.o.reach;
    const depth=q.o.mode==='depth',axis=['axisDepth','axisHeight'].includes(q.o.mode);
    if(axis)return {ORIGEM:q.L.name,MDT:q.r.name,MODO:'Altura acompanhando o eixo',REF_NIVEL:'Terreno no eixo',ALT_EIXO:q.o.height,PASSO_M:q.o.interval,N_REF:out.refCount,PASSO_REF:out.refStep,BUSCA_M:2*reach,RAIO_M:reach,BUSCA_AUTO:q.o.searchLimited===false?1:0,PIXEL_M:v.resolution,METODO:out.method||'Hidro: eixo densificado; preenchimento conectado 2D; união das áreas',...(out.contour?{TOL_SIMPL:out.contour.effectiveTolerance,VERT_ORIG:out.contour.verticesBefore,VERT_FINAL:out.contour.verticesAfter}:{}),STATUS:'Faixa por altura estimada — não delimita leito regular nem certifica cheia',DATA_UTC:date};
    return {ORIGEM:q.L.name,MDT:q.r.name,MODO:q.o.mode==='auto'?'Quebra de declive':depth?'Profundidade informada':'Altura informada',...(depth?{PROF_M:q.o.height}:{}),PASSO_M:q.o.interval,BUSCA_M:2*reach,RAIO_M:reach,BUSCA_AUTO:q.o.searchLimited===false?1:0,PIXEL_M:v.resolution,METODO:q.o.mode==='auto'?'Fundo na faixa da guia; ver apoio em cada seção':depth?'Preenchimento conectado por seção: fundo local + profundidade':'Primeiro cruzamento do perfil: fundo encontrado + altura',STATUS:depth?'Faixa por profundidade estimada — não delimita leito regular nem certifica cheia':'Calha estimada — requer validação do leito regular',DATA_UTC:date};
  };
  const polygons=v.outputs.flatMap(out=>(out.polygons||[[out.ring]]).map((rings,index)=>({geom:rings,multi:true,props:{...common(out),SUAVIZ:out.smoothing?.applied?1:0,PARCIAL:out.partial?1:0,N_FALHAS:out.omitted?.length||0,EIXO:out.index,...(out.polygons?{COMPONENTE:index+1}:{}),LARG_MIN:Math.min(...out.sections.map(s=>s.width)),LARG_MAX:Math.max(...out.sections.map(s=>s.width)),N_SECOES:out.sections.length,N_ESTREITA:out.sections.filter(s=>s.width<2*v.resolution-1e-8).length,N_UMA_MRG:out.sections.filter(s=>s.detection?.supportSides===1).length}})));
  const sections=v.outputs.flatMap(out=>out.sections.flatMap(s=>(s.wetIntervals||[s]).map((band,index)=>({geom:[band.left,band.right],props:{...common(out),EIXO:out.index,PROG_M:s.station,LARG_M:band.width,RES_LIMIT:band.width<2*v.resolution-1e-8?1:0,Z_EIXO:s.zAxis,Z_FUNDO:s.zFloor,DESLOC_M:s.floorOffset,NIVEL_M:s.level,ALTURA_M:s.effectiveHeight,...(['axisDepth','axisHeight'].includes(q.o.mode)?{Z_REF:s.zAxis,TRECHO:index+1,LARG_TOTAL:s.width,ENVOLV_M:s.spanWidth}:{}),...(s.detection?{TOPO_ESQ:s.detection.left?.elevation??null,TOPO_DIR:s.detection.right?.elevation??null,APOIO:s.detection.supportSides??2,METODO:s.detection.method}:{} )}}))));
  const names=defaultNames(q.o.mode,q.L.name);
  return [{name:names[0],gtype:'line',crs:q.crs,features:sections,color:'#ed9234'},
    {name:names[1],gtype:'polygon',crs:q.crs,features:polygons,color:'#2da9b9'}];
}
function addTransactional(specs){
  const before=S.layers.slice(),stack=S.stack?.slice(),active=S.activeId,created=[];
  try{for(const spec of specs){const L=addLayer({...spec,fields:fields(spec.features)});created.push(L);if(L.gtype==='polygon'){L.fill=.25;L.sym.fill=.25;}drawLayer(L);}refreshUI();zApply();}
  catch(e){for(const L of S.layers.filter(x=>!before.includes(x)))try{if(L.llayer)map.removeLayer(L.llayer);}catch(_){}S.layers=before;if(stack)S.stack=stack;S.activeId=active;try{refreshUI();zApply();}catch(_){}throw e;}
  created.forEach(L=>undoPush({t:'layeradd',L}));return created;
}
async function commit(){
  if(job||creating||locating)return;
  creating=true;busy(false);
  const release=window.GeoMineChannelLive.suspend();
  try{
    /* Nome sugerido intacto = a camada em uso, mesmo que tenha sido renomeada
       na árvore com o diálogo aberto; só um nome digitado cria outra camada. */
    const destination=window.GeoMineChannelDestination,k=kind(),typed=$('NewName').value;
    const inUse=typed===suggested&&nameKind===k?pairInUse(k):null;
    const choice=$('Destination').value;
    const target=choice!=='new'?destination.capture(choice,k):inUse?destination.capture(inUse.id,k):destination.capture('new',k,typed);
    if(target.pair&&lastCreated&&lastCreated.automatic===$('Live').checked&&target.pair?.id===lastCreated.pairId&&
      lastCreated.layers.every((L,i)=>S.layers.includes(L)&&destination.stamp(L)===lastCreated.after[i])&&current(lastCreated.q,true)){
      status('Este resultado já está atualizado na camada do projeto.');return;
    }
    if(!review||review.blocked||!current(review.q,true))await generate();
    const v=review;if(!v||v.blocked)return;
    if(!current(v.q,true)){invalidate();throw Error('Os dados ou parâmetros mudaram. Analise novamente antes de gerar a calha.');}
    const result=destination.save(v,target,$('Live').checked);
    if(!result){status('Geração cancelada. As alterações manuais foram preservadas.');return;}
    lastCreated={...result,automatic:$('Live').checked,q:{...v.q,featuresJSON:JSON.stringify(v.q.rows.map(row=>row.f))}};
    $('NewName').value='';suggested='';nameKind=null;destinationOptions(result.pairId);modeUI();
    const depth=filling(v.q.o.mode),axis=['axisDepth','axisHeight'].includes(v.q.o.mode),verb=!result.updated?'criada':result.replaced?'atualizada':'adicionada',name=result.layers[1].name;
    const partial=v.outputs.some(out=>out.partial);
    invalidate();$('APP').hidden=depth;
    status((axis?'Faixa por altura ':depth?'Faixa por profundidade ':'Calha ')+verb+' em “'+name+'”'+(result.restored?' · camada ausente do par recriada':'')+(partial?' · resultado parcial; trechos fechados para edição manual':'')+'.');
    toast(result.updated?(depth?'Massa d’água':'Calha')+' gravada na camada existente “'+name+'”.':(depth?'Massa d’água':'Calha')+' e seções criadas em “'+name+'”.');
  }catch(e){fail(e);}
  finally{release();creating=false;busy(false);}
}
/* O destino é o NOME da camada: sem mudar o nome, o resultado grava na camada
   em uso daquele tipo (outro rio é acrescentado; o mesmo eixo é substituído);
   com um nome novo, cria outra camada. */
function pairInUse(k){
  const same=GeoMineChannelDestination.pairs().filter(p=>p.kind===k);
  return same.find(p=>p.id===choices[k])||same.find(p=>p.complete||p.restorable)||same[0]||null;
}
function nameInUse(k){
  const pair=pairInUse(k);
  return pair?pair.name:GeoMineChannelDestination.uniqueName(defaultNames($('Mode').value,axisName())[1]);
}
function destinationOptions(preferred){
  const k=kind(),select=$('Destination');if(preferred)choices[k]=preferred;
  const previous=select.dataset.kind===k?select.value:null;
  const active=activeLayer(),pairs=GeoMineChannelDestination.pairs();
  select.replaceChildren(new Option('Nova camada / pelo nome','new'),new Option('Camada ativa'+(active?' — '+active.name:''),'active'));
  for(const L of S.layers.filter(L=>L.gtype==='polygon')){
    const option=new Option(L.name,'layer:'+L.id);option.disabled=!!L.locked;select.append(option);
  }
  const selected=preferred?pairs.find(p=>p.id===preferred)?.ordered[1]:null;
  const value=selected?'layer:'+selected.id:previous||(active?.gtype==='polygon'?'active':'new');
  select.dataset.kind=k;select.value=[...select.options].some(o=>o.value===value)?value:'new';
  const list=$('NameList');if(list)list.replaceChildren(...GeoMineChannelDestination.pairs().filter(p=>p.kind===k).map(p=>new Option(p.name)));
  destinationUI();
}
function axisName(){return S.layers.find(L=>String(L.id)===$('Layer').value)?.name||'eixo';}
const normalName=v=>String(v??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
function destinationHint(){
  const D=GeoMineChannelDestination,k=kind(),label=kindLabel(k),name=String($('NewName').value||'').trim();
  if($('Destination').value!=='new')return 'Acrescenta o resultado à camada escolhida, preservando as feições existentes. Recalcular o mesmo eixo atualiza somente sua calha. As seções ficam em uma camada auxiliar.';
  if(!name)return 'Informe o nome da camada a gerar.';
  const pair=D.pairs().find(p=>p.kind===k&&normalName(p.name)===normalName(name));
  if(pair)return 'Mesmo nome da camada em uso: grava em “'+pair.name+'”'+(pair.restorable?' e recria a camada de seções ausente':'')+'. Outro rio é acrescentado; o mesmo eixo é substituído.';
  if(D.pairs().some(p=>p.kind!==k&&normalName(p.name)===normalName(name)))return '“'+name+'” é uma camada de '+kindLabel(k==='calha'?'agua':'calha')+'. Use outro nome para '+label+'.';
  if((S.layers||[]).some(L=>normalName(L.name)===normalName(name)))return 'Já existe outra camada com esse nome. Use outro nome.';
  return 'Nome novo: cria a camada de '+label+' “'+name+'” e a de seções “Seções — '+name+'”.';
}
function destinationUI(){
  const k=kind(),input=$('NewName');
  $('NewNameBox').hidden=$('Destination').value!=='new';
  /* o nome sugerido acompanha o tipo e a camada em uso; o que a pessoa digitar é preservado */
  if(!input.value.trim()||input.value===suggested||nameKind!==k){suggested=nameInUse(k);input.value=suggested;nameKind=k;}
  try{$('DestinationHint').textContent=destinationHint();}catch(_){$('DestinationHint').textContent='';}
  const mode=$('Mode').value,existing=$('Destination').value!=='new'||GeoMineChannelDestination.pairs().some(p=>p.kind===k&&normalName(p.name)===normalName(input.value)),prefix=existing?'Atualizar':'Criar';
  $('Commit').textContent=prefix+((mode==='axisDepth'||mode==='axisHeight')?' faixa por altura':mode==='depth'?' faixa por profundidade':' calha no projeto');
}
function destinationUIButton(){
  const k=kind(),mode=$('Mode').value,existing=$('Destination').value!=='new'||GeoMineChannelDestination.pairs().some(p=>p.kind===k&&normalName(p.name)===normalName($('NewName').value));
  $('Commit').textContent=(existing?'Atualizar':'Criar')+((mode==='axisDepth'||mode==='axisHeight')?' faixa por altura':mode==='depth'?' faixa por profundidade':' calha no projeto');
}
/* troca de tipo: refaz a lista de métodos e o nome sugerido */
function kindUI(){
  const k=kind(),old=$('Mode').value,opts=$('Automatic')?.checked?[['auto','Automático']]:MODES[k];
  $('Mode').replaceChildren(...opts.map(([v,t])=>new Option(t,v)));
  $('Mode').value=opts.some(([v])=>v===old)?old:opts[0][0];
  modeUI();
}
function refresh(){
  if(job)return;invalidate();$('APP').hidden=true;
  const oldL=$('Layer').value,oldR=$('Raster').value;
  $('Layer').replaceChildren();S.layers.filter(L=>L.gtype==='line'&&!L._channelLink).forEach(L=>$('Layer').append(new Option(L.name,L.id)));
  const active=activeLayer();if(S.layers.some(L=>L.gtype==='line'&&String(L.id)===oldL))$('Layer').value=oldL;else if(active?.gtype==='line')$('Layer').value=String(active.id);
  $('Raster').replaceChildren(new Option('Escolha o MDT do terreno',''));S.rasters.filter(r=>r.d&&(!GeoMineChannelDEM.isElevation||GeoMineChannelDEM.isElevation(r))).forEach(r=>$('Raster').append(new Option(r.name,r.id)));
  const rid=oldR||S.topoRasterId||(S.selRaster?.id??S.selRaster);if(rid&&[...$('Raster').options].some(o=>o.value===String(rid)))$('Raster').value=String(rid);
  if(!$('Raster').value){
    const candidates=S.rasters.filter(r=>r.d&&GeoMineChannelDEM.isElevation(r));
    const ground=candidates.filter(r=>r.d._lidarGroundMDT||/\bMDT\b|terreno|ground/i.test(r.name||''));
    const one=ground.length===1?ground[0]:candidates.length===1?candidates[0]:null;if(one)$('Raster').value=String(one.id);
  }
  updateScope();kindUI();destinationOptions();
}
function updateScope(){const L=S.layers.find(L=>String(L.id)===$('Layer').value);$('Scope').querySelector('[value="feature"]').disabled=!L||!selected(L);if($('Scope').value==='feature'&&(!L||!selected(L)))$('Scope').value='visible';}
function searchMode(){
  $('Reach').disabled=!!job||creating||!$('Limit').checked;
}
function modeUI(){
  const mode=$('Mode').value,axis=mode==='axisDepth'||mode==='axisHeight';
  if($('Smooth'))$('Smooth').closest('label').hidden=mode==='axisHeight';
  $('HeightBox').hidden=false;$('Height').disabled=mode==='auto';$('LessDepth').disabled=mode==='auto';$('MoreDepth').disabled=mode==='auto';
  $('HeightLabel').textContent='Altura acima do eixo (m)';
  $('Height').placeholder='Ex.: 0,80';
  $('MethodHint').textContent=mode==='depth'?'O MDT fornece o fundo de cada seção. A profundidade informada define o nível local: fundo + profundidade. A faixa termina onde o terreno alcança esse nível. Este modo usa perfis, sem a grade 2D do modo Altura.':axis?'Nível local = cota do MDT no eixo + altura; preenchimento conectado na resolução nativa.':'Procura quebras de declive no MDT para estimar as margens.';
  $('IntervalLabel').textContent=mode==='axisHeight'?'Espaçamento dos perfis (m)':'Espaçamento entre seções (m)';
  // Ao trocar entre calha e massa d'água, o destino passa a ser o do novo tipo.
  if($('Destination').dataset.kind!==kind())destinationOptions();else destinationUI();
}
function details(){
  try{
    const v=review;if(!v||v.blocked||!current(v.q,true))throw Error('Analise e confira os dados atuais antes de gerar imagens.');
    if(!window.GeoMineChannelDetails)throw Error('Módulo de detalhes indisponível. Atualize o aplicativo.');
    GeoMineChannelDetails.open({snapshot:{layerName:v.q.L.name,rasterName:v.q.r.name,crs:v.q.crs,mode:v.q.o.mode,height:v.q.o.height,resolution:v.resolution,outputs:v.outputs,createdAt:new Date().toISOString()},
      isCurrent:()=>review===v&&!job&&current(v.q,true)});
  }catch(e){fail(e);}
}
function ensure(){
  if($('Modal'))return;
  const bg=document.createElement('div');bg.id='chanModal';bg.className='modal-bg';
  bg.innerHTML=`<style>#chanModal [hidden]{display:none!important}#chanModal label.field{display:block;margin-top:10px}#chanModal input,#chanModal select{width:100%}#chanChart svg,#chanLongitudinal svg{width:100%;display:block}#chanLongitudinal{margin-top:12px}#chanStatus{max-height:76px;overflow:auto;overflow-wrap:anywhere;margin-bottom:6px}#chanStatus:empty{display:none}#chanFooter{padding:10px 12px;border-top:1px solid var(--border);flex:none}</style>
  <div class="modal" style="width:min(740px,96vw);max-height:90dvh;display:flex;flex-direction:column">
  <div class="modal-h"><b>Extrair calha pelo MDT</b><div style="flex:1"></div><button class="tbtn" id="chanClose">Fechar</button></div>
  <div class="modal-b" style="overflow:auto;min-height:0">
  <button class="tbtn" id="chanDraw">Desenhar linha-guia no mapa</button>
  <label class="field" for="chanLayer">Camada de eixos-guia</label><select id="chanLayer"></select>
  <label class="field" for="chanScope">Aplicar em</label><select id="chanScope"><option value="feature">Somente a linha selecionada</option><option value="visible">Camada — respeitar filtros e categorias</option><option value="all">Camada inteira — todas as linhas</option></select>
  <label class="field" for="chanRaster">MDT do terreno</label><select id="chanRaster"></select>
  <div hidden><label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="radio" name="chanKind" id="chanKindCalha" value="calha" style="width:auto"><span>Calha de rio</span></label><label style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="radio" name="chanKind" id="chanKindAgua" value="agua" style="width:auto" checked><span>Massa de água</span></label></div>
  <select id="chanMode" hidden><option value="axisHeight">Altura</option></select><label style="display:flex;gap:8px;margin-top:10px"><input id="chanAutomatic" type="checkbox" style="width:auto">Automático</label>
  <div class="hint" id="chanMethodHint" hidden></div>
  <div id="chanHeightBox" hidden><label class="field" id="chanHeightLabel" for="chanHeight">Altura (m)</label><input id="chanHeight" type="text" inputmode="decimal" placeholder="Ex.: 0,80"><div style="display:flex;gap:8px;margin-top:6px"><button class="tbtn" id="chanLessDepth" type="button">− 0,10 m</button><button class="tbtn" id="chanMoreDepth" type="button">+ 0,10 m</button></div></div>
  <details style="margin-top:10px"><summary>Ajustes</summary><label class="field" id="chanIntervalLabel" for="chanInterval">Espaçamento das seções e simplificação do contorno (m)</label><input id="chanInterval" type="text" inputmode="decimal" value="5">
  <label style="display:flex;gap:10px;margin-top:12px"><input type="checkbox" id="chanSmooth" style="width:auto" checked><span>Suavizar margens</span></label>
  <label style="display:flex;gap:10px;margin-top:12px"><input type="checkbox" id="chanLimit" style="width:auto" checked><span>Limitar a faixa de busca</span></label>
  <label class="field" for="chanReach">Largura total da busca (m)</label><input id="chanReach" type="text" inputmode="decimal" value="60">
  <label style="display:flex;gap:10px;margin-top:12px"><input type="checkbox" id="chanLive" style="width:auto" checked><span>Atualizar ao editar o eixo-guia</span></label>
  <button class="tbtn" id="chanRetry" style="margin-top:6px">Recalcular calhas vinculadas</button></details>
  <label class="field" for="chanDestination">Camada de destino</label><select id="chanDestination"><option value="new">Nova camada / pelo nome</option></select>
  <div id="chanNewNameBox"><label class="field" for="chanNewName">Nome da camada a gerar</label><input id="chanNewName" type="text" maxlength="120" autocomplete="off" list="chanNameList"><datalist id="chanNameList"></datalist></div>
  <div id="chanDestinationHint" class="hint" hidden></div>
  <div id="chanResults" hidden><div id="chanSummary" class="hint"></div><button class="tbtn" id="chanDepthAlternative" hidden>Preencher por profundidade acima do fundo</button><button class="tbtn" id="chanDetails" disabled>Gerar imagens dos trechos</button><label class="field" for="chanSection">Seção transversal</label><select id="chanSection"></select><div id="chanChart"></div><div id="chanLongitudinal" hidden></div></div>
  <button class="tbtn" id="chanAPP" hidden>Abrir APP por calha</button>
  </div><div id="chanFooter"><div id="chanStatus" class="hint" role="status" aria-live="polite"></div>
  <button class="tbtn" id="chanLocateNative" hidden style="margin-bottom:8px">Localizar MDT original</button>
  <progress id="chanProgress" max="100" value="0" style="width:100%" hidden></progress>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="tbtn" id="chanAnalyze" style="flex:1">Analisar e visualizar</button><button class="tbtn" id="chanCommit" style="flex:1;background:var(--amber);color:#18130a">Criar calha no projeto</button><button class="tbtn" id="chanCancel" hidden>Cancelar</button></div></div></div>`;
  document.body.append(bg);
  $('Close').onclick=()=>{if(!job&&!creating){clearPreview();$('Modal').classList.remove('on');}};
  $('Draw').onclick=beginDraw;$('Analyze').onclick=generate;$('Commit').onclick=commit;$('Cancel').onclick=cancel;
  $('Details').onclick=details;
  $('LocateNative').onclick=locateNative;
  $('Destination').onchange=()=>destinationUI();
  $('Automatic').onchange=()=>{invalidate();kindUI();};
  $('Height').addEventListener('change',()=>{if($('Height').value.trim()&&number($('Height').value)===0){$('Automatic').checked=true;invalidate();kindUI();}});
  for(const id of ['KindCalha','KindAgua'])$(id).addEventListener('change',()=>{invalidate();kindUI();});
  $('NewName').addEventListener('input',()=>{try{$('DestinationHint').textContent=destinationHint();}catch(_){}destinationUIButton();});
  $('Retry').onclick=()=>{try{const result=window.GeoMineChannelLive?.retry();if(result?.catch)result.catch(fail);}catch(e){fail(e);}};
  for(const id of ['Layer','Scope','Raster','Mode','Height','Interval','Reach','Limit','Smooth'])$(id).addEventListener(['Height','Interval','Reach'].includes(id)?'input':'change',()=>{invalidate();if(id==='Layer'){updateScope();destinationUI();}if(id==='Mode')modeUI();if(id==='Limit')searchMode();});
  $('DepthAlternative').onclick=()=>{invalidate();$('Automatic').checked=false;kindUI();status('Informe a altura acima do eixo e clique em Analisar.');$('Height').focus();$('HeightBox').scrollIntoView({block:'center'});};
  for(const [id,delta] of [['LessDepth',-.1],['MoreDepth',.1]])$(id).onclick=()=>{
    const value=number($('Height').value);if(!Number.isFinite(value)||value<=0){$('Height').focus();status('Informe primeiro a profundidade em metros.');return;}
    $('Height').value=Math.min(100,Math.max(.01,Math.round((value+delta)*100)/100)).toFixed(2).replace('.',',');
    $('Height').dispatchEvent(new Event('input'));status('Profundidade alterada. Clique em Analisar para conferir a nova faixa.');
  };
  $('Section').onchange=chart;$('APP').onclick=()=>{$('Close').click();GeoMineRiparianAPP.open();};
  searchMode();modeUI();
}
function open(){
  if(job)return;ensure();if(drawing&&S.tool===TOOL){finishAxis();return;}
  refresh();const L=activeLayer();if(L?.gtype==='polygon'){$('Destination').value='active';destinationUI();}if(L?.gtype==='line'&&!L._channelLink){$('Layer').value=String(L.id);$('Scope').value=selected(L)?'feature':'visible';updateScope();destinationUI();}
  status('');$('Modal').classList.add('on');
}
function renderAxis(cursor){
  if(!drawing)return;drawing.group.clearLayers();const pts=drawing.points.map(p=>[p.lat,p.lng]);if(cursor)pts.push([cursor.lat,cursor.lng]);
  if(pts.length>1)L2.polyline(pts,{color:'#2da9b9',weight:3,interactive:false,pane:'alagis_desenho'}).addTo(drawing.group);
}
function beginDraw(){
  try{
    if(job)return;if(S.drawBuf?.length||typeof ED!=='undefined'&&(ED.pend||ED.drag))throw Error('Conclua ou cancele o desenho/edição em andamento antes de traçar o eixo.');
    const p=proj4(S.workCRS).oProj;if(p.projName!=='utm'||Math.abs((p.to_meter||1)-1)>1e-10)throw Error('Defina o CRS UTM em metros da região antes de desenhar o eixo.');
    // O editor grava cada alteração na própria feição: desligá-lo pelo fluxo
    // normal remove os controles de vértices sem desfazer o trabalho já feito.
    if(typeof ED!=='undefined'&&ED.on&&typeof edLigar==='function')edLigar(false);
    invalidate();$('Modal').classList.remove('on');setTool(TOOL);
    drawing={project:S.projectId,crs:S.workCRS,points:[],group:L2.layerGroup().addTo(map)};map.doubleClickZoom.disable();
    // Como no desenho nativo, tocar novamente em Linha conclui o traçado.
    // O botão existente deixa a conclusão acessível no tablet, sem um popup.
    drawing.buttons=[...document.querySelectorAll('.mtool[data-tool="line"]')].map(button=>({button,title:button.getAttribute('title'),on:button.classList.contains('on')}));
    drawing.buttons.forEach(({button})=>{button.classList.add('on');button.title='Concluir eixo-guia — Enter ou toque duplo';});
    if(typeof cmdLog==='function')cmdLog('▸ Eixo-guia da calha: trace uma linha ao longo do rio, sem precisar seguir o fundo exato. Enter, toque duplo ou o botão Linha conclui; Esc cancela.','cmd');
    renderAxis();
  }catch(e){fail(e);}
}
function mapClick(e){
  if(S.tool!==TOOL||!drawing||e?.originalEvent?.detail>1)return;const p=e?.latlng;if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng))return;
  const last=drawing.points.at(-1);if(last&&Math.abs(last.lat-p.lat)+Math.abs(last.lng-p.lng)<1e-10)return;
  drawing.points.push({lat:p.lat,lng:p.lng});renderAxis();
}
function endDrawing(){
  if(!drawing)return;
  try{map.removeLayer(drawing.group);}catch(_){}
  drawing.buttons?.forEach(({button,title,on})=>{button.classList.toggle('on',on);if(title===null)button.removeAttribute('title');else button.setAttribute('title',title);});
  drawing=null;
}
// Camada de eixos-guia já usada pela ferramenta: novos rios entram nela.
function guideLayer(){
  const usable=L=>L.gtype==='line'&&!L._channelLink&&!L.locked&&(typeof collabCanEditLayer!=='function'||collabCanEditLayer(L,false))&&
    (L.name===GUIDE||(L.features||[]).length>0&&L.features.every(f=>f.props?.TIPO===GUIDE_TYPE));
  const chosen=S.layers.find(L=>String(L.id)===$('Layer')?.value);
  return chosen&&usable(chosen)?chosen:S.layers.filter(usable).at(-1)||null;
}
function finishAxis(){
  try{
    if(!drawing||drawing.points.length<2)throw Error('Marque pelo menos dois pontos para o eixo.');
    if(S.projectId!==drawing.project||S.workCRS!==drawing.crs){endDrawing();setTool('select');throw Error('O projeto ou CRS mudou. Desenhe o eixo novamente.');}
    const existing=guideLayer(),crs=existing?.crs||drawing.crs,convert=proj4('EPSG:4326',crs),geom=drawing.points.map(p=>{const xy=convert.forward([p.lng,p.lat]);if(!xy.every(Number.isFinite))throw Error('Coordenada inválida no eixo.');return xy;});
    let L=existing;
    if(L){
      const props={};(L.fields||[]).forEach(f=>props[f.name]=f.type==='N'||f.type==='F'?0:'');props.TIPO=GUIDE_TYPE;
      if(!(L.fields||[]).some(f=>f.name==='TIPO'))L.fields=[...(L.fields||[]),{name:'TIPO',type:'C',size:254,dec:3}];
      const feat={geom,multi:false,props};L.features.push(feat);undoPush({t:'feat',L,feat});drawLayer(L);refreshUI();
    }else [L]=addTransactional([{name:GeoMineChannelDestination.uniqueName(GUIDE),gtype:'line',crs,features:[{geom,props:{TIPO:GUIDE_TYPE}}],color:'#2da9b9'}]);
    S.activeId=L.id;S.selFeat={layer:L,layerId:L.id,idx:L.features.length-1};
    endDrawing();setTool('select');open();$('Layer').value=String(L.id);$('Scope').value='feature';updateScope();destinationUI();
    try{if(typeof highlightSel==='function')highlightSel();}catch(_){}
    status(existing?'Eixo acrescentado à camada “'+L.name+'”. Escolha o MDT e analise as margens sugeridas.':'Eixo criado na camada “'+L.name+'”. Escolha o MDT e analise as margens sugeridas.');
  }catch(e){toast(e.message);if($('Status'))status(e.message);}
}
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&job){e.preventDefault();e.stopImmediatePropagation();cancel();return;}
  if(drawing&&S.tool===TOOL&&['Escape','Enter'].includes(e.key)){if(/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName))return;e.preventDefault();e.stopImmediatePropagation();if(e.key==='Enter')finishAxis();else{endDrawing();setTool('select');open();}}
},true);
document.addEventListener('click',e=>{
  if(!drawing||S.tool!==TOOL||!e.target.closest?.('.mtool[data-tool="line"]'))return;
  e.preventDefault();e.stopImmediatePropagation();finishAxis();
},true);
function install(){
  const cat=CATS.find(c=>c.id==='ambiente');if(!cat)return;
  // Register once across the category, not once per matching group.
  if(cat.grupos.some(g=>g.it?.some(i=>i.ic==='channel_mdt')))return;
  let group=cat.grupos.find(g=>g.label==='Preservação permanente');
  if(!group){group={label:'Preservação permanente',it:[]};cat.grupos.unshift(group);}
  group.it.unshift({ic:'channel_mdt',nome:'Extrair Calha MDT',desc:'Encontrar fundo e margens na faixa de uma linha-guia',act:open});
}
if(typeof RIB_SVG!=='undefined')RIB_SVG.channel_mdt='<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M5 8l9 19 10 8 10-8L43 8" fill="#b9d2a1" stroke="#4f7957" stroke-width="2"/><path d="M10 19h28l-4 8-10 8-10-8z" fill="#75c7df"/><path d="M24 6v34M6 19h36" stroke="#165779" stroke-width="2" stroke-dasharray="3 3"/><circle cx="10" cy="19" r="3" fill="#e9972b"/><circle cx="38" cy="19" r="3" fill="#e9972b"/></svg>';
const base=window.ribbonBuild;if(base)window.ribbonBuild=function(){install();return base.apply(this,arguments);};install();setTimeout(()=>{
  ribbonBuild();map.on('mousemove',e=>{if(drawing&&S.tool===TOOL)renderAxis(e.latlng);});
  map.on('dblclick',e=>{if(drawing&&S.tool===TOOL){L2.DomEvent.stop(e);finishAxis();}});
},0);
window.GeoMineChannelExtraction={open,generate,commit,cancel,mapClick,endDrawing,beginDraw,finishAxis,buildSpecs,fields,sourceSignature,workerSource,sampleLayoutBatch,analyzeNative};
})();
