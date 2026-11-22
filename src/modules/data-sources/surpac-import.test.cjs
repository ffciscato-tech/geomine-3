const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
/* O importador roda dentro do script principal do GeoMine; aqui ele recebe só o que usa de lá. */
const chamadas={camadas:[],superficies:[],toasts:[],log:[],pedidos:[]};
const context={TextDecoder,console,setTimeout,
  S:{workCRS:'EPSG:31983',_loadCancel:false},
  CRS_LABELS:{'EPSG:31983':'SIRGAS 2000 / UTM 23S','EPSG:29193':'SAD69 / UTM 23S','EPSG:4674':'SIRGAS 2000 (geográfica)'},
  showLoad(){},hideLoad(){},refreshUI(){},refreshTinPanel(){},drawLayer(){},
  cedeUI:()=>Promise.resolve(),
  toast:m=>chamadas.toasts.push(String(m)),cmdLog:(m,t)=>chamadas.log.push([t,String(m)]),
  addLayer(o){const L={...o,sym:{mode:'single',field:'',cats:[]}};chamadas.camadas.push(L);return L;},
  malhaCriaSuperficieTIN:async(M,nome)=>{chamadas.superficies.push({M,nome});return {name:nome+' — Superfície TIN'};},
  findCompanion:async()=>null};
vm.createContext(context);context.window=context;
vm.runInContext(fs.readFileSync(path.join(__dirname,'../geology/surpac-reader.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'surpac-import.js'),'utf8')+
  '\n;this.T={surpacPareceNuvem,surpacVetores,surpacMalhas,surpacConfere,surpacDatum,surpacFareja,surpacChave,surpacBase,surpacExt,surpacImportaLeva};',context);
const T=context.T,R=context.GeoMineSurpacReader,puro=v=>JSON.parse(JSON.stringify(v));
const zera=()=>{for(const k of Object.keys(chamadas))chamadas[k].length=0;context.S._loadCancel=false;context.S.workCRS='EPSG:31983';};

/* Arquivos binários sintéticos (mesmo leiaute dos testes do leitor). */
const EIXO='0,           0.000,           0.000,           0.000,           0.000,           0.000,           0.000\r\n';
function registro(n,y,x,z,d){
  const b=Buffer.alloc(28);b.writeUInt32BE(n,0);b.writeDoubleBE(y,4);b.writeDoubleBE(x,12);b.writeDoubleBE(z,20);
  return Buffer.concat([b,Buffer.from((d||'')+'\0','latin1')]);
}
function strBin(recs,header='teste,22-Nov-26,,teste.ssi'){
  return new Uint8Array(Buffer.concat([Buffer.from(header+'\r\n'+EIXO,'latin1'),Buffer.alloc(5),...recs.map(r=>registro(...r)),registro(0,0,0,0,'END')]));
}
function dtmBin(itens,header='teste.str,0123456789;algorithm=standard;fields=x,y'){
  const partes=[Buffer.from(header+'\r\n','latin1'),Buffer.alloc(5),registro(0,0,0,0,'END')];
  for(const it of itens){
    if(it[0]==='O'||it[0]==='T'){const b=Buffer.alloc(8);b.writeUInt32BE(it[0]==='O'?1:2,0);b.writeUInt32BE(it[1],4);partes.push(b,Buffer.from((it[2]||'')+'\0','latin1'));}
    else{const b=Buffer.alloc(32);b.writeUInt32BE(3,0);for(let k=0;k<7;k++)b.writeUInt32BE(it[k]||0,4+4*k);partes.push(b,Buffer.from('\0','latin1'));}
  }
  partes.push(Buffer.alloc(8,0xff));
  return new Uint8Array(Buffer.concat(partes));
}
const arquivo=(name,bytes)=>({name,size:bytes.length,lastModified:1,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),
  slice:(a,b)=>({arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset+a,bytes.byteOffset+Math.min(b,bytes.byteLength))})});
