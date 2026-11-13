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
async function find(item,signal){
  const size=expectedSize(item),preferred=[originalsFolder(),projectFolder()].filter(Boolean);let found=[];
  for(const name of names(item)){
    const files=(await search(name,signal)).filter(f=>ID.test(f.id||'')&&Number(f.size)>0&&(!size||Number(f.size)===size));
    found=found.concat(files);if(files.length&&size)break;
  }
  const unique=[...new Map(found.map(f=>[f.id,f])).values()];
  if(!unique.length)return {status:'not-found'};
  const rank=f=>{const i=preferred.findIndex(id=>(f.parents||[]).includes(id));return i<0?preferred.length:i;};
  unique.sort((a,b)=>rank(a)-rank(b)||Date.parse(b.modifiedTime||0)-Date.parse(a.modifiedTime||0));
  // Com o tamanho gravado, qualquer cópia de mesmo nome e mesmos bytes serve;
  // prefere a que está na pasta dos originais ou do projeto. Sem tamanho, só
  // aceita candidato único, ou o único que está numa dessas pastas.
  if(!size&&unique.length>1){
    const inside=unique.filter(f=>rank(f)<preferred.length);
    if(inside.length!==1)return {status:'ambiguous',count:unique.length,parent:(unique[0].parents||[])[0]||''};
    return {status:'found',file:inside[0]};
  }
  return {status:'found',file:unique[0]};
}
/* Pastas lembradas por projeto (drive-project-source.js). */
const driveProject=()=>root.GeoMineDriveProject;
function projectFolder(){try{return driveProject()?.folderFor?.(S.projectId,'project')||'';}catch(_){return '';}}
function originalsFolder(){try{return driveProject()?.folderFor?.(S.projectId,'originals')||'';}catch(_){return '';}}
function rememberFolder(id){
  if(!id||!ID.test(id))return;
  try{driveProject()?.rememberFolderFor?.(S.projectId,'originals',id);localStorage.setItem(FOLDER_KEY,id);}catch(_){}
}
/* Pasta em que o seletor do Drive deve abrir para ESTE projeto: a do último
   original encontrado; senão a do arquivo do projeto (descoberta no Drive se
   o projeto veio pelo seletor do aparelho); senão a última usada. */
async function startFolder(signal){
  const own=originalsFolder()||projectFolder();if(own)return own;
  try{
    const record=root.GeoMineProjectTabSession?.state?.()?.record;
    const bound=record&&record.projectId===S.projectId?record:null;
    const folder=await driveProject()?.projectFolder?.({projectId:S.projectId,source:bound?.source,name:bound?.name||S.currentProjectName||'',signal});
    if(folder)return folder;
  }catch(e){if(e?.name==='AbortError')throw e;}
  try{const last=localStorage.getItem(FOLDER_KEY)||'';return ID.test(last)?last:(driveProject()?.lastFolder?.()||'');}catch(_){return '';}
}

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
  const located=options.file?{status:'found',file:options.file}:await find(item,options.signal);
  if(!current())return {status:'stale',label};
  if(located.status!=='found')return {...located,label};
  const file=located.file;
  if(!options.interactive&&!options.file&&Number(file.size)>AUTO_LIMIT)return {status:'large',label,name:file.name,size:Number(file.size)};
  const local=await fetchLocal(file,options.signal);
  if(!current())return {status:'stale',label};
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
      // Sem autorização do Drive nesta visita (ela vale 50 minutos e só pode
      // ser pedida a partir de um toque): diz onde tocar, em vez de calar.
      log(rows.length+(rows.length===1?' original não está neste aparelho':' originais não estão neste aparelho')+
        '. Toque em “Buscar no Google Drive” no aviso para baixá-lo'+(rows.length===1?'':'s')+' sem procurar a pasta.','avisa');
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
/* Metadados do arquivo escolhido no seletor do Drive. */
async function pickedFile(picked,signal){
  const meta=await (await call(API+'/'+encodeURIComponent(picked.id)+'?fields=id,name,size,parents,modifiedTime,resourceKey&supportsAllDrives=true',{signal})).json();
  return {...meta,resourceKey:meta.resourceKey||picked.resourceKey||''};
}
/* Escolha manual, já na pasta do projeto (ou do último original encontrado). */
async function choose(item,kind){
  if(!driveProject()?.pick)throw Error('Seletor do Google Drive indisponível.');
  await token(true);
  const picked=await driveProject().pick({title:'Original de “'+(item.name||'camada')+'”',parent:await startFolder(),parentLabel:'Pasta do projeto'});
  return restore({item,kind,interactive:false,file:await pickedFile(picked)});
}
/* LOCALIZAR O ORIGINAL A PARTIR DE UM TOQUE
   O seletor de arquivos do iPad (inclusive o "Google Drive" do Chrome) abre
   sempre na raiz e não aceita pasta inicial. Por isso, onde ele seria o único
   caminho, o toque em Localizar faz o trabalho pela pessoa:
     1. procura o arquivo no Drive pelo nome e tamanho gravados no projeto;
     2. não achando, abre o seletor do Google Drive do próprio GeoMine, já na
        pasta do projeto;
     3. baixa o arquivo e o devolve a quem chamou, que faz a conferência de
        sempre. O seletor do aparelho continua disponível na janela de apoio.
   Devolve {file}, {linked:true} (outra busca já vinculou) ou null (desistiu). */
