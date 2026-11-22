/* GEOMEC — núcleo das seções geomecânicas: montagem do modelo, cálculo, estudos e projeto.
   Só dados sintéticos (taludes e perfis inventados, em coordenadas neutras). */
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const DIR=__dirname;
function carrega(){
  const ctx={console, setTimeout, clearTimeout, structuredClone};
  ctx.window=ctx; ctx.self=ctx;
  vm.createContext(ctx);
  for(const f of ['slope-stability.js','geomec-core.js']) vm.runInContext(fs.readFileSync(path.join(DIR,f),'utf8'),ctx,{filename:f});
  return {GM:ctx.GeoMineGeomecInterno, SL:ctx.GeoMineSlope, ctx};
}
const puro=v=>JSON.parse(JSON.stringify(v));

test('talude paramétrico: geometria, ângulo geral e regeneração com os contatos acompanhando',()=>{
  const {GM}=carrega();
  const s=GM.novaSecaoTalude({bancadas:3, altura:10, angulo:45, berma:5, pe:25, crista:30, cota:100});
  assert.deepEqual(puro(s.terreno),[[0,130],[30,130],[40,120],[45,120],[55,110],[60,110],[70,100],[95,100]]);
  const t=GM.terrenoTalude(s.parametros);
  assert.equal(t.altura,30); assert.equal(t.comprimento,95);
  assert.ok(Math.abs(t.geral-Math.atan2(30,40)*180/Math.PI)<1e-9);
  GM.novaCamadaCota(s,105);
  assert.deepEqual(puro(s.camadas[1].topo),[[0,105],[95,105]]);
  s.parametros.bancadas='2'; s.parametros.berma='8,5';                 /* texto digitado, com vírgula */
  GM.regeraTalude(s);
  assert.deepEqual(puro(s.terreno),[[0,120],[30,120],[40,110],[48.5,110],[58.5,100],[83.5,100]]);
  assert.deepEqual(puro(s.camadas[1].topo),[[0,105],[83.5,105]]);
  /* valores absurdos não derrubam a seção */
  s.parametros.angulo='200'; s.parametros.altura='-3'; s.parametros.crista='0';
  GM.regeraTalude(s);
  assert.ok(s.terreno.every((p,i,a)=>i===0||p[0]>a[i-1][0]),'distâncias crescentes');
});

test('seção cortada no mapa: terreno onde há cota, contato mais alto no resto, contatos ordenados e os de cima ignorados',()=>{
  const {GM}=carrega();
  const n=101, dist=Array.from({length:n},(_,i)=>i*2);
  const original=dist.map(x=>50-0.1*x);                                  /* terreno original, inclinado */
  const pilha=dist.map(x=>x>=40&&x<=140?original[dist.indexOf(x)]+Math.min((x-40)/2,(140-x)/2,20):NaN);   /* pilha só no meio */
  const rocha=dist.map((x,i)=>original[i]-8);
  const aerea=pilha.map(z=>Number.isFinite(z)?z+5:NaN);                  /* passa acima da pilha: não separa nada */
  const s=GM.novaSecaoMapa([[1000,2000],[1200,2000]],'EPSG:31983',dist,[
    {id:7,nome:'rocha',papel:'contato',z:rocha},{id:3,nome:'pilha',papel:'terreno',z:pilha},
    {id:5,nome:'original',papel:'contato',z:original},{id:9,nome:'aérea',papel:'contato',z:aerea}],{});
  assert.equal(s.origem,'mapa'); assert.equal(s.comprimento,200); assert.equal(s.recuo,0);
  assert.deepEqual(puro(s.ignorados),['aérea']);
  assert.deepEqual(puro(s.camadas.map(c=>c.fonte.nome)),['pilha','original','rocha'],'de cima para baixo');
  /* fora da pilha o terreno é o original; no meio, a pilha */
  assert.ok(Math.abs(GM.lerp(s.terreno,10)-49)<1e-6);
  assert.ok(Math.abs(GM.lerp(s.terreno,90)-(41+20))<1e-6);
  /* o contato do terreno original nunca sobe acima do terreno */
  for(const x of [0,20,60,90,150,200]) assert.ok(GM.lerp(s.camadas[1].topo,x)<=GM.lerp(s.terreno,x)+1e-9);
  /* simplificação: linhas retas viram poucos pontos */
  assert.ok(s.terreno.length<=12,'terreno simplificado: '+s.terreno.length);
  assert.equal(s.camadas[2].topo.length,2);
  const r=GM.calcula(s);
  assert.ok(r.ok&&r.critica.FS>0.3&&r.critica.FS<5);
});

