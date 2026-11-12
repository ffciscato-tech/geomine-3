/* Individual .ccmgis files selected by the user in the Google Drive picker. */
(function(root){
'use strict';
const drive = () => root.GeoMineCloudProvider;
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
async function pick(){
  const provider=drive(),token=await provider.driveAccess(true);
  await pickerReady();
  const {appId,key}=provider.drivePickerConfig;
  return new Promise((resolve,reject)=>{
    const api=google.picker;
    const view=new api.DocsView().setIncludeFolders(true).setSelectFolderEnabled(false);
    const builder=new api.PickerBuilder().setAppId(appId).setDeveloperKey(key).setOAuthToken(token)
      .setOrigin(location.origin).setLocale('pt-BR').setTitle('Abrir projeto GeoMine').addView(view);
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
async function request(source,query,signal){
  if(!isSource(source))throw Error('Vínculo do projeto com o Drive inválido.');
  const provider=drive(),token=await provider.driveAccess(false);
  const url=new URL('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(source.id));
  url.search=new URLSearchParams({...query,supportsAllDrives:'true'});
  const headers={Authorization:'Bearer '+token};
  if(source.resourceKey && /^[\w-]+$/.test(source.resourceKey))headers['X-Goog-Drive-Resource-Keys']=source.id+'/'+source.resourceKey;
  const response=await fetch(url,{headers,signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  if(response.status===401){provider.clearDriveAccess();throw Error('Toque em ↻ ao lado do nome do projeto para reconectar ao Drive.');}
  if(!response.ok)throw Error(response.status===404?'O arquivo vinculado não está disponível para esta conta no Drive.':'O Google Drive não pôde ler o arquivo (HTTP '+response.status+').');
  return response;
}
async function metadata(source,signal){
  const response=await request(source,{fields:'id,name,version,modifiedTime,size,trashed,resourceKey'},signal);
  const file=await response.json();
  if(file.trashed||file.id!==source.id||!file.version)throw Error('O projeto vinculado está indisponível no Drive.');
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
root.GeoMineDriveProject={pick,isSource,metadata,read};
})(window);

