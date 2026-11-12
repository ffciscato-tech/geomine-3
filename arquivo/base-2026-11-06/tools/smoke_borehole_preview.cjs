// Combined preview in isolated Chrome: no network, no imported project changes.
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const bundle=path.resolve(__dirname,'../dist/GeoMine.html');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());
    await page.goto('file://'+bundle,{waitUntil:'load'});await page.waitForFunction(()=>window.GeoMineGeology?.boreholePreview);
    const data=await page.evaluate(()=>{
      S.setBase('Sem fundo');window.__projectSnapshot=()=>{const data=projectData();delete data.savedAt;return JSON.stringify(data);};window.__projectBefore=__projectSnapshot();
      const host=document.createElement('div');host.id='preview-test';host.style='position:fixed;inset:10px;background:var(--bg,#0b2233);z-index:99999;overflow:auto;color:var(--ink,#e7edf2);padding:10px';document.body.append(host);
      const h={id:'F001',collar:[500000,7200000,200],depth:100,trace:[{x:500000,y:7200000,z:200,md:0},{x:500030,y:7200000,z:160,md:50},{x:500030,y:7200030,z:120,md:100}],
        survey:[{md:0,az:90,dip:53.13},{md:100,az:0,dip:53.13}],
        geologyLog:[{DE_M:10,ATE_M:40,LITOLOGIA:'Calcário',attributes:{TIPO:'A',OBS:'contato <sem inferir>'},source:{table:'litho.csv',row:2}},
          {DE_M:60,ATE_M:90,LITOLOGIA:'Filito',attributes:{TIPO:'B'},source:{table:'litho.csv',row:3}}],
        tables:[{name:'assay.csv',role:'assay',intervals:[{from:5,to:15}]}],attributes:{LOCAL:'Teste',COLLAR_CODIGO:'0001'},source:{method:'original-xyz-polyline'}};
      const collarOnly={id:'F002',collar:[500090,7200060,210],depth:null,trace:[{x:500090,y:7200060,z:210,md:0}],geologyLog:[],survey:[],tables:[],source:{method:'collar-only'}};
      window.__parsed={holes:[h,collarOnly],warnings:[]};window.__inputBefore=JSON.stringify(__parsed);window.__dispose=GeoMineGeology.boreholePreview.open(__parsed,host);__dispose.controller.render();
      const c=__dispose.controller,mesh=c.scene.children.find(o=>o.isInstancedMesh&&o.instanceColor),matrix=new THREE.Matrix4(),color=new THREE.Color(),out=[];
      for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);mesh.getColorAt(i,color);out.push({center:new THREE.Vector3().setFromMatrixPosition(matrix).toArray(),scale:new THREE.Vector3().setFromMatrixScale(matrix).toArray(),color:color.getHexString()});}
      return {data:c.data,matrices:out,counts:{...c.renderer.domElement.dataset},labels:c.scene.children.filter(o=>o.isGroup).flatMap(o=>o.children).length,memory:{...c.renderer.info.memory}};
    });
    assert.equal(data.counts.holes,'2');assert.equal(data.counts.intervals,'2');assert.equal(data.labels,2);
    assert.equal(data.matrices.length,2,'neutral gaps must not be filled with inferred lithology');
    assert.deepEqual(data.data.holes[0].intervals.map(v=>[v.from,v.to]),[[10,40],[60,90]]);
    const near=(a,b,msg)=>assert.ok(Math.abs(a-b)<1e-5,`${msg}: ${a} != ${b}`);
    // Absolute bounds center [500045,7200030,165]; renderer maps XYZ to X,Z,-Y.
    for(const [i,expected] of [[0,[-30,15,30]],[1,[-15,-25,15]]]){
      data.matrices[i].center.forEach((v,j)=>near(v,expected[j],'interpolated tube midpoint'));
      near(data.matrices[i].scale[1],30,'MD30 segment has30 physical metres in this fixture');
    }
    assert.notEqual(data.matrices[0].color,data.matrices[1].color);
    assert.match(await page.locator('.gm-bhpv-legend').textContent(),/Calcário.*Filito/);
    await page.locator('[data-bhpv-hole]').selectOption('0');await page.locator('[data-bhpv-interval]').selectOption('1');
    assert.match(await page.locator('.gm-bhpv-inspect').textContent(),/F001.*MD 60–90.*Filito.*litho.csv.*linha 3/s);
    await page.locator('[data-bhpv-interval]').selectOption('');
    assert.match(await page.locator('.gm-bhpv-inspect').textContent(),/1 intervalo\(s\) de análise.*COLLAR_CODIGO.*0001/s);
    await page.locator('[data-bhpv-hole]').selectOption('1');
    assert.match(await page.locator('.gm-bhpv-inspect').textContent(),/somente boca/);
    assert.equal(await page.locator('canvas[data-holes]').getAttribute('data-visible-intervals'),'0');
    assert.equal(await page.evaluate(()=>__dispose.controller.scene.children.filter(o=>o.isInstancedMesh&&o.instanceColor).length),0);
    await page.locator('[data-bhpv-hole]').selectOption('0');
    // Project known interval midpoint to screen, then use genuine mouse picking.
    const pick=await page.evaluate(()=>{
      const c=__dispose.controller;c.render();c.camera.updateMatrixWorld(true);
      const v=new THREE.Vector3(-30,15,30).project(c.camera),r=c.renderer.domElement.getBoundingClientRect();return{x:r.x+(v.x+1)*r.width/2,y:r.y+(1-v.y)*r.height/2};
    });
    await page.mouse.click(pick.x,pick.y);assert.match(await page.locator('.gm-bhpv-inspect').textContent(),/MD 10–40.*Calcário/s);
    await page.locator('.gm-bhpv-inspect details').evaluate(el=>el.open=true);
    assert.equal(await page.locator('.gm-bhpv-inspect').locator('sem').count(),0);
    assert.match(await page.locator('.gm-bhpv-inspect').textContent(),/contato <sem inferir>/);
    const radiusBefore=await page.locator('[data-bhpv-size]').textContent();
    await page.locator('[data-bhpv-radius]').fill('2');await page.locator('[data-bhpv-radius]').dispatchEvent('input');
    assert.notEqual(await page.locator('[data-bhpv-size]').textContent(),radiusBefore);
    await page.locator('[data-bhpv-hole]').selectOption('all');
    const canvas=page.locator('canvas[data-holes]'),rect=await canvas.boundingBox();
    const camBefore=await page.evaluate(()=>__dispose.controller.camera.position.toArray());
    await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+45,rect.y+rect.height/2+15,{steps:4});await page.mouse.up();await page.evaluate(()=>__dispose.controller.render());
    assert.notDeepEqual(await page.evaluate(()=>__dispose.controller.camera.position.toArray()),camBefore);
    await canvas.screenshot({path:path.resolve(__dirname,'../dist/borehole-preview-desktop.png')});
    await page.setViewportSize({width:800,height:700});await page.locator('[data-bhpv-fit]').click();
    await page.locator('#preview-test').screenshot({path:path.resolve(__dirname,'../dist/borehole-preview-tablet.png')});
    const cycle=await page.evaluate(()=>{
      const c=__dispose.controller;for(let i=0;i<12;i++){c.selectHole(i%2?null:0);c.render();}
      const result={memory:{...c.renderer.info.memory},unmodified:JSON.stringify(__parsed)===__inputBefore,project:__projectSnapshot()===__projectBefore};
      window.__firstDispose=__dispose;window.__dispose=GeoMineGeology.boreholePreview.open(__parsed,document.querySelector('#preview-test'));result.previousDisposed=__firstDispose.controller.disposed();
      __dispose.controller.render();result.canvases=document.querySelectorAll('#preview-test canvas').length;return result;
    });
    assert.equal(cycle.unmodified,true);assert.equal(cycle.project,true);assert.equal(cycle.previousDisposed,true);assert.equal(cycle.canvases,1);
    assert.ok(cycle.memory.geometries<=data.memory.geometries+1,'selection must release detached geometry');
    assert.ok(cycle.memory.textures<=data.memory.textures,'ID labels must release detached textures');
    const labelCap=await page.evaluate(()=>{
      const holes=Array.from({length:201},(_,i)=>({id:'F'+String(i).padStart(3,'0'),depth:null,collar:[i,0,0],trace:[{x:i,y:0,z:0,md:0}],geologyLog:[],source:{method:'collar-only'}}));
      __dispose=GeoMineGeology.boreholePreview.open({holes},document.querySelector('#preview-test'));const c=__dispose.controller;c.render();
      const result={holes:c.data.holes.length,labels:c.scene.children.filter(o=>o.isGroup).flatMap(o=>o.children).length};
      c.selectHole(200);result.last=document.querySelector('.gm-bhpv-inspect').textContent;document.querySelector('#preview-test').remove();return result;
    });
    assert.equal(labelCap.holes,201);assert.equal(labelCap.labels,200);assert.match(labelCap.last,/F200/);
    await page.waitForFunction(()=>__dispose.controller.disposed());assert.deepEqual(errors,[]);
    console.log('PASS combined 3D preview: exact MD contacts/neutral gaps, collar-only, real picking, original attributes, orbit/size/fit, label cap without dropped holes, no project mutation and disposal/reopen GPU checks.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
