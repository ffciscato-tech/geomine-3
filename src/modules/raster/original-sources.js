/* Persistent, read-only capabilities for original image sources. Project JSON
   stores identity/location metadata; filesystem handles stay in this browser,
   scoped by account and project. A file-input selection (Safari/iPad) is copied
   to this origin's private storage in bounded chunks, never as a giant IDB Blob.
   No absolute path is fabricated from a name. */
(function(root){
'use strict';
const PREFIX='originalImageSource:v1:',captured=new WeakMap(),memory=new Map(),jobs=new Map(),
 validatedPreviews=new WeakMap(),stale=new WeakSet(),verified=new WeakSet(),
 sessionFiles=new Map(),storageStates=new WeakMap(),volatileRecords=new Set(),stagedFiles=new WeakMap(),stableFiles=new WeakMap();
const CACHE_DIR='geomine-originals-v1',CACHE_CHUNK=1024*1024,CACHE_MARGIN=16*1024*1024;
let cacheQueue=Promise.resolve(),cacheSequence=0;
const owner=()=>root.GeoMineCloudProvider?.user?.uid||'offline';
const generation=()=>root.GeoMineSessionAutosave?.state?.generation;
const preview=(item,kind,grid)=>projectNativePreview(item,kind,grid);
const base=()=>PREFIX+encodeURIComponent(owner())+':'+encodeURIComponent(S.projectId||'')+':';
const slot=(item,kind)=>kind+':'+(kind==='raster'?String(item.id??item.rid??item.name):'ortho');
const alias=(item,kind)=>base()+'layer:'+encodeURIComponent(slot(item,kind));
const fingerprintKey=(kind,fingerprint)=>base()+'fingerprint:'+kind+':'+encodeURIComponent(fingerprint);
const folderKey=()=>base()+'folders';
const isFile=h=>h&&typeof h.getFile==='function'&&(!h.kind||h.kind==='file');
const normalize=s=>String(s||'').normalize('NFC').toLocaleLowerCase();
function sameOrthoView(item,url,bound){
 return item.url===url||typeof root.orthoMaskPreviewIdentity==='function'&&root.orthoMaskPreviewIdentity(item)===bound;
}
function context(item,kind,bound=preview(item,kind)){
 const project=S.projectId,gen=generation(),account=owner(),data=kind==='ortho'?item.url:item.d;
 return ()=>S.projectId===project&&generation()===gen&&owner()===account&&
  (kind==='ortho'?S.img===item:(S.rasters||[]).includes(item))&&(kind==='ortho'?sameOrthoView(item,data,bound):item.d===data)&&preview(item,kind)===bound;
}
// File copies may run for thousands of chunks. Hash the saved grid at the two
// commit boundaries, not on every chunk: the inner guard is intentionally O(1).
function quickContext(item,kind){
 const project=S.projectId,gen=generation(),account=owner(),data=kind==='ortho'?item.url:item.d,bound=kind==='ortho'?preview(item,kind):null;
 return ()=>S.projectId===project&&generation()===gen&&owner()===account&&
  (kind==='ortho'?S.img===item:(S.rasters||[]).includes(item))&&(kind==='ortho'?sameOrthoView(item,data,bound):item.d===data);
}
function storageFailure(name,message){const e=new Error(message);e.name=name;return e;}
function checkCopy(current){if(!current())throw storageFailure('AbortError','Projeto alterado durante a cópia do original.');}
function storageState(item,kind,state,extra={}){const value={kind,state,...extra};storageStates.set(item,value);
 if(item._stageProgress){item._stageProgress(value);return value;}
 try{root.GeoMineMissingOriginals?.storageProgress?.(item,kind,value);}catch(_){}return value;}
function persistence(item,kind){const value=storageStates.get(item);return value?.kind===kind?{...value}:null;}
function storageNotice(item,message){try{cmdLog(message,'warn');}catch(_){}try{if(root.toast)root.toast(message);}catch(_){} }
function storageMessage(error){
 if(error?.name==='QuotaExceededError'||error?.code===22)
  return 'Espaço insuficiente neste aparelho para guardar o original e reabri-lo automaticamente.';
 if(['NotSupportedError','NotAllowedError','SecurityError'].includes(error?.name))
  return 'O navegador não disponibilizou o armazenamento local. Será necessário selecionar o original novamente na próxima abertura.';
 if(error?.name==='NotReadableError'||error?.name==='TimeoutError')
  return 'Não foi possível concluir a cópia local do original. Confira se o arquivo foi baixado completamente para este aparelho.';
 return 'Não foi possível guardar a cópia local. Será necessário selecionar o original novamente na próxima abertura.';
}
async function cacheScope(project,account){
 if(!root.crypto?.subtle||typeof root.TextEncoder!=='function')throw storageFailure('NotSupportedError','Armazenamento persistente indisponível neste navegador.');
 const digest=await wait(root.crypto.subtle.digest('SHA-256',new root.TextEncoder().encode(JSON.stringify([account,project]))));
 return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
async function cacheDirectory(project,account,create){
 const storage=root.navigator?.storage;
 if(typeof storage?.getDirectory!=='function')throw storageFailure('NotSupportedError','Este navegador não oferece armazenamento local para reabrir os originais.');
 const scope=await cacheScope(project,account),origin=await wait(storage.getDirectory()),
  folder=await wait(origin.getDirectoryHandle(CACHE_DIR,{create}));
 return await wait(folder.getDirectoryHandle(scope,{create}));
}
function restoredFileName(file,d){
 // Shadowing readonly prototype getters adds metadata only. It does not make a
 // new Blob or copy the multi-GB content returned by the private filesystem.
 try{Object.defineProperty(file,'name',{value:d.name,configurable:true});}catch(_){}
 try{Object.defineProperty(file,'lastModified',{value:d.lastModified,configurable:true});}catch(_){}
 return file;
}
async function cachedFile(record,current){
 const cache=record?.cache,d=record?.descriptor;
 if(cache?.v!==1||cache.size!==d?.size||cache.fingerprint!==d?.fingerprint||
  !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,239}$/.test(cache.fileName||''))return null;
 try{
  const directory=await cacheDirectory(record.projectId,record.ownerUid,false);if(!current())return null;
  const handle=await wait(directory.getFileHandle(cache.fileName)),file=await wait(handle.getFile());
  if(!current()||file.size!==d.size||await wait(projectNativeFingerprint(file))!==d.fingerprint||!current())return null;
  stableFiles.set(file,{project:record.projectId,owner:record.ownerUid});return restoredFileName(file,d);
 }catch(_){return null;}
}
// Older WebKit exposes the efficient OPFS writer only in a dedicated worker.
// Transfer a single 1 MiB buffer, await its acknowledgement, then read the next.
function cacheWorker(){
 let access=null;
 self.onmessage=async({data:q})=>{
  try{
   if(q.type==='open')access=await q.handle.createSyncAccessHandle();
   else if(q.type==='write'){
    const bytes=new Uint8Array(q.bytes);let written=0;
    while(written<bytes.length){const n=await access.write(bytes.subarray(written),{at:q.offset+written});
     if(!(n>0))throw new Error('Não foi possível concluir a gravação do original.');written+=n;}
   }else if(q.type==='close'){await access.truncate(q.size);await access.flush();await access.close();access=null;}
   else if(q.type==='abort'){if(access)await access.close();access=null;}
   self.postMessage({id:q.id,ok:true});
  }catch(e){if(access)try{await access.close();}catch(_){}access=null;
   self.postMessage({id:q.id,ok:false,name:e?.name||'Error',message:e?.message||String(e)});}
 };
}
async function workerWriter(handle){
 if(typeof root.Worker!=='function'||!root.URL?.createObjectURL||typeof root.Blob!=='function')
  throw storageFailure('NotSupportedError','A gravação local não está disponível neste navegador.');
 const url=root.URL.createObjectURL(new root.Blob(['('+cacheWorker.toString()+')()'],{type:'text/javascript'}));
 let worker,sequence=0,closed=false;const pending=new Map();
 const stop=()=>{if(closed)return;closed=true;try{worker?.terminate();}catch(_){}root.URL.revokeObjectURL(url);
  for(const {reject} of pending.values())reject(storageFailure('AbortError','Cópia do original interrompida.'));pending.clear();};
 const request=(type,data={},transfer=[])=>{
  if(closed)return Promise.reject(storageFailure('AbortError','Cópia do original interrompida.'));
  const id=++sequence,p=new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});
   try{worker.postMessage({id,type,...data},transfer);}catch(e){pending.delete(id);reject(e);}});
  return root.GeoMineRasterSource?.wait?root.GeoMineRasterSource.wait(p,{timeoutMs:type==='close'?120000:45000}):p;
 };
 try{
  worker=new root.Worker(url);
  worker.onmessage=({data:q})=>{const result=pending.get(q.id);if(!result)return;pending.delete(q.id);
   if(q.ok)result.resolve();else result.reject(storageFailure(q.name,q.message));};
  worker.onerror=event=>{const error=storageFailure('NotReadableError',event.message||'Falha na gravação local do original.');
   for(const {reject} of pending.values())reject(error);pending.clear();stop();};
  await request('open',{handle});root.URL.revokeObjectURL(url);
  return {write:(bytes,offset)=>request('write',{bytes,offset},[bytes]),
   async close(size){try{await request('close',{size});}finally{stop();}},
   async abort(){try{await request('abort');}catch(_){}finally{stop();}}};
 }catch(e){stop();throw e;}
}
async function cacheOriginal(item,kind,file,record,current,unchanged){
 checkCopy(current);
 const existing=await cachedFile(record,current);checkCopy(current);
 if(existing)return record.cache;
 delete record.cache;
 const storage=root.navigator?.storage;
 if(typeof storage?.estimate!=='function')throw storageFailure('NotSupportedError','Este navegador não permite conferir o espaço para guardar o original.');
 const estimate=await wait(storage.estimate());checkCopy(current);
 const quota=Number(estimate?.quota),usage=Number(estimate?.usage);
 if(!Number.isFinite(quota)||!Number.isFinite(usage)||usage<0||quota-usage<file.size+CACHE_MARGIN)
  throw storageFailure('QuotaExceededError','Espaço insuficiente neste aparelho para guardar o original e reabri-lo automaticamente.');
 const directory=await cacheDirectory(record.projectId,record.ownerUid,true);checkCopy(current);
 let writer=null,fileName=null,owned=false,complete=false,retired=false;
 const cleanup=async()=>{if(owned&&fileName)try{await wait(directory.removeEntry(fileName));}catch(_){} };
 try{
  for(let attempt=0;attempt<12;attempt++){
   const nonce=String(root.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)).replace(/[^a-z0-9_-]/gi,'').slice(0,80);
   fileName='original-'+Date.now().toString(36)+'-'+(++cacheSequence).toString(36)+'-'+nonce+'.tif';
   try{await wait(directory.getFileHandle(fileName));fileName=null;}catch(e){if(e?.name==='NotFoundError')break;throw e;}
  }
  if(!fileName)throw new Error('Não foi possível reservar uma cópia exclusiva do original.');
  checkCopy(current);
  const creating=Promise.resolve().then(()=>directory.getFileHandle(fileName,{create:true}));
  creating.then(()=>{owned=true;if(retired)void cleanup();},()=>{});
  const handle=await wait(creating);checkCopy(current);
  if(typeof handle.createWritable==='function'){
   const opening=Promise.resolve().then(()=>handle.createWritable());
   opening.then(w=>{if(retired)void Promise.resolve(w.abort?.()).catch(()=>{}).then(cleanup);},()=>{});
   const stream=await wait(opening);
   const io=(p,ms)=>root.GeoMineRasterSource?.wait?root.GeoMineRasterSource.wait(p,{timeoutMs:ms}):p;
   writer={write:bytes=>io(stream.write(bytes),45000),close:()=>io(stream.close(),120000),abort:()=>wait(stream.abort())};
  }else writer=await workerWriter(handle);
  storageState(item,kind,'saving',{loaded:0,total:file.size});
  for(let offset=0;offset<file.size;offset+=CACHE_CHUNK){
   checkCopy(current);
   const end=Math.min(file.size,offset+CACHE_CHUNK),part=file.slice(offset,end);
   if(part.size!==end-offset)throw new Error('O arquivo original devolveu um trecho incompleto.');
   const bytes=await (root.GeoMineRasterSource?.read?root.GeoMineRasterSource.read(part,{timeoutMs:45000}):wait(part.arrayBuffer()));
   checkCopy(current);
   if(bytes.byteLength!==end-offset)throw new Error('Não foi possível ler completamente o original selecionado.');
   await writer.write(bytes,offset);checkCopy(current);
   storageState(item,kind,'saving',{loaded:end,total:file.size});
  }
  const closing=Promise.resolve().then(()=>writer.close(file.size));
  closing.then(()=>{if(retired)void cleanup();},()=>{});
  await (root.GeoMineRasterSource?.wait?root.GeoMineRasterSource.wait(closing,{timeoutMs:120000}):closing);writer=null;checkCopy(current);
  const copied=await wait(handle.getFile());checkCopy(current);
  if(copied.size!==file.size||await wait(projectNativeFingerprint(copied))!==record.descriptor.fingerprint)
   throw new Error('A cópia local do original não passou na conferência.');
  checkCopy(current);checkCopy(unchanged);complete=true;
  return {v:1,fileName,size:file.size,fingerprint:record.descriptor.fingerprint};
 }finally{
  if(!complete){retired=true;try{await writer?.abort();}catch(_){}await cleanup();}
 }
}
async function get(key){if(memory.has(key))return memory.get(key);try{return await wait(idbGet(key))||null;}catch(_){return null;}}
async function put(key,value){memory.set(key,value);try{await wait(idbSet(key,value));return true;}catch(_){return false;}}
function wait(promise){return root.GeoMineRasterSource?.wait?root.GeoMineRasterSource.wait(promise,{timeoutMs:15000}):Promise.resolve(promise);}
async function allowed(h){try{return !!h&&typeof h.queryPermission==='function'&&await wait(h.queryPermission({mode:'read'}))==='granted';}catch(_){return false;}}
function capture(file,handle){if(file&&isFile(handle))captured.set(file,handle);}
function descriptor(item,kind,bound=preview(item,kind)){const d=item?.originalSource;return d?.v===1&&!d.invalidated&&d.kind===kind&&d.preview===bound?d:null;}
function blocked(item,kind,bound=preview(item,kind)){const d=item?.originalSource;return stale.has(item)||!!(d?.v===1&&(d.invalidated||d.kind!==kind||d.preview!==bound));}
function forSave(item,kind,grid){const d=descriptor(item,kind);return d?{...d,preview:preview(item,kind,grid)}:
 item.originalSource?.v===1?{...item.originalSource,invalidated:true}:null;}
