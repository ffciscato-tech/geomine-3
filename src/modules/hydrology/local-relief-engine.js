/* One numerical/color implementation for native viewport tiles and export. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GeoMineLocalReliefEngine=api;})(typeof window==='undefined'?globalThis:window,function localReliefEngine(){
'use strict';
const stops=[[8,48,107],[33,113,181],[107,174,214],[198,219,239],[247,251,255]];
function rgba(rel,amplitude,ramp='blues'){const palette=ramp==='reference'?[[8,29,145],[94,117,224],[255,255,235],[248,192,112],[180,75,10]]:stops;const colors=new Uint8ClampedArray(rel.length*4);for(let k=0;k<rel.length;k++){if(!Number.isFinite(rel[k]))continue;const t=Math.max(0,Math.min(1,(rel[k]+amplitude)/(2*amplitude)))*4,i=Math.min(3,Math.floor(t)),f=t-i;for(let c=0;c<3;c++)colors[k*4+c]=Math.round(palette[i][c]*(1-f)+palette[i+1][c]*f);colors[k*4+3]=255}return colors;}
function compute(q){
 const {data,nw,nh,factor,workWidth:w,workHeight:h,outX,outY,outWidth:ow,outHeight:oh,rx,ry,amplitude}=q;
 if(![nw,nh,w,h,ow,oh,factor].every(n=>Number.isSafeInteger(n)&&n>0)||data.length!==nw*nh)throw Error('Invalid relief block');
 const z=new Float32Array(w*h);z.fill(NaN);const required=Math.floor(factor*factor/2)+1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0,n=0;for(let r=y*factor;r<Math.min(nh,(y+1)*factor);r++)for(let c=x*factor;c<Math.min(nw,(x+1)*factor);c++){const v=data[r*nw+c];if(Number.isFinite(v)&&v>-1000){sum+=v;n++}}if(n>=required)z[y*w+x]=sum/n;}
 const stride=w+1,sums=new Float64Array(stride*(h+1)),counts=new Uint32Array(stride*(h+1));
 for(let y=0;y<h;y++){let sum=0,n=0;for(let x=0;x<w;x++){const v=z[y*w+x];if(Number.isFinite(v)){sum+=v;n++}const k=(y+1)*stride+x+1;sums[k]=sums[k-stride]+sum;counts[k]=counts[k-stride]+n}}
 const rel=new Float32Array(ow*oh);rel.fill(NaN);
 for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){const xx=x+outX,yy=y+outY;if(xx>=w||yy>=h)continue;const v=z[yy*w+xx];if(!Number.isFinite(v))continue;const x0=Math.max(0,xx-rx),x1=Math.min(w,xx+rx+1),y0=Math.max(0,yy-ry),y1=Math.min(h,yy+ry+1),a=y0*stride+x0,b=y0*stride+x1,c=y1*stride+x0,d=y1*stride+x1,n=counts[d]-counts[b]-counts[c]+counts[a];if(n)rel[y*ow+x]=v-(sums[d]-sums[b]-sums[c]+sums[a])/n;}
 return {rel,rgba:rgba(rel,amplitude,q.ramp)};
}
function downsample(input,width,height){const w=Math.ceil(width/2),h=Math.ceil(height/2),out=new Float32Array(w*h);out.fill(NaN);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0,n=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const xx=x*2+dx,yy=y*2+dy;if(xx<width&&yy<height){const v=input[yy*width+xx];if(Number.isFinite(v)){sum+=v;n++}}}if(n)out[y*w+x]=sum/n}return out;}
return {compute,rgba,downsample,workerSource:'('+localReliefEngine.toString()+')()'};
});
