
(()=>{
  'use strict';
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const OPS=[['eq','=  igual a'],['neq','≠  diferente de'],['contains','contém'],['notcontains','não contém'],
    ['starts','começa com'],['ends','termina com'],['in','IN  está na lista'],['gt','>  maior que'],
    ['gte','≥  maior ou igual'],['lt','<  menor que'],['lte','≤  menor ou igual'],
    ['between','BETWEEN  entre'],['empty','IS NULL / vazio'],['notempty','IS NOT NULL / preenchido']];
  const baseOpen=window.openAttr,baseMatch=window.attrFilterMatch,
    baseApplyUi=window.attrFilterApplyUi,baseClear=window.attrFilterClear;
  if(typeof baseOpen!=='function'||typeof baseMatch!=='function')return;

  /* Compatibilidade: as demais partes do CCMGIS continuam chamando a mesma
     função. Quando há várias regras, cada uma usa o comparador já consolidado
     do programa e os resultados são unidos por AND ou OR. */
  window.attrFilterMatch=function(L,f){
    const rules=L&&Array.isArray(L.attrFilterRules)?L.attrFilterRules.filter(r=>r&&r.field):[];
    if(!rules.length)return baseMatch(L,f);
    const old=L.attrFilter,logic=L.attrFilterLogic==='or'?'or':'and';
    try{
      const vals=rules.map(r=>{L.attrFilter=r;return baseMatch(L,f);});
      return logic==='or'?vals.some(Boolean):vals.every(Boolean);
    }finally{L.attrFilter=old;}
  };
  if(typeof baseApplyUi==='function')window.attrFilterApplyUi=function(L){delete L.attrFilterRules;delete L.attrFilterLogic;return baseApplyUi(L);};
  if(typeof baseClear==='function')window.attrFilterClear=function(L){delete L.attrFilterRules;delete L.attrFilterLogic;return baseClear(L);};

  function campos(L){
    const out=[],seen=new Set();
    (L.fields||[]).forEach(f=>{const n=typeof f==='string'?f:f?.name;if(n&&!seen.has(n)){seen.add(n);out.push(n);}});
    if(!out.length)(L.features||[]).slice(0,200).forEach(f=>Object.keys(f?.props||{}).forEach(n=>{if(!seen.has(n)){seen.add(n);out.push(n);}}));
    return out;
  }
  function valores(L,field){
    const s=new Set();for(const f of (L.features||[])){const v=f?.props?.[field];if(v!=null&&String(v)!=='')s.add(String(v));if(s.size>=500)break;}
    return [...s].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}));
  }
  function regraHtml(L,r,i){
    const fs=campos(L),op=r.op||'eq',semValor=['empty','notempty'].includes(op),entre=op==='between',dl='atFltVals'+i;
    return '<div class="atflt-rule" data-rule="'+i+'">'+
      '<select class="atflt-field" title="Campo"><option value="">— campo —</option>'+fs.map(f=>'<option value="'+esc(f)+'" '+(r.field===f?'selected':'')+'>'+esc(f)+'</option>').join('')+'</select>'+
      '<select class="atflt-op" title="Operador">'+OPS.map(x=>'<option value="'+x[0]+'" '+(op===x[0]?'selected':'')+'>'+x[1]+'</option>').join('')+'</select>'+
      '<input class="atflt-value" list="'+dl+'" value="'+esc(r.value??'')+'" placeholder="valor ou A, B, C" '+(semValor?'disabled':'')+'><datalist id="'+dl+'">'+(r.field?valores(L,r.field).map(v=>'<option value="'+esc(v)+'"></option>').join(''):'')+'</datalist>'+
      '<input class="atflt-value2" value="'+esc(r.value2??'')+'" placeholder="valor final" '+(entre?'':'disabled')+'>'+
      '<button type="button" class="tbtn atflt-remove" title="Remover condição">×</button></div>';
  }
  function lerRegras(panel,validar=false){
    const rules=[];
    panel.querySelectorAll('.atflt-rule').forEach(row=>{
      const field=row.querySelector('.atflt-field').value,op=row.querySelector('.atflt-op').value,
        value=row.querySelector('.atflt-value').value,value2=row.querySelector('.atflt-value2').value;
      if(!field){if(validar)row.querySelector('.atflt-field').style.borderColor='var(--sel)';return;}
      if(!['empty','notempty'].includes(op)&&!String(value).trim()){if(validar)row.querySelector('.atflt-value').style.borderColor='var(--sel)';return;}
      if(op==='between'&&!String(value2).trim()){if(validar)row.querySelector('.atflt-value2').style.borderColor='var(--sel)';return;}
      rules.push({enabled:true,field,op,value,value2,caseSensitive:!!panel.querySelector('#atFltCase')?.checked});
    });
    return rules;
  }
  function expressao(rules,logic){
    const rot=Object.fromEntries(OPS),q=v=>'“'+String(v??'')+'”';
    return rules.map(r=>r.field+' '+(rot[r.op]||r.op)+( ['empty','notempty'].includes(r.op)?'':' '+q(r.value))+(r.op==='between'?' e '+q(r.value2):'')).join(logic==='or'?'  OR  ':'  AND  ')||'Defina ao menos uma condição.';
  }
  function atualizaExpressao(panel){
    const rs=lerRegras(panel,false),logic=panel.querySelector('#atFltLogic')?.value||'and',e=panel.querySelector('.atflt-expression');if(e)e.textContent=expressao(rs,logic);
  }
  function render(L,draft){
    const panel=document.getElementById('attrFilterPanel');if(!panel||!L)return;
    const rules=draft||(L.attrFilterRules?.length?L.attrFilterRules:(L.attrFilter?.field?[L.attrFilter]:[{field:'',op:'eq',value:'',value2:''}]));
    const active=!!(L.attrFilterRules?.length||L.attrFilter?.field),n=typeof attrFilterCount==='function'?attrFilterCount(L):L.features.length;
    panel.innerHTML='<div class="atflt-head"><b>⌯ Filtro de feições — estilo QGIS</b><span class="atflt-count">'+(active?n.toLocaleString('pt-BR')+' de ':'')+L.features.length.toLocaleString('pt-BR')+' feições</span><span style="flex:1"></span><label style="font-size:11px">Combinar&nbsp; <select id="atFltLogic" class="atflt-logic" style="width:auto"><option value="and" '+(L.attrFilterLogic!=='or'?'selected':'')+'>Todas (AND)</option><option value="or" '+(L.attrFilterLogic==='or'?'selected':'')+'>Qualquer (OR)</option></select></label><label style="font-size:11px;display:flex;align-items:center;gap:5px"><input type="checkbox" id="atFltCase" style="width:auto" '+((rules[0]||{}).caseSensitive?'checked':'')+'>Diferenciar maiúsculas</label></div>'+
      '<div class="atflt-rules">'+rules.map((r,i)=>regraHtml(L,r,i)).join('')+'</div>'+
      '<div class="atflt-actions"><button type="button" class="tbtn" id="atFltAdd">＋ Condição</button><button type="button" class="tbtn atflt-apply" id="atFltApply">✓ Aplicar filtro</button><button type="button" class="tbtn" id="atFltClear" '+(active?'':'disabled')+'>× Limpar</button><span class="atflt-expression" title="Expressão aplicada"></span></div>';
    const rows=()=>[...panel.querySelectorAll('.atflt-rule')];
    rows().forEach(row=>{
      const field=row.querySelector('.atflt-field'),op=row.querySelector('.atflt-op');
      field.onchange=()=>{const all=rows().map(x=>({field:x.querySelector('.atflt-field').value,op:x.querySelector('.atflt-op').value,value:x.querySelector('.atflt-value').value,value2:x.querySelector('.atflt-value2').value,caseSensitive:!!panel.querySelector('#atFltCase').checked}));render(L,all);};
      op.onchange=()=>{const v=row.querySelector('.atflt-value'),v2=row.querySelector('.atflt-value2');v.disabled=['empty','notempty'].includes(op.value);v2.disabled=op.value!=='between';atualizaExpressao(panel);};
      row.querySelectorAll('input,select').forEach(x=>x.addEventListener('input',()=>atualizaExpressao(panel)));
      row.querySelector('.atflt-remove').onclick=()=>{const all=rows().map(x=>({field:x.querySelector('.atflt-field').value,op:x.querySelector('.atflt-op').value,value:x.querySelector('.atflt-value').value,value2:x.querySelector('.atflt-value2').value,caseSensitive:!!panel.querySelector('#atFltCase').checked}));all.splice(+row.dataset.rule,1);render(L,all.length?all:[{field:'',op:'eq'}]);};
    });
    panel.querySelector('#atFltAdd').onclick=()=>{const all=rows().map(x=>({field:x.querySelector('.atflt-field').value,op:x.querySelector('.atflt-op').value,value:x.querySelector('.atflt-value').value,value2:x.querySelector('.atflt-value2').value,caseSensitive:!!panel.querySelector('#atFltCase').checked}));all.push({field:'',op:'eq'});render(L,all);};
    panel.querySelector('#atFltApply').onclick=()=>aplicar(L,panel);
    panel.querySelector('#atFltClear').onclick=()=>limpar(L);
    panel.querySelector('#atFltLogic').onchange=()=>atualizaExpressao(panel);
    panel.querySelector('#atFltCase').onchange=()=>atualizaExpressao(panel);
    atualizaExpressao(panel);atualizaBotao(L);
  }
  function aplicar(L,panel){
    const rules=lerRegras(panel,true);if(!rules.length){toast('Complete ao menos uma condição do filtro');return;}
    L.attrFilterRules=rules;L.attrFilterLogic=panel.querySelector('#atFltLogic').value==='or'?'or':'and';L.attrFilter=rules[0];
    if(S.selFeat&&S.selFeat.layerId===L.id&&!window.attrFilterMatch(L,L.features[S.selFeat.idx]))S.selFeat=null;
    try{drawLayer(L);refreshUI();}catch(_){ }
    baseOpen();render(L);document.getElementById('attrFilterPanel').hidden=false;
    toast('Filtro aplicado: '+attrFilterCount(L).toLocaleString('pt-BR')+' de '+L.features.length.toLocaleString('pt-BR')+' feições');
  }
  function limpar(L){delete L.attrFilterRules;delete L.attrFilterLogic;delete L.attrFilter;try{drawLayer(L);refreshUI();}catch(_){ }baseOpen();render(L);document.getElementById('attrFilterPanel').hidden=false;toast('Filtro removido — todas as feições estão visíveis');}
  function atualizaBotao(L){const b=document.getElementById('attrFilterToggle');if(!b)return;const active=!!(L&&(L.attrFilterRules?.length||L.attrFilter?.field));b.classList.toggle('on',active);b.innerHTML='⌯ Filtro'+(active?' · '+attrFilterCount(L).toLocaleString('pt-BR'):'');}
  function instala(){
    const bar=document.querySelector('#attrPanel .attrbar'),body=document.getElementById('attrBody');if(!bar||!body)return;
    let btn=document.getElementById('attrFilterToggle');if(!btn){btn=document.createElement('button');btn.type='button';btn.id='attrFilterToggle';btn.className='tbtn';btn.textContent='⌯ Filtro';bar.insertBefore(btn,document.getElementById('btnAddField'));}
    let panel=document.getElementById('attrFilterPanel');if(!panel){panel=document.createElement('div');panel.id='attrFilterPanel';panel.hidden=true;body.parentNode.insertBefore(panel,body);}
    btn.onclick=()=>{const L=activeLayer();if(!L)return toast('Sem camada ativa');panel.hidden=!panel.hidden;if(!panel.hidden)render(L);};
  }
  window.openAttr=function(selIdx){instala();baseOpen(selIdx);const L=activeLayer(),p=document.getElementById('attrFilterPanel');atualizaBotao(L);if(p&&!p.hidden)render(L);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',instala,{once:true});else instala();
})();
