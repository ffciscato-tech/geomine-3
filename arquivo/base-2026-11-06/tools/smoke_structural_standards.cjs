// Full GeoMine, isolated synthetic data only; no live session or user files.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.route(/^https?:/,route=>route.abort());
    await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'),{waitUntil:'load'});
    await page.waitForFunction(()=>window.GeoMineGeology?.standards?.resolveShape);
    await page.locator('.ribcat[data-cat-id="geologia"]').click();
    const ribbon=await page.locator('.rbtn:visible').allTextContents();
    assert.ok(ribbon.some(text=>/Eixo de Dobra/.test(text)),'ribbon names linear fold-axis attitude');
    assert.ok(ribbon.some(text=>/Traço Axial de Dobra/.test(text)),'mapped axial trace is distinguished from a measured axis');
    assert.ok(!ribbon.some(text=>/Plunging/.test(text)),'obsolete English adjective removed from user-facing command');
    await page.evaluate(()=>{
      S.workCRS='EPSG:31982';S._signikaCSS='';S.projectId='isolated-structural-standards';
      S.layers=[];S.groups=[];S.stack=[];S.rasters=[];S.img=null;S.loFrozen=false;
      window.__structural=[];
      const families={acamamento:'sd_bed',foliacao:'sd_fol',xistosidade:'sd_fol',lineacao:'lineation',plunging:'foldaxis'};
      let index=0;
      for(const [kind,shape] of Object.entries(families)){
        const layer=GeoMineGeology.createOrActivate(kind);
        layer.name='Personalizado — '+kind;layer.visible=true;
        layer.fields.push({name:'MEU_CAMPO',type:'C',length:100});
        for(const angle of [0,35,90]){
          const linear=['lineacao','plunging'].includes(kind);
          const feature={geom:[[583800+index*15,7075000+index%3*25]],props:{
            DIRECAO:30,[linear?'CAIMENTO':'MERGULHO']:angle,REF_ORIENT:'strike_rhr',MEU_CAMPO:'preservar'}};
          layer.features.push(feature);__structural.push({kind,shape,angle,layer,feature});index++;
        }
        drawLayer(layer);
      }
      const ll=toWGS(S.workCRS,583910,7075020);map.setView([ll[1],ll[0]],18);refreshUI();
    });
    const before=await page.evaluate(()=>__structural.map(({layer,feature})=>({id:layer.id,name:layer.name,kind:layer._geology.kind,fields:layer.fields,props:feature.props,geom:feature.geom})));
    const symbols=await page.evaluate(()=>__structural.map(({kind,shape,angle,layer,feature})=>{
      const st=featureStyle(layer,feature),ps=ptStyleOf(layer,feature,st),index=layer.features.indexOf(feature),
        marker=layer.llayer.getLayers().find(item=>item._fidx===index&&item.options.icon),
        mapSVG=marker?.options.icon.options.html||'',plotSVG=ptPlotSVG(ps,st.color,st.stroke,st.weight,10,20,4),
        doc=new DOMParser().parseFromString(mapSVG,'image/svg+xml'),
        plot=new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg">'+plotSVG+'</svg>','image/svg+xml'),
        a=doc.querySelector('svg > g'),b=plot.querySelector('svg > g > g');
      const geometry=node=>Array.from(node?.children||[]).map(el=>[el.localName,
        Array.from(el.attributes).filter(attr=>attr.name!=='xmlns').map(attr=>[attr.name,attr.value]).sort(),geometry(el)]);
      return {kind,angle,shape:ps.shape,rot:ps.rot,dip:ps.dip,mapSVG,plotSVG,
        matchingGeometry:!!a&&!!b&&JSON.stringify(geometry(a))===JSON.stringify(geometry(b)),
        mapTransform:a?.getAttribute('transform'),plotTransform:b?.getAttribute('transform'),
        mapText:doc.querySelector('text')?.textContent||'',plotText:plot.querySelector('text')?.textContent||''};
    }));
    for(const symbol of symbols){
      assert.ok(symbol.matchingGeometry,symbol.kind+'/'+symbol.angle+': identical symbol paths in map and Layout: '+JSON.stringify(symbol));
      assert.match(symbol.mapTransform,/rotate\(30\)|rotate\(0\)/);
      assert.equal(symbol.mapText,symbol.plotText,'map/Layout attitude annotation');
      assert.ok(symbol.mapSVG.includes('<svg'),'actual Leaflet marker rendered');
    }
    for(const [kind,field,label] of [['foliacao','MERGULHO',/mergulho.*dip/i],['lineacao','CAIMENTO',/caimento.*plunge/i],['plunging','CAIMENTO',/caimento.*plunge/i]]){
      await page.evaluate(kind=>{
        const item=__structural.find(item=>item.kind===kind&&item.angle===35);
        GeoMineGeology.openObservationForm(item.layer,item.feature);
      },kind);
      const fieldLabel=await page.locator('.gmgeo-field-backdrop [data-field="'+field+'"]').locator('..').textContent();
      assert.match(fieldLabel,label,kind+' observation terminology');
      const rawAttribute=await page.locator('.gmgeo-field-backdrop [data-field="'+field+'"]').locator('..').locator('span').first().getAttribute('title');
      assert.ok(rawAttribute.includes(field),'original attribute name remains available');
      await page.locator('.gmgeo-field-backdrop [data-act="cancel"]').click();
      await page.evaluate(kind=>openLayerProps(__structural.find(item=>item.kind===kind).layer),kind);
      const propertyLabel=await page.locator('#lpDipFieldLabel').textContent();
      assert.match(propertyLabel,kind==='foliacao'?/mergulho|dip/i:/caimento|plunge/i);
      assert.ok((await page.locator('#lpOrientationHint').textContent()).length>30,'orientation convention advice shown in properties');
      await page.locator('#lpClose').click();
    }
    const layout=await page.evaluate(async()=>{
      S.loMode='fig';S._view='layout';S.loZoom=1;S._base='Sem fundo';
      for(const id of ['loSat','loCoords','loCart','loLegend','loNorth','loScaleBar']){
        const el=document.getElementById(id);if(el)el.checked=false;
      }
      for(const [id,value] of Object.entries({loPaper:'auto',loFigW:180,loFigH:0,loPad:12,loMar:0,loGrid:0})){
        const el=document.getElementById(id);if(el)el.value=value;
      }
      document.getElementById('loScaleAuto').checked=true;document.getElementById('layout').style.display='flex';
      const ok=await buildLayout(),svg=S._lastSVG;
      const expected=__structural.map(({layer,feature})=>{
        const st=featureStyle(layer,feature),ps=ptStyleOf(layer,feature,st);
        return ps.def.d(st.color,st.stroke,Math.max(.8,+st.weight||1.5)*1.1,ps.params||{});
      });
      return {ok,length:svg?.length,allSymbols:expected.every(body=>svg.includes(body)),
        after:__structural.map(({layer,feature})=>({id:layer.id,name:layer.name,kind:layer._geology.kind,fields:layer.fields,props:feature.props,geom:feature.geom}))};
    });
    assert.equal(layout.ok,true,'full Layout builds');assert.ok(layout.length>3000);assert.ok(layout.allSymbols,'full Layout uses the same structural paths');
    assert.deepEqual(layout.after,before,'map/properties/Layout do not rename or rewrite saved data');
    assert.deepEqual(errors,[],'no uncaught errors');
    if(process.env.GEOMINE_SCREENSHOT){
      await page.evaluate(()=>{
        const grid=document.createElement('section');grid.id='qaStructuralGallery';
        grid.style.cssText='position:fixed;z-index:2147483647;inset:12px auto auto 12px;width:1050px;background:white;color:#111;padding:20px;font:16px Arial;display:grid;grid-template-columns:repeat(3,1fr);gap:8px';
        grid.innerHTML='<h2 style="grid-column:1/-1;margin:0 0 8px">Símbolos estruturais — + = coordenada observada</h2>'+
          __structural.map(({kind,angle,layer,feature})=>{
            const st=featureStyle(layer,feature),ps={...ptStyleOf(layer,feature,st),size:72};
            return '<article style="border:1px solid #aaa;min-height:145px;padding:8px"><b>'+kind+' · '+angle+'°</b><div style="position:relative;width:100px;height:100px;margin:0 auto"><span style="position:absolute;left:44px;top:44px;width:12px;height:12px"><i style="position:absolute;left:0;top:5px;width:12px;height:2px;background:#d22"></i><i style="position:absolute;left:5px;top:0;width:2px;height:12px;background:#d22"></i></span><div style="position:absolute;left:14px;top:14px">'+ptSVG(ps,st.color,st.stroke,st.weight)+'</div></div></article>';
          }).join('');
        document.body.appendChild(grid);
      });
      await page.locator('#qaStructuralGallery').screenshot({path:process.env.GEOMINE_SCREENSHOT});
    }
    console.log(JSON.stringify({pass:true,symbols:symbols.map(({kind,shape,angle,rot,dip,matchingGeometry})=>({kind,shape,angle,rot,dip,matchingGeometry})),layout:{ok:layout.ok,bytes:layout.length,allSymbols:layout.allSymbols},errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