const ABERTA='neighbours=yes,validated=true,closed=no,algorithm=retriangulation',FECHADA='neighbours=yes,validated=true,closed=yes';
function sorteio(semente){let a=semente>>>0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// Formas para a decisão linha × nuvem: devolvem [x,y,z] na ordem em que estariam no arquivo.
const E0=612000,N0=7745000;
const formas={
  nuvemSolta(n,s=1){const r=sorteio(s);return Array.from({length:n},()=>[E0+300*r(),N0+200*r(),990+5*r()]);},
  grade(nx,ny,vaivem,passo=2,s=3){const r=sorteio(s),P=[];for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const k=vaivem&&j%2?nx-1-i:i;P.push([E0+passo*k+.2*r(),N0+passo*j+.2*r(),990+.3*r()]);}return P;},
  talude(nx,ny,graus){const dz=2*Math.tan(graus*Math.PI/180),P=[];for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)P.push([E0+2*i,N0+2*j,990+dz*j]);return P;},   // talude em fileiras, grade regular em planta
  curva(n,raio=120){return Array.from({length:n+1},(_,i)=>{const a=2*Math.PI*(i%n)/n;return [E0+raio*Math.cos(a)*(1+.15*Math.sin(5*a)),N0+raio*Math.sin(a)*(1+.1*Math.cos(3*a)),995];});},
  serrilhada(n){const P=[];for(let i=0;i<n;i++){const a=2*Math.PI*i/n,d=i%4===1?9:i%4===2?-2:0;P.push([E0+(150+d)*Math.cos(a+(i%4===1?.004:0)),N0+(150+d)*Math.sin(a+(i%4===1?-.004:0)),992]);}return P;},
  espiral(n,voltas){return Array.from({length:n},(_,i)=>{const t=i/(n-1),a=2*Math.PI*voltas*t,r=200*(1-.8*t);return [E0+r*Math.cos(a),N0+r*Math.sin(a),900-10*voltas*t];});},
  helice(n,voltas){return Array.from({length:n},(_,i)=>{const a=2*Math.PI*voltas*i/(n-1);return [E0+25*Math.cos(a),N0+25*Math.sin(a),800-22*voltas*i/(n-1)];});},   // rampa subterrânea
  faixa(n){const P=[];for(let i=0;i<n;i++)P.push([E0+20*i,N0+3*Math.sin(i),990]);for(let i=n-1;i>=0;i--)P.push([E0+20*i,N0+10+3*Math.sin(i),990]);P.push(P[0].slice());return P;},   // contorno de faixa de 10 m, vértices a cada 20 m
  grampos(pernas,porPerna){const P=[];for(let k=0;k<pernas;k++)for(let i=0;i<porPerna;i++){const u=i/(porPerna-1);P.push([E0+300*(k%2?1-u:u),N0+30*k+12*u,900+8*(k+u)]);}return P;},
  senoide(n){return Array.from({length:n},(_,i)=>[E0+3*i,N0+40*Math.sin(i/9)+15*Math.sin(i/2.3),990+i/50]);},
  hachura(fileiras){const P=[];for(let k=0;k<fileiras;k++){const ida=k%2===0;P.push([E0+(ida?0:300),N0+4*k,990],[E0+(ida?300:0),N0+4*k,990]);}return P;},   // vaivém desenhado: só os cantos
};
const eixos=P=>({X:Float64Array.from(P,p=>p[0]),Y:Float64Array.from(P,p=>p[1]),Z:Float64Array.from(P,p=>p[2])});
const nuvem=P=>{const e=eixos(P);return T.surpacPareceNuvem(e.X,e.Y,e.Z,0,P.length);};

test('linha × nuvem: nuvens em qualquer ordem viram pontos',()=>{
  for(const n of [14,20,60,722,8575])assert.equal(nuvem(formas.nuvemSolta(n,n)),true,'nuvem solta de '+n+' pontos');
  assert.equal(nuvem(formas.grade(30,20,false)),true,'grade em fileiras, com salto de retorno');
  assert.equal(nuvem(formas.grade(30,20,true)),true,'grade em vaivém');
  assert.equal(nuvem(formas.grade(12,10,true,5)),true,'malha de 120 furos em vaivém');
  assert.equal(nuvem(formas.grade(200,150,false,.5)),true,'30 mil pontos em fileiras');
  for(const graus of [0,20])assert.equal(nuvem(formas.talude(40,30,graus)),true,'terreno a '+graus+'° varrido em fileiras');
  // limite conhecido: grade regular EM PLANTA sobre parede íngreme fica rala ao longo da parede e entra como linha
  assert.equal(nuvem(formas.talude(40,30,60)),false,'parede a 60° em grade de planta');
});

