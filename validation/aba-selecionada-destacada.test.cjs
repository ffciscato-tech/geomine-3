/* A aba selecionada tem de ficar destacada nos dois temas (print IMG_0298 de 28/11/2026: "a aba
   que eu estiver selecionada tem que estar destacado"). No tema claro a regra das abas era mais
   específica que a do destaque e o apagava: sobrava só a cor da borda. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const le=f=>fs.readFileSync(path.join(__dirname,'..','src',f),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
/* regras "seletores{corpo}" de uma folha de estilo */
const regras=css=>[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m=>({sel:m[1].split(',').map(s=>s.trim().replace(/\s+/g,' ')),corpo:m[2]}));
const fundo=corpo=>(/background(?:-color)?\s*:\s*([^;]+)/.exec(corpo)||[])[1]?.trim().toLowerCase()||null;
/* especificidade simplificada: [ids, classes/atributos/pseudoclasses, elementos] */
const peso=sel=>{const s=sel.replace(/:not\(|\)/g,' ');return [(s.match(/#[\w-]+/g)||[]).length,(s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g)||[]).length,(s.match(/(^|[\s>+~])[a-z][\w-]*/g)||[]).length];};
const vence=(a,b)=>{const x=peso(a),y=peso(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return true;};

function confere(arquivo,aba){
  const R=regras(le(arquivo)),ativa=aba+'.on';
  const claraBase=R.filter(r=>fundo(r.corpo)&&r.sel.some(s=>s.startsWith('body.light')&&s.endsWith(' '+aba)));
  const claraAtiva=R.filter(r=>fundo(r.corpo)&&r.sel.some(s=>s.startsWith('body.light')&&s.endsWith(' '+ativa)));
  assert.ok(claraBase.length>=1,arquivo+': regra do tema claro para '+aba);
  assert.ok(claraAtiva.length>=1,arquivo+': o tema claro precisa de regra própria para '+ativa);
  const selBase=claraBase.at(-1).sel.find(s=>s.endsWith(' '+aba)),regraAtiva=claraAtiva.at(-1),selAtiva=regraAtiva.sel.find(s=>s.endsWith(' '+ativa));
  assert.ok(vence(selAtiva,selBase)&&peso(selAtiva).join()!==peso(selBase).join(),arquivo+': "'+selAtiva+'" tem de vencer "'+selBase+'"');
  assert.notEqual(fundo(regraAtiva.corpo),fundo(claraBase.at(-1).corpo),arquivo+': a aba selecionada não pode ter o fundo das outras');
  assert.match(regraAtiva.corpo,/color\s*:\s*#fff/i,arquivo+': texto claro sobre o destaque');
  return fundo(regraAtiva.corpo);
}

test('abas de vista (2D, Cava, Visão 3D, Layout…): a selecionada tem fundo próprio também no tema claro',()=>{
  assert.equal(confere('styles/app.css','.a3-view-tab'),'#0f69c5');
  /* e no tema escuro continua a mesma regra */
  const R=regras(le('styles/app.css')).find(r=>r.sel.includes('.a3-view-tab.on'));
  assert.ok(R&&fundo(R.corpo)==='#0f69c5');
});

test('abas dos desenhos da Cava: a do desenho aberto tem fundo próprio também no tema claro',()=>{
  assert.equal(confere('styles/modules/cava2-workspace.css','.cava2-design-tab'),'#0f69c5');
});

test('a aba de vista ativa é marcada para leitores de tela junto com o destaque',()=>{
  const js=fs.readFileSync(path.join(__dirname,'..','src','core','parts','17-layout-printing.js'),'utf8');
  const i=js.indexOf("a3.querySelectorAll('[data-view]')"),t=js.slice(i,i+360);
  assert.ok(i>0&&/classList\.toggle\('on',ativa\)/.test(t)&&/setAttribute\('aria-current','page'\)/.test(t)&&/removeAttribute\('aria-current'\)/.test(t));
  assert.match(fs.readFileSync(path.join(__dirname,'..','src','index.template.html'),'utf8'),/class="a3-view-tab on" data-view="map" aria-current="page"/);
});
