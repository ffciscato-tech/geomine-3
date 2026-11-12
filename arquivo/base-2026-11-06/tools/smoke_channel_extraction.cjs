// Full offline app in a disposable browser. Uses a real native grid, no user files or network.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:950}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
  await page.goto('file://'+path.resolve(process.env.APP_PATH||path.join(__dirname,'../dist/GeoMine.html')));
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineChannelExtraction&&window.GeoMineChannelDEM);
  const status=()=>page.locator('#chanStatus').textContent();
  const ready=()=>page.waitForFunction(()=>!document.getElementById('chanAnalyze').disabled);
  async function create(){await page.locator('#chanCommit').click();await ready();}
  async function visibleStatus(){
   const box=await page.locator('#chanStatus').boundingBox(),viewport=page.viewportSize();
   assert.ok(box&&box.height>0&&box.y>=0&&box.y+box.height<=viewport.height,'creation feedback stays visible in the footer');
  }
  async function settings(){
   await page.locator('#chanLimit').check();
   await page.locator('#chanKindAgua').check();await page.locator('#chanMode').selectOption('depth');
   await page.locator('#chanRaster').selectOption('941');
   await page.locator('#chanHeight').fill('2.5');await page.locator('#chanInterval').fill('10');
   await page.locator('#chanReach').fill('20');
  }
  async function analyze(){
   await page.locator('#chanAnalyze').click();await ready();assert.match(await status(),/Prévia pronta/);
   assert.equal(await page.locator('#chanResults').isVisible(),true);assert.equal(await page.locator('#chanCommit').isEnabled(),true);
   assert.equal(await page.locator('#chanConfirm').count(),0);await visibleStatus();
   await page.evaluate(()=>{
    document.getElementById('chanDetails').click();
    window.__reviewAudit=()=>({project:S.projectId,crs:S.workCRS,layerRevision:__axis._rev,rasterRevision:__channelRaster._rev,
     gridRevision:projectNativeGridRevision(__channelRaster.d),selected:S.selFeat&&[S.selFeat.layerId,S.selFeat.idx],
     features:JSON.stringify(__axis.features),options:['Layer','Raster','Scope','Mode','Height','Interval','Reach'].map(id=>document.getElementById('chan'+id).value)});
    window.__reviewAuditBefore=__reviewAudit();
   });
  }
  async function diagnostic(hasTerrain=true){
   assert.equal(await page.locator('#chanResults').isVisible(),true,'failed analysis still exposes the sampled section');
   assert.equal(await page.locator('#chanConfirm').count(),0,'creation has no confirmation gate');
   assert.equal(await page.locator('#chanCommit').isEnabled(),true,'Create can rerun, but an invalid analysis cannot produce layers');
   assert.match(await page.locator('#chanSummary').textContent(),/seção que interrompeu|nenhuma calha/i);
   assert.match(await page.locator('#chanSection option').first().textContent(),/conferir perfil/i);
   if(hasTerrain){
    assert.equal(await page.locator('#chanChart svg').count(),1);assert.match(await page.locator('#chanChart').textContent(),/margens ainda não confirmadas/i);
    assert.equal(await page.locator('#chanChart [stroke="#169cbd"]').count(),0,'failed sections must not imply a confirmed water surface');
   }else{
    assert.equal(await page.locator('#chanChart svg').count(),0);assert.match(await page.locator('#chanChart').textContent(),/não tem cotas válidas/i);
   }
   const guard=await page.evaluate(async()=>{
    await GeoMineChannelExtraction.commit();
    const disabled=document.getElementById('chanCommit').disabled;
    let sections=0;map.eachLayer(l=>{if(l instanceof L2.Polyline&&l.options?.color==='#e78d2d')sections++;});
    return {disabled,derived:__derived().length,undo:S.undo.length,sections};
   });assert.deepEqual(guard,{disabled:false,derived:0,undo:0,sections:1},'direct Create reruns the invalid analysis without producing partial layers');
   await visibleStatus();assert.doesNotMatch(await status(),/Prévia pronta|criada:/i);
  }
  await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31982';
   const nc=241,nr=81,cs=.5,csy=.5,xll=499989.75,yll=7399979.75,z=new Float32Array(nc*nr);
   for(let r=0;r<nr;r++)for(let c=0;c<nc;c++)z[r*nc+c]=100+Math.abs(yll+(nr-r-.5)*csy-7400000);
   window.__channelGrid={nc,nr,cs,csy,xll,yll,z,zmin:100,zmax:120,native:true,resampled:1,srcCRS:S.workCRS};
   window.__channelRaster={id:941,name:'MDT sintético — V de 5 m',crs:S.workCRS,visible:false,
    style:{mode:'hipso',opacity:1},d:__channelGrid};S.rasters.push(__channelRaster);
   window.__channelBytes=Array.from(z);window.__channelZ=z;
   window.__axis=addLayer({name:'Eixos de prova',gtype:'line',crs:S.workCRS,fields:[{name:'ID',type:'N'}],features:[
    {geom:[[500000,7400000],[500040,7400000]],props:{ID:1}},
    {geom:[[500060,7400000],[500100,7400000]],props:{ID:2}}
   ]});
   window.__axisContent=()=>({features:__axis.features.map(f=>({geom:f.geom,props:f.props,multi:f.multi})),fields:__axis.fields,crs:__axis.crs});
   window.__axisBefore=JSON.stringify(__axisContent());
   window.__sourcesIntact=()=>__channelRaster.d===__channelGrid&&__channelGrid.z===__channelZ&&
    __channelGrid.z.every((n,i)=>n===__channelBytes[i])&&JSON.stringify(__axisContent())===__axisBefore;
   window.__derived=()=>S.layers.filter(L=>L!==__axis);
   window.__channelBounds=g=>{const points=[];const walk=x=>{if(typeof x[0]==='number')points.push(x);else x.forEach(walk);};walk(g);
    return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];};
   window.__openChannel=(index=0)=>{ED.sel=null;ED.on=false;pickFeature(__axis,index);GeoMineChannelExtraction.open();};
   // Capture the public details snapshot without opening a second modal.
   GeoMineChannelDetails.open=ctx=>{window.__reviewSnapshot=ctx.snapshot;};
   // Deterministic cancellation/staleness: delay the first real sample, with abort handling.
   window.__gateSampling=()=>{
    const original=window.GeoMineChannelDEM;window.__samplingStarted=false;
    window.__ungateSampling=()=>{window.GeoMineChannelDEM=original;};
    window.GeoMineChannelDEM={...original,prepare:async function(r,options){
     const adapter=await original.prepare(r,options),sample=adapter.sample.bind(adapter);let first=true;
     return {...adapter,sample:async points=>{
      if(first){first=false;await new Promise((resolve,reject)=>{
       const finish=()=>{options.signal?.removeEventListener('abort',abort);resolve();},
        abort=()=>{options.signal?.removeEventListener('abort',abort);reject(Object.assign(new Error('Amostragem cancelada.'),{name:'AbortError'}));};
       window.__releaseSampling=finish;window.__samplingStarted=true;
       if(options.signal?.aborted)abort();else options.signal?.addEventListener('abort',abort,{once:true});
      });}
      return sample(points);
     }};
    }};
   };
   S.undo=[];refreshUI();__openChannel();
  });
  assert.equal(await page.locator('#chanMode').inputValue(),'auto');
  assert.equal(await page.locator('#chanLive').isChecked(),true);
  assert.equal(await page.locator('#chanLimit').isChecked(),true);
  assert.match(await page.locator('label[for="chanHeight"]').textContent(),/acima do fundo/);
  assert.equal(await page.locator('#chanConfirm,#chanSearchHint,#chanModeHint,#chanLevelHint').count(),0);
  assert.equal(await page.locator('#chanCommit').isEnabled(),true);
  await page.setViewportSize({width:1024,height:640});await page.locator('#chanLimit').evaluate(e=>e.closest('label').scrollIntoView({block:'start'}));
  await page.screenshot({path:path.resolve(__dirname,'../dist/channel-search-initial-tablet.png')});await page.setViewportSize({width:1400,height:950});

  // Drawn axes are real new line layers; this workflow never takes over S.prof.
  await page.evaluate(()=>{window.__profileState=S.prof;window.__profileBefore=JSON.stringify(S.prof);});
  await page.locator('#chanDraw').click();
  await page.evaluate(()=>{
   for(const p of [[500000,7400000],[500040,7400000]]){const w=toWGS(S.workCRS,p[0],p[1]);GeoMineChannelExtraction.mapClick({latlng:{lng:w[0],lat:w[1]}});}
  });
  assert.equal(await page.locator('#chanDrawInfo,#chanDrawBar').count(),0);await page.keyboard.press('Enter');
  const drawn=await page.evaluate(()=>({n:S.layers.length,type:activeLayer().gtype,geom:activeLayer().features[0].geom,undo:S.undo.length,
   profileSame:S.prof===__profileState&&JSON.stringify(S.prof)===__profileBefore,sourceSame:__sourcesIntact()}));
  assert.equal(drawn.n,2);assert.equal(drawn.type,'line');assert.equal(drawn.undo,1);assert.equal(drawn.profileSame,true);assert.equal(drawn.sourceSame,true);
  assert.ok(drawn.geom.every((p,i)=>Math.hypot(p[0]-(500000+i*40),p[1]-7400000)<1e-6));
  await page.evaluate(()=>{doUndo();__openChannel();});
  await page.locator('#chanDraw').click();await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>S.layers.length),1);assert.equal(await page.evaluate(()=>S.undo.length),0);

  assert.equal(await page.locator('#chanScope').inputValue(),'feature');
  await settings();await create();await visibleStatus();assert.match(await status(),/criada em/i);
  assert.equal(await page.evaluate(()=>__derived().length),2,'Create must analyze and create without a prior preview');
  assert.ok(await page.evaluate(()=>__derived().find(L=>L.gtype==='line').features.every(f=>f.props.LARG_M===5&&f.props.NIVEL_M===102.5)));
  await page.evaluate(()=>{doUndo();__openChannel();});
  await settings();await analyze();
  assert.equal(await page.evaluate(()=>S.layers.length),1,'analysis must not save output layers');
  assert.equal(await page.evaluate(()=>S.undo.length),0);assert.equal(await page.evaluate(()=>__sourcesIntact()),true);
  const chart=await page.locator('#chanChart').evaluate(el=>{const svg=el.tagName.toLowerCase()==='svg'?el:el.querySelector('svg');return {svg:!!svg,marks:svg?.querySelectorAll('path,polyline,line,circle').length||0};});
  assert.equal(chart.svg,true);assert.ok(chart.marks>2,'the section preview must draw the terrain and banks');
  assert.equal(await page.locator('#chanStatus').getAttribute('role'),'status');
  const sectionOptions=await page.locator('#chanSection option').evaluateAll(options=>options.map(o=>o.value));
  assert.ok(sectionOptions.length>=5);await page.locator('#chanSection').selectOption(sectionOptions[1]);
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('toast')).opacity==='0');
  await page.screenshot({path:path.resolve(__dirname,'../dist/channel-profile-desktop.png')});
  await page.setViewportSize({width:1024,height:640});await page.locator('#chanModal .modal-b').evaluate(e=>e.scrollTop=e.scrollHeight);
  await page.screenshot({path:path.resolve(__dirname,'../dist/channel-profile-tablet.png')});
  for(const id of ['chanAnalyze','chanCommit']){const box=await page.locator('#'+id).boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=640,id+' remains accessible on tablet: '+JSON.stringify(box));}
  await page.setViewportSize({width:1400,height:950});
  await page.evaluate(()=>{renderRaster(__channelRaster);drawLayer(__axis);});
  await create();
  const first=await page.evaluate(()=>{
   const layers=__derived(),channel=layers.find(L=>L.gtype==='polygon'),sections=layers.find(L=>L.gtype==='line'),saved=projectData();
   return {auditBefore:__reviewAuditBefore,auditAfter:__reviewAudit(),status:document.getElementById('chanStatus').textContent,count:layers.length,channelCount:channel?.features.length,sectionCount:sections?.features.length,
    bounds:channel&&__channelBounds(channel.features.map(f=>f.geom)),sectionWidths:sections?.features.map(f=>Math.hypot(f.geom.at(-1)[0]-f.geom[0][0],f.geom.at(-1)[1]-f.geom[0][1])),
    multi:channel?.features.every(f=>f.multi===true),attributes:channel?.features.map(f=>f.props),sectionAttributes:sections?.features.map(f=>f.props),same:__sourcesIntact(),undo:S.undo.length,
    serialized:layers.every(L=>JSON.stringify(saved.layers.find(l=>l.id===L.id).features)===JSON.stringify(L.features))};
  });
  assert.equal(first.count,2,first.status+' '+JSON.stringify({before:first.auditBefore,after:first.auditAfter}));assert.equal(first.channelCount,1);assert.ok(first.sectionCount>=5);
  assert.equal(first.multi,true);
  assert.ok(first.sectionWidths.every(w=>Math.abs(w-5)<1e-6));assert.deepEqual(first.bounds,[500000,7399997.5,500040,7400002.5]);
  assert.ok(first.sectionAttributes.every(p=>p.EIXO===1&&p.LARG_M===5&&p.Z_EIXO===100&&p.Z_FUNDO===100&&p.DESLOC_M===0&&p.NIVEL_M===102.5&&p.ALTURA_M===2.5&&p.PIXEL_M===.5&&p.BUSCA_M===20&&p.RAIO_M===10&&p.BUSCA_AUTO===0));
  assert.deepEqual(first.sectionAttributes.map(p=>p.PROG_M),[0,10,20,30,40]);
  assert.equal(first.attributes[0].LARG_MIN,5);assert.equal(first.attributes[0].LARG_MAX,5);assert.equal(first.attributes[0].N_SECOES,5);
  assert.match(first.attributes[0].STATUS,/estimada/);
  assert.equal(first.same,true);assert.equal(first.serialized,true);assert.equal(first.undo,1);
  const undone=await page.evaluate(()=>{doUndo();const one=__derived().length;doUndo();return {one,two:__derived().length,same:__sourcesIntact()};});
  assert.deepEqual(undone,{one:0,two:0,same:true});

  // Analyze the whole layer, then commit its two axes into only two output layers.
  await page.evaluate(()=>__openChannel());await settings();await page.locator('#chanScope').selectOption('all');await analyze();
  assert.equal(await page.evaluate(()=>__derived().length),0);await create();
  const all=await page.evaluate(()=>{
   const outputs=__derived(),channel=outputs.find(L=>L.gtype==='polygon'),sections=outputs.find(L=>L.gtype==='line');
   window.__channelSaved=outputs.map(L=>({id:L.id,features:JSON.stringify(L.features)}));
   return {layers:outputs.length,channels:channel.features.length,sections:sections.features.length,bounds:__channelBounds(channel.features.map(f=>f.geom)),same:__sourcesIntact()};
  });assert.equal(all.layers,2);assert.equal(all.channels,2);assert.ok(all.sections>=10);assert.equal(all.same,true);
  assert.deepEqual(all.bounds,[500000,7399997.5,500100,7400002.5]);
  await page.evaluate(()=>{doUndo();__openChannel();});

  // The original guide is not the floor: a shifted valley can sit wholly beside it.
  await page.evaluate(()=>{
   const g=__channelGrid,z=new Float32Array(g.z.length);
   for(let r=0;r<g.nr;r++)for(let c=0;c<g.nc;c++){const y=g.yll+(g.nr-r-.5)*g.csy;z[r*g.nc+c]=100+Math.abs(y-7400002);}
   window.__guideGrid={...g,z,zmax:122};window.__guideBytes=Array.from(z);
   S.rasters.push({id:944,name:'MDT sintético — fundo 2 m à esquerda da guia',crs:S.workCRS,visible:false,style:{mode:'hipso',opacity:1},d:__guideGrid});__openChannel();
  });await settings();await page.locator('#chanRaster').selectOption('944');await page.locator('#chanHeight').fill('1');await page.locator('#chanReach').fill('10');await analyze();
  assert.match(await page.locator('#chanChart').textContent(),/guia: 102\.00 m/);
  assert.match(await page.locator('#chanChart').textContent(),/Fundo encontrado: 100\.00 m · deslocamento \+2\.00 m/);
  assert.match(await page.locator('#chanChart').textContent(),/Nível: 101\.00 m/);
  assert.ok(await page.evaluate(()=>__reviewSnapshot.outputs[0].sections.every(s=>s.floorOffset===2&&s.zFloor===100)));
  assert.equal(await page.locator('#chanChart [data-role="floor-point"]').count(),1);
  assert.equal(await page.locator('#chanChart').evaluate(el=>el.querySelector('[data-role="guide-axis"]').getAttribute('d')!==el.querySelector('[data-role="located-floor"]').getAttribute('d')),true);
  await page.locator('#chanChart').scrollIntoViewIfNeeded();await page.waitForFunction(()=>getComputedStyle(document.getElementById('toast')).opacity==='0');
  await page.screenshot({path:path.resolve(__dirname,'../dist/channel-guide-floor-desktop.png')});
  await page.setViewportSize({width:1024,height:640});await page.locator('#chanChart').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.resolve(__dirname,'../dist/channel-guide-floor-tablet.png')});
  await page.setViewportSize({width:1400,height:950});await create();
  const guide=await page.evaluate(()=>{
   const outputs=__derived(),poly=outputs.find(L=>L.gtype==='polygon'),sections=outputs.find(L=>L.gtype==='line');
   window.__guideProject=JSON.parse(JSON.stringify(projectData()));
   window.__guideSerialized=outputs.map(L=>({id:L.id,features:JSON.stringify(L.features),fields:JSON.stringify(L.fields)}));
   return {count:outputs.length,bounds:poly&&__channelBounds(poly.features.map(f=>f.geom)),props:sections?.features.map(f=>f.props),fields:sections?.fields,
    same:__sourcesIntact()&&__guideGrid.z.every((z,i)=>z===__guideBytes[i]),undo:S.undo.length};
  });assert.equal(guide.count,2);assert.equal(guide.same,true);assert.equal(guide.undo,1);
  assert.deepEqual(guide.bounds,[500000,7400001,500040,7400003],'the 2 m wide channel need not contain its unchanged guide');
  assert.ok(guide.props.every(p=>p.Z_EIXO===102&&p.Z_FUNDO===100&&p.DESLOC_M===2&&p.NIVEL_M===101&&p.ALTURA_M===1&&p.LARG_M===2));
  assert.ok(['Z_EIXO','Z_FUNDO','DESLOC_M'].every(name=>guide.fields.find(f=>f.name===name)?.type==='N'));
  await page.evaluate(()=>{doUndo();__openChannel();});
  await page.locator('#chanRaster').selectOption('944');await page.locator('#chanHeight').fill('4');await page.locator('#chanReach').fill('10');
  await page.locator('#chanAnalyze').click();await ready();
  assert.match(await status(),/margem|alcance|faixa/i);assert.match(await page.locator('#chanChart').textContent(),/Fundo encontrado: 100\.00 m · deslocamento \+2\.00 m/);
  assert.equal(await page.locator('#chanChart [data-role="floor-point"]').count(),1);await diagnostic();

  // Automatic bank inference uses the same located floor inside the unchanged corridor.
  await page.evaluate(()=>{
   const g=__channelGrid,z=new Float32Array(g.z.length);
   for(let r=0;r<g.nr;r++)for(let c=0;c<g.nc;c++){const y=g.yll+(g.nr-r-.5)*g.csy;z[r*g.nc+c]=100+Math.min(2,Math.max(0,Math.abs(y-7400002)-1));}
   window.__guideAutoGrid={...g,z,zmax:102};window.__guideAutoBytes=Array.from(z);
   S.rasters.push({id:945,name:'MDT sintético — fundo lateral e duas bordas',crs:S.workCRS,visible:false,style:{mode:'hipso',opacity:1},d:__guideAutoGrid});__openChannel();
  });await page.locator('#chanRaster').selectOption('945');await page.locator('#chanKindCalha').check();await page.locator('#chanMode').selectOption('auto');await page.locator('#chanReach').fill('16');await analyze();
  await create();
  const guideAuto=await page.evaluate(()=>{const outputs=__derived(),p=outputs.find(L=>L.gtype==='polygon'),s=outputs.find(L=>L.gtype==='line');
   return {count:outputs.length,bounds:p&&__channelBounds(p.features.map(f=>f.geom)),props:s?.features.map(f=>f.props),same:__sourcesIntact()&&__guideAutoGrid.z.every((z,i)=>z===__guideAutoBytes[i])};
  });assert.equal(guideAuto.count,2);assert.equal(guideAuto.same,true);assert.deepEqual(guideAuto.bounds,[500000,7399999,500040,7400005]);
  assert.ok(guideAuto.props.every(p=>p.Z_EIXO===101&&p.Z_FUNDO===100&&p.DESLOC_M===1&&p.NIVEL_M===102&&p.ALTURA_M===2&&p.LARG_M===6));
  await page.evaluate(()=>{doUndo();__openChannel();});

  // Disabling the corridor limit expands only a safe reach failure, not the river width.
  await page.evaluate(()=>{
   const g=__channelGrid,z=new Float32Array(g.z.length);
   for(let r=0;r<g.nr;r++)for(let c=0;c<g.nc;c++){const y=g.yll+(g.nr-r-.5)*g.csy;z[r*g.nc+c]=100+Math.abs(y-7400000)*.1;}
   window.__adaptiveGrid={...g,z,zmax:102};window.__adaptiveBytes=Array.from(z);
   S.rasters.push({id:946,name:'MDT sintético — vale largo',crs:S.workCRS,visible:false,style:{mode:'hipso',opacity:1},d:__adaptiveGrid});__openChannel();
   const original=window.GeoMineChannelDEM;window.__restoreAdaptiveSampler=()=>{window.GeoMineChannelDEM=original;};window.__adaptiveReads=[];
   window.GeoMineChannelDEM={...original,prepare:async(r,options)=>{
    const adapter=await original.prepare(r,options);return {...adapter,sample:async points=>{
     __adaptiveReads.push(Math.max(...points.map(p=>Math.abs(p[1]-7400000))));return adapter.sample(points);
    }};
   }};
  });await settings();await page.locator('#chanRaster').selectOption('946');await page.locator('#chanHeight').fill('1.5');
  await page.locator('#chanReach').fill('2');await page.locator('#chanLimit').uncheck();
  assert.equal(await page.locator('#chanReach').isEnabled(),false);assert.equal(await page.locator('#chanSearchHint').count(),0);
  await page.setViewportSize({width:1024,height:640});await page.locator('#chanLimit').evaluate(e=>e.closest('label').scrollIntoView({block:'start'}));
  await page.screenshot({path:path.resolve(__dirname,'../dist/channel-search-automatic-tablet.png')});
  await analyze();assert.equal(await page.locator('#chanReach').isEnabled(),false);
  assert.deepEqual(await page.evaluate(()=>__adaptiveReads),[10,20]);
  assert.equal(await page.evaluate(()=>__reviewSnapshot.outputs[0].searchReach),20);
  await page.locator('#chanChart').scrollIntoViewIfNeeded();await page.screenshot({path:path.resolve(__dirname,'../dist/channel-search-profile-tablet.png')});
  await page.setViewportSize({width:1400,height:950});
  await create();
  const adaptive=await page.evaluate(()=>{
   const outputs=__derived(),p=outputs.find(L=>L.gtype==='polygon');
   window.__adaptiveProject=JSON.parse(JSON.stringify(projectData()));window.__adaptiveSerialized=outputs.map(L=>({id:L.id,features:JSON.stringify(L.features),fields:JSON.stringify(L.fields)}));
   return {count:outputs.length,bounds:p&&__channelBounds(p.features.map(f=>f.geom)),allProps:outputs.flatMap(L=>L.features.map(f=>f.props)),same:__sourcesIntact()&&__adaptiveGrid.z.every((z,i)=>z===__adaptiveBytes[i])};
  });assert.equal(adaptive.count,2);assert.equal(adaptive.same,true);assert.deepEqual(adaptive.bounds,[500000,7399985,500040,7400015]);
  assert.ok(adaptive.allProps.every(p=>p.BUSCA_AUTO===1&&p.BUSCA_M===40&&p.RAIO_M===20));
  await page.evaluate(()=>{doUndo();__openChannel();__adaptiveReads=[];__adaptiveGrid.z.fill(NaN);});
  await page.locator('#chanRaster').selectOption('946');await page.locator('#chanAnalyze').click();await ready();
  assert.deepEqual(await page.evaluate(()=>__adaptiveReads),[10],'NoData must not trigger expansion');await diagnostic(false);
  await page.evaluate(()=>{__adaptiveGrid.z.set(__adaptiveBytes);__restoreAdaptiveSampler();__openChannel();});await settings();

  // A close-station warning is advisory: it must not turn a valid review into a failure.
  await page.evaluate(()=>{
   window.__engineBeforeWarning=GeoMineChannelEngine;
   const source=GeoMineChannelEngine.engine.toString();
   window.GeoMineChannelEngine={...GeoMineChannelEngine,engine:new Function('return function(){const api=('+source+')();return {...api,analyze(...args){const result=api.analyze(...args);result.sections[1]={...result.sections[1],station:result.sections[0].station+.1,level:result.sections[0].level+.4};return result;}}}')()};
  });await analyze();assert.ok(await page.evaluate(()=>{
   const sections=__reviewSnapshot.outputs[0].sections;
   return sections[1].station-sections[0].station<__reviewSnapshot.resolution&&sections[1].level-sections[0].level>.3;
  }),'a close-station level change stays present in the scientific result even without explanatory UI text');
  assert.equal(await page.locator('#chanCommit').isEnabled(),true);assert.equal(await page.evaluate(()=>__derived().length),0);
  await page.evaluate(()=>{window.GeoMineChannelEngine=__engineBeforeWarning;__openChannel();});

  // LiDAR-like slope breaks: a flat bottom, rising banks, and an outer plateau.
  await page.evaluate(()=>{
   const g=__channelGrid,z=new Float32Array(g.z.length);
   for(let r=0;r<g.nr;r++)for(let c=0;c<g.nc;c++){
    const y=g.yll+(g.nr-r-.5)*g.csy;z[r*g.nc+c]=100+Math.min(3,Math.max(0,Math.abs(y-7400000)-2));
   }
   window.__autoChannelGrid={...g,z,zmax:103};window.__autoChannelBytes=Array.from(z);
   window.__autoChannelRaster={id:942,name:'MDT sintético — margens com patamar',crs:S.workCRS,visible:false,style:{mode:'hipso',opacity:1},d:__autoChannelGrid};
   S.rasters.push(__autoChannelRaster);__openChannel();
  });
  await page.locator('#chanKindCalha').check();await page.locator('#chanMode').selectOption('auto');await page.locator('#chanRaster').selectOption('942');
  await page.locator('#chanInterval').fill('10');await page.locator('#chanReach').fill('20');
  assert.equal(await page.locator('#chanHeightBox').isVisible(),false);await analyze();
  assert.equal(await page.evaluate(()=>__derived().length),0);await page.locator('#chanChart').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.resolve(__dirname,'../dist/channel-auto-profile-desktop.png')});
  await page.setViewportSize({width:1024,height:640});await page.locator('#chanModal .modal-b').evaluate(e=>e.scrollTop=e.scrollHeight);
  await page.screenshot({path:path.resolve(__dirname,'../dist/channel-auto-profile-tablet.png')});
  await page.setViewportSize({width:1400,height:950});await create();
  const automatic=await page.evaluate(()=>{
   const outputs=__derived(),p=outputs.find(L=>L.gtype==='polygon'),sections=outputs.find(L=>L.gtype==='line');
   return {count:outputs.length,multi:p?.features.every(f=>f.multi===true),bounds:p&&__channelBounds(p.features.map(f=>f.geom)),props:sections?.features.map(f=>f.props),
    same:__autoChannelRaster.d===__autoChannelGrid&&__autoChannelGrid.z.every((n,i)=>n===__autoChannelBytes[i])&&__sourcesIntact()};
  });assert.equal(automatic.count,2);assert.equal(automatic.multi,true);assert.equal(automatic.same,true);
  assert.deepEqual(automatic.bounds,[500000,7399995,500040,7400005]);
  assert.ok(automatic.props.every(p=>Math.abs(p.LARG_M-10)<1e-6&&p.ALTURA_M===3&&p.NIVEL_M===103&&p.TOPO_ESQ===103&&p.TOPO_DIR===103&&/declive/i.test(p.MODO)));
  await page.evaluate(()=>{doUndo();__openChannel();});

  // One inferred bank supplies a level; the opposite sloping bank is its first intersection.
  await page.evaluate(()=>{
   const g=__channelGrid,z=new Float32Array(g.z.length);
   for(let r=0;r<g.nr;r++)for(let c=0;c<g.nc;c++){
    const d=g.yll+(g.nr-r-.5)*g.csy-7400000;z[r*g.nc+c]=100+(d>=0?Math.min(2,Math.max(0,d-1)):-d*.5);
   }
   window.__unilateralGrid={...g,z,zmax:110};window.__unilateralBytes=Array.from(z);
   S.rasters.push({id:943,name:'MDT sintético — uma borda e rampa oposta',crs:S.workCRS,visible:false,style:{mode:'hipso',opacity:1},d:__unilateralGrid});__openChannel();
  });await page.locator('#chanKindCalha').check();await page.locator('#chanMode').selectOption('auto');await page.locator('#chanRaster').selectOption('943');
  await page.locator('#chanReach').fill('10');await analyze();
  assert.ok(await page.evaluate(()=>__reviewSnapshot.outputs[0].sections.every(s=>s.detection.supportSides===1)));
  assert.match(await page.locator('#chanChart').textContent(),/apoio em uma borda/i);
  assert.equal(await page.locator('#chanChart circle[stroke="#8c47b5"]').count(),1,'only the actually inferred bank gets a purple marker');
  assert.equal(await page.locator('#chanChart circle[fill="#dc7335"]').count(),2,'both first level intersections remain visible');
  await create();
  const unilateral=await page.evaluate(()=>{
   const outputs=__derived(),poly=outputs.find(L=>L.gtype==='polygon'),sections=outputs.find(L=>L.gtype==='line');
   window.__unilateralProject=JSON.parse(JSON.stringify(projectData()));
   window.__unilateralSerialized=outputs.map(L=>({id:L.id,features:JSON.stringify(L.features),fields:JSON.stringify(L.fields)}));
   return {count:outputs.length,multi:poly?.features[0].multi,bounds:poly&&__channelBounds(poly.features.map(f=>f.geom)),
    countOne:poly?.features[0].props.N_UMA_MRG,props:sections?.features.map(f=>f.props),fields:sections?.fields,
    same:__sourcesIntact()&&__unilateralGrid.z.every((z,i)=>z===__unilateralBytes[i])};
  });assert.equal(unilateral.count,2);assert.equal(unilateral.multi,true);assert.equal(unilateral.same,true);assert.equal(unilateral.countOne,5);
  assert.deepEqual(unilateral.bounds,[500000,7399996,500040,7400003]);
  assert.ok(unilateral.props.every(p=>p.LARG_M===7&&p.NIVEL_M===102&&p.ALTURA_M===2&&p.APOIO===1&&p.TOPO_ESQ===102&&p.TOPO_DIR===null&&/uma margem|interseção/i.test(p.METODO)));
  assert.ok(['TOPO_ESQ','TOPO_DIR','APOIO'].every(name=>unilateral.fields.find(f=>f.name===name)?.type==='N'));
  await page.evaluate(()=>{doUndo();__openChannel();});await page.locator('#chanRaster').selectOption('941');await page.locator('#chanReach').fill('20');
  await page.locator('#chanKindCalha').check();await page.locator('#chanMode').selectOption('auto');await page.locator('#chanAnalyze').click();await ready();
  assert.equal(await page.locator('#chanCommit').isEnabled(),true);assert.equal(await page.evaluate(()=>__derived().length),0);
  assert.match(await status(),/quebra|declive|altura/i);
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('toast')).opacity==='0');
  await page.locator('#chanChart').scrollIntoViewIfNeeded();await page.screenshot({path:path.resolve(__dirname,'../dist/channel-diagnostic-profile.png')});
  await page.setViewportSize({width:1024,height:640});await page.locator('#chanAnalyze').click();await ready();
  await page.waitForFunction(()=>getComputedStyle(document.getElementById('toast')).opacity==='0');
  assert.equal(await page.locator('#chanChart').evaluate(el=>{
   const r=el.getBoundingClientRect(),b=el.closest('.modal-b').getBoundingClientRect();return r.top>=b.top&&r.bottom<=b.bottom;
  }),true,'failed analysis automatically reveals the whole diagnostic curve on tablet without manual scrolling');
  for(const id of ['chanAnalyze','chanCommit']){const box=await page.locator('#'+id).boundingBox();assert.ok(box&&box.y>=0&&box.y+box.height<=640,id+' is visible during diagnostic review');}
  await page.screenshot({path:path.resolve(__dirname,'../dist/channel-diagnostic-tablet.png')});
  await page.setViewportSize({width:1400,height:950});await diagnostic();

  // A flat surface also keeps its real terrain profile without inventing banks.
  await page.evaluate(()=>__channelGrid.z.fill(100));await page.locator('#chanAnalyze').click();await ready();
  assert.match(await status(),/quebra|declive|altura|margem|patamar/i);await diagnostic();
  await page.evaluate(()=>__channelGrid.z.set(__channelBytes));await settings();await analyze();
  assert.equal(await page.locator('#chanCommit').isEnabled(),true,'a valid rerun can be created without confirmation');
  assert.equal(await page.evaluate(()=>__derived().length===0&&__sourcesIntact()),true);

  // Missing data and banks outside the search reach must never become a valid channel.
  await page.evaluate(()=>__channelGrid.z.fill(NaN));await page.locator('#chanAnalyze').click();await ready();
  assert.equal(await page.locator('#chanCommit').isEnabled(),true);assert.equal(await page.evaluate(()=>__derived().length),0);
  assert.match(await status(),/dado|NoData|inválid|complet|válid/i);await diagnostic(false);
  await page.evaluate(()=>{
   __channelGrid.z.set(__channelBytes);const g=__channelGrid;
   for(let r=0;r<g.nr;r++){const y=g.yll+(g.nr-r-.5)*g.csy;if(y>=7400001&&y<=7400001.5)g.z.fill(NaN,r*g.nc,(r+1)*g.nc);}
  });await page.locator('#chanAnalyze').click();await ready();
  assert.match(await status(),/dado|NoData|inválid|complet|válid/i);await diagnostic();
  await page.evaluate(()=>__channelGrid.z.set(__channelBytes));await page.locator('#chanReach').fill('2');
  await page.locator('#chanAnalyze').click();await ready();assert.equal(await page.locator('#chanCommit').isEnabled(),true);
  assert.equal(await page.evaluate(()=>__derived().length),0);assert.match(await status(),/margem|alcance|limite|interse|ating/i);await diagnostic();
  await settings();await analyze();assert.equal(await page.locator('#chanCommit').isEnabled(),true);

  // Earlier valid axes do not become partial layers if a later axis has no data.
  await page.evaluate(()=>{
   const g=__channelGrid;for(let r=0;r<g.nr;r++)for(let c=0;c<g.nc;c++)if(g.xll+(c+.5)*g.cs>500055)g.z[r*g.nc+c]=NaN;
  });await page.locator('#chanScope').selectOption('all');await page.locator('#chanAnalyze').click();await ready();
  assert.match(await page.locator('#chanSection option').first().textContent(),/Eixo 2/);await diagnostic(false);
  await page.evaluate(()=>__channelGrid.z.set(__channelBytes));await page.locator('#chanScope').selectOption('feature');

  // A saved reduced raster is not a substitute for an unavailable original.
  await page.evaluate(()=>{__channelRaster.d={...__channelGrid,native:false,resampled:4,fromProject:true,srcDims:[964,324]};__openChannel();});
  await settings();await page.locator('#chanAnalyze').click();await ready();
  assert.equal(await page.locator('#chanCommit').isEnabled(),true);assert.equal(await page.evaluate(()=>__derived().length),0);
  assert.match(await status(),/original|nativ|prévia|reduzid/i);
  await page.evaluate(()=>{__channelRaster.d=__channelGrid;__openChannel();});await settings();

  // Escape cancels in-flight native sampling; the real sampler resumes only on permitted input.
  await page.evaluate(()=>__gateSampling());await page.locator('#chanAnalyze').click();await page.waitForFunction(()=>__samplingStarted);
  await page.keyboard.press('Escape');await ready();await page.evaluate(()=>__ungateSampling());
  assert.match(await status(),/cancelad/i);assert.equal(await page.evaluate(()=>__derived().length),0);
  assert.equal(await page.evaluate(()=>S.undo.length),0);assert.equal(await page.evaluate(()=>__sourcesIntact()),true);

  // Cancel after the last sample resolves, while generate yields before worker analysis.
  await page.evaluate(()=>{
   __openChannel();const original=window.GeoMineChannelDEM;window.__restoreFinalSample=()=>{window.GeoMineChannelDEM=original;};
   window.GeoMineChannelDEM={...original,prepare:async(r,options)=>{
    const adapter=await original.prepare(r,options);return {...adapter,sample:async points=>{
     const result=await adapter.sample(points);setTimeout(()=>GeoMineChannelExtraction.cancel(),0);return result;
    }};
   }};
  });await settings();await page.locator('#chanAnalyze').click();await ready();
  await page.evaluate(()=>__restoreFinalSample());assert.match(await status(),/cancelad/i);
  assert.equal(await page.evaluate(()=>__derived().length),0);assert.equal(await page.locator('#chanCommit').isEnabled(),true);

  await page.evaluate(()=>{__openChannel();__gateSampling();});await settings();await page.locator('#chanAnalyze').click();
  await page.waitForFunction(()=>__samplingStarted);
  await page.evaluate(()=>{__axis.features[0].props.changedDuringAnalysis=true;__releaseSampling();});await ready();
  assert.equal(await page.locator('#chanCommit').isEnabled(),true);assert.equal(await page.evaluate(()=>__derived().length),0);
  assert.match(await status(),/mud|alter|cancelad/i);
  await page.evaluate(()=>{delete __axis.features[0].props.changedDuringAnalysis;__ungateSampling();__openChannel();});await settings();
  await analyze();
  await page.evaluate(()=>{__axis.features[0].geom[1][0]+=2;});await create();
  assert.match(await status(),/criada em/i);assert.equal(await page.evaluate(()=>__derived().length),2);await visibleStatus();
  assert.equal(await page.evaluate(()=>Math.max(...__derived().find(L=>L.gtype==='line').features.map(f=>f.props.PROG_M))),42,'stale preview is recalculated from the edited axis');
  assert.equal(await page.locator('#chanCommit').isEnabled(),true);
  await page.evaluate(()=>{doUndo();__axis.features[0].geom[1][0]-=2;__openChannel();});await settings();await analyze();
  await page.evaluate(()=>{__channelGrid.noData=100;});await create();
  assert.match(await status(),/NoData|dado|cota|válid/i);assert.equal(await page.evaluate(()=>__derived().length),0);await visibleStatus();
  await page.evaluate(()=>{delete __channelGrid.noData;__openChannel();});await settings();await analyze();
  await page.evaluate(()=>{__channelRaster.crs=__channelGrid.srcCRS='EPSG:31983';});await create();
  assert.match(await status(),/NoData|dado|cota|válid|cobertura/i);assert.equal(await page.evaluate(()=>__derived().length),0);await visibleStatus();
  await page.evaluate(()=>{__channelRaster.crs=__channelGrid.srcCRS=S.workCRS;__openChannel();});await settings();await analyze();
  const rollback=await page.evaluate(async()=>{
   const layers=S.layers.map(L=>L.id),stack=JSON.stringify(S.stack),active=S.activeId,add=window.addLayer;
   let inserted=0;
   window.addLayer=function(spec){const L=add(spec);inserted++;if(spec.gtype==='polygon')throw Error('Falha simulada após inserir calha');return L;};
   try{await GeoMineChannelExtraction.commit();}finally{window.addLayer=add;}
   return {sameLayers:JSON.stringify(S.layers.map(L=>L.id))===JSON.stringify(layers),sameStack:JSON.stringify(S.stack)===stack,
    sameActive:S.activeId===active,undo:S.undo.length,sameSource:__sourcesIntact(),inserted};
  });assert.deepEqual(rollback,{sameLayers:true,sameStack:true,sameActive:true,undo:0,sameSource:true,inserted:2});
  assert.match(await status(),/Falha simulada após inserir calha/);await visibleStatus();
  await create();assert.equal(await page.evaluate(()=>__derived().length),2,'rollback permits a clean creation retry');
  const reloaded=await page.evaluate(async()=>{
   const outputs=__derived().map(L=>({id:L.id,features:JSON.stringify(L.features)})),data=projectData();
   await loadProject(data);return outputs.map(before=>JSON.stringify(S.layers.find(L=>L.id===before.id)?.features)===before.features);
  });assert.deepEqual(reloaded,[true,true]);assert.deepEqual(errors,[]);
  const unilateralReload=await page.evaluate(async()=>{
   await loadProject(__unilateralProject);return __unilateralSerialized.map(before=>{
    const L=S.layers.find(L=>L.id===before.id);return {same:JSON.stringify(L?.features)===before.features&&JSON.stringify(L?.fields)===before.fields,
     expected:JSON.parse(before.features)[0],actual:L?.features[0],expectedFields:JSON.parse(before.fields),actualFields:L?.fields};
   });
  });assert.ok(unilateralReload.every(r=>r.same),JSON.stringify(unilateralReload));assert.deepEqual(errors,[]);
  const guideReload=await page.evaluate(async()=>{
   await loadProject(__guideProject);return __guideSerialized.map(before=>{const L=S.layers.find(L=>L.id===before.id);return JSON.stringify(L?.features)===before.features&&JSON.stringify(L?.fields)===before.fields;});
  });assert.deepEqual(guideReload,[true,true]);assert.deepEqual(errors,[]);
  const adaptiveReload=await page.evaluate(async()=>{
   await loadProject(__adaptiveProject);return __adaptiveSerialized.map(before=>{const L=S.layers.find(L=>L.id===before.id);return JSON.stringify(L?.features)===before.features&&JSON.stringify(L?.fields)===before.fields;});
  });assert.deepEqual(adaptiveReload,[true,true]);assert.deepEqual(errors,[]);
  console.log('PASS direct Create without checkbox, guide/floor distinction, lateral floor manual+automatic channels without moving input, optional safe adaptive corridor search and audited persisted widths, NoData does not expand, close-station result retained, floor elevation/signed offset persistence, default live checkbox, drawn axes without S.prof mutation, two-bank/one-bank/manual channels, scopes, schema/two-layer commit and second-layer rollback, intact inputs, undo/persistence, diagnostic reruns without creation, valid recovery, no partial layers, native failure, cancellation, stale preview recalculation, invalid fresh source rejection, redraw acceptance and visible tablet feedback');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
