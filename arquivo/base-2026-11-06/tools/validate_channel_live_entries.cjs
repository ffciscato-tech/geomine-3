// Isolated regression of live recipes. No project files, browser or Drive writes.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../src/modules/environmental/channel-live.js'),'utf8');
const copy=x=>JSON.parse(JSON.stringify(x));
const wait=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('VM live update timed out');};
function context(){
  const c={crypto,setTimeout,clearTimeout,AbortController,Blob,URL,queueMicrotask,S:{layers:[],rasters:[],projectId:'live-unit',workCRS:'EPSG:31983'},ED:{},document:{addEventListener(){}},addEventListener(){},toast(){},cmdLog(){},refreshUI(){},drawLayer(){},renderRaster(){},loadProject(){},zApply(){},collabCanEditLayer:()=>true,proj4:()=>({forward:p=>p}),held:[],hold:false};c.window=c;
  // Deliberately shared references: the real serializer does not deep-clone
  // _channelLink/features before the live wrapper sees its result.
  c.projectData=()=>({layers:c.S.layers.map(L=>({...L,features:L.features,_channelLink:L._channelLink}))});
  c.GeoMineChannelSearchPolicy={reaches:o=>[o.reach],canExpand:()=>false};
  c.GeoMineChannelDEM={prepare:async()=>({resolution:.5,sample:async points=>points.map(()=>100),close(){}})};
  c.Worker=class{
    postMessage({method}){const finish=()=>{if(!this.closed)this.onmessage?.({data:{result:method==='plan'?{sections:[{points:[[0,0],[1,0]]}]}:{sections:[]}}});};if(c.hold&&method==='analyze')c.held.push(finish);else queueMicrotask(finish);}
    terminate(){this.closed=true;}
  };
  c.GeoMineChannelExtraction={sourceSignature:()=> 'fixed-native-raster',workerSource:()=>'',fields:features=>Object.keys(features[0].props).map(name=>({name,type:'C'})),buildSpecs:()=>[
    {features:[{geom:[[0,0],[2,0]],props:{STATUS:'new',VALUE:2,NEW_A:'new'}}]},
    {features:[{geom:[[[0,0],[2,0],[2,1],[0,0]]],multi:true,props:{STATUS:'new',VALUE:2,NEW_A:'new'}}]}
  ]};
  vm.createContext(c);vm.runInContext(source,c);return c;
}
function fixture(shared=true){
  const c=context(),axis={id:1,gtype:'line',crs:c.S.workCRS,features:[{geom:[[0,0],[10,0]],props:{ID:'A'}},{geom:[[0,4],[10,4]],props:{ID:'B'}}]},r={id:2,d:{z:[100],nc:1,nr:1}};
  const pair=['line','polygon'].map((gtype,i)=>({id:3+i,gtype,name:'Shared '+gtype,crs:c.S.workCRS,fields:[{name:'STATUS',type:'C'},{name:'VALUE',type:'C'},{name:'FOREIGN',type:'N'}],features:(shared?['A','B']:['A']).map(id=>({...(shared?{_channelRecipeId:id}:{}),geom:gtype==='line'?[[0,0],[1,0]]:[[[0,0],[1,0],[1,1],[0,0]]],multi:gtype==='polygon',props:{STATUS:'ready',VALUE:1}})).concat(shared?[{geom:[[99,99],[100,100]],props:{FOREIGN:42}}]:[])}));
  c.S.layers.push(axis,...pair);c.S.rasters.push(r);const api=c.GeoMineChannelLive,value=i=>({q:{L:axis,r,rows:[{f:axis.features[i],index:i+1}],crs:c.S.workCRS,o:{mode:'depth',height:1,interval:1,reach:2}}});
  let a,b;
  if(shared){a=api.attachEntry(value(0),pair,'A');b=api.attachEntry(value(1),pair,'B');assert.ok(pair.every(L=>!L._channelLink),'attachEntry must not replace containers');pair.forEach((L,i)=>L._channelLink={version:2,id:'pair',role:i?'polygon':'sections',entries:[a[i],b[i]]});}
  else{api.attach(value(0),pair);a=pair.map(L=>L._channelLink);}
  return {c,api,axis,r,pair,a,b,value};
}
(async()=>{
  let tests=0;
  const test=async(name,run)=>{await run();tests++;console.log('PASS '+name);};
  await test('V2 entry isolation, manual B pause, scoped A update, fields/features/names retained',async()=>{
    const {c,api,axis,pair,a,b}=fixture();try{
      assert.equal(api.state().links.length,2);api.scan();assert.ok(a.every(r=>r.state==='ready'));
      const signature=api.signature(pair[0],'A');pair[0].features.find(f=>f._channelRecipeId==='B').props.NOTE='manual B';assert.equal(api.signature(pair[0],'A'),signature);api.scan();assert.ok(b.every(r=>r.state==='detached'));assert.ok(a.every(r=>r.state==='ready'));
      const keep=pair.map(L=>JSON.stringify(L.features.filter(f=>f._channelRecipeId!=='A'))),names=pair.map(L=>L.name),field=pair[0].fields[2],foreign=pair[0].features.at(-1);
      axis.features[0].geom[1][0]=12;c.drawLayer(axis);api.scan();await wait(()=>!api.state().running&&a[0].state==='ready');
      assert.ok(b.every(r=>r.state==='detached'));pair.forEach((L,i)=>{assert.equal(JSON.stringify(L.features.filter(f=>f._channelRecipeId!=='A')),keep[i]);assert.equal(L.name,names[i]);assert.equal(L.features.find(f=>f._channelRecipeId==='A').props.VALUE,2);});
      assert.equal(pair[0].fields.find(f=>f.name==='FOREIGN'),field);assert.equal(pair[0].features.at(-1),foreign);assert.ok(pair[0].fields.some(f=>f.name==='NEW_A'));assert.deepEqual(axis.features[0].props,{ID:'A'});
    }finally{api.stop();}
  });
  for(const shared of [false,true])await test((shared?'V2':'V1')+' shallow save never mutates live metadata/features; inconsistent pair refuses update',async()=>{
    const {c,api,axis,pair,a}=fixture(shared);try{
      axis.features[0].geom[1][0]=14;const before=JSON.stringify(c.S),data=c.projectData();assert.equal(JSON.stringify(c.S),before);
      for(const L of data.layers.filter(L=>L._channelLink)){assert.notEqual(L.features,pair.find(p=>p.id===L.id).features);assert.notEqual(L._channelLink,pair.find(p=>p.id===L.id)._channelLink);assert.match(L.features[0].props.STATUS,/DESATUALIZADA/);const link=shared?L._channelLink.entries[0]:L._channelLink;assert.equal(link.state,'stale');if(shared){assert.equal(L._channelLink.entries[1].state,'ready');assert.equal(L.features[1].props.STATUS,'ready');}}
      a[1].options.height=3;const shape=JSON.stringify(pair.map(L=>L.features.map(f=>f.geom)));api.scan();assert.equal(api.state().running,false);assert.ok(a.every(r=>r.state==='stale'));assert.match(a[0].message,/inconsistente/);assert.equal(JSON.stringify(pair.map(L=>L.features.map(f=>f.geom))),shape);
    }finally{api.stop();}
  });
  await test('Nested suspend/release is idempotent and prevents job commit without overwriting status',async()=>{
    const {c,api,axis,pair,a}=fixture();try{
      c.hold=true;axis.features[0].geom[1][0]=15;api.scan();await wait(()=>c.held.length===1);assert.equal(a[0].state,'pending');const shape=JSON.stringify(pair.map(L=>L.features));
      const release=api.suspend(),release2=api.suspend();assert.equal(api.state().suspended,2);c.held.shift()();await wait(()=>!api.state().running);assert.equal(JSON.stringify(pair.map(L=>L.features)),shape);assert.equal(a[0].state,'pending');
      release();release();assert.equal(api.state().suspended,1);release2();assert.equal(api.state().suspended,0);c.hold=false;api.scan();await wait(()=>!api.state().running&&a[0].state==='ready');
    }finally{api.stop();}
  });
  await test('Companion recipe changed during worker calculation invalidates the result',async()=>{
    const {c,api,axis,pair,a}=fixture();try{
      c.hold=true;axis.features[0].geom[1][0]=18;const shape=JSON.stringify(pair.map(L=>L.features.map(f=>f.geom)));api.scan();await wait(()=>c.held.length===1);a[1].options.height=4;c.held.shift()();await wait(()=>!api.state().running);
      assert.equal(JSON.stringify(pair.map(L=>L.features.map(f=>f.geom))),shape);assert.ok(a.every(r=>r.state==='stale'));assert.equal(a[1].options.height,4);
    }finally{api.stop();}
  });
  await test('Legacy whole-layer signature stays unchanged; v2 render metadata does not pause ownership',async()=>{
    const {api,pair}=fixture();try{const legacy=api.signature(pair[0]),owned=api.signature(pair[0],'A');pair[0].features[0]._renderCache={test:true};assert.equal(api.signature(pair[0],'A'),owned);assert.notEqual(api.signature(pair[0]),legacy);assert.equal(api.featuresFor(pair[0],'A').length,1);assert.equal(api.matchesFeature(pair[0].features[0],'A'),true);}finally{api.stop();}
  });
  console.log(`${tests}/${tests} groups passed. Simulated workers and raster; no real project modified.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