test('seção do mapa: borda sem cota é aparada e vazio no meio é recusado',()=>{
  const {GM}=carrega();
  const dist=Array.from({length:51},(_,i)=>i), z=dist.map(x=>x<5||x>45?NaN:30-0.5*x);
  const s=GM.novaSecaoMapa([[0,0],[50,0]],'EPSG:31983',dist,[{id:1,nome:'mdt',papel:'terreno',z}],{});
  assert.equal(s.recuo,5); assert.equal(s.comprimento,40); assert.equal(s.terreno[0][0],0);
  const furo=z.slice(); furo[20]=NaN;
  assert.throws(()=>GM.novaSecaoMapa([[0,0],[50,0]],'EPSG:31983',dist,[{id:1,nome:'mdt',papel:'terreno',z:furo}],{}),/vazio no meio/);
  assert.throws(()=>GM.novaSecaoMapa([[0,0],[50,0]],'EPSG:31983',dist,[{id:1,nome:'mdt',papel:'contato',z}],{}),/terreno/);
});

test('definição para o motor: números digitados com vírgula, água, cargas, trinca e envoltória por pontos',()=>{
  const {GM}=carrega();
  const s=GM.novaSecaoTalude({});
  Object.assign(s.materiais.m1,{c:'12,5', phi:'31,0', gama:'18,5', ru:'0,1'});
  s.agua={modo:'linha', linha:[[40,5],[0,12]]};
  s.cargas=[{x1:'2', x2:'10', q:'25'},{x1:'', x2:'5', q:'10'},{x1:'1', x2:'2', q:'0'}];
  s.sismo={kh:'0,08', kv:''}; s.trinca={prof:'1,5', agua:'50'};
  const d=GM.definicao(s);
  assert.deepEqual(puro(d.materiais.m1),{nome:'Maciço', modelo:'mc', gama:18.5, gamaSat:0, ru:0.1, c:12.5, phi:31});
  assert.deepEqual(puro(d.agua.linha),[[0,12],[40,5]],'linha d’água em ordem');
  assert.deepEqual(puro(d.cargas),[{x1:2,x2:10,q:25}]);
  assert.deepEqual(puro(d.sismo),{kh:0.08, kv:0}); assert.deepEqual(puro(d.trinca),{prof:1.5, agua:0.5});
  s.materiais.m1.modelo='tab'; s.materiais.m1.tab='0 0\n100; 60\n  300   150 \nlixo';
  assert.deepEqual(puro(GM.definicao(s).materiais.m1.tab),[[0,0],[100,60],[300,150]]);
  s.agua.modo='nenhuma'; s.trinca.prof='0';
  const d2=GM.definicao(s); assert.equal(d2.agua,null); assert.equal(d2.trinca,null);
});

test('cálculo da seção: resumo para o projeto, classes de segurança e crítica igual ao menor dos portes',()=>{
  const {GM}=carrega();
  for(const p of [{bancadas:1,altura:20,angulo:35,berma:6,c:10,phi:30},{bancadas:3,altura:10,angulo:60,berma:8,c:10,phi:30},{bancadas:2,altura:15,angulo:50,berma:10,c:5,phi:35}]){
    const s=GM.novaSecaoTalude(p); s.materiais.m1.c=p.c; s.materiais.m1.phi=p.phi;
    const r=GM.calcula(s);
    assert.ok(r.ok,'tem solução');
    assert.equal(GM.resultado(s),r);
    assert.ok(Math.abs(s.resumo.FS-r.critica.FS)<1e-12);
    assert.equal(s.resumo.metodo,'mp'); assert.equal(s.resumo.tipo,'circulo');
    const menor=Math.min(...r.busca.porte.map(q=>q.FS));
    assert.ok(Math.abs(r.circular.FS-menor)<1e-9,'crítica '+r.circular.FS+' × menor porte '+menor);
    assert.ok(r.busca.porte.every(q=>['local','intermediaria','global'].includes(q.classe)));
  }
  assert.equal(GM.classe(0.95,1.5),'ruptura'); assert.equal(GM.classe(1.2,1.5),'baixo'); assert.equal(GM.classe(1.4,1.5),'atencao');
  assert.equal(GM.classe(1.5,1.5),'ok'); assert.equal(GM.classe(1.15,1.1),'ok'); assert.equal(GM.classe(NaN,1.5),'nd');
});

