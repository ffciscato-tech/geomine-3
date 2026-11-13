/* Native DEM samples for channel sections. Never promote a display preview to
   a measurement source and never allocate a complete copy of the DEM. */
(function(root){
  'use strict';
  const PAGE=128, CACHE_BYTES=4*1024*1024, BATCH=1024, WINDOW_MAX_CELLS=1e6;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const number=v=>typeof v==='number'?v:typeof v==='string'&&v.trim()!==''?Number(v):NaN;
  const xy=p=>p&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
  let serial=0;
  function aborted(message){const e=new Error(message||'Leitura do MDT cancelada.');e.name='AbortError';return e;}
  function missing(){return Object.assign(new Error('O projeto contém a prévia, mas o TIFF original deste MDT não está acessível. Use “Localizar MDT original” e selecione o arquivo .tif.'),{code:'CHANNEL_NATIVE_MISSING'});}
  const tag=v=>String(v??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f\s_-]/g,'');
  const nonElevation=new Set(['slope','declividade','aspect','orientacao','mcfindex','cn','curvenumber',
    'flowaccumulation','accumulation','d8accumulation','flowdirection','d8direction','hillshade','shadedrelief','classification']);
  const nonElevationUnits=new Set(['pct','%','percent','percentage','deg','degree','degrees','grau','graus','°','rad','radian','radians']);
  function isElevation(r){
    if(!r?.d)return false;
    // This excludes known thematic rasters. It cannot establish that an
    // unlabelled TIFF measures bare earth, bathymetry or vertical metres.
    return ![r,r.d,r.d._full].filter(Boolean).some(v=>nonElevation.has(tag(v.quantity))||
      nonElevationUnits.has(tag(v.unit))||v._cnOrto||v._cnSlope||v._cnClass||v._d8Source)&&
      !['cn','slopeclass'].includes(tag(r.style?.mode));
  }
  function generatedInWorkCRS(r){
    return [r,r.d,r.d?._full].filter(Boolean).some(v=>v._lidarGroundMDT===true||
      v._tinSourceId!=null&&String(v._tinSourceId).trim()!==''||typeof v._tinMethod==='string'&&v._tinMethod.trim()!=='');
  }
  function shape(g){
    if(!g)return null;
    const nc=number(g.nc),nr=number(g.nr),cs=number(g.cs),csy=number(g.csy??g.cs),xll=number(g.xll),yll=number(g.yll);
    return Number.isSafeInteger(nc)&&nc>0&&Number.isSafeInteger(nr)&&nr>0&&cs>0&&csy>0&&
      Number.isFinite(cs)&&Number.isFinite(csy)&&Number.isFinite(xll)&&Number.isFinite(yll)
      ?{nc,nr,cs,csy,xll,yll}:null;
  }
  function bounds(g){return [g.xll,g.yll,g.xll+g.nc*g.cs,g.yll+g.nr*g.csy];}
  function sameBounds(a,b){const tol=Math.max(a.cs,a.csy,b.cs,b.csy)*1e-6;return bounds(a).every((v,i)=>Math.abs(v-bounds(b)[i])<=tol);}
  function fullGrid(g){const s=shape(g);return s&&g.z&&g.z.length===s.nc*s.nr?s:null;}
  function snapshot(object,keys){const values=keys.map(k=>object?.[k]);return ()=>keys.every((k,i)=>Object.is(object?.[k],values[i]));}
  function withinClip(p,rings){
    if(!rings||!rings.length)return true;
    let inside=false;
    for(const ring of rings){
      if(!Array.isArray(ring)||ring.length<3)throw new Error('Limite de recorte do MDT inválido.');
      for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const a=ring[j],b=ring[i];if(!xy(a)||!xy(b))throw new Error('Limite de recorte do MDT inválido.');
        const dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy,t=l2?clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2,0,1):0;
        if(Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)<=1e-8)return true;
        if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
      }
    }
    return inside;
  }
  function assertAxisAligned(image){
    const fd=image.fileDirectory||image.getFileDirectory?.()||{},m=fd.ModelTransformation;
    if(m&&(m.length!==16||!Array.from(m).every(Number.isFinite)||m[1]!==0||m[4]!==0||m[2]!==0||m[6]!==0||
      m[12]!==0||m[13]!==0||m[14]!==0||m[15]!==1||!(m[0]>0)||!(m[5]<0)))
      throw new Error('MDT com transformação afim rotacionada ou invertida não suportada. Reprojete o TIFF para uma grade norte-acima.');
    if(fd.Orientation!=null&&Number(fd.Orientation)!==1)throw new Error('Orientação do TIFF não suportada para amostragem de MDT.');
    if(typeof image.getResolution==='function'){
      let resolution;try{resolution=image.getResolution();}catch(e){if(m)throw e;}
      if(resolution&&(!(resolution[0]>0)||!(resolution[1]<0)))throw new Error('MDT invertido não suportado. Reprojete o TIFF para uma grade norte-acima.');
    }
  }
  function projection(workCRS,rasterCRS){
    if(!workCRS||!rasterCRS)throw new Error('Defina o CRS do MDT e um CRS UTM em metros para o projeto.');
    if(typeof root.proj4!=='function')throw new Error('Conversor de coordenadas indisponível.');
    let work,forward,reverse;
    try{
      work=root.proj4(workCRS).oProj;
      if(!work||work.projName!=='utm'||(work.to_meter!=null&&Math.abs(work.to_meter-1)>1e-12)||
        (work.units&&work.units!=='m'&&work.units!=='meter'&&work.units!=='metre'))throw new Error('utm');
      // Construct both converters now: unknown definitions must fail explicitly.
      forward=root.proj4(workCRS,rasterCRS);reverse=root.proj4(rasterCRS,workCRS);
    }catch(e){throw new Error('CRS inválido ou indisponível. O CRS de trabalho deve ser UTM em metros e o CRS do MDT deve estar definido.');}
    const transform=(converter,p)=>{
      let q;try{q=converter.forward([p[0],p[1]]);}catch(e){throw new Error('Não foi possível reprojetar as coordenadas do MDT.');}
      if(!xy(q))throw new Error('Reprojeção do MDT produziu coordenadas inválidas.');return q;
    };
    // Avoid a needless UTM -> geographic -> identical UTM roundtrip. Its
    // sub-nanometre error can move an exact border/centre into a NoData cell.
    if(String(workCRS)===String(rasterCRS))return {toRaster:p=>p,toWork:p=>p};
    return {toRaster:p=>transform(forward,p),toWork:p=>transform(reverse,p)};
  }
  function metricResolution(g,toWork){
    // Geographic/projected grids can change scale across their footprint. Use
    // the smallest of both pixel axes at a 3×3 set of locations, not cs in degrees.
    let result=Infinity;
    for(const fx of [0,.5,1])for(const fy of [0,.5,1]){
      const x=g.xll+(g.nc-1)*g.cs*fx+g.cs/2,y=g.yll+(g.nr-1)*g.csy*fy+g.csy/2,
        a=toWork([x,y]),b=toWork([x+g.cs,y]),c=toWork([x,y+g.csy]);
      result=Math.min(result,Math.hypot(b[0]-a[0],b[1]-a[1]),Math.hypot(c[0]-a[0],c[1]-a[1]));
    }
    if(!(result>0)||!Number.isFinite(result))throw new Error('Resolução métrica do MDT inválida.');return result;
  }
  async function prepare(r,options={}){
    let recovered=null;
    try{
    const {workCRS,signal,isCurrent,onProgress}=options,d=r&&r.d;
    if(signal?.aborted)throw aborted();
    if(typeof isCurrent==='function'&&!isCurrent())throw aborted('A fonte do MDT mudou.');
    if(!d)throw new Error('Selecione uma camada raster de MDT.');
    if(!isElevation(r))throw new Error('Esta camada contém declividade, orientação ou outro índice, não cotas de terreno. Selecione um MDT com altitudes em metros.');
    const original=d._img0,baseShape=shape(d),f=d._full,fs=fullGrid(f);
    let grid=d,g=fullGrid(d),image=null;
    // A full cache must be demonstrably at native dimensions, not merely larger
    // than the preview. Explicit native generated grids are also accepted.
    const cache=d._projectNativeFullCache,
      dims=d.srcDims||[d._W0,d._H0],
      fullProven=fs&&!(f.resampled>1)&&baseShape&&sameBounds(fs,baseShape)&&
        (f.native===true||fs.nc===Number(dims[0])&&fs.nr===Number(dims[1]))&&
        (!cache||cache.full!==f||!original||cache.sourceImage===original);
    if(fullProven){grid=f;g=fs;}
    else if(!g||d.resampled>1||(original&&Number(dims[0])>0&&Number(dims[1])>0&&
      (g.nc!==Number(dims[0])||g.nr!==Number(dims[1])))||(d.fromProject&&d.native!==true&&
      !(g.nc===Number(dims[0])&&g.nr===Number(dims[1])))){
      if(!original)recovered=await root.GeoMineChannelNativeSource?.resolve(r,options);
      image=original||recovered?.image;
      if(!image)throw missing();
    }
    // An original attachment may no longer represent an edited preview.
    if(image&&r._projectNativeBinding&&typeof root.projectNativeRasterSourceCurrent==='function'&&
      !root.projectNativeRasterSourceCurrent(r))throw new Error('A grade do MDT foi alterada após anexar o original. Carregue o TIFF correspondente nas propriedades do raster.');
    if(image){
      if(!root.GeoMineTileRuntime||typeof root.GeoMineTileRuntime.read!=='function')throw new Error('Leitor nativo de blocos do MDT indisponível.');
      assertAxisAligned(image);
      const nc=Number(image.getWidth()),nr=Number(image.getHeight()),bb=image.getBoundingBox?image.getBoundingBox():d._bb;
      if(!bb||bb.length!==4||!Array.from(bb).every(Number.isFinite))throw new Error('Georreferenciamento nativo do MDT inválido.');
      g=shape({nc,nr,cs:(bb[2]-bb[0])/nc,csy:(bb[3]-bb[1])/nr,xll:bb[0],yll:bb[1]});
      if(!g)throw new Error('Dimensões nativas do MDT inválidas.');
      const bands=typeof image.getSamplesPerPixel==='function'?image.getSamplesPerPixel():image.fileDirectory?.SamplesPerPixel;
      if(bands!=null&&Number(bands)!==1)throw new Error('Selecione um MDT de uma banda, não uma imagem multibanda.');
    }else if(original){
      // A full in-memory import is still invalid if its TIFF geometry rotated.
      assertAxisAligned(original);
    }
    // GeoTIFF.js returns the point tie as the box corner. PixelIsPoint TIFFs
    // need the GDAL/RFC33 half-cell shift before locating a native cell.
    // Already corrected/generated grids must not be shifted a second time.
    const nativeImage=image||original,keys=nativeImage?.getGeoKeys?.()||nativeImage?.geoKeys||{},
      fd=nativeImage?.fileDirectory||nativeImage?.getFileDirectory?.()||{},
      first=v=>ArrayBuffer.isView(v)||Array.isArray(v)?v[0]:v;
    if(g&&Number(keys.GTRasterTypeGeoKey)===2){
      const bb=nativeImage.getBoundingBox?.(),raw=bb&&shape({nc:g.nc,nr:g.nr,cs:(bb[2]-bb[0])/g.nc,csy:(bb[3]-bb[1])/g.nr,xll:bb[0],yll:bb[1]});
      if(image||raw&&sameBounds(g,raw))g={...g,xll:g.xll-g.cs/2,yll:g.yll+g.csy/2};
    }
    const float32=image?Number(first(fd.SampleFormat))===3&&Number(first(fd.BitsPerSample))===32:grid.z instanceof Float32Array;
    if(!g)throw new Error('Grade do MDT inválida.');
    const crs=recovered?.sourceCRS||grid.crs||d.crs||r.crs||grid.srcCRS||d.srcCRS||r.srcCRS||
        (!image&&!original&&generatedInWorkCRS(r)?workCRS:null),
      proj=projection(workCRS,crs),resolution=metricResolution(g,proj.toWork),
      clip=r._exactClipRings||grid.clip||grid.tin?.clip||d.clip||d.tin?.clip||null,
      nodata=[grid,d,r].flatMap(v=>[v.noData,v.nodata,v._nd]).map(number).filter(Number.isFinite);
    if(image&&typeof image.getGDALNoData==='function'){
      const nd=number(image.getGDALNoData());if(Number.isFinite(nd))nodata.push(nd);
    }
    const clean=v=>{v=number(v);return Number.isFinite(v)&&!nodata.some(n=>v===n||v===Math.fround(n))?v:NaN;},
      unchangedRaster=snapshot(r,['d','crs','srcCRS','quantity','unit','_cnOrto','_cnSlope','_exactClipRings','_projectSourceRaw','_projectNativeBinding']),
      unchangedBase=snapshot(d,['z','nc','nr','cs','csy','xll','yll','crs','srcCRS','resampled','native','fromProject','_img0','_tiff','_full','_nd','noData','nodata','clip','tin']),
      unchangedGrid=snapshot(grid,['z','nc','nr','cs','csy','xll','yll','crs','srcCRS','_nd','noData','nodata','clip','tin']),
      controller=new AbortController(),pages=new Map(),pending=new Map();
    let closed=false,bytes=0,tail=Promise.resolve();
    const current=()=>!closed&&!signal?.aborted&&!controller.signal.aborted&&(!recovered||recovered.isCurrent(false))&&isElevation(r)&&unchangedRaster()&&unchangedBase()&&unchangedGrid()&&
      (typeof isCurrent!=='function'||isCurrent());
    function check(){if(!current())throw aborted('Leitura cancelada: o MDT ou o contexto mudou.');}
    function close(){if(closed)return;closed=true;controller.abort();pages.clear();pending.clear();bytes=0;signal?.removeEventListener('abort',close);recovered?.close();}
    signal?.addEventListener('abort',close,{once:true});
    function wait(promise){
      return new Promise((resolve,reject)=>{
        const cancel=()=>{cleanup();reject(aborted());},cleanup=()=>controller.signal.removeEventListener('abort',cancel);
        if(controller.signal.aborted){cancel();return;}
        controller.signal.addEventListener('abort',cancel,{once:true});
        Promise.resolve(promise).then(value=>{cleanup();try{check();resolve(value);}catch(e){reject(e);}},error=>{cleanup();reject(error);});
      });
    }
    async function page(px,py){
      check();const key=px+':'+py,hit=pages.get(key);
      if(hit){pages.delete(key);pages.set(key,hit);return hit;}
      if(pending.has(key))return pending.get(key);
      const left=px*PAGE,top=py*PAGE,right=Math.min(g.nc,left+PAGE),bottom=Math.min(g.nr,top+PAGE);
      const job=(async()=>{
        const rasters=await wait(root.GeoMineTileRuntime.read(image,{samples:[0],window:[left,top,right,bottom],signal:controller.signal},
          {isCurrent:current,priority:'analysis'}));
        check();const values=rasters&&rasters[0];
        if(!values||values.length!==(right-left)*(bottom-top))throw new Error('Bloco nativo do MDT incompleto.');
        const entry={left,top,width:right-left,values,bytes:values.byteLength||values.length*8};
        while(bytes+entry.bytes>CACHE_BYTES&&pages.size){const oldest=pages.keys().next().value;bytes-=pages.get(oldest).bytes;pages.delete(oldest);}
        if(entry.bytes<=CACHE_BYTES){pages.set(key,entry);bytes+=entry.bytes;}
        return entry;
      })();
      pending.set(key,job);try{return await job;}finally{pending.delete(key);}
    }
    function stencil(point){
      if(!xy(point))return null;
      const q=proj.toRaster(point),east=g.xll+g.nc*g.cs,north=g.yll+g.nr*g.csy;
      if(q[0]<g.xll||q[0]>east||q[1]<g.yll||q[1]>north||!withinClip(q,clip))return null;
      const x=(q[0]-g.xll)/g.cs-.5,y=g.nr-.5-(q[1]-g.yll)/g.csy,c=Math.floor(x),row=Math.floor(y),fx=x-c,fy=y-row,out=[];
      for(const [dr,dc,w] of [[0,0,(1-fx)*(1-fy)],[0,1,fx*(1-fy)],[1,0,(1-fx)*fy],[1,1,fx*fy]])
        if(w>1e-12)out.push([clamp(c+dc,0,g.nc-1),clamp(row+dr,0,g.nr-1),w]);
      return out;
    }
    async function run(points){
      check();if(!Array.isArray(points))throw new TypeError('Forneça uma lista de pontos XY.');
      const output=new Array(points.length).fill(NaN);
      for(let offset=0;offset<points.length;offset+=BATCH){
        check();const end=Math.min(points.length,offset+BATCH),groups=new Map();
        for(let i=offset;i<end;i++){
          const cells=stencil(points[i]);if(!cells)continue;output[i]=0;
          for(const [col,row,w] of cells){
            if(!image){const value=clean(grid.z[row*g.nc+col]);output[i]=Number.isFinite(value)?output[i]+w*value:NaN;}
            else{const px=Math.floor(col/PAGE),py=Math.floor(row/PAGE),key=px+':'+py;
              if(!groups.has(key))groups.set(key,{px,py,cells:[]});groups.get(key).cells.push([i,col,row,w]);}
          }
        }
        for(const group of groups.values()){
          const block=await page(group.px,group.py);check();
          for(const [i,col,row,w] of group.cells){const value=clean(block.values[(row-block.top)*block.width+col-block.left]);
            output[i]=Number.isFinite(value)?output[i]+w*value:NaN;}
        }
        check();if(typeof onProgress==='function')onProgress(end/points.length);check();
        // Permit Escape/project changes even when all samples were in memory.
        if(end<points.length)await wait(new Promise(resolve=>setTimeout(resolve,0)));
      }
      check();return output;
    }
    function sample(points){
      // Serialize callers so the adapter cannot flood the shared tile runtime.
      const result=tail.then(()=>run(points));tail=result.catch(()=>{});return result;
    }
    function locate(point){
      // Native cell containing the point: the value stored in the file, with
      // no interpolation (used by the point information popup).
      if(!xy(point))return null;
      const q=proj.toRaster(point),east=g.xll+g.nc*g.cs,north=g.yll+g.nr*g.csy;
      if(q[0]<g.xll||q[0]>east||q[1]<g.yll||q[1]>north||!withinClip(q,clip))return null;
      return {col:clamp(Math.floor((q[0]-g.xll)/g.cs),0,g.nc-1),row:clamp(Math.floor((north-q[1])/g.csy),0,g.nr-1)};
    }
    async function readCells(list){
      check();if(!Array.isArray(list))throw new TypeError('Forneça uma lista de células [col,lin].');
      const output=new Array(list.length).fill(NaN),groups=new Map();
      list.forEach((cell,i)=>{
        const col=cell?.[0],row=cell?.[1];
        if(!Number.isSafeInteger(col)||!Number.isSafeInteger(row)||col<0||row<0||col>=g.nc||row>=g.nr)return;
        // Exact native reads follow the same ROI as interpolated samples
        // and readWindow. A clipped-out cell must never seed a fill outside
        // the visible/analytical surface, even when its TIFF value exists.
        if(clip?.length&&!withinClip([g.xll+(col+.5)*g.cs,g.yll+(g.nr-row-.5)*g.csy],clip))return;
        if(!image){output[i]=clean(grid.z[row*g.nc+col]);return;}
        const px=Math.floor(col/PAGE),py=Math.floor(row/PAGE),key=px+':'+py;
        if(!groups.has(key))groups.set(key,{px,py,cells:[]});groups.get(key).cells.push([i,col,row]);
      });
      for(const group of groups.values()){
        const block=await page(group.px,group.py);check();
        for(const [i,col,row] of group.cells)output[i]=clean(block.values[(row-block.top)*block.width+col-block.left]);
      }
      check();return output;
    }
    function cells(list){const result=tail.then(()=>readCells(list));tail=result.catch(()=>{});return result;}
    async function runWindow(window){
      check();
      if(!Array.isArray(window)||window.length!==4||!window.every(Number.isSafeInteger))
        throw new TypeError('Forneça uma janela nativa [esquerda,topo,direita,base] com índices inteiros.');
      const [left,top,right,bottom]=window,width=right-left,height=bottom-top,count=width*height;
      if(left<0||top<0||right>g.nc||bottom>g.nr||width<=0||height<=0)
        throw new RangeError('A janela nativa deve estar dentro dos limites do MDT.');
      if(!Number.isSafeInteger(count)||count>WINDOW_MAX_CELLS)
        throw new RangeError('Leia o MDT em janelas de até 1 milhão de células.');
      let values=null;
      if(image){
        // No width/height or overview: each returned value is an original cell.
        const rasters=await wait(root.GeoMineTileRuntime.read(image,{samples:[0],window,signal:controller.signal},
          {isCurrent:current,priority:'analysis'}));
        check();values=rasters&&rasters[0];
        if(!values||values.length!==count)throw new Error('Janela nativa do MDT incompleta.');
      }
      const output=new Float64Array(count),clipped=!!clip?.length,batch=clipped?4096:32768;
      for(let offset=0;offset<count;offset+=batch){
        check();const end=Math.min(count,offset+batch);
        for(let i=offset;i<end;i++){
          const col=left+i%width,row=top+Math.floor(i/width);
          output[i]=clipped&&!withinClip([g.xll+(col+.5)*g.cs,g.yll+(g.nr-row-.5)*g.csy],clip)
            ?NaN:clean(image?values[i]:grid.z[row*g.nc+col]);
        }
        if(end<count)await wait(new Promise(resolve=>setTimeout(resolve,0)));
      }
      check();return output;
    }
    function readWindow(window){
      // Snapshot the indices before queuing and share the sample/cells queue.
      const request=Array.isArray(window)?window.slice():window;
      const result=tail.then(()=>runWindow(request));tail=result.catch(()=>{});return result;
    }
    try{check();}catch(e){close();throw e;}
    return Object.freeze({resolution,label:String(r.name||'MDT')+' — resolução nativa',native:true,
      float32,sourceKey:'R:'+String(r.id??'')+':channel:'+String(++serial),sample,close,sourceCRS:crs,
      grid:Object.freeze({...g}),locate,cells,readWindow,toRaster:proj.toRaster,toWork:proj.toWork,isCurrent:current});
    }catch(e){recovered?.close();throw e;}
  }
  root.GeoMineChannelDEM=Object.freeze({prepare,isElevation});
})(typeof window!=='undefined'?window:globalThis);
