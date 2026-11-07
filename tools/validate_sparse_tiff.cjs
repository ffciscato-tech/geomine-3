const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
let delegated=0;
class Image {async getTileOrStrip(){delegated++;throw new Error('real decoder failure');}getWidth(){return 4;}getHeight(){return 3;}getTileWidth(){return this.fileDirectory.TileWidth||4;}getTileHeight(){return this.fileDirectory.TileLength||2;}getSamplesPerPixel(){return this.fileDirectory.BitsPerSample.length;}}
const c={GeoTIFF:{GeoTIFFImage:Image},ArrayBuffer,DataView,console};c.window=c;vm.createContext(c);
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../src/modules/raster/sparse-blocks.js'),'utf8'),c);
function image(fd,littleEndian=true){const im=new Image;im.fileDirectory={TileWidth:2,TileLength:2,TileOffsets:[0,100,0,100],TileByteCounts:[0,80,0,80],BitsPerSample:[8,8,8,8],...fd};im.littleEndian=littleEndian;return im;}
(async()=>{
const rgba=image({Compression:7});const tile=await rgba.getTileOrStrip(0,0,0);assert.equal(tile.data.byteLength,16);assert.ok(new Uint8Array(tile.data).every(v=>v===0));
await assert.rejects(rgba.getTileOrStrip(1,0,0),/real decoder failure/);assert.equal(delegated,1);
for(const compression of [1,5,7,8]){
 const im=image({Compression:compression,BitsPerSample:[32],SampleFormat:[3],GDAL_NODATA:'-9999\0'});
 const block=await im.getTileOrStrip(0,0,0);assert.deepEqual(Array.from(new Float32Array(block.data)),[-9999,-9999,-9999,-9999]);
}
const nan=await image({BitsPerSample:[32],SampleFormat:[3],GDAL_NODATA:'nan'}).getTileOrStrip(0,0,0);assert.ok(new Float32Array(nan.data).every(Number.isNaN));
const big=await image({BitsPerSample:[16],SampleFormat:[2],GDAL_NODATA:'-25'},false).getTileOrStrip(0,0,0);assert.equal(new DataView(big.data).getInt16(0,false),-25);
const planar=image({PlanarConfiguration:2,BitsPerSample:[8,16],TileOffsets:[100,100,100,100,0,100,100,100],TileByteCounts:[80,80,80,80,0,80,80,80],GDAL_NODATA:'12'});
assert.deepEqual(Array.from(new Uint16Array((await planar.getTileOrStrip(0,0,1)).data)),[12,12,12,12]);
const strip=image({TileWidth:undefined,TileLength:undefined,TileOffsets:undefined,TileByteCounts:undefined,StripOffsets:[100,0],StripByteCounts:[20,0],BitsPerSample:[32],SampleFormat:[3],GDAL_NODATA:'42'});
assert.equal((await strip.getTileOrStrip(0,1,0)).data.byteLength,16);
await assert.rejects(image({TileByteCounts:[1,80,0,80]}).getTileOrStrip(0,0,0),/real decoder failure/);
await assert.rejects(image({TileOffsets:[],TileByteCounts:[]}).getTileOrStrip(0,0,0),/real decoder failure/);
await assert.rejects(rgba.getTileOrStrip(0,0,0,null,{aborted:true}),{name:'AbortError'});
console.log('PASS sparse RGBA, JPEG/LZW/Deflate/raw, DEM NoData/NaN, endian, planar, last strip, cancellation; real/corrupt blocks still delegated');
})().catch(e=>{console.error(e);process.exitCode=1});
