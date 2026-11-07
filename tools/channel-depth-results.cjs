/* Generate auditable STATIC scientific plots from the frozen production engine.
   Writes only resultados/: no app source, dist or public mutations. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('/Users/filipeciscato/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stage=path.resolve(__dirname,'..'),output=path.join(stage,'resultados');
const pageWidth=1600,pageHeight=1140;
const fixture=process.env.GEOMINE_CHANNEL_REAL_PROFILES||path.resolve(stage,'../GeoMine-channel-guide-20260929-kcF5Pl/diagnostic-profiles.json');
const enginePath=path.join(stage,'src/modules/environmental/channel-extraction-engine.js'),source=fs.readFileSync(enginePath,'utf8');
const sha=crypto.createHash('sha256').update(source).digest('hex');
assert.equal(sha,'7764eb12881831110d8ecb4cf59f0c27cefc22358484eae78bde87cd26a1bbed','engine freeze changed: review plots before accepting a new engine');
const sandbox={window:{}};vm.runInNewContext(source,sandbox);const api=sandbox.window.GeoMineChannelEngine.engine();
const data=JSON.parse(fs.readFileSync(fixture,'utf8')),run=data.runs.find(r=>r.reachPerSide===20),inputBefore=JSON.stringify(run);
assert.ok(run);assert.equal(run.resolution,1);assert.equal(run.layout.sections.length,47);
const automatic=api.analyze(run.layout,run.heights,{mode:'auto',resolution:run.resolution});
const depth=api.analyze(run.layout,run.heights,{mode:'depth',height:.5,resolution:run.resolution});
assert.equal(JSON.stringify(run),inputBefore);assert.equal(automatic.sections.length,47);assert.equal(depth.sections.length,47);
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
for(const s of depth.sections){near(s.level-s.zFloor,.5);near(s.effectiveHeight,.5);assert.equal(s.detection,null);assert.ok(s.width>=2);}
near(automatic.sections[28].width,6.235066142341952);near(depth.sections[28].width,2.8083631711901305);
const synPlan=api.plan([[0,0],[40,0]],{interval:10,lateralStep:.25,reach:10});
const synZ=synPlan.sections.map(s=>s.points.map(([x,y])=>100+.1*x+Math.abs(y)));
let rejected;try{api.analyze(synPlan,synZ,{mode:'auto',resolution:.5});assert.fail('V must not have an invented bank break');}catch(e){assert.equal(e.code,'CHANNEL_REACH_BREAK');rejected={code:e.code,message:e.message};}
const synthetic=api.analyze(synPlan,synZ,{mode:'depth',height:2.5,resolution:.5});
for(const s of synthetic.sections){near(s.width,5);near(s.zFloor,100+.1*s.station);near(s.level,102.5+.1*s.station);near(s.effectiveHeight,2.5);}
const fmt=(v,d=2)=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const C={auto:'#2563b6',depth:'#078c82',floor:'#985330',guide:'#677484',terrain:'#253a4d',grid:'#dce4e9',orange:'#ce7c14',red:'#b44638'};
const range=(a)=>[Math.min(...a),Math.max(...a)];
function area(ring){const o=ring[0];let n=0;for(let i=1;i<ring.length;i++)n+=(ring[i-1][0]-o[0])*(ring[i][1]-o[1])-(ring[i][0]-o[0])*(ring[i-1][1]-o[1]);return Math.abs(n)/2;}
function metrics(r){return {mode:r.mode,sections:r.sections.length,ringVertices:r.ring.length,width:range(r.sections.map(s=>s.width)),floor:range(r.sections.map(s=>s.zFloor)),level:range(r.sections.map(s=>s.level)),effectiveHeight:range(r.sections.map(s=>s.effectiveHeight)),areaM2:area(r.ring)};}
const metricsAuto=metrics(automatic),metricsDepth=metrics(depth);
const provenance='Amostras do projeto anterior — teste, não é o novo eixo da foto';
const disclaimer='Estimativa topográfica; não simulação hidráulica';
const svg=(w,h,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">${body}</svg>`;
const line=(x1,y1,x2,y2,color,width=2,dash='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
const text=(x,y,s,size=17,color=C.terrain,anchor='start',weight=400)=>`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(s)}</text>`;
const pathLine=(points,color,width=3,dash='',fill='none')=>`<path d="${points.map((p,i)=>(i?'L':'M')+p.map(v=>v.toFixed(3)).join(',')).join(' ')}" fill="${fill}" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
const circle=(x,y,r,color,stroke='#fff')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" stroke="${stroke}" stroke-width="1.7"/>`;
const legend=(name,color,dash=false)=>`<span class="legend"><i style="--key:${color};${dash?'border-top-style:dashed;':''}"></i>${name}</span>`;
function header(title,sub,syntheticPage=false){return `<header><div class="eyebrow">GEOMINE · VERIFICAÇÃO DO MOTOR</div><h1>${title}</h1><p>${sub}</p></header><div class="provenance ${syntheticPage?'synthetic':''}">${syntheticPage?'Teste controlado com terreno sintético — não representa nenhum eixo da foto':provenance}</div>`;}
function footer(n){return `<footer><b>${disclaimer}</b><span>${n} / 3 · Motor ${sha.slice(0,12)} · resultados de teste</span></footer>`;}
function planPlot(result,color){
  const w=716,h=568,pad=40,all=[...automatic.ring,...depth.ring,...data.axis.line],xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
  const xmin=Math.min(...xs)-13,xmax=Math.max(...xs)+13,ymin=Math.min(...ys)-8,ymax=Math.max(...ys)+8;
  const scale=Math.min((w-2*pad)/(xmax-xmin),(h-2*pad)/(ymax-ymin));
  const tx=(w-(xmax-xmin)*scale)/2,ty=(h-(ymax-ymin)*scale)/2;
  const xy=p=>[tx+(p[0]-xmin)*scale,h-ty-(p[1]-ymin)*scale];
  let body=`<rect width="${w}" height="${h}" fill="#f8fbfc"/>`;
  for(let y=Math.ceil(ymin/20)*20;y<ymax;y+=20){const py=xy([xmin,y])[1];body+=line(28,py,w-28,py,C.grid,1);body+=text(38,py-8,'N '+fmt(y,0),13,'#8a98a4');}
  const farLeft=run.layout.sections.map(s=>s.points.at(-1)),farRight=run.layout.sections.map(s=>s.points[0]);
  body+=pathLine(farLeft.map(xy),'#d0dae1',1.2,'4 4')+pathLine(farRight.map(xy),'#d0dae1',1.2,'4 4');
  const ring=result.ring.map(xy);body+=pathLine(ring,color,1.7,'',color+'38');
  for(let i=0;i<result.sections.length;i+=3){const s=result.sections[i];body+=pathLine([s.right,s.left].map(xy),color,1.1);}
  body+=pathLine(data.axis.line.map(xy),C.guide,2,'6 5');
  body+=pathLine(result.sections.map(s=>s.floorPoint).map(xy),C.floor,1.8);
  for(const i of [0,28,31]){
    const s=result.sections[i],a=xy(s.right),b=xy(s.left),p=xy(s.floorPoint),side=i===28?-1:1,labelX=p[0]+side*100;
    body+=line(a[0],a[1],b[0],b[1],C.orange,3)+circle(p[0],p[1],4.5,C.floor);
    body+=line(p[0]+side*6,p[1],labelX-side*6,p[1],C.orange,1.4);
    body+=text(labelX,p[1]+6,'S'+(i+1),19,C.orange,side<0?'end':'start',700);
  }
  const start=xy(data.axis.line[0]),end=xy(data.axis.line.at(-1));
  body+=text(start[0]+34,start[1]+26,'Início · 0 m',15,C.guide);
  body+=text(end[0]+28,end[1]-12,'Fim · '+fmt(run.layout.length,1)+' m',15,C.guide);
  body+=line(w-68,83,w-68,37,C.terrain,2)+`<path d="M${w-75},48 L${w-68},32 L${w-61},48" fill="none" stroke="${C.terrain}" stroke-width="2"/>`+text(w-68,24,'N',18,C.terrain,'middle',700);
  body+=line(42,h-27,42+20*scale,h-27,C.terrain,3)+line(42,h-32,42,h-22,C.terrain,2)+line(42+20*scale,h-32,42+20*scale,h-22,C.terrain,2)+text(42+10*scale,h-40,'20 m',15,C.terrain,'middle');
  body+=text(w-36,h-24,'Planta norte para cima · UTM 22S',14,'#75818d','end');
  return svg(w,h,body);
}
function profilePlot(autoSection,depthSection,index,w=466,h=270,{offsetMin=-10,offsetMax=10}={}){
  const pts=autoSection.profile.filter(p=>p.offset>=offsetMin&&p.offset<=offsetMax&&Number.isFinite(p.z));
  const [min,max]=range(pts.map(p=>p.z)),ymin=Math.floor((min-.18)*2)/2,ymax=Math.ceil((max+.18)*2)/2;
  const pad={l:52,r:15,t:18,b:42},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b,x=d=>pad.l+(d-offsetMin)/(offsetMax-offsetMin)*pw,y=z=>pad.t+(ymax-z)/(ymax-ymin)*ph;
  let body='';for(let i=0;i<=4;i++){const z=ymin+(ymax-ymin)*i/4,py=y(z);body+=line(pad.l,py,w-pad.r,py,C.grid,1)+text(pad.l-9,py+5,fmt(z,1),13,'#788691','end');}
  for(let i=0;i<=4;i++){const d=offsetMin+(offsetMax-offsetMin)*i/4,px=x(d);body+=line(px,pad.t,px,h-pad.b,C.grid,1)+text(px,h-pad.b+24,fmt(d,0),14,'#788691','middle');}
  body+=line(x(0),pad.t,x(0),h-pad.b,C.guide,1.6,'5 4');
  body+=pathLine(pts.map(p=>[x(p.offset),y(p.z)]),C.terrain,2.7);
  for(const [s,color]of[[autoSection,C.auto],[depthSection,C.depth]]){
    body+=line(x(s.rightOffset),y(s.level),x(s.leftOffset),y(s.level),color,3.2);
    body+=circle(x(s.rightOffset),y(s.level),4,color)+circle(x(s.leftOffset),y(s.level),4,color);
  }
  body+=circle(x(autoSection.floorOffset),y(autoSection.zFloor),4.5,C.floor);
  body+=text(w/2,h-2,'Distância à guia (m); 0 = guia original',13,'#6d7e89','middle');
  return svg(w,h,body);
}
function longitudinal(autoResult,depthResult,w=1462,h=295,{syntheticOnly=false}={}){
  const sections=depthResult.sections,length=sections.at(-1).station,maxs=[...sections.map(s=>s.level),...autoResult.sections.map(s=>s.level),...sections.map(s=>s.zAxis)],mins=sections.map(s=>s.zFloor),ymin=Math.floor(Math.min(...mins)-.15),ymax=Math.ceil(Math.max(...maxs)+.15);
  const pad={l:67,r:24,t:20,b:47},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b,x=d=>pad.l+d/length*pw,y=z=>pad.t+(ymax-z)/(ymax-ymin)*ph;
  let body='';for(let z=ymin;z<=ymax;z++){const py=y(z);body+=line(pad.l,py,w-pad.r,py,C.grid,1)+text(pad.l-12,py+5,fmt(z,0),15,'#738390','end');}
  for(let i=0;i<=5;i++){const s=length*i/5,px=x(s);body+=line(px,pad.t,px,h-pad.b,C.grid,1)+text(px,h-pad.b+26,fmt(s,0),15,'#738390','middle');}
  body+=pathLine(sections.map(s=>[x(s.station),y(s.zAxis)]),C.guide,1.5,'5 5');
  body+=pathLine(sections.map(s=>[x(s.station),y(s.zFloor)]),C.floor,2.7);
  if(!syntheticOnly)body+=pathLine(autoResult.sections.map(s=>[x(s.station),y(s.level)]),C.auto,2.8);
  body+=pathLine(sections.map(s=>[x(s.station),y(s.level)]),C.depth,3);
  if(syntheticOnly){for(const s of sections){body+=circle(x(s.station),y(s.level),4,C.depth)+circle(x(s.station),y(s.zFloor),4,C.floor);}const s=sections[3],px=x(s.station)+15;body+=line(px,y(s.zFloor),px,y(s.level),C.depth,1.6)+text(px+13,(y(s.zFloor)+y(s.level))/2+5,'2,50 m',18,C.depth);}
  body+=text(pad.l,14,'Cota (m)',15,'#647685');body+=text(w/2,h-3,'Distância ao longo da guia (m)',15,'#647685','middle');
  return svg(w,h,body);
}
function stats(m){return `<div class="stats"><div><span>Seções válidas</span><b>${m.sections} / 47</b></div><div><span>Largura estimada</span><b>${fmt(m.width[0])}–${fmt(m.width[1])} m</b></div><div><span>Área do polígono</span><b>${fmt(m.areaM2,1)} m²</b></div></div>`;}
const sharedLegend=`${legend('Guia original',C.guide,true)}${legend('Fundo encontrado',C.floor)}${legend('Automático',C.auto)}${legend('Profundidade informada',C.depth)}`;
const page1=`<section class="page" id="planta">${header('Duas leituras do mesmo terreno','Comparação em planta · 47 seções · MDT nativo de 1 m · busca de 20 m por lado')}<div class="legendbar">${sharedLegend}</div><div class="maprow"><article class="card"><h2><span class="dot auto"></span>Automático: margens pelo relevo</h2><p>Quebras de declividade · nível local variável</p>${planPlot(automatic,C.auto)}${stats(metricsAuto)}</article><article class="card"><h2><span class="dot depth"></span>Profundidade informada: 0,50 m (teste)</h2><p>Nível = fundo de cada seção + 0,50 m</p>${planPlot(depth,C.depth)}${stats(metricsDepth)}</article></div><div class="note">As linhas pontilhadas externas indicam a faixa pesquisada, não a margem. S1, S29 e S32 são detalhadas na próxima imagem. Mesma escala nas duas plantas.</div>${footer(1)}</section>`;
const cards=[0,28,31].map(i=>{const a=automatic.sections[i],d=depth.sections[i];return `<article class="card profile"><h2>S${i+1} · distância ${fmt(a.station,2)} m</h2><p>Fundo: ${fmt(a.zFloor)} m · deslocamento ${fmt(a.floorOffset)} m</p>${profilePlot(a,d,i)}<div class="profilevalues"><span style="color:${C.auto}"><b>Automático</b><br>Nível ${fmt(a.level)} m · largura ${fmt(a.width)} m</span><span style="color:${C.depth}"><b>Profundidade 0,50 m</b><br>Nível ${fmt(d.level)} m · largura ${fmt(d.width)} m</span></div></article>`;}).join('');
const page2=`<section class="page" id="perfis">${header('O nível é local, não uma cota única','Profundidade informada: 0,50 m (teste) · perfis transversais e longitudinal')}<div class="legendbar">${sharedLegend}</div><div class="profilerow">${cards}</div><article class="card longitudinal"><div class="plotheading"><h2>Perfil longitudinal · nível acompanhando o fundo</h2><p>Transversais acima: recorte visual ±10 m; amostras originais: ±20 m.</p></div>${longitudinal(automatic,depth)}</article><div class="note">A linha verde mantém 0,50 m sobre o fundo em todas as seções. Oscilações do automático, curvas e mudanças próximas a vértices precisam de revisão técnica.</div>${footer(2)}</section>`;
const synSec=synthetic.sections[2],synAuto={...synSec,level:synSec.level,rightOffset:synSec.rightOffset,leftOffset:synSec.leftOffset};
const syntheticTransverse=profilePlot(synAuto,synSec,2,694,290,{offsetMin:-6,offsetMax:6});
const page3=`<section class="page" id="controlado">${header('Teste controlado: vale em V sem patamar','Profundidade informada: 2,50 m (teste controlado) · piso em rampa longitudinal',true)}<div class="testrow"><article class="card explanation"><h2>Automático por relevo</h2><div class="status reject">RECUSADO COMO ESPERADO</div><p>O perfil sobe com inclinação constante. Não existe uma quebra de declividade que sustente a posição de uma margem.</p><div class="code">${esc(rejected.code)}</div><h2 class="gap">Preenchimento por profundidade</h2><div class="status accept">ACEITO · 5 / 5 SEÇÕES</div><p>O nível está 2,50 m acima do fundo local; a primeira interseção em cada lado define uma largura constante de <b>5,00 m</b>.</p><div class="formula">Terreno: z = 100 + 0,10 × distância + |offset|</div></article><article class="card"><h2>Seção no meio do percurso · 20 m</h2><p>Fundo: 102,00 m · nível: 104,50 m · largura: 5,00 m</p>${syntheticTransverse}<div class="legendbar small">${legend('Terreno em V',C.terrain)}${legend('Nível local',C.depth)}${legend('Fundo',C.floor)}</div><p class="center">Os dois pontos verdes são os primeiros cruzamentos do terreno.</p></article></div><article class="card longitudinal syntheticlong"><div class="plotheading"><h2>Mesmo preenchimento em um fundo inclinado</h2><p>Fundo: 100 → 104 m · nível: 102,50 → 106,50 m · profundidade constante.</p></div>${longitudinal(synthetic,synthetic,1462,265,{syntheticOnly:true})}</article><div class="note">Teste matemático do motor, não resultado sobre a imagem enviada. Nenhuma cota global de inundação foi aplicada; não há cálculo de vazão, velocidade ou superfície hidráulica.</div>${footer(3)}</section>`;
const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>GeoMine · testes de profundidade local</title><style>
*{box-sizing:border-box}body{margin:0;background:#dae3e9;font:18px/1.3 Arial,Helvetica,sans-serif;color:#263b4b}.page{width:1600px;height:1000px;padding:28px 34px 18px;background:#f1f5f8;margin:0 auto 28px;overflow:hidden;position:relative}.eyebrow{font-size:13px;letter-spacing:2px;font-weight:700;color:#66808d}h1{font-size:34px;line-height:1.1;margin:7px 0 9px;letter-spacing:-.6px}header p{font-size:18px;margin:0;color:#5b7282}.provenance{background:#fff3d7;border:1px solid #e7bc63;border-left:5px solid #cb8f22;color:#734e0d;border-radius:8px;padding:12px 16px;font-size:21px;font-weight:700;margin-top:17px}.provenance.synthetic{background:#eaf0f8;border-color:#9db7d4;border-left-color:#3d6c9d;color:#31567c}.legendbar{display:flex;align-items:center;gap:28px;margin:14px 0 14px;font-size:16px}.legend{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}.legend i{width:27px;border-top:3px solid var(--key);display:inline-block}.card{background:white;border:1px solid #d8e2e9;border-radius:13px;overflow:hidden;padding:18px;box-shadow:0 2px 3px #18304406}.card h2{font-size:23px;margin:0 0 6px;line-height:1.2;letter-spacing:-.4px}.card p{font-size:16px;margin:0 0 9px;color:#637888}.maprow{display:grid;grid-template-columns:1fr 1fr;gap:20px}.maprow .card{padding:16px 16px 14px}.maprow svg{display:block}.dot{width:12px;height:12px;display:inline-block;border-radius:50%;margin-right:7px}.dot.auto{background:${C.auto}}.dot.depth{background:${C.depth}}.stats{display:flex;gap:0;border-top:1px solid #e3eaf0;padding-top:12px}.stats>div{flex:1;border-right:1px solid #e3eaf0;padding-left:12px}.stats>div:first-child{padding-left:0}.stats>div:last-child{border:0}.stats span{display:block;color:#69808e;font-size:14px}.stats b{display:block;font-size:22px;margin-top:3px}.note{font-size:16px;color:#5b7180;margin-top:12px;line-height:1.35;padding-left:3px}footer{position:absolute;left:34px;right:34px;bottom:19px;display:flex;justify-content:space-between;border-top:1px solid #cfdae3;padding-top:10px;font-size:15px;color:#597082}footer b{color:#3e596b}.profilerow{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.profile{padding:16px 14px}.profile h2{font-size:22px}.profile p{font-size:15px;white-space:nowrap}.profile svg{display:block}.profilevalues{display:flex;font-size:15px;gap:10px;margin-top:10px;border-top:1px solid #e4ebf0;padding-top:9px}.profilevalues>span{flex:1}.profilevalues b{font-size:16px}.longitudinal{margin-top:16px;padding:15px 17px 5px}.plotheading{display:flex;align-items:baseline;justify-content:space-between;gap:20px}.plotheading h2{font-size:22px}.plotheading p{font-size:14px;white-space:nowrap}.longitudinal svg{display:block}.testrow{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:18px}.testrow .card{height:428px}.explanation p{font-size:19px;line-height:1.4;margin:10px 0}.status{display:inline-block;font-size:14px;font-weight:700;letter-spacing:.8px;border-radius:5px;padding:6px 9px;margin-top:3px}.reject{color:#a03e30;background:#fff0ec}.accept{color:#047f72;background:#e2f5ef}.code{font-size:13px;color:#9e6c60}.gap{margin-top:17px!important}.formula{font-size:15px;margin-top:8px;color:#587387;background:#f0f5f8;padding:8px;border-radius:5px}.testrow .card>svg{display:block}.small{margin:5px 0 8px;font-size:15px;justify-content:center}.center{text-align:center}.syntheticlong{margin-top:16px}.syntheticlong .plotheading h2{font-size:22px}
.page{width:${pageWidth}px;height:${pageHeight}px}.testrow .card{height:460px}
</style>${page1}${page2}${page3}<script>window.__reportReady=true</script></html>`;
const report={createdAt:new Date().toISOString(),provenance,disclaimer,engineSHA256:sha,fixture,source:data.source,sampling:data.sampling,crs:data.axis.crs,axisLengthM:run.layout.length,reachPerSide:20,resolution:run.resolution,automatic:metricsAuto,depth:metricsDepth,sections:[0,28,31].map(i=>({section:i+1,station:automatic.sections[i].station,zFloor:automatic.sections[i].zFloor,floorOffset:automatic.sections[i].floorOffset,automatic:{width:automatic.sections[i].width,level:automatic.sections[i].level},depth:{width:depth.sections[i].width,level:depth.sections[i].level}})),controlled:{formula:'z=100+0.1*station+abs(offset)',depth:2.5,width:5,sections:5,floor:[100,104],level:[102.5,106.5],automaticRejected:rejected}};
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'comparacao-calha-profundidade.html'),html);fs.writeFileSync(path.join(output,'metricas-calha-profundidade.json'),JSON.stringify(report,null,2)+'\n');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});try{const page=await browser.newPage({viewport:{width:pageWidth,height:pageHeight},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route(/^https?:/,r=>r.abort());await page.goto('file://'+path.join(output,'comparacao-calha-profundidade.html'));await page.waitForFunction(()=>window.__reportReady);await page.evaluate(()=>document.fonts.ready);
  for(const [id,name]of[['planta','01-planta-projeto-anterior.png'],['perfis','02-perfis-projeto-anterior.png'],['controlado','03-teste-controlado-vale-v.png']]){
    // Isolate each page so element capture never inherits the preceding page's scroll offset.
    await page.evaluate(selected=>{document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';for(const p of document.querySelectorAll('.page')){p.style.display=p.id===selected?'block':'none';p.style.margin='0';}window.scrollTo(0,0);return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));},id);
    const el=page.locator('#'+id),bbox=await el.boundingBox();assert.equal(bbox.width,pageWidth);assert.equal(bbox.height,pageHeight);
    const bounds=await el.evaluate(p=>{const footer=p.querySelector('footer').getBoundingClientRect();return{headerTop:p.querySelector('header').getBoundingClientRect().top-p.getBoundingClientRect().top,noteBottom:p.querySelector('.note').getBoundingClientRect().bottom,footerTop:footer.top,overflow:p.scrollHeight>p.clientHeight,cards:[...p.querySelectorAll('.card')].map(c=>({height:c.clientHeight,contentHeight:c.scrollHeight,overflow:c.scrollHeight>c.clientHeight+1}))};});
    assert.equal(bounds.headerTop,28,id+' header clipped');assert.equal(bounds.overflow,false,id+' page overflow');assert.ok(bounds.noteBottom+8<bounds.footerTop,id+' note overlaps footer: '+JSON.stringify(bounds));assert.ok(bounds.cards.every(c=>!c.overflow),id+' card clipped: '+JSON.stringify(bounds));
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:path.join(output,name),clip:{x:0,y:0,width:pageWidth,height:pageHeight}});
  }
  assert.deepEqual(errors,[]);assert.equal(crypto.createHash('sha256').update(fs.readFileSync(enginePath)).digest('hex'),sha);console.log(JSON.stringify({output,engineSHA256:sha,automatic:metricsAuto,depth:metricsDepth,controlled:report.controlled},null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
