// Real Chrome input against the built bundle; isolated synthetic project only.
// Usage: node tools/smoke_geological_section_drawing.cjs [path/to/GeoMine.html]
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const bundle=path.resolve(process.argv[2]||path.join(__dirname,'../dist/GeoMine.html'));
const screen={nearVertex:{x:805,y:305},a:{x:870,y:400},b:{x:1000,y:500},c:{x:970,y:650},
  point:{x:1070,y:580},line:{x:930,y:710},empty:{x:760,y:780},vertex:{x:800,y:300}};

function near(actual,expected,message,tolerance=1e-8){
  assert.equal(actual.length,expected.length,message+' dimensions');
  actual.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<=tolerance,
    message+': '+JSON.stringify(actual)+' != '+JSON.stringify(expected)));
}

async function fixture(browser,hasTouch=false){
  const context=await browser.newContext({viewport:{width:1480,height:950},hasTouch,
    timezoneId:'America/Sao_Paulo'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  await page.route(/^https?:/,route=>route.abort());
  await page.goto('file://'+bundle,{waitUntil:'load'});
  await page.waitForFunction(()=>window.GeoMineGeology?.openSection);
  await page.evaluate(()=>{
    S.workCRS='EPSG:31982';S.snapOn=true;S.snapVtxOn=true;S.snapNearOn=true;
    S.setBase('Sem fundo');map.setView([-26.4,-50.2],16,{animate:false});
  });
  await page.locator('.ribcat[data-cat-id="geologia"]').click();
  await page.locator('.rbtn').filter({hasText:'Seção Geológica'}).click();
  await page.locator('#gsecDraw').waitFor({state:'visible'});
  await page.evaluate(points=>{
    const ll=p=>map.mouseEventToLatLng({clientX:p.x,clientY:p.y}),
      xy=p=>{const q=ll(p);return [q.lng,q.lat];};
    const polygon=addLayer({name:'Unidade sintética cobrindo o clique',gtype:'polygon',crs:'EPSG:4326',
      color:'#8bc6b0',fields:[{name:'UNIDADE',type:'C',length:40}],features:[{
        geom:[[{x:800,y:300},{x:1110,y:300},{x:1110,y:740},{x:800,y:740},{x:800,y:300}].map(xy)],
        multi:true,props:{UNIDADE:'Unidade sintética'}}]});
    polygon._geology={schemaVersion:1,kind:'litologia'};
    const line=addLayer({name:'Linha sintética',gtype:'line',crs:'EPSG:4326',fields:[],color:'#ed6a5a',
      features:[{geom:[xy({x:860,y:710}),xy({x:1030,y:710})],props:{}}]});
    line.weight=8;line.sym.weight=8;drawLayer(line);
    const point=addLayer({name:'Ponto sintético',gtype:'point',crs:'EPSG:4326',fields:[],color:'#8b5cf6',
      features:[{geom:[xy(points.point)],props:{}}]});
    S.activeId=polygon.id;S.selFeat=null;refreshUI();GeoMineGeology.refresh();
    window.__sectionSmoke={polygonId:polygon.id,lineId:line.id,pointId:point.id};
  },screen);
  // Confirm the synthetic objects really occupy the browser click targets.
  const hitTargets=await page.evaluate(points=>Object.fromEntries(['a','point','line','empty'].map(key=>{
    const p=points[key],element=document.elementFromPoint(p.x,p.y),layer=S.layers.find(l=>
      l.llayer?.getLayers().some(item=>{const node=item.getElement?.();return node&&(node===element||node.contains(element));}));
    return [key,{tag:element?.tagName,interactive:!!element?.closest('.leaflet-interactive'),
      inMap:map.getContainer().contains(element),layerType:layer?.gtype||null}];
  })),screen);
  for(const key of ['a','point','line'])assert.ok(hitTargets[key].interactive,
    key+' fixture must be a real interactive vector: '+JSON.stringify(hitTargets));
  assert.ok(hitTargets.empty.inMap&&!hitTargets.empty.interactive,'empty target must be bare map');
  assert.equal(hitTargets.a.layerType,'polygon');assert.equal(hitTargets.point.layerType,'point');
  assert.equal(hitTargets.line.layerType,'line');
  return {context,page,errors,hitTargets};
}

async function rawCoordinate(page,p){
  return page.evaluate(point=>{const ll=map.mouseEventToLatLng({clientX:point.x,clientY:point.y});
    return [ll.lat,ll.lng];},p);
}
async function state(page){
  return page.evaluate(()=>({points:S.geology.section.lineWgs.map(p=>p.slice()),line:S.geology.section.line,
    tool:S.tool,snapOn:S.snapOn,activeId:S.activeId,selection:S.selFeat?.layerId??null,
    axis:document.querySelectorAll('.gsec-axis').length,
    rubberband:document.querySelectorAll('.gsec-rubberband').length,
    info:document.getElementById('gsecLineInfo').textContent}));
}
async function clickMap(page,p,expectedCount,{touch=false}={}){
  const expected=await rawCoordinate(page,p);
  if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);
  // More than one animation frame catches duplicate native/manual dispatch.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const got=await state(page);
  assert.equal(got.points.length,expectedCount,'one real input must append exactly one vertex');
  return {got,expected};
}
async function installSurface(page){
  await page.evaluate(()=>{
    const line=S.geology.section.lineWgs.map(p=>fromWGS(S.workCRS,p[1],p[0])),
      xs=line.map(p=>p[0]),ys=line.map(p=>p[1]),cs=25,
      xll=Math.floor((Math.min(...xs)-100)/cs)*cs,yll=Math.floor((Math.min(...ys)-100)/cs)*cs,
      nc=Math.ceil((Math.max(...xs)+100-xll)/cs)+1,nr=Math.ceil((Math.max(...ys)+100-yll)/cs)+1;
    S.rasters=[{id:901,name:'MDT sintético da seção',visible:false,style:{mode:'hipso_hs',opacity:0.8},d:{nc,nr,cs,xll,yll,
      z:new Float32Array(nc*nr).fill(100),zmin:100,zmax:100}}];
    GeoMineGeology.refresh();
  });
}

(async()=>{
  const browser=await chromium.launch({headless:true,
    executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const {context,page,errors,hitTargets}=await fixture(browser);
    assert.equal(await page.locator('#gsecSnap').isChecked(),false,'section snap defaults to free placement');
    await page.locator('#gsecDraw').click();
    const armed=await state(page);assert.equal(armed.tool,'geoSection');assert.equal(armed.snapOn,true);

    // A is only five pixels from a polygon vertex: global snap must not move it.
    let result=await clickMap(page,screen.nearVertex,1);
    near(result.got.points[0],result.expected,'free A must match the cursor, not a nearby vertex');
    assert.equal(result.got.snapOn,true,'free section must leave the global magnet enabled');
    const vertex=await rawCoordinate(page,screen.vertex);
    assert.ok(Math.hypot(result.got.points[0][0]-vertex[0],result.got.points[0][1]-vertex[1])>1e-7);
    await page.mouse.move(screen.b.x,screen.b.y);
    await page.waitForFunction(()=>document.querySelector('.gsec-rubberband'));
    const preview=await state(page);assert.equal(preview.points.length,1,'preview must not commit B');
    await page.evaluate(()=>{
      window.__sectionEditorState={on:ED.on,pend:ED.pend,ts:ED._pendTs,click:edMapClick};
      ED.on=true;ED.pend={kind:'section-smoke-must-not-run'};ED._pendTs=0;
      edMapClick=()=>{throw new Error('section click leaked to pending vector editor');};
    });
    result=await clickMap(page,screen.b,2);near(result.got.points[1],result.expected,'free B');
    await page.evaluate(()=>{
      const old=__sectionEditorState;ED.on=old.on;ED.pend=old.pend;ED._pendTs=old.ts;edMapClick=old.click;
      delete window.__sectionEditorState;
    });
    result=await clickMap(page,screen.c,3);near(result.got.points[2],result.expected,'third vertex');
    assert.ok(result.got.axis>0,'confirmed segments must be rendered above the map');
    const beforeFinish=result.got.points;
    await page.locator('#gsecFinish').click();
    const finished=await state(page);
    finished.points.forEach((point,index)=>near(point,beforeFinish[index],'Concluir must preserve map point '+index));
    assert.equal(finished.points.length,beforeFinish.length,'Concluir must not insert a map point');
    assert.equal(finished.tool,'select');
    assert.equal(await page.evaluate(()=>S.layers.find(layer=>layer.id===S.activeId)?.features.some(feature=>feature.props?.GEOSEC_ID===S.geology.section.id)),true,
      'finishing activates the automatically created section layer');
    assert.equal(finished.selection,null,'drawing over a feature must not select it');
    assert.equal(finished.rubberband,0,'finish removes the temporary segment');

    // Render from a small synthetic MDT, save actual layer metadata, then reopen.
    await installSurface(page);
    const pitId=await page.evaluate(()=>{
      const line=S.geology.section.lineWgs.map(p=>fromWGS(S.workCRS,p[1],p[0])),
        xs=line.map(p=>p[0]),ys=line.map(p=>p[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,
        cy=(Math.min(...ys)+Math.max(...ys))/2,dx=(Math.max(...xs)-Math.min(...xs))/2+80,
        dy=(Math.max(...ys)-Math.min(...ys))/2+80,
        ring=f=>[[cx-dx*f,cy-dy*f],[cx+dx*f,cy-dy*f],[cx+dx*f,cy+dy*f],[cx-dx*f,cy+dy*f],[cx-dx*f,cy-dy*f]],
        levels=[[1,90,'Crista'],[.75,65,'Pé'],[.60,65,'Crista'],[.35,40,'Fundo']],
        L=addLayer({name:'Cava de teste — bancos',gtype:'line',crs:S.workCRS,color:'#c05b17',fields:[{name:'ELEMENTO',type:'C',length:40}],
          features:levels.map(([f,z,element])=>({geom:ring(f),zg:Array(5).fill(z),props:{ELEMENTO:element,COTA:z}}))});
      L._cava2DesignId='smoke-cava-vector';L._cava2Role='line';L._cava2Kind='cava';
      GeoMineGeology.refresh();return L.id;
    });
    await page.locator(`#gsecProjects input[data-project="L:${pitId}"]`).check();
    await page.locator('#gsecGeologyBase').fill('25,5');
    await page.locator('#gsecName').fill('Seção desenhada livremente');
    await page.locator('#gsecRaster').selectOption('901');
    await page.locator('#gsecCorridor').fill('60');
    assert.equal(await page.locator('#gsecVE').count(),0,'vertical exaggeration control was removed');
    await page.locator('#gsecStep').fill('20');await page.locator('#gsecUseField').uncheck();
    await page.locator('#gsecGenerate').click();
    const generated=await page.evaluate(()=>{const r=S.geology.section.result;
      return r&&{length:r.met.total,samples:r.profile?.length,ve:r.renderGeometry?.ve,base:r.geologyBase,
        projects:r.projects.map(p=>({name:p.name,segments:p.segments.length,points:p.segments.flat().length,
          connected:p.connectedProfile,isolated:(p.points||[]).length})),baseAxis:r.renderGeometry.zMin,
        pngLength:document.getElementById('gsecCanvas').toDataURL('image/png').length};});
    assert.ok(generated&&generated.length>0,'real surface sampler must generate the clicked section');
    assert.equal(generated.ve,1);assert.ok(generated.pngLength>3000);
    assert.equal(generated.base,25.5);assert.equal(generated.projects.length,1);assert.ok(generated.projects[0].points>4);
    assert.equal(generated.baseAxis,25.5);assert.equal(generated.projects[0].connected,true);assert.equal(generated.projects[0].isolated,0);
    const png=await page.locator('#gsecCanvas').evaluate(canvas=>canvas.toDataURL('image/png').split(',')[1]);
    fs.writeFileSync(path.join(path.dirname(bundle),'geology-cava-base-smoke.png'),Buffer.from(png,'base64'));
    await page.locator('#gsecSave').click();
    const saved=await page.evaluate(()=>{const id=S.geology.section.id,
      layer=S.layers.find(l=>l.features.some(f=>f.props?.GEOSEC_ID===id)),feature=layer.features[0];
      return {id,props:feature.props,geom:feature.geom,project:projectData()};});
    assert.equal(saved.props.NOME,'Seção desenhada livremente');assert.equal(saved.props.CORREDOR,60);
    assert.equal(saved.props.EXAG_V,1);assert.equal(saved.props.PASSO_M,20);assert.equal(saved.props.CAMPO_USO,0);
    assert.equal(saved.props.GEO_BASE,25.5);assert.equal(saved.props.PROJ_SEC,'L:'+pitId);
    assert.equal(saved.geom.length,3);
    await page.locator('#projIn').setInputFiles({name:'smoke-section.ccmgis',mimeType:'application/octet-stream',
      buffer:Buffer.from(JSON.stringify(saved.project))});
    await page.waitForFunction(()=>S.auto.name==='smoke-section.ccmgis');
    await page.locator('.ribcat[data-cat-id="geologia"]').click();
    await page.locator('.rbtn').filter({hasText:'Seção Geológica'}).click();
    await page.locator('#gsecSaved').selectOption(saved.id);
    const reopened=await page.evaluate(()=>{const q=S.geology.section;return {id:q.id,name:q.name,
      line:q.line,corridor:q.corridor,ve:q.ve,step:q.step,useField:q.useField,base:q.geologyBase,projects:q.projectSources};});
    assert.equal(reopened.id,saved.id);assert.equal(reopened.name,saved.props.NOME);
    assert.deepEqual(reopened.line.map(p=>p.slice(0,2)),saved.geom.map(p=>p.slice(0,2)));
    assert.equal(reopened.corridor,60);
    assert.equal(reopened.ve,1);assert.equal(reopened.step,20);assert.equal(reopened.useField,false);
    assert.equal(reopened.base,25.5);assert.deepEqual(reopened.projects,['L:'+pitId]);
    assert.equal(await page.locator('#gsecGeologyBase').inputValue(),'25.5');
    assert.equal(await page.locator(`#gsecProjects input[data-project="L:${pitId}"]`).isChecked(),true);
    await page.locator('#gsecGenerate').click();
    assert.equal(await page.evaluate(()=>S.geology.section.result?.projects[0]?.segments.length>0),true);
    assert.deepEqual(errors,[],'desktop browser must have no unhandled errors');
    await context.close();

    // Fresh map: independently exercise marker, line, bare map and optional snap.
    const second=await fixture(browser),p=second.page;
    await p.locator('#gsecDraw').click();
    for(const [index,key] of ['point','line','empty'].entries()){
      const hit=await clickMap(p,screen[key],index+1);near(hit.got.points[index],hit.expected,key+' cursor');
      assert.equal(hit.got.selection,null,key+' must feed section drawing instead of selection');
    }
    await installSurface(p);await p.locator('#gsecUseField').uncheck();
    await p.locator('#gsecGenerate').click();
    assert.equal(await p.evaluate(()=>S.geology.section.result?.line.length),3,
      'Generate should accept the line while drawing is still armed');
    assert.equal((await state(p)).tool,'select','Generate finalizes drawing and keeps a real section layer');
    assert.equal(await p.evaluate(()=>S.layers.filter(layer=>layer.features.some(feature=>feature.props?.GEOSEC_ID)).length),1);
    await p.locator('#gsecDraw').click();
    for(const [index,key] of ['point','line','empty','a'].entries()){
      result=await clickMap(p,screen[key],index+1);near(result.got.points[index],result.expected,'new four-point axis '+key);
    }
    assert.equal(result.got.line,null,'new drawing keeps its source line pending until finalization');
    await installSurface(p);await p.locator('#gsecGenerate').click();
    assert.equal(await p.evaluate(()=>S.geology.section.result?.line.length),4,
      'Generate must include every point in a newly drawn four-point section');
    assert.equal(await p.evaluate(()=>S.layers.filter(layer=>layer.features.some(feature=>feature.props?.GEOSEC_ID)).length),2,
      'newly generated section keeps the first one in its own layer');
    await p.locator('#gsecClear').click();
    let cleared=await state(p);assert.equal(cleared.points.length,0);assert.equal(cleared.line,null);
    assert.equal(cleared.axis,0);assert.equal(cleared.rubberband,0);
    await p.locator('#gsecSnap').check();await p.evaluate(()=>{S.snapNearOn=false;});
    await p.locator('#gsecDraw').click();
    result=await clickMap(p,screen.nearVertex,1);
    const snappedVertex=await p.evaluate(()=>{
      const l=S.layers.find(x=>x.id===__sectionSmoke.polygonId),point=l.features[0].geom[0][0],
        ll=toWGS(l.crs,point[0],point[1]);return [ll[1],ll[0]];
    });
    near(result.got.points[0],snappedVertex,'opt-in should honor the existing global snap');
    assert.equal(result.got.snapOn,true);
    // Opt-in cannot override a globally disabled magnet.
    await p.locator('#gsecClear').click();await p.evaluate(()=>{S.snapOn=false;});
    await p.locator('#gsecDraw').click();result=await clickMap(p,screen.nearVertex,1);
    near(result.got.points[0],result.expected,'global snap off remains free even with section opt-in');
    assert.equal(result.got.snapOn,false);
    await p.mouse.move(screen.b.x,screen.b.y);
    await p.waitForFunction(()=>document.querySelector('.gsec-rubberband'));
    await p.keyboard.press('Escape');
    const cancelled=await state(p);
    assert.equal(cancelled.tool,'select','Escape must leave section drawing');
    assert.equal(cancelled.rubberband,0,'Escape must immediately remove the uncommitted preview');
    assert.equal(cancelled.points.length,1,'cancel must not commit the cursor position');
    // The shell may also dismiss its command palette on Escape.
    if(!await p.locator('#gsecClear').isVisible()){
      await p.locator('.ribcat[data-cat-id="geologia"]').click();
      await p.locator('.rbtn').filter({hasText:'Seção Geológica'}).click();
    }
    await p.locator('#gsecClear').click();cleared=await state(p);
    assert.equal(cleared.points.length,0);assert.equal(cleared.axis,0);assert.equal(cleared.rubberband,0);
    assert.deepEqual(second.errors,[]);await second.context.close();

    const touch=await fixture(browser,true);
    assert.equal(await touch.page.locator('#gsecSnap').isChecked(),false);
    await touch.page.locator('#gsecDraw').click();
    const touchA=await clickMap(touch.page,screen.a,1,{touch:true}),
      touchB=await clickMap(touch.page,screen.b,2,{touch:true});
    near(touchA.got.points[0],touchA.expected,'touch A');near(touchB.got.points[1],touchB.expected,'touch B');
    await touch.page.locator('#gsecFinish').click();
    const touchFinished=await state(touch.page);assert.equal(touchFinished.tool,'select');
    assert.equal(touchFinished.points.length,2);assert.deepEqual(touch.errors,[]);
    await touch.context.close();
    console.log(JSON.stringify({ok:true,hitTargets,desktopVertices:finished.points.length,
      generated,reopened:{...reopened,lineVertices:reopened.line.length,line:undefined},
      markerLineEmpty:true,optInSnap:true,globalSnapPreserved:true,touchVertices:touchFinished.points.length},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
