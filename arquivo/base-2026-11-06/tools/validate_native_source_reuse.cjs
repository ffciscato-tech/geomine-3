const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline');
const text=fs.readFileSync(path.join(root,baseline?'baseline/src':'src','core/parts/11-geotiff-project-workspace.js'),'utf8');
const noop=()=>{},missing=()=>Object.assign(Error('missing'),{name:'NotFoundError'});
const grid=()=>({nc:4,nr:1,cs:1,xll:0,yll:0,z:Float32Array.of(10,10,10,10)});
function harness(){
 const files=new Map(),counts={writes:0,encodes:0,catalogs:0},ds={rasters:{async getFileHandle(name){if(!files.has(name))throw missing();return {getFile:async()=>files.get(name)};}}};
 const c={Blob,Uint8Array,Float32Array,ArrayBuffer,TextEncoder,Date,Math,console,
  S:{projectId:'A',workCRS:'EPSG:31982',rasters:[]},GeoMineSessionAutosave:{state:{generation:1}},
  projectSafeName:(s,e)=>s+e,projectFolderStatus:noop,cmdLog:noop,showLoad:noop,esc:String,
  projectDirs:async()=>ds,projectChooseFolder:async()=>false,precisaFonte:()=>false,
  gridParaGeoTIFF:g=>{counts.encodes++;return g.z;},
  projectWriteCatalog:async()=>counts.catalogs++,
  projectWrite:async(d,name,blob)=>{counts.writes++;const out=Object.assign(new Blob([blob]),{lastModified:1000+counts.writes});files.set(name,out);return out;}
 };c.window=c;vm.createContext(c);
 vm.runInContext(text.slice(text.indexOf('function projectNativeHash('),text.indexOf('async function projectAutoSaveShape(')),c);
 if(!baseline)vm.runInContext(fs.readFileSync(path.join(root,'src/modules/persistence/native-source-reuse.js'),'utf8'),c);
 return {c,counts,files};
}
(async()=>{
 {
  const {c,counts,files}=harness(),raw=new Blob(['same original TIFF']);c.S.img={name:'ortho',url:'preview1',_sourceRaw:raw};
  assert.equal(await c.projectAutoSaveOrtho(false),true);const name=c.S.img.projectFile,n=counts.writes;
  c.S.img.url='rebuilt-preview';assert.equal(await c.projectAutoSaveOrtho(false),true);
  if(baseline){assert.equal(counts.writes,n+1);console.log('REPRODUCED unchanged original duplicated after display preview rebuild');return;}
  assert.equal(counts.writes,n);assert.equal(c.S.img.projectFile,name);
  c.projectNativeInvalidate(c.S.img);c.S.img._sourceRaw=new Blob([raw]);c.S.img.url='relinked-preview';
  assert.equal(await c.projectAutoSaveOrtho(false),true);assert.equal(counts.writes,n);assert.equal(c.S.img.projectFile,name);
  const key=name.split('/').pop(),same=files.get(key);files.set(key,Object.assign(new Blob([same]),{lastModified:9876}));
  assert.equal(await c.projectAutoSaveOrtho(false),true);assert.equal(counts.writes,n);assert.equal(c.S.img.projectNativeSource.lastModified,9876);
  assert.equal(await c.projectNativeMatches(files.get(key),c.S.img.projectNativeSource),true);
  c.projectNativeInvalidate(c.S.img);c.S.img._sourceRaw=new Blob(['different source!!!']);c.S.img.url='new-source-preview';
  assert.equal(await c.projectAutoSaveOrtho(false),true);assert.equal(counts.writes,n+1);assert.notEqual(c.S.img.projectFile,name);assert.equal(await files.get(key).text(),await raw.text());
  console.log('PASS preview changes, same-source relink and Drive mtime reuse one TIFF; different source creates a separate revision');
 }
 {
  const {c,counts,files}=harness(),r={id:1,name:'DEM',d:grid()};c.S.rasters=[r];
  assert.deepEqual(await Promise.all([c.projectAutoSaveRaster(r,false),c.projectAutoSaveRaster(r,false)]),[true,true]);
  assert.equal(counts.writes,1);assert.equal(counts.encodes,1);const name=r.projectFile;
  r.style={opacity:0.5};r.visible=false;r.name='DEM renamed';
  for(let i=0;i<3;i++)assert.equal(await c.projectAutoSaveRaster(r,false),true);
  assert.equal(counts.writes,1);assert.equal(counts.encodes,1);assert.equal(r.projectFile,name);
  const key=name.split('/').pop();files.delete(key);assert.equal(await c.projectAutoSaveRaster(r,false),true);assert.equal(counts.writes,2);assert.equal(counts.encodes,2);
  const unchanged=r.projectFile;r.d.z[1]=25;assert.equal(await c.projectAutoSaveRaster(r,false),true);assert.equal(counts.writes,3);assert.notEqual(r.projectFile,unchanged);
  const data=await files.get(r.projectFile.split('/').pop()).arrayBuffer();assert.equal(new Float32Array(data)[1],25);
  console.log('PASS repeated/concurrent saves do not regenerate unchanged grids; missing files and edited cells get a new safe copy');
 }
 {
  const {c,counts}=harness(),r={id:2,name:'Large DEM',d:{...grid(),nc:100000,z:new Float32Array(100000).fill(10)}};c.S.rasters=[r];
  await c.projectAutoSaveRaster(r,false);const name=r.projectFile,fingerprint=r.projectNativeSource.fingerprint;
  r.d.z[25000]=99; // Outside the sampled head, middle and tail byte windows.
  await c.projectAutoSaveRaster(r,false);assert.equal(counts.writes,2);assert.notEqual(r.projectFile,name);
  assert.equal(r.projectNativeSource.fingerprint,fingerprint,'fixture proves that sampled bytes cannot authorize reuse of edited cells');
  console.log('PASS edited cells outside fingerprint samples never reuse a stale generated TIFF');
 }
 {
  const {c,counts}=harness(),r={id:3,name:'queued',d:grid()};c.S.rasters=[r];
  const task=c.projectAutoSaveRaster(r,false);c.GeoMineSessionAutosave.state.generation++;
  assert.equal(await task,false);assert.equal(counts.writes,0);
  console.log('PASS queued save cannot write after project replacement');
 }
})().catch(e=>{console.error(e);process.exitCode=1});
