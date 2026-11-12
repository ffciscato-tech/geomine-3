/* Shared stations for longitudinal comparisons. Sampling never substitutes
   one source for another or fills a missing interval with neighbouring data. */
(function(root){
  'use strict';
  const sequence=value=>Array.isArray(value)||ArrayBuffer.isView(value)?value:[];
  const finite=value=>typeof value==='number'?Number.isFinite(value)?value:NaN:
    typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value))?Number(value):NaN;
  const xy=point=>point&&Number.isFinite(point[0])&&Number.isFinite(point[1]);
  const clamp=(value,lo,hi)=>Math.max(lo,Math.min(hi,value));
  function clone(value){
    if(Array.isArray(value))return value.map(clone);
    if(ArrayBuffer.isView(value))return Array.from(value);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,clone(v)]));
    return value;
  }
  function metrics(points){
    if(points.length<2||!points.every(xy))return null;
    const dist=[0];for(let i=1;i<points.length;i++)dist.push(dist[i-1]+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
    const total=dist.at(-1);return Number.isFinite(total)&&total>0?{dist,total}:null;
  }
  function lowerBound(values,target){
    let lo=0,hi=values.length;while(lo<hi){const mid=(lo+hi)>>>1;if(values[mid]<target)lo=mid+1;else hi=mid;}return lo;
  }
  function stations(met,native,step){
    const fixed=[...new Set([0,met.total,...met.dist,...native.filter(s=>Number.isFinite(s)&&s>=0&&s<=met.total)])].sort((a,b)=>a-b),
      requested=Number.isFinite(step)&&step>0?step:1,increment=Math.max(requested,met.total/49999),
      count=Math.min(49999,Math.ceil(met.total/increment)),all=fixed.slice(),epsilon=Math.max(1e-9,met.total*1e-12);
    for(let i=1;i<count;i++){
      const s=i*increment;if(!(s<met.total))break;
      const index=lowerBound(fixed,s);
      if(index<fixed.length&&Math.abs(fixed[index]-s)<=epsilon||index>0&&Math.abs(fixed[index-1]-s)<=epsilon)continue;
      all.push(s);
    }
    return {dist:all.sort((a,b)=>a-b),effectiveStep:increment,limited:increment>requested};
  }
  function axisPoints(points,met,dist){
    let cursor=1;
    return dist.map(s=>{
      while(cursor<met.dist.length-1&&met.dist[cursor]<s)cursor++;
      const a=points[cursor-1],b=points[cursor],length=met.dist[cursor]-met.dist[cursor-1],
        t=length>0?clamp((s-met.dist[cursor-1])/length,0,1):0;
      return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    });
  }
  function vectorSampler(dist,values){
    const rows=dist.map((s,index)=>({s,index,z:Number.isFinite(values[index])?values[index]:NaN})).filter(row=>Number.isFinite(row.s)).sort((a,b)=>a.s-b.s||a.index-b.index),groups=[];
    rows.forEach(row=>{
      const last=groups.at(-1);
      if(last&&last.s===row.s){
        if(last.last+1!==row.index||!Number.isFinite(row.z)||row.z!==last.z)last.z=NaN;
        last.last=row.index;
      }else groups.push({s:row.s,z:row.z,first:row.index,last:row.index});
    });
    const positions=groups.map(row=>row.s);
    return station=>{
      const index=lowerBound(positions,station),b=groups[index];
      if(b&&b.s===station)return b.z;
      const a=groups[index-1];
      if(!a||!b||b.first!==a.last+1||!Number.isFinite(a.z)||!Number.isFinite(b.z)||!(b.s>a.s))return NaN;
      return a.z+(b.z-a.z)*(station-a.s)/(b.s-a.s);
    };
  }
  function withinClip(point,rings){
    if(!Array.isArray(rings)||!rings.length)return true;
    let inside=false;
    for(const ring of rings){
      if(!Array.isArray(ring)||ring.length<3)continue;
      for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const a=ring[j],b=ring[i];if(!xy(a)||!xy(b))continue;
        const dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy,
          t=length2?clamp(((point[0]-a[0])*dx+(point[1]-a[1])*dy)/length2,0,1):0;
        if(Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy)<1e-8)return true;
        if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
      }
    }
    return inside;
  }
  function rasterSampler(raster,options){
    // The caller has already chosen working versus original resolution.
    // Never replace an explicitly supplied working grid with its _full copy.
    const d=raster&&raster.d;
    if(!d)return ()=>NaN;
    const crs=d.crs||raster.crs||d.srcCRS||raster.srcCRS||options.workCRS,
      nodata=[d,raster].flatMap(source=>source?[source.noData,source.nodata,source._nd]:[]).map(finite).filter(Number.isFinite),
      clean=raw=>{const value=finite(raw);return nodata.some(n=>value===n||value===Math.fround(n))?NaN:value;},
      cs=finite(d.cs),cy=finite(d.csy??d.cs),xll=finite(d.xll),yll=finite(d.yll),nc=finite(d.nc),nr=finite(d.nr),
      gridOK=cs>0&&cy>0&&Number.isFinite(xll)&&Number.isFinite(yll)&&Number.isInteger(nc)&&nc>0&&Number.isInteger(nr)&&nr>0&&d.z,
      clip=raster._exactClipRings||d.tin&&d.tin.clip;
    // A sampler may lazily build a TIN index. Keep that cache on a wrapper,
    // not on the user's original mesh, and mask declared NoData beforehand.
    let tin=null;
    if(d.tin){
      tin=Object.create(d.tin);
      if(d.tin.zs&&nodata.length)Object.defineProperty(tin,'zs',{value:new Proxy(d.tin.zs,{
        get:(target,key)=>typeof key==='string'&&/^\d+$/.test(key)?clean(target[key]):Reflect.get(target,key,target)
      }),writable:true,configurable:true});
    }
    return point=>{
      let q=point;
      if(String(crs)!==String(options.workCRS)){
        if(typeof options.reproject!=='function')return NaN;
        try{q=options.reproject(options.workCRS,crs,point[0],point[1]);}catch(error){return NaN;}
      }
      if(!xy(q)||!withinClip(q,clip))return NaN;
      if(tin){
        if(typeof options.sampleTin!=='function')return NaN;
        try{return clean(options.sampleTin(tin,q[0],q[1]));}catch(error){return NaN;}
      }
      if(!gridOK||q[0]<xll||q[0]>xll+nc*cs||q[1]<yll||q[1]>yll+nr*cy)return NaN;
      if(options.method==='near'){
        const col=clamp(Math.floor((q[0]-xll)/cs),0,nc-1),row=clamp(Math.floor((yll+nr*cy-q[1])/cy),0,nr-1);
        return clean(d.z[row*nc+col]);
      }
      const x=(q[0]-xll)/cs-.5,y=nr-.5-(q[1]-yll)/cy,c=Math.floor(x),r=Math.floor(y),fx=x-c,fy=y-r;
      let value=0;
      for(const [dr,dc,w] of [[0,0,(1-fx)*(1-fy)],[0,1,fx*(1-fy)],[1,0,(1-fx)*fy],[1,1,fx*fy]]){
        if(w<=1e-12)continue;
        const z=clean(d.z[clamp(r+dr,0,nr-1)*nc+clamp(c+dc,0,nc-1)]);
        if(!Number.isFinite(z))return NaN;value+=w*z;
      }
      return Number.isFinite(value)?value:NaN;
    };
  }
  function sample(options={}){
    const points=Array.from(sequence(options.points)),met=metrics(points);if(!met)return null;
    const vector=options.vectorProfile||{},native=Array.from(sequence(vector.dist)),sampling=stations(met,native,options.step),dist=sampling.dist,
      pts=axisPoints(points,met,dist),method=options.method==='near'?'near':'bilinear',settings={...options,method},
      rasters=Array.from(sequence(options.rasters)).filter(Boolean),series=rasters.map((raster,index)=>{
        const read=rasterSampler(raster,settings),id=raster.id==null?String(index):String(raster.id);
        return {name:String(raster.name||'Raster '+id),sourceKey:'R:'+id,z:pts.map(read),method};
      });
    Array.from(sequence(vector.series)).filter(Boolean).forEach(item=>{
      const read=vectorSampler(native,sequence(item.z)),metadata={};
      for(const [key,value] of Object.entries(item))if(key!=='z')metadata[key]=clone(value);
      series.push({...metadata,z:dist.map(read)});
    });
    return {dist,total:met.total,pts,series,method,...(sampling.limited?{effectiveStep:sampling.effectiveStep}:{}),
      source:rasters.length?sequence(vector.series).length?'comparacao':'raster':'linhas'};
  }
  root.GeoMineLongitudinalComparison=Object.freeze({sample});
})(typeof window!=='undefined'?window:globalThis);
