const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.argv[2]||path.resolve(__dirname,'../../..');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(fs.readFileSync(path.join(root,'dist/GeoMine.html')));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1560,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.stack));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.GeoMineDynamicSegment&&window.GeoMineVertexGuides);
  const result=await page.evaluate(async()=>{
   S.workCRS='EPSG:31982';
   const source=Array.from({length:88},(_,i)=>{const ring=[[501000+i*5,6900000,100],[501005+i*5,6900005,101]];return {geom:i===0?[ring]:ring,props:{}};}),geometry=source.map(f=>f.geom),original=JSON.stringify(source),L=addLayer({name:'Hidro_FINAL_Linhas QA 3D',gtype:'line',crs:S.workCRS,fields:[],features:source}),P=addLayer({name:'Polígonos QA',gtype:'polygon',crs:S.workCRS,fields:[],features:[]}),ll=(x,y)=>{const w=toWGS(S.workCRS,x,y);return L2.latLng(w[1],w[0]);};
   map.fitBounds([ll(499950,6899950),ll(500350,6900300)],{animate:false});
   const failures=[],checks=[];
   for(const tool of ['line','poly'])for(const snap of [false,true])for(const ortho of [false,true])for(const guides of [false,true]){
    clearDraw();S.activeId=tool==='line'?L.id:P.id;S.selFeat=null;setTool(tool);S.snapOn=snap;S.orthoOn=ortho;GeoMineVertexGuides.setEnabled(guides);
    try{
     const target=tool==='line'?L:P,before=target.features.length;onMapClick({latlng:ll(500000,6900000)});
     for(const [x,y] of [[100,0],[100,1],[100,30],[0,100],[1,100],[50,50]]){const hit=GeoMineOrtho.drawing(ll(500000+x,6900000+y),false);GeoMineOrtho.preview(hit);if(!hit.latlng||!Number.isFinite(hit.latlng.lat+hit.latlng.lng))throw Error('Invalid resolved point');}
     onMapClick({latlng:ll(500100,6900000)});map.fire('mousemove',{latlng:ll(500100,6900100)});await new Promise(r=>setTimeout(r,40));if(tool==='poly')onMapClick({latlng:ll(500100,6900100)});
     const vertices=S.drawBuf.length;if(!finishDraw()||target.features.length!==before+1)throw Error('Drawing did not finish');checks.push({tool,snap,ortho,guides,vertices,finished:true});
    }catch(e){failures.push({tool,snap,ortho,guides,error:e.message,stack:e.stack});}
   }
   clearDraw();setTool('select');S.snapOn=true;S.snapEscopo='todas';S.orthoOn=false;
   const targetChecks={};const flags=key=>{S.snapVtxOn=false;S.snapMidOn=false;S.snapEndOn=false;S.snapNearOn=false;S.snapCenterOn=false;S[key]=true;L._snapCache=null;L._endCache=null;};
   for(const [key,x,y,kind] of [['snapVtxOn',501000,6900000,'vértice'],['snapMidOn',501002.5,6900002.5,'ponto médio'],['snapEndOn',501000,6900000,'extremidade'],['snapNearOn',501001.1,6900001.2,'linha'],['snapCenterOn',501002.5,6900002.5,'centro']]){flags(key);const hit=snapLatLng(ll(x,y),null,{flash:false});if(!hit.snapped||hit.kind!==kind)throw Error('Snap mode failed: '+key);targetChecks[key]=hit.kind;}
   const bad=addLayer({name:'Coordenadas incompletas QA',gtype:'line',crs:S.workCRS,fields:[],features:[{geom:[[501100,6900200,5],[],[501110,6900200,6]],props:{}}]}),cache=snapCacheOf(bad);
   if(cache.segs.length||cache.mids.length)throw Error('Snap created a segment over invalid geometry');flags('snapNearOn');if(snapLatLng(ll(501105,6900200),null,{flash:false}).snapped)throw Error('Snap bridged a geometry gap');feicaoMaisProximaPx(ll(501105,6900200),2,true,[bad]);
   flags('snapVtxOn');const legacyCache=snapCacheOf(L);legacyCache.pts.unshift([1,2],[3,4],undefined,NaN);legacyCache.segs.unshift(null,Infinity,undefined,NaN);legacyCache.mids.unshift(undefined,null,NaN,[0,0]);S.snapNearOn=true;S.snapMidOn=true;S.snapEndOn=true;L._endCache=[[1,2],[3,4],...endpointsOf(L)];snapLatLng(ll(501000,6900000),null,{flash:false});L._snapCache=null;
   const nested=addLayer({name:'Régua em parte 3D legada QA',gtype:'line',crs:S.workCRS,fields:[],features:[{geom:[[[503000,6900500,0],[503010,6900500,0]],[[502000,6900250,100],[502100,6900250,200],[502200,6900250,300]]],zg:[[1,2],[12,22,32]],props:{}}]});
   document.getElementById('mbSnap').checked=true;const vertex=GeoMineRuler.snap(ll(502100,6900250)),segment=GeoMineRuler.snap(ll(502050,6900250));if(vertex?.sourceRingIndex!==1||Math.abs(vertex.z-22)>1e-5||segment?.sourceRingIndex!==1||Math.abs(segment.z-17)>1e-5)throw Error('Ruler lost source part or Z');
   if(geometry.some((g,i)=>L.features[i].geom!==g)||JSON.stringify(L.features.slice(0,88))!==original)throw Error('Original 3D geometries changed');
   return {checks,failures,targetChecks,noSegmentsAcrossInvalidPoints:true,staleInvalidCacheRejected:true,source3DPreserved:true,rulerSourcePartAndZ:true};
  });
  assert.deepEqual(result.failures,[]);assert.deepEqual(errors,[]);assert.equal(result.checks.length,16);
  fs.writeFileSync('/tmp/geomine-polyline-guides-validation.json',JSON.stringify({...result,errors},null,2));console.log(JSON.stringify({drawingConfigurations:result.checks.length,snapTargets:result.targetChecks,noSegmentsAcrossInvalidPoints:result.noSegmentsAcrossInvalidPoints,staleInvalidCacheRejected:result.staleInvalidCacheRejected,source3DPreserved:result.source3DPreserved,rulerSourcePartAndZ:result.rulerSourcePartAndZ,errors}));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1)});
