import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const c=vm.createContext({console,ArrayBuffer,Uint8Array,DataView,TextDecoder,TextEncoder});
for(const file of ['surpac-reader.js','borehole-reader.js'])vm.runInContext(fs.readFileSync(path.join(root,'src/modules/geology',file),'utf8'),c);
const api=c.GeoMineBoreholeReader,plain=value=>JSON.parse(JSON.stringify(value));let passed=0;
function test(name,run){run();passed++;console.log('PASS '+name);}
function near(a,b,e=1e-8){assert.ok(Math.abs(a-b)<=e,a+' != '+b);}
function collar(csv='id,x,y,z,depth,az,dip\nBH01,500000,7400000,500,100,0,90\n'){
  return {table:api.parseCSV(csv),map:{id:'id',x:'x',y:'y',z:'z',depth:'depth',az:'az',dip:'dip'}};
}
function survey(csv){return {table:api.parseCSV(csv),map:{id:'id',md:'md',az:'az',dip:'dip'}};}
function intervals(csv,role='lithology',name='Litologia'){
  const table=api.parseCSV(csv),map={id:'id',from:'from',to:'to'};
  if(table.columns.includes('lithology'))map.lithology='lithology';
  if(table.columns.includes('recovery'))map.recovery='recovery';
  if(table.columns.includes('rqd'))map.rqd='rqd';
  return {table,map,role,name};
}
const build=(extra={})=>api.buildCSV({collar:collar(),dipConvention:'down',...extra});

