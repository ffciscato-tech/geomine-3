/* Progressive, temporary orthophoto preview. Never committed to the project.
   The full preview and original TIFF remain the authoritative sources. */
(function(){
'use strict';
let last=null;
function previewLimit(){
  // Android needs only a quick overview to establish the map. Visible tiles
  // and Layout keep reading the unmodified original at their own resolution.
  // Do not spend the first display on a 4K PNG, even on high-memory tablets.
  if(/Android/i.test(navigator.userAgent))return 1024;
  const mobile=/iPhone|iPad|iPod/i.test(navigator.userAgent);
  return !mobile||(navigator.deviceMemory||0)>=6?4096:2560;
}
function create(width,height,bounds,crs,nd,signal){
  const scale=Math.min(1,640/Math.max(width,height)),w=Math.max(1,Math.floor(width*scale)),h=Math.max(1,Math.floor(height*scale));
  const cv=document.createElement('canvas');cv.width=w;cv.height=h;
  const ctx=cv.getContext('2d'),id=ctx.createImageData(w,h),xs=new Map(),ys=new Map();
  for(let x=0;x<w;x++)xs.set(Math.floor(x*width/w),x);
  for(let y=0;y<h;y++)ys.set(Math.floor(y*height/h),y);
  const started=performance.now(),stats=last={frames:0,firstPaintMs:null,finishedMs:null,disposed:false};
  let overlay=null,closed=false,painted=0,dirty=false,hasData=false;
  const project=S.projectId,generation=window.GeoMineSessionAutosave?.state?.generation;
  const current=()=>!closed&&!signal?.aborted&&S.projectId===project&&window.GeoMineSessionAutosave?.state?.generation===generation&&S.workCRS===crs;
  function paint(){
    if(!current()||!dirty||!hasData||performance.now()-painted<750&&stats.frames)return;
    ctx.putImageData(id,0,0);const wp=warpCanvasWM(cv,bounds,crs),b=wp.b;
    const sw=wp.wm?reproj('EPSG:3857','EPSG:4326',b[0],b[1]):toWGS(crs,b[0],b[1]);
    const ne=wp.wm?reproj('EPSG:3857','EPSG:4326',b[2],b[3]):toWGS(crs,b[2],b[3]);
    if(!wgsBoundsOK(sw,ne))return;
    if(!map.getPane('geomine_ortho_loading')){const pane=map.createPane('geomine_ortho_loading');pane.style.zIndex=406;pane.style.pointerEvents='none';}
    const url=wp.cv.toDataURL('image/png');
    if(!overlay){
      overlay=L2.imageOverlay(url,[[sw[1],sw[0]],[ne[1],ne[0]]],{pane:'geomine_ortho_loading',interactive:false}).addTo(map);
      safeFit(overlay.getBounds());stats.firstPaintMs=performance.now()-started;
    }else overlay.setUrl(url);
    stats.frames++;painted=performance.now();dirty=false;
  }
  function block({bands,xs:columns,ys:rows}){
    if(!current())return;
    const xx=columns.filter(x=>xs.has(x.out)),yy=rows.filter(y=>ys.has(y.out));
    if(!xx.length||!yy.length)return;
    const [R,G,B,A]=bands,sc=R instanceof Uint16Array||R instanceof Int16Array?1/257:1;
    for(const y of yy)for(const x of xx){const k=y.out*width+x.out,o=(ys.get(y.out)*w+xs.get(x.out))*4;
      const alpha=A&&A[k]===0||nd!=null&&R[k]==nd&&G[k]==nd&&B[k]==nd?0:255;
      id.data[o]=R[k]*sc;id.data[o+1]=G[k]*sc;id.data[o+2]=B[k]*sc;id.data[o+3]=alpha;
      if(alpha)hasData=true;
    }
    dirty=true;paint();
  }
  function rows(data,from,to){
    if(!current())return;
    for(const [sourceY,y] of ys){if(sourceY<from||sourceY>=to)continue;
      for(const [sourceX,x] of xs){const a=(sourceY*width+sourceX)*4,o=(y*w+x)*4;id.data.set(data.subarray(a,a+4),o);if(data[a+3])hasData=true;}}
    dirty=true;paint();
  }
  function dispose(){if(closed)return;closed=true;stats.disposed=true;stats.finishedMs=performance.now()-started;if(overlay)map.removeLayer(overlay);signal?.removeEventListener('abort',dispose);}
  signal?.addEventListener('abort',dispose,{once:true});
  return {block,rows,dispose};
}
function stabilize(tiff,file,image){
  if(!/Android/i.test(navigator.userAgent)||!(file instanceof Blob)||file.size<64*1024*1024||file.size>=1024*1024*1024)return;
  if(!window.GeoMineRasterSource||!window.GeoMineRasterImport?.adoptSource)return;
  const project=S.projectId,generation=window.GeoMineSessionAutosave?.state?.generation,controller=new AbortController();
  const current=()=>S.projectId===project&&window.GeoMineSessionAutosave?.state?.generation===generation&&
    S.img===image&&image._tiff===tiff&&image._sourceRaw===file;
  const timer=setInterval(()=>{if(!current())controller.abort();},500);
  // The optional stable provider copy starts AFTER the map can display the
  // orthophoto. Swapping identical bytes preserves IFDs and decoded tile caches.
  const preparation=GeoMineRasterSource.prepare(file,{signal:controller.signal}).then(stable=>{
    if(current()&&stable!==file&&GeoMineRasterImport.adoptSource(tiff,stable)){image._sourceRaw=stable;return true;}return false;
  }).catch(e=>{
    if(e.name!=='AbortError'&&current())cmdLog('Ortofoto visível; cópia local não concluída. Mantenha o original acessível para os tiles.','warn');return false;
  }).finally(()=>clearInterval(timer));
  Object.defineProperty(image,'_sourcePreparation',{value:preparation,writable:true,configurable:true});
}
window.GeoMineOrthoFirstFrame={create,stabilize,previewLimit,stats:()=>last};
})();
