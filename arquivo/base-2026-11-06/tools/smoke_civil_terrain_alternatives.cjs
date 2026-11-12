const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});try{
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.route(/^https?:/,r=>r.abort());
await page.goto(pathToFileURL(path.resolve(process.env.APP_PATH||'dist/GeoMine.html')).href);await page.waitForFunction(()=>window.GeoMineSessionAutosave?.state.booted);
const terrain=await page.evaluate(async()=>{
 window.qaA=[500100,7000500];window.qaB=[501100,7000500];
 window.qaP={civW:8,civG:8,civDz:2,civCrit:'terra',civRaioMin:60,civAngC:60,civAngA:34,civH:8,civBerma:3,civPasso:2,civMaxOff:200,civMdtSel:'991'};
 window.qaG={nc:300,nr:250,cs:4,csy:4,xll:500000,yll:7000000,z:new Float32Array(75000)};
 for(let r=0;r<qaG.nr;r++)for(let c=0;c<qaG.nc;c++){const x=(c+.5)*4,y=(qaG.nr-r-.5)*4;qaG.z[r*qaG.nc+c]=100+85*Math.exp(-Math.pow((x-600)/140,2)-Math.pow((y-500)/180,2));}
 let ticks=0;const timer=setInterval(()=>ticks++,10);
 window.qaResult=await GeoMineRoadAlternatives.search(qaG,qaA,qaB,qaP);clearInterval(timer);
 const straight=[{x:qaA[0],y:qaA[1],z:civSample(qaG,...qaA)},{x:qaB[0],y:qaB[1],z:civSample(qaG,...qaB)}];
 const opt={W:8,grade:8,angCorte:60,angAterro:34,H:8,berma:3,passo:2,maxOff:200};
 const direct=GeoMineCorridor.volumes(await GeoMineCorridor.calculate(qaG,GeoMineCorridor.stations(straight,5),opt));
 return {ticks,direct,options:qaResult.options.map(q=>({total:q.total,vol:q.volumes.total,missing:q.volumes.missing,grade:q.grade,radius:q.radius,
   start:q.axis[0],end:q.axis.at(-1),offset:Math.max(...q.axis.map(p=>Math.abs(p.y-qaA[1]))),finite:q.axis.every(p=>[p.x,p.y,p.z].every(Number.isFinite))})),separation:qaResult.options.map((q,i)=>qaResult.options.slice(i+1).map(b=>GeoMineRoadAlternatives.separation(q,b))).flat()};
});
assert.equal(terrain.options.length,3);assert.ok(terrain.ticks>20);assert.equal(terrain.direct.missing,0);assert.ok(terrain.options[0].vol<terrain.direct.total*.5);
terrain.options.forEach((q,i)=>{assert.equal(q.missing,0);assert.ok(q.grade<=8);assert.equal(q.radius,60);assert.ok(q.offset>100);assert.equal(q.finite,true);assert.ok(Math.abs(q.start.x-500100)<1e-6&&Math.abs(q.end.x-501100)<1e-6);if(i)assert.ok(q.vol>=terrain.options[i-1].vol);});assert.ok(terrain.separation.every(d=>d>=8));
console.log('PASS ridge detours, three distinct routes, endpoints, radius, grades and earthwork ranking',JSON.stringify({direct:terrain.direct.total,options:terrain.options.map(q=>q.vol)}));
const ui=await page.evaluate(async()=>{
 S.setBase('Sem fundo');S.workCRS='EPSG:31982';GeoMineCivil.reset();S.rasters=[{id:991,name:'MDT synthetic ridge',d:qaG,visible:false}];refreshCivilMdt();
 const C=GeoMineCivil.current();C.A=qaA.slice();C.B=qaB.slice();for(const [id,v] of Object.entries(qaP))document.getElementById(id).value=v;
 await civAlinha();window.qaRoad=C;
 const before={count:C.alternatives.options.length,axis:!!C.eixo?.length,buttons:document.querySelectorAll('[data-road-option]').length,nextHidden:document.getElementById('civNextSteps').hidden};
 const saved=GeoMineCivil.snapshot();GeoMineCivil.restore(saved);const restored=GeoMineCivil.current();
 const count=restored.alternatives.options.length;
 document.getElementById('civG').value='9';GeoMineRoadAlternatives.apply(restored,0);const staleBlocked=!restored.eixo?.length;
 document.getElementById('civG').value='8';GeoMineRoadAlternatives.apply(restored,1);
 const selected={index:restored.selectedAlternative,axis:restored.eixo.length,confirmed:restored.alignmentConfirmed,nextHidden:document.getElementById('civNextSteps').hidden,corridorHidden:document.getElementById('civCorridorStage').hidden};
 GeoMineRoadEditor.close();document.getElementById('civConfirmAlignment').click();
 return {before,count,staleBlocked,selected,confirmed:restored.alignmentConfirmed,corridorHidden:document.getElementById('civCorridorStage').hidden};
});
assert.deepEqual(ui.before,{count:3,axis:false,buttons:3,nextHidden:true});assert.equal(ui.count,3);assert.equal(ui.staleBlocked,true);assert.equal(ui.selected.index,1);assert.ok(ui.selected.axis>2);assert.equal(ui.selected.confirmed,false);assert.equal(ui.selected.nextHidden,false);assert.equal(ui.selected.corridorHidden,true);assert.equal(ui.confirmed,true);assert.equal(ui.corridorHidden,false);
console.log('PASS generate -> three choices -> select -> profile -> confirm -> corridor, persistence and stale parameter protection');
const flat=await page.evaluate(async()=>{const g={...qaG,z:new Float32Array(qaG.z.length).fill(100)},r=await GeoMineRoadAlternatives.search(g,qaA,qaB,qaP);return r.options.map(q=>({vol:q.volumes.total,length:q.total}));});
assert.equal(flat.length,3);assert.ok(flat.every(q=>q.vol<1e-5));assert.ok(Math.abs(flat[0].length-1000)<1e-5);console.log('PASS flat terrain retains straight route as one valid zero-earthwork alternative');
const absent=await page.evaluate(async()=>{const g={...qaG,z:qaG.z.slice()};for(let r=0;r<g.nr;r++)for(let c=145;c<155;c++)g.z[r*g.nc+c]=NaN;const result=await GeoMineRoadAlternatives.search(g,qaA,qaB,qaP);let checks=0,cancelled=false;try{await GeoMineRoadAlternatives.search(qaG,qaA,qaB,qaP,()=>{if(++checks===10)throw Error('cancelled');});}catch(e){cancelled=e.message==='cancelled';}return {count:result.options.length,cancelled};});
assert.equal(absent.count,0);assert.equal(absent.cancelled,true);assert.deepEqual(errors,[]);console.log('PASS missing terrain never becomes a preferred zero-volume route; cancellation works');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
