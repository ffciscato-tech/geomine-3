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
/* ---------- Grupos, subgrupos e ordem de desenho ---------- */
function groupParentValue(g){
  if(Object.prototype.hasOwnProperty.call(g,'parentId'))return g.parentId;
  return g.parentGroupId??g.groupId??null;
}
function groupPath(id){
  const by=new Map((S.groups||[]).map(g=>[String(g.id),g])),out=[],seen=new Set();
  while(id!=null&&by.has(String(id))&&!seen.has(String(id))){
    seen.add(String(id));const g=by.get(String(id));out.unshift(g);id=groupParentValue(g);
  }
  return out;
}
function treeItemKey(it){return it.kind==='group'?'G:'+it.g.id:nodeKey(it.n.t,it.n.id);}
/* Uma única árvore define tanto a lista quanto a pilha do mapa. As chaves de
   TODOS os grupos preservam a posição de subgrupos vazios e recolhidos. Em
   projetos antigos, a posição do grupo deriva do primeiro descendente. */
function buildLayerTree(nodes,stack){
  const groups=S.groups||[],byGroup=new Map(groups.map(g=>[String(g.id),g]));
  for(const g of groups){
    const raw=groupParentValue(g),parent=raw==null?null:byGroup.get(String(raw));
    g.parentId=parent&&parent!==g?parent.id:null;
    delete g.parentGroupId;delete g.groupId;
  }
  // Referências órfãs e ciclos legados nunca podem ocultar parte da árvore.
  for(const g of groups){
    const seen=new Set([g.id]);let parent=byGroup.get(String(g.parentId));
    while(parent){
      if(seen.has(parent.id)){g.parentId=null;break;}
      seen.add(parent.id);parent=parent.parentId==null?null:byGroup.get(String(parent.parentId));
    }
  }
  const entries=new Map(),children=new Map([[null,[]]]);
  for(const g of groups){entries.set('G:'+g.id,{kind:'group',g,parentId:g.parentId});children.set(g.id,[]);}
  for(const n of nodes){
    const parent=n.o.groupId==null?null:byGroup.get(String(n.o.groupId));
    if(n.o.groupId!=null)n.o.groupId=parent?parent.id:null;
    const kind=n.t==='L'?'layer':n.t==='R'?'raster':'img';
    entries.set(nodeKey(n.t,n.id),{kind,n,L:n.t==='L'?n.o:undefined,r:n.t==='R'?n.o:undefined,
      img:n.t==='I'?n.o:undefined,parentId:parent?parent.id:null});
  }
  const order=[],seen=new Set();
  for(const k of Array.isArray(stack)?stack:[]){if(entries.has(k)&&!seen.has(k)){order.push(k);seen.add(k);}}
  for(const n of nodes){const k=nodeKey(n.t,n.id);if(!seen.has(k)){seen.add(k);if(n.t==='L')order.unshift(k);else order.push(k);}}
  const positions=new Map(order.map((k,i)=>[k,i]));
  for(const it of entries.values())children.get(it.parentId).push(it);
  const ranks=new Map(),groupIndex=new Map(groups.map((g,i)=>[g.id,i]));
  const rank=it=>{
    const key=treeItemKey(it);if(ranks.has(key))return ranks.get(key);
    let value=positions.get(key);
    if(value==null){
      const child=children.get(it.g.id);
      value=child.length?Math.min(...child.map(rank)):-1-groupIndex.get(it.g.id);
    }
    ranks.set(key,value);return value;
  };
  const out=[];
  const emit=(parentId,ancestors)=>{
    const siblings=children.get(parentId);siblings.sort((a,b)=>rank(a)-rank(b));
    for(const it of siblings){
      it.depth=ancestors.length;it.ancestors=ancestors;out.push(it);
      if(it.kind==='group')emit(it.g.id,ancestors.concat(it.g.id));
      it.end=out.length;
    }
  };
  emit(null,[]);return out;
}
function displayList(){const nodes=stackSync();return buildLayerTree(nodes,S.stack);}
/* A lista usa apenas nomes. A numeração continua disponível somente como
   opção explícita de plotagem, sem alterar nomes ou IDs do projeto. */
function groupNumbering(items=displayList()){
  const numbers=new Map(),counts=new Map();
  for(const it of items){if(it.kind!=='group')continue;
    const n=(counts.get(it.parentId)||0)+1;counts.set(it.parentId,n);
    const prefix=numbers.get(it.parentId);numbers.set(it.g.id,prefix!=null?prefix+'.'+n:String(n));
  }
  return numbers;
}
function groupDisplayName(g,numbers,numbered=false){
  const name=String(g.name||''),number=numbers?.get(g.id);
  return numbered&&number!=null?number+'. '+name:name;
}
/* A cor pertence à identidade do grupo, não à sua posição ou ao seu nome.
   O ângulo áureo separa os IDs consecutivos sem repetir uma paleta curta. */
