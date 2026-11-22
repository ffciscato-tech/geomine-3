const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context={TextDecoder,console};vm.createContext(context);context.window=context;
vm.runInContext(fs.readFileSync(path.join(__dirname,'surpac-reader.js'),'utf8'),context);
const R=context.GeoMineSurpacReader;

/* Arquivos binários sintéticos, no leiaute conferido em arquivos reais do Surpac:
   STR  — cabeçalho, registro de eixo em texto, 5 zeros, registros [n u32][Y f64][X f64][Z f64][descrição NUL], todos big-endian,
          registro nulo (n=0) fechando cada segmento e registro n=0 "END" no fim;
   DTM  — cabeçalho "nome.str,…", 5 zeros, seção de strings até o registro END, registros [tipo u32][número u32]…
          (1 OBJECT, 2 TRISOLATION, 3 triângulo com 3 nós + 3 vizinhos) e 8 bytes 0xFF no fim. */
const EIXO='0,           0.000,           0.000,           0.000,           0.000,           0.000,           0.000\r\n';
function registro(n,y,x,z,d){
  const b=Buffer.alloc(28);b.writeUInt32BE(n,0);b.writeDoubleBE(y,4);b.writeDoubleBE(x,12);b.writeDoubleBE(z,20);
  return Buffer.concat([b,Buffer.from((d||'')+'\0','latin1')]);
}
function strBin(recs,header='teste,22-Nov-26,,teste.ssi'){
  return new Uint8Array(Buffer.concat([Buffer.from(header+'\r\n'+EIXO,'latin1'),Buffer.alloc(5),...recs.map(r=>registro(...r)),registro(0,0,0,0,'END')]));
}
function dtmBin(itens,proprios=[],header='teste.str,0123456789;algorithm=standard;fields=x,y'){
  const partes=[Buffer.from(header+'\r\n','latin1'),Buffer.alloc(5),...proprios.map(r=>registro(...r)),registro(0,0,0,0,'END')];
  for(const it of itens){
    if(it[0]==='O'||it[0]==='T'){
      const b=Buffer.alloc(8);b.writeUInt32BE(it[0]==='O'?1:2,0);b.writeUInt32BE(it[1],4);partes.push(b,Buffer.from((it[2]||'')+'\0','latin1'));
    }else{
      const b=Buffer.alloc(32);b.writeUInt32BE(3,0);for(let k=0;k<7;k++)b.writeUInt32BE(it[k]||0,4+4*k);partes.push(b,Buffer.from((it[7]||'')+'\0','latin1'));
    }
  }
  partes.push(Buffer.alloc(8,0xff));
  return new Uint8Array(Buffer.concat(partes));
}
const ABERTA='neighbours=yes,validated=true,closed=no,algorithm=retriangulation';
// Duas strings: um quadrado (string 1) e um ponto central (string 7). Os terminadores ocupam os registros 5 e 7.
const QUADRADO=[[1,7000000,300000,100,',BORDA'],[1,7000000,300010,101,',BORDA'],[1,7000010,300010,102,',BORDA'],[1,7000010,300000,103,''],
  [0,0,0,0,''],[7,7000005,300005,110,'centro,pico'],[0,0,0,0,'']];
// Nós do DTM = posição do registro no STR, contando os terminadores: o centro é o registro 6.
const LEQUE=[['O',2,''],['T',1,ABERTA],[1,1,2,6,0,2,4],[2,2,3,6,0,3,1],[3,3,4,6,0,4,2],[4,4,1,6,0,1,3]];
const lista=a=>Array.from(a),puro=v=>JSON.parse(JSON.stringify(v));   // o leitor roda em outro contexto: compara só os valores

