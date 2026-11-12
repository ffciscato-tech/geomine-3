/* ============================================================================
   IMPORTAÇÃO DE ARQUIVOS
   ========================================================================== */
/* A File System Access API (showOpenFilePicker etc.) só é usada no DESKTOP.
   No Android/celular a implementação é parcial e o picker pode abrir uma
   janela que NÃO fecha (nem com voltar) — obrigando a matar o Chrome.
   No celular, TODOS os fluxos caem no <input type=file> padrão do sistema,
   que fecha com o botão voltar sempre. */
function fsApiOK(){
  const ua=navigator.userAgent||'';
  const mob=(navigator.userAgentData && navigator.userAgentData.mobile===true) ||
    /Android|iPhone|iPad|Mobile/i.test(ua) ||
    /* iPadOS pode se anunciar como Macintosh quando "site para computador"
       está ativo; o toque múltiplo é o sinal que o separa de um Mac. */
    (/Macintosh/i.test(ua) && (navigator.maxTouchPoints||0)>1);
  return !mob;
}
// A dropped File is only a snapshot. Retain its exact filesystem capability
// while the drop event is active; never reconstruct a destination by filename.
const projectDroppedHandles=new WeakMap();
function projectCaptureDroppedFiles(dt){
  const files=[];
  for(const item of Array.from(dt?.items||[])){
    if(item.kind!=='file')continue;
    const file=item.getAsFile();if(!file)continue;files.push(file);
    if(typeof item.getAsFileSystemHandle==='function'){
      try{projectDroppedHandles.set(file,Promise.resolve(item.getAsFileSystemHandle()).then(h=>{
        const handle=h?.kind==='file'?h:null;
        if(handle)try{window.GeoMineOriginalSources?.capture(file,handle);}catch(_){}
        return handle;
      },()=>null));}catch(_){}
    }
  }
  return files.length?files:Array.from(dt?.files||[]);
}
/* SELETOR QUE NÃO LIBERA O ARQUIVO: navegadores embutidos (o painel de
   navegador do app Claude, outros baseados em Electron) expõem
   showOpenFilePicker/showSaveFilePicker, mas recusam getFile/createWritable
   no arquivo recém-escolhido ("not allowed by the user agent or the platform
   in the current context"). Num arquivo que o próprio usuário acabou de
   escolher, essa recusa não é falta de permissão: é o navegador. A partir da
   primeira recusa, esta aba passa a abrir pelo <input type=file> e a gravar
   por download, como no Firefox/Safari. A marca vale só para a sessão da aba:
   uma recusa avulsa num Chrome comum não desliga o seletor para sempre. */
const FS_RECUSA='geomine.fsapi.recusado';
let fsRecusaMem=false;
function fsHandlesOK(){if(fsRecusaMem)return false;try{return sessionStorage.getItem(FS_RECUSA)!=='1';}catch(_){return true;}}
function fsMarcaRecusa(e){
  if(!e||(e.name!=='NotAllowedError'&&e.name!=='SecurityError'))return false;
  fsRecusaMem=true;try{sessionStorage.setItem(FS_RECUSA,'1');}catch(_){}
  try{cmdLog('Este navegador não libera o arquivo escolhido pelo seletor avançado; o GeoMine passa a usar o seletor simples e o download.','avisa');}catch(_){}
  return true;
}
/* O seletor simples precisa de um clique novo: o gesto que abriu o seletor
   avançado já foi usado. */
function fsSeletorSimples(acao,titulo){
  const bg=document.createElement('div');bg.className='modal-bg on';bg.id='fsSimplesModal';
  bg.innerHTML='<div class="modal" style="width:min(470px,100%)"><div class="modal-h"><b>'+esc(titulo||'Escolher o arquivo de novo')+'</b></div>'+
    '<div class="modal-b"><p style="margin:0 0 12px;font-size:13px;line-height:1.55">Este navegador mostra a janela de arquivos, mas não deixa o GeoMine ler o arquivo escolhido nela. '+
    'Daqui em diante o GeoMine usa o seletor simples, que funciona aqui. Clique em <b>Escolher o arquivo</b> e selecione-o de novo.</p>'+
    '<div class="row2"><button class="tbtn" id="fsSimplesOk" style="justify-content:center">📂 Escolher o arquivo</button>'+
    '<button class="mini" id="fsSimplesNo" style="justify-content:center">Cancelar</button></div></div></div>';
  document.body.appendChild(bg);
  bg.querySelector('#fsSimplesNo').onclick=()=>bg.remove();
  bg.querySelector('#fsSimplesOk').onclick=()=>{bg.remove();acao();};
}
/* Desktop imports/relinks retain the exact file capability selected by the
   user. Keep native inputs/change handlers intact for mobile, unsupported
   browsers, automation and programmatic clicks outside an active gesture. */
(function(){
  const installed=new WeakSet(),bypass=new WeakSet();let busy=false;
  function bind(){
    for(const id of ['fileIn','ortoReligarFile','imgReligarFile']){
      const input=document.getElementById(id);if(!input||installed.has(input))continue;
      installed.add(input);
      input.addEventListener('click',async event=>{
        if(bypass.has(input)){bypass.delete(input);return;}
        if(!fsApiOK()||!fsHandlesOK()||typeof window.showOpenFilePicker!=='function')return;
        const importing=id==='fileIn',onChange=input.onchange;
        if(!importing&&typeof onChange!=='function')return;
        const activation=navigator.userActivation;
        if((activation&&!activation.isActive)||(!event.isTrusted&&!activation?.isActive))return;
        event.preventDefault();if(busy)return;busy=true;
        const project=S.projectId,generation=window.GeoMineSessionAutosave?.state?.generation,image=S.img,
          current=()=>S.projectId===project&&window.GeoMineSessionAutosave?.state?.generation===generation&&
            (importing||S.img===image);
        try{
          // This call must stay before the first await: the OS picker requires
          // the transient activation of the Import/Locate button or label.
          const pending=window.showOpenFilePicker({id:importing?'geomine-import-files':'geomine-ortho-source',multiple:importing,
            ...(window.GeoMineProjectTabSession?.pickerStartIn?.()?{startIn:window.GeoMineProjectTabSession.pickerStartIn()}:{}),
            ...(!importing?{types:[{description:'GeoTIFF',accept:{'image/tiff':['.tif','.tiff']}}]}:{})});
          const handles=await pending,files=[];
          if(!current())return;
          for(const handle of handles||[]){
            if(handle?.kind!=='file'||typeof handle.getFile!=='function')continue;
            const file=await handle.getFile();if(!current())return;
            projectDroppedHandles.set(file,Promise.resolve(handle));
            try{window.GeoMineOriginalSources?.capture(file,handle);}catch(_){}
            files.push(file);
          }
          if(files.length&&current()){
            const selection={files,value:''};
            if(importing)await GeoMineImportHandoff.fromInput(selection);
            else await onChange.call(input,{target:selection,currentTarget:input,type:'change'});
          }
        }catch(error){
          if(error?.name==='AbortError')return;
          if(fsMarcaRecusa(error)&&current()){
            fsSeletorSimples(()=>{bypass.add(input);input.click();},importing?'Importar pelo seletor simples':'Localizar o GeoTIFF');
          }else if(current()){
            toast('Não foi possível abrir os arquivos: '+(error?.message||error));
          }
        }finally{busy=false;}
      });
    }
  }
  bind();document.addEventListener('DOMContentLoaded',bind,{once:true});
})();
/* Abre GeoTIFF como ARQUIVO, não como fotografia. No Android, qualquer MIME
   image/* (inclusive image/tiff) pode entregar o pedido ao Google Fotos em
   vez do gerenciador Files/Drive. Por isso o tablet recebe o seletor genérico
   e a extensão/conteúdo é validada pelo importador depois da escolha. */
function abrirSeletorGeoTIFF(inp){
  if(!inp) return false;
  inp.value='';
  if(fsApiOK()) inp.setAttribute('accept','.tif,.tiff,application/octet-stream');
  else{
    inp.removeAttribute('accept');
    inp.removeAttribute('capture');
  }
  inp.click();
  return true;
}
/* Torna as janelas (.modal) arrastáveis pelo cabeçalho (.modal-h).
   Delegação global: vale para qualquer modal, inclusive os criados depois. */
(function(){
  let drag=null;
  const pt=e=>e.touches?e.touches[0]:e;
  function start(e){
    /* Na interface CCMGIS 3 as caixas são painéis encaixados. Não permitir
       que um arraste acidental volte a colocá-las sobre as feições. */
    if(document.body.classList.contains('alagis3')) return;
    const h=e.target.closest('.modal-h'); if(!h) return;
    if(e.target.closest('button,select,input,a,.tag')) return;   // não arrasta pelos controles
    const m=h.closest('.modal'); if(!m) return;
    const r=m.getBoundingClientRect();
    // fixa a posição atual antes de arrastar (sai do flex centralizado)
    m.classList.add('dragged');
    m.style.left=r.left+'px'; m.style.top=r.top+'px';
    m.style.width=r.width+'px';
    const p=pt(e);
    drag={m, dx:p.clientX-r.left, dy:p.clientY-r.top};
    e.preventDefault();
  }
  function move(e){
    if(!drag) return;
    const p=pt(e);
    let nx=p.clientX-drag.dx, ny=p.clientY-drag.dy;
    // mantém a barra de título acessível dentro da tela
    const mw=drag.m.offsetWidth, vw=window.innerWidth, vh=window.innerHeight;
    nx=Math.max(-(mw-80), Math.min(vw-80, nx));
    ny=Math.max(0, Math.min(vh-40, ny));
    drag.m.style.left=nx+'px'; drag.m.style.top=ny+'px';
    e.preventDefault();
  }
  function end(){ drag=null; }
  document.addEventListener('mousedown',start);
  document.addEventListener('mousemove',move);
  document.addEventListener('mouseup',end);
  document.addEventListener('touchstart',start,{passive:false});
  document.addEventListener('touchmove',move,{passive:false});
  document.addEventListener('touchend',end);
  // ao reabrir um modal, volta ao centro (remove a posição fixada ao arrastar)
  function resetPos(bg){ const mm=bg.querySelector&&bg.querySelector('.modal');
    if(mm){ mm.classList.remove('dragged'); mm.style.left=mm.style.top=mm.style.width=''; } }
  const obs=new MutationObserver(muts=>{ muts.forEach(mu=>{
    const el=mu.target;
    if(el.classList&&el.classList.contains('modal-bg')&&el.classList.contains('on')) resetPos(el);
  }); });
  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('.modal-bg').forEach(bg=>
      obs.observe(bg,{attributes:true,attributeFilter:['class']}));
  });
})();
/* Posiciona todas as janelas de comando pela borda REAL do painel de
   camadas. Funciona também depois de redimensionar a janela ou alterar a
   ribbon, sem depender da largura fixa escrita no CSS. */
