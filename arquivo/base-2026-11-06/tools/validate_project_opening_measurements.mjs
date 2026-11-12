/* Actual proj4 and measurement functions; optional private fixture paths may
   be passed on the command line. No file/project is written by this suite. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const boot=read('src/core/parts/01-bootstrap-crs-state-command.js'),measure=read('src/core/parts/09-measurement-properties-cad.js'),sym=read('src/core/parts/05-layer-model-symbology.js'),core=read('src/core/parts/26-project-persistence.js');
const definitions=boot.slice(boot.indexOf('const CRS_DEFS ='),boot.indexOf('/* Um par [lng,lat]')),
 projections=boot.slice(boot.indexOf('function toWGS('),boot.indexOf('/* Reconhecer CRS')),
 metrics=measure.slice(0,measure.indexOf('function autoAreaNormName(')),
 totals=measure.slice(measure.indexOf('function layerTotals('),measure.indexOf('function fmtArea(')),
 filters=sym.slice(sym.indexOf('function attrFilterNumber('),sym.indexOf('function featureVisible(')),
 opening=read('src/modules/persistence/project-opening.js'),vendor=read('src/vendor/proj4.min.js');
function fixture(){
 const calls={factories:new Map(),direct:0,forward:0},fault={factory:false,forward:false};
 const c={console,S:{workCRS:'EPSG:31982'},toast(){},drawLayer(){},renderRaster(){},autoAreaSyncLayer(){}};c.window=c;vm.createContext(c);
 vm.runInContext(vendor,c);vm.runInContext(definitions,c);vm.runInContext(projections,c);vm.runInContext(metrics+filters+totals,c);
 const real=c.proj4,original=c.reproj,originalToWGS=c.toWGS;
 function instrument(engine){
  function spy(...args){
   if(args.length>=3){calls.direct++;return engine(...args);}
   const key=JSON.stringify(args);calls.factories.set(key,(calls.factories.get(key)||0)+1);
   if(fault.factory)throw Error('factory failed');
   const out=engine(...args),forward=out.forward;
   return {...out,forward(...params){calls.forward++;if(fault.forward)throw Error('forward failed');return forward.apply(out,params);}};
  }Object.assign(spy,engine);return spy;
 }
 c.proj4=instrument(real);vm.runInContext(opening,c);return {c,real,calls,fault,original,originalToWGS,instrument,api:c.GeoMineProjectOpening};
}
const plain=v=>JSON.parse(JSON.stringify(v)),equal=(a,b)=>assert.deepEqual(plain(a),plain(b)),coords=(a,b)=>assert.deepEqual(Array.from(a),Array.from(b));
const ring=(x,y,r,n=240)=>Array.from({length:n+1},(_,i)=>{const a=i%n*2*Math.PI/n;return [x+r*Math.cos(a),y+r*Math.sin(a)];});
function layers(){
 return [{gtype:'polygon',crs:'EPSG:4674',visible:false,fields:[{name:'K',type:'N'}],attrFilter:null,features:[
  {multi:true,geom:[ring(-50,-26,.03),ring(-50,-26,.01).reverse(),ring(-50,-26,.003),ring(-50.1,-26,.006)],props:{K:1},zg:[[1,2,3]]},
  {geom:ring(-49.9,-26,.02),props:{K:2},zg:[4,5,6]}]},
  {gtype:'line',crs:'EPSG:4674',visible:false,fields:[],features:[{geom:[[-50,-26],[-50.1,-26.1],[-50.2,-26.15]],props:{}}]},
  {gtype:'point',crs:'EPSG:31983',features:[{geom:[[500000,7400000]],props:{},zg:[100]}]}];
}
let passed=0;const tests=[];function test(name,run){tests.push([name,run]);}
test('all supported CRS pairs return exactly the original reproj coordinates',()=>{
 const f=fixture(),codes=vm.runInContext('Object.keys(CRS_DEFS)',f.c).concat(['EPSG:3857']),scope=f.api.begin();
 for(const from of codes)for(const to of codes){const p=f.real('EPSG:4326',from,[-50,-26]);coords(f.c.reproj(from,to,...p),f.original(from,to,...p));}
 scope.end();assert.equal(f.c.reproj,f.original);
});
test('reproj and toWGS share one bounded pair, but each point still gets transformed',()=>{
 const f=fixture(),scope=f.api.begin();
 for(let i=0;i<100;i++){
  coords(f.c.reproj('EPSG:4674','EPSG:31982',-50-i*.0001,-26),f.real('EPSG:4674','EPSG:31982',[-50-i*.0001,-26]));
  f.c.reproj('EPSG:31982','EPSG:4326',500000+i,7400000);f.c.toWGS('EPSG:31982',500000+i,7400000);
 }
 assert.equal(f.calls.factories.size,2);assert.ok([...f.calls.factories.values()].every(n=>n===1));assert.equal(f.calls.forward,300);
 scope.end();assert.equal(f.c.reproj,f.original);assert.equal(f.c.toWGS,f.originalToWGS);
});
test('actual areas, holes, disconnected parts, lengths, Z summaries and attribute filters remain identical',()=>{
 const f=fixture(),ls=layers(),snapshot=JSON.stringify(ls),expected=ls.map(L=>({totals:f.c.layerTotals(L),summary:f.c.layerSummaryMetrics(L),features:L.features.map(x=>f.c.measureFeature(L,x))}));
 const scope=f.api.begin();ls.forEach((L,i)=>equal({totals:f.c.layerTotals(L),summary:f.c.layerSummaryMetrics(L),features:L.features.map(x=>f.c.measureFeature(L,x))},expected[i]));
 ls[0].attrFilter={field:'K',op:'eq',value:'1'};
 const optimized=f.c.layerTotals(ls[0]);scope.end();equal(optimized,f.c.layerTotals(ls[0]));ls[0].attrFilter=null;
 assert.equal(JSON.stringify(ls),snapshot);assert.ok(expected[0].summary.furos>=1);assert.ok(expected[0].summary.partes>=3);
});
test('in-place edits and changing work CRS during the scope are measured anew, never served as cached metrics',()=>{
 const f=fixture(),L=layers()[0],scope=f.api.begin(),first=f.c.layerTotals(L);
 L.features[0].geom[0][10][0]+=.001;const edited=f.c.layerTotals(L);assert.notEqual(first.area,edited.area);
 f.c.S.workCRS='EPSG:31983';const different=f.c.layerTotals(L);assert.notEqual(edited.area,different.area);
 scope.end();equal(different,f.c.layerTotals(L));
});
test('same CRS, malformed numbers and object definitions preserve the original fallback semantics',()=>{
 const f=fixture(),definition={projName:'utm',zone:22,utmSouth:true,ellps:'GRS80',units:'m'},cases=[
  ['EPSG:4674','EPSG:4674',NaN,Infinity],['MISSING','EPSG:31982',1,2],['EPSG:4674','MISSING',3,4],
  ['EPSG:4674','EPSG:31982',NaN,4],[definition,'EPSG:4326',500000,7400000],[null,null,'x','y']];
 const expected=cases.map(a=>f.original(...a)),scope=f.api.begin();cases.forEach((a,i)=>coords(f.c.reproj(...a),expected[i]));scope.end();
});
test('construction and converter failures fall through to the real original implementation',()=>{
 for(const name of ['factory','forward']){const f=fixture(),scope=f.api.begin();f.fault[name]=true;
  coords(f.c.reproj('EPSG:4674','EPSG:31982',-50,-26),f.real('EPSG:4674','EPSG:31982',[-50,-26]));assert.equal(f.calls.direct,1);scope.end();}
});
test('source/target definition and engine replacement invalidate the prepared projection pair',()=>{
 const f=fixture(),scope=f.api.begin(),args=['EPSG:4674','EPSG:31982',-50,-26];f.c.reproj(...args);
 f.real.defs('EPSG:31982','+proj=utm +zone=23 +south +ellps=GRS80 +units=m +no_defs');coords(f.c.reproj(...args),f.real(args[0],args[1],args.slice(2)));
 f.real.defs('EPSG:4674','+proj=longlat +ellps=clrk66 +towgs84=20,30,40 +no_defs');coords(f.c.reproj(...args),f.real(args[0],args[1],args.slice(2)));
 f.c.proj4=f.instrument(f.real);coords(f.c.reproj(...args),f.real(args[0],args[1],args.slice(2)));
 assert.equal(f.calls.factories.get(JSON.stringify(args.slice(0,2))),4);scope.end();
});
test('both entry points together retain at most 32 converters and no scope data survives end',()=>{
 const f=fixture(),scope=f.api.begin();
 for(let i=0;i<33;i++){const target='TEST:'+i;f.real.defs(target,`+proj=utm +zone=${18+i%8} +south +ellps=GRS80 +units=m +no_defs`);f.c.reproj('EPSG:4674',target,-50,-26);}
 f.c.reproj('EPSG:4674','TEST:0',-50,-26);assert.equal(f.calls.factories.get('["EPSG:4674","TEST:0"]'),2);
 scope.end();scope.end();const n=f.calls.direct;f.c.reproj('EPSG:4674','TEST:0',-50,-26);assert.equal(f.calls.direct,n+1);
 const again=f.api.begin();f.c.reproj('EPSG:4674','TEST:0',-50,-26);again.end();assert.equal(f.calls.factories.get('["EPSG:4674","TEST:0"]'),3);
});
test('nested scopes restore caller functions without clobbering later function replacements',()=>{
 const f=fixture(),a=f.api.begin(),outer=f.c.reproj,b=f.api.begin();f.c.reproj('EPSG:4674','EPSG:31982',-50,-26);b.end();assert.equal(f.c.reproj,outer);a.end();assert.equal(f.c.reproj,f.original);
 const c=f.api.begin(),replacement=()=>[1,2];f.c.reproj=replacement;c.end();assert.equal(f.c.reproj,replacement);
});
test('the real loadProject finally cleans reproj and toWGS when any load stage throws',()=>{
 const f=fixture(),text=core.slice(core.indexOf('function loadProject(d){'),core.indexOf("\ndocument.getElementById('btnSave').onclick"));vm.runInContext(text,f.c);
 f.c.GeoMineCivil={reset(){f.c.reproj('EPSG:4674','EPSG:31982',-50,-26);throw Error('load interrupted');}};
 assert.throws(()=>f.c.loadProject({}),/load interrupted/);assert.equal(f.c.reproj,f.original);assert.equal(f.c.toWGS,f.originalToWGS);
});
for(const name of process.argv.slice(2))test('private fixture measurement equivalence: '+path.basename(name),()=>{
 const project=JSON.parse(fs.readFileSync(name,'utf8')),snapshot=JSON.stringify(project),f=fixture();f.c.S.workCRS=project.workCRS;
 const expected=project.layers.map(L=>f.c.layerTotals(L)),scope=f.api.begin();
 project.layers.forEach((L,i)=>equal(f.c.layerTotals(L),expected[i]));scope.end();assert.equal(JSON.stringify(project),snapshot);
 console.log('  '+project.layers.length+' layers; all totals identical; private input unchanged');
});
for(const [name,run] of tests){try{run();passed++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name);throw e;}}
console.log(`${passed}/${tests.length} scoped project measurement checks passed`);
