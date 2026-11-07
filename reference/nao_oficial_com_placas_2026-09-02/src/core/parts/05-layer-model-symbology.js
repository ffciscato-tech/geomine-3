/* ---------- Modelo de camada ---------- */
function addLayer(o){
  const palette=['#f5a524','#37c0aa','#e05252','#7aa2f7','#bb9af7','#9ece6a','#e0af68'];
  const col=o.color||palette[S.layers.length%palette.length];
  const L={id:uid++, name:o.name, gtype:o.gtype, features:o.features, fields:o.fields, crs:o.crs,
    color:col, weight:2, fill:0.35, visible:true,
    labelField:o.labelField||'', labelFields:Array.isArray(o.labelFields)?o.labelFields.slice():null,
    llayer:null, groupId:null,
    lbl:Object.assign(defaultLabelCfg(), o.lbl||{}),
    src:o.src||S._srcNow||null,          // arquivo de origem
    sym:{mode:'single', color:col, stroke:col, hatch:'solid', hatchScale:1, weight:2, fill:0.35, dash:'',
         field:'', classes:[], cats:[], ramp:'amber'}};
  /* Camada geográfica CONVERTE para o UTM de trabalho na entrada: shapefile
     oficial vem em SIRGAS geográfica, e mantê-la em graus deixava coordenada,
     tabela e exportação fora do padrão do projeto. A conversão é física — a
     geometria passa a metros — e o rótulo da camada passa a dizer a verdade. */
  if(/4326|4674|4618/.test(String(L.crs)) && !/4326|4674|4618/.test(String(S.workCRS))){
    try{
      const cv=p=>{ const c2=fromWGS(S.workCRS,p[0],p[1]); p[0]=c2[0]; p[1]=c2[1]; };
      (L.features||[]).forEach(f=>{ (function walk(g){ if(!Array.isArray(g)) return;
        if(typeof g[0]==='number'){ cv(g); return; } g.forEach(walk); })(f.geom); });
      L.crs=S.workCRS;
      L._convertidoDeGeo=true;
    }catch(e){ console.warn('conversão para UTM na importação',e); }
  }
  S.layers.unshift(L); S.activeId=L.id; drawLayer(L); zApply();
  toast(`${L.name}: ${L.features.length} feições · ${CRS_LABELS[L.crs]||L.crs}`);
  // Vetores permanecem dentro do .ccmgis. A pasta de trabalho é a base
  // externa apenas dos rasters em resolução plena. A camada precisa ser
  // devolvida mesmo quando nasce vazia (caso dos comandos de desenho).
  return L;
}
function activeLayer(){ return S.layers.find(l=>l.id===S.activeId); }
/* Área de transferência de estilo entre camadas. Copia a simbologia inteira
   (inclusive classes/categorias, hachuras e símbolos de ponto) e os rótulos,
   mas nunca geometria, atributos, filtro ou visibilidade da camada. */
function layerStyleCopy(L){
  if(!L||!L.sym)return false;
  S._layerStyleClipboard={
    sourceId:L.id,sourceName:L.name,gtype:L.gtype,
    sym:JSON.parse(JSON.stringify(L.sym)),
    color:L.color,weight:L.weight,fill:L.fill,
    labelField:L.labelField||'',labelFields:Array.isArray(L.labelFields)?L.labelFields.slice():null,
    lbl:JSON.parse(JSON.stringify(L.lbl||defaultLabelCfg()))
  };
  toast('Estilo copiado de "'+L.name+'"');
  try{propRefresh();}catch(e){}
  return true;
}
function layerStylePaste(L){
  const c=S._layerStyleClipboard;
  if(!L||!c){toast('Copie primeiro o estilo de uma camada');return false;}
  if(c.gtype!==L.gtype){
    toast('O estilo é de '+c.gtype+' e não pode ser aplicado a uma camada '+L.gtype);
    return false;
  }
  L.sym=JSON.parse(JSON.stringify(c.sym));
  L.color=c.color;L.weight=c.weight;L.fill=c.fill;
  const campos=new Set((L.fields||[]).map(f=>typeof f==='string'?f:f&&f.name).filter(Boolean));
  const classField=L.sym&&L.sym.field;
  const labelOk=!c.labelField||campos.has(c.labelField);
  L.labelField=labelOk?c.labelField:'';
  /* Ao colar estilo em outra camada, só entram os campos que ela realmente
     tem (mais os virtuais de geometria) — o resto é descartado em silêncio. */
  L.labelFields=Array.isArray(c.labelFields)
    ? c.labelFields.filter(n=>n.charAt(0)==='$'||campos.has(n)) : null;
  if(L.labelFields && !L.labelFields.length) L.labelFields=null;
  if(L.labelFields && !L.labelField) L.labelField=L.labelFields[0];
  L.lbl=JSON.parse(JSON.stringify(c.lbl||defaultLabelCfg()));
  drawLayer(L);refreshUI();
  try{layoutSeVisivel();}catch(e){}
  if(classField&&!campos.has(classField))
    toast('Estilo colado; o campo de classificação "'+classField+'" não existe nesta camada');
  else toast('Estilo de "'+c.sourceName+'" colado em "'+L.name+'"');
  return true;
}
/* Fonte vetorial de qualquer processamento. A seleção explícita no painel
   manda sempre; uma seleção antiga de feição nunca pode redirecionar o
   comando silenciosamente para outra camada. */
function processingLayer(){
  const A=activeLayer();
  if(A)return A;
  if(S.selRaster)return null;
  if(window.ED&&ED.sel&&ED.sel.L)return ED.sel.L;
  return (S.selFeat&&S.selFeat.layer)||null;
}

/* ---------- Rampa de cores ---------- */
const RAMPS={
  amber:['#fff3c4','#fee391','#fec44f','#fe9929','#ec7014','#cc4c02','#8c2d04'],
  viridis:['#440154','#3b528b','#21918c','#5ec962','#fde725'],
  blues:['#deebf7','#9ecae1','#6baed6','#3182bd','#08519c'],
  spectral:['#d53e4f','#fc8d59','#fee08b','#e6f598','#99d594','#3288bd'],
  earth:['#f6e8c3','#dfc27d','#bf812d','#8c510a','#543005'],
};
/* CORES ALEATÓRIAS — para categorias (litologia, nome, tipo), onde uma rampa
   contínua confunde: dois valores vizinhos saem quase da mesma cor. Aqui as
   matizes são espalhadas pelo ÂNGULO DE OURO (137,508°) a partir de um começo
   sorteado, e saturação/claridade alternam em três faixas: nenhum par fica
   parecido, mesmo com 20+ classes, e cada clique em "Gerar / regerar" traz um
   conjunto novo. Nada de aleatório puro (que produz cores repetidas e ilegíveis). */
function coresAleatorias(n){
  const out=[]; let m=Math.random()*360;
  const S=[62,74,52], L=[52,42,62];
  for(let i=0;i<n;i++){
    m=(m+137.508)%360;
    out.push(hslParaHex(m, S[i%3], L[i%3]));
  }
  return out;
}
function hslParaHex(hh,ss,ll){
  const s=ss/100, l=ll/100;
  const c=(1-Math.abs(2*l-1))*s, x=c*(1-Math.abs(((hh/60)%2)-1)), m0=l-c/2;
  let r=0,g=0,b=0;
  if(hh<60){r=c;g=x;} else if(hh<120){r=x;g=c;} else if(hh<180){g=c;b=x;}
  else if(hh<240){g=x;b=c;} else if(hh<300){r=x;b=c;} else {r=c;b=x;}
  const q=v=>Math.round((v+m0)*255).toString(16).padStart(2,'0');
  return '#'+q(r)+q(g)+q(b);
}
function rampColors(name,n){
  if(name==='aleatorio') return coresAleatorias(n);
  const base=RAMPS[name]||RAMPS.amber; const out=[];
  for(let i=0;i<n;i++){ const t=n===1?0:i/(n-1); const x=t*(base.length-1); const a=Math.floor(x), b=Math.min(a+1,base.length-1);
    out.push(lerpHex(base[a],base[b],x-a)); } return out; }
function lerpHex(c1,c2,t){ const p=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
  const a=p(c1),b=p(c2); const m=a.map((v,i)=>Math.round(v+(b[i]-v)*t));
  return '#'+m.map(v=>v.toString(16).padStart(2,'0')).join(''); }

/* ---------- Estilo por feição (respeita classificação) ---------- */
function classOf(L,f){
  const s=L.sym;
  if(s.mode==='grad' && s.field && s.classes.length){
    const v=+f.props[s.field];
    return s.classes.find(c=>v>=c.min && v<=c.max)||null;
  }
  if(s.mode==='cat' && s.field && s.cats.length){
    const v=String(f.props[s.field]);
    return s.cats.find(c=>String(c.value)===v)||null;
  }
  return null;
}
/* Filtro de atributos da camada. É apenas visual/operacional: as feições
   originais continuam intactas e reaparecem integralmente ao limpar. */