test('linha × nuvem: o que foi desenhado como linha continua linha',()=>{
  for(const n of [12,60,400,3000])assert.equal(nuvem(formas.curva(n)),false,'curva de nível fechada com '+n+' vértices');
  assert.equal(nuvem(formas.serrilhada(400)),false,'curva serrilhada (vira bruscamente, não se cruza)');
  for(const [n,v] of [[300,5],[1200,10],[3000,5],[600,3]])assert.equal(nuvem(formas.espiral(n,v)),false,'rampa em espiral de '+v+' voltas e '+n+' vértices');
  for(const [n,v] of [[300,6],[900,12]])assert.equal(nuvem(formas.helice(n,v)),false,'rampa helicoidal de '+v+' voltas (cruza-se em planta)');
  assert.equal(nuvem(formas.faixa(40)),false,'contorno de faixa estreita com vértices espaçados');
  assert.equal(nuvem(formas.grampos(8,25)),false,'estrada em grampos');
  assert.equal(nuvem(formas.senoide(500)),false,'linha sinuosa');
  assert.equal(nuvem(formas.hachura(40)),false,'vaivém de 40 fileiras com vértices só nos cantos');
  assert.equal(nuvem(formas.grade(10,6,true,5)),false,'malha pequena (60 furos): na dúvida, linha');
  assert.equal(nuvem(formas.nuvemSolta(11,5)),false,'menos de 12 pontos: sempre linha');
  // a serrilhada tem mesmo mais de 25% de viradas bruscas: só os cruzamentos a livram de virar pontos
  const s=formas.serrilhada(400);let v=0,b=0;
  for(let i=1;i<s.length-1;i++){const ux=s[i][0]-s[i-1][0],uy=s[i][1]-s[i-1][1],vx=s[i+1][0]-s[i][0],vy=s[i+1][1]-s[i][1];v++;if(ux*vx+uy*vy<-.5*Math.hypot(ux,uy)*Math.hypot(vx,vy))b++;}
  assert(b/v>.25,'serrilhada com '+(100*b/v).toFixed(0)+'% de viradas bruscas');
});

test('strings viram linhas com cota por vértice; nuvem e ponto solto viram pontos',()=>{
  const recs=[];
  // string 1: curva de nível fechada na cota 995 (repete o primeiro ponto)
  formas.curva(40).forEach(p=>recs.push([1,p[1],p[0],995,',T-CURVA_MESTRA']));recs.push([0,0,0,0,'']);
  // string 1, segundo segmento: linha 3D aberta
  [[0,0,990],[10,0,991.5],[20,5,993]].forEach(p=>recs.push([1,N0+p[1],E0+p[0],p[2],'']));recs.push([0,0,0,0,'']);
  // string 2 emendada na 9 sem terminador: a troca de número também fecha o segmento
  [[0,50,1000],[30,50,1000]].forEach(p=>recs.push([2,N0+p[1],E0+p[0],p[2],'crista']));
  [[0,60,1010.1234],[30,60,1010.1234]].forEach(p=>recs.push([9,N0+p[1],E0+p[0],p[2],'pe,dump 3']));recs.push([0,0,0,0,'']);
  // string 500: ponto solto; string 32000: nuvem
  recs.push([500,N0+7,E0+7,987.5,'marco']);recs.push([0,0,0,0,'']);
  formas.nuvemSolta(300,9).forEach(p=>recs.push([32000,p[1],p[0],p[2],',CLOUD_001']));recs.push([0,0,0,0,'']);
  const V=T.surpacVetores(R.compactSTR(strBin(recs))),st=V.stats;
  assert.equal(V.linhas.length,4);assert.equal(V.pontos.length,301);
  assert.deepEqual(puro([st.segmentos,st.fechadas,st.nuvens,st.soltos,st.tem3d,st.strings]),[6,1,1,1,true,[1,2,9,500,32000]]);
  const [curva,aberta,crista,pe]=V.linhas;
  assert.deepEqual(puro(curva.props),{STRING:1,SEGMENTO:1,COTA:995,D1:'',D2:'T-CURVA_MESTRA'});
  assert.equal(curva.geom.length,41);assert.deepEqual(puro(curva.geom[0]),puro(curva.geom[40]));assert.equal(curva.multi,true);assert.equal(curva.zg.length,41);
  assert.deepEqual(puro(aberta.props),{STRING:1,SEGMENTO:2,COTA:null,D1:'',D2:''});assert.deepEqual(puro(aberta.zg),[990,991.5,993]);
  assert.deepEqual(puro(aberta.geom),[[E0,N0],[E0+10,N0],[E0+20,N0+5]]);              // X,Y no GeoMine; o arquivo guarda Y,X
  assert.deepEqual(puro(crista.props),{STRING:2,SEGMENTO:1,COTA:1000,D1:'crista',D2:''});
  assert.deepEqual(puro(pe.props),{STRING:9,SEGMENTO:1,COTA:1010.123,D1:'pe',D2:'dump 3'});
  const marco=V.pontos[0],p1=V.pontos[1];
  assert.deepEqual(puro(marco),{geom:[[E0+7,N0+7]],props:{STRING:500,COTA:987.5,D1:'marco',D2:''},zg:[987.5]});
  assert.equal(p1.props.STRING,32000);assert.equal(p1.props.D2,'CLOUD_001');assert.equal(p1.geom.length,1);
  assert.deepEqual(puro(V.camposLinha.map(f=>f.name+f.type)),['STRINGN','SEGMENTON','D1C','D2C','COTAN']);
  assert.deepEqual(puro(V.camposPonto.map(f=>f.name+f.type)),['STRINGN','D1C','D2C','COTAN']);
  assert.equal(V.camposLinha.find(f=>f.name==='D2').length,14);
  assert.deepEqual([st.z0,st.z1],[987.5,1010.1234]);assert(st.x0>=E0-150&&st.x1<=E0+310);
});

