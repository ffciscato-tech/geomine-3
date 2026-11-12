/* Run the existing buffer kernel away from the map/UI thread. Projection is
   copied in bounded batches; source features and project state stay untouched. */
(function(root){
'use strict';
const BATCH=2048;
const aborted=()=>Object.assign(new Error('Buffer cancelado. Nenhuma geometria foi gravada.'),{name:'AbortError'});
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
function source(){
  const vendor=document.getElementById('geomine-polygon-clipping')?.textContent;
  if(!vendor)throw new Error('Biblioteca offline do buffer indisponível. Atualize o aplicativo.');
  const names=['bufDisco','bufRetangulo','bufLimpa','bufPecas','bufSacode','bufOp','bufUniao','bufSaidaLimpa','bufferFeicaoMP','polyArea','measureProjectedRings'];
  const functions=names.map(name=>{
    if(typeof root[name]!=='function')throw new Error('Núcleo do buffer indisponível: '+name+'. Atualize o aplicativo.');
    return root[name].toString();
  }).join('\n');
  return 'var window=self;\n'+vendor+'\nvar S={workCRS:null};\n'+functions+'\n('+workerMain.toString()+')();';
}
function workerMain(){
  let layer,options,polis=[],pulados=0,falhas=0;
  self.onmessage=event=>{
    const {id,method,payload}=event.data;
    try{
      if(method==='start'){
        options=payload;S.workCRS=options.workCRS;
        layer={gtype:options.gtype,crs:options.workCRS};
        self.postMessage({id,result:true});return;
      }
      if(method==='feature'){
        try{
          const result=bufferFeicaoMP(layer,payload,options.d,options.arred,options.nseg);
          for(const polygon of result.polis)polis.push(polygon);
          pulados+=result.pulados;if(result.falhou)falhas++;
        }catch(error){falhas++;}
        self.postMessage({id,result:true});return;
      }
      if(method==='failed'){falhas++;self.postMessage({id,result:true});return;}
      if(method==='finish'){
        polis=polis.filter(p=>Array.isArray(p)&&p[0]&&p[0].length>=4);
        let dissolvido=false,dissolveError=null;
        if(options.dissolver&&polis.length>1){
          try{polis=bufUniao(polis);dissolvido=true;}
          catch(error){dissolveError=error.message||String(error);}
        }
        self.postMessage({id,result:{polis,pulados,falhas,dissolvido,dissolveError}});return;
      }
      throw new Error('Operação de buffer inválida.');
    }catch(error){self.postMessage({id,error:error.message||String(error)});}
  };
}
async function projectFeature(L,f,workCRS,check,onBatch){
  let visited=0;
  const converted=pt=>{
    if(!Array.isArray(pt)||!Number.isFinite(+pt[0])||!Number.isFinite(+pt[1]))return null;
    const p=L.crs===workCRS?[+pt[0],+pt[1]]:reproj(L.crs,workCRS,+pt[0],+pt[1]);
    return Array.isArray(p)&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])?[+p[0],+p[1]]:null;
  };
  const tick=async()=>{if(++visited%BATCH===0){check();onBatch(visited);await pause();check();}};
  if(L.gtype==='point'){
    const raw=f.geom,points=[];
    const nested=Array.isArray(raw[0])&&Array.isArray(raw[0][0]);
    const groups=nested?raw:[Array.isArray(raw[0])?raw:[raw]];
    for(let i=0;i<groups.length;i++){
      if(nested&&!(i in groups))continue;
      const group=Array.isArray(groups[i])?groups[i]:[groups[i]];
      for(let j=0;j<group.length;j++){
        if(nested&&!(j in group))continue;
        points.push(converted(group[j])||[NaN,NaN]);await tick();
      }
    }
    return {geom:points};
  }
  const raw=f.multi&&Array.isArray(f.geom)&&Array.isArray(f.geom[0])&&Array.isArray(f.geom[0][0])?f.geom:[f.geom];
  const rings=[];
  for(const ring of raw){
    if(!Array.isArray(ring))continue;
    const projected=[];
    for(const pt of ring){const p=converted(pt);if(p)projected.push(p);await tick();}
    if(projected.length)rings.push(projected);
  }
  return {geom:rings,multi:true};
}
async function run({L,features,d,arred=true,nseg=12,dissolver=false,workCRS,signal,onProgress}={}){
  if(signal?.aborted)throw aborted();
  if(!L||!Array.isArray(features)||!['point','line','polygon'].includes(L.gtype))throw new Error('Selecione feições vetoriais para o buffer.');
  d=Number(d);nseg=Math.max(4,Math.round(Number(nseg)||12));
  if(!Number.isFinite(d)||d===0||d<0&&L.gtype!=='polygon')throw new Error('Distância de buffer inválida.');
  if(!Number.isFinite(nseg)||!workCRS)throw new Error('Parâmetros do buffer inválidos.');
  if(typeof root.Worker!=='function')throw new Error('Este navegador não permite o cálculo de buffer em segundo plano. Use um navegador com suporte a Workers.');
  const layer={gtype:L.gtype,crs:L.crs},total=features.length;
  let worker=null,url=null,pending=null,serial=0,stopped=false;
  const check=()=>{if(stopped||signal?.aborted)throw aborted();};
  const progress=(phase,completed,extra={})=>{check();if(typeof onProgress==='function')onProgress({phase,completed,total,...extra});check();};
  const stop=()=>{
    stopped=true;worker?.terminate();
    if(pending){const reject=pending.reject;pending=null;reject(aborted());}
  };
  const call=(method,payload)=>new Promise((resolve,reject)=>{
    try{check();const id=++serial;pending={id,resolve,reject};worker.postMessage({id,method,payload});}
    catch(error){pending=null;reject(error);}
  });
  signal?.addEventListener('abort',stop,{once:true});
  try{
    const code=source();check();
    url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
    worker=new root.Worker(url);URL.revokeObjectURL(url);url=null;
    worker.onmessage=event=>{
      if(!pending||event.data?.id!==pending.id)return;
      const response=pending;pending=null;
      event.data.error?response.reject(new Error(event.data.error)):response.resolve(event.data.result);
    };
    worker.onerror=event=>{
      const error=new Error('Falha no cálculo do buffer: '+(event.message||'Worker interrompido.'));
      if(pending){const response=pending;pending=null;response.reject(error);}
      stopped=true;worker.terminate();
    };
    worker.onmessageerror=()=>{
      const error=new Error('Não foi possível transferir a geometria calculada pelo buffer.');
      if(pending){const response=pending;pending=null;response.reject(error);}
      stopped=true;worker.terminate();
    };
    await call('start',{gtype:layer.gtype,d,arred:arred!==false,nseg,dissolver:!!dissolver,workCRS});
    for(let i=0;i<total;i++){
      check();const f=features[i];
      if(!f||!f.geom){progress('buffer',i+1);continue;}
      progress('project',i);let projected;
      try{projected=await projectFeature(layer,f,workCRS,check,vertices=>progress('project',i,{vertices}));}
      catch(error){if(error.name==='AbortError')throw error;await call('failed');progress('buffer',i+1);continue;}
      progress('buffer',i);await call('feature',projected);progress('buffer',i+1);
    }
    progress('dissolve',total);const result=await call('finish');check();return result;
  }finally{
    signal?.removeEventListener('abort',stop);worker?.terminate();if(url)URL.revokeObjectURL(url);
  }
}
root.GeoMineBufferWorker={run};
})(window);

