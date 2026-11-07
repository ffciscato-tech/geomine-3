
/* ============================================================================
   FILTRO DE ATRIBUTOS — mais de uma condição

   O filtro de camada aceitava UMA condição: um campo, um operador, um valor.
   Isso impede perguntas triviais do dia a dia — "argila E em licenciamento",
   "cidade OU vila", "área acima de 10 ha E status ativo". A saída era criar
   camada derivada por fora, que é o que tivemos de fazer no projeto Titan para
   cruzar SUBS com FASE nos processos da ANM.

   Aqui o filtro passa a aceitar N condições combinadas por E / OU.

   COMPATIBILIDADE. A primeira condição continua gravada exatamente onde
   estava — attrFilter.field / op / value / value2 / caseSensitive. As demais
   vão num array attrFilter.rules, e o modo de junção em attrFilter.join.
   Assim: projeto antigo abre e funciona; projeto novo aberto numa versão
   antiga do CCMGIS aplica a primeira condição e ignora o resto, em vez de
   quebrar.

   A avaliação reaproveita a função original condição a condição, passando uma
   camada-fantasma {fields, attrFilter:regra} — nenhum operador foi
   reimplementado, então "entre", "está na lista", "está vazio" e a
   comparação numérica continuam se comportando igual.

   Bloco ADITIVO. Originais em window.attrFilterMatchOriginal,
   window.lpFillFilterOriginal e window.lpApplyFilterOriginal.
   ========================================================================== */
