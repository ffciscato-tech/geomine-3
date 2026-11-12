/* One recovery checkpoint for an explicit mobile TIFF import. It never
   overwrites the .ccmgis file or starts a continuous autosave. */
(function(root){
'use strict';if(root.GeoMineImportRecovery)return;
const nav=root.navigator||{},mobile=/Android|iPad|iPhone|iPod/i.test(nav.userAgent||'')||/Mac/i.test(nav.platform||'')&&nav.maxTouchPoints>1;
const POINTER='geomine.tiff.recovery.v1',PREFIX='tiffImportRecovery:v1:',CHUNK=256*1024,MAX=200*1024*1024,MAX_CHUNKS=2000,AGE=8*3600000;
let busy=null,restoring=false,lastVersion=null;
const session=()=>root.GeoMineSessionAutosave?.state,
 owner=()=>root.GeoMineCloudProvider?.user?.uid||session()?.ownerUid||null,
 generation=()=>session()?.generation,
 content=()=>typeof hasContent==='function'&&hasContent();
function pointer(){try{return JSON.parse(sessionStorage.getItem(POINTER)||'null');}catch(_){return null;}}
function own(p){return !!p&&p.version===1&&p.owner===owner()&&typeof p.key==='string'&&p.key.startsWith(PREFIX+encodeURIComponent(p.owner||'offline')+':')&&Date.now()-p.at>=0&&Date.now()-p.at<AGE;}
function available(){return own(pointer());}
async function remove(keys){
 if(!keys.length||typeof idb!=='function')return;
 try{const db=await idb();await new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite'),store=tx.objectStore('kv');keys.forEach(k=>store.delete(k));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}catch(_){}
}
function forget(){lastVersion=null;const p=pointer();try{sessionStorage.removeItem(POINTER);}catch(_){}
 if(own(p)&&typeof idbGet==='function')void idbGet(p.key).then(m=>m&&Number.isInteger(m.count)&&m.count>=0&&m.count<=MAX_CHUNKS?remove([p.key,...Array.from({length:m.count},(_,i)=>p.key+':'+i)]):undefined).catch(()=>{});
}
function* tokens(value,seen=new WeakSet()){
 if(value===null||typeof value==='number'){yield JSON.stringify(value);return;}
 if(typeof value==='boolean'){yield value?'true':'false';return;}
 if(typeof value==='string'){yield '"';for(let i=0;i<value.length;i+=16384)yield JSON.stringify(value.slice(i,i+16384)).slice(1,-1);yield '"';return;}
 if(typeof value!=='object')throw Error('Valor não serializável no projeto.');
 if(typeof value.toJSON==='function'){yield* tokens(value.toJSON(),seen);return;}
 if(seen.has(value))throw Error('Referência circular no projeto.');seen.add(value);
 const array=Array.isArray(value);yield array?'[':'{';let first=true;
 const keys=array?null:Object.keys(value),length=array?value.length:keys.length;
 for(let i=0;i<length;i++){const k=array?i:keys[i];
  let v=value[k];if(v===undefined||typeof v==='function'||typeof v==='symbol'){if(!array)continue;v=null;}
  if(!first)yield ',';first=false;if(!array){yield JSON.stringify(k);yield ':';}yield* tokens(v,seen);
 }yield array?']':'}';seen.delete(value);
}
function* chunks(data){let pieces=[],length=0;
 for(const token of tokens(data)){pieces.push(token);length+=token.length;if(length>=CHUNK/2){yield pieces.join('');pieces=[];length=0;}}
 if(pieces.length)yield pieces.join('');
}
async function digest(buffer){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');}
async function checkpoint(control={}){
 const project=S.projectId,gen=generation(),account=owner(),old=pointer(),key=PREFIX+encodeURIComponent(account||'offline')+':'+(crypto.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2));
 let count=0,bytes=0,committed=false;const written=[];
 const data=projectData({borrowGeometry:true}),version=session()?.version;
 const valid=()=>!control.signal?.aborted&&S.projectId===project&&generation()===gen&&owner()===account&&session()?.version===version;
 const check=()=>{if(!valid())throw new DOMException('O projeto mudou ou a importação foi cancelada.','AbortError');};
 try{
  check();const encoder=new TextEncoder();
  for(const text of chunks(data)){
   check();const part=encoder.encode(text);bytes+=part.byteLength;if(bytes>MAX)throw Error('A cópia de recuperação excede 200 MB. Salve o projeto e reduza a área de trabalho antes de importar o TIFF neste dispositivo.');
   if(count>=MAX_CHUNKS)throw Error('A cópia de recuperação contém blocos demais. Salve o projeto antes de importar.');
   const entry={bytes:part.buffer,sha256:await digest(part.buffer)};check();const id=key+':'+count;
   await idbSet(id,entry);written.push(id);count++;
   showLoad('Protegendo o projeto antes do TIFF — '+(bytes/1048576).toFixed(1)+' MB…');
  }
  check();const tab=root.GeoMineProjectTabSession?.state?.().tabId||null;
  const meta={version:1,key,owner:account,tab,projectId:project,name:S.currentProjectName||S.auto?.name||'Projeto GeoMine',count,bytes,at:Date.now(),dirty:!!session()?.dirty,complete:true};
  await idbSet(key,meta);written.push(key);check();
  sessionStorage.setItem(POINTER,JSON.stringify({...meta,armed:true,attempts:0}));committed=true;lastVersion={project,gen,version};
  if(own(old)&&old.key!==key)void idbGet(old.key).then(m=>m&&Number.isInteger(m.count)&&m.count>=0&&m.count<=MAX_CHUNKS?remove([old.key,...Array.from({length:m.count},(_,i)=>old.key+':'+i)]):undefined).catch(()=>{});
  return meta;
 }catch(error){if(error.name==='AbortError')throw error;throw Error('A importação foi interrompida para preservar o projeto: não foi possível preparar a recuperação local. '+(error.message||error));}
 finally{if(!committed)void remove(written);}
}
async function before(control={}){
 if(!mobile||restoring||!content())return null;
 if(lastVersion?.project===S.projectId&&lastVersion.gen===generation()&&lastVersion.version===session()?.version&&available())return pointer();
 if(busy){await busy;return before(control);}
 const operation=checkpoint(control);busy=operation;
 try{return await operation;}finally{if(busy===operation)busy=null;}
}
async function recover(options={}){
 const p=pointer();if(!mobile||!own(p)||restoring)return false;
 if(!options.manual&&(!p.armed||p.attempts||content()&&(S.projectId!==p.projectId||session()?.dirty)))return false;
 if(!options.manual){const tab=root.GeoMineProjectTabSession?.state?.().tabId;
  if(p.tab&&tab&&p.tab!==tab)return false;
  if(!p.tab&&!['reload','back_forward'].includes(root.performance?.getEntriesByType?.('navigation')?.[0]?.type))return false;
 }
 const account=owner(),gen=generation(),version=session()?.version,project=S.projectId;
 const valid=()=>owner()===account&&generation()===gen&&session()?.version===version&&S.projectId===project;
 const attempted={...p,attempts:(p.attempts||0)+1};try{sessionStorage.setItem(POINTER,JSON.stringify(attempted));}catch(_){return false;}
 restoring=true;showLoad('Recuperando o projeto anterior à importação TIFF…');
 try{
  const meta=await idbGet(p.key);if(!valid()||!meta?.complete||meta.owner!==account||meta.projectId!==p.projectId||meta.count!==p.count||!Number.isInteger(meta.count)||meta.count<1||meta.count>MAX_CHUNKS||meta.bytes>MAX)throw Error('Cópia de recuperação inválida ou substituída.');
  const parts=[];let bytes=0;
  for(let i=0;i<meta.count;i++){
   if(!valid())throw new DOMException('Outro projeto foi aberto.','AbortError');const entry=await idbGet(p.key+':'+i);
   if(!entry?.bytes||entry.bytes.byteLength>CHUNK*2||await digest(entry.bytes)!==entry.sha256)throw Error('A cópia de recuperação está incompleta.');
   bytes+=entry.bytes.byteLength;parts.push(entry.bytes);
  }
  if(bytes!==meta.bytes)throw Error('A cópia de recuperação tem tamanho incorreto.');
  const blob=new Blob(parts,{type:'application/json'});parts.length=0;
  const text=await blob.text(),data=JSON.parse(text);
  if(!valid())throw new DOMException('Outro projeto foi aberto.','AbortError');
  if(!data||!['ALAGIS','CCMGIS','CCMGeoCampo'].includes(data.app)||data.projectId!==p.projectId)throw Error('O conteúdo não corresponde ao projeto protegido.');
  root.loadProject(data);sessionStorage.setItem(POINTER,JSON.stringify({...attempted,armed:false}));
  // loadProject intentionally suspends dirty tracking until its redraw ends.
  // Mark recovery only after that turn, and never mark a newly opened project.
  const loadedGeneration=generation();await new Promise(resolve=>setTimeout(resolve,0));
  if(S.projectId===p.projectId&&generation()===loadedGeneration)root.GeoMineSessionAutosave?.markDirty('projeto recuperado antes do TIFF');
  toast('Projeto recuperado. O TIFF não foi reimportado automaticamente; o salvamento do arquivo continua manual.');return true;
 }catch(error){if(error.name!=='AbortError')toast('Não foi possível recuperar o projeto: '+(error.message||error));return false;}
 finally{restoring=false;hideLoad();}
}
async function boot(){
 if(!mobile)return;
 const load=root.loadProject;if(typeof load==='function')root.loadProject=function(){if(!restoring&&!root.GeoMineProjectTabSession?.state?.().busy)forget();return load.apply(this,arguments);};
 const save=root.saveProject;if(typeof save==='function')root.saveProject=async function(){const result=await save.apply(this,arguments);if(result===true)forget();return result;};
 const start=async()=>{await root.GeoMineProjectTabSession?.ready;if(!root.GeoMineWorkspaceResume&&available())await recover();};
 if(session()?.booted)void start();else root.addEventListener('geomine:cloud-ready',()=>void start(),{once:true});
}
root.GeoMineImportRecovery={before,recover,available,forget,serializeChunks:chunks,get busy(){return !!busy;},__test:{tokens,chunks}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
