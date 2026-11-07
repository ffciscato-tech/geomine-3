/* Preparação visual sob demanda. Os dados completos continuam no projeto;
   somente a criação de objetos de desenho ocultos é adiada. */
(function(){
'use strict';
// The coordinate values still pass through the same proj4 engine. Reuse only
// its parsed projection pair during one synchronous project load, not points,
// extents or geometries. No cache survives loading, an error or project switch.
function begin(){
  const original=window.toWGS,originalReproj=window.reproj,converters=new Map();let ended=false;
  function convert(from,to,x,y){
    const engine=window.proj4,source=engine.defs(from),target=engine.defs(to),key=JSON.stringify([from,to]);
    let entry=converters.get(key);
    // Definitions replaced during a load must not reuse the earlier pair.
    if(!entry||entry.engine!==engine||entry.source!==source||entry.target!==target){
      entry={engine,source,target,converter:engine(from,to)};
      if(converters.size>=32&&!converters.has(key))converters.delete(converters.keys().next().value);
      converters.set(key,entry);
    }
    return entry.converter.forward([x,y]);
  }
  function cached(crs,x,y){
    if(ended||typeof crs!=='string'||typeof window.proj4!=='function')return original.apply(this,arguments);
    if(crs==='EPSG:4326')return [x,y];
    try{
      return convert(crs,'EPSG:4326',x,y);
    }catch(_){return original.apply(this,arguments);}
  }
  // Tree totals measure even hidden layers in the project CRS. That path
  // uses reproj rather than toWGS and must not rebuild proj4 per vertex.
  // Cache only the converter: every coordinate and metric is recomputed.
  function cachedReproj(from,to,x,y){
    if(ended||typeof from!=='string'||typeof to!=='string'||typeof window.proj4!=='function')return originalReproj.apply(this,arguments);
    if(from===to)return [x,y];
    try{return convert(from,to,x,y);}catch(_){return originalReproj.apply(this,arguments);}
  }
  cached._warned=original._warned;window.toWGS=cached;
  if(typeof originalReproj==='function')window.reproj=cachedReproj;
  return {end(){
    if(ended)return;ended=true;converters.clear();
    if(cached._warned)original._warned=cached._warned;
    if(window.toWGS===cached)window.toWGS=original;
    if(window.reproj===cachedReproj)window.reproj=originalReproj;
  }};
}
function restore(o,type){
  if(o.visible===false){
    if(type==='L'&&o.gtype==='polygon')autoAreaSyncLayer(o);
    o._projectDrawDeferred=true;return;
  }
  if(type==='L')drawLayer(o);else renderRaster(o);
}
function ensure(n){
  if(!n?.o?._projectDrawDeferred)return;
  try{if(n.t==='L')drawLayer(n.o);else if(n.t==='R')renderRaster(n.o);}
  catch(e){n.o._projectDrawDeferred=true;throw e;}
}
window.GeoMineProjectOpening={restore,ensure,begin};
})();
