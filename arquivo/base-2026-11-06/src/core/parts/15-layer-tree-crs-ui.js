/* ============================================================================
   UI: listas, estilos, CRS
   ========================================================================== */
function fillCRSSelect(sel, current){
  sel.innerHTML='';
  const groups={'Geográficas':[],'SIRGAS 2000 / UTM':[],'SAD69 / UTM':[],'Córrego Alegre / UTM':[],'WGS84 / UTM':[]};
  Object.keys(CRS_LABELS).forEach(code=>{
    const lb=CRS_LABELS[code];
    const g = lb.includes('SIRGAS 2000 / UTM')?'SIRGAS 2000 / UTM'
      :lb.includes('SAD69')?'SAD69 / UTM':lb.includes('Córrego')?'Córrego Alegre / UTM'
      :lb.includes('WGS84 / UTM')?'WGS84 / UTM':'Geográficas';
    groups[g].push([code,lb]);
  });
  for(const [gn,items] of Object.entries(groups)){
    if(!items.length) continue; const og=document.createElement('optgroup'); og.label=gn;
    items.forEach(([code,lb])=>{const o=document.createElement('option');o.value=code;o.textContent=`${lb} — ${code}`;
      if(code===current)o.selected=true; og.appendChild(o);}); sel.appendChild(og);
  }
}
/* ---------- Grupos e ordenação (topo da lista = por cima no mapa) ---------- */
function displayList(){
  const nodes=stackSync();
  const by={}; nodes.forEach(n=>by[nodeKey(n.t,n.id)]=n);
  const out=[]; const seen=new Set();
  // grupos vazios entram NA POSIÇÃO da pilha (chave G:id)
  const order=S.stack.slice();
  const nodeOf=k=>by[k];
  const emptyHandled=new Set();
  const pushEmptyBefore=key=>{
    // insere todos os G: que precedem esta chave na pilha
    for(const k of order){
      if(k===key) break;
      if(k.startsWith('G:') && !emptyHandled.has(k)){
        const g=S.groups.find(x=>x.id===+k.slice(2));
        if(g && !seen.has(g.id)){ out.push({kind:'group',g}); seen.add(g.id); }
        emptyHandled.add(k);
      }
    }
  };
  nodes.forEach(n=>{
    pushEmptyBefore(nodeKey(n.t,n.id));
    const gi=n.o.groupId;
    if(gi!=null && !seen.has(gi)){
      const g=S.groups.find(x=>x.id===gi);
      if(g){ out.push({kind:'group',g}); seen.add(g.id); } else n.o.groupId=null;
    }
    const kind = n.t==='L'?'layer' : n.t==='R'?'raster' : 'img';
    out.push({kind, n, L:(n.t==='L'?n.o:undefined), r:(n.t==='R'?n.o:undefined), img:(n.t==='I'?n.o:undefined)});
  });
  // grupos vazios que ficaram no fim da pilha
  for(const k of order){
    if(k.startsWith('G:') && !emptyHandled.has(k)){
      const g=S.groups.find(x=>x.id===+k.slice(2));
      if(g && !seen.has(g.id)){ out.push({kind:'group',g}); seen.add(g.id); }
      emptyHandled.add(k);
    }
  }
  return out;
}
function toggleGroupVisibility(g){
 const members=groupMembers(g.id),shown=members.filter(n=>n.o.visible!==false);
 if(shown.length){
  g.visibilityResume=shown.map(n=>nodeKey(n.t,n.id));
  shown.forEach(n=>nodeSetVis(n,false));
 }else{
  const resume=new Set(Array.isArray(g.visibilityResume)?g.visibilityResume:[]);
  members.forEach(n=>{if(resume.has(nodeKey(n.t,n.id)))nodeSetVis(n,true);});
  if(!members.some(n=>n.o.visible!==false))toast('Ligue uma camada do grupo para definir o que exibir.');
  g.visibilityResume=[];
 }
 zApply();refreshUI();
}
function groupMembers(gidv){ return stackSync().filter(n=>n.o.groupId===gidv); }
function boundarySnap(items, idx){ // impede soltar um grupo dentro de outro
  const ok=i=>{ if(i<=0) return true; const p=items[i-1];
    if(p.kind==='group') return false;
    if(p.n && p.n.o.groupId!=null){
      const q=items[i]; if(q && q.n && q.n.o.groupId===p.n.o.groupId) return false;
      return true; }
    return true; };
  while(idx<items.length && !ok(idx)) idx++;
  return idx;
}
function reorderModel(kind, id, dispIdx){
  let items=displayList();
  let blockIdx=[];
  if(kind==='node'){ const i=items.findIndex(it=>it.n && nodeKey(it.n.t,it.n.id)===id); if(i<0)return; blockIdx=[i]; }
  else { items.forEach((it,i)=>{ if((it.kind==='group'&&it.g.id===id)||(it.n&&it.n.o.groupId===id)) blockIdx.push(i); });
    if(!blockIdx.length) return; }
  const block=blockIdx.map(i=>items[i]);
  const removedBefore=blockIdx.filter(i=>i<dispIdx).length;
  let tgt=Math.max(0, Math.min(dispIdx-removedBefore, items.length));
  items=items.filter((_,i)=>!blockIdx.includes(i));
  if(kind==='group') tgt=boundarySnap(items, Math.min(tgt, items.length));
  tgt=Math.max(0, Math.min(tgt, items.length));
  if(kind==='node'){
    const prev=items[tgt-1], nd=block[0].n;
    nd.o.groupId = !prev ? null : prev.kind==='group' ? prev.g.id : (prev.n ? prev.n.o.groupId : null);
  }
  items.splice(tgt,0,...block);
  const nodes=items.filter(it=>it.n).map(it=>it.n);
  const hasMember=id=>nodes.some(n=>n.o.groupId===id);
  S.stack=items.map(it=> it.n ? nodeKey(it.n.t,it.n.id)
    : (!hasMember(it.g.id) ? 'G:'+it.g.id : null)).filter(Boolean);
  S.layers=nodes.filter(n=>n.t==='L').map(n=>n.o);   // ordem dos vetores segue a pilha
  zApply(); refreshUI();
  if(typeof layoutSeVisivel==='function')layoutSeVisivel();
}
function addGroup(){
  const name=prompt('Nome do grupo:','Grupo '+gid); if(!name) return;
  const g={id:gid++, name, collapsed:false};
  S.groups.push(g); (S.stack=S.stack||[]).unshift('G:'+g.id); refreshUI();
}
function deleteGroup(g){
  allNodes().forEach(n=>{ if(n.o.groupId===g.id) n.o.groupId=null; });
  S.groups=S.groups.filter(x=>x!==g); refreshUI();
}

