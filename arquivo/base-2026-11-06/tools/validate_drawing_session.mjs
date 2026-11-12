import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const core=source('src/core/parts/08-selection-and-drawing.js');
const region=(text,start,end)=>{
 const a=text.indexOf(start),b=text.indexOf(end,a);assert.ok(a>=0&&b>a,'source anchors');return text.slice(a,b);
};
const finishCode=region(core,'function finishDraw(options={}){','/* CONTINUAR DESENHO');
const continuationCode=region(core,'function continuarAlvo(alvo){','/* botão flutuante');
const addFeatureCode=region(core,'function addFeature(L, geomInCRS, multi, options={}){','/* formulário rápido');
const clone=x=>JSON.parse(JSON.stringify(x));
function layer(id,gtype='line',crs='EPSG:31982'){
 return {id,name:'Camada '+id,gtype,crs,visible:true,features:[],fields:[{name:'FID',type:'N'}]};
}
function fixture(tool='line'){
 const a=layer(1,tool==='poly'?'polygon':'line'),b=layer(2,tool==='poly'?'polygon':'line','EPSG:31983');
 const calls={toasts:[],clear:0,redraw:0,refresh:0,draw:[],undo:[],permission:[],crs:[],forms:[]};
 const c={console,setTimeout,clearTimeout,JSON,Date,Math,Number,Array,Map,Set,
  S:{projectId:'project-a',workCRS:'EPSG:31982',tool,activeId:1,layers:[a,b],drawBuf:[],rasters:[],undo:[],_continuando:null,
   drawLayer:{clearLayers(){calls.clear++;}}},
  activeLayer:()=>c.S.layers.find(L=>L.id===c.S.activeId)||null,
  toast:m=>calls.toasts.push(m),
  collabCanEditLayer:(L,notify)=>{calls.permission.push([L,notify]);return !L.denied;},
  fromWGS:(crs,x,y)=>{calls.crs.push(crs);return [x,y];},toWGS:(_crs,x,y)=>[x,y],
  GeoMineOrtho:{clearPreview(){},closeCorner(){}},
  redrawDraw(){calls.redraw++;},drawLayer:L=>calls.draw.push(L),refreshUI:()=>calls.refresh++,
  undoPush:a=>calls.undo.push(a),openFeatForm:(L,f)=>calls.forms.push([L,f]),
  continuarChip(){},GeoMineSessionAutosave:{markDirty(){}},
  setTool(t){c.S.tool=t;c.clearDraw();},
 };
 c.window=c;vm.createContext(c);
 vm.runInContext(source('src/modules/cad/drawing-session.js'),c);
 vm.runInContext(finishCode+'\n'+continuationCode+'\n'+addFeatureCode,c);
 const api=c.GeoMineDrawingSession;
 function begin(points=[[10,20],[11,21]]){assert.equal(api.acquire(),a);c.S.drawBuf=clone(points);}
 return {c,a,b,calls,api,begin};
}
const tests=[];const test=(name,fn)=>tests.push([name,fn]);