(function(){
  let quadroComando=0;
  function agendaJanelasComando(){
    if(quadroComando)return;
    quadroComando=requestAnimationFrame(()=>{quadroComando=0;posicionaJanelasComando();});
  }
  function posicionaJanelasComando(){
    if(!document.body.classList.contains('alagis3'))return;
    const raiz=document.body,camadas=document.getElementById('right'),corpo=document.getElementById('body'),
      status=document.querySelector('.readout');
    const rc=camadas&&camadas.getBoundingClientRect(),rb=corpo&&corpo.getBoundingClientRect(),
      rs=status&&status.getBoundingClientRect();
    const esquerda=Math.max(6,Math.round((rc&&rc.width?rc.right:300)+6));
    // No Android, as barras do navegador e o teclado reduzem a área visível
    // sem necessariamente alterar 100vh (ou disparar resize da janela).
    // Mede topo, rodapé e altura no MESMO sistema de coordenadas CSS.
    const vv=window.visualViewport,visTop=vv?vv.offsetTop:0;
    const visBottom=Math.min(innerHeight,visTop+(vv?vv.height:innerHeight));
    const statusVisivel=rs&&rs.height&&rs.top>visTop&&rs.top<visBottom;
    const limite=Math.min(visBottom-8,statusVisivel?rs.top-4:visBottom-8);
    // Se o teclado ocupar quase toda a tela, sobe sobre a ribbon para manter
    // cabeçalho, duas linhas de ações por toque e uma faixa rolável de campos.
    const topo=Math.max(visTop+6,Math.min(Math.max(visTop+6,(rb&&rb.height?rb.top:150)+5),limite-240));
    const baixo=Math.max(8,innerHeight-limite);
    const valores={'--alagis-command-left':esquerda+'px','--alagis-command-top':topo+'px',
      '--alagis-command-bottom':baixo+'px','--alagis-command-height':Math.max(0,limite-topo)+'px'};
    for(const [nome,valor] of Object.entries(valores))
      if(raiz.style.getPropertyValue(nome)!==valor)raiz.style.setProperty(nome,valor);
  }
  window.addEventListener('resize',agendaJanelasComando,{passive:true});
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',agendaJanelasComando,{passive:true});
    window.visualViewport.addEventListener('scroll',agendaJanelasComando,{passive:true});
  }
  document.addEventListener('DOMContentLoaded',()=>{
    posicionaJanelasComando();
    const alvos=[document.getElementById('right'),document.getElementById('ribbon'),document.getElementById('ribCats'),document.querySelector('.readout')].filter(Boolean);
    if(window.ResizeObserver){const ro=new ResizeObserver(agendaJanelasComando);alvos.forEach(x=>ro.observe(x));}
    const mo=new MutationObserver(agendaJanelasComando);
    alvos.forEach(x=>mo.observe(x,{attributes:true,attributeFilter:['style','class']}));
  });
})();
/* Controle explícito da largura dos painéis encaixados. A faixa fina na
   borda direita é arrastável e a escolha vale para os próximos comandos. */
(function(){
  const CHAVE='alagis.commandPanelWidth';
  function aplicarLarguraSalva(){
    let w=0;try{w=+localStorage.getItem(CHAVE)||0}catch(e){}
    if(w>=330)document.body.style.setProperty('--alagis-command-width',Math.min(w,innerWidth-20)+'px');
  }
  function preparar(el){
    if(!el||el.dataset.resizeGrip==='1')return;
    el.dataset.resizeGrip='1';
    const g=document.createElement('span');g.className='command-resize-grip';
    g.title='Arraste para aumentar ou diminuir a largura desta janela';
    g.setAttribute('aria-label','Redimensionar largura do painel');
    let ativo=false;
    g.addEventListener('pointerdown',e=>{ativo=true;g.classList.add('dragging');g.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation()});
    g.addEventListener('pointermove',e=>{
      if(!ativo)return;
      const painelCamadas=document.getElementById('right'),rc=painelCamadas&&painelCamadas.getBoundingClientRect();
      const inicio=rc&&rc.width?rc.right+6:parseFloat(getComputedStyle(document.body).getPropertyValue('--alagis-command-left'))||306;
      const max=Math.max(330,innerWidth-inicio-8),w=Math.max(330,Math.min(max,e.clientX-inicio));
      document.body.style.setProperty('--alagis-command-width',Math.round(w)+'px');
      try{localStorage.setItem(CHAVE,String(Math.round(w)))}catch(err){}
      e.preventDefault();e.stopPropagation();
    });
    const fim=e=>{if(!ativo)return;ativo=false;g.classList.remove('dragging');try{g.releasePointerCapture(e.pointerId)}catch(err){}};
    g.addEventListener('pointerup',fim);g.addEventListener('pointercancel',fim);
    el.appendChild(g);
  }
  function prepararTodos(root=document){
    preparar(document.getElementById('ribbonPop'));
    root.querySelectorAll&&root.querySelectorAll('.modal,#selBox,#measBox,#edBox').forEach(preparar);
  }
  document.addEventListener('DOMContentLoaded',()=>{
    aplicarLarguraSalva();prepararTodos();
    new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{
      if(n.nodeType!==1)return;
      if(n.matches&&n.matches('.modal,#selBox,#measBox,#edBox'))preparar(n);
      prepararTodos(n);
    }))).observe(document.body,{childList:true,subtree:true});
  });
})();
/* A árvore de camadas tem rolagem horizontal acessível nas duas extremidades.
   A barra superior é uma réplica leve e permanece sincronizada com a barra
   nativa inferior mesmo quando camadas/grupos são recriados. */
(function(){
  function iniciarRolagemDuplaCamadas(){
    const lista=document.getElementById('layerList'),topo=document.getElementById('layerScrollTop');
    if(!lista||!topo||topo.dataset.sync==='1')return;
    const espaco=topo.firstElementChild;let travado=false,agendado=0;
    const medir=()=>{
      agendado=0;
      const largura=Math.max(lista.clientWidth,lista.scrollWidth);
      espaco.style.width=largura+'px';
      topo.style.display=lista.scrollWidth>lista.clientWidth+1?'block':'none';
      if(topo.scrollLeft!==lista.scrollLeft)topo.scrollLeft=lista.scrollLeft;
    };
    const agenda=()=>{if(!agendado)agendado=requestAnimationFrame(medir);};
    topo.addEventListener('scroll',()=>{if(travado)return;travado=true;lista.scrollLeft=topo.scrollLeft;travado=false},{passive:true});
    lista.addEventListener('scroll',()=>{if(travado)return;travado=true;topo.scrollLeft=lista.scrollLeft;travado=false},{passive:true});
    new MutationObserver(agenda).observe(lista,{childList:true,subtree:true,attributes:true});
    if(window.ResizeObserver)new ResizeObserver(agenda).observe(lista);
    window.addEventListener('resize',agenda,{passive:true});
    topo.dataset.sync='1';medir();
  }
  document.addEventListener('DOMContentLoaded',iniciarRolagemDuplaCamadas);
})();
/* SEM tela sobreposta: o overlay #loading não é mais exibido. O andamento
   aparece em tempo real na CAIXA DE COMANDOS — status na barra (com % e
   tempo restante) + linhas no log — e o mapa continua visível e utilizável. */
let _loadBase=null;
function showLoad(t){
  t=t||'Carregando…';
  window.GeoMineLoadProgress?.show(t);
  const b=document.getElementById('cmdBox');
  if(b && b.style.display==='none'){                       // reabre a caixa se estava fechada
    b.style.display='flex';
    if(typeof cmdAplicaModo==='function') cmdAplicaModo();
    if(typeof cmdPinta==='function') cmdPinta();
    const bf=document.getElementById('btnCmdFlut'); if(bf) bf.style.display='none';
  }
  const st=document.getElementById('cmdStatus');
  if(st&&!window.GeoMineLoadProgress?.projectActive?.()){ st.style.display='inline-flex';
    const tx=document.getElementById('cmdStatusTxt'); if(tx) tx.textContent=t; }
  // mesma etapa com % diferente só atualiza o status; etapa NOVA vira linha no log
  const base=t.replace(/\d+([.,]\d+)?\s*%?/g,'#');
  if(base!==_loadBase){ _loadBase=base;
    if(typeof cmdLog==='function') cmdLog('▶ '+t,'etapa'); }
}
function hideLoad(outcome){
  window.GeoMineLoadProgress?.end();
  const projectActive=window.GeoMineLoadProgress?.projectActive?.();
  const st=document.getElementById('cmdStatus'); if(st&&!projectActive) st.style.display='none';
  const px=document.getElementById('cmdStatusPct'); if(px&&!projectActive) px.textContent='';
  document.getElementById('loading').classList.remove('on');
  progEnd(); _loadBase=null;
  if(typeof cmdLog==='function') cmdLog(outcome==='error'?'■ importação encerrada com falha':outcome==='cancel'?'■ cancelado':'■ concluído',outcome==='error'?'erro':outcome==='cancel'?'avisa':'ok');
}
/* --------------------------------------------------------------------------
   PROGRESSO COM TEMPO RESTANTE
   O restante é estimado pelo ritmo já observado: tempo decorrido dividido pela
   fração concluída. Fica instável no começo, então só aparece depois de 3% e
   de meio segundo — antes disso um número desses só engana.
   -------------------------------------------------------------------------- */
