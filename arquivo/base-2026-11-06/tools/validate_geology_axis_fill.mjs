import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
let nativeCanvas;
try{nativeCanvas=require('@napi-rs/canvas');}
catch{nativeCanvas=require(path.resolve(path.dirname(process.execPath),'../node_modules/@napi-rs/canvas'));}
const source=fs.readFileSync(new URL('../src/modules/geology/geological-sections.js',import.meta.url),'utf8')
  .replace('const sectionTest={lineMetrics,','const sectionTest={polygonEventsAndRuns,lineMetrics,');
const plain=x=>JSON.parse(JSON.stringify(x));
let checked=0;
function check(name,run){run();checked++;console.log('OK · '+name);}

function fixture(){
  const cv=nativeCanvas.createCanvas(1100,420);cv.style={};
  const ctx=cv.getContext('2d'),c={window:{},S:{layers:[],rasters:[],workCRS:'EPSG:31982'},
    document:{readyState:'loading',addEventListener(){},getElementById:id=>id==='gsecCanvas'?cv:null},
    console,setTimeout:()=>0,clearTimeout(){},URL,Blob,
    fromWGS:(_crs,x,y)=>[x,y],toWGS:(_crs,x,y)=>[x,y],reproj:(_a,_b,x,y)=>[x,y],
    featureStyle:(_L,f)=>({color:f.props.COLOR||'#189b4c',stroke:'#111111'})};
  vm.createContext(c);vm.runInContext(source,c);
  const api=c.window.GeoMineGeology.__sectionTest;
  return {c,cv,ctx,api,pixel:(x,y)=>[...ctx.getImageData(Math.round(x),Math.round(y),1,1).data]};
}
function profile(dist,z){return {dist,pts:dist.map(x=>[x,0]),series:[{name:'MDT',z}]};}
function result(f,p,base=null){
  const line=[[0,0],[p.dist.at(-1),0]],met=f.api.lineMetrics(line);
  return {name:'Seção A–B',rasterName:'MDT',corridor:50,ve:99,met,profile:p,geologyBase:base,
    runs:[{layerId:1,label:'Domínio',startStation:0,endStation:met.total,color:'#189b4c'}],
    holes:[],contacts:[],faults:[],fractures:[],veins:[],shearzones:[],fieldMarks:[],projects:[]};
}
function xy(r,station,z){const g=r.renderGeometry;return [72+station*g.xScale,42+(g.zMax-z)*g.yScale];}
function blend(hex){const rgb=hex.match(/[\da-f]{2}/gi).map(v=>parseInt(v,16));return rgb.map(v=>Math.round(v*.72+255*.28));}
function isColor(pixel,color,tolerance=4){const rgb=blend(color);return pixel[3]===255&&rgb.every((v,i)=>Math.abs(pixel[i]-v)<=tolerance);}
function colored(f,r,s,z,color='#189b4c'){const p=f.pixel(...xy(r,s,z));assert.ok(isColor(p,color),`cor na estação ${s}, cota ${z}: ${p} != ${blend(color)}`);}
function clear(f,r,s,z){const p=f.pixel(...xy(r,s,z));assert.ok(p.slice(0,3).every(v=>v>=215),`lacuna deveria estar vazia: ${p}`);}
const ring=(a,b,closed=false)=>{const p=[[a,-10],[b,-10],[b,10],[a,10]];if(closed)p.push(p[0].slice());return p;};
function domains(f,features,p){
  const L={id:1,name:'Domínios',gtype:'polygon',crs:'EPSG:31982',features},line=[[0,0],[p.dist.at(-1),0]],met=f.api.lineMetrics(line);
  return f.api.polygonEventsAndRuns([L],line,met,p);
}

