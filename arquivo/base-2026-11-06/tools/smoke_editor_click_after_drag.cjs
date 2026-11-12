// Editor vetorial (Selecionar): o clique que o navegador dispara ao soltar um
// arrasto de vértice, de "+" do meio ou de aresta não pode abrir o menu da
// feição nem trocar a seleção — o menu ficava sobre os vértices e o próximo
// arrasto pegava o menu. Soltura DENTRO do polígono, onde o clique acertava a
// feição. Navegador isolado e dados sintéticos.
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
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMinePolygonEdgeDrag);
  const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const setup=()=>page.evaluate(()=>{
   closeFeatMenu();window.GeoMinePolygonEdgeDrag.clear();setTool('select');edLigar(false,true);clearVertices();
   for(const l of (S.layers||[]))if(l.llayer)try{map.removeLayer(l.llayer);}catch(_){}
   S.layers=[];S.stack=[];S.selFeat=null;S.activeId=null;ED.sel=null;ED.drag=null;ED.pend=null;
   S.setBase('Sem fundo');S.touch=false;S.snapOn=false;S.orthoOn=false;S.workCRS='EPSG:31982';S.projectId='qa-click-'+Math.random();
   const ring=[[0,0],[200,0],[200,140],[0,140],[0,0]].map(p=>[p[0]+500000,p[1]+7400000]);
   /* uma segunda feição embaixo: o clique de soltar não pode selecioná-la */
   window.__fundo=addLayer({name:'Fundo',gtype:'polygon',crs:S.workCRS,fields:[],features:[{multi:true,geom:[[[499900,7399900],[500300,7399900],[500300,7400240],[499900,7400240],[499900,7399900]]],props:{}}]});
   window.__L=addLayer({name:'Editada',gtype:'polygon',crs:S.workCRS,fields:[],features:[{multi:true,geom:[ring],props:{}}]});
   window.__f=__L.features[0];S.activeId=__L.id;S.selFeat={layer:__L,layerId:__L.id,idx:0,partIdx:0};
   edLigar(true,true);edSelecionar({L:__L,f:__f,idx:0},true);setTool('select');
   const q=toWGS(S.workCRS,500100,7400070);map.setView([q[1],q[0]],18,{animate:false});edRedraw();S.undo=[];
  });
  const scr=p=>page.evaluate(p=>{const rc=map.getContainer().getBoundingClientRect(),w=toWGS(__L.crs,p[0],p[1]),q=map.latLngToContainerPoint([w[1],w[0]]);return {x:rc.left+q.x,y:rc.top+q.y};},p);
  const ring=()=>page.evaluate(()=>__f.geom[0].map(p=>p.slice(0,2)));
  const drag=async(a,b)=>{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();await frames();await page.waitForTimeout(250);};
  const estado=()=>page.evaluate(()=>({menu:!!document.querySelector('.feat-menu'),sel:ED.sel?.f===__f&&S.selFeat?.layer===__L}));
  await setup();await frames();

  let r0=await ring();await drag(await scr([500200,7400140]),await scr([500180,7400120]));
  let s=await estado();assert.notDeepEqual(await ring(),r0);assert.equal(s.menu,false,'menu aberto após arrastar vértice');assert.equal(s.sel,true);
  pass('vértice solto dentro do polígono: sem menu, seleção mantida');

  r0=await ring();await drag(await scr([500100,7400000]),await scr([500100,7400025]));
  s=await estado();assert.equal((await ring()).length,r0.length+1,'o "+" do meio insere um vértice');assert.equal(s.menu,false,'menu aberto após arrastar o "+"');assert.equal(s.sel,true);
  pass('"+" do meio arrastado para dentro: sem menu, seleção mantida');

  r0=await ring();await drag(await scr([500000,7400035]),await scr([500020,7400035]));
  s=await estado();assert.notDeepEqual(await ring(),r0);assert.equal(s.menu,false,'menu aberto após arrastar aresta');assert.equal(s.sel,true);
  pass('aresta arrastada para dentro: sem menu, seleção mantida');

  r0=await ring();await drag(await scr(r0[3]),await scr([r0[3][0]+15,r0[3][1]-15]));
  assert.notDeepEqual(await ring(),r0);assert.equal((await estado()).menu,false);
  pass('vértice seguinte continua arrastável');

  /* fora dos gestos, o clique comum continua selecionando outra feição */
  await page.waitForTimeout(800);
  const c=await scr([500260,7400210]);await page.mouse.click(c.x,c.y);await frames();await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>S.selFeat?.layer===__fundo||ED.sel?.L===__fundo),true,'clique comum deve selecionar a feição de fundo');
  pass('clique simples em outra feição continua selecionando');

  assert.deepEqual(errors,[]);
  console.log(`OK ${passed} cenários`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
