/* -------- paleta de PROPRIEDADES da camada ativa (esquerda) -------- */
/* -------- propriedades geométricas de uma feição (para a paleta) -------- */
function featZs(f){                  // achata todas as cotas Z da feição, se houver
  if(!f || !f.zg) return [];
  const out=[]; const push=v=>{ if(v!=null && isFinite(v)) out.push(+v); };
  (Array.isArray(f.zg[0])? f.zg : [f.zg]).forEach(r=>{ if(Array.isArray(r)) r.forEach(push); else push(r); });
  return out;
}
function featGeomInfo(L, f){
  if(!f || !f.geom) return null;
  const info={tipo:L.gtype, partes:0, verts:0, fechada:null, sentido:null,
    area:null, perim:null, comp:null, z:false, zmin:null, zmax:null};
  const zs=featZs(f); if(zs.length){ info.z=true; info.zmin=Math.min(...zs); info.zmax=Math.max(...zs); }
  if(L.gtype==='point'){ info.verts=f.geom.length; info.partes=f.geom.length; return info; }
  const rings=(f.multi&&Array.isArray(f.geom[0][0]))? f.geom : [f.geom];
  info.partes=rings.length;
  let per=0, comp=0, areaTot=0; let primeiro=true;
  for(const r of rings){
    info.verts+=r.length;
    let L2c=0; for(let i=0;i<r.length-1;i++) L2c+=Math.hypot(r[i+1][0]-r[i][0], r[i+1][1]-r[i][1]);
    const a=r[0], b=r[r.length-1];
    const fech = r.length>=4 && Math.hypot(a[0]-b[0],a[1]-b[1]) <= Math.max(1e-6, 0.001*Math.sqrt(Math.abs(ringArea(r))||1));
    if(primeiro){ info.fechada=fech; primeiro=false; }
    if(L.gtype==='polygon' || fech){
      const ar=ringArea(r);                       // >0 anti-horário, <0 horário (Y para cima)
      if(primeiro || info.sentido===null) info.sentido = ar>=0 ? 'anti-horário' : 'horário';
      areaTot+=Math.abs(ar); per+=L2c;
    } else { comp+=L2c; }
  }
  // sentido do anel externo (o de maior |área|)
  let maiorA=-1, sent=null;
  for(const r of rings){ const ar=ringArea(r); if(Math.abs(ar)>maiorA){ maiorA=Math.abs(ar); sent=ar>=0?'anti-horário':'horário'; } }
  if(L.gtype==='polygon' || info.fechada) info.sentido=sent;
  if(areaTot>0){ info.area=areaTot; info.perim=per; }
  if(comp>0) info.comp=comp;
  return info;
}
function fmtNum(v,dec){ return (v==null||!isFinite(v))?'—':
  Number(v).toLocaleString('pt-BR',{minimumFractionDigits:dec,maximumFractionDigits:dec}); }

