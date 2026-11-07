// Real project, disposable Chrome; no original project edits and no user browser.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const bundle=path.resolve(process.argv[2]||path.join(__dirname,'../dist/GeoMine.html'));
const fixture=path.resolve(process.argv[3]||process.env.GEOMINE_TIN_FIXTURE||path.join(__dirname,'../fixtures/HidrogeologiaV2.ccmgis'));
const baseline=!!process.env.GEOMINE_BASELINE,fixtureHash=crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex');
assert.equal(fixtureHash,'4027dea1fa0003c51d8c3b8a6af4cc4eb2c0fd2ce9bdeaff1219ebf5819cc153');
async function snapshot(page){return page.evaluate(()=>({
  stack:S.stack.slice(),groups:S.groups.map(g=>({id:g.id,name:g.name,collapsed:g.collapsed})),
  nodes:allNodes().map(n=>({key:nodeKey(n.t,n.id),group:n.o.groupId??null,visible:n.o.visible})),
  rasters:S.rasters.map(r=>{const ov=r.overlay,el=ov?.getElement?.(),pane=ov&&map.getPane(ov.options.pane),sty=el&&getComputedStyle(el);
    return {id:r.id,source:r._tinSourceId,visible:r.visible,tin:!!r.tinPuro,attached:!!ov&&map.hasLayer(ov),zIndex:+getComputedStyle(pane).zIndex,
      image:el&&{connected:el.isConnected,complete:el.complete,width:el.naturalWidth,height:el.naturalHeight,display:sty.display,visibility:sty.visibility,opacity:+sty.opacity,rect:el.getBoundingClientRect().toJSON()},
      bounds:ov?.getBounds?.(),grid:[r.d.nc,r.d.nr],flag:r._tinAutoClip};}),mapRect:map.getContainer().getBoundingClientRect().toJSON()
}));}
async function dismissSourceRequests(page){
  // The full project asks for the old terrain source while rebuilding its saved section.
  // Use its existing working grid. This is unrelated to map insertion order.
  for(let i=0;i<4;i++){if(await page.locator('[data-pf="no"]').isVisible())await page.locator('[data-pf="no"]').click();await page.waitForTimeout(150);}
}
async function generate(page,format){
  await dismissSourceRequests(page);if(await page.locator('#ribX').isVisible())await page.locator('#ribX').click();
  await page.evaluate(()=>{S.activeId=19;S.selFeat=null;refreshUI();});
  await page.locator('.ribcat[data-cat-id="topografia"]').click();await page.locator('.rbtn').filter({hasText:'Superfície Raster'}).click();
  await page.locator('#tinLayer').selectOption('19');await page.locator('#tinZSrc').selectOption('geom');await page.locator('#tinCS').fill('2');await page.locator('#tinMaxEdge').fill('0');
  await page.locator('#tinFormato').selectOption(format);await page.locator('#tinLimitMode').selectOption('open');await page.locator('#tinContour').uncheck();await page.locator('#tinCutMdt').uncheck();
  const before=await snapshot(page),count=before.rasters.length,start=Date.now();await page.locator('#btnTIN').click();
  await page.waitForFunction(n=>S.rasters.length===n+1,count);await page.waitForFunction(()=>document.getElementById('tinOut').textContent.includes('Cotas:'));
  await dismissSourceRequests(page);if(await page.locator('#ribX').isVisible())await page.locator('#ribX').click();await page.waitForTimeout(300);
  const after=await snapshot(page),added=after.rasters.find(r=>!before.rasters.some(b=>b.id===r.id));assert.ok(added);
  assert.equal(added.source,19);assert.equal(added.visible,true);assert.equal(added.attached,true);assert.equal(added.tin,format==='tin');assert.equal(added.flag,false);
  assert.equal(added.image.connected,true);assert.equal(added.image.complete,true);assert.ok(added.image.width>0&&added.image.height>0);assert.ok(added.image.opacity>0);assert.equal(added.image.visibility,'visible');assert.notEqual(added.image.display,'none');
  assert.ok(added.image.rect.right>after.mapRect.left&&added.image.rect.left<after.mapRect.right&&added.image.rect.bottom>after.mapRect.top&&added.image.rect.top<after.mapRect.bottom,'actual overlay intersects the viewport');
  assert.deepEqual(after.stack.filter(k=>k!=='R:'+added.id),before.stack,'existing relative order is untouched');assert.deepEqual(after.groups,before.groups,'group metadata is untouched');
  for(const node of before.nodes){const now=after.nodes.find(n=>n.key===node.key);assert.equal(now.group,node.group);const oldRaster=before.rasters.find(r=>'R:'+r.id===node.key);if(oldRaster?.source!==19)assert.equal(now.visible,node.visible,'unrelated visibility preserved: '+node.key);}
  if(!baseline){assert.equal(after.stack[0],'R:'+added.id,'new result is automatically visible at the top');assert.ok(after.rasters.filter(r=>r.id!==added.id).every(r=>added.zIndex>r.zIndex),'new result is above the old terrain pane');}
  return {before,after,added,elapsedMs:Date.now()-start};
}
async function mapScreenshot(page,name){const buffer=await page.locator('#map').screenshot();fs.writeFileSync(path.resolve(__dirname,'../'+name),buffer);return buffer.toString('base64');}
async function imageDifference(page,a,b){return page.evaluate(async({a,b})=>{
  const decode=async data=>{const im=new Image();im.src='data:image/png;base64,'+data;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;c.getContext('2d').drawImage(im,0,0);return c.getContext('2d').getImageData(0,0,c.width,c.height).data;};
  const x=await decode(a),y=await decode(b);let changed=0;for(let k=0;k<x.length;k+=4)if(Math.abs(x[k]-y[k])+Math.abs(x[k+1]-y[k+1])+Math.abs(x[k+2]-y[k+2])>20)changed++;return changed;
},{a,b});}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),errors=[];
try{const page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route(/^https?:/,r=>r.abort());
  await page.goto('file://'+bundle,{waitUntil:'load'});await page.waitForFunction(()=>typeof runTIN==='function');
  await page.locator('#projIn').setInputFiles(fixture);await page.waitForFunction(()=>S.layers.length===18&&S.rasters.length===1);await page.waitForTimeout(600);
  const raster=await generate(page,'raster'),id=raster.added.id;
  const on=await mapScreenshot(page,baseline?'tin-map-order-baseline.png':'tin-map-order-fixed.png');
  if(baseline){assert.equal(raster.after.stack.at(-1),'R:'+id);assert.ok(raster.added.zIndex<raster.after.rasters.find(r=>r.id===3).zIndex);await page.evaluate(id=>{S.stack=['R:'+id,...S.stack.filter(k=>k!=='R:'+id)];zApply();refreshUI();},id);await page.waitForTimeout(200);const raised=await mapScreenshot(page,'tin-map-order-manually-raised.png');const changed=await imageDifference(page,on,raised);assert.ok(changed>10000);console.log(JSON.stringify({baselineReproduced:true,id,oldZ:raster.added.zIndex,terrainZ:raster.after.rasters.find(r=>r.id===3).zIndex,changedPixelsAfterOnlyReordering:changed,errors}));return;}
  await page.evaluate(id=>{const r=S.rasters.find(r=>r.id===id);nodeSetVis({t:'R',id,o:r},false);},id);await page.waitForTimeout(200);const off=await mapScreenshot(page,'tin-map-order-fixed-off.png'),changed=await imageDifference(page,on,off);assert.ok(changed>10000,'real composed map changes substantially when the new overlay is hidden');
  await page.evaluate(id=>{const r=S.rasters.find(r=>r.id===id);nodeSetVis({t:'R',id,o:r},true);zApply();},id);
  const saved=await page.evaluate(()=>projectData());assert.equal(saved.stack[0],'R:'+id);
  await page.locator('#projIn').setInputFiles({name:'qa-map-order-roundtrip.ccmgis',mimeType:'application/octet-stream',buffer:Buffer.from(JSON.stringify(saved))});await page.waitForFunction(()=>S.auto.name==='qa-map-order-roundtrip.ccmgis');await dismissSourceRequests(page);
  const reopened=await snapshot(page);assert.deepEqual(reopened.stack,saved.stack);assert.deepEqual(reopened.groups,raster.after.groups);assert.equal(reopened.rasters.find(r=>r.id===id).attached,true);assert.ok(reopened.rasters.find(r=>r.id===id).zIndex>reopened.rasters.find(r=>r.id===3).zIndex);
  const tin=await generate(page,'tin');assert.equal(tin.after.rasters.find(r=>r.id===id).visible,false,'only the old result of this source is hidden by existing behavior');await mapScreenshot(page,'tin-map-order-pure-tin.png');
  assert.deepEqual(errors,[]);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(fixture)).digest('hex'),fixtureHash);
  console.log(JSON.stringify({pass:true,fixtureHash,raster:{id,zIndex:raster.added.zIndex,terrainZ:raster.after.rasters.find(r=>r.id===3).zIndex,elapsedMs:raster.elapsedMs},composedMapToggleChangedPixels:changed,roundtrip:true,groupsPreserved:true,tin:{id:tin.added.id,zIndex:tin.added.zIndex,elapsedMs:tin.elapsedMs},errors},null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
