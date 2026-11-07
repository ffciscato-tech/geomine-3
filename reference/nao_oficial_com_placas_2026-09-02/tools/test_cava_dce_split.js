#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const template=read('src/index.template.html'),ribbon=read('src/core/parts/10-ribbon-ui-preferences.js'),
  core=read('src/core/parts/22-mine-pit-design.js'),
  preservado=read('src/modules/mining/alagis-cava-parametrica-preservada.js'),
  mod=read('src/modules/mining/alagis-135-cava-v02-e-dce-separados.js');

assert(ribbon.includes("['cava-parametrica','Cava Paramétrica']"));
assert(!ribbon.includes("['dce-parametrico','DCE Paramétrico']"));
assert(!ribbon.includes("comando('mineracao','dce-parametrico'"));
assert(ribbon.includes("S._cavaPainelModo='unificado'"));
assert(ribbon.includes("if(rb)rb.style.display=''"));
assert(template.includes('id="cavaStepBancadas"'));
assert(template.includes('id="cavaStepBancadas" hidden aria-hidden="true"'));
assert(!template.includes('<b>Bancadas automáticas</b>'));
assert(template.includes('id="secRb31"'));
assert(!template.includes('id="secRb31" style="display:none"'));
assert(template.includes('id="secCavaRampaMineracao" style="display:none"'));
assert(template.includes('id="btnRb31LimparRampa"'));
assert(template.includes('id="btnRb31MoverRampa"'));
assert(template.includes('id="rb31MoverAteZ"'));
assert(!template.includes('id="btnRb31AlterarRampa"'));
assert(template.includes('id="cavaAcoesAutomaticas"'));
assert(mod.includes("{value:'Crista',color:'#111111',weight:1.5,dash:''}"));
assert(mod.includes("{value:'Pé',color:'#111111',weight:1.5,dash:'6 4'}"));
assert(mod.includes("{value:'Rampa',color:'#7b3fd4',weight:1.5,dash:''}"));
assert(mod.includes("{value:'Interseção',color:'#111111',weight:1.5,dash:'9 4'}"));
assert(core.includes("cavaV02AplicaLinhas(C,'CLASSE')"));
assert(core.includes("cavaV02AplicaLinhas(C,'TIPO',!!D.up)"));
assert(preservado.includes("cavaV02AplicaLinhas(L,'CLASSE')"));
assert(preservado.includes("cavaV02AplicaPoligono(RC)"));

const ctx={console};ctx.window=ctx;ctx.globalThis=ctx;
ctx.cavaOffsetSeguro=()=>({ring:[],modo:'fallback'});
ctx.cavaOffsetValido=(base,next,expand)=>next.length>=3&&
  (expand?Math.abs(area(next))>Math.abs(area(base)):Math.abs(area(next))<Math.abs(area(base)));
ctx.cavaAfastamentoFiel=q=>q;
vm.createContext(ctx);vm.runInContext(mod,ctx,{filename:'alagis-135.js'});
const G=ctx.cavaV02Geometria;assert(G&&typeof G.offsetIncremental==='function');
const E=ctx.cavaV02Estilo;assert(E&&typeof E.aplicaLinhas==='function');
const linha={sym:{},fields:[],features:[
  {props:{CLASSE:'rb31-crista',TIPO:'Crista de banco'}},
  {props:{CLASSE:'rb31-pe',TIPO:'Pé de banco'}},
  {props:{CLASSE:'rb31-inicio',TIPO:'Início da rampa'}},
  {props:{CLASSE:'daylight',TIPO:'Interseção cava × terreno'}}
]},poligono={sym:{}};
E.aplicaLinhas(linha,'CLASSE');E.aplicaPoligono(poligono);
assert.strictEqual(linha.weight,1.5);assert.strictEqual(linha.sym.field,'ELEMENTO');
assert.deepStrictEqual(Array.from(linha.sym.cats,x=>x.value),['Crista','Pé','Rampa','Interseção']);
assert.strictEqual(linha.sym.cats.find(x=>x.value==='Crista').color,'#111111');
assert.strictEqual(linha.sym.cats.find(x=>x.value==='Crista').dash,'');
assert.strictEqual(linha.sym.cats.find(x=>x.value==='Pé').color,'#111111');
assert.strictEqual(linha.sym.cats.find(x=>x.value==='Pé').dash,'6 4');
assert.deepStrictEqual(Array.from(linha.features,x=>x.props.ELEMENTO),
  ['Crista','Pé','Rampa','Interseção']);
assert.strictEqual(linha.features[2].props.CLASSE,'rb31-inicio');
assert.strictEqual(linha.features[3].props.CLASSE,'daylight');
assert.strictEqual(poligono.color,'#7b3fd4');assert.strictEqual(poligono.fill,.08);

function area(P){let s=0;for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];s+=a[0]*b[1]-b[0]*a[1];}return s/2;}
function crosses(P){
  const ori=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++){
    if(j===i||j===(i+1)%P.length||i===(j+1)%P.length)continue;
    const a=P[i],b=P[(i+1)%P.length],c=P[j],d=P[(j+1)%P.length];
    if(ori(a,b,c)*ori(a,b,d)<0&&ori(c,d,a)*ori(c,d,b)<0)return true;
  }
  return false;
}
function distRing(p,R){
  let best=Infinity;
  for(let i=0;i<R.length;i++){
    const a=R[i],b=R[(i+1)%R.length],dx=b[0]-a[0],dy=b[1]-a[1],q=dx*dx+dy*dy,
      t=Math.max(0,Math.min(1,q?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/q:0));
    best=Math.min(best,Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t));
  }
  return best;
}

/* Limite convexo com duas curvas e duas mudanças fortes de direção. */
const base=[[0,0],[80,0],[125,18],[145,55],[130,95],[82,122],[25,112],[-18,72],[-12,24]];
const out=G.offsetIncremental(base,6),inside=G.offsetIncremental(base,-6);
assert(out.length>=24&&inside.length>=24,'o motor deve densificar os anéis');
assert(!crosses(out)&&!crosses(inside),'offset não pode se auto-intersectar');
assert(Math.abs(area(out))>Math.abs(area(base)),'offset externo deve ampliar a área');
assert(Math.abs(area(inside))<Math.abs(area(base)),'offset interno deve reduzir a área');
const ds=out.map(p=>distRing(p,base)).sort((a,b)=>a-b),med=ds[Math.floor(ds.length/2)];
assert(med>4.5&&med<7.5,`afastamento mediano inesperado: ${med}`);

console.log(`OK: comando paramétrico unificado; curva e estilo v2 válidos (${out.length} vértices, afastamento mediano ${med.toFixed(2)} m).`);