function attrFilterNumber(v){
  if(typeof v==='number')return Number.isFinite(v)?v:NaN;
  const s=String(v??'').trim();if(!s)return NaN;
  return Number(s.includes(',')&&!s.includes('.')?s.replace(',','.'):s);
}
function attrFilterMatch(L,f){
  const q=L&&L.attrFilter;if(!q||q.enabled===false||!q.field)return true;
  const raw=f&&f.props?f.props[q.field]:null,s=String(raw??''),val=String(q.value??''),op=q.op||'eq';
  const a=q.caseSensitive?s:s.toLocaleLowerCase('pt-BR'),b=q.caseSensitive?val:val.toLocaleLowerCase('pt-BR');
  const fd=(L.fields||[]).find(x=>(typeof x==='string'?x:x&&x.name)===q.field),numeric=typeof raw==='number'||(fd&&['N','F'].includes(fd.type));
  const nr=attrFilterNumber(raw),nv=attrFilterNumber(val);
  if(op==='empty')return raw==null||s.trim()==='';
  if(op==='notempty')return raw!=null&&s.trim()!=='';
  if(op==='eq')return numeric&&Number.isFinite(nr)&&Number.isFinite(nv)?nr===nv:a===b;
  if(op==='neq')return numeric&&Number.isFinite(nr)&&Number.isFinite(nv)?nr!==nv:a!==b;
  if(op==='contains')return a.includes(b);
  if(op==='notcontains')return !a.includes(b);
  if(op==='starts')return a.startsWith(b);
  if(op==='ends')return a.endsWith(b);
  if(op==='in'){
    const set=new Set(val.split(/[;,|]/).map(x=>(q.caseSensitive?x:x.toLocaleLowerCase('pt-BR')).trim()).filter(Boolean));
    return set.has(a.trim());
  }
  const n=nr,v=nv,v2=attrFilterNumber(q.value2);
  if(!Number.isFinite(n)||!Number.isFinite(v))return false;
  if(op==='gt')return n>v;if(op==='gte')return n>=v;if(op==='lt')return n<v;if(op==='lte')return n<=v;
  if(op==='between')return Number.isFinite(v2)&&n>=Math.min(v,v2)&&n<=Math.max(v,v2);
  return true;
}
function featureVisible(L,f){ const c=classOf(L,f); return !(c && c.vis===false) && attrFilterMatch(L,f); }
function attrFilterCount(L){let n=0;(L.features||[]).forEach(f=>{if(f&&f.geom&&attrFilterMatch(L,f))n++;});return n;}
function featureStyle(L,f){
  const s=L.sym;
  const mix=(c)=>({color:c.color, stroke:c.stroke||c.color, hatch:c.hatch??s.hatch,
    hatchScale:c.hatchScale??s.hatchScale??1,
    weight:c.weight??s.weight, fill:c.fill??s.fill, dash:c.dash??s.dash});
  /* Numa superfície final de bacia, o contorno é apenas o limite único de
     recorte. Preenchê-lo novamente sobre pista/taludes/caixa escurece tudo e
     dá a impressão de superfícies sobrepostas. */
  if(L.tinSurface && /^(Contorno fundido|Limite externo)$/i.test(String((f.props||{}).TIPO||'')))
    return {color:s.color,stroke:s.stroke,hatch:'none',weight:Math.max(2,+s.weight||2),fill:0,dash:s.dash};
  if(s.mode==='grad'||s.mode==='cat'){
    const c=classOf(L,f);
    if(c) return mix(c);
    if((s.mode==='grad'&&s.classes.length)||(s.mode==='cat'&&s.cats.length))
      return {color:'#666',stroke:'#666',hatch:'none',weight:s.weight,fill:s.fill,dash:s.dash};
  }
  return {color:s.color,stroke:s.stroke,hatch:s.hatch,hatchScale:s.hatchScale??1,weight:s.weight,fill:s.fill,dash:s.dash};
}
/* ---------- Biblioteca de padrões (básicos + litologias geológicas) ---------- */
const SVGNS='http://www.w3.org/2000/svg';
const PATTERN_TPL={
  // básicos
  fdiagonal:{w:6,h:6,b:c=>`<path d="M0,6 L6,0" stroke="${c}" stroke-width="1" fill="none"/>`},
  bdiagonal:{w:6,h:6,b:c=>`<path d="M0,0 L6,6" stroke="${c}" stroke-width="1" fill="none"/>`},
  cross:{w:6,h:6,b:c=>`<path d="M0,6 L6,0 M0,0 L6,6" stroke="${c}" stroke-width="0.8" fill="none"/>`},
  horizontal:{w:6,h:6,b:c=>`<path d="M0,3 H6" stroke="${c}" stroke-width="1"/>`},
  vertical:{w:6,h:6,b:c=>`<path d="M3,0 V6" stroke="${c}" stroke-width="1"/>`},
  dots:{w:5,h:5,b:c=>`<circle cx="2.5" cy="2.5" r="1" fill="${c}"/>`},
  // litologias (convenção de mapa geológico)
  // — Sedimentares —
  geo_calcario:{w:16,h:10,b:c=>`<path d="M0,0 H16 M0,5 H16 M8,0 V5 M0,5 V10 M16,5 V10" stroke="${c}" stroke-width="0.9" fill="none"/>`},
  geo_dolomito:{w:16,h:10,b:c=>`<path d="M0,0 H16 M0,5 H16 M8,0 L10.5,5 M0,5 L2.5,10" stroke="${c}" stroke-width="0.9" fill="none"/>`},
  geo_marga:{w:16,h:10,b:c=>`<path d="M0,0 H16 M0,5 H16 M8,0 V5 M0,5 V10 M16,5 V10" stroke="${c}" stroke-width="0.8" fill="none"/><circle cx="4" cy="2.5" r="0.6" fill="${c}"/><circle cx="12" cy="7.5" r="0.6" fill="${c}"/>`},
  geo_arenito:{w:12,h:12,b:c=>`<circle cx="2" cy="2.5" r="0.65" fill="${c}"/><circle cx="7" cy="4" r="0.65" fill="${c}"/><circle cx="11" cy="1.5" r="0.65" fill="${c}"/><circle cx="4" cy="8" r="0.65" fill="${c}"/><circle cx="9.5" cy="9.5" r="0.65" fill="${c}"/><circle cx="1" cy="11" r="0.65" fill="${c}"/>`},
  geo_siltito:{w:14,h:10,b:c=>`<path d="M0,2.5 H4.5 M8.5,2.5 H14 M2,7.5 H6.5 M10.5,7.5 H14" stroke="${c}" stroke-width="0.9"/><circle cx="6.5" cy="2.5" r="0.55" fill="${c}"/><circle cx="8.5" cy="7.5" r="0.55" fill="${c}"/>`},
  geo_argilito:{w:12,h:8,b:c=>`<path d="M0,2 H5 M7,2 H12 M0,6 H3 M5,6 H10" stroke="${c}" stroke-width="0.9"/>`},
  geo_folhelho:{w:12,h:8,b:c=>`<path d="M0,2 H12 M0,6 H7 M9,6 H12" stroke="${c}" stroke-width="0.7"/>`},
  geo_conglomerado:{w:18,h:13,b:c=>`<ellipse cx="4.5" cy="4" rx="2.6" ry="1.8" fill="none" stroke="${c}" stroke-width="0.8"/><ellipse cx="13" cy="9.5" rx="2.2" ry="1.5" fill="none" stroke="${c}" stroke-width="0.8"/><circle cx="12" cy="3" r="0.7" fill="${c}"/><circle cx="6" cy="10" r="0.7" fill="${c}"/><circle cx="16.5" cy="5" r="0.6" fill="${c}"/>`},
  geo_brecha:{w:16,h:12,b:c=>`<path d="M2,3 l3,-1.6 l1.1,3 z M10,7.5 l3.4,-1.1 l0.5,3 z M12.5,2 l2.4,1 l-1.6,1.9 z" stroke="${c}" stroke-width="0.7" fill="none"/><circle cx="6.5" cy="9" r="0.55" fill="${c}"/>`},
  geo_carvao:{w:10,h:6,b:c=>`<path d="M0,1.4 H10 M0,4.4 H10" stroke="${c}" stroke-width="1.7"/>`},
  geo_evaporito:{w:12,h:10,b:c=>`<path d="M1,8 l3,-3 M7,4 l3,-3" stroke="${c}" stroke-width="0.8"/><circle cx="4.5" cy="2.2" r="0.55" fill="${c}"/><circle cx="9.5" cy="8" r="0.55" fill="${c}"/>`},
  // — Metamórficas —
  geo_quartzito:{w:16,h:10,b:c=>`<path d="M0,0 H16 M0,5 H16 M8,0 V5 M0,5 V10 M16,5 V10" stroke="${c}" stroke-width="0.8" fill="none"/><path d="M2,1.2 L6,3.8 M10,6.2 L14,8.8" stroke="${c}" stroke-width="0.6"/>`},
  geo_marmore:{w:16,h:10,b:c=>`<path d="M0,0 H16 M0,5 H16 M8,0 V5 M0,5 V10 M16,5 V10" stroke="${c}" stroke-width="0.8" fill="none"/><path d="M2,4 l3,-3 M10,9 l3,-3" stroke="${c}" stroke-width="0.6"/>`},
  geo_ardosia:{w:8,h:8,b:c=>`<path d="M0,8 L3,0 M4,8 L7,0" stroke="${c}" stroke-width="0.6" fill="none"/>`},
  geo_filito:{w:14,h:8,b:c=>`<path d="M0,2 q3.5,-1.6 7,0 t7,0 M0,5.5 q3.5,-1.6 7,0 t7,0" stroke="${c}" stroke-width="0.55" fill="none"/>`},
  geo_xisto:{w:14,h:10,b:c=>`<path d="M1,3 l4,-1 M8,2.4 l4,-1 M3,7 l4,-1 M10,6.4 l4,-1" stroke="${c}" stroke-width="0.8" fill="none"/>`},
  geo_gnaisse:{w:16,h:10,b:c=>`<path d="M0,3 q4,-2.6 8,0 t8,0 M0,8 q4,-2.6 8,0 t8,0" stroke="${c}" stroke-width="0.8" fill="none"/>`},
  // — Ígneas —
  geo_granito:{w:14,h:14,b:c=>`<path d="M3,2 v3 M1.5,3.5 h3 M10,8 v3 M8.5,9.5 h3 M11,2.5 l2,1 M3.5,11 l2,1" stroke="${c}" stroke-width="0.8" fill="none"/>`},
  geo_riolito:{w:14,h:12,b:c=>`<path d="M2,3 l1.3,1.9 l1.3,-1.9 M8.5,8 l1.3,1.9 l1.3,-1.9" stroke="${c}" stroke-width="0.8" fill="none"/><circle cx="10" cy="3" r="0.6" fill="${c}"/><circle cx="4" cy="9" r="0.6" fill="${c}"/>`},
  geo_diabasio:{w:14,h:12,b:c=>`<path d="M2,2 l2.5,1 M9,3.5 l-1,2.4 M4,8 l2.5,-1 M11,8.5 l1.5,2" stroke="${c}" stroke-width="0.9" fill="none"/>`},
  geo_basalto:{w:14,h:12,b:c=>`<path d="M2,3 l2,3 l2,-3 M8,8 l2,3 l2,-3" stroke="${c}" stroke-width="0.9" fill="none"/>`},
  // — Coberturas —
  geo_solo:{w:12,h:10,b:c=>`<path d="M1.5,2 l2.2,0.9 M7.5,3.8 l2.2,-0.9 M3,7.5 l2.2,0.9 M9,8.8 l2,-0.8" stroke="${c}" stroke-width="0.9" fill="none"/>`},
  geo_laterita:{w:11,h:10,b:c=>`<circle cx="2" cy="2" r="0.85" fill="${c}"/><circle cx="6.5" cy="4.5" r="0.85" fill="${c}"/><circle cx="10" cy="1.5" r="0.85" fill="${c}"/><circle cx="3.5" cy="8" r="0.85" fill="${c}"/><circle cx="8.5" cy="8.5" r="0.85" fill="${c}"/>`},
  geo_aluviao:{w:12,h:8,b:c=>`<circle cx="3" cy="2" r="0.6" fill="${c}"/><circle cx="9" cy="2" r="0.6" fill="${c}"/><path d="M0,6 H4 M7,6 H11" stroke="${c}" stroke-width="0.8"/>`},
};

/* Grupos de hachura (fonte única para todos os seletores) */
const HATCH_GROUPS=[
  {label:null, items:[['solid','Sólido'],['none','Sem preenchimento']]},
  {label:'Básicos', items:[['fdiagonal','Diagonal ╱'],['bdiagonal','Diagonal ╲'],['cross','Malha ▦'],
    ['horizontal','Horizontal ▬'],['vertical','Vertical ▮'],['dots','Pontilhado ⋯']]},
  {label:'Sedimentares', items:[['geo_calcario','Calcário'],['geo_dolomito','Dolomito'],['geo_marga','Marga'],
    ['geo_arenito','Arenito'],['geo_siltito','Siltito'],['geo_argilito','Argilito'],['geo_folhelho','Folhelho'],
    ['geo_conglomerado','Conglomerado'],['geo_brecha','Brecha'],['geo_carvao','Carvão'],['geo_evaporito','Evaporito / Gipsita']]},
  {label:'Metamórficas', items:[['geo_quartzito','Quartzito'],['geo_marmore','Mármore'],['geo_ardosia','Ardósia'],
    ['geo_filito','Filito'],['geo_xisto','Xisto'],['geo_gnaisse','Gnaisse']]},
  {label:'Ígneas', items:[['geo_granito','Granito / Plutônica'],['geo_riolito','Riolito / Vulcânica ácida'],
    ['geo_diabasio','Diabásio / Gabro'],['geo_basalto','Basalto']]},
  {label:'Coberturas', items:[['geo_solo','Solo / Saprolito'],['geo_laterita','Laterita'],['geo_aluviao','Aluvião']]},
];
function hatchOptionsHTML(cur){
  return HATCH_GROUPS.map(g=>{
    const opts=g.items.map(([v,l])=>`<option value="${v}" ${v===cur?'selected':''}>${l}</option>`).join('');
    return g.label?`<optgroup label="${g.label}">${opts}</optgroup>`:opts;
  }).join('');
}
/* Aumenta a distância entre as repetições sem engrossar os traços/pontos.
   O desenho do motivo cresce com a célula, mas a espessura visual permanece
   igual — "espaçamento" não deve transformar uma hachura fina em faixa. */
function hatchBodyAtSpacing(tpl,color,spacing){
  const hs=Math.max(.25,Math.min(8,+spacing||1));
  let b=tpl.b(color);
  if(Math.abs(hs-1)<1e-9)return b;
  b=b.replace(/stroke-width="([0-9.]+)"/g,(_,v)=>`stroke-width="${(+v/hs).toFixed(4)}"`);
  b=b.replace(/\br="([0-9.]+)"/g,(_,v)=>`r="${(+v/hs).toFixed(4)}"`);
  return b;
}

/* ============================================================================
   SÍMBOLOS DE PONTO — geométricos, de campo/mina e estruturais (padrão USGS
   FGDC 4.2). Cada símbolo desenha num quadro de -10..10; f = preenchimento,
   k = contorno, w = espessura. Símbolos "oriented" giram pelo azimute da
   DIREÇÃO (strike, regra da mão direita: mergulho à direita da direção) —
   no quadro sem rotação a direção aponta para o NORTE e o traço de mergulho
   para LESTE.
   ========================================================================== */
