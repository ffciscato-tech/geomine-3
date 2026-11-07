/* ============================================================================
   EXPORTAÇÃO
   ========================================================================== */
async function exportLayer(L, targetCRS){
  const feats=L.features.filter(f=>f.geom).map(f=>{
    let geom;
    if(L.gtype==='point'){ const c=reproj(L.crs,targetCRS,f.geom[0][0],f.geom[0][1]); geom=[c]; }
    else if(f.multi && Array.isArray(f.geom[0][0])){ geom=f.geom.map(r=>r.map(pt=>reproj(L.crs,targetCRS,pt[0],pt[1]))); }
    else { geom=f.geom.map(pt=>reproj(L.crs,targetCRS,pt[0],pt[1])); }
    return {geom, multi:f.multi, props:f.props};
  });
  const {shp,shx}=writeSHP(L.gtype, feats);
  const dbf=writeDBF(L.fields, feats.map(f=>f.props));
  const zip=new JSZip(); const base=L.name.replace(/[^\w.-]/g,'_');
  zip.file(base+'.shp',shp); zip.file(base+'.shx',shx); zip.file(base+'.dbf',dbf); zip.file(base+'.prj',prjText(targetCRS));
  const blob=await zip.generateAsync({type:'blob'}); download(blob, base+'_'+targetCRS.replace(':','')+'.zip');
}
function layerToGeoJSON(L){
  const fc={type:'FeatureCollection',features:[]};
  L.features.forEach(f=>{ if(!f.geom)return;
    const toLL=(pt,z)=>{const w=toWGS(L.crs,pt[0],pt[1]);
      return (z!=null&&isFinite(z))?[w[0],w[1],z]:[w[0],w[1]];};
    const zg=f.zg? ((f.multi&&Array.isArray(f.geom[0][0]))? f.zg : [f.zg]) : null;
    const zOf=(ri,vi)=>zg&&zg[ri]? (Array.isArray(zg[ri])?zg[ri][vi]:zg[ri]) : null;
    let geom;
    if(L.gtype==='point') geom={type:'Point',coordinates:toLL(f.geom[0], zOf(0,0))};
    else if(L.gtype==='line'){
      const ring=(f.multi&&Array.isArray(f.geom[0][0])?f.geom[0]:f.geom);
      geom={type:'LineString',coordinates:ring.map((pt,vi)=>toLL(pt, zOf(0,vi)))};
    } else {
      const rings=(f.multi&&Array.isArray(f.geom[0][0])?f.geom:[f.geom]);
      geom={type:'Polygon',coordinates:rings.map((r,ri)=>r.map((pt,vi)=>toLL(pt, zOf(ri,vi))))};
    }
    fc.features.push({type:'Feature',geometry:geom,properties:f.props});
  });
  return fc;
}
/* Caixa "salvar como" começando na ÚLTIMA PASTA usada.
   O startIn aceita um handle de ARQUIVO — o seletor abre na pasta que o contém.
   Antes usávamos h.getParent(), que NÃO existe no Chrome/Edge: o handle da pasta
   nunca era gravado e o diálogo sempre abria na raiz/Documentos.               */
async function pickSaveFile(opt){
  const o=Object.assign({}, opt);
  /* Um startIn explícito tem prioridade. Para projetos, ele é o handle do
     arquivo atualmente aberto: o Chrome/Edge abre o diálogo exatamente na
     pasta que contém esse arquivo. Para outras exportações permanece a
     última pasta utilizada. */
  if(!o.startIn){
    if(S._lastDir)o.startIn=S._lastDir;
    else o.startIn='documents';
  }
  try{ return await window.showSaveFilePicker(o); }
  catch(e){
    if(e && e.name==='AbortError') throw e;
    delete o.startIn;                       // handle antigo/removido: repete sem âncora
    return await window.showSaveFilePicker(o);
  }
}
/* Guarda o arquivo escolhido como âncora do próximo diálogo (memória + IndexedDB) */
function lembraLocal(h){
  if(!h) return;
  S._lastSaved=h; S._lastDir=h;
  try{ rememberLastDir(h); }catch(_){}
}
async function download(blob,name){
  const ext=(name.split('.').pop()||'').toLowerCase();
  const mime={json:'application/json',geojson:'application/geo+json',csv:'text/csv',
    png:'image/png',svg:'image/svg+xml',zip:'application/zip',
    ccmgis:'application/x-ccmgis'}[ext]||'application/octet-stream';
  const DESC={ccmgis:'Projeto CCMGIS', dxf:'AutoCAD DXF', geojson:'GeoJSON',
    csv:'CSV', png:'Imagem PNG', svg:'SVG', zip:'Pacote ZIP', pdf:'PDF'}[ext]
    || (ext.toUpperCase()+' file');
  // 1) Desktop: diálogo "salvar como" com escolha de pasta
  try{
    if(window.showSaveFilePicker && fsApiOK()){
      const opt={suggestedName:name, excludeAcceptAllOption:true,
        types:[{description:DESC,accept:{[mime]:['.'+ext]}}]};
      const h=await pickSaveFile(opt);
      await fileHandleWriteVerified(h,blob,name);
      lembraLocal(h);                       // âncora do próximo "salvar como"
      toast('Salvo: '+h.name); return;
    }
  }catch(e){ if(e && e.name==='AbortError') return; }
  // 2) Android: folha de compartilhamento (Files, Drive, etc.) — NUNCA para o
  // projeto .ccmgis: destinos como o Drive regravam com nome/tipo genérico
  // (.bin) quando o MIME é desconhecido. Projeto vai por download direto,
  // que preserva o nome em Downloads.
  try{
    if(ext!=='ccmgis' && navigator.canShare){
      const file=new File([blob],name,{type:mime});
      if(navigator.canShare({files:[file]})){
        await navigator.share({files:[file],title:name});
        toast('Enviado — escolha "Files"/"Drive" para salvar onde quiser');
        return;
      }
    }
  }catch(e){ if(e && e.name==='AbortError') return; }
  // 3) Fallback: download direto
  const bin=(blob&&blob.type&&blob.type!=='application/octet-stream')
    ? new Blob([blob],{type:'application/octet-stream'}) : blob;   // evita o SO trocar a extensão
  const a=document.createElement('a'); a.href=URL.createObjectURL(bin); a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  toast('Baixado em Downloads: '+name);
}

