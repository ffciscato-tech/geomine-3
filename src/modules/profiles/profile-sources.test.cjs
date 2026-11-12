/* Profile sources are project layers, including valid hidden layers. This
   isolated browser exercises actual Compare and layer-tree delete handlers. */
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.argv[2]||path.resolve(__dirname,'../../..'),baseline=process.argv.includes('--baseline');
(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('content-type','text/html');fs.createReadStream(path.join(root,'dist/GeoMine.html')).pipe(res)});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1560,height:1050}}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));page.on('dialog',dialog=>dialog.accept());await page.route('https://**',route=>route.abort());await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.GeoMineLongitudinalComparison&&window.GeoMineSessionAutosave?.state.booted);
  await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31982';window.renderRaster=()=>{};window.syncDemTiles=()=>{};
   window.qaEmpty=projectData();qaEmpty.layers=[];qaEmpty.rasters=[];qaEmpty.groups=[];qaEmpty.wms=[];qaEmpty.img=null;qaEmpty.stack=[];qaEmpty.plates=[];qaEmpty.collaboration=null;qaEmpty.projectId='qa-empty';
   window.qaState=()=>{
    const options=id=>Array.from(document.getElementById(id).options).filter(o=>o.value).map(o=>({value:o.value,text:o.textContent}));
    return {raster:options('prRasterSel'),vector:options('prVectorSel'),axis:options('prAxisVectorSel'),rasterChips:Array.from(document.querySelectorAll('#prRasterChosen .prRasterRemove')).map(b=>b.dataset.id),vectorChips:Array.from(document.querySelectorAll('#prVectorChosen .prSrcRemove')).map(b=>b.dataset.id),rasterIds:[...(S.prof.sourceRasterIds||[])],vectorIds:[...(S.prof.sourceLineIds||[])],rasterPick:S.prof.rasterPick??null,vectorPick:S.prof.vectorPick??null,axisPick:S.prof.axisPick??null};
   };
   window.qaChoose=(id,value)=>{const el=document.getElementById(id);el.value=String(value);el.onchange?.({target:el})};
   window.qaFixture=async(prefix)=>{
    const empty=JSON.parse(JSON.stringify(qaEmpty));empty.projectId='qa-'+prefix+'-'+crypto.randomUUID();loadProject(empty);await S._originalsRestoring;S.workCRS='EPSG:31982';
    const feature=(points,multi=false)=>({geom:points,multi,props:{}}),a=[[500002,6900002,100],[500010,6900010,110]],b=[[500002,6900005,120],[500010,6900010,130]],c=[[500003,6900003,140],[500011,6900011,150]];
    const keep=addLayer({name:prefix+'_3D_oculta',gtype:'line',crs:S.workCRS,features:[feature(a),feature([b,c],true)],fields:[],visible:false}),remove=addLayer({name:prefix+'_3D_excluir',gtype:'line',crs:S.workCRS,features:[feature(a.map(p=>p.slice()))],fields:[],visible:false}),axis=addLayer({name:prefix+'_eixo_2D',gtype:'line',crs:S.workCRS,features:[feature(a.map(p=>p.slice(0,2)))],fields:[],visible:false});
    for(const L of [keep,remove,axis]){L.visible=false;drawLayer(L)}
    const makeRaster=(id,name,z)=>({id,name,d:{nc:16,nr:16,cs:1,csy:1,xll:500000,yll:6900000,z:new Float32Array(256).fill(z),native:true,srcDims:[16,16],crs:S.workCRS},style:{mode:'hipso_hs',opacity:.8},visible:false,overlay:null});
    const next=Math.max(90000,...S.rasters.map(r=>r.id||0))+100,keepRaster=makeRaster(next,prefix+'_MDT_oculto',100),removeRaster=makeRaster(next+1,prefix+'_MDT_excluir',110);S.rasters.push(keepRaster,removeRaster);S.stack.push('R:'+next,'R:'+(next+1));S.activeId=keep.id;S.selFeat=null;
    document.getElementById('sidePerfis').style.display='block';profUpdateSourceMode('mixed');refreshUI();refreshProfPanel();window.qaFixtureSources={keep,remove,axis,keepRaster,removeRaster};
    return {keep:String(keep.id),remove:String(remove.id),axis:String(axis.id),keepRaster:String(next),removeRaster:String(next+1)};
   };
  });
  const ids=await page.evaluate(()=>qaFixture('DELETE'));
  const axisList=await page.evaluate(()=>{
   const state=qaState(),{keep}=qaFixtureSources,parts=profAxisOptions(),valid=parts.every(option=>{
    const layer=S.layers.find(L=>String(L.id)===String(option.layer.id)),feature=layer?.features[option.idx],rings=Array.isArray(feature?.geom[0]?.[0])?feature.geom:[feature?.geom];return !!layer&&!!rings[option.partIdx]&&rings[option.partIdx].length>=2;
   });return {valid,layerSourceCount:state.vector.filter(o=>o.value===String(keep.id)).length,axisCount:parts.filter(o=>o.layer===keep).length,labels:state.axis.filter(o=>o.value.startsWith(keep.id+':')).map(o=>o.text),hidden:keep.visible===false};
  });
  const ghost=await page.evaluate(()=>{
   S.prof.rasterPick='ghost-raster';S.prof.vectorPick='ghost-vector';S.prof.axisPick='ghost-layer:7:0';S.prof.sourceRasterIds=['ghost-raster',String(qaFixtureSources.keepRaster.id)];S.prof.sourceLineIds=['ghost-vector',String(qaFixtureSources.keep.id)];refreshProfPanel();return qaState();
  });
  await page.evaluate(()=>{
   profResetProject();refreshProfPanel();profUpdateSourceMode('mixed');const {keepRaster,removeRaster,keep,remove}=qaFixtureSources;
   for(const r of [keepRaster,removeRaster]){qaChoose('prRasterSel',r.id);document.getElementById('btnPrRasterAdd').click()}
   for(const L of [keep,remove]){qaChoose('prVectorSel',L.id);document.getElementById('btnPrVectorAdd').click()}
   qaChoose('prRasterSel',removeRaster.id);qaChoose('prVectorSel',remove.id);qaChoose('prAxisVectorSel',remove.id+':0:0');
  });
  await page.locator('#layerList [data-tree-key="R:'+ids.removeRaster+'"] .ndel').click();
  await page.locator('#layerList [data-tree-key="L:'+ids.remove+'"] .ldel').click();
  const deleted=await page.evaluate(()=>({state:qaState(),currentRasters:S.rasters.map(r=>String(r.id)),currentVectors:S.layers.map(L=>String(L.id))}));
  const switched=await page.evaluate(async()=>{
   await qaFixture('PROJECT_A');const a=projectData(),A={rasters:a.rasters.map(r=>String(r.rid)),vectors:a.layers.map(L=>String(L.id))},B=JSON.parse(JSON.stringify(a));B.projectId='qa-project-B';
   for(const L of B.layers){L.name=L.name.replace('PROJECT_A','PROJECT_B');L.id+=100000}for(const r of B.rasters){r.name=r.name.replace('PROJECT_A','PROJECT_B');r.rid+=100000}B.stack=B.stack.map(key=>{const [kind,id]=key.split(':');return kind+':'+(+id+100000)});if(B.screen)delete B.screen;
   qaChoose('prRasterSel',A.rasters[0]);qaChoose('prVectorSel',A.vectors[0]);qaChoose('prAxisVectorSel',A.vectors[0]+':0:0');loadProject(B);await S._originalsRestoring;
   return {A,state:qaState(),currentRasterIds:S.rasters.map(r=>String(r.id)),currentVectorIds:S.layers.map(L=>String(L.id))};
  });
  const asyncIds=await page.evaluate(async()=>{
   const ids=await qaFixture('ASYNC');profUpdateSourceMode('raster');qaChoose('prRasterSel',ids.removeRaster);S.prof.sourceRasterIds=[];S.prof.sourceLineIds=[];S.prof.axisPick='';document.getElementById('prAxisVectorSel').value='';S.selFeat=null;
   S.prof.buf=[[500002,6900002],[500010,6900010]].map(p=>{const w=toWGS(S.workCRS,p[0],p[1]);return [w[1],w[0]]});document.getElementById('prStep').value='1';document.getElementById('prNativo').checked=true;
   window.qaGridBruto=gridBruto;window.qaReadStarted=false;window.gridBruto=r=>new Promise(resolve=>{window.qaFinishRead=()=>resolve(r.d);qaReadStarted=true});window.qaBeforeLayers=S.layers.map(L=>L.id);window.qaPendingProfile=runProfile();return ids;
  });await page.waitForFunction(()=>window.qaReadStarted);
  await page.locator('#layerList [data-tree-key="R:'+asyncIds.removeRaster+'"] .ndel').click();
  const asynchronous=await page.evaluate(async()=>{qaFinishRead();await qaPendingProfile;window.gridBruto=qaGridBruto;return {resultCommitted:!!S.prof.result,createdLayers:S.layers.filter(L=>!qaBeforeLayers.includes(L.id)).map(L=>L.name),chartVisible:document.getElementById('profChart').style.display!=='none',out:document.getElementById('prOut').textContent,state:qaState()}});
  const hiddenIds=await page.evaluate(async()=>{
   const ids=await qaFixture('HIDDEN');profUpdateSourceMode('mixed');
   for(const r of [qaFixtureSources.keepRaster,qaFixtureSources.removeRaster]){qaChoose('prRasterSel',r.id);document.getElementById('btnPrRasterAdd').click()}
   for(const L of [qaFixtureSources.keep,qaFixtureSources.remove]){qaChoose('prVectorSel',L.id);document.getElementById('btnPrVectorAdd').click()}
   qaChoose('prRasterSel',ids.removeRaster);qaChoose('prVectorSel',ids.remove);document.getElementById('sidePerfis').style.display='none';return ids;
  });
  await page.locator('#layerList [data-tree-key="R:'+hiddenIds.removeRaster+'"] .ndel').click();
  await page.locator('#layerList [data-tree-key="L:'+hiddenIds.remove+'"] .ldel').click();
  const hidden=await page.evaluate(()=>{
   const whileHidden=qaState();abrePerfilTopografia(document.getElementById('btnPrDraw'),'secPrSuperficies','Perfil QA');const reopened=qaState();ribbonClose();return {whileHidden,reopened};
  });
  const undone=await page.evaluate(()=>{
   doUndo();doUndo();abrePerfilTopografia(document.getElementById('btnPrDraw'),'secPrSuperficies','Perfil QA');const state=qaState(),restored={rasters:S.rasters.map(r=>String(r.id)),vectors:S.layers.map(L=>String(L.id))};ribbonClose();return {state,restored};
  });
  const selectedAxis=await page.evaluate(async()=>{
   const ids=await qaFixture('AXIS');profUpdateSourceMode('mixed');qaChoose('prRasterSel',ids.keepRaster);qaChoose('prVectorSel',ids.keep);qaChoose('prAxisVectorSel',ids.axis+':0:0');document.getElementById('btnPrUseVectorAxis').click();
   return {ids,selected:S.prof.axisSelection?.layer===qaFixtureSources.axis,vertices:S.prof.buf.length};
  });
  await page.locator('#layerList [data-tree-key="L:'+selectedAxis.ids.axis+'"] .ldel').click();
  const removedAxis=await page.evaluate(()=>({state:qaState(),hasAxisSelection:!!S.prof.axisSelection,vertices:S.prof.buf.length,hasAxisLine:!!S.prof.line}));
  const undoneAxis=await page.evaluate(()=>{doUndo();refreshProfPanel();return {state:qaState(),hasAxisSelection:!!S.prof.axisSelection,vertices:S.prof.buf.length}});
  const shortcut=await page.evaluate(async()=>{
   const ids=await qaFixture('SHORTCUT');profUpdateSourceMode('mixed');S.prof.sourceRasterIds=[];S.prof.sourceLineIds=[];S.prof.axisPick='';S.prof.axisSelection=null;document.getElementById('prAxisVectorSel').value='';S.selFeat=null;
   // Topography shortcuts set the actual controls without dispatching change.
   // Preserve that choice even if the previous remembered selections differ.
   S.prof.rasterPick=ids.keepRaster;S.prof.vectorPick=ids.keep;document.getElementById('prRasterSel').value=ids.removeRaster;document.getElementById('prVectorSel').value=ids.remove;
   S.prof.buf=[[500002,6900002],[500010,6900010]].map(p=>{const w=toWGS(S.workCRS,p[0],p[1]);return [w[1],w[0]]});document.getElementById('prNativo').checked=true;document.getElementById('prStep').value='1';
   const read=gridBruto,calls=[];window.gridBruto=async r=>{calls.push(String(r.id));return r.d};try{await runProfile()}finally{window.gridBruto=read}
   return {ids,readRasters:calls,series:(S.prof.result?.series||[]).map(s=>({key:s.sourceKey,name:s.name})),rasterPick:S.prof.rasterPick,vectorPick:S.prof.vectorPick};
  });
  const repeatedAlignment=await page.evaluate(async()=>{
   const ids=await qaFixture('REPEAT');profUpdateSourceMode('raster');S.prof.sourceRasterIds=[];S.prof.sourceLineIds=[];S.prof.axisPick='';S.prof.axisSelection=null;S.selFeat=null;document.getElementById('prAxisVectorSel').value='';qaChoose('prRasterSel',ids.keepRaster);document.getElementById('prVectorSel').value='';S.prof.vectorPick='';document.getElementById('prName').value='A';document.getElementById('prNativo').checked=false;document.getElementById('prStep').value='1';
   S.prof.buf=[[500002,6900002],[500010,6900010]].map(p=>{const w=toWGS(S.workCRS,p[0],p[1]);return [w[1],w[0]]});const initialLayers=new Set(S.layers);await runProfile();const alignment=S.layers.find(L=>!initialLayers.has(L)),firstResult=S.prof.result;if(!alignment||!firstResult)throw Error('Initial profile alignment missing');const oldFeature=alignment.features[0];
   qaChoose('prAxisVectorSel',alignment.id+':0:0');document.getElementById('btnPrUseVectorAxis').click();const selectedOwnAxis=S.prof.axisSelection?.layer===alignment;await runProfile();
   return {selectedOwnAxis,alignmentReused:S.layers.includes(alignment)&&S.layers.filter(L=>L.name===alignment.name).length===1,featureReplaced:alignment.features[0]!==oldFeature,freshResult:!!S.prof.result&&S.prof.result!==firstResult,vertices:S.prof.buf.length,axisStillSelected:S.prof.axisSelection?.layer===alignment,axisFeatureCurrent:S.prof.axisSelection?.feature===alignment.features[0],axisPick:S.prof.axisPick,expectedAxisPick:alignment.id+':0:0'};
  });
  const report={baseline,ids,axisList,ghost,deleted,switched,asynchronous,hiddenIds,hidden,undone,selectedAxis,removedAxis,undoneAxis,shortcut,repeatedAlignment,errors};
  if(baseline){
   assert(ghost.raster.some(o=>o.value==='ghost-raster'));assert(ghost.vector.some(o=>o.value==='ghost-vector'));assert(ghost.axis.some(o=>o.value==='ghost-layer:7:0'));assert(ghost.rasterChips.includes('ghost-raster')&&ghost.vectorChips.includes('ghost-vector'));
   assert(deleted.state.raster.some(o=>o.value===ids.removeRaster));assert(deleted.state.vector.some(o=>o.value===ids.remove));assert(switched.state.raster.some(o=>switched.A.rasters.includes(o.value)));assert(asynchronous.resultCommitted&&asynchronous.createdLayers.length);
  }else{
   const noGhosts=state=>{assert(!state.raster.some(o=>o.value==='ghost-raster'));assert(!state.vector.some(o=>o.value==='ghost-vector'));assert(!state.axis.some(o=>o.value==='ghost-layer:7:0'));assert(!state.rasterChips.includes('ghost-raster'));assert(!state.vectorChips.includes('ghost-vector'));assert(!state.rasterIds.includes('ghost-raster'));assert(!state.vectorIds.includes('ghost-vector'));assert.notEqual(state.rasterPick,'ghost-raster');assert.notEqual(state.vectorPick,'ghost-vector');assert.notEqual(state.axisPick,'ghost-layer:7:0')};noGhosts(ghost);
   assert(!deleted.state.raster.some(o=>o.value===ids.removeRaster));assert(!deleted.state.vector.some(o=>o.value===ids.remove));assert(!deleted.state.axis.some(o=>o.value.startsWith(ids.remove+':')));assert(!deleted.state.rasterChips.includes(ids.removeRaster));assert(!deleted.state.vectorChips.includes(ids.remove));assert(!deleted.state.rasterIds.includes(ids.removeRaster));assert(!deleted.state.vectorIds.includes(ids.remove));
   assert(deleted.state.raster.some(o=>o.value===ids.keepRaster));assert(deleted.state.vector.some(o=>o.value===ids.keep));assert(deleted.state.rasterChips.includes(ids.keepRaster));assert(deleted.state.vectorChips.includes(ids.keep));
   assert(!switched.state.raster.some(o=>switched.A.rasters.includes(o.value)));assert(!switched.state.vector.some(o=>switched.A.vectors.includes(o.value)));assert(!switched.state.axis.some(o=>switched.A.vectors.some(id=>o.value.startsWith(id+':'))));assert(switched.currentRasterIds.every(id=>switched.state.raster.some(o=>o.value===id)));assert(switched.state.raster.every(o=>o.text.includes('PROJECT_B')));
   assert.equal(asynchronous.resultCommitted,false);assert.deepEqual(asynchronous.createdLayers,[]);assert.equal(asynchronous.chartVisible,false);
   for(const state of [hidden.reopened,undone.state]){
    assert(!state.rasterChips.includes(hiddenIds.removeRaster));assert(!state.vectorChips.includes(hiddenIds.remove));assert(!state.rasterIds.includes(hiddenIds.removeRaster));assert(!state.vectorIds.includes(hiddenIds.remove));assert.notEqual(state.rasterPick,hiddenIds.removeRaster);assert.notEqual(state.vectorPick,hiddenIds.remove);assert(state.rasterChips.includes(hiddenIds.keepRaster));assert(state.vectorChips.includes(hiddenIds.keep));
   }
   assert(!hidden.reopened.raster.some(o=>o.value===hiddenIds.removeRaster));assert(!hidden.reopened.vector.some(o=>o.value===hiddenIds.remove));
   assert(undone.restored.rasters.includes(hiddenIds.removeRaster));assert(undone.restored.vectors.includes(hiddenIds.remove));assert(undone.state.raster.some(o=>o.value===hiddenIds.removeRaster));assert(undone.state.vector.some(o=>o.value===hiddenIds.remove));
   assert.equal(selectedAxis.selected,true);assert.equal(selectedAxis.vertices,2);assert.equal(removedAxis.hasAxisSelection,false);assert.equal(removedAxis.vertices,0);assert.equal(removedAxis.hasAxisLine,false);assert(!removedAxis.state.axis.some(o=>o.value.startsWith(selectedAxis.ids.axis+':')));
   assert(undoneAxis.state.axis.some(o=>o.value.startsWith(selectedAxis.ids.axis+':')));assert.equal(undoneAxis.hasAxisSelection,false);assert.equal(undoneAxis.vertices,0);assert.notEqual(undoneAxis.state.axisPick,selectedAxis.ids.axis+':0:0');
   assert.deepEqual(shortcut.readRasters,[shortcut.ids.removeRaster]);assert.equal(shortcut.rasterPick,shortcut.ids.removeRaster);assert.equal(shortcut.vectorPick,shortcut.ids.remove);assert.deepEqual(shortcut.series.map(s=>s.key),['R:'+shortcut.ids.removeRaster,'L:'+shortcut.ids.remove]);
   assert.equal(repeatedAlignment.selectedOwnAxis,true);assert.equal(repeatedAlignment.alignmentReused,true);assert.equal(repeatedAlignment.featureReplaced,true);assert.equal(repeatedAlignment.freshResult,true);assert.equal(repeatedAlignment.vertices,2);assert.equal(repeatedAlignment.axisStillSelected,true);assert.equal(repeatedAlignment.axisFeatureCurrent,true);assert.equal(repeatedAlignment.axisPick,repeatedAlignment.expectedAxisPick);
  }
  assert.equal(axisList.valid,true);assert.equal(axisList.layerSourceCount,1);assert.equal(axisList.axisCount,3);assert(axisList.labels.some(label=>/feição 2.*parte 2/.test(label)));assert.equal(axisList.hidden,true);assert.deepEqual(errors,[]);
  fs.writeFileSync('/tmp/geomine-profile-sources-'+(baseline?'baseline':'validation')+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exit(1)});
