import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ctx=vm.createContext({ArrayBuffer,Uint8Array,DataView,TextDecoder,TextEncoder,console});
vm.runInContext(fs.readFileSync(path.join(root,'src/modules/geology/surpac-reader.js'),'utf8'),ctx);
const reader=ctx.GeoMineSurpacReader;
const plain=value=>JSON.parse(JSON.stringify(value));
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
const str='sample.str,21-Sep-26,,\n0,0,0,0,\n1,20,10,100\n1,20,110,102\n0,0,0,0,END\n2,120,10,105\n2,120,110,108\n0,0,0,0,END\n0,0,0,0,END\nEND\n';
const dtm='sample.dtm,21-Sep-26,,\n0,0,0,0,\nOBJECT,1,,\nTRISOLATION,2,,\n1,1,2,4,0,2,0\n2,2,5,4,0,0,1\n0,0,0,0,0,0,0\nEND\n';
const expectedVertices=[[10,20,100],[110,20,102],[10,120,105],[110,120,108]];
const expectedFaces=[[0,1,2],[1,3,2]];

function sink(){
  const chunks=[];
  return {
    text(s){chunks.push(Buffer.from(s,'latin1'));},zeros(n){chunks.push(Buffer.alloc(n));},
    u32(n){const b=Buffer.alloc(4);b.writeUInt32BE(n);chunks.push(b);},
    f64(n){const b=Buffer.alloc(8);b.writeDoubleBE(n);chunks.push(b);},
    done(){return Buffer.concat(chunks);}
  };
}
function binarySTR(records){
  const b=sink();b.text('sample.str,21-Sep-26,,\r\n0,0,0,0,0,0,0\r\n');b.zeros(5);
  for(const r of records){b.u32(r?1:0);b.f64(r?r[1]:0);b.f64(r?r[0]:0);b.f64(r?r[2]:0);b.zeros(1);}
  b.u32(0);b.f64(0);b.f64(0);b.f64(0);b.text('END');b.zeros(1);return b.done();
}
function binaryDTM(groups){
  const b=sink();b.text('sample.str,0000000000;algorithm=standard;fields=x,y\r\n');b.zeros(33);b.text('END');b.zeros(1);
  for(const g of groups){
    b.u32(1);b.u32(g.objectId);b.text(g.objectText||'');b.zeros(1);
    b.u32(2);b.u32(g.trisolationId);b.text(g.text||'closed=no');b.zeros(1);
    g.faces.forEach((face,i)=>{b.u32(3);b.u32(i+1);face.forEach(n=>b.u32(n));b.zeros(12);b.zeros(1);});
  }
  b.u32(0xffffffff);b.u32(0xffffffff);return b.done();
}
const sb=binarySTR([expectedVertices[0],expectedVertices[1],null,expectedVertices[2],expectedVertices[3],null]);
const db=binaryDTM([{objectId:1,trisolationId:2,faces:[[1,2,4],[2,5,4]]}]);

