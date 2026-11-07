import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const template=read('src/index.template.html');
const rasterSource=read('src/core/parts/20-raster-dem.js');
const loadingSource=read('src/core/parts/03-file-loading-qgis.js');
const layoutSource=read('src/core/parts/17-layout-printing.js');
const hydrologySource=read('src/core/parts/19-hydrology-and-flooding.js');
const ribbonSource=read('src/core/parts/10-ribbon-ui-preferences.js');
const pickerSources=[
  ['raster/3D',rasterSource],
  ['imagem/ortofoto',layoutSource],
  ['hidrologia/CN',hydrologySource],
  ['ribbon',ribbonSource]
];

function blockEnd(source,open,label){
  let depth=0,state='code',escaped=false;
  for(let i=open;i<source.length;i++){
    const ch=source[i],next=source[i+1];
    if(state==='line'){
      if(ch==='\n')state='code';
      continue;
    }
    if(state==='block'){
      if(ch==='*'&&next==='/'){state='code';i++;}
      continue;
    }
    if(state!=='code'){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch===state)state='code';
      continue;
    }
    if(ch==='/'&&next==='/'){state='line';i++;continue;}
    if(ch==='/'&&next==='*'){state='block';i++;continue;}
    if(ch==='\''||ch==='"'||ch==='`'){state=ch;continue;}
    if(ch==='{')depth++;
    else if(ch==='}'&&--depth===0)return i;
  }
  assert.fail(`${label}: bloco JavaScript não foi fechado`);
}

function functionDeclaration(source,name){
  const safe=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=new RegExp(`\\b(?:async\\s+)?function\\s+${safe}\\s*\\(`).exec(source);
  assert.ok(match,`função ${name} ausente`);
  const open=source.indexOf('{',match.index+match[0].length);
  assert.ok(open>=0,`função ${name}: corpo ausente`);
  return source.slice(match.index,blockEnd(source,open,`função ${name}`)+1);
}

function inputTag(id){
  const match=new RegExp(`<input\\b[^>]*\\bid=["']${id}["'][^>]*>`,'i').exec(template);
  assert.ok(match,`input #${id} ausente`);
  return match[0];
}

