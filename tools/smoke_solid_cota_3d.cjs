// Sólidos no 3D sem depender do MDT ligado e volume a partir de uma cota.
// Navegador isolado e superfícies sintéticas; nenhum projeto do usuário.
// PLAYWRIGHT_MODULE, CHROME_PATH e APP_PATH permitem rodar fora do macOS.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stage=path.resolve(__dirname,'..');let passed=0;
const pass=name=>{passed++;console.log('PASS '+name);};
const near=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,(msg||'')+': '+a+' ≠ '+b+' ±'+tol);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route(/^https?:/,r=>r.abort());
  await page.goto(pathToFileURL(path.resolve(process.env.APP_PATH||path.join(stage,'dist/GeoMine.html'))).href);
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted,null,{timeout:60000});
  await page.evaluate(()=>{
   S.setBase('Sem fundo');S.workCRS='EPSG:31982';
   // Fundo plano em 100 m sobre 100 × 60 m; o topo sobe de 100 a 110 m para leste (cunha).
   const grade=(nome,id,xll,yll,nc,nr,f)=>{const z=new Float32Array(nc*nr);let zmin=Infinity,zmax=-Infinity;
    for(let r=0;r<nr;r++)for(let c=0;c<nc;c++){const v=f(c+.5,nr-r-.5);z[r*nc+c]=v;if(v<zmin)zmin=v;if(v>zmax)zmax=v;}
    const R={id,name:nome,crs:S.workCRS,visible:true,style:{mode:'hipso'},d:{nc,nr,cs:1,csy:1,xll,yll,z,zmin,zmax,native:true,resampled:1,srcCRS:S.workCRS}};S.rasters.push(R);return R;};
   window.__topo=grade('Topo em cunha',8101,500000,7400000,100,60,u=>100+.1*u);
   window.__base=grade('Base plana',8102,500000,7400000,100,60,()=>100);
   // um MDT maior, deslocado, primeiro na lista: é ele que define a origem da cena
   window.__mdt=grade('MDT regional',8103,499700,7399800,400,400,()=>95);
   S.rasters.sort((a,b)=>(b.id===8103)-(a.id===8103));
   window.__real=()=>{const s=S.solidos.find(s=>s.nome===__nome),g=s._grp;g.updateMatrixWorld(true);const c=new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
    const ndc=c.clone().project(V3.cam);return {E:+(c.x+V3.OX).toFixed(3),N:+(V3.OY-c.z).toFixed(3),Z:+(c.y/(V3.VE||1)+V3.z0).toFixed(3),naTela:Math.abs(ndc.x)<=1&&Math.abs(ndc.y)<=1&&ndc.z<1,naCena:g.parent===V3.scene,visivel:g.visible};};
  });
  const tab=page.getByText('Visão 3D',{exact:true}).first();if(await tab.isVisible().catch(()=>false))await tab.click();else await page.evaluate(()=>switchView('v3d'));
  await page.waitForFunction(()=>V3&&V3.scene&&V3.meshes&&V3.meshes.length===3,null,{timeout:120000});
  const gen=await page.evaluate(async()=>{
   S._cubRest=[{tipo:'entre',a:__topo.id,b:__base.id,lim:'',zmin:null,zmax:null}];
   document.getElementById('cubSolModo').value='liso';document.getElementById('cubSolRes').value='2';
   await cubRenderSolido();const s=S.solidos.at(-1);window.__nome=s.nome;return {nome:s.nome,vol:s.volume,origem:s._grp.userData.ccmOrigin};
  });
  assert.ok(gen.origem&&Number.isFinite(gen.origem.OX),'o sólido registra a origem com que foi montado');
  const ref=await page.evaluate(()=>__real());assert.ok(ref.naTela&&ref.visivel);
  near(ref.E,500050,1.5,'centro E');near(ref.N,7400030,1.5,'centro N');
  // 1) desligar o MDT que define a origem: o sólido fica no mesmo lugar real
  const semMdt=await page.evaluate(async()=>{__mdt.visible=false;refreshUI();await build3D();return {...__real(),origem:[V3.OX,V3.OY]};});
  assert.notDeepEqual(semMdt.origem,[gen.origem.OX,gen.origem.OY],'a origem da cena mudou');
  for(const k of ['E','N','Z'])near(semMdt[k],ref[k],1e-3,'sem MDT '+k);assert.ok(semMdt.naTela);
  // 2) nenhuma superfície ligada: a cena é montada com o sólido
  const sem=await page.evaluate(async()=>{S.rasters.forEach(r=>r.visible=false);refreshUI();await build3D();return {...__real(),meshes:V3.meshes.length,info:document.getElementById('v3dOut').textContent};});
  assert.equal(sem.meshes,0);for(const k of ['E','N','Z'])near(sem[k],ref[k],1e-3,'sem superfícies '+k);
  assert.ok(sem.naCena&&sem.visivel&&sem.naTela,'o sólido aparece sem superfícies');assert.match(sem.info,/1 sólido/);
  // 3) exagero vertical ao vivo: continua na mesma cota real
  const ve=await page.evaluate(()=>{v3SetVE(3);return {...__real(),ve:V3.VE};});assert.equal(ve.ve,3);for(const k of ['E','N','Z'])near(ve[k],ref[k],1e-3,'exagero '+k);
  await page.evaluate(async()=>{v3SetVE(1);S.rasters.forEach(r=>r.visible=true);refreshUI();await build3D();});
  const volta=await page.evaluate(()=>__real());for(const k of ['E','N','Z'])near(volta[k],ref[k],1e-3,'de volta '+k);
  pass('sólido fica nas mesmas coordenadas reais ao desligar o MDT, sem superfícies e com exagero vertical');

  // volume a partir de uma cota — cunha: abaixo de 105 m é 3/4 do total
  const cunha=await page.evaluate(()=>{const s=S.solidos.find(s=>s.nome===__nome);return [95,100,105,110,115].map(c=>({c,...solVolumePorCota(s,c)}));});
  const tot=cunha[0].total;assert.ok(tot>0);near(tot,gen.vol,gen.vol*.01,'total da casca ≈ volume registrado');
  near(cunha[0].abaixo,0,1e-6,'abaixo da base');near(cunha[1].abaixo,0,1e-6,'abaixo de 100');
  near(cunha[2].abaixo/tot,.75,.01,'abaixo de 105 = 3/4 da cunha');near(cunha[3].abaixo,tot,1e-6,'abaixo do topo');near(cunha[4].acima,0,1e-6,'acima do topo');
  for(const r of cunha)near(r.acima+r.abaixo,r.total,1e-6,'acima + abaixo');
  pass('volume por cota na casca do sólido: 0, 3/4 e total nos limites, acima + abaixo = total');

  // sólido fechado calculado fora do 3D (como o DCE): ganha objeto próprio e volume exato
  const caixa=await page.evaluate(()=>{
   const s=solRegistra(null,{nome:'Caixa fechada QA',modo:'projecoes-taludes',origem:'qa-caixa',zmin:100,zmax:110,dom:{x0:500010,y0:7400010,x1:500030,y1:7400020}});
   const x0=500010,x1=500030,y0=7400010,y1=7400020,P=[[x0,y0,110],[x1,y0,110],[x1,y1,110],[x0,y1,110],[x0,y0,100],[x1,y0,100],[x1,y1,100],[x0,y1,100]];
   s.mesh={positions:Float64Array.from(P.flat()),indices:Uint32Array.from([0,1,2,0,2,3, 4,6,5,4,7,6, 0,4,5,0,5,1, 1,5,6,1,6,2, 2,6,7,2,7,3, 3,7,4,3,4,0])};
   const criou=solGarantaGrupo(s);solPosiciona(s);const g=s._grp;g.updateMatrixWorld(true);
   const c=new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
   return {criou,naCena:g.parent===V3.scene,E:c.x+V3.OX,N:V3.OY-c.z,Z:c.y/V3.VE+V3.z0,v104:solVolumePorCota(s,104),ext:solExtensao()};
  });
  assert.ok(caixa.criou&&caixa.naCena);near(caixa.E,500020,1e-3);near(caixa.N,7400015,1e-3);near(caixa.Z,105,1e-3);
  near(caixa.v104.total,2000,1e-6,'caixa total');near(caixa.v104.abaixo,800,1e-6,'caixa abaixo de 104');near(caixa.v104.acima,1200,1e-6,'caixa acima de 104');
  pass('sólido fechado sem objeto 3D (DCE) ganha geometria própria na posição real, volume por cota exato');

  const exatos=await page.evaluate(()=>({
   colunas:solVolumePorCota({colunas:{area:4,zt:Float32Array.of(110,108),zb:Float32Array.of(100,104)}},105),
   blocos:solVolumePorCota({_blocos:[{x:0,y:0,z:105,dx:2,dy:3,dz:10},{x:5,y:0,z:95,dx:2,dy:2,dz:2}]},103)}));
  near(exatos.colunas.total,56,1e-6);near(exatos.colunas.abaixo,24,1e-6);near(exatos.blocos.total,68,1e-6);near(exatos.blocos.abaixo,26,1e-6);
  pass('colunas (sólidos extraídos) e blocos: volume por cota exato');

  // propriedades do sólido: campo de cota e resultado
  await page.evaluate(()=>solProps(S.solidos.find(s=>s.nome===__nome)));
  await page.locator('#solCota').fill('105');await page.locator('#solCotaCalc').click();
  const txt=await page.locator('#solCotaOut').textContent();
  assert.match(txt,/Acima de 105,00 m/);assert.match(txt,/Abaixo de 105,00 m/);assert.match(txt,/\(75,0%\)|\(74,\d%\)|\(75,\d%\)/);
  assert.equal(await page.evaluate(()=>S.solidos.find(s=>s.nome===__nome).cotaCorte),105);
  if(process.env.QA_CAPTURE_DIR)await page.locator('#solModal .modal').screenshot({path:path.join(process.env.QA_CAPTURE_DIR,'solid-cota-props.png')});
  pass('propriedades do sólido: volume a partir de uma cota com acima/abaixo e percentuais');

  // gravação no projeto: blocos e sólido extraído também, depois salvar → abrir
  await page.evaluate(async()=>{
   document.getElementById('solModal')?.classList.remove('on');
   const blocos=[];for(let i=0;i<4;i++)for(let j=0;j<3;j++)blocos.push({x:500062+i*4,y:7400042+j*4,z:102+j,dx:4,dy:4,dz:2,attr:j});
   S._cub={blocos,dom:{x0:500060,y0:7400040,x1:500076,y1:7400052},zmn:101,zmx:105,totalBlocks:blocos.length,vol:blocos.length*32};
   document.getElementById('cubClip').value='100';await cubRenderBlocos();
   const G={x0:500080,y0:7400005,cel:2,nc:3,nr:2},ZT=Float32Array.of(108,109,107,0,106,0),ZB=Float32Array.of(100,100,100,0,101,0);
   const grp=tinObjetoMesh({cels:[0,1,2,4]},G,ZT,ZB,'#e0704a');V3.scene.add(grp);
   const s=solRegistra(grp,{modo:'objeto',origem:'extração:qa:1',nome:'Objeto QA',volume:4*(8+9+7+5),zmin:100,zmax:109});
   s.colunas={area:4,zt:Float32Array.from([0,1,2,4],k=>ZT[k]),zb:Float32Array.from([0,1,2,4],k=>ZB[k])};
   const cunha=S.solidos.find(s=>s.nome===__nome);cunha.cor='#3388cc';cunha.opa=.6;cunha.densidade=1.8;
  });
  const antes=await page.evaluate(()=>{const r={};for(const s of S.solidos)r[s.nome]={v:s.volume,c:s.cotaCorte??null,cor:s.cor,opa:s.opa,dens:s.densidade??null,vc:solVolumePorCota(s,104.5)};return r;});
  assert.equal(Object.keys(antes).length,4,'cunha, caixa fechada, blocos e objeto extraído');
  const ida=await page.evaluate(()=>{const d=JSON.parse(JSON.stringify(projectData()));window.__arquivo=d;return {n:(d.solidos||[]).length,tam:JSON.stringify(d.solidos).length,
   tipos:d.solidos.map(s=>s.geo&&s.geo.partes.map(p=>p.t).join('+')+(s.geo.casca?' casca':'')+(s.geo.colunas?' colunas':'')+(s.geo.blocos?' modelo':''))};});
  assert.equal(ida.n,4);assert.ok(ida.tam<2e6,'geometria compacta: '+ida.tam+' bytes');
  assert.ok(ida.tipos.some(t=>/casca/.test(t))&&ida.tipos.some(t=>/blocos/.test(t)&&/modelo/.test(t))&&ida.tipos.some(t=>/colunas/.test(t)),JSON.stringify(ida.tipos));
  // abrir o arquivo num estado limpo (o projeto anterior sai)
  const volta2=await page.evaluate(async()=>{
   loadProject(JSON.parse(JSON.stringify(__arquivo)));
   const sem3D=S.solidos.map(s=>({nome:s.nome,grp:!!s._grp,vc:solVolumePorCota(s,104.5)}));
   await build3D();
   const r={};for(const s of S.solidos)r[s.nome]={v:s.volume,c:s.cotaCorte??null,cor:s.cor,opa:s.opa,dens:s.densidade??null,vc:solVolumePorCota(s,104.5),grp:!!s._grp,naCena:!!(s._grp&&s._grp.parent===V3.scene)};
   const novo=S.solidos.find(s=>s.nome===__nome);__nome=novo.nome;
   const d2=JSON.parse(JSON.stringify(projectData()));
   return {sem3D,r,real:__real(),igual:JSON.stringify(d2.solidos)===JSON.stringify(__arquivo.solidos),seq:S._solSeq,ids:S.solidos.map(s=>s.id)};
  });
  for(const t of volta2.sem3D)assert.ok(t.vc&&t.vc.total>0,'volume por cota sem abrir o 3D: '+t.nome);
  for(const [nome,a] of Object.entries(antes)){const b=volta2.r[nome];assert.ok(b,'sólido restaurado: '+nome);
   assert.equal(b.v,a.v);assert.equal(b.c,a.c);assert.equal(b.cor,a.cor);assert.equal(b.opa,a.opa);assert.equal(b.dens,a.dens);
   assert.ok(b.grp&&b.naCena,'na cena 3D: '+nome);near(b.vc.total,a.vc.total,Math.max(1e-3,a.vc.total*1e-6),'total '+nome);near(b.vc.abaixo,a.vc.abaixo,Math.max(1e-3,a.vc.abaixo*1e-6),'abaixo '+nome);}
  for(const k of ['E','N','Z'])near(volta2.real[k],ref[k],2e-3,'posição real após abrir '+k);
  assert.ok(volta2.igual,'salvar de novo sem mexer grava a mesma geometria');
  assert.ok(volta2.seq>=Math.max(...volta2.ids.map(i=>+String(i).replace('sol',''))),'novos sólidos não repetem id');
  const limpo=await page.evaluate(()=>{loadProject({app:'ALAGIS',v:1,workCRS:'EPSG:31982',layers:[],rasters:[]});return (S.solidos||[]).length;});
  assert.equal(limpo,0,'abrir outro projeto tira os sólidos do anterior');
  pass('sólidos gravados no projeto: cunha, casca fechada, blocos e extraído voltam com propriedades, volume por cota e posição real');

  assert.deepEqual(errors,[]);console.log('solid 3D/cota browser: '+passed+'/6 PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
