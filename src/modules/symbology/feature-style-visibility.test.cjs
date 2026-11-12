/* Browser regression: SVG patterns must survive the Leaflet remove/add lifecycle. */
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.GEOMINE_PLAYWRIGHT||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.argv[2]||path.resolve(__dirname,'../../..');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(fs.readFileSync(path.join(root,'dist/GeoMine.html')));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1560,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>window.GeoMineFeatureStyleEditor&&window.GeoMineFeatureStyleBrush);
  await page.evaluate(()=>{
   S.workCRS='EPSG:31982';
   const features=Array.from({length:6},(_,i)=>{const x=500000+i*250,y=6900000;return {geom:[[x,y],[x+250,y],[x+250,y+250],[x,y+250],[x,y]],props:{QUADRANTE:'Q'+i,CHECK:i===5?'base':'other'}};});
   const layer=addLayer({name:'Quadrantes — estilo persistente',gtype:'polygon',crs:S.workCRS,features,fields:[{name:'QUADRANTE',type:'C'},{name:'CHECK',type:'C'}]});
   layer.sym={...layer.sym,mode:'cat',field:'CHECK',hatch:'none',fill:0,cats:[{value:'other',color:'#2563eb',stroke:'#111111',hatch:'none',fill:0,vis:true},{value:'base',color:'#099f72',stroke:'#173b57',hatch:'vertical',hatchScale:1.5,fill:.35,vis:true}]};
   drawLayer(layer);
   const styles=[null,{hatch:'dots',fill:.35,color:'#e05252'},{hatch:'cross',fill:.6,color:'#2679a8'},{hatch:'none',fill:0,color:'#f59e0b'},{hatch:'solid',fill:.45,color:'#923ac4'}];
   styles.forEach((style,i)=>{if(!style)return;GeoMineFeatureStyleBrush.activate(layer,i);GeoMineFeatureStyleBrush.edit(layer,i,{version:1,gtype:'polygon',style:{stroke:'#173b57',weight:1.8,hatchScale:1.5,dash:'4 2',...style}});});
   const ll=(x,y)=>{const p=toWGS(S.workCRS,x,y);return L2.latLng(p[1],p[0]);};
   map.fitBounds([ll(499950,6899950),ll(501550,6900300)],{animate:false});
   window.__styleVisibility={layer,geometry:features.map(f=>f.geom)};
   GeoMineFeatureStyleEditor.open(layer,0);
  });
  await page.locator('#featureStyleModal [data-hatch]').selectOption('dots');
  await page.locator('#featureStyleModal [data-fill]').fill('0');
  await page.locator('#featureStyleModal button[type="submit"]').click();
  await page.waitForTimeout(50);
  const inspect=()=>page.evaluate(()=>{
   const {layer:L}=__styleVisibility;
   return L.llayer.getLayers().filter(l=>l instanceof L2.Polygon).map(l=>({index:l._fidx,fill:l._path.getAttribute('fill'),opacity:l._path.getAttribute('fill-opacity'),stroke:l._path.getAttribute('stroke'),weight:l._path.getAttribute('stroke-width'),dash:l._path.getAttribute('stroke-dasharray')})).sort((a,b)=>a.index-b.index);
  });
  const initial=await inspect();
  assert(initial[0].fill.startsWith('url(#pat_dots_')&&initial[0].opacity==='1','pattern must be visible with fill 0');
  assert(initial[1].fill.startsWith('url(#pat_dots_')&&initial[2].fill.startsWith('url(#pat_cross_'));
  assert(initial[3].fill==='none'&&initial[3].opacity==='0');
  assert.equal(initial[4].fill,'#923ac4');assert.equal(initial[4].opacity,'0.45');
  assert(initial[5].fill.startsWith('url(#pat_vertical_'));
  const model=await page.evaluate(()=>JSON.stringify(__styleVisibility.layer.features.map(f=>f._featureStyle)));
  const eye=page.locator('.layer').filter({has:page.locator('.nm',{hasText:'Quadrantes — estilo persistente'})}).locator('.eye');
  for(let cycle=0;cycle<3;cycle++){
   await eye.click();assert.equal(await page.evaluate(()=>__styleVisibility.layer.visible),false);
   await eye.click();assert.equal(await page.evaluate(()=>__styleVisibility.layer.visible),true);
   assert.deepEqual(await inspect(),initial,'layer eye cycle '+cycle+' lost appearance');
  }
  await page.evaluate(()=>{const L=__styleVisibility.layer;map.removeLayer(L.llayer);L.llayer.addTo(map);});
  assert.deepEqual(await inspect(),initial,'direct Leaflet remove/add lost appearance');
  await page.evaluate(()=>{const L=__styleVisibility.layer,g={id:gid++,name:'Grupo de estilos',collapsed:false};S.groups.push(g);L.groupId=g.id;nodeSetVis({t:'L',id:L.id,o:L},false);drawLayer(L);});
  await page.waitForTimeout(30);
  await page.evaluate(()=>{const L=__styleVisibility.layer;nodeSetVis({t:'L',id:L.id,o:L},true);});
  assert.deepEqual(await inspect(),initial,'redraw while hidden lost appearance');
  await page.evaluate(()=>{stackSync();refreshUI();});
  const groupEye=page.locator('.grp').filter({has:page.locator('.nm',{hasText:'Grupo de estilos'})}).locator('.eye');
  await groupEye.click();assert.equal(await page.evaluate(()=>__styleVisibility.layer.visible),false);
  await groupEye.click();assert.equal(await page.evaluate(()=>__styleVisibility.layer.visible),true);
  assert.deepEqual(await inspect(),initial,'group eye cycle lost appearance');
  const saved=await page.evaluate(()=>{
   const {layer:L,geometry}=__styleVisibility;
   if(L.features.some((f,i)=>f.geom!==geometry[i]))throw Error('Geometry identity changed');
   const stored=projectData().layers.find(l=>l.id===L.id);
   return {model:JSON.stringify(L.features.map(f=>f._featureStyle)),saved:JSON.stringify(stored.features.map(f=>f._featureStyle)),patternCount:document.querySelectorAll('#hatchLive pattern').length};
  });
  assert.equal(saved.model,model);assert.equal(saved.saved,model);assert.deepEqual(errors,[]);
  await page.screenshot({path:'/tmp/geomine-style-visibility-fixed.png'});
  const report={passed:true,patternedFeatures:4,eyeCycles:3,groupEyeCycle:true,directRemoveAdd:true,hiddenRedraw:true,solidAndNonePreserved:true,featureStylePersisted:true,geometryIdentityPreserved:true,errors};
  fs.writeFileSync('/tmp/geomine-style-visibility-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exit(1);});
