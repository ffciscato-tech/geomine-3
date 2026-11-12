// Independent regression for geological terminology, attitude families and legacy data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const context={console,S:{layers:[],groups:[],stack:[],workCRS:'EPSG:31982'},document:{},
  setTimeout(){},clearTimeout(){},drawLayer(){},refreshUI(){},propRefresh(){},zApply(){},
  esc:value=>String(value??''),classOf:()=>null};
context.window=context;vm.createContext(context);
const sym=read('src/core/parts/05-layer-model-symbology.js');
vm.runInContext(sym.slice(sym.indexOf('const PT_SYMS='),sym.indexOf('/* GALERIA DE SÍMBOLOS')),context);
for(const name of ['geology-workspace','field-mapping','structural-standards'])
  vm.runInContext(read('src/modules/geology/'+name+'.js'),context,{filename:name+'.js'});
const api=context.GeoMineGeology,standards=api.standards;
assert.ok(standards,'standards module registered');
let checks=0;
function check(label,fn){fn();checks++;}

for(const family of ['sd_bed','sd_fol','sd_fol_generic','sd_cliv','sd_joint','lineation','foldaxis','lin_estir']){
  for(const base of [family,family+'_hz',family+'_vt']){
    for(const [angle,expected] of [[0,family+'_hz'],[.01,family],[45,family],[89.999,family],[90,family+'_vt'],['45',family]])
      check(`${base}/${angle}`,()=>assert.equal(standards.resolveShape(base,angle),expected));
    for(const angle of [null,undefined,'',' ',NaN,Infinity,-1,91,false,true,[],{}])
      check(`${base}/invalid`,()=>assert.equal(standards.resolveShape(base,angle),base,'invalid angle must not invent a measured attitude'));
  }
}
for(const shape of ['sd_bed_ov','custom_user_symbol','tr_vel20','circle'])
  for(const angle of [0,45,90])check(shape,()=>assert.equal(standards.resolveShape(shape,angle),shape,'explicit overturned/custom symbol is not a generic family'));

const families={acamamento:'sd_bed',foliacao:'sd_fol',xistosidade:'sd_fol',lineacao:'lineation',plunging:'foldaxis'};
function fixture(kind,angle,override={}){
  const linear=['lineacao','plunging'].includes(kind),shape=families[kind];
  return {id:'legacy-'+kind,name:'Nome personalizado — '+kind,gtype:'point',crs:'EPSG:31982',
    _geology:{kind},fields:[{name:'DIRECAO',type:'N'},{name:linear?'CAIMENTO':'MERGULHO',type:'N'},{name:'REF_ORIENT',type:'C'},{name:'CUSTOM',type:'C'}],
    sym:{mode:'single',pt:{shape,size:22,rot:0,rotField:'DIRECAO',dipField:linear?'CAIMENTO':'MERGULHO'}},
    features:[{geom:[[583820,7074990]],props:{DIRECAO:30,[linear?'CAIMENTO':'MERGULHO']:angle,REF_ORIENT:'strike_rhr',CUSTOM:'do not change',...override}}]};
}
for(const [kind,family] of Object.entries(families)){
  for(const [angle,variant] of [[0,family+'_hz'],[42,family],[90,family+'_vt']]){
    const layer=fixture(kind,angle),before=plain(layer),style=context.ptStyleOf(layer,layer.features[0],{});
    check(kind+' variant',()=>assert.equal(style.shape,variant));
    check(kind+' preserves rotation',()=>assert.equal(style.rot,30));
    check(kind+' immutable',()=>assert.deepEqual(plain(layer),before));
    check(kind+' registered SVG',()=>assert.ok(style.def&&typeof style.def.d==='function'));
  }
  for(const angle of [null,'',-1,91,NaN]){
    const layer=fixture(kind,angle),style=context.ptStyleOf(layer,layer.features[0],{});
    check(kind+' neutral incomplete',()=>assert.deepEqual({shape:style.shape,rot:style.rot,dip:style.dip},{shape:'circle',rot:null,dip:null}));
  }
  for(const configured of [family+'_hz',family+'_vt']){
    for(const angle of [0,35,90,null]){
      const layer=fixture(kind,angle);layer.sym.pt.shape=configured;
      const style=context.ptStyleOf(layer,layer.features[0],{}),expected=angle===null?'circle':angle===0?family+'_hz':angle===90?family+'_vt':family;
      check(kind+' variant follows observations',()=>assert.equal(style.shape,expected,configured+' must read valid actual attributes even if its glyph needs no rotation'));
    }
  }
}
for(const kind of ['acamamento','foliacao','xistosidade']){
  const layer=fixture(kind,45,{DIRECAO:120,REF_ORIENT:'dip_direction'}),style=context.ptStyleOf(layer,layer.features[0],{});
  check(kind+' dip direction',()=>assert.equal(style.rot,30,'RHR strike is dip direction minus 90°'));
  layer.features[0].props.REF_ORIENT='';
  check(kind+' ambiguous',()=>assert.equal(context.ptStyleOf(layer,layer.features[0],{}).shape,'circle'));
}
const mapped=fixture('foliacao',35);
mapped._geology.fieldMap={DIRECAO:'DD',MERGULHO:'ANGLE',REF_ORIENT:'CONV'};
mapped.fields=[{name:'DD',type:'N'},{name:'ANGLE',type:'N'},{name:'CONV',type:'C'}];
mapped.features[0].props={DD:355,ANGLE:35,CONV:'dip_direction'};
check('mapped orientation',()=>assert.equal(context.ptStyleOf(mapped,mapped.features[0],{}).rot,265));

