'use strict';
// Gera cópias completas, datadas e verificadas do WFS público do SEGEMAR.
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {once}=require('node:events');const {pipeline}=require('node:stream/promises');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'public/data/segemar');
const inventory=JSON.parse(fs.readFileSync(process.argv[2]||'/tmp/segemar-inventory.json','utf8'));
const manifestPath=path.join(out,'manifest.json');fs.mkdirSync(out,{recursive:true});
let previous={layers:[]};try{previous=JSON.parse(fs.readFileSync(manifestPath,'utf8'))}catch{}
const manifest={provider:'SEGEMAR / SIGAM',source:'https://sigam.segemar.gov.ar/geoserver217/wfs',sourceLayerCount:inventory.length,snapshotDate:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date()),generatedAt:new Date().toISOString(),complete:false,layers:previous.layers||[]};
const done=new Map(manifest.layers.map(l=>[l.name,l]));let cursor=0;
const priority=l=>/e2\.5M\.UnidadesGeologicas$/.test(l.name)?0:/e5M\.UnidadesGeologicas$/.test(l.name)?1:/UnidadGeologica|UnidadLitologica/.test(l.name)?2:/unidades? geolog|geolog|litolog/i.test(l.title)?3:4;
inventory.sort((a,b)=>priority(a)-priority(b)||a.count-b.count);
function save(){manifest.layers=[...done.values()];fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');}
async function fetchPage(layer,start,count){
 const u=new URL(manifest.source);u.search=new URLSearchParams({service:'WFS',version:'2.0.0',request:'GetFeature',typeNames:layer.name,outputFormat:'application/json',count:String(count),...(layer.wholeRequest?{}:{startIndex:String(start)})});
 let error;for(let attempt=0;attempt<3;attempt++){try{const r=await fetch(u,{signal:AbortSignal.timeout(150000)});if(!r.ok)throw Error('HTTP '+r.status);const j=await r.json();if(j.type!=='FeatureCollection'||!Array.isArray(j.features))throw Error('Resposta sem feições');if(j.crs&&!/4326|CRS84/i.test(JSON.stringify(j.crs)))throw Error('O servidor devolveu CRS não geográfico');return j;}catch(e){error=e;if(attempt<2)await new Promise(r=>setTimeout(r,1000*(attempt+1)));}}throw error;
}
async function build(layer){
 const filename=layer.name.replace(/[^a-zA-Z0-9_-]/g,'_')+'-'+crypto.createHash('sha256').update(layer.name).digest('hex').slice(0,8)+'.geojson.gz',target=path.join(out,filename);
 const old=done.get(layer.name);if(old?.featureCount===layer.count&&fs.existsSync(target)){console.log('REUSE '+layer.title+' '+layer.count);return;}
 const temp=path.join('/tmp','segemar-'+filename+'.part'),gz=zlib.createGzip({level:6}),file=fs.createWriteStream(temp),piped=pipeline(gz,file),hash=crypto.createHash('sha256');let bytes=0,total=0,first=true;const pageHashes=new Set();
 async function write(text){hash.update(text);bytes+=Buffer.byteLength(text);if(!gz.write(text))await once(gz,'drain');}
 try{
  await write('{"type":"FeatureCollection","features":[');
  while(total<layer.count){
   let j;try{j=await fetchPage(layer,total,layer.wholeRequest?layer.count+1:Math.min(1000,layer.count-total));}catch(e){if(total!==0)throw e;layer.wholeRequest=true;j=await fetchPage(layer,0,layer.count+1);}
   const expected=Number(j.numberMatched??j.totalFeatures);if(Number.isFinite(expected)&&expected!==layer.count){if(total===0)layer.count=expected;else throw Error('Contagem do órgão mudou durante o download');}
   if(!j.features.length)throw Error('Página vazia antes do fim');
   const pageHash=crypto.createHash('sha256').update(JSON.stringify(j.features)).digest('hex');if(pageHashes.has(pageHash))throw Error('Servidor repetiu página');pageHashes.add(pageHash);
   for(const feature of j.features){await write((first?'':',')+JSON.stringify(feature));first=false;total++;}
   if(total>layer.count)throw Error('Mais feições que o total declarado');
  }
  await write('],"numberMatched":'+total+',"numberReturned":'+total+'}');gz.end();await piped;await fsp.copyFile(temp,target);await fsp.unlink(temp);
  const stat=await fsp.stat(target);done.set(layer.name,{name:layer.name,title:layer.title,featureCount:total,url:'/data/segemar/'+filename,encoding:'gzip',sha256:hash.digest('hex'),uncompressedBytes:bytes,compressedBytes:stat.size,snapshotDate:manifest.snapshotDate});save();
  console.log('OK '+done.size+'/'+inventory.length+' '+layer.title+' '+total+' '+Math.round(stat.size/1024)+' KiB');
 }catch(e){gz.destroy();await piped.catch(()=>{});await fsp.unlink(temp).catch(()=>{});throw Error(layer.name+': '+e.message);}
}
async function worker(){while(cursor<inventory.length){const layer=inventory[cursor++];try{await build(layer);}catch(e){console.error('FAILED '+e.message);}}}
(async()=>{await Promise.all(Array.from({length:Number(process.argv[3])||3},worker));manifest.complete=inventory.every(l=>done.get(l.name)?.featureCount===l.count);save();console.log(JSON.stringify({complete:manifest.complete,layers:done.size,expected:inventory.length,features:[...done.values()].reduce((n,l)=>n+l.featureCount,0),bytes:[...done.values()].reduce((n,l)=>n+l.compressedBytes,0)}));if(!manifest.complete)process.exitCode=1;})();
