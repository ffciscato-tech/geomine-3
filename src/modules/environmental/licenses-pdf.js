/* PDF.js 6.4.299 (Mozilla, Apache-2.0): bundled offline and loaded on demand.
 * This module reads local PDF text only. It does not execute document actions,
 * upload documents, perform OCR, or infer legal obligations.
 */
(function(root){
'use strict';
const API_SOURCE=__GEOMINE_LICENSE_PDF_API__;
const WORKER_SOURCE=__GEOMINE_LICENSE_PDF_WORKER__;
const VERSION='6.4.299';
let libraryPromise=null;

function aborted(){return new DOMException('Importação da licença cancelada.','AbortError');}
function check(signal){if(signal&&signal.aborted)throw aborted();}
function progress(callback,detail){if(typeof callback==='function')callback(detail);}
function interruptible(promise,signal){
 if(!signal)return promise;
 check(signal);
 return new Promise((resolve,reject)=>{
  const onAbort=()=>{cleanup();reject(aborted());};
  const cleanup=()=>signal.removeEventListener('abort',onAbort);
  signal.addEventListener('abort',onAbort,{once:true});
  Promise.resolve(promise).then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
 });
}

function library(){
 if(!libraryPromise){
  const url=URL.createObjectURL(new Blob([API_SOURCE],{type:'text/javascript'}));
  libraryPromise=import(url).finally(()=>URL.revokeObjectURL(url)).catch(error=>{
   libraryPromise=null;
   throw new Error('Não foi possível iniciar o leitor de PDF neste navegador. '+error.message);
  });
 }
 return libraryPromise;
}

function localBytes(file,signal){
 check(signal);
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  const cleanup=()=>signal&&signal.removeEventListener('abort',onAbort);
  const onAbort=()=>{reader.abort();cleanup();reject(aborted());};
  reader.onerror=()=>{cleanup();reject(new Error('Não foi possível ler o arquivo PDF.'));};
  reader.onabort=()=>{cleanup();reject(aborted());};
  reader.onload=()=>{cleanup();try{check(signal);resolve(new Uint8Array(reader.result));}catch(error){reject(error);}};
  if(signal)signal.addEventListener('abort',onAbort,{once:true});
  reader.readAsArrayBuffer(file);
 });
}

// Keep the PDF content stream's reading order. Vertical changes and hasEOL
// preserve paragraphs; horizontal gaps preserve separation between table cells.
function pageText(items){
 const lines=[];
 let line='',previous=null;
 const flush=()=>{const value=line.replace(/[\t ]+/g,' ').trim();if(value)lines.push(value);line='';previous=null;};
 for(const item of items||[]){
  if(typeof item.str!=='string')continue;
  const value=item.str.replace(/\u0000/g,'');
  const transform=item.transform||[],x=Number(transform[4]),y=Number(transform[5]);
  const height=Math.max(1,Math.abs(Number(item.height)||Number(transform[3])||10));
  if(previous&&Number.isFinite(y)&&Number.isFinite(previous.y)&&Math.abs(y-previous.y)>Math.max(2,Math.min(height,previous.height)*0.45))flush();
  if(value){
   if(line&&!/\s$/.test(line)&&!/^\s/.test(value)){
    const gap=previous&&Number.isFinite(x)?x-previous.endX:NaN;
    if(!Number.isFinite(gap)||gap>Math.max(0.6,height*0.08))line+=' ';
   }
   line+=value;
  }
  previous={x,y,height,endX:x+(Number(item.width)||0)};
  if(item.hasEOL)flush();
 }
 flush();
 return lines.join('\n');
}

