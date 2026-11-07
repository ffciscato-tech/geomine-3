// Read-only diagnostic: copied application and existing local project fixtures.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const files=process.argv.slice(2),label=String(process.env.BENCH_LABEL||'').replace(/[^a-z0-9_-]/gi,'');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const reports=[];
  for(const file of Array.from({length:Math.max(1,Math.min(5,+process.env.BENCH_REPEATS||1))},()=>files).flat()){
   const page=await browser.newPage({viewport:{width:1280,height:800},hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; SM-X610) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
   await page.goto('file://'+(process.env.APP_PATH||path.join(root,'dist/GeoMine.html')));
   await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted);
   await page.evaluate(cached=>{
    S.setBase('Sem fundo');window.__perf={times:{},calls:[],done:false};
    if(cached){const base=toWGS,converters=new Map();window.toWGS=(crs,x,y)=>{if(crs==='EPSG:4326')return [x,y];try{let c=converters.get(crs);if(!c){c=proj4(crs,'EPSG:4326');converters.set(crs,c);}return c.forward([x,y]);}catch(_){return base(crs,x,y);}};}
    const names=['loadProject','readProjectFileCompat','drawLayer','renderRaster','refreshUI','renderLayers','renderTree','fitAll','zApply','reparaGeom','cavaSoldaIntersecaoAneis','cavaReparaCamadaLegada','baciaReparaLinhasExistentes','cavaMdtDaIntersecao','cavaRecalculaCamadaPeloMdt','autoAreaSyncLayer','syncAreaFields','buildLayout','plateApply','b64ToF32','projectRestoreNativeRasters','projectRestoreNativeOrtho','startAutosave'];
    for(const name of names){const fn=window[name];if(typeof fn!=='function')continue;window[name]=function(...a){const begin=performance.now();const finish=()=>{const ms=performance.now()-begin;const q=__perf.times[name]||(__perf.times[name]={calls:0,ms:0,max:0});q.calls++;q.ms+=ms;q.max=Math.max(q.max,ms);if(ms>40)__perf.calls.push({name,ms,layer:a[0]?.name});};let value;try{value=fn.apply(this,a);}catch(e){finish();throw e;}if(value?.then)return value.finally(finish);finish();return value;};}
    const parse=JSON.parse;JSON.parse=function(txt,...args){const begin=performance.now(),out=parse.call(this,txt,...args);if(out?.app&&typeof txt==='string'){__perf.parseMs=performance.now()-begin;__perf.bytes=txt.length;}return out;};
    const loader=window.loadProject;window.loadProject=function(...args){__perf.loadStart=performance.now();const out=loader.apply(this,args);__perf.loadEnd=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>{__perf.painted=performance.now();__perf.done=true;}));return out;};
   },process.env.PROBE_REUSE==='1');
   const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
   const t=Date.now();await page.locator('#projIn').setInputFiles(file);
   await page.waitForFunction(()=>__perf.done,{},{timeout:180000});
   await page.waitForTimeout(500);
   const data=await page.evaluate(()=>({...__perf,layers:S.layers.length,features:S.layers.reduce((n,l)=>n+l.features.length,0),rasters:S.rasters.length,errors:[]}));
   const {profile}=await cdp.send('Profiler.stop');const byId=new Map(profile.nodes.map(n=>[n.id,n.callFrame])),samples={};
   for(let i=0;i<profile.samples.length;i++){const frame=byId.get(profile.samples[i]),name=frame.functionName||'(anonymous)',ms=(profile.timeDeltas[i]||0)/1000;samples[name]=(samples[name]||0)+ms;}
   const report={file:path.basename(file),size:fs.statSync(file).size,wallMs:Date.now()-t,throttle:4,probeReuse:process.env.PROBE_REUSE==='1',...data,errors,hotspots:Object.entries(samples).sort((a,b)=>b[1]-a[1]).slice(0,35)};
   reports.push(report);console.log(JSON.stringify(report,null,2));
   fs.mkdirSync(path.join(root,'results'),{recursive:true});fs.writeFileSync(path.join(root,'results',path.basename(file)+(label?'_'+label:'')+(process.env.PROBE_REUSE?'_reuse':'')+'.profile.json'),JSON.stringify(profile));
   await page.close();
  }
  fs.writeFileSync(path.join(root,'results','opening-benchmark'+(label?'_'+label:'')+(process.env.PROBE_REUSE?'_reuse':'')+'.json'),JSON.stringify(reports,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
