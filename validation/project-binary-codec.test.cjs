const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/core/parts/25-geoprocessing-tin.js'),'utf8');
function setup(native){
 const c={btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary')};vm.createContext(c);
 vm.runInContext(`Uint8Array.fromBase64=undefined;Uint8Array.prototype.toBase64=undefined;`,c);
 if(native){c.decode=s=>Uint8Array.from(Buffer.from(s,'base64'));c.encode=u=>Buffer.from(u.buffer,u.byteOffset,u.byteLength).toString('base64');vm.runInContext('Uint8Array.fromBase64=s=>decode(s);Uint8Array.prototype.toBase64=function(){return encode(this)};',c);}
 for(const name of ['f32ToB64','b64ToF32','b64ToU32']){const i=source.indexOf('function '+name+'('),end=source.indexOf('\n}',i)+2;vm.runInContext(source.slice(i,end),c);}
 return c;
}
for(const native of [false,true])test(`${native?'native':'legacy'} codec preserves exact grid/triangle bits and typed-array slices`,()=>{
 const c=setup(native),bits=new Uint32Array([0,0x80000000,0x7fc01234,0x7f800000,0xff800000,0x3f800000,0xffffffff,123456789]);
 const sliced=new Float32Array(bits.buffer,4,6),expected=Buffer.from(bits.buffer,4,24).toString('base64');
 assert.equal(c.f32ToB64(sliced),expected);
 const f=c.b64ToF32(expected),u=c.b64ToU32(expected);
 assert.deepEqual(Buffer.from(f.buffer,f.byteOffset,f.byteLength),Buffer.from(bits.buffer,4,24));
 assert.deepEqual(Array.from(u),Array.from(bits.subarray(1,7)));
 assert.equal(c.f32ToB64(new Float32Array(0)),'');
 assert.throws(()=>c.b64ToF32('AA=='),e=>e.name==='RangeError');
 assert.throws(()=>c.b64ToU32('AA=='),e=>e.name==='RangeError');
});
