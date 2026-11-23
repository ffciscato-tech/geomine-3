/* Aba Cava — arestas transversais da rampa no desenho recortado (print de 23/11/2026: "ainda
   saindo sem essa aresta"). A ponta em que o trecho de rampa CHEGA numa berma já é desenhada
   pelo anel fechado daquele nível; a ponta em que ele SAI da berma não é borda de anel nenhum e
   precisa de uma aresta própria. Só geometria sintética, em coordenadas neutras. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ponte=fs.readFileSync(path.join(__dirname,'cava2-workspace.js'),'utf8');
const trecho=(a,b)=>{const i=ponte.indexOf(a),f=ponte.indexOf(b,i);assert(i>0&&f>i,'trecho da ponte: '+a);return ponte.slice(i,f);};
const ctx={};vm.createContext(ctx);
vm.runInContext('const n=(v,d=0)=>Number.isFinite(+v)?+v:d;'
  +trecho('function cava2MetaCorredor(','/* Produto analítico fechado')
  +trecho('function cava2ArestasDeRampa(design){','/* Linhas cartográficas:')
  +';this.arestas=d=>JSON.stringify(cava2ArestasDeRampa(d));',ctx);
const A=d=>JSON.parse(ctx.arestas(d));          /* texto: objetos de outro contexto não passam no deepEqual */
const anel=(P,z,tp)=>({z,tp,P:P.map(p=>({x:p[0],y:p[1]}))});
const faixa=(xa,xb,y0,y1,z0,z1)=>{                       /* trecho reto subindo em +y, de z0 a z1 */
  const b=x=>[0,.5,1].map(t=>({x,y:y0+(y1-y0)*t,z:z0+(z1-z0)*t}));return {borda1:b(xa),centro:b((xa+xb)/2),borda2:b(xb),zIni:z0,zFim:z1};};

test('a ponta em que o trecho sai da berma ganha aresta; a ponta coberta pela crista não é repetida',()=>{
  /* crista do nível 10 passa exatamente pelo fim do trecho (y = 100, de x = 0 a 12) */
  const crista=anel([[-50,100],[12,100],[12,160],[-50,160]],10,'crista');
  const d={aneis:[crista],corredores:[faixa(0,12,0,100,0,10)]};
  const r=A(d);
  assert.equal(r.length,1,'só a ponta do início');
  assert.equal(r[0].ponta,'inicio'); assert.equal(r[0].trecho,0); assert.equal(r[0].banco,1);
  assert.deepEqual(r[0].P,[{x:0,y:0,z:0},{x:12,y:0,z:0}],'de uma borda à outra, na cota do início');
});

test('patamar entre dois trechos: o começo do segundo trecho ganha a aresta que faltava',()=>{
  const crista10=anel([[-50,100],[12,100],[12,160],[-50,160]],10,'crista');
  const crista20=anel([[-50,214],[21,214],[21,260],[-50,260]],20,'crista');
  /* o segundo trecho começa 14 m adiante e 9 m ao lado, no meio da berma do nível 10 */
  const d={aneis:[crista10,crista20],corredores:[faixa(0,12,0,100,0,10),faixa(9,21,114,214,10,20)]};
  const r=A(d);
  assert.deepEqual(r.map(t=>t.trecho+':'+t.ponta),['0:inicio','1:inicio']);
  assert.deepEqual(r[1].P,[{x:9,y:114,z:10},{x:21,y:114,z:10}]);
  assert.equal(r[1].banco,2);
});

test('anel em outra cota não conta como cobertura, gancho e trecho que fecha em ponta ficam de fora',()=>{
  /* mesma posição em planta do fim do trecho, mas 10 m abaixo: não é a mesma aresta */
  const outro=anel([[-50,100],[12,100],[12,160],[-50,160]],0,'pe');
  assert.deepEqual(A({aneis:[outro],corredores:[faixa(0,12,0,100,0,10)]}).map(t=>t.ponta),['inicio','fim']);
  const gancho=Object.assign(faixa(0,12,0,100,0,10),{gancho:true});
  assert.equal(A({aneis:[],corredores:[gancho]}).length,0,'retorno plano não tem quebra de inclinação');
  const afina=faixa(0,12,0,100,0,10); afina.borda2[0]={x:.2,y:0,z:0};      /* começa em ponta */
  assert.deepEqual(A({aneis:[],corredores:[afina]}).map(t=>t.ponta),['fim']);
  assert.equal(A({aneis:[],corredores:[{borda1:[{x:0,y:0,z:0}],borda2:[]}]}).length,0,'corredor incompleto é ignorado');
  assert.equal(A(null).length,0);
});

test('as arestas entram nas feições do corte como linhas de rampa, na cota absoluta',()=>{
  const corte=ponte.slice(ponte.indexOf('function feicoesFechadasParaIntersecao('),ponte.indexOf('function cava2ArestasDeRampa('));
  assert.match(corte,/for\(const t of cava2ArestasDeRampa\(design\)\)/);
  assert.match(corte,/ELEMENTO:'Rampa'/);
  assert.match(corte,/n\(baseZ\)\+n\(p\.z\)/);
});