function shouldLocate(){
  if(!available()||!provider()?.drivePickerConfig?.key||!driveProject()?.pick)return false;
  // No computador o seletor do sistema já abre na pasta certa e guarda o vínculo.
  try{if(root.showOpenFilePicker&&typeof fsApiOK==='function'&&fsApiOK())return false;}catch(_){}
  return true;
}
function friendly(error){
  const code=String(error?.code||'');
  if(code==='auth/popup-blocked')return 'O navegador bloqueou a janela de autorização do Google. Permita pop-ups para o GeoMine e toque de novo.';
  if(code==='auth/popup-closed-by-user'||code==='auth/cancelled-popup-request'||code==='auth/user-cancelled')return 'A autorização do Google Drive não foi concluída.';
  if(code.startsWith('auth/'))return 'Não foi possível conectar ao Google Drive ('+code.slice(5)+').';
  return error?.message||String(error);
}
function localFile(){
  return new Promise(resolve=>{
    const input=document.createElement('input');input.type='file';input.accept='.tif,.tiff,image/tiff,application/octet-stream';input.style.display='none';
    document.body.appendChild(input);let done=false;
    const finish=file=>{if(done)return;done=true;input.remove();resolve(file||null);};
    input.onchange=()=>finish(input.files?.[0]);input.addEventListener('cancel',()=>finish(null),{once:true});
    try{typeof abrirSeletorGeoTIFF==='function'?abrirSeletorGeoTIFF(input):input.click();}catch(_){finish(null);}
  });
}
/* Janela de apoio: aparece quando o Drive não resolveu sozinho. Cada botão é
   um toque novo, necessário para abrir o seletor do aparelho ou a autorização. */
function ask(label,message,signal){
  return new Promise(resolve=>{
    const box=document.createElement('div');box.className='modal-bg on';box.id='gmLocateOriginal';box.setAttribute('role','dialog');box.setAttribute('aria-label','Localizar o arquivo original');
    box.style.zIndex='1300';
    const safe=text=>String(text).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    box.innerHTML='<div class="modal" style="width:min(420px,94vw)"><div class="modal-h"><b>Original de “'+safe(label)+'”</b></div>'+
      '<div class="modal-b"><p data-locate-message style="margin:0 0 10px;white-space:pre-line">'+safe(message)+'</p>'+
      '<div style="display:flex;flex-wrap:wrap;gap:6px">'+
      '<button class="tbtn primary" type="button" data-locate="drive">Escolher no Google Drive</button>'+
      '<button class="tbtn" type="button" data-locate="local">Do aparelho…</button>'+
      '<button class="tbtn" type="button" data-locate="cancel">Cancelar</button></div></div></div>';
    const finish=value=>{signal?.removeEventListener('abort',cancel);box.remove();resolve(value);},cancel=()=>finish('cancel');
    box.addEventListener('click',e=>{const b=e.target.closest?.('[data-locate]');if(b)finish(b.dataset.locate);});
    signal?.addEventListener('abort',cancel,{once:true});
    document.body.appendChild(box);
  });
}
const progress=text=>{try{text?root.GeoMineLoadProgress?.show(text):root.GeoMineLoadProgress?.end();}catch(_){}};
async function fetchLocal(file,signal){
  log('Baixando do Google Drive: '+file.name+' ('+megabytes(Number(file.size)||0)+')…','etapa');
  let shown=-1;
  try{
    const local=await download(file,{signal,onProgress:(loaded,total)=>{
      const percent=total?Math.floor(100*loaded/total):0;if(percent===shown)return;shown=percent;
      progress('Baixando '+file.name+' do Google Drive — '+percent+'%');
    }});
    rememberFolder((file.parents||[])[0]);
    return local;
  }finally{progress('');}
}
async function locate(item,kind,options={}){
  const label=item?.name||'original',signal=options.signal,project=S.projectId,gen=generation();
  const current=()=>!signal?.aborted&&S.projectId===project&&generation()===gen;
  // A autorização do Google tem de ser pedida ainda dentro do toque.
  let access=token(true).then(()=>null,error=>error);
  if(running){try{await running;}catch(_){}
    if(!current())return null;
    if(!missing().some(row=>row.item===item))return {linked:true};}
  let step='search',message='';
  for(;;){
    if(!current())return null;
    try{
      if(step==='local'){const file=await localFile();return file&&current()?{file,local:true}:null;}
      const failed=await access;if(failed)throw failed;
      let file=null,parent='';
      if(step==='search'){
        progress('Procurando o original de “'+label+'” no Google Drive…');
        const located=names(item).length?await find(item,signal):{status:'no-name'};
        if(located.status==='found')file=located.file;else parent=located.parent||'';
        progress('');
      }
      if(!current())return null;
      if(!file){
        if(!parent){progress('Abrindo a pasta do projeto no Google Drive…');try{parent=await startFolder(signal);}finally{progress('');}}
        if(!current())return null;
        if(step==='search')log('Original de “'+label+'” não foi encontrado no Google Drive pelo nome: escolha o arquivo na pasta do projeto.','avisa');
        file=await pickedFile(await driveProject().pick({title:'Original de “'+label+'”',parent,parentLabel:'Pasta do projeto'}),signal);
      }
      if(!current())return null;
      const local=await fetchLocal(file,signal);
      return current()?{file:local,name:file.name}:null;
    }catch(error){
      progress('');
      if(!current())return null;
      message=error?.name==='AbortError'?'Nenhum arquivo foi escolhido no Google Drive.':friendly(error);
      if(error?.name!=='AbortError')log('Original de “'+label+'” no Google Drive: '+message,'avisa');
    }
    const answer=await ask(label,message+'\nDe onde quer trazer o arquivo .tif original?',signal);
    if(answer==='cancel'||!current())return null;
    step=answer==='local'?'local':'pick';
    // Novo toque: pode pedir a autorização de novo se ela falhou ou venceu.
    if(step==='pick')access=token(true).then(()=>null,error=>error);
  }
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
root.GeoMineDriveOriginals={restore,choose,locate,shouldLocate,available,missing};
})(window);
