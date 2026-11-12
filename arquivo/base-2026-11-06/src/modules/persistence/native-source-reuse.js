/* Reuse verified native files without tying their identity to a display PNG.
   Invalidated candidates are session-only and NEVER authorize restoration. */
(function(){
'use strict';
const previous=new WeakMap(),queues=new WeakMap();
function remember(item){
  if(item?.projectFile&&item.projectNativeSource?.v===1)
    previous.set(item,{path:item.projectFile,descriptor:{...item.projectNativeSource}});
}
async function reuse(ds,item,kind,current,fingerprint){
  if(!current())return null;
  const valid=projectNativeRestoreAllowed(item,kind);
  // Without current source bytes, only an unchanged, verified revision may
  // reuse the file. A changed grid must go through the normal export path.
  if(fingerprint===undefined&&!valid)return null;
  // A sampled TIFF fingerprint must never override the full-cell revision
  // check for edited/generated grids (an edit can lie between samples).
  if(!valid&&kind==='raster'&&!projectNativeRasterSourceCurrent(item))return null;
  const candidate=item.projectFile&&item.projectNativeSource?.v===1
    ?{path:item.projectFile,descriptor:item.projectNativeSource}:previous.get(item);
  if(!candidate)return null;
  const d=candidate.descriptor;
  if(fingerprint!==undefined&&fingerprint!==d.fingerprint)return null;
  try{
    const name=String(candidate.path).split('/').pop();
    const handle=await ds.rasters.getFileHandle(name),file=await handle.getFile();
    // Cloud synchronization can change mtime without changing the TIFF.
    // Validate the existing content using the native fingerprint contract.
    if(file.size!==d.size||await projectNativeFingerprint(file)!==d.fingerprint||!current())return null;
    return {name,reused:true,descriptor:{...d,lastModified:+file.lastModified||0,preview:projectNativePreview(item,kind)}};
  }catch(_){return null;}
}
function commit(item,saved){
  item.projectFile='ALAGIS/rasters/'+saved.name;
  item.projectNativeSource=saved.descriptor;item.projectSavePending=false;
  remember(item);
}
function serialize(item,job){
  const project=S.projectId,generation=window.GeoMineSessionAutosave?.state?.generation;
  const before=queues.get(item)||Promise.resolve();
  const next=before.catch(()=>{}).then(()=>{
    if(S.projectId!==project||window.GeoMineSessionAutosave?.state?.generation!==generation)return false;
    return job();
  });
  queues.set(item,next);
  return next.finally(()=>{if(queues.get(item)===next)queues.delete(item);});
}
window.GeoMineNativeReuse={remember,reuse,commit,serialize};
})();
