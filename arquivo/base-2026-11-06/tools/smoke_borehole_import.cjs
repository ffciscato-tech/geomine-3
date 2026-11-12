// Real compiled bundle, isolated Chrome, synthetic input files only.
// No user browser profile, remembered save directory, or network is used.
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const bundle=path.resolve(__dirname,'../dist/GeoMine.html');
const file=(name,text)=>({name,mimeType:'text/plain',buffer:Buffer.from(text)});
const collar='CODE;E_LOCAL;N_LOCAL;RL_LOCAL;FINAL_MD;CAMPAIGN\nF01;583000;7074000;300;100;Campanha A\nF02;583100;7074020;310;80;Campanha A\n';
const survey='CODE;STATION_M;BEARING_DEG;ANGLE_DEG\nF01;0;90;60\nF01;100;100;70\nF02;0;0;90\nF02;80;0;90\n';
const drill='HOLEID;FROM;TO;LITHOLOGY;NOTES\nF01;0;40;Calcario;Unidade A\nF01;40;100;Filito;Unidade B\nF02;0;80;Granito;Unidade C\n';
const assays='HOLEID;FROM;TO;AU_PPM;LAB\nF01;0;50;0.35;LAB-1\nF01;50;100;1.25;LAB-2\nF02;0;80;0.02;LAB-1\n';
const assayName='assays_campanha_setor_norte_revisao_2026_09_22_com_identificacao_completa_da_campanha_e_intervalos_para_preservacao.csv';
const csvFiles=[file('collar.csv',collar),file('survey.csv',survey),file('drill.csv',drill),file(assayName,assays)];
// Original order is toe -> collar. Reverse must make the last point the collar.
const str='furos.str,22-Sep-26,,\n0,0,0,0,\n7,7074000,583250,210,F03\n7,7074000,583220,250,F03\n7,7074000,583200,300,F03\n0,0,0,0,END\n0,0,0,0,END\nEND\n';
const near=(actual,expected,message,tol=1e-6)=>assert.ok(Math.abs(actual-expected)<tol,`${message}: ${actual} != ${expected}`);
function minimumCurvatureEndpoint(){
  const dir=(az,dip)=>{const a=az*Math.PI/180,b=dip*Math.PI/180;return [Math.sin(a)*Math.cos(b),Math.cos(a)*Math.cos(b),-Math.sin(b)];};
  const a=dir(90,60),b=dir(100,70),angle=Math.acos(a.reduce((n,v,i)=>n+v*b[i],0)),rf=2*Math.tan(angle/2)/angle;
  return [583000,7074000,300].map((v,i)=>v+50*rf*(a[i]+b[i]));
}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1480,height:1080}}),errors=[];
    page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+bundle,{waitUntil:'load'});
    await page.waitForFunction(()=>window.GeoMineGeology?.boreholes&&window.GeoMineBoreholeReader);
    await page.evaluate(()=>{S.workCRS='EPSG:31982';S.setBase('Sem fundo');});
    const state=()=>page.evaluate(()=>S.layers.filter(l=>l._geology?.importedBoreholes).map(l=>({
      id:l.id,name:l.name,crs:l.crs,locked:l.locked,features:l.features.map(f=>({geom:f.geom,zg:f.zg,props:f.props,
        trace:f.boreholeTrace,survey:f.boreholeSurvey,tables:f.boreholeTables,log:f.geologyLog,source:f.boreholeSource}))
    })));
    async function openViaRibbon(label){
      await page.locator('.ribcat[data-cat-id="geologia"]').click();
      const button=page.locator('.rbtn').filter({hasText:label});assert.equal(await button.count(),1);
      assert.equal(await button.locator('.ric-png:not(.ric-png-missing)').count(),1,`${label}: native icon missing`);
      await button.click();await page.locator('#gmBoreholeModal').waitFor({state:'visible'});
    }
    async function chooseFiles(files){
      assert.equal(await page.locator('#gmBHFiles').isVisible(),true,'native file input must be visible');
      const chooser=page.waitForEvent('filechooser');await page.locator('#gmBHFiles').click();await (await chooser).setFiles(files);
      const names=Array.isArray(files)?files.map(f=>f.name):[files.name];
      assert.equal(await page.locator('#gmBHFileNames').isVisible(),true,'selected filenames must remain visible');
      const shown=await page.locator('#gmBHFileNames').textContent();
      for(const name of names)assert.ok(shown.includes(name),`persistent filename missing: ${name}`);
    }
    async function assertReadable(){
      const colors=await page.locator('#gmBHHeading, #gmBHName, #gmBHFileNames, #gmBHPreview h3, #gmBHViewer h3, .gm-bh-table h3, .gm-bh-body select').evaluateAll(elements=>elements.map(el=>{
        const rgb=color=>color.match(/[\d.]+/g)?.map(Number)||[];
        let parent=el,bg;while(parent){const value=rgb(getComputedStyle(parent).backgroundColor);if(value.length===3||value[3]===1){bg=value.slice(0,3);break;}parent=parent.parentElement;}
        return {id:el.id||el.textContent.slice(0,35),fg:rgb(getComputedStyle(el).color).slice(0,3),bg:bg||[255,255,255]};
      }));
      const luminance=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      for(const color of colors){const a=luminance(color.fg),b=luminance(color.bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        assert.ok(ratio>=4.5,`${color.id}: unreadable contrast ${ratio.toFixed(2)}:1 (${color.fg} on ${color.bg})`);}
    }
    async function visualQA(){
      for(const [device,viewport] of [['desktop',{width:1480,height:1080}],['tablet',{width:1024,height:768}]]){
        await page.setViewportSize(viewport);
        for(const theme of ['dark','light']){
          await page.evaluate(value=>applyTheme(value),theme);await assertReadable();
          const layout=await page.evaluate(()=>{
            const modal=document.querySelector('.gm-bh-modal'),body=document.querySelector('.gm-bh-body'),rect=modal.getBoundingClientRect();
            const nodes=[...document.querySelectorAll('#gmBHFileNames, .gm-bh-table h3')];body.scrollTop=0;
            return {x:rect.x,right:rect.right,width:innerWidth,overflow:body.scrollWidth-body.clientWidth,
              text:nodes.map(el=>({label:el.id||el.textContent.slice(0,30),overflow:el.scrollWidth-el.clientWidth}))};
          });
          assert.ok(layout.x>=0&&layout.right<=layout.width,`${device}/${theme}: modal outside viewport`);
          assert.ok(layout.overflow<=1,`${device}/${theme}: modal has horizontal overflow (${layout.overflow}px)`);
          assert.ok(layout.text.every(n=>n.overflow<=1),`${device}/${theme}: filenames/table names clipped: ${JSON.stringify(layout.text)}`);
          await page.locator('.gm-bh-modal').screenshot({path:path.resolve(__dirname,`../dist/borehole-import-${device}-${theme}.png`)});
          await page.locator('#gmBHViewer').screenshot({path:path.resolve(__dirname,`../dist/borehole-3d-${device}-${theme}.png`)});
          assert.equal(await page.locator('#gmBHCommit').getAttribute('data-state'),'ready','theme/viewport changes must preserve validated preview');
          assert.equal(await page.locator('#gmBHCommit').isEnabled(),true);
        }
      }
      await page.setViewportSize({width:1480,height:1080});await page.evaluate(()=>applyTheme('dark'));
    }
    const close=()=>page.locator('#gmBoreholeModal [data-close]').click();
    const table=name=>page.locator('.gm-bh-table').filter({has:page.locator('h3').filter({hasText:name})});
    async function mapColumns(name,role,mapping){
      const box=table(name);assert.equal(await box.count(),1,`${name}: mapping card missing`);
      await box.locator('[data-role]').selectOption(role);
      for(const [key,value] of Object.entries(mapping))await box.locator(`[data-map="${key}"]`).selectOption(value);
    }
    async function validate(){
      await page.locator('#gmBHValidate').click();
      await page.waitForFunction(()=>document.querySelector('#gmBHCancel')?.hidden&&
        (document.querySelector('#gmBHCommit')?.dataset.state==='ready'||document.querySelector('#gmBHStatus')?.classList.contains('error')));
      assert.equal(await page.locator('#gmBHCommit').getAttribute('data-state'),'ready',await page.locator('#gmBHStatus').textContent());
      assert.equal(await page.locator('#gmBHCommit').isEnabled(),true,await page.locator('#gmBHStatus').textContent());
    }
    async function commit(expectedLayers){
      assert.equal(await page.locator('#gmBHCommit').getAttribute('data-state'),'ready','only a validated preview may be confirmed');
      await page.locator('#gmBHCommit').click();
      await page.waitForFunction(n=>S.layers.filter(l=>l._geology?.importedBoreholes).length===n,expectedLayers);
      assert.match(await page.locator('#gmBHStatus').textContent(),/importado/);
      assert.equal(await page.locator('#gmBHCommit').getAttribute('data-state'),'imported');
      assert.equal(await page.locator('#gmBHCommit').isDisabled(),true,'double commit must be blocked');
    }

    await openViaRibbon('Furos · CSV');
    assert.equal(await page.locator('#gmBHCSVOptions').isVisible(),true);
    await chooseFiles(csvFiles);
    await page.locator('#gmBHValidate').click();
    await page.waitForFunction(()=>document.querySelector('#gmBHStatus')?.textContent.includes('Confirme'));
    assert.deepEqual(await state(),[],'units confirmation must precede validation/import');
    await page.locator('#gmBHRead').click();await page.locator('.gm-bh-table').nth(3).waitFor();
    assert.equal(await page.locator('.gm-bh-table').count(),4);
    assert.equal(await table('drill.csv').locator('[data-role]').inputValue(),'drill');
    assert.equal(await table(assayName).locator('[data-role]').inputValue(),'assay');
    assert.equal(await table('collar.csv').locator('[data-map="x"]').inputValue(),'','custom coordinate name requires explicit mapping');
    await mapColumns('collar.csv','collar',{id:'CODE',x:'E_LOCAL',y:'N_LOCAL',z:'RL_LOCAL',depth:'FINAL_MD'});
    await mapColumns('survey.csv','survey',{id:'CODE',md:'STATION_M',az:'BEARING_DEG',dip:'ANGLE_DEG'});
    await mapColumns('drill.csv','drill',{id:'HOLEID',from:'FROM',to:'TO',lithology:'LITHOLOGY'});
    await mapColumns(assayName,'assay',{id:'HOLEID',from:'FROM',to:'TO'});
    await page.locator('#gmBHUnits').check();await page.locator('#gmBHDip').selectOption('down');
    await page.locator('#gmBHName').fill('Campanha CSV — desvio e litologia');
    await table('collar.csv').locator('[data-map="y"]').selectOption('E_LOCAL');
    await page.locator('#gmBHValidate').click();
    await page.waitForFunction(()=>document.querySelector('#gmBHCancel')?.hidden&&document.querySelector('#gmBHStatus')?.classList.contains('error'));
    assert.match(await page.locator('#gmBHStatus').textContent(),/coluna/i,'one column cannot be mapped as both X and Y');
    assert.equal(await page.locator('#gmBHCommit').getAttribute('data-state'),'idle','invalid scientific mapping must not become confirmable');
    assert.equal(await page.locator('#gmBHCommit').isEnabled(),true,'idle action remains available to validate corrected inputs');assert.deepEqual(await state(),[]);
    await table('collar.csv').locator('[data-map="y"]').selectOption('N_LOCAL');await validate();
    const previewRows=await page.locator('#gmBHPreview tbody tr').allTextContents();
    assert.equal(previewRows.length,2);assert.match(previewRows[0],/F01/);
    assert.equal(await page.locator('#gmBHPreview tbody tr').first().locator('td').last().textContent(),'2','drill lithology must feed geological logs');
    assert.deepEqual(await state(),[],'validation is a preview, not an import');
    await page.locator('#gmBHView3D').click();await page.locator('#gmBHViewer canvas').waitFor({state:'visible'});
    assert.equal(await page.locator('#gmBHViewer canvas').evaluate(c=>c.width>0&&c.height>0),true);
    await page.locator('#gmBHView3D').click();assert.equal(await page.locator('#gmBHViewer canvas').count(),1,'rebuilding 3D must dispose the old view');
    await page.locator('#gmBHViewer').screenshot({path:path.resolve(__dirname,'../dist/borehole-3d-smoke.png')});
    await visualQA();
    await commit(1);
    const csvLayer=(await state())[0],f01=csvLayer.features.find(f=>f.props.ID_FURO==='F01'),f02=csvLayer.features.find(f=>f.props.ID_FURO==='F02');
    assert.equal(csvLayer.crs,'EPSG:31982');assert.equal(csvLayer.locked,true);assert.equal(csvLayer.features.length,2);
    assert.equal(f01.props.CAMPAIGN,'Campanha A');assert.equal(f01.props.PROF_M,100);assert.ok(f01.trace.length>2);
    assert.deepEqual(f01.geom,[[583000,7074000]]);assert.deepEqual(f01.zg,[300]);assert.equal(f01.trace[0].md,0);assert.equal(f01.trace.at(-1).md,100);
    const endpoint=minimumCurvatureEndpoint();['x','y','z'].forEach((key,i)=>near(f01.trace.at(-1)[key],endpoint[i],`deviated endpoint ${key}`));
    near(f02.trace.at(-1).z,230,'vertical survey depth');
    assert.deepEqual(f01.log.map(r=>[r.DE_M,r.ATE_M,r.LITOLOGIA]),[[0,40,'Calcario'],[40,100,'Filito']]);
    assert.equal(f02.log.length,1);assert.equal(f01.tables.length,2);assert.equal(f01.source.dipConvention,'down');
    const assay=f01.tables.find(t=>t.role==='assay');assert.equal(assay.name,assayName);
    assert.deepEqual(assay.columns,['HOLEID','FROM','TO','AU_PPM','LAB']);
    assert.deepEqual(assay.rows,[['F01','0','50','0.35','LAB-1'],['F01','50','100','1.25','LAB-2']]);

    // Section contains the measured-depth deviated trajectory, without a fake MDT.
    await page.locator('#gmBHSection').click();await page.locator('#gsecGenerate').waitFor({state:'visible'});
    await page.evaluate(layerId=>{
      const q=S.geology.section;q.line=[[582980,7074000],[583220,7074000]];
      q.lineWgs=q.line.map(p=>{const ll=toWGS(S.workCRS,p[0],p[1]);return [ll[1],ll[0]];});
      q.layerIds=[String(layerId)];q.rasterId=null;q.meshIds=[];q.useField=false;q.corridor=100;GeoMineGeology.refresh();
      window.__bhNotices=[];const originalToast=window.toast;window.toast=(...args)=>{__bhNotices.push(args[0]);return originalToast(...args);};
    },csvLayer.id);
    await page.locator('#gsecGenerate').click();
    const section=await page.evaluate(()=>{const r=S.geology.section.result;return r?{
      hasTerrain:r.hasTerrain,holes:r.holes,profile:r.profile.series[0].z.map(Number.isFinite),runs:r.runs,
      ve:r.renderGeometry.ve,summary:document.querySelector('#gsecOut').textContent
    }:{summary:document.querySelector('#gsecOut').textContent,notices:window.__bhNotices,
      selection:S.geology.section.layerIds,roles:S.geology.section.roles,line:S.geology.section.line};});
    assert.equal(section.hasTerrain,false,JSON.stringify(section));assert.equal(section.holes.length,2);
    assert.equal(section.ve,1);assert.ok(section.profile.every(v=>!v));assert.deepEqual(section.runs,[]);
    const cutHole=section.holes.find(h=>h.label==='F01');assert.ok(cutHole,JSON.stringify(section.holes));
    assert.equal(cutHole.projection,'desurvey-xy-to-section');assert.equal(cutHole.assumedVertical,false);
    assert.equal(cutHole.depth,100);assert.equal(cutHole.intervals.length,2);
    near(cutHole.trace.at(-1).z,endpoint[2],'section uses full deviation');
    await page.locator('#gsecSave').click();await page.locator('#gsecCanvas').screenshot({path:path.resolve(__dirname,'../dist/borehole-section-smoke.png')});

    await openViaRibbon('Furos · String Surpac');
    assert.equal(await page.locator('#gmBHSTROptions').isVisible(),true);
    await chooseFiles(file('furos.str',str));await page.locator('#gmBHUnits').check();
    await page.locator('#gmBHDirection').selectOption('last');await page.locator('#gmBHName').fill('Furo STR invertido');await validate();
    assert.match(await page.locator('#gmBHStatus').textContent(),/invertida/);await commit(2);await close();
    const strLayer=(await state()).find(l=>l.name==='Furo STR invertido'),f03=strLayer.features[0];
    assert.equal(f03.props.ID_FURO,'F03');assert.deepEqual(f03.geom,[[583200,7074000]]);assert.deepEqual(f03.zg,[300]);
    assert.deepEqual(f03.trace.map(p=>[p.x,p.y,p.z]),[[583200,7074000,300],[583220,7074000,250],[583250,7074000,210]]);
    near(f03.props.PROF_M,Math.hypot(20,50)+50,'STR geometric depth');assert.equal(f03.source.depthBasis,'string-length');

    const beforeReload=await state();await page.evaluate(()=>{window.__bhSavedProject=projectData();loadProject(JSON.parse(JSON.stringify(__bhSavedProject)));});
    assert.deepEqual(await state(),beforeReload,'project save/reopen must preserve trace, survey, logs and all assay tables');
    await page.evaluate(()=>GeoMineGeology.openSection());await page.locator('#gsecGenerate').waitFor({state:'visible'});await page.locator('#gsecGenerate').click();
    assert.equal(await page.evaluate(()=>S.geology.section.result?.holes.length),2,'saved section keeps its original borehole selection');

    // Cancel an in-flight file read through the real button; no phantom import.
    await openViaRibbon('Furos · CSV');await page.locator('#gmBHFiles').setInputFiles(csvFiles);
    const installHeldReader=()=>page.evaluate(()=>{
      window.__bhOriginalReader=window.FileReader;window.__bhHeldReads=[];window.__bhAborts=0;
      window.FileReader=class{
        readyState=0;
        readAsArrayBuffer(file){this.readyState=1;this.file=file;__bhHeldReads.push(this);}
        abort(){__bhAborts++;this.readyState=2;this.onabort?.();}
        async release(){this.result=await this.file.arrayBuffer();this.readyState=2;this.onload?.();}
      };
    });
    await installHeldReader();await page.locator('#gmBHRead').click();await page.locator('#gmBHCancel').waitFor({state:'visible'});
    await page.locator('#gmBHCancel').click();await page.waitForFunction(()=>document.querySelector('#gmBHCancel').hidden);
    assert.match(await page.locator('#gmBHStatus').textContent(),/cancelada/i);
    assert.equal(await page.evaluate(()=>__bhAborts),1);assert.equal(await page.locator('#gmBHRead').isEnabled(),true);
    assert.deepEqual(await state(),beforeReload);await page.evaluate(()=>window.FileReader=__bhOriginalReader);

    // A project reopened while a read is pending cannot receive its stale result.
    await installHeldReader();await page.locator('#gmBHRead').click();await page.locator('#gmBHCancel').waitFor({state:'visible'});
    await page.evaluate(()=>loadProject(JSON.parse(JSON.stringify(__bhSavedProject))));
    await page.evaluate(async()=>{window.FileReader=__bhOriginalReader;await __bhHeldReads[0].release();});
    await page.waitForFunction(()=>document.querySelector('#gmBHCancel').hidden);
    assert.match(await page.locator('#gmBHStatus').textContent(),/projeto|interrompida/i);
    assert.equal(await page.locator('#gmBHCommit').getAttribute('data-state'),'idle','a project change must invalidate the pending import');
    assert.equal(await page.locator('#gmBHCommit').isEnabled(),true);assert.equal(await page.locator('.gm-bh-table').count(),0);
    assert.deepEqual(await state(),beforeReload);await close();

    // Also reject a valid preview committed after reopening another project state.
    await openViaRibbon('Furos · String Surpac');await page.locator('#gmBHFiles').setInputFiles(file('furos.str',str));
    await page.locator('#gmBHUnits').check();await page.locator('#gmBHDirection').selectOption('last');await validate();
    await page.evaluate(()=>loadProject(JSON.parse(JSON.stringify(__bhSavedProject))));
    await page.locator('#gmBHCommit').click();assert.match(await page.locator('#gmBHStatus').textContent(),/Valide novamente/);
    assert.equal(await page.locator('#gmBHCommit').getAttribute('data-state'),'idle','stale validated data must not remain confirmable');
    assert.deepEqual(await state(),beforeReload);await close();
    assert.deepEqual(errors,[]);
    console.log('PASS real Chrome: ribbon/native icons, native CSV/STR filechooser + persistent names, dark/light desktop/tablet contrast and wrapping, CSV worker + explicit mapping, units guard, dip-down deviation, drill logs + assays, 3D preview, borehole-only section, reversed STR, project roundtrip, cancellation and project-change guards.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