test('STR binário: registros, terminadores e descrições iguais nas duas leituras',()=>{
  const bytes=strBin(QUADRADO),a=R.parseSTR(bytes),c=R.compactSTR(bytes);
  assert.equal(a.records.length,8);assert.equal(c.count,8);            // 7 registros + END
  assert.equal(a.pointCount,5);assert.equal(c.pointCount,5);
  assert.deepEqual(lista(c.number),[1,1,1,1,0,7,0,0]);
  assert.deepEqual([c.x[1],c.y[1],c.z[1]],[300010,7000000,101]);       // Surpac grava Y,X,Z; o leitor devolve X,Y,Z
  assert.deepEqual(puro(a.records[1]),[300010,7000000,101]);assert.equal(a.records[4],null);
  assert.deepEqual([0,1,2,3,4,5,6,7].map(i=>c.description(i)),[',BORDA',',BORDA',',BORDA','','','centro,pico','','END']);
  assert.deepEqual(puro(a.strings.map(s=>[s.number,s.pts.length,s.descs[0]])),[[1,4,',BORDA'],[7,1,'centro,pico']]);
  assert.equal(c.header,'teste,22-Nov-26,,teste.ssi');assert.equal(c.binary,true);
  // a mesma leitura a partir de uma vista deslocada dentro de um buffer maior
  const maior=new Uint8Array(bytes.length+13);maior.set(bytes,13);
  assert.deepEqual(lista(R.compactSTR(maior.subarray(13)).x),lista(c.x));
});

test('par binário: os nós do DTM contam os terminadores do STR',()=>{
  const str=strBin(QUADRADO),dtm=dtmBin(LEQUE),p=R.parsePair(dtm,str),c=R.compactPair(dtm,str);
  assert.equal(p.meshes.length,1);assert.equal(p.meshes[0].faces.length,4);assert.equal(p.meshes[0].objectId,2);
  // o vértice comum às quatro faces é o centro (registro 6), não o terminador (registro 5)
  const centro=p.meshes[0].vertices[p.meshes[0].faces[0][2]];
  assert.deepEqual(puro(centro),[300005,7000005,110]);
  assert.equal(c.dtm.faceCount,4);assert.deepEqual(lista(c.dtm.nodes),[0,1,5,1,2,5,2,3,5,3,0,5]);
  assert.deepEqual(puro(c.dtm.groups),[{objectId:2,trisolationId:1,objectText:'',trisolationText:ABERTA,first:0,count:4}]);
  assert.equal(c.str.z[c.dtm.nodes[2]],110);assert.deepEqual(lista(c.warnings),[]);
});

test('DTM com pontos próprios antes do END: lido, e os nós continuam valendo para o .str',()=>{
  const str=strBin(QUADRADO);
  // Arquivos reais trazem 21 ou 39 registros de string dentro do .dtm; os triângulos não os indexam.
  const proprios=[];for(let i=0;i<21;i++)proprios.push([32000,7000000+i,300000-i,50+i,i%3?',LIMITE':'']);
  proprios.push([0,0,0,0,'']);
  const dtm=dtmBin(LEQUE,proprios),p=R.parsePair(dtm,str),c=R.compactPair(dtm,str),d=R.parseDTM(dtm);
  assert.equal(d.faceCount,4);assert.equal(p.meshes[0].faces.length,4);
  assert.deepEqual(lista(c.dtm.nodes),[0,1,5,1,2,5,2,3,5,3,0,5]);
  assert.equal(Math.max(...p.meshes[0].vertices.map(v=>v[2])),110);     // cotas do .str, não as dos pontos embutidos
  // descrição "END" no meio de um ponto não encerra a seção: só o registro de número zero
  const comEnd=dtmBin(LEQUE,[[5,1,2,3,'END'],[0,0,0,0,'']]);
  assert.equal(R.compactDTM(comEnd).faceCount,4);assert.equal(R.parseDTM(comEnd).faceCount,4);
});

