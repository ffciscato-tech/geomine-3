// Synthetic geometry only, isolated browser/profile, no live project access.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route(/^https?:/,r=>r.abort());
    await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'),{waitUntil:'load'});
    await page.waitForFunction(()=>window.GeoMineLineArrows);
    await page.evaluate(()=>{
      S.workCRS='EPSG:31983';S.setBase('Sem fundo');
      window.__line=addLayer({name:'Linha dirigida',gtype:'line',crs:S.workCRS,fields:[{name:'TIPO',type:'C'}],features:[
        {geom:[[500000,7200000],[500040,7200040],[500090,7200060],[500090,7200060]],props:{TIPO:'A'},zg:[100,104,106,106]},
        {geom:[[[500020,7200020],[500060,7200010]],[[500060,7200030],[500020,7200050]]],multi:true,props:{TIPO:'B'},zg:[[102,101],[103,105]]}
      ]});window.__geomBefore=JSON.stringify(__line.features);map.fitBounds(__line.llayer.getBounds(),{padding:[100,100],animate:false});openLayerProps(__line);
    });
    await page.locator('.lp-arrow-end').selectOption('filled');await page.locator('.lp-arrow-size').fill('4');await page.locator('#lpApply').click();
    await page.waitForFunction(()=>__line.sym.arrowEnd==='filled'&&__line.sym.arrowSize===4);
    let state=await page.evaluate(()=>({sym:__line.sym,arrows:__line.llayer.getLayers().filter(o=>o._gmLineArrow).map(o=>({data:o._gmLineArrow,pane:o.options.pane,points:o._rings?.map(r=>r.map(p=>[p.x,p.y]))})),pane:panelDaCamada('L'+__line.id),unchanged:JSON.stringify(__line.features)===__geomBefore}));
    assert.equal(state.arrows.length,3);assert.ok(state.unchanged);assert.ok(state.arrows.every(a=>a.pane===state.pane));
    assert.ok(state.arrows.every(a=>a.points?.[0]?.length===3));
    const tips=await page.evaluate(()=>__line.llayer.getLayers().filter(o=>o._gmLineArrow).map(o=>{
      const expected=map.latLngToLayerPoint(o._gmLineArrow.terminal),tip=o._rings[0][1];return {dx:tip.x-expected.x,dy:tip.y-expected.y};}));
    assert.ok(tips.every(t=>Math.hypot(t.dx,t.dy)<1e-8),'Leaflet tips must coincide with actual final vertices');
    await page.locator('#lpClose').click();
    // Both clipping directions: never manufacture an arrow at the viewport
    // boundary, and do not leave arrows missing after panning back.
    const clipping=await page.evaluate(async()=>{
      const center=map.getCenter();map.panBy([3000,0],{animate:false});await new Promise(r=>setTimeout(r,60));
      const hidden=__line.llayer.getLayers().filter(o=>o._gmLineArrow).every(o=>o._parts.length===0);
      map.setView(center,map.getZoom(),{animate:false});await new Promise(r=>setTimeout(r,60));
      return {hidden,restored:__line.llayer.getLayers().filter(o=>o._gmLineArrow).every(o=>o._parts.length===1)};
    });assert.deepEqual(clipping,{hidden:true,restored:true});
    // Global setting and a per-category override use the same resolved style.
    await page.evaluate(()=>{__line.sym.mode='cat';__line.sym.field='TIPO';__line.sym.cats=[{value:'A',color:'#008800',count:1},{value:'B',color:'#880000',count:1}];openLayerProps(__line);});
    await page.locator('#lpClasses .cls-h').nth(1).click();
    await page.locator('#lpClasses .cls').nth(1).locator('.ce-arrow-end').selectOption('open');
    await page.locator('#lpClasses .cls').nth(1).locator('.ce-arrow-size').fill('2');await page.locator('#lpApply').click();
    const categories=await page.evaluate(()=>__line.features.map(f=>featureStyle(__line,f)));
    assert.equal(categories[0].arrowEnd,'filled');assert.equal(categories[0].arrowSize,4);assert.equal(categories[1].arrowEnd,'open');assert.equal(categories[1].arrowSize,2);
    await page.locator('#lpClose').click();
    await page.evaluate(()=>{layerStyleCopy(__line);window.__copy=addLayer({name:'Cópia estilo',gtype:'line',crs:S.workCRS,fields:__line.fields,features:[{geom:[[500010,7200060],[500025,7200070]],props:{TIPO:'A'}}]});layerStylePaste(__copy);__copy.visible=false;drawLayer(__copy);});
    assert.deepEqual(await page.evaluate(()=>({a:__copy.sym.arrowEnd,b:__copy.sym.arrowSize,c:__copy.sym.cats[1].arrowEnd})),{a:'filled',b:4,c:'open'});
    const saved=await page.evaluate(()=>{window.__savedArrows=projectData();loadProject(JSON.parse(JSON.stringify(__savedArrows)));window.__line=S.layers.find(l=>l.name==='Linha dirigida');return __line.sym;});
    assert.equal(saved.arrowEnd,'filled');assert.equal(saved.arrowSize,4);assert.equal(saved.cats[1].arrowEnd,'open');
    await page.evaluate(async()=>{map.fitBounds(__line.llayer.getBounds(),{padding:[100,100],animate:false});S.loFrozen=null;S.loMode='fig';document.getElementById('loPaper').value='a3l';document.getElementById('loLegend').checked=true;await buildLayout({exporting:true});});
    let layout=await page.evaluate(()=>{const svg=new DOMParser().parseFromString(S._lastSVG,'image/svg+xml');return {
      map:[...svg.querySelectorAll('g[clip-path="url(#mapclip)"] [data-gm-line-arrow]')].map(p=>({mode:p.getAttribute('data-gm-line-arrow'),d:p.getAttribute('d')})),
      all:svg.querySelectorAll('[data-gm-line-arrow]').length,xmlError:!!svg.querySelector('parsererror')};});
    assert.equal(layout.xmlError,false);assert.equal(layout.map.length,3);assert.equal(layout.map.filter(a=>a.mode==='open').length,2);assert.ok(layout.all>3,'legend must retain arrowheads');
    await page.screenshot({path:path.resolve(__dirname,'../dist/line-arrows-map.png')});
    const terrain=await page.evaluate(()=>{
      const original=S.rasters;S.rasters=[{id:'arrow-test-terrain',name:'MDT',visible:true,style:{opacity:1},d:{xll:499900,yll:7199900,nc:4,nr:4,cs:100,z:new Float32Array(16).fill(103)}}];
      const get=()=>__line.llayer.getLayers().filter(o=>o._gmLineArrow);
      __line.visReal=true;drawLayer(__line);const opaque=get().length;
      S.rasters[0].style.opacity=.5;drawLayer(__line);const translucent=get().map(o=>o.options.opacity);
      __line.sym.cats[1].vis=false;drawLayer(__line);const hiddenClass=get().length;
      delete __line.sym.cats[1].vis;__line.visReal=false;S.rasters=original;drawLayer(__line);
      return {opaque,translucent,hiddenClass};
    });assert.equal(terrain.opaque,2,'buried true terminal is hidden, without creating arrow at terrain crossing');
    assert.equal(terrain.translucent.length,3);assert.ok(terrain.translucent.includes(.5));assert.equal(terrain.hiddenClass,1);
    // The main 3D vector renderer receives original terminal XYZ, including
    // per-category styling. Arrowhead width updates with camera zoom.
    const three=await page.evaluate(()=>{
      V3.scene=new THREE.Scene();V3.vecGroup=new THREE.Group();V3.scene.add(V3.vecGroup);V3.cam=new THREE.PerspectiveCamera(45,1,1,10000);V3.cam.position.set(200,400,200);
      V3.ren={domElement:{clientHeight:900,clientWidth:900},render(){}};V3._ctx={rasters:[],OX:500000,OY:7200000,zmnG:0,VE:1,bg:'ffffff'};
      v3BuildVectors();const arrows=V3.vecGroup.children.filter(o=>o.userData.gmLineArrow),tip=arrows.map(o=>{
        const p=o.geometry.getAttribute('position'),b=o.userData.gmLineArrow.b;return {error:Math.hypot(p.getX(1)-b.x,p.getY(1)-b.y,p.getZ(1)-b.z),type:o.type,layer:o.userData.layerId};});
      return {count:arrows.length,tip,unchanged:JSON.stringify(__line.features)===__geomBefore};
    });assert.equal(three.count,3);assert.ok(three.tip.every(t=>t.error<1e-5));assert.ok(three.unchanged);
    // Canvas mode: many features still use the same geometry and pane.
    const canvas=await page.evaluate(()=>{
      V3.ren=null;__line.visible=false;drawLayer(__line);
      const count=BIG_LAYER+1,features=Array.from({length:count},(_,i)=>({geom:[[500000+i*.01,7200000],[500050+i*.01,7200040]],props:{}})),
        layer=addLayer({name:'Canvas',gtype:'line',features,fields:[],crs:S.workCRS});layer.sym.arrowEnd='open';drawLayer(layer);
      const heads=layer.llayer.getLayers().filter(o=>o._gmLineArrow);return {count:heads.length,expected:count,canvas:heads.every(o=>o._renderer===layer._cnvR),pane:heads.every(o=>o.options.pane===panelDaCamada('L'+layer.id))};
    });assert.equal(canvas.count,canvas.expected);assert.ok(canvas.canvas&&canvas.pane);
    assert.deepEqual(errors,[]);
    console.log('PASS line arrows: properties/global/category, exact end vertices, multipart/duplicates, panning, terrain visibility, copy/reopen, Layout/export/legend, main 3D and per-layer canvas.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
