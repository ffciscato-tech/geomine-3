/* Projects with GeoTIFF originals use an uncompressed TAR. Only the small
   project document is parsed. Each TIFF is a Blob slice for native tile I/O. */
(function(root){
'use strict';
const block=512,documentName='projeto.ccmgis',encoder=new TextEncoder(),decoder=new TextDecoder();
const bundled=new WeakMap();
const padding=n=>(block-n%block)%block;
const invalid=()=>new Error('O pacote do projeto está incompleto ou contém um TIFF inválido.');
function sum(header){return header.reduce((n,b,i)=>n+(i>=148&&i<156?32:b),0);}
function readSize(bytes){
  if(bytes[0]===128){let n=0;for(const b of bytes.subarray(1))n=n*256+b;return n;}
  const s=decoder.decode(bytes).replace(/\0.*$/,'').trim();return /^[0-7]+$/.test(s)?parseInt(s,8):NaN;
}
function header(name,size){
  const h=new Uint8Array(block);
  const put=(offset,value)=>h.set(encoder.encode(value),offset);
  put(0,name);put(100,'0000644');put(108,'0000000');put(116,'0000000');
  if(size<8**11)put(124,size.toString(8).padStart(11,'0'));
  else{let n=size;for(let i=135;i>124;i--){h[i]=n%256;n=Math.floor(n/256);}h[124]=128;}
  put(136,'00000000000');put(156,'0');put(257,'ustar');put(263,'00');
  put(148,sum(h).toString(8).padStart(6,'0')+'\0 ');return h;
}
async function inspect(file,signal){
  if(!(file instanceof Blob)||file.size<block)return null;
  let offset=0,doc=null;const entries=new Map();
  while(offset+block<=file.size){
    if(signal?.aborted)throw new DOMException('Abertura cancelada.','AbortError');
    const part=file.slice(offset,offset+block);
    let bytes;
    try{bytes=root.GeoMineRasterSource?await GeoMineRasterSource.read(part,{signal}):await part.arrayBuffer();}
    catch(error){if(!doc&&error.name!=='AbortError')return null;throw error;}
    const h=new Uint8Array(bytes);
    const name=decoder.decode(h.subarray(0,100)).split('\0')[0];
    if(!doc&&(name!==documentName||decoder.decode(h.subarray(257,262))!=='ustar'))return null;
    if(doc&&!name){
      if(h.some(Boolean)||offset+2*block>file.size||(new Uint8Array(await file.slice(offset+block,offset+2*block).arrayBuffer())).some(Boolean))throw invalid();
      return {doc,entries};
    }
    const size=readSize(h.subarray(124,136)),end=offset+block+size;
    if(!Number.isSafeInteger(size)||size<=0||end>file.size||sum(h)!==readSize(h.subarray(148,156))||![0,48].includes(h[156]))throw invalid();
    if(!doc)doc=file.slice(offset+block,end);
    else{
      if(!/^rasters\/[0-9]+\.tif$/.test(name)||entries.has(name))throw invalid();
      entries.set(name,file.slice(offset+block,end,'image/tiff'));
    }
    offset=end+padding(size);
  }
  throw invalid();
}
function link(data,archive){
  if(!archive)return;
  const used=new Set();
  for(const row of [...(data.rasters||[]),data.img].filter(Boolean)){
    const ref=row.packedTiff;if(!ref)continue;
    const blob=archive.entries.get(ref.entry);
    if(!blob||used.has(ref.entry)||blob.size!==ref.size||typeof ref.name!=='string'||typeof ref.fingerprint!=='string')throw invalid();
    used.add(ref.entry);
    const file=new File([blob],ref.name,{type:'image/tiff',lastModified:ref.lastModified||0});
    bundled.set(row,{file,ref});
  }
  if(used.size!==archive.entries.size)throw invalid();
}
function inherit(saved,live){if(bundled.has(saved))bundled.set(live,bundled.get(saved));}
async function original(item){
  const record=bundled.get(item);if(!record)return null;
  if(await projectNativeFingerprint(record.file)!==record.ref.fingerprint)throw invalid();
  return record.file;
}
function collect(data){
  const list=[];
  function include(item,row,kind){
    if(!item||!row||item.tinPuro)return;
    const raster=kind==='raster',file=raster?item._projectSourceRaw:item._sourceRaw;
    if(raster&&item._projectNativeBinding&&!projectNativeRasterSourceCurrent(item))return;
    const stored=bundled.get(item),raw=file instanceof Blob?file:stored?.file;
    if(!raw){
      const tif=/\.tiff?$/i.test(item.src?.file||item.srcName||item.originalSource?.name||'');
      if(tif&&(raster?!projectRasterReady(item):true)){
        throw Error('Vincule o TIFF original de “'+item.name+'” para salvar o projeto na resolução nativa.');
      }
      return;
    }
    if(!raster&&!item._img0&&!stored&&!/\.tiff?$/i.test(item.src?.file||raw.name||''))return;
    const name=raw.name||item.src?.file||item.srcName||item.name+'.tif';
    list.push({row,file:raw,name,entry:'rasters/'+list.length+'.tif'});
  }
  const byId=new Map((S.rasters||[]).map(r=>[r.id,r]));
  for(const row of data.rasters||[])include(byId.get(row.rid),row,'raster');
  include(S.img,data.img,'ortho');return list;
}
async function pack(data,pieces){
  const files=collect(data);if(!files.length)return null;
  for(const {row,file,name,entry} of files){
    row.packedTiff={entry,name,size:file.size,lastModified:file.lastModified||0,fingerprint:await projectNativeFingerprint(file)};
  }
  const json=new Blob(Array.from(pieces(data))),parts=[];
  function add(name,blob){parts.push(header(name,blob.size),blob,new Uint8Array(padding(blob.size)));}
  add(documentName,json);for(const {entry,file} of files)add(entry,file);
  parts.push(new Uint8Array(2*block));
  return {blob:new Blob(parts,{type:'application/octet-stream'}),json,refs:files.map(f=>f.row.packedTiff)};
}
async function verify(file,packet){
  if(file.size!==packet.blob.size)throw invalid();
  const a=await inspect(file);if(!a||a.doc.size!==packet.json.size||a.entries.size!==packet.refs.length)throw invalid();
  for(let offset=0;offset<a.doc.size;offset+=1048576){
    const before=new Uint8Array(await packet.json.slice(offset,offset+1048576).arrayBuffer());
    const saved=new Uint8Array(await a.doc.slice(offset,offset+1048576).arrayBuffer());
    if(before.some((b,i)=>saved[i]!==b))throw invalid();
  }
  for(const ref of packet.refs){const blob=a.entries.get(ref.entry);if(!blob||blob.size!==ref.size||await projectNativeFingerprint(blob)!==ref.fingerprint)throw invalid();}
}
root.GeoMineNativePackage={inspect,link,inherit,original,pack,verify,has:item=>bundled.has(item)};
})(window);