test('pilha sobre camada fraca: a otimização não circular baixa o fator de segurança; Bishop fica no círculo',()=>{
  const {GM}=carrega();
  const s=GM.novaSecaoTalude({bancadas:4, altura:10, angulo:33.7, berma:0, pe:30, crista:50});
  const x1=s.terreno.at(-1)[0];
  s.materiais={m1:Object.assign(GM.materialPadrao(0,'Estéril'),{gama:20,c:0,phi:37}), m2:Object.assign(GM.materialPadrao(1,'Argila'),{gama:17,c:5,phi:14}), m3:Object.assign(GM.materialPadrao(2,'Fundação'),{gama:19,c:40,phi:32})};
  s.camadas=[{mat:'m1'},{mat:'m2',topo:[[0,0],[x1,0]]},{mat:'m3',topo:[[0,-2],[x1,-2]]}]; s.base=-25; s.busca.naoCircular=true;
  const r=GM.calcula(s);
  assert.ok(r.ok&&r.naoCircular&&r.naoCircular.ok);
  assert.equal(r.critica.sup.tipo,'poli');
  assert.ok(r.critica.FS<r.circular.FS-0.05,'círculo '+r.circular.FS+' → otimizada '+r.critica.FS);
  assert.equal(s.resumo.tipo,'poli'); assert.ok(Math.abs(s.resumo.FScircular-r.circular.FS)<1e-12);
  s.busca.metodo='bishop';
  const b=GM.calcula(s);
  assert.equal(b.naoCircular,null); assert.equal(b.critica.sup.tipo,'circulo'); assert.equal(b.critica.metodo,'bishop');
});

test('superfície à mão: o caminho rápido do arrasto dá o mesmo fator de segurança do método principal',()=>{
  const {GM}=carrega();
  const s=GM.novaSecaoTalude({bancadas:1, altura:20, angulo:40});
  const sup={tipo:'circulo', xc:55, zc:38, r:40};
  const rapido=GM.calculaManual(s,sup,true), completo=GM.calculaManual(s,sup,false);
  assert.ok(rapido.ok&&completo.ok);
  assert.deepEqual(puro(Object.keys(rapido.F)),['mp']); assert.equal(rapido.curvas,null);
  assert.ok(Math.abs(rapido.FS-completo.FS)<0.004,rapido.FS+' × '+completo.FS);
  assert.ok(completo.F.bishop>0&&completo.F.spencer>0&&completo.curvas);
  assert.equal(GM.calculaManual(s,{tipo:'circulo', xc:-500, zc:900, r:10}).ok,false);
});

test('estudos: sensibilidade no sentido certo, Monte Carlo reprodutível, escoamento e retroanálise fechando em FS = 1',()=>{
  const {GM, SL}=carrega();
  const s=GM.novaSecaoTalude({bancadas:1, altura:20, angulo:35}); s.materiais.m1.c=12; s.materiais.m1.phi=30;
  const r=GM.calcula(s), sup={tipo:'circulo', xc:r.critica.sup.xc, zc:r.critica.sup.zc, r:r.critica.sup.r};
  const sens=GM.sensibilidade(s,sup,0.2);
  assert.equal(sens.variacao,0.2); assert.equal(sens.itens.length,3);
  const de=k=>sens.itens.find(i=>i.chave===k);
  assert.ok(de('c').FS.at(-1)>de('c').FS[0]); assert.ok(de('phi').FS.at(-1)>de('phi').FS[0]); assert.ok(de('gama').FS.at(-1)<de('gama').FS[0]);
  assert.ok(Math.abs(de('phi').FS[4]-sens.base)<1e-9,'o ponto central é o valor de projeto');
  const a=GM.monteCarlo(s,sup,300), b=GM.monteCarlo(s,sup,300);
  assert.equal(a.n,300); assert.equal(a.media,b.media); assert.ok(a.dp>0&&a.min<a.media&&a.max>a.media);
  assert.ok(Math.abs(a.media-sens.base)<0.05); assert.deepEqual(puro(a.vars.map(v=>v.chave).sort()),['c','gama','phi']);
  const ky=GM.escoamento(s,sup);
  assert.ok(ky.ok&&ky.ky>0&&ky.ky<1); assert.ok(Math.abs(ky.F0-sens.base)<1e-9);
  const d=GM.definicao(s); d.sismo.kh=ky.ky;
  assert.ok(Math.abs(SL.avalia(d,sup,{metodo:'mp'})-1)<2e-3);
  const retro=GM.retroanalise(s,sup,'m1');
  assert.ok(retro.pts.length>=4);
  for(const p of retro.pts.filter(q=>q[1]>0)){ const e=GM.definicao(s); e.materiais.m1.phi=p[0]; e.materiais.m1.c=p[1]; assert.ok(Math.abs(SL.avalia(e,sup,{metodo:'mp'})-1)<0.01); }
  assert.ok(retro.pts.every((p,i,A)=>i===0||p[1]<=A[i-1][1]+1e-6),'mais atrito pede menos coesão');
  s.materiais.m1.modelo='su'; assert.equal(GM.retroanalise(s,sup,'m1'),null);
});

