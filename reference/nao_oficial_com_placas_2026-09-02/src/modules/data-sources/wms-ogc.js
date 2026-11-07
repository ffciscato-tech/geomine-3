
/* ============================================================================
   SERVIÇOS WMS / OGC — catálogo oficial, GetCapabilities e camadas no projeto
   ========================================================================== */
const WMS_CATALOG=[
  {provider:'IBGE',title:'IBGE — Geosserviços nacionais',url:'https://geoservicos.ibge.gov.br/geoserver/ows',
   keywords:'ibge cartografia limites territoriais geografia geociências mapas brasil'},
  {provider:'ANM',title:'ANM — SIGMINE / dados minerários',url:'https://geo.anm.gov.br/arcgis/services/SIGMINE/dados_anm/MapServer/WMSServer',
   keywords:'anm sigmine mineração processos minerários requerimentos títulos minas'},
  {provider:'ANM',title:'ANM — Barragens de mineração',url:'https://geo.anm.gov.br/arcgis/services/Producao/Barragens_Dashboard_Publico/MapServer/WMSServer',
   keywords:'anm barragens mineração segurança barragem'},
  {provider:'ANM',title:'ANM — Manchas de inundação de barragens',url:'https://geo.anm.gov.br/arcgis/services/Producao/Manchas_Inunda%C3%A7%C3%A3o_das_Barragens/MapServer/WMSServer',
   keywords:'anm barragens mancha inundação dam break'},
  {provider:'SGB / CPRM',title:'Serviço Geológico do Brasil — Geosserviços',url:'https://geoservicos.sgb.gov.br/geoserver/ows',
   keywords:'sgb cprm geologia recursos minerais geodiversidade hidrologia'},
  {provider:'ANA / SNIRH',title:'ANA — Sistema Nacional de Recursos Hídricos',url:'https://www.snirh.gov.br/arcgis/services/INDE/Camadas/MapServer/WMSServer',
   keywords:'ana snirh hidrografia rios bacias recursos hídricos'},
  {provider:'INDE',title:'INDE — Diretório Brasileiro de Dados Geoespaciais',url:'https://geoservicos.inde.gov.br/geoserver/ows',
   keywords:'inde dados geoespaciais brasil catálogo infraestrutura nacional'},
  {provider:'ICMBio / INDE',title:'ICMBio — Unidades de conservação',url:'https://geoservicos.inde.gov.br/geoserver/ICMBio/ows',
   keywords:'icmbio unidades conservação parques reservas meio ambiente'}
];
S.wms=S.wms||[];
let WMS_LAST_PROVIDER='', WMS_CAP_LAYERS=[];

