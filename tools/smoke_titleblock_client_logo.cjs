// Disposable browser and synthetic logo only; does not touch the live project.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+path.resolve(__dirname,'../dist/GeoMine.html'));
  await page.waitForFunction(()=>window.GeoMineTitleblockLogo&&typeof projectData==='function');
  await page.evaluate(()=>{
   S.workCRS='EPSG:31983';S._signikaCSS='';S.projectId='synthetic-titleblock';S.setBase('Sem fundo');
   addLayer({name:'Área de teste',gtype:'line',crs:S.workCRS,fields:[],features:[{geom:[[500000,7200000],[500800,7200500]],props:{}}]});
   S.loMode='a4';S.loPranchaFormato='a3';S.loFrozen=false;S._view='map';
   for(const id of ['loSat','loCoords'])document.getElementById(id).checked=false;
   document.getElementById('loScaleAuto').checked=true;
   for(const [id,value] of Object.entries({loTitle:'PLANO DE FECHAMENTO DE MINA',loArea:'SITUAÇÃO FINAL',loCli:'CONTRATANTE DE TESTE',loLoc:'Adrianópolis / PR',loRT:'Responsável técnico',loDes:'Desenhista',loCont:'Geologia e cava',loExec:'CCM Engenharia'}))document.getElementById(id).value=value;
  });
  await page.evaluate(()=>document.getElementById('btnSeloCfg2').click());
  await page.locator('#seloModal').waitFor({state:'visible'});
  assert.equal(await page.locator('#seloCompanyRole').inputValue(),'contratada');
  const defaultRole=await page.evaluate(()=>GeoMineTitleblockLogo.logos({x:0,y:0,width:50,height:10,company:'data:image/png;base64,AAAA',client:null}));
  assert.match(defaultRole,/>CONTRATADA<\/text>/);
  await page.locator('#seloCompanyRole').selectOption('executora');
  const logo='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><rect width="600" height="200" fill="#7e22ce"/><text x="300" y="116" font-family="sans-serif" font-size="40" fill="white" text-anchor="middle">CONTRATANTE TESTE</text></svg>';
  const chooser=page.waitForEvent('filechooser');
  await page.locator('label[for="seloCliLogoFile"]').click();
  await (await chooser).setFiles({name:'logo-teste.svg',mimeType:'image/svg+xml',buffer:Buffer.from(logo)});
  await page.waitForFunction(()=>S.cliLogoName==='logo-teste.svg');
  await page.locator('#seloClose').click();
  const result=await page.evaluate(async()=>{
   const ok=await buildLayout({exporting:true}),doc=new DOMParser().parseFromString(S._lastSVG,'image/svg+xml');
   window.__logo=S.cliLogo;window.__saved=JSON.parse(JSON.stringify(projectData()));
   const g=doc.querySelector('[data-titleblock-logos]'),client=g.querySelector('[data-titleblock-logo="client"]'),company=g.querySelector('[data-titleblock-logo="company"]');
   const box=e=>Object.fromEntries(['x','y','width','height'].map(k=>[k,+e.getAttribute(k)]));
   const a=box(company),b=box(client),outer=g.parentNode.querySelector('rect');
   const c=await rasterizeLayout(150),px=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
   let purple=0;for(let i=0;i<px.length;i+=4)if(px[i]===126&&px[i+1]===34&&px[i+2]===206)purple++;
   window.__a3SVG=S._lastSVG;
   return {ok,xmlError:!!doc.querySelector('parsererror'),company:a,client:b,outer:box(outer),purple,
    companyRole:g.querySelector('[data-titleblock-role="company"]').textContent,
    clientRole:g.querySelector('[data-titleblock-role="client"]').textContent,
    companyLabelY:+g.querySelector('[data-titleblock-role="company"]').getAttribute('y'),
    roleSaved:__saved.seloCompanyRole,
    saved:__saved.cliLogo===S.cliLogo,preview:!document.getElementById('seloCliLogoPreview').hidden,
    fields:['PROJETO','TÍTULO','CLIENTE','ENDEREÇO DA OBRA','PROJETISTA','DESENHISTA','EXECUÇÃO','DATA','ANM','CONTEÚDO','ESCALAS','REVISÃO','REVISOR','FOLHA'].every(t=>doc.documentElement.textContent.includes(t))};
  });
  assert.equal(result.ok,true);assert.equal(result.xmlError,false);assert.equal(result.outer.width,112);
  assert.ok(Math.abs(result.outer.height-42.275)<.001);assert.ok(result.company.x+result.company.width<result.client.x);
  assert.ok(result.client.x+result.client.width<result.outer.x+112*.48);assert.ok(result.purple>1000);
  assert.equal(result.saved,true);assert.equal(result.preview,true);assert.equal(result.fields,true);
  assert.equal(result.companyRole,'EXECUTORA');assert.equal(result.clientRole,'CONTRATANTE');assert.equal(result.roleSaved,'executora');
  assert.ok(result.company.y>result.companyLabelY);assert.equal(result.company.y,result.client.y);
  // Visual QA of the actual generated title block, enlarged without redrawing.
  const svg=await page.evaluate(()=>__a3SVG);const preview=await browser.newPage();
  await preview.setContent(svg);await preview.locator('svg').evaluate((s,b)=>{s.setAttribute('viewBox',`${b.x-.5} ${b.y-.5} ${b.width+1} ${b.height+1}`);s.setAttribute('width','1120');s.setAttribute('height','433');},result.outer);
  await preview.locator('svg').screenshot({path:path.resolve(__dirname,'../dist/titleblock-client-logo.png')});await preview.close();
  const persistence=await page.evaluate(async()=>{
   GeoMineTitleblockLogo.remove();const removed=S.cliLogo===null&&document.getElementById('seloCliLogoPreview').hidden&&S._lastSVG===null;
   loadProject(__saved);const restored=S.cliLogo===__logo&&S.cliLogoName==='logo-teste.svg'&&S.seloCompanyRole==='executora'&&document.getElementById('seloCompanyRole').value==='executora';
   const legacy=JSON.parse(JSON.stringify(__saved));delete legacy.cliLogo;delete legacy.cliLogoName;delete legacy.seloCompanyRole;loadProject(legacy);
   const cleared=S.cliLogo===null&&S.seloCompanyRole==='contratada'&&document.getElementById('seloCompanyRole').value==='contratada';S.loMode='a4';S.loPranchaFormato='a4';S.loFrozen=false;await buildLayout({exporting:true});
   const a4=!S._lastSVG.includes('data-titleblock-logos');
   const invalid=await GeoMineTitleblockLogo.load(new File(['invalid'],'bad.png',{type:'image/png'}));
   return {removed,restored,cleared,a4,invalid,empty:S.cliLogo===null};
  });
  assert.deepEqual(persistence,{removed:true,restored:true,cleared:true,a4:true,invalid:false,empty:true});assert.deepEqual(errors,[]);
  console.log('PASS A3 upload, separate cells, all fields, PNG export, persistence, legacy reset, removal, invalid upload and A4 preservation',JSON.stringify({result,persistence}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
