(function(root){
'use strict';
const TILE=512,states=new WeakMap(),initializing=new WeakMap(),MiB=1024*1024;
const aborted=()=>Object.assign(Error('Relevo local cancelado.'),{name:'AbortError'});
function check(current){if(current&&current()===false)throw aborted();}
function waitCurrent(promise,current){return new Promise((resolve,reject)=>{let settled=false;const finish=(err,value)=>{if(settled)return;settled=true;clearInterval(timer);err?reject(err):resolve(value)};const timer=setInterval(()=>{try{check(current)}catch(e){finish(e)}},30);Promise.resolve(promise).then(v=>{try{check(current);finish(null,v)}catch(e){finish(e)}},e=>finish(e));});}
function parameters(r){const p=r.style?.localRelief||{};return {factor:[1,3,6].includes(+p.factor)?+p.factor:3,radius:Math.max(3,Math.min(15,+p.radius||6)),amplitude:Math.max(.01,+p.amplitude||1.2),ramp:p.ramp==='blues'?'blues':'reference'};}
let worker=null,sequence=0;const requests=new Map();
function getWorker(){if(worker)return worker;const src='const api='+GeoMineLocalReliefEngine.workerSource+';self.onmessage=e=>{const {id,q}=e.data;try{const result=api.compute(q);self.postMessage({id,result},[result.rel.buffer,result.rgba.buffer]);}catch(error){self.postMessage({id,error:error.message});}}';const u=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));worker=new Worker(u);URL.revokeObjectURL(u);worker.onmessage=e=>{const p=requests.get(e.data.id);if(!p)return;requests.delete(e.data.id);clearTimeout(p.timer);e.data.error?p.reject(Error(e.data.error)):p.resolve(e.data.result)};worker.onerror=e=>{for(const p of requests.values()){clearTimeout(p.timer);p.reject(Error(e.message||'Falha no worker do relevo local'))}requests.clear();worker.terminate();worker=null;};return worker;}
function calculate(q,current){check(current);const w=getWorker(),id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{requests.delete(id);reject(Error('Tempo excedido no cálculo de relevo local'));},30000);requests.set(id,{timer,resolve:v=>{try{check(current);resolve(v)}catch(e){reject(e)}},reject});w.postMessage({id,q},[q.data.buffer]);});}
async function safeRead(sampler,window,current,onFailure){
 const [c0,r0,c1,r1]=window,w=c1-c0,h=r1-r0,out=new Float32Array(w*h);out.fill(NaN);
 async function read(x0,y0,x1,y1,retried=false){check(current);const width=x1-x0,height=y1-y0;try{const band=await waitCurrent(sampler.readWindow([x0,y0,x1,y1]),current);check(current);if(band.length!==width*height)throw Error('Janela nativa incompleta');for(let y=0;y<height;y++)for(let x=0;x<width;x++){const v=band[y*width+x];out[(y+y0-r0)*w+x+x0-c0]=Number.isFinite(v)&&v>-1000?v:NaN;}}catch(e){if(e.name==='AbortError')throw e;check(current);if(!retried){for(let y=y0;y<y1;y+=256)for(let x=x0;x<x1;x+=256)await read(x,y,Math.min(x1,x+256),Math.min(y1,y+256),true);}else onFailure?.([x0,y0,x1,y1],e);}}
 // Each call is at most one million native cells, even for wide rasters.
 const sx=Math.min(w,1000000),sy=Math.max(1,Math.floor(1000000/sx));
 for(let y=r0;y<r1;y+=sy)for(let x=c0;x<c1;x+=sx)await read(x,y,Math.min(c1,x+sx),Math.min(r1,y+sy));return out;
}
async function initializeState(r){let s=states.get(r);const project=S.projectId,gen=root.GeoMineSessionAutosave?.state?.generation,d=r.d,p=JSON.stringify(parameters(r));
 if(s&&s.d===d&&s.z===d.z&&s.image===d._img0&&s.rev===r._rev&&s.project===project&&s.gen===gen&&s.workCRS===S.workCRS&&s.params===p&&s.sampler.isCurrent())return s;
 const sampler=await infoAmostradorNativo(r),g=sampler.grid,projection=proj4(sampler.sourceCRS).oProj;
 if(projection.projName==='longlat'||Math.abs(Number(projection.to_meter??1)-1)>1e-8)throw Error('Relevo local exige MDT nativo projetado em metros.');
 if(r.d!==d||S.projectId!==project||root.GeoMineSessionAutosave?.state?.generation!==gen||JSON.stringify(parameters(r))!==p)throw aborted();
 s={r,d,workCRS:S.workCRS,z:d.z,image:d._img0,rev:r._rev,project,gen,params:p,sampler,p:parameters(r),g,cache:new Map(),pending:new Map(),bytes:0,failures:new Map()};states.set(r,s);return s;
}
function state(r){if(initializing.has(r))return initializing.get(r);const p=initializeState(r).finally(()=>{if(initializing.get(r)===p)initializing.delete(r)});initializing.set(r,p);return p;}
function invalidate(r){states.delete(r);initializing.delete(r);}
function currentState(s){return states.get(s.r)===s&&s.r.d===s.d&&S.projectId===s.project&&S.workCRS===s.workCRS&&root.GeoMineSessionAutosave?.state?.generation===s.gen&&s.sampler.isCurrent()&&JSON.stringify(parameters(s.r))===s.params;}
function report(s,win,error){const key=win.join(',');if(s.failures.has(key))return;const g=s.g,north=g.yll+g.nr*g.csy,xy=[g.xll+win[0]*g.cs,north-win[3]*g.csy,g.xll+win[2]*g.cs,north-win[1]*g.csy];s.failures.set(key,{window:win,bounds:xy,message:error.message});cmdLog('TPI — área sem leitura no MDT "'+s.r.name+'": '+xy.map(v=>v.toFixed(3)).join(', ')+' ('+s.sampler.sourceCRS+'). '+error.message,'warn');root.GeoMineLocalReliefPanel?.failure(s.r,s.failures.size);}
function previewLooksEmpty(s,win){
 const d=s.d,g=s.g;if(!d.z||s.sampler.sourceCRS!==S.workCRS||!d.cs)return false;
 const dy=d.csy||d.cs,north=g.yll+g.nr*g.csy,previewNorth=d.yll+d.nr*dy;
 const x0=Math.max(0,Math.floor((g.xll+win[0]*g.cs-d.xll)/d.cs)-1),x1=Math.min(d.nc,Math.ceil((g.xll+win[2]*g.cs-d.xll)/d.cs)+1),y0=Math.max(0,Math.floor((previewNorth-(north-win[1]*g.csy))/dy)-1),y1=Math.min(d.nr,Math.ceil((previewNorth-(north-win[3]*g.csy))/dy)+1);
 if(x1<=x0||y1<=y0)return false;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const v=d.z[y*d.nc+x];if(Number.isFinite(v)&&v>-1000)return false}return true;
}
let active=0;const waiting=[];
async function slot(current){while(active>=2){await new Promise(resolve=>waiting.push(resolve));check(current)}active++;}
function release(){active--;for(const next of waiting.splice(0))next();}
async function block(s,bx,by,current=()=>true){check(current);if(!currentState(s))throw aborted();const key=bx+':'+by,hit=s.cache.get(key);if(hit){s.cache.delete(key);s.cache.set(key,hit);return hit;}
 if(s.pending.has(key)){await s.pending.get(key).catch(()=>{});check(current);if(s.cache.has(key))return s.cache.get(key);}
 const task=(async()=>{const isCurrent=()=>currentState(s)&&current()!==false;await slot(isCurrent);try{check(isCurrent);const {g,p}=s,nc=Math.ceil(g.nc/p.factor),nr=Math.ceil(g.nr/p.factor),x=bx*TILE,y=by*TILE;if(x>=nc||y>=nr||x<0||y<0)return null;const ow=Math.min(TILE,nc-x),oh=Math.min(TILE,nr-y),rx=Math.floor(p.radius/(g.cs*p.factor)+1e-10),ry=Math.floor(p.radius/(g.csy*p.factor)+1e-10),x0=Math.max(0,x-rx),y0=Math.max(0,y-ry),x1=Math.min(nc,x+ow+rx),y1=Math.min(nr,y+oh+ry),win=[x0*p.factor,y0*p.factor,Math.min(g.nc,x1*p.factor),Math.min(g.nr,y1*p.factor)],nw=win[2]-win[0],nh=win[3]-win[1];
 const center=[x*p.factor,y*p.factor,Math.min(g.nc,(x+ow)*p.factor),Math.min(g.nr,(y+oh)*p.factor)];
 // The preview nominates empty blocks; verify native cells before skipping,
 // since a reduced preview alone cannot prove that a narrow calha is empty.
 let empty=false;if(previewLooksEmpty(s,center)){const probe=await safeRead(s.sampler,center,isCurrent,(w,e)=>report(s,w,e));empty=!probe.some(Number.isFinite);}
 const data=empty?null:await safeRead(s.sampler,win,isCurrent,(w,e)=>report(s,w,e));check(isCurrent);
 const blank=()=>{const rel=new Float32Array(ow*oh);rel.fill(NaN);return {rel,rgba:new Uint8ClampedArray(ow*oh*4)}};
 const result=empty?blank():await calculate({data,nw,nh,factor:p.factor,workWidth:x1-x0,workHeight:y1-y0,outX:x-x0,outY:y-y0,outWidth:ow,outHeight:oh,rx,ry,amplitude:p.amplitude,ramp:p.ramp},isCurrent);Object.assign(result,{width:ow,height:oh,x,y});
 const size=result.rel.byteLength+result.rgba.byteLength;while(s.bytes+size>32*MiB&&s.cache.size){const k=s.cache.keys().next().value,old=s.cache.get(k);s.bytes-=old.rel.byteLength+old.rgba.byteLength;s.cache.delete(k)}s.cache.set(key,result);s.bytes+=size;return result;
 }finally{release()}})();s.pending.set(key,task);try{return await task}finally{if(s.pending.get(key)===task)s.pending.delete(key)}
}
async function paintTile(cv,r,warp,job){
 const s=await state(r),{g,p}=s,{SX,SY,N,st,Wb,Nb,gx,gy,clipAceita}=warp,OUT=cv.width,positions=new Int32Array(OUT*OUT*2);positions.fill(-1);const needed=new Map();
 for(let y=0;y<OUT;y++){if((y&31)===0)await job.checkpoint();const j=Math.min(N-2,Math.floor(y/st)),fy=(y-j*st)/st;for(let x=0;x<OUT;x++){const i=Math.min(N-2,Math.floor(x/st)),fx=(x-i*st)/st,a=j*N+i,X=(SX[a]*(1-fx)+SX[a+1]*fx)*(1-fy)+(SX[a+N]*(1-fx)+SX[a+N+1]*fx)*fy,Y=(SY[a]*(1-fx)+SY[a+1]*fx)*(1-fy)+(SY[a+N]*(1-fx)+SY[a+N+1]*fx)*fy,wx=Wb+X*gx,wy=Nb-Y*gy;if(clipAceita&&!clipAceita(wx,wy))continue;const q=s.sampler.toRaster([wx,wy]),c=Math.floor((q[0]-g.xll)/(g.cs*p.factor)),row=Math.floor((g.yll+g.nr*g.csy-q[1])/(g.csy*p.factor));if(c<0||row<0||c>=Math.ceil(g.nc/p.factor)||row>=Math.ceil(g.nr/p.factor))continue;const k=(y*OUT+x)*2;positions[k]=c;positions[k+1]=row;const key=Math.floor(c/TILE)+':'+Math.floor(row/TILE);if(!needed.has(key))needed.set(key,[]);needed.get(key).push(y*OUT+x);}}
 const ctx=cv.getContext('2d'),image=ctx.createImageData(OUT,OUT);
 // Paint one native analysis block at a time; far views cannot retain an
 // unbounded list of 512-square results while assembling one screen tile.
 for(const [key,pixels] of needed){await job.checkpoint();const [bx,by]=key.split(':').map(Number),b=await block(s,bx,by,job.isCurrent);if(!b)continue;for(const k of pixels){const c=positions[2*k],row=positions[2*k+1];if(c>=b.x&&c<b.x+b.width&&row>=b.y&&row<b.y+b.height){const i=((row-b.y)*b.width+c-b.x)*4;image.data.set(b.rgba.subarray(i,i+4),k*4);}}}
 await job.checkpoint();ctx.putImageData(image,0,0);return 'native';
}
root.GeoMineLocalRelief={parameters,state,block,paintTile,safeRead,invalidate,currentState,failures:r=>states.get(r)?.failures.size||0};
})(window);