const PT_SYMS={
  /* — Geométricos — */
  circle:   {lb:'Círculo',            g:'Geométricos', d:(f,k,w)=>`<circle r="6.5" fill="${f}" stroke="${k}" stroke-width="${w}"/>`},
  circle_o: {lb:'Círculo vazado',     g:'Geométricos', d:(f,k,w)=>`<circle r="6.5" fill="none" stroke="${k}" stroke-width="${w}"/>`},
  dot:      {lb:'Ponto',              g:'Geométricos', d:(f,k,w)=>`<circle r="3" fill="${f}"/>`},
  ring:     {lb:'Anel',               g:'Geométricos', d:(f,k,w)=>`<circle r="6.5" fill="none" stroke="${k}" stroke-width="${w*2}"/>`},
  square:   {lb:'Quadrado',           g:'Geométricos', d:(f,k,w)=>`<rect x="-5.5" y="-5.5" width="11" height="11" fill="${f}" stroke="${k}" stroke-width="${w}"/>`},
  square_o: {lb:'Quadrado vazado',    g:'Geométricos', d:(f,k,w)=>`<rect x="-5.5" y="-5.5" width="11" height="11" fill="none" stroke="${k}" stroke-width="${w}"/>`},
  diamond:  {lb:'Losango',            g:'Geométricos', d:(f,k,w)=>`<path d="M0,-7 L7,0 L0,7 L-7,0 Z" fill="${f}" stroke="${k}" stroke-width="${w}"/>`},
  diamond_o:{lb:'Losango vazado',     g:'Geométricos', d:(f,k,w)=>`<path d="M0,-7 L7,0 L0,7 L-7,0 Z" fill="none" stroke="${k}" stroke-width="${w}"/>`},
  tri:      {lb:'Triângulo',          g:'Geométricos', d:(f,k,w)=>`<path d="M0,-7 L6.4,4.5 L-6.4,4.5 Z" fill="${f}" stroke="${k}" stroke-width="${w}"/>`},
  tri_o:    {lb:'Triângulo vazado',   g:'Geométricos', d:(f,k,w)=>`<path d="M0,-7 L6.4,4.5 L-6.4,4.5 Z" fill="none" stroke="${k}" stroke-width="${w}"/>`},
  tri_dn:   {lb:'Triângulo invertido',g:'Geométricos', d:(f,k,w)=>`<path d="M0,7 L6.4,-4.5 L-6.4,-4.5 Z" fill="${f}" stroke="${k}" stroke-width="${w}"/>`},
  penta:    {lb:'Pentágono',          g:'Geométricos', d:(f,k,w)=>`<path d="M0,-7 L6.7,-2.2 L4.1,5.7 L-4.1,5.7 L-6.7,-2.2 Z" fill="${f}" stroke="${k}" stroke-width="${w}"/>`},
  hexa:     {lb:'Hexágono',           g:'Geométricos', d:(f,k,w)=>`<path d="M6,0 L3,5.2 L-3,5.2 L-6,0 L-3,-5.2 L3,-5.2 Z" fill="${f}" stroke="${k}" stroke-width="${w}"/>`},
  star:     {lb:'Estrela',            g:'Geométricos', d:(f,k,w)=>`<path d="M0,-7.5 L1.8,-2.3 L7.2,-2.3 L2.8,1 L4.5,6.2 L0,3 L-4.5,6.2 L-2.8,1 L-7.2,-2.3 L-1.8,-2.3 Z" fill="${f}" stroke="${k}" stroke-width="${w*0.8}"/>`},
  cross:    {lb:'Cruz (+)',           g:'Geométricos', d:(f,k,w)=>`<path d="M0,-7 V7 M-7,0 H7" stroke="${k}" stroke-width="${w*1.4}" fill="none"/>`},
  xmark:    {lb:'X',                  g:'Geométricos', d:(f,k,w)=>`<path d="M-5.5,-5.5 L5.5,5.5 M-5.5,5.5 L5.5,-5.5" stroke="${k}" stroke-width="${w*1.4}" fill="none"/>`},
  half:     {lb:'Meio círculo',       g:'Geométricos', d:(f,k,w)=>`<path d="M-6.5,0 A6.5,6.5 0 0 1 6.5,0 Z" fill="${f}" stroke="${k}" stroke-width="${w}"/>`},
  pin:      {lb:'Alfinete',           g:'Geométricos', d:(f,k,w)=>`<path d="M0,8 C-5,1 -6,-1 -6,-3.4 A6,6 0 1 1 6,-3.4 C6,-1 5,1 0,8 Z" fill="${f}" stroke="${k}" stroke-width="${w}"/><circle cy="-3.4" r="2.1" fill="#fff"/>`},
  flag:     {lb:'Bandeira',           g:'Geométricos', d:(f,k,w)=>`<path d="M-3,8 V-7 H5.5 L3,-3.7 L5.5,-0.4 H-3" fill="${f}" stroke="${k}" stroke-width="${w}"/>`},
  arrow:    {lb:'Seta (N)',           g:'Geométricos', d:(f,k,w)=>`<path d="M0,7 V-4 M0,-7 L-3.4,-1.6 H3.4 Z" stroke="${k}" stroke-width="${w*1.2}" fill="${f}"/>`, oriented:true},
  /* — Campo / Mina — */
  drill:    {lb:'Furo de sondagem',   g:'Campo · Mina', d:(f,k,w)=>`<circle r="5.6" fill="none" stroke="${k}" stroke-width="${w}"/><path d="M0,-5.6 V5.6 M-5.6,0 H5.6" stroke="${k}" stroke-width="${w}"/>`},
  drill_x:  {lb:'Furo executado',     g:'Campo · Mina', d:(f,k,w)=>`<circle r="5.6" fill="none" stroke="${k}" stroke-width="${w}"/><path d="M-5.6,0 A5.6,5.6 0 0 1 5.6,0 Z" fill="${f}"/><path d="M0,-5.6 V5.6" stroke="${k}" stroke-width="${w}"/>`},
  well:     {lb:'Poço',               g:'Campo · Mina', d:(f,k,w)=>`<circle r="4.6" fill="none" stroke="${k}" stroke-width="${w}"/><circle r="1.4" fill="${k}"/>`},
  spring:   {lb:'Nascente',           g:'Campo · Mina', d:(f,k,w)=>`<circle r="3.4" fill="${f}" stroke="${k}" stroke-width="${w}"/><path d="M2.4,2.4 q4,1.4 5.6,5.2" fill="none" stroke="${k}" stroke-width="${w*1.2}"/>`},
  mine:     {lb:'Mina (picaretas)',   g:'Campo · Mina', d:(f,k,w)=>`<path d="M-6.5,5 L5,-6.5 M-5,-6.5 L6.5,5" stroke="${k}" stroke-width="${w*1.3}"/><path d="M-7,-4.2 Q0,-9.5 7,-4.2 M-7,-4.2 Q0,-7.6 7,-4.2" fill="none" stroke="${k}" stroke-width="${w}"/>`},
  quarry:   {lb:'Cava / pedreira',    g:'Campo · Mina', d:(f,k,w)=>`<path d="M-7,3 L-2.4,3 L0,-4 L2.4,3 L7,3" fill="none" stroke="${k}" stroke-width="${w*1.2}"/><path d="M-4.6,3 L-3.2,6 M4.6,3 L3.2,6" stroke="${k}" stroke-width="${w}"/>`},
  adit:     {lb:'Galeria (portal)',   g:'Campo · Mina', d:(f,k,w)=>`<path d="M-5.5,5.5 V-1 A5.5,5.5 0 0 1 5.5,-1 V5.5" fill="none" stroke="${k}" stroke-width="${w*1.2}"/><path d="M-5.5,5.5 H5.5" stroke="${k}" stroke-width="${w*1.2}"/>`},
  shaft:    {lb:'Poço de mina',       g:'Campo · Mina', d:(f,k,w)=>`<rect x="-4.8" y="-4.8" width="9.6" height="9.6" fill="none" stroke="${k}" stroke-width="${w}"/><path d="M-4.8,-4.8 L4.8,4.8 M-4.8,4.8 L4.8,-4.8" stroke="${k}" stroke-width="${w}"/>`},
  prospect: {lb:'Ocorrência (pique)', g:'Campo · Mina', d:(f,k,w)=>`<path d="M-4.6,-4.6 L4.6,4.6 M-4.6,4.6 L4.6,-4.6 M-6.4,-2.8 L-2.8,-6.4 M2.8,6.4 L6.4,2.8 M-6.4,2.8 L-2.8,6.4 M2.8,-6.4 L6.4,-2.8" stroke="${k}" stroke-width="${w}"/>`},
  trench:   {lb:'Trincheira',         g:'Campo · Mina', d:(f,k,w)=>`<rect x="-7" y="-2.4" width="14" height="4.8" fill="none" stroke="${k}" stroke-width="${w}" stroke-dasharray="2.4 1.6"/>`, oriented:true},
  sample:   {lb:'Amostra',            g:'Campo · Mina', d:(f,k,w)=>`<path d="M0,-5.2 L4.8,3.4 L-4.8,3.4 Z" fill="${f}" stroke="${k}" stroke-width="${w}"/><circle cy="0.6" r="1.1" fill="#fff"/>`},
  station:  {lb:'Estação topográfica',g:'Campo · Mina', d:(f,k,w)=>`<path d="M0,-6.4 L5.9,4.2 L-5.9,4.2 Z" fill="none" stroke="${k}" stroke-width="${w}"/><circle cy="0.6" r="1.3" fill="${k}"/>`},
  bench:    {lb:'RN / marco',         g:'Campo · Mina', d:(f,k,w)=>`<path d="M0,-6.4 L5.9,4.2 L-5.9,4.2 Z" fill="none" stroke="${k}" stroke-width="${w}"/><path d="M0,-3 V2.4 M-2.6,-0.3 H2.6" stroke="${k}" stroke-width="${w}"/>`},
  cave:     {lb:'Caverna / dolina',   g:'Campo · Mina', d:(f,k,w)=>`<path d="M-6,3.6 A6,6 0 0 1 6,3.6" fill="none" stroke="${k}" stroke-width="${w*1.2}"/><path d="M-6,3.6 H6" stroke="${k}" stroke-width="${w}" stroke-dasharray="2 1.6"/>`},
  /* — Estruturais (USGS FGDC) — */
  sd_bed:   {lb:'Acamamento — direção/mergulho', g:'Estruturais (USGS)', oriented:true, dip:true,
             d:(f,k,w)=>`<path d="M0,-9 V9 M0,0 H5" stroke="${k}" stroke-width="${w*1.3}" fill="none"/>`},
  sd_bed_hz:{lb:'Acamamento horizontal', g:'Estruturais (USGS)',
             d:(f,k,w)=>`<circle r="5.6" fill="none" stroke="${k}" stroke-width="${w}"/><path d="M0,-5.6 V5.6 M-5.6,0 H5.6" stroke="${k}" stroke-width="${w}"/>`},
  sd_bed_vt:{lb:'Acamamento vertical', g:'Estruturais (USGS)', oriented:true,
             d:(f,k,w)=>`<path d="M0,-9 V9 M-4.5,0 H4.5" stroke="${k}" stroke-width="${w*1.3}" fill="none"/>`},
  sd_bed_ov:{lb:'Acamamento invertido', g:'Estruturais (USGS)', oriented:true, dip:true,
             d:(f,k,w)=>`<path d="M0,-9 V9 M0,0 C2.8,0 4.6,-1.4 4.6,-3.6 M4.6,-3.6 L3.2,-2.2 M4.6,-3.6 L6,-2.5" stroke="${k}" stroke-width="${w*1.2}" fill="none"/>`},
  sd_fol:   {lb:'Foliação — direção/mergulho', g:'Estruturais (USGS)', oriented:true, dip:true,
             d:(f,k,w)=>`<path d="M0,-9 V9" stroke="${k}" stroke-width="${w*1.3}"/><path d="M0,-2.2 L4.6,0 L0,2.2 Z" fill="${k}"/>`},
  sd_fol_vt:{lb:'Foliação vertical', g:'Estruturais (USGS)', oriented:true,
             d:(f,k,w)=>`<path d="M0,-9 V9" stroke="${k}" stroke-width="${w*1.3}"/><path d="M0,-2.2 L4.2,0 L0,2.2 Z M0,-2.2 L-4.2,0 L0,2.2 Z" fill="${k}"/>`},
  sd_joint: {lb:'Fratura/junta — direção/mergulho', g:'Estruturais (USGS)', oriented:true, dip:true,
             d:(f,k,w)=>`<path d="M0,-9 V9 M-0,0 H4.6 M3.2,-1.4 V1.4 M4.6,-1.4 V1.4" stroke="${k}" stroke-width="${w}" fill="none"/>`},
  lineation:{lb:'Lineação (caimento)', g:'Estruturais (USGS)', oriented:true, dip:true,
             d:(f,k,w)=>`<path d="M0,7 V-4.4" stroke="${k}" stroke-width="${w*1.3}"/><path d="M0,-8 L-2.8,-3.6 H2.8 Z" fill="${k}"/>`},
  foldaxis: {lb:'Eixo de dobra', g:'Estruturais (USGS)', oriented:true, dip:true,
             d:(f,k,w)=>`<path d="M0,9 V-5" stroke="${k}" stroke-width="${w*1.3}"/><path d="M0,-9 L-3.2,-4 H3.2 Z" fill="${k}"/><path d="M-3.4,5.5 Q0,2.5 3.4,5.5" fill="none" stroke="${k}" stroke-width="${w}"/>`},
  vein:     {lb:'Veio', g:'Estruturais (USGS)', oriented:true,
             d:(f,k,w)=>`<path d="M0,-8 L1.6,-5 L-1.6,-2 L1.6,1 L-1.6,4 L0,8" fill="none" stroke="${k}" stroke-width="${w*1.2}"/>`},
  contact:  {lb:'Ponto de contato', g:'Estruturais (USGS)',
             d:(f,k,w)=>`<circle r="2.2" fill="${k}"/><circle r="5.4" fill="none" stroke="${k}" stroke-width="${w*0.8}" stroke-dasharray="2.2 1.8"/>`},
  fossil:   {lb:'Fóssil', g:'Estruturais (USGS)',
             d:(f,k,w)=>`<path d="M0,0 m-1,0 a1,1 0 0 1 2,0 a2,2 0 0 1 -4,0 a3,3 0 0 1 6,0 a4.4,4.4 0 0 1 -8.8,0 a5.6,5.6 0 0 1 8,-5" fill="none" stroke="${k}" stroke-width="${w}"/>`},

  /* — SINALIZAÇÃO VERTICAL BRASILEIRA (CONTRAN / Manual Brasileiro de
       Sinalização de Trânsito) —
     Formas e cores conforme o manual: REGULAMENTAÇÃO é circular de fundo
     branco com orla vermelha (exceções R-1 octogonal vermelha e R-2 triangular
     invertida); ADVERTÊNCIA é quadrada apoiada no vértice (losango), fundo
     amarelo com orla e símbolo pretos; OBRAS repete a advertência com fundo
     LARANJA; INDICAÇÃO de serviço é retangular azul com símbolo branco.
     O rótulo traz o CÓDIGO oficial, que é como a placa é especificada em
     projeto. As cores são as da norma e NÃO seguem a cor da camada — uma
     placa R-1 azul não seria reconhecida em campo; a cor da camada entra só
     no contorno externo, para o símbolo se destacar sobre qualquer fundo. */

  /* Regulamentação (R) */
  tr_pare:  {lb:'R-1 Parada obrigatória', g:'Trânsito · Regulamentação',
             d:(f,k,w)=>`<path d="M-2.9,-7 H2.9 L7,-2.9 V2.9 L2.9,7 H-2.9 L-7,2.9 V-2.9 Z" fill="#c1121f" stroke="${k}" stroke-width="0.70"/>`+
               `<path d="M-2.35,-5.7 H2.35 L5.7,-2.35 V2.35 L2.35,5.7 H-2.35 L-5.7,2.35 V-2.35 Z" fill="none" stroke="#fff" stroke-width="0.50"/>`+
               `<text x="0" y="1.9" font-size="4.1" font-family="Signika,sans-serif" font-weight="700" letter-spacing="-0.15" fill="#fff" text-anchor="middle">PARE</text>`},
  tr_pref:  {lb:'R-2 Dê a preferência', g:'Trânsito · Regulamentação',
             d:(f,k,w)=>`<path d="M-7.4,-5.6 H7.4 L0,7.2 Z" fill="#fff" stroke="#c1121f" stroke-width="1.15"/>`},
  tr_proib: {lb:'R-3 Sentido proibido', g:'Trânsito · Regulamentação',
             d:(f,k,w)=>`<circle r="7" fill="#fff" stroke="#c1121f" stroke-width="1.30"/>`+
               `<path d="M0,4.4 V-2.6" stroke="#111" stroke-width="0.85" stroke-linecap="round"/>`+
               `<path d="M0,-4.6 L-2.3,-1.8 H2.3 Z" fill="#111"/>`+
               `<path d="M-4.3,4.3 L4.3,-4.3" stroke="#c1121f" stroke-width="0.80"/>`},
  tr_esq:   {lb:'R-4a Proibido virar à esquerda', g:'Trânsito · Regulamentação',
             d:(f,k,w)=>`<circle r="7" fill="#fff" stroke="#c1121f" stroke-width="1.30"/>`+
               `<path d="M2.4,4.6 V-1.6 H-2.2" fill="none" stroke="#111" stroke-width="0.85" stroke-linecap="round" stroke-linejoin="round"/>`+
               `<path d="M-4.2,-1.6 L-1.6,-3.7 V0.5 Z" fill="#111"/>`+
               `<path d="M-4.3,4.3 L4.3,-4.3" stroke="#c1121f" stroke-width="0.80"/>`},
  tr_dir:   {lb:'R-4b Proibido virar à direita', g:'Trânsito · Regulamentação',
             d:(f,k,w)=>`<circle r="7" fill="#fff" stroke="#c1121f" stroke-width="1.30"/>`+
               `<path d="M-2.4,4.6 V-1.6 H2.2" fill="none" stroke="#111" stroke-width="0.85" stroke-linecap="round" stroke-linejoin="round"/>`+
               `<path d="M4.2,-1.6 L1.6,-3.7 V0.5 Z" fill="#111"/>`+
               `<path d="M-4.3,4.3 L4.3,-4.3" stroke="#c1121f" stroke-width="0.80"/>`},
  tr_estp:  {lb:'R-6a Proibido estacionar', g:'Trânsito · Regulamentação',
             d:(f,k,w)=>`<circle r="7" fill="#fff" stroke="#c1121f" stroke-width="1.30"/>`+
               `<text x="0" y="3.1" font-size="8.4" font-family="Signika,sans-serif" font-weight="700" fill="#111" text-anchor="middle">E</text>`+
               `<path d="M-4.3,4.3 L4.3,-4.3" stroke="#c1121f" stroke-width="0.80"/>`},
  tr_parp:  {lb:'R-6c Proibido parar e estacionar', g:'Trânsito · Regulamentação',
             d:(f,k,w)=>`<circle r="7" fill="#fff" stroke="#c1121f" stroke-width="1.30"/>`+
               `<path d="M-4.3,4.3 L4.3,-4.3 M-4.3,-4.3 L4.3,4.3" stroke="#c1121f" stroke-width="0.85"/>`},
  tr_cam_p: {lb:'R-9 Proibido trânsito de caminhões', g:'Trânsito · Regulamentação',
             d:(f,k,w)=>`<circle r="7" fill="#fff" stroke="#c1121f" stroke-width="1.30"/>`+
               `<path d="M-4.2,1 V-1.7 H0 V1 Z M0.4,1 V-0.6 H2.3 L3.8,0.4 V1 Z" fill="#111"/>`+
               `<circle cx="-2.7" cy="1.9" r="0.85" fill="#111"/><circle cx="2.7" cy="1.9" r="0.85" fill="#111"/>`+
               `<path d="M-4.3,4.3 L4.3,-4.3" stroke="#c1121f" stroke-width="0.80"/>`},
  tr_vel:   {lb:'R-19 Velocidade máxima permitida', g:'Trânsito · Regulamentação',
             d:(f,k,w)=>`<circle r="7" fill="#fff" stroke="#c1121f" stroke-width="1.05"/>`+
               `<text x="0" y="2.4" font-size="6.4" font-family="Signika,sans-serif" font-weight="700" fill="#111" text-anchor="middle">40</text>`},
  tr_peso:  {lb:'R-17 Peso máximo permitido por eixo', g:'Trânsito · Regulamentação',
             d:(f,k,w)=>`<circle r="7" fill="#fff" stroke="#c1121f" stroke-width="1.05"/>`+
               `<text x="0" y="2.6" font-size="5.6" font-family="Signika,sans-serif" font-weight="700" fill="#111" text-anchor="middle">30t</text>`},
  tr_mao:   {lb:'R-24a Sentido de circulação da via/pista', g:'Trânsito · Regulamentação',
             d:(f,k,w)=>`<rect x="-7.4" y="-3.4" width="14.8" height="6.8" rx="0.8" fill="#1b5e9c" stroke="${k}" stroke-width="0.58"/>`+
               `<path d="M-4.4,0 H3 M3.4,0 L0.6,-2.2 V2.2 Z" stroke="#fff" stroke-width="0.90" fill="#fff"/>`, oriented:true},

  /* Advertência (A) — losango amarelo, orla e símbolo pretos */
  tr_perigo:{lb:'Advertência genérica (sem código)', g:'Trânsito · Advertência',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#f2b705" stroke="#111" stroke-width="0.80"/>`+
               `<path d="M0,-3.6 V1.4" stroke="#111" stroke-width="1.00" stroke-linecap="round"/><circle cy="3.6" r="0.9" fill="#111"/>`},
  tr_curva: {lb:'A-1b Curva acentuada à direita', g:'Trânsito · Advertência',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#f2b705" stroke="#111" stroke-width="0.80"/>`+
               `<path d="M-1.8,3.4 C-1.8,-0.6 1.8,-0.6 1.8,-3.2" fill="none" stroke="#111" stroke-width="0.68" stroke-linecap="round"/>`+
               `<path d="M1.8,-4.6 L3.1,-2.1 H0.5 Z" fill="#111"/>`},
  tr_curva_e:{lb:'A-1a Curva acentuada à esquerda', g:'Trânsito · Advertência',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#f2b705" stroke="#111" stroke-width="0.80"/>`+
               `<path d="M1.8,3.4 C1.8,-0.6 -1.8,-0.6 -1.8,-3.2" fill="none" stroke="#111" stroke-width="0.68" stroke-linecap="round"/>`+
               `<path d="M-1.8,-4.6 L-3.1,-2.1 H-0.5 Z" fill="#111"/>`},
  tr_sinuosa:{lb:'A-4a Curva acentuada em “S” à esquerda', g:'Trânsito · Advertência',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#f2b705" stroke="#111" stroke-width="0.80"/>`+
               `<path d="M-1.6,4 C-1.6,1.2 1.6,1.2 1.6,-1 C1.6,-2.6 -0.4,-2.8 -0.4,-4.2" fill="none" stroke="#111" stroke-width="0.68" stroke-linecap="round"/>`+
               `<path d="M-0.4,-5.2 L1,-2.9 H-1.8 Z" fill="#111"/>`},
  tr_cruz:  {lb:'A-6 Cruzamento de vias', g:'Trânsito · Advertência',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#f2b705" stroke="#111" stroke-width="0.80"/>`+
               `<path d="M0,-4.4 V4.4 M-4.4,0 H4.4" stroke="#111" stroke-width="0.80"/>`},
  tr_semaf: {lb:'A-14 Semáforo à frente', g:'Trânsito · Advertência',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#f2b705" stroke="#111" stroke-width="0.80"/>`+
               `<rect x="-1.7" y="-4.2" width="3.4" height="8.4" rx="0.7" fill="#111"/>`+
               `<circle cy="-2.6" r="0.95" fill="#e5383b"/><circle cy="0" r="0.95" fill="#f2b705"/><circle cy="2.6" r="0.95" fill="#2e9e4f"/>`},
  tr_parob: {lb:'A-15 Parada obrigatória à frente', g:'Trânsito · Advertência',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#f2b705" stroke="#111" stroke-width="0.80"/>`+
               `<path d="M-1.6,-3.9 H1.6 L3.9,-1.6 V1.6 L1.6,3.9 H-1.6 L-3.9,1.6 V-1.6 Z" fill="#c1121f"/>`},
  tr_irreg: {lb:'A-17 Pista irregular', g:'Trânsito · Advertência',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#f2b705" stroke="#111" stroke-width="0.80"/>`+
               `<path d="M-4.6,2.4 H-3.4 A1.55,1.55 0 0 1 -0.3,2.4 A1.55,1.55 0 0 1 2.8,2.4 H4.6" fill="#111" stroke="#111" stroke-width="0.58" stroke-linejoin="round"/>`},
  tr_lomb:  {lb:'A-18 Saliência ou lombada', g:'Trânsito · Advertência',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#f2b705" stroke="#111" stroke-width="0.80"/>`+
               `<path d="M-4.2,2.2 H-2.6 A2.6,2.6 0 0 1 2.6,2.2 H4.2" fill="none" stroke="#111" stroke-width="0.80"/>`},
  tr_rampa: {lb:'A-20a Declive acentuado', g:'Trânsito · Advertência',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#f2b705" stroke="#111" stroke-width="0.80"/>`+
               `<path d="M-3.4,2.4 L3.4,-2.4 L3.4,2.4 Z" fill="#111"/>`+
               `<path d="M-4.4,2.4 H4.4" stroke="#111" stroke-width="0.65"/>`},
  tr_subida:{lb:'A-20b Aclive acentuado', g:'Trânsito · Advertência',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#f2b705" stroke="#111" stroke-width="0.80"/>`+
               `<path d="M3.4,2.4 L-3.4,-2.4 L-3.4,2.4 Z" fill="#111"/>`+
               `<path d="M-4.4,2.4 H4.4" stroke="#111" stroke-width="0.65"/>`},
  tr_estreit:{lb:'A-21a Estreitamento de pista ao centro', g:'Trânsito · Advertência',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#f2b705" stroke="#111" stroke-width="0.80"/>`+
               `<path d="M-3.4,4.2 L-1.5,0 L-3.4,-4.2 M3.4,4.2 L1.5,0 L3.4,-4.2" fill="none" stroke="#111" stroke-width="0.72" stroke-linecap="round" stroke-linejoin="round"/>`+
               `<path d="M0,-4 V4" stroke="#111" stroke-width="0.58"/>`},
  tr_duplo: {lb:'A-25 Mão dupla adiante', g:'Trânsito · Advertência',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#f2b705" stroke="#111" stroke-width="0.80"/>`+
               `<path d="M-1.5,-2.6 V3 M1.5,-3 V2.6" stroke="#111" stroke-width="0.68"/>`+
               `<path d="M-1.5,-4 L-2.8,-1.7 H-0.2 Z M1.5,4 L0.2,1.7 H2.8 Z" fill="#111"/>`},
  tr_desmor:{lb:'A-27 Área com desmoronamento', g:'Trânsito · Advertência',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#f2b705" stroke="#111" stroke-width="0.80"/>`+
               `<path d="M-3.8,-3.4 L-1.4,3.6 H-4.4 Z" fill="#111"/>`+
               `<circle cx="0.6" cy="1.4" r="1.1" fill="#111"/><circle cx="3" cy="2.8" r="0.85" fill="#111"/><circle cx="2.2" cy="-0.6" r="0.7" fill="#111"/>`},
  tr_escorr:{lb:'A-28 Pista escorregadia', g:'Trânsito · Advertência',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#f2b705" stroke="#111" stroke-width="0.80"/>`+
               `<rect x="-2.4" y="-3.4" width="4.8" height="6.6" rx="1" fill="none" stroke="#111" stroke-width="0.75"/>`+
               `<path d="M-4.4,-1.8 C-3.4,-0.6 -3.4,0.6 -4.4,1.8 M4.4,-1.8 C3.4,-0.6 3.4,0.6 4.4,1.8" fill="none" stroke="#111" stroke-width="0.65"/>`},
  tr_maq:   {lb:'A-31 Trânsito de tratores ou maquinária agrícola', g:'Trânsito · Advertência',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#f2b705" stroke="#111" stroke-width="0.80"/>`+
               `<path d="M-4,1 V-1.6 H0 V1 Z M0.4,1 V-0.5 H2.2 L3.6,0.4 V1 Z" fill="#111"/>`+
               `<circle cx="-2.6" cy="1.9" r="0.9" fill="#111"/><circle cx="2.6" cy="1.9" r="0.9" fill="#111"/>`},
  tr_pedes: {lb:'A-32b Passagem sinalizada de pedestres', g:'Trânsito · Advertência',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#f2b705" stroke="#111" stroke-width="0.80"/>`+
               `<circle cy="-3" r="1" fill="#111"/>`+
               `<path d="M0,-1.9 V1.2 M0,-1.1 L-1.7,0.2 M0,-1.1 L1.7,0.2 M0,1.2 L-1.4,3.6 M0,1.2 L1.4,3.6" stroke="#111" stroke-width="0.62" fill="none" stroke-linecap="round"/>`},
  tr_altura:{lb:'A-37 Altura limitada', g:'Trânsito · Advertência',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#f2b705" stroke="#111" stroke-width="0.80"/>`+
               `<path d="M-4,-3.4 H4 M0,-3 V3 M0,-3.4 L-1.3,-1.4 H1.3 Z M0,3.4 L-1.3,1.4 H1.3 Z" fill="#111" stroke="#111" stroke-width="0.58"/>`},

  /* Obras (fundo laranja) e indicação (azul) */
  tr_obras: {lb:'A-24 Obras', g:'Trânsito · Obras e indicação',
             d:(f,k,w)=>`<path d="M0,-7.4 L7.4,0 L0,7.4 L-7.4,0 Z" fill="#e8590c" stroke="#111" stroke-width="0.80"/>`+
               `<circle cy="-3.9" r="1.05" fill="#111"/>`+
               `<path d="M-0.2,-2.8 L-0.2,0.4 L-2.4,3.7 M-0.2,0.4 L1.9,3.7" fill="none" stroke="#111" stroke-width="0.72" stroke-linecap="round"/>`+
               `<path d="M-2.9,-1.4 L2.6,-2.6" stroke="#111" stroke-width="0.68" stroke-linecap="round"/>`+
               `<path d="M2.2,-3.4 L4,-1.9 L2.9,-1.2 Z" fill="#111"/>`},
  tr_cone:  {lb:'Cone / dispositivo de obra', g:'Trânsito · Obras e indicação',
             d:(f,k,w)=>`<path d="M0,-7 L4.6,5.4 H-4.6 Z" fill="#e8590c" stroke="${k}" stroke-width="0.58"/>`+
               `<path d="M-2.2,-1.2 H2.2 M-3.4,2.2 H3.4" stroke="#fff" stroke-width="0.80"/>`+
               `<rect x="-6" y="5.4" width="12" height="2" rx="0.6" fill="#e8590c" stroke="${k}" stroke-width="0.45"/>`},
  tr_estac: {lb:'Estacionamento (indicação)', g:'Trânsito · Obras e indicação',
             d:(f,k,w)=>`<rect x="-7" y="-7" width="14" height="14" rx="1.6" fill="#1b5e9c" stroke="${k}" stroke-width="0.58"/>`+
               `<text x="0" y="3.6" font-size="10.5" font-family="Signika,sans-serif" font-weight="700" fill="#fff" text-anchor="middle">P</text>`},
  tr_balan: {lb:'Balança / pesagem (indicação)', g:'Trânsito · Obras e indicação',
             d:(f,k,w)=>`<rect x="-7" y="-7" width="14" height="14" rx="1.6" fill="#1b5e9c" stroke="${k}" stroke-width="0.58"/>`+
               `<path d="M0,-4.6 V3.4 M-4.4,-3.2 H4.4 M-4.4,-3.2 L-6,0.6 H-2.8 Z M4.4,-3.2 L2.8,0.6 H6 Z" fill="#fff" stroke="#fff" stroke-width="0.65"/>`+
               `<path d="M-3,4.6 H3" stroke="#fff" stroke-width="0.80"/>`}
};
/* ---------- SÍMBOLO DE PONTO POR IMAGEM ----------
   Placa de sinalização, no QGIS, é RasterMarker/SvgMarker: uma IMAGEM, não
   uma forma desenhada. Em vez de um segundo desenhador de pontos, cada
   imagem importada vira uma ENTRADA de PT_SYMS — assim mapa, legenda,
   galeria e prancha continuam passando por PT_SYMS[shape].d, e um dia só de
   manutenção vale para todos. A imagem viaja como data URL dentro do
   projeto; ver ptImgSnapshot/ptImgRestore na persistência. */
