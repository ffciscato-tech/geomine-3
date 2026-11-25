/* GEOMEC — desenho da seção. Só dados sintéticos (talude inventado, em coordenadas neutras). */
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const DIR=__dirname;
function carrega(){
  const ctx={console, setTimeout, clearTimeout, structuredClone};
  ctx.window=ctx; ctx.self=ctx;
  vm.createContext(ctx);
  for(const f of ['slope-stability.js','geomec-core.js','geomec-litologias.js','geomec-canvas.js']) vm.runInContext(fs.readFileSync(path.join(DIR,f),'utf8'),ctx,{filename:f});
  return ctx.GeoMineGeomecInterno;
}
/* tela de mentira: aceita qualquer chamada e anota a cor de cada traço e os textos escritos */
function tela(){
  const tracos=[], textos=[], alvo={measureText:t=>({width:String(t).length*6})};
  const ctx=new Proxy(alvo,{
    get:(t,k)=>k in t?t[k]:(...a)=>{ if(k==='stroke') tracos.push(t.strokeStyle); if(k==='fillText') textos.push(String(a[0])); return ctx; },
    set:(t,k,v)=>{ t[k]=v; return true; }});
  return {ctx,tracos,textos};
}
function desenha(GM,s,op){
  const r=GM.calcula(s), v=GM.enquadra(s,900,500,r), t=tela();
  GM.desenhaSecao(t.ctx,900,500,s,r,v,op||{});
  return {...t,r,T:GM.tema(!!(op&&op.claro))};
}
const talude=GM=>GM.novaSecaoTalude({bancadas:3, altura:10, angulo:45, berma:5, pe:25, crista:30, cota:100});

/* 25/11/2026, print IMG_0285: "por que essas linhas?" — segunda vez que o usuário perguntou pelas
   duas linhas (verde e laranja) que acompanhavam o terreno na busca automática. */
test('busca automática: as faixas de entrada e saída não são desenhadas',()=>{
  const GM=carrega(), s=talude(GM);
  assert.notEqual(s.busca.faixas,'manual');
  const d=desenha(GM,s,{claro:true});
  assert.ok(d.r&&d.r.busca&&d.r.busca.faixas,'a busca continua informando por onde procurou');
  assert.ok(!d.tracos.includes(d.T.entrada),'nenhum traço na cor da entrada');
  assert.ok(!d.tracos.includes(d.T.saida),'nenhum traço na cor da saída');
  assert.ok(!d.textos.includes('entrada')&&!d.textos.includes('saída'));
});
test('faixas definidas à mão continuam na figura, com nome e alças',()=>{
  const GM=carrega(), s=talude(GM), L=GM.limites(s), c=(L.x0+L.x1)/2;
  s.busca.faixas='manual'; s.busca.entrada=[L.x0+2,c-5]; s.busca.saida=[c+5,L.x1-2];
  const d=desenha(GM,s,{claro:true,faixas:{entrada:s.busca.entrada,saida:s.busca.saida}});
  assert.ok(d.tracos.includes(d.T.entrada)); assert.ok(d.tracos.includes(d.T.saida));
  assert.ok(d.textos.includes('entrada')&&d.textos.includes('saída'));
});
