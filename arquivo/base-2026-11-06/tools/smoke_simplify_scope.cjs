const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
const page=await browser.newPage({viewport:{width:1400,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'));await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted);
await page.evaluate(()=>{S.setBase('Sem fundo');S.workCRS='EPSG:31982';ED.on=false;ED.sel=null;S.selFeat=null;window.__L=addLayer({name:'Curvas teste',gtype:'line',crs:S.workCRS,fields:[{name:'COTA',type:'N'}],features:[{multi:false,geom:[[583800,7075000],[583810,7075000.1],[583820,7075000]],zg:[100,120,130],props:{COTA:100}},{multi:false,geom:[[583800,7075010],[583810,7075010.1],[583820,7075010]],zg:[200,220,230],props:{COTA:200}}]});S.undo=[];window.__original=JSON.stringify(__L.features);edAbreSimplificar();});
assert.equal(await page.locator('#simplifyScope').inputValue(),'layer');assert.equal(await page.locator('#simplifyScope option[value=feature]').isDisabled(),true);
await page.locator('#simplifyTolerance').fill('1');await page.locator('#simplifyApply').click();await page.waitForFunction(()=>!document.getElementById('simplifyModal').classList.contains('on'));
const whole=await page.evaluate(()=>({original:JSON.stringify(__L.features)===__original,count:S.layers.length,features:activeLayer().features.map(f=>({n:f.geom.length,z:f.zg,props:f.props})),name:activeLayer().name,roundtrip:projectData().layers.find(l=>l.id===activeLayer().id).features.map(f=>f.zg)}));
assert.equal(whole.original,true);assert.equal(whole.count,2);assert.deepEqual(whole.features,[{n:2,z:[100,130],props:{COTA:100}},{n:2,z:[200,230],props:{COTA:200}}]);assert.deepEqual(whole.roundtrip,[[100,130],[200,230]]);
await page.evaluate(()=>{doUndo();S.activeId=__L.id;ED.sel=null;S.selFeat={layer:__L,layerId:__L.id,idx:1};edAbreSimplificar();});assert.equal(await page.locator('#simplifyScope').inputValue(),'feature');
await page.locator('#simplifyApply').click();await page.waitForFunction(()=>!document.getElementById('simplifyModal').classList.contains('on'));
assert.deepEqual(await page.evaluate(()=>__L.features.map(f=>f.geom.length)),[3,2]);await page.evaluate(()=>doUndo());assert.equal(await page.evaluate(()=>JSON.stringify(__L.features)===__original),true);
const pure=await page.evaluate(()=>{
 const api=GeoMineSimplify,ring=[[0,0],[10,0],[10,10],[0,10],[0,0]],hole=[[2,2],[3,2],[3,3],[2,3],[2,2]],L={gtype:'polygon',crs:S.workCRS};
 const p=api.simplifyFeature(L,{geom:[ring,hole],multi:true,zg:[[0,1,2,3,0],[5,6,7,8,5]],props:{NAME:'holes'}},10000);
 const line=api.simplifyFeature({gtype:'line',crs:S.workCRS},{geom:[[[0,0,0],[5,.1,5],[10,0,10]],[[0,10],[5,10.1],[10,10]]],multi:true,zg:[[0,5,10],[null,30,40]],props:{}},1);
 const geographic=ring.slice(0,3).map(p=>reproj(S.workCRS,'EPSG:4326',583800+p[0],7075000+p[1]));
 const geo=api.simplifyFeature({gtype:'line',crs:'EPSG:4326'},{geom:geographic,props:{}},.01);
 let invalid=false;try{api.simplifyFeature({gtype:'line',crs:S.workCRS},{geom:[[0,0],[2,2],[3,0]],zg:[1,2]},1)}catch(e){invalid=true;}
 const legacy=api.simplifyFeature({gtype:'line',crs:S.workCRS},{geom:[[[0,0],[5,.1],[10,0]]],multi:true,zg:[0,5,10]},1);
 return {rings:p.feature.geom,kept:p.kept,z:line.feature.zg,legacy:legacy.feature.zg,geo:geo.feature.geom,originalGeo:geographic,invalid};
});assert.equal(pure.rings.length,2);assert.equal(pure.kept,2);assert.deepEqual(pure.z,[[0,10],[null,40]]);assert.deepEqual(pure.legacy,[[0,10]]);assert.deepEqual(pure.geo,pure.originalGeo);assert.equal(pure.invalid,true);
await page.evaluate(()=>{S.activeId=__L.id;edAbreSimplificar();__L.locked=true;});await page.locator('#simplifyApply').click();assert.match(await page.locator('#simplifyResult').textContent(),/bloqueada/);assert.equal(await page.evaluate(()=>JSON.stringify(__L.features)===__original),true);
await page.evaluate(()=>{__L.locked=false;});await page.locator('#simplifyTolerance').fill('-1');await page.locator('#simplifyApply').click();assert.match(await page.locator('#simplifyResult').textContent(),/tolerância/);
await page.locator('#simplifyTolerance').fill('1');await page.setViewportSize({width:800,height:900});await page.locator('#simplifyModal .modal').screenshot({path:path.resolve(__dirname,'../dist/simplify-panel.png')});assert.deepEqual(errors,[]);
await page.locator('#simplifyClose').click();
await page.evaluate(()=>{window.__other=addLayer({name:'Outra camada',gtype:'line',crs:S.workCRS,features:[{geom:[[0,0],[5,.1],[10,0]],props:{}}]});S.activeId=__L.id;edAbreSimplificar();});
await page.locator('#simplifyLayer').selectOption(await page.evaluate(()=>String(__other.id)));
assert.equal(await page.locator('#simplifyScope').inputValue(),'layer');assert.equal(await page.locator('#simplifyScope option[value=feature]').isDisabled(),true);
await page.locator('#simplifyClose').click();assert.equal(await page.evaluate(()=>S.layers.length),2);
assert.deepEqual(errors,[]);
console.log('PASS layer/feature UI, switching layers and cancel, independent originals, selected feature only, undo both scopes, attributes/Z and project serialization, multipart/holes/closed rings, legacy flat Z, geographic coordinates, invalid Z, lock and validation');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
