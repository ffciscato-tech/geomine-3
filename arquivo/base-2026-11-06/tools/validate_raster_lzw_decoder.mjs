/* Standalone fixtures; optional all-strip libtiff oracle comparison:
   node tools/validate_raster_lzw_decoder.mjs /path/image.tif /path/oracle.json */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
globalThis.Worker=class{};
const GeoTIFF=require(path.join(root,'src/vendor/geotiff.min.js'));
const nativeFactory=GeoTIFF.getDecoder;
const native=await nativeFactory({Compression:5}),raw=await nativeFactory({Compression:1});
const moduleText=fs.readFileSync(path.join(root,'src/modules/raster/lzw-decoder.js'),'utf8');
// Execute the exact browser module in Node's native realm. A contextified VM
// makes millions of Math/typed-array accesses much slower than browser code.
const c=globalThis;c.window=c;c.GeoTIFF=GeoTIFF;vm.runInThisContext(moduleText);
const helper=c.window.GeoMineLZWDecoder;
const hash=bytes=>createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
const pack=entries=>{
  const size=entries.reduce((sum,entry)=>sum+entry[1],0),out=new Uint8Array(Math.ceil(size/8));let at=0;
  for(const [code,width] of entries)for(let bit=width-1;bit>=0;bit--,at++)if(code&(1<<bit))out[Math.floor(at/8)]|=1<<(7-at%8);
  return out.buffer;
};
const currentWidth=literalIndex=>9+(literalIndex>=254)+(literalIndex>=766)+(literalIndex>=1790);
function literalStream(bytes,{oldEOI=false,clearEvery=0}={}){
  const entries=[[256,9]];let index=0;
  for(const value of bytes){
    if(clearEvery&&index===clearEvery){entries.push([256,currentWidth(index)]);index=0;}
    entries.push([value,currentWidth(index++)]);
  }
  entries.push([257,currentWidth(index)-(oldEOI?1:0)]);return pack(entries);
}
const fd=(width,height=1,rows=height,bits=[8],predictor=1)=>({Compression:5,ImageWidth:width,ImageLength:height,
  RowsPerStrip:rows,StripOffsets:[0],BitsPerSample:bits,SamplesPerPixel:bits.length,PlanarConfiguration:1,Predictor:predictor});
const tests=[],test=(name,run)=>tests.push({name,run});
const decode=async(input,directory)=>new Uint8Array(await (await GeoTIFF.getDecoder(directory)).decode(directory,input));
test('public registration is synchronous, idempotent, and leaves other compression unchanged',async()=>{
  assert.ok((await GeoTIFF.getDecoder({Compression:5})) instanceof helper.Decoder);
  vm.runInThisContext(moduleText);assert.equal(c.window.GeoMineLZWDecoder,helper);
  assert.equal((await GeoTIFF.getDecoder({Compression:1})).constructor,raw.constructor);
});
test('CLEAR reset, repeated CLEAR, literal bytes and KwKwK',async()=>{
  const a=pack([[256,9],[256,9],[65,9],[258,9],[259,9],[260,9],[257,9]]);
  assert.deepEqual(await decode(a,fd(10)),new Uint8Array(10).fill(65));
  const b=pack([[256,9],[65,9],[66,9],[258,9],[260,9],[256,9],[90,9],[257,9]]);
  assert.equal(Buffer.from(await decode(b,fd(8))).toString(),'ABABABAZ');
});
for(const count of [253,254,255,765,766,767,1789,1790,1791,3838,4090,8200])
  test(`dictionary width/full/reset progression with ${count} literals`,async()=>{
    const expected=Uint8Array.from({length:count},(_,index)=>(index*37+13)%256);
    const encoded=literalStream(expected,{clearEvery:count===8200?4090:0});
    assert.deepEqual(await decode(encoded,fd(count)),expected);
  });
for(const count of [254,766,1790])
  test(`terminal EOI at previous width after literal ${count}`,async()=>{
    const expected=Uint8Array.from({length:count},(_,index)=>index%251);
    const encoded=literalStream(expected,{oldEOI:true});
    assert.deepEqual(await decode(encoded,fd(count)),expected);
    // A nonzero trailing bit must not activate the narrowly scoped compatibility rule.
    const damaged=new Uint8Array(encoded.byteLength+1);damaged.set(new Uint8Array(encoded));damaged[damaged.length-1]=1;
    await assert.rejects(()=>decode(damaged.buffer,fd(count)),{name:'LZWDecodeError'});
  });
