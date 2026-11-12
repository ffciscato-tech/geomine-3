import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

// Actual bundled proj4, actual application CRS definitions and the original
// toWGS fallback. No coordinate lookup table or mocked projection arithmetic.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const vendor=read('src/vendor/proj4.min.js'),boot=read('src/core/parts/01-bootstrap-crs-state-command.js');
const definitions=boot.slice(boot.indexOf('const CRS_DEFS ='),boot.indexOf('/* Um par [lng,lat]'));
const originalFunction=boot.slice(boot.indexOf('function toWGS('),boot.indexOf('function fromWGS('));
const moduleSource=read('src/modules/persistence/project-opening.js');
const core=read('src/core/parts/26-project-persistence.js');
const originalLoad=core.slice(core.indexOf('function loadProject(d){'),core.indexOf("\ndocument.getElementById('btnSave').onclick"));
const plain=p=>Array.from(p);
function equal(actual,expected,message){assert.deepEqual(plain(actual),plain(expected),message);}
function fixture(){
 const calls={factories:new Map(),direct:0,forward:0,toasts:[],draw:0,raster:0,area:0};
 const failure={factory:false,forward:false,direct:false};
 const c={console,Map,toast:message=>calls.toasts.push(message),
  drawLayer(){calls.draw++;},renderRaster(){calls.raster++;},autoAreaSyncLayer(){calls.area++;}};
 c.window=c;vm.createContext(c);vm.runInContext(vendor,c);vm.runInContext(definitions,c);vm.runInContext(originalFunction,c);
 const real=c.proj4,original=c.toWGS;
 function instrument(engine){
  function spy(...args){
   if(args.length>=3){calls.direct++;if(failure.direct)throw Error('direct projection fault');return engine(...args);}
   calls.factories.set(args[0],(calls.factories.get(args[0])||0)+1);
   if(failure.factory)throw Error('converter construction fault');
   const converter=engine(...args),forward=converter.forward;
   return {...converter,forward(...params){calls.forward++;if(failure.forward)throw Error('converter forward fault');return forward.apply(converter,params);}};
  }
  Object.assign(spy,engine);return spy;
 }
 c.proj4=instrument(real);vm.runInContext(moduleSource,c);
 return {c,calls,failure,real,original,api:c.GeoMineProjectOpening,instrument,codes:vm.runInContext('Object.keys(CRS_DEFS)',c)};
}
const tests=[];const test=(name,run)=>tests.push([name,run]);

