// Isolated full-application regression of linked channel editing and persistence.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:950}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
  await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'));
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineChannelLive);
  await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31982';S.projectId='channel-live-test';
   const nc=241,nr=121,cs=.5,xll=499989.75,yll=7399969.75,z=new Float32Array(nc*nr);
   for(let r=0;r<nr;r++)for(let c=0;c<nc;c++)z[r*nc+c]=100+.01*(xll+(c+.5)*cs-500000)+Math.abs(yll+(nr-r-.5)*cs-7400000);
   window.__grid={nc,nr,cs,csy:cs,xll,yll,z,zmin:100,zmax:130,native:true,resampled:1,srcCRS:S.workCRS};
   window.__raster={id:942,name:'MDT para edição vinculada',crs:S.workCRS,visible:false,style:{mode:'hipso'},d:__grid};S.rasters.push(__raster);
   window.__axis=addLayer({name:'Guia dinâmica',gtype:'line',crs:S.workCRS,fields:[{name:'ID',type:'N'}],features:[{geom:[[500000,7400000],[500040,7400000]],props:{ID:1}}]});
   S.activeId=__axis.id;GeoMineChannelExtraction.open();
   window.__linked=()=>S.layers.filter(L=>L._channelLink).sort((a,b)=>(a._channelLink.role==='sections'?0:1)-(b._channelLink.role==='sections'?0:1));
   window.__shape=()=>JSON.stringify(__linked().map(L=>L.features.map(f=>f.geom)));
   window.__state=()=>__linked()[0]._channelLink.state;
   window.__move=x=>{const f=__axis.features[0];undoPush({t:'geom',L:__axis,f,geom:JSON.parse(JSON.stringify(f.geom)),multi:!!f.multi});f.geom[1][0]=x;drawLayer(__axis);refreshUI();};
  });
  await page.locator('#chanRaster').selectOption('942');await page.locator('#chanKindAgua').check();await page.locator('#chanMode').selectOption('depth');
  await page.locator('#chanHeight').fill('2.5');await page.locator('#chanInterval').fill('10');await page.locator('#chanReach').fill('20');
  assert.equal(await page.locator('#chanLive').isChecked(),true);
  await page.locator('#chanAnalyze').click();await page.waitForFunction(()=>!document.getElementById('chanAnalyze').disabled);
  assert.match(await page.locator('#chanStatus').textContent(),/Prévia pronta/);
  assert.equal(await page.locator('#chanConfirm').count(),0);await page.locator('#chanCommit').click();await page.locator('#chanClose').click();
  // Keep this suite as a genuine legacy-v1 regression; v2 is covered separately.
  await page.evaluate(()=>{for(const L of S.layers.filter(L=>L._channelLink?.version===2)){const r=L._channelLink.entries[0];if(L._channelLink.entries.length!==1)throw Error('Legacy fixture needs one axis');L._channelLink={...r,resultSignature:GeoMineChannelLive.signature(L)};}});
  await page.waitForTimeout(600);
  const initial=await page.evaluate(()=>{
   S.groups.push({id:123,name:'Grupo a preservar',collapsed:false});__linked()[1].color='#cc4455';__linked()[1].sym.color='#cc4455';__linked()[1].visible=false;__linked()[1].groupId=123;
   return {state:__state(),shape:__shape(),ids:__linked().map(L=>L.id),keys:__linked()[0]._channelLink.axisKeys,props:__axis.features[0].props,source:__axis.features[0].geom,
    options:__linked().map(L=>L._channelLink.options),sections:__linked()[0].features.map(f=>f.props)};
  });assert.equal(initial.state,'ready');assert.equal(initial.keys.length,1);assert.deepEqual(initial.props,{ID:1});
  assert.ok(initial.options.every(o=>o.mode==='depth'&&o.height===2.5));
  assert.ok(initial.sections.every(p=>Math.abs((p.NIVEL_M-p.Z_FUNDO)-2.5)<1e-4));
  assert.ok(Math.max(...initial.sections.map(p=>p.NIVEL_M))-Math.min(...initial.sections.map(p=>p.NIVEL_M))>.35,'depth must follow the longitudinal bed, not a single water elevation');
  await page.evaluate(()=>__move(500050));
  try{await page.waitForFunction(()=>__state()==='ready'&&!GeoMineChannelLive.state().running&&__linked()[0].features.length===6);}
  catch(e){console.error(await page.evaluate(()=>({live:GeoMineChannelLive.state(),layers:__linked().map(L=>({name:L.name,count:L.features.length,props:L.features[0].props})),log:document.body.innerText.slice(-4500)})));throw e;}
  const changed=await page.evaluate(()=>({shape:__shape(),ids:__linked().map(L=>L.id),style:[__linked()[1].color,__linked()[1].sym.color,__linked()[1].visible,__linked()[1].groupId],source:__axis.features[0].geom,
   status:__linked().flatMap(L=>L.features.map(f=>f.props.STATUS)),options:__linked().map(L=>L._channelLink.options)}));
  assert.notEqual(changed.shape,initial.shape);assert.deepEqual(changed.ids,initial.ids);assert.deepEqual(changed.style,['#cc4455','#cc4455',false,123]);assert.equal(changed.source[1][0],500050);
  assert.ok(changed.status.every(s=>s==='Faixa por profundidade estimada — não delimita leito regular nem certifica cheia'),'ready depth status must not claim an estimated channel');
  assert.ok(changed.options.every(o=>o.mode==='depth'&&o.height===2.5));
  await page.evaluate(()=>doUndo());await page.waitForFunction(()=>__state()==='ready'&&!GeoMineChannelLive.state().running&&__linked()[0].features.length===5);
  assert.equal(await page.evaluate(()=>__shape()),initial.shape);
  console.log('PASS linked vertex edit and undo update both existing layers, preserve style/visibility/group and source geometry');
  await page.evaluate(()=>{document.dispatchEvent(new PointerEvent('pointerdown'));__move(500060);});
  await page.waitForTimeout(900);
  const held=await page.evaluate(()=>({state:__state(),shape:__shape(),snapshot:projectData().layers.filter(L=>L._channelLink).map(L=>L._channelLink.state)}));
  assert.equal(held.state,'pending');assert.equal(held.shape,initial.shape);assert.deepEqual(held.snapshot,['stale','stale']);
  await page.evaluate(()=>document.dispatchEvent(new PointerEvent('pointerup')));
  await page.waitForFunction(()=>__state()==='ready'&&!GeoMineChannelLive.state().running&&__linked()[0].features.length===7);
  console.log('PASS no calculation during drag; save during drag records stale; release regenerates');
  const saved=await page.evaluate(()=>JSON.parse(JSON.stringify(projectData())));
  assert.equal(saved.layers.filter(L=>L._channelLink).length,2);assert.equal(saved.layers.find(L=>L.name==='Guia dinâmica').features[0]._channelAxisId,initial.keys[0]);
  assert.ok(saved.layers.filter(L=>L._channelLink).every(L=>L._channelLink.options.mode==='depth'&&L._channelLink.options.height===2.5));
  await page.evaluate(data=>{
   const grid=__grid;loadProject(data);__axis=S.layers.find(L=>L.name==='Guia dinâmica');__raster=S.rasters.find(r=>r.id===942);__raster.d=grid;
   __move(500070);
  },saved);
  await page.waitForFunction(()=>__state()==='ready'&&!GeoMineChannelLive.state().running&&__linked()[0].features.length===8);
  console.log('PASS saved link reopens and follows subsequent vertex edits');
  const beforeFailure=await page.evaluate(()=>__shape());
  await page.evaluate(()=>{const f=__axis.features[0];f.geom=f.geom.map(([x,y])=>[x,7400050]);drawLayer(__axis);});
  await page.waitForFunction(()=>__state()==='stale'&&!GeoMineChannelLive.state().running);
  const failed=await page.evaluate(()=>({shape:__shape(),names:__linked().map(L=>L.name),status:__linked().flatMap(L=>L.features.map(f=>f.props.STATUS)),state:projectData().layers.filter(L=>L._channelLink).map(L=>L._channelLink.state)}));
  assert.equal(failed.shape,beforeFailure);assert.ok(failed.names.every(n=>n.includes('desatualizada')));assert.ok(failed.status.every(s=>s.includes('DESATUALIZADA')));assert.deepEqual(failed.state,['stale','stale']);
  await page.evaluate(()=>{const f=__axis.features[0];f.geom=f.geom.map(([x,y])=>[x,7400000]);drawLayer(__axis);});
  await page.waitForFunction(()=>__state()==='ready'&&!GeoMineChannelLive.state().running);
  assert.ok((await page.evaluate(()=>__linked().flatMap(L=>L.features.map(f=>f.props.STATUS)))).every(s=>s==='Faixa por profundidade estimada — não delimita leito regular nem certifica cheia'),'restoring the original axis must retain the depth distinction');
  console.log('PASS invalid changed axis preserves old geometry marked stale; restoration clears stale');
  // Replace native source after the last sample, before worker completion.
  await page.evaluate(()=>{
   const original=GeoMineChannelDEM;window.__demOriginal=original;let once=true;
   GeoMineChannelDEM={...original,prepare:async function(r,o){const a=await original.prepare(r,o),sample=a.sample.bind(a);return {...a,sample:async pts=>{const result=await sample(pts);if(once){once=false;r.d={...r.d,z:new Float32Array(r.d.z).fill(999)};}return result;}};}};
   __move(500080);
  });
  await page.waitForFunction(()=>__state()==='stale'&&!GeoMineChannelLive.state().running);
  assert.equal(await page.evaluate(()=>__shape()),beforeFailure,'late replaced MDT must not commit old samples');
  await page.evaluate(()=>{GeoMineChannelDEM=__demOriginal;__raster.d=__grid;GeoMineChannelLive.retry();});
  await page.waitForFunction(()=>__state()==='ready'&&!GeoMineChannelLive.state().running&&__linked()[0].features.length===9);
  console.log('PASS MDT replacement during analysis blocks stale result; reattachment/retry recovers');
  // Editing a generated feature must never be silently overwritten.
  const manual=await page.evaluate(()=>{const L=__linked()[1];L.features[0].props.NOTA='ajuste manual a preservar';drawLayer(L);return __shape();});
  await page.waitForFunction(()=>__state()==='detached');await page.evaluate(()=>__move(500090));await page.waitForTimeout(750);
  assert.equal(await page.evaluate(()=>__shape()),manual);assert.equal(await page.evaluate(()=>__linked()[1].features[0].props.NOTA),'ajuste manual a preservar');
  await page.evaluate(()=>{S.activeId=__axis.id;GeoMineChannelExtraction.open();});
  await page.locator('#chanLayer').selectOption(String(await page.evaluate(()=>__axis.id)));
  await page.locator('#chanKindAgua').check();await page.locator('#chanMode').selectOption('depth');await page.locator('#chanHeight').fill('2.5');
  await page.locator('#chanReach').fill('');
  await page.locator('#chanLimit').uncheck();assert.equal(await page.locator('#chanReach').isDisabled(),true);
  // Outro nome = outra camada (o destino da calha é escolhido pelo nome).
  await page.locator('#chanNewName').fill('Faixa por profundidade — segunda versão');
  await page.locator('#chanAnalyze').click();await page.waitForFunction(()=>!document.getElementById('chanAnalyze').disabled);
  assert.match(await page.locator('#chanStatus').textContent(),/Prévia pronta/);
  assert.equal(await page.locator('#chanConfirm').count(),0);await page.locator('#chanCommit').click();await page.locator('#chanClose').click();
  // Keep this suite as a genuine legacy-v1 regression; v2 is covered separately.
  await page.evaluate(()=>{for(const L of S.layers.filter(L=>L._channelLink?.version===2)){const r=L._channelLink.entries[0];if(L._channelLink.entries.length!==1)throw Error('Legacy fixture needs one axis');L._channelLink={...r,resultSignature:GeoMineChannelLive.signature(L)};}});
  await page.evaluate(()=>{
   window.__autoLinkId=S.layers.find(L=>L._channelLink?.state==='ready')._channelLink.id;
   window.__auto=()=>S.layers.filter(L=>L._channelLink?.id===__autoLinkId);
   __axis.features[0].geom=__axis.features[0].geom.map(([x,y])=>[x,7400014]);drawLayer(__axis);
  });
  await page.waitForFunction(()=>__auto().every(L=>L._channelLink.state==='ready')&&!GeoMineChannelLive.state().running&&__auto().every(L=>L.features.every(f=>f.props.BUSCA_M===40)));
  const adaptive=await page.evaluate(()=>({flags:__auto().flatMap(L=>L.features.map(f=>f.props.BUSCA_AUTO)),limited:__auto()[0]._channelLink.options.searchLimited,reach:__auto()[0]._channelLink.options.reach,
   widths:__auto().find(L=>L.gtype==='line').features.map(f=>f.props.LARG_M),manual:S.layers.find(L=>L.features.some(f=>f.props.NOTA)).features[0].props.NOTA}));
  assert.equal(adaptive.limited,false);assert.equal(adaptive.reach,null);assert.ok(adaptive.flags.every(v=>v===1));assert.ok(adaptive.widths.every(v=>Math.abs(v-5)<1e-4));assert.equal(adaptive.manual,'ajuste manual a preservar');
  console.log('PASS adaptive search persists in live recipe and expands after axis edit, without changing river width or detached manual result');
  // A legacy height recipe remains executable even when the UI offers only
  // automatic banks and depth. Loading never migrates its mode or height.
  const legacy=JSON.parse(JSON.stringify(saved));
  for(const L of legacy.layers.filter(L=>L._channelLink)){L._channelLink.options.mode='height';L._channelLink.options.height=1.25;}
  await page.evaluate(data=>{
   const grid=__grid;loadProject(data);__axis=S.layers.find(L=>L.name==='Guia dinâmica');__raster=S.rasters.find(r=>r.id===942);__raster.d=grid;__move(500070);
  },legacy);
  await page.waitForFunction(()=>__state()==='ready'&&!GeoMineChannelLive.state().running&&__linked()[0].features.length===8);
  const legacyResult=await page.evaluate(()=>({options:__linked().map(L=>L._channelLink.options),sections:__linked()[0].features.map(f=>f.props),saved:projectData().layers.filter(L=>L._channelLink).map(L=>L._channelLink.options)}));
  assert.ok([...legacyResult.options,...legacyResult.saved].every(o=>o.mode==='height'&&o.height===1.25));
  assert.ok(legacyResult.sections.every(p=>Math.abs(p.LARG_M-2.5)<1e-4&&Math.abs((p.NIVEL_M-p.Z_FUNDO)-1.25)<1e-4));
  assert.ok(legacyResult.sections.every(p=>p.STATUS==='Calha estimada — requer validação do leito regular'));
  console.log('PASS legacy height links reopen, retain the exact mode/height and update without migration to depth');
  for(const height of [0,-1,101,null]){
   const invalid=JSON.parse(JSON.stringify(saved));for(const L of invalid.layers.filter(L=>L._channelLink))L._channelLink.options.height=height;
   const before=await page.evaluate(data=>{
    const grid=__grid;loadProject(data);__axis=S.layers.find(L=>L.name==='Guia dinâmica');__raster=S.rasters.find(r=>r.id===942);__raster.d=grid;const shape=__shape();__move(500070);return shape;
   },invalid);
   await page.waitForFunction(()=>__state()==='stale'&&!GeoMineChannelLive.state().running);
   const invalidResult=await page.evaluate(()=>({shape:__shape(),links:__linked().map(L=>L._channelLink)}));
   assert.equal(invalidResult.shape,before,'invalid depth must preserve the last geometry');
   assert.ok(invalidResult.links.every(l=>l.options.mode==='depth'&&l.options.height===height&&l.message==='Parâmetros do vínculo inválidos.'));
  }
  console.log('PASS invalid saved depth heights (zero, negative, over 100 m, missing) cannot recalculate or overwrite results');
  assert.deepEqual(errors,[]);console.log('PASS manual result edits suspend linkage and are preserved; no browser errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
