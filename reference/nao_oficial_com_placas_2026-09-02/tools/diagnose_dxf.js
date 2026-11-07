#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),src=fs.readFileSync(path.join(root,
  'src/core/parts/04-vector-format-importers.js'),'utf8').split('const DXF_MAX_FACES')[0];
const ctx={console,Math,Number,Array,Object,parseInt,parseFloat,isFinite};
vm.createContext(ctx);vm.runInContext(src,ctx,{filename:'04-vector-format-importers.js'});
for(const file of process.argv.slice(2)){
  const text=fs.readFileSync(file,'utf8'),t0=performance.now(),r=ctx.parseDXF(text),ms=performance.now()-t0,
    all=r.lins.concat(r.pols,r.faces||[]),zs=all.flatMap(e=>(e.v||[]).map(p=>p[2]).filter(Number.isFinite)),
    xs=all.flatMap(e=>(e.v||[]).map(p=>p[0]).filter(Number.isFinite)),
    ys=all.flatMap(e=>(e.v||[]).map(p=>p[1]).filter(Number.isFinite)),
    layers={};
  for(const e of all)layers[e.lay]=(layers[e.lay]||0)+1;
  console.log(JSON.stringify({file:path.basename(file),bytes:Buffer.byteLength(text),parseMs:+ms.toFixed(1),
    points:r.pts.length,texts:r.txts.length,lines:r.lins.length,closedPolylines:r.pols.length,faces3D:(r.faces||[]).length,
    vertices:all.reduce((n,e)=>n+(e.v||[]).length,0),entities3D:all.filter(e=>(e.v||[]).some(p=>Number.isFinite(p[2]))).length,
    extent:xs.length?[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]:null,
    zRange:zs.length?[Math.min(...zs),Math.max(...zs)]:null,layers,
    ignored:{insert:r.warn.insert,mesh:r.warn.mesh,other:r.warn.outros}},null,2));
}
