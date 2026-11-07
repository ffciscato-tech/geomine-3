/* ---------- Medição (no CRS de trabalho, m / m²) ---------- */
function measureRingSignedArea(ring){
  if(!Array.isArray(ring)||ring.length<3)return 0;
  const o=ring[0];let sum=0,correction=0;
  // Translating to a local origin prevents metre-sized UTM polygons from
  // losing centimetre-sized areas by cancellation of trillion-sized products.
  for(let i=1;i<ring.length-1;i++){
    const term=(ring[i][0]-o[0])*(ring[i+1][1]-o[1])-(ring[i+1][0]-o[0])*(ring[i][1]-o[1]),adjusted=term-correction,next=sum+adjusted;
    correction=(next-sum)-adjusted;sum=next;
  }
  return sum/2;
}
function measureRingInteriorPoint(ring){
  // A scan strictly between vertex Y levels cannot run along a boundary.
  // Midpoints of paired intersections lie inside even a concave ring; a
  // centroid or the first boundary vertex does not offer that guarantee.
  const levels=[...new Set(ring.map(p=>p[1]).filter(Number.isFinite))].sort((a,b)=>a-b);
  let gap=0,y=null;
  for(let i=1;i<levels.length;i++)if(levels[i]-levels[i-1]>gap){
    const mid=levels[i-1]+(levels[i]-levels[i-1])/2;
    if(mid>levels[i-1]&&mid<levels[i]){gap=levels[i]-levels[i-1];y=mid;}
  }
  if(y===null)return null;
  const xs=[];
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i];if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));
  }
  xs.sort((a,b)=>a-b);let width=0,point=null;
  for(let i=1;i<xs.length;i+=2)if(xs[i]-xs[i-1]>width){
    const x=xs[i-1]+(xs[i]-xs[i-1])/2;
    if(x>xs[i-1]&&x<xs[i]){width=xs[i]-xs[i-1];point=[x,y];}
  }
  return point;
}
function measurePointInRing(pt,ring){
  if(!pt)return false;
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    const dx=b[0]-a[0],dy=b[1]-a[1],px=pt[0]-a[0],py=pt[1]-a[1],eps=8*Number.EPSILON*Math.max(1,Math.abs(pt[0]),Math.abs(pt[1]),Math.abs(a[0]),Math.abs(a[1]),Math.abs(b[0]),Math.abs(b[1]));
    if(Math.abs(dx*py-dy*px)<=eps*(Math.abs(dx)+Math.abs(dy))&&pt[0]>=Math.min(a[0],b[0])-eps&&pt[0]<=Math.max(a[0],b[0])+eps&&pt[1]>=Math.min(a[1],b[1])-eps&&pt[1]<=Math.max(a[1],b[1])+eps)return false;
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
/* Índice de envelopes para os pontos interiores usados na classificação. */
function measureRingIndex(infos){
  const entries=infos.map(info=>{
    let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;
    for(const p of info.ring){xmin=Math.min(xmin,p[0]);ymin=Math.min(ymin,p[1]);xmax=Math.max(xmax,p[0]);ymax=Math.max(ymax,p[1]);}
    // Envelopes conservadores também preservam os testes sobre as bordas.
    const eps=8*Number.EPSILON*Math.max(1,Math.abs(xmin),Math.abs(ymin),Math.abs(xmax),Math.abs(ymax));
    return {info,xmin:xmin-eps,ymin:ymin-eps,xmax:xmax+eps,ymax:ymax+eps,cx:xmin/2+xmax/2,cy:ymin/2+ymax/2};
  });
  function build(items){
    const node={xmin:Infinity,ymin:Infinity,xmax:-Infinity,ymax:-Infinity,maxArea:0};
    let cxmin=Infinity,cymin=Infinity,cxmax=-Infinity,cymax=-Infinity;
    for(const e of items){
      node.xmin=Math.min(node.xmin,e.xmin);node.ymin=Math.min(node.ymin,e.ymin);
      node.xmax=Math.max(node.xmax,e.xmax);node.ymax=Math.max(node.ymax,e.ymax);node.maxArea=Math.max(node.maxArea,e.info.abs);
      cxmin=Math.min(cxmin,e.cx);cymin=Math.min(cymin,e.cy);cxmax=Math.max(cxmax,e.cx);cymax=Math.max(cymax,e.cy);
    }
    if(items.length<=8){node.items=items;return node;}
    const key=cxmax-cxmin>=cymax-cymin?'cx':'cy';items.sort((a,b)=>a[key]-b[key]);
    const mid=items.length>>1;node.left=build(items.slice(0,mid));node.right=build(items.slice(mid));return node;
  }
  return build(entries);
}
function measureRingDepth(node,p,area){
  if(node.maxArea<=area||p[0]<node.xmin||p[0]>node.xmax||p[1]<node.ymin||p[1]>node.ymax)return 0;
  if(!node.items)return measureRingDepth(node.left,p,area)+measureRingDepth(node.right,p,area);
  let depth=0;
  for(const e of node.items)if(e.info.abs>area&&p[0]>=e.xmin&&p[0]<=e.xmax&&p[1]>=e.ymin&&p[1]<=e.ymax&&measurePointInRing(p,e.info.ring))depth++;
  return depth;
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
      const abs=Math.abs(measureRingSignedArea(r));if(abs>1e-12)infos.push({ring:r,abs,depth:0});
      per+=len;
    }else comp+=len;
  });
  if(L.gtype!=='polygon')return {tipo:'linha',comp,nverts,partes:rings.length};
  /* A orientação do arquivo não é usada para decidir casca/furo. A
     profundidade de contenção trata igualmente anéis invertidos, furos,
     ilhas dentro de furos e partes desconectadas. */
  infos.sort((a,b)=>b.abs-a.abs);
  const index=infos.length>16?measureRingIndex(infos):null;
  infos.forEach((x,i)=>{
    const p=measureRingInteriorPoint(x.ring);let depth=0;
    if(!p)return;
    if(index)depth=measureRingDepth(index,p,x.abs);
    else for(let j=0;j<i;j++)if(infos[j].abs>x.abs&&measurePointInRing(p,infos[j].ring))depth++;
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
function autoAreaNormName(v){
  return String(v==null?'':v).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
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
/* O dock acompanha a seleção, inclusive quando há várias feições na mesma
   camada. Nunca usa a primeira feição como substituta de uma seleção vazia. */
function ppSelectedIndices(L){
  const items=S.msel&&S.msel.items||[];
  const selected=items.length?items:(S.selFeat?[S.selFeat]:[]);
  return [...new Set(selected.filter(s=>s.layerId===L.id&&Number.isInteger(s.idx)&&L.features[s.idx]).map(s=>s.idx))];
}
function ppSelectedFeature(L){
  const indices=ppSelectedIndices(L);
  return indices.length===1?{idx:indices[0],f:L.features[indices[0]]}:null;
}
function ppLayerGeomHTML(L){
  const indices=ppSelectedIndices(L),selected=new Set(indices),single=ppSelectedFeature(L);
  const note='<div class="hint" style="margin-top:5px">Medições no CRS do projeto: '+esc(String(S.workCRS))+'; furos são descontados e partes desconectadas são somadas.</div>';
  let h=single?featureDimensionsHTML(L,single.f):selectedDimensionsHTML(L);
  if(indices.length){
    h+='<div data-prop-selection="geometry">'+ppMetricBlock(L,indices.length===1?
      'Geometria da feição selecionada (#'+indices[0]+')':'Geometria da seleção ('+indices.length+' feições desta camada)',
      layerSummaryMetrics(L,(_f,i)=>selected.has(i)))+'</div>';
    // Com seleção, nenhum total da camada deve parecer a área clicada.
    return h+note;
  }
  const total=layerSummaryMetrics(L),q=L.attrFilter||{},filtrado=!!(q.enabled!==false&&q.field);
  let totals='';
  if(filtrado){
    const vis=layerSummaryMetrics(L,f=>attrFilterMatch(L,f));
    totals+=ppMetricBlock(L,'Geometria filtrada ('+vis.features+' de '+total.features+' feições)',vis);
  }
  totals+=ppMetricBlock(L,filtrado?'Geometria total da camada':'Geometria total da camada ('+total.features+' feições)',total);
  return h+totals+note;
}
function layerTotals(L){
  let area=0, comp=0;
  /* Blindagem do painel: o total é informativo, e uma única feição malformada
     não pode interromper o laço e deixar a ÁRVORE DE CAMADAS em branco — foi
     assim que as camadas já carregadas "sumiam" ao arrastar um shapefile com
     registro defeituoso. */
  L.features.forEach(f=>{ try{
    if(!attrFilterMatch(L,f))return;const m=measureFeature(L,f); area+=m.area||0; comp+=m.comp||0;
  }catch(e){ if(!L._avisoMedida){ L._avisoMedida=1; console.warn('medida ignorada em',L.name,e); } } });
  return {area, comp};
}
function fmtArea(a){ return a>=10000 ? `${(a/10000).toLocaleString('pt-BR',{maximumFractionDigits:2})} ha` : `${a.toLocaleString('pt-BR',{maximumFractionDigits:1})} m²`; }
function fmtLen(v){ return v>=1000 ? `${(v/1000).toLocaleString('pt-BR',{maximumFractionDigits:2})} km` : `${v.toLocaleString('pt-BR',{maximumFractionDigits:1})} m`; }

/* ===========================================================================
   RÉGUA — distância no mapa
   2D: comprimento planimétrico no CRS de trabalho (métrico, sem deformação
       de escala do Web Mercator — por isso reprojeta antes de medir).
   3D: comprimento DRAPEADO sobre a superfície. Cada segmento é densificado no
       passo da célula do MDS e o Z é amostrado por bilinear na grade NATIVA;
       o comprimento inclinado é Σ√(Δh² + Δz²).
   =========================================================================== */
S.meas={buf:[], grid:null, gridId:null, lidar:null, lidarId:null, mode:'lines', lineRefs:[], lineResult:null};

function measMode(){
  const e=document.getElementById('mbMeasureMode');
  return e?e.value:(S.meas.mode||'lines');
}
function measInstrucao(){
  return measMode()==='lines'
    ?'Marque o primeiro e o segundo ponto sobre os traços.\nPode usar a mesma linha ou linhas diferentes.'
    :'Clique em pontos soltos — o ponto cai onde você tocar.\nCom um MDT escolhido: 3D, Δz e inclinação.\nDuplo clique encerra · Esc limpa.';
}

function refreshMeasPanel(){
  const sel=document.getElementById('mbRaster'); if(!sel) return;
  const cur=sel.value, mm=document.getElementById('mbMeasureMode');
  const lidar=(S.layers||[]).filter(L=>L&&L.gtype==='point'&&(L.features||[]).some(f=>{
    const z=Array.isArray(f.zg)?f.zg[0]:f.zg;
    return isFinite(z)||isFinite(v3AtributoZ(f));
  }));
  sel.innerHTML='<option value="">— sem MDT/LiDAR (usa Z do vetor) —</option>'+
    S.rasters.map(r=>`<option value="R:${r.id}">MDT · ${esc(r.name)}</option>`).join('')+
    lidar.map(L=>`<option value="L:${L.id}">LiDAR · ${esc(L.name)}</option>`).join('');
  /* `cur` vazio é "ainda não escolhido", não uma escolha: como a opção
     "— nenhuma —" também vale '', a régua ficava presa em 2D mesmo com MDT
     carregado e a medição saía sem cota. Só um valor NÃO vazio é preservado. */
  if(cur && [...sel.options].some(o=>o.value===cur)) sel.value=cur;
  else {
    /* Assume um MDT (o visível tem preferência); a escolha segue trocável. */
    const rv=(S.rasters||[]).find(r=>r.visible!==false&&r.d&&r.d.z)||
             (S.rasters||[]).find(r=>r.d&&r.d.z);
    if(rv) sel.value='R:'+rv.id;
    else if(lidar.length) sel.value='L:'+lidar[0].id;
  }
  {
    const cx=document.getElementById('mbSnapBox');
    if(cx) cx.style.display=(mm&&mm.value==='points')?'flex':'none';
  }
  /* Em projeto somente LiDAR não há traço sobre o qual clicar. A régua abre
     diretamente em pontos, mantendo a medição disponível sem MDT. */
  if(mm&&!(S.layers||[]).some(L=>L.visible!==false&&L.gtype==='line')&&mm.value==='lines'){
    mm.value='points'; S.meas.mode='points';
  }
}
function measRaster(){
  const sel=document.getElementById('mbRaster');
  const id=sel&&String(sel.value).startsWith('R:')?String(sel.value).slice(2):'';
  return (S.rasters||[]).find(r=>String(r.id)===id)||null;
}
function measLidar(){
  const sel=document.getElementById('mbRaster');
  const id=sel&&String(sel.value).startsWith('L:')?String(sel.value).slice(2):'';
  return (S.layers||[]).find(L=>String(L.id)===id&&L.gtype==='point')||null;
}
/* Índice leve de vizinhança para usar a nuvem como fonte de cota. A régua
   procura o ponto LiDAR mais próximo, sem transformar a nuvem em MDT. */
function measIndiceLidar(L){
  if(S.meas.lidar&&S.meas.lidarId===L.id&&S.meas.lidar.nf===(L.features||[]).length)return S.meas.lidar;
  const pts=[];let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  (L.features||[]).forEach(f=>{
    const p=f&&f.geom&&f.geom[0], z=Array.isArray(f&&f.zg)?f.zg[0]:(f&&f.zg);
    const zz=isFinite(z)?+z:v3AtributoZ(f);
    if(!p||!isFinite(p[0])||!isFinite(p[1])||!isFinite(zz))return;
    const q=reproj(L.crs,S.workCRS,+p[0],+p[1]); if(!isFinite(q[0])||!isFinite(q[1]))return;
    pts.push([q[0],q[1],zz]);x0=Math.min(x0,q[0]);x1=Math.max(x1,q[0]);y0=Math.min(y0,q[1]);y1=Math.max(y1,q[1]);
  });
  const passo=Math.max(.15,Math.min(8,Math.sqrt(Math.max(.01,(x1-x0)*(y1-y0))/Math.max(1,pts.length))*2));
  const cel=new Map(),key=(c,r)=>c+','+r;
  pts.forEach(p=>{const c=Math.floor((p[0]-x0)/passo),r=Math.floor((p[1]-y0)/passo),k=key(c,r);if(!cel.has(k))cel.set(k,[]);cel.get(k).push(p);});
  const out={pts,cel,x0,y0,passo,key,nf:(L.features||[]).length};S.meas.lidar=out;S.meas.lidarId=L.id;return out;
}
function measZLidar(L,x,y){
  const I=measIndiceLidar(L);if(!I.pts.length)return NaN;
  const c=Math.floor((x-I.x0)/I.passo),r=Math.floor((y-I.y0)/I.passo);let best=null,d2=Infinity;
  for(let dr=-3;dr<=3;dr++)for(let dc=-3;dc<=3;dc++)(I.cel.get(I.key(c+dc,r+dr))||[]).forEach(p=>{const d=(p[0]-x)**2+(p[1]-y)**2;if(d<d2){d2=d;best=p;}});
  return best?best[2]:NaN;
}
function measSegLidar(L,a,b){
  const dh=Math.hypot(b[0]-a[0],b[1]-a[1]),za=measZLidar(L,a[0],a[1]),zb=measZLidar(L,b[0],b[1]);
  return {dh,za,zb,L3:isFinite(za)&&isFinite(zb)?Math.hypot(dh,zb-za):dh};
}
function clearMeas(){
  window.GeoMineRuler?.clear();
  S.meas.buf=[]; S.meas.grid=null; S.meas.gridId=null; S.meas.lidar=null; S.meas.lidarId=null; S.meas.lineRefs=[]; S.meas.lineResult=null;
  if(S.measLayer) S.measLayer.clearLayers();
  const o=document.getElementById('mbOut');
  if(o) o.textContent=measInstrucao();
  const m=document.getElementById('mbMode'); if(m) m.textContent='2D';
}
function fechaMeas(){
  /* Esc chama apenas clearMeas() e conserva a Régua armada. O X encerra a
     sessão inteira, retira o painel e devolve o mapa ao modo Seleção. */
  clearMeas();
  const box=document.getElementById('measBox');if(box)box.classList.remove('on');
  if(S.tool==='measure'){
    try{setTool('select');}catch(e){S.tool='select';}
  }else{
    const b=document.querySelector('.mtool[data-tool="measure"]');
    if(b)b.classList.remove('on');
  }
  toast('Régua fechada');
}
function redrawMeas(){
  if(!S.measLayer) return;
  S.measLayer.clearLayers();
  const B=S.meas.buf;
  (S.meas.lineRefs||[]).filter((ref,i,a)=>a.findIndex(q=>q.L===ref.L&&q.idx===ref.idx)===i).forEach((ref,i)=>{
    let lls; try{ lls=featToLatLngs(ref.L,ref.f); }catch(e){ return; }
    const aneis=(Array.isArray(lls[0]&&lls[0][0]))?lls:[lls];
    aneis.forEach(r=>L2.polyline(r,{color:i?'#bd67ff':'#17b7ff',weight:6,opacity:.72,
      pane:'alagis_regua',interactive:false}).addTo(S.measLayer));
  });
  if(B.length>=2){
    L2.polyline(B,{color:'#1a1206',weight:6,opacity:.45,pane:'alagis_regua',
      interactive:false}).addTo(S.measLayer);          // halo, desenhado ANTES
    L2.polyline(B,{color:'#f5a524',weight:3,opacity:1,pane:'alagis_regua',
      interactive:false}).addTo(S.measLayer);
  }
  B.forEach((p,i)=>L2.circleMarker(p,{radius:4,color:'#fff',weight:1.5,
    pane:'alagis_regua', interactive:false,
    fillColor:i===0?'#37c0aa':'#f5a524',fillOpacity:1}).addTo(S.measLayer));
}

function measHitZ(hit){
  return GeoMineRuler.hitZ(hit);
}
function measDistAoLongo(A,B){
  if(!A||!B||A.L!==B.L||A.f!==B.f||A.ringIndex!==B.ringIndex)return NaN;
  const f=A.f,L=A.L,rings=(f.multi&&Array.isArray(f.geom[0]&&f.geom[0][0]))?f.geom:[f.geom];
  const ring=rings[A.ringIndex||0];if(!ring||ring.length<2)return NaN;
  const p=ring.map(q=>{const w=toWGS(L.crs,q[0],q[1]);return fromWGS(S.workCRS,w[0],w[1]);});
  const cum=[0];for(let i=1;i<p.length;i++)cum[i]=cum[i-1]+Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);
  const pos=R=>{const i=Math.max(0,Math.min(p.length-2,R.segIndex||0));
    return cum[i]+(isFinite(R.t)?R.t:0)*Math.hypot(p[i+1][0]-p[i][0],p[i+1][1]-p[i][1]);};
  return Math.abs(pos(B)-pos(A));
}
function measLineClick(latlng){
  if((S.meas.lineRefs||[]).length>=2) clearMeas();
  const hit=feicaoMaisProximaPx(latlng,S.touch?Math.round(SNAP_PX*1.7):Math.max(18,SNAP_PX),true);
  if(!hit||!hit.L){ toast('Aponte a mira sobre uma linha'); return; }
  const ref={L:hit.L,f:hit.f,idx:hit.idx,latlng:hit.latlng,z:measHitZ(hit),
    ringIndex:hit.ringIndex,segIndex:hit.segIndex,t:hit.t};
  S.meas.lineRefs.push(ref);S.meas.buf.push([hit.latlng.lat,hit.latlng.lng]);
  if(S.meas.lineRefs.length===1){
    redrawMeas(); const o=document.getElementById('mbOut');
    if(o)o.textContent='Ponto 1: '+hit.L.name+' · feição '+(hit.idx+1)+
      (isFinite(ref.z)?' · Z '+ref.z.toFixed(2)+' m':' · sem Z na linha')+'\nAgora marque o ponto 2.';
    toast('Ponto 1 marcado · escolha o ponto 2'); return;
  }
  S.meas.lineResult={pointMeasure:true};
  redrawMeas(); updateMeas();
}
/* comprimento drapeado de um segmento (CRS de trabalho), amostrando a grade */
function drapeSeg(g, a, b){
  const dh=Math.hypot(b[0]-a[0], b[1]-a[1]);
  if(dh<=0) return {L3:0, dh:0, za:NaN, zb:NaN, zmin:NaN, zmax:NaN, semZ:true};
  const passo=Math.max(g.cs*0.5, dh/4000);            // teto de 4000 amostras/segmento
  const n=Math.max(1, Math.ceil(dh/passo));
  let L3=0, zprev=NaN, z0=NaN, z1=NaN, zmin=Infinity, zmax=-Infinity, vazio=0;
  for(let i=0;i<=n;i++){
    const t=i/n;
    const x=a[0]+t*(b[0]-a[0]), y=a[1]+t*(b[1]-a[1]);
    const z=sampleZbil(g,x,y);
    if(i===0) z0=z; if(i===n) z1=z;
    if(!isNaN(z)){ if(z<zmin)zmin=z; if(z>zmax)zmax=z; } else vazio++;
    if(i>0){
      const dl=dh/n;
      const dz=(!isNaN(z)&&!isNaN(zprev))? (z-zprev) : 0;   // trecho sem MDS entra como plano
      L3+=Math.hypot(dl,dz);
    }
    zprev=z;
  }
  return {L3, dh, za:z0, zb:z1, zmin:isFinite(zmin)?zmin:NaN, zmax:isFinite(zmax)?zmax:NaN,
          semZ:vazio>n*0.5};
}
async function updateMeas(){
  if(measMode()==='points')return GeoMineRuler.update();
  const out=document.getElementById('mbOut'); if(!out) return;
  const B=S.meas.buf;
  if(B.length<2){ out.textContent='1 ponto marcado. Clique no próximo.'; return; }
  // reprojeta para o CRS de trabalho (métrico)
  const P=B.map(([lat,lng])=>{ const c=fromWGS(S.workCRS,lng,lat); return [c[0],c[1]]; });

  const refs=S.meas.lineRefs||[];
  const lineZReady=!!(S.meas.lineResult&&refs.length===2&&isFinite(refs[0].z)&&isFinite(refs[1].z));
  const r=lineZReady?null:measRaster();
  const lidar=lineZReady?null:measLidar();
  let g=null;
  if(r){
    // grade de trecho (MDT grande) só cobre a linha anterior: relê a cada atualização
    if(S.meas.gridId===r.id && S.meas.grid && !S.meas.grid._trecho) g=S.meas.grid;
    else { g=await gridProd(r,'medir sobre a superfície',[P]); S.meas.grid=g; S.meas.gridId=r.id; }
  }
  if(lidar)measIndiceLidar(lidar);
  document.getElementById('mbMode').textContent = lineZReady?'Linha 3D':(g?'3D MDT':(lidar?'3D LiDAR':'2D'));

  let tot2=0, tot3=0, linhas='';
  const zs=[], segs=[];
  for(let i=1;i<P.length;i++){
    const a=P[i-1], b=P[i];
    const d2=Math.hypot(b[0]-a[0], b[1]-a[1]);
    tot2+=d2;
    if(g){
      const sg=drapeSeg(g,a,b);
      tot3+=sg.L3;
      if(!isNaN(sg.za)) zs.push(sg.za);
      if(!isNaN(sg.zb)) zs.push(sg.zb);
      const dz=(!isNaN(sg.za)&&!isNaN(sg.zb))? (sg.zb-sg.za) : NaN;
      const decl=(!isNaN(dz)&&d2>0)? (100*dz/d2) : NaN;
      // a mesma inclinação em grau: ângulo com a horizontal, arctan(dz/dh)
      const graus=(!isNaN(dz)&&d2>0)? (Math.atan2(dz,d2)*180/Math.PI) : NaN;
      linhas+=`${i}: ${fmtLen(d2)} · 3D ${fmtLen(sg.L3)}`+
              (isNaN(dz)?' · sem MDS'
                        :` · Δz ${dz>=0?'+':''}${dz.toFixed(1)} m · ${decl.toFixed(1)}% · ${graus>=0?'+':''}${graus.toFixed(1)}°`)+'\n';
      segs.push({i:i,d2:d2,d3:sg.L3,dz:dz,decl:decl,graus:graus});
    } else if(lidar) {
      const sg=measSegLidar(lidar,a,b), dz=(isFinite(sg.za)&&isFinite(sg.zb))?sg.zb-sg.za:NaN;
      tot3+=sg.L3;
      if(isFinite(sg.za))zs.push(sg.za);if(isFinite(sg.zb))zs.push(sg.zb);
      const decl=isFinite(dz)&&d2>0?100*dz/d2:NaN,graus=isFinite(dz)&&d2>0?Math.atan2(dz,d2)*180/Math.PI:NaN;
      linhas+=`${i}: ${fmtLen(d2)} · 3D ${fmtLen(sg.L3)}`+
        (isFinite(dz)?` · Δz ${dz>=0?'+':''}${dz.toFixed(1)} m · ${decl.toFixed(1)}% · ${graus>=0?'+':''}${graus.toFixed(1)}°`:' · sem ponto LiDAR próximo')+'\n';
      segs.push({i:i,d2:d2,d3:sg.L3,dz:dz,decl:decl,graus:graus});
    } else {
      linhas+=`${i}: ${fmtLen(d2)}\n`;
      segs.push({i:i,d2:d2,d3:NaN,dz:NaN,decl:NaN,graus:NaN});
    }
  }
  const az=(()=>{ const a=P[0], b=P[P.length-1];
    let t=Math.atan2(b[0]-a[0], b[1]-a[1])*180/Math.PI; if(t<0)t+=360; return t; })();

  if(S.meas.lineResult&&refs.length===2){
    let z1=Number(refs[0].z),z2=Number(refs[1].z),fonteZ='geometria 3D das linhas';
    if(g){
      let nMdt=0;
      if(!isFinite(z1)){z1=sampleZbil(g,P[0][0],P[0][1]);if(isFinite(z1))nMdt++;}
      if(!isFinite(z2)){z2=sampleZbil(g,P[1][0],P[1][1]);if(isFinite(z2))nMdt++;}
      fonteZ=nMdt===2?'MDT selecionado':(nMdt===1?'geometria 3D e MDT selecionado':'geometria 3D das linhas');
    }
    const aoLongo=measDistAoLongo(refs[0],refs[1]);
    const mesmaLinha=isFinite(aoLongo),baseH=(mesmaLinha&&aoLongo>0)?aoLongo:tot2;
    const temZ=isFinite(z1)&&isFinite(z2),dz=temZ?z2-z1:NaN;
    const d3=temZ?Math.hypot(baseH,dz):NaN;
    const decl=(temZ&&baseH>0)?100*dz/baseH:NaN;
    const ang=(temZ&&baseH>0)?Math.atan2(dz,baseH)*180/Math.PI:NaN;
    const hv=(temZ&&Math.abs(dz)>1e-9)?baseH/Math.abs(dz):NaN;
    const c1=refs[0].L.name+' · feição '+(refs[0].idx+1),c2=refs[1].L.name+' · feição '+(refs[1].idx+1);
    const sinal=v=>v>=0?'+':'',linha=(rot,val)=>`<span>${rot}</span><b>${val}</b>`;
    let linhasHtml=linha('Distância horizontal',fmtLen(tot2));
    if(mesmaLinha)linhasHtml+=linha('Distância pelo traço',fmtLen(aoLongo));
    if(temZ){
      linhasHtml+=linha('Cota P1',`${z1.toFixed(2)} m`)+
        linha('Cota P2',`${z2.toFixed(2)} m`)+
        linha('Desnível P1 → P2',`${sinal(dz)}${dz.toFixed(2)} m`)+
        linha(`Distância 3D${mesmaLinha?' pelo traço':''}`,fmtLen(d3))+
        /* Unidades separadas: porcentagem e graus não ficam mais fundidos
           na mesma frase. É a mesma declividade longitudinal, expressa nos
           dois formatos usados em projeto de mina. */
        linha('Declividade longitudinal',`${sinal(decl)}${decl.toFixed(2)} %`)+
        linha('Declividade em graus',`${sinal(ang)}${ang.toFixed(2)}°`)+
        (isFinite(hv)?linha('Relação H:V',`${hv.toFixed(2)}H : 1V`):'');
    }
    linhasHtml+=linha('Azimute P1 → P2',`${az.toFixed(1)}°`);
    out.innerHTML=`<div class="meas-title">MEDIÇÃO ENTRE DUAS LINHAS</div>`+
      `<div class="meas-points"><b>P1</b> · ${esc(c1)}<br><b>P2</b> · ${esc(c2)}</div>`+
      `<div class="meas-grid">${linhasHtml}</div>`+
      `<div class="meas-note">${temZ?`Cotas obtidas da ${esc(fonteZ)}.`:
        'Cotas indisponíveis: use linhas com Z ou selecione um MDT.'}</div>`;
    const last=B[B.length-1],rotulo=temZ?`${Math.abs(decl).toFixed(1)}% · ${Math.abs(ang).toFixed(1)}°`:fmtLen(tot2);
    L2.marker(last,{interactive:false,icon:L2.divIcon({className:'',html:`<div class="meas-lbl">${rotulo}</div>`,iconAnchor:[-8,8]}),
      pane:'alagis_regua'}).addTo(S.measLayer);
    return;
  }

  /* Modo "Distância por pontos" passa a usar o MESMO desenho do relatório
     entre duas linhas: título, resumo dos pontos, grade de rótulo/valor e
     nota de procedência da cota. Antes saía como bloco de texto corrido e a
     leitura dependia de contar linhas. */
  const sinal=v=>(v>=0?'+':'');
  const linhaG=(rot,val)=>'<span>'+rot+'</span><b>'+val+'</b>';
  const tem3D=!!(g||lidar);
  const acr=(tem3D&&tot2>0)?100*(tot3-tot2)/tot2:NaN;
  const dzt=zs.length?zs[zs.length-1]-zs[0]:NaN;
  const declT=(isFinite(dzt)&&tot2>0)?100*dzt/tot2:NaN;
  const angT=(isFinite(dzt)&&tot2>0)?Math.atan2(dzt,tot2)*180/Math.PI:NaN;

  let gradeHtml=linhaG('Distância horizontal',esc(fmtLen(tot2)));
  if(tem3D){
    gradeHtml+=linhaG('Distância 3D',esc(fmtLen(tot3)));
    if(isFinite(acr)) gradeHtml+=linhaG('Acréscimo do relevo',sinal(acr)+acr.toFixed(2)+' %');
  }
  if(zs.length){
    gradeHtml+=linhaG('Cota mínima',Math.min.apply(null,zs).toFixed(2)+' m')+
      linhaG('Cota máxima',Math.max.apply(null,zs).toFixed(2)+' m')+
      linhaG('Desnível início → fim',sinal(dzt)+dzt.toFixed(2)+' m')+
      linhaG('Declividade média',sinal(declT)+declT.toFixed(2)+' %')+
      linhaG('Declividade em graus',sinal(angT)+angT.toFixed(2)+'°');
  }
  gradeHtml+=linhaG('Azimute início → fim',az.toFixed(1)+'°');

  /* A tabela de trechos só aparece com mais de um: num trecho único ela
     repetiria, linha a linha, o total logo acima. */
  let trechosHtml='';
  if(segs.length>1){
    trechosHtml='<div class="meas-seg"><table><thead><tr><th>Trecho</th><th>2D</th>'+
      (tem3D?'<th>3D</th><th>Δz</th><th>%</th>':'')+'</tr></thead><tbody>'+
      segs.map(function(sg){
        return '<tr><td>'+sg.i+'</td><td>'+esc(fmtLen(sg.d2))+'</td>'+
          (tem3D?('<td>'+(isFinite(sg.d3)?esc(fmtLen(sg.d3)):'—')+'</td>'+
                  '<td>'+(isFinite(sg.dz)?sinal(sg.dz)+sg.dz.toFixed(1)+' m':'—')+'</td>'+
                  '<td>'+(isFinite(sg.decl)?sinal(sg.decl)+sg.decl.toFixed(1):'—')+'</td>'):'')+'</tr>';
      }).join('')+'</tbody></table></div>';
  }
  const nota = g ? ('Cotas do MDT '+esc(r?r.name:'')+' · grade '+g.nc+'×'+g.nr+' · célula '+g.cs.toFixed(2)+' m')
             : lidar ? ('Cotas do ponto LiDAR mais próximo · '+esc(lidar.name))
             : 'Sem superfície selecionada — a medição é apenas horizontal. Escolha um MDT acima para obter 3D, desnível e declividade.';
  out.innerHTML='<div class="meas-title">DISTÂNCIA POR PONTOS</div>'+
    '<div class="meas-points"><b>'+P.length+'</b> ponto(s) marcado(s) · <b>'+(P.length-1)+'</b> trecho(s)</div>'+
    '<div class="meas-grid">'+gradeHtml+'</div>'+
    trechosHtml+
    '<div class="meas-note">'+nota+'</div>';

  // rótulo do total no último ponto
  const last=B[B.length-1];
  L2.marker(last,{interactive:false, icon:L2.divIcon({className:'', html:
    `<div class="meas-lbl">${fmtLen((g||lidar)?tot3:tot2)}${(g||lidar)?' (3D)':''}</div>`,
    iconAnchor:[-8,8]}), pane:'alagis_regua', interactive:false}).addTo(S.measLayer);
}

// Dimensions belong to the current geometry, never to stale creation attributes.
function featureShapeDimensions(L,f){
 if(L?.gtype!=='polygon'||!f?.geom||/4326|longlat/i.test(S.workCRS))return null;
 let rings;try{rings=measureProjectedRings(L,f);}catch(_){return null;}
 if(rings.length!==1)return null;
 const circle=geomCirculo(rings);
 if(circle)return {shape:'Círculo',radius:circle.R,diameter:2*circle.R};
 let r=rings[0].slice();
 if(r.length>1&&Math.hypot(r[0][0]-r.at(-1)[0],r[0][1]-r.at(-1)[1])<1e-7)r.pop();
 if(r.length!==4)return null;
 const edges=r.map((p,i)=>{const q=r[(i+1)%4];return [q[0]-p[0],q[1]-p[1]];}),lens=edges.map(p=>Math.hypot(...p));
 if(lens.some(x=>x<1e-7))return null;
 for(let i=0;i<4;i++){const a=edges[i],b=edges[(i+1)%4];if(Math.abs(a[0]*b[0]+a[1]*b[1])>1e-5*lens[i]*lens[(i+1)%4])return null;}
 const close=(a,b)=>Math.abs(a-b)<=Math.max(1e-6,1e-5*Math.max(a,b));
 if(!close(lens[0],lens[2])||!close(lens[1],lens[3]))return null;
 const width=Math.min(...lens),length=Math.max(...lens);
 return close(width,length)?{shape:'Quadrado',side:(width+length)/2}:{shape:'Retângulo',width,length};
}
function featureDimensionsHTML(L,f){
 const d=featureShapeDimensions(L,f);if(!d)return '';
 const rows=[['Forma',d.shape]];
 for(const [key,label] of [['width','Largura'],['length','Comprimento'],['side','Lado'],['radius','Raio'],['diameter','Diâmetro']])
  if(d[key]!=null)rows.push([label,d[key].toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:3})+' m']);
 return '<div class="shape-dimensions" style="margin:8px 0;padding:8px;border:1px solid var(--line);border-radius:6px"><b>Dimensões da figura</b>'+rows.map(([k,v])=>'<div style="display:flex;justify-content:space-between;gap:12px"><span>'+k+'</span><b>'+v+'</b></div>').join('')+'</div>';
}
function selectedDimensionsHTML(L){
 const sel=S.selFeat,selected=sel&&(sel.layer===L||sel.layerId===L.id);
 const f=selected?L.features[sel.idx]:L.features.length===1?L.features[0]:null;
 return f?featureDimensionsHTML(L,f):'';
}
function featureContinueTarget(L,f){
  if(!L||!['line','polygon'].includes(L.gtype)||(S.msel?.items||[]).length>1)return null;
  f=f||ppSelectedFeature(L)?.f;
  if(!f||!L.features.includes(f)||!Array.isArray(f.geom))return null;
  const parts=Array.isArray(f.geom[0]?.[0])?f.geom:[f.geom];
  return parts.length===1&&parts[0].length>=(L.gtype==='polygon'?3:2)?{L,f}:null;
}
function featureContinueHTML(L,f){
  const target=featureContinueTarget(L,f);if(!target)return '';
  const disabled=L.locked||(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false));
  return '<div data-feature-continue-box style="display:grid;grid-template-columns:'+(L.gtype==='line'?'minmax(0,1fr) 82px':'minmax(0,1fr)')+';gap:6px;margin:10px 0">'+
    '<button type="button" class="tbtn" data-feature-continue '+(disabled?'disabled title="Camada bloqueada para edição"':'')+' style="justify-content:center;min-width:0;font-size:12px">Continuar desenhando</button>'+
    (L.gtype==='line'?'<select data-continue-endpoint aria-label="Extremidade da linha" '+(disabled?'disabled':'')+' style="min-width:0;font-size:12px"><option value="end">Fim</option><option value="start">Início</option></select>':'')+'</div>';
}
function bindFeatureContinue(host,L,f){
  const button=host?.querySelector('[data-feature-continue]'),target=featureContinueTarget(L,f);
  if(!button||!target)return;
  button.onclick=()=>{
    closeFeatMenu();
    const endpoint=host.querySelector('[data-continue-endpoint]')?.value||'end';
    if(continuarDesenho({...target,endpoint}))host.closest('#lpModal')?.classList.remove('on');
  };
}
function showProps(){
  const box=document.getElementById('propBox'), body=document.getElementById('propBody');
  if(!S.selFeat){ box.style.display='none'; return; }
  const {layer:L,idx}=S.selFeat; const f=L.features[idx];
  if(!f){ box.style.display='none'; return; }
  const m=measureFeature(L,f);
  let html='<div class="geo">';
  html+=`<b>${esc(L.name)}</b> · feição #${idx} (${m.tipo})<br>`;
  if(m.tipo==='polígono'){ html+=`Área: <b>${fmtArea(m.area)}</b> (${m.area.toLocaleString('pt-BR',{maximumFractionDigits:1})} m²)<br>Perímetro: <b>${fmtLen(m.per)}</b><br>`;
    const R=typeof geomValor==='function'?geomValor(L,f,'$RAIO'):null;   // só quando a geometria é um círculo
    if(R!=null) html+=`Raio: <b>${fmtLen(R)}</b> · Diâmetro: <b>${fmtLen(2*R)}</b><br>`; }
  else if(m.tipo==='linha'){ html+=`Comprimento: <b>${fmtLen(m.comp)}</b><br>`; }
  else { html+=`E: <b>${m.E.toFixed(2)}</b> · N: <b>${m.N.toFixed(2)}</b><br>`; }
  html+=`Vértices: ${m.nverts} · CRS de medida: ${S.workCRS}</div>`;
  L.fields.forEach(fl=>{ const v=f.props[fl.name]; if(v!=null&&v!=='')
    html+=`<span class="pk">${esc(fl.name)}:</span> <span class="pv">${esc(v)}</span><br>`; });
  html+=featureDimensionsHTML(L,f)+featureContinueHTML(L,f);
  html+=window.GeoMineGeology?.boreholeProperties?.layerActionsHTML(L)||'';
  body.innerHTML=html; box.style.display='block';
  bindFeatureContinue(body,L,f);
  window.GeoMineGeology?.boreholeProperties?.bindLayerActions(body,L);
  window.GeoMineGeology?.boreholeProperties?.syncDockActions();
  if(window.matchMedia('(max-width:720px)').matches) document.getElementById('right').classList.add('open');
}
function showFeatureProperties(){
  showProps();
  // An explicit request reveals the dock; ordinary selection keeps the
  // user's open/collapsed state and never opens a floating window.
  if(document.body.classList.contains('prop-dock-collapsed'))document.getElementById('propDockToggle')?.click();
  if(typeof propRefresh==='function')propRefresh();
}