function wmsNorm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function wmsStatus(msg,kind){
  const e=document.getElementById('wmsStatus'); if(!e)return;
  e.textContent=msg; e.style.color=kind==='err'?'#dc3636':kind==='ok'?'#18884b':'';
}
function wmsCatalogRender(query){
  const box=document.getElementById('wmsCatalogResults'); if(!box)return;
  const q=wmsNorm(query), found=WMS_CATALOG.filter(x=>!q||wmsNorm(x.provider+' '+x.title+' '+x.keywords).includes(q));
  box.innerHTML='';
  if(!found.length){
    box.innerHTML='<div class="hint">Nenhum servidor conhecido encontrado. Informe a URL abaixo para conectar manualmente.</div>';
    return;
  }
  found.forEach(x=>{
    const e=document.createElement('div'); e.className='wmsCard';
    e.innerHTML=`<b>🌐 ${esc(x.title)}</b><small>${esc(x.url)}</small>`;
    e.onclick=()=>{
      box.querySelectorAll('.wmsCard').forEach(n=>n.classList.remove('sel'));e.classList.add('sel');
      document.getElementById('wmsUrl').value=x.url; WMS_LAST_PROVIDER=x.provider;
      wmsStatus(`${x.provider} selecionado. Clique em “Conectar e listar camadas”.`);
    };
    box.appendChild(e);
  });
}
function wmsCapabilitiesUrl(base,version){
  const u=new URL(base,location.href);
  ['service','request','version'].forEach(k=>{u.searchParams.delete(k);u.searchParams.delete(k.toUpperCase());});
  u.searchParams.set('SERVICE','WMS');u.searchParams.set('REQUEST','GetCapabilities');u.searchParams.set('VERSION',version||'1.3.0');
  return u.href;
}
function wmsDirect(el,name){
  return Array.from(el.children||[]).find(n=>(n.localName||n.nodeName).split(':').pop()===name)||null;
}
function wmsText(el,name){
  const n=wmsDirect(el,name);return n?(n.textContent||'').trim():'';
}
function wmsParseCapabilities(txt){
  const xml=new DOMParser().parseFromString(txt,'text/xml');
  const pe=xml.querySelector('parsererror'); if(pe)throw new Error('Resposta XML inválida');
  const all=Array.from(xml.getElementsByTagNameNS('*','Layer'));
  const out=[],seen=new Set();
  all.forEach(el=>{
    const name=wmsText(el,'Name'); if(!name||seen.has(name))return;seen.add(name);
    out.push({name,title:wmsText(el,'Title')||name,abstract:wmsText(el,'Abstract')});
  });
  return out;
}
async function wmsConnect(){
  const base=(document.getElementById('wmsUrl').value||'').trim();
  if(!/^https?:\/\//i.test(base)){wmsStatus('Informe uma URL WMS completa, iniciando com http:// ou https://.','err');return;}
  const btn=document.getElementById('btnWmsConnect'), versions=[document.getElementById('wmsVersion').value];
  versions.push(versions[0]==='1.3.0'?'1.1.1':'1.3.0');
  btn.disabled=true;wmsStatus('Consultando GetCapabilities…');
  let lastErr=null;
  for(const version of versions){
    try{
      const r=await fetch(wmsCapabilitiesUrl(base,version),{mode:'cors',cache:'no-store'});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const layers=wmsParseCapabilities(await r.text());
      if(!layers.length)throw new Error('O servidor não informou camadas publicáveis');
      WMS_CAP_LAYERS=layers;document.getElementById('wmsVersion').value=version;
      document.getElementById('wmsCapabilities').style.display='';
      wmsLayerRender('');
      wmsStatus(`Conectado: ${layers.length} camada(s) disponível(is) · WMS ${version}.`,'ok');
      btn.disabled=false;return;
    }catch(e){lastErr=e;}
  }
  WMS_CAP_LAYERS=[];document.getElementById('wmsCapabilities').style.display='none';
  wmsStatus(`Não foi possível ler o catálogo (${lastErr&&lastErr.message||'bloqueio do servidor'}). Informe abaixo o nome técnico da camada para adicioná-la manualmente.`,'err');
  btn.disabled=false;
}
function wmsLayerRender(query){
  const box=document.getElementById('wmsLayerList');if(!box)return;
  const q=wmsNorm(query); box.innerHTML='';
  WMS_CAP_LAYERS.filter(x=>!q||wmsNorm(x.name+' '+x.title+' '+x.abstract).includes(q)).forEach((x,i)=>{
    const id='wmsCap_'+i+'_'+Math.random().toString(36).slice(2,6), e=document.createElement('label');
    e.className='wmsLayerChoice';e.title=x.abstract||x.title;
    e.innerHTML=`<input type="checkbox" value="${esc(x.name)}" data-title="${esc(x.title)}">
      <span><b>${esc(x.title)}</b><small>${esc(x.name)}</small></span>`;
    box.appendChild(e);
  });
  if(!box.children.length)box.innerHTML='<div class="hint" style="padding:8px">Nenhuma camada corresponde ao filtro.</div>';
}
function wmsBaseUrl(url){
  const u=new URL(url,location.href);
  ['service','request','version','layers','styles','format','transparent','bbox','width','height','crs','srs']
    .forEach(k=>{u.searchParams.delete(k);u.searchParams.delete(k.toUpperCase());});
  return u.href;
}
function wmsCreateLayer(meta,doRefresh=true){
  const o={id:meta.id||('W'+Date.now().toString(36)+Math.random().toString(36).slice(2,5)),
    name:meta.name||meta.layers||'Camada WMS',provider:meta.provider||'',url:wmsBaseUrl(meta.url),
    layers:meta.layers,version:meta.version||'1.3.0',opacity:Number(meta.opacity??0.85),
    visible:meta.visible!==false,attribution:meta.attribution||meta.provider||'WMS',llayer:null};
  o.llayer=L2.tileLayer.wms(o.url,{layers:o.layers,styles:'',format:'image/png',transparent:true,
    version:o.version,opacity:o.opacity,attribution:o.attribution,maxZoom:24,uppercase:true});
  o.llayer.on('tileerror',()=>{if(!o._warned){o._warned=true;wmsStatus(`O servidor não entregou algumas imagens de “${o.name}”. Verifique camada, CRS e disponibilidade.`,'err');}});
  if(o.visible)o.llayer.addTo(map);
  S.wms.push(o);wmsApplyOrder();
  if(doRefresh){refreshUI();toast(`WMS adicionado: ${o.name}`);}
  return o;
}
function wmsAddSelected(){
  const url=(document.getElementById('wmsUrl').value||'').trim();
  if(!/^https?:\/\//i.test(url)){wmsStatus('Escolha um servidor ou informe a URL WMS.','err');return;}
  const checks=Array.from(document.querySelectorAll('#wmsLayerList input:checked'));
  const manual=(document.getElementById('wmsManualLayer').value||'').trim();
  const chosen=checks.map(c=>({layers:c.value,name:c.dataset.title||c.value}));
  if(manual)chosen.push({layers:manual,name:manual});
  if(!chosen.length){wmsStatus('Marque ao menos uma camada ou informe o nome técnico manual.','err');return;}
  const version=document.getElementById('wmsVersion').value,opacity=Number(document.getElementById('wmsOpacity').value);
  chosen.forEach(x=>wmsCreateLayer({url,layers:x.layers,name:x.name,version,opacity,provider:WMS_LAST_PROVIDER},false));
  refreshUI();wmsStatus(`${chosen.length} camada(s) WMS adicionada(s) ao mapa.`,'ok');
  toast(`${chosen.length} camada(s) WMS adicionada(s)`);
}
function wmsApplyOrder(){
  (S.wms||[]).forEach((w,i)=>{if(w.llayer&&w.llayer.setZIndex)w.llayer.setZIndex(120+i);});
}
function wmsDelete(w){
  if(w.llayer)map.removeLayer(w.llayer);
  S.wms=S.wms.filter(x=>x!==w);refreshUI();
}
function wmsEdit(w){
  const n=prompt('Nome da camada WMS:',w.name);if(n===null)return;
  const op=prompt('Opacidade (0 a 1):',String(w.opacity));
  w.name=n.trim()||w.name;
  if(op!==null&&!isNaN(Number(op))){w.opacity=Math.max(0,Math.min(1,Number(op)));w.llayer.setOpacity(w.opacity);}
  refreshUI();
}
function wmsRenderRows(){
  const list=document.getElementById('layerList');if(!list)return;
  const q=wmsNorm(S._layerQuery||'');
  (S.wms||[]).forEach(w=>{
    if(q&&!wmsNorm(w.name+' '+w.provider+' '+w.layers).includes(q))return;
    const el=document.createElement('div');el.className='layer';
    el.innerHTML=`<span class="drag" title="Camada remota WMS">⠿</span>
      <span class="eye ${w.visible?'on':''}" title="Visibilidade">${w.visible?'◉':'○'}</span>
      <span class="wmsGlobe">◎</span><span class="nm">${esc(w.name)}</span>
      <span class="cnt">WMS</span><span class="lcfg" title="Nome e opacidade" style="cursor:pointer;padding:0 5px;opacity:.65">⚙</span>
      <span class="gdel wdel" title="Remover">✕</span>`;
    el.querySelector('.eye').onclick=e=>{e.stopPropagation();w.visible=!w.visible;
      if(w.visible)w.llayer.addTo(map);else map.removeLayer(w.llayer);wmsApplyOrder();refreshUI();};
    el.querySelector('.lcfg').onclick=e=>{e.stopPropagation();wmsEdit(w);};
    el.querySelector('.wdel').onclick=e=>{e.stopPropagation();if(confirm(`Remover a camada WMS “${w.name}”?`))wmsDelete(w);};
    el.ondblclick=()=>wmsEdit(w);list.appendChild(el);
  });
  const no=document.getElementById('noLayers');
  if(no&&(S.wms||[]).length)no.style.display='none';
}

/* ============================================================================
   ANM / SIGMINE — baixa o SHP oficial e recorta na extensão visível
   ========================================================================== */
const ANM_PROCESSOS_BASE='https://dadosabertos.anm.gov.br/SIGMINE/PROCESSOS_MINERARIOS/';
function anmUrl(){
  const uf=(document.getElementById('anmUF')||{}).value||'';
  return uf ? ANM_PROCESSOS_BASE+encodeURIComponent(uf)+'.zip' : ANM_PROCESSOS_BASE;
}
function anmStatus(msg,kind){
  const e=document.getElementById('anmStatus'); if(!e)return;
  e.textContent=msg;
  e.style.color=kind==='err'?'#dc3636':kind==='ok'?'#18884b':'';
}
function anmDirectAtualiza(){
  const a=document.getElementById('anmDirect'); if(a)a.href=anmUrl();
}
/* Extensão visível convertida para o CRS do SHP. Amostram-se bordas e centro,
   não só dois cantos, para o recorte continuar correto em projeções UTM. */
function anmRectVisivel(crs){
  const b=map.getBounds(), w=b.getWest(),e=b.getEast(),s=b.getSouth(),n=b.getNorth();
  const pts=[];
  [0,.5,1].forEach(ix=>[0,.5,1].forEach(iy=>{
    const p=fromWGS(crs,w+(e-w)*ix,s+(n-s)*iy);
    if(p&&isFinite(p[0])&&isFinite(p[1]))pts.push(p);
  }));
  if(!pts.length)throw new Error('Não foi possível converter a tela para o CRS da ANM');
  return {xmin:Math.min(...pts.map(p=>p[0])),xmax:Math.max(...pts.map(p=>p[0])),
          ymin:Math.min(...pts.map(p=>p[1])),ymax:Math.max(...pts.map(p=>p[1]))};
}
function anmGeomBBox(geom){
  let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;
  (function walk(v){
    if(!Array.isArray(v))return;
    if(v.length>=2&&isFinite(v[0])&&isFinite(v[1])){
      xmin=Math.min(xmin,+v[0]);xmax=Math.max(xmax,+v[0]);
      ymin=Math.min(ymin,+v[1]);ymax=Math.max(ymax,+v[1]);return;
    }
    v.forEach(walk);
  })(geom);
  return {xmin,ymin,xmax,ymax};
}
function anmBBoxToca(a,b){
  return a.xmax>=b.xmin&&a.xmin<=b.xmax&&a.ymax>=b.ymin&&a.ymin<=b.ymax;
}
/* Sutherland–Hodgman contra um retângulo: o limite resultante coincide
   matematicamente com a borda da tela, sem a aproximação serrilhada de raster. */
function anmClipRing(ring,R){
  if(!Array.isArray(ring)||ring.length<3)return null;
  let p=ring.slice();
  if(p.length>1&&p[0][0]===p[p.length-1][0]&&p[0][1]===p[p.length-1][1])p.pop();
  const edge=(arr,inside,cross)=>{
    const out=[]; if(!arr.length)return out;
    let A=arr[arr.length-1],Ai=inside(A);
    for(const B of arr){const Bi=inside(B);
      if(Bi){if(!Ai)out.push(cross(A,B));out.push(B);}
      else if(Ai)out.push(cross(A,B));
      A=B;Ai=Bi;
    }
    return out;
  };
  const vx=(A,B,x)=>{const d=B[0]-A[0],t=Math.abs(d)<1e-20?0:(x-A[0])/d;return [x,A[1]+(B[1]-A[1])*t];};
  const hy=(A,B,y)=>{const d=B[1]-A[1],t=Math.abs(d)<1e-20?0:(y-A[1])/d;return [A[0]+(B[0]-A[0])*t,y];};
  p=edge(p,q=>q[0]>=R.xmin,(a,b)=>vx(a,b,R.xmin));
  p=edge(p,q=>q[0]<=R.xmax,(a,b)=>vx(a,b,R.xmax));
  p=edge(p,q=>q[1]>=R.ymin,(a,b)=>hy(a,b,R.ymin));
  p=edge(p,q=>q[1]<=R.ymax,(a,b)=>hy(a,b,R.ymax));
  if(p.length<3)return null;
  const q=p[0];p.push([q[0],q[1]]);return p;
}
function anmClipFeature(f,R){
  const rings=(f.geom||[]).map(r=>anmClipRing(r,R)).filter(r=>r&&r.length>=4);
  if(!rings.length)return null;
  return {geom:rings,multi:true,props:f.props||{}};
}
function anmZipEntry(zip,ext,stem){
  const paths=Object.keys(zip.files).filter(p=>!zip.files[p].dir&&new RegExp('\\.'+ext+'$','i').test(p));
  if(!stem)return paths[0]||null;
  return paths.find(p=>p.replace(/^.*\//,'').replace(/\.[^.]+$/,'').toLowerCase()===stem)||null;
}
/* A ANM publica a camada vetorial no MapServer/0. O antigo FeatureServer e
   consultas com `where=1=1` são recusados pelo firewall atual (HTTP 403). */
const ANM_FEATURE_QUERY='https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/dados_anm/MapServer/0/query';
const ANM_IBGE_MALHA='https://servicodados.ibge.gov.br/api/v3/malhas/estados?formato=application/vnd.geo%2Bjson&qualidade=minima';
const ANM_IBGE_UF={11:'RO',12:'AC',13:'AM',14:'RR',15:'PA',16:'AP',17:'TO',
  21:'MA',22:'PI',23:'CE',24:'RN',25:'PB',26:'PE',27:'AL',28:'SE',29:'BA',
  31:'MG',32:'ES',33:'RJ',35:'SP',41:'PR',42:'SC',43:'RS',50:'MS',51:'MT',
  52:'GO',53:'DF'};
let ANM_MALHA_CACHE=null,ANM_DETECTANDO=null;
function anmPontoNoAnel(p,ring){
  let on=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];
    if(((a[1]>p[1])!==(b[1]>p[1]))&&
       p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1]+1e-30)+a[0])on=!on;
  }
  return on;
}
function anmPontoNaGeom(p,g){
  if(!g||!g.coordinates)return false;
  const pols=g.type==='Polygon'?[g.coordinates]:
    g.type==='MultiPolygon'?g.coordinates:[];
  return pols.some(poly=>poly.length&&anmPontoNoAnel(p,poly[0])&&
    !poly.slice(1).some(h=>anmPontoNoAnel(p,h)));
}
function anmSelecionaUF(uf){
  const s=document.getElementById('anmUF');if(!s||!uf)return;
  Array.from(s.options).forEach(o=>{
    if(o.dataset.anmBase)o.textContent=o.dataset.anmBase;
  });
  const o=Array.from(s.options).find(x=>x.value===uf);if(!o)return;
  if(!o.dataset.anmBase)o.dataset.anmBase=o.textContent;
  o.textContent=uf+' — detectado no centro do mapa';
  s.insertBefore(o,s.options[0]||null);s.value=uf;
  anmDirectAtualiza();
  anmStatus(`Estado do trabalho reconhecido: ${uf}. A consulta trará os processos completos que intersectam a tela.`);
}
async function anmDetectaUF(){
  if(ANM_DETECTANDO)return ANM_DETECTANDO;
  ANM_DETECTANDO=(async()=>{
    try{
      if(!ANM_MALHA_CACHE){
        const r=await fetch(ANM_IBGE_MALHA,{mode:'cors',cache:'force-cache'});
        if(!r.ok)throw new Error('IBGE HTTP '+r.status);
        ANM_MALHA_CACHE=await r.json();
      }
      const c=map.getCenter(),p=[c.lng,c.lat];
      const ft=(ANM_MALHA_CACHE.features||[]).find(f=>anmPontoNaGeom(p,f.geometry));
      if(!ft)return null;
      const pr=ft.properties||{},cod=Number(pr.codarea||pr.CD_UF||pr.codigo||ft.id);
      const uf=String(pr.sigla||pr.SIGLA_UF||ANM_IBGE_UF[cod]||'').toUpperCase();
      if(uf)anmSelecionaUF(uf);
      return uf||null;
    }catch(e){
      const s=document.getElementById('anmUF');
      if(s&&!s.value)anmStatus('Não foi possível reconhecer automaticamente a UF. Escolha-a manualmente; a consulta vetorial continua disponível.','err');
      return null;
    }finally{ANM_DETECTANDO=null;}
  })();
  return ANM_DETECTANDO;
}
function anmJsonp(url){
  return new Promise((resolve,reject)=>{
    const cb='__alagisAnm_'+Date.now().toString(36)+Math.random().toString(36).slice(2);
    const sc=document.createElement('script'),u=new URL(url);
    u.searchParams.set('f','json');u.searchParams.set('callback',cb);
    const fim=()=>{try{delete window[cb];}catch(e){window[cb]=undefined;}sc.remove();clearTimeout(tm);};
    window[cb]=v=>{fim();resolve(v);};
    sc.onerror=()=>{fim();reject(new Error('o serviço vetorial da ANM não respondeu'));};
    const tm=setTimeout(()=>{fim();reject(new Error('tempo esgotado no serviço da ANM'));},45000);
    sc.src=u.href;document.head.appendChild(sc);
  });
}
async function anmArcRequest(params){
  const u=new URL(ANM_FEATURE_QUERY);
  Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));
  u.searchParams.set('f','json');
  try{
    const r=await fetch(u.href,{mode:'cors',cache:'no-store'});
    if(!r.ok)throw new Error('ANM HTTP '+r.status);
    const j=await r.json();if(j.error)throw new Error(j.error.message||'consulta rejeitada');
    return j;
  }catch(e){
    const j=await anmJsonp(u.href);
    if(j&&j.error)throw new Error(j.error.message||'consulta rejeitada');
    return j;
  }
}
async function anmImportarTela(){
  let uf=(document.getElementById('anmUF')||{}).value||'';
  if(!uf)uf=await anmDetectaUF()||'';
  const btn=document.getElementById('btnAnmImport');if(btn)btn.disabled=true;
  anmStatus('Consultando os processos que intersectam a tela…');
  showLoad('ANM · consultando processos minerários…');
  try{
    const b=map.getBounds(),env=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].join(',');
    const data=await anmArcRequest({where:'FID IS NOT NULL',geometry:env,
      geometryType:'esriGeometryEnvelope',inSR:4326,
      spatialRel:'esriSpatialRelIntersects',outFields:'*',
      returnGeometry:true,returnZ:false,returnM:false,outSR:4674,
      geometryPrecision:8});
    const features=(data.features||[]).filter(x=>x.geometry&&x.geometry.rings)
      .map(x=>({geom:x.geometry.rings,multi:true,props:x.attributes||{}}));
    if(!features.length)throw new Error('nenhum processo minerário intersecta a tela atual');
    const ufs=[...new Set(features.map(f=>String(f.props.UF||'').trim()).filter(Boolean))];
    if(!uf&&ufs.length===1){uf=ufs[0];anmSelecionaUF(uf);}
    const nome=`ANM — Processos completos na tela${uf?' — '+uf:''}`;
    const fields=(data.fields||[]).map(f=>({name:f.name,
      type:/Integer|Double|Single|OID/i.test(f.type)?'N':'C',
      length:f.length||80,decimal:/Double|Single/i.test(f.type)?6:0,alias:f.alias||f.name}));
    const L=addLayer({name:nome,gtype:'polygon',features,
      fields:fields.length?fields:[{name:'FID',type:'N',length:9,decimal:0}],
      crs:'EPSG:4674',color:'#268bd2',
      src:{url:ANM_FEATURE_QUERY,provider:'ANM / SIGMINE',official:true,
        importedAt:new Date().toISOString(),extent:env}});
    L._anm={uf,ufs,url:ANM_FEATURE_QUERY,recorte:'processos completos que intersectam a tela',
      fonte:'Serviço vetorial oficial ANM · SIGMINE'};
    L.fill=.16;L.weight=1.5;L.sym.fill=.16;L.sym.weight=1.5;
    drawLayer(L);refreshUI();
    const aviso=data.exceededTransferLimit?' O limite do servidor foi atingido; aproxime o zoom para obter todos.':'';
    anmStatus(`${features.length.toLocaleString('pt-BR')} processo(s) completo(s), com atributos, carregado(s).${aviso}`,'ok');
    toast(`ANM: ${features.length.toLocaleString('pt-BR')} processo(s) carregado(s)`);
  }catch(e){
    const m=e&&e.message||String(e);
    anmStatus(`Falha na consulta vetorial: ${m}. O link abaixo continua disponível para baixar o ZIP oficial da UF.`,'err');
    toast('⚠ ANM: '+m);
  }finally{
    hideLoad();if(btn)btn.disabled=false;
  }
}