const PT_IMG_GRUPO='Imagens importadas';
function ptImgKey(url){                  /* mesma imagem, mesma chave: duas camadas
                                            que usam a mesma placa a compartilham */
  let h=5381;
  for(let i=0;i<url.length;i++) h=((h*33)^url.charCodeAt(i))>>>0;
  return 'img_'+h.toString(36)+'_'+(url.length%997).toString(36);
}
function ptImgRegister(url,lb,ar){
  if(!url) return null;
  const k=ptImgKey(url);
  if(PT_SYMS[k]){ if(lb) PT_SYMS[k].lb=lb; return k; }
  /* A placa raramente é quadrada. O quadro do símbolo tem 24 unidades e a
     imagem ocupa 20 delas no lado maior, preservando a proporção — esticar
     uma placa de advertência a deformaria justamente onde ela é lida. */
  const r=(+ar>0)?+ar:1, W=r>=1?20:20*r, H=r>=1?20/r:20;
  PT_SYMS[k]={lb:lb||'Imagem importada', g:PT_IMG_GRUPO, img:url, ar:r,
    d:()=>`<image href="${url}" xlink:href="${url}" x="${(-W/2).toFixed(2)}" y="${(-H/2).toFixed(2)}" `+
          `width="${W.toFixed(2)}" height="${H.toFixed(2)}" preserveAspectRatio="xMidYMid meet"/>`};
  return k;
}
function ptImgSnapshot(){                // o que precisa viajar dentro do .ccmgis
  const o={};
  Object.keys(PT_SYMS).forEach(k=>{ const d=PT_SYMS[k];
    if(d&&d.img) o[k]={lb:d.lb, url:d.img, ar:d.ar||1}; });
  return Object.keys(o).length?o:null;
}
function ptImgRestore(o){                // ao abrir o projeto, antes de desenhar
  if(!o||typeof o!=='object') return 0;
  let n=0;
  Object.keys(o).forEach(k=>{ const e=o[k]||{}; if(e.url && ptImgRegister(e.url,e.lb,e.ar)) n++; });
  return n;
}
function ptCfg(L){                       // configuração de ponto (com padrão retro-compatível)
  const s=L.sym;
  if(!s.pt) s.pt={shape:'circle', size:14, rot:0, rotField:'', dipField:''};
  return s.pt;
}
function ptStyleOf(L,f,st){              // símbolo/tamanho/rotação efetivos de uma feição
  const cfg=ptCfg(L);
  const c=(L.sym.mode!=='single')? classOf(L,f) : null;
  const shape=(c&&c.shape)||cfg.shape||'circle';
  const size =(c&&c.size)||cfg.size||14;
  let rot=+cfg.rot||0;
  if(cfg.rotField && f.props && isFinite(+f.props[cfg.rotField])) rot=+f.props[cfg.rotField];
  let dip=null;
  if(cfg.dipField && f.props && f.props[cfg.dipField]!=null && f.props[cfg.dipField]!=='')
    dip=String(f.props[cfg.dipField]);
  return {shape, size, rot, dip, def:PT_SYMS[shape]||PT_SYMS.circle};
}
/* SVG completo do símbolo (tela). Box -12..12 com overflow visível. */
function ptSVG(ps, fill, stroke, weight, extraCSS){
  const S2=ps.size, w=Math.max(0.8, +weight||1.5)*1.1;
  const rot=ps.def.oriented? (ps.rot||0) : 0;
  const dip=(ps.def.dip && ps.dip!=null)? ps.dip : null;
  // posição do rótulo de mergulho: leste local (6.5,0) girado
  let dtxt='';
  if(dip!=null){
    const a=rot*Math.PI/180, dx=9.5*Math.cos(a), dy=9.5*Math.sin(a);
    dtxt=`<text x="${dx.toFixed(1)}" y="${(dy+2.6).toFixed(1)}" font-size="7.5" font-family="Signika,sans-serif" fill="${stroke}" text-anchor="middle" paint-order="stroke" stroke="#ffffff" stroke-width="2">${esc(dip)}</text>`;
  }
  return `<svg width="${S2}" height="${S2}" viewBox="-12 -12 24 24" style="overflow:visible;display:block${extraCSS||''}">`+
    `<g transform="rotate(${rot})">${ps.def.d(fill,stroke,w)}</g>${dtxt}</svg>`;
}
/* Fragmento SVG para plotagem/legenda: <g> transladado/escala em mm. */
function ptPlotSVG(ps, fill, stroke, weight, cxmm, cymm, mmSize){
  const k=mmSize/20;                                   // 20 unidades do quadro
  const rot=ps.def.oriented? (ps.rot||0) : 0;
  const w=Math.max(0.8,+weight||1.5)*1.1;
  let dtxt='';
  if(ps.def.dip && ps.dip!=null){
    const a=rot*Math.PI/180, dx=9.5*Math.cos(a)*k, dy=9.5*Math.sin(a)*k;
    dtxt=`<text x="${dx.toFixed(2)}" y="${(dy+1).toFixed(2)}" font-size="${(mmSize*0.34).toFixed(2)}" fill="${stroke}" text-anchor="middle">${esc(ps.dip)}</text>`;
  }
  return `<g transform="translate(${cxmm.toFixed(2)},${cymm.toFixed(2)})">`+
    `<g transform="scale(${k.toFixed(3)}) rotate(${rot})">${ps.def.d(fill,stroke,w)}</g>${dtxt}</g>`;
}
/* GALERIA DE SÍMBOLOS — o <select> mostrava só o nome ("A-20a Declive
   acentuado") e era preciso escolher às cegas. Aqui cada opção é o próprio
   símbolo DESENHADO, com o nome embaixo, agrupado por família. O <select>
   continua existindo (escondido) e é ele quem guarda o valor: assim tudo o
   que já escutava 'change' nele — inclusive a aplicação ao vivo — segue
   funcionando sem saber que a interface mudou.
   Cores: as do símbolo escolhido pelo usuário, exceto nas placas de trânsito,
   que têm cor normatizada e se desenham sozinhas. */
