// Navegador que oferece o seletor avançado mas recusa o arquivo escolhido
// (painel de navegador do app Claude, outros Electron): getFile/createWritable
// rejeitam com NotAllowedError. Abrir projeto oferece o seletor simples e passa
// a usá-lo direto; Salvar Como cai no download em vez de falhar. Os seletores
// são simulados; o projeto é sintético e gravado só na pasta temporária.
// PLAYWRIGHT_MODULE, CHROME_PATH e APP_PATH permitem rodar fora do macOS.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stage=path.resolve(__dirname,'..');let passed=0;
const pass=name=>{passed++;console.log('PASS '+name);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'geomine-fsapi-'));
 try{
  const context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route(/^https?:/,r=>r.abort());
  await page.goto(pathToFileURL(path.resolve(process.env.APP_PATH||path.join(stage,'dist/GeoMine.html'))).href);
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted);
  /* projeto sintético gravado pelo próprio app */
  const txt=await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31983';
   addLayer({name:'Camada do projeto reaberto',gtype:'point',crs:'EPSG:31983',fields:[{name:'NOME',type:'C',length:20}],features:[{geom:[[313000,7683000]],props:{NOME:'P1'}}]});
   const d=projectData();S.layers.splice(0);refreshUI();return JSON.stringify(d);
  });
  const arquivo=path.join(tmp,'projeto_sintetico.ccmgis');fs.writeFileSync(arquivo,txt);
  await page.evaluate(()=>{
   const recusa=()=>new DOMException('The request is not allowed by the user agent or the platform in the current context.','NotAllowedError');
   window.__qa={abrir:0,salvar:0,toasts:[]};
   window.showOpenFilePicker=async()=>{__qa.abrir++;return [{kind:'file',name:'projeto_sintetico.ccmgis',getFile:async()=>{throw recusa();}}];};
   window.showSaveFilePicker=async()=>{__qa.salvar++;return {kind:'file',name:'salvo.ccmgis',createWritable:async()=>{throw recusa();},getFile:async()=>{throw recusa();},
    queryPermission:async()=>'granted',requestPermission:async()=>'granted'};};
   const t=window.toast;window.toast=function(m,...a){__qa.toasts.push(String(m));return t.apply(this,[m,...a]);};
   /* botão visível que chama o fluxo real com um clique de verdade */
   const b=document.createElement('button');b.id='qaAbrir';b.textContent='Abrir (teste)';b.onclick=()=>openProjectFile();
   b.style.cssText='position:fixed;left:8px;bottom:8px;z-index:99999';document.body.append(b);
  });

  await page.click('#qaAbrir');
  await page.waitForSelector('#fsSimplesModal',{timeout:15000});
  const t1=await page.evaluate(()=>({abrir:__qa.abrir,erro:__qa.toasts.some(t=>/Erro ao abrir projeto/.test(t))}));
  assert.equal(t1.abrir,1);assert.equal(t1.erro,false,'não pode mostrar o erro do getFile');
  pass('arquivo recusado pelo navegador: sem erro, oferece o seletor simples');

  let chooser=page.waitForEvent('filechooser',{timeout:15000});
  await page.click('#fsSimplesOk');(await chooser).setFiles(arquivo);
  await page.waitForFunction(()=>S.layers.some(l=>l.name==='Camada do projeto reaberto'),null,{timeout:30000});
  pass('“Escolher o arquivo” abre o seletor simples e o projeto carrega');

  chooser=page.waitForEvent('filechooser',{timeout:15000});
  await page.click('#qaAbrir');await chooser;
  assert.equal(await page.evaluate(()=>__qa.abrir),1,'a segunda abertura não deve usar o seletor avançado');
  assert.equal(await page.locator('#fsSimplesModal').count(),0);
  pass('na mesma sessão, Abrir projeto vai direto ao seletor simples');

  /* Salvar Como: o seletor avançado não é mais oferecido; o projeto baixa */
  let download=page.waitForEvent('download',{timeout:30000});
  await page.evaluate(()=>{saveProject(true);});
  let dl=await download;assert.match(dl.suggestedFilename(),/\.ccmgis$/);
  assert.equal(await page.evaluate(()=>__qa.salvar),0,'com a recusa registrada não abre o seletor de gravação');
  const salvo=path.join(tmp,'baixado.ccmgis');await dl.saveAs(salvo);assert.equal(JSON.parse(fs.readFileSync(salvo,'utf8')).layers.some(l=>l.name==='Camada do projeto reaberto'),true);
  pass('Salvar Como cai direto no download, com o projeto completo');

  /* nova aba (sessão limpa): a recusa na ESCRITA também cai no download */
  const page2=await context.newPage();page2.on('pageerror',e=>errors.push(e.message));page2.on('dialog',d=>d.accept());
  await page2.route(/^https?:/,r=>r.abort());
  await page2.goto(pathToFileURL(path.resolve(process.env.APP_PATH||path.join(stage,'dist/GeoMine.html'))).href);
  await page2.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted);
  await page2.evaluate(()=>{
   const recusa=()=>new DOMException('The request is not allowed by the user agent or the platform in the current context.','NotAllowedError');
   window.__qa={salvar:0,toasts:[]};
   window.showSaveFilePicker=async()=>{__qa.salvar++;return {kind:'file',name:'salvo.ccmgis',createWritable:async()=>{throw recusa();},getFile:async()=>{throw recusa();},
    queryPermission:async()=>'granted',requestPermission:async()=>'granted'};};
   const t=window.toast;window.toast=function(m,...a){__qa.toasts.push(String(m));return t.apply(this,[m,...a]);};
   S.setBase('Sem fundo');S.workCRS='EPSG:31983';
   addLayer({name:'Camada nova',gtype:'point',crs:'EPSG:31983',fields:[],features:[{geom:[[313000,7683000]],props:{}}]});refreshUI();
  });
  download=page2.waitForEvent('download',{timeout:30000});
  await page2.evaluate(()=>{saveProject(true);});
  dl=await download;
  const t2=await page2.evaluate(()=>({salvar:__qa.salvar,falha:__qa.toasts.some(t=>/Não foi possível gravar/.test(t))}));
  assert.equal(t2.salvar,1);assert.equal(t2.falha,false);
  pass('recusa ao gravar no arquivo escolhido: baixa o projeto em vez de falhar');

  assert.deepEqual(errors,[]);
  console.log(`OK ${passed} cenários`);
 }finally{await browser.close();fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
