// Full offline app, real UI/worker/geometry/serialization; fixture layers stay in this browser only.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:950}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
  await page.goto('file://'+path.resolve(process.env.APP_PATH||path.join(__dirname,'../dist/GeoMine.html')));
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineRiparianWidth);
  const status=()=>page.locator('#appRipStatus').textContent();
  const ready=()=>page.waitForFunction(()=>!document.getElementById('appRipGenerate').disabled);
  async function confirm(){
   await page.locator('#appRipRegime').selectOption('perene');
   await page.locator('#appRipConfirm').check();
  }
  async function generate(){
   await page.locator('#appRipGenerate').click();await ready();
   assert.match(await status(),/^APP criada:/);
  }
  await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31982';
   const x=500000,y=7400000;
   window.__autoRect=(a,b,w,h)=>[[x+a,y+b],[x+a+w,y+b],[x+a+w,y+b+h],[x+a,y+b+h],[x+a,y+b]];
   window.__autoRing=points=>points.map(p=>[x+p[0],y+p[1]]);
   window.__sourceJSON=L=>JSON.stringify({features:L.features,fields:L.fields,crs:L.crs});
   window.__openAuto=L=>{ED.sel=null;S.selFeat=null;S.activeId=L.id;GeoMineRiparianAPP.open();};
   window.__outLayers=()=>S.layers.filter(L=>L.name.startsWith('APP — ')||L.name.startsWith('Seções de largura — '));
   window.__waterArea=(app,source)=>{
    const engine=GeoMineRiparianAPP.engine(polygonClipping),mp=polygonClipping.union(...app.features.map(f=>polygonClipping.xor(...f.geom.map(r=>[[r]])))),water=polygonClipping.union(...source.features.map(f=>f.multi?polygonClipping.xor(...f.geom.map(r=>[[r]])):[[f.geom]]));
    return engine.area(polygonClipping.intersection(mp,water));
   };
   window.__rivers=addLayer({name:'Calhas automáticas',gtype:'polygon',crs:S.workCRS,
    fields:[{name:'ID',type:'N'}],features:[
     {geom:__autoRect(0,0,100,5),props:{ID:1}},
     {geom:__autoRect(0,200,100,12),props:{ID:2}}
    ]});
   window.__riversBefore=__sourceJSON(__rivers);S.undo=[];
   pickFeature(__rivers,0);GeoMineRiparianAPP.open();
  });

  // A selected polygon defaults to automatic measurement and selected-feature scope.
  assert.equal(await page.locator('#appRipMode').inputValue(),'auto');
  assert.equal(await page.locator('#appRipScope').inputValue(),'feature');
  assert.equal(await page.locator('#appRipManual').isVisible(),false);
  assert.equal(await page.locator('#appRipSampling').isVisible(),true);
  assert.match(await page.locator('#appRipSummary').textContent(),/1 polígono/);
  await confirm();await page.waitForFunction(()=>getComputedStyle(document.getElementById('toast')).opacity==='0');
  await page.screenshot({path:path.resolve(__dirname,'../dist/app-auto-desktop.png')});
  await page.setViewportSize({width:1024,height:640});
  await page.locator('#appRipModal .modal-b').evaluate(e=>e.scrollTop=e.scrollHeight);
  const autoButton=await page.locator('#appRipGenerate').boundingBox();
  assert.ok(autoButton.y>=0&&autoButton.y+autoButton.height<=640);
  await page.screenshot({path:path.resolve(__dirname,'../dist/app-auto-tablet.png')});
  await page.setViewportSize({width:1400,height:950});await page.locator('#appRipModal .modal-b').evaluate(e=>e.scrollTop=0);
  await generate();
  const singleStatus=await status();
  const single=await page.evaluate(()=>{
   const app=activeLayer(),sections=__outLayers().find(L=>L.gtype==='line'),pc=polygonClipping,
     engine=GeoMineRiparianAPP.engine(pc),mp=pc.xor(...app.features[0].geom.map(r=>[[r]])),coords=mp.flat(2),saved=projectData();
   const sectionLengths=sections.features.map(f=>Math.hypot(f.geom[1][0]-f.geom[0][0],f.geom[1][1]-f.geom[0][1]));
   return {n:S.layers.length,undo:S.undo.length,same:__sourceJSON(__rivers)===__riversBefore,
    props:app.features.map(f=>f.props),sections:sections.features.map(f=>f.props),sectionLengths,
    bounds:[Math.min(...coords.map(p=>p[0]))-500000,Math.max(...coords.map(p=>p[0]))-500000,Math.min(...coords.map(p=>p[1]))-7400000,Math.max(...coords.map(p=>p[1]))-7400000],
    area:engine.area(mp),water:engine.area(pc.intersection(mp,[[__rivers.features[0].geom]])),
    bankStrip:engine.area(pc.intersection(mp,[[__autoRect(10,5,80,29.999)]])),
    otherWater:engine.area(pc.intersection(mp,[[__rivers.features[1].geom]])),
    serialized:[app,sections].every(L=>JSON.stringify(saved.layers.find(l=>l.id===L.id).features)===JSON.stringify(L.features))};
  });
  assert.equal(single.n,3);assert.equal(single.undo,2);assert.equal(single.same,true);assert.equal(single.serialized,true);
  assert.deepEqual(single.props.map(p=>[p.TRECHOS,p.N_TRECHOS,p.APP_M,p.APP_CLASSES,p.N_LARG_MEDIA]),[['1',1,30,'30 m',0]]);assert.ok(!('TRECHO' in single.props[0]));
  assert.match(singleStatus,/^APP criada: 1 área\(s\) contínua\(s\), .* ha — faixas sobrepostas fundidas.*Seções de largura criadas/);assert.doesNotMatch(singleStatus,/CONFERIR|SEM APP/);
  assert.ok(Math.abs(single.props[0].AREA_M2-single.area)<.01);assert.ok(Math.abs(single.area-(210*30+Math.PI*900))<3,'both bank strips joined around the ends, minus the water');
  assert.equal(single.props[0].LARG_MIN,5);assert.equal(single.props[0].LARG_MAX,5);assert.equal(single.props[0].PASSO_M,5);
  assert.equal(single.props[0].N_SECOES,single.sections.length);assert.ok(single.sections.length>=40);
  assert.ok(single.sections.every(s=>s.LARG_M===5&&s.APP_M===30&&s.TRECHO===1&&s.AVISO));
  assert.ok(single.sectionLengths.every(n=>Math.abs(n-5)<1e-6));
  assert.ok(Math.abs(single.bounds[2]+30)<.02);assert.ok(Math.abs(single.bounds[3]-35)<.02,'30 m starts at the 5 m bank, not at the centerline');
  assert.ok(Math.abs(single.bankStrip-80*29.999)<.02);assert.equal(single.water,0);assert.equal(single.otherWater,0);
  assert.match(single.props[0].METODO,/largura local/);assert.match(single.props[0].STATUS,/conferir seções/);
  const undo=await page.evaluate(()=>{doUndo();const afterOne=S.layers.length;doUndo();return {afterOne,afterTwo:S.layers.length,same:__sourceJSON(__rivers)===__riversBefore};});
  assert.deepEqual(undo,{afterOne:2,afterTwo:1,same:true});

  // Disabling the editor leaves ED.sel behind; a later map selection must win.
  const selectionAfterEditing=await page.evaluate(()=>{
   edLigar(true,true);edSelecionar({L:__rivers,idx:0,f:__rivers.features[0]},true);
   edLigar(false);pickFeature(__rivers,1);GeoMineRiparianAPP.open();
   const rows=GeoMineRiparianAPP.validate(__rivers,{mode:'auto',step:5,scope:'feature',confirmed:true,regime:'perene',context:'general'});
   return {editorOn:ED.on,retainedEditorIndex:ED.sel.idx,mapIndex:S.selFeat.idx,indices:rows.map(r=>r.index)};
  });
  assert.deepEqual(selectionAfterEditing,{editorOn:false,retainedEditorIndex:0,mapIndex:1,indices:[2]});
  assert.equal(await page.locator('#appRipScope').inputValue(),'feature');await confirm();await generate();
  const secondPolygon=await page.evaluate(()=>({indices:activeLayer().features.map(f=>f.props.TRECHOS),classes:activeLayer().features.map(f=>f.props.APP_M+'|'+f.props.APP_CLASSES),same:__sourceJSON(__rivers)===__riversBefore}));
  assert.deepEqual(secondPolygon,{indices:['2'],classes:['50|50 m'],same:true});
  await page.evaluate(()=>{doUndo();doUndo();});

  // Explicit whole-layer scope overrides both the selected polygon and attribute filter.
  await page.evaluate(()=>{__rivers.attrFilter={field:'ID',op:'eq',value:1};pickFeature(__rivers,0);GeoMineRiparianAPP.open();});
  await page.locator('#appRipScope').selectOption('all');
  assert.match(await page.locator('#appRipSummary').textContent(),/2 polígono/);
  await confirm();await generate();
  const entire=await page.evaluate(()=>{const app=activeLayer(),sections=__outLayers().find(L=>L.gtype==='line');return {
   n:S.layers.length,indices:app.features.map(f=>f.props.TRECHOS+'|'+f.props.N_TRECHOS).sort(),classes:app.features.map(f=>f.props.APP_M).sort((a,b)=>a-b),
   appClasses:app.features.map(f=>f.props.APP_CLASSES).sort(),
   scope:app.features.map(f=>f.props.ESCOPO),sectionIndices:[...new Set(sections.features.map(f=>f.props.TRECHO))].sort(),
   sectionCount:sections.features.length,declaredSections:app.features.reduce((n,f)=>n+f.props.N_SECOES,0),
   water:__waterArea(app,__rivers),same:__sourceJSON(__rivers)===__riversBefore};});
  assert.equal(entire.n,3);assert.deepEqual(entire.indices,['1|1','2|1']);assert.deepEqual(entire.classes,[30,50]);assert.deepEqual(entire.appClasses,['30 m','50 m']);
  assert.deepEqual(entire.scope,['todas','todas']);assert.deepEqual(entire.sectionIndices,[1,2]);assert.equal(entire.sectionCount,entire.declaredSections);assert.equal(entire.water,0);assert.equal(entire.same,true);
  await page.evaluate(()=>{doUndo();doUndo();delete __rivers.attrFilter;});

  // One continuous polygon has genuinely different local classes (8 m -> 12 m).
  await page.evaluate(()=>{
   window.__variable=addLayer({name:'Calha variável 8 a 12',gtype:'polygon',crs:S.workCRS,fields:[],features:[
    {geom:__autoRing([[0,0],[300,0],[300,12],[200,12],[100,8],[0,8],[0,0]]),props:{}}
   ]});window.__variableBefore=__sourceJSON(__variable);window.__variableCount=S.layers.length;S.undo=[];__openAuto(__variable);
  });
  assert.equal(await page.locator('#appRipMode').inputValue(),'auto');assert.equal(await page.locator('#appRipScope').inputValue(),'visible');
  await confirm();await generate();
  const varying=await page.evaluate(()=>{
   const app=activeLayer(),sections=__outLayers().find(L=>L.gtype==='line'),engine=GeoMineRiparianAPP.engine(polygonClipping),
    mp=polygonClipping.union(...app.features.map(f=>polygonClipping.xor(...f.geom.map(r=>[[r]])))),saved=projectData();
   window.__variableOutputs=[app,sections].map(L=>({id:L.id,name:L.name,features:JSON.stringify(L.features)}));
   return {added:S.layers.length-__variableCount,props:app.features.map(f=>[f.props.TRECHOS,f.props.N_TRECHOS,f.props.APP_M,f.props.APP_CLASSES,f.props.N_LARG_MEDIA]),
    range:app.features.map(f=>[f.props.LARG_MIN,f.props.LARG_MAX]),same:__sourceJSON(__variable)===__variableBefore,
    widths:sections.features.map(f=>({width:f.props.LARG_M,app:f.props.APP_M,index:f.props.TRECHO})),sectionCount:sections.features.length,
    declaredSections:app.features.reduce((n,f)=>n+f.props.N_SECOES,0),water:__waterArea(app,__variable),
    declaredArea:app.features.reduce((t,f)=>t+f.props.AREA_M2,0),area:engine.area(mp),
    narrowBeyond:engine.area(polygonClipping.intersection(mp,[[__autoRect(40,38.5,20,.5)]])),
    narrowInside:engine.area(polygonClipping.intersection(mp,[[__autoRect(40,8,20,29.99)]])),
    wideInside:engine.area(polygonClipping.intersection(mp,[[__autoRect(250,12,20,49.99)]])),
    serialized:[app,sections].every(L=>JSON.stringify(saved.layers.find(l=>l.id===L.id).features)===JSON.stringify(L.features))};
  });
  // The overlapping 30 m and 50 m strips of the same channel are fused into one area that carries both classes, counted once.
  assert.equal(varying.added,2);assert.deepEqual(varying.props,[['1',1,50,'30/50 m',0]]);
  assert.ok(Math.abs(varying.declaredArea-varying.area)<.01);
  assert.equal(varying.same,true);assert.equal(varying.serialized,true);assert.equal(varying.water,0);
  assert.equal(varying.sectionCount,varying.declaredSections);assert.ok(varying.widths.some(s=>s.width===8&&s.app===30));assert.ok(varying.widths.some(s=>s.width===12&&s.app===50));
  assert.ok(varying.widths.every(s=>s.app===(s.width<10?30:50)&&s.index===1));
  assert.deepEqual(varying.range,[[Math.min(...varying.widths.map(s=>s.width)),Math.max(...varying.widths.map(s=>s.width))]]);assert.deepEqual(varying.range,[[8,12]]);
  assert.equal(varying.narrowBeyond,0);assert.ok(Math.abs(varying.narrowInside-20*29.99)<.02);assert.ok(Math.abs(varying.wideInside-20*49.99)<.02);

  // Both newly created layers and their measurement attributes survive project reload.
  const reloaded=await page.evaluate(async()=>{
   const before=__variableOutputs,d=projectData(),sourceId=__variable.id;await loadProject(d);
   window.__variable=S.layers.find(L=>L.id===sourceId);
   return {outputs:before.map(b=>{const L=S.layers.find(l=>l.id===b.id);return !!L&&L.name===b.name&&JSON.stringify(L.features)===b.features;}),same:__sourceJSON(__variable)===__variableBefore};
  });assert.deepEqual(reloaded.outputs,[true,true]);assert.equal(reloaded.same,true);

  // A good first feature plus an island channel that cannot be measured section by section: the island refusal no longer
  // drops the whole run. Feature 1 keeps its measured APP; feature 2 gets APP by its average width (2*area/perimeter =
  // 2*2800/320 = 17,5 m -> 50 m), flagged for review, with no sections. The island inside the channel is APP, not water
  // (it is a continuous area of its own, so trecho 2 may span more than one APP feature).
  await page.evaluate(()=>{
   window.__bad=addLayer({name:'Calha com ilha',gtype:'polygon',crs:S.workCRS,fields:[],features:[
    {geom:__autoRect(500,0,100,5),props:{}},
    {geom:[__autoRect(500,200,100,30),__autoRect(540,210,20,10)],multi:true,props:{}}
   ]});window.__badBefore=__sourceJSON(__bad);window.__badCount=S.layers.length;S.undo=[];__openAuto(__bad);
  });
  await page.locator('#appRipScope').selectOption('all');await confirm();await generate();
  const islandStatus=await status();
  assert.match(islandStatus,/CONFERIR: 1 calha\(s\) sem medição seção a seção receberam APP pela LARGURA MÉDIA — feição 2 \(17,5 m → 50 m\)\./);assert.doesNotMatch(islandStatus,/SEM APP/);
  const island=await page.evaluate(()=>{
   const pc=polygonClipping,engine=GeoMineRiparianAPP.engine(pc),app=activeLayer(),sections=__outLayers().find(L=>L.gtype==='line');
   const of=t=>app.features.filter(f=>f.props.TRECHOS===t),geom=fs=>pc.union(...fs.map(f=>pc.xor(...f.geom.map(r=>[[r]])))),row=p=>JSON.stringify([p.N_TRECHOS,p.APP_M,p.APP_CLASSES,p.N_LARG_MEDIA,p.N_SECOES>0,p.LARG_MIN,p.LARG_MAX]);
   const direct=GeoMineRiparianAPP.engine(pc,GeoMineRiparianWidth.engine(),GeoMineRiparianAPP.federalWidth).run({polygon:true,automatic:true,step:5,rows:__bad.features.map((f,i)=>({index:i+1,rings:f.multi?f.geom:[f.geom]}))});
   return {added:S.layers.length-__badCount,undo:S.undo.length,same:__sourceJSON(__bad)===__badBefore,n:app.features.length,trechos:app.features.map(f=>f.props.TRECHOS).sort(),
    first:of('1').map(f=>row(f.props)),second:[...new Set(of('2').map(f=>row(f.props)))],
    sectionCount:sections.features.length,declaredSections:app.features.reduce((n,f)=>n+f.props.N_SECOES,0),sectionIndices:[...new Set(sections.features.map(f=>f.props.TRECHO))],
    area:engine.area(geom(of('2'))),declared:of('2').reduce((t,f)=>t+f.props.AREA_M2,0),islandApp:engine.area(pc.intersection(geom(of('2')),[[__autoRect(540,210,20,10)]])),
    water:__waterArea(app,__bad),falhas:direct.falhas.map(f=>({index:f.index,ilha:/ilhas|furos/.test(f.motivo),estimada:f.estimada}))};
  });
  assert.match(islandStatus,new RegExp('^APP criada: '+island.n+' área\\(s\\) contínua\\(s\\)'));assert.equal(island.trechos[0],'1');assert.ok(island.trechos.slice(1).every(t=>t==='2'));
  assert.deepEqual(island.first,[JSON.stringify([1,30,'30 m',0,true,5,5])]);assert.deepEqual(island.second,[JSON.stringify([1,50,'50 m',1,false,17.5,17.5])]);
  assert.deepEqual(island.falhas,[{index:2,ilha:true,estimada:{largura:17.5,app:50}}]);
  assert.equal(island.sectionCount,island.declaredSections);assert.deepEqual(island.sectionIndices,[1]);
  assert.equal(island.water,0);assert.ok(Math.abs(island.area-island.declared)<.01);
  assert.ok(Math.abs(island.islandApp-200)<.01,'island inside the estimated channel lost its APP: '+island.islandApp);assert.ok(Math.abs(island.area-(260*50+Math.PI*2500+200))<3,'estimated island-channel APP area '+island.area);
  assert.equal(island.added,2);assert.equal(island.undo,2);assert.equal(island.same,true);
  assert.equal(await page.locator('#appRipCancel').isVisible(),false);
  assert.deepEqual(await page.evaluate(()=>{doUndo();doUndo();return {count:S.layers.length-__badCount,same:__sourceJSON(__bad)===__badBefore};}),{count:0,same:true});

  // Real worker cancellation on a long simple channel leaves both outputs absent.
  await page.evaluate(()=>{
   window.__long=addLayer({name:'Calha para cancelamento',gtype:'polygon',crs:S.workCRS,fields:[],features:[{geom:__autoRect(0,500,9000,5),props:{}}]});
   window.__longBefore=__sourceJSON(__long);window.__longCount=S.layers.length;S.undo=[];__openAuto(__long);
  });await confirm();await page.locator('#appRipGenerate').click();await page.locator('#appRipCancel').click();await ready();
  assert.match(await status(),/cancelado/);
  const cancelled=await page.evaluate(()=>({same:__sourceJSON(__long)===__longBefore,added:S.layers.length-__longCount,undo:S.undo.length}));
  assert.deepEqual(cancelled,{same:true,added:0,undo:0});

  // Escape must stop the worker, not hide a still-running operation behind the modal.
  await page.evaluate(()=>{__openAuto(__long);});await confirm();
  await page.locator('#appRipGenerate').click();await page.keyboard.press('Escape');await ready();
  assert.match(await status(),/cancelado/);assert.equal(await page.locator('#appRipModal').isVisible(),true);
  assert.equal(await page.locator('#appRipCancel').isVisible(),false);
  const escaped=await page.evaluate(()=>({same:__sourceJSON(__long)===__longBefore,added:S.layers.length-__longCount,undo:S.undo.length}));
  assert.deepEqual(escaped,{same:true,added:0,undo:0});

  // addLayer can throw after inserting its layer. Both outputs must roll back together.
  await page.evaluate(()=>{__openAuto(__variable);});await confirm();
  const rollback=await page.evaluate(async()=>{
   const ids=S.layers.map(L=>L.id),stack=JSON.stringify(S.stack),active=S.activeId,undo=S.undo.length,
     originalAdd=window.addLayer;
   window.addLayer=function(spec){const L=originalAdd(spec);if(spec.name.startsWith('APP — '))throw Error('Falha simulada após inserir APP');return L;};
   try{await GeoMineRiparianAPP.generate();}finally{window.addLayer=originalAdd;}
   return {sameLayers:JSON.stringify(S.layers.map(L=>L.id))===JSON.stringify(ids),sameStack:JSON.stringify(S.stack)===stack,
    sameActive:S.activeId===active,undoAdded:S.undo.length-undo,sameSource:__sourceJSON(__variable)===__variableBefore};
  });
  assert.match(await status(),/Falha simulada após inserir APP/);
  assert.deepEqual(rollback,{sameLayers:true,sameStack:true,sameActive:true,undoAdded:0,sameSource:true});

  // The source snapshot, not only its array/object identity, must remain current.
  await page.evaluate(()=>{__openAuto(__variable);});await confirm();
  const stale=await page.evaluate(async()=>{
   const before=S.layers.length,undo=S.undo.length,pending=GeoMineRiparianAPP.generate();
   __variable.features[0].props.changedDuringCalculation=true;
   await pending;delete __variable.features[0].props.changedDuringCalculation;
   return {added:S.layers.length-before,undoAdded:S.undo.length-undo,same:__sourceJSON(__variable)===__variableBefore};
  });
  assert.match(await status(),/mudaram/);assert.deepEqual(stale,{added:0,undoAdded:0,same:true});
  assert.equal(await page.locator('#appRipGenerate').isEnabled(),true);assert.equal(await page.locator('#appRipCancel').isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS automatic polygon/whole-layer UI scopes, selection after editor disabled, 5 m -> 30 m from banks, water exclusion, variable 8 -> 12 m classes fused into one 30/50 m area, TRECHOS/N_TRECHOS/APP_CLASSES/N_LARG_MEDIA, measured sections, untouched originals, serialization/reload, two-layer undo, island channel by average width (island kept as APP), post-insertion rollback, real-worker button/Escape cancellation and stale-input rejection');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