let _prog=null;
function progStart(titulo){
  _prog={t0:Date.now(), f:0};
  const b=document.getElementById('loadProg');
  if(b) b.style.display='block';
  showLoad(titulo||'Processando…');
  progSet(0);
}
function fmtDur(s){
  if(!isFinite(s)||s<0) return '';
  s=Math.round(s);
  if(s<60) return s+' s';
  const m=Math.floor(s/60), r=s%60;
  if(m<60) return m+' min '+String(r).padStart(2,'0')+' s';
  return Math.floor(m/60)+' h '+String(m%60).padStart(2,'0')+' min';
}
function progSet(frac, detalhe){
  if(!_prog) return;
  const f=Math.max(0, Math.min(1, frac||0));
  _prog.f=Math.max(_prog.f, f);                 // nunca anda para trás
  window.GeoMineLoadProgress?.set(_prog.f);
  { const marco=Math.floor(_prog.f*4);          // registra a cada 25%
    if(marco>(_prog.marco??-1)){ _prog.marco=marco;
      if(typeof cmdLog==='function') cmdLog(`  ${(100*_prog.f).toFixed(0)}%`+(detalhe?' · '+detalhe:''),'info'); } }
  const bar=document.getElementById('loadBar');
  const pct=document.getElementById('loadPct');
  const rem=document.getElementById('loadRem');
  if(bar) bar.style.width=(_prog.f*100).toFixed(1)+'%';
  if(pct) pct.textContent=(_prog.f*100).toFixed(0)+'%'+(detalhe?' · '+detalhe:'');
  const dt=(Date.now()-_prog.t0)/1000;
  if(rem) rem.textContent=(_prog.f>0.03 && dt>0.5)
    ? 'restam ~'+fmtDur(dt*(1-_prog.f)/_prog.f)
    : 'estimando…';
  // status ao vivo na caixa de comandos (o overlay não é mais mostrado)
  const px=document.getElementById('cmdStatusPct');
  if(px&&!window.GeoMineLoadProgress?.projectActive?.()) px.textContent=(_prog.f*100).toFixed(0)+'%'+
    ((_prog.f>0.03 && dt>0.5)?' · ~'+fmtDur(dt*(1-_prog.f)/_prog.f):'');
}
function progEnd(){
  _prog=null;
  const b=document.getElementById('loadProg'); if(b) b.style.display='none';
  const bar=document.getElementById('loadBar'); if(bar) bar.style.width='0%';
}
const cedeUI = ()=>new Promise(r=>setTimeout(r,0));
/* Mantém a página RESPONSIVA em processamento longo: cede o fio de execução
   ao navegador a cada ~120 ms. Sem isso o Chrome conclui que a página travou
   e oferece "Aguardar / Sair da página" — e sair mata o processamento.
   Chamar respira() dentro dos laços pesados custa quase nada quando ainda
   não passou o intervalo (só compara o relógio).                            */
let _respT=0;
async function respira(){
  const now=performance.now();
  if(now-_respT>120){ _respT=now; await new Promise(r=>setTimeout(r,0)); }
}
/* Cancelamento: o controlador interrompe as leituras GeoTIFF pendentes;
   S._loadCancel mantém compatibilidade com os demais importadores. */
S._loadCancel=false;
function cancelLoad(){
  // The synchronous commit is already complete; its final paint is not a
  // cancellable read and must never be reported as a discarded opening.
  if(window.GeoMineProjectOpenProgress?.state?.().committed)return;
  if(!window.GeoMineProjectOpenProgress?.state?.().active&&window.GeoMineBufferTask?.cancel())return;
  window.GeoMineProjectOpenProgress?.cancel('cancelamento manual');
  S._loadCancel=true;
  if(S._rasterImportController)S._rasterImportController.abort();
  hideLoad('cancel'); toast('Carregamento cancelado');
}
document.getElementById('loadCancel').onclick=cancelLoad;
{ const bc=document.getElementById('cmdStatusCancel'); if(bc) bc.onclick=cancelLoad; }

/* ---------------------------------------------------------------------------
   COMPANHEIROS DO .SHP AUTOMÁTICOS
   O sandbox do navegador NÃO permite ler arquivos vizinhos do disco — ao
   selecionar só o .shp, o .dbf/.prj ao lado ficam inacessíveis. Solução:
   1. Desktop (Chrome/Edge): acesso à PASTA via File System Access API — o app
      busca os companheiros pelo nome-base, agora e nos próximos "Abrir".
   2. Android/Firefox: seletor de pasta (webkitdirectory) — tira um "retrato"
      da pasta (FileList) e resolve por nome a partir dele.
   Concedida uma vez, a pasta vale para a sessão inteira.
--------------------------------------------------------------------------- */
S.dirHandle=S.dirHandle||null;   // FileSystemDirectoryHandle (desktop)
S.dirFiles=S.dirFiles||null;     // Map nome-minúsculo -> File (snapshot Android)
async function askWorkFolder(){
  // desktop: API de acesso ao sistema de arquivos
  if(window.showDirectoryPicker && fsApiOK()){
    try{
      const dOpt={mode:'read'};
      if(S._lastDir) dOpt.startIn=S._lastDir;
      try{ S.dirHandle=await showDirectoryPicker(dOpt); }
      catch(e2){ if(e2 && e2.name==='AbortError') throw e2;
        delete dOpt.startIn; S.dirHandle=await showDirectoryPicker(dOpt); }
      lembraLocal(S.dirHandle);
      toast('Pasta de trabalho concedida — companheiros do .shp serão buscados automaticamente');
      return true;
    }catch(e){ return false; }   // usuário cancelou
  }
  // Android/Firefox: input webkitdirectory — com DUPLA rede de segurança contra
  // o cancelamento (o evento 'cancel' não existe em navegadores antigos):
  // 1. evento 'cancel' (Chrome 113+); 2. volta do foco à janela sem 'change'
  //    em 1,2 s => tratamos como cancelado. A promise SEMPRE resolve.
  return await new Promise(res=>{
    const inp=document.createElement('input');
    inp.type='file'; inp.webkitdirectory=true; inp.style.display='none';
    document.body.appendChild(inp);
    let done=false;
    const finish=(ok)=>{ if(done) return; done=true;
      window.removeEventListener('focus',onFocus); inp.remove(); res(ok); };
    inp.onchange=()=>{
      S.dirFiles=new Map([...inp.files].map(f=>[f.name.toLowerCase(),f]));
      toast(`Pasta lida: ${inp.files.length} arquivo(s) — companheiros do .shp resolvidos por aqui`);
      finish(true);
    };
    inp.addEventListener('cancel',()=>finish(false));
    const onFocus=()=>{ setTimeout(()=>finish(false),1200); };   // change chega antes, se houver
    window.addEventListener('focus',onFocus,{once:true});
    inp.click();
  });
}
async function findCompanion(base, ext){
  const nm=(base+'.'+ext).toLowerCase();
  if(S.dirHandle){
    // procura case-insensitive na pasta concedida
    try{
      for await (const [name,h] of S.dirHandle.entries()){
        if(name.toLowerCase()===nm && h.kind==='file') return await h.getFile();
      }
    }catch(e){}
  }
  if(S.dirFiles && S.dirFiles.has(nm)) return S.dirFiles.get(nm);
  return null;
}
/* Modal de companheiros faltando: 3 caminhos, sem beco. Constrói o DOM na hora
   (não depende de HTML) e SEMPRE resolve a promise.                          */