test('projeto: o que é salvo volta igual, sem os resultados pesados, e entradas quebradas são descartadas',()=>{
  const {GM}=carrega();
  const a=GM.novaSecaoTalude({bancadas:2}); GM.calcula(a);
  const b=GM.novaSecaoMapa([[10,20],[110,20]],'EPSG:31983',[0,50,100],[{id:1,nome:'mdt',papel:'terreno',z:[30,28,10]}],{});
  b.agua={modo:'linha', linha:[[0,20],[100,8]]};
  const foto=GM.snapshot();
  assert.equal(foto.secoes.length,2); assert.equal(foto.ativa,b.id);
  assert.ok(JSON.stringify(foto).length<6000,'projeto enxuto: '+JSON.stringify(foto).length+' bytes');
  /* do cálculo fica só o resumo: nada das superfícies tentadas nem das fatias */
  assert.equal(typeof foto.secoes[0].resumo.tentativas,'number');
  assert.ok(foto.secoes.every(q=>!('busca' in q&&q.busca.tentativas)&&!q.fatias&&!q.critica));
  const outro=carrega().GM;
  outro.restaura(puro(foto));
  assert.deepEqual(puro(outro.snapshot()),puro(foto));
  assert.equal(outro.ativa().id,b.id); assert.equal(outro.resultado(outro.secoes()[0]),null);
  assert.ok(Math.abs(outro.secoes()[0].resumo.FS-a.resumo.FS)<1e-12);
  outro.restaura({secoes:[null,{nome:'x'},{nome:'ok', terreno:[[0,5],[10,0]], camadas:[{mat:'m1'}], materiais:{m1:{gama:19,c:5,phi:30}}}], ativa:'nada'});
  assert.equal(outro.secoes().length,1); assert.equal(outro.ativa().nome,'ok');
  assert.equal(outro.ativa().busca.metodo,'mp'); assert.equal(outro.ativa().fsAdm,1.5);
  outro.restaura(null); assert.equal(outro.temConteudo(),false);
  GM.exclui(b); assert.equal(GM.ativa(),a); GM.exclui(a); assert.equal(GM.ativa(),null);
});

test('cálculo em segundo plano: sem Worker cai no cálculo direto; o texto do motor roda sozinho numa thread',async()=>{
  const {GM, SL}=carrega();
  const s=GM.novaSecaoTalude({bancadas:1, altura:20, angulo:35});
  const r=await GM.calculaAsync(s);
  assert.ok(r.ok); assert.equal(GM.resultado(s),r); assert.ok(Math.abs(s.resumo.FS-r.critica.FS)<1e-12);
  assert.equal(GM.ocupado(),false);
  const sens=await GM.pede('sensibilidade',s,[{tipo:'circulo', xc:r.critica.sup.xc, zc:r.critica.sup.zc, r:r.critica.sup.r},0.2]);
  assert.equal(sens.itens.length,3);
  /* o mesmo código, como texto, num contexto vazio (o que o Worker faz) */
  const fio={}; fio.self=fio; vm.createContext(fio);
  vm.runInContext(SL.fonte()+'\n'+GM.fonte(),fio);
  const copia=puro(s), la=fio.GeoMineGeomecInterno.calcula(copia);
  assert.ok(Math.abs(la.critica.FS-r.critica.FS)<1e-12,'mesmo resultado na thread');
  assert.doesNotThrow(()=>structuredClone({res:la, resumo:copia.resumo}),'o resultado atravessa a fronteira da thread');
  /* cancelar sem nada em andamento não quebra */
  GM.cancela(); assert.equal(GM.ocupado(),false);
});
