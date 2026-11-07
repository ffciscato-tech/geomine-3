// ⓘ de figura geométrica: área, perímetro e, no círculo, raio e diâmetro.
// O círculo sai da própria ferramenta Círculo (72 vértices). Hexágono e
// retângulo não ganham raio; um círculo com um vértice editado deixa de ter.
// O raio também chega à calculadora de campo e ao painel da feição.
// Navegador isolado e dados sintéticos.
// PLAYWRIGHT_MODULE, CHROME_PATH e APP_PATH permitem rodar fora do macOS.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stage=path.resolve(__dirname,'..');let passed=0;
const pass=name=>{passed++;console.log('PASS '+name);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route(/^https?:/,r=>r.abort());
  await page.goto(pathToFileURL(path.resolve(process.env.APP_PATH||path.join(stage,'dist/GeoMine.html'))).href);
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&typeof formaGeom==='function');
  await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31983';S.projectId='info-circle-synthetic';
   /* geometrias exatamente como as ferramentas de forma produzem */
   const c=[313000,7683000],circ=formaGeom('circulo',c,{R:12.5},0),hexa=formaGeom('regular',[313100,7683000],{N:6,R:12.5},0),
     ret=formaGeom('retangulo',[313200,7683000],{C:20,L:10},30),editado=formaGeom('circulo',[313300,7683000],{R:12.5},0);
   editado[10]=[editado[10][0]+2,editado[10][1]+1];
   window.__L=addLayer({name:'Formas teste',gtype:'polygon',crs:'EPSG:31983',fields:[{name:'FORMA',type:'C',length:20}],features:[
    {geom:[circ],multi:true,props:{FORMA:'Círculo'}},{geom:[hexa],multi:true,props:{FORMA:'Hexágono'}},
    {geom:[ret],multi:true,props:{FORMA:'Retângulo'}},{geom:[editado],multi:true,props:{FORMA:'Círculo editado'}}]});
   drawLayer(__L);refreshUI();
   const a=toWGS(S.workCRS,312980,7682980),b=toWGS(S.workCRS,313320,7683020);map.fitBounds([[a[1],a[0]],[b[1],b[0]]],{animate:false});
  });
  const info=async e=>page.evaluate(async e=>{const w=toWGS(S.workCRS,e,7683000);await window.infoClick(L2.latLng(w[1],w[0]));
   const t=document.createElement('div');t.innerHTML=String(map._popup?.getContent()||'');return t.textContent;},e);

  let t=await info(313000);
  /* polígono de 72 lados: área e perímetro da geometria gravada (πr² seria 490,87) */
  assert.match(t,/Área \(m²\)\s*490,25/);assert.match(t,/Perímetro \(m\)\s*78,51/);
  assert.match(t,/Raio \(m\)\s*12,50/);assert.match(t,/Diâmetro \(m\)\s*25,00/);
  pass('círculo da ferramenta: área, perímetro, raio 12,50 m e diâmetro 25,00 m');

  t=await info(313100);assert.match(t,/Perímetro/);assert.doesNotMatch(t,/Raio/);
  t=await info(313200);assert.match(t,/Área \(m²\)\s*200,00/);assert.doesNotMatch(t,/Raio/);
  pass('hexágono e retângulo mostram área e perímetro, sem raio');

  t=await info(313300);assert.match(t,/Área/);assert.doesNotMatch(t,/Raio/);
  pass('círculo com um vértice editado deixa de mostrar raio');

  const calc=await page.evaluate(()=>fcAvalia(__L,'$RAIO','N').valores.map(v=>v==null?null:Math.round(v*1000)/1000));
  assert.deepEqual(calc,[12.5,null,null,null]);
  pass('calculadora de campo: $RAIO vale 12,5 no círculo e fica vazio nas outras');

  /* traço longo e anel com furo não são círculo */
  const outros=await page.evaluate(()=>{
   const meio=formaGeom('circulo',[313400,7683000],{R:12.5},0).slice(0,37);meio.push(meio[0]);
   const furo=[formaGeom('circulo',[313500,7683000],{R:12.5},0),formaGeom('circulo',[313500,7683000],{R:5},0)];
   return [geomValor(__L,{geom:[meio],multi:true},'$RAIO'),geomValor(__L,{geom:furo,multi:true},'$RAIO')];
  });
  assert.deepEqual(outros,[null,null]);
  pass('meio círculo fechado por corda e anel com furo não recebem raio');

  const props=await page.evaluate(()=>{S.selFeat={layer:__L,layerId:__L.id,idx:0};showProps();return document.getElementById('propBody').textContent;});
  assert.match(props,/Raio:\s*12[,.]5/);assert.match(props,/Diâmetro:\s*25/);
  pass('painel da feição selecionada mostra raio e diâmetro');

  assert.deepEqual(errors,[]);
  console.log(`OK ${passed} cenários`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
