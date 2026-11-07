/* Read-only regression probe. Optional: node tools/validate_ortho_lzw_reader.mjs /path/file.tif [strip ...]
   The optional file is never read wholesale: only metadata and selected compressed strips. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const MiB=1024*1024,BLOCK=4*MiB,require=createRequire(import.meta.url);
globalThis.Worker=class{};
const GeoTIFF=require(path.join(root,'src/vendor/geotiff.min.js'));
const io={active:0,maxActive:0,bytes:0,maxRead:0};
class Reader {
  readAsArrayBuffer(blob){
    this.busy=true;io.active++;io.maxActive=Math.max(io.maxActive,io.active);
    this.timer=setTimeout(async()=>{
      try{
        const result=await blob.arrayBuffer();if(!this.busy)return;
        this.result=result;io.bytes+=result.byteLength;io.maxRead=Math.max(io.maxRead,result.byteLength);
        this.finish();this.onload?.({target:this});
      }catch(error){this.error=error;this.finish();this.onerror?.({target:this});}
    },0);
  }
  finish(){if(this.busy){this.busy=false;io.active--;}}
  abort(){clearTimeout(this.timer);this.finish();this.onabort?.({target:this});}
}
globalThis.FileReader=Reader;
const c={console,setTimeout,clearTimeout,AbortController,ArrayBuffer,Uint8Array,FileReader:Reader,GeoTIFF};
c.window=c;vm.createContext(c);
for(const name of ['source-cache','import-reader','tile-runtime'])
  vm.runInContext(fs.readFileSync(path.join(root,`src/modules/raster/${name}.js`),'utf8'),c);

class VirtualBlob {
  constructor(size,regions=[],start=0){this.size=size;this.regions=regions;this.start=start;}
  slice(start=0,end=this.size){
    start=Math.min(this.size,Math.max(0,start));end=Math.min(this.size,Math.max(start,end));
    return new VirtualBlob(end-start,this.regions,this.start+start);
  }
  async arrayBuffer(){
    const out=new Uint8Array(this.size),stop=this.start+this.size;
    for(let i=0;i<out.length;i++)out[i]=(this.start+i)%251;
    for(const {offset,bytes} of this.regions){
      const lo=Math.max(this.start,offset),hi=Math.min(stop,offset+bytes.length);
      if(hi>lo)out.set(bytes.subarray(lo-offset,hi-offset),lo-this.start);
    }
    return out.buffer;
  }
}
class DiskBlob {
  constructor(fd,size,start=0){this.fd=fd;this.size=size;this.start=start;}
  slice(start=0,end=this.size){
    start=Math.min(this.size,Math.max(0,start));end=Math.min(this.size,Math.max(start,end));
    return new DiskBlob(this.fd,end-start,this.start+start);
  }
  async arrayBuffer(){
    const out=new Uint8Array(this.size);let read=0;
    while(read<out.length){const n=fs.readSync(this.fd,out,read,out.length-read,this.start+read);if(!n)break;read+=n;}
    return out.buffer.slice(0,read);
  }
}
function lzwLiterals(raw){
  // Reset before dictionary growth changes the code width: real TIFF LZW, 9-bit MSB codes.
  const codes=[];
  for(let start=0;start<raw.length;start+=180){codes.push(256);for(const value of raw.subarray(start,start+180))codes.push(value);}
  codes.push(257);const out=new Uint8Array(Math.ceil(codes.length*9/8));let bit=0;
  for(const code of codes)for(let shift=8;shift>=0;shift--,bit++)if(code&(1<<shift))out[bit>>3]|=1<<(7-(bit%8));
  return out;
}
function fixture(baseOffset=BLOCK-91,predictor=1){
  const width=35489,height=3,samples=4,rows=[];
  for(let row=0;row<height;row++)rows.push(Uint8Array.from({length:width*samples},(_,i)=>(row*37+i)%251));
  const compressed=rows.map(row=>{
    const data=row.slice();if(predictor===2)for(let i=data.length-1;i>=samples;i--)data[i]=(data[i]-data[i-samples])&255;
    return lzwLiterals(data);
  });
  const offsets=compressed.map((_,i)=>baseOffset+compressed.slice(0,i).reduce((sum,b)=>sum+b.length,0));
  const tags=[
    [256,4,[width]],[257,4,[height]],[258,3,[8,8,8,8]],[259,3,[5]],[262,3,[2]],
    [273,4,offsets],[277,3,[samples]],[278,4,[1]],[279,4,compressed.map(b=>b.length)],
    [284,3,[1]],[317,3,[predictor]],[338,3,[2]],[339,3,[1,1,1,1]]
  ];
  const header=new Uint8Array(512),view=new DataView(header.buffer);header.set([73,73,42,0]);view.setUint32(4,8,true);
  view.setUint16(8,tags.length,true);let extra=8+2+tags.length*12+4;
  for(let i=0;i<tags.length;i++){
    const [tag,type,values]=tags[i],at=10+i*12,unit=type===3?2:4;
    view.setUint16(at,tag,true);view.setUint16(at+2,type,true);view.setUint32(at+4,values.length,true);
    let valueAt=at+8;if(values.length*unit>4){valueAt=extra;extra+=values.length*unit;view.setUint32(at+8,valueAt,true);}
    for(let j=0;j<values.length;j++)view[type===3?'setUint16':'setUint32'](valueAt+j*unit,values[j],true);
  }
  const regions=[{offset:0,bytes:header},...compressed.map((bytes,i)=>({offset:offsets[i],bytes}))];
  return {blob:new VirtualBlob(offsets.at(-1)+compressed.at(-1).length,regions),rows,offsets,compressed};
}
const hash=data=>createHash('sha256').update(new Uint8Array(data)).digest('hex');
const tests=[];
const test=(name,run)=>tests.push({name,run});
test('compressed range bytes match native fromBlob across 4MiB, EOF, >2GiB and eviction',async()=>{
  const {blob}=fixture(2**31+BLOCK-91),native=await GeoTIFF.fromBlob(blob),bounded=await c.GeoMineRasterImport.open(blob);
  const slices=[{offset:0,length:512},{offset:BLOCK-19,length:83},{offset:2**31-3,length:141956},
    {offset:2**31+BLOCK-211,length:500001},{offset:blob.size-113,length:2000},{offset:blob.size+7,length:4},
    ...[6,11,17,23,25,31].map(n=>({offset:n*BLOCK+73,length:991}))];
  const expected=await native.source.fetch(slices),actual=await bounded.source.fetch(slices);
  for(let i=0;i<slices.length;i++)assert.deepEqual(new Uint8Array(actual[i]),new Uint8Array(expected[i]));
  // A decoder/consumer mutating its returned compressed range must not poison cache.
  new Uint8Array(actual[0]).fill(255);
  const [again]=await bounded.source.fetch([slices[0]]);assert.deepEqual(new Uint8Array(again),new Uint8Array(expected[0]));
  assert.ok(c.GeoMineRasterImport.stats().maxActive<=2);assert.ok(c.GeoMineRasterImport.stats().cacheBytes<=16*MiB);
  await native.close();await bounded.close();
});
for(const predictor of [1,2])for(const offset of [BLOCK-91,2**31+BLOCK-91])
  test(`LZW RGBA width35489 predictor${predictor} offset${offset}: native/reader/runtime equal`,async()=>{
    const f=fixture(offset,predictor),native=await GeoTIFF.fromBlob(f.blob),bounded=await c.GeoMineRasterImport.open(f.blob);
    const nativeIm=await native.getImage(),boundedIm=await bounded.getImage();
    const expected=await nativeIm.readRasters({interleave:true}),actual=await boundedIm.readRasters({interleave:true});
    assert.deepEqual(new Uint8Array(actual),new Uint8Array(expected));
    assert.deepEqual(new Uint8Array(actual),Uint8Array.from(f.rows.flatMap(row=>Array.from(row))));
    const options={window:[0,0,35489,3],width:177,height:2,interleave:true,resampleMethod:'nearest'};
    assert.equal(c.GeoMineTileRuntime.canReadResampled(boundedIm,options),true);
    const reference=await nativeIm.readRasters(options),sampled=await c.GeoMineTileRuntime.read(boundedIm,options);
    assert.deepEqual(new Uint8Array(sampled),new Uint8Array(reference));
    const [a,b]=await Promise.all([c.GeoMineTileRuntime.read(boundedIm,options),c.GeoMineTileRuntime.read(boundedIm,options)]);
    assert.deepEqual(new Uint8Array(a),new Uint8Array(b));
    await native.close();await bounded.close();c.GeoMineTileRuntime.clear();
  });
test('vendor reproduces observed EOI warning and 141956-byte row failure for incomplete LZW',async()=>{
  const fd={Compression:5,Predictor:2,ImageWidth:35489,ImageLength:1,RowsPerStrip:1,StripOffsets:[0],
    SamplesPerPixel:4,BitsPerSample:[8,8,8,8],PlanarConfiguration:1};
  // CLEAR, literal A, literal B, missing EOI: the vendor returns partial decode to Predictor.
  const input=Uint8Array.of(0x80,0x10,0x48,0x40),before=input.slice(),warnings=[],originalWarn=console.warn;
  try{
    console.warn=(...args)=>warnings.push(args.join(' '));
    const decoder=await GeoTIFF.getDecoder(fd);
    await assert.rejects(decoder.decode(fd,input.buffer),error=>error.name==='RangeError'&&/141956/.test(error.message));
  }finally{console.warn=originalWarn;}
  assert.ok(warnings.some(message=>message.includes('EOI_CODE')));assert.deepEqual(input,before);
});
for(const {name,run} of tests){await run();console.log('PASS '+name);}
console.log(`${tests.length}/${tests.length} LZW reader probes passed (no real large TIFF needed).`);

if(process.argv[2]){
  const filename=path.resolve(process.argv[2]),fd=fs.openSync(filename,'r');let native,bounded;
  try{
    const blob=new DiskBlob(fd,fs.fstatSync(fd).size);native=await GeoTIFF.fromBlob(blob);bounded=await c.GeoMineRasterImport.open(blob);
    const ni=await native.getImage(),bi=await bounded.getImage(),d=ni.fileDirectory;
    const offsets=d.StripOffsets||d.TileOffsets,counts=d.StripByteCounts||d.TileByteCounts;
    const selected=process.argv.length>3?process.argv.slice(3).map(Number):[0,1,Math.floor(offsets.length/2),offsets.length-1];
    console.log(JSON.stringify({width:ni.getWidth(),height:ni.getHeight(),compression:d.Compression,predictor:d.Predictor,
      blockCount:offsets.length,sourceSize:blob.size}));
    for(const index of [...new Set(selected)]){
      assert.ok(Number.isInteger(index)&&index>=0&&index<offsets.length,'Invalid block index');
      const slice={offset:Number(offsets[index]),length:Number(counts[index])};
      const [raw]=await native.source.fetch([slice]),[got]=await bounded.source.fetch([slice]);
      assert.deepEqual(new Uint8Array(got),new Uint8Array(raw),`compressed bytes differ at block ${index}`);
      const decA=await GeoTIFF.getDecoder(d),decB=await GeoTIFF.getDecoder(bi.fileDirectory),results=[];
      const expectedBytes=d.StripOffsets&&d.PlanarConfiguration!==2?ni.getWidth()*
        Math.min(d.RowsPerStrip||ni.getHeight(),ni.getHeight()-index*(d.RowsPerStrip||ni.getHeight()))*
        Array.from(d.BitsPerSample).reduce((sum,bits)=>sum+bits,0)/8:null;
      for(const [decoder,data] of [[decA,raw],[decB,got]])try{
        const decoded=await decoder.decode(d,data);results.push({bytes:decoded.byteLength,hash:hash(decoded),expectedBytes,
          expectedPrefixHash:expectedBytes!==null&&decoded.byteLength>=expectedBytes?hash(decoded.slice(0,expectedBytes)):null});
      }catch(error){results.push({error:error.name,message:error.message});}
      assert.deepEqual(results[0],results[1],`decoder differs at block ${index}`);
      console.log(JSON.stringify({block:index,...slice,actualBytes:raw.byteLength,sourceHash:hash(raw),decode:results[0],
        endWithinFile:slice.offset+slice.length<=blob.size}));
    }
  }finally{if(native)await native.close();if(bounded)await bounded.close();fs.closeSync(fd);}
}
