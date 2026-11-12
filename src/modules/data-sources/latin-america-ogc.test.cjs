const fs=require('fs');
const assert=require('assert/strict');
const {chromium}=require(process.env.GEOMINE_PLAYWRIGHT || 'playwright');
const root=process.argv[2] || require('path').resolve(__dirname, '../../..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:1100,height:850}});
 await page.route('https://geomine-test.invalid/**',route=>route.fulfill({contentType:'text/html',body:'<html><body></body></html>'}));await page.goto('https://geomine-test.invalid/');
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<html><head><style>body{font:14px sans-serif;background:#14212d;color:#eee} .hsec{width:440px;padding:18px} select,input,button{padding:8px;margin:4px;background:#233442;color:white;border:1px solid #789} .wmsCatalog,.wmsLayerList{max-height:240px;overflow:auto} .wmsCard{padding:8px;border:1px solid #567}small{display:block}a{color:#7de}</style></head><body><main><div id="secWMS"></div></main></body></html>');
 const base=fs.readFileSync(root+'/src/modules/data-sources/wms-ogc.js','utf8');
 await page.addScriptTag({content:base.slice(0,base.indexOf('S.wms=S.wms'))});
 await page.addScriptTag({content:`const S={layers:[],wms:[]}; const CATS=[{id:'gis',grupos:[]},{id:'ambiente',grupos:[{it:[{ic:'ambiente_americasul'}]}]}];const RIB_ICONS={};function wmsInstalarBotaoAmericaDoSul(){};function wmsNorm(s){return s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase()}function ribbonOpen(){};function wmsParseCapabilities(t){const d=new DOMParser().parseFromString(t,'text/xml');return [...d.getElementsByTagName('Layer')].filter(n=>n.querySelector('Name')).map(n=>({name:n.querySelector('Name').textContent,title:n.querySelector('Title').textContent}))}function wmsCreateLayer(o){S.wms.push(o)}function wmsApplyOrder(){};function refreshUI(){};function importGeoJSON(j,name){S.layers.push({id:Math.random(),name,features:j.features})}const map={getBounds(){return {getWest:()=>-60,getEast:()=>-59,getSouth:()=>-35,getNorth:()=>-34}}};const L2={Util:{emptyImageUrl:'empty'}};`});
 await page.addScriptTag({content:fs.readFileSync(root+'/src/modules/data-sources/latin-america-ogc.js','utf8')});
 let passed=0;function ok(v,msg){assert(v,msg);passed++}
 ok(await page.locator('#latinCountry option').count()===5,'four countries only');
 ok(await page.locator('#latinTheme option').count()===4,'geology, environment and mining themes');
 ok(await page.locator('#latinCountry').inputValue()==='AR'&&await page.locator('#latinTheme').inputValue()==='geologia','Argentina and geology are defaults');
 ok(await page.evaluate(()=>!new URL(GeoMineLatinOGC.featureUrl({version:'2.0.0',url:'https://test/wfs'},{name:'geo'},null,1000)).searchParams.has('BBOX')),'complete download has no spatial filter');
 ok(await page.evaluate(()=>CATS.find(c=>c.id==='gis').grupos[0].it[0].ic==='latina'),'GIS icon installed');
 ok(await page.evaluate(()=>!CATS.find(c=>c.id==='ambiente').grupos.some(g=>g.it.some(i=>i.ic==='ambiente_americasul'))),'old environmental entry removed');
 for(const country of ['AR','CO','GF','UY']){await page.selectOption('#latinCountry',country);ok(await page.locator('#latinCatalog button').count()>0,'country '+country);}
 await page.selectOption('#latinCountry','AR');await page.selectOption('#latinProtocol','WFS');await page.selectOption('#latinTheme','ambiente');
 const cap='<WFS_Capabilities version="2.0.0" xmlns:ows="http://www.opengis.net/ows"><ows:OperationsMetadata><ows:Operation name="GetFeature"><ows:Parameter name="outputFormat"><ows:AllowedValues><ows:Value>application/json</ows:Value></ows:AllowedValues></ows:Parameter></ows:Operation></ows:OperationsMetadata><FeatureTypeList><FeatureType><Name>test:geologia</Name><Title>Geologia teste</Title></FeatureType></FeatureTypeList></WFS_Capabilities>';
 await page.evaluate(cap=>{window.fetch=async href=>({ok:true,text:async()=>{const u=new URL(href);if(u.searchParams.get('REQUEST')==='GetCapabilities')return cap;if(u.searchParams.get('RESULTTYPE')==='hits')return '<FeatureCollection numberMatched="1"/>';return JSON.stringify({type:'FeatureCollection',numberMatched:1,features:[{type:'Feature',geometry:{type:'Point',coordinates:[-59.5,-34.5]},properties:{rocha:'granito'}}]})}})},cap);
 await page.locator('#latinCatalog button').filter({hasText:'IDE Ambiental'}).click();await page.click('#latinConnect');await page.locator('#latinLayers input').waitFor();
 await page.check('#latinLayers input');await page.click('#latinAdd');await page.waitForFunction(()=>document.getElementById('latinStatus').textContent.includes('Vetores locais'));
 ok(await page.evaluate(()=>S.layers[0].features[0].properties.rocha==='granito'),'WFS imports attributes');
 ok(await page.evaluate(()=>S.layers[0].src.protocol==='WFS'),'WFS provenance');
 const fixture='<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:t="test" numberMatched="1"><wfs:member><t:rochas><t:tipo>granito</t:tipo><t:geom><gml:Point srsName="urn:ogc:def:crs:EPSG::4326"><gml:pos>-34.5 -59.5</gml:pos></gml:Point></t:geom></t:rochas></wfs:member></wfs:FeatureCollection>';
 const gml=await page.evaluate(x=>GeoMineLatinOGC.gml(x),fixture);ok(gml.features[0].geometry.coordinates[0]===-59.5,'GML axis order');ok(gml.features[0].properties.tipo==='granito','GML properties');
 ok(await page.evaluate(()=>{try{GeoMineLatinOGC.geojson('{"type":"FeatureCollection","features":[{"geometry":{"coordinates":[900,200]}}]}');return false}catch{return true}}),'rejects invalid coordinates');
 await page.evaluate(()=>{window.fetch=async href=>({ok:true,text:async()=>new URL(href).searchParams.get('RESULTTYPE')==='hits'?'<FeatureCollection numberMatched="1000001"/>':''})});
 await page.click('#latinAdd');await page.waitForFunction(()=>document.getElementById('latinStatus').textContent.includes('excede'));ok(await page.evaluate(()=>S.layers.length===1),'rejects overlimit without partial import');
 await page.evaluate(()=>{window.fetch=async href=>({ok:true,text:async()=>new URL(href).searchParams.get('RESULTTYPE')==='hits'?'<FeatureCollection numberMatched="2"/>':'{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[-60,-35]},"properties":{}}]}'})});
 await page.click('#latinAdd');await page.waitForFunction(()=>document.getElementById('latinStatus').textContent.includes('repetiu'));ok(await page.evaluate(()=>S.layers.length===1),'rejects server ignoring pagination');
 const pagination=await page.evaluate(async()=>{const calls=[];window.fetch=async href=>({ok:true,text:async()=>{const u=new URL(href);calls.push(Object.fromEntries(u.searchParams));if(u.searchParams.get('RESULTTYPE')==='hits')return '<ExceptionReport><ExceptionText>hits indisponível</ExceptionText></ExceptionReport>';const offset=+u.searchParams.get('STARTINDEX');return JSON.stringify({type:'FeatureCollection',features:offset<3?[{type:'Feature',id:offset,geometry:{type:'Point',coordinates:[-60+offset,-35]},properties:{id:offset}}]:[]})}});const j=await GeoMineLatinOGC.downloadFeatures({url:'https://test/wfs',version:'2.0.0',format:'application/json'},{name:'geo'},null,new AbortController().signal);return {count:j.features.length,calls};});
 ok(pagination.count===3&&pagination.calls.every(c=>!c.BBOX),'downloads all pages without hits or screen clipping');
 ok(await page.evaluate(()=>GeoMineLatinOGC.matched('<FeatureCollection numberOfFeatures="1000"/>')===null),'WFS 1.1 returned-page count is not mistaken for total');
 const snapshotText=JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[-60,-35]},properties:{litologia:'granito'}}]});
 const snapshotTest=await page.evaluate(async fixture=>{const meta={url:'/data/test.gz',featureCount:1,sha256:fixture.hash};window.fetch=async()=>new Response(new Uint8Array(fixture.bytes));const result=await GeoMineLatinOGC.downloadSnapshot({snapshot:meta},new AbortController().signal,()=>{});let corruptRejected=false;try{await GeoMineLatinOGC.downloadSnapshot({snapshot:{...meta,sha256:'incorrect'}},new AbortController().signal,()=>{})}catch{corruptRejected=true}return {count:result.features.length,rock:result.features[0].properties.litologia,corruptRejected};},{hash:require('crypto').createHash('sha256').update(snapshotText).digest('hex'),bytes:Array.from(require('zlib').gzipSync(snapshotText))});
 ok(snapshotTest.count===1&&snapshotTest.rock==='granito','complete compressed snapshot imports attributes');ok(snapshotTest.corruptRejected,'snapshot checksum rejects corrupted files');
 const wmts='<Capabilities xmlns:ows="http://www.opengis.net/ows/1.1"><Contents><Layer><ows:Identifier>geo</ows:Identifier><ows:Title>Geologia</ows:Title><Style isDefault="true"><ows:Identifier>default</ows:Identifier></Style><Format>image/png</Format><TileMatrixSetLink><TileMatrixSet>PM</TileMatrixSet></TileMatrixSetLink><ResourceURL resourceType="tile" template="https://test/{TileMatrix}/{TileRow}/{TileCol}.png"/></Layer><TileMatrixSet><ows:Identifier>PM</ows:Identifier><ows:SupportedCRS>EPSG:3857</ows:SupportedCRS><TileMatrix><ows:Identifier>0</ows:Identifier><ScaleDenominator>559082264.0287178</ScaleDenominator><TopLeftCorner>-20037508.342789244 20037508.342789244</TopLeftCorner><TileWidth>256</TileWidth><TileHeight>256</TileHeight><MatrixWidth>1</MatrixWidth><MatrixHeight>1</MatrixHeight></TileMatrix></TileMatrixSet></Contents></Capabilities>';
 const tile=await page.evaluate(x=>{const p=GeoMineLatinOGC.parse(x,'WMTS');return {unsupported:p.layers[0].unsupported,url:GeoMineLatinOGC.tileUrl({...p.layers[0].wmts,layer:'geo'},{x:0,y:0,z:0})}},wmts);ok(!tile.unsupported&&tile.url==='https://test/0/0/0.png','WMTS capabilities and matrix URL');
 await page.selectOption('#latinCountry','GF');await page.selectOption('#latinProtocol','');await page.screenshot({path:'/tmp/geomine-latin-panel.png',fullPage:true});
 ok(errors.length===0,'no browser errors '+errors.join(','));
 const app=await browser.newPage({viewport:{width:1560,height:1000}});const appErrors=[];app.on('pageerror',e=>appErrors.push(e.message));
 let localServer=null,appUrl=require('url').pathToFileURL(root+'/dist/GeoMine.html').href;
 if(process.env.GEOMINE_TEST_LIVE){
   const manifest=JSON.parse(fs.readFileSync(root+'/public/data/segemar/manifest.json','utf8'));ok(manifest.complete&&manifest.layers.length===91,'all 91 official layers prepared');
   for(const layer of manifest.layers){const hash=require('crypto').createHash('sha256');let bytes=0;for await(const chunk of fs.createReadStream(root+'/public'+layer.url).pipe(require('zlib').createGunzip())){hash.update(chunk);bytes+=chunk.length;}assert.equal(hash.digest('hex'),layer.sha256,'snapshot checksum '+layer.name);assert.equal(bytes,layer.uncompressedBytes,'snapshot bytes '+layer.name);}ok(true,'all 91 compressed files pass full checksum verification');
   localServer=require('http').createServer(async(req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname.startsWith('/data/')){const file=require('path').resolve(root+'/public'+u.pathname);if(!file.startsWith(root+'/public/data/')||!fs.existsSync(file)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',file.endsWith('.json')?'application/json':'application/gzip');fs.createReadStream(file).pipe(res);}else{res.setHeader('Content-Type','text/html');res.end(fs.readFileSync(root+'/dist/GeoMine.html'));}});
   await new Promise(resolve=>localServer.listen(0,'127.0.0.1',resolve));appUrl='http://127.0.0.1:'+localServer.address().port+'/';
 }
 await app.goto(appUrl,{waitUntil:'domcontentloaded'});
 await app.waitForFunction(()=>typeof GeoMineLatinOGC!=='undefined',null,{timeout:30000});
 await app.locator('[data-cat-id="gis"]').click();
 const button=app.locator('.rbtn').filter({hasText:'América Latina'});await button.waitFor();
 ok(await button.locator('svg').count()===1,'actual application icon');
 await app.evaluate(()=>{const cmd=CATS.find(c=>c.id==='gis').grupos.flatMap(g=>g.it).find(i=>i.ic==='latina');cmd.act([...document.querySelectorAll('.rbtn')].find(b=>b.textContent.includes('América Latina')))});
 await app.selectOption('#latinCountry','CO');ok(await app.locator('#latinCountry').isVisible(),'actual application panel visible');
 await app.screenshot({path:'/tmp/geomine-latin-full.png',fullPage:true});
 ok(appErrors.length===0,'full application errors: '+appErrors.join(','));
 const saved=await app.evaluate(x=>{const p=GeoMineLatinOGC.parse(x,'WMTS'),meta={name:'WMTS teste',url:'https://example.invalid/wmts',layers:'geo',provider:'Teste',protocol:'WMTS',wmts:p.layers[0].wmts};const layer=GeoMineLatinOGC.createWMTS(meta,false);const snapshot=projectData().wms.find(w=>w.id===layer.id);map.removeLayer(layer.llayer);S.wms=S.wms.filter(w=>w.id!==layer.id);const restored=wmsCreateLayer(JSON.parse(JSON.stringify(snapshot)),false);return {protocol:snapshot.protocol,matrix:restored.wmts.matrixSet,visible:restored.visible};},wmts);
 ok(saved.protocol==='WMTS'&&saved.matrix==='PM'&&saved.visible,'actual project WMTS save and restore');
 let argentina=null;
 if(process.env.GEOMINE_TEST_LIVE){
   await app.selectOption('#latinCountry','AR');await app.selectOption('#latinTheme','geologia');await app.selectOption('#latinProtocol','WFS');
   await app.locator('#latinCatalog button').filter({hasText:'SEGEMAR'}).click();await app.click('#latinConnect');
   await app.waitForFunction(()=>document.querySelectorAll('#latinLayers input').length>0,null,{timeout:100000});
   ok((await app.locator('#latinLayers label').first().innerText()).includes('2.5M'),'national geological map is first');
   const spatialRequests=[];app.on('request',r=>{if(r.url().includes('/data/segemar/')&&r.url().endsWith('.gz'))spatialRequests.push(r.url());});
   await app.locator('#latinLayers input').first().check();await app.click('#latinAdd');
   await app.waitForFunction(()=>document.getElementById('latinStatus').textContent.includes('Vetores locais'),null,{timeout:180000});
   argentina=await app.evaluate(()=>{const l=S.layers.find(l=>l.src?.provider?.includes('SEGEMAR'));return {name:l.name,sourceCount:l.src.sourceFeatureCount,importedParts:l.features.length,hasLithology:l.features.some(f=>!!f.props.litologia),label:l.labelField,labelOn:l.lbl.onMap,scope:l.src.scope,mode:l.sym.mode,classes:l.sym.cats.length,country:l.src.symbology?.country,unmatched:l.src.symbology?.unmatchedSourceFeatures,colors:new Set(l.sym.cats.map(c=>c.color)).size};});
   ok(argentina.sourceCount===260&&argentina.importedParts>=260&&argentina.hasLithology,'real SEGEMAR complete layer imported with geology attributes');
   ok(argentina.label&&argentina.labelOn,'Argentine principal label enabled automatically');
   ok(argentina.mode==='cat'&&argentina.classes===163&&argentina.country==='AR'&&argentina.unmatched===0&&argentina.colors>100,'official Argentine SLD colors and 163 classes applied');
   ok(spatialRequests.length>0&&spatialRequests.every(h=>!new URL(h).searchParams.has('BBOX')),'real download is independent of screen extent');
   await app.screenshot({path:'/tmp/geomine-argentina-complete.png',fullPage:true});
   await app.selectOption('#latinCountry','CO');ok(await app.locator('#latinCatalog button').count()===1,'Colombia geology shows only the verified working catalog');await app.locator('#latinCatalog button').filter({hasText:'SGC — Geologia da Colômbia'}).click();await app.click('#latinConnect');await app.waitForFunction(()=>document.querySelectorAll('#latinLayers input').length>0);
   ok(await app.locator('#latinLayers input').count()===6,'all six Colombian layers are available');
   await app.locator('#latinLayers label').filter({hasText:'Terrenos geológicos de Colombia 2015'}).locator('input').check();await app.click('#latinAdd');await app.waitForFunction(()=>document.getElementById('latinStatus').textContent.includes('Vetores locais'),null,{timeout:120000});
   const colombia=await app.evaluate(()=>{const l=S.layers.find(l=>l.src?.provider==='SGC');const saved=projectData().layers.find(x=>x.id===l.id);return {count:l.src.sourceFeatureCount,classes:l.sym.cats.length,country:l.src.symbology.country,unmatched:l.src.symbology.unmatchedSourceFeatures,savedMode:saved.sym.mode,savedClasses:saved.sym.cats.length};});
   ok(colombia.count===15&&colombia.classes===8&&colombia.country==='CO'&&colombia.unmatched===0,'complete Colombian layer imports with eight official classes');
   ok(colombia.savedMode==='cat'&&colombia.savedClasses===8,'official classification is preserved in project file');
   await app.locator('#latinLayers input:checked').uncheck();await app.locator('#latinLayers label').filter({hasText:'Unidades geológicas cronoestratigráficas'}).locator('input').check();await app.click('#latinAdd');await app.waitForFunction(()=>document.getElementById('latinStatus').textContent.includes('Vetores locais'),null,{timeout:180000});
   const units=await app.evaluate(()=>{const l=S.layers.find(l=>l.name.includes('cronoestratigráficas'));return {count:l.src.sourceFeatureCount,classes:l.sym.cats.length,unmatched:l.src.symbology.unmatchedSourceFeatures,source:l.src.url};});
   ok(units.count===7461&&units.classes>100&&units.unmatched===0&&units.source.includes('MAPAGEOLOGIA/FeatureServer/4'),'complete Colombian geological units download and use official classification');
   await app.screenshot({path:'/tmp/geomine-colombia-official.png',fullPage:true});
   for(const country of ['CO','AR','UY','GF']){
     await app.selectOption('#latinCountry',country);await app.selectOption('#latinTheme','mineracao');
     await app.locator('#latinCatalog button').first().click();await app.click('#latinConnect');await app.waitForFunction(()=>document.querySelectorAll('#latinLayers input').length>0);
     if(country==='GF')ok((await app.locator('#latinStatus').innerText()).includes('histórico'),'French rights explicitly marked historical');
     await app.locator('#latinLayers input').first().check();await app.click('#latinAdd');await app.waitForFunction(()=>document.getElementById('latinStatus').textContent.includes('Vetores locais'),null,{timeout:180000});
     const mining=await app.evaluate(c=>{const l=S.layers.find(l=>l.src?.country===c&&l.src.miningKind);const saved=projectData().layers.find(x=>x.id===l.id);return {count:l.src.sourceFeatureCount,label:l.labelField,on:l.lbl.onMap,values:l.features.slice(0,20).map(f=>f.props[l.labelField]),savedLabel:saved.labelField,date:l.src.snapshotDate}},country);
     ok(mining.count>0&&mining.label==='SUBSTANCIA_ROTULO'&&mining.on&&mining.savedLabel===mining.label,'complete mining layer and persistent substance labels '+country);
     if(country==='UY')ok(mining.values.every(v=>v==='Substância não informada na fonte'),'no inferred Uruguayan commodities');
     if(country==='GF')ok(mining.date==='2025-01-24','historic source date preserved in imported layer');
   }

 }
 const live=process.env.GEOMINE_TEST_ALL_SERVICES ? await app.evaluate(async()=>Promise.all(GeoMineLatinOGC.catalog.filter(s=>s.protocol!=='WMS').map(async s=>{try{const u=new URL(s.url);if(!/\.xml$/.test(u.pathname)){u.searchParams.set('SERVICE',s.protocol);u.searchParams.set('REQUEST','GetCapabilities');u.searchParams.set('VERSION',s.protocol==='WFS'?'2.0.0':'1.0.0');}const r=await fetch(u,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('HTTP '+r.status);const p=GeoMineLatinOGC.parse(await r.text(),s.protocol);return {country:s.pais,title:s.title,protocol:s.protocol,layers:p.layers.length,format:p.format||'GML',supported:p.layers.filter(x=>!x.unsupported).length};}catch(e){return {country:s.pais,title:s.title,protocol:s.protocol,error:e.message}}}))) : [];
 fs.writeFileSync('/tmp/geomine-latin-validation.json',JSON.stringify({passed,appErrors,live,argentina},null,2));
 console.log(JSON.stringify({live}));
 console.log(JSON.stringify({passed,browserErrors:errors,appErrors,screenshot:'/tmp/geomine-latin-full.png',argentina}));await browser.close();if(localServer)await new Promise(resolve=>localServer.close(resolve));
})().catch(e=>{console.error(e);process.exit(1)});
