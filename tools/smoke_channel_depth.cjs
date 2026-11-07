// Full offline app, synthetic native MDT only. No user project or remote service.
// APP_PATH may select another built HTML; QA_SCREENSHOT optionally captures review.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<.001,(label||'value')+': '+a+' != '+b);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:800},hasTouch:true,
   userAgent:'Mozilla/5.0 (Linux; Android 14; SM-X610) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+path.resolve(process.env.APP_PATH||path.join(__dirname,'../dist/GeoMine.html')));
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineChannelExtraction&&window.GeoMineChannelLive);
  const capture=async(name,target,desktop=false)=>{
   if(!process.env.QA_CAPTURE_DIR)return;
   const dir=path.resolve(process.env.QA_CAPTURE_DIR);fs.mkdirSync(dir,{recursive:true});
   if(desktop)await page.setViewportSize({width:1440,height:950});
   await page.locator(target).scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>getComputedStyle(document.getElementById('toast')).opacity==='0');
   await page.evaluate(()=>{const label=document.createElement('div');label.id='depthQALabel';label.textContent='Teste controlado — terreno sintético';
    label.style.cssText='position:fixed;right:16px;top:134px;z-index:100000;background:#fff3cd;color:#3f3517;border:1px solid #c99e31;padding:9px 12px;font:600 13px system-ui;pointer-events:none';document.body.append(label);});
   await page.screenshot({path:path.join(dir,name+'.png')});await page.locator('#depthQALabel').evaluate(e=>e.remove());
   if(desktop)await page.setViewportSize({width:1280,height:800});
  };
  await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31982';S.projectId='channel-depth-smoke';
   const nc=241,nr=81,cs=.5,xll=499989.75,yll=7399979.75,z=new Float32Array(nc*nr),bench=new Float32Array(nc*nr);
   for(let r=0;r<nr;r++)for(let c=0;c<nc;c++){
    const x=xll+(c+.5)*cs,y=yll+(nr-r-.5)*cs,d=Math.abs(y-7400000),base=100+.1*(x-500000);
    z[r*nc+c]=base+d;bench[r*nc+c]=base+Math.min(3,Math.max(0,d-2));
   }
   window.__grid={nc,nr,cs,csy:cs,xll,yll,z,zmin:99,zmax:132,native:true,resampled:1,srcCRS:S.workCRS};
   window.__raster={id:9941,name:'V inclinado — profundidade local',crs:S.workCRS,visible:false,style:{mode:'hipso'},d:__grid};
   window.__benchGrid={...__grid,z:bench};S.rasters.push(__raster,{id:9942,name:'Margens com quebra — automático',crs:S.workCRS,visible:false,style:{mode:'hipso'},d:__benchGrid});
   window.__rasterBefore=Array.from(z);
   window.__axis=addLayer({name:'Guia de teste profundidade',gtype:'line',crs:S.workCRS,fields:[{name:'ID',type:'N'}],features:[{geom:[[500000,7400000],[500040,7400000]],props:{ID:1}}]});
   window.__axisOriginal=JSON.stringify({geom:__axis.features[0].geom,props:__axis.features[0].props});
   window.__profileRef=S.prof;window.__profileBefore=JSON.stringify(S.prof);
   window.__outputs=()=>S.layers.filter(L=>L!==__axis);
   window.__open=()=>{S.activeId=__axis.id;ED.on=false;ED.sel=null;S.selFeat=null;GeoMineChannelExtraction.open();};
   S.undo=[];__open();
  });
  // "Gerar como" separa os métodos: calha = automático; massa de água = altura/profundidade.
  const methods=()=>page.locator('#chanMode option').evaluateAll(a=>a.map(o=>({value:o.value,text:o.textContent})));
  assert.deepEqual((await methods()).map(o=>o.value),['auto']);
  await page.locator('#chanKindAgua').check();const options=await methods();
  assert.deepEqual(options.map(o=>o.value),['axisDepth','depth']);assert.match(options[1].text,/profundidade/i);
  await page.locator('#chanKindCalha').check();
  assert.equal(await page.locator('#chanMode').inputValue(),'auto');
  assert.equal(await page.locator('#chanHeightBox').isVisible(),false);
  await page.locator('#chanRaster').selectOption('9941');await page.locator('#chanInterval').fill('10');
  await page.locator('#chanLimit').check();await page.locator('#chanReach').fill('20');
  const analyze=async()=>{await page.locator('#chanAnalyze').click();await page.waitForFunction(()=>!document.getElementById('chanAnalyze').disabled);};
  await analyze();
  assert.doesNotMatch(await page.locator('#chanStatus').textContent(),/Prévia pronta/);
  assert.equal(await page.locator('#chanCommit').isEnabled(),true);assert.equal(await page.evaluate(()=>__outputs().length),0);
  assert.equal(await page.locator('#chanChart svg').count(),1,'automatic failure keeps the real sampled profile visible');
  assert.equal(await page.locator('#chanLongitudinal').isVisible(),false);
  assert.equal(await page.locator('#chanDepthAlternative').isVisible(),true);
  const untouchedDepth=await page.locator('#chanHeight').inputValue();
  await page.locator('#chanDepthAlternative').click();
  assert.equal(await page.locator('#chanMode').inputValue(),'axisDepth');
  assert.equal(await page.locator('#chanHeight').inputValue(),untouchedDepth,'alternative must not invent a depth');
  assert.equal(await page.locator('#chanHeight').evaluate(e=>e===document.activeElement),true);
  assert.equal(await page.evaluate(()=>__outputs().length),0,'switching modes alone must not generate outputs');
  await page.locator('#chanMode').selectOption('depth');
  console.log('PASS automatic V without bank break rejected; new axis shortcut does not invent a height; legacy depth remains explicitly available');
  assert.equal(await page.locator('#chanHeightBox').isVisible(),true);
  assert.match(await page.locator('label[for="chanHeight"]').textContent(),/profundidade/i);
  await page.locator('#chanHeight').fill('2.5');
  await capture('modo-profundidade-1280x800','#chanHeight');await capture('modo-profundidade-desktop','#chanHeight',true);
  await analyze();
  assert.match(await page.locator('#chanStatus').textContent(),/Prévia pronta/);assert.equal(await page.locator('#chanCommit').isEnabled(),true);
  assert.equal(await page.evaluate(()=>__outputs().length),0);assert.equal(await page.evaluate(()=>S.undo.length),0);
  assert.equal(await page.evaluate(()=>S.prof===__profileRef&&JSON.stringify(S.prof)===__profileBefore),true,'review must not take over independent profile workspace');
  assert.equal(await page.locator('#chanChart svg').count(),1);
  assert.equal(await page.locator('#chanLongitudinal svg').count(),1);
  const longitudinal=await page.locator('#chanLongitudinal').evaluate(el=>{
   const points=role=>el.querySelector('[data-role="'+role+'"]').getAttribute('points').trim().split(/\s+/).map(p=>p.split(',').map(Number));
   return {floor:points('longitudinal-floor'),level:points('longitudinal-level')};
  });
  assert.equal(longitudinal.floor.length,5);assert.equal(longitudinal.level.length,5);
  assert.ok(Math.abs(longitudinal.floor[0][1]-longitudinal.floor.at(-1)[1])>10,'longitudinal floor is not a flat elevation');
  const plotGap=longitudinal.floor[0][1]-longitudinal.level[0][1];assert.ok(plotGap>0);
  for(let i=0;i<5;i++){
   near(longitudinal.floor[i][0],longitudinal.level[i][0]);
   assert.ok(Math.abs(longitudinal.floor[i][1]-longitudinal.level[i][1]-plotGap)<.06,'same local depth at every plotted station');
  }
  const stations=await page.locator('#chanSection option').evaluateAll(a=>a.map(o=>o.value));assert.equal(stations.length,5);
  await page.locator('#chanSection').selectOption(stations[0]);assert.match(await page.locator('#chanChart').textContent(),/102\.50/);
  await page.locator('#chanSection').selectOption(stations[4]);assert.match(await page.locator('#chanChart').textContent(),/106\.50/);
  for(const id of ['chanAnalyze','chanCommit']){
   const box=await page.locator('#'+id).boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=800,id+' accessible at 1280×800');
  }
  await capture('perfis-profundidade-1280x800','#chanLongitudinal');await capture('perfis-profundidade-desktop','#chanLongitudinal',true);
  if(process.env.QA_SCREENSHOT){await page.locator('#chanLongitudinal').scrollIntoViewIfNeeded();await page.waitForFunction(()=>getComputedStyle(document.getElementById('toast')).opacity==='0');await page.screenshot({path:path.resolve(process.env.QA_SCREENSHOT)});}
  assert.equal(await page.locator('#chanConfirm').count(),0);await page.locator('#chanCommit').click();
  assert.equal(await page.locator('#chanAPP').isVisible(),false,'depth result must not present an automatic APP shortcut');
  await page.locator('#chanClose').click();
  const first=await page.evaluate(()=>{
   const outputs=__outputs(),sections=outputs.find(L=>L.gtype==='line'),polygon=outputs.find(L=>L.gtype==='polygon'),saved=JSON.parse(JSON.stringify(projectData()));
   window.__depthLink=polygon?._channelLink?.id;
   return {names:outputs.map(L=>L.name),props:sections?.features.map(f=>f.props),poly:polygon?.features[0],fields:sections?.fields,
    link:polygon?._channelLink,undo:S.undo.length,geojson:polygon&&layerToGeoJSON(polygon),
    sourceIntact:JSON.stringify({geom:__axis.features[0].geom,props:__axis.features[0].props})===__axisOriginal&&__grid.z.every((v,i)=>v===__rasterBefore[i]),
    persisted:outputs.every(L=>JSON.stringify(saved.layers.find(s=>s.id===L.id).features)===JSON.stringify(L.features))};
  });
  assert.equal(first.names.length,2);assert.ok(first.names.every(n=>!/\bAPP\b/.test(n)));assert.ok(first.names.some(n=>/^Faixa/i.test(n)));
  assert.equal(first.props.length,5);assert.equal(first.poly.multi,true);assert.equal(first.link.version,2);assert.equal(first.link.entries.length,1);assert.equal(first.link.entries[0].options.mode,'depth');near(first.link.entries[0].options.height,2.5);
  assert.equal(first.poly._channelRecipeId,first.link.entries[0].id);
  assert.equal(first.sourceIntact,true);assert.equal(first.persisted,true);assert.equal(first.undo,1,'one atomic undo covers both generated layers');
  near(first.poly.props.PROF_M,2.5);assert.match(first.poly.props.STATUS,/não delimita leito regular/i);
  for(let i=0;i<first.props.length;i++){
   const p=first.props[i];near(p.PROG_M,i*10);near(p.Z_FUNDO,100+i);near(p.Z_EIXO,100+i);near(p.NIVEL_M,102.5+i);near(p.ALTURA_M,2.5);near(p.LARG_M,5);near(p.DESLOC_M,0);
   near(p.PROF_M,2.5);
   assert.match(p.MODO,/profundidade/i);assert.match(p.METODO,/profundidade|fundo.*altura|fundo.*profundidade/i);
  }
  assert.deepEqual(first.geojson.features[0].properties,first.poly.props);
  assert.ok(first.fields.some(f=>f.name==='Z_FUNDO'&&f.type==='N'));assert.ok(first.fields.some(f=>f.name==='NIVEL_M'&&f.type==='N'));
  console.log('PASS depth 2.5 m succeeds on sloping V: width 5 m, local levels 102.5…106.5 m, source untouched, Faixa naming and audited export/persistence');
  await page.evaluate(()=>{__axis.features[0].geom[1][0]=500050;drawLayer(__axis);refreshUI();});
  try{await page.waitForFunction(()=>{
   const rows=__outputs().filter(L=>L._channelLink?.id===__depthLink);
   return rows.length===2&&rows.every(L=>L._channelLink.entries.every(e=>e.state==='ready'))&&!GeoMineChannelLive.state().running&&rows.find(L=>L.gtype==='line').features.length===6;
  });}catch(error){console.error('LIVE DIAGNOSTIC',await page.evaluate(()=>({state:GeoMineChannelLive.state(),outputs:__outputs().map(L=>({name:L.name,count:L.features.length,link:L._channelLink,props:L.features[0]?.props})),guide:__axis.features[0].geom})));throw error;}
  const live=await page.evaluate(()=>({names:__outputs().map(L=>L.name),props:__outputs().find(L=>L.gtype==='line').features.map(f=>f.props),
   mode:__outputs().find(L=>L.gtype==='polygon')._channelLink.entries[0].options.mode}));
  assert.equal(live.mode,'depth');assert.ok(live.names.some(n=>/^Faixa/i.test(n)));near(live.props.at(-1).Z_FUNDO,105);near(live.props.at(-1).NIVEL_M,107.5);near(live.props.at(-1).LARG_M,5);
  const persisted=await page.evaluate(()=>{
   window.__savedDepth=JSON.parse(JSON.stringify(projectData()));const before=__outputs().map(L=>({id:L.id,features:JSON.stringify(L.features),fields:JSON.stringify(L.fields)}));
   loadProject(__savedDepth);__axis=S.layers.find(L=>L.name==='Guia de teste profundidade');__raster=S.rasters.find(r=>r.id===9941);
   return before.map(old=>{const L=S.layers.find(L=>L.id===old.id);return {same:JSON.stringify(L.features)===old.features&&JSON.stringify(L.fields)===old.fields,mode:L._channelLink.entries[0].options.mode};});
  });assert.ok(persisted.every(p=>p.same&&p.mode==='depth'));
  await page.evaluate(()=>{__axis.features[0].geom[1][0]=500060;drawLayer(__axis);refreshUI();});
  // The synthetic fixture has neither an external TIFF nor persisted LiDAR/TIN
  // provenance. The portable project does not retain its ad-hoc srcCRS; require
  // a safe refusal, then explicitly reattach the original test MDT before retry.
  await page.waitForFunction(()=>!GeoMineChannelLive.state().running&&__outputs().filter(L=>L._channelLink?.id===__depthLink).every(L=>L._channelLink.entries.every(e=>e.state==='stale')));
  const refused=await page.evaluate(()=>({message:__outputs()[0]._channelLink.entries[0].message,count:__outputs().find(L=>L.gtype==='line').features.length}));
  assert.match(refused.message,/CRS|referência|projeção|original|prévia/i);assert.equal(refused.count,6);
  console.log('PASS portable synthetic raster without source CRS is refused safely after reopen: '+refused.message);
  await page.evaluate(()=>{__raster.d=__grid;__raster.crs=S.workCRS;const b=S.rasters.find(r=>r.id===9942);b.d=__benchGrid;b.crs=S.workCRS;GeoMineChannelLive.retry();});
  try{await page.waitForFunction(()=>__outputs().filter(L=>L._channelLink?.id===__depthLink).every(L=>L._channelLink.entries.every(e=>e.state==='ready'))&&!GeoMineChannelLive.state().running&&__outputs().find(L=>L._channelLink?.id===__depthLink&&L.gtype==='line').features.length===7);}
  catch(error){console.error('RESTORED LIVE DIAGNOSTIC',await page.evaluate(()=>({state:GeoMineChannelLive.state(),outputs:__outputs().map(L=>({name:L.name,count:L.features.length,link:L._channelLink,props:L.features[0]?.props})),raster:{name:__raster.name,keys:Object.keys(__raster.d),native:__raster.d.native,resampled:__raster.d.resampled,fromProject:__raster.d.fromProject}})));throw error;}
  const restored=await page.evaluate(()=>__outputs().find(L=>L._channelLink?.id===__depthLink&&L.gtype==='line').features.at(-1).props);
  near(restored.Z_FUNDO,106);near(restored.NIVEL_M,108.5);near(restored.LARG_M,5);
  console.log('PASS linked depth mode recalculates after guide edit and survives project reopen with numeric fields and local depth semantics');
  await page.evaluate(()=>__open());await page.locator('#chanLayer').selectOption(String(await page.evaluate(()=>__axis.id)));
  await page.locator('#chanKindCalha').check();await page.locator('#chanMode').selectOption('auto');await page.locator('#chanRaster').selectOption('9942');await page.locator('#chanNewName').fill('Calha estimada — margens com quebra');await analyze();
  assert.match(await page.locator('#chanStatus').textContent(),/Prévia pronta/);assert.equal(await page.locator('#chanHeightBox').isVisible(),false);
  assert.equal(await page.evaluate(()=>__outputs().length),2);assert.equal(await page.locator('#chanConfirm').count(),0);await page.locator('#chanCommit').click();
  const auto=await page.evaluate(()=>__outputs().filter(L=>L._channelLink?.entries?.some(e=>e.options.mode==='auto')).map(L=>({name:L.name,props:L.features.map(f=>f.props)})));
  assert.equal(await page.evaluate(()=>__outputs().length),4,'explicit New keeps automatic and depth results side by side');
  assert.equal(auto.length,2);assert.ok(auto.some(L=>/^Calha/i.test(L.name)));assert.ok(auto.every(L=>!/\bAPP\b/.test(L.name)));
  assert.ok(auto.every(L=>L.props.every(p=>/quebra/i.test(p.MODO))));
  assert.deepEqual(errors,[]);console.log('PASS automatic bank-break workflow remains separate; no APP created and no browser errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
