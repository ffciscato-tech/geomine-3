import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),sandbox={window:{}};
for(const name of ['hydrology/flood-fill-engine','environmental/channel-extraction-engine','environmental/channel-axis-fill-engine'])vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL('src/modules/'+name+'.js',root)),'utf8'),sandbox);
vm.runInNewContext(fs.readFileSync(fileURLToPath(new URL('src/vendor/polygon-clipping.min.js',root)),'utf8'),sandbox);
// Factories realmente isoladas, como no worker, sem globals da aplicação.
const factory=name=>vm.runInNewContext('('+sandbox.window[name].engine.toString()+')');
const legacy=factory('GeoMineChannelEngine')(),engine=factory('GeoMineChannelAxisFill')(factory('GeoMineFloodFill'),factory('GeoMineChannelEngine'),sandbox.polygonClipping);
const o={interval:2,lateralStep:.25,resolution:.5,reach:6},a={height:2,resolution:.5,mode:'axisDepth'};
const plain=x=>JSON.parse(JSON.stringify(x)),close=(x,y,eps=1e-7)=>assert.ok(Math.abs(x-y)<=eps,`${x} ≈ ${y}`);
const line=[[500000,7400000],[500010,7400000]],local=p=>[p[0]-500000,p[1]-7400000];
const run=(fn,options=o,axis=line,settings=a)=>{const p=engine.plan(axis,options),values=p.points.map(p=>fn(...local(p)));return {p,values,result:engine.analyze(p,values,settings)};};
const code=(fn,c)=>assert.throws(fn,e=>e.code===c,`Expected ${c}`);
let tests=0;const test=(name,fn)=>{fn();tests++;console.log('PASS '+name);};
test('V inclinado: eixo + altura, geometria imutável e worker standalone',()=>{
  const axis=plain(line),p=engine.plan(axis,o),before=JSON.stringify(p),values=p.points.map(p=>{const [x,y]=local(p);return 100+.1*x+Math.abs(y);}),snapshot=JSON.stringify(values),r=engine.analyze(p,values,a);
  assert.equal(JSON.stringify(axis),JSON.stringify(line));assert.equal(JSON.stringify(p),before);assert.equal(JSON.stringify(values),snapshot);
  close(r.area,40);assert.equal(r.polygons.length,1);assert.equal(r.polygons[0].length,1);
  for(const s of r.sections){close(s.width,4);close(s.spanWidth,4);close(s.level-s.zAxis,2);assert.equal(s.zReference,s.zAxis);assert.equal(s.zFloor,null);assert.equal(s.floorPoint,null);assert.equal(s.referenceKind,'axis');assert.equal(s.wetIntervals.length,1);assert.ok(s.profile.every(p=>'level'in p&&'wet'in p));}
});
test('Guia deslocado difere explicitamente do modo depth legado',()=>{
  const fn=(x,y)=>100+.1*x+Math.abs(y-2),r=run(fn,{...o,reach:8}).result;
  for(const s of r.sections){close(s.width,8);close(s.level,104+.1*(s.center[0]-500000));}
  const p=legacy.plan(line,o),r0=legacy.analyze(p,p.sections.map(s=>s.points.map(p=>fn(...local(p)))),{mode:'depth',height:2,resolution:.5});assert.ok(r0.sections.every(s=>Math.abs(s.width-4)<1e-7));
});
test('Referência densa acompanha relevo entre seções e independe do intervalo de revisão',()=>{
  const terrain=(x,y)=>100+2*Math.exp(-(((x-2.5)/.4)**2))+Math.abs(y),results=[2,5,10].map(interval=>run(terrain,{...o,interval}));
  for(const {p,result} of results){close(result.area,40);assert.equal(result.refCount,41);close(result.refStep,.25);assert.ok(p.referenceStations.some(t=>Math.abs(t-2.5)<1e-8));assert.ok(p.referencePoints.some(p=>terrain(...local(p))>101.9));assert.ok(result.sections.every(s=>Math.abs(s.width-4)<1e-7));}
  assert.ok(!results[1].p.sections.some(s=>Math.abs(s.station-2.5)<1e-8));
  assert.deepEqual(plain(results[0].result.polygons),plain(results[1].result.polygons));assert.deepEqual(plain(results[1].result.polygons),plain(results[2].result.polygons));
  const reversed=run(terrain,{...o,interval:5},line.slice().reverse()).result;assert.deepEqual(plain(reversed.polygons),plain(results[1].result.polygons));
  try{run((x,y)=>Math.abs(x-2.5)<.01&&Math.abs(y)<.01?NaN:100+Math.abs(y),{...o,interval:5});assert.fail('Expected dense reference NoData');}catch(e){assert.equal(e.code,'CHANNEL_NO_DATA');assert.match(e.message,/referência densa/);}
});
test('Seção 9,41 m com pequenas cristas: legado recusa; eixo 2D aplica altura',()=>{
  const knots=[[-4,104],[-.25,99.9],[0,100],[.25,100.1],[.5,100],[.75,100.2],[1,100.1],[1.25,100.2],[1.5,100],[1.75,100.1],[2,99.9],[2.25,100],[2.5,99.8],[4,104]];
  const z=y=>{for(let i=1;i<knots.length;i++)if(y<=knots[i][0]){const [x0,z0]=knots[i-1],[x1,z1]=knots[i];return z0+(z1-z0)*(y-x0)/(x1-x0);}return 104;};
  const axis=[[500000,7400000],[500009.41,7400000]],opts={...o,interval:9.41,reach:4},p=legacy.plan(axis,opts);
  code(()=>legacy.analyze(p,p.sections.map((s,i)=>s.offsets.map(y=>i?z(y):100+Math.abs(y))),{height:3.5,resolution:.5,mode:'depth'}),'CHANNEL_BARRIER');
  const r=run((x,y)=>z(y),opts,axis).result;assert.equal(r.mode,'axisDepth');assert.ok(r.sections.every(s=>s.width>5&&s.level===102));
});
test('Ilha seca contornada em 2D, furo e dois intervalos preservados',()=>{
  const r=run((x,y)=>Math.abs(x-5)<1&&y>.5&&y<1.5?104:100+Math.abs(y),{...o,interval:1}).result;
  assert.equal(r.polygons.length,1);assert.equal(r.polygons[0].length,2);close(r.area,38);
  const s=r.sections.find(s=>Math.abs(s.station-5)<1e-7);assert.equal(s.wetIntervals.length,2);close(s.width,3);close(s.spanWidth,4);assert.ok(s.wetIntervals[0].leftOffset<s.wetIntervals[1].rightOffset);
});
test('Crista submersa passa; crista no nível fica seca sem apagar o lado reconectado',()=>{
  const fn=(x,y,crest)=>Math.abs(x-5)<1&&y>.5&&y<1.5?crest:100+Math.abs(y);
  const low=run((x,y)=>fn(x,y,101.9),{...o,interval:1}).result,at=run((x,y)=>fn(x,y,102),{...o,interval:1}).result;
  assert.equal(low.polygons[0].length,1);close(low.area,40);assert.equal(at.polygons[0].length,2);close(at.area,38);
});
test('Plano sem margem recusa alcance, sem inventar fundo',()=>code(()=>run(()=>100),'CHANNEL_REACH_BANK'));
test('NoData no eixo e junto à água bloqueia; além de margem seca não bloqueia',()=>{
  code(()=>run((x,y)=>Math.abs(y)<.1?NaN:100+Math.abs(y)),'CHANNEL_NO_DATA');
  code(()=>run((x,y)=>x>4&&x<6&&y>.5&&y<1.5?NaN:100+Math.abs(y)),'CHANNEL_NO_DATA');
  close(run((x,y)=>Math.abs(y)>4?NaN:100+Math.abs(y)).result.area,40);
});
test('Inversão do eixo mantém a máscara e o polígono',()=>{
  const fn=(x,y)=>100+.1*x+Math.abs(y),f=run(fn).result,b=run(fn,o,line.slice().reverse()).result;
  assert.deepEqual(plain(f.polygons),plain(b.polygons));close(f.area,b.area);
  for(let i=0;i<f.sections.length;i++)close(f.sections[i].level,b.sections.at(-i-1).level);
});
test('Rotação preserva reversibilidade, tolerância de pixel e cotas longitudinais',()=>{
  for(const angle of [.37,Math.PI/2,2.42]){const c=Math.cos(angle),s=Math.sin(angle),axis=[[500000,7400000],[500000+10*c,7400000+10*s]],fn=(x,y)=>100+.1*(x*c+y*s)+Math.abs(-x*s+y*c);
    const f=run(fn,o,axis).result,b=run(fn,o,axis.slice().reverse()).result;assert.deepEqual(plain(f.polygons),plain(b.polygons));assert.ok(Math.abs(f.area-40)<7);for(const section of f.sections)close(section.level-section.zAxis,2);
  }
});
test('Caps locais não cortam trecho interno que retorna além da ponta inicial',()=>{
  const vertices=[[0,0],[10,0],[10,10],[-10,10]],axis=vertices.map(([x,y])=>[500000+x,7400000+y]);
  const terrain=(x,y)=>{let distance=Infinity;for(let i=1;i<vertices.length;i++){const a=vertices[i-1],b=vertices[i],dx=b[0]-a[0],dy=b[1]-a[1],f=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));distance=Math.min(distance,Math.hypot(x-a[0]-f*dx,y-a[1]-f*dy));}return 100+distance;};
  const opts={...o,reach:3},r=run(terrain,opts,axis,{...a,height:1}).result,reverse=run(terrain,opts,axis.slice().reverse(),{...a,height:1}).result;
  assert.deepEqual(plain(r.polygons),plain(reverse.polygons));assert.ok(r.polygons.flat(2).some(p=>p[0]<500000));assert.ok(r.sections.at(-1).width>=1);
  for(const reach of [6,12]){const wide=run(terrain,{...opts,reach},axis,{...a,height:1}).result;assert.deepEqual(plain(r.polygons),plain(wide.polygons));for(let i=0;i<r.sections.length;i++)close(r.sections[i].width,wide.sections[i].width);}
  const across=r.sections[0];assert.ok(across.wetIntervals.length>1);assert.ok(across.wetIntervals.at(-1).leftOffset>opts.reach);assert.ok(across.profile.at(-1).offset>=across.leftOffset);
});
test('Bacia desconectada atrás de terreno seco não entra na máscara',()=>{
  const result=run((x,y)=>Math.abs(y)>=2&&Math.abs(y)<3?104:Math.abs(y)>=3?100:100+Math.abs(y)).result;
  close(result.area,40);assert.ok(result.sections.every(s=>s.wetIntervals.length===1&&s.width===4));
});
test('Máscaras com obstáculos: dissolução exata inclusive contatos pontuais',()=>{
  let seed=173,passed=0,dissolved=0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(let trial=0;trial<40;trial++){
    const islands=new Set();for(let x=1;x<19;x++)for(let y=0;y<4;y++)if(random()<.2)islands.add(x+','+y);
    const terrain=(x,y)=>y>=.5&&y<2&&islands.has(Math.floor(x/.5)+','+Math.floor(y/.5))?104:100+Math.abs(y);
    const r=run(terrain).result;close(r.area,r.wetCellCount*.25);assert.ok(r.polygons.every(p=>p.every(r=>JSON.stringify(r[0])===JSON.stringify(r.at(-1)))));passed++;if(r.dissolved)dissolved++;
  }
  assert.equal(passed,40);assert.ok(dissolved>0);
});
test('Altura não resolvida, orçamento, resolução e geometria inválida recusados',()=>{
  code(()=>run((x,y)=>100+Math.abs(y),o,line,{...a,height:.01}),'CHANNEL_RESOLUTION');
  code(()=>engine.plan([[0,0],[10000,0]],{...o,reach:100}),'CHANNEL_LIMIT');
  code(()=>engine.plan([[0,0],[2,2],[0,2],[2,0]],o),'CHANNEL_INVALID_GEOMETRY');
  const {p,values}=run((x,y)=>100+Math.abs(y));code(()=>engine.analyze(p,values,{...a,resolution:1}),'CHANNEL_INVALID_INPUT');code(()=>engine.analyze(p,values.slice(1),a),'CHANNEL_INVALID_INPUT');
});
test('Faixa de um pixel é preservada com aviso de precisão, sem alterar legado',()=>{
  const r=run((x,y)=>100+Math.abs(y-.1),o,line,{...a,height:.15}).result;
  assert.ok(r.sections.every(s=>Math.abs(s.width-.5)<1e-7));close(r.area,5);assert.ok(r.warnings.some(w=>/inferior a dois pixels/.test(w)));
});
test('Diagnóstico mantém alvo e perfil sem fundo fictício',()=>{
  try{run(()=>100);assert.fail('Expected reach error');}catch(e){assert.equal(e.code,'CHANNEL_REACH_BANK');assert.equal(e.diagnostic.level,102);assert.equal(e.diagnostic.zReference,100);assert.equal(e.diagnostic.zFloor,null);assert.equal(e.diagnostic.referenceKind,'axis');assert.ok(e.diagnostic.profile.length>5);}
  try{run(()=>NaN);assert.fail('Expected NoData');}catch(e){assert.equal(e.code,'CHANNEL_NO_DATA');assert.equal(e.diagnostic.level,null);assert.ok(e.diagnostic.profile.every(p=>p.z===null&&p.level===null));}
});
console.log(`${tests}/${tests} grupos passaram.`);
