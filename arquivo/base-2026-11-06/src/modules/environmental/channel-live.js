/* Vínculo construtivo da calha: recalcula após editar o guia, nunca no meio
   do arrasto. Metadados persistidos; MDT, eixo e estilos não são reescritos. */
(function(){
'use strict';
const VERSION=1,DELAY=450,STALE=' [desatualizada]';
let timer=null,running=null,mutating=false,pointer=false,epoch=0,sourceToken=0,suspended=0;
const attempts=new Map(),bindings=new Map(),permissionNotices=new Set(),rasterCache=new WeakMap(),clone=x=>JSON.parse(JSON.stringify(x));
function fingerprint(x){
  const s=JSON.stringify(x);let a=2166136261,b=2246822507;
  for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b^s.charCodeAt(i),3266489909);}
  return s.length+':'+(a>>>0).toString(16)+':'+(b>>>0).toString(16);
}
const matchesFeature=(f,id)=>f?._channelRecipeId===id;
function layoutSamples(plan){
  if(plan.pointCoordinates){const xy=plan.pointCoordinates;return {length:xy.length/2,slice:(a,b)=>{const out=[];for(let i=a;i<Math.min(b,xy.length/2);i++)out.push([xy[2*i],xy[2*i+1]]);return out;}};}
  return plan.points||plan.sections.flatMap(s=>s.points);
}
function layoutHeights(plan,values){
  if(plan.grid)return values;
  let cursor=0;return plan.sections.map(s=>{const z=values.slice(cursor,cursor+s.points.length);cursor+=s.points.length;return z;});
}
const featuresFor=(L,id)=>id===undefined?L.features:(L.features||[]).filter(f=>matchesFeature(f,id));
function resultSignature(L,id){
  const features=featuresFor(L,id);
  if(id===undefined)return fingerprint({crs:L.crs,fields:L.fields,features:features.map(f=>({...f,props:{...f.props,STATUS:null}}))});
  const used=new Set(features.flatMap(f=>Object.keys(f.props||{})));
  return fingerprint({crs:L.crs,fields:(L.fields||[]).filter(f=>used.has(f.name)),features:features.map(f=>({geom:f.geom,multi:!!f.multi,_channelRecipeId:f._channelRecipeId,props:{...f.props,STATUS:null}}))});
}
const memberSignature=m=>resultSignature(m.layer,m.shared?m.recipe.id:undefined);
const memberFeatures=m=>featuresFor(m.layer,m.shared?m.recipe.id:undefined);
const memberCurrent=m=>S.layers.includes(m.layer)&&m.layer._channelLink===m.container&&(m.shared?m.container.entries.includes(m.recipe):m.container===m.recipe);
const recipeConfiguration=r=>fingerprint([r.layerId,r.rasterId,r.crs,r.axisKeys,r.options?.mode,r.options?.height,r.options?.interval,r.options?.reach,r.options?.searchLimited!==false,r.options?.simplifyOutput===true,r.options?.smooth===true]);
function consistentPair(group){return group.length===2&&group[0].layer!==group[1].layer&&group.some(m=>m.recipe.role==='sections')&&group.some(m=>m.recipe.role==='polygon')&&group.every(m=>(!m.shared||m.recipe.role===m.container.role)&&m.layer.gtype===(m.recipe.role==='polygon'?'polygon':'line')&&recipeConfiguration(m.recipe)===recipeConfiguration(group[0].recipe));}
function rasterState(r,deep=false){
  const d=r.d,refs=[d,d?.z,d?._full,d?._full?.z,d?._img0,d?._tiff,r._projectSourceRaw,r._projectNativeBinding],
    meta=fingerprint([r,d,d?._full].map(x=>x?Object.fromEntries(['nc','nr','cs','csy','xll','yll','crs','srcCRS','noData','nodata','_nd','clip','_exactClipRings','quantity','unit','resampled','native','srcDims','_bb'].map(k=>[k,x[k]])):null)),old=rasterCache.get(r);
  if(!deep&&old&&!old.dirty&&meta===old.meta&&refs.every((v,i)=>v===old.refs[i]))return old;
  const signature=GeoMineChannelExtraction.sourceSignature(r),token=old&&old.signature===signature&&old.meta===meta&&refs.every((v,i)=>v===old.refs[i])?old.token:++sourceToken,
    value={refs,meta,signature,token};rasterCache.set(r,value);return value;
}
function sameRaster(q,deep=false){const now=rasterState(q.r,deep);return now.signature===q.raster.signature&&now.meta===q.raster.meta&&now.refs.every((v,i)=>v===q.raster.refs[i]);}
function dirtyRaster(r){const state=rasterCache.get(r);if(state)state.dirty=true;}
function info(message,error=false){try{cmdLog(message,error?'warn':'info');toast(message);}catch(_){}}
function groups(){
  const found=new Map();for(const L of S.layers||[]){const container=L._channelLink;if(!container?.id)continue;
    const shared=container.version===2,entries=shared&&Array.isArray(container.entries)?container.entries:container.version===VERSION?[container]:[];
    for(const recipe of entries){if(recipe?.version!==VERSION||!recipe.id)continue;
      const key=shared?'v2:'+container.id+':'+recipe.id:'v1:'+recipe.id;
      if(!found.has(key))found.set(key,[]);found.get(key).push({layer:L,recipe,container,shared});
    }}
  return [...found.values()];
}
function source(group){
  const recipe=group[0].recipe,L=S.layers.find(L=>L.id===recipe.layerId),r=S.rasters.find(r=>r.id===recipe.rasterId);
  if(!L||L.gtype!=='line')throw Error('A camada do eixo vinculado não está disponível.');
  if(!r?.d)throw Error('O MDT vinculado não está disponível.');
  if(S.workCRS!==recipe.crs)throw Error('O CRS do projeto mudou. Gere e confira uma nova calha.');
  if(!Array.isArray(recipe.axisKeys)||!recipe.axisKeys.length||recipe.axisKeys.length>100)throw Error('Vínculo de eixos inválido.');
  const rows=recipe.axisKeys.map(key=>{
    const matches=L.features.map((f,i)=>({f,index:i+1})).filter(row=>row.f._channelAxisId===key);
    if(matches.length!==1)throw Error('Um eixo vinculado foi removido, dividido ou duplicado. Gere e confira uma nova calha.');
    return matches[0];
  });
  const raster=rasterState(r),axisStamp=fingerprint({crs:L.crs,workCRS:S.workCRS,axes:rows.map(row=>({key:row.f._channelAxisId,geom:row.f.geom,multi:!!row.f.multi,index:row.index})),o:recipe.options}),
    stamp=fingerprint({axisStamp,raster:raster.signature,token:raster.token});
  return {recipe,L,r,rows,stamp,axisStamp,raster};
}
function rasterChanged(q){
  // Carregar o mesmo projeto normaliza o cache/prévia do MDT. A primeira
  // leitura da sessão estabelece a identidade; substituir a fonte depois
  // invalida o vínculo, mesmo se a miniatura e as dimensões forem iguais.
  if(!bindings.has(q.recipe.id))bindings.set(q.recipe.id,q.raster.token);
  return bindings.get(q.recipe.id)!==q.raster.token||q.recipe.rasterPending===true;
}
function changed(q){return q.axisStamp!==q.recipe.sourceSignature||rasterChanged(q);}
function status(group,state,message){
  mutating=true;
  try{for(const member of group){const L=member.layer;if(!memberCurrent(member))continue;
    if(L.locked||typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false))continue;
    const link=member.recipe;link.state=state;link.message=message;
    if(!member.shared){if(state!=='ready'&&!L.name.endsWith(STALE))L.name+=STALE;
      if(state==='ready'&&L.name.endsWith(STALE))L.name=L.name.slice(0,-STALE.length);}
    const readyStatus=link.options?.mode==='axisDepth'?'Faixa por altura estimada — não delimita leito regular nem certifica cheia':link.options?.mode==='depth'?'Faixa por profundidade estimada — não delimita leito regular nem certifica cheia':'Calha estimada — requer validação do leito regular';
    for(const f of memberFeatures(member)){f.props=f.props||{};f.props.STATUS=state==='ready'?readyStatus:'DESATUALIZADA: '+message;}
  }refreshUI();}finally{mutating=false;}
}
function busyEditing(){return pointer||(typeof ED!=='undefined'&&!!(ED.drag||ED.pend))||S._view==='layout';}
function schedule(){if(mutating||suspended)return;clearTimeout(timer);timer=setTimeout(scan,DELAY);}
function stop(){epoch++;clearTimeout(timer);timer=null;if(running){running.controller.abort();running.worker?.terminate();running.reject?.(Error('Atualização interrompida.'));}running=null;attempts.clear();bindings.clear();}
function suspend(){
  suspended++;epoch++;clearTimeout(timer);timer=null;
  if(running){running.controller.abort();running.worker?.terminate();running.reject?.(Error('Atualização suspensa durante alteração das camadas.'));running=null;}
  attempts.clear();let released=false;return ()=>{if(released)return;released=true;suspended=Math.max(0,suspended-1);if(!suspended)schedule();};
}
function makeRecipes(v,created,id,shared){
  if(!v?.q||!Array.isArray(created)||created.length!==2||!id||new Set(created.map(L=>L.gtype)).size!==2||!created.some(L=>L.gtype==='line')||!created.some(L=>L.gtype==='polygon'))throw Error('São necessárias as camadas de seções e polígono para vincular o trecho.');
  const {q}=v;if(!Array.isArray(q.rows)||!q.rows.length)throw Error('Não há eixo para vincular.');
  if(q.L.locked||typeof collabCanEditLayer==='function'&&!collabCanEditLayer(q.L,false))throw Error('O eixo está bloqueado ou sem permissão para receber o vínculo.');
  const assigned=[];
  try{
    if(shared&&created.some(L=>!featuresFor(L,id).length))throw Error('As feições do novo trecho precisam estar identificadas antes de vincular.');
    for(const row of q.rows)if(!row.f._channelAxisId){row.f._channelAxisId='axis-'+(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));assigned.push(row.f);}
    const recipe={version:VERSION,id,layerId:q.L.id,rasterId:q.r.id,crs:q.crs,axisKeys:q.rows.map(row=>row.f._channelAxisId),options:{mode:q.o.mode,height:q.o.height,interval:q.o.interval,reach:q.o.reach,searchLimited:q.o.searchLimited!==false,...(q.o.simplifyOutput===true?{simplifyOutput:true}:{}),...(q.o.smooth===true?{smooth:true}:{})},state:'ready',message:''};
    const recipes=created.map(L=>({...clone(recipe),role:L.gtype==='polygon'?'polygon':'sections',resultSignature:resultSignature(L,shared?id:undefined)}));
    const qSource=source([{recipe:recipes[0]}]);for(const item of recipes)item.sourceSignature=qSource.axisStamp;bindings.set(id,qSource.raster.token);return recipes;
  }catch(e){for(const f of assigned)delete f._channelAxisId;throw e;}
}
function attachEntry(v,layers,id){return makeRecipes(v,layers,id,true);}
function attach(v,created){
  if(!v?.q||created.length!==2)return;
  const id='channel-'+(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),recipes=makeRecipes(v,created,id,false);
  for(let i=0;i<created.length;i++)created[i]._channelLink=recipes[i];
}
function call(j,method,args){return new Promise((resolve,reject)=>{
  if(j.controller.signal.aborted)return reject(Error('Atualização interrompida.'));
  j.reject=reject;j.worker.onmessage=e=>{j.reject=null;e.data.error?reject(Object.assign(Error(e.data.error),{code:e.data.code})):resolve(e.data.result);};
  j.worker.onerror=e=>{j.reject=null;reject(Error(e.message||'Falha ao recalcular a calha.'));};j.worker.postMessage({method,args});
});}
function editable(group){return group.every(m=>!m.layer.locked&&(typeof collabCanEditLayer!=='function'||collabCanEditLayer(m.layer,false)));}
function mergeFields(L,features){const fields=(L.fields||[]).slice(),names=new Set(fields.map(f=>f.name));for(const f of GeoMineChannelExtraction.fields(features))if(!names.has(f.name)){fields.push(f);names.add(f.name);}return fields;}
function replaceEntryFeatures(L,id,features){
  const next=[];let inserted=false;for(const f of L.features){if(matchesFeature(f,id)){if(!inserted){for(const item of features)next.push(item);inserted=true;}}else next.push(f);}
  if(!inserted)for(const item of features)next.push(item);return next;
}
async function update(group,q){
  const project=S.projectId,version=epoch,j={controller:new AbortController(),worker:null,reject:null};running=j;
  const originals=group.map(m=>({signature:memberSignature(m),configuration:recipeConfiguration(m.recipe)}));
  const valid=()=>{try{return !suspended&&!j.controller.signal.aborted&&version===epoch&&S.projectId===project&&S.layers.includes(q.L)&&S.rasters.includes(q.r)&&sameRaster(q)&&
    group.every((m,i)=>memberCurrent(m)&&memberSignature(m)===originals[i].signature&&recipeConfiguration(m.recipe)===originals[i].configuration)&&source(group).stamp===q.stamp;}catch(_){return false;}};
  let sampler,timeout;
  try{
    status(group,'pending','Eixo alterado; recalculando as margens.');
    if(q.recipe.options.mode!=='axisHeight'){
      const url=URL.createObjectURL(new Blob([GeoMineChannelExtraction.workerSource(q.recipe.options.mode)],{type:'text/javascript'}));
      j.worker=new Worker(url);URL.revokeObjectURL(url);
      timeout=setTimeout(()=>{j.controller.abort();j.worker.terminate();j.reject?.(Error('Cálculo excedeu 3 minutos. Divida o eixo em trechos.'));},180000);
    }
    sampler=await GeoMineChannelDEM.prepare(q.r,{workCRS:q.recipe.crs,signal:j.controller.signal,isCurrent:valid});
    const o=q.recipe.options,resolution=sampler.resolution,outputs=[];let sampled=0;
    if(!(resolution>0)||!['auto','height','depth','axisDepth','axisHeight'].includes(o.mode)||!(o.interval>=.5&&o.interval<=100)||(o.searchLimited!==false&&!(o.reach>=1&&o.reach<=2000))||(['height','depth','axisDepth','axisHeight'].includes(o.mode)&&!(o.height>0&&o.height<=100)))throw Error('Parâmetros do vínculo inválidos.');
    const convert=proj4(q.L.crs,q.recipe.crs);
    for(const row of q.rows){
      if(!valid())throw Error('Dados alterados durante o cálculo.');
      let g=row.f.geom;while(Array.isArray(g)&&g.length===1&&Array.isArray(g[0]?.[0]))g=g[0];
      if(!Array.isArray(g)||g.some(p=>!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])))throw Error('O eixo deixou de ser uma linha contínua válida.');
      const line=g.map(p=>q.L.crs===q.recipe.crs?p.slice(0,2):convert.forward(p.slice(0,2)));
      const reaches=GeoMineChannelSearchPolicy.reaches(o);
      for(let attempt=0;attempt<reaches.length;attempt++){
        if(o.mode==='axisHeight'){
          const reach=reaches[attempt],result=await GeoMineChannelExtraction.analyzeNative(sampler,line,{...o,reach,resolution,allowPartial:true},{
            signal:j.controller.signal,isCurrent:valid,onProgress:p=>{
              if(valid())status(group,'pending',p.message||'Recalculando as margens em blocos nativos.');
            }
          });
          if(!valid())throw Error('Dados alterados durante o cálculo.');
          if(attempt<reaches.length-1&&result.boundaryDiagnostics?.searchBoundaryEdges>0)continue;
          if(!result.sections.length)throw Error('Eixo '+row.index+' sem trecho aproveitável. O resultado anterior foi preservado.');
          outputs.push({...result,index:row.index,searchReach:reach});break;
        }
        const reach=reaches[attempt],nativeGrid=String(sampler.sourceCRS)===String(q.recipe.crs)?sampler.grid:null,
          plan=await call(j,'plan',[line,{mode:o.mode,interval:o.interval,lateralStep:resolution/2,resolution,reach,nativeGrid,sampleBudget:o.mode!=='axisDepth'?1000000:250000}]),points=layoutSamples(plan),values=plan.pointCoordinates?new Float64Array(points.length):[];
        sampled+=points.length;if(sampled>(o.mode!=='axisDepth'?4000000:500000))throw Error('Limite de leitura atingido. Processe menos eixos por vez ou aumente o espaçamento das seções.');
        for(let a=0;a<points.length;a+=4096){if(!valid())throw Error('Dados alterados durante o cálculo.');const batch=GeoMineChannelExtraction.sampleLayoutBatch?await GeoMineChannelExtraction.sampleLayoutBatch(sampler,plan,points,a,a+4096):await sampler.sample(points.slice(a,a+4096));if(plan.pointCoordinates)values.set(batch,a);else values.push(...batch);await new Promise(r=>setTimeout(r,0));}
        const heights=layoutHeights(plan,values);
        try{outputs.push({...await call(j,'analyze',[plan,heights,{...o,resolution}]),index:row.index,searchReach:reach});break;}
        catch(e){
          if(attempt<reaches.length-1&&GeoMineChannelSearchPolicy.canExpand(e))continue;
          if(o.mode!=='axisDepth'&&(/^CHANNEL_(NO_DATA|BARRIER|AMBIGUOUS_FLOOR|REACH_BANK|REACH_BREAK|REACH_FLOOR|INVALID_GEOMETRY)$/.test(e.code||'')||o.mode==='axisHeight'&&e.code==='CHANNEL_RESOLUTION')){
            const result=await call(j,'analyze',[plan,heights,{...o,resolution,allowPartial:true}]);
            if(attempt<reaches.length-1&&(result.boundaryDiagnostics?.searchBoundaryEdges>0||result.omitted?.some(d=>d.code==='CHANNEL_REACH_BANK')))continue;
            if(!result.sections.length)throw Error('Eixo '+row.index+' sem trecho aproveitável. O resultado anterior foi preservado.');
            outputs.push({...result,index:row.index,searchReach:reach});break;
          }
          throw e;
        }
      }
    }
    if(!valid()||!sameRaster(q,true)||busyEditing()||!editable(group))throw Object.assign(Error('A edição recomeçou ou a fonte/permissão mudou.'),{transient:true});
    const specs=GeoMineChannelExtraction.buildSpecs({q:{L:q.L,r:q.r,o,crs:q.recipe.crs},outputs,resolution});
    const before=group.map(m=>({L:m.layer,features:m.layer.features,fields:m.layer.fields,link:clone(m.layer._channelLink),name:m.layer.name}));
    mutating=true;
    try{
      for(const member of group){const L=member.layer,link=member.recipe,spec=specs[link.role==='polygon'?1:0];
        if(member.shared){const features=spec.features.map(f=>({...f,_channelRecipeId:link.id}));L.features=replaceEntryFeatures(L,link.id,features);L.fields=mergeFields(L,features);}
        else{L.features=spec.features;L.fields=GeoMineChannelExtraction.fields(spec.features);}
        link.sourceSignature=q.axisStamp;link.rasterPending=false;link.resultSignature=memberSignature(member);
      }
      status(group,'ready','Atualizada após editar o eixo; confira as seções.');mutating=true;
      for(const member of group)drawLayer(member.layer);refreshUI();zApply();
    }catch(e){for(const old of before){Object.assign(old.L,{features:old.features,fields:old.fields,_channelLink:old.link,name:old.name});try{drawLayer(old.L);}catch(_){}}throw e;}
    finally{mutating=false;}
    bindings.set(q.recipe.id,q.raster.token);info((q.recipe.options.mode==='axisDepth'?'Faixa por altura MDT':q.recipe.options.mode==='depth'?'Faixa por profundidade MDT':'Calha')+' e seções atualizadas pelo eixo. Confira as margens e salve o projeto.');
  }catch(e){
    if(e.transient||!valid()||busyEditing())attempts.delete(q.recipe.id);
    if(version===epoch&&S.projectId===project&&group.every(memberCurrent)){
      status(group,'stale',e.message||String(e));info('Calha desatualizada: '+(e.message||String(e))+'. O último desenho foi preservado.',true);
    }
  }finally{clearTimeout(timeout);j.controller.abort();j.worker?.terminate();sampler?.close();if(running===j)running=null;schedule();}
}
function scan(){
  timer=null;if(mutating||suspended)return;if(running||busyEditing()){if(groups().length)schedule();return;}
  for(const group of groups()){
    const recipe=group[0].recipe;if(group.some(m=>m.recipe.state==='detached'))continue;
    if(!consistentPair(group)){
      if(recipe.state!=='stale')status(group,'stale','O par de camadas ou a receita do trecho está incompleto/inconsistente. Restaure o vínculo ou gere novamente este trecho.');continue;
    }
    if(group.some(m=>memberSignature(m)!==m.recipe.resultSignature)){
      status(group,'detached','Camada resultante editada manualmente; vínculo pausado para preservar suas alterações.');info('Calha editada manualmente: atualização pelo eixo pausada. Gere outra calha para manter as duas versões.',true);continue;
    }
    let q;try{q=source(group);}catch(e){if(recipe.message!==e.message)status(group,'stale',e.message);continue;}
    if(!changed(q)){
      if(recipe.state==='pending'||recipe.state==='stale')status(group,'ready','Eixo corresponde ao último resultado.');continue;
    }
    if(!editable(group)){if(!permissionNotices.has(recipe.id)){permissionNotices.add(recipe.id);info('Calha pendente: desbloqueie ou reserve as duas camadas resultantes para atualizar. O eixo mudou, mas os resultados bloqueados não foram alterados.',true);}continue;}
    permissionNotices.delete(recipe.id);
    if(rasterChanged(q))for(const member of group)member.recipe.rasterPending=true;
    if(attempts.get(recipe.id)===q.stamp)continue;
    attempts.set(recipe.id,q.stamp);update(group,q);return;
  }
}
function retry(){attempts.clear();for(const r of S.rasters||[])dirtyRaster(r);schedule();info('Verificando as calhas vinculadas. O MDT original precisa estar disponível.');}
// Encadeia os pontos comuns de edição, inclusive vértice, desfazer e reabertura.
const baseDraw=window.drawLayer,baseRefresh=window.refreshUI,baseLoad=window.loadProject,baseRaster=window.renderRaster,baseProjectData=window.projectData;
if(baseDraw)window.drawLayer=function(L){const out=baseDraw.apply(this,arguments);
  if(!mutating&&!suspended)for(const group of groups())if(group[0].recipe.layerId===L?.id&&group.every(m=>m.recipe.state==='ready'))try{
    if(changed(source(group)))status(group,'pending','Eixo/MDT alterado; aguardando concluir o movimento.');
  }catch(_){}schedule();return out;};
