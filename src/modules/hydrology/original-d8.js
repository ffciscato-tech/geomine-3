/* Direção D8 original: a rede importada e a área usam a MESMA grade. O TIFF
   portátil contém todos os códigos nativos, comprimidos em tiles, sem
   reamostrar direções nem carregar a grade inteira na memória do tablet. */
(function(root){
'use strict';
const opened=new WeakMap(),hydrated=new Map(),pending=new Map(),MiB=1048576;
const abort=()=>Object.assign(Error('Consulta da direção original cancelada.'),{name:'AbortError'});
const descriptor=r=>r?.flowDirectionNative||hydrated.get(r)||null;
const sources=()=>S.rasters.filter(r=>{const d=descriptor(r);return d?.version===1&&d.encoding==='grass'&&typeof d.base64==='string';});
const preferred=()=>sources().find(r=>r.id===S.hidro?.directionRasterId)||sources()[0]||null;
// Grades reduzidas servem para desenhar e armazenar água, mas não podem
// substituir o grafo que gerou a rede ao buscar a contribuição do exutório.
function matching(grid,crs=S.workCRS){
  if(!grid||grid._hydrologyEdited)return null;
  const bounds=g=>[g.xll,g.yll,g.xll+g.nc*g.cs,g.yll+g.nr*(g.csy||g.cs)],b=bounds(grid);
  return sources().find(r=>{const d=descriptor(r),tol=Math.max(grid.cs,grid.csy||grid.cs,d.cs,d.csy)*1.1;
    return d.crs===crs&&bounds(d).every((v,i)=>Math.abs(v-b[i])<=tol);})||null;
}
function resolveRainMode(){
  const select=document.getElementById('hLamBacia'),mode=select?.value||'d8';
  if(mode==='d8'&&matching(S.hidro?.dem)){
    refreshRain();if(select)select.value='original-d8';return 'original-d8';
  }
  return mode;
}
function assertAutomaticSource(grid){
  if(!grid||grid._hydrologyEdited||matching(grid))return;
  // Sem a direção que gerou a rede, a prévia do MDT não preserva os ramos.
  const bounds=g=>[g.xll,g.yll,g.xll+g.nc*g.cs,g.yll+g.nr*(g.csy||g.cs)],b=bounds(grid);
  const preview=S.rasters.find(r=>{const d=r.d,dim=d?.srcDims;
    if(!d||r.flowDirectionNative||!(/dire[cç][aã]o.*fluxo|flow.?direction/i.test(r.name||'')||r.quantity==='flow-direction'))return false;
    if(!dim||!(+(dim.width||dim[0])>d.nc||+(dim.height||dim[1])>d.nr))return false;
    const tol=Math.max(d.cs,d.csy||d.cs,grid.cs,grid.csy||grid.cs)*1.1;return bounds(d).every((v,i)=>Math.abs(v-b[i])<=tol);
  });
  const network=S.layers.some(l=>l.visible!==false&&l.gtype==='line'&&/fluxo|drenagem|stream|drainage/i.test(l.name||'')&&
    !(l.fields||[]).some(f=>f.name==='AZIMUTE'));
  if(preview&&network)throw Object.assign(Error('Carregue a direção original da rede para delimitar a bacia completa. A prévia reduzida perde conexões entre os ramos; nenhum resultado parcial foi criado.'),{code:'CATCHMENT_NETWORK_SOURCE_MISSING'});
}
function check(current,signal){if(signal?.aborted||current&&current()===false)throw abort();}
async function ensure(grid,{signal,isCurrent,onProgress,localOnly=false}={}){
  const ready=matching(grid);if(ready||!grid||grid._hydrologyEdited)return ready;
  const candidates=S.rasters.filter(r=>/dire[cç][aã]o.*fluxo|flow.?direction/i.test(r.name||'')||r.quantity==='flow-direction');
  const project=S.projectId,generation=root.GeoMineSessionAutosave?.state?.generation,
    session=root.GeoMineProjectTabSession?.state?.(),record=session?.record,owner=session?.ownerUid||record?.ownerUid||'',
    current=()=>S.projectId===project&&root.GeoMineSessionAutosave?.state?.generation===generation&&(!isCurrent||isCurrent());
  for(const r of candidates){
    const preview=r.d;if(!preview)continue;
    const bounds=g=>[g.xll,g.yll,g.xll+g.nc*g.cs,g.yll+g.nr*(g.csy||g.cs)],tol=Math.max(grid.cs,grid.csy||grid.cs,preview.cs,preview.csy||preview.cs)*1.1;
    if(bounds(preview).some((v,i)=>Math.abs(v-bounds(grid)[i])>tol))continue;
    const key='geomine.d8.original.v1:'+JSON.stringify([owner,project,r.id,r.name,preview.nc,preview.nr,preview.cs,preview.csy,preview.xll,preview.yll]),jobKey=key+':'+generation;
    if(pending.has(jobKey)){await pending.get(jobKey);check(current,signal);if(matching(grid))return matching(grid);continue;}
    const job=(async()=>{
      const accept=async data=>{
        check(current,signal);if(!S.rasters.includes(r)||r.d!==preview)return false;
        if(data?.version!==1||data.encoding!=='grass'||typeof data.base64!=='string'||!(data.byteLength>0&&data.byteLength<=32*MiB))return false;
        const dim=preview.srcDims||r.sig?.srcDims,w=+(dim?.width||dim?.[0]),h=+(dim?.height||dim?.[1]);
        if(w&&w!==data.nc||h&&h!==data.nr)return false;
        const bb=g=>[g.xll,g.yll,g.xll+g.nc*g.cs,g.yll+g.nr*(g.csy||g.cs)],tol=Math.max(1e-6,Math.min(data.cs,data.csy||data.cs)*.25);
        if(data.crs!==(preview.srcCRS||preview.crs||S.workCRS)||bb(data).some((v,i)=>Math.abs(v-bb(preview)[i])>tol))return false;
        hydrated.set(r,data);
        try{await prepare(r);check(current,signal);return true;}catch(e){hydrated.delete(r);throw e;}
      };
      try{
        onProgress?.('Procurando a direção original guardada neste aparelho…');
        if(typeof idbGet==='function'&&await accept(await idbGet(key)))return;
        check(current,signal);
        if(localOnly)return;
        const drive=root.GeoMineDriveProject;if(!drive?.read||!drive.metadata)return;
        let source=record?.projectId===project&&drive.isSource(record.source)?record.source:null;
        if(!source&&drive.find)source=await drive.find({projectId:project,name:record?.name||S.projectFileName||S.auto?.name},signal);
        check(current,signal);if(!source)return;
        onProgress?.('Carregando a direção original do projeto no Google Drive…');
        source=await drive.metadata(source,signal);check(current,signal);
        if(source.size>128*MiB)throw Error('O projeto do Drive excede o limite de leitura automática da direção.');
        const fetched=await drive.read(source,signal);check(current,signal);
        if(fetched.file.size>128*MiB)throw Error('O projeto recebido excede o limite de leitura automática da direção.');
        const data=JSON.parse(await fetched.file.text());check(current,signal);
        if(data.projectId!==project)throw Error('A direção encontrada pertence a outro projeto.');
        const rasters=(data.rasters||[]).filter(o=>o.rid===r.id||o.name===r.name);
        for(const saved of rasters)if(await accept(saved.flowDirectionNative)){
          if(typeof idbSet==='function')try{await idbSet(key,saved.flowDirectionNative);}catch(_){}
          check(current,signal);return;
        }
      }catch(e){if(e.name==='AbortError')throw e;
        if(e.code==='drive/authorization-needed')throw Object.assign(Error('A autorização do Google Drive expirou. Use “Reconectar Drive e continuar” para retomar este ponto.'),{code:'CATCHMENT_DRIVE_RECONNECT'});
        try{cmdLog('Direção original: '+e.message,'avisa');}catch(_){} }
    })();pending.set(jobKey,job);
    try{await job;}finally{if(pending.get(jobKey)===job)pending.delete(jobKey);}
    check(current,signal);if(matching(grid)){refreshRain();return matching(grid);}
  }
  return null;
}
async function prepare(r){
  const data=descriptor(r),old=opened.get(data);if(old)return old;
  const promise=(async()=>{
    if(!(data.byteLength>0&&data.byteLength<=32*MiB))throw Error('A direção portátil excede 32 MiB.');
    const raw=atob(data.base64);if(raw.length!==data.byteLength)throw Error('A direção portátil está incompleta.');
    const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
    if(hash!==data.sha256)throw Error('A direção portátil não corresponde à fonte registrada.');
    const tiff=await GeoTIFF.fromBlob(new Blob([bytes])),image=await tiff.getImage(),bb=image.getBoundingBox(),keys=image.getGeoKeys();
    const cs=(bb[2]-bb[0])/image.getWidth(),csy=(bb[3]-bb[1])/image.getHeight(),tol=Math.max(cs,csy)*1e-5;
    if(image.getWidth()!==data.nc||image.getHeight()!==data.nr||String(keys.ProjectedCSTypeGeoKey)!==String(data.crs).replace('EPSG:','')||
      Math.abs(bb[0]-data.xll)>tol||Math.abs(bb[1]-data.yll)>tol||Math.abs(cs-data.cs)>tol||Math.abs(csy-data.csy)>tol)
      throw Error('A grade da direção portátil não confere com o projeto.');
    GeoMineTileRuntime.prepareImage(image);return {image,data};
  })();opened.set(data,promise);promise.catch(()=>opened.delete(data));return promise;
}
function snap(latlng){
  const original={latlng,point:fromWGS(S.workCRS,latlng.lng,latlng.lat),snap:null};
  if(S.snapOn===false)return original;
  const arrow=l=>/^Direção de fluxo D8/.test(l.name||'')||(l.fields||[]).some(f=>f.name==='AZIMUTE')&&(l.fields||[]).some(f=>f.name==='CELULA');
  let lines=S.layers.filter(l=>l.gtype==='line'&&l.visible!==false&&l.llayer&&map.hasLayer(l.llayer)&&!arrow(l));
  const drain=lines.filter(l=>/fluxo|drenagem|talvegue|calha|valeta|rio|saida|saída/i.test(l.name||''));
  if(drain.length)lines=drain;
  const p=map.latLngToContainerPoint(latlng),other=map.containerPointToLatLng([p.x+10,p.y]),q=fromWGS(S.workCRS,other.lng,other.lat),
    tolerance=Math.hypot(q[0]-original.point[0],q[1]-original.point[1])/10*(typeof SNAP_PX==='number'?SNAP_PX:15)*(S.touch?1.6:1),
    hit=GeoMineCatchmentSnap.nearest(lines,original.point,{tolerance,
      visible:(l,f)=>typeof featureVisible!=='function'||featureVisible(l,f),
      project:(xy,l)=>!l.crs||l.crs===S.workCRS?xy:proj4(l.crs,S.workCRS,xy)});
  if(!hit)return original;
  const ll=toWGS(S.workCRS,...hit.point);return {latlng:L2.latLng(ll[1],ll[0]),point:hit.point,snap:hit};
}
async function query(latlng,{raster=preferred(),signal,isCurrent,onProgress}={}){
  if(!raster)throw Error('O projeto não contém a direção original portátil.');
  const data=descriptor(raster),project=S.projectId,generation=root.GeoMineSessionAutosave?.state?.generation,crs=S.workCRS;
  const current=()=>S.projectId===project&&S.workCRS===crs&&S.rasters.includes(raster)&&descriptor(raster)===data&&
    root.GeoMineSessionAutosave?.state?.generation===generation&&(!isCurrent||isCurrent());
  check(current,signal);const picked=snap(latlng),{image}=await prepare(raster);check(current,signal);
  const p=data.crs===crs?picked.point:proj4(crs,data.crs,picked.point),
    grid={nc:data.nc,nr:data.nr,cs:data.cs,csy:data.csy,xll:data.xll,yll:data.yll,noData:-128,directionEncoding:'grass',
      unitScale:Number(proj4(data.crs).oProj.to_meter||1),isCurrent:current,
      readWindow:async window=>{check(current,signal);const bands=await GeoMineTileRuntime.read(image,{window,samples:[0],signal},{isCurrent:current,priority:'analysis'});check(current,signal);return Float32Array.from(bands[0]);}},
    seed={col:Math.floor((p[0]-grid.xll)/grid.cs),row:Math.floor((grid.yll+grid.nr*grid.csy-p[1])/grid.csy)},
    result=await GeoMinePointCatchmentEngine.analyze(grid,{seed,signal,isCurrent:current,maxMemoryMB:96,decodedCacheMB:12,tileSize:256,onProgress});
  check(current,signal);
  const convert=xy=>data.crs===crs?xy:proj4(data.crs,crs,xy),rings=result.rings.map(ring=>ring.map(convert)),
    exterior=result.ringInfo.map((info,i)=>({...info,index:i})).filter(x=>!x.hole).sort((a,b)=>b.areaM2-a.areaM2)[0];
  return {...result,rings,ring:rings[exterior?.index||0],outlet:convert(result.outlet),raster,
    crs,point:picked.point,snap:picked.snap,snapM:picked.snap?.distance||0,
    fonte:'Direção D8 original · '+raster.name,nome:'Bacia da direção original',method:'GRASS D8 original · busca exclusivamente a montante'};
}
function addCatchment(result){
  const props={AREA_M2:result.areaM2,AREA_HA:result.areaM2/10000,CELULAS:result.cells,
    E_PONTO:result.point[0],N_PONTO:result.point[1],E_CELULA:result.outlet[0],N_CELULA:result.outlet[1],
    AJUSTE_M:result.snapM,FONTE_D8:result.raster.name,METODO:result.method,
    RES_X_M:result.resolution.x,RES_Y_M:result.resolution.y};
  const fields=Object.entries(props).map(([name,v])=>({name,type:typeof v==='number'?'N':'C',length:typeof v==='number'?20:160,decimal:typeof v==='number'?6:0}));
  const previousActive=S.activeId,layer=addLayer({sourceLayer:'R:'+result.raster.id,name:'Área contribuinte — '+fmt(result.areaM2/10000,4)+' ha · D8 original',
    gtype:'polygon',crs:result.crs,features:[{geom:result.rings,multi:true,props}],fields,color:'#328ad6'});
  root.GeoMinePointCatchment.recordOutlet(layer,{point:result.point,areaM2:result.areaM2,cells:result.cells,z:result.seedZ,adjust:result.snapM,sourceLayer:'R:'+result.raster.id,previousActive});
  return layer;
}
async function storageMask(grid,rings,current){
  const mask=new Uint8Array(grid.nc*grid.nr),cy=grid.csy||grid.cs,edges=[];
  for(const ring of rings||[])for(let i=1;i<ring.length;i++){
    const a=ring[i-1],b=ring[i];if(a[1]!==b[1])edges.push([a[0],a[1],b[0],b[1]]);
  }
  if(!edges.length)throw Error('A área contribuinte não possui contorno válido.');
  let north=-Infinity,south=Infinity;for(const e of edges){north=Math.max(north,e[1],e[3]);south=Math.min(south,e[1],e[3]);}
  const top=grid.yll+grid.nr*cy,r0=Math.max(0,Math.ceil((top-north)/cy-.5)),r1=Math.min(grid.nr-1,Math.floor((top-south)/cy-.5));
  for(let row=r0;row<=r1;row++){
    const y=top-(row+.5)*cy,xs=[];
    for(const [x0,y0,x1,y1] of edges)if((y0>y)!==(y1>y))xs.push(x0+(y-y0)*(x1-x0)/(y1-y0));
    xs.sort((a,b)=>a-b);
    for(let i=0;i+1<xs.length;i+=2){
      const a=Math.max(0,Math.ceil((xs[i]-grid.xll)/grid.cs-.5)),b=Math.min(grid.nc,Math.ceil((xs[i+1]-grid.xll)/grid.cs-.5));
      if(b>a)mask.fill(1,row*grid.nc+a,row*grid.nc+b);
    }
    if((row&31)===0){await new Promise(r=>setTimeout(r,0));check(current);}
  }
  check(current);return mask;
}
function refreshRain(){
  const select=document.getElementById('hLamBacia');if(!select)return;
  let limit=document.getElementById('hLamUpstreamOnly');
  if(!limit){
    const box=document.createElement('label');box.style.cssText='display:block;margin:8px 0;font-size:12px';
    limit=document.createElement('input');limit.type='checkbox';limit.id='hLamUpstreamOnly';
    box.append(limit,document.createTextNode(' Limitar a mancha à bacia contribuinte, a montante do exutório'));
    select.closest('.row2').after(box);limit.onchange=()=>{S.hidro.rainUpstreamOnly=limit.checked;};
  }
  limit.checked=S.hidro.rainUpstreamOnly!==false;
  let option=[...select.options].find(o=>o.value==='original-d8');
  if(sources().length){
    if(!option){option=new Option('Direção original da rede — área a montante','original-d8');select.prepend(option);}
    if(select.value==='d8'&&(!S.hidro?.dem||matching(S.hidro.dem)))select.value='original-d8';
  }else if(option){if(select.value==='original-d8')select.value='d8';option.remove();}
  const legacy=[...select.options].find(o=>o.value==='d8'),useOriginal=!!matching(S.hidro?.dem);
  if(legacy){legacy.hidden=useOriginal;legacy.disabled=useOriginal;}
  const status=document.getElementById('hLamD8Status');
  if(select.value==='original-d8'&&status)status.textContent='Usa a direção original e mantém o exutório na linha escolhida. A grade de visualização não altera a área contribuinte.';
}
function clearReconnect(anchor){document.getElementById('gmDriveResume-'+anchor)?.remove();}
function offerReconnect(error,{anchor,target,retry,isCurrent}){
  if(error?.code!=='CATCHMENT_DRIVE_RECONNECT')return false;
  const id=anchor?.id||target?.id||'catchment';clearReconnect(id);
  const box=document.createElement('div');box.id='gmDriveResume-'+id;box.dataset.gmDriveResume='true';box.style.cssText='padding:10px;margin:8px 0;border:1px solid var(--amber);border-radius:7px';
  const text=document.createElement('div'),button=document.createElement('button'),cancel=document.createElement('button');
  text.textContent='A sessão do Google Drive expirou. Reconecte para carregar a direção original e continuar no mesmo ponto. Suas edições ficam preservadas.';
  text.style.cssText='font-size:12px;margin-bottom:8px';button.type=cancel.type='button';button.className=cancel.className='tbtn';
  button.textContent='Reconectar Drive e continuar';button.style.cssText='width:100%;justify-content:center;background:var(--amber);color:#1a1206';cancel.textContent='Cancelar';
  cancel.onclick=()=>box.remove();button.onclick=async()=>{
    button.disabled=true;
    try{
      if(!isCurrent())throw abort();
      if(!root.GeoMineCloudProvider?.driveAccess)throw Error('Entre na sua conta Google do GeoMine para conectar o Drive.');
      await root.GeoMineCloudProvider.driveAccess(true);
      if(!box.isConnected||!isCurrent())throw abort();
      box.remove();await retry();
    }catch(e){text.textContent=e.name==='AbortError'?'O projeto ou o modelo mudou. Marque novamente o ponto desejado.':e.message;button.disabled=!box.isConnected||!isCurrent();}
  };
  box.append(text,button,cancel);if(anchor)anchor.after(box);else target.append(box);return true;
}
root.GeoMineOriginalD8={sources,preferred,descriptor,matching,ensure,resolveRainMode,assertAutomaticSource,prepare,snap,query,addCatchment,storageMask,refreshRain,clearReconnect,offerReconnect};
const load=root.loadProject;if(typeof load==='function')root.loadProject=function(){document.querySelectorAll('[data-gm-drive-resume]').forEach(el=>el.remove());hydrated.clear();const result=load.apply(this,arguments);refreshRain();return result;};
const select=document.getElementById('hLamBacia');select?.addEventListener('change',refreshRain);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refreshRain,{once:true});else refreshRain();
})(window);
