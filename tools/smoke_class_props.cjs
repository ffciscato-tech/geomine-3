// Dois cliques numa classe da árvore (camada classificada) abrem a janela
// resumida da classe: preenchimento, contorno, espessura, hachura e espaçamento
// para polígonos; estilo de linha para linhas. Só a classe muda no mapa; "Usar
// o padrão da camada" tira as exceções; o estilo sobrevive a gravar e reabrir.
// Navegador isolado, mouse real, dados sintéticos (3 silos).
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
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&typeof openClassProps==='function');
  await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31983';S.projectId='class-props-synthetic';
   const sq=(x,y)=>[[[x,y],[x+20,y],[x+20,y+20],[x,y+20],[x,y]]];
   window.__S=addLayer({name:'Silos',gtype:'polygon',crs:'EPSG:31983',fields:[{name:'NOME',type:'C',length:20}],
    features:['Silo A','Silo B','Silo C'].map((n,i)=>({geom:sq(313000+i*40,7683000),multi:true,props:{NOME:n}}))});
   window.__R=addLayer({name:'Correias',gtype:'line',crs:'EPSG:31983',fields:[{name:'TIPO',type:'C',length:20}],
    features:['Principal','Ramal'].map((n,i)=>({geom:[[313000,7683100+i*20],[313100,7683100+i*20]],props:{TIPO:n}}))});
   classifyCore(__S,'cat','NOME',0,'',null);classifyCore(__R,'cat','TIPO',0,'',null);
   __S.clsOpen=true;__R.clsOpen=true;drawLayer(__S);drawLayer(__R);refreshUI();
   const a=toWGS(S.workCRS,312990,7682990),b=toWGS(S.workCRS,313130,7683130);map.fitBounds([[a[1],a[0]],[b[1],b[0]]],{animate:false});
  });
  const classeNaArvore=(nome)=>page.locator('.clsrow',{has:page.locator('.nm',{hasText:new RegExp('^'+nome+'$')})}).first();
  const estilo=i=>page.evaluate(i=>{const st=featureStyle(__S,__S.features[i]);return {color:st.color,stroke:st.stroke,weight:st.weight,hatch:st.hatch,hatchScale:st.hatchScale};},i);
  const padraoA=await estilo(0);

  /* clique simples não abre menu nem janela */
  await classeNaArvore('Silo B').locator('.nm').click();await page.waitForTimeout(400);
  assert.equal(await page.locator('.ribmini').count(),0,'clique simples não abre menu');
  assert.equal(await page.locator('#clsPropModal.on').count(),0);
  await classeNaArvore('Silo B').locator('.nm').dblclick();
  await page.waitForSelector('#clsPropModal.on',{timeout:10000});
  assert.match(await page.locator('#clsPropModal .modal-h').textContent(),/Classe “Silo B”.*Silos/);
  assert.equal(await page.locator('.ribmini').count(),0,'nenhum menu no caminho');
  assert.equal(await page.locator('#cpNome').inputValue(),'Silo B');
  pass('clique simples não abre nada; dois cliques abrem direto a janela “Silo B”, com o nome editável');

  const m=page.locator('#clsPropModal');
  await m.locator('.ce-color-pick[data-target="fill"]').click();await m.locator('.ce-sw[data-cor="#e53935"]').click();
  await m.locator('.ce-color-pick[data-target="stroke"]').click();await m.locator('.ce-sw[data-cor="#1565c0"]').click();
  await m.locator('.ce-weight').fill('4');
  await m.locator('.ce-hatch').selectOption('cross');
  await m.locator('.ce-hatch-scale').fill('2');
  await page.waitForFunction(()=>{const c=__S.sym.cats.find(c=>c.value==='Silo B');return c.hatchScale===2&&c.weight===4;},null,{timeout:5000});
  const b=await estilo(1);
  assert.deepEqual(b,{color:'#e53935',stroke:'#1565c0',weight:4,hatch:'cross',hatchScale:2});
  assert.deepEqual(await estilo(0),padraoA,'Silo A não muda');
  assert.equal(await m.locator('.ce-hatch-spacing-row').isVisible(),true);
  const caminho=await page.evaluate(()=>{const lay=__S.llayer.getLayers().find(l=>l._fidx===1)||__S.llayer.getLayers()[1];const p=lay&&lay._path;return p?{w:p.getAttribute('stroke-width'),fill:p.getAttribute('fill')}:null;});
  if(caminho){assert.equal(caminho.w,'4');assert.match(caminho.fill,/url\(#pat_cross/);}
  pass('preenchimento, contorno, espessura, hachura e espaçamento só do Silo B, ao vivo no mapa');

  await m.locator('#cpPadrao').click();
  const pad=await page.evaluate(()=>{const c=__S.sym.cats.find(c=>c.value==='Silo B');return {color:c.color,hatch:c.hatch,weight:c.weight,stroke:c.stroke};});
  assert.deepEqual(pad,{color:'#e53935',hatch:undefined,weight:undefined,stroke:undefined});
  pass('“Usar o padrão da camada” tira as exceções e mantém a cor');

  await m.locator('.ce-hatch').selectOption('fdiagonal');await m.locator('.ce-weight').fill('3');
  await page.waitForFunction(()=>__S.sym.cats.find(c=>c.value==='Silo B').hatch==='fdiagonal'&&__S.sym.cats.find(c=>c.value==='Silo B').weight===3,null,{timeout:5000});
  await m.locator('#cpOk').click();assert.equal(await page.locator('#clsPropModal.on').count(),0);
  const rt=await page.evaluate(()=>{const d=JSON.parse(JSON.stringify(projectData()));loadProject(d);
   const L=S.layers.find(l=>l.name==='Silos'),c=L.sym.cats.find(c=>c.value==='Silo B');return {hatch:c.hatch,weight:c.weight,color:c.color};});
  assert.deepEqual(rt,{hatch:'fdiagonal',weight:3,color:'#e53935'});
  pass('o estilo da classe sobrevive a gravar e reabrir o projeto');

  /* renomear pela própria janela: classe, campo das feições, título e árvore */
  await page.evaluate(()=>{const L=S.layers.find(l=>l.name==='Silos');L.clsOpen=true;window.__S=L;refreshUI();});
  await classeNaArvore('Silo B').locator('.nm').dblclick();await page.waitForSelector('#clsPropModal.on');
  await page.locator('#cpNome').fill('Silo Beta');await page.locator('#cpNome').press('Enter');
  await page.waitForFunction(()=>__S.sym.cats.some(c=>c.value==='Silo Beta'),null,{timeout:5000});
  const ren=await page.evaluate(()=>({nomes:__S.features.map(f=>f.props.NOME),estilo:(c=>({hatch:c.hatch,color:c.color}))(__S.sym.cats.find(c=>c.value==='Silo Beta')),
    titulo:document.querySelector('#clsPropModal .modal-h').textContent}));
  assert.deepEqual(ren.nomes,['Silo A','Silo Beta','Silo C']);assert.deepEqual(ren.estilo,{hatch:'fdiagonal',color:'#e53935'});
  assert.match(ren.titulo,/Classe “Silo Beta”/);
  assert.equal(await classeNaArvore('Silo Beta').count(),1,'árvore mostra o novo nome');
  await page.locator('#cpNome').fill('Silo A');await page.locator('#cpRenomear').click();
  assert.equal(await page.evaluate(()=>__S.sym.cats.filter(c=>c.value==='Silo A').length),1,'nome repetido é recusado');
  assert.equal(await page.locator('#cpNome').inputValue(),'Silo Beta');
  await m.locator('#cpOk').click();
  pass('renomear dentro da janela troca o campo das feições, mantém o estilo e recusa nome repetido');

  await page.evaluate(()=>{const L=S.layers.find(l=>l.name==='Correias');L.clsOpen=true;window.__R=L;refreshUI();});
  await classeNaArvore('Ramal').locator('.nm').dblclick();await page.waitForSelector('#clsPropModal.on');
  assert.equal(await m.locator('.ce-hatch').count(),0,'linha não tem hachura');
  await m.locator('.dsgal-i').nth(2).click();
  await page.waitForFunction(()=>!!__R.sym.cats.find(c=>c.value==='Ramal').dash,null,{timeout:5000});
  const dash=await page.evaluate(()=>({ramal:featureStyle(__R,__R.features[1]).dash,principal:featureStyle(__R,__R.features[0]).dash}));
  assert.ok(dash.ramal&&dash.ramal!==dash.principal,JSON.stringify(dash));
  await m.locator('#cpOk').click();
  pass('linha: estilo de linha só da classe “Ramal”, sem hachura na janela');

  /* a janela completa da camada continua aplicando pelo mesmo leitor */
  await page.evaluate(()=>{const L=S.layers.find(l=>l.name==='Silos');window.__S=L;openLayerProps(L);});
  const ok=await page.evaluate(()=>{const el=document.querySelector('#lpClasses .cls[data-i="0"]');el.querySelector('.ce-weight').value='5';lpCollect(true);
   document.getElementById('lpModal').classList.remove('on');return __S.sym.cats[0].weight;});
  assert.equal(ok,5);
  pass('janela completa da camada segue aplicando os editores de classe');

  assert.deepEqual(errors,[]);
  console.log(`OK ${passed} cenários`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
