/* GDAL sparse TIFF: offset=0 E byteCount=0 significa bloco implícito,
   preenchido com NoData (ou zero), não um JPEG/Deflate/LZW a decodificar.
   Hook anterior ao cache limitado: atende importação, tiles e Layout,
   inclusive leituras nativas diretas. Não captura erros de blocos reais.
   Referência: https://gdal.org/en/stable/drivers/raster/gtiff.html#sparse-files */
(function(){
'use strict';
if(window.GeoMineSparseTIFF)return;
const proto=window.GeoTIFF?.GeoTIFFImage?.prototype;
if(!proto||typeof proto.getTileOrStrip!=='function')throw Error('Leitor GeoTIFF indisponível para blocos esparsos.');
const original=proto.getTileOrStrip;
let blocks=0;
function blank(image,x,y,sample){
  const fd=image.fileDirectory,tiles=fd.TileOffsets!=null;
  const offsets=tiles?fd.TileOffsets:fd.StripOffsets,counts=tiles?fd.TileByteCounts:fd.StripByteCounts;
  if(!offsets||!counts)return null;
  const w=image.getTileWidth(),h=image.getTileHeight(),nx=Math.ceil(image.getWidth()/w),ny=Math.ceil(image.getHeight()/h);
  const spp=image.getSamplesPerPixel(),planar=Number(fd.PlanarConfiguration||1);
  if(!Number.isInteger(x)||x<0||x>=nx||!Number.isInteger(y)||y<0||y>=ny||
    !Number.isInteger(sample)||sample<0||sample>=spp)return null;
  const index=y*nx+x+(planar===2?sample*nx*ny:0);
  // Missing metadata or partially zero pairs are NOT valid sparse blocks.
  if(Number(offsets[index])!==0||Number(counts[index])!==0)return null;
  const bands=planar===2?[sample]:Array.from({length:spp},(_,i)=>i);
  const specs=bands.map(i=>{
    const bits=Number(fd.BitsPerSample[i]),format=Number(fd.SampleFormat?.[i]??1);
    const method=(format===1&&[8,16,32].includes(bits)?'setUint':format===2&&[8,16,32].includes(bits)?'setInt':format===3&&[32,64].includes(bits)?'setFloat':null);
    if(!method)throw Error('Formato de amostra não suportado em bloco GeoTIFF esparso.');
    return {bytes:bits/8,write:DataView.prototype[method+bits]};
  });
  const stride=specs.reduce((n,s)=>n+s.bytes,0),rows=tiles?h:Math.min(h,image.getHeight()-y*h),size=w*rows*stride;
  if(!Number.isSafeInteger(size)||size<=0||size>256*1024*1024)throw Error('Bloco GeoTIFF esparso excede o limite seguro de memória.');
  let nodata=0;
  if(fd.GDAL_NODATA!=null){
    const raw=String(fd.GDAL_NODATA).replace(/\0/g,'').trim();
    nodata=/^nan$/i.test(raw)?NaN:Number(raw);
    if(!raw||(!Number.isFinite(nodata)&&!/^nan$/i.test(raw)))throw Error('NoData inválido no GeoTIFF esparso.');
  }
  const data=new ArrayBuffer(size);
  if(nodata!==0){
    const view=new DataView(data);
    for(let at=0;at<size;at+=stride){let offset=0;for(const spec of specs){spec.write.call(view,at+offset,nodata,image.littleEndian);offset+=spec.bytes;}}
  }
  blocks++;return {x,y,sample,data};
}
proto.getTileOrStrip=async function(x,y,sample,pool,signal){
  if(signal?.aborted){const error=new Error('Leitura de tile cancelada.');error.name='AbortError';throw error;}
  return blank(this,x,y,sample)||original.call(this,x,y,sample,pool,signal);
};
window.GeoMineSparseTIFF={version:1,stats:()=>({blocks})};
})();
