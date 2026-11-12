/* ============================================================================
   GEOTIFF — REUTILIZAÇÃO LIMITADA DE BLOCOS E FILA DE LEITURA

   prepareImage(im) instala cache LRU externo de strips/tiles decodificados.
   O orçamento é global: ortofotos e MDTs disputam o mesmo limite. Não usar
   im.tiles={}, pois o cache interno da biblioteca não tem limite e consulta
   a fonte antes de conferir o cache. A chave não inclui estilo/contraste.

   overview(tiff,img0,W0,H0,dpp) -> Promise<{im,fx,fy}> reutiliza as instâncias
   dos IFDs. fx e fy permanecem separados para rasters com eixos distintos.

   read(im,options,{isCurrent,priority}) -> Promise<readRasters result>
   priority aceita número ou função: menor = mais próximo/importante;
   em empate a solicitação mais recente passa primeiro. Até duas leituras,
   respeitando também a estimativa de memória das janelas não reamostradas e
   seus blocos completos. Downsampling suportado visita apenas os blocos e
   pixels usados pela saída, sem construir a janela em resolução nativa.
   canReadResampled(im,options) permite manter fallback limitado em loaders.
   Essa estimativa não é teto de RAM total: buffers da
   fonte e resultados ativos existem além das alocações estimadas.
   isCurrent=false ou AbortSignal abortado rejeita com AbortError, sem cancelar
   a leitura de um bloco compartilhado com outro tile ainda visível.
   control.nearestFloor=true conserva exclusivamente a amostragem floor do
   preview histórico, após canReadResampled confirmar suporte. O padrão
   continua sendo o nearest arredondado da biblioteca vendorizada.

   configure({maxBytes,readBudgetBytes,concurrency}), clear(), resetStats() e
   stats() permitem diagnósticos/testes. clear não cancela leituras em voo.
   Pool de workers não é ativado aqui: a versão vendorizada não trata falha
   de worker/timeout. O fallback cede um turno ao navegador antes de decodificar.
   ========================================================================== */