test('arquivo todo em Z = 0 entra sem cota, e coluna de descrição vazia não vira campo',()=>{
  const recs=[[1,10,0,0,',limite'],[1,10,30,0,',limite'],[1,40,30,0,',limite'],[1,10,0,0,''],[0,0,0,0,'']];
  const V=T.surpacVetores(R.compactSTR(strBin(recs)));
  assert.equal(V.stats.tem3d,false);assert.equal(V.linhas.length,1);assert.equal('zg' in V.linhas[0],false);
  assert.deepEqual(puro(V.linhas[0].props),{STRING:1,SEGMENTO:1,D2:'limite'});
  assert.deepEqual(puro(V.camposLinha.map(f=>f.name)),['STRING','SEGMENTO','D2']);
  assert.equal(V.stats.fechadas,1);
  const sem=T.surpacVetores(R.compactSTR(strBin([[4,1,2,3,''],[4,5,6,7,''],[0,0,0,0,'']])));
  assert.deepEqual(puro(sem.camposLinha.map(f=>f.name)),['STRING','SEGMENTO','COTA']);assert.deepEqual(puro(sem.linhas[0].props),{STRING:4,SEGMENTO:1,COTA:null});
});

// Grade nx × ny em uma string; devolve os registros e o número do registro de cada nó (contando terminadores).
function gradeStr(nx,ny,z=(i,j)=>100+i*.5+j*.25,x0=E0,y0=N0){
  const recs=[],id=[];let n=0;
  for(let j=0;j<ny;j++){for(let i=0;i<nx;i++){recs.push([1,y0+5*j,x0+5*i,z(i,j),'']);id.push(++n);}recs.push([0,0,0,0,'']);n++;}
  return {recs,no:(i,j)=>id[j*nx+i]};
}
function faces(no,i0,i1,j0,j1,t0=0){
  const f=[];let t=t0;
  for(let j=j0;j<j1;j++)for(let i=i0;i<i1;i++)f.push([++t,no(i,j),no(i+1,j),no(i+1,j+1),0,0,0],[++t,no(i,j),no(i+1,j+1),no(i,j+1),0,0,0]);
  return f;
}

test('DTM vira uma malha por objeto, só com os nós usados',()=>{
  const g=gradeStr(12,8);
  // objeto 1 em duas trisolations (metades da grade) e objeto 4 num canto; o resto dos pontos fica sem uso
  const itens=[['O',1,''],['T',1,ABERTA],...faces(g.no,0,5,0,7),['T',2,ABERTA],...faces(g.no,5,8,0,7,70),['O',4,''],['T',1,ABERTA],...faces(g.no,9,11,0,3,200)];
  const M=T.surpacMalhas(R.compactPair(dtmBin(itens),strBin(g.recs)));
  assert.equal(M.length,2);
  const [a,b]=M;
  assert.deepEqual([a.objectId,a.solido,a.faces,a.trisolations,a.xs.length,a.tri.length],[1,false,112,2,72,336]);   // 9 × 8 nós
  assert.deepEqual([b.objectId,b.solido,b.faces,b.trisolations,b.xs.length],[4,false,12,1,12]);
  assert.deepEqual([a.x0,a.x1,a.y0,a.y1],[E0,E0+40,N0,N0+35]);assert.deepEqual([b.x0,b.x1],[E0+45,E0+55]);
  assert.equal(a.area,40*35);assert.equal(a.planta,1);assert.deepEqual([a.z0,a.z1],[100,105.75]);
  // cada face aponta para os mesmos três pontos do arquivo
  const C=R.compactPair(dtmBin(itens),strBin(g.recs));
  for(let k=0;k<a.tri.length;k++){const v=a.tri[k],q=C.dtm.nodes[k];assert(a.xs[v]===C.str.x[q]&&a.ys[v]===C.str.y[q]&&a.zs[v]===C.str.z[q]);}
  assert(Math.max(...a.tri)<a.xs.length);
});