/* ---------- Drag & drop (pointer events — funciona no touch) ---------- */
let dropIdx=null;
function clearDropInd(){ document.querySelectorAll('.drop-before,.drop-after').forEach(e=>e.classList.remove('drop-before','drop-after')); }
function dragOverY(y){
  const list=document.getElementById('layerList');
  const rows=[...list.children].filter(r=>r.dataset && r.dataset.di!==undefined);
  clearDropInd(); if(!rows.length) return 0;
  for(let i=0;i<rows.length;i++){ const r=rows[i].getBoundingClientRect();
    if(y < r.top + r.height/2){ rows[i].classList.add('drop-before'); return +rows[i].dataset.di; } }
  rows[rows.length-1].classList.add('drop-after');
  return +rows[rows.length-1].dataset.di + 1;
}
function bindDrag(el, kind, id){
  const h=el.querySelector('.drag'); if(!h) return;
  h.addEventListener('pointerdown',e=>{
    e.preventDefault(); e.stopPropagation();
    el.classList.add('dragging'); dropIdx=null;
    const mv=ev=>{ ev.preventDefault(); dropIdx=dragOverY(ev.clientY); };
    const up=ev=>{ document.removeEventListener('pointermove',mv); document.removeEventListener('pointerup',up);
      clearDropInd(); el.classList.remove('dragging');
      if(dropIdx!=null) reorderModel(kind,id,dropIdx); dropIdx=null; };
    document.addEventListener('pointermove',mv);
    document.addEventListener('pointerup',up);
  });
}

/* A prancha guarda um SVG já montado. Redesenhar o mapa não a atualiza —
   é preciso remontar. Chamado após mudanças de rótulo e de simbologia.     */
function layoutSeVisivel(){
  const el=document.getElementById('layout');
  if(!el || el.style.display==='none' || typeof buildLayout!=='function')return;
  /* A prancha congelada não acompanha silenciosamente mudanças de camadas,
     filtros, rótulos ou simbologia. Elas ficam pendentes até o usuário
     confirmar no botão "Atualizar prancha". */
  if(S.loFrozen && (S.loMode==='a4'||S.loMode==='fig')){
    try{
      /* Qualquer edição feita enquanto a prancha está visível pertence à
         composição que o usuário está vendo, inclusive quando ela altera
         apenas ordem, filtro, rótulo ou simbologia. */
      S._loDraftVis={...layoutVisSnapshot()};
      if(S.loMode==='a4'){
        if(typeof layoutConventionSnapshot==='function')
          S._loDraftConv=layoutClone(layoutConventionSnapshot());
        S._loDraftStack=(S.stack||[]).slice();
      }
    }catch(e){}
    if(typeof layoutFrozenDirty==='function')layoutFrozenDirty(true);
    return;
  }
  buildLayout();
}

/* Renomeia uma categoria de verdade, e não apenas o texto desenhado na
   legenda. O valor do campo é alterado em todas as feições da classe; assim
   árvore, legenda, rótulos e tabela de atributos continuam descrevendo o
   mesmo dado. Campos DBF numéricos passam a texto porque um nome como
   "Talude norte" não pode ser persistido corretamente como número. */