test('the first vertex pins the actual layer object without changing selection',()=>{
 const f=fixture();assert.equal(f.api.layer(),f.a);assert.equal(f.api.acquire(),f.a);f.c.S.activeId=f.b.id;assert.equal(f.api.layer(),f.a);assert.equal(f.api.acquire(),f.a);assert.equal(f.c.S.activeId,f.b.id);assert.equal(f.c.S.drawBuf.length,0);
});
test('querying an MDT and toggling visibility preserves owner and vertices',()=>{
 const f=fixture();f.begin();const before=clone(f.c.S.drawBuf);f.c.S.activeId=null;f.c.S.selRaster={id:3,visible:false};f.a.visible=false;
 assert.equal(f.api.acquire(),f.a);assert.deepEqual(clone(f.c.S.drawBuf),before);assert.equal(f.c.finishDraw(),true);assert.equal(f.a.features.length,1);assert.equal(f.b.features.length,0);assert.equal(f.c.S.drawBuf.length,0);
});
test('changing selected vector does not redirect geometry or its CRS',()=>{
 const f=fixture();f.begin();f.c.S.activeId=f.b.id;assert.equal(f.c.finishDraw(),true);assert.equal(f.a.features.length,1);assert.equal(f.b.features.length,0);assert.deepEqual(clone(f.a.features[0].geom),[[20,10],[21,11]]);assert.ok(f.calls.crs.every(crs=>crs===f.a.crs));
});
test('a new sketch can use the newly selected layer after successful completion',()=>{
 const f=fixture();f.begin();f.c.S.activeId=f.b.id;assert.equal(f.c.finishDraw(),true);assert.equal(f.c.S.activeId,f.a.id);f.c.S.activeId=f.b.id;assert.equal(f.api.acquire(),f.b);
});
test('lock after first vertex refuses commit without deleting the draft',()=>{
 const f=fixture();f.begin();const before=clone(f.c.S.drawBuf);f.a.locked=true;assert.equal(f.c.finishDraw(),false);assert.deepEqual(clone(f.c.S.drawBuf),before);assert.equal(f.a.features.length,0);f.a.locked=false;assert.equal(f.c.finishDraw(),true);
});
test('collaboration denial after first vertex preserves the draft and reports on its owner',()=>{
 const f=fixture();f.begin();const before=clone(f.c.S.drawBuf);f.c.S.activeId=f.b.id;f.a.denied=true;assert.equal(f.c.finishDraw(),false);assert.deepEqual(clone(f.c.S.drawBuf),before);assert.ok(f.calls.permission.some(([L,notify])=>L===f.a&&notify));assert.equal(f.calls.undo.length,0);
});
test('an initially unavailable or wrong-type destination cannot acquire a session',()=>{
 const f=fixture();f.c.S.activeId=null;assert.equal(f.api.acquire(),null);f.c.S.activeId=f.a.id;f.a.gtype='polygon';assert.equal(f.api.acquire(),null);f.c.S.activeId=f.b.id;assert.equal(f.api.acquire(),f.b);
});
test('an initially locked destination cannot pin a later valid selection',()=>{
 const f=fixture();f.a.locked=true;assert.equal(f.api.acquire(),null);f.c.S.activeId=f.b.id;assert.equal(f.api.acquire(),f.b);
});
test('deleted destination rejects same-id replacement rather than rebinding',()=>{
 const f=fixture();f.begin();const replacement=layer(f.a.id);f.c.S.layers=[replacement,f.b];f.c.S.activeId=replacement.id;assert.equal(f.api.layer(),null);assert.equal(f.c.finishDraw(),false);assert.equal(replacement.features.length,0);assert.equal(f.c.S.drawBuf.length,2);
});
test('project change rejects a reused layer id and even a retained object',()=>{
 for(const replace of [false,true]){const f=fixture();f.begin();f.c.S.projectId='project-b';if(replace)f.c.S.layers=[layer(f.a.id),f.b];assert.equal(f.api.layer(),null);assert.equal(f.c.finishDraw(),false);assert.equal(f.c.S.drawBuf.length,2);assert.equal(f.a.features.length,0);}
});
test('changed destination CRS refuses reinterpretation of the stored draft',()=>{
 const f=fixture();f.begin();f.a.crs='EPSG:4326';assert.equal(f.api.layer(),null);assert.equal(f.c.finishDraw(),false);assert.equal(f.c.S.drawBuf.length,2);assert.equal(f.calls.crs.length,0);
});
test('changed geometry type or tool cannot inherit a former sketch',()=>{
 for(const change of ['gtype','tool']){const f=fixture();f.begin();if(change==='gtype')f.a.gtype='polygon';else f.c.S.tool='poly';assert.equal(f.api.layer(),null);assert.equal(f.api.acquire(),null);assert.equal(f.c.S.drawBuf.length,2);}
});
test('clearDraw releases owner, preview and continuation together',()=>{
 const f=fixture();f.begin();f.c.S._continuando={L:f.a};f.c.clearDraw();assert.equal(f.c.S.drawBuf.length,0);assert.equal(f.c.S._continuando,null);assert.equal(f.calls.clear,1);f.c.S.activeId=f.b.id;assert.equal(f.api.acquire(),f.b);
});
test('the original insufficient-vertices cancellation releases the owner',()=>{
 const f=fixture();f.begin([[1,2]]);assert.equal(f.c.finishDraw(),false);assert.equal(f.c.S.drawBuf.length,0);f.c.S.activeId=f.b.id;assert.equal(f.api.acquire(),f.b);
});
test('null addFeature result does not clear or complete a sketch',()=>{
 const f=fixture();f.begin();const before=clone(f.c.S.drawBuf);f.c.addFeature=()=>null;assert.equal(f.c.finishDraw(),false);assert.deepEqual(clone(f.c.S.drawBuf),before);assert.equal(f.calls.clear,0);assert.equal(f.c.S._ultimoDesenho,undefined);assert.equal(f.api.layer(),f.a);
});
test('real addFeature second permission check can refuse without clearing the sketch',()=>{
 const f=fixture();f.begin();let checks=0;f.c.collabCanEditLayer=()=>++checks===1;assert.equal(f.c.finishDraw(),false);assert.equal(f.a.features.length,0);assert.equal(f.c.S.drawBuf.length,2);assert.equal(f.calls.undo.length,0);
});
test('polygon completion retains destination and closes its ring explicitly',()=>{
 const f=fixture('poly');f.begin([[0,0],[0,2],[2,2]]);f.c.S.activeId=null;assert.equal(f.c.finishDraw(),true);const geom=clone(f.a.features[0].geom);assert.deepEqual(geom,[[[0,0],[2,0],[2,2],[0,0]]]);assert.equal(f.a.features[0].multi,true);
});
test('continuation pins the original feature and preserves its attributes and old elevations',()=>{
 const f=fixture();const feature={geom:[[20,10],[21,11]],multi:false,props:{name:'keep'},zg:[100,101]};f.a.features.push(feature);
 assert.equal(f.c.continuarDesenho({L:f.a,f:feature}),true);const old=clone(feature);f.c.S.activeId=null;f.c.S.drawBuf.push([12,22]);assert.deepEqual(clone(feature),old);assert.equal(f.c.finishDraw(),true);assert.equal(f.a.features.length,1);assert.equal(f.a.features[0],feature);assert.deepEqual(clone(feature.geom),[[20,10],[21,11],[22,12]]);assert.deepEqual(clone(feature.props),{name:'keep'});assert.deepEqual(clone(feature.zg),[100,101,null]);assert.equal(f.calls.undo[0].t,'geom');assert.equal(f.c.S._continuando,null);
});
test('continuation denied before commit retains context and never mutates the feature',()=>{
 const f=fixture(),feature={geom:[[0,0],[1,1]],props:{keep:1},multi:false};f.a.features.push(feature);assert.equal(f.c.continuarDesenho({L:f.a,f:feature}),true);f.c.S.drawBuf.push([2,2]);const old=clone(feature),ctx=f.c.S._continuando;f.a.denied=true;assert.equal(f.c.finishDraw(),false);assert.deepEqual(clone(feature),old);assert.equal(f.c.S._continuando,ctx);assert.equal(f.c.S.drawBuf.length,3);assert.equal(f.calls.undo.length,0);
});
test('removed continuation feature must never be silently recreated as a new one',()=>{
 const f=fixture(),feature={geom:[[0,0],[1,1]],props:{},multi:false};f.a.features.push(feature);assert.equal(f.c.continuarDesenho({L:f.a,f:feature}),true);f.c.S.drawBuf.push([2,2]);f.a.features=[];const ctx=f.c.S._continuando;
 assert.equal(f.c.finishDraw(),false);assert.equal(f.a.features.length,0);assert.equal(f.c.S.drawBuf.length,3);assert.equal(f.c.S._continuando,ctx);
});
test('cancelling continuation keeps the committed original feature untouched',()=>{
 const f=fixture(),feature={geom:[[0,0],[1,1]],props:{keep:1},multi:false};f.a.features.push(feature);const old=clone(feature);assert.equal(f.c.continuarDesenho({L:f.a,f:feature}),true);f.c.S.drawBuf.push([2,2]);f.c.clearDraw();assert.deepEqual(clone(feature),old);assert.equal(f.a.features.length,1);assert.equal(f.calls.undo.length,0);f.c.S.activeId=f.b.id;assert.equal(f.api.acquire(),f.b);
});
test('real orthogonal input takes its CRS from the pinned layer, not the queried raster',()=>{
 const f=fixture();f.begin();f.c.S.activeId=null;f.c.S.orthoOn=true;f.c.S.snapOn=false;f.c.S.workCRS='EPSG:4326';f.c.L2={latLng:(a,b)=>Array.isArray(a)?{lat:a[0],lng:a[1]}:{lat:a,lng:b}};
 vm.runInContext(source('src/modules/cad/orthogonal.js'),f.c);f.c.GeoMineOrtho.drawing({lat:12,lng:25});assert.ok(f.calls.crs.length>0);assert.ok(f.calls.crs.every(crs=>crs===f.a.crs));
});
function drawingUndo(f){
 // Run the exact highest-priority branch, without unrelated history actions.
 const code=source('src/core/parts/09-measurement-properties-cad.js');
 vm.runInContext(region(code,'function doUndo(){','  const proxima=S.undo[S.undo.length-1];')+'\n}',f.c);
}
test('real drawing Undo validates owner A rather than incidentally selected denied B',()=>{
 const f=fixture();f.begin();f.b.denied=true;f.c.S.activeId=f.b.id;f.calls.permission=[];drawingUndo(f);f.c.doUndo();
 assert.deepEqual(clone(f.c.S.drawBuf),[[10,20]]);assert.equal(f.api.layer(),f.a);assert.equal(f.calls.redraw,1);assert.equal(f.calls.clear,0);
 assert.ok(f.calls.permission.some(([L])=>L===f.a));assert.ok(f.calls.permission.every(([L])=>L!==f.b));assert.equal(f.c.S.activeId,f.b.id);
});
test('real last-vertex Undo clears the owner and permits a new sketch in selected B',()=>{
 const f=fixture();f.begin([[10,20]]);f.c.S.activeId=f.b.id;f.c.S._continuando={L:f.a};drawingUndo(f);f.c.doUndo();
 assert.equal(f.c.S.drawBuf.length,0);assert.equal(f.c.S._continuando,null);assert.equal(f.calls.clear,1);assert.equal(f.api.layer(),f.b);assert.equal(f.api.acquire(),f.b);
 f.c.S.drawBuf=[[1,2],[3,4]];assert.equal(f.c.finishDraw(),true);assert.equal(f.a.features.length,0);assert.equal(f.b.features.length,1);
});
function keyHandlers(f,includeEnter=false){
 const handlers=[],node={classList:{contains:()=>false},style:{display:'none'}};
 f.c.document={activeElement:{tagName:'BODY'},querySelectorAll:()=>[],querySelector:()=>null,getElementById:()=>node,addEventListener:(type,fn)=>{if(type==='keydown')handlers.push(fn);}};f.c.ED={on:false};
 const layout=source('src/core/parts/17-layout-printing.js');
 if(includeEnter)vm.runInContext('(function(){\n'+region(layout,"document.addEventListener('keydown',e=>{\n    if(e.key==='Escape'){ const stC",'/* ESC universal:'),f.c);
 vm.runInContext(region(layout,'/* ESC universal:',"document.getElementById('workCRS').addEventListener"),f.c);
 const editor=source('src/core/parts/27-vector-editor.js');vm.runInContext(region(editor,'/* Esc UNIVERSAL (rede final)','/* ---------- ícones próprios'),f.c);
 return (key,target='BODY')=>{const e={key,target:{tagName:target},stopped:false,prevented:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};for(const handler of handlers){handler(e);if(e.stopped)break;}return e;};
}
test('real Escape chain stops after refused commit and cannot clear the preserved sketch',()=>{
 const f=fixture();f.begin();f.a.locked=true;const press=keyHandlers(f),event=press('Escape');assert.equal(event.stopped,true);assert.equal(f.c.S.tool,'line');assert.equal(f.c.S.drawBuf.length,2);assert.equal(f.a.features.length,0);assert.equal(f.calls.clear,0);assert.ok(!f.calls.toasts.some(t=>/Linha concluída|Ferramenta encerrada/.test(t)));
});
test('real Escape completes in the pinned layer before returning to selection',()=>{
 const f=fixture();f.begin();f.c.S.activeId=null;const press=keyHandlers(f);press('Escape');assert.equal(f.a.features.length,1);assert.equal(f.c.S.drawBuf.length,0);assert.equal(f.c.S.tool,'select');
});
test('real Enter refuses locked destination without clearing and ignores text inputs',()=>{
 const f=fixture();f.begin();f.a.locked=true;const press=keyHandlers(f,true);press('Enter');assert.equal(f.a.features.length,0);assert.equal(f.c.S.drawBuf.length,2);f.a.locked=false;press('Enter','INPUT');assert.equal(f.a.features.length,0);press('Enter');assert.equal(f.a.features.length,1);
});