test('sólido fechado não vira superfície: pela marca closed=yes e pela soma das áreas em planta',()=>{
  // tetraedro: quatro faces, metade olhando para baixo
  const recs=[[1,N0,E0,100,''],[1,N0,E0+10,100,''],[1,N0+10,E0+5,100,''],[1,N0+4,E0+5,110,''],[0,0,0,0,'']];
  const tetra=[[1,1,2,4,0,0,0],[2,2,3,4,0,0,0],[3,3,1,4,0,0,0],[4,1,3,2,0,0,0]];
  const marcado=T.surpacMalhas(R.compactPair(dtmBin([['O',1,'corpo'],['T',1,FECHADA],...tetra]),strBin(recs)));
  assert.deepEqual(puro(marcado),[{objectId:1,solido:true,faces:4,facesFechadas:4}]);
  // sem a marca, a planta denuncia: as faces de cima e a de baixo se anulam
  const semMarca=T.surpacMalhas(R.compactPair(dtmBin([['O',1,''],['T',1,'neighbours=yes,validated=true'],...tetra]),strBin(recs)));
  assert.equal(semMarca[0].solido,true);assert.equal(semMarca[0].dobrada,true);assert(semMarca[0].planta<1e-9);
  // objeto com uma parte aberta e outra fechada: a aberta entra, a fechada é contada
  const g=gradeStr(4,4),misto=T.surpacMalhas(R.compactPair(dtmBin([['O',1,''],['T',1,ABERTA],...faces(g.no,0,3,0,3),['T',2,FECHADA],...faces(g.no,0,1,0,1,50)]),strBin(g.recs)));
  assert.deepEqual([misto[0].solido,misto[0].faces,misto[0].facesFechadas],[false,18,2]);
  // "closed=no" e "closed=yes" não se confundem com outros campos
  assert.equal(T.surpacMalhas(R.compactPair(dtmBin([['O',1,''],['T',1,'unclosed=yes,closed=no'],...faces(g.no,0,3,0,3)]),strBin(g.recs)))[0].solido,false);
});

test('conferência das coordenadas contra o CRS de trabalho',()=>{
  zera();
  assert.deepEqual(puro(T.surpacConfere('patio.str','patio,22-Nov-26',612000,612500,7745000,7745900)),[]);
  const local=T.surpacConfere('piso.str','piso',-43.3,26.8,5,48);
  assert.equal(local.length,1);assert.equal(local.local,true);assert.match(local[0],/coordenadas locais \(E -43 a 27, fora da faixa UTM\).*não aparece no mapa/);
  const datum=T.surpacConfere('primitivo_16-07-2026_sad69.dtm','x',612000,612500,7745000,7745900);
  assert.equal(datum.length,1);assert.equal(datum.local,undefined);assert.match(datum[0],/SAD69.*SIRGAS 2000 \/ UTM 23S.*dezenas de metros/);
  // em fuso do hemisfério norte as coordenadas locais caem perto do equador: aparecem, mas no lugar errado
  context.toWGS=()=>[-55.5,0.0004];assert.match(T.surpacConfere('piso.str','piso',-43.3,26.8,5,48)[0],/coordenadas locais.*a posição não é a real$/);
  context.toWGS=()=>[-135.2,-85.53];assert.match(T.surpacConfere('piso.str','piso',-43.3,26.8,5,48)[0],/não aparece no mapa$/);delete context.toWGS;
  assert.deepEqual(puro(T.surpacConfere('a.str','levantamento wgs84',612000,612500,7745000,7745900)),[]);   // WGS84 e SIRGAS 2000 coincidem
  assert.deepEqual(puro(T.surpacConfere('a_sirgas.str','',612000,612500,7745000,7745900)),[]);
  context.S.workCRS='EPSG:29193';
  assert.deepEqual(puro(T.surpacConfere('primitivo_sad69.dtm','x',612000,612500,7745000,7745900)),[]);
  assert.match(T.surpacConfere('levantamento_sirgas2000.str','',612000,612500,7745000,7745900)[0],/SIRGAS 2000.*SAD69/);
  context.S.workCRS='EPSG:4674';
  assert.throws(()=>T.surpacConfere('a.str','',612000,612500,7745000,7745900),/coordenadas geográficas.*CRS UTM/);
  assert.deepEqual(puro(T.surpacConfere('graus.str','',-46.8,-46.7,-19.2,-19.1)),[]);
  assert.deepEqual([T.surpacDatum('x SAD-69'),T.surpacDatum('corrego_alegre'),T.surpacDatum('Sirgas2000'),T.surpacDatum('wgs 84'),T.surpacDatum('patio')],['SAD69','Córrego Alegre','SIRGAS 2000','WGS84',null]);
  zera();
});

