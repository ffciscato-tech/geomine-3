/* ============================================================================
   GEOTIFF — REUTILIZAÇÃO LIMITADA DE BLOCOS E FILA DE LEITURA

   prepareImage(im) instala cache LRU externo de strips/tiles decodificados.
   No tablet, também protege readRasters chamado diretamente: a biblioteca
   aloca a janela nativa antes de pedir o primeiro bloco. Todas as leituras
   da imagem preparada passam pelo mesmo orçamento e pela mesma fila.
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
   No tablet, leituras acima de 32 MiB de trabalho são recusadas ANTES da
   alocação, inclusive quando a fila está vazia. Cada bloco admite até
   8 MiB decodificados/compactados e 32 MiB de trabalho (3×decode + 2×fonte).
   Esses limites não são teto de RAM total: cache, imagens exibidas e outros
   módulos continuam existentes. A resolução nunca é reduzida pelo guard.
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
  (/Mac/i.test((nav.platform||'')+' '+(nav.userAgent||''))&&Number(nav.maxTouchPoints)>1);
const MOBILE_READ_BYTES=32*MiB,MOBILE_BLOCK_BYTES=8*MiB;
let budgetBytes=(mobile?32:96)*MiB;
let readBudgetBytes=(mobile?32:96)*MiB;
let concurrency=2,bytes=0,active=0,activeBytes=0,imageSeq=0,jobSeq=0;
const prepared=new WeakMap(),nativeReaders=new WeakMap(),memoryInfo=new WeakMap(),tiffs=new WeakMap(),resolved=new Map(),inFlight=new Map(),queue=[];
const counters={hits:0,misses:0,deduplicated:0,evictions:0,reads:0,aborted:0,errors:0,imagesPrepared:0,
  sampledReads:0,sampledBlocks:0,sampledValues:0,memoryRejected:0};

function abortError(){const error=new Error('Leitura de tile não é mais necessária.');error.name='AbortError';return error;}
function checkMobileBytes(size,limit,part){
  if(!mobile||Number.isSafeInteger(size)&&size>=0&&size<=limit)return;
  counters.memoryRejected++;
  const error=new RangeError('GeoTIFF: '+part+' excede o limite de '+(limit/MiB)+' MiB deste dispositivo. A leitura foi interrompida sem reduzir a resolução.');
  error.code='RASTER_MEMORY_LIMIT';error.estimatedBytes=size;error.limitBytes=limit;throw error;
}
function sampleMemoryBytes(im,sample){
  const fd=im.fileDirectory||{},bits=Number(fd.BitsPerSample?.[sample]??fd.BitsPerSample?.[0]??8),
    format=Number(fd.SampleFormat?.[sample]??fd.SampleFormat?.[0]??1);
  // Float16 and packed integers use expanded output arrays in readRasters.
  let size=format===3&&bits===16?4:bits<=8?1:bits<=16?2:bits<=32?4:Math.ceil(bits/8);
  try{size=Math.max(size,Number(im.getSampleByteSize?.(sample))||0);}catch(_){}
  return size;
}
function mobileImageMemory(im){
  if(!mobile)return null;
  if(memoryInfo.has(im))return memoryInfo.get(im);
  const fd=im.fileDirectory||{},tw=Number(im.getTileWidth()),th=Number(im.getTileHeight()),
    width=Number(im.getWidth()),height=Number(im.getHeight()),count=Number(im.getSamplesPerPixel()),
    planar=Number(im.planarConfiguration??fd.PlanarConfiguration??1);
  if(![tw,th,width,height,count].every(n=>Number.isSafeInteger(n)&&n>0))throw new RangeError('Dimensões GeoTIFF inválidas.');
  checkMobileBytes(count*1024,1024*1024,'número de bandas do cabeçalho');
  let pixelBytes=0;
  for(let i=0;i<count;i++)pixelBytes=planar===2?Math.max(pixelBytes,sampleMemoryBytes(im,i)):pixelBytes+sampleMemoryBytes(im,i);
  const decoded=tw*(fd.StripOffsets?Math.min(th,height):th)*pixelBytes,counts=fd.TileByteCounts||fd.StripByteCounts;
  checkMobileBytes(decoded,MOBILE_BLOCK_BYTES,'bloco decodificado');
  let maxCompressed=0;
  if(counts!=null)for(let i=0,n=typeof counts==='number'?1:counts.length;i<n;i++){
    const size=Number(typeof counts==='number'?counts:counts[i]);
    checkMobileBytes(size,MOBILE_BLOCK_BYTES,'bloco compactado');maxCompressed=Math.max(maxCompressed,size);
  }
  checkMobileBytes(3*decoded+2*maxCompressed,MOBILE_READ_BYTES,'memória de trabalho do bloco');
  const info={tw,th,width,height,planar,across:Math.ceil(width/tw),down:Math.ceil(height/th),counts,maxCompressed};
  memoryInfo.set(im,info);return info;
}
function compressedWindowBytes(info,win,samples,baseBytes){
  if(!info?.counts)return 0;
  const x0=Math.max(0,Math.floor(win[0]/info.tw)),x1=Math.min(info.across,Math.ceil(win[2]/info.tw)),
    y0=Math.max(0,Math.floor(win[1]/info.th)),y1=Math.min(info.down,Math.ceil(win[3]/info.th)),
    planes=info.planar===2?samples:[0],count=Math.max(0,x1-x0)*Math.max(0,y1-y0)*planes.length;
  // Bound Promise/decoder fan-out as well as byte buffers. Large resampled
  // reads use the sequential sampler instead of this native-window path.
  checkMobileBytes(count*1024,4*MiB,'quantidade de blocos simultâneos');
  let compressed=0;
  for(const sample of planes)for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
    const index=sample*info.across*info.down+y*info.across+x;
    compressed+=Number(typeof info.counts==='number'?info.counts:info.counts[index]);
    checkMobileBytes(baseBytes+2*compressed,Math.min(readBudgetBytes,MOBILE_READ_BYTES),'janela de leitura');
  }
  return compressed;
}
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
    try{mobileImageMemory(im);}catch(error){return Promise.reject(error);}
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
  if(mobile&&typeof im.readRasters==='function'){
    /* Guardar o método original impede recursão quando execute sai da fila.
       Envolver só getTileOrStrip seria tarde: readRasters já teria criado
       a matriz da janela inteira antes de consultar o primeiro tile. */
    nativeReaders.set(im,im.readRasters);
    im.readRasters=function readBoundedRasters(options={}){return read(im,options);};
  }
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
      width>sw||height>sh||(!mobile&&width===sw&&height===sh))return null;
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
    const expandedPixel=planar===1?Array.from({length:count},(_,s)=>sampleMemoryBytes(im,s)).reduce((a,b)=>a+b,0)
      :Math.max(...samples.map(s=>sampleMemoryBytes(im,s)));
    const blockBytes=tw*th*Math.max(...strides,expandedPixel);
    const estimatedBytes=outputBytes*(linear?5:1)+blockBytes+(width+height)*(linear?160:80);
    if(!Number.isSafeInteger(estimatedBytes))return null;
    return {win:Array.from(win),iw,ih,tw,th,sw,sh,width,height,samples,interleave,types,strides,offsets,readers,
      linear,planar,decoder,estimatedBytes,blockBytes};
  }catch(_){return null;}
}
function canReadResampled(im,options={}){return !!sampledPlan(im,options);}
/* Size only the display overview, before allocating its canvas/planes. Wide
   RGBA strips can fit individually while their full preview exceeds 32 MiB. */