/* ---------- Propriedades da camada (modal, duplo-clique) ---------- */
/* Comprimento dos traços na PLOTAGEM. Além da calibragem pela espessura,
   entra o adensamento escolhido no layout: dividir o padrão por dens faz o
   mesmo desenho repetir mais vezes no mesmo comprimento — é o que se quer
   quando o tracejado sai "esticado" numa prancha em escala pequena. */
/* Escada do passo da grade e da barra de escala: 50 em 50 m até 250 m e, daí
   para cima, 250 em 250 m. O campo aceita digitação livre e encaixa no degrau
   mais próximo. */
const BAR_PASSOS=(()=>{ const a=[];
  for(let v=50;v<=250;v+=50)a.push(v);
  for(let v=500;v<=100000;v+=250)a.push(v);
  return a; })();
function barPassoEncaixa(v){
  const n=+v; if(!isFinite(n)||n<=0) return null;
  return BAR_PASSOS.reduce((a,b)=>Math.abs(b-n)<Math.abs(a-n)?b:a);
}
function barPassoAtual(){
  const ck=document.getElementById('loBarAuto');
  if(!ck || ck.checked) return null;
  return barPassoEncaixa((document.getElementById('loBarPasso')||{}).value);
}
/* Degraus do cursor de escala cartográfica. O campo digitável não é limitado
   a estes valores: aceita exatamente a escala informada pelo usuário. */
function escalaPassoPara(v){
  const n=+v||0;
  if(n>500000) return 5000;
  if(n>25000) return 500;
  if(n>500) return 250;
  return 50;
}
const ESCALA_PASSOS=(()=>{
  const a=[];
  for(let v=100;v<=500;v+=50)a.push(v);
  for(let v=750;v<=25000;v+=250)a.push(v);
  for(let v=25500;v<=500000;v+=500)a.push(v);
  for(let v=505000;v<=10000000;v+=5000)a.push(v);
  return a;
})();
function escalaDegrau(v){
  const n=+v; if(!isFinite(n)||n<=0) return 5000;
  return ESCALA_PASSOS.reduce((a,b)=>Math.abs(b-n)<Math.abs(a-n)?b:a);
}
/* Espaçamentos cartográficos válidos para a grade. Mantém apenas números
   inteiros e evita resultados de cálculo como 1.157 m ou 1.150 m. */
