const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../core/parts/25-geoprocessing-tin.js'),'utf8'),ctx={};vm.createContext(ctx);
vm.runInContext(source.slice(source.indexOf('function profZNumber('),source.indexOf('function profSegInter('))+'\nfunction baseline(L){return !!(L?.gtype===\'line\'&&L.features?.some(f=>profVectorParts(f).some(p=>p.z.some(Number.isFinite))));}',ctx);
const line=(...features)=>({gtype:'line',features}),feature=(geom,zg,props={})=>({geom,zg,props});
function same(L,expected){const before=JSON.stringify(L),actual=ctx.profLinhaTemZ(L);assert.equal(actual,ctx.baseline(L));if(expected!==undefined)assert.equal(actual,expected);assert.equal(JSON.stringify(L),before,'eligibility must not change geometry, Z or properties');}
test('eligibility remains restricted to current line features with any usable Z',()=>{
 for(const L of [null,{},line(),line(null),line(feature([])),{gtype:'polygon',features:[feature([[1,2,3]])]},line(feature([[1,2],[3,4]]))])same(L,false);
 same(line(feature([[1,2,0],[3,4,5]])),true);same(line(feature([[NaN,Infinity,5],[null,undefined,6]])),true);
});
test('valid zg wins, otherwise embedded XYZ is used; an existing zg array suppresses constant fallback',()=>{
 same(line(feature([[1,2,undefined]],['10,5'],{COTA:20})),true);
 same(line(feature([[1,2,30],[3,4,40]],[null,NaN],{COTA:20})),true);
 same(line(feature([[1,2],[3,4]],[],{COTA:20})),false);
 same(line(feature([[1,2],[3,4]],new Float32Array([NaN,NaN]),{COTA:20})),false);
 same(line(feature([[1,2],[3,4]],new Float64Array([NaN,0]),{COTA:20})),true);
 same(line(feature([[1,2],[3,4]],new DataView(new ArrayBuffer(8)),{COTA:20})),false);
});
test('explicit invalid embedded Z does not fall through to a constant attribute',()=>{
 same(line(feature([[1,2,null],[3,4,'']],undefined,{COTA:20})),false);
 same(line(feature([[1,2,null],[3,4]],undefined,{COTA:'20,5'})),true);
 same(line(feature([[1,2],[3,4]],undefined,{'NÍVEL':'12,5'})),true);
 for(const z of [null,undefined,'',true,false,NaN,Infinity,-Infinity,-1e38])same(line(feature([[1,2,z]])),false);
 for(const z of [0,-99999,'0','12,5',-1e37])same(line(feature([[1,2,z]])),true);
});
test('multipart and flat DXF structures use actual nesting rather than the multi flag',()=>{
 same(line({...feature([[1,2],[3,4]],[11,12]),multi:true}),true);
 same(line({...feature([[[1,2],[3,4]],[[5,6],[7,8]]],[new Float32Array([NaN,NaN]),new Float64Array([20,30])]),multi:false}),true);
 same(line(feature([[[1,2],[3,4]],[[5,6],[7,8]]],[[],[]],{COTA:9})),false);
 same(line(feature([[[1,2],[3,4]],[[5,6],[7,8]]],[[],undefined],{COTA:9})),true);
 const geom=[[[1,2],[3,4]],,[[5,6,7],[8,9,10]]];same(line(feature(geom)),true);
 const sparse=[];sparse.length=100;same(line(feature(sparse,undefined,{COTA:10})),false);
});
test('large eligible geometry stops at its first finite Z without copying or reading later vertices',()=>{
 const geom=[[1,2,3]];geom.length=100000;Object.defineProperty(geom,1,{get(){throw new Error('later vertices must not be visited');}});
 assert.equal(ctx.profLinhaTemZ(line(feature(geom))),true);
 const zg=new Float64Array(100000);zg[0]=25;const xy=[[1,2]];xy.length=100000;Object.defineProperty(xy,1,{get(){throw new Error('later vertices must not be visited');}});
 assert.equal(ctx.profLinhaTemZ(line(feature(xy,zg))),true);
});
test('mixed representations match the previous eligibility predicate',()=>{
 const z=[undefined,null,'',false,NaN,Infinity,-1e38,-99999,0,'12,5',50];
 for(let i=0;i<z.length;i++)for(let j=0;j<z.length;j++){
  const geom=[[1,2,...(i%2?[z[i]]:[])],[3,4,...(j%2?[z[j]]:[])]],zg=i%3===0?[z[j],z[i]]:i%3===1?undefined:new Float64Array([Number(z[j]),Number(z[i])]);
  same(line(feature(geom,zg,i%2?{COTA:z[j]}:{})));
  same(line(feature([geom,[[5,6]]],[zg,j%2?[]:undefined],{ALTITUDE:z[j]})));
 }
});
