import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR=path.dirname(fileURLToPath(import.meta.url));
const runtime=fs.readFileSync(path.join(DIR,"label-formula-runtime.js"),"utf8").trim();

function once(source,search,replacement,label){
  const i=source.indexOf(search);
  if(i<0)throw new Error(`Rótulos por fórmula — trecho ausente: ${label}`);
  if(source.indexOf(search,i+search.length)>=0)throw new Error(`Rótulos por fórmula — trecho ambíguo: ${label}`);
  return source.slice(0,i)+replacement+source.slice(i+search.length);
}
function countReplace(source,search,replacement,n,label){
  const found=source.split(search).length-1;
  if(found!==n)throw new Error(`Rótulos por fórmula — ${label}: ${found}, esperado ${n}`);
  return source.split(search).join(replacement);
}

export function aplicaRotulosFormula(source){
  let out=source;

  out=once(out,
`          <div class="hint" style="margin-top:4px">Escreve o valor do atributo em cada feição, no mapa e na plotagem. Segure <b>Ctrl</b> (ou arraste) para escolher <b>vários campos</b> — por exemplo nome e área, que saem em linhas separadas. A ordem é a da lista.</div>
        </div>`,
`          <div class="hint" style="margin-top:4px">Escreve o valor do atributo em cada feição, no mapa e na plotagem. Segure <b>Ctrl</b> (ou arraste) para escolher <b>vários campos</b> — por exemplo nome e área, que saem em linhas separadas. A ordem é a da lista.</div>
          <div style="margin-top:10px;padding-top:9px;border-top:1px solid var(--line)">
            <label class="field">Fórmula do rótulo <span style="font-weight:400;color:var(--ink-dim)">(opcional)</span></label>
            <textarea id="lbFormula" rows="3" spellcheck="false" placeholder="ex.: 'Área: ' || formatar($AREA_HA, 2) || ' ha'" style="width:100%;resize:vertical;background:var(--panel2);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:7px;font:12px/1.35 'Courier New',monospace"></textarea>
            <div class="row2" style="margin-top:6px">
              <select id="lbFormulaCampo"><option value="">+ Inserir campo…</option></select>
              <select id="lbFormulaFuncao">
                <option value="">+ Inserir função…</option>
                <option value="juntar(, )">juntar textos</option><option value="se(, , )">se / condição</option>
                <option value="coalesce(, )">primeiro valor preenchido</option><option value="formatar(, 2)">formatar número</option>
                <option value="arredondar(, 0)">arredondar</option><option value="maiusc()">MAIÚSCULAS</option>
                <option value="minusc()">minúsculas</option><option value="titulo()">Primeira Maiúscula</option>
                <option value="apara()">remover espaços</option><option value="trocar(, , )">trocar texto</option>
              </select>
            </div>
            <div id="lbFormulaStatus" class="hint" style="margin-top:5px"></div>
            <div class="hint" style="margin-top:3px">Campo: <b>"NOME"</b> · texto: <b>'texto'</b> · juntar: <b>||</b> · geometria: <b>$AREA_HA</b>, <b>$COMPRIM</b>, <b>$X</b>, <b>$Y</b>. A fórmula preenchida tem prioridade; ao apagá-la, voltam os campos escolhidos.</div>
          </div>
        </div>`,
    "editor da fórmula");

  out=once(out,
`function labelCfg(L){
  if(!L.lbl) L.lbl=defaultLabelCfg();
  return L.lbl;
}
`,
`function labelCfg(L){
  if(!L.lbl) L.lbl=defaultLabelCfg();
  return L.lbl;
}

${runtime}
`,
    "motor seguro da fórmula");

  out=once(out,
`          /* Com mais de um campo, o padrão é um EMBAIXO do outro. */
          sep:'linha'};`,
`          /* Com mais de um campo, o padrão é um EMBAIXO do outro. */
          sep:'linha', expr:''};`,
    "configuração padrão da fórmula");

  out=once(out,
`function labelText(L, f){
  const campos=labelCampos(L); if(!campos.length) return null;
  const c=labelCfg(L);
  if(!labelPassaFiltro(L,f,c)) return null;      // feição fora do filtro: sem rótulo
  const partes=[];
  campos.forEach(fld=>{ const t=labelValor(L,f,fld,c); if(t!=null) partes.push(t); });
  if(!partes.length) return null;
  const sep = (c.sep==null||c.sep==='linha') ? '\\n'
            : (c.sep==='ponto' ? ' · ' : c.sep==='traco' ? ' — ' : c.sep==='espaco' ? ' ' : '\\n');
  return (c.pre||'')+partes.join(sep)+(c.suf||'');
}`,
`function labelText(L, f, idx){
  const c=labelCfg(L),expr=String(c.expr||'').trim();
  if(expr)return labelFormulaTexto(L,f,expr,idx);
  const campos=labelCampos(L); if(!campos.length) return null;
  if(!labelPassaFiltro(L,f,c)) return null;      // feição fora do filtro: sem rótulo
  const partes=[];
  campos.forEach(fld=>{ const t=labelValor(L,f,fld,c); if(t!=null) partes.push(t); });
  if(!partes.length) return null;
  const sep = (c.sep==null||c.sep==='linha') ? '\\n'
            : (c.sep==='ponto' ? ' · ' : c.sep==='traco' ? ' — ' : c.sep==='espaco' ? ' ' : '\\n');
  return (c.pre||'')+partes.join(sep)+(c.suf||'');
}`,
    "avaliação da fórmula no rótulo");

  out=once(out,
`  for(const f of (L.features||[])){
    if(!f||!f.geom||!featureVisible(L,f))continue;
    const txt=labelText(L,f);if(txt==null)continue;`,
`  for(let idx=0;idx<(L.features||[]).length;idx++){
    const f=L.features[idx];
    if(!f||!f.geom||!featureVisible(L,f))continue;
    const txt=labelText(L,f,idx);if(txt==null)continue;`,
    "índice original na unicidade");

  out=once(out,"  const labelUnicas=(!big&&L.labelField)?labelUniqueSet(L):null;",
    "  const labelUnicas=(!big&&labelAtivo(L))?labelUniqueSet(L):null;","gate único no mapa");
  out=once(out,"  if(big && L.labelField && !L._bigWarn){ L._bigWarn=1;",
    "  if(big && labelAtivo(L) && !L._bigWarn){ L._bigWarn=1;","aviso em camada grande");
  out=once(out,"    if(!big && L.labelField){\n      const cfg=labelCfg(L);\n      const txt=labelText(L,f);",
    "    if(!big && labelAtivo(L)){\n      const cfg=labelCfg(L);\n      const txt=labelText(L,f,idx);","rótulo por fórmula no mapa");

  out=once(out,
`function lpFillLabels(L){`,
`function lpFormulaExpr(){const e=document.getElementById('lbFormula');return e?String(e.value||'').trim():'';}
function lpFormulaInsere(txt){
  const e=document.getElementById('lbFormula');if(!e||!txt)return;
  const a=Number.isInteger(e.selectionStart)?e.selectionStart:e.value.length,
    b=Number.isInteger(e.selectionEnd)?e.selectionEnd:a;
  e.value=e.value.slice(0,a)+txt+e.value.slice(b);
  const dentro=txt.indexOf('(')>=0?txt.indexOf('(')+1:txt.length;
  e.focus();e.setSelectionRange(a+dentro,a+dentro);lpPreview();lpOptsAtivo(true);
}
function lpFillLabels(L){`,
    "controles auxiliares da fórmula");

  out=once(out,
`  fs.innerHTML='<option value="" '+(escolhidos.size?'':'selected')+'>— sem rótulo —</option>'+virt+
    (campos.length?'<option disabled>── campos da tabela ──</option>':'')+
    campos.map(f=>\`<option value="\${esc(f.name)}" \${escolhidos.has(f.name)?'selected':''}>\${esc(f.name)}</option>\`).join('');`,
`  fs.innerHTML='<option value="" '+(escolhidos.size?'':'selected')+'>— sem rótulo —</option>'+virt+
    (campos.length?'<option disabled>── campos da tabela ──</option>':'')+
    campos.map(f=>\`<option value="\${esc(f.name)}" \${escolhidos.has(f.name)?'selected':''}>\${esc(f.name)}</option>\`).join('');
  const fx=document.getElementById('lbFormula');if(fx)fx.value=c.expr||'';
  const fxc=document.getElementById('lbFormulaCampo');
  if(fxc){fxc.innerHTML='<option value="">+ Inserir campo…</option>'+geomCamposDe(L.gtype).map(k=>
      \`<option value="\${k}">\${esc(GEOM_CAMPOS[k])}</option>\`).join('')+
      campos.map(fd=>\`<option value="&quot;\${esc(fd.name).replace(/&quot;/g,'&quot;&quot;')}&quot;">\${esc(fd.name)}</option>\`).join('');
    fxc.onchange=()=>{if(fxc.value)lpFormulaInsere(fxc.value);fxc.value='';};}
  const fxf=document.getElementById('lbFormulaFuncao');if(fxf)fxf.onchange=()=>{if(fxf.value)lpFormulaInsere(fxf.value);fxf.value='';};`,
    "preenchimento dos campos da fórmula");

  out=countReplace(out,"  lpOptsAtivo(!!L.labelField);\n  lpPreview();",
    "  lpOptsAtivo(labelAtivo(L)||!!lpFormulaExpr());\n  lpPreview();",2,"ativação da fórmula");

  out=once(out,
`function lpPreview(){
  const L=lpLayer; if(!L) return;
  const c=labelCfg(L);
  const box=document.getElementById('lbPrev'); if(!box) return;
  const f=L.features.find(f=>labelText(L,f)!=null);
  const txt = f? labelText(L,f) : (labelCampos(L).length? '(sem valor)' : 'escolha um ou mais campos');
  const px=Math.max(11,(+c.size||8)*2.2);
  box.innerHTML=\`<span style="\${labelCSS(c,px)};display:inline-block;line-height:1.15;text-align:center">\${labelHTML(txt)}</span>\`;
}`,
`function lpPreview(){
  const L=lpLayer; if(!L) return;
  const c=labelCfg(L),expr=lpFormulaExpr(),status=document.getElementById('lbFormulaStatus');
  const box=document.getElementById('lbPrev'); if(!box) return;
  const check=labelFormulaValida(expr,L);
  if(status){status.style.color=check.ok?(expr?'#238a68':''):'#d95757';
    status.textContent=check.ok?(expr?'✓ Fórmula válida — use Aplicar rótulos para confirmar':'Fórmula vazia — serão usados os campos escolhidos'):'⚠ '+check.error;}
  if(!check.ok){box.innerHTML='<span style="color:#d95757">Corrija a fórmula para ver a prévia</span>';return;}
  let txt=null;
  for(let idx=0;idx<L.features.length;idx++){
    txt=expr?labelFormulaTexto(L,L.features[idx],expr,idx):labelText(L,L.features[idx],idx);
    if(txt!=null)break;
  }
  if(txt==null)txt=(expr||labelCampos(L).length)?'(sem valor)':'escolha um campo ou escreva uma fórmula';
  const px=Math.max(11,(+c.size||8)*2.2);
  box.innerHTML=\`<span style="\${labelCSS(c,px)};display:inline-block;line-height:1.15;text-align:center">\${labelHTML(txt)}</span>\`;
}`,
    "prévia da fórmula");

  out=once(out,
`['lbFont','lbStyle','lbSize','lbColor','lbHalo','lbHaloW','lbCase','lbDec','lbPre','lbSuf']
  .forEach(id=>{ const e=document.getElementById(id);
    if(e) e.addEventListener('input',()=>{ lpReadLabels(); lpPreview(); }); });`,
`['lbFont','lbStyle','lbSize','lbColor','lbHalo','lbHaloW','lbCase','lbDec','lbPre','lbSuf']
  .forEach(id=>{ const e=document.getElementById(id);
    if(e) e.addEventListener('input',()=>{ lpReadLabels(); lpPreview(); }); });
{ const fx=document.getElementById('lbFormula');if(fx)fx.addEventListener('input',()=>{
    lpOptsAtivo(!!lpFormulaExpr()||!!(lpLayer&&lpLayer.labelField));lpPreview();
  }); }`,
    "prévia ao digitar fórmula");

  out=once(out,
`document.getElementById('lbApply').onclick=()=>{
  const L=lpLayer; if(!L) return;
  lpReadLabels();
  drawLayer(L); refreshUI();
  // reflete no seletor de rótulo do painel lateral
  const st=document.getElementById('stLabel'); if(st && S.activeId===L.id) st.value=L.labelField||'';
  layoutSeVisivel();
  { const cs2=labelCampos(L);
    toast(cs2.length? (cs2.length>1
        ? \`Rótulos por \${cs2.length} campos (\${cs2.join(', ')}) aplicados\`
        : \`Rótulos por "\${cs2[0]}" aplicados\`)
      : 'Rótulos removidos'); }
};`,
`document.getElementById('lbApply').onclick=()=>{
  const L=lpLayer; if(!L) return;
  lpReadLabels();
  const expr=lpFormulaExpr(),check=labelFormulaValida(expr,L);
  if(!check.ok){toast('Fórmula inválida: '+check.error);lpPreview();return;}
  labelCfg(L).expr=expr;L._labelExprCache=null;
  drawLayer(L); refreshUI();
  // reflete no seletor de rótulo do painel lateral
  const st=document.getElementById('stLabel'); if(st && S.activeId===L.id) st.value=expr?'__formula__':(L.labelField||'');
  layoutSeVisivel();
  { const cs2=labelCampos(L);
    toast(expr?'Rótulos por fórmula aplicados':cs2.length? (cs2.length>1
        ? \`Rótulos por \${cs2.length} campos (\${cs2.join(', ')}) aplicados\`
        : \`Rótulos por "\${cs2[0]}" aplicados\`)
      : 'Rótulos removidos'); }
};`,
    "aplicação validada da fórmula");

  out=once(out,
`    '<div style="margin-bottom:8px"><label class="field" style="font-size:11px">Rótulo (campo)</label>'+
      '<select id="ppRot"><option value="">— sem rótulo —</option>'+
      campos.map(c=>'<option'+(L.labelField===c?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select></div>'+`,
`    '<div style="margin-bottom:8px"><label class="field" style="font-size:11px">Rótulo (campo ou fórmula)</label>'+
      '<select id="ppRot"><option value="">— sem rótulo —</option>'+
      (String(labelCfg(L).expr||'').trim()?'<option value="__formula__" selected>ƒx Fórmula</option>':'')+
      campos.map(c=>'<option value="'+esc(c)+'"'+(!labelCfg(L).expr&&L.labelField===c?' selected':'')+'>'+esc(c)+'</option>').join('')+'</select></div>'+`,
    "fórmula no painel rápido");
  out=once(out,"  if(g('ppRot'))  g('ppRot').onchange=e=>{ L.labelField=e.target.value; aplica(); };",
    "  if(g('ppRot'))  g('ppRot').onchange=e=>{ if(e.target.value==='__formula__')return; labelCfg(L).expr='';L._labelExprCache=null;L.labelField=e.target.value;L.labelFields=e.target.value?[e.target.value]:null;aplica(); };",
    "troca rápida de fórmula para campo");

  out=once(out,
`  document.getElementById('stLabel').innerHTML='<option value="">— nenhum —</option>'+
    allFields.map(f=>\`<option value="\${f.name}" \${f.name===L.labelField?'selected':''}>\${f.name}</option>\`).join('');`,
`  document.getElementById('stLabel').innerHTML='<option value="">— nenhum —</option>'+
    (String(labelCfg(L).expr||'').trim()?'<option value="__formula__" selected>ƒx Fórmula</option>':'')+
    allFields.map(f=>\`<option value="\${f.name}" \${!labelCfg(L).expr&&f.name===L.labelField?'selected':''}>\${f.name}</option>\`).join('');`,
    "fórmula no seletor de simbologia");
  out=once(out,
`  L.labelField=document.getElementById('stLabel').value;
  drawLayer(L); refreshUI();`,
`  const novoRot=document.getElementById('stLabel').value;
  if(novoRot!=='__formula__'){labelCfg(L).expr='';L._labelExprCache=null;
    L.labelField=novoRot;L.labelFields=novoRot?[novoRot]:null;}
  drawLayer(L); refreshUI();`,
    "aplicação do seletor simples");

  out=once(out,
`  const nm=(L.labelField&&f.props[L.labelField]!=null&&f.props[L.labelField]!=='')?f.props[L.labelField]:('#'+idx);`,
`  const nm=labelText(L,f,idx)||('#'+idx);`,
    "nome da feição por fórmula");

  out=once(out,"  const c = L.labelField ? labelCfg(L) : null;",
    "  const c = labelAtivo(L) ? labelCfg(L) : null;","estilo KML por fórmula");
  out=countReplace(out,"<scale>${L.labelField?Math.max(0.6,(+(c&&c.size)||8)/9):0}</scale>",
    "<scale>${labelAtivo(L)?Math.max(0.6,(+(c&&c.size)||8)/9):0}</scale>",1,"escala do rótulo KML");
  out=once(out,"  const nome = (L.labelField && labelText(L,f)) || '';",
    "  const nome = (labelAtivo(L) && labelText(L,f)) || '';","texto KML por fórmula");

  out=once(out,
`/* rótulos (aba Rótulos) -> <labeling> do QGIS */
function qgsLabeling(L, esc2){
  if(!L.labelField) return '';
  const c=labelCfg(L);`,
`/* Traduz a parte compatível da fórmula para a sintaxe de expressões QGIS.
   KML/HTML já recebem o texto materializado; no QML esta tradução mantém
   campos, textos, geometria e as funções oferecidas pela interface. */
function qgsLabelFormula(L,c){
  let q=String(c.expr||'').trim();if(!q)return L.labelField||'';
  const fun={arredondar:'round',raiz:'sqrt',pot:'pow',se:'if',maiusc:'upper',minusc:'lower',
    titulo:'title',juntar:'concat',texto:'to_string',numero:'to_real',comprimento:'length',
    trecho:'substr',trocar:'replace',apara:'trim',formatar:'format_number'};
  Object.entries(fun).forEach(([a,b])=>{q=q.replace(new RegExp('\\\\b'+a+'\\\\s*\\\\(','gi'),b+'(');});
  q=q.replace(/\\$AREA_HA\\b/gi,'($area / 10000)').replace(/\\$AREA_M2\\b/gi,'$area')
    .replace(/\\$(?:COMPRIM|PERIM)\\b/gi,'$length')
    .replace(/\\$X\\b/gi,'x(centroid($geometry))').replace(/\\$Y\\b/gi,'y(centroid($geometry))')
    .replace(/\\$(?:ID|LINHA)\\b/gi,'$id');
  if(c.case==='upper')q='upper('+q+')';else if(c.case==='lower')q='lower('+q+')';else if(c.case==='title')q='title('+q+')';
  const lit=s=>"'"+String(s||'').replace(/'/g,"''")+"'";
  if(c.pre)q=lit(c.pre)+' || ('+q+')';if(c.suf)q='('+q+') || '+lit(c.suf);return q;
}
/* rótulos (aba Rótulos) -> <labeling> do QGIS */
function qgsLabeling(L, esc2){
  if(!labelAtivo(L)) return '';
  const c=labelCfg(L),isExpr=!!String(c.expr||'').trim(),qgsField=qgsLabelFormula(L,c);`,
    "expressão de rótulo no QGIS");
  out=once(out,
`    <text-style fieldName="\${esc2(L.labelField)}" isExpression="0" fontFamily="\${esc2(fam)}"`,
`    <text-style fieldName="\${esc2(qgsField)}" isExpression="\${isExpr?'1':'0'}" fontFamily="\${esc2(fam)}"`,
    "campo/expressão no QML");

  out=once(out,
`  S.layers.slice().reverse().filter(l=>l.visible && l.labelField).forEach(L=>{`,
`  S.layers.slice().reverse().filter(l=>l.visible && labelAtivo(l)).forEach(L=>{`,
    "fórmula no Layout");

  out=once(out,
`    const L={id:(o.id??uid++), name:o.name||'camada', gtype:o.gtype||'polygon',
      crs:(o.crs && CRS_DEFS[o.crs])?o.crs:S.workCRS,
      visible:o.visible!==false, labelField:o.labelField||'', lbl:{...defaultLabelCfg(), ...(o.lbl||{})},`,
`    const L={id:(o.id??uid++), name:o.name||'camada', gtype:o.gtype||'polygon',
      crs:(o.crs && CRS_DEFS[o.crs])?o.crs:S.workCRS,
      visible:o.visible!==false, labelField:o.labelField||'',
      labelFields:Array.isArray(o.labelFields)?o.labelFields.slice():null,
      lbl:{...defaultLabelCfg(), ...(o.lbl||{})},`,
    "restauração dos vários campos e da fórmula");

  out=once(out,
`        features:JSON.parse(JSON.stringify(src.features)),fields:JSON.parse(JSON.stringify(src.fields)),
        color:src.color,labelField:src.labelField,lbl:JSON.parse(JSON.stringify(src.lbl||{})),src:src.src});`,
`        features:JSON.parse(JSON.stringify(src.features)),fields:JSON.parse(JSON.stringify(src.fields)),
        color:src.color,labelField:src.labelField,labelFields:Array.isArray(src.labelFields)?src.labelFields.slice():null,
        lbl:JSON.parse(JSON.stringify(src.lbl||{})),src:src.src});`,
    "duplicação dos vários campos");

  return out;
}
