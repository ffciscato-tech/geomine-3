import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const file=new URL('../src/modules/geology/geological-sections.js',import.meta.url);
const source=fs.readFileSync(file,'utf8');
const context={
  window:{},
  S:{layers:[],rasters:[],workCRS:'EPSG:31982'},
  document:{
    readyState:'loading',
    addEventListener(){},
    getElementById(){return null;},
    querySelectorAll(){return [];}
  },
  console,
  setTimeout(){return 0;},
  clearTimeout(){},
  fromWGS(_crs,lng,lat){return [lng,lat];},
  toWGS(_crs,x,y){return [x,y];},
  reproj(_from,_to,x,y){return [x,y];},
  drawLayer(){},
  refreshUI(){},
  addLayer(o){
    const layer={id:context.S.layers.length+1,weight:2,sym:{color:o.color,stroke:o.color,weight:2},...o};
    context.S.layers.unshift(layer);return layer;
  },
  URL,
  Blob
};
vm.createContext(context);
vm.runInContext(source,context,{filename:'geological-sections.js'});

const api=context.window.GeoMineGeology;
assert.ok(api,'namespace GeoMineGeology');
for(const name of ['openSection','refresh','generate','saveCurrent','snapshot','restore'])
  assert.equal(typeof api[name],'function',name+' deve ser função pública');
assert.equal(context.window.geoOpenGeologicalSections,api.openSection,'alias do comando');

const t=api.__test;
const hit=t.segmentIntersection([0,0],[10,0],[4,-5],[4,5]);
assert.ok(hit);
assert.equal(hit.point[0],4);
assert.equal(hit.point[1],0);

const metrics=t.lineMetrics([[0,0],[10,0],[10,10]]);
assert.equal(metrics.total,20);
const closest=t.closestOnLine([8,3],[[0,0],[10,0],[10,10]],metrics);
assert.equal(Math.round(closest.station),13);
assert.equal(Math.round(closest.distance),2);

const outer=[[0,0],[10,0],[10,10],[0,10],[0,0]];
const hole=[[3,3],[7,3],[7,7],[3,7],[3,3]];
assert.equal(t.pointInRings([1,1],[outer,hole]),true,'ponto na unidade');
assert.equal(t.pointInRings([5,5],[outer,hole]),false,'furo interno por paridade');
assert.equal(t.roleForLayer({name:'Falha transcorrente',gtype:'line'}),'fault');
assert.equal(t.roleForLayer({name:'Sondagem DDH-01',gtype:'point'}),'hole');
assert.equal(t.roleForLayer({name:'Unidades',gtype:'polygon'}),'lithology');

assert.equal(api.restore({activeId:'GSEC-1',section:{name:'Norte',rasterId:7,corridor:250,ve:3,
  step:5,layerIds:[2,3],roles:{2:'fault',3:'hole'}}}),true);
const snap=api.snapshot();
assert.equal(snap.version,2);
assert.equal(snap.activeId,'GSEC-1');
assert.equal(snap.section.name,'Norte');
assert.equal(snap.section.corridor,250);
assert.deepEqual([...snap.section.layerIds],['2','3']);

context.S.geology.section.line=[[0,0],[100,0]];
context.S.geology.section.lineWgs=[[0,0],[0,100]];
const sectionLayer=api.saveCurrent();
assert.ok(sectionLayer,'salva a linha como camada');
assert.equal(sectionLayer.features[0].props.GEOSEC_ID,'GSEC-1');
sectionLayer.sym.color='#123456';
context.S.geology.section.name='Norte revisada';
const updated=api.saveCurrent();
assert.equal(updated,sectionLayer,'atualiza a mesma camada');
assert.equal(updated.sym.color,'#123456','não perde o estilo da camada ao atualizar');
assert.equal(context.S.geology.sections[0].name,'Norte revisada','atualiza o índice mesmo sem painel aberto');

for(const field of ['GEOSEC_ID','CORREDOR','EXAG_V','PASSO_M','MDT_ID','CAMADAS','PAPEIS','CAMPO_USO','RAIO_CAM','PROF_INT'])
  assert.match(source,new RegExp(field),field+' deve ser persistido na camada da seção');
assert.match(source,/z\.push\(terrain\?projectRasterSample\(terrain,p\):NaN\)/,'amostragem por fonte respeita CRS, células e NoData sem substituir o terreno');
assert.match(source,/S\.geology\.section/,'estado geológico separado de S.prof');

console.log('OK: contrato, geometria, estado e persistência das seções geológicas.');