test('nomes, extensões e arquivo sem extensão reconhecido pelos primeiros bytes',()=>{
  assert.deepEqual([T.surpacExt('A.STR'),T.surpacExt('a.b.dtm'),T.surpacExt('semext'),T.surpacExt('pasta.x/arq')],['str','dtm','','']);
  assert.deepEqual([T.surpacBase('Patio (1).str'),T.surpacChave('C:\\dados\\Pátio Gesso.DTM'),T.surpacChave('a/b/c.str')],['Patio','pátio gesso','c']);
  const dec=b=>new TextDecoder('latin1').decode(b.subarray(0,1024));
  assert.equal(T.surpacFareja(dec(strBin([[1,1,2,3,'']]))),'str');
  assert.equal(T.surpacFareja(dec(dtmBin([['O',1,''],['T',1,ABERTA],[1,1,2,3]]))),'dtm');
  assert.equal(T.surpacFareja('nome,22-Nov-26,,memo\n0, 0.000, 0.000, 0.000, 0.000, 0.000, 0.000\n1, 5, 6, 7,\n'),'str');
  assert.equal(T.surpacFareja('id,x,y,z\n0,1.5,2.5,3.5\n1,2,3,4\n'),'');                        // CSV comum não é STR
  assert.equal(T.surpacFareja('x,y,z,d,e,f,g\n0,1,2,3,4,5,6\n'),'str');                        // sete campos numéricos: registro de eixo
  assert.equal(T.surpacFareja('{"type":"FeatureCollection"}'),'');assert.equal(T.surpacFareja(''),'');
});

test('leva do Importar: par vira superfície, .str avulso vira vetores',async()=>{
  zera();
  const g=gradeStr(6,5),sup=strBin(g.recs),dtm=dtmBin([['O',1,''],['T',1,ABERTA],...faces(g.no,0,5,0,4)]);
  const lim=strBin([[1,N0,E0,0,''],[1,N0,E0+30,0,''],[1,N0+20,E0+30,0,''],[1,N0,E0,0,''],[0,0,0,0,''],
    [2,N0+1,E0+1,0,''],[2,N0+1,E0+9,0,''],[0,0,0,0,''],[3,N0+2,E0+2,0,''],[3,N0+2,E0+8,0,''],[0,0,0,0,'']]);
  const falhas=[];
  const feito=await T.surpacImportaLeva([arquivo('Patio (1).dtm',dtm),arquivo('limite.str',lim),arquivo('patio.STR',sup)],{falhas});
  assert.deepEqual(puro(feito),{superficies:1,camadas:1,locais:0});assert.deepEqual(falhas,[]);
  assert.equal(chamadas.superficies.length,1);assert.equal(chamadas.superficies[0].nome,'Patio');
  const M=chamadas.superficies[0].M;assert.equal(M.tri.length,3*40);assert.equal(M.xs.length,30);
  assert.equal(chamadas.camadas.length,1);
  const L=chamadas.camadas[0];
  assert.deepEqual([L.name,L.gtype,L.crs,L.features.length,L.src.file],['limite — linhas','line','EPSG:31983',3,'limite.str']);
  // três strings: categorizado por STRING, como as cores do Surpac
  assert.deepEqual(puro([L.sym.mode,L.sym.field,L.sym.cats.map(c=>[c.value,c.count])]),['cat','STRING',[['1',1],['2',1],['3',1]]]);
  assert(chamadas.toasts.some(t=>/Surpac "Patio": superfície com 40 triângulos/.test(t)));
  assert(chamadas.toasts.some(t=>/Surpac "limite": 3 linha\(s\) \(1 fechada\(s\)\) no CRS de trabalho \(SIRGAS 2000 \/ UTM 23S\)$/.test(t)));
  assert(chamadas.log.some(l=>/Patio \(1\)\.dtm \+ patio\.STR → Patio — Superfície TIN: 40 triângulos, 30 vértices, 500 m² em planta/.test(l[1])));
  assert(chamadas.log.some(l=>/sem cota \(arquivo em Z = 0\)/.test(l[1])));
});

