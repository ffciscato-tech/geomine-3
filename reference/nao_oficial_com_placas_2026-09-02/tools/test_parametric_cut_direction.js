#!/usr/bin/env node
'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const files=[
  'src/core/parts/22-mine-pit-design.js',
  'src/modules/mining/alagis-cava-parametrica-preservada.js'
];

function implementation(rel){
  const src=fs.readFileSync(path.join(root,rel),'utf8');
  const ini=src.indexOf('function cavaRecortaFeicoesNoLimite(');
  const fim=src.indexOf('\nfunction rb31Snap',ini);
  assert(ini>=0&&fim>ini,`máscara/rb31Cortar não encontrada em ${rel}`);
  return src.slice(ini,fim);
}

function run(rel,expected,fromRecipe=false){
  const modes={surface:[],feature:[],rings:[]};
  const recipe={travaUp:expected,runtime:{up:expected}};
  const limite={id:7,name:'Limite paramétrico',_cavaLimiteDin:true,
    features:[{geom:[[0,0],[1,0],[1,1],[0,1]],props:{}}]},
    uni={id:41,name:'Rampa por bancada',features:[],_rb31Recipe:recipe};
  const st={banco:1,feats:[{geom:[[-1,.5],[2,.5]],
    props:{CLASSE:'rb31-crista',COTA:820}}],paramBancos:[{H:12}],
    lays:{uni},srcLayerId:7,srcFeatIdx:0,eixoOn:false};
  if(!fromRecipe)st.travaUp=expected;
  const S={_rb31:st,layers:[limite,uni],rasters:[{id:'mdt',d:{cs:.5}}],
    activeId:41,workCRS:'EPSG:31983'};
  const ctx={console,S,document:{getElementById(id){
    if(id==='cavaMdtSel')return {value:'mdt'};
    if(id==='rb31H')return {value:'12'};
    return null;
  }},
  cavaIntersecaoSuperficies(linhas,g,H,up){modes.surface.push(up);return [];},
  cavaRecortaFeicaoNoMdt(f,g,up){modes.feature.push(up);return [{
    geom:f.geom.map(p=>p.slice()),props:{...f.props}}];},
  cavaRecortaAneisNaIntersecao(feats,up){modes.rings.push(up);
    return {feats,recortadas:0};},
  cavaForcaExtremosNaIntersecao(){},cavaSoldaRecorteNaIntersecao(){},
  cavaSoldaIntersecaoAneis(){},cavaFeatsSemDuplicar(x){return x;},
  pointInRing(x,y,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];if(((a[1]>y)!==(b[1]>y))&&
      x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;},
  rb31Fields(){return [];},cavaV02AplicaLinhas(){},drawLayer(){},refreshUI(){},
  toast(){},addLayer(o){const layer={id:42,...o};S.layers.push(layer);return layer;}};
  vm.createContext(ctx);vm.runInContext(implementation(rel),ctx);
  ctx.rb31Cortar();
  const cut=S.layers.find(x=>x._rb31CutOf==='41');
  assert(cut,`${rel}: camada cortada não criada`);
  assert.equal(cut._cavaMdtCutUp,expected,
    `${rel}: camada cortada deve guardar o sentido real do projeto`);
  assert.equal(cut.features.length,1,`${rel}: o corte deve conservar só a parte interna`);
  assert(Math.abs(cut.features[0].geom[0][0])<1e-8&&
    Math.abs(cut.features[0].geom.at(-1)[0]-1)<1e-8,
    `${rel}: a máscara final deve terminar exatamente na borda do limite`);
  for(const [stage,values] of Object.entries(modes)){
    assert(values.length,`${rel}: etapa ${stage} não foi exercitada`);
    assert(values.every(v=>v===expected),
      `${rel}: etapa ${stage} recebeu o lado oposto ao projeto`);
  }
}

function concave(rel){
  const ctx={pointInRing(x,y,ring){let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i],b=ring[j];if(((a[1]>y)!==(b[1]>y))&&
        x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }return inside;}};
  vm.createContext(ctx);
  const src=implementation(rel),fim=src.indexOf('\nfunction rb31Cortar');
  vm.runInContext(src.slice(0,fim),ctx);
  const limite=[[0,0],[4,0],[4,4],[3,4],[3,1],[1,1],[1,4],[0,4]],
    out=ctx.cavaRecortaFeicoesNoLimite([{geom:[[-1,2],[5,2]],zg:[820,826],
      props:{CLASSE:'rb31-crista'}}],limite);
  assert.equal(out.length,2,`${rel}: uma reentrância deve separar os dois trechos internos`);
  assert.equal(JSON.stringify(out.map(f=>f.geom.map(p=>p.map(v=>Math.round(v*1e8)/1e8)))),
    JSON.stringify([[[0,2],[1,2]],[[3,2],[4,2]]]),
    `${rel}: nenhum trecho pode atravessar a reentrância externa`);
}

for(const rel of files){
  run(rel,true);
  run(rel,false);
  run(rel,true,true);
  concave(rel);
}
console.log('OK: corte respeita Up/Down e a máscara interna, inclusive em limites côncavos.');
