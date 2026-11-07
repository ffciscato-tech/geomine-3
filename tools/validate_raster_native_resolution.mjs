import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

const rasterSource=read('src/core/parts/20-raster-dem.js');
const hydroSource=read('src/core/parts/19-hydrology-and-flooding.js');
const persistenceSource=read('src/core/parts/26-project-persistence.js');
const workspaceSource=read('src/core/parts/11-geotiff-project-workspace.js');
const bootstrapSource=read('src/core/parts/01-bootstrap-crs-state-command.js');
const template=read('src/index.template.html');
const styles=read('src/styles/app.css');

function blockEnd(text,open,label){
  let depth=0,state='code',escaped=false;
  for(let i=open;i<text.length;i++){
    const ch=text[i],next=text[i+1];
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

function functionDeclaration(text,name){
  const safe=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=new RegExp(`\\b(?:async\\s+)?function\\s+${safe}\\s*\\(`).exec(text);
  assert.ok(match,`função ${name} ausente`);
  const open=text.indexOf('{',match.index+match[0].length);
  assert.ok(open>=0,`função ${name}: corpo ausente`);
  return text.slice(match.index,blockEnd(text,open,`função ${name}`)+1);
}

const failures=[];
async function check(label,fn){
  try{await fn();}
  catch(error){failures.push(`${label}: ${error&&error.message||error}`);}
}

/* Contrato da opção já exposta como “Desenhar o mapa na grade nativa”. O
   teste aceita que o rótulo evolua para “Original”, mas não aceita que o
   controle desapareça ou volte a representar apenas os produtos analíticos. */
await check('controle Original',()=>{
  assert.match(template,/id="rasDispFull"/,
    'falta um controle próprio para a resolução de visualização do raster');
  assert.match(template,/grade nativa|resolu[cç][aã]o original|\boriginal\b/i,
    'o controle não explica ao usuário que mostra o pixel/grade original');
});

/* Reprodução do defeito: uma grade nativa que ultrapassa o teto monolítico é
   reduzida por média antes de chegar ao canvas, mesmo com a opção Original
   marcada. Isso cria informação visual que não existe no arquivo (suaviza as
   descontinuidades). No modo Original a grade nativa deve chegar intacta ao
   renderizador; se o canvas não comportar, a implementação deve usar tiles,
   nunca reduzir a grade silenciosamente. */
let nativeRender=null;
await check('execução do render Original',()=>{
  const native={
    nc:6000,nr:4000,cs:.25,csy:.25,xll:500000,yll:7400000,
    z:new Float32Array([0,100,0,100])
  };
  const preview={
    nc:2,nr:2,cs:1500,csy:1000,xll:native.xll,yll:native.yll,
    z:Float32Array.from([50,50,50,50]),_full:native
  };
  let reduceCalls=0,canvasGrid=null,screenMode=null,overlayOptions=null;
  const overlay={addTo(){return overlay;}};
  const context={
    console,setTimeout,
    S:{workCRS:'EPSG:3857',_view:'2d'},
    DISP_MAX_CELLS:64e6,
    reduceGrid(g){reduceCalls++;return {...g,nc:6000,nr:4000,cs:.5,csy:.5};},
    gradeParaTela(g,mode){screenMode=mode;return g;},
    rasterCanvas(_r,g){canvasGrid=g;return {toDataURL:()=>"data:image/png;base64,bmF0aXZh"};},
    rasterBounds(_r,g){return [g.xll,g.yll,g.xll+g.nc*g.cs,g.yll+g.nr*(g.csy||g.cs)];},
    reproj(_a,_b,x,y){return [x,y];},toWGS(_crs,x,y){return [x,y];},
    wgsBoundsOK(){return true;},panelDaCamada(){return 'raster';},
    L2:{imageOverlay(_url,_bounds,options){overlayOptions=options;return overlay;}},
    map:{removeLayer(){}},zApply(){},toast(){},syncDemTiles(){},
    demTilesAtivo(){return false;},demTilesRefresh(){},
    globalThis:null
  };
  context.globalThis=context;
  vm.createContext(context);
  vm.runInContext(`${functionDeclaration(rasterSource,'rasterPrecisaFonteTela')}\n`+
    `${functionDeclaration(rasterSource,'rasterGradeCabeCanvas')}\n`+
    `${functionDeclaration(rasterSource,'rasterGradeOriginalCanvas')}\n`+
    `${functionDeclaration(rasterSource,'renderRaster')}\n`+
    'globalThis.__renderRaster=renderRaster;',context,
  {filename:'20-raster-dem.native-resolution.js'});

  const raster={id:8,name:'MDT nativo',d:preview,dispFull:true,demHD:true,visible:true,
    style:{mode:'gray',opacity:1},overlay:null};
  context.__renderRaster(raster);
  nativeRender={native,reduceCalls,canvasGrid,screenMode,overlayOptions,raster};
});

await check('grade nativa intacta',()=>{
  assert.ok(nativeRender,'o cenário Original não chegou ao renderizador');
  assert.equal(nativeRender.reduceCalls,0,
    'Original ainda chama reduceGrid/média de bloco antes de desenhar');
  assert.equal(nativeRender.canvasGrid,nativeRender.native,
    'o renderizador não recebeu exatamente a grade _full do GeoTIFF');
});

await check('estado após redraw',()=>{
  assert.ok(nativeRender,'o cenário Original não chegou ao renderizador');
  assert.equal(nativeRender.raster.dispFull,true,
    'um redraw alterou/desmarcou o estado Original do raster');
  assert.equal(nativeRender.raster.demHD,false,
    'uma grade que ja cabe inteira manteve tiles duplicados por cima do canvas nativo');
});

await check('reamostragem nearest/native',()=>{
  assert.ok(nativeRender,'o cenário Original não chegou ao renderizador');
  assert.match(JSON.stringify(nativeRender.screenMode??''),/nearest|vizinh|nativ|original/i,
    'a reprojeção de tela não recebeu um modo sem interpolação (nearest/native)');
});

await check('overlay marcado como pixel nativo',()=>{
  assert.ok(nativeRender,'o cenário Original não chegou ao renderizador');
  assert.match(String(nativeRender.overlayOptions&&nativeRender.overlayOptions.className||''),
    /native|original|pixel/i,
    'o overlay Original não foi marcado para impedir suavização pelo navegador');
});

await check('grade gigante sem fonte nao entra no canvas',()=>{
  const huge={nc:12000,nr:8000,cs:.25,csy:.25,xll:500000,yll:7400000,
    z:new Float32Array([0,100,0,100])};
  const preview={nc:2,nr:2,cs:1500,csy:1000,xll:huge.xll,yll:huge.yll,
    z:Float32Array.from([50,50,50,50]),resampled:4000,_full:huge};
  let canvasGrid=null;
  const overlay={addTo(){return overlay;}};
  const context={console,setTimeout,DISP_MAX_CELLS:64e6,S:{workCRS:'EPSG:3857',_view:'2d'},
    gradeParaTela:g=>g,rasterCanvas(_r,g){canvasGrid=g;return{toDataURL:()=>''};},
    rasterBounds(_r,g){return[g.xll,g.yll,g.xll+g.nc*g.cs,g.yll+g.nr*(g.csy||g.cs)];},
    toWGS(_c,x,y){return[x,y];},reproj(_a,_b,x,y){return[x,y];},wgsBoundsOK(){return true;},
    panelDaCamada(){return'raster';},L2:{imageOverlay(){return overlay;}},map:{removeLayer(){}},
    zApply(){},toast(){},syncDemTiles(){},demTilesAtivo(){return false;},demTilesRefresh(){},globalThis:null};
  context.globalThis=context;vm.createContext(context);
  vm.runInContext(`${functionDeclaration(rasterSource,'rasterPrecisaFonteTela')}\n`+
    `${functionDeclaration(rasterSource,'rasterGradeCabeCanvas')}\n`+
    `${functionDeclaration(rasterSource,'rasterGradeOriginalCanvas')}\n`+
    `${functionDeclaration(rasterSource,'renderRaster')}\n`+
    'globalThis.__renderRaster=renderRaster;',context);
  const raster={id:9,name:'gigante',d:preview,dispFull:true,demHD:false,visible:true,
    style:{mode:'gray',opacity:1},overlay:null};
  context.__renderRaster(raster);
  assert.equal(canvasGrid,preview,'grade gigante foi enviada ao canvas apesar do teto');
  assert.equal(raster.demHD,false,'sem GeoTIFF o app nao pode fingir que ha tiles originais');
});

await check('grade gigante com GeoTIFF migra para tiles',()=>{
  const huge={nc:12000,nr:8000,cs:.25,csy:.25,xll:500000,yll:7400000,z:new Float32Array(4)};
  const preview={nc:2,nr:2,cs:1500,csy:1000,xll:huge.xll,yll:huge.yll,
    z:new Float32Array(4),resampled:4000,_full:huge,_img0:{}};
  let canvasGrid=null;
  const overlay={addTo(){return overlay;}};
  const context={console,setTimeout,DISP_MAX_CELLS:64e6,S:{workCRS:'EPSG:3857',_view:'2d'},
    gradeParaTela:g=>g,rasterCanvas(_r,g){canvasGrid=g;return{toDataURL:()=>''};},
    rasterBounds(_r,g){return[g.xll,g.yll,g.xll+g.nc*g.cs,g.yll+g.nr*(g.csy||g.cs)];},
    toWGS(_c,x,y){return[x,y];},reproj(_a,_b,x,y){return[x,y];},wgsBoundsOK(){return true;},
    panelDaCamada(){return'raster';},L2:{imageOverlay(){return overlay;}},map:{removeLayer(){}},
    zApply(){},toast(){},syncDemTiles(){},demTilesAtivo(){return true;},demTilesRefresh(){},globalThis:null};
  context.globalThis=context;vm.createContext(context);
  vm.runInContext(`${functionDeclaration(rasterSource,'rasterPrecisaFonteTela')}\n`+
    `${functionDeclaration(rasterSource,'rasterGradeCabeCanvas')}\n`+
    `${functionDeclaration(rasterSource,'rasterGradeOriginalCanvas')}\n`+
    `${functionDeclaration(rasterSource,'renderRaster')}\n`+
    'globalThis.__renderRaster=renderRaster;',context);
  const raster={id:10,name:'tileavel',d:preview,dispFull:true,demHD:false,visible:true,
    style:{mode:'gray',opacity:1},overlay:null};
  context.__renderRaster(raster);
  assert.equal(canvasGrid,preview,'tile grande nao deve materializar a grade inteira no canvas');
  assert.equal(raster.demHD,true,'GeoTIFF grande nao foi encaminhado aos tiles originais');
});

/* O navegador suaviza uma imagem de overlay ao aplicar transform/zoom. A
   marca do overlay acima só tem efeito se existir uma regra explícita de
   nearest-neighbour. `image-rendering:auto` não atende este contrato. */
await check('sem smoothing no overlay',()=>{
  assert.match(styles,
    /\.(?:[^\s,{]*)(?:raster|native|original|pixel)[^,{]*\{[^}]*image-rendering\s*:\s*(?:pixelated|crisp-edges)/is,
    'falta image-rendering: pixelated/crisp-edges na imagem do raster Original');
});

await check('tiles Original usam pixel fisico e nao sao suavizados',()=>{
  const sync=functionDeclaration(rasterSource,'syncDemTiles');
  const build=functionDeclaration(rasterSource,'buildDemTile');
  assert.match(sync,/devicePixelRatio[\s\S]{0,180}classList\.add\(\s*['"]geomine-raster-native-pixels['"]\s*\)/,
    'o tile Original ignora a densidade Retina ou nao recebe a classe sem suavizacao');
  assert.match(build,/const\s+OUT\s*=\s*cv\.width[\s\S]{0,700}\/OUT/,
    'a amostragem do tile continua fixa em 256 pixels apesar do canvas Retina');
  assert.match(styles,/\.leaflet-tile\.geomine-raster-native-pixels[\s\S]{0,100}image-rendering\s*:\s*(?:pixelated|crisp-edges)/,
    'o navegador ainda pode suavizar os canvases do raster Original');
});

await check('preview de arquivo e canvas nativo tem teto seguro',()=>{
  assert.match(hydroSource,/const\s+RASTER_FILE_PREVIEW_CELLS\s*=\s*EH_MOVEL\s*\?\s*6e6\s*:\s*12e6/,
    'a previa do GeoTIFF ainda pode alocar o teto analitico inteiro');
  assert.match(hydroSource,/preview\.cellBudget\(nc0,nr0,RASTER_FILE_PREVIEW_CELLS\):RASTER_FILE_PREVIEW_CELLS/,
    'parseTIFF nao usa o teto exclusivo da previa');
  assert.match(hydroSource,/\(nc0\*nr0\)\/cellBudget/);
  assert.match(hydroSource,/const\s+DISP_MAX_CELLS\s*=\s*EH_MOVEL\s*\?\s*6e6\s*:\s*12e6/,
    'o canvas nativo ainda permite um pico de memoria excessivo');
});

await check('estatistica de cores vem da fonte original',()=>{
  const context={console,ArrayBuffer,globalThis:null};context.globalThis=context;vm.createContext(context);
  vm.runInContext(`${functionDeclaration(hydroSource,'geotiffDeclaredStats')}\n`+
    'globalThis.__stats=geotiffDeclaredStats;',context);
  const declarada=context.__stats({
    getGDALMetadata:()=>({STATISTICS_MINIMUM:'10',STATISTICS_MAXIMUM:'90'}),
    fileDirectory:{SMinSampleValue:0,SMaxSampleValue:65535}
  });
  assert.deepEqual(JSON.parse(JSON.stringify(declarada)),{mn:10,mx:90,exact:true},
    'tags teoricas do tipo numerico venceram os extremos GDAL reais');
  const xml=context.__stats({getGDALMetadata:()=>({}),fileDirectory:{GDAL_METADATA:
    '<GDALMetadata><Item name="STATISTICS_MINIMUM">-3</Item><Item name="STATISTICS_MAXIMUM">127</Item></GDALMetadata>'}});
  assert.deepEqual(JSON.parse(JSON.stringify(xml)),{mn:-3,mx:127,exact:true},
    'STATISTICS_MINIMUM/MAXIMUM do XML GDAL nao foram reconhecidos');
  assert.match(hydroSource,/Math\.min\(declarados\.mn\s*,\s*observados\.mn\)[\s\S]{0,100}Math\.max\(declarados\.mx\s*,\s*observados\.mx\)/,
    'metadado estreito pode saturar valores ja observados');
  assert.match(rasterSource,/r\.dispFull\s*&&\s*d\._sourceStats/,
    'os tiles originais ainda normalizam a cor pelos extremos da previa');
});

/* Não basta manter a opção até fechar a janela de propriedades: salvar e
   reabrir o projeto deve reconstruir o mesmo modo. O teste aceita o nome
   legado `dispFull` ou um futuro campo semântico `displayResolution`. */
await check('round-trip do projeto',()=>{
  const persistLegacy=/\bdispFull\s*:\s*!!?r\.dispFull\b/.test(persistenceSource);
  const restoreLegacy=/\bdispFull\s*:\s*!!?o\.dispFull\b/.test(persistenceSource);
  const persistMode=/\bdisplayResolution\s*:\s*r\.displayResolution\b/.test(persistenceSource);
  const restoreMode=/\bdisplayResolution\s*:\s*o\.displayResolution\b/.test(persistenceSource);
  assert.ok((persistLegacy&&restoreLegacy)||(persistMode&&restoreMode),
    'o modo Original não é serializado e restaurado em cada raster');
});

await check('tiles acima da pre-visualizacao',()=>{
  assert.match(rasterSource,/demHD[^\n]*[\s\S]{0,500}zIndex\s*=\s*String\([^\n]*\+\s*1\)/,
    'o pane HD nao nasce acima do overlay leve');
  const zApply=functionDeclaration(bootstrapSource,'zApply');
  assert.match(zApply,/demHD[^\n]*zIndex\s*=\s*z\s*\+\s*1/,
    'a ordenacao geral volta a colocar o tile HD no mesmo nivel/atras do preview');
});

await check('controles sincronizados por camada',()=>{
  const open=functionDeclaration(rasterSource,'openRasProps');
  const sync=functionDeclaration(rasterSource,'rasSyncResolutionControls');
  assert.match(open,/rasSyncResolutionControls\s*\(\s*r\s*\)/,
    'abrir as propriedades nao atualiza os controles da camada selecionada');
  assert.match(sync,/rasDemHD[\s\S]*disabled\s*=\s*false/,
    'o controle HD precisa permitir selecionar o original ausente');
  assert.match(sync,/marque a op[çc][ãa]o|Marque a op[çc][ãa]o/,
    'o controle nao explica como vincular o original');
});

await check('botao original realmente ativa a visualizacao',()=>{
  const bind=functionDeclaration(rasterSource,'bindRasModal');
  const inicio=bind.indexOf('bLF.onclick=async');
  const fim=bind.indexOf("const cDF=document.getElementById('rasDispFull')",inicio);
  assert.ok(inicio>=0&&fim>inicio,'o botao de arquivo original nao foi ligado');
  const botao=bind.slice(inicio,fim);
  assert.match(botao,/r\.dispFull\s*=\s*!!mono\s*\|\|\s*r\.demHD/,
    'o botao de arquivo original ainda apenas carrega a fonte sem mudar o mapa');
  assert.match(botao,/r\.demHD\s*=\s*!mono\s*&&\s*!!d\._img0/,
    'grade grande nao ativa os tiles do arquivo original');
});

await check('modo HD persistente e padrao no computador',()=>{
  assert.match(rasterSource,/demHD\s*:\s*!EH_MOVEL\s*&&\s*d\.resampled\s*>\s*1/,
    'raster reduzido importado no computador nao inicia com detalhe por zoom');
  assert.match(persistenceSource,/demHD\s*:\s*!!r\.demHD/,
    'o modo HD nao e serializado');
  assert.match(persistenceSource,/demHD\s*:\s*o\.demHD\s*!==\s*undefined\s*\?\s*!!o\.demHD\s*:\s*false/,
    'o modo HD salvo nao e restaurado com seguranca');
  assert.match(persistenceSource,/_demHDLegacy\s*:\s*o\.demHD\s*===\s*undefined/,
    'projetos antigos nao sao identificados para migracao');
  assert.match(workspaceSource,/r\._demHDLegacy[\s\S]{0,120}r\.demHD\s*=\s*!EH_MOVEL\s*&&\s*g\.resampled\s*>\s*1/,
    'projeto antigo nao liga os tiles depois que o GeoTIFF original e restaurado');
});

await check('troca de projeto limpa tiles antigos',()=>{
  assert.match(rasterSource,/function\s+clearDemTiles\s*\([^)]*\)\s*\{[\s\S]*?_demGrids\.clear\(\)[\s\S]*?_demFails\.clear\(\)/,
    'nao existe limpeza completa do cache/layers HD');
  assert.match(persistenceSource,/clearDemTiles\s*\(\)[\s\S]{0,300}\(S\.rasters\|\|\[\]\)\.forEach/,
    'a troca de projeto zera os rasters antes de remover os tiles antigos');
});

await check('preview nao soma opacidade aos tiles',()=>{
  const sync=functionDeclaration(rasterSource,'syncDemTiles');
  assert.match(sync,/\.on\(\s*['"]loading['"][\s\S]{0,100}demPreviewOpacity\(R\s*,\s*false\)/,
    'a previa nao reaparece enquanto os tiles originais carregam');
  assert.match(sync,/\.on\(\s*['"]load['"][\s\S]{0,220}demPreviewOpacity\(R\s*,\s*!gl\._demFallbackHole\)/,
    'a previa nao some quando os tiles originais ficam prontos');
});

await check('fallback e eventos de tiles nao deixam buracos',()=>{
  const sync=functionDeclaration(rasterSource,'syncDemTiles');
  assert.match(sync,/buildDemTile\(cv\s*,\s*coords\s*,\s*R\s*,\s*true\)/,
    'uma falha de leitura nativa nao repinta o quadrado com a grade leve');
  assert.match(sync,/if\s*\(\s*!fallbackOk\s*\)\s*gl\._demFallbackHole\s*=\s*true/,
    'a grade nao registra quando ate o fallback falhou');
  assert.match(sync,/_demGrids\.get\(id\)\s*===\s*gl\s*&&\s*demTilesAtivo\(R\)/,
    'callbacks de uma grade removida ainda podem alterar o raster atual');
  assert.match(sync,/_demGrids\.delete\(id\)\s*;\s*_demFails\.delete\(id\)[\s\S]{0,80}map\.removeLayer\(atual\)/,
    'a grade removida nao e invalidada antes de seus eventos tardios');
});

await check('recorte do raster tambem vale nos tiles',()=>{
  const build=functionDeclaration(rasterSource,'buildDemTile');
  const preview=functionDeclaration(rasterSource,'pintaTileDaGrade');
  assert.match(build,/rasterTileClipper\s*\(\s*r\s*\)/,
    'o tile original ignora o limite vetorial aplicado ao raster');
  assert.match(build,/clipAceita\s*&&\s*!clipAceita\(/,
    'a janela nativa nao torna transparentes os pixels fora do recorte');
  assert.match(preview,/clipAceita\s*&&\s*!clipAceita\(/,
    'o tile de preview nao torna transparentes os pixels fora do recorte');
});

await check('falha de tiles nao deixa Original falsamente ativo',()=>{
  const sync=functionDeclaration(rasterSource,'syncDemTiles');
  assert.match(sync,/n\s*>=\s*4[\s\S]{0,260}R\.demHD\s*=\s*false[\s\S]{0,180}R\.dispFull\s*=\s*false/,
    'depois de falhas repetidas o checkbox Original ainda pode prometer detalhe inexistente');
});

await check('projeto sem acesso ao GeoTIFF volta honestamente a previa',()=>{
  const restore=functionDeclaration(workspaceSource,'projectRestoreNativeRasters');
  assert.match(restore,/voltaParaPrevia[\s\S]{0,500}r\.dispFull\s*=\s*false\s*;\s*r\.demHD\s*=\s*false/,
    'o projeto sem arquivo original continua declarando Original/HD ativos');
  assert.match(restore,/if\s*\(\s*!ds\s*\)[\s\S]{0,220}voltaParaPrevia/,
    'a falta de autorizacao da pasta nao normaliza os rasters para a previa');
  assert.match(restore,/catch\s*\(e\)\s*\{[\s\S]{0,100}voltaParaPrevia\s*\(\s*r\s*\)/,
    'um GeoTIFF ausente nao normaliza somente a camada afetada');
  assert.match(restore,/todos\.filter\(r\s*=>\s*!r\.projectFile\)[\s\S]{0,120}voltaParaPrevia/,
    'raster salvo apenas como previa continua falsamente marcado como Original');
});

await check('caches de extremos sao invalidados quando a grade muda',()=>{
  assert.match(rasterSource,/r\.d\s*=\s*nd\s*;\s*r\._st\s*=\s*null\s*;\s*r\._stFull\s*=\s*null/,
    'a reprojecao pode reutilizar extremos da grade nativa anterior');
  assert.match(workspaceSource,/r\.d\s*=\s*g\s*;\s*r\._st\s*=\s*null\s*;\s*r\._stFull\s*=\s*null/,
    'a restauracao do GeoTIFF pode reutilizar extremos da previa salva');
});

if(failures.length){
  console.error('FALHA: visualização raster em resolução Original ainda viola o contrato:');
  failures.forEach((failure,index)=>console.error(`  ${index+1}. ${failure}`));
  process.exitCode=1;
}else{
  console.log('OK: Original usa a grade nativa sem média/interpolação, desliga smoothing e sobrevive a redraw/projeto.');
}