function previewSize(im,width,height){
 if(!mobile)return {width,height};const info=mobileImageMemory(im),samples=Array.from({length:Math.min(4,im.getSamplesPerPixel())},(_,i)=>i);
 for(let i=0;i<40;i++){
  const options={samples,window:[0,0,im.getWidth(),im.getHeight()],width,height,resampleMethod:'nearest'},plan=sampledPlan(im,options);
  if(!plan)return {width,height};const estimated=estimateReadBytes(im,options,plan,info);
  if(estimated<=Math.min(readBudgetBytes,MOBILE_READ_BYTES))return {width,height};
  if(width<=2&&height<=2){checkMobileBytes(estimated,Math.min(readBudgetBytes,MOBILE_READ_BYTES),'prévia');}
  width=Math.max(2,Math.floor(width*.9));height=Math.max(2,Math.floor(height*.9));
 }
 throw new RangeError('Não foi possível preparar uma prévia dentro do orçamento de memória.');
}
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
function estimateReadBytes(im,options,sampled,info){
  if(sampled)return sampled.estimatedBytes+(mobile?2*sampled.blockBytes+2*(info?.maxCompressed||0):0);
  const win=options.window||[0,0,im.getWidth?.()||0,im.getHeight?.()||0];
  const width=Math.max(0,Number(win[2])-Number(win[0])),height=Math.max(0,Number(win[3])-Number(win[1]));
  const fd=im.fileDirectory||{},count=Number(im.getSamplesPerPixel?.()||fd.SamplesPerPixel)||1;
  const samples=options.samples&&options.samples.length?options.samples:Array.from({length:count},(_,i)=>i);
  const sampleBytes=samples.map(sample=>sampleMemoryBytes(im,sample));
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
          blockPixelBytes=0;
          for(let sample=0;sample<count;sample++)blockPixelBytes+=sampleMemoryBytes(im,sample);
          blockPixelBytes=Math.max(blockPixelBytes,Number(im.getBytesPerPixel?.())||0);
        }
        blocks=nx*ny*tw*th*blockPixelBytes;
      }
    }catch(_){blocks=0;}
  }
  let total=raw+output+(mobile?3:1)*blocks;
  if(mobile){
    checkMobileBytes(total,Math.min(readBudgetBytes,MOBILE_READ_BYTES),'janela de leitura');
    total+=2*compressedWindowBytes(info,win,samples,total);
  }
  return Number.isFinite(total)?Math.max(0,total):mobile?Infinity:readBudgetBytes;
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
    const nativeRead=nativeReaders.get(job.im)||job.im.readRasters;
    const result=job.sampled?await readSampled(job):await nativeRead.call(job.im,readOptions);
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
  if(mobile)for(let i=queue.length-1;i>=0;i--){
    try{checkMobileBytes(queue[i].bytes,Math.min(readBudgetBytes,MOBILE_READ_BYTES),'janela de leitura');}
    catch(error){queue.splice(i,1)[0].reject(error);}
  }
  queue.sort((a,b)=>priorityOf(a)-priorityOf(b)||b.id-a.id);
  while(active<concurrency&&queue.length){
    const limit=mobile?Math.min(readBudgetBytes,MOBILE_READ_BYTES):readBudgetBytes;
    const index=queue.findIndex(job=>(!mobile&&active===0)||activeBytes+job.bytes<=limit);
    if(index<0)break;
    const job=queue.splice(index,1)[0];execute(job);
  }
}
function read(im,options={},control={}){
  return new Promise((resolve,reject)=>{
    let image;
    try{image=prepareImage(im);if(typeof image.readRasters!=='function')throw new TypeError('Imagem sem readRasters.');}
    catch(error){reject(error);return;}
    const info=mobileImageMemory(image),sampled=sampledPlan(image,options),estimated=estimateReadBytes(image,options,sampled,info);
    checkMobileBytes(estimated,Math.min(readBudgetBytes,MOBILE_READ_BYTES),'janela de leitura');
    const job={id:++jobSeq,im:image,options:{...options},sampled,isCurrent:control.isCurrent,nearestFloor:control.nearestFloor===true,
      priority:control.priority,onProgress:control.onProgress,onPreviewBlock:control.onPreviewBlock,resolve,reject,bytes:estimated};
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
  queued:queue.length,active,activeBytes,activeEstimatedBytes:activeBytes,readBudgetIsEstimate:true,concurrency,mobile,
  hardReadBudgetBytes:mobile?Math.min(readBudgetBytes,MOBILE_READ_BYTES):null,hardBlockBytes:mobile?MOBILE_BLOCK_BYTES:null};}
window.GeoMineTileRuntime={version:3,prepareImage,overview,read,canReadResampled,previewSize,configure,clear,resetStats,stats};
})();
