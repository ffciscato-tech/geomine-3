/* Shared topographic flood connectivity. Hydrology uses a scalar elevation;
   a varying local level can use residual elevations (terrain minus level)
   and threshold zero. This is connectivity, not a hydraulic simulation. */
(function(){
'use strict';
// Standalone factory: its source can be executed inside an isolated worker.
function engine(){
  function connectedBelow(d,level,seedIdx,wall){
    const {nc,nr,z}=d||{},count=nc*nr;
    if(!Number.isSafeInteger(nc)||nc<=0||!Number.isSafeInteger(nr)||nr<=0||
      !Number.isSafeInteger(count)||!z||z.length!==count)
      throw new TypeError('Grade inválida para preenchimento conectado.');
    const mask=new Uint8Array(count);
    if(!Number.isFinite(level))return mask;
    const noData=new Set();
    for(const value of [d.noData,d.nodata,d._nd]){
      const n=typeof value==='number'?value:typeof value==='string'&&value.trim()!==''?Number(value):NaN;
      if(Number.isFinite(n)){noData.add(n);noData.add(Math.fround(n));}
    }
    const stack=[];
    function visit(k){
      if(mask[k]||(wall&&wall[k]))return;
      const value=z[k];
      // In particular, null must not be coerced to zero at a seed.
      if(!Number.isFinite(value)||noData.has(value)||!(value<level))return;
      mask[k]=1;stack.push(k);
    }
    for(const k of Array.isArray(seedIdx)?seedIdx:[seedIdx])
      if(Number.isSafeInteger(k)&&k>=0&&k<count)visit(k);
    while(stack.length){
      const k=stack.pop(),column=k%nc;
      if(k>=nc)visit(k-nc);
      if(k<count-nc)visit(k+nc);
      if(column>0)visit(k-1);
      if(column<nc-1)visit(k+1);
    }
    return mask;
  }
  return {connectedBelow};
}
window.GeoMineFloodFill={engine};
})();
