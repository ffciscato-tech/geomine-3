function ribIcon(cmd){
  if(RIB_CAT_ATUAL==='inicio' && cmd.ic && typeof RIB_PROJECT_PNG!=='undefined' && RIB_PROJECT_PNG[cmd.ic]){
    const p=RIB_PROJECT_PNG[cmd.ic];
    if(!document.documentElement.style.getPropertyValue('--alagis-project-png-sprite'))
      document.documentElement.style.setProperty('--alagis-project-png-sprite',`url("${RIB_PROJECT_PNG_SPRITE}")`);
    return `<span class="ric-project-png" style="--ix:${p[0]};--iy:${p[1]}"></span>`;
  }
  if(cmd.ic && typeof RIB_PNG!=='undefined' && RIB_PNG[cmd.ic]){
    const p=RIB_PNG[cmd.ic];
    if(!document.documentElement.style.getPropertyValue('--alagis-png-sprite'))
      document.documentElement.style.setProperty('--alagis-png-sprite',`url("${RIB_PNG_SPRITE}")`);
    return `<span class="ric-png" style="--ix:${p[0]};--iy:${p[1]}"></span>`;
  }
  if(cmd.ic && typeof RIB_SVG!=='undefined' && RIB_SVG[cmd.ic])
    return '<span class="ric-lib">'+RIB_SVG[cmd.ic]+'</span>';
  return '<span class="ric-png ric-png-missing" aria-hidden="true"></span>';
}
function ribFindSec(cont, key){
  // acha a seção real cujo título contém a palavra-chave (case/acentos livres)
  const norm=s=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const alvo=norm(key);
  const secs=[...cont.querySelectorAll('.sec,.hsec')];
  for(const sec of secs){
    const h=sec.querySelector(':scope > h2, :scope > h3, h2, h3, label.field');
    if(h && norm(h.textContent).includes(alvo)) return sec;
  }
  return null;
}
let RIB_CAT_ATUAL='inicio';
/* Durante a execução de um comando da ribbon, a categoria que o usuário
   escolheu fica travada por um curto intervalo. Isso impede switchView() e
   callbacks assíncronos do comando de trocarem a aba visual (ex.: Cava ->
   Topografia/GIS) só porque várias categorias compartilham a mesma view. */
let RIB_COMMAND_CAT=null, RIB_COMMAND_CAT_TIMER=null;
function catAtual(){ return CATS.find(c=>c.id===RIB_CAT_ATUAL) || CATS[0]; }
const RIB_ORDER_KEY='alagis_ribbon_tab_order_v1';
let RIB_ORDER_OK=false, RIB_DRAG_ID=null, RIB_DRAG_T=0;
function ribCatOrderApply(){
  if(RIB_ORDER_OK) return; RIB_ORDER_OK=true;
  try{
    const ids=JSON.parse(localStorage.getItem(RIB_ORDER_KEY)||'[]');
    if(!Array.isArray(ids)||!ids.length) return;
    const pos=new Map(ids.map((id,i)=>[id,i]));
    CATS.sort((a,b)=>(pos.has(a.id)?pos.get(a.id):999)-(pos.has(b.id)?pos.get(b.id):999));
  }catch(e){}
}
function ribCatOrderSave(){
  try{ localStorage.setItem(RIB_ORDER_KEY,JSON.stringify(CATS.map(c=>c.id))); }catch(e){}
}
function ribTooltipBind(el,cmd,grupo,categoria){
  if(!el) return;
  el.removeAttribute('title');                 // evita a tooltip nativa duplicada
  const esconder=()=>{
    const t=document.getElementById('ribHoverTip');
    if(t) t.classList.remove('on');
  };
  el.addEventListener('mouseenter',()=>{
    let t=document.getElementById('ribHoverTip');
    if(!t){ t=document.createElement('div'); t.id='ribHoverTip'; document.body.appendChild(t); }
    const indisponivel=!!(cmd.visual||cmd.soon||(!cmd.act&&!cmd.sec&&!cmd.secKey));
    t.innerHTML='<b>'+esc(cmd.nome)+'</b>'+
      '<small>'+esc(categoria)+' · '+esc(grupo||'Comandos')+'</small>'+
      (cmd.desc?'<small style="margin-top:4px">'+esc(cmd.desc)+'</small>':'')+
      (indisponivel?'<small class="tip-soon">Em breve</small>':'<small style="margin-top:3px;color:#71c892">Comando disponível</small>');
    t.classList.add('on');
    const r=el.getBoundingClientRect();
    const w=t.offsetWidth, h=t.offsetHeight, m=7;
    let left=r.left+r.width/2-w/2;
    left=Math.max(m,Math.min(left,innerWidth-w-m));
    let top=r.bottom+7;
    if(top+h>innerHeight-m) top=r.top-h-7;
    t.style.left=Math.round(left)+'px'; t.style.top=Math.round(Math.max(m,top))+'px';
  });
  el.addEventListener('mouseleave',esconder);
  el.addEventListener('pointerdown',esconder);
}
/* Tooltips de todos os controles compactos. `title` e `aria-label` continuam
   sendo a fonte semântica; a dica visual é centralizada no alvo, aparece
   também por foco de teclado e é removida ao clicar/rolar. A observação de
   mutações cobre botões gerados depois (camadas, menus e modais). */
