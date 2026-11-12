const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'src/core/parts/25-geoprocessing-tin.js'),'utf8');
function part(src,start,end){const a=src.indexOf(start),b=src.indexOf(end,a);assert.ok(a>=0&&b>a,start);return src.slice(a,b);}
function context(src,layers){
 const ctx={S:{layers,workCRS:'EPSG:31984'},document:{querySelectorAll:()=>layers.map(l=>({dataset:{id:String(l.id)}})),getElementById:()=>({innerHTML:''})},reproj:(from,to,x,y)=>from===to?[x,y]:[x+100,y+200],showLoad(){},hideLoad(){},toast(){},setTimeout:f=>f(),refreshTinPanel(){},refreshGtPanel(){},refreshMergePanel(){},addLayer:l=>ctx.merged=l};
 vm.createContext(ctx);vm.runInContext([part(src,'function gtZg(f)','function gtZSource'),part(src,'function runMerge()','function refreshOverlayPanel'),part(src,'function tinCollect(','/* Condiciona a triangulacao')].join('\n'),ctx);return ctx;
}
const plain=x=>JSON.parse(JSON.stringify(x));
const curve=(id,feature)=>({id,name:'Curve '+id,gtype:'line',crs:'EPSG:31984',fields:[{name:'COTA',type:'N'}],features:[feature]});
const cases=[
 ['single-part imported', {geom:[[[0,0],[10,0],[10,10]]],multi:true,zg:[[0,10,20]],props:{COTA:10}},[[0,10,20]]],
 ['old merge singleton wrapper', {geom:[[0,0],[10,0],[10,10]],multi:false,zg:[[0,10,20]],props:{}},[[0,10,20]]],
 ['flat', {geom:[[0,0],[10,0]],zg:[-5,0]},[[-5,0]]],
 ['XYZ', {geom:[[0,0,10],[10,0,20]]},[[10,20]]],
 ['multipart', {geom:[[[0,0],[10,0]],[[0,10],[10,10]]],multi:true,zg:[[0,10],[20,30]]},[[0,10],[20,30]]],
 ['per-part scalar', {geom:[[[0,0],[10,0]],[[0,10],[10,10]]],multi:true,zg:[5,10]},[[5,5],[10,10]]],
 ['numeric strings', {geom:[[0,0],[1,1]],zg:['0','-2,5']},[[0,-2.5]]],
 ['missing is not sea level', {geom:[[0,0],[1,1],[2,0]],zg:[null,0,'']},[[null,0,null]]],
 ['invalid array is not borrowed', {geom:[[0,0],[1,1],[2,0]],zg:[[1,2],[3,4]]},null],
 ['length mismatch', {geom:[[0,0],[1,1],[2,0]],zg:[1,2]},null],
 ['2D', {geom:[[0,0],[1,1],[2,0]]},null]
];
const simple=context(source,[]);
for(const [name,f,expected]of cases){assert.deepEqual(plain(simple.gtZg(f)),expected,name);console.log('PASS '+name);}
const a=curve(1,cases[0][1]),b=curve(2,{geom:[[[0,30],[10,30]]],multi:true,zg:[[40,50]],props:{COTA:40}}),original=JSON.stringify([a,b]);
const c=context(source,[a,b]);c.runMerge();assert.equal(c.merged.features.length,2);assert.deepEqual(plain(c.merged.features[0].zg),[0,10,20]);assert.equal(c.merged.features[0].multi,false);assert.equal(c.merged.features[0].props.ORIGEM,'Curve 1');
const after=c.tinCollect(c.merged,'geom','COTA',2);assert.ok(after.xs.length>3);assert.equal(after.semZ,0);assert.ok(after.zs.every(Number.isFinite));
c.merged.features[0].zg[0]=999;assert.equal(JSON.stringify([a,b]),original,'merged Z must not share source arrays');
const missing=c.tinCollect(curve(5,cases[7][1]),'geom','',2);assert.equal(missing.xs.length,0,'never interpolate across absent Z');
const xyz=context(source,[curve(1,cases[3][1]),curve(2,cases[2][1])]);xyz.runMerge();assert.deepEqual(plain(xyz.merged.features[0].geom[1]),[10,0,20]);
const multi=context(source,[curve(1,cases[4][1]),b]);multi.runMerge();assert.equal(multi.merged.features[0].multi,true);assert.deepEqual(plain(multi.merged.features[0].zg),[[0,10],[20,30]]);
const projected=curve(10,cases[0][1]);projected.crs='EPSG:31983';const cross=context(source,[projected,b]);cross.runMerge();assert.deepEqual(plain(cross.merged.features[0].geom[0]),[100,200]);assert.deepEqual(plain(cross.merged.features[0].zg),[0,10,20]);
console.log('PASS merge independence, XYZ, multipart, reprojection, NoData and raster collection');
if(process.argv[2]){
 const file=path.resolve(process.argv[2]),p=JSON.parse(fs.readFileSync(file));const layers=p.layers.filter(l=>/^curvas_(mestras|secundarias)/.test(l.name));assert.equal(layers.length,2);
 const old=fs.readFileSync(path.join(root,'baseline/src/core/parts/25-geoprocessing-tin.js'),'utf8'),before=context(old,layers);before.runMerge();
 const broken=before.tinCollect(before.merged,'geom','COTA',5);assert.equal(broken.xs.length,0,'real baseline must reproduce failure');
 const next=context(source,layers);next.runMerge();const fresh=next.tinCollect(next.merged,'geom','COTA',5),recovered=next.tinCollect(before.merged,'geom','COTA',5);
 assert.ok(fresh.xs.length>1000);assert.equal(fresh.semZ,0);assert.equal(recovered.semZ,0);assert.deepEqual(plain(fresh),plain(recovered),'legacy merge recovers the exact same elevation samples');
 const expected=layers.flatMap(l=>l.features);assert.equal(next.merged.features.length,expected.length);
 next.merged.features.forEach((f,i)=>assert.deepEqual(plain(next.gtZg(f)),plain(next.gtZg(expected[i]))));
 console.log(JSON.stringify({realProject:true,features:expected.length,baselineSamples:broken.xs.length,correctedSamples:fresh.xs.length,originalVertices:fresh.nOrig,missingZ:fresh.semZ,minZ:fresh.zs.reduce((a,b)=>Math.min(a,b),Infinity),maxZ:fresh.zs.reduce((a,b)=>Math.max(a,b),-Infinity)}));
}
