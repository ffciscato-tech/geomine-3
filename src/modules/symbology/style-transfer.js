/* Estilo e classificações derivadas: associação por chave, nunca pela ordem das feições. */
(function(){
'use strict';
const clone=v=>v===undefined?undefined:structuredClone(v),own=(o,k)=>Object.prototype.hasOwnProperty.call(o||{},k);
const styleKeys=['sym','color','weight','fill','labelField','labelFields','lbl'];
const fieldName=f=>typeof f==='string'?f:f?.name;
const safe=n=>typeof n==='string'&&n.length>0&&!['__proto__','prototype','constructor'].includes(n);
const fold=n=>String(n).trim().toLocaleLowerCase('pt-BR');
const empty=v=>v==null||v==='';
function fields(L){return (L.fields||[]).map(f=>typeof f==='string'?{name:f,type:'C'}:clone(f)).filter(f=>f&&safe(f.name));}
function resolve(schema,name){const exact=schema.find(f=>f.name===name);if(exact)return exact.name;const matches=schema.filter(f=>fold(f.name)===fold(name));return matches.length===1?matches[0].name:null;}
function editable(L){return !!L&&S.layers.includes(L)&&!L.locked&&(typeof collabCanEditLayer!=='function'||collabCanEditLayer(L,false));}
function copy(L){
 if(!L?.sym)return false;
 const schema=fields(L),names=new Set(schema.map(f=>f.name));
 const required=[...new Set([L.sym.mode==='single'?null:L.sym.field,L.labelField,...(L.labelFields||[])].filter(n=>safe(n)&&!n.startsWith('$')))];
 for(const name of required)if(!names.has(name)){schema.push({name,type:'C'});names.add(name);}
 // Snapshot scalar attributes only. Geometry and feature identities never enter the clipboard.
 const rows=(L.features||[]).map(f=>Object.fromEntries(schema.map(({name})=>{const v=f.props?.[name];return [name,v==null||['string','number','boolean'].includes(typeof v)?v:null];})));
 const c={version:2,sourceId:L.id,sourceName:L.name,gtype:L.gtype,fields:schema,required,rows};
 for(const k of styleKeys)c[k]=clone(L[k]);
 S._layerStyleClipboard=c;toast('Estilo e classificação copiados de “'+L.name+'”.');try{propRefresh();}catch(_){}return true;
}
function keyValue(v,numeric){
 if(empty(v)||!['string','number','boolean'].includes(typeof v))return null;
 if(numeric){const s=String(v).trim();if(!s)return null;const n=Number(s);return Number.isFinite(n)?'n:'+n:null;}
 return typeof v==='boolean'?'b:'+v:'s:'+String(v).trim();
}
function missing(L,c){const schema=fields(L);return (c.required||[]).filter(n=>!resolve(schema,n));}
function rule(L,c,sourceKey,destKey,needed){
 const schema=fields(L),sf=c.fields.find(f=>f.name===sourceKey),df=schema.find(f=>f.name===destKey);
 if(!sf||!df||needed.includes(sourceKey))return {ok:false,error:'Escolha um campo de código presente nas duas camadas.'};
 const numeric=['N','F'].includes(sf.type)||['N','F'].includes(df.type),map=new Map();let conflict=false;
 for(const row of c.rows){const key=keyValue(row[sourceKey],numeric);if(key===null)continue;
  const values=needed.map(n=>row[n]??null);if(values.every(empty))continue;
  if(map.has(key)&&JSON.stringify(map.get(key).values)!==JSON.stringify(values)){conflict=true;break;}
  map.set(key,{code:row[sourceKey],values});
 }
 if(conflict)return {ok:false,error:'Um mesmo código da origem tem classificações diferentes. Escolha outro campo de correspondência.'};
 if(!map.size)return {ok:false,error:'O campo não oferece uma correspondência preenchida na origem.'};
 let matched=0,unmatched=0;for(const f of L.features||[]){if(map.has(keyValue(f.props?.[destKey],numeric)))matched++;else unmatched++;}
 if(!matched)return {ok:false,error:'Nenhum código do destino corresponde aos códigos da origem.'};
 return {ok:true,sourceKey,destKey,numeric,map,matched,unmatched};
}
function candidates(L,c,needed){
 const schema=fields(L),out=[];
 for(const sf of c.fields||[]){const dest=resolve(schema,sf.name);if(!dest||needed.includes(sf.name))continue;const q=rule(L,c,sf.name,dest,needed);if(q.ok)out.push(q);}
 return out;
}
function automatic(L,c,needed){
 const choices=candidates(L,c,needed);
 // The requested STRICH/ESTRICH code is authoritative when unambiguous.
 const codes=choices.filter(q=>['strich','estrich'].includes(fold(q.sourceKey)));
 if(codes.length===1)return codes[0];
 // Do not guess a join from arbitrary IDs or coincidental row numbering.
 const repeated=choices.filter(q=>q.map.size>1&&q.map.size<c.rows.length&&!/^(fid|id|objectid|ogc_fid|gid)$/i.test(q.sourceKey));
 return repeated.length===1?repeated[0]:null;
}
function view(L){return Object.fromEntries(styleKeys.map(k=>[k,clone(L[k])]));}
function stamp(L){return JSON.stringify([view(L),L.fields,(L.features||[]).map(f=>[f.props,f._featureStyle])]);}
function refresh(L){
 drawLayer(L);refreshUI();
 // Colagem pelo menu e Ctrl+Z também precisam atualizar a janela aberta:
 // a próxima edição do rótulo não pode regravar os valores antigos dela.
 if(typeof lpLayer!=='undefined'&&lpLayer===L&&document.getElementById('lpModal')?.classList.contains('on'))lpFillLabels(L);
 if(document.getElementById('attrPanel')?.classList.contains('open')&&S.activeId===L.id)openAttr();
 try{layoutSeVisivel();}catch(_){}
 window.GeoMineSessionAutosave?.markDirty('estilo e classificação colados');
}
function apply(L,c,q){
 if(!editable(L))throw Error('A camada de destino está congelada ou sem permissão de edição.');
 if(c.gtype!==L.gtype)throw Error('Origem e destino precisam ter o mesmo tipo de geometria.');
 const needed=missing(L,c);if(needed.length&&!q?.ok)throw Error('Defina a correspondência dos atributos antes de colar.');
 // Recompute from live destination rows, so a dialog cannot apply a stale join.
 if(needed.length){q=rule(L,c,q.sourceKey,q.destKey,needed);if(!q.ok)throw Error(q.error);}
 const schema=fields(L),nextFields=clone(L.fields||[]),before={style:view(L),fields:L.fields,props:[],
  featureStyles:(L.features||[]).filter(f=>own(f,'_featureStyle')).map(f=>({f,value:clone(f._featureStyle)}))};
 for(const name of needed){const f=clone(c.fields.find(f=>f.name===name)||{name,type:'C'});nextFields.push(f);}
 const nextProps=[];
 for(const f of L.features||[]){if(!needed.length)break;const values=q.map.get(keyValue(f.props?.[q.destKey],q.numeric))?.values;
  const props={...f.props};for(let i=0;i<needed.length;i++){
   // Undeclared but existing attributes are data too: never overwrite them.
   if(!own(props,needed[i]))props[needed[i]]=values?clone(values[i]):null;
  }
  before.props.push({f,props:f.props});nextProps.push({f,props});
 }
 const next=view(c),rename=n=>resolve(schema,n)||n;
 if(next.sym?.field)next.sym.field=rename(next.sym.field);
 if(next.labelField)next.labelField=rename(next.labelField);
 if(Array.isArray(next.labelFields))next.labelFields=next.labelFields.map(rename);
 if(L.gtype==='point'&&next.lbl)next.lbl.unique=false;
 try{
  L.fields=nextFields;for(const p of nextProps)p.f.props=p.props;Object.assign(L,next);
  const classes=L.sym.mode==='cat'?L.sym.cats:L.sym.mode==='grad'?L.sym.classes:null;
  if(classes){for(const cl of classes)cl.count=0;for(const f of L.features||[]){const cl=classOf(L,f);if(cl)cl.count++;}}
  window.GeoMineFeatureStyleBrush?.resetLayer(L);
  refresh(L);undoPush({t:'layerstyletransfer',project:S.projectId,L,before,after:stamp(L)});
 }catch(e){Object.assign(L,before.style);L.fields=before.fields;for(const p of before.props)p.f.props=p.props;
  for(const p of before.featureStyles)p.f._featureStyle=p.value;try{refresh(L);}catch(_){}throw e;}
 const msg='Estilo colado em “'+L.name+'”'+(needed.length?' · '+needed.join(', ')+' criada(s): '+q.matched+' correspondências'+(q.unmatched?' · '+q.unmatched+' sem correspondência (valor vazio)':''):'')+'. Ctrl+Z desfaz.';
 toast(msg);try{cmdLog(msg,'ok');}catch(_){}return true;
}
function undo(a){
 if(a.project!==S.projectId||!editable(a.L)||stamp(a.L)!==a.after){toast('Não foi possível desfazer: a camada mudou ou está bloqueada.');return false;}
 Object.assign(a.L,a.before.style);a.L.fields=a.before.fields;for(const p of a.before.props)p.f.props=p.props;
 for(const p of a.before.featureStyles||[])p.f._featureStyle=clone(p.value);
 if(S.undo.at(-1)===a)S.undo.pop();refresh(a.L);toast('Estilo e criação das colunas desfeitos.');return true;
}
function choose(L,c){
 document.getElementById('styleTransferModal')?.remove();const project=S.projectId,gen=window.GeoMineSessionAutosave?.state.generation;
 const needed=missing(L,c),schema=fields(L),cands=candidates(L,c,needed),initial=cands[0];
 const bg=document.createElement('div');bg.id='styleTransferModal';bg.className='modal-bg on';
 bg.innerHTML='<div class="modal" style="width:min(620px,95vw)"><div class="modal-h"><b>Colar estilo e classificação</b><button class="tbtn" data-close>Fechar</button></div><div class="modal-b">'+
 '<p>Coluna(s) a criar: <b>'+needed.map(esc).join(', ')+'</b>. Escolha o código que relaciona as duas camadas.</p><div class="row2"><label class="field">Campo na origem<select data-source></select></label><label class="field">Campo no destino<select data-target></select></label></div><div data-preview class="hint" style="margin:12px 0;max-height:220px;overflow:auto"></div><button class="tbtn" data-apply>Aplicar estilo e criar colunas</button></div></div>';
 document.body.append(bg);const from=bg.querySelector('[data-source]'),to=bg.querySelector('[data-target]'),preview=bg.querySelector('[data-preview]'),button=bg.querySelector('[data-apply]');
 for(const [select,fs] of [[from,c.fields.filter(f=>!needed.includes(f.name))],[to,schema]])for(const f of fs){const o=document.createElement('option');o.value=f.name;o.textContent=f.name;select.append(o);}
 if(initial){from.value=initial.sourceKey;to.value=initial.destKey;}
 let selected;const update=()=>{selected=rule(L,c,from.value,to.value,needed);button.disabled=!selected.ok;
  preview.replaceChildren();if(!selected.ok){preview.textContent=selected.error;return;}
  const summary=document.createElement('p');summary.textContent=selected.matched+' feições correspondentes; '+selected.unmatched+' sem correspondência (ficarão vazias).';preview.append(summary);
  for(const entry of [...selected.map.values()].slice(0,50)){const row=document.createElement('div');row.textContent=String(entry.code)+' → '+entry.values.map(v=>v??'(vazio)').join(' · ');preview.append(row);}
 };
 from.onchange=()=>{const n=resolve(schema,from.value);if(n)to.value=n;update();};to.onchange=update;update();
 bg.querySelector('[data-close]').onclick=()=>bg.remove();button.onclick=()=>{
  try{if(S.projectId!==project||window.GeoMineSessionAutosave?.state.generation!==gen||!S.layers.includes(L))throw Error('O projeto mudou. Copie e cole o estilo novamente.');apply(L,c,selected);bg.remove();if(document.getElementById('lpModal')?.classList.contains('on'))openLayerProps(L);}
  catch(e){preview.textContent=e.message;}
 };
}
function paste(L){
 const c=S._layerStyleClipboard;try{
  if(!c)throw Error('Copie primeiro o estilo de uma camada.');
  if(!editable(L))throw Error('A camada de destino está congelada ou sem permissão de edição.');
  if(c.gtype!==L.gtype)throw Error('Origem e destino precisam ter o mesmo tipo de geometria.');
  if(c.version!==2)throw Error('Copie novamente o estilo para incluir a classificação.');
  const needed=missing(L,c),q=needed.length?automatic(L,c,needed):null;
  if(needed.length&&!q){choose(L,c);return false;}return apply(L,c,q);
 }catch(e){toast(e.message);return false;}
}
function menu(L,anchor){
 if(typeof treeMenuLayer==='function'){treeMenuLayer(L,anchor);return;}
 S.activeId=L.id;S.selRaster=null;try{propRefresh();}catch(_){}
 ribMiniMenu(anchor,L.name,[{nome:'Copiar estilo',desc:'Copia simbologia, rótulos e regras de classificação por código.',run:()=>copy(L)},
 {nome:'Colar estilo',desc:'Aplica a aparência e cria os campos de classificação ausentes por correspondência.',run:()=>paste(L)},
 {sep:true},{nome:'Propriedades da camada',run:()=>openLayerProps(L)}]);
}
window.GeoMineStyleTransfer={copy,paste,apply,undo,menu,rule,missing,automatic};
})();