function uiIconTooltipInit(root=document){
  const seletor=[
    'button[title]','button[aria-label]','button.tbtn','button.mini','.dren-type-current',
    '.mtool[title]','.xbtn[title]','.gset[title]','.gdel[title]',
    '.mtool','.xbtn','.gset','.gdel','.a3-util[title]','[data-a3nav][title]','.a3-view-plus[title]',
    '#layoutTopTools [title]','#a3StatusViews [title]'
  ].join(',');
  const ehIcone=el=>{
    if(!el||el.dataset.uiTipBound||el.id==='ribHoverTip'||el.closest('#ribbon'))return false;
    const tx=(el.textContent||'').replace(/\s+/g,' ').trim(),aria=el.getAttribute('aria-label')||'',
      temSvg=!!el.querySelector('svg,.lo-top-ic,.ric,.ric-png,.ric-lib');
    return temSvg||!!aria||tx.length<=4||el.matches('.mtool,.xbtn,.gset,.gdel,.a3-util,[data-a3nav]');
  };
  const fecha=()=>{const t=document.getElementById('ribHoverTip');if(t){t.classList.remove('on','ui-icon-tip');}};
  const abre=el=>{
    const msg=(el.getAttribute('data-tooltip')||el.getAttribute('aria-label')||el.getAttribute('title')||'').trim();
    if(!msg)return;
    let t=document.getElementById('ribHoverTip');
    if(!t){t=document.createElement('div');t.id='ribHoverTip';document.body.appendChild(t);}
    t.innerHTML='<b>'+esc(msg)+'</b>';t.classList.add('on','ui-icon-tip');
    const r=el.getBoundingClientRect(),m=7,w=t.offsetWidth,h=t.offsetHeight;
    let left=Math.max(m,Math.min(r.left+r.width/2-w/2,innerWidth-w-m)),top=r.bottom+7;
    if(top+h>innerHeight-m)top=r.top-h-7;
    t.style.left=Math.round(left)+'px';t.style.top=Math.round(Math.max(m,top))+'px';
  };
  root.querySelectorAll?.(seletor).forEach(el=>{
    if(!ehIcone(el))return;
    el.dataset.uiTipBound='1';
    /* A dica customizada evita esperar a tooltip nativa; o texto acessível
       permanece no aria-label e em data-tooltip. */
    let dica=el.getAttribute('title')||el.getAttribute('aria-label')||'';
    if(!dica){
      const mapa={btnMenu:'Abrir menu principal',tabV3d:'Abrir visão 3D',cmdClose:'Fechar painel de comandos',
        btnLoPDF:'Exportar layout em PDF',btnLoPNG:'Exportar layout em PNG',btnLoSVG:'Exportar layout em SVG',
        drenTipoCurrent:'Escolher o tipo de dispositivo de drenagem',
        bufClose:'Fechar ferramenta de buffer',ddClose:'Fechar ferramenta',ffClose:'Fechar ferramenta'};
      const tx=(el.textContent||'').replace(/\s+/g,' ').trim();
      dica=mapa[el.id]||({PDF:'Exportar em PDF',PNG:'Exportar em PNG',SVG:'Exportar em SVG'})[tx]||
        (/^✕$/.test(tx)?'Fechar esta janela':'');
    }
    if(dica){el.dataset.tooltip=dica;if(!el.getAttribute('aria-label'))el.setAttribute('aria-label',dica);el.removeAttribute('title');}
    el.addEventListener('mouseenter',()=>abre(el));el.addEventListener('focus',()=>abre(el));
    el.addEventListener('mouseleave',fecha);el.addEventListener('blur',fecha);el.addEventListener('pointerdown',fecha);
  });
  if(!window.__alagisUiTipObserver){
    window.__alagisUiTipObserver=new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{
      if(n.nodeType===1)uiIconTooltipInit(n);
    })));
    window.__alagisUiTipObserver.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('scroll',fecha,true);window.addEventListener('resize',fecha,{passive:true});
  }
}
setTimeout(()=>uiIconTooltipInit(document),0);
let RIB_FIT_RAF=0;
/* Rótulo que não cabe: o CSS quebra entre palavras em até duas linhas. Se
   ainda assim não couber — palavra única mais larga que o botão
   ("Sincronizar") ou texto que pediria três linhas —, a fonte DAQUELE rótulo
   diminui até caber (mínimo 72% e nunca abaixo de 6 px), em vez de partir a palavra ao meio
   ("Recupera / r") ou cortar com reticências ("Apagar..."). */
