function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Trecho não encontrado: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Trecho ambíguo (mais de uma ocorrência): ${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

/* Mantém campos de área derivados sincronizados com a geometria. O atributo
   DBF não é uma fórmula: sem esta etapa ele conserva o número antigo depois
   de mover um vértice, cortar, dissolver ou transformar um polígono. */
export function aplicaAreaAutomatica(source) {
  let out = source;

  out = replaceOnce(
    out,
    "function ppMetricLine(k,v){",
`function autoAreaNormName(v){
  return String(v==null?'':v).normalize('NFD').replace(/[\\u0300-\\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9]/g,'');
}
function autoAreaFieldKind(field){
  const n=autoAreaNormName(field&&field.name!=null?field.name:field);
  if(n==='AREA')return 'ha';
  return null;
}
function autoAreaFields(L){
  if(!L||L.gtype!=='polygon')return [];
  return (L.fields||[]).map(field=>{
    if(!field||!['N','F'].includes(field.type))return null;
    let unit=autoAreaFieldKind(field);if(!unit)return null;
    /* Hectares precisam de seis casas no DBF para que a soma das linhas
       continue igual ao total geométrico; o arredondamento visual é separado. */
    const minimo=unit==='ha'?6:2;
    if(field&&(field.type==='N'||field.type==='F')&&(+field.decimal||0)<minimo)field.decimal=minimo;
    return {field,name:String(field.name),unit,decimal:Math.max(minimo,Math.min(10,+field.decimal||minimo))};
  }).filter(Boolean);
}
function autoAreaSyncFeature(L,f,defs){
  if(!L||L.gtype!=='polygon'||!f||!f.geom)return 0;
  const D=defs||autoAreaFields(L);if(!D.length)return 0;
  let m;try{m=measureFeature(L,f);}catch(e){return 0;}
  const a=Number(m&&m.area);if(!Number.isFinite(a))return 0;
  if(!f.props)f.props={};let changed=0;
  D.forEach(d=>{
    const value=d.unit==='ha'?a/10000:a,old=Number(f.props[d.name]),tol=Math.max(1e-12,Math.abs(value)*1e-12);
    if(!Number.isFinite(old)||Math.abs(old-value)>tol){f.props[d.name]=value;changed++;}
  });
  return changed;
}
function autoAreaSyncLayer(L){
  const D=autoAreaFields(L);if(!D.length)return 0;let changed=0;
  (L.features||[]).forEach(f=>{changed+=autoAreaSyncFeature(L,f,D);});
  return changed;
}
function autoAreaSyncAll(){
  let changed=0;(S.layers||[]).forEach(L=>{changed+=autoAreaSyncLayer(L);});return changed;
}
function autoAreaFieldReadOnly(field){
  return !!(field&&['N','F'].includes(field.type)&&autoAreaFieldKind(field));
}
function ppMetricLine(k,v){`,
    "motor de atualização automática das áreas"
  );

  out = replaceOnce(
    out,
`function drawLayer(L){
  /* Cada posição reconhecida precisa conservar seu número, ainda que várias`,
`function drawLayer(L){
  /* Todo redesenho causado por edição atualiza primeiro os atributos de área.
     Isso cobre vértices, movimento da feição, undo, clip, união e dissolve. */
  if(L&&L.gtype==='polygon'){
    const C=S._vtxDragging&&S._vtxCtx&&S._vtxCtx.L===L?S._vtxCtx:null;
    if(C&&C.f)autoAreaSyncFeature(L,C.f);else autoAreaSyncLayer(L);
  }
  /* Cada posição reconhecida precisa conservar seu número, ainda que várias`,
    "sincronização no redesenho de polígonos"
  );

  out = replaceOnce(
    out,
`function openAttr(selIdx){
  const L=activeLayer(); const panel=document.getElementById('attrPanel');
  if(!L){toast('Sem camada ativa');return;}`,
`function openAttr(selIdx){
  const L=activeLayer(); const panel=document.getElementById('attrPanel');
  if(!L){toast('Sem camada ativa');return;}
  if(L.gtype==='polygon')autoAreaSyncLayer(L);`,
    "área atualizada antes de abrir a tabela"
  );

  out = replaceOnce(
    out,
`function openFeatForm(L, feat){
  const flds=(L.fields||[]).filter(f=>f.name!=='FID');`,
`function openFeatForm(L, feat){
  /* Area é um campo derivado: aparece na tabela, mas nunca como entrada
     manual no formulário da nova feição. */
  const flds=(L.fields||[]).filter(f=>f.name!=='FID'&&!autoAreaFieldReadOnly(f));`,
    "campo Area fora do formulário manual"
  );

  out = replaceOnce(
    out,
`      L.fields.map(fl=>\`<td contenteditable data-f="\${fl.name}" data-i="\${i}">\${f.props[fl.name]??''}</td>\`).join('')+'</tr>';`,
`      L.fields.map(fl=>autoAreaFieldReadOnly(fl)
        ?\`<td data-derived-area="1" title="Calculado automaticamente pela geometria" data-f="\${fl.name}" data-i="\${i}">\${f.props[fl.name]??''}</td>\`
        :\`<td contenteditable data-f="\${fl.name}" data-i="\${i}">\${f.props[fl.name]??''}</td>\`).join('')+'</tr>';`,
    "campos de área somente leitura na tabela"
  );

  out = replaceOnce(
    out,
`async function exportLayerAs(L){
  if(!L) { toast('Sem camada ativa'); return; }`,
`async function exportLayerAs(L){
  if(!L) { toast('Sem camada ativa'); return; }
  if(L.gtype==='polygon')autoAreaSyncLayer(L);`,
    "pré-validação da área ao exportar uma camada"
  );

  out = replaceOnce(
    out,
`async function exportLayer(L, targetCRS){
  const feats=L.features.filter(f=>f.geom).map(f=>{`,
`async function exportLayer(L, targetCRS){
  if(L.gtype==='polygon')autoAreaSyncLayer(L);
  const feats=L.features.filter(f=>f.geom).map(f=>{`,
    "pré-validação da área no shapefile"
  );

  out = replaceOnce(
    out,
`function projectData(){
  /* Garante que os campos próprios da prancha ativa`,
`function projectData(){
  /* O projeto nunca grava atributos de área anteriores à geometria atual. */
  autoAreaSyncAll();
  /* Garante que os campos próprios da prancha ativa`,
    "pré-validação da área ao salvar o projeto"
  );

  out = replaceOnce(
    out,
`async function exportProjectQGIS(){
  if(!S.layers.length && !S.rasters.length && !(S.img&&S.img.url)){`,
`async function exportProjectQGIS(){
  autoAreaSyncAll();
  if(!S.layers.length && !S.rasters.length && !(S.img&&S.img.url)){`,
    "pré-validação da área no pacote QGIS"
  );

  out = replaceOnce(
    out,
`    else if(g.type==='MultiPolygon'){gtype='polygon';g.coordinates.forEach(poly=>feats.push({geom:poly,multi:true,props:pr}));}`,
`    else if(g.type==='MultiPolygon'){gtype='polygon';g.coordinates.forEach(poly=>feats.push({geom:poly,multi:true,props:{...pr}}));}`,
    "atributos independentes nas partes de um MultiPolygon GeoJSON"
  );

  out = replaceOnce(
    out,
`  if(document.getElementById('layout').style.display!=='none') buildLayout();
  if(moved) toast(\`CRS de trabalho: \${CRS_LABELS[S.workCRS]||S.workCRS} — \${moved} raster(s)/imagem reposicionados\`);`,
`  autoAreaSyncAll();
  if(document.getElementById('layout').style.display!=='none') buildLayout();
  if(moved) toast(\`CRS de trabalho: \${CRS_LABELS[S.workCRS]||S.workCRS} — \${moved} raster(s)/imagem reposicionados\`);`,
    "área atualizada após mudar o CRS do projeto"
  );

  out = replaceOnce(
    out,
`    if(isArea){ let A=0; rings.forEach((r,ri)=>{ const rp=r.map(pt=>reproj(L.crs,S.workCRS,pt[0],pt[1]));
      let a=0; for(let i=0,j=rp.length-1;i<rp.length;j=i++) a+=(rp[j][0]*rp[i][1]-rp[i][0]*rp[j][1]);
      A+=(ri===0?1:-1)*Math.abs(a/2); }); f.props[fname]=+A.toFixed(2); }`,
`    if(isArea){ const m=measureFeature(L,f);f.props[fname]=+(Number(m.area)||0).toFixed(2); }`,
    "botão AREA_M2 usa o mesmo motor geométrico"
  );

  return out;
}
