#!/usr/bin/env node
'use strict';

/* Auditoria independente da cubagem entre cada PDE e os MDTs do projeto.
   Reproduz a amostragem bilinear e a integração em células de 1 m usadas pelo
   módulo de cubagem do CCMGIS. */

const fs=require('node:fs');

const projectPath=process.argv[2];
if(!projectPath){
  console.error('Uso: node tools/calc_pde_volumes.js projeto.ccmgis');
  process.exit(2);
}

const project=JSON.parse(fs.readFileSync(projectPath,'utf8'));
const rasters=(project.rasters||[]).filter(r=>r&&r.d&&r.d.z);
const pdes=rasters.filter(r=>/^PDE\d+$/i.test(String(r.name||'')));
const terrenos=rasters.filter(r=>/^(MDT|MDE)(?:\b|_)/i.test(String(r.name||'')));

function decodeRaster(r){
  if(r.d._decoded)return r;
  const raw=Buffer.from(r.d.z,'base64');
  const ab=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
  r.d._decoded=new Float32Array(ab);
  return r;
}

function rasterBounds(r){
  const d=r.d, csy=d.csy||d.cs;
  return [d.xll,d.yll,d.xll+d.nc*d.cs,d.yll+d.nr*csy];
}

function sampleZbil(d,x,y){
  const z=d._decoded;
  const gc=(x-d.xll)/d.cs-0.5;
  const gr=(d.nr-0.5)-(y-d.yll)/d.cs;
  let c0=Math.floor(gc), r0=Math.floor(gr);
  if(c0 < -1 || r0 < -1 || c0 > d.nc-1 || r0 > d.nr-1)return NaN;
  const tx=gc-c0, ty=gr-r0;
  const c1=c0+1, r1=r0+1;
  const cc0=Math.max(0,Math.min(d.nc-1,c0));
  const cc1=Math.max(0,Math.min(d.nc-1,c1));
  const rr0=Math.max(0,Math.min(d.nr-1,r0));
  const rr1=Math.max(0,Math.min(d.nr-1,r1));
  const pts=[
    [rr0*d.nc+cc0,(1-tx)*(1-ty)],
    [rr0*d.nc+cc1,tx*(1-ty)],
    [rr1*d.nc+cc0,(1-tx)*ty],
    [rr1*d.nc+cc1,tx*ty]
  ];
  let sum=0, sw=0;
  for(const [k,w] of pts){
    const v=z[k];
    if(Number.isFinite(v)){sum+=v*w;sw+=w;}
  }
  return sw>0.05?sum/sw:NaN;
}

function designAreaAtResolution(projeto,res){
  decodeRaster(projeto);
  const b=rasterBounds(projeto);
  const nx=Math.ceil((b[2]-b[0])/res)+1;
  const ny=Math.ceil((b[3]-b[1])/res)+1;
  let cells=0;
  let row0=new Float64Array(nx), row1=new Float64Array(nx);
  const fill=(row,y)=>{
    for(let i=0;i<nx;i++)row[i]=sampleZbil(projeto.d,b[0]+i*res,y);
  };
  fill(row0,b[1]);
  for(let j=0;j<ny-1;j++){
    fill(row1,b[1]+(j+1)*res);
    for(let i=0;i<nx-1;i++){
      if(Number.isFinite(row0[i])&&Number.isFinite(row0[i+1])&&
         Number.isFinite(row1[i])&&Number.isFinite(row1[i+1]))cells++;
    }
    const tmp=row0;row0=row1;row1=tmp;
  }
  return cells*res*res;
}

