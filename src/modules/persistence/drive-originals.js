/* ORIGINAIS NO GOOGLE DRIVE
   O projeto guarda só a prévia dos rasters. Os arquivos originais (TIFF do MDT
   e da ortofoto) ficam no Drive, e a pessoa tinha de procurá-los à mão a cada
   aparelho novo. Com a leitura do Drive autorizada, este módulo:
     · ao abrir o projeto, procura no Drive cada original que falta, pelo nome
       e pelo tamanho em bytes que o projeto gravou;
     · baixa o arquivo para o armazenamento deste aparelho;
     · entrega o arquivo ao mesmo caminho de conferência e vínculo usado quando
       a pessoa escolhe o arquivo à mão (nada aqui decide que um arquivo "serve").
   Nada é gravado, movido ou apagado no Drive. */
(function(root){
'use strict';
if(root.GeoMineDriveOriginals)return;
const API='https://www.googleapis.com/drive/v3/files',TEMP='geomine-originais-do-drive',FOLDER_KEY='geomine.drive.pasta.originais.v1';
const ID=/^[\w-]{1,200}$/,TIFF=/\.tiff?$/i,MiB=1048576,BLOCK=4*MiB;
/* Sem a pessoa pedir, não se baixa um arquivo enorme: acima disto, o original
   só vem do Drive quando ela toca em Buscar no Google Drive. */
const AUTO_LIMIT=1536*MiB;
const provider=()=>root.GeoMineCloudProvider,generation=()=>root.GeoMineSessionAutosave?.state?.generation;
const log=(message,type)=>{try{cmdLog(message,type);}catch(_){}} ,say=message=>{try{toast(message);}catch(_){}};
const megabytes=bytes=>(bytes/MiB).toLocaleString('pt-BR',{maximumFractionDigits:bytes<100*MiB?1:0})+' MB';
let running=null,cleaned=false;

function available(){return !!provider()?.driveAccess&&typeof fetch==='function';}
async function token(interactive){return provider().driveAccess(!!interactive);}
async function call(url,options={}){
  const access=await token(false);
  const response=await fetch(url,{headers:{Authorization:'Bearer '+access,...(options.headers||{})},signal:options.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  if(response.status===401){provider().clearDriveAccess?.();throw Object.assign(Error('A sessão do Google Drive expirou.'),{code:'drive-session'});}
  if(response.status===403)throw Object.assign(Error('Esta conta não autorizou a leitura dos arquivos do Google Drive.'),{code:'drive-permission'});
  if(!response.ok)throw Error('O Google Drive respondeu HTTP '+response.status+'.');
  return response;
}
/* Nomes sob os quais o original pode estar no Drive e o tamanho que o projeto
   gravou. Sem tamanho gravado, só um resultado único é aceito como candidato. */
function names(item){
  const base=value=>String(value||'').split(/[\\/]/).pop().trim();
  return [...new Set([item.originalSource?.name,item.src?.file,item.srcName,item.src?.path,item.name&&item.name+'.tif',item.name&&item.name+'.tiff']
    .map(base).filter(name=>name&&TIFF.test(name)))];
}
const expectedSize=item=>Number(item.originalSource?.size)||Number(item.src?.size)||0;
async function search(name,signal){
  const query=new URLSearchParams({q:"name = '"+name.replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"' and trashed = false",pageSize:'50',
    fields:'files(id,name,size,parents,modifiedTime,resourceKey,driveId)',supportsAllDrives:'true',includeItemsFromAllDrives:'true',corpora:'allDrives'});
  return (await (await call(API+'?'+query,{signal})).json()).files||[];
}
async function find(item,signal,largest){
  const size=expectedSize(item),folder=projectFolder();let found=[];
  for(const name of names(item)){
    const files=(await search(name,signal)).filter(f=>ID.test(f.id||'')&&Number(f.size)>0&&(!size||Number(f.size)===size));
    found=found.concat(files);if(files.length&&size)break;
  }
  const unique=[...new Map(found.map(f=>[f.id,f])).values()];
  if(!unique.length)return {status:'not-found'};
  // Com o tamanho gravado, qualquer cópia de mesmo nome e mesmos bytes serve;
  // prefere a que está na pasta do projeto. Sem tamanho, só aceita candidato único.
  // Quando é a pessoa que pede a busca (largest), várias cópias de mesmo nome
  // não param a busca: a maior é a de resolução nativa (as menores são cópias
  // reduzidas, como as de ALAGIS/rasters) e cópias de mesmo tamanho são o
  // mesmo arquivo. Na busca automática, ao abrir o projeto, continua sem
  // baixar nada quando há dúvida.
  if(!size&&unique.length>1){
    if(!largest)return {status:'ambiguous',count:unique.length};
    const biggest=Math.max(...unique.map(f=>Number(f.size)));
    unique.splice(0,unique.length,...unique.filter(f=>Number(f.size)===biggest));
  }
  unique.sort((a,b)=>Number((b.parents||[]).includes(folder))-Number((a.parents||[]).includes(folder))||Date.parse(b.modifiedTime||0)-Date.parse(a.modifiedTime||0));
  return {status:'found',file:unique[0]};
}
function projectFolder(){try{return localStorage.getItem('geomine.drive.pasta.v1')||'';}catch(_){return '';}}
function rememberFolder(id){if(id&&ID.test(id))try{localStorage.setItem(FOLDER_KEY,id);}catch(_){}}
function lastFolder(){try{return localStorage.getItem(FOLDER_KEY)||projectFolder();}catch(_){return '';}}

/* Gravação no armazenamento do aparelho. createWritable onde existe; no
   iPad (WebKit) a escrita síncrona só existe dentro de um Worker. */
function writerWorker(){
  let access=null;
  self.onmessage=async({data:q})=>{
    try{
      if(q.type==='open')access=await q.handle.createSyncAccessHandle();
      else if(q.type==='write'){const bytes=new Uint8Array(q.bytes);let done=0;
        while(done<bytes.length){const n=access.write(bytes.subarray(done),{at:q.offset+done});if(!(n>0))throw new Error('Falha ao gravar o original neste aparelho.');done+=n;}}
      else if(q.type==='close'){access.truncate(q.size);access.flush();access.close();access=null;}
      else if(q.type==='abort'){if(access)access.close();access=null;}
      self.postMessage({id:q.id,ok:true});
    }catch(e){if(access)try{access.close();}catch(_){}access=null;self.postMessage({id:q.id,ok:false,message:e?.message||String(e)});}
  };
}
async function openWriter(handle){
  if(typeof handle.createWritable==='function'){
    try{const stream=await handle.createWritable();
      return {write:(bytes,offset)=>stream.write({type:'write',position:offset,data:bytes}),close:()=>stream.close(),abort:()=>stream.abort().catch(()=>{})};
    }catch(_){/* cai para o Worker */}
  }
  const url=URL.createObjectURL(new Blob(['('+writerWorker.toString()+')()'],{type:'text/javascript'})),worker=new Worker(url),pending=new Map();let sequence=0;
  const request=(type,data={},transfer=[])=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,type,...data},transfer);});
  worker.onmessage=({data:q})=>{const p=pending.get(q.id);if(!p)return;pending.delete(q.id);q.ok?p.resolve():p.reject(Error(q.message));};
  worker.onerror=event=>{for(const p of pending.values())p.reject(Error(event.message||'Falha na gravação local.'));pending.clear();};
  const stop=()=>{try{worker.terminate();}catch(_){}URL.revokeObjectURL(url);};
  try{await request('open',{handle});}catch(e){stop();throw e;}
  return {write:(bytes,offset)=>request('write',{bytes:bytes.buffer,offset},[bytes.buffer]),
    close:async size=>{try{await request('close',{size});}finally{stop();}},abort:async()=>{try{await request('abort');}catch(_){}finally{stop();}}};
}
async function tempDirectory(){
  if(!navigator.storage?.getDirectory)return null;
  const rootDirectory=await navigator.storage.getDirectory(),directory=await rootDirectory.getDirectoryHandle(TEMP,{create:true});
  // Sobras de sessões anteriores: o que foi vinculado já tem cópia própria no aparelho.
  if(!cleaned){cleaned=true;try{for await(const name of directory.keys())await directory.removeEntry(name).catch(()=>{});}catch(_){}}
  return directory;
}
async function download(file,{signal,onProgress}={}){
  const size=Number(file.size)||0,source={kind:'drive',id:file.id,resourceKey:file.resourceKey||''};
  try{const estimate=await navigator.storage?.estimate?.();
    // O vínculo guarda uma segunda cópia para reabrir sozinho: precisa caber duas vezes.
    if(estimate?.quota&&size&&estimate.quota-(estimate.usage||0)<size*2.1)
      throw Object.assign(Error('Não há espaço neste aparelho para baixar “'+file.name+'” ('+megabytes(size)+').'),{code:'storage'});
  }catch(e){if(e.code==='storage')throw e;}
  const headers={};if(source.resourceKey&&/^[\w-]+$/.test(source.resourceKey))headers['X-Goog-Drive-Resource-Keys']=source.id+'/'+source.resourceKey;
  const response=await call(API+'/'+encodeURIComponent(file.id)+'?alt=media&supportsAllDrives=true',{signal,headers});
  const directory=await tempDirectory().catch(()=>null),reader=response.body?.getReader?.();
  if(!directory||!reader){const blob=await response.blob();return new File([blob],file.name,{lastModified:Date.parse(file.modifiedTime)||Date.now()});}
  const safe=String(file.name).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_'),handle=await directory.getFileHandle(safe,{create:true}),writer=await openWriter(handle);
  let offset=0,buffer=new Uint8Array(BLOCK),filled=0,last=0;
  const flush=async()=>{if(!filled)return;const part=buffer.slice(0,filled);await writer.write(part,offset);offset+=filled;filled=0;
    if(Date.now()-last>250){last=Date.now();onProgress?.(offset,size);}};
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      if(signal?.aborted)throw Object.assign(Error('Download cancelado.'),{name:'AbortError'});
      for(let read=0;read<value.byteLength;){const n=Math.min(BLOCK-filled,value.byteLength-read);buffer.set(value.subarray(read,read+n),filled);filled+=n;read+=n;if(filled===BLOCK)await flush();}
    }
    await flush();await writer.close(offset);
  }catch(e){await writer.abort();try{await directory.removeEntry(safe);}catch(_){}throw e;}
  if(size&&offset!==size)throw Error('O download de “'+file.name+'” veio incompleto ('+megabytes(offset)+' de '+megabytes(size)+').');
  onProgress?.(offset,size||offset);
  return handle.getFile();
}
/* O arquivo baixado passa pela MESMA conferência de quem escolhe à mão. */
async function attach(item,kind,file){
  if(kind==='raster')return typeof rasEscolherNativoAgora==='function'?!!(await rasEscolherNativoAgora(item,{file})):false;
  if(kind==='ortho'&&S.img===item&&typeof ortoReligarTIFF==='function'){
    const ok=!!(await ortoReligarTIFF(file));
    if(ok)try{await root.GeoMineOriginalSources?.rememberFile?.(item,'ortho',file);}catch(_){}
    return ok;
  }
  return false;
}
function missing(){
  try{return (root.GeoMineOriginalSources?.missing?.()||[]).filter(row=>row?.item&&(row.kind==='raster'||row.kind==='ortho'));}catch(_){return [];}
}
async function one(item,kind,options={}){
  const label=item.name||'original',project=S.projectId,gen=generation(),current=()=>S.projectId===project&&generation()===gen;
  if(!names(item).length)return {status:'no-name',label};
  const located=options.file?{status:'found',file:options.file}:await find(item,options.signal,!!options.interactive&&kind==='raster');
  if(!current())return {status:'stale',label};
  if(located.status!=='found')return {...located,label};
  const file=located.file;
  if(!options.interactive&&!options.file&&Number(file.size)>AUTO_LIMIT)return {status:'large',label,name:file.name,size:Number(file.size)};
  log('Baixando do Google Drive: '+file.name+' ('+megabytes(Number(file.size)||0)+')…','etapa');
  let shown=-1;
  const local=await download(file,{signal:options.signal,onProgress:(loaded,total)=>{
    const percent=total?Math.floor(100*loaded/total):0;if(percent===shown)return;shown=percent;
    try{root.GeoMineLoadProgress?.show('Baixando '+file.name+' do Google Drive — '+percent+'%');}catch(_){}
  }});
  try{root.GeoMineLoadProgress?.end();}catch(_){}
  if(!current())return {status:'stale',label};
  rememberFolder((file.parents||[])[0]);
  const ok=await attach(item,kind,local);
  return {status:ok?'linked':'refused',label,name:file.name};
}
/* Procura, baixa e vincula todos os originais que faltam. interactive:true só
   quando a pessoa tocou num botão: aí pode abrir a autorização do Google. */