test('leva do Importar: .dtm sem par procura pelo cabeçalho, pede o .str e recusa o par errado',async()=>{
  const g=gradeStr(6,5),sup=strBin(g.recs),dtm=dtmBin([['O',1,''],['T',1,ABERTA],...faces(g.no,0,5,0,4)],'levantamento_julho.str,1;algorithm=standard;fields=x,y');
  // 1) o .str tem outro nome, mas é o que o cabeçalho do .dtm cita
  zera();let falhas=[];
  await T.surpacImportaLeva([arquivo('renomeado.dtm',dtm),arquivo('Levantamento_Julho.str',sup)],{falhas});
  assert.equal(chamadas.superficies.length,1);assert.equal(chamadas.camadas.length,0);assert.deepEqual(falhas,[]);
  // 2) só o .dtm: a caixa pede o .str e aceita o único arquivo escolhido, com qualquer nome
  zera();falhas=[];context.surpacPedeSTR=async nomes=>{chamadas.pedidos.push(puro(nomes));return [arquivo('qualquer nome',sup)];};
  await T.surpacImportaLeva([arquivo('renomeado.dtm',dtm)],{falhas});
  assert.deepEqual(chamadas.pedidos,[['renomeado.dtm']]);assert.equal(chamadas.superficies.length,1);assert.deepEqual(falhas,[]);
  // 3) pasta de trabalho concedida: nem pergunta
  zera();falhas=[];context.findCompanion=async(base,ext)=>base==='renomeado'&&ext==='str'?arquivo('renomeado.str',sup):null;
  await T.surpacImportaLeva([arquivo('renomeado.dtm',dtm)],{falhas});
  assert.deepEqual(chamadas.pedidos,[]);assert.equal(chamadas.superficies.length,1);context.findCompanion=async()=>null;
  // 4) pular: a falha é registrada e nada é criado
  zera();falhas=[];context.surpacPedeSTR=async()=>null;
  await T.surpacImportaLeva([arquivo('renomeado.dtm',dtm)],{falhas});
  assert.equal(chamadas.superficies.length,0);assert.equal(falhas.length,1);assert.match(falhas[0],/^renomeado\.dtm — faltou o arquivo \.str/);
  // 5) .str de outra superfície: recusado pela topologia, sem criar nada
  zera();falhas=[];context.surpacPedeSTR=async()=>[arquivo('outro.str',strBin([[1,1,2,3,''],[1,4,5,6,''],[0,0,0,0,'']]))];
  await T.surpacImportaLeva([arquivo('renomeado.dtm',dtm)],{falhas});
  assert.equal(chamadas.superficies.length,0);assert.equal(falhas.length,1);assert.match(falhas[0],/^renomeado\.dtm — objeto 1, trisolation 1.*par correto/);
  // 6) dois .dtm sem par e a escolha traz os dois .str pelo nome
  zera();falhas=[];context.surpacPedeSTR=async nomes=>{chamadas.pedidos.push(puro(nomes));return [arquivo('b.str',sup),arquivo('a.str',sup)];};
  await T.surpacImportaLeva([arquivo('a.dtm',dtmBin([['O',1,''],['T',1,ABERTA],...faces(g.no,0,5,0,4)],'x')),arquivo('b.dtm',dtm)],{falhas});
  assert.deepEqual(chamadas.pedidos,[['a.dtm','b.dtm']]);assert.deepEqual(chamadas.superficies.map(s=>s.nome),['a','b']);assert.deepEqual(falhas,[]);
  // 7) cancelamento do carregamento interrompe a leva
  zera();falhas=[];context.S._loadCancel=true;
  await T.surpacImportaLeva([arquivo('a.dtm',dtm),arquivo('a.str',sup),arquivo('l.str',sup)],{falhas});
  assert.equal(chamadas.superficies.length,0);assert.equal(chamadas.camadas.length,0);zera();
});

