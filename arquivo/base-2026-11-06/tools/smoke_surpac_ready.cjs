// Real compiled UI: readiness is parsed/topology-validated, never merely two
// selected files. Only synthetic files and an isolated Chrome profile are used.
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const bundle=path.resolve(__dirname,'../dist/GeoMine.html');
const vertices=[[0,0,100],[400,0,100],[400,200,100],[0,200,100],[0,0,200],[400,0,200],[400,200,200],[0,200,200]].map(p=>[p[0]+583000,p[1]+7074000,p[2]]);
const revised=vertices.map((p,i)=>[p[0],p[1],i<4?p[2]:220]);
const faces=[[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
const makeSTR=points=>'intrusao.str,22-Sep-26,,\n0,0,0,0,\n'+points.map(p=>`1,${p[1]},${p[0]},${p[2]}`).join('\n')+'\n0,0,0,0,END\n0,0,0,0,END\nEND\n';
const dtm='intrusao.dtm,22-Sep-26,,\n0,0,0,0,\nOBJECT,1,Corpo intrusivo do arquivo\nTRISOLATION,1,Unidade descrita no Surpac\n'+faces.map((f,i)=>`${i+1},${f.map(n=>n+1).join(',')},0,0,0`).join('\n')+'\n0,0,0,0,0,0,0\nEND\n';
const file=(name,text)=>({name,mimeType:'application/octet-stream',buffer:Buffer.from(text)});
const dtmName='intrusao_fechada_triangulos_setor_norte_revisao_2026_09_22_com_identificacao_completa_da_campanha_e_dominio_geologico.dtm',
  strName='intrusao_fechada_coordenadas_setor_norte_revisao_2026_09_22_com_identificacao_completa_da_campanha_e_dominio_geologico.str',
  revisedName='intrusao_revisada_coordenadas.str';
const near=(a,b,label,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${label}: ${a} != ${b}`);
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+bundle,{waitUntil:'load'});
    await page.waitForFunction(()=>window.GeoMineGeology?.meshes);
    await page.evaluate(()=>{
      S.workCRS='EPSG:31982';S.setBase('Sem fundo');window.__meshFileReads=[];
      window.__meshNativeReader=window.FileReader;
      const read=FileReader.prototype.readAsArrayBuffer;
      FileReader.prototype.readAsArrayBuffer=function(file){__meshFileReads.push(file.name);return read.call(this,file);};
    });
    const count=()=>page.evaluate(()=>GeoMineGeology.meshes.list().length);
    async function chooseViaLabel(inputId,payload){
      const chooser=page.waitForEvent('filechooser');
      await page.locator(`label[for="${inputId}"]`).click();
      await (await chooser).setFiles(payload);
    }
    async function assertReadableReady(){
      const colors=await page.locator('#gmMeshDTMName, #gmMeshSTRName, #gmMeshPairSummary, .gm-mesh-ready label').evaluateAll(elements=>elements.map(el=>{
        const rgb=color=>color.match(/[\d.]+/g)?.map(Number)||[];
        let parent=el,bg;while(parent){const value=rgb(getComputedStyle(parent).backgroundColor);if(value.length===3||value[3]===1){bg=value.slice(0,3);break;}parent=parent.parentElement;}
        return {id:el.id||el.tagName,fg:rgb(getComputedStyle(el).color).slice(0,3),bg:bg||[255,255,255]};
      }));
      const luminance=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      for(const color of colors){const a=luminance(color.fg),b=luminance(color.bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        assert.ok(ratio>=4.5,`${color.id}: unreadable foreground/background contrast ${ratio.toFixed(2)}:1 (${color.fg} on ${color.bg})`);}
    }
    async function heldReads(){
      await page.evaluate(()=>{
        window.__meshHeld=[];window.__meshAborts=0;
        window.FileReader=class{
          readyState=0;
          readAsArrayBuffer(file){this.file=file;this.readyState=1;__meshFileReads.push(file.name);__meshHeld.push(this);}
          abort(){__meshAborts++;this.readyState=2;this.onabort?.();}
          async release(){this.result=await this.file.arrayBuffer();this.readyState=2;this.onload?.();}
        };
      });
    }
    const releaseReads=()=>page.evaluate(async()=>{window.FileReader=__meshNativeReader;await Promise.all(__meshHeld.map(reader=>reader.release()));});
    async function ready(){
      await page.waitForFunction(()=>document.querySelector('#gmMeshReady')?.checked||document.querySelector('#gmMeshStatus')?.classList.contains('error'));
      assert.equal(await page.locator('#gmMeshReady').isChecked(),true,await page.locator('#gmMeshStatus').textContent());
      assert.equal(await page.locator('#gmMeshReady').isDisabled(),true,'readiness is automatic, not user-editable');
      assert.equal(await page.locator('#gmMeshCancel').isVisible(),false,'validation finished');
    }
    async function names(expectedStr){
      assert.equal(await page.locator('#gmMeshDTMName').isVisible(),true);
      assert.equal(await page.locator('#gmMeshSTRName').isVisible(),true);
      assert.ok((await page.locator('#gmMeshDTMName').textContent()).includes(dtmName),'DTM name must remain visible');
      if(expectedStr)assert.ok((await page.locator('#gmMeshSTRName').textContent()).includes(expectedStr),'STR name must remain visible');
      assert.equal(await page.locator('#gmMeshDTM').evaluate(input=>input.files[0]?.name),dtmName,'choosing STR must not clear DTM');
    }
    await page.locator('.ribcat[data-cat-id="geologia"]').click();
    await page.locator('.rbtn').filter({hasText:'Superfícies / Sólidos Surpac'}).click();
    await page.locator('#gmMeshReady').waitFor({state:'visible'});
    assert.equal(await page.locator('#gmMeshReady').isChecked(),false);
    assert.equal(await page.locator('#gmMeshReady').isDisabled(),true);
    await chooseViaLabel('gmMeshDTM',file(dtmName,dtm));await names();
    assert.equal(await page.locator('#gmMeshReady').isChecked(),false,'one file is not a validated pair');assert.equal(await count(),0);

    // Both inputs contain real files, but a pending read must keep ready off.
    await heldReads();await chooseViaLabel('gmMeshSTR',file(strName,makeSTR(vertices)));
    await page.locator('#gmMeshCancel').waitFor({state:'visible'});await names(strName);
    assert.equal(await page.locator('#gmMeshReady').isChecked(),false,'mere selection cannot mark ready');assert.equal(await count(),0);
    await releaseReads();await ready();await names(strName);
    assert.match(await page.locator('.gm-mesh-form').textContent(),/sólido(?:\(s\))?\s+fechado|fechado(?:\(s\))?/i,'topology status must identify the closed solid');
    assert.equal(await page.locator('#gmMeshUnits').isChecked(),false,'geometry readiness must not auto-confirm units/CRS');
    assert.equal(await count(),0,'automatic validation is not automatic import');
    await page.locator('.gm-mesh-form').screenshot({path:path.resolve(__dirname,'../dist/surpac-ready-pair-smoke.png')});
    await assertReadableReady();
    for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['tablet',{width:1024,height:768}]]){
      await page.setViewportSize(viewport);
      for(const theme of ['dark','light']){
        await page.evaluate(value=>applyTheme(value),theme);await assertReadableReady();await names(strName);
        assert.equal(await page.locator('#gmMeshDTM').isVisible(),true,'native DTM chooser must be visible');
        assert.equal(await page.locator('#gmMeshSTR').isVisible(),true,'native STR chooser must be visible');
        const layout=await page.evaluate(()=>{
          const modal=document.querySelector('.gm-mesh-modal'),body=document.querySelector('.gm-mesh-body'),summary=document.querySelector('#gmMeshPairSummary'),rect=modal.getBoundingClientRect();
          return {x:rect.x,right:rect.right,width:innerWidth,overflow:body.scrollWidth-body.clientWidth,
            summaryOverflow:summary.scrollWidth-summary.clientWidth,
            names:[...document.querySelectorAll('.gm-mesh-filename')].map(el=>({text:el.textContent,overflow:el.scrollWidth-el.clientWidth,height:el.clientHeight}))};
        });
        assert.ok(layout.x>=0&&layout.right<=layout.width,`${device}/${theme}: modal outside viewport`);
        assert.ok(layout.overflow<=1,`${device}/${theme}: modal content has horizontal overflow (${layout.overflow}px)`);
        assert.ok(layout.summaryOverflow<=1,`${device}/${theme}: long object name overflows the readiness summary (${layout.summaryOverflow}px)`);
        assert.ok(layout.names.every(n=>n.overflow<=1&&n.height>40),`${device}/${theme}: long filenames must wrap without clipping`);
        await page.locator('.gm-mesh-modal').screenshot({path:path.resolve(__dirname,`../dist/surpac-ready-${device}-${theme}.png`)});
      }
    }
    await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>applyTheme('dark'));
    // A UI may disable import pending units or show the explicit guard on click.
    if(await page.locator('#gmMeshImport').isEnabled()){
      await page.locator('#gmMeshImport').click();
      await page.waitForFunction(()=>document.querySelector('#gmMeshStatus')?.textContent.includes('Confirme'));
    }
    assert.equal(await count(),0,'unconfirmed coordinates must not be imported');

    // Swapping only STR invalidates the old parse immediately and validates again.
    await heldReads();await page.locator('#gmMeshSTR').setInputFiles(file(revisedName,makeSTR(revised)));
    await page.locator('#gmMeshCancel').waitFor({state:'visible'});await names(revisedName);
    assert.equal(await page.locator('#gmMeshReady').isChecked(),false,'replaced file invalidates readiness');
    await releaseReads();await ready();assert.equal(await count(),0);

    // A bad replacement cannot leave the previously valid parse importable.
    await page.locator('#gmMeshDTM').setInputFiles(file(dtmName,dtm.replace(/END\n$/,'')));
    await page.waitForFunction(()=>document.querySelector('#gmMeshStatus')?.classList.contains('error')&&document.querySelector('#gmMeshCancel')?.hidden);
    assert.equal(await page.locator('#gmMeshReady').isChecked(),false,'invalid pair clears readiness');
    await page.locator('#gmMeshUnits').check();
    if(await page.locator('#gmMeshImport').isEnabled()){
      await page.locator('#gmMeshImport').click();
      await page.waitForFunction(()=>document.querySelector('#gmMeshCancel')?.hidden&&document.querySelector('#gmMeshStatus')?.classList.contains('error'));
    }
    assert.equal(await count(),0,'invalid replacement must never import stale geometry');await names(revisedName);

    // Cancel an automatic validation via its real button, then deliver late reads.
    await heldReads();await page.locator('#gmMeshDTM').setInputFiles(file(dtmName,dtm));
    await page.locator('#gmMeshCancel').waitFor({state:'visible'});await page.locator('#gmMeshCancel').click();
    await page.waitForFunction(()=>document.querySelector('#gmMeshCancel')?.hidden);
    assert.match(await page.locator('#gmMeshStatus').textContent(),/cancelad/i);
    assert.equal(await page.locator('#gmMeshReady').isChecked(),false);assert.ok(await page.evaluate(()=>__meshAborts>0));
    await releaseReads();assert.equal(await count(),0);assert.equal(await page.locator('#gmMeshReady').isChecked(),false,'late cancelled reads cannot resurrect readiness');

    // Validate fresh input, then import only the cached result: no third read.
    await page.locator('#gmMeshDTM').setInputFiles(file(dtmName,dtm));await ready();
    await page.locator('#gmMeshUnits').check();
    assert.equal(await page.locator('[data-mesh-name="0"]').inputValue(),'Unidade descrita no Surpac','source description should prefill the editable object name');
    await page.locator('[data-mesh-name="0"]').fill('Intrusão identificada antes de importar');
    const readCount=await page.evaluate(()=>__meshFileReads.length);
    await page.locator('#gmMeshImport').click();await page.waitForFunction(()=>GeoMineGeology.meshes.list().length===1);
    assert.equal(await page.evaluate(()=>__meshFileReads.length),readCount,'import must reuse the validated parsed pair');
    const mesh=await page.evaluate(()=>{const m=GeoMineGeology.meshes.list()[0];return {id:m.id,name:m.name,vertices:m.vertices,faces:m.faces,source:m.source,closed:m.topology.closedSolid,crs:m.crs,layers:S.layers.filter(l=>l._geology?.meshId===m.id).map(l=>({name:l.name,role:l._geology.meshRole,features:l.features}))};});
    assert.equal(mesh.name,'Intrusão identificada antes de importar');
    assert.deepEqual(mesh.layers.map(l=>l.role).sort(),['surface','vectors']);
    assert.ok(mesh.layers.every(l=>l.features.length===0&&l.name.includes(mesh.name)),'representations share the chosen object name, without bbox features');
    assert.equal(mesh.closed,true);assert.equal(mesh.faces.length,12);assert.equal(mesh.vertices.length,8);assert.equal(mesh.crs,'EPSG:31982');
    assert.equal(mesh.source.dtmName,dtmName);assert.equal(mesh.source.strName,revisedName);
    assert.equal(Math.max(...mesh.vertices.map(p=>p[2])),220,'import must use revised STR, not the first parse');
    assert.equal(Math.min(...mesh.vertices.map(p=>p[2])),100);
    await page.locator('[data-name]').fill('Intrusão fechada — teste Surpac');await page.locator('[data-name]').dispatchEvent('change');
    await page.locator('[data-color]').fill('#b25ca4');await page.locator('[data-color]').dispatchEvent('change');

    // A solid intrusion must have a true, bounded filled intersection, no MDT.
    await page.locator('#gmMeshSection').click();await page.locator('#gsecGenerate').waitFor({state:'visible'});
    await page.evaluate(id=>{
      const q=S.geology.section;q.line=[[582950,7074100],[583450,7074100]];
      q.lineWgs=q.line.map(p=>{const ll=toWGS(S.workCRS,p[0],p[1]);return [ll[1],ll[0]];});
      q.meshIds=[id];q.rasterId=null;q.useField=false;q.geologyBase=70;GeoMineGeology.refresh();
      window.__meshFills=[];const ctx=document.querySelector('#gsecCanvas').getContext('2d'),original=ctx.fill;
      ctx.fill=function(...args){__meshFills.push({rule:args[0],color:this.fillStyle,alpha:this.globalAlpha});return original.apply(this,args);};
    },mesh.id);
    await page.locator('#gsecGenerate').click();
    const section=await page.evaluate(()=>{
      const r=S.geology.section.result;if(!r)return {summary:document.querySelector('#gsecOut').textContent};
      const g=r.renderGeometry,ctx=document.querySelector('#gsecCanvas').getContext('2d');
      const pixel=(s,z)=>Array.from(ctx.getImageData(Math.round(72+s*g.xScale),Math.round(42+(g.zMax-z)*g.yScale),1,1).data);
      return {hasTerrain:r.hasTerrain,cut:r.meshSections[0],ve:g.ve,polygons:r.meshSections[0].fillPolygons,
        fills:__meshFills,inside:pixel(237,153),outside:pixel(23,153),below:pixel(237,83),summary:document.querySelector('#gsecOut').textContent};
    });
    assert.equal(section.hasTerrain,false,JSON.stringify(section));assert.equal(section.ve,1);assert.equal(section.cut.closedSolid,true);
    assert.ok(section.polygons.length>0,'closed intrusion must provide bounded fill polygons');
    const area=section.polygons.reduce((sum,p)=>sum+Math.abs(p.reduce((a,v,i)=>{const n=p[(i+1)%p.length];return a+v[0]*n[1]-n[0]*v[1];},0))/2,0);
    near(area,400*120,'true intrusion cross-section area');
    assert.ok(section.fills.some(f=>f.rule==='evenodd'&&f.color==='#b25ca4'&&Math.abs(f.alpha-.48)<.001),'solid must be filled with its native color and evenodd rule');
    assert.ok(section.inside[0]>section.inside[1]+20&&section.inside[2]>section.inside[1]+20,'canvas must visibly contain the purple solid fill');
    assert.deepEqual(section.outside,[255,255,255,255],'no fill outside the solid');
    assert.deepEqual(section.below,[255,255,255,255],'solid must not extend down to the chart base');
    assert.match(section.summary,/sólido fechado; preenchimento limitado ao corte/);
    await page.locator('#gsecCanvas').screenshot({path:path.resolve(__dirname,'../dist/surpac-ready-intrusion-smoke.png')});
    assert.deepEqual(errors,[]);
    console.log('PASS isolated Chrome: native file choosers, persistent/wrapped DTM/STR names, desktop/tablet + dark/light contrast, automatic parsed/topology readiness, units guard, replacement invalidation, bad-pair safety, cancellation, cached import and true filled solid intrusion section.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
