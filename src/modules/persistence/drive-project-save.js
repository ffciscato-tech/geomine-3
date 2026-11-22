/* SALVAR O PROJETO DIRETO NO GOOGLE DRIVE
   No iPad (e em qualquer navegador sem seletor de arquivos para escrita) o
   site não consegue regravar um arquivo escolhido pelo seletor do aparelho.
   O usuário definiu (14/11/2026): Salvar grava sozinho EM CIMA do arquivo que
   estava aberto, sem download; Salvar Como mostra todas as pastas do Drive.

   - prepare() roda dentro do toque em Salvar: pede a autorização de gravação
     (janela do Google, quando a anterior venceu), acha o arquivo original e
     confere conflitos. Devolve o plano da gravação.
   - commit() envia o arquivo em partes (upload retomável), com andamento e
     nova tentativa em falha de rede, e confere o tamanho gravado.
   O arquivo original é achado pelo vínculo da aba (projeto aberto pelo Drive)
   ou, para projeto aberto pelo seletor do aparelho, pelo nome e pelo projectId
   gravado no começo do arquivo. O Drive guarda as versões anteriores de cada
   arquivo regravado (Gerenciar versões).

   EXPORTAÇÕES (22/11/2026: "quando vou salvar um projeto ele abre outra
   janela", com o print da prancha em PDF no iPad). Sem seletor de arquivos
   para escrita, toda exportação virava download e o Chrome do iPad abria a
   barra "Salvar…" e a caixa "Salvar em…" (Arquivos / Drive), para o arquivo
   ainda cair fora da pasta do projeto. saveExport() grava o arquivo exportado
   direto na pasta do projeto no Drive, sem janela do navegador:
   - a pasta é a do arquivo do projeto vinculado ao Drive (aberto pelo Drive ou
     já salvo nele). Projeto ainda sem vínculo com o Drive segue pelo caminho
     do navegador, como antes, e não pede autorização do Google à toa;
   - exportar de novo com o mesmo nome regrava o arquivo que o próprio GeoMine
     criou para ESTE projeto (marcas appProperties.geomineExport e
     geomineProject; o Drive guarda as versões). Um arquivo de mesmo nome que
     veio de outro lugar, ou de outro projeto, nunca é trocado: o novo sai com
     " (2)", " (3)"…;
   - a autorização é a mesma do Salvar. Se ela venceu e o toque já passou (a
     geração do PDF demora mais que o toque vale), o navegador bloquearia a
     janela do Google: uma caixa pede um toque para renovar. prepareExport()
     deixa quem exporta pedir a autorização antes, ainda dentro do toque. */
