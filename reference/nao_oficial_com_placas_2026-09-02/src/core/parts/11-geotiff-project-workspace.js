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
  const geog=/4326|4674|4989/.test(String(crs||''));
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
async function projectDirs(ask){
  if(!PROJECT_DIR_HANDLE)PROJECT_DIR_HANDLE=await projectHandleLoad();
  if(!await projectPerm(PROJECT_DIR_HANDLE,ask))return null;
  const raiz=await PROJECT_DIR_HANDLE.getDirectoryHandle('ALAGIS',{create:true});
  return {raiz,rasters:await raiz.getDirectoryHandle('rasters',{create:true})};
}
async function projectWrite(dir,name,data){
  const f=await dir.getFileHandle(name,{create:true});
  await fileHandleWriteVerified(f,data,name);
}

/* Escrita confirmada para File System Access. createWritable trabalha numa
   cópia temporária e só publica no close(); depois disso conferimos o tamanho
   realmente visível. Assim uma falha de provedor/sincronizador não é anunciada
   como sucesso e um arquivo de 0 byte nunca passa silenciosamente. */
async function fileHandleWriteVerified(handle,data,label){
  const blob=data instanceof Blob?data:new Blob([data],{type:'application/octet-stream'}),
    esperado=blob.size;
  if(!(esperado>0))throw new Error('conteúdo vazio; gravação cancelada antes de criar o arquivo');
  let w=null;
  try{
    w=await handle.createWritable();
    await w.write(blob);
    await w.close();w=null;
    const salvo=await handle.getFile();
    if(salvo.size!==esperado)throw new Error('tamanho gravado '+salvo.size+
      ' bytes; esperado '+esperado+' bytes'+(label?' em '+label:''));
    return salvo;
  }catch(e){
    if(w&&typeof w.abort==='function')try{await w.abort();}catch(_){}
    throw e;
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
  if((S.layers.length||S.rasters.length||S.img) &&
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
async function projectAutoSaveRaster(r,askPermission){
  if(!r||!r.d)return false;
  /* Superfície TIN é malha vetorial: vive no .ccmgis como vértices e
     triângulos — jamais é gravada como raster (ASC/TIFF) na pasta */
  if(r.tinPuro)return true;
  try{
    let ds=await projectDirs(!!askPermission);
    if(!ds && askPermission){
      const chosen=await projectChooseFolder();
      if(chosen)ds=await projectDirs(true);
    }
    if(!ds){
      r.projectSavePending=true;
      projectFolderStatus('Raster pendente — escolha a pasta do projeto para gravar ALAGIS/rasters.',false);
      return false;
    }
    /* Para um GeoTIFF importado, a cópia do arquivo é a única forma de manter
       literalmente todos os pixels, metadados e pirâmides — inclusive quando
       ele é maior que o limite de RAM do navegador. Produtos derivados são
       serializados a partir da maior grade que o app consegue manter. */
    const nome=projectSafeName(r.name,'.tif');
    let grade=r.d, arquivoNativo=null;
    if(r._projectSourceRaw instanceof Blob) arquivoNativo=r._projectSourceRaw;
    if(arquivoNativo&&r.d&&r.d._W0&&r.d._H0&&r.d._bb){
      const bb=r.d._bb,cs=(bb[2]-bb[0])/r.d._W0,csy=(bb[3]-bb[1])/r.d._H0;
      grade={nc:r.d._W0,nr:r.d._H0,cs,csy:(Math.abs(csy-cs)>1e-4?csy:undefined),
        xll:bb[0],yll:bb[1]};
    }
    if(!arquivoNativo){
      try{ if(precisaFonte(r.d)) grade=await demFull(r.d); }catch(e){ grade=r.d; }
      arquivoNativo=new Blob([gridParaGeoTIFF(grade,S.workCRS,-9999)],{type:'image/tiff'});
    }
    await projectWrite(ds.rasters,nome,arquivoNativo);
    r.projectFile='ALAGIS/rasters/'+nome;
    r.projectSavedAt=new Date().toISOString();
    r.projectSavePending=false;
    r._projectGrid={nc:grade.nc,nr:grade.nr,cs:grade.cs,csy:grade.csy,
      xll:grade.xll,yll:grade.yll};
    await projectWriteCatalog(ds);
    projectFolderStatus('✓ último raster: '+esc(nome),true);
    cmdLog('raster salvo em '+r.projectFile,'info');return true;
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
    lista.forEach(r=>r.projectSavePending=true);
    projectFolderStatus('Rasters permanecem no projeto; configure uma pasta para ter cópias GeoTIFF nativas.',false);
    return {ok:false,total:lista.length,salvos:0};
  }
  let salvos=0;
  for(let i=0;i<lista.length;i++){
    showLoad(`Salvando raster nativo ${i+1}/${lista.length} em ALAGIS/rasters…`);
    if(await projectAutoSaveRaster(lista[i],false))salvos++;
  }
  return {ok:salvos===lista.length,total:lista.length,salvos};
}
/* Ao abrir o .ccmgis, privilegia a cópia nativa persistida na pasta do projeto
   em vez da miniatura embutida. Sem permissão da pasta o projeto continua
   abrindo normalmente com a prévia que está no .ccmgis. */
async function projectRestoreNativeRasters(){
  const lista=(S.rasters||[]).filter(r=>r&&r.projectFile&&!r.tinPuro);
  if(!lista.length)return {restored:0,missing:0};
  const ds=await projectDirs(false);
  if(!ds)return {restored:0,missing:lista.length,unauthorized:true};
  let restored=0,missing=0;
  /* Esta rotina roda SOLTA, depois que quem abriu o arquivo já executou o seu
     finally{hideLoad()}. Cada raster acendia a tela de carregamento e nada a
     apagava no fim: o projeto abria por baixo, mas a tela ficava "carregando"
     para sempre. O finally abaixo é o dono do apagador daqui em diante. */
  try{
  for(let i=0;i<lista.length;i++){
    const r=lista[i],nome=String(r.projectFile).split('/').pop();
    try{
      showLoad(`Restaurando raster nativo ${i+1}/${lista.length}: ${nome}…`);
      const h=await ds.rasters.getFileHandle(nome);
      const f=await h.getFile(), g=await parseTIFF(f);
      /* Mantém os identificadores/estilo do projeto; só substitui a grade pela
         fonte de resolução plena que está sob controle do projeto. */
      if(r.d&&r.d._sig)g._sig=r.d._sig;
      r.d=g; r._projectSourceRaw=f; r._projectGrid={nc:g._W0||g.nc,nr:g._H0||g.nr,
        cs:(g._bb?(g._bb[2]-g._bb[0])/(g._W0||g.nc):g.cs),
        csy:(g._bb?(g._bb[3]-g._bb[1])/(g._H0||g.nr):g.csy||g.cs),xll:g.xll,yll:g.yll};
      r.projectSavePending=false;
      renderRaster(r); restored++;
    }catch(e){missing++;console.warn('Raster nativo não restaurado:',nome,e);}
  }
  }finally{ try{hideLoad();}catch(e){} }
  if(restored)refreshUI();
  return {restored,missing};
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
  $('cadOrtho').onchange=e=>{ S.orthoOn=e.target.checked; toast('Orto '+(S.orthoOn?'LIGADO (0°/90° a partir do último vértice)':'desligado')); };
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

