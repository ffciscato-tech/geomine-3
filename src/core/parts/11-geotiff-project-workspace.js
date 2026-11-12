/* ===========================================================================
   ESCRITA DE GeoTIFF float32 (sem biblioteca)
   TIFF little-endian, faixa única, sem compressão, com as tags de
   georreferência: ModelPixelScale (33550), ModelTiepoint (33922),
   GeoKeyDirectory (34735), GeoAsciiParams (34737) e GDAL_NODATA (42113).
   Layout: cabeçalho | dados | IFD | valores fora de linha.
   =========================================================================== */
function gridParaGeoTIFF(g, crs, nodata){
  const nc=g.nc, nr=g.nr, ND=(nodata===undefined?-9999:nodata);
  const csx=g.cs, csy=(g.csy||g.cs);
  const ytop=g.yll+nr*csy;
  const epsg=parseInt(String(crs||'').replace(/[^0-9]/g,''),10)||0;
  const crsDef=(typeof CRS_DEFS!=='undefined'&&CRS_DEFS[crs])||'';
  const geog=/\+proj=(?:longlat|latlong)\b/i.test(String(crsDef))||/4326|4674|4618|4989/.test(String(crs||''));
  const gk=[1,1,0,3, 1024,0,1,(geog?2:1), 1025,0,1,1, (geog?2048:3072),0,1,epsg];
  const nomeCRS=(typeof CRS_LABELS!=='undefined' && CRS_LABELS[crs]) ? CRS_LABELS[crs] : (crs||'desconhecido');
  const ascii=nomeCRS+'|';
  const ndTxt=String(ND)+'\u0000';

  const dados=nc*nr*4;
  const ini=8, ifd=ini+dados;
  const tags=[];                       // {tag,type,count,valor|offsetLen}
  const push=(tag,type,count,val)=>tags.push({tag,type,count,val});
  push(256,3,1,nc); push(257,3,1,nr); push(258,3,1,32); push(259,3,1,1);
  push(262,3,1,1);  push(273,4,1,ini); push(277,3,1,1); push(278,4,1,nr);
  push(279,4,1,dados); push(339,3,1,3);
  push(33550,12,3,[csx,csy,0]);
  push(33922,12,6,[0,0,0,g.xll,ytop,0]);
  push(34735,3,gk.length,gk);
  push(34737,2,ascii.length,ascii);
  push(42113,2,ndTxt.length,ndTxt);
  tags.sort((a,b)=>a.tag-b.tag);
  const nIFD=2+12*tags.length+4;
  let fora=ifd+nIFD, extra=0;
  const tam=t=>{ const s={1:1,2:1,3:2,4:4,12:8}[t.type]||1; return s*t.count; };
  tags.forEach(t=>{ const n=tam(t); if(n>4){ t.off=fora+extra; extra+=n+(n%2); } });
  const total=fora+extra;
  const buf=new ArrayBuffer(total), dv=new DataView(buf), u8=new Uint8Array(buf);
  dv.setUint16(0,0x4949,true); dv.setUint16(2,42,true); dv.setUint32(4,ifd,true);
  // dados (linha 0 = topo, igual à grade)
  const z=g.z;
  for(let k=0;k<nc*nr;k++){ const v=z[k]; dv.setFloat32(ini+k*4, (v===undefined||isNaN(v))?ND:v, true); }
  dv.setUint16(ifd,tags.length,true);
  let o=ifd+2;
  const escreve=(t,pos)=>{
    if(t.type===2){ for(let i=0;i<t.count;i++) u8[pos+i]=t.val.charCodeAt(i)&0xff; }
    else if(t.type===3){ const a=Array.isArray(t.val)?t.val:[t.val];
      a.forEach((v,i)=>dv.setUint16(pos+i*2,v,true)); }
    else if(t.type===4){ const a=Array.isArray(t.val)?t.val:[t.val];
      a.forEach((v,i)=>dv.setUint32(pos+i*4,v,true)); }
    else if(t.type===12){ t.val.forEach((v,i)=>dv.setFloat64(pos+i*8,v,true)); }
  };
  tags.forEach(t=>{
    dv.setUint16(o,t.tag,true); dv.setUint16(o+2,t.type,true); dv.setUint32(o+4,t.count,true);
    if(tam(t)<=4) escreve(t,o+8); else { dv.setUint32(o+8,t.off,true); escreve(t,t.off); }
    o+=12;
  });
  dv.setUint32(ifd+2+12*tags.length,0,true);
  return buf;
}
/* Pasta de trabalho local. O File System Access API exige uma escolha explícita
   do usuário; o handle autorizado é guardado no IndexedDB para ser reutilizado. */
let PROJECT_DIR_HANDLE=null;
function projectSafeName(s,ext){
  const b=String(s||'produto').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\w.-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,90)||'produto';
  return b+(ext||'');
}
function projectDB(){
  return new Promise((ok,no)=>{
    const q=indexedDB.open('ALAGIS_WORKSPACE',1);
    q.onupgradeneeded=()=>q.result.createObjectStore('handles');
    q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);
  });
}
async function projectHandleStore(h){
  const db=await projectDB();
  await new Promise((ok,no)=>{const t=db.transaction('handles','readwrite');
    t.objectStore('handles').put(h,'root');t.oncomplete=ok;t.onerror=()=>no(t.error);});
  db.close();
}
async function projectHandleLoad(){
  try{
    const db=await projectDB(),h=await new Promise((ok,no)=>{const t=db.transaction('handles');
      const q=t.objectStore('handles').get('root');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error);});
    db.close();return h||null;
  }catch(e){return null;}
}
async function projectPerm(h,ask){
  if(!h)return false;
  const o={mode:'readwrite'};
  let p=await h.queryPermission(o);
  if(p!=='granted'&&ask)p=await h.requestPermission(o);
  return p==='granted';
}
function projectFolderStatus(txt,ok){
  const e=document.getElementById('projectFolderOut');if(e)e.innerHTML=
    `<span style="color:${ok?'#39a85b':'var(--amber)'}">${txt}</span>`;
}
async function projectDirs(ask,readOnly=false){
  if(!PROJECT_DIR_HANDLE)PROJECT_DIR_HANDLE=await projectHandleLoad();
  if(readOnly){
    try{
      if(!PROJECT_DIR_HANDLE||await PROJECT_DIR_HANDLE.queryPermission({mode:'read'})!=='granted')return null;
      const raiz=await PROJECT_DIR_HANDLE.getDirectoryHandle('ALAGIS');
      return {raiz,rasters:await raiz.getDirectoryHandle('rasters')};
    }catch(_){return null;}
  }
  if(!await projectPerm(PROJECT_DIR_HANDLE,ask))return null;
  const raiz=await PROJECT_DIR_HANDLE.getDirectoryHandle('ALAGIS',{create:true});
  return {raiz,rasters:await raiz.getDirectoryHandle('rasters',{create:true})};
}
async function projectWrite(dir,name,data){
  const f=await dir.getFileHandle(name,{create:true});
  return await fileHandleWriteVerified(f,data,name);
}

/* Escrita confirmada para File System Access. createWritable trabalha numa
   cópia temporária e só publica no close(); depois disso conferimos o tamanho
   realmente visível. Assim uma falha de provedor/sincronizador não é anunciada
   como sucesso e um arquivo de 0 byte nunca passa silenciosamente. */
