/* A cloud provider may invalidate a File snapshot immediately after close().
   Retry read-back with a NEW snapshot; never retry the write or skip integrity. */
(function(){
'use strict';
const phases={open:'abrir o destino para escrita',write:'gravar o conteúdo',close:'concluir a gravação',verify:'conferir o arquivo gravado'};
function failure(error,phase){
  if(error?.name==='AbortError'||error?.savePhase)return error;
  const out=new Error('Falha ao '+(phases[phase]||phase)+': '+(error?.message||error),{cause:error});
  out.name=error?.name||'Error';out.savePhase=phase;out.saveUnverified=phase==='verify';
  if(phase==='verify')out.message+=' A gravação foi enviada, mas ainda não está confirmada. Mantenha o projeto aberto e, se necessário, use Salvar Como em uma pasta local fora do Drive.';
  return out;
}
async function verify(handle,size,pieces,label){
  for(let attempt=0;attempt<3;attempt++){
    try{
      // Do not retain/reuse a previous Blob, even if getFile() itself worked.
      const file=await handle.getFile();
      if(file.size!==size)throw new Error('tamanho gravado '+file.size+' bytes; esperado '+size+' bytes'+(label?' em '+label:''));
      await projectVerifyFileBytes(file,pieces(),label);
      return file;
    }catch(error){
      const temporary=['NotReadableError','NotFoundError'].includes(error?.name);
      if(!temporary||attempt===2)throw failure(error,'verify');
      if(typeof cmdLog==='function')cmdLog('Arquivo temporariamente indisponível para conferência. Renovando a leitura ('+(attempt+2)+'/3), sem gravar novamente…','warn');
      await new Promise(resolve=>setTimeout(resolve,attempt===0?200:600));
    }
  }
}
window.GeoMineSaveVerification={verify,failure};
})();
