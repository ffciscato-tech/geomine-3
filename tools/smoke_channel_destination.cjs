// Offline, isolated destination regression with a synthetic MDT and two axes.
// Never opens user projects or writes to a user-selected destination.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stage=path.resolve(__dirname,'..');let passed=0;
const pass=name=>{passed++;console.log('PASS '+name);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800},hasTouch:true}),errors=[],dialogs=[];
  let acceptConfirm=true;page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',async d=>{dialogs.push({type:d.type(),message:d.message()});acceptConfirm?await d.accept():await d.dismiss();});
  await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+path.resolve(process.env.APP_PATH||path.join(stage,'dist/GeoMine.html')));
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineChannelExtraction&&window.GeoMineChannelLive);
  await page.evaluate(()=>{
   GeoMineChannelLive.stop();S.setBase('Sem fundo');S.projectId='channel-destination-synthetic';S.workCRS='EPSG:31982';
   const nc=181,nr=81,cs=.5,xll=499989.75,yll=7399979.75,z=new Float32Array(nc*nr);
   for(let r=0;r<nr;r++)for(let c=0;c<nc;c++){const x=xll+(c+.5)*cs,y=yll+(nr-r-.5)*cs;z[r*nc+c]=100+.02*(x-500000)+Math.abs(y-7400000);}
   const grid={nc,nr,cs,csy:cs,xll,yll,z,zmin:99,zmax:123,native:true,resampled:1,srcCRS:S.workCRS};
   const raster={id:9936,name:'MDT sintético — destino compartilhado',crs:S.workCRS,visible:false,style:{mode:'hipso'},d:grid};S.rasters.push(raster);
   const axis=addLayer({name:'Eixos sintéticos A e B',gtype:'line',crs:S.workCRS,fields:[{name:'ID',type:'C'}],features:[{geom:[[500000,7400000],[500020,7400000]],props:{ID:'A'}},{geom:[[500040,7400000],[500060,7400000]],props:{ID:'B'}}]});
   window.__dest={grid,raster,axis,z:z.slice(),source:JSON.stringify(axis.features.map(f=>({geom:f.geom,props:f.props})))};
   window.__pair=id=>S.layers.filter(l=>l._channelLink?.id===(id||__dest.pair));
   window.__pairState=id=>JSON.stringify(__pair(id).map(l=>({id:l.id,name:l.name,features:l.features,fields:l.fields,link:l._channelLink,color:l.color,sym:l.sym,weight:l.weight,fill:l.fill,visible:l.visible,groupId:l.groupId})));
   window.__selectAxis=i=>{S.activeId=__dest.axis.id;ED.on=false;ED.sel=null;S.selFeat={layer:__dest.axis,layerId:__dest.axis.id,idx:i};GeoMineChannelExtraction.open();};
   __selectAxis(0);
  });
  const status=()=>page.locator('#chanStatus').textContent();
  const create=async()=>{await page.locator('#chanCommit').tap();await page.waitForFunction(()=>!document.getElementById('chanCommit').disabled);};
  const ok=async()=>assert.match(await status(),/criad|atualiz|adicion|resultado.*exist/i);
  // O destino é o nome da camada: o nome sugerido é o da camada em uso; outro nome cria outra camada.
  const select=async i=>{await page.evaluate(i=>__selectAxis(i),i);await page.locator('#chanScope').selectOption('feature');await page.locator('#chanRaster').selectOption('9936');await page.locator('#chanKindAgua').check();await page.locator('#chanMode').selectOption('axisDepth');};
  const target=async name=>page.locator('#chanNewName').fill(name),targetName=()=>page.locator('#chanNewName').inputValue();
  const setHeight=async h=>page.locator('#chanHeight').fill(String(h));
  const layerCount=()=>page.evaluate(()=>S.layers.length);
  const snapshot=()=>page.evaluate(()=>__pairState());
  await select(0);assert.match(await targetName(),/^Faixa por altura MDT — /,'first result suggests a free default name');
  await setHeight(2);await page.locator('#chanInterval').fill('5');await page.locator('#chanLimit').check();await page.locator('#chanReach').fill('20');await create();await ok();
  const first=await page.evaluate(()=>{const pair=S.layers.filter(l=>l._channelLink);__dest.pair=pair[0]._channelLink.id;return pair.map(l=>({id:l.id,type:l.gtype,name:l.name,link:l._channelLink,features:l.features}));});
  assert.equal(await layerCount(),3);assert.equal(first.length,2);assert.ok(first.every(l=>l.link.version===2&&l.link.entries.length===1));
  assert.ok(first.every(l=>l.features.every(f=>typeof f._channelRecipeId==='string')));assert.equal(await targetName(),first.find(l=>l.type==='polygon').name);
  const ids=first.map(l=>l.id).sort((a,b)=>a-b);assert.equal(dialogs.length,0);
  await page.evaluate(()=>{S.groups.push({id:9937,name:'Grupo QA',collapsed:false});for(const l of __pair()){l.name='Resultado QA '+l.gtype;l.color='#aa4488';l.sym.color='#aa4488';l.weight=4;l.fill=.31;l.sym.fill=.31;l.visible=false;l.groupId=9937;}__dest.style=JSON.stringify(__pair().map(l=>({id:l.id,name:l.name,color:l.color,sym:l.sym,weight:l.weight,fill:l.fill,visible:l.visible,groupId:l.groupId})));});
  await setHeight(3);await create();await ok();
  const updated=await page.evaluate(()=>({ids:__pair().map(l=>l.id),style:JSON.stringify(__pair().map(l=>({id:l.id,name:l.name,color:l.color,sym:l.sym,weight:l.weight,fill:l.fill,visible:l.visible,groupId:l.groupId}))),expected:__dest.style,entries:__pair().map(l=>l._channelLink.entries.length),heights:__pair().flatMap(l=>l.features.map(f=>f.props.ALT_EIXO))}));
  assert.equal(await layerCount(),3);assert.deepEqual(updated.ids.sort((a,b)=>a-b),ids);assert.equal(updated.style,updated.expected);assert.deepEqual(updated.entries,[1,1]);assert.ok(updated.heights.every(h=>h===3));
  pass('automatic destination creates the first pair, then changing height replaces only that axis with stable layer IDs and styling');
  await page.locator('#chanLive').uncheck();await setHeight(3.1);await create();await ok();
  assert.ok((await page.evaluate(()=>__pair().flatMap(l=>l._channelLink.entries.map(e=>e.state)))).every(s=>s==='detached'));
  await page.locator('#chanLive').check();await setHeight(3);await create();await ok();
  assert.equal(await layerCount(),3);assert.equal(dialogs.length,0);assert.ok((await page.evaluate(()=>__pair().flatMap(l=>l._channelLink.entries.map(e=>e.state)))).every(s=>s==='ready'));
  await page.locator('#chanLive').uncheck();await create();await ok();
  assert.ok((await page.evaluate(()=>__pair().flatMap(l=>l._channelLink.entries.map(e=>e.state)))).every(s=>s==='detached'),'turning live off alone must not be mistaken for a duplicate');
  await page.locator('#chanLive').check();await create();await ok();
  assert.ok((await page.evaluate(()=>__pair().flatMap(l=>l._channelLink.entries.map(e=>e.state)))).every(s=>s==='ready'),'turning live back on alone must reactivate the recipe');
  assert.equal(await layerCount(),3);assert.equal(dialogs.length,0);
  pass('static results retain destination recipes and can be regenerated or relinked without a false manual-edit confirmation');
  await select(1);await setHeight(2);await create();await ok();
  const appended=await page.evaluate(()=>{const poly=__pair().find(l=>l.gtype==='polygon');__dest.recipeA=poly.features.find(f=>f.props.EIXO===1)._channelRecipeId;__dest.recipeB=poly.features.find(f=>f.props.EIXO===2)._channelRecipeId;return {entries:__pair().map(l=>l._channelLink.entries.length),ids:__pair().map(l=>l.id),a:__dest.recipeA,b:__dest.recipeB,bShape:JSON.stringify(__pair().map(l=>l.features.filter(f=>f._channelRecipeId===__dest.recipeB)))};});
  assert.equal(await layerCount(),3);assert.deepEqual(appended.entries,[2,2]);assert.notEqual(appended.a,appended.b);assert.deepEqual(appended.ids.sort((a,b)=>a-b),ids);
  await select(0);await setHeight(2.5);await create();await ok();
  assert.equal(await page.evaluate(()=>JSON.stringify(__pair().map(l=>l.features.filter(f=>f._channelRecipeId===__dest.recipeB)))),appended.bShape);assert.equal(await layerCount(),3);assert.equal(dialogs.length,0);
  pass('another axis appends to the same pair; updating only A preserves every B feature and recipe');
  const original=await targetName();assert.equal(original,'Resultado QA polygon','the renamed layer in use stays the destination');
  const originalBeforeNew=await snapshot();await target('Faixa QA nova');await create();await ok();
  assert.equal(await layerCount(),5);assert.equal(await snapshot(),originalBeforeNew);
  assert.equal(await targetName(),'Faixa QA nova','after an explicit new name the new pair becomes the destination');
  assert.ok(await page.evaluate(()=>S.layers.some(l=>l.name==='Faixa QA nova')&&S.layers.some(l=>l.name==='Seções — Faixa QA nova')));
  pass('only an explicit new name creates an additional pair, leaving the existing pair untouched');
  const persisted=await page.evaluate(()=>JSON.parse(JSON.stringify(projectData())));
  await page.evaluate(data=>{const grid=__dest.grid;loadProject(data);__dest.axis=S.layers.find(l=>l.name==='Eixos sintéticos A e B');__dest.raster=S.rasters.find(r=>r.id===9936);__dest.raster.d=grid;GeoMineChannelLive.retry();__selectAxis(0);},persisted);
  await page.locator('#chanScope').selectOption('feature');await page.locator('#chanRaster').selectOption('9936');await page.locator('#chanKindAgua').check();await page.locator('#chanMode').selectOption('axisDepth');await target(original);
  assert.equal(await layerCount(),5);assert.deepEqual(await page.locator('#chanNameList option').evaluateAll(o=>o.map(x=>x.value).sort()),['Faixa QA nova','Resultado QA polygon']);
  assert.match(await page.locator('#chanDestinationHint').textContent(),/Mesmo nome/);
  assert.deepEqual(await page.evaluate(()=>__pair().map(l=>l.id).sort((a,b)=>a-b)),ids);
  pass('save and reopen preserve both destination pairs and keep the original pair reachable by its name');
  // Manual edits belonging to B and unrelated untagged features must not be
  // erased merely because A is regenerated in the same destination layers.
  await page.evaluate(()=>{
   for(const l of __pair()){
    const f=l.features.find(f=>f._channelRecipeId===__dest.recipeB);f.props.QA_NOTE='B manual';
    if(l.gtype==='polygon'){const r=f.geom[0];r[1][0]+=.1;l.features.push({geom:[[[500002,7400010],[500003,7400010],[500003,7400011],[500002,7400010]]],multi:true,props:{QA_NOTE:'independente'}});}
    else l.features.push({geom:[[500002,7400010],[500003,7400010]],props:{QA_NOTE:'independente'}});
    drawLayer(l);
   }
  });
  await page.waitForFunction(()=>__pair().every(l=>l._channelLink.entries.find(e=>e.id===__dest.recipeB)?.state==='detached'));
  await page.evaluate(()=>{__dest.manualB=JSON.stringify(__pair().map(l=>l.features.filter(f=>f._channelRecipeId===__dest.recipeB||!f._channelRecipeId)));});
  const priorDialogs=dialogs.length;await select(0);await target(original);await setHeight(2.7);await create();await ok();
  assert.equal(dialogs.length,priorDialogs);assert.equal(await page.evaluate(()=>JSON.stringify(__pair().map(l=>l.features.filter(f=>f._channelRecipeId===__dest.recipeB||!f._channelRecipeId)))),await page.evaluate(()=>__dest.manualB));
  pass('regenerating A does not prompt for or overwrite manually edited B or independent manual features');
  await select(1);await target(original);await setHeight(3.2);const manualBefore=await snapshot(),undoBefore=await page.evaluate(()=>S.undo.length);
  acceptConfirm=false;await create();assert.equal(dialogs.length,priorDialogs+1);assert.match(dialogs.at(-1).message,/manual|alter|substitu|regener/i);assert.equal(await snapshot(),manualBefore);assert.equal(await page.evaluate(()=>S.undo.length),undoBefore);
  acceptConfirm=true;await create();await ok();assert.equal(dialogs.length,priorDialogs+2);assert.equal(await layerCount(),5);assert.notEqual(await snapshot(),manualBefore);
  const afterManual=await page.evaluate(()=>__pair().map(l=>l.features.filter(f=>!f._channelRecipeId)));assert.ok(afterManual.every(f=>f.length===1&&f[0].props.QA_NOTE==='independente'));
  await page.evaluate(()=>{GeoMineChannelLive.stop();doUndo();});assert.equal(await snapshot(),manualBefore);
  pass('only regenerating the manually edited axis asks confirmation; cancel is inert and one undo restores both layers and recipe metadata');
  await select(0);await target(original);await setHeight(3.4);
  const beforeFailure=await snapshot(),undoFailure=await page.evaluate(()=>S.undo.length);
  await page.evaluate(()=>{__dest.drawOriginal=window.drawLayer;const ids=__pair().map(l=>l.id),seen=new Set();window.drawLayer=function(l){if(ids.includes(l?.id)&&!seen.has(l.id)){seen.add(l.id);if(seen.size===2)throw Error('Falha injetada na segunda camada');}return __dest.drawOriginal.apply(this,arguments);};});
  await create();await page.evaluate(()=>{window.drawLayer=__dest.drawOriginal;});assert.match(await status(),/Falha injetada/);assert.equal(await snapshot(),beforeFailure);assert.equal(await page.evaluate(()=>S.undo.length),undoFailure);assert.equal(await layerCount(),5);
  pass('a failure while drawing the second layer rolls back both layers, all recipes and the undo stack');
  await page.evaluate(()=>{__pair().find(l=>l.gtype==='polygon').locked=true;});await setHeight(3.5);const lockedBefore=await snapshot();await create();assert.match(await status(),/bloque|permiss|edit/i);assert.equal(await snapshot(),lockedBefore);assert.equal(await layerCount(),5);
  await page.evaluate(()=>{__pair().find(l=>l.gtype==='polygon').locked=false;__dest.permissionOriginal=window.collabCanEditLayer;const id=__pair().find(l=>l.gtype==='polygon').id;window.collabCanEditLayer=function(l){return l?.id===id?false:__dest.permissionOriginal.apply(this,arguments);};});
  await setHeight(3.6);const permissionsBefore=await snapshot();await create();assert.match(await status(),/bloque|permiss|edit|reserv/i);assert.equal(await snapshot(),permissionsBefore);assert.equal(await layerCount(),5);await page.evaluate(()=>{window.collabCanEditLayer=__dest.permissionOriginal;});
  pass('locked or permission-denied destinations cannot be overwritten or silently replaced with new layers');
  assert.equal(await page.evaluate(()=>JSON.stringify(__dest.axis.features.map(f=>({geom:f.geom,props:f.props})))===__dest.source&&__dest.z.every((v,i)=>v===__dest.grid.z[i])),true);
  assert.deepEqual(errors,[]);console.log(`channel destination browser: ${passed}/${passed} PASS`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
