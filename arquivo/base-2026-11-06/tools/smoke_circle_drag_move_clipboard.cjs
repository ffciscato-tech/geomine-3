// Círculo desenhado arrastando (centro → raio) e por dois cliques, com o ímã
// prendendo o centro ao centro de outro círculo; Mover, Copiar e Colar no menu
// da feição; Ctrl+C / Ctrl+V. Navegador isolado, mouse real, dados sintéticos.
// PLAYWRIGHT_MODULE, CHROME_PATH e APP_PATH permitem rodar fora do macOS.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stage=path.resolve(__dirname,'..');let passed=0;
const pass=name=>{passed++;console.log('PASS '+name);};
const near=(a,b,t,msg)=>assert.ok(Math.abs(a-b)<=t,`${msg||''} ${a} != ${b} (±${t})`);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route(/^https?:/,r=>r.abort());
  await page.goto(pathToFileURL(path.resolve(process.env.APP_PATH||path.join(stage,'dist/GeoMine.html'))).href);
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineClipboard&&window.GeoMineDragMove);
  await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31983';S.projectId='circle-move-clipboard-synthetic';S.orthoOn=false;S.snapOn=true;S.snapCenterOn=true;
   window.__C=addLayer({name:'Círculos',gtype:'polygon',crs:'EPSG:31983',fields:[{name:'NOME',type:'C',length:20}],
    features:[{geom:[formaGeom('circulo',[313000,7683000],{R:10},0)],multi:true,props:{NOME:'referência'}}]});
   window.__Q=addLayer({name:'Quadras',gtype:'polygon',crs:'EPSG:31983',fields:[{name:'NOME',type:'C',length:20},{name:'FID',type:'N',length:9}],
    features:[{geom:[[[313060,7682990],[313080,7682990],[313080,7683010],[313060,7683010],[313060,7682990]]],multi:true,props:{NOME:'Q1',FID:0}}]});
   drawLayer(__C);drawLayer(__Q);S.activeId=__C.id;refreshUI();
   window.askDrawDest=(k,go)=>go();                  // destino: camada ativa, sem a pergunta
   const w=toWGS(S.workCRS,313040,7683000);map.setView([w[1],w[0]],19,{animate:false});
  });
  const px=(e,n)=>page.evaluate(([e,n])=>{const w=toWGS(S.workCRS,e,n),q=map.latLngToContainerPoint([w[1],w[0]]),rc=map.getContainer().getBoundingClientRect();return {x:rc.left+q.x,y:rc.top+q.y};},[e,n]);
  const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const circulos=()=>page.evaluate(()=>__C.features.map(f=>{const c=geomCirculo([f.geom[0]]);return c?{R:c.R,cx:c.cx,cy:c.cy}:null;}));
  const fechaForm=()=>page.evaluate(()=>{document.querySelectorAll('.modal-bg.on').forEach(m=>{if(m.querySelector('#fmOk,#fmDrag'))return;m.classList.remove('on');});});

  /* 1) arrastando: aperta perto do centro do círculo de referência e solta 15 m a leste */
  /* a política de pan da ferramenta Selecionar (no desktop o botão esquerdo não desliza o mapa) */
  const panSelect=await page.evaluate(()=>{setTool('select');return map.dragging.enabled();});
  await page.evaluate(()=>formaArma('circulo'));await page.click('#fmDrag');
  await page.evaluate(()=>map.dragging.enable());   // pan ligado ao apertar: precisa parar durante o raio
  let a=await px(313000.4,7683000.3),b=await px(313015,7683000);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:10});
  const durante=await page.evaluate(()=>({pan:map.dragging.enabled(),txt:document.getElementById('formaRaioTxt')?.textContent||''}));
  await page.mouse.up();await frames();await fechaForm();
  let cs=await circulos();assert.equal(cs.length,2,'um círculo novo');
  near(cs[1].cx,313000,1e-6,'centro preso ao centro');near(cs[1].cy,7683000,1e-6);near(cs[1].R,15,0.3,'raio (1 px ≈ 0,28 m)');
  assert.equal(durante.pan,false,'o mapa não desliza durante o raio');assert.match(durante.txt,/R = 1[45],\d\d m/);
  assert.equal(await page.evaluate(()=>map.dragging.enabled()),panSelect,'pan volta ao da ferramenta Selecionar');
  pass('círculo arrastando: centro no centro do outro círculo (ímã), raio 15 m, R ao lado do cursor');

  /* 2) dois cliques: centro livre e ponto do raio */
  await page.evaluate(()=>{S.activeId=__C.id;formaArma('circulo');});await page.click('#fmDrag');
  a=await px(312970,7683030);b=await px(312970,7683038);
  await page.mouse.click(a.x,a.y);await page.mouse.move(b.x,b.y,{steps:4});await page.mouse.click(b.x,b.y);await frames();await fechaForm();
  cs=await circulos();assert.equal(cs.length,3);near(cs[2].R,8,0.3,'raio por clique');
  pass('círculo por dois cliques: centro e ponto do raio');

  /* 3) Esc no meio cancela e devolve o pan */
  await page.evaluate(()=>{S.activeId=__C.id;formaArma('circulo');});await page.click('#fmDrag');
  await page.evaluate(()=>map.dragging.enable());
  a=await px(312950,7682970);await page.mouse.click(a.x,a.y);
  assert.equal(await page.evaluate(()=>map.dragging.enabled()),false,'centro marcado: mapa parado');
  await page.keyboard.press('Escape');await frames();
  assert.equal((await circulos()).length,3);
  assert.deepEqual(await page.evaluate(()=>({arrasto:!!FORMA.arrasto,tool:S.tool,pan:map.dragging.enabled()})),{arrasto:false,tool:'select',pan:panSelect});
  pass('Esc no meio do círculo cancela sem criar e devolve o pan');

  const menu=async(e,n)=>{await page.evaluate(()=>{closeFeatMenu();setTool('select');});const p=await px(e,n);await page.mouse.click(p.x,p.y);
   await page.waitForSelector('.feat-menu',{timeout:10000});return page.evaluate(()=>[...document.querySelectorAll('.feat-menu .fm-it')].map(x=>x.dataset.act));};
  const quadra=()=>page.evaluate(()=>__Q.features.map(f=>f.geom[0][0].slice(0,2)));

  /* 4) Mover pelo menu da feição */
  let acts=await menu(313070,7683000);assert.ok(acts.includes('mover')&&acts.includes('clipcopy'),JSON.stringify(acts));assert.ok(!acts.includes('clippaste'));
  await page.click('.feat-menu .fm-it[data-act="mover"]');
  a=await px(313070,7683000);b=await px(313070,7683020);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:10});await page.mouse.up();await frames();
  let q=await quadra();near(q[0][0],313060,0.2);near(q[0][1],7683010,0.3,'deslocou 20 m para o norte');
  pass('Mover aparece no menu da feição e move por arrasto');

  /* 5) Copiar e Colar pelo menu: a cópia nasce no lugar e o Mover já vem armado */
  await menu(313070,7683020);await page.click('.feat-menu .fm-it[data-act="clipcopy"]');
  acts=await menu(313070,7683020);assert.ok(acts.includes('clippaste'));
  await page.click('.feat-menu .fm-it[data-act="clippaste"]');
  assert.equal(await page.evaluate(()=>__Q.features.length),2);
  assert.equal(await page.evaluate(()=>GeoMineDragMove.state().armado),true,'Mover armado após colar');
  a=await px(313070,7683020);b=await px(313100,7683020);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:10});await page.mouse.up();await frames();
  q=await quadra();near(q[0][0],313060,0.2,'original intacto');near(q[1][0],313090,0.3,'cópia deslocada 30 m');
  assert.deepEqual(await page.evaluate(()=>__Q.features.map(f=>f.props)),[{NOME:'Q1',FID:0},{NOME:'Q1',FID:1}]);
  pass('Copiar e Colar pelo menu: atributos levados, FID novo, cópia posicionada arrastando');

  /* 6) Ctrl+C / Ctrl+V; Esc deixa no lugar; Ctrl+Z desfaz a colagem */
  await page.evaluate(()=>{closeFeatMenu();S.selFeat={layer:__Q,layerId:__Q.id,idx:0};S.activeId=__Q.id;});
  await page.mouse.click(5,5);                     // foco na página, fora de campos
  await page.evaluate(()=>{closeFeatMenu();S.selFeat={layer:__Q,layerId:__Q.id,idx:0};if(ED.on)edSelecionar({L:__Q,f:__Q.features[0],idx:0},true);});
  await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');
  assert.equal(await page.evaluate(()=>__Q.features.length),3);
  await page.keyboard.press('Escape');
  q=await quadra();assert.deepEqual(q[2],q[0],'Esc deixa a cópia no lugar');
  await page.evaluate(()=>doUndo());assert.equal(await page.evaluate(()=>__Q.features.length),2);
  pass('Ctrl+C / Ctrl+V colam; Esc deixa no lugar; Ctrl+Z desfaz a colagem');

  assert.deepEqual(errors,[]);
  console.log(`OK ${passed} cenários`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
