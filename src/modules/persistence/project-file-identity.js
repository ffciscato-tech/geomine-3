/* Displayed project identity and the explicit writable destination are separate.
   A download can have a name without granting overwrite access to its source. */
(function(){
'use strict';
let destination=null,openedSource=null;
const generation=()=>window.GeoMineSessionAutosave?.state?.generation;
const owner=()=>window.GeoMineCloudProvider?.user?.uid||null;
function remember(name,handle){
 openedSource=null;
 destination=handle?{handle,name:name||handle.name,projectId:S.projectId,generation:generation(),owner:owner()}:null;
 if(S.auto){S.auto.delivery=null;S.auto.downloadName=null;}
}
function sourceOpened(name){openedSource={name,projectId:S.projectId,generation:generation(),owner:owner()};}
function needsReconnect(){return !!openedSource&&!currentHandle()&&openedSource.projectId===S.projectId&&openedSource.generation===generation()&&openedSource.owner===owner();}
async function reconnect(){
 if(!needsReconnect())return null;
 const source=openedSource;
 if(typeof window.showOpenFilePicker!=='function')throw Error('Este navegador não permite vincular o arquivo original. Use Salvar Como para guardar suas alterações.');
 toast('Selecione o arquivo original para vincular a gravação. As alterações em tela serão mantidas.');
 const [handle]=await window.showOpenFilePicker({id:'geomine-link-original',multiple:false,types:[{description:'Projeto CCMGIS',accept:{'application/octet-stream':['.ccmgis','.alagis','.geocampo']}}]});
 if(!handle)throw new DOMException('Vinculação cancelada','AbortError');
 if(!await ensureRW(handle,true))throw Error('Autorize a escrita no arquivo original.');
 const file=await handle.getFile(),data=JSON.parse(await readProjectFileCompat(file));
 if(source!==openedSource||!needsReconnect())throw Error('O projeto mudou; vinculação cancelada.');
 if(!['ALAGIS','CCMGIS','CCMGeoCampo'].includes(data.app)||
    (data.projectId?data.projectId!==source.projectId:file.name!==source.name))throw Error('O arquivo escolhido não corresponde ao projeto aberto. Nada foi sobrescrito.');
 startAutosave(file.name,handle);return handle;
}
function currentHandle(){
 if(!destination||destination.projectId!==S.projectId||destination.generation!==generation()||destination.owner!==owner())return null;
 return destination.handle;
}
function render(name){
 const raw=String(name||'').trim(),display=projectNameDisplay(raw)||'Nenhum projeto aberto';
 S.currentProjectName=raw||null;
 const e=document.getElementById('a3OpenProjectName');
 if(e){e.textContent=display;e.title=raw?'Projeto aberto: '+raw:'Nenhum projeto aberto';e.classList.toggle('has-file',!!raw);}
 const h=document.getElementById('a3ProjectTitle');if(h)h.textContent=raw?'CCMGIS 3.1 — '+display:'CCMGIS 3.1';
 document.title=raw?display+' — GeoMine':'GeoMine';
}
function downloadRequested(name){
 S.auto=S.auto||{};S.auto.delivery='download-requested';S.auto.downloadName=name;
 // A Save As download is not proof that the old writable file was replaced.
 if(!S.auto.handle&&!currentHandle()){
  S.auto.name=name;S.auto.backing='download';render(name);
 }
 window.GeoMineSessionAutosave?.markDirty?.('download sem confirmação de escrita');
}
function status(){
 const a=S.auto||{};
 if(a.delivery==='download-requested')return 'Download enviado; confirme o arquivo. O original não foi sobrescrito.';
 if(a.handle||currentHandle())return 'Salvar atualiza o arquivo aberto. Salvar Como permite escolher outro destino.';
 if(a.name||S.currentProjectName)return (window.GeoMineProjectSaveTarget
  ?GeoMineProjectSaveTarget.available():window.showSaveFilePicker&&typeof fsApiOK==='function'&&fsApiOK())
  ?'Projeto aberto sem acesso de escrita ao original. Escolha o destino uma vez; os próximos salvamentos reutilizam esse arquivo.'
  :'Este navegador salva por download e não pode sobrescrever automaticamente o arquivo original.';
 return 'Projeto novo: escolha o destino no primeiro Salvar.';
}
window.GeoMineProjectFile={remember,currentHandle,render,downloadRequested,status,sourceOpened,needsReconnect,reconnect};
})();
