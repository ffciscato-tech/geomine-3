
/* ============================================================================
   SALVAR POR PARTES — sem montar o projeto inteiro como um texto só

   O que travava: saveProject fazia

       txt = JSON.stringify(projectData())

   e daí em diante tudo dependia dessa string única. Isso impõe dois limites.
   O duro é do motor: JSON.stringify não devolve string acima de 536.870.888
   caracteres (512 MiB) — passou disso, lança "Invalid string length" e não há
   destino que salve. O outro é de memória: mesmo abaixo do teto, a string, a
   cópia do autosave e o Blob coexistem, e a aba morre antes de gravar. Foi o
   que aconteceu aqui ao serializar o projeto de 510 MB: o renderizador caiu.

   Por causa disso o código recusava qualquer projeto acima de 380 MB — margem
   conservadora contra um limite que ele não conseguia medir. Só que o projeto
   Titan recortado tem 255 MB e, publicando um raster por critério, chega a
   ~460 MB: seria recusado sem necessidade.

   Aqui o JSON é emitido em PEDAÇOS — o cabeçalho, depois uma camada por vez,
   depois um raster por vez — e cada pedaço vai direto para o arquivo pelo
   fluxo de escrita da File System Access API. O maior objeto vivo passa a ser
   uma camada (~91 MB no Titan), não o projeto inteiro. O arquivo que sai é UM
   só, byte a byte no mesmo formato de antes.

   O teto de 512 MB continua valendo para REABRIR, porque JSON.parse também
   precisa de uma string única — por isso o aviso permanece, agora no limite
   real e não em 380 MB.

   Bloco ADITIVO. As originais ficam em window.saveProjectOriginal e
   window.autosaveNowOriginal.
   ========================================================================== */
