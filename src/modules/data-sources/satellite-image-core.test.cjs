/* Baixar satélite — contas do mosaico. Só coordenadas neutras, sem rede. */
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
function carrega(){
  const ctx={console}; ctx.window=ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'satellite-image-core.js'),'utf8'),ctx,{filename:'satellite-image-core.js'});
  return ctx.GeoMineSatImageCore;
}
const C=carrega();
const perto=(a,b,tol,msg)=>assert.ok(Math.abs(a-b)<=tol,(msg||'')+' esperado '+b+', veio '+a);
/* área de cerca de 600 m × 450 m longe de qualquer obra real */
const AREA={oeste:-45.0030,leste:-44.9972,sul:-20.0041,norte:-20.0000};

test('quadro e lonLat são inversos e batem com a grade conhecida do Web Mercator',()=>{
  assert.equal(JSON.stringify(C.quadro(0,0,1)),JSON.stringify([1,1]));
  const q=C.quadro(-180,85.05112878,3); perto(q[0],0,1e-9); perto(q[1],0,1e-6);
  for(const [lon,lat,z] of [[-45.0011,-20.0023,20],[12.5,47.3,17],[-70.2,-33.4,22]]){
    const t=C.quadro(lon,lat,z), v=C.lonLat(t[0],t[1],z);
    perto(v[0],lon,1e-10,'lon'); perto(v[1],lat,1e-10,'lat');
  }
});

test('tamanho do pixel: 156 km no equador em z0, metade a cada nível, menor longe do equador',()=>{
  perto(C.metrosPorPixel(0,0),156543.0339,1e-3);
  perto(C.metrosPorPixel(0,20)/C.metrosPorPixel(0,21),2,1e-12);
  perto(C.metrosPorPixel(-20,22),0.03507,2e-5);
  assert.ok(C.metrosPorPixel(-20,20)<C.metrosPorPixel(0,20));
});

test('plano: pixels inteiros, limites nas bordas dos pixels e sempre cobrindo a área pedida',()=>{
  for(const z of [16,19,22]){
    const p=C.plano(AREA,z);
    assert.ok(Number.isInteger(p.px0)&&Number.isInteger(p.py0)&&Number.isInteger(p.largura)&&Number.isInteger(p.altura));
    assert.ok(p.limites.oeste<=AREA.oeste+1e-12&&p.limites.leste>=AREA.leste-1e-12&&p.limites.sul<=AREA.sul+1e-12&&p.limites.norte>=AREA.norte-1e-12,'cobre a área em z'+z);
    /* nunca mais que um pixel de sobra em cada lado */
    const a=C.quadro(AREA.oeste,AREA.norte,z), b=C.quadro(AREA.leste,AREA.sul,z);
    assert.ok(a[0]*256-p.px0<1+1e-6&&a[1]*256-p.py0<1+1e-6&&(p.px0+p.largura)-b[0]*256<1+1e-6&&(p.py0+p.altura)-b[1]*256<1+1e-6,'sobra em z'+z);
    /* os limites são exatamente as bordas dos pixels do canto */
    const no=C.quadro(p.limites.oeste,p.limites.norte,z), se=C.quadro(p.limites.leste,p.limites.sul,z);
    perto(no[0]*256,p.px0,1e-5); perto(no[1]*256,p.py0,1e-5); perto(se[0]*256,p.px0+p.largura,1e-5); perto(se[1]*256,p.py0+p.altura,1e-5);
    assert.equal(p.pixels,p.largura*p.altura);
  }
  /* cada nível dobra o lado da imagem (a menos do arredondamento para pixel inteiro) */
  const p19=C.plano(AREA,19), p20=C.plano(AREA,20);
  assert.ok(Math.abs(p20.largura-2*p19.largura)<=2&&Math.abs(p20.altura-2*p19.altura)<=2);
  /* largura no terreno ≈ pixels × m/px */
  perto(p20.largura*p20.mpp,607,6,'largura em metros');
});

test('área já alinhada aos pixels não ganha pixel a mais',()=>{
  const z=18, no=C.lonLat(96000/256,145000/256,z), se=C.lonLat((96000+700)/256,(145000+500)/256,z);
  const p=C.plano({oeste:no[0],norte:no[1],leste:se[0],sul:se[1]},z);
  assert.equal(p.px0,96000); assert.equal(p.py0,145000); assert.equal(p.largura,700); assert.equal(p.altura,500);
});

