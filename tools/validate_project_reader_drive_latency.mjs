import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=fs.readFileSync(new URL('../src/modules/persistence/project-reader.js',import.meta.url),'utf8');
const MiB=1024*1024;
function fixture({delays=[90000,50000,50000,50000],hang=false,progress=false}={}){
 let now=0,id=0,reads=0,aborts=0;
 const timers=new Map();
 const schedule=(fn,ms)=>{timers.set(++id,{at:now+ms,fn});return id;};
 const clear=id=>timers.delete(id);
 class Reader{
  readAsArrayBuffer(blob){
   const delay=delays[Math.min(reads++,delays.length-1)];
   if(hang)return;
   if(progress)for(let t=30000;t<delay;t+=30000)schedule(()=>{if(!this.stopped)this.onprogress?.({loaded:t});},t);
   schedule(()=>{if(!this.stopped){this.result=new Uint8Array(blob.size).fill(120).buffer;this.onload?.();}},delay);
  }
  abort(){aborts++;this.stopped=true;}
 }
 const context={FileReader:Reader,TextDecoder,TextEncoder,ArrayBuffer,Uint8Array,Date:{now:()=>now},setTimeout:schedule,clearTimeout:clear};
 context.window=context;vm.createContext(context);vm.runInContext(code,context);
 // Only byte ranges are supported, as with a provider without text/stream fallbacks.
 const file={size:4*MiB,slice(a,b){return {size:b-a};}};
 async function run(options={}){
  let done=false,value,failure;
  context.GeoMineProjectReader.read(file,{wholeFile:false,...options}).then(v=>{done=true;value=v;},e=>{done=true;failure=e;});
  for(let steps=0;steps<2000&&!done;steps++){
   for(let i=0;i<20;i++)await Promise.resolve();
   if(done)break;
   const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];
   assert.ok(next,'read must settle or own a timer');timers.delete(next[0]);now=next[1].at;next[1].fn();
  }
  assert.ok(done,'read must finish');
  if(failure)throw failure;
  return value;
 }
 return {run,get now(){return now;},get reads(){return reads;},get aborts(){return aborts;}};
}
let f=fixture();
assert.equal((await f.run()).length,4*MiB);
assert.equal(f.now,240000);assert.equal(f.reads,4);assert.equal(f.aborts,0);
console.log('PASS Drive startup of 90s and healthy transfer of 4 minutes');
f=fixture({delays:[90000,90000,90000,90000],progress:true});
assert.equal((await f.run()).length,4*MiB);assert.equal(f.aborts,0);
console.log('PASS byte progress keeps a slow range alive');
f=fixture();
await assert.rejects(f.run({deadlineMs:120000}));assert.ok(f.aborts>0);
console.log('PASS explicit caller deadline remains enforced');
f=fixture({hang:true});await assert.rejects(f.run());assert.ok(f.aborts>0);assert.ok(f.now<600000);
console.log('PASS unresponsive Drive remains bounded and aborted');
f=fixture({delays:[90000,Infinity]});await assert.rejects(f.run());assert.ok(f.aborts>0);assert.ok(f.now<300000);
console.log('PASS stalled transfer after first bytes is bounded');