(function(){
'use strict';
if(window.ALAGIS130){ console.info('[130] já instalado'); return; }
if(typeof window.saveProject!=='function' || typeof window.projectData!=='function'){
  console.warn('[130] saveProject/projectData ausentes — bloco ignorado'); return; }
window.ALAGIS130=1;
window.saveProjectOriginal=window.saveProject;
window.autosaveNowOriginal=window.autosaveNow;

const TETO=536870888;                 /* limite de string do motor */
const GRANDES=['layers','rasters','solidos'];   /* as listas que pesam (sólidos levam a geometria) */
const TETO_IDB=200*1048576;           /* acima disto, sem cópia no navegador */
const draftKey=projectId=>typeof autosaveStorageKey==='function'
  ?autosaveStorageKey(projectId):'autosave';
const HANDLE_WRITE_QUEUES=new WeakMap();

/* Gerador dos pedaços. Cada `yield` é um texto pequeno o bastante para
   existir sozinho; nenhum deles é o projeto inteiro. */
function* projectPedacos(d){
  const leve={};
  Object.keys(d).forEach(k=>{ if(GRANDES.indexOf(k)<0) leve[k]=d[k]; });
  const cab=JSON.stringify(leve);
  yield cab.slice(0,-1);                       /* tira o '}' final */
  let primeiro=(cab==='{}');                   /* nada saiu ainda: sem vírgula */
  for(const k of GRANDES){
    if(d[k]===undefined) continue;
    yield (primeiro?'':',')+'"'+k+'":[';
    primeiro=false;
    const arr=d[k]||[];
    for(let i=0;i<arr.length;i++){
      if(i) yield ',';
      yield JSON.stringify(arr[i]);
    }
    yield ']';
  }
  yield '}';
}

/* Escreve os pedaços direto no arquivo e confere o tamanho gravado, do mesmo
   jeito que fileHandleWriteVerified faz — mas sem nunca ter o todo em mãos. */
async function gravaPorPartesDireto(handle, d, rotulo, aoAndar){
  const enc=new TextEncoder();
  let w=null, bytes=0, n=0,phase='open';
  try{
    w=await handle.createWritable();
    phase='write';
    for(const p of projectPedacos(d)){
      const u=enc.encode(p);
      await w.write(u);
      bytes+=u.length;
      if((++n & 63)===0 && aoAndar) aoAndar(bytes);
    }
    phase='close';await w.close(); w=null;phase='verify';
    if(typeof projectVerifyFileBytes!=='function')throw new Error('verificação do conteúdo do projeto indisponível');
    let salvo;
    if(window.GeoMineSaveVerification)salvo=await GeoMineSaveVerification.verify(handle,bytes,()=>projectPedacos(d),rotulo);
    else{
      salvo=await handle.getFile();
      if(salvo.size!==bytes)throw new Error('gravado '+salvo.size+' bytes; esperado '+bytes+(rotulo?' em '+rotulo:''));
      await projectVerifyFileBytes(salvo,projectPedacos(d),rotulo);
    }
    return {file:salvo, bytes};
  }catch(e){
    if(w&&typeof w.abort==='function'){ try{ await w.abort(); }catch(_){} }
    throw window.GeoMineSaveVerification?GeoMineSaveVerification.failure(e,phase):e;
  }
}

/* Cliques sucessivos em Salvar usam uma fila por FileSystemFileHandle. Isso
   evita dois createWritable concorrentes sem atrasar a abertura do seletor. */
async function gravaPorPartes(handle,d,rotulo,aoAndar){
  const anterior=HANDLE_WRITE_QUEUES.get(handle)||Promise.resolve();
  let atual;
  atual=anterior.catch(()=>{}).then(()=>gravaPorPartesDireto(handle,d,rotulo,aoAndar));
  HANDLE_WRITE_QUEUES.set(handle,atual);
  try{return await atual;}
  finally{if(HANDLE_WRITE_QUEUES.get(handle)===atual)HANDLE_WRITE_QUEUES.delete(handle);}
}

/* Sem seletor de pasta (Firefox/Safari/file://) resta o download, que precisa
   de um Blob. O Blob aceita mais que uma string, e é montado a partir dos
   mesmos pedaços — o texto único continua não existindo. */
function projectBlob(d){
  const ch=[];
  for(const p of projectPedacos(d)) ch.push(p);
  return new Blob(ch,{type:'application/octet-stream'});
}
window.projectPedacos=projectPedacos;
window.projectBlobPorPartes=projectBlob;

/* Cópia de uma ação explícita de Salvar, inclusive se o destino falhar ou
   for apenas um download não confirmado. O snapshot já é independente do
   estado vivo; arquivo e recuperação representam exatamente a mesma versão. */
async function guardaCopiaManual(d,key,ownerUid,name,knownBytes,blob){
  if(knownBytes>TETO_IDB)return false;
  try{
    if(!blob){
      const parts=[],enc=new TextEncoder();let size=0;
      for(const part of projectPedacos(d)){
        size+=enc.encode(part).byteLength;
        if(size>TETO_IDB)return false;
        parts.push(part);
      }
      blob=new Blob(parts,{type:'application/octet-stream'});
    }
    if(blob.size>TETO_IDB)return false;
    const txt=await blob.text();
    await idbSet(key,{projectId:d.projectId||null,ownerUid,name,at:new Date().toISOString(),txt});
    const button=document.getElementById('btnRestore');if(button)button.style.display='';
    return true;
  }catch(error){
    if(typeof cmdLog==='function')cmdLog('cópia de recuperação não gravada: '+(error.message||error),'avisa');
    return false;
  }
}

window.saveProject=async function(salvarComo){
  /* Navegador sem seletor de arquivos para escrita (iPad, Safari, Firefox):
     não há como vincular o original, então Salvar não pode parar num aviso —
     segue pelo mesmo caminho do Salvar Como e entrega o arquivo por download.
     O aviso do download já diz que o original não foi alterado. */
  if(salvarComo!==true&&window.GeoMineProjectFile?.needsReconnect()&&typeof window.showOpenFilePicker==='function'){
    try{await GeoMineProjectFile.reconnect();}
    catch(error){toast(error.name==='AbortError'?'Vinculação cancelada; alterações mantidas em tela.':error.message);return false;}
  }
  const handleAtual=window.GeoMineProjectFile?.currentHandle()||(S.auto&&S.auto.handle);
  const pediuSalvarComo=salvarComo===true;
  salvarComo = (salvarComo===true)||!handleAtual;
  const projectIdAtual=S.projectId||null,
    geracaoAtual=window.GeoMineSessionAutosave?.state?.generation;
  const donoCopia=typeof autosaveOwnerUid==='function'?autosaveOwnerUid():null,
    chaveCopia=draftKey(projectIdAtual);
  const mesmoProjeto=()=> (S.projectId||null)===projectIdAtual&&
    window.GeoMineSessionAutosave?.state?.generation===geracaoAtual;
  const base=(S.auto&&S.auto.name)||S.currentProjectName||(S.projectMeta&&S.projectMeta.name)||'projeto';
  let fname=salvarComo
      ? String(base).replace(/[^\w.\-]/g,'_').replace(/\.(ccmgis|geocampo|alagis)$/i,'')+'.ccmgis'
      : ((handleAtual&&handleAtual.name)||(S.auto&&S.auto.name)||'projeto.ccmgis');

  /* Abrir o seletor ainda no gesto do usuário, antes de sincronizações e
     serializações demoradas. Uma falha na escrita do destino escolhido não
     deve ser disfarçada como sucesso de um download em outra pasta. */
  let destinoNovo=null;
  if(!salvarComo&&!await ensureRW(handleAtual,true)){
    toast('Sem permissão para atualizar '+fname+'. Autorize a escrita ou use Salvar Como.');return false;
  }
  const saveTarget=window.GeoMineProjectSaveTarget;
  /* GRAVAÇÃO DIRETA NO GOOGLE DRIVE (drive-project-save.js)
     Sem seletor de arquivos para escrita (iPad) ou com o projeto vinculado ao
     Drive, Salvar grava em cima do arquivo original e Salvar Como cria o
     arquivo na pasta escolhida do Drive. A autorização e a escolha acontecem
     aqui, ainda dentro do toque. Só se o Drive falhar é oferecido o download. */
  const seletorDeGravacao=saveTarget?saveTarget.available():!!(window.showSaveFilePicker&&(typeof fsApiOK!=='function'||fsApiOK()));
  let planoDrive=null,vinculoDrive=false;
  try{vinculoDrive=!!window.GeoMineDriveProject?.isSource(window.GeoMineProjectTabSession?.bindingFor?.(projectIdAtual)?.source);}catch(_){}
  if(!handleAtual&&window.GeoMineDriveSave?.available()&&(!seletorDeGravacao||(vinculoDrive&&!pediuSalvarComo))){
    try{
      /* No Drive o nome não precisa ser "limpo": vale o nome do projeto como a pessoa o vê. */
      planoDrive=await GeoMineDriveSave.prepare({saveAs:pediuSalvarComo,name:String(base).replace(/\.(ccmgis|geocampo|alagis)$/i,'')+'.ccmgis',projectId:projectIdAtual});
      fname=planoDrive.name||fname;
    }catch(error){
      if(error&&error.name==='AbortError'){toast('Salvamento cancelado');return false;}
      console.warn('[130] Google Drive:',error);
      if(!confirm('Não foi possível gravar no Google Drive: '+(error&&error.message||error)+'\n\nBaixar uma cópia do projeto neste aparelho? (O arquivo do Drive não é alterado.)')){
        toast('Projeto não salvo. As alterações continuam em tela.');return false;
      }
    }
    if(!mesmoProjeto()){toast('O projeto mudou; salvamento cancelado.');return false;}
  }
  if(!planoDrive&&salvarComo&&seletorDeGravacao){
    const opt={suggestedName:fname,excludeAcceptAllOption:true,
      types:[{description:'Projeto CCMGIS',accept:{'application/x-ccmgis':['.ccmgis']}}]};
    if(handleAtual)opt.startIn=handleAtual;else if(S._lastSaved)opt.startIn=S._lastSaved;
    try{destinoNovo=await (saveTarget?saveTarget.pick(opt):pickSaveFile(opt));fname=destinoNovo.name||fname;}
    catch(error){
      if(error&&error.name==='AbortError'){toast('Salvamento cancelado');return false;}
      console.warn('[130] seletor indisponível',error);
    }
  }
  if(!mesmoProjeto()){toast('O projeto mudou; salvamento cancelado.');return false;}

  if((S.rasters||[]).some(r=>r&&r.d&&!r.tinPuro)||S.img){
    showLoad('Verificando vínculos dos rasters; reutilizando os arquivos existentes…');
    try{
      const sync=typeof projectSyncNativeSources==='function'
        ?await projectSyncNativeSources(!!salvarComo):await projectSyncNativeRasters(!!salvarComo);
      if(sync&&!sync.ok)
        toast('Projeto será salvo com a prévia interna; a cópia GeoTIFF nativa aguarda uma pasta de projeto.');
    }catch(e){ console.warn('[130] sync nativo',e); }
  }
  if(!mesmoProjeto()){hideLoad();toast('O projeto mudou; salvamento cancelado.');return false;}

  S._saveTargetCell=null;
  const semPasta = (typeof fsApiOK==='function') ? !fsApiOK() : !window.showSaveFilePicker;
  const limiar = semPasta ? 25 : 180;
  if((S.rasters||[]).length && estimaPesoMB(null) > limiar){
    const alvo=await escolheResolucaoSalvar(semPasta);
    if(!mesmoProjeto()){hideLoad();toast('O projeto mudou; salvamento cancelado.');return false;}
    if(alvo===false){S._saveTargetCell=null;hideLoad();return false;}
    S._saveTargetCell=alvo;
  }

  showLoad('Gravando projeto por partes…');
  await new Promise(r=>setTimeout(r,30));

  let d;
  try{
    /* As escolhas de raster e de destino podem ceder a execução. Se nesse
       intervalo outro projeto foi aberto, nunca serializamos o novo conteúdo
       para o handle capturado do projeto anterior. */
    if(!mesmoProjeto())throw new Error('o projeto mudou durante a preparação; salvamento cancelado');
    d=projectData();d.projectFileName=fname;
  }
  catch(e){
    hideLoad();if(mesmoProjeto())S._saveTargetCell=null;
    toast('Falha ao preparar o projeto — '+(e&&e.message||e));
    return false;
  }

  const andar=b=>showLoad('Gravando… '+(b/1048576).toFixed(0)+' MB');
  let bytes=0,salvo=false,snapshotBlob=null;
  try{
    if(!salvarComo){
      if(!await ensureRW(handleAtual,true)) throw new Error('permissão de escrita recusada para '+fname);
      const r=await gravaPorPartes(handleAtual,d,fname,andar);
      bytes=r.bytes;
      if(mesmoProjeto())startAutosave((handleAtual.name||fname),handleAtual);
      toast('Projeto atualizado em '+(handleAtual.name||fname)+' ('+(bytes/1048576).toFixed(1)+' MB)');
    } else if(planoDrive){
      snapshotBlob=projectBlob(d);bytes=snapshotBlob.size;
      const origem=await GeoMineDriveSave.commit(planoDrive,snapshotBlob,
        (feito,total)=>showLoad('Gravando no Google Drive… '+Math.round(100*feito/Math.max(1,total))+'% de '+(total/1048576).toFixed(1)+' MB'));
      if(mesmoProjeto())startAutosave(origem.name||fname,null,origem);
      toast((planoDrive.mode==='create'?'Projeto salvo no Google Drive como ':'Projeto atualizado no Google Drive: ')+(origem.name||fname)+' ('+(bytes/1048576).toFixed(1)+' MB)');
    } else if(destinoNovo&&await (async()=>{
      /* navegador que mostra o seletor mas recusa gravar no arquivo escolhido
         (painel do app Claude, outros Electron): cai no download logo abaixo */
      const h=destinoNovo;let r;
      try{r=await gravaPorPartes(h,d,fname,andar);}
      catch(e){if(typeof fsMarcaRecusa==='function'&&fsMarcaRecusa(e))return false;throw e;}
      bytes=r.bytes;
      lembraLocal(h);
      if(mesmoProjeto())startAutosave(h.name||fname,h);
      toast('Projeto salvo como '+h.name+' ('+(bytes/1048576).toFixed(1)+' MB)');
      return true;
    })()){
      /* gravado no destino escolhido */
    } else {
      snapshotBlob=projectBlob(d);bytes=snapshotBlob.size;
      const outcome=await download(snapshotBlob,fname,{reportResult:true,skipPicker:true});
      if(outcome===false||outcome?.status==='canceled'){toast('Salvamento cancelado');return false;}
      if(outcome?.status==='written'&&outcome.handle){
        if(mesmoProjeto())startAutosave(outcome.name||fname,outcome.handle);
      }else{
        if(mesmoProjeto())window.GeoMineProjectFile?.downloadRequested(fname);
        toast('Download iniciado: '+fname+'. Confira o novo arquivo em Downloads. O arquivo original não foi alterado; a gravação ainda não está confirmada.');
        return false;
      }
    }
    salvo=true;
    if(mesmoProjeto())S._saveTargetCell=null;

    if(bytes>TETO_IDB&&typeof cmdLog==='function'){
      cmdLog('projeto com '+(bytes/1048576).toFixed(0)+' MB — cópia de recuperação no navegador foi pulada; '+
             'confira o arquivo gravado antes de fechar o projeto','info');
    }

    if(bytes>TETO*0.97 && typeof cmdLog==='function'){
      cmdLog('ATENÇÃO: '+(bytes/1048576).toFixed(0)+' MB. O arquivo foi gravado, mas ao REABRIR o '+
             'navegador precisa de um texto único, e o limite é '+(TETO/1048576).toFixed(0)+
             ' MB. Reduza a resolução gravada ou recorte as camadas antes do próximo salvamento.','avisa');
      toast('Gravado, mas acima de '+(TETO/1048576).toFixed(0)+' MB — pode não reabrir. Veja a barra de comandos.');
    }
  }catch(e){
    if(mesmoProjeto())S._saveTargetCell=null;
    if(e && e.name==='AbortError'){ toast('Salvamento cancelado'); }
    else if(planoDrive){
      console.warn('[130] gravar no Google Drive:',e);
      toast('Não foi possível gravar no Google Drive: '+(e&&e.message||e)+' As alterações continuam em tela; toque em Salvar para tentar de novo.');
    }
    else if(!salvarComo){
      console.warn('[130] sobrescrever projeto:',e);
      toast('Não foi possível sobrescrever o arquivo aberto: '+(e&&e.message||e)+'. Use “Salvar Como” se a permissão mudou.');
    } else {
      console.warn('[130] salvar projeto:',e);
      toast('Não foi possível gravar '+fname+': '+(e&&e.message||e)+'. As alterações continuam não salvas.');
    }
  }finally{
    if(mesmoProjeto())S._saveTargetCell=null;
    await guardaCopiaManual(d,chaveCopia,donoCopia,fname,bytes,snapshotBlob);
    hideLoad();
  }
  return salvo;
};

/* API legada mantida sem efeitos: o projeto só é gravado por Salvar. */
if(typeof window.autosaveNow==='function'){
  window.autosaveNow=async function(silent){
    return false;
  };
}
console.info('[130] gravação por partes ativa — sem string única do projeto');
})();