function askMissingModal(bases, temPasta){
  return new Promise(res=>{
    /* rede de segurança: se um fantasma de uma leitura anterior tiver ficado
       na tela, ele sai agora — assim o problema nunca se acumula */
    document.querySelectorAll('[data-modal-arquivo]').forEach(x=>x.remove());
    const bg=document.createElement('div');
    bg.className='modal-bg on';
    bg.dataset.modalArquivo='1';
    bg.style.cssText='position:fixed;inset:0;background:#0d1117d9;z-index:4000;display:flex;align-items:center;justify-content:center;padding:18px';
    /* Mesmo contrato da interface alagis3 usado pelos outros diálogos: o
       backdrop não recebe eventos, e o filho `.modal` recebe mouse/toque. */
    bg.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="Arquivos auxiliares do shapefile" style="background:var(--panel,#151b26);border:1px solid var(--line,#2a3446);border-radius:14px;max-width:420px;width:100%;padding:16px 16px 12px;font-size:13.5px;color:var(--ink,#dde3ee);overflow:auto;touch-action:manipulation">
      <div style="font-weight:700;font-size:14.5px;margin-bottom:6px">Faltam os atributos (.dbf)</div>
      <div style="color:var(--ink-dim,#93a0b4);margin-bottom:10px">O seletor do Android costuma entregar só o arquivo tocado.
        Faltando para: <b>${bases.map(b=>String(b).replace(/</g,'&lt;')).join(', ')}</b></div>
      <button data-a="files" style="width:100%;margin:4px 0;padding:11px;border-radius:10px;border:1px solid var(--line,#2a3446);background:var(--amber,#f5a524);color:#1a1206;font-weight:700;cursor:pointer">📎 Escolher os arquivos que faltam (.dbf/.prj)</button>
      <button data-a="folder" style="width:100%;margin:4px 0;padding:11px;border-radius:10px;border:1px solid var(--line,#2a3446);background:none;color:var(--ink,#dde3ee);cursor:pointer">📁 Ler a pasta inteira ${temPasta?'(já concedida)':'(se o aparelho suportar)'}</button>
      <button data-a="skip" style="width:100%;margin:4px 0;padding:10px;border-radius:10px;border:1px solid var(--line,#2a3446);background:none;color:var(--ink-dim,#93a0b4);cursor:pointer">Continuar sem atributos</button>
      <div style="color:var(--ink-dim,#93a0b4);font-size:11.5px;margin-top:6px">Dica definitiva: exporte do QGIS como <b>.zip</b> do shapefile — 1 arquivo, nunca falta nada.</div>
    </div>`;
    bg.querySelectorAll('button').forEach(b=>b.onclick=()=>{
      bg.style.display='none';
      void bg.offsetHeight;            /* força o layout antes de sair */
      bg.remove();
      /* Mesmo cuidado do modal do DXF: o remove() sai do DOM na hora, mas se a
         leitura do shapefile tomar a thread principal em seguida o navegador
         não chega a repintar e o modal continua VISÍVEL na tela — o usuário
         clica, nada muda, e parece que o botão não funcionou. Dois quadros: o
         primeiro agenda, o segundo garante que o quadro já sem o modal foi
         apresentado antes de a importação começar. */
      /* CORREÇÃO (ele relatou o modal FANTASMA: a caixa continua na tela mas
         o clique passa direto para o mapa atrás). Os dois quadros não bastam:
         o segundo rAF resolve a promessa e a continuação pesada roda numa
         microtarefa AINDA no mesmo quadro, então o quadro já sem o modal
         muitas vezes não chega a ser apresentado — o compositor segue
         mostrando o anterior por todo o tempo da leitura (14 s no caso dele).
         Agora: escondo por estilo ANTES de remover (mesmo uma camada velha
         some), forço o cálculo de layout e só devolvo depois de um
         setTimeout, que cede o laço de eventos DEPOIS do quadro. */
      requestAnimationFrame(()=>requestAnimationFrame(()=>
        setTimeout(()=>res(b.dataset.a),0)));
    });
    document.body.appendChild(bg);
  });
}
/* seletor filtrado e à prova de cancelamento (mesma rede tripla do askWorkFolder) */
function pickFiles(accept){
  return new Promise(res=>{
    const inp=document.createElement('input');
    inp.type='file'; inp.multiple=true; inp.accept=accept; inp.style.display='none';
    document.body.appendChild(inp);
    let done=false;
    const finish=fl=>{ if(done)return; done=true;
      window.removeEventListener('focus',onFocus); inp.remove(); res(fl); };
    inp.onchange=()=>finish([...inp.files]);
    inp.addEventListener('cancel',()=>finish(null));
    const onFocus=()=>setTimeout(()=>finish(null),1200);
    window.addEventListener('focus',onFocus,{once:true});
    inp.click();
  });
}
async function resolveCompanions(groups){
  const key=n=>n.toLowerCase().replace(/\.[^.]+$/,'').replace(/\s*\(\d+\)$/,'');
  const missing=()=>Object.entries(groups).filter(([b,g])=>g.shp&&!g.dbf);
  // 1ª tentativa silenciosa: pasta já concedida nesta sessão
  const tenta=async()=>{ if(!S.dirHandle && !S.dirFiles) return;
    for(const [base,g] of Object.entries(groups)){
      if(!g.shp) continue;
      for(const ext of ['dbf','shx','prj','cpg'])
        if(!g[ext]){ const f=await findCompanion(base,ext); if(f) g[ext]=f; }
    }
  };
  await tenta();
  let rodada=0;
  while(missing().length && rodada++<3){
    hideLoad();
    const escolha=await askMissingModal(missing().map(([b])=>groups[b]._nome||b), !!(S.dirHandle||S.dirFiles));
    if(escolha==='skip') break;
    if(escolha==='folder'){
      const ok=await askWorkFolder();
      if(!ok) toast('Pasta não lida — tente "Escolher os arquivos"');
      await tenta();
    } else {
      const fl=await pickFiles('.dbf,.prj,.cpg,.shx');
      if(fl && fl.length){
        // mescla na MESMA leva: a camada nasce completa
        for(const f of fl){
          const ext=(f.name.split('.').pop()||'').toLowerCase();
          if(!['dbf','prj','cpg','shx'].includes(ext)) continue;
          const k=key(f.name);
          if(groups[k] && !groups[k][ext]) groups[k][ext]=f;
          else if(!groups[k]){
            // nome não bate com nenhuma base: se só há UM shp faltando, assume-o
            const m=missing();
            if(m.length===1 && !m[0][1][ext]) m[0][1][ext]=f;
          }
        }
      } else toast('Nenhum arquivo escolhido');
    }
    // sem progresso? o laço ainda dá mais uma chance, até 3 rodadas
  }
  showLoad('Retomando…');
}
/* Extensões que acompanham um shapefile sem trazer dado que o CCMGIS use:
   índices espaciais do ArcGIS, metadados, cores, travas. Arrastar a pasta
   inteira traz um punhado delas, e um aviso por arquivo viraria uma cortina
   de avisos sobre o que não é problema nenhum. São ignoradas em silêncio. */
const EXT_AUXILIAR=new Set(['sbn','sbx','atx','qix','fbn','fbx','ain','aih','ixs','mxs',
  'cor','avl','lyr','xml','qpj','qmd','lock','ini','ds_store','md5','txt~','bak','aux']);
function legacyOrthoPreviewForImport(previous,file,image,target){
  // An old project may contain only a JPEG preview. Bind that identity to the
  // explicitly imported original only when its name, full extent and CRS agree.
  // Existing byte descriptors remain authoritative; geometry never overrides them.
  if(!previous?.url||previous.originalSource||previous.projectNativeSource||typeof projectNativePreview!=='function')return null;
  try{
    const filename=value=>String(value||'').split(/[\\/]/).pop().normalize('NFC').toLowerCase(),
      sourceName=filename(previous.src?.file||previous.srcName||previous.name),name=filename(file?.name);
    if(!/\.tiff?$/.test(sourceName)||sourceName!==name)return null;
    const epsg=value=>{const m=/^(?:EPSG:)?(\d+)$/i.exec(String(value??''));const n=m?Number(m[1]):0;return n>0&&n<32767?n:null;},
      keys=image.getGeoKeys?.()||{},nativeCRS=epsg(keys.ProjectedCSTypeGeoKey||keys.GeographicTypeGeoKey),
      sourceCRS=epsg(previous._crsFixo||previous._sourceCRS||S.workCRS),
      targetCRS=epsg(target?(target._crsFixo||target._sourceCRS||S.workCRS):S.workCRS),
      b=previous.b,bb=image.getBoundingBox(),W=image.getWidth(),H=image.getHeight();
    if(!nativeCRS||sourceCRS!==nativeCRS||targetCRS!==nativeCRS||image.getSamplesPerPixel()<3||
      !Number.isSafeInteger(W)||!Number.isSafeInteger(H)||W<=0||H<=0||
      !Array.isArray(bb)||bb.length!==4||!bb.every(Number.isFinite)||bb[2]<=bb[0]||bb[3]<=bb[1])return null;
    const pixelX=(bb[2]-bb[0])/W,pixelY=(bb[3]-bb[1])/H,
      matches=bounds=>Array.isArray(bounds)&&bounds.length===4&&bounds[2]>bounds[0]&&bounds[3]>bounds[1]&&
        bounds.every((v,i)=>Number.isFinite(v)&&Math.abs(v-bb[i])<=(i%2?pixelY:pixelX));
    if(!matches(b)||target&&!matches(target.b))return null;
    const preview=projectNativePreview(previous,'ortho');
    return preview?{preview,identity:JSON.stringify([preview,sourceName,b,sourceCRS])}:null;
  }catch(_){return null;}
}
async function handleFiles(fileList){
  const files=[...fileList];
  if(!files.length){ toast('Nenhum arquivo selecionado'); return; }
  window.GeoMineProjectOpenProgress?.cancel('nova importação');
  let projectOpenSequence=window.GeoMineProjectOpenProgress?.sequence();
  if(S._rasterImportController)S._rasterImportController.abort();
  const controller=new AbortController(),control={signal:controller.signal};
  S._rasterImportController=controller;
  S._loadCancel=false;
  const ignorados=[], falhas=[];
  let projectLoaded=false;const importedRasters=[];
  /* Uma leva com vários DXFs pergunta a classificação uma única vez por
     padrão. Sem isso, o próximo arquivo recriava uma caixa idêntica no mesmo
     lugar e parecia que o primeiro clique não havia fechado a janela. */
  const dxfLote={escolha:null,processados:0,
    total:files.filter(f=>/\.dxf$/i.test(String(f&&f.name||''))).length};
  showLoad(`Lendo ${files.length} arquivo(s)…`);
  try{
    const groups={};
    for(const f of files){
      if(control.signal.aborted)break;
      const name=f.name||'arquivo';
      // origem: o navegador não expõe o caminho absoluto (sandbox) — guarda nome, pasta relativa e tamanho
      S._srcNow={file:name, path:(f.webkitRelativePath||''), size:f.size||0, at:new Date().toISOString()};
      let ext=name.includes('.')?name.split('.').pop().toLowerCase():'';
      // Drive/Android às vezes entrega sem extensão: sniff pelos bytes
      if(!ext || !['shp','dbf','shx','prj','cpg','zip','geojson','json','kml','kmz','gpx','dxf','dwg','csv','txt','tif','tiff','asc','qgs','qgz','ccmgis','png','jpg','jpeg','webp'].includes(ext)){
        ext = await sniffExt(f) || ext;
      }
      const base=name.replace(/\.[^.]+$/,'');
      try{
        // Project readers already validate access with bounded provider reads.
        // A preliminary range would duplicate Drive I/O and has no byte progress.
        if(!['geojson','json','ccmgis'].includes(ext))await checaArquivoLegivel(f,control);
        if(ext==='tif'||ext==='tiff'){
          const ownerProject=S.projectId,ownerGeneration=window.GeoMineSessionAutosave?.state?.generation,
            ownerCurrent=()=>S._rasterImportController===controller&&!control.signal.aborted&&S.projectId===ownerProject&&
              window.GeoMineSessionAutosave?.state?.generation===ownerGeneration;
          showLoad('Lendo GeoTIFF…');
          await window.GeoMineImportRecovery?.before(control);
          showLoad('Acessando o TIFF original…');
          await ensureGeoTIFF();
          // Inspect just the TIFF header before considering an Android copy.
          // RGB imports can draw progressively from ranges of the original.
          const localSource=await window.GeoMineOriginalSources?.stageFile?.(f,control)||f;
          const header=await rasterImportOpen(localSource,control);
          const headerImage=await rasterImportWait(header.getImage(0),control);
          const rgb=headerImage.getSamplesPerPixel()>=3,previousImage=S.img,
            previousPreview=rgb?legacyOrthoPreviewForImport(previousImage,f,headerImage):null;
          let _t=header,target,relinked=false;
          try{
          if(previousPreview){
            // The saved preview is already on screen. Reattach the matching
            // original by headers, without decoding every TIFF strip again.
            const current=()=>ownerCurrent()&&S.img===previousImage&&
              legacyOrthoPreviewForImport(previousImage,f,headerImage)?.identity===previousPreview.identity;
            if(!current()){controller.abort();break;}
            relinked=await ortoReligarTIFF(localSource,{restoreNative:true,isCurrent:current})===true;
            if(!ownerCurrent()){controller.abort();break;}
            if(!relinked||!current())throw Error('Não foi possível religar o TIFF original à ortofoto aberta. A importação não foi concluída.');
            target=previousImage;
          }else{
            const src=await bufferFonte(localSource,{...control,preferDirect:rgb&&f.size>=64*1024*1024});
            _t=src===localSource?header:await rasterImportOpen(src,control);
            control.tiff=_t;
            const imported=rgb?await addRGBFromTIFF(src,f.name,f.size,control):await addRasterFromTIFF(src,f.name,f.size,{...control,deferNative:true});
            target=rgb?(imported||S.img):imported;
          }
          if(target&&ownerCurrent()&&(rgb?S.img===target&&(target!==previousImage||relinked):(S.rasters||[]).includes(target))){
            importedRasters.push(target);
            window.GeoMineImportHandoff?.presentRaster?.(target,rgb?'I':'R');
            showLoad('Vinculando o original de '+target.name+'…');
            if(previousPreview&&legacyOrthoPreviewForImport(previousImage,f,headerImage,target)?.identity===previousPreview.identity)
              window.GeoMineOriginalSources?.validated?.(target,'ortho',previousPreview.preview);
            try{await window.GeoMineOriginalSources?.rememberFile(target,rgb?'ortho':'raster',f);}
            catch(error){try{cmdLog('Arquivo importado; vínculo automático do original indisponível: '+(error?.message||error),'avisa');}catch(_){}}
          }else if(ownerCurrent())throw Error('O GeoTIFF não gerou uma camada. A importação não foi concluída.');
          }finally{
            if(globalThis.GeoMineRasterImport){GeoMineRasterImport.release(header);if(_t!==header)GeoMineRasterImport.release(_t);}
            delete control.tiff;
          }
        }
        else if(['shp','dbf','shx','prj','cpg'].includes(ext)){
          // chave normalizada: minúsculas e sem sufixo de cópia " (1)" que o
          // Android/Drive acrescenta — 'Areas (1).dbf' casa com 'Areas.shp'
          const key=base.toLowerCase().replace(/\s*\(\d+\)$/,'');
          (groups[key]=groups[key]||{_nome:base})[ext]=f;
        }
        else if(ext==='qmd'||ext==='qix'||ext==='sbn'||ext==='sbx'){ /* metadados/índices — ignorar em silêncio */ }
        else if(ext==='zip'){ showLoad(`Descompactando ${name}…`); await importZip(f); }
        else if(ext==='qgz'){
          showLoad(`Lendo ${name}…`);
          const inner=await JSZip.loadAsync(await f.arrayBuffer());
          const ip=Object.keys(inner.files).find(p=>/\.qgs$/i.test(p));
          if(ip) qgsRelato(applyQGSProject(await inner.files[ip].async('string')));
        }
        else if(ext==='qgs'){
          qgsRelato(applyQGSProject(await f.text()));
        }
        else if(ext==='geojson'||ext==='json'||ext==='ccmgis'){
          if(projectOpenSequence!==window.GeoMineProjectOpenProgress?.sequence())throw Object.assign(new Error('Abertura substituída por outra operação.'),{name:'AbortError'});
          const opening=window.GeoMineProjectOpenProgress?.begin({signal:control.signal});
          projectOpenSequence=window.GeoMineProjectOpenProgress?.sequence();
          try{
          const texto=opening?await opening.read(f):await readProjectFileCompat(f);
          let obj=null;
          try{ obj=opening?await opening.parse(texto):JSON.parse(texto); }
          catch(pe){
            if(pe.name==='AbortError')throw pe;
            if(/"app"\s*:\s*"(ALAGIS|CCMGIS|CCMGeoCampo)"/.test(texto.slice(0,300)))
              throw new Error('Projeto CCMGIS ilegível ('+(pe.message||pe)+') — o arquivo pode ter '+
                'sido truncado ao salvar/compartilhar. Use ↺ Recuperar para restaurar o último autosave.');
            throw pe;
          }
          if(obj && (obj.app==='ALAGIS'||obj.app==='CCMGIS'||obj.app==='CCMGeoCampo')){
            if(S.auto?.dirty&&!confirm('Há alterações não salvas. Abrir outro projeto e descartar essas alterações?')){controller.abort();break;}
            const source=projectDroppedHandles.get(f);
            const handle=source?await (opening?opening.wait(source):source):null;
            if(opening)await opening.commit(obj,()=>startAutosave(f.name,handle));
            else{loadProject(obj);startAutosave(f.name,handle);}
            if(!handle)window.GeoMineProjectFile?.sourceOpened(f.name);
            projectLoaded=true;
          }else{opening?.check();importGeoJSON(obj,base);}
          }finally{opening?.finish();}
        }
        else if(['png','jpg','jpeg','webp'].includes(ext)){
          // planta/imagem de fundo: abre o painel de georreferenciamento pelos cantos
          await new Promise(res=>{
            const rd=new FileReader();
            rd.onload=()=>{ S.imgPending=rd.result; S.imgName=base;
              try{ syncSideSecs(); }catch(e){}
              const si=document.getElementById('secImg');
              if(si) try{ si.scrollIntoView({block:'nearest'}); }catch(e){}
              toast('Imagem carregada — informe os cantos e toque em “Posicionar imagem”'); res(); };
            rd.onerror=()=>{ toast('Falha ao ler a imagem'); res(); };
            rd.readAsDataURL(f);
          });
        }
        else if(ext==='kml'){ importKML(await f.text(), base); }
        else if(ext==='kmz'){ await importKMZ(await f.arrayBuffer(), base); }
        else if(ext==='gpx'){ importGPX(await f.text(), base); }
        else if(ext==='csv'||ext==='txt'){ importCSVPoints(await f.text(), base); }
        else if(ext==='dxf'){
          const head=new Uint8Array(await f.slice(0,32).arrayBuffer());
          if(sniffCadBinary(head)==='dxfbin'){
            toast('⚠ DXF BINÁRIO não é suportado — no CAD, salve como "DXF ASCII" (R12/2000) e reabra');
          } else await importDXF(await f.text(), base, dxfLote);
        }
        else if(ext==='dwg'){
          toast('⚠ DWG é formato proprietário da Autodesk e não pode ser lido no navegador. '+
            'Converta para DXF (no AutoCAD: SAVEAS → DXF; ou pelo conversor gratuito ODA File Converter) e abra o .dxf.');
        }
        else if(EXT_AUXILIAR.has(ext) || /\.shp\.xml$/i.test(name)){ /* auxiliar: silêncio */ }
        else { ignorados.push(name); }
      }catch(err){
        if(control.tiff&&typeof control.tiff.close==='function'){
          try{await control.tiff.close();}catch(_){}
        }
        delete control.tiff;
        if(control.signal.aborted||err&&err.name==='AbortError'){controller.abort();break;}
        const detail=rasterImportError(err);
        console.error(detail); falhas.push(name+' — '+detail.message);
      }
    }
    if(control.signal.aborted)return;
    /* Resumo ÚNICO no fim: o usuário fica sabendo o que ficou de fora sem ser
       interrompido arquivo por arquivo. O detalhe vai para a linha de comandos,
       que é onde se procura quando algo realmente faltou. */
    if(ignorados.length||falhas.length){
      const partes=[];
      if(ignorados.length) partes.push(`${ignorados.length} arquivo(s) de formato não reconhecido`);
      if(falhas.length)    partes.push(`${falhas.length} com erro de leitura`);
      if(falhas.length===1)toast('Falha na importação: '+falhas[0]);
      else toast('Ignorados: '+partes.join(' · '));
      try{
        if(ignorados.length) cmdLog('Importação ignorou (formato): '+ignorados.join(', '),'avisa');
        if(falhas.length)    cmdLog('Importação falhou em: '+falhas.join(' | '),'erro');
      }catch(e){}
    }
    if(Object.keys(groups).length)await resolveCompanions(groups);
    if(control.signal.aborted)return;
    S._pedirDbf=[];
    for(const [key,g] of Object.entries(groups)){
      if(S._loadCancel) break;                    // usuário cancelou: para os pendentes
      const base=g._nome||key;
      if(g.shp){
        try{
          showLoad(`Processando ${base}…`);
          const shpBuf=await g.shp.arrayBuffer();
          const dbfBuf=g.dbf?await g.dbf.arrayBuffer():null;
          const prj=g.prj?await g.prj.text():null;
          const cpg=g.cpg?await g.cpg.text():null;
          await buildLayerFromSHP(base, shpBuf, dbfBuf, prj, cpg);
          const veio=['shp','dbf','shx','prj','cpg'].filter(e=>g[e]).map(e=>'.'+e).join(' + ');
          const falta=[!g.dbf&&'.dbf (atributos)', !g.prj&&'.prj (CRS — assumido o de trabalho)'].filter(Boolean);
          if(falta.length){
            toast(`"${base}": recebi ${veio} — FALTOU ${falta.join(' e ')}.`);
            if(!g.dbf) S._pedirDbf=(S._pedirDbf||[]).concat(base);   // resgate após a leva
          }
        }catch(err){ console.error(err); toast(`Erro no shapefile ${base}: ${err.message}`); }
      } else {
        // .dbf/.prj chegando sozinhos: se já existe camada com o mesmo nome,
        // ANEXA retroativamente (ordem de abertura deixa de importar)
        const norm=s=>s.toLowerCase().replace(/\s*\(\d+\)$/,'');
        const L=S.layers.find(l=>norm(l.name)===norm(base));
        if(L && (g.dbf||g.prj)){
          if(g.dbf){
            const cpg=g.cpg?await g.cpg.text():null;
            await attachDBFToLayer(L, await g.dbf.arrayBuffer(), cpg);
          }
          if(g.prj){
            const crs=guessCRSfromPRJ(await g.prj.text());
            if(crs && crs!==L.crs){ L.crs=crs; toast(`"${base}": CRS reatribuído para ${CRS_LABELS[crs]||crs}`); }
          }
          drawLayer(L); refreshUI();
        } else {
          toast(`"${base}" veio sem .shp — selecione .shp e .dbf juntos, ou envie um .zip`);
        }
      }
    }
    refreshUI();
    // Finish the durable checkpoint while newly imported MDT tiles are held.
    // A discarded mobile tab must reopen the new layer, not the pre-import state.
    if(importedRasters.length&&S._rasterImportController===controller&&!control.signal.aborted){
      window.GeoMineWorkspaceResume?.request();
      await window.GeoMineWorkspaceResume?.flush({importController:controller});
    }
    // loadProject already restores its viewport (or fits a legacy file).
    // Import/drop must not replace that view with another automatic fit.
    if(!projectLoaded&&!importedRasters.length)fitAll();
    if(!projectLoaded && window.matchMedia('(max-width:720px)').matches && S.layers.length)
      document.getElementById('right').classList.add('open');
  }catch(err){
    if(!control.signal.aborted){const detail=rasterImportError(err);falhas.push(detail.message);console.error(detail);toast('Falha ao abrir: '+detail.message);}
  }
  finally{
    if(S._rasterImportController===controller){
      for(const r of importedRasters){if(!(S.rasters||[]).includes(r)||!r._nativeCopyPending)continue;
        delete r._nativeCopyPending;
        try{syncDemTiles(r);projectAutoSaveRaster(r);}catch(e){console.warn('Ativação dos tiles do MDT:',e);}
      }
      if(importedRasters.length)try{refreshUI();}catch(_){}
      S._rasterImportController=null;
      hideLoad(control.signal.aborted?'cancel':falhas.length||ignorados.length===files.length?'error':undefined);
    }
  }
  return {ok:!control.signal.aborted&&!falhas.length&&(!ignorados.length||ignorados.length<files.length),canceled:control.signal.aborted,failures:falhas,ignored:ignorados,rastersAdded:importedRasters.length};
}
/* detecta tipo pelos primeiros bytes/caracteres */
/* O seletor do Android devolve uma URI do provedor (Drive, OneDrive…), não um
   arquivo local. Se o arquivo não estiver realmente BAIXADO no aparelho, a leitura
   pode falhar no meio. A abertura inicial é testada com prazo e cancelamento;
   o leitor raster também valida cada trecho solicitado durante a importação. */
async function checaArquivoLegivel(f,control){
  const MB=1024*1024;
  if(!f || f.size===0)
    throw new Error('arquivo vazio (0 byte). Se veio do Google Drive, ele não está baixado no aparelho — '+
                    'abra o Drive, toque em ⋮ no arquivo e marque "Disponível offline"; espere concluir e tente de novo.');
  try{
    // Validar somente a abertura do stream. Não testar o fim por slice():
    // certos provedores Android não suportam range parcial, mas entregam o
    // arquivo completo normalmente por text()/arrayBuffer().
    const head=f.slice(0,Math.min(4096,f.size));
    if(globalThis.GeoMineRasterSource)await GeoMineRasterSource.read(head,control);
    else await head.arrayBuffer();
  }catch(e){
    throw rasterImportError(e);
  }
  // aviso de memória em aparelho móvel
  const movel=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const dm=navigator.deviceMemory||0;                                // GB, quando exposto
  if(movel && f.size>250*MB)
    toast(`⚠ ${(f.size/MB).toFixed(0)} MB em aparelho móvel — se a aba recarregar sozinha, é falta de memória. `+
          `Nesse caso use o desktop ou um recorte menor da ortofoto.`);
  else if(dm && dm<=4 && f.size>400*MB)
    toast(`⚠ Arquivo grande (${(f.size/MB).toFixed(0)} MB) para ${dm} GB de memória.`);
}

async function sniffExt(f){
  try{
    const head=new Uint8Array(await f.slice(0,256).arrayBuffer());
    if(head[0]===0x50 && head[1]===0x4b) return 'zip';                 // PK.. (zip)
    if((head[0]===0x49&&head[1]===0x49&&head[3]===0&&[42,43].includes(head[2]))||
       (head[0]===0x4d&&head[1]===0x4d&&head[2]===0&&[42,43].includes(head[3]))) return 'tif';
    // SHP: big-endian file code 9994 nos primeiros 4 bytes
    const be=(head[0]<<24)|(head[1]<<16)|(head[2]<<8)|head[3];
    if(be===9994) return 'shp';
    if(head[0]===0x03||head[0]===0x30) {/* possível DBF */ }
    const txt=new TextDecoder().decode(head).trim();
    // projeto CCMGIS renomeado (.bin do Drive/compartilhamento): identifica pelo conteúdo
    if(txt.startsWith('{') && /"app"\s*:\s*"(ALAGIS|CCMGIS|CCMGeoCampo)"/.test(txt)) return 'ccmgis';
    if(txt.startsWith('{')||txt.startsWith('[')) return 'geojson';
    if(/<gpx/i.test(txt)) return 'gpx';
    if(/^AutoCAD Binary DXF/.test(txt)) return 'dxf';
    if(/^AC10\d\d/.test(txt)) return 'dwg';
    if(/^\s*0\s*\r?\n\s*SECTION/.test(txt)) return 'dxf';
    if(/^<\?xml|<kml/i.test(txt)) return 'kml';
  }catch(e){}
  return '';
}

/* ============================================================================
   IMPORTAR PROJETO DO QGIS (.qgs / .qgz)
   Reconstrói a ÁRVORE DE GRUPOS do QGIS, renomeia as camadas com o nome de
   exibição do projeto, aplica a cor do símbolo simples e ordena como no QGIS.
   Como o navegador não acessa caminhos do disco, o .qgs deve vir num ZIP
   JUNTO com os dados (shp/dbf/prj...) — o casamento é pelo nome do arquivo
   da fonte de dados. Grupos aninhados são achatados como "Pai / Filho".
   ========================================================================== */
function applyQGSProject(xmlText){
  const doc=new DOMParser().parseFromString(xmlText,'text/xml');
  if(doc.querySelector('parsererror')){ toast('⚠ .qgs inválido (XML)'); return 0; }

  // 1) fontes de dados e cor por id de camada
  const info={};   // id -> {name, file, color}
  doc.querySelectorAll('projectlayers > maplayer').forEach(ml=>{
    const id=(ml.querySelector(':scope > id')||{}).textContent||'';
    const nm=(ml.querySelector(':scope > layername')||{}).textContent||'';
    let ds=(ml.querySelector(':scope > datasource')||{}).textContent||'';
    ds=ds.split('|')[0];                                   // remove |layername=... etc.
    const file=(ds.split(/[\\/]/).pop()||'').replace(/\.[^.]+$/,'').toLowerCase();
    /* Cor do QGIS vem como "R,G,B,A" em <Option value=> (3.x) ou <prop v=>
       (formato antigo). Uma função só, usada em símbolo simples e em classes. */
    const corDe=(sym,chave)=>{
      if(!sym) return null;
      const o=sym.querySelector(`Option[name="${chave}"]`)||sym.querySelector(`prop[k="${chave}"]`);
      if(!o) return null;
      const v=String(o.getAttribute('value')||o.getAttribute('v')||'').split(',');
      if(v.length<3) return null;
      const q=n=>Math.max(0,Math.min(255,Math.round(+n||0))).toString(16).padStart(2,'0');
      return '#'+q(v[0])+q(v[1])+q(v[2]);
    };
    const numDe=(sym,chave)=>{
      if(!sym) return null;
      const o=sym.querySelector(`Option[name="${chave}"]`)||sym.querySelector(`prop[k="${chave}"]`);
      if(!o) return null;
      const n=parseFloat(String(o.getAttribute('value')||o.getAttribute('v')||'').replace(',','.'));
      return Number.isFinite(n)?n:null;
    };
    const rend=ml.querySelector('renderer-v2');
    const tipoRend=rend? (rend.getAttribute('type')||'') : '';
    const sym0=ml.querySelector('renderer-v2 symbol');
    const color=corDe(sym0,'color')||corDe(sym0,'line_color');
    const stroke=corDe(sym0,'outline_color')||corDe(sym0,'line_color');
    /* Larguras do QGIS vêm em MILÍMETROS; o CCMGIS trabalha em px de tela.
       ~3,8 px por mm é a equivalência que o próprio QGIS usa a 96 dpi. */
    const wmm=numDe(sym0,'outline_width');
    const weight=(wmm!=null)? Math.max(0.5, +(wmm*3.78).toFixed(1)) : null;
    const alfa=numDe(sym0,'outline_width')!=null?null:null;
    /* Opacidade da CAMADA (0..1); em projetos antigos vinha como <transparency> 0..255 */
    let opac=null;
    const elOp=ml.querySelector(':scope > opacity');
    if(elOp){ const n=parseFloat(elOp.textContent); if(Number.isFinite(n)) opac=n; }
    if(opac==null){ const tr=ml.querySelector(':scope > transparency');
      if(tr){ const n=parseFloat(tr.textContent); if(Number.isFinite(n)) opac=1-n/255; } }
    /* Tracejado: o QGIS grava o padrão em mm separado por ponto e vírgula */
    let dash=null;
    { const o=sym0&&(sym0.querySelector('Option[name="customdash"]')||sym0.querySelector('prop[k="customdash"]'));
      const usa=sym0&&(sym0.querySelector('Option[name="use_custom_dash"]')||sym0.querySelector('prop[k="use_custom_dash"]'));
      const ligado=usa? /1|true/i.test(usa.getAttribute('value')||usa.getAttribute('v')||'') : false;
      if(o&&ligado){ const v=String(o.getAttribute('value')||o.getAttribute('v')||'');
        const nums=v.split(';').map(x=>parseFloat(x)).filter(Number.isFinite);
        if(nums.length>=2) dash=nums.map(x=>+(x*1.5).toFixed(1)).join(' '); }
      const ls=sym0&&(sym0.querySelector('Option[name="line_style"]')||sym0.querySelector('prop[k="line_style"]'));
      if(!dash&&ls){ const v=(ls.getAttribute('value')||ls.getAttribute('v')||'').toLowerCase();
        if(v==='dash') dash='6 4'; else if(v==='dot') dash='1.5 4';
        else if(v==='dashdot') dash='10 4 2 4'; else if(v==='dashdotdot') dash='14 4 2 4 2 4'; }
    }
    /* CLASSES: categorizado e graduado viram a simbologia por classes do CCMGIS */
    let classes=null;
    if(tipoRend==='categorizedSymbol'||tipoRend==='graduatedSymbol'){
      const campo=(rend.querySelector(':scope > attr')||{}).textContent
                 ||rend.getAttribute('attr')||'';
      const simbolos={};
      rend.querySelectorAll('symbols > symbol').forEach(s=>{
        simbolos[s.getAttribute('name')]=corDe(s,'color')||corDe(s,'line_color');
      });
      if(tipoRend==='categorizedSymbol'){
        const cats=[...rend.querySelectorAll('categories > category')].map(c=>({
          value:String(c.getAttribute('value')??''),
          color:simbolos[c.getAttribute('symbol')]||'#888888',
          render:c.getAttribute('render')!=='false'
        })).filter(c=>c.render);
        if(campo&&cats.length) classes={modo:'cat',campo,cats};
      }else{
        const rg=[...rend.querySelectorAll('ranges > range')].map(r=>({
          min:parseFloat(r.getAttribute('lower')), max:parseFloat(r.getAttribute('upper')),
          color:simbolos[r.getAttribute('symbol')]||'#888888'
        })).filter(r=>Number.isFinite(r.min)&&Number.isFinite(r.max));
        if(campo&&rg.length) classes={modo:'grad',campo,faixas:rg};
      }
    }
    /* RÓTULOS: campo, corpo, cor e halo do "simple" labeling */
    let rotulo=null;
    { const lab=ml.querySelector('labeling[type="simple"] settings');
      const ativo=(ml.querySelector(':scope > labelsEnabled')||{}).textContent;
      if(lab && (ativo==null || /1|true/i.test(ativo))){
        const t=lab.querySelector('text-style');
        const campo=t?(t.getAttribute('fieldName')||''):'';
        if(campo){
          rotulo={campo,
            size:parseFloat(t.getAttribute('fontSize')||'')||null,
            color:(()=>{const v=String(t.getAttribute('textColor')||'').split(',');
              if(v.length<3) return null;
              const q=n=>Math.max(0,Math.min(255,Math.round(+n||0))).toString(16).padStart(2,'0');
              return '#'+q(v[0])+q(v[1])+q(v[2]);})(),
            halo:(()=>{const b=lab.querySelector('text-buffer');
              if(!b||!/1|true/i.test(b.getAttribute('bufferDraw')||'')) return null;
              const v=String(b.getAttribute('bufferColor')||'').split(',');
              if(v.length<3) return '#ffffff';
              const q=n=>Math.max(0,Math.min(255,Math.round(+n||0))).toString(16).padStart(2,'0');
              return '#'+q(v[0])+q(v[1])+q(v[2]);})()
          };
        }
      }
    }
    if(id) info[id]={name:nm, file, color, stroke, weight, opac, dash, classes, rotulo};
  });

  // 2) árvore de grupos: DFS achatando "Pai / Filho"
  const plan=[];   // {layerId, group:'A / B'|null, order}
  let ord=0;
  const root=doc.querySelector('layer-tree-group');
  (function walk(node, path){
    if(!node) return;
    for(const ch of node.children){
      if(ch.tagName==='layer-tree-group'){
        const nm=ch.getAttribute('name')||'Grupo';
        walk(ch, path?path+' / '+nm:nm);
      } else if(ch.tagName==='layer-tree-layer'){
        plan.push({layerId:ch.getAttribute('id'), group:path||null,
          checked:(ch.getAttribute('checked')||'').includes('Checked'), order:ord++});
      }
    }
  })(root,'');

  if(!plan.length){ toast('⚠ .qgs sem camadas na árvore'); return 0; }

  // 3) casar com as camadas carregadas (pelo nome-base do arquivo da fonte)
  const groupsByName={};
  const ensureGroup=nm=>{
    if(!nm) return null;
    if(groupsByName[nm]) return groupsByName[nm];
    const g={id:gid++, name:nm, collapsed:false};
    S.groups.push(g); groupsByName[nm]=g; return g;
  };
  let matched=0;
  const orderedIds=[], faltando=[];
  plan.forEach(pl=>{
    const inf=info[pl.layerId]; if(!inf) return;
    /* Casa por nome do ARQUIVO da fonte ou pelo nome de exibição. Rasters e
       ortofotos entram aqui também — antes só camadas vetoriais eram
       reconhecidas, e um MDT do projeto ficava fora do agrupamento. */
    const nomeIgual=o=>{
      const n=String(o.name||'').toLowerCase();
      return n===inf.file || n===String(inf.name||'').toLowerCase();
    };
    const L=S.layers.find(l=>!l._qgsDone && nomeIgual(l));
    const R=!L && (S.rasters||[]).find(r=>!r._qgsDone && nomeIgual(r));
    if(!L && !R){ faltando.push(inf.name||inf.file); return; }
    if(R){                                   // raster: nome, grupo, visibilidade e opacidade
      R._qgsDone=1; matched++;
      R.name=inf.name||R.name;
      if(inf.opac!=null && R.style) R.style.opacity=Math.max(0.05,Math.min(1,inf.opac));
      const gR=ensureGroup(pl.group);        // rasters também entram na árvore
      R.groupId=gR?gR.id:null;
      nodeSetVis({t:"R",id:R.id,o:R},pl.checked!==false);
      try{ renderRaster(R); }catch(e){}
      return;
    }
    L._qgsDone=1; matched++;
    L.name=inf.name||L.name;
    if(L.sym){
      if(inf.color && L.sym.mode==='single') L.sym.color=inf.color;
      if(inf.stroke) L.sym.stroke=inf.stroke;
      if(inf.weight!=null) L.sym.weight=inf.weight;
      if(inf.dash) L.sym.dash=inf.dash;
      if(inf.opac!=null) L.sym.opacity=Math.max(0.05,Math.min(1,inf.opac));
      /* Classes: o CCMGIS tem os mesmos dois modos, então o mapa temático do
         QGIS chega pronto — cores, valores e faixas — sem reclassificar. */
      if(inf.classes && inf.classes.campo){
        const temCampo=(L.fields||[]).some(f=>f.name===inf.classes.campo);
        if(temCampo){
          L.sym.field=inf.classes.campo;
          if(inf.classes.modo==='cat'){
            L.sym.mode='cat';
            const cont={}; L.features.forEach(f=>{const v=String(f.props[inf.classes.campo]); cont[v]=(cont[v]||0)+1;});
            L.sym.cats=inf.classes.cats.map(c=>({value:c.value,color:c.color,count:cont[c.value]||0}));
          }else{
            L.sym.mode='grad';
            L.sym.classes=inf.classes.faixas.map(r=>({min:r.min,max:r.max,color:r.color,
              count:L.features.filter(f=>{const v=+f.props[inf.classes.campo];
                return isFinite(v)&&v>=r.min&&v<=r.max;}).length}));
          }
        }
      }
    }
    if(inf.rotulo && inf.rotulo.campo && (L.fields||[]).some(f=>f.name===inf.rotulo.campo)){
      L.labelField=inf.rotulo.campo; L.labelFields=[inf.rotulo.campo];
      L.lbl=L.lbl||defaultLabelCfg();
      if(inf.rotulo.size)  L.lbl.size=Math.max(4,Math.min(48,inf.rotulo.size));
      if(inf.rotulo.color) L.lbl.color=inf.rotulo.color;
      if(inf.rotulo.halo)  { L.lbl.halo=inf.rotulo.halo; L.lbl.haloW=Math.max(1,L.lbl.haloW||1.2); }
    }
    const g=ensureGroup(pl.group);
    L.groupId=g?g.id:null;
    nodeSetVis({t:'L',id:L.id,o:L},pl.checked!==false);
    orderedIds.push(L.id);
    drawLayer(L);
  });
  S._qgsFaltando=faltando;                   // para o relatório de importação
  // 4) ordem do QGIS (topo da árvore = por cima no mapa)
  if(orderedIds.length){
    const inQgs=S.layers.filter(l=>orderedIds.includes(l.id));
    const rest=S.layers.filter(l=>!orderedIds.includes(l.id));
    inQgs.sort((a,b)=>orderedIds.indexOf(a.id)-orderedIds.indexOf(b.id));
    S.layers=[...inQgs, ...rest];
    zApply();
  }
  S.layers.forEach(l=>delete l._qgsDone);
  (S.rasters||[]).forEach(r=>delete r._qgsDone);
  refreshUI();
  return matched;
}
/* Aviso final da importação: além do que entrou, DIZ O QUE FALTOU e por quê —
   antes, camada sem o dado correspondente sumia do relato e o usuário ficava
   sem saber que a prancha estava incompleta. */
function qgsRelato(n){
  const falt=S._qgsFaltando||[];
  if(!n && !falt.length){ toast('⚠ .qgs sem camadas reconhecidas'); return; }
  let m = n? `Projeto QGIS aplicado: ${n} camada(s) com grupos, ordem e estilo`
           : '⚠ .qgs lido, mas nenhuma camada casou com os dados enviados';
  if(falt.length){
    const lista=falt.slice(0,4).join(', ')+(falt.length>4?` e mais ${falt.length-4}`:'');
    m += ` · ${falt.length} sem dado no envio: ${lista}`;
  }
  toast(m);
  if(falt.length && typeof cmdLog==='function')
    cmdLog('QGIS — camadas do projeto sem arquivo correspondente: '+falt.join(', '),'info');
  S._qgsFaltando=null;
}

/* ============================================================================
   IMPORTAR PROJETO QGIS DE UMA PASTA
   O .qgs guarda CAMINHOS do disco e o navegador não os enxerga — daí a
   exigência de zipar tudo. O seletor de PASTA resolve isso: o usuário aponta
   a pasta do projeto e o navegador entrega os arquivos com o caminho RELATIVO
   (webkitRelativePath), que é exatamente a forma como o .qgs referencia as
   fontes. Ordem obrigatória: carregar os DADOS primeiro, aplicar o projeto
   depois — o casamento é por nome de arquivo já carregado.
   ========================================================================== */
async function importQgisPasta(fileList){
  const files=[...(fileList||[])];
  if(!files.length){ toast('Nenhum arquivo na pasta'); return; }
  const ext=f=>(f.name.split('.').pop()||'').toLowerCase();
  const projs=files.filter(f=>['qgs','qgz'].includes(ext(f)));
  if(!projs.length){
    toast('⚠ Nenhum .qgs/.qgz nessa pasta — escolha a pasta que contém o projeto do QGIS');
    return;
  }
  /* Dados que o CCMGIS sabe ler. Subpastas entram junto: projetos do QGIS
     costumam guardar os shapefiles em "dados/", "shp/" etc. */
  const dados=files.filter(f=>['shp','dbf','shx','prj','cpg','tif','tiff','asc',
    'geojson','json','kml','kmz','gpx','dxf','csv','zip'].includes(ext(f)));
  showLoad(`Lendo a pasta do projeto (${dados.length} arquivo(s) de dados)…`);
  if(dados.length){
    try{ await handleFiles(dados); }
    catch(e){ console.warn('pasta QGIS:',e.message); }
  }
  /* Um projeto por vez: se houver mais de um .qgs na pasta, usa o primeiro e
     avisa — aplicar dois seguidos deixaria a árvore misturada. */
  const pr=projs[0];
  let xml=null;
  try{
    if(ext(pr)==='qgz'){
      const inner=await JSZip.loadAsync(await pr.arrayBuffer());
      const ip=Object.keys(inner.files).find(x=>/\.qgs$/i.test(x));
      if(ip) xml=await inner.files[ip].async('string');
    }else xml=await pr.text();
  }catch(e){ toast('Falha ao ler '+pr.name+': '+e.message); hideLoad(); return; }
  if(!xml){ toast('⚠ '+pr.name+' não contém o projeto (.qgs) dentro'); hideLoad(); return; }
  qgsRelato(applyQGSProject(xml));
  if(projs.length>1) toast(`A pasta tem ${projs.length} projetos — apliquei "${pr.name}"`);
  hideLoad();
}

async function importZip(file){
  const zip=await JSZip.loadAsync(await file.arrayBuffer());
  const bases={};
  zip.forEach((path,entry)=>{ const m=path.match(/([^\/]+)\.(shp|dbf|shx|prj|cpg)$/i);
    if(m){ (bases[m[1]]=bases[m[1]]||{})[m[2].toLowerCase()]=entry; } });
  for(const [base,g] of Object.entries(bases)){
    if(!g.shp) continue;
    const shpBuf=await g.shp.async('arraybuffer');
    const dbfBuf=g.dbf?await g.dbf.async('arraybuffer'):null;
    const prj=g.prj?await g.prj.async('string'):null;
    const cpg=g.cpg?await g.cpg.async('string'):null;
    await buildLayerFromSHP(base, shpBuf, dbfBuf, prj, cpg);
  }
  // geojson dentro do zip
  const gj = Object.keys(zip.files).filter(p=>/\.(geojson|json)$/i.test(p));
  for(const p of gj){ try{ importGeoJSON(JSON.parse(await zip.files[p].async('string')), p.replace(/\.[^.]+$/,'')); }catch(e){} }
  /* RASTERES E DEMAIS FORMATOS DENTRO DO ZIP.
     O pacote do QGIS costuma trazer o MDT/ortofoto ao lado dos shapefiles, e
     antes só .shp e .geojson eram lidos: o projeto entrava sem o terreno e sem
     a imagem, justamente o que sustenta a prancha. Cada arquivo é entregue ao
     MESMO caminho de leitura usado quando ele é aberto sozinho — nada de um
     segundo leitor que possa divergir. */
  const outros=Object.keys(zip.files).filter(p=>!zip.files[p].dir &&
    /\.(tif|tiff|asc|kml|kmz|gpx|dxf|csv)$/i.test(p));
  for(const p of outros){
    const nome=p.split('/').pop();
    try{
      showLoad('Lendo '+nome+'…');
      const buf=await zip.files[p].async('arraybuffer');
      const f=new File([buf], nome);
      await handleFiles([f]);                 // reaproveita o leitor de cada formato
    }catch(e){ console.warn('zip:',nome,e.message); }
  }
  // projeto QGIS dentro do zip: reconstrói grupos/nomes/cores/ordem
  const qgsPath=Object.keys(zip.files).find(p=>/\.qgs$/i.test(p));
  const qgzPath=Object.keys(zip.files).find(p=>/\.qgz$/i.test(p));
  let qgsXml=null;
  if(qgsPath) qgsXml=await zip.files[qgsPath].async('string');
  else if(qgzPath){
    const inner=await JSZip.loadAsync(await zip.files[qgzPath].async('arraybuffer'));
    const ip=Object.keys(inner.files).find(p=>/\.qgs$/i.test(p));
    if(ip) qgsXml=await inner.files[ip].async('string');
  }
  if(qgsXml){ qgsRelato(applyQGSProject(qgsXml)); }
}
async function buildLayerFromSHP(name, shpBuf, dbfBuf, prj, cpg){
  showLoad('Lendo geometrias…');
  await new Promise(r=>setTimeout(r,10));
  const {gtype,feats}=parseSHP(shpBuf);
  if(feats.length>20000) showLoad(`Montando ${feats.length.toLocaleString('pt-BR')} feições…`);
  await new Promise(r=>setTimeout(r,10));
  let fields=[{name:'FID',type:'N',length:9,decimal:0}], rows=null, nDel=0;
  if(dbfBuf){ const d=parseDBF(dbfBuf, cpg); fields=d.fields; rows=d.rows; nDel=d.nDel||0; }
  const crs = guessCRSfromPRJ(prj) || S.workCRS;
  /* O índice é a chave entre .shp e .dbf. Filtra-se pela geometria E pela marca
     de deletado ANTES de qualquer remoção, para que os dois lados andem juntos. */
  const brutos=feats.map((f,i)=>({f, i})).filter(x=>x.f.geom && !(rows && rows[x.i] && rows[x.i]._del));
  const features=brutos.map(({f,i})=>{
    const ft={geom:f.geom, multi:!!f.multi, props: rows?(rows[i]||{}):{FID:i}};
    if(f.zg) ft.zg=f.zg;                 // preserva o Z 3D lido do shape (PolyLineZ etc.)
    return ft;
  });
  if(rows && rows.length!==feats.length)
    setTimeout(()=>toast(`\u26a0 "${name}": ${feats.length} geometrias e ${rows.length} registros no .dbf `+
      `\u2014 atributos podem n\u00e3o corresponder`),300);
  if(nDel) setTimeout(()=>toast(`"${name}": ${nDel} fei\u00e7\u00e3o(\u00f5es) exclu\u00edda(s) no .dbf foram descartadas`),600);
  const nZ=features.filter(f=>f.zg).length;
  if(nZ) setTimeout(()=>toast(`"${name}": geometria 3D detectada (Z em ${nZ} feições) — disponível no Geoproc (fonte "Z da geometria")`),300);
  addLayer({name,gtype,features,fields,crs});
}
function importGeoJSON(gj, name){
  const feats=[]; let gtype='point';
  const fromLL = c=>c; // geojson é lng/lat (EPSG:4326)
  (gj.features||[gj]).forEach(ft=>{
    const g=ft.geometry; if(!g) return; const pr=ft.properties||{};
    const zOf=c=>Array.isArray(c)&&c.length>2&&isFinite(c[2])?c[2]:null;
    const zRing=r=>{ const zs=r.map(zOf); return zs.some(v=>v!=null)? zs.map(v=>v==null?NaN:v):null; };
    if(g.type==='Point'){gtype='point';
      const f={geom:[g.coordinates],props:pr}; const z=zOf(g.coordinates); if(z!=null)f.zg=[z]; feats.push(f);}
    else if(g.type==='MultiPoint'){gtype='point';
      const f={geom:g.coordinates,props:pr}; const zs=zRing(g.coordinates); if(zs)f.zg=zs; feats.push(f);}
    else if(g.type==='LineString'){gtype='line';
      const f={geom:g.coordinates,multi:true,props:pr};   // ring plano (estrutura original)
      const zs=zRing(g.coordinates); if(zs)f.zg=zs;       // zg espelha o geom (plano)
      feats.push(f);}
    else if(g.type==='MultiLineString'){gtype='line';
      const f={geom:g.coordinates,multi:true,props:pr};
      const zg=g.coordinates.map(zRing); if(zg.some(v=>v))f.zg=zg.map(v=>v||[]);
      feats.push(f);}
    else if(g.type==='Polygon'){gtype='polygon';
      const f={geom:g.coordinates,multi:true,props:pr};
      const zg=g.coordinates.map(zRing); if(zg.some(v=>v))f.zg=zg.map(v=>v||[]);
      feats.push(f);}
    else if(g.type==='MultiPolygon'){gtype='polygon';g.coordinates.forEach(poly=>feats.push({geom:poly,multi:true,props:{...pr}}));}
  });
  const keys=new Set(); feats.forEach(f=>Object.keys(f.props).forEach(k=>keys.add(k)));
  const fields=[...keys].map(k=>{const v=feats.find(f=>f.props[k]!=null)?.props[k];
    return typeof v==='number'?{name:k,type:'N',length:18,decimal:6}:{name:k,type:'C',length:80,decimal:0};});
  if(!fields.length) fields.push({name:'FID',type:'N',length:9,decimal:0});
  addLayer({name,gtype,features:feats,fields,crs:'EPSG:4326'});
  refreshUI(); fitAll();
}