/* ============================================================================
   EXPORTAR PROJETO PARA O QGIS
   Gera um .zip com tudo em formatos nativos do QGIS:
   - camadas vetoriais: .shp/.shx/.dbf/.prj (no CRS de cada camada)
   - superfícies (MDT/TIN): .asc (ESRI ASCII grid) + .prj (CRS de trabalho)
   - ortofoto/imagem posicionada: .png + world file .pgw + .prj
   - projeto.qgs (QGIS 3.x) referenciando todos os arquivos com simbologia básica
   Basta descompactar e abrir o .qgs — ou arrastar a pasta para o QGIS.
   ========================================================================== */
function ascFromGrid(d){
  const nd=-9999;
  let out=`ncols ${d.nc}\nnrows ${d.nr}\nxllcorner ${d.xll}\nyllcorner ${d.yll}\ncellsize ${d.cs}\nNODATA_value ${nd}\n`;
  const rows=[];
  for(let r=0;r<d.nr;r++){
    const row=new Array(d.nc);
    for(let c=0;c<d.nc;c++){
      const v=d.z[r*d.nc+c];
      row[c]=isNaN(v)? nd : +v.toFixed(3);
    }
    rows.push(row.join(' '));
  }
  return out+rows.join('\n')+'\n';
}
function epsgNum(crs){ return (crs||'EPSG:4326').split(':')[1]||'4326'; }
/* <spatialrefsys> completo. Ao abrir um .qgs, o QGIS constrói o CRS da camada A PARTIR
   DESTE BLOCO — e não do .prj do shapefile. Com apenas <authid>, algumas versões não
   conseguem montar o CRS, a transformação para o CRS do projeto falha e a camada
   aparece na árvore mas NÃO DESENHA NADA. Daí "arrasto funciona, projeto vem vazio". */