function renameCategorizedClassCore(L, ci, rawName){
  if(!L || !L.sym || L.sym.mode!=='cat') return {ok:false,msg:'A camada não está categorizada'};
  const cats=L.sym.cats||[], cat=cats[ci], field=L.sym.field;
  if(!cat || !field) return {ok:false,msg:'Classe ou campo de classificação inválido'};
  const name=String(rawName==null?'':rawName).trim();
  if(!name) return {ok:false,msg:'O nome da classe não pode ficar vazio'};
  const oldKey=String(cat.value);
  if(name===oldKey) return {ok:false,unchanged:true,msg:'O nome não foi alterado'};
  if(cats.some((c,i)=>i!==ci && String(c.value)===name))
    return {ok:false,msg:'Já existe uma classe chamada “'+name+'”'};

  const fld=(L.fields||[]).find(f=>f.name===field);
  const viraTexto=!!(fld && (fld.type==='N'||fld.type==='F'));
  if(viraTexto){
    fld.type='C';
    fld.decimals=0;
    fld.length=Math.max(+fld.length||0, name.length, 40);
    /* A coluna passa inteira a texto para não ficar com tipos mistos. */
    (L.features||[]).forEach(f=>{
      if(f.props && f.props[field]!=null) f.props[field]=String(f.props[field]);
    });
    cats.forEach(c=>c.value=String(c.value));
  }

  let changed=0;
  (L.features||[]).forEach(f=>{
    if(f.props && String(f.props[field])===oldKey){ f.props[field]=name; changed++; }
  });
  cat.value=name;
  if(Object.prototype.hasOwnProperty.call(cat,'label')) cat.label=name;
  cat.count=changed;
  return {ok:true,count:changed,oldName:oldKey,newName:name,field,converted:viraTexto};
}
function renameCategorizedClass(L, ci){
  const cat=L&&L.sym&&L.sym.cats&&L.sym.cats[ci]; if(!cat) return;
  const novo=prompt('Novo nome para a classe “'+String(cat.value)+'”:',String(cat.value));
  if(novo==null) return;
  const r=renameCategorizedClassCore(L,ci,novo);
  if(!r.ok){ if(!r.unchanged) toast(r.msg); return; }
  S.activeId=L.id;
  drawLayer(L);
  refreshUI();
  if(document.getElementById('attrPanel')?.classList.contains('open')) openAttr();
  if(S.selFeat && S.selFeat.layer===L) showProps();
  layoutSeVisivel();
  toast('Classe “'+r.oldName+'” renomeada para “'+r.newName+'” em '+r.count+' feição(ões)');
}
/* Seleção múltipla da ÁRVORE (independente da seleção de feições do mapa). */
S._layerMultiOn=false; S._layerMulti=new Set();
function layerMultiKeysValidas(){return new Set(allNodes().map(n=>nodeKey(n.t,n.id)));}
function layerMultiSync(){
  const validas=layerMultiKeysValidas();
  [...S._layerMulti].forEach(k=>{if(!validas.has(k))S._layerMulti.delete(k);});
  const b=document.getElementById('btnLayerMulti'),d=document.getElementById('btnLayerMultiDel'),n=S._layerMulti.size;
  if(b){b.style.color=S._layerMultiOn?'var(--amber)':'';b.title=S._layerMultiOn?'Sair da seleção múltipla':'Selecionar várias camadas para excluir';}
  if(d){d.style.display=S._layerMultiOn?'':'none';d.textContent='🗑'+(n?' '+n:'');d.disabled=!n;}
}
function layerMultiHTML(key){
  if(!S._layerMultiOn)return '';
  const on=S._layerMulti.has(key);
  return `<span class="lmsel ${on?'on':''}" title="${on?'Desmarcar':'Marcar'} camada">${on?'✓':'·'}</span>`;
}
function layerMultiHandle(key,e){
  if(!S._layerMultiOn)return false;
  if(e){e.preventDefault();e.stopPropagation();}
  if(S._layerMulti.has(key))S._layerMulti.delete(key);else S._layerMulti.add(key);
  refreshUI();return true;
}
function layerMultiDelete(){
  const escolhidas=allNodes().filter(n=>S._layerMulti.has(nodeKey(n.t,n.id)));
  if(!escolhidas.length){toast('Marque uma ou mais camadas');return;}
  const nomes=escolhidas.map(n=>n.o.name||'Imagem de fundo');
  if(!confirm(`Excluir ${escolhidas.length} camada(s)?\n\n${nomes.map(n=>'• '+n).join('\n')}\n\nA exclusão poderá ser desfeita individualmente com Ctrl+Z.`))return;
  S._layerMulti.clear();S._layerMultiOn=false;
  escolhidas.forEach(n=>{
    if(n.t==='L')deleteVectorLayer(n.o);
    else if(n.t==='R')deleteRaster(n.o);
    else if(n.t==='I'){
      undoPush({t:'image',img:n.o,stackIdx:(S.stack||[]).indexOf('I:0')});
      if(n.o.overlay)try{map.removeLayer(n.o.overlay);}catch(e){}
      S.img=null;S.stack=(S.stack||[]).filter(k=>k!=='I:0');
    }
  });
  refreshUI();layerMultiSync();toast(`${escolhidas.length} camada(s) excluída(s)`);
}
function containerCountLayerRole(L){
  if(!L)return '';
  const papel=L._containerCount&&L._containerCount.papel;
  if(papel==='pontos'||papel==='pegadas')return papel;
  const nome=String(L.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/^contagem de conteineres(?:\s|—|-|$)/.test(nome))return 'pontos';
  if(/^conteineres reconhecidos(?:\s|—|-|$)/.test(nome))return 'pegadas';
  const campos=new Set((L.fields||[]).map(c=>String(typeof c==='string'?c:c&&c.name||'').toUpperCase()));
  const assinatura=['TIPO','EMPILHADOS','COMP_M','LARG_M'].every(c=>campos.has(c));
  if(!assinatura)return '';
  return L.gtype==='point'?'pontos':L.gtype==='polygon'?'pegadas':'';
}
function containerCountSummaryFromLayer(L){
  if(!containerCountLayerRole(L))return null;
  const temCoordenada=a=>Array.isArray(a)&&
    ((Number.isFinite(a[0])&&Number.isFinite(a[1]))||a.some(temCoordenada));
  const feats=(L.features||[]).filter(f=>{
    if(!f||!f.props||!temCoordenada(f.geom))return false;
    try{return typeof featureVisible!=='function'||featureVisible(L,f);}catch(e){return true;}
  });
  const niveis={},porTipo={};let total=0,posicoes=0;
  feats.forEach(f=>{
    const p=f.props||{},n=Math.max(1,Math.round(+p.EMPILHADOS||1)),tipo=String(p.TIPO||'');
    posicoes++;total+=n;niveis[n]=(niveis[n]||0)+1;
    const match=tipo.match(/^(12|20|24|40)(?:[′'’]|$)/);if(match){const t=match[1]+'′';porTipo[t]=(porTipo[t]||0)+n;}
    else if(tipo==='Medido')porTipo.Medido=(porTipo.Medido||0)+n;
  });
  if(!posicoes)return null;
  return {posicoes,total,c12:porTipo['12′']||0,c24:porTipo['24′']||0,c20:porTipo['20′']||0,c40:porTipo['40′']||0,porTipo,niveis};
}
function containerCountTypeEntries(R){
  const tipos=R.porTipo||{'12′':R.c12||0,'24′':R.c24||0,'20′':R.c20||0,'40′':R.c40||0};
  return Object.entries(tipos).filter(([,n])=>n>0).sort((a,b)=>(parseInt(a[0])||Infinity)-(parseInt(b[0])||Infinity));
}
function containerCountVisibleLayer(){
  const vis=(S.layers||[]).filter(L=>L&&L.visible!==false&&containerCountLayerRole(L));
  return vis.find(L=>containerCountLayerRole(L)==='pontos')||vis[0]||null;
}
function containerCountLevelsText(R){
  return Object.keys(R&&R.niveis||{}).map(Number).filter(Number.isFinite).sort((a,b)=>a-b)
    .map(n=>R.niveis[n]+' '+(R.niveis[n]===1?'posição':'posições')+' × '+n+' '+(n===1?'nível':'níveis')).join(' · ');
}
function containerCountLegendSync(){
  const host=document.getElementById('map');if(!host)return;
  let el=document.getElementById('containerCountLegend');
  const L=containerCountVisibleLayer(),R=L&&containerCountSummaryFromLayer(L);
  if(!R){if(el)el.remove();return;}
  if(!el){
    el=document.createElement('div');el.id='containerCountLegend';
    el.setAttribute('role','status');el.setAttribute('aria-label','Legenda da contagem de contêineres');
    el.style.cssText="position:absolute;top:14px;right:72px;z-index:1250;min-width:280px;max-width:390px;"+
      "pointer-events:none;background:rgba(255,255,255,.95);border:1px solid #9db2c5;border-radius:8px;"+
      "box-shadow:0 3px 12px rgba(16,39,58,.22);padding:9px 11px;color:#17324a;"+
      "font:500 16px/1.4 'Signika',sans-serif;";
    host.appendChild(el);
  }
  const niveis=containerCountLevelsText(R);
  el.innerHTML='<div style="font-size:14px;font-weight:700;letter-spacing:.055em;margin-bottom:5px">CONTAGEM DE CONTÊINERES</div>'+
    '<div style="display:flex;align-items:center;gap:7px"><span style="width:12px;height:12px;border-radius:50%;background:#ef8d32;border:1px solid #b75d13"></span>'+
    '<span><b style="font-size:21px">'+R.total.toLocaleString('pt-BR')+'</b> unidade'+(R.total===1?'':'s')+
    ' em <b>'+R.posicoes.toLocaleString('pt-BR')+'</b> '+(R.posicoes===1?'posição':'posições')+'</span></div>'+
    '<div style="margin-top:4px">'+containerCountTypeEntries(R).map(([t,n])=>'<b>'+esc(t)+':</b> '+n.toLocaleString('pt-BR')).join(' &nbsp; ')+'</div>'+
    (R.porTipo&&R.porTipo.Medido?'<div style="margin-top:4px;font-weight:700">Medido: dimensão fora do padrão; conferir.</div>':'')+
    (niveis?'<div style="margin-top:2px;color:#587087">'+esc(niveis)+'</div>':'');
}
function refreshUI(){
  if(typeof refreshCivilMdt==='function')refreshCivilMdt();
  /* refresh explícito satisfaz qualquer atualização deferida por addLayer. */
  if(S._layerTreeRefreshTimer!=null){
    clearTimeout(S._layerTreeRefreshTimer);S._layerTreeRefreshTimer=null;
  }
  S._layerTreeRefreshQueued=false;
  try{ syncSideSecs(); }catch(e){}
  try{ if(typeof propRefresh==='function') propRefresh(); }catch(e){}
  try{ if(typeof hBarrSync==='function') hBarrSync(); }catch(e){}   // lista de barramentos
  try{layerMultiSync();}catch(e){}
  // os seletores da aba Geoproc precisam refletir camadas criadas AGORA
  // (fluxo TIN -> curvas -> poligonizar sem sair da aba)
  try{
    const sg=document.getElementById('sideGeo');
    const geoOn=sg && sg.style.display!=='none' && sg.style.display!=='';
    if(geoOn){
      if(typeof refreshTinPanel==='function') refreshTinPanel();
      if(typeof refreshGtPanel==='function') refreshGtPanel();
      if(typeof refreshOverlayPanel==='function') refreshOverlayPanel();
      if(typeof refreshMosaicPanel==='function') refreshMosaicPanel();
      if(typeof refreshVecOpsPanel==='function') refreshVecOpsPanel();
      if(typeof refreshIntersectPanel==='function') refreshIntersectPanel();
      if(typeof refreshCutPanel==='function') refreshCutPanel();
      if(typeof refreshExtracaoSolidosPanel==='function') refreshExtracaoSolidosPanel();
    }
  }catch(e){ console.warn('refresh geo:', e); }
  const list=document.getElementById('layerList'); list.innerHTML='';
  document.getElementById('noLayers').style.display=(S.layers.length||S.groups.length||(S.rasters&&S.rasters.length)||(S.solidos&&S.solidos.length)||(S.img&&S.img.url))?'none':'block';
  const items=displayList();
  const q=(S._layerQuery||'').trim().toLowerCase();
  const matchName=nm=>!q || (nm||'').toLowerCase().includes(q);
  items.forEach((it,di)=>{
    // filtro de busca por nome (grupos, rasters, imagens e vetores)
    if(q){
      let nm='';
      if(it.kind==='group') nm=it.g.name;
      else if(it.kind==='raster'||it.kind==='img') nm=it.n.o.name||'';
      else if(it.L) nm=it.L.name;
      if(!matchName(nm)) return;
    }
    if(it.kind==='group'){
      const g=it.g; const members=groupMembers(g.id);
      const allVis=members.some(n=>n.o.visible!==false);
      const el=document.createElement('div'); el.className='grp'; el.dataset.di=di;
      el.innerHTML=`<span class="drag" title="Arrastar">⠿</span>
        <span class="gchev">${g.collapsed?'▸':'▾'}</span>
        <span class="eye ${allVis?'on':''}">${allVis?'◉':'○'}</span>
        <span class="nm">${esc(g.name)}</span><span class="cnt">${members.length}</span>
        <span class="gdel" title="Desfazer grupo">✕</span>`;
      el.querySelector('.gchev').onclick=()=>{g.collapsed=!g.collapsed;refreshUI();};
      el.querySelector('.eye').onclick=e=>{e.stopPropagation();
        toggleGroupVisibility(g);};
      el.querySelector('.gdel').onclick=e=>{e.stopPropagation();
        if(confirm(`Desfazer grupo "${g.name}"? (as camadas voltam à raiz)`)) deleteGroup(g);};
      el.querySelector('.nm').ondblclick=()=>{const n=prompt('Renomear grupo:',g.name); if(n){g.name=n;refreshUI();}};
      bindDrag(el,'group',g.id);
      list.appendChild(el);
      return;
    }

    /* ---- raster (MDE) e ortofoto: mesmas linhas arrastáveis/agrupáveis ---- */
    if(it.kind==='raster' || it.kind==='img'){
      const n=it.n, o=n.o;
      const gg=o.groupId!=null?S.groups.find(x=>x.id===o.groupId):null;
      if(gg && gg.collapsed && !q) return;   // na busca, mostra membro mesmo em grupo recolhido
      const key=nodeKey(n.t,n.id);
      const vis=o.visible!==false;
      const isRas=it.kind==='raster';
      /* superfície nascida de triangulação tem identidade própria na árvore:
         ícone de triângulo e a contagem de TRIÂNGULOS no lugar da grade —
         a grade é só a visualização, quem manda nos cálculos é o TIN */
      /* só a SUPERFÍCIE TIN de verdade ganha o triângulo; um raster que
         nasceu de triangulação continua sendo raster na árvore */
      const isTIN=isRas&&!!(o.tinPuro||(o.d&&o.d.tin));
      const nTri=isTIN?((o.d&&o.d.tin&&o.d.tin.tri)?(o.d.tin.tri.length/3|0)
        :(o._tinMesh&&o._tinMesh.indices?(o._tinMesh.indices.length/3|0):0)):0;
      const sw = isRas ? 'linear-gradient(135deg,#1a6b3c,#e8e07a,#8d6e63)'
                       : 'linear-gradient(135deg,#4c7a34,#9ab87a,#cfcfc4)';
      const cnt = isTIN ? (nTri?`▲ ${nTri.toLocaleString('pt-BR')}`:'TIN')
        : (isRas ? `${o.d.nc}×${o.d.nr}` : (o._w? `${o._w}×${o._h}` : 'imagem'));
      const el=document.createElement('div');
      el.className='layer'+(gg?' ingrp':'')+(S._layerMulti.has(key)?' multi-selected':''); el.dataset.di=di;
      el.innerHTML=`<span class="drag" title="Arrastar">⠿</span>${layerMultiHTML(key)}
        <span class="eye ${vis?'on':''}" title="Visibilidade">${vis?'◉':'○'}</span>
        ${isTIN
          ?`<span class="swatch" title="Superfície TIN — cálculos pelos triângulos" style="background:#123024;display:flex;align-items:center;justify-content:center;color:#7fe0a8;font-size:10px;font-weight:700">▲</span>`
          :`<span class="swatch" style="background:${sw}"></span>`}
        <span class="nm">${esc(o.name||(isRas?'MDE':'ortofoto'))}</span>
        <span class="cnt">${cnt}</span>
        <span class="gset" title="${isRas?'Propriedades, resolução e curvas de nível':'Propriedades da ortofoto'}">⚙</span>
        <span class="gdel ndel" title="Remover">✕</span>`;
      el.querySelector('.gset').onclick=e=>{e.stopPropagation(); isRas? openRasProps(o) : openImgProps();};
      el.querySelector('.eye').onclick=e=>{e.stopPropagation(); nodeSetVis(n,!vis); zApply(); refreshUI();};
      el.querySelector('.ndel').onclick=e=>{e.stopPropagation();
        if(isRas){ if(confirm(`Remover a superfície "${o.name}" (${o.d.nc}×${o.d.nr})?\nEsta ação não pode ser desfeita.`)) deleteRaster(o); }
        else { if(!confirm('Remover a ortofoto/imagem de fundo?')) return;
               if(o.overlay) map.removeLayer(o.overlay); S.img=null; refreshUI(); } };
      const ms=el.querySelector('.lmsel');if(ms)ms.onclick=e=>layerMultiHandle(key,e);
      el.onclick=e=>{ if(layerMultiHandle(key,e))return; const now=Date.now();
        const dbl = now-((S._tapT&&S._tapT[key])||0)<350;
        (S._tapT=S._tapT||{})[key]= dbl?0:now;
        if(dbl){
          // duplo-clique: abre o modal de propriedades da superfície/imagem
          isRas? openRasProps(o) : openImgProps();
        } else {
          // clique simples: ativa a superfície na paleta (rápido, cacheado)
          S.selRaster=o; S.activeId=null;
          try{ if(typeof propRefresh==='function') propRefresh(); }catch(e){}
        }
      };
      /* Evento nativo para mouse/caneta; o relógio acima permanece como
         fallback de duplo toque. Não reconstrói a árvore no primeiro clique,
         então o segundo continua incidindo sobre o mesmo elemento. */
      el.ondblclick=e=>{
        if(layerMultiHandle(key,e))return;
        e.preventDefault(); e.stopPropagation();
        (S._tapT=S._tapT||{})[key]=0;
        isRas?openRasProps(o):openImgProps();
      };
      bindDrag(el,'node',key);
      list.appendChild(el);
      return;
    }

    const L=it.L;
    const meshInfo=window.GeoMineGeology?.meshViews?.info(L);
    const g=L.groupId!=null?S.groups.find(x=>x.id===L.groupId):null;
    if(g && g.collapsed && !q) return; // membros de grupo recolhido não renderizam (exceto na busca)
    const s=L.sym;
    const collabLocked=typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false,true);
    const classed=(s.mode==='grad'&&s.classes.length)||(s.mode==='cat'&&s.cats.length);
    const keyL=nodeKey('L',L.id);
    const el=document.createElement('div'); el.className='layer'+(L.id===S.activeId?' active':'')+(g?' ingrp':'')+(S._layerMulti.has(keyL)?' multi-selected':'');
    el.dataset.di=di;
    let extra='';
    if(!meshInfo && L.gtype!=='point' && L.features.length<=2000){ const t=layerTotals(L);
      extra = L.gtype==='polygon' ? `<span class="area">${fmtArea(t.area)}</span>` : `<span class="area">${fmtLen(t.comp)}</span>`; }
    el.innerHTML=`<span class="drag" title="Arrastar">⠿</span>${layerMultiHTML(keyL)}`+
      (classed?`<span class="gchev cchev">${L.clsOpen?'▾':'▸'}</span>`:'')+
      `<button class="lfreeze mini" type="button" aria-pressed="${!!L.locked}" title="${L.locked?'Descongelar camada — liberar edição':'Congelar camada — bloquear edição'}" aria-label="${L.locked?'Descongelar camada':'Congelar camada'}" style="padding:0;width:24px;min-width:24px;max-width:24px;height:22px;flex:none">${L.locked?'🔒':'🔓'}</button>
      <span class="eye ${L.visible?'on':''}" title="Visibilidade">${L.visible?'◉':'○'}</span>
      ${L._cavaLimiteDin
        ?`<span class="swatch" title="Limite paramétrico — cópia editável que comanda a cava/pilha" style="background:#fff;border:2px dashed #7b3fd4;box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:#7b3fd4;font-size:13px;font-weight:800;line-height:1">◈</span>`
        :swatchHTML(L)}
      <span class="nm"${collabLocked?' title="Camada em edição por outra pessoa ou aberta como leitura"':''}>${(L.locked||collabLocked)?'🔒 ':''}${esc(L.name)}</span>${extra}<span class="cnt"${meshInfo?' title="'+esc(meshInfo.label)+'"':''}>${meshInfo?meshInfo.count.toLocaleString('pt-BR'):L.features.length}</span>
      <button class="lstyle mini" type="button" title="Opções da camada — copiar e colar estilo" aria-label="Opções da camada" style="padding:0;width:22px;min-width:22px;height:22px;flex:none">⋮</button>
      <span class="lcfg" title="Simbologia e rótulos" style="cursor:pointer;padding:0 5px;opacity:.65">⚙</span>
      <span class="gdel ldel" title="Remover camada">✕</span>`;
    el.querySelector('.eye').onclick=e=>{e.stopPropagation();
      if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false,true)){collabCanEditLayer(L,true,true);return;}
      nodeSetVis({t:'L',id:L.id,o:L},!L.visible);zApply();refreshUI();};
    el.querySelector('.lfreeze').onclick=e=>{e.stopPropagation();setLayerFrozen(L,!L.locked);};
    el.querySelector('.ldel').onclick=e=>{e.stopPropagation();
      const detail=meshInfo?`${meshInfo.count.toLocaleString('pt-BR')} ${meshInfo.label}`:`${L.features.length} feições`,
        note=meshInfo?'Outras representações não serão alteradas. Use Desfazer para recuperar esta camada.':'Esta ação não pode ser desfeita.';
      if(confirm(`Remover a camada "${L.name}" (${detail})?\n${note}`))
        deleteVectorLayer(L);};
    // acesso direto às propriedades: o toque duplo continua funcionando, mas
    // não é descobrível — nada na tela indicava que ele existia
    el.querySelector('.lcfg').onclick=e=>{ e.stopPropagation();
      if(S.selFeat&&S.selFeat.layer!==L)S.selFeat=null;
      if(window.ED&&ED.sel&&ED.sel.L!==L)ED.sel=null;
      S.activeId=L.id; refreshUI(); openLayerProps(L); };
    if(classed) el.querySelector('.cchev').onclick=e=>{e.stopPropagation();L.clsOpen=!L.clsOpen;refreshUI();};
    const msL=el.querySelector('.lmsel');if(msL)msL.onclick=e=>layerMultiHandle(keyL,e);
    let propsClickTimer;
    el.title='Um clique: selecionar · Dois cliques: propriedades · Três cliques: zoom';
    el.onclick=e=>{ if(layerMultiHandle(keyL,e))return;
      S.selRaster=null;                                  // sai do modo raster na paleta
        if(S.selFeat&&S.selFeat.layer!==L)S.selFeat=null;
        if(window.ED&&ED.sel&&ED.sel.L!==L){ED.sel=null;try{edRedraw();edPainelSync();}catch(_){}}
        S.activeId=L.id;
        /* Não chama refreshUI aqui: reconstruir a linha entre os dois cliques
           impedia o navegador de produzir o evento dblclick. */
        list.querySelectorAll('.layer.active').forEach(x=>x.classList.remove('active'));
        el.classList.add('active');
        try{ if(typeof propRefresh==='function') propRefresh(); }catch(e){}
        clearTimeout(propsClickTimer);
        if(e.detail===3)fitLayer(L);
        else if(e.detail===2) propsClickTimer=setTimeout(()=>{
          if(el.isConnected&&S.activeId===L.id)openLayerProps(L);
        },400);
    };
    el.ondblclick=e=>{
      if(e.target.closest('button,.eye,.lcfg,.ldel,.cchev,.lmsel'))return;
      if(layerMultiHandle(keyL,e))return;
      e.preventDefault(); e.stopPropagation();
      // O clique de detail=2 já agendou as propriedades; o terceiro cancela.
    };
    el.querySelector('.lstyle').onclick=e=>{e.stopPropagation();window.GeoMineStyleTransfer?.menu(L,e.currentTarget);};
    el.oncontextmenu=e=>{e.preventDefault();window.GeoMineStyleTransfer?.menu(L,el);};
    bindDrag(el,'node',nodeKey('L',L.id));
    list.appendChild(el);
    // classes expandidas sob a camada (olho por classe)
    if(classed && L.clsOpen){
      const arr=s.mode==='grad'?s.classes:s.cats;
      arr.forEach((c,ci)=>{
        const on=c.vis!==false;
        const label=s.mode==='grad'?`${fmt(c.min)} – ${fmt(c.max)}`:String(c.value);
        const row=document.createElement('div');
        row.className='clsrow'+(g?' ingrp2':'');
        row.innerHTML=`<span class="eye ${on?'on':''}">${on?'◉':'○'}</span>
          ${swatchHTML(L,c)}
          <span class="nm" title="Um clique: selecionar · Dois cliques: propriedades · Três cliques: zoom nas feições da classe" style="cursor:pointer">${esc(label)}</span><span class="cnt">${c.count??''}</span>`;
        let classClickTimer;
        row.querySelector('.eye').onclick=e=>{e.stopPropagation();
          clearTimeout(classClickTimer);
          c.vis=!on; drawLayer(L); refreshUI();};
        // Aguarda o terceiro clique antes de abrir o modal que cobriria a árvore.
        row.onclick=e=>{
          e.stopPropagation();S.activeId=L.id;S.selRaster=null;
          clearTimeout(classClickTimer);
          if(S.selFeat&&S.selFeat.layer!==L)S.selFeat=null;
          if(window.ED&&ED.sel&&ED.sel.L!==L){ED.sel=null;try{edRedraw();edPainelSync();}catch(_){}}
          list.querySelectorAll('.layer.active').forEach(x=>x.classList.remove('active'));
          el.classList.add('active');
          try{if(typeof propRefresh==='function')propRefresh();}catch(_){}
          if(e.detail===3){
            const features=L.features.filter(f=>classOf(L,f)===c);
            const bounds=layerBounds({...L,features});
            if(bounds.isValid())safeFit(bounds.pad(0.1));
            else toast('Nenhuma feição visível nesta classe para aproximar');
          }else if(e.detail===2)classClickTimer=setTimeout(()=>{
            if(row.isConnected&&S.activeId===L.id&&typeof openClassProps==='function')openClassProps(L,ci);
          },400);
        };
        row.ondblclick=e=>{
          if(e.target.closest('.eye')) return;
          e.preventDefault(); e.stopPropagation(); S.activeId=L.id;
          // Mantém o temporizador do segundo clique até confirmar ou cancelar.
        };
        list.appendChild(row);
      });
    }
  });
  /* sólidos gerados pela cubagem entram na árvore como itens próprios */
  try{ if(typeof solRenderArvore==='function') solRenderArvore(list); }catch(e){ console.warn('sol arvore',e); }
  // crs selects
  fillCRSSelect(document.getElementById('workCRS'), S.workCRS);
  const A=activeLayer();
  fillCRSSelect(document.getElementById('layerCRS'), A?A.crs:S.workCRS);
  syncSymPanel();
  if(typeof syncImgPanel==='function') syncImgPanel();   // nome/origem da ortofoto
  // se um traçado de drenagem está em andamento, o redesenho pode ter apagado o
  // temporário: reconstrói para não sumir da tela ao mexer em camadas/rasters
  if(S.tool==='dren' && S._drenBuf && S._drenBuf.length){ try{ drenRedrawTmp(); }catch(e){} }
  /* Cobre criação, remoção e troca de ordem/visibilidade que apenas renovam
     a árvore de camadas. mina3DAuto faz debounce e decide se precisa refazer
     só os vetores ou também a superfície. */
  if(S._view==='v3d'&&typeof v3Auto==='function')setTimeout(()=>v3Auto(),0);
  try{containerCountLegendSync();}catch(e){console.warn('legenda de contêineres',e);}
}
function syncSymPanel(){
  const L=activeLayer(); const box=document.getElementById('symBox');
  if(!box) return;
  box.style.display='none';           // simbologia vive no modal (duplo clique), não na lateral
  if(!L){ document.getElementById('symName').textContent='—'; return; }
  const s=L.sym;
  document.getElementById('symName').textContent=L.name;
  document.getElementById('symMode').value=s.mode;
  document.getElementById('stColor').value=s.color;
  document.getElementById('stStroke').value=s.stroke;
  document.getElementById('stHatch').value=s.hatch;
  document.getElementById('stHatchScale').value=s.hatchScale??1;
  document.getElementById('stHatchScaleRow').style.display=(L.gtype==='polygon'&&!['solid','none',''].includes(s.hatch))?'block':'none';
  document.getElementById('stWeight').value=s.weight;
  document.getElementById('stFill').value=s.fill;
  document.getElementById('stDash').value=s.dash;
  /* o valor mudou por fora: a galeria precisa remarcar e repintar com a cor e
     a espessura da camada recém-selecionada */
  const _dg=document.querySelector('#stDashGal .dsgal');
  if(_dg){ if(_dg._marca) _dg._marca(); if(_dg._repinta) setTimeout(_dg._repinta,0); }
  document.getElementById('symRamp').value=s.ramp;
  // hachura só faz sentido em polígono
  document.getElementById('stHatch').parentElement.style.display=L.gtype==='polygon'?'block':'none';
  // campos
  const numFields=L.fields.filter(f=>f.type==='N'||f.type==='F');
  const allFields=L.fields;
  const fieldSel=document.getElementById('symFieldSel');
  const opts=(s.mode==='grad'?numFields:allFields).map(f=>`<option value="${f.name}" ${f.name===s.field?'selected':''}>${f.name}</option>`).join('');
  fieldSel.innerHTML=opts||'<option value="">(sem campos)</option>';
  document.getElementById('stLabel').innerHTML='<option value="">— nenhum —</option>'+
    (String(labelCfg(L).expr||'').trim()?'<option value="__formula__" selected>ƒx Fórmula</option>':'')+
    allFields.map(f=>`<option value="${f.name}" ${!labelCfg(L).expr&&f.name===L.labelField?'selected':''}>${f.name}</option>`).join('');
  // visibilidade dos blocos
  document.getElementById('symSingle').style.display=s.mode==='single'?'block':'none';
  document.getElementById('symField').style.display=s.mode==='single'?'none':'block';
  document.getElementById('symGradOpts').style.display=s.mode==='grad'?'flex':'none';
  document.getElementById('symRamp').parentElement; // noop
  renderClassList();
}
function renderClassList(){
  const L=activeLayer(); const box=document.getElementById('classList'); if(!L){box.innerHTML='';return;}
  const s=L.sym; let html='';
  if(s.mode==='grad'){ s.classes.forEach((c,i)=>{
    html+=`<div class="classrow"><input type="color" value="${c.color}" data-ci="${i}">
      <span class="rng">${fmt(c.min)} – ${fmt(c.max)}</span><span class="n">${c.count??''}</span></div>`; }); }
  else if(s.mode==='cat'){ s.cats.forEach((c,i)=>{
    html+=`<div class="classrow"><input type="color" value="${c.color}" data-ci="${i}">
      <span class="rng">${c.value}</span><span class="n">${c.count??''}</span></div>`; }); }
  box.innerHTML=html;
  box.querySelectorAll('input[type=color]').forEach(inp=>inp.onchange=()=>{
    const i=+inp.dataset.ci,c=(s.mode==='grad'?s.classes:s.cats)[i],before=layerStyleAppearanceStamp(L,c);
    c.color=inp.value;
    if(layerStyleAppearanceStamp(L,c)!==before)window.GeoMineFeatureStyleBrush?.resetLayer(L,{predicate:f=>classOf(L,f)===c});
    drawLayer(L); refreshUI(); });
}
function fmt(v){ return (Math.abs(v)>=1000||Number.isInteger(v))?Math.round(v).toLocaleString('pt-BR'):(+v).toFixed(2); }

