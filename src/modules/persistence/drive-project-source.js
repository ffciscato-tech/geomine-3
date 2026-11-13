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
   indicada por quem chama), em vez de começar sempre na raiz. As pastas ficam
   guardadas por projeto: a do arquivo .ccmgis e a dos TIFF originais. */
const FOLDER_KEY='geomine.drive.pasta.v1',FOLDERS_KEY='geomine.drive.pastas.v2',FOLDER_ID=/^[\w-]{1,200}$/;
function lastFolder(){try{const id=localStorage.getItem(FOLDER_KEY)||'';return FOLDER_ID.test(id)?id:'';}catch(_){return '';}}
function rememberFolder(id){if(id&&FOLDER_ID.test(id))try{localStorage.setItem(FOLDER_KEY,id);}catch(_){}}
function folders(){try{const map=JSON.parse(localStorage.getItem(FOLDERS_KEY)||'{}');return map&&typeof map==='object'&&!Array.isArray(map)?map:{};}catch(_){return {};}}
function folderFor(projectId,kind){const id=projectId?folders()[projectId]?.[kind]||'':'';return FOLDER_ID.test(id)?id:'';}
function rememberFolderFor(projectId,kind,id){
  if(!projectId||typeof projectId!=='string'||!id||!FOLDER_ID.test(id)||(kind!=='project'&&kind!=='originals'))return;
  const map=folders();map[projectId]={...(map[projectId]||{}),[kind]:id,at:Date.now()};
  const keys=Object.keys(map);
  if(keys.length>60)keys.sort((a,b)=>(map[a]?.at||0)-(map[b]?.at||0)).slice(0,keys.length-60).forEach(key=>delete map[key]);
  try{localStorage.setItem(FOLDERS_KEY,JSON.stringify(map));}catch(_){}
}
/* A pasta indicada vem primeiro; Meu Drive e Drives compartilhados ficam ao
   lado, para quem precisar sair dela (o seletor não sobe de uma pasta). */
async function pick(options={}){
  const provider=drive(),token=await provider.driveAccess(true);
  await pickerReady();
  const {appId,key}=provider.drivePickerConfig;
  return new Promise((resolve,reject)=>{
    const api=google.picker;
    const make=label=>{const view=new api.DocsView().setIncludeFolders(true).setSelectFolderEnabled(false);
      if(label&&typeof view.setLabel==='function')try{view.setLabel(label);}catch(_){}
      return view;};
    const parent=options.parent===''?'':(options.parent||lastFolder());
    const builder=new api.PickerBuilder().setAppId(appId).setDeveloperKey(key).setOAuthToken(token)
      .setOrigin(location.origin).setLocale('pt-BR').setTitle(options.title||'Abrir projeto GeoMine');
    const inFolder=parent&&FOLDER_ID.test(parent)&&typeof api.DocsView.prototype.setParent==='function';
    if(inFolder)builder.addView(make(options.parentLabel||'Pasta do projeto').setParent(parent));
    try{
      const mine=make('Meu Drive');if(inFolder)mine.setParent('root');builder.addView(mine);
      if(typeof api.DocsView.prototype.setEnableDrives==='function')builder.addView(make('Drives compartilhados').setEnableDrives(true));
    }catch(_){if(!inFolder)builder.addView(make());}
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
/* Pasta do Drive onde está o arquivo do projeto aberto. Quando o projeto veio
   pelo seletor do aparelho não há vínculo com o Drive: procura-se o arquivo
   pelo nome e confere-se o projectId no começo de cada candidato. Devolve ''
   quando não acha ou quando a conta não autorizou a leitura do Drive. */
async function projectFolder(options={}){
  const projectId=typeof options.projectId==='string'?options.projectId:'',signal=options.signal;
  const known=folderFor(projectId,'project');if(known)return known;
  let parent='';
  if(isSource(options.source)){
    try{parent=(await (await request(options.source,{fields:'id,parents'},signal)).json()).parents?.[0]||'';}
    catch(error){if(error.name==='AbortError')throw error;}
  }
  if(!parent&&projectId){
    const provider=drive(),token=await provider.driveAccess(false),name=String(options.name||'').trim(),found=new Map();
    const list=async q=>{
      const url=new URL('https://www.googleapis.com/drive/v3/files');
      url.search=new URLSearchParams({q:q+' and trashed = false',orderBy:'modifiedTime desc',pageSize:'25',
        fields:'files(id,name,parents,resourceKey,modifiedTime)',supportsAllDrives:'true',includeItemsFromAllDrives:'true',corpora:'allDrives'});
      const response=await fetch(url,{headers:{Authorization:'Bearer '+token},signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok)return;
      for(const file of (await response.json()).files||[])if(PROJECT_FILE.test(file.name||'')&&!found.has(file.id))found.set(file.id,file);
    };
    const quoted=text=>"'"+text.replace(/\\/g,'\\\\').replace(/'/g,"\\'")+"'";
    try{
      if(name)await list('name = '+quoted(PROJECT_FILE.test(name)?name:name+'.ccmgis'));
      const stem=name.replace(PROJECT_FILE,'').split(/[_\s]+/).filter(Boolean).slice(0,2).join(' ');
      if(stem)await list('name contains '+quoted(stem));
      await list("name contains 'ccmgis'");
    }catch(error){if(error.name==='AbortError')throw error;}
    for(const file of [...found.values()].slice(0,12)){
      const candidate={kind:'drive',id:file.id,resourceKey:file.resourceKey||''};
      if(!isSource(candidate))continue;
      let text='';
      try{text=await head(candidate,4096,signal);}catch(error){if(error.name==='AbortError')throw error;continue;}
      const match=/"projectId"\s*:\s*"([^"\\]{1,200})"/.exec(text);
      if(match&&match[1]===projectId){parent=file.parents?.[0]||'';if(parent)break;}
    }
  }
  if(!parent||!FOLDER_ID.test(parent))return '';
  rememberFolderFor(projectId,'project',parent);
  return parent;
}
root.GeoMineDriveProject={pick,isSource,metadata,read,latest,lastFolder,folderFor,rememberFolderFor,projectFolder};
})(window);

