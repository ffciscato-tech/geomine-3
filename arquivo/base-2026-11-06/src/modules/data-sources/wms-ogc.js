
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
   ANM / SIGMINE — baixa direto os processos minerários da área da tela.
   Não há escolha de UF: a consulta é feita pela extensão visível e o estado
   é reconhecido pelos próprios processos encontrados.
   ========================================================================== */
function anmStatus(msg,kind){
  const e=document.getElementById('anmStatus'); if(!e)return;
  e.textContent=msg;
  e.style.color=kind==='err'?'#dc3636':kind==='ok'?'#18884b':'';
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
/* A ANM publica a camada vetorial no MapServer/0 (processos ativos, SIRGAS
   2000). Em 2026 a camada trocou o campo FID por OBJECTID e a consulta antiga
   (where=FID IS NOT NULL) passou a falhar com "Failed to execute query". O
   identificador agora vem dos metadados da própria camada, com alternativas
   de filtro caso o serviço mude de novo. */
const ANM_LAYER='https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/dados_anm/MapServer/0';
const ANM_FEATURE_QUERY=ANM_LAYER+'/query';
const ANM_MAX_TELA=20000;           /* acima disto, pede para aproximar */
let ANM_META=null,ANM_RODANDO=false;
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
async function anmArcRequest(params,url=ANM_FEATURE_QUERY){
  const u=new URL(url);
  Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));
  u.searchParams.set('f','json');
  try{
    const r=await fetch(u.href,{mode:'cors',cache:'no-store'});
    if(!r.ok)throw new Error('ANM HTTP '+r.status);
    const j=await r.json();if(j.error)throw new Error(j.error.message||'consulta rejeitada');
    return j;
  }catch(e){
    /* sem CORS (outro domínio, proxy): JSONP. Erro de consulta não tenta de novo */
    if(/rejeitada|Failed to execute|Invalid|inválid/i.test(e&&e.message||''))throw e;
    const j=await anmJsonp(u.href);
    if(j&&j.error)throw new Error(j.error.message||'consulta rejeitada');
    return j;
  }
}
async function anmMeta(){
  if(ANM_META)return ANM_META;
  try{
    const j=await anmArcRequest({},ANM_LAYER);
    const oid=j.objectIdField||(j.fields||[]).find(f=>f.type==='esriFieldTypeOID')?.name||'OBJECTID';
    ANM_META={oid,max:Math.max(100,Math.min(+j.maxRecordCount||1000,2000)),fields:j.fields||[],
      paginacao:j.advancedQueryCapabilities?.supportsPagination!==false};
  }catch(e){ANM_META={oid:'OBJECTID',max:1000,fields:[],paginacao:true};}
  return ANM_META;
}
/* campos úteis: sem geometria e sem as medidas internas do SQL Server (em graus) */
const anmCampoUtil=f=>f&&f.name&&f.type!=='esriFieldTypeGeometry'&&!/[().]/.test(f.name);
async function anmImportarTela(){
  if(ANM_RODANDO)return;
  ANM_RODANDO=true;
  const btn=document.getElementById('btnAnmImport');if(btn)btn.disabled=true;
  anmStatus('Consultando os processos minerários da área da tela…');
  showLoad('ANM · consultando processos minerários…');
  try{
    const b=map.getBounds(),cl=(v,a,z)=>Math.max(a,Math.min(z,v));
    const env=[cl(b.getWest(),-180,180),cl(b.getSouth(),-90,90),cl(b.getEast(),-180,180),cl(b.getNorth(),-90,90)].join(',');
    const meta=await anmMeta();
    const base={geometry:env,geometryType:'esriGeometryEnvelope',inSR:4326,spatialRel:'esriSpatialRelIntersects'};
    /* 1º a lista de IDs da tela: é exata (a contagem do servidor usa a caixa
       envolvente de cada processo e superestima) e não tem o limite de 2.000 */
    let where,ids=null,erro=null;
    for(const w of [meta.oid+' IS NOT NULL','1=1',null]){
      try{const p={...base,returnIdsOnly:true};if(w)p.where=w;
        const r=await anmArcRequest(p);
        if(!Array.isArray(r.objectIds)&&r.objectIds!==null)throw new Error('resposta sem lista de IDs');
        ids=(r.objectIds||[]).slice().sort((x,y)=>x-y);where=w;break;}
      catch(e){erro=e;}
    }
    if(!ids)throw erro||new Error('o serviço da ANM não informou os processos da tela');
    const total=ids.length;
    if(!total)throw new Error('nenhum processo minerário ativo na área da tela');
    if(total>ANM_MAX_TELA)throw new Error(total.toLocaleString('pt-BR')+' processos na tela; aproxime o zoom (até '+ANM_MAX_TELA.toLocaleString('pt-BR')+' por vez)');
    /* 2º os processos em lotes de IDs (URL curta, sem depender de paginação) */
    const LOTE=Math.min(500,meta.max),features=[];let fields=null,faltaram=0;
    for(let i=0;i<total;i+=LOTE){
      showLoad('ANM · baixando processos da tela… '+Math.min(i,total).toLocaleString('pt-BR')+' de '+total.toLocaleString('pt-BR'));
      const p={objectIds:ids.slice(i,i+LOTE).join(','),outFields:'*',returnGeometry:true,returnZ:false,returnM:false,outSR:4674,geometryPrecision:8};
      let d;
      try{d=await anmArcRequest(p);}catch(e){d=await anmArcRequest(p);}   // uma nova tentativa por lote
      if(!fields)fields=(d.fields&&d.fields.length?d.fields:meta.fields);
      let vieram=0;
      for(const x of d.features||[]){
        if(!x.geometry||!x.geometry.rings)continue;
        const at=x.attributes||{},props={};
        for(const k of Object.keys(at))if(!/[().]/.test(k)&&k!=='Shape')props[k]=at[k];
        features.push({geom:x.geometry.rings,multi:true,props});vieram++;
      }
      faltaram+=Math.max(0,Math.min(LOTE,total-i)-vieram);
    }
    const incompleto=faltaram>0;
    if(!features.length)throw new Error('o serviço não devolveu geometria para a área da tela');
    /* só siglas válidas: há processos com UF "DADO NÃO CADASTRADO" */
    const ufs=[...new Set(features.map(f=>String(f.props.UF||'').trim().toUpperCase()).filter(u=>/^[A-Z]{2}$/.test(u)))].sort();
    const nome=('ANM — Processos na tela'+(ufs.length?' — '+ufs.join(', '):'')).slice(0,80);
    const flds=(fields||[]).filter(anmCampoUtil).map(f=>({name:f.name,
      type:/Integer|Double|Single|OID|SmallInteger/i.test(f.type)?'N':'C',
      length:f.length||80,decimal:/Double|Single/i.test(f.type)?6:0,alias:f.alias||f.name}));
    const L=addLayer({name:nome,gtype:'polygon',features,
      fields:flds.length?flds:[{name:meta.oid,type:'N',length:9,decimal:0}],
      crs:'EPSG:4674',color:'#268bd2',
      src:{url:ANM_FEATURE_QUERY,provider:'ANM / SIGMINE',official:true,
        importedAt:new Date().toISOString(),extent:env}});
    L._anm={uf:ufs.join(','),ufs,url:ANM_FEATURE_QUERY,recorte:'processos completos que intersectam a tela',
      fonte:'Serviço vetorial oficial ANM · SIGMINE'};
    L.fill=.16;L.weight=1.5;L.sym.fill=.16;L.sym.weight=1.5;
    drawLayer(L);refreshUI();
    const aviso=incompleto?' Atenção: '+faltaram.toLocaleString('pt-BR')+' processo(s) vieram sem geometria do servidor.':'';
    anmStatus(features.length.toLocaleString('pt-BR')+' processo(s) completo(s), com atributos'+(ufs.length?', em '+ufs.join(', '):'')+'.'+aviso,aviso?'err':'ok');
    toast('ANM: '+features.length.toLocaleString('pt-BR')+' processo(s) carregado(s)'+(ufs.length?' — '+ufs.join(', '):''));
  }catch(e){
    const m=e&&e.message||String(e);
    anmStatus('Não foi possível baixar: '+m+'.','err');
    toast('⚠ ANM: '+m);
  }finally{
    hideLoad();ANM_RODANDO=false;if(btn)btn.disabled=false;
  }
}
/* Botão ANM (faixa ou painel de órgãos): abre o painel e já baixa a área da tela */
function anmAbrePainel(anchor){
  const sec=document.getElementById('secANM');
  /* o painel precisa de um botão de referência; sem ele, baixa do mesmo jeito */
  const ref=anchor&&anchor.getBoundingClientRect?anchor:
    [...document.querySelectorAll('#ribbon .rbtn')].find(b=>/^\s*ANM\s*$/.test(b.textContent))||document.querySelector('#ribbon .rbtn.on');
  if(sec&&ref&&typeof ribbonOpen==='function'){try{ribbonOpen(sec,ref,'ANM · Processos Minerários');}catch(_){}}
  anmImportarTela();
}
window.anmAbrePainel=anmAbrePainel;

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
document.getElementById('btnAnmImport').onclick=anmImportarTela;
wmsCatalogRender('');
wmsRenderRows();