const GRADE_PASSOS=(()=>{
  const a=[];
  const mant=[1,1.25,1.5,2,2.5,5,7.5];
  for(let pot=10;pot<=1000000;pot*=10){
    mant.forEach(m=>{const v=m*pot;if(Number.isInteger(v)&&v<=1000000)a.push(v);});
  }
  return [...new Set(a)].sort((x,y)=>x-y);
})();
function gradeDegrau(v,paraCima=false){
  const n=+v;if(!isFinite(n)||n<=0)return 0;
  if(paraCima)return GRADE_PASSOS.find(x=>x>=n)||GRADE_PASSOS[GRADE_PASSOS.length-1];
  return GRADE_PASSOS.reduce((a,b)=>Math.abs(b-n)<Math.abs(a-n)?b:a);
}
(function ligaControlesLayout(){
  const liga=()=>{
    const r=document.getElementById('loDash');
    if(r && !r._botoes){
      r._botoes=1;
      const aplica=v=>{
        const k=Math.max(.3,Math.min(4,+v||1));
        r.value=k;
        const t=document.getElementById('loDashv');
        if(t) t.textContent=k.toFixed(2).replace(/0$/,'').replace('.',',')+'×';
        r.dispatchEvent(new Event('input',{bubbles:true}));
        r.dispatchEvent(new Event('change',{bubbles:true}));
        try{ if(typeof layoutSeVisivel==='function') layoutSeVisivel(); }catch(e){}
        toast('Tracejado '+k.toFixed(2).replace('.',',')+'×');
      };
      /* Neste aplicativo o valor é DENSIDADE: maior = mais denso. */
      const bA=document.getElementById('btnDashAdensa'),
            bF=document.getElementById('btnDashAfasta'),
            bR=document.getElementById('btnDashReset');
      if(bA)bA.onclick=()=>aplica((+r.value||1)*1.25);
      if(bF)bF.onclick=()=>aplica((+r.value||1)/1.25);
      if(bR)bR.onclick=()=>aplica(1);
    }
    const inp=document.getElementById('loBarPasso'), ck=document.getElementById('loBarAuto');
    if(inp && ck && !inp._lig){
      inp._lig=1;
      const aplica=(v,auto)=>{
        if(auto!=null) ck.checked=!!auto;
        if(v!=null){ const q=barPassoEncaixa(v); if(q!=null) inp.value=q; }
        inp.disabled=ck.checked;
        try{ if(typeof layoutSeVisivel==='function') layoutSeVisivel(); }catch(e){}
      };
      const anda=d=>{
        const atual=barPassoEncaixa(inp.value)??100;
        let i=BAR_PASSOS.indexOf(atual);
        i=Math.max(0,Math.min(BAR_PASSOS.length-1,i+d));
        aplica(BAR_PASSOS[i],false);
        toast('Barra de escala: passo de '+BAR_PASSOS[i].toLocaleString('pt-BR')+' m');
      };
      inp.addEventListener('change',()=>aplica(inp.value,false));
      ck.addEventListener('change',()=>aplica(null,ck.checked));
      const bm=document.getElementById('btnBarMenos'), bp=document.getElementById('btnBarMais');
      if(bm)bm.onclick=()=>anda(-1);
      if(bp)bp.onclick=()=>anda(+1);
      inp.disabled=ck.checked;
    }
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',liga);else liga();
})();
function dashDensidade(){
  const e=document.getElementById('loDash');
  const v=e? parseFloat(e.value) : 1;
  return Math.max(0.3, Math.min(4, isFinite(v)? v : 1));
}
function dashEspacamento(){
  const e=document.getElementById('loDashGap');
  const v=e?parseFloat(e.value):1;
  return Math.max(0.25,Math.min(4,isFinite(v)?v:1));
}
function escalaDash(dash, w, dens, gap){
  if(!dash) return '';
  const d=Math.max(0.3, Math.min(4, +dens || dashDensidade()));
  const g=Math.max(0.25,Math.min(4,+gap||dashEspacamento()));
  const k=Math.max(0.6, (+w||0.5)/0.5*0.55) / d;   // dash calibrado p/ w≈0.5 mm
  return dash.trim().split(/\s+/).map((v,i)=>{ const n=parseFloat(v);
    return isFinite(n)?Math.max(0.05,n*k*(i%2?g:1)).toFixed(2):v; }).join(' ');
}
const DASH_OPTS=[
  ['','Sólida'],
  ['3 1.5','Tracejada cerrada'],
  ['4 3','Tracejada curta'],
  ['6 4','Tracejada'],
  ['12 6','Tracejada longa'],
  ['18 8','Tracejada extra-longa'],
  ['1.5 4','Pontilhada'],
  ['1 2','Pontilhada densa'],
  ['10 4 2 4','Traço-ponto'],
  ['14 4 2 4 2 4','Traço-ponto-ponto'],
  ['16 4 5 4','Traço longo-curto'],
  ['6 10','Espaçada'],
  ['2 2','Micro-tracejada'],
  ['22 4 2 4','Eixo (center line)'],
  ['8 4 8 12','Duplo-traço espaçado'],
];
/* Amostra do tracejado: um trecho de linha DESENHADO com o próprio padrão.
   O viewBox é largo (160) para o padrão se repetir várias vezes — num trecho
   curto "Tracejada longa" e "Eixo" ficariam idênticos. */
function dsAmostraSVG(dash, cor, esp){
  const w=Math.max(1, Math.min(5, +esp||2));
  return `<svg viewBox="0 0 160 16" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">`+
    `<line x1="2" y1="8" x2="158" y2="8" stroke="${cor}" stroke-width="${w}" `+
    `stroke-linecap="butt" vector-effect="non-scaling-stroke"`+
    (dash?` stroke-dasharray="${dash}"`:'')+`/></svg>`;
}
/* Galeria de estilos de linha: mesma ideia da galeria de símbolos de ponto —
   quem escolhe vê o traço, não o nome. "Tracejada curta" e "Micro-tracejada"
   só se distinguem olhando. */
function dsGaleriaHTML(cur, cor, esp){
  const c=cor||'#111111';
  return `<div class="dsgal"><div class="dsgal-r">`+DASH_OPTS.map(([v,l])=>
    `<button type="button" class="dsgal-i${v===(cur||'')?' on':''}" data-ds="${v}" title="${esc(l)}">`+
      `<span class="dsgal-d">${dsAmostraSVG(v,c,esp)}</span>`+
      `<span class="dsgal-l">${esc(l)}</span></button>`).join('')+`</div></div>`;
}
/* Liga a galeria ao <select> escondido: o clique grava o valor e dispara os
   MESMOS eventos que a lista disparava, então a aplicação ao vivo e tudo que
   já escutava o select seguem valendo sem alteração. */
function dsBindGaleria(gal, sel, corDe, espDe){
  if(!gal || !sel || gal._lig) return;
  gal._lig=true;
  gal.addEventListener('click',e=>{
    const bt=e.target.closest('.dsgal-i'); if(!bt) return;
    e.preventDefault();
    gal.querySelectorAll('.dsgal-i.on').forEach(x=>x.classList.remove('on'));
    bt.classList.add('on');
    sel.value=bt.dataset.ds;
    sel.dispatchEvent(new Event('input',{bubbles:true}));
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    bt.scrollIntoView({block:'nearest'});
  });
  /* mudou cor ou espessura: a amostra passa a mostrar como a linha VAI ficar */
  gal._repinta=()=>{
    const c=(typeof corDe==='function'? corDe():corDe)||'#111111';
    const w=(typeof espDe==='function'? espDe():espDe);
    gal.querySelectorAll('.dsgal-i').forEach(bt=>{
      const d=bt.querySelector('.dsgal-d');
      if(d) d.innerHTML=dsAmostraSVG(bt.dataset.ds, c, w);
    });
  };
  /* o select pode ser mudado por fora (sincronismo do painel): a marcação
     acompanha, senão a galeria mostraria um escolhido que não é o vigente */
  gal._marca=()=>{
    const v=sel.value||'';
    gal.querySelectorAll('.dsgal-i').forEach(bt=>
      bt.classList.toggle('on', bt.dataset.ds===v));
  };
  sel.addEventListener('change',()=>gal._marca());
}
let lpLayer=null;

/* paleta de cores para toque (Android): swatches que preenchem o color picker.
   Cobre tons comuns em cartografia/mina + cinzas + básicas. */
var PAL_CORES = [
  '#000000','#404040','#808080','#b0b0b0','#e0e0e0','#ffffff',
  '#e53935','#d81b60','#8e24aa','#5e35b1','#3949ab','#1e88e5',
  '#039be5','#00acc1','#00897b','#43a047','#7cb342','#c0ca33',
  '#fdd835','#ffb300','#fb8c00','#f4511e','#6d4c41','#c25b1a',
  '#173B57','#2e7d32','#1565c0','#b71c1c','#4a148c','#00695c',
];
function paletaSwatches(){
  return PAL_CORES.map(c=>`<button type="button" class="ce-sw" data-cor="${c}" title="${c}" style="background:${c}"></button>`).join('');
}
/* Parâmetros declarativos de símbolos. O primeiro uso é a placa R-19, cujo
   número precisa vir da categoria (20, 40, 60 km/h...), e a estrutura já
   permite acrescentar outros símbolos parametrizados sem criar telas novas. */
function ptParamFieldsHTML(shape,params){
  const def=PT_SYMS[shape]||PT_SYMS.circle, ds=def.paramDefs||{}, p=params||{};
  return Object.entries(ds).map(([key,d])=>{
    const val=p[key]??d.default??'';
    return `<div><label class="field">${esc(d.label||key)}</label>`+
      `<input class="ce-symbol-param" data-param="${esc(key)}" type="${d.type==='number'?'number':'text'}" `+
      `value="${esc(String(val))}"${d.min!=null?` min="${d.min}"`:''}${d.max!=null?` max="${d.max}"`:''}${d.step!=null?` step="${d.step}"`:''}></div>`;
  }).join('');
}
function ptParamEditorHTML(shape,params){
  const h=ptParamFieldsHTML(shape,params);
  return `<div class="ce-symbol-params" style="${h?'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px':'display:none'}">${h}</div>`;
}
function ptParamsFromEditor(el){
  const out={};
  el.querySelectorAll('.ce-symbol-param').forEach(inp=>{
    const def=((PT_SYMS[(el.querySelector('.ce-shape')||{}).value]||{}).paramDefs||{})[inp.dataset.param]||{};
    out[inp.dataset.param]=def.type==='number'?(Number.isFinite(+inp.value)?+inp.value:(def.default??0)):inp.value;
  });
  return out;
}
function lpPointSizeClasses(L){
  if(!L||!L.sym)return [];
  return L.sym.mode==='grad'?(L.sym.classes||[]):L.sym.mode==='cat'?(L.sym.cats||[]):[];
}
function lpPointSizeHasOwn(item){
  return !!(item&&Object.prototype.hasOwnProperty.call(item,'size')&&Number.isFinite(+item.size));
}
function lpPointSizeSetAll(L,value){
  if(!L||L.gtype!=='point')return 0;
  const cfg=ptCfg(L),arr=lpPointSizeClasses(L);
  cfg.size=ptSizePx(value,cfg.size);
  cfg.sizeGeneralSet=true;
  [...(L.sym.cats||[]),...(L.sym.classes||[])].forEach(c=>{if(c)delete c.size;});
  return arr.length;
}
function lpPointSizeSync(L){
  const box=document.getElementById('lpPtSizeBox');
  if(!box)return;
  const show=!!(L&&L.gtype==='point'&&L.sym&&L.sym.mode!=='single');
  box.style.display=show?'block':'none';
  if(!show)return;
  const cfg=ptCfg(L),arr=lpPointSizeClasses(L);
  const inp=document.getElementById('lpPtSize'),info=document.getElementById('lpPtSizeInfo');
  if(inp&&document.activeElement!==inp)inp.value=String(ptSizePx(cfg.size,14));
  if(info){
    const own=arr.filter(lpPointSizeHasOwn).length;
    info.innerHTML=`Padrão atual: <b>${ptSizePx(cfg.size,14)} px</b> · ${own?`<b>${own}</b> ${own===1?'exceção individual':'exceções individuais'}`:'todas as categorias seguem o tamanho geral'}.`;
  }
}
function clsEditor(idx, item, label, count, layer){
  const s=layer.sym; const isPoly=layer.gtype==='polygon'; const isPt=layer.gtype==='point';
  const hSel=hatchOptionsHTML(item.hatch??s.hatch);
  const dSel=DASH_OPTS.map(([v,l])=>`<option value="${v}" ${(item.dash??s.dash)===v?'selected':''}>${l}</option>`).join('');
  const eye=count!=null?`<span class="eye ceye ${item.vis!==false?'on':''}" data-ci="${idx}">${item.vis!==false?'◉':'○'}</span>`:'';
  const pcfg=isPt? ptCfg(layer):null;
  const ownSize=isPt&&s.mode!=='single'&&lpPointSizeHasOwn(item);
  const shSel=isPt? ptSymOptionsHTML(item.shape||pcfg.shape||'circle'):'';
  const shp=isPt? (item.shape||pcfg.shape||'circle'):'';
  const pparams=isPt?(item.symbolParams||pcfg.symbolParams||null):null;
  const prev=isPt? ptSVG({shape:shp, size:26, rot:0, dip:(PT_SYMS[shp]&&PT_SYMS[shp].dip)?'32':null,params:pparams,
      def:PT_SYMS[shp]||PT_SYMS.circle}, item.color, item.stroke||item.color, item.weight??s.weight):'';
  return `<div class="cls" data-i="${idx}">
    <div class="cls-h"><span class="chev2">▶</span>${eye}${isPt?
      `<span class="sw" style="background:#fff;display:flex;align-items:center;justify-content:center">${
        ptSVG({shape:shp,size:12,rot:0,dip:null,params:pparams,def:PT_SYMS[shp]||PT_SYMS.circle}, item.color, item.stroke||item.color, item.weight??s.weight)}</span>`
      :(layer.gtype==='line'
        ? `<span class="sw" style="background:#fff;display:flex;align-items:center;justify-content:center"><svg width="18" height="10" viewBox="0 0 18 10"><line x1="1" y1="8" x2="17" y2="2" stroke="${item.stroke||item.color}" stroke-width="${Math.min(4,item.weight??s.weight??2)}" ${(item.dash??s.dash)?`stroke-dasharray="${item.dash??s.dash}"`:''} stroke-linecap="round"/>${window.GeoMineLineArrows?GeoMineLineArrows.svg([1,8],[17,2],{...GeoMineLineArrows.style(item,s),arrowSize:4},item.stroke||item.color,Math.min(1.3,item.weight??s.weight??2)):''}</svg></span>`
        : ((item.hatch??s.hatch)==='none'
            ? `<span class="sw" style="background:#fff;position:relative;overflow:hidden"><svg width="100%" height="100%" viewBox="0 0 10 10" preserveAspectRatio="none" style="position:absolute;inset:0"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="${item.stroke||item.color}" stroke-width="1"/><line x1="0" y1="10" x2="10" y2="0" stroke="#e05252" stroke-width="1.2"/></svg></span>`
            : `<span class="sw" style="background:${item.color}"></span>`))}
      <span class="lb">${esc(label)}</span><span class="ct">${count!=null?count+' feiç.':''}${ownSize?' · tamanho próprio':''}</span></div>
    <div class="cls-b">
      ${isPt?`<div style="display:flex;align-items:center;gap:8px">
        <label class="field" style="margin:0;flex:1">Símbolo</label>
        <span class="ce-prev" style="display:flex;align-items:center;justify-content:center;background:#fff;border:1px solid var(--line);border-radius:6px;min-width:38px;min-height:38px">${prev}</span>
      </div>
      <select class="ce-shape" style="display:none">${shSel}</select>
      ${ptGaleriaHTML(shp, item.color, item.stroke||item.color, item.weight??s.weight)}
      ${ptParamEditorHTML(shp,pparams)}
      <div class="row2">
        <div>${s.mode!=='single'?`<label class="field" style="display:flex;align-items:center;gap:7px;cursor:pointer"><input type="checkbox" class="ce-size-own" ${ownSize?'checked':''} style="width:auto;accent-color:var(--amber)"> Tamanho próprio</label>`:'<label class="field">Tamanho (px)</label>'}<input type="number" class="ce-size" value="${ownSize?ptSizePx(item.size,pcfg.size):ptSizePx(pcfg.size,14)}" min="6" max="96" step="1" ${s.mode!=='single'&&!ownSize?'disabled':''}>${s.mode!=='single'?`<div class="hint" style="margin-top:3px">Desmarcado: usa ${ptSizePx(pcfg.size,14)} px da camada.</div>`:''}</div>
        <div><label class="field">Espessura</label><input type="number" class="ce-weight" value="${item.weight??s.weight}" min="0" step="0.1"></div>
      </div>`:''}
      <div class="row2">
        <div><label class="field">Preenchimento</label><button type="button" class="ce-color ce-color-pick active" data-target="fill" value="${item.color}" style="background:${item.color}" aria-pressed="true" title="Selecionar preenchimento"></button></div>
        <div><label class="field">Contorno</label><button type="button" class="ce-stroke ce-color-pick" data-target="stroke" value="${item.stroke||item.color}" style="background:${item.stroke||item.color}" aria-pressed="false" title="Selecionar contorno"></button></div>
      </div>
      <div class="ce-pal" data-for="fill">${paletaSwatches()}</div>
      <div class="hint" style="margin:-2px 0 4px">Escolha <b>Preenchimento</b> ou <b>Contorno</b> acima e toque em uma cor abaixo.</div>
      ${isPoly?`<label class="field">Hachura</label><select class="ce-hatch">${hSel}</select>
      <div class="ce-hatch-spacing-row" style="${['solid','none',''].includes(item.hatch??s.hatch)?'display:none':''}">
        <label class="field">Espaçamento da hachura (×)</label>
        <input type="number" class="ce-hatch-scale" value="${item.hatchScale??s.hatchScale??1}" min="0.25" max="8" step="0.25">
      </div>`:''}
      ${isPt?'':`<div class="row2">
        <div><label class="field">Espessura</label><input type="number" class="ce-weight" value="${item.weight??s.weight}" min="0" step="0.1"></div>
        <div><label class="field">Opacid. preench.</label><input type="number" class="ce-fill" value="${item.fill??s.fill}" min="0" max="1" step="0.05"></div>
      </div>
      <label class="field">Estilo de linha</label>
      <select class="ce-dash" style="display:none">${dSel}</select>
      ${dsGaleriaHTML(item.dash??s.dash, item.stroke||item.color, item.weight??s.weight)}`}
      ${layer.gtype==='line'&&s.mode!=='single'?`<div class="row2">
        <div><label class="field">Seta desta categoria</label><select class="ce-arrow-end">
          <option value="inherit" ${item.arrowEnd==null?'selected':''}>Usar padrão da camada</option>
          <option value="none" ${item.arrowEnd==='none'?'selected':''}>Sem seta</option>
          <option value="open" ${item.arrowEnd==='open'?'selected':''}>Seta aberta no final →</option>
          <option value="filled" ${item.arrowEnd==='filled'?'selected':''}>Seta preenchida no final ➤</option>
        </select></div><div><label class="field">Ponta própria (mm, opcional)</label><input class="ce-arrow-size" type="number" min="0.5" max="20" step="0.5" value="${item.arrowSize??''}" placeholder="Padrão da camada"></div>
      </div>`:''}
    </div></div>`;
}
function lpSyncCtrl(){
  const L=lpLayer; if(!L) return; const s=L.sym;
  // bloco de orientação: só para camadas de ponto
  const po=document.getElementById('lpPtOrient');
  if(po){
    const isPt=L.gtype==='point';
    po.style.display=isPt?'block':'none';
    if(isPt){
      const cfg=ptCfg(L);
      const flds=(L.fields||[]).map(f=>f.name);
      const opts=(cur)=>'<option value="">— nenhum —</option>'+
        flds.map(n=>`<option value="${esc(n)}" ${n===cur?'selected':''}>${esc(n)}</option>`).join('');
      document.getElementById('lpRotField').innerHTML=opts(cfg.rotField);
      document.getElementById('lpDipField').innerHTML=opts(cfg.dipField);
      document.getElementById('lpRotFix').value=cfg.rot||0;
      const advice=window.GeoMineGeology?.standards?.orientationLabels(L._geology?.kind,cfg.shape);
      if(advice){
        document.getElementById('lpRotFieldLabel').textContent=advice.direction;
        document.getElementById('lpDipFieldLabel').textContent=advice.angle;
        document.getElementById('lpOrientationHint').textContent=advice.help;
      }
    }
  }
  document.getElementById('lpMode').value=s.mode;
  lpPointSizeSync(L);
  const showCls=s.mode!=='single';
  document.getElementById('lpClsOpts').style.display=showCls?'block':'none';
  { const b=document.getElementById('lpPointSymbolsBox');
    if(b)b.style.display=(L.gtype==='point'&&s.mode==='cat')?'block':'none'; }
  document.getElementById('lpGradOpts').style.display=s.mode==='grad'?'flex':'none';
  document.getElementById('lpRamp').value=s.ramp||'amber';
  // campos: numéricos p/ graduado, todos p/ categorizado
  const fields=(s.mode==='grad')?L.fields.filter(f=>f.type==='N'||f.type==='F'):L.fields;
  document.getElementById('lpField').innerHTML=fields.length
    ? fields.map(f=>`<option value="${f.name}" ${f.name===s.field?'selected':''}>${f.name}</option>`).join('')
    : '<option value="">(sem campos compatíveis)</option>';
}
function lpBindPtPreview(root){
  (root||document.getElementById('lpClasses')||document).querySelectorAll('.cls').forEach(el=>{
    const upd=()=>{
      const pv=el.querySelector('.ce-prev'); if(!pv) return;
      const sh=(el.querySelector('.ce-shape')||{}).value||'circle';
      const co=(el.querySelector('.ce-color')||{}).value||'#f5a524';
      const st2=(el.querySelector('.ce-stroke')||{}).value||co;
      const wt=+((el.querySelector('.ce-weight')||{}).value)||1.5;
      pv.innerHTML=ptSVG({shape:sh,size:26,rot:0,params:ptParamsFromEditor(el),
        dip:(PT_SYMS[sh]&&PT_SYMS[sh].dip)?'32':null, def:PT_SYMS[sh]||PT_SYMS.circle}, co, st2, wt);
    };
    ['.ce-shape','.ce-color','.ce-stroke','.ce-weight'].forEach(q=>{
      const e=el.querySelector(q); if(e) e.addEventListener('input',upd); });
    /* GALERIA → <select> escondido: um clique no desenho grava o valor e
       dispara os MESMOS eventos que a lista disparava, para o resto do
       aplicativo (inclusive a aplicação ao vivo) continuar valendo. */
    const gal=el.querySelector('.ptgal'), sel=el.querySelector('.ce-shape');
    if(gal && sel){
      gal.addEventListener('click',e=>{
        const bt=e.target.closest('.ptgal-i'); if(!bt) return;
        e.preventDefault();
        gal.querySelectorAll('.ptgal-i.on').forEach(x=>x.classList.remove('on'));
        bt.classList.add('on');
        sel.value=bt.dataset.sh;
        sel.dispatchEvent(new Event('input',{bubbles:true}));
        sel.dispatchEvent(new Event('change',{bubbles:true}));
        const pb=el.querySelector('.ce-symbol-params');
        if(pb){const h=ptParamFieldsHTML(bt.dataset.sh,null);pb.innerHTML=h;
          pb.style.display=h?'grid':'none';}
        upd();
        bt.scrollIntoView({block:'nearest'});
      });
      el.addEventListener('input',e=>{if(e.target&&e.target.classList.contains('ce-symbol-param'))upd();});
      /* Mudando cor/espessura, a galeria inteira acompanha — assim o desenho
         de cada opção mostra como o símbolo VAI ficar, não uma cor genérica. */
      const repinta=()=>{
        const co=(el.querySelector('.ce-color')||{}).value||'#f5a524';
        const st2=(el.querySelector('.ce-stroke')||{}).value||co;
        const wt=+((el.querySelector('.ce-weight')||{}).value)||1.5;
        gal.querySelectorAll('.ptgal-i').forEach(bt=>{
          const v=bt.dataset.sh, d=bt.querySelector('.ptgal-d');
          if(d && PT_SYMS[v]) d.innerHTML=ptSVG({shape:v,size:26,rot:0,dip:null,def:PT_SYMS[v]},co,st2,wt);
        });
      };
      let tRep=null;
      ['.ce-color','.ce-stroke','.ce-weight'].forEach(q=>{
        const e=el.querySelector(q);
        if(e) e.addEventListener('input',()=>{ clearTimeout(tRep); tRep=setTimeout(repinta,150); });
      });
    }
    /* galeria de ESTILO DE LINHA da mesma classe */
    const dgal=el.querySelector('.dsgal'), dsel=el.querySelector('.ce-dash');
    if(dgal && dsel){
      const cor=()=>(el.querySelector('.ce-stroke')||el.querySelector('.ce-color')||{}).value||'#111111';
      const esp=()=>+((el.querySelector('.ce-weight')||{}).value)||2;
      dsBindGaleria(dgal, dsel, cor, esp);
      let tD=null;
      ['.ce-stroke','.ce-color','.ce-weight'].forEach(q=>{
        const e=el.querySelector(q);
        if(e) e.addEventListener('input',()=>{ clearTimeout(tD); tD=setTimeout(dgal._repinta,150); });
      });
    }
  });
}
function renderLpClasses(){
  const L=lpLayer; if(!L) return; const s=L.sym;
  const box=document.getElementById('lpClasses'); let html='';
  if(L.gtype==='line'){
    const a=window.GeoMineLineArrows?GeoMineLineArrows.style(s):{arrowEnd:'none',arrowSize:3};
    html+=`<div class="card" style="margin-bottom:12px"><div class="row2">
      <div><label class="field">Seta no final da linha — padrão da camada</label><select class="lp-arrow-end">
        <option value="none" ${a.arrowEnd==='none'?'selected':''}>Sem seta</option>
        <option value="open" ${a.arrowEnd==='open'?'selected':''}>Seta aberta →</option>
        <option value="filled" ${a.arrowEnd==='filled'?'selected':''}>Seta preenchida ➤</option>
      </select></div><div><label class="field">Comprimento da ponta (mm na plotagem)</label><input class="lp-arrow-size" type="number" min="0.5" max="20" step="0.5" value="${a.arrowSize}"></div></div>
      <div class="hint">A ponta coincide sempre com o último vértice de cada linha, seguindo o sentido do desenho. Não muda a geometria. Categorias podem usar uma configuração própria.</div></div>`;
  }
  if(s.mode==='grad' && s.classes.length){
    html+='<label class="field">Classes (toque para personalizar cada uma)</label>';
    s.classes.forEach((c,i)=>{ html+=clsEditor(i,c,`${fmt(c.min)} – ${fmt(c.max)}`,c.count,L); });
  } else if(s.mode==='cat' && s.cats.length){
    html+='<label class="field">Categorias (toque para personalizar cada uma)</label>';
    s.cats.forEach((c,i)=>{ html+=clsEditor(i,c,String(c.value),c.count,L); });
  } else if(s.mode==='single'){
    html+='<label class="field">Símbolo único</label>';
    html+=clsEditor(0,{color:s.color,stroke:s.stroke,hatch:s.hatch,weight:s.weight,fill:s.fill,dash:s.dash},L.name,null,L);
  } else {
    html+='<div class="hint">Escolha o campo e toque em "Gerar / regerar classes".</div>';
  }
  box.innerHTML=html;
  box.querySelectorAll('.cls-h').forEach(h=>h.onclick=()=>h.parentElement.classList.toggle('open'));
  clsBindEditors(box,()=>lpLayer);
  box.querySelectorAll('.ceye').forEach(ey=>ey.addEventListener('click',e=>{
    e.stopPropagation(); const L=lpLayer; if(!L) return;
    const arr=L.sym.mode==='grad'?L.sym.classes:L.sym.cats;
    const c=arr[+ey.dataset.ci]; if(!c) return;
    c.vis=!(c.vis!==false); drawLayer(L); refreshUI(); renderLpClasses(); }));
}
/* Ligações de um editor de classe (clsEditor): paleta para preenchimento ou
   contorno, hachura, tamanho próprio do ponto, galerias de símbolo e de linha.
   Usadas pela janela completa da camada e pela janela resumida da classe. */
function clsBindEditors(box,camada){
  box.querySelectorAll('.ce-color-pick').forEach(inp=>{
    inp.addEventListener('click',()=>{
      const cls=inp.closest('.cls'); if(!cls) return;
      cls.dataset.colorTarget=inp.dataset.target;
      cls.querySelectorAll('.ce-color-pick').forEach(b=>{
        const ativo=b===inp; b.classList.toggle('active',ativo); b.setAttribute('aria-pressed',ativo?'true':'false');
      });
    });
    inp.addEventListener('input',()=>{
      inp.style.background=inp.value; inp.title=(inp.dataset.target==='stroke'?'Contorno: ':'Preenchimento: ')+inp.value;
      if(inp.classList.contains('ce-color')) inp.closest('.cls').querySelector('.sw').style.background=inp.value;
    });
  });
  // A cor é aplicada ao alvo escolhido acima, sem abrir a paleta secundária do navegador.
  box.querySelectorAll('.ce-sw').forEach(btn=>{
    const aplica=(alvo)=>{ const cls=btn.closest('.cls'); if(!cls) return;
      const cor=btn.dataset.cor;
      const inp=cls.querySelector(alvo==='stroke'?'.ce-stroke':'.ce-color');
      if(inp){ inp.value=cor; inp.dispatchEvent(new Event('input',{bubbles:true})); }
      const sw=cls.querySelector('.sw'); if(sw && alvo!=='stroke') sw.style.background=cor;
    };
    btn.addEventListener('click',e=>{
      const cls=btn.closest('.cls'); aplica(cls&&cls.dataset.colorTarget==='stroke'?'stroke':'fill'); e.preventDefault();
    });
  });
  box.querySelectorAll('.ce-hatch').forEach(sel=>sel.addEventListener('change',()=>{
    const gap=sel.closest('.cls').querySelector('.ce-hatch-spacing-row');
    if(gap)gap.style.display=['solid','none',''].includes(sel.value)?'none':'';
    const sw=sel.closest('.cls').querySelector('.sw'); if(!sw) return;
    if(sel.value==='none'){
      const stroke=sel.closest('.cls').querySelector('.ce-stroke');
      sw.style.background='#fff';
      sw.innerHTML=`<svg width="100%" height="100%" viewBox="0 0 10 10" preserveAspectRatio="none" style="position:absolute;inset:0"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="${stroke?stroke.value:'#888'}" stroke-width="1"/><line x1="0" y1="10" x2="10" y2="0" stroke="#e05252" stroke-width="1.2"/></svg>`;
      sw.style.position='relative'; sw.style.overflow='hidden';
    } else {
      const col=sel.closest('.cls').querySelector('.ce-color');
      sw.innerHTML=''; sw.style.background=col?col.value:'#888';
    }
  }));
  box.querySelectorAll('.ce-size-own').forEach(ch=>{
    const inp=ch.closest('.cls').querySelector('.ce-size');
    const sync=()=>{if(inp)inp.disabled=!ch.checked;};
    sync();
    ch.addEventListener('change',()=>{
      if(inp&&!ch.checked)inp.value=String(ptSizePx(ptCfg(camada()).size,14));
      sync();
    });
  });
  lpBindPtPreview(box);
}
/* Origem do arquivo, formatada. Navegadores não entregam o caminho absoluto do
   disco (sandbox) — mostramos o nome do arquivo, a pasta relativa (quando a
   importação vem de uma pasta), o tamanho e a data de importação.            */
function srcHTML(o,clicavel){
  if(!o) return 'Origem: <b>—</b> (camada criada no app)';
  const kb=o.size?(o.size>1048576?(o.size/1048576).toFixed(1)+' MB':(o.size/1024).toFixed(0)+' kB'):'';
  const dt=o.at?new Date(o.at).toLocaleString('pt-BR'):'';
  const cam=o.path? o.path : o.file;
  const nome=esc(cam||'—');
  const arq=clicavel
    ? `<button type="button" data-open-src style="border:0;background:transparent;padding:0;color:var(--cyan);font:inherit;font-weight:700;text-decoration:underline;cursor:pointer" title="Mostrar o arquivo na janela do sistema">${nome}</button>`
    : `<b>${nome}</b>`;
  return `Arquivo: ${arq}${kb?' · '+kb:''}${dt?'<br>Importado em: '+dt:''}`;
}
function lpInfoHTML(L){
  const s=L.sym; const t=layerTotals(L);
  let info=`${srcHTML(L.src,true)}<br>CRS: <b>${CRS_LABELS[L.crs]||L.crs}</b><br>Campos: ${L.fields.map(f=>f.name).join(', ')||'—'}<br>`;
  if(L.gtype==='polygon') info+=`Área total: <b>${fmtArea(t.area)}</b> (medida em ${S.workCRS})<br>`;
  if(L.gtype==='line') info+=`Comprimento total: <b>${fmtLen(t.comp)}</b><br>`;
  info+=`Classificação: <b>${s.mode==='single'?'símbolo único':s.mode==='grad'?'graduada por "'+s.field+'"':'categorizada por "'+s.field+'"'}</b>`;
  if(L.attrFilter&&L.attrFilter.enabled!==false&&L.attrFilter.field)
    info+=`<br>Filtro ativo: <b>${attrFilterCount(L).toLocaleString('pt-BR')} de ${L.features.length.toLocaleString('pt-BR')} feições visíveis</b>`;
  info+=selectedDimensionsHTML(L)+featureContinueHTML(L);
  const ownStyles=(L.features||[]).filter(f=>window.GeoMineFeatureStyleBrush?.has(L,f)).length;
  if(ownStyles) info+=`<br><button type="button" class="tbtn" data-feature-style-reset title="Remove os estilos individuais; cada feição volta à simbologia ou classificação da camada">Restaurar estilo da camada em todas as feições (${ownStyles})</button>`;
  info+=window.GeoMineGeology?.boreholeProperties?.layerActionsHTML(L)||'';
  return info;
}
function openLayerProps(L){
  window.GeoMineFeatureStyleBrush?.cancel();
  if(L?._geology?.kind==='surpac-mesh'&&window.GeoMineGeology?.meshes)
    return window.GeoMineGeology.meshes.open(L._geology.meshId);
  lpLayer=L;
  { const v=document.getElementById('lpVisReal');
    if(v){ v.checked=!!L.visReal;
      v.onchange=e=>{ L.visReal=!!e.target.checked;
        if(L.visReal && typeof visRealTerreno==='function' && !visRealTerreno())
          toast('Nenhum MDT visível com cotas — ligue um raster de elevação para a visibilidade real agir');
        drawLayer(L); refreshUI();
        const pp=document.getElementById('ppVisReal'); if(pp) pp.checked=L.visReal;
      };
    } }
  /* seletor do MDT usado na interseção/visibilidade — espelho do seletor da
     cava (que recalcula a linha e grava na receita ao trocar) */
  { const box=document.getElementById('lpMdtBox'),ms=document.getElementById('lpMdtSel');
    if(box&&ms){
      const rs=(S.rasters||[]);
      if(!rs.length){ box.style.display='none'; }
      else{
        box.style.display='';
        const cava=document.getElementById('cavaMdtSel');
        ms.innerHTML='<option value="">— escolha o MDT —</option>'+
          rs.map(r2=>`<option value="${r2.id}">${esc(r2.name)}</option>`).join('');
        if(cava&&cava.value&&[...ms.options].some(o=>o.value===String(cava.value)))
          ms.value=String(cava.value);
        ms.onchange=()=>{
          if(!ms.value)return;
          if(cava){ cava.value=String(ms.value); if(cava.onchange)cava.onchange(); }
          else toast('Painel da cava indisponível — abra a Cava Paramétrica uma vez');
        };
      }
    } }
  document.getElementById('lpRename').value=L.name;
  document.getElementById('lpName').textContent=L.name;
  document.getElementById('lpMeta').textContent=`${L.gtype} · ${L.features.length} feições`;
  document.getElementById('lpInfo').innerHTML=lpInfoHTML(L);
  bindFeatureContinue(document.getElementById('lpInfo'),L);
  window.GeoMineGeology?.boreholeProperties?.bindLayerActions(document.getElementById('lpInfo'),L);
  { const b=document.querySelector('#lpInfo [data-open-src]');
    if(b)b.onclick=()=>abreLocalFonteCamada(L); }
  lpSyncCtrl();
  renderLpClasses();
  lpFillLabels(L);
  lpFillFilter(L);
  { const cp=document.getElementById('lpStyleCopy'),ps=document.getElementById('lpStylePaste');
    if(cp)cp.onclick=()=>{layerStyleCopy(L);if(ps)ps.disabled=!S._layerStyleClipboard||S._layerStyleClipboard.gtype!==L.gtype;};
    if(ps){ps.disabled=!S._layerStyleClipboard||S._layerStyleClipboard.gtype!==L.gtype;ps.onclick=()=>{
      if(!layerStylePaste(L))return;lpSyncCtrl();renderLpClasses();lpFillLabels(L);lpFillFilter(L);
      document.getElementById('lpInfo').innerHTML=lpInfoHTML(L);
      bindFeatureContinue(document.getElementById('lpInfo'),L);
      window.GeoMineGeology?.boreholeProperties?.bindLayerActions(document.getElementById('lpInfo'),L);
    };}
  }
  lpTab('sym');
  document.getElementById('lpModal').classList.add('on');
  cnRefresh(L);
  const bcn=document.getElementById('btnCnRun');
  if(bcn) bcn.onclick=()=>cnApply(L);
}
async function abreLocalFonteCamada(L){
  if(!window.showOpenFilePicker){toast('O navegador não permite mostrar a pasta deste arquivo.');return;}
  let start='documents';
  if(L&&L.projectFile)try{const ds=await projectDirs(false);if(ds)start=ds.shapes;}catch(e){}
  try{
    await showOpenFilePicker({id:'alagis-vector-source',startIn:start,multiple:true,
      types:[{description:'Dados vetoriais',accept:{'application/octet-stream':['.shp','.dbf','.shx','.zip','.gpkg'],
        'application/geo+json':['.geojson'],'application/json':['.json']}}]});
  }catch(e){if(e&&e.name!=='AbortError')toast('Não foi possível abrir a localização: '+(e.message||e));}
}
/* ---------- aba Rótulos ---------- */
function lpTab(t){
  document.querySelectorAll('.lptabs .tbtn').forEach(b=>b.classList.toggle('on', b.dataset.lpt===t));
  document.getElementById('lpPaneSym').style.display = t==='sym'?'block':'none';
  document.getElementById('lpPaneLbl').style.display = t==='lbl'?'block':'none';
  document.getElementById('lpPaneFlt').style.display = t==='flt'?'block':'none';
}
document.querySelectorAll('.lptabs .tbtn').forEach(b=>b.onclick=()=>lpTab(b.dataset.lpt));

function lpFilterSuggestions(L,field,dl){
  /* Cada condição adicional possui seu próprio datalist, pois pode usar um
     campo diferente. Sem o parâmetro, mantém o comportamento da 1ª linha. */
  dl=dl||document.getElementById('lpFltSuggestions');if(!dl)return;
  const vals=new Set();
  for(const f of (L.features||[])){
    const v=f&&f.props?f.props[field]:null;
    if(v!=null&&String(v)!=='')vals.add(String(v));
    if(vals.size>=250)break;
  }
  dl.innerHTML=[...vals].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}))
    .map(v=>`<option value="${esc(v)}"></option>`).join('');
}
function lpFilterSyncOp(){
  const op=document.getElementById('lpFltOp').value;
  const semValor=op==='empty'||op==='notempty';
  document.getElementById('lpFltValues').style.display=semValor?'none':'grid';
  document.getElementById('lpFltValue2Box').style.display=op==='between'?'block':'none';
}
function lpFillFilter(L){
  const q=L.attrFilter||{},fields=attrFilterFields(L),field=document.getElementById('lpFltField');
  field.innerHTML='<option value="">— escolha o campo —</option>'+fields.map(n=>
    `<option value="${esc(n)}" ${q.field===n?'selected':''}>${esc(n)}</option>`).join('');
  document.getElementById('lpFltOp').value=q.op||'eq';
  document.getElementById('lpFltValue').value=q.value??'';
  document.getElementById('lpFltValue2').value=q.value2??'';
  document.getElementById('lpFltCase').checked=!!q.caseSensitive;
  const active=!!(q.enabled!==false&&q.field),n=active?attrFilterCount(L):L.features.length;
  document.getElementById('lpFltStatus').textContent=n.toLocaleString('pt-BR')+' de '+L.features.length.toLocaleString('pt-BR')+' visíveis';
  document.getElementById('lpFltClear').disabled=!active;
  lpFilterSuggestions(L,q.field||field.value);
  lpFilterSyncOp();
}
function lpApplyFilter(){
  const L=lpLayer;if(!L)return;
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);return;}
  const field=document.getElementById('lpFltField').value,op=document.getElementById('lpFltOp').value,
    value=document.getElementById('lpFltValue').value,value2=document.getElementById('lpFltValue2').value,
    caseSensitive=document.getElementById('lpFltCase').checked;
  if(!field){toast('Escolha o campo que será filtrado');return;}
  if(!['empty','notempty'].includes(op)&&String(value).trim()===''){toast('Informe o valor do filtro');return;}
  if(op==='between'&&String(value2).trim()===''){toast('Informe os valores inicial e final');return;}
  L.attrFilter={enabled:true,field,op,value,value2,caseSensitive};
  if(S.selFeat&&S.selFeat.layerId===L.id&&!attrFilterMatch(L,L.features[S.selFeat.idx])){S.selFeat=null;try{highlightSel();}catch(e){}}
  S.msel.items=(S.msel.items||[]).filter(it=>{const X=S.layers.find(x=>x.id===it.layerId),f=X&&X.features[it.idx];return X&&f&&attrFilterMatch(X,f);});
  try{mselHL();mselCount();}catch(e){}
  drawLayer(L);refreshUI();layoutSeVisivel();lpFillFilter(L);
  document.getElementById('lpInfo').innerHTML=lpInfoHTML(L);
  document.getElementById('lpMeta').textContent=`${L.gtype} · ${attrFilterCount(L)} de ${L.features.length} feições`;
  toast('Filtro aplicado: '+attrFilterCount(L).toLocaleString('pt-BR')+' de '+L.features.length.toLocaleString('pt-BR')+' feições');
}
function lpClearFilter(){
  const L=lpLayer;if(!L)return;
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);return;}
  delete L.attrFilter;drawLayer(L);refreshUI();layoutSeVisivel();lpFillFilter(L);
  document.getElementById('lpInfo').innerHTML=lpInfoHTML(L);
  document.getElementById('lpMeta').textContent=`${L.gtype} · ${L.features.length} feições`;
  toast('Filtro removido — todas as feições estão visíveis');
}
document.getElementById('lpFltField').onchange=e=>{if(lpLayer)lpFilterSuggestions(lpLayer,e.target.value);};
document.getElementById('lpFltOp').onchange=lpFilterSyncOp;
document.getElementById('lpFltApply').onclick=lpApplyFilter;
document.getElementById('lpFltClear').onclick=lpClearFilter;

