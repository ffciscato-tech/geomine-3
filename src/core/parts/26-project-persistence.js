/* ============================================================================
   PROJETO — salvar/carregar (.ccmgis)
   ========================================================================== */
function projectData(options){
  /* O projeto nunca grava atributos de área anteriores à geometria atual. */
  autoAreaSyncAll();
  /* Garante que os campos próprios da prancha ativa (selo, escala, legenda,
     centro etc.) entrem no arquivo. A composição cartográfica continua
     congelada: plateCapture sem captureState jamais troca visibilidade,
     ordem, filtros ou simbologia; isso permanece exclusivo de Atualizar. */
  try{if(S.plates&&S.plates.length&&typeof plateCapture==='function')plateCapture();}catch(e){}
  /* Uma prancha antiga pode estar aplicada temporariamente aos objetos de
     mapa enquanto o usuário está no Layout. O arquivo do projeto, porém,
     deve continuar guardando como estado principal o mapa 2D que existia
     antes de entrar nessa aba; cada fotografia de prancha já é persistida
     separadamente em `plates`. Nomes são metadados atuais do projeto: uma
     renomeação feita no Layout nunca é substituída pelo nome do instantâneo. */
  const mapa2D=(S._view==='layout'&&S._preLayoutMapState)?S._preLayoutMapState:null,
    mapa2DConv=mapa2D&&mapa2D.conv?mapa2D.conv:null,
    mapa2DVis=mapa2D&&mapa2D.vis?mapa2D.vis:null,
    convSalva=(tipo,id)=>mapa2DConv&&mapa2DConv[tipo+':'+id],
    visSalva=(tipo,id,atual)=>mapa2DVis&&Object.prototype.hasOwnProperty.call(mapa2DVis,tipo+':'+id)
      ?mapa2DVis[tipo+':'+id]:atual;
  const gv=id=>{const e=document.getElementById(id);return e?e.value:'';};
  const gc=id=>{const e=document.getElementById(id);return e?!!e.checked:true;};
  /* A escrita por partes cede a execução entre camadas. Um snapshot não
     pode guardar referências vivas a features, simbologia ou metadados:
     uma edição/atualização remota nesse intervalo misturaria versões no
     mesmo arquivo. Copiar a estrutura não duplica as grandes strings base64
     dos rasters e não exige uma string JSON do projeto inteiro. */
  function snapshot(value,seen=new WeakMap()){
    if(value===null||typeof value!=='object')return value;
    if(seen.has(value))return seen.get(value);
    if(value instanceof Date)return new Date(value.getTime());
    if(value instanceof ArrayBuffer)return value.slice(0);
    if(ArrayBuffer.isView(value))return value instanceof DataView
      ?new DataView(value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength))
      :new value.constructor(value);
    const copy=Array.isArray(value)?new Array(value.length):{};seen.set(value,copy);
    Object.keys(value).forEach(key=>{
      const child=snapshot(value[key],seen);
      if(key==='__proto__')Object.defineProperty(copy,key,{value:child,enumerable:true,writable:true,configurable:true});
      else copy[key]=child;
    });
    return copy;
  }
  const data={
    app:'ALAGIS', v:1, savedAt:new Date().toISOString(),
    projectId:S.projectId||null,
    projectFileName:S.auto?.name||S.currentProjectName||null,
    workCRS:S.workCRS,
    screen:window.GeoMineProjectScreen?.capture()||null,
    projectMeta:S.projectMeta||null,
    environmentalLicenses:window.GeoMineLicenses?.snapshot()??{version:1,licenses:[]},
    researchRequest:S.researchRequest||null,
    civil:window.GeoMineCivil?.snapshot()||null,
    cliLogo:window.GeoMineTitleblockLogo?.safeURL(S.cliLogo)||null,
    cliLogoName:S.cliLogoName||null,
    seloCompanyRole:window.GeoMineTitleblockLogo?.companyRole(S.seloCompanyRole)||'contratada',
    v3:{surfOn:{...(S._v3SurfOn||{})},texTipo:S._v3TexTipo||'hipso',
      texCor:S._v3TexCor||'#8d5524'},
    cava2:(window.CCMGISCava2&&typeof window.CCMGISCava2.snapshot==='function')
      ?window.CCMGISCava2.snapshot():null,
    /* Modelo geológico: definições de seção e preferências analíticas. As
       feições (inclusive logs/testemunhos) já seguem dentro das camadas. */
    geology:(window.GeoMineGeology&&typeof window.GeoMineGeology.snapshot==='function')
      ?window.GeoMineGeology.snapshot():(S.geology||null),
    /* A sala e a revisão não são credenciais; apenas permitem que um projeto
       local reconheça novamente sua contraparte na nuvem. Tokens Firebase
       nunca entram no .ccmgis. */
    collaboration:S.collaboration?{
      roomId:S.collaboration.roomId||null,
      roomName:S.collaboration.roomName||null,
      baseRevision:Number.isFinite(+S.collaboration.baseRevision)?+S.collaboration.baseRevision:0,
      lastSeq:Number.isFinite(+S.collaboration.lastSeq)?+S.collaboration.lastSeq:0
    }:null,
    groups:S.groups.map(g=>({id:g.id,name:g.name,parentId:groupParentValue(g),collapsed:!!g.collapsed,
      visibilityResume:Array.isArray(g.visibilityResume)?g.visibilityResume.filter(k=>typeof k==='string'):[],
      _collabId:g._collabId||null})),
    layers:S.layers.filter(L=>!options?.layerIds||options.layerIds.includes(L.id)).map(L=>{const c=convSalva('L',L.id);return ({
      // o id é parte do formato: as chaves 'L:id' do S.stack dependem dele
      // para a ordem sobreviver à abertura do projeto
      id:L.id,
      _collabId:L._collabId||null,
      name:L.name, gtype:L.gtype, crs:L.crs,
      visible:visSalva('L',L.id,L.visible!==false),locked:!!L.locked,
      labelField:c&&Object.prototype.hasOwnProperty.call(c,'labelField')?(c.labelField||''):(L.labelField||''),
      labelFields:c&&Object.prototype.hasOwnProperty.call(c,'labelFields')
        ?(Array.isArray(c.labelFields)?c.labelFields.slice():null)
        :(Array.isArray(L.labelFields)?L.labelFields.slice():null),
      lbl:c&&Object.prototype.hasOwnProperty.call(c,'lbl')
        ?{...labelCfg(L),...(layoutClone(c.lbl)||{})}:{...labelCfg(L)},
      groupId:L.groupId??null, clsOpen:!!L.clsOpen,
      color:c&&Object.prototype.hasOwnProperty.call(c,'color')?c.color:L.color,
      weight:c&&Object.prototype.hasOwnProperty.call(c,'weight')?c.weight:L.weight,
      fill:c&&Object.prototype.hasOwnProperty.call(c,'fill')?c.fill:L.fill, src:L.src||null,
      sym:c&&Object.prototype.hasOwnProperty.call(c,'sym')?layoutClone(c.sym):L.sym,
      fields:L.fields, features:L.features,
      attrFilter:c&&Object.prototype.hasOwnProperty.call(c,'attrFilter')?layoutClone(c.attrFilter):(L.attrFilter||null),
      attrFilterRules:c&&Object.prototype.hasOwnProperty.call(c,'attrFilterRules')?layoutClone(c.attrFilterRules):(L.attrFilterRules||null),
      attrFilterLogic:c&&c.attrFilterLogic?c.attrFilterLogic:(L.attrFilterLogic||'AND'),
      tinSurface:L.tinSurface||null, visReal:!!L.visReal,
      /* Receitas e vínculos construtivos precisam sobreviver ao .ccmgis;
         sem isto a cava reabria apenas como desenho estático e não podia
         recalcular interseção, bancos ou rampa. */
      cavaDesign:L.cavaDesign||null,
      _channelLink:L._channelLink||null,
      _rb31Recipe:L._rb31Recipe||null,
      _civilDesignId:L._civilDesignId||null,_civAlinhamento:!!L._civAlinhamento,_civSaia:!!L._civSaia,_civilCorridorKind:L._civilCorridorKind||null,
      _cavaReferencia:!!L._cavaReferencia,
      _cavaLimiteDin:!!L._cavaLimiteDin,_cavaLimiteOrig:L._cavaLimiteOrig??null,
      _cavaLimiteOrigFeat:L._cavaLimiteOrigFeat??null,
      _cavaRampOf:L._cavaRampOf??null,_cavaCutVectorOf:L._cavaCutVectorOf??null,
      _cavaControl:L._cavaControl||null,_cavaSource:L._cavaSource??null,
      _rb31CutOf:L._rb31CutOf??null,_cavaCutMode:L._cavaCutMode||null,
      _cavaLegacyCutOf:L._cavaLegacyCutOf??null,
      _cavaMdtCutOf:L._cavaMdtCutOf??null,_cavaMdtRasterId:L._cavaMdtRasterId??null,
      _cavaMdtCutUp:L._cavaMdtCutUp===true,
      _cava2Target:L._cava2Target||null,
      _cava2DesignId:L._cava2DesignId||null,_cava2Kind:L._cava2Kind||null,
      _cava2Engine:L._cava2Engine||null,_cava2CutOf:L._cava2CutOf||null,
      _cava2MdtId:L._cava2MdtId??null,
      _cava2Role:L._cava2Role||null,_cava2CutFillOf:L._cava2CutFillOf||null,
      _cava2CutFinalized:!!L._cava2CutFinalized,_cava2IntersectionPreview:!!L._cava2IntersectionPreview,
      _cava2Managed:!!L._cava2Managed,
      /* Cortes `_c` são fotografias vetoriais independentes. Estes metadados
         registram origem e nível sem recolocá-los no ciclo de atualização da
         cava paramétrica. */
      _cava2CutSnapshotOf:L._cava2CutSnapshotOf||null,
      _cava2CutSnapshotId:L._cava2CutSnapshotId||null,
      _cava2CutZ:L._cava2CutZ!=null&&Number.isFinite(+L._cava2CutZ)?+L._cava2CutZ:null,
      _cava2SnapshotRole:L._cava2SnapshotRole||null,
      _baciaTopoVersion:L._baciaTopoVersion??null,
      _containerCount:L._containerCount||null,
      /* Identificador estável do domínio geológico; o nome da camada é
         editável e não pode ser usado para reconhecer seu papel ao reabrir. */
      _geology:L._geology?layoutClone(L._geology):null,
      /* Blasting shares the ordinary vector model. Keep the source engine,
         conventions and batch identity independently from editable names. */
      _blasting:L._blasting?layoutClone(L._blasting):null
    });}),
    layout:{basemap:gv('loBasemap'),title:gv('loTitle'), sub:gv('loSub'), scale:gv('loScale'),
      grid:gv('loGrid'), paper:gv('loPaper'), sat:gc('loSat'), legend:gc('loLegend'), groupNumbers:gc('loGroupNumbers'),
      mar:gv('loMar'), pad:gv('loPad'), fitW:gc('loFitW'), scaleAuto:gc('loScaleAuto'),
      gridAuto:gc('loGridAuto'), frozen:S.loFrozen!==false,
      figFrozenVis:S._figFrozenVis?{...S._figFrozenVis}:null,
      figLegendVis:S._figLegendVis?{...S._figLegendVis}:{}, figW:gv('loFigW'),
      figH:gv('loFigH'), txt:gv('loTxt'),
      legFS:gv('loLegFS'), coordFS:gv('loCoordFS'), barFS:gv('loBarFS'), barSc:gv('loBarSc'), sym:gv('loSym'), legSc:gv('loLegSc'), cartFS:gv('loCartFS'), titFS:gv('loTitFS'),
      legColGap:gv('loLegColGap'), mapSym:gv('loMapSym'), dashDens:gv('loDash'),dashGap:gv('loDashGap'),
      coords:gc('loCoords'), coordTop:gc('loCoordTop'), coordBottom:gc('loCoordBottom'),
      coordLeft:gc('loCoordLeft'), coordRight:gc('loCoordRight'), cart:gc('loCart'),
      legOut:gc('loLegOut'), legPos:gv('loLegPos')||'auto',
      barPasso:gv('loBarPasso'), barAuto:gc('loBarAuto')},
    stack:(mapa2D&&Array.isArray(mapa2D.stack)?mapa2D.stack:(S.stack||[])).slice(),
    wms:(S.wms||[]).map(w=>({id:w.id,name:w.name,provider:w.provider||'',url:w.url,
      layers:w.layers,version:w.version||'1.3.0',opacity:w.opacity??0.85,protocol:w.protocol||'WMS',wmts:w.wmts||null,
      visible:w.visible!==false,attribution:w.attribution||'',clipLayerId:w.clipLayerId||null})),
    plates:(S.plates||[]).map(pl=>({id:pl.id, _collabId:pl._collabId||null,
      _blastingBatchId:pl._blastingBatchId??null,
      name:pl.name, f:{...pl.f}, c:pl.c?{...pl.c}:null,
      center:pl.center?pl.center.slice():null, vis:pl.vis?{...pl.vis}:null,
      conv:pl.conv?layoutClone(pl.conv):null,stack:Array.isArray(pl.stack)?pl.stack.slice():null,
      legendVis:pl.legendVis?{...pl.legendVis}:{},
      nota:pl.nota?{...pl.nota}:null,             // caixa de texto da legenda (A3)
      groups:pl.groups?pl.groups.map(g=>({...g})):null})),
    plateId:S.plateId,
    rasters:(S.rasters||[]).filter(r=>!options?.rasterIds||options.rasterIds.includes(r.id)).map(r=>{
      const c=convSalva('R',r.id),
        source=typeof projectNativeRasterGradeToSave==='function'?projectNativeRasterGradeToSave(r):r.d,
        // Calculated geostatistical grids have no external TIFF to recover
        // later. Persist every authored cell at its selected resolution.
        g=['geostatistics','cava2-clipped'].includes(r.src?.kind)?source:gradeParaSalvar(source);
      /* Se a grade Original foi editada sem alterar a prévia de tela, estas
         células precisam sobreviver mesmo quando a cópia TIFF não pode ser
         gravada. Um simples cache Original não muda a grade portátil. */
      return ({
      name:r.name, visible:visSalva('R',r.id,r.visible!==false),
      dispFull:!!r.dispFull, demHD:!!r.demHD,
      src:r.src||null, groupId:r.groupId??null, rid:r.id,
      _collabId:r._collabId||null,
      projectFile:r.projectFile||null, projectSavedAt:r.projectSavedAt||null,
      originalSource:window.GeoMineOriginalSources?.forSave(r,'raster',g)||null,
      projectNativeSource:typeof projectNativeForSave==='function'
        ?projectNativeForSave(r,'raster',g):(r.projectNativeSource||null),
      projectSavePending:!!r.projectSavePending,
      quantity:r.quantity||null, unit:r.unit||null,
      tinMethod:r._tinMethod||null, tinSourceId:r._tinSourceId??null,
      tinAutoClip:typeof r._tinAutoClip==='boolean'?r._tinAutoClip:null,
      exactClipRings:r._exactClipRings||null, v3:r._v3?{...r._v3}:null,
      style:(s=>({mode:s.mode, opacity:s.opacity, classes:s.classes||null,
             solidColor:s.solidColor||null,localRelief:s.localRelief?{...s.localRelief}:null}))((c&&c.style)||r.style),
      cnMeta:r.cnMeta||null, cnOrto:!!r._cnOrto,
      srcName:r.srcName||null,
      sig:(r.d && (r.d._sig || (r.src&&r.src.sig))) || (function(){ try{ return assinaturaMDT(r.d._full||r.d); }catch(e){ return null; } })(),
      tinPuro:!!r.tinPuro,
      tin:(r.tinPuro&&r.d&&r.d.tin)?(T=>{
        const n=T.xs.length, rx=new Float32Array(n), ry=new Float32Array(n), rz=new Float32Array(n);
        const x0=r.d.xll, y0=r.d.yll;
        for(let i=0;i<n;i++){ rx[i]=T.xs[i]-x0; ry[i]=T.ys[i]-y0; rz[i]=T.zs[i]; }
        return { n, x:f32ToB64(rx), y:f32ToB64(ry), z:f32ToB64(rz),
                 tri:f32ToB64(tinTriFiltrados(T)) };   /* bytes crus — lidos como u32 */
      })(r.d.tin):null,
      d:(g=>({nc:g.nc, nr:g.nr, cs:g.cs, csy:g.csy??null, xll:g.xll, yll:g.yll,
         // PROCEDÊNCIA da grade: sem isto o projeto reabre sem saber que a grade
         // gravada é a de TELA, e os produtos (perfil, curvas) saem suavizados.
         // native/resampled vêm da grade EFETIVAMENTE salva (g), não do raster
         // original — se o "salvar" reduziu a resolução, g.native=false e o
         // perfil vai oferecer o GeoTIFF original ao reabrir.
         resampled:g.resampled??null, srcDims:g.srcDims||r.d.srcDims||null, ovr:r.d.ovr??null,
         previewMethod:g.previewMethod||r.d.previewMethod||null,
         crs:g.crs||r.d.crs||null,srcCRS:g.srcCRS||r.d.srcCRS||null,
         native: (g.native!==undefined ? !!g.native : !!r.d.native),
         z:f32ToB64(g.z instanceof Float32Array ? g.z : Float32Array.from(g.z))
       }))(g)
    });}),
    /* sólidos: propriedades e geometria em coordenadas reais (antes só viviam na sessão) */
    solidos:typeof solParaSalvar==='function'?solParaSalvar():[],
    img:(S.img && S.img.url && S.img.b)?{url:S.img.url, b:S.img.b, src:S.img.src||null,
      // Persiste somente a prévia WM. A cópia UTM temporária usada pelo Layout
      // na sessão de migração não é duplicada dentro do arquivo .ccmgis.
      llb:S.img._llbounds||null, warpWM:!!S.img._warpWM,
      mask:typeof orthoMaskForSave==='function'?orthoMaskForSave(S.img):null,
      name:S.img.name||'ortofoto',
      visible:visSalva('I',0,S.img.visible!==false), groupId:S.img.groupId??null,
      // como o MDT: onde está a cópia nativa na pasta de trabalho, e o CRS de
      // origem fixado nas propriedades (null = cantos lidos no CRS de trabalho)
      projectFile:S.img.projectFile||null, projectSavedAt:S.img.projectSavedAt||null,
      originalSource:window.GeoMineOriginalSources?.forSave(S.img,'ortho')||null,
      projectNativeSource:typeof projectNativeForSave==='function'
        ?projectNativeForSave(S.img,'ortho'):(S.img.projectNativeSource||null),
      projectSavePending:!!S.img.projectSavePending,
      srcCRS:S.img._crsFixo||null,orthoHD:!!S.orthoHD,orthoDispFull:!!S.orthoDispFull}:null,
    hidro:{ inundRasterId:S.hidro.inundRasterId||null, sourceRasterId:S.hidro.sourceRasterId??null,
      inundDestination:S.hidro.inundDestination||null,inundDissolve:S.hidro.inundDissolve===true,serie:S.hidro.serie||null,
      idf:S.hidro.idf?{K:S.hidro.idf.K,a:S.hidro.idf.a,b:S.hidro.idf.b,c:S.hidro.idf.c,
        Ts:S.hidro.idf.Ts||[],r2:S.hidro.idf.r2??null,rows:[]}:null }
  };
  // The bounded pre-import recovery writer owns its progress overlay and
  // checks project/generation/edit-version between chunks. It can borrow
  // geometry rather than duplicating the whole project before a TIFF read.
  return options?.borrowGeometry===true?data:snapshot(data);
}
/* ============================================================================
   SALVAMENTO CLÁSSICO — somente Salvar / Salvar Como gravam o projeto.
   O handle aberto permanece disponível para o próximo Salvar explícito.
   Cópias antigas continuam acessíveis em Recuperar, sem retomada automática.
   ========================================================================== */
