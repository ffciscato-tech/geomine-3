// Cotas dinâmicas e guias de alinhamento no arrasto de vértice. Retângulo
// girado 12° (5 × 3 m) com duas cotas criadas por cliques reais encaixados nos
// vértices; guias nos dois editores; cotas acompanham vértice arrastado, alça ✥
// do centro, desfazer, vértice inserido antes do canto, gravar e reabrir; com o
// ímã desligado a guia aparece mas não encaixa. Navegador isolado, mouse real.
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
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineDimensions&&window.GeoMineVertexGuides);
  await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31983';S.projectId='dims-guides-synthetic';S.snapOn=true;S.orthoOn=false;
   const C=[313000,7683000],ANG=12,a=ANG*Math.PI/180;
   window.__G=p=>[C[0]+p[0]*Math.cos(a)-p[1]*Math.sin(a),C[1]+p[0]*Math.sin(a)+p[1]*Math.cos(a)];          // local → CRS
   window.__Lc=q=>{const x=q[0]-C[0],y=q[1]-C[1];return [x*Math.cos(a)+y*Math.sin(a),-x*Math.sin(a)+y*Math.cos(a)];}; // CRS → local
   window.__R=addLayer({name:'Retângulo',gtype:'polygon',crs:'EPSG:31983',fields:[],features:[{geom:[formaGeom('retangulo',C,{C:5,L:3},ANG)],multi:true,props:{}}]});
   window.__f=__R.features[0];S.activeId=__R.id;drawLayer(__R);refreshUI();
   const p=__G([-4,-4]),q=__G([4,4.5]),w1=toWGS(S.workCRS,...p),w2=toWGS(S.workCRS,...q);map.fitBounds([[w1[1],w1[0]],[w2[1],w2[0]]],{animate:false});
   window.__px=(lx,ly)=>{const g=__G([lx,ly]),w=toWGS(S.workCRS,g[0],g[1]),c=map.latLngToContainerPoint([w[1],w[0]]),r=map.getContainer().getBoundingClientRect();return {x:r.left+c.x,y:r.top+c.y};};
   window.__ring=()=>__f.geom[0].map(p=>__Lc(p).map(v=>Math.round(v*1e6)/1e6));
  });
  const px=(x,y)=>page.evaluate(([x,y])=>__px(x,y),[x,y]);
  const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const cotas=()=>page.evaluate(()=>{const D=S.layers.find(l=>GeoMineDimensions.isLayer(l));return D?D.features.map(x=>{const p=x.props,A=[+p.A_X,+p.A_Y],B=[+p.B_X,+p.B_Y],P=[+p.POS_X,+p.POS_Y];
    const d=Math.hypot(B[0]-A[0],B[1]-A[1]),off=((P[0]-A[0])*-(B[1]-A[1])+(P[1]-A[1])*(B[0]-A[0]))/d;return {A:__Lc(A),B:__Lc(B),texto:p.TEXTO,dist:d,off,link:!!x._dimLink};}):[];});
  const arrasta=async(a,b,durante)=>{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move((a.x+b.x)/2,(a.y+b.y)/2,{steps:5});await page.mouse.move(b.x,b.y,{steps:8});
   const d=durante?await durante():null;await page.mouse.up();await frames();await page.waitForTimeout(150);return d;};

  /* 0) duas cotas por cliques reais, pontas encaixadas nos vértices */
  await page.evaluate(()=>GeoMineDimensions.start({mode:'aligned',unit:'m',decimals:2,height:0.4,snap:true}));
  for(const [ax,ay,bx,by,cx,cy] of [[-2.5,-1.5,2.5,-1.5,0,-2.5],[2.5,-1.5,2.5,1.5,3.5,0]]){
   for(const [x,y] of [[ax,ay],[bx,by],[cx,cy]]){const p=await px(x,y);await page.mouse.move(p.x,p.y);await frames();await page.mouse.click(p.x,p.y);await frames();}
  }
  await page.keyboard.press('Escape');await frames();
  let cs=await cotas();assert.equal(cs.length,2);assert.ok(cs.every(c=>c.link),'cotas presas aos vértices');
  assert.deepEqual(cs.map(c=>c.texto),['5,00 m','3,00 m']);
  const off0=cs.map(c=>c.off);
  pass('cotas criadas com as pontas presas aos vértices do retângulo girado');

  /* 1) guias no Editar vértices: P3 arrastado rente à reta P0–P3 prolongada */
  await page.evaluate(()=>{setTool('select');S.selFeat={layer:__R,layerId:__R.id,idx:0};setTool('vertex');showVertices();});await frames();
  const durante=()=>page.evaluate(()=>({ativo:GeoMineVertexGuides.active(),n:GeoMineVertexGuides.guides().length,txt:document.querySelector('.gm-vguide-txt')?.textContent||''}));
  let d=await arrasta(await px(-2.5,1.5),await px(-2.53,3.0),durante);
  let r=await page.evaluate(()=>__ring());near(r[3][0],-2.5,1e-5,'P3 na guia');near(r[3][1],3.0,0.05);
  assert.equal(d.ativo,true);assert.ok(d.n>=2);assert.match(d.txt,/paralela/);
  assert.equal(await page.evaluate(()=>GeoMineVertexGuides.active()),false,'guias somem ao soltar');
  pass('Editar vértices: guias aparecem no arrasto e o vértice encaixa na paralela (aresta P0–P3 segue paralela)');

  /* 2) guias no editor (Selecionar): P2 rente à reta P1–P2 prolongada; a cota de P1–P2 acompanha */
  await page.evaluate(()=>{clearVertices();setTool('select');edLigar(true,true);edSelecionar({L:__R,f:__f,idx:0},true);});await frames();
  d=await arrasta(await px(2.5,1.5),await px(2.52,2.4),durante);
  r=await page.evaluate(()=>__ring());near(r[2][0],2.5,1e-5,'P2 na guia');
  cs=await cotas();near(cs[1].B[0],r[2][0],1e-6);near(cs[1].B[1],r[2][1],1e-6);
  assert.equal(cs[1].texto,(r[2][1]+1.5).toFixed(2).replace('.',',')+' m');near(cs[1].off,off0[1],1e-6,'afastamento da cota mantido');
  assert.equal(d.ativo,true);
  pass('editor Selecionar: vértice na guia e a cota da aresta acompanha, com o mesmo afastamento');

  /* 3) cota dinâmica no Editar vértices: P1 (comum às duas cotas) solto num ponto livre */
  await page.evaluate(()=>{edLigar(false,true);S.selFeat={layer:__R,layerId:__R.id,idx:0};setTool('vertex');showVertices();});await frames();
  await arrasta(await px(2.5,-1.5),await px(3.3,-2.2));
  r=await page.evaluate(()=>__ring());cs=await cotas();
  near(cs[0].B[0],r[1][0],1e-6);near(cs[0].B[1],r[1][1],1e-6);near(cs[1].A[0],r[1][0],1e-6);near(cs[1].A[1],r[1][1],1e-6);
  near(cs[0].off,off0[0],1e-6);near(cs[1].off,off0[1],1e-6);
  assert.equal(cs[0].texto,Math.hypot(r[1][0]-r[0][0],r[1][1]-r[0][1]).toFixed(2).replace('.',',')+' m');
  pass('as duas cotas do canto arrastado acompanham, com o texto refeito');

  /* 4) alça ✥ do centro move a figura e as cotas juntas; desfazer volta tudo */
  const antes=await cotas(),alca=await page.evaluate(()=>{const e=document.querySelector('.vtx-mover').closest('.leaflet-marker-icon').getBoundingClientRect();return {x:e.left+e.width/2,y:e.top+e.height/2};});
  const um=await page.evaluate(()=>{const a=__px(0,0),b=__px(1.5,0.5);return {x:b.x-a.x,y:b.y-a.y};});
  await arrasta(alca,{x:alca.x+um.x,y:alca.y+um.y});
  cs=await cotas();
  const dA=[cs[0].A[0]-antes[0].A[0],cs[0].A[1]-antes[0].A[1]];
  assert.ok(Math.hypot(...dA)>1,'a cota andou com a figura');
  for(const k of [0,1]){near(cs[k].A[0]-antes[k].A[0],dA[0],1e-6);near(cs[k].B[1]-antes[k].B[1],dA[1],1e-6);assert.equal(cs[k].texto,antes[k].texto);}
  await page.evaluate(()=>doUndo());await frames();
  cs=await cotas();for(const k of [0,1]){near(cs[k].A[0],antes[k].A[0],1e-6);near(cs[k].B[1],antes[k].B[1],1e-6);}
  pass('alça ✥ do centro arrasta a figura com as cotas; Ctrl+Z devolve as duas');

  /* 5) vértice inserido antes do canto cotado: a cota segue o canto, não o índice */
  await page.evaluate(()=>{clearVertices();setTool('select');const g=__f.geom[0];g.splice(1,0,[(g[0][0]+g[1][0])/2,(g[0][1]+g[1][1])/2]);drawLayer(__R);});
  r=await page.evaluate(()=>__ring());cs=await cotas();near(cs[0].B[0],r[2][0],1e-6);near(cs[0].B[1],r[2][1],1e-6);
  pass('vértice inserido antes do canto: a cota continua no mesmo canto');

  /* 6) gravar e reabrir: o vínculo vai junto e a cota continua dinâmica */
  const rt=await page.evaluate(()=>{const d=JSON.parse(JSON.stringify(projectData()));loadProject(d);
   window.__R=S.layers.find(l=>l.name==='Retângulo');window.__f=__R.features[0];const D=S.layers.find(l=>GeoMineDimensions.isLayer(l));
   const links=D.features.map(x=>!!x._dimLink),gid=!!__f._gid;
   const g=__f.geom[0];g[0]=[g[0][0]-1,g[0][1]-1];g[g.length-1]=g[0].slice();drawLayer(__R);
   const p=D.features[0].props;return {links,gid,a:[+p.A_X,+p.A_Y],v:g[0].slice(0,2)};});
  assert.deepEqual(rt.links,[true,true]);assert.equal(rt.gid,true);near(rt.a[0],rt.v[0],1e-6);near(rt.a[1],rt.v[1],1e-6);
  pass('gravar e reabrir mantém o vínculo; a cota segue dinâmica');

  /* 7) ímã desligado: guia aparece, mas não encaixa */
  await page.evaluate(()=>{S.snapOn=false;S.selFeat={layer:__R,layerId:__R.id,idx:0};setTool('vertex');showVertices();});await frames();
  const p3=await page.evaluate(()=>__ring()[__f.geom[0].length-2]);
  d=await arrasta(await px(p3[0],p3[1]),await px(p3[0]-0.03,p3[1]+0.6),durante);
  r=await page.evaluate(()=>__ring());const q=r[r.length-2];
  assert.ok(Math.abs(q[0]-p3[0])>0.01,'sem ímã não encaixa: '+q[0]);assert.equal(d.ativo,true);
  await page.evaluate(()=>{S.snapOn=true;clearVertices();setTool('select');});
  pass('com o ímã desligado as guias aparecem mas não puxam o vértice');

  assert.deepEqual(errors,[]);
  console.log(`OK ${passed} cenários`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
