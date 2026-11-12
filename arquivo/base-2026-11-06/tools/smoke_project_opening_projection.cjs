// Read-only full-app comparison. Real input files are only read; network,
// downloads and native writes are blocked in fresh isolated browser contexts.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const builds={baseline:path.join(root,'baseline/dist/GeoMine.html'),optimized:path.join(root,'dist/GeoMine.html')};
const files=process.argv.slice(2).length?process.argv.slice(2):[
 '/tmp/BN_Drenagem_com_shapes-current.ccmgis',
 '/Users/filipeciscato/Documents/Codex/2026-08-24/ola/work/GeoMine-project-open-20260924/input/BLOCASA.ccmgis'];
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const inputs=files.map(file=>({file,text:fs.readFileSync(file,'utf8')}));
const originalHashes=new Map(inputs.map(x=>[x.file,sha(x.text)]));
const fixture={app:'ALAGIS',v:1,projectId:'projection-qa',workCRS:'EPSG:31983',rasters:[],plates:[],
 groups:[{id:1,name:'Visíveis',collapsed:false},{id:2,name:'Ocultas',collapsed:false}],stack:['L:31','L:32','L:33'],
 layers:[
  {id:31,name:'Classes e filtro',gtype:'line',crs:'EPSG:31983',groupId:1,visible:true,fields:[{name:'CLASS',type:'C'},{name:'KEEP',type:'N'}],
   attrFilter:{field:'KEEP',op:'eq',value:1},sym:{mode:'cat',field:'CLASS',cats:[{value:'A',color:'#224488',stroke:'#224488',vis:true},{value:'B',color:'#ff0000',vis:false}]},
   features:[
    {geom:[[500000,7400000],[500020,7400010]],zg:[100,101],props:{CLASS:'A',KEEP:1}},
    {geom:[[650000,7600000],[650020,7600010]],props:{CLASS:'B',KEEP:1}},
    {geom:[[300000,7200000],[300020,7200010]],props:{CLASS:'A',KEEP:0}}]},
  {id:32,name:'Polígono oculto',gtype:'polygon',crs:'EPSG:31983',groupId:2,visible:false,fields:[{name:'AREA',type:'N',decimal:6}],
   features:[{multi:true,geom:[[[500000,7400000],[500010,7400000],[500010,7400010],[500000,7400010],[500000,7400000]],
    [[500003,7400003],[500003,7400007],[500007,7400007],[500007,7400003],[500003,7400003]]],props:{AREA:0}}]},
  {id:33,name:'Geográfica',gtype:'point',crs:'EPSG:4674',groupId:1,visible:true,fields:[],features:[{geom:[[-45,-23.5]],props:{ID:1}}]}
 ]};