function projectManualSaveMode(){return true;}
/* `backing` distingue um arquivo confirmado de um rascunho local. Um
   rascunho nunca pode herdar silenciosamente o handle de outro projeto. */
S.auto={on:false, name:null, handle:null, backing:'draft', timer:null, last:null,
  savedAt:0, dirty:false, busy:false};
S._lastDir=null; S._lastSaved=null;
loadLastDir().then(dh=>{ if(dh) S._lastDir=dh; }).catch(()=>{});

function projectNameDisplay(name){
  return String(name||'').replace(/\.ccmgis$/i,'').replace(/\.(geocampo|alagis)\.json$/i,'').trim();
}
function setOpenProjectName(name){
  if(window.GeoMineProjectFile)return GeoMineProjectFile.render(name);
  const raw=String(name||'').trim(),rot=projectNameDisplay(raw)||'Nenhum projeto aberto';
  S.currentProjectName=raw||null;
  const e=document.getElementById('a3OpenProjectName');
  if(e){e.textContent=rot;e.title=raw?`Projeto aberto: ${raw}`:'Nenhum projeto aberto';e.classList.toggle('has-file',!!raw);}
  const h=document.getElementById('a3ProjectTitle');
  if(h)h.textContent=raw?`CCMGIS 3.1 — ${rot}`:'CCMGIS 3.1';
}
setOpenProjectName(S.projectMeta?.name||null);

/* Guarda o handle do último arquivo/pasta usado, para o próximo "salvar como"
   começar ali — sem navegar toda vez. Handles são serializáveis no IndexedDB
   (structured clone), e o startIn aceita tanto DirectoryHandle quanto FileHandle. */
function rememberLastDir(dh){ if(!dh) return;
  try{ const q=indexedDB.open('alagis_fs',1);
    q.onupgradeneeded=e=>{ const db=e.target.result;
      if(!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); };
    q.onsuccess=e=>{ const db=e.target.result;
      try{ db.transaction('kv','readwrite').objectStore('kv').put(dh,'lastDir'); }catch(_){}
    };
  }catch(_){}
}
async function loadLastDir(){
  return new Promise(res=>{ try{ const q=indexedDB.open('alagis_fs',1);
    q.onupgradeneeded=e=>{ const db=e.target.result;
      if(!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); };
    q.onsuccess=e=>{ const db=e.target.result;
      try{ const r=db.transaction('kv','readonly').objectStore('kv').get('lastDir');
        r.onsuccess=()=>res(r.result||null); r.onerror=()=>res(null);
      }catch(_){ res(null); } };
    q.onerror=()=>res(null);
  }catch(_){ res(null); } });
}
/* --- IndexedDB mínimo (1 registro: 'autosave') --- */
function idb(){
  return new Promise((res,rej)=>{
    const q=indexedDB.open('ccm_geocampo',1);
    q.onupgradeneeded=()=>{ if(!q.result.objectStoreNames.contains('kv')) q.result.createObjectStore('kv'); };
    q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error);
  });
}
/* No WebKit (iPad) o evento de erro chega com t.error ainda nulo — o motivo
   está no pedido — e uma transação abortada (armazenamento cheio) não dispara
   onerror. Rejeitar com null quebrava quem lê e.name no catch, e sem onabort a
   promessa nunca terminava. */
async function idbSet(k,v){ const db=await idb(); return new Promise((res,rej)=>{
  const t=db.transaction('kv','readwrite'), r=t.objectStore('kv').put(v,k);
  const falha=ev=>rej(t.error||r.error||(ev&&ev.target&&ev.target.error)||
    new Error('O navegador não conseguiu gravar no armazenamento deste aparelho.'));
  t.oncomplete=()=>res(true); t.onerror=falha; t.onabort=falha; }); }