const LB_IDS={lbFont:'font', lbStyle:'style', lbSize:'size', lbColor:'color', lbHalo:'halo',
  lbHaloW:'haloW', lbPlace:'place', lbAnchor:'anchor', lbDx:'dx', lbDy:'dy',
  lbCase:'case', lbDec:'dec', lbPre:'pre', lbSuf:'suf', lbRep:'rep', lbRot:'rot', lbSep:'sep',
  lbFltF:'fltF', lbFltV:'fltV', lbFltLen:'fltLen'};

function lpFormulaExpr(){const e=document.getElementById('lbFormula');return e?String(e.value||'').trim():'';}
function lpFormulaInsere(txt){
  const e=document.getElementById('lbFormula');if(!e||!txt)return;
  const a=Number.isInteger(e.selectionStart)?e.selectionStart:e.value.length,
    b=Number.isInteger(e.selectionEnd)?e.selectionEnd:a;
  e.value=e.value.slice(0,a)+txt+e.value.slice(b);
  const dentro=txt.indexOf('(')>=0?txt.indexOf('(')+1:txt.length;
  e.focus();e.setSelectionRange(a+dentro,a+dentro);lpPreview();lpOptsAtivo(true);
}
function lpLabelRepBoxSync(L,place){
  const box=document.getElementById('lbCurvaBox');
  if(!box)return;
  /* Linhas podem repetir o rótulo em qualquer posição. Para polígonos, o
     controle continua disponível somente quando o perímetro é a referência. */
  const mostra=!!L&&(L.gtype==='line'||(L.gtype==='polygon'&&place==='curva'));
  box.style.display=mostra?'':'none';
}
function lpFillLabels(L){
  const c=labelCfg(L);
  const fs=document.getElementById('lbField');
  const campos=(L.fields&&L.fields.length)? L.fields
    : Object.keys((L.features[0]&&L.features[0].props)||{}).map(n=>({name:n}));
  const escolhidos=new Set(labelCampos(L));
  const virt=geomCamposDe(L.gtype).map(k=>
    `<option value="${k}" ${escolhidos.has(k)?'selected':''}>▸ ${esc(GEOM_CAMPOS[k])}</option>`).join('');
  fs.innerHTML='<option value="" '+(escolhidos.size?'':'selected')+'>— sem rótulo —</option>'+virt+
    (campos.length?'<option disabled>── campos da tabela ──</option>':'')+
    campos.map(f=>`<option value="${esc(f.name)}" ${escolhidos.has(f.name)?'selected':''}>${esc(f.name)}</option>`).join('');
  const fx=document.getElementById('lbFormula');if(fx)fx.value=c.expr||'';
  const fxc=document.getElementById('lbFormulaCampo');
  if(fxc){fxc.innerHTML='<option value="">+ Inserir campo…</option>'+geomCamposDe(L.gtype).map(k=>
      `<option value="${k}">${esc(GEOM_CAMPOS[k])}</option>`).join('')+
      campos.map(fd=>`<option value="&quot;${esc(fd.name).replace(/&quot;/g,'&quot;&quot;')}&quot;">${esc(fd.name)}</option>`).join('');
    fxc.onchange=()=>{if(fxc.value)lpFormulaInsere(fxc.value);fxc.value='';};}
  const fxf=document.getElementById('lbFormulaFuncao');if(fxf)fxf.onchange=()=>{if(fxf.value)lpFormulaInsere(fxf.value);fxf.value='';};
  Object.entries(LB_IDS).forEach(([id,k])=>{ const e=document.getElementById(id); if(e) e.value=c[k]; });
  document.getElementById('lbMap').checked = c.onMap!==false;
  const unico=document.getElementById('lbUnique'), ehPonto=L.gtype==='point';
  if(unico){unico.checked=ehPonto?false:c.unique!==false;unico.disabled=ehPonto;}
  const unicoRow=document.getElementById('lbUniqueRow');
  const unicoHint=document.getElementById('lbUniqueHint');
  const pontoHint=document.getElementById('lbPointUniqueHint');
  if(unicoRow)unicoRow.style.display=ehPonto?'none':'flex';
  if(unicoHint)unicoHint.style.display=ehPonto?'none':'';
  if(pontoHint)pontoHint.style.display=ehPonto?'':'none';
  lpLabelRepBoxSync(L,c.place);
  const ff=document.getElementById('lbFltF');
  if(ff){
    const virt=geomCamposDe(L.gtype).map(k=>`<option value="${k}">▸ ${esc(GEOM_CAMPOS[k])}</option>`).join('');
    ff.innerHTML='<option value="">— rotular todas —</option>'+virt+
      campos.map(fd=>`<option value="${esc(fd.name)}">${esc(fd.name)}</option>`).join('');
    if(c.fltF) ff.value=c.fltF;
    lpFltValores();
    ff.onchange=()=>{ lpFltValores(); };
  }
  const cs=document.getElementById('lbCotas'); if(cs) cs.checked=!!L.cotasSeg;
  lpOptsAtivo(labelAtivo(L)||!!lpFormulaExpr());
  lpPreview();
}
/* Sugestões para o valor do filtro: valores distintos do campo escolhido,
   em ordem e limitados, para não travar em camada com milhares de feições. */
