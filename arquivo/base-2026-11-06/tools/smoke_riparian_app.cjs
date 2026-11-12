const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{
const page=await browser.newPage({viewport:{width:1400,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'));await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted);
const legal=await page.evaluate(()=>{
 S.setBase('Sem fundo');S.workCRS='EPSG:31982';
 const api=GeoMineRiparianAPP,invalid=[];
 for(const v of [null,'',0,-1,NaN,Infinity,'abc',true]){try{api.federalWidth(v);invalid.push(false)}catch(e){invalid.push(true)}}
 return {values:[.1,9.999,10,49.999,50,199.999,200,600,600.001,'8,5'].map(api.federalWidth),invalid};
});assert.deepEqual(legal.values,[30,30,50,50,100,100,200,200,500,30]);assert.ok(legal.invalid.every(Boolean));
const geometry=await page.evaluate(()=>{
 const engine=GeoMineRiparianAPP.engine(polygonClipping),x=500000,y=7400000;
 const ring=(a,b,w,h)=>[[x+a,y+b],[x+a+w,y+b],[x+a+w,y+b+h],[x+a,y+b+h],[x+a,y+b]];
 const input={polygon:true,rows:[{index:1,width:8,app:30,rings:[ring(0,0,100,8)]}]},text=JSON.stringify(input);
 const result=engine.run(input),output=result.saidas[0];
 const inner=polygonClipping.intersection(output.mp,[[ring(0,0,100,8)]]);
 const border=polygonClipping.intersection(output.mp,[[ring(5,8,90,29.999)]]);
 const line=engine.run({polygon:false,rows:[{index:1,width:8,app:30,rings:[[[x,y+4],[x+100,y+4]]]}]}).saidas[0];
 const bounds=mp=>{const p=mp.flat(2);return [Math.min(...p.map(p=>p[0]))-x,Math.max(...p.map(p=>p[0]))-x,Math.min(...p.map(p=>p[1]))-y,Math.max(...p.map(p=>p[1]))-y]};
 const hole=engine.run({polygon:true,rows:[{index:1,width:20,app:50,rings:[ring(0,0,300,300),ring(100,100,100,100),ring(500,0,100,100)]}]});
 const water=polygonClipping.xor([[ring(0,0,300,300)]],[[ring(100,100,100,100)]],[[ring(500,0,100,100)]]);
 const cross=engine.run({polygon:true,rows:[...input.rows,{index:2,width:20,app:50,rings:[ring(0,8,100,20)]}]});
 const meta=q=>({indices:q.indices,apps:q.apps,app:q.app,index:q.index,width:q.width,minWidth:q.minWidth,estimadas:q.estimadas}),inside=(r,g)=>r.saidas.reduce((t,q)=>t+engine.area(polygonClipping.intersection(q.mp,g)),0);
 return {same:JSON.stringify(input)===text,keys:Object.keys(result).sort(),falhas:[result,hole,cross].map(r=>r.falhas.length),n:result.saidas.length,meta:meta(output),area:output.area,mpArea:engine.area(output.mp),inner:engine.area(inner),border:engine.area(border),bounds:bounds(output.mp),lineBounds:bounds(line.mp),lineWater:engine.area(polygonClipping.intersection(line.mp,[[ring(0,0,100,8)]])),
  holeParts:hole.saidas.reduce((n,q)=>n+q.mp.length,0),holeIndices:hole.saidas.map(q=>q.indices),holeArea:hole.saidas.reduce((t,q)=>t+q.area,0),holeWater:inside(hole,water),island:inside(hole,[[ring(100,100,100,100)]]),
  cross:cross.saidas.map(q=>({...meta(q),area:q.area})),crossWater:inside(cross,[[ring(0,0,100,28)]])};
});
assert.equal(geometry.same,true);assert.deepEqual(geometry.keys,['falhas','saidas']);assert.deepEqual(geometry.falhas,[0,0,0]);assert.equal(geometry.n,1);
assert.deepEqual(geometry.meta,{indices:[1],apps:[30],app:30,index:1,width:8,minWidth:8,estimadas:0});
assert.equal(geometry.inner,0);assert.ok(Math.abs(geometry.border-90*29.999)<.02);assert.ok(Math.abs(geometry.area-(216*30+Math.PI*900))<3);assert.ok(Math.abs(geometry.mpArea-geometry.area)<1e-6);
assert.ok(Math.abs(geometry.bounds[0]+30)<.02);assert.ok(Math.abs(geometry.bounds[3]-38)<.02);assert.ok(Math.abs(geometry.lineBounds[0]+34)<.02);assert.ok(Math.abs(geometry.lineBounds[3]-38)<.02);assert.equal(geometry.lineWater,0);
// Hole + separate part: fusion must keep every continuous area of one feature (island fully within 50 m, outer ring, far part).
assert.equal(geometry.holeWater,0);assert.ok(geometry.holeIndices.every(i=>JSON.stringify(i)==='[1]'));
assert.ok(Math.abs(geometry.island-1e4)<.01,'island inside the hole lost its APP: '+geometry.island);assert.equal(geometry.holeParts,3,'multipart APP lost parts in funde');assert.ok(Math.abs(geometry.holeArea-(1e4+1600*50+2*Math.PI*2500))<5,'hole/multipart APP area '+geometry.holeArea);
// Adjacent channels: overlapping 30/50 m strips become one area, counted once (the 30 m strip lies inside the 50 m one).
assert.deepEqual(geometry.cross.map(({area,...m})=>m),[{indices:[1,2],apps:[30,50],app:50,index:1,width:20,minWidth:8,estimadas:0}]);assert.equal(geometry.crossWater,0);assert.ok(Math.abs(geometry.cross[0].area-(100*20+240*50+Math.PI*2500-100*28))<3);
await page.evaluate(()=>{
 const x=500000,y=7400000;window.__L=addLayer({name:'Calhas teste',gtype:'polygon',crs:S.workCRS,fields:[{name:'LARGURA',type:'N'}],features:[{geom:[[x,y],[x+100,y],[x+100,y+8],[x,y+8],[x,y]],props:{LARGURA:8}},{geom:[[x,y+200],[x+100,y+200],[x+100,y+220],[x,y+220],[x,y+200]],props:{LARGURA:20}}]});
 window.__before=JSON.stringify(__L.features);S.undo=[];
 ribbonBuild();ribbonBuild();const items=CATS.find(c=>c.id==='ambiente').grupos.flatMap(g=>g.it);if(items.filter(i=>i.ic==='app_riparia').length!==1)throw Error('Duplicate/missing ribbon command');items.find(i=>i.ic==='app_riparia').act();
});
await page.locator('#appRipMode').selectOption('manual');
await page.locator('#appRipGenerate').click();assert.match(await page.locator('#appRipStatus').textContent(),/Confirme/);
await page.locator('#appRipField').selectOption('LARGURA');await page.locator('#appRipConfirm').check();await page.locator('#appRipGenerate').click();assert.match(await page.locator('#appRipStatus').textContent(),/naturais/);
await page.locator('#appRipRegime').selectOption('efemero');await page.locator('#appRipGenerate').click();assert.match(await page.locator('#appRipStatus').textContent(),/Efêmeros/);
await page.locator('#appRipRegime').selectOption('perene');await page.locator('#appRipContext').selectOption('specific');await page.locator('#appRipGenerate').click();assert.match(await page.locator('#appRipStatus').textContent(),/específica/);
await page.locator('#appRipContext').selectOption('general');await page.locator('#appRipGenerate').click();await page.waitForFunction(()=>document.getElementById('appRipStatus').textContent.startsWith('APP criada:'),{},{timeout:30000});
const stored=await page.evaluate(()=>{const out=activeLayer();window.__out=out;return {same:JSON.stringify(__L.features)===__before,props:out.features.map(f=>f.props),fields:out.fields.map(f=>f.name+':'+f.type),roundtrip:projectData().layers.find(l=>l.id===out.id).features.map(f=>f.props),n:S.layers.length};});
// Fused output follows the union order, not trecho order: compare by TRECHOS. Separate strips stay separate areas;
// TRECHO became TRECHOS/N_TRECHOS/APP_CLASSES (no automatic-only fields here).
const props=stored.props.slice().sort((a,b)=>parseInt(a.TRECHOS)-parseInt(b.TRECHOS));
assert.equal(stored.same,true);assert.equal(stored.n,2);assert.deepEqual(props.map(p=>p.APP_M),[30,50]);assert.deepEqual(stored.roundtrip,stored.props);assert.match(props[0].BASE_LEGAL,/12.651/);assert.match(props[0].METODO,/borda/);
assert.deepEqual(props.map(p=>[p.TRECHOS,p.N_TRECHOS,p.APP_CLASSES]),[['1',1,'30 m'],['2',1,'50 m']]);assert.ok(stored.props.every(p=>!('TRECHO' in p)&&!('N_LARG_MEDIA' in p)&&!('N_SECOES' in p)));
assert.ok(['TRECHOS:C','N_TRECHOS:N','APP_CLASSES:C','AREA_M2:N'].every(f=>stored.fields.includes(f)));
assert.ok(Math.abs(props[0].AREA_M2-(216*30+Math.PI*900))<3);assert.ok(Math.abs(props[1].AREA_M2-(240*50+Math.PI*2500))<3);
assert.match(await page.locator('#appRipStatus').textContent(),/^APP criada: 2 área\(s\) contínua\(s\), 2,92 ha — faixas sobrepostas fundidas.*Originais preservados/);
await page.evaluate(()=>doUndo());assert.equal(await page.evaluate(()=>S.layers.length),1);
// Attribute filters constrain the selected scope, but all-features explicitly bypasses them.
const scopes=await page.evaluate(()=>{__L.attrFilter={field:'LARGURA',op:'eq',value:8};const o={field:'LARGURA',scope:'visible',confirmed:true,regime:'perene',context:'general'};const a=GeoMineRiparianAPP.validate(__L,o).map(r=>r.index),b=GeoMineRiparianAPP.validate(__L,{...o,scope:'all'}).map(r=>r.index);delete __L.attrFilter;return {a,b};});assert.deepEqual(scopes,{a:[1],b:[1,2]});
// Input validation must be transactional: no partial APP when one width is missing.
await page.evaluate(()=>{__L.features[1].props.LARGURA='';});await page.locator('#appRipGenerate').click();assert.match(await page.locator('#appRipStatus').textContent(),/Feição 2/);assert.equal(await page.evaluate(()=>S.layers.length),1);
await page.evaluate(()=>{__L.features[1].props.LARGURA=20;S.workCRS='EPSG:4326';});await page.locator('#appRipGenerate').click();assert.match(await page.locator('#appRipStatus').textContent(),/UTM/);
await page.evaluate(()=>{S.workCRS='EPSG:31982';window.__line=addLayer({name:'Eixo',gtype:'line',crs:S.workCRS,features:[{geom:Array.from({length:700},(_,i)=>[500000+i*5,7400000+Math.sin(i/30)*10]),props:{}}],fields:[]});GeoMineRiparianAPP.open();});
await page.locator('#appRipWidth').fill('8,5');await page.locator('#appRipConfirm').check();await page.locator('#appRipGenerate').click();await page.locator('#appRipCancel').click();await page.waitForFunction(()=>document.getElementById('appRipCancel').hidden);assert.match(await page.locator('#appRipStatus').textContent(),/cancelado/);assert.equal(await page.evaluate(()=>S.layers.length),2);
assert.equal(await page.locator('#appRipCancel').isVisible(),false);
await page.setViewportSize({width:1024,height:640});await page.locator('#appRipModal .modal-b').evaluate(e=>e.scrollTop=e.scrollHeight);
const box=await page.locator('#appRipGenerate').boundingBox();assert.ok(box.y>=0&&box.y+box.height<=640);await page.screenshot({path:path.resolve(__dirname,'../dist/app-panel-tablet.png')});
await page.evaluate(()=>{__line.features[0].geom=[[500000,7400000],[500100,7400000]];});await page.locator('#appRipGenerate').click();await page.waitForFunction(()=>document.getElementById('appRipStatus').textContent.startsWith('APP criada:'));
const lineProps=await page.evaluate(()=>activeLayer().features.map(f=>f.props));assert.equal(lineProps.length,1);assert.match(lineProps[0].METODO,/estimativa/);
assert.deepEqual([lineProps[0].TRECHOS,lineProps[0].N_TRECHOS,lineProps[0].APP_CLASSES,lineProps[0].LARG_M],['1',1,'30 m',8.5]);
// A source change while the worker is computing cannot commit stale geometry.
await page.evaluate(()=>{GeoMineRiparianAPP.generate();__line.features[0].props.CHANGED=true;});await page.waitForFunction(()=>!document.getElementById('appRipGenerate').disabled);assert.match(await page.locator('#appRipStatus').textContent(),/mudaram/);assert.equal(await page.evaluate(()=>S.layers.length),3);
const reload=await page.evaluate(async()=>{const d=projectData(),layer=d.layers.find(l=>l.name.startsWith('APP'));const before=JSON.stringify(layer.features);await loadProject(d);const after=S.layers.find(l=>l.id===layer.id);return {same:JSON.stringify(after.features)===before,name:after.name};});assert.equal(reload.same,true);assert.match(reload.name,/estimativa/);
assert.deepEqual(errors,[]);console.log('PASS legal thresholds, invalid values, {saidas,falhas} engine result, actual margins and centerline half-width, holes/multipart/island kept, water mask, overlapping strips fused once, TRECHOS/N_TRECHOS/APP_CLASSES, ribbon, worker creation/cancellation, transactional errors, UTM guard, attributes/serialization/undo, tablet footer');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
