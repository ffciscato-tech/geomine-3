/* Aba Cava/DCE — sem camadas de preenchimento (print IMG_0297 de 28/11/2026: "estes
   preenchimentos são desnecessários"). A camada "… — Bruta · preenchimento e rampas" não é mais
   gerada, a de projeto antigo é retirada, e o motor não pinta mais a área, o topo/fundo nem a
   pista da rampa (esta por último: perguntado, o usuário respondeu "pode excluir"). */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ponte=fs.readFileSync(path.join(__dirname,'cava2-workspace.js'),'utf8');
const motor=fs.readFileSync(path.join(__dirname,'cava2','cava-pilha-v106.html'),'utf8');
const ultima=nome=>{const i=ponte.lastIndexOf('function '+nome+'(');assert(i>0,'função '+nome);return i;};
function contexto(camadas){
  const ctx={S:{layers:camadas,activeId:null}};vm.createContext(ctx);
  const i=ultima('cava2EhPreenchimentoGerado'),f=ultima('publicaDesenho');assert(f>i);
  vm.runInContext('function removeCamadaGerada(L){const i=S.layers.indexOf(L);if(i>=0)S.layers.splice(i,1);return true;}'
    +ponte.slice(i,f)+';this.retira=id=>cava2RetiraPreenchimentos(id);this.nomes=()=>JSON.stringify(S.layers.map(L=>L.name));',ctx);
  return ctx;
}
const camadasDeExemplo=()=>[
  {name:'A — Bruta',gtype:'line',_cava2DesignId:'a'},
  {name:'A — Bruta · preenchimento e rampas',gtype:'polygon',_cava2DesignId:'a',_cava2Role:'fill'},
  {name:'A — preenchimento cortado pelo MDT',gtype:'polygon',_cava2CutFillOf:'a',_cava2Role:'cut-fill'},
  {name:'Interseção — A',gtype:'line',_cava2CutOf:'a'},
  {name:'A — Recortada',gtype:'line',_cava2CutSnapshotOf:'a',_cava2SnapshotRole:'line'},
  {name:'A — Recortada (preenchimento antigo)',gtype:'polygon',_cava2CutSnapshotOf:'a',_cava2SnapshotRole:'fill'},
  {name:'B — Bruta',gtype:'line',_cava2DesignId:'b'},
  {name:'B — Bruta · preenchimento e rampas',gtype:'polygon',_cava2DesignId:'b',_cava2Role:'fill'},
  {name:'Limite da pilha — polígonos',gtype:'polygon'},
  {name:'Polígono que foi de um desenho',gtype:'polygon',_cava2Role:'fill'}];

test('retira só o preenchimento gerado: linhas, corte congelado e polígonos da pessoa ficam',()=>{
  const c=contexto(camadasDeExemplo());
  assert.equal(c.retira(),3,'os dois da Bruta e o do corte');
  assert.deepEqual(JSON.parse(c.nomes()),['A — Bruta','Interseção — A','A — Recortada','A — Recortada (preenchimento antigo)',
    'B — Bruta','Limite da pilha — polígonos','Polígono que foi de um desenho']);
  assert.equal(c.retira(),0,'segunda passada não tem o que tirar');
});

test('por desenho: publicar o desenho A não mexe nas camadas do desenho B',()=>{
  const c=contexto(camadasDeExemplo());
  assert.equal(c.retira('a'),2);
  const n=JSON.parse(c.nomes());
  assert.ok(n.includes('B — Bruta · preenchimento e rampas')&&!n.includes('A — Bruta · preenchimento e rampas')&&!n.includes('A — preenchimento cortado pelo MDT'));
});

test('a publicação do desenho não cria mais camada de polígonos',()=>{
  const i=ultima('publicaDesenho'),f=ponte.indexOf('function designRuntime(d){',i),corpo=ponte.slice(i,f);
  assert.ok(f>i&&corpo.length>600);
  assert.ok(!/gtype:'polygon'/.test(corpo),'publicaDesenho não chama addLayer de polígonos');
  assert.ok(/cava2RetiraPreenchimentos\(d\.id\)/.test(corpo),'e retira a que veio de projeto antigo');
  assert.ok(/gtype:'line'/.test(corpo),'a camada de linhas continua sendo publicada');
  /* a reconstrução de camadas ausentes não trata a falta do preenchimento como falha */
  const r=ponte.slice(ultima('reconstroiCamadasAusentes'),ultima('migraEstado'));
  assert.ok(!/rawFill|cutFill|faltaFill/.test(r),'reconstroiCamadasAusentes não espera preenchimento');
  /* ao abrir o projeto a retirada vem antes de saber se a aba Cava já carregou */
  const a=ponte.slice(ultima('aplicaEstadoProjeto'),ultima('aplicaEstadoProjeto')+700);
  assert.ok(a.indexOf('cava2RetiraPreenchimentos()')>0&&a.indexOf('cava2RetiraPreenchimentos()')<a.indexOf('estado.projetoPendente'));
  /* as pistas de rampa do corte pelo MDT continuam saindo das feições de preenchimento */
  assert.ok(/pistas=finalizado\?feicoesPreenchimentoDoDesign\(/.test(ponte));
});

test('motor da aba Cava: área, topo/fundo e pista da rampa não são pintados; bordas, eixo e setas continuam',()=>{
  const i=motor.indexOf('function desenhaObjeto(k){'),f=motor.indexOf('// rótulos de cota nas cristas',i),corpo=motor.slice(i,f);
  assert.ok(i>0&&f>i);
  assert.ok(!/preencheAnel\(/.test(motor),'nenhum anel preenchido');
  assert.ok(!/#c9ced6|#efe6d2/i.test(corpo),'sem a cor chapada do topo e do fundo');
  assert.ok(!/cor\.fill\b/.test(corpo),'sem a tinta da área projetada');
  assert.ok(!/preencheRampaPorCota|rampaF/.test(motor),'sem o sombreado da pista da rampa');
  /* no trecho da rampa não sobra nenhum preenchimento antes das setas */
  const r=corpo.slice(corpo.indexOf('const corrs=o.design.corredores;'),corpo.indexOf('// setas: sentido de VIAGEM'));
  assert.ok(r.length>200&&!/ctx\.fill\(|fillStyle/.test(r),'a pista não é preenchida');
  assert.ok(/tracaLinhaPorCota\(c\.poly,true/.test(r)&&/tracaLinhaPorCota\(c\.centro,false/.test(r),'bordas e eixo da rampa continuam traçados');
  assert.ok(/\/\/ setas: sentido de VIAGEM/.test(corpo)&&/opSeta/.test(corpo),'as setas de sentido continuam');
});
