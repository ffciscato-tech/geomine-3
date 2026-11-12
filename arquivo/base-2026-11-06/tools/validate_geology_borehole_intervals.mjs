import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const file=new URL('../src/modules/geology/geological-sections.js',import.meta.url);
const source=fs.readFileSync(file,'utf8');
let canvas=null;
const context={
  window:{},
  S:{layers:[],rasters:[],workCRS:'EPSG:31982'},
  document:{
    readyState:'loading',addEventListener(){},querySelectorAll(){return [];},
    getElementById(id){return id==='gsecCanvas'?canvas:null;}
  },
  console,setTimeout(){return 0;},clearTimeout(){},
  fromWGS(_crs,lng,lat){return [lng,lat];},toWGS(_crs,x,y){return [x,y];},
  reproj(_from,_to,x,y){return [x,y];},URL,Blob
};
vm.createContext(context);
vm.runInContext(source,context,{filename:'geological-sections.js'});

const t=context.window.GeoMineGeology.__sectionTest;
for(const fn of ['holeObjects','holeIntervals','validHoleRows','lithologyColor','traceSliceByDepth','drawSection'])
  assert.equal(typeof t[fn],'function',fn+' deve estar disponível para regressão');

const feature={
  geom:[50,0,100],props:{ID_FURO:'FS-01',PROF_M:50,AZIMUTE:0,MERGULHO:90},
  geologyLog:[
    {DE_M:0,ATE_M:10,LITOLOGIA:'Solo residual'},
    {DE_M:10,ATE_M:30,LITOLOGIA:'Gnaisse'},
    {DE_M:30,ATE_M:35,LITOLOGIA:''},
    {DE_M:35,ATE_M:35,LITOLOGIA:'Inválida'},
    {DE_M:45,ATE_M:55,LITOLOGIA:'Fora do furo'}
  ],
  coreRuns:[
    {DE_M:0,ATE_M:15,LITOLOGIA:'Saprolito',REC_PCT:80},
    {DE_M:30,ATE_M:50,LITOLOGIA:'Quartzito',REC_PCT:96}
  ]
};
const layer={id:7,name:'Sondagens',gtype:'point',crs:'EPSG:31982',visible:true,
  color:'#7c3aed',sym:{stroke:'#6d28d9'},features:[feature]};
const line=[[0,0],[100,0]],met=t.lineMetrics(line),profile={
  dist:[0,50,100],pts:[[0,0],[50,0],[100,0]],series:[{name:'MDT',z:[100,100,100]}]
};
const holes=t.holeObjects(layer,line,met,profile,100);
assert.equal(holes.length,1,'o furo dentro do corredor deve ser projetado');
const hole=holes[0];
assert.equal(hole.depth,50,'PROF_M deve definir a profundidade do furo');
assert.deepEqual(JSON.parse(JSON.stringify(hole.intervals.map(i=>[i.from,i.to,i.lithology,i.source]))),[
  [0,10,'Solo residual','geologyLog'],
  [10,30,'Gnaisse','geologyLog'],
  [30,50,'Quartzito','coreRuns']
], 'geologyLog deve prevalecer e coreRuns deve preencher somente a lacuna litológica');
assert.equal(hole.intervals.some(i=>i.lithology==='Inválida'),false,'DE_M deve ser menor que ATE_M');
assert.equal(hole.intervals.some(i=>i.lithology==='Fora do furo'),false,'intervalo além da profundidade deve ser descartado');
assert.deepEqual(JSON.parse(JSON.stringify(hole.provenance)),{layerId:7,layerName:'Sondagens',feature:0,holeId:'FS-01'});
assert.equal(hole.intervals[2].provenance.holeId,'FS-01','intervalo deve conservar o furo de origem');
assert.equal(hole.intervals[2].provenance.source,'coreRuns','intervalo deve conservar a tabela de origem');
assert.equal(hole.intervals[2].sourceRow.REC_PCT,96,'linha original deve permanecer auditável');
assert.equal(t.lithologyColor('Gnaísse'),t.lithologyColor('gnaisse'),'cor deve ser estável por litologia normalizada');

const slice=t.traceSliceByDepth(hole.trace,10,30,hole.depth);
assert.equal(slice.length,2);
assert.equal(Math.round(slice[0].z),90);
assert.equal(Math.round(slice[1].z),70);

const texts=[],strokeColors=[];
const ctx={
  fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){},arc(){},
  setLineDash(){},save(){},restore(){},translate(){},strokeRect(){},
  stroke(){strokeColors.push(this.strokeStyle);},
  fillText(text){texts.push(String(text));},strokeText(text){texts.push(String(text));}
};
canvas={style:{},getContext(){return ctx;}};
t.drawSection({
  name:'A–B',rasterName:'MDT',corridor:100,ve:2,met,profile,runs:[],
  holes,contacts:[],faults:[],fieldMarks:[],field:{enabled:false,interpreted:0}
});
for(const lithology of ['Solo residual','Gnaisse','Quartzito'])
  assert.ok(texts.includes(lithology),lithology+' deve ser rotulada no traço do furo');
for(const interval of hole.intervals)
  assert.ok(strokeColors.includes(interval.color),'a cor litológica deve ser desenhada na seção');

console.log('OK: logs e testemunhos são validados, projetados e rotulados na seção geológica.');