async function idbGet(k){ const db=await idb(); return new Promise((res,rej)=>{
  const t=db.transaction('kv','readonly'); const r=t.objectStore('kv').get(k);
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }

/* A versão contínua chaveia cada rascunho por conta e projeto. Durante o
   carregamento inicial (antes do módulo de sessão existir) conservamos a chave
   legada apenas como fallback; ela nunca é usada para restaurar outra conta. */
function autosaveStorageKey(projectId){
  try{
    const api=window.GeoMineSessionAutosave;
    if(api&&typeof api.draftKey==='function')return api.draftKey(projectId||S.projectId||null);
  }catch(_){}
  return 'autosave';
}
function autosaveOwnerUid(){
  try{return window.GeoMineCloudProvider?.user?.uid||window.GeoMineSessionAutosave?.state?.ownerUid||null;}
  catch(_){return null;}
}

function autoTag(txt,cor){ const e=document.getElementById('autoTag'); if(!e) return;
  e.textContent=txt; e.style.color=cor||'var(--cyan)'; }

async function ensureRW(h, ask=false){
  try{
    const o={mode:'readwrite'};
    if((await h.queryPermission(o))==='granted') return true;
    /* requestPermission exige um gesto transitório. Timers, boot e autosave
       trabalham sempre com ask=false; somente Salvar/reconectar pode pedir. */
    return !!ask && (await h.requestPermission(o))==='granted';
  }catch(e){ return false; }
}

function hasContent(){ return !!(S.layers.length || S.groups.length ||
  (S.rasters&&S.rasters.length) || (S.wms&&S.wms.length) ||
  (S.plates&&S.plates.length) || (S.img&&S.img.url) || S.projectMeta ||
  window.GeoMineLicenses?.hasContent()); }

async function autosaveNow(silent){
  // Compatibilidade com integrações antigas: nunca dispara uma gravação.
  return false;
}

function startAutosave(name, handle){
  // O nome histórico permanece para os importadores; agora só vincula o arquivo.
  S.auto.on=false; S.auto.name=name; S.auto.handle=handle||null;
  S.auto.backing=handle?'file':'draft';
  S.auto.busy=false;S.auto.blockedLarge=false;
  window.GeoMineProjectFile?.remember(name,handle);
  setOpenProjectName(name);
  if(S.auto.timer) clearInterval(S.auto.timer);
  S.auto.timer=null;
  autoTag(S.auto.dirty?'Manual · alterações não salvas':'Salvamento manual');
}

async function saveProject(salvarComo=false){
  /* Salvar = sobrescrever silenciosamente o MESMO handle. O evento de clique
     não pode virar o argumento `salvarComo` (era a causa de Salvar abrir o
     diálogo e sugerir cópias 2/v2). */
  const handleAtual=window.GeoMineProjectFile?.currentHandle()||(S.auto&&S.auto.handle);
  const projectIdAtual=S.projectId||null,
    geracaoAtual=window.GeoMineSessionAutosave?.state?.generation;
  const donoCopia=autosaveOwnerUid(),chaveCopia=autosaveStorageKey(projectIdAtual);
  const mesmoProjeto=()=> (S.projectId||null)===projectIdAtual&&
    window.GeoMineSessionAutosave?.state?.generation===geracaoAtual;
  salvarComo=salvarComo===true||!handleAtual;
  const base=S.auto?.name||S.currentProjectName||S.projectMeta?.name||'projeto';
  let fname=salvarComo
      ?String(base).replace(/[^\w.\-]/g,'_').replace(/\.(ccmgis|geocampo|alagis)$/i,'')+'.ccmgis'
      :(handleAtual.name||S.auto.name||'projeto.ccmgis');
  let destinoNovo=null;
  // Ask while still in the explicit Save gesture, before raster work/serialization.
  if(!salvarComo&&!await ensureRW(handleAtual,true)){
    toast('Sem permissão para atualizar '+fname+'. Autorize a escrita ou use Salvar Como.');return false;
  }
  const saveTarget=window.GeoMineProjectSaveTarget;
  if(salvarComo&&(saveTarget?saveTarget.available():window.showSaveFilePicker&&fsApiOK())){
    const opt={suggestedName:fname,excludeAcceptAllOption:true,
      types:[{description:'Projeto CCMGIS',accept:{'application/x-ccmgis':['.ccmgis']}}]};
    if(handleAtual)opt.startIn=handleAtual;else if(S._lastSaved)opt.startIn=S._lastSaved;
    try{destinoNovo=await (saveTarget?saveTarget.pick(opt):pickSaveFile(opt));fname=destinoNovo.name||fname;}
    catch(error){
      if(error&&error.name==='AbortError'){toast('Salvamento cancelado');return false;}
      console.warn('seletor indisponível:',error);
    }
  }
  if(!mesmoProjeto()){toast('O projeto mudou; salvamento cancelado.');return false;}
  /* O .ccmgis conserva uma prévia portátil; os rasters nativos ficam em
     ALAGIS/rasters. Só a primeira gravação pede que se escolha a pasta. */
  if((S.rasters||[]).some(r=>r&&r.d&&!r.tinPuro)||S.img){
    showLoad('Verificando vínculos dos rasters; reutilizando os arquivos existentes…');
    /* Salvar direto não abre outro seletor de pasta; só Salvar Como pode
       pedir um novo destino para rasters nativos pendentes. */
    try{
      const sync=typeof projectSyncNativeSources==='function'
        ?await projectSyncNativeSources(!!salvarComo):await projectSyncNativeRasters(!!salvarComo);
      if(sync&&!sync.ok)toast('Projeto será salvo com a prévia interna; a cópia GeoTIFF nativa aguarda uma pasta de projeto.');
    }catch(error){console.warn('sincronização nativa:',error);}
  }
  if(!mesmoProjeto()){hideLoad();toast('O projeto mudou; salvamento cancelado.');return false;}
  // projeto pesado (rasters grandes): deixa o usuário escolher a resolução de gravação
  S._saveTargetCell=null;
  // Conserva o orçamento menor de memória no celular, mesmo quando ele
  // oferece seletor de gravação. Isto não controla a escolha do destino.
  const noCel = !fsApiOK();
  const limiar = noCel ? 25 : 180;
  if((S.rasters||[]).length && estimaPesoMB(null) > limiar){
    const alvo=await escolheResolucaoSalvar(noCel);
    if(!mesmoProjeto()){hideLoad();toast('O projeto mudou; salvamento cancelado.');return false;}
    if(alvo===false){S._saveTargetCell=null;hideLoad();return false;}
    S._saveTargetCell=alvo;           // null=nativa, ou metros/célula
  }
  showLoad('Serializando projeto…');
  await new Promise(r=>setTimeout(r,30));
  let txt;
  try{
    if(!mesmoProjeto())throw new Error('o projeto mudou durante a preparação; salvamento cancelado');
    const snapshot=projectData();snapshot.projectFileName=fname;
    txt=JSON.stringify(snapshot); S._saveTargetCell=null;
  }
  catch(e){ hideLoad();if(mesmoProjeto())S._saveTargetCell=null;
    const gde=/Invalid string length|RangeError|allocation/i.test(String(e&&(e.message||e)));
    const det=(e&&e.name?e.name:'erro')+(e&&e.code?' (código '+e.code+')':'')+
              (e&&e.message?': '+e.message:'');
    toast(gde? 'Projeto grande demais para serializar — '+det
             : 'Falha ao salvar — '+det);
    if(typeof cmdLog==='function'){
      cmdLog('falha ao serializar o projeto — '+det,'erro');
      (S.rasters||[]).forEach(r=>cmdLog(`  superfície ${r.name}: ${r.d.nc}×${r.d.nr} = `+
        `${(r.d.nc*r.d.nr/1e6).toFixed(1)} M células`,'info'));
    }
    return false; }
  if(txt.length>380*1048576){
    hideLoad();
    toast('Projeto com '+(txt.length/1048576).toFixed(0)+' MB — acima do que o navegador grava com segurança');
    if(typeof cmdLog==='function') cmdLog('projeto serializado em '+(txt.length/1048576).toFixed(0)+
      ' MB; remova superfícies ou reduza a resolução gravada','avisa');
    return false;
  }
  const mb=txt.length/1048576;
  // CÓPIA DE SEGURANÇA imediata no navegador, ANTES de tentar gravar o
  // arquivo: se o download/compartilhamento falhar, truncar ou sair renomeado
  // (.bin), o botão ↺ Recuperar restaura exatamente este ponto do trabalho.
  try{
    await idbSet(chaveCopia,{projectId:projectIdAtual,ownerUid:donoCopia,name:fname, at:new Date().toISOString(), txt});
    const br=document.getElementById('btnRestore'); if(br) br.style.display='';
    if(typeof cmdLog==='function')
      cmdLog(`cópia de segurança gravada no navegador (${mb.toFixed(1)} MB) — ↺ Recuperar restaura`,'info');
  }catch(e){
    if(typeof cmdLog==='function')
      cmdLog('⚠ não consegui gravar a cópia de segurança no navegador: '+(e&&e.message||e),'avisa');
  }
  let salvo=false;
  // navegador sem seletor de pasta (Firefox/Safari, file://) ou que recusa gravar no arquivo escolhido
  const baixar=async()=>{
    const outcome=await download(new Blob([txt],{type:'application/octet-stream'}),fname,{reportResult:true,skipPicker:true});
    if(outcome===false||outcome?.status==='canceled'){toast('Salvamento cancelado');return false;}
    if(outcome?.status==='written'&&outcome.handle){
      if(mesmoProjeto())startAutosave(outcome.name||fname,outcome.handle);
      return true;
    }
    if(mesmoProjeto())window.GeoMineProjectFile?.downloadRequested(fname);
    toast(`Download iniciado: ${fname}. Confira o novo arquivo em Downloads. O arquivo original não foi alterado; a gravação ainda não está confirmada.`);
    return false;
  };
  try{
    if(!salvarComo){
      if(!await ensureRW(handleAtual,true))throw new Error('permissão de escrita recusada para '+fname);
      await fileHandleWriteVerified(handleAtual,txt,fname);
      if(mesmoProjeto())startAutosave(handleAtual.name||fname,handleAtual);
      toast(`Projeto atualizado em ${handleAtual.name||fname} (${mb.toFixed(1)} MB)`);
    } else if(destinoNovo){
      // guarda o handle para o próximo clique explícito em Salvar
      // tipo MIME próprio + uma única extensão: assim o Windows/Chrome não troca
      // a extensão por .json na caixa "Salvar como"
      /* O próprio FILE handle é uma âncora válida para startIn. Assim
         “Salvar Como” abre primeiro na pasta do projeto corrente, mantendo
         livres tanto o nome quanto a escolha de outra pasta. */
      const h=destinoNovo;
      let gravado=true;
      try{await fileHandleWriteVerified(h,txt,fname);}
      catch(e){if(typeof fsMarcaRecusa!=='function'||!fsMarcaRecusa(e))throw e;gravado=false;}
      if(gravado){
        lembraLocal(h);
        if(mesmoProjeto())startAutosave(h.name||fname, h);
        toast(`Projeto salvo como ${h.name} (${mb.toFixed(1)} MB)`);
      }else if(!await baixar())return false;   // o navegador recusou o arquivo escolhido
    } else if(!await baixar())return false;
    salvo=true;
  }catch(e){
    if(e && e.name==='AbortError'){ toast('Salvamento cancelado'); }
    else if(!salvarComo){
      console.warn('sobrescrever projeto:',e);
      toast('Não foi possível sobrescrever o arquivo aberto: '+(e&&e.message||e)+'. Use “Salvar Como” se a permissão mudou.');
    } else { console.warn('salvar projeto:', e);
      toast('Não foi possível gravar '+fname+': '+(e&&e.message||e)+'. As alterações continuam não salvas.');
    }
  }finally{
    hideLoad();
    // RESGATE: shapefiles que ficaram sem atributos nesta leva.
    // No Android é comum o seletor mandar só o arquivo tocado — em vez de
    // deixar a camada capada, pedimos o .dbf na hora, já filtrado.
    if(S._pedirDbf && S._pedirDbf.length){
      const nomes=S._pedirDbf.slice(); S._pedirDbf=[];
      if(confirm(`Camada(s) sem atributos: ${nomes.join(', ')}.\n`+
        `Quer selecionar agora o(s) arquivo(s) .dbf correspondente(s)?\n`+
        `(No seletor do Android, toque e segure para marcar vários.)`)){
        const inp=document.createElement('input');
        inp.type='file'; inp.multiple=true; inp.accept='.dbf,.prj,.cpg';
        inp.style.display='none'; document.body.appendChild(inp);
        inp.onchange=()=>{ const fl=inp.files; inp.remove(); if(fl&&fl.length) handleFiles(fl); };
        inp.addEventListener('cancel',()=>inp.remove());
        inp.click();
      }
    }
  }
  return salvo;
}
/* Repara projetos gravados com geometria de ponto em formato plano.
   Versões anteriores salvaram pontos como geom:[x,y] e zg:z, quando o formato
   do app é geom:[[x,y]] e zg:[z]. Sem isto o desenho estoura e o projeto
   inteiro deixa de abrir. O reparo é idempotente.                          */
function reparaGeom(d){
  let nL=0, nF=0;
  (d.layers||[]).forEach(o=>{
    if(o.gtype!=='point' || !Array.isArray(o.features)) return;
    let mud=false;
    o.features.forEach(f=>{
      const g=f.geom;
      if(Array.isArray(g) && g.length>=2 && typeof g[0]==='number' && typeof g[1]==='number'){
        const zGeom=g.length>2&&g[2]!=null&&!(typeof g[2]==='string'&&!g[2].trim())&&Number.isFinite(+g[2])?+g[2]:null;
        f.geom=[[g[0],g[1]]]; mud=true; nF++;
        if(zGeom!=null&&(f.zg==null||(Array.isArray(f.zg)&&!f.zg.length)))f.zg=[zGeom];
      }
      if(typeof f.zg==='number') f.zg=[f.zg];
    });
    if(mud) nL++;
  });
  return {nL,nF};
}

function loadProject(d){
  window.GeoMineCadHatch?.cancel();
  window.GeoMineFeatureStyleEditor?.close();
  window.GeoMineFeatureStyleBrush?.cancel();
  window.GeoMineBlasting?.projectChanged?.();
  window.GeoMinePointCatchment?.projectChanged?.();
  window.GeoMineBlastingPresentation?.resetProject();
  const openingScope=GeoMineProjectOpening.begin();
  try{
  window.GeoMineCivil?.reset();
  if(typeof clearMeas==='function')clearMeas();
  // O perfil temporário não pode usar o eixo/fontes de outro arquivo com os mesmos IDs.
  if(typeof profResetProject==='function')profResetProject();
  /* Estado temporário de uma prancha nunca pertence ao arquivo seguinte,
     mesmo quando ambos reutilizam os mesmos IDs de camadas. Invalidar também
     renderizações em voo antes de montar qualquer dado do novo projeto. */
  if(typeof layoutInvalidateOrtho==='function')layoutInvalidateOrtho('project-load',false);
  S._preLayoutMapState=null;S._lastSVG=null;S._lastOrthoDpi=null;
  S._loDraftVis=null;S._loDraftConv=null;S._loDraftStack=null;S._loAppliedPlateId=null;
  S._figFrozenVis=null;S._figLegendVis={};S.loFrozen=true;
  /* Abrir outro arquivo começa pelo seu mapa principal. Permanecer no Layout
     faria refreshUI reaplicar a prancha recebida antes de termos capturado o
     novo mapa 2D (inclusive sua ortofoto, restaurada mais adiante). O snapshot
     anterior já foi descartado: sair agora não pode devolvê-lo ao projeto. */
  if(S._view==='layout'){
    if(typeof switchView==='function')switchView('map');
    else S._view='map';
  }
  window.GeoMineProjectScreen?.prepare(d);
  window.GeoMineNativeFlood?.resetProject();
  if(typeof hShadeOff==='function')hShadeOff(true);
  S.hidro=S.hidro||{};S.hidro.serie=null;S.hidro.idf=null;S.hidro.inundRasterId=null;S.hidro.sourceRasterId=null;S.hidro.inundDestination=null;S.hidro.inundDissolve=false;
  S.hidro.dem=null;S.hidro.demBase=null;S.hidro.pilha=[];
  for(const id of ['btnFill','btnShade','btnRaw','btnD8Dir','btnD8Acc','btnStreams','btnBasin']){const e=document.getElementById(id);if(e)e.disabled=true;}
  if(document.getElementById('hDemOut'))document.getElementById('hDemOut').textContent='Selecione o MDT deste projeto para usar no Hidro.';
  /* Um arquivo aberto manualmente não pode herdar a sala do projeto anterior.
     A carga remota da própria colaboração marca applyingRemote e é ignorada
     por este gancho. */
  try{if(window.GeoMineCollaboration&&typeof window.GeoMineCollaboration.prepareProjectReplacement==='function')window.GeoMineCollaboration.prepareProjectReplacement();}catch(e){console.warn('desconexão colaborativa',e);}
  const rep=reparaGeom(d);          // conserta formatos antigos antes de montar
  // limpar estado atual
  /* o modo 3.1 não sobrevive à troca de projeto: o estado apontaria
     camadas que já não existem e o Gerar re-adicionava uma pilha
     fantasma. A receita gravada nas camadas novas reconstrói tudo. */
  S._rb31=null;
  /* MIGRAÇÃO: limite dinâmico salvo como POLÍGONO vira LINHA FECHADA —
     o interior transparente do polígono capturava todos os cliques */
  try{
    ((rep&&rep.layers)||d.layers||[]).forEach(o=>{
      if(!o||!o._cavaLimiteDin||o.gtype!=='polygon')return;
      o.gtype='line';
      (o.features||[]).forEach(ft=>{
        if(ft&&ft.multi&&Array.isArray(ft.geom&&ft.geom[0]&&ft.geom[0][0])){
          ft.geom=ft.geom[0]; ft.multi=false;
          if(Array.isArray(ft.zg)&&Array.isArray(ft.zg[0]))ft.zg=ft.zg[0];
        }
      });
    });
  }catch(e){}
  try{ if(typeof rb31LimpaMarcaInicio==='function')rb31LimpaMarcaInicio(); }catch(e){}
  S.layers.forEach(L=>{ if(L.llayer) map.removeLayer(L.llayer); });
  (S.wms||[]).forEach(w=>{ if(w.llayer) map.removeLayer(w.llayer); });
  if(S.img && S.img.overlay) map.removeLayer(S.img.overlay);
  S.layers=[]; S.wms=[]; S.selFeat=null; S.img=null; S.stack=[]; S.plates=[]; S.plateId=null;
  S.projectId=d.projectId||('gm_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10));
  window.GeoMineLicenses?.restore(d.environmentalLicenses);
  S.geology={schemaVersion:1,sections:[],settings:{}};
  S._v3SurfOn={...((d.v3&&d.v3.surfOn)||{})};
  S._v3TexTipo=(d.v3&&d.v3.texTipo)||'hipso';
  S._v3TexCor=(d.v3&&d.v3.texCor)||'#8d5524';
  S.collaboration=d.collaboration&&typeof d.collaboration==='object'
    ?{roomId:d.collaboration.roomId||null,roomName:d.collaboration.roomName||null,
      baseRevision:+d.collaboration.baseRevision||0,lastSeq:+d.collaboration.lastSeq||0}
    :null;
  S.groups=(d.groups||[]).map(g=>({id:g.id,name:g.name,parentId:groupParentValue(g),collapsed:!!g.collapsed,
      visibilityResume:Array.isArray(g.visibilityResume)?g.visibilityResume.filter(k=>typeof k==='string'):[],
    _collabId:g._collabId||null}));
  gid=S.groups.reduce((m,g)=>Math.max(m,g.id+1),gid);
  if(d.workCRS && CRS_DEFS[d.workCRS]) S.workCRS=d.workCRS;
  S.projectMeta=d.projectMeta||null;
  S.researchRequest=d.researchRequest&&typeof d.researchRequest==='object'?layoutClone(d.researchRequest):null;
  if(window.GeoMineTitleblockLogo)window.GeoMineTitleblockLogo.restore(d);
  setOpenProjectName(d.projectFileName||S.projectMeta?.name||'Projeto aberto');
  const defSym=c=>({mode:'single',color:c,stroke:c,hatch:'solid',hatchScale:1,weight:2,fill:0.35,dash:'',
    field:'',classes:[],cats:[],ramp:'amber'});
  (d.layers||[]).forEach(o=>{
    const col=o.color||(o.sym&&o.sym.color)||'#f5a524';
    const L={id:(o.id??uid++), _collabId:o._collabId||null,
      name:o.name||'camada', gtype:o.gtype||'polygon',
      crs:(o.crs && CRS_DEFS[o.crs])?o.crs:S.workCRS,
      visible:o.visible!==false,
      // O cadeado salvo é uma escolha do usuário. O padrão por tipo só se
      // aplica a projetos antigos que ainda não gravavam esse estado.
      locked:typeof o.locked==='boolean'?o.locked:!!(o._geology&&
        (o._geology.kind==='surpac-mesh'||o._geology.importedBoreholes===true)),
      labelField:o.labelField||'',
      labelFields:Array.isArray(o.labelFields)?o.labelFields.slice():null,
      /* Projetos antigos herdavam unique:true e apagavam pontos com o mesmo
         texto (dois EFLUENTE, duas cotas iguais etc.). Pontos são observações
         individuais; deduplicação permanece exclusiva de linhas/polígonos. */
      lbl:{...defaultLabelCfg(), ...(o.lbl||{}), ...(o.gtype==='point'?{unique:false}:{})},
      groupId:o.groupId??null, clsOpen:!!o.clsOpen,
      color:col, weight:o.weight??2, fill:o.fill??0.35, src:o.src||null,
      sym:Object.assign(defSym(col), o.sym||{}),
      fields:o.fields||[{name:'FID',type:'N',length:9,decimal:0}],
      features:(o.features||[]).filter(f=>f&&f.geom), attrFilter:o.attrFilter||null,
      attrFilterRules:Array.isArray(o.attrFilterRules)?layoutClone(o.attrFilterRules):null,
      attrFilterLogic:o.attrFilterLogic||'AND',
      tinSurface:o.tinSurface||null, visReal:!!o.visReal,
      /* Projeto gravado por versão antiga podia trazer live:false — a cava
         reabria muda, e o limite editado não movia nada. O acompanhamento é
         invariante agora, então a receita é migrada na leitura. */
      cavaDesign:o.cavaDesign?{...o.cavaDesign,live:true}:null,
      _channelLink:o._channelLink&&typeof o._channelLink==='object'?layoutClone(o._channelLink):null,
      /* A RECEITA da rampa por bancada e as marcas do limite dinâmico não
         eram relidas: o arquivo reabria com a pilha desenhada, mas arrastar o
         limite não refazia nada — o vínculo morria no primeiro fechamento.
         Persistidos aqui, o acompanhamento renasce em qualquer sessão. */
      _rb31Recipe:o._rb31Recipe||null,
      _civilDesignId:o._civilDesignId||null,_civAlinhamento:!!o._civAlinhamento,_civSaia:!!o._civSaia,_civilCorridorKind:o._civilCorridorKind||null,
      _cavaReferencia:!!o._cavaReferencia,
      _cavaLimiteDin:!!o._cavaLimiteDin,_cavaLimiteOrig:o._cavaLimiteOrig??null,
      _cavaLimiteOrigFeat:o._cavaLimiteOrigFeat??null,
      _cavaRampOf:o._cavaRampOf??null,_cavaCutVectorOf:o._cavaCutVectorOf??null,
      _cavaControl:o._cavaControl||null,_cavaSource:o._cavaSource??null,
      _rb31CutOf:o._rb31CutOf??null,_cavaCutMode:o._cavaCutMode||null,
      _cavaLegacyCutOf:o._cavaLegacyCutOf??null,
      _cavaMdtCutOf:o._cavaMdtCutOf??null,_cavaMdtRasterId:o._cavaMdtRasterId??null,
      _cavaMdtCutUp:o._cavaMdtCutUp===true,
      _cava2Target:o._cava2Target||null,
      _cava2DesignId:o._cava2DesignId||null,_cava2Kind:o._cava2Kind||null,
      _cava2Engine:o._cava2Engine||null,_cava2CutOf:o._cava2CutOf||null,
      _cava2MdtId:o._cava2MdtId??null,
      _cava2CutSnapshotOf:o._cava2CutSnapshotOf||null,
      _cava2Role:o._cava2Role||null,_cava2CutFillOf:o._cava2CutFillOf||null,
      _cava2CutFinalized:!!o._cava2CutFinalized,_cava2IntersectionPreview:!!o._cava2IntersectionPreview,
      _cava2Managed:!!o._cava2Managed,
      _cava2CutSnapshotId:o._cava2CutSnapshotId||null,
      _cava2CutZ:o._cava2CutZ!=null&&Number.isFinite(+o._cava2CutZ)?+o._cava2CutZ:null,
      _cava2SnapshotRole:o._cava2SnapshotRole||null,
      _baciaTopoVersion:o._baciaTopoVersion??null,
      _containerCount:o._containerCount||null,
      _geology:o._geology&&typeof o._geology==='object'?layoutClone(o._geology):null,
      _blasting:o._blasting&&typeof o._blasting==='object'?layoutClone(o._blasting):null,
      llayer:null};
    if(L.id>=uid) uid=L.id+1;         // evita colisão com futuras camadas
    /* Projetos antigos de sinalização guardavam todos os pontos com um único
       símbolo. Ao abrir, a biblioteca reconhece o campo e migra cada valor
       para sua placa, sem alterar camadas pontuais comuns. */
    try{if(window.GeoMinePointSymbols)window.GeoMinePointSymbols.autoApplyLayer(L);}catch(e){}
    S.layers.push(L); GeoMineProjectOpening.restore(L,'L');
  });
  // rasters (MDE GeoTIFF)
  /* Tiles dinamicos fecham sobre o objeto raster que existia quando foram
     criados. Ao trocar de projeto, limpa-los antes de reutilizar um rid evita
     que o MDT anterior permaneca visivel ou alimente a nova camada. */
  try{if(typeof clearDemTiles==='function')clearDemTiles();}catch(e){}
  (S.rasters||[]).forEach(r=>{ if(r.overlay) map.removeLayer(r.overlay); });
  S.rasters=[];
  (d.rasters||[]).forEach(o=>{
    if(!o || !o.d || !o.d.z) return;
    const g={nc:o.d.nc, nr:o.d.nr, cs:o.d.cs, xll:o.d.xll, yll:o.d.yll, z:b64ToF32(o.d.z),
      fromProject:true};
    if(o.d.csy!=null) g.csy=o.d.csy;                       // veio de arquivo: procedência a confirmar
    if(o.d.crs)g.crs=o.d.crs;
    if(o.d.srcCRS)g.srcCRS=o.d.srcCRS;
    if(o.d.resampled!=null) g.resampled=o.d.resampled;
    if(o.d.srcDims) g.srcDims=o.d.srcDims;
    if(o.d.ovr!=null) g.ovr=o.d.ovr;
    if(o.d.previewMethod) g.previewMethod=o.d.previewMethod;
    if(o.d.native) g.native=true;
    if(o.sig) g._sig=o.sig;                               // assinatura de conteúdo p/ religar o TIFF pleno
    const r={id:(o.rid??rid++), _collabId:o._collabId||null,
      name:o.name||'MDE', d:g, visible:o.visible!==false, src:o.src||null,
      dispFull:true,
      /* Projetos antigos nao tinham esta chave. No computador, ao reencontrar
         o GeoTIFF da pasta do projeto, a visualizacao detalhada passa a ser o
         padrao; no tablet o modo leve continua sendo o padrao. */
      demHD:true,
      _demHDLegacy:o.demHD===undefined,
      tinPuro:!!o.tinPuro,
      srcName:o.srcName||null,
      projectFile:o.projectFile||null,
      originalSource:o.originalSource||null,
      projectSavedAt:o.projectSavedAt||null,
      projectNativeSource:o.projectNativeSource||null,
      projectSavePending:!!o.projectSavePending,
      quantity:o.quantity||null, unit:o.unit||null,
      groupId:o.groupId??null,
      style:{mode:(o.style&&o.style.mode)||'hipso_hs', opacity:(o.style&&o.style.opacity)??0.8,
             classes:(o.style&&o.style.classes)||null,
             solidColor:(o.style&&o.style.solidColor)||null,
             localRelief:o.style?.localRelief?{...o.style.localRelief}:null},
      overlay:null, cnMeta:o.cnMeta||null, _cnOrto:!!o.cnOrto,
      _tinMethod:o.tinMethod||null,_tinSourceId:o.tinSourceId??null,
      _tinAutoClip:typeof o.tinAutoClip==='boolean'?o.tinAutoClip:undefined,
      _exactClipRings:Array.isArray(o.exactClipRings)?o.exactClipRings:null,
      _v3:o.v3?{...o.v3}:null};
    if(r._cnOrto&&r.cnMeta){
      const m=r.cnMeta,cl=new Uint8Array(g.z.length);
      for(let k=0;k<g.z.length;k++){const v=g.z[k];if(!isFinite(v))continue;
        cl[k]=(Math.abs(v-m.veg)<=Math.abs(v-m.ant)&&Math.abs(v-m.veg)<=Math.abs(v-m.rock))?3:
          (Math.abs(v-m.ant)<=Math.abs(v-m.rock)?2:1);}
      g._cnClass=cl;S._cnRaster=r;
    }
    /* Superfície TIN salva: reanexa a triangulação exata (coords relativas
       f32 + índices u32; o filtro de aresta/recorte já veio aplicado) */
    if(o.tinPuro&&o.tin&&o.tin.x){
      try{
        const rx=b64ToF32(o.tin.x), ry=b64ToF32(o.tin.y), rz=b64ToF32(o.tin.z),
          tri=b64ToU32(o.tin.tri), n=o.tin.n||rx.length;
        const xs=new Array(n), ys=new Array(n), zs=new Array(n);
        for(let i=0;i<n;i++){ xs[i]=g.xll+rx[i]; ys[i]=g.yll+ry[i]; zs[i]=rz[i]; }
        tinAnexaExato(g,xs,ys,zs,tri,0,null);
        /* a Visão 3D usa a malha exata (_tinMesh); sem reconstruí-la aqui, o
           3D de um projeto reaberto cairia na grade-retrato grosseira */
        const pos=new Float32Array(n*3);
        for(let i=0;i<n;i++){ pos[3*i]=xs[i]; pos[3*i+1]=ys[i]; pos[3*i+2]=zs[i]; }
        r._tinMesh={positions:pos, indices:tri};
      }catch(e){ console.warn('tin do projeto',e); }
    }
    rid=Math.max(rid, r.id+1);
    S.rasters.push(r); GeoMineProjectOpening.restore(r,'R');
  });
  /* Migração topológica na abertura: corrige também as camadas que já
     estavam gravadas no projeto, sem exigir que o usuário apague e gere a
     cava/bacia novamente. */
  const repTopo={cava:0,bacia:0,linhas:0};
  const candidatosMdt=new Map();
  // Cava2 já grava a receita e o resultado explicitamente. O reparo legado
  // soldava os seus vértices e alterava inclusive a versão Recortada salva.
  const cava2Persistida=L=>!!(L._cava2DesignId||L._cava2CutOf||L._cava2CutFillOf||
    L._cava2CutSnapshotId||L._cava2CutSnapshotOf||L._cava2Target);
  (S.layers||[]).forEach(L=>{
    if(cava2Persistida(L))return;
    let mudou=false;
    try{
      /* A detecção do MDT precisa comparar a interseção COMO FOI SALVA.
         Soldar/injetar nós antes dessa comparação altera o número de
         vértices e pode mascarar o erro zero do raster correto. */
      const fs0=L.features||[],temInter0=fs0.some(f=>String(f?.props?.TIPO||'')==='Interseção cava × terreno'||
          String(f?.props?.CLASSE||'')==='daylight'),
        an0=fs0.filter(cavaEhAnelProjeto),fc0=an0.filter(f=>f.geom?.length>=4&&
          Math.hypot(f.geom[0][0]-f.geom.at(-1)[0],f.geom[0][1]-f.geom.at(-1)[1])<1e-6);
      if(!L.cavaDesign&&!L._cavaCutMode&&!L._cavaMdtCutOf&&temInter0&&fc0.length===an0.length&&an0.length>=2){
        const m=cavaMdtDaIntersecao(L),ni=fs0.find(f=>String(f?.props?.CLASSE||'')==='daylight')?.geom?.length||3;
        /* Diagnóstico em memória (não é serializado): ajuda a auditar a
           migração de projetos antigos sem modificar o arquivo de origem. */
        L._cavaMdtAutoCandidate=m?{rasterId:m.R.id,name:m.R.name,n:m.n,med:m.med,rms:m.rms,
          daylightVertices:ni,closedRings:fc0.length}:null;
        if(m&&m.n>=Math.max(3,Math.floor(ni*.6))&&m.med<=Math.max(.05,(m.R.d.cs||1)*.15))
          candidatosMdt.set(String(L.id),{rasterId:m.R.id,med:m.med,n:m.n,daylightVertices:ni});
      }
      const q=cavaSoldaIntersecaoAneis(L.features||[],1e-7);
      if(q.insercoes){repTopo.cava+=q.cruzamentos;repTopo.linhas+=q.insercoes;mudou=true;}
      /* Camadas brutas antigas continuam intactas para edição. Somente a
         camada explicitamente “cortada” recebe o recorte visível definitivo. */
      if(L._cavaCutMode==='daylight'||/cortada pela interseção/i.test(String(L.name||''))){
        const r=cavaRecortaAneisNaIntersecao(L.features||[],false);
        if(r.recortadas){L.features=cavaFeatsSemDuplicar(r.feats);repTopo.linhas+=r.partes;mudou=true;}
      }
    }catch(e){console.warn('reparo topológico da cava',L&&L.name,e);}
    try{
      const q=baciaReparaLinhasExistentes(L);
      if(q.changed){repTopo.bacia+=q.added+(q.intersecao?.ok?1:0);
        repTopo.linhas+=q.added+(q.intersecao?.nos||0);mudou=true;}
    }catch(e){console.warn('reparo topológico da bacia',L&&L.name,e);}
    if(mudou)try{drawLayer(L);}catch(e){}
  });
  /* O produto consolidado já contém as mesmas cristas/pés da camada auxiliar.
     Deixar ambas ligadas causava z-fighting e, em projetos antigos, exibia ao
     mesmo tempo a geometria corrigida e a cópia desatualizada. A auxiliar é
     preservada para consulta, apenas desligada quando existe o produto final. */
  {
    const consolidadas=(S.layers||[]).filter(L=>L.tinSurface?.kind==='bacia-rampa-v1'&&
      /linhas finais e interseções/i.test(String(L.name||'')));
    if(consolidadas.length)(S.layers||[]).filter(L=>/^Pés, cristas e bermas — bacia$/i.test(String(L.name||'')))
      .forEach(L=>{if(L.visible!==false){L.visible=false;repTopo.bacia++;try{drawLayer(L);}catch(e){}}});
  }
  /* addLayer altera S.layers; faça a compatibilidade legada numa cópia para
     não iterar novamente sobre as derivadas recém-criadas. */
  [...(S.layers||[])].forEach(L=>{
    if(cava2Persistida(L))return;
    try{
      /* Prioridade para o recorte pela superfície real: se o projeto antigo
         conserva os anéis completos + daylight, identifica o MDT pela cota da
         interseção e deriva o produto definitivo a partir dos anéis. */
      const fs=L.features||[],temInter=fs.some(f=>String(f?.props?.TIPO||'')==='Interseção cava × terreno'||
          String(f?.props?.CLASSE||'')==='daylight'),
        aneis=fs.filter(cavaEhAnelProjeto),completos=aneis.filter(f=>f.geom?.length>=4&&
          Math.hypot(f.geom[0][0]-f.geom.at(-1)[0],f.geom[0][1]-f.geom.at(-1)[1])<1e-6);
      let feito=null;
      if(!L.cavaDesign&&!L._cavaCutMode&&!L._cavaMdtCutOf&&temInter&&completos.length===aneis.length&&aneis.length>=2){
        const auto=candidatosMdt.get(String(L.id)),
          m=auto?{R:(S.rasters||[]).find(r=>String(r.id)===String(auto.rasterId)),med:auto.med,n:auto.n}:cavaMdtDaIntersecao(L);
        /* Exige cobertura suficiente e erro compatível com a resolução;
           assim uma coincidência parcial não escolhe o raster errado. Quando
           a decisão foi tomada antes da soldagem, conserva a contagem ORIGINAL
           da curva; os nós injetados depois não podem invalidar a evidência. */
        const ni=auto?.daylightVertices||fs.find(f=>String(f?.props?.CLASSE||'')==='daylight')?.geom?.length||3;
        if(m&&m.n>=Math.max(3,Math.floor(ni*.6))&&
           m.med<=Math.max(.05,(m.R.d.cs||1)*.15))feito=cavaRecalculaCamadaPeloMdt(L,m.R,{up:false});
      }
      if(feito){repTopo.cava+=feito.processados;repTopo.linhas+=feito.partes;}
      else {const q=cavaReparaCamadaLegada(L);if(q){repTopo.cava+=q.recortadas;repTopo.linhas+=q.partes;}}
      candidatosMdt.delete(String(L.id));
    }
    catch(e){console.warn('recorte da cava legada',L&&L.name,e);}
  });
  S._ultimoReparoTopologico=repTopo;
  /* Diagnóstico leve e consultável: permite confirmar, sem acessar o estado
     interno da aplicação, quantas ligações topológicas foram reparadas ao
     abrir um projeto. Não altera nem serializa o projeto. */
  try{document.documentElement.dataset.alagisTopologyRepair=JSON.stringify(repTopo);}catch(e){}
  if(repTopo.linhas)console.info('CCMGIS — reparo topológico aplicado',repTopo);
  /* A ordem de desenho vive em S.stack, com chaves 'L:id'/'R:id'. Projetos
     antigos não gravavam o id das camadas, então essas chaves ficavam órfãs:
     o stackSync as descartava e reinseria tudo com unshift, invertendo a
     ordem e fazendo as camadas parecerem trocar de grupo. Agora as chaves são
     validadas; se não casarem, o stack é remontado mantendo cada grupo junto. */
  {
    const st=Array.isArray(d.stack)? d.stack.slice() : [];
    // O stack só é confiável quando o projeto GRAVOU o id de cada camada.
    // Sem isso os ids são reatribuídos e as chaves podem casar por acaso,
    // produzindo uma ordem errada com aparência de válida.
    const temIds=(d.layers||[]).length===0 || (d.layers||[]).every(o=>o && o.id!=null);
    const validas=new Set([...S.layers.map(l=>'L:'+l.id), ...S.rasters.map(r=>'R:'+r.id),
                           ...S.groups.map(g=>'G:'+g.id), 'I:0']);
    const casam=st.filter(k=>validas.has(k)).length;
    const alvo=S.layers.length + S.rasters.length + (S.img?1:0);
    if(temIds && (!alvo || casam >= Math.max(1, Math.floor(alvo*0.6)))){
      S.stack=st;                                    // ids gravados: ordem preservada
    } else {
      // remonta agrupando: camadas do mesmo grupo ficam adjacentes, na ordem dos grupos
      const ordemG=new Map(S.groups.map((g,i)=>[g.id,i]));
      const chave=o=>[ o.groupId==null? 9999 : (ordemG.get(o.groupId)??9998) ];
      const Ls=S.layers.map((l,i)=>({k:'L:'+l.id, g:chave(l)[0], i}));
      const Rs=S.rasters.map((r,i)=>({k:'R:'+r.id, g:chave(r)[0], i}));
      const ord=(a,b)=> a.g-b.g || a.i-b.i;
      S.stack=[...Ls.sort(ord).map(o=>o.k), ...Rs.sort(ord).map(o=>o.k)];
      if(S.img) S.stack.push('I:0');
      if(alvo) console.info('CCMGIS: ordem das camadas remontada por grupo (projeto salvo por versão antiga).');
    }
  }
  S.plates=Array.isArray(d.plates)? d.plates.map(pl=>({...pl,
    legendVis:pl&&pl.legendVis&&typeof pl.legendVis==='object'?{...pl.legendVis}:{}})) : [];
  S.plateId=d.plateId ?? (S.plates[0]?S.plates[0].id:null);
  plid=Math.max(1, ...S.plates.map(p=>p.id+1));
  if(S.plates.length && typeof renderPlateTabs==='function'){
    const pl=S.plates.find(p=>p.id===S.plateId)||S.plates[0];
    // NÃO aplicar o instantâneo de visibilidade da prancha aqui: cada camada já
    // restaurou seu próprio 'visible'. A prancha só reaplica sua visibilidade
    // quando o usuário CLICA nela (para imprimir aquele recorte). Sem isto, abrir
    // o projeto sempre voltava as camadas ao estado congelado da prancha.
    S.plateId=pl.id; plateApply(pl, true, true); renderPlateTabs();
  }
  /* sólidos gravados (e os do projeto anterior saem, mesmo sem a chave) */
  try{ if(typeof solDoArquivo==='function')solDoArquivo(d.solidos); }catch(e){ console.warn('sólidos do projeto',e); }
  zApply();
  { const e=document.getElementById('loGroupNumbers');if(e)e.checked=d.layout?.groupNumbers===true; }
  layoutPresentationDefaults(d.layout);
  layoutCoordFontRestore(d.layout);
  if(d.layout){
    const sv=(id,v)=>{const e=document.getElementById(id);if(e&&v!==undefined&&v!=='')e.value=v;};
    sv('loTitle',d.layout.title); sv('loSub',d.layout.sub); sv('loScale',d.layout.scale);
    sv('loGrid',d.layout.grid); sv('loPaper',d.layout.paper);
    sv('loMar',d.layout.mar); sv('loPad',d.layout.pad); sv('loFigW',d.layout.figW);
    sv('loLegFS',d.layout.legFS); sv('loBarFS',d.layout.barFS); sv('loSym',d.layout.sym); sv('loMapSym',d.layout.mapSym);
    if(d.layout.barSc!==undefined) sv('loBarSc',d.layout.barSc);
    if(d.layout.dashDens!=null) sv('loDash',d.layout.dashDens);
    if(d.layout.dashGap!=null) sv('loDashGap',d.layout.dashGap);
    if(d.layout.legSc!==undefined) sv('loLegSc',d.layout.legSc);
    if(d.layout.legColGap!==undefined) sv('loLegColGap',d.layout.legColGap);
    if(d.layout.legPos!==undefined) sv('loLegPos',d.layout.legPos);
    if(d.layout.barPasso!==undefined) sv('loBarPasso',d.layout.barPasso);
    /* Marca direto no elemento: o helper sc() só é declarado adiante neste
       mesmo bloco e um const não pode ser usado antes da declaração. */
    if(d.layout.barAuto!==undefined){
      const e2=document.getElementById('loBarAuto'); if(e2) e2.checked=!!d.layout.barAuto;
    }
    { const ck=document.getElementById('loBarAuto'), ip=document.getElementById('loBarPasso');
      if(ck&&ip) ip.disabled=ck.checked; }
    if(d.layout.cartFS!==undefined) sv('loCartFS',d.layout.cartFS);
    if(d.layout.titFS!==undefined) sv('loTitFS',d.layout.titFS);
    sv('loTxt',d.layout.txt);
    if(d.layout.figH!==undefined){ sv('loFigH',d.layout.figH); sv('loFigHr',d.layout.figH); }
    if(d.layout.figW!==undefined) sv('loFigWr',d.layout.figW);
    const sc=(id,v)=>{const e=document.getElementById(id);if(e)e.checked=!!v;};
    if(d.layout.basemap)sc('loSat',d.layout.sat!==false); sc('loLegend',d.layout.legend);
    if(d.layout.coords!==undefined) sc('loCoords',d.layout.coords);
    if(d.layout.coordTop!==undefined) sc('loCoordTop',d.layout.coordTop);
    if(d.layout.coordBottom!==undefined) sc('loCoordBottom',d.layout.coordBottom);
    if(d.layout.coordLeft!==undefined) sc('loCoordLeft',d.layout.coordLeft);
    if(d.layout.coordRight!==undefined) sc('loCoordRight',d.layout.coordRight);
    { const master=document.getElementById('loCoords');
      ['loCoordTop','loCoordBottom','loCoordLeft','loCoordRight'].forEach(id=>{
        const e=document.getElementById(id); if(!e) return;
        e.disabled=master?!master.checked:false;
        const lab=e.closest('label'); if(lab) lab.style.opacity=e.disabled?'.45':'1';
      });
    }
    if(d.layout.cart!==undefined)   sc('loCart',d.layout.cart);
    if(d.layout.legOut!==undefined) sc('loLegOut',d.layout.legOut);
    if(d.layout.fitW!==undefined)   sc('loFitW',d.layout.fitW);
    if(d.layout.scaleAuto!==undefined) sc('loScaleAuto',d.layout.scaleAuto);
    else sc('loScaleAuto',d.layout.fitW!==false);
    if(d.layout.gridAuto!==undefined) sc('loGridAuto',d.layout.gridAuto);
    S.loFrozen=d.layout.frozen!==false;
    S._figFrozenVis=d.layout.figFrozenVis?{...d.layout.figFrozenVis}:null;
    S._figLegendVis=d.layout.figLegendVis&&typeof d.layout.figLegendVis==='object'?{...d.layout.figLegendVis}:{};
    const fr=document.getElementById('btnLoFreeze');if(fr){fr.classList.toggle('on',S.loFrozen);fr.textContent=S.loFrozen?'🔒':'🔓';}
    ['loLegFS','loBarFS','loBarSc','loSym','loLegColGap','loMapSym','loDash','loDashGap','loTxt','loFigW','loFigH'].forEach(id=>{const e=document.getElementById(id);if(e)e.dispatchEvent(new Event('input'));});
  }
  if(d.img && d.img.url && d.img.b){
    const b=d.img.b;
    // a url salva é a imagem JÁ warpada para Mercator; posiciona pelos cantos WGS84
    // guardados (d.img.llb). Sem eles (projeto antigo), cai no toWGS(UTM) — que pode
    // deslocar; nesse caso o usuário recarrega o .tif para refazer o warp certo.
    let ll = (d.img.llb && d.img.warpWM) ? d.img.llb : null;
    const crsOrto=d.img.srcCRS||S.workCRS;             // CRS de origem fixado, se houver
    if(!ll){ const sw=toWGS(crsOrto,b[0],b[1]), ne=toWGS(crsOrto,b[2],b[3]); ll=[[sw[1],sw[0]],[ne[1],ne[0]]]; }
    const previewURL=d.img.url;
    const ov=L2.imageOverlay(previewURL, ll, {opacity:0.85}).addTo(map);
    ov.bringToBack&&ov.bringToBack();
    S.img={url:d.img.url, overlay:ov, b, name:d.img.name||'ortofoto', src:d.img.src||null,
           _llbounds:(d.img.llb||null), _warpWM:!!d.img.warpWM,
           _crsFixo:d.img.srcCRS||null, _sourceCRS:crsOrto,
           projectFile:d.img.projectFile||null, projectSavedAt:d.img.projectSavedAt||null,
           originalSource:d.img.originalSource||null,
           projectNativeSource:d.img.projectNativeSource||null,
           projectSavePending:!!d.img.projectSavePending,
           groupId:d.img.groupId??null, visible:d.img.visible!==false};
    if(typeof orthoMaskRestore==='function')orthoMaskRestore(S.img,d.img.mask||null);
    if(S.img.visible===false) map.removeLayer(ov);
    /* Arquivo anterior à separação das grades: a URL é uma prévia no CRS de
       trabalho. Reprojeta de forma assíncrona somente a cópia do Mapa 2D; a
       prévia UTM fica disponível ao Layout durante esta sessão de migração. */
    if(!S.img._warpWM&&!S.img._llbounds&&S.workCRS!=='EPSG:3857'&&
       typeof orthoMigrateLegacyPreview==='function')
      orthoMigrateLegacyPreview(S.img,S.workCRS).catch(e=>console.warn('migração da ortofoto:',e));
  }
  if(d.hidro){
    S.hidro.inundRasterId=d.hidro.inundRasterId||null;S.hidro.sourceRasterId=d.hidro.sourceRasterId??null;
    S.hidro.inundDestination=typeof d.hidro.inundDestination==='string'?d.hidro.inundDestination:null;S.hidro.inundDissolve=d.hidro.inundDissolve===true;
    if(Array.isArray(d.hidro.serie)&&d.hidro.serie.length) setSerie(d.hidro.serie);
    if(d.hidro.idf) S.hidro.idf=d.hidro.idf;
  }
  (d.wms||[]).forEach(w=>{ try{ wmsCreateLayer(w,false); }catch(e){ console.warn('WMS:',e); } });
  /* Caixa de retenção já desenhada no arquivo volta a ser a caixa corrente:
     rampa, extravasor, MDT recortado e memorial nascem habilitados, sem
     depender de o usuário lembrar de selecionar a camada. */
  const openingProjectId=S.projectId;
  try{ setTimeout(()=>{
    if(S.projectId!==openingProjectId)return;
    const cx=(S.layers||[]).find(L=>L&&L.tinSurface&&L.tinSurface.kind==='bacia-rampa-v1');
    if(cx){ const activeBefore=S.activeId;S.activeId=cx.id;
      try{ baciaAdotaSelecionada(); }catch(e){}
      if(d.screen){S.activeId=activeBefore;propRefresh();}
      try{ baciaAtualizaBotaoMDT(); }catch(e){}
      try{ cmdLog('Caixa de retenção reconhecida no projeto: "'+cx.name+'"','info'); }catch(e){}
      toast('Caixa "'+cx.name+'" reconhecida — rampa e extravasor liberados');
    }
  },400); }catch(e){}
  try{
    if(window.CCMGISCava2&&typeof window.CCMGISCava2.restoreProjectState==='function')
      window.CCMGISCava2.restoreProjectState(d.cava2||null);
  }catch(e){console.warn('Restauração da área 2D',e);}
  try{
    if(window.GeoMineGeology&&typeof window.GeoMineGeology.restore==='function')
      window.GeoMineGeology.restore(d.geology||null,{borrowGeometry:true});
    else if(d.geology&&typeof d.geology==='object')S.geology=layoutClone(d.geology);
  }catch(e){console.warn('Restauração da Geologia',e);}
  refreshUI();
  if(typeof refreshProfPanel==='function')refreshProfPanel();
  window.GeoMineCivil?.restore(d.civil||null);
  if(!window.GeoMineProjectScreen?.restore(d))fitAll();
  const nR=(S.rasters||[]).length, nI=(S.img&&S.img.url)?1:0;
  toast(`Projeto carregado: ${S.layers.length} camada(s), ${S.groups.length} grupo(s), `+
        `${nR} raster(s)${nI?', 1 ortofoto':''}`+(rep&&rep.nF? ` · ${rep.nF} ponto(s) reparados`:'')+
        (repTopo.linhas?` · topologia: ${repTopo.linhas} encaixe(s) reparado(s)`:''));
  /* A prévia vem dentro do .ccmgis; assim a abertura nunca depende da pasta.
     Quando o navegador ainda tem autorização, ela é trocada em seguida pelo
     GeoTIFF nativo de ALAGIS/rasters. */
  if(d.img){S.orthoHD=true;S.orthoDispFull=true;}
  const nativeProject=S.projectId,nativeGeneration=window.GeoMineSessionAutosave?.state?.generation;
  const nativeCurrent=()=>S.projectId===nativeProject&&window.GeoMineSessionAutosave?.state?.generation===nativeGeneration;
  const nativeRestoration=window.GeoMineOriginalSources?GeoMineOriginalSources.restoreAll():
    projectRestoreNativeRasters().then(async q=>({restored:q.restored+(await projectRestoreNativeOrtho()).restored}));
  S._originalsRestoring=nativeRestoration;
  nativeRestoration.then(o=>{
    if(!nativeCurrent())return;
    window.GeoMineMissingOriginals?.request({automatic:true});
    void window.GeoMineProjectTabSession?.rememberFolder();
    if(o&&o.restored)toast(`✓ ${o.restored} imagem(ns) vinculada(s) automaticamente aos originais`);
  }).catch(e=>{console.warn('restauração dos rasters nativos:',e);if(nativeCurrent())window.GeoMineMissingOriginals?.request({automatic:true});});
  return true;
  }finally{openingScope.end();}
}
document.getElementById('btnSave').onclick=()=>saveProject(false);

/* ---- Recuperar autosave do navegador / forçar autosave agora ---- */
async function recuperarAutosave(){
  let opening;
  try{
    const key=typeof autosaveStorageKey==='function'?autosaveStorageKey(S.projectId):'autosave';
    const a=await idbGet(key);
    if(!a || !a.txt){ toast('Nenhum autosave no navegador'); return; }
    const owner=typeof autosaveOwnerUid==='function'?autosaveOwnerUid():null;
    if((a.ownerUid||null)!==(owner||null)||
       (a.projectId&&S.projectId&&a.projectId!==S.projectId)){
      toast('Este rascunho pertence a outra sessão ou projeto.');return;
    }
    const q=new Date(a.at).toLocaleString('pt-BR');
    if(!confirm(`Recuperar o autosave de "${a.name}" (${q})?\nO trabalho atual será substituído.`)) return;
    const confirmedVersion=window.GeoMineSessionAutosave?.state?.version;
    opening=window.GeoMineProjectOpenProgress?.begin({title:'Recuperando cópia do projeto…',current:()=>owner===(typeof autosaveOwnerUid==='function'?autosaveOwnerUid():null)&&confirmedVersion===window.GeoMineSessionAutosave?.state?.version});
    if(!opening)showLoad('Recuperando autosave…');
    const data=opening?await opening.parse(a.txt):JSON.parse(a.txt);
    /* Recuperar é abrir um rascunho, não confirmar um destino. Reutilizar o
       handle anterior permitiria sobrescrever outro projeto no autosave. */
    if(opening)await opening.commit(data,()=>startAutosave(a.name,null));
    else{loadProject(data);startAutosave(a.name,null);}
  }catch(e){ if(e.name!=='AbortError')toast('Falha ao recuperar: '+e.message); }
  finally{ if(opening)opening.finish();else hideLoad(); }
}
{ const br=document.getElementById('btnRestore'); if(br) br.onclick=recuperarAutosave; }
document.getElementById('autoTag').onclick=()=>{
  saveProject(false);
};
/* no boot: se existir autosave guardado, habilita o botão Recuperar (se houver) */
(async()=>{ try{ const a=await idbGet(autosaveStorageKey(S.projectId));
  if(a && a.txt){ const br=document.getElementById('btnRestore'); if(br) br.style.display=''; S._temAutosave=true; }
}catch(_){} })();
/* aviso ao fechar com trabalho não salvo */
window.addEventListener('beforeunload',e=>{
  if(hasContent() && (S.auto.dirty || S.auto.busy)){
    e.preventDefault(); e.returnValue='';
  }
});
/* Abrir projeto: um único fluxo para a faixa e para o botão legado. No
   Chrome/Edge o picker devolve o handle que “Salvar” sobrescreve depois. */
async function openProjectFile(){
  // A pending/cancelled picker must not detach the current file identity.
  // The owned opening lane cancels stale work; the generation changes only
  // when loadProject actually commits the replacement.
  if(!window.GeoMineProjectOpenProgress)try{window.GeoMineSessionAutosave?.cancelRestore?.('abertura manual');}catch(_){}
  window.GeoMineProjectOpenProgress?.cancel('abertura manual');
  // No Android/tablet o showOpenFilePicker filtra por tipo MIME e o Drive marca
  // o .json como octet-stream -> arquivo fica cinza. Nesses casos usamos o
  // <input> puro (sem filtro). Só usamos o picker no desktop real.
  const androidLike=/Android/i.test(navigator.userAgent);
  if(!window.showOpenFilePicker || !fsApiOK() || androidLike || (typeof fsHandlesOK==='function'&&!fsHandlesOK())){
    document.getElementById('projIn').click();return;
  }
  let outcome,recusado=false;
  const opening=window.GeoMineProjectOpenProgress?.begin({title:'Escolhendo arquivo do projeto…'});
  /* JANELA DE ARQUIVOS QUE NÃO APARECE: o seletor abre na última pasta usada
     (a do projeto ou a que o Chrome lembra). Se ela está no Google Drive e o
     Drive para computador não responde, o macOS não monta a janela e a
     promessa nunca termina — o app ficava preso em "Escolhendo arquivo".
     A tentativa fica marcada até o seletor responder; se ela ficou pendurada
     (cancelada no X ou página recarregada), a próxima começa em Downloads,
     pasta local que sempre responde. */
  const PEND='geomine.seletor.pendente';
  let marca=null;try{marca=JSON.parse(localStorage.getItem(PEND)||'null');}catch(_){}
  const recomeco=!!marca;
  let dica=null;
  try{
    // aceita qualquer tipo (o Drive costuma reportar octet-stream para .json)
    const oOpt={excludeAcceptAllOption:false};
    if(recomeco) oOpt.startIn='downloads';
    else if(S._lastDir) oOpt.startIn=S._lastDir;
    if(recomeco)try{cmdLog('A janela de arquivos anterior não respondeu; esta começa em Downloads.','info');}catch(_){}
    const pede=opt=>{
      try{localStorage.setItem(PEND,JSON.stringify({t:Date.now()}));}catch(_){}
      const p=window.showOpenFilePicker(opt);
      /* respondeu (escolheu ou cancelou na própria janela): tira a marca */
      Promise.resolve(p).then(()=>{try{localStorage.removeItem(PEND);}catch(_){}},
        e=>{if(!(e&&e.name==='NotAllowedError'))try{localStorage.removeItem(PEND);}catch(_){}});
      return p;
    };
    dica=setTimeout(()=>{try{opening?.phase('Escolhendo arquivo do projeto… Se a janela não apareceu, cancele no X e clique em Abrir de novo: a próxima começa em Downloads.');}catch(_){}},6000);
    let h;
    try{ const selected=pede(oOpt);[h]=await (opening?opening.wait(selected):selected); }
    catch(e2){ if(e2 && e2.name==='AbortError') throw e2;
      /* outra janela de arquivos ainda pendente no sistema: o Chrome não abre outra */
      if(e2 && e2.name==='NotAllowedError' && /active|ativ/i.test(e2.message||''))
        throw new Error('a janela de arquivos anterior ainda está aberta ou travada no sistema. Recarregue a página (F5) e clique em Abrir: a próxima tentativa começa em Downloads');
      opening?.check();oOpt.startIn=recomeco?'downloads':undefined;if(!oOpt.startIn)delete oOpt.startIn;
      const selected=pede(oOpt);[h]=await (opening?opening.wait(selected):selected); }
    clearTimeout(dica);
    opening?.check();
    lembraLocal(h);
    if(opening)opening.phase('Acessando arquivo do projeto…');else showLoad('Abrindo projeto…');
    let f;
    try{const access=h.getFile();f=await (opening?opening.wait(access):access);}
    catch(e3){if(typeof fsMarcaRecusa==='function'&&fsMarcaRecusa(e3)){recusado=true;throw Object.assign(new Error('arquivo recusado pelo navegador'),{name:'AbortError'});}throw e3;}
    if(!f.size) throw new Error('arquivo vazio (0 byte) — no Drive, marque "Disponível offline" e aguarde baixar');
    const txt=opening?await opening.read(f):await readProjectFileCompat(f),obj=opening?await opening.parse(txt):JSON.parse(txt);
    if(!obj || (obj.app!=='ALAGIS'&&obj.app!=='CCMGIS'&&obj.app!=='CCMGeoCampo')) throw new Error('não é um projeto CCMGIS');
    if(S.auto?.dirty&&!confirm('Há alterações não salvas. Abrir outro projeto e descartar essas alterações?')){outcome='cancel';return;}
    if(opening)await opening.commit(obj,()=>startAutosave(h.name,h,f));
    else{loadProject(obj);startAutosave(h.name,h,f);}
  }catch(err){ outcome=err.name==='AbortError'?'cancel':'error';if(err.name!=='AbortError') toast('Erro ao abrir projeto: '+err.message); }
  finally{ clearTimeout(dica);if(opening)opening.finish();else hideLoad(outcome);
    if(recusado&&typeof fsSeletorSimples==='function')fsSeletorSimples(()=>document.getElementById('projIn').click(),'Abrir projeto pelo seletor simples'); }
}
document.querySelector('label[for="projIn"]').addEventListener('click',e=>{
  e.preventDefault();openProjectFile();
});
// Leitura compatível com Android/Google Drive. Alguns provedores de documentos
// expõem o arquivo pelo seletor, mas falham especificamente em File.text() para
// arquivos grandes. FileReader costuma acessar corretamente o content:// URI.
async function readProjectFileCompat(f,options={}){
  const check=()=>{if(options.signal?.aborted)throw Object.assign(new Error('Abertura cancelada.'),{name:'AbortError'});};
  check();
  if(globalThis.GeoMineProjectReader){
    let last='';
    try{return await GeoMineProjectReader.read(f,{signal:options.signal,onProgress:p=>{
      if(options.onProgress){options.onProgress(p);return;}
      const message=p.phase==='retry'?`Aguardando arquivo do Drive — tentativa ${p.attempt}…`:
        `Abrindo projeto — ${Math.floor(100*p.loaded/p.total)}%`;
      if(message!==last){last=message;showLoad(message);}
    }});}catch(e){
      if(e.diagnostics)try{cmdLog('Leitura do projeto: '+e.diagnostics.map(d=>d.method+': '+d.name).join(' | '),'warn');}catch(_){}
      throw e;
    }
  }
  const erros=[];

  // 1) FileReader: caminho mais compatível com Android, Samsung Files e Drive.
  if(typeof FileReader!=='undefined'){
    try{
      const txt=await new Promise((resolve,reject)=>{
        const r=new FileReader();
        const stop=()=>r.abort(),clean=()=>options.signal?.removeEventListener('abort',stop);
        r.onerror=()=>{clean();reject(r.error||new Error('FileReader falhou'));};
        r.onabort=()=>{clean();reject(Object.assign(new Error('leitura cancelada'),{name:'AbortError'}));};
        r.onload=()=>{clean();resolve(typeof r.result==='string'?r.result:'');};
        r.onprogress=e=>options.onProgress?.({loaded:e.loaded,total:f.size,phase:'read'});
        options.signal?.addEventListener('abort',stop,{once:true});
        r.readAsText(f,'UTF-8');
      });
      check();
      if(txt) return txt;
      erros.push('FileReader retornou vazio');
    }catch(err){ check();if(err?.name==='AbortError')throw err;erros.push('FileReader: '+(err?.message||err)); }
  }

  // 2) Stream em blocos: evita depender da implementação de File.text().
  if(f.stream && typeof TextDecoder!=='undefined'){
    try{
      const reader=f.stream().getReader();
      const decoder=new TextDecoder('utf-8');
      const partes=[];
      let total=0;
      while(true){
        check();
        const {done,value}=await reader.read();
        if(options.signal?.aborted){try{await reader.cancel();}catch(_){}check();}
        if(done) break;
        if(value?.length){ partes.push(decoder.decode(value,{stream:true})); total+=value.length;options.onProgress?.({loaded:total,total:f.size,phase:'read'}); }
      }
      partes.push(decoder.decode());
      const txt=partes.join('');
      if(txt) return txt;
      erros.push('stream retornou vazio');
    }catch(err){ check();erros.push('stream: '+(err?.message||err)); }
  }

  // 3) APIs modernas como alternativas finais.
  if(f.text){
    try{check();const txt=await f.text();check();if(txt) return txt; }
    catch(err){check();erros.push('text: '+(err?.message||err)); }
  }
  if(f.arrayBuffer && typeof TextDecoder!=='undefined'){
    try{
      const buf=await f.arrayBuffer();
      check();
      const txt=new TextDecoder('utf-8').decode(buf);
      if(txt) return txt;
    }catch(err){check();erros.push('arrayBuffer: '+(err?.message||err)); }
  }
  throw new Error('o Android não entregou os bytes do arquivo ao navegador. '+
    'Abra pelo app Meus Arquivos/Downloads ou marque Disponível offline no Drive. '+
    (erros.length?'Detalhes: '+erros.join(' | '):''));
}

document.getElementById('projIn').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f) return;
  let outcome;
  if(!window.GeoMineProjectOpenProgress)try{window.GeoMineSessionAutosave?.cancelRestore?.('abertura pelo seletor');}catch(_){}
  const opening=window.GeoMineProjectOpenProgress?.begin();
  try{
    if(!f.size){ throw new Error('arquivo vazio (0 byte). Do Google Drive: toque em ⋮ no arquivo e marque '+
      '"Disponível offline", espere o download terminar e tente de novo.'); }
    if(!opening)showLoad(`Abrindo projeto (${(f.size/1048576).toFixed(0)} MB)…`);
    const txt=opening?await opening.read(f):await readProjectFileCompat(f);
    if(!txt || txt.length<2)
      throw new Error('o arquivo foi aberto, mas o conteúdo está vazio ou incompleto.');
    let obj;
    try{ obj=opening?await opening.parse(txt):JSON.parse(txt); }
    catch(errJson){
      if(errJson.name==='AbortError')throw errJson;
      throw new Error('conteúdo não é um projeto válido ou está incompleto (JSON: '+
        (errJson?.message||'erro desconhecido')+').');
    }
    if(!obj || (obj.app!=='ALAGIS'&&obj.app!=='CCMGIS'&&obj.app!=='CCMGeoCampo')) throw new Error('não é um projeto CCMGIS/GeoCampo');
    if(S.auto?.dirty&&!confirm('Há alterações não salvas. Abrir outro projeto e descartar essas alterações?')){outcome='cancel';return;}
    if(opening)await opening.commit(obj,()=>startAutosave(f.name,null));
    else{loadProject(obj);startAutosave(f.name,null);}
    toast('Projeto aberto ✔');
    window.GeoMineProjectFile?.sourceOpened(f.name);
  }catch(err){ outcome=err.name==='AbortError'?'cancel':'error';if(err.name!=='AbortError')toast('Não foi possível abrir: '+err.message); }
  finally{ if(opening)opening.finish();else hideLoad(outcome); e.target.value=''; }
});

