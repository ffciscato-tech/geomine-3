/* Copiar ou mover feições para outra camada (clique direito, menu da feição ou
   seleção múltipla). As feições entram numa camada existente do mesmo tipo, ou
   numa nova com nome próprio. Copiar não altera a origem; mover retira dela as
   feições (ou só as partes selecionadas). Um único Ctrl+Z desfaz tudo. */
(function(){
'use strict';
const $=id=>document.getElementById('fcopy'+id);
const TYPES={point:'pontos',line:'linhas',polygon:'polígonos'};
const MODES={copy:{title:'Copiar para outra camada',verb:'Copiar',done:['copiada','copiadas'],suffix:'cópia'},
  move:{title:'Mover para outra camada',verb:'Mover',done:['movida','movidas'],suffix:'movidas'}};
let pending=null,lastTarget=null,suggested='';
const editable=L=>!L.locked&&(typeof collabCanEditLayer!=='function'||collabCanEditLayer(L,false));
// Geologia, cava, TIN e rampas têm editores próprios e metadados obrigatórios.
const special=L=>!!(L._geology||L.cavaDesign||L.tinSurface||L._cava2DesignId||L._rb31Recipe);
const normal=s=>String(s??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
const taken=name=>S.layers.some(L=>normal(L.name)===normal(name));
const plain=x=>x==null?x:JSON.parse(JSON.stringify(x));
function uniqueName(name){const base=String(name).trim();let value=base,k=2;while(taken(value))value=base+' ('+(k++)+')';return value;}
// Agrupa as referências por feição; partes selecionadas viram uma só cópia.
function resolve(refs){
  const found=new Map();
  for(const r of refs||[]){
    const L=S.layers.find(x=>x.id===r.layerId),f=L?.features?.[r.idx];if(!f?.geom)continue;
    const key=L.id+':'+r.idx;if(!found.has(key))found.set(key,{L,f,whole:false,parts:new Set()});
    const item=found.get(key);if(Number.isInteger(r.partIdx))item.parts.add(r.partIdx);else item.whole=true;
  }
  return [...found.values()];
}
const partial=item=>!item.whole&&item.parts.size>0&&item.f.multi;
function piece(item){
  const {f}=item;
  if(!partial(item))return {geom:f.geom,multi:!!f.multi,zg:f.zg};
  const keep=[...item.parts].filter(i=>i>=0&&i<f.geom.length).sort((a,b)=>a-b);
  if(!keep.length)return {geom:f.geom,multi:!!f.multi,zg:f.zg};
  return {geom:keep.map(i=>f.geom[i]),multi:true,zg:Array.isArray(f.zg)&&f.zg.length===f.geom.length?keep.map(i=>f.zg[i]):undefined};
}
// O que sobra na origem ao mover: nada (feição inteira) ou as partes não selecionadas.
function remainder(item){
  if(!partial(item))return null;
  const {f}=item,keep=f.geom.map((_,i)=>i).filter(i=>!item.parts.has(i));
  if(!keep.length)return null;
  const after={...f,geom:keep.map(i=>f.geom[i])};
  if(Array.isArray(f.zg)&&f.zg.length===f.geom.length)after.zg=keep.map(i=>f.zg[i]);
  return after;
}
function converter(from,to){
  if(String(from)===String(to))return null;
  if(!from||!to)throw Error('Defina o CRS das camadas de origem e de destino antes de continuar.');
  try{return proj4(from,to);}catch(_){throw Error('Não foi possível converter de '+from+' para '+to+'.');}
}
function transform(g,convert){
  if(!Array.isArray(g))return g;
  if(typeof g[0]==='number'){
    if(!convert)return g.slice();
    const xy=convert.forward([g[0],g[1]]);if(!xy.every(Number.isFinite))throw Error('Coordenada inválida ao reprojetar a feição.');
    return [xy[0],xy[1],...g.slice(2)];
  }
  return g.map(p=>transform(p,convert));
}
function sources(){return pending?[...new Set(pending.items.map(item=>item.L))]:[];}
// Mover altera a origem: ela precisa aceitar edição e não pode ser um resultado vinculado.
function checkMoveSources(list){
  for(const L of list){
    if(special(L)||L._channelLink)throw Error('“'+L.name+'” é gerada por uma ferramenta própria: use Copiar para levar as feições sem alterá-la.');
    if(!editable(L)){if(typeof collabCanEditLayer==='function')collabCanEditLayer(L,true);throw Error('Desbloqueie ou reserve a camada “'+L.name+'” antes de mover.');}
  }
}
function missingFields(T){
  const known=new Set((T?.fields||[]).map(f=>normal(f.name))),out=[];
  for(const L of sources())for(const f of L.fields||[])if(!known.has(normal(f.name))){known.add(normal(f.name));out.push({...f});}
  return out;
}
function props(fields,f){
  const out={};for(const fd of fields)out[fd.name]=fd.type==='N'||fd.type==='F'?0:'';
  const names=new Map(fields.map(fd=>[normal(fd.name),fd.name]));
  for(const [k,v] of Object.entries(f.props||{})){const name=names.get(normal(k));if(name!==undefined)out[name]=plain(v);}
  return out;
}
function targets(){
  // Mesma ordem da árvore de camadas (topo primeiro).
  let order=S.layers;try{if(typeof stackSync==='function')order=stackSync().filter(n=>n.t==='L'&&n.o).map(n=>n.o);}catch(_){}
  const from=new Set(sources());
  return order.filter(L=>L.gtype===pending.gtype&&!from.has(L)&&!special(L)&&editable(L));
}
function describe(){
  const n=pending.items.length,names=sources().map(L=>'“'+L.name+'”').join(', ');
  return (n===1?'1 feição':n+' feições')+' de '+names+' ('+TYPES[pending.gtype]+'). '+
    (pending.mode==='move'?'Elas saem da origem e entram no destino.':'A origem não é alterada.');
}
function fieldsHint(){
  const value=$('Target').value,T=S.layers.find(L=>String(L.id)===value);
  if(value==='new')return 'A nova camada recebe todos os campos da origem.';
  if(!T)return '';
  const missing=missingFields(T).map(f=>f.name),common=(T.fields||[]).filter(fd=>sources().some(L=>(L.fields||[]).some(s=>normal(s.name)===normal(fd.name)))).map(f=>f.name);
  $('FieldsRow').hidden=!missing.length;
  return (common.length?'Atributos levados pelo nome do campo: '+common.join(', ')+'.':'Nenhum campo em comum: as feições entram com os atributos do destino vazios.')+
    (missing.length?' Sem campo no destino: '+missing.join(', ')+($('Fields').checked?' (serão criados).':' (não levados).'):'');
}
function ui(){
  /* A janela fechada continua no documento, e o clique em qualquer ícone da
     faixa ajusta todos os seletores para a camada ativa (commandUseActive),
     disparando change aqui. Sem operação em andamento não há o que refazer. */
  if(!pending)return;
  const fresh=$('Target').value==='new',input=$('Name');
  $('NewBox').hidden=!fresh;
  if(fresh){$('FieldsRow').hidden=true;if(!input.value.trim()||input.value===suggested){suggested=uniqueName(sources()[0].name+' — '+MODES[pending.mode].suffix);input.value=suggested;}}
  $('FieldsHint').textContent=fieldsHint();$('Status').textContent='';
}
function ensure(){
  if($('Modal'))return;
  const bg=document.createElement('div');bg.id='fcopyModal';bg.className='modal-bg';
  bg.innerHTML=`<style>#fcopyModal [hidden]{display:none!important}#fcopyModal label.field{display:block;margin-top:10px}#fcopyModal input[type=text],#fcopyModal select{width:100%}#fcopyStatus:empty{display:none}#fcopyStatus{margin-bottom:6px;overflow-wrap:anywhere}</style>
  <div class="modal" style="width:min(480px,96vw);max-height:90dvh;display:flex;flex-direction:column">
  <div class="modal-h"><b id="fcopyTitle">Copiar para outra camada</b><div style="flex:1"></div><button class="tbtn" id="fcopyClose">Fechar</button></div>
  <div class="modal-b" style="overflow:auto;min-height:0">
  <div id="fcopySummary" class="hint"></div>
  <label class="field" for="fcopyTarget">Camada de destino</label><select id="fcopyTarget"></select>
  <div id="fcopyNewBox" hidden><label class="field" for="fcopyName">Nome da nova camada</label><input id="fcopyName" type="text" maxlength="120" autocomplete="off"></div>
  <label id="fcopyFieldsRow" style="display:flex;gap:10px;margin-top:12px" hidden><input type="checkbox" id="fcopyFields" style="width:auto"><span>Criar no destino os campos que faltam</span></label>
  <div id="fcopyFieldsHint" class="hint" style="margin-top:6px"></div>
  </div><div style="padding:10px 12px;border-top:1px solid var(--border);flex:none"><div id="fcopyStatus" class="hint" role="status" aria-live="polite"></div>
  <div style="display:flex;gap:8px"><button class="tbtn" id="fcopyCommit" style="flex:1;background:var(--amber);color:#18130a">Copiar</button><button class="tbtn" id="fcopyCancel">Cancelar</button></div></div></div>`;
  document.body.append(bg);
  const close=()=>{$('Modal').classList.remove('on');pending=null;$('Target').replaceChildren();};
  $('Close').onclick=close;$('Cancel').onclick=close;$('Commit').onclick=commit;
  $('Target').onchange=ui;$('Fields').onchange=ui;
}
function open(refs,mode='copy'){
  try{
    if(!MODES[mode])mode='copy';
    const items=resolve(refs);if(!items.length)throw Error('Selecione uma feição no mapa.');
    const gtypes=[...new Set(items.map(item=>item.L.gtype))];
    if(gtypes.length>1)throw Error('Selecione feições de um mesmo tipo (pontos, linhas ou polígonos) para levar juntas.');
    if(!TYPES[gtypes[0]])throw Error('Este tipo de camada não pode ser copiado nem movido.');
    if(mode==='move')checkMoveSources([...new Set(items.map(item=>item.L))]);
    if(typeof closeFeatMenu==='function')closeFeatMenu();
    ensure();pending={refs:(refs||[]).map(r=>({...r})),items,gtype:gtypes[0],mode};
    $('Title').textContent=MODES[mode].title;$('Commit').textContent=MODES[mode].verb;
    const select=$('Target'),list=targets();select.replaceChildren();
    for(const L of list)select.append(new Option(L.name,L.id));
    select.append(new Option('Nova camada…','new'));
    select.value=list.some(L=>L.id===lastTarget)?String(lastTarget):list.length?String(list[0].id):'new';
    // Na sala, só a camada reservada por você aceita edição (a reserva segue a camada ativa).
    let room=false;try{room=!!window.GeoMineCollaboration?.snapshot?.()?.roomId;}catch(_){}
    $('Summary').textContent=describe()+(list.length?'':' Não há outra camada de '+TYPES[pending.gtype]+' editável: crie uma nova.')+
      (room?' Na sala de colaboração, só aparecem camadas reservadas por você: ative a camada de destino para reservá-la.':'');
    $('Name').value='';suggested='';$('Fields').checked=false;ui();
    $('Modal').classList.add('on');
  }catch(e){toast(e.message||String(e));}
}
function commit(){
  try{
    if(!pending)return;
    const move=pending.mode==='move',items=resolve(pending.refs);
    if(items.length!==pending.items.length||items.some((item,i)=>item.f!==pending.items[i].f))throw Error('A seleção mudou. Feche e tente novamente.');
    if(typeof ED!=='undefined'&&(ED.drag||ED.pend)||S.drawBuf?.length)throw Error('Conclua o desenho ou a edição em andamento antes de continuar.');
    if(move)checkMoveSources(sources());
    const value=$('Target').value,fresh=value==='new';let T=null,name='';
    if(fresh){
      name=$('Name').value.trim().replace(/\s+/g,' ');
      if(!name)throw Error('Informe o nome da nova camada.');
      if(taken(name))throw Error('Já existe uma camada chamada “'+name+'”. Escolha-a na lista ou use outro nome.');
    }else{
      T=S.layers.find(L=>String(L.id)===value);
      if(!T)throw Error('A camada de destino foi removida. Escolha outra.');
      if(T.gtype!==pending.gtype||special(T)||sources().includes(T))throw Error('A camada de destino não aceita estas feições.');
      if(!editable(T)){if(typeof collabCanEditLayer==='function')collabCanEditLayer(T,true);throw Error('Desbloqueie ou reserve a camada “'+T.name+'” antes de continuar.');}
    }
    const from=sources(),crs=T?T.crs:(new Set(from.map(L=>String(L.crs))).size===1?from[0].crs:S.workCRS);
    const fields=T?(T.fields||[]).map(f=>({...f})).concat($('Fields').checked?missingFields(T):[]):missingFields(null);
    // Tudo é preparado antes de alterar o projeto: uma falha não deixa resultado parcial.
    const feats=items.map(item=>{const p=piece(item),feat={geom:transform(p.geom,converter(item.L.crs,crs)),multi:p.multi,props:props(fields,item.f)};
      if(p.zg!==undefined&&p.zg!==null)feat.zg=plain(p.zg);return feat;});
    const start=T?T.features.length:0;feats.forEach((f,i)=>{if(Object.prototype.hasOwnProperty.call(f.props,'FID'))f.props.FID=start+i;});
    const removed=move?from.map(L=>({L,ops:items.filter(item=>item.L===L).map(item=>({idx:L.features.indexOf(item.f),before:item.f,after:remainder(item)}))
      .filter(op=>op.idx>=0).map(op=>({...op,whole:!op.after}))})):[];
    let created=false,before=null;
    if(T){before=T.fields;T.fields=fields;T.features.push(...feats);}
    else{T=addLayer({name,gtype:pending.gtype,crs,fields,features:feats});created=true;}
    if(move){
      if(typeof ED!=='undefined'&&ED.on&&from.includes(ED.sel?.L)&&typeof edLigar==='function')edLigar(false);
      // Do maior índice para o menor: as posições das demais feições não mudam.
      for(const s of removed){for(const op of s.ops.slice().sort((a,b)=>b.idx-a.idx)){if(op.whole)s.L.features.splice(op.idx,1);else s.L.features[op.idx]=op.after;}drawLayer(s.L);}
      undoPush({t:'featmove',L:T,feats,fields:before,created,sources:removed});
    }else undoPush(created?{t:'featadd',L:T,feats,created:true}:{t:'featadd',L:T,feats,fields:before});
    drawLayer(T);lastTarget=T.id;S.activeId=T.id;
    if(typeof mselClear==='function'&&S.msel?.items?.length)mselClear(true);
    if(feats.length===1){S.selFeat={layer:T,layerId:T.id,idx:T.features.indexOf(feats[0])};}
    else{S.selFeat=null;S.msel.items=feats.map(f=>({layerId:T.id,idx:T.features.indexOf(f)}));try{mselHL();mselCount();}catch(_){}}
    refreshUI();if(typeof zApply==='function')zApply();try{highlightSel();}catch(_){}
    $('Modal').classList.remove('on');$('Target').replaceChildren();const done=MODES[pending.mode].done;pending=null;
    toast((feats.length===1?'1 feição '+done[0]:feats.length+' feições '+done[1])+' para “'+T.name+'” — Ctrl+Z desfaz');
  }catch(e){const msg=e.message||String(e);$('Status').textContent=msg;toast(msg);}
}
window.GeoMineFeatureCopy={open,move:refs=>open(refs,'move'),commit,targets:()=>pending?targets():[],
  // usados também pela área de transferência (Copiar/Colar)
  helpers:{resolve,piece,transform,converter,props,plain,editable,special}};
})();
