// Bounded destination audit: real destination/live modules, synthetic data only.
// No browser, user project, persistence writes or network.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),plain=x=>JSON.parse(JSON.stringify(x));
let passed=0,failed=0;
function test(name,run){try{run();passed++;console.log('PASS '+name);}catch(error){failed++;console.error('FAIL '+name+'\n'+error.stack);}}
function harness(){
 let serial=0,layerId=100;
 const S={projectId:'destination-unit',workCRS:'EPSG:31982',layers:[],rasters:[],stack:[],undo:[],drawBuf:[],activeId:30};
 const c={S,ED:{on:false},console,AbortController,Date,JSON,Map,Set,WeakMap,WeakSet,Float32Array,Uint8Array,
  crypto:{randomUUID:()=>String(++serial)},setTimeout:()=>0,clearTimeout(){},document:{addEventListener(){}},addEventListener(){},
  messages:[],confirmations:0,confirmResult:true,drawCalls:0,failDrawAt:0,failAttach:false,
  toast:message=>c.messages.push(message),cmdLog(){},refreshUI(){},zApply(){},
  confirm:()=>{c.confirmations++;return c.confirmResult;},collabCanEditLayer:L=>!L?.denied,
  map:{removeLayer(){}},drawLayer:L=>{c.drawCalls++;if(c.failDrawAt===c.drawCalls)throw Error('draw fault');},
  undoPush:a=>{a._undoOrd=S.undo.length+1;S.undo.push(a);},
  addLayer:spec=>{const L={...spec,id:++layerId,visible:true,color:'#abc',weight:3,fill:.3,sym:{color:'#abc',fill:.3},llayer:{}};S.layers.push(L);S.stack.push('L:'+L.id);S.activeId=L.id;return L;}
 };
 c.window=c;
 c.GeoMineChannelExtraction={sourceSignature:r=>JSON.stringify(r.d),fields:features=>Object.keys(features[0].props).map(name=>({name,type:typeof features[0].props[name]==='number'?'N':'C'})),buildSpecs:v=>['line','polygon'].map(gtype=>({name:gtype,crs:v.q.crs,gtype,features:v.outputs.map(o=>({geom:gtype==='line'?[[o.index,0],[o.index,1]]:[[[o.index,0],[o.index+1,0],[o.index+1,1],[o.index,0]]],...(gtype==='polygon'?{multi:true}:{}),props:{EIXO:o.index,VALUE:v.q.o.height,STATUS:'ready'}}))}))};
 vm.createContext(c);
 for(const file of ['channel-live.js','channel-destination.js'])vm.runInContext(fs.readFileSync(path.join(root,'src/modules/environmental',file),'utf8'),c,{filename:file});
 const axis={id:30,name:'Source',crs:S.workCRS,gtype:'line',features:[{geom:[[0,0],[10,0]],props:{AXIS:'A'}},{geom:[[20,0],[30,0]],props:{AXIS:'B'}}],fields:[]};
 const raster={id:90,crs:S.workCRS,d:{nc:2,nr:2,cs:1,csy:1,xll:0,yll:0,z:Float32Array.of(0,1,2,3)}};
 S.layers.push(axis);S.rasters.push(raster);
 const D=c.GeoMineChannelDestination,live=c.GeoMineChannelLive;
 const view=(indices=[0],height=2,mode='axisDepth')=>({q:{L:axis,r:raster,crs:S.workCRS,rows:indices.map(i=>({f:axis.features[i],index:i+1})),o:{mode,height,interval:5,reach:10,searchLimited:true}},outputs:indices.map(i=>({index:i+1})),resolution:1});
 const save=(v,target=D.capture('auto'),automatic=true)=>{const release=live.suspend();try{return D.save(v,target,automatic);}finally{release();}};
 const state=()=>JSON.stringify({layers:S.layers.map(L=>({id:L.id,features:L.features,fields:L.fields,link:L._channelLink,crs:L.crs})),stack:S.stack,active:S.activeId,undo:S.undo.length});
 const legacy=()=>{const v=view([0,1]);axis.features.forEach((f,i)=>f._channelAxisId='legacy-axis-'+i);const specs=c.GeoMineChannelExtraction.buildSpecs(v),layers=specs.map(spec=>c.addLayer({...spec,fields:c.GeoMineChannelExtraction.fields(spec.features)}));live.attach(v,layers);return layers;};
 return {c,S,D,live,axis,raster,view,save,state,legacy};
}