test('every registered Brazilian CRS plus EPSG:3857 matches unoptimized proj4 exactly',()=>{
 const f=fixture(),scope=f.api.begin(),codes=[...new Set([...f.codes,'EPSG:3857'])];
 for(const crs of codes){
  const d=f.real.defs(crs),lon=d.zone?6*d.zone-183:-49.5,lat=d.utmSouth?-28:4;
  for(const delta of [0,.05,-.07]){
   const p=f.real('EPSG:4326',crs,[lon+delta,lat+delta]),expected=f.real(crs,'EPSG:4326',p.slice());
   equal(f.c.toWGS(crs,p[0],p[1]),expected,crs);
  }
 }
 scope.end();assert.equal(f.c.toWGS,f.original);assert.ok(codes.includes('EPSG:31982')&&codes.includes('EPSG:31983')&&codes.includes('EPSG:4326'));
});
test('one converter per repeated CRS, fresh coordinate results and no input mutation',()=>{
 const f=fixture(),coords=Array.from({length:200},(_,i)=>[677409+i*.5,6865275+i]),snapshot=JSON.stringify(coords),scope=f.api.begin();
 for(const p of coords)equal(f.c.toWGS('EPSG:31982',...p),f.real('EPSG:31982','EPSG:4326',p.slice()));
 assert.equal(f.calls.factories.get('EPSG:31982'),1);assert.equal(f.calls.forward,coords.length);assert.equal(JSON.stringify(coords),snapshot);
 const p=coords[0],a=f.c.toWGS('EPSG:31982',...p);a[0]=999;
 equal(f.c.toWGS('EPSG:31982',...p),f.real('EPSG:31982','EPSG:4326',p.slice()));scope.end();
});
test('EPSG:4326 bypass and invalid numbers preserve original behavior without constructing a converter',()=>{
 const f=fixture(),inputs=[[10,20],[NaN,2],[Infinity,-Infinity],['3','4']];
 const expected=inputs.map(p=>f.original('EPSG:4326',...p)),scope=f.api.begin();
 inputs.forEach((p,i)=>equal(f.c.toWGS('EPSG:4326',...p),expected[i]));assert.equal(f.calls.factories.size,0);scope.end();
});
test('unknown CRS and throwing coordinates keep the fallback and the single global warning',()=>{
 const f=fixture(),scope=f.api.begin();
 equal(f.c.toWGS('INVALID:CRS',123,456),[123,456]);equal(f.c.toWGS('INVALID:CRS',9,8),[9,8]);
 equal(f.c.toWGS('EPSG:31982',NaN,7400000),[NaN,7400000]);assert.equal(f.calls.toasts.length,1);
 scope.end();equal(f.c.toWGS('INVALID:CRS',7,6),[7,6]);assert.equal(f.calls.toasts.length,1);assert.equal(f.original._warned,1);
 const again=f.api.begin();f.c.toWGS('INVALID:CRS',1,2);again.end();assert.equal(f.calls.toasts.length,1);
});
test('non-string CRS objects retain the original function behavior',()=>{
 const f=fixture(),definition={projName:'utm',zone:22,utmSouth:true,ellps:'GRS80',units:'m'},p=[500000,7400000];
 const expected=f.original(definition,...p),scope=f.api.begin();equal(f.c.toWGS(definition,...p),expected);scope.end();
});
test('converter construction and forward faults fall back to the original implementation',()=>{
 for(const fault of ['factory','forward']){
  const f=fixture(),p=[500000,7400000],expected=f.real('EPSG:31982','EPSG:4326',p.slice()),scope=f.api.begin();f.failure[fault]=true;
  equal(f.c.toWGS('EPSG:31982',...p),expected);assert.equal(f.calls.direct,1);scope.end();assert.equal(f.c.toWGS,f.original);
 }
});
test('replacing a source definition during a scope invalidates its old converter',()=>{
 const f=fixture(),scope=f.api.begin(),p=[500000,7400000],before=f.c.toWGS('EPSG:31982',...p),old=f.real.defs('EPSG:31982');
 f.real.defs('EPSG:31982','+proj=utm +zone=23 +south +ellps=GRS80 +units=m +no_defs');assert.notEqual(f.real.defs('EPSG:31982'),old);
 const after=f.c.toWGS('EPSG:31982',...p);equal(after,f.real('EPSG:31982','EPSG:4326',p.slice()));assert.notEqual(after[0],before[0]);assert.equal(f.calls.factories.get('EPSG:31982'),2);scope.end();
});
test('replacing the target definition or proj4 engine during a scope also invalidates the converter',()=>{
 const f=fixture(),scope=f.api.begin(),p=[500000,7400000];f.c.toWGS('EPSG:31982',...p);
 f.real.defs('EPSG:4326','+proj=longlat +ellps=clrk66 +towgs84=20,30,40 +no_defs');
 equal(f.c.toWGS('EPSG:31982',...p),f.real('EPSG:31982','EPSG:4326',p.slice()));assert.equal(f.calls.factories.get('EPSG:31982'),2);
 f.c.proj4=f.instrument(f.real);equal(f.c.toWGS('EPSG:31982',...p),f.real('EPSG:31982','EPSG:4326',p.slice()));assert.equal(f.calls.factories.get('EPSG:31982'),3);scope.end();
});
test('scope end is idempotent and a new load has no perpetual projection cache',()=>{
 const f=fixture(),p=[500000,7400000],first=f.api.begin();f.c.toWGS('EPSG:31982',...p);first.end();first.end();assert.equal(f.c.toWGS,f.original);
 f.c.toWGS('EPSG:31982',...p);assert.equal(f.calls.direct,1);
 f.real.defs('EPSG:31982','+proj=utm +zone=21 +south +ellps=GRS80 +units=m +no_defs');
 const second=f.api.begin();equal(f.c.toWGS('EPSG:31982',...p),f.real('EPSG:31982','EPSG:4326',p.slice()));assert.equal(f.calls.factories.get('EPSG:31982'),2);second.end();assert.equal(f.c.toWGS,f.original);
});
test('nested scopes restore their caller in LIFO order without leaking cache or warnings',()=>{
 const f=fixture(),outer=f.api.begin(),outerFunction=f.c.toWGS,p=[500000,7400000];f.c.toWGS('EPSG:31982',...p);
 const inner=f.api.begin();equal(f.c.toWGS('EPSG:31982',...p),f.real('EPSG:31982','EPSG:4326',p.slice()));f.c.toWGS('INVALID:CRS',1,2);
 inner.end();assert.equal(f.c.toWGS,outerFunction);f.c.toWGS('EPSG:31982',...p);assert.equal(f.calls.factories.get('EPSG:31982'),2);
 outer.end();inner.end();assert.equal(f.c.toWGS,f.original);f.c.toWGS('INVALID:CRS',1,2);assert.equal(f.calls.toasts.length,1);
});
test('the temporary cache evicts before retaining more than 32 source CRS pairs',()=>{
 const f=fixture(),scope=f.api.begin();
 for(let i=0;i<33;i++){const crs='TEST:'+i;f.real.defs(crs,`+proj=utm +zone=${18+i%8} +south +ellps=GRS80 +units=m +no_defs`);f.c.toWGS(crs,500000,7400000);}
 f.c.toWGS('TEST:0',500000,7400000);assert.equal(f.calls.factories.get('TEST:0'),2,'first pair must have been evicted');scope.end();
});
test('ending a scope does not overwrite a later replacement of toWGS',()=>{
 const f=fixture(),scope=f.api.begin(),replacement=()=>[4,5];f.c.toWGS=replacement;scope.end();assert.equal(f.c.toWGS,replacement);
});
test('the actual loadProject finally restores toWGS when project loading throws',()=>{
 const f=fixture();vm.runInContext(originalLoad,f.c);const fault=Error('synthetic load failure');
 f.c.GeoMineCivil={reset(){f.c.toWGS('EPSG:31982',500000,7400000);throw fault;}};
 assert.throws(()=>f.c.loadProject({}),e=>e===fault);assert.equal(f.c.toWGS,f.original);assert.equal(f.calls.factories.get('EPSG:31982'),1);
});
test('restore/ensure preserve deferred drawing and failure behavior',()=>{
 const f=fixture(),polygon={visible:false,gtype:'polygon'},raster={visible:false};f.api.restore(polygon,'L');f.api.restore(raster,'R');
 assert.equal(f.calls.area,1);assert.equal(f.calls.draw+f.calls.raster,0);assert.equal(polygon._projectDrawDeferred,true);assert.equal(raster._projectDrawDeferred,true);
 f.api.restore({visible:true,gtype:'line'},'L');assert.equal(f.calls.draw,1);f.api.ensure({t:'R',o:raster});assert.equal(f.calls.raster,1);
 f.c.renderRaster=()=>{throw Error('draw failure');};delete raster._projectDrawDeferred;f.api.ensure({t:'R',o:raster});assert.equal(raster._projectDrawDeferred,undefined);
 raster._projectDrawDeferred=true;assert.throws(()=>f.api.ensure({t:'R',o:raster}),/draw failure/);assert.equal(raster._projectDrawDeferred,true);
});
let passed=0;for(const [name,run] of tests){try{run();console.log('PASS '+name);passed++;}catch(error){console.error('FAIL '+name);throw error;}}
console.log(`${passed}/${tests.length} project opening projection checks passed`);