/* ---------- Boot ---------- */
initMap();
try{ inundBackstop(); }catch(e){}
try{ drenBackstop(); }catch(e){}
initBaseToggle();
bindRasModal();
/* ligações da caixa de comandos + captura de avisos do console */
(function bindCmd(){
  const $=id=>document.getElementById(id);
  const b=$('btnCmd'); if(b) b.onclick=()=>cmdToggle();
  const bf=$('btnCmdFlut'); if(bf) bf.onclick=()=>cmdToggle();
  const bm=$('cmdModo'); if(bm) bm.onclick=()=>cmdSetModo(CMD.modo==='flut'?'fixo':'flut');
  const ba=$('cmdAlt'); if(ba) ba.onclick=()=>cmdSetAlt(CMD.alt==='min'?'auto':'min');
  cmdArrasta();
  // arraste da alça superior: redimensiona a altura no modo FIXO
  (function(){
    const grip=$('cmdGrip'), box=$('cmdBox'); if(!grip||!box) return;
    let arr=null;
    grip.addEventListener('pointerdown',e=>{
      if(CMD.modo!=='fixo') return;                // no flutuante o resize nativo (canto) já funciona
      arr={y:e.clientY, h:box.getBoundingClientRect().height};
      grip.setPointerCapture(e.pointerId); e.preventDefault();
    });
    grip.addEventListener('pointermove',e=>{
      if(!arr) return;
      const dy=arr.y-e.clientY;                     // arrastar p/ CIMA aumenta
      const maxH=Math.max(120, window.innerHeight-90);
      // Abaixo de 110 px a altura volta a ser automática (acompanha o conteúdo).
      const alvo=Math.min(maxH, Math.round(arr.h+dy));
      CMD.hFix=alvo<110?0:alvo;
      cmdAplicaModo();
    });
    const solta=e=>{ if(arr){ arr=null; try{ grip.releasePointerCapture(e.pointerId); }catch(_){}
      const el=$('cmdLog'); if(el) el.scrollTop=el.scrollHeight; } };
    grip.addEventListener('pointerup',solta);
    grip.addEventListener('pointercancel',solta);
    // realce visual da alça ao passar o mouse
    grip.addEventListener('pointerenter',()=>{ if(CMD.modo==='fixo') grip.style.background='linear-gradient(180deg,#e8c07d55,transparent)'; });
    grip.addEventListener('pointerleave',()=>{ if(!arr) grip.style.background='transparent'; });
  })();
  window.addEventListener('resize', ()=>{ try{ cmdAncora(); }catch(e){} });
  // painéis abrem e fecham conforme a aba: reancora um pouco depois da troca
  document.addEventListener('click', ()=>{ setTimeout(()=>{ try{ cmdAncora(); }catch(e){} }, 60); }, true);
  if(window.ResizeObserver){
    const m=document.getElementById('map');
    let quadroAncora=0;
    if(m) new ResizeObserver(()=>{
      if(quadroAncora)return;
      quadroAncora=requestAnimationFrame(()=>{quadroAncora=0;try{ cmdAncora(); }catch(e){} });
    }).observe(m);
  }
  const c=$('cmdClose'); if(c) c.onclick=()=>cmdToggle(false);
  const cl=$('cmdClear'); if(cl) cl.onclick=()=>{ CMD.linhas.length=0; cmdPinta();
    const q=$('cmdCnt'); if(q) q.textContent='0 linha(s)'; };
  const cp=$('cmdCopy'); if(cp) cp.onclick=async()=>{
    const txt=CMD.linhas.map(l=>l.hh+(l.dt>=0.05?' +'+l.dt.toFixed(2)+'s':'')+' '+l.msg).join('\n');
    try{ await navigator.clipboard.writeText(txt); toast('Histórico copiado'); }
    catch(e){ download(new Blob([txt],{type:'text/plain'}),'alagis_comandos.txt'); }
  };
  const inp=$('cmdIn');
  if(inp) inp.addEventListener('keydown',e=>{
    if(e.key==='Enter'){ cmdExecuta(inp.value); inp.value=''; e.preventDefault(); }
  });
  const a3t=$('a3CmdToggle'), a3i=$('a3CmdIn');
  if(a3t) a3t.onclick=()=>cmdToggle();
  if(a3i) a3i.addEventListener('keydown',e=>{
    if(e.key==='Enter'){
      const v=a3i.value.trim();
      if(v){ cmdExecuta(v); a3i.dataset.ultimo=v; a3i.value=''; }
      e.preventDefault();
    }else if(e.key==='ArrowUp' && !a3i.value){
      a3i.value=a3i.dataset.ultimo||''; e.preventDefault();
    }
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='F2'){ e.preventDefault(); cmdToggle(); }
  });
  // avisos e erros do console também entram no histórico
  ['warn','error'].forEach(k=>{
    const orig=console[k].bind(console);
    console[k]=(...a)=>{ try{ cmdLog(a.map(v=>(v&&v.message)||String(v)).join(' '), k==='error'?'erro':'avisa'); }catch(_){}
      orig(...a); };
  });
  window.addEventListener('error', ev=>{
    /* Recursos cartográficos externos podem emitir apenas “Script error.”
       por CORS, sem arquivo, linha, stack ou erro utilizável. Isso não é uma
       falha do CCMGIS e antes inundava a barra a cada movimento do mouse. */
    if(!ev || (!ev.error && (!ev.message || ev.message==='Script error.'))) return;
    try{ cmdLog('erro: '+((ev.error&&ev.error.message)||ev.message||''),'erro'); }catch(_){}
  });
  cmdLog('CCMGIS pronto · F2 abre e fecha · ⌃ aumenta · ⧉ solta a janela · digite ajuda','ok');
  // No CCMGIS 3.0 a linha fica sempre visível na barra inferior; F2/⌨ abre
  // somente o histórico. Na interface antiga preserva-se o comportamento.
  cmdToggle(!document.body.classList.contains('alagis3'));
})();
bindProfPanel(); bindGeoPanel(); bindEstPanel(); bindCotPanel(); bind3DPanel(); bindCubPanel(); bindBishopPanel(); bindGtPanel(); bindOverlayPanel(); bindCadPanel(); bindVecOpsPanel(); bindSurfOpsPanel();
(function(){
  /* Painel lateral: o mesmo tratamento do editor de classes — a lista de nomes
     dá lugar aos traços desenhados, e o <select> fica escondido guardando o
     valor para tudo que já o lia continuar funcionando. */
  const sd0=document.getElementById('stDash');
  if(sd0 && !document.getElementById('stDashGal')){
    sd0.style.display='none';
    const box=document.createElement('div');
    box.id='stDashGal';
    sd0.insertAdjacentElement('afterend', box);
    const cor=()=>(document.getElementById('stStroke')||{}).value||'#111111';
    const esp=()=>+((document.getElementById('stWeight')||{}).value)||2;
    box.innerHTML=dsGaleriaHTML(sd0.value||'', cor(), esp());
    const gal=box.querySelector('.dsgal');
    dsBindGaleria(gal, sd0, cor, esp);
    let tS=null;
    ['stStroke','stColor','stWeight'].forEach(id=>{ const e=document.getElementById(id);
      if(e) e.addEventListener('input',()=>{ clearTimeout(tS); tS=setTimeout(()=>{
        gal._repinta(); gal._marca(); },150); }); });
  }
})();
(function(){ const sd=document.getElementById('stDash');
  if(sd) sd.innerHTML=DASH_OPTS.map(([v,l])=>`<option value="${v}">${l}</option>`).join(''); })();
