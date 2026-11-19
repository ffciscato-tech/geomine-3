/* Shared model choice and reusable D8 for outlet and rain queries. A derived
   accumulation or a sparse arrow display is never mistaken for receivers. */
(function(root){
'use strict';
const jobs=new Map(),proof=new WeakMap(),restoring=new WeakMap(),MAX_CELLS=8*1024*1024;
const $=id=>document.getElementById(id),abort=()=>Object.assign(Error('Consulta cancelada: o modelo ou o projeto mudou.'),{name:'AbortError'});
const name=r=>String(r.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const models=()=>S.rasters.filter(r=>root.GeoMineChannelDEM.isElevation(r)&&!(/^(direcao (?:de )?fluxo|acumulacao (?:de )?fluxo|flow direction|flow accumulation|declividade|hillshade|sombreado)\b/.test(name(r))));
const geometry=d=>[d.nc,d.nr,d.cs,d.csy||d.cs,d.xll,d.yll,S.workCRS];
const same=(a,b)=>JSON.stringify(geometry(a))===JSON.stringify(geometry(b));
function selected(){return models().find(r=>String(r.id)===$('hLamModel')?.value)||models().find(r=>r.id===S.hidro.sourceRasterId)||models()[0]||null;}
function grid(r){return r&&S.hidro.sourceRasterId===r.id&&S.hidro.dem?.z?S.hidro.dem:r?.d;}
function bind(r){
  if(!r||!models().includes(r))throw Error('Escolha o modelo de elevação.');
  const d=grid(r);S.hidro.sourceRasterId=r.id;S.hidro.dem=d;S.hidro.demName=r.name;
  if($('hLamModel'))$('hLamModel').value=String(r.id);return d;
}
let context='';
function refresh(){
  const s=$('hLamModel');if(!s)return;const key=S.projectId+'|'+root.GeoMineSessionAutosave?.state?.generation,
    previous=key===context?s.value:String(S.hidro.sourceRasterId??'');context=key;
  const list=models(),r=list.find(r=>String(r.id)===previous)||list.find(r=>r.id===S.hidro.sourceRasterId)||list[0];
  s.replaceChildren(new Option('— escolha o modelo de elevação —',''),...list.map(r=>new Option(r.name,String(r.id))));s.value=r?String(r.id):'';
  if(r){bind(r);const token=context;void cached(r,{isCurrent:()=>context===token&&selected()===r}).then(()=>{
    if(context===token&&selected()===r){root.GeoMineOriginalD8?.refreshRain();try{laminaD8Status();}catch(_){}}
  }).catch(()=>{});}root.GeoMineOriginalD8?.refreshRain();
}
async function hash(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function identity(r,d){
  const values=d.z instanceof Float32Array?d.z:Float32Array.from(d.z),bytes=new Uint8Array(values.buffer,values.byteOffset,values.byteLength);
  return hash(new TextEncoder().encode(JSON.stringify([r.id,geometry(d),r.originalSource?.fingerprint||null,await hash(bytes)])));
}
function cacheKey(r,fp){const s=root.GeoMineProjectTabSession?.state?.();return 'geomine.d8.receivers.v1:'+JSON.stringify([s?.ownerUid||'',S.projectId,r.id,fp]);}
async function pack(bytes){
  const compressed=typeof CompressionStream==='function',buffer=compressed?await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer():bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),b=new Uint8Array(buffer);
  let text='';for(let i=0;i<b.length;i+=32768)text+=String.fromCharCode(...b.subarray(i,i+32768));
  return {codec:compressed?'gzip':'raw',base64:btoa(text),bytes:bytes.byteLength,sha256:await hash(bytes)};
}
async function unpack(p,expected){
  if(!p||p.bytes!==expected||p.base64.length>48*1024*1024)throw Error('Cache D8 incompleto.');
  const raw=atob(p.base64),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  let decoded=bytes;
  if(p.codec==='gzip'){
    decoded=new Uint8Array(expected);const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();let at=0;
    try{for(;;){const part=await reader.read();if(part.done)break;if(at+part.value.length>expected)throw Error('Cache D8 excede o tamanho da grade.');decoded.set(part.value,at);at+=part.value.length;}
      if(at!==expected)throw Error('Cache D8 incompleto.');
    }finally{try{await reader.cancel();}catch(_){}}
  }
  if(decoded.byteLength!==expected||await hash(decoded)!==p.sha256)throw Error('Cache D8 alterado.');return decoded;
}
const dirs=[[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1],[0,1],[1,1],[1,0]],code=new Map(dirs.map((xy,i)=>[xy.join(','),i+1]));
const valid=d=>d?.dir?.length===d.nc*d.nr;
async function store(d,r=models().find(r=>r.id===S.hidro.sourceRasterId)){
  if(!r||!valid(d)||d.nc*d.nr>MAX_CELLS)return null;
  const project=S.projectId,generation=root.GeoMineSessionAutosave?.state?.generation,dir=d.dir,fp=await identity(r,d),N=d.nc*d.nr,b=new Uint8Array(N);
  for(let i=0;i<N;i++){
    if(!Number.isFinite(d.z[i])){b[i]=128;continue;}
    const k=dir[i];if(k<0){b[i]=0;continue;}
    const v=code.get([k%d.nc-i%d.nc,Math.floor(k/d.nc)-Math.floor(i/d.nc)].join(','));
    if(!v)throw Error('A direção D8 não aponta para uma célula vizinha.');b[i]=v;
  }
  const record={version:1,modelId:r.id,fingerprint:fp,geometry:geometry(d),filled:!!d.zf||!!d._d8Prepared,raw:d._bruto===true,
    direction:await pack(b),accumulation:d.acc?.length===N?await pack(new Uint8Array(Float32Array.from(d.acc).buffer)):null};
  if(S.projectId!==project||root.GeoMineSessionAutosave?.state?.generation!==generation||d.dir!==dir)return null;
  const attach=same(r.d,d)&&await identity(r,r.d)===fp;
  if(S.projectId!==project||root.GeoMineSessionAutosave?.state?.generation!==generation||d.dir!==dir||!S.rasters.includes(r))return null;
  proof.set(d,{dir,fp,record});if(attach)r.hydroRouting=record;
  if(typeof idbSet==='function')try{await idbSet(cacheKey(r,fp),record);}catch(_){}return record;
}
async function restoreRecord(r,d,fp,current){
  const key=cacheKey(r,fp),records=[r.hydroRouting];
  if(typeof idbGet==='function')try{records.push(await idbGet(key));}catch(_){}
  for(const record of records){
    if(!record||record.version!==1||record.modelId!==r.id||record.fingerprint!==fp||JSON.stringify(record.geometry)!==JSON.stringify(geometry(d)))continue;
    if(d._bruto!==undefined&&record.raw!==(d._bruto===true))continue;
    try{
      const bytes=await unpack(record.direction,d.nc*d.nr),receivers=new Int32Array(bytes.length).fill(-1);
      for(let i=0;i<bytes.length;i++){const v=bytes[i];if(v===0||v===128)continue;if(v<1||v>8)throw Error('Código inválido no cache D8.');
        const [dx,dy]=dirs[v-1],x=i%d.nc+dx,y=Math.floor(i/d.nc)+dy;if(x<0||x>=d.nc||y<0||y>=d.nr)throw Error('Direção fora da grade D8.');receivers[i]=y*d.nc+x;}
      const acc=record.accumulation?await unpack(record.accumulation,bytes.length*4):null;
      if(!current())throw abort();d.dir=receivers;if(acc)d.acc=new Float32Array(acc.buffer,acc.byteOffset,acc.byteLength/4);
      d._d8Prepared=record.filled;d._bruto=record.raw;proof.set(d,{dir:d.dir,fp,record});if(d===r.d)r.hydroRouting=record;return true;
    }catch(e){if(e.name==='AbortError')throw e;}
  }
  return false;
}
async function restore(r,d,fp,current){
  const existing=restoring.get(d);if(existing?.fp===fp){const result=await existing.promise;if(!current())throw abort();return result;}
  const promise=restoreRecord(r,d,fp,current),item={fp,promise};restoring.set(d,item);
  try{return await promise;}finally{if(restoring.get(d)===item)restoring.delete(d);}
}
function original(r,d){
  if(d._bruto===true)return null;
  const native=root.GeoMineOriginalD8?.matching(d);if(!native)return null;
  const declared=root.GeoMineOriginalD8.descriptor(native)?.modelRasterId;
  if(declared!=null)return String(declared)===String(r.id)?native:null;
  // Equal footprints alone cannot associate a direction with two different DEMs.
  const peers=models().filter(m=>root.GeoMineOriginalD8.matching(m.d)===native);return peers.length===1?native:null;
}
function importedPending(d){
  const bounds=g=>[g.xll,g.yll,g.xll+g.nc*g.cs,g.yll+g.nr*(g.csy||g.cs)],b=bounds(d);
  return S.rasters.some(r=>{const g=r.d;if(!g||!/^direcao (?:de )?fluxo|flow direction/.test(name(r)))return false;
    const tol=Math.max(d.cs,d.csy||d.cs,g.cs,g.csy||g.cs)*1.1;return bounds(g).every((v,i)=>Math.abs(v-b[i])<=tol);});
}
async function cached(r,{isCurrent=()=>true}={}){
  const d=grid(r);if(!d?.z)return null;const native=original(r,d);if(native)return {kind:'original',raster:native,model:r,d,reused:true};
  const fp=await identity(r,d);if(!isCurrent())throw abort();const p=proof.get(d);
  if(valid(d)&&(!p||p.dir!==d.dir||p.fp===fp)){proof.set(d,{dir:d.dir,fp,record:p?.dir===d.dir&&p?.fp===fp?p.record:null});return {kind:'grid',model:r,d,reused:true};}
  if(p&&p.fp!==fp){delete d.dir;delete d.acc;delete d.zf;delete d._d8Prepared;}
  if(await restore(r,d,fp,isCurrent))return {kind:'grid',model:r,d,reused:true,fromCache:true};return null;
}
async function prepare(r,{signal,isCurrent=()=>true,onStatus,allowCalculate=true}={}){
  const d=grid(r),project=S.projectId,generation=root.GeoMineSessionAutosave?.state?.generation,
    current=()=>!signal?.aborted&&S.projectId===project&&root.GeoMineSessionAutosave?.state?.generation===generation&&S.rasters.includes(r)&&grid(r)===d&&isCurrent();
  const check=()=>{if(!current())throw abort();};check();
  let ready=await cached(r,{isCurrent:current});check();if(ready){if(ready.kind==='grid'&&!proof.get(d)?.record)await store(d,r);check();return ready;}
  onStatus?.('Procurando o D8 já calculado para '+r.name+'…');
  await root.GeoMineOriginalD8?.ensure(d,{signal,isCurrent:current,onProgress:onStatus,localOnly:true});check();
  const native=original(r,d);if(native)return {kind:'original',raster:native,model:r,d,reused:true};
  if(!allowCalculate)return null;
  const key=S.projectId+':'+r.id+':'+generation;
  if(jobs.has(key)){await jobs.get(key);check();return {kind:'grid',model:r,d,reused:true};}
  const job=(async()=>{
    if(!d.zf&&d._bruto!==true){onStatus?.('Preparando automaticamente o MDT '+r.name+'…');await fillSinksAsync(d,0,.5);check();}
    if(!valid(d)){onStatus?.('Calculando o D8 de '+r.name+'…');await d8dirAsync(d,.5,1);check();}
    await store(d,r);check();
  })();jobs.set(key,job);
  try{await job;}finally{if(jobs.get(key)===job)jobs.delete(key);}return {kind:'grid',model:r,d,reused:false};
}
async function query(r,latlng,options={}){
  const ready=await prepare(r,options),d=ready.d;
  if(ready.kind==='original')return {...await root.GeoMineOriginalD8.query(latlng,{...options,raster:ready.raster}),model:r,reusedD8:true};
  const dir=d.dir,project=S.projectId,generation=root.GeoMineSessionAutosave?.state?.generation,
    current=()=>S.projectId===project&&root.GeoMineSessionAutosave?.state?.generation===generation&&grid(r)===d&&d.dir===dir&&(!options.isCurrent||options.isCurrent());
  const picked=root.GeoMineOriginalD8.snap(latlng),p=picked.point,cs=d.cs,csy=d.csy||cs;
  let network=null;
  if(picked.snap?.layer&&models().filter(m=>same(m.d,r.d)).length===1&&!d._hydrologyEdited){
    const layer=picked.snap.layer,fields=new Set((layer.fields||[]).map(f=>f.name)),directed=fields.has('ACUM_MAX')||['fid','cat','value'].every(f=>fields.has(f));
    if(directed&&/fluxo|drenagem|stream|drainage/.test(name(layer))){
      const parts=layer.features.flatMap(f=>f.multi||Array.isArray(f.geom?.[0]?.[0])?f.geom:[f.geom]).filter(g=>g?.length>1)
        .map(g=>g.map(xy=>!layer.crs||layer.crs===S.workCRS?xy:proj4(layer.crs,S.workCRS,xy)));
      network=root.GeoMineDrainageRouting?.upstream(d,parts,p);
    }
  }
  const source={nc:d.nc,nr:d.nr,cs,csy,xll:d.xll,yll:d.yll,noData:-128,directionEncoding:'grass',unitScale:1,isCurrent:current,
    readWindow:async([a,b,c,e])=>{const out=new Float32Array((c-a)*(e-b));for(let y=b;y<e;y++)for(let x=a;x<c;x++){
      const i=y*d.nc+x,k=dir[i];out[(y-b)*(c-a)+x-a]=!Number.isFinite(d.z[i])?-128:k<0?0:code.get([k%d.nc-x,Math.floor(k/d.nc)-y].join(','))||0;
    }return out;}};
  const result=await root.GeoMinePointCatchmentEngine.analyze(source,{seed:{col:Math.floor((p[0]-d.xll)/cs),row:Math.floor((d.yll+d.nr*csy-p[1])/csy)},
    signal:options.signal,isCurrent:current,seeds:network?.seeds,blockedCells:network?.blocked,maxMemoryMB:96,decodedCacheMB:12,tileSize:256,onProgress:options.onProgress});
  const outer=result.ringInfo.map((info,i)=>({...info,i})).filter(x=>!x.hole).sort((a,b)=>b.areaM2-a.areaM2)[0];
  return {...result,ring:result.rings[outer?.i||0],raster:r,model:r,crs:S.workCRS,point:p,snap:picked.snap,snapM:picked.snap?.distance||0,
    fonte:'D8 local'+(network?' + rede dirigida':'')+' · '+r.name,nome:'Bacia de '+r.name,method:'D8 local'+(network?' e rede dirigida a montante':'')+' · sem acesso ao Drive',reusedD8:ready.reused};
}
root.GeoMineHydrologyAuto={models,selected,grid,bind,refresh,cached,prepare,query,store};
const input=$('hLamModel');if(input)input.onchange=()=>{const r=selected();if(r)bind(r);root.GeoMineOriginalD8?.refreshRain();try{laminaD8Status();}catch(_){} };
const load=root.loadProject;root.loadProject=function(){const result=load.apply(this,arguments);context='';refresh();return result;};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});else refresh();
})(window);
