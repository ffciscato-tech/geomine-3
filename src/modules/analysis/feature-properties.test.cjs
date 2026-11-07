// Dock direito: seleção no mapa, valores dos atributos e totais distintos.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1450,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
  await page.goto(pathToFileURL(path.resolve(__dirname,'../../..','dist/GeoMine.html')).href);
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted);
  const dock=page.locator('#propDockContent');
  await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31982';
   const square=(x,size)=>[[x,7400000],[x+size,7400000],[x+size,7400000+size],[x,7400000+size],[x,7400000]];
   window.testPropsLayer=addLayer({name:'Imóveis',crs:S.workCRS,gtype:'polygon',fields:[{name:'nome',type:'C'},{name:'zero',type:'N'}],
    features:[{geom:square(500000,100),props:{nome:'Imóvel A',zero:0,ativo:false}},{geom:square(500200,200),props:{nome:'Imóvel <B>',zero:42}}]});
   drawLayer(testPropsLayer);S.selFeat=null;S.msel.items=[];S.activeId=testPropsLayer.id;setTool('select');
   const a=toWGS(S.workCRS,499900,7399900),b=toWGS(S.workCRS,500500,7400300);safeFit([[a[1],a[0]],[b[1],b[0]]]);refreshUI();
  });
  assert.match(await dock.innerText(),/Geometria total da camada/);
  const click=async(x,y)=>{
   const p=await page.evaluate(({x,y})=>{closeFeatMenu();const w=toWGS(S.workCRS,x,y),p=map.latLngToContainerPoint([w[1],w[0]]),b=map.getContainer().getBoundingClientRect();return {x:p.x+b.left,y:p.y+b.top};},{x,y});
   await page.mouse.click(p.x,p.y);
  };
  await page.waitForTimeout(350);await click(500050,7400050);
  await page.waitForFunction(()=>S.selFeat?.idx===0);
  let geom=dock.locator('[data-prop-selection="geometry"]');
  assert.match(await geom.innerText(),/10\.000,00 m²/);
  assert.doesNotMatch(await dock.innerText(),/Geometria total da camada|Totais da camada|50\.000,00 m²/);
  assert.match(await dock.locator('[data-prop-selection="attributes"]').innerText(),/Imóvel A/);
  assert.match(await dock.locator('[data-prop-selection="attributes"]').innerText(),/false/);
  await click(500300,7400100);await page.waitForFunction(()=>S.selFeat?.idx===1);
  assert.match(await geom.innerText(),/40\.000,00 m²/);
  assert.doesNotMatch(await dock.innerText(),/Geometria total da camada|Totais da camada|10\.000,00 m²/);
  assert.match(await dock.locator('[data-prop-selection="attributes"]').innerText(),/Imóvel <B>/);
  assert.equal(await dock.locator('[data-prop-selection="attributes"] b b').count(),0,'atributos escapados');
  await page.evaluate(()=>{S.selFeat=null;S.msel.items=[{layerId:testPropsLayer.id,idx:0},{layerId:testPropsLayer.id,idx:1}];refreshUI();});
  assert.match(await geom.innerText(),/50\.000,00 m²/);
  assert.equal(await dock.locator('[data-prop-selection="attributes"]').count(),0);
  await page.evaluate(()=>{S.selFeat=null;S.msel.items=[];refreshUI();});
  assert.equal(await geom.count(),0);assert.match(await dock.innerText(),/Geometria total da camada/);
  console.log('PASS: cliques reais alternam área/atributos; múltipla soma a seleção; limpar restaura totais.');
  if(process.env.BLOCASA_PROJECT){
   const project=JSON.parse(fs.readFileSync(process.env.BLOCASA_PROJECT,'utf8'));
   await page.evaluate(d=>{loadProject(d);S.setBase('Sem fundo');},project);
   await page.waitForFunction(()=>S.layers.some(L=>L.id===43&&L.features.length===961));
   const actual=[];
   for(const index of [232,233,311,400]){
    const expected=await page.evaluate(i=>{const L=S.layers.find(L=>L.id===43);pickFeature(L,i,null);return {area:fmtNum(measureFeature(L,L.features[i]).area,2)+' m²',code:L.features[i].props.cod_imovel};},index);
    assert.match(await geom.innerText(),new RegExp(expected.area.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
    assert.ok((await dock.locator('[data-prop-selection="attributes"]').innerText()).includes(expected.code));actual.push(expected.area);
    assert.doesNotMatch(await dock.innerText(),/11\.797,20|Geometria total da camada|Totais da camada/);
   }
   assert.ok(new Set(actual).size>1);
   if(process.env.SCREENSHOT_PATH)await page.screenshot({path:process.env.SCREENSHOT_PATH});
   console.log('PASS: BLOCASA original — 961 imóveis, índices 232, 233 e 400 mostram suas próprias áreas e códigos.');
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
