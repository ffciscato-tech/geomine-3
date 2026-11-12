// Copiar feições para outra camada: clique direito, menu da feição e seleção
// múltipla. Navegador isolado e dados sintéticos; nenhum projeto é aberto.
// PLAYWRIGHT_MODULE, CHROME_PATH e APP_PATH permitem rodar fora do macOS.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stage=path.resolve(__dirname,'..');let passed=0;
const pass=name=>{passed++;console.log('PASS '+name);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route(/^https?:/,r=>r.abort());
  await page.goto(pathToFileURL(path.resolve(process.env.APP_PATH||path.join(stage,'dist/GeoMine.html'))).href);
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineFeatureCopy);
  await page.evaluate(()=>{
   S.setBase('Sem fundo');S.projectId='feature-copy-synthetic';S.workCRS='EPSG:31982';
   window.__src=addLayer({name:'Rios origem',gtype:'line',crs:'EPSG:31982',fields:[{name:'NOME',type:'C',size:60},{name:'CODIGO',type:'N',size:10}],
    features:[{geom:[[500000,7400000],[500200,7400000]],props:{NOME:'Rio A',CODIGO:11}},{geom:[[500000,7400100],[500200,7400100]],props:{NOME:'Rio B',CODIGO:12}}]});
   window.__dst=addLayer({name:'Rios destino',gtype:'line',crs:'EPSG:31983',fields:[{name:'nome',type:'C',size:60},{name:'FID',type:'N',size:10}],
    features:[{geom:[[-153000,7400000],[-152900,7400000]],props:{nome:'Existente',FID:0}}]});
   window.__area=addLayer({name:'Áreas',gtype:'polygon',crs:'EPSG:31982',fields:[{name:'USO',type:'C',size:30}],
    features:[{geom:[[[500000,7399700],[500200,7399700],[500200,7399900],[500000,7399900],[500000,7399700]]],multi:true,props:{USO:'Pasto'}}]});
   for(const L of [__src,__dst,__area])drawLayer(L);refreshUI();
   window.__before=JSON.stringify(__src.features);
   window.__px=(x,y,crs='EPSG:31982')=>{const w=toWGS(crs,x,y),p=map.latLngToContainerPoint([w[1],w[0]]),r=map.getContainer().getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};};
   const a=toWGS(S.workCRS,499950,7399650),b=toWGS(S.workCRS,500250,7400150);map.fitBounds([[a[1],a[0]],[b[1],b[0]]],{animate:false});
  });
  const right=async(x,y)=>{const p=await page.evaluate(([x,y])=>__px(x,y),[x,y]);await page.mouse.click(p.x,p.y,{button:'right'});};
  const status=()=>page.locator('#fcopyStatus').textContent();

  await right(500100,7400000);
  await page.waitForSelector('.feat-menu');
  assert.match(await page.locator('.feat-menu').textContent(),/Rios origem/);
  await page.locator('.feat-menu [data-act="copy"]').click();
  await page.waitForSelector('#fcopyModal.on');
  assert.match(await page.locator('#fcopySummary').textContent(),/1 feição de “Rios origem” \(linhas\)/);
  assert.deepEqual(await page.locator('#fcopyTarget option').allTextContents(),['Rios destino','Nova camada…'],'só camadas do mesmo tipo, sem a origem');
  assert.match(await page.locator('#fcopyFieldsHint').textContent(),/nome.*CODIGO/s);
  await page.locator('#fcopyFields').check();await page.locator('#fcopyCommit').click();
  const copied=await page.evaluate(()=>{const f=__dst.features.at(-1),expected=proj4('EPSG:31982','EPSG:31983').forward([500000,7400000]);
   return {count:__dst.features.length,props:f.props,fields:__dst.fields.map(x=>x.name),dx:Math.abs(f.geom[0][0]-expected[0]),dy:Math.abs(f.geom[0][1]-expected[1]),
    source:JSON.stringify(__src.features)===__before,shared:f.geom===__src.features[0].geom,active:S.activeId===__dst.id,selected:S.selFeat?.layer===__dst&&S.selFeat.idx===1,open:document.getElementById('fcopyModal').classList.contains('on')};});
  assert.equal(copied.count,2);assert.deepEqual(copied.props,{nome:'Rio A',FID:1,CODIGO:11});assert.deepEqual(copied.fields,['nome','FID','CODIGO'],'só o campo que faltava é criado');
  assert.ok(copied.dx<1e-6&&copied.dy<1e-6,'a cópia é reprojetada para o CRS do destino');
  assert.deepEqual({source:copied.source,shared:copied.shared,active:copied.active,selected:copied.selected,open:copied.open},{source:true,shared:false,active:true,selected:true,open:false});
  await page.evaluate(()=>doUndo());
  assert.deepEqual(await page.evaluate(()=>({count:__dst.features.length,fields:__dst.fields.map(x=>x.name),source:JSON.stringify(__src.features)===__before})),{count:1,fields:['nome','FID'],source:true});
  pass('clique direito na linha abre o menu; a cópia vai reprojetada para a camada existente, com atributos pelo nome e Ctrl+Z');

  await right(500100,7399800);
  await page.waitForSelector('.feat-menu');assert.match(await page.locator('.feat-menu').textContent(),/Áreas/);
  await page.locator('.feat-menu [data-act="copy"]').click();await page.waitForSelector('#fcopyModal.on');
  assert.equal(await page.locator('#fcopyTarget').inputValue(),'new','sem outra camada de polígonos, a opção é criar uma');
  assert.equal(await page.locator('#fcopyName').inputValue(),'Áreas — cópia');
  await page.locator('#fcopyName').fill('rios DESTINO');await page.locator('#fcopyCommit').click();
  assert.match(await status(),/Já existe uma camada/);assert.equal(await page.evaluate(()=>S.layers.length),3);
  await page.locator('#fcopyName').fill('Áreas — APP');await page.locator('#fcopyCommit').click();
  const fresh=await page.evaluate(()=>{const L=S.layers.find(l=>l.name==='Áreas — APP');return L&&{count:L.features.length,props:L.features[0].props,gtype:L.gtype,crs:L.crs,geom:JSON.stringify(L.features[0].geom)===JSON.stringify(__area.features[0].geom)};});
  assert.deepEqual(fresh,{count:1,props:{USO:'Pasto'},gtype:'polygon',crs:'EPSG:31982',geom:true});
  await page.evaluate(()=>doUndo());assert.equal(await page.evaluate(()=>S.layers.some(l=>l.name==='Áreas — APP')),false);
  pass('clique direito no interior do polígono; nova camada exige nome livre e o Ctrl+Z remove a camada criada');

  await page.evaluate(()=>{S.msel.items=[{layerId:__src.id,idx:0},{layerId:__src.id,idx:1}];document.getElementById('selCopy').click();});
  await page.waitForSelector('#fcopyModal.on');assert.match(await page.locator('#fcopySummary').textContent(),/2 feições/);
  await page.locator('#fcopyTarget').selectOption({label:'Rios destino'});await page.locator('#fcopyCommit').click();
  const many=await page.evaluate(()=>({count:__dst.features.length,names:__dst.features.map(f=>f.props.nome),fields:__dst.fields.map(x=>x.name),sel:S.msel.items.map(i=>i.layerId===__dst.id?i.idx:-1)}));
  assert.deepEqual(many,{count:3,names:['Existente','Rio A','Rio B'],fields:['nome','FID'],sel:[1,2]});
  await page.evaluate(()=>doUndo());assert.equal(await page.evaluate(()=>__dst.features.length),1);
  await page.evaluate(()=>{S.msel.items=[{layerId:__src.id,idx:0},{layerId:__area.id,idx:0}];document.getElementById('selCopy').click();});
  assert.equal(await page.locator('#fcopyModal.on').count(),0,'tipos misturados não abrem a cópia');
  pass('seleção múltipla copia tudo de uma vez, mantém as cópias selecionadas e recusa tipos misturados');

  await page.evaluate(()=>{S.msel.items=[];closeFeatMenu();S.drawBuf=[[1,2]];});await right(500100,7400000);
  assert.equal(await page.locator('.feat-menu').count(),0,'durante um desenho o clique direito só seleciona');
  await page.evaluate(()=>{S.drawBuf=[];});
  await page.evaluate(()=>closeFeatMenu());await right(500100,7400100);await page.waitForSelector('.feat-menu');
  await page.locator('.feat-menu [data-act="attr"]').click();assert.equal(await page.locator('.feat-menu').count(),0);
  // Polígonos sobrepostos: vence o que está mais acima na árvore de camadas.
  await page.evaluate(()=>{closeFeatMenu();document.getElementById('attrPanel')?.classList.remove('open');
   window.__over=addLayer({name:'Sobreposta',gtype:'polygon',crs:'EPSG:31982',fields:[],features:[{geom:[[[500050,7399750],[500150,7399750],[500150,7399850],[500050,7399850],[500050,7399750]]],multi:true,props:{}}]});drawLayer(__over);refreshUI();});
  await right(500100,7399800);await page.waitForSelector('.feat-menu');assert.match(await page.locator('.feat-menu').textContent(),/Sobreposta/);
  await page.evaluate(()=>{closeFeatMenu();S.stack=S.stack.filter(k=>k!=='L:'+__over.id).concat('L:'+__over.id);zApply();refreshUI();});
  await right(500100,7399800);await page.waitForSelector('.feat-menu');assert.match(await page.locator('.feat-menu').textContent(),/Áreas/);
  pass('menu do clique esquerdo/direito mantém as ações existentes; desenho em curso não é coberto; polígono de cima vence');

  await page.evaluate(()=>{closeFeatMenu();document.getElementById('attrPanel')?.classList.remove('open');});
  await right(500100,7400100);await page.waitForSelector('.feat-menu');
  await page.locator('.feat-menu [data-act="move"]').click();await page.waitForSelector('#fcopyModal.on');
  assert.equal(await page.locator('#fcopyTitle').textContent(),'Mover para outra camada');assert.equal(await page.locator('#fcopyCommit').textContent(),'Mover');
  assert.match(await page.locator('#fcopySummary').textContent(),/saem da origem/);
  await page.locator('#fcopyTarget').selectOption({label:'Rios destino'});await page.locator('#fcopyCommit').click();
  const moved=await page.evaluate(()=>({src:__src.features.map(f=>f.props.NOME),dst:__dst.features.map(f=>f.props.nome),sel:S.selFeat?.layer===__dst&&S.selFeat.idx===1}));
  assert.deepEqual(moved,{src:['Rio A'],dst:['Existente','Rio B'],sel:true});
  await page.evaluate(()=>doUndo());
  assert.deepEqual(await page.evaluate(()=>({same:JSON.stringify(__src.features)===__before,dst:__dst.features.length})),{same:true,dst:1},'Ctrl+Z devolve a feição à mesma posição da origem');
  await page.evaluate(()=>{window.__multi=addLayer({name:'Multi',gtype:'line',crs:'EPSG:31982',fields:[{name:'ID',type:'N'}],features:[{geom:[[[500000,7400050],[500050,7400050]],[[500100,7400050],[500150,7400050]]],multi:true,props:{ID:7}}]});
   drawLayer(__multi);window.__multiBefore=JSON.stringify(__multi.features);S.msel.items=[{layerId:__multi.id,idx:0,partIdx:1}];document.getElementById('selMove').click();});
  await page.waitForSelector('#fcopyModal.on');await page.locator('#fcopyTarget').selectOption('new');
  assert.equal(await page.locator('#fcopyName').inputValue(),'Multi — movidas');await page.locator('#fcopyCommit').click();
  const part=await page.evaluate(()=>{const N=S.layers.find(l=>l.name==='Multi — movidas');return {left:__multi.features.map(f=>f.geom.length),moved:N&&N.features.map(f=>JSON.stringify(f.geom)),props:N&&N.features[0].props};});
  assert.deepEqual(part,{left:[1],moved:[JSON.stringify([[[500100,7400050],[500150,7400050]]])],props:{ID:7}});
  await page.evaluate(()=>doUndo());
  assert.deepEqual(await page.evaluate(()=>({same:JSON.stringify(__multi.features)===__multiBefore,gone:!S.layers.some(l=>l.name==='Multi — movidas')})),{same:true,gone:true});
  await page.evaluate(()=>{window.__linked=addLayer({name:'Calha gerada',gtype:'line',crs:'EPSG:31982',fields:[],features:[{geom:[[500000,7400200],[500100,7400200]],props:{}}]});
   __linked._channelLink={version:2,id:'qa',role:'sections',entries:[]};GeoMineFeatureCopy.move([{layerId:__linked.id,idx:0}]);});
  assert.equal(await page.locator('#fcopyModal.on').count(),0,'resultado vinculado da calha não pode ser movido');
  assert.match(await page.locator('#toast').textContent(),/use Copiar/);
  await page.evaluate(()=>{__src.locked=true;GeoMineFeatureCopy.move([{layerId:__src.id,idx:0}]);});
  assert.equal(await page.locator('#fcopyModal.on').count(),0,'origem bloqueada não pode ser alterada');
  await page.evaluate(()=>{__src.locked=false;});
  pass('mover leva a feição ou só a parte selecionada, retira da origem e um Ctrl+Z devolve tudo; origem bloqueada ou vinculada é recusada');

  assert.deepEqual(errors,[]);console.log('feature copy browser: '+passed+'/5 PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
