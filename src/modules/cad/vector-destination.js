/* Destino comum de operações vetoriais: gravação atômica e um único desfazer. */
(function(){
'use strict';
const clone=x=>x==null?x:structuredClone(x);
// Shared channel destinations own only their tagged features. Appended
// polygons stay independent; replacing a feature pauses only its recipe.
// Legacy recipes replace the whole layer and must remain protected.
const sharedChannel=L=>L?._channelLink?.version===2&&L._channelLink.role==='polygon'&&
  L.gtype==='polygon'&&Array.isArray(L._channelLink.entries);
const special=(L,append)=>!!(L._geology||L.cavaDesign||L.tinSurface||L._cava2DesignId||L._rb31Recipe||
  L._channelLink&&!sharedChannel(L));
const editable=(L,append=false)=>!!L&&!L.locked&&!special(L,append)&&(typeof collabCanEditLayer!=='function'||collabCanEditLayer(L,false));
const stamp=L=>JSON.stringify({features:L.features,fields:L.fields,crs:L.crs,gtype:L.gtype});
function mount(host,id,source,gtype,replace){
  host.replaceChildren();
  const label=document.createElement('label');label.className='field';label.htmlFor=id;label.textContent='Camada de destino';
  const select=document.createElement('select');select.id=id;select.style.width='100%';
  const layers=S.layers.filter(L=>L.gtype===gtype&&editable(L,!replace||L!==source));
  for(const L of layers){const o=document.createElement('option');o.value=String(L.id);o.textContent=(L===activeLayer()?'Camada ativa — ':'')+L.name+(L.visible===false?' · oculta no mapa':'')+(replace&&L===source?' (atualizar geometrias)':' (acrescentar resultados)');select.append(o);}
  const fresh=document.createElement('option');fresh.value='new';fresh.textContent='Criar nova camada';select.append(fresh);
  // Never silently redirect a line's buffer to an unrelated polygon layer.
  select.value=layers.includes(source)?String(source.id):layers.includes(activeLayer())?String(activeLayer().id):'new';
  const hint=document.createElement('div');hint.className='hint';
  const sync=()=>{const target=layers.find(L=>String(L.id)===select.value);hint.textContent=select.value==='new'?'Cria uma camada e preserva a origem.':replace&&target===source?'Atualiza as feições processadas, sem criar novas feições. Ctrl+Z desfaz a operação inteira.':'Acrescenta os resultados e preserva as feições existentes. Ctrl+Z desfaz a operação inteira.';};
  select.onchange=sync;host.append(label,select,hint);sync();return select;
}
function capture(value,source,gtype,replace=false){
  const target=value==='new'?null:S.layers.find(L=>String(L.id)===String(value));
  if(value!=='new'&&(!target||target.gtype!==gtype||!editable(target,!replace||target!==source)))throw Error('O destino está bloqueado, foi removido ou não aceita este tipo de geometria.');
  if(!S.layers.includes(source))throw Error('A camada de origem foi removida.');
  const sourceStamp=stamp(source);
  return {project:S.projectId,generation:window.GeoMineSessionAutosave?.state?.generation,source,sourceStamp,target,targetStamp:target===source?sourceStamp:target&&stamp(target),gtype,replace:replace&&target===source,
    channelStamp:replace&&target===source&&sharedChannel(target)?JSON.stringify(target._channelLink):undefined};
}
// Raster-derived results have no vector source. Their caller validates the
// raster and ROI; this transaction protects the project, CRS and destination.
function captureGenerated(value,gtype,{color='#2387b7'}={}){
  const target=value==='new'?null:S.layers.find(L=>String(L.id)===String(value));
  if(value!=='new'&&(!target||target.gtype!==gtype||!editable(target,true)))throw Error('O destino está bloqueado, foi removido ou não aceita este tipo de geometria.');
  return {generated:true,project:S.projectId,generation:window.GeoMineSessionAutosave?.state?.generation,workCRS:S.workCRS,
    source:null,target,targetStamp:target&&stamp(target),gtype,replace:false,color};
}
function current(q){
  if(q.project!==S.projectId||q.generation!==window.GeoMineSessionAutosave?.state?.generation)throw Error('A origem mudou durante o cálculo. Execute novamente.');
  let sourceStamp;
  if(q.generated){
    if(q.source!==null||q.workCRS!==S.workCRS)throw Error('O projeto ou o CRS mudou durante o cálculo. Execute novamente.');
  }else{
    if(!S.layers.includes(q.source))throw Error('A origem mudou durante o cálculo. Execute novamente.');
    sourceStamp=stamp(q.source);
    if(sourceStamp!==q.sourceStamp)throw Error('A origem mudou durante o cálculo. Execute novamente.');
  }
  if(q.target&&(!S.layers.includes(q.target)||!editable(q.target,!q.replace)||q.target.gtype!==q.gtype||(q.target===q.source?sourceStamp:stamp(q.target))!==q.targetStamp))throw Error('O destino mudou durante o cálculo. Execute novamente.');
  if(q.channelStamp!==undefined&&JSON.stringify(q.target?._channelLink)!==q.channelStamp)throw Error('O vínculo da camada mudou durante o cálculo. Execute novamente.');
}
function pauseEditedChannels(L,targets,outputs){
  if(!sharedChannel(L))return [];
  const geometry=f=>JSON.stringify([f.geom,!!f.multi,f.zg]),ids=new Set(targets.filter((f,i)=>geometry(f)!==geometry(outputs[i])).map(f=>f._channelRecipeId).filter(Boolean)),changes=[];
  for(const recipe of L._channelLink.entries)if(ids.has(recipe.id)){
    const before=clone(recipe);recipe.state='detached';recipe.message='Trecho editado manualmente; atualização pelo eixo pausada para preservar a geometria.';
    changes.push({id:recipe.id,before,after:JSON.stringify(recipe)});
  }
  return changes;
}
function restoreChannelEntries(L,changes){
  if(!sharedChannel(L))return;
  for(const change of changes||[]){const index=L._channelLink.entries.findIndex(e=>e.id===change.id);if(index>=0&&JSON.stringify(L._channelLink.entries[index])===change.after)L._channelLink.entries[index]=clone(change.before);}
}
function transform(g,from,to){
  if(!Array.isArray(g))throw Error('Geometria inválida.');
  if(typeof g[0]==='number'){
    const xy=from===to?g.slice(0,2):reproj(from,to,g[0],g[1]);
    if(!xy.every(Number.isFinite))throw Error('Não foi possível reprojetar a geometria para o destino.');
    return [...xy,...g.slice(2)];
  }
  return g.map(p=>transform(p,from,to));
}
// Operations replace feature objects. Keep selection by position, then rebuild
// handles against the committed geometry; closures over old rings are invalid.
function editingState(L){
  if(!L)return {};
  const s=S.selFeat,selection=s&&(s.layer===L||s.layerId===L.id)?{...s}:null;
  const editor=typeof ED!=='undefined'&&ED.sel?.L===L?{...ED.sel}:null;
  const ctx=S._vtxCtx?.L===L?S._vtxCtx:null;
  const legacy=!!ctx||!!(selection&&S.tool==='vertex');
  if(ctx&&!selection){
    const idx=L.features.indexOf(ctx.f),partIdx=ctx.f.geom.indexOf(ctx.ring);
    return {selection:idx>=0?{layer:L,layerId:L.id,idx,partIdx:Math.max(0,partIdx)}:null,editor,legacy};
  }
  return {selection,editor,legacy};
}
function refresh(L,state=editingState(L),drawOptions){
  const present=S.layers.includes(L),{selection,editor,legacy}=state;
  if(legacy){S._vtxSelPreserve=false;clearVertices();}
  if(selection||legacy){
    S.selFeat=present&&selection&&L.features[selection.idx]?{...selection,layer:L,layerId:L.id}:null;
  }
  if(editor){
    const dragging=!!ED.drag;
    ED.drag=null;ED.pend=null;ED.vi=-1;ED.ring=0;
    ED.sel=present&&L.features[editor.idx]?{L,idx:editor.idx,f:L.features[editor.idx]}:null;
    window.GeoMineVertexGuides?.end();
    if(dragging&&typeof mapaPanPadrao==='function')mapaPanPadrao();
  }
  if(S.msel?.items?.some(i=>i.layerId===L.id)&&typeof mselClear==='function')mselClear(true);
  if(present)drawLayer(L,drawOptions);
  refreshUI();zApply();
  if(legacy&&S.selFeat?.layer===L)showVertices();
  else if(editor)edRedraw();
  if(editor)edPainelSync();
  if(selection||legacy){if(typeof highlightSel==='function')highlightSel();}
  if(document.getElementById('attrPanel')?.classList.contains('open'))openAttr();
}
// Keep a reversible selection independently of the layer receiving results.
// References are resolved again on Undo: never revive a replaced feature object.
function featureRef(L,idx,f){return L?{L,idx,f:f||L.features[idx],count:L.features.length}:null;}
function resolveRef(ref){
  if(!ref||!S.layers.includes(ref.L))return null;
  const L=ref.L;let idx=L.features.indexOf(ref.f);
  if(idx<0&&ref.f?.uuid!=null)idx=L.features.findIndex(f=>f.uuid===ref.f.uuid);
  if(idx<0&&L.features.length===ref.count&&Number.isInteger(ref.idx))idx=ref.idx;
  return idx>=0&&L.features[idx]?{L,idx,f:L.features[idx]}:null;
}
function selectionState(){
  const s=S.selFeat,L=s&&(s.layer||S.layers.find(x=>x.id===s.layerId)),ed=typeof ED!=='undefined'?ED.sel:null,ctx=S._vtxCtx;
  return {active:S.activeId,selection:s?{...s}:null,selected:s?featureRef(L,s.idx):null,
    editor:ed?featureRef(ed.L,ed.idx,ed.f):null,legacy:!!ctx||!!(s&&S.tool==='vertex'),
    legacyRef:ctx?featureRef(ctx.L,ctx.L.features.indexOf(ctx.f),ctx.f):null,
    legacyPart:ctx&&ctx.f.multi?ctx.f.geom.indexOf(ctx.ring):0,
    multi:(S.msel?.items||[]).map(item=>({...item,ref:featureRef(S.layers.find(L=>L.id===item.layerId),item.idx)}))};
}
function validPart(f,part){return f.multi&&Array.isArray(f.geom?.[0]?.[0])&&Number.isInteger(part)&&part>=0&&part<f.geom.length?part:null;}
function restoreSelection(state){
  clearVertices();
  if(typeof mselClear==='function')mselClear(true);
  const selected=resolveRef(state.selected)||(state.legacy?resolveRef(state.legacyRef):null),editor=resolveRef(state.editor);
  S.selFeat=selected?{layer:selected.L,layerId:selected.L.id,idx:selected.idx,
    partIdx:validPart(selected.f,state.selection?.partIdx??state.legacyPart)}:null;
  if(typeof ED!=='undefined'){
    const dragging=!!ED.drag;ED.drag=null;ED.pend=null;ED.vi=-1;ED.ring=0;ED.sel=editor;
    window.GeoMineVertexGuides?.end();if(dragging&&typeof mapaPanPadrao==='function')mapaPanPadrao();
  }
  if(S.msel)S.msel.items=state.multi.map(item=>{const ref=resolveRef(item.ref);return ref?{layerId:ref.L.id,idx:ref.idx,partIdx:validPart(ref.f,item.partIdx)}:null;}).filter(Boolean);
  S.activeId=S.layers.some(L=>L.id===state.active)?state.active:(selected?.L.id??editor?.L.id??S.layers[0]?.id??null);
  refreshUI();zApply();
  if(state.legacy&&selected)showVertices();else if(typeof edRedraw==='function')edRedraw();
  if(typeof edPainelSync==='function')edPainelSync();
  if(S.msel?.items.length&&typeof mselHL==='function')mselHL();
  else if(typeof highlightSel==='function')highlightSel();
  if(document.getElementById('attrPanel')?.classList.contains('open'))openAttr();
}
function resultEditing(q,out,offset,outputs,targets,before){
  const selected=before.selected?.L===q.source?before.selected:before.editor?.L===q.source?before.editor:before.legacyRef?.L===q.source?before.legacyRef:null;
  const matched=selected&&targets.length===outputs.length?targets.indexOf(selected.f):-1;
  const idx=offset+Math.max(0,matched),f=out.features[idx],partIdx=matched>=0?validPart(f,before.selection?.partIdx??before.legacyPart):null;
  if(typeof mselClear==='function')mselClear(true);
  return {selection:{layer:out,layerId:out.id,idx,partIdx},
    editor:typeof ED!=='undefined'&&(ED.on||before.editor)?{L:out,idx,f}:null,
    legacy:before.legacy||S.tool==='vertex'};
}
function save(q,{features,fields=[],crs,name,targets=[]}){
  current(q);if(!features.length)throw Error('Nenhuma geometria resultante.');
  const T=q.target,to=T?.crs||crs;
  if(!crs||!to)throw Error('Defina o CRS da origem e do destino.');
  const schema=clone(T?.fields||[]),known=new Map(schema.map(f=>[f.name,f]));
  for(const f of fields){const old=known.get(f.name);if(old&&old.type!==f.type)throw Error('Campo “'+f.name+'” tem tipo diferente no destino. Escolha outra camada.');if(!old){schema.push(clone(f));known.set(f.name,f);}}
  const outputs=features.map(f=>{
    // Novas feições não herdam UUIDs nem vínculos de receitas da origem.
    const n=q.replace?clone(f):{geom:null,multi:!!f.multi,props:clone(f.props||{})};
    // Keep the extraction boundary with raster-derived thalwegs. Other
    // source recipes remain excluded from ordinary vector copies.
    if(q.generated&&f._thalweg?.version===2)n._thalweg=clone(f._thalweg);
    n.geom=transform(f.geom,crs,to);if(f.zg!==undefined)n.zg=clone(f.zg);
    for(const fd of schema)if(!(fd.name in (n.props||(n.props={}))))n.props[fd.name]=null;
    return n;
  });
  let next;
  if(q.replace){
    if(targets.length!==outputs.length||new Set(targets).size!==targets.length||targets.some(f=>!T.features.includes(f)))throw Error('As feições de origem mudaram.');
    const replaced=new Map(targets.map((f,i)=>[f,outputs[i]]));next=T.features.map(f=>replaced.get(f)||f);
  }else next=(T?.features||[]).concat(outputs);
  // Staging above is synchronous and cannot interleave with edits. The
  // initial validation already compared both full feature sets.
  const before=T&&{features:T.features,fields:T.fields,visible:T.visible},active=S.activeId,editing=editingState(T),
    selectionBefore=q.replace?null:selectionState(),release=window.GeoMineChannelLive?.suspend?.()||(()=>{});let out=T,channelEntries=[];
  try{
    if(T){T.features=next;T.fields=schema;if(q.replace)channelEntries=pauseEditedChannels(T,targets,outputs);}
    else{
      const base=name||'Resultado';let unique=base,k=2;while(S.layers.some(L=>L.name===unique))unique=base+' ('+(k++)+')';
      out=addLayer({name:unique,gtype:q.gtype,crs:to,features:next,fields:schema,color:q.source?.color??q.color});
      if(!out)throw Error('Não foi possível criar a camada.');
      if(q.source&&q.gtype===q.source.gtype)for(const k of ['sym','weight','fill','groupId','labelField','labelFields','lbl'])if(q.source[k]!==undefined)out[k]=clone(q.source[k]);
    }
    const resultState=selectionBefore?resultEditing(q,out,before?.features.length||0,outputs,targets,selectionBefore):editing;
    S.activeId=out.id;refresh(out,resultState,T&&!q.replace?{appendFrom:before.features.length,previousFeatures:before.features}:undefined);
    // Saving into an explicitly chosen hidden layer must reveal that layer,
    // without changing the visibility of its siblings in the same group.
    if(!q.replace&&out.visible===false){
      if(typeof nodeSetVis==='function')nodeSetVis({t:'L',id:out.id,o:out},true);
      else{out.visible=true;if(out.llayer?.addTo)out.llayer.addTo(map);}
      refreshUI();zApply();
    }
    undoPush({t:'vectorresult',L:out,project:S.projectId,before,after:stamp(out),active,created:!T,append:!q.replace,selectionBefore,channelEntries});return out;
  }catch(e){
    if(T){T.features=before.features;T.fields=before.fields;T.visible=before.visible;restoreChannelEntries(T,channelEntries);try{refresh(T,editing);}catch(_){}}
    else{
      // addLayer registers its model before its first draw, which may throw.
      const failed=out||S.layers.find(L=>L.features===next);
      if(failed){if(failed.llayer)map.removeLayer(failed.llayer);S.layers=S.layers.filter(L=>L!==failed);S.stack=(S.stack||[]).filter(k=>k!=='L:'+failed.id);}
    }
    S.activeId=active;
    if(selectionBefore)try{restoreSelection(selectionBefore);}catch(_){}
    throw e;
  }finally{release();}
}
function undo(a){
  const L=a.L;
  if(a.project!==S.projectId||!S.layers.includes(L)||!editable(L,a.append)||stamp(L)!==a.after){toast('Não foi possível desfazer: a camada mudou ou está bloqueada.');return false;}
  const editing=editingState(L);
  if(a.created){if(L.llayer)map.removeLayer(L.llayer);S.layers=S.layers.filter(x=>x!==L);S.stack=(S.stack||[]).filter(k=>k!=='L:'+L.id);S.activeId=S.layers.some(x=>x.id===a.active)?a.active:S.layers[0]?.id??null;}
  else{L.features=a.before.features;L.fields=a.before.fields;if('visible' in a.before)L.visible=a.before.visible;restoreChannelEntries(L,a.channelEntries);}
  refresh(L,editing);
  if(a.selectionBefore)restoreSelection(a.selectionBefore);
  S.undo.pop();toast('Operação desfeita.');return true;
}
function choose(source,gtype,replace,ok){
  let bg=document.getElementById('vectorDestModal');if(!bg){bg=document.createElement('div');bg.id='vectorDestModal';bg.className='modal-bg';bg.innerHTML='<div class="modal" style="width:min(460px,95vw)"><div class="modal-h"><b>Destino do resultado</b><button id="vectorDestClose" class="tbtn">Fechar</button></div><div class="modal-b"><div id="vectorDestHost"></div><button id="vectorDestOk" class="tbtn">Aplicar</button></div></div>';document.body.append(bg);}
  mount(document.getElementById('vectorDestHost'),'vectorDestSelect',source,gtype,replace);bg.classList.add('on');
  document.getElementById('vectorDestClose').onclick=()=>bg.classList.remove('on');
  document.getElementById('vectorDestOk').onclick=()=>{try{const q=capture(document.getElementById('vectorDestSelect').value,source,gtype,replace);bg.classList.remove('on');ok(q);}catch(e){toast(e.message);}};
}
window.GeoMineVectorDestination={mount,capture,captureGenerated,current,save,undo,choose};
})();
