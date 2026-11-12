/* GIS · América Latina. Catálogo curado; as camadas são descobertas no órgão.
   Não promete inventário exaustivo nem transforma imagens WMS em vetores. */
(function(){
  'use strict';
  const countries={AR:'Argentina',CO:'Colômbia',GF:'Guiana Francesa',UY:'Uruguai'};
  const themes={geologia:'Geologia',ambiente:'Meio ambiente',mineracao:'Mineração e direitos minerários'};
  const countryBounds={AR:[-73.6,-55.2,-53.5,-21.7],CO:[-79.1,-4.3,-66.8,13.6],GF:[-54.7,2.0,-51.5,5.9],UY:[-58.5,-35.1,-53.0,-30.0]};
  const MAX_FEATURES=1000000,PAGE_SIZE=100;
  const sources={
    AR:'https://www.argentina.gob.ar/jefatura/turismo-y-ambiente/ambiente/articulacion-ambiental/informacion-ambiental/infraestructura-de',
    CO:'https://www2.sgc.gov.co/sgc/mapas/Geoservicio/Paginas/geoservicios.aspx',
    GF:'https://www.guyane-sig.fr/portal/les-flux-de-donnees/',
    UY:'https://www.gub.uy/infraestructura-datos-espaciales/politicas-y-gestion/geoservicios-ide'
  };
  const catalog=WMS_CATALOG.filter(x=>countries[x.pais]&&x.kind!=='link'&&x.temas.some(t=>themes[t]))
    .map(x=>({...x,protocol:'WMS',temas:x.temas.filter(t=>themes[t]),source:sources[x.pais]}));
  function entry(pais,provider,title,protocol,url,temas,source){catalog.push({pais,provider,title,protocol,url,temas,source:source||sources[pais]});}
  entry('AR','IGN Argentina','IGN — Hidrografia, relevo e áreas protegidas','WMS','https://wms.ign.gob.ar/geoserver/ows',['ambiente']);
  entry('AR','IGN Argentina','IGN — Dados vetoriais ambientais','WFS','https://wms.ign.gob.ar/geoserver/ows',['ambiente'],'https://www.ign.gob.ar/datos/index2.html');
  entry('AR','IDE Ambiental','IDE Ambiental — Bosques, áreas protegidas e bacias','WFS','https://geo.ambiente.gob.ar/geoserver/ows',['ambiente']);
  entry('AR','SEGEMAR · SIGAM','SEGEMAR — Camadas completas de geologia','WFS','https://sigam.segemar.gov.ar/geoserver217/wfs',['geologia','ambiente'],'https://sigam.segemar.gov.ar/wordpress/');
  catalog[catalog.length-1].snapshotManifest='/data/segemar/manifest.json';
  entry('CO','SGC','SGC — Atlas geológico 2015','WFS','https://srvags.sgc.gov.co/arcgis/services/Atlas_Geologico_2015/WFS_Atlas_Geologico_2015/MapServer/WFSServer',['geologia']);
  entry('CO','SGC','SGC — Mapa geológico da Colômbia','WFS','https://srvags.sgc.gov.co/arcgis/services/Mapa_Geologico_Colombia/Mapa_Geologico_Colombia/MapServer/WFSServer',['geologia']);
  entry('CO','SGC','SGC — Geomorfodinâmica','WFS','https://srvags.sgc.gov.co/arcgis/services/Geomorfodinamica/WFS_Geomorfodinamica/MapServer/WFSServer',['geologia','ambiente']);
  entry('CO','SGC','SGC — Suscetibilidade a movimentos de massa','WMTS','https://srvags.sgc.gov.co/arcgis/rest/services/SIMMA/ZonificacionSusceptibilidadCache/MapServer/WMTS/1.0.0/WMTSCapabilities.xml',['geologia','ambiente']);
  entry('GF','Guyane-SIG','Guyane-SIG — Geologia e meio ambiente','WMS','https://www.guyane-sig.fr/geoserver/wms',['geologia','ambiente']);
  entry('GF','Guyane-SIG','Guyane-SIG — Dados vetoriais','WFS','https://www.guyane-sig.fr/geoserver/wfs',['geologia','ambiente']);
  entry('GF','Guyane-SIG','Guyane-SIG — Mapas em mosaicos','WMTS','https://www.guyane-sig.fr/geoserver/gwc/service/wmts',['geologia','ambiente']);
  entry('GF','GéoGuyane','GéoGuyane — Dados ambientais e geológicos','WFS','https://datacarto.geoguyane.fr/wfs',['geologia','ambiente'],'https://www.geoguyane.fr/accueil/ressources/aide-en-ligne');
  entry('CO','SGC','SGC — Geologia da Colômbia · download verificado','REST','https://services1.arcgis.com/Og2nrTKe5bptW02d/ArcGIS/rest/services/TerrenosGeologicos2015/FeatureServer',['geologia']);
  catalog[catalog.length-1].snapshotManifest='/data/sgc/manifest.json';
  entry('UY','DINAMIGE / MIEM','DINAMIGE — Unidades geológicas, falhas e filões','REST','https://geoportal.miem.gub.uy/arcgis1091/rest/services/Dinamige_GeoS/MapaBaseUnidadesGeologicasGeoS/MapServer',['geologia'],'https://www.gub.uy/ministerio-industria-energia-mineria/tramites-y-servicios/servicios/geoportal-dinamige');
  entry('UY','IDEuy','IDEuy — Hidrografia nacional','WFS','https://mapas.ide.uy/geoservicios/WFS/WFS_Uruguay_IDEuy_Hidrografia_Nacional',['ambiente']);
  entry('UY','IDEuy','IDEuy — Modelo de elevação','WMTS','https://mapas.ide.uy/geoservicios/WMTS/WMTS_Uruguay_IDEuy_MDE',['geologia','ambiente']);
  catalog.forEach(s=>{if(s.pais==='CO'&&new URL(s.url).hostname==='srvags.sgc.gov.co')s.connectionUnavailable=true;});
  for(const [pais,provider,title,source] of [
    ['AR','Ministerio de Minería · San Juan','Direitos minerários — San Juan (cobertura provincial)','https://catastrominero.sanjuan.gob.ar/'],
    ['CO','Agencia Nacional de Minería','Direitos minerários — Colômbia · ANM','https://geo.anm.gov.co/'],
    ['UY','DINAMIGE / MIEM','Direitos minerários — Uruguai · DINAMIGE','https://visualizadorgeominero.dinamige.gub.uy/'],
    ['GF','Camino','Direitos minerários — Guiana Francesa · histórico 24/01/2025','https://www.data.gouv.fr/datasets/cadastre-minier']
  ]){entry(pais,provider,title,'REST',source,['mineracao'],source);Object.assign(catalog[catalog.length-1],{snapshotManifest:'/data/mining/'+pais+'/manifest.json',miningKind:'rights'});}
  let selected=null,connected=null,layers=[],controller=null,epoch=0;
  const $=id=>document.getElementById('latin'+id);
  const direct=(n,k)=>Array.from(n?.children||[]).filter(c=>c.localName===k);
  const val=(n,k)=>(direct(n,k)[0]?.textContent||'').trim();
  const vector=s=>s.protocol==='WFS'||s.protocol==='REST';
  function layerThemes(layer){
    if(Array.isArray(layer.temas))return layer.temas;
    const text=wmsNorm(layer.title+' '+layer.name);
    return /peligro|suscep|riesgo|exposicion|fauna|fisonom|socio|usos.*suelo|suelos|pozos.*agua/.test(text)?['ambiente']:['geologia'];
  }
  function frameCountry(){const b=countryBounds[$('Country').value];if(b&&map.fitBounds)map.fitBounds([[b[1],b[0]],[b[3],b[2]]],{padding:[30,30]});}
  function xml(text){const d=new DOMParser().parseFromString(text,'text/xml');if(d.querySelector('parsererror'))throw Error('XML inválido');const error=d.getElementsByTagNameNS('*','ExceptionText')[0]||d.getElementsByTagNameNS('*','ServiceException')[0];if(error)throw Error(error.textContent.trim());return d;}
  function url(base,params){const u=new URL(base);for(const key of [...u.searchParams.keys()])if(Object.keys(params).some(k=>k.toLowerCase()===key.toLowerCase()))u.searchParams.delete(key);Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));return u.href;}
  function capabilities(s,version){return s.protocol==='WMTS'&&/\.xml(?:\?|$)/i.test(s.url)?s.url:url(s.url,{SERVICE:s.protocol,REQUEST:'GetCapabilities',VERSION:version});}
  function status(text){$('Status').textContent=text;}
  function reset(){epoch++;controller?.abort();controller=null;connected=null;layers=[];$('Layers').innerHTML='';$('Add').disabled=true;}
  async function request(href,signal){
    const r=await fetch(href,{mode:'cors',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(45000)])});if(!r.ok)throw Error('HTTP '+r.status);return r.text();
  }
  function parse(text,protocol){
    const d=xml(text),version=d.documentElement.getAttribute('version')||'2.0.0';
    if(protocol==='WMS')return {version,layers:wmsParseCapabilities(text)};
    if(protocol==='WFS'){
      const output=Array.from(d.getElementsByTagNameNS('*','OutputFormat')).flatMap(n=>direct(n,'Format').map(f=>f.textContent.trim()));
      const op=Array.from(d.getElementsByTagNameNS('*','Operation')).find(n=>n.getAttribute('name')==='GetFeature');
      const formats=Array.from(op?.getElementsByTagNameNS('*','Parameter')||[]).filter(n=>n.getAttribute('name')==='outputFormat').flatMap(n=>Array.from(n.getElementsByTagNameNS('*','Value')).map(v=>v.textContent.trim()));
      const format=[...formats,...output].find(x=>/json/i.test(x));
      return {version,format,layers:Array.from(d.getElementsByTagNameNS('*','FeatureType')).map(n=>({name:val(n,'Name'),title:val(n,'Title')||val(n,'Name'),abstract:val(n,'Abstract')})).filter(x=>x.name)};
    }
    const contents=d.getElementsByTagNameNS('*','Contents')[0],sets={};
    direct(contents,'TileMatrixSet').forEach(n=>{sets[val(n,'Identifier')]={crs:val(n,'SupportedCRS'),matrices:direct(n,'TileMatrix').map(m=>({id:val(m,'Identifier'),scale:+val(m,'ScaleDenominator'),origin:val(m,'TopLeftCorner').split(/\s+/).map(Number),width:+val(m,'MatrixWidth'),height:+val(m,'MatrixHeight'),tileWidth:+val(m,'TileWidth'),tileHeight:+val(m,'TileHeight')}))};});
    const get=Array.from(d.getElementsByTagNameNS('*','Operation')).find(n=>n.getAttribute('name')==='GetTile');
    const endpoint=get?.getElementsByTagNameNS('*','Get')[0]?.getAttributeNS('http://www.w3.org/1999/xlink','href');
    return {version:'1.0.0',layers:direct(contents,'Layer').map(n=>{
      const links=direct(n,'TileMatrixSetLink').map(x=>val(x,'TileMatrixSet'));
      const matrixSet=links.find(k=>/3857|900913|102100/.test(sets[k]?.crs||''));
      const resource=direct(n,'ResourceURL').find(x=>x.getAttribute('resourceType')==='tile');
      const style=direct(n,'Style').find(x=>x.getAttribute('isDefault')==='true')||direct(n,'Style')[0];
      const formats=direct(n,'Format').map(x=>x.textContent.trim());
      return {name:val(n,'Identifier'),title:val(n,'Title')||val(n,'Identifier'),abstract:val(n,'Abstract'),wmts:{matrixSet,set:sets[matrixSet],style:val(style,'Identifier'),format:formats.find(f=>/png|jpeg/.test(f))||formats[0],template:resource?.getAttribute('template'),endpoint},unsupported:!matrixSet||!sets[matrixSet].matrices.some(m=>m.tileWidth===256&&m.tileHeight===256)||direct(n,'Dimension').length>0};
    })};
  }
  function render(){
    const box=$('Catalog'),country=$('Country').value,theme=$('Theme').value,q=wmsNorm($('Search').value),protocol=$('Protocol').value;box.innerHTML='';
    if(!country){box.textContent='Escolha um país para consultar seus servidores de geologia e meio ambiente.';return;}
    const found=catalog.filter(x=>!x.connectionUnavailable&&x.pais===country&&(!theme||x.temas.includes(theme))&&(!protocol||x.protocol===protocol||protocol==='WFS'&&vector(x))&&(!q||wmsNorm(x.title+' '+x.provider+' '+x.url).includes(q))).sort((a,b)=>(b.provider.includes('SEGEMAR')-a.provider.includes('SEGEMAR'))||(b.temas.includes('geologia')-a.temas.includes('geologia'))||(b.protocol==='REST')-(a.protocol==='REST'));
    found.forEach(s=>{const row=document.createElement('div');row.className='wmsCard';
      const b=document.createElement('button');b.type='button';b.className='tbtn';b.style.cssText='width:100%;text-align:left;white-space:normal;justify-content:flex-start';b.textContent=(s.snapshotManifest&&s.provider.includes('SEGEMAR')?(theme==='ambiente'?'SEGEMAR — Meio ambiente e riscos naturais':theme==='geologia'?'SEGEMAR — Geologia':'SEGEMAR — Geologia e meio ambiente'):s.title)+' · '+(s.snapshotManifest?'camadas completas':s.protocol);
      b.onclick=()=>{reset();selected=s;box.querySelectorAll('.sel').forEach(n=>n.classList.remove('sel'));row.classList.add('sel');$('Connect').disabled=false;$('Connect').textContent=s.snapshotManifest?'Listar camadas para download':'Conectar e consultar camadas';$('Add').textContent=vector(s)?'Baixar camadas completas':'Adicionar mapa online ('+s.protocol+')';status(s.provider+' selecionado. '+(s.snapshotManifest?'Clique em Listar camadas para download.':'Conecte para consultar as camadas disponíveis agora.'));};row.appendChild(b);
      const small=document.createElement('small');small.textContent=s.provider+' · '+s.temas.filter(t=>!theme||t===theme).map(t=>themes[t]).join(' / ');row.appendChild(small);
      const a=document.createElement('a');a.href=s.source;a.target='_blank';a.rel='noopener';a.textContent='Fonte oficial';row.appendChild(a);box.appendChild(row);
    });
    if(!found.length)box.textContent='Nenhum servidor cadastrado para este filtro. Consulte o diretório oficial abaixo.';
    const a=document.createElement('a');a.href=sources[country];a.target='_blank';a.rel='noopener';a.textContent='Abrir diretório oficial de '+countries[country];box.appendChild(a);
  }
  function renderLayers(){const box=$('Layers'),q=wmsNorm($('LayerSearch').value);box.innerHTML='';layers.forEach((l,i)=>{if(q&&!wmsNorm(l.name+' '+l.title+' '+l.abstract).includes(q))return;const label=document.createElement('label');label.className='wmsLayerChoice';const check=document.createElement('input');check.type='checkbox';check.value=i;check.disabled=!!l.unsupported;const text=document.createElement('span');text.textContent=l.title+(l.unsupported?' — grade ou dimensão incompatível com este mapa':'');const small=document.createElement('small');small.textContent=l.name;text.appendChild(small);label.append(check,text);box.appendChild(label);});}
  async function connect(){
    if(!selected)return;reset();const token=epoch,s={...selected};controller=new AbortController();const signal=controller.signal;$('Connect').disabled=true;status('Consultando o servidor oficial…');
    const versions=s.protocol==='WMS'?['1.3.0','1.1.1']:s.protocol==='WFS'?['2.0.0','1.1.0']:['1.0.0'];let error;
    try{for(const version of versions){try{
      let result;
      if(s.snapshotManifest){const responses=await Promise.all([fetch(s.snapshotManifest,{cache:'no-store',signal}),fetch(s.snapshotManifest.replace('manifest.json','styles.json'),{cache:'no-store',signal})]);if(responses.some(r=>!r.ok))throw Error('O catálogo ou a legenda oficial não estão disponíveis');const [snapshot,styles]=await Promise.all(responses.map(r=>r.json()));if(!snapshot.complete)throw Error('O catálogo está sendo preparado');const theme=$('Theme').value;result={version:'snapshot',notice:snapshot.notice||'',snapshotDate:snapshot.snapshotDate,layers:snapshot.layers.filter(l=>!theme||layerThemes(l).includes(theme)).map(l=>({...l,temas:layerThemes(l),snapshot:l,officialStyle:styles.styles[l.name]||null,abstract:'Camada completa · '+l.featureCount+' feições · cópia de '+(l.snapshotDate||snapshot.snapshotDate)}))};}
      else result=s.protocol==='REST'?await restCapabilities(s,signal):parse(await request(capabilities(s,version),signal),s.protocol);if(token!==epoch)return;
      if(!result.layers.length)throw Error('O órgão não informou camadas');
      connected={...s,...result};
      const priority=l=>Number.isFinite(l.priority)?l.priority:/e2\.5M\.UnidadesGeologicas$/i.test(l.name)?0:/e5M\.UnidadesGeologicas$/i.test(l.name)?1:/UnidadGeologica|UnidadLitologica/i.test(l.name)?2:/unidades? geolog|geolog|litolog/i.test(l.title)?3:/fallas|estructuras|contactos/i.test(l.title)?4:5;
      layers=result.layers.sort((a,b)=>priority(a)-priority(b));$('Add').disabled=false;renderLayers();
      status(layers.length+' camadas disponíveis'+($('Theme').value?' de '+themes[$('Theme').value]:'')+'. '+(result.snapshotDate?'Cópias completas de '+result.snapshotDate+'. ':'')+(result.notice?result.notice+' ':'')+(vector(s)?'Marque as camadas para baixar o conteúdo completo, sem recorte pela tela.':'Este serviço oferece imagens para visualização online. Para baixar dados editáveis, escolha WFS.'));return;
    }catch(e){if(signal.aborted)return;error=e;}}
      throw error;
    }catch(e){if(token===epoch)status('Não foi possível consultar: '+e.message+'. O servidor pode estar indisponível ou bloquear acesso pelo navegador. Consulte a fonte oficial no cartão.');}
    finally{if(token===epoch)$('Connect').disabled=false;}
  }
  function featureUrl(s,l,bounds,count,start=0){const is2=s.version.startsWith('2');return url(s.url,{SERVICE:'WFS',VERSION:s.version,REQUEST:'GetFeature',[is2?'TYPENAMES':'TYPENAME']:l.name,SRSNAME:'urn:ogc:def:crs:OGC:1.3:CRS84',...(bounds?{BBOX:bounds.join(',')+',urn:ogc:def:crs:OGC:1.3:CRS84'}:{}),[is2?'COUNT':'MAXFEATURES']:count,STARTINDEX:start,...(s.format?{OUTPUTFORMAT:s.format}:{})});}
  async function restJson(href,params,signal){const j=JSON.parse(await request(url(href,{f:'json',...params}),signal));if(j.error)throw Error(j.error.message||'Consulta recusada pelo servidor');return j;}
  async function restCapabilities(s,signal){const meta=await restJson(s.url,{},signal);return {version:'REST',layers:(meta.layers||[]).filter(l=>!l.subLayerIds?.length&&l.type!=='Group Layer').map(l=>({name:String(l.id),title:l.name,abstract:meta.description||''}))};}
  async function downloadRest(s,l,signal,onProgress){
    const endpoint=s.url+'/'+l.name,meta=await restJson(endpoint,{},signal),oid=meta.objectIdField||(meta.fields||[]).find(f=>f.type==='esriFieldTypeOID')?.name;
    l.officialStyle=window.GeoMineOfficialStyles?.arcgis(meta.drawingInfo?.renderer,s);
    if(!oid)throw Error('O serviço não informou o identificador das feições');
    const index=await restJson(endpoint+'/query',{where:'1=1',returnIdsOnly:true},signal);if(!Array.isArray(index.objectIds))throw Error('O serviço não confirmou a lista completa de feições');
    const ids=[...new Set(index.objectIds)].sort((a,b)=>a-b),features=[];if(ids.length>MAX_FEATURES)throw Error('A camada excede a capacidade desta importação. Nenhum dado parcial foi importado');
    const size=Math.max(1,Math.min(PAGE_SIZE,Number(meta.maxRecordCount)||PAGE_SIZE));
    for(let start=0;start<ids.length;start+=size){
      const batch=ids.slice(start,start+size),response=await request(url(endpoint+'/query',{f:'geojson',objectIds:batch.join(','),outFields:'*',returnGeometry:true,outSR:4326}),signal),j=geojson(response);
      const received=j.features.map(f=>Number(f.properties?.[oid]??f.id)),wanted=new Set(batch.map(Number));
      if(j.features.length!==batch.length||new Set(received).size!==batch.length||received.some(id=>!wanted.has(id)))throw Error('O servidor devolveu um lote incompleto. Nenhum dado parcial foi importado');
      features.push(...j.features);onProgress(features.length,ids.length);
    }return {type:'FeatureCollection',features};
  }
  async function downloadSnapshot(layer,signal,onProgress){
    const meta=layer.snapshot,response=await fetch(meta.url,{cache:'default',signal});if(!response.ok)throw Error('Não foi possível baixar a camada completa: HTTP '+response.status);
    const buffer=await response.arrayBuffer();if(signal.aborted)throw signal.reason;
    const bytes=new Uint8Array(buffer);let text;
    if(bytes[0]===31&&bytes[1]===139){if(typeof DecompressionStream==='undefined')throw Error('Este navegador precisa ser atualizado para abrir as camadas compactadas');text=await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).text();}
    else text=new TextDecoder().decode(buffer);
    if(signal.aborted)throw signal.reason;
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),v=>v.toString(16).padStart(2,'0')).join('');if(digest!==meta.sha256)throw Error('A conferência de integridade falhou. Tente baixar novamente');
    const j=geojson(text);if(j.features.length!==meta.featureCount)throw Error('A camada não está completa. Nenhuma feição foi importada');onProgress(j.features.length,meta.featureCount);return j;
  }
  function matched(response,hits=false){const text=String(response).trim();const raw=text.startsWith('{')?JSON.parse(text):xml(text).documentElement;const value=typeof raw.getAttribute==='function'?(raw.getAttribute('numberMatched')??(hits?raw.getAttribute('numberOfFeatures'):null)):(raw.numberMatched??raw.totalFeatures);return value!==null&&value!==undefined&&value!==''&&Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):null;}
  async function downloadFeatures(s,l,bbox,signal,onProgress=()=>{}){
    let expected=null;
    try{expected=matched(await request(url(featureUrl(s,l,bbox,PAGE_SIZE),{RESULTTYPE:'hits'}),signal),true);}catch(e){if(signal.aborted)throw e;/* Alguns órgãos não implementam hits. Conferimos as páginas de resultados. */}
    if(expected!==null&&expected>MAX_FEATURES)throw Error('A camada contém '+expected+' feições e excede a capacidade desta importação no navegador. Nenhum dado parcial será importado');
    const features=[],pages=new Set();let finished=false;
    for(let page=0;page<=MAX_FEATURES;page++){
      const response=await request(featureUrl(s,l,bbox,Math.min(PAGE_SIZE,MAX_FEATURES+1-features.length),features.length),signal);
      const collection=response.trim().startsWith('{')?geojson(response):gml(response),total=matched(response);
      if(expected===null&&total!==null)expected=total;
      if(expected!==null&&expected>MAX_FEATURES)throw Error('A camada excede a capacidade de '+MAX_FEATURES+' feições desta importação. Nenhum dado parcial foi importado');
      if(!collection.features.length){if(expected!==null&&features.length!==expected)throw Error('O servidor interrompeu o download: '+features.length+' de '+expected+' feições. Nenhum dado parcial foi importado');finished=true;break;}
      const pageText=JSON.stringify(collection.features);let h1=2166136261,h2=5381;for(let i=0;i<pageText.length;i++){h1=Math.imul(h1^pageText.charCodeAt(i),16777619);h2=Math.imul(h2,33)^pageText.charCodeAt(i);}const signature=pageText.length+':'+h1+':'+h2;if(pages.has(signature))throw Error('O servidor repetiu uma página e não aceitou a paginação. Nenhum dado parcial foi importado');pages.add(signature);
      features.push(...collection.features);if(features.length>MAX_FEATURES)throw Error('A camada excede a capacidade desta importação. Nenhum dado parcial foi importado');
      onProgress(features.length,expected);
      if(expected!==null&&features.length===expected){finished=true;break;}
      if(expected!==null&&features.length>expected)throw Error('O servidor retornou contagens inconsistentes. Tente novamente');
    }
    if(!finished)throw Error('O servidor não confirmou o fim do download');return {type:'FeatureCollection',features};
  }
  function geojson(text){
    const j=JSON.parse(text);if(j.type!=='FeatureCollection'||!Array.isArray(j.features))throw Error('O servidor não retornou GeoJSON vetorial');
    if(j.crs&&!/4326|CRS84/i.test(JSON.stringify(j.crs)))throw Error('O servidor retornou coordenadas fora do CRS solicitado');
    const coord=c=>{if(!Array.isArray(c))throw Error('Coordenada inválida');if(typeof c[0]==='number'){if(!Number.isFinite(c[0])||!Number.isFinite(c[1])||Math.abs(c[0])>180||Math.abs(c[1])>90)throw Error('Coordenada fora de longitude/latitude');}else c.forEach(coord);};
    j.features.forEach(f=>{if(f.geometry?.coordinates)coord(f.geometry.coordinates);});return j;
  }
  function gml(text){
    const d=xml(text),types=new Set(['Point','LineString','Curve','Polygon','Surface','MultiPoint','MultiLineString','MultiCurve','MultiPolygon','MultiSurface']);
    const descendants=(n,k)=>Array.from(n.getElementsByTagNameNS('*',k));
    function positions(n){
      const list=descendants(n,'posList')[0],old=descendants(n,'coordinates')[0],pos=descendants(n,'pos');let points=[];
      if(list){const dim=+(list.getAttribute('srsDimension')||n.getAttribute('srsDimension')||2),v=list.textContent.trim().split(/\s+/).map(Number);if(![2,3].includes(dim)||v.length%dim)throw Error('Dimensão GML não suportada');for(let i=0;i<v.length;i+=dim)points.push(v.slice(i,i+dim));}
      else if(old)points=old.textContent.trim().split(/\s+/).map(v=>v.split(',').map(Number));
      else points=pos.map(p=>p.textContent.trim().split(/\s+/).map(Number));
      let owner=list||old||pos[0]||n;while(owner&&!owner.getAttribute?.('srsName'))owner=owner.parentElement;
      const srs=owner?.getAttribute('srsName')||'urn:ogc:def:crs:OGC:1.3:CRS84';
      if(!/CRS:?84|4326/i.test(srs))throw Error('O servidor GML não respeitou o CRS longitude/latitude solicitado');
      if(/4326/.test(srs)&&/urn:|\/def\/crs\//i.test(srs))points=points.map(p=>[p[1],p[0],...p.slice(2)]);
      return points;
    }
    function geometry(n){
      const type=n.localName;
      if(type.startsWith('Multi')){const children=Array.from(n.children).flatMap(m=>types.has(m.localName)?[m]:Array.from(m.children).filter(c=>types.has(c.localName)));const gs=children.map(geometry);const target=type==='MultiSurface'?'MultiPolygon':type==='MultiCurve'?'MultiLineString':type;return {type:target,coordinates:gs.map(g=>g.coordinates)};}
      if(type==='Point')return {type,coordinates:positions(n)[0]};
      if(type==='LineString'||type==='Curve')return {type:'LineString',coordinates:positions(n)};
      const outer=descendants(n,'exterior')[0]||descendants(n,'outerBoundaryIs')[0],inner=[...descendants(n,'interior'),...descendants(n,'innerBoundaryIs')];
      if(!outer)throw Error('Polígono GML sem anel exterior');return {type:'Polygon',coordinates:[positions(outer),...inner.map(positions)]};
    }
    let members=[...descendants(d,'member'),...descendants(d,'featureMember')];if(!members.length)members=descendants(d,'featureMembers').flatMap(n=>Array.from(n.children));
    const features=members.map(m=>{const f=/^(featureMember|member)$/.test(m.localName)?m.children[0]:m;if(!f)return null;const props={};let g=null;for(const p of f.children){const gn=types.has(p.localName)?p:Array.from(p.getElementsByTagName('*')).find(n=>types.has(n.localName));if(gn)g=geometry(gn);else props[p.localName]=p.textContent.trim();}return g?{type:'Feature',geometry:g,properties:props}:null;}).filter(Boolean);
    return geojson(JSON.stringify({type:'FeatureCollection',features,numberMatched:d.documentElement.getAttribute('numberMatched')||d.documentElement.getAttribute('numberOfFeatures')}));
  }
  function importFeatures(j,name,source){
    const official=source.officialStyle&&window.GeoMineOfficialStyles?.classify(j.features,source.officialStyle);
    const grouped={point:[],line:[],polygon:[]};
    function add(g,p){if(!g)return;if(g.type==='GeometryCollection'){g.geometries.forEach(x=>add(x,p));return;}const type=/Point$/.test(g.type)?'point':/LineString$/.test(g.type)?'line':/Polygon$/.test(g.type)?'polygon':null;if(!type)throw Error('Geometria não suportada: '+g.type);grouped[type].push({type:'Feature',geometry:g,properties:p||{}});}
    j.features.forEach(f=>add(f.geometry,f.properties));
    Object.entries(grouped).forEach(([kind,features])=>{if(!features.length)return;const before=new Set(S.layers.map(l=>l.id));importGeoJSON({type:'FeatureCollection',features},name+' · '+kind);S.layers.filter(l=>!before.has(l.id)).forEach(l=>{l.src={provider:source.provider,country:source.pais,url:source.url,protocol:source.protocol,scope:'complete-layer',snapshotDate:source.snapshotDate||null,coverage:source.coverage||null,notice:source.notice||null,sourceFeatureCount:features.length,miningKind:source.miningKind||null,substanceField:source.substanceField||null,importedAt:new Date().toISOString()};if(official)window.GeoMineOfficialStyles.apply(l,official);const labels=window.GeoMineAutomaticLabels?.apply(l,source);if(official||labels)drawLayer(l);});});
    refreshUI();
    return official;
  }
  async function add(){
    if(!connected)return;const s=connected,chosen=Array.from($('Layers').querySelectorAll('input:checked')).map(c=>layers[+c.value]);if(!chosen.length){status('Marque pelo menos uma camada.');return;}
    const bbox=null; // Camada inteira: não usar BBOX nem recortar pela vista atual.
    $('Add').disabled=true;$('Connect').disabled=true;controller=new AbortController();const token=epoch,signal=controller.signal,projectLayers=S.layers;let added=0,styled=0;
    try{for(const l of chosen){
      if(s.protocol==='WMS'){wmsCreateLayer({url:s.url,layers:l.name,name:l.title,version:s.version,provider:s.provider});}
      else if(s.protocol==='WMTS'){createWMTS({url:s.url,layers:l.name,name:l.title,provider:s.provider,protocol:'WMTS',wmts:l.wmts});}
      else{
        status('Baixando '+l.title+'…');
        const progress=(n,total)=>{if(token===epoch)status('Baixando '+l.title+': '+n+(total!==null?' de '+total:'')+' feições…');};
        const j=l.snapshot?await downloadSnapshot(l,signal,progress):s.protocol==='REST'?await downloadRest(s,l,signal,progress):await downloadFeatures(s,l,bbox,signal,progress);if(token!==epoch||S.layers!==projectLayers)return;
        if(!j.features.length){status('O servidor devolveu a camada '+l.title+' vazia. Nenhuma feição foi importada.');continue;}
        if(importFeatures(j,l.title,{...s,url:l.snapshot?.source||s.url,snapshotDate:l.snapshot?.snapshotDate||s.snapshotDate,miningKind:l.miningKind||s.miningKind,substanceField:l.substanceField||s.substanceField,labelField:l.labelField||s.labelField,officialStyle:l.officialStyle}))styled++;
      }added++;
    }if(token===epoch&&added)status(added+' camada(s) adicionada(s). '+(vector(s)?'Vetores locais com atributos, disponíveis para edição e exportação. '+(styled?styled+' com classes, cores e legenda oficiais.':'A fonte não forneceu uma legenda aplicável automaticamente.'):'Mapa remoto: requer conexão com o servidor.'));
    }catch(e){if(!signal.aborted&&token===epoch)status(added+' camada(s) adicionada(s). Falha na próxima camada: '+e.message);}
    finally{if(token===epoch){$('Add').disabled=false;$('Connect').disabled=false;}}
  }
  function tileUrl(meta,coords){
    const m=meta.set.matrices.find(x=>Math.abs(x.scale*.00028-156543.03392804097/2**coords.z)<156543.03392804097/2**coords.z*.001&&x.tileWidth===256&&x.tileHeight===256);if(!m)return L2.Util.emptyImageUrl;
    const res=m.scale*.00028,span=256*res,x=-20037508.342789244+coords.x*span,y=20037508.342789244-coords.y*span;
    const col=Math.round((x-m.origin[0])/span),row=Math.round((m.origin[1]-y)/span);if(col<0||row<0||col>=m.width||row>=m.height)return L2.Util.emptyImageUrl;
    const values={TileMatrixSet:meta.matrixSet,TileMatrix:m.id,TileCol:col,TileRow:row,Style:meta.style,Layer:meta.layer};
    if(meta.template)return meta.template.replace(/\{(\w+)\}/g,(_,k)=>encodeURIComponent(values[k]??''));
    return url(meta.endpoint,{SERVICE:'WMTS',VERSION:'1.0.0',REQUEST:'GetTile',LAYER:meta.layer,STYLE:meta.style,FORMAT:meta.format,TILEMATRIXSET:meta.matrixSet,TILEMATRIX:m.id,TILEROW:row,TILECOL:col});
  }
  function createWMTS(meta,refresh=true){
    const wmts={...meta.wmts,layer:meta.layers,endpoint:meta.wmts.endpoint||meta.url};if(!wmts.set)throw Error('Grade WMTS ausente');
    const o={...meta,id:meta.id||'T'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),protocol:'WMTS',wmts,visible:meta.visible!==false,opacity:meta.opacity??.85};
    const Tile=L2.TileLayer.extend({getTileUrl(coords){return tileUrl(wmts,coords);}});o.llayer=new Tile('',{opacity:o.opacity,attribution:o.provider,maxZoom:24});
    o.llayer.on('tileerror',()=>{if(!o._warned){o._warned=true;status('O servidor WMTS não entregou algumas imagens de '+o.name+'.');}});if(o.visible)o.llayer.addTo(map);S.wms.push(o);wmsApplyOrder();if(refresh)refreshUI();return o;
  }
  window.GeoMineLatinOGC={catalog,layerThemes,parse,featureUrl,downloadFeatures,downloadRest,downloadSnapshot,matched,geojson,gml,tileUrl,createWMTS};
  const panel=document.createElement('div');panel.className='hsec';panel.id='secLatinOGC';
  panel.innerHTML=`<h2>América Latina <span class="tag">Geologia, ambiente e mineração</span></h2>
    <div class="hint">Escolha o país e consulte as camadas dos órgãos oficiais. Catálogo curado, ampliável pelos diretórios oficiais.</div>
    <label class="field">País</label><select id="latinCountry"><option value="">Escolha um país…</option>${Object.entries(countries).map(([k,v])=>`<option value="${k}"${k==='AR'?' selected':''}>${v}</option>`).join('')}</select>
    <div class="row2"><div><label class="field">Tema</label><select id="latinTheme"><option value="">Todos os temas</option><option value="geologia" selected>Geologia</option><option value="ambiente">Meio ambiente</option><option value="mineracao">Mineração e direitos minerários</option></select></div><div><label class="field">Serviço</label><select id="latinProtocol"><option value="">Todos</option><option value="WFS" selected>WFS · baixar vetores</option><option value="WMS">WMS · mapa online</option><option value="WMTS">WMTS · mapa online</option></select></div></div>
    <div class="hint" style="margin-top:8px"><b>Download da camada completa</b> — sem recorte pela área da tela. Fontes e camadas geológicas aparecem primeiro.</div><button id="latinFrame" class="tbtn" type="button">Enquadrar país no mapa</button>
    <label class="field">Buscar servidor</label><input id="latinSearch" type="search" placeholder="Órgão, geologia, áreas protegidas…">
    <div id="latinCatalog" class="wmsCatalog"></div><button id="latinConnect" class="tbtn" type="button" disabled>Conectar e consultar camadas</button>
    <div id="latinStatus" class="hout" role="status" aria-live="polite">Nenhum servidor conectado.</div>
    <label class="field">Buscar camada no servidor</label><input id="latinLayerSearch" type="search" placeholder="Nome ou palavra-chave"><div id="latinLayers" class="wmsLayerList"></div>
    <button id="latinAdd" class="tbtn" type="button" disabled>Baixar camadas completas</button>
    <div class="hint">O SEGEMAR usa cópias completas e datadas, com verificação de integridade. Demais serviços WFS baixam todas as feições em páginas. WMS e WMTS exibem imagens online; WMTS é somente para o mapa 2D.</div>`;
  (document.getElementById('secWMS')?.parentElement||document.body).appendChild(panel);
  ['Country','Theme','Protocol'].forEach(k=>$(k).onchange=()=>{reset();selected=null;$('Connect').disabled=true;status('Escolha um servidor.');render();});$('Search').oninput=render;$('LayerSearch').oninput=renderLayers;$('Connect').onclick=connect;$('Add').onclick=add;
  $('Frame').onclick=frameCountry;
  RIB_ICONS.latina='<svg viewBox="0 0 32 32"><path d="M3 3l5 1 2 4 4 2 2 3-3 1-3-3-3-1-2-4zM14 13l5-2 7 3 3 4-4 5-4 3-3 5-2-2-1-7-3-5z" class="softamb"/><path d="M3 3l5 1 2 4 4 2 2 3-3 1-3-3-3-1-2-4zM14 13l5-2 7 3 3 4-4 5-4 3-3 5-2-2-1-7-3-5zM17 7l4 1 3 1"/><circle cx="17" cy="15" r="1.2" class="fillamb"/><circle cx="23" cy="16" r="1.2" class="fillamb"/><circle cx="20" cy="24" r="1.2" class="fillamb"/></svg>';
  if(typeof RIB_SVG!=='undefined')RIB_SVG.latina=RIB_ICONS.latina.replace('<svg viewBox="0 0 32 32">','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="#63764a" stroke-width="1.1" stroke-linejoin="round">').replace('class="softamb"','fill="#b7cf91"').replace(/class="fillamb"/g,'fill="#e5ba75"');
  wmsInstalarBotaoAmericaDoSul=function(){
    CATS.forEach(c=>{if(c.id==='ambiente')c.grupos.forEach(g=>{g.it=(g.it||[]).filter(i=>i.ic!=='ambiente_americasul');});});
    const cat=CATS.find(c=>c.id==='gis');if(!cat||cat.grupos.some(g=>g.it?.some(i=>i.ic==='latina')))return;
    cat.grupos.push({label:'Dados internacionais',it:[{ic:'latina',nome:'América Latina',desc:'Geologia e meio ambiente · Argentina, Colômbia, Guiana Francesa e Uruguai',act:btn=>ribbonOpen(panel,btn,'América Latina · Geologia e meio ambiente')}]});
  };
  wmsInstalarBotaoAmericaDoSul();render();
})();
