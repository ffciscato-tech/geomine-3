/* C statistics for a chosen polygon layer. Boundary cells are clipped to the
   polygons: the coefficient is weighted by intersected area, not vertex or
   centroid samples. The denominator is the intersected area with valid C.
   Missing/outside cells never contribute either zero or area to this mean. */
(function(root){
'use strict';if(root.GeoMineCZonal)return;
const $=id=>document.getElementById(id);let job=null;
function ringArea(ring){
 if(ring.length<3)return 0;const x=ring[0][0],y=ring[0][1];let sum=0;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++)sum+=(ring[j][0]-x)*(ring[i][1]-y)-(ring[i][0]-x)*(ring[j][1]-y);
 return sum/2;
}
function clipAxis(ring,axis,cut,above){
 if(!ring.length)return [];const out=[];let a=ring[ring.length-1],insideA=above?a[axis]>=cut:a[axis]<=cut;
 for(const b of ring){const insideB=above?b[axis]>=cut:b[axis]<=cut;
  if(insideA!==insideB){const t=(cut-a[axis])/(b[axis]-a[axis]),p=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];p[axis]=cut;out.push(p);}
  if(insideB)out.push(b);a=b;insideA=insideB;
 }return out;
}
function prepared(mp){
 const rings=[];let area=0,xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;
 for(const poly of mp)for(let i=0;i<poly.length;i++){
  const ring=poly[i];if(ring.length<3||ring.some(p=>!p||!Number.isFinite(p[0])||!Number.isFinite(p[1])))throw Error('Polígono com coordenadas inválidas.');
  const sign=i===0?1:-1;let lo=Infinity,hi=-Infinity;
  for(const p of ring){xmin=Math.min(xmin,p[0]);xmax=Math.max(xmax,p[0]);ymin=Math.min(ymin,p[1]);ymax=Math.max(ymax,p[1]);lo=Math.min(lo,p[1]);hi=Math.max(hi,p[1]);}
  area+=sign*Math.abs(ringArea(ring));rings.push({ring,sign,lo,hi});
 }
 if(!(area>0))throw Error('Polígono sem área válida.');return {rings,area,xmin,xmax,ymin,ymax};
}
async function integrate(d,mp,control={}){
 const shape=prepared(mp),dx=d.cs,dy=d.csy||d.cs,cell=dx*dy;
 if(!Number.isSafeInteger(d.nc)||!Number.isSafeInteger(d.nr)||d.z?.length!==d.nc*d.nr||!(dx>0&&dy>0))throw Error('Grade C inválida.');
 const top=d.yll+d.nr*dy,c0=Math.max(0,Math.floor((shape.xmin-d.xll)/dx)),c1=Math.min(d.nc-1,Math.ceil((shape.xmax-d.xll)/dx)-1),
  r0=Math.max(0,Math.floor((top-shape.ymax)/dy)),r1=Math.min(d.nr-1,Math.ceil((top-shape.ymin)/dy)-1),
  tiny=Math.max(1e-12,cell*1e-12),eps=Math.max(1e-9,Math.max(dx,dy)*1e-9);
 let covered=0,weighted=0,areaInGrid=0,invalid=0,count=0,min=Infinity,max=-Infinity;
 for(let row=r0;row<=r1;row++){
  control.check?.();const y1=top-row*dy,y0=y1-dy,ym=(y0+y1)/2,strips=[],crossings=[],boundary=new Uint8Array(Math.max(0,c1-c0+1));
  for(const rec of shape.rings){
   if(rec.hi<=y0||rec.lo>=y1)continue;
   const ring=clipAxis(clipAxis(rec.ring,1,y0,true),1,y1,false);if(ring.length<3)continue;strips.push({ring,sign:rec.sign});
   for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i];if((a[1]>ym)!==(b[1]>ym))crossings.push(a[0]+(ym-a[1])*(b[0]-a[0])/(b[1]-a[1]));
    if(Math.abs(a[1]-b[1])<eps&&(Math.abs(a[1]-y0)<eps||Math.abs(a[1]-y1)<eps))continue;
    const lo=Math.max(c0,Math.floor((Math.min(a[0],b[0])-d.xll)/dx)-1),hi=Math.min(c1,Math.floor((Math.max(a[0],b[0])-d.xll)/dx)+1);
    for(let col=lo;col<=hi;col++)boundary[col-c0]=1;
   }
  }
  crossings.sort((a,b)=>a-b);let crossing=0,inside=false;
  for(let col=c0;col<=c1;col++){
   const x0=d.xll+col*dx,x1=x0+dx,xm=(x0+x1)/2;
   while(crossing<crossings.length&&crossings[crossing]<=xm){inside=!inside;crossing++;}
   let area=inside?cell:0;
   if(boundary[col-c0]){area=0;for(const rec of strips){const ring=clipAxis(clipAxis(rec.ring,0,x0,true),0,x1,false);area+=rec.sign*Math.abs(ringArea(ring));}area=Math.max(0,Math.min(cell,area));}
   if(area<=tiny)continue;areaInGrid+=area;const value=d.z[row*d.nc+col];
   if(!Number.isFinite(value))continue;if(value<0||value>1){invalid+=area;continue;}
   covered+=area;weighted+=area*value;count++;min=Math.min(min,value);max=Math.max(max,value);
  }
  if((row-r0)%12===0){control.progress?.((row-r0+1)/Math.max(1,r1-r0+1));await new Promise(resolve=>setTimeout(resolve,0));control.check?.();}
 }
 const tolerance=Math.max(1e-6,shape.area*1e-8,cell*1e-7),missing=Math.max(0,shape.area-covered),complete=missing<=tolerance&&invalid<=tolerance&&covered>0;
 return {area:shape.area,covered,missing,areaInGrid,invalid,pixels:count,percent:Math.min(100,100*covered/shape.area),
  mean:covered>0&&invalid<=tolerance?weighted/covered:null,min:count?min:null,max:count?max:null,complete,
  status:invalid>tolerance?'VALOR_C_INVALIDO':!covered?'SEM_DADOS':complete?'CALCULADO':'CALCULADO_AREA_DISPONIVEL'};
}
const isC=r=>!!r?.d&&(r.runoffMeta?.method==='rational-coverage'||r.quantity==='runoffCoefficient'&&r.runoffMeta?.method!=='SCS-CN');
function options(sel,list,value,empty){if(!sel)return;const key=JSON.stringify(list.map(q=>[q.id,q.name]));if(sel.dataset.items!==key){sel.replaceChildren(...(list.length?list.map(q=>new Option(q.name,String(q.id))):[new Option(empty,'')]));sel.dataset.items=key;}sel.value=list.some(q=>String(q.id)===String(value))?String(value):list[0]?String(list[0].id):'';}
function refresh(){
 const panel=$('hCZoneSection');if(!panel)return;panel.hidden=cnProduct()!=='c';if(job)return;
 const rasters=S.rasters.filter(isC),layers=S.layers.filter(L=>L.gtype==='polygon'&&L.features?.length);
 options($('hCZoneRaster'),rasters,S.hidro.cZoneRasterId??S._runoffRaster?.id,'Gere primeiro a camada C');
 options($('hCZoneLayer'),layers,S.hidro.cZoneLayerId,'Escolha uma camada de polígonos');
 $('btnCZones').disabled=!rasters.length||!layers.length||!!cnOrtoBusy;
}
function abortError(){return new DOMException('Cálculo cancelado: o projeto, as áreas ou a camada C mudaram.','AbortError');}
function rasterCRS(raster){return raster.d.crs||raster.runoffMeta?.workCRS||S.workCRS;}
function polygonMP(base,feature,targetCRS=S.workCRS){
 const raw=feature?.multi&&Array.isArray(feature.geom?.[0]?.[0])?feature.geom:[feature?.geom],sourceCRS=base.crs||S.workCRS;
 const rings=raw.filter(r=>Array.isArray(r)&&r.length>=3).map(r=>{
  const points=r.map(p=>{
   if(!p||!Number.isFinite(+p[0])||!Number.isFinite(+p[1]))throw Error('Polígono com coordenadas inválidas.');
   let q;try{q=sourceCRS===targetCRS?[+p[0],+p[1]]:proj4(sourceCRS,targetCRS,[+p[0],+p[1]]);}catch(_){throw Error('Não foi possível transformar o CRS dos polígonos para o CRS da grade C.');}
   if(!q.every(Number.isFinite))throw Error('Transformação de coordenadas inválida.');return q;
  });
  const a=points[0],b=points[points.length-1];if(a[0]!==b[0]||a[1]!==b[1])points.push(a.slice());return points;
 });return ringsToPolys(rings);
}
async function forFeature(raster,base,feature,control={}){
 if(!isC(raster))throw Error('Escolha uma camada C do Método Racional.');
 const project=S.projectId,work=S.workCRS,generation=root.GeoMineSessionAutosave?.state?.generation,version=root.GeoMineSessionAutosave?.state?.version,d=raster.d,z=d.z;
 const check=()=>{if(S.projectId!==project||S.workCRS!==work||root.GeoMineSessionAutosave?.state?.generation!==generation||root.GeoMineSessionAutosave?.state?.version!==version||!S.rasters.includes(raster)||raster.d!==d||d.z!==z)throw abortError();control.check?.();};
 check();if(proj4.defs(rasterCRS(raster))?.projName==='longlat')throw Error('A grade C precisa estar em um CRS projetado para calcular áreas.');const result=await integrate(d,polygonMP(base,feature,rasterCRS(raster)),{...control,check});return {...result,r:raster};
}
function outputFields(base){
 const fields=(base.fields||[]).filter(Boolean).map(f=>typeof f==='string'?{name:f,type:'C',length:120,decimal:0}:{...f}),used=new Set(fields.map(f=>f.name.toUpperCase())),names={};
 for(const feature of base.features||[])for(const [name,value] of Object.entries(feature.props||{}))if(!used.has(name.toUpperCase())){used.add(name.toUpperCase());fields.push({name,type:typeof value==='number'?'N':'C',length:typeof value==='number'?20:254,decimal:typeof value==='number'?6:0});}
 for(const [key,type,length,decimal] of [['C_MEDIO','N',12,6],['C_MIN','N',12,6],['C_MAX','N',12,6],['AREA_BASE','N',20,4],['AREA_C','N',20,4],['COBERT_PCT','N',12,6],['FONTE_C','C',160,0],['SITUACAO','C',40,0]]){
  let name=key,n=2;while(used.has(name.toUpperCase()))name=key.slice(0,8)+'_'+n++;
  used.add(name.toUpperCase());names[key]=name;fields.push({name,type,length,decimal});
 }return {fields,names};
}
async function run(){
 if(job||cnOrtoBusy)return false;const raster=S.rasters.find(r=>String(r.id)===$('hCZoneRaster')?.value),base=S.layers.find(L=>String(L.id)===$('hCZoneLayer')?.value);
 if(!isC(raster)||base?.gtype!=='polygon'||!base.features?.length){toast('Escolha a camada C e a camada de polígonos.');return false;}
 const controller=new AbortController();job=controller;S._loadCancel=false;let outcome;const controls=[...document.querySelectorAll('#secCNOrto input,#secCNOrto select,#btnCnOrto,#btnCZones')],out=$('hCZoneOut');
 controls.forEach(e=>e.disabled=true);$('btnCZonesCancel').hidden=false;showLoad('Calculando C médio por área…');
 try{
  await new Promise(resolve=>setTimeout(resolve,20));
  const project=S.projectId,work=S.workCRS,generation=root.GeoMineSessionAutosave?.state?.generation,version=root.GeoMineSessionAutosave?.state?.version,d=raster.d,z=d.z;
  const originals=base.features.slice(),features=originals.map(f=>JSON.parse(JSON.stringify(f))),accepted=[],excluded=[],{fields,names}=outputFields(base);let good=0,incomplete=0;
  const check=()=>{if(controller.signal.aborted||S._loadCancel||S.projectId!==project||S.workCRS!==work||root.GeoMineSessionAutosave?.state?.generation!==generation||root.GeoMineSessionAutosave?.state?.version!==version||!S.layers.includes(base)||!S.rasters.includes(raster)||raster.d!==d||d.z!==z||originals.length!==base.features.length||originals.some((f,i)=>base.features[i]!==f))throw abortError();};
  check();if(proj4.defs(rasterCRS(raster))?.projName==='longlat')throw Error('A grade C precisa estar em um CRS projetado para calcular áreas.');
  for(let i=0;i<features.length;i++){
   check();const stat=await integrate(d,polygonMP(base,features[i],rasterCRS(raster)),{check,progress:f=>showLoad('C médio — área '+(i+1)+'/'+features.length+' · '+Math.round(f*100)+'%')});
   if(!Number.isFinite(stat.mean)){
    excluded.push({index:i,name:String(features[i].props?.[base.labelField]||features[i].props?.NOME||'Área '+(i+1)),reason:stat.status});continue;
   }
   const f=features[i];f.props={...(f.props||{}),[names.C_MEDIO]:stat.mean,[names.C_MIN]:stat.min,[names.C_MAX]:stat.max,[names.AREA_BASE]:stat.area,[names.AREA_C]:stat.covered,[names.COBERT_PCT]:stat.percent,[names.FONTE_C]:raster.name,[names.SITUACAO]:stat.status};
   accepted.push(f);
   if(stat.complete)good++;else incomplete++;
  }
  check();if(!accepted.length)throw Error('Nenhuma área tem C válido disponível. Não foi criada uma camada com médias vazias ou zeros substitutos.');
  const L=addLayer({undo:true,sourceLayer:base,name:'C médio — '+base.name+' · '+(raster.runoffMeta?.sourceOrthoName||raster.name),gtype:'polygon',crs:base.crs,features:accepted,fields,labelField:base.labelField||'',lbl:{...labelCfg(base)},color:'#328ad6'});
  L._runoffZones={version:2,method:'area-weighted-cell-intersections',meanScope:'available-valid-area',inputFeatureCount:features.length,excluded,sourceRasterId:raster.id,sourceLayerId:base.id,fields:names,createdAt:new Date().toISOString(),grid:{nc:d.nc,nr:d.nr,cs:d.cs,csy:d.csy||d.cs,crs:rasterCRS(raster)}};
  if(out)out.textContent=(good+incomplete)+' área(s) calculada(s)'+(incomplete?'; '+incomplete+' pela área com dados.':'.')+' Veja '+names.C_MEDIO+', '+names.AREA_C+' e '+names.COBERT_PCT+' nos atributos.'+(excluded.length?' Sem média por falta de dados válidos: '+excluded.map(q=>q.name).join(', ')+'.':'');
  refreshUI();zApply();toast('C médio por áreas: '+(good+incomplete)+' calculada(s)'+(excluded.length?' · '+excluded.length+' sem dados disponíveis':''));return L;
 }catch(e){outcome=e.name==='AbortError'?'cancel':'error';if(out)out.textContent=e.name==='AbortError'?'Cálculo cancelado.':e.message;toast(e.name==='AbortError'?'Cálculo cancelado.':('Falha ao calcular C por áreas: '+e.message));return false;}
 finally{job=null;controls.forEach(e=>e.disabled=false);$('btnCZonesCancel').hidden=true;hideLoad(outcome);cnOrtoRefresh();refresh();}
}
function cancel(){job?.abort();}
function boot(){
 $('btnCZones')?.addEventListener('click',()=>void run());$('btnCZonesCancel')?.addEventListener('click',cancel);
 for(const [id,key] of [['hCZoneRaster','cZoneRasterId'],['hCZoneLayer','cZoneLayerId']])$(id)?.addEventListener('change',()=>{S.hidro[key]=$(id).value||null;root.GeoMineSessionAutosave?.markDirty('áreas do C médio');});
 refresh();
}
root.GeoMineCZonal={refresh,run,cancel,forFeature,isC,engine:{integrate,clipAxis,ringArea},get busy(){return !!job;}};
if(typeof document!=='undefined'){if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();}
})(typeof window!=='undefined'?window:globalThis);