function ptGaleriaHTML(cur, cor, contorno, esp){
  const gs={};
  Object.entries(PT_SYMS).forEach(([v,d])=>{ (gs[d.g]=gs[d.g]||[]).push([v,d.lb]); });
  const f=cor||'#f5a524', k=contorno||'#111111', w=esp??1.5;
  return `<div class="ptgal">`+Object.entries(gs).map(([g,items])=>
    `<div class="ptgal-g">${esc(g)}</div><div class="ptgal-r">`+
    items.map(([v,l])=>
      `<button type="button" class="ptgal-i${v===cur?' on':''}" data-sh="${v}" title="${esc(l)}">`+
        `<span class="ptgal-d">${ptSVG({shape:v,size:26,rot:0,dip:null,def:PT_SYMS[v]},f,k,w)}</span>`+
        `<span class="ptgal-l">${esc(l)}</span></button>`).join('')+
    `</div>`).join('')+`</div>`;
}
function ptSymOptionsHTML(cur){
  const gs={};
  Object.entries(PT_SYMS).forEach(([v,d])=>{ (gs[d.g]=gs[d.g]||[]).push([v,d.lb]); });
  return Object.entries(gs).map(([g,items])=>
    `<optgroup label="${g}">${items.map(([v,l])=>`<option value="${v}" ${v===cur?'selected':''}>${l}</option>`).join('')}</optgroup>`).join('');
}

/* ============================================================================
   RÓTULOS — texto vindo de um atributo, com fonte/cor/halo/posição/formato
   ========================================================================== */
/* ---------- Classificador de curvas de nível ----------
   Mestra = cota múltipla do intervalo; recebe traço mais grosso/escuro e o
   rótulo da cota (campo COTA_TXT: vazio nas secundárias => sem rótulo). */
function cnRefresh(L){
  const box=document.getElementById('cnBox'); if(!box) return;
  const show=L && L.gtype==='line';
  box.style.display=show?'':'none';
  if(!show) return;
  const fs=document.getElementById('cnField');
  const nums=(L.fields||[]).filter(f=>f.type==='N'||f.type==='F').map(f=>f.name);
  const tem3d=L.features.some(f=>f.zg);
  fs.innerHTML=(tem3d?'<option value="__zg__">Z da geometria (3D)</option>':'')+
    nums.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
  const pref=nums.find(n=>/^(z|cota|elev|elevacao|elevation|altitude|contour|nivel|n[ií]vel)$/i.test(n));
  if(!tem3d && pref) fs.value=pref;
}
function shadeHex(hex, f){   // f<1 escurece, f>1 clareia
  const m=/^#?([0-9a-f]{6})$/i.exec(hex||'#8d6e63'); const v=m?parseInt(m[1],16):0x8d6e63;
  const ch=s=>Math.max(0,Math.min(255,Math.round(s)));
  const r=ch(((v>>16)&255)*f), g=ch(((v>>8)&255)*f), b=ch((v&255)*f);
  return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
}
function cnApply(L){
  const src=document.getElementById('cnField').value;
  if(!src){ toast('Escolha a fonte da cota'); return; }
  const intM=parseFloat(String(document.getElementById('cnIntM').value).replace(',','.'))||5;
  const wM=parseFloat(document.getElementById('cnWM').value)||2.4;
  const wS=parseFloat(document.getElementById('cnWS').value)||1;
  const rotular=document.getElementById('cnLbl').checked;
  const eps=Math.max(1e-6, intM*1e-4);
  const zOf=f=>{
    if(src==='__zg__'){
      if(!f.zg) return NaN;
      const flat=(Array.isArray(f.zg[0])? f.zg.flat() : f.zg).filter(v=>isFinite(v));
      return flat.length? flat[0] : NaN;
    }
    return parseFloat(String(f.props[src]).replace(',','.'));
  };
  const dec=Number.isInteger(intM)?0:1;
  let nM=0,nS=0,nX=0;
  L.features.forEach(f=>{
    const z=zOf(f);
    if(!isFinite(z)){ f.props.CLASSE='SECUND'; f.props.COTA_TXT=''; nX++; return; }
    const m=Math.abs(z/intM-Math.round(z/intM))*intM<=eps;
    f.props.CLASSE=m?'MESTRA':'SECUND';
    f.props.COTA_TXT=m? z.toLocaleString('pt-BR',{minimumFractionDigits:dec,maximumFractionDigits:dec}) : '';
    if(m)nM++; else nS++;
  });
  [['CLASSE','C',8],['COTA_TXT','C',12]].forEach(([nm,tp,ln])=>{
    if(!(L.fields||[]).some(fd=>fd.name===nm)) L.fields.push({name:nm,type:tp,length:ln,decimal:0});
  });
  const base=L.sym.color||L.color;
  L.sym={...L.sym, mode:'cat', field:'CLASSE', cats:[
    {value:'MESTRA', color:shadeHex(base,0.72), weight:wM},
    {value:'SECUND', color:shadeHex(base,1.35), weight:wS},
  ]};
  if(rotular){
    L.labelField='COTA_TXT';
    const c=labelCfg(L); c.place='center'; c.size=Math.max(c.size,8);
  } else if(L.labelField==='COTA_TXT') L.labelField='';
  drawLayer(L); refreshUI();
  toast(`Curvas: ${nM} mestras (${intM} m) · ${nS} secundárias`+(nX?` · ${nX} sem cota`:''));
}
function defaultLabelCfg(){
  return {font:'Signika, sans-serif', style:'normal', size:8, color:'#111111',
          halo:'#ffffff', haloW:1.2, place:'center', anchor:'middle', dx:0, dy:0,
          case:'', dec:-1, pre:'', suf:'', onMap:true, unique:true, rep:0, rot:'1', fltF:'', fltV:'', fltLen:0,
          /* Com mais de um campo, o padrão é um EMBAIXO do outro. */
          sep:'linha'};
}
function labelCfg(L){
  if(!L.lbl) L.lbl=defaultLabelCfg();
  return L.lbl;
}

/* ---- r\u00f3tulos por atributo geom\u00e9trico -------------------------------------
   Campos virtuais, prefixados por $, calculados a partir da pr\u00f3pria geometria
   no CRS de trabalho. N\u00e3o entram na tabela de atributos: ao editar um v\u00e9rtice o
   valor acompanha, o que um campo gravado n\u00e3o faria.                        */
const GEOM_CAMPOS={
  '$COMPRIM':'Comprimento (m)',
  '$AREA_M2':'\u00c1rea (m\u00b2)',
  '$AREA_HA':'\u00c1rea (ha)',
  '$PERIM'  :'Per\u00edmetro (m)',
  '$X'      :'Coordenada E',
  '$Y'      :'Coordenada N'
};
function geomPts(L,f){
  const rings=(f.multi && Array.isArray(f.geom[0][0]))? f.geom : [f.geom];
  return rings.map(r=>r.map(p=>{
    if(L.crs===S.workCRS) return [p[0],p[1]];
    const w=toWGS(L.crs,p[0],p[1]); const q=fromWGS(S.workCRS,w[0],w[1]); return [q[0],q[1]];
  }));
}
function geomValor(L,f,campo){
  let rings;
  try{ rings=geomPts(L,f); }catch(e){ return null; }
  if(!rings.length||!rings[0].length) return null;
  const comp=r=>{ let d=0; for(let i=0;i<r.length-1;i++) d+=Math.hypot(r[i+1][0]-r[i][0], r[i+1][1]-r[i][1]); return d; };
  const area=r=>{ let a=0; for(let i=0;i<r.length;i++){ const j=(i+1)%r.length;
      a+=r[i][0]*r[j][1]-r[j][0]*r[i][1]; } return Math.abs(a)/2; };
  switch(campo){
    case '$COMPRIM': return rings.reduce((t,r)=>t+comp(r),0);
    case '$AREA_M2': return rings.reduce((t,r)=>t+area(r),0);
    case '$AREA_HA': return rings.reduce((t,r)=>t+area(r),0)/10000;
    case '$PERIM'  : return rings.reduce((t,r)=>t+comp(r)+
                        (L.gtype==='polygon'? Math.hypot(r[r.length-1][0]-r[0][0], r[r.length-1][1]-r[0][1]):0),0);
    case '$X': return rings[0][0][0];
    case '$Y': return rings[0][0][1];
  }
  return null;
}
function geomCamposDe(gtype){
  if(gtype==='point')   return ['$X','$Y'];
  if(gtype==='line')    return ['$COMPRIM'];
  return ['$AREA_M2','$AREA_HA','$PERIM'];
}


/* Decide se a fei\u00e7\u00e3o deve receber r\u00f3tulo.
   \u2014 sem campo escolhido: rotula todas;
   \u2014 "%N": rotula quando o valor \u00e9 m\u00faltiplo de N (curvas mestras sem campo
     de classe: cota 950 com %50 entra, 945 n\u00e3o);
   \u2014 lista separada por v\u00edrgula: compara\u00e7\u00e3o textual, sem acento de caixa.   */