test('new pair has per-axis recipes and a single atomic undo action',()=>{
 const h=harness(),out=h.save(h.view([0,1]));assert.equal(h.S.layers.length,3);assert.equal(h.S.undo.length,1);
 assert.ok(out.layers.every(L=>L._channelLink.version===2&&L._channelLink.entries.length===2));
 assert.equal(new Set(out.layers[0].features.map(f=>f._channelRecipeId)).size,2);
 assert.equal(h.D.undo(h.S.undo.at(-1)),true);assert.equal(h.S.layers.length,1);assert.equal(h.S.undo.length,0);assert.deepEqual(h.S.stack,[]);
});
test('append and replace preserve unrelated feature identity, fields, style and pair IDs',()=>{
 const h=harness(),a=h.save(h.view()),layers=a.layers,ids=layers.map(L=>L.id);
 h.save(h.view([1]));const b=layers.map(L=>L.features.find(f=>f.props.EIXO===2));
 layers.forEach(L=>{L.color='#123';L.fields.push({name:'USER_FIELD',type:'C',size:31});L.features.push({geom:[[99,99],[100,100]],props:{USER_FIELD:'untagged'}});});
 const untagged=layers.map(L=>L.features.at(-1));h.save(h.view([0],4));
 assert.deepEqual(layers.map(L=>L.id),ids);layers.forEach((L,i)=>{assert.ok(L.features.includes(b[i]));assert.ok(L.features.includes(untagged[i]));assert.equal(L.color,'#123');assert.equal(L.fields.find(f=>f.name==='USER_FIELD').size,31);assert.equal(L._channelLink.entries.length,2);});
});
test('capture rejects missing, ambiguous and permission-denied destinations',()=>{
 const h=harness();assert.throws(()=>h.D.capture('missing'),/removida/);const out=h.save(h.view());
 out.layers[0].denied=true;assert.throws(()=>h.D.capture(out.pairId),/reserve/);out.layers[0].denied=false;
 h.S.layers.push({...out.layers[1],id:998});assert.throws(()=>h.D.capture('auto'),/incompleto/);assert.equal(h.D.capture('new').layers.length,0);
});
test('calha and massa d’água keep separate destinations; repeated generations reuse each one',()=>{
 const h=harness(),save=(i,mode,h2=2)=>h.save(h.view([i],h2,mode),h.D.capture('auto',h.D.kindOf(mode)));
 const water=save(0,'axisDepth'),channel=save(0,'auto');
 assert.notEqual(water.pairId,channel.pairId);assert.equal(water.kind,'agua');assert.equal(channel.kind,'calha');assert.equal(h.S.layers.length,5);
 assert.ok(water.layers.every(L=>L._channelLink.kind==='agua'));assert.ok(channel.layers.every(L=>L._channelLink.kind==='calha'));
 const water2=save(1,'depth'),channel2=save(1,'auto'),water3=save(0,'axisDepth',4);
 assert.equal(h.S.layers.length,5,'no generation may create another layer while a destination of that kind exists');
 assert.equal(water2.pairId,water.pairId);assert.equal(water3.pairId,water.pairId);assert.equal(channel2.pairId,channel.pairId);
 assert.deepEqual(plain(channel.layers.map(L=>L._channelLink.entries.length)),[2,2]);assert.deepEqual(plain(water.layers.map(L=>L._channelLink.entries.length)),[2,2]);
 assert.ok(channel.layers[1].features.every(f=>f.props.VALUE===2),'water depth/height must never replace calha features');
 assert.equal(new Set(h.S.layers.map(L=>L.name)).size,h.S.layers.length,'layer names must stay unique');
 assert.throws(()=>h.D.capture(water.pairId,'calha'),/massa d’água/);
});
test('new layer requires a distinct name; repeating a same-kind name writes into that layer',()=>{
 const h=harness(),first=h.save(h.view([0],2,'auto'),h.D.capture('auto','calha')),name=first.layers[1].name;
 const again=h.D.capture('new','calha','  '+name.toUpperCase()+' ');assert.equal(again.pair.id,first.pairId);assert.equal(again.name,null);
 const routed=h.save(h.view([1],2,'auto'),again);assert.equal(routed.pairId,first.pairId);assert.equal(h.S.layers.length,3);
 assert.throws(()=>h.D.capture('new','calha',h.axis.name),/Já existe uma camada/);assert.throws(()=>h.D.capture('new','calha','  '),/Informe o nome/);
 assert.throws(()=>h.D.capture('new','agua',name),/Já existe uma camada/,'a calha name cannot become a new massa d’água layer');
 const fresh=h.save(h.view([0],3,'auto'),h.D.capture('new','calha','Rio Azul'));
 assert.notEqual(fresh.pairId,first.pairId);assert.deepEqual(plain(fresh.layers.map(L=>L.name)),['Seções — Rio Azul','Rio Azul']);
 const target=h.D.capture('new','calha','Rio Verde');h.c.addLayer({name:'Rio Verde',gtype:'line',crs:h.S.workCRS,features:[],fields:[]});
 assert.throws(()=>h.save(h.view([0],3,'auto'),target),/Já existe uma camada/);
});
test('default names of a first destination never repeat an existing layer name',()=>{
 const h=harness();h.c.addLayer({name:'polygon',gtype:'polygon',crs:h.S.workCRS,features:[],fields:[]});
 const out=h.save(h.view([0],2,'auto'),h.D.capture('auto','calha'));assert.deepEqual(plain(out.layers.map(L=>L.name)),['line','polygon (2)']);
 assert.equal(h.D.uniqueName('polygon'),'polygon (3)');
});
test('a deleted sections or calha layer is recreated in the same destination and undone atomically',()=>{
 for(const missing of [0,1]){
  const h=harness(),out=h.save(h.view([0,1])),kept=out.layers[1-missing],keptBefore=JSON.stringify({features:kept.features,link:kept._channelLink});
  // Como a exclusão do aplicativo: a camada ativa passa para uma existente.
  h.S.layers=h.S.layers.filter(L=>L!==out.layers[missing]);h.S.stack=h.S.stack.filter(x=>x!=='L:'+out.layers[missing].id);h.S.activeId=kept.id;
  const before=h.state(),undo=h.S.undo.length;
  const pair=h.D.pairs()[0];assert.equal(pair.complete,false);assert.equal(pair.restorable,true);
  const result=h.save(h.view([0],5));assert.equal(result.pairId,out.pairId);assert.equal(result.restored,true);assert.equal(h.S.layers.length,3);
  assert.equal(result.layers[1-missing],kept);assert.equal(h.D.pairs()[0].complete,true);
  const ids=plain(result.layers.map(L=>L._channelLink.entries.map(e=>e.id).sort()));assert.deepEqual(ids[0],ids[1]);
  const recreated=result.layers[missing];assert.equal(recreated.features.length,1,'only the regenerated axis has features in the recreated layer');
  if(!missing)assert.equal(recreated.name,'Seções — '+kept.name);
  assert.ok(kept.features.some(f=>f.props.EIXO===2&&f.props.VALUE===2),'other axes of the kept layer are untouched');
  for(const e of recreated._channelLink.entries)assert.equal(h.live.signature(recreated,e.id),e.resultSignature,'recreated recipes must not look manually edited');
  assert.equal(h.S.undo.length,undo+1);assert.equal(h.D.undo(h.S.undo.at(-1)),true);assert.equal(h.state(),before);
  assert.equal(JSON.stringify({features:kept.features,link:kept._channelLink}),keptBefore);
 }
});
test('legacy pairs without a declared kind are classified by recipes, then by their original name',()=>{
 const h=harness(),out=h.save(h.view([0],2,'auto'));for(const L of out.layers)delete L._channelLink.kind;
 assert.equal(h.D.pairs()[0].kind,'calha');
 out.layers[1]._channelLink.entries[0].options.mode='axisDepth';out.layers[0]._channelLink.entries[0].options.mode='axisDepth';assert.equal(h.D.pairs()[0].kind,'agua');
 h.save(h.view([1],2,'auto'));for(const L of out.layers)delete L._channelLink.kind;out.layers[1].name='Calha estimada MDT — Rio';assert.equal(h.D.pairs()[0].kind,'calha');
 out.layers[1].name='Faixa por altura MDT — Rio';assert.equal(h.D.pairs()[0].kind,'agua');
});
test('destination mutation, project replacement and new locks invalidate a captured target',()=>{
 const h=harness(),out=h.save(h.view()),target=h.D.capture('auto');out.layers[0].color='#555';assert.equal(h.D.current(target),true);
 out.layers[0].features[0].props.VALUE=7;assert.equal(h.D.current(target),false);assert.throws(()=>h.save(h.view(),target),/mudou/);
 const next=h.D.capture('auto');out.layers[1].locked=true;assert.equal(h.D.current(next),false);out.layers[1].locked=false;
 h.S.projectId='another';assert.equal(h.D.current(next),false);
});
test('a third layer with the same pair ID invalidates an in-flight destination',()=>{
 const h=harness(),out=h.save(h.view()),target=h.D.capture('auto');h.S.layers.push({...out.layers[0],id:999});
 assert.equal(h.D.current(target),false,'a now-incomplete/duplicated pair must not be mutated through old references');
});
test('an empty automatic destination becomes stale when a pair appears; explicit new remains new',()=>{
 const h=harness(),auto=h.D.capture('auto'),fresh=h.D.capture('new');h.save(h.view(),fresh);
 assert.equal(h.D.current(auto),false);assert.equal(h.D.current(fresh),true);
 assert.throws(()=>h.save(h.view(),auto),/mudou/);h.save(h.view(),fresh);assert.equal(h.D.pairs().length,2);
});
test('active editing and incompatible destination CRS reject before assigning any source ID',()=>{
 const h=harness(),out=h.save(h.view());h.c.ED.pend={};let before=h.state();
 assert.throws(()=>h.save(h.view([1])),/edição/);assert.equal(h.state(),before);delete h.c.ED.pend;
 out.layers.forEach(L=>L.crs='EPSG:31983');before=h.state();assert.throws(()=>h.save(h.view([1])),/CRS/);assert.equal(h.state(),before);assert.equal(h.axis.features[1]._channelAxisId,undefined);
});
test('manual confirmation cancellation leaves both layers, undo and new source IDs untouched',()=>{
 const h=harness(),out=h.save(h.view());out.layers[1].features[0].props.VALUE=99;h.c.confirmResult=false;
 const before=h.state(),result=h.save(h.view([0,1]));assert.equal(result,null);assert.equal(h.state(),before);assert.equal(h.axis.features[1]._channelAxisId,undefined);assert.equal(h.c.confirmations,1);
});
test('a destination changed while manual confirmation is open is not overwritten',()=>{
 const h=harness(),out=h.save(h.view());out.layers[1].features[0].props.VALUE=99;
 h.c.confirm=()=>{out.layers[0].features[0].props.MANUAL='concurrent';return true;};const undo=h.S.undo.length;
 assert.throws(()=>h.save(h.view([0,1])),/mudou/);assert.equal(out.layers[0].features[0].props.MANUAL,'concurrent');assert.equal(out.layers[1].features[0].props.VALUE,99);assert.equal(h.S.undo.length,undo);assert.equal(h.axis.features[1]._channelAxisId,undefined);
});
test('new-pair failure after the second insertion removes all partial layers and source IDs',()=>{
 const h=harness(),add=h.c.addLayer,before=h.state();let count=0;h.c.addLayer=spec=>{const L=add(spec);if(++count===2)throw Error('insert fault');return L;};
 assert.throws(()=>h.save(h.view()),/insert fault/);assert.equal(h.state(),before);assert.equal(h.axis.features[0]._channelAxisId,undefined);
});
test('existing-pair draw failure restores both layers, metadata, active selection and undo',()=>{
 const h=harness();h.save(h.view([0,1]));const before=h.state();h.c.failDrawAt=h.c.drawCalls+2;
 assert.throws(()=>h.save(h.view([0],7)),/draw fault/);assert.equal(h.state(),before);
});
test('link failure on the second selected axis rolls back all staged recipes and source IDs',()=>{
 const h=harness(),before=h.state(),attach=h.live.attachEntry;let calls=0;
 h.live.attachEntry=(...args)=>{const result=attach(...args);if(++calls===2)throw Error('link fault');return result;};
 assert.throws(()=>h.save(h.view([0,1])),/link fault/);assert.equal(h.state(),before);assert.ok(h.axis.features.every(f=>!f._channelAxisId));
});
test('duplicate source identities reject linking and roll back the transaction',()=>{
 const h=harness();h.axis.features.forEach(f=>f._channelAxisId='duplicate');const before=h.state();
 assert.throws(()=>h.save(h.view()),/duplicado|eixo/i);assert.equal(h.state(),before);
});
test('undo refuses stale or denied destinations without popping unrelated history',()=>{
 const h=harness(),out=h.save(h.view()),action=h.S.undo.at(-1);out.layers[0].denied=true;
 assert.equal(h.D.undo(action),false);assert.equal(h.S.undo.at(-1),action);out.layers[0].denied=false;
 out.layers[1].features[0].props.MANUAL='keep';const before=h.state();assert.equal(h.D.undo(action),false);assert.equal(h.state(),before);
});
test('undo preserves later style edits while reverting only the generated data',()=>{
 const h=harness(),out=h.save(h.view()),before=JSON.stringify(out.layers.map(L=>L.features));h.save(h.view([0],4));out.layers[1].color='#f00';
 assert.equal(h.D.undo(h.S.undo.at(-1)),true);assert.equal(out.layers[1].color,'#f00');assert.equal(JSON.stringify(out.layers.map(L=>L.features)),before);
});
test('three consecutive destination undo actions restore replace, append and original creation atomically',()=>{
 const h=harness(),out=h.save(h.view()),first=h.state();h.save(h.view([1]));const second=h.state();h.save(h.view([0],4));
 assert.equal(h.D.undo(h.S.undo.at(-1)),true);assert.equal(h.state(),second);
 assert.equal(h.D.undo(h.S.undo.at(-1)),true);
 // Stable axis IDs are intentionally retained in the source for future links.
 const expected=JSON.parse(first);expected.layers[0].features[1]._channelAxisId=h.axis.features[1]._channelAxisId;
 assert.equal(h.state(),JSON.stringify(expected));assert.equal(out.layers[0].features.length,1);
 assert.equal(h.D.undo(h.S.undo.at(-1)),true);assert.equal(h.S.layers.length,1);assert.equal(h.S.undo.length,0);
});
test('undo rendering failure restores the current result and leaves history available',()=>{
 const h=harness();h.save(h.view());h.save(h.view([0],4));const before=h.state();h.c.failDrawAt=h.c.drawCalls+2;
 assert.equal(h.D.undo(h.S.undo.at(-1)),false);assert.equal(h.state(),before);
});
test('legacy multi-axis migration updates A and keeps unchanged B current without scheduling a needless recalculation',()=>{
 const h=harness(),layers=h.legacy(),bBefore=JSON.stringify(layers.map(L=>L.features.find(f=>f.props.EIXO===2)));
 h.save(h.view([0],4));assert.ok(layers.every(L=>L._channelLink.version===2));
 for(const L of layers){const entry=L._channelLink.entries.find(e=>e.axisKeys[0]==='legacy-axis-1');assert.equal(entry.state,'ready');assert.equal(entry.sourceSignature,h.live.sourceSignature(entry));}
 assert.equal(JSON.stringify(layers.map(L=>{const f={...L.features.find(f=>f.props.EIXO===2)};delete f._channelRecipeId;return f;})),bBefore);
});
test('legacy migration never certifies an unselected axis whose source already changed',()=>{
 const h=harness(),layers=h.legacy();h.axis.features[1].geom[1][1]=3;h.save(h.view([0],4));
 for(const L of layers){const entry=L._channelLink.entries.find(e=>e.axisKeys[0]==='legacy-axis-1');assert.notEqual(entry.state,'ready');assert.notEqual(entry.sourceSignature,h.live.sourceSignature(entry));}
});
test('manual legacy subset migration cancellation is inert; accepted A never overwrites B',()=>{
 const h=harness(),layers=h.legacy();layers[1].features.find(f=>f.props.EIXO===2).props.MANUAL='keep B';const before=h.state();h.c.confirmResult=false;
 assert.equal(h.save(h.view([0],5)),null);assert.equal(h.state(),before);h.c.confirmResult=true;
 h.save(h.view([0],5));assert.equal(layers[1].features.find(f=>f.props.EIXO===2).props.MANUAL,'keep B');assert.equal(layers[1]._channelLink.entries.find(e=>e.axisKeys[0]==='legacy-axis-1').state,'detached');
});
test('JSON serialization preserves per-axis recipe tags without sharing references',()=>{
 const h=harness(),out=h.save(h.view([0,1])),saved=plain(out.layers.map(L=>({features:L.features,fields:L.fields,_channelLink:L._channelLink})));
 assert.deepEqual(saved[0]._channelLink.entries.map(e=>e.id),saved[1]._channelLink.entries.map(e=>e.id));
 saved[0].features[0]._channelRecipeId='changed';assert.notEqual(out.layers[0].features[0]._channelRecipeId,'changed');
 saved[0]._channelLink.entries[0].options.height=99;assert.equal(out.layers[0]._channelLink.entries[0].options.height,2);
});
console.log(`${passed}/${passed+failed} destination audit checks passed`);if(failed)process.exitCode=1;
