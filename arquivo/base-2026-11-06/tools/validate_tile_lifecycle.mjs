import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'src/core/parts/20-raster-dem.js'),'utf8');
function declaration(name){
  const start=source.indexOf(`function ${name}(`),end=source.indexOf('\n}',start);
  assert.ok(start>=0&&end>start,`${name} precisa existir`);return source.slice(start,end+2);
}
function grid(){
  const listeners={};
  return {_tiles:{},options:{},on(type,handler){listeners[type]=handler;},
    emit(type,event={}){listeners[type]?.(event);},setOpacity(value){this.opacity=value;},
    redraw(){this.redraws=(this.redraws||0)+1;},_tileCoordsToKey:c=>`${c.x}:${c.y}:${c.z}`};
}
function canvas(width=256,marker=0){
  const c={width,height:width,marker};c.getContext=()=>({drawImage(source,x,y){
    assert.equal(x,0);assert.equal(y,0);c.marker=source.marker;c.drawnFrom=source;}});return c;
}
function harness(mobile=false){
  const S={img:{_cache:new Map()},_hdFails:3},map={zoom:17,center:{x:10*256+128,y:20*256+128},
    getZoom(){return this.zoom;},getCenter(){return this.center;},project(center){return center;},
    hasLayer:()=>true,removeLayer:g=>g.emit('remove')};
  const context={S,map,EH_MOVEL:mobile,_demGrids:new Map(),_orthoGrid:null,_hdOn:true,_hdKey:'antes',_tileFails:3};
  vm.createContext(context);
  vm.runInContext(['rasterTileJob','rasterTileCacheGet','rasterTileCachePut','rasterTileBindLifecycle',
    'rasterTileFinish','demTilesRefresh','orthoHDReset'].map(declaration).join('\n'),context);
  return context;
}
let checks=0;
function check(name,test){test();checks++;console.log('OK · '+name);}
const coords={x:10,y:20,z:17};