// seções do Geoproc recolhíveis (a 1ª aberta, demais fechadas)
/* Seções recolhíveis em TODOS os painéis laterais (Hidro, Geoproc, Perfis, 3D).
   O estado (aberto/fechado) fica no localStorage, por título da seção.       */
(function(){
  let st={};
  try{ st=JSON.parse(localStorage.getItem('ccm_hsec')||'{}'); }catch(e){}
  const save=()=>{ try{ localStorage.setItem('ccm_hsec',JSON.stringify(st)); }catch(e){} };
  document.querySelectorAll('#sideHidro .hsec, #sideGeo .hsec, #sidePerfis .hsec, #sideV3d .hsec')
    .forEach((sec)=>{
      const h=sec.querySelector('h2'); if(!h) return;
      const key=(sec.parentElement.id||'')+':'+h.textContent.trim().slice(0,40);
      sec.classList.add('collapsible');
      const painelGeo=sec.closest('#sideGeo');
      const padrao=painelGeo? (sec!==sec.parentElement.querySelector('.hsec')) : false; // Geoproc: só a 1ª aberta
      const fechado=(key in st)? st[key] : padrao;
      if(fechado) sec.classList.add('collapsed');
      h.addEventListener('click',()=>{
        sec.classList.toggle('collapsed');
        st[key]=sec.classList.contains('collapsed'); save();
      });
    });
})();
document.getElementById('stHatch').innerHTML=hatchOptionsHTML('solid');
fillCRSSelect(document.getElementById('workCRS'),S.workCRS);
fillCRSSelect(document.getElementById('layerCRS'),S.workCRS);
refreshUI();

