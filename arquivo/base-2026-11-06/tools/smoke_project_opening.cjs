const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
const errors=[],page=await browser.newPage({viewport:{width:1280,height:800},hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; SM-X610) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'});page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'));await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted);
await page.evaluate(()=>{S.setBase('Sem fundo');window.__builds=0;const fn=buildLayout;buildLayout=function(...a){__builds++;return fn.apply(this,a)};});
const file=process.argv[2]||'/tmp/BN_Drenagem_com_shapes-current.ccmgis';
await page.locator('#projIn').setInputFiles(file);await page.waitForFunction(name=>S.auto?.name===name&&S.layers.length===7,path.basename(file));await page.waitForTimeout(700);
const state=await page.evaluate(()=>({builds:__builds,hidden:S.layers.filter(l=>!l.visible).map(l=>({id:l.id,deferred:l._projectDrawDeferred,drawn:!!l.llayer})),visible:S.layers.filter(l=>l.visible).map(l=>!!l.llayer),serialized:projectData()}));
assert.equal(state.builds,0);assert.equal(state.hidden.length,5);assert.ok(state.hidden.every(l=>l.deferred&&!l.drawn));assert.ok(state.visible.every(Boolean));
const original=JSON.parse(fs.readFileSync(file,'utf8'));
assert.deepEqual(state.serialized.layers.map(l=>({id:l.id,group:l.groupId,features:l.features.map(f=>({geom:f.geom,zg:f.zg}))})),original.layers.map(l=>({id:l.id,group:l.groupId,features:l.features.map(f=>({geom:f.geom,zg:f.zg}))})));
const toggled=await page.evaluate(()=>{const layers=S.layers.filter(l=>!l.visible);return layers.map(l=>{nodeSetVis({t:'L',id:l.id,o:l},true);const shown=!!l.llayer&&map.hasLayer(l.llayer)&&!l._projectDrawDeferred;nodeSetVis({t:'L',id:l.id,o:l},false);return shown&&!map.hasLayer(l.llayer);});});assert.ok(toggled.every(Boolean));
const raster=await page.evaluate(()=>{const d=projectData();d.rasters[0].visible=false;loadProject(d);const r=S.rasters[0],deferred=!!r._projectDrawDeferred&&!r.overlay;nodeSetVis({t:'R',id:r.id,o:r},true);const shown=!!r.overlay&&map.hasLayer(r.overlay)&&!r._projectDrawDeferred;nodeSetVis({t:'R',id:r.id,o:r},false);return {deferred,shown,hidden:!map.hasLayer(r.overlay)};});assert.deepEqual(raster,{deferred:true,shown:true,hidden:true});
await page.evaluate(()=>{window.__builds=0;window.__oldBuild=buildLayout;buildLayout=()=>{__builds++;};S._view='layout';document.getElementById('loSym').dispatchEvent(new Event('input'));});await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>__builds),1);
await page.evaluate(()=>{document.getElementById('loSym').dispatchEvent(new Event('input'));S._view='map';});await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>__builds),1);
assert.deepEqual(errors,[]);console.log('PASS current BN project: hidden vectors/DEM deferred, visibility toggles, full geometry/Z/groups serialized, no hidden Layout, visible Layout debounce, no page errors');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
