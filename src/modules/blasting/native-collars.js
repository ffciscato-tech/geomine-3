/* Drill collars use the original native DEM cell, never the display preview.
   NoData is retained as NaN; vertical units must be declared or confirmed. */
(function(root){
  'use strict';
  const EPSG=/^EPSG:(\d+)$/i;
  const normCRS=value=>{const v=String(value??'').trim().toUpperCase(),m=/^(?:EPSG:)?(\d+)$/.exec(v);return m?'EPSG:'+Number(m[1]):v;};
  const abort=()=>Object.assign(new Error('Leitura dos colares cancelada: o MDT ou o contexto mudou.'),{name:'AbortError'});
  const fail=(code,message)=>Object.assign(new Error(message),{code});
  const sameNumber=(a,b)=>Math.abs(Number(a)-Number(b))<=1e-12;
  const metre=value=>['m','meter','meters','metre','metres','metro','metros'].includes(String(value??'').trim().toLowerCase());
  function projection(crs,description){
    if(!EPSG.test(crs))throw fail('BLASTING_CRS',description+' deve ter um código EPSG definido.');
    let p;try{p=root.proj4(crs).oProj;}catch(_){throw fail('BLASTING_CRS','O CRS '+crs+' não está disponível no GeoMine.');}
    if(!p||p.projName==='longlat'||p.to_meter!=null&&!sameNumber(p.to_meter,1)||p.units&&!metre(p.units))
      throw fail('BLASTING_UNITS',description+' deve usar coordenadas projetadas em metros.');
    return p;
  }
  function imageKeys(image){
    if(!image)return null;
    const keys=image.getGeoKeys?.()||image.geoKeys||{};
    return Object.fromEntries(Object.entries(keys).map(([key,value])=>[key,ArrayBuffer.isView(value)?Array.from(value):value]));
  }
  function gdalUnits(image){
    const values=[];
    if(typeof image?.getGDALMetadata==='function')for(const sample of [undefined,0]){
      const metadata=image.getGDALMetadata(sample);
      if(metadata)for(const [key,value] of Object.entries(metadata))
        if(/^(?:unittype|unit|units|vertical_units|z_unit|z_units)$/i.test(key))values.push({field:'GDAL '+key,value});
    }
    const xml=image?.fileDirectory?.GDAL_METADATA||image?.getFileDirectory?.()?.GDAL_METADATA;
    if(typeof xml==='string')for(const match of xml.matchAll(/<Item\b[^>]*\bname=["'](?:UNITTYPE|UNIT|UNITS|VERTICAL_UNITS|Z_UNIT|Z_UNITS)["'][^>]*>([^<]*)<\/Item>/gi))
      values.push({field:'GDAL UNITTYPE',value:match[1]});
    return values;
  }
  function verticalEvidence(r,image,keys){
    const evidence=[];
    if(keys?.VerticalUnitsGeoKey!=null){
      if(Number(keys.VerticalUnitsGeoKey)!==9001)
        throw fail('BLASTING_VERTICAL_UNITS','O MDT declara unidade vertical diferente de metro (GeoKey '+keys.VerticalUnitsGeoKey+'). Use uma superfície com cotas em metros.');
      evidence.push({field:'VerticalUnitsGeoKey',value:9001});
    }
    for(const [name,object] of [['raster',r],['grade',r.d],['grade nativa',r.d?._full]])if(object)
      for(const field of ['verticalUnit','verticalUnits','zUnit','zUnits','elevationUnit','altitudeUnit','unit'])
        if(object[field]!=null&&String(object[field]).trim()!=='')evidence.push({field:name+'.'+field,value:object[field]});
    evidence.push(...gdalUnits(image));
    for(const item of evidence){
      if(item.field==='VerticalUnitsGeoKey')continue;
      if(!metre(item.value))throw fail('BLASTING_VERTICAL_UNITS','A unidade vertical declarada no MDT é “'+String(item.value)+'”. Use cotas em metros; a geração não converte nem inventa cotas.');
    }
    return evidence;
  }
  function noData(r,image){
    const values=[r.noData,r.nodata,r._nd,r.d?.noData,r.d?.nodata,r.d?._nd,r.d?._full?.noData,r.d?._full?.nodata,r.d?._full?._nd];
    if(typeof image?.getGDALNoData==='function')values.push(image.getGDALNoData());
    return [...new Set(values.filter(v=>v!==null&&v!==undefined&&String(v).trim()!=='').map(Number).filter(Number.isFinite))];
  }
  async function prepare(r,options={}){
    const workCRS=normCRS(options.workCRS);
    projection(workCRS,'O CRS de trabalho');
    if(!r?.d)throw fail('BLASTING_SOURCE','Selecione a superfície topográfica do GeoMine.');
    if(!root.GeoMineChannelDEM?.prepare)throw fail('BLASTING_SOURCE','O leitor nativo de MDT não está disponível.');
    let sampler=null,lease=null,closed=false;
    try{
      sampler=await root.GeoMineChannelDEM.prepare(r,{...options,workCRS});
      let image=r.d._img0;
      // A portable project may hold a native grid while its original file is
      // already accessible in the project directory. Inspect it without
      // replacing that grid or altering its binding.
      if(!image&&root.GeoMineChannelNativeSource?.resolve)
        lease=await root.GeoMineChannelNativeSource.resolve(r,options);
      image=image||lease?.image;
      const sourceCRS=normCRS(sampler.sourceCRS),p=projection(sourceCRS,'O CRS do MDT'),keys=imageKeys(image);
      if(keys){
        const code=Number(keys.ProjectedCSTypeGeoKey);
        if(!Number.isInteger(code)||code<=0||code===32767||'EPSG:'+code!==sourceCRS)
          throw fail('BLASTING_CRS','O EPSG do GeoTIFF não corresponde ao CRS da superfície selecionada. Confira a origem do MDT.');
        if(keys.ProjLinearUnitsGeoKey!=null&&Number(keys.ProjLinearUnitsGeoKey)!==9001)
          throw fail('BLASTING_UNITS','O GeoTIFF declara unidade horizontal diferente de metro.');
        if(keys.ProjLinearUnitSizeGeoKey!=null&&!sameNumber(keys.ProjLinearUnitSizeGeoKey,1))
          throw fail('BLASTING_UNITS','O GeoTIFF declara escala horizontal diferente de um metro.');
        if(Number(keys.GTRasterTypeGeoKey)===2)
          throw fail('BLASTING_SOURCE','Este GeoTIFF usa PixelIsPoint. Reprojete a superfície para uma grade PixelIsArea antes de obter as cotas dos colares.');
      }
      const evidence=verticalEvidence(r,image,keys),needsVerticalConfirmation=evidence.length===0,
        grid=Object.freeze({...sampler.grid}),nd=noData(r,image),
        sourceInfo=Object.freeze({name:String(r.name||'MDT'),id:r.id??null,sourceCRS,workCRS,
          horizontalUnit:'m',verticalUnit:needsVerticalConfirmation?null:'m',needsVerticalConfirmation,
          verticalUnitEvidence:Object.freeze(evidence.map(v=>Object.freeze({...v}))),
          native:true,nc:grid.nc,nr:grid.nr,resolutionX:grid.cs,resolutionY:grid.csy,
          metricResolution:sampler.resolution,noData:Object.freeze(nd),
          method:'native-cell',fileGeoKeys:keys?Object.freeze(keys):null,
          metadataOrigin:image?'GeoTIFF original':'grade nativa do GeoMine'}),
        metadataStamp=JSON.stringify([imageKeys(image),verticalEvidence(r,image,keys),noData(r,image)]);
      function isCurrent(){
        try{return !closed&&sampler.isCurrent()&&(!lease||lease.isCurrent())&&
          metadataStamp===JSON.stringify([imageKeys(image),verticalEvidence(r,image,keys),noData(r,image)]);}catch(_){return false;}
      }
      function check(){if(!isCurrent())throw abort();}
      function close(){if(closed)return;closed=true;sampler.close();lease?.close();}
      async function sampleCells(points,confirmation={}){
        check();
        if(!Array.isArray(points))throw new TypeError('Forneça uma lista de coordenadas XY dos colares.');
        if(needsVerticalConfirmation&&options.confirmVerticalMetres!==true&&confirmation.confirmVerticalMetres!==true)
          throw fail('BLASTING_VERTICAL_CONFIRM','O MDT não declara a unidade vertical. Confirme que suas cotas estão em metros antes de gerar os furos.');
        const cells=new Array(points.length),indices=[],requests=[];
        points.forEach((point,i)=>{
          if(!point||!Number.isFinite(point[0])||!Number.isFinite(point[1])){cells[i]={col:null,row:null,status:'invalid_xy'};return;}
          const cell=sampler.locate(point);
          if(!cell){cells[i]={col:null,row:null,status:'outside'};return;}
          cells[i]={col:cell.col,row:cell.row,status:'nodata'};indices.push(i);requests.push([cell.col,cell.row]);
        });
        const native=await sampler.cells(requests);check();
        const z=new Array(points.length).fill(NaN);
        indices.forEach((i,j)=>{if(Number.isFinite(native[j])){z[i]=native[j];cells[i].status='ok';}});
        return {z,cells,validCount:cells.filter(c=>c.status==='ok').length,
          noDataCount:cells.filter(c=>c.status==='nodata').length,
          outsideCount:cells.filter(c=>c.status==='outside').length,
          invalidCount:cells.filter(c=>c.status==='invalid_xy').length};
      }
      check();
      return Object.freeze({sourceInfo,sourceCRS,resolution:sampler.resolution,grid,sampleCells,close,isCurrent});
    }catch(error){sampler?.close();lease?.close();throw error;}
  }
  root.GeoMineBlastingNative=Object.freeze({prepare});
})(typeof window!=='undefined'?window:globalThis);
