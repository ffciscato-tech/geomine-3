/* Atomic destinations for native flood simulations. Private per-feature tags
   survive project saves; clearing never relies on a layer's display name. */
(function(root){
'use strict';
const tag='_nativeFlood',clone=x=>structuredClone(x),uid=()=>crypto.randomUUID(),pause=()=>new Promise(r=>setTimeout(r,0));
const abort=()=>Object.assign(new Error('O projeto ou a camada de destino mudou.'),{name:'AbortError'});
const generation=()=>root.GeoMineSessionAutosave?.state?.generation;
const editable=L=>!!L&&!L.locked&&!L._geology&&!L.cavaDesign&&!L.tinSurface&&!L._cava2DesignId&&!L._rb31Recipe&&!L._channelLink&&!L._civilDesignId&&
  (typeof collabCanEditLayer!=='function'||collabCanEditLayer(L,false));
const stamp=L=>JSON.stringify([L.gtype,L.crs,L.features,L.fields]);
const snap=L=>({L,features:L.features,fields:L.fields});
const seeds=new Map();
function capture(value='new',dissolve=false){
  const target=value==='new'?null:(S.layers||[]).find(L=>'layer:'+L.id===value);
  if(value!=='new'&&(!target||target.gtype!=='polygon'||!editable(target)))throw Error('Escolha uma camada de polígonos desbloqueada e editável.');
  const cached=target&&seeds.get(target.id),seed=target&&(S.layers.includes(cached)&&editable(cached)?cached:S.layers.find(L=>L.gtype==='point'&&editable(L)&&L.features.some(f=>f[tag]?.kind==='seed'&&f[tag].targetId===target.id)));
  return {project:S.projectId,generation:generation(),workCRS:S.workCRS,source:(S.rasters||[]).find(r=>String(r.id)===String(S.hidro?.sourceRasterId)),target,seed:seed||null,dissolve:!!target&&!!dissolve,
    targets:[target,seed].filter(Boolean).map(L=>({L,features:L.features,fields:L.fields,crs:L.crs,rev:L._rev,stamp:stamp(L)}))};
}
function current(q,deep=false){
  return q.project===S.projectId&&q.generation===generation()&&q.workCRS===S.workCRS&&q.targets.every(v=>
    S.layers.includes(v.L)&&editable(v.L)&&v.L.features===v.features&&v.L.fields===v.fields&&v.L.crs===v.crs&&v.L._rev===v.rev&&(!deep||stamp(v.L)===v.stamp));
}
function schema(old,added){
  const fields=clone(old||[]),known=new Map(fields.map(f=>[f.name,f]));
  for(const f of added){const previous=known.get(f.name);if(previous&&previous.type!==f.type)throw Error('Campo “'+f.name+'” tem tipo diferente na camada de destino. Escolha outra camada.');if(!previous){fields.push(clone(f));known.set(f.name,f);}}
  return fields;
}
function converter(from,to){
  if(!from||!to)throw Error('Defina o CRS da origem e da camada de destino.');
  let c;try{c=root.proj4(from,to);}catch(_){throw Error('Não foi possível converter o CRS da camada de destino.');}
  return p=>{if(!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1]))throw Error('Geometria com coordenada inválida.');
    let xy;try{xy=from===to?p.slice(0,2):c.forward(p.slice(0,2));}catch(_){throw Error('Falha na reprojeção da geometria.');}
    if(!xy.every(Number.isFinite))throw Error('A reprojeção produziu coordenadas inválidas.');return [...xy,...p.slice(2)];};
}
async function project(features,from,to,check){
  const convert=converter(from,to),out=[];let count=0;
  for(const f of features){
    const visit=async g=>{if(!Array.isArray(g))throw Error('Geometria inválida.');if(typeof g[0]==='number'){if(++count%2048===0){check();await pause();check();}return convert(g);}
      const arr=[];for(const child of g)arr.push(await visit(child));return arr;};
    out.push({...f,geom:await visit(f.geom),props:clone(f.props||{})});
  }return out;
}
function unionEngine(){
  const pc=polygonClipping,box=mp=>{const b=[Infinity,Infinity,-Infinity,-Infinity];for(const poly of mp)for(const r of poly)for(const p of r){b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]);}return b;},overlap=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
  const union=list=>{if(!list.length)return [];while(list.length>1){const next=[];for(let i=0;i<list.length;i+=32)next.push(pc.union(...list.slice(i,i+32)));list=next;}return list[0];};
  const rings=f=>f.multi&&Array.isArray(f.geom?.[0]?.[0])?f.geom:[f.geom];
  const polygon=f=>{const rs=rings(f).map(raw=>{if(!raw||raw.length<3)throw Error('Polígono inválido para dissolução.');const r=raw.map(p=>p.slice(0,2)),a=r[0],z=r[r.length-1];if(a[0]!==z[0]||a[1]!==z[1])r.push(a.slice());return r;});let level=rs.map(r=>[[r]]);while(level.length>1){const next=[];for(let i=0;i<level.length;i+=32)next.push(pc.xor(...level.slice(i,i+32)));level=next;}return level[0]||[];};
  return ({old,fresh})=>{
    const originals=old.map(polygon),added=fresh.map(polygon),boxes=originals.map(box);let merged=union(added),pending=originals.map((_,i)=>i),affected=[];
    let grew=true;while(grew){grew=false;const bb=box(merged),next=[];for(const i of pending){if(overlap(bb,boxes[i])){const joined=pc.union(merged,originals[i]);if(pc.intersection(merged,originals[i]).length||joined.length<merged.length+originals[i].length){merged=joined;affected.push(i);grew=true;continue;}}next.push(i);}pending=next;}
    const all=[...originals,...added],allBoxes=all.map(box);
    const parts=merged.map(poly=>{const bb=box([poly]),contributors=[];for(let i=0;i<all.length;i++)if(overlap(bb,allBoxes[i])&&pc.intersection([poly],all[i]).length)contributors.push(i);return {rings:poly,contributors};});
    return {affected,parts};
  };
}
async function dissolve(old,fresh,signal,check){
  if(typeof root.Worker!=='function')throw Error('A dissolução requer um navegador com suporte a Workers.');
  const vendor=document.getElementById('geomine-polygon-clipping')?.textContent;if(!vendor)throw Error('Biblioteca offline de dissolução indisponível.');
  const url=URL.createObjectURL(new Blob([vendor+'\nconst calculate=('+unionEngine.toString()+')();onmessage=e=>{try{postMessage({result:calculate(e.data)})}catch(e){postMessage({error:e.message||String(e)})}};'],{type:'text/javascript'}));
  let worker,timer,stop;
  try{
    worker=new root.Worker(url);URL.revokeObjectURL(url);
    return await new Promise((resolve,reject)=>{
      stop=()=>{worker.terminate();reject(abort());};signal?.addEventListener('abort',stop,{once:true});
      timer=setInterval(()=>{try{check();}catch(e){worker.terminate();reject(e);}},150);
      worker.onmessage=e=>e.data.error?reject(Error(e.data.error)):resolve(e.data.result);
      worker.onerror=e=>reject(Error(e.message||'Falha na dissolução.'));worker.onmessageerror=()=>reject(Error('Não foi possível receber a geometria dissolvida.'));
      check();if(signal?.aborted){stop();return;}worker.postMessage({old,fresh});
    });
  }finally{signal?.removeEventListener('abort',stop);clearInterval(timer);worker?.terminate();URL.revokeObjectURL(url);}
}
function area(rings){let a=0;for(let k=0;k<rings.length;k++){const r=rings[k],o=r[0];let s=0;for(let i=1;i<r.length;i++)s+=(r[i-1][0]-o[0])*(r[i][1]-o[1])-(r[i][0]-o[0])*(r[i-1][1]-o[1]);a+=(k?-1:1)*Math.abs(s/2);}return a;}
const hydraulic=new Set(['COTA_M','VOLUME_M3','PROF_MED_M','CELULAS','RES_X_M','RES_Y_M','FONTE_MDT','BARRAMENTO']);
function restoredFeatures(L){
  const out=L.features.filter(f=>f[tag]?.version!==1),entries=new Map();
  for(const f of L.features)for(const e of f[tag]?.restore||[])if(!entries.has(e.id))entries.set(e.id,e);
  for(const e of [...entries.values()].sort((a,b)=>a.index-b.index)){
    const f=clone(e.feature),convert=converter(e.crs||L.crs,L.crs);
    const transform=g=>{if(!Array.isArray(g))throw Error('Backup de inundação inválido.');return typeof g[0]==='number'?convert(g):g.map(transform);};
    f.geom=transform(f.geom);out.splice(Math.min(e.index,out.length),0,f);
  }return out;
}
async function stage(q,{features,fields,crs,seed=null,seedFields=[]},{signal,check:external=()=>{},onProgress=()=>{}}={}){
  const check=()=>{if(signal?.aborted||!current(q))throw abort();external();};check();
  const runId=uid(),to=q.target?.crs||crs,fieldsOut=schema(q.target?.fields,fields),seedFieldsOut=seed?schema(q.seed?.fields,seedFields):null;
  let outputs=await project(features,crs,to,check),next=(q.target?.features||[]).concat(outputs);
  outputs.forEach(f=>{f[tag]={version:1,kind:'result',runId};});
  if(q.dissolve){
    onProgress('Dissolvendo com as feições existentes…');
    const calcCRS=crs,projection=root.proj4(calcCRS).oProj,metres=Number(projection.to_meter??1);
    if(projection.projName==='longlat'||!(metres>0&&Number.isFinite(metres)))throw Error('A dissolução requer um CRS projetado para calcular a área em metros quadrados.');
    const projectedOld=await project(q.target.features,to,calcCRS,check),projectedNew=await project(outputs,to,calcCRS,check),merged=await dissolve(projectedOld,projectedNew,signal,check);check();
    const affected=new Set(merged.affected),restoreByFeature=new Map();
    for(const i of merged.affected){const f=q.target.features[i],meta=f[tag];
      if(meta)restoreByFeature.set(i,(meta.restore||[]).map(entry=>clone(entry)));
      else{const id=uid();restoreByFeature.set(i,[{id,index:i,crs:to,feature:clone(f)}]);}}
    const all=[...q.target.features,...outputs],joined=merged.parts.map((part,index)=>{
      const props={},contributors=part.contributors.map(i=>all[i]);
      for(const field of fieldsOut){const values=contributors.map(f=>f.props?.[field.name]??null);props[field.name]=values.length&&values.every(v=>JSON.stringify(v)===JSON.stringify(values[0]))?clone(values[0]):null;}
      for(const name of hydraulic)if(name in props)props[name]=null;
      props.AREA_M2=area(part.rings)*metres*metres;props.AREA_HA=props.AREA_M2/1e4;
      const restore=new Map();for(const i of part.contributors)for(const entry of restoreByFeature.get(i)||[])restore.set(entry.id,entry);
      return {geom:part.rings,multi:true,props,[tag]:{version:1,kind:'dissolved',runId,restore:[...restore.values()]}};
    });
    outputs=await project(joined,calcCRS,to,check);next=q.target.features.filter((_,i)=>!affected.has(i)).concat(outputs);
  }
  for(const f of outputs)for(const field of fieldsOut)if(!(field.name in f.props))f.props[field.name]=null;
  let seedOut=null;if(seed){seedOut=(await project([seed],crs,q.seed?.crs||crs,check))[0];seedOut[tag]={version:1,kind:'seed',runId};for(const field of seedFieldsOut)if(!(field.name in seedOut.props))seedOut.props[field.name]=null;}
  check();if(!current(q,true))throw abort();return {features:next,outputs,fields:fieldsOut,crs:to,seed:seedOut,seedFields:seedFieldsOut,seedCRS:q.seed?.crs||crs,runId,dissolved:q.dissolve};
}
function redraw(layers,before=[]){
  if(layers.some(L=>S._vtxCtx?.L===L)&&typeof clearVertices==='function')clearVertices();
  if(typeof ED!=='undefined'&&layers.some(L=>ED.sel?.L===L)&&ED.sel&&(!S.layers.includes(ED.sel.L)||!ED.sel.L.features.includes(ED.sel.f))){ED.drag=null;ED.pend=null;ED.vi=-1;ED.ring=0;if(typeof edLigar==='function')edLigar(false);ED.sel=null;}
  if(S.selFeat&&layers.some(L=>S.selFeat.layer===L||S.selFeat.layerId===L.id))S.selFeat=null;
  for(const L of layers)if(S.layers.includes(L)){
    const previous=before.find(v=>v.L===L);
    drawLayer(L,previous?{appendFrom:previous.features.length,previousFeatures:previous.features}:undefined);
  }
  refreshUI();if(typeof zApply==='function')zApply();
}
function transaction(changes,make,active){
  const before=changes.map(v=>snap(v.L)),layersBefore=S.layers.slice(),stackBefore=S.stack?.slice(),undoBefore=S.undo.slice(),activeBefore=S.activeId;let added=[];
  try{
    for(const v of changes){v.L.features=v.features;v.L.fields=v.fields;}
    added=make?make():[];const layers=[...changes.map(v=>v.L),...added];if(active)S.activeId=active.id;redraw(layers,before);
    const action={t:'floodresult',project:S.projectId,layers,before,added,after:layers.map(stamp),active:activeBefore};undoPush(action);return action;
  }catch(error){
    for(const v of before){v.L.features=v.features;v.L.fields=v.fields;}
    for(const L of S.layers)if(!layersBefore.includes(L)&&L.llayer)try{map.removeLayer(L.llayer);}catch(_){}
    S.layers=layersBefore;if(stackBefore)S.stack=stackBefore;S.undo=undoBefore;S.activeId=activeBefore;try{redraw(before.map(v=>v.L));}catch(_){}throw error;
  }
}
function commit(q,staged){
  if(!current(q,true))throw abort();let target=q.target,seed=q.seed;
  const changes=[];if(target)changes.push({L:target,features:staged.features,fields:staged.fields});
  if(staged.seed&&seed)changes.push({L:seed,features:seed.features.concat([staged.seed]),fields:staged.seedFields});
  const action=transaction(changes,()=>{
    const added=[];
    if(!target){let name='Inundação',n=2;while(S.layers.some(L=>L.name===name))name='Inundação ('+(n++)+')';target=addLayer({sourceLayer:q.source,name,gtype:'polygon',crs:staged.crs,features:staged.features,fields:staged.fields,color:'#1565c0'});if(!target)throw Error('Não foi possível criar a camada de inundação.');added.push(target);target.fill=.35;if(target.sym)target.sym.fill=.35;}
    for(const f of staged.outputs)f[tag].targetId=target.id;
    if(staged.seed){staged.seed[tag].targetId=target.id;if(!seed){seed=addLayer({sourceLayer:target,name:'Pontos de inundação — '+target.name,gtype:'point',crs:staged.seedCRS,features:[staged.seed],fields:staged.seedFields,color:'#e53935'});if(!seed)throw Error('Não foi possível registrar o ponto de partida.');added.push(seed);}}
    S.activeId=target.id;return added;
  },target);
  if(seed)seeds.set(target.id,seed);return {target,seed,action};
}
function undo(action){
  if(action.project!==S.projectId||action.layers.some((L,i)=>!S.layers.includes(L)||!editable(L)||stamp(L)!==action.after[i])){toast('Não foi possível desfazer: uma camada foi alterada ou bloqueada.');return false;}
  const present=action.layers.map(snap),layersBefore=S.layers.slice(),stack=S.stack?.slice(),active=S.activeId;
  try{
    for(const v of action.before){v.L.features=v.features;v.L.fields=v.fields;}
    for(const L of action.added)if(L.llayer)map.removeLayer(L.llayer);
    S.layers=S.layers.filter(L=>!action.added.includes(L));if(S.stack)S.stack=S.stack.filter(k=>!action.added.some(L=>k==='L:'+L.id));
    S.activeId=S.layers.some(L=>L.id===action.active)?action.active:S.layers[0]?.id??null;redraw(action.layers);S.undo.pop();toast('Operação de inundação desfeita.');return true;
  }catch(error){for(const v of present){v.L.features=v.features;v.L.fields=v.fields;}S.layers=layersBefore;if(stack)S.stack=stack;S.activeId=active;try{redraw(action.layers);}catch(_){}toast('Não foi possível desfazer; os dados foram preservados.');return false;}
}
function clear(){
  const layers=S.layers.filter(L=>L.features.some(f=>f[tag]?.version===1));
  if(!layers.length){toast('Nenhum resultado desta simulação para limpar. Camadas anteriores foram preservadas.');return false;}
  if(layers.some(L=>!editable(L))){toast('Desbloqueie as camadas de inundação antes de limpar os resultados.');return false;}
  transaction(layers.map(L=>({L,features:restoredFeatures(L),fields:L.fields})),null,null);toast('Resultados removidos; feições anteriores preservadas. Ctrl+Z desfaz.');return true;
}
root.GeoMineNativeFloodDestination={editable,capture,current,stage,commit,undo,clear};
})(window);
