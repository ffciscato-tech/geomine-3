// Real GeoMine bundle and controls, synthetic geology only; no user session/files.
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1480,height:1080},timezoneId:'America/Sao_Paulo'}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('dialog',d=>d.accept());
    await page.route(/^https?:/,r=>r.abort());
    await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'),{waitUntil:'load'});
    await page.waitForFunction(()=>window.GeoMineGeology?.fieldMapping?.orientationOf);
    await page.evaluate(()=>{
      S.workCRS='EPSG:31982';
      window.__geoFixture=(kind,geom,props)=>{
        const layer=GeoMineGeology.createOrActivate(kind),feature={geom,props:{...(layer._defProps||{}),...props}};
        layer.features.push(feature);drawLayer(layer);return {layer,feature};
      };
      window.__vein=__geoFixture('veio',[[583800,7075000],[583900,7075000]],{ID:'V-01',DIRECAO:90,MERGULHO:45,ESP_M:1});
      __vein.feature._field=GeoMineGeology.fieldMapping.createFieldMeta(__vein.layer,__vein.feature,{observedAt:'2026-09-21T12:15:00.000Z'});
      GeoMineGeology.openObservationForm(__vein.layer,__vein.feature);
    });
    const field=key=>page.locator('.gmgeo-field-backdrop [data-field="'+key+'"]');
    assert.equal(await page.locator('[data-meta="observedAt"]').inputValue(),'2026-09-21T09:15');
    await field('MERGULHO').fill('120');await field('ESP_M').fill('-2');
    await page.locator('.gmgeo-field-backdrop [data-act="save"]').click();
    assert.equal(await page.locator('.gmgeo-field-backdrop').count(),1,'invalid geological form must remain open');
    assert.equal(await page.evaluate(()=>__vein.feature.props.MERGULHO),45,'invalid form must not mutate source');
    await field('MERGULHO').fill('35');await field('ESP_M').fill('2');
    if(await field('REF_ORIENT').count())await field('REF_ORIENT').selectOption('strike_rhr');
    await page.locator('.gmgeo-field-backdrop [data-act="save"]').click();
    const remainingForm=await page.locator('.gmgeo-field-backdrop').count();
    assert.equal(remainingForm,0,remainingForm?await page.locator('.gmgeo-field-backdrop [data-role="status"]').textContent():'');
    const savedForm=await page.evaluate(()=>({dip:__vein.feature.props.MERGULHO,thickness:__vein.feature.props.ESP_M,date:__vein.feature._field.observedAt}));
    assert.deepEqual(savedForm,{dip:35,thickness:2,date:'2026-09-21T12:15:00.000Z'});

    await page.evaluate(()=>{
      window.__hole=__geoFixture('sondagem',[[583850,7074990,100]],{ID_FURO:'F-01',PROF_M:20,AZIMUTE:0,INCLINACAO:90});
      __hole.feature.coreRuns=[{DE_M:0,ATE_M:10,REC_PCT:90,RQD_PCT:80,LITOLOGIA:'Unidade A'}];
      S.selFeat={layer:__hole.layer,layerId:__hole.layer.id,idx:0};GeoMineGeology.openBoreholeEditor('core');
    });
    const core=key=>page.locator('.gmgeo-table [data-key="'+key+'"]').first();
    await core('RQD_PCT').fill('101');
    assert.equal(await page.evaluate(()=>__hole.feature.coreRuns[0].RQD_PCT),80,'draft must not change stored core run');
    await page.locator('.gmgeo-backdrop [data-act="done"]').click();
    assert.equal(await page.locator('.gmgeo-table').count(),1,'RQD over 100 must block commit');
    await core('RQD_PCT').fill('70');await core('ATE_M').fill('21');
    await page.locator('.gmgeo-backdrop [data-act="done"]').click();
    assert.equal(await page.locator('.gmgeo-table').count(),1,'run past hole depth must block commit');
    await core('ATE_M').fill('12');await page.locator('.gmgeo-backdrop [data-act="cancel"]').click();
    assert.deepEqual(await page.evaluate(()=>__hole.feature.coreRuns[0]),{DE_M:0,ATE_M:10,REC_PCT:90,RQD_PCT:80,LITOLOGIA:'Unidade A'});
    await page.evaluate(()=>GeoMineGeology.openBoreholeEditor('core'));
    await core('RQD_PCT').fill('70');await core('ATE_M').fill('12');
    await page.locator('.gmgeo-backdrop [data-act="done"]').click();
    assert.equal(await page.locator('.gmgeo-table').count(),0);
    assert.equal(await page.evaluate(()=>__hole.feature.coreRuns[0].RQD_PCT),70);

    const orientation=await page.evaluate(()=>{
      const {layer,feature}=__geoFixture('acamamento',[[583820,7074990]],{DIRECAO:90,MERGULHO:40,REF_ORIENT:'dip_direction'});
      const first=ptStyleOf(layer,feature,{});
      layer._geology.fieldMap={DIRECAO:'STRIKE',MERGULHO:'DIP',REF_ORIENT:'CONVENCAO'};
      feature.props={STRIKE:125,DIP:35,CONVENCAO:'strike_rhr'};
      const imported=ptStyleOf(layer,feature,{});
      return {first:{rot:first.rot,dip:first.dip},imported:{rot:imported.rot,dip:imported.dip}};
    });
    assert.equal(orientation.first.rot,0);assert.equal(+orientation.first.dip,40);
    assert.equal(orientation.imported.rot,125);assert.equal(+orientation.imported.dip,35);
    const hatches=await page.evaluate(()=>['litologia','dique','zona-cisalhamento','dominio-geologico'].map(kind=>GeoMineGeology.createOrActivate(kind).sym.hatch));
    assert.deepEqual(hatches,['solid','solid','solid','solid']);

    // Exercise the real surface sampler, section form, canvas and PNG output.
    await page.evaluate(()=>{
      const e=583800,n=7075000;
      window.__shear=__geoFixture('zona-cisalhamento',[[[e+35,n-10],[e+45,n-10],[e+45,n+10],[e+35,n+10],[e+35,n-10]]],{ID:'ZC-01',LARGURA_M:10});
      window.__fracture=__geoFixture('fratura',[[e+70,n-10],[e+70,n+10]],{ID:'FR-01'});
      __vein.feature.geom=[[e+20,n-10],[e+20,n+10]];
      S.rasters=[{id:901,name:'MDT sintético',visible:false,d:{nc:21,nr:21,cs:10,xll:e-50,yll:n-100,z:new Float32Array(441).fill(100),zmin:100,zmax:100}}];
      const line=[[e,n],[e+100,n]];
      GeoMineGeology.sectionRestore({section:{name:'Teste A–B',lineWgs:line.map(p=>{const ll=toWGS(S.workCRS,...p);return [ll[1],ll[0]]}),rasterId:901,corridor:40,ve:1,step:5,layerIds:[__shear.layer.id,__fracture.layer.id,__vein.layer.id],roles:{},useField:false}});
      S.geology.section.line=line;
    });
    await page.locator('.ribcat[data-cat-id="geologia"]').click();
    await page.locator('.rbtn').filter({hasText:'Seção Geológica'}).click();
    await page.locator('#gsecGenerate').click();
    const section=await page.evaluate(()=>{
      const r=S.geology.section.result,cv=document.getElementById('gsecCanvas');
      return r&&{faults:r.faults.length,veins:r.veins.length,fractures:r.fractures.length,shearzones:r.shearzones.length,
        ve:r.ve,actualVE:r.renderGeometry?.ve,width:cv.width,height:cv.height,png:cv.toDataURL('image/png').length,summary:document.getElementById('gsecOut').textContent};
    });
    assert.ok(section,'section should generate from actual grid');assert.equal(section.faults,0);
    assert.ok(section.veins>0&&section.fractures>0&&section.shearzones>0);
    assert.equal(section.actualVE,section.ve,'canvas must honor the selected vertical exaggeration');
    assert.ok(section.png>3000,'section canvas should have exportable pixels');
    const png=await page.locator('#gsecCanvas').evaluate(cv=>cv.toDataURL('image/png').split(',')[1]);
    fs.writeFileSync(path.resolve(__dirname,'../geology-section-smoke.png'),Buffer.from(png,'base64'));
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({savedForm,orientation,hatches,section,errors},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
