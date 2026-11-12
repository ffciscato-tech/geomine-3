import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const context=vm.createContext({});
for(const relative of ['src/core/project-state.js','src/core/layer-store.js','src/modules/ui/ribbon-registry.js'])
  vm.runInContext(read(relative),context,{filename:relative});
const {GeoMineProjectState:projects,GeoMineLayerStore:layers,GeoMineRibbon:ribbon}=context;
const plain=value=>JSON.parse(JSON.stringify(value));

// Projetos não compartilham coleções, ferramentas ou metadados por acidente.
const meta={crs:'EPSG:31982',name:'Levantamento'};
const a=projects.create({projectMeta:meta,touch:true}),b=projects.create();
assert.equal(a.projectMeta,meta);
assert.equal(a.workCRS,'EPSG:31982');
assert.equal(b.workCRS,'EPSG:31983');
assert.equal(a.touch,true);assert.equal(b.touch,false);
assert.match(a.projectId,/^gm_[a-z0-9]+_[a-z0-9]+$/);
assert.notEqual(a.projectId,b.projectId);
a.layers.push({id:1});a.groups.push({id:9});a.stack.push('L:1');a.drawBuf.push([1,2]);
for(const key of ['layers','groups','stack','drawBuf'])assert.equal(b[key].length,0,key);

// Vetores, raster, imagem e grupo vazio mantêm a mesma ordem visual.
const vector={id:1,llayer:{kind:'vector'},groupId:7};
const raster={id:2,overlay:{kind:'raster'},groupId:7};
const image={url:'preview',overlay:{kind:'image'}};
const state={layers:[vector],rasters:[raster],groups:[{id:7},{id:8}],img:image,stack:['R:2','L:1','I:0','G:8','L:999']};
assert.deepEqual(plain(layers.stackSync(state).map(n=>layers.nodeKey(n.t,n.id))),['R:2','L:1','I:0']);
assert.deepEqual(plain(state.stack),['R:2','L:1','I:0','G:8']);
assert.equal(layers.nodeLayer(layers.allNodes(state)[0]),vector.llayer);
assert.equal(layers.nodeLayer(layers.allNodes(state)[1]),raster.overlay);
const added={id:3};state.layers.push(added);
layers.stackSync(state);
assert.equal(state.stack[0],'L:3');
state.layers=[];state.rasters=[];state.img=null;state.groups=[{id:12}];
assert.deepEqual(plain(layers.stackSync(state)),[]);
assert.deepEqual(plain(state.stack),['G:12']);
// Reabrir um projeto substitui os arrays, sem deixar referências antigas.
state.layers=[{id:40}];state.groups=[];state.stack=['L:40'];
assert.deepEqual(plain(layers.allNodes(state).map(n=>n.id)),[40]);
assert.deepEqual(plain(layers.stackSync(state).map(n=>n.id)),[40]);
const other=projects.create();layers.stackSync(other);
assert.deepEqual(plain(state.stack),['L:40']);

// Registro por identidade evita encadear wrappers e aceita remoção segura.
const registry=ribbon.create(),calls=[],catalog=[];
const dispose=registry.register('a',cats=>{assert.equal(cats,catalog);calls.push('a');});
registry.register('b',()=>calls.push('b'));
registry.prepare(catalog);assert.deepEqual(calls,['a','b']);
registry.register('a',()=>calls.push('a2'));
dispose(); // um descarte antigo não pode remover o registro substituto.
registry.prepare(catalog);assert.deepEqual(calls,['a','b','a2','b']);
const remove=registry.register('c',()=>calls.push('c'));remove();
registry.prepare(catalog);assert.deepEqual(calls.slice(-2),['a2','b']);
assert.throws(()=>registry.register('',()=>{}),{name:'TypeError'});
assert.throws(()=>registry.register('invalid',null),{name:'TypeError'});
const deferred=ribbon.create(),events=[];
deferred.register('first',()=>{events.push('first');deferred.register('later',()=>events.push('later'));});
deferred.prepare([]);assert.deepEqual(events,['first']);
deferred.prepare([]);assert.deepEqual(events,['first','first','later']);

// A fonte modular precisa estar efetivamente presente no HTML distribuído.
const manifest=JSON.parse(read('src/module-order.json'));
const assembled=manifest.assets.flatMap(asset=>asset.parts||[asset.path]);
for(const file of ['core/project-state.js','core/layer-store.js','modules/ui/ribbon-registry.js',
  'modules/ui/ribbon-catalog.js','modules/ui/ribbon-renderer.js','modules/ui/ribbon-png-icons.js'])
  assert.ok(assembled.includes(file),file+' precisa entrar na montagem');
const bundle=read(manifest.output);
for(const token of ['root.GeoMineProjectState=','root.GeoMineLayerStore=','root.GeoMineRibbon='])
  assert.ok(bundle.includes(token),token+' ausente no HTML final');
assert.doesNotMatch(read('src/modules/environmental/thalweg.js'),/root\.ribbonBuild\s*=/);
console.log('OK: estado isolado, pilha mista, reabertura de projeto, registro de extensões e integração no HTML offline.');
