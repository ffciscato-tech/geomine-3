import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../src/modules/persistence/project-reader.js',import.meta.url),'utf8');
const error=name=>Object.assign(new Error('The requested file could not be read'),{name});
function fixture(config={}){
 const calls={ranges:[],aborts:0,text:0},parts=new WeakMap();
 class Reader{
  readAsArrayBuffer(blob){
   calls.ranges.push(blob.size);
   if(config.hang)return;
   queueMicrotask(async()=>{
    if(this.stopped)return;
    const fails=config.failures>0;if(fails)config.failures--;
    if(fails||config.rangesFail){this.error=error(config.security?'SecurityError':'NotReadableError');this.onerror?.();return;}
    this.result=await blob.arrayBuffer();if(config.truncated)this.result=this.result.slice(0,-1);this.onload?.();
   });
  }
  readAsText(blob){calls.text++;queueMicrotask(async()=>{if(config.allFail){this.error=error('NotReadableError');this.onerror?.();}else{this.result=await Blob.prototype.text.call(blob);this.onload?.();}});}
  abort(){calls.aborts++;this.stopped=true;this.onabort?.();}
 }
 const c={console,FileReader:Reader,TextDecoder,TextEncoder,ArrayBuffer,Uint8Array,setTimeout,clearTimeout,Date,AbortController};
 c.window=c;vm.createContext(c);vm.runInContext(code,c);
 return {api:{read:(f,o)=>c.GeoMineProjectReader.read(f,{wholeFile:false,...o})},calls,config};
}
let passed=0;
async function test(name,run){await run();console.log('PASS '+name);passed++;}
const text=JSON.stringify({app:'ALAGIS',name:'BLOCASA · Sondagem',data:'x'.repeat(1048570)+'é😀\ná'.repeat(10000)}),file=new Blob([text]);
await test('UTF-8 atravessa blocos, bytes exatos e progresso limitado',async()=>{
 const {api,calls}=fixture(),progress=[];
 assert.equal(await api.read(file,{onProgress:p=>progress.push(p)}),text);
 assert.ok(calls.ranges.length>1);assert.ok(calls.ranges.every(n=>n<=1048576));
 assert.equal(progress.at(-1).loaded,file.size);assert.equal(calls.text,0);
});
await test('NotReadableError temporário recupera sem repetir conteúdo',async()=>{
 const {api,calls}=fixture({failures:2}),progress=[];
 assert.equal(await api.read(file,{timeoutMs:40,onProgress:p=>progress.push(p)}),text);
 assert.equal(progress.filter(p=>p.phase==='retry').length,2);assert.equal(calls.ranges.length,4);
});
await test('provedor sem leitura por faixas usa stream completo',async()=>{
 const {api,calls}=fixture({rangesFail:true});assert.equal(await api.read(file,{timeoutMs:40}),text);assert.equal(calls.ranges.length,3);assert.equal(calls.text,0);
});
await test('stream parcial é descartado antes de fallback de texto',async()=>{
 const {api,calls}=fixture({rangesFail:true});const f=new Blob(['{"app":"ALAGIS"}']);
 f.stream=()=>new ReadableStream({start(c){c.enqueue(new Uint8Array([123]));c.close();}});
 assert.equal(await api.read(f,{timeoutMs:40}),'{"app":"ALAGIS"}');assert.equal(calls.text,1);
});
await test('falha permanente retorna orientação de reabrir pelo Drive e diagnóstico',async()=>{
 const {api}=fixture({rangesFail:true,allFail:true}),f=new Blob(['{}']);
 f.stream=()=>{throw error('NotReadableError');};f.text=async()=>{throw error('NotReadableError');};
 await assert.rejects(api.read(f,{timeoutMs:40}),e=>e.name==='NotReadableError'&&/novamente no Drive/.test(e.message)&&!e.message.includes('Downloads')&&e.diagnostics.length>=4);
});
await test('SecurityError não provoca novas tentativas nem solicita outra permissão',async()=>{
 const {api,calls}=fixture({rangesFail:true,security:true});await assert.rejects(api.read(file),{name:'NotReadableError'});assert.equal(calls.ranges.length,1);assert.equal(calls.text,0);
});
await test('cancelamento aborta reader ativo e não tenta fallback',async()=>{
 const {api,calls}=fixture({hang:true}),controller=new AbortController();
 const pending=api.read(file,{signal:controller.signal});controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(calls.aborts,1);assert.equal(calls.text,0);
});
await test('deadline encerra provedor travado e aborta a operação',async()=>{
 const {api,calls}=fixture({hang:true});await assert.rejects(api.read(file,{timeoutMs:10,deadlineMs:35}),e=>e.name==='TimeoutError'||e.name==='NotReadableError');assert.ok(calls.aborts>=1);
});
await test('arquivo vazio falha antes de qualquer leitura',async()=>{
 const {api,calls}=fixture();await assert.rejects(api.read(new Blob([])),{name:'NotReadableError'});assert.equal(calls.ranges.length,0);
});
await test('BOM UTF-8 e observer com erro não alteram conteúdo',async()=>{
 const {api}=fixture();assert.equal(await api.read(new Blob(['\uFEFF{}']),{onProgress(){throw Error('UI');}}),'{}');
});
await test('bytes truncados não entram na prévia: fonte íntegra é relida',async()=>{
 const {api}=fixture({truncated:true});assert.equal(await api.read(file,{timeoutMs:40}),text);
});
console.log(passed+' project reader checks passed');
await test('projeto de 16 MiB usa uma leitura do provedor, sem múltiplas faixas',async()=>{
 const {api,calls}=fixture(),f=new Blob(['x'.repeat(16*1024*1024)]),progress=[];
 assert.equal((await api.read(f,{wholeFile:true,onProgress:p=>progress.push(p)})).length,f.size);
 assert.deepEqual(calls.ranges,[f.size]);assert.equal(progress.at(-1).loaded,f.size);
});
await test('leitura inteira recusada recupera pelas faixas existentes',async()=>{
 const {api,calls}=fixture({failures:1});assert.equal(await api.read(file,{wholeFile:true}),text);
 assert.equal(calls.ranges[0],file.size);assert.equal(calls.ranges.length,3);
});
await test('projeto grande mantém leituras limitadas a 1 MiB',async()=>{
 const {api,calls}=fixture(),f=new Blob(['x'.repeat(33*1024*1024)]);
 assert.equal((await api.read(f,{wholeFile:true})).length,f.size);assert.equal(calls.ranges.length,33);assert.ok(calls.ranges.every(n=>n<=1048576));
});
await test('leitura única mantém cancelamento e rejeita SecurityError',async()=>{
 const h=fixture({hang:true}),controller=new AbortController(),pending=h.api.read(file,{wholeFile:true,signal:controller.signal});
 controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(h.calls.aborts,1);
 const locked=fixture({rangesFail:true,security:true});await assert.rejects(locked.api.read(file,{wholeFile:true}),{name:'NotReadableError'});assert.equal(locked.calls.ranges.length,1);
});
await test('leitura única truncada não é aceita; fallback mantém UTF-8 exato',async()=>{
 const {api}=fixture({truncated:true});assert.equal(await api.read(file,{wholeFile:true,timeoutMs:40}),text);
});
console.log(passed+' total project reader checks passed');