test('quadros: cobrem a imagem inteira sem falta nem sobra, cada um na sua posição',()=>{
  const p=C.plano(AREA,19), qs=C.quadros(p);
  assert.equal(qs.length,p.quadros);
  assert.equal(new Set(qs.map(q=>q.x+':'+q.y)).size,qs.length);
  const cob=new Uint8Array(p.largura*p.altura);
  for(const q of qs){
    assert.ok(q.dx>-256&&q.dy>-256&&q.dx<p.largura&&q.dy<p.altura,'quadro fora da imagem');
    assert.equal(((q.dx+p.px0)%256+256)%256,0); assert.equal(q.z,19);
    for(let y=Math.max(0,q.dy);y<Math.min(p.altura,q.dy+256);y++) for(let x=Math.max(0,q.dx);x<Math.min(p.largura,q.dx+256);x++) cob[y*p.largura+x]++;
  }
  assert.ok(cob.every(v=>v===1),'todo pixel é coberto por exatamente um quadro');
});

test('níveis: o melhor é o mais fino que cabe no aparelho; tablet fica abaixo do computador',()=>{
  const tablet=C.limiteDoAparelho(true), pc=C.limiteDoAparelho(false);
  assert.equal(tablet.maxPixels,16777216); assert.ok(pc.maxPixels>tablet.maxPixels);
  const nt=C.niveis(AREA,Object.assign({zMax:22},tablet)), np=C.niveis(AREA,Object.assign({zMax:22},pc));
  assert.equal(nt[0].z,22); assert.ok(nt.length>=6);
  for(let i=1;i<nt.length;i++) assert.equal(nt[i].z,nt[i-1].z-1);
  const mt=C.melhor(nt), mp=C.melhor(np);
  assert.ok(mt&&mp&&mt.pixels<=tablet.maxPixels&&mp.pixels<=pc.maxPixels);
  assert.equal(mt.z,20,'600 m × 450 m no tablet'); assert.equal(mp.z,21,'600 m × 450 m no computador');
  assert.equal(nt.find(p=>p.z===mt.z+1).cabe,false,'o nível acima do melhor não cabe');
  /* área pequena: a resolução máxima do provedor cabe inteira */
  const pequena={oeste:-45.0005,leste:-44.9995,sul:-20.0005,norte:-19.9997};
  assert.equal(C.melhor(C.niveis(pequena,Object.assign({zMax:22},tablet))).z,22);
  /* provedor que só vai até o 19 nunca passa disso */
  assert.equal(C.melhor(C.niveis(pequena,Object.assign({zMax:19},pc))).z,19);
  /* área gigante: nada cabe na lista → null (a janela avisa) */
  assert.equal(C.melhor(C.niveis({oeste:-60,leste:-40,sul:-30,norte:-10},Object.assign({zMax:22,zMin:20},pc))),null);
});

test('endereço do quadro: modelo do mapa de fundo, servidor escolhido como no Leaflet',()=>{
  assert.equal(C.url('https://{s}.exemplo.test/vt?x={x}&y={y}&z={z}',['a','b','c','d'],5,6,7),'https://d.exemplo.test/vt?x=5&y=6&z=7');
  assert.equal(C.url('https://exemplo.test/tile/{z}/{y}/{x}',null,5,6,7),'https://exemplo.test/tile/7/6/5');
});

test('polígono: anel em pixels da imagem; furo fica de fora; feições sobrepostas se somam',()=>{
  const p=C.plano(AREA,18);
  const canto=C.anelEmPixels([[p.limites.oeste,p.limites.norte],[p.limites.leste,p.limites.sul]],p);
  perto(canto[0][0],0,1e-5); perto(canto[0][1],0,1e-5); perto(canto[1][0],p.largura,1e-5); perto(canto[1][1],p.altura,1e-5);
  const fora=[[10,10],[90,10],[90,90],[10,90]], furo=[[40,40],[60,40],[60,60],[40,60]];
  assert.equal(C.dentro(fora,50,50),true); assert.equal(C.dentro(fora,5,50),false);
  /* o sentido em que o anel foi desenhado não importa */
  for(const f of [[fora,furo],[fora.slice().reverse(),furo],[fora,furo.slice().reverse()],[furo,fora]]){
    const o=C.orienta([f]);
    assert.equal(C.voltas(o,50,50),0,'dentro do furo'); assert.notEqual(C.voltas(o,20,50),0); assert.equal(C.voltas(o,5,50),0);
    perto(C.fracaoDentro(o,100,100,50),0.60,0.02);
  }
  /* ilha dentro do furo volta a contar */
  const ilha=[[47,47],[53,47],[53,53],[47,53]];
  assert.notEqual(C.voltas(C.orienta([[fora,furo,ilha]]),50,50),0);
  /* duas feições sobrepostas: a sobreposição continua dentro (não vira buraco) */
  const a=[[10,10],[60,10],[60,60],[10,60]], b=[[40,40],[90,40],[90,90],[40,90]];
  const o=C.orienta([[a],[b.slice().reverse()]]);
  assert.notEqual(C.voltas(o,50,50),0,'sobreposição'); assert.notEqual(C.voltas(o,20,20),0); assert.notEqual(C.voltas(o,80,80),0); assert.equal(C.voltas(o,80,20),0);
  /* o furo de uma feição coberto por outra feição é imagem */
  assert.notEqual(C.voltas(C.orienta([[fora,furo],[[[45,45],[55,45],[55,55],[45,55]]]]),50,50),0);
  perto(C.fracaoDentro(C.orienta([[fora]]),100,100,50),0.64,0.02);
});

