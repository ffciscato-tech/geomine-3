const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
const page=await browser.newPage({viewport:{width:1400,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'));await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted);
await page.evaluate(()=>{S.setBase('Sem fundo');S.workCRS='EPSG:31982';ED.on=false;ED.sel=null;S.selFeat=null;window.__L=addLayer({name:'Curvas teste',gtype:'line',crs:S.workCRS,fields:[{name:'COTA',type:'N'}],features:[{multi:false,geom:[[583800,7075000],[583810,7075000.1],[583820,7075000]],zg:[100,120,130],props:{COTA:100}},{multi:false,geom:[[583800,7075010],[583810,7075010.1],[583820,7075010]],zg:[200,220,230],props:{COTA:200}}]});S.undo=[];window.__original=JSON.stringify(__L.features);edAbreSuavizar();});
assert.equal(await page.locator('#smoothScope').inputValue(),'layer');assert.equal(await page.locator('#smoothScope option[value=feature]').isDisabled(),true);
await page.locator('#smoothIterations').fill('1');await page.locator('#smoothApply').click();await page.waitForFunction(()=>!document.getElementById('smoothModal').classList.contains('on'));
const whole=await page.evaluate(()=>({original:JSON.stringify(__L.features)===__original,count:S.layers.length,features:activeLayer().features.map(f=>({n:f.geom.length,z:f.zg,props:f.props})),name:activeLayer().name,roundtrip:projectData().layers.find(l=>l.id===activeLayer().id).features.map(f=>f.zg)}));
assert.equal(whole.original,true);assert.equal(whole.count,2);assert.deepEqual(whole.features,[{n:6,z:[100,105,115,122.5,127.5,130],props:{COTA:100}},{n:6,z:[200,205,215,222.5,227.5,230],props:{COTA:200}}]);assert.deepEqual(whole.roundtrip,[[100,105,115,122.5,127.5,130],[200,205,215,222.5,227.5,230]]);
await page.evaluate(()=>{doUndo();S.activeId=__L.id;ED.sel=null;S.selFeat={layer:__L,layerId:__L.id,idx:1};edAbreSuavizar();});assert.equal(await page.locator('#smoothScope').inputValue(),'feature');
await page.locator('#smoothApply').click();await page.waitForFunction(()=>!document.getElementById('smoothModal').classList.contains('on'));
assert.deepEqual(await page.evaluate(()=>__L.features.map(f=>f.geom.length)),[3,6]);await page.evaluate(()=>doUndo());assert.equal(await page.evaluate(()=>JSON.stringify(__L.features)===__original),true);
const pure=await page.evaluate(()=>{
 const api=GeoMineSmooth,L={gtype:'line',crs:S.workCRS};
 const line={geom:[[0,0,0],[10,10,10],[20,0,20]],zg:[0,10,20],props:{NAME:'test'}};
 const result=api.smoothFeature(L,line,1);
 const ring=[[0,0],[10,0],[10,10],[0,10],[0,0]],hole=[[2,2],[3,2],[3,3],[2,3],[2,2]];
 const polygon=api.smoothFeature({...L,gtype:'polygon'},{geom:[ring,hole],multi:true,zg:[[0,1,2,3,0],[5,6,7,8,5]]},2);
 const missing=api.smoothFeature(L,{geom:[[0,0],[10,10],[20,0]],zg:[0,null,20]},1);
 const legacy=api.smoothFeature(L,{geom:[line.geom],multi:true,zg:[0,10,20]},1);
 const geographic=line.geom.map(p=>[...reproj(S.workCRS,'EPSG:4326',583800+p[0],7075000+p[1]),p[2]]);
 const geographicOut=api.smoothFeature({...L,crs:'EPSG:4326'},{geom:geographic},1);
 const failures=[];for(const [f,it] of [[{geom:line.geom,zg:[1,2]},1],[line,0],[line,1.5],[line,6],[{geom:[[0,0],[NaN,1]]},1],[{geom:Array.from({length:40000},(_,i)=>[i,i%2])},5]]){
  try{api.smoothFeature(L,f,it);failures.push(false)}catch(e){failures.push(true)}
 }
 return {xy:result.feature.geom,z:result.feature.zg,props:result.feature.props,original:line.geom,
  polygon:polygon.feature.geom,polygonZ:polygon.feature.zg,missing:missing.feature.zg,legacy:legacy.feature.zg,
  endpoints:[geographicOut.feature.geom[0],geographicOut.feature.geom.at(-1)],geoEndpoints:[geographic[0],geographic.at(-1)],failures};
});
assert.deepEqual(pure.xy,[[0,0,0],[2.5,2.5,2.5],[7.5,7.5,7.5],[12.5,7.5,12.5],[17.5,2.5,17.5],[20,0,20]]);
assert.deepEqual(pure.z,[0,2.5,7.5,12.5,17.5,20]);assert.deepEqual(pure.props,{NAME:'test'});
assert.equal(pure.polygon.length,2);for(let i=0;i<2;i++){assert.equal(pure.polygon[i].length,17);assert.deepEqual(pure.polygon[i][0],pure.polygon[i].at(-1));assert.equal(pure.polygonZ[i].length,17);}
assert.deepEqual(pure.missing,[0,null,null,null,null,20]);assert.deepEqual(pure.legacy,[pure.z]);assert.deepEqual(pure.endpoints,pure.geoEndpoints);assert.ok(pure.failures.every(Boolean));
await page.evaluate(()=>{S.activeId=__L.id;edAbreSuavizar();__L.locked=true;});await page.locator('#smoothApply').click();assert.match(await page.locator('#smoothResult').textContent(),/bloqueada/);assert.equal(await page.evaluate(()=>JSON.stringify(__L.features)===__original),true);
await page.evaluate(()=>{__L.locked=false;});await page.locator('#smoothIterations').fill('-1');await page.locator('#smoothApply').click();assert.match(await page.locator('#smoothResult').textContent(),/iterações/);
await page.locator('#smoothIterations').fill('1');await page.setViewportSize({width:800,height:900});await page.locator('#smoothModal .modal').screenshot({path:path.resolve(__dirname,'../dist/smooth-panel.png')});assert.deepEqual(errors,[]);
await page.locator('#smoothClose').click();
await page.evaluate(()=>{window.__other=addLayer({name:'Outra camada',gtype:'line',crs:S.workCRS,features:[{geom:[[0,0],[5,.1],[10,0]],props:{}}]});S.activeId=__L.id;edAbreSuavizar();});
await page.locator('#smoothLayer').selectOption(await page.evaluate(()=>String(__other.id)));
assert.equal(await page.locator('#smoothScope').inputValue(),'layer');assert.equal(await page.locator('#smoothScope option[value=feature]').isDisabled(),true);
await page.locator('#smoothClose').click();assert.equal(await page.evaluate(()=>S.layers.length),2);
assert.deepEqual(errors,[]);
console.log('PASS layer/feature UI, switching layers and cancel, independent originals, selected feature only, undo both scopes, attributes/Z and project serialization, Chaikin XY/Z, multipart/holes/closed rings, missing Z, legacy flat Z, geographic endpoints, growth limit, invalid Z, lock and validation');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