function validated(item,kind,before){if(item&&before)validatedPreviews.set(item,{kind,preview:before});}
// The same authorized original may have been imported as a NEW layer after
// this .ccmgis was saved. Resolve its bytes independently of that layer ID or
// the size/encoding of its display preview. Only an unchanged saved identity
// can authorize this lookup; names, extents and nominal resolutions cannot.
function expectedOriginal(item,kind,bound=preview(item,kind)){
 const d=descriptor(item,kind,bound);if(d)return d;
 const p=item?.projectNativeSource;
 return !blocked(item,kind,bound)&&!item.projectSavePending&&p?.v===1&&p.preview===bound&&
  typeof p.fingerprint==='string'&&Number.isSafeInteger(p.size)&&p.size>0?p:null;
}
async function findFingerprint(kind,expected,current){
 if(!expected)return null;const key=fingerprintKey(kind,expected.fingerprint),valid=r=>r?.v===1&&r.ownerUid===owner()&&r.projectId===S.projectId&&r.kind===kind&&(isFile(r.handle)||r.cache?.v===1)&&r.descriptor?.size===expected.size&&r.descriptor?.fingerprint===expected.fingerprint;
 const indexed=await get(key);if(!current())return null;if(valid(indexed))return indexed;
 // Migrate local records created before the fingerprint index existed.
 // Enumerate only small source descriptors in this account/project namespace.
 if(typeof idb!=='function')return null;
 try{const db=await idb(),prefix=base()+'source:';
  const record=await new Promise((resolve,reject)=>{const tx=db.transaction('kv','readonly'),store=tx.objectStore('kv');
   const range=typeof IDBKeyRange!=='undefined'?IDBKeyRange.bound(prefix,prefix+'\uffff'):undefined,req=store.openCursor(range);let found=null;
   req.onsuccess=()=>{const cursor=req.result;if(!cursor)return;if(!current())return;
    if(String(cursor.key).startsWith(prefix)&&valid(cursor.value)){found=cursor.value;return;}cursor.continue();};
   tx.oncomplete=()=>resolve(found);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });if(!current()||!valid(record))return null;void put(key,record);return record;
 }catch(_){return null;}
}
// Storage/fingerprinting must finish before native tile readers compete for
// provider I/O. Nested remembering shares one hold set and resumes only once.
function holdNativeSource(item,kind){
 if(!item||!(kind==='ortho'?S.img===item:kind==='raster'&&(S.rasters||[]).includes(item)))return ()=>{};
 let holds=item._nativeSourceHolds;
 if(!(holds instanceof Set))Object.defineProperty(item,'_nativeSourceHolds',{value:holds=new Set(),writable:true,configurable:true});
 const token={},project=S.projectId,gen=generation();const first=holds.size===0;holds.add(token);
 if(first)try{if(kind==='ortho'&&typeof orthoHDReset==='function')orthoHDReset();else if(kind==='raster'&&typeof syncDemTiles==='function')syncDemTiles(item);}catch(_){}
 return ()=>{
  if(!holds.delete(token)||item._nativeSourceHolds!==holds||holds.size||(kind==='ortho'?S.img!==item:!(S.rasters||[]).includes(item))||S.projectId!==project||generation()!==gen)return;
  try{if(kind==='ortho'&&S.orthoHD&&typeof syncOrthoTiles==='function')syncOrthoTiles();else if(kind==='raster'&&typeof syncDemTiles==='function')syncDemTiles(item);}catch(e){item._nativeTileError=String(e?.message||e);}
 };
}
async function remember(item,kind,handle,file,location={}){
 const release=holdNativeSource(item,kind);
 try{return await rememberOwned(item,kind,handle,file,location);}finally{release();}
}
async function rememberOwned(item,kind,handle,file,location={}){
 if(!item||!['raster','ortho'].includes(kind))return false;
 const bound=preview(item,kind),viewCurrent=context(item,kind,bound),prefix=base(),layerKey=alias(item,kind),
  request=item._nativeRelinkRequest||0,choice=item._nativeSourceChoice,raw=item._sourceRaw,tiff=item._tiff;
 // Persistence belongs to the source choice that started it, including awaits
 // before fingerprinting/copying. A later selection must not publish its alias.
 const handoffCurrent=()=>viewCurrent()&&(kind!=='ortho'||(item._nativeRelinkRequest||0)===request&&item._nativeSourceChoice===choice),
  owned=()=>kind!=='ortho'||(item._nativeRelinkRequest||0)===request&&item._nativeSourceChoice===choice&&item._sourceRaw===raw&&item._tiff===tiff,
  current=()=>viewCurrent()&&owned();
 if(!current())return false;
 handle=handle||captured.get(file);
 if(!file&&isFile(handle)){try{file=await wait(handle.getFile());}catch(_){return false;}}
 if(!file||!current())return false;
 const staged=stagedFiles.get(file),stageValid=staged?.projectId===S.projectId&&staged.ownerUid===owner()&&staged.descriptor.size===file.size&&staged.descriptor.lastModified===(+file.lastModified||0);
 // The provider capability may expire during a long decode. The immutable
 // selected File was already fingerprinted against its completed local copy.
 const fingerprint=stageValid?staged.descriptor.fingerprint:await wait(projectNativeFingerprint(file));if(!current()||bound!==preview(item,kind))return false;
 const prior=descriptor(item,kind),id=prior?.fingerprint===fingerprint?prior.id:
  (root.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
 const d={v:1,id,kind,name:file.name||handle?.name||item.src?.file||item.name,size:file.size,
  lastModified:+file.lastModified||0,fingerprint,preview:bound,
  ...(location.relativePath?{relativePath:String(location.relativePath)}:prior?.relativePath?{relativePath:prior.relativePath}:{}),
  ...(location.folderName?{folderName:String(location.folderName)}:prior?.folderName?{folderName:prior.folderName}:{})};
 const previous=await get(layerKey);if(!current()||bound!==preview(item,kind))return false;
 const validatedBefore=validatedPreviews.get(item),previews=[bound,
  ...(validatedBefore?.kind===kind?[validatedBefore.preview]:[]),
  ...(previous?.descriptor?.fingerprint===fingerprint?previous.previews||[previous.descriptor.preview]:[])];
 const record={v:1,projectId:S.projectId,ownerUid:owner(),kind,descriptor:d,previews:[...new Set(previews)].slice(0,8),handle:isFile(handle)?handle:
  previous?.descriptor?.fingerprint===fingerprint&&isFile(previous.handle)?previous.handle:null,
  ...(previous?.descriptor?.fingerprint===fingerprint&&previous.cache?{cache:previous.cache}:{})};
 if(previous?.descriptor?.fingerprint===fingerprint&&previous.legacyOrthoPreviews)
  record.legacyOrthoPreviews=previous.legacyOrthoPreviews.filter(p=>record.previews.includes(p.preview));
 if(stageValid&&staged.descriptor.fingerprint===fingerprint)record.cache=staged.cache;
 if(!current())return false;
 item.originalSource=d;
 stale.delete(item);
 item.src={...(item.src||{}),file:d.name,size:d.size,...(d.relativePath?{path:d.relativePath}:{})};
 if(file&&isFile(handle))capture(file,handle);
 const sourceKey=prefix+'source:'+encodeURIComponent(id),viewQuick=quickContext(item,kind),quick=()=>viewQuick()&&owned();
 // The File remains usable within this page even if quota is exhausted. Only
 // small descriptors go through IndexedDB; never put this File in the record.
 if(!isFile(record.handle)){
  sessionFiles.set(sourceKey,file);memory.set(sourceKey,record);memory.set(layerKey,record);volatileRecords.add(sourceKey);
  storageState(item,kind,'queued',{loaded:0,total:file.size});
  const copying=cacheQueue.then(()=>cacheOriginal(item,kind,file,record,quick,current));
  cacheQueue=copying.catch(()=>{});
  try{record.cache=await copying;}catch(e){
   if(e?.name==='AbortError'||!quick()){storageState(item,kind,'cancelled');return false;}
   const reason=storageMessage(e);storageState(item,kind,'session-only',{reason});
   storageNotice(item,'Original aberto nesta sessão. '+reason);
  }
 }
 // A changed cell can keep the same data object; recheck its full fingerprint
 // once before publishing the record after the incremental copy has finished.
 if(!current())return false;
 const persisted=await put(sourceKey,record);if(!current())return false;
 const aliasPersisted=await put(layerKey,record);
 if(persisted&&aliasPersisted){
  volatileRecords.delete(sourceKey);
  if(isFile(record.handle)||record.cache)storageState(item,kind,isFile(record.handle)?'handle':'device',{loaded:file.size,total:file.size});
  const indexKey=fingerprintKey(kind,fingerprint);
  if(isFile(record.handle)||record.cache)await put(indexKey,record);
  else{const indexed=await get(indexKey);if(indexed?.descriptor?.id===id)await put(indexKey,record);}
 }else{
  volatileRecords.add(sourceKey);
  storageState(item,kind,'session-only',{reason:'O navegador não conseguiu guardar a referência do original.'});
  storageNotice(item,'Original disponível nesta sessão; o navegador não conseguiu guardar o acesso: '+d.name);
 }
 let handedOff=false;
 if(kind==='ortho'&&!location.deferLocalHandoff&&current()&&(record.cache||isFile(record.handle)))try{handedOff=await root.GeoMineRasterSourceUI?.preferLocal(item,handoffCurrent)===true;}catch(e){storageNotice(item,'Original guardado. Toque no nome do TIFF para tentar a leitura nativa novamente.');}
 // Only this verified handoff may replace the captured raw source. The same
 // request/choice and adopted descriptor must still own the resulting image.
 const settled=current()||handedOff&&handoffCurrent()&&item._deviceSourceId===d.id&&item.originalSource?.id===d.id;
 if(settled)root.GeoMineWorkspaceResume?.request();return settled;
}
async function rememberFile(item,kind,file,options={}){
 const release=holdNativeSource(item,kind);
 try{return await rememberFileOwned(item,kind,file,options);}finally{release();}
}
async function rememberFileOwned(item,kind,file,options={}){
 const viewCurrent=context(item,kind),bound=preview(item,kind),request=item._nativeRelinkRequest||0,
  choice=item._nativeSourceChoice,raw=item._sourceRaw,tiff=item._tiff,
  current=()=>viewCurrent()&&(kind!=='ortho'||(item._nativeRelinkRequest||0)===request&&item._nativeSourceChoice===choice&&item._sourceRaw===raw&&item._tiff===tiff);
 let handle=captured.get(file);
 if(!handle&&typeof projectDroppedHandles!=='undefined')try{handle=await projectDroppedHandles.get(file);}catch(_){}
 if(!current()||bound!==preview(item,kind))return false;
 return remember(item,kind,handle,file,{deferLocalHandoff:options.deferLocalHandoff===true});
}
function legacyOrthoIdentity(item){
 if(!item?.url||item.originalSource||item.projectNativeSource||item.projectSavePending)return null;
 const name=normalize(String(item.src?.file||item.srcName||item.name||'').split(/[\\/]/).pop()),
  crsText=String(item._crsFixo||item._sourceCRS||S.workCRS||''),m=/^(?:EPSG:)?(\d+)$/i.exec(crsText),
  crs=m?Number(m[1]):0,b=item.b,size=Number(item.src?.size||0);
 if(!/\.tiff?$/.test(name)||!crs||crs>=32767||!Array.isArray(b)||b.length!==4||
   !b.every(Number.isFinite)||b[2]<=b[0]||b[3]<=b[1]||!Number.isSafeInteger(size)||size<0)return null;
 return {name,crs,b:[...b],size,signature:JSON.stringify([name,crs,b,size])};
}
async function legacyOrthoMatchesFile(identity,file,stored,current){
 const filename=value=>normalize(String(value||'').split(/[\\/]/).pop());
 if(!identity||!current()||filename(file.name)!==identity.name||filename(stored.name)!==identity.name||
   identity.size&&identity.size!==file.size)return false;
 let tiff;
 try{
  await ensureGeoTIFF();if(!current())return false;
  tiff=await wait(rasterImportOpen(file));if(!current())return false;
  const image=await wait(tiff.getImage(0));if(!current())return false;
  const bb=image.getBoundingBox(),W=image.getWidth(),H=image.getHeight(),keys=image.getGeoKeys?.()||{},
   epsg=Number(keys.ProjectedCSTypeGeoKey||keys.GeographicTypeGeoKey);
  if(!Number.isInteger(epsg)||epsg<=0||epsg>=32767||epsg!==identity.crs||image.getSamplesPerPixel()<3||
    !Number.isSafeInteger(W)||!Number.isSafeInteger(H)||W<=0||H<=0||
    !Array.isArray(bb)||bb.length!==4||!bb.every(Number.isFinite)||bb[2]<=bb[0]||bb[3]<=bb[1])return false;
  const pixelX=(bb[2]-bb[0])/W,pixelY=(bb[3]-bb[1])/H;
  return identity.b.every((v,i)=>Math.abs(v-bb[i])<=(i%2?pixelY:pixelX))&&current();
 }finally{if(tiff)root.GeoMineRasterImport?.release?.(tiff);}
}
async function resolve(item,kind){
 // Hash once before lookup and once at the final authorization boundary. The
 // inner capability lookups use identity guards; in-place edits are still
 // rejected by the full content guard before a verified source is returned.
 const bound=preview(item,kind),unchanged=context(item,kind,bound),current=quickContext(item,kind),
  prefix=base(),d=descriptor(item,kind,bound),expected=expectedOriginal(item,kind,bound),
  legacy=kind==='ortho'?legacyOrthoIdentity(item):null,
  legacyCurrent=()=>unchanged()&&legacy&&legacyOrthoIdentity(item)?.signature===legacy.signature;
 if(blocked(item,kind,bound))return null;
 let record=await get(d?prefix+'source:'+encodeURIComponent(d.id):alias(item,kind));
 if(!record&&d&&current())record=await get(alias(item,kind));
 if(expected&&current()&&(!record||record.descriptor?.fingerprint!==expected.fingerprint||record.descriptor?.size!==expected.size||!isFile(record.handle)&&!record.cache)){
  const known=await findFingerprint(kind,expected,current);
  if(known)record=known;
 }
 if(!current()||record?.projectId!==S.projectId||record.ownerUid!==owner()||record.kind!==kind)return null;
 const stored=record.descriptor;
 if(stored?.v!==1)return null;
 const sameBytes=expected&&stored.size===expected.size&&stored.fingerprint===expected.fingerprint;
 if(expected&&!sameBytes)return null;
 const unknownPreview=!sameBytes&&!d&&!(record.previews||[stored.preview]).includes(bound),
  legacyProof=!sameBytes&&!d&&record.legacyOrthoPreviews?.find(p=>p.preview===bound),
  migrateLegacy=unknownPreview&&kind==='ortho'&&legacy&&stored.kind==='ortho';
 if(legacyProof&&(!legacy||legacyProof.signature!==legacy.signature))return null;
 if(unknownPreview&&!migrateLegacy){if(kind!=='ortho')stale.add(item);return null;}
 if(d&&!sameBytes)return null;
 try{
  let file=null,handle=null,device=false;
  const sourceKey=prefix+'source:'+encodeURIComponent(stored.id),volatile=volatileRecords.has(sourceKey);
  if(await allowed(record.handle)&&current()){
   file=await wait(record.handle.getFile());handle=record.handle;
  }else if(record.cache&&!volatile&&current()){
   // A file-input selection on iPad remains in sessionFiles, but that object
   // can still be a cloud-provider proxy. Once the verified OPFS copy AND its
   // IndexedDB descriptor are committed, prefer the stable random-access copy
   // immediately. A volatile record must stay session-only even if a complete
   // orphan file exists in OPFS after an IndexedDB publication failure.
   file=await cachedFile(record,quickContext(item,kind));device=!!file;
  }
  if(!file&&!isFile(record.handle))file=sessionFiles.get(sourceKey)||null;
  if(!current())return null;
  if(!file&&!volatile){file=await cachedFile(record,quickContext(item,kind));device=!!file;}
  if(!file||!current()||file.size!==stored.size)return null;
  if(await wait(projectNativeFingerprint(file))!==stored.fingerprint||!unchanged())return null;
  if(migrateLegacy){
   // Older imports kept only the new PNG identity. The existing capability is
   // already scoped to this account/project and its bytes were verified above;
   // validate the old JPEG's complete georeference before adding its alias.
   if(!await legacyOrthoMatchesFile(legacy,file,stored,legacyCurrent))return null;
   const layerKey=alias(item,kind),latest=await get(layerKey);
   if(!legacyCurrent()||latest!==record)return null;
   const previews=[...new Set([bound,...(record.previews||[stored.preview])])].slice(0,8);
   record={...record,previews,legacyOrthoPreviews:[{preview:bound,signature:legacy.signature},
    ...(record.legacyOrthoPreviews||[]).filter(p=>p.preview!==bound&&previews.includes(p.preview))]};
   await put(sourceKey,record);if(!legacyCurrent())return null;
   await put(layerKey,record);if(!legacyCurrent())return null;
   await put(fingerprintKey(kind,stored.fingerprint),record);if(!legacyCurrent())return null;
  }else if(legacyProof&&!legacyCurrent())return null;
  storageState(item,kind,volatileRecords.has(prefix+'source:'+encodeURIComponent(stored.id))?'session-only':
   handle?'handle':device?'device':'session-only');
  const result={file,handle,descriptor:{...stored,preview:bound,lastModified:+file.lastModified||0},record,project:S.projectId,account:owner(),gen:generation(),
   ...((migrateLegacy||legacyProof)?{legacyOrthoSignature:legacy.signature}:{})};
  verified.add(result);return result;
 }catch(_){return null;}
}
function adopt(item,kind,source){
 if(!verified.has(source)||source.project!==S.projectId||source.account!==owner()||source.gen!==generation()||
   source.descriptor.kind!==kind||source.descriptor.preview!==preview(item,kind)||
   source.legacyOrthoSignature&&legacyOrthoIdentity(item)?.signature!==source.legacyOrthoSignature||
   !(kind==='ortho'?S.img===item:(S.rasters||[]).includes(item)))return false;
 item.originalSource={...source.descriptor,preview:preview(item,kind)};capture(source.file,source.handle);stale.delete(item);return true;
}
const ready=(item,kind)=>kind==='ortho'?!!(item?._img0&&item?._tiff):projectRasterReady(item);
function needsOrtho(item){return !!item?.url&&!ready(item,'ortho')&&
 !(/\.(png|jpe?g|webp)$/i.test(item.src?.file||item.name||'')&&!item.originalSource&&!item.projectNativeSource&&!item.projectFile);}
function missing(){return [...(S.rasters||[]).filter(r=>r?.d&&!r.tinPuro&&!ready(r,'raster')).map(item=>({item,kind:'raster'})),
 ...(needsOrtho(S.img)?[{item:S.img,kind:'ortho'}]:[])];}
function names(item){return [...new Set([item.originalSource?.name,item.src?.file,item.srcName,item.name&&item.name+'.tif',item.name&&item.name+'.tiff'].filter(Boolean).map(s=>normalize(String(s).split(/[\\/]/).pop())))];}
async function folderRecords(){const rows=await get(folderKey());return Array.isArray(rows)?rows.filter(r=>r.projectId===S.projectId&&r.ownerUid===owner()&&r.handle?.kind==='directory'):[];}
async function scanFolder(record,current){
 const result=new Map();if(!await allowed(record.handle)||!current())return result;
 let count=0,limited=false;const started=Date.now();
 async function visit(dir,path,depth){
  if(!current()||depth>8||count>=20000||Date.now()-started>20000){limited=true;return;}
  const iterator=dir.entries();while(true){
   const next=await wait(iterator.next());if(next.done)break;const [name,h]=next.value;
   if(!current())return;if(++count>20000||Date.now()-started>20000){limited=true;return;}
   const relativePath=path?path+'/'+name:name;
   if(h.kind==='directory')await visit(h,relativePath,depth+1);
   else if(/\.tiff?$/i.test(name)){
    const key=normalize(name),rows=result.get(key)||[];rows.push({handle:h,relativePath,folderName:record.handle.name});result.set(key,rows);
   }
  }
 }
 try{await visit(record.handle,'',0);}catch(e){if(current())try{cmdLog('Não foi possível concluir a busca na pasta '+record.handle.name+': '+e.message,'warn');}catch(_){} }
 if(limited&&current())try{cmdLog('A pasta contém muitos arquivos. Indique uma subpasta para localizar os TIFFs restantes.','warn');}catch(_){}
 return result;
}
async function bindCandidate(item,kind,handle,location,current){
 const unchanged=context(item,kind),valid=()=>current()&&unchanged();
 if(!valid()||blocked(item,kind)||!await allowed(handle)||!valid())return false;
 try{
  const file=await wait(handle.getFile());if(!valid())return false;
  capture(file,handle);
  const d=descriptor(item,kind);
  const expectedSize=Number(item.originalSource?.size||item.src?.size);
  if(expectedSize>0&&file.size!==expectedSize)return false;
  if(d&&(file.size!==d.size||await wait(projectNativeFingerprint(file))!==d.fingerprint))return false;
  if(!valid())return false;
  // Previously verified sources use the header-only restoration path. Legacy
  // sources require the existing content/extent validation before being kept.
  let ok;
  if(d){
   capture(file,handle);await remember(item,kind,handle,file,location);if(!valid())return false;
   ok=kind==='raster'?await projectRestoreNativeRaster(item):(await projectRestoreNativeOrtho()).restored>0;
  }else if(kind==='raster'){
   const sig=item.d?._sig||item.src?.sig||(typeof assinaturaMDT==='function'?assinaturaMDT(item.d):null);
   if(!sig)return false;
   ok=await religaFonte(item,file,{expectedSignature:sig,isCurrent:valid});
  }else{
   // A legacy image has no byte fingerprint yet. A filename in a chosen
   // folder must cover the complete stored extent, not merely overlap it.
   await ensureGeoTIFF();const tiff=await wait(rasterImportOpen(file)),image=await wait(tiff.getImage(0));
   const bb=image.getBoundingBox(),b=item.b,W=image.getWidth(),H=image.getHeight(),keys=image.getGeoKeys?.()||{},
    epsg=keys.ProjectedCSTypeGeoKey||keys.GeographicTypeGeoKey,crs=typeof orthoCRS==='function'?orthoCRS(item):S.workCRS;
   const tolerance=bb&&W>0&&H>0?3*Math.max(Math.abs((bb[2]-bb[0])/W),Math.abs((bb[3]-bb[1])/H)):0;
   const matches=image.getSamplesPerPixel()>=3&&Array.isArray(bb)&&Array.isArray(b)&&bb.length===4&&b.length===4&&
    bb.every((v,i)=>Number.isFinite(v)&&Number.isFinite(b[i])&&Math.abs(v-b[i])<=tolerance)&&
    (!epsg||!crs||Number(String(crs).replace(/^EPSG:/i,''))===Number(epsg));
   root.GeoMineRasterImport?.release?.(tiff);
   if(!matches||!valid())return false;
   ok=await ortoReligarTIFF(file,{restoreNative:true,isCurrent:valid});
  }
  if(!ok||!current())return false;
  // Successful relinks replace raster.d; construct a fresh guarded context.
  const linked=context(item,kind);if(!linked())return false;
  await remember(item,kind,handle,file,location);if(!linked())return false;
  // Both raster attachment paths already commit and render once.
  if(kind==='ortho'){S.orthoHD=true;S.orthoDispFull=true;syncOrthoTiles();}
  return true;
 }catch(e){try{if(e.name!=='AbortError')console.warn('Original não vinculado:',item.name,e);}catch(_){}return false;}
}
async function searchFolders(current,folders,contexts=new Map(missing().map(({item,kind})=>[item,context(item,kind)]))){
 let restored=0;for(const folder of folders){
  if(!current()||!missing().length)break;const index=await scanFolder(folder,current);
  for(const {item,kind} of missing()){
   if(!current())return restored;if(!contexts.get(item)?.())continue;
   if(blocked(item,kind))continue;
   const candidates=[...new Set(names(item).flatMap(name=>index.get(name)||[]))];
   // Without verified bytes, a duplicate filename is ambiguous. A narrower
   // folder or an individual file selection can disambiguate it explicitly.
   if(!descriptor(item,kind)&&candidates.length>1)continue;
   for(const candidate of candidates){if(!current())return restored;
    if(await bindCandidate(item,kind,candidate.handle,candidate,current)){restored++;break;}
   }
  }
 }return restored;
}
async function restoreAll(){
 const project=S.projectId,account=owner(),gen=generation(),key=base()+':restore';
 const existing=jobs.get(key);if(existing?.gen===gen)return existing.promise;
 const current=()=>S.projectId===project&&owner()===account&&generation()===gen;
 const contexts=new Map(missing().map(({item,kind})=>[item,context(item,kind)]));
 const job={gen};job.promise=(async()=>{
  const raster=await projectRestoreNativeRasters();if(!current())return {stale:true,restored:0};
  const ortho=await projectRestoreNativeOrtho();if(!current())return {stale:true,restored:0};
  let restored=raster.restored+(ortho?.restored||0);
  // Migrate old raster handles only when both name and saved data signature
  // identify the source; the legacy geometry-only key is not an identity.
  for(const {item,kind} of missing()){
   if(!current())return {stale:true,restored};
   if(!contexts.get(item)?.()||blocked(item,kind)||kind!=='raster'||!(item.d?._sig||item.src?.sig)||typeof recuperaFonte!=='function'||owner()!=='offline')continue;
   const handle=await recuperaFonte(item);
   if(handle&&names(item).includes(normalize(handle.name))&&await bindCandidate(item,kind,handle,{},current))restored++;
  }
  if(current()&&missing().length)restored+=await searchFolders(current,await folderRecords(),contexts);
  if(current()&&restored&&typeof refreshUI==='function')refreshUI();
  return {restored,missing:current()?missing().length:0,stale:!current()};
 })().finally(()=>{if(jobs.get(key)===job)jobs.delete(key);});jobs.set(key,job);return job.promise;
}
function chooseFolder(){
 if(!root.showDirectoryPicker)return Promise.resolve(false);
 const project=S.projectId,account=owner(),gen=generation(),key=folderKey();
 const current=()=>S.projectId===project&&owner()===account&&generation()===gen;
 const contexts=new Map(missing().map(({item,kind})=>[item,context(item,kind)]));
 // Call the native picker in the click turn, before storage/permission awaits.
 const choosing=root.showDirectoryPicker({id:'geomine-image-originals',mode:'read'});
 return Promise.resolve(choosing).then(async handle=>{
  if(!handle||!current())return false;
  const rows=await folderRecords();if(!current())return false;
  const kept=[];for(const row of rows){let same=row.handle===handle;try{same=same||await row.handle.isSameEntry(handle);}catch(_){}if(!same)kept.push(row);}
  const record={v:1,projectId:project,ownerUid:account,handle};kept.push(record);if(!current())return false;
  await put(key,kept);if(!current())return false;
  await searchFolders(current,[record],contexts);return current();
 });
}
function startIn(item,kind){
 if(blocked(item,kind))return undefined;const d=descriptor(item,kind),record=memory.get(d?base()+'source:'+encodeURIComponent(d.id):alias(item,kind));
 if(!record||record.ownerUid!==owner()||record.projectId!==S.projectId||record.kind!==kind||d&&(record.descriptor?.id!==d.id||record.descriptor?.fingerprint!==d.fingerprint))return undefined;
 return isFile(record.handle)?record.handle:undefined;
}
async function stageFile(file,control={}){
 const n=root.navigator||{},ios=/iPad|iPhone|iPod/i.test(n.userAgent||'')||/Mac/i.test((n.platform||'')+' '+(n.userAgent||''))&&n.maxTouchPoints>1;
 const stable=file&&stableFiles.get(file);if(stable&&(stable.project!==S.projectId||stable.owner!==owner()))throw storageFailure('AbortError','A cópia local pertence a outra sessão.');
 if(!ios||!file||!Number.isSafeInteger(file.size)||file.size<64*1024*1024||stable||typeof file.slice!=='function')return file;
 const projectId=S.projectId,ownerUid=owner(),gen=generation(),current=()=>S.projectId===projectId&&owner()===ownerUid&&generation()===gen&&!control.signal?.aborted&&(!control.isCurrent||control.isCurrent());
 // Orthophotos reuse a verified device copy even when space is now too
 // low for another copy. Single-band imports keep their quota preflight.
 checkCopy(current);
 if(control.sourceKind!=='ortho'){
  const storage=n.storage;
  if(!storage?.getDirectory||!storage?.estimate)return file;
  try{
   const estimate=await wait(storage.estimate());checkCopy(current);
   const available=Number(estimate?.quota)-Number(estimate?.usage);
   if(!Number.isFinite(available)||available<file.size+CACHE_MARGIN)return file;
  }catch(e){checkCopy(current);return file;}
 }
 const fingerprint=await wait(projectNativeFingerprint(file));checkCopy(current);
 const stageKey=base()+'staged:'+fingerprint+':'+file.size,prior=stagedFiles.get(file)||await get(stageKey);checkCopy(current);
 const descriptor={name:file.name||'original.tif',size:file.size,lastModified:+file.lastModified||0,fingerprint},
  record={v:1,projectId,ownerUid,descriptor,handle:null,...(prior?.projectId===projectId&&prior.ownerUid===ownerUid&&prior.descriptor?.fingerprint===fingerprint?{cache:prior.cache}:{})};
 const item={name:descriptor.name,_stageProgress:p=>{if(current()&&p.total)showLoad('Preparando TIFF neste aparelho — '+Math.floor(100*p.loaded/p.total)+'% ('+Math.floor(p.loaded/1048576)+' de '+Math.ceil(p.total/1048576)+' MB)');}};
 const copying=cacheQueue.then(()=>cacheOriginal(item,'ortho',file,record,current,current));cacheQueue=copying.catch(()=>{});
 try{record.cache=await copying;checkCopy(current);const local=await cachedFile(record,current);checkCopy(current);if(!local)throw Error('A cópia local não pôde ser conferida.');
  stableFiles.set(local,{project:projectId,owner:ownerUid});stagedFiles.set(file,record);await put(stageKey,record);checkCopy(current);return local;
 }catch(e){
  if(e.name==='AbortError')throw e;
  // Lack of space for a second copy does not prevent bounded tile reads.
  // A provider read failure still propagates; do not decode an incomplete file.
  if(['QuotaExceededError','NotSupportedError','NotAllowedError','SecurityError'].includes(e.name)){
    checkCopy(current);
    return file;
  }
  throw storageFailure(e.name||'Error','Não foi possível preparar o TIFF antes da leitura. '+storageMessage(e));
 }
}
root.GeoMineOriginalSources={capture,remember,rememberFile,resolve,adopt,validated,forSave,restoreAll,chooseFolder,missing,needsOrtho,persistence,startIn,stageFile};
})(window);