function ppGeomHTML(L){
  // feição em foco: a selecionada no mapa (se for desta camada), senão a 1ª
  let f=null, rot='';
  if(S.selFeat && S.selFeat.layerId===L.id){ f=L.features[S.selFeat.idx]; rot=' (selecionada)'; }
  else if(L.features.length){ f=L.features[0]; rot=L.features.length>1? ' (1ª feição)':''; }
  const g=f? featGeomInfo(L,f):null;
  let linhas='';
  const li=(k,v)=>{ linhas+='<div style="display:flex;justify-content:space-between;gap:8px;padding:1px 0">'+
    '<span style="color:var(--ink-dim)">'+k+'</span><b style="font-family:var(--mono);font-size:11px">'+v+'</b></div>'; };
  if(g){
    li('Tipo', esc(g.tipo)+(g.z?' · 3D':' · 2D'));
    if(g.partes>1) li('Partes', g.partes);
    li('Vértices', g.verts);
    if(g.tipo!=='point'){
      if(g.fechada!=null){
        if(g.tipo==='polygon' && !g.fechada)
          li('Fechada', '<button class="mini" id="ppClosePoly" title="Acrescentar o primeiro vértice ao final do contorno" style="margin:0;padding:3px 7px;color:var(--amber)">não · fechar agora</button>');
        else li('Fechada', g.fechada?'sim':'não');
      }
      if(g.sentido) li('Sentido', g.sentido);
    }
    if(g.area!=null){ li('Área', fmtNum(g.area,2)+' m²'); li('Área (ha)', fmtNum(g.area/1e4,4)); li('Perímetro', fmtNum(g.perim,2)+' m'); }
    if(g.comp!=null) li('Comprimento', fmtNum(g.comp,2)+' m');
    if(g.z){ li('Cota máx.', fmtNum(g.zmax,3)+' m'); li('Cota mín.', fmtNum(g.zmin,3)+' m');
      li('Desnível', fmtNum(g.zmax-g.zmin,3)+' m'); }
  } else linhas='<div class="hint">Camada sem feições.</div>';
  return '<div style="border-top:1px dashed var(--line);margin-top:10px;padding-top:8px">'+
    '<label class="field">Geometria'+rot+'</label>'+
    '<div style="font-size:11.5px;line-height:1.5;margin-top:3px">'+linhas+'</div>'+
    (L.features.length>1 && !(S.selFeat&&S.selFeat.layerId===L.id)?
      '<div class="hint" style="margin-top:4px">Toque numa feição no mapa (◈) para ver a geometria dela.</div>':'')+
    '</div>';
}
function ppAttrHTML(L){
  const selected=ppSelectedFeature(L);
  if(selected){
    const props=selected.f.props||{},names=[...new Set([...(L.fields||[]).map(f=>typeof f==='string'?f:f&&f.name),...Object.keys(props)].filter(Boolean))];
    return '<div data-prop-selection="attributes" style="border-top:1px dashed var(--line);margin-top:10px;padding-top:8px;overflow-wrap:anywhere">'+
      '<label class="field">Atributos da feição selecionada (#'+selected.idx+')</label>'+
      (names.length?names.map(n=>{
        const v=props[n],text=v==null?'—':typeof v==='object'?JSON.stringify(v):String(v);
        return '<div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:8px;padding:3px 0">'+
          '<span style="color:var(--ink-dim);overflow-wrap:anywhere">'+esc(n)+'</span>'+
          '<b style="text-align:right;font-size:11px;overflow-wrap:anywhere">'+esc(text)+'</b></div>';
      }).join(''):'<div class="hint">Feição sem atributos.</div>')+'</div>';
  }
  // colunas da tabela de atributos: nomes + tipo inferido
  const campos=(L.fields||[]).map(f=>typeof f==='string'?{name:f}:f).filter(f=>f&&f.name);
  let nomes=campos.map(c=>c.name);
  if(!nomes.length){                                  // sem fields definidos: deduz das props
    const set=new Set(); (L.features||[]).slice(0,50).forEach(f=>{ if(f.props) Object.keys(f.props).forEach(k=>set.add(k)); });
    nomes=[...set];
  }
  let corpo;
  if(!nomes.length) corpo='<div class="hint">Sem colunas de atributo.</div>';
  else{
    const tipoDe=n=>{ for(const f of (L.features||[])){ const v=f.props&&f.props[n];
      if(v==null||v==='') continue; return (typeof v==='number'||(!isNaN(parseFloat(v))&&isFinite(v)))?'nº':'texto'; } return '—'; };
    corpo='<div style="max-height:150px;overflow:auto;font-size:11.5px">'+
      nomes.map(n=>'<div style="display:flex;justify-content:space-between;gap:8px;padding:1px 0">'+
        '<span style="font-family:var(--mono)">'+esc(n)+'</span>'+
        '<span style="color:var(--ink-dim)">'+tipoDe(n)+'</span></div>').join('')+'</div>';
  }
  return '<div style="border-top:1px dashed var(--line);margin-top:10px;padding-top:8px">'+
    '<label class="field">Tabela de atributos · '+nomes.length+' coluna(s)</label>'+
    corpo+
    '</div>';
}
function attrFilterFields(L){
  const out=[],seen=new Set();
  (L.fields||[]).forEach(f=>{const n=typeof f==='string'?f:f&&f.name;if(n&&!seen.has(n)){seen.add(n);out.push(n);}});
  if(!out.length)(L.features||[]).slice(0,100).forEach(f=>Object.keys((f&&f.props)||{}).forEach(n=>{if(!seen.has(n)){seen.add(n);out.push(n);}}));
  return out;
}
function ppAttrFilterHTML(L){
  const fields=attrFilterFields(L),q=L.attrFilter||{},n=attrFilterCount(L),active=!!(q.enabled!==false&&q.field);
  const ops=[['eq','igual a'],['neq','diferente de'],['contains','contém'],['notcontains','não contém'],
    ['starts','começa com'],['ends','termina com'],['in','está na lista'],['gt','maior que'],['gte','maior ou igual'],
    ['lt','menor que'],['lte','menor ou igual'],['between','entre'],['empty','está vazio'],['notempty','não está vazio']];
  return '<div style="border:1px solid '+(active?'var(--amber)':'var(--line)')+';border-radius:8px;padding:8px;margin:8px 0">'+
    '<label class="field" style="display:flex;justify-content:space-between;gap:6px"><span>⌯ Filtro por atributo</span><span style="color:'+(active?'var(--amber)':'var(--ink-dim)')+'">'+
      (active?n.toLocaleString('pt-BR')+' de '+L.features.length.toLocaleString('pt-BR'):L.features.length.toLocaleString('pt-BR')+' feições')+'</span></label>'+
    (fields.length?'<div class="row2" style="margin-top:5px"><select id="ppFltField" title="Campo da tabela usado no filtro">'+
      '<option value="">— escolha o campo —</option>'+fields.map(f=>'<option value="'+esc(f)+'" '+(q.field===f?'selected':'')+'>'+esc(f)+'</option>').join('')+'</select>'+
      '<select id="ppFltOp" title="Condição do filtro">'+ops.map(([v,t])=>'<option value="'+v+'" '+((q.op||'eq')===v?'selected':'')+'>'+t+'</option>').join('')+'</select></div>'+
      '<div class="row2" id="ppFltValues" style="margin-top:5px"><input id="ppFltValue" list="ppFltSuggestions" value="'+esc(q.value??'')+'" placeholder="valor ou lista: A, B, C" title="Valor procurado">'+
      '<input id="ppFltValue2" value="'+esc(q.value2??'')+'" placeholder="valor final" title="Segundo valor, usado pelo operador entre"></div><datalist id="ppFltSuggestions"></datalist>'+
      '<label style="display:flex;align-items:center;gap:6px;font-size:11px;margin-top:5px"><input id="ppFltCase" type="checkbox" '+(q.caseSensitive?'checked':'')+' style="width:auto">Diferenciar maiúsculas e minúsculas</label>'+
      '<div class="row2" style="margin-top:6px"><button class="tbtn" id="ppFltApply" style="justify-content:center;background:var(--amber);color:#1a1206;font-weight:700">✓ Aplicar filtro</button>'+
      '<button class="tbtn" id="ppFltClear" style="justify-content:center" '+(active?'':'disabled')+'>× Limpar</button></div>':
      '<div class="hint">Esta camada não possui campos de atributos.</div>')+
    '<div class="hint" style="margin-top:5px">O filtro não apaga dados e também é aplicado ao 3D, Layout, rótulos e exportações.</div></div>';
}
function attrFilterSuggestions(L,field){
  const dl=document.getElementById('ppFltSuggestions');if(!dl)return;const vals=new Set();
  for(const f of (L.features||[])){const v=f&&f.props?f.props[field]:null;if(v!=null&&String(v)!=='')vals.add(String(v));if(vals.size>=250)break;}
  dl.innerHTML=[...vals].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true})).map(v=>'<option value="'+esc(v)+'"></option>').join('');
}
function attrFilterApplyUi(L){
  const field=(document.getElementById('ppFltField')||{}).value||'',op=(document.getElementById('ppFltOp')||{}).value||'eq',
    value=(document.getElementById('ppFltValue')||{}).value??'',value2=(document.getElementById('ppFltValue2')||{}).value??'',
    caseSensitive=!!(document.getElementById('ppFltCase')||{}).checked;
  if(!field){toast('Escolha o campo que será filtrado');return;}
  if(!['empty','notempty'].includes(op)&&String(value).trim()===''){toast('Informe o valor do filtro');return;}
  if(op==='between'&&String(value2).trim()===''){toast('Informe o valor inicial e o valor final');return;}
  L.attrFilter={enabled:true,field,op,value,value2,caseSensitive};
  if(S.selFeat&&S.selFeat.layerId===L.id&&!attrFilterMatch(L,L.features[S.selFeat.idx])){S.selFeat=null;try{highlightSel();}catch(e){}}
  S.msel.items=(S.msel.items||[]).filter(it=>{const X=S.layers.find(x=>x.id===it.layerId),f=X&&X.features[it.idx];return X&&f&&attrFilterMatch(X,f);});
  try{mselHL();mselCount();}catch(e){}drawLayer(L);refreshUI();
  toast('Filtro aplicado: '+attrFilterCount(L).toLocaleString('pt-BR')+' de '+L.features.length.toLocaleString('pt-BR')+' feições');
}
function attrFilterClear(L){delete L.attrFilter;drawLayer(L);refreshUI();toast('Filtro removido — todas as feições estão visíveis');}
/* geometria de um raster/MDT para a paleta: extensão 2D, área 3D real
   (soma das faces dos 2 triângulos de cada célula válida), cotas e células.
   CACHEADO por raster (r._geomInfo) — o cálculo varre a grade e não pode
   rodar a cada clique. Área 3D só é calculada até um teto de células; acima
   dele usa uma amostragem regular (mantém a razão 3D/2D representativa). */