check('base automática preenche até o eixo X sob terreno ondulado, não apenas uma faixa',()=>{
  const f=fixture(),r=result(f,profile([0,100,200,300,400,500,600],[100,140,120,220,160,200,170]));
  const before=plain(r);f.api.drawSection(r);const g=r.renderGeometry;
  assert.equal(g.xScale,g.yScale);assert.equal(g.ve,1);assert.ok(g.zMin<100);
  for(const s of [50,150,250,350,450,550]){
    colored(f,r,s,g.zMin+4/g.yScale);
    colored(f,r,s,(g.zMin+100)/2);
  }
  clear(f,r,40,180);
  const after=plain(r);delete after.renderGeometry;assert.deepEqual(after,before);
});
check('cota explícita decimal/negativa coincide exatamente com o eixo X, mantendo escala 1:1',()=>{
  for(const base of [25.5,-50,0]){
    const f=fixture(),r=result(f,profile([0,1000],[100,120]),base);f.api.drawSection(r);const g=r.renderGeometry;
    assert.equal(g.zMin,base);assert.equal(g.xScale,g.yScale);assert.equal(g.ve,1);
    assert.ok(Math.abs(xy(r,0,base)[1]-(42+g.plotH))<1e-9);
    for(const s of [35,245,795])colored(f,r,s,base+4/g.yScale);
    const below=f.pixel(72+g.plotW*.345,42+g.plotH+5);
    assert.ok(below.slice(0,3).every(v=>v>245),'não colorir fora da moldura inferior');
  }
});
check('intervalos exatos preservam unidade menor que o passo e não deixam colunas brancas entre unidades',()=>{
  const f=fixture(),p=profile([0,100,200,300,400,500,600,700,800,900,1000],Array(11).fill(180)),
    features=[{geom:ring(0,122),props:{LITO:'A',COLOR:'#dd2255'}},{geom:ring(122,138),props:{LITO:'B',COLOR:'#2255dd'}},
      {geom:ring(138,1000),props:{LITO:'C',COLOR:'#189b4c'}}],
    out=domains(f,features,p),r=result(f,p,0);r.runs=out.runs;
  assert.deepEqual(plain(r.runs.map(x=>[x.startStation,x.endStation,x.label])),[[0,122,'A'],[122,138,'B'],[138,1000,'C']]);
  f.api.drawSection(r);colored(f,r,118,30,'#dd2255');colored(f,r,130,30,'#2255dd');colored(f,r,143,30);
  const g=r.renderGeometry,y=xy(r,0,10)[1];
  for(let x=Math.ceil(72+g.xScale*115);x<=Math.floor(72+g.xScale*145);x++){
    const rgba=f.pixel(x,y);assert.ok(Math.min(...rgba.slice(0,3))<150,'sem faixa branca no contato '+x);
  }
});
check('polígono não fechado e anel interno produzem limites e lacuna sem inventar domínio',()=>{
  const f=fixture(),p=profile([0,100,200,300,400,500],[160,160,160,160,160,160]),
    out=domains(f,[{geom:[ring(0,500),ring(210,290)],props:{LITO:'A',COLOR:'#189b4c'}}],p),r=result(f,p,0);
  assert.deepEqual(plain(out.runs.map(x=>[x.startStation,x.endStation,x.layerId])),[[0,210,1],[210,290,null],[290,500,1]]);
  r.runs=out.runs;f.api.drawSection(r);colored(f,r,153,30);colored(f,r,353,30);colored(f,r,253,30,'#e6e8eb');
});
check('domínio centimétrico não some pela tolerância dos marcadores de contato',()=>{
  const f=fixture(),p=profile([0,100,200],[160,160,160]),out=domains(f,[
    {geom:ring(0,90),props:{LITO:'A'}},{geom:ring(90,90.02),props:{LITO:'Veio estreito'}},
    {geom:ring(90.02,200),props:{LITO:'B'}}],p);
  assert.deepEqual(plain(out.runs.map(r=>[+r.startStation.toFixed(6),+r.endStation.toFixed(6),r.label])),
    [[0,90,'A'],[90,90.02,'Veio estreito'],[90.02,200,'B']]);
});
check('NoData interrompe o preenchimento até a base e não conecta ilhas de terreno',()=>{
  const f=fixture(),p=profile([0,100,200,300,400,500,600],[100,120,NaN,140,150,NaN,170]),r=result(f,p,-50);
  f.api.drawSection(r);colored(f,r,50,13);colored(f,r,350,13);
  for(const s of [150,250,450,550])clear(f,r,s,13);
});
check('intervalos dos domínios respeitam a conversão do CRS da camada para metros no eixo',()=>{
  const f=fixture(),p=profile([0,100,200,300,400],[160,160,160,160,160]),line=[[0,0],[400,0]],met=f.api.lineMetrics(line);
  let calls=0;f.c.reproj=(from,to,x,y)=>{assert.equal(from,'EPSG:31983');assert.equal(to,'EPSG:31982');calls++;return [x-10000,y+5000];};
  const L={id:9,name:'Unidade reprojetada',gtype:'polygon',crs:'EPSG:31983',features:[{
    geom:ring(85,235).map(([x,y])=>[x+10000,y-5000]),props:{LITO:'A',COLOR:'#189b4c'}}]},
    out=f.api.polygonEventsAndRuns([L],line,met,p);
  assert.ok(calls>=4);assert.deepEqual(plain(out.runs.map(x=>[x.startStation,x.endStation,x.layerId])),[[0,85,null],[85,235,9],[235,400,null]]);
  const r=result(f,p,25.5);r.runs=out.runs;f.api.drawSection(r);colored(f,r,135,35);colored(f,r,35,35,'#e6e8eb');
});
check('perfil/projeção abaixo da base são recortados à moldura, sem mudar a cota escolhida',()=>{
  const f=fixture(),r=result(f,profile([0,1000],[140,160]),25.5);
  r.projects=[{name:'Cava profunda',mode:'vector',color:'#ff0000',points:[],segments:[[{station:200,z:90},{station:400,z:-100},{station:600,z:90}]]}];
  r.faults=[{kind:'fault',station:700,z:155,interpretation:{endStation:900,endZ:-100,apparentDip:45,confidence:'alta'}}];
  f.api.drawSection(r);const g=r.renderGeometry;assert.equal(g.zMin,25.5);assert.equal(g.xScale,g.yScale);
  const bytes=f.ctx.getImageData(72,Math.ceil(42+g.plotH+3),Math.floor(g.plotW),26).data;
  for(let i=0;i<bytes.length;i+=4)assert.ok(!(bytes[i]>190&&bytes[i+1]<75&&bytes[i+2]<75),'perfil vermelho ultrapassou o eixo X');
  let red=0;const pixels=f.ctx.getImageData(72,42,Math.floor(g.plotW),Math.floor(g.plotH)-3).data;
  for(let i=0;i<pixels.length;i+=4)if(pixels[i]>190&&pixels[i+1]<75&&pixels[i+2]<75)red++;
  assert.ok(red>50,'perfil permanece visível acima da base');
});
check('altura limitada conserva preenchimento na base e escala real em seção muito íngreme',()=>{
  const f=fixture(),r=result(f,profile([0,100],[100,500]),-500);f.api.drawSection(r);const g=r.renderGeometry;
  assert.equal(g.zMin,-500);assert.equal(g.plotH,760);assert.equal(g.xScale,g.yScale);assert.ok(g.plotW<1004);
  colored(f,r,50,-500+5/g.yScale);clear(f,r,20,520);
});
console.log(`${checked} regressões de preenchimento até o eixo X aprovadas (pixels reais em canvas).`);
