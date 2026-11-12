/* User-project regression: serves a local, raster-free GIS fixture only. */
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.argv[2]||path.resolve(__dirname,'../../..'),fixture=process.argv[4]||'/tmp/geomine-real-vector-fixture.json';
(async()=>{
 const server=http.createServer((req,res)=>{const file=req.url==='/fixture.json'?fixture:path.join(root,'dist/GeoMine.html');res.setHeader('content-type',req.url==='/fixture.json'?'application/json':'text/html');fs.createReadStream(file).pipe(res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1560,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));await page.route('https://**',route=>route.abort());await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.GeoMineDynamicSegment);
  const result=await page.evaluate(async()=>{
   const fixture=await(await fetch('/fixture.json')).json();clearDraw();for(const L of S.layers||[])if(L.llayer)map.removeLayer(L.llayer);
   S.workCRS=fixture.workCRS;S.layers=fixture.layers.map(L=>({...L,llayer:null,sym:{mode:'single',color:'#2563eb',stroke:'#111111',weight:1.5,fill:.35,hatch:'solid',classes:[],cats:[],...L.sym},fields:L.fields||[]}));
   const line=S.layers.find(L=>L.id===177),poly=S.layers.find(L=>L.id===175);if(!line||!poly)throw Error('Reference project layers missing');
   const originals=S.layers.map(L=>({L,features:L.features.slice(),geometry:L.features.map(f=>f.geom)})),lineCount=line.features.length,polyCount=poly.features.length;
   const malformed=poly.features[180];if(malformed.multi!==false||!Array.isArray(malformed.geom[0][0]))throw Error('Expected legacy feature not present');
   const cache=snapCacheOf(poly);if(!cache.pts.every(Number.isFinite)||!cache.segs.every(Number.isFinite))throw Error('Reference project produced invalid snap values');
   const origin=snapRingsOf(line,line.features[0])[0][0],ll=(x,y)=>{const w=toWGS(S.workCRS,x,y);return L2.latLng(w[1],w[0]);};map.fitBounds([ll(origin[0]-200,origin[1]-200),ll(origin[0]+200,origin[1]+200)],{animate:false});
   const checks=[],started=performance.now();
   for(const tool of ['line','poly'])for(const ortho of [false,true]){
    clearDraw();const target=tool==='line'?line:poly;S.activeId=target.id;S.selFeat=null;setTool(tool);S.snapOn=true;S.snapMidOn=true;S.snapEndOn=true;S.snapNearOn=true;S.snapCenterOn=true;S.snapVtxOn=true;S.snapEscopo='todas';S.orthoOn=ortho;GeoMineVertexGuides.setEnabled(true);
    const before=target.features.length;
    for(const [dx,dy] of [[-80,-80],[80,-80],[80,80]]){const point=ll(origin[0]+dx,origin[1]+dy),hit=GeoMineOrtho.drawing(point,false);if(!hit?.latlng||!Number.isFinite(hit.latlng.lat+hit.latlng.lng))throw Error('Invalid preview');if(S.drawBuf.length)GeoMineOrtho.preview(hit);onMapClick({latlng:point});map.fire('mousemove',{latlng:ll(origin[0]+dx+10,origin[1]+dy+5)});await new Promise(r=>setTimeout(r,20));}
    if(!finishDraw()||target.features.length!==before+1)throw Error('Reference project drawing did not finish');checks.push({tool,ortho,finished:true});
   }
   clearDraw();setTool('select');
   for(const source of originals)for(let i=0;i<source.features.length;i++)if(source.L.features[i]!==source.features[i]||source.L.features[i].geom!==source.geometry[i])throw Error('Reference geometry identity changed');
   return {sourceLayers:S.layers.length,sourceLineFeatures:lineCount,sourcePolygonFeatures:polyCount,legacyFeature:181,checks,elapsedMs:Math.round(performance.now()-started),originalGeometryReferencesPreserved:true};
  });
  assert.deepEqual(errors,[]);assert.equal(result.checks.length,4);fs.writeFileSync('/tmp/geomine-project-drawing-validation.json',JSON.stringify({...result,errors},null,2));console.log(JSON.stringify({...result,errors}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