check('trabalho de tile observa zoom, fonte, epoch e descarregamento',()=>{
  const h=harness(),g=grid(),cv=canvas();let sourceCurrent=true;
  const job=h.rasterTileJob(g,cv,coords,()=>sourceCurrent);
  assert.equal(job.isCurrent(),true);assert.equal(job.priority(),0);
  h.map.zoom=18;assert.equal(job.isCurrent(),false);h.map.zoom=17;
  sourceCurrent=false;assert.equal(job.isCurrent(),false);sourceCurrent=true;
  g._tileEpoch=1;assert.equal(job.isCurrent(),false);g._tileEpoch=0;
  cv._tileCancelled=true;assert.equal(job.isCurrent(),false);
});
check('prioridade acompanha o centro da vista sem refazer o trabalho',()=>{
  const h=harness(),g=grid();
  const near=h.rasterTileJob(g,canvas(),coords,()=>true);
  const far=h.rasterTileJob(g,canvas(),{...coords,x:12},()=>true);
  assert.ok(near.priority()<far.priority());h.map.center.x+=2*256;
  assert.ok(far.priority()<near.priority());
});
check('cache pronto reutiliza canvas e separa zoom, posição e resolução retina',()=>{
  const h=harness(),g=grid(),original=canvas(256,99),target=canvas();
  h.rasterTileCachePut(g,original,coords);assert.equal(h.rasterTileCacheGet(g,target,coords),true);
  assert.equal(target.marker,99);assert.equal(target.drawnFrom,original);
  assert.equal(h.rasterTileCacheGet(g,canvas(512),coords),false);
  assert.equal(h.rasterTileCacheGet(g,canvas(),{...coords,x:11}),false);
  assert.equal(h.rasterTileCacheGet(g,canvas(),{...coords,z:18}),false);
});
for(const mobile of [false,true])check('cache pronto é limitado e LRU no '+(mobile?'tablet':'computador'),()=>{
  const h=harness(mobile),g=grid(),count=mobile?4:16;
  for(let x=0;x<count;x++)h.rasterTileCachePut(g,canvas(512,x),{...coords,x});
  assert.equal(g._readyTileBytes,count*1024*1024);
  assert.equal(h.rasterTileCacheGet(g,canvas(512),{...coords,x:0}),true);
  h.rasterTileCachePut(g,canvas(512,100),{...coords,x:count});
  assert.equal(g._readyTileBytes,count*1024*1024);assert.equal(g._readyTileCache.size,count);
  assert.equal(h.rasterTileCacheGet(g,canvas(512),{...coords,x:0}),true);
  assert.equal(h.rasterTileCacheGet(g,canvas(512),{...coords,x:1}),false);
});
check('tileunload cancela só o canvas retirado; remove invalida grade e cache',()=>{
  const h=harness(),g=grid(),cv=canvas();h.rasterTileBindLifecycle(g);
  const job=h.rasterTileJob(g,cv,coords,()=>true);h.rasterTileCachePut(g,cv,coords);
  g.emit('tileunload',{tile:cv});assert.equal(job.isCurrent(),false);
  assert.equal(g._readyTileCache.size,1,'tile pronto pode ser reutilizado depois do pan');
  g.emit('remove');assert.equal(g._tileEpoch,1);assert.equal(g._readyTileCache.size,0);
  assert.equal(g._readyTileBytes,0);
});
check('callback antigo não conclui canvas novo com mesma chave x/y/z',()=>{
  const h=harness(),g=grid(),old=canvas(),newer=canvas();let done=0;
  const key=g._tileCoordsToKey(coords);g._tiles[key]={el:newer};
  h.rasterTileFinish(g,old,coords,()=>done++);assert.equal(done,0);
  h.rasterTileFinish(g,newer,coords,(err,actual)=>{assert.equal(err,null);assert.equal(actual,newer);done++;});
  assert.equal(done,1);delete g._tiles[key];
  h.rasterTileFinish(g,newer,coords,()=>done++);assert.equal(done,1);
});
check('editar estilo de MDT invalida todos os canvases antes de redraw',()=>{
  const h=harness(),g=grid(),r={id:8,style:{opacity:0.45}},cv=canvas();
  h._demGrids.set('8',g);h.rasterTileCachePut(g,cv,coords);
  const job=h.rasterTileJob(g,cv,coords,()=>true);
  assert.equal(h.demTilesRefresh(r),true);assert.equal(g.opacity,0.45);assert.equal(g.redraws,1);
  assert.equal(job.isCurrent(),false);assert.equal(g._readyTileBytes,0);assert.equal(g._readyTileCache.size,0);
  assert.equal(h.demTilesRefresh({id:9}),false);
});
check('religar ou alterar máscara de ortofoto aposenta grade anterior e cache',()=>{
  const h=harness(),g=grid(),cv=canvas();h._orthoGrid=g;h.rasterTileBindLifecycle(g);
  h.rasterTileCachePut(g,cv,coords);h.S.img._cache.set('janela',1);
  const job=h.rasterTileJob(g,cv,coords,()=>h._orthoGrid===g&&!g._retired);
  h.orthoHDReset();assert.equal(h._orthoGrid,null);assert.equal(g._retired,true);
  assert.equal(job.isCurrent(),false);assert.equal(g._readyTileBytes,0);assert.equal(g._readyTileCache.size,0);
  assert.equal(h.S.img._cache.size,0);assert.equal(h._tileFails,0);assert.equal(h.S._hdFails,0);
});
check('as duas grades usam finalização protegida e fallback checa job depois do await',()=>{
  const dem=declaration('syncDemTiles'),ortho=declaration('syncOrthoTiles');
  for(const [name,text] of [['MDT',dem],['ortofoto',ortho]]){
    assert.match(text,/rasterTileFinish\(gl,cv,coords,done\)/,name+' protege callbacks');
    assert.match(text,/rasterTileBindLifecycle\(/,name+' liga cancelamento');
    const fallback=text.indexOf(name==='MDT'?'await buildDemTile(cv,coords,R,true)':'await buildOrthoTile(cv, coords, px, true)');
    assert.ok(fallback>=0,name+' conserva fallback');
    assert.match(text.slice(fallback,fallback+260),/if\(!job\.isCurrent\(\)\)/,name+' descarta fallback obsoleto');
  }
});
console.log('Ciclo de vida dos tiles: '+checks+' cenários aprovados.');