function ribRotulosCabem(bar){
  if(!bar) return;
  bar.querySelectorAll('.rbtn span:last-child').forEach(sp=>{
    sp.style.removeProperty('font-size');
    if(!sp.offsetParent||!sp.textContent.trim()) return;
    const base=parseFloat(getComputedStyle(sp).fontSize)||10;
    /* linhas de fato ocupadas (o desenho das letras passa 1 px da caixa com
       entrelinha justa; comparar alturas encolhia rótulos que já cabiam) */
    const linhas=()=>{const r=document.createRange();r.selectNodeContents(sp);
      return new Set([...r.getClientRects()].filter(q=>q.width>0).map(q=>Math.round(q.top))).size;};
    const naoCabe=()=>sp.scrollWidth>sp.clientWidth+1||linhas()>2;
    let f=base;
    const piso=Math.max(base*.72,6);              // abaixo de 6 px ninguém lê
    while(naoCabe()&&f>piso){
      f-=.25; sp.style.setProperty('font-size',f.toFixed(2)+'px','important');
    }
  });
}
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{try{ribRotulosCabem(document.getElementById('ribbon'));}catch(_){}});
function ribbonFitOneRow(cat){
  const bar=document.getElementById('ribbon');
  if(!bar) return;
  if(!document.body.classList.contains('alagis3')){ requestAnimationFrame(()=>ribRotulosCabem(bar)); return; }
  cancelAnimationFrame(RIB_FIT_RAF);
  RIB_FIT_RAF=requestAnimationFrame(()=>{
    const groups=[...bar.querySelectorAll('.ribgrp')];
    if(!groups.length||bar.clientWidth<100) return;
    const cs=getComputedStyle(document.body);
    const baseBtn=parseFloat(cs.getPropertyValue('--rbtnw'))||64;
    const baseIcon=parseFloat(cs.getPropertyValue('--ricsz'))||34;
    const baseLabel=parseFloat(cs.getPropertyValue('--riclbl'))||10.5;
    let slots=0, buttons=0;
    groups.forEach(g=>{
      const n=g.querySelectorAll('.rbtn').length;
      buttons+=n;
      slots+=n;
    });
    if(!buttons||!slots) return;

    /* Espaço estrutural: margens da faixa, divisórias, preenchimento dos
       grupos e distância entre botões. Em telas estreitas ele também diminui,
       antes de reduzir os ícones. */
    const available=Math.max(80,bar.clientWidth-14);
    let gpad=available<1100?2:(available<1500?3:5);
    let gap=available<1100?0:1;
    const chrome=groups.length*(gpad*2+2)+Math.max(0,slots-groups.length)*gap;
    let btn=Math.floor((available-chrome)/slots);
    btn=Math.max(24,Math.min(baseBtn,btn));
    const ratio=Math.min(1,btn/baseBtn);
    const icon=Math.max(18,Math.min(baseIcon,Math.floor(baseIcon*Math.max(.57,ratio))));
    const label=Math.max(6.8,Math.min(baseLabel,baseLabel*Math.max(.66,Math.sqrt(ratio))));

    bar.style.setProperty('--fit-rbtnw',btn+'px');
    bar.style.setProperty('--fit-ricsz',icon+'px');
    bar.style.setProperty('--fit-riclbl',label.toFixed(2)+'px');
    bar.style.setProperty('--fit-ric-scale',(icon/48).toFixed(5));
    bar.style.setProperty('--fit-gpad',gpad+'px');
    bar.style.setProperty('--fit-gap',gap+'px');
    bar.style.setProperty('--fit-glabel',Math.max(7,Math.min(9,label-.6)).toFixed(2)+'px');
    bar.classList.add('ribbon-fit');
    ribRotulosCabem(bar);
    /* a faixa ainda se acomoda (ícones, abas) logo depois: mede de novo */
    clearTimeout(window.__alagisRibRotT);
    window.__alagisRibRotT=setTimeout(()=>{try{ribRotulosCabem(bar);}catch(_){}},160);
  });
}
if(!window.__alagisRibbonFitResize){
  window.__alagisRibbonFitResize=true;
  window.addEventListener('resize',()=>{
    clearTimeout(window.__alagisRibbonFitTimer);
    window.__alagisRibbonFitTimer=setTimeout(()=>{
      try{ ribbonFitOneRow(typeof catAtual==='function'?catAtual():null); }catch(e){}
    },80);
  },{passive:true});
}
function ribbonBuild(){
  window.GeoMineRibbon.prepare(CATS);
  const cats=document.getElementById('ribCats');
  const bar=document.getElementById('ribbon');
  if(!cats||!bar) return;
  ribbonClose(); ribCatOrderApply();
  /* A busca pertence visualmente à barra de abas. Antes de reconstruí-la,
     preserva o mesmo nó no cabeçalho oculto para não perder seus eventos. */
  const busca=document.querySelector('.a3-search-wrap');
  if(busca&&busca.parentElement===cats){
    const destino=document.querySelector('.a3-head-tools');
    if(destino)destino.insertBefore(busca,destino.firstChild);
  }
  cats.innerHTML=''; bar.innerHTML='';
  if(!acadOn()) return;
  // barra de categorias (17)
  CATS.forEach(c=>{
    const t=document.createElement('div'); t.className='ribcat'+(c.id===RIB_CAT_ATUAL?' on':'');
    t.textContent=c.nome; t.draggable=true; t.dataset.catId=c.id;
    t.title='Arraste para reorganizar esta aba';
    t.addEventListener('dragstart',e=>{
      RIB_DRAG_ID=c.id; RIB_DRAG_T=Date.now(); t.classList.add('dragging');
      e.dataTransfer.effectAllowed='move';
      try{ e.dataTransfer.setData('text/plain',c.id); }catch(err){}
    });
    t.addEventListener('dragover',e=>{ e.preventDefault(); e.dataTransfer.dropEffect='move'; });
    t.addEventListener('drop',e=>{
      e.preventDefault();
      const src=RIB_DRAG_ID, dst=c.id;
      if(!src||src===dst) return;
      const i=CATS.findIndex(x=>x.id===src), j=CATS.findIndex(x=>x.id===dst);
      if(i<0||j<0) return;
      const [mov]=CATS.splice(i,1);
      CATS.splice(j,0,mov);
      ribCatOrderSave(); RIB_DRAG_ID=null;
      ribbonBuild(); toast('Ordem das abas atualizada');
    });
    t.addEventListener('dragend',()=>{ RIB_DRAG_ID=null;RIB_DRAG_T=Date.now();t.classList.remove('dragging'); });
    t.onclick=()=>{
      if(RIB_DRAG_ID || Date.now()-RIB_DRAG_T<350) return;
      // sair de uma aba contextual do editor a descarta (ela é temporária)
      if(ED && ED._ctx && c.id!=='ed_ctx'){ try{ edFechaCtx(); }catch(e){} }
      RIB_CAT_ATUAL=c.id;
      if(c.view) switchView(c.view); else ribbonBuild(); };
    cats.appendChild(t);
  });
  /* Mantém a busca imediatamente depois de AJUDA, mesmo quando as abas forem
     reorganizadas por arraste. */
  if(busca){
    const ajuda=cats.querySelector('[data-cat-id="ajuda"]');
    if(ajuda)ajuda.after(busca);else cats.appendChild(busca);
  }
  // ribbon: grupos da categoria ativa
  const cat=catAtual();
  const cont=document.getElementById(RIB_SRC[cat.view]||'sideMain');
  (cat.grupos||[]).forEach(grp=>{
    const g=document.createElement('div'); g.className='ribgrp'+(cat.id==='editor'?' ribgrp-grid':'');
    const items=document.createElement('div'); items.className='items';
    (grp.it||[]).forEach(cmd=>{
      const b=document.createElement('div'); b.className='rbtn'; b.title=cmd.nome;
      b.innerHTML='<span class="ric">'+ribIcon(cmd)+'</span><span>'+esc(cmd.nome)+'</span>';
      let sec=null;
      if(cont && !cmd.soon){
        if(cmd.sec) sec=cont.querySelector(cmd.sec) || document.querySelector(cmd.sec);
        else if(cmd.secKey) sec=ribFindSec(cont, cmd.secKey);
      }
      if(cmd.visual){
        b.classList.add('visual-only','soon');
        b.title=cmd.nome+' (em breve)';
        b.onclick=()=>emBreve(cmd.nome);
      }
      else if(sec){ b.onclick=()=>{
        if(!['inicio','projeto','arquivo','visualizacao','janela','config','ajuda'].includes(cat.id)&&!prepareDrawingCommand())return;
        const keepCat=RIB_CAT_ATUAL;
        RIB_COMMAND_CAT=keepCat; clearTimeout(RIB_COMMAND_CAT_TIMER);
        ribbonOpen(sec,b,cmd.nome);
        RIB_CAT_ATUAL=keepCat;
        RIB_COMMAND_CAT_TIMER=setTimeout(()=>{ RIB_COMMAND_CAT=null; },250);
      }; }
      else if(cmd.act && !cmd.soon){ b.onclick=()=>{
        if(!['inicio','projeto','arquivo','visualizacao','janela','config','ajuda'].includes(cat.id)&&!prepareDrawingCommand())return;
        const keepCat=RIB_CAT_ATUAL;
        RIB_COMMAND_CAT=keepCat; clearTimeout(RIB_COMMAND_CAT_TIMER);
        try{ cmd.act(b); }catch(e){
          const msg='Falha em “'+cmd.nome+'”: '+((e&&e.message)||e);
          try{cmdLog(msg,'erro');}catch(_){}
          try{console.error(e);}catch(_){}
          toast(msg);
        } finally {
          RIB_CAT_ATUAL=keepCat;
          RIB_COMMAND_CAT_TIMER=setTimeout(()=>{ RIB_COMMAND_CAT=null; },250);
        }
      }; }
      else {
        b.classList.add('soon'); b.title=cmd.nome+' (em breve)';
        b.onclick=()=>emBreve(cmd.nome);
      }
      ribTooltipBind(b,cmd,grp.label||'Comandos',cat.nome);
      items.appendChild(b);
    });
    g.appendChild(items);
    const lb=document.createElement('div'); lb.className='glabel'; lb.textContent=grp.label||'';
    g.appendChild(lb);
    bar.appendChild(g);
  });
  ribbonFitOneRow(cat);
}
/* A coluna lateral permanece exclusiva para Camadas. Os controles do Layout
   vivem na paleta superior e os ajustes surgem logo abaixo dela. */
