/* GeoMine — independent raster profiles for geological sections.
   Values are sampled at the common stations, never used to replace terrain.
   No browser/map/projection dependency: the caller supplies sampleRaster. */
(function(root){
  'use strict';
  const api=root.GeoMineGeology=root.GeoMineGeology||{};
  const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
  const record=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const sequence=value=>Array.isArray(value)||ArrayBuffer.isView(value)?value:[];
  const numeric=value=>typeof value==='number'?Number.isFinite(value)?value:null:
    typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value))?Number(value):null;
  const text=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').trim().slice(0,240):'';
  const idOf=value=>typeof value==='string'?value.trim():typeof value==='number'&&Number.isFinite(value)?String(value):'';
  function normalizeEntries(value){
    const list=Array.isArray(value)?value:value==null?[]:[value],seen=new Set(),out=[];
    list.forEach(raw=>{
      const item=raw&&typeof raw==='object'?raw:{id:raw},id=idOf(item.id);
      if(!id||seen.has(id))return;
      seen.add(id);out.push({id,role:['surface','water','contact'].includes(item.role)?item.role:'surface',
        mode:item.mode==='depth'?'depth':'elevation'});
    });
    return out;
  }
  function defaults(role){
    return {color:role==='water'?'#087fca':role==='contact'?'#d97706':'#263238',
      width:role==='terrain'?2.5:1.5,dash:role==='water'?'dash':'solid',visible:true};
  }
  function color(value,fallback){
    if(typeof value!=='string')return fallback;
    const hex=value.trim().toLowerCase();
    if(/^#[0-9a-f]{6}$/.test(hex))return hex;
    if(/^#[0-9a-f]{3}$/.test(hex))return '#'+hex.slice(1).split('').map(c=>c+c).join('');
    return fallback;
  }
  const dash=value=>['solid','dash','dot','dashdot'].includes(value)?value:null;
  function normalizeStyle(raw,fallback){
    const input=record(raw),base=typeof fallback==='string'?defaults(fallback):record(fallback),
      original=defaults('surface'),baseWidth=numeric(base.width),inputWidth=numeric(input.width),
      out={color:color(input.color,color(base.color,original.color)),
        width:Math.max(.5,Math.min(10,inputWidth??baseWidth??original.width)),
        dash:dash(input.dash)||dash(base.dash)||original.dash,
        visible:typeof input.visible==='boolean'?input.visible:typeof base.visible==='boolean'?base.visible:true};
    const name=own(input,'name')?text(input.name):text(base.name);
    if(name)out.name=name;
    return out;
  }
  function dashes(style){
    const name=typeof style==='string'?style:normalizeStyle(style).dash;
    return name==='dash'?[9,5]:name==='dot'?[2,4]:name==='dashdot'?[9,4,2,4]:[];
  }
  function validPoint(point){
    if(Array.isArray(point)||ArrayBuffer.isView(point))return Number.isFinite(point[0])&&Number.isFinite(point[1]);
    return !!point&&typeof point==='object'&&Number.isFinite(point.x)&&Number.isFinite(point.y);
  }
  function copyPoint(point){return Array.isArray(point)||ArrayBuffer.isView(point)?Array.from(point):{...point};}
  function noDataValues(raster){
    return [raster,raster&&raster.d].flatMap(source=>source?[source.noData,source.nodata,source._nd]:[])
      .map(numeric).filter(value=>value!==null);
  }
  function sampleProfiles(options={}){
    const entries=normalizeEntries(options.entries),rasters=sequence(options.rasters),dist=sequence(options.dist),
      points=sequence(options.points),terrain=sequence(options.terrainZ),sampler=options.sampleRaster,
      sources=new Map();
    // Do not silently switch to a similarly named raster, or to terrain.
    for(const raster of rasters){const id=idOf(raster&&raster.id);if(id&&!sources.has(id))sources.set(id,raster);}
    return entries.map(entry=>{
      const raster=sources.get(entry.id),sourceName=text(raster&&raster.name)||entry.id,
        output={id:entry.id,key:'raster:'+entry.id,name:sourceName,sourceName,role:entry.role,mode:entry.mode,
          z:Array.from({length:dist.length},()=>NaN),warning:''};
      if(!raster){output.warning='Raster não está disponível neste projeto (ID: '+entry.id+').';return output;}
      if(typeof sampler!=='function'){output.warning='Amostrador de rasters indisponível; perfil não calculado.';return output;}
      const nodata=noDataValues(raster);let invalidDepth=0,missingTerrain=0,readFailures=0,invalidStations=0,valid=0;
      for(let index=0;index<dist.length;index++){
        const point=points[index];
        if(!Number.isFinite(dist[index])||!validPoint(point)){invalidStations++;continue;}
        let value;
        try{value=sampler(raster,copyPoint(point),index);}catch(error){readFailures++;continue;}
        // In particular, null/undefined/blank must not become a zero elevation.
        if(!Number.isFinite(value)||nodata.some(n=>value===n||value===Math.fround(n)))continue;
        if(entry.mode==='depth'){
          if(value<0){invalidDepth++;continue;}
          if(!Number.isFinite(terrain[index])){missingTerrain++;continue;}
          value=terrain[index]-value;
        }
        if(!Number.isFinite(value))continue;
        output.z[index]=value;valid++;
      }
      const warnings=[];
      if(invalidDepth)warnings.push(invalidDepth+' amostra(s) com profundidade negativa ignorada(s)');
      if(missingTerrain)warnings.push(missingTerrain+' amostra(s) de profundidade sem cota válida do terreno');
      if(readFailures)warnings.push(readFailures+' falha(s) na leitura do raster');
      if(invalidStations)warnings.push(invalidStations+' estação(ões) sem coordenadas/distância válidas');
      if(!valid)warnings.push('Nenhuma cota válida no eixo da seção');
      else if(valid<dist.length)warnings.push((dist.length-valid)+' amostra(s) sem dados; mantidas como lacunas');
      output.warning=warnings.join('. ')+(warnings.length?'.':'');
      return output;
    });
  }
  api.rasterProfiles=Object.freeze({normalizeEntries,normalizeStyle,defaults,dashes,sampleProfiles});
})(typeof window!=='undefined'?window:globalThis);