function qgsSrs(crs){
  const num=epsgNum(crs);
  const wkt=prjText(crs);
  const p4=CRS_DEFS[crs]||'';
  const geo=/4326|4674|4618/.test(crs);
  const esc2=t=>String(t??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<spatialrefsys nativeFormat="Wkt">
     <wkt>${esc2(wkt)}</wkt>
     <proj4>${esc2(p4)}</proj4>
     <srsid>${num}</srsid>
     <srid>${num}</srid>
     <authid>EPSG:${num}</authid>
     <description>${esc2(CRS_LABELS[crs]||crs)}</description>
     <projectionacronym>${geo?'longlat':'utm'}</projectionacronym>
     <ellipsoidacronym>${geo?'EPSG:7030':'EPSG:7019'}</ellipsoidacronym>
     <geographicflag>${geo?'true':'false'}</geographicflag>
    </spatialrefsys>`;
}
/* ============================================================================
   KML / KMZ — Google Earth
   Atenção a duas armadilhas do formato:
   1) a cor do KML é AABBGGRR (alfa + BGR invertido), não RGBA;
   2) as coordenadas são SEMPRE lon,lat em WGS84 — nunca no CRS de trabalho.
   ========================================================================== */
function kmlColor(hex, alpha){
  const h=(hex||'#f5a524').replace('#','');
  const r=h.slice(0,2), g=h.slice(2,4), b=h.slice(4,6);
  const a=Math.round(Math.max(0,Math.min(1, alpha==null?1:alpha))*255)
            .toString(16).padStart(2,'0');
  return (a+b+g+r).toLowerCase();          // AABBGGRR
}
function kmlEsc(t){ return String(t??'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* anel -> "lon,lat,0 lon,lat,0 …" (fecha o anel se preciso) */
function kmlRing(ring, crs, fechar){
  const pts=ring.map(p=>{ const w=toWGS(crs,p[0],p[1]);
    return `${w[0].toFixed(8)},${w[1].toFixed(8)},0`; });
  if(fechar && pts.length && pts[0]!==pts[pts.length-1]) pts.push(pts[0]);
  return pts.join(' ');
}

/* Estilos: um <Style> por combinação única (evita repetir estilo em 495 linhas) */
function kmlStyleFor(L, st, reg){
  const isPoly=L.gtype==='polygon', isLine=L.gtype==='line';
  const semFill = isPoly && st.hatch==='none';
  const sig=[L.gtype, st.color, st.stroke, st.weight, st.fill, st.hatch, st.dash].join('|');
  if(reg.map.has(sig)) return reg.map.get(sig);
  const id='s'+(reg.n++);
  reg.map.set(sig,id);
  const larg=Math.max(1,(+st.weight||1));
  let xml=`<Style id="${id}">`;
  if(isPoly||isLine)
    xml+=`<LineStyle><color>${kmlColor(st.stroke||st.color,1)}</color><width>${larg}</width></LineStyle>`;
  if(isPoly)
    xml+=`<PolyStyle><color>${kmlColor(st.color, semFill?0:(st.fill??0.35))}</color>`+
         `<fill>${semFill?0:1}</fill><outline>1</outline></PolyStyle>`;
  if(L.gtype==='point')
    xml+=`<IconStyle><color>${kmlColor(st.color,1)}</color><scale>0.9</scale>`+
         `<Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>`;
  // rótulo: no KML o texto exibido é o <name> do Placemark
  const c = L.labelField ? labelCfg(L) : null;
  xml+=`<LabelStyle><color>${c?kmlColor(c.color,1):'ff000000'}</color>`+
       `<scale>${L.labelField?Math.max(0.6,(+(c&&c.size)||8)/9):0}</scale></LabelStyle>`;
  xml+='</Style>';
  reg.defs.push(xml);
  return id;
}

function kmlPlacemark(L, f, reg){
  const st=featureStyle(L,f);
  const sid=kmlStyleFor(L,st,reg);
  const nome = (L.labelField && labelText(L,f)) || '';
  const props=f.props||{};
  const ed=Object.keys(props).length
    ? '<ExtendedData>'+Object.entries(props).map(([k,v])=>
        `<Data name="${kmlEsc(k)}"><value>${kmlEsc(v)}</value></Data>`).join('')+'</ExtendedData>'
    : '';
  let geom='';
  if(L.gtype==='point'){
    const w=toWGS(L.crs, f.geom[0][0], f.geom[0][1]);
    geom=`<Point><coordinates>${w[0].toFixed(8)},${w[1].toFixed(8)},0</coordinates></Point>`;
  } else {
    const partes=(f.multi && Array.isArray(f.geom[0][0])) ? f.geom : [f.geom];
    if(L.gtype==='line'){
      const ls=partes.map(r=>`<LineString><tessellate>1</tessellate>`+
        `<coordinates>${kmlRing(r,L.crs,false)}</coordinates></LineString>`);
      geom = ls.length>1 ? `<MultiGeometry>${ls.join('')}</MultiGeometry>` : ls[0];
    } else {
      // 1º anel = externo; demais = furos
      const ext=`<outerBoundaryIs><LinearRing><coordinates>${kmlRing(partes[0],L.crs,true)}`+
                `</coordinates></LinearRing></outerBoundaryIs>`;
      const furos=partes.slice(1).map(r=>
        `<innerBoundaryIs><LinearRing><coordinates>${kmlRing(r,L.crs,true)}`+
        `</coordinates></LinearRing></innerBoundaryIs>`).join('');
      geom=`<Polygon><tessellate>1</tessellate>${ext}${furos}</Polygon>`;
    }
  }
  return `<Placemark><name>${kmlEsc(nome)}</name><styleUrl>#${sid}</styleUrl>${ed}${geom}</Placemark>`;
}

/* Sobreposição de imagem (ortofoto / raster). Usa gx:LatLonQuad: os 4 cantos
   reprojetados formam um quadrilátero — um LatLonBox alinhado aos eixos
   distorceria a imagem, já que o CRS de trabalho é UTM. */
function kmlOverlay(nome, href, b, crs, visivel, ordem){
  const c=[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]]   // SW, SE, NE, NW
    .map(([x,y])=>{ const w=toWGS(crs,x,y); return `${w[0].toFixed(8)},${w[1].toFixed(8)}`; });
  return `<GroundOverlay><name>${kmlEsc(nome)}</name>`+
    `<visibility>${visivel?1:0}</visibility><drawOrder>${ordem}</drawOrder>`+
    `<Icon><href>${href}</href></Icon>`+
    `<gx:LatLonQuad><coordinates>${c.join(' ')}</coordinates></gx:LatLonQuad>`+
    `</GroundOverlay>`;
}

