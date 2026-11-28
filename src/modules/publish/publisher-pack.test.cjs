/* Publicador — empacotamento dos dados e montagem do HTML. Só dados sintéticos. */
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const le=f=>fs.readFileSync(path.join(__dirname,f),'utf8');
function carrega(){
  const ctx={console,Buffer}; ctx.window=ctx; vm.createContext(ctx);
  for(const f of ['publisher-pack.js','viewer-core.js']) vm.runInContext(le(f),ctx,{filename:f});
  return {P:ctx.GeoMinePublisherPack, C:ctx.GeoMinePubCore};
}
const perto=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,(msg||'')+' esperado '+b+', veio '+a);
const grade=(o,fz)=>{ const z=new Float32Array(o.nc*o.nr); for(let r=0;r<o.nr;r++) for(let c=0;c<o.nc;c++) z[r*o.nc+c]=fz(o.x0+c*o.dx,o.y0-r*o.dy); return Object.assign({z},o); };

test('cotas em 16 bits: erro de milímetros, furos preservados, superfície sem cota fica de fora',()=>{
  const {P}=carrega(), z=Float32Array.from([100,NaN,250.5,400,Infinity,123.456]), q=P.quantizaZ(z);
  assert.equal(q.zmin,100); assert.equal(q.zmax,400); assert.equal(q.validas,4);
  assert.equal(q.q[1],65535); assert.equal(q.q[4],65535,'infinito também é sem dado');
  const volta=i=>q.zmin+q.q[i]*(q.zmax-q.zmin)/65534;
  [0,2,3,5].forEach(i=>perto(volta(i),z[i],0.003));
  assert.equal(P.quantizaZ(Float32Array.from([NaN,NaN])),null);
  assert.equal(P.superficie({id:1,nome:'vazia',nc:2,nr:1,dx:1,dy:1,x0:0,y0:0,z:Float32Array.from([NaN,NaN])},[0,0]),null);
  /* plano horizontal: não divide por zero */
  const plano=P.quantizaZ(Float32Array.from([50,50,50])); assert.ok(plano.zmax>plano.zmin);
});

test('malha reduzida: de quanto em quanto pular para caber no limite',()=>{
  const {P}=carrega();
  assert.equal(P.passoDaMalha(1000,1000,1200000),1,'cabe inteira');
  assert.equal(P.passoDaMalha(2589,2195,1200000),3);
  assert.equal(P.passoDaMalha(4000,4000,300000),8);
  assert.equal(P.passoDaMalha(4000,4000,0),1,'sem limite = nativa');
});

test('encaixe da ortofoto: reta exata quando a imagem está no mesmo sistema, com o erro medido',()=>{
  const {P}=carrega(), am=[];
  /* imagem de 400 m × 300 m com o canto sudoeste em (150, 150) */
  for(let i=0;i<=4;i++) for(let j=0;j<=4;j++) am.push({x:150+100*i,y:150+75*j,u:i/4,v:j/4});
  const f=P.afim(am); perto(f.uv[0],0.0025,1e-12); perto(f.uv[1],0,1e-12); perto(f.uv[2],-0.375,1e-9); perto(f.uv[4],1/300,1e-12); perto(f.uv[5],-0.5,1e-9); perto(f.erro,0,1e-9);
  /* imagem girada (outro sistema): continua exata, porque rotação também é afim */
  const g=am.map(p=>({x:p.x*Math.cos(0.02)-p.y*Math.sin(0.02),y:p.x*Math.sin(0.02)+p.y*Math.cos(0.02),u:p.u,v:p.v}));
  perto(P.afim(g).erro,0,1e-9);
  assert.equal(P.afim(am.slice(0,2)),null); assert.equal(P.afim([{x:0,y:0,u:0,v:0},{x:1,y:1,u:1,v:1},{x:2,y:2,u:2,v:2}]),null,'pontos alinhados não definem o encaixe');
});

