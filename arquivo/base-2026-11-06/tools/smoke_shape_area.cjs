// Formas geométricas pela área: a medida com 🔒 fica fixa e a outra se ajusta;
// sem nenhuma fixa, a proporção é mantida; a área gravada na feição é a
// digitada (polígono de 72 lados no círculo e na elipse). Retângulo, círculo,
// elipse e polígono regular. Navegador isolado, mouse real, dados sintéticos.
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
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&typeof formaArma==='function');
  await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31983';S.snapOn=false;
   window.__F=addLayer({name:'Formas teste',gtype:'polygon',crs:'EPSG:31983',fields:[],features:[]});S.activeId=__F.id;refreshUI();
   window.askDrawDest=(k,go)=>go();
   const w=toWGS(S.workCRS,313000,7683000);map.setView([w[1],w[0]],15,{animate:false});
  });
  const val=id=>page.locator('#'+id).inputValue().then(Number);
  const cria=async()=>{
   const n0=await page.evaluate(()=>__F.features.length);
   await page.click('#fmOk');
   const c=await page.evaluate(()=>{const r=map.getContainer().getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
   await page.mouse.click(c.x,c.y);
   await page.waitForFunction(n=>__F.features.length>n,n0,{timeout:10000}).catch(async e=>{
    const diag=await page.evaluate(c=>{const el=document.elementFromPoint(c.x,c.y);return {tool:S.tool,forma:FORMA.tipo,sob:el?el.tagName+'#'+(el.closest('[id]')?.id||''):null,
     modais:[...document.querySelectorAll('.modal-bg.on')].map(m=>m.id)};},c);
    throw Error('figura não criada: '+JSON.stringify(diag));});
   await page.evaluate(()=>{document.querySelectorAll('.modal-bg.on').forEach(m=>{if(m.id!=='formaModal')m.classList.remove('on');});});
   /* formaClick ignora o clique a menos de 250 ms do anterior (proteção contra
      duplo clique); o teste é mais rápido que qualquer pessoa entre duas formas */
   await page.waitForTimeout(400);
   return page.evaluate(()=>{const f=__F.features.at(-1);return {area:geomValor(__F,f,'$AREA_M2'),gravada:f.props.AREA_M2,raio:geomValor(__F,f,'$RAIO')};});
  };

  /* retângulo */
  await page.evaluate(()=>formaArma('retangulo'));
  assert.equal(await val('fmA'),200);
  await page.locator('#fmC').fill('25');assert.equal(await val('fmA'),250,'área acompanha o comprimento');
  await page.locator('.fm-fix[data-for="fmC"]').check();
  await page.locator('#fmA').fill('150');near(await val('fmL'),6,1e-6);assert.equal(await val('fmC'),25);
  pass('retângulo: comprimento fixo (🔒) e a largura se ajusta à área digitada');

  await page.locator('.fm-fix[data-for="fmL"]').check();
  assert.equal(await page.locator('.fm-fix[data-for="fmC"]').isChecked(),false,'só uma medida fica fixa');
  await page.locator('#fmA').fill('300');near(await val('fmC'),50,1e-6);near(await val('fmL'),6,1e-6);
  pass('largura fixa: o comprimento se ajusta; marcar uma desmarca a outra');

  await page.locator('.fm-fix[data-for="fmL"]').uncheck();
  await page.locator('#fmA').fill('600');
  const C=await val('fmC'),Lw=await val('fmL');near(C*Lw,600,1e-3);near(C/Lw,50/6,1e-4,'proporção mantida');
  let r=await cria();near(r.area,600,1e-3);assert.equal(r.gravada,600);
  pass('sem medida fixa a proporção é mantida; a feição criada tem 600,00 m²');

  /* círculo: área exata do polígono de 72 lados */
  await page.evaluate(()=>formaArma('circulo'));
  await page.locator('#fmA').fill('500');
  const R=await val('fmR');r=await cria();near(r.area,500,1e-3);assert.equal(r.gravada,500);near(r.raio,R,1e-6);
  pass('círculo: raio calculado pela área; a feição tem exatamente 500,00 m²');

  /* círculo no modo arrastando, com a área fixa (🔒): o clique só marca o centro */
  await page.evaluate(()=>formaArma('circulo'));
  await page.locator('#fmA').fill('400');await page.locator('#fmFixaCirc').check();
  {
   const n0=await page.evaluate(()=>__F.features.length);
   await page.click('#fmDrag');
   const c=await page.evaluate(()=>{const r=map.getContainer().getBoundingClientRect();return {x:r.left+r.width/2+80,y:r.top+r.height/2};});
   await page.mouse.click(c.x,c.y);
   await page.waitForFunction(n=>__F.features.length>n,n0,{timeout:10000});
   await page.evaluate(()=>{document.querySelectorAll('.modal-bg.on').forEach(m=>{if(m.id!=='formaModal')m.classList.remove('on');});});await page.waitForTimeout(400);
   const a=await page.evaluate(()=>geomValor(__F,__F.features.at(-1),'$AREA_M2'));near(a,400,1e-3);
  }
  pass('círculo arrastando com a área fixa: o clique marca o centro e o círculo tem 400,00 m²');

  /* círculo arrastando livre: o rótulo mostra R e a área, que é a do círculo criado */
  await page.evaluate(()=>{formaArma('circulo');});await page.click('#fmDrag');
  {
   const n0=await page.evaluate(()=>__F.features.length);
   const c=await page.evaluate(()=>{const r=map.getContainer().getBoundingClientRect();return {x:r.left+r.width/2-150,y:r.top+r.height/2+80};});
   await page.mouse.move(c.x,c.y);await page.mouse.down();await page.mouse.move(c.x+60,c.y,{steps:8});
   const txt=await page.evaluate(()=>document.getElementById('formaRaioTxt')?.textContent||'');
   await page.mouse.up();
   await page.waitForFunction(n=>__F.features.length>n,n0,{timeout:10000});
   await page.evaluate(()=>{document.querySelectorAll('.modal-bg.on').forEach(m=>{if(m.id!=='formaModal')m.classList.remove('on');});});await page.waitForTimeout(400);
   const m=/R = ([\d.,]+) m · A = ([\d.,]+) m²/.exec(txt);assert.ok(m,'rótulo com área: '+txt);
   const shown=Number(m[2].replace(/\./g,'').replace(',','.')),a=await page.evaluate(()=>geomValor(__F,__F.features.at(-1),'$AREA_M2'));
   near(a,shown,0.01,'área do rótulo = área criada');
  }
  pass('círculo arrastando: o rótulo mostra R e a área do círculo que será criado');

  /* elipse com semi-eixo X fixo */
  await page.evaluate(()=>formaArma('elipse'));
  await page.locator('.fm-fix[data-for="fmRx"]').check();await page.locator('#fmA').fill('300');
  assert.equal(await val('fmRx'),15);r=await cria();near(r.area,300,1e-3);
  pass('elipse: semi-eixo X fixo, o Y se ajusta; área de 300,00 m²');

  /* polígono regular: muda o nº de lados e a área acompanha; área digitada → raio */
  await page.evaluate(()=>formaArma('regular'));
  const a6=await val('fmA');await page.locator('#fmN').fill('8');assert.notEqual(await val('fmA'),a6,'área acompanha o nº de lados');
  await page.locator('#fmA').fill('100');r=await cria();near(r.area,100,1e-3);
  pass('polígono regular: a área acompanha o nº de lados e a área digitada vira o raio');

  /* caixa da Hidrologia (Bacia de retenção): área da boca com 🔒 no comprimento ou na largura */
  const caixa=await page.evaluate(()=>{
   const $=id=>document.getElementById(id),dig=(id,v)=>{$(id).value=String(v);$(id).dispatchEvent(new Event('input',{bubbles:true}));},
     marca=(id,on)=>{const c=document.querySelector('#bcRetParams .fm-fix[data-for="'+id+'"]');c.checked=on;c.dispatchEvent(new Event('change',{bubbles:true}));};
   const r={inicial:+$('bcA').value};
   dig('bcC',30);r.aposC=+$('bcA').value;
   marca('bcC',true);dig('bcA',450);r.fixoC={C:+$('bcC').value,L:+$('bcL').value};
   marca('bcL',true);r.desmarcouC=!document.querySelector('#bcRetParams .fm-fix[data-for="bcC"]').checked;dig('bcA',600);r.fixoL={C:+$('bcC').value,L:+$('bcL').value};
   marca('bcL',false);dig('bcA',2400);r.livre={C:+$('bcC').value,L:+$('bcL').value};
   return r;});
  assert.equal(caixa.inicial,200);assert.equal(caixa.aposC,300);
  assert.deepEqual(caixa.fixoC,{C:30,L:15});assert.equal(caixa.desmarcouC,true);assert.deepEqual(caixa.fixoL,{C:40,L:15});
  near(caixa.livre.C*caixa.livre.L,2400,1e-3);near(caixa.livre.C/caixa.livre.L,40/15,1e-4);
  pass('caixa da Hidrologia: área da boca com comprimento ou largura fixa, ou na mesma proporção');

  assert.deepEqual(errors,[]);
  console.log(`OK ${passed} cenários`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
