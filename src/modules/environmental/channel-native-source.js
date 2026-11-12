/* Resolve only a provable original for native channel samples. This module
   never replaces r.d, adopts a sibling, asks permission, decodes a full DEM,
   or promotes the portable preview to a measurement source. Its TIFF lease
   is private; close() never closes an already-open shared TIFF. The public
   isCurrent() also verifies grid contents; hot tile loops may explicitly use
   isCurrent(false), with a deep check before accepting the analysis. */
(function(root){
'use strict';
const WAIT_MS=45000,TOTAL_MS=90000;
const finite=values=>values&&values.length===4&&Array.from(values).every(Number.isFinite);
const pair=values=>values&&values.length===2&&Array.from(values).every(v=>Number.isSafeInteger(v)&&v>0);
function abort(){return Object.assign(new Error('A leitura do MDT foi cancelada ou a fonte mudou.'),{name:'AbortError'});}
function timeout(){return Object.assign(new Error('O arquivo original do MDT não respondeu a tempo. Verifique se está disponível localmente e tente novamente.'),{name:'TimeoutError'});}
function normalizeCRS(value){
  const text=String(value??'').trim().toUpperCase(),match=/^(?:EPSG:)?(\d+)$/.exec(text);
  return match?'EPSG:'+Number(match[1]):text;
}
function imageCRS(image){
  const keys=image.getGeoKeys?.()||image.geoKeys||{},projected=Number(keys.ProjectedCSTypeGeoKey),geographic=Number(keys.GeographicTypeGeoKey);
  // A user-defined projected CRS must not be mistaken for its geographic datum.
  if(keys.ProjectedCSTypeGeoKey!=null)return Number.isInteger(projected)&&projected>0&&projected!==32767?'EPSG:'+projected:null;
  return Number.isInteger(geographic)&&geographic>0&&geographic!==32767?'EPSG:'+geographic:null;
}
function metadata(r){
  const keys=['nc','nr','cs','csy','xll','yll','crs','srcCRS','srcDims','_W0','_H0','_bb','resampled','native','fromProject','noData','nodata','_nd','clip','_exactClipRings','quantity','unit','_sig'];
  const take=o=>o?Object.fromEntries(keys.map(k=>[k,o[k]])):null;
  return JSON.stringify([take(r),take(r.d),take(r.d?._full),r.src?.sig,r.projectFile,r.projectSavePending,r.projectNativeSource]);
}
function geometryMatches(r,image,proven){
  const d=r.d,w=Number(image.getWidth()),h=Number(image.getHeight()),bb=image.getBoundingBox();
  if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<=0||h<=0||!finite(bb)||!(bb[2]>bb[0])||!(bb[3]>bb[1]))return null;
  const dims=[d.srcDims,[d._W0,d._H0],d._sig?.srcDims,d._sig?.dims,r.src?.sig?.srcDims,r.src?.sig?.dims].find(pair);
  if(dims&&(dims[0]!==w||dims[1]!==h)||!dims&&!proven)return null;
  const expected=finite(d._bb)?d._bb:[d.xll,d.yll,d.xll+d.nc*d.cs,d.yll+d.nr*(d.csy??d.cs)];
  if(!finite(expected))return null;
  // parseTIFF historically omitted csy differences <=0.1 mm per cell.
  // Allow only that representational error, never several native pixels.
  const tolerance=finite(d._bb)?1e-6:Math.max(1e-6,Number(d.nr)*1e-4),
    pixel=Math.min((bb[2]-bb[0])/w,(bb[3]-bb[1])/h),tol=Math.min(tolerance,Math.max(1e-6,pixel*.25));
  if(Array.from(bb).some((v,i)=>Math.abs(v-expected[i])>tol))return null;
  const crs=imageCRS(image);if(!crs)return null;
  const declared=[d.srcCRS,r.srcCRS,d.crs,r.crs].filter(v=>v!=null&&String(v).trim()!=='');
  if(declared.some(value=>normalizeCRS(value)!==crs))return null;
  const bands=typeof image.getSamplesPerPixel==='function'?image.getSamplesPerPixel():image.fileDirectory?.SamplesPerPixel;
  if(bands!=null&&Number(bands)!==1)return null;
  return crs;
}
async function resolve(r,options={}){
  const {signal,isCurrent:onCurrent,onProgress}=options,d=r?.d;
  if(signal?.aborted)throw abort();
  if(!d)return null;
  const state=typeof S!=='undefined'?S:root.S,project=state?.projectId,
    generation=root.GeoMineSessionAutosave?.state?.generation,member=!!state?.rasters?.includes(r),
    refs=[d,d.z,d._full,d._full?.z,d._img0,d._tiff,r._projectSourceRaw,r._projectNativeBinding,r.projectNativeSource],
    binding=r._projectNativeBinding,bindingRefs=[binding?.raw,binding?.d,binding?.full,binding?.revision,binding?.fullRevision],
    originalMetadata=metadata(r),revision=typeof root.projectNativeGridRevision==='function'?root.projectNativeGridRevision(d):null,
    fullRevision=typeof root.projectNativeGridRevision==='function'?root.projectNativeGridRevision(d._full):null,
    controller=new AbortController(),owned=new Set(),closedTIFFs=new WeakSet(),started=Date.now();
  let closed=false,retained=false,lastError=null;
  function current(){
    try{return !closed&&!signal?.aborted&&!controller.signal.aborted&&
      state?.projectId===project&&root.GeoMineSessionAutosave?.state?.generation===generation&&
      (!member||state.rasters.includes(r))&&r.d===refs[0]&&d.z===refs[1]&&d._full===refs[2]&&d._full?.z===refs[3]&&
      d._img0===refs[4]&&d._tiff===refs[5]&&r._projectSourceRaw===refs[6]&&r._projectNativeBinding===refs[7]&&r.projectNativeSource===refs[8]&&
      [binding?.raw,binding?.d,binding?.full,binding?.revision,binding?.fullRevision].every((value,i)=>value===bindingRefs[i])&&
      metadata(r)===originalMetadata&&(typeof onCurrent!=='function'||onCurrent());}catch(_){return false;}
  }
  function closeTIFF(tiff){
    if(!tiff||typeof tiff!=='object'||closedTIFFs.has(tiff))return;
    closedTIFFs.add(tiff);owned.delete(tiff);
    try{Promise.resolve(tiff.close?.()).catch(()=>{});}catch(_){}
  }
  function close(){
    if(closed)return;closed=true;controller.abort();signal?.removeEventListener('abort',close);
    for(const tiff of [...owned])closeTIFF(tiff);
  }
  function revisionCurrent(){
    return typeof root.projectNativeGridRevision!=='function'||
      root.projectNativeGridRevision(d)===revision&&root.projectNativeGridRevision(d._full)===fullRevision;
  }
  function leaseCurrent(deep=true){try{return current()&&(!deep||revisionCurrent());}catch(_){return false;}}
  function check(deep=false){
    if(!leaseCurrent(deep)){close();throw abort();}
  }
  signal?.addEventListener('abort',close,{once:true});
  function progress(message){check();if(typeof onProgress==='function')onProgress(message);check();}
  function wait(operation){
    check(true);
    const left=TOTAL_MS-(Date.now()-started);if(left<=0){close();throw timeout();}
    return new Promise((ok,no)=>{
      let settled=false,timer=null;
      const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);controller.signal.removeEventListener('abort',cancel);
        if(error)no(error);else{try{check(true);ok(value);}catch(e){no(e);}}};
      const cancel=()=>finish(abort());
      controller.signal.addEventListener('abort',cancel,{once:true});
      timer=setTimeout(()=>{finish(timeout());close();},Math.min(WAIT_MS,left));
      // Always observe late completion/rejection, including an opaque getFile.
      Promise.resolve().then(()=>{check(true);return operation();}).then(value=>finish(null,value),error=>finish(error));
    });
  }
  const bindingCurrent=()=>!!r._projectNativeBinding&&typeof root.projectNativeRasterSourceCurrent==='function'&&root.projectNativeRasterSourceCurrent(r);
  function accept(image,proven){
    check(true);const sourceCRS=geometryMatches(r,image,proven);if(!sourceCRS)return null;
    retained=true;return Object.freeze({image,sourceCRS,isCurrent:leaseCurrent,close});
  }
  async function open(raw){
    const openSource=typeof root.GeoMineRasterImport?.open==='function'
      ?(source,control)=>root.GeoMineRasterImport.open(source,control)
      :typeof root.rasterImportOpen==='function'?root.rasterImportOpen:null;
    if(!openSource)return null;
    const tiff=await wait(()=>Promise.resolve(openSource(raw,{signal:controller.signal,timeoutMs:WAIT_MS})).then(value=>{
      // A late open result remains ours even after cancellation; never leak it.
      if(!current()){closeTIFF(value);throw abort();}owned.add(value);return value;
    }));
    try{
      const image=await wait(()=>tiff.getImage(0)),lease=accept(image,true);
      if(!lease)closeTIFF(tiff);return lease;
    }catch(error){closeTIFF(tiff);throw error;}
  }
  async function candidate(work){
    try{return await work();}catch(error){
      if(error?.name==='TimeoutError')throw error;
      check(true);if(error?.name==='AbortError')throw error;
      lastError=error;return null;
    }
  }
  try{
    check(true);
    // Shared TIFF ownership stays with the map/importer. A known invalid
    // binding prohibits resurrecting the old bytes after editing the grid.
    if(d._tiff&&typeof d._tiff.getImage==='function'&&(!r._projectNativeBinding||bindingCurrent())){
      progress('Conferindo o TIFF original já aberto…');
      const lease=await candidate(async()=>accept(await wait(()=>d._tiff.getImage(0)),!!r._projectNativeBinding));
      if(lease){check(true);return lease;}
    }
    const raw=r._projectSourceRaw,isBlob=raw&&Number.isSafeInteger(raw.size)&&raw.size>=0&&typeof raw.slice==='function',
      isBuffer=Object.prototype.toString.call(raw)==='[object ArrayBuffer]';
    if((isBlob||isBuffer)&&bindingCurrent()){
      progress('Abrindo a fonte original vinculada ao MDT…');
      const lease=await candidate(()=>open(raw));if(lease){check(true);return lease;}
    }
    // iPad file-input imports persist their verified bytes in private browser
    // storage rather than a directory handle. Use that same source as the 2D
    // map, with a private read-only TIFF lease; never substitute the preview.
    if(typeof root.GeoMineOriginalSources?.resolve==='function'){
      progress('Procurando o MDT original guardado neste aparelho…');
      const lease=await candidate(async()=>{
        const source=await wait(()=>root.GeoMineOriginalSources.resolve(r,'raster'));
        return source?.file?await open(source.file):null;
      });
      if(lease){check(true);return lease;}
    }
    const descriptor=r.projectNativeSource,path=String(r.projectFile||''),match=/^ALAGIS\/rasters\/([^/\\]+\.tiff?)$/i.exec(path),
      usableName=match&&match[1]!=='.'&&match[1]!=='..'&&!/[\u0000-\u001f]/.test(match[1]);
    if(usableName&&descriptor?.v===1&&typeof root.projectNativeRestoreAllowed==='function'&&root.projectNativeRestoreAllowed(r,'raster')&&
      typeof root.projectDirs==='function'&&typeof root.projectNativeMatches==='function'){
      progress('Procurando o MDT original na pasta já autorizada…');
      const lease=await candidate(async()=>{
        // false: never request permission or present a picker from analysis.
        const dirs=await wait(()=>root.projectDirs(false));if(!dirs?.rasters)return null;
        const handle=await wait(()=>dirs.rasters.getFileHandle(match[1])),file=await wait(()=>handle.getFile());
        if(!await wait(()=>root.projectNativeMatches(file,descriptor)))return null;
        // Descriptor identity, preview hash and source guard remain unchanged
        // until after fingerprint verification and the metadata-only open.
        if(!root.projectNativeRestoreAllowed(r,'raster'))return null;
        return await open(file);
      });
      if(lease){check(true);return lease;}
    }
    // Legacy handles and same-area siblings are only hints, not proof of
    // identity. Their tolerant 8×8 signature must not authorize silent use.
    check(true);if(lastError&&lastError.name!=='NotFoundError'&&lastError.name!=='NotAllowedError')throw lastError;
    return null;
  }finally{if(!retained)close();}
}
root.GeoMineChannelNativeSource=Object.freeze({resolve});
})(typeof window!=='undefined'?window:globalThis);