/* AFERIDOR DO FILTRO DE COMPRIMENTO.
   Ele pôs 200000 num campo em METROS e as isoietas têm 25.663 m — nenhuma
   feição passava, e o painel não dizia nada: parecia que o espaçamento é
   que não obedecia. Agora o próprio painel mostra quantas feições passam e
   avisa quando o corte zera tudo, com o comprimento real da maior. */
function lbAfereFiltro(){
  const el=document.getElementById('lbFltInfo'); if(!el)return;
  const L=(typeof activeLayer==='function')?activeLayer():null;
  const minL=+((document.getElementById('lbFltLen')||{}).value)||0;
  if(!L||L.gtype==='point'||!L.features||!L.features.length){ el.textContent=''; return; }
  let passam=0, maior=0;
  L.features.forEach(f=>{
    const comp=+geomValor(L,f,'$COMPRIM')||0;
    if(comp>maior)maior=comp;
    if(!minL||comp>=minL)passam++;
  });
  const fmt=v=>v>=1000?(v/1000).toFixed(1).replace('.',',')+' km':Math.round(v)+' m';
  if(minL>0 && passam===0){
    el.style.color='#e07a3a';
    el.textContent='Nenhuma feição passa: a maior tem '+fmt(maior)+
      '. Reduza o corte ou deixe 0.';
  }else{
    el.style.color='';
    el.textContent=passam+' de '+L.features.length+' feições rotuladas'+
      (minL?' · maior: '+fmt(maior):'');
  }
}
window.lbAfereFiltro=lbAfereFiltro;
function labelPassaFiltro(L, f, c){
  /* Comprimento m\u00ednimo: curva curta polui o mapa e a cota nem cabe sobre ela.
     Usa a geometria, n\u00e3o um atributo \u2014 vale mesmo em camada sem campo de
     comprimento gravado.                                                     */
  const minL=+c.fltLen||0;
  if(minL>0 && L.gtype!=='point'){
    const comp=geomValor(L,f,'$COMPRIM');
    if(comp!=null && comp<minL) return false;
  }
  const campo=(c.fltF||'').trim();
  const alvo=(c.fltV||'').trim();
  if(!campo || !alvo) return true;
  const v = campo.charAt(0)==='$' ? geomValor(L,f,campo) : (f.props? f.props[campo] : null);
  if(v==null || v==='') return false;
  if(alvo.charAt(0)==='%'){
    const n=parseFloat(alvo.slice(1).replace(',','.'));
    const x=parseFloat(String(v).replace(',','.'));
    if(!isFinite(n) || n===0 || !isFinite(x)) return false;
    return Math.abs(x/n - Math.round(x/n)) < 1e-6;      // m\u00faltiplo, com folga de arredondamento
  }
  const norm=t=>String(t).trim().toLowerCase();
  return alvo.split(',').map(norm).filter(Boolean).includes(norm(v));
}

/* Campos do rótulo: um OU VÁRIOS (nome + área, por exemplo). labelField
   continua sendo o primeiro, para tudo que já lia esse campo. */
function labelCampos(L){
  if(Array.isArray(L.labelFields) && L.labelFields.length) return L.labelFields.slice();
  return L.labelField? [L.labelField] : [];
}
/* Valor de UM campo, já formatado (caixa, decimais, prefixo/sufixo). */
function labelValor(L, f, fld, c){
  let v = fld.charAt(0)==='$' ? geomValor(L,f,fld) : (f.props ? f.props[fld] : null);
  if(v==null || v==='') return null;
  if(c.dec>=0){
    const n=parseFloat(String(v).replace(',','.'));
    if(isFinite(n)) v=n.toLocaleString('pt-BR',{minimumFractionDigits:c.dec, maximumFractionDigits:c.dec});
  }
  let t=String(v);
  if(c.case==='upper') t=t.toUpperCase();
  else if(c.case==='lower') t=t.toLowerCase();
  else if(c.case==='title') t=t.replace(/\S+/g, w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase());
  return t;
}
/* Aplica formato ao(s) valor(es). Com mais de um campo, o padrão é UM EMBAIXO
   DO OUTRO (\n); o separador pode virar " · " ou " — " na janela de rótulos.
   Prefixo e sufixo envolvem o conjunto, não cada linha. */
function labelText(L, f){
  const campos=labelCampos(L); if(!campos.length) return null;
  const c=labelCfg(L);
  if(!labelPassaFiltro(L,f,c)) return null;      // feição fora do filtro: sem rótulo
  const partes=[];
  campos.forEach(fld=>{ const t=labelValor(L,f,fld,c); if(t!=null) partes.push(t); });
  if(!partes.length) return null;
  const sep = (c.sep==null||c.sep==='linha') ? '\n'
            : (c.sep==='ponto' ? ' · ' : c.sep==='traco' ? ' — ' : c.sep==='espaco' ? ' ' : '\n');
  return (c.pre||'')+partes.join(sep)+(c.suf||'');
}
/* Rótulo em HTML: a quebra de linha do texto vira <br> (o esc() sozinho
   mostraria o \n como espaço e as linhas colariam). */
function labelHTML(txt){
  return String(txt).split('\n').map(l=>esc(l)).join('<br>');
}

/* Quando várias zonas/feições pertencem ao mesmo processo ANM, a
   classificação continua individual, mas o nome aparece uma única vez.
   A maior geometria do grupo é usada para posicionar o rótulo. Linhas no
   modo "curva" conservam a repetição própria de estaqueamento/cotas. */
function labelUniqueSet(L){
  const c=labelCfg(L);
  if(c.unique===false || (L.gtype!=='point'&&c.place==='curva'))return null;
  const best=new Map();
  for(const f of (L.features||[])){
    if(!f||!f.geom||!featureVisible(L,f))continue;
    const txt=labelText(L,f);if(txt==null)continue;
    let score=1;
    if(L.gtype==='polygon')score=+geomValor(L,f,'$AREA_M2')||1;
    else if(L.gtype==='line')score=+geomValor(L,f,'$COMPRIM')||1;
    const key=String(txt).trim().toLocaleLowerCase('pt-BR'),old=best.get(key);
    if(!old||score>old.score)best.set(key,{f,score});
  }
  return new Set([...best.values()].map(x=>x.f));
}

/* Pontos de r\u00f3tulo ao longo de uma linha, no estilo de curva de n\u00edvel.
   Devolve [{ll,ang}] com a lat/lng e o \u00e2ngulo do tra\u00e7ado naquele ponto.
   Com rep=0 devolve um \u00fanico r\u00f3tulo no meio; com rep>0 devolve um a cada
   rep metros, o que evita tanto o amontoado quanto a linha sem cota.       */
/* Marca que o campo de espaçamento está sendo digitado. Vale por 700 ms
   depois da última tecla; nesse intervalo labelPontosCurva aplica o piso de
   30%, e depois redesenha já com o valor cheio. */
function lbRepDigitando(){
  S._lbDigitando=true;
  clearTimeout(S._lbRepT);
  S._lbRepT=setTimeout(()=>{
    S._lbDigitando=false;
    try{ if(typeof aplicaLabelVivo==='function')aplicaLabelVivo();
         else if(typeof redraw==='function')redraw();
         else if(typeof refreshUI==='function')refreshUI(); }catch(e){}
  },700);
}
window.lbRepDigitando=lbRepDigitando;
function labelPontosCurva(L, f, repM){
  const rings=(f.multi && Array.isArray(f.geom[0][0]))? f.geom : [f.geom];
  const out=[];
  /* ESPAÇAMENTO VALE PARA A FEIÇÃO INTEIRA, NÃO PARA CADA PARTE.
     A isoieta dele tem 14 partes; como cada parte recebia sua própria série
     de rótulos, pedir 10 km entregava um rótulo a cada ~3 km — o comprimento
     médio das partes. Agora a distância corre ACUMULADA por todas as partes:
     saltoAcum guarda quanto já foi percorrido e cada parte só recebe rótulo
     onde a régua global cair dentro dela. */
  /* 1ª passada: comprimento de cada parte, no CRS de trabalho, para saber o
     comprimento da FEIÇÃO antes de distribuir os rótulos. */
  const compParte=rings.map(r0=>{
    if(!r0||r0.length<2)return 0;
    const fech=L.gtype==='polygon'&&r0.length>2&&
      (r0[0][0]!==r0[r0.length-1][0]||r0[0][1]!==r0[r0.length-1][1]);
    const r=fech?r0.concat([r0[0]]):r0;
    let t=0;
    for(let i=0;i<r.length-1;i++){
      let a=r[i],b=r[i+1];
      if(L.crs!==S.workCRS){
        const wa=toWGS(L.crs,a[0],a[1]), qa=fromWGS(S.workCRS,wa[0],wa[1]);
        const wb=toWGS(L.crs,b[0],b[1]), qb=fromWGS(S.workCRS,wb[0],wb[1]);
        a=qa; b=qb;
      }
      t+=Math.hypot(b[0]-a[0], b[1]-a[1]);
    }
    return t;
  });
  const compFeic=compParte.reduce((s,v)=>s+v,0);
  const iMaior=compParte.indexOf(Math.max(...compParte));
  /* alvos GLOBAIS: a régua corre pela feição inteira */
  const TETO=2000;
  let passoG = repM>0 ? repM : 0;
  if(passoG>0 && compFeic/passoG>TETO) passoG=compFeic/TETO;
  const alvosG=[];
  if(passoG>0) for(let s=passoG/2; s<compFeic; s+=passoG) alvosG.push(s);
  let acumFeic=0, iRing=-1;
  rings.forEach(r0=>{
    iRing++;
    if(!r0 || r0.length<2) return;
    /* Em polígonos, o rótulo acompanha o perímetro. Fecha também os anéis
       importados sem repetir explicitamente o primeiro vértice no final. */
    const fechado=L.gtype==='polygon'&&r0.length>2&&
      (r0[0][0]!==r0[r0.length-1][0]||r0[0][1]!==r0[r0.length-1][1]);
    const r=fechado?r0.concat([r0[0]]):r0;
    // comprimento acumulado no CRS de trabalho (metros)
    const M=r.map(p=>{ if(L.crs===S.workCRS) return [p[0],p[1]];
      const w=toWGS(L.crs,p[0],p[1]); const q=fromWGS(S.workCRS,w[0],w[1]); return [q[0],q[1]]; });
    const segL=[]; let tot=0;
    for(let i=0;i<M.length-1;i++){ const d=Math.hypot(M[i+1][0]-M[i][0], M[i+1][1]-M[i][1]);
      segL.push(d); tot+=d; }
    if(tot<=0) return;
    /* PISO removido a pedido dele: os 30% valem só como sugestão inicial do
       campo, não como teto. O valor digitado manda.
       Digitar "200" passa por "2", e nesse instante uma feição de
       quilômetros pediria milhares de rótulos e a tela travaria antes do
       "00". Enquanto o campo está sendo digitado (S._lbDigitando, ligado
       pelo ouvinte de #lbRep e desligado ~700 ms depois da última tecla),
       o passo tem piso de 30% do comprimento — no máximo 3 rótulos por
       feição. Passada a digitação, o valor dele vale INTEGRALMENTE.
       Resta só uma trava de sobrevivência (TETO), para que um valor
       absurdo não congele o app de vez. */
    let alvos;
    if(passoG>0){
      /* alvos globais que caem DENTRO desta parte, convertidos para a régua
         local da parte */
      alvos=alvosG.filter(s=>s>=acumFeic && s<acumFeic+tot).map(s=>s-acumFeic);
      acumFeic+=tot;
    }else{
      /* sem repetição: UM rótulo por feição, na parte mais longa */
      alvos=(iRing===iMaior)?[tot/2]:[];
      acumFeic+=tot;
    }
    if(!alvos.length) return;
    alvos.forEach(sAlvo=>{
      let acc=0, i=0;
      while(i<segL.length && acc+segL[i]<sAlvo){ acc+=segL[i]; i++; }
      if(i>=segL.length) i=segL.length-1;
      const t=segL[i]>0 ? (sAlvo-acc)/segL[i] : 0;
      const a=r[i], b=r[i+1];
      const px=a[0]+(b[0]-a[0])*t, py=a[1]+(b[1]-a[1])*t;
      const w=toWGS(L.crs,px,py);
      // \u00e2ngulo no plano do CRS de trabalho, convertido para o sentido da tela
      const dA=M[i], dB=M[i+1];
      let ang=Math.atan2(-(dB[1]-dA[1]), dB[0]-dA[0])*180/Math.PI;
      if(ang>90) ang-=180; else if(ang<-90) ang+=180;   // mant\u00e9m o texto leg\u00edvel
      out.push({ll:[w[1],w[0]], pt:[px,py], ang});
    });
  });
  return out;
}

/* Ponto de ancoragem do rótulo, no CRS da camada */
function labelAnchorPt(L, f){
  const rings=(f.multi && Array.isArray(f.geom[0][0])) ? f.geom : [f.geom];
  if(L.gtype==='point') return f.geom[0];
  const pts=rings.flat();
  if(!pts.length) return null;
  if(L.gtype==='polygon'){
    // centroide da maior anel (média simples — robusta o bastante p/ rótulo)
    let big=rings[0];
    if(rings.length>1){ let ba=-1;
      rings.forEach(r=>{ const a=Math.abs(polyArea2(r)); if(a>ba){ba=a; big=r;} }); }
    let sx2=0, sy2=0;
    big.forEach(p=>{ sx2+=p[0]; sy2+=p[1]; });
    return [sx2/big.length, sy2/big.length];
  }
  // linha: ponto do meio
  const r=rings[0];
  return r[Math.floor(r.length/2)] || r[0];
}
function polyArea2(r){ let a=0; for(let i=0,j=r.length-1;i<r.length;j=i++) a+=(r[j][0]*r[i][1]-r[i][0]*r[j][1]); return a/2; }
/* Deslocamento vertical/horizontal segundo a opção de posição */
function labelShift(c){
  let dx=+c.dx||0, dy=+c.dy||0;
  if(c.place==='above')  dy-=1.2;
  if(c.place==='below')  dy+=1.2;
  if(c.place==='offset'){ dx+=1.0; dy-=0.8; }
  return [dx,dy];
}
/* CSS do rótulo no mapa (px) — o halo vira text-shadow em 4 direções */
function labelCSS(c, px){
  const w=+c.haloW||0;
  const sh = w>0
    ? [`-${w}px 0 ${c.halo}`,`${w}px 0 ${c.halo}`,`0 -${w}px ${c.halo}`,`0 ${w}px ${c.halo}`,
       `-${w}px -${w}px ${c.halo}`,`${w}px ${w}px ${c.halo}`].join(',')
    : 'none';
  const it=c.style.includes('italic')?'italic':'normal';
  const bd=c.style.includes('bold')?'700':'400';
  return `font-family:${c.font};font-style:${it};font-weight:${bd};font-size:${px}px;`+
         `color:${c.color};text-shadow:${sh};white-space:nowrap`;
}

