// Calha e massa d'água em destinos separados, sem camadas de nome repetido.
// Navegador isolado e terreno sintético: nenhum projeto do usuário é aberto.
// PLAYWRIGHT_MODULE, CHROME_PATH e APP_PATH permitem rodar fora do macOS.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stage=path.resolve(__dirname,'..');let passed=0;
const pass=name=>{passed++;console.log('PASS '+name);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800},hasTouch:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route(/^https?:/,r=>r.abort());
  await page.goto(pathToFileURL(path.resolve(process.env.APP_PATH||path.join(stage,'dist/GeoMine.html'))).href);
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineChannelExtraction&&window.GeoMineChannelLive&&window.GeoMineChannelDestination);
  await page.evaluate(()=>{
   GeoMineChannelLive.stop();S.setBase('Sem fundo');S.projectId='channel-kind-synthetic';S.workCRS='EPSG:31982';
   // Leito plano de 4 m, margens de 3 m e várzea plana: o modo automático encontra as margens.
   const nc=241,nr=81,cs=.5,xll=499989.75,yll=7399979.75,z=new Float32Array(nc*nr);
   for(let r=0;r<nr;r++)for(let c=0;c<nc;c++){const x=xll+(c+.5)*cs,y=yll+(nr-r-.5)*cs,d=Math.abs(y-7400000);z[r*nc+c]=100+.1*(x-500000)+Math.min(3,Math.max(0,d-2));}
   S.rasters.push({id:9951,name:'MDT sintético — calha e massa d’água',crs:S.workCRS,visible:false,style:{mode:'hipso'},d:{nc,nr,cs,csy:cs,xll,yll,z,zmin:99,zmax:124,native:true,resampled:1,srcCRS:S.workCRS}});
   window.__axis=addLayer({name:'Rios sintéticos',gtype:'line',crs:S.workCRS,fields:[{name:'ID',type:'C'}],features:[{geom:[[500000,7400000],[500040,7400000]],props:{ID:'A'}},{geom:[[500060,7400000],[500100,7400000]],props:{ID:'B'}}]});
   window.__select=i=>{S.activeId=__axis.id;ED.on=false;ED.sel=null;S.selFeat={layer:__axis,layerId:__axis.id,idx:i};GeoMineChannelExtraction.open();};
   window.__summary=()=>({count:S.layers.length,names:S.layers.map(L=>L.name),pairs:GeoMineChannelDestination.pairs().map(p=>({id:p.id,kind:p.kind,name:p.name,complete:p.complete,restorable:p.restorable,
    entries:p.layers.map(L=>L._channelLink.entries.length),modes:[...new Set(p.layers.flatMap(L=>L._channelLink.entries.map(e=>e.options.mode)))].sort()}))});
  });
  const status=()=>page.locator('#chanStatus').textContent();
  const summary=()=>page.evaluate(()=>__summary());
  const create=async()=>{await page.locator('#chanCommit').tap();await page.waitForFunction(()=>!document.getElementById('chanCommit').disabled);};
  // "Gerar como" (calha/massa de água) define o tipo; o método vem da lista do tipo.
  const setup=async(i,kind,mode,height)=>{await page.evaluate(i=>__select(i),i);await page.locator('#chanScope').selectOption('feature');await page.locator('#chanRaster').selectOption('9951');
   await page.locator(kind==='agua'?'#chanKindAgua':'#chanKindCalha').check();
   await page.locator('#chanMode').selectOption(mode);if(height!=null)await page.locator('#chanHeight').fill(String(height));
   await page.locator('#chanInterval').fill('5');await page.locator('#chanLimit').check();await page.locator('#chanReach').fill('20');};
  const name=()=>page.locator('#chanNewName').inputValue(),hint=()=>page.locator('#chanDestinationHint').textContent();
  const unique=s=>assert.equal(new Set(s.names).size,s.names.length,'nomes repetidos: '+s.names.join(' | '));

  await setup(0,'agua','axisDepth',1);
  assert.deepEqual(await page.locator('#chanMode option').evaluateAll(o=>o.map(x=>x.value)),['axisDepth','depth'],'massa de água só lista os métodos de preenchimento');
  await create();assert.match(await status(),/criada/i);
  let s=await summary();assert.equal(s.count,3);assert.deepEqual(s.pairs.map(p=>p.kind),['agua']);
  await setup(0,'calha','auto');
  assert.deepEqual(await page.locator('#chanMode option').evaluateAll(o=>o.map(x=>x.value)),['auto'],'calha só lista o método automático');
  assert.equal(await page.locator('#chanNameList option').count(),0,'a camada de massa d’água não é oferecida para a calha');
  assert.ok(!s.names.includes(await name()),'o nome sugerido para a primeira calha não repete nome existente');assert.match(await hint(),/Nome novo/);
  await create();assert.match(await status(),/^Calha criada/);
  s=await summary();assert.equal(s.count,5);unique(s);
  const calha=s.pairs.find(p=>p.kind==='calha'),agua=s.pairs.find(p=>p.kind==='agua');
  assert.deepEqual(calha.modes,['auto']);assert.deepEqual(agua.modes,['axisDepth']);
  pass('calha e massa d’água criam destinos separados, cada um com a sua dupla de camadas');

  await setup(1,'calha','auto');assert.equal(await name(),calha.name,'sem mudar o nome, a calha vai para a camada em uso');assert.match(await hint(),/Mesmo nome/);
  await create();assert.match(await status(),/adicionada/);
  await setup(1,'agua','axisDepth',1);assert.equal(await name(),agua.name);
  await create();assert.match(await status(),/adicionada/);
  await setup(0,'agua','depth',1.5);assert.equal(await name(),agua.name);
  await create();assert.match(await status(),/atualizada/);
  s=await summary();assert.equal(s.count,5);unique(s);
  assert.deepEqual(s.pairs.find(p=>p.kind==='calha').entries,[2,2]);assert.deepEqual(s.pairs.find(p=>p.kind==='agua').entries,[2,2]);
  assert.deepEqual(s.pairs.find(p=>p.kind==='calha').modes,['auto']);assert.deepEqual(s.pairs.find(p=>p.kind==='agua').modes,['axisDepth','depth']);
  pass('outro rio e a troca entre altura e profundidade entram nas camadas já usadas, sem criar camadas');

  await setup(0,'calha','auto');
  await page.locator('#chanNewName').fill('  '+calha.name.toUpperCase()+' ');assert.match(await hint(),/Mesmo nome/);await create();
  s=await summary();assert.equal(s.count,5,'repetir o nome da calha grava nela');unique(s);
  await page.locator('#chanNewName').fill('Rios sintéticos');assert.match(await hint(),/Já existe outra camada/);await create();
  assert.match(await status(),/Já existe uma camada/);assert.equal((await summary()).count,5);
  await page.locator('#chanNewName').fill('Calha Rio Azul');assert.match(await hint(),/Nome novo/);await create();
  s=await summary();assert.equal(s.count,7);unique(s);assert.ok(s.names.includes('Calha Rio Azul')&&s.names.includes('Seções — Calha Rio Azul'));
  assert.equal(await name(),'Calha Rio Azul','depois de criar, o destino passa a ser a nova camada');
  pass('camada nova só com outro nome: nome igual grava na existente e nome de outra camada é recusado');

  const blue=await page.evaluate(()=>{const p=GeoMineChannelDestination.pairs().find(p=>p.name==='Calha Rio Azul');deleteVectorLayer(p.ordered[0]);refreshUI();return p.id;});
  await setup(1,'calha','auto');assert.equal(await name(),'Calha Rio Azul');
  assert.match(await hint(),/recria/);
  await create();assert.match(await status(),/recriada/);
  s=await summary();assert.equal(s.count,7);unique(s);
  const restored=s.pairs.find(p=>p.id===blue);assert.equal(restored.complete,true);assert.deepEqual(restored.entries,[2,2]);
  await page.evaluate(()=>doUndo());s=await summary();assert.equal(s.count,6);assert.equal(s.pairs.find(p=>p.id===blue).restorable,true);
  pass('apagar as seções não força camada repetida: a geração recria só a ausente e um Ctrl+Z desfaz');

  await page.evaluate(()=>GeoMineChannelExtraction.open());
  const draw=async y=>{await page.locator('#chanDraw').click();await page.evaluate(y=>{
   const point=(x,y)=>{const w=toWGS(S.workCRS,x,y);map.fire('click',{latlng:L2.latLng(w[1],w[0]),originalEvent:{detail:1}});};
   point(500000,y);point(500040,y);GeoMineChannelExtraction.finishAxis();},y);};
  await draw(7400005);assert.match(await status(),/criado/);
  await draw(7400010);assert.match(await status(),/acrescentado/);
  const guides=await page.evaluate(()=>S.layers.filter(L=>L.name.startsWith('Eixo da calha MDT')).map(L=>({name:L.name,count:L.features.length,chosen:document.getElementById('chanLayer').value===String(L.id),selected:S.selFeat?.layer===L&&S.selFeat.idx===L.features.length-1})));
  assert.deepEqual(guides,[{name:'Eixo da calha MDT',count:2,chosen:true,selected:true}]);
  assert.equal(await page.locator('#chanScope').inputValue(),'feature','somente o eixo recém-desenhado é calculado');
  await page.evaluate(()=>doUndo());assert.equal(await page.evaluate(()=>S.layers.find(L=>L.name==='Eixo da calha MDT').features.length),1);
  pass('nova linha-guia entra na camada de eixos já existente e fica selecionada sozinha para o cálculo');

  assert.deepEqual(errors,[]);console.log('channel kind destination browser: '+passed+'/5 PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
