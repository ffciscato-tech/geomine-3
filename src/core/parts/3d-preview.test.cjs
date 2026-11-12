const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const text=fs.readFileSync(path.join(__dirname,'21-profiles-and-3d.js'),'utf8');
function setup(){
 const c={S:{workCRS:'EPSG:31983'},window:{GeoMineChannelDEM:{prepare:async()=>{throw Error('original desconectado');}}},
  v3RasterCellY:(g,row)=>g.yll+(g.nr-row-.5)*(g.csy||g.cs),setTimeout};
 vm.createContext(c);vm.runInContext(text.slice(text.indexOf('function v3NativeSourceIdentity('),text.indexOf('async function build3D(')),c);return c;
}
const raster=(n=32)=>({id:1,d:{nc:n,nr:n,cs:.2,csy:.2,xll:500000,yll:6900000,crs:'EPSG:31983',native:true,z:Float32Array.from({length:n*n},(_,i)=>i)}});
test('prévia de projeto sem original renderiza suas cotas e conserva NoData',async()=>{
 const c=setup(),r=raster();r.d.native=false;r.d.fromProject=true;r.d.resampled=4;r.d.srcDims=[128,128];r.d.z[10]=NaN;
 const src=await c.v3DisplaySource(r,()=>true,10e6);assert.equal(src.grid,r.d);assert.equal(src.nativeResolution,false);
 const z=await src.readWindow([9,0,12,1]);assert.equal(z[0],9);assert(Number.isNaN(z[1]));assert.equal(z[2],11);src.close();
});
test('original carregado grande usa malha de tela limitada sem modificar o MDT',async()=>{
 const c=setup(),r=raster(100),original=r.d.z,src=await c.v3DisplaySource(r,()=>true,112*900);
 assert.equal(src.nativeResolution,false);assert(src.grid.nc*src.grid.nr<=1000);assert.equal(r.d.z,original);assert.equal(r.d.cs,.2);
 const z=await src.readWindow([0,0,2,2]);assert.equal(z[0],0);assert.equal(z[1],4);assert.equal(z[2],400);assert.equal(z[3],404);
 const last=src.cellPoint(src.grid.nc-1,src.grid.nr-1);assert(Math.abs(last[0]-(500000+99.5*.2))<1e-6);assert(Math.abs(last[1]-(6900000+.1))<1e-6);src.close();
});
test('TIFF pequeno recuperado do cache continua em resolução nativa',async()=>{
 const c=setup(),r=raster();r.d.native=false;r.d.fromProject=true;r.d.resampled=4;r.d.srcDims=[128,128];
 const native={grid:{...r.d,nc:128,nr:128},close(){},isCurrent:()=>true};c.window.GeoMineChannelDEM.prepare=async()=>native;
 assert.equal(await c.v3DisplaySource(r,()=>true,112*20000),native);assert(native.nativeResolution);
});