function escapeRegExp(value){
  return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

function aliasesForPicker(source,id){
  const safe=escapeRegExp(id), aliases=new Set();
  const assignment=new RegExp(
    `(?:^|[,;{])\\s*(?:(?:const|let|var)\\s+)?([A-Za-z_$][\\w$]*)\\s*=\\s*`+
    `(?:document\\.getElementById|g)\\(\\s*["']${safe}["']\\s*\\)`,'gm');
  for(const match of source.matchAll(assignment))aliases.add(match[1]);
  return [...aliases];
}

function helperReceivesPicker(source,id){
  const safe=escapeRegExp(id);
  if(new RegExp(`abrirSeletorGeoTIFF\\s*\\(\\s*document\\.getElementById\\(\\s*["']${safe}["']`)
    .test(source))return true;
  return aliasesForPicker(source,id).some(alias=>
    new RegExp(`abrirSeletorGeoTIFF\\s*\\(\\s*${escapeRegExp(alias)}\\s*\\)`).test(source));
}

function directPickerClicks(source,id){
  const safe=escapeRegExp(id), found=[];
  if(new RegExp(`document\\.getElementById\\(\\s*["']${safe}["']\\s*\\)\\s*\\??\\.click\\s*\\(`)
    .test(source))found.push(`getElementById('${id}').click()`);
  for(const alias of aliasesForPicker(source,id)){
    if(new RegExp(`\\b${escapeRegExp(alias)}\\s*\\??\\.click\\s*\\(`).test(source))
      found.push(`${alias}.click()`);
  }
  return found;
}

const failures=[];
async function check(label,fn){
  try{await fn();}
  catch(error){failures.push(`${label}: ${error&&error.message||error}`);}
}

/* Em Android, declarar GeoTIFF como image/tiff pode encaminhar o clique ao
   provedor de fotos. O carregamento inicial da ortofoto deve compartilhar o
   #fileIn genérico com o MDT. Inputs exclusivos de GeoTIFF precisam passar
   pelo helper que remove accept/capture no móvel. O #imgIn é mantido apenas
   como compatibilidade do leitor antigo e jamais pode voltar a ser gatilho. */
await check('seletor canônico MDT/ortofoto é genérico',()=>{
  const tag=inputTag('fileIn');
  assert.doesNotMatch(tag,/\baccept\s*=/i,
    '#fileIn não pode filtrar por MIME/extensão: deve oferecer Arquivos/Drive');
  assert.doesNotMatch(tag,/\bcapture(?:\s*=|\s|>)/i,
    '#fileIn não pode oferecer câmera');
  assert.match(template,
    /<label\b[^>]*\bfor=["']fileIn["'][^>]*>[^<]*(?:imagem|ortofoto)/i,
    'o botão principal da ortofoto deve apontar para o mesmo #fileIn do MDT');
});

await check('atalhos de ortofoto reutilizam #fileIn',()=>{
  const p=rasterSource.indexOf("getElementById('btnRasTexImg')");
  assert.ok(p>=0,'gatilho de ortofoto da visualização 3D ausente');
  const trecho3D=rasterSource.slice(p,p+900);
  assert.match(trecho3D,/getElementById\(["']fileIn["']\)/,
    'o botão de ortofoto 3D deve abrir o seletor genérico do MDT');
  assert.doesNotMatch(trecho3D,/getElementById\(["']imgIn["']\)|showOpenFilePicker|image\/(?:\*|tiff?)/i,
    'o botão de ortofoto 3D contorna o caminho genérico do MDT');
  assert.match(ribbonSource,/nome:["'](?:Fotos|Ortomosaico)["'][\s\S]{0,100}?actClick\(["']fileIn["']\)/,
    'os atalhos Fotos/Ortomosaico da ribbon devem reutilizar #fileIn');
});

await check('input legado #imgIn não é gatilho',()=>{
  const tag=inputTag('imgIn');
  assert.doesNotMatch(tag,/\baccept=["'][^"']*image\//i,
    '#imgIn não pode voltar a anunciar image/*');
  assert.doesNotMatch(tag,/\bcapture(?:\s*=|\s|>)/i,
    '#imgIn não pode oferecer câmera');
  assert.match(tag,/\bstyle=["'][^"']*display\s*:\s*none/i,
    '#imgIn legado deve permanecer oculto');
  assert.doesNotMatch(template,/<label\b[^>]*\bfor=["']imgIn["'][^>]*>/i,
    '#imgIn não pode ser aberto por label');
  const direct=pickerSources.flatMap(([label,source])=>
    directPickerClicks(source,'imgIn').map(call=>`${label}: ${call}`));
  assert.deepEqual(direct,[],
    `#imgIn ainda tem clique direto inseguro (${direct.join(', ')})`);
});

const dedicatedOrthoPickerIds=['hCnOrtoFile','imgReligarFile','ortoReligarFile'];
for(const id of dedicatedOrthoPickerIds){
  await check(`arquivo genérico #${id}`,()=>{
    const tag=inputTag(id);
    assert.match(tag,/\baccept=["'][^"']*\.tif[^"']*\.tiff[^"']*["']/i,
      `#${id} deve continuar filtrando .tif e .tiff`);
    assert.match(tag,/\baccept=["'][^"']*application\/octet-stream[^"']*["']/i,
      `#${id} deve usar a opção de arquivo genérico do MDT`);
  });
  await check(`sem câmera/Fotos #${id}`,()=>{
    const tag=inputTag(id);
    assert.doesNotMatch(tag,/\baccept=["'][^"']*image\//i,
      `#${id} não pode declarar MIME de imagem: no tablet isso abre Fotos`);
    assert.doesNotMatch(tag,/\bcapture(?:\s*=|\s|>)/i,
      `#${id} não pode usar capture: deve abrir o gerenciador de arquivos`);
  });
  await check(`input protegido #${id}`,()=>{
    const tag=inputTag(id);
    assert.match(tag,/\bstyle=["'][^"']*display\s*:\s*none/i,
      `#${id} deve ficar oculto para não permitir abertura fora do helper`);
    assert.doesNotMatch(template,
      new RegExp(`<label\\b[^>]*\\bfor=["']${escapeRegExp(id)}["'][^>]*>`,'i'),
      `#${id} não pode ser aberto por <label for>: use botão + abrirSeletorGeoTIFF`);
  });
  await check(`caminho compartilhado #${id}`,()=>{
    assert.ok(pickerSources.some(([,source])=>helperReceivesPicker(source,id)),
      `#${id} precisa ser encaminhado por abrirSeletorGeoTIFF`);
  });
  await check(`sem clique direto #${id}`,()=>{
    const direct=pickerSources.flatMap(([label,source])=>
      directPickerClicks(source,id).map(call=>`${label}: ${call}`));
    assert.deepEqual(direct,[],
      `#${id} tem clique direto inseguro (${direct.join(', ')}); o helper deve ser o único a clicar`);
  });
}

await check('helper móvel abre Arquivos/Drive',()=>{
  const pickerContext={navigator:{userAgentData:{mobile:true},userAgent:'Android'},globalThis:null};
  pickerContext.globalThis=pickerContext;
  vm.createContext(pickerContext);
  vm.runInContext(`${functionDeclaration(loadingSource,'fsApiOK')}\n`+
    `${functionDeclaration(loadingSource,'abrirSeletorGeoTIFF')}\n`+
    'globalThis.__open=abrirSeletorGeoTIFF;',pickerContext,
  {filename:'03-file-loading-qgis.ortho-picker.js'});
  const input={value:'anterior.tif',attrs:{accept:'.tif,.tiff,image/tiff',capture:'camera'},clicks:0,
    setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},click(){this.clicks++;}};
  assert.equal(pickerContext.__open(input),true,'o helper deve abrir um input válido');
  assert.equal(input.value,'','o mesmo arquivo precisa poder ser selecionado novamente');
  assert.equal(input.attrs.accept,undefined,'no tablet o accept deve ser removido antes do clique');
  assert.equal(input.attrs.capture,undefined,'no tablet capture deve ser removido antes do clique');
  assert.equal(input.clicks,1,'o seletor deve abrir exatamente uma vez');
  pickerContext.navigator={userAgentData:{mobile:false},userAgent:'Mozilla/5.0 (Macintosh)',maxTouchPoints:5};
  const ipad={value:'',attrs:{accept:'.tif,.tiff,image/tiff'},clicks:0,
    setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},click(){this.clicks++;}};
  pickerContext.__open(ipad);
  assert.equal(ipad.attrs.accept,undefined,'iPadOS em modo desktop também deve abrir o seletor genérico');
  assert.equal(ipad.clicks,1,'o seletor do iPad deve abrir exatamente uma vez');
  assert.doesNotMatch(functionDeclaration(loadingSource,'abrirSeletorGeoTIFF'),
    /showOpenFilePicker|image\/(?:\*|tiff?)/i,
    'o caminho móvel compartilhado com o MDT não pode usar picker/MIME de imagem');
});

/* Um projeto reaberto conserva somente a prévia. Nesse estado, marcar a opção
   de tiles deve servir também como atalho para localizar o GeoTIFF, em vez de
   deixar o controle permanentemente inerte. */
await check('checkbox sem fonte pede o GeoTIFF original',()=>{
  const label={title:''}, elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{
      id,checked:false,disabled:true,value:'',innerHTML:'',textContent:'',
      closest:selector=>selector==='label'?label:null
    });
    return elements.get(id);
  };
  const checkboxContext={
    S:{img:{url:'preview-salvo',b:[500000,7400000,500040,7400020],_w:800,_h:400},orthoHD:false},
    document:{getElementById:element,activeElement:null},
    Image:function(){},syncOrthoTiles:()=>{},toast:()=>{},
    abrirSeletorGeoTIFF:input=>{ checkboxContext.__picker=input; return true; },
    globalThis:null
  };
  checkboxContext.globalThis=checkboxContext;
  vm.createContext(checkboxContext);
  vm.runInContext(`${functionDeclaration(layoutSource,'imgResInfoSync')}\n`+
    `${functionDeclaration(layoutSource,'bindImgResProps')}\n`+
    'imgResInfoSync();bindImgResProps();',checkboxContext,
  {filename:'17-layout-printing.ortho-checkbox.js'});
  const cb=element('imgHD'), picker=element('imgReligarFile');
  assert.equal(cb.disabled,false,
    'sem a fonte original, o checkbox precisa continuar clicável para permitir localizá-la');
  cb.checked=true;
  cb.onchange({target:cb});
  assert.equal(checkboxContext.__picker,picker,
    'ativar os tiles sem fonte deve abrir o seletor do GeoTIFF original');
});

/* A importação inicial deve chegar ao mesmo estado da religação: original
   indexado, preferência HD ligada e a grade sincronizada já nesta operação. */
await check('importação inicial liga e sincroniza os tiles',async()=>{
  const importControls=new Map();
  const importControl=id=>{
    if(!importControls.has(id))importControls.set(id,{id,checked:false,disabled:false});
    return importControls.get(id);
  };
  const importBands=[
    Uint8Array.from([10,20,30,40,50,60,70,80]),
    Uint8Array.from([11,21,31,41,51,61,71,81]),
    Uint8Array.from([12,22,32,42,52,62,72,82])
  ];
  const importImage={
    getBoundingBox:()=>[500000,7400000,500040,7400020],
    getSamplesPerPixel:()=>3,getWidth:()=>4,getHeight:()=>2,getGDALNoData:()=>null,
    getTileWidth:()=>4,getTileHeight:()=>2,fileDirectory:{},
    readRasters:async()=>importBands
  };
  const importTiff={getImage:async()=>importImage,getImageCount:async()=>1};
  let syncCalls=0,syncSawReady=false;
  const importContext={
    console,Blob,ArrayBuffer,Uint8Array,Uint16Array,Int16Array,Uint8ClampedArray,
    Int32Array,Map,Object,Math,Number,isFinite,setTimeout,clearTimeout,
    TIFF_CHUNK_SAMPLES:1024,
    S:{img:null,workCRS:'EPSG:31982',orthoHD:false},
    navigator:{userAgent:'Mozilla/5.0 (Macintosh)',deviceMemory:8},
    ensureGeoTIFF:async()=>{},GeoTIFF:{fromArrayBuffer:async()=>importTiff,fromBlob:async()=>importTiff},
    document:{
      createElement:tag=>{
        assert.equal(tag,'canvas');
        return {width:0,height:0,getContext:()=>({
          createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)})
        })};
      },
      getElementById:importControl
    },
    toWGS:(_crs,x,y)=>[x,y],wgsBoundsOK:()=>true,CRS_LABELS:{},
    registraOrtoParaDrape:()=>{},map:{removeLayer:()=>{}},showLoad:()=>{},hideLoad:()=>{},
    applyImgNoData:()=>{
      importContext.S.img.url='preview-importado';
      importContext.S.img.overlay={getBounds:()=>[[0,0],[1,1]]};
      return {pct:0};
    },
    safeFit:()=>{},refreshUI:()=>{},toast:()=>{},
    syncOrthoTiles:()=>{
      syncCalls++;
      syncSawReady=!!(importContext.S.img&&importContext.S.img._img0&&importContext.S.orthoHD);
    },
    globalThis:null
  };
  importContext.globalThis=importContext;
  importContext.window=importContext;
  vm.createContext(importContext);
  vm.runInContext(['rasterImportCheck','rasterImportError','rasterImportWait','rasterImportOpen','rasterImportRows']
    .map(name=>functionDeclaration(hydrologySource,name)).join('\n')+'\n'+`${functionDeclaration(rasterSource,'addRGBFromTIFF')}\n`+
    'globalThis.__import=addRGBFromTIFF;',importContext,
  {filename:'20-raster-dem.ortho-import.js'});
  await importContext.__import(new ArrayBuffer(16),'ortofoto_nova.tif',16);
  assert.equal(importContext.S.orthoHD,true,
    'a alta resolução deve ser ativada ao importar um GeoTIFF de ortofoto');
  assert.ok(syncCalls>=1,'a grade de tiles não foi sincronizada após a importação');
  assert.equal(syncSawReady,true,
    'a sincronização aconteceu antes de a fonte e a preferência HD estarem prontas');
});

/* Executa a função real de revinculação com um TIFF mínimo. A fonte anterior
   já possui preview e uma janela HD em cache; depois de indicar outro arquivo,
   a imagem e suas dimensões devem mudar e nenhum tile antigo pode sobreviver. */
const oldPreview={data:new Uint8ClampedArray([9,9,9,255])};
const oldCache=new Map([['0:0:4:2:4',{url:'tile-antigo'}]]);
const imageState={
  url:'preview-antigo',b:[500000,7400000,500040,7400020],visible:true,
  _id:oldPreview,_w:1,_h:1,_cache:oldCache
};
const controls=new Map();
const control=id=>{
  if(!controls.has(id))controls.set(id,{id,checked:false,disabled:true,value:''});
  return controls.get(id);
};
let applyCalls=0,resetCalls=0,tileSyncCalls=0,tileSyncSawReady=false,infoCalls=0,panelCalls=0;
const loads=[];

const bands=[
  Uint8Array.from([0,20,30,40,50,60,70,0]),
  Uint8Array.from([11,21,31,41,51,61,71,0]),
  Uint8Array.from([12,22,32,42,52,62,72,0])
];
const img0={
  getBoundingBox:()=>[500000,7400000,500040,7400020],
  getSamplesPerPixel:()=>3,
  getWidth:()=>4,
  getHeight:()=>2,
  getGDALNoData:()=>0,
  getTileWidth:()=>4,
  getTileHeight:()=>2,
  fileDirectory:{},
  readRasters:async options=>{
    assert.equal(options.width,4,'a prévia religada deve usar a largura disponível');
    assert.equal(options.height,2,'a prévia religada deve usar a altura disponível');
    return bands;
  }
};
const tiff={getImage:async()=>img0,getImageCount:async()=>1};
const selectedFile={name:'ortofoto_atualizada.tif',size:2048};
const context={
  console,Blob,ArrayBuffer,Uint8Array,Uint16Array,Int16Array,Uint8ClampedArray,
  Map,Object,Math,Number,isFinite,setTimeout,clearTimeout,
  S:{img:imageState,workCRS:'EPSG:31982',orthoHD:false},
  EH_MOVEL:true,navigator:{deviceMemory:4},
  ensureGeoTIFF:async()=>{},
  bufferFonte:async()=>new ArrayBuffer(8),
  rasterImportOpen:async()=>tiff,
  GeoTIFF:{fromArrayBuffer:async()=>tiff,fromBlob:async()=>tiff},
  document:{
    createElement:tag=>{
      assert.equal(tag,'canvas');
      return {width:0,height:0,getContext:()=>({
        createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)})
      })};
    },
    getElementById:control
  },
  showLoad:message=>loads.push(message),hideLoad:()=>{},toast:()=>{},
  applyImgNoData:()=>{
    applyCalls++;
    imageState.url='preview-atualizado';
    imageState.overlay={generation:2};
    return {pct:12.5};
  },
  imgResInfoSync:()=>{infoCalls++;},syncImgPanel:()=>{panelCalls++;},
  orthoHDReset:()=>{resetCalls++;},syncOrthoTiles:()=>{
    tileSyncCalls++;
    tileSyncSawReady=!!(context.S.orthoHD&&imageState._img0===img0);
  },
  cmdLog:()=>{},globalThis:null
};
context.globalThis=context;
context.window=context;
vm.createContext(context);
vm.runInContext(`${functionDeclaration(rasterSource,'ortoReligarTIFF')}\n`+
  'globalThis.__relink=ortoReligarTIFF;',context,
{filename:'20-raster-dem.ortho-tablet-relink.js'});

await check('revinculação substitui toda a fonte',async()=>{
  const linked=await context.__relink(selectedFile);
  assert.equal(linked,true,'a revinculação válida deve concluir');
  assert.notEqual(imageState._id,oldPreview,'a revinculação deve substituir o preview antigo');
  assert.equal(imageState._w,4,'a largura do novo preview não foi gravada');
  assert.equal(imageState._h,2,'a altura do novo preview não foi gravada');
  assert.equal(imageState._id.data[3],255,'um canal vermelho igual ao NoData não pode apagar pixel RGB válido');
  assert.equal(imageState._id.data[31],0,'pixel com RGB inteiro igual ao NoData deve ficar transparente');
  assert.equal(imageState.url,'preview-atualizado','o overlay/preview visível não foi regenerado');
  assert.equal(imageState.src.file,selectedFile.name,'a origem exibida não mudou para o arquivo selecionado');
  assert.equal(imageState._sourceRaw,selectedFile,'o GeoTIFF escolhido não ficou ligado à ortofoto');
  assert.notEqual(imageState._cache,oldCache,
    'a revinculação reaproveitou o cache de janelas da ortofoto anterior');
  assert.equal(imageState._cache.size,0,
    'tiles/janelas da fonte anterior sobreviveram à revinculação');
  assert.equal(context.S.orthoHD,true,'a alta resolução não foi ativada após religar');
  assert.equal(applyCalls,1,'a nova prévia não foi aplicada ao overlay');
  assert.ok(resetCalls>=1,'o estado dos tiles não foi invalidado');
  assert.equal(tileSyncCalls,1,'os tiles da nova fonte não foram sincronizados');
  assert.equal(tileSyncSawReady,true,
    'a grade foi sincronizada antes de a nova fonte e a preferência HD estarem prontas');
  assert.ok(infoCalls>=1&&panelCalls>=1,'as propriedades não foram atualizadas após religar');
  assert.ok(loads.some(message=>/Reconstruindo a prévia/i.test(message)),
    'a etapa de reconstrução da prévia não foi executada');
});

await check('falha de preview restaura a ortofoto anterior',async()=>{
  const stable={url:imageState.url,overlay:imageState.overlay,src:imageState.src,
    cache:imageState._cache,raw:imageState._sourceRaw,tiff:imageState._tiff};
  const mapLayers=new Set([stable.overlay]), overlayFalho={generation:3};
  stable.overlay.addTo=()=>{mapLayers.add(stable.overlay);return stable.overlay;};
  context.map={removeLayer:o=>mapLayers.delete(o),hasLayer:o=>mapLayers.has(o)};
  context.applyImgNoData=()=>{
    mapLayers.delete(stable.overlay);
    imageState.url='preview-falho'; imageState.overlay=overlayFalho;
    mapLayers.add(overlayFalho);
    throw new Error('canvas sem memória');
  };
  const linked=await context.__relink({name:'ortofoto_incompleta.tif',size:4096});
  assert.equal(linked,false,'falha ao reconstruir a prévia não pode retornar sucesso');
  assert.equal(imageState.url,stable.url,'o URL anterior deve ser restaurado após falha');
  assert.equal(imageState.overlay,stable.overlay,'o overlay anterior deve ser restaurado após falha');
  assert.equal(imageState.src,stable.src,'os metadados anteriores devem ser restaurados após falha');
  assert.equal(imageState._cache,stable.cache,'o cache anterior deve ser restaurado após falha');
  assert.equal(imageState._sourceRaw,stable.raw,'a fonte nativa anterior deve ser restaurada após falha');
  assert.equal(imageState._tiff,stable.tiff,'o índice TIFF anterior deve ser restaurado após falha');
  assert.ok(mapLayers.has(stable.overlay),'o overlay anterior deve voltar ao mapa após falha');
  assert.ok(!mapLayers.has(overlayFalho),'o overlay incompleto deve ser removido após falha');
});

await check('falha só dos tiles mantém a nova prévia',async()=>{
  context.applyImgNoData=()=>{
    imageState.url='preview-sem-hd'; imageState.overlay={generation:4}; return {pct:0};
  };
  context.syncOrthoTiles=()=>{throw new Error('WebGL/tiles indisponíveis');};
  const linked=await context.__relink({name:'ortofoto_preview_valido.tif',size:8192});
  assert.equal(linked,true,'falha apenas dos tiles não deve rejeitar a ortofoto válida');
  assert.equal(imageState.url,'preview-sem-hd','a prévia nova deve permanecer aplicada');
  assert.equal(context.S.orthoHD,false,'o modo HD deve ser desligado ao falhar a grade de tiles');
});

await check('reset real remove grade e caches antigos',()=>{
  const resetContext={S:{_hdFails:3,img:{_cache:new Map([['antigo',1]])}},removed:[],globalThis:null};
  resetContext.map={hasLayer:()=>true,removeLayer:g=>resetContext.removed.push(g)};
  resetContext.globalThis=resetContext;
  vm.createContext(resetContext);
  vm.runInContext(`let _hdOn=true,_hdKey='janela-antiga',_tileFails=4;\n`+
    `let _orthoGrid={id:'grade-antiga'};\n${functionDeclaration(rasterSource,'orthoHDReset')}\n`+
    `orthoHDReset();globalThis.__after={hd:_hdOn,key:_hdKey,fails:_tileFails,grid:_orthoGrid,`+
    `sourceFails:S._hdFails,cache:S.img._cache.size};`,resetContext,
  {filename:'20-raster-dem.ortho-reset.js'});
  assert.equal(resetContext.removed.length,1,'a grade Leaflet anterior deve ser removida');
  assert.equal(resetContext.__after.grid,null,'a referência da grade antiga deve ser anulada');
  assert.equal(resetContext.__after.cache,0,'o cache de janelas da fonte anterior deve ser limpo');
  assert.deepEqual({hd:resetContext.__after.hd,key:resetContext.__after.key,
    fails:resetContext.__after.fails,sourceFails:resetContext.__after.sourceFails},
  {hd:false,key:'',fails:0,sourceFails:0},'o estado HD deve voltar ao zero');
});

if(failures.length){
  console.error('FALHA: seletor/revinculação da ortofoto ainda viola o contrato móvel:');
  failures.forEach((failure,index)=>console.error(`  ${index+1}. ${failure}`));
  process.exitCode=1;
}else{
  console.log('OK: importação/revinculação ativam tiles, e o checkbox sem fonte abre o seletor da ortofoto.');
}
