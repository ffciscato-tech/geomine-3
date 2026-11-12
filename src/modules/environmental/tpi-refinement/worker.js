(function(root){
'use strict';
const clippingSource=__GEOMINE_TPI_CLIPPING__,projectionSource=__GEOMINE_TPI_PROJ4__;
function workerMain(geometryFactory,rasterFactory,engineFactory,transactionFactory,orthoFactory,reliefFactory){
 const G=geometryFactory(),R=rasterFactory(),E=engineFactory(geometryFactory,rasterFactory,polygonClipping),T=transactionFactory(G,polygonClipping),O=orthoFactory(),relief=typeof reliefFactory==='function'?reliefFactory():reliefFactory,stats={failures:[]},clip=G.operations(polygonClipping,stats);let accum=null;
 function run(type,q){
 if(type==='init'){for(const [key,v] of Object.entries(q.defs))proj4.defs(key,v);return true;}
 if(type==='begin'){const n=q.grid.width*q.grid.height;accum={...q,count:new Uint32Array(n),sum:new Float64Array(n),classes:{},samples:{brightness:[],exg:[],saturation:[],blue:[],red:[],texture:[]}};if(q.kind==='ortho')for(const key of ['water','canopy','impervious','soil','shadow'])accum.classes[key]=new Float32Array(n);return true;}
 if(type==='ingest'){const a=accum,g=a.grid,ng=q.nativeGrid,convert=a.sourceCRS===a.targetCRS?null:proj4(a.sourceCRS,a.targetCRS),d=a.kind==='ortho'?O.descriptors(q.data,q.width,q.height,q.bands):null,classes=d&&a.thresholds?O.classify(d,a.thresholds):null;for(let row=0;row<q.height;row++)for(let col=0;col<q.width;col++){const k=row*q.width+col,pt=[ng.xll+(q.left+col+.5)*ng.cs,ng.north-(q.top+row+.5)*ng.csy],p=convert?convert.forward(pt):pt,x=Math.floor((p[0]-g.x0)/g.cs),y=Math.floor((g.north-p[1])/g.cs);if(x<0||y<0||x>=g.width||y>=g.height)continue;const j=y*g.width+x;if(d){if(!d.valid[k])continue;a.count[j]++;if(classes)for(const key of Object.keys(a.classes))a.classes[key][j]+=classes[key][k];if(a.calibrationMask?.[j]&&k%7===0&&a.samples.brightness.length<60000)for(const key of Object.keys(a.samples))a.samples[key].push(d[key][k]);}else{const v=q.data[k];if(Number.isFinite(v)&&v>-1000){a.sum[j]+=v;a.count[j]++;}}}return true;}
 if(type==='end'){const a=accum,g=a.grid,n=a.sum.length,expected=Math.max(1,g.cs*g.cs/(a.nativeCellArea||g.cs*g.cs));let out;if(a.kind==='ortho'){out={coverage:new Float32Array(n)};for(const key of Object.keys(a.classes)){out[key]=a.classes[key];for(let k=0;k<n;k++)out[key][k]=a.count[k]?out[key][k]/a.count[k]:0;}for(let k=0;k<n;k++)out.coverage[k]=Math.min(1,a.count[k]/expected);out.samples=a.samples;}else{out=new Float32Array(n);out.fill(NaN);for(let k=0;k<n;k++)if(a.count[k]>=Math.floor(expected/2)+1)out[k]=a.sum[k]/a.count[k];}accum=null;return out;}
 if(type==='relief'){const g=q.grid,rx=Math.floor(q.radius/g.cs);return relief.compute({data:q.z,nw:g.width,nh:g.height,factor:1,workWidth:g.width,workHeight:g.height,outX:0,outY:0,outWidth:g.width,outHeight:g.height,rx,ry:rx,amplitude:1.2}).rel;}
 if(type==='thresholds')return O.thresholds(q);
 if(type==='calibrate')return E.calibration(q);
 if(type==='process')return E.process(q);
 if(type==='mask')return G.rasterize(q.features,q.grid);
 if(type==='clip'){if(q.preserveCoordinates){try{return polygonClipping[q.operation](...q.args)}catch(error){stats.failures.push({operation:q.operation,step:0,message:error.message});}}return clip(q.operation,...q.args);}
 if(type==='assemble')return T.assemble(q);
 if(type==='statistics')return stats;
 if(type==='quantiles')return R.quantiles(q);
 throw Error('Operação TPI desconhecida: '+type);
 }
 self.onmessage=e=>{const {id,type,q}=e.data;try{self.postMessage({id,result:run(type,q)})}catch(error){self.postMessage({id,error:error.message,stack:error.stack})}};
}
function create(){const code=clippingSource+'\n'+projectionSource+'\n('+workerMain.toString()+')('+[GeoMineTPIRefineGeometry.factory,GeoMineTPIRefineRaster.factory,GeoMineTPIRefineEngine,GeoMineTPIRefineTransaction,GeoMineTPIRefineOrtho.factory,GeoMineLocalReliefEngine.workerSource].map(v=>typeof v==='function'?v.toString():v.replace(/^\(/,'(')).join(',')+');',url=URL.createObjectURL(new Blob([code],{type:'text/javascript'})),worker=new Worker(url);URL.revokeObjectURL(url);let next=0,closed=false;const pending=new Map();worker.onmessage=e=>{const p=pending.get(e.data.id);if(!p)return;pending.delete(e.data.id);e.data.error?p.reject(Error(e.data.error)):p.resolve(e.data.result);};worker.onerror=e=>{for(const p of pending.values())p.reject(Error(e.message||'Erro no worker TPI'));pending.clear();};return {call(type,q,transfer=[]){if(closed)return Promise.reject(Error('Refino cancelado.'));return new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});worker.postMessage({id,type,q},transfer);});},close(){closed=true;worker.terminate();for(const p of pending.values())p.reject(Object.assign(Error('Refino cancelado.'),{name:'AbortError'}));pending.clear();}};}
root.GeoMineTPIRefineWorker={create};
})(window);