function lpFltValores(){
  const L=lpLayer, dl=document.getElementById('lbFltVals');
  if(!L || !dl) return;
  const campo=(document.getElementById('lbFltF')||{}).value||'';
  if(!campo){ dl.innerHTML=''; return; }
  const vals=new Set();
  for(const f of L.features){
    const v = campo.charAt(0)==='$' ? geomValor(L,f,campo) : (f.props? f.props[campo] : null);
    if(v===null || v===undefined || v==='') continue;
    vals.add(String(v));
    if(vals.size>200) break;                  // teto: a lista deixa de ajudar
  }
  const ord=[...vals].sort((a,b)=>{
    const x=parseFloat(a), y=parseFloat(b);
    return (isFinite(x)&&isFinite(y)) ? x-y : a.localeCompare(b,'pt-BR');
  });
  dl.innerHTML=ord.map(v=>`<option value="${esc(v)}"></option>`).join('');
}
function lpReadLabels(){
  const L=lpLayer; if(!L) return null;
  const c=labelCfg(L);
  Object.entries(LB_IDS).forEach(([id,k])=>{
    const e=document.getElementById(id); if(!e) return;
    c[k] = (e.type==='number') ? +e.value : e.value;
  });
  c.onMap=document.getElementById('lbMap').checked;
  c.unique=L.gtype==='point'?false:document.getElementById('lbUnique').checked;
  /* Vários campos: a lista manda; labelField continua sendo o PRIMEIRO, para
     tudo que já lia esse campo (painel lateral, cópia de estilo, projeto). */
  const escolhidos=[...document.getElementById('lbField').selectedOptions]
    .map(o=>o.value).filter(v=>v!=='');
  L.labelFields=escolhidos;
  L.labelField=escolhidos[0]||'';
  return c;
}
function lpPreview(){
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
  box.innerHTML=`<span style="${labelCSS(c,px)};display:inline-block;line-height:1.15;text-align:center">${labelHTML(txt)}</span>`;
}
['lbFont','lbStyle','lbSize','lbColor','lbHalo','lbHaloW','lbCase','lbDec','lbPre','lbSuf']
  .forEach(id=>{ const e=document.getElementById(id);
    if(e) e.addEventListener('input',()=>{ lpReadLabels(); lpPreview(); }); });
{ const fx=document.getElementById('lbFormula');if(fx)fx.addEventListener('input',()=>{
    lpOptsAtivo(!!lpFormulaExpr()||!!(lpLayer&&lpLayer.labelField));lpPreview();
  }); }
/* As opções de fonte ficam sempre à vista — só esmaecem quando não há campo
   escolhido. Antes ficavam com display:none e passavam despercebidas.      */
function lpOptsAtivo(on){
  const box=document.getElementById('lbOpts'); if(!box) return;
  box.style.display='block';
  box.style.opacity = on? '1' : '.45';
  box.style.pointerEvents = on? 'auto' : 'none';
  const av=document.getElementById('lbAviso');
  if(av) av.style.display = on? 'none' : 'block';
}
document.getElementById('lbField').onchange=()=>{
  const L=lpLayer; if(!L) return;
  {
    const esc2=[...document.getElementById('lbField').selectedOptions]
      .map(o=>o.value).filter(v=>v!=='');
    L.labelFields=esc2; L.labelField=esc2[0]||'';
  }
  const cs=document.getElementById('lbCotas'); if(cs) L.cotasSeg=cs.checked;
  lpLabelRepBoxSync(L,document.getElementById('lbPlace').value);
  lpOptsAtivo(labelAtivo(L)||!!lpFormulaExpr());
  lpPreview();
};
{ const s=document.getElementById('lbSep');
  if(s) s.onchange=()=>{ lpReadLabels(); lpPreview(); }; }
{ const s=document.getElementById('lbPlace');
  if(s) s.onchange=()=>{
    const L=lpLayer;
    lpReadLabels();
    lpLabelRepBoxSync(L,s.value);
    lpPreview();
  }; }
document.getElementById('lbApply').onclick=()=>{
  const L=lpLayer; if(!L) return;
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);return;}
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
        ? `Rótulos por ${cs2.length} campos (${cs2.join(', ')}) aplicados`
        : `Rótulos por "${cs2[0]}" aplicados`)
      : 'Rótulos removidos'); }
};
/* JANELA RESUMIDA DA CLASSE: dois cliques numa classe da árvore abrem só o
   editor daquela classe — cor de preenchimento e de contorno, espessura,
   opacidade, hachura e espaçamento, estilo de linha, setas, símbolo e tamanho
   do ponto. Mesmo editor e mesma leitura da janela completa da camada, com
   aplicação ao vivo como nela. "Usar o padrão da camada" tira as exceções da
   classe e mantém só a cor, que é o que distingue a classe. */
const CLS_PROPRIOS=['stroke','hatch','hatchScale','weight','fill','dash','arrowEnd','arrowSize','shape','size','symbolParams'];
/* A leitura do editor materializa valores antes herdados da camada. Compare
   a aparência resolvida, e não a presença das propriedades: só normalizar
   stroke/weight/etc. não pode apagar o estilo individual de uma feição. */
function layerStyleAppearanceStamp(L,onlyClass){
  const s=L.sym||{},cfg=s.pt||{},isPt=L.gtype==='point';
  const num=v=>Number.isFinite(+v)?+v:v;
  const color=v=>{const c=String(v??'').trim().toLowerCase();return /^#[0-9a-f]{3}$/.test(c)?'#'+[...c.slice(1)].map(x=>x+x).join(''):c;};
  const point=c=>{
    const shape=c?.shape||cfg.shape||'circle',defs=(PT_SYMS[shape]||PT_SYMS.circle).paramDefs||{},raw=c?.symbolParams||cfg.symbolParams||{},params={};
    Object.keys(defs).sort().forEach(k=>{const d=defs[k],v=raw[k]??d.default??'';params[k]=d.type==='number'?num(v):String(v);});
    const own=c&&Object.prototype.hasOwnProperty.call(c,'size')&&Number.isFinite(+c.size);
    return {shape,size:ptSizePx(own?c.size:cfg.size,ptSizePx(cfg.size,14)),params,
      rot:+cfg.rot||0,rotField:cfg.rotField||'',dipField:cfg.dipField||''};
  };
  const appearance=c=>{
    const a=c||s,base={color:color(a.color),stroke:color(c?(c.stroke||c.color):s.stroke),
      weight:num(a.weight??s.weight)};
    if(L.gtype==='polygon')Object.assign(base,{hatch:a.hatch??s.hatch,hatchScale:num(a.hatchScale??s.hatchScale??1),fill:num(a.fill??s.fill),dash:a.dash??s.dash??''});
    else if(L.gtype==='line')Object.assign(base,{dash:a.dash??s.dash??'',...GeoMineLineArrows.style(a,s)});
    if(isPt)base.point=point(c);
    return base;
  };
  const entry=c=>({key:s.mode==='grad'?[num(c.min),num(c.max)]:String(c.value),style:appearance(c)});
  return JSON.stringify(onlyClass?{gtype:L.gtype,mode:s.mode,field:s.field||'',entry:entry(onlyClass)}:
    {gtype:L.gtype,mode:s.mode,field:s.mode==='single'?'':s.field||'',base:appearance(null),
      classes:((s.mode==='grad'?s.classes:s.mode==='cat'?s.cats:[])||[]).map(entry)});
}
function openClassProps(L,ci){
  const s=L&&L.sym,arr=s&&(s.mode==='grad'?s.classes:s.mode==='cat'?s.cats:null),c=arr&&arr[ci];
  if(!c){toast('Classe não encontrada');return;}
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);return;}
  document.querySelectorAll('.ribmini').forEach(x=>x.remove());
  let m=document.getElementById('clsPropModal');
  if(!m){m=document.createElement('div');m.id='clsPropModal';m.className='modal-bg';document.body.appendChild(m);}
  const nomeDe=()=>s.mode==='grad'?`${fmt(c.min)} – ${fmt(c.max)}`:String(c.value);
  let rotulo=nomeDe(),t=null,el=null;
  const aplica=()=>{
    clearTimeout(t);t=null;
    if(!el||typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false))return;
    const before=layerStyleAppearanceStamp(L,c);
    clsLerEditor(el,c,L);
    if(layerStyleAppearanceStamp(L,c)!==before)window.GeoMineFeatureStyleBrush?.resetLayer(L,{predicate:f=>classOf(L,f)===c});
    drawLayer(L);refreshUI();
    try{if(typeof layoutSeVisivel==='function')layoutSeVisivel();}catch(_){}
  };
  const fecha=()=>{if(t)aplica();m.classList.remove('on');};
  const monta=()=>{
    m.innerHTML=`<div class="modal" style="width:min(420px,96vw);max-height:90dvh;display:flex;flex-direction:column">
      <div class="modal-h"><b>Classe “${esc(rotulo)}”</b><span style="color:var(--ink-dim);font-size:12px;margin-left:6px">${esc(L.name)}</span><div style="flex:1"></div><button class="tbtn" id="cpX">✕</button></div>
      <div class="modal-b" id="cpBody" style="overflow:auto;min-height:0">${s.mode==='cat'?`
        <label class="field" for="cpNome">Nome da classe</label>
        <div style="display:flex;gap:8px;margin-bottom:8px"><input type="text" id="cpNome" maxlength="120" value="${esc(rotulo)}" autocomplete="off" style="flex:1">
          <button class="tbtn" id="cpRenomear" title="Troca o valor no campo “${esc(s.field)}” de todas as feições desta classe">Renomear</button></div>
        <div class="hint" style="margin:-4px 0 8px">Renomear troca o valor do campo “${esc(s.field)}” nas ${c.count??''} feição(ões) desta classe; legenda, rótulos e tabela acompanham.</div>`:''}
        ${clsEditor(ci,c,rotulo,c.count,L)}</div>
      <div style="padding:10px 12px;border-top:1px solid var(--line);display:flex;gap:8px;flex-wrap:wrap;flex:none">
        <button class="tbtn" id="cpPadrao" title="Tira as exceções desta classe (contorno, espessura, hachura, linha…); a cor continua">Usar o padrão da camada</button>
        <button class="tbtn" id="cpCompleta">Propriedades da camada…</button>
        <div style="flex:1"></div><button class="tbtn" id="cpOk" style="background:var(--amber);color:#1a1206;font-weight:600">Fechar</button></div></div>`;
    const body=m.querySelector('#cpBody');el=body.querySelector('.cls');
    const nome=m.querySelector('#cpNome');
    if(nome){
      /* renomear é explícito (botão/Enter): cada troca regrava o campo em todas as feições */
      const renomeia=()=>{
        if(t)aplica();
        if(typeof renameCategorizedClassCore!=='function')return;
        const r=renameCategorizedClassCore(L,ci,nome.value);
        if(!r.ok){if(!r.unchanged)toast(r.msg);nome.value=rotulo;return;}
        rotulo=nomeDe();drawLayer(L);refreshUI();
        if(document.getElementById('attrPanel')?.classList.contains('open')&&typeof openAttr==='function')openAttr();
        try{if(typeof layoutSeVisivel==='function')layoutSeVisivel();}catch(_){}
        monta();
        toast('Classe “'+r.oldName+'” renomeada para “'+r.newName+'” em '+r.count+' feição(ões)');
      };
      m.querySelector('#cpRenomear').onclick=renomeia;
      nome.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();renomeia();}});
      /* o nome não entra na aplicação ao vivo do estilo */
      ['input','change'].forEach(tp=>nome.addEventListener(tp,e=>e.stopPropagation()));
    }
    el.classList.add('open');                          // única classe: editor já aberto
    const chev=el.querySelector('.chev2');if(chev)chev.style.display='none';
    clsBindEditors(body,()=>L);
    const ey=el.querySelector('.ceye');
    if(ey)ey.addEventListener('click',e=>{e.stopPropagation();c.vis=!(c.vis!==false);drawLayer(L);refreshUI();monta();});
    const vivo=()=>{clearTimeout(t);t=setTimeout(aplica,(L.features||[]).length>4000?200:90);};
    body.addEventListener('input',vivo);body.addEventListener('change',vivo);
    m.querySelector('#cpX').onclick=fecha;m.querySelector('#cpOk').onclick=fecha;
    m.querySelector('#cpPadrao').onclick=()=>{clearTimeout(t);t=null;CLS_PROPRIOS.forEach(k=>delete c[k]);
      window.GeoMineFeatureStyleBrush?.resetLayer(L,{predicate:f=>classOf(L,f)===c});
      drawLayer(L);refreshUI();monta();toast('Classe “'+rotulo+'” segue o padrão da camada; a cor continua');};
    m.querySelector('#cpCompleta').onclick=()=>{fecha();S.activeId=L.id;openLayerProps(L);};
  };
  monta();m.classList.add('on');
}
/* Grava numa classe (categoria ou faixa) o que está no seu editor. */
function clsLerEditor(el,c,L){
  const read=sel=>{const e=el.querySelector(sel);return e?e.value:undefined;};
  c.color=read('.ce-color'); c.stroke=read('.ce-stroke');
  const h=read('.ce-hatch'); if(h!==undefined) c.hatch=h;
  const hs=read('.ce-hatch-scale'); if(hs!==undefined) c.hatchScale=Math.max(.25,Math.min(8,+hs||1));
  c.weight=+read('.ce-weight');
  const fl=read('.ce-fill'); if(fl!==undefined) c.fill=+fl;
  const dh=read('.ce-dash'); if(dh!==undefined) c.dash=dh;
  const ar=read('.ce-arrow-end'),az=read('.ce-arrow-size');
  if(ar!==undefined){if(ar==='inherit')delete c.arrowEnd;else c.arrowEnd=GeoMineLineArrows.style({arrowEnd:ar}).arrowEnd;}
  if(az!==undefined){if(az.trim()==='')delete c.arrowSize;else c.arrowSize=GeoMineLineArrows.style({arrowSize:az}).arrowSize;}
  if(L.gtype==='point'){ const sh=read('.ce-shape'); if(sh!==undefined) c.shape=sh;
    const own=el.querySelector('.ce-size-own'),sz=read('.ce-size');
    if(own){if(own.checked&&sz!==undefined)c.size=ptSizePx(sz,ptCfg(L).size);else delete c.size;}
    else if(sz!==undefined)c.size=ptSizePx(sz,ptCfg(L).size);
    const pp=ptParamsFromEditor(el); if(Object.keys(pp).length)c.symbolParams=pp;else delete c.symbolParams; }
}
function lpCollect(silencioso){
  const L=lpLayer; if(!L) return; const s=L.sym;
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){
    if(!silencioso)collabCanEditLayer(L,true);
    return;
  }
  const before=layerStyleAppearanceStamp(L);
  const rows=[...document.querySelectorAll('#lpClasses .cls')];
  const read=(el,sel)=>{const e=el.querySelector(sel);return e?e.value:undefined;};
  const isPt=L.gtype==='point';
  if(L.gtype==='line'){
    const controls=document.getElementById('lpClasses'),mode=read(controls,'.lp-arrow-end'),size=read(controls,'.lp-arrow-size');
    if(mode!==undefined){const a=GeoMineLineArrows.style({arrowEnd:mode,arrowSize:size});s.arrowEnd=a.arrowEnd;s.arrowSize=a.arrowSize;}
  }
  if(s.mode==='grad'&&s.classes.length || s.mode==='cat'&&s.cats.length){
    const arr=s.mode==='grad'?s.classes:s.cats;
    rows.forEach(el=>{ const c=arr[+el.dataset.i]; if(c) clsLerEditor(el,c,L); });
  } else {
    const el=rows[0]; if(el){
      s.color=read(el,'.ce-color'); s.stroke=read(el,'.ce-stroke');
      const h=read(el,'.ce-hatch'); if(h!==undefined) s.hatch=h;
      const hs=read(el,'.ce-hatch-scale'); if(hs!==undefined) s.hatchScale=Math.max(.25,Math.min(8,+hs||1));
      s.weight=+read(el,'.ce-weight');
      const fl=read(el,'.ce-fill'); if(fl!==undefined) s.fill=+fl;
      const dh=read(el,'.ce-dash'); if(dh!==undefined) s.dash=dh;
      if(isPt){ const cfg=ptCfg(L);
        const sh=read(el,'.ce-shape'); if(sh!==undefined) cfg.shape=sh;
        const sz=read(el,'.ce-size'); if(sz!==undefined) cfg.size=ptSizePx(sz,cfg.size);
        const pp=ptParamsFromEditor(el); if(Object.keys(pp).length)cfg.symbolParams=pp;else delete cfg.symbolParams; }
      L.color=s.color; L.weight=s.weight; L.fill=s.fill; }
  }
  if(isPt){ const cfg=ptCfg(L);
    const rf=document.getElementById('lpRotField'); if(rf) cfg.rotField=rf.value;
    const df=document.getElementById('lpDipField'); if(df) cfg.dipField=df.value;
    const rr=document.getElementById('lpRotFix');   if(rr) cfg.rot=+rr.value||0; }
  if(isPt && s.mode==='cat' && window.GeoMinePointSymbols)
    window.GeoMinePointSymbols.rememberLayer(L);
  /* Abrir propriedades, rotular ou filtrar não mexe nas exceções. Alterar a
     simbologia (ou confirmar Aplicar) devolve as feições ao estilo da camada. */
  if(!silencioso||layerStyleAppearanceStamp(L)!==before)window.GeoMineFeatureStyleBrush?.resetLayer(L);
  drawLayer(L); refreshUI(); renderClassList();
  document.getElementById('lpInfo').innerHTML=lpInfoHTML(L);
  lpPointSizeSync(L);
  if(!silencioso) toast('Simbologia aplicada');
}

