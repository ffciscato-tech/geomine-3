/* TIFF LZW decoder, registered through GeoTIFF's public decoder API.
   Keep the vendored library unchanged; its Raw decoder still applies Predictor.

   The bundled LZW decoder changes 9/10/11-bit width before a terminal EOI
   written at the previous width. In real strips this turns EOI 257 into 514,
   consumes padding as pixels and can make Predictor read an incomplete row.
   The compatibility rule below is restricted to EOI + <=7 zero padding bits
   at the physical end of the compressed strip. Interior codes are never
   guessed, compressed bytes are never modified, and missing pixels are not
   supplied or trimmed. Literal/dictionary validation also rejects truncation.

   Load synchronously after vendor/geotiff.min.js and before raster consumers.
   Workers are not enabled by this module (their private registry is separate).
 */
(function(){
'use strict';
if(window.GeoMineLZWDecoder)return;
const library=window.GeoTIFF;
if(!library||typeof library.addDecoder!=='function'||typeof library.getDecoder!=='function')
  throw new Error('Carregue GeoTIFF antes do decodificador LZW.');
const CLEAR=256,EOI=257,LIMIT=4096;
function invalid(detail){
  const error=new Error('Não foi possível decodificar o bloco TIFF LZW: '+detail+'.');
  error.name='LZWDecodeError';return error;
}
function geometry(directory){
  if(!directory)return null;
  const striped=!!directory.StripOffsets;
  const width=Number(striped?directory.ImageWidth:directory.TileWidth);
  const imageRows=Number(directory.ImageLength),stripRows=Number(directory.RowsPerStrip||imageRows);
  const rows=Number(striped?Math.min(stripRows,imageRows):directory.TileLength);
  const bits=directory.BitsPerSample?Array.from(directory.BitsPerSample):[];
  if(!Number.isSafeInteger(width)||width<=0||!Number.isSafeInteger(rows)||rows<=0||
      !bits.length||!bits.every(value=>Number.isSafeInteger(value)&&value>0))return null;
  const planar=Number(directory.PlanarConfiguration||1);
  // decode() receives no sample index; do not reinterpret mixed-width planes.
  if(planar===2&&!bits.every(value=>value===bits[0]))return null;
  const pixelBits=planar===2?bits[0]:bits.reduce((sum,value)=>sum+value,0);
  const rowBytes=Math.ceil(width*pixelBits/8),maxBytes=rowBytes*rows;
  // decode() has no strip index. These are the only legal lengths; its caller
  // can distinguish a full strip from the final partial strip using x/y.
  const lastBytes=striped?rowBytes*(imageRows%stripRows||rows):maxBytes;
  return Number.isSafeInteger(maxBytes)&&maxBytes>0?{rowBytes,maxBytes,lastBytes}:null;
}
function terminalOldWidthEOI(input,position,width){
  const remaining=input.byteLength*8-position;
  if(remaining<width||remaining>width+7)return false;
  let code=0;
  for(let bit=0;bit<remaining;bit++){
    const value=(input[Math.floor((position+bit)/8)]>>(7-(position+bit)%8))&1;
    if(bit<width)code=code*2+value;else if(value)return false;
  }
  return code===EOI;
}
function decodeLZW(buffer,directory){
  const input=new Uint8Array(buffer),shape=geometry(directory);
  const maxBytes=shape?shape.maxBytes:0x7fffffff;
  const initial=shape&&maxBytes<=16*1024*1024?maxBytes:Math.min(maxBytes,Math.max(4096,Math.min(1024*1024,input.byteLength*2)));
  let output=new Uint8Array(initial);
  const prefix=new Uint16Array(LIMIT),suffix=new Uint8Array(LIMIT),stack=new Uint8Array(LIMIT+1);
  for(let value=0;value<256;value++)suffix[value]=value;
  let position=0,width=9,next=258,old=-1,first=0,written=0,started=false;
  function readCode(){
    if(position+width>input.byteLength*8)throw invalid('fluxo incompleto antes do código de término');
    // TIFF codes are 9–12 bits: at most three bytes, regardless of alignment.
    // Avoid exponentiation and a per-byte loop for every dictionary code.
    const byte=Math.floor(position/8),shift=position%8,
      bits=(input[byte]<<16)|((input[byte+1]||0)<<8)|(input[byte+2]||0),
      code=(bits>>>(24-shift-width))&((1<<width)-1);
    position+=width;return code;
  }
  function reserve(count){
    const needed=written+count;
    if(needed>maxBytes)throw invalid('o bloco excede suas dimensões declaradas');
    if(needed<=output.length)return;
    const grown=new Uint8Array(Math.min(maxBytes,Math.max(needed,output.length*2,4096)));
    grown.set(output);output=grown;
  }
  for(;;){
    let code=readCode();
    if(!started){if(code!==CLEAR)throw invalid('código inicial CLEAR ausente');started=true;}
    if(code===CLEAR){width=9;next=258;old=-1;continue;}
    if(code===EOI)break;
    if(old<0){
      if(code>=256)throw invalid('código inválido após CLEAR');
      reserve(1);output[written++]=code;old=code;first=code;continue;
    }
    const incoming=code;let count=0;
    if(code===next){
      if(next>=LIMIT)throw invalid('dicionário fora do limite');
      stack[count++]=first;code=old; // KwKwK: previous word followed by its first byte.
    }else if(code>next||code>=LIMIT)throw invalid('referência inválida no dicionário');
    while(code>=256){
      if(code>=next||count>=LIMIT)throw invalid('referência circular ou inválida no dicionário');
      stack[count++]=suffix[code];code=prefix[code];
    }
    first=code;stack[count++]=first;reserve(count);
    while(count)output[written++]=stack[--count];
    if(next<LIMIT){prefix[next]=old;suffix[next]=first;next++;}
    old=incoming;
    if(width<12&&next+1>=(1<<width)&&!terminalOldWidthEOI(input,position,width))width++;
  }
  if(shape&&!written)throw invalid('o bloco não contém pixels');
  if(shape&&written%shape.rowBytes)throw invalid('a última linha do bloco está incompleta');
  if(shape&&written!==shape.maxBytes&&written!==shape.lastBytes)
    throw invalid('o bloco não contém todas as linhas declaradas');
  return written===output.length?output.buffer:output.buffer.slice(0,written);
}
// Capture the independent Raw factory before replacing Compression 5. No I/O.
const rawDecoder=library.getDecoder({Compression:1});
class RasterLZWDecoder {
  constructor(directory){this.directory=directory;}
  decodeBlock(buffer){return decodeLZW(buffer,this.directory);}
  async decode(directory,buffer){
    const decoded=decodeLZW(buffer,directory);
    return (await rawDecoder).decode(directory,decoded);
  }
}
function validateTile(image,x,y,sample,data){
  const directory=image&&image.fileDirectory;
  if(!directory||Number(directory.Compression)!==5)return data;
  const bits=directory.BitsPerSample?Array.from(directory.BitsPerSample):[];
  const formats=directory.SampleFormat?Array.from(directory.SampleFormat):[1];
  // getTileOrStrip expands packed samples after decode(). This hook sees that
  // normalized buffer, not the packed bytes whose geometry decode() checked.
  // Match only layouts the vendor leaves unchanged; retain its packed fallback.
  const unchanged=bits.every((value,index)=>{
    const format=formats[index]??formats[0];
    return ((format===1||format===2)&&value<=32&&value%8===0)||
      (format===3&&[16,32,64].includes(value));
  });
  if(!unchanged)return data;
  const planar=Number(directory.PlanarConfiguration||1);
  const sampleBits=planar===2?bits[sample]:bits.reduce((sum,value)=>sum+value,0);
  const striped=!!directory.StripOffsets;
  const width=Number(striped?directory.ImageWidth:directory.TileWidth);
  const height=Number(directory.ImageLength),step=Number(directory.RowsPerStrip||height);
  const rows=striped?Math.min(step,height-y*step):Number(directory.TileLength);
  const expected=Math.ceil(width*sampleBits/8)*rows;
  if(!Number.isSafeInteger(x)||x<0||!Number.isSafeInteger(y)||y<0||
      !Number.isSafeInteger(expected)||expected<=0||!data||data.byteLength!==expected)
    throw invalid('o tamanho decodificado não corresponde à faixa ou ao tile solicitado');
  return data;
}
// Public registration is synchronous, even though decoder construction is async.
library.addDecoder(5,()=>RasterLZWDecoder);
window.GeoMineLZWDecoder={version:1,Decoder:RasterLZWDecoder,decodeBlock:decodeLZW,validateTile};
})();