/* Pinça (2 dedos) para o zoom do modo LAYOUT — a roda não existe no tablet.
   1 dedo continua rolando/agarrando como antes.                            */
(function(){
  const wrap=document.getElementById('sheetWrap'); if(!wrap) return;
  const pts=new Map(); let d0=0, z0=1;
  const dist=()=>{ const a=[...pts.values()]; return Math.hypot(a[0].x-a[1].x, a[0].y-a[1].y); };
  const mid =()=>{ const a=[...pts.values()]; return {clientX:(a[0].x+a[1].x)/2, clientY:(a[0].y+a[1].y)/2}; };
  wrap.addEventListener('pointerdown',e=>{ if(e.pointerType!=='touch') return;
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pts.size===2){ d0=dist(); z0=S.loZoom||1; } });
  wrap.addEventListener('pointermove',e=>{ if(!pts.has(e.pointerId)) return;
    pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pts.size===2 && d0>0){ e.preventDefault();
      setLoZoom(z0*dist()/d0, mid()); } },{passive:false});
  const up=e=>{ pts.delete(e.pointerId); if(pts.size<2) d0=0; };
  wrap.addEventListener('pointerup',up); wrap.addEventListener('pointercancel',up);
})();

/* Toque longo (600 ms) numa feição = abrir propriedades da camada — o
   duplo toque continua valendo; isto é só um atalho natural de tablet.     */

toast('CCMGIS pronto · abra um shapefile (.zip) para começar');