/* documento KML completo, com pastas espelhando os grupos da árvore */
function kmlDoc(overlays){
  const reg={map:new Map(), defs:[], n:1};
  const corpo=[];
  const usados=new Set();
  const camadaKML=L=>{
    usados.add('L:'+L.id);
    const pms=L.features.filter(f=>f.geom && featureVisible(L,f))
      .map(f=>kmlPlacemark(L,f,reg)).join('');
    return `<Folder><name>${kmlEsc(L.name)}</name>`+
      `<visibility>${L.visible!==false?1:0}</visibility>${pms}</Folder>`;
  };
  displayList().forEach(it=>{
    if(it.kind==='group'){
      const membros=groupMembers(it.g.id).filter(n=>n.t==='L').map(n=>n.o);
      if(!membros.length) return;
      corpo.push(`<Folder><name>${kmlEsc(it.g.name)}</name>`+
        `<open>${it.g.collapsed?0:1}</open>`+
        membros.map(camadaKML).join('')+`</Folder>`);
      return;
    }
    if(it.kind!=='layer') return;
    if(usados.has('L:'+it.n.o.id) || it.n.o.groupId!=null) return;
    corpo.push(camadaKML(it.n.o));
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document>
<name>CCMGIS</name>
${reg.defs.join('\n')}
${(overlays||[]).join('\n')}
${corpo.join('\n')}
</Document>
</kml>
`;
}

/* KMZ do projeto inteiro: doc.kml + imagens das sobreposições */
async function exportProjectKMZ(){
  if(!S.layers.length && !S.img && !(S.rasters||[]).length){ toast('Nada para exportar'); return; }
  showLoad('Gerando KMZ…');
  try{
    const zip=new JSZip();
    const files=zip.folder('files');
    const ovs=[]; let ordem=0;
    const b64=(dataURL)=>dataURL.split(',')[1];

    // ortofoto / imagem de fundo
    if(S.img && S.img.url){
      const nome='ortofoto.png';
      let data=S.img.url;
      if(!/^data:/.test(data)){
        const buf=await (await fetch(data)).arrayBuffer();
        files.file(nome, buf);
      } else files.file(nome, b64(data), {base64:true});
      ovs.push(kmlOverlay(S.img.name||'Ortoimagem','files/'+nome, S.img.b, S.workCRS,
        S.img.visible!==false, ordem++));
    }
    // rasters (MDE etc.) renderizados com a rampa vigente
    (S.rasters||[]).forEach((R,i)=>{
      const cv=rasterCanvas(R); if(!cv) return;
      const nome=`raster${i}.png`;
      files.file(nome, b64(cv.toDataURL('image/png')), {base64:true});
      ovs.push(kmlOverlay(R.name,'files/'+nome, rasterBounds(R), S.workCRS,
        R.visible!==false, ordem++));
    });

    zip.file('doc.kml', kmlDoc(ovs));
    const blob=await zip.generateAsync({type:'blob', compression:'DEFLATE'});
    hideLoad();
    download(blob,'CCMGIS.kmz');
    toast(`KMZ gerado · ${S.layers.length} camada(s) · ${ovs.length} sobreposição(ões)`);
  }catch(e){ hideLoad(); toast('Falha ao gerar o KMZ: '+e.message); }
}

/* KML de uma camada só (texto puro, sem imagens) */
function layerToKML(L){
  const reg={map:new Map(), defs:[], n:1};
  const pms=L.features.filter(f=>f.geom).map(f=>kmlPlacemark(L,f,reg)).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document><name>${kmlEsc(L.name)}</name>
${reg.defs.join('\n')}
<Folder><name>${kmlEsc(L.name)}</name>${pms}</Folder>
</Document></kml>
`;
}

/* ---- Simbologia e rótulos no formato do QGIS 3.x ---- */
const QGIS_BRUSH={ solid:'solid', none:'no', fdiagonal:'f_diagonal', bdiagonal:'b_diagonal',
  cross:'cross', horizontal:'horizontal', vertical:'vertical', dots:'dense5' };
const QGIS_PEN={ '':'solid', '6 4':'dash', '4 3':'dash', '1.5 4':'dot', '1 2':'dot',
  '2 2':'dot', '10 4 2 4':'dash dot', '14 4 2 4 2 4':'dash dot dot' };
// padrões fora dos presets do Qt saem como custom dash (mm) no QGIS

function qRGBA(hex, alpha){
  const h=(hex||'#f5a524').replace('#','');
  const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
  const a=Math.round(Math.max(0,Math.min(1, alpha==null?1:alpha))*255);
  return `${r},${g},${b},${a}`;
}
/* Um <symbol> do QGIS a partir de um estilo do CCMGIS */
function qgsSymbol(gtype, st, name){
  const O=(k,v)=>`      <Option type="QString" name="${k}" value="${v}"/>`;
  if(gtype==='point'){
    return `   <symbol type="marker" name="${name}" alpha="1" force_rhr="0" clip_to_extent="1">
    <layer class="SimpleMarker" enabled="1" pass="0" locked="0">
     <Option type="Map">
${O('name','circle')}
${O('color', qRGBA(st.color,1))}
${O('outline_color', qRGBA(st.stroke||st.color,1))}
${O('outline_width', String((+st.weight||1)*0.26))}
${O('outline_width_unit','MM')}
${O('size','2.4')}
${O('size_unit','MM')}
     </Option>
    </layer>
   </symbol>`;
  }
  if(gtype==='line'){
    return `   <symbol type="line" name="${name}" alpha="1" force_rhr="0" clip_to_extent="1">
    <layer class="SimpleLine" enabled="1" pass="0" locked="0">
     <Option type="Map">
${O('line_color', qRGBA(st.stroke||st.color,1))}
${O('line_width', String((+st.weight||1)*0.26))}
${O('line_width_unit','MM')}
${O('line_style', QGIS_PEN[st.dash||''] || (st.dash?'solid':'solid'))}
${st.dash && !QGIS_PEN[st.dash] ? O('use_custom_dash','1')+'\n'+O('customdash', st.dash.trim().split(/\s+/).map(v=>((+v)*0.26).toFixed(2)).join(';'))+'\n'+O('customdash_unit','MM') : ''}
${O('capstyle','round')}
${O('joinstyle','round')}
     </Option>
    </layer>
   </symbol>`;
  }
  // polígono: preenchimento (com hachura ou "sem preenchimento") + contorno
  const brush = QGIS_BRUSH[st.hatch] || 'solid';   // hachuras geológicas caem em sólido
  const semFill = (st.hatch==='none');
  return `   <symbol type="fill" name="${name}" alpha="1" force_rhr="0" clip_to_extent="1">
    <layer class="SimpleFill" enabled="1" pass="0" locked="0">
     <Option type="Map">
${O('style', brush)}
${O('color', qRGBA(st.color, semFill?0:(st.fill??0.35)))}
${O('outline_color', qRGBA(st.stroke||st.color,1))}
${O('outline_width', String((+st.weight||1)*0.26))}
${O('outline_width_unit','MM')}
${O('outline_style', QGIS_PEN[st.dash||''] || 'solid')}
     </Option>
    </layer>
   </symbol>`;
}
/* renderer: símbolo único, graduado ou categorizado — o mesmo que está na tela */
function qgsRenderer(L, esc2){
  const s=L.sym||{}, g=L.gtype;
  const cls = (s.mode==='grad') ? s.classes : (s.mode==='cat' ? s.cats : null);
  if(!cls || !cls.length){
    return `  <renderer-v2 type="singleSymbol" forceraster="0" symbollevels="0" enableorderby="0">
   <symbols>
${qgsSymbol(g, {color:s.color, stroke:s.stroke||s.color, hatch:s.hatch, weight:s.weight, fill:s.fill, dash:s.dash}, '0')}
   </symbols>
  </renderer-v2>`;
  }
  const mix=c=>({color:c.color, stroke:c.stroke||s.stroke||c.color, hatch:c.hatch??s.hatch,
                 weight:c.weight??s.weight, fill:c.fill??s.fill, dash:c.dash??s.dash});
  const syms=cls.map((c,i)=>qgsSymbol(g, mix(c), String(i))).join('\n');
  if(s.mode==='grad'){
    const ranges=cls.map((c,i)=>
      `    <range lower="${c.min}" upper="${c.max}" symbol="${i}" label="${esc2(fmt(c.min)+' – '+fmt(c.max))}" render="${c.vis===false?'false':'true'}"/>`).join('\n');
    return `  <renderer-v2 type="graduatedSymbol" attr="${esc2(s.field)}" graduatedMethod="GraduatedColor" forceraster="0" symbollevels="0" enableorderby="0">
   <ranges>
${ranges}
   </ranges>
   <symbols>
${syms}
   </symbols>
  </renderer-v2>`;
  }
  const cats=cls.map((c,i)=>
    `    <category value="${esc2(c.value)}" symbol="${i}" label="${esc2(c.value)}" render="${c.vis===false?'false':'true'}"/>`).join('\n');
  return `  <renderer-v2 type="categorizedSymbol" attr="${esc2(s.field)}" forceraster="0" symbollevels="0" enableorderby="0">
   <categories>
${cats}
   </categories>
   <symbols>
${syms}
   </symbols>
  </renderer-v2>`;
}
/* rótulos (aba Rótulos) -> <labeling> do QGIS */
function qgsLabeling(L, esc2){
  if(!L.labelField) return '';
  const c=labelCfg(L);
  const fam=(c.font||'').split(',')[0].replace(/['"]/g,'').trim() || 'Signika';
  const bold=c.style.includes('bold')?'75':'50';       // QFont::Bold = 75, Normal = 50
  const ital=c.style.includes('italic')?'1':'0';
  const halo=(+c.haloW||0)>0;
  // placement: 0 = AroundPoint, 1 = OverPoint, 2 = Line, 3 = Curved, 4 = Horizontal (polígono)
  const place = L.gtype==='line' ? '2' : (L.gtype==='polygon' ? '1' : (c.place==='center'?'1':'0'));
  return `  <labeling type="simple">
   <settings>
    <text-style fieldName="${esc2(L.labelField)}" isExpression="0" fontFamily="${esc2(fam)}" fontSize="${+c.size||8}" fontSizeUnit="Point" fontWeight="${bold}" fontItalic="${ital}" textColor="${qRGBA(c.color,1)}" textOpacity="1">
     <text-buffer bufferDraw="${halo?'1':'0'}" bufferSize="${(+c.haloW||0)*0.5}" bufferSizeUnits="MM" bufferColor="${qRGBA(c.halo,1)}" bufferOpacity="1" bufferJoinStyle="128"/>
    </text-style>
    <text-format/>
    <placement placement="${place}" xOffset="${+c.dx||0}" yOffset="${+c.dy||0}" offsetUnits="MM"/>
    <rendering/>
   </settings>
  </labeling>`;
}

/* Estilo avulso (.qml) — o QGIS carrega automaticamente um .qml de mesmo nome do .shp.
   É a rede de segurança: mesmo que o projeto.qgs não abra, arrastar o shapefile
   para o QGIS já traz simbologia e rótulos. */
function qmlStyle(L){
  const esc2=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const gt = L.gtype==='point'?'0' : L.gtype==='line'?'1' : '2';
  const lab=qgsLabeling(L, esc2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.28.0-Firenze" styleCategories="AllStyleCategories">
 <layerGeometryType>${gt}</layerGeometryType>
${qgsRenderer(L, esc2)}
${lab}
 <blendMode>0</blendMode>
 <featureBlendMode>0</featureBlendMode>
 <layerOpacity>1</layerOpacity>
</qgis>
`;
}

function qgsProject(items){
  // items: [{kind:'vector'|'raster'|'image', name, file, crs, gtype?, L?, visible?, groupId?}]
  const esc2=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const uidq=n=>String(n).replace(/[^\w]/g,'_')+'_'+Math.random().toString(36).slice(2,8);
  const layers=items.map(it=>({...it, id:uidq(it.name)}));
  const byKey={}; layers.forEach(l=>{ if(l.key) byKey[l.key]=l; });

  const chk=l=>l.visible===false?'Qt::Unchecked':'Qt::Checked';
  const treeLayer=l=>
    `    <layer-tree-layer name="${esc2(l.name)}" id="${l.id}" source="./${esc2(l.file)}" checked="${chk(l)}" expanded="1" providerKey="${l.kind==='vector'?'ogr':'gdal'}"/>`;

  // ---- árvore com GRUPOS, na mesma ordem e hierarquia da tela ----
  let tree='';
  const usados=new Set();
  displayList().forEach(it=>{
    if(it.kind==='group'){
      const membros=groupMembers(it.g.id)
        .map(n=>byKey[nodeKey(n.t,n.id)]).filter(Boolean);
      if(!membros.length) return;
      membros.forEach(l=>usados.add(l.id));
      const vis=membros.every(l=>l.visible!==false);
      tree+=`   <layer-tree-group name="${esc2(it.g.name)}" checked="${vis?'Qt::Checked':'Qt::Unchecked'}" expanded="${it.g.collapsed?'0':'1'}">\n`+
            membros.map(l=>'  '+treeLayer(l)).join('\n')+`\n   </layer-tree-group>`;
      tree+='\n';
      return;
    }
    const l=byKey[nodeKey(it.n.t,it.n.id)];
    if(!l || usados.has(l.id) || l.groupId!=null) return;
    usados.add(l.id);
    tree+=treeLayer(l)+'\n';
  });
  // qualquer coisa que não esteja na pilha (não deveria haver) entra no fim
  layers.forEach(l=>{ if(!usados.has(l.id)) tree+=treeLayer(l)+'\n'; });

  const maplayers=layers.map(l=>{
    const geomAttr=l.kind==='vector'? ` geometry="${l.gtype==='point'?'Point':l.gtype==='line'?'Line':'Polygon'}"`:'';
    let corpo='';
    if(l.kind==='vector' && l.L){
      corpo = '\n'+qgsRenderer(l.L, esc2);
      const lab=qgsLabeling(l.L, esc2);
      if(lab) corpo += '\n'+lab;
    }
    const ext=l.ext ? `
   <extent><xmin>${l.ext[0]}</xmin><ymin>${l.ext[1]}</ymin><xmax>${l.ext[2]}</xmax><ymax>${l.ext[3]}</ymax></extent>` : '';
    return `  <maplayer type="${l.kind==='vector'?'vector':'raster'}"${geomAttr} hasScaleBasedVisibilityFlag="0" autoRefreshEnabled="0" refreshOnNotifyEnabled="0" styleCategories="AllStyleCategories">
   <id>${l.id}</id>
   <datasource>./${esc2(l.file)}</datasource>
   <layername>${esc2(l.name)}</layername>${ext}
   <srs>${qgsSrs(l.crs)}</srs>
   <provider${l.kind==='vector'?' encoding="UTF-8"':''}>${l.kind==='vector'?'ogr':'gdal'}</provider>
   <customproperties/>
   <blendMode>0</blendMode>${corpo}
  </maplayer>`;}).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis projectname="CCMGIS" version="3.28.0-Firenze">
 <title>CCMGIS — exportado em ${new Date().toLocaleDateString('pt-BR')}</title>
 <projectCrs>${qgsSrs(S.workCRS)}</projectCrs>
 <layer-tree-group>
${tree} </layer-tree-group>
 <projectlayers>
${maplayers}
 </projectlayers>
 <layerorder>
${layers.map(l=>`  <layer id="${l.id}"/>`).join('\n')}
 </layerorder>
</qgis>
`;
}
async function exportProjectQGIS(){
  if(!S.layers.length && !S.rasters.length && !(S.img&&S.img.url)){
    toast('Nada para exportar'); return;
  }
  showLoad('Montando pacote QGIS…');
  try{
    const zip=new JSZip();
    const items=[];
    const used=new Set();
    const safe=n=>{ let b=n.replace(/[^\w.-]/g,'_').slice(0,60)||'camada';
      let s=b,k=1; while(used.has(s)) s=b+'_'+(k++); used.add(s); return s; };

    // vetores (no CRS original de cada camada — o .prj informa o QGIS)
    for(const L of S.layers){
      const base=safe(L.name);
      showLoad('Vetor: '+L.name);
      await new Promise(r=>setTimeout(r,0));
      const feats=L.features.filter(f=>f.geom).map(f=>({geom:f.geom,multi:f.multi,props:f.props}));
      const {shp,shx}=writeSHP(L.gtype,feats);
      const dbf=writeDBF(L.fields&&L.fields.length?L.fields:[{name:'FID',type:'N',length:9,decimal:0}],
        feats.map((f,i)=>f.props&&Object.keys(f.props).length?f.props:{FID:i}));
      zip.file(base+'.shp',shp); zip.file(base+'.shx',shx);
      zip.file(base+'.dbf',dbf); zip.file(base+'.prj',prjText(L.crs));
      zip.file(base+'.cpg','UTF-8');            // acentos no DBF
      zip.file(base+'.qml', qmlStyle(L));       // estilo + rótulos avulsos
      // extensão da camada (o QGIS usa para enquadrar; sem ela algumas versões reclamam)
      let ex=[Infinity,Infinity,-Infinity,-Infinity];
      feats.forEach(f=>{ const pts=(L.gtype==='point')? f.geom
          : (f.multi && Array.isArray(f.geom[0][0]) ? f.geom.flat() : f.geom);
        pts.forEach(pt=>{ if(pt[0]<ex[0])ex[0]=pt[0]; if(pt[1]<ex[1])ex[1]=pt[1];
                          if(pt[0]>ex[2])ex[2]=pt[0]; if(pt[1]>ex[3])ex[3]=pt[1]; }); });
      if(!isFinite(ex[0])) ex=null;
      items.push({kind:'vector', name:L.name, file:base+'.shp', crs:L.crs, gtype:L.gtype, ext:ex,
        L, key:nodeKey('L',L.id), visible:L.visible!==false, groupId:L.groupId??null});
    }
    // superfícies -> ASCII grid
    for(const R of S.rasters){
      const base=safe(R.name);
      showLoad('Superfície: '+R.name);
      await new Promise(r=>setTimeout(r,0));
      zip.file(base+'.asc', ascFromGrid(R.d));
      zip.file(base+'.prj', prjText(S.workCRS));
      items.push({kind:'raster', name:R.name, file:base+'.asc', crs:S.workCRS,
        key:nodeKey('R',R.id), visible:R.visible!==false, groupId:R.groupId??null});
    }
    // ortofoto/imagem posicionada -> PNG + world file
    if(S.img && S.img.url && S.img.b){
      showLoad('Ortofoto…');
      const img=new Image();
      await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=S.img.url;});
      const cv=document.createElement('canvas'); cv.width=img.naturalWidth; cv.height=img.naturalHeight;
      cv.getContext('2d').drawImage(img,0,0);
      const blob=await new Promise(r=>cv.toBlob(r,'image/png'));
      const b=S.img.b; // [W,S,E,N] no CRS de trabalho
      const px=(b[2]-b[0])/cv.width, py=(b[3]-b[1])/cv.height;
      // world file: linha1 px, 0, 0, -py, X do centro do 1º pixel, Y do centro do 1º pixel
      const pgw=`${px}\n0\n0\n${-py}\n${b[0]+px/2}\n${b[3]-py/2}\n`;
      zip.file('ortofoto.png',blob);
      zip.file('ortofoto.pgw',pgw);
      zip.file('ortofoto.prj',prjText(S.workCRS));
      items.push({kind:'image', name:S.img.name||'Ortofoto', file:'ortofoto.png', crs:S.workCRS,
        key:nodeKey('I',0), visible:S.img.visible!==false, groupId:S.img.groupId??null});
    }
    // projeto QGIS
    zip.file('projeto.qgs', qgsProject(items));
    zip.file('LEIA-ME.txt',
`Pacote gerado pelo CCMGIS em ${new Date().toLocaleString('pt-BR')}.
1) Descompacte TUDO numa pasta (mantenha os arquivos juntos).
2) Abra o projeto.qgs no QGIS 3.x — ou arraste os arquivos direto para o QGIS.
Vetores: .shp com .prj no CRS de origem de cada camada.
Superfícies: .asc (ESRI ASCII grid) no CRS de trabalho (${S.workCRS}).
Ortofoto: .png + world file .pgw no CRS de trabalho.
Cada vetor tem um .qml de mesmo nome: se o projeto.qgs nao abrir, basta arrastar o
.shp para o QGIS que a simbologia e os rotulos vem juntos.\n`);
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
    hideLoad();
    download(blob,'alagis_qgis.zip');
    toast(`Pacote QGIS: ${items.length} camada(s)`);
  }catch(e){ hideLoad(); toast('Falha na exportação: '+e.message); }
}

/* menu Importar/Exportar QGIS ancorado no botão */
(function(){
  const btn=document.getElementById('btnQGIS');
  const inp=document.getElementById('qgisIn');
  let menu=null;
  function closeMenu(){ if(menu){menu.remove();menu=null;} }
  btn.onclick=(e)=>{
    e.stopPropagation();
    if(menu){ closeMenu(); return; }
    const r=btn.getBoundingClientRect();
    menu=document.createElement('div'); menu.className='a3-float-menu';
    menu.style.cssText=`position:fixed;top:${r.bottom+4}px;left:${Math.max(8,r.right-230)}px;z-index:3200;`+
      'background:var(--panel,#151b26);border:1px solid var(--line,#2a3446);border-radius:10px;'+
      'box-shadow:0 8px 26px #000a;min-width:230px;overflow:hidden;font-size:13px';
    menu.innerHTML=
      `<div class="qmp" style="padding:10px 12px;cursor:pointer;display:flex;gap:8px;align-items:center">📁 <div><b>Importar PASTA do projeto</b><br><span style="font-size:11px;color:var(--ink-dim)">aponte a pasta com o .qgs e os dados — sem zipar</span></div></div>`+
      `<div class="qmi" style="padding:10px 12px;cursor:pointer;border-top:1px solid var(--line,#2a3446);display:flex;gap:8px;align-items:center">⬆ <div><b>Importar arquivos</b><br><span style="font-size:11px;color:var(--ink-dim)">ZIP, ou .qgs/.qgz com os dados já carregados</span></div></div>`+
      `<div class="qmx" style="padding:10px 12px;cursor:pointer;border-top:1px solid var(--line,#2a3446);display:flex;gap:8px;align-items:center">⬇ <div><b>Exportar para o QGIS</b><br><span style="font-size:11px;color:var(--ink-dim)">shp/asc/ortofoto + projeto.qgs</span></div></div>`;
    document.body.appendChild(menu);
    popupFitViewport(menu,r.right-230,r.bottom+4,8);
    menu.querySelector('.qmi').onclick=()=>{ closeMenu(); inp.value=''; inp.click(); };
    menu.querySelector('.qmp').onclick=()=>{ closeMenu();
      const d=document.getElementById('qgisDirIn'); if(d){ d.value=''; d.click(); } };
    menu.querySelector('.qmx').onclick=()=>{ closeMenu(); exportProjectQGIS(); };
    setTimeout(()=>document.addEventListener('click',closeMenu,{once:true}),0);
  };
  inp.addEventListener('change',async()=>{
    if(inp.files && inp.files.length) await handleFiles(inp.files);
  });
  { const d=document.getElementById('qgisDirIn');
    if(d) d.addEventListener('change',async()=>{
      if(d.files && d.files.length) await importQgisPasta(d.files);
    }); }
})();
/* Saídas do projeto concentradas no botão compacto Exportar. Os nomes de
   formatos aparecem somente depois que o usuário escolhe o tipo de produto. */
(function(){
  const btn=document.getElementById('btnExport');
  if(!btn) return;
  let menu=null;
  const close=()=>{ if(menu){ menu.remove(); menu=null; } };
  btn.onclick=(e)=>{
    e.stopPropagation();
    if(menu){ close(); return; }
    const r=btn.getBoundingClientRect();
    menu=document.createElement('div'); menu.className='a3-float-menu';
    menu.style.cssText=`position:fixed;top:${r.bottom+4}px;left:${Math.max(8,r.right-250)}px;z-index:3200;`+
      'background:var(--panel,#151b26);border:1px solid var(--line,#2a3446);border-radius:10px;'+
      'box-shadow:0 8px 26px #000a;min-width:250px;overflow:hidden;font-size:13px';
    const item=(icon,tit,sub,brd)=>`<div class="xmi" style="padding:10px 12px;cursor:pointer;display:flex;gap:9px;`+
      `align-items:center${brd?';border-top:1px solid var(--line,#2a3446)':''}">${icon} <div><b>${tit}</b>`+
      (sub?`<br><span style="font-size:11px;color:var(--ink-dim)">${sub}</span>`:'')+'</div></div>';
    const L=(typeof activeLayer==='function')? activeLayer() : null;
    menu.innerHTML=
      item('⬇', 'Camada ativa', L? esc(L.name)+' — escolher formato' : 'nenhuma camada ativa', false)+
      item('🌐', 'Projeto completo', 'abrir em visualizador geográfico', true)+
      item('↺', 'Recuperar projeto', 'última cópia automática do navegador', true)+
      item('⛰', 'DXF 3D — cava/pilha', 'cristas, pés, rampas e eixo com cotas Z reais', true);
    document.body.appendChild(menu);
    popupFitViewport(menu,r.right-250,r.bottom+4,8);
    const its=menu.querySelectorAll('.xmi');
    its[0].onclick=()=>{ close(); if(L) exportLayerAs(L); else toast('Sem camada ativa'); };
    its[1].onclick=()=>{ close(); if(typeof exportProjectKMZ==='function') exportProjectKMZ(); };
    its[2].onclick=()=>{ close(); if(typeof recuperarAutosave==='function') recuperarAutosave(); };
    its[3].onclick=()=>{ close(); if(typeof rb31ExportaDXF==='function') rb31ExportaDXF();
      else toast('Exportação da cava indisponível'); };
    setTimeout(()=>document.addEventListener('click',close,{once:true}),0);
  };
})();
