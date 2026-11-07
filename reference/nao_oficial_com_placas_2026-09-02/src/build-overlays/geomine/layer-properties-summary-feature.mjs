function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Trecho não encontrado: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Trecho ambíguo (mais de uma ocorrência): ${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function replaceBetween(source, startToken, endToken, replacement, label) {
  const start = source.indexOf(startToken);
  if (start < 0) throw new Error(`Início não encontrado: ${label}`);
  const end = source.indexOf(endToken, start + startToken.length);
  if (end < 0) throw new Error(`Fim não encontrado: ${label}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

/* O painel fixo da direita é uma ficha de consulta da camada. Todas as ações
   de edição continuam no modal aberto pelo ícone de engrenagem da árvore. */
export function aplicaResumoPropriedadesCamada(source) {
  let out = source;

  out = replaceBetween(
    out,
    "function measureFeature(L,f){",
    "function layerTotals(L){",
`function measurePointInRing(pt,ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if((a[1]>pt[1])!==(b[1]>pt[1])&&
       pt[0]<(b[0]-a[0])*(pt[1]-a[1])/((b[1]-a[1])||1e-20)+a[0])inside=!inside;
  }
  return inside;
}
function measureProjectedRings(L,f){
  const raw=(f&&f.multi&&Array.isArray(f.geom)&&Array.isArray(f.geom[0])&&Array.isArray(f.geom[0][0]))
    ?f.geom:[f&&f.geom];
  return raw.filter(Array.isArray).map(r=>r.map(pt=>{
    if(!Array.isArray(pt)||!Number.isFinite(+pt[0])||!Number.isFinite(+pt[1]))return null;
    const q=L.crs===S.workCRS?[+pt[0],+pt[1]]:reproj(L.crs,S.workCRS,+pt[0],+pt[1]);
    return Array.isArray(q)&&Number.isFinite(+q[0])&&Number.isFinite(+q[1])?[+q[0],+q[1]]:null;
  }).filter(Boolean)).filter(r=>r.length);
}
function measureFeature(L,f){
  if(!L||!f||!f.geom||!f.geom.length)return {};
  const rings=measureProjectedRings(L,f);
  if(!rings.length)return {};
  if(L.gtype==='point'){
    const p=rings[0][0];return {tipo:'ponto',E:p&&p[0],N:p&&p[1],nverts:rings.reduce((n,r)=>n+r.length,0),partes:rings.length};
  }
  let per=0,comp=0,nverts=0;
  const infos=[];
  rings.forEach(r=>{
    nverts+=r.length;let len=0;
    for(let i=1;i<r.length;i++)len+=Math.hypot(r[i][0]-r[i-1][0],r[i][1]-r[i-1][1]);
    if(L.gtype==='polygon'&&r.length>2){
      const a=r[0],b=r[r.length-1];
      if(a[0]!==b[0]||a[1]!==b[1])len+=Math.hypot(a[0]-b[0],a[1]-b[1]);
      let signed=0;for(let i=0,j=r.length-1;i<r.length;j=i++)signed+=r[j][0]*r[i][1]-r[i][0]*r[j][1];
      const abs=Math.abs(signed/2);if(abs>1e-12)infos.push({ring:r,abs,depth:0});
      per+=len;
    }else comp+=len;
  });
  if(L.gtype!=='polygon')return {tipo:'linha',comp,nverts,partes:rings.length};
  /* A orientação do arquivo não é usada para decidir casca/furo. A
     profundidade de contenção trata igualmente anéis invertidos, furos,
     ilhas dentro de furos e partes desconectadas. */
  infos.sort((a,b)=>b.abs-a.abs);
  infos.forEach((x,i)=>{
    const p=x.ring[0];let depth=0;
    for(let j=0;j<i;j++)if(infos[j].abs>x.abs&&measurePointInRing(p,infos[j].ring))depth++;
    x.depth=depth;
  });
  const area=Math.max(0,infos.reduce((s,x)=>s+(x.depth%2?-x.abs:x.abs),0));
  return {tipo:'polígono',area,per,nverts,
    partes:infos.filter(x=>x.depth%2===0).length,furos:infos.filter(x=>x.depth%2===1).length};
}
function layerSummaryMetrics(L,predicate){
  const R={features:0,vertices:0,partes:0,furos:0,area:0,per:0,comp:0,z:false,zmin:Infinity,zmax:-Infinity};
  (L.features||[]).forEach((f,i)=>{
    if(predicate&&!predicate(f,i))return;R.features++;
    let m={};try{m=measureFeature(L,f)||{};}catch(e){if(!L._avisoMedidaResumo){L._avisoMedidaResumo=1;console.warn('medida ignorada em',L.name,e);}}
    R.vertices+=m.nverts||0;R.partes+=m.partes||0;R.furos+=m.furos||0;
    R.area+=m.area||0;R.per+=m.per||0;R.comp+=m.comp||0;
    (function zWalk(v){if(Array.isArray(v))v.forEach(zWalk);else if(v!==null&&v!==''&&Number.isFinite(+v)){
      const z=+v;R.z=true;R.zmin=Math.min(R.zmin,z);R.zmax=Math.max(R.zmax,z);
    }})(f&&f.zg);
  });
  if(!R.z){R.zmin=null;R.zmax=null;}return R;
}
function ppMetricLine(k,v){return '<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0">'+
  '<span style="color:var(--ink-dim)">'+esc(k)+'</span><b style="text-align:right;font-size:11px">'+v+'</b></div>';}
function ppMetricBlock(L,title,M){
  let h='<div style="border-top:1px dashed var(--line);margin-top:9px;padding-top:8px">'+
    '<label class="field">'+esc(title)+'</label>';
  h+=ppMetricLine('Feições',M.features.toLocaleString('pt-BR'));
  h+=ppMetricLine('Dimensão',M.z?'3D':'2D');
  if(L.gtype==='point')h+=ppMetricLine('Pontos',M.vertices.toLocaleString('pt-BR'));
  else{
    if(M.partes)h+=ppMetricLine('Partes',M.partes.toLocaleString('pt-BR'));
    if(M.furos)h+=ppMetricLine('Furos',M.furos.toLocaleString('pt-BR'));
    h+=ppMetricLine('Vértices',M.vertices.toLocaleString('pt-BR'));
  }
  if(L.gtype==='polygon'){
    h+=ppMetricLine('Área',fmtNum(M.area,2)+' m²');
    h+=ppMetricLine('Área (ha)',fmtNum(M.area/10000,4)+' ha');
    h+=ppMetricLine('Perímetro',fmtNum(M.per,2)+' m');
  }else if(L.gtype==='line')h+=ppMetricLine('Comprimento',fmtNum(M.comp,2)+' m');
  if(M.z){h+=ppMetricLine('Cota máx.',fmtNum(M.zmax,3)+' m');h+=ppMetricLine('Cota mín.',fmtNum(M.zmin,3)+' m');
    h+=ppMetricLine('Desnível',fmtNum(M.zmax-M.zmin,3)+' m');}
  return h+'</div>';
}
function ppLayerGeomHTML(L){
  const total=layerSummaryMetrics(L),q=L.attrFilter||{},filtrado=!!(q.enabled!==false&&q.field);
  let h='';
  if(filtrado){
    const vis=layerSummaryMetrics(L,f=>attrFilterMatch(L,f));
    h+=ppMetricBlock(L,'Geometria filtrada ('+vis.features+' de '+total.features+' feições)',vis);
  }
  h+=ppMetricBlock(L,filtrado?'Geometria total da camada':'Geometria total da camada ('+total.features+' feições)',total);
  return h+'<div class="hint" style="margin-top:5px">Medições no CRS do projeto: '+esc(String(S.workCRS))+'; furos são descontados e partes desconectadas são somadas.</div>';
}
`,
    "medição robusta e resumo total da camada"
  );

  out = replaceOnce(
    out,
`    corpo+
    '<button class="tbtn" id="ppTable" style="width:100%;justify-content:center;margin-top:6px">▤ Abrir tabela</button>'+
    '</div>';`,
`    corpo+
    '</div>';`,
    "tabela somente informativa no painel fixo"
  );

  out = replaceOnce(
    out,
`    '<div style="font-size:11.5px;line-height:1.5;margin-top:3px">'+linhas+'</div></div>'+
    '<button class="tbtn" id="ppRasCfg" style="width:100%;justify-content:center;margin-top:10px">⚙ Propriedades, resolução e curvas…</button>'+
    '<button class="tbtn" id="ppRasLimpa" style="width:100%;justify-content:center;margin-top:6px">⌫ Limpar valores extremos…</button>';`,
`    '<div style="font-size:11.5px;line-height:1.5;margin-top:3px">'+linhas+'</div></div>';`,
    "superfície somente informativa no painel fixo"
  );

  out = replaceBetween(
    out,
    "function propRefresh(){",
    "/* O painel de propriedades ocupa uma coluna inteira no shell.",
`function propRefresh(){
  const d=document.getElementById('propDockContent')||document.getElementById('propDock');if(!d||!acadOn())return;
  if(S.selRaster&&(S.rasters||[]).includes(S.selRaster)&&!S.activeId){d.innerHTML=ppRasterHTML(S.selRaster);return;}
  const L=(typeof activeLayer==='function')?activeLayer():null;
  if(!L){
    d.innerHTML='<label class="field">Propriedades</label><div class="hint">Nenhuma camada ativa.<br>Toque numa camada ou superfície na lista para consultar suas propriedades.</div>';
    return;
  }
  const s=L.sym||{},q=L.attrFilter||{},temFlt=!!(q.enabled!==false&&q.field),nFlt=temFlt?attrFilterCount(L):L.features.length,
    c=labelCfg(L),expr=String(c.expr||'').trim(),rot=expr?'ƒx fórmula':(labelCampos(L).join(', ')||'desligado'),
    cls=s.mode==='grad'?'graduada por '+(s.field||'atributo'):s.mode==='cat'?'categorizada por '+(s.field||'atributo'):'símbolo único',
    vis=L.visible!==false?'visível':'oculta',fill=Math.round((L.fill||s.fill||0)*100),cor=L.color||s.color||'#000000';
  d.innerHTML=
    '<label class="field">Propriedades — camada ativa</label>'+
    '<div style="margin:3px 0 8px;font-size:14px"><b>'+esc(L.name)+'</b></div>'+
    '<div style="font-size:11.5px;line-height:1.5">'+
      ppMetricLine('Tipo',esc(L.gtype))+
      ppMetricLine('Feições',temFlt?nFlt.toLocaleString('pt-BR')+' visíveis de '+L.features.length.toLocaleString('pt-BR'):L.features.length.toLocaleString('pt-BR'))+
      ppMetricLine('CRS da camada',esc(String(L.crs)))+
      ppMetricLine('Visibilidade',vis)+
      ppMetricLine('Bloqueio',L.locked?'bloqueada':'desbloqueada')+
      ppMetricLine('Classificação',esc(cls))+
      ppMetricLine('Cor principal','<span style="display:inline-block;width:10px;height:10px;border:1px solid #6f8190;background:'+esc(cor)+';vertical-align:-1px;margin-right:4px"></span>'+esc(cor))+
      ppMetricLine('Espessura',fmtNum(L.weight??s.weight??2,1)+' px')+
      (L.gtype==='polygon'?ppMetricLine('Preenchimento',fill+'%'):'')+
      ppMetricLine('Rótulo',esc(rot))+
      ppMetricLine('Filtro',temFlt?esc(q.field+' · '+nFlt+' de '+L.features.length):'sem filtro')+
    '</div>'+ppLayerGeomHTML(L)+ppAttrHTML(L);
}

`,
    "painel fixo somente leitura"
  );

  /* Copiar/colar estilo não some: apenas deixa a ficha somente leitura e vai
     para a aba de Simbologia do editor completo. */
  out = replaceOnce(
    out,
`        <div class="hint" style="margin-top:4px">Nomes longos de shapefile poluem a legenda — encurte aqui.</div>
      </div>

      <div class="lp-cls-ctrl">`,
`        <div class="hint" style="margin-top:4px">Nomes longos de shapefile poluem a legenda — encurte aqui.</div>
      </div>

      <div class="lp-cls-ctrl">
        <label class="field">Transferir estilo entre camadas</label>
        <div class="row2">
          <button class="tbtn" id="lpStyleCopy" style="justify-content:center">⧉ Copiar estilo</button>
          <button class="tbtn" id="lpStylePaste" style="justify-content:center">▣ Colar estilo</button>
        </div>
        <div class="hint" style="margin-top:4px">Copia simbologia e rótulos; não altera geometria, atributos, filtro ou visibilidade.</div>
      </div>

      <div class="lp-cls-ctrl">`,
    "transferência de estilo no editor completo"
  );

  out = replaceOnce(
    out,
`  lpFillLabels(L);
  lpFillFilter(L);
  lpTab('sym');`,
`  lpFillLabels(L);
  lpFillFilter(L);
  { const cp=document.getElementById('lpStyleCopy'),ps=document.getElementById('lpStylePaste');
    if(cp)cp.onclick=()=>{layerStyleCopy(L);if(ps)ps.disabled=!S._layerStyleClipboard||S._layerStyleClipboard.gtype!==L.gtype;};
    if(ps){ps.disabled=!S._layerStyleClipboard||S._layerStyleClipboard.gtype!==L.gtype;ps.onclick=()=>{
      if(!layerStylePaste(L))return;lpSyncCtrl();renderLpClasses();lpFillLabels(L);lpFillFilter(L);
      document.getElementById('lpInfo').innerHTML=lpInfoHTML(L);
    };}
  }
  lpTab('sym');`,
    "eventos de copiar e colar estilo no editor completo"
  );

  return out;
}
