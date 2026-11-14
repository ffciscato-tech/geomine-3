/* Individual .ccmgis files selected by the user in the Google Drive picker. */
(function(root){
'use strict';
const drive = () => root.GeoMineCloudProvider;
const PROJECT_NAME=/\.(ccmgis|alagis|geocampo)$/i;
const abort = () => new DOMException('Seleção cancelada.', 'AbortError');
let pickerLibrary;
function pickerReady(){
  if(root.google?.picker?.PickerBuilder)return Promise.resolve();
  if(pickerLibrary)return pickerLibrary;
  pickerLibrary=new Promise((resolve,reject)=>{
    let script;
    const fail=()=>{clearTimeout(timer);script?.remove();reject(Error('Não foi possível abrir o seletor do Google Drive.'));};
    const timer=setTimeout(fail,25000);
    const load=()=>root.gapi.load('picker',{callback:()=>{clearTimeout(timer);resolve();},onerror:fail});
    if(root.gapi?.load){load();return;}
    script=document.createElement('script');script.src='https://apis.google.com/js/api.js';
    script.onload=load;script.onerror=fail;document.head.append(script);
  }).catch(error=>{pickerLibrary=null;throw error;});
  return pickerLibrary;
}
function isSource(s){
  return s?.kind==='drive' && typeof s.id==='string' && /^[\w-]{1,200}$/.test(s.id);
}
/* O seletor abre na pasta do último projeto aberto pelo Drive (ou na pasta
   indicada por quem chama), em vez de começar sempre na raiz. */
const FOLDER_KEY='geomine.drive.pasta.v1';
function lastFolder(){try{const id=localStorage.getItem(FOLDER_KEY)||'';return /^[\w-]{1,200}$/.test(id)?id:'';}catch(_){return '';}}
function rememberFolder(id){if(id&&/^[\w-]{1,200}$/.test(id))try{localStorage.setItem(FOLDER_KEY,id);}catch(_){}}
async function pick(options={}){
  const provider=drive(),token=await provider.driveAccess(true);
  await pickerReady();
  const {appId,key}=provider.drivePickerConfig;
  return new Promise((resolve,reject)=>{
    const api=google.picker;
    const view=new api.DocsView().setIncludeFolders(true).setSelectFolderEnabled(false);
    const parent=options.parent||lastFolder();
    if(parent&&/^[\w-]{1,200}$/.test(parent)&&typeof view.setParent==='function')view.setParent(parent);
    const builder=new api.PickerBuilder().setAppId(appId).setDeveloperKey(key).setOAuthToken(token)
      .setOrigin(location.origin).setLocale('pt-BR').setTitle(options.title||'Abrir projeto GeoMine').addView(view);
    if(api.Feature.SUPPORT_DRIVES)builder.enableFeature(api.Feature.SUPPORT_DRIVES);
    const picker=builder.setCallback(data=>{
      if(data.action===api.Action.CANCEL){picker.dispose();reject(abort());}
      if(data.action!==api.Action.PICKED)return;
      const doc=data.docs?.[0];picker.dispose();
      const source={kind:'drive',id:doc?.id,resourceKey:doc?.resourceKey||''};
      if(!isSource(source))reject(Error('O Google Drive não identificou o arquivo escolhido.'));
      else resolve(source);
    }).build();
    picker.setVisible(true);
  });
}
/* Salvar Como: a pessoa escolhe a PASTA de destino entre todas as do Drive
   (Meu Drive e drives compartilhados). Começa na pasta do projeto atual. */
async function pickFolder(options={}){
  const provider=drive(),token=await provider.driveAccess(true,{write:true});
  await pickerReady();
  const {appId,key}=provider.drivePickerConfig;
  return new Promise((resolve,reject)=>{
    const api=google.picker,pasta='application/vnd.google-apps.folder';
    const parent=options.parent||lastFolder();
    const minhas=new api.DocsView(api.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(pasta);
    if(parent&&/^[\w-]{1,200}$/.test(parent)&&typeof minhas.setParent==='function')minhas.setParent(parent);
    const builder=new api.PickerBuilder().setAppId(appId).setDeveloperKey(key).setOAuthToken(token)
      .setOrigin(location.origin).setLocale('pt-BR').setTitle(options.title||'Salvar Como: escolha a pasta do Google Drive').addView(minhas);
    try{
      const compartilhados=new api.DocsView(api.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMimeTypes(pasta);
      if(typeof compartilhados.setEnableDrives==='function'){compartilhados.setEnableDrives(true);builder.addView(compartilhados);}
    }catch(_){}
    if(api.Feature.SUPPORT_DRIVES)builder.enableFeature(api.Feature.SUPPORT_DRIVES);
    const picker=builder.setCallback(data=>{
      if(data.action===api.Action.CANCEL){picker.dispose();reject(abort());}
      if(data.action!==api.Action.PICKED)return;
      const doc=data.docs?.[0];picker.dispose();
      if(!doc?.id||!/^[\w-]{1,200}$/.test(doc.id))reject(Error('O Google Drive não identificou a pasta escolhida.'));
      else resolve({id:doc.id,name:String(doc.name||'pasta')});
    }).build();
    picker.setVisible(true);
  });
}
async function request(source,query,signal,extraHeaders){
  if(!isSource(source))throw Error('Vínculo do projeto com o Drive inválido.');
  const provider=drive(),token=await provider.driveAccess(false);
  const url=new URL('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(source.id));
  url.search=new URLSearchParams({...query,supportsAllDrives:'true'});
  const headers={Authorization:'Bearer '+token,...(extraHeaders||{})};
  if(source.resourceKey && /^[\w-]+$/.test(source.resourceKey))headers['X-Goog-Drive-Resource-Keys']=source.id+'/'+source.resourceKey;
  const response=await fetch(url,{headers,signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  if(response.status===401){provider.clearDriveAccess();throw Error('Toque em ↻ ao lado do nome do projeto para reconectar ao Drive.');}
  if(!response.ok)throw Error(response.status===404?'O arquivo vinculado não está disponível para esta conta no Drive.':'O Google Drive não pôde ler o arquivo (HTTP '+response.status+').');
  return response;
}
async function metadata(source,signal){
  const response=await request(source,{fields:'id,name,version,modifiedTime,size,trashed,resourceKey,parents'},signal);
  const file=await response.json();
  if(file.trashed||file.id!==source.id||!file.version)throw Error('O projeto vinculado está indisponível no Drive.');
  if(PROJECT_NAME.test(file.name||''))rememberFolder(file.parents?.[0]);
  return {kind:'drive',id:file.id,resourceKey:file.resourceKey||source.resourceKey||'',name:file.name,
    version:String(file.version),lastModified:Date.parse(file.modifiedTime)||0,size:Number(file.size)||0};
}
async function read(source,signal){
  for(let attempt=0;attempt<2;attempt++){
    const response=await request(source,{alt:'media'},signal);
    const content=await response.blob();
    const checked=await metadata(source,signal);
    if(checked.version===source.version && checked.size===content.size)
      return {source:checked,file:new File([content],checked.name,{lastModified:checked.lastModified})};
    source=checked;
  }
  throw Error('O projeto mudou durante a leitura. Atualize novamente para abrir a versão completa.');
}
/* Uma atualização feita fora do GeoMine chega ao Drive como um ARQUIVO NOVO na
   mesma pasta, com outro id, e não como nova revisão do arquivo vinculado.
   latest() procura nessa pasta o arquivo de projeto mais recente que tenha o
   mesmo projectId. Lê só o começo de cada candidato, onde o projectId fica, e
   devolve null quando não há nada mais novo ou quando a conta não autorizou a
   leitura da pasta (o chamador continua com o arquivo vinculado). */
const PROJECT_FILE=/\.(ccmgis|alagis|geocampo)$/i, DRIVE_ID=/^[\w-]{1,200}$/;
async function listFolder(parent,driveId,signal){
  const provider=drive(),token=await provider.driveAccess(false);
  const query={q:"'"+parent+"' in parents and trashed = false",orderBy:'modifiedTime desc',pageSize:'100',
    fields:'files(id,name,version,modifiedTime,size,resourceKey)',supportsAllDrives:'true',includeItemsFromAllDrives:'true'};
  if(driveId&&DRIVE_ID.test(driveId)){query.corpora='drive';query.driveId=driveId;}
  const url=new URL('https://www.googleapis.com/drive/v3/files');url.search=new URLSearchParams(query);
  const response=await fetch(url,{headers:{Authorization:'Bearer '+token},signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  if(response.status===401){provider.clearDriveAccess();throw Error('Toque em ↻ ao lado do nome do projeto para reconectar ao Drive.');}
  if(!response.ok)throw Error('O Google Drive não listou a pasta do projeto (HTTP '+response.status+').');
  return (await response.json()).files||[];
}
async function head(source,bytes,signal){
  const response=await request(source,{alt:'media'},signal,{Range:'bytes=0-'+(bytes-1)});
  const reader=response.body?.getReader?.();
  if(!reader)return (await response.text()).slice(0,bytes);
  const decoder=new TextDecoder();let text='',size=0;
  // Se o servidor ignorar o Range, para de ler assim que tiver o começo.
  try{while(size<bytes){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;text+=decoder.decode(part.value,{stream:true});}}
  finally{try{await reader.cancel();}catch(_){}}
  return text;
}
async function latest(source,projectId,signal){
  if(!isSource(source)||typeof projectId!=='string'||!projectId)return null;
  const info=await (await request(source,{fields:'id,parents,driveId,modifiedTime'},signal)).json();
  const parent=info.parents?.[0];
  if(!parent||!DRIVE_ID.test(parent))return null;
  const base=Date.parse(info.modifiedTime)||0,time=f=>Date.parse(f.modifiedTime)||0;
  const newer=(await listFolder(parent,info.driveId,signal))
    .filter(f=>f.id!==source.id&&PROJECT_FILE.test(f.name||'')&&time(f)>base)
    .sort((a,b)=>time(b)-time(a)).slice(0,8);
  for(const file of newer){
    const candidate={kind:'drive',id:file.id,resourceKey:file.resourceKey||''};
    if(!isSource(candidate))continue;
    let text='';
    try{text=await head(candidate,4096,signal);}catch(error){if(error.name==='AbortError')throw error;continue;}
    const found=/"projectId"\s*:\s*"([^"\\]{1,200})"/.exec(text);
    if(found&&found[1]===projectId)
      return {...candidate,name:file.name,version:String(file.version||''),lastModified:time(file),size:Number(file.size)||0};
  }
  return null;
}
root.GeoMineDriveProject={pick,pickFolder,isSource,metadata,read,latest,rememberFolder};
})(window);