function groupTreeHue(g){
  const id=String(g.id);let seed=Number(id);
  if(!Number.isSafeInteger(seed)){
    seed=0;for(let i=0;i<id.length;i++)seed=(Math.imul(seed,31)+id.charCodeAt(i))>>>0;
  }
  return ((seed*137.50776405003785+210)%360+360)%360;
}
function groupMembers(id){return displayList().filter(it=>it.n&&it.ancestors.includes(id)).map(it=>it.n);}
function toggleGroupVisibility(g){
  const members=groupMembers(g.id),shown=members.filter(n=>n.o.visible!==false);
  if(shown.length){
    g.visibilityResume=shown.map(n=>nodeKey(n.t,n.id));shown.forEach(n=>nodeSetVis(n,false));
  }else{
    const resume=new Set(Array.isArray(g.visibilityResume)?g.visibilityResume:[]);
    members.forEach(n=>{if(resume.has(nodeKey(n.t,n.id)))nodeSetVis(n,true);});
    if(!members.some(n=>n.o.visible!==false))toast('Ligue uma camada do grupo para definir o que exibir.');
    g.visibilityResume=[];
  }
  zApply();refreshUI();
}
function treeDropAllowed(kind,id,target){
  if(!target)return false;
  const key=kind==='group'?'G:'+id:id;
  if(target.key===key)return false;
  if(kind!=='group'||target.mode==='root-end')return true;
  const item=displayList().find(it=>treeItemKey(it)===target.key);if(!item)return false;
  const parentId=target.mode==='inside'&&item.kind==='group'?item.g.id:item.parentId;
  return !groupPath(parentId).some(g=>g.id===id);
}
function reorderModel(kind,id,target){
  const items=displayList(),key=kind==='group'?'G:'+id:id;
  const from=items.findIndex(it=>treeItemKey(it)===key);if(from<0)return false;
  if(typeof target==='number')target=target>=items.length?{mode:'root-end'}:{mode:'before',key:treeItemKey(items[Math.max(0,target)])};
  if(!treeDropAllowed(kind,id,target))return false;
  const source=items[from],block=items.slice(from,kind==='group'?source.end:from+1);
  const remaining=items.filter(it=>!block.includes(it));
  let parentId=null,at=remaining.length;
  if(target.mode!=='root-end'){
    at=remaining.findIndex(it=>treeItemKey(it)===target.key);if(at<0)return false;
    const dest=remaining[at];parentId=dest.parentId;
    if(target.mode==='inside'){
      if(dest.kind!=='group')return false;
      parentId=dest.g.id;dest.g.collapsed=false;
    }
    if(target.mode==='inside'||target.mode==='after'){
      at++;
      if(dest.kind==='group')while(at<remaining.length&&remaining[at].ancestors.includes(dest.g.id))at++;
    }
  }
  if(kind==='group')source.g.parentId=parentId;else source.n.o.groupId=parentId;
  remaining.splice(at,0,...block);S.stack=remaining.map(treeItemKey);
  const nodes=stackSync();S.layers=nodes.filter(n=>n.t==='L').map(n=>n.o);
  zApply();refreshUI();if(typeof layoutSeVisivel==='function')layoutSeVisivel();return true;
}
function addGroup(){
  const name=prompt('Nome do grupo:','Grupo');if(!name)return;
  const g={id:gid++,name,parentId:null,collapsed:false};
  S.groups.push(g);(S.stack=S.stack||[]).unshift('G:'+g.id);refreshUI();layoutSeVisivel();
}
function deleteGroup(g){
  const items=displayList(),parentId=g.parentId??null;
  allNodes().forEach(n=>{if(n.o.groupId===g.id)n.o.groupId=parentId;});
  S.groups.forEach(child=>{if(child.parentId===g.id)child.parentId=parentId;});
  S.groups=S.groups.filter(x=>x!==g);S.stack=items.filter(it=>it.g!==g).map(treeItemKey);
  zApply();refreshUI();layoutSeVisivel();
}
function treeRowData(el,it,di){
  el.dataset.di=di;el.dataset.treeKey=treeItemKey(it);el.dataset.depth=it.depth;
  if(it.kind==='group')el.dataset.groupId=it.g.id;
  el.style.marginLeft=(it.depth*16)+'px';
}
function treeVisibleItems(items,query){
  if(!query)return new Set(items.filter(it=>!it.ancestors.some(id=>S.groups.find(g=>g.id===id)?.collapsed)).map(treeItemKey));
  const q=query.toLocaleLowerCase('pt-BR'),matches=new Set(),byId=new Map(S.groups.map(g=>[g.id,g]));
  for(const it of items){
    const names=[it.kind==='group'?it.g.name:it.n.o.name,...it.ancestors.map(id=>byId.get(id)?.name)];
    if(names.some(name=>String(name||'').toLocaleLowerCase('pt-BR').includes(q))){
      matches.add(treeItemKey(it));it.ancestors.forEach(id=>matches.add('G:'+id));
    }
  }
  return matches;
}