/* Acrescenta WMS à árvore sem alterar a renderização consolidada das demais camadas. */
const refreshUIBaseWMS=refreshUI;
refreshUI=function(){
  refreshUIBaseWMS();
  wmsRenderRows();
  // Projetos de cava vinculados acompanham a geometria da linha-guia. O
  // debounce evita regenerar dezenas de vezes durante um único arraste.
  if(typeof cavaLiveSync==='function') cavaLiveSync();
  // Camadas importadas/criadas enquanto a Mina está aberta entram na cena
  // automaticamente, sem uma segunda ação do usuário.
  if(S._view==='v3d' && typeof mina3DAuto==='function') mina3DAuto(false);
};

document.getElementById('btnWmsSearch').onclick=()=>wmsCatalogRender(document.getElementById('wmsSearch').value);
document.getElementById('wmsSearch').addEventListener('input',e=>wmsCatalogRender(e.target.value));
document.getElementById('wmsSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();wmsCatalogRender(e.target.value);}});
document.getElementById('btnWmsConnect').onclick=wmsConnect;
document.getElementById('wmsLayerFilter').addEventListener('input',e=>wmsLayerRender(e.target.value));
document.getElementById('btnWmsAdd').onclick=wmsAddSelected;
document.getElementById('anmUF').addEventListener('change',anmDirectAtualiza);
document.getElementById('btnAnmImport').onclick=anmImportarTela;
anmDirectAtualiza();
wmsCatalogRender('');
wmsRenderRows();