/* aplica hachura ao path SVG do Leaflet (mapa) */
/* CSS do quadradinho de amostra no painel de camadas — reflete o estilo real:
   sem preenchimento = vazado (só o contorno); hachura = listra indicativa. */
/* Miniatura da camada/classe. Para PONTO, desenha o próprio símbolo em SVG —
   a caixinha colorida genérica não representa a feição (era a queixa: painel
   e legenda diferentes do mapa).                                            */
function swatchHTML(L, item){
  if(L.gtype==='point'){
    const cfg=ptCfg(L);
    const shape=(item&&item.shape)||cfg.shape||'circle';
    const co=(item&&item.color)||L.sym.color;
    const st=(item&&(item.stroke||item.color))||L.sym.stroke||co;
    const wt=(item&&item.weight)??L.sym.weight??1.5;
    const def=PT_SYMS[shape]||PT_SYMS.circle;
    return `<span class="swatch" style="background:#fff;display:flex;align-items:center;justify-content:center">`+
      ptSVG({shape,size:13,rot:0,dip:null,def}, co, st, wt)+`</span>`;
  }
  const it=item||L.sym;
  if(L.gtype==='line'){
    const co=it.color, wt=Math.min(4, it.weight??L.sym.weight??2);
    const dash=(it.dash??L.sym.dash)||'';
    return `<span class="swatch" style="background:#fff;display:flex;align-items:center;justify-content:center">`+
      `<svg width="12" height="12" viewBox="0 0 12 12">`+
      `<line x1="1" y1="10" x2="11" y2="2" stroke="${co}" stroke-width="${wt}" `+
      (dash?`stroke-dasharray="${dash}" `:'')+`stroke-linecap="round"/></svg></span>`;
  }
  return `<span class="swatch" style="${swatchCSS({color:it.color, stroke:it.stroke||L.sym.stroke||it.color, hatch:it.hatch??L.sym.hatch}, it.color)}"></span>`;
}
function swatchCSS(sym, cor){
  const c = cor || sym.color;
  const h = sym.hatch;
  if(h==='none')
    return `background:transparent;border:2px solid ${sym.stroke||c};box-sizing:border-box`;
  if(h && h!=='solid')
    return `background:repeating-linear-gradient(45deg, ${c} 0 2px, transparent 2px 4px);`+
           `border:1px solid ${sym.stroke||c};box-sizing:border-box`;
  return `background:${c}`;
}

function applyHatch(layer, st){
  if(!layer._path) return;
  const p=layer._path;
  if(!(layer instanceof L.Polygon)) return;   // linha não tem preenchimento
  if(st.hatch==='none'){ p.setAttribute('fill','none'); p.setAttribute('fill-opacity','0'); return; }
  if(st.hatch==='solid'||!st.hatch){ p.setAttribute('fill',st.color); return; }
  const tpl=PATTERN_TPL[st.hatch];
  if(!tpl){ p.setAttribute('fill',st.color); return; }
  const hs=Math.max(.25,Math.min(8,+st.hatchScale||1));
  const pid='pat_'+st.hatch+'_'+st.color.replace('#','')+'_'+String(hs).replace('.','_');
  let defs=document.getElementById('hatchLive');
  if(!defs){ const svg=document.getElementById('hatchDefs');
    defs=document.createElementNS(SVGNS,'defs'); defs.id='hatchLive'; svg.appendChild(defs); }
  if(!document.getElementById(pid)){
    const pat=document.createElementNS(SVGNS,'pattern');
    pat.setAttribute('id',pid); pat.setAttribute('width',tpl.w*hs); pat.setAttribute('height',tpl.h*hs);
    pat.setAttribute('patternUnits','userSpaceOnUse');
    pat.innerHTML=`<g transform="scale(${hs})">${hatchBodyAtSpacing(tpl,st.color,hs)}</g>`;
    defs.appendChild(pat);
  }
  p.setAttribute('fill',`url(#${pid})`);
  p.setAttribute('fill-opacity','1');
}

/* Converter geometria da camada (no CRS dela) p/ latlngs Leaflet */
function featToLatLngs(L, f){
  const conv=(pt)=>{const w=toWGS(L.crs,pt[0],pt[1]);return [w[1],w[0]];};
  /* BLINDAGEM (24/08): ponto não finito ou anel aninhado por engano viravam
     "Invalid LatLng (NaN,NaN)" e derrubavam TODO o desenho da camada — foi
     o que travou a pilha da 4ª bancada em diante. O inválido é descartado
     em vez de quebrar a tela. */
  const ok=q=>Array.isArray(q)&&Number.isFinite(q[0])&&Number.isFinite(q[1]);
  if(L.gtype==='point'){ return (f.geom||[]).filter(ok).map(conv); }
  if(f.multi && Array.isArray(f.geom[0][0]))
    return f.geom.map(r=>(r||[]).filter(ok).map(conv)).filter(r=>r.length>1);
  let g=f.geom||[];
  if(g.length&&Array.isArray(g[0])&&Array.isArray(g[0][0])){
    /* anel aninhado sem multi: usa o maior */
    let maior=g[0];
    for(const an of g)if(Array.isArray(an)&&an.length>maior.length)maior=an;
    g=maior;
  }
  return g.filter(ok).map(conv);
}
/* Uma feição SHP pode ser multipartes: vários polígonos/linhas independentes
   compartilham uma única linha de atributos. Para edição pontual, tratamos a
   parte geométrica clicada como uma seleção própria, sem desmembrar os dados. */
function featPartesLatLng(L,f){
  const lls=featToLatLngs(L,f);
  if(L.gtype==='point') return lls.map(q=>[q]);
  return (f.multi&&Array.isArray(lls?.[0]?.[0]))?lls:[lls];
}
function featParteMaisProxima(L,f,latlng){
  if(!map||!f||!latlng)return null;
  const ps=featPartesLatLng(L,f);
  if(ps.length<=1)return null;
  const p0=map.latLngToContainerPoint(latlng);let bi=0,bd=Infinity;
  ps.forEach((r,ri)=>{
    if(!r||!r.length)return;
    if(L.gtype==='point'){
      const p=map.latLngToContainerPoint(r[0]);
      const d=(p.x-p0.x)**2+(p.y-p0.y)**2;if(d<bd){bd=d;bi=ri;}return;
    }
    const n=r.length+(L.gtype==='polygon'&&r.length>2?1:0);
    for(let i=1;i<n;i++){
      const a=map.latLngToContainerPoint(r[i-1]),b=map.latLngToContainerPoint(r[i%r.length]);
      const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
      let t=den?((p0.x-a.x)*dx+(p0.y-a.y)*dy)/den:0;t=Math.max(0,Math.min(1,t));
      const d=(a.x+t*dx-p0.x)**2+(a.y+t*dy-p0.y)**2;
      if(d<bd){bd=d;bi=ri;}
    }
  });
  return bi;
}
function selParteValida(q,L,f){
  return !!(q&&Number.isInteger(q.partIdx)&&f&&(
    (L.gtype==='point'&&Array.isArray(f.geom)&&f.geom.length>1)||
    (f.multi&&Array.isArray(f.geom?.[0]?.[0])&&f.geom.length>1)));
}
function apagarSelecao(q,semConfirmar){
  const L=q&&(q.layer||S.layers.find(x=>x.id===q.layerId)),f=L&&L.features[q.idx];
  if(!L||!f)return false;
  const parte=selParteValida(q,L,f);
  if(!semConfirmar&&!confirm(parte?'Apagar somente a parte geométrica selecionada?':'Apagar esta feição de "'+L.name+'"?'))return false;
  if(parte){
    const antes=JSON.parse(JSON.stringify(f));
    f.geom.splice(q.partIdx,1);
    undoPush({t:'featpart',L,idx:q.idx,before:antes});
    toast('Parte geométrica apagada; os demais polígonos foram preservados (Ctrl+Z desfaz)');
  }else{
    undoPush({t:'featdel',L,feat:f,idx:q.idx});L.features.splice(q.idx,1);
    toast('Feição apagada (Ctrl+Z desfaz)');
  }
  S.selFeat=null;clearVertices();drawLayer(L);refreshUI();return true;
}
function attachFactories(L){ /* compat: fábricas agora inline em drawLayer */ }
const L2 = L; // alias
const BIG_LAYER=4000;                 // acima disto: canvas + sem hachura/rótulo
/* Recorte VISUAL das linhas da cava contra o MDT natural.
   A feição original permanece inteira em memória (e reaparece inteira durante
   a edição); no mapa normal desenhamos somente os arcos que não estão
   encobertos pelo terreno. A linha de interseção nunca é recortada. */
function cavaTrechosVisiveisNoMdt(L,f){
  const D=L&&L.cavaDesign;
  if(!D||L.gtype!=='line'||!f?.geom||f.geom.length<2)return null;
  const classe=String(f.props?.CLASSE||''),tipo=String(f.props?.TIPO||'');
  if(classe==='daylight'||/interse[cç][aã]o/i.test(tipo))return null;
  /* Enquanto a própria cava está sendo editada, mostra-se a geometria bruta:
     assim nenhum vértice fica inacessível só porque está sob o MDT. */
  if((S.tool==='vertex'||S.tool==='edit')&&String(S.activeId)===String(L.id))
    return null;
  const R=(S.rasters||[]).find(r=>String(r.id)===String(D.rasterId)),g=R&&R.d;
  if(!g||typeof sampleZbil!=='function')return null;
  const src=f.geom,zp=f.zg||[],cota=Number.isFinite(+f.props?.COTA)?+f.props.COTA:NaN,
    zAt=i=>Number.isFinite(+zp[i])?+zp[i]:
      (Number.isFinite(+src[i]?.[2])?+src[i][2]:cota);
  if(!src.some((_,i)=>Number.isFinite(zAt(i))))return null;
  const passo=Math.max(.2,Math.min(.75,g.cs||.5)),pts=[];
  for(let i=1;i<src.length;i++){
    const a=src[i-1],b=src[i],za=zAt(i-1),zb=zAt(i);
    if(!Number.isFinite(za)||!Number.isFinite(zb))continue;
    const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/passo));
    if(!pts.length)pts.push([a[0],a[1],za]);
    for(let k=1;k<=n;k++){const t=k/n;pts.push([
      a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,za+(zb-za)*t]);}
  }
  if(pts.length<2)return null;
  const eps=Math.max(.02,(g.cs||.5)*.03),
    vis=p=>{const zt=sampleZbil(g,p[0],p[1]);
      if(!Number.isFinite(zt))return true;
      /* Cava descendente: z de projeto menor que o MDT fica encoberto.
         Aterro ascendente: vale a relação inversa. */
      return D.up?p[2]<=zt+eps:p[2]>=zt-eps;},
    fronteira=(a,b,va)=>{
      let lo=a.slice(),hi=b.slice();
      for(let n=0;n<28;n++){
        const m=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2];
        if(vis(m)===va)lo=m;else hi=m;
      }
      return [(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2];
    };
  const runs=[];let atual=vis(pts[0])?[pts[0]]:[];
  for(let i=1;i<pts.length;i++){
    const a=pts[i-1],b=pts[i],va=vis(a),vb=vis(b);
    if(va===vb){if(vb){if(!atual.length)atual=[a];atual.push(b);}continue;}
    const q=fronteira(a,b,va);
    if(va){atual.push(q);if(atual.length>1)runs.push(atual);atual=[];}
    else atual=[q,b];
  }
  if(atual.length>1)runs.push(atual);
  return runs.map(r=>({geom:r.map(p=>[p[0],p[1]]),zg:r.map(p=>p[2]),
    multi:false,props:f.props||{}}));
}
/* NUVEM DE PONTOS GRANDE = desenho direto (1 canvas, todos os pontos de uma
   vez, cada um com a própria cor RGB quando houver). Dezenas/centenas de
   milhares de circleMarkers travam o mapa; um canvas não. */