async function openPage(browser,build){
 const context=await browser.newContext({viewport:{width:1280,height:800},hasTouch:true,
  userAgent:'Mozilla/5.0 (Linux; Android 14; SM-X610) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 page.on('download',()=>errors.push('unexpected download'));
 await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+build);
 await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineProjectOpening);
 await page.evaluate(()=>{
  S.setBase('Sem fundo');
  window.__qa={writes:0,saves:0,downloads:0,idb:[],pairs:0,direct:0};
  const p4=window.proj4;window.proj4=Object.assign(function(...args){
   if(args.length===2)__qa.pairs++;if(args.length===3)__qa.direct++;return p4.apply(this,args);
  },p4);
  window.__qaInitialToWGS=toWGS;window.__qaInitialReproj=reproj;
  window.showSaveFilePicker=()=>{__qa.writes++;throw Error('QA: unexpected native picker');};
  if(window.FileSystemFileHandle)FileSystemFileHandle.prototype.createWritable=function(){__qa.writes++;throw Error('QA: unexpected write');};
  window.saveProject=()=>{__qa.saves++;throw Error('QA: unexpected save');};
  window.download=()=>{__qa.downloads++;throw Error('QA: unexpected download');};
  const set=window.idbSet;window.idbSet=function(key,value){__qa.idb.push({key,txt:typeof value?.txt==='string'});return set.apply(this,arguments);};
  window.__qaHash=async value=>{
   const raw=JSON.stringify(value),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
   return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  };
  window.__qaDraw=()=>{
   const bounds=b=>b?.isValid?.()?[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()]:null;
   const coords=g=>Array.isArray(g)?g.map(coords):g&&Number.isFinite(g.lat)?[g.lat,g.lng,g.alt??null]:null;
   return {layers:S.layers.map(L=>{
    const children=[];L.llayer?.eachLayer(o=>children.push({feature:o._fidx??null,
     coordinates:o.getLatLngs?coords(o.getLatLngs()):o.getLatLng?coords(o.getLatLng()):null,
     bounds:o.getBounds?bounds(o.getBounds()):null,
     style:Object.fromEntries(['color','weight','fillColor','fillOpacity','opacity','dashArray','radius'].map(k=>[k,o.options?.[k]??null]))}));
    return {id:L.id,visible:L.visible,onMap:!!L.llayer&&map.hasLayer(L.llayer),deferred:!!L._projectDrawDeferred,
     bounds:L.llayer?.getBounds?bounds(L.llayer.getBounds()):null,children};
   }),rasters:S.rasters.map(r=>({id:r.id,visible:r.visible,deferred:!!r._projectDrawDeferred,
    onMap:!!r.overlay&&map.hasLayer(r.overlay),bounds:r.overlay?.getBounds?bounds(r.overlay.getBounds()):null,url:r._url||null})),
    fit:bounds(map.getBounds()),center:[map.getCenter().lat,map.getCenter().lng],zoom:map.getZoom()};
  };
  window.__qaSemantic=()=>{
   const d=projectData();
   return {workCRS:d.workCRS,projectId:d.projectId,layers:d.layers,rasters:d.rasters,groups:d.groups,stack:d.stack,
    img:d.img,wms:d.wms,plates:d.plates,layout:d.layout};
  };
 });
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 return {context,page,errors};
}
async function evaluateCase(browser,build,label,text){
 const {context,page,errors}=await openPage(browser,build);
 try{
  const initial=await page.evaluate(async text=>{
   const d=JSON.parse(text);window.__qaInput=d;const before=JSON.stringify(d);
   __qa.pairs=0;__qa.direct=0;const identity=window.toWGS,t=performance.now();loadProject(d);
   const ms=performance.now()-t,pairs=__qa.pairs,direct=__qa.direct;
   const returned={ms,pairs,direct,restored:window.toWGS===identity,
    inputBefore:await __qaHash(JSON.parse(before)),inputAfter:await __qaHash(d),semantic:await __qaHash(__qaSemantic()),draw:await __qaHash(__qaDraw()),
    counts:{layers:S.layers.length,rasters:S.rasters.length,features:S.layers.map(L=>L.features.length)},
    manual:GeoMineSessionAutosave.state.manual,on:S.auto.on,timer:S.auto.timer,
    activeWrites:!!GeoMineSessionAutosave.state.writeActive};return returned;
  },text);
  assert.equal(initial.restored,true,label+' restores original toWGS before returning');
  assert.equal(initial.manual,true);assert.equal(initial.on,false);assert.equal(initial.timer,null);assert.equal(initial.activeWrites,false);
  // Let the unchanged native-reconnection/live/deferred pipelines settle;
  // no local work-folder permission or remote resources exist in this context.
  await page.waitForTimeout(650);
  const settled=await page.evaluate(async()=>({semantic:await __qaHash(__qaSemantic()),draw:await __qaHash(__qaDraw()),
    scopeRestored:toWGS===__qaInitialToWGS&&reproj===__qaInitialReproj,writes:__qa.writes,saves:__qa.saves,downloads:__qa.downloads,
   drafts:__qa.idb.filter(x=>x.txt||/^autosave:|^activeProjectSession:/.test(x.key))}));
  assert.equal(settled.scopeRestored,true);assert.equal(settled.writes,0);assert.equal(settled.saves,0);assert.equal(settled.downloads,0);assert.deepEqual(settled.drafts,[]);
  let hidden=null;
  if(label==='synthetic'){
   hidden=await page.evaluate(async()=>{
    const L=S.layers.find(L=>L.id===31),h=S.layers.find(L=>L.id===32);
    const visible=L.features.map((f,i)=>featureVisible(L,f)?i:null).filter(i=>i!==null);
    const drawn=[];L.llayer.eachLayer(l=>{if(l._fidx!=null)drawn.push(l._fidx);});
    const deferred=!!h._projectDrawDeferred&&!h.llayer;nodeSetVis({t:'L',id:h.id,o:h},true);
    const drawnAfter=!!h.llayer&&map.hasLayer(h.llayer)&&!h._projectDrawDeferred;
    nodeSetVis({t:'L',id:h.id,o:h},false);
    return {visible,drawn,deferred,drawnAfter,hiddenAgain:!map.hasLayer(h.llayer),draw:await __qaHash(__qaDraw()),semantic:await __qaHash(__qaSemantic())};
   });
   assert.deepEqual(hidden.visible,[0]);assert.deepEqual(hidden.drawn,[0]);assert.equal(hidden.deferred,true);assert.equal(hidden.drawnAfter,true);assert.equal(hidden.hiddenAgain,true);
  }
  assert.deepEqual(errors,[]);return {initial,settled,hidden};
 }finally{await context.close();}
}
async function failureCases(browser){
 const {context,page,errors}=await openPage(browser,builds.optimized);
 try{
  const r=await page.evaluate(data=>{
   const initial=toWGS,restore=GeoMineProjectOpening.restore;let failed=false;
   GeoMineProjectOpening.restore=()=>{throw Error('QA deliberate restoration failure');};
   try{loadProject(JSON.parse(JSON.stringify(data)));}catch(e){failed=e.message==='QA deliberate restoration failure';}
   finally{GeoMineProjectOpening.restore=restore;}
   const cleanup=toWGS===initial;loadProject(JSON.parse(JSON.stringify(data)));
   const nextLoad=toWGS===initial&&S.layers.length===3;
   const scope=GeoMineProjectOpening.begin();let replacement=false,fallback=false,distinct=false;
   try{
    proj4.defs('QA:scope','+proj=utm +zone=23 +south +ellps=GRS80 +units=m +no_defs');
    const a=toWGS('QA:scope',500000,7400000);
    proj4.defs('QA:scope','+proj=utm +zone=24 +south +ellps=GRS80 +units=m +no_defs');
    const b=toWGS('QA:scope',500000,7400000),expected=initial('QA:scope',500000,7400000);
    replacement=JSON.stringify(b)===JSON.stringify(expected)&&a[0]!==b[0];
    fallback=JSON.stringify(toWGS('QA:missing',12,34))==='[12,34]';
    const x=toWGS('EPSG:31983',500000,7400000),y=toWGS('EPSG:31983',500000,7400000);distinct=x!==y&&JSON.stringify(x)===JSON.stringify(y);
   }finally{scope.end();scope.end();}
   return {failed,cleanup,nextLoad,replacement,fallback,distinct,finalCleanup:toWGS===initial};
  },fixture);
  assert.deepEqual(r,{failed:true,cleanup:true,nextLoad:true,replacement:true,fallback:true,distinct:true,finalCleanup:true});assert.deepEqual(errors,[]);
 }finally{await context.close();}
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const cases=[...inputs.map(i=>({label:path.basename(i.file),text:i.text})),{label:'synthetic',text:JSON.stringify(fixture)}],report=[];
  for(const c of cases){
   const baseline=await evaluateCase(browser,builds.baseline,c.label,c.text),optimized=await evaluateCase(browser,builds.optimized,c.label,c.text);
   for(const field of ['inputBefore','inputAfter','semantic','draw','counts'])assert.deepEqual(optimized.initial[field],baseline.initial[field],c.label+' initial '+field);
   for(const field of ['semantic','draw'])assert.equal(optimized.settled[field],baseline.settled[field],c.label+' settled '+field);
   assert.deepEqual(optimized.hidden,baseline.hidden,c.label+' hidden activation');
   assert.ok(optimized.initial.direct<=baseline.initial.direct,c.label+' never adds direct per-point projection construction');
   // The synthetic fixture also contains direct calls outside measurement
   // (e.g. geologic/CRS restoration); they need not disappear. The real
   // geographic project exercises the per-vertex measurement improvement.
   if(c.label!=='synthetic'&&baseline.initial.direct>0)assert.ok(optimized.initial.direct<baseline.initial.direct,c.label+' reuses measurement projection pairs');
   report.push({file:c.label,baselineMs:Math.round(baseline.initial.ms),optimizedMs:Math.round(optimized.initial.ms),
    baselineDirect:baseline.initial.direct,optimizedDirect:optimized.initial.direct,optimizedPairs:optimized.initial.pairs});
  }
  await failureCases(browser);
  for(const [file,digest] of originalHashes)assert.equal(sha(fs.readFileSync(file)),digest,'input file remains byte-identical');
  console.log(JSON.stringify({status:'PASS',cpuThrottle:4,builds:Object.fromEntries(Object.entries(builds).map(([k,v])=>[k,sha(fs.readFileSync(v))])),report,
   checks:['semantic/serialized geometry, attributes, CRS, groups, visibility, filters/classes and rasters match baseline',
    'all Leaflet coordinates, bounds, raster images, styles and fit agree exactly',
    'same input mutation as baseline; original files byte-identical',
    'hidden activation unchanged; only permitted filtered/class features drawn',
    'scope cleaned after success/error, next load works, changed definitions and unknown CRS fallbacks preserved',
    'no project autosave/native writes/downloads/page errors']},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
