// Offline isolated full-app regression: environmental commands stay unique.
// Optional BASELINE_DIST=/path/to/previous/GeoMine.html proves the old duplicate.
// BASELINE_ONLY=1 checks that old build without requiring a rebuilt current dist.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),shared='Preservação permanente',ids=['channel_mdt','app_riparia'];
function installer(file,CATS,open){
 const text=fs.readFileSync(path.join(root,'src/modules/environmental',file),'utf8');
 const start=text.indexOf('function install(){'),end=text.indexOf('\nif(typeof RIB_SVG',start);
 assert.ok(start>=0&&end>start,'installer extraction boundary');
 return vm.runInNewContext('('+text.slice(start,end).trim()+')',{CATS,open});
}
function checkInstallers(){
 for(const order of [[0,1],[1,0]])for(const preexisting of [false,true]){
  const untouched=()=>{},channelOpen=()=>{},appOpen=()=>{};
  const original={ic:'existing',nome:'Existing command',act:untouched};
  const groups=[{label:'Other tools',it:[original]}];
  if(preexisting)groups.push({label:shared,it:[{ic:'shared-existing',nome:'Shared existing',act:untouched}]},
   {label:'Customized tools',it:[{ic:ids[0],nome:'Extrair Calha MDT',act:channelOpen},{ic:ids[1],nome:'APP por calha',act:appOpen}]});
  const CATS=[{id:'ambiente',grupos:groups},{id:'unrelated',grupos:[{label:'Keep',it:[original]}]}];
  const before=groups.flatMap(g=>g.it),fns=[installer('channel-extraction.js',CATS,channelOpen),installer('riparian-app.js',CATS,appOpen)];
  for(let n=0;n<20;n++)for(const index of order)fns[index]();
  const commands=groups.flatMap(g=>g.it);
  for(const id of ids)assert.equal(commands.filter(i=>i.ic===id).length,1);
  assert.equal(groups.filter(g=>g.label===shared).length,1);
  assert.ok(before.every(i=>commands.includes(i)));assert.equal(groups.find(g=>g.label==='Other tools').it[0].act,untouched);
  assert.equal(CATS[1].grupos[0].it[0],original);
  assert.equal(commands.find(i=>i.ic===ids[0]).act,channelOpen);assert.equal(commands.find(i=>i.ic===ids[1]).act,appOpen);
 }
 console.log('PASS extracted installers: both module orders, 20 repeats, shared/custom groups and existing handler identities preserved');
}
async function runBuild(browser,html,baseline){
 const records=[];
 for(const mode of ['desktop','tablet']){
  const context=await browser.newContext({viewport:mode==='desktop'?{width:1440,height:950}:{width:1024,height:640},
   ...(mode==='tablet'?{hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14; SM-X610) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'}:{})});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+html);
  await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted&&window.GeoMineChannelExtraction&&window.GeoMineRiparianAPP);
  await page.locator('.ribcat[data-cat-id="ambiente"]').click();
  const before=await page.evaluate(()=>{
   window.__otherCommands=CATS.flatMap(c=>c.grupos.flatMap(g=>g.it.filter(i=>!['channel_mdt','app_riparia'].includes(i.ic)).map(i=>({c,g,i,act:i.act}))));
   window.__otherSummary=()=>CATS.map(c=>({id:c.id,groups:c.grupos.map(g=>({label:g.label,items:g.it.filter(i=>!['channel_mdt','app_riparia'].includes(i.ic)).map(i=>({ic:i.ic,nome:i.nome,sec:i.sec,secKey:i.secKey,soon:i.soon}))})).filter(g=>g.items.length)}));
   window.__environmentCounts=()=>{const c=CATS.find(c=>c.id==='ambiente');return {channel:c.grupos.flatMap(g=>g.it).filter(i=>i.ic==='channel_mdt').length,app:c.grupos.flatMap(g=>g.it).filter(i=>i.ic==='app_riparia').length,groups:c.grupos.filter(g=>g.label==='Preservação permanente').length};};
   return {counts:__environmentCounts(),others:__otherSummary()};
  });
  assert.deepEqual(before.counts,baseline?{channel:2,app:1,groups:2}:{channel:1,app:1,groups:1});
  const after=await page.evaluate(()=>{
   for(let n=0;n<20;n++)ribbonBuild();
   // Other installed modules legitimately recreate command objects/closures
   // during rebuild. Preserve their bindings by descriptor and function body;
   // strict object/handler identity is tested above for our two installers.
   return {counts:__environmentCounts(),others:__otherSummary(),handlersUnchanged:__otherCommands.every(({c,g,i,act})=>
    CATS.find(cat=>cat.id===c.id)?.grupos.filter(group=>group.label===g.label).some(group=>group.it.some(item=>
     item.ic===i.ic&&item.nome===i.nome&&String(item.act)===String(act))))};
  });
  assert.deepEqual(after.counts,before.counts);assert.deepEqual(after.others,before.others);assert.equal(after.handlersUnchanged,true);
  const channelButton=page.locator('#ribbon .rbtn').filter({hasText:/^Extrair Calha MDT$/});
  const appButton=page.locator('#ribbon .rbtn').filter({hasText:/^APP por calha$/});
  assert.equal(await channelButton.count(),baseline?2:1);
  assert.equal(await appButton.count(),1);
  assert.equal(await page.locator('#ribbon .glabel').filter({hasText:/^Preservação permanente$/}).count(),baseline?2:1);
  if(!baseline){
   await page.evaluate(()=>{
    S.setBase('Sem fundo');S.workCRS='EPSG:31982';
    const L=addLayer({name:'Smoke guide',gtype:'line',crs:S.workCRS,fields:[{name:'ID',type:'N'}],features:[{geom:[[500000,7400000],[500020,7400000]],props:{ID:1}}]});S.activeId=L.id;
   });
   await channelButton.click();
   await page.locator('#chanModal.on').waitFor({state:'visible'});
   assert.equal(await page.locator('#chanLayer option').count(),1);await page.locator('#chanClose').click();
   await appButton.click();
   await page.locator('#appRipModal.on').waitFor({state:'visible'});
   assert.equal(await page.locator('#appRipLayer option').count(),1);await page.locator('#appRipClose').click();
   assert.equal(await channelButton.count(),1);
   assert.equal(await appButton.count(),1);
  }
  assert.deepEqual(errors,[]);records.push({mode,...after});
  console.log('PASS '+(baseline?'baseline duplicate reproduced':'patched unique commands and modal clicks')+' '+mode+': '+JSON.stringify(after.counts)+' after 20 ribbonBuild; '+before.others.reduce((sum,c)=>sum+c.groups.reduce((n,g)=>n+g.items.length,0),0)+' other commands preserved');
  await context.close();
 }
 return records;
}
(async()=>{
 if(!process.env.BASELINE_ONLY)checkInstallers();
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const baseline=process.env.BASELINE_DIST?await runBuild(browser,path.resolve(process.env.BASELINE_DIST),true):null;
  if(!process.env.BASELINE_ONLY){
   const current=await runBuild(browser,path.join(root,'dist/GeoMine.html'),false);
   if(baseline)for(let i=0;i<current.length;i++)assert.deepEqual(current[i].others,baseline[i].others,'patch must preserve every unrelated command/group across builds');
  }else assert.ok(baseline,'BASELINE_ONLY requires BASELINE_DIST');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