const NUVEM_CANVAS_MIN=60000;
function desenhaNuvemCanvas(L){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  const P=[];
  L.features.forEach(f=>{ if(!f.geom||!featureVisible(L,f))return;
    const pt=f.geom[0]; if(!pt)return;
    const c=reproj(L.crs,S.workCRS,pt[0],pt[1]);
    if(c[0]<x0)x0=c[0]; if(c[0]>x1)x1=c[0];
    if(c[1]<y0)y0=c[1]; if(c[1]>y1)y1=c[1];
    P.push([c[0],c[1],f.props]);
  });
  if(!P.length||x1<=x0||y1<=y0)return null;
  const ladoMax=2600, w=x1-x0, hg=y1-y0;
  const px=w>=hg?ladoMax:Math.max(64,Math.round(ladoMax*w/hg));
  const py=w>=hg?Math.max(64,Math.round(ladoMax*hg/w)):ladoMax;
  const cv=document.createElement('canvas'); cv.width=px; cv.height=py;
  const ctx=cv.getContext('2d');
  const corBase=(L.sym&&(L.sym.color||L.sym.stroke))||'#e0af68';
  const pxPt=P.length>500000?1:2;
  for(const [x,y,pr] of P){
    ctx.fillStyle=(pr&&pr.R!=null&&pr.G!=null&&pr.B!=null)
      ?`rgb(${pr.R|0},${pr.G|0},${pr.B|0})`:corBase;
    ctx.fillRect((x-x0)/w*px, py-(y-y0)/hg*py, pxPt, pxPt);
  }
  const sw=toWGS(S.workCRS,x0,y0), ne=toWGS(S.workCRS,x1,y1);
  const ov=L2.imageOverlay(cv.toDataURL('image/png'),
    [[sw[1],sw[0]],[ne[1],ne[0]]],{opacity:0.95, pane:panelDaCamada('L'+L.id)});
  const fg=L2.featureGroup([ov]);
  if(L.visible!==false)fg.addTo(map);
  L.llayer=fg;
  if(!L._nuvemAviso){ L._nuvemAviso=1;
    toast(`"${L.name}": ${L.features.length.toLocaleString('pt-BR')} pontos — desenho de nuvem (canvas)`); }
  return fg;
}
function drawLayer(L){
  L._snapCache=null; L._endCache=null;   // vértices mudaram: invalida os caches de snap
  /* Revisão geométrica usada pela assinatura do 3D. Antes a assinatura
     continha apenas a quantidade de feições; mover vértices, recalcular uma
     bacia ou editar uma crista mantinha a mesma contagem e a cena não mudava. */
  L._rev=(+L._rev||0)+1;
  /* A aba Cava usa a própria camada como fonte de simbologia. Qualquer
     alteração de cor, espessura, transparência, tracejado ou visibilidade
     feita nas propriedades é refletida no canvas paramétrico. */
  if(S._view==='cava2'&&window.CCMGISCava2?.syncStyles)
    setTimeout(()=>window.CCMGISCava2.syncStyles(),0);
  if(S._view==='v3d'&&typeof v3Auto==='function')setTimeout(()=>v3Auto(),0);
  attachFactories(L);
  if(L.llayer){ map.removeLayer(L.llayer); }
  if(L.gtype==='point'&&L.features.length>NUVEM_CANVAS_MIN){
    if(desenhaNuvemCanvas(L))return;
  }
  /* VISIBILIDADE REAL (por cota): trecho abaixo do terreno some quando o
     raster é opaco e aparece esmaecido quando ele é translúcido. */
  if(L.visReal && typeof desenhaVisRealCamada==='function' && desenhaVisRealCamada(L)) return;
  const layers=[]; const polyRefs=[];
  const big=L.features.length>BIG_LAYER;
  // PANE PRÓPRIO por camada: o bringToFront só ordena DENTRO de um pane, e os
  // vetores (um único <svg>) ficavam sempre acima das imagens dos rasters —
  // por isso um polígono "embaixo" na lista ainda tingia o MDT. Com um pane
  // por camada, o z-index passa a valer entre tipos diferentes.
  const paneNome=panelDaCamada('L'+L.id);
  /* Canvas POR CAMADA, no pane DELA. O canvas compartilhado é um único
     elemento que mora num pane só: toda camada grande desenhava lá, fora da
     pilha, e ficava presa embaixo dos rasters por mais que subisse na árvore
     — era o caso da reserva legal sob o MDT. Com um canvas por camada dentro
     do próprio pane, o z-index da árvore volta a mandar. */
  let R;
  if(big){
    if(!L._cnvR || L._cnvR.options.pane!==paneNome)
      L._cnvR=L2.canvas({pane:paneNome, padding:0.3});
    R={renderer:L._cnvR, pane:paneNome};
  } else R={pane:paneNome};
  const labelUnicas=(!big&&L.labelField)?labelUniqueSet(L):null;
  if(big && L.labelField && !L._bigWarn){ L._bigWarn=1;
    toast(`"${L.name}": ${L.features.length.toLocaleString('pt-BR')} feições — modo desempenho (canvas, sem rótulos/hachuras)`); }
  L.features.forEach((f,idx)=>{
    if(!f.geom || !featureVisible(L,f)) return;
    const st=featureStyle(L,f);
    // Só POLÍGONO tem preenchimento. O Leaflet, por padrão, não preenche polyline —
    // ao ligar `fill` sem checar o tipo, as linhas (p.ex. as linhas de fluxo)
    // passavam a ser desenhadas como polígonos fechados e pintados.
    const isPoly = (L.gtype==='polygon');
    /* Preenchimento 0% SEM hachura também é "só o contorno" — com fill
       ligado e opacidade 0, o Leaflet mantinha o INTERIOR do polígono
       clicável: um limite transparente que cobre o projeto inteiro (o DCE)
       capturava todo clique do mapa e "só deixava selecionar o DCE". */
    const semFill = isPoly && (st.hatch==='none' ||
      (!(+st.fill>0.02) && (st.hatch==null || st.hatch==='none')));
    const style={color:st.stroke,weight:+st.weight,fillColor:st.color,
      fill: isPoly && !semFill,
      fillOpacity: (isPoly && !semFill) ? +st.fill : 0,
      opacity:1, dashArray:st.dash||null, ...R};
    if(L.gtype==='point'){
      const ps=ptStyleOf(L,f,st);
      f.geom.forEach(pt=>{
        /* Mesma blindagem que featToLatLngs já faz: o caminho rápido de
           pontos não passava por ela e um par não finito virava
           "Invalid LatLng (NaN,NaN)", derrubando o desenho da camada
           inteira. Ponto sem coordenada utilizável é apenas omitido. */
        if(!Array.isArray(pt)||!Number.isFinite(pt[0])||!Number.isFinite(pt[1])) return;
        const w=toWGS(L.crs,pt[0],pt[1]);
        if(!w||!Number.isFinite(w[0])||!Number.isFinite(w[1])) return;
        let m;
        /* ponto com R/G/B nos atributos: pinta com a cor do próprio ponto —
           por AUTO-DETECÇÃO (a marca da importação não sobrevive ao projeto
           salvo; a presença dos campos sobrevive) */
        const corRGB=(f.props&&f.props.R!=null&&f.props.G!=null&&f.props.B!=null&&L._pintaRGB!==false)
          ?`rgb(${f.props.R|0},${f.props.G|0},${f.props.B|0})`:null;
        if(big || ps.shape==='circle'){       // caminho rápido (milhares de pontos)
          m=L2.circleMarker([w[1],w[0]],{radius:big?3:(ps.size*0.36),color:corRGB||st.stroke,weight:corRGB?0.4:(+st.weight||1.5),fillColor:corRGB||st.color,fillOpacity:.9,...R});
        } else {
          const S2=ps.size;
          m=L2.marker([w[1],w[0]],{zIndexOffset:500, icon:L2.divIcon({className:'gc-pt',
            iconSize:[S2,S2], iconAnchor:[S2/2,S2/2],
            html:ptSVG(ps, st.color, st.stroke, st.weight)})});
        }
        m._fidx=idx; layers.push(m); });
    } else if(L.gtype==='line'){
      /* A planta sempre mostra a geometria bruta completa. A interseção é
         apenas uma condição de profundidade na cena 3D; usá-la para cortar a
         polyline 2D fazia parecer que a cava/rampa nem haviam sido geradas. */
      const lls=featToLatLngs(L,f); const lyr=L2.polyline(lls,style); lyr._fidx=idx; layers.push(lyr);
    } else {
      const lls=featToLatLngs(L,f); const lyr=L2.polygon(lls,style); lyr._fidx=idx; layers.push(lyr);
      if(!big) polyRefs.push([lyr,st]);       // hachura só no SVG
      /* Hachuras CAD vinculadas permanecem na feição poligonal, mas são
         desenhadas como linhas vetoriais recortadas. Assim o projeto pode
         salvá-las na camada escolhida sem converter toda a camada em mista. */
      if(!big&&Array.isArray(f.cadHatches))f.cadHatches.forEach(h=>{
        if(!h||!Array.isArray(h.segments)||!h.segments.length)return;
        const llsH=h.segments.map(seg=>seg.map(pt=>{
          const w=toWGS(L.crs,pt[0],pt[1]);return [w[1],w[0]];}));
        layers.push(L2.polyline(llsH,{color:h.color||st.stroke,weight:+h.weight||1,
          opacity:Number.isFinite(+h.opacity)?+h.opacity:1,interactive:false,...R}));
      });
    }
    /* Cotas por segmento: escreve a distância de cada trecho no ponto médio.
       Independe do rótulo por campo — os dois podem conviver.               */
    if(!big && L.cotasSeg && L.gtype!=='point'){
      const cfg=labelCfg(L);
      const px=Math.max(7,(+cfg.size||8)*1.2);
      const rings=(f.multi && Array.isArray(f.geom[0][0]))? f.geom : [f.geom];
      rings.forEach(r=>{
        const fecha = (L.gtype==='polygon' && r.length>2);
        const n = fecha ? r.length : r.length-1;
        for(let i=0;i<n;i++){
          const a=r[i], b=r[(i+1)%r.length];
          let pa=a, pb=b;
          if(L.crs!==S.workCRS){
            const wa=toWGS(L.crs,a[0],a[1]), wb=toWGS(L.crs,b[0],b[1]);
            pa=fromWGS(S.workCRS,wa[0],wa[1]); pb=fromWGS(S.workCRS,wb[0],wb[1]);
          }
          const d=Math.hypot(pb[0]-pa[0], pb[1]-pa[1]);
          if(d<0.01) continue;
          const mx=(a[0]+b[0])/2, my=(a[1]+b[1])/2;
          const w=toWGS(L.crs,mx,my);
          const rot=d>=1000 ? (d/1000).toFixed(2).replace('.',',')+' km'
                            : d.toFixed(d<10?2:1).replace('.',',')+' m';
          layers.push(L2.marker([w[1],w[0]],{interactive:false, keyboard:false, pane:paneNome,
            icon:L2.divIcon({className:'gc-label', iconSize:[0,0],
              html:`<div style="${labelCSS(cfg,px)};transform:translate(-50%,-50%)">${esc(rot)}</div>`})}));
        }
      });
    }
    if(!big && L.labelField){
      const cfg=labelCfg(L);
      const txt=labelText(L,f);
      if(labelUnicas&&!labelUnicas.has(f))return;
      /* Um ou vários rótulos sobre o próprio traçado. Em polígonos acompanha
         o perímetro; em linhas acompanha o eixo. */
      if(txt!=null && cfg.onMap!==false && cfg.place==='curva' && L.gtype!=='point'){
        const px=Math.max(7,(+cfg.size||8)*1.35);
        const gira=String(cfg.rot??'1')!=='0';
        labelPontosCurva(L,f,+cfg.rep||0).forEach(pt=>{
          const rot = gira? ` rotate(${pt.ang.toFixed(1)}deg)` : '';
          layers.push(L2.marker(pt.ll,{interactive:false, keyboard:false, pane:paneNome,
            icon:L2.divIcon({className:'gc-label', iconSize:[0,0],
              html:`<div style="${labelCSS(cfg,px)};transform:translate(-50%,-50%)${rot};white-space:nowrap;text-align:center;line-height:1.15">${labelHTML(txt)}</div>`})}));
        });
      }
      else if(txt!=null && cfg.onMap!==false){
        const ap=labelAnchorPt(L,f);
        if(ap){
          const w=toWGS(L.crs,ap[0],ap[1]);
          const px=Math.max(7,(+cfg.size||8)*1.35);          // pt do papel -> px de tela
          const [ddx,ddy]=labelShift(cfg);
          const tx=(cfg.anchor==='end'?'-100%':cfg.anchor==='start'?'0':'-50%');
          // ATENÇÃO: nada de {opacity:0} aqui. O Leaflet aplica essa opacidade ao
          // elemento do ícone — e o rótulo, que vive dentro dele, sumia por completo.
          // Era esse o motivo de os rótulos nunca aparecerem no mapa.
          const t=L2.marker([w[1],w[0]],{interactive:false, keyboard:false, pane:paneNome,
            icon:L2.divIcon({className:'gc-label', iconSize:[0,0],
              html:`<div style="${labelCSS(cfg,px)};transform:translate(${tx},-50%) translate(${ddx*3}px,${ddy*3}px);line-height:1.15;text-align:${cfg.anchor==='end'?'right':cfg.anchor==='start'?'left':'center'}">${labelHTML(txt)}</div>`})});
          layers.push(t);
        }
      }
    }
  });
  const fg=L2.featureGroup(layers).addTo(map);
  // Ferramentas que trabalham SOBRE o mapa (traçar perfil, bacia, desenhar geometrias)
  // precisam receber o clique mesmo quando ele cai em cima de uma feição vetorial.
  // Antes o DomEvent.stop() era incondicional e engolia o clique, impedindo, p.ex.,
  // traçar a linha do perfil por cima de polígonos visíveis.
  fg.on('click',e=>{
    /* CAPTURA PENDENTE (Início/Reposicionar rampa etc.): o toque sobre uma
       feição pertence ao comando — sem isto o handler da feição engolia o
       clique e o comando nunca recebia o ponto ("não redesenha"). */
    if(typeof S._pickPonto==='function'){
      L2.DomEvent.stop(e);
      const ll=(e.originalEvent&&map.mouseEventToLatLng)
        ?map.mouseEventToLatLng(e.originalEvent):e.latlng;
      const fcb=S._pickPonto; S._pickPonto=null; S._pickCancel=null;
      try{ fcb(ll); }catch(err){ console.warn('captura', err); }
      return;
    }
    // pan incluso: toque simples (sem arrasto) numa feição abre o menu de edição
    if(S.tool==='select'||S.tool==='del'||S.tool==='pan'){
      pickFeature(L, e.layer._fidx, e.latlng, {originalEvent:e.originalEvent}); L2.DomEvent.stop(e); return;
    }
    if(S.tool==='vertex'){
      pickFeature(L,e.layer._fidx,e.latlng,{originalEvent:e.originalEvent});L2.DomEvent.stop(e);return;
    }
    /* Qualquer comando de mapa recebe o ponto mesmo quando o toque cai sobre
       um vetor. Isso cobre ferramentas atuais e futuras sem uma lista que
       inevitavelmente fica desatualizada no tablet. */
    if(S.tool){
      L2.DomEvent.stop(e);          // evita disparo duplo (feição + mapa)
      // em marcadores, e.latlng é o CENTRO do símbolo — usar o ponto real do cursor
      const ll=(e.originalEvent && map.mouseEventToLatLng)
        ? map.mouseEventToLatLng(e.originalEvent) : e.latlng;
      onMapClick({latlng:ll});      // encaminha ao mapa manualmente
      return;
    }
    L2.DomEvent.stop(e);
  });
  /* Propriedades por duplo clique diretamente na feição.
     Antes só existia o clique simples (seleção/menu); portanto o duplo clique
     caía no mapa e apenas aplicava zoom. Restringe aos modos de consulta para
     não roubar o duplo clique que finaliza linha, polígono ou perfil. */
  fg.on('dblclick',e=>{
    if(S.tool!=='select' && S.tool!=='pan') return;
    L2.DomEvent.stop(e);
    const idx=e.layer&&Number.isInteger(e.layer._fidx)?e.layer._fidx:0;
    S.activeId=L.id; S.selRaster=null;
    S.selFeat={layer:L,layerId:L.id,idx};
    try{ highlightSel(); }catch(_){}
    closeFeatMenu();
    openLayerProps(L);
  });
  L.llayer=fg; if(!L.visible) map.removeLayer(fg);
  zApply();
  // aplicar hachuras após render (paths já existem no DOM)
  setTimeout(()=>polyRefs.forEach(([lyr,st])=>applyHatch(lyr,st)),0);
}
