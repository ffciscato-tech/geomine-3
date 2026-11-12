// Full app, synthetic native raster only. No user project or real download.
// Exercises axis-referenced 2D fill and its actual in-app PNG exporter.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stage=path.resolve(__dirname,'..'),captures=path.resolve(process.env.QA_CAPTURE_DIR||path.join(stage,'resultados'));
const near=(a,b,t=.001)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
let passed=0;const pass=name=>{passed++;console.log('PASS '+name);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800},hasTouch:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
  await page.goto('file://'+path.resolve(process.env.APP_PATH||path.join(stage,'dist/GeoMine.html')));
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineChannelAxisFill&&window.GeoMineChannelDetails);
  await page.evaluate(()=>{
   GeoMineChannelLive.stop();S.setBase('Sem fundo');S.projectId='axis-fill-synthetic-qa';S.workCRS='EPSG:31982';
   const nc=161,nr=65,cs=.5,xll=499989.75,yll=7399983.75,z=new Float32Array(nc*nr),island=new Float32Array(nc*nr);
   for(let r=0;r<nr;r++)for(let c=0;c<nc;c++){
    const x=xll+(c+.5)*cs,y=yll+(nr-r-.5)*cs,base=100+.1*(x-500000),terrain=base+Math.abs(y-7400000);
    z[r*nc+c]=terrain;island[r*nc+c]=Math.hypot(x-500020,y-7399999)<=.9?base+8:terrain;
   }
   window.__axisQA={grid:{nc,nr,cs,csy:cs,xll,yll,z,zmin:99,zmax:132,native:true,resampled:1,srcCRS:S.workCRS},z,island,downloads:[]};
   const q=__axisQA;q.raster={id:9974,name:'MDT sintético — teste 2D, não projeto do usuário',crs:S.workCRS,visible:false,style:{mode:'hipso'},d:q.grid};S.rasters.push(q.raster);
   q.axis=addLayer({name:'Teste controlado — eixo 1 m acima do fundo',gtype:'line',crs:S.workCRS,fields:[],features:[{geom:[[500000,7400001],[500040,7400001]],props:{TESTE:1}}]});
   q.before={geometry:JSON.stringify(q.axis.features.map(f=>({geom:f.geom,props:f.props}))),z:Array.from(z),undo:S.undo.length,layers:S.layers.length};
   const original=GeoMineChannelDetails.open;GeoMineChannelDetails.open=function(ctx){q.review=ctx.snapshot;return original.call(this,ctx);};
   window.download=async(blob,name,options)=>{q.downloads.push({blob,name,options});return {status:'download-requested'};};
   S.activeId=q.axis.id;ED.on=false;ED.sel=null;S.selFeat=null;GeoMineChannelExtraction.open();
  });
  const analyze=async()=>{await page.locator('#chanAnalyze').click();await page.waitForFunction(()=>!document.getElementById('chanAnalyze').disabled);};
  const review=async()=>{assert.match(await page.locator('#chanStatus').textContent(),/Prévia pronta/,await page.locator('#chanStatus').textContent());await page.locator('#chanDetails').click();const data=await page.evaluate(()=>JSON.parse(JSON.stringify(__axisQA.review)));await page.locator('#cdClose').click();return data;};
  // "Gerar como" separa os métodos: calha = automático; massa de água = altura/profundidade.
  const methods=()=>page.locator('#chanMode option').evaluateAll(o=>o.map(x=>x.value));assert.deepEqual(await methods(),['auto']);
  await page.locator('#chanKindAgua').check();assert.deepEqual(await methods(),['axisDepth','depth']);await page.locator('#chanKindCalha').check();
  assert.equal(await page.locator('#chanMode').inputValue(),'auto');
  await page.locator('#chanRaster').selectOption('9974');await page.locator('#chanInterval').fill('10');await page.locator('#chanLimit').check();await page.locator('#chanReach').fill('20');await page.locator('#chanLive').uncheck();
  await analyze();assert.equal(await page.locator('#chanCommit').isEnabled(),true);assert.equal(await page.locator('#chanDepthAlternative').isVisible(),true);
  const empty=await page.locator('#chanHeight').inputValue();await page.locator('#chanDepthAlternative').click();assert.equal(await page.locator('#chanMode').inputValue(),'axisDepth');assert.equal(await page.locator('#chanHeight').inputValue(),empty);
  assert.match(await page.locator('#chanHeightLabel').textContent(),/terreno no eixo|altura.*eixo/i);
  pass('axis-height mode is listed with depth under water mass, auto under channel, and the error shortcut does not invent a height');
  await page.locator('#chanHeight').fill('2');await analyze();const axis=await review(),out=axis.outputs[0];
  assert.equal(axis.mode,'axisDepth');assert.equal(out.sections.length,5);assert.ok(out.polygons.length>=1);
  assert.equal(out.refCount,161);near(out.refStep,.25);
  for(const s of out.sections){near(s.zAxis,101+.1*s.station);near(s.level,s.zAxis+2);near(s.zReference,s.zAxis);near(s.effectiveHeight,2);assert.equal(s.referenceKind,'axis');assert.equal(s.referenceOffset,0);assert.equal(s.zFloor,null);assert.equal(s.floorOffset,null);assert.equal(s.floorPoint,null);assert.deepEqual(s.referencePoint,s.center);near(s.width,s.wetIntervals.reduce((n,w)=>n+w.width,0));assert.ok(s.spanWidth+.001>=s.width);assert.ok(s.profile.some(p=>Number.isFinite(p.level)&&p.wet===true));}
  near(out.sections[0].level,103);near(out.sections.at(-1).level,107);assert.equal(await page.evaluate(()=>S.layers.length),1);
  pass('2D level uses terrain ON the offset guide plus 2 m: 103→107 m, with no floor inference');
  await page.locator('#chanMode').selectOption('depth');await analyze();const depth=await review();
  for(const s of depth.outputs[0].sections){near(s.zFloor,100+.1*s.station);near(s.level,s.zFloor+2);near(s.width,4);}
  for(let i=0;i<5;i++){near(out.sections[i].level-depth.outputs[0].sections[i].level,1);assert.ok(out.sections[i].width>depth.outputs[0].sections[i].width);}
  pass('existing floor-depth mode stays distinct: same height gives a level 1 m lower, without migration');
  await page.locator('#chanMode').selectOption('axisDepth');await page.locator('#chanReach').fill('2');await analyze();
  assert.doesNotMatch(await page.locator('#chanStatus').textContent(),/Prévia pronta/);assert.equal(await page.locator('#chanCommit').isEnabled(),true);assert.equal(await page.evaluate(()=>S.layers.length),1);
  await page.locator('#chanLimit').uncheck();await analyze();const expanded=await review();assert.equal(expanded.outputs[0].searchReach,10);near(expanded.outputs[0].sections[0].level,103);
  pass('manual lateral extent is not a fabricated bank; adaptive search reuses the same target height');
  await page.evaluate(()=>{__axisQA.grid.z=__axisQA.island;});await analyze();assert.match(await page.locator('#chanStatus').textContent(),/Prévia pronta/);
  await page.locator('#chanDetails').click();const island=await page.evaluate(()=>JSON.parse(JSON.stringify(__axisQA.review))),islandOut=island.outputs[0];
  assert.ok(islandOut.polygons.some(p=>p.length>1),'connected 2D fill must retain the dry island hole');
  const middle=islandOut.sections.find(s=>Math.abs(s.station-20)<.001);assert.ok(middle.wetIntervals.length>=2);assert.ok(middle.width<middle.spanWidth);
  assert.match(await page.locator('#cdPreview').textContent(),/Altura acima do eixo: 2,00 m/);assert.match(await page.locator('#cdPreview').textContent(),islandOut.contour?.applied?/Contorno simplificado/:/Mancha 2D completa/);
  const svg=await page.locator('#cdPreview svg').evaluate(s=>s.outerHTML);assert.match(svg,/fill-rule="evenodd"/);assert.ok((svg.match(/data-role="axis-fill-polygon"/g)||[]).length===islandOut.polygons.length);assert.doesNotMatch(svg,/Fundo |NaN|Infinity|undefined/);
  const overflow=await page.locator('#cdPreview svg').evaluate(svg=>[...svg.querySelectorAll('text')].map(t=>{const b=t.getBBox();return {text:t.textContent,x:b.x,y:b.y,right:b.x+b.width,bottom:b.y+b.height};}).filter(b=>b.x<0||b.y<0||b.right>1600.5||b.bottom>1140.5));assert.deepEqual(overflow,[]);
  fs.mkdirSync(captures,{recursive:true});await page.waitForFunction(()=>getComputedStyle(document.getElementById('toast')).opacity==='0');await page.screenshot({path:path.join(captures,'axis-fill-details-app-synthetic-1280x800.png')});
  await page.locator('#cdSelected').click();await page.waitForFunction(()=>!document.getElementById('cdSelected').disabled);assert.equal(await page.locator('#cdDownload').isEnabled(),true,await page.locator('#cdStatus').textContent());assert.equal(await page.evaluate(()=>__axisQA.downloads.length),0);
  await page.locator('#cdDownload').click();const png=await page.evaluate(async()=>Array.from(new Uint8Array(await __axisQA.downloads[0].blob.arrayBuffer()))),bytes=Buffer.from(png);assert.equal(bytes.readUInt32BE(16),1600);assert.equal(bytes.readUInt32BE(20),1140);fs.writeFileSync(path.join(captures,'axis-fill-details-export-synthetic-1600x1140.png'),bytes);
  await page.locator('#cdAll').click();await page.waitForFunction(()=>!document.getElementById('cdAll').disabled);assert.equal(await page.locator('#cdDownload').isEnabled(),true);await page.locator('#cdDownload').click();
  const index=await page.evaluate(async()=>JSON.parse(await (await JSZip.loadAsync(await __axisQA.downloads[1].blob.arrayBuffer())).file('indice.json').async('string')));
  assert.ok(index.items.every(i=>i.mode==='axisDepth'&&i.depth===null&&i.heightAboveAxis===2&&i.referenceKind==='axis'&&i.mapScope==='full-axis'&&i.widthDefinition==='sum-of-wet-intervals'));
  assert.deepEqual(index.items[0].contour,islandOut.contour);
  await page.locator('#cdClose').click();pass('2D dry island remains a real hole; split wet widths, variable surface and full-axis geometry survive PNG/ZIP export');
  for(const id of ['chanAnalyze','chanCommit']){const b=await page.locator('#'+id).boundingBox();assert.ok(b&&b.y>=0&&b.y+b.height<=800,id+' remains visible on tablet');}
  assert.equal(await page.locator('#chanConfirm').count(),0);await page.locator('#chanLive').check();await page.locator('#chanCommit').click();assert.equal(await page.locator('#chanAPP').isVisible(),false);
  const saved=await page.evaluate(()=>{const generated=S.layers.filter(l=>l!==__axisQA.axis),polygon=generated.find(l=>l.gtype==='polygon');__axisQA.link=polygon._channelLink?.id;return {layers:generated.map(l=>({name:l.name,gtype:l.gtype,features:l.features,link:l._channelLink})),geojson:layerToGeoJSON(polygon),data:projectData(),sourceIntact:JSON.stringify(__axisQA.axis.features.map(f=>({geom:f.geom,props:f.props})))===__axisQA.before.geometry&&__axisQA.z.every((v,i)=>v===__axisQA.before.z[i])};});
  assert.equal(saved.layers.length,2);assert.equal(saved.sourceIntact,true);const polys=saved.layers.find(l=>l.gtype==='polygon'),lines=saved.layers.find(l=>l.gtype==='line');assert.match(polys.name,/Faixa por altura/);assert.ok(polys.features.some(f=>f.geom.length>1));assert.ok(lines.features.length>5);
  for(const f of lines.features){const p=f.props;near(p.ALT_EIXO,2);near(p.Z_REF,p.Z_EIXO);near(p.NIVEL_M,p.Z_EIXO+2);assert.equal(p.Z_FUNDO,null);assert.equal(p.DESLOC_M,null);assert.ok(p.LARG_TOTAL+.001>=p.LARG_M);assert.ok(p.ENVOLV_M+.001>=p.LARG_TOTAL);assert.match(p.REF_NIVEL,/eixo/i);}
  assert.deepEqual(saved.data.layers.find(l=>l.name===polys.name).features,polys.features);
  assert.ok(saved.geojson.features.some(f=>f.geometry.type==='Polygon'?f.geometry.coordinates.length>1:f.geometry.type==='MultiPolygon'&&f.geometry.coordinates.some(p=>p.length>1)),'GeoJSON retains dry island holes');
  assert.ok(saved.layers.every(l=>l.link?.version===2&&l.link.entries.length===1&&l.link.entries[0].options.mode==='axisDepth'));
  assert.ok(saved.layers.every(l=>l.features.every(f=>f._channelRecipeId===l.link.entries[0].id)));
  for(const layer of saved.layers)for(const f of layer.features){assert.equal(f.props.N_REF,161);near(f.props.PASSO_REF,.25);}
  pass('commit preserves hole rings and each wet section interval, audited axis reference fields and project serialization; no APP shortcut');
  await page.locator('#chanClose').click();
  const restored=await page.evaluate(()=>{
   const polygon=S.layers.find(l=>l._channelLink?.id===__axisQA.link&&l.gtype==='polygon');polygon.color='#8b45a7';polygon.sym.color='#8b45a7';polygon.weight=4;
   const data=projectData(),before=JSON.stringify(polygon.features);loadProject(data);
   __axisQA.axis=S.layers.find(l=>l.name==='Teste controlado — eixo 1 m acima do fundo');__axisQA.raster=S.rasters.find(r=>r.id===9974);
   const loaded=S.layers.find(l=>l._channelLink?.id===__axisQA.link&&l.gtype==='polygon');
   // The synthetic in-memory raster is explicitly reattached after reopen;
   // this does not pretend a portable project retained an original TIFF.
   __axisQA.raster.d=__axisQA.grid;__axisQA.raster.crs=S.workCRS;GeoMineChannelLive.retry();
   return {same:JSON.stringify(loaded.features)===before,mode:loaded._channelLink.entries[0].options.mode,color:loaded.color,weight:loaded.weight,holes:loaded.features.some(f=>f.geom.length>1)};
  });
  assert.equal(restored.same,true);assert.equal(restored.mode,'axisDepth');assert.equal(restored.color,'#8b45a7');assert.equal(restored.weight,4);assert.equal(restored.holes,true);
  await page.evaluate(()=>{__axisQA.axis.features[0].geom[1][0]=500050;drawLayer(__axisQA.axis);refreshUI();});
  await page.waitForFunction(()=>{const layers=S.layers.filter(l=>l._channelLink?.id===__axisQA.link);return layers.length===2&&layers.every(l=>l._channelLink.entries.every(e=>e.state==='ready'))&&!GeoMineChannelLive.state().running&&layers.find(l=>l.gtype==='polygon').features[0].props.N_SECOES===6;});
  const updated=await page.evaluate(()=>{const layers=S.layers.filter(l=>l._channelLink?.id===__axisQA.link),p=layers.find(l=>l.gtype==='polygon'),s=layers.find(l=>l.gtype==='line');return {modes:layers.map(l=>l._channelLink.entries[0].options.mode),color:p.color,weight:p.weight,holes:p.features.some(f=>f.geom.length>1),end:s.features.at(-1).props};});
  assert.deepEqual(updated.modes,['axisDepth','axisDepth']);assert.equal(updated.color,'#8b45a7');assert.equal(updated.weight,4);assert.equal(updated.holes,true);near(updated.end.PROG_M,50);near(updated.end.Z_REF,106);near(updated.end.NIVEL_M,108);
  pass('saved/reopened axis-height recipe keeps holes and style; editing the guide recalculates in axisDepth with local level 108 m');
  await page.evaluate(()=>{GeoMineChannelLive.stop();S.activeId=__axisQA.axis.id;GeoMineChannelExtraction.open();});
  await page.locator('#chanRaster').selectOption('9974');await page.locator('#chanKindAgua').check();await page.locator('#chanMode').selectOption('axisDepth');await page.locator('#chanHeight').fill('2');await page.locator('#chanLive').uncheck();
  await page.evaluate(()=>{const z=__axisQA.island.slice(),g=__axisQA.grid;const c=Math.round((500020-g.xll)/g.cs-.5),r=Math.round(g.nr-.5-(7400001-g.yll)/g.cs);z[r*g.nc+c]=NaN;g.z=z;});
  await analyze();assert.doesNotMatch(await page.locator('#chanStatus').textContent(),/Prévia pronta/);assert.equal(await page.locator('#chanCommit').isEnabled(),true);assert.equal(await page.locator('#chanDetails').isEnabled(),false);assert.equal(await page.evaluate(()=>S.layers.length),3);
  pass('NoData on the reference axis blocks a new fill without replacing the previously committed layers');
  // Exercise the app's actual worker serializer and embedded UMD dependency,
  // including the union fallback that simple rectangular masks do not need.
  const workerCheck=await page.evaluate(async()=>{
   const url=URL.createObjectURL(new Blob([GeoMineChannelExtraction.workerSource('axisDepth')],{type:'text/javascript'})),worker=new Worker(url);
   const call=(method,args)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Worker QA timeout')),20000);
    worker.onmessage=e=>{clearTimeout(timer);e.data.error?reject(Error(e.data.error)):resolve(e.data.result);};
    worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};worker.postMessage({method,args});
   });
   try{
    const options={interval:2,lateralStep:.25,resolution:.5,reach:6},settings={mode:'axisDepth',height:2,resolution:.5};
    const plan=await call('plan',[[[500000,7400000],[500010,7400000]],options]);
    let seed=173,dissolved=0,maxAreaError=0,closed=true;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
    for(let trial=0;trial<40;trial++){
     const islands=new Set();for(let x=1;x<19;x++)for(let y=0;y<4;y++)if(random()<.2)islands.add(x+','+y);
     const heights=plan.points.map(([east,north])=>{const x=east-500000,y=north-7400000;return y>=.5&&y<2&&islands.has(Math.floor(x/.5)+','+Math.floor(y/.5))?104:100+Math.abs(y);});
     const result=await call('analyze',[plan,heights,settings]);if(result.dissolved)dissolved++;
     maxAreaError=Math.max(maxAreaError,Math.abs(result.area-result.wetCellCount*.25));
     closed=closed&&result.polygons.every(p=>p.every(r=>JSON.stringify(r[0])===JSON.stringify(r.at(-1))));
    }
    return {trials:40,dissolved,maxAreaError,closed};
   }finally{worker.terminate();URL.revokeObjectURL(url);}
  });
  assert.equal(workerCheck.trials,40);assert.ok(workerCheck.dissolved>0);near(workerCheck.maxAreaError,0,1e-7);assert.equal(workerCheck.closed,true);
  pass('actual app worker resolves polygon-union UMD fallback in 40 obstacle masks, preserving exact wet-cell area and closed rings');
  assert.deepEqual(errors,[]);console.log(`axis fill browser: ${passed}/${passed} PASS`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
