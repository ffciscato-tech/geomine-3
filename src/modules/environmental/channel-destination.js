/* Destino persistente da calha: substitui apenas o eixo recalculado.
   A transação mantém identidade, estilo, grupo e trechos de outros eixos. */
(function(){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const uid=prefix=>prefix+(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
const live=()=>window.GeoMineChannelLive;
const editable=L=>!L.locked&&(typeof collabCanEditLayer!=='function'||collabCanEditLayer(L,false));
const stamp=L=>JSON.stringify({features:L.features,fields:L.fields,crs:L.crs,link:L._channelLink});
const snap=L=>({L,features:L.features,fields:L.fields,link:L._channelLink,crs:L.crs});
// Calha (margens no MDT) e massa d'água (preenchimento por altura ou
// profundidade) têm destinos separados: uma nunca grava na camada da outra.
const KINDS={calha:'calha',agua:'massa d’água'};
const kindOf=mode=>mode==='auto'?'calha':'agua';
const normal=name=>String(name??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
const taken=name=>(S.layers||[]).some(L=>normal(L.name)===normal(name));
// Uma camada nova nunca repete o nome de outra já existente no projeto.
function uniqueName(name){const base=String(name).trim();let value=base,k=2;while(taken(value))value=base+' ('+(k++)+')';return value;}
function pairKind(layers){
  const declared=layers.map(L=>L._channelLink.kind).find(k=>k==='calha'||k==='agua');if(declared)return declared;
  const modes=layers.flatMap(L=>{const m=L._channelLink;return m.version===2?(m.entries||[]).map(e=>e?.options?.mode):[m.options?.mode];}).filter(Boolean);
  const kinds=[...new Set(modes.map(kindOf))];if(kinds.length===1)return kinds[0];
  // Pares anteriores podiam misturar os dois tipos: vale o nome dado na criação.
  const name=(layers.find(L=>L._channelLink.role==='polygon')||layers[0]).name||'';
  return /^(Calha estimada|Seções da calha)/.test(name)?'calha':/^(Faixa|Seções) por (altura|profundidade)/.test(name)?'agua':modes.length?kindOf(modes[0]):'calha';
}
function pairs(){
  const found=new Map();
  for(const L of S.layers||[]){const m=L._channelLink;if(!m?.id||![1,2].includes(m.version))continue;
    if(!found.has(m.id))found.set(m.id,{id:m.id,layers:[]});found.get(m.id).layers.push(L);
  }
  return [...found.values()].map(p=>{const polygon=p.layers.filter(L=>L.gtype==='polygon'&&L._channelLink.role==='polygon'),sections=p.layers.filter(L=>L.gtype==='line'&&L._channelLink.role==='sections');
    const complete=p.layers.length===2&&polygon.length===1&&sections.length===1,only=p.layers[0]._channelLink;
    // Se uma das duas camadas foi apagada, a restante continua sendo o destino:
    // a ausente é recriada na próxima geração, sem duplicar a camada em uso.
    const restorable=!complete&&p.layers.length===1&&polygon.length+sections.length===1&&only.version===2&&Array.isArray(only.entries);
    return {...p,name:polygon[0]?.name||p.layers[0].name,kind:pairKind(p.layers),updatedAt:Math.max(...p.layers.map(L=>Number(L._channelLink.updatedAt)||0)),complete,restorable,ordered:[sections[0]||null,polygon[0]||null]};}).sort((a,b)=>b.updatedAt-a.updatedAt);
}
function choose(value,kind){
  if(value==='new')return null;
  const all=pairs(),same=kind?all.filter(p=>p.kind===kind):all;
  if(value==='auto'||!value)return same.find(p=>p.complete||p.restorable)||same[0]||null;
  const pair=all.find(p=>p.id===value);if(!pair)throw Error('A camada de destino foi removida. Selecione outra ou crie uma nova camada com outro nome.');
  if(kind&&pair.kind!==kind)throw Error('“'+pair.name+'” guarda '+KINDS[pair.kind]+'. Escolha uma camada de '+KINDS[kind]+' ou crie uma nova.');
  return pair;
}
function capture(value,kind,name){
  if(value==='active'||String(value).startsWith('layer:')){
    const id=value==='active'?S.activeId:String(value).slice(6),L=S.layers.find(L=>String(L.id)===String(id));
    if(!L||L.gtype!=='polygon')throw Error('Selecione uma camada de polígonos para receber a calha.');
    if(!editable(L))throw Error('A camada de destino está bloqueada ou sem permissão de edição.');
    const pair=pairs().find(p=>p.ordered[1]===L);
    if(pair){const target=capture(pair.id);target.kind=kind;return target;}
    if(L._channelLink)throw Error('O vínculo desta camada está incompleto. Escolha outro destino.');
    return {value,kind,name:null,project:S.projectId,pair:null,layers:[null,L],stamps:[null,stamp(L)]};
  }
  let pair=choose(value,kind),fresh=null;
  if(value==='new'&&name!==undefined){
    fresh=String(name??'').trim().replace(/\s+/g,' ');
    if(!fresh)throw Error('Informe o nome da nova camada.');
    // Repetir o nome de uma camada do mesmo tipo é gravar nela, não duplicá-la.
    const same=pairs().find(p=>(!kind||p.kind===kind)&&normal(p.name)===normal(fresh));
    if(same){pair=same;fresh=null;}
    else if(taken(fresh))throw Error('Já existe uma camada chamada “'+fresh+'”. Use outro nome para criar uma nova camada.');
  }
  if(pair&&!pair.complete&&!pair.restorable)throw Error('O destino está incompleto: restaure a camada de calha ou de seções removida, ou crie uma nova camada com outro nome.');
  if(pair&&pair.layers.some(L=>!editable(L)))throw Error('Desbloqueie ou reserve as camadas de calha e de seções antes de atualizar.');
  return {value,kind:kind||null,name:fresh,project:S.projectId,pair,layers:pair?pair.ordered.slice():[],stamps:pair?pair.ordered.map(L=>L&&stamp(L)):[]};
}
function current(target){
  const all=pairs(),pair=target.pair&&all.find(p=>p.id===target.pair.id);
  return target.project===S.projectId&&!(target.value==='auto'&&!target.pair&&all.some(p=>!target.kind||p.kind===target.kind))&&
    (!target.pair||pair&&(pair.complete||pair.restorable)&&pair.ordered.every((L,i)=>L===target.layers[i]))&&
    target.layers.every((L,i)=>!L||S.layers.includes(L)&&editable(L)&&stamp(L)===target.stamps[i]);
}
function schema(features,old=[]){
  const result=old.map(f=>({...f})),known=new Set(result.map(f=>f.name));
  for(const f of features)for(const [name,value] of Object.entries(f.props||{}))if(!known.has(name)){
    const numeric=typeof value==='number'||/^(TOPO_ESQ|TOPO_DIR|Z_EIXO|Z_FUNDO|Z_REF|DESLOC_M)$/.test(name);
    result.push({name,type:numeric?'N':'C',size:numeric?18:254,dec:3});known.add(name);
  }return result;
}
function stagePair(target,pairId){
  const present=target.layers.filter(Boolean);if(!present.length)return null;
  const [sections,polygon]=target.layers;
  if(polygon&&!polygon._channelLink&&!sections){
    const link={version:2,id:pairId,kind:target.kind,entries:[]};
    return [{features:[],fields:[],link:{...link,role:'sections'}},
      {features:polygon.features.slice(),fields:(polygon.fields||[]).slice(),link:{...link,role:'polygon'}}];
  }
  if(!sections||!polygon){
    // A camada recriada recebe as mesmas receitas, sem feições: o vínculo
    // continua íntegro e os trechos da camada existente não são tocados.
    const L=present[0],own=L._channelLink,role=sections?'polygon':'sections',empty={crs:L.crs,fields:[],features:[]};
    if(own.version!==2||!Array.isArray(own.entries))throw Error('Receitas do destino inconsistentes. Não houve alteração.');
    const kept={features:L.features.slice(),fields:(L.fields||[]).slice(),link:clone(own)};
    const rebuilt={features:[],fields:[],link:{...clone(own),role,entries:own.entries.map(e=>({...clone(e),role,resultSignature:live().signature(empty,e.id)}))}};
    return sections?[kept,rebuilt]:[rebuilt,kept];
  }
  const m=polygon._channelLink;
  if(m.version===2){
    if(target.layers.some(L=>L._channelLink.version!==2||!Array.isArray(L._channelLink.entries)))throw Error('Receitas do destino inconsistentes. Não houve alteração.');
    const a=sections._channelLink.entries.map(e=>e.id).sort(),b=polygon._channelLink.entries.map(e=>e.id).sort();
    if(JSON.stringify(a)!==JSON.stringify(b)||new Set(a).size!==a.length)throw Error('As camadas de calha e seções têm receitas diferentes.');
    return target.layers.map(L=>({features:L.features.slice(),fields:(L.fields||[]).slice(),link:clone(L._channelLink)}));
  }
  // Os projetos anteriores agrupavam vários eixos em uma única receita.
  // EIXO era gravado em ordem crescente, na mesma ordem de axisKeys.
  const keys=m.axisKeys,indices=[...new Set(polygon.features.map(f=>f.props?.EIXO))].sort((a,b)=>a-b);
  if(!Array.isArray(keys)||!keys.length||indices.length!==keys.length||indices.some(x=>!Number.isInteger(x)))throw Error('Não foi possível identificar os eixos da calha antiga. Crie uma nova camada com outro nome para preservar o original.');
  const ids=keys.map(()=>uid('channel-axis-'));
  const manual=target.layers.some(L=>live().signature(L)!==L._channelLink.resultSignature);
  let sourceUnchanged=false;try{sourceUnchanged=target.layers.every(L=>live().sourceSignature(L._channelLink)===L._channelLink.sourceSignature);}catch(_){}
  return target.layers.map(L=>{
    if(JSON.stringify(L._channelLink.axisKeys)!==JSON.stringify(keys))throw Error('Vínculo antigo inconsistente entre calha e seções.');
    const features=L.features.map(f=>{const i=indices.indexOf(f.props?.EIXO);if(i<0)throw Error('A calha antiga contém um trecho não identificado. Preserve-a criando uma nova camada.');return {...f,props:{...f.props},_channelRecipeId:ids[i]};});
    const entries=keys.map((key,i)=>{const entry={...clone(L._channelLink),id:ids[i],axisKeys:[key],state:manual?'detached':L._channelLink.state};
      entry.resultSignature=live().signature({...L,features},entry.id);
      if(manual)entry.message='Trecho editado manualmente; atualização automática pausada.';
      // Preserva pendências do legado: não declara atualizado um eixo mudado.
      if(sourceUnchanged)try{entry.sourceSignature=live().sourceSignature(entry);}catch(_){}
      else if(entry.state==='ready')entry.state='pending';return entry;});
    return {features,fields:(L.fields||[]).slice(),link:{version:2,id:pairId,role:L._channelLink.role,entries}};
  });
}
function restore(before){for(const old of before){old.L.features=old.features;old.L.fields=old.fields;old.L.crs=old.crs;if(old.link)old.L._channelLink=old.link;else delete old.L._channelLink;}}
function redraw(layers){for(const L of layers)drawLayer(L);refreshUI();zApply();}
function save(v,target,automatic){
  if(!current(target))throw Error('A camada de destino mudou durante o cálculo. Gere novamente; seus dados foram preservados.');
  const present=target.layers.filter(Boolean);
  if(present.includes(v.q.L))throw Error('Escolha o eixo original, não a camada de seções gerada.');
  if(target.kind&&target.kind!==kindOf(v.q.o.mode))throw Error('O modo de delimitação mudou. Gere novamente.');
  if(target.name&&taken(target.name))throw Error('Já existe uma camada chamada “'+target.name+'”. Use outro nome para criar uma nova camada.');
  if(typeof ED!=='undefined'&&(ED.drag||ED.pend)||S.drawBuf?.length)throw Error('Conclua a edição em andamento antes de atualizar a calha.');
  if(present.some(L=>L.crs!==v.q.crs))throw Error('O CRS do destino é diferente. Escolha uma camada compatível ou crie uma nova camada.');
  const pairId=target.pair?.id||uid('channel-pair-'),kind=target.pair?.kind||target.kind||kindOf(v.q.o.mode),staged=stagePair(target,pairId),rows=v.q.rows;
  const assigned=[];
  // Os IDs não são atributos da tabela, mas garantem substituição seletiva
  // mesmo após reorganizar, filtrar ou acrescentar eixos na camada de origem.
  for(const row of rows)if(!row.f._channelAxisId){if(!editable(v.q.L))throw Error('Desbloqueie ou reserve o eixo para registrar o vínculo com o resultado.');}
  const before=present.map(snap),layersBefore=S.layers.slice(),stackBefore=S.stack?.slice(),activeBefore=S.activeId,undoBefore=S.undo.slice();
  const layers=target.layers.length?target.layers.slice():[null,null],added=[];let committed=false;
  try{
    for(const row of rows)if(!row.f._channelAxisId){row.f._channelAxisId=uid('axis-');assigned.push(row.f);}
    const keys=new Set(rows.map(row=>row.f._channelAxisId)),replaceIds=new Set();
    if(staged)for(const e of staged[1].link.entries)if(e.layerId===v.q.L.id&&e.axisKeys.some(k=>keys.has(k))){
      if(e.axisKeys.some(k=>!keys.has(k)))throw Error('A receita reúne outros eixos. Selecione-os juntos antes de atualizar.');replaceIds.add(e.id);
    }
    let manual=false;
    if(staged)for(let i=0;i<2;i++)for(const e of staged[i].link.entries)if(replaceIds.has(e.id)){
      if(e.state==='detached'&&!/desativada/.test(e.message||''))manual=true;
      if(live().signature({...(layers[i]||{crs:present[0].crs}),features:staged[i].features,fields:staged[i].fields},e.id)!==e.resultSignature)manual=true;
    }
    if(manual&&!window.confirm('Este trecho da calha foi editado manualmente. Substituir somente os trechos dos eixos selecionados pelo novo cálculo?'))return null;
    if(!current(target))throw Error('O destino mudou. Seus trechos foram preservados; gere novamente.');
    const items=rows.map(row=>{const out=v.outputs.find(o=>o.index===row.index);if(!out)throw Error('Resultado incompleto para um eixo.');const id=uid('channel-axis-');
      const part={...v,q:{...v.q,rows:[row]},outputs:[out]},specs=GeoMineChannelExtraction.buildSpecs(part);
      for(const spec of specs)spec.features=spec.features.map(f=>({...f,_channelRecipeId:id}));return {id,part,specs};});
    const next=[0,1].map(i=>{const base=staged?.[i],features=(base?.features||[]).filter(f=>!replaceIds.has(f._channelRecipeId)).concat(items.flatMap(item=>item.specs[i].features));
      return {features,fields:schema(features,base?.fields),link:{version:2,id:pairId,kind,updatedAt:Date.now(),role:i?'polygon':'sections',entries:(base?.link.entries||[]).filter(e=>!replaceIds.has(e.id))}};});
    for(let i=0;i<2;i++){
      if(layers[i]){layers[i].features=next[i].features;layers[i].fields=next[i].fields;continue;}
      const other=layers[1-i],name=target.name?(i?target.name:uniqueName('Seções — '+target.name)):
        uniqueName(!i&&other?'Seções — '+other.name:items[0].specs[i].name);
      const L=addLayer({sourceLayer:v.q.L,...items[0].specs[i],name,features:next[i].features,fields:next[i].fields});if(i){L.fill=.25;L.sym.fill=.25;}
      layers[i]=L;added.push(L);
    }
    for(let i=0;i<2;i++)layers[i]._channelLink=next[i].link;
    for(const item of items){const entries=live().attachEntry(item.part,layers,item.id);
      entries.forEach((e,i)=>{if(!automatic){e.state='detached';e.message='Atualização automática desativada.';}next[i].link.entries.push(e);});}
    // Ao substituir uma feição, não mantenha os controles de vértices sobre
    // o objeto antigo, que deixou de fazer parte da camada.
    if(typeof ED!=='undefined'&&ED.on&&layers.includes(ED.sel?.L)&&typeof edLigar==='function')edLigar(false);
    if(S.selFeat&&layers.some(L=>S.selFeat.layer===L||S.selFeat.layerId===L.id))S.selFeat=null;
    redraw(layers);
    const after=layers.map(stamp);
    undoPush({t:'channelresult',L:layers[1],project:S.projectId,layers,before,after,created:added.length===2,added,active:activeBefore});
    committed=true;return {layers,pairId,kind,updated:!!present.length,restored:!!target.pair&&present.length===1,after,replaced:replaceIds.size};
  }catch(e){
    restore(before);
    for(const L of S.layers.filter(L=>!layersBefore.includes(L)))try{if(L.llayer)map.removeLayer(L.llayer);}catch(_){}
    S.layers=layersBefore;if(stackBefore)S.stack=stackBefore;S.activeId=activeBefore;S.undo=undoBefore;
    try{redraw(before.map(o=>o.L));}catch(_){}throw e;
  }finally{
    // Em cancelamento/falha, não deixe IDs técnicos em eixos intocados.
    if(!committed)for(const f of assigned)delete f._channelAxisId;
  }
}
function undo(action){
  if(action.project!==S.projectId||action.layers.some((L,i)=>!S.layers.includes(L)||!editable(L)||stamp(L)!==action.after[i])){toast('Não foi possível desfazer: a calha mudou ou está bloqueada. As alterações atuais foram preservadas.');return false;}
  const release=live().suspend(),present=action.layers.map(snap),layersBefore=S.layers.slice(),stackBefore=S.stack?.slice(),active=S.activeId;
  // Camadas criadas pela geração saem; as que já existiam voltam ao estado anterior.
  const added=action.added||(action.created?action.layers:[]);
  try{
    if(added.length){for(const L of added)if(L.llayer)map.removeLayer(L.llayer);S.layers=S.layers.filter(L=>!added.includes(L));if(S.stack)S.stack=S.stack.filter(x=>!added.some(L=>x==='L:'+L.id));if(added.some(L=>L.id===S.activeId))S.activeId=S.layers.some(L=>L.id===action.active)?action.active:S.layers[0]?.id??null;}
    restore(action.before);
    redraw(action.layers.filter(L=>!added.includes(L)));S.undo.pop();toast('Geração da calha desfeita.');return true;
  }catch(e){restore(present);S.layers=layersBefore;if(stackBefore)S.stack=stackBefore;S.activeId=active;try{redraw(action.layers);}catch(_){}toast('Não foi possível desfazer; resultado preservado.');return false;}
  finally{release();}
}
window.GeoMineChannelDestination={pairs,capture,current,save,undo,stamp,kindOf,uniqueName,kinds:KINDS};
})();
