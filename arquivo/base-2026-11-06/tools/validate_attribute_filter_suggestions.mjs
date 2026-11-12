import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const core=fs.readFileSync('src/core/parts/09-measurement-properties-cad.js','utf8');
const multi=fs.readFileSync('src/modules/analysis/alagis-131-filtro-multiplas-condicoes.js','utf8');

function trecho(src,inicio,fim){
  const i=src.indexOf(inicio),j=src.indexOf(fim,i);
  assert.ok(i>=0&&j>i,`trecho ausente: ${inicio}`);
  return src.slice(i,j);
}

const principal={innerHTML:''};
const context={
  document:{getElementById:id=>id==='lpFltSuggestions'?principal:null},
  esc:s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
};
vm.createContext(context);
vm.runInContext(
  trecho(core,'function lpFilterSuggestions(','function lpFilterSyncOp(')+
  '\nglobalThis.preenche=lpFilterSuggestions;',context);

const L={features:[
  {props:{TIPO:'RUIDO',STATUS:'ATIVO',LOCAL:'NORTE'}},
  {props:{TIPO:'SISMICA',STATUS:'INATIVO',LOCAL:'SUL'}},
  {props:{TIPO:'RUIDO',STATUS:'ATIVO',LOCAL:null}},
  {props:{TIPO:'',STATUS:null,LOCAL:'NORTE'}}
]};
const valores=dl=>[...dl.innerHTML.matchAll(/<option value="([^"]*)"><\/option>/g)].map(m=>m[1]);

context.preenche(L,'TIPO');
assert.deepEqual(valores(principal),['RUIDO','SISMICA'],'a lista da primeira condição não foi preservada');

const a={innerHTML:''},b={innerHTML:''},c={innerHTML:''};
context.preenche(L,'TIPO',a);
context.preenche(L,'STATUS',b);
context.preenche(L,'LOCAL',c);
assert.deepEqual(valores(a),['RUIDO','SISMICA']);
assert.deepEqual(valores(b),['ATIVO','INATIVO']);
assert.deepEqual(valores(c),['NORTE','SUL']);

const antesA=a.innerHTML,antesC=c.innerHTML;
context.preenche(L,'TIPO',b);
assert.deepEqual(valores(b),['RUIDO','SISMICA'],'trocar o campo não atualizou a lista da condição');
assert.equal(a.innerHTML,antesA,'uma condição alterou as sugestões de outra');
assert.equal(c.innerHTML,antesC,'uma condição alterou as sugestões de outra');

[
  "let sugestoesSeq=0",
  "const dlId='lpFltExtraSuggestions'+(++sugestoesSeq)",
  "class=\"v\" list=\"'+dlId+'\"",
  "<datalist id=\"'+dlId+'\"></datalist>",
  "campo.addEventListener('change',atualizaSugestoes)",
  "lpFilterSuggestions(camadaFiltro,campo.value,dl)",
  "atualizaSugestoes();"
].forEach(s=>assert.ok(multi.includes(s),'integração ausente: '+s));

console.log('OK: todas as condições do filtro recebem listas independentes e atualizadas por campo.');