(function(root){
'use strict';if(root.GeoMineDriveSave)return;
const FILES='https://www.googleapis.com/drive/v3/files',UPLOAD='https://www.googleapis.com/upload/drive/v3/files',
  ID=/^[\w-]{1,200}$/,CHUNK=8*1048576,FIELDS='id,name,version,modifiedTime,size,resourceKey,parents,trashed,capabilities(canEdit,canModifyContent)',
  PROJECT=/\.(ccmgis|alagis|geocampo)$/i;
const provider=()=>root.GeoMineCloudProvider||null;
const abort=()=>new DOMException('Salvamento cancelado','AbortError');
function available(){const p=provider();return !!(p&&typeof p.driveAccess==='function'&&p.drivePickerConfig?.key&&root.GeoMineDriveProject);}
const quote=text=>String(text).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const when=t=>{try{return new Date(t).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(_){return '';}};
const megas=b=>(b/1048576).toFixed(b<10485760?1:0)+' MB';
async function failure(response,what){
  let detail='';try{detail=(await response.json())?.error?.message||'';}catch(_){}
  if(response.status===401){provider()?.clearDriveAccess?.();return Error('A autorização do Google Drive venceu. Toque em Salvar de novo.');}
  if(response.status===403)return Error(/storage|quota/i.test(detail)?'O Google Drive está sem espaço para gravar o projeto.':
    'O Google Drive recusou a gravação: sua conta não tem permissão de edição '+what+'.');
  if(response.status===404)return Error('O arquivo não está mais disponível no Google Drive para esta conta.');
  return Error('O Google Drive não concluiu a operação (HTTP '+response.status+(detail?': '+detail.slice(0,140):'')+').');
}
function headers(token,file,extra){
  const h={Authorization:'Bearer '+token,...(extra||{})};
  if(file?.id&&file.resourceKey&&/^[\w-]+$/.test(file.resourceKey))h['X-Goog-Drive-Resource-Keys']=file.id+'/'+file.resourceKey;
  return h;
}
const normal=f=>({kind:'drive',id:f.id,resourceKey:f.resourceKey||'',name:f.name,version:String(f.version||''),
  lastModified:Date.parse(f.modifiedTime)||0,size:Number(f.size)||0,parent:f.parents?.[0]||'',
  editable:f.capabilities?.canModifyContent!==false&&f.capabilities?.canEdit!==false,
  exported:f.appProperties?.geomineExport==='1',exportedProject:String(f.appProperties?.geomineProject||'')});
async function metadata(token,file,signal){
  const url=new URL(FILES+'/'+encodeURIComponent(file.id));url.search=new URLSearchParams({fields:FIELDS,supportsAllDrives:'true'});
  const r=await fetch(url,{headers:headers(token,file),signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  if(r.status===404)return null;
  if(!r.ok)throw await failure(r,'neste arquivo');
  const f=await r.json();return f.trashed?null:normal(f);
}
async function list(token,q,signal,size=25,fields=FIELDS){
  const url=new URL(FILES);url.search=new URLSearchParams({q,orderBy:'modifiedTime desc',pageSize:String(size),fields:'files('+fields+')',
    corpora:'allDrives',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});
  const r=await fetch(url,{headers:headers(token),signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  if(!r.ok)throw await failure(r,'nesta pasta');
  return ((await r.json()).files||[]).filter(f=>f&&ID.test(f.id||'')&&!f.trashed).map(normal);
}
// Lê só o começo do arquivo, onde fica o projectId.
async function projectIdOf(token,file,signal){
  const url=new URL(FILES+'/'+encodeURIComponent(file.id));url.search=new URLSearchParams({alt:'media',supportsAllDrives:'true'});
  const r=await fetch(url,{headers:headers(token,file,{Range:'bytes=0-4095'}),signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  if(!r.ok)return null;
  const reader=r.body?.getReader?.();let text='';
  if(!reader)text=(await r.text()).slice(0,4096);
  else{const decoder=new TextDecoder();let size=0;
    try{while(size<4096){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;text+=decoder.decode(part.value,{stream:true});}}
    finally{try{await reader.cancel();}catch(_){}}}
  return /"projectId"\s*:\s*"([^"\\]{1,200})"/.exec(text)?.[1]||null;
}
async function folderName(token,id,signal){
  if(!ID.test(id||''))return '';
  try{const url=new URL(FILES+'/'+encodeURIComponent(id));url.search=new URLSearchParams({fields:'name',supportsAllDrives:'true'});
    const r=await fetch(url,{headers:headers(token),signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
    return r.ok?String((await r.json()).name||''):'';}catch(_){return '';}
}
/* Acha no Drive o arquivo que a pessoa abriu pelo seletor do aparelho: mesmo
   nome e mesmo projectId. Vários iguais (cópias em outras pastas): vale o de
   mesmo tamanho do arquivo aberto; persistindo a dúvida, a pessoa escolhe. */
async function locate(token,hint,signal){
  const name=String(hint.name||'');if(!name||!hint.projectId)return {found:[]};
  const same=[];
  for(const file of await list(token,"name = '"+quote(name)+"' and trashed = false",signal)){
    if(await projectIdOf(token,file,signal)===hint.projectId)same.push(file);
    if(same.length>=8)break;
  }
  if(same.length<=1)return {found:same};
  const exact=hint.size>0?same.filter(f=>f.size===hint.size):[];
  return exact.length===1?{found:exact}:{found:same,ambiguous:true};
}
function choose(token,files,signal){
  return new Promise(async(resolve,reject)=>{
    const names=await Promise.all(files.map(f=>folderName(token,f.parent,signal)));
    const box=document.createElement('dialog');box.id='gmDriveSaveChoose';box.setAttribute('aria-label','Qual arquivo regravar');
    box.style.cssText='max-width:min(460px,92vw);padding:16px;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:10px';
    const title=document.createElement('strong'),text=document.createElement('p'),listBox=document.createElement('div'),cancel=document.createElement('button');
    title.textContent='Há mais de uma cópia deste projeto no Drive';
    text.textContent='Escolha em qual delas o Salvar deve gravar. A escolha fica guardada para os próximos salvamentos.';
    text.style.cssText='margin:8px 0 10px;font-size:12px;color:var(--ink-dim)';
    listBox.style.cssText='display:flex;flex-direction:column;gap:6px;margin-bottom:10px';
    let done=false;const finish=value=>{if(done)return;done=true;box.close();value?resolve(value):reject(abort());};
    files.forEach((f,i)=>{const b=document.createElement('button');b.type='button';b.className='tbtn';b.style.cssText='justify-content:flex-start;text-align:left;height:auto;padding:6px 10px;white-space:normal';
      b.textContent='Pasta “'+(names[i]||'sem nome')+'” · alterado em '+when(f.lastModified)+' · '+megas(f.size);b.onclick=()=>finish(f);listBox.append(b);});
    cancel.type='button';cancel.className='tbtn';cancel.textContent='Cancelar';cancel.onclick=()=>finish(null);
    box.append(title,text,listBox,cancel);box.addEventListener('close',()=>{box.remove();if(!done){done=true;reject(abort());}},{once:true});
    document.body.append(box);try{box.showModal();}catch(_){box.setAttribute('open','');}
  });
}
function binding(projectId){
  try{const record=root.GeoMineProjectTabSession?.state?.().record;return record&&record.projectId===projectId?record:null;}catch(_){return null;}
}
/* Salvar Como: a janela do GeoMine (drive-folder-browser.js) abre na pasta do
   projeto, navega pelas pastas do Drive e pede o nome no mesmo lugar. */
async function planSaveAs(token,name,signal,locateFolder){
  const picked=await root.GeoMineDriveFolderBrowser.open({name,locate:locateFolder,fallbackFolder:root.GeoMineDriveProject.lastFolder?.()||''});
  const folder=picked.folder,chosen=picked.name;
  const existing=(await list(token,"name = '"+quote(chosen)+"' and '"+folder.id+"' in parents and trashed = false",signal,5))[0];
  if(existing){
    if(!confirm('Já existe “'+chosen+'” na pasta “'+folder.name+'”. Gravar por cima dele?'))throw abort();
    if(!existing.editable)throw Error('Sua conta não tem permissão para alterar “'+chosen+'” nessa pasta.');
    return {mode:'update',target:existing,name:chosen,folder};
  }
  return {mode:'create',folder,name:chosen};
}
async function prepare(options){
  const p=provider();if(!available())throw Error('A gravação no Google Drive precisa do login no site oficial do GeoMine.');
  const token=await p.driveAccess(true,{write:true}),signal=options.signal,projectId=options.projectId||null;
  const record=binding(projectId),drive=root.GeoMineDriveProject;
  /* Pasta do projeto, para a janela do Salvar Como começar nela: a do arquivo
     vinculado ou, para projeto aberto pelo seletor do aparelho, a do original
     achado pelo nome e pelo projectId. */
  const projectFolder=async()=>{
    if(drive.isSource(record?.source))return (await metadata(token,record.source,signal))?.parent||'';
    if(!record)return '';
    const r=await locate(token,{name:record.name||options.name,projectId,size:Number(record.source?.size)||0},signal);
    return r.found[0]?.parent||'';
  };
  if(options.saveAs===true)return planSaveAs(token,options.name,signal,projectFolder);
  // Projeto novo, que nunca veio de um arquivo: a pessoa indica onde gravar.
  if(!record)return planSaveAs(token,options.name,signal,null);
  let target=null,base=0;
  if(drive.isSource(record?.source)){
    target=await metadata(token,record.source,signal);
    base=Number(record.source.lastModified)||0;
  }
  if(!target){
    const hint={name:record?.name||options.name,projectId,size:Number(record?.source?.size)||0};
    const r=await locate(token,hint,signal);
    target=r.ambiguous?await choose(token,r.found,signal):r.found[0]||null;
    base=Number(record?.source?.lastModified)||0;
    if(!target){
      toast('Não achei “'+hint.name+'” no Google Drive com este projeto. Escolha a pasta para gravar.');
      return planSaveAs(token,options.name,signal,null);
    }
  }
  if(!target.editable)throw Error('Sua conta não tem permissão para alterar “'+target.name+'” no Google Drive. Use Salvar Como para gravar em outra pasta.');
  // Alguém regravou o arquivo depois da versão que está aberta aqui.
  if(base>0&&target.lastModified>base+2000&&
    !confirm('“'+target.name+'” foi alterado no Google Drive em '+when(target.lastModified)+', depois da versão aberta aqui. Gravar por cima mesmo assim?\n\n(O Drive guarda a versão anterior em “Gerenciar versões”.)'))throw abort();
  return {mode:'update',target,name:target.name};
}
async function openSession(token,plan,blob,signal){
  const query='uploadType=resumable&supportsAllDrives=true&fields='+encodeURIComponent(FIELDS),update=plan.mode==='update';
  const url=update?UPLOAD+'/'+encodeURIComponent(plan.target.id)+'?'+query:UPLOAD+'?'+query;
  const type=plan.mimeType||'application/octet-stream';
  const body=update?{}:{name:plan.name,parents:[plan.folder.id],mimeType:type,...(plan.appProperties?{appProperties:plan.appProperties}:{})};
  const r=await fetch(url,{method:update?'PATCH':'POST',signal,credentials:'omit',referrerPolicy:'no-referrer',
    headers:headers(token,update?plan.target:null,{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':type,'X-Upload-Content-Length':String(blob.size)}),
    body:JSON.stringify(body)});
  if(!r.ok)throw await failure(r,update?'neste arquivo':'nesta pasta');
  const location=r.headers.get('Location'),uploadId=r.headers.get('X-GUploader-UploadID');
  if(location)return location;
  if(uploadId)return url+'&upload_id='+encodeURIComponent(uploadId);
  throw Error('O Google Drive não abriu a gravação do arquivo.');
}
// Quanto do arquivo o Drive já recebeu (para retomar depois de uma falha de rede).
async function received(session,total,signal){
  const r=await fetch(session,{method:'PUT',signal,credentials:'omit',referrerPolicy:'no-referrer',headers:{'Content-Range':'bytes */'+total}});
  if(r.ok)return {done:await r.json()};
  if(r.status!==308)throw await failure(r,'neste arquivo');
  const m=/-(\d+)$/.exec(r.headers.get('Range')||'');return {offset:m?Number(m[1])+1:0};
}
// Envio retomável em partes; devolve o arquivo como o Drive o confirmou.
async function send(token,plan,blob,onProgress,signal,again){
  const session=await openSession(token,plan,blob,signal);
  let offset=0,file=null,failures=0;
  onProgress?.(0,blob.size);
  while(!file){
    const end=Math.min(blob.size,offset+CHUNK);
    try{
      const r=await fetch(session,{method:'PUT',signal,credentials:'omit',referrerPolicy:'no-referrer',
        headers:{'Content-Range':'bytes '+offset+'-'+(end-1)+'/'+blob.size},body:blob.slice(offset,end)});
      if(r.status===308){const m=/-(\d+)$/.exec(r.headers.get('Range')||'');offset=m?Number(m[1])+1:end;}
      else if(r.ok){file=await r.json();offset=blob.size;}
      else if(r.status>=500&&failures<4)throw new TypeError('HTTP '+r.status);
      else throw await failure(r,plan.mode==='update'?'neste arquivo':'nesta pasta');
      failures=0;onProgress?.(offset,blob.size);
    }catch(error){
      if(error?.name==='AbortError'||!(error instanceof TypeError)||++failures>4)throw error instanceof TypeError
        ?Error('A conexão caiu durante a gravação no Google Drive. O arquivo que estava no Drive não foi trocado.'):error;
      await new Promise(r=>setTimeout(r,1200*failures));
      const state=await received(session,blob.size,signal).catch(()=>null);
      if(state?.done)file=state.done;else if(state)offset=state.offset;
    }
  }
  if(!ID.test(file.id||'')||Number(file.size)!==blob.size)throw Error('O Google Drive não confirmou o arquivo inteiro. '+again);
  return normal(file);
}
async function commit(plan,blob,onProgress,signal){
  const p=provider(),token=await p.driveAccess(false,{write:true});
  if(!(blob instanceof Blob)||!blob.size)throw Error('O projeto ficou vazio; nada foi gravado.');
  const saved=await send(token,plan,blob,onProgress,signal,'Salve de novo.');
  try{root.GeoMineDriveProject.rememberFolder?.(saved.parent);}catch(_){}
  return {kind:'drive',id:saved.id,resourceKey:saved.resourceKey,name:saved.name,version:saved.version,lastModified:saved.lastModified,size:saved.size};
}
/* ---- Exportações direto na pasta do projeto (ver o cabeçalho) ---- */
const EXPORT_TYPES={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',svg:'image/svg+xml',zip:'application/zip',
  csv:'text/csv',txt:'text/plain',json:'application/json',geojson:'application/geo+json',kml:'application/vnd.google-earth.kml+xml',
  kmz:'application/vnd.google-earth.kmz',dxf:'application/dxf',html:'text/html',xml:'application/xml',gpx:'application/gpx+xml',
  tif:'image/tiff',tiff:'image/tiff',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
let exportFolder=null;
// Só onde exportar vira download com janela do navegador: aparelho móvel sem seletor de arquivos para escrita (iPad, iPhone).
function exportAvailable(){
  return available()&&typeof root.showSaveFilePicker!=='function'&&typeof root.fsApiOK==='function'&&!root.fsApiOK()&&!!root.GeoMineProjectTabSession;
}
// O arquivo do projeto no Drive, quando a aba está vinculada a ele; senão, null.
function linkedProject(projectId){
  const record=binding(projectId);
  return record&&root.GeoMineDriveProject.isSource(record.source)?record.source:null;
}
async function projectFolder(token,source,signal){
  if(exportFolder?.key===source.id)return exportFolder.folder;
  const parent=(await metadata(token,source,signal))?.parent||'';
  if(!ID.test(parent))return null;
  const folder={id:parent,name:await folderName(token,parent,signal)};
  exportFolder={key:source.id,folder};
  return folder;
}
// A autorização venceu e o toque já passou: um toque aqui devolve ao navegador o direito de abrir a janela do Google.
function askExportAccess(name){
  return new Promise((resolve,reject)=>{
    const bg=document.createElement('div');bg.id='gmDriveExportAccess';bg.className='modal-bg on';
    bg.innerHTML='<div class="modal" role="dialog" aria-modal="true" aria-labelledby="gmDriveExportTitle" style="width:min(400px,100%)">'+
      '<div class="modal-h"><b id="gmDriveExportTitle">Gravar no Google Drive</b></div>'+
      '<div class="modal-b"><div class="hint" data-text style="margin-bottom:12px"></div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap">'+
      '<button type="button" class="tbtn" data-choice="cancel" style="flex:1;justify-content:center">Cancelar</button>'+
      '<button type="button" class="tbtn" data-choice="browser" style="flex:1;justify-content:center">Baixar pelo navegador</button>'+
      '<button type="button" class="tbtn" data-choice="drive" style="flex:1 1 100%;justify-content:center;background:var(--amber);color:#1a1206;font-weight:600">Autorizar e gravar no Drive</button>'+
      '</div></div></div>';
    bg.querySelector('[data-text]').textContent='A autorização do Google Drive venceu (o Google a limita a uma hora). Toque para renová-la e gravar “'+name+'” na pasta do projeto.';
    let done=false;
    const finish=choice=>{
      if(done)return;done=true;bg.remove();
      if(choice==='drive')resolve();
      else if(choice==='browser')reject(Object.assign(Error('download pelo navegador'),{name:'GeoMineBrowserDownload'}));
      else reject(new DOMException('Exportação cancelada','AbortError'));
    };
    bg.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>finish(b.dataset.choice));
    bg.addEventListener('click',e=>{if(e.target===bg)finish('cancel');});
    document.body.append(bg);
  });
}
async function exportAccess(name){
  const p=provider();
  try{return await p.driveAccess(false,{write:true});}
  catch(error){if(error?.code!=='drive/authorization-needed')throw error;}
  if(root.navigator.userActivation&&!root.navigator.userActivation.isActive)await askExportAccess(name);
  return p.driveAccess(true,{write:true});
}
// Chamado no começo de uma exportação demorada, ainda dentro do toque: se a autorização venceu, a janela do Google abre agora.
async function prepareExport(projectId){
  if(!exportAvailable()||!linkedProject(projectId||null))return false;
  // Fora do toque o navegador bloquearia a janela; saveExport pede o toque depois, se precisar.
  if(root.navigator.userActivation&&!root.navigator.userActivation.isActive)return false;
  await provider().driveAccess(true,{write:true});
  return true;
}
/* Onde gravar: o primeiro nome — o pedido, depois " (2)", " (3)"… — que esteja
   livre na pasta ou que já seja uma exportação deste projeto (essa é regravada). */
async function exportPlan(token,folder,name,project,mimeType,signal){
  const dot=name.lastIndexOf('.'),base=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';
  const fresh=candidate=>({mode:'create',folder,name:candidate,mimeType,appProperties:{geomineExport:'1',geomineProject:project}});
  for(let n=1;n<=40;n++){
    const candidate=n===1?name:base+' ('+n+')'+ext;
    const same=await list(token,"name = '"+quote(candidate)+"' and '"+folder.id+"' in parents and trashed = false",signal,10,FIELDS+',appProperties');
    const own=same.find(f=>f.exported&&f.exportedProject===project&&f.editable);
    if(own)return {mode:'update',target:own,name:candidate};
    if(!same.length)return fresh(candidate);
  }
  return fresh(base+' '+Date.now()+ext);
}
/* Devolve null quando a exportação não é para o Drive (navegador com seletor,
   projeto sem vínculo com o Drive): quem chama segue pelo caminho de sempre. */
async function saveExport(blob,name,options={}){
  const signal=options.signal,source=exportAvailable()?linkedProject(options.projectId||null):null;
  if(!source)return null;
  if(!(blob instanceof Blob)||!blob.size)throw Error('O arquivo exportado ficou vazio; nada foi gravado.');
  name=String(name||'').replace(/[\\/\u0000-\u001f]/g,'_').trim()||'exportado';
  const token=await exportAccess(name);
  const folder=await projectFolder(token,source,signal);
  if(!folder)return null;
  const ext=(name.split('.').pop()||'').toLowerCase();
  const mimeType=blob.type&&blob.type!=='application/octet-stream'?blob.type.split(';')[0]:EXPORT_TYPES[ext]||'application/octet-stream';
  const plan=await exportPlan(token,folder,name,String(options.projectId||'').slice(0,100),mimeType,signal);
  const saved=await send(token,plan,blob,options.onProgress,signal,'Exporte de novo.');
  return {id:saved.id,name:saved.name,folder,replaced:plan.mode==='update',size:saved.size};
}
root.GeoMineDriveSave={available,prepare,commit,exportAvailable,prepareExport,saveExport};
})(window);
