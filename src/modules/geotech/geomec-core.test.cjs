/* GEOMEC — núcleo das seções geomecânicas: montagem do modelo, cálculo, estudos e projeto.
   Só dados sintéticos (taludes e perfis inventados, em coordenadas neutras). */
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm');
const DIR=__dirname;
function carrega(){
  const ctx={console, setTimeout, clearTimeout, structuredClone};
  ctx.window=ctx; ctx.self=ctx;
  vm.createContext(ctx);
  for(const f of ['slope-stability.js','geomec-core.js','geomec-litologias.js']) vm.runInContext(fs.readFileSync(path.join(DIR,f),'utf8'),ctx,{filename:f});
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
  Object.assign(b.agua,{modo:'linha', linha:[[0,20],[100,8]]});
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

/* ---------------- pedido de 22/11/2026: seção com topografia + PDE, NA com pior caso, litologias ---------------- */
test('perfil por linhas com cota: curvas de nível e linhas de projeto cortadas pela seção',()=>{
  const {GM}=carrega();
  const linha=[[0,0],[100,0]];
  /* três curvas de nível verticais (x = 20, 50, 80) com cotas 130, 120, 110, uma curva fora e uma paralela */
  const curva=(x,z)=>({pts:[[x,-50,z],[x,50,z]]});
  const partes=[curva(20,130),curva(50,120),curva(80,110),curva(150,100),{pts:[[0,5,90],[100,5,90]]},{pts:[[0,0,99],[100,0,99]]}];
  const P=GM.perfilVetorial(linha,partes);
  assert.deepEqual(puro(P),[[20,130],[50,120],[80,110]]);
  assert.ok(Number.isNaN(GM.cotaPerfil(P,10))&&Number.isNaN(GM.cotaPerfil(P,90)),'fora das curvas não há cota');
  assert.equal(GM.cotaPerfil(P,35),125); assert.equal(GM.cotaPerfil(P,80),110);
  /* rampa: a cota varia ao longo da aresta; anel fechado cruza duas vezes; vértice comum conta uma vez */
  const rampa={pts:[[40,-10,100],[40,10,120]]}, anel={pts:[[60,-5,140],[70,-5,140],[70,5,140],[60,5,140]], fechada:true};
  const Q=GM.perfilVetorial(linha,[rampa,anel,{pts:[[10,-5,7],[10,0,8],[10,5,9]]}]);
  assert.deepEqual(puro(Q),[[10,8],[40,110],[60,140],[70,140]]);
  /* linha da seção ao contrário: as distâncias contam do primeiro ponto */
  assert.deepEqual(puro(GM.perfilVetorial([[100,0],[0,0]],partes.slice(0,3))),[[20,110],[50,120],[80,130]]);
});

test('seção com topografia e PDE: pilha por cima do terreno natural, que vira o contato; cava pelo menor; só topografia',()=>{
  const {GM}=carrega();
  const dist=Array.from({length:101},(_,i)=>i);
  const topo=dist.map(x=>100-0.2*x);                                   /* encosta suave */
  const pde=dist.map(x=>x<20||x>70?NaN:(x<=40?112:112-(x-40)*0.6));   /* plataforma e talude da pilha */
  const s=GM.novaSecaoMapa([[0,0],[100,0]],'EPSG:31983',dist,[{id:'t',nome:'Curvas',papel:'terreno',z:topo,fonte:'vetor'},{id:'p',nome:'DCE 1 — Bruta',papel:'projeto',z:pde,tipo:'pilha',fonte:'vetor'}],{});
  const z=x=>GM.lerp(s.terreno,x);
  assert.ok(Math.abs(z(10)-98)<1e-9,'fora da pilha vale a topografia');
  assert.ok(Math.abs(z(30)-112)<1e-9,'na plataforma vale o projeto');
  assert.ok(Math.abs(z(68)-Math.max(112-28*0.6,100-0.2*68))<1e-6);
  assert.equal(s.camadas.length,2); const f=s.camadas[1];
  assert.equal(f.fonte.natural,true); assert.ok(Math.abs(GM.lerp(f.topo,30)-94)<1e-9,'contato pilha/fundação = topografia');
  assert.match(s.materiais[s.camadas[0].mat].nome,/Pilha/); assert.match(s.materiais[f.mat].nome,/Fundação/);
  assert.equal(s.materiais[s.camadas[0].mat].lito,'esteril-lancado');
  assert.deepEqual(puro(s.fontes),{topografia:{id:'t',nome:'Curvas',tipo:'vetor'},projeto:{id:'p',nome:'DCE 1 — Bruta',tipo:'vetor',papel:'pilha'}});
  assert.ok(GM.calcula(s).ok,'a seção da pilha calcula');
  /* cava: o menor dos dois, sem camada nova */
  const cava=dist.map(x=>x<30||x>60?NaN:80);
  const c=GM.novaSecaoMapa([[0,0],[100,0]],'EPSG:31983',dist,[{id:'t',nome:'MDT',papel:'terreno',z:topo},{id:'c',nome:'Cava',papel:'projeto',z:cava,tipo:'cava'}],{});
  assert.equal(c.camadas.length,1); assert.equal(GM.lerp(c.terreno,45),80); assert.ok(Math.abs(GM.lerp(c.terreno,10)-98)<1e-9);
  /* projeto todo abaixo da topografia numa pilha: fica só o terreno natural, com aviso */
  const baixo=GM.novaSecaoMapa([[0,0],[100,0]],'EPSG:31983',dist,[{id:'t',nome:'MDT',papel:'terreno',z:topo},{id:'p',nome:'P',papel:'projeto',z:dist.map(()=>50),tipo:'pilha'}],{});
  assert.equal(baixo.camadas.length,1); assert.match(baixo.avisoProjeto,/não passa acima/);
  /* só a topografia (talude natural): como antes */
  const so=GM.novaSecaoMapa([[0,0],[100,0]],'EPSG:31983',dist,[{id:'t',nome:'MDT',papel:'terreno',z:topo}],{});
  assert.equal(so.camadas.length,1); assert.equal(so.fontes.projeto,null);
});

test('NA crítico: linha elevada de Δ sem passar do terreno; lâmina d’água fica como está',()=>{
  const {GM}=carrega();
  const terreno=[[0,20],[10,20],[30,0],[50,0]], na=[[0,8],[50,-2]];
  const L=GM.elevaNA(na,terreno,5), z=x=>GM.lerp(L,x);
  assert.ok(Math.abs(z(0)-13)<1e-9); assert.ok(Math.abs(z(50)-0)<1e-9,'no pé o NA elevado encosta no terreno');
  for(let x=0;x<=50;x+=0.5){ const t=GM.lerp(terreno,x), l=GM.lerp(na,x); assert.ok(z(x)<=Math.max(t,l)+1e-6&&z(x)<=l+5+1e-6&&z(x)>=Math.min(l+5,t)-1e-3,'x='+x); }
  /* um lago (linha acima do terreno) não sobe */
  const lago=GM.elevaNA([[0,5],[50,5]],[[0,10],[20,0],[50,0]],3);
  assert.ok(Math.abs(GM.lerp(lago,40)-5)<1e-9); assert.ok(Math.abs(GM.lerp(lago,0)-8)<1e-9);
});

test('condições de água: seco ≥ desenhado ≥ crítico ≥ saturado; o pior caso fica com o menor FS e diz qual foi',async()=>{
  const {GM}=carrega();
  const s=GM.novaSecaoTalude({bancadas:1, altura:20, angulo:35});
  Object.assign(s.materiais.m1,{c:12, phi:30, gama:19, ru:0.2});
  const L=GM.limites(s);
  Object.assign(s.agua,{modo:'linha', linha:[[L.x0,6],[L.x1,0.5]]});
  assert.deepEqual(puro(GM.condicoesPior(s)),['seco','desenhado','critico']);
  assert.equal(GM.definicao(s,'seco').agua,null); assert.equal(GM.definicao(s,'seco').materiais.m1.ru,0);
  assert.equal(GM.definicao(s,'desenhado').materiais.m1.ru,0.2);
  assert.deepEqual(puro(GM.definicao(s,'saturado').agua.linha),puro(s.terreno));
  assert.equal(GM.deltaCritico(s),4,'20% do desnível de 20 m');
  const FS={};
  for(const c of GM.ORDEM_COND){ const r=GM.calculaCond(s,c); assert.ok(r.ok,c); FS[c]=r.critica.FS; assert.equal(s.resumo.condicao,c); }
  assert.ok(FS.seco>FS.desenhado&&FS.desenhado>FS.critico&&FS.critico>FS.saturado,JSON.stringify(FS));
  s.agua.condicao='pior'; s.agua.incluir.saturado=true;
  const r=GM.calcula(s);
  assert.equal(r.condicao,'saturado'); assert.ok(Math.abs(r.critica.FS-FS.saturado)<1e-12);
  assert.deepEqual(puro(r.condicoes.map(c=>[c.cond,+c.FS.toFixed(6),c.adm])),puro(GM.ORDEM_COND.map(c=>[c,+FS[c].toFixed(6),c==='critico'||c==='saturado'?1.3:1.5])));
  assert.equal(s.resumo.condicao,'saturado'); assert.equal(s.resumo.condicoes.length,4);
  assert.equal(GM.condicaoEfetiva(s),'saturado'); assert.equal(GM.admEfetivo(s),1.3);
  assert.equal(GM.definicao(s).condicao,'saturado','os estudos usam a condição que governou');
  /* em segundo plano: as condições vão uma a uma e o andamento é avisado */
  s.agua.incluir.saturado=false; const passos=[];
  const ra=await GM.calculaAsync(s,(i,n,c)=>passos.push([i,n,c]));
  assert.deepEqual(puro(passos),[[0,3,'seco'],[1,3,'desenhado'],[2,3,'critico']]);
  assert.equal(ra.condicao,'critico'); assert.ok(Math.abs(s.resumo.FS-FS.critico)<1e-9);
  /* sem linha desenhada o NA crítico não existe; nada marcado dá um motivo claro */
  s.agua.modo='nenhuma'; s.materiais.m1.ru=0;
  assert.deepEqual(puro(GM.condicoesPior(s)),['seco']);
  s.agua.incluir={seco:false, desenhado:false, critico:false, saturado:false};
  const nada=GM.calcula(s); assert.equal(nada.ok,false); assert.match(nada.motivo,/Marque ao menos/);
});

test('banco de litologias: valores aplicados ao material, fontes e faixas; rocha por Hoek–Brown calcula',()=>{
  const {GM}=carrega();
  assert.ok(GM.LITOLOGIAS.length>=40); assert.equal(new Set(GM.LITOLOGIAS.map(x=>x.id)).size,GM.LITOLOGIAS.length,'ids únicos');
  for(const b of GM.LITOLOGIAS){
    assert.ok(GM.GRUPOS_LITO.includes(b.grupo),b.id); assert.ok(GM.FONTES_LITO[b.fonte],b.id+' sem fonte');
    assert.ok(b.gama>=14&&b.gama<=30,b.id);
    if(b.modelo==='mc'){ assert.ok(b.phi>=8&&b.phi<=45&&b.c>=0,b.id); if(b.faixa&&b.faixa.phi) assert.ok(b.phi>=b.faixa.phi[0]&&b.phi<=b.faixa.phi[1],b.id); if(b.faixa&&b.faixa.c) assert.ok(b.c>=b.faixa.c[0]&&b.c<=b.faixa.c[1],b.id); }
    if(b.modelo==='hb') assert.ok(b.sci>=b.faixa.sci[0]&&b.sci<=b.faixa.sci[1]&&b.mi>0,b.id);
    assert.ok(GM.faixaLitologia(b).length>5);
  }
  assert.equal(GM.litologia('marmore').mi,9); assert.equal(GM.litologia('gnaisse').mi,28); assert.equal(GM.litologia('granito').mi,32);
  const s=GM.novaSecaoTalude({bancadas:3, altura:15, angulo:70, berma:8});
  assert.ok(GM.aplicaLitologia(s.materiais.m1,'gnaisse')); assert.equal(s.materiais.m1.modelo,'hb'); assert.equal(s.materiais.m1.lito,'gnaisse');
  const r=GM.calcula(s); assert.ok(r.ok&&r.critica.FS>1,'maciço de gnaisse GSI 50 fica de pé');
  assert.equal(GM.aplicaLitologia(s.materiais.m1,'nada'),false);
});
