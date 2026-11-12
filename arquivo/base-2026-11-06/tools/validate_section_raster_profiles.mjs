import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({}),plain=value=>JSON.parse(JSON.stringify(value));
vm.runInContext(fs.readFileSync(new URL('../src/modules/geology/section-raster-profiles.js',import.meta.url),'utf8'),context);
const api=context.GeoMineGeology.rasterProfiles;
let passed=0;function test(name,run){run();passed++;console.log('PASS '+name);}
function freeze(value){if(value&&typeof value==='object'&&!ArrayBuffer.isView(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const fixture=()=>({entries:[{id:'a',role:'water',mode:'elevation'}],rasters:[{id:'a',name:'Nível aquífero'}],
  dist:[0,5,20,30],points:[[0,0],[3,4],[12,16],[18,24]],terrainZ:[100,110,120,130],sampleRaster:(r,p,i)=>[80,90,100,110][i]});
test('module is pure and initializes without map or DOM dependencies',()=>{
  assert.ok(Object.isFrozen(api));assert.deepEqual(plain(api.sampleProfiles()),[]);
  assert.deepEqual(plain(api.normalizeEntries(null)),[]);
});
test('entries deduplicate by exact ID and never infer roles or units from raster names',()=>{
  const input=freeze([{id:0,role:'water',mode:'depth'},{id:'0',role:'contact',mode:'elevation'},
    {id:'water',role:'unknown',mode:'unknown'},'contact',{id:'   '},{id:false},{id:{}},null]);
  assert.deepEqual(plain(api.normalizeEntries(input)),[{id:'0',role:'water',mode:'depth'},
    {id:'water',role:'surface',mode:'elevation'},{id:'contact',role:'surface',mode:'elevation'}]);
  assert.deepEqual(plain(api.normalizeEntries({id:7,role:'contact',mode:'depth'})),[{id:'7',role:'contact',mode:'depth'}]);
});
test('style defaults and Canvas dashes are explicit, safe and independently allocated',()=>{
  assert.equal(api.defaults('water').color,'#087fca');assert.equal(api.defaults('contact').color,'#d97706');
  assert.equal(api.defaults('terrain').width,2.5);
  for(const [name,values] of [['solid',[]],['dash',[9,5]],['dot',[2,4]],['dashdot',[9,4,2,4]]])
    assert.deepEqual(plain(api.dashes({dash:name})),values);
  const first=api.dashes({dash:'dash'});first[0]=999;assert.deepEqual(plain(api.dashes('dash')),[9,5]);
  const style=api.normalizeStyle({color:'#AbC',width:22,dash:'dot',name:' Água\n subterrânea ',visible:false},'water');
  assert.deepEqual(plain(style),{color:'#aabbcc',width:10,dash:'dot',visible:false,name:'Água  subterrânea'});
  assert.equal(api.normalizeStyle({width:-5}).width,.5);
  assert.deepEqual(plain(api.normalizeStyle({color:'url(javascript:bad)',width:Infinity,dash:'script',visible:'false'},
    {color:'#112233',width:2.5,dash:'dashdot',visible:false})),{color:'#112233',width:2.5,dash:'dashdot',visible:false});
  assert.equal(api.normalizeStyle({width:'',name:''},{width:4,name:'old'}).width,4);
  assert.equal(Object.hasOwn(api.normalizeStyle({name:''},{name:'old'}),'name'),false);
});
test('elevation samples stay aligned with unequal stations, including legitimate negative elevations',()=>{
  const input=fixture();input.sampleRaster=(r,p,i)=>[-15,0,40,50][i];
  const profile=api.sampleProfiles(input)[0];assert.deepEqual(plain(profile.z),[-15,0,40,50]);
  assert.deepEqual(plain({...profile,z:[]}),{id:'a',key:'raster:a',name:'Nível aquífero',sourceName:'Nível aquífero',role:'water',mode:'elevation',z:[],warning:''});
});
test('depth is explicitly subtracted from terrain; negative depth and missing terrain remain gaps',()=>{
  const input=fixture();input.entries[0].mode='depth';input.sampleRaster=(r,p,i)=>[0,10,-5,20][i];input.terrainZ[3]=null;
  const result=api.sampleProfiles(input)[0];assert.deepEqual(plain(result.z),[100,100,null,null]);
  assert.ok(Number.isNaN(result.z[2])&&Number.isNaN(result.z[3]));assert.match(result.warning,/profundidade negativa/);
  assert.match(result.warning,/sem cota válida do terreno/);
  input.terrainZ=[-10,-5,0,5];input.sampleRaster=()=>20;assert.deepEqual(plain(api.sampleProfiles(input)[0].z),[-30,-25,-20,-15]);
});
test('null, NaN, infinity, strings and finite declared NoData are gaps, never zero or interpolated',()=>{
  const input=fixture();input.dist=[0,1,2,3,4,5,6,7];input.points=input.dist.map(x=>[x,0]);
  input.rasters[0].d={nodata:-9999};input.sampleRaster=(r,p,i)=>[null,undefined,NaN,Infinity,'0',-9999,0,-12][i];
  const result=api.sampleProfiles(input)[0];assert.ok(result.z.slice(0,6).every(Number.isNaN));
  assert.deepEqual(plain(result.z.slice(6)),[0,-12]);assert.match(result.warning,/6 amostra\(s\) sem dados/);
});
test('NoData metadata is respected at float32 precision without losing other negative elevations',()=>{
  const input=fixture(),nd=-3.4028234663852886e38;input.rasters[0].noData=String(nd);
  input.sampleRaster=(r,p,i)=>i===0?Math.fround(nd):-9999;
  assert.ok(Number.isNaN(api.sampleProfiles(input)[0].z[0]));assert.equal(api.sampleProfiles(input)[0].z[1],-9999);
});
test('missing sources are diagnosed independently; no fallback to first raster or terrain',()=>{
  const input=fixture();input.entries=[{id:'missing',role:'contact',mode:'elevation'},...input.entries];let calls=0;
  input.sampleRaster=()=>{calls++;return 12;};const profiles=api.sampleProfiles(input);
  assert.equal(profiles.length,2);assert.ok(profiles[0].z.every(Number.isNaN));assert.match(profiles[0].warning,/não está disponível/);
  assert.equal(calls,4);assert.deepEqual(plain(profiles[1].z),[12,12,12,12]);
});
test('unavailable coordinates and unequal arrays preserve station indexing',()=>{
  const input=fixture(),calls=[];input.points=[[1,2],[NaN,0]];
  input.sampleRaster=(r,p,i)=>{calls.push(i);return 99;};const result=api.sampleProfiles(input)[0];
  assert.deepEqual(calls,[0]);assert.equal(result.z.length,4);assert.equal(result.z[0],99);assert.ok(result.z.slice(1).every(Number.isNaN));
  assert.match(result.warning,/3 estação/);
});
test('sample errors remain local gaps, and an unavailable sampler gives an actionable warning',()=>{
  const input=fixture();input.sampleRaster=(r,p,i)=>{if(i===1)throw new Error('io');return 20;};
  const profile=api.sampleProfiles(input)[0];assert.ok(Number.isNaN(profile.z[1]));assert.match(profile.warning,/1 falha/);assert.equal(profile.z[2],20);
  delete input.sampleRaster;assert.match(api.sampleProfiles(input)[0].warning,/Amostrador.*indisponível/);
});
test('configuration, terrain, source and coordinate arrays are never changed or shared',()=>{
  const input=fixture(),before=JSON.stringify(input);freeze(input);
  const profiles=api.sampleProfiles({...input,sampleRaster:(r,p,i)=>{p[0]=999;return i;}});
  assert.equal(JSON.stringify(input),before);profiles[0].z[0]=999;assert.equal(input.terrainZ[0],100);assert.equal(input.points[0][0],0);
});
test('typed-array stations and object/typed-array XY points can be sampled without mutation',()=>{
  const input=fixture();input.dist=new Float64Array([0,5]);input.points=[new Float64Array([0,0]),{x:3,y:4}];input.terrainZ=new Float32Array([20,30]);
  input.entries[0].mode='depth';input.sampleRaster=(r,p,i)=>i+1;
  assert.deepEqual(plain(api.sampleProfiles(input)[0].z),[19,28]);
});
console.log(`PASS ${passed} section raster profile tests.`);