function classifyCore(L, mode, field, n, method, ramp){
  const s=L.sym, oldField=s.field;
  const oldCats=new Map((s.cats||[]).map(c=>[String(c.value),c]));
  s.mode=mode; s.field=field; s.ramp=ramp;
  if(!field){toast('Escolha um campo');return false;}
  if(mode==='grad'){
    n=Math.max(2,Math.min(9,n||5));
    const vals=L.features.map(f=>+f.props[field]).filter(v=>!isNaN(v)).sort((a,b)=>a-b);
    if(!vals.length){toast('Campo sem valores numéricos');return false;}
    const breaks=[];
    if(method==='quantile'){ for(let i=0;i<=n;i++){ const p=i/n*(vals.length-1); breaks.push(vals[Math.round(p)]); } }
    else { const mn=vals[0],mx=vals[vals.length-1]; for(let i=0;i<=n;i++) breaks.push(mn+(mx-mn)*i/n); }
    const cols=rampColors(ramp,n);
    s.classes=[]; for(let i=0;i<n;i++){ const min=breaks[i],max=breaks[i+1];
      const count=vals.filter(v=>v>=min&&v<=max).length;
      s.classes.push({min,max,color:cols[i],count}); }
  } else if(mode==='cat'){
    const map={}; L.features.forEach(f=>{const v=String(f.props[field]); map[v]=(map[v]||0)+1;});
    const keys=Object.keys(map); const cols=rampColors(ramp,keys.length);
    /* Regerar não pode apagar os símbolos escolhidos categoria por categoria.
       O vínculo é reaproveitado quando o campo e o valor continuam iguais,
       mas a NOVA cor precisa prevalecer — principalmente na rampa Aleatória,
       em que cada clique deve produzir outra paleta. */
    s.cats=keys.map((v,i)=>{
      const base={value:v,color:cols[i],count:map[v]}, ant=oldField===field?oldCats.get(v):null;
      if(!ant)return base;
      const corAntiga=ant.color,contornoAntigo=ant.stroke;
      const nova=Object.assign({},ant,base); // símbolo/tamanho ficam; a cor nova vence
      /* Contorno que apenas acompanhava o preenchimento continua acompanhando.
         Um contorno realmente personalizado permanece intocado. */
      if(contornoAntigo&&contornoAntigo===corAntiga)nova.stroke=base.color;
      return nova;
    });
    if(L.gtype==='point'&&window.GeoMinePointSymbols)
      window.GeoMinePointSymbols.applyToLayer(L);
  }
  window.GeoMineFeatureStyleBrush?.resetLayer(L);
  drawLayer(L); refreshUI(); renderClassList();
  try{if(typeof layoutSeVisivel==='function')layoutSeVisivel();}catch(e){}
  toast('Classificação aplicada: '+(mode==='grad'?s.classes.length:s.cats.length)+' classes');
  return true;
}
function classifyLayer(){
  const L=activeLayer(); if(!L)return;
  classifyCore(L, L.sym.mode,
    document.getElementById('symFieldSel').value,
    +document.getElementById('symClasses').value,
    document.getElementById('symMethod').value,
    document.getElementById('symRamp').value);
}
function applySym(event){
  const L=activeLayer(); if(!L)return; const s=L.sym;
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);return;}
  const before=layerStyleAppearanceStamp(L);
  s.mode=document.getElementById('symMode').value;
  s.color=document.getElementById('stColor').value;
  s.stroke=document.getElementById('stStroke').value;
  s.hatch=document.getElementById('stHatch').value;
  s.hatchScale=Math.max(.25,Math.min(8,+document.getElementById('stHatchScale').value||1));
  s.weight=+document.getElementById('stWeight').value;
  s.fill=+document.getElementById('stFill').value;
  s.dash=document.getElementById('stDash').value;
  s.ramp=document.getElementById('symRamp').value;
  L.color=s.color; L.weight=s.weight; L.fill=s.fill;
  const novoRot=document.getElementById('stLabel').value;
  if(novoRot!=='__formula__'){labelCfg(L).expr='';L._labelExprCache=null;
    L.labelField=novoRot;L.labelFields=novoRot?[novoRot]:null;}
  if(event?.currentTarget?.id==='btnApplySym'||layerStyleAppearanceStamp(L)!==before)window.GeoMineFeatureStyleBrush?.resetLayer(L);
  drawLayer(L); refreshUI();
}
document.getElementById('symMode').addEventListener('change',()=>{
  const L=activeLayer();if(!L)return;
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);syncSymPanel();return;}
  const mode=document.getElementById('symMode').value,changed=L.sym.mode!==mode;
  L.sym.mode=mode;
  if(changed){window.GeoMineFeatureStyleBrush?.resetLayer(L);drawLayer(L);refreshUI();}
  syncSymPanel();
});
document.getElementById('btnApplySym').onclick=applySym;
document.getElementById('btnClassify').onclick=classifyLayer;
['stColor','stStroke','stHatch','stHatchScale','stWeight','stFill','stDash','stLabel'].forEach(id=>{
  const el=document.getElementById(id); if(el) el.addEventListener('change',applySym); });
