// "+ Campo" da tabela de atributos: campo novo sem expressão nasce vazio e
// editável; com expressão é calculado; nomes repetidos (inclusive em outra
// caixa) e "atualizar existente" sem expressão são recusados; o campo vazio
// sobrevive a gravar e reabrir. Navegador isolado e dados sintéticos.
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
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted);
  await page.evaluate(()=>{
   S.setBase('Sem fundo');S.projectId='attr-add-field-synthetic';S.workCRS='EPSG:31983';
   const feats=[0,1,2].map(i=>({geom:[[[313000+i*100,7683000],[313050+i*100,7683000],[313050+i*100,7683050],[313000+i*100,7683050],[313000+i*100,7683000]]],
    multi:true,props:{NOME:'P'+i}}));
   window.__L=addLayer({name:'Teste campos',gtype:'polygon',crs:'EPSG:31983',features:feats,fields:[{name:'NOME',type:'C',length:20}]});
   S.activeId=__L.id;drawLayer(__L);refreshUI();openAttr();
   window.__toasts=[];const t=window.toast;window.toast=function(m,...a){__toasts.push(String(m));return t.apply(this,[m,...a]);};
  });
  const estado=nome=>page.evaluate(n=>({campo:(__L.fields||[]).find(f=>f.name===n)||null,valores:__L.features.map(f=>f.props[n]),
   modal:!!document.querySelector('#fcOk'),prev:document.querySelector('#fcPrev')?.textContent||'',
   cab:[...document.querySelectorAll('#attrBody th')].map(t=>t.firstChild&&t.firstChild.textContent),toast:__toasts[__toasts.length-1]||''}),nome);
  const abre=async(nome,{tipo='C',expr='',existente='',espera='fecha'}={})=>{
   /* "+ Campo" age na camada ativa; tarefas de inicialização podem trocá-la sob carga */
   await page.evaluate(()=>{if(S.activeId!==__L.id){S.activeId=__L.id;openAttr();}});
   await page.click('#btnAddField');await page.waitForSelector('#fcNome');
   /* a janela leva o foco para a expressão 40 ms depois de abrir; digitar antes
      disso, sob carga, mandava o nome para a caixa da expressão */
   await page.waitForFunction(()=>document.activeElement?.id==='fcExpr',null,{timeout:15000});
   if(existente){await page.check('#fcExist');await page.selectOption('#fcCampo',existente);}
   else{await page.fill('#fcNome',nome);await page.selectOption('#fcTipo',tipo);}
   if(expr)await page.fill('#fcExpr',expr);
   const n=await page.evaluate(()=>__toasts.length);
   await page.click('#fcOk');
   /* espera o resultado DESTE passo: sob carga outros avisos do app (gravação
      automática da sessão) chegam antes e não podem encerrar a espera */
   await page.waitForFunction(({n,espera})=>espera==='fecha'?!document.querySelector('#fcOk')
     :espera==='duplicado'?__toasts.slice(n).some(t=>/Já existe um campo/.test(t))
     :/Escreva/.test(document.querySelector('#fcPrev')?.textContent||''),{n,espera},{timeout:15000});
  };
  const fecha=async()=>{if(await page.locator('#fcX').count())await page.click('#fcX');};

  const diag=()=>page.evaluate(()=>JSON.stringify({naLista:S.layers.includes(__L),ativa:activeLayer()?.name??null,camadas:S.layers.map(l=>l.name),toasts:__toasts.slice(-4)}));
  await abre('OBS');
  let r=await estado('OBS');
  assert.deepEqual(r.campo&&{name:r.campo.name,type:r.campo.type},{name:'OBS',type:'C'},await diag());
  assert.deepEqual(r.valores,['','','']);assert.equal(r.modal,false);assert.ok(r.cab.includes('OBS'),JSON.stringify(r.cab));
  assert.match(r.toast,/Campo criado vazio: OBS/);
  pass('texto sem expressão: coluna vazia criada e visível');

  await abre('PROF_M',{tipo:'N'});
  r=await estado('PROF_M');
  assert.equal(r.campo&&r.campo.type,'N');assert.deepEqual(r.valores,[null,null,null]);assert.ok(r.cab.includes('PROF_M'));
  pass('número sem expressão: coluna vazia (nula) criada');

  const fi=await page.evaluate(()=>__L.fields.findIndex(f=>f.name==='OBS'));
  const cel=page.locator(`#attrBody td[data-i="1"][data-fi="${fi}"]`);
  await cel.click();await page.keyboard.type('Nascente');await page.locator('#attrBody td[data-i="0"]').first().click();
  await page.waitForFunction(()=>__L.features[1].props.OBS==='Nascente',null,{timeout:15000});
  pass('célula da coluna nova é editável na tabela');

  await abre('DOBRO',{tipo:'N',expr:'$ID*2'});
  r=await estado('DOBRO');assert.deepEqual(r.valores,[2,4,6]);assert.match(r.toast,/Campo criado: DOBRO/);
  pass('com expressão continua calculando');

  await abre('obs',{espera:'duplicado'});
  r=await estado('obs');assert.equal(r.campo,null);assert.equal(r.modal,true);assert.match(r.toast,/Já existe um campo/);
  await fecha();
  pass('nome repetido em outra caixa é recusado');

  await abre('',{existente:'NOME',espera:'escreva'});
  r=await estado('NOME');assert.equal(r.modal,true);assert.deepEqual(r.valores,['P0','P1','P2']);assert.match(r.prev,/Escreva uma expressão/);
  await fecha();
  pass('atualizar campo existente sem expressão não apaga valores');

  const rt=await page.evaluate(()=>{
   const d=JSON.parse(JSON.stringify(projectData()));loadProject(d);
   const L=S.layers.find(l=>l.name==='Teste campos');S.activeId=L.id;openAttr();
   return {campos:L.fields.map(f=>f.name+':'+f.type),obs:L.features.map(f=>f.props.OBS),prof:L.features.map(f=>f.props.PROF_M??null),
    cab:[...document.querySelectorAll('#attrBody th')].map(t=>t.firstChild&&t.firstChild.textContent)};
  });
  assert.deepEqual(rt.campos,['NOME:C','OBS:C','PROF_M:N','DOBRO:N']);
  assert.deepEqual(rt.obs,['','Nascente','']);assert.deepEqual(rt.prof,[null,null,null]);
  assert.ok(rt.cab.includes('OBS')&&rt.cab.includes('PROF_M'),JSON.stringify(rt.cab));
  pass('campos vazios sobrevivem a gravar e reabrir o projeto');

  assert.deepEqual(errors,[]);
  console.log(`OK ${passed} cenários`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
