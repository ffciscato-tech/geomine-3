/* Flood levels always use native terrain cells. The reduced D8 grid remains
   independent: display and flow preferences must never lower flood precision. */
(function(root){
'use strict';
const el=id=>document.getElementById(id);
let binding=null,job=null,describing=0,description=null,context=null;
const generation=()=>root.GeoMineSessionAutosave?.state?.generation;
const num=id=>{const v=el(id)?.value;return v==null||v.trim()===''?NaN:Number(v.replace(',','.'));};
const abortError=()=>Object.assign(new Error('Cálculo cancelado: o projeto, o MDT ou os parâmetros mudaram.'),{name:'AbortError'});
const metric=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:4});
function resetContext(){
  const key=String(S.projectId)+'|'+String(generation());
  if(context!==key){cancel();context=key;binding=null;description=null;describing++;if(el('hInundRaster'))el('hInundRaster').value='';}
}
function catalogue(){
  resetContext();
  const list=(S.rasters||[]).filter(r=>root.GeoMineChannelDEM?.isElevation(r)).map(r=>({key:'r:'+r.id,r}));
  if(binding&&binding.grid===S.hidro?.dem){
    if(binding.listed&&!(S.rasters||[]).includes(binding.r))return list;
    if(!list.some(v=>v.r===binding.r))list.push({key:'hydro',r:binding.r});
  }else if(S.hidro?.dem){
    const d=S.hidro.dem;
    if(!list.some(v=>v.r.d===d||v.r.d?._full===d||d._full===v.r.d||d._full&&d._full===v.r.d?._full)){
      if(!binding||binding.grid!==d)binding={grid:d,r:{name:'MDE da Hidrologia',d,crs:d.crs||d.srcCRS||S.workCRS}};
      list.push({key:'hydro',r:binding.r});
    }
  }
  return list;
}
function selected(){
  const list=catalogue(),select=el('hInundRaster'),saved=S.hidro?.inundRasterId;
  let item=list.find(v=>v.key===(select?.value||saved));
  if(!item&&saved)item=list.find(v=>v.key===saved);
  if(!item&&binding&&binding.grid===S.hidro?.dem)item=list.find(v=>v.r===binding.r);
  if(!item&&S.hidro?.sourceRasterId!=null)item=list.find(v=>v.r.id===S.hidro.sourceRasterId);
  if(!item){const d=S.hidro?.dem;if(d)item=list.find(v=>v.r.d===d||v.r.d?._full===d||d._full===v.r.d||d._full&&d._full===v.r.d?._full);}
  if(!item&&list.length===1)item=list[0];
  if(select){
    const key=item?.key||'',signature=list.map(v=>v.key+'\0'+v.r.name).join('\n');
    if(select.dataset.sources!==signature){
      select.replaceChildren(new Option('— selecione o MDT —',''),...list.map(v=>new Option(v.r.name||'MDT',v.key)));
      select.dataset.sources=signature;
    }
    select.value=key;
  }
  return item||null;
}
function bindSource(r,grid){
  resetContext();binding={r,grid,listed:(S.rasters||[]).includes(r)};description=null;describing++;
  S.hidro.sourceRasterId=(S.rasters||[]).includes(r)?r.id:null;
  S.hidro.inundRasterId=S.hidro.sourceRasterId!=null?'r:'+r.id:'hydro';
  if(el('hInundRaster'))el('hInundRaster').value=S.hidro.inundRasterId;
  refresh(true);
}
function unitScale(sampler){
  const p=root.proj4(sampler.sourceCRS).oProj;
  if(p.projName==='longlat')throw new Error('Para calcular área e volume na grade nativa, use um MDT com CRS projetado em metros.');
  const scale=Number(p.to_meter??1);
  if(!(scale>0&&Number.isFinite(scale)))throw new Error('Unidade horizontal do MDT inválida.');
  return scale;
}
function info(sampler,r){
  const scale=unitScale(sampler),g=sampler.grid,dx=g.cs*scale,dy=g.csy*scale;
  const resolution=Math.abs(dx-dy)<1e-8?metric(dx):metric(dx)+' × '+metric(dy);
  if(el('hInundInfo'))el('hInundInfo').textContent=(r.name||'MDT')+' · resolução nativa '+resolution+' m · '+g.nc+' × '+g.nr+' células';
  return scale;
}
function preview(){
  const out=el('hInundPrev');if(!out)return;
  const inc=num('hInundInc'),count=Math.max(1,Math.min(200,Math.floor(num('hInundIter')||1))),ini=num('hInundIni');
  out.textContent=Number.isFinite(inc)&&inc>0?(Number.isFinite(ini)?count+' nível(is): '+metric(ini)+' a '+metric(ini+inc*(count-1))+' m.':count+' nível(is), incremento de '+metric(inc)+' m a partir do terreno.') : '';
}
function destinationOptions(){
  const select=el('hInundDestination'),dissolve=el('hInundDissolve'),api=root.GeoMineNativeFloodDestination;
  if(!select||!api)return 'new';
  const layers=(S.layers||[]).filter(L=>L.gtype==='polygon'&&api.editable(L));
  const preferred=S.hidro.inundDestination;
  let value=preferred&&layers.some(L=>'layer:'+L.id===preferred)?preferred:preferred==='new'?'new':null;
  if(!value){const active=layers.find(L=>L.id===S.activeId);value=active?'layer:'+active.id:'new';}
  const signature=JSON.stringify(layers.map(L=>[L.id,L.name,L.id===S.activeId]));
  if(select.dataset.destinations!==signature){
    select.replaceChildren(new Option('Criar nova camada','new'),...layers.map(L=>new Option((L.id===S.activeId?'Camada ativa — ':'')+L.name,'layer:'+L.id)));
    select.dataset.destinations=signature;
  }
  select.value=value;S.hidro.inundDestination=value;
  if(dissolve){dissolve.disabled=!!job||value==='new';dissolve.checked=value!=='new'&&S.hidro.inundDissolve===true;}
  return value;
}
function refresh(force=false){
  const item=selected();preview();if(!job)destinationOptions();
  if(job)return item;
  if(!item){if(el('hInundInfo'))el('hInundInfo').textContent='Selecione o MDT para usar sua resolução nativa.';return null;}
  const r=item.r,d=r.d;
  if(!force&&description?.r===r&&description?.d===d&&description?.image===d._img0&&description?.full===d._full&&description?.z===d.z)return item;
  const token=++describing,project=S.projectId,gen=generation();
  description={r,d,image:d._img0,full:d._full,z:d.z};
  if(el('hInundInfo'))el('hInundInfo').textContent='Verificando a resolução nativa do MDT…';
  const current=()=>token===describing&&S.projectId===project&&generation()===gen&&selected()?.r===r;
  root.GeoMineChannelDEM.prepare(r,{workCRS:S.workCRS,isCurrent:current}).then(s=>{
    try{if(current())info(s,r);}finally{s.close();}
  }).catch(e=>{if(current()&&e.name!=='AbortError'){description=null;if(el('hInundInfo'))el('hInundInfo').textContent=e.message;}});
  return item;
}
function cancel(){job?.controller.abort();}
function resetProject(){
  cancel();binding=null;description=null;context=null;describing++;
  if(el('hInundRaster'))el('hInundRaster').replaceChildren(new Option('— selecione o MDT —',''));
  if(el('hInundRaster'))delete el('hInundRaster').dataset.sources;
  if(el('hInundInfo'))el('hInundInfo').textContent='Selecione o MDT para usar sua resolução nativa.';
  if(el('hInundOut'))el('hInundOut').textContent='Nenhuma simulação por cotas gerada.';
  if(el('hInundDestination')){el('hInundDestination').replaceChildren(new Option('Criar nova camada','new'));delete el('hInundDestination').dataset.destinations;}
  if(el('hInundDissolve')){el('hInundDissolve').checked=false;el('hInundDissolve').disabled=true;}
}
function busy(on){
  for(const id of ['btnInundRun','btnInundFundo','btnInundTudo','btnInundLimpa','hInundRaster','hInundDestination','hInundDissolve'])if(el(id))el(id).disabled=on;
  if(el('btnInundCancel'))el('btnInundCancel').hidden=!on;
  if(!on)destinationOptions();
}
function signature(r){
  const rev=g=>typeof projectNativeGridRevision==='function'?projectNativeGridRevision(g):'';
  return JSON.stringify([rev(r.d),rev(r.d?._full),r._exactClipRings,r.d?.clip,r.d?._full?.clip,r.crs,r.srcCRS]);
}
async function barrierHeights(sampler,barrier,check){
  if(!barrier)return null;
  let min=Infinity;const points=[];
  const flush=async()=>{if(!points.length)return;check();const values=await sampler.sample(points.splice(0));check();for(const v of values)if(Number.isFinite(v))min=Math.min(min,v);};
  showLoad('Lendo a crista do barramento no MDT nativo…');
  for(const line of barrier.linhas)for(let i=1;i<line.length;i++){
    const a=line[i-1],b=line[i],distance=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(!Number.isFinite(distance))throw new Error('O barramento contém coordenadas inválidas.');
    const steps=Math.max(1,Math.ceil(distance/sampler.resolution));
    for(let j=0;j<=steps;j++){const t=j/steps;points.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);if(points.length===1024)await flush();}
  }
  await flush();let ends=Infinity;
  for(const line of barrier.linhas)if(line.length){const values=await sampler.sample([line[0],line[line.length-1]]);check();for(const v of values)if(Number.isFinite(v))ends=Math.min(ends,v);}
  return {min:Number.isFinite(min)?min:null,ends:Number.isFinite(ends)?ends:null};
}
async function run(seedLatLng,mode='ponto'){
  if(job){toast('Já existe uma inundação em cálculo.');return;}
  const item=selected();if(!item){toast('Selecione o MDT da inundação.');return;}
  const inc=num('hInundInc'),count=Math.max(1,Math.min(200,Math.floor(num('hInundIter')||1))),typed=num('hInundIni');
  if(!(inc>0&&Number.isFinite(inc))){toast('Confira o incremento.');return;}
  if(!['ponto','fundo','tudo'].includes(mode)){toast('Modo de inundação inválido.');return;}
  let destination;try{destination=root.GeoMineNativeFloodDestination.capture(destinationOptions(),el('hInundDissolve')?.checked===true);}catch(e){toast(e.message);return;}
  const r=item.r,d=r.d,q={controller:new AbortController(),project:S.projectId,gen:generation(),workCRS:S.workCRS,r,d,listed:(S.rasters||[]).includes(r)};
  job=q;describing++;busy(true);let sampler=null,outcome='error';
  const out=el('hInundOut'),params=()=>['hInundIni','hInundInc','hInundIter','hBarrLay'].map(id=>el(id)?.value).concat(el('hInundDestination')?.value,!!el('hInundDissolve')?.checked).join('|'),initialParams=params();
  let barrier=null,barrierFeatures=null,originalBarrier='';
  const barrierSignature=()=>barrier?JSON.stringify([barrier.L.crs,barrier.L.features.map(f=>f.geom)]):'';
  const current=()=>job===q&&!q.controller.signal.aborted&&root.GeoMineNativeFloodDestination.current(destination)&&S.projectId===q.project&&generation()===q.gen&&S.workCRS===q.workCRS&&(!q.listed||(S.rasters||[]).includes(r))&&selected()?.r===r&&r.d===d&&params()===initialParams&&(!barrier||S.layers.includes(barrier.L)&&barrier.L.features===barrierFeatures);
  const check=()=>{if(!current()||sampler&&!sampler.isCurrent())throw abortError();};
  const progress=p=>{
    check();const phase=p.phase==='contour'?'Traçando contorno':p.phase==='scan'?'Lendo cotas':'Calculando inundação';
    const text=phase+' na resolução nativa'+(Number.isFinite(p.progress)?' · '+Math.round(p.progress*100)+'%':'')+(p.nWet?' · '+p.nWet.toLocaleString('pt-BR')+' células alagadas':'');
    if(out)out.textContent=text;showLoad(text);
  };
  try{
    showLoad('Abrindo o MDT na resolução nativa…');if(out)out.textContent='Abrindo o MDT original…';
    barrier=typeof barrLinhas==='function'?barrLinhas():null;barrierFeatures=barrier?.L.features;originalBarrier=barrierSignature();
    const originalSignature=signature(r);
    sampler=await root.GeoMineChannelDEM.prepare(r,{workCRS:q.workCRS,signal:q.controller.signal,isCurrent:current});check();
    const scale=info(sampler,r),g=sampler.grid,source={...g,unitScale:scale,readWindow:sampler.readWindow,isCurrent:current},engine=root.GeoMineNativeFloodEngine;
    const options={signal:q.controller.signal,onProgress:progress};
    let seed=null,seedZ=null,stats=null;
    if(mode==='ponto'){
      if(!seedLatLng)throw new Error('Indique o ponto de partida no mapa.');
      const p=fromWGS(q.workCRS,seedLatLng.lng,seedLatLng.lat),cell=sampler.locate(p);
      if(!cell)throw new Error('O ponto caiu fora do MDT ou de seu recorte.');
      seed={col:cell.col,row:cell.row};
      seedZ=(await sampler.readWindow([seed.col,seed.row,seed.col+1,seed.row+1]))[0];
      if(!Number.isFinite(seedZ))throw new Error('O ponto está em uma célula sem cota válida no MDT original.');
    }else if(mode==='fundo'||!Number.isFinite(typed)){
      stats=await engine.scan(source,options);check();
      if(!stats.nVal||!stats.minCell)throw new Error('O MDT original não contém cotas válidas.');
      if(mode==='fundo'){seed=stats.minCell;seedZ=stats.mn;}
    }
    const base=Number.isFinite(typed)?typed:(seedZ??stats.mn)+inc;
    if(!Number.isFinite(base))throw new Error('Não foi possível determinar a cota inicial.');
    const barrierLines=barrier?.linhas.map(line=>line.map(p=>sampler.toRaster(p)));
    const crest=await barrierHeights(sampler,barrier,check);
    const results=[];let retainedBytes=0;
    for(let i=0;i<count;i++){
      check();const level=base+inc*i;
      const result=await engine.analyze(source,{...options,level,mode:mode==='tudo'?'all':'point',seed,barrierLines});check();
      if(result.nWet){
        retainedBytes+=result.rings.reduce((total,ring)=>total+ring.length*96+128,0);
        if(retainedBytes>192*1024*1024)throw new Error('Os contornos dos níveis excederam o limite de memória. Reduza o número de níveis ou recorte a área do MDT. A resolução nativa foi mantida.');
        results.push({level,...result});
      }
    }
    check();if(signature(r)!==originalSignature||barrierSignature()!==originalBarrier)throw abortError();
    if(!results.length){if(out)out.textContent='Nenhuma célula alagou nas cotas escolhidas. Confira o ponto e a cota inicial.';outcome='ok';return;}
    // Calculate and stage every level before changing the chosen layer.
    const field=(name,decimal=3)=>({name,type:'N',length:20,decimal});
    const fields=[...['COTA_M','AREA_M2','AREA_HA','VOLUME_M3','PROF_MED_M','RES_X_M','RES_Y_M'].map(n=>field(n)),field('CELULAS',0),{name:'FONTE_MDT',type:'C',length:120},{name:'BARRAMENTO',type:'C',length:80}];
    const features=results.map(result=>({geom:result.rings,multi:true,props:{COTA_M:result.level,AREA_M2:result.areaM2,AREA_HA:result.areaM2/1e4,VOLUME_M3:result.volM3,PROF_MED_M:result.volM3/result.areaM2,RES_X_M:g.cs*scale,RES_Y_M:g.csy*scale,CELULAS:result.nWet,FONTE_MDT:r.name||'MDT',BARRAMENTO:barrier?.L.name||'—'}}));
    let seedFeature=null;
    if(seed){
      const xy=[g.xll+(seed.col+.5)*g.cs,g.yll+(g.nr-seed.row-.5)*g.csy],work=sampler.toWork(xy);
      seedFeature={geom:[xy],props:{TIPO:mode==='fundo'?'Ponto mais baixo':'Ponto de partida',COTA_M:seedZ,COTA_INI_M:base,INCR_M:inc,N_ITER:count,E:work[0],N:work[1]}};
    }
    showLoad('Preparando a camada de destino…');
    const staged=await root.GeoMineNativeFloodDestination.stage(destination,{features,fields,crs:sampler.sourceCRS,seed:seedFeature,
      seedFields:[{name:'TIPO',type:'C',length:30},...['COTA_M','COTA_INI_M','INCR_M','E','N'].map(n=>field(n)),field('N_ITER',0)]},
      {signal:q.controller.signal,check,onProgress:message=>{check();showLoad(message);if(out)out.textContent=message;}});
    check();if(signature(r)!==originalSignature||barrierSignature()!==originalBarrier)throw abortError();
    const committed=root.GeoMineNativeFloodDestination.commit(destination,staged);
    S.hidro.inundDestination='layer:'+committed.target.id;S.hidro.inundDissolve=destination.dissolve;
    S.hidro.inundRasterId=item.key;
    const summary=results.map(v=>metric(v.level)+' m → '+fmtArea(v.areaM2)+' · '+metric(v.volM3)+' m³').join('\n');
    const warnings=[];
    if(results.some(v=>v.touchesEdge))warnings.push('A inundação alcança a borda do MDT; o resultado termina no limite dos dados.');
    if(crest?.min!=null&&results.some(v=>v.level>crest.min))warnings.push('A água ultrapassa a crista do barramento ('+metric(crest.min)+' m) nos níveis acima dessa cota.');
    if(crest?.ends!=null&&results.some(v=>v.level>crest.ends))warnings.push('Acima de '+metric(crest.ends)+' m a água pode contornar as pontas do barramento.');
    if(out){out.style.whiteSpace='pre-line';out.textContent=results.length+' mancha(s) em “'+committed.target.name+'” · resolução nativa '+metric(g.cs*scale)+' m\n'+summary+(warnings.length?'\n'+warnings.join('\n'):'');}
    cmdLog('Inundação: '+(r.name||'MDT')+' · resolução nativa '+metric(g.cs*scale)+' m · '+results.length+' nível(is)','ok');
    toast((destination.dissolve?'Inundação dissolvida':'Inundação acrescentada')+' em “'+committed.target.name+'”. Ctrl+Z desfaz.');outcome='ok';
  }catch(e){
    const cancelled=e.name==='AbortError';outcome=cancelled?'cancel':'error';
    const message=cancelled?'Inundação cancelada. Nenhuma feição foi alterada.':'Falha na inundação: '+e.message;
    if(out)out.textContent=message;toast(message);if(!cancelled)cmdLog(message,'erro');
  }finally{sampler?.close();if(job===q){job=null;busy(false);hideLoad(outcome);}}
}
function clearResults(){
  if(job){toast('Aguarde ou cancele o cálculo antes de limpar os resultados.');return false;}
  if(!(S.layers||[]).some(L=>L.features.some(f=>f._nativeFlood?.version===1))){toast('Nenhum resultado desta simulação para limpar. Camadas anteriores foram preservadas.');return false;}
  if(!confirm('Limpar os resultados de inundação? As feições anteriores serão preservadas.'))return false;
  try{const cleared=root.GeoMineNativeFloodDestination.clear();if(cleared&&el('hInundOut'))el('hInundOut').textContent='Resultados removidos. Ctrl+Z desfaz.';destinationOptions();return cleared;}
  catch(e){toast('Não foi possível limpar: '+e.message);return false;}
}
root.GeoMineNativeFlood={run,refresh,preview,cancel,resetProject,bindSource,clearResults,hasSource:()=>!!selected()};
el('hInundDestination')?.addEventListener('change',()=>{cancel();S.hidro.inundDestination=el('hInundDestination').value;destinationOptions();});
el('hInundDissolve')?.addEventListener('change',()=>{cancel();S.hidro.inundDissolve=el('hInundDissolve').checked;});
el('hInundRaster')?.addEventListener('change',()=>{cancel();S.hidro.inundRasterId=el('hInundRaster').value;description=null;refresh(true);});
el('btnInundCancel')?.addEventListener('click',cancel);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&job)cancel();});
for(const id of ['hInundIni','hInundInc','hInundIter','hBarrLay'])el(id)?.addEventListener('input',()=>{cancel();preview();});
})(window);