/* ============================================================================
   APLICAÇÃO AO VIVO NA JANELA DE PROPRIEDADES
   Mexeu na cor, na espessura, no preenchimento, na hachura ou no rótulo, o
   mapa muda na hora — sem passar pelo "Aplicar". O botão continua ali para
   quem quiser confirmar (e para o toast), mas deixou de ser obrigatório.
   Duas precauções: um atraso curto agrupa a enxurrada de eventos do seletor
   de cor (que dispara a cada pixel arrastado), e em camada MUITO grande o
   atraso cresce, para o redesenho não engasgar o arrasto.
   ========================================================================== */
let _lpVivoT=null;
function lpAplicaVivo(qual){
  const L=lpLayer; if(!L) return;
  const n=(L.features||[]).length;
  const espera = n>20000 ? 400 : n>4000 ? 200 : 90;
  clearTimeout(_lpVivoT);
  _lpVivoT=setTimeout(()=>{
    try{
      if(lpLayer!==L||!S.layers.includes(L))return;
      if(qual==='rotulo'){
        lpReadLabels(); drawLayer(L); refreshUI(); lpPreview();
        const st=document.getElementById('stLabel');
        if(st && S.activeId===L.id) st.value=L.labelField||'';
      }else{
        lpCollect(true);                       // silencioso: sem toast a cada ajuste
      }
      layoutSeVisivel();                       // a prancha acompanha, se estiver aberta
    }catch(e){}
  }, espera);
}
{
  const modal=document.getElementById('lpModal');
  if(modal){
    /* Delegação: pega também os controles das CLASSES, que são recriados a
       cada renderLpClasses() — ligar um por um perderia os novos. */
    const ehRotulo=el=>!!(el.id&&/^lb/.test(el.id));
    const trata=e=>{
      const el=e.target; if(!el||!el.id&&!el.className) return;
      if(el.id==='lpRename') return;           // nome só muda no botão Renomear
      if(ehRotulo(el)) return lpAplicaVivo('rotulo');
      if(el.closest && el.closest('#lpClasses')) return lpAplicaVivo('simb');
      if(el.id==='lpRotField'||el.id==='lpDipField'||el.id==='lpRotFix') return lpAplicaVivo('simb');
    };
    modal.addEventListener('input',trata);
    modal.addEventListener('change',trata);
  }
}
document.getElementById('lpClose').onclick=()=>document.getElementById('lpModal').classList.remove('on');

document.getElementById('lpModal').addEventListener('click',e=>{
  const button=e.target.closest('[data-feature-style-reset]');if(!button)return;
  e.preventDefault();const L=lpLayer;if(!L)return;
  const n=window.GeoMineFeatureStyleBrush?.resetLayer(L)||0;
  if(!n)return;
  drawLayer(L);refreshUI();layoutSeVisivel();
  document.getElementById('lpInfo').innerHTML=lpInfoHTML(L);
  bindFeatureContinue(document.getElementById('lpInfo'),L);
  window.GeoMineGeology?.boreholeProperties?.bindLayerActions(document.getElementById('lpInfo'),L);
  toast('Estilo da camada restaurado em '+n+' feição(ões)');
});
document.getElementById('lpRenameBtn').onclick=()=>{
  const L=lpLayer; if(!L) return;
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);return;}
  const n=document.getElementById('lpRename').value.trim();
  if(!n){ toast('Informe um nome'); return; }
  L.name=n; document.getElementById('lpName').textContent=n;
  refreshUI(); toast('Camada renomeada para "'+n+'"');
};
document.getElementById('lpRename').addEventListener('keydown',e=>{
  if(e.key==='Enter') document.getElementById('lpRenameBtn').click(); });
function deleteRaster(r){
  undoPush({t:'raster', r, idx:S.rasters.indexOf(r)});
  r.demHD=false;
  try{ if(typeof syncDemTiles==='function') syncDemTiles(r); }catch(e){}
  if(r.overlay) map.removeLayer(r.overlay);
  S.rasters=S.rasters.filter(q=>q.id!==r.id);
  S.stack=(S.stack||[]).filter(k=>k!==('R:'+r.id));
  if(S.hidro && S.hidro.dem===r.d){
    S.hidro.dem=null;
    const o=document.getElementById('hDemOut');
    if(o) o.innerHTML='MDE removido — carregue outro.';
    ['btnFill','btnShade','btnRaw','btnD8Dir','btnD8Acc','btnStreams','btnBasin'].forEach(id=>{
      const b=document.getElementById(id); if(b) b.disabled=true; });
  }
  refreshUI();
  if(document.getElementById('sideV3d').style.display!=='none') refresh3DPanel();
  { const sg=document.getElementById('sideGeo'); if(sg && sg.style.display!=='none'){ refreshCotPanel(); refreshEstPanel(); refreshTinClip(); } }
  { const sc=document.getElementById('sideCub'); if(sc && sc.style.display!=='none') refreshCubPanel(); }
  if(typeof refreshProfPanel==='function' &&
     document.getElementById('sidePerfis').style.display!=='none') refreshProfPanel();
  toast('Superfície "'+r.name+'" removida');
}
S.undo=S.undo||[];
/* A cava paramétrica mantém snapshots próprios, enquanto os comandos CAD
   usam S.undo. O contador comum permite ao Ctrl+Z escolher a ação realmente
   mais recente entre as duas pilhas (sem ressuscitar cedo uma camada que foi
   apagada antes de novos desenhos). */
function undoNextOrder(){
  const agora=Date.now();
  S._undoOrder=Math.max(Number(S._undoOrder)||0,agora)+1;
  return S._undoOrder;
}
function undoPush(a){
  if(a&&a._undoOrd==null)a._undoOrd=undoNextOrder();
  if(a&&a._ts==null)a._ts=Date.now();
  S.undo.push(a); if(S.undo.length>30) S.undo.shift();
}
function doUndo(){
  // prioridade 1: vértice do traçado em andamento
  if(['line','poly'].includes(S.tool) && S.drawBuf.length){
    const L=GeoMineDrawingSession.layer();if(L&&typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);return;}
    S.drawBuf.pop();if(S.drawBuf.length)redrawDraw();else clearDraw();
    toast(S.drawBuf.length? 'Vértice desfeito ('+S.drawBuf.length+' restantes)':'Traçado limpo');
    return;
  }
  const proxima=S.undo[S.undo.length-1];
  if(proxima?.t==='linejoin'&&window.GeoMineLineJoin){GeoMineLineJoin.undo(proxima);return;}
  if(proxima?.t==='featurestylebrush'&&window.GeoMineFeatureStyleBrush){GeoMineFeatureStyleBrush.undo(proxima);return;}
  if(proxima?.t==='layerstyletransfer'&&window.GeoMineStyleTransfer){GeoMineStyleTransfer.undo(proxima);return;}
  if(proxima?.t==='vectorresult'&&window.GeoMineVectorDestination){GeoMineVectorDestination.undo(proxima);return;}
  if(proxima?.t==='floodresult'&&window.GeoMineNativeFloodDestination){GeoMineNativeFloodDestination.undo(proxima);return;}
  if(proxima?.t==='channelresult'&&window.GeoMineChannelDestination){GeoMineChannelDestination.undo(proxima);return;}
  if(proxima?.t==='featsplit'&&window.GeoMinePolygonSplit){GeoMinePolygonSplit.undo(proxima);return;}
  if(proxima&&proxima.L&&typeof collabCanEditLayer==='function'&&!collabCanEditLayer(proxima.L,false)){collabCanEditLayer(proxima.L,true);return;}
  if(proxima?.t==='dimensionstyle'&&window.GeoMineDimensions){GeoMineDimensions.undoStyle(proxima);return;}
  const a=S.undo.pop();
  if(!a){ toast('Nada para desfazer'); return; }
  if(a.t==='attrfieldsdelete'){attrUndoDeleteFields(a);return;}
  if(a.t==='feat'){
    const i=a.L.features.indexOf(a.feat);
    if(i>=0){ a.L.features.splice(i,1); drawLayer(a.L); refreshUI(); toast('Feição desfeita ("'+a.L.name+'")'); }
    else doUndo();                                     // já removida por outro caminho: pula
  } else if(a.t==='geom'){
    a.f.geom=a.geom; a.f.multi=a.multi;
    if(Object.prototype.hasOwnProperty.call(a,'zg')) a.f.zg=a.zg;
    if(Object.prototype.hasOwnProperty.call(a,'thalweg')){
      if(a.thalweg===undefined)delete a.f._thalweg;else a.f._thalweg=a.thalweg;
    }
    drawLayer(a.L);
    if(typeof edRedraw==='function') edRedraw();
    if(typeof edPainelSync==='function') edPainelSync();
    /* limites paramétricos acompanham a volta (cava/rampa por bancada) */
    if(typeof cavaLiveSync==='function')try{cavaLiveSync();}catch(_){}
    /* edição de vértices aberta nesta feição: marcadores voltam juntos */
    if(S._vtxCtx&&S._vtxCtx.f===a.f&&typeof showVertices==='function'){
      S._vtxSelPreserve=true;showVertices();
    }
    refreshUI(); toast('Desfeito: '+(a.msg||'geometria'));
  } else if(a.t==='geomlote'){
    /* um gesto de mover = uma entrada, mesmo com feições de várias camadas */
    const todos=(a.itens||[]).filter(i=>i&&i.L&&i.f);
    const itens=todos.filter(i=>S.layers.includes(i.L)&&i.L.features.includes(i.f));
    const travada=itens.find(i=>typeof collabCanEditLayer==='function'&&!collabCanEditLayer(i.L,false));
    if(travada){ S.undo.push(a); collabCanEditLayer(travada.L,true); return; }
    /* não desfaz a ação anterior por conta própria quando as feições sumiram */
    if(!itens.length){ toast('Desfazer mover: as feições movidas não existem mais (apagadas ou recriadas); nada foi alterado'); return; }
    const faltam=todos.length-itens.length;
    const camadas=new Set();
    itens.forEach(i=>{
      i.f.geom=i.geom; i.f.multi=i.multi;
      if(i.temZg) i.f.zg=i.zg; else delete i.f.zg;
      if(i.temHachuras) i.f.cadHatches=i.cadHatches; else delete i.f.cadHatches;
      /* cota CAD: âncoras do texto e das extremidades voltam junto */
      if(i.ancoras&&i.f.props) Object.assign(i.f.props,i.ancoras);
      camadas.add(i.L);
    });
    camadas.forEach(L=>drawLayer(L));
    if(typeof edRedraw==='function') edRedraw();
    if(typeof edPainelSync==='function') edPainelSync();
    try{ if(typeof highlightSel==='function') highlightSel(); }catch(_){}
    try{ if(typeof mselHL==='function'&&S.msel&&S.msel.items&&S.msel.items.length) mselHL(); }catch(_){}
    if(typeof cavaLiveSync==='function')try{cavaLiveSync();}catch(_){}
    if(S._vtxCtx&&itens.some(i=>i.f===S._vtxCtx.f)&&typeof showVertices==='function'){
      S._vtxSelPreserve=true;showVertices();
    }
    refreshUI(); toast('Desfeito: '+(a.msg||'mover')+(faltam?' — '+faltam+' feição(ões) não puderam ser restauradas':''));
  } else if(a.t==='featadd'||a.t==='featmove'){
    /* copiar/mover para outra camada: sai a camada criada para as feições, ou
       somente elas (e os campos acrescentados) na camada que já existia; ao
       mover, cada feição volta à sua posição original na camada de origem */
    const camadas=[a.L,...(a.sources||[]).map(s=>s.L)];
    const travada=camadas.find(L=>S.layers.includes(L)&&typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false));
    if(travada){ S.undo.push(a); collabCanEditLayer(travada,true); return; }
    if(S.selFeat&&camadas.some(L=>S.selFeat.layer===L||S.selFeat.layerId===L.id)){ S.selFeat=null; try{highlightSel();}catch(e){} }
    if((S.msel&&S.msel.items||[]).some(i=>camadas.some(L=>i.layerId===L.id))) mselClear(true);
    if(a.created){
      if(a.L.llayer)try{map.removeLayer(a.L.llayer);}catch(e){}
      S.layers=S.layers.filter(x=>x!==a.L);
      if(S.stack)S.stack=S.stack.filter(x=>x!=='L:'+a.L.id);
      if(S.activeId===a.L.id)S.activeId=S.layers.length?S.layers[0].id:null;
    } else {
      for(const f of a.feats){ const i=a.L.features.indexOf(f); if(i>=0) a.L.features.splice(i,1); }
      if(a.fields) a.L.fields=a.fields;
      drawLayer(a.L);
    }
    for(const s of a.sources||[]){
      for(const op of s.ops.slice().sort((x,y)=>x.idx-y.idx)){
        if(op.whole) s.L.features.splice(Math.min(op.idx,s.L.features.length),0,op.before);
        else { const i=s.L.features.indexOf(op.after); if(i>=0) s.L.features[i]=op.before; }
      }
      drawLayer(s.L);
    }
    refreshUI();zApply();
    const oque=a.t==='featmove'?'Movimento':'Cópia';
    toast(a.created?oque+' desfeito(a): camada "'+a.L.name+'" removida':oque+' desfeito(a) em "'+a.L.name+'"');
  } else if(a.t==='featdel'){
    a.L.features.splice(Math.min(a.idx??a.L.features.length, a.L.features.length),0,a.feat);
    drawLayer(a.L); refreshUI(); toast('Feição restaurada em "'+a.L.name+'"');
  } else if(a.t==='featpart'){
    if(a.L.features[a.idx]){
      a.L.features[a.idx]=a.before;
      drawLayer(a.L);refreshUI();toast('Parte geométrica restaurada em "'+a.L.name+'"');
    }
  } else if(a.t==='hatch'){
    a.f.cadHatches=a.old&&a.old.length?a.old:undefined;
    drawLayer(a.L); refreshUI(); toast('Hachura desfeita');
  } else if(a.t==='layeradd'){
    if(a.L.llayer)try{map.removeLayer(a.L.llayer);}catch(e){}
    S.layers=S.layers.filter(x=>x!==a.L);
    if(S.activeId===a.L.id)S.activeId=S.layers.length?S.layers[0].id:null;
    refreshUI();zApply();toast('Camada de hachura desfeita');
  } else if(a.t==='mseldel'){
    a.rem.slice().sort((x,y)=>x.idx-y.idx).forEach(r=>{
      a.L.features.splice(Math.min(r.idx, a.L.features.length),0,r.feat); });
    drawLayer(a.L); refreshUI();
    toast(a.rem.length+' feição(ões) restaurada(s) em "'+a.L.name+'"');
  } else if(a.t==='mselmixdel'){
    a.ops.slice().sort((x,y)=>x.idx-y.idx).forEach(o=>{
      if(o.whole)a.L.features.splice(Math.min(o.idx,a.L.features.length),0,o.before);
      else if(a.L.features[o.idx])a.L.features[o.idx]=o.before;
    });
    drawLayer(a.L);refreshUI();toast('Feições/partes restauradas em "'+a.L.name+'"');
  } else if(a.t==='layer'){
    S.layers.splice(Math.min(a.idx??0,S.layers.length),0,a.L);
    if(a.L.visible && a.L.llayer) a.L.llayer.addTo(map);
    drawLayer(a.L); S.activeId=a.L.id;
    /* Uma Cava/DCE é uma entidade única: camada, aba e receita do motor.
       O mesmo Ctrl+Z que restaura a camada recompõe também esse conjunto. */
    try{if(a.cava2Delete&&window.CCMGISCava2?.restoreLayerDeletion)
      window.CCMGISCava2.restoreLayerDeletion(a.cava2Delete,a.L);}catch(e){console.warn('restauração Cava/DCE',e);}
    refreshUI(); zApply();
    toast('Camada restaurada: "'+a.L.name+'"');
  } else if(a.t==='raster'){
    S.rasters.splice(Math.min(a.idx??0,S.rasters.length),0,a.r);
    renderRaster(a.r); refreshUI();
    toast('Superfície restaurada: "'+a.r.name+'"');
  } else if(a.t==='image'){
    S.img=a.img;
    if(a.img&&a.img.overlay&&a.img.visible!==false)try{a.img.overlay.addTo(map);}catch(e){}
    S.stack=S.stack||[];S.stack.splice(Math.max(0,a.stackIdx??S.stack.length),0,'I:0');
    refreshUI();zApply();toast('Imagem de fundo restaurada');
  } else if(a.t==='geom'){
    a.feat.geom=a.geom; a.feat.multi=a.multi;
    drawLayer(a.L); refreshUI(); toast('Geometria restaurada');
  }
}
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){
    const tag=(document.activeElement&&document.activeElement.tagName)||'';
    if(tag==='INPUT'||tag==='TEXTAREA') return;        // não roubar o undo de campos de texto
    // desenhando drenagem: Ctrl+Z remove o ÚLTIMO ponto do traçado em andamento
    if(S.tool==='dren' && S._drenBuf && S._drenBuf.length){
      e.preventDefault();
      S._drenBuf.pop();
      drenRedrawTmp();
      cmdLog(S._drenBuf.length? `desfez o último ponto (${S._drenBuf.length} restante${S._drenBuf.length>1?'s':''})` : 'traçado vazio','info');
      return;
    }
    e.preventDefault(); doUndo();
  }
});
function deleteVectorLayer(L){
  if(!L) return;
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);return;}
  try{
    const cs=window.GeoMineCollaboration&&window.GeoMineCollaboration.snapshot&&window.GeoMineCollaboration.snapshot();
    if(cs&&cs.roomId){toast('A exclusão compartilhada de camadas ainda não está disponível. Saia da sala para remover somente da cópia local.');return;}
  }catch(e){}
  let cava2Delete=null;
  try{cava2Delete=window.CCMGISCava2?.beforeLayerDelete?.(L)||null;}catch(e){console.warn('snapshot Cava/DCE',e);}
  undoPush({t:'layer', L, idx:S.layers.indexOf(L),cava2Delete});
  if(L.llayer) map.removeLayer(L.llayer);
  S.layers=S.layers.filter(l=>l.id!==L.id);
  /* Apagar a camada publicada deve apagar também o desenho editável e sua
     aba; caso contrário o próximo evento do motor republicaria a camada. */
  try{if(cava2Delete&&window.CCMGISCava2?.onLayerDeleted)
    window.CCMGISCava2.onLayerDeleted(L,cava2Delete);}catch(e){console.warn('remoção Cava/DCE',e);}
  /* CAMADA DA PILHA APAGADA = ESTADO MORTO: o S._rb31 em memória guardava
     todas as bancadas; qualquer "Gerar" depois redesenhava a camada apagada
     inteira ("ele volta com a camada que estava apagada"). Se a camada é a
     uni, o limite ou a fonte do estado corrente, o estado morre junto. */
  try{
    const st=S._rb31;
    if(st&&(
      (st.lays&&Object.keys(st.lays).some(k=>st.lays[k]===L))||
      String(st.srcLayerId)===String(L.id)||
      (L._rb31Recipe&&st.srcLayerId!=null&&
        String(L._rb31Recipe.srcLayerId)===String(st.srcLayerId))||
      (L._cavaLimiteDin&&String(st.srcLayerId)===String(L.id))
    ))S._rb31=null;
  }catch(e){}
  if(S.activeId===L.id) S.activeId=S.layers.length? S.layers[0].id : null;
  if(S.selFeat && S.selFeat.layerId===L.id){ S.selFeat=null; clearVertices(); }
  refreshUI();
  if(typeof refreshTinPanel==='function' &&
     document.getElementById('sideGeo').style.display!=='none') refreshTinPanel();
  /* seletor de limite da cava era uma FOTOGRAFIA de quando o painel abriu:
     camadas apagadas continuavam listadas ("ainda estão na memória"). */
  try{ if(typeof refreshCavaMineracao==='function')refreshCavaMineracao(); }catch(e){}
  toast('Camada "'+L.name+'" removida');
}
/* Exportador de UMA camada — usado tanto pelo menu "Exportar ▾" quanto pelo
   botão "Salvar" do modal de propriedades. Antes eram dois blocos separados que
   saíram de sincronia: um oferecia KML mas não tratava, o outro tratava mas não
   oferecia. Agora é um só. */
async function exportLayerAs(L){
  if(!L) { toast('Sem camada ativa'); return; }
  if(L.gtype==='polygon')autoAreaSyncLayer(L);
  const choice=prompt(
    `Exportar "${L.name}" como:\n`+
    `  1 = Shapefile (.zip)\n`+
    `  2 = GeoJSON\n`+
    `  3 = KML (Google Earth)\n`+
    `  4 = DXF 3D (cotas Z por vértice)\n\n`+
    `Opcional: informe também o CRS de saída (código EPSG).\n`+
    `Ex.: "1 4326" = shapefile em WGS84.  Enter = ${S.workCRS}.\n`+
    `O KML é sempre WGS84; o DXF 3D usa o CRS atual do projeto.`, '1');
  if(choice==null) return;
  const parts=choice.trim().split(/\s+/);
  const kind=parts[0];
  let tgt=S.workCRS;
  if(parts[1]){
    const c=parts[1].toUpperCase().startsWith('EPSG') ? parts[1].toUpperCase() : 'EPSG:'+parts[1];
    if(CRS_DEFS[c]) tgt=c; else toast('CRS '+c+' desconhecido — usando '+S.workCRS);
  }
  const base=L.name.replace(/[^\w.-]+/g,'_')||'camada';
  if(kind==='2'){
    download(new Blob([JSON.stringify(layerToGeoJSON(L),null,1)],{type:'application/json'}), base+'.geojson');
    toast('GeoJSON exportado');
  } else if(kind==='3'){
    download(new Blob([layerToKML(L)],{type:'application/vnd.google-earth.kml+xml'}), base+'.kml');
    toast('KML exportado (WGS84)');
  } else if(kind==='4'){
    const dxf=dxfFromLayers([L]);
    download(new Blob([dxf],{type:'application/dxf'}), base+'_3D.dxf');
    toast('DXF 3D exportado · '+S.workCRS+' · cotas Z preservadas');
  } else if(kind==='1'){
    await exportLayer(L, tgt);
    toast('Shapefile exportado · '+tgt);
  } else { toast('Opção inválida'); }
}