/* ---------- Arraste: centro = dentro; bordas = antes/depois ---------- */
let dropIdx=null;
function clearDropInd(){document.querySelectorAll('.drop-before,.drop-after,.drop-inside,.drop-invalid').forEach(el=>el.classList.remove('drop-before','drop-after','drop-inside','drop-invalid'));}
function dragOverY(y,x,kind,id){
  const list=document.getElementById('layerList');clearDropInd();
  const bounds=list.getBoundingClientRect();if(x!=null&&(x<bounds.left||x>bounds.right))return null;
  const root=list.querySelector('.tree-root-drop');
  if(root){const r=root.getBoundingClientRect();if(y>=r.top&&y<=r.bottom){root.classList.add('drop-inside');return {mode:'root-end'};}}
  const rows=[...list.children].filter(row=>row.dataset?.treeKey);
  if(!rows.length)return {mode:'root-end'};
  let row=rows[rows.length-1],mode='after';
  for(const candidate of rows){
    const r=candidate.getBoundingClientRect();
    if(y<r.top){row=candidate;mode='before';break;}
    if(y<=r.bottom){
      row=candidate;const p=(y-r.top)/Math.max(1,r.height);
      mode=candidate.dataset.groupId!=null&&p>=.25&&p<=.75?'inside':p<.5?'before':'after';break;
    }
  }
  const target={mode,key:row.dataset.treeKey};
  if(!treeDropAllowed(kind,id,target)){row.classList.add('drop-invalid');return null;}
  row.classList.add('drop-'+mode);return target;
}
function bindDrag(el,kind,id){
  const h=el.querySelector('.drag');if(!h)return;
  h.title='Arrastar: centro do grupo para colocar dentro; bordas para reordenar';
  h.addEventListener('pointerdown',e=>{
    if(e.button!=null&&e.button!==0)return;
    e.preventDefault();e.stopPropagation();
    const list=document.getElementById('layerList');let moved=false;
    el.classList.add('dragging');list.classList.add('tree-drag-active');dropIdx=null;
    const mv=ev=>{
      if(ev.pointerId!==e.pointerId)return;
      if(Math.hypot(ev.clientX-e.clientX,ev.clientY-e.clientY)<5&&!moved)return;
      moved=true;ev.preventDefault();dropIdx=dragOverY(ev.clientY,ev.clientX,kind,id);
    };
    const finish=cancel=>{
      document.removeEventListener('pointermove',mv);document.removeEventListener('pointerup',up);
      document.removeEventListener('pointercancel',cancelPointer);document.removeEventListener('keydown',key);
      clearDropInd();el.classList.remove('dragging');list.classList.remove('tree-drag-active');
      const target=dropIdx;dropIdx=null;if(!cancel&&moved&&target)reorderModel(kind,id,target);
    };
    const up=ev=>{if(ev.pointerId===e.pointerId){if(moved)mv(ev);finish(false);}};
    const cancelPointer=ev=>{if(ev.pointerId===e.pointerId)finish(true);};
    const key=ev=>{if(ev.key==='Escape'){ev.preventDefault();finish(true);}};
    document.addEventListener('pointermove',mv,{passive:false});document.addEventListener('pointerup',up);
    document.addEventListener('pointercancel',cancelPointer);document.addEventListener('keydown',key);
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
/* MENU DO BOTÃO DIREITO (E DO TOQUE LONGO) NAS LINHAS DA ÁRVORE
   Os símbolos de ação de cada linha (cadeado, propriedades, remover) ficam à
   direita e, no painel estreito do iPad, saem da área visível. O menu traz as
   mesmas ações, cada uma com o seu símbolo, mais zoom e tabela de atributos —
   e a lixeira. Vale para camada vetorial, superfície/ortofoto e grupo. */
(function treeMenuIcons(){
  if(typeof RIB_SVG!=='object')return;
  const svg=d=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'+d+'</svg>';
  Object.assign(RIB_SVG,{
    ctx_lixeira:svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/>'),
    ctx_olho:svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    ctx_olho_off:svg('<path d="M3 3l18 18M10.6 5.1c.5-.1.9-.1 1.4-.1 6.4 0 10 7 10 7a17.600 17.600 0 0 1-3.200 4.200M6.600 6.600C3.700 8.500 2 12 2 12s3.600 7 10 7c1.700 0 3.200-.400 4.500-1.100M9.900 9.900a3 3 0 0 0 4.200 4.200"/>'),
    ctx_zoom:svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.500-3.500M8 11h6M11 8v6"/>'),
    ctx_cadeado:svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    ctx_cadeado_aberto:svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.700-1.500"/>'),
    ctx_tabela:svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>'),
    ctx_copiar:svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
    ctx_colar:svg('<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V3.500h6V5M9 11h6M9 15h4"/>'),
    ctx_engrenagem:svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M5.300 18.700l2.100-2.100M16.600 7.400l2.100-2.100"/>'),
    ctx_renomear:svg('<path d="M4 20h4L19 9l-4-4L4 16v4zM13.500 6.500l4 4"/>'),
    ctx_desagrupar:svg('<rect x="3" y="3" width="8" height="8" rx="1.500"/><rect x="13" y="13" width="8" height="8" rx="1.500"/><path d="M15 6h3v3M9 18H6v-3"/>'),
    ctx_recolher:svg('<path d="M4 6h16M4 12h10M4 18h6M18 11l3 3-3 3"/>')
  });
})();
/* O menu abre no ponto do clique/toque; pelo botão ⋮ da linha, abre sob ele. */
function treeMenuAnchor(anchor,e){
  const x=e&&Number.isFinite(e.clientX)?e.clientX:null,y=e&&Number.isFinite(e.clientY)?e.clientY:null;
  if(x==null||y==null||(!x&&!y))return anchor;
  return {getBoundingClientRect:()=>({left:x,right:x,top:y,bottom:y,width:0,height:0})};
}
const TREE_MENU_PERIGO='#e5534b';
function treeConfirmDeleteLayer(L){
  if(!S.layers.includes(L))return;
  const meshInfo=window.GeoMineGeology?.meshViews?.info(L);
  const detail=meshInfo?`${meshInfo.count.toLocaleString('pt-BR')} ${meshInfo.label}`:`${L.features.length} feições`,
    /* deleteVectorLayer registra a exclusão no desfazer: o aviso antigo ("não
       pode ser desfeita") não correspondia ao que o programa faz. */
    note=meshInfo?'Outras representações não serão alteradas. Use Desfazer para recuperar esta camada.':'Você pode desfazer com Ctrl+Z.';
  if(confirm(`Remover a camada "${L.name}" (${detail})?\n${note}`))
    deleteVectorLayer(L);
}
function treeConfirmDeleteRaster(o,isRas){
  if(isRas){
    if(!(S.rasters||[]).includes(o))return;
    if(confirm(`Remover a superfície "${o.name}" (${o.d.nc}×${o.d.nr})?\n${o.src?.kind==='cava2-clipped'?'Você pode desfazer com Ctrl+Z.':'Esta ação não pode ser desfeita.'}`)) deleteRaster(o);
  }else{
    if(S.img!==o||!confirm('Remover a ortofoto/imagem de fundo?')) return;
    if(o.overlay) map.removeLayer(o.overlay); S.img=null; refreshUI();
  }
}
function treeMenuLayer(L,anchor,e){
  if(!L||!S.layers.includes(L))return;
  S.activeId=L.id;S.selRaster=null;try{propRefresh();}catch(_){}
  const T=window.GeoMineStyleTransfer,vis=L.visible!==false;
  ribMiniMenu(treeMenuAnchor(anchor,e),L.name,[
    {ic:vis?'ctx_olho_off':'ctx_olho',nome:vis?'Ocultar camada':'Mostrar camada',run:()=>{
      if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false,true)){collabCanEditLayer(L,true,true);return;}
      nodeSetVis({t:'L',id:L.id,o:L},!vis);zApply();refreshUI();}},
    {ic:'ctx_zoom',nome:'Zoom na camada',run:()=>{if(S.layers.includes(L))fitLayer(L);}},
    {ic:L.locked?'ctx_cadeado_aberto':'ctx_cadeado',nome:L.locked?'Descongelar camada':'Congelar camada',
      desc:L.locked?'Libera a edição desta camada.':'Bloqueia a edição desta camada.',run:()=>setLayerFrozen(L,!L.locked)},
    {ic:'ctx_tabela',nome:'Tabela de atributos',run:()=>{if(!S.layers.includes(L))return;S.activeId=L.id;S.selRaster=null;refreshUI();openAttr();}},
    {sep:true},
    ...(T?[{ic:'ctx_copiar',nome:'Copiar estilo',desc:'Copia simbologia, rótulos e regras de classificação por código.',run:()=>T.copy(L)},
      {ic:'ctx_colar',nome:'Colar estilo',desc:'Aplica a aparência e cria os campos de classificação ausentes por correspondência.',run:()=>T.paste(L)}]:[]),
    {ic:'ctx_engrenagem',nome:'Propriedades da camada',run:()=>{if(S.layers.includes(L))openLayerProps(L);}},
    {sep:true},
    {ic:'ctx_lixeira',nome:'Excluir camada',cor:TREE_MENU_PERIGO,run:()=>treeConfirmDeleteLayer(L)}
  ]);
}
function treeMenuRaster(n,isRas,anchor,e){
  const o=n&&n.o,existe=()=>isRas?(S.rasters||[]).includes(o):S.img===o;
  if(!o||!existe())return;
  if(isRas&&(S.selRaster!==o||S.activeId!=null)){S.selRaster=o;S.activeId=null;try{propRefresh();}catch(_){}}
  const vis=o.visible!==false;
  ribMiniMenu(treeMenuAnchor(anchor,e),o.name||(isRas?'MDE':'ortofoto'),[
    {ic:vis?'ctx_olho_off':'ctx_olho',nome:vis?'Ocultar':'Mostrar',run:()=>{if(!existe())return;nodeSetVis(n,!vis);zApply();refreshUI();}},
    {ic:'ctx_zoom',nome:'Zoom na camada',run:()=>{if(existe()&&o.overlay&&o.overlay.getBounds)safeFit(o.overlay.getBounds());else toast('Sem extensão no mapa para aproximar');}},
    {ic:'ctx_engrenagem',nome:isRas?'Propriedades da superfície':'Propriedades da ortofoto',run:()=>{if(existe())isRas?openRasProps(o):openImgProps();}},
    {sep:true},
    {ic:'ctx_lixeira',nome:isRas?'Excluir superfície':'Excluir ortofoto',cor:TREE_MENU_PERIGO,run:()=>treeConfirmDeleteRaster(o,isRas)}
  ]);
}
function treeMenuGroup(g,anchor,e){
  if(!g||!S.groups.includes(g))return;
  const membros=groupMembers(g.id),vis=membros.some(n=>n.o.visible!==false);
  ribMiniMenu(treeMenuAnchor(anchor,e),g.name,[
    {ic:vis?'ctx_olho_off':'ctx_olho',nome:vis?'Ocultar grupo':'Mostrar grupo',run:()=>{if(S.groups.includes(g))toggleGroupVisibility(g);}},
    {ic:'ctx_recolher',nome:g.collapsed?'Expandir grupo':'Recolher grupo',run:()=>{if(!S.groups.includes(g))return;g.collapsed=!g.collapsed;refreshUI();}},
    {ic:'ctx_renomear',nome:'Renomear grupo',run:()=>{if(!S.groups.includes(g))return;const novo=prompt('Renomear grupo:',g.name);if(novo){g.name=novo;refreshUI();layoutSeVisivel();}}},
    {ic:'ctx_desagrupar',nome:'Desfazer grupo',desc:'As camadas e os subgrupos continuam no projeto, fora deste grupo.',run:()=>{
      if(S.groups.includes(g)&&confirm(`Desfazer grupo "${g.name}"? As camadas e subgrupos vão para ${g.parentId==null?'a raiz':'o grupo acima'}.`))deleteGroup(g);}},
    {sep:true},
    {ic:'ctx_lixeira',nome:'Excluir grupo e tudo o que está dentro',cor:TREE_MENU_PERIGO,run:()=>{
      if(!S.groups.includes(g))return;
      // Mesma exclusão (e mesma confirmação com a lista) da lixeira da seleção múltipla.
      const antes=new Set(S._layerMulti),ligado=S._layerMultiOn;
      S._layerMulti=new Set(['G:'+g.id]);
      try{layerMultiDelete();}
      finally{if(S.groups.includes(g)){S._layerMulti=antes;S._layerMultiOn=ligado;layerMultiSync();}}
    }}
  ]);
}
S._layerMultiOn=false; S._layerMulti=new Set();
/* Camadas são marcadas pela chave do nó (L:, R:, I:) e GRUPOS inteiros por
   'G:'+id. Marcar um grupo vale para tudo o que está dentro dele, inclusive
   subgrupos. */
function layerMultiKeysValidas(){return new Set([...allNodes().map(n=>nodeKey(n.t,n.id)),...(S.groups||[]).map(g=>'G:'+g.id)]);}
function layerMultiGrupos(){
  const ids=new Set((S.groups||[]).filter(g=>S._layerMulti.has('G:'+g.id)).map(g=>g.id));
  for(let mudou=true;mudou;){mudou=false;
    for(const g of S.groups||[])if(g.parentId!=null&&ids.has(g.parentId)&&!ids.has(g.id)){ids.add(g.id);mudou=true;}}
  return ids;
}
function layerMultiAlvos(){
  const grupos=layerMultiGrupos();
  return {grupos,nos:allNodes().filter(n=>S._layerMulti.has(nodeKey(n.t,n.id))||n.o.groupId!=null&&grupos.has(n.o.groupId))};
}
function layerMultiSync(){
  const validas=layerMultiKeysValidas();
  [...S._layerMulti].forEach(k=>{if(!validas.has(k))S._layerMulti.delete(k);});
  const b=document.getElementById('btnLayerMulti'),d=document.getElementById('btnLayerMultiDel'),alvos=layerMultiAlvos(),n=alvos.nos.length+alvos.grupos.size;
  if(b){b.style.color=S._layerMultiOn?'var(--amber)':'';b.title=S._layerMultiOn?'Sair da seleção múltipla':'Selecionar várias camadas ou grupos para excluir';}
  if(d){d.style.display=S._layerMultiOn?'':'none';d.textContent='🗑'+(n?' '+n:'');d.disabled=!n;
    d.title=n?`Excluir ${alvos.nos.length} camada(s)`+(alvos.grupos.size?` e ${alvos.grupos.size} grupo(s)`:''):'Marque camadas ou grupos para excluir';}
}
function layerMultiHTML(key,herdado){
  if(!S._layerMultiOn)return '';
  const on=S._layerMulti.has(key)||!!herdado,alvo=String(key).startsWith('G:')?'grupo inteiro':'camada';
  return `<span class="lmsel ${on?'on':''}${herdado?' herdado':''}" title="${herdado?'Incluída pelo grupo marcado':(on?'Desmarcar ':'Marcar ')+alvo}">${on?'✓':'·'}</span>`;
}
/* A linha está dentro de um grupo marcado? */
function layerMultiHerdado(it){return !!S._layerMultiOn&&(it.ancestors||[]).some(id=>S._layerMulti.has('G:'+id));}
function layerMultiHandle(key,e){
  if(!S._layerMultiOn)return false;
  if(e){e.preventDefault();e.stopPropagation();}
  if(S._layerMulti.has(key))S._layerMulti.delete(key);else S._layerMulti.add(key);
  refreshUI();return true;
}
function layerMultiDelete(){
  const {grupos,nos:escolhidas}=layerMultiAlvos();
  if(!escolhidas.length&&!grupos.size){toast('Marque uma ou mais camadas ou grupos');return;}
  const nomesGrupos=(S.groups||[]).filter(g=>grupos.has(g.id)).map(g=>g.name||'Grupo'),
    nomes=escolhidas.map(n=>n.o.name||'Imagem de fundo'),lista=(a,limite)=>a.slice(0,limite).map(n=>'• '+n).join('\n')+(a.length>limite?`\n… e mais ${a.length-limite}`:'');
  if(!confirm(`Excluir ${escolhidas.length} camada(s)`+(grupos.size?` e ${grupos.size} grupo(s)`:'')+'?\n\n'+
    (grupos.size?'Grupos (com tudo o que está dentro):\n'+lista(nomesGrupos,10)+'\n\n':'')+
    (escolhidas.length?'Camadas:\n'+lista(nomes,18)+'\n\n':'')+
    'As camadas poderão ser desfeitas individualmente com Ctrl+Z'+(grupos.size?'; os grupos não voltam.':'.')))return;
  // Uma camada desfeita depois volta para o grupo acima dos que foram excluídos.
  const sobrevivente=id=>{const vistos=new Set();while(id!=null&&grupos.has(id)&&!vistos.has(id)){vistos.add(id);id=(S.groups||[]).find(g=>g.id===id)?.parentId??null;}return id;};
  escolhidas.forEach(n=>{if(n.o.groupId!=null&&grupos.has(n.o.groupId))n.o.groupId=sobrevivente(n.o.groupId);});
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
  if(grupos.size){
    S.groups=(S.groups||[]).filter(g=>!grupos.has(g.id));
    const chaves=new Set([...grupos].map(id=>'G:'+id));
    S.stack=(S.stack||[]).filter(k=>!chaves.has(String(k)));
    try{zApply();}catch(_){}
    if(typeof layoutSeVisivel==='function')layoutSeVisivel();
  }
  refreshUI();layerMultiSync();
  toast(`${escolhidas.length} camada(s)`+(grupos.size?` e ${grupos.size} grupo(s)`:'')+' excluída(s)');
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
  try{if(typeof profSyncSources==='function')profSyncSources();}catch(e){console.warn('fontes do perfil:',e);}
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
  const q=(S._layerQuery||'').trim();
  const visibleItems=treeVisibleItems(items,q);
  items.forEach((it,di)=>{
    if(!visibleItems.has(treeItemKey(it)))return;
    if(it.kind==='group'){
      const g=it.g; const members=groupMembers(g.id);
      const allVis=members.some(n=>n.o.visible!==false);
      const keyG='G:'+g.id,herdadoG=layerMultiHerdado(it);
      const el=document.createElement('div'); el.className='grp'+(S._layerMulti.has(keyG)||herdadoG?' multi-selected':''); treeRowData(el,it,di);
      if(it.depth>0){
        el.classList.add('subgrp');el.style.setProperty('--subgroup-hue',groupTreeHue(g));
      }
      el.innerHTML=`<span class="drag" title="Arrastar">⠿</span>${layerMultiHTML(keyG,herdadoG)}
        <span class="gchev" role="button" aria-label="${g.collapsed?'Expandir grupo':'Recolher grupo'}" aria-expanded="${!g.collapsed}">${g.collapsed?'▸':'▾'}</span>
        <span class="eye ${allVis?'on':''}">${allVis?'◉':'○'}</span>
        <span class="nm">${esc(g.name)}</span><span class="cnt">${members.length}</span>
        <span class="gdel" title="Desfazer grupo">✕</span>`;
      el.querySelector('.gchev').onclick=e=>{e.stopPropagation();g.collapsed=!g.collapsed;refreshUI();};
      // Na seleção múltipla, tocar na linha do grupo marca o grupo inteiro.
      if(S._layerMultiOn)el.onclick=e=>{if(e.target.closest('.gchev,.eye,.gdel,.drag'))return;if(herdadoG){toast('Este subgrupo já está incluído pelo grupo marcado acima');return;}layerMultiHandle(keyG,e);};
      el.querySelector('.eye').onclick=e=>{e.stopPropagation();
        toggleGroupVisibility(g);};
      el.querySelector('.gdel').onclick=e=>{e.stopPropagation();
        if(confirm(`Desfazer grupo "${g.name}"? As camadas e subgrupos vão para ${g.parentId==null?'a raiz':'o grupo acima'}.`)) deleteGroup(g);};
      el.querySelector('.nm').ondblclick=()=>{const n=prompt('Renomear grupo:',g.name); if(n){g.name=n;refreshUI();layoutSeVisivel();}};
      el.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();treeMenuGroup(g,el,e);};
      bindDrag(el,'group',g.id);
      list.appendChild(el);
      return;
    }

    /* ---- raster (MDE) e ortofoto: mesmas linhas arrastáveis/agrupáveis ---- */
    if(it.kind==='raster' || it.kind==='img'){
      const n=it.n, o=n.o;
      const gg=o.groupId!=null?S.groups.find(x=>x.id===o.groupId):null;
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
      const nativeReady=isRas?!!(o.d?._img0&&o.d._W0&&o.d._H0):!!(o._img0&&o._W0&&o._H0),
        previewSize=isRas?`${o.d.nc}×${o.d.nr}`:(o._w?`${o._w}×${o._h}`:'imagem'),
        nativeSize=nativeReady?(isRas?`${o.d._W0}×${o.d._H0}`:`${o._W0}×${o._H0}`):null,
        sizeTitle=isTIN?'Triângulos da superfície':nativeReady?`Original nativo: ${nativeSize} · prévia: ${previewSize}`:isRas&&projectRasterReady(o)?'Grade nativa':!isRas&&window.GeoMineOriginalSources?.needsOrtho?.(o)===false?`Imagem completa: ${previewSize}`:`Prévia salva: ${previewSize} · TIFF nativo ainda não disponível`,
        cnt = isTIN ? (nTri?`▲ ${nTri.toLocaleString('pt-BR')}`:'TIN'):(nativeSize||previewSize);
      const el=document.createElement('div');
      const herdado=layerMultiHerdado(it);
      el.className='layer tree-column-row'+(gg?' ingrp':'')+(S._layerMulti.has(key)||herdado?' multi-selected':''); treeRowData(el,it,di);
      el.innerHTML=`<span class="tree-label"><span class="drag" title="Arrastar">⠿</span>${layerMultiHTML(key,herdado)}
        <span class="eye ${vis?'on':''}" title="Visibilidade">${vis?'◉':'○'}</span>
        ${isTIN
          ?`<span class="swatch" title="Superfície TIN — cálculos pelos triângulos" style="background:#123024;display:flex;align-items:center;justify-content:center;color:#7fe0a8;font-size:10px;font-weight:700">▲</span>`
          :`<span class="swatch" style="background:${sw}"></span>`}
        <span class="nm">${esc(o.name||(isRas?'MDE':'ortofoto'))}</span></span>
        <span class="cnt" title="${esc(sizeTitle)}">${cnt}</span>
        <span class="tree-row-actions"><span class="gset" title="${isRas?'Propriedades, resolução e curvas de nível':'Propriedades da ortofoto'}">⚙</span>
        <span class="gdel ndel" title="Remover">✕</span></span>`;
      el.querySelector('.gset').onclick=e=>{e.stopPropagation(); isRas? openRasProps(o) : openImgProps();};
      el.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();treeMenuRaster(n,isRas,el,e);};
      el.querySelector('.eye').onclick=e=>{e.stopPropagation(); nodeSetVis(n,!vis); zApply(); refreshUI();};
      el.querySelector('.ndel').onclick=e=>{e.stopPropagation();treeConfirmDeleteRaster(o,isRas);};
      const ms=el.querySelector('.lmsel');if(ms)ms.onclick=e=>layerMultiHandle(key,e);
      /* Um clique seleciona, dois abrem as propriedades, três dão zoom: a
         mesma regra das camadas vetoriais. */
      const existe=()=>isRas?(S.rasters||[]).includes(o):S.img===o;
      const acoes={
        props:()=>{ if(existe()) isRas?openRasProps(o):openImgProps(); },
        zoom:()=>{ if(existe()&&o.overlay&&o.overlay.getBounds) safeFit(o.overlay.getBounds());
          else toast('Sem extensão no mapa para aproximar'); }
      };
      el.title='Um clique: selecionar · Dois cliques: propriedades · Três cliques: zoom';
      el.onclick=e=>{ if(layerMultiHandle(key,e))return;
        // clique simples: ativa a superfície na paleta (rápido, cacheado)
        if(S.selRaster!==o||S.activeId!=null){
          S.selRaster=o; S.activeId=null;
          try{ if(typeof propRefresh==='function') propRefresh(); }catch(e){}
        }
        treeClicks(key,e,acoes);
      };
      el.ondblclick=e=>{
        if(e.target.closest('.eye,.gset,.gdel,.lmsel'))return;
        if(layerMultiHandle(key,e))return;
        e.preventDefault(); e.stopPropagation();
        treeDblClick(key,acoes);
      };
      bindDrag(el,'node',key);
      list.appendChild(el);
      return;
    }

    const L=it.L;
    const meshInfo=window.GeoMineGeology?.meshViews?.info(L);
    const g=L.groupId!=null?S.groups.find(x=>x.id===L.groupId):null;
    const s=L.sym;
    const collabLocked=typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false,true);
    const classed=(s.mode==='grad'&&s.classes.length)||(s.mode==='cat'&&s.cats.length);
    const keyL=nodeKey('L',L.id);
    const el=document.createElement('div'); el.className='layer tree-column-row'+(L.id===S.activeId?' active':'')+(g?' ingrp':'')+(S._layerMulti.has(keyL)||layerMultiHerdado(it)?' multi-selected':'');
    treeRowData(el,it,di);
    let extra='';
    if(!meshInfo && L.gtype!=='point' && L.features.length<=2000){ const t=layerTotals(L);
      extra = L.gtype==='polygon' ? `<span class="area">${fmtArea(t.area)}</span>` : `<span class="area">${fmtLen(t.comp)}</span>`; }
    el.innerHTML=`<span class="tree-label"><span class="drag" title="Arrastar">⠿</span>${layerMultiHTML(keyL,layerMultiHerdado(it))}`+
      (classed?`<span class="gchev cchev">${L.clsOpen?'▾':'▸'}</span>`:'')+
      `<span class="eye ${L.visible?'on':''}" title="Visibilidade">${L.visible?'◉':'○'}</span>
      ${L._cavaLimiteDin
        ?`<span class="swatch" title="Limite paramétrico — cópia editável que comanda a cava/pilha" style="background:#fff;border:2px dashed #7b3fd4;box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:#7b3fd4;font-size:13px;font-weight:800;line-height:1">◈</span>`
        :swatchHTML(L)}
      <span class="nm"${collabLocked?' title="Camada em edição por outra pessoa ou aberta como leitura"':''}>${esc(L.name)}</span></span>${extra}<span class="cnt"${meshInfo?' title="'+esc(meshInfo.label)+'"':''}>${meshInfo?meshInfo.count.toLocaleString('pt-BR'):L.features.length}</span>
      <button class="lfreeze mini" type="button" aria-pressed="${!!L.locked}" title="${collabLocked?'Camada em edição por outra pessoa ou aberta como leitura':L.locked?'Descongelar camada — liberar edição':'Congelar camada — bloquear edição'}" aria-label="${L.locked?'Descongelar camada':'Congelar camada'}" style="padding:0;width:24px;min-width:24px;max-width:24px;height:22px;flex:none">${L.locked||collabLocked?'🔒':'🔓'}</button>
      <span class="tree-row-actions"><button class="lstyle mini" type="button" title="Opções da camada — copiar e colar estilo" aria-label="Opções da camada" style="padding:0;width:22px;min-width:22px;height:22px;flex:none">⋮</button>
      <span class="lcfg" title="Simbologia e rótulos" style="cursor:pointer;padding:0 5px;opacity:.65">⚙</span>
      <span class="gdel ldel" title="Remover camada">✕</span></span>`;
    el.querySelector('.eye').onclick=e=>{e.stopPropagation();
      if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false,true)){collabCanEditLayer(L,true,true);return;}
      nodeSetVis({t:'L',id:L.id,o:L},!L.visible);zApply();refreshUI();};
    el.querySelector('.lfreeze').onclick=e=>{e.stopPropagation();setLayerFrozen(L,!L.locked);};
    el.querySelector('.ldel').onclick=e=>{e.stopPropagation();treeConfirmDeleteLayer(L);};
    // acesso direto às propriedades: o toque duplo continua funcionando, mas
    // não é descobrível — nada na tela indicava que ele existia
    el.querySelector('.lcfg').onclick=e=>{ e.stopPropagation();
      if(S.selFeat&&S.selFeat.layer!==L)S.selFeat=null;
      if(window.ED&&ED.sel&&ED.sel.L!==L)ED.sel=null;
      S.activeId=L.id; refreshUI(); openLayerProps(L); };
    if(classed) el.querySelector('.cchev').onclick=e=>{e.stopPropagation();L.clsOpen=!L.clsOpen;refreshUI();};
    const msL=el.querySelector('.lmsel');if(msL)msL.onclick=e=>layerMultiHandle(keyL,e);
    const acoesL={
      props:()=>{ if(S.activeId===L.id&&S.layers.includes(L))openLayerProps(L); },
      zoom:()=>{ if(S.layers.includes(L))fitLayer(L); }
    };
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
        treeClicks(keyL,e,acoesL);
    };
    el.ondblclick=e=>{
      if(e.target.closest('button,.eye,.lcfg,.ldel,.cchev,.lmsel'))return;
      if(layerMultiHandle(keyL,e))return;
      e.preventDefault(); e.stopPropagation();
      // O segundo clique já agendou as propriedades; isto cobre o navegador
      // que entrega o segundo toque só como dblclick.
      treeDblClick(keyL,acoesL);
    };
    el.querySelector('.lstyle').onclick=e=>{e.stopPropagation();treeMenuLayer(L,e.currentTarget);};
    el.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();treeMenuLayer(L,el,e);};
    bindDrag(el,'node',nodeKey('L',L.id));
    list.appendChild(el);
    // classes expandidas sob a camada (olho por classe)
    if(classed && L.clsOpen){
      const arr=s.mode==='grad'?s.classes:s.cats;
      arr.forEach((c,ci)=>{
        const on=c.vis!==false;
        const label=s.mode==='grad'?`${fmt(c.min)} – ${fmt(c.max)}`:String(c.value);
        const row=document.createElement('div');
        row.className='clsrow'+(g?' ingrp2':'');row.style.paddingLeft=(34+it.depth*16)+'px';
        row.innerHTML=`<span class="eye ${on?'on':''}">${on?'◉':'○'}</span>
          ${swatchHTML(L,c)}
          <span class="nm" title="Um clique: selecionar · Dois cliques: propriedades · Três cliques: zoom nas feições da classe" style="cursor:pointer">${esc(label)}</span><span class="cnt">${c.count??''}</span>`;
        const keyC=keyL+':classe:'+ci;
        const acoesC={
          props:()=>{ if(S.activeId===L.id&&S.layers.includes(L)&&typeof openClassProps==='function')openClassProps(L,ci); },
          zoom:()=>{
            const features=L.features.filter(f=>classOf(L,f)===c);
            const bounds=layerBounds({...L,features});
            if(bounds.isValid())safeFit(bounds.pad(0.1));
            else toast('Nenhuma feição visível nesta classe para aproximar');
          }
        };
        row.querySelector('.eye').onclick=e=>{e.stopPropagation();
          clearTimeout(TREE_CLICKS.timer);
          c.vis=!on; drawLayer(L); refreshUI();};
        // Aguarda o terceiro clique antes de abrir o modal que cobriria a árvore.
        row.onclick=e=>{
          e.stopPropagation();S.activeId=L.id;S.selRaster=null;
          if(S.selFeat&&S.selFeat.layer!==L)S.selFeat=null;
          if(window.ED&&ED.sel&&ED.sel.L!==L){ED.sel=null;try{edRedraw();edPainelSync();}catch(_){}}
          list.querySelectorAll('.layer.active').forEach(x=>x.classList.remove('active'));
          el.classList.add('active');
          try{if(typeof propRefresh==='function')propRefresh();}catch(_){}
          treeClicks(keyC,e,acoesC);
        };
        row.ondblclick=e=>{
          if(e.target.closest('.eye')) return;
          e.preventDefault(); e.stopPropagation(); S.activeId=L.id;
          treeDblClick(keyC,acoesC);
        };
        list.appendChild(row);
      });
    }
  });
  /* sólidos gerados pela cubagem entram na árvore como itens próprios */
  try{ if(typeof solRenderArvore==='function') solRenderArvore(list); }catch(e){ console.warn('sol arvore',e); }
  const rootDrop=document.createElement('div');rootDrop.className='tree-root-drop';
  rootDrop.textContent='Solte aqui para mover à raiz';list.appendChild(rootDrop);
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
/* Cliques nas linhas da árvore: 1 seleciona, 2 abre as propriedades, 3 dá zoom.
   A contagem é própria. Não depende de e.detail, porque no iPad cada toque pode
   chegar como clique simples, nem do elemento da linha, que refreshUI recria a
   qualquer momento: o estado fica aqui, guardado pela chave da linha. */
