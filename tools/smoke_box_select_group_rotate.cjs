// Seta (Selecionar): arrastar no vazio desenha o retângulo de seleção — entram
// só as feições inteiras dentro, camadas com cadeado ficam fora, Shift soma.
// O conjunto se move arrastando uma das feições e gira pelo menu da feição
// ("Girar seleção": ângulo digitado e com o mouse), com um Ctrl+Z para tudo.
// Girar também numa feição avulsa. Navegador isolado, mouse real, sintético.
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
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineMouseRotation&&window.GeoMineDragMove);
  await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31983';S.projectId='box-select-synthetic';S.snapOn=false;S.orthoOn=false;
   const sq=(x,y,s)=>[[[x,y],[x+s,y],[x+s,y+s],[x,y+s],[x,y]]];
   window.__Ln=addLayer({name:'Linhas',gtype:'line',crs:'EPSG:31983',fields:[{name:'N',type:'C',length:5}],features:[
    {geom:[[313020,7683020],[313060,7683020]],props:{N:'L1'}},{geom:[[313020,7683040],[313060,7683060]],props:{N:'L2'}},
    {geom:[[313090,7683020],[313160,7683020]],props:{N:'L3'}}]});
   window.__Q=addLayer({name:'Quadras',gtype:'polygon',crs:'EPSG:31983',fields:[{name:'N',type:'C',length:5}],features:[
    {geom:sq(313070,7683030,15),multi:true,props:{N:'Q1'}},{geom:sq(313150,7683100,20),multi:true,props:{N:'Q2'}}]});
   window.__T=addLayer({name:'Travada',gtype:'line',crs:'EPSG:31983',fields:[],features:[{geom:[[313030,7683080],[313050,7683080]],props:{}}]});
   __T.locked=true;
   for(const L of [__Ln,__Q,__T])drawLayer(L);setTool('select');if(ED.on)edLigar(false,true);refreshUI();
   const a=toWGS(S.workCRS,312990,7682990),b=toWGS(S.workCRS,313200,7683140);map.fitBounds([[a[1],a[0]],[b[1],b[0]]],{animate:false});
   window.__px=(x,y)=>{const w=toWGS(S.workCRS,x,y),c=map.latLngToContainerPoint([w[1],w[0]]),r=map.getContainer().getBoundingClientRect();return {x:r.left+c.x,y:r.top+c.y};};
   window.__sel=()=>S.msel.items.map(i=>S.layers.find(l=>l.id===i.layerId).features[i.idx].props.N||'T').sort();
   window.__geo=()=>({L1:__Ln.features[0].geom.map(p=>p.slice(0,2)),L2:__Ln.features[1].geom.map(p=>p.slice(0,2)),L3:__Ln.features[2].geom.map(p=>p.slice(0,2)),
    Q1:__Q.features[0].geom[0].map(p=>p.slice(0,2)),Q2:__Q.features[1].geom[0].map(p=>p.slice(0,2)),T:__T.features[0].geom.map(p=>p.slice(0,2))});
  });
  const px=(x,y)=>page.evaluate(([x,y])=>__px(x,y),[x,y]);
  const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const arrasta=async(a,b,mods=[])=>{for(const m of mods)await page.keyboard.down(m);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:10});await page.mouse.up();
   for(const m of mods)await page.keyboard.up(m);await frames();await page.waitForTimeout(150);};
  const g0=await page.evaluate(()=>__geo());

  /* 1) retângulo no vazio: só o que está inteiro dentro; cadeado fora */
  await arrasta(await px(313010,7683090),await px(313120,7683010));
  assert.deepEqual(await page.evaluate(()=>__sel()),['L1','L2','Q1']);
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.feat-menu').length),0,'o click do arrasto não abre menu');
  pass('retângulo na seta: L1, L2 e Q1 inteiros dentro; L3 cruzando a borda fica fora; camada com cadeado ignorada');

  /* 2) Shift soma outro retângulo */
  const vista=()=>page.evaluate(()=>({z:map.getZoom(),c:map.getCenter()}));const v0=await vista();
  await arrasta(await px(313140,7683130),await px(313180,7683090),['Shift']);
  assert.deepEqual(await page.evaluate(()=>__sel()),['L1','L2','Q1','Q2']);
  assert.deepEqual(await vista(),v0,'Shift+arrasto não pode virar zoom por caixa');
  assert.equal(await page.evaluate(()=>map.boxZoom.enabled()),true,'zoom por caixa religado');
  pass('Shift + retângulo soma Q2 à seleção (sem o zoom por caixa do Leaflet)');

  /* 3) arrastar uma das selecionadas move o conjunto inteiro */
  await arrasta(await px(313040,7683020),await px(313050,7683020));
  let g=await page.evaluate(()=>__geo());
  const dx=g.L1[0][0]-g0.L1[0][0];near(dx,10,0.5,'deslocamento');
  for(const k of ['L2','Q1','Q2'])near(g[k][0][0]-g0[k][0][0],dx,1e-6,k);
  assert.deepEqual(g.L3,g0.L3);assert.deepEqual(g.T,g0.T);
  await page.evaluate(()=>doUndo());g=await page.evaluate(()=>__geo());assert.deepEqual(g.L1,g0.L1);assert.deepEqual(g.Q2,g0.Q2);
  pass('arrastar uma feição selecionada move as quatro; Ctrl+Z devolve');

  /* 4) clique numa selecionada mantém a seleção e o menu oferece "Girar seleção" */
  const m=await px(313030,7683045);await page.mouse.click(m.x,m.y);
  await page.waitForSelector('.feat-menu',{timeout:10000});
  const menu=await page.evaluate(()=>({acts:[...document.querySelectorAll('.feat-menu .fm-it')].map(x=>x.dataset.act+':'+x.textContent.trim().split('\n')[0]),sel:__sel()}));
  assert.deepEqual(menu.sel,['L1','L2','Q1','Q2'],'seleção mantida');assert.ok(menu.acts.some(a=>/^girar:.*Girar seleção/.test(a)),JSON.stringify(menu.acts));
  await page.click('.feat-menu .fm-it[data-act="girar"]');
  await page.waitForSelector('#edGirModal.on',{timeout:10000});
  assert.match(await page.locator('#edGirAtual').textContent(),/4 feições\/partes selecionadas/);
  await page.selectOption('#edGirModo','angulo');await page.fill('#edGirVal','90');await page.click('#edGirOk');
  g=await page.evaluate(()=>__geo());
  /* centro do conjunto = centro do retângulo envolvente de L1, L2, Q1, Q2 */
  const xs=[...g0.L1,...g0.L2,...g0.Q1,...g0.Q2].map(p=>p[0]),ys=[...g0.L1,...g0.L2,...g0.Q1,...g0.Q2].map(p=>p[1]);
  const c=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2],rot=p=>[c[0]-(p[1]-c[1]),c[1]+(p[0]-c[0])];
  for(const k of ['L1','L2','Q1','Q2'])for(let i=0;i<g[k].length;i++){const e=rot(g0[k][i]);near(g[k][i][0],e[0],1e-6,k);near(g[k][i][1],e[1],1e-6,k);}
  assert.deepEqual(g.L3,g0.L3);assert.deepEqual(g.T,g0.T);
  await page.evaluate(()=>doUndo());g=await page.evaluate(()=>__geo());for(const k of ['L1','L2','Q1','Q2'])assert.deepEqual(g[k],g0[k],k);
  pass('menu na feição selecionada: "Girar seleção" gira as quatro 90° em torno do centro do conjunto; um Ctrl+Z desfaz');

  /* 5) girar o conjunto com o mouse */
  await page.evaluate(()=>GeoMineMouseRotation.start({pivot:'centroid'}));
  assert.equal(await page.evaluate(()=>GeoMineMouseRotation.state()?.grupo),4);
  const q=await px(c[0]+10,c[1]+10);await page.mouse.move(q.x,q.y,{steps:4});await frames();await page.mouse.click(q.x,q.y);await frames();
  g=await page.evaluate(()=>__geo());
  for(const k of ['L1','L2','Q1','Q2'])assert.notDeepEqual(g[k],g0[k],k+' girou');
  near(Math.hypot(g.L1[1][0]-g.L1[0][0],g.L1[1][1]-g.L1[0][1]),40,1e-6,'giro rígido');
  assert.deepEqual(g.L3,g0.L3);assert.deepEqual(g.T,g0.T);
  await page.evaluate(()=>doUndo());
  await page.waitForTimeout(450);   // o clique que confirma o giro engole cliques por 400 ms
  pass('Girar com o mouse gira o conjunto inteiro (as quatro feições juntas)');

  /* 6) feição avulsa: menu → Girar só nela */
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');await page.evaluate(()=>{mselClear(true);closeFeatMenu();});
  const l3=await px(313125,7683020);await page.mouse.click(l3.x,l3.y);await page.waitForSelector('.feat-menu');
  await page.click('.feat-menu .fm-it[data-act="girar"]');await page.waitForSelector('#edGirModal.on');
  await page.selectOption('#edGirModo','angulo');await page.fill('#edGirVal','90');await page.click('#edGirOk');
  g=await page.evaluate(()=>__geo());
  near(g.L3[0][0],313125,1e-6);near(g.L3[0][1],7683020-35,1e-6);near(g.L3[1][1],7683020+35,1e-6);
  assert.deepEqual(g.L1,g0.L1);
  pass('menu numa feição avulsa: Girar 90° só nela, em torno do centro dela');
  await page.evaluate(()=>{doUndo();closeFeatMenu();mselClear(true);});
  assert.deepEqual((await page.evaluate(()=>__geo())).L3,g0.L3);

  /* 7) como no AutoCAD: da direita para a esquerda é CRUZANDO (verde, tracejado) — entra o que toca */
  const meio=async(a,b)=>{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move((a.x+b.x)/2,(a.y+b.y)/2,{steps:6});
   const sk=await page.evaluate(()=>(S.msel.sk?S.msel.sk.getLayers():[]).map(l=>({c:l.options.color,d:l.options.dashArray||null})).filter(o=>o.c!=='#03202a'));
   await page.mouse.move(b.x,b.y,{steps:4});await page.mouse.up();await frames();await page.waitForTimeout(150);return sk;};
  let sk=await meio(await px(313120,7683010),await px(313010,7683090));
  assert.deepEqual(sk,[{c:'#22c55e',d:'6 4'}],'cruzando: verde tracejado');
  assert.deepEqual(await page.evaluate(()=>__sel()),['L1','L2','L3','Q1'],'cruzando pega L3, que cruza a borda; cadeado fora');
  await page.evaluate(()=>mselClear(true));
  sk=await meio(await px(313010,7683090),await px(313120,7683010));
  assert.deepEqual(sk,[{c:'#3b82f6',d:null}],'janela: azul, contorno cheio');
  assert.deepEqual(await page.evaluate(()=>__sel()),['L1','L2','Q1']);
  pass('direita→esquerda = cruzando (verde tracejado, pega o que toca); esquerda→direita = janela (azul, só o inteiro)');

  /* 8) começar o arrasto EM CIMA de uma feição não selecionada também desenha o retângulo */
  await page.evaluate(()=>mselClear(true));
  await meio(await px(313040,7683050),await px(313010,7683010));
  assert.deepEqual(await page.evaluate(()=>__sel()),['L1','L2']);
  assert.equal(await page.evaluate(()=>document.querySelectorAll('.feat-menu').length),0);
  pass('arrasto que começa em cima de uma linha não selecionada também vira retângulo');

  /* 9) depois de arrastar um vértice no editor, o arrasto no vazio continua sendo o retângulo (o mapa não anda) */
  await page.evaluate(()=>{mselClear(true);edLigar(true,true);edSelecionar({L:__Q,idx:0,f:__Q.features[0]},true);});await frames();
  const v1=await px(313085,7683045),v2=await px(313087,7683047);
  await page.mouse.move(v1.x,v1.y);await page.mouse.down();await page.mouse.move(v2.x,v2.y,{steps:5});await page.mouse.up();await frames();await page.waitForTimeout(800);
  assert.notDeepEqual((await page.evaluate(()=>__geo())).Q1,g0.Q1,'o vértice foi arrastado');
  assert.equal(await page.evaluate(()=>map.dragging.enabled()),false,'no desktop o arraste do mapa continua desligado');
  const c0=await page.evaluate(()=>map.getCenter());
  await meio(await px(313010,7683090),await px(313120,7683010));
  assert.deepEqual(await page.evaluate(()=>map.getCenter()),c0,'o mapa não pode andar');
  assert.deepEqual(await page.evaluate(()=>__sel()),['L1','L2','Q1']);
  await page.evaluate(()=>edLigar(false,true));
  assert.equal(await page.evaluate(()=>map.dragging.enabled()),false,'desligar o editor não religa o pan no desktop');
  pass('depois de editar vértice (e de desligar o editor) o arrasto ainda desenha o retângulo, sem mover o mapa');

  assert.deepEqual(errors,[]);
  console.log(`OK ${passed} cenários`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