test('recorte: só ficam os quadros que têm pedaço dentro do polígono — e nenhum deles falta',()=>{
  /* polígono inclinado e com reentrância, em pixels de uma imagem de 2.300 × 1.700 */
  const p={z:20,px0:1000,py0:3000,largura:2300,altura:1700,tx0:3,ty0:11,tx1:12,ty1:18};
  const pol=C.orienta([[[[150,1500],[900,180],[2150,420],[1500,900],[2050,1600],[1200,1250]],[[900,600],[1150,600],[1150,820],[900,820]]]]);
  const todos=C.quadros(p), usados=C.quadros(p,pol), chave=q=>q.dx+':'+q.dy, tem=new Set(usados.map(chave));
  assert.equal(todos.length,80); assert.ok(usados.length<todos.length&&usados.length>20,'quadros usados: '+usados.length);
  let faltou=0, vazios=0;
  for(const q of todos){
    let dentro=false;
    for(let y=q.dy;y<q.dy+256&&!dentro;y+=4) for(let x=q.dx;x<q.dx+256;x+=4) if(C.voltas(pol,x+.5,y+.5)!==0){ dentro=true; break; }
    if(dentro&&!tem.has(chave(q))) faltou++;
    if(!dentro&&tem.has(chave(q))) vazios++;
  }
  assert.equal(faltou,0,'quadro com imagem dentro do polígono ficou de fora');
  assert.ok(vazios<=6,'quadros baixados à toa: '+vazios);
  /* quadro inteiro dentro do furo não é baixado; polígono que cobre tudo baixa tudo */
  assert.equal(C.retanguloToca(pol,950,650,1100,780),false);
  assert.equal(C.quadros(p,C.orienta([[[[-10,-10],[5000,-10],[5000,5000],[-10,5000]]]])).length,80);
  /* polígono menor que um quadro, sem tocar nenhum canto: o quadro dele é baixado */
  assert.equal(C.quadros(p,C.orienta([[[[100,100],[140,100],[140,140],[100,140]]]])).length,1);
});

test('área dos anéis e validação',()=>{
  const a=C.areaDosAneis([[[-45,-20],[-44.99,-20],[-44.99,-19.99]],[[-45.01,-20.005],[-45,-20]]]);
  assert.equal(JSON.stringify(a),JSON.stringify({oeste:-45.01,sul:-20.005,leste:-44.99,norte:-19.99}));
  assert.equal(C.areaDosAneis([[[1,1]]]),null); assert.equal(C.areaDosAneis([]),null);
  assert.equal(C.areaValida(a),true); assert.equal(C.areaValida({oeste:1,leste:1,sul:0,norte:1}),false); assert.equal(C.areaValida(null),false);
});

test('textos: centímetros abaixo de 1 m, megapixels acima de 1 milhão',()=>{
  assert.equal(C.textoResolucao(0.0351),'3,5 cm/px'); assert.equal(C.textoResolucao(0.14),'14 cm/px');
  assert.equal(C.textoResolucao(1.12),'1,1 m/px'); assert.equal(C.textoResolucao(17.9),'18 m/px');
  assert.equal(C.textoPixels(16777216),'17 MP'); assert.equal(C.textoPixels(5200000),'5,2 MP'); assert.equal(C.textoPixels(420000),'420 mil px');
});