const TREE_CLICKS={key:null,n:0,at:0,timer:0,janela:450};
function treeClicks(key,e,acoes,minimo){
  const agora=Date.now(), mesma=TREE_CLICKS.key===key, seguido=mesma&&agora-TREE_CLICKS.at<TREE_CLICKS.janela;
  let n=seguido?TREE_CLICKS.n+1:1;
  if(mesma&&e&&e.detail>n&&e.detail<=3)n=e.detail;   // duplo clique lento que o sistema ainda contou
  if(minimo&&n<minimo)n=minimo;
  if(n>3)n=1;
  clearTimeout(TREE_CLICKS.timer);
  TREE_CLICKS.key=key;TREE_CLICKS.n=n;TREE_CLICKS.at=agora;
  if(n===3)acoes.zoom();
  // Espera o possível terceiro clique antes de abrir a janela de propriedades.
  else if(n===2)TREE_CLICKS.timer=setTimeout(()=>{
    if(TREE_CLICKS.key===key&&TREE_CLICKS.n===2)acoes.props();
  },TREE_CLICKS.janela);
  return n;
}
/* Navegadores que entregam o segundo toque só como dblclick, sem click. */
function treeDblClick(key,acoes){
  if(TREE_CLICKS.key===key&&TREE_CLICKS.n>=2&&Date.now()-TREE_CLICKS.at<TREE_CLICKS.janela)return;
  treeClicks(key,null,acoes,2);
}
function fitLayer(L){ const b=layerBounds(L); if(b.isValid()) safeFit(b.pad(0.1)); }
function fitAll(){ const b=L2.latLngBounds([]);
  S.layers.forEach(L=>{if(L.visible){const lb=layerBounds(L);if(lb.isValid())b.extend(lb);}});
  // rasters (MDE) e ortofoto também entram no enquadramento
  (S.rasters||[]).forEach(r=>{ if(r.visible && r.overlay && r.overlay.getBounds) b.extend(r.overlay.getBounds()); });
  if(S.img && S.img.overlay && S.img.visible!==false && S.img.overlay.getBounds) b.extend(S.img.overlay.getBounds());
  if(b.isValid()) map.fitBounds(b.pad(0.1)); }