(function(){
'use strict';
if(window.ALAGIS131){ console.info('[131] já instalado'); return; }
if(typeof window.attrFilterMatch!=='function'){
  console.warn('[131] attrFilterMatch ausente — bloco ignorado'); return; }
window.ALAGIS131=1;
window.attrFilterMatchOriginal=window.attrFilterMatch;

const OPS=[['eq','igual a'],['neq','diferente de'],['contains','contém'],
  ['notcontains','não contém'],['starts','começa com'],['ends','termina com'],
  ['in','está na lista'],['gt','maior que'],['gte','maior ou igual'],
  ['lt','menor que'],['lte','menor ou igual'],['between','entre'],
  ['empty','está vazio'],['notempty','não está vazio']];
const SEM_VALOR=op=>op==='empty'||op==='notempty';

/* lpLayer e `let` no escopo do script — NAO existe em window. A camada chega
   como argumento de lpFillFilter, entao e dali que ela e guardada. */
let camadaFiltro=null;

/* uma condição = a função original sobre uma camada-fantasma */
function umaCondicao(L,f,regra){
  if(!regra||!regra.field) return true;
  return window.attrFilterMatchOriginal({fields:L&&L.fields, attrFilter:regra}, f);
}

window.attrFilterMatch=function(L,f){
  const q=L&&L.attrFilter;
  const extras=Array.isArray(q&&q.rules)? q.rules.filter(r=>r&&r.field) : [];
  const regrasTabela=L&&Array.isArray(L.attrFilterRules)
    ? L.attrFilterRules.filter(r=>r&&r.field) : [];
  /* O módulo 119 guarda suas condições em attrFilterRules. Se não houver
     regras embutidas do painel de propriedades, delega ao avaliador dele;
     caso contrário o módulo 131 reduziria silenciosamente tudo à 1ª regra. */
  if(!extras.length&&regrasTabela.length)
    return window.attrFilterMatchOriginal(L,f);
  if(!q||q.enabled===false||!q.field) return true;
  const primeira=umaCondicao(L,f,q);
  if(!extras.length) return primeira;
  if(String(q.join||'and').toLowerCase()==='or')
    return primeira || extras.some(r=>umaCondicao(L,f,r));
  return primeira && extras.every(r=>umaCondicao(L,f,r));
};

/* ---------------------------------------------------------------- interface */
const CSS=`
#lpFltExtras{display:grid;gap:6px;margin-top:8px}
#lpFltExtras .fx{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:6px;align-items:end}
#lpFltExtras .fx select,#lpFltExtras .fx input{width:100%}
#lpFltExtras .fx .rm{background:#8f3423;color:#fff;border:none;border-radius:6px;
  padding:0 9px;height:30px;cursor:pointer;font-weight:700;line-height:1}
#lpFltJoinBox{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12px}
#lpFltJoinBox select{width:auto}
#lpFltAdd{margin-top:8px;width:100%;justify-content:center}
@media(max-width:520px){ #lpFltExtras .fx{grid-template-columns:1fr 1fr;} }
`;
(function(){ const s=document.createElement('style'); s.id='flt131-css';
  s.textContent=CSS; document.head.appendChild(s); })();

function campos(L){
  try{ return (typeof attrFilterFields==='function')? attrFilterFields(L) : []; }
  catch(e){ return []; }
}
function esc2(s){ return String(s==null?'':s).replace(/[&<>"]/g,
  c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function monta(){
  const pane=document.getElementById('lpPaneFlt');
  if(!pane || document.getElementById('lpFltExtras')) return;
  const ancora=document.getElementById('lpFltCase');
  const alvo=ancora? ancora.closest('label') : null;
  const box=document.createElement('div');
  box.innerHTML=
    '<div id="lpFltJoinBox"><span>Combinar as condições com</span>'+
      '<select id="lpFltJoin"><option value="and">E (todas)</option>'+
      '<option value="or">OU (qualquer uma)</option></select></div>'+
    '<div id="lpFltExtras"></div>'+
    '<button class="tbtn" id="lpFltAdd" type="button">+ adicionar condição</button>';
  if(alvo && alvo.parentNode) alvo.parentNode.insertBefore(box, alvo);
  else pane.querySelector('.lp-cls-ctrl').appendChild(box);
  document.getElementById('lpFltAdd').addEventListener('click',()=>{
    linha({field:'',op:'eq',value:''}); });
}

function linha(r){
  const cx=document.getElementById('lpFltExtras'); if(!cx) return;
  const fs=campos(camadaFiltro);
  const div=document.createElement('div');
  div.className='fx';
  div.innerHTML=
    '<div><label class="field">Campo</label><select class="f">'+
      '<option value="">— campo —</option>'+
      fs.map(n=>'<option value="'+esc2(n)+'"'+(r.field===n?' selected':'')+'>'+esc2(n)+'</option>').join('')+
    '</select></div>'+
    '<div><label class="field">Condição</label><select class="o">'+
      OPS.map(([v,t])=>'<option value="'+v+'"'+((r.op||'eq')===v?' selected':'')+'>'+t+'</option>').join('')+
    '</select></div>'+
    '<div><label class="field">Valor</label><input class="v" value="'+esc2(r.value??'')+'"'+
      (SEM_VALOR(r.op)?' disabled placeholder="não usa valor"':'')+'></div>'+
    '<button type="button" class="rm" title="remover esta condição">×</button>';
  div.querySelector('.rm').addEventListener('click',()=>div.remove());
  div.querySelector('.o').addEventListener('change',e=>{
    const inp=div.querySelector('.v');
    inp.disabled=SEM_VALOR(e.target.value);
    inp.placeholder=inp.disabled?'não usa valor':'';
    if(inp.disabled) inp.value='';
  });
  cx.appendChild(div);
}

function leExtras(){
  const cx=document.getElementById('lpFltExtras');
  if(!cx) return [];
  return [...cx.querySelectorAll('.fx')].map(d=>({
    field:d.querySelector('.f').value,
    op:d.querySelector('.o').value,
    value:d.querySelector('.v').value,
    caseSensitive:!!(document.getElementById('lpFltCase')||{}).checked
  })).filter(r=>r.field && (SEM_VALOR(r.op) || String(r.value).trim()!==''));
}

if(typeof window.lpFillFilter==='function'){
  window.lpFillFilterOriginal=window.lpFillFilter;
  window.lpFillFilter=function(L){
    window.lpFillFilterOriginal(L);
    camadaFiltro=L;
    try{
      monta();
      const cx=document.getElementById('lpFltExtras'); if(!cx) return;
      cx.innerHTML='';
      const q=(L&&L.attrFilter)||{};
      const j=document.getElementById('lpFltJoin');
      if(j) j.value=String(q.join||'and').toLowerCase()==='or'?'or':'and';
      (Array.isArray(q.rules)?q.rules:[]).forEach(r=>{ if(r&&r.field) linha(r); });
    }catch(e){ console.warn('[131] preencher extras',e); }
  };
}

if(typeof window.lpApplyFilter==='function'){
  window.lpApplyFilterOriginal=window.lpApplyFilter;
  window.lpApplyFilter=function(){
    const L=camadaFiltro;
    const extras=leExtras();
    const join=(document.getElementById('lpFltJoin')||{}).value||'and';
    const filtroAntes=L&&L.attrFilter;
    window.lpApplyFilterOriginal();
    if(L&&L.attrFilter&&L.attrFilter!==filtroAntes){
      delete L.attrFilterRules;delete L.attrFilterLogic;
    }
    /* a original grava attrFilter do zero; as condições extras entram depois,
       e o filtro é reaplicado com elas. */
    if(L && L.attrFilter && extras.length){
      L.attrFilter.rules=extras;
      L.attrFilter.join=join;
      try{ drawLayer(L); refreshUI(); if(typeof layoutSeVisivel==='function') layoutSeVisivel(); }catch(e){}
      try{
        const n=attrFilterCount(L);
        const st=document.getElementById('lpFltStatus');
        if(st) st.textContent=n.toLocaleString('pt-BR')+' de '+L.features.length.toLocaleString('pt-BR')+' visíveis';
        const meta=document.getElementById('lpMeta');
        if(meta) meta.textContent=L.gtype+' · '+n+' de '+L.features.length+' feições';
        const info=document.getElementById('lpInfo');
        if(info && typeof lpInfoHTML==='function') info.innerHTML=lpInfoHTML(L);
        toast('Filtro com '+(extras.length+1)+' condições ('+(join==='or'?'OU':'E')+'): '+
              n.toLocaleString('pt-BR')+' de '+L.features.length.toLocaleString('pt-BR')+' feições');
      }catch(e){}
    } else if(L && L.attrFilter){
      delete L.attrFilter.rules; delete L.attrFilter.join;
    }
  };
  const bt=document.getElementById('lpFltApply');
  if(bt) bt.onclick=()=>window.lpApplyFilter();
}

document.addEventListener('click',()=>setTimeout(monta,120),{passive:true});
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',monta,{once:true});
else setTimeout(monta,400);
console.info('[131] filtro de atributos aceita várias condições (E / OU)');
})();