/* Verificação integral do JSON .ccmgis por janelas pequenas. Os GeoTIFFs
   nativos usam seu descritor amostrado; não reler vários GB em toda cópia. */
async function projectVerifyFileBytes(file,pieces,label){
  const chunkSize=1024*1024,enc=new TextEncoder();let offset=0;
  if(typeof file.slice!=='function'){
    // Compatibilidade com doubles/implementações pequenas sem Blob.slice.
    if(file.size>8*1024*1024||typeof file.text!=='function')throw new Error('não foi possível verificar o conteúdo gravado');
    file=new Blob([await file.text()]);
  }
  for await(const piece of pieces){
    const expected=typeof piece==='string'?enc.encode(piece):piece instanceof ArrayBuffer
      ?new Uint8Array(piece):new Uint8Array(piece.buffer,piece.byteOffset||0,piece.byteLength);
    for(let start=0;start<expected.byteLength;start+=chunkSize){
      const length=Math.min(chunkSize,expected.byteLength-start);
      const actual=new Uint8Array(await file.slice(offset,offset+length).arrayBuffer());
      if(actual.byteLength!==length)throw new Error('conteúdo gravado incompleto'+(label?' em '+label:''));
      for(let i=0;i<length;i++)if(actual[i]!==expected[start+i])
        throw new Error('conteúdo gravado difere do projeto salvo'+(label?' em '+label:''));
      offset+=length;
    }
  }
  if(offset!==file.size)throw new Error('conteúdo gravado tem tamanho diferente do snapshot');
  return true;
}
async function fileHandleWriteVerified(handle,data,label){
  const blob=data instanceof Blob?data:new Blob([data],{type:'application/octet-stream'}),
    esperado=blob.size;
  if(!(esperado>0))throw new Error('conteúdo vazio; gravação cancelada antes de criar o arquivo');
  let w=null,phase='open';
  try{
    w=await handle.createWritable();
    phase='write';
    await w.write(blob);
    phase='close';await w.close();w=null;phase='verify';
    if(/\.ccmgis$/i.test(label||handle.name||'')&&window.GeoMineSaveVerification){
      async function* expectedChunks(){
        for(let offset=0;offset<blob.size;offset+=1024*1024)
          yield new Uint8Array(await blob.slice(offset,offset+1024*1024).arrayBuffer());
      }
      return await GeoMineSaveVerification.verify(handle,esperado,expectedChunks,label||handle.name);
    }
    const salvo=await handle.getFile();
    if(salvo.size!==esperado)throw new Error('tamanho gravado '+salvo.size+
      ' bytes; esperado '+esperado+' bytes'+(label?' em '+label:''));
    if(/\.ccmgis$/i.test(label||handle.name||'')){
      async function* expectedChunks(){
        for(let offset=0;offset<blob.size;offset+=1024*1024)
          yield new Uint8Array(await blob.slice(offset,offset+1024*1024).arrayBuffer());
      }
      await projectVerifyFileBytes(salvo,expectedChunks(),label||handle.name);
    }
    return salvo;
  }catch(e){
    if(w&&typeof w.abort==='function')try{await w.abort();}catch(_){}
    throw window.GeoMineSaveVerification?GeoMineSaveVerification.failure(e,phase):e;
  }
}
async function projectChooseFolder(){
  if(!window.showDirectoryPicker){
    toast('Este navegador não permite gravar pastas diretamente. Use Chrome/Edge ou exporte manualmente.');return;
  }
  try{
    PROJECT_DIR_HANDLE=await showDirectoryPicker({mode:'readwrite',id:'alagis-project'});
    await projectHandleStore(PROJECT_DIR_HANDLE);
    const ds=await projectDirs(true);
    if(!ds)throw new Error('permissão de escrita não concedida');
    projectFolderStatus('✓ ALAGIS/rasters pronta',true);
    toast('Pasta de trabalho CCMGIS configurada');
    return true;
  }catch(e){if(e&&e.name!=='AbortError')toast('Não foi possível preparar a pasta: '+(e.message||e));return false;}
}
function projectCRSForLocation(lat,lng){
  const zone=Math.max(18,Math.min(25,Math.floor((+lng+180)/6)+1));
  if(+lat>=0 && zone<=22) return 'EPSG:'+(31954+zone);
  return 'EPSG:'+(31960+zone);
}
function projectCRSOptions(selected){
  const keep=['EPSG:4674'];
  for(let z=18;z<=22;z++)keep.push('EPSG:'+(31954+z));
  for(let z=18;z<=25;z++)keep.push('EPSG:'+(31960+z));
  return keep.map(k=>`<option value="${k}"${k===selected?' selected':''}>${esc(CRS_LABELS[k]||k)}</option>`).join('');
}
async function startNewProjectWizard(){
  if((typeof hasContent==='function'?hasContent():(S.layers.length||S.rasters.length||S.img)) &&
     !confirm('Iniciar um projeto novo? O trabalho atual não salvo será perdido.')) return;
  let loc={lat:-14.2,lng:-51.9}, marker=null, miniMap=null, folderOK=false;
  const bg=document.createElement('div');bg.className='modal-bg on';bg.id='newProjectWizard';
  bg.innerHTML=`<div class="modal" style="width:min(900px,97vw);max-height:95vh">
    <div class="modal-h"><b>🗺 Novo projeto CCMGIS</b><span class="tag">localização · SIRGAS 2000 · pasta</span>
      <div style="flex:1"></div><button class="tbtn" data-np="close">Fechar</button></div>
    <div class="modal-b">
      <div class="row2">
        <div><label class="field">Nome do projeto</label><input id="npName" value="Novo projeto" maxlength="80"></div>
        <div><label class="field">Cidade ou município</label>
          <div style="display:flex;gap:6px"><input id="npCity" placeholder="Ex.: Belo Horizonte, MG" style="flex:1">
          <button class="tbtn" data-np="search">Buscar</button></div></div>
      </div>
      <div id="npSearchOut" class="hint" style="min-height:18px;margin:4px 0"></div>
      <div id="npMap" style="height:280px;border:1px solid var(--line);border-radius:9px;overflow:hidden;background:#dce7ef"></div>
      <div class="hint">Clique no mapa ou pesquise a cidade. O CCMGIS escolhe automaticamente o fuso UTM
        SIRGAS 2000; você ainda pode alterá-lo abaixo. O sistema geodésico oficial do Brasil é o
        <b>SIRGAS 2000</b>.</div>
      <div class="row2" style="margin-top:8px">
        <div><label class="field">Datum e sistema de coordenadas</label>
          <select id="npCRS">${projectCRSOptions('EPSG:31983')}</select></div>
        <div><label class="field">Localização escolhida</label>
          <div class="hout" id="npLoc" style="margin:0">Brasil · escolha a região</div></div>
      </div>
      <div style="border-top:1px dashed var(--line);margin-top:10px;padding-top:9px">
        <label class="field">Pasta de trabalho</label>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="tbtn" data-np="folder" style="min-width:210px;justify-content:center">📁 Selecionar pasta</button>
          <div class="hout" id="npFolder" style="margin:0;flex:1">Obrigatória para guardar os rasters em resolução máxima.</div>
        </div>
        <div class="hint">Será criada <b>ALAGIS/rasters</b> com os GeoTIFFs nativos e o
          <b>catalogo.json</b>. Os vetores continuam dentro do arquivo .ccmgis. Ao transferir ou
          publicar o projeto, envie também essa pasta: ela é a base de dados para gerar visualizações
          em resoluções diferentes.</div>
      </div>
      <div class="row2" style="margin-top:10px">
        <button class="mini" data-np="close" style="justify-content:center">Cancelar</button>
        <button class="tbtn" data-np="start" style="justify-content:center;background:var(--amber);color:#1a1206;font-weight:700">Criar projeto</button>
      </div>
    </div></div>`;
  document.body.appendChild(bg);
  const close=()=>{try{if(miniMap)miniMap.remove();}catch(e){}bg.remove();};
  bg.querySelectorAll('[data-np="close"]').forEach(b=>b.onclick=close);
  const crs=bg.querySelector('#npCRS'),locOut=bg.querySelector('#npLoc');
  const setLocation=(lat,lng,label)=>{
    loc={lat:+lat,lng:+lng};const sug=projectCRSForLocation(loc.lat,loc.lng);
    crs.innerHTML=projectCRSOptions(sug);crs.value=sug;
    locOut.innerHTML=`<b>${esc(label||'Ponto no mapa')}</b><br>${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)} · ${esc(CRS_LABELS[sug]||sug)}`;
    if(miniMap){if(marker)marker.remove();marker=L2.marker([loc.lat,loc.lng]).addTo(miniMap);}
  };
  // Aguarda o modal adquirir dimensões antes de iniciar o segundo mapa Leaflet.
  setTimeout(()=>{
    try{
      miniMap=L2.map(bg.querySelector('#npMap'),{zoomControl:true,attributionControl:false}).setView([loc.lat,loc.lng],4);
      L2.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {maxZoom:19,crossOrigin:true}).addTo(miniMap);
      miniMap.on('click',e=>setLocation(e.latlng.lat,e.latlng.lng,'Região escolhida no mapa'));
      setTimeout(()=>miniMap.invalidateSize(),50);
    }catch(e){bg.querySelector('#npMap').innerHTML='<div class="hint" style="padding:20px">Mapa indisponível. Pesquise a cidade para definir a localização.</div>';}
  },30);
  bg.querySelector('[data-np="search"]').onclick=async()=>{
    const q=bg.querySelector('#npCity').value.trim(),out=bg.querySelector('#npSearchOut');
    if(!q){out.textContent='Digite a cidade e o estado.';return;}
    out.textContent='Buscando município…';
    try{
      const u='https://nominatim.openstreetmap.org/search?format=json&countrycodes=br&limit=5&q='+encodeURIComponent(q);
      const a=await fetch(u,{headers:{'Accept':'application/json'}}).then(r=>{if(!r.ok)throw new Error('serviço indisponível');return r.json();});
      if(!a.length){out.textContent='Cidade não encontrada. Tente “cidade, UF” ou clique no mapa.';return;}
      const it=a[0],label=it.display_name||q;setLocation(+it.lat,+it.lon,label);
      if(miniMap)miniMap.setView([+it.lat,+it.lon],10);
      bg.querySelector('#npCity').value=label.split(',').slice(0,2).join(',');
      out.innerHTML='✓ Região localizada e fuso SIRGAS 2000 sugerido automaticamente.';
    }catch(e){out.textContent='A busca on-line não respondeu. Clique no mapa ou escolha o CRS manualmente.';}
  };
  bg.querySelector('#npCity').addEventListener('keydown',e=>{if(e.key==='Enter')bg.querySelector('[data-np="search"]').click();});
  bg.querySelector('[data-np="folder"]').onclick=async()=>{
    folderOK=await projectChooseFolder();
    const out=bg.querySelector('#npFolder');
    if(folderOK)out.innerHTML=`<span style="color:#27964b">✓ ${esc(PROJECT_DIR_HANDLE.name||'pasta')} / CCMGIS / rasters</span>`;
  };
  bg.querySelector('[data-np="start"]').onclick=async()=>{
    if(S.auto?.dirty&&!confirm('Há alterações não salvas. Criar outro projeto e descartar essas alterações?'))return;
    if(window.showDirectoryPicker&&!folderOK){
      bg.querySelector('#npFolder').innerHTML='<span style="color:#d33">Selecione a pasta de trabalho antes de criar o projeto.</span>';return;
    }
    const meta={name:bg.querySelector('#npName').value.trim()||'Novo projeto',
      city:bg.querySelector('#npCity').value.trim(),crs:crs.value,datum:'SIRGAS 2000',
      location:{lat:loc.lat,lng:loc.lng},folder:PROJECT_DIR_HANDLE&&PROJECT_DIR_HANDLE.name||''};
    try{
      const ds=await projectDirs(true);
      if(ds)await projectWrite(ds.raiz,'projeto.json',JSON.stringify({
        type:'ALAGIS_PROJECT_DATABASE',version:1,created:new Date().toISOString(),...meta,
        note:'Envie esta pasta CCMGIS junto com o arquivo .ccmgis. Os vetores estão no projeto; os rasters nativos ficam em rasters/.'
      },null,2));
    }catch(e){toast('A pasta foi escolhida, mas o manifesto não pôde ser gravado: '+(e.message||e));return;}
    try{if(window.GeoMineCollaboration&&typeof window.GeoMineCollaboration.prepareProjectReplacement==='function')window.GeoMineCollaboration.prepareProjectReplacement();}catch(e){console.warn('desconexão colaborativa',e);}
    try{if(window.GeoMineSessionAutosave&&typeof window.GeoMineSessionAutosave.prepareNewProject==='function')await window.GeoMineSessionAutosave.prepareNewProject(meta);}catch(e){console.warn('preparação da nova sessão',e);}
    sessionStorage.setItem('ALAGIS_NEW_PROJECT',JSON.stringify(meta));
    location.reload();
  };
}
async function projectWriteCatalog(ds){
  if(!ds)return;
  const meta=S.projectMeta||{};
  const rasters=(S.rasters||[]).filter(r=>r&&r.projectFile).map(r=>({
    id:r.id,name:r.name,file:r.projectFile.replace(/^CCMGIS\/rasters\//,''),
    /* O catálogo descreve o arquivo persistido, não a miniatura usada no mapa. */
    crs:S.workCRS,nc:(r._projectGrid||r.d).nc,nr:(r._projectGrid||r.d).nr,
    cellX:(r._projectGrid||r.d).cs,cellY:(r._projectGrid||r.d).csy||(r._projectGrid||r.d).cs,
    xll:r.d.xll,yll:r.d.yll,nodata:-9999
  }));
  const catalogo={type:'ALAGIS_RASTER_DATABASE',version:1,updated:new Date().toISOString(),
    project:{name:meta.name||'Projeto CCMGIS',city:meta.city||'',crs:S.workCRS,
      datum:'SIRGAS 2000',location:meta.location||null},rasters};
  await projectWrite(ds.rasters,'catalogo.json',JSON.stringify(catalogo,null,2));
}
/* Uma referência nativa só pode substituir a prévia se ambas ainda descrevem
   a mesma revisão. O fingerprint é AMOSTRADO (não um hash integral do TIFF):
   evita ler vários GB só para conferir uma fonte local. Cópias novas recebem
   nomes exclusivos; nunca sobrescrevemos silenciosamente um TIFF anterior. */
function projectNativeHash(values){
  let h=2166136261;
  for(let i=0;i<values.length;i++)h=Math.imul(h^values[i],16777619)>>>0;
  return h.toString(16).padStart(8,'0');
}
function projectNativePreview(item,kind,grid){
  const g=grid||(kind==='raster'?projectNativeRasterGradeToSave(item):item.d);
  let value;
  if(kind==='ortho'){
    // Um recorte de exibição não troca os bytes do original autorizado.
    const identity=typeof orthoMaskPreviewIdentity==='function'?orthoMaskPreviewIdentity(item):null;
    if(identity)return identity;
    value=String(item.url||'');
  }
  else{
    if(!g)return '';
    const z=g.z||[],a=[g.nc,g.nr,g.cs,g.csy||g.cs,g.xll,g.yll,z.length];
    // A grade serializada usa float32. Compara TODAS as células, inclusive
    // uma edição isolada; não confunde a grade antiga com uma prévia nova.
    let dataHash;
    if(z instanceof Float32Array)dataHash=projectNativeHash(new Uint8Array(z.buffer,z.byteOffset,z.byteLength));
    else{
      const bytes=new Uint8Array(4),dv=new DataView(bytes.buffer);let h=2166136261;
      for(let i=0;i<z.length;i++){
        dv.setFloat32(0,z[i],true);
        for(let j=0;j<4;j++)h=Math.imul(h^bytes[j],16777619)>>>0;
      }
      dataHash=h.toString(16).padStart(8,'0');
    }
    return JSON.stringify(a)+':'+dataHash;
  }
  const bytes=[];
  // Inclui comprimento, extremos e amostras distribuídas da PNG embutida.
  const step=Math.max(1,Math.floor(value.length/4096));
  for(let i=0;i<value.length;i+=step)bytes.push(value.charCodeAt(i));
  return value.length+':'+projectNativeHash(bytes);
}
function projectNativeInvalidate(item){
  if(!item)return;
  window.GeoMineNativeReuse?.remember(item);
  delete item.projectFile;delete item.projectSavedAt;delete item.projectNativeSource;
  item.projectSavePending=true;
}
function projectNativeGridRevision(g){
  if(!g)return '';
  // O selo da grade é integral: editar uma única célula invalida a cópia
  // byte-a-byte do TIFF de origem, sem reler o arquivo externo inteiro.
  return projectNativePreview({d:g},'raster',g);
}
function projectNativeBindRasterSource(r,raw){
  r._projectSourceRaw=raw;
  const d=r.d;
  r._projectNativeBinding={raw,d,full:d&&d._full,
    revision:projectNativeGridRevision(d),fullRevision:projectNativeGridRevision(d&&d._full)};
}
function projectNativeMarkFullCache(d,full,sourceImage){
  d._projectNativeFullCache={full,sourceImage,revision:projectNativeGridRevision(full)};
}
function projectNativeRasterSourceCurrent(r){
  const b=r._projectNativeBinding,d=r.d;
  if(!b||b.raw!==r._projectSourceRaw||b.d!==d||b.revision!==projectNativeGridRevision(d))return false;
  if(!d._full)return true; // Evictar o cache não altera a fonte.
  const fullRevision=projectNativeGridRevision(d._full),cache=d._projectNativeFullCache;
  if(b.full===d._full)return b.fullRevision===fullRevision;
  // Abrir a grade Original apenas preenche um cache da MESMA fonte. Isso não
  // pode transformar uma cópia nativa em uma exportação da prévia reduzida.
  return !!cache&&cache.full===d._full&&cache.sourceImage===d._img0&&cache.revision===fullRevision;
}
function projectNativeRasterGradeToSave(r){
  const d=r.d,b=r._projectNativeBinding,cache=d&&d._projectNativeFullCache,
    full=projectNativeRasterLargestCurrentGrid(r);
  if(full&&full!==d){
    const previous=b&&b.full===full?b.fullRevision:
      cache&&cache.full===full?cache.revision:null;
    // Só uma grade editada toma o lugar da prévia portátil na serialização.
    // Preencher _full para visualizar Original não aumenta o .ccmgis.
    if(previous&&previous!==projectNativeGridRevision(full))return full;
  }
  return d;
}
function projectNativeRasterLargestCurrentGrid(r){
  const d=r.d,f=d&&d._full,cache=d&&d._projectNativeFullCache;
  if(!f||f===d||!f.z||f.z.length!==f.nc*f.nr||!(f.nc>=d.nc&&f.nr>=d.nr&&f.cs>0&&f.cs<=d.cs))return d;
  if(cache&&d._img0&&cache.full===f&&cache.sourceImage!==d._img0)return d;
  const a=[d.xll,d.yll,d.xll+d.nc*d.cs,d.yll+d.nr*(d.csy||d.cs)],
    b=[f.xll,f.yll,f.xll+f.nc*f.cs,f.yll+f.nr*(f.csy||f.cs)],tol=Math.max(d.cs,d.csy||d.cs)*1e-6;
  if(a.some((v,i)=>!isFinite(v)||!isFinite(b[i])||Math.abs(v-b[i])>tol))return d;
  return f;
}
function projectNativeForSave(item,kind,grid){
  const d=item&&item.projectNativeSource;
  if(!d||d.v!==1||item.projectSavePending||d.preview!==projectNativePreview(item,kind))return null;
  return {...d,preview:projectNativePreview(item,kind,grid)};
}
function projectNativeContext(item,kind){
  const project=S.projectId,gen=window.GeoMineSessionAutosave?.state?.generation,
    source=kind==='ortho'?item._sourceRaw:item._projectSourceRaw,
    data=kind==='ortho'?item.url:item.d,preview=projectNativePreview(item,kind);
  return ()=>S.projectId===project&&window.GeoMineSessionAutosave?.state?.generation===gen&&
    (kind==='ortho'?S.img===item:(S.rasters||[]).includes(item))&&
    (kind==='ortho'?item._sourceRaw:item._projectSourceRaw)===source&&
    (kind==='ortho'?(item.url===data||typeof orthoMaskPreviewIdentity==='function'&&orthoMaskPreviewIdentity(item)===preview):item.d===data)&&projectNativePreview(item,kind)===preview;
}
async function projectNativeFingerprint(file){
  const chunk=65536,offsets=[0,Math.max(0,Math.floor(file.size/2)-chunk/2),Math.max(0,file.size-chunk)],out=[];
  for(const offset of [...new Set(offsets)]){
    const bytes=new Uint8Array(await file.slice(offset,Math.min(file.size,offset+chunk)).arrayBuffer());
    out.push(offset+':'+projectNativeHash(bytes));
  }
  return file.size+':'+out.join(':');
}
async function projectNativeMatches(file,d){
  // Sincronizadores podem alterar só a data da cópia. A identidade segue o
  // mesmo contrato de tamanho + fingerprint usado para reutilizar a fonte.
  return !!d&&d.v===1&&file.size===d.size&&
    await projectNativeFingerprint(file)===d.fingerprint;
}
let PROJECT_NATIVE_SEQUENCE=0;
async function projectNativeWrite(ds,item,blob,kind,current){
  const fingerprint=await projectNativeFingerprint(blob);
  if(!current())return null;
  const reused=await window.GeoMineNativeReuse?.reuse(ds,item,kind,current,fingerprint);
  if(reused)return reused;
  const previous=item.projectNativeSource;
  if(item.projectFile&&projectNativeRestoreAllowed(item,kind)&&previous.fingerprint===fingerprint){
    try{
      const name=String(item.projectFile).split('/').pop(),handle=await ds.rasters.getFileHandle(name),file=await handle.getFile();
      if(await projectNativeMatches(file,previous))return current()?{name,descriptor:{...previous}}:null;
    }catch(e){/* Cópia removida/alterada: gravar outra revisão, sem sobrescrever. */}
  }
  const base=projectSafeName(item.name||kind,'');
  let name;
  for(let i=0;i<12;i++){
    const suffix=Date.now().toString(36)+'-'+(++PROJECT_NATIVE_SEQUENCE).toString(36)+'-'+Math.random().toString(36).slice(2,9);
    name=base+'-'+suffix+'.tif';
    try{await ds.rasters.getFileHandle(name);name=null;}
    catch(e){if(e&&e.name!=='NotFoundError')throw e;}
    if(name)break;
  }
  if(!name)throw new Error('não foi possível reservar um nome de cópia nativa');
  if(!current())return null;
  const file=await projectWrite(ds.rasters,name,blob);
  if(!current())return null;
  if(await projectNativeFingerprint(file)!==fingerprint)throw new Error('a cópia nativa gravada não confere com a fonte');
  if(!current())return null;
  return {name,descriptor:{v:1,size:file.size,lastModified:+file.lastModified||0,
    fingerprint,preview:projectNativePreview(item,kind)}};
}
function projectNativeRestoreAllowed(item,kind){
  const d=item.projectNativeSource;
  return !!d&&d.v===1&&!item.projectSavePending&&d.preview===projectNativePreview(item,kind);
}
function projectNativeRestoreNotice(item,kind){
  projectFolderStatus('Prévia preservada. Confirme uma vez o original de '+esc(item.name||kind)+' para reativar a resolução nativa.',false);
  if(typeof cmdLog==='function')cmdLog('Prévia preservada; original não confirmado: '+(item.name||kind),'warn');
}
async function projectAutoSaveRaster(r,askPermission,queued=false){
  if(!r||!r.d)return false;
  if(!queued&&window.GeoMineNativeReuse)return GeoMineNativeReuse.serialize(r,()=>projectAutoSaveRaster(r,askPermission,true));
  /* Superfície TIN é malha vetorial: vive no .ccmgis como vértices e
     triângulos — jamais é gravada como raster (ASC/TIFF) na pasta */
  if(r.tinPuro)return true;
  const current=projectNativeContext(r,'raster');
  // Um vínculo incompatível nunca sobrevive a uma tentativa de gravação falha.
  if(!projectNativeRestoreAllowed(r,'raster'))projectNativeInvalidate(r);
  try{
    let ds=await projectDirs(!!askPermission);
    if(!ds && askPermission){
      const chosen=await projectChooseFolder();
      if(chosen)ds=await projectDirs(true);
    }
    if(!current())return false;
    if(!ds){
      projectFolderStatus('Raster pendente — escolha a pasta do projeto para gravar ALAGIS/rasters.',false);
      return false;
    }
    const reused=await window.GeoMineNativeReuse?.reuse(ds,r,'raster',current);
    if(reused){
      GeoMineNativeReuse.commit(r,reused);
      projectFolderStatus('✓ raster existente: '+esc(reused.name),true);
      cmdLog('raster reutilizado, sem nova cópia: '+r.projectFile,'info');return true;
    }
    /* Para um GeoTIFF importado, a cópia do arquivo é a única forma de manter
       literalmente todos os pixels, metadados e pirâmides — inclusive quando
       ele é maior que o limite de RAM do navegador. Produtos derivados são
       serializados a partir da maior grade que o app consegue manter. */
    let grade=r.d, arquivoNativo=null;
    const fonteConfirmada=projectNativeRasterSourceCurrent(r);
    if(fonteConfirmada&&r._projectSourceRaw instanceof Blob) arquivoNativo=r._projectSourceRaw;
    if(arquivoNativo&&r.d&&r.d._W0&&r.d._H0&&r.d._bb){
      const bb=r.d._bb,cs=(bb[2]-bb[0])/r.d._W0,csy=(bb[3]-bb[1])/r.d._H0;
      grade={nc:r.d._W0,nr:r.d._H0,cs,csy:(Math.abs(csy-cs)>1e-4?csy:undefined),
        xll:bb[0],yll:bb[1]};
    }
    if(!arquivoNativo){
      // Sem associação comprovada, demFull poderia reler justamente o TIFF
      // antigo e desfazer uma edição/reprojeção. A grade atual é a autoridade.
      grade=projectNativeRasterLargestCurrentGrid(r);
      try{ if(fonteConfirmada&&precisaFonte(r.d)) grade=await demFull(r.d); }catch(e){ grade=projectNativeRasterLargestCurrentGrid(r); }
      arquivoNativo=new Blob([gridParaGeoTIFF(grade,S.workCRS,-9999)],{type:'image/tiff'});
    }
    if(!current())return false;
    const saved=await projectNativeWrite(ds,r,arquivoNativo,'raster',current);
    if(!saved)return false;
    const nome=saved.name;
    r.projectFile='ALAGIS/rasters/'+nome;r.projectNativeSource=saved.descriptor;
    if(!saved.reused)r.projectSavedAt=new Date().toISOString();
    r.projectSavePending=false;
    r._projectGrid={nc:grade.nc,nr:grade.nr,cs:grade.cs,csy:grade.csy,
      xll:grade.xll,yll:grade.yll};
    await projectWriteCatalog(ds);
    projectFolderStatus('✓ último raster: '+esc(nome),true);
    cmdLog((saved.reused?'raster reutilizado, sem nova cópia: ':'raster salvo em ')+r.projectFile,'info');return true;
  }catch(e){projectFolderStatus('Falha ao salvar raster: '+esc(e.message||e),false);return false;}
}
/* Sincroniza todas as superfícies antes de salvar o .ccmgis. A escolha da
   pasta é necessária apenas na primeira vez; depois o handle fica associado ao
   navegador e qualquer raster novo é guardado automaticamente em ALAGIS/rasters. */
async function projectSyncNativeRasters(askPermission){
  const lista=(S.rasters||[]).filter(r=>r&&r.d&&!r.tinPuro);
  if(!lista.length)return {ok:true,total:0,salvos:0};
  let ds=await projectDirs(false);
  if(!ds&&askPermission){
    const escolhido=await projectChooseFolder();
    if(escolhido)ds=await projectDirs(true);
  }
  if(!ds){
    lista.forEach(r=>{if(!projectNativeRestoreAllowed(r,'raster'))projectNativeInvalidate(r);});
    projectFolderStatus('Rasters permanecem no projeto; configure uma pasta para ter cópias GeoTIFF nativas.',false);
    return {ok:false,total:lista.length,salvos:0};
  }
  let salvos=0;
  for(let i=0;i<lista.length;i++){
    showLoad(`Verificando raster ${i+1}/${lista.length}; reutilizando a base existente…`);
    if(await projectAutoSaveRaster(lista[i],false))salvos++;
  }
  return {ok:salvos===lista.length,total:lista.length,salvos};
}
async function projectSyncNativeSources(askPermission){
  const project=S.projectId,gen=window.GeoMineSessionAutosave?.state?.generation;
  const raster=await projectSyncNativeRasters(askPermission);
  if(S.projectId!==project||window.GeoMineSessionAutosave?.state?.generation!==gen)return {ok:false,total:raster.total,salvos:raster.salvos,stale:true};
  if(!S.img||!S.img.url)return raster;
  const saved=await projectAutoSaveOrtho(!!askPermission&&!raster.total);
  return {ok:raster.ok&&saved,total:raster.total+1,salvos:raster.salvos+(saved?1:0)};
}
/* Ao abrir o .ccmgis, privilegia a cópia nativa persistida na pasta do projeto
   em vez da miniatura embutida. Sem permissão da pasta o projeto continua
   abrindo normalmente com a prévia que está no .ccmgis. */
// A abertura do projeto e os produtos compartilham a mesma restauração.
// Nunca substitui uma grade já utilizável: o cache nativo pertence à sessão.
const projectRasterRestores=new WeakMap();
function projectRasterReady(r){
  // On iPad the file picker can return a cloud-backed File. Until its
  // verified OPFS copy is ready, keep the project in preview mode instead of
  // declaring the original available and starting random tile reads against
  // the provider while the same file is still being copied sequentially.
  if(r&&r._nativeCopyPending)return false;
  const d=r&&r.d;
  return !!d&&!!(d._img0||d._full||d.native||d.resampled===1);
}
async function projectCloseNativeRasterSource(tiff){
  try{if(tiff&&typeof tiff.close==='function')await tiff.close();}catch(_){}
}
function projectNativeRasterIdentity(r){
  const stamp=d=>d?[d.v,d.kind,d.id,d.size,d.fingerprint,d.preview,!!d.invalidated]:null;
  return JSON.stringify([stamp(r.originalSource),stamp(r.projectNativeSource),!!r.projectSavePending,r.projectFile||'']);
}
/* The caller has already verified the source identity. Prepare its index in
   isolation, then attach it without decoding or replacing the saved pixels.
   Manual File selections and automatic handle restoration use this same commit. */
async function projectAttachNativeRaster(r,file,options={}){
  if(!r||!r.d){await projectCloseNativeRasterSource(options.tiff);return false;}
  const previous=r.d,previousTiff=previous&&previous._tiff,bound=projectNativePreview(r,'raster'),
    account=window.GeoMineCloudProvider?.user?.uid||'offline',
    originalSource=r.originalSource,nativeSource=r.projectNativeSource,identity=projectNativeRasterIdentity(r),
    current=options.isCurrent||projectNativeContext(r,'raster');
  const check=()=>{
    rasterImportCheck(options);
    if(r.d!==previous||(window.GeoMineCloudProvider?.user?.uid||'offline')!==account||
       r.originalSource!==originalSource||r.projectNativeSource!==nativeSource||projectNativeRasterIdentity(r)!==identity||!current())
      throw Object.assign(new Error('A superfície mudou durante a leitura do original.'),{name:'AbortError'});
  };
  // Ownership of a prevalidated index transfers at entry, before any await.
  // Even an early cancellation must close it exactly once.
  let tiff=options.tiff||null,committed=false;
  try{
    check();await rasterImportWait(ensureGeoTIFF(),options);check();
    tiff=await rasterImportOpen(file,options);check();
    const im=await rasterImportWait(tiff.getImage(0),options);check();
    const bb=im.getBoundingBox(),W=im.getWidth(),H=im.getHeight();
    if(!bb||bb.length!==4||bb.some(v=>!Number.isFinite(v))||!(bb[2]>bb[0]&&bb[3]>bb[1])||
       !Number.isSafeInteger(W)||W<=0||!Number.isSafeInteger(H)||H<=0||im.getSamplesPerPixel()!==1)
      throw Error('GeoTIFF nativo inválido para esta superfície.');
    const g={...previous,_tiff:tiff,_img0:im,_W0:W,_H0:H,_bb:Array.from(bb),_nd:im.getGDALNoData()};
    // Keep the integer import factor when it still describes this preview.
    // Legacy mean/overview verification must remain repeatable if persisting
    // the new source descriptor fails after this otherwise successful attach.
    const reduction=previous.resampled;
    g.resampled=Number.isInteger(reduction)&&reduction>=1&&
      Math.max(2,Math.floor(W/reduction))===g.nc&&Math.max(2,Math.floor(H/reduction))===g.nr
        ?reduction:Math.max(W/g.nc,H/g.nr);
    // Reusing the same preview also reuses its non-enumerable map projection.
    for(const key of ['_wm','_wmCRS','_wmResample']){
      const property=Object.getOwnPropertyDescriptor(previous,key);
      if(property)Object.defineProperty(g,key,property);
    }
    const staged={d:g};projectNativeBindRasterSource(staged,file);
    const grid={nc:W,nr:H,cs:(bb[2]-bb[0])/W,csy:(bb[3]-bb[1])/H,xll:g.xll,yll:g.yll};
    const descriptor=options.descriptor&&!options.original
      ?{...options.descriptor,lastModified:+file.lastModified||0,preview:bound}:null;
    check();
    if(projectNativePreview(r,'raster')!==bound)
      throw Object.assign(new Error('A superfície foi editada durante a leitura do original.'),{name:'AbortError'});
    if(globalThis.GeoMineRasterImport)GeoMineRasterImport.release(tiff);
    const wasDem=S.hidro&&S.hidro.dem===previous;
    // A prévia e seus valores não mudaram. Preservar também as estatísticas
    // evita varrer novamente a grade inteira na primeira janela de tiles.
    r.d=g;r.srcName=file.name||r.srcName;
    r._projectSourceRaw=staged._projectSourceRaw;r._projectNativeBinding=staged._projectNativeBinding;
    r._projectGrid=grid;r.demHD=true;r.dispFull=true;delete r._demHDLegacy;
    if(descriptor){r.projectNativeSource=descriptor;r.projectSavePending=false;}
    delete r._semFonte;delete r._avisouReduzida;
    committed=true;
    if(wasDem)S.hidro.dem=g;
    // A second attachment (used after the iPad finishes copying the selected
    // cloud file to OPFS) must retire the former provider source. Otherwise
    // old tile jobs keep a stale File alive and can continue falling back to
    // the preview even though the verified local copy is already available.
    if(previousTiff&&previousTiff!==tiff)await projectCloseNativeRasterSource(previousTiff);
    try{
      if(options.original)GeoMineOriginalSources.adopt(r,'raster',options.original);
      if(wasDem){if(typeof hShadeOff==='function')hShadeOff(true);if(typeof hInvalidaD8==='function')hInvalidaD8(g);}
      if(typeof layoutInvalidateOrtho==='function')layoutInvalidateOrtho('mdt-source');
      renderRaster(r,{sourceOnly:true});refreshUI();
    }catch(e){console.warn('Exibição do MDT restaurado:',e);}
    return true;
  }finally{if(!committed)await projectCloseNativeRasterSource(tiff);}
}
async function projectRestoreNativeRaster(r){
  if(!r||!r.d||r.tinPuro)return false;
  if(projectRasterReady(r))return true;
  const pending=projectRasterRestores.get(r);
  if(pending&&pending.current())return pending.promise;
  const raw=r._projectSourceRaw instanceof Blob&&projectNativeRasterSourceCurrent(r)?r._projectSourceRaw:null;
  const unchanged=projectNativeContext(r,'raster'),descriptor=r.projectNativeSource,
    originalDescriptor=r.originalSource,identity=projectNativeRasterIdentity(r);
  const current=()=>unchanged()&&r.projectNativeSource===descriptor&&r.originalSource===originalDescriptor&&projectNativeRasterIdentity(r)===identity;
  const path=String(r.projectFile),match=/^ALAGIS\/rasters\/([^/\\]+\.tiff?)$/i.exec(path);
  if(!raw&&!match&&!window.GeoMineOriginalSources)return false;
  const job={current};
  job.promise=(async()=>{
    try{
      let f=raw,original=null;
      if(!f&&window.GeoMineOriginalSources){
        original=await GeoMineOriginalSources.resolve(r,'raster');
        if(!current())return false;
        if(original)f=original.file;
      }
      if(!f){
        if(!match||!projectNativeRestoreAllowed(r,'raster'))return false;
        const ds=await projectDirs(false,true);
        if(!ds||!current()||r.projectNativeSource!==descriptor)return false;
        const h=await ds.rasters.getFileHandle(match[1]);f=await (window.GeoMineRasterSource?.wait?GeoMineRasterSource.wait(h.getFile(),{timeoutMs:15000}):h.getFile());
        const checking=projectNativeMatches(f,descriptor);
        if(!await (window.GeoMineRasterSource?.wait?GeoMineRasterSource.wait(checking,{timeoutMs:15000}):checking))return false;
      }
      if(!current()||r.projectNativeSource!==descriptor)return false;
      return await projectAttachNativeRaster(r,f,{descriptor,original,
        isCurrent:()=>current()&&r.projectNativeSource===descriptor});
    }catch(e){if(e?.name!=='AbortError')console.warn('Raster nativo não restaurado:',r.name,e);return false;}
    finally{if(projectRasterRestores.get(r)===job)projectRasterRestores.delete(r);}
  })();
  projectRasterRestores.set(r,job);
  return job.promise;
}
async function projectRestoreNativeRasters(){
  const todos=(S.rasters||[]).filter(r=>r&&!r.tinPuro),
    contexts=new Map(todos.map(r=>[r,projectNativeContext(r,'raster')]));
  let restored=0,missing=0;
  try{
    for(const r of todos){
      if(!contexts.get(r)())continue;
      if(projectRasterReady(r))continue;
      if(r.projectFile||window.GeoMineOriginalSources){
        showLoad('Restaurando raster nativo: '+r.name+'…');
        if(await projectRestoreNativeRaster(r)){restored++;continue;}
      }
      if(!contexts.get(r)()||projectRasterReady(r))continue;
      // Ausência de permissão/arquivo é um estado da sessão, não uma escolha
      // de resolução. Preserve as opções salvas para quando a fonte voltar.
      missing++;
      // The saved preview is already mounted. A missing original cannot improve
      // it, and rendering hidden rasters defeats deferred project opening.
      try{if(r.visible!==false&&!r.overlay)renderRaster(r);}catch(e){}
      if(r.projectFile)projectNativeRestoreNotice(r,'MDT');
    }
  }finally{try{hideLoad();}catch(e){}}
  if(restored||missing)refreshUI();
  return {restored,missing};
}
/* ORTOFOTO NA PASTA DE TRABALHO — espelho do que o MDT já faz.
   O .ccmgis guarda só a prévia; o GeoTIFF original só existe na sessão em que
   foi aberto (_sourceRaw). Copiá-lo para ALAGIS/rasters faz o projeto reabrir
   já com a resolução plena e os tiles, sem "buscar a ortofoto original" toda vez. */
async function projectAutoSaveOrtho(askPermission,queued=false){
  const I=S.img;
  if(!I||!I.url)return false;
  if(!queued&&window.GeoMineNativeReuse)return GeoMineNativeReuse.serialize(I,()=>S.img===I?projectAutoSaveOrtho(askPermission,true):false);
  const current=projectNativeContext(I,'ortho');
  const valid=projectNativeRestoreAllowed(I,'ortho');
  if(!valid)projectNativeInvalidate(I);
  /* O original fica em memória como ArrayBuffer (lido do .tif) ou Blob
     (arquivo religado): qualquer um dos dois vira a cópia gravada. */
  const raw=I._sourceRaw;
  const temRaw=!!raw && ((typeof Blob!=='undefined'&&raw instanceof Blob) || raw instanceof ArrayBuffer || ArrayBuffer.isView(raw));
  if(!temRaw){
    if(valid)return true; // Referência já conferida; não trocar a prévia por um TIFF inventado.
    projectFolderStatus('A ortofoto está só como prévia: religue o GeoTIFF original antes de gravar.',false);
    return false;
  }
  const arquivoNativo=(raw instanceof Blob)?raw:new Blob([raw],{type:'image/tiff'});
  try{
    let ds=await projectDirs(!!askPermission);
    if(!ds && askPermission){
      const chosen=await projectChooseFolder();
      if(chosen)ds=await projectDirs(true);
    }
    if(!current())return false;
    if(!ds){
      projectFolderStatus('Ortofoto pendente — escolha a pasta do projeto para gravar ALAGIS/rasters.',false);
      return false;
    }
    const reused=await window.GeoMineNativeReuse?.reuse(ds,I,'ortho',current);
    if(reused){
      GeoMineNativeReuse.commit(I,reused);
      projectFolderStatus('✓ ortofoto existente: '+esc(reused.name),true);
      if(typeof cmdLog==='function')cmdLog('ortofoto reutilizada, sem nova cópia: '+I.projectFile,'info');return true;
    }
    const saved=await projectNativeWrite(ds,I,arquivoNativo,'ortho',current);
    if(!saved)return false;
    const nome=saved.name;
    I.projectFile='ALAGIS/rasters/'+nome;I.projectNativeSource=saved.descriptor;
    if(!saved.reused)I.projectSavedAt=new Date().toISOString();
    I.projectSavePending=false;
    await projectWriteCatalog(ds);
    projectFolderStatus('✓ ortofoto: '+esc(nome),true);
    if(typeof cmdLog==='function')cmdLog((saved.reused?'ortofoto reutilizada, sem nova cópia: ':'ortofoto salva em ')+I.projectFile,'info');
    return true;
  }catch(e){projectFolderStatus('Falha ao salvar a ortofoto: '+esc(e.message||e),false);return false;}
}
/* Ao abrir o .ccmgis: se a ortofoto tem cópia na pasta de trabalho, religa
   sozinha (mesma regra dos rasters nativos). Sem permissão da pasta, fica a prévia. */
async function projectRestoreNativeOrtho(){
  const I=S.img;
  if(!I||!I.url||(I._img0&&I._tiff)||window.GeoMineOriginalSources&&!GeoMineOriginalSources.needsOrtho(I))return {restored:0,missing:0};
  const current=projectNativeContext(I,'ortho'),descriptor=I.projectNativeSource;
  const nome=String(I.projectFile).split('/').pop();
  try{
    if(window.GeoMineOriginalSources){
      const original=await GeoMineOriginalSources.resolve(I,'ortho');
      if(!current())return {restored:0,missing:0,stale:true};
      if(original){
        const ok=await ortoReligarTIFF(original.file,{restoreNative:true,isCurrent:current});
        if(ok&&S.img===I)GeoMineOriginalSources.adopt(I,'ortho',original);
        return {restored:ok?1:0,missing:ok?0:1};
      }
    }
    if(!I.projectFile||!projectNativeRestoreAllowed(I,'ortho'))return {restored:0,missing:1,unverified:true};
    const ds=await projectDirs(false,true);
    if(!current())return {restored:0,missing:0,stale:true};
    if(!ds)return {restored:0,missing:1,unauthorized:true};
    showLoad('Restaurando a ortofoto nativa: '+nome+'…');
    const h=await ds.rasters.getFileHandle(nome), access=h.getFile(),f=await (window.GeoMineRasterSource?.wait?GeoMineRasterSource.wait(access,{timeoutMs:15000}):access);
    const checking=projectNativeMatches(f,descriptor);
    if(!await (window.GeoMineRasterSource?.wait?GeoMineRasterSource.wait(checking,{timeoutMs:15000}):checking))throw new Error('a cópia nativa mudou; prévia preservada');
    if(!current()||I.projectNativeSource!==descriptor)return {restored:0,missing:0,stale:true};
    const ok=await ortoReligarTIFF(f,{restoreNative:true,isCurrent:current});
    if(ok&&S.img===I){I.projectSavePending=false;I.projectNativeSource={...descriptor,preview:projectNativePreview(I,'ortho')};}
    return ok?{restored:1,missing:0}:{restored:0,missing:1};
  }catch(e){if(current())projectNativeRestoreNotice(I,'ortofoto');console.warn('Ortofoto nativa não restaurada:',nome,e);return {restored:0,missing:1};}
  finally{ try{hideLoad();}catch(e){} }
}
async function projectAutoSaveShape(L){
  // Por projeto: vetores são persistidos no .ccmgis, não duplicados na pasta.
  return false;
}
function gridParaASC(g, nodata){
  const ND=(nodata===undefined?-9999:nodata);
  if(Math.abs((g.csy||g.cs)-g.cs)>1e-6) toast('ASCII Grid exige célula quadrada — usando '+g.cs.toFixed(4)+' m');
  const L=['ncols '+g.nc,'nrows '+g.nr,'xllcorner '+g.xll.toFixed(4),
           'yllcorner '+g.yll.toFixed(4),'cellsize '+g.cs.toFixed(8),'NODATA_value '+ND];
  for(let r=0;r<g.nr;r++){
    const lin=new Array(g.nc);
    for(let c=0;c<g.nc;c++){ const v=g.z[r*g.nc+c]; lin[c]=(v===undefined||isNaN(v))?ND:(+v).toFixed(3); }
    L.push(lin.join(' '));
  }
  return L.join('\n')+'\n';
}
function gridParaXYZ(g){
  const csy=(g.csy||g.cs), ytop=g.yll+g.nr*csy, out=['X,Y,Z'];
  for(let r=0;r<g.nr;r++) for(let c=0;c<g.nc;c++){
    const v=g.z[r*g.nc+c]; if(v===undefined||isNaN(v)) continue;
    out.push((g.xll+(c+0.5)*g.cs).toFixed(3)+','+(ytop-(r+0.5)*csy).toFixed(3)+','+(+v).toFixed(3));
  }
  return out.join('\n')+'\n';
}
async function exportaMDT(r){
  if(!r){ toast('Selecione a superfície'); return; }
  const fmt=((document.getElementById('rasExpFmt')||{}).value)||'tif';
  const res=((document.getElementById('rasExpRes')||{}).value)||'nativa';
  let g=r.d;
  if(res==='nativa'){
    const q=await gridBruto(r,'exportar o MDT');
    if(!q){ toast('Exportação cancelada — sem a grade bruta'); return; }
    g=q;
  }
  const n=g.nc*g.nr;
  if(fmt!=='tif' && n>20e6 && !confirm(`Grade de ${(n/1e6).toFixed(0)} M células em formato texto `+
    `pode gerar centenas de MB e demorar. Continuar?`)) return;
  showLoad(`Gerando ${fmt.toUpperCase()} de ${g.nc}×${g.nr}…`);
  await new Promise(s=>setTimeout(s,20));
  try{
    const base=(r.name||'MDT').replace(/[^\w.-]+/g,'_');
    if(fmt==='tif'){
      const buf=gridParaGeoTIFF(g, S.workCRS, -9999);
      await download(new Blob([buf],{type:'application/octet-stream'}), base+'.tif');
    } else if(fmt==='asc'){
      await download(new Blob([gridParaASC(g,-9999)],{type:'application/octet-stream'}), base+'.asc');
    } else {
      await download(new Blob([gridParaXYZ(g)],{type:'application/octet-stream'}), base+'_xyz.txt');
    }
    toast(`Exportado ${g.nc}×${g.nr} a ${g.cs.toFixed(3)} m`);
  }catch(e){ toast('Falha ao exportar: '+(e.message||e)); }
  finally{ hideLoad(); }
}

function bindCadPanel(){
  const $=id=>document.getElementById(id);
  if(!$('cadCoord')) return;
  $('btnCadIns').onclick=cadInsert;
  $('cadCoord').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); cadInsert(); } });
  $('cadOrtho').onchange=e=>GeoMineOrtho.set(e.target.checked);
  $('cadSnapV').onchange=e=>{ S.snapVtxOn=e.target.checked; };
  $('cadSnapM').onchange=e=>{ S.snapMidOn=e.target.checked; S.layers.forEach(l=>l._snapCache=null); };
  $('btnCadOff').onclick=cadOffset;
  if($('btnCadHatch'))$('btnCadHatch').onclick=cadHatchOpen;
  $('btnCadDxf').onclick=cadExportDXF;
  $('btnCadRef').onclick=cadSetRef;
  $('btnCadRefClr').onclick=()=>{ S.cadRef=null; cadRefSync(); toast('Referência limpa'); };
  $('btnCadTrim').onclick=cadTrim;
  $('btnCadExt').onclick=cadExtend;
  $('btnCadJoin').onclick=cadJoin;
  $('btnCadRev').onclick=cadReverse;
  { const b=document.getElementById('btnLimpar'); if(b) b.onclick=limRelatorio;
    const g=document.getElementById('btnLimparG'); if(g) g.onclick=limRelatorio;
    const c=document.getElementById('btnLimCurtas');  if(c) c.onclick=()=>limLinhasCurtas('limLen','limEsc');
    const cg=document.getElementById('btnLimCurtasG'); if(cg) cg.onclick=()=>limLinhasCurtas('limLenG','limEscG');
    const sk=document.getElementById('btnLimSpikes'); if(sk) sk.onclick=()=>limRemoveSpikes('limSpkAng','limSpkLen','limEscG'); }
  cadRefSync();
}
