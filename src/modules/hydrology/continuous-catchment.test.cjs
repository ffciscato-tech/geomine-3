const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const dev=require('node:path').resolve(__dirname,'../../..');
const ctx={window:{},console,Float32Array,Float64Array,Uint8Array,Uint32Array,Int32Array,AbortController,setTimeout,clearTimeout};vm.createContext(ctx);
for(const name of ['native-flood-engine','point-catchment-engine','continuous-catchment-engine','point-catchment-snap'])vm.runInContext(fs.readFileSync(dev+'/src/modules/hydrology/'+name+'.js','utf8'),ctx);
const engine=ctx.window.GeoMineContinuousCatchment,raw=ctx.window.GeoMinePointCatchmentEngine;
function source(nc,nr,fn,extra={}){const z=Float64Array.from({length:nc*nr},(_,i)=>fn(i%nc,Math.floor(i/nc))),windows=[];
 return {nc,nr,cs:2,csy:3,xll:300000,yll:7600000,z,windows,...extra,readWindow:async w=>{windows.push(w);const [a,b,c,d]=w;return Float64Array.from({length:(c-a)*(d-b)},(_,i)=>z[(b+Math.floor(i/(c-a)))*nc+a+i%(c-a)]);}};}
function checkArea(r,s){assert(Math.abs(r.areaM2-r.cells*s.cs*s.csy)<1e-8);assert.equal(r.filled,false);assert.equal(r.nativeResolution,true);assert.equal(r.stable,true);
 assert(Math.abs(r.ringInfo.reduce((n,x)=>n+x.areaM2,0)-r.areaM2)<1e-8);for(const ring of r.rings)assert.deepEqual(ring[0],ring.at(-1));}
test('ordinary descending terrain keeps strict D8 area and anisotropic native contour',async()=>{
 const s=source(41,41,(x,y)=>200-y+Math.abs(x-20)*4.17),seed={col:20,row:30},before=s.z.slice();
 const reference=await raw.analyze(s,{seed});const r=await engine.analyze(s,{seed});assert.equal(r.cells,reference.cells);checkArea(r,s);assert.deepEqual(s.z,before);
});
test('a small depression no longer disconnects upstream terrain; original elevations stay byte-identical',async()=>{
 const regular=source(41,41,(x,y)=>200-y+Math.abs(x-20)*4.17),s=source(41,41,(x,y)=>200-y+Math.abs(x-20)*4.17-(x===20&&y>=10&&y<=13?8:0)),seed={col:20,row:30},before=Buffer.from(s.z.buffer).toString('hex');
 const reference=await raw.analyze(regular,{seed}),fragment=await raw.analyze(s,{seed}),r=await engine.analyze(s,{seed});
 assert(fragment.cells<reference.cells);assert.equal(r.cells,reference.cells);assert.equal(Buffer.from(s.z.buffer).toString('hex'),before);checkArea(r,s);
});
test('native window expands for the whole basin and checks stability',async()=>{
 const s=source(201,201,(x,y)=>500-y+Math.abs(x-100)*4.173),seed={col:100,row:160};
 const r=await engine.analyze(s,{seed,initialRadiusM:4}),reference=await raw.analyze(s,{seed});assert(r.rounds>1);assert.equal(r.cells,reference.cells);checkArea(r,s);
});
test('NoData is never included and missing-data boundary is explicit',async()=>{
 const s=source(33,33,(x,y)=>x>12&&x<17&&y>5&&y<9?NaN:200-y+Math.abs(x-16)*4.17),r=await engine.analyze(s,{seed:{col:16,row:32}});
 assert(r.touchesNoData);assert(r.touchesEdge);assert(r.cells<s.nc*s.nr);checkArea(r,s);await assert.rejects(engine.analyze(s,{seed:{col:14,row:7}}),/válida/);
});
test('cancellation, replaced source and memory exhaustion return no partial polygon',async()=>{
 const s=source(500,500,(x,y)=>1000-y+Math.abs(x-250)*4),controller=new AbortController();controller.abort();
 await assert.rejects(engine.analyze(s,{seed:{col:250,row:400},signal:controller.signal}),{name:'AbortError'});
 s.isCurrent=()=>false;await assert.rejects(engine.analyze(s,{seed:{col:250,row:400}}),{name:'AbortError'});delete s.isCurrent;
 await assert.rejects(engine.analyze(s,{seed:{col:250,row:400},maxMemoryMB:1}),/memória/);
});
test('Float32 storage is used only when precision is proven; invalid CRS scale is refused',async()=>{
 const s=source(8,8,(x,y)=>10-y*.173,{float32:true});await assert.rejects(engine.analyze(s,{seed:{col:4,row:4}}),/precisão/);
 await assert.rejects(engine.analyze({...s,cs:0},{seed:{col:4,row:4}}),/Georreferenciamento/);
});
test('snap is nearest segment station, with visibility and projection, never maximum accumulation downstream',()=>{
 const flow={name:'Linhas de Fluxo',gtype:'line',features:[{geom:[[0,0],[20,0]]},{geom:[[8,1],[8,20]],hide:true}]};
 const hidden={...flow,visible:false,features:[{geom:[[0,.9],[20,.9]]}]};
 const r=ctx.window.GeoMineCatchmentSnap.nearest([hidden,flow],[10,1],{tolerance:2,visible:(l,f)=>!f.hide});
 assert.equal(r.point[0],10);assert.equal(r.point[1],0);assert.equal(r.distance,1);assert.equal(r.index,0);
 assert.equal(ctx.window.GeoMineCatchmentSnap.nearest([flow],[50,50]),null);
 const projected=ctx.window.GeoMineCatchmentSnap.nearest([flow],[110,1],{tolerance:2,visible:(l,f)=>!f.hide,project:p=>[p[0]+100,p[1]]});assert.equal(projected.point[0],110);
});
// Sample adapter tests independently specify known pixel coordinates/values.
ctx.window.proj4=(a,b)=>b?{forward:p=>p}:{oProj:{projName:'utm',units:'m',to_meter:1}};
ctx.window.GeoMineTileRuntime={read:async(image,{window:w})=>{const [a,b,c,d]=w;return [Float32Array.from({length:(c-a)*(d-b)},(_,i)=>(b+Math.floor(i/(c-a)))*10+a+i%(c-a))];}};
vm.runInContext(fs.readFileSync(dev+'/src/modules/environmental/channel-dem-sampler.js','utf8'),ctx);
function raster(point=true,full=false,corrected=false){const image={fileDirectory:{SampleFormat:[3],BitsPerSample:[32]},getGeoKeys:()=>({GTRasterTypeGeoKey:point?2:1}),getBoundingBox:()=>[10,20,30,40],getWidth:()=>10,getHeight:()=>10,getSamplesPerPixel:()=>1,getResolution:()=>[2,-2]};
 const d={nc:full?10:5,nr:full?10:5,cs:full?2:4,csy:full?2:4,xll:corrected?9:10,yll:corrected?21:20,crs:'EPSG:31983',z:Float32Array.from({length:full?100:25},(_,i)=>i),resampled:full?1:2,_img0:image,_W0:10,_H0:10};return {id:1,name:'MDT',d};}
