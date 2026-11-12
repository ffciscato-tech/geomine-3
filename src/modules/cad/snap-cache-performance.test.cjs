const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../core/parts/06-map-tools-snap.js'),'utf8');
function environment(transform=(crs,x,y)=>[x,y]){
 const ctx={S:{snapOn:true,snapVtxOn:true,snapMidOn:true,snapEndOn:true,snapNearOn:true,snapCenterOn:true,snapEscopo:'todas',layers:[]},Set,Float64Array,Number,window:{},toWGS:transform,
  L2:{latLng:(lat,lng)=>({lat,lng})},map:{latLngToContainerPoint:p=>({x:(p.lng??p[1])*100,y:(p.lat??p[0])*100}),containerPointToLatLng:p=>({lng:p[0]/100,lat:p[1]/100})}};
 vm.createContext(ctx);vm.runInContext('const SNAP_PX=15;'+source.slice(source.indexOf('function snapRingPartsOf'),source.indexOf('/* Feição selecionável mais próxima')),ctx);return ctx;
}
const shape=(x=0)=>({geom:[[x,0],[x+2,0],[x+2,2]],props:{}}),layer=(features,gtype='line')=>({id:1,gtype,crs:'native',features});
const plain=x=>JSON.parse(JSON.stringify(x));
test('range queries preserve flat-cache targets and discrete priority',()=>{
 const c=environment(),L=layer([shape(),shape(20)]);c.S.layers=[L];const cache=c.snapCacheOf(L);
 for(const flags of [['snapVtxOn'],['snapMidOn'],['snapEndOn'],['snapNearOn'],['snapCenterOn'],['snapVtxOn','snapMidOn','snapNearOn']]){
  for(const flag of ['snapVtxOn','snapMidOn','snapEndOn','snapNearOn','snapCenterOn'])c.S[flag]=flags.includes(flag);
  for(const [lng,lat] of [[0,.05],[1,.04],[2,1],[1.7,.07],[2,2.05],[99,99]]){
   cache.refRanges=true;const indexed=plain(c.snapLatLng({lat,lng},null,{flash:false}));cache.refRanges=false;const flat=plain(c.snapLatLng({lat,lng},null,{flash:false}));assert.deepEqual(indexed,flat,{flags,lng,lat});
  }
 }
});
test('distant ring vertices are not read during snap queries',()=>{
 const c=environment(),L=layer(Array.from({length:500},(_,i)=>shape(i*10)));c.S.layers=[L];const cache=c.snapCacheOf(L);let reads=0;
 cache.pts=new Proxy(cache.pts,{get:(target,key)=>{if(/^\d+$/.test(String(key)))reads++;return Reflect.get(target,key);}});
 c.snapLatLng({lat:0,lng:0},null,{flash:false});assert(reads<20,'only the nearby ring should be read');const indexedReads=reads;reads=0;cache.refRanges=false;
 c.snapLatLng({lat:0,lng:0},null,{flash:false});assert(reads>2500);assert(indexedReads<reads/100);
});
test('excluded gesture snapshot avoids rebuilding a large edited layer',()=>{
 const c=environment(),edited=shape(),other=shape(20),L=layer([edited,other]);c.S.layers=[L];const cache=c.snapCacheOf(L);L._vertexSnapCache=cache;L._vertexEditedFeature=edited;L._snapCache=null;
 edited.geom[0]=[50,50];let calls=0;c.toWGS=(crs,x,y)=>{calls++;return[x,y];};
 const hit=c.snapLatLng({lat:.03,lng:20},L,{exclude:new Set([edited]),flash:false});assert(hit.snapped);assert.equal(calls,0);assert.equal(L._snapCache,null);
 c.snapLatLng({lat:50,lng:50},L,{flash:false});assert(calls>0,'queries that include the edited feature must rebuild current coordinates');
});
test('native midpoints retain projected coordinates and contribute to ring bounds',()=>{
 const c=environment((crs,x,y)=>[x,y+x*x*.1]),edited=shape(100),other={geom:[[-10,0],[10,0]],props:{}},L=layer([edited,other]);c.S.layers=[L];c.S.snapVtxOn=false;c.S.snapEndOn=false;c.S.snapNearOn=false;c.S.snapCenterOn=false;
 const hit=c.snapLatLng({lat:0,lng:0},L,{exclude:new Set([edited]),flash:false});assert(hit.snapped);assert.equal(hit.kind,'ponto médio');assert.deepEqual(plain(hit.latlng),{lat:0,lng:0});
});
test('polygon closing edge, invalid gaps and stale flat caches remain safe',()=>{
 const c=environment(),L=layer([{geom:[[0,0],[2,0],[2,2]],props:{}}],'polygon'),gaps=layer([{geom:[[10,0],[],[12,0]],props:{}}]);c.S.layers=[L,gaps];c.S.snapVtxOn=false;c.S.snapEndOn=false;c.S.snapNearOn=false;c.S.snapCenterOn=false;
 assert.equal(c.snapLatLng({lat:1,lng:1},null,{flash:false}).kind,'ponto médio');assert(!c.snapLatLng({lat:0,lng:11},null,{flash:false}).snapped);
 const cache=c.snapCacheOf(L);cache.refRanges=false;cache.pts.unshift(null,undefined);cache.segs.unshift(null,undefined,NaN,Infinity);c.S.snapVtxOn=true;c.S.snapNearOn=true;assert.doesNotThrow(()=>c.snapLatLng({lat:0,lng:0},null,{flash:false}));
});