test('new-width code 514 inside a stream is not mistaken for old-width terminal EOI',async()=>{
  const prefix=Uint8Array.from({length:767},(_,index)=>index%251),entries=[[256,9]];
  for(let i=0;i<prefix.length;i++)entries.push([prefix[i],currentWidth(i)]);
  // Dictionary entry 514 is literals 256 and 257: bytes 5 and 6 for this pattern.
  entries.push([514,11],[257,11]);
  const expected=Uint8Array.from([...prefix,5,6]);assert.deepEqual(await decode(pack(entries),fd(expected.length)),expected);
});
test('the last 12-bit dictionary entry remains readable before a full-dictionary CLEAR',async()=>{
  const prefix=Uint8Array.from({length:3839},(_,index)=>index%251),entries=[[256,9]];
  for(let i=0;i<prefix.length;i++)entries.push([prefix[i],currentWidth(i)]);
  entries.push([4095,12],[256,12],[90,9],[257,9]);
  const expected=Uint8Array.from([...prefix,prefix[3837],prefix[3838],90]);
  assert.deepEqual(await decode(pack(entries),fd(expected.length)),expected);
});
test('ordinary dictionary streams agree with the unchanged bundled decoder',async()=>{
  const expected=Uint8Array.from({length:2000},(_,index)=>(index*59)%251),directory=fd(2000);
  const compressed=literalStream(expected),baseline=await native.decode(directory,compressed.slice(0));
  assert.deepEqual(await decode(compressed,directory),new Uint8Array(baseline));
});
test('Predictor 2 and 3 reuse the bundled raw decoder exactly without input mutation',async()=>{
  for(const predictor of [1,2,3])for(const bits of [8,16,32]){
    const directory=fd(17,3,3,[bits,bits,bits,bits],predictor),size=17*3*4*bits/8;
    const predicted=Uint8Array.from({length:size},(_,i)=>(i*19+71)%251),compressed=literalStream(predicted,{clearEvery:180});
    const before=new Uint8Array(compressed.slice(0));
    const expected=await raw.decode(directory,predicted.buffer.slice(0));
    assert.deepEqual(await decode(compressed,directory),new Uint8Array(expected));
    assert.deepEqual(new Uint8Array(compressed),before);
  }
});
test('partial last strip, planar samples and packed 1-bit rows retain their actual lengths',async()=>{
  for(const directory of [fd(16,3,2,[8,8,8,8],2),{...fd(16,3,2,[8,8,8,8],2),PlanarConfiguration:2},fd(9,3,2,[1],1)]){
    const bytes=directory.PlanarConfiguration===2?16:directory.BitsPerSample[0]===1?2:64;
    const predicted=Uint8Array.from({length:bytes},(_,i)=>i%251),compressed=literalStream(predicted);
    const expected=await raw.decode(directory,predicted.buffer.slice(0));
    assert.deepEqual(await decode(compressed,directory),new Uint8Array(expected));
  }
});
test('malformed codes, missing EOI, partial rows, and output overflow reject explicitly',async()=>{
  for(const encoded of [pack([[256,9],[257,9]]),pack([[65,9],[257,9]]),pack([[256,9],[300,9],[257,9]]),
    pack([[256,9],[65,9],[261,9],[257,9]]),pack([[256,9],[65,9],[66,9]])])
    await assert.rejects(()=>decode(encoded,fd(10)),{name:'LZWDecodeError'});
  await assert.rejects(()=>decode(literalStream(Uint8Array.of(1,2)),fd(3)),{name:'LZWDecodeError'});
  await assert.rejects(()=>decode(literalStream(Uint8Array.of(1,2,3,4)),fd(3)),{name:'LZWDecodeError'});
  await assert.rejects(()=>decode(literalStream(Uint8Array.of(1)),fd(1,4,2)),{name:'LZWDecodeError'});
  const tile={Compression:5,TileWidth:1,TileLength:2,BitsPerSample:[8],PlanarConfiguration:1};
  await assert.rejects(()=>decode(literalStream(Uint8Array.of(1)),tile),{name:'LZWDecodeError'});
});
test('decoder instances and concurrent decodes keep independent state',async()=>{
  const directory=fd(2048),bytes=Uint8Array.from({length:2048},(_,i)=>i%247),compressed=literalStream(bytes);
  const decoder=await GeoTIFF.getDecoder(directory),before=hash(compressed);
  const outputs=await Promise.all(Array.from({length:8},()=>decoder.decode(directory,compressed)));
  for(const output of outputs)assert.deepEqual(new Uint8Array(output),bytes);
  assert.equal(hash(compressed),before);assert.notEqual(outputs[0],outputs[1]);
});
test('indexed LZW tile validation distinguishes full strips from the final partial strip',()=>{
  const image={fileDirectory:fd(16,3,2,[8,8,8,8])},full=new ArrayBuffer(128),last=new ArrayBuffer(64);
  assert.equal(helper.validateTile(image,0,0,0,full),full);assert.equal(helper.validateTile(image,0,1,0,last),last);
  assert.throws(()=>helper.validateTile(image,0,0,0,last),{name:'LZWDecodeError'});
  assert.throws(()=>helper.validateTile(image,0,1,0,full),{name:'LZWDecodeError'});
  const planar={fileDirectory:{...fd(16,3,2,[8,16],1),PlanarConfiguration:2}};
  assert.equal(helper.validateTile(planar,0,1,1,new ArrayBuffer(32)).byteLength,32);
  assert.throws(()=>helper.validateTile(planar,0,1,0,new ArrayBuffer(32)),{name:'LZWDecodeError'});
  const tile={fileDirectory:{Compression:5,TileWidth:8,TileLength:8,ImageWidth:9,ImageLength:9,BitsPerSample:[8]}};
  assert.equal(helper.validateTile(tile,1,1,0,new ArrayBuffer(64)).byteLength,64);
  assert.throws(()=>helper.validateTile(tile,1,1,0,new ArrayBuffer(1)),{name:'LZWDecodeError'});
  const other={fileDirectory:{Compression:1}};assert.equal(helper.validateTile(other,0,0,0,last),last);
});
test('a real packed 1-bit mask retains vendor normalization through getTileOrStrip and runtime',async()=>{
  const compressed=literalStream(Uint8Array.of(0xaa,0x80));
  const directory={...fd(9,1,1,[1]),StripByteCounts:[compressed.byteLength],SampleFormat:[1]};
  const source={fetch:async()=>[compressed.slice(0)]};
  const image=new GeoTIFF.GeoTIFFImage(directory,{},new DataView(new ArrayBuffer(0)),true,false,source);
  const decoder=await GeoTIFF.getDecoder(directory),tile=await image.getTileOrStrip(0,0,0,decoder);
  const expected=[1,0,1,0,1,0,1,0,1];assert.deepEqual(Array.from(new Uint8Array(tile.data)),expected);
  assert.equal(helper.validateTile(image,0,0,0,tile.data),tile.data);
  vm.runInThisContext(fs.readFileSync(path.join(root,'src/modules/raster/tile-runtime.js'),'utf8'));
  const pixels=await c.window.GeoMineTileRuntime.read(image,{interleave:true});assert.deepEqual(Array.from(pixels),expected);
});
for(const {name,run} of tests){await run();console.log('PASS '+name);}
console.log(`${tests.length}/${tests.length} modular TIFF LZW checks passed.`);