function rasterGeomInfo(r){
  if(!r) return null;
  if(r._geomInfo && r._geomInfoKey===(r.d&&r.d.z&&r.d.z.length)) return r._geomInfo;
  const d=r.d||r; if(!d||!d.z||!d.nc){ return null; }
  const nc=d.nc, nr=d.nr, csx=d.cs, csy=(d.csy||d.cs);
  const z=d.z;
  let zmin=Infinity, zmax=-Infinity, nVal=0;
  for(let k=0;k<z.length;k++){ const v=z[k]; if(v!=null&&isFinite(v)){ nVal++; if(v<zmin)zmin=v; if(v>zmax)zmax=v; } }
  if(!nVal){ const g0={nc,nr,csx,csy,nVal:0}; r._geomInfo=g0; r._geomInfoKey=z.length; return g0; }
  const area2D = nVal*csx*csy;
  // área 3D — com teto: acima de AREA3D_MAX células, amostra de STEP em STEP
  const AREA3D_MAX=8e6;
  const total=(nc-1)*(nr-1);
  const step = total>AREA3D_MAX ? Math.ceil(Math.sqrt(total/AREA3D_MAX)) : 1;
  let area3D=0, quads=0;
  const at=(i,j)=> (i>=0&&i<nc&&j>=0&&j<nr)? z[j*nc+i] : NaN;
  const triArea=(az,bz,cz,dx1,dy1,dx2,dy2)=>{
    // dois vetores no plano da célula (passo real em metros), z variável
    const ux=dx1,uy=dy1,uz=bz-az, vx=dx2,vy=dy2,vz=cz-az;
    const nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx;
    return 0.5*Math.hypot(nx,ny,nz);
  };
  const sx=csx*step, sy=csy*step;                 // passo real da amostra (m)
  for(let j=0;j+step<nr;j+=step) for(let i=0;i+step<nc;i+=step){
    const z00=at(i,j), z10=at(i+step,j), z01=at(i,j+step), z11=at(i+step,j+step);
    if(![z00,z10,z01,z11].every(isFinite)) continue;
    area3D+=triArea(z00,z10,z01, sx,0, 0,sy);
    area3D+=triArea(z10,z11,z01, 0,sy, -sx,sy);
    quads++;
  }
  // se amostrou, escala a área pela fração coberta (quads·step² ≈ total de quads)
  let area3Dtot=null;
  if(quads){ area3Dtot = (step>1) ? area3D*(total/(quads*step*step)) : area3D; }
  const info={nc,nr,csx,csy,nVal, area2D, area3D:area3Dtot, zmin,zmax, amostrado:(step>1)};
  r._geomInfo=info; r._geomInfoKey=z.length;
  return info;
}
function ppRasterHTML(r){
  const g=rasterGeomInfo(r);
  let linhas='';
  const li=(k,v)=>{ linhas+='<div style="display:flex;justify-content:space-between;gap:8px;padding:1px 0">'+
    '<span style="color:var(--ink-dim)">'+k+'</span><b style="font-family:var(--mono);font-size:11px">'+v+'</b></div>'; };
  if(g && g.nVal){
    li('Grade', g.nc+' × '+g.nr);
    li('Resolução', fmtNum(g.csx,3)+(Math.abs(g.csx-g.csy)>1e-6?' × '+fmtNum(g.csy,3):'')+' m');
    li('Células c/ dado', g.nVal.toLocaleString('pt-BR'));
    li('Área 2D', fmtNum(g.area2D,2)+' m²');
    li('Área 2D (ha)', fmtNum(g.area2D/1e4,4));
    if(g.area3D!=null){ li('Área 3D (superfície)', fmtNum(g.area3D,2)+' m²');
      li('Área 3D (ha)', fmtNum(g.area3D/1e4,4));
      li('Rugosidade (3D/2D)', fmtNum(g.area3D/g.area2D,4)); }
    li('Cota máx.', fmtNum(g.zmax,3)+' m');
    li('Cota mín.', fmtNum(g.zmin,3)+' m');
    li('Desnível', fmtNum(g.zmax-g.zmin,3)+' m');
    /* Quando a rampa é recortada no percentil, a legenda mostra outros números
       que estes. Sem dizer isso aqui, as duas telas parecem se contradizer. */
    try{
      const _st=r._st||(r._st=rasterStats(r.d));
      if(_st && _st.cauda)
        li('Faixa da legenda', fmtNum(_st.mn,2)+' – '+fmtNum(_st.mx,2)+' m <span style="opacity:.6">(percentil 2–98)</span>');
    }catch(e){}
  } else linhas='<div class="hint">Superfície sem células válidas.</div>';
  return '<label class="field">Propriedades — superfície (MDT)</label>'+
    '<div style="margin:2px 0 8px"><b style="font-size:13px">'+esc(r.name||'MDE')+'</b></div>'+
    '<div style="border-top:1px dashed var(--line);padding-top:8px">'+
    '<label class="field">Geometria da superfície</label>'+
    '<div style="font-size:11.5px;line-height:1.5;margin-top:3px">'+linhas+'</div></div>';
}
/* FICHA DA ORTOFOTO NO PAINEL DE PROPRIEDADES — o mesmo cartão que o MDT tem.
   Clicar na ortofoto na árvore punha S.selRaster=S.img, mas propRefresh só
   reconhecia rasters de S.rasters: o painel caía em "Nenhuma camada ativa" e a
   ortofoto era a única camada sem ficha. Mesma estrutura, mesmos termos. */
