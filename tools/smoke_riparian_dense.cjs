// APP automática em calhas com margem MUITO detalhada (degraus de 15 cm, como a
// margem traçada no MDT de 15 cm da hidrografia de Braço do Norte v10): 20
// calhas diagonais, ~113 mil vértices (o limite antigo era 100 mil e a faixa
// tinha um disco por vértice). Confere: gera sem recusa nem falha; seções a
// cada ~5 m do perímetro (não uma por aresta); nenhuma APP sobre a água; todo
// ponto a 29,5 m da margem real está na APP; generalização registrada
// (GEN_FAIXA_M 0,1 m; até 0,5 m na 3ª tentativa) e excesso ≤ 2 × desvio.
// Navegador isolado, dados sintéticos.
// PLAYWRIGHT_MODULE, CHROME_PATH e APP_PATH permitem rodar fora do macOS.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stage=path.resolve(__dirname,'..');let passed=0;
const pass=name=>{passed++;console.log('PASS '+name);};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:950}}),errors=[];page.setDefaultTimeout(600000);
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route(/^https?:/,r=>r.abort());
  await page.goto(pathToFileURL(path.resolve(process.env.APP_PATH||path.join(stage,'dist/GeoMine.html'))).href);
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineRiparianAPP);
  const n=await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31982';S.projectId='app-densa-sintetica';
   /* calha diagonal de 6 m: as margens são escadas de 15 cm (o contorno de pixels do MDT) */
   const escada=(x0,y0,len,off)=>{const pts=[];const passos=Math.round(len/.15);let x=x0,y=y0+off;pts.push([x,y]);for(let k=0;k<passos;k++){x+=.15;pts.push([x,y]);y+=.15;pts.push([x,y]);}return pts;};
   const feats=[];
   /* a margem de cima termina no passo horizontal: o fechamento vertical não pode voltar sobre o último degrau */
   for(let i=0;i<20;i++){const x0=500000+(i%5)*400,y0=7400000+Math.floor(i/5)*400,a=escada(x0,y0,212,0).slice(0,-1),b=escada(x0,y0,212,-8.49);
    feats.push({geom:[...a,...b.reverse(),a[0]],props:{ID:i+1}});}
   window.__C=addLayer({name:'Calhas densas',gtype:'polygon',crs:S.workCRS,fields:[{name:'ID',type:'N'}],features:feats});
   S.activeId=__C.id;S.selFeat=null;S.undo=[];refreshUI();GeoMineRiparianAPP.open();
   return feats.reduce((t,f)=>t+f.geom.length,0);
  });
  assert.ok(n>100000,'mais de 100 mil vértices: '+n);
  await page.locator('#appRipScope').selectOption('visible');await page.locator('#appRipMode').selectOption('auto');
  await page.locator('#appRipStep').fill('5');await page.locator('#appRipRegime').selectOption('perene');await page.locator('#appRipContext').selectOption('general');
  await page.locator('#appRipConfirm').check();
  const t0=Date.now();await page.locator('#appRipGenerate').click();
  await page.waitForFunction(()=>!document.getElementById('appRipGenerate').disabled&&document.getElementById('appRipStatus').textContent,{},{timeout:600000});
  const st=await page.locator('#appRipStatus').textContent();
  assert.match(st,/^APP criada:/,st);assert.doesNotMatch(st,/SEM APP|LARGURA MÉDIA/,st);
  pass(`${n} vértices em 20 calhas: APP gerada em ${Math.round((Date.now()-t0)/1000)} s, sem recusa nem calha de fora`);

  const r=await page.evaluate(()=>{
   const APP=S.layers.find(l=>/^APP — Calhas densas/.test(l.name)),SEC=S.layers.find(l=>/^Seções de largura — Calhas densas/.test(l.name));
   const inRing=(p,r)=>{let d=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/((b[1]-a[1])||1e-12)+a[0])d=!d;}return d;};
   const polys=[];for(const f of APP.features){let cur=null;for(const r of f.geom){if(!cur||!inRing(r[0],cur[0])){cur=[r];polys.push(cur);}else cur.push(r);}}
   const inApp=p=>polys.some(rs=>inRing(p,rs[0])&&!rs.slice(1).some(h=>inRing(p,h)));
   const water=__C.features.map(f=>f.geom),inWater=p=>water.some(r=>inRing(p,r));
   let fora=0,dentroAgua=0,sobra=0,testes=0;
   for(const r of water){
    // margem superior: do 1º vértice ao último da escada; normal da margem diagonal (45°)
    const n=[-Math.SQRT1_2,Math.SQRT1_2];
    for(let k=50;k<1400;k+=150){const p=r[k],q=[p[0]+n[0]*29.5,p[1]+n[1]*29.5],ag=[p[0]+n[0]*-1,p[1]+n[1]*-1],longe=[p[0]+n[0]*30.45,p[1]+n[1]*30.45];
     testes++;if(!inApp(q))fora++;if(inWater(ag)&&inApp(ag))dentroAgua++;if(inApp(longe))sobra++;}
   }
   const per=water.reduce((t,r)=>{let s=0;for(let i=1;i<r.length;i++)s+=Math.hypot(r[i][0]-r[i-1][0],r[i][1]-r[i-1][1]);return t+s;},0);
   return {testes,fora,dentroAgua,sobra,gen:[...new Set(APP.features.map(f=>f.props.GEN_FAIXA_M))],classes:[...new Set(APP.features.map(f=>f.props.APP_CLASSES))],
    secoes:SEC.features.length,esperadas:Math.round(per/5),larguras:[...new Set(SEC.features.map(f=>Math.round(f.props.LARG_M)))]};
  });
  assert.ok(Math.abs(r.secoes-r.esperadas)<=20,`seções ${r.secoes} ≈ perímetro/5 ${r.esperadas}`);
  assert.deepEqual(r.classes,['30 m']);
  pass(`${r.secoes} seções a cada ~5 m do perímetro (não uma por aresta); classe única de 30 m`);
  assert.equal(r.fora,0,`pontos a 29,5 m fora da APP: ${r.fora}/${r.testes}`);assert.equal(r.dentroAgua,0);
  pass(`${r.testes} pontos a 29,5 m da margem real dentro da APP; nenhum ponto da água na APP`);
  /* 0,1 m é a tolerância normal; até 0,5 m só na 3ª tentativa de uma calha que a biblioteca recusou */
  assert.ok(r.gen.every(g=>g>0&&g<=0.5),JSON.stringify(r.gen));assert.ok(r.gen.filter(g=>g>0.1).length<=2,JSON.stringify(r.gen));
  assert.equal(r.sobra,0,'excesso além de 2 × desvio');
  pass(`generalização registrada (GEN_FAIXA_M ${r.gen.join(', ')} m) e excesso dentro de 2 × desvio`);

  assert.deepEqual(errors,[]);
  console.log(`OK ${passed} cenários`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
