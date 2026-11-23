const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const text=fs.readFileSync(path.join(__dirname,'screen-lines-3d.js'),'utf8');
/* THREE de mentira: só o que a fita usa para se montar. */
function setup(){
 class V{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}clone(){return new V(this.x,this.y,this.z);}
  distanceToSquared(q){return (this.x-q.x)**2+(this.y-q.y)**2+(this.z-q.z)**2;}set(x,y){this.x=x;this.y=y;return this;}}
 const THREE={DoubleSide:2,Vector2:V,Vector3:V,Color:class{constructor(c){this.c=c;}},
  ShaderMaterial:class{constructor(o){Object.assign(this,o);}},
  BufferAttribute:class{constructor(a,n){this.array=a;this.itemSize=n;}},
  BufferGeometry:class{constructor(){this.a={};}setAttribute(k,v){this.a[k]=v;}setIndex(i){this.index=i;}getAttribute(k){return this.a[k];}computeBoundingSphere(){}computeBoundingBox(){}},
  Mesh:class{constructor(g,m){this.geometry=g;this.material=m;this.userData={};}}};
 const c={window:{THREE},Float32Array,Number,String,Math};vm.createContext(c);vm.runInContext(text,c);
 return {L:c.window.GeoMine3DLines,THREE,P:(...xyz)=>xyz.map(p=>new V(...p))};
}
test('linha opaca grava profundidade: a superfície translúcida, desenhada depois, não cobre a linha que está na frente',()=>{
 const {L,THREE,P}=setup(),m=L.create(THREE,P([0,10,0],[5,10,0],[5,10,5]),{width:1.5,color:'#111111',opacity:1}).material;
 assert.equal(m.depthTest,true);assert.equal(m.depthWrite,true);assert.equal(m.transparent,false);
 // sem opacidade declarada a linha é opaca
 assert.equal(L.create(THREE,P([0,0,0],[1,0,0]),{width:2,color:'#f00'}).material.depthWrite,true);
});
test('linha semitransparente não grava profundidade, como todo objeto transparente',()=>{
 const {L,THREE,P}=setup(),m=L.create(THREE,P([0,10,0],[5,10,0]),{width:1.5,color:'#111111',opacity:.5}).material;
 assert.equal(m.depthWrite,false);assert.equal(m.transparent,true);assert.equal(m.depthTest,true);
});