function ppImageHTML(I){
  let linhas='';
  const li=(k,v)=>{ linhas+='<div style="display:flex;justify-content:space-between;gap:8px;padding:1px 0">'+
    '<span style="color:var(--ink-dim)">'+k+'</span><b style="font-family:var(--mono);font-size:11px">'+v+'</b></div>'; };
  const b=Array.isArray(I.b)?I.b.map(Number):null, temArq=!!(I._img0&&I._tiff);
  const W0=temArq?I._W0:(I._W0||null), H0=temArq?I._H0:(I._H0||null);
  const larg=b?(b[2]-b[0]):NaN, alt=b?(b[3]-b[1]):NaN;
  const cmpx=px=>(Number.isFinite(larg)&&px>0)?fmtNum(larg/px*100,1)+' cm/px':'—';
  const crs=(typeof orthoCRS==='function')?orthoCRS(I):S.workCRS;
  if(b && Number.isFinite(larg) && Number.isFinite(alt)){
    li('Prévia na tela', (I._w&&I._h)?I._w+' × '+I._h+' px':'—');
    li('Original', (W0&&H0)?W0+' × '+H0+' px'+(temArq?'':' <span style="opacity:.6">(não vinculado)</span>'):'<span style="opacity:.6">GeoTIFF não vinculado</span>');
    li('Resolução', (W0?cmpx(W0):cmpx(I._w||0))+((W0&&I._w&&I._w!==W0)?' <span style="opacity:.6">(prévia '+cmpx(I._w)+')</span>':''));
    li('Extensão X', fmtNum(b[0],2)+' – '+fmtNum(b[2],2));
    li('Extensão Y', fmtNum(b[1],2)+' – '+fmtNum(b[3],2));
    li('Tamanho', fmtNum(larg/1000,3)+' × '+fmtNum(alt/1000,3)+' km');
    li('Área', fmtNum(larg*alt/1e4,4)+' ha');
    li('CRS dos cantos', esc(CRS_LABELS[crs]||crs)+(I._crsFixo?' <span style="opacity:.6">(fixado)</span>':''));
    li('Sem-dado', (I._ndPct!=null&&isFinite(I._ndPct))?fmtNum(I._ndPct,1)+' % descartado':'—');
    li('Opacidade', fmtNum(((I.overlay&&I.overlay.options&&I.overlay.options.opacity!=null&&!(typeof _orthoGrid!=='undefined'&&_orthoGrid))?I.overlay.options.opacity:(typeof orthoOpacidade==='function'?orthoOpacidade():1))*100,0)+' %');
    li('Tiles do original', temArq?(S.orthoHD?'ativos'+(S.orthoDispFull?' · resolução original':''):'desligados (prévia)'):'indisponíveis');
    li('Pirâmide (COG)', I._cog?(I._cog.nOv?I._cog.nOv+' nível(is)':'nenhuma'):'—');
    li('Arquivo', I.src&&I.src.file?esc(String(I.src.file))+(I.src.size?' <span style="opacity:.6">('+fmtNum(I.src.size/1048576,1)+' MB)</span>':''):'—');
    li('Pasta de trabalho', I.projectFile?esc(String(I.projectFile)):'<span style="opacity:.6">não gravada</span>');
  } else linhas='<div class="hint">Ortofoto sem extensão válida.</div>';
  return '<label class="field">Propriedades — ortofoto (imagem)</label>'+
    '<div style="margin:2px 0 8px"><b style="font-size:13px">'+esc(I.name||'ortofoto')+'</b></div>'+
    '<div style="border-top:1px dashed var(--line);padding-top:8px">'+
    '<label class="field">Geometria da imagem</label>'+
    '<div style="font-size:11.5px;line-height:1.5;margin-top:3px">'+linhas+'</div>'+
    '<div class="hint" style="margin-top:6px">Estilo, resolução, pasta de trabalho, exportação e CRS: ⚙ da ortofoto na árvore.</div></div>';
}
function propRefresh(){
  const d=document.getElementById('propDockContent')||document.getElementById('propDock');if(!d||!acadOn())return;
  if(S.selRaster&&(S.rasters||[]).includes(S.selRaster)&&!S.activeId){d.innerHTML=ppRasterHTML(S.selRaster);return;}
  if(S.selRaster&&S.img&&S.selRaster===S.img&&!S.activeId){d.innerHTML=ppImageHTML(S.img);return;}
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
    '<label class="field">'+(ppSelectedIndices(L).length?'Propriedades — seleção':'Propriedades — camada ativa')+'</label>'+
    '<div style="margin:3px 0 8px;font-size:14px"><b>'+esc(L.name)+'</b></div>'+
    '<div style="font-size:11.5px;line-height:1.5">'+
      ppMetricLine('Tipo',esc(L.gtype))+
      ppMetricLine('Feições da camada',temFlt?nFlt.toLocaleString('pt-BR')+' visíveis de '+L.features.length.toLocaleString('pt-BR'):L.features.length.toLocaleString('pt-BR'))+
      ppMetricLine('CRS da camada',esc(String(L.crs)))+
      ppMetricLine('Visibilidade',vis)+
      ppMetricLine('Bloqueio',L.locked?'bloqueada':'desbloqueada')+
      ppMetricLine('Classificação',esc(cls))+
      ppMetricLine('Cor principal','<span style="display:inline-block;width:10px;height:10px;border:1px solid #6f8190;background:'+esc(cor)+';vertical-align:-1px;margin-right:4px"></span>'+esc(cor))+
      ppMetricLine('Espessura',fmtNum(L.weight??s.weight??2,1)+' px')+
      (L.gtype==='polygon'?ppMetricLine('Preenchimento',fill+'%'):'')+
      ppMetricLine('Rótulo',esc(rot))+
      ppMetricLine('Filtro',temFlt?esc(q.field+' · '+nFlt+' de '+L.features.length):'sem filtro')+
    '</div>'+featureContinueHTML(L)+ppLayerGeomHTML(L)+ppAttrHTML(L);
  bindFeatureContinue(d,L);
}