async function read(file,options){
 const {signal,onProgress}=options||{};
 check(signal);
 if(!file||typeof file.slice!=='function'||typeof file.size!=='number')throw new TypeError('Selecione um arquivo PDF local.');
 if(!file.size)throw new Error('O arquivo PDF está vazio.');
 progress(onProgress,{phase:'reading',page:0,total:0});
 const bytes=await localBytes(file,signal);
 check(signal);
 const header=new TextDecoder('latin1').decode(bytes.subarray(0,Math.min(1024,bytes.length)));
 if(!header.includes('%PDF-'))throw new Error('O arquivo selecionado não é um PDF válido.');
 const pdfjs=await interruptible(library(),signal);
 check(signal);
 let workerURL=null,port=null,worker=null,task=null,document=null;
 let cancelled=false,workerFailed=false,workerFailure=null;
 const waiting=promise=>interruptible(Promise.race([promise,workerFailure]),signal);
 const onAbort=()=>{
  cancelled=true;
  if(task)task.destroy().catch(()=>{});
  if(port)port.terminate();
 };
 try{
  // Chromium blocks module workers from opaque file:// origins. The distributed
  // worker has one export and two import.meta.url references (image WASM paths).
  // Adapt only this module envelope for a classic Blob worker in the local HTML;
  // the PDF parser itself remains the pinned, unmodified Mozilla distribution.
  const localHTML=root.location&&root.location.protocol==='file:';
  const workerSource=localHTML?WORKER_SOURCE.replace(/\bimport\.meta\.url\b/g,'self.location.href').replace(/export\{WorkerMessageHandler\};\s*$/,''):WORKER_SOURCE;
  workerURL=URL.createObjectURL(new Blob([workerSource],{type:'text/javascript'}));
  port=new Worker(workerURL,{type:localHTML?'classic':'module',name:'GeoMine - leitura local de licença'});
  workerFailure=new Promise((resolve,reject)=>port.addEventListener('error',event=>{
   workerFailed=true;
   event.preventDefault();
   reject(new Error('O navegador não conseguiu iniciar a leitura local do PDF. '+(event.message||'')));
  },{once:true}));
  worker=pdfjs.PDFWorker.create({port,verbosity:0});
  if(signal)signal.addEventListener('abort',onAbort,{once:true});
  check(signal);
  task=pdfjs.getDocument({
   data:bytes,worker,verbosity:0,isEvalSupported:false,enableXfa:false,
   disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,
   disableAutoFetch:true,disableRange:true,isOffscreenCanvasSupported:false
  });
  document=await waiting(task.promise);
  check(signal);
  const pages=[],emptyPages=[];
  progress(onProgress,{phase:'extracting',page:0,total:document.numPages});
  for(let number=1;number<=document.numPages;number++){
   check(signal);
   const page=await waiting(document.getPage(number));
   const content=await waiting(page.getTextContent({includeMarkedContent:false}));
   check(signal);
   const text=pageText(content.items);
   pages.push({page:number,text});
   if(!text.trim())emptyPages.push(number);
   page.cleanup();
   progress(onProgress,{phase:'extracting',page:number,total:document.numPages});
  }
  check(signal);
  const result={name:String(file.name||'Licença.pdf'),numPages:document.numPages,pages,
   text:pages.map(page=>page.text).join('\n\n'),requiresOCR:emptyPages.length>0,
   emptyPages,reader:'PDF.js',readerVersion:VERSION};
  progress(onProgress,{phase:'complete',page:document.numPages,total:document.numPages});
  return result;
 }catch(error){
  if(cancelled||(signal&&signal.aborted)||error.name==='AbortError')throw aborted();
  if(error.name==='PasswordException')throw new Error('O PDF está protegido por senha. Importe uma cópia desbloqueada.');
  if(error.name==='InvalidPDFException')throw new Error('Não foi possível interpretar este PDF. Verifique se o arquivo está íntegro.');
  throw error;
 }finally{
  if(signal)signal.removeEventListener('abort',onAbort);
  if(task)try{const pending=task.destroy();if(cancelled||workerFailed)pending.catch(()=>{});else await pending;}catch(_){}
  if(worker)try{worker.destroy();}catch(_){}
  if(port)port.terminate();
  if(workerURL)URL.revokeObjectURL(workerURL);
 }
}

root.GeoMineLicensePDF=Object.freeze({read,version:VERSION});
})(typeof window!=='undefined'?window:globalThis);
