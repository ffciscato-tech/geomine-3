import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/core/parts/20-raster-dem.js',import.meta.url),'utf8');
function between(a,b){const x=source.indexOf(a),y=source.indexOf(b,x+a.length);assert.ok(x>=0&&y>x);return source.slice(x,y);}
function fn(name){const x=source.indexOf('function '+name+'('),y=source.indexOf('\n}',x);assert.ok(x>=0&&y>x);return source.slice(x,y+2);}
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};};
const preview=()=>({id:1,d:{nc:2,nr:2,cs:10,z:new Float32Array(4),resampled:10,_W0:20,_H0:20},demHD:false,dispFull:false});
function harness(r=preview(),choose){
  const el=Object.fromEntries(['rasDispFull','rasDemHD','rasDemHDInfo','rasLoadFull','rasTeto'].map(id=>[id,{checked:false,disabled:false}]));
  const calls={choose:[],render:[],toasts:[]};
  const context={S:{projectId:'A',rasters:[r]},rasCur:r,DISP_MAX_CELLS:12e6,
    document:{getElementById:id=>el[id]},console,
    rasEscolherNativoAgora:async target=>{calls.choose.push(target);return choose?choose(target):false;},
    demFull:async d=>d._full||d,showLoad(){},hideLoad(){},
    renderRaster:r=>calls.render.push(r),syncDemTiles(){},zApply(){},rasResInfo(){},toast:m=>calls.toasts.push(m)};
  vm.createContext(context);
  vm.runInContext(['rasterPrecisaFonteTela','rasterGradeCabeCanvas','rasterGradeOriginalCanvas','rasterDimensoesOriginais','rasSyncResolutionControls'].map(fn).join('\n'),context);
  vm.runInContext("const cDF=document.getElementById('rasDispFull');\n"+
    between('  if(cDF) cDF.onchange=async()=>{',"  { const be=document.getElementById('btnRasExp');"),context);
  return {context,el,calls,r};
}
let checks=0;
async function check(name,test){await test();checks++;console.log('OK · '+name);}
await check('checkbox selecionável sem fonte, com fonte ou com grade inteira',()=>{
  for(const d of [preview().d,{nc:10,nr:10,native:true,z:new Float32Array(100)},
    {nc:10,nr:10,native:true,_img0:{},z:new Float32Array(100)}]){
    const h=harness({...preview(),d});h.context.rasSyncResolutionControls(h.r);assert.equal(h.el.rasDemHD.disabled,false);
  }
});
await check('marcar tiles solicita original imediatamente e cancelar conserva camada',async()=>{
  const h=harness();h.el.rasDemHD.checked=true;const before=h.r.d;
  const p=h.el.rasDemHD.onchange();assert.equal(h.calls.choose.length,1);await p;
  assert.equal(h.r.d,before);assert.equal(h.r.demHD,false);assert.equal(h.r.dispFull,false);
});
await check('selecionar original habilita tiles mesmo quando arquivo é pequeno',async()=>{
  const h=harness(preview(),async r=>{r.d._img0={};return true;});h.el.rasDemHD.checked=true;
  await h.el.rasDemHD.onchange();assert.equal(h.r.demHD,true);assert.equal(h.r.dispFull,true);
  assert.equal(h.el.rasDemHD.checked,true);assert.deepEqual(h.calls.render,[h.r]);
});
await check('fonte já vinculada não pede arquivo de novo',async()=>{
  const r=preview();r.d._img0={};const h=harness(r);h.el.rasDemHD.checked=true;
  await h.el.rasDemHD.onchange();assert.equal(h.calls.choose.length,0);assert.equal(r.demHD,true);
});
await check('desligar tiles reduzido retorna à prévia',async()=>{
  const r=preview();r.d._img0={};r.demHD=r.dispFull=true;const h=harness(r);
  h.el.rasDemHD.checked=false;await h.el.rasDemHD.onchange();assert.equal(r.demHD,false);assert.equal(r.dispFull,false);
});
await check('Original sem fonte pede o raster correto sem ReferenceError',async()=>{
  const h=harness();h.el.rasDispFull.checked=true;await h.el.rasDispFull.onchange();
  assert.equal(h.calls.choose[0],h.r);assert.equal(h.r.dispFull,false);
});
await check('Original selecionado usa grade inteira quando disponível',async()=>{
  const h=harness(preview(),async r=>{r.d={nc:20,nr:20,native:true,_img0:{},z:new Float32Array(400)};return true;});
  h.el.rasDispFull.checked=true;await h.el.rasDispFull.onchange();assert.equal(h.r.dispFull,true);assert.equal(h.r.demHD,false);
});
await check('resultado de seletor não ativa camada de outro projeto',async()=>{
  const wait=deferred(),h=harness(preview(),()=>wait.promise);h.el.rasDemHD.checked=true;
  const pending=h.el.rasDemHD.onchange();h.context.S.projectId='B';h.context.S.rasters=[];
  wait.resolve(true);await pending;assert.equal(h.calls.render.length,0);assert.equal(h.r.demHD,false);
});
await check('trocar camada nas propriedades não aplica escolha à outra camada',async()=>{
  const wait=deferred(),h=harness(preview(),()=>wait.promise);h.el.rasDemHD.checked=true;
  const pending=h.el.rasDemHD.onchange(),other=preview();h.context.rasCur=other;h.r.d._img0={};
  wait.resolve(true);await pending;assert.equal(other.demHD,false);assert.equal(h.r.demHD,true);
});
await check('tiles explícitos não usam canvas nativo duplicado',()=>{
  assert.match(fn('renderRaster'),/const usaTiles=!!\(r\.demHD&&r\.d\._img0\)/);
  assert.match(fn('renderRaster'),/r\.dispFull&&!usaTiles\?rasterGradeOriginalCanvas/);
});
console.log(`MDT tiles: ${checks} cenários aprovados.`);