test('vários objetos e trisolations: grupos e faces iguais nas duas leituras',()=>{
  // grade 30 × 20 em duas strings, com um terminador a cada linha da grade
  const recs=[],id=[];let n=0;
  for(let j=0;j<20;j++){for(let i=0;i<30;i++){recs.push([j%2?2:1,7000000+5*j,300000+5*i,100+((i*7+j*13)%11)/10,j%4?',CLOUD_001':'']);id.push(++n);}recs.push([0,0,0,0,'']);n++;}
  const no=(i,j)=>id[j*30+i],itens=[];let t=0;
  const faixa=(j0,j1)=>{for(let j=j0;j<j1;j++)for(let i=0;i<29;i++){itens.push([++t,no(i,j),no(i+1,j),no(i+1,j+1),0,0,0],[++t,no(i,j),no(i+1,j+1),no(i,j+1),0,0,0]);}};
  itens.push(['O',1,'terreno'],['T',1,ABERTA]);faixa(0,8);itens.push(['T',2,ABERTA]);faixa(8,12);itens.push(['O',5,'pilha'],['T',1,ABERTA]);faixa(12,19);
  const str=strBin(recs),dtm=dtmBin(itens),p=R.parsePair(dtm,str),c=R.compactPair(dtm,str);
  assert.deepEqual(puro(c.dtm.groups.map(g=>[g.objectId,g.trisolationId,g.objectText,g.first,g.count])),[[1,1,'terreno',0,464],[1,2,'terreno',464,232],[5,1,'pilha',696,406]]);
  assert.deepEqual(puro(p.meshes.map(m=>[m.objectId,m.trisolationId,m.faces.length])),[[1,1,464],[1,2,232],[5,1,406]]);
  let k=0;
  for(const m of p.meshes)for(const f of m.faces)for(const v of f){
    const q=c.dtm.nodes[k++],w=m.vertices[v];
    assert(w[0]===c.str.x[q]&&w[1]===c.str.y[q]&&w[2]===c.str.z[q]);
  }
  assert.equal(k,3*c.dtm.faceCount);
});

test('formato em texto: STR com END no registro e DTM com a seção de strings do manual',()=>{
  const str='teste,22-Nov-26,,teste.ssi\n0, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000\n'+
    '1, 7000000.000, 300000.000, 100.000, ,BORDA\n1, 7000000.000, 300010.000, 101.000, ,BORDA\n1, 7000010.000, 300010.000, 102.000, ,BORDA\n1, 7000010.000, 300000.000, 103.000, \n'+
    '0, 0.000, 0.000, 0.000,\n7, 7000005.000, 300005.000, 110.000, centro,pico\n0, 0.000, 0.000, 0.000,\n0, 0.000, 0.000, 0.000, END\n';
  // 2ª linha "0, …, END" encerra a seção de strings do DTM; os pontos próprios antes dela não são triângulos
  const dtm='teste.str,0123456789;algorithm=standard;fields=x,y\n32000, 7000000.500, 300000.500, 50.000, LIMITE\n32000, 7000001.500, 300001.500, 51.000,\n'+
    '0, 0.000, 0.000, 0.000, END\nOBJECT, 2,\nTRISOLATION, 1, neighbours=no,validated=true,closed=no\n'+
    '1, 1, 2, 6, 0, 2, 4,\n2, 2, 3, 6, 0, 3, 1,\n3, 3, 4, 6, 0, 4, 2,\n4, 4, 1, 6, 0, 1, 3,\nEND\n';
  const c=R.compactPair(dtm,str),p=R.parsePair(dtm,str,{allowRecordEnd:true});
  assert.equal(c.str.binary,false);assert.equal(c.str.count,8);assert.deepEqual(lista(c.str.number),[1,1,1,1,0,7,0,0]);
  assert.deepEqual([0,3,5].map(i=>c.str.description(i)),[',BORDA','','centro,pico']);
  assert.deepEqual(lista(c.dtm.nodes),[0,1,5,1,2,5,2,3,5,3,0,5]);assert.equal(c.dtm.groups[0].trisolationText,'neighbours=no,validated=true,closed=no');
  assert.equal(p.meshes[0].faces.length,4);
  // texto e binário do mesmo conteúdo dão a mesma leitura
  const b=R.compactPair(dtmBin(LEQUE),strBin(QUADRADO));
  assert.deepEqual(lista(c.str.x),lista(b.str.x));assert.deepEqual(lista(c.str.z),lista(b.str.z));assert.deepEqual(lista(c.dtm.nodes),lista(b.dtm.nodes));
  // os mesmos textos entregues como bytes (arquivo lido do disco)
  const bytes=t=>new Uint8Array(Buffer.from(t,'latin1'));
  assert.deepEqual(lista(R.compactPair(bytes(dtm),bytes(str)).dtm.nodes),lista(c.dtm.nodes));
  // leiaute antigo, sem a seção de strings e sem OBJECT/TRISOLATION, continua valendo
  const simples='teste.str,25-Oct-26,,\nOBJECT,1\nTRISOLATION,1\n1,1,2,3\nEND\n',semGrupo='teste.str,25-Oct-26,,\n1,1,2,3\n2,1,3,4\nEND\n';
  assert.equal(R.parseDTM(simples).faceCount,1);assert.equal(R.parseDTM(semGrupo).faceCount,2);assert.equal(R.compactDTM(semGrupo).groups[0].count,2);
});

