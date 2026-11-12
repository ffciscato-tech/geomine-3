import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const state={layers:[],groups:[],stack:[],activeId:9,workCRS:'EPSG:31982',geology:{}};
let failDrawing=false,addCalls=0;
const api={presets:{sondagem:{}},ensureGroup(){if(!state.groups.length)state.groups.push({id:1,name:'Geologia'});return state.groups[0];},
  applyPreset(l){l._geology={kind:'sondagem'};state.groups.push({id:2});state.stack.push('G:2');},refresh(){}};
const ctx={window:{GeoMineGeology:api,GeoMineBoreholeReader:{limits:{holes:10000,traceTotal:1000000,tracePerHole:12000}}},
  S:state,proj4:{Proj:class{units='m';projName='utm';}},console,
  addLayer(o){addCalls++;const l={...o,id:11,sym:{},lbl:{},llayer:{}};state.layers.push(l);state.activeId=l.id;return l;},
  drawLayer(){if(failDrawing)throw new Error('Synthetic draw failure');},refreshUI(){},map:{removeLayer(){}}};
vm.runInNewContext(fs.readFileSync(new URL('../src/modules/geology/borehole-import.js',import.meta.url),'utf8'),ctx);
const commit=api.boreholes.__test.commitParsed;
const guess=api.boreholes.__test.guess;
for(const [key,column] of [['id','hole_id'],['depth','max_depth'],['from','depth_from'],['to','depth_to'],['x','xcollar'],['y','ycollar'],['z','zcollar']])assert.equal(guess([column],key),column);
assert.equal(guess(['depth_from','depth_to'],'depth'),'','do not confuse interval depths with total depth');
const make=()=>({holes:[{id:'001',collar:[583000,7074000,300],depth:100,trace:[{x:583000,y:7074000,z:300,md:0},{x:583000,y:7074000,z:200,md:100}],survey:[{md:0,az:0,dip:90}],geologyLog:[{DE_M:0,ATE_M:100,LITOLOGIA:'Calcário'}],coreRuns:[],tables:[],attributes:{CAMPAIGN:'A'},source:{method:'minimum-curvature'}}],warnings:[]});
const options={crs:'EPSG:31982',unitsConfirmed:true,files:['collar.csv'],mode:'csv'};
function reject(edit){const input=make();edit(input);assert.throws(()=>commit(input,options),/inválid|limite/);assert.equal(addCalls,0);assert.equal(state.layers.length,0);}
reject(p=>p.holes[0].depth=Infinity);
reject(p=>p.holes[0].trace[1].x=NaN);
reject(p=>p.holes[0].trace[0].md=1);
reject(p=>p.holes[0].trace[1].md=0);
reject(p=>p.holes[0].trace[1].md=99);
reject(p=>p.holes[0].collar[0]+=1);
reject(p=>p.holes.push(structuredClone(p.holes[0])));
assert.throws(()=>commit(make(),{...options,unitsConfirmed:false}),/Confirme/);assert.equal(addCalls,0);
failDrawing=true;assert.throws(()=>commit(make(),options),/Synthetic/);
assert.equal(state.layers.length,0);assert.equal(state.groups.length,0);assert.equal(state.stack.length,0);assert.equal(state.activeId,9);
failDrawing=false;const layer=commit(make(),options),f=layer.features[0];
assert.equal(JSON.stringify(f.geom),'[[583000,7074000]]');assert.equal(JSON.stringify(f.zg),'[300]');
assert.equal(f.boreholeTrace[1].md,100);assert.equal(f.geologyLog[0].LITOLOGIA,'Calcário');
assert.equal(f.props.ID_FURO,'001');assert.equal(f.boreholeSource.method,'minimum-curvature');
assert.equal(layer.locked,true);assert.equal(layer._geology.importedBoreholes,true);assert.equal(layer.labelField,'ID_FURO');
const collarOnly=make();Object.assign(collarOnly.holes[0],{depth:null,trace:collarOnly.holes[0].trace.slice(0,1),survey:[],geologyLog:[],source:{method:'collar-only',depthBasis:'unknown'}});
const point=commit(collarOnly,options).features[0];assert.equal(point.props.PROF_M,null);assert.equal(point.boreholeTrace.length,1);assert.equal(point.boreholeSource.depthBasis,'unknown');
assert.equal(point.boreholeSurvey.length,0);assert.equal(point.geologyLog.length,0);
collarOnly.holes[0].geologyLog=[{DE_M:0,ATE_M:10}];assert.throws(()=>commit(collarOnly,options),/inválid/,'collar-only cannot smuggle fictitious intervals');
console.log('PASS: atomic borehole commit guards, native point/zg, MD/source preservation and drawing-failure rollback.');