test('CSV comma/semicolon/tab/pipe, BOM, quoted fields, escaped quotes and multiline',()=>{
  const p=api.parseCSV('\uFEFFid;descricao;x\r\n001;"veio; de ""quartzo""\ncom sulfeto";"1.234,56"\r\n');
  assert.deepEqual(plain(p.columns),['id','descricao','x']);assert.equal(p.decimalComma,true);
  assert.equal(p.rows[0][0],'001');assert.equal(p.rows[0][1],'veio; de "quartzo"\ncom sulfeto');
  for(const delimiter of [',','\t','|'])assert.equal(api.parseCSV('id'+delimiter+'x\na'+delimiter+'1').rows[0][1],'1');
});
test('CSV malformed quote/width/header/empty cases fail rather than drop rows',()=>{
  for(const input of ['id,x\n1,"unclosed','id,x\n1,"a"oops','id,x\n1,a"b','id,x\n1,2,3','id,x\n1',
    'id,id\n1,2',',x\n1,2','id,x\n','id,x\n1,\u0000'])assert.throws(()=>api.parseCSV(input));
  assert.equal(api.parseCSV('id,x\n1,2\n\n\n').rows.length,1);
  assert.throws(()=>api.parseCSV('id,x\n1,2',{delimiter:'ab'}),/separador/);
});
test('CSV resource caps reject excessive columns/field before building an unbounded row',()=>{
  assert.throws(()=>api.parseCSV(','.repeat(200000)),/colunas/);
  assert.throws(()=>api.parseCSV('id,x\nF,'+'a'.repeat(api.limits.fieldChars+1)),/campo CSV excessivamente longo/);
});
test('CSV preserves comment-like attribute text but never silently discards comment records',()=>{
  const parsed=api.parseCSV('id,x,notes\n001,5,"# observacao; fissura"');
  assert.equal(parsed.rows[0][2],'# observacao; fissura');
  assert.throws(()=>api.parseCSV('# campaign metadata\nid,x\n001,5'),/valores/);
  assert.throws(()=>api.parseCSV('id,x\n# comment\n001,5'),/valores/);
});
test('CSV brazilian decimals/thousands preserve coordinates and numeric metadata',()=>{
  const result=build({collar:collar('id;x;y;z;depth;az;dip\nF1;500.000,25;7.400.000,5;500,25;10,5;90;45\n')});
  const h=result.holes[0];assert.deepEqual(plain(h.collar),[500000.25,7400000.5,500.25]);near(h.depth,10.5);
  near(h.trace.at(-1).x,500000.25+10.5/Math.sqrt(2));near(h.trace.at(-1).z,500.25-10.5/Math.sqrt(2));
});
test('decimal-comma tables cannot silently reinterpret ambiguous dotted thousands as decimals',()=>{
  assert.throws(()=>build({collar:collar('id;x;y;z;depth;az;dip\nF;500.000;7400000;500,25;10;0;90')}),/ambíguo/);
  const result=build({collar:collar('id;x;y;z;depth;az;dip\nF;500000;7400000;500,25;10;0;90')});
  assert.deepEqual(plain(result.holes[0].collar),[500000,7400000,500.25]);
});
test('single collar orientation: vertical and east-inclined traces preserve metric depth',()=>{
  const v=build().holes[0];assert.equal(v.trace.length,2);near(v.trace[1].z,400);near(v.trace[1].x,500000);
  const h=build({collar:collar('id,x,y,z,depth,az,dip\nF,0,0,10,100,90,45')}).holes[0];
  near(h.trace.at(-1).x,100/Math.sqrt(2));near(h.trace.at(-1).y,0);near(h.trace.at(-1).z,10-100/Math.sqrt(2));
});
test('negative-down and zenith convention normalization are explicit',()=>{
  const down=build({collar:collar('id,x,y,z,depth,az,dip\nF,0,0,100,10,0,-90'),dipConvention:'negative-down'}).holes[0];
  near(down.trace.at(-1).z,90);assert.equal(down.survey[0].dip,90);
  const zenith=build({collar:collar('id,x,y,z,depth,az,dip\nF,0,0,100,10,90,90'),dipConvention:'zenith'}).holes[0];
  near(zenith.trace.at(-1).x,10);near(zenith.trace.at(-1).z,100);
  assert.throws(()=>build({dipConvention:'guess'}),/convenção/);
});
test('down, negative-down and zenith give identical downward and upward physical traces',()=>{
  for(const [normalized,values] of [[60,[60,-60,30]],[-60,[-60,60,150]],[90,[90,-90,0]],[-90,[-90,90,180]]]){
    const outputs=['down','negative-down','zenith'].map((dipConvention,i)=>build({dipConvention,
      collar:collar('id,x,y,z,depth,az,dip\nF,0,0,100,10,75,'+values[i])}));
    const end=outputs[0].holes[0].trace.at(-1);
    outputs.forEach(result=>{
      assert.equal(result.holes[0].survey[0].dip,normalized);
      const p=result.holes[0].trace.at(-1);near(p.x,end.x);near(p.y,end.y);near(p.z,end.z);
      if(normalized<0)assert.ok(result.holes[0].source.warnings.some(w=>/ascendente/.test(w)));
    });
  }
});
test('minimum curvature matches analytical 90-degree horizontal dogleg endpoint',()=>{
  const s=survey('id,md,az,dip\nBH01,0,0,0\nBH01,100,90,0'),h=build({survey:s}).holes[0];
  const radius=200/Math.PI;near(h.trace.at(-1).x,500000+radius,1e-7);near(h.trace.at(-1).y,7400000+radius,1e-7);
  near(h.trace.at(-1).z,500);assert.ok(h.trace.length>100);assert.equal(h.trace.at(-1).md,100);
});
test('minimum curvature densification remains on analytical circular arc in vertical plane',()=>{
  const h=build({survey:survey('id,md,az,dip\nBH01,0,0,90\nBH01,100,0,0')}).holes[0];
  const p=h.trace.find(p=>p.md===50),r=200/Math.PI;assert.ok(p);
  near(p.y,7400000+r*(1-Math.cos(Math.PI/4)),1e-7);near(p.z,500-r*Math.sin(Math.PI/4),1e-7);
  near(h.trace.at(-1).y,7400000+r,1e-7);near(h.trace.at(-1).z,500-r,1e-7);
});
test('survey stations included exactly; non-monotone input sorted with warning',()=>{
  const result=build({survey:survey('id,md,az,dip\nBH01,100,40,60\nBH01,7,20,50\nBH01,0,0,90')});
  assert.ok(result.warnings.some(w=>/ordenadas/.test(w)));assert.ok(result.holes[0].trace.some(p=>p.md===7));
  assert.deepEqual(plain(result.holes[0].survey.map(s=>s.md)),[0,7,100]);
});
test('missing collar orientation requires survey or explicit vertical assumption',()=>{
  const m=collar('id,x,y,z,depth\nF,0,0,100,10');delete m.map.az;delete m.map.dip;
  assert.throws(()=>build({collar:m}),/falta survey/);
  const result=build({collar:m,allowVertical:true});near(result.holes[0].trace.at(-1).z,90);
  assert.match(result.warnings[0],/vertical assumida/);
});
test('first survey after zero gets collar orientation or declared inferred station',()=>{
  const withCollar=build({survey:survey('id,md,az,dip\nBH01,20,90,30\nBH01,100,90,30')});
  assert.equal(withCollar.holes[0].survey[0].md,0);assert.equal(withCollar.holes[0].survey[0].dip,90);
  assert.ok(withCollar.warnings.some(w=>/obtida do collar/.test(w)));
  const c=collar('id,x,y,z,depth\nBH01,0,0,100,100');delete c.map.az;delete c.map.dip;
  const inferred=build({collar:c,survey:survey('id,md,az,dip\nBH01,20,90,30\nBH01,100,90,30')});
  assert.equal(inferred.holes[0].survey[0].dip,30);assert.ok(inferred.warnings.some(w=>/inferida da primeira/.test(w)));
});
test('missing depth inferred only from observed interval/survey with warning',()=>{
  const c=collar('id,x,y,z,az,dip\nF,0,0,100,0,90');delete c.map.depth;
  const result=build({collar:c,intervals:[intervals('id,from,to,lithology\nF,0,12,Xisto')]});
  assert.equal(result.holes[0].depth,12);assert.ok(result.warnings.some(w=>/inferida/.test(w)));
  const only=build({collar:c}).holes[0];assert.equal(only.depth,null);assert.equal(only.trace.length,1);assert.equal(only.source.method,'collar-only');
});
test('collar alone needs no survey, lithology, assays, depth or invented vertical assumption',()=>{
  const table=api.parseCSV('ID,X,Y,Z\n0007,500000,7400000,350'),result=api.buildCSV({collar:{table,map:{id:'ID',x:'X',y:'Y',z:'Z'}}});
  const hole=result.holes[0];assert.equal(hole.id,'0007');assert.equal(hole.depth,null);
  assert.deepEqual(plain(hole.trace),[{x:500000,y:7400000,z:350,md:0}]);assert.deepEqual(plain(hole.survey),[]);
  assert.deepEqual(plain(hole.geologyLog),[]);assert.deepEqual(plain(hole.tables),[]);assert.equal(hole.source.depthBasis,'unknown');
  assert.ok(result.warnings.some(w=>/somente boca/.test(w)));
});
test('collar plus assay does not invent lithology; optional tables join by the preserved hole ID',()=>{
  const result=build({intervals:[intervals('id,from,to,Au_ppm\nBH01,0,40,1.2','assay','assay')]});
  assert.equal(result.holes[0].geologyLog.length,0);assert.equal(result.holes[0].tables[0].role,'assay');
  assert.equal(result.holes[0].tables[0].intervals[0].attributes.Au_ppm,'1.2');
});
test('collar IDs preserve zero prefixes and special object keys without prototype collisions',()=>{
  const result=build({collar:collar('id,x,y,z,depth,az,dip\n001,0,0,0,10,0,90\n__proto__,10,0,0,10,0,90')});
  assert.deepEqual(plain(result.holes.map(h=>h.id)),['001','__proto__']);
});
test('duplicate collar/survey and orphan survey/interval fail atomically',()=>{
  assert.throws(()=>build({collar:collar('id,x,y,z,depth,az,dip\nF,0,0,0,10,0,90\nF,1,0,0,10,0,90')}),/duplicado/);
  assert.throws(()=>build({survey:survey('id,md,az,dip\nBH01,0,0,90\nBH01,0,0,90')}),/duplicadas/);
  assert.throws(()=>build({survey:survey('id,md,az,dip\nUNKNOWN,0,0,90')}),/não existe/);
  assert.throws(()=>build({intervals:[intervals('id,from,to,lithology\nUNKNOWN,0,10,Xisto')]}),/não existe/);
});
test('invalid numeric suffixes, angles and depths are never truncated/coerced',()=>{
  for(const csv of ['id,x,y,z,depth,az,dip\nF,12x,0,0,10,0,90','id,x,y,z,depth,az,dip\nF,0,0,0,-1,0,90',
    'id,x,y,z,depth,az,dip\nF,0,0,0,0,0,90','id,x,y,z,depth,az,dip\nF,0,0,0,10,361,90',
    'id,x,y,z,depth,az,dip\nF,0,0,0,10,0,91','id,x,y,z,depth,az,dip\nF,0,0,0,10,0,',
    'id,x,y,z,depth,az,dip\nF,Infinity,0,0,10,0,90'])assert.throws(()=>build({collar:collar(csv)}));
  assert.throws(()=>build({survey:survey('id,md,az,dip\nBH01,-1,0,90')}),/negativa/);
  assert.throws(()=>build({survey:survey('id,md,az,dip\nBH01,101,0,90')}),/ultrapassam/);
  assert.throws(()=>build({survey:survey('id,md,az,dip\nBH01,0,0,0\nBH01,100,180,0')}),/180/);
});
test('lithology, core and arbitrary assay attributes survive in independent tables',()=>{
  const result=build({intervals:[
    intervals('id,from,to,lithology,description\nBH01,0,20,Xisto,muscovita\nBH01,20,100,Calcario,bandado'),
    intervals('id,from,to,recovery,rqd,lithology\nBH01,0,10,95,80,Xisto','core','Testemunho'),
    intervals('id,from,to,Au_ppm\nBH01,0,5,1.2\nBH01,5,10,0.9','assay','Ensaios')]});
  const h=result.holes[0];assert.equal(h.geologyLog.length,2);assert.equal(h.coreRuns.length,1);assert.equal(h.tables.length,3);
  assert.equal(h.geologyLog[0].attributes.description,'muscovita');assert.equal(h.coreRuns[0].REC_PCT,95);assert.equal(h.coreRuns[0].RQD_PCT,80);
  assert.equal(h.tables[2].rows[0][3],'1.2');assert.deepEqual(plain(h.tables[2].columns),['id','from','to','Au_ppm']);
});
test('drill table mapped to lithology feeds logs and overlapping lithology tables fail',()=>{
  const drill=intervals('id,from,to,lithology\nBH01,0,100,Xisto','drill','Drill');
  const result=build({intervals:[drill]});assert.equal(result.holes[0].geologyLog.length,1);
  assert.equal(result.holes[0].geologyLog[0].source.role,'drill');
  assert.throws(()=>build({intervals:[drill,intervals('id,from,to,lithology\nBH01,10,50,Calcario')]}),/sobrepostos/);
});
test('aggregate table budget prevents oversized campaign before survey allocation',()=>{
  const columns=['id','md','az','dip','a','b','c','d'],row=['BH01','0','0','90','','','',''];
  const spec={table:{columns,rows:new Array(250000).fill(row)},map:{id:0,md:1,az:2,dip:3}};
  assert.throws(()=>build({survey:spec}),/conjunto de tabelas/);
});
test('invalid reversed/negative/overlapping/excess-depth intervals rejected',()=>{
  for(const rows of ['BH01,10,0,Xisto','BH01,-1,10,Xisto','BH01,1,1,Xisto','BH01,0,101,Xisto','BH01,0,20,Xisto\nBH01,15,30,Calcario'])
    assert.throws(()=>build({intervals:[intervals('id,from,to,lithology\n'+rows)]}));
  assert.throws(()=>build({intervals:[intervals('id,from,to,lithology\nBH01,0,20,Xisto'),intervals('id,from,to,lithology\nBH01,10,30,Calcario')]}),/sobrepostos/);
});
test('recovery/RQD require finite numeric percentages in [0,100]',()=>{
  for(const pct of ['-1','101','NaN','50x'])assert.throws(()=>build({intervals:[intervals('id,from,to,recovery,rqd\nBH01,0,10,'+pct+',50','core')]}));
});
test('column map accepts numeric indices and select index strings without mutating tables',()=>{
  const spec=collar(),before=JSON.stringify(spec);spec.map={id:0,x:'1',y:2,z:'3',depth:4,az:5,dip:6};
  const tableBefore=JSON.stringify(spec.table);assert.equal(build({collar:spec}).holes[0].id,'BH01');assert.equal(JSON.stringify(spec.table),tableBefore);
  assert.ok(before.length>0);assert.throws(()=>build({collar:{...spec,map:{...spec.map,x:'missing'}}}),/inexistente/);
});
test('mapping cannot reuse a coordinate/depth/ID column and numeric header names are unambiguous',()=>{
  const bad=collar();bad.map.y='x';assert.throws(()=>build({collar:bad}),/foi escolhida/);
  const s=survey('id,md,az,dip\nBH01,0,0,90');s.map.dip='az';assert.throws(()=>build({survey:s}),/foi escolhida/);
  const table=api.parseCSV('id,1,y,z,depth,az,dip\n0007,11,22,100,10,0,90');
  const result=build({collar:{table,map:{id:'id',x:'1',y:'y',z:'z',depth:'depth',az:'az',dip:'dip'}}});
  assert.equal(result.holes[0].id,'0007');assert.deepEqual(plain(result.holes[0].collar),[11,22,100]);
});
test('public desurvey API rejects invalid/empty/out-of-order normalized stations',()=>{
  for(const stations of [[],[{md:1,az:0,dip:90}],[{md:0,az:0,dip:91}],[{md:0,az:0,dip:90},{md:0,az:0,dip:90}],
    [{md:0,az:0,dip:90},{md:11,az:0,dip:90}]])assert.throws(()=>api.desurvey(stations,10,[0,0,0]));
  assert.throws(()=>api.desurvey([{md:0,az:0,dip:90}],-1,[0,0,0]));
});
const str='furos,22-Sep-26,,\n0,0,0,0\n7,20,10,100,F01,topo\n7,20,10,90,F01,base\n0,0,0,0,END\n8,40,30,100,F02\n8,44,33,88,F02\n0,0,0,0,END\nEND\n';
test('STR segments retain original descriptions and independent string numbering',()=>{
  const parsed=c.GeoMineSurpacReader.parseSTR(str);assert.equal(parsed.strings.length,2);
  assert.equal(parsed.strings[0].number,7);assert.equal(parsed.strings[0].descs[0],'F01,topo');assert.equal(parsed.records[2],null);
  const result=api.buildSTR(str,{idMode:'description'});assert.deepEqual(plain(result.holes.map(h=>h.id)),['F01','F02']);
  assert.deepEqual(plain(result.holes[0].collar),[10,20,100]);assert.equal(result.holes[0].depth,10);assert.equal(result.holes[1].depth,13);
  assert.equal(result.holes[1].trace.at(-1).md,13);assert.match(result.warnings[0],/geométrico/);
});
test('STR reverse explicit choice and number-based IDs preserve original XYZ',()=>{
  const result=api.buildSTR(str,{idMode:'number',reverse:true});assert.deepEqual(plain(result.holes[0].collar),[10,20,90]);
  assert.equal(result.holes[0].id,'7');assert.equal(result.holes[0].depth,10);assert.equal(result.holes[0].survey[0].dip,-90);
  assert.ok(result.warnings.some(w=>/invertida/.test(w)));
});
test('STR reversal cannot rename a hole using bottom description instead of original ID',()=>{
  const different=str.replace('F01,base','litologia no fundo');
  assert.equal(api.buildSTR(different,{idMode:'description',reverse:true}).holes[0].id,'F01');
  const zeroIDs=str.replaceAll('F01','0007').replaceAll('F02','0008');
  assert.deepEqual(plain(api.buildSTR(zeroIDs).holes.map(h=>h.id)),['0007','0008']);
});
test('STR repeated segments with same string number require unique descriptions or explicit correction',()=>{
  const repeated=str.replaceAll('8,','7,');
  assert.equal(api.buildSTR(repeated,{idMode:'description'}).holes.length,2);
  assert.throws(()=>api.buildSTR(repeated,{idMode:'number'}),/repetido/);
});
test('STR per-segment cap is enforced while parsing, before constructing a large trace',()=>{
  const long='furos,22-Sep-26,,\n0,0,0,0\n'+Array.from({length:12001},(_,i)=>'1,0,0,'+i+',F01').join('\n')+'\n0,0,0,0,END\nEND';
  assert.throws(()=>api.buildSTR(long),/12000 pontos/);
  assert.throws(()=>c.GeoMineSurpacReader.parseSTR(str,{maxPoints:3}),/limite seguro/);
  assert.throws(()=>c.GeoMineSurpacReader.parseSTR(str,{maxStrings:1}),/strings excede/);
});
test('STR empty descriptions, repeated IDs, singleton/duplicate points and truncation fail',()=>{
  assert.throws(()=>api.buildSTR(str.replaceAll('F01','F02')),/repetido/);
  assert.throws(()=>api.buildSTR(str.replaceAll(/,F0[12](?:,(?:topo|base))?/g,'')),/sem descrição/);
  assert.throws(()=>api.buildSTR(str.replace('7,20,10,90,F01,base\n','')),/dois pontos/);
  assert.throws(()=>api.buildSTR(str.replace('7,20,10,90','7,20,10,100')),/coincidentes/);
  assert.throws(()=>api.buildSTR(str.slice(0,-4)),/END/);
});