function layoutDockSync(v){
  const sec=document.getElementById('secLayout');
  const dock=document.getElementById('layoutDock');
  if(!sec||!dock) return;
  if(sec.classList.contains('docked')){
    sec.classList.remove('docked','layout-open');
    const volta=sec._voltaPara || document.getElementById('sideMain');
    if(volta && sec.parentNode!==volta) volta.appendChild(sec);
  }
  sec.style.display='none';dock.style.display='none';
  const legado=document.getElementById('layoutSideMenu');if(legado)legado.remove();
  try{ if(typeof layoutSideMenuSync==='function') layoutSideMenuSync(); }catch(e){}
}
function abreLayout(btn){
  switchView('layout');
  const sec=document.getElementById('secLayout');if(sec){sec.style.display='none';sec.classList.remove('layout-open');}
}
/* Mantém qualquer caixa temporária inteira dentro da janela. Ela pode cobrir a
   linha de comandos — temporários ficam acima dela — mas nunca é cortada pelo
   rodapé nem sai pelas bordas da tela. */
function popupFitViewport(el,left,top,margin){
  if(!el) return; const m=margin==null?8:margin;
  el.style.maxHeight=Math.max(80,innerHeight-2*m)+'px';
  el.style.overflowY='auto';
  el.style.left=Math.round(Math.max(m,Math.min(left,innerWidth-el.offsetWidth-m)))+'px';
  el.style.top=Math.round(Math.max(m,Math.min(top,innerHeight-el.offsetHeight-m)))+'px';
}
/* Ao abrir qualquer comando, a camada/superfície ativa no painel lateral é
   a fonte de trabalho padrão. Só altera seletores cuja opção traz também o
   NOME do objeto — isto evita confundir IDs iguais de raster e vetor. */