test('text: coordinates Y,X,Z become X,Y,Z and terminator slots remain indexed',()=>{
  const result=reader.parsePair(dtm,str,{dtmName:'sample.dtm',strName:'sample.stx'});
  assert.deepEqual(plain(result.meshes[0].vertices),expectedVertices);
  assert.deepEqual(plain(result.meshes[0].faces),expectedFaces);
  assert.equal(result.meshes[0].objectId,1);assert.equal(result.meshes[0].trisolationId,2);
  assert.equal(reader.parseSTR(str).records.length,7);
});
test('binary big-endian pair agrees with text',()=>{
  const result=reader.parsePair(db,sb,{dtmName:'sample.dtm',strName:'sample.str'});
  assert.deepEqual(plain(result.meshes[0].vertices),expectedVertices);
  assert.deepEqual(plain(result.meshes[0].faces),expectedFaces);
  assert.equal(result.warnings.length,0);
});
test('binary reader respects Uint8Array subview offset and length',()=>{
  const wrapped=Buffer.concat([Buffer.alloc(13,77),db,Buffer.alloc(15,66)]);
  assert.equal(reader.parseDTM(wrapped.subarray(13,13+db.length)).faceCount,2);
});
test('binary parser rejects every strict prefix instead of returning partial geometry',()=>{
  for(let end=0;end<sb.length;end++)assert.throws(()=>reader.parseSTR(sb.subarray(0,end)),undefined,'STR prefix '+end);
  for(let end=0;end<db.length;end++)assert.throws(()=>reader.parseDTM(db.subarray(0,end)),undefined,'DTM prefix '+end);
});
test('text parser rejects absent END even when all known triangles precede truncation',()=>{
  assert.throws(()=>reader.parseSTR(str.slice(0,str.lastIndexOf('END'))),/END/);
  assert.throws(()=>reader.parseDTM(dtm.replace(/END\n$/,'')),/END/);
});
test('multiple object/trisolation identifiers become separate meshes',()=>{
  const topology=binaryDTM([{objectId:3,trisolationId:9,faces:[[1,2,4]]},{objectId:7,trisolationId:9,faces:[[2,5,4]]}]);
  const result=reader.parsePair(topology,sb,{dtmName:'unidades.dtm'});
  assert.equal(result.meshes.length,2);
  assert.deepEqual(plain(result.meshes.map(m=>[m.objectId,m.trisolationId])),[[3,9],[7,9]]);
  assert.equal(result.meshes[0].name,'unidades_obj3_tri9');
});
test('multiple text trisolations under one object preserve identity',()=>{
  const t=dtm.replace('2,2,5,4,0,0,1','TRISOLATION,3,litologia\n2,2,5,4,0,0,1');
  assert.deepEqual(plain(reader.parsePair(t,str).meshes.map(m=>m.trisolationId)),[2,3]);
});
test('out of range and terminator node references fail with their original triangle identifier',()=>{
  assert.throws(()=>reader.parsePair(dtm.replace('1,1,2,4','99,1,2,99'),str),/triângulo 99.*nó 99/);
  assert.throws(()=>reader.parsePair(dtm.replace('1,1,2,4','1,1,2,3'),str),/nó 3.*terminador/);
});
test('non-finite binary and text point coordinates are rejected',()=>{
  assert.throws(()=>reader.parseSTR(str.replace('1,20,10,100','1,20,10,NaN')),/inválido/);
  assert.throws(()=>reader.parseSTR(binarySTR([[0,0,Infinity]])),/não finita/);
});
test('fractional, blank and zero node identifiers are not rounded or accepted',()=>{
  for(const id of ['1.5','','0'])assert.throws(()=>reader.parsePair(dtm.replace('1,1,2,4','1,'+id+',2,4'),str),/inválido/);
});
test('duplicate node triangles and duplicate group identifiers are rejected',()=>{
  assert.throws(()=>reader.parsePair(dtm.replace('1,1,2,4','1,1,1,4'),str),/nós repetidos/);
  assert.throws(()=>reader.parseDTM(dtm.replace('2,2,5,4','TRISOLATION,2\n2,2,5,4')),/repetido/);
});
test('invalid neighbours and incomplete text records cannot be silently skipped',()=>{
  assert.throws(()=>reader.parseDTM(dtm.replace('0,2,0\n2,','0,2\n2,')),/vizinhos incompletos/);
  assert.throws(()=>reader.parseSTR(str.replace('1,20,10,100','1,20')),/incompleto/);
});
test('unexpected content following final marker is rejected',()=>{
  assert.throws(()=>reader.parseSTR(str+'1,1,2,3\n'),/depois/);
  assert.throws(()=>reader.parseDTM(Buffer.concat([db,Buffer.from('trailing')])),/depois/);
});
test('binary unknown record type is not skipped',()=>{
  const corrupt=Buffer.from(db),first=corrupt.indexOf(Buffer.from('END\0'))+4;
  corrupt.writeUInt32BE(21,first);assert.throws(()=>reader.parseDTM(corrupt),/tipo 21/);
});
test('counterpart mismatch warns; .STR/.stx case and matching basename do not',()=>{
  assert.equal(reader.parsePair(db,sb,{strName:'wrong.str'}).warnings.length,1);
  assert.equal(reader.parsePair(db,sb,{strName:'/path/SAMPLE.STX'}).warnings.length,0);
});
test('textual names have no control/HTML delimiters and paths are removed',()=>{
  const result=reader.parsePair(db,sb,{dtmName:'/tmp/<script>\u0000.dtm'});
  assert.ok(!/[<>\u0000]|\/tmp/.test(result.meshes[0].name));
});
test('UTF-8 BOM, CRLF and scientific coordinate notation remain supported',()=>{
  const encoded=new TextEncoder().encode('\uFEFF'+str.replace('1,20,10,100','1,2e1,1e1,1e2').replace(/\n/g,'\r\n'));
  assert.deepEqual(plain(reader.parseSTR(encoded).records[0]),expectedVertices[0]);
});
test('ASCII text with only empty objects is rejected',()=>{
  assert.throws(()=>reader.parseDTM('empty.dtm\nOBJECT,1\nTRISOLATION,1\nEND\n'),/não contém triângulos/);
});