/* O painel de propriedades ocupa uma coluna inteira no shell. Ele pode ser
   recolhido sem alterar a camada ativa ou perder os valores em edição. */
(function initPropDockToggle(){
  const b=document.getElementById('propDockToggle');if(!b)return;
  const KEY='ccmgisPropDockCollapsedV1';
  const aplica=fechado=>{
    fechado=!!fechado;document.body.classList.toggle('prop-dock-collapsed',fechado);
    b.textContent=fechado?'‹':'›';b.title=fechado?'Mostrar propriedades':'Recolher propriedades';
    b.setAttribute('aria-label',b.title);b.setAttribute('aria-expanded',String(!fechado));
    try{localStorage.setItem(KEY,fechado?'1':'0');}catch(e){}
  };
  b.onclick=()=>aplica(!document.body.classList.contains('prop-dock-collapsed'));
  let salvo=false;try{salvo=localStorage.getItem(KEY)==='1';}catch(e){}
  aplica(salvo);
})();
(function(){
  // interface CCMGIS 3.0 sempre ativa; a ribbon usa a infraestrutura estável da 2.0
  document.body.classList.add('acad','alagis3');
  try{ localStorage.setItem(ACAD_KEY,'1'); }catch(e){}
  try{ if(typeof prefsApply==='function') prefsApply(); }catch(e){}
  { const x=document.getElementById('btnCloseRight'); if(x) x.style.display='none';
    const tb=document.getElementById('tabBar'); if(tb) tb.style.display='none'; }
  const b=document.getElementById('btnAcad');
  if(b){ b.onclick=()=>acadSet(!acadOn()); b.classList.toggle('on', acadOn()); }
  try{ ribbonBuild(); }catch(e){}
  try{ propRefresh(); }catch(e){}
})();