function commandUseActive(root){
  if(!root)return;
  let q;
  try{q=window.GeoMineCommandSelection?.capture({stamp:false});}catch(e){return;}
  if(q?.layers.length>1)return;
  const L=q?.layers[0]||((typeof processingLayer==='function')?processingLayer():
    ((typeof activeLayer==='function')?activeLayer():null));
  const R=(!L&&S.selRaster&&(S.rasters||[]).includes(S.selRaster))?S.selRaster:null;
  const alvo=L||R;if(!alvo)return;
  const id=String(alvo.id),nome=String(alvo.name||'').trim().toLowerCase();
  root.querySelectorAll('select').forEach(sel=>{
    // A comparação tem fontes/eixo próprios. A camada ativa não pode
    // recolocar uma fonte removida nem substituir uma escolha ao abrir ícones.
    if(['prRasterSel','prVectorSel','prAxisVectorSel'].includes(sel.id))return;
    const op=[...sel.options].find(o=>String(o.value)===id&&
      (!nome||String(o.textContent||'').toLowerCase().includes(nome)));
    if(!op)return;
    sel.value=op.value;
    try{sel.dispatchEvent(new Event('change',{bubbles:true}));}catch(e){}
  });
}
/* A sincronização ocorre antes do onclick do ícone. Assim também cobre
   comandos que abrem modal próprio e não passam por ribbonOpen(). */
