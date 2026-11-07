/* ============================================================================
   IMPORTAÇÃO DE ARQUIVOS
   ========================================================================== */
/* A File System Access API (showOpenFilePicker etc.) só é usada no DESKTOP.
   No Android/celular a implementação é parcial e o picker pode abrir uma
   janela que NÃO fecha (nem com voltar) — obrigando a matar o Chrome.
   No celular, TODOS os fluxos caem no <input type=file> padrão do sistema,
   que fecha com o botão voltar sempre. */
function fsApiOK(){
  const mob=(navigator.userAgentData && navigator.userAgentData.mobile===true) ||
    /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent||'');
  return !mob;
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
  function posicionaJanelasComando(){
    if(!document.body.classList.contains('alagis3'))return;
    const raiz=document.body,camadas=document.getElementById('right'),corpo=document.getElementById('body'),
      status=document.querySelector('.readout');
    const rc=camadas&&camadas.getBoundingClientRect(),rb=corpo&&corpo.getBoundingClientRect(),
      rs=status&&status.getBoundingClientRect();
    const esquerda=Math.max(6,Math.round((rc&&rc.width?rc.right:300)+6));
    const topo=Math.max(6,Math.round((rb&&rb.height?rb.top:150)+5));
    const baixo=Math.max(8,Math.round(rs&&rs.height?innerHeight-rs.top+4:54));
    raiz.style.setProperty('--alagis-command-left',esquerda+'px');
    raiz.style.setProperty('--alagis-command-top',topo+'px');
    raiz.style.setProperty('--alagis-command-bottom',baixo+'px');
  }
  window.addEventListener('resize',posicionaJanelasComando,{passive:true});
  document.addEventListener('DOMContentLoaded',()=>{
    posicionaJanelasComando();
    const alvos=[document.getElementById('right'),document.getElementById('ribbon'),document.getElementById('ribCats')].filter(Boolean);
    if(window.ResizeObserver){const ro=new ResizeObserver(posicionaJanelasComando);alvos.forEach(x=>ro.observe(x));}
    const mo=new MutationObserver(posicionaJanelasComando);
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
  const b=document.getElementById('cmdBox');
  if(b && b.style.display==='none'){                       // reabre a caixa se estava fechada
    b.style.display='flex';
    if(typeof cmdAplicaModo==='function') cmdAplicaModo();
    if(typeof cmdPinta==='function') cmdPinta();
    const bf=document.getElementById('btnCmdFlut'); if(bf) bf.style.display='none';
  }
  const st=document.getElementById('cmdStatus');
  if(st){ st.style.display='inline-flex';
    const tx=document.getElementById('cmdStatusTxt'); if(tx) tx.textContent=t; }
  // mesma etapa com % diferente só atualiza o status; etapa NOVA vira linha no log
  const base=t.replace(/\d+([.,]\d+)?\s*%?/g,'#');
  if(base!==_loadBase){ _loadBase=base;
    if(typeof cmdLog==='function') cmdLog('▶ '+t,'etapa'); }
}
function hideLoad(){
  const st=document.getElementById('cmdStatus'); if(st) st.style.display='none';
  const px=document.getElementById('cmdStatusPct'); if(px) px.textContent='';
  document.getElementById('loading').classList.remove('on');
  progEnd(); _loadBase=null;
  if(typeof cmdLog==='function') cmdLog('■ concluído','ok');
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
  if(px) px.textContent=(_prog.f*100).toFixed(0)+'%'+
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
/* Cancelamento do carregamento: Esc ou ✕. Não dá para abortar o que já está
   rodando no meio de um await, mas o sinal S._loadCancel é checado nos laços
   de importação, e o overlay SEMPRE sai da frente — o app nunca mais fica
   coberto esperando um seletor que o usuário desistiu de usar.              */
S._loadCancel=false;
function cancelLoad(){ S._loadCancel=true; hideLoad(); toast('Carregamento cancelado'); }
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
    bg.innerHTML=`<div style="background:var(--panel,#151b26);border:1px solid var(--line,#2a3446);border-radius:14px;max-width:420px;width:100%;padding:16px 16px 12px;font-size:13.5px;color:var(--ink,#dde3ee)">
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
async function handleFiles(fileList){
  S._loadCancel=false;
  const files=[...fileList];
  if(!files.length){ toast('Nenhum arquivo selecionado'); return; }
  const ignorados=[], falhas=[];
  /* Uma leva com vários DXFs pergunta a classificação uma única vez por
     padrão. Sem isso, o próximo arquivo recriava uma caixa idêntica no mesmo
     lugar e parecia que o primeiro clique não havia fechado a janela. */
  const dxfLote={escolha:null,processados:0,
    total:files.filter(f=>/\.dxf$/i.test(String(f&&f.name||''))).length};
  showLoad(`Lendo ${files.length} arquivo(s)…`);
  try{
    const groups={};
    for(const f of files){
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
        await checaArquivoLegivel(f);
        if(ext==='tif'||ext==='tiff'){
          showLoad('Lendo GeoTIFF…');
          await ensureGeoTIFF();
          // Android/Drive: copia para a RAM AGORA (permissão fresca) — ver bufferFonte
          const src=await bufferFonte(f);
          const _t=(src instanceof Blob)? await GeoTIFF.fromBlob(src) : await GeoTIFF.fromArrayBuffer(src);
          const _i=await _t.getImage(0);
          if(_i.getSamplesPerPixel()>=3) await addRGBFromTIFF(src, f.name, f.size);
          else await addRasterFromTIFF(src, f.name, f.size);
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
          const texto=await f.text();
          let obj=null;
          try{ obj=JSON.parse(texto); }
          catch(pe){
            if(/"app"\s*:\s*"(ALAGIS|CCMGIS|CCMGeoCampo)"/.test(texto.slice(0,300)))
              throw new Error('Projeto CCMGIS ilegível ('+(pe.message||pe)+') — o arquivo pode ter '+
                'sido truncado ao salvar/compartilhar. Use ↺ Recuperar para restaurar o último autosave.');
            throw pe;
          }
          if(obj && (obj.app==='ALAGIS'||obj.app==='CCMGIS'||obj.app==='CCMGeoCampo')){ loadProject(obj); }
          else importGeoJSON(obj, base);
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
      }catch(err){ console.error(err); falhas.push(name+' — '+(err&&err.message||err)); }
    }
    /* Resumo ÚNICO no fim: o usuário fica sabendo o que ficou de fora sem ser
       interrompido arquivo por arquivo. O detalhe vai para a linha de comandos,
       que é onde se procura quando algo realmente faltou. */
    if(ignorados.length||falhas.length){
      const partes=[];
      if(ignorados.length) partes.push(`${ignorados.length} arquivo(s) de formato não reconhecido`);
      if(falhas.length)    partes.push(`${falhas.length} com erro de leitura`);
      setTimeout(()=>toast('Ignorados: '+partes.join(' · ')),1200);
      try{
        if(ignorados.length) cmdLog('Importação ignorou (formato): '+ignorados.join(', '),'avisa');
        if(falhas.length)    cmdLog('Importação falhou em: '+falhas.join(' | '),'erro');
      }catch(e){}
    }
    await resolveCompanions(groups);
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
    refreshUI(); fitAll();
    if(window.matchMedia('(max-width:720px)').matches && S.layers.length)
      document.getElementById('right').classList.add('open');
  }catch(err){ console.error(err); toast('Falha ao abrir: '+err.message); }
  finally{ hideLoad(); }
}
/* detecta tipo pelos primeiros bytes/caracteres */
/* O seletor do Android devolve uma URI do provedor (Drive, OneDrive…), não um
   arquivo local. Se o arquivo não estiver realmente BAIXADO no aparelho, a leitura
   falha no meio — e o app antes só dizia "erro". Aqui a falha é diagnosticada:
   lê-se o primeiro e o ÚLTIMO bloco antes de decodificar; se o fim não vier, o
   arquivo não está no dispositivo. */
async function checaArquivoLegivel(f){
  const MB=1024*1024;
  if(!f || f.size===0)
    throw new Error('arquivo vazio (0 byte). Se veio do Google Drive, ele não está baixado no aparelho — '+
                    'abra o Drive, toque em ⋮ no arquivo e marque "Disponível offline"; espere concluir e tente de novo.');
  try{
    // Validar somente a abertura do stream. Não testar o fim por slice():
    // certos provedores Android não suportam range parcial, mas entregam o
    // arquivo completo normalmente por text()/arrayBuffer().
    await f.slice(0, Math.min(4096, f.size)).arrayBuffer();
  }catch(e){
    throw new Error('não foi possível iniciar a leitura do arquivo. Tente abrir novamente ou baixe-o para o aparelho.');
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
    if((head[0]===0x49&&head[1]===0x49&&head[2]===0x2a)||(head[0]===0x4d&&head[1]===0x4d&&head[3]===0x2a)) return 'tif';
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
/* ============================================================================
   LEITURA DE UM SÍMBOLO DO QGIS
   O importador lia apenas a COR do símbolo. Num plano de trânsito isso perde
   justamente o que informa: as PLACAS (RasterMarker, uma imagem embutida) e a
   HACHURA dos pátios (LinePatternFill). Aqui o símbolo é lido inteiro, uma vez
   só, e devolvido no vocabulário do CCMGIS — cor, contorno, espessura,
   tracejado, hachura e símbolo de ponto. Serve ao símbolo único e às classes.
   ========================================================================== */
const QGS_MM2PX=3.78;                    /* 1 mm a 96 dpi — a mesma equivalência
                                            que o leitor de .qml já usa */
function qgsProps(el){                   // Options/props DIRETOS de um <layer>
  const m={};
  const map=[...el.children].find(c=>c.tagName==='Option'&&c.getAttribute('type')==='Map');
  if(map)[...map.children].forEach(o=>{ const n=o.getAttribute('name'); if(n!=null) m[n]=o.getAttribute('value'); });
  [...el.children].forEach(o=>{ if(o.tagName==='prop'){ const k=o.getAttribute('k'); if(k!=null) m[k]=o.getAttribute('v'); } });
  return m;
}
/* Cor do QGIS: "R,G,B,A" e, desde a 3.30, "R,G,B,A,rgb:…" — só os quatro
   primeiros números interessam. Devolve hex e alfa 0..1. */
function qgsCor(v){
  if(v==null) return null;
  const t=String(v).trim();
  if(/^#[0-9a-f]{6}$/i.test(t)) return {hex:t.toLowerCase(), a:1};
  if(/^#[0-9a-f]{8}$/i.test(t)) return {hex:'#'+t.slice(1,7).toLowerCase(), a:parseInt(t.slice(7,9),16)/255};
  const n=t.split(',').map(x=>parseFloat(x)).filter(Number.isFinite);
  if(n.length<3) return null;
  const q=x=>Math.max(0,Math.min(255,Math.round(x||0))).toString(16).padStart(2,'0');
  return {hex:'#'+q(n[0])+q(n[1])+q(n[2]), a:n.length>3?Math.max(0,Math.min(1,n[3]/255)):1};
}
/* Comprimento em PIXELS de tela. O QGIS grava em milímetros por padrão, mas o
   arquivo pode declarar Pixel, Point ou unidade de mapa — converter sem olhar
   a unidade é o erro clássico que deixa a linha quatro vezes mais grossa. */
function qgsLen(m,chave){
  const n=parseFloat(String(m[chave]??'').replace(',','.'));
  if(!Number.isFinite(n)) return null;
  const u=String(m[chave+'_unit']||'MM').trim().toUpperCase();
  if(u==='PIXEL') return n;
  if(u==='POINT') return n*96/72;
  if(u==='MAPUNIT'||u==='METERS'||u==='RENDERMETERSINMAPUNITS') return null;  // depende da escala
  return n*QGS_MM2PX;
}
function qgsDash(m){                     // padrão em mm separado por ponto e vírgula
  const usa=String(m.use_custom_dash||'');
  if(/1|true/i.test(usa)){
    const n=String(m.customdash||'').split(';').map(x=>parseFloat(x)).filter(Number.isFinite);
    if(n.length>=2) return n.map(x=>+(x*1.5).toFixed(1)).join(' ');
  }
  const v=String(m.line_style||'').toLowerCase();
  if(v==='dash') return '6 4';
  if(v==='dot') return '1.5 4';
  if(v==='dashdot') return '10 4 2 4';
  if(v==='dashdotdot') return '14 4 2 4 2 4';
  return null;
}
/* Proporção da placa, lida do CABEÇALHO da imagem — sem decodificar o arquivo
   inteiro e sem esperar um onload. Placa esticada é placa ilegível. */
function qgsImgAR(url){
  try{
    const b64=url.slice(url.indexOf(',')+1);
    const bin=atob(b64.slice(0,64));
    if(bin.charCodeAt(0)===0x89 && bin.slice(1,4)==='PNG'){
      const u=n=>((bin.charCodeAt(n)<<24)|(bin.charCodeAt(n+1)<<16)|(bin.charCodeAt(n+2)<<8)|bin.charCodeAt(n+3))>>>0;
      const w=u(16), h=u(20);
      if(w>0&&h>0) return w/h;
    }
  }catch(e){}
  return 1;
}
function qgsImgURL(arq){                 // "base64:…" -> data URL com o tipo certo
  const b64=String(arq).slice(7);
  const mime=/^iVBOR/.test(b64)?'image/png' : /^\/9j\//.test(b64)?'image/jpeg'
           : /^R0lGOD/.test(b64)?'image/gif' : /^(PD94bWw|PHN2Zw)/.test(b64)?'image/svg+xml' : 'image/png';
  return 'data:'+mime+';base64,'+b64;
}
/* Marcadores do QGIS -> símbolos de ponto do CCMGIS (os que existem nos dois) */
const QGS_MARKERS={circle:'circle', square:'square', rectangle:'square', diamond:'diamond',
  triangle:'tri', equilateral_triangle:'tri', inverted_triangle:'tri_dn', pentagon:'penta',
  hexagon:'hexa', star:'star', cross:'cross', cross2:'xmark', cross_fill:'cross',
  arrow:'arrow', arrowhead:'arrow', half_square:'half', pentagram:'star'};
function qgsSimbolo(sym){
  if(!sym) return null;
  const out={};
  /* Num símbolo de PREENCHIMENTO, a SimpleLine é o CONTORNO do polígono; num
     símbolo de linha, ela é a própria linha. Ler as duas como "cor" pintava o
     pátio inteiro com a cor da borda. */
  const tipo=String(sym.getAttribute('type')||'').toLowerCase();
  const camadas=[...sym.children].filter(c=>c.tagName==='layer'&&c.getAttribute('enabled')!=='0');
  camadas.forEach(l=>{
    const cl=l.getAttribute('class')||'', m=qgsProps(l);
    if(cl==='RasterMarker'||cl==='AnimatedMarker'||cl==='SvgMarker'){
      const arq=String(m.imageFile||m.name||'');
      if(/^base64:/.test(arq) && !out.img){
        out.img=qgsImgURL(arq); out.ar=qgsImgAR(out.img);
      }
      const s=qgsLen(m,'size');
      if(s&&out.ptSize==null) out.ptSize=Math.max(16,Math.min(96,Math.round(s)));
    }else if(cl==='SimpleMarker'||cl==='FilledMarker'){
      const c=qgsCor(m.color); if(c&&!out.color){ out.color=c.hex; if(c.a<1&&out.fill==null) out.fill=c.a; }
      const k=qgsCor(m.outline_color); if(k&&!out.stroke) out.stroke=k.hex;
      const nome=String(m.name||'').toLowerCase();
      if(QGS_MARKERS[nome]&&!out.ptShape) out.ptShape=QGS_MARKERS[nome];
      const s=qgsLen(m,'size'); if(s&&out.ptSize==null) out.ptSize=Math.max(8,Math.min(96,Math.round(s)));
      const w=qgsLen(m,'outline_width'); if(w!=null&&out.weight==null) out.weight=Math.max(0.5,+w.toFixed(1));
    }else if(cl==='SimpleLine'){
      const c=qgsCor(m.line_color);
      if(c){ if(tipo==='fill'){ if(!out.stroke) out.stroke=c.hex; } else if(!out.color) out.color=c.hex; }
      const w=qgsLen(m,'line_width'); if(w!=null&&out.weight==null) out.weight=Math.max(0.5,+w.toFixed(1));
      const d=qgsDash(m); if(d&&!out.dash) out.dash=d;
    }else if(cl==='MarkerLine'||cl==='HashLine'||cl==='ArrowLine'){
      /* Linha com marcadores ao longo (faixa de segurança, setas de sentido):
         o CCMGIS não repete símbolo sobre a linha, e o tracejado é a leitura
         mais próxima — a linha continua contínua onde o QGIS a interrompia. */
      if(!out.dash) out.dash='6 4';
    }else if(cl==='SimpleFill'){
      const c=qgsCor(m.color);
      if(c&&!out.color){ out.color=c.hex;
        if(out.fill==null) out.fill=(String(m.style||'solid')==='no')?0:c.a; }
      const k=qgsCor(m.outline_color); if(k&&!out.stroke) out.stroke=k.hex;
      const w=qgsLen(m,'outline_width'); if(w!=null&&out.weight==null) out.weight=Math.max(0.5,+w.toFixed(1));
      const d=qgsDash(Object.assign({},m,{line_style:m.outline_style})); if(d&&!out.dash) out.dash=d;
    }else if(cl==='LinePatternFill'){
      /* Hachura: o QGIS guarda o ÂNGULO das linhas; o CCMGIS tem os motivos
         prontos. 45° é "/", 135° é "\\", e as duas juntas viram grade. */
      const a=parseFloat(m.angle);
      const g=Number.isFinite(a)?(((a%180)+180)%180):45;
      const h=(g<23||g>157)?'horizontal' : (g<68)?'fdiagonal' : (g<113)?'vertical' : 'bdiagonal';
      out.hatch=out.hatch?(out.hatch===h?h:'cross'):h;
      const c=qgsCor(m.color); if(c&&!out.color) out.color=c.hex;
      const d=qgsLen(m,'distance');
      if(d&&out.hatchScale==null) out.hatchScale=Math.max(.25,Math.min(8,+(d/6).toFixed(2)));
      if(out.fill==null) out.fill=0;     // a hachura substitui o preenchimento cheio
    }else if(cl==='PointPatternFill'||cl==='RandomMarkerFill'||cl==='CentroidFill'){
      if(!out.hatch) out.hatch='dots';
      const c=qgsCor(m.color); if(c&&!out.color) out.color=c.hex;
      if(out.fill==null) out.fill=0;
    }
  });
  return Object.keys(out).length?out:null;
}
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
    /* O símbolo único agora é lido INTEIRO — inclusive placa e hachura. As
       leituras antigas ficam como rede: projeto 2.x cai nelas. */
    const sim=qgsSimbolo(sym0)||{};
    const color=sim.color||corDe(sym0,'color')||corDe(sym0,'line_color');
    const stroke=sim.stroke||corDe(sym0,'outline_color')||corDe(sym0,'line_color');
    const weight=(sim.weight!=null)? sim.weight : (()=>{
      /* Larguras do QGIS vêm em MILÍMETROS; o CCMGIS trabalha em px de tela.
         ~3,8 px por mm é a equivalência que o próprio QGIS usa a 96 dpi. */
      const wmm=numDe(sym0,'outline_width');
      return (wmm!=null)? Math.max(0.5, +(wmm*3.78).toFixed(1)) : null;
    })();
    /* Opacidade da CAMADA (0..1); em projetos antigos vinha como <transparency> 0..255 */
    let opac=null;
    const elOp=ml.querySelector(':scope > opacity');
    if(elOp){ const n=parseFloat(elOp.textContent); if(Number.isFinite(n)) opac=n; }
    if(opac==null){ const tr=ml.querySelector(':scope > transparency');
      if(tr){ const n=parseFloat(tr.textContent); if(Number.isFinite(n)) opac=1-n/255; } }
    const dash=sim.dash||null;
    /* CLASSES: categorizado e graduado viram a simbologia por classes do CCMGIS.
       Cada classe carrega o SÍMBOLO INTEIRO: antes só a cor sobrevivia e um
       mapa de placas chegava como um punhado de bolinhas cinzas. */
    let classes=null;
    if(tipoRend==='categorizedSymbol'||tipoRend==='graduatedSymbol'){
      const campo=(rend.querySelector(':scope > attr')||{}).textContent
                 ||rend.getAttribute('attr')||'';
      const simbolos={};
      rend.querySelectorAll('symbols > symbol').forEach(s=>{
        simbolos[s.getAttribute('name')]=qgsSimbolo(s)||{};
      });
      if(tipoRend==='categorizedSymbol'){
        const cats=[...rend.querySelectorAll('categories > category')].map(c=>({
          value:String(c.getAttribute('value')??''),
          rotulo:c.getAttribute('label')||'',
          sim:simbolos[c.getAttribute('symbol')]||{},
          render:c.getAttribute('render')!=='false'
        })).filter(c=>c.render);
        if(campo&&cats.length) classes={modo:'cat',campo,cats};
      }else{
        const rg=[...rend.querySelectorAll('ranges > range')].map(r=>({
          min:parseFloat(r.getAttribute('lower')), max:parseFloat(r.getAttribute('upper')),
          sim:simbolos[r.getAttribute('symbol')]||{}
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
    if(id) info[id]={name:nm, file, color, stroke, weight, opac, dash, classes, rotulo, sim};
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
      const S1=inf.sim||{};
      if(inf.color && L.sym.mode==='single') L.sym.color=inf.color;
      if(inf.stroke) L.sym.stroke=inf.stroke;
      if(inf.weight!=null) L.sym.weight=inf.weight;
      if(inf.dash) L.sym.dash=inf.dash;
      if(inf.opac!=null) L.sym.opacity=Math.max(0.05,Math.min(1,inf.opac));
      if(S1.hatch){ L.sym.hatch=S1.hatch; if(S1.hatchScale!=null) L.sym.hatchScale=S1.hatchScale; }
      if(S1.fill!=null && L.gtype==='polygon') L.sym.fill=S1.fill;
      /* Símbolo de ponto do símbolo único: placa embutida vira imagem, marcador
         geométrico vira a forma equivalente da galeria. */
      if(L.gtype==='point' && (S1.img||S1.ptShape)){
        const forma=S1.img? ptImgRegister(S1.img, inf.name||L.name, S1.ar) : S1.ptShape;
        if(forma) L.sym.pt=Object.assign({shape:'circle',size:14,rot:0,rotField:'',dipField:''},
          L.sym.pt||{}, {shape:forma, size:S1.ptSize||(S1.img?18:14)});
      }
      /* Classes: o CCMGIS tem os mesmos dois modos, então o mapa temático do
         QGIS chega pronto — cores, valores e faixas — sem reclassificar. */
      if(inf.classes && inf.classes.campo){
        const temCampo=(L.fields||[]).some(f=>f.name===inf.classes.campo);
        if(temCampo){
          L.sym.field=inf.classes.campo;
          /* Uma classe do QGIS traduzida para uma classe do CCMGIS. É aqui que
             17 placas diferentes passam a conviver numa camada só: cada classe
             ganha o SEU símbolo de ponto, não apenas a sua cor. */
          const daClasse=(sm,rot)=>{
            const o={}, x=sm||{};
            o.color=x.color||'#888888';
            if(x.stroke) o.stroke=x.stroke;
            if(x.weight!=null) o.weight=x.weight;
            if(x.dash) o.dash=x.dash;
            if(x.fill!=null) o.fill=x.fill;
            if(x.hatch){ o.hatch=x.hatch; if(x.hatchScale!=null) o.hatchScale=x.hatchScale; }
            if(L.gtype==='point'){
              const forma=x.img? ptImgRegister(x.img, rot||'Placa', x.ar) : x.ptShape;
              if(forma){ o.shape=forma; o.size=x.ptSize||(x.img?18:14); }
            }
            return o;
          };
          if(inf.classes.modo==='cat'){
            L.sym.mode='cat';
            const cont={}; L.features.forEach(f=>{const v=String(f.props[inf.classes.campo]); cont[v]=(cont[v]||0)+1;});
            L.sym.cats=inf.classes.cats.map(c=>Object.assign(
              {value:c.value, count:cont[c.value]||0}, daClasse(c.sim, c.rotulo||c.value)));
          }else{
            L.sym.mode='grad';
            L.sym.classes=inf.classes.faixas.map(r=>Object.assign(
              {min:r.min, max:r.max,
               count:L.features.filter(f=>{const v=+f.props[inf.classes.campo];
                 return isFinite(v)&&v>=r.min&&v<=r.max;}).length}, daClasse(r.sim,'')));
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
    else if(g.type==='MultiPolygon'){gtype='polygon';g.coordinates.forEach(poly=>feats.push({geom:poly,multi:true,props:pr}));}
  });
  const keys=new Set(); feats.forEach(f=>Object.keys(f.props).forEach(k=>keys.add(k)));
  const fields=[...keys].map(k=>{const v=feats.find(f=>f.props[k]!=null)?.props[k];
    return typeof v==='number'?{name:k,type:'N',length:18,decimal:6}:{name:k,type:'C',length:80,decimal:0};});
  if(!fields.length) fields.push({name:'FID',type:'N',length:9,decimal:0});
  addLayer({name,gtype,features:feats,fields,crs:'EPSG:4326'});
  refreshUI(); fitAll();
}