const originalPath=path.resolve(root,'../varioscape-review-MA6TDN/varioscape/fontes/modelagem-3d-v2.12.html');
if(fs.existsSync(originalPath)){
  const original=fs.readFileSync(originalPath,'utf8'),source=original.slice(original.indexOf('function dirVec('),original.indexOf('function pathPointAt('));
  const engine=vm.createContext({Math});vm.runInContext(source,engine);
  test('constant-orientation trajectory agrees with actual Varioscape desurvey engine',()=>{
    const expected=engine.desurveyHole([{at:0,d:engine.dirVec(123,45)}],100,1200),actual=build({collar:collar('id,x,y,z,depth,az,dip\nF,0,0,0,100,123,45')}).holes[0].trace.at(-1);
    near(actual.x,expected.px.at(-1));near(actual.y,expected.py.at(-1));near(actual.z,expected.pz.at(-1));
  });
  const start=original.indexOf('/* SURPACW-START'),end=original.indexOf('/* SURPACW-END');
  const writer=vm.createContext({Uint8Array,Uint32Array,Float64Array,DataView,ArrayBuffer,Map,Date});vm.runInContext(original.slice(start,end),writer);
  test('original Varioscape binary STR writer roundtrip retains hole IDs and XYZ',()=>{
    const binary=writer.surpacStrBytes('holes',[{number:1,pts:[[10,20,100],[10,20,90]],descs:['DH-1,top','DH-1,bottom']},
      {number:2,pts:[[50,60,100],[53,64,88]],desc:'DH-2'}]);
    const result=api.buildSTR(binary);assert.deepEqual(plain(result.holes.map(h=>h.id)),['DH-1','DH-2']);
    assert.equal(result.holes[1].depth,13);assert.deepEqual(plain(result.holes[1].collar),[50,60,100]);
  });
  test('binary STR keeps zero-prefixed description IDs and bounded segment parsing',()=>{
    const binary=writer.surpacStrBytes('holes',[{number:7,pts:[[0,0,100],[0,0,90]],descs:['0007,top','base']},
      {number:7,pts:[[1,0,100],[1,0,90]],desc:'0008'}]);
    assert.deepEqual(plain(api.buildSTR(binary,{reverse:true}).holes.map(h=>h.id)),['0007','0008']);
    assert.throws(()=>api.buildSTR(binary,{idMode:'number'}),/repetido/);
    assert.throws(()=>c.GeoMineSurpacReader.parseSTR(binary,{maxSegmentPoints:1}),/1 pontos/);
  });
}else console.log('SKIP original Varioscape source compatibility check (review folder unavailable).');
console.log('Borehole reader: '+passed+' tests passed.');