test('camada vetorial: partes, estilos sem repetição, cota ausente vira "pousar no terreno"',()=>{
  const {P,C}=carrega(), o=[1000,2000];
  const v=P.vetor({nome:'Linhas',tipo:'line',partes:[{pts:[[1010,2020,300],[1030,2040,310]],cor:'#111',peso:2,rotulo:'Crista'},{pts:[[1010,2020],[1030,2040],[1050,2060]],cor:'#111',peso:2,rotulo:'Crista'},
    {pts:[[1,2]],cor:'#f00',peso:1},{pts:[[1010,2020,null],[1011,2021,NaN]],cor:'#999',peso:1,tracejado:true,rotulo:'Pé'}]},o);
  assert.deepEqual(JSON.parse(JSON.stringify(v.tam)),[2,3,2]); assert.deepEqual(JSON.parse(JSON.stringify(v.est)),[0,0,1]); assert.equal(v.estilos.length,2); assert.equal(v.vertices,7);
  const xyz=C.f32(v.xyz); assert.equal(xyz.length,21); perto(xyz[0],10,1e-6); perto(xyz[1],20,1e-6); perto(xyz[2],300,1e-6);
  assert.ok(Number.isNaN(xyz[8]),'sem cota'); assert.ok(Number.isNaN(xyz[17])&&Number.isNaN(xyz[20]),'cota nula ou inválida');
  assert.equal(P.vetor({nome:'vazia',tipo:'line',partes:[{pts:[[1,2]]}]},o),null);
  assert.equal(P.vetor({nome:'Marcos',tipo:'point',partes:[{pts:[[1005,2005,7]],cor:'#00f'}]},o).tipo,'point');
});

test('MDT recortado junto do terreno: o terreno só some onde o recorte o cobre por inteiro',()=>{
  const {P,C}=carrega();
  const terreno=grade({id:'t',nome:'MDT',nc:21,nr:21,dx:10,dy:10,x0:0,y0:200},()=>100);
  /* recorte de 1 m no miolo (x 40..160, y 40..160), com um furo de 4 m × 4 m dentro */
  const recorte=grade({id:'r',nome:'recorte',nc:121,nr:121,dx:1,dy:1,x0:40,y0:160},(x,y)=>(x>=98&&x<=102&&y>=98&&y<=102)?NaN:(Math.max(Math.abs(x-100),Math.abs(y-100))<30?130:100));
  const oculta=P.ocultaSob(terreno,recorte); assert.ok(oculta);
  const em=(x,y)=>oculta[Math.round((200-y)/10)*21+Math.round(x/10)];
  assert.equal(em(70,130),1,'bem dentro do recorte: escondido');
  assert.equal(em(40,100),0,'na borda do recorte: fica, para as malhas se encontrarem');
  assert.equal(em(10,100),0,'fora do recorte'); assert.equal(em(0,0),0,'borda da malha nunca');
  for(const [x,y] of [[100,100],[90,100],[100,90],[110,110]]) assert.equal(em(x,y),0,'em volta do furo o terreno continua ('+x+','+y+')');
  /* e a tela nunca fica sem chão: em todo ponto há terreno visível ou recorte */
  const t=C.superficie(JSON.parse(JSON.stringify(P.superficie(Object.assign({oculta},terreno),[0,0])))), r=C.superficie(JSON.parse(JSON.stringify(P.superficie(recorte,[0,0]))));
  let buracos=0; for(let x=2;x<198;x+=1.7) for(let y=2;y<198;y+=1.7){ const a=C.alturaEm(t,x,y,true), b=C.alturaEm(r,x,y,true); if(a!==a&&b!==b) buracos++; }
  assert.equal(buracos,0);
  /* o terreno original continua medível por baixo (é o que o perfil mostra) */
  perto(C.alturaEm(t,70,130),100,0.01); assert.ok(Number.isNaN(C.alturaEm(t,70,130,true)));
  /* recorte longe do terreno: nada a esconder */
  assert.equal(P.ocultaSob(terreno,grade({nc:5,nr:5,dx:1,dy:1,x0:900,y0:900},()=>1)),null);
});