if(process.argv[2]){
  if(!process.argv[3])throw new Error('Provide a libtiff oracle JSON path as the second argument.');
  const filename=path.resolve(process.argv[2]),oracle=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
  const handle=await fs.promises.open(filename,'r');
  try{
    const stat=await handle.stat();assert.equal(stat.size,oracle.size);
    const source={fileSize:stat.size,fetch:async ranges=>{
      const buffers=[];
      for(const {offset,length} of ranges){
        const output=new Uint8Array(Math.max(0,Math.min(length,stat.size-offset)));let read=0;
        while(read<output.length){const result=await handle.read(output,read,output.length-read,offset+read);
          if(!result.bytesRead)throw new Error('Short filesystem read');read+=result.bytesRead;}
        buffers.push(output.buffer);
      }
      return buffers;
    }};
    const tiff=await GeoTIFF.GeoTIFF.fromSource(source,{cache:false}),im=await tiff.getImage(),directory=im.fileDirectory;
    const decoder=await GeoTIFF.getDecoder(directory),started=Date.now();
    assert.equal(oracle.strips.length,directory.StripOffsets.length);
    for(const item of oracle.strips){
      const result=await im.getTileOrStrip(0,item.strip,0,decoder);
      helper.validateTile(im,0,item.strip,0,result.data);
      assert.equal(result.data.byteLength,item.length,`strip ${item.strip} length`);
      assert.equal(hash(result.data),item.sha256,`strip ${item.strip} libtiff hash`);
      if((item.strip+1)%50===0||item.strip===oracle.strips.length-1)
        console.log('LIBTIFF_MATCH',JSON.stringify({done:item.strip+1,total:oracle.strips.length,seconds:(Date.now()-started)/1000}));
    }
    const after=await handle.stat();assert.equal(after.size,stat.size);assert.equal(after.mtimeMs,stat.mtimeMs);
    console.log(`PASS all ${oracle.strips.length} real strips match libtiff byte-for-byte; file stat unchanged.`);
  }finally{await handle.close();}
}