// Optional compatibility test against the user's actual Varioscape writer,
// rather than duplicating the implementation under test as a test oracle.
const varioscapeRoot=process.env.VARIOSCAPE_REVIEW_ROOT||path.resolve(root,'../varioscape-review-MA6TDN/varioscape');
const writerPath=path.join(varioscapeRoot,'fontes/modelagem-3d-v2.12.html');
if(fs.existsSync(writerPath)){
  const html=fs.readFileSync(writerPath,'utf8'),start=html.indexOf('/* SURPACW-START'),end=html.indexOf('/* SURPACW-END');
  assert.ok(start>=0&&end>start,'Original Varioscape writer section missing');
  const source=html.slice(start,end);
  const original=vm.createContext({Uint8Array,Uint32Array,Float64Array,DataView,ArrayBuffer,Map,Date});
  vm.runInContext(source,original,{timeout:2000});
  test('actual Varioscape binary surface writer -> strict GeoMine reader roundtrip',()=>{
    const tris=expectedFaces.flatMap(f=>f.flatMap(i=>expectedVertices[i]));
    const pair=original.surpacSurfaceBytes('writer_roundtrip',Float64Array.from(tris));
    const result=reader.parsePair(pair.dtm,pair.str,{dtmName:'writer_roundtrip.dtm',strName:'writer_roundtrip.str'});
    assert.deepEqual(plain(result.meshes[0].vertices),expectedVertices);
    assert.deepEqual(plain(result.meshes[0].faces),expectedFaces);
  });
  test('actual Varioscape STR writer with two terminated strings preserves DTM record numbering',()=>{
    const strings=[{number:5,pts:expectedVertices.slice(0,2)},{number:8,pts:expectedVertices.slice(2)}];
    const output=original.surpacStrBytes('two_strings',strings);
    assert.deepEqual(plain(reader.parsePair(db,output).meshes[0].vertices),expectedVertices);
  });
  test('bundled Varioscape text sample pair remains compatible',()=>{
    const result=reader.parsePair(fs.readFileSync(path.join(varioscapeRoot,'api/surpac_io/samples/sample.dtm')),
      fs.readFileSync(path.join(varioscapeRoot,'api/surpac_io/samples/sample.str')));
    assert.equal(result.meshes[0].faces.length,2);assert.equal(result.meshes[0].vertices.length,4);
  });
}else console.log('SKIP external Varioscape writer unavailable; set VARIOSCAPE_REVIEW_ROOT to run its compatibility checks.');
console.log('Surpac reader: '+passed+' tests passed.');
