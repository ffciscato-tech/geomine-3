/* Opening a project never forces a TIFF locator over its saved contents.
   Automatic restoration may leave a small dismissible notice; the explicit
   Locate action opens the dialog and supplies the native file-picker gesture. */
(function(root){
'use strict';
let dialog=null,notice=null,context=null,timer=null;
let storageNotice=null,storageOwner=null,storageTimer=null,storagePainted=0;
const generation=()=>root.GeoMineSessionAutosave?.state?.generation;
function close(){if(timer)clearInterval(timer);timer=null;dialog?.remove();notice?.remove();dialog=null;notice=null;context=null;}
function current(){return !!(dialog||notice)&&context?.project===S.projectId&&context.gen===generation();}
function closeStorage(){if(storageTimer)clearInterval(storageTimer);storageTimer=null;storageNotice?.remove();storageNotice=null;storageOwner=null;}
function storageProgress(item,kind,value){
 if(value.state!=='saving'){
  if(storageOwner?.item===item&&value.state!=='queued')closeStorage();return;
 }
 const stamp=Date.now();
 if(storageOwner?.item===item&&value.loaded<value.total&&stamp-storagePainted<150)return;
 storagePainted=stamp;
 if(!storageNotice){
  storageNotice=document.createElement('div');storageNotice.id='gmOriginalSaveProgress';storageNotice.setAttribute('role','status');
  storageNotice.style.cssText='position:fixed;bottom:10px;left:50%;transform:translateX(-50%);z-index:1250;max-width:92vw;box-sizing:border-box;padding:8px 12px;border:1px solid var(--line,#888);border-radius:7px;background:var(--panel,#fff);color:var(--ink,#222);box-shadow:0 2px 10px #0003;font-size:12px;pointer-events:none;';
  document.body.appendChild(storageNotice);
  storageTimer=setInterval(()=>{const saved=storageOwner;if(!saved||saved.project!==S.projectId||saved.gen!==generation()||
   saved.account!==root.GeoMineCloudProvider?.user?.uid||!(saved.kind==='ortho'?S.img===saved.item:(S.rasters||[]).includes(saved.item)))closeStorage();},500);
 }
 storageOwner={item,kind,project:S.projectId,gen:generation(),account:root.GeoMineCloudProvider?.user?.uid};
 const percent=value.total>0?Math.min(100,Math.floor(100*value.loaded/value.total)):0;
 storageNotice.textContent='Guardando '+(item.name||'original')+' neste aparelho para reabrir automaticamente: '+percent+'%';
}
function needsOrtho(I){
 if(!I?.url||(I._img0&&I._tiff))return false;
 const decision=root.GeoMineOriginalSources?.needsOrtho?.(I);if(decision!=null)return !!decision;
 const name=I.src?.file||I.srcName||I.name||'',tiff=/\.(?:tif|tiff)$/i,
  native=I.projectFile||I.projectNativeSource||tiff.test(I.originalSource?.name||'')||tiff.test(I.originalSource?.relativePath||'');
 // Full imported PNG/JPEG/WebP images do not depend on an absent GeoTIFF.
 return !!native||!(/\.(?:png|jpe?g|webp)$/i.test(name));
}
function missing(){const rows=(S.rasters||[]).filter(r=>r?.d&&!r.tinPuro&&!projectRasterReady(r)).map(r=>({item:r,kind:'raster'}));const I=S.img;if(needsOrtho(I))rows.push({item:I,kind:'ortho'});return rows;}
async function pickOrtho(I){
 const project=S.projectId,gen=generation(),owner=dialog,
  valid=()=>dialog===owner&&current()&&S.projectId===project&&generation()===gen&&S.img===I;
 let file,handle=null;
 if(root.showOpenFilePicker&&typeof fsApiOK==='function'&&fsApiOK()){
  const handles=await root.showOpenFilePicker({id:'geomine-missing-ortho',multiple:false,types:[{description:'GeoTIFF original',accept:{'image/tiff':['.tif','.tiff']}}]});
  if(!handles?.[0]||!valid())return false;handle=handles[0];file=await handle.getFile();
 }else file=await new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='.tif,.tiff';input.style.display='none';document.body.appendChild(input);const finish=f=>{input.remove();resolve(f)};input.onchange=()=>finish(input.files?.[0]||null);input.addEventListener('cancel',()=>finish(null),{once:true});abrirSeletorGeoTIFF(input);});
 if(!file||!valid())return false;
 const ok=await ortoReligarTIFF(file,{restoreNative:true,isCurrent:valid});
 if(ok&&valid()){
  const sources=root.GeoMineOriginalSources;
  if(handle&&typeof sources?.remember==='function')await sources.remember(I,'ortho',handle,file);
  else if(typeof sources?.rememberFile==='function')await sources.rememberFile(I,'ortho',file);
  if(!valid())return false;
  S.orthoHD=true;S.orthoDispFull=true;syncOrthoTiles();await projectAutoSaveOrtho(false);
 }return ok&&valid();
}
function render(){
 if(!current()){close();return;}
 const rows=missing();if(!rows.length){close();return;}
 if(notice){notice.querySelector('[data-missing-notice]').textContent=
  rows.length===1?'Projeto aberto com a prévia salva. Um original ainda não está disponível neste aparelho.':
  'Projeto aberto com as prévias salvas. '+rows.length+' originais ainda não estão disponíveis neste aparelho.';return;}
 const list=dialog.querySelector('[data-missing-list]');list.replaceChildren();
 for(const {item,kind} of rows){
  const row=document.createElement('div');row.className='hout';row.style.margin='8px 0';
  const name=document.createElement('b');name.textContent=item.name||(kind==='ortho'?'Ortofoto':'Raster');row.appendChild(name);
  const source=document.createElement('div');source.className='hint';
  const saved=item.originalSource;
  source.textContent=saved?.relativePath?'Local salvo: '+saved.relativePath:saved?.name?'Arquivo original: '+saved.name:item.projectFile?'Cópia do projeto: '+item.projectFile:item.src?.file?'Arquivo original: '+item.src.file:'Local do original ainda não informado.';row.appendChild(source);
  const button=document.createElement('button');button.type='button';button.className='tbtn';button.textContent='Localizar TIFF original';
  button.onclick=async()=>{if(!current()||!missing().some(r=>r.item===item))return;button.disabled=true;const owner=dialog;try{
    const ok=kind==='raster'?await rasEscolherNativoAgora(item,{isCurrent:()=>dialog===owner&&current()}):await pickOrtho(item);
    if(dialog!==owner||!current())return;
    if(ok){if(kind==='raster')await projectAutoSaveRaster(item,false);render();}
    else{source.textContent='Arquivo não vinculado. Clique em Localizar para tentar novamente.';}
   }catch(e){if(dialog===owner&&current())source.textContent=e.name==='AbortError'?'Seleção cancelada.':e.message;}
   finally{if(dialog===owner&&current())button.disabled=false;}
  };row.appendChild(button);list.appendChild(row);
 }
}
function request(options={}){
 close();if(!missing().length)return false;context={project:S.projectId,gen:generation()};
 if(options.automatic){
  notice=document.createElement('div');notice.id='gmMissingOriginalsNotice';notice.setAttribute('role','status');
  notice.style.cssText='position:fixed;bottom:44px;left:50%;transform:translateX(-50%);z-index:1200;display:flex;align-items:center;gap:8px;width:min(700px,94vw);box-sizing:border-box;padding:9px 12px;border:1px solid var(--line,#888);border-radius:8px;background:var(--panel,#fff);color:var(--ink,#222);box-shadow:0 2px 10px #0003;font-size:12px;';
  notice.innerHTML='<span data-missing-notice style="flex:1"></span><button class="tbtn" type="button" data-missing-open>Localizar originais</button><button class="tbtn" type="button" data-missing-close aria-label="Fechar aviso dos originais">×</button>';
  document.body.appendChild(notice);
  notice.querySelector('[data-missing-open]').onclick=()=>{if(current())request();};
  notice.querySelector('[data-missing-close]').onclick=close;
  render();timer=setInterval(()=>{if(!current())close();else render();},500);return true;
 }
 dialog=document.createElement('div');dialog.className='modal-bg on';dialog.id='gmMissingOriginals';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','Localizar arquivos TIFF originais');
 dialog.innerHTML='<div class="modal" style="width:min(560px,94vw);max-height:88vh"><div class="modal-h"><b>Localizar TIFFs originais</b></div><div class="modal-b"><p>O projeto foi aberto com as prévias salvas. Localize cada TIFF original abaixo para usar a resolução nativa.</p><button type="button" class="tbtn" data-missing-folder>Localizar pasta dos originais</button><div class="hint" data-missing-status></div><div data-missing-list></div><button class="tbtn" data-missing-close>Continuar com as prévias</button></div></div>';
 document.body.appendChild(dialog);dialog.querySelector('[data-missing-close]').onclick=close;
 const folder=dialog.querySelector('[data-missing-folder]');folder.hidden=typeof root.GeoMineOriginalSources?.chooseFolder!=='function'||typeof root.showDirectoryPicker!=='function'||(typeof fsApiOK==='function'&&!fsApiOK());folder.style.display=folder.hidden?'none':'';
 folder.onclick=async()=>{
  if(!current()||folder.hidden||typeof root.GeoMineOriginalSources?.chooseFolder!=='function')return;
  const owner=dialog,status=dialog.querySelector('[data-missing-status]');folder.disabled=true;status.textContent='Selecione a pasta que contém os TIFFs originais.';
  try{
   // The API opens the picker immediately, within this deliberate click.
   await root.GeoMineOriginalSources.chooseFolder();
   if(dialog!==owner||!current())return;
   render();if(dialog===owner&&current())status.textContent='Confira os arquivos que ainda precisam ser localizados abaixo.';
  }catch(e){if(dialog===owner&&current())status.textContent=e.name==='AbortError'?'Seleção cancelada.':e.message;}
  finally{if(dialog===owner&&current())folder.disabled=false;}
 };
 render();timer=setInterval(()=>{
  if(!current()){close();return;}
  const sources=root.GeoMineOriginalSources;
  if(typeof sources?.persistence!=='function')return;
  const pending=[...(S.rasters||[]).map(item=>({item,kind:'raster'})),...(S.img?[{item:S.img,kind:'ortho'}]:[])]
   .map(row=>({...row,storage:sources.persistence(row.item,row.kind)})).find(row=>row.storage?.state==='saving');
  if(pending){const status=dialog?.querySelector('[data-missing-status]');if(status){const p=pending.storage,
   percent=p.total>0?Math.min(100,Math.floor(100*p.loaded/p.total)):0;
   status.textContent='Guardando '+(pending.item.name||'original')+' neste aparelho para reabrir automaticamente: '+percent+'%';}}
 },500);return true;
}
root.GeoMineMissingOriginals={request,close,missing,storageProgress};
})(window);
