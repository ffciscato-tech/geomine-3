/* Licenças and their original documents belong to the current GeoMine project.
   Text recognition proposes obligations; only explicit dates/references are used. */
(function(root){
'use strict';
const $=id=>document.getElementById(id),M=root.GeoMineLicenseModel;
const uid=()=>root.crypto?.randomUUID?.()||'lic-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const iso=()=>M.localToday(),date=v=>M.validDate(v)?v.split('-').reverse().join('/'):'—';
const statuses={pending:'Pendente',in_progress:'Em andamento',completed:'Cumprida',not_applicable:'Não se aplica'};
let state={version:1,licenses:[]},selectedId='',generation=0,job=null,selectedRows=new Set(),editId=null;
let filter='all',search='',sort='due',notice='',fitFrame=0;
function selected(){return state.licenses.find(l=>l.id===selectedId)||null;}
function dirty(){root.GeoMineSessionAutosave?.markDirty?.('gestão de licenças ambientais');}
function message(text,error=false){notice=String(text||'');const el=$('gmLicenseNotice');if(el){el.textContent=notice;el.classList.toggle('error',error);el.hidden=!notice;}}
function snapshot(){return {...M.sanitizeSnapshot(state),selectedLicenseId:selectedId};}
function restore(data){
 generation++;job?.controller.abort();job=null;
 if($('gmLicenseConditionDialog')?.open)$('gmLicenseConditionDialog').close();
 state=M.sanitizeSnapshot(data);const used=new Set();
 state.licenses.forEach(l=>{if(!l.id||used.has(l.id))l.id=uid();used.add(l.id);const ids=new Set();l.conditions.forEach(c=>{if(!c.id||ids.has(c.id))c.id=uid();ids.add(c.id);});});
 selectedId=state.licenses.some(l=>l.id===data?.selectedLicenseId)?data.selectedLicenseId:state.licenses[0]?.id||'';
 selectedRows.clear();filter='all';search='';notice='';editId=null;
 if($('gmLicensesWorkspace')){$('gmLicenseImport').disabled=false;$('gmLicenseCancelImport').hidden=true;$('gmLicenseFile').value='';message('');render();}
}
function hasContent(){return state.licenses.length>0;}
function open(){
 mount();RIB_CAT_ATUAL='ambiente';
 if(typeof setTool==='function')setTool('select');
 switchView('licenses');render();scheduleFit();
}
function selectLicense(id){selectedId=id;selectedRows.clear();filter='all';search='';notice='';render();}
function field(label,key,value,type='text'){return `<label class="gm-lic-field">${h(label)}<input data-license-field="${key}" type="${type}" value="${h(value)}"></label>`;}
function licenseDue(l){const days=M.daysBetween(iso(),l.expiresOn);return days===null?'':days<0?'Licença vencida':days===0?'Licença vence hoje':days<=30?`Licença vence em ${days} dias`:'';}
function dataSummary(l){return ['Dados da licença',l.number?'Nº '+l.number:'',l.issuedOn?'Emissão: '+date(l.issuedOn):'',l.expiresOn?'Validade: '+date(l.expiresOn):''].filter(Boolean).join(' · ');}
function renderList(){
 const list=$('gmLicenseList');if(!list)return;
 list.innerHTML=state.licenses.map(l=>{
  const overdue=l.conditions.filter(c=>M.conditionState(l,c).status==='overdue').length;
  return `<button class="gm-lic-list-item ${l.id===selectedId?'active':''}" data-action="select-license" data-id="${h(l.id)}"><strong>${h(l.title||l.number||'Licença sem nome')}</strong><span>${h([l.type,l.number].filter(Boolean).join(' · ')||l.agency||'Licença ambiental')}</span><small>${l.conditions.length} condicionante(s)${overdue?` · ${overdue} vencida(s)`:''}</small></button>`;
 }).join('')||'<p class="gm-lic-empty-small">Nenhuma licença neste projeto.</p>';
}
function renderSummary(){
 const l=selected(),el=$('gmLicenseSummary');if(!l||!el)return;
 const calculated=l.conditions.map(c=>M.conditionState(l,c));
 const cards=[['all','Condicionantes',l.conditions.length],['overdue','Vencidas',calculated.filter(c=>c.status==='overdue').length],['soon','Até 30 dias',calculated.filter(c=>['due_today','due_soon'].includes(c.status)).length],['review','A conferir',l.conditions.filter(c=>c.needsReview||M.calculateDue(l,c).needsReview).length]];
 el.innerHTML=cards.map(([key,label,count])=>`<button data-action="filter" data-filter="${key}" class="gm-lic-stat ${key} ${filter===key?'active':''}"><b>${count}</b><span>${label}</span></button>`).join('');
}
function visibleConditions(){
 const l=selected();if(!l)return [];
 let rows=l.conditions.map((c,index)=>({c,index,s:M.conditionState(l,c)}));
 if(search){const term=search.toLocaleLowerCase('pt-BR');rows=rows.filter(({c})=>[c.code,c.text,c.responsible,c.protocol].join(' ').toLocaleLowerCase('pt-BR').includes(term));}
 rows=rows.filter(({c,s})=>filter==='all'||filter==='overdue'&&s.status==='overdue'||filter==='soon'&&['due_today','due_soon'].includes(s.status)||filter==='review'&&(c.needsReview||s.needsReview)||filter==='completed'&&c.status==='completed'||filter==='pending'&&!['completed','not_applicable'].includes(c.status));
 if(sort==='due')rows.sort((a,b)=>{
  const done=c=>['completed','not_applicable'].includes(c.status)?1:0;
  return done(a.c)-done(b.c)||(a.s.dueOn||'9999-12-31').localeCompare(b.s.dueOn||'9999-12-31')||a.index-b.index;
 });
 return rows;
}
function dueLabel(c,s){
 const remain=s.daysRemaining;
 const relative=remain===null?'':remain<0?`${Math.abs(remain)} dia(s) em atraso`:remain===0?'Vence hoje':`Em ${remain} dia(s)`;
 const detail=[s.dueOn?relative:c.recurrence||s.reason,s.dueOn?c.recurrence:''].filter(Boolean).join(' · ');
 return `<strong>${s.dueOn?date(s.dueOn):c.dueMode==='continuous'?'Contínua':c.recurrence?'Periódica':'A definir'}</strong><small>${h(detail)}</small>`;
}
function renderTable(){
 const l=selected(),body=$('gmLicenseRows');if(!l||!body)return;
 const rows=visibleConditions();
 body.innerHTML=rows.map(({c,s})=>`<tr data-condition-id="${h(c.id)}" class="${s.status}">
  <td><input type="checkbox" data-check="${h(c.id)}" aria-label="Selecionar condicionante ${h(c.code)}" ${selectedRows.has(c.id)?'checked':''}></td>
  <td class="gm-lic-code">${h(c.code||'—')}</td>
  <td class="gm-lic-obligation"><button data-action="edit-condition" data-id="${h(c.id)}">${h(c.text||'Condicionante sem descrição')}</button>${c.sourcePage?`<button class="gm-lic-source" data-action="source" data-id="${h(c.id)}">PDF · página ${c.sourcePage}</button>`:''}</td>
  <td class="gm-lic-due">${dueLabel(c,s)}</td>
  <td><input data-responsible="${h(c.id)}" value="${h(c.responsible)}" aria-label="Responsável pela condicionante ${h(c.code)}" placeholder="Definir"></td>
  <td><span class="gm-lic-badge ${s.status}">${h(s.label)}</span><select data-status="${h(c.id)}" aria-label="Situação da condicionante ${h(c.code)}">${Object.entries(statuses).map(([k,v])=>`<option value="${k}" ${c.status===k?'selected':''}>${v}</option>`).join('')}</select></td>
  <td><button class="gm-lic-review ${c.needsReview||s.needsReview?'pending':''}" data-action="review" data-id="${h(c.id)}">${c.needsReview?'Conferir':s.needsReview?'Definir prazo':'Conferida'}</button></td>
  <td><button class="gm-lic-icon-button" data-action="edit-condition" data-id="${h(c.id)}" aria-label="Editar condicionante ${h(c.code)}">✎</button></td>
 </tr>`).join('')||`<tr><td colspan="8" class="gm-lic-table-empty">${l.conditions.length?'Nenhuma condicionante neste filtro.':'Importe o documento para organizar as condicionantes automaticamente.'}</td></tr>`;
 const counter=$('gmLicenseRowCount');if(counter)counter.textContent=`${rows.length} de ${l.conditions.length} condicionante(s)`;
 const count=$('gmLicenseSelectedCount');if(count)count.textContent=selectedRows.size?`${selectedRows.size} selecionada(s)`:'';
 const all=$('gmLicenseCheckAll');if(all){all.checked=rows.length>0&&rows.every(({c})=>selectedRows.has(c.id));all.indeterminate=!all.checked&&rows.some(({c})=>selectedRows.has(c.id));}
}
function render(){
 renderList();const panel=$('gmLicenseContent'),l=selected();if(!panel)return;
 if(!l){panel.innerHTML='<div class="gm-lic-welcome"><div class="gm-lic-welcome-icon">✓</div><h2>Gestão de licenças ambientais</h2><p>Importe a licença para organizar condicionantes e prazos.</p><button class="tbtn primary" data-action="import">Importar licença</button><button class="tbtn" data-action="new">Cadastrar licença</button></div>';return;}
 const expiry=licenseDue(l),warnings=Array.isArray(l.attachment?.emptyPages)?l.attachment.emptyPages:[];
 panel.innerHTML=`<div class="gm-lic-license-header"><div><h2>${h(l.title||'Licença ambiental')}</h2><span>${h(l.agency||'Órgão não informado')}</span></div><div class="gm-lic-license-actions"><button class="tbtn" data-action="view-document" ${l.attachment?'':'disabled'}>Abrir documento</button><button class="tbtn" data-action="delete-license">Excluir licença</button></div></div>
  <details class="gm-lic-license-data"><summary id="gmLicenseDataSummary">${h(dataSummary(l))}</summary><div class="gm-lic-metadata">
   ${field('Nome da licença','title',l.title)}${field('Número','number',l.number)}${field('Tipo','type',l.type)}
   ${field('Órgão licenciador','agency',l.agency)}${field('Titular / empreendimento','holder',l.holder)}
   <label class="gm-lic-field">Documento<span class="gm-lic-attachment">${h(l.attachment?.name||'Sem documento anexado')}</span></label>
   ${field('Emissão','issuedOn',l.issuedOn,'date')}${field('Recebimento / ciência','receivedOn',l.receivedOn,'date')}${field('Validade da licença','expiresOn',l.expiresOn,'date')}
  </div></details>
  <p id="gmLicenseExpiry" class="gm-lic-expiry" ${expiry?'':'hidden'}>${h(expiry)} · ${date(l.expiresOn)}</p>
  ${warnings.length?`<p class="gm-lic-warning">Página(s) ${h(warnings.join(', '))} sem texto legível. A extração dessas páginas depende de OCR; o documento continua anexado.</p>`:''}
  <div id="gmLicenseSummary" class="gm-lic-summary"></div>
  <div class="gm-lic-table-toolbar"><input id="gmLicenseSearch" type="search" placeholder="Buscar condicionante, responsável ou protocolo" value="${h(search)}" aria-label="Buscar condicionantes"><select id="gmLicenseFilter" aria-label="Filtrar condicionantes"><option value="all">Todas</option><option value="pending">Em aberto</option><option value="overdue">Vencidas</option><option value="soon">Até 30 dias</option><option value="review">A conferir</option><option value="completed">Cumpridas</option></select><select id="gmLicenseSort" aria-label="Ordenar condicionantes"><option value="due">Ordem de vencimento</option><option value="source">Ordem do documento</option></select><button class="tbtn" data-action="add-condition">+ Condicionante</button><button class="tbtn" data-action="export">Exportar tabela</button></div>
  <div class="gm-lic-bulk"><span id="gmLicenseSelectedCount"></span><button data-action="complete-selected">Marcar selecionadas como cumpridas</button><span id="gmLicenseRowCount"></span></div>
  <div class="gm-lic-table-wrap"><table class="gm-lic-table"><thead><tr><th><input id="gmLicenseCheckAll" type="checkbox" aria-label="Selecionar condicionantes visíveis"></th><th>Item</th><th>Condicionante</th><th>Prazo</th><th>Responsável</th><th>Situação</th><th>Conferência</th><th></th></tr></thead><tbody id="gmLicenseRows"></tbody></table></div>
  <details class="gm-lic-text-import"><summary>Organizar a partir de texto</summary><textarea id="gmLicensePastedText" rows="5" aria-label="Texto da licença" placeholder="Cole o texto da licença"></textarea><button class="tbtn" data-action="organize-text">Organizar condicionantes e prazos</button></details>`;
 $('gmLicenseFilter').value=filter;$('gmLicenseSort').value=sort;renderSummary();renderTable();
}
function newLicense(){
 const l=M.normalizeLicense({id:uid(),title:'Nova licença',conditions:[]});state.licenses.push(l);selectedId=l.id;selectedRows.clear();dirty();render();
}
function applyParsed(l,parsed){
 for(const key of ['number','type','agency','holder','issuedOn','receivedOn','expiresOn'])if(parsed.fields[key]&&!l[key])l[key]=parsed.fields[key];
 const known=new Set(l.conditions.map(c=>c.code+'\n'+c.text));let added=0;
 for(const candidate of parsed.conditions){if(known.has(candidate.code+'\n'+candidate.text))continue;const c=M.normalizeCondition({...candidate,id:uid()});l.conditions.push(c);known.add(c.code+'\n'+c.text);added++;}
 return added;
}
function bytesDataURL(file,signal){return new Promise((resolve,reject)=>{
 const reader=new FileReader(),abort=()=>{reader.abort();reject(new DOMException('Importação cancelada.','AbortError'));};
 const cleanup=()=>signal.removeEventListener('abort',abort);reader.onload=()=>{cleanup();resolve(reader.result);};reader.onerror=()=>{cleanup();reject(Error('Não foi possível anexar o documento.'));};reader.onabort=cleanup;
 if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});reader.readAsDataURL(file);
});}
async function importFile(file){
 if(!file)return null;if(job){message('Aguarde a leitura do documento atual.');return null;}
 const token={generation,project:S.projectId,controller:new AbortController()};job=token;
 $('gmLicenseCancelImport').hidden=false;$('gmLicenseImport').disabled=true;
 try{
  const signal=token.controller.signal,isPDF=file.type==='application/pdf'||/\.pdf$/i.test(file.name),isText=/\.txt$/i.test(file.name)||file.type==='text/plain';
  if(!isPDF&&!isText)throw Error('Selecione uma licença em PDF ou texto (.txt).');
  if(!file.size)throw Error('O documento está vazio.');
  message('Lendo e organizando a licença…');
  const dataURL=await bytesDataURL(file,signal);
  const extracted=isPDF?await root.GeoMineLicensePDF.read(file,{signal,onProgress:p=>message(p.phase==='extracting'?`Lendo página ${p.page} de ${p.total}…`:'Lendo documento…')}):{pages:[{page:1,text:await file.text()}],numPages:1,emptyPages:[]};
  if(signal.aborted||generation!==token.generation||S.projectId!==token.project)throw new DOMException('O projeto mudou.','AbortError');
  const parsed=M.parsePages(extracted.pages),l=M.normalizeLicense({id:uid(),title:file.name.replace(/\.[^.]+$/,''),attachment:{name:file.name,type:isPDF?'application/pdf':'text/plain',size:file.size,dataURL,pages:extracted.pages,emptyPages:extracted.emptyPages||[],importedAt:new Date().toISOString()},conditions:[]});
  const count=applyParsed(l,parsed);state.licenses.push(l);selectedId=l.id;selectedRows.clear();filter='all';search='';dirty();render();
  message(count?`${count} condicionante(s) organizada(s). Confira os itens sinalizados e as datas de referência.`:extracted.emptyPages?.length?'Documento anexado. As páginas sem texto precisam de OCR para extração automática.':'Documento anexado. Não foi possível reconhecer as condicionantes; use “Organizar a partir de texto” ou complemente os itens.');
  return l;
 }catch(e){if(job===token)message(e.name==='AbortError'?'Importação cancelada.':e.message,e.name!=='AbortError');return null;}
 finally{if(job===token){job=null;$('gmLicenseCancelImport').hidden=true;$('gmLicenseImport').disabled=false;$('gmLicenseFile').value='';}}
}
function documentBlob(attachment){
 const match=/^data:[^;,]*;base64,([\s\S]+)$/.exec(attachment?.dataURL||'');if(!match)throw Error('O documento não está anexado neste projeto.');
 if(!['application/pdf','text/plain'].includes(attachment.type))throw Error('Formato de documento indisponível.');
 const raw=atob(match[1]),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 return new Blob([bytes],{type:attachment.type});
}
function showDocument(page){
 try{const l=selected();if(!l?.attachment)return;const url=URL.createObjectURL(documentBlob(l.attachment));
  const tab=window.open(url+(page?'#page='+page:''),'_blank');if(!tab){URL.revokeObjectURL(url);message('Permita abrir o documento em outra aba.',true);return;}
  setTimeout(()=>URL.revokeObjectURL(url),120000);
 }catch(e){message(e.message,true);}
}
function editCondition(id){
 const l=selected();if(!l)return;const c=l.conditions.find(c=>c.id===id)||M.normalizeCondition({id:uid(),code:String(l.conditions.length+1)});editId=c.id;
 $('gmLicenseConditionForm').innerHTML=`<header><h3>Condicionante ${h(c.code)}</h3><button type="button" data-action="close-dialog" aria-label="Fechar condicionante">×</button></header>
  <div class="gm-lic-dialog-fields">${conditionField('Item','code',c.code)}${conditionField('Responsável','responsible',c.responsible)}
  <label class="gm-lic-field gm-lic-span">Condicionante<textarea name="text" rows="5" required>${h(c.text)}</textarea></label>
  <label class="gm-lic-field">Situação<select name="status">${Object.entries(statuses).map(([k,v])=>`<option value="${k}" ${c.status===k?'selected':''}>${v}</option>`).join('')}</select></label>
  <label class="gm-lic-field">Prazo<select name="dueMode"><option value="date">Data definida</option><option value="relative">Prazo relativo</option><option value="continuous">Obrigação contínua</option><option value="undefined">A definir / periódica</option></select></label>
  <div class="gm-lic-relative gm-lic-span"><label class="gm-lic-field">Intervalo<input name="offset" type="number" min="0" step="1" value="${c.offset??''}"></label><label class="gm-lic-field">Unidade<select name="unit"><option value="days">Dias corridos</option><option value="months">Meses</option><option value="years">Anos</option></select></label><label class="gm-lic-field">Contar a partir de<select name="anchor"><option value="issuedOn">Emissão da licença</option><option value="receivedOn">Recebimento / ciência</option><option value="manual">Outra data de referência</option></select></label></div>
  ${conditionField('Data do prazo','dueOn',c.dueOn,'date')}${conditionField('Data de referência','anchorDate',c.anchorDate,'date')}
  ${conditionField('Periodicidade indicada','recurrence',c.recurrence)}${conditionField('Data de cumprimento','completedOn',c.completedOn,'date')}${conditionField('Protocolo / comprovante','protocol',c.protocol)}
  <label class="gm-lic-field">Contagem<select name="businessDays"><option value="false">Calendário / dias corridos</option><option value="true">Dias úteis — definir data conferida</option></select></label>
  <label class="gm-lic-field gm-lic-span">Observações<textarea name="notes" rows="2">${h(c.notes)}</textarea></label></div>
  <output id="gmLicenseDuePreview"></output>
  ${c.sourcePage?`<details class="gm-lic-source-text"><summary>Trecho original · página ${c.sourcePage}</summary><pre>${h((c.sourcePages?.length?c.sourcePages.map(p=>`Página ${p.page}\n${p.excerpt}`):[c.sourceExcerpt]).join('\n\n'))}</pre></details>`:''}
  <label class="gm-lic-confirm"><input name="reviewed" type="checkbox" ${!c.needsReview?'checked':''}>Texto e prazo conferidos no documento</label>
  <footer><button type="button" class="tbtn gm-lic-danger" data-action="delete-condition" ${l.conditions.some(v=>v.id===c.id)?'':'hidden'}>Excluir</button><button type="button" class="tbtn" data-action="close-dialog">Cancelar</button><button type="submit" class="tbtn primary">Salvar condicionante</button></footer>`;
 const form=$('gmLicenseConditionForm');form.elements.dueMode.value=c.dueMode;form.elements.unit.value=c.unit;form.elements.anchor.value=c.anchor;form.elements.businessDays.value=String(c.businessDays);
 updateDuePreview();$('gmLicenseConditionDialog').showModal();
}
function conditionField(label,name,value,type='text'){return `<label class="gm-lic-field">${h(label)}<input name="${name}" type="${type}" value="${h(value)}"></label>`;}
function dialogValue(){
 const form=$('gmLicenseConditionForm'),values=Object.fromEntries(new FormData(form));
 return {...selected()?.conditions.find(c=>c.id===editId),...values,id:editId,businessDays:values.businessDays==='true',needsReview:!form.elements.reviewed.checked};
}
function updateDuePreview(){
 const form=$('gmLicenseConditionForm');if(!form.elements.dueMode)return;
 const c=dialogValue(),due=M.calculateDue(selected(),c);$('gmLicenseDuePreview').textContent=due.date?'Vencimento: '+date(due.date):due.reason;
 form.querySelector('.gm-lic-relative').hidden=c.dueMode!=='relative';
 form.elements.dueOn.closest('label').hidden=c.dueMode!=='date';
 form.elements.anchorDate.closest('label').hidden=c.dueMode!=='relative'||c.anchor!=='manual';
}
function saveCondition(e){
 e.preventDefault();const l=selected();if(!l)return;
 const c=M.normalizeCondition(dialogValue());if(!c.text.trim())return;
 const index=l.conditions.findIndex(v=>v.id===c.id);if(index<0)l.conditions.push(c);else l.conditions[index]=c;
 if(c.status==='completed'&&!c.completedOn)c.completedOn=iso();
 dirty();$('gmLicenseConditionDialog').close();renderSummary();renderTable();renderList();
}
async function exportTable(){
 const l=selected();if(!l)return;
 const headers=['LICENCA','NUMERO','ITEM','CONDICIONANTE','PRAZO','SITUACAO','RESPONSAVEL','CUMPRIMENTO','PROTOCOLO','PERIODICIDADE','PAGINA','OBSERVACOES'];
 const cell=v=>{let s=String(v??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 const rows=visibleConditions().map(({c,s})=>[l.title,l.number,c.code,c.text,s.dueOn,s.label,c.responsible,c.completedOn,c.protocol,c.recurrence,c.sourcePage,c.notes]);
 const csv='\ufeff'+[headers,...rows].map(row=>row.map(cell).join(';')).join('\r\n');
 try{await download(new Blob([csv],{type:'text/csv;charset=utf-8'}),'Condicionantes_'+(l.number||l.title||'licenca').replace(/[^\wÀ-ÿ.-]+/g,'_')+'.csv');}catch(e){message(e.message,true);}
}
function onClick(e){
 const b=e.target.closest('[data-action]');if(!b)return;const action=b.dataset.action,l=selected(),c=l?.conditions.find(c=>c.id===b.dataset.id);
 if(action==='import')$('gmLicenseFile').click();
 else if(action==='new')newLicense();
 else if(action==='select-license')selectLicense(b.dataset.id);
 else if(action==='view-document')showDocument();
 else if(action==='source')showDocument(c?.sourcePage);
 else if(action==='cancel-import')job?.controller.abort();
 else if(action==='add-condition')editCondition(null);
 else if(action==='edit-condition')editCondition(b.dataset.id);
 else if(action==='close-dialog')$('gmLicenseConditionDialog').close();
 else if(action==='export')void exportTable();
 else if(action==='filter'){filter=b.dataset.filter;if($('gmLicenseFilter'))$('gmLicenseFilter').value=filter;renderSummary();renderTable();}
 else if(action==='review'&&c)editCondition(c.id);
 else if(action==='complete-selected'&&l){
  if(!selectedRows.size){message('Selecione as condicionantes que deseja marcar.');return;}
  l.conditions.filter(c=>selectedRows.has(c.id)).forEach(c=>{c.status='completed';if(!c.completedOn)c.completedOn=iso();});dirty();renderSummary();renderTable();renderList();
 }else if(action==='delete-license'&&l&&confirm('Excluir esta licença, seu documento e suas condicionantes deste projeto?')){
  state.licenses=state.licenses.filter(v=>v!==l);selectedId=state.licenses[0]?.id||'';selectedRows.clear();dirty();render();
 }else if(action==='delete-condition'&&l&&confirm('Excluir esta condicionante?')){
  l.conditions=l.conditions.filter(v=>v.id!==editId);selectedRows.delete(editId);dirty();$('gmLicenseConditionDialog').close();renderSummary();renderTable();renderList();
 }else if(action==='organize-text'&&l){
  const text=$('gmLicensePastedText').value;if(!text.trim())return;
  const count=applyParsed(l,M.parsePages([{page:1,text}]));dirty();render();message(`${count} condicionante(s) acrescentada(s), sem repetir itens idênticos.`);
 }
}
function onChange(e){
 const el=e.target,l=selected();if(!l)return;
 if(el.dataset.licenseField){l[el.dataset.licenseField]=el.value;dirty();renderList();renderSummary();renderTable();
  if(el.dataset.licenseField==='title')$('gmLicenseContent').querySelector('h2').textContent=l.title||'Licença ambiental';
  if(el.dataset.licenseField==='agency')$('gmLicenseContent').querySelector('.gm-lic-license-header span').textContent=l.agency||'Órgão não informado';
  const summary=$('gmLicenseDataSummary');if(summary)summary.textContent=dataSummary(l);
  const expiry=$('gmLicenseExpiry');if(expiry){const label=licenseDue(l);expiry.hidden=!label;expiry.textContent=label+' · '+date(l.expiresOn);}return;}
 if(el.dataset.check){el.checked?selectedRows.add(el.dataset.check):selectedRows.delete(el.dataset.check);renderTable();return;}
 if(el.id==='gmLicenseCheckAll'){visibleConditions().forEach(({c})=>el.checked?selectedRows.add(c.id):selectedRows.delete(c.id));renderTable();return;}
 if(el.dataset.responsible){const c=l.conditions.find(c=>c.id===el.dataset.responsible);if(c){c.responsible=el.value;dirty();}return;}
 if(el.dataset.status){const c=l.conditions.find(c=>c.id===el.dataset.status);if(c){c.status=el.value;if(c.status==='completed'&&!c.completedOn)c.completedOn=iso();dirty();renderSummary();renderTable();renderList();}return;}
 if(el.id==='gmLicenseFilter'){filter=el.value;renderSummary();renderTable();}
 if(el.id==='gmLicenseSort'){sort=el.value;renderTable();}
}
function scheduleFit(){
 if(fitFrame)return;fitFrame=requestAnimationFrame(()=>{fitFrame=0;
  const workspace=$('gmLicensesWorkspace'),host=$('main');if(!workspace||workspace.hidden||!host)return;
  const box=host.getBoundingClientRect();let overlap=0;
  for(const element of [$('cmdBox'),document.querySelector('.readout')]){
   const native=element?.getBoundingClientRect();
   if(native&&native.height>0&&native.right>box.left&&native.left<box.right&&native.bottom>box.top&&native.top<box.bottom)overlap=Math.max(overlap,Math.ceil(box.bottom-native.top+1));
  }
  const bottom=overlap+'px';if(workspace.style.bottom!==bottom)workspace.style.bottom=bottom;
 });
}
function mount(){
 if($('gmLicensesWorkspace'))return;
 const workspace=document.createElement('section');workspace.id='gmLicensesWorkspace';workspace.hidden=true;workspace.style.display='none';workspace.setAttribute('aria-label','Gestão de licenças ambientais');
 workspace.innerHTML=`<header class="gm-lic-toolbar"><div><strong>Licenças ambientais</strong><span>Condicionantes e prazos</span></div><button id="gmLicenseImport" class="tbtn primary" data-action="import">Importar licença</button><button class="tbtn" data-action="new">+ Nova licença</button><button id="gmLicenseCancelImport" class="tbtn" data-action="cancel-import" hidden>Cancelar leitura</button><input id="gmLicenseFile" type="file" accept=".pdf,.txt,application/pdf,text/plain" hidden></header><div id="gmLicenseNotice" class="gm-lic-notice" role="status" hidden></div><div class="gm-lic-body"><nav id="gmLicenseList" class="gm-lic-list" aria-label="Licenças do projeto"></nav><main id="gmLicenseContent" class="gm-lic-content"></main></div><dialog id="gmLicenseConditionDialog"><form id="gmLicenseConditionForm"></form></dialog>`;
 $('main').append(workspace);
 // Observe only native containers; fitting this child does not resize either target.
 const resize=new ResizeObserver(scheduleFit);for(const element of [$('main'),$('cmdBox'),document.querySelector('.readout')])if(element)resize.observe(element);
 if($('cmdBox'))new MutationObserver(scheduleFit).observe($('cmdBox'),{attributes:true,attributeFilter:['style']});
 root.addEventListener('resize',scheduleFit);
 workspace.addEventListener('click',onClick);workspace.addEventListener('change',onChange);
 workspace.addEventListener('input',e=>{if(e.target.id==='gmLicenseSearch'){search=e.target.value;renderTable();}});
 $('gmLicenseConditionForm').addEventListener('submit',saveCondition);$('gmLicenseConditionForm').addEventListener('input',updateDuePreview);
 $('gmLicenseConditionForm').addEventListener('change',updateDuePreview);
 $('gmLicenseFile').addEventListener('change',e=>void importFile(e.target.files[0]));
 workspace.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();workspace.classList.add('gm-lic-dragover');}});
 workspace.addEventListener('dragleave',e=>{if(!workspace.contains(e.relatedTarget))workspace.classList.remove('gm-lic-dragover');});
 workspace.addEventListener('drop',e=>{workspace.classList.remove('gm-lic-dragover');if(!e.dataTransfer?.files.length)return;e.preventDefault();e.stopPropagation();void importFile(e.dataTransfer.files[0]);});
 const tab=document.createElement('button');tab.type='button';tab.className='a3-view-tab';tab.dataset.view='licenses';tab.textContent='Licenças';tab.title='Gestão de licenças ambientais';tab.onclick=open;
 const layout=$('a3ViewTabs')?.querySelector('[data-view="layout"]');if(layout)layout.after(tab);
 render();
}
function installCommand(){
 const cat=CATS.find(c=>c.id==='ambiente');if(cat&&!cat.grupos.some(g=>g.id==='gm-licenses'))cat.grupos.push({id:'gm-licenses',label:'Gestão ambiental',it:[{ic:'gm_license',nome:'Licenças ambientais',act:open}]});
}
function register(){
 mount();
 RIB_SVG.gm_license='<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5h20l8 8v29H10z" fill="#dcecf5"/><path d="M30 5v9h8M17 20h13M17 26h7"/><circle cx="32" cy="33" r="10" fill="#d2ead5" stroke="#3b7a50"/><path d="m27 33 3 3 6-7" stroke="#3b7a50"/></svg>';
 const base=root.ribbonBuild;root.ribbonBuild=function(){installCommand();return base.apply(this,arguments);};
 installCommand();
 ribbonBuild();
}
root.GeoMineLicenses={open,snapshot,restore,hasContent,importFile,get busy(){return !!job;}};
register();
})(window);
