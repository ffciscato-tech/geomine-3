/* A seleção pertence ao sistema operacional. Só depois de receber os arquivos
   devolvemos o Android ao mapa e cedemos uma pintura antes de ler/decodificar.
   Não atrasar o clique que abre o seletor: ele precisa do gesto do usuário. */
(function(){
'use strict';
let selection=0,lastResult=null;
const mobile=()=>typeof fsApiOK==='function'&&!fsApiOK();
function painted(){
 return new Promise(resolve=>{
  let done=false,first=0,second=0;
  const finish=()=>{if(done)return;done=true;clearTimeout(timer);cancelAnimationFrame(first);cancelAnimationFrame(second);resolve();};
  // Uma aba oculta pode suspender rAF: não deixar a importação pendurada.
  const timer=setTimeout(finish,200);
  first=requestAnimationFrame(()=>{second=requestAnimationFrame(finish);});
 });
}
async function beforeRead({ownerId,message='Lendo arquivo…',current=()=>true}={}){
 const project=S.projectId,generation=window.GeoMineSessionAutosave?.state?.generation;
 if(mobile()){
  if(typeof ribbonClose==='function')ribbonClose();
  if(ownerId)document.getElementById(ownerId)?.classList.remove('on');
  if(S._view!=='map'&&typeof switchView==='function')switchView('map');
  document.getElementById('right')?.classList.remove('open');
 }
 S._loadCancel=false;
 showLoad(message);
 await painted();
 return !S._loadCancel&&project===S.projectId&&generation===window.GeoMineSessionAutosave?.state?.generation&&current();
}
async function fromInput(input){
 const files=Array.from(input?.files||[]);if(input)input.value='';
 if(!files.length)return false;
 const token=++selection;
 if(S._rasterImportController)S._rasterImportController.abort();
 try{
  if(!await beforeRead({message:files.length===1?'Lendo '+files[0].name+'…':`Lendo ${files.length} arquivos…`,current:()=>token===selection}))return false;
  const result=await handleFiles(files);lastResult=result;return result?.ok!==false&&!result?.canceled;
 }catch(error){
  hideLoad('error');toast('Falha na importação: '+(error?.message||error));return false;
 }
}
function presentRaster(item,type){
 if(!item)return;item.visible=true;
 const anchor=(S.rasters||[]).find(r=>r!==item)|| (S.img!==item?S.img:null);
 if(anchor&&typeof placeProductAbove==='function')placeProductAbove(item,anchor);
 for(const g of typeof groupPath==='function'?groupPath(item.groupId):[])g.collapsed=false;
 const search=document.getElementById('layerSearch');if(search)search.value='';
 S.selRaster=item;S.activeId=null;refreshUI();
 const key=nodeKey(type,type==='I'?0:item.id),row=[...document.querySelectorAll('#layerList .layer')].find(r=>r.dataset.treeKey===key);
 row?.scrollIntoView({block:'nearest',inline:'nearest'});
 if(item.overlay?.getBounds)safeFit(item.overlay.getBounds());
 if(typeof cmdLog==='function')cmdLog('Camada adicionada: '+item.name,'ok');
}
window.GeoMineImportHandoff={beforeRead,fromInput,mobile,presentRaster,get lastResult(){return lastResult;}};
})();