function gesture(c,L,f){const cache=c.snapCacheOf(L);L._vertexSnapCache=cache;L._vertexEditedFeature=f;return cache;}
function cacheData(cache){return plain({pts:cache.pts,mids:cache.mids,segs:cache.segs,cens:cache.cens,refs:cache.refs.map(r=>({idx:r.idx,ringIndex:r.ringIndex,sourceRingIndex:r.sourceRingIndex,ll:Array.from(r.ll),minLat:r.minLat,minLng:r.minLng,maxLat:r.maxLat,maxLng:r.maxLng,polygon:r.polygon,pointStart:r.pointStart,pointEnd:r.pointEnd,midStart:r.midStart,midEnd:r.midEnd,segmentStart:r.segmentStart,segmentEnd:r.segmentEnd}))});}
test('release refreshes one feature to match a fresh whole-layer cache and retains other references',()=>{
 const c=environment((crs,x,y)=>[x,y+x*x*.01]),edited={geom:[[[20,0],[23,0],[23,3]],[[20,5],[24,5],[24,7]]],multi:true,props:{}},L=layer([shape(),edited,shape(50)]),cache=gesture(c,L,edited);
 const arrays=[cache.pts,cache.mids,cache.segs,cache.cens],others=cache.refs.filter(r=>r.f!==edited),otherBuffers=others.map(r=>r.ll),beforeOther=others.map(r=>Array.from(r.ll));
 edited.geom[0][1]=[24,1];edited.geom[1][1]=[25,6];const refreshed=c.snapRefreshFeatureCache(L,cache,edited);assert.equal(refreshed,cache);assert.deepEqual([cache.pts,cache.mids,cache.segs,cache.cens],arrays);
 others.forEach((r,i)=>{assert.equal(r.ll,otherBuffers[i]);assert.deepEqual(Array.from(r.ll),beforeOther[i]);});
 const fresh=c.snapCacheOf({...L,_snapCache:null});assert.deepEqual(cacheData(cache),cacheData(fresh));assert.equal(cache.count,fresh.count);
});
test('release only reprojects the edited feature, even with hundreds of neighbouring features',()=>{
 let transforms=0;const c=environment((crs,x,y)=>{transforms++;return[x,y];}),edited=shape(20000),L=layer([...Array.from({length:500},(_,i)=>shape(i*10)),edited]);
 const cache=gesture(c,L,edited);transforms=0;edited.geom[1]=[20003,1];assert.equal(c.snapRefreshFeatureCache(L,cache,edited),cache);assert(transforms<20,'unchanged features must not be reprojected');assert.equal(cache.featureRefs.length,501);
});
test('release rejects changed topology, cache ranges, source order and ownership without any partial writes',()=>{
 const cases=[
  (c,L,f,cache)=>f.geom.push([9,9]),
  (c,L,f,cache)=>{f.multi=true;f.geom=[f.geom]},
  (c,L,f,cache)=>{cache.refs[0].pointEnd++},
  (c,L,f,cache)=>{cache.refs[1].segmentStart=0},
  (c,L,f,cache)=>{cache.refs[0].sourceRingIndex=-1},
  (c,L,f,cache)=>{cache.refRanges=false},
  (c,L,f,cache)=>{L.features.reverse()},
  (c,L,f,cache)=>{L.features=L.features.slice()},
  (c,L,f,cache)=>{L.features[1].geom=L.features[1].geom.map(p=>p.slice())},
  (c,L,f,cache)=>{L._vertexEditedFeature=L.features[1]},
  (c,L,f,cache)=>{L._vertexSnapCache=null},
  (c,L,f,cache)=>{c.S.snapCenterOn=false},
 ];
 for(const change of cases){const c=environment(),f=shape(),L=layer([f,shape(20)]),cache=gesture(c,L,f);change(c,L,f,cache);const before=cacheData(cache);assert.equal(c.snapRefreshFeatureCache(L,cache,f),null);assert.deepEqual(cacheData(cache),before);}
});
test('failed projection and changed center counts never partially overwrite old ranges',()=>{
 for(const kind of ['projection','centers']){const c=environment(),f=shape(),L=layer([shape(20),f,shape(50)]),cache=gesture(c,L,f);f.geom[1]=[3,1];const before=cacheData(cache);if(kind==='projection')c.toWGS=()=>{throw Error('projection unavailable')};else c.snapCentroFeicao=()=>[];assert.equal(c.snapRefreshFeatureCache(L,cache,f),null);assert.deepEqual(cacheData(cache),before);}
});