document.getElementById('lpSave').onclick=()=>exportLayerAs(lpLayer);
document.getElementById('lpDel').onclick=()=>{
  if(!lpLayer) return;
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(lpLayer,false)){collabCanEditLayer(lpLayer,true);return;}
  if(!confirm('Remover a camada "'+lpLayer.name+'" ('+lpLayer.features.length+' feições)?\nEsta ação não pode ser desfeita.')) return;
  document.getElementById('lpModal').classList.remove('on');
  deleteVectorLayer(lpLayer); lpLayer=null;
};
document.getElementById('lpApply').onclick=()=>{ lpCollect(); layoutSeVisivel(); };
document.getElementById('lpZoom').onclick=()=>{ if(lpLayer) fitLayer(lpLayer); document.getElementById('lpModal').classList.remove('on'); };
document.getElementById('lpAttr').onclick=()=>{ if(!lpLayer) return;
  S.activeId=lpLayer.id; document.getElementById('lpModal').classList.remove('on');
  if(window.matchMedia('(max-width:720px)').matches) document.getElementById('right').classList.remove('open');
  openAttr(); };
document.getElementById('lpMode').addEventListener('change',()=>{
  if(!lpLayer) return;
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(lpLayer,false)){collabCanEditLayer(lpLayer,true);lpSyncCtrl();return;}
  const mode=document.getElementById('lpMode').value,changed=lpLayer.sym.mode!==mode;
  lpLayer.sym.mode=mode;
  if(changed){window.GeoMineFeatureStyleBrush?.resetLayer(lpLayer);drawLayer(lpLayer);refreshUI();}
  lpSyncCtrl(); renderLpClasses(); syncSymPanel(); });
document.getElementById('btnLpClassify').onclick=()=>{
  if(!lpLayer) return;
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(lpLayer,false)){collabCanEditLayer(lpLayer,true);return;}
  const ok=classifyCore(lpLayer, lpLayer.sym.mode,
    document.getElementById('lpField').value,
    +document.getElementById('lpNCls').value,
    document.getElementById('lpMethod').value,
    document.getElementById('lpRamp').value);
  if(ok){ renderLpClasses(); document.getElementById('lpInfo').innerHTML=lpInfoHTML(lpLayer); syncSymPanel(); }
};
document.getElementById('btnLpPointSymbols').onclick=()=>{
  if(!lpLayer||!window.GeoMinePointSymbols)return;
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(lpLayer,false)){collabCanEditLayer(lpLayer,true);return;}
  const n=window.GeoMinePointSymbols.applyToLayer(lpLayer,{force:true});
  window.GeoMineFeatureStyleBrush?.resetLayer(lpLayer);
  renderLpClasses();drawLayer(lpLayer);refreshUI();renderClassList();layoutSeVisivel();
  document.getElementById('lpInfo').innerHTML=lpInfoHTML(lpLayer);
  toast(n?`${n} categoria${n===1?'':'s'} associada${n===1?'':'s'} à biblioteca de símbolos`:'Nenhum valor conhecido na biblioteca');
};
function lpApplyPointSizeAll(){
  const L=lpLayer,inp=document.getElementById('lpPtSize');
  if(!L||L.gtype!=='point'||!inp)return;
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);return;}
  const n=lpPointSizeSetAll(L,inp.value);
  window.GeoMineFeatureStyleBrush?.resetLayer(L);
  inp.value=String(ptCfg(L).size);
  if(L.sym.mode==='cat'&&window.GeoMinePointSymbols)window.GeoMinePointSymbols.rememberLayer(L);
  renderLpClasses();drawLayer(L);refreshUI();renderClassList();layoutSeVisivel();lpPointSizeSync(L);
  toast(`Tamanho geral de ${ptCfg(L).size} px aplicado a ${n} categoria${n===1?'':'s'}`);
}
{ const b=document.getElementById('lpPtSizeAll'),inp=document.getElementById('lpPtSize');
  if(b)b.onclick=lpApplyPointSizeAll;
  if(inp){inp.addEventListener('change',lpApplyPointSizeAll);inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();lpApplyPointSizeAll();}});}
}
document.getElementById('lpModal').addEventListener('click',e=>{ if(e.target.id==='lpModal') document.getElementById('lpModal').classList.remove('on'); });

/* ============================================================================
   CAD — desenho de precisão (aba Mapa)
   Entrada por coordenadas (absoluta, relativa, azimute+distância topográfico),
   modo ORTO, offset paralelo com junção em canto (miter) e exportação DXF R12.
   Tudo em metros no CRS de trabalho.
   ========================================================================== */
S.orthoOn=false; S.snapVtxOn=true; S.snapMidOn=false; S.snapEndOn=false; S.snapNearOn=true; S.snapCenterOn=true; S.snapEscopo='todas';

/* --- parser da entrada: "E,N" | "@dx,dy" | "@dist<az" | "dist<az" --- */
function cadParse(txt, last){
  const t=String(txt).trim().replace(',',',');   // vírgula decimal tratada abaixo
  const num=v=>parseFloat(String(v).replace(/\s/g,'').replace(',','.'));
  let m;
  if((m=t.match(/^@?\s*([-\d.,]+)\s*<\s*([-\d.,]+)$/))){          // polar: dist<azimute
    if(!last) return {err:'polar exige um vértice anterior'};
    const d=num(m[1]), az=num(m[2]);
    if(!isFinite(d)||!isFinite(az)) return {err:'polar inválida'};
    const rad=az*Math.PI/180;                                     // azimute: 0°=Norte, horário
    return {E:last[0]+d*Math.sin(rad), N:last[1]+d*Math.cos(rad)};
  }
  if((m=t.match(/^@\s*([-\d.,]+)[;\s]+([-\d.,]+)$/)) || (m=t.match(/^@\s*([-\d.,]+),([-\d.,]+)$/))){ // relativa
    if(!last) return {err:'relativa exige um vértice anterior'};
    const dx=num(m[1]), dy=num(m[2]);
    if(!isFinite(dx)||!isFinite(dy)) return {err:'relativa inválida'};
    return {E:last[0]+dx, N:last[1]+dy};
  }
  // absoluta: aceita "E,N" "E;N" "E N" (com decimais por ponto ou vírgula+espaço)
  const parts=t.split(/[;\s]+|,(?=\s)/).filter(Boolean);
  let E,N;
  if(parts.length>=2){ E=num(parts[0]); N=num(parts[1]); }
  else { const p2=t.split(','); if(p2.length===2){ E=num(p2[0]); N=num(p2[1]); } }
  if(isFinite(E)&&isFinite(N)) return {E,N};
  return {err:'formato: E,N · @dx,dy · @dist<azimute'};
}
function cadLastWork(){
  if(S.drawBuf&&S.drawBuf.length){
    const q=S.drawBuf[S.drawBuf.length-1];
    return fromWGS(S.workCRS,q[1],q[0]);
  }
  return S._cadLast||null;
}
function cadInsert(){
  const inp=document.getElementById('cadCoord');
  const r=cadParse(inp.value, cadLastWork());
  if(r.err){ toast('⚠ '+r.err); return; }
  const w=toWGS(S.workCRS,r.E,r.N);
  if(!wgsOK(w)){ toast('⚠ Coordenada fora do domínio do CRS de trabalho'); return; }
  const L=activeLayer();
  if(S.tool==='point'){
    if(!L||L.gtype!=='point'){ toast('Ative a ferramenta • com uma camada de pontos'); return; }
    addFeature(L,[[w[1],w[0]]]); S._cadLast=[r.E,r.N];
  } else if(S.tool==='line'||S.tool==='poly'){
    if(!GeoMineDrawingSession.acquire())return;
    S.drawBuf.push([w[1],w[0]]); redrawDraw();
    undoPush({t:'vtx'});
  } else { toast('Escolha antes a ferramenta • ⟋ ⬠ (o destino é perguntado ao ativar)'); return; }
  const out=document.getElementById('cadEcho');
  if(out) out.textContent=`→ E ${r.E.toFixed(3)}  N ${r.N.toFixed(3)}`+
    (S.drawBuf.length>1?`  ·  ${S.drawBuf.length} vértices`:'');
  inp.value=''; inp.focus();
}
/* --- ORTO: restringe o clique ao eixo dominante a partir do último vértice --- */
function orthoAdjust(ll){
  const last=S.drawBuf?.at(-1);
  return GeoMineOrtho.resolve(ll,{anchor:last?L2.latLng(last):null,crs:GeoMineDrawingSession.layer()?.crs||S.workCRS,snap:false}).latlng;
}
/* --- OFFSET paralelo (miter com proteção; d>0 = esquerda do sentido) --- */
function offsetRing(pts, d, closed){
  const n=pts.length; if(n<2) return null;
  const segs=[];
  const N=closed? n : n-1;
  for(let i=0;i<N;i++){
    const a=pts[i], b=pts[(i+1)%n];
    const dx=b[0]-a[0], dy=b[1]-a[1], len=Math.hypot(dx,dy);
    if(len<1e-9) continue;
    const nx=-dy/len, ny=dx/len;                       // normal à esquerda
    segs.push({a:[a[0]+nx*d, a[1]+ny*d], b:[b[0]+nx*d, b[1]+ny*d]});
  }
  if(!segs.length) return null;
  const inter=(s1,s2)=>{
    const x1=s1.a[0],y1=s1.a[1],x2=s1.b[0],y2=s1.b[1];
    const x3=s2.a[0],y3=s2.a[1],x4=s2.b[0],y4=s2.b[1];
    const den=(x1-x2)*(y3-y4)-(y1-y2)*(x3-x4);
    if(Math.abs(den)<1e-9) return null;                // paralelos: bevel
    const t=((x1-x3)*(y3-y4)-(y1-y3)*(x3-x4))/den;
    return [x1+t*(x2-x1), y1+t*(y2-y1)];
  };
  const MITER=Math.abs(d)*8;                           // limite p/ pontas explosivas
  const out=[];
  const M=segs.length;
  const jointAt=(i)=>{                                 // junção entre seg i e i+1
    const s1=segs[i], s2=segs[(i+1)%M];
    const p=inter(s1,s2);
    if(p && Math.hypot(p[0]-s1.b[0],p[1]-s1.b[1])<=MITER) return [p];
    return [s1.b, s2.a];                               // bevel
  };
  if(closed){
    for(let i=0;i<M;i++) jointAt(i).forEach(p=>out.push(p));
  } else {
    out.push(segs[0].a);
    for(let i=0;i<M-1;i++) jointAt(i).forEach(p=>out.push(p));
    out.push(segs[M-1].b);
  }
  return out;
}
function cadOffset(){
  if(!S.selFeat){ toast('Toque numa feição de linha/polígono primeiro'); return; }
  const {layer:L,idx}=S.selFeat; const f=L.features[idx];
  if(!f||L.gtype==='point'){ toast('Offset vale para linhas e polígonos'); return; }
  let d=parseFloat(String(document.getElementById('cadOffD').value).replace(',','.'));
  if(!isFinite(d)||d===0){ toast('Distância inválida'); return; }
  if(document.getElementById('cadOffSide').value==='dir') d=-d;   // direita = normal negada
  const ring0=(f.multi&&Array.isArray(f.geom[0][0]))? f.geom[0] : f.geom;
  const w=ring0.map(pt=>reproj(L.crs,S.workCRS,pt[0],pt[1]));
  const closed=L.gtype==='polygon';
  const pts=closed && Math.hypot(w[0][0]-w[w.length-1][0], w[0][1]-w[w.length-1][1])<1e-9
    ? w.slice(0,-1) : w;
  const off=offsetRing(pts, d, closed);
  if(!off||off.length<2){ toast('Não foi possível gerar o offset'); return; }
  if(closed) off.push([off[0][0],off[0][1]]);
  // resultado no CRS da CAMADA (para conviver com as demais feições dela)
  const back=off.map(p=>reproj(S.workCRS,L.crs,p[0],p[1]));
  const props={}; (L.fields||[]).forEach(fd=>props[fd.name]=fd.type==='N'||fd.type==='F'?0:'');
  if(props.FID!==undefined) props.FID=L.features.length;
  const nf={geom:back, multi:false, props};
  L.features.push(nf);
  undoPush({t:'feat',L,feat:nf});
  drawLayer(L); refreshUI();
  toast(`Offset de ${Math.abs(d).toFixed(2)} m gerado (${off.length} vértices)`);
}
/* --------------------------------------------------------------------------
   HACHURA CAD VETORIAL
   Gera retas paralelas no CRS métrico de trabalho e recorta por paridade
   contra todos os anéis do polígono. A mesma rotina, portanto, respeita ilhas,
   polígonos multipartes e furos sem preencher áreas que deveriam ficar vazias.
   -------------------------------------------------------------------------- */
function cadHatchModal(){
  let bg=document.getElementById('cadHatchModal');
  if(bg)return bg;
  bg=document.createElement('div');bg.id='cadHatchModal';bg.className='modal-bg';
  bg.innerHTML=`<div class="modal" style="width:min(590px,95vw)">
    <div class="modal-h"><b>▨ Hachura CAD</b><div style="flex:1"></div>
      <button class="tbtn" id="cadHatchX" title="Fechar">✕</button></div>
    <div class="modal-b">
      <div class="hout" id="cadHatchSource">Nenhum polígono selecionado.</div>
      <div class="row2" style="margin-top:8px">
        <div><label class="field">Definir o contorno</label><select id="cadHatchOrigin">
          <option value="selected">Usar a feição selecionada</option>
          <option value="inside">Clicar dentro do polígono</option>
        </select></div>
        <div><label class="field">Destino</label><select id="cadHatchDest">
          <option value="new">Nova camada de linhas</option>
          <option value="same">Na própria feição/camada</option>
        </select></div>
      </div>
      <div class="row3" style="margin-top:8px">
        <div><label class="field">Ângulo (°)</label><input id="cadHatchAngle" type="number" value="45" step="1"></div>
        <div><label class="field">Espaçamento (m)</label><input id="cadHatchSpacing" type="number" value="5" min="0.001" step="0.5"></div>
        <div><label class="field">Espessura</label><input id="cadHatchWeight" type="number" value="1" min="0.25" max="12" step="0.25"></div>
      </div>
      <div class="row2" style="margin-top:8px">
        <div><label class="field">Cor</label><input id="cadHatchColor" type="color" value="#f5a524"></div>
        <div><label class="field">Nome da nova camada</label><input id="cadHatchName" value="Hachura CAD"></div>
      </div>
      <label class="field" style="display:flex;align-items:center;gap:8px;margin-top:9px;cursor:pointer">
        <input id="cadHatchCross" type="checkbox" style="width:auto;accent-color:var(--amber)"> Cruzada (segunda direção a 90°)
      </label>
      <label class="field" style="display:flex;align-items:center;gap:8px;margin-top:5px;cursor:pointer">
        <input id="cadHatchReplace" type="checkbox" checked style="width:auto;accent-color:var(--amber)"> Substituir a hachura vinculada existente
      </label>
      <div class="hint" style="margin-top:8px">O ângulo é medido no plano: 0° = horizontal (Leste–Oeste) e 90° = vertical. Furos do polígono permanecem vazios. Ctrl+Z desfaz.</div>
      <button class="tbtn" id="cadHatchOk" style="width:100%;justify-content:center;margin-top:12px;background:var(--amber);color:#1a1206;font-weight:700">Criar hachura</button>
    </div></div>`;
  document.body.appendChild(bg);
  bg.querySelector('#cadHatchX').onclick=()=>bg.classList.remove('on');
  bg.addEventListener('click',e=>{if(e.target===bg)bg.classList.remove('on');});
  bg.querySelector('#cadHatchOk').onclick=cadHatchStart;
  return bg;
}
function cadHatchOpen(){
  const bg=cadHatchModal(),sf=S.selFeat,
    ok=sf&&sf.layer&&sf.layer.gtype==='polygon'&&sf.layer.features[sf.idx];
  const out=bg.querySelector('#cadHatchSource');
  out.innerHTML=ok?`Selecionado: <b>${esc(sf.layer.name)}</b> · feição #${sf.idx+1}`:
    'Nenhum polígono selecionado — escolha “clicar dentro” ou selecione uma feição primeiro.';
  bg.querySelector('#cadHatchOrigin').value=ok?'selected':'inside';
  bg.classList.add('on');
}
function cadHatchCfg(){
  const q=id=>document.getElementById(id),num=id=>parseFloat(String(q(id).value).replace(',','.'));
  return {origin:q('cadHatchOrigin').value,dest:q('cadHatchDest').value,
    angle:num('cadHatchAngle'),spacing:num('cadHatchSpacing'),weight:num('cadHatchWeight'),
    color:q('cadHatchColor').value||'#f5a524',name:q('cadHatchName').value.trim()||'Hachura CAD',
    cross:q('cadHatchCross').checked,replace:q('cadHatchReplace').checked};
}
function cadHatchRingsWork(L,f){
  const src=(f.multi&&Array.isArray(f.geom&&f.geom[0]&&f.geom[0][0]))?f.geom:[f.geom];
  return src.filter(r=>Array.isArray(r)&&r.length>=3).map(r=>{
    const w=r.map(p=>reproj(L.crs,S.workCRS,p[0],p[1]));
    if(w.length>3&&Math.hypot(w[0][0]-w.at(-1)[0],w[0][1]-w.at(-1)[1])<1e-7)w.pop();
    return w;
  }).filter(r=>r.length>=3);
}
function cadHatchScan(rings,angle,spacing){
  const a=((angle%180)+180)%180*Math.PI/180,d=[Math.cos(a),Math.sin(a)],n=[-d[1],d[0]];
  let mn=Infinity,mx=-Infinity;
  rings.forEach(r=>r.forEach(p=>{const s=p[0]*n[0]+p[1]*n[1];if(s<mn)mn=s;if(s>mx)mx=s;}));
  const first=Math.ceil((mn-1e-8)/spacing),last=Math.floor((mx+1e-8)/spacing),count=last-first+1;
  if(count>20000)throw new Error(`Espaçamento muito pequeno: seriam ${count.toLocaleString('pt-BR')} linhas. Use pelo menos ${((mx-mn)/20000).toFixed(3)} m.`);
  const out=[],eps=Math.max(1e-8,spacing*1e-8);
  for(let k=first;k<=last;k++){
    const c=k*spacing,ts=[];
    rings.forEach(r=>{
      for(let i=0,j=r.length-1;i<r.length;j=i++){
        const p=r[j],q=r[i],sp=p[0]*n[0]+p[1]*n[1],sq=q[0]*n[0]+q[1]*n[1];
        /* regra semiaberta: vértice tocado conta uma vez, evitando pares falsos */
        if(!((sp<=c&&sq>c)||(sq<=c&&sp>c)))continue;
        const u=(c-sp)/(sq-sp),x=p[0]+(q[0]-p[0])*u,y=p[1]+(q[1]-p[1])*u;
        ts.push(x*d[0]+y*d[1]);
      }
    });
    ts.sort((x,y)=>x-y);
    const t=[];ts.forEach(v=>{if(!t.length||Math.abs(v-t.at(-1))>eps)t.push(v);});
    for(let i=0;i+1<t.length;i+=2)if(t[i+1]-t[i]>eps)out.push([
      [d[0]*t[i]+n[0]*c,d[1]*t[i]+n[1]*c],
      [d[0]*t[i+1]+n[0]*c,d[1]*t[i+1]+n[1]*c]]);
  }
  return out;
}
function cadHatchCreate(L,idx,cfg){
  const f=L&&L.features&&L.features[idx];
  if(!f||L.gtype!=='polygon'){toast('A hachura exige uma feição poligonal');return;}
  if(!Number.isFinite(cfg.angle)||!(cfg.spacing>0)||!(cfg.weight>0)){toast('Revise ângulo, espaçamento e espessura');return;}
  const rings=cadHatchRingsWork(L,f);if(!rings.length){toast('Polígono sem anéis válidos');return;}
  let segs;
  try{segs=cadHatchScan(rings,cfg.angle,cfg.spacing);
    if(cfg.cross)segs=segs.concat(cadHatchScan(rings,cfg.angle+90,cfg.spacing));}
  catch(e){toast(e.message||String(e));return;}
  if(!segs.length){toast('Nenhuma linha pôde ser criada dentro do polígono');return;}
  if(cfg.dest==='same'){
    const old=Array.isArray(f.cadHatches)?JSON.parse(JSON.stringify(f.cadHatches)):[];
    undoPush({t:'hatch',L,f,old});
    const back=segs.map(s=>s.map(p=>reproj(S.workCRS,L.crs,p[0],p[1]))),
      h={segments:back,angle:cfg.angle,spacing:cfg.spacing,cross:cfg.cross,color:cfg.color,weight:cfg.weight,opacity:1};
    f.cadHatches=cfg.replace?[h]:(old.concat([h]));
    drawLayer(L);refreshUI();S.activeId=L.id;S.selFeat={layer:L,layerId:L.id,idx};highlightSel();
    toast(`${segs.length.toLocaleString('pt-BR')} segmento(s) de hachura vinculados a “${L.name}”`);
  }else{
    const back=segs.map(s=>s.map(p=>reproj(S.workCRS,L.crs,p[0],p[1]))),
      props={TIPO:'Hachura CAD',ORIGEM:L.name,ANGULO:cfg.angle,ESPACO_M:cfg.spacing,CRUZADA:cfg.cross?'Sim':'Não'},
      nf={geom:back,multi:true,props},
      out=addLayer({name:cfg.name,gtype:'line',crs:L.crs,features:[nf],color:cfg.color,
        fields:[{name:'TIPO',type:'C',length:24},{name:'ORIGEM',type:'C',length:80},
          {name:'ANGULO',type:'N',length:12,decimal:3},{name:'ESPACO_M',type:'N',length:12,decimal:3},
          {name:'CRUZADA',type:'C',length:5}]});
    out.weight=cfg.weight;out.sym.weight=cfg.weight;out.sym.stroke=cfg.color;out.sym.color=cfg.color;
    drawLayer(out);refreshUI();undoPush({t:'layeradd',L:out});
    toast(`${segs.length.toLocaleString('pt-BR')} segmento(s) criados em “${out.name}”`);
  }
}
function cadHatchFindAt(latlng){
  for(const L of (S.layers||[])){
    if(L.visible===false||L.gtype!=='polygon')continue;
    const p=fromWGS(L.crs,latlng.lng,latlng.lat);
    for(let i=(L.features||[]).length-1;i>=0;i--){
      const f=L.features[i];if(!f||!featureVisible(L,f))continue;
      const rings=(f.multi&&Array.isArray(f.geom&&f.geom[0]&&f.geom[0][0]))?f.geom:[f.geom];
      let inside=false;rings.forEach(r=>{if(r&&r.length>=3&&pointInRing(p[0],p[1],r))inside=!inside;});
      if(inside)return{L,idx:i};
    }
  }
  return null;
}
/* A escolha do polígono fica armada até acertar um polígono ou Esc. Antes o
   clique no mapa era "once": errando o alvo, ele se desarmava mas a captura
   das feições (S._pickCadHatch) ficava presa para sempre — todo clique em
   linha respondia "Clique dentro de um polígono" e nada mais era selecionado. */
