/* A seleção pertence ao sistema operacional. Só depois de receber os arquivos
   devolvemos o Android ao mapa e cedemos uma pintura antes de ler/decodificar.
   Não atrasar o clique que abre o seletor: ele precisa do gesto do usuário. */
(function(){
'use strict';
let selection=0;
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
  await handleFiles(files);return true;
 }catch(error){
  hideLoad('error');toast('Falha na importação: '+(error?.message||error));return false;
 }
}
window.GeoMineImportHandoff={beforeRead,fromInput,mobile};
})();
