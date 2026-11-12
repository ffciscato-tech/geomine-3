/* Streaming BigTIFF writer: no whole-MDT RGBA allocation. Reduced IFDs are
   built bottom-up from the exact native-analysis values used on screen. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GeoMineTPIExport=api;})(typeof window==='undefined'?globalThis:window,function(){
'use strict';
const SIDE=512,TYPES={3:2,4:4,12:8,16:8},encoder=new TextEncoder();
function encode(type,values){if(type===2)return typeof values==='string'?encoder.encode(values+'\0'):values;const bytes=new Uint8Array(values.length*TYPES[type]),d=new DataView(bytes.buffer);values.forEach((v,i)=>{const o=i*TYPES[type];if(type===3)d.setUint16(o,v,true);else if(type===4)d.setUint32(o,v,true);else if(type===12)d.setFloat64(o,v,true);else d.setBigUint64(o,BigInt(v),true)});return bytes;}
async function compress(raw){const stream=new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'));return new Uint8Array(await new Response(stream).arrayBuffer());}
function predictor(bytes,samples=4){const b=bytes.slice();for(let y=0;y<SIDE;y++)for(let x=SIDE*samples-1;x>=samples;x--){const i=y*SIDE*samples+x;b[i]=(b[i]-b[i-samples])&255}return b;}
class Writer{
 constructor(sink,grid,params,{float=false,crs=31982,name='MDT'}={}){this.sink=sink;this.grid=grid;this.p=params;this.float=float;this.crs=crs;this.name=name;this.position=16;this.empty=null;this.levels=Array.from({length:4},(_,level)=>{const width=Math.ceil(grid.nc/(params.factor*2**level)),height=Math.ceil(grid.nr/(params.factor*2**level)),nx=Math.ceil(width/SIDE),ny=Math.ceil(height/SIDE);return {level,width,height,nx,ny,offsets:Array(nx*ny).fill(0),counts:Array(nx*ny).fill(0)}});}
 async begin(){const b=new Uint8Array(16),d=new DataView(b.buffer);b[0]=b[1]=73;d.setUint16(2,43,true);d.setUint16(4,8,true);await this.sink.write(b);}
 async append(bytes){const at=this.position;await this.sink.write(bytes);this.position+=bytes.length;return at;}
 async tile(level,x,y,rel,colors){const l=this.levels[level],i=y*l.nx+x;if(i<0||x>=l.nx||y>=l.ny)return;
 let valid=false;for(const v of rel)if(Number.isFinite(v)){valid=true;break}
 let encoded;if(!valid&&this.empty){l.offsets[i]=this.empty.offset;l.counts[i]=this.empty.length;return;}
 if(this.float){const raw=new Uint8Array(SIDE*SIDE*4),d=new DataView(raw.buffer);for(let k=0;k<rel.length;k++)d.setFloat32(k*4,Number.isFinite(rel[k])?rel[k]:-99999,true);encoded=await compress(raw);}else encoded=await compress(predictor(colors));
 const offset=await this.append(encoded);l.offsets[i]=offset;l.counts[i]=encoded.length;if(!valid)this.empty={offset,length:encoded.length};}
 tags(l){const g=this.grid,p=this.p,scale=2**l.level,north=g.yll+g.nr*g.csy,description=JSON.stringify({tool:'GeoMine TPI',source:this.name,factor:p.factor,radiusMeters:p.radius,amplitudeMeters:p.amplitude,ramp:p.ramp,sourceCRS:'EPSG:'+this.crs,method:'z minus valid neighborhood mean; majority-valid block aggregation; NaN transparent',overview:l.level?scale:1});
 const entries=[[254,4,[l.level?1:0]],[256,4,[l.width]],[257,4,[l.height]],[258,3,this.float?[32]:[8,8,8,8]],[259,3,[8]],[262,3,[this.float?1:2]],[270,2,description],[277,3,[this.float?1:4]],[284,3,[1]],[317,3,[this.float?1:2]],[322,4,[SIDE]],[323,4,[SIDE]],[324,16,l.offsets],[325,16,l.counts],[339,3,this.float?[3]:[1,1,1,1]],[33550,12,[g.cs*p.factor*scale,g.csy*p.factor*scale,0]],[33922,12,[0,0,0,g.xll,north,0]],[34735,3,[1,1,0,4,1024,0,1,1,1025,0,1,1,3072,0,1,this.crs,3076,0,1,9001]]];
 if(this.float)entries.push([42113,2,'-99999']);else entries.push([338,3,[2]]);return entries.sort((a,b)=>a[0]-b[0]);}
 async finish(){let first=0,previousNext=0;
 for(const l of this.levels){if(this.position%8)await this.append(new Uint8Array(8-this.position%8));const tags=this.tags(l),start=this.position,ifdBytes=8+tags.length*20+8;let extraAt=start+ifdBytes;const table=new Uint8Array(ifdBytes),d=new DataView(table.buffer),extras=[];d.setBigUint64(0,BigInt(tags.length),true);
 tags.forEach(([tag,type,values],i)=>{const bytes=encode(type,values),o=8+i*20;d.setUint16(o,tag,true);d.setUint16(o+2,type,true);d.setBigUint64(o+4,BigInt(type===2?bytes.length:values.length),true);if(bytes.length<=8)table.set(bytes,o+12);else{d.setBigUint64(o+12,BigInt(extraAt),true);extras.push(bytes);extraAt+=bytes.length;const pad=(8-extraAt%8)%8;if(pad){extras.push(new Uint8Array(pad));extraAt+=pad}}});
 await this.append(table);for(const b of extras)await this.append(b);if(!first)first=start;if(previousNext)await this.sink.writeAt(previousNext,encode(16,[start]));previousNext=start+ifdBytes-8;
 }await this.sink.writeAt(8,encode(16,[first]));await this.sink.close();}
 async abort(){await this.sink.abort?.();}
}
async function exportGrid({state,block,sinks,onProgress=()=>{},isCurrent=()=>true,engine}){
 const {g,p,sampler}=state,crs=Number(String(sampler.sourceCRS).replace(/^EPSG:/i,''));if(!Number.isInteger(crs)||crs<=0||crs>=32767)throw Error('CRS EPSG projetado não suportado na exportação TPI.');
 const writers=sinks.map(s=>new Writer(s.sink,g,p,{float:s.float,crs,name:state.r.name}));const levels=writers[0].levels,total=levels.reduce((n,l)=>n+l.nx*l.ny,0);let done=0;const started=performance.now();const check=()=>{if(!isCurrent())throw Object.assign(Error('Exportação TPI cancelada.'),{name:'AbortError'})};
 async function visit(level,x,y){check();const l=levels[level];if(x>=l.nx||y>=l.ny)return null;const rel=new Float32Array(SIDE*SIDE);rel.fill(NaN);
 if(level===0){const b=await block(state,x,y,isCurrent);if(b)for(let row=0;row<b.height;row++)rel.set(b.rel.subarray(row*b.width,(row+1)*b.width),row*SIDE);}else{
 for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const child=await visit(level-1,x*2+dx,y*2+dy);if(!child)continue;const reduced=engine.downsample(child,SIDE,SIDE);for(let row=0;row<256;row++)rel.set(reduced.subarray(row*256,(row+1)*256),(row+dy*256)*SIDE+dx*256);}
 }
 // Edges of reduced IFDs must not inherit padded cells outside their extent.
 const w=Math.min(SIDE,l.width-x*SIDE),h=Math.min(SIDE,l.height-y*SIDE);for(let yy=0;yy<SIDE;yy++)for(let xx=0;xx<SIDE;xx++)if(xx>=w||yy>=h)rel[yy*SIDE+xx]=NaN;
 check();const colors=engine.rgba(rel,p.amplitude,p.ramp);for(const writer of writers){await writer.tile(level,x,y,rel,colors);check()}done++;const elapsed=performance.now()-started;onProgress({done,total,elapsed,eta:done?elapsed*(total-done)/done:0,failures:state.failures.size});await new Promise(r=>setTimeout(r,0));return rel;
 }
 try{await Promise.all(writers.map(w=>w.begin()));const top=levels[3];for(let y=0;y<top.ny;y++)for(let x=0;x<top.nx;x++)await visit(3,x,y);check();for(const w of writers)await w.finish();return {tiles:done,failures:state.failures.size,crs};}catch(e){await Promise.allSettled(writers.map(w=>w.abort()));throw e;}
}
return {Writer,exportGrid,predictor,compress};
});