test('chained command selects the completed owner and skips the attribute form',()=>{
 const f=fixture();f.begin();f.c.S.activeId=f.b.id;
 assert.equal(f.c.prepareDrawingCommand(),true);assert.equal(f.c.S.tool,'select');
 assert.equal(f.c.S.activeId,f.a.id);assert.equal(f.c.S.selFeat.layer,f.a);
 assert.equal(f.c.S.selFeat.idx,0);assert.equal(f.calls.forms.length,0);
 assert.equal(f.a.features.length,1);assert.equal(f.c.S.drawBuf.length,0);
});
test('chained command refuses incomplete or duplicate-only sketches without discarding them',()=>{
 for(const pts of [[[10,20]],[[10,20],[10,20]]]){
  const f=fixture();f.begin(pts);assert.equal(f.c.prepareDrawingCommand(),false);
  assert.deepEqual(clone(f.c.S.drawBuf),pts);assert.equal(f.a.features.length,0);
 }
});
test('chained command cannot bypass locks or create a replacement feature',()=>{
 const f=fixture();f.begin();f.a.locked=true;
 assert.equal(f.c.prepareDrawingCommand(),false);assert.equal(f.c.S.drawBuf.length,2);
 assert.equal(f.a.features.length,0);assert.equal(f.c.S.tool,'line');
});

let passed=0;const failures=[];for(const [name,run] of tests){try{await run();passed++;console.log('PASS '+name);}catch(error){failures.push(name);console.error('FAIL '+name+'\n'+error.stack);}}
console.log(`${passed}/${tests.length} drawing session tests passed`);if(failures.length)process.exitCode=1;