function volumeBetween(projeto,terreno,res,designArea){
  const fontes=Array.isArray(terreno)?terreno:[terreno];
  decodeRaster(projeto);fontes.forEach(decodeRaster);
  const bp=rasterBounds(projeto), limites=fontes.map(rasterBounds);
  const bt=[
    Math.min(...limites.map(b=>b[0])),Math.min(...limites.map(b=>b[1])),
    Math.max(...limites.map(b=>b[2])),Math.max(...limites.map(b=>b[3]))
  ];
  const sampleTerrain=(x,y)=>{
    for(const fonte of fontes){
      const z=sampleZbil(fonte.d,x,y);
      if(Number.isFinite(z))return z;
    }
    return NaN;
  };
  const x0=Math.max(bp[0],bt[0]), y0=Math.max(bp[1],bt[1]);
  const x1=Math.min(bp[2],bt[2]), y1=Math.min(bp[3],bt[3]);
  if(!(x1>x0&&y1>y0))return {overlap:false,area:0,coverage:0};
  const nx=Math.ceil((x1-x0)/res)+1;
  const ny=Math.ceil((y1-y0)/res)+1;
  let cells=0,absolute=0,fill=0,cut=0,minDz=Infinity,maxDz=-Infinity;
  let p0=new Float64Array(nx),p1=new Float64Array(nx);
  let t0=new Float64Array(nx),t1=new Float64Array(nx);
  const fillRow=(rp,rt,y)=>{
    for(let i=0;i<nx;i++){
      const x=x0+i*res;
      rp[i]=sampleZbil(projeto.d,x,y);
      rt[i]=sampleTerrain(x,y);
    }
  };
  fillRow(p0,t0,y0);
  for(let j=0;j<ny-1;j++){
    fillRow(p1,t1,y0+(j+1)*res);
    for(let i=0;i<nx-1;i++){
      const dz=[p0[i]-t0[i],p0[i+1]-t0[i+1],p1[i]-t1[i],p1[i+1]-t1[i+1]];
      if(!dz.every(Number.isFinite))continue;
      const mean=(dz[0]+dz[1]+dz[2]+dz[3])/4;
      const meanAbs=(Math.abs(dz[0])+Math.abs(dz[1])+Math.abs(dz[2])+Math.abs(dz[3]))/4;
      const a=res*res;
      cells++; absolute+=meanAbs*a;
      if(mean>=0)fill+=mean*a; else cut+=-mean*a;
      for(const v of dz){if(v<minDz)minDz=v;if(v>maxDz)maxDz=v;}
    }
    [p0,p1]=[p1,p0];[t0,t1]=[t1,t0];
  }
  const area=cells*res*res;
  return {
    overlap:true, area, coverage:designArea?area/designArea:0,
    absolute, fill, cut, mean:area?absolute/area:0,
    minDz:Number.isFinite(minDz)?minDz:null,
    maxDz:Number.isFinite(maxDz)?maxDz:null
  };
}

const res=1;
const results=[];
for(const pde of pdes.sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}))){
  const designArea=designAreaAtResolution(pde,res);
  for(const terreno of terrenos){
    const stats=volumeBetween(pde,terreno,res,designArea);
    results.push({pde:pde.name,terreno:terreno.name,res,designArea,...stats});
  }
}

const byName=name=>rasters.find(r=>r.name===name);
const mosaicPlans={
  PDE1:['MDT_MorroVerde_18Maio26','MDT_MV_area_complementar_08jul26'],
  PDE2:['MDT_MV_area_complementar_08jul26'],
  PDE3:['MDT_MV_area_complementar_08jul26','MDT_MorroVerde_18Maio26'],
  PDE4:['MDE Terrain Tiles — 21/08/2026']
};
const mosaics=[];
for(const pde of pdes){
  const fontes=(mosaicPlans[pde.name]||[]).map(byName).filter(Boolean);
  if(!fontes.length)continue;
  const designArea=designAreaAtResolution(pde,res);
  mosaics.push({pde:pde.name,terrenos:fontes.map(r=>r.name),res,designArea,
    ...volumeBetween(pde,fontes,res,designArea)});
}

console.log(JSON.stringify({savedAt:project.savedAt,results,mosaics},null,2));
