const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const text=fs.readFileSync(path.join(__dirname,'21-profiles-and-3d.js'),'utf8');
/* Só a função do modo "linhas por cima" das vistas laterais, com um grupo de vetores de mentira. */
function setup(){
 const mat=o=>({depthTest:true,depthWrite:true,transparent:false,...o});
 const filhos=[{material:mat()},{material:mat({transparent:true,depthWrite:false}),isLine:true,renderOrder:0},{material:[mat(),mat()]}];
 const g={renderOrder:0,children:filhos,traverse(f){f(g);filhos.forEach(f);}};
 const c={V3:{vecGroup:g,phi:0}};vm.createContext(c);
 const a=text.indexOf('function v3LinhasSempreVisiveis('),b=text.indexOf('function v3VistaLateral(',a);
 assert(a>0&&b>a);vm.runInContext(text.slice(a,b),c);return {c,g,filhos};
}
const mats=filhos=>filhos.flatMap(o=>Array.isArray(o.material)?o.material:[o.material]);
test('vista lateral: as linhas saem do teste de profundidade e entram na passada dos transparentes, depois da superfície',()=>{
 const {c,g,filhos}=setup();assert.equal(c.v3LinhasSempreVisiveis(true),true);
 assert.equal(g.renderOrder,999);assert.equal(c.V3._linhasPorCima,true);
 for(const m of mats(filhos)){assert.equal(m.depthTest,false);assert.equal(m.transparent,true);}
});
test('ao sair da vista lateral cada material volta ao que era, inclusive o que já era transparente',()=>{
 const {c,g,filhos}=setup();c.v3LinhasSempreVisiveis(true);c.v3LinhasSempreVisiveis(false);
 assert.equal(g.renderOrder,0);assert.equal(c.V3._linhasPorCima,false);
 assert.equal(mats(filhos).map(m=>`${m.depthTest}:${m.transparent}`).join(','),'true:false,true:true,true:false,true:false');
});
test('quem monta os vetores reaplica o modo enquanto a câmera está na vista lateral',()=>{
 const a=text.indexOf('function v3BuildVectors('),b=text.indexOf('function refresh3DVecList(',a),corpo=text.slice(a,b);
 assert(a>0&&b>a);assert.match(corpo,/if\(V3\._linhasPorCima\)\{ if\(V3\.phi===0\) v3LinhasSempreVisiveis\(true\); else V3\._linhasPorCima=false; \}/);
 // e o material das linhas simples grava profundidade quando a linha é opaca
 assert.match(corpo,/m\.depthWrite=st\.opacity>=1;/);
});