(function(){
'use strict';
if(window.GeoMineTileRuntime)return;
const MiB=1024*1024;
const nav=typeof navigator==='object'?navigator:{};
const mobile=/Android|iPhone|iPad|iPod/i.test(nav.userAgent||'')||
  (/Mac/i.test(nav.platform||'')&&Number(nav.maxTouchPoints)>1);
let budgetBytes=(mobile?32:96)*MiB;
let readBudgetBytes=(mobile?32:96)*MiB;
let concurrency=2,bytes=0,active=0,activeBytes=0,imageSeq=0,jobSeq=0;
const prepared=new WeakMap(),tiffs=new WeakMap(),resolved=new Map(),inFlight=new Map(),queue=[];
const counters={hits:0,misses:0,deduplicated:0,evictions:0,reads:0,aborted:0,errors:0,imagesPrepared:0,
  sampledReads:0,sampledBlocks:0,sampledValues:0};

function abortError(){const error=new Error('Leitura de tile não é mais necessária.');error.name='AbortError';return error;}
function touch(key,entry){resolved.delete(key);resolved.set(key,entry);}
function evictTo(limit){
  while(bytes>limit&&resolved.size){
    const key=resolved.keys().next().value,entry=resolved.get(key);
    resolved.delete(key);bytes-=entry.size;counters.evictions++;
  }
}
function cacheBlock(key,data){
  const size=Number(data&&data.byteLength)||0;
  if(!size||size>budgetBytes)return;
  const previous=resolved.get(key);
  if(previous){bytes-=previous.size;resolved.delete(key);}
  evictTo(Math.max(0,budgetBytes-size));resolved.set(key,{data,size});bytes+=size;
}
function callerResult(promise,x,y,sample,signal){
  return promise.then(data=>{
    if(signal&&signal.aborted)throw abortError();
    return {x,y,sample,data};
  });
}
function prepareImage(im){
  if(!im||(typeof im!=='object'&&typeof im!=='function'))throw new TypeError('Imagem GeoTIFF inválida.');
  if(prepared.has(im))return im;
  const original=im.getTileOrStrip;
  if(typeof original!=='function')return im;
  const id=++imageSeq;
  /* Desativa e solta eventuais blocos internos que não respeitam o orçamento. */
  im.tiles=null;
  im.getTileOrStrip=function getBoundedTileOrStrip(x,y,sample,pool,signal){
    if(signal&&signal.aborted)return Promise.reject(abortError());
    const planar=Number(im.planarConfiguration??im.fileDirectory?.PlanarConfiguration??1);
    const sourceSample=planar===1?0:sample;
    const key=id+':'+x+':'+y+':'+sourceSample;
    const cached=resolved.get(key);
    if(cached){counters.hits++;touch(key,cached);return callerResult(Promise.resolve(cached.data),x,y,sample,signal);}
    const pending=inFlight.get(key);
    if(pending){counters.deduplicated++;return callerResult(pending,x,y,sample,signal);}
    counters.misses++;
    /* Promise criada antes da chamada original também deduplica solicitações
       no mesmo turno. O sinal individual não pode abortar o bloco de todos. */
    const promise=Promise.resolve().then(()=>original.call(im,x,y,sourceSample,pool,undefined)).then(result=>{
      const data=result&&result.data;
      if(!data||typeof data.byteLength!=='number')throw new Error('Bloco GeoTIFF decodificado inválido.');
      // Decoder não recebe o índice do strip; aqui é possível distinguir
      // a última faixa (mais curta) de uma faixa intermediária truncada.
      if(window.GeoMineLZWDecoder?.validateTile)GeoMineLZWDecoder.validateTile(im,x,y,sourceSample,data);
      cacheBlock(key,data);return data;
    });
    inFlight.set(key,promise);
    promise.then(()=>{if(inFlight.get(key)===promise)inFlight.delete(key);},()=>{
      if(inFlight.get(key)===promise)inFlight.delete(key);counters.errors++;
    });
    return callerResult(promise,x,y,sample,signal);
  };
  prepared.set(im,id);counters.imagesPrepared++;return im;
}

function tiffState(tiff,img0){
  let state=tiffs.get(tiff);
  if(!state){state={images:new Map(),count:null,list:null};tiffs.set(tiff,state);}
  if(img0&&!state.images.has(0))state.images.set(0,Promise.resolve(prepareImage(img0)));
  return state;
}
function imageAt(tiff,state,index){
  if(state.images.has(index))return state.images.get(index);
  const promise=Promise.resolve().then(()=>tiff.getImage(index)).then(prepareImage);
  state.images.set(index,promise);
  promise.catch(()=>{if(state.images.get(index)===promise)state.images.delete(index);});
  return promise;
}
function imageList(tiff,img0){
  const state=tiffState(tiff,img0);
  if(state.list)return state.list;
  if(!state.count){
    const count=Promise.resolve().then(()=>typeof tiff.getImageCount==='function'?tiff.getImageCount():1);
    state.count=count;count.catch(()=>{if(state.count===count)state.count=null;});
  }
  const list=state.count.then(async count=>{
    const images=[];
    for(let i=0;i<Math.max(1,Number(count)||1);i++)images.push(await imageAt(tiff,state,i));
    return images;
  });
  state.list=list;list.catch(()=>{if(state.list===list)state.list=null;});return list;
}
async function overview(tiff,img0,W0,H0,dpp){
  const images=await imageList(tiff,img0);
  const base=img0||images[0];
  const width=Number(W0)||base.getWidth(),height=Number(H0)||base.getHeight();
  const target=Math.max(1,Number(dpp)||1);
  let best={im:prepareImage(base),fx:1,fy:1},bestScale=1;
  for(const im of images){
    const directory=im.fileDirectory||(typeof im.getFileDirectory==='function'?im.getFileDirectory():{});
    if((Number(directory.NewSubfileType)||0)&4)continue; // IFD de máscara, não uma overview colorida.
    const w=Number(im.getWidth()),h=Number(im.getHeight());
    if(!(w>0&&h>0&&w<=width&&h<=height))continue;
    const fx=width/w,fy=height/h,scale=Math.min(fx,fy);
    /* Não escolher um eixo mais grosseiro que a resolução pedida. */
    if(Math.max(fx,fy)<=target*1.000001&&scale>bestScale){best={im,fx,fy};bestScale=scale;}
  }
  return best;
}

function current(job){
  if(job.options.signal&&job.options.signal.aborted)return false;
  try{return typeof job.isCurrent!=='function'||job.isCurrent()!==false;}catch(_){return false;}
}
function priorityOf(job){
  try{const value=Number(typeof job.priority==='function'?job.priority():job.priority);return Number.isFinite(value)?value:0;}
  catch(_){return 0;}
}
/* O contrato abaixo acompanha readRasters/resample da versão vendorizada:
   nearest usa round (não floor); bilinear interpola os valores já convertidos
   para o tipo da saída nativa e inclui NaN/NoData sem tratamento especial.
   Layouts exóticos ficam com a biblioteca, inclusive amostras compactadas. */
function arrayType(format,bits){
  if(format===1)return bits===8?Uint8Array:bits===16?Uint16Array:bits===32?Uint32Array:null;
  if(format===2)return bits===8?Int8Array:bits===16?Int16Array:bits===32?Int32Array:null;
  if(format===3)return bits===16||bits===32?Float32Array:bits===64?Float64Array:null;
  return null;
}
function sampledPlan(im,options){
  try{
    if(!im||!['getWidth','getHeight','getTileWidth','getTileHeight','getTileOrStrip',
      'getSamplesPerPixel','getBytesPerPixel','getReaderForSample'].every(key=>typeof im[key]==='function'))return null;
    const decoder=window.GeoTIFF&&window.GeoTIFF.getDecoder;
    if(!(options.pool&&typeof options.pool.decode==='function')&&typeof decoder!=='function')return null;
    const iw=im.getWidth(),ih=im.getHeight(),tw=im.getTileWidth(),th=im.getTileHeight();
    if(![iw,ih,tw,th].every(n=>Number.isSafeInteger(n)&&n>0))return null;
    const win=options.window||[0,0,iw,ih];
    if(win.length!==4||!Array.from(win).every(Number.isSafeInteger))return null;
    const sw=win[2]-win[0],sh=win[3]-win[1],width=options.width,height=options.height;
    if(![sw,sh,width,height].every(n=>Number.isSafeInteger(n)&&n>0)||
      width>sw||height>sh||(width===sw&&height===sh))return null;
    const method=options.resampleMethod===undefined?'nearest':options.resampleMethod;
    if(typeof method!=='string'||!['nearest','bilinear','linear'].includes(method.toLowerCase()))return null;
    const fd=im.fileDirectory,planar=Number(im.planarConfiguration??fd?.PlanarConfiguration??1);
    if(!fd||!fd.BitsPerSample||![1,2].includes(planar))return null;
    const count=im.getSamplesPerPixel(),bits=Array.from(fd.BitsPerSample);
    if(!Number.isSafeInteger(count)||count<1||bits.length!==count)return null;
    const formats=fd.SampleFormat?Array.from(fd.SampleFormat):Array(count).fill(1);
    if(formats.length!==count||!bits.every((b,i)=>arrayType(formats[i],b)))return null;
    const samples=options.samples&&options.samples.length?Array.from(options.samples):Array.from({length:count},(_,i)=>i);
    if(!samples.every(s=>Number.isSafeInteger(s)&&s>=0&&s<count))return null;
    /* A versão atual compartilha o stride na leitura planar; layouts planares
       de larguras diferentes ficam no caminho original, sem reinterpretá-los. */
    if(planar===2&&!samples.every(s=>bits[s]===bits[samples[0]]))return null;
    const interleave=!!options.interleave;
    const types=interleave?[arrayType(Math.max(...formats),Math.max(...bits))]:samples.map(s=>arrayType(formats[s],bits[s]));
    if(types.some(type=>!type))return null;
    const strides=samples.map(s=>planar===1?im.getBytesPerPixel():bits[s]/8);
    if(!strides.every(n=>Number.isSafeInteger(n)&&n>0))return null;
    const offsets=samples.map(s=>planar===1?bits.slice(0,s).reduce((a,b)=>a+b,0)/8:0);
    const readers=samples.map(s=>im.getReaderForSample(s));
    if(!readers.every(reader=>typeof reader==='function'))return null;
    const pixelBytes=interleave?types[0].BYTES_PER_ELEMENT*samples.length:types.reduce((n,type)=>n+type.BYTES_PER_ELEMENT,0);
    const linear=method.toLowerCase()!=='nearest';
    const outputBytes=width*height*pixelBytes;
    /* Bilinear mantém quatro planos de vizinhos mais a saída. Em previews
       grandes com redução leve, isso gastaria mais que a janela original
       mais saída da biblioteca. Tiles de até 2 MiB preservam o caminho com
       cancelamento entre blocos/linhas; acima disso, nunca ampliar os planos
       de pixels em comparação com a leitura nativa seguida de resample. */
    if(linear&&outputBytes>2*MiB&&4*width*height>sw*sh)return null;
    const blockBytes=tw*th*Math.max(...strides);
    const estimatedBytes=outputBytes*(linear?5:1)+blockBytes+(width+height)*(linear?160:80);
    if(!Number.isSafeInteger(estimatedBytes))return null;
    return {win:Array.from(win),iw,ih,tw,th,sw,sh,width,height,samples,interleave,types,strides,offsets,readers,
      linear,planar,decoder,estimatedBytes};
  }catch(_){return null;}
}
function canReadResampled(im,options={}){return !!sampledPlan(im,options);}
function sampledAxis(nativeSize,outSize,start,blockSize,imageSize,linear,nearestFloor){
  const groups=new Map(),fractions=linear?new Float64Array(outSize):null,scale=nativeSize/outSize;
  for(let out=0;out<outSize;out++){
    // O preview histórico usa out*nativeSize/outSize; preservar a ordem das
    // operações evita floor cair no pixel anterior em razões não exatas.
    const position=nearestFloor&&!linear?out*nativeSize/outSize:scale*out;
    if(linear)fractions[out]=position%1;
    const first=linear||nearestFloor?Math.floor(position):Math.min(Math.round(position),nativeSize-1);
    for(let side=0;side<(linear?2:1);side++){
      const coordinate=start+(side?Math.min(Math.ceil(position),nativeSize-1):first);
      if(coordinate<0||coordinate>=imageSize)continue;
      const block=Math.floor(coordinate/blockSize);
      let entries=groups.get(block);if(!entries){entries=[];groups.set(block,entries);}
      entries.push({out,local:coordinate-block*blockSize,side});
    }
  }
  return {groups,fractions};
}
function sampledArrays(plan,fillValue){
  const length=plan.width*plan.height;
  if(plan.interleave){
    const array=new plan.types[0](length*plan.samples.length);
    if(fillValue)array.fill(fillValue); // inclui a coerção de fillValue da biblioteca.
    return array;
  }
  return plan.types.map((Type,index)=>{
    const array=new Type(length);
    if(Array.isArray(fillValue)&&index<fillValue.length)array.fill(fillValue[index]);
    else if(fillValue&&!Array.isArray(fillValue))array.fill(fillValue);
    return array;
  });
}
async function readSampled(job){
  const p=job.sampled,im=job.im;
  const ensureCurrent=()=>{if(!current(job))throw abortError();};
  ensureCurrent();
  const xAxis=sampledAxis(p.sw,p.width,p.win[0],p.tw,p.iw,p.linear,job.nearestFloor);
  const yAxis=sampledAxis(p.sh,p.height,p.win[1],p.th,p.ih,p.linear,job.nearestFloor);
  const planes=Array.from({length:p.linear?4:1},()=>sampledArrays(p,job.options.fillValue));
  const decoder=job.options.pool||await p.decoder(im.fileDirectory);
  ensureCurrent();counters.sampledReads++;
  /* Só um bloco decodificado é mantido localmente; os demais vivem no LRU
     global. Os mapas de eixos são O(width+height), nunca O(janela nativa). */
  let lastYield=Date.now();
  const groups=p.planar===1?[p.samples.map((_,i)=>i)]:p.samples.map((_,i)=>[i]);
  let completed=0;
  const total=xAxis.groups.size*yAxis.groups.size*groups.length;
  for(const [by,ys] of yAxis.groups)for(const [bx,xs] of xAxis.groups){
    for(const indexes of groups){
      if(Date.now()-lastYield>=8){await yieldToBrowser();lastYield=Date.now();}
      ensureCurrent();
      const sample=p.planar===1?0:p.samples[indexes[0]];
      const tile=await im.getTileOrStrip(bx,by,sample,decoder);
      ensureCurrent();counters.sampledBlocks++;
      const view=new DataView(tile.data);
      let rows=0;
      for(const y of ys){
        if(rows++%32===0){
          if(Date.now()-lastYield>=8){await yieldToBrowser();lastYield=Date.now();}
          ensureCurrent();
        }
        for(const x of xs){
          const corner=planes[y.side*2+x.side],pixel=y.out*p.width+x.out;
          for(const s of indexes){
            const value=p.readers[s].call(view,(y.local*p.tw+x.local)*p.strides[s]+p.offsets[s],im.littleEndian);
            if(p.interleave)corner[pixel*p.samples.length+s]=value;else corner[s][pixel]=value;
            counters.sampledValues++;
          }
        }
      }
      completed++;
      if(typeof job.onProgress==='function'){
        try{job.onProgress({loaded:completed,total,phase:'decode'});}catch(_){}
      }
    }
    if(!p.linear&&!p.interleave&&typeof job.onPreviewBlock==='function'){
      try{job.onPreviewBlock({bands:planes[0],xs,ys,width:p.width,height:p.height});}catch(_){}
    }
  }
  ensureCurrent();
  let result=planes[0];
  if(p.linear){
    result=sampledArrays(p,0);
    for(let y=0;y<p.height;y++){
      if(y%32===0){await yieldToBrowser();ensureCurrent();}
      const fy=yAxis.fractions[y];
      for(let x=0;x<p.width;x++){
        const fx=xAxis.fractions[x],pixel=y*p.width+x;
        for(let s=0;s<p.samples.length;s++){
          const index=p.interleave?pixel*p.samples.length+s:pixel;
          const a=p.interleave?planes[0]:planes[0][s],b=p.interleave?planes[1]:planes[1][s];
          const c=p.interleave?planes[2]:planes[2][s],d=p.interleave?planes[3]:planes[3][s];
          const target=p.interleave?result:result[s];
          target[index]=(1-fy)*((1-fx)*a[index]+fx*b[index])+fy*((1-fx)*c[index]+fx*d[index]);
        }
      }
    }
  }
  result.width=p.width;result.height=p.height;return result;
}
function estimateReadBytes(im,options,sampled){
  if(sampled)return sampled.estimatedBytes;
  const win=options.window||[0,0,im.getWidth?.()||0,im.getHeight?.()||0];
  const width=Math.max(0,Number(win[2])-Number(win[0])),height=Math.max(0,Number(win[3])-Number(win[1]));
  const fd=im.fileDirectory||{},count=Number(im.getSamplesPerPixel?.()||fd.SamplesPerPixel)||1;
  const samples=options.samples&&options.samples.length?options.samples:Array.from({length:count},(_,i)=>i);
  const sampleBytes=samples.map(sample=>{
    try{const n=Number(im.getSampleByteSize?.(sample));if(n>0)return n;}catch(_){}
    return Math.ceil(Number(fd.BitsPerSample?.[sample]||fd.BitsPerSample?.[0]||8)/8);
  });
  const pixelBytes=options.interleave?Math.max(...sampleBytes)*samples.length:sampleBytes.reduce((sum,n)=>sum+n,0);
  const raw=width*height*pixelBytes;
  const outWidth=Number(options.width)||width,outHeight=Number(options.height)||height;
  const output=(outWidth!==width||outHeight!==height)?outWidth*outHeight*pixelBytes:0;
  let blocks=0;
  /* Uma janela estreita em TIFF striped ainda decodifica a largura inteira
     de cada strip. Somar os blocos evita rodar duas dessas leituras gigantes
     só porque o recorte final é pequeno. A estimativa é conservadora quando
     parte dos blocos já está no LRU; não enumera os blocos individualmente. */
  if(typeof im.getTileWidth==='function'&&typeof im.getTileHeight==='function'){
    try{
      const tw=Number(im.getTileWidth()),th=Number(im.getTileHeight());
      const iw=Number(im.getWidth()),ih=Number(im.getHeight());
      if(tw>0&&th>0&&iw>0&&ih>0){
        const nx=Math.max(0,Math.min(Math.ceil(Number(win[2])/tw),Math.ceil(iw/tw))-Math.max(0,Math.floor(Number(win[0])/tw)));
        const ny=Math.max(0,Math.min(Math.ceil(Number(win[3])/th),Math.ceil(ih/th))-Math.max(0,Math.floor(Number(win[1])/th)));
        const planar=Number(im.planarConfiguration??fd.PlanarConfiguration??1);
        let blockPixelBytes=sampleBytes.reduce((sum,n)=>sum+n,0);
        if(planar===1){
          blockPixelBytes=Number(im.getBytesPerPixel?.())||0;
          if(!(blockPixelBytes>0))for(let sample=0;sample<count;sample++){
            blockPixelBytes+=Math.ceil(Number(fd.BitsPerSample?.[sample]||fd.BitsPerSample?.[0]||8)/8);
          }
        }
        blocks=nx*ny*tw*th*blockPixelBytes;
      }
    }catch(_){blocks=0;}
  }
  const total=raw+output+blocks;
  return Number.isFinite(total)?Math.max(0,total):readBudgetBytes;
}
function yieldToBrowser(){
  try{if(window.scheduler&&typeof window.scheduler.yield==='function')return window.scheduler.yield();}catch(_){}
  return new Promise(resolve=>setTimeout(resolve,0));
}
function stale(job){counters.aborted++;job.reject(abortError());}
async function execute(job){
  active++;activeBytes+=job.bytes;
  try{
    if(!current(job))throw abortError();
    await yieldToBrowser();
    if(!current(job))throw abortError();
    counters.reads++;
    /* A leitura em voo pode compartilhar strips com outros tiles. Apenas
       descartamos seu resultado quando obsoleta; não abortamos esse trabalho. */
    const readOptions={...job.options};delete readOptions.signal;
    const result=job.sampled?await readSampled(job):await job.im.readRasters(readOptions);
    if(!current(job))throw abortError();
    job.resolve(result);
  }catch(error){
    if(error&&error.name==='AbortError')counters.aborted++;else counters.errors++;
    job.reject(error);
  }finally{active--;activeBytes-=job.bytes;drain();}
}
function drain(){
  /* Tiles retirados durante pan/zoom não devem ocupar a fila esperando decode. */
  for(let i=queue.length-1;i>=0;i--){if(!current(queue[i]))stale(queue.splice(i,1)[0]);}
  queue.sort((a,b)=>priorityOf(a)-priorityOf(b)||b.id-a.id);
  while(active<concurrency&&queue.length){
    const index=queue.findIndex(job=>active===0||activeBytes+job.bytes<=readBudgetBytes);
    if(index<0)break;
    const job=queue.splice(index,1)[0];execute(job);
  }
}
function read(im,options={},control={}){
  return new Promise((resolve,reject)=>{
    let image;
    try{image=prepareImage(im);if(typeof image.readRasters!=='function')throw new TypeError('Imagem sem readRasters.');}
    catch(error){reject(error);return;}
    const sampled=sampledPlan(image,options);
    const job={id:++jobSeq,im:image,options:{...options},sampled,isCurrent:control.isCurrent,nearestFloor:control.nearestFloor===true,
      priority:control.priority,onProgress:control.onProgress,onPreviewBlock:control.onPreviewBlock,resolve,reject,bytes:estimateReadBytes(image,options,sampled)};
    if(!current(job)){stale(job);return;}
    queue.push(job);drain();
  });
}
function configure(options={}){
  if(Number.isFinite(Number(options.maxBytes))&&Number(options.maxBytes)>=0)budgetBytes=Math.floor(Number(options.maxBytes));
  if(Number.isFinite(Number(options.readBudgetBytes))&&Number(options.readBudgetBytes)>0)readBudgetBytes=Math.floor(Number(options.readBudgetBytes));
  if(Number.isFinite(Number(options.concurrency)))concurrency=Math.max(1,Math.min(2,Math.floor(Number(options.concurrency))||1));
  evictTo(budgetBytes);drain();return stats();
}
function clear(){resolved.clear();bytes=0;return true;}
function resetStats(){for(const key of Object.keys(counters))counters[key]=0;}
function stats(){return {...counters,bytes,budgetBytes,readBudgetBytes,entries:resolved.size,inFlight:inFlight.size,
  queued:queue.length,active,activeBytes,activeEstimatedBytes:activeBytes,readBudgetIsEstimate:true,concurrency,mobile};}
window.GeoMineTileRuntime={version:2,prepareImage,overview,read,canReadResampled,configure,clear,resetStats,stats};
})();