/* O seletor de cor do navegador só dispara 'change' ao FECHAR a paleta; com
   'input' a mudança acompanha o arrasto. Um atraso curto agrupa a enxurrada
   de eventos e cresce em camada grande, para não engasgar o redesenho. */
{
  let t=null;
  const vivo=()=>{
    const L=(typeof activeLayer==='function')?activeLayer():null;
    const n=L?(L.features||[]).length:0;
    clearTimeout(t);
    t=setTimeout(()=>{ try{ applySym(); }catch(e){} }, n>20000?400:n>4000?200:90);
  };
  ['stColor','stStroke','stHatchScale','stWeight','stFill'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.addEventListener('input',vivo); });
}
document.getElementById('stHatch').addEventListener('change',e=>{
  document.getElementById('stHatchScaleRow').style.display=['solid','none',''].includes(e.target.value)?'none':'block';
});

/* Calcular área (polígono) ou comprimento (linha) no CRS de trabalho */
document.getElementById('btnCalcArea').onclick=()=>{
  const L=activeLayer(); if(!L){toast('Sem camada ativa');return;}
  if(L.gtype==='point'){toast('Disponível para linha ou polígono');return;}
  const isArea=L.gtype==='polygon'; const fname=isArea?'AREA_M2':'COMPR_M';
  if(!L.fields.find(f=>f.name===fname)) L.fields.push({name:fname,type:'N',length:18,decimal:2});
  L.features.forEach(f=>{
    if(!f.geom){f.props[fname]=0;return;}
    const rings=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
    if(isArea){ const m=measureFeature(L,f);f.props[fname]=+(Number(m.area)||0).toFixed(2); }
    else { let Ln=0; rings.forEach(r=>{ const rp=r.map(pt=>reproj(L.crs,S.workCRS,pt[0],pt[1]));
      for(let i=1;i<rp.length;i++) Ln+=Math.hypot(rp[i][0]-rp[i-1][0],rp[i][1]-rp[i-1][1]); }); f.props[fname]=+Ln.toFixed(2); }
  });
  refreshUI(); toast(`${fname} calculado para ${L.features.length} feições`);
};