check('terminology dip',()=>assert.match(standards.fieldLabel('MERGULHO','foliacao'),/mergulho.*dip/i));
check('terminology plunge',()=>assert.match(standards.fieldLabel('CAIMENTO','plunging'),/caimento.*plunge/i));
check('unknown field preserved',()=>assert.equal(standards.fieldLabel('CUSTOM_FIELD','foliacao'),'CUSTOM_FIELD'));
for(const kind of Object.keys(api.presets))
  check('catalog '+kind,()=>assert.ok(standards.description(kind),'every existing geological item has contextual terminology'));
for(const kind of ['lineacao','plunging']){
  const labels=standards.orientationLabels(kind,families[kind]);
  check(kind+' angle label',()=>assert.match(labels.angle,/caimento|plunge/i));
  check(kind+' direction label',()=>assert.match(labels.direction,/direção|azimute|trend/i));
}
check('planar labels',()=>assert.match(standards.orientationLabels('foliacao','sd_fol').angle,/mergulho|dip/i));
check('generic new foliation',()=>assert.equal(api.presets.foliacao.shape,'sd_fol_generic','new foliation does not assume tectonic/metamorphic origin'));
check('schistosity metamorphic',()=>assert.equal(api.presets.xistosidade.shape,'sd_fol','schistosity retains metamorphic foliation'));
for(const shape of ['lineation','foldaxis','lin_estir']){
  const definition=vm.runInContext(`PT_SYMS[${JSON.stringify(shape)}]`,context);
  check(shape+' lower-tail anchor',()=>assert.equal(definition.anchor,'tail'));
  check(shape+' actual observed point',()=>assert.match(definition.d('#aaa','#111',1),/M0,0 V-10/,'lower end starts exactly at map coordinate, not symbol center'));
}
for(const shape of ['sd_fol','sd_fol_generic']){
  const definition=vm.runInContext(`PT_SYMS[${JSON.stringify(shape)}]`,context);
  check(shape+' center anchor',()=>assert.match(definition.d('#aaa','#111',1),/M0,-10 V10/,'strike line centered on observation coordinate'));
}
for(const angle of [0,35,90])check('legacy schistosity alias',()=>assert.equal(standards.resolveShape('sd_xist',angle),angle===0?'sd_fol_hz':angle===90?'sd_fol_vt':'sd_fol'));
for(const [kind,shape] of [['foliacao','sd_cliv'],['foliacao','sd_joint'],['lineacao','lin_estir']]){
  for(const angle of [0,35,90,null]){
    const layer=fixture(kind,angle);layer.sym.pt.shape=shape;
    const style=context.ptStyleOf(layer,layer.features[0],{}),expected=angle===null?'circle':angle===0?shape+'_hz':angle===90?shape+'_vt':shape;
    check(shape+' rendered family',()=>assert.equal(style.shape,expected));
  }
}
for(const shape of ['foldaxis','foldaxis_hz']){
  const definition=vm.runInContext(`PT_SYMS[${JSON.stringify(shape)}]`,context);
  for(const weight of [.8,2.2,8]){
    const svg=definition.d('#aaa','#111',weight),radius=Number(svg.match(/<circle[^>]*\br="([^"]+)"/)?.[1]),shaft=Number(svg.match(/stroke-width="([^"]+)"/)?.[1]);
    check(shape+' distinct fold marker '+weight,()=>assert.ok(Number.isFinite(radius)&&Number.isFinite(shaft)&&radius*2>shaft,'fold-axis circle must remain visible beyond the shaft at every supported stroke weight'));
  }
}
console.log(`OK: ${checks} geological standards checks; valid attitude variants, RHR mapping, terminology and unchanged legacy/custom data.`);