function cadHatchDesarma(){
  if(S._cadHatchMapHandler)try{map.off('click',S._cadHatchMapHandler);}catch(e){}
  S._cadHatchMapHandler=null;S._pickCadHatch=null;
}
function cadHatchArmPick(cfg){
  cadHatchDesarma();
  let done=false;
  const finish=(L,idx)=>{if(done)return;done=true;cadHatchDesarma();cadHatchCreate(L,idx,cfg);};
  S._pickCadHatch=(L,idx)=>{if(L.gtype!=='polygon'){toast('Clique dentro de um polígono — Esc cancela a hachura');return;}finish(L,idx);};
  S._cadHatchMapHandler=e=>{const hit=cadHatchFindAt(e.latlng);if(hit)finish(hit.L,hit.idx);else toast('Nenhum polígono nesse ponto — clique dentro de um polígono ou Esc para cancelar');};
  map.on('click',S._cadHatchMapHandler);
  S._pickCancel=()=>{if(S._pickCadHatch||S._cadHatchMapHandler){cadHatchDesarma();toast('Hachura cancelada');}};
  setTool('select');toast('Clique dentro do polígono que receberá a hachura (Esc cancela)');
}
function cadHatchStart(){
  const cfg=cadHatchCfg(),bg=document.getElementById('cadHatchModal');
  if(bg)bg.classList.remove('on');
  if(cfg.origin==='inside'){cadHatchArmPick(cfg);return;}
  const sf=S.selFeat;if(!sf||!sf.layer||sf.layer.gtype!=='polygon'){toast('Selecione primeiro uma feição poligonal');return;}
  cadHatchCreate(sf.layer,sf.idx,cfg);
}
/* Ícone próprio no mesmo padrão vetorial da ribbon. */
(function cadHatchIcon(){window.addEventListener('DOMContentLoaded',()=>{try{RIB_SVG.hachura='<svg viewBox="0 0 32 32" fill="none"><title>Hachura CAD</title><defs><linearGradient id="al3_hatch_g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD27A"/><stop offset="1" stop-color="#F57C00"/></linearGradient></defs><path d="M5 8l11-4 11 6-3 16H8z" fill="white" stroke="#173B57" stroke-width="1.4"/><path d="M7 12l7-7M6 18L19 5M7 24L24 7M12 27l14-14M19 26l6-6" stroke="url(#al3_hatch_g)" stroke-width="1.8"/><path d="M5 8l11-4 11 6-3 16H8z" stroke="#173B57" stroke-width="1.4"/></svg>';}catch(e){}});})();
/* --- DXF R12 (POLYLINE/VERTEX/SEQEND + POINT), metros no CRS de trabalho --- */
function dxfSan(n){ return String(n).replace(/[^\w\-]/g,'_').slice(0,31)||'CAMADA'; }
function dxfFromLayers(Ls){
  const pt=v=>(+v).toFixed(3);
  /* DXF 3D: cada vértice sai com a sua cota — zg[i] quando a feição tem
     z por vértice (linha de centro, bordas da pista, interseção), depois
     geom[i][2], depois a cota constante (COTA/Z/ELEV), senão 0. */
  const num=v=>{const n=+v;return isFinite(n)?n:null;};
  const zCteDe=f=>{const p=f.props||{};
    return num(p.COTA)??num(p.Z)??num(p.ELEV)??num(p.COTA_INI)??0;};
  let ents='';
  const layNames=new Set();
  Ls.forEach(L=>{
    const lay=dxfSan(L.name); layNames.add(lay);
    L.features.forEach(f=>{
      if(!f.geom) return;
      if(window.GeoMineDimensions?.isFeature(L,f))ents+=GeoMineDimensions.dxfText(L,f);
      const zCte=zCteDe(f);
      if(L.gtype==='point'){
        f.geom.forEach((p0,i)=>{
          const p=reproj(L.crs,S.workCRS,p0[0],p0[1]),
            z=(f.zg&&isFinite(+f.zg[i]))?+f.zg[i]:
              (p0.length>2&&isFinite(+p0[2])?+p0[2]:zCte);
          ents+=`0\nPOINT\n8\n${lay}\n10\n${pt(p[0])}\n20\n${pt(p[1])}\n30\n${pt(z)}\n`;
        });
      } else {
        const nested=!!(f.multi&&Array.isArray(f.geom[0][0])),
          rings=nested?f.geom:[f.geom];
        rings.forEach((r0,ri)=>{
          /* zg alinhado só quando cobre o anel inteiro (feição de anel único) */
          const zs=typeof resolveFeatureZRing==='function'?
            resolveFeatureZRing(f,r0,ri,nested,true):
            ((!f.multi&&Array.isArray(f.zg)&&f.zg.length===r0.length)?f.zg:null);
          const closed=L.gtype==='polygon'||(r0.length>3&&
            Math.abs(r0[0][0]-r0[r0.length-1][0])<1e-7&&
            Math.abs(r0[0][1]-r0[r0.length-1][1])<1e-7);
          // com flag de fechada, o DXF não repete o 1º vértice no fim
          const dup=closed && r0.length>1 &&
            Math.abs(r0[0][0]-r0[r0.length-1][0])<1e-9 && Math.abs(r0[0][1]-r0[r0.length-1][1])<1e-9;
          const r=dup? r0.slice(0,-1) : r0;
          /* 70: bit 8 = polilinha 3D; bit 1 = fechada */
          ents+=`0\nPOLYLINE\n8\n${lay}\n66\n1\n70\n${8|(closed?1:0)}\n`;
          r.forEach((p0,i)=>{
            const p=reproj(L.crs,S.workCRS,p0[0],p0[1]),
              z=(zs&&isFinite(+zs[i]))?+zs[i]:
                (p0.length>2&&isFinite(+p0[2])?+p0[2]:zCte);
            ents+=`0\nVERTEX\n8\n${lay}\n10\n${pt(p[0])}\n20\n${pt(p[1])}\n30\n${pt(z)}\n70\n32\n`;
          });
          ents+=`0\nSEQEND\n`;
        });
      }
    });
  });
  let tbl='';
  layNames.forEach(n=>{ tbl+=`0\nLAYER\n2\n${n}\n70\n0\n62\n7\n6\nCONTINUOUS\n`; });
  return `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n`+
    `0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n${layNames.size}\n${tbl}0\nENDTAB\n${window.GeoMineDimensions?.dxfStyles(Ls)||''}0\nENDSEC\n`+
    `0\nSECTION\n2\nENTITIES\n${ents}0\nENDSEC\n0\nEOF\n`;
}
function cadExportDXF(){
  const scope=document.getElementById('cadDxfScope').value;
  const Ls=scope==='ativa'? [activeLayer()].filter(Boolean)
         : S.layers.filter(l=>l.visible);
  if(!Ls.length){ toast('Nenhuma camada para exportar'); return; }
  const dxf=dxfFromLayers(Ls);
  download(new Blob([dxf],{type:'application/dxf'}), 'alagis.dxf');
  toast(`DXF: ${Ls.length} camada(s), CRS ${CRS_LABELS[S.workCRS]||S.workCRS} (metros)`);
}
/* --- Aparar / estender / unir linhas contra uma feição de referência --- */
S.cadRef=null;                                   // {layerId, idx}
function cadRefFeat(){
  if(!S.cadRef) return null;
  const L=S.layers.find(l=>String(l.id)===String(S.cadRef.layerId));
  if(!L) return null;
  const f=L.features[S.cadRef.idx];
  return f? {L,f} : null;
}
function cadRefSync(){
  const el=document.getElementById('cadRefInfo'); if(!el) return;
  const r=cadRefFeat();
  el.innerHTML = r
    ? 'Referência: <b>'+esc(r.L.name)+'</b> · feição #'+(S.cadRef.idx+1)
    : 'Sem referência. Selecione a feição de corte (◈) e toque em “Definir referência”.';
}
function cadSetRef(){
  if(!S.selFeat){ toast('Selecione no mapa a feição de referência (◈)'); return; }
  const L=S.selFeat.layer;
  if(L.gtype==='point'){ toast('A referência precisa ser linha ou polígono'); return; }
  S.cadRef={layerId:L.id, idx:S.selFeat.idx}; cadRefSync();
  toast('Referência definida — agora selecione a linha a editar');
}
function cadWorldRing(L,f){
  const ring=(f.multi&&Array.isArray(f.geom[0][0]))? f.geom[0] : f.geom;
  return ring.map(p=>reproj(L.crs,S.workCRS,p[0],p[1]));
}
function cadRefSegs(){
  const r=cadRefFeat(); if(!r) return null;
  const rings=(r.f.multi&&Array.isArray(r.f.geom[0][0]))? r.f.geom : [r.f.geom];
  const segs=[];
  rings.forEach(rg=>{
    const w=rg.map(p=>reproj(r.L.crs,S.workCRS,p[0],p[1]));
    for(let i=0;i<w.length-1;i++) segs.push([w[i],w[i+1]]);
    if(r.L.gtype==='polygon' && w.length>2 &&
       Math.hypot(w[0][0]-w[w.length-1][0], w[0][1]-w[w.length-1][1])>1e-9)
      segs.push([w[w.length-1], w[0]]);            // fecha o anel
  });
  return segs;
}
/* cruzamento de p1->p2 com q1->q2; allowExt permite t fora de [0,1] (prolongamento) */
function cadCross(p1,p2,q1,q2,allowExt){
  const d1x=p2[0]-p1[0], d1y=p2[1]-p1[1], d2x=q2[0]-q1[0], d2y=q2[1]-q1[1];
  const den=d1x*d2y-d1y*d2x; if(Math.abs(den)<1e-12) return null;   // paralelas
  const t=((q1[0]-p1[0])*d2y-(q1[1]-p1[1])*d2x)/den;
  const u=((q1[0]-p1[0])*d1y-(q1[1]-p1[1])*d1x)/den;
  if(u<-1e-9||u>1+1e-9) return null;               // fora do segmento de referência
  if(!allowExt && (t<-1e-9||t>1+1e-9)) return null;
  return {t, pt:[p1[0]+t*d1x, p1[1]+t*d1y]};
}
function cadPtSegDist(p,a,b){
  const dx=b[0]-a[0], dy=b[1]-a[1], q=dx*dx+dy*dy;
  let t = q? ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/q : 0;
  t=Math.max(0,Math.min(1,t));
  return Math.hypot(p[0]-(a[0]+t*dx), p[1]-(a[1]+t*dy));
}
function cadLineSel(needRef){
  if(!S.selFeat){ toast('Selecione a linha a editar (◈)'); return null; }
  const L=S.selFeat.layer, f=L.features[S.selFeat.idx];
  if(!f || L.gtype!=='line'){ toast('Aparar/estender/unir valem para linhas'); return null; }
  if(f.multi&&Array.isArray(f.geom[0][0]) && f.geom.length>1){
    toast('Feição multiparte — separe as partes antes'); return null; }
  if(needRef && S.cadRef && String(S.cadRef.layerId)===String(L.id) && S.cadRef.idx===S.selFeat.idx){
    toast('A linha selecionada é a própria referência'); return null; }
  return {L,f};
}
function cadEndChoice(w, segs){
  const v=document.getElementById('cadEnd').value;
  if(v!=='auto') return v;
  const dmin=p=>segs.reduce((m,s)=>Math.min(m,cadPtSegDist(p,s[0],s[1])),Infinity);
  return dmin(w[w.length-1])<=dmin(w[0]) ? 'fim' : 'ini';
}
function cadApplyGeom(L,f,w,msg){
  const lim=w.filter((p,i)=>i===0||Math.hypot(p[0]-w[i-1][0],p[1]-w[i-1][1])>1e-6);
  if(lim.length<2){ toast('A operação deixaria a linha sem geometria'); return; }
  undoPush({t:'geom', L, feat:f, geom:JSON.parse(JSON.stringify(f.geom)), multi:!!f.multi});
  f.geom=lim.map(p=>reproj(S.workCRS,L.crs,p[0],p[1])); f.multi=false;
  drawLayer(L); refreshUI();
  if(typeof highlightSel==='function') try{ highlightSel(); }catch(e){}
  toast(msg);
}
function cadTrim(){
  const sel=cadLineSel(true); if(!sel) return;
  const segs=cadRefSegs(); if(!segs||!segs.length){ toast('Defina a referência primeiro'); return; }
  const w=cadWorldRing(sel.L, sel.f);
  const end=cadEndChoice(w, segs);
  const hits=[];
  for(let i=0;i<w.length-1;i++) for(const s of segs){
    const c=cadCross(w[i],w[i+1],s[0],s[1],false);
    if(c) hits.push({pos:i+c.t, i, pt:c.pt});
  }
  if(!hits.length){ toast('A linha não cruza a referência — use Estender'); return; }
  const h = end==='fim' ? hits.reduce((a,b)=>b.pos>a.pos?b:a)
                        : hits.reduce((a,b)=>b.pos<a.pos?b:a);
  const wN = end==='fim' ? w.slice(0,h.i+1).concat([h.pt])
                         : [h.pt].concat(w.slice(h.i+1));
  cadApplyGeom(sel.L, sel.f, wN, 'Linha aparada no cruzamento ('+(end==='fim'?'final':'início')+')');
}
function cadExtend(){
  const sel=cadLineSel(true); if(!sel) return;
  const segs=cadRefSegs(); if(!segs||!segs.length){ toast('Defina a referência primeiro'); return; }
  const w=cadWorldRing(sel.L, sel.f);
  if(w.length<2){ toast('Linha com vértices insuficientes'); return; }
  const end=cadEndChoice(w, segs);
  const A = end==='fim' ? w[w.length-2] : w[1];
  const B = end==='fim' ? w[w.length-1] : w[0];
  let best=null;
  for(const s of segs){
    const c=cadCross(A,B,s[0],s[1],true);
    if(c && c.t>1+1e-9 && (!best || c.t<best.t)) best=c;
  }
  if(!best){ toast('O prolongamento desta extremidade não encontra a referência'); return; }
  const d=Math.hypot(best.pt[0]-B[0], best.pt[1]-B[1]);
  const wN = end==='fim' ? w.concat([best.pt]) : [best.pt].concat(w);
  cadApplyGeom(sel.L, sel.f, wN, 'Linha estendida '+d.toFixed(2)+' m até a referência');
}
function cadJoin(){
  return GeoMineLineJoin.start();
}
function cadReverse(){
  const sel=cadLineSel(false); if(!sel) return;
  cadApplyGeom(sel.L, sel.f, cadWorldRing(sel.L, sel.f).slice().reverse(), 'Sentido da linha invertido');
}

/* ===========================================================================
   LIMPEZA DE DUPLICATAS
   Quatro coisas se acumulam num projeto que passou por várias importações:
   feições idênticas na mesma camada, vértices repetidos dentro da feição,
   camadas inteiras importadas duas vezes e superfícies repetidas. A função
   ANALISA primeiro e só apaga depois da confirmação — remoção silenciosa em
   projeto de cliente é pedir para perder dado.
   =========================================================================== */
function limChaveGeom(f, tol){
  const p=1/Math.max(tol||0.01, 1e-6);
  const rings=(f.multi&&Array.isArray(f.geom[0])&&Array.isArray(f.geom[0][0]))? f.geom : [f.geom];
  return rings.map(rg=>rg.map(q=>Math.round(q[0]*p)+','+Math.round(q[1]*p)).join(';')).join('|');
}
/* remove vértices consecutivos coincidentes; nunca deixa a feição inválida */
function limVertices(f, tol){
  const multi=(f.multi&&Array.isArray(f.geom[0])&&Array.isArray(f.geom[0][0]));
  const rings=multi? f.geom : [f.geom];
  let rem=0;
  const novos=rings.map(rg=>{
    const out=[];
    for(const q of rg){
      const u=out[out.length-1];
      if(u && Math.hypot(q[0]-u[0],q[1]-u[1])<=tol){ rem++; continue; }
      out.push(q);
    }
    return out.length>=2? out : rg;      // não destrói geometria degenerada
  });
  return {rem, geom: multi? novos : novos[0]};
}
function limCampo(base){                      // o bloco existe no CAD e no Geoproc
  const g=document.getElementById(base+'G'), c=document.getElementById(base);
  const vis=e=>e && e.offsetParent!==null;
  const el = vis(g)? g : (vis(c)? c : (g||c));
  return el? el.value : null;
}
function limAnalisa(){
  const tol=Math.max(0, parseFloat(String(limCampo('limTol')).replace(',','.'))||0.01);
  const esc=limCampo('limEsc')||'todas';
  const ativa=(typeof activeLayer==='function')? activeLayer() : null;
  const alvo = esc==='ativa' ? (ativa? [ativa] : []) : (S.layers||[]);
  if(!alvo.length) return {tol, vazio:true};
  const porCamada=[]; let totF=0, totV=0;
  const assinatura=new Map();
  alvo.forEach(L=>{
    const vistos=new Set(); const dup=[]; let vrem=0;
    (L.features||[]).forEach((f,i)=>{
      try{
        const k=limChaveGeom(f,tol);
        if(vistos.has(k)) dup.push(i); else vistos.add(k);
        const v=limVertices(f,tol); vrem+=v.rem;
      }catch(e){}
    });
    if(dup.length||vrem) porCamada.push({L, dup, vrem});
    totF+=dup.length; totV+=vrem;
    // assinatura da camada inteira, para achar camadas duplicadas
    const ass=L.gtype+'#'+(L.features||[]).length+'#'+
      [...vistos].slice(0,50).join('~');
    if(!assinatura.has(ass)) assinatura.set(ass,[]);
    assinatura.get(ass).push(L);
  });
  const camDup=[];
  assinatura.forEach(v=>{ if(v.length>1) camDup.push(v); });
  // superfícies repetidas: mesma geometria de grade
  const rMap=new Map(); const rasDup=[];
  (S.rasters||[]).forEach(r=>{
    const k=[r.d.nc,r.d.nr,r.d.cs.toFixed(6),r.d.xll.toFixed(3),r.d.yll.toFixed(3)].join('|');
    if(!rMap.has(k)) rMap.set(k,[]);
    rMap.get(k).push(r);
  });
  rMap.forEach(v=>{ if(v.length>1) rasDup.push(v); });
  return {tol, porCamada, totF, totV, camDup, rasDup};
}
function limAplica(a){
  let nf=0, nv=0, nc=0, nr=0;
  (a.porCamada||[]).forEach(({L,dup})=>{
    for(let i=dup.length-1;i>=0;i--){
      const f=L.features[dup[i]];
      if(!f) continue;
      undoPush({t:'featdel', L, feat:f, idx:dup[i]});
      L.features.splice(dup[i],1); nf++;
    }
    (L.features||[]).forEach(f=>{
      const v=limVertices(f, a.tol);
      if(v.rem){ f.geom=v.geom; nv+=v.rem; }
    });
    try{ drawLayer(L); }catch(e){}
  });
  (a.camDup||[]).forEach(grp=>{
    grp.slice(1).forEach(L=>{
      const i=S.layers.indexOf(L);
      if(i>=0){ undoPush({t:'layer', L, idx:i});
        try{ if(L.llayer) map.removeLayer(L.llayer); }catch(e){}
        S.layers.splice(i,1); nc++; }
    });
  });
  (a.rasDup||[]).forEach(grp=>{
    grp.slice(1).forEach(r=>{ try{ deleteRaster(r); nr++; }catch(e){} });
  });
  refreshUI();
  toast(`Limpeza: ${nf} feição(ões), ${nv} vértice(s), ${nc} camada(s) e ${nr} superfície(s) removidas`);
}
/* ---------- Limpeza: descartar linhas com comprimento menor que X m ----------
   Vive na mesma aba da remoção de duplicatas e usa o MESMO seletor de escopo.
   O comprimento é medido no CRS de trabalho (camada em CRS geográfico é
   reprojetada vértice a vértice); a soma para assim que passa do piso.      */
