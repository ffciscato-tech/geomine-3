// Browser regression: import actual STR/DTM via file inputs and worker,
// inspect mesh, generate without MDT, export, and save/reopen the project.
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const bundle=path.resolve(__dirname,'../dist/GeoMine.html');
const vertices=[[0,0,100],[400,0,100],[400,200,100],[0,200,100],[0,0,200],[400,0,200],[400,200,200],[0,200,200]].map(p=>[p[0]+583000,p[1]+7074000,p[2]]);
const faces=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
const str='dominio.str,21-Sep-26,,\n0,0,0,0,\n'+vertices.map(p=>`1,${p[1]},${p[0]},${p[2]}`).join('\n')+'\n0,0,0,0,END\n0,0,0,0,END\nEND\n';
const dtm='dominio.dtm,21-Sep-26,,\n0,0,0,0,\nOBJECT,1,,\nTRISOLATION,1,,\n'+faces.map((f,i)=>`${i+1},${f.map(n=>n+1).join(',')},0,0,0`).join('\n')+'\n0,0,0,0,0,0,0\nEND\n';
const file=(name,text)=>({name,mimeType:'application/octet-stream',buffer:Buffer.from(text)});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+bundle,{waitUntil:'load'});
  await page.waitForFunction(()=>window.GeoMineGeology?.meshes);
  await page.evaluate(()=>{S.workCRS='EPSG:31982';S.setBase('Sem fundo');});
  await page.locator('.ribcat[data-cat-id="geologia"]').click();
  await page.locator('.rbtn').filter({hasText:'Superfícies / Sólidos Surpac'}).click();
  await page.locator('#gmMeshDTM').setInputFiles(file('dominio.dtm',dtm));
  await page.locator('#gmMeshSTR').setInputFiles(file('dominio.str',str));
  await page.locator('#gmMeshImport').click();
  await page.waitForFunction(()=>document.querySelector('#gmMeshStatus').textContent.includes('Confirme'));
  assert.equal(await page.evaluate(()=>GeoMineGeology.meshes.list().length),0,'explicit units confirmation required');
  await page.locator('#gmMeshUnits').check();await page.locator('#gmMeshImport').click();
  await page.waitForFunction(()=>GeoMineGeology.meshes.list().length===1);
  assert.match(await page.locator('#gmMeshStatus').textContent(),/importado/);
  const data=await page.evaluate(()=>{const m=GeoMineGeology.meshes.list()[0];return {vertices:m.vertices,faces:m.faces,closed:m.topology.closedSolid,crs:m.crs,id:m.id,layers:S.layers.filter(l=>l._geology?.meshId===m.id).map(l=>({role:l._geology.meshRole,features:l.features}))};});
  const triangleGeometry=(v,f)=>f.map(t=>t.map(i=>v[i].join(',')).sort().join(';')).sort();
  assert.deepEqual(triangleGeometry(data.vertices,data.faces),triangleGeometry(vertices,faces));assert.equal(data.faces.length,12);assert.equal(data.closed,true);assert.equal(data.crs,'EPSG:31982');
  assert.deepEqual(data.layers.map(l=>l.role).sort(),['surface','vectors']);assert.ok(data.layers.every(l=>l.features.length===0));
  await page.locator('[data-name]').fill('Domínio carbonático — Surpac');await page.locator('[data-name]').dispatchEvent('change');
  await page.locator('[data-color]').fill('#b25ca4');await page.locator('[data-color]').dispatchEvent('change');
  await page.locator('[data-preview]').click();await page.locator('.gm-mesh-preview canvas').waitFor({state:'visible'});
  await page.locator('[data-preview]').click(); // rebuilding must dispose old GPU resources
  await page.locator('#gmMeshSection').click();await page.locator('#gsecGenerate').waitFor({state:'visible'});
  await page.evaluate(()=>{
    const q=S.geology.section;q.line=[[582950,7074100],[583450,7074100]];q.lineWgs=q.line.map(p=>{const ll=toWGS(S.workCRS,p[0],p[1]);return [ll[1],ll[0]];});q.useField=false;GeoMineGeology.refresh();
  });
  await page.locator('#gsecGenerate').click();
  const section=await page.evaluate(()=>{
    const r=S.geology.section.result;if(!r)return {summary:document.querySelector('#gsecOut').textContent};
    return {hasTerrain:r.hasTerrain,meshes:r.meshSections.length,closed:r.meshSections[0].closedSolid,name:r.meshSections[0].name,color:r.meshSections[0].color,ve:r.renderGeometry.ve,geometry:r.renderGeometry};
  });
  assert.equal(section.hasTerrain,false,JSON.stringify(section));assert.equal(section.meshes,1);assert.equal(section.closed,true);assert.equal(section.ve,1);assert.equal(section.color,'#b25ca4');
  await page.locator('#gsecSave').click();
  const saved=await page.evaluate(()=>{
    window.__meshProject=projectData();const data=window.__meshProject;
    return {meshes:data.geology.meshes.length,vertices:data.geology.meshes[0].vertices,meshIds:data.geology.section.meshIds,proxy:data.layers.find(l=>l._geology?.kind==='surpac-mesh').id,section:data.layers.find(l=>l.features?.some(f=>f.props?.GEOSEC_ID))?.features[0].props.MESH_SEC};
  });
  assert.equal(saved.meshes,1);assert.deepEqual(saved.vertices,data.vertices);assert.deepEqual(saved.meshIds,[data.id]);assert.ok(saved.section.includes(data.id));
  await page.evaluate(()=>loadProject(JSON.parse(JSON.stringify(window.__meshProject))));
  const reopened=await page.evaluate(()=>({count:GeoMineGeology.meshes.list().length,vertices:GeoMineGeology.meshes.list()[0].vertices,color:GeoMineGeology.meshes.getWorkMesh(S.geology.meshes[0].id).color,locked:S.layers.find(l=>l._geology?.kind==='surpac-mesh').locked}));
  assert.equal(reopened.count,1);assert.deepEqual(reopened.vertices,data.vertices);assert.equal(reopened.color,'#b25ca4');assert.equal(reopened.locked,true);
  await page.evaluate(()=>GeoMineGeology.openSection());await page.locator('#gsecGenerate').waitFor({state:'visible'});await page.locator('#gsecGenerate').click();
  assert.equal(await page.evaluate(()=>S.geology.section.result?.meshSections.length),1);
  await page.locator('#gsecCanvas').screenshot({path:path.resolve(__dirname,'../dist/surpac-section-smoke.png')});
  // Force the portable download branch; a headless native save dialog cannot
  // be answered, and must not write to any of the user's remembered folders.
  await page.evaluate(()=>{window.showSaveFilePicker=undefined;Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});});
  const download=page.waitForEvent('download');await page.locator('#gsecPNG').click();const exported=await download;
  assert.match(exported.suggestedFilename(),/secao_geologica_.*\.png/);await exported.saveAs(path.resolve(__dirname,'../dist/surpac-section-export.png'));
  // Bad pair must be atomic and must not clear previous imported meshes.
  await page.evaluate(()=>GeoMineGeology.meshes.open());
  await page.locator('#gmMeshDTM').setInputFiles(file('dominio.dtm',dtm.replace(/END\n$/,'')));
  await page.locator('#gmMeshSTR').setInputFiles(file('dominio.str',str));await page.locator('#gmMeshUnits').check();
  await page.waitForFunction(()=>document.querySelector('#gmMeshStatus').classList.contains('error'));
  assert.equal(await page.locator('#gmMeshReady').isChecked(),false);
  assert.equal(await page.locator('#gmMeshImport').isDisabled(),true);
  assert.equal(await page.evaluate(()=>GeoMineGeology.meshes.list().length),1);
  // Delayed file read cancellation: no later phantom import and dialog unlocks.
  const cancellation=await page.evaluate(async()=>{
    const Original=window.FileReader;let aborted=0;
    window.FileReader=class{readyState=0;readAsArrayBuffer(){this.readyState=1;}abort(){aborted++;this.readyState=2;this.onabort?.();}};
    const job=GeoMineGeology.meshes.importFiles(new File(['fake'],'slow.dtm'),new File(['fake'],'slow.str'),{crs:S.workCRS,unitsConfirmed:true}).then(()=>({ok:true}),e=>({error:e.message}));
    document.querySelector('#gmMeshCancel').click();const result=await job;window.FileReader=Original;return {...result,aborted,count:GeoMineGeology.meshes.list().length};
  });
  assert.match(cancellation.error,/cancelada/);assert.equal(cancellation.aborted,2);assert.equal(cancellation.count,1);
  // Removal does not serialize phantom mesh; Undo keeps original arrays alive.
  const removal=await page.evaluate(()=>{
    const layers=S.layers.filter(l=>l._geology?.kind==='surpac-mesh');deleteVectorLayer(layers[0]);
    const partial=GeoMineGeology.snapshot().meshes.length;deleteVectorLayer(layers[1]);
    const after=GeoMineGeology.snapshot().meshes.length;doUndo();doUndo();
    return {partial,after,undo:GeoMineGeology.meshes.list().length,roles:S.layers.filter(l=>l._geology?.kind==='surpac-mesh').length,vertices:GeoMineGeology.meshes.list()[0]?.vertices};
  });
  assert.equal(removal.partial,1);assert.equal(removal.after,0);assert.equal(removal.undo,1);assert.equal(removal.roles,2);assert.deepEqual(removal.vertices,data.vertices);
  assert.deepEqual(errors,[]);console.log('PASS real browser: worker import, units/CRS, mesh preview, mesh-only section, color/name, PNG, project save/reopen, bad-pair rollback, slow-read cancel, removal/undo.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