test('MDT recortado: a obra é o que mudou em relação ao terreno de origem',()=>{
  const {P,C}=carrega();
  const recorte=grade({id:'r',nome:'recorte',nc:11,nr:11,dx:1,dy:1,x0:0,y0:10},(x,y)=>x>=4&&x<=6?120:(x===9?100.03:100));
  const m=P.marcaObra(recorte,()=>100,0.05);
  assert.equal(m.pontos,33,'três colunas de pilha'); assert.equal(m.obra[5],1); assert.equal(m.obra[0],0); assert.equal(m.obra[9],0,'3 cm é ruído de interpolação, não obra');
  assert.equal(P.marcaObra(recorte,()=>NaN,0.05).pontos,121,'sem terreno de origem no ponto, é obra');
  const s=C.superficie(JSON.parse(JSON.stringify(P.superficie(Object.assign({obra:m.obra,papel:'recorte'},recorte),[0,0]))));
  assert.equal(s.papel,'recorte'); assert.equal(C.bit(s.obra,5),1); assert.equal(C.bit(s.obra,0),0); assert.equal(C.bit(null,3),0);
});

test('a página gerada: nada de fora, dados que não fecham o bloco, título protegido',()=>{
  const {P}=carrega();
  const dados={v:P.VERSAO,titulo:'Obra </script><script>alert(1)</script> & "aspas"',superficies:[],nota:'linha separada'};
  const html=P.html({esqueleto:le('viewer.html'),titulo:dados.titulo,dados,scripts:[{nome:'a */ b',codigo:'var x="</script>";'},{nome:'contas',codigo:le('viewer-core.js')}]});
  assert.ok(!/<!--GMPUB:/.test(html),'todas as marcas foram trocadas');
  assert.match(html,/<title>Obra &lt;\/script&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;aspas&quot;<\/title>/);
  const bloco=html.slice(html.indexOf('<script type="application/json" id="gmpubDados">')+48); const json=bloco.slice(0,bloco.indexOf('</script>'));
  assert.equal(JSON.parse(json).titulo,dados.titulo,'os dados voltam inteiros'); assert.ok(!json.includes('<'),'nenhum sinal de menor cru nos dados'); assert.ok(!json.includes(' '));
  assert.ok(html.includes('var x="<\\/script>";'),'fechamento dentro de programa embutido é escapado');
  assert.equal((html.match(/<script>/g)||[]).length,2);
  assert.ok(!/(src|href)\s*=\s*["']https?:/i.test(html),'nenhum endereço externo: abre sem internet');
  assert.throws(()=>P.html({esqueleto:'<html></html>',dados:{},scripts:[]}),/Esqueleto do visualizador sem a marca/);
});

test('os arquivos do publicador podem viver dentro de um bloco de programa da página',()=>{
  /* tools/build.py junta publisher-pack.js e publisher.js num bloco só: um fechamento de bloco
     escrito por extenso (até num comentário) corta o módulo ao meio, calado. Aconteceu em 28/11/2026. */
  for(const f of ['publisher-pack.js','publisher.js']){
    const t=le(f); assert.ok(!/<\/script/i.test(t),f+' não pode conter o fechamento de bloco por extenso');
    /* depois de um "<!--" tem de vir "-->" antes de qualquer abertura de bloco */
    let i=0; while((i=t.indexOf('<!--',i))>=0){ const fim=t.indexOf('-->',i), abre=t.indexOf('<script',i); assert.ok(fim>=0&&(abre<0||fim<abre),f+': marca de comentário aberta antes de uma abertura de bloco'); i=fim+3; }
  }
  for(const f of ['viewer-core.js','viewer-app.js','publisher.js','publisher-pack.js']){ const t=le(f); assert.ok(!t.includes(' ')&&!t.includes(' '),f+' sem separador de linha Unicode cru'); }
});

test('peso estimado e nome do tamanho',()=>{
  const {P}=carrega();
  assert.equal(P.tamanho(1048576*2.34),'2,3 MB'); assert.equal(P.tamanho(1048576*25.7),'26 MB');
  const e=P.estimativa({celulas:1e6,ortoPixels:0,vertices:0,programa:700000}); perto(e,1e6*2*4/3+700000,1);
});