test('par errado, arquivo truncado e limites são recusados com motivo',()=>{
  const str=strBin(QUADRADO),dtm=dtmBin(LEQUE);
  // .str de outra superfície: nó além dos registros, ou em cima de um terminador
  const curto=strBin(QUADRADO.slice(0,4));
  assert.throws(()=>R.compactPair(dtm,curto),/nó 6 ausente ou terminador no STR.*par correto/);
  assert.throws(()=>R.parsePair(dtm,curto),/nó 6 ausente ou terminador/);
  assert.throws(()=>R.compactPair(dtmBin([['O',1,''],['T',1,ABERTA],[1,1,2,5,0,0,0]]),str),/nó 5 ausente ou terminador/);
  // truncados
  assert.throws(()=>R.compactSTR(str.subarray(0,str.length-2)),/truncado/);
  assert.throws(()=>R.compactSTR(str.subarray(0,str.length-40)),/truncado|END ausente/);
  assert.throws(()=>R.compactDTM(dtm.subarray(0,dtm.length-8)),/terminador final ausente/);
  assert.throws(()=>R.compactDTM(dtm.subarray(0,dtm.length-20)),/truncado/);
  assert.throws(()=>R.parseDTM(dtm.subarray(0,dtm.length-20)),/truncado/);
  // lixo depois do fim, triângulo degenerado, tipo desconhecido, sem triângulos
  const lixo=new Uint8Array(dtm.length+3);lixo.set(dtm);lixo.set([1,2,3],dtm.length);
  assert.throws(()=>R.compactDTM(lixo),/dados inesperados/);
  assert.throws(()=>R.compactDTM(dtmBin([['O',1,''],['T',1,ABERTA],[1,2,2,3,0,0,0]])),/nós repetidos/);
  assert.throws(()=>R.compactDTM(dtmBin([['O',1,''],['T',1,ABERTA],[1,0,2,3,0,0,0]])),/nó zero/);
  assert.throws(()=>R.compactDTM(dtmBin([['O',1,''],['T',1,ABERTA]])),/não contém triângulos/);
  assert.throws(()=>R.compactDTM(dtmBin([['O',1,''],['T',1,ABERTA],[1,1,2,3],['T',1,ABERTA],[2,1,2,3]])),/trisolation 1 repetido/);
  // seção de strings sem END: não se procura END no arquivo inteiro
  const semEnd=Buffer.concat([Buffer.from('teste.str,1;algorithm=standard;fields=x,y\r\n','latin1'),Buffer.alloc(5),registro(3,1,2,3,'x'),Buffer.alloc(8,0xff)]);
  assert.throws(()=>R.compactDTM(new Uint8Array(semEnd)),/END ausente/);assert.throws(()=>R.parseDTM(new Uint8Array(semEnd)),/END ausente/);
  // limites pedidos por quem chama
  assert.throws(()=>R.compactSTR(str,{maxRecords:5}),/mais de 5 registros/);
  assert.throws(()=>R.compactDTM(dtm,{maxInputFaces:3}),/mais de 3 triângulos/);
  assert.throws(()=>R.compactSTR(str,{maxRecords:0}),/limite de registros inválido/);
  assert.throws(()=>R.compactSTR(new Uint8Array(0)),/vazio/);
  // coordenada não finita
  const ruim=strBin([[1,NaN,2,3,'']]);assert.throws(()=>R.compactSTR(ruim),/não finita/);
  // só terminadores
  assert.throws(()=>R.compactSTR(strBin([[0,0,0,0,'']])),/não contém coordenadas/);
});

test('aviso quando o cabeçalho do DTM cita outro .str',()=>{
  const c=R.compactPair(dtmBin(LEQUE),strBin(QUADRADO),{dtmName:'a.dtm',strName:'outro.str'});
  assert.equal(c.warnings.length,1);assert.match(c.warnings[0],/teste\.str.*outro\.str/);
  assert.equal(R.compactPair(dtmBin(LEQUE),strBin(QUADRADO),{dtmName:'a.dtm',strName:'TESTE.STR'}).warnings.length,0);
});
