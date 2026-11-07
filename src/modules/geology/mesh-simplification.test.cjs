const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
global.window=global;
require('../../vendor/meshopt-simplifier.js');
require('./mesh-simplification.js');require('./mesh-section-engine.js');require('./surpac-reader.js');
function sphere(segments=64,rings=32){
 const v=[[308000,7699000,900]],f=[],ix=(r,j)=>1+(r-1)*segments+(j+segments)%segments;
 for(let r=1;r<rings;r++)for(let j=0;j<segments;j++){const a=Math.PI*r/rings,b=2*Math.PI*j/segments;v.push([308000+100*Math.sin(a)*Math.cos(b),7699000+70*Math.sin(a)*Math.sin(b),800+100*Math.cos(a)]);}
 const bottom=v.length;v.push([308000,7699000,700]);
 for(let j=0;j<segments;j++){f.push([0,ix(1,j),ix(1,j+1)]);for(let r=1;r<rings-1;r++)f.push([ix(r,j),ix(r+1,j),ix(r+1,j+1)],[ix(r,j),ix(r+1,j+1),ix(r,j+1)]);f.push([bottom,ix(rings-1,j+1),ix(rings-1,j)]);}
 return {name:'Corpo de teste',objectId:7,trisolationId:3,vertices:v,faces:f};
}
(async()=>{
 const mesh=sphere(),parsed={meshes:[mesh],warnings:[]},before=JSON.stringify(parsed),api=GeoMineMeshSimplification;
 assert.equal(await api.prepare(parsed,{mode:'integral'}),parsed);
 const result=await api.prepare(parsed,{mode:'simplified',detail:10}),m=result.meshes[0];
 assert.equal(JSON.stringify(parsed),before);assert.equal(result.meshes.length,1);assert(m.faces.length<mesh.faces.length);assert(m.faces.length>0);
 const original=new Set(mesh.vertices.map(v=>v.join(',')));assert(m.vertices.every(v=>original.has(v.join(','))));assert.equal(m.objectId,7);assert.equal(m.trisolationId,3);
 assert.equal(m.source.simplification.originalFaces,mesh.faces.length);assert.match(m.source.simplification.purpose,/visualização/);
 const originalCut=GeoMineMeshSections.cut(mesh,[[307800,7699000],[308200,7699000]]),displayCut=GeoMineMeshSections.cut(m,[[307800,7699000],[308200,7699000]]);
 assert(originalCut.fillPolygons.length>0);assert.equal(displayCut.fillPolygons.length,0);assert.equal(displayCut.displayOnly,true);assert(displayCut.polylines.length>0);
 const multi=await api.prepare({meshes:[mesh,{...sphere(8,4),name:'Corpo pequeno',objectId:9}]},{mode:'simplified',detail:1});assert.equal(multi.meshes.length,2);assert(multi.meshes.every(m=>m.faces.length>0));
 for(const detail of [0,101,NaN])await assert.rejects(()=>api.prepare(parsed,{mode:'simplified',detail}),/detalhe/i);
 await assert.rejects(()=>api.prepare({meshes:[{...mesh,vertices:[[NaN,1,2]]}]},{mode:'simplified'}),/Coordenada inválida/);
 global.S={workCRS:'EPSG:31983',layers:[],groups:[],stack:[],geology:{meshes:[]}};global.gid=1;let next=1;
 global.proj4=require('../../vendor/proj4.min.js');proj4.defs('EPSG:31983','+proj=utm +zone=23 +south +ellps=GRS80 +units=m');
 global.GeoMineGeology={state:()=>S.geology,ensureGroup:()=>({id:1})};global.drawLayer=global.refreshUI=global.zApply=()=>{};
 global.addLayer=o=>{const l={...o,id:next++,sym:{},visible:true};S.layers.push(l);return l;};
 require('./geological-meshes.js');
 const imported=GeoMineGeology.meshes.__test.commitParsed(result,{crs:'EPSG:31983',unitsConfirmed:true,names:['Fosfato'],groupName:'Fosfato',dtmName:'teste.dtm',strName:'teste.str'}).meshes[0];
 assert.equal(S.layers.length,2);assert.equal(S.groups[0].name,'Fosfato');assert.deepEqual(imported.source.simplification,m.source.simplification);
 const renamed=GeoMineGeology.meshes.rename(imported.id,'Fosfato Manuela');assert.match(renamed,/Fosfato Manuela/);assert.match(renamed,/visualização simplificada/);assert(S.layers.every(l=>l.name.startsWith(renamed)));
 assert.equal(imported.source.dtmName,'teste.dtm');assert.throws(()=>GeoMineGeology.meshes.rename(imported.id,'  '),/nome/);
 const saved=JSON.parse(JSON.stringify(S));assert(saved.layers.every(l=>l._geology.simplifiedForVisualization));assert(saved.geology.meshes[0].source.simplification);
 const str='teste.str,25-Oct-26,,\n0,0,0,0\n1,0,0,0\n1,0,1,0\n1,1,0,0\n0,0,0,0,END\n';
 const dtm='teste.str,25-Oct-26,,\nOBJECT,1\nTRISOLATION,1\n1,1,2,3\nEND\n';
 assert.throws(()=>GeoMineSurpacReader.parsePair(dtm,str),/END/);assert.equal(GeoMineSurpacReader.parsePair(dtm,str,{allowRecordEnd:true}).meshes.length,1);
 let workerResult;global.self={crypto:require('node:crypto').webcrypto,postMessage:r=>{if(r.result)workerResult=r.result;if(r.error)throw Error(r.error);}};
 GeoMineGeology.meshes.__test.meshWorkerJob();
 await self.onmessage({data:{dtm:new TextEncoder().encode(dtm).buffer,str:new TextEncoder().encode(str).buffer,names:{dtmName:'teste.dtm',strName:'teste.str',files:[{kind:'dtm',name:'teste.dtm'},{kind:'str',name:'teste.str'}]},settings:{mode:'simplified',detail:10}}});
 assert(workerResult);assert.equal(workerResult.meshes[0].source.files.length,2);assert(workerResult.meshes[0].source.files.every(f=>/^[a-f0-9]{64}$/.test(f.sha256)));
 if(process.argv.includes('--fixtures')){
  const out=process.argv[process.argv.indexOf('--fixtures')+1];fs.mkdirSync(out,{recursive:true});
  const pairSTR='corpo_teste.str,25-Oct-26,,\n0,0,0,0\n'+mesh.vertices.map(p=>`1,${p[1]},${p[0]},${p[2]}`).join('\n')+'\n0,0,0,0,END\nEND\n';
  const pairDTM='corpo_teste.str,25-Oct-26,,\nOBJECT,7,Corpo de teste\nTRISOLATION,3,Fosfato de teste\n'+mesh.faces.map((f,i)=>`${i+1},${f.map(v=>v+1).join(',')}`).join('\n')+'\nEND\n';
  fs.writeFileSync(path.join(out,'corpo_teste.str'),pairSTR);fs.writeFileSync(path.join(out,'corpo_teste.dtm'),pairDTM);
 }
 console.log(JSON.stringify({status:'PASS',originalFaces:mesh.faces.length,displayFaces:m.faces.length,checks:['integral intacto','XYZ originais exatos','componentes preservados','seções simplificadas sem preenchimento','renomear duas camadas','origem e metadados persistentes','STR com END em registro','worker com SHA256']}));
})().catch(e=>{console.error(e);process.exitCode=1;});
