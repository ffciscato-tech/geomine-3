/* Explicit source selection from the raster properties. Browser pickers open
   in the click turn; names are never treated as authorized filesystem paths. */
(function(root){
'use strict';
const gen=()=>root.GeoMineSessionAutosave?.state?.generation;
function current(item,kind){const project=S.projectId,g=gen();return ()=>S.projectId===project&&gen()===g&&(kind==='ortho'?S.img===item:S.rasters.includes(item));}
function nameHTML(item,kind,label){return '<button type="button" class="gm-raster-source-name" data-raster-source="'+kind+'" data-raster-id="'+esc(String(item.id??''))+'" title="Localizar ou carregar o TIFF original">'+esc(label||item.name||'TIFF')+'</button>';}
async function preferLocal(I,valid=current(I,'ortho')){
 const sources=root.GeoMineOriginalSources;if(!valid()||!sources?.resolve)return false;
 const request=I._nativeRelinkRequest||0,raw=I._sourceRaw,old=I._tiff;
 const pending=()=>valid()&&(I._nativeRelinkRequest||0)===request&&I._sourceRaw===raw&&I._tiff===old;
 const local=await sources.resolve(I,'ortho');if(!local||!pending())return false;
 if(I._img0&&I._tiff&&(local.file===I._sourceRaw||I._deviceSourceId===local.descriptor.id)){
  S.orthoHD=true;S.orthoDispFull=true;
  // A grade pode ter concluído uma tentativa mostrando a prévia temporária.
  // Ao recuperar a fonte, os mesmos tiles devem voltar a ler o original.
  if(typeof _orthoGrid!=='undefined'&&(_orthoGrid?._fallbackHole||_orthoGrid?._nativeError))orthoHDReset();
  syncOrthoTiles();return true;
 }
 // A cópia verificada é a continuação da mesma escolha de fonte. Reutilizar
 // o pedido evita invalidar a importação que está aguardando este handoff.
 const ok=await ortoReligarTIFF(local.file,{restoreNative:true,isCurrent:pending,handoffRequest:request});
 if(ok&&valid()&&(I._nativeRelinkRequest||0)===request&&I._sourceRaw===local.file){if(!sources.adopt(I,'ortho',local))return false;I._deviceSourceId=local.descriptor.id;if(old&&old!==I._tiff)try{await old.close?.();}catch(_){}return true;}
 return false;
}
function selectFile(item){
 // iPad sem o original: busca no Google Drive / seletor na pasta do projeto.
 const drive=root.GeoMineDriveOriginals;let viaDrive=false;
 try{viaDrive=!!drive?.shouldLocate?.()&&drive.missing().some(row=>row.item===item);}catch(_){}
 if(viaDrive)return drive.locate(item,'ortho').then(found=>found?.file?{file:found.file}:null);
 if(root.showOpenFilePicker&&typeof fsApiOK==='function'&&fsApiOK()){
  const startIn=root.GeoMineOriginalSources?.startIn?.(item,'ortho')||root.GeoMineProjectTabSession?.pickerStartIn?.();
  return root.showOpenFilePicker({id:'geomine-ortho-original',multiple:false,...(startIn?{startIn}:{}),types:[{description:'GeoTIFF original',accept:{'image/tiff':['.tif','.tiff']}}]}).then(async hs=>hs?.[0]?{file:await hs[0].getFile(),handle:hs[0]}:null);
 }
 return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='.tif,.tiff,image/tiff';input.style.display='none';document.body.append(input);
  const finish=v=>{input.remove();resolve(v);};input.onchange=()=>finish(input.files?.[0]?{file:input.files[0]}:null);input.addEventListener('cancel',()=>finish(null),{once:true});abrirSeletorGeoTIFF(input);
 });
}
function choose(item,kind){
 const viewCurrent=current(item,kind),choice=kind==='ortho'?(item._nativeSourceChoice=(item._nativeSourceChoice||0)+1):null,
  valid=()=>viewCurrent()&&(kind!=='ortho'||item._nativeSourceChoice===choice);
 if(kind==='raster')return rasEscolherNativoAgora(item).then(ok=>{if(ok&&valid()){item.dispFull=true;item.demHD=true;renderRaster(item);syncDemTiles(item);refreshUI();}return ok;});
 // No asynchronous storage lookup may precede this picker invocation.
 const picked=selectFile(item);
 return picked.then(async selected=>{
  if(!selected||!valid())return false;showLoad('Carregando a ortofoto original…');
  try{await root.GeoMineImportRecovery?.before();if(!valid())return false;
   const ok=await ortoReligarTIFF(selected.file,{restoreNative:true,isCurrent:valid});if(!ok||!valid())return false;
   const request=item._nativeRelinkRequest||0,chosen=()=>valid()&&(item._nativeRelinkRequest||0)===request;
   const remembered=selected.handle?await root.GeoMineOriginalSources?.remember(item,'ortho',selected.handle,selected.file):
    await root.GeoMineOriginalSources?.rememberFile(item,'ortho',selected.file);
   if(remembered===false||!chosen())return false;await preferLocal(item,chosen);if(!chosen())return false;S.orthoHD=true;S.orthoDispFull=true;syncOrthoTiles();refreshUI();root.GeoMineWorkspaceResume?.request();return true;
  }finally{hideLoad();}
 }).catch(e=>{if(e?.name!=='AbortError'&&valid())toast('Não foi possível carregar o TIFF: '+(e.message||e));return false;});
}
function boot(){
 document.addEventListener('click',e=>{const b=e.target.closest?.('[data-raster-source],#rasName,#imModName');if(!b)return;
  const kind=b.dataset.rasterSource||(b.id==='rasName'?'raster':'ortho'),item=kind==='ortho'?S.img:b.id==='rasName'?rasCur:S.rasters.find(r=>String(r.id)===b.dataset.rasterId);
  if(item){e.preventDefault();void choose(item,kind);}
 });
 for(const id of ['rasName','imModName']){const b=document.getElementById(id);if(!b)continue;b.classList.add('gm-raster-source-name');b.setAttribute('role','button');b.tabIndex=0;b.title='Localizar ou carregar o TIFF original';b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();b.click();}});}
}
root.GeoMineRasterSourceUI={nameHTML,choose,preferLocal};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
