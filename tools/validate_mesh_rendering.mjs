import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../src/modules/geology/mesh-rendering.js',import.meta.url),'utf8');
const plain=x=>JSON.parse(JSON.stringify(x));let checks=0;
function check(name,fn){fn();checks++;console.log('OK · '+name);}
function fixture(){
  const messages=[],m={id:'intrusao',name:'Calcário',crs:'EPSG:31982',
    vertices:[[500000,7000000,10],[500020,7000000,30],[500020,7000020,50],[500000,7000020,70]],faces:[[0,1,2],[0,2,3]]};
  const surface={id:1,name:'Calcário — superfície',visible:true,color:'#aabbcc',sym:{color:'#aabbcc',fill:0.7},features:[],
    _geology:{kind:'surpac-mesh',meshId:'intrusao',meshRole:'surface'}},
    vectors={id:2,name:'Calcário — vetores',visible:true,color:'#123456',sym:{color:'#123456',stroke:'#123456',weight:2},features:[],
    _geology:{kind:'surpac-mesh',meshId:'intrusao',meshRole:'vectors'}};
  class BufferAttribute{constructor(array,itemSize){this.array=array;this.itemSize=itemSize;this.count=array.length/itemSize;}}
  class BufferGeometry{constructor(){this.attributes={};}setAttribute(k,v){this.attributes[k]=v;}setIndex(v){this.index=v;}computeVertexNormals(){this.normalsComputed=true;}}
  class Material{constructor(o){Object.assign(this,o);}}
  class Mesh{constructor(geometry,material){Object.assign(this,{geometry,material,isMesh:true});}}
  class LineSegments{constructor(geometry,material){Object.assign(this,{geometry,material,isLineSegments:true});}}
  const T={BufferGeometry,BufferAttribute,MeshLambertMaterial:Material,LineBasicMaterial:Material,Mesh,LineSegments,DoubleSide:2};
  const ctx={window:{THREE:T,GeoMineGeology:{meshes:{getWorkMesh:id=>{assert.equal(id,m.id);return m;}}}},
    S:{workCRS:m.crs,layers:[surface,vectors],geology:{meshes:[m]}},console:{warn:msg=>messages.push(msg)},toWGS:(_crs,x,y)=>[(x-500000)/10000,(y-7000000)/10000],
    L2:{latLngBounds(){return {points:[],extend(p){this.points.push(p);return this;},isValid(){return !!this.points.length;}}}},
    stackSync:()=>ctx.S.layers.map(o=>({t:'L',o})),Float32Array,Float64Array,Uint16Array,Uint32Array,Map,WeakMap,Set};
  vm.createContext(ctx);vm.runInContext(source,ctx);const group={children:[],add(o){this.children.push(o);}},
    frame={OX:500010,OY:7000010,zmnG:10,VE:1,showVectors:true};
  return {ctx,api:ctx.window.GeoMineGeology.meshViews,m,surface,vectors,group,frame,messages};
}
check('surface conta faces, vetores contêm todas as arestas únicas incluindo diagonal',()=>{
  const f=fixture();assert.equal(f.api.info(f.surface).faceCount,2);assert.equal(f.api.info(f.surface).count,2);
  assert.equal(f.api.info(f.vectors).count,5);assert.equal(f.api.info(f.vectors).label,'arestas');
  f.api.append3D(f.group,f.frame);const lines=f.group.children.find(o=>o.isLineSegments);
  const edges=Array.from(lines.geometry.index.array);assert.equal(edges.length,10);
  const pairs=[];for(let i=0;i<edges.length;i+=2)pairs.push(edges[i]+':'+edges[i+1]);assert.ok(pairs.includes('0:2'));
});
check('main3D usa Mesh e LineSegments originais XYZ, sem MDT nem caixa',()=>{
  const f=fixture(),before=plain(f.m);assert.equal(f.api.append3D(f.group,f.frame),2);
  const surface=f.group.children.find(o=>o.isMesh),vectors=f.group.children.find(o=>o.isLineSegments);
  assert.deepEqual(Array.from(surface.geometry.attributes.position.array),[-10,0,10,10,20,10,10,40,-10,-10,60,-10]);
  assert.deepEqual(Array.from(surface.geometry.index.array),[0,1,2,0,2,3]);assert.equal(surface.geometry.normalsComputed,true);
  assert.equal(surface.userData.meshId,'intrusao');assert.equal(vectors.userData.meshRole,'vectors');assert.equal(vectors.userData.layerId,2);
  assert.equal(surface.material.color,'#aabbcc');assert.equal(surface.material.opacity,0.7);assert.equal(vectors.material.color,'#123456');
  assert.deepEqual(plain(f.m),before,'renderização não altera dados de origem');
});
check('visibilidade independente não perde vetores se superfície oculta/removida',()=>{
  const f=fixture();f.surface.visible=false;f.api.append3D(f.group,f.frame);assert.equal(f.group.children.length,1);assert.equal(f.group.children[0].userData.meshRole,'vectors');
  assert.equal(f.api.extent3D().zmax,70);f.ctx.S.layers=[f.vectors];assert.equal(f.api.extent3D().n,4);
  f.vectors.visible=false;assert.equal(f.api.extent3D(),null);
});
check('checkbox global de vetores não desliga superfície; enquadramento deduplica malha',()=>{
  const f=fixture();f.api.append3D(f.group,{...f.frame,showVectors:false});assert.equal(f.group.children.length,1);assert.equal(f.group.children[0].userData.meshRole,'surface');
  assert.deepEqual(plain(f.api.extent3D()),{xmin:500000,ymin:7000000,zmin:10,xmax:500020,ymax:7000020,zmax:70,n:4,n3:4,n2:0});
});
check('enquadramento 2D transforma vértices reais; cache não é por id',()=>{
  const f=fixture();assert.deepEqual(plain(f.api.layerBounds(f.surface).points),[[0,0],[0.002,0.002]]);
  f.m.vertices=f.m.vertices.map(p=>[p[0]+100,p[1],p[2]+7]);f.m.faces=[[0,1,2]];
  assert.equal(f.api.info(f.surface).count,1);assert.equal(f.api.info(f.vectors).count,3);assert.equal(f.api.extent3D().xmin,500100);assert.equal(f.api.extent3D().zmax,77);
});
check('corpo e litologia adicionais mantêm camadas separadas, cota e ordem',()=>{
  const f=fixture(),m2={...f.m,id:'dolomito',vertices:f.m.vertices.map(p=>[p[0]+30,p[1],p[2]-50])},L={...f.surface,id:3,name:'Dolomito',_geology:{...f.surface._geology,meshId:m2.id}};
  f.ctx.window.GeoMineGeology.meshes.getWorkMesh=id=>id===m2.id?m2:f.m;f.ctx.S.layers.unshift(L);
  assert.equal(f.api.append3D(f.group,f.frame),3);assert.equal(f.group.children[0].userData.meshId,'dolomito');
  assert.ok(f.group.children[0].renderOrder>f.group.children[1].renderOrder);assert.equal(f.api.extent3D().zmin,-40);
});
check('transparência zero e espessura zero não ressuscitam geometria',()=>{
  const f=fixture();f.surface.sym.fill=0;f.vectors.sym.weight=0;f.api.append3D(f.group,f.frame);
  assert.equal(f.group.children[0].visible,false);assert.equal(f.group.children[1].visible,false);
});
check('falha de referência é relatada, sem fabricar contorno',()=>{
  const f=fixture();f.ctx.window.GeoMineGeology.meshes.getWorkMesh=()=>{throw Error('ausente');};
  assert.equal(f.api.append3D(f.group,f.frame),0);assert.equal(f.api.extent3D(),null);assert.equal(f.api.layerBounds(f.surface).isValid(),false);
  assert.ok(f.messages.some(s=>s.includes('ausente')));
});
check('restauração pendente não emite falso erro, mas falha real continua visível',()=>{
  const f=fixture();delete f.ctx.S.geology.meshes;
  f.ctx.window.GeoMineGeology.meshes.getWorkMesh=()=>{throw Error('não deve consultar antes da restauração');};
  assert.equal(f.api.info(f.surface).count,0);assert.equal(f.api.layerBounds(f.surface).isValid(),false);
  assert.equal(f.api.extent3D(),null);assert.equal(f.api.append3D(f.group,f.frame),0);assert.equal(f.messages.length,0);
  f.ctx.S.geology.meshes=[];f.api.layerBounds(f.surface);assert.equal(f.messages.length,1);
});
console.log(checks+' verificações de representação Surpac passaram.');
