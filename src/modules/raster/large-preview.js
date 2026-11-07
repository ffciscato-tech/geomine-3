/* Initial display only. Never replaces the retained native TIFF or its Z data.
   Massive DEMs without overviews must not scan billions of cells before the
   first frame. Use the bounded tile sampler; smaller DEMs keep block means. */
(function(){
'use strict';
const THRESHOLD=150e6,MAX_CELLS=1e6;
function cellBudget(width,height,normal){
  return width*height>THRESHOLD?Math.min(normal,MAX_CELLS):normal;
}
async function read(image,width,height,control={}){
  const runtime=window.GeoMineTileRuntime,W=image.getWidth(),H=image.getHeight();
  if(W*H<=THRESHOLD||!runtime)return null;
  const options={samples:[0],window:[0,0,W,H],width,height,resampleMethod:'nearest'};
  if(!runtime.canReadResampled(image,options))return null;
  return runtime.read(image,options,{...control,nearestFloor:true});
}
window.GeoMineLargeRasterPreview={cellBudget,read};
})();
