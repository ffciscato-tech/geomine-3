/* Aba Cava — a régua da barra de baixo MEDE (print IMG_0266, 23/11/2026: "essa ferramenta de
   medição no modo cava está como perfil, tem que ser medição nos dois modos").
   Só geometria sintética (quadrados), sem dado de projeto. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const motor=fs.readFileSync(path.join(__dirname,'cava-pilha-v106.html'),'utf8');
const ponte=fs.readFileSync(path.join(__dirname,'..','cava2-workspace.js'),'utf8');
const trecho=(a,b)=>{const i=motor.indexOf(a),f=motor.indexOf(b,i);assert(i>0&&f>i,'trecho do motor: '+a);return motor.slice(i,f);};
const ctx={};vm.createContext(ctx);
vm.runInContext(`const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)); let escala=2, ox=0, oy=0, medPts=[], medEncaixa=false, ferramenta="medir", objs={}, visibilidade={pilha:{on:true},cava:{on:true}};
  const W2S=(x,y)=>[ox+x*escala, oy-y*escala], alvos=()=>Object.keys(objs), tipoDe=k=>k.startsWith("pilha")?"pilha":"cava",
        fmt=(v,d)=>(+v).toFixed(d).replace(".",","), cotaAbsolutaDoDesign=z=>300+z, DICAS={medir:""}, $=()=>({});`
  +trecho('function totalDaMedicao(','function desenhaMedicao(')
  +';this.api={encaixe:encaixeDaMedicao,total:totalDaMedicao,set:(o,e,p)=>{objs=o;medEncaixa=e;medPts=p||[];},vis:v=>{visibilidade=v;}};',ctx);
const A=ctx.api;
const quad=(m,z,tp)=>({z,tp,P:[[-m,-m],[m,-m],[m,m],[-m,m]].map(p=>({x:p[0],y:p[1]}))});
const pilha=()=>({pilha:{design:{aneis:[quad(20,10,'crista'),quad(40,0,'pe')]}}});
const tela=(x,y)=>[x*2,-y*2];          // a mesma conta do W2S acima

test('a régua mede: na barra de baixo, "measure" arma a medição e "line" continua sendo a seção A–A′',()=>{
  const api=motor.slice(motor.indexOf('activateExternalTool(tool,tipo){'),motor.indexOf('getSelection(){'));
  assert.match(api,/if\(tool==="line"\)\{[^}]*defineTool\("secao"\)/,'linha → seção');
  assert.match(api,/if\(tool==="measure"\)\{[\s\S]*?defineTool\("medir"\)/,'régua → medir');
  assert.doesNotMatch(api,/tool==="line"\|\|tool==="measure"/,'as duas não armam mais a mesma ferramenta');
  assert.match(ponte,/measure:'Régua — medir distância'/);assert.match(ponte,/line:'Desenhar seção A–A′'/);
  assert.match(ponte,/medir:'measure'/,'o botão da régua fica marcado enquanto a medição está armada');
});
test('ponto solto cai onde foi tocado e fica sem cota (o painel usa o MDT escolhido)',()=>{
  A.set(pilha(),false);
  const [sx,sy]=tela(39.5,0),p=A.encaixe(sx,sy,{x:39.5,y:0},false);
  assert.deepEqual([p.x,p.y],[39.5,0]);assert(Number.isNaN(p.z));assert.equal(p.fonte,null);
});
test('com "Grudar": o vértice tem preferência, depois a linha; o ponto leva a cota da linha',()=>{
  A.set(pilha(),true);
  let [sx,sy]=tela(38,-38.5),p=A.encaixe(sx,sy,{x:38,y:-38.5},false);
  assert.deepEqual([p.x,p.y,p.z],[40,-40,300],'vértice do pé, a ~5 px');assert.match(p.fonte,/DCE · pé 300,0 m/);
  [sx,sy]=tela(21.5,3);p=A.encaixe(sx,sy,{x:21.5,y:3},false);
  assert.deepEqual([p.x,p.y,p.z],[20,3,310],'sobre a aresta da crista: projeção nela');assert.match(p.fonte,/crista 310,0 m/);
  [sx,sy]=tela(30,3);p=A.encaixe(sx,sy,{x:30,y:3},false);
  assert.deepEqual([p.x,p.y],[30,3],'longe de qualquer linha (20 px): fica solto');assert(Number.isNaN(p.z));
  // no toque a folga é maior que no mouse (22 px contra 13 px)
  [sx,sy]=tela(29.5,3);assert.equal(A.encaixe(sx,sy,{x:29.5,y:3},true).z,310,'19 px: no toque encaixa');
  assert(Number.isNaN(A.encaixe(sx,sy,{x:29.5,y:3},false).z),'e no mouse não');
  [sx,sy]=tela(0,0);assert(Number.isNaN(A.encaixe(sx,sy,{x:0,y:0},true).z),'no meio do topo, longe de tudo, fica solto mesmo no toque');
});
test('linha de desenho oculto não atrai o ponto; o total é a soma horizontal dos trechos',()=>{
  A.set(pilha(),true);A.vis({pilha:{on:false},cava:{on:true}});
  const [sx,sy]=tela(40,-40);assert(Number.isNaN(A.encaixe(sx,sy,{x:40,y:-40},false).z));
  A.vis({pilha:{on:true},cava:{on:true}});
  A.set(pilha(),false,[{x:0,y:0},{x:3,y:4},{x:3,y:10}]);assert.equal(A.total(),11);
  A.set(pilha(),false,[]);assert.equal(A.total(),0);
});
