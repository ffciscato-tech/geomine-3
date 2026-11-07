const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const filename=process.argv[2];
if(!filename)throw Error('Informe o arquivo TIFF');
const scanAll=process.argv.includes('--all'),failures=[];
let currentStrip=null,stripWarnings=[];
const probeConsole={...console,warn:(...args)=>{
 const message=args.map(String).join(' ');stripWarnings.push(message);
 console.warn('STRIP_WARNING',JSON.stringify(currentStrip),message);
}};
const c={console:probeConsole,setTimeout,clearTimeout,ArrayBuffer,DataView,TextDecoder,TextEncoder,AbortController,
 Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array,Float32Array,Float64Array,
 Worker:class{constructor(){throw Error('Worker não necessário para este teste');}}};
c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/vendor/geotiff.min.js'),'utf8'),c);
(async()=>{
 console.log('Opening read-only',filename);
 const handle=await fs.promises.open(filename,'r');
 try{
  const stat=await handle.stat(),reads=[],started=Date.now();
  const source={fileSize:stat.size,fetch:async ranges=>{
   const out=[];for(const {offset,length} of ranges){
    const n=Math.max(0,Math.min(length,stat.size-offset)),buf=Buffer.alloc(n);
    let read=0;while(read<n){
     const got=await handle.read(buf,read,n-read,offset+read);
     if(!got.bytesRead)throw Error(`Short FS read at ${offset}: ${read}/${n}`);read+=got.bytesRead;
    }
    reads.push({offset,length:n});out.push(buf.buffer.slice(buf.byteOffset,buf.byteOffset+n));
   }return out;
  }};
  const tiff=await c.GeoTIFF.GeoTIFF.fromSource(source,{cache:false});
  const count=await tiff.getImageCount();console.log('IFDs',count,'size',stat.size);
  for(let i=0;i<count;i++){
   const im=await tiff.getImage(i),d=im.fileDirectory;
   const offsets=d.StripOffsets||d.TileOffsets,counts=d.StripByteCounts||d.TileByteCounts;
   console.log(JSON.stringify({ifd:i,width:im.getWidth(),height:im.getHeight(),samples:im.getSamplesPerPixel(),
    compression:d.Compression,predictor:d.Predictor,bits:d.BitsPerSample,planar:d.PlanarConfiguration,
    rows:d.RowsPerStrip,tw:d.TileWidth,th:d.TileLength,offsets:offsets?.length,bytes:counts?.length,
    firstOffsets:Array.from(offsets||[]).slice(0,20),firstCounts:Array.from(counts||[]).slice(0,20)}));
   const decoder=await c.GeoTIFF.getDecoder(d);
   const requested=process.argv.slice(3).filter(arg=>arg!=='--all').map(Number);
   const selected=scanAll?Array.from({length:offsets.length},(_,index)=>index):requested.length?requested:[0,1,9,18,27,36,90,999,1065,1066];
   for(const y of selected){
    if(y>=offsets.length)continue;
    currentStrip={ifd:i,strip:y,offset:Number(offsets[y]),count:Number(counts[y])};stripWarnings=[];
    try{
     const data=await im.getTileOrStrip(0,y,0,decoder);
     const rows=Math.min(d.RowsPerStrip||im.getHeight(),im.getHeight()-y*(d.RowsPerStrip||im.getHeight()));
     const bytesPerPixel=Array.from(d.BitsPerSample).reduce((sum,bits)=>sum+bits,0)/8;
     const expected=d.StripOffsets&&d.PlanarConfiguration!==2?im.getWidth()*rows*bytesPerPixel:null;
     if(stripWarnings.length||(expected!==null&&data.data.byteLength!==expected)){
      const failure={...currentStrip,expected,decoded:data.data.byteLength,warnings:stripWarnings.slice()};
      failures.push(failure);console.log('STRIP_INCOMPLETE',JSON.stringify(failure));
     }
     if(!scanAll)console.log('strip',i,y,'decoded',data.data.byteLength,'sha',crypto.createHash('sha256').update(Buffer.from(data.data)).digest('hex'));
    }catch(error){
     const failure={...currentStrip,error:error.message,warnings:stripWarnings.slice()};failures.push(failure);
     console.log('STRIP_ERROR',JSON.stringify(failure),error.stack?.slice(0,500));
    }
    if(scanAll&&((y+1)%50===0||y===offsets.length-1))console.log('SCAN_PROGRESS',JSON.stringify({ifd:i,done:y+1,total:offsets.length,failures:failures.length,seconds:Math.round((Date.now()-started)/100)/10}));
   }
  }
  const after=await handle.stat();
  console.log('SCAN_RESULT',JSON.stringify({scanAll,failures,seconds:Math.round((Date.now()-started)/100)/10,
   before:{size:stat.size,mtimeMs:stat.mtimeMs},after:{size:after.size,mtimeMs:after.mtimeMs},snapshotChanged:stat.size!==after.size||stat.mtimeMs!==after.mtimeMs}));
  if(failures.length)process.exitCode=2;
  console.log('reads',reads.length,JSON.stringify(reads.slice(0,12)));
 }finally{await handle.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