function restore(options={}){
  if(running)return running;
  const job=(async()=>{
    const rows=options.item?[{item:options.item,kind:options.kind}]:missing();
    if(!rows.length||!available())return {linked:0,rows:[]};
    try{await token(!!options.interactive);}
    catch(e){
      if(options.interactive)throw e;
      return {linked:0,rows:[],needsSession:true};
    }
    const results=[];
    for(const {item,kind} of rows){
      try{results.push(await one(item,kind,options));}
      catch(e){
        try{root.GeoMineLoadProgress?.end();}catch(_){}
        if(e.code==='drive-session'||e.code==='drive-permission'){results.push({status:e.code,label:item.name,message:e.message});break;}
        results.push({status:'error',label:item.name,message:e.message||String(e)});
      }
    }
    const linked=results.filter(r=>r.status==='linked');
    for(const r of results){
      if(r.status==='linked')continue;   // o aviso abaixo já registra
      if(r.status==='not-found')log('Original de “'+r.label+'” não encontrado no Google Drive pelo nome'+(options.interactive?'.':' gravado no projeto.'),'avisa');
      else if(r.status==='ambiguous')log('Há '+r.count+' arquivos com o nome do original de “'+r.label+'” no Drive e o projeto não gravou o tamanho: escolha o arquivo.','avisa');
      else if(r.status==='large')log('O original “'+r.name+'” tem '+megabytes(r.size)+': não foi baixado sozinho. Toque em Buscar no Google Drive para baixá-lo.','avisa');
      else if(r.status==='refused')log('“'+r.name+'” foi baixado do Drive, mas não passou na conferência com “'+r.label+'”.','avisa');
      else if(r.message)log('Original de “'+r.label+'”: '+r.message,'avisa');
    }
    if(linked.length)say(linked.length===1?'Original vinculado a partir do Google Drive: '+linked[0].name:linked.length+' originais vinculados a partir do Google Drive');
    return {linked:linked.length,rows:results};
  })();
  running=job.finally(()=>{if(running===wrapped)running=null;});
  const wrapped=running;return wrapped;
}
/* Escolha manual, já na pasta onde o último original foi encontrado. */
async function choose(item,kind){
  if(!root.GeoMineDriveProject?.pick)throw Error('Seletor do Google Drive indisponível.');
  const picked=await root.GeoMineDriveProject.pick({title:'Escolher o arquivo original',parent:lastFolder()});
  await token(false);
  const meta=await (await call(API+'/'+encodeURIComponent(picked.id)+'?fields=id,name,size,parents,modifiedTime,resourceKey&supportsAllDrives=true')).json();
  return restore({item,kind,interactive:false,file:{...meta,resourceKey:meta.resourceKey||picked.resourceKey||''}});
}
/* Ao abrir ou retomar um projeto, depois da procura no próprio aparelho. */
function install(){
  const sources=root.GeoMineOriginalSources;
  if(!sources||typeof sources.restoreAll!=='function'||sources.restoreAll._drive)return !!sources;
  const base=sources.restoreAll;
  sources.restoreAll=async function(){
    const result=await base.apply(this,arguments);
    setTimeout(()=>{restore({interactive:false}).catch(e=>log('Originais no Google Drive: '+(e.message||e),'avisa'));},600);
    return result;
  };
  sources.restoreAll._drive=true;return true;
}
if(!install())document.addEventListener('DOMContentLoaded',install,{once:true});
root.GeoMineDriveOriginals={restore,choose,available,missing};
})(window);