test('leva do Importar: sólido, nuvem acima do teto, coordenadas locais e arquivo que não é do Surpac',async()=>{
  // só sólido fechado → falha com o caminho certo
  zera();let falhas=[];
  const tetraStr=strBin([[1,N0,E0,100,''],[1,N0,E0+10,100,''],[1,N0+10,E0+5,100,''],[1,N0+4,E0+5,110,''],[0,0,0,0,'']]);
  const tetra=dtmBin([['O',1,''],['T',1,FECHADA],[1,1,2,4],[2,2,3,4],[3,3,1,4],[4,1,3,2]]);
  await T.surpacImportaLeva([arquivo('corpo.dtm',tetra),arquivo('corpo.str',tetraStr)],{falhas});
  assert.equal(chamadas.superficies.length,0);assert.match(falhas[0],/^corpo\.dtm — o arquivo traz só sólido fechado \(4 triângulos\).*Geologia ▸ Superfícies \/ Sólidos Surpac/);
  // dois objetos abertos → duas superfícies, nomeadas pelo objeto
  zera();falhas=[];const g=gradeStr(8,4);
  await T.surpacImportaLeva([arquivo('duas.dtm',dtmBin([['O',1,''],['T',1,ABERTA],...faces(g.no,0,3,0,3),['O',7,''],['T',1,ABERTA],...faces(g.no,4,7,0,3,100)])),arquivo('duas.str',strBin(g.recs))],{falhas});
  assert.deepEqual(chamadas.superficies.map(s=>s.nome),['duas — objeto 1','duas — objeto 7']);assert.deepEqual(falhas,[]);
  // coordenadas locais: importa e avisa
  zera();falhas=[];const loc=gradeStr(6,5,(i,j)=>i+j,0,0);
  const vistas=[];context.map={getCenter:()=>'centro',getZoom:()=>15,setView:(c,z,o)=>vistas.push([c,z,o.animate])};
  const fl=await T.surpacImportaLeva([arquivo('piso.dtm',dtmBin([['O',1,''],['T',1,ABERTA],...faces(loc.no,0,5,0,4)])),arquivo('piso.str',strBin(loc.recs)),arquivo('borda.str',strBin([[1,0,0,0,''],[1,20,25,0,''],[0,0,0,0,'']]))],{falhas});
  assert.deepEqual(puro(fl),{superficies:1,camadas:1,locais:2});assert.equal(chamadas.superficies.length,1);
  assert(chamadas.toasts.some(t=>/^⚠ Surpac "piso": coordenadas locais \(E 0 a 25, fora da faixa UTM\)/.test(t)));
  assert.deepEqual(vistas,[['centro',15,false],['centro',15,false]]);          // a vista do mapa volta para onde estava
  vistas.length=0;await T.surpacImportaLeva([arquivo('utm.str',strBin([[1,N0,E0,5,''],[1,N0+9,E0+9,5,''],[0,0,0,0,'']]))],{falhas});
  assert.deepEqual(vistas,[]);delete context.map;
  // projeto em graus e arquivo em metros: recusa antes de criar a camada
  zera();falhas=[];context.S.workCRS='EPSG:4674';
  await T.surpacImportaLeva([arquivo('l.str',strBin([[1,N0,E0,5,''],[1,N0+9,E0+9,5,''],[0,0,0,0,'']]))],{falhas});
  assert.equal(chamadas.camadas.length,0);assert.match(falhas[0],/^l\.str — o projeto está em coordenadas geográficas/);
  // arquivo .str que não é do Surpac
  zera();falhas=[];
  await T.surpacImportaLeva([arquivo('legenda.str',new Uint8Array(Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nolá\n')))],{falhas});
  assert.equal(chamadas.camadas.length,0);assert.equal(falhas.length,1);assert.match(falhas[0],/^legenda\.str — a leitura como strings do Surpac falhou: /);
  // teto de pontos de uma camada vetorial
  zera();falhas=[];const tetoReal=vm.runInContext('SURPAC_MAX_PONTOS',context);assert.equal(tetoReal,2000000);
  const muitos=strBin(formas.nuvemSolta(40,2).map(p=>[1,p[1],p[0],p[2],'']));
  const leitor=context.GeoMineSurpacReader;context.GeoMineSurpacReader={...leitor,compactPair:leitor.compactPair,compactSTR:d=>({...leitor.compactSTR(d),pointCount:tetoReal+1})};
  await T.surpacImportaLeva([arquivo('nuvem.str',muitos)],{falhas});context.GeoMineSurpacReader=leitor;
  assert.equal(chamadas.camadas.length,0);assert.match(falhas[0],/^nuvem\.str — 2\.000\.001 pontos — acima do teto de 2\.000\.000/);
  zera();
});