if(baseRefresh)window.refreshUI=function(){const out=baseRefresh.apply(this,arguments);schedule();return out;};
if(baseLoad)window.loadProject=function(){stop();const out=baseLoad.apply(this,arguments);schedule();return out;};
if(baseRaster)window.renderRaster=function(r){if(r)dirtyRaster(r);const out=baseRaster.apply(this,arguments);schedule();return out;};
// Uma gravação durante cálculo deve trazer explicitamente a condição pendente.
if(baseProjectData)window.projectData=function(){const data=baseProjectData.apply(this,arguments);
  for(const group of groups())try{if(group.some(m=>m.recipe.state==='detached')||!consistentPair(group))continue;const q=source(group);if(changed(q))for(const member of group){
    if(!editable([member]))continue;const index=(data.layers||[]).findIndex(L=>L.id===member.layer.id);if(index<0)continue;let L=data.layers[index];
    // projectData pode compartilhar metadados/feições com o estado vivo. Só
    // a cópia serializada recebe o aviso; salvar nunca altera o projeto aberto.
    if(L===member.layer){data.layers=data.layers.slice();L={...L};data.layers[index]=L;}
    L._channelLink=clone(L._channelLink);
    const link=member.shared&&L._channelLink?.version===2?L._channelLink.entries?.find(r=>r.id===member.recipe.id):L._channelLink;
    if(!link||link.id!==member.recipe.id)continue;
    link.state='stale';link.message='Eixo/MDT alterado; atualização pendente.';link.rasterPending=rasterChanged(q);
    if(!member.shared&&!L.name.endsWith(STALE))L.name+=STALE;
    L.features=(L.features||[]).map(f=>!member.shared||matchesFeature(f,member.recipe.id)?{...f,props:{...f.props,STATUS:'DESATUALIZADA: atualização pendente.'}}:f);
  }}catch(_){}return data;};
document.addEventListener('pointerdown',()=>{pointer=true;},{capture:true,passive:true});
const released=()=>{pointer=false;schedule();};
document.addEventListener('pointerup',released,{capture:true,passive:true});document.addEventListener('pointercancel',released,{capture:true,passive:true});window.addEventListener('blur',released);
window.GeoMineChannelLive={attach,attachEntry,retry,scan,stop,suspend,signature:resultSignature,matchesFeature,featuresFor,sourceSignature:recipe=>source([{recipe}]).axisStamp,state:()=>({running:!!running,suspended,links:groups().map(group=>({...clone(group[0].recipe),pairId:group[0].shared?group[0].container.id:group[0].recipe.id,layerIds:group.map(m=>m.layer.id)}))})};
})();