document.addEventListener('pointerdown',e=>{
  if(e.target&&e.target.closest&&e.target.closest('#ribbon .rbtn'))commandUseActive(document);
},true);
function ribbonOpen(sec,btn,tit,persistent=true){
  // o painel de layout agora vive fixo no dock — nunca vai para o popover
  if(sec && sec.id==='secLayout' && sec.classList.contains('docked')){
    const r=document.getElementById('right'); if(r) r.classList.add('open');
    sec.classList.remove('collapsed');
    try{ sec.scrollIntoView({block:'start',behavior:'smooth'}); }catch(e){}
    return;
  }
  const pop=document.getElementById('ribbonPop'); if(!pop) return;
  // Repetir o clique no mesmo comando não desmonta a janela. O fechamento
  // é sempre uma ação explícita no botão ×.
  if(RIB.sec===sec && pop.classList.contains('on')) return;
  ribbonClose();
  pop.classList.toggle('profile-pop',sec.id==='sidePerfis');
  const prevDisplay=sec.style.display;
  RIB.ph=document.createComment('rib'); sec.parentNode.insertBefore(RIB.ph,sec);
  sec.style.display='block';
  sec.classList.remove('collapsed');
  pop.innerHTML='<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'+
    '<b style="font-size:12.5px;flex:1">'+esc(tit)+'</b>'+
    '<span class="gset" id="ribX" style="font-size:14px">✕</span></div>';
  pop.appendChild(sec);
  commandUseActive(sec);
  const r=btn.getBoundingClientRect();
  // Todo painel de ferramenta permanece aberto durante a operação no mapa.
  // O parâmetro é mantido por compatibilidade com os comandos existentes.
  pop.dataset.persistent='1';
  pop.classList.add('on');
  popupFitViewport(pop,r.left,r.bottom+4,8);
  RIB.sec=sec; RIB.btn=btn; RIB.prevDisplay=prevDisplay; btn.classList.add('on');
  const x=document.getElementById('ribX'); if(x) x.onclick=ribbonClose;
}
function ribbonClose(){
  const pop=document.getElementById('ribbonPop'); if(!pop) return;
  if(RIB.sec && RIB.ph && RIB.ph.parentNode){
    RIB.ph.parentNode.insertBefore(RIB.sec, RIB.ph); RIB.ph.remove();
    if(Object.prototype.hasOwnProperty.call(RIB,'prevDisplay'))
      RIB.sec.style.display=RIB.prevDisplay;
  }
  if(RIB.btn) RIB.btn.classList.remove('on');
  RIB={sec:null, ph:null, btn:null, prevDisplay:null};
  pop.classList.remove('on','profile-pop'); pop.innerHTML=''; delete pop.dataset.persistent;
}
document.addEventListener('pointerdown',e=>{
  const pop=document.getElementById('ribbonPop');
  if(!pop || !pop.classList.contains('on')) return;
  if(pop.contains(e.target) || e.target.closest('.rbtn')) return;
  // cliques em modais/menus abertos por cima não fecham o painel
  if(e.target.closest('.modal-bg,.modal')) return;
  // Operações no mapa, em menus ou em controles externos não fecham a janela.
  // Somente o botão × criado por ribbonOpen chama ribbonClose().
  return;
});
/* Regra única de permanência para todos os modais: clicar no fundo não é um
   comando de fechamento. Os fluxos exibem o próprio ×, Cancelar ou Concluir.
   A captura também neutraliza listeners antigos ligados ao backdrop. */
document.addEventListener('click',e=>{
  const alvo=e.target;
  if(alvo && alvo.classList && alvo.classList.contains('modal-bg') && alvo.classList.contains('on')){
    e.preventDefault();
    e.stopImmediatePropagation();
  }
},true);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    const pop=document.getElementById('ribbonPop');
    // Esc é reservado para as ferramentas; não fecha o painel de parâmetros.
    if(pop && pop.classList.contains('on')) e.preventDefault();
  }
});
