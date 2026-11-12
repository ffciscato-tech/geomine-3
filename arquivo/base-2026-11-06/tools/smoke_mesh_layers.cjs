// Real mesh representations in the map/main 3D view, using synthetic Surpac
// pairs and an isolated Chrome profile. No user data or network is involved.
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {PNG}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pngjs');
const assert=require('node:assert/strict'),path=require('node:path');
const bundle=path.resolve(__dirname,'../dist/GeoMine.html');
const origin=[583000,7074000];
const world=points=>points.map(p=>[p[0]+origin[0],p[1]+origin[1],p[2]]);
const pit={name:'Cava aberta — geometria real',vertices:world([[0,100,300],[100,0,300],[200,100,300],[100,200,300],
  [60,100,200],[100,60,200],[140,100,200],[100,140,200],[100,100,200]]),
  faces:[[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7],[4,5,8],[5,6,8],[6,7,8],[7,4,8]]};
const intrusion={name:'Intrusão triangular fechada',vertices:world([[300,0,140],[450,0,140],[350,150,140],[300,0,260],[450,0,260],[350,150,260]]),
  faces:[[0,2,1],[3,4,5],[0,1,4],[0,4,3],[1,2,5],[1,5,4],[2,0,3],[2,3,5]]};
function pair(mesh,stem){return {
  name:mesh.name,dtmName:stem+'.dtm',strName:stem+'.str',
  str:stem+'.str,22-Sep-26,,\n0,0,0,0,\n'+mesh.vertices.map(p=>`1,${p[1]},${p[0]},${p[2]}`).join('\n')+'\n0,0,0,0,END\n0,0,0,0,END\nEND\n',
  dtm:stem+'.dtm,22-Sep-26,,\n0,0,0,0,\nOBJECT,1,,\nTRISOLATION,1,,\n'+mesh.faces.map((f,i)=>`${i+1},${f.map(n=>n+1).join(',')},0,0,0`).join('\n')+'\n0,0,0,0,0,0,0\nEND\n'
};}
const triangleGeometry=(vertices,faces)=>faces.map(t=>t.map(i=>vertices[i].join(',')).sort().join(';')).sort();
const geometryKeys=value=>{
  if(!value||typeof value!=='object')return {vertices:0,faces:0};
  const out={vertices:0,faces:0};for(const [key,child] of Object.entries(value)){
    if(key==='vertices'&&Array.isArray(child))out.vertices++;
    else if(key==='faces'&&Array.isArray(child))out.faces++;
    const nested=geometryKeys(child);out.vertices+=nested.vertices;out.faces+=nested.faces;
  }return out;
};

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1480,height:1080}}),errors=[];
    page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+bundle,{waitUntil:'load'});
    await page.waitForFunction(()=>window.GeoMineGeology?.meshes);
    await page.evaluate(()=>{S.workCRS='EPSG:31982';S.setBase('Sem fundo');switchView('map');});
    async function importMesh(mesh,stem){
      const result=await page.evaluate(async input=>{
        const result=await GeoMineGeology.meshes.importFiles(new File([input.dtm],input.dtmName),new File([input.str],input.strName),
          {crs:S.workCRS,unitsConfirmed:true,name:input.name});
        const m=result.meshes[0];return {id:m.id,name:m.name,vertices:m.vertices,faces:m.faces,topology:m.topology};
      },pair(mesh,stem));
      assert.deepEqual(triangleGeometry(result.vertices,result.faces),triangleGeometry(mesh.vertices,mesh.faces));
      return result;
    }
    const importedPit=await importMesh(pit,'cava_aberta'),importedIntrusion=await importMesh(intrusion,'intrusao_fechada');
    assert.equal(importedPit.topology.closedSolid,false);assert.equal(importedIntrusion.topology.closedSolid,true);
    const state=()=>page.evaluate(()=>({meshes:GeoMineGeology.meshes.list().map(m=>({id:m.id,vertices:m.vertices,faces:m.faces})),
      layers:S.layers.filter(l=>l._geology?.kind==='surpac-mesh').map(l=>({id:l.id,name:l.name,visible:l.visible!==false,
        role:l._geology.meshRole,meshId:l._geology.meshId,features:l.features,locked:l.locked,groupId:l.groupId})),
      groups:S.groups.map(g=>({id:g.id,name:g.name})),stack:S.stack.slice()}));
    const initial=await state();assert.equal(initial.meshes.length,2);assert.equal(initial.layers.length,4);
    for(const mesh of [importedPit,importedIntrusion]){
      const layers=initial.layers.filter(l=>l.meshId===mesh.id);
      assert.deepEqual(layers.map(l=>l.role).sort(),['surface','vectors']);
      assert.ok(layers.every(l=>l.features.length===0&&l.locked),'representation layers must not contain a bbox or editable duplicate geometry');
    }
    await page.waitForFunction(()=>window.GeoMineGeology?.meshViews);
    const layer=(meshId,role)=>initial.layers.find(l=>l.meshId===meshId&&l.role===role);
    const pitSurface=layer(importedPit.id,'surface'),pitVectors=layer(importedPit.id,'vectors'),
      solidSurface=layer(importedIntrusion.id,'surface'),solidVectors=layer(importedIntrusion.id,'vectors');
    await page.evaluate(()=>{S.groups.forEach(g=>g.collapsed=false);S.layers.filter(l=>l._geology?.kind==='surpac-mesh').forEach(l=>nodeSetVis({t:'L',id:l.id,o:l},true));refreshUI();fitAll();});
    async function treeToggle(id,visible){
      const data=await page.evaluate(id=>{const l=S.layers.find(l=>String(l.id)===String(id));return {visible:l.visible!==false,di:displayList().findIndex(it=>it.L===l)};},id);
      if(data.visible!==visible)await page.locator(`#layerList .layer[data-di="${data.di}"] .eye`).click();
      assert.equal(await page.evaluate(id=>S.layers.find(l=>String(l.id)===String(id)).visible!==false,id),visible,'tree visibility did not change');
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    }
    async function mapInfo(id,points=[]){return page.evaluate(({id,points})=>{
      const l=S.layers.find(l=>String(l.id)===String(id)),view=l.llayer;
      view?.redraw?.();const cv=view?._canvas,rect=cv?.getBoundingClientRect(),mr=map.getContainer().getBoundingClientRect();
      const samples=cv&&rect&&rect.width?points.map(p=>{
        const ll=toWGS(S.workCRS,p[0],p[1]),screen=map.latLngToContainerPoint([ll[1],ll[0]]),
          x=Math.round((mr.left+screen.x-rect.left)*cv.width/rect.width),y=Math.round((mr.top+screen.y-rect.top)*cv.height/rect.height);
        if(x<1||y<1||x>=cv.width-1||y>=cv.height-1)return {outsideCanvas:true,x,y};
        const bytes=cv.getContext('2d').getImageData(x-1,y-1,3,3).data,alpha=[];
        for(let i=3;i<bytes.length;i+=4)alpha.push(bytes[i]);return {alpha:Math.max(...alpha),x,y};
      }):[];
      return {inMap:!!view&&map.hasLayer(view),connected:!!cv?.isConnected,info:GeoMineGeology.meshViews.info(l),samples};
    },{id,points:points.map(p=>[p[0]+origin[0],p[1]+origin[1]])});}
    const fit=await page.evaluate(()=>S.layers.filter(l=>l._geology?.kind==='surpac-mesh').map(l=>{const bounds=layerBounds(l),valid=bounds.isValid();return {
      id:l.id,valid,inside:valid&&map.getBounds().contains(bounds.getCenter()),error:l._meshRenderError,info:GeoMineGeology.meshViews.info(l),
      crs:S.workCRS,work:GeoMineGeology.meshes.getWorkMesh(l._geology.meshId).vertices[0],
      ll:toWGS(S.workCRS,...GeoMineGeology.meshes.getWorkMesh(l._geology.meshId).vertices[0]),
      direct:GeoMineGeology.meshViews.layerBounds(l).isValid()
    };}));
    assert.ok(fit.every(l=>l.valid&&l.inside),'fitAll/layerBounds must work with empty representation features: '+JSON.stringify(fit));
    for(const l of initial.layers)await treeToggle(l.id,false);
    await treeToggle(pitSurface.id,true);
    const coverage=await mapInfo(pitSurface.id,[[100,100],[15,15]]);
    assert.equal(coverage.inMap,true);assert.equal(coverage.connected,true);assert.equal(coverage.info.faceCount,pit.faces.length);
    assert.ok(coverage.samples[0].alpha>0,JSON.stringify(coverage));
    assert.equal(coverage.samples[1].alpha,0,'empty corner of the diamond bbox must stay transparent');
    assert.equal((await mapInfo(pitVectors.id)).inMap,false,'surface toggle must not enable its vector sibling');
    await page.locator('#map').screenshot({path:path.resolve(__dirname,'../dist/mesh-real-pit-map.png')});
    await treeToggle(pitSurface.id,false);await treeToggle(pitVectors.id,true);
    const wire=await mapInfo(pitVectors.id,[[50,50],[110,110]]);
    assert.equal(wire.inMap,true);assert.equal((await mapInfo(pitSurface.id)).inMap,false);
    assert.ok(wire.samples[0].alpha>0,'triangulation boundary must be drawn');assert.equal(wire.samples[1].alpha,0,'vectors must not fill triangle interiors');
    const edges=new Set(pit.faces.flatMap(f=>[[f[0],f[1]],[f[1],f[2]],[f[2],f[0]]].map(e=>e.sort((a,b)=>a-b).join(':'))));
    assert.equal(wire.info.edgeCount,edges.size,'only unique mesh edges should be drawn');
    await treeToggle(pitVectors.id,false);await treeToggle(solidSurface.id,true);
    const solidCoverage=await mapInfo(solidSurface.id,[[365,50],[440,140]]);
    assert.ok(solidCoverage.samples[0].alpha>0,'closed intrusion actual footprint must be visible');
    assert.equal(solidCoverage.samples[1].alpha,0,'triangular intrusion must not fill its rectangle bbox');

    // The layout bitmap is a projection of actual faces, not a stretched bbox.
    const layoutSVG=await page.evaluate(id=>GeoMineGeology.meshViews.renderLayout(S.layers.find(l=>String(l.id)===String(id)),
      {x:0,y:0,width:100,height:100,x0:583000,x1:583200,y0:7074000,y1:7074200,dpi:96,mapSym:1}),pitSurface.id);
    assert.match(layoutSVG,/data-mesh-role="surface"/);const encoded=/href="data:image\/png;base64,([^"]+)"/.exec(layoutSVG)?.[1];assert.ok(encoded);
    const layoutImage=PNG.sync.read(Buffer.from(encoded,'base64'));
    const layoutAlpha=(x,y)=>layoutImage.data[(Math.round((200-y)/200*layoutImage.height)*layoutImage.width+Math.round(x/200*layoutImage.width))*4+3];
    assert.ok(layoutAlpha(100,100)>0);assert.equal(layoutAlpha(15,15),0,'layout must retain nonrectangular coverage');

    // Main 3D uses the original XYZ triangles/edges, not a separate modal or MDT.
    for(const l of initial.layers)await treeToggle(l.id,true);
    await page.evaluate(async()=>{switchView('v3d');await build3D();});
    await page.waitForFunction(()=>V3.vecGroup?.children.some(o=>o.userData?.meshRole==='surface'));
    const scene=()=>page.evaluate(()=>V3.vecGroup.children.filter(o=>o.userData?.meshId).map(o=>{
      const p=o.geometry?.attributes?.position,ys=[];for(let i=0;i<(p?.count||0);i++)ys.push(p.getY(i));
      return {id:o.userData.layerId,meshId:o.userData.meshId,role:o.userData.meshRole,visible:o.visible,type:o.type,
        indexCount:o.geometry?.index?.count||0,positionCount:p?.count||0,ySpan:Math.max(...ys)-Math.min(...ys),ve:V3.VE};
    }));
    const all3D=await scene();assert.equal(all3D.length,4,'one 3D object per representation, no duplicates');
    for(const l of initial.layers){const object=all3D.find(o=>String(o.id)===String(l.id));assert.ok(object,`main 3D missing layer ${l.id}`);
      assert.equal(object.role,l.role);assert.equal(object.type,l.role==='surface'?'Mesh':'LineSegments');
      if(l.role==='surface')assert.equal((object.indexCount||object.positionCount)/3,l.meshId===importedPit.id?pit.faces.length:intrusion.faces.length);
      assert.ok(Math.abs(object.ySpan-(l.meshId===importedPit.id?100:120)*object.ve)<1e-4,'main 3D must retain mesh elevations, not drape or flatten the triangles');}
    await treeToggle(pitSurface.id,false);
    await page.waitForFunction(id=>!V3.vecGroup?.children.some(o=>String(o.userData?.layerId)===String(id)&&o.visible),pitSurface.id);
    assert.ok((await scene()).some(o=>String(o.id)===String(pitVectors.id)&&o.visible),'hiding surface must leave vectors visible in main 3D');
    await treeToggle(pitVectors.id,false);
    await page.waitForFunction(id=>!V3.vecGroup?.children.some(o=>String(o.userData?.meshId)===String(id)&&o.visible),importedPit.id);
    assert.ok((await scene()).some(o=>o.meshId===importedIntrusion.id&&o.visible),'hiding pit must not hide the intrusion');
    await treeToggle(pitSurface.id,true);
    await page.waitForFunction(id=>V3.vecGroup?.children.some(o=>String(o.userData?.layerId)===String(id)&&o.visible),pitSurface.id);
    await page.locator('#v3dCanvasWrap').screenshot({path:path.resolve(__dirname,'../dist/mesh-main-3d.png')});
    await page.evaluate(()=>switchView('map'));
    assert.equal((await mapInfo(pitSurface.id)).inMap,true);assert.equal((await mapInfo(pitVectors.id)).inMap,false);

    // One shared geometry per mesh; independent visibility survives the file.
    const saved=await page.evaluate(()=>{window.__meshLayersSaved=projectData();return __meshLayersSaved;});
    assert.deepEqual(geometryKeys(saved),{vertices:2,faces:2},'surface/vector layers must not duplicate stored arrays');
    assert.equal(saved.geology.meshes.length,2);
    for(const l of saved.layers.filter(l=>l._geology?.kind==='surpac-mesh'))assert.deepEqual(l.features,[]);
    const beforeReload=await state();await page.evaluate(()=>loadProject(JSON.parse(JSON.stringify(__meshLayersSaved))));
    const afterReload=await state();assert.deepEqual(afterReload,beforeReload,'save/reopen must preserve role, visibility, geometry, groups and stack');
    const reopenedCoverage=await mapInfo(pitSurface.id,[[100,100],[15,15]]);
    assert.ok(reopenedCoverage.samples[0].alpha>0,'reopened mesh must render after geology.restore');assert.equal(reopenedCoverage.samples[1].alpha,0);

    // Removing only surface leaves the vector view and shared geometry alive.
    await page.evaluate(id=>deleteVectorLayer(S.layers.find(l=>String(l.id)===String(id))),pitSurface.id);
    const oneRemoved=await page.evaluate(()=>projectData());assert.equal(oneRemoved.geology.meshes.length,2);
    assert.equal(oneRemoved.layers.some(l=>String(l.id)===String(pitSurface.id)),false);
    assert.ok(oneRemoved.layers.some(l=>String(l.id)===String(pitVectors.id)));
    await page.evaluate(data=>loadProject(JSON.parse(JSON.stringify(data))),oneRemoved);
    assert.equal((await state()).layers.some(l=>String(l.id)===String(pitSurface.id)),false,'reopening a partial pair must not recreate the deliberately removed representation');
    assert.equal((await state()).meshes.length,2);
    // Undo is session-local: restore the full fixture before exercising both removals.
    await page.evaluate(async()=>{loadProject(JSON.parse(JSON.stringify(__meshLayersSaved)));S.undo=[];switchView('v3d');await build3D();});
    await page.evaluate(id=>deleteVectorLayer(S.layers.find(l=>String(l.id)===String(id))),pitSurface.id);
    await page.waitForFunction(id=>!V3.vecGroup?.children.some(o=>String(o.userData?.layerId)===String(id)&&o.visible),pitSurface.id);
    await page.evaluate(id=>deleteVectorLayer(S.layers.find(l=>String(l.id)===String(id))),pitVectors.id);
    const bothRemoved=await page.evaluate(()=>projectData());assert.equal(bothRemoved.geology.meshes.length,1,'mesh with neither representation must not be serialized');
    assert.equal(bothRemoved.geology.meshes[0].id,importedIntrusion.id);
    await page.evaluate(()=>doUndo());assert.equal((await state()).meshes.length,2,'undo of one representation must recover the original shared mesh');
    await page.evaluate(()=>doUndo());assert.equal((await state()).layers.filter(l=>l.meshId===importedPit.id).length,2);
    await page.waitForFunction(id=>V3.vecGroup?.children.some(o=>String(o.userData?.layerId)===String(id)&&o.visible),pitSurface.id);
    const undone=(await state()).meshes.find(m=>m.id===importedPit.id);
    assert.deepEqual(triangleGeometry(undone.vertices,undone.faces),triangleGeometry(pit.vertices,pit.faces));
    // Removing the last representation in the entire project must clear 3D,
    // even though the generic rebuild has no terrain or vectors left to fit.
    await page.evaluate(()=>{S.undo=[];for(const l of [...S.layers].filter(l=>l._geology?.kind==='surpac-mesh'))deleteVectorLayer(l);});
    assert.equal((await state()).meshes.length,0);
    await page.waitForFunction(()=>!V3.vecGroup?.children.some(o=>o.userData?.meshId&&o.visible));
    await page.evaluate(()=>{for(let i=0;i<4;i++)doUndo();});
    assert.equal((await state()).layers.length,4);assert.equal((await state()).meshes.length,2);
    await page.waitForFunction(()=>V3.vecGroup?.children.some(o=>o.userData?.meshRole==='surface'&&o.visible));

    // Migration: one old bbox proxy becomes two real views, retaining mesh ID,
    // original geometry, presentation and section references, exactly once.
    const legacy=await page.evaluate(id=>{
      const data=JSON.parse(JSON.stringify(__meshLayersSaved)),mesh=data.geology.meshes.find(m=>m.id===id),
        proxy=data.layers.find(l=>l._geology?.meshId===id&&l._geology.meshRole==='surface');
      data.geology.meshes=[mesh];data.layers=[proxy];proxy.visible=false;proxy.name='Legado — caixa Surpac';
      delete proxy._geology.meshRole;
      proxy.features=[{geom:[[583000,7074000],[583200,7074000],[583200,7074200],[583000,7074200],[583000,7074000]],
        props:{OBJETO_3D:proxy.name,REPRESENTACAO:'Caixa de localização — não é o contorno geológico'}}];
      mesh.layerId=proxy.id;delete mesh.layerIds;data.stack=['L:'+proxy.id];
      data.geology.section={name:'Legado A–B',meshIds:[id],line:[[582980,7074100],[583220,7074100]],lineWgs:[],layerIds:[]};return data;
    },importedPit.id);
    await page.evaluate(data=>{switchView('map');loadProject(data);},legacy);const migrated=await state();
    assert.equal(migrated.meshes.length,1);assert.equal(migrated.meshes[0].id,importedPit.id);assert.equal(migrated.layers.length,2);
    assert.deepEqual(migrated.layers.map(l=>l.role).sort(),['surface','vectors']);
    assert.ok(migrated.layers.every(l=>l.features.length===0&&!l.visible),'hidden legacy proxy must not become visible during migration');
    assert.deepEqual(triangleGeometry(migrated.meshes[0].vertices,migrated.meshes[0].faces),triangleGeometry(pit.vertices,pit.faces));
    assert.deepEqual(await page.evaluate(()=>S.geology.section.meshIds),[importedPit.id]);
    const migrationSaved=await page.evaluate(()=>projectData());assert.deepEqual(geometryKeys(migrationSaved),{vertices:1,faces:1});
    await page.evaluate(data=>loadProject(data),migrationSaved);assert.equal((await state()).layers.length,2,'migration must be idempotent');
    assert.deepEqual(errors,[]);
    console.log('PASS real Chrome: actual non-bbox map coverage, independent surface/vectors tree + main3D toggles, shared-array project roundtrip, removal/undo and legacy bbox migration.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
