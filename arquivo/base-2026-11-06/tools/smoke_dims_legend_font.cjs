// Cotas CAD no Layout e estilo da fonte. Retângulo com uma cota criada por
// cliques reais: a camada de cotas não aparece na legenda do Layout (nem na
// lista de itens da legenda), mas o texto da cota continua na prancha. Na janela
// de propriedades da camada de cotas, Negrito e Itálico chegam ao rótulo do
// mapa, ao SVG do Layout e ao estilo de texto do DXF; Ctrl+Z desfaz.
// PLAYWRIGHT_MODULE, CHROME_PATH e APP_PATH permitem rodar fora do macOS.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stage=path.resolve(__dirname,'..');let passed=0;
const pass=name=>{passed++;console.log('PASS '+name);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route(/^https?:/,r=>r.abort());
  await page.goto(pathToFileURL(path.resolve(process.env.APP_PATH||path.join(stage,'dist/GeoMine.html'))).href);
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineDimensions);
  await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31983';S.projectId='dims-legend-synthetic';S.snapOn=true;S.orthoOn=false;
   const C=[313000,7683000];
   window.__R=addLayer({name:'Retângulo',gtype:'polygon',crs:'EPSG:31983',fields:[],features:[{geom:[formaGeom('retangulo',C,{C:5,L:3},0)],multi:true,props:{}}]});
   S.activeId=__R.id;drawLayer(__R);refreshUI();
   const w1=toWGS(S.workCRS,C[0]-4,C[1]-4),w2=toWGS(S.workCRS,C[0]+4,C[1]+4);map.fitBounds([[w1[1],w1[0]],[w2[1],w2[0]]],{animate:false});
   window.__px=(x,y)=>{const w=toWGS(S.workCRS,C[0]+x,C[1]+y),c=map.latLngToContainerPoint([w[1],w[0]]),r=map.getContainer().getBoundingClientRect();return {x:r.left+c.x,y:r.top+c.y};};
  });
  const px=(x,y)=>page.evaluate(([x,y])=>__px(x,y),[x,y]);
  const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.evaluate(()=>GeoMineDimensions.start({mode:'aligned',unit:'m',decimals:2,height:0.4,snap:true}));
  for(const [x,y] of [[-2.5,-1.5],[2.5,-1.5],[0,-2.5]]){const p=await px(x,y);await page.mouse.move(p.x,p.y);await frames();await page.mouse.click(p.x,p.y);await frames();}
  await page.keyboard.press('Escape');await frames();
  assert.equal(await page.evaluate(()=>{window.__D=S.layers.find(l=>GeoMineDimensions.isLayer(l));return __D?.features.map(f=>f.props.TEXTO).join('|');}),'5,00 m');
  pass('cota de 5,00 m criada na camada "Cotas CAD"');

  /* 1) legenda do Layout: sem a camada de cotas; o texto da cota segue na prancha */
  const layout=()=>page.evaluate(async()=>{
   S._signikaCSS='';S.loMode='fig';S.loFrozen=false;S.loZoom=1;
   for(const id of ['loSat','loCoords','loCart','loNorth','loScaleBar'])(document.getElementById(id)||{}).checked=false;
   document.getElementById('loLegend').checked=true;
   for(const [id,value] of Object.entries({loPaper:'auto',loFigW:180,loFigH:0,loPad:12,loMar:0,loGrid:0})){const el=document.getElementById(id);if(el)el.value=value;}
   document.getElementById('loScaleAuto').checked=true;await buildLayout();
   const doc=new DOMParser().parseFromString(S._lastSVG,'image/svg+xml');
   const textos=[...doc.querySelectorAll('text')].map(t=>({s:t.textContent.trim(),w:t.getAttribute('font-weight'),i:t.getAttribute('font-style')}));
   return {itens:legendItems().map(i=>i.label),linhas:legendControlRows().map(r=>r.label),textos};
  });
  let lo=await layout();
  assert.ok(lo.itens.includes('Retângulo'),JSON.stringify(lo.itens));
  assert.ok(!lo.itens.some(s=>/Cotas/.test(s)),'legenda sem cotas: '+JSON.stringify(lo.itens));
  assert.ok(!lo.linhas.some(s=>/Cotas/.test(s)),'lista da legenda sem cotas: '+JSON.stringify(lo.linhas));
  assert.ok(lo.textos.some(t=>t.s==='Retângulo'),'"Retângulo" na legenda da prancha');
  assert.ok(!lo.textos.some(t=>/Cotas CAD/.test(t.s)),'"Cotas CAD" não aparece na prancha');
  const cotaLo=()=>lo.textos.find(t=>t.s==='5,00 m');
  assert.ok(cotaLo(),'o texto da cota continua desenhado na prancha');assert.equal(cotaLo().w,'400');assert.equal(cotaLo().i,'normal');
  pass('Layout: a camada de cotas fica fora da legenda e da lista de itens; o texto da cota continua na prancha');

  /* 2) Negrito e Itálico na janela de propriedades da camada de cotas */
  await page.evaluate(()=>openLayerProps(__D));
  await page.waitForSelector('#gmDimLayerStyle [data-dim="bold"]');
  assert.equal(await page.isChecked('#gmDimLayerStyle [data-dim="bold"]'),false);
  await page.check('#gmDimLayerStyle [data-dim="bold"]');await page.check('#gmDimLayerStyle [data-dim="italic"]');
  await page.click('#gmDimLayerStyle [data-dim-apply]');
  assert.match(await page.locator('#gmDimLayerStyle [data-dim-result]').textContent(),/1 cota/);
  const est=await page.evaluate(()=>({lbl:__D.lbl.style,st:GeoMineDimensions.styleOf(__D),css:(()=>{const el=[...document.querySelectorAll('.leaflet-marker-icon.gc-label div')].find(e=>e.textContent.trim()==='5,00 m');if(!el)return null;const c=getComputedStyle(el);return {w:c.fontWeight,i:c.fontStyle};})(),
   dxf:GeoMineDimensions.dxfStyles([__D])+GeoMineDimensions.dxfText(__D,__D.features[0])}));
  assert.equal(est.lbl,'bold italic');assert.equal(est.st.bold,true);assert.equal(est.st.italic,true);
  assert.ok(est.css,'rótulo da cota no mapa');assert.equal(est.css.w,'700');assert.equal(est.css.i,'italic');
  assert.match(est.dxf,/\n2\nGM_DIM_Arial_N_I\n/);assert.match(est.dxf,/\n3\narialbi\.ttf\n/);assert.match(est.dxf,/\n7\nGM_DIM_Arial_N_I\n/);
  await page.evaluate(()=>document.querySelector('#layerPropModal .modal-x, #lpClose')?.click());
  lo=await layout();assert.equal(cotaLo().w,'700');assert.equal(cotaLo().i,'italic');
  pass('Negrito + Itálico: rótulo do mapa, texto da prancha e estilo do DXF (arialbi.ttf)');

  /* 3) a janela reflete o estado e Ctrl+Z desfaz */
  await page.evaluate(()=>openLayerProps(__D));await page.waitForSelector('#gmDimLayerStyle [data-dim="bold"]');
  assert.equal(await page.isChecked('#gmDimLayerStyle [data-dim="bold"]'),true);assert.equal(await page.isChecked('#gmDimLayerStyle [data-dim="italic"]'),true);
  await page.uncheck('#gmDimLayerStyle [data-dim="italic"]');await page.click('#gmDimLayerStyle [data-dim-apply]');
  assert.equal(await page.evaluate(()=>__D.lbl.style),'bold');
  await page.evaluate(()=>doUndo());
  assert.equal(await page.evaluate(()=>__D.lbl.style),'bold italic');
  pass('a janela reabre marcada; tirar o itálico deixa só negrito; Ctrl+Z volta para negrito itálico');

  assert.deepEqual(errors,[]);
  console.log(`OK ${passed} cenários`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