/* ---------- Fit ---------- */
function layerBounds(L){
  const meshBounds=window.GeoMineGeology?.meshViews?.layerBounds(L);
  if(meshBounds)return meshBounds;
  const b=L2.latLngBounds([]);
  L.features.forEach(f=>{ if(!f.geom||!featureVisible(L,f))return; const lls=featToLatLngs(L,f);
    const flat=L.gtype==='point'?lls:(Array.isArray(lls[0][0])?lls.flat():lls);
    flat.forEach(c=>b.extend(c));
    // O enquadramento precisa incluir também o fim de furos inclinados,
    // sem transformar suas bocas em feições de linha no modelo do projeto.
    const plan=window.GeoMineGeology?.boreholePlan?.plan(L,f);
    if(plan)plan.points.forEach(pt=>{
      const w=toWGS(L.crs,pt[0],pt[1]);
      if(w&&Number.isFinite(w[0])&&Number.isFinite(w[1]))b.extend([w[1],w[0]]);
    }); });
  return b;
}
function fitLayer(L){ const b=layerBounds(L); if(b.isValid()) safeFit(b.pad(0.1)); }
function fitAll(){ const b=L2.latLngBounds([]);
  S.layers.forEach(L=>{if(L.visible){const lb=layerBounds(L);if(lb.isValid())b.extend(lb);}});
  // rasters (MDE) e ortofoto também entram no enquadramento
  (S.rasters||[]).forEach(r=>{ if(r.visible && r.overlay && r.overlay.getBounds) b.extend(r.overlay.getBounds()); });
  if(S.img && S.img.overlay && S.img.visible!==false && S.img.overlay.getBounds) b.extend(S.img.overlay.getBounds());
  if(b.isValid()) map.fitBounds(b.pad(0.1)); }
