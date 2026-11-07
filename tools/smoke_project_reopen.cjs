const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route(/^https?:/,r=>r.abort());
  await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'),{waitUntil:'load'});
  await page.waitForFunction(()=>window.GeoMineSessionAutosave&&typeof loadProject==='function');
  const current=await page.evaluate(()=>{
   window.__fixture=(id,name,color)=>({app:'ALAGIS',v:1,workCRS:'EPSG:31982',projectId:id,
    projectMeta:{name:id},groups:[],rasters:[],plates:[],stack:['L:11'],
    layers:[{id:11,name,gtype:'point',crs:'EPSG:31982',visible:true,color,
     sym:{mode:'single',color,stroke:color,pt:{shape:'circle',size:10}},fields:[{name:'VALOR',type:'C',length:50}],
     features:[{geom:[[583800,7075000]],attrs:{VALOR:name}}]}]});
   loadProject(__fixture('ATUAL','NOME NOVO','#00cc00'));
   const l=S.layers[0];l.color='#0000cc';l.sym.color=l.sym.stroke='#0000cc';
   const p=plateNew('Prancha azul');p.conv=layoutConventionSnapshot();S.plates=[p];S.plateId=p.id;S.loMode='a4';S.loFrozen=true;
   l.color='#00cc00';l.sym.color=l.sym.stroke='#00cc00';
   const result=projectData();
   loadProject(__fixture('ANTERIOR','NOME ANTIGO','#cc0000'));switchView('layout');
   return result;
  });
  assert.equal(current.layers[0].color,'#00cc00');
  assert.equal(current.plates[0].conv['L:11'].color,'#0000cc');
  await page.locator('#projIn').setInputFiles({name:'ATUAL.ccmgis',mimeType:'application/octet-stream',buffer:Buffer.from(JSON.stringify(current))});
  await page.waitForFunction(()=>S.projectId==='ATUAL'&&S.auto.name==='ATUAL.ccmgis');
  const opened=await page.evaluate(()=>({name:S.layers[0].name,color:S.layers[0].color,view:S._view,serialized:projectData().layers[0].color}));
  assert.equal(opened.name,'NOME NOVO');assert.equal(opened.color,'#00cc00');assert.equal(opened.view,'map');assert.equal(opened.serialized,'#00cc00');
  const layout=await page.evaluate(()=>{switchView('layout');return {color:S.layers[0].color,serialized:projectData().layers[0].color,pre:S._preLayoutMapState.conv['L:11'].color}});
  // Entrar mantém as alterações recentes como rascunho; escolher a prancha
  // explicitamente restaura sua fotografia, sem substituir o mapa salvo.
  assert.equal(layout.color,'#00cc00');assert.equal(layout.serialized,'#00cc00');assert.equal(layout.pre,'#00cc00');
  const selectedPlate=await page.evaluate(()=>{plateApply(S.plates.find(p=>p.id===S.plateId));return {color:S.layers[0].color,serialized:projectData().layers[0].color}});
  assert.equal(selectedPlate.color,'#0000cc');assert.equal(selectedPlate.serialized,'#00cc00');
  const returned=await page.evaluate(()=>{switchView('map');return {color:S.layers[0].color,name:S.layers[0].name}});
  assert.equal(returned.color,'#00cc00');
  const meta=await page.evaluate(()=>{const d=__fixture('SEM_META','Legado','#333333');delete d.projectMeta;loadProject(d);return S.projectMeta});
  assert.equal(meta,null);assert.deepEqual(errors,[]);console.log(JSON.stringify({opened,layout,selectedPlate,returned,metadata:meta,errors},null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
