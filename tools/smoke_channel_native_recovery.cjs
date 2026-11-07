// Full offline app + genuine generated Float32 GeoTIFF. The workspace and
// picker are isolated fixtures; no user file, browser tab or project is used.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stage=path.resolve(__dirname,'..'),captures=path.resolve(process.env.QA_CAPTURE_DIR||path.join(stage,'resultados'));
const near=(a,b,t=.001)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);let passed=0;const pass=s=>{passed++;console.log('PASS '+s);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800},hasTouch:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
  await page.goto('file://'+path.resolve(process.env.APP_PATH||path.join(stage,'dist/GeoMine.html')));
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineChannelNativeSource&&window.GeoMineChannelExtraction);
  await page.evaluate(async()=>{
   GeoMineChannelLive.stop();S.setBase('Sem fundo');S.workCRS='EPSG:31982';S.projectId='native-recovery-synthetic';
   const nc=257,nr=257,cs=.5,xll=499959.75,yll=7399935.75,z=new Float32Array(nc*nr);
   for(let row=0;row<nr;row++)for(let col=0;col<nc;col++){const x=xll+(col+.5)*cs,y=yll+(nr-row-.5)*cs;z[row*nc+col]=100+.1*(x-500000)+Math.abs(y-7400000);}
   const file=new File([gridParaGeoTIFF({nc,nr,cs,xll,yll,z},S.workCRS)],'MDT_sintetico_original.tif',{type:'image/tiff',lastModified:123456});
   const d={nc:4,nr:4,cs:128.5/4,csy:128.5/4,xll,yll,z:new Float32Array(16).fill(12345),resampled:64.25,srcCRS:S.workCRS,srcDims:[nc,nr],_W0:nc,_H0:nr,_bb:[xll,yll,xll+nc*cs,yll+nr*cs],_nd:-9999};
   const raster={id:9958,name:'MDT sintético — original privado, prévia falsa',crs:S.workCRS,visible:false,style:{mode:'hipso'},d};
   S.rasters.push(raster);projectNativeBindRasterSource(raster,file);
   const axis=addLayer({name:'Eixo sintético — teste de recuperação',gtype:'line',crs:S.workCRS,fields:[],features:[{geom:[[500000,7400000],[500040,7400000]],props:{TESTE:'sintético'}}]});
   window.__nativeQA={raster,axis,file,preview:d,previewZ:d.z,previewBefore:JSON.stringify(d),reads:[],pickerCalls:[],files:new Map(),workspace:true};
   window.__nativeProjectSnapshot=()=>{const data=projectData();delete data.savedAt;return JSON.stringify(data);};
   const q=__nativeQA;q.source=JSON.stringify(axis.features.map(f=>({geom:f.geom,props:f.props})));
   const read=GeoMineTileRuntime.read;GeoMineTileRuntime.read=function(image,options,control){q.reads.push({window:options.window,width:options.width,height:options.height,samples:options.samples});return read(image,options,control);};
   let stamp=1000;
   q.dirs={rasters:{async getFileHandle(name,opts){
    if(!q.files.has(name)&&!opts?.create)throw Object.assign(Error('missing'),{name:'NotFoundError'});
    return {name,getFile:async()=>q.files.get(name),createWritable:async()=>{let data;return {write:async value=>{data=value;},close:async()=>{q.files.set(name,new File([data],name,{type:'image/tiff',lastModified:++stamp}));},abort:async()=>{}};}};
   }}};
   projectDirs=async()=>q.workspace?q.dirs:null;
   const open=GeoMineChannelDetails.open;GeoMineChannelDetails.open=function(ctx){q.review=ctx.snapshot;return open.call(this,ctx);};
   S.activeId=axis.id;ED.on=false;ED.sel=null;S.selFeat=null;GeoMineChannelExtraction.open();
  });
  const analyze=async()=>{await page.locator('#chanAnalyze').tap();await page.waitForFunction(()=>!document.getElementById('chanAnalyze').disabled);};
  const create=async()=>{await page.locator('#chanCommit').tap();await page.waitForFunction(()=>!document.getElementById('chanCommit').disabled);};
  const status=()=>page.locator('#chanStatus').textContent();
  const review=async()=>{assert.match(await status(),/Prévia pronta/);await page.locator('#chanDetails').tap();const r=await page.evaluate(()=>JSON.parse(JSON.stringify(__nativeQA.review)));await page.locator('#cdClose').tap();return r;};
  await page.locator('#chanRaster').selectOption('9958');await page.locator('#chanKindAgua').check();await page.locator('#chanMode').selectOption('depth');await page.locator('#chanHeight').fill('2.5');await page.locator('#chanInterval').fill('10');await page.locator('#chanLimit').check();await page.locator('#chanReach').fill('20');await page.locator('#chanLive').uncheck();
  await analyze();const raw=await review();
  for(const s of raw.outputs[0].sections){near(s.zAxis,100+.1*s.station);near(s.zFloor,100+.1*s.station);near(s.width,5);near(s.level,s.zFloor+2.5);}near(raw.resolution,.5);
  const source=await page.evaluate(()=>{const q=__nativeQA;return {same:q.raster.d===q.preview&&q.raster.d.z===q.previewZ&&JSON.stringify(q.raster.d)===q.previewBefore,attached:!!q.raster.d._img0,reads:q.reads};});
  assert.equal(source.same,true);assert.equal(source.attached,false);assert.ok(source.reads.length>0);
  for(const r of source.reads){assert.equal(r.width,undefined);assert.equal(r.height,undefined);assert.deepEqual(r.samples,[0]);assert.ok(r.window[2]-r.window[0]<=128&&r.window[3]-r.window[1]<=128);}
  await create();assert.match(await status(),/criad/i);assert.equal(await page.evaluate(()=>S.layers.length),3);
  pass('real TIFF recovered from the confirmed private Blob; native half-metre windows ignore the decoy preview without changing raster identity');
  const saved=await page.evaluate(async()=>{
   const q=__nativeQA;const ok=await projectAutoSaveRaster(q.raster,false);if(!ok)throw Error('Synthetic workspace save failed');
   q.pair=S.layers.find(l=>l._channelLink)._channelLink.id;q.pairIds=S.layers.filter(l=>l._channelLink?.id===q.pair).map(l=>l.id).sort((a,b)=>a-b);
   const data=projectData();q.workspace=false;loadProject(data);q.raster=S.rasters.find(r=>r.id===9958);q.axis=S.layers.find(l=>l.name==='Eixo sintético — teste de recuperação');
   return {descriptor:data.rasters.find(r=>r.rid===9958).projectNativeSource,path:q.raster.projectFile};
  });
  assert.ok(saved.descriptor?.fingerprint);assert.match(saved.path,/rasters\/.*\.tif$/);
  await page.waitForTimeout(80);await page.evaluate(()=>{const q=__nativeQA;GeoMineChannelLive.stop();q.workspace=true;q.reloadedGrid=q.raster.d;q.reloadedZ=q.raster.d.z;q.reloadedBefore=JSON.stringify(q.raster.d);S.activeId=q.axis.id;GeoMineChannelExtraction.open();});
  assert.equal(await page.evaluate(()=>!!__nativeQA.raster.d._img0||!!__nativeQA.raster._projectSourceRaw),false);
  await page.locator('#chanRaster').selectOption('9958');await page.locator('#chanKindAgua').check();await page.locator('#chanMode').selectOption('depth');await page.locator('#chanHeight').fill('3');await page.locator('#chanLive').uncheck();await analyze();const workspace=await review();
  for(const s of workspace.outputs[0].sections){near(s.width,6);near(s.level,s.zFloor+3);}near(workspace.resolution,.5);
  const recovered=await page.evaluate(()=>{const q=__nativeQA;return q.raster.d===q.reloadedGrid&&q.raster.d.z===q.reloadedZ&&JSON.stringify(q.raster.d)===q.reloadedBefore&&!q.raster.d._img0;});assert.equal(recovered,true);
  await create();assert.match(await status(),/atualiz/i);assert.equal(await page.evaluate(()=>S.layers.length),3);assert.deepEqual(await page.evaluate(()=>S.layers.filter(l=>l._channelLink?.id===__nativeQA.pair).map(l=>l.id).sort((a,b)=>a-b)),await page.evaluate(()=>__nativeQA.pairIds));
  pass('after genuine project reload, the fingerprinted workspace TIFF is recovered privately and updates the same destination pair');
  await page.evaluate(()=>{
   const q=__nativeQA,original=q.raster;
   q.missing={id:9959,name:'MDT sintético — arquivo original ausente',crs:S.workCRS,visible:false,style:{mode:'hipso'},d:{...original.d,z:original.d.z.slice()},projectFile:'ALAGIS/rasters/arquivo_ausente.tif',projectNativeSource:{...original.projectNativeSource}};
   delete q.missing.d._img0;delete q.missing.d._tiff;S.rasters.push(q.missing);S.activeId=q.axis.id;GeoMineChannelExtraction.open();
  });
  await page.locator('#chanRaster').selectOption('9959');await analyze();assert.doesNotMatch(await status(),/Prévia pronta/);assert.equal(await page.locator('#chanLocateNative').isVisible(),true);assert.equal(await page.locator('#chanDetails').isEnabled(),false);
  const missingCode=await page.evaluate(async()=>{try{const a=await GeoMineChannelDEM.prepare(__nativeQA.missing,{workCRS:S.workCRS,isCurrent:()=>true});a.close();return 'unexpected-success';}catch(e){return e.code;}});assert.equal(missingCode,'CHANNEL_NATIVE_MISSING');
  const buttonBox=await page.locator('#chanLocateNative').boundingBox();assert.ok(buttonBox&&buttonBox.y>=0&&buttonBox.y+buttonBox.height<=800);
  fs.mkdirSync(captures,{recursive:true});await page.waitForFunction(()=>getComputedStyle(document.getElementById('toast')).opacity==='0');
  await page.screenshot({path:path.join(captures,'channel-native-missing-tablet-synthetic-1280x800.png')});
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:path.join(captures,'channel-native-missing-desktop-synthetic-1440x1000.png')});await page.setViewportSize({width:1280,height:800});
  pass('a genuinely missing source returns CHANNEL_NATIVE_MISSING and presents the native-file action in the visible footer');
  await page.evaluate(()=>{
   const q=__nativeQA;q.cancelSnapshot=__nativeProjectSnapshot();q.missingGrid=q.missing.d;q.originalPicker=window.rasEscolherNativoAgora;
   const b=document.getElementById('chanLocateNative'),handler=b.onclick;b.onclick=function(...args){q.inOnClick=true;try{return handler.apply(this,args);}finally{q.inOnClick=false;}};
   window.rasEscolherNativoAgora=function(r){q.pickerCalls.push({id:r.id,synchronous:q.inOnClick,activated:navigator.userActivation.isActive});return Promise.resolve(false);};
  });
  await page.locator('#chanLocateNative').tap();await page.waitForFunction(()=>!document.getElementById('chanLocateNative').disabled);
  const canceled=await page.evaluate(()=>{const q=__nativeQA;return {calls:q.pickerCalls,same:q.missing.d===q.missingGrid&&__nativeProjectSnapshot()===q.cancelSnapshot,layers:S.layers.length};});
  assert.equal(canceled.calls.length,1);assert.equal(canceled.calls[0].id,9959);assert.equal(canceled.calls[0].synchronous,true);assert.equal(canceled.calls[0].activated,true);assert.equal(canceled.same,true);assert.equal(canceled.layers,3);
  await page.locator('#chanRaster').selectOption('9958');assert.equal(await page.locator('#chanLocateNative').isVisible(),false);await analyze();assert.match(await status(),/Prévia pronta/);
  await page.evaluate(()=>{window.rasEscolherNativoAgora=__nativeQA.originalPicker;});
  pass('native picker is invoked synchronously inside the trusted tap; cancellation preserves the project and another raster hides the missing-source action');
  await page.evaluate(()=>{
   const nc=81,nr=41,cs=1,xll=499979.5,yll=7399979.5,z=new Float32Array(nc*nr),slope=.5/(1.931/2);
   for(let r=0;r<nr;r++)for(let c=0;c<nc;c++)z[r*nc+c]=63.82+slope*Math.abs(yll+(nr-r-.5)*cs-7400000);
   __nativeQA.narrow={id:9960,name:'Teste controlado — faixa estreita, MDT sintético de 1 m',crs:S.workCRS,visible:false,style:{mode:'hipso'},d:{nc,nr,cs,csy:cs,xll,yll,z,zmin:63.82,zmax:75,native:true,resampled:1,srcCRS:S.workCRS}};
   S.rasters.push(__nativeQA.narrow);S.activeId=__nativeQA.axis.id;GeoMineChannelExtraction.open();
  });
  await page.locator('#chanRaster').selectOption('9960');await page.locator('#chanKindAgua').check();await page.locator('#chanMode').selectOption('depth');await page.locator('#chanHeight').fill('.5');await analyze();const narrow=await review();
  near(narrow.resolution,1);assert.equal(narrow.outputs[0].sections.length,5);
  for(const s of narrow.outputs[0].sections){near(s.width,1.931);near(s.zFloor,63.82);near(s.level,64.32);assert.equal(s.resolutionLimited,true);}
  assert.match(await page.locator('#chanChart').textContent(),/precis[aã]o limitada.*pixel.*1[.,]00/i);assert.match(await page.locator('#chanSummary').textContent(),/estreit|pixel/i);assert.equal(await page.locator('#chanLocateNative').isVisible(),false);
  await page.locator('#chanChart').scrollIntoViewIfNeeded();await page.waitForFunction(()=>getComputedStyle(document.getElementById('toast')).opacity==='0');
  await page.evaluate(()=>{const label=document.createElement('div');label.id='nativeQALabel';label.textContent='Teste controlado — terreno sintético; não é o projeto do usuário';label.style.cssText='position:fixed;top:134px;right:16px;z-index:100000;max-width:420px;padding:8px 12px;background:#fff3cd;color:#3f3517;border:1px solid #c99e31;font:600 13px system-ui;pointer-events:none';document.body.append(label);});
  await page.screenshot({path:path.join(captures,'channel-native-narrow-tablet-synthetic-1280x800.png')});
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:path.join(captures,'channel-native-narrow-desktop-synthetic-1440x1000.png')});await page.locator('#nativeQALabel').evaluate(e=>e.remove());await page.setViewportSize({width:1280,height:800});
  await create();assert.match(await status(),/atualiz/i);assert.equal(await page.evaluate(()=>S.layers.length),3);
  const limited=await page.evaluate(()=>{const layers=S.layers.filter(l=>l._channelLink?.id===__nativeQA.pair);return {sections:layers.find(l=>l.gtype==='line').features.map(f=>f.props),polygons:layers.find(l=>l.gtype==='polygon').features.map(f=>f.props)};});
  assert.ok(limited.sections.every(p=>p.RES_LIMIT===1&&Math.abs(p.LARG_M-1.931)<.001));assert.ok(limited.polygons.every(p=>p.N_ESTREITA===5));
  pass('positive 1.931 m depth width on native 1 m pixels is generated with explicit limited-resolution flags, without widening or duplicating the destination');
  assert.equal(await page.evaluate(()=>JSON.stringify(__nativeQA.axis.features.map(f=>({geom:f.geom,props:f.props})))===__nativeQA.source),true);assert.deepEqual(errors,[]);
  console.log(`channel native recovery browser: ${passed}/${passed} PASS`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