test('PixelIsPoint native TIFF aligns cell centres with GDAL, PixelIsArea stays unchanged',async()=>{
 const s=await ctx.window.GeoMineChannelDEM.prepare(raster(),{workCRS:'EPSG:31983'});assert.equal(s.grid.xll,9);assert.equal(s.grid.yll,21);assert.equal(s.float32,true);
 assert.equal(s.locate([10,40]).col,0);assert.equal(s.locate([10,40]).row,0);assert.equal((await s.cells([[0,0]]))[0],0);s.close();
 const a=await ctx.window.GeoMineChannelDEM.prepare(raster(false),{workCRS:'EPSG:31983'});assert.equal(a.grid.xll,10);assert.equal(a.grid.yll,20);a.close();
});
test('full native cache applies half-cell correction once, never modifies original bounds or elevations',async()=>{
 for(const corrected of [false,true]){const r=raster(true,true,corrected),before=JSON.stringify(r.d),s=await ctx.window.GeoMineChannelDEM.prepare(r,{workCRS:'EPSG:31983'});
 assert.equal(s.grid.xll,9);assert.equal(s.grid.yll,21);assert.equal((await s.cells([[3,4]]))[0],43);assert.equal(JSON.stringify(r.d),before);s.close();}
});
test('a tap beside the thalweg is moved to the nearest cell of the dominant flow line, not downstream',async()=>{
 // Vale em V correndo para o sul (linha crescente), talvegue na coluna 60.
 const s=source(121,161,(x,y)=>500-y*0.5+Math.abs(x-60)*2);
 const onLine=await engine.locateOutlet(s,{col:60,row:100},{searchCells:4});
 assert.equal(onLine.moved,false);assert.deepEqual([onLine.col,onLine.row],[60,100]);
 const beside=await engine.locateOutlet(s,{col:62,row:100},{searchCells:4});
 assert.equal(beside.moved,true);assert.equal(beside.col,60);
 assert(Math.abs(beside.row-100)<=1,'fica na mesma estação do toque, sem descer o vale: linha '+beside.row);
 assert(beside.cellsAtOutlet>20*beside.cellsAtTap);
 // Longe do talvegue, fora do raio de busca: o ponto não é deslocado.
 const far=await engine.locateOutlet(s,{col:90,row:100},{searchCells:4});
 assert.equal(far.moved,false);assert.deepEqual([far.col,far.row],[90,100]);
 // A bacia delimitada a partir do exutório ajustado é a do vale, não a da encosta.
 const slope=await engine.analyze(s,{seed:{col:62,row:100}}),valley=await engine.analyze(s,{seed:{col:beside.col,row:beside.row}});
 assert(valley.cells>50*slope.cells,valley.cells+' x '+slope.cells);
});
test('D8 on the whole grid: flow accumulation picks the outlet and the basin equals the windowed engine',async()=>{
 const s=source(121,161,(x,y)=>500-y*0.5+Math.abs(x-60)*2+0.3*Math.sin(x/7)*Math.cos(y/5));
 const routing=await engine.routeGrid(s,{seed:{col:60,row:100}});
 assert.equal(routing.count.length,121*161);
 const beside=await engine.analyzeRouted(s,routing,{col:63,row:100},{searchCells:5});
 const local=await engine.locateOutlet(s,{col:63,row:100},{searchCells:5});
 assert.equal(beside.moved,true);
 const windowed=await engine.analyze(s,{seed:{col:beside.seed.col,row:beside.seed.row}});
 assert.equal(beside.cells,windowed.cells);assert.equal(beside.cells,beside.cellsAtOutlet,'a acumulação no exutório é a área da bacia em células');
 assert(Math.abs(beside.areaM2-windowed.areaM2)<1e-6);checkArea(beside,s);
 assert(Math.abs(local.row-beside.seed.row)<=2&&Math.abs(local.col-beside.seed.col)<=2);
 // o mesmo roteamento serve a outro ponto, sem reler a grade
 const reads=s.windows.length,again=await engine.analyzeRouted(s,routing,{col:60,row:140},{searchCells:2});
 assert(again.cells>beside.cells);assert(s.windows.length-reads<=1,'só a cota do exutório é lida');
});
test('a D8 direction computed elsewhere (receiver index per cell) gives the same catchment as routing the grid, without reading elevations',async()=>{
 // Vale em V descendo para o sul: o receptor de cada célula é a vizinha de maior declive (o D8 do Hidro).
 const s=source(41,61,(x,y)=>300-y*2+Math.abs(x-20)*3),nc=s.nc,nr=s.nr,receiver=new Int32Array(nc*nr).fill(-1);
 for(let y=0;y<nr;y++)for(let x=0;x<nc;x++){let best=0,k=-1;
  for(const [dx,dy] of [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]){const a=x+dx,b=y+dy;if(a<0||b<0||a>=nc||b>=nr)continue;
   const slope=(s.z[y*nc+x]-s.z[b*nc+a])/Math.hypot(dx*s.cs,dy*s.csy);if(slope>best){best=slope;k=b*nc+a;}}
  receiver[y*nc+x]=k;}
 const seed={col:20,row:50},routing=engine.routeReceivers(nc,nr,receiver,()=>false),reference=await engine.routeGrid(s,{seed});
 assert.equal(routing.count[seed.row*nc+seed.col],reference.count[seed.row*nc+seed.col],'same flow accumulation at the outlet');
 const reads=s.windows.length,r=await engine.analyzeRouted(s,routing,seed,{searchCells:1}),ref=await engine.analyzeRouted(s,reference,seed,{searchCells:1});
 assert.equal(r.cells,ref.cells);assert.equal(r.cells,routing.count[seed.row*nc+seed.col]);checkArea(r,s);
 assert(s.windows.length-reads<=2,'only the outlet elevation is read');
 // célula sem dados e receptor inválido não entram nem quebram a contagem
 receiver[0]=nc*nr+5;receiver[1]=40;const guarded=engine.routeReceivers(nc,nr,receiver,i=>i===2);
 assert.equal(guarded.state[0],0);assert.equal(guarded.state[1],0);assert.equal(guarded.state[2]&15,9);assert.equal(guarded.count[2],0);
 assert.throws(()=>engine.routeReceivers(nc,nr,new Int32Array(5)),/não corresponde/);
});
