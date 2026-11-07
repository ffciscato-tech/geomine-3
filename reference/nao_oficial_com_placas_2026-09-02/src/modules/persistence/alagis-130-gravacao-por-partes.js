
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
const GRANDES=['layers','rasters'];   /* as duas listas que pesam */
const TETO_IDB=200*1048576;           /* acima disto, sem cópia no navegador */

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
async function gravaPorPartes(handle, d, rotulo, aoAndar){
  const enc=new TextEncoder();
  let w=null, bytes=0, n=0;
  try{
    w=await handle.createWritable();
    for(const p of projectPedacos(d)){
      const u=enc.encode(p);
      await w.write(u);
      bytes+=u.length;
      if((++n & 63)===0 && aoAndar) aoAndar(bytes);
    }
    await w.close(); w=null;
    const salvo=await handle.getFile();
    if(salvo.size!==bytes)
      throw new Error('gravado '+salvo.size+' bytes; esperado '+bytes+
                      (rotulo?' em '+rotulo:''));
    return {file:salvo, bytes};
  }catch(e){
    if(w&&typeof w.abort==='function'){ try{ await w.abort(); }catch(_){} }
    throw e;
  }
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

window.saveProject=async function(salvarComo){
  salvarComo = (salvarComo===true);
  const handleAtual=S.auto&&S.auto.handle;
  if(!salvarComo&&!handleAtual){
    toast('Este projeto ainda não tem um arquivo com permissão de escrita. Use “Salvar Como” uma vez.');
    return;
  }
  const base=(S.auto&&S.auto.name)||S.currentProjectName||(S.projectMeta&&S.projectMeta.name)||'projeto',
    fname=salvarComo
      ? String(base).replace(/[^\w.\-]/g,'_').replace(/\.(ccmgis|geocampo|alagis)$/i,'')+'.ccmgis'
      : ((handleAtual&&handleAtual.name)||(S.auto&&S.auto.name)||'projeto.ccmgis');

  if((S.rasters||[]).some(r=>r&&r.d&&!r.tinPuro)){
    showLoad('Preparando cópias nativas dos rasters…');
    try{
      const sync=await projectSyncNativeRasters(!!salvarComo);
      if(sync&&!sync.ok)
        toast('Projeto será salvo com a prévia interna; a cópia GeoTIFF nativa aguarda uma pasta de projeto.');
    }catch(e){ console.warn('[130] sync nativo',e); }
  }

  S._saveTargetCell=null;
  const semPasta = (typeof fsApiOK==='function') ? !fsApiOK() : !window.showSaveFilePicker;
  const limiar = semPasta ? 25 : 180;
  if((S.rasters||[]).length && estimaPesoMB(null) > limiar){
    const alvo=await escolheResolucaoSalvar(semPasta);
    if(alvo===false) return;
    S._saveTargetCell=alvo;
  }

  showLoad('Gravando projeto por partes…');
  await new Promise(r=>setTimeout(r,30));

  let d;
  try{ d=projectData(); }
  catch(e){
    hideLoad(); S._saveTargetCell=null;
    toast('Falha ao preparar o projeto — '+(e&&e.message||e));
    return;
  }

  const andar=b=>showLoad('Gravando… '+(b/1048576).toFixed(0)+' MB');
  let bytes=0;
  try{
    if(!salvarComo){
      if(!await ensureRW(handleAtual)) throw new Error('permissão de escrita recusada para '+fname);
      const r=await gravaPorPartes(handleAtual,d,fname,andar);
      bytes=r.bytes;
      startAutosave((handleAtual.name||fname),handleAtual);
      toast('Projeto atualizado em '+(handleAtual.name||fname)+' ('+(bytes/1048576).toFixed(1)+' MB)');
    } else if(window.showSaveFilePicker && (typeof fsApiOK!=='function'||fsApiOK())){
      const opt={suggestedName:fname, excludeAcceptAllOption:true,
        types:[{description:'Projeto CCMGIS', accept:{'application/x-ccmgis':['.ccmgis']}}]};
      if(handleAtual) opt.startIn=handleAtual;
      else if(S._lastSaved) opt.startIn=S._lastSaved;
      const h=await pickSaveFile(opt);
      const r=await gravaPorPartes(h,d,fname,andar);
      bytes=r.bytes;
      lembraLocal(h);
      startAutosave(h.name||fname,h);
      toast('Projeto salvo como '+h.name+' ('+(bytes/1048576).toFixed(1)+' MB) — autosave no mesmo arquivo');
    } else {
      const blob=projectBlob(d);
      bytes=blob.size;
      await download(blob,fname);
      startAutosave(fname,null);
      toast('Seu navegador não permite escolher a pasta — o projeto foi BAIXADO como "'+fname+'".');
    }
    S._saveTargetCell=null;

    /* Cópia recuperável no navegador. Ela exige o texto inteiro, então só é
       feita quando cabe com folga; acima disso o arquivo já está gravado e
       verificado, e forçar a cópia só arriscaria derrubar a aba. */
    if(bytes<=TETO_IDB){
      try{
        const txt=await projectBlob(d).text();
        await idbSet('autosave',{name:fname, at:new Date().toISOString(), txt});
        const br=document.getElementById('btnRestore'); if(br) br.style.display='';
      }catch(e){
        if(typeof cmdLog==='function') cmdLog('cópia de segurança no navegador não foi gravada: '+(e&&e.message||e),'avisa');
      }
    } else if(typeof cmdLog==='function'){
      cmdLog('projeto com '+(bytes/1048576).toFixed(0)+' MB — cópia de recuperação no navegador foi pulada; '+
             'o arquivo gravado foi conferido byte a byte','info');
    }

    if(bytes>TETO*0.97 && typeof cmdLog==='function'){
      cmdLog('ATENÇÃO: '+(bytes/1048576).toFixed(0)+' MB. O arquivo foi gravado, mas ao REABRIR o '+
             'navegador precisa de um texto único, e o limite é '+(TETO/1048576).toFixed(0)+
             ' MB. Reduza a resolução gravada ou recorte as camadas antes do próximo salvamento.','avisa');
      toast('Gravado, mas acima de '+(TETO/1048576).toFixed(0)+' MB — pode não reabrir. Veja a barra de comandos.');
    }
  }catch(e){
    S._saveTargetCell=null;
    if(e && e.name==='AbortError'){ toast('Salvamento cancelado'); }
    else if(!salvarComo){
      console.warn('[130] sobrescrever projeto:',e);
      toast('Não foi possível sobrescrever o arquivo aberto: '+(e&&e.message||e)+'. Use “Salvar Como” se a permissão mudou.');
    } else {
      console.warn('[130] salvar projeto:',e);
      toast('Seletor de pasta indisponível ('+((e&&e.message)||'erro')+') — salvando por download');
      try{ await download(projectBlob(d),fname); startAutosave(fname,null); }
      catch(e2){ toast('Falha também no download: '+(e2&&e2.message||e2)); }
    }
  }finally{
    hideLoad();
  }
};

/* O autosave periódico sofria do mesmo problema, e ainda montava a string
   DUAS vezes (uma para o IndexedDB, outra para o arquivo). */
if(typeof window.autosaveNow==='function'){
  window.autosaveNow=async function(silent){
    if(!S.auto.on || S.auto.busy || !hasContent()) return;
    S.auto.busy=true;
    try{
      const d=projectData();
      const hora=new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
      if(S.auto.handle && await ensureRW(S.auto.handle)){
        const r=await gravaPorPartes(S.auto.handle,d,S.auto.name||'autosave.ccmgis',null);
        if(r.bytes<=TETO_IDB){
          try{ await idbSet('autosave',{name:S.auto.name,at:new Date().toISOString(),
                                        txt:await projectBlob(d).text()}); }catch(_){}
        }
        S.auto.last=hora; autoTag('auto: '+hora);
        if(!silent) toast('Autosalvo em '+S.auto.name+' · '+(r.bytes/1048576).toFixed(1)+' MB');
      } else {
        const blob=projectBlob(d);
        if(blob.size<=TETO_IDB){
          await idbSet('autosave',{name:S.auto.name, at:new Date().toISOString(), txt:await blob.text()});
          S.auto.last=hora; autoTag('auto: '+hora+' (nav.)');
          if(!silent) toast('Autosalvo no navegador — use ↺ Recuperar para restaurar');
        } else {
          autoTag('auto: grande demais','var(--sel)');
          if(!silent) toast('Projeto grande demais para a cópia no navegador — use Salvar');
        }
      }
      const br=document.getElementById('btnRestore'); if(br) br.style.display='';
    }catch(e){ autoTag('auto: falhou','var(--sel)'); console.warn('[130] autosave:',e); }
    finally{ S.auto.busy=false; }
  };
}
console.info('[130] gravação por partes ativa — sem string única do projeto');
})();
