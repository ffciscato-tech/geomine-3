/* Área 2D — motor v0.9 encapsulado, com desenhos independentes e camadas 3D. */
(function(){
'use strict';

const CAVA2_V106_SOURCE=__GEOMINE_CAVA_V106_SOURCE__;
const STORAGE_KEY='ccmgis2DMotorV10';
const REGISTRY_KEY='ccmgis2DDesignRegistryV2';
const IDS_VALORES=['cava_H','cava_banco','cava_nb','cava_face','cava_berma','cava_rampa_larg','cava_rampa_grad','cava_rampa_raio',
  'pilha_H','pilha_banco','pilha_nb','pilha_face','pilha_berma','pilha_rampa_larg','pilha_rampa_grad','pilha_rampa_raio'];
const estado={frame:null,ready:false,crs:null,baseZ:0,fonte:null,alvo:'cava',syncTimer:0,
  projetoPendente:undefined,restaurando:false,desenhos:[],desenhoId:null,seq:0,
  painelFechado:true,cutHashes:{},mdtTrabalhoId:null};

function fontePreparada(){
  return String(CAVA2_V106_SOURCE||'')
    .replaceAll('cavaPilhaV02',STORAGE_KEY)
    .replace('<title>Cava &amp; Pilha por Strings — v10.6</title>',
      '<title>CCMGIS — Área 2D</title>')
    .replace('font-family:"Segoe UI",system-ui,Arial,sans-serif',
      'font-family:"Signika",system-ui,sans-serif')
    .replace('<h1>Cava &amp; Pilha por Strings</h1>',
      '<h1>CCMGIS — Cava e DCE em 2D</h1>');
}

function workspace(){return document.getElementById('cava2Workspace');}
function api(){try{return estado.frame&&estado.frame.contentWindow&&estado.frame.contentWindow.__api;}catch(e){return null;}}
function doc2D(){try{return estado.frame&&estado.frame.contentDocument;}catch(e){return null;}}
function n(v,padrao){v=Number(v);return Number.isFinite(v)?v:(padrao||0);}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function status(msg,erro){
  const el=document.getElementById('cava2BridgeStatus');
  if(el){el.textContent=msg||'';el.style.color=erro?'var(--sel)':'var(--ink-dim)';}
}
function atualizaCursorGlobal(ev){
  const q=ev&&ev.detail;if(!q)return;
  const fmt=v=>n(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const coord=document.getElementById('roCoord2'),legado=document.getElementById('roCoord');
  const txt=`E ${fmt(q.x)}  N ${fmt(q.y)}`;
  if(coord)coord.textContent=txt;if(legado)legado.textContent=txt;
  const z=document.getElementById('roZ');if(z)z.textContent=`Z ${fmt(estado.baseZ+n(q.z))}`;
}
function tipoNome(tipo){return tipo==='pilha'?'DCE':'Cava';}
function desenhoAtual(){return estado.desenhos.find(d=>d.id===estado.desenhoId)||null;}
function alvoAtual(){return desenhoAtual()?.tipo||document.getElementById('cava2Target')?.value||estado.alvo||'cava';}
function nomeCamada(d){return `${d.nome} — Bruta`;}
function novoId(){estado.seq++;return `cava2-${Date.now().toString(36)}-${estado.seq.toString(36)}`;}
function nomeUnico(base,ignorarId){
  base=String(base||'').trim()||'Desenho 2D';
  let nome=base,i=2;
  while(estado.desenhos.some(d=>d.id!==ignorarId&&d.nome.toLowerCase()===nome.toLowerCase()))nome=`${base} ${i++}`;
  return nome;
}
function proximoNome(tipo){
  const base=tipoNome(tipo);let i=1;
  while(estado.desenhos.some(d=>d.nome.toLowerCase()===`${base} ${i}`.toLowerCase()))i++;
  return `${base} ${i}`;
}
function novoRegistro(tipo,nome){
  tipo=tipo==='pilha'?'pilha':'cava';
  return {id:novoId(),nome:nomeUnico(nome||proximoNome(tipo)),tipo,engine:null,baseZ:0,
    crs:(typeof S!=='undefined'&&S.workCRS)||null,fonte:null,mdtId:estado.mdtTrabalhoId||null,cutMdt:false,variante:'bruta',resultadoCorte:null,
    criadoEm:new Date().toISOString()};
}

function criaInterface(){
  const host=workspace();if(!host||host.dataset.ready)return;
  host.dataset.ready='1';
  host.innerHTML=`<nav class="cava2-design-nav" aria-label="Cavas e DCEs">
    <select id="cava2NewDesign" aria-label="Criar cava ou DCE" title="Criar cava ou DCE" disabled>
      <option value="">＋ Nova</option><option value="cava">Nova cava</option><option value="pilha">Nova DCE</option>
    </select>
    <button id="cava2TabsPrev" type="button" aria-label="Rolar abas para a esquerda" title="Abas anteriores" disabled>‹</button>
    <div class="cava2-design-tabs" id="cava2DesignTabs" role="tablist" aria-label="Desenhos da cava"></div>
    <button id="cava2TabsNext" type="button" aria-label="Rolar abas para a direita" title="Próximas abas" disabled>›</button>
    <select id="cava2DesignList" aria-label="Ir para cava ou DCE" title="Todas as cavas e DCEs" disabled></select>
  </nav>
  <iframe id="cava2Frame" title="Área 2D — cava e DCE" sandbox="allow-scripts allow-same-origin allow-downloads"></iframe>`;
  estado.frame=document.getElementById('cava2Frame');
  const abas=document.getElementById('cava2DesignTabs'),novo=document.getElementById('cava2NewDesign'),listaAbas=document.getElementById('cava2DesignList');
  novo.onchange=()=>{const tipo=novo.value;novo.value='';if(tipo)criaNovoDesenho(tipo);};
  listaAbas.onchange=()=>{const opt=listaAbas.selectedOptions[0];if(opt?.dataset.designId)trocaDesenho(opt.dataset.designId,opt.dataset.variant);};
  for(const [id,sentido] of [['cava2TabsPrev',-1],['cava2TabsNext',1]])document.getElementById(id).onclick=()=>{
    abas.scrollBy({left:sentido*Math.max(80,abas.clientWidth*.8),behavior:'auto'});
  };
  abas.addEventListener('scroll',()=>atualizaNavegacaoAbas(false),{passive:true});
  abas.addEventListener('keydown',ev=>{
    const bs=[...abas.querySelectorAll('[role="tab"]')],i=bs.indexOf(ev.target);if(i<0)return;
    const dest=({ArrowLeft:bs[(i+bs.length-1)%bs.length],ArrowRight:bs[(i+1)%bs.length],Home:bs[0],End:bs.at(-1)})[ev.key];
    if(dest){ev.preventDefault();dest.click();abas.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});}
  });
  let resizeFrame=0;
  const ajustaAbas=()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>atualizaNavegacaoAbas(true));};
  if(typeof ResizeObserver==='function')new ResizeObserver(ajustaAbas).observe(abas);
  else window.addEventListener('resize',ajustaAbas);
  /* A barra de ponte com o mapa GIS foi removida: tipo, nome, cota-base, MDT,
     criação de cava/DCE, importação da seleção, sincronização manual e retorno
     ao mapa clássico continuam disponíveis pela API pública do módulo. */
  /* A árvore permanece sendo a fonte única de visibilidade. Qualquer troca
     feita enquanto o editor está aberto é refletida no canvas de referência. */
  const lista=document.getElementById('layerList');
  if(lista&&!lista.dataset.cava2Context){
    lista.dataset.cava2Context='1';
    const atualiza=()=>{if(S._view==='cava2')agendaContexto();};
    lista.addEventListener('click',atualiza,true);lista.addEventListener('change',atualiza,true);
  }
  estado.frame.addEventListener('load',()=>{
    estado.ready=true;aplicaTemaNoMotor();aplicaPainel();
    try{estado.frame.contentWindow.addEventListener('cava2:changed',()=>{
      if(!estado.restaurando)agendarSincronizacao();
    });}catch(e){console.warn('Área 2D: evento de alteração',e);}
    try{estado.frame.contentWindow.addEventListener('cava2:cleared',()=>{
      if(!estado.restaurando)limpaCamadasDoDesenho();
    });}catch(e){console.warn('Área 2D: limpeza das camadas',e);}
    try{estado.frame.contentWindow.addEventListener('cava2:cursor',atualizaCursorGlobal);}catch(e){}
    try{estado.frame.contentWindow.addEventListener('cava2:drawing-blocked',exigeMdt);}catch(e){}
    try{estado.frame.contentWindow.addEventListener('cava2:tool-changed',e=>{
      const mapa={selpoly:'selpoly',editar:'vertex',rampa:'point',secao:'line',cava:'poly',pilha:'poly'};
      marcaFerramentaGlobalCava(mapa[e.detail?.tool]||null);
    });}catch(e){}
    try{estado.frame.contentWindow.addEventListener('cava2:selection-changed',e=>{
      const total=+e.detail?.count||0;status(total?`${total} string(s) selecionada(s) por polígono.`:'Nenhuma string encontrada dentro do polígono.',!total);
    });}catch(e){}
    try{estado.frame.contentWindow.addEventListener('cava2:panel-toggle',()=>{
      estado.painelFechado=!estado.painelFechado;aplicaPainel();salvaRegistroLocal();
    });}catch(e){}
    if(estado.projetoPendente!==undefined)aplicaEstadoProjeto(estado.projetoPendente);
    else{
      const local=leRegistroLocal();
      if(Array.isArray(local?.designs))aplicaEstadoProjeto(local);
      else{
        const legado=leEstadoMotor();
        if(legado?.bases?.cava||legado?.bases?.pilha){
          aplicaEstadoProjeto({version:1,engine:legado,baseZ:0,crs:S.workCRS,fonte:null});
        }else{
          if(!estado.desenhos.length){const d=novoRegistro('cava');estado.desenhos.push(d);estado.desenhoId=d.id;}
          aplicaDesenho(desenhoAtual(),false);renderAbas();salvaRegistroLocal();
        }
      }
    }
    populaMdts();configuraMdtNoMotor();
    if(rasterDoDesenho(desenhoAtual()))status('MDT de trabalho pronto · a camada Interseção será atualizada automaticamente.');
    else status('Escolha primeiro o MDT de trabalho para liberar o desenho da cava/DCE.',true);
  },{once:true});
  estado.frame.srcdoc=fontePreparada();
  ligaFerramentasGlobais();
}

/* A barra CAD continua visível na Área 2D, mas controla o canvas encapsulado. */
function comandoGlobalDaCava(tool){
  return ({select:'select',selpoly:'selpoly',vertex:'vertex',point:'point',line:'line',poly:'poly',
    del:'clear',measure:'measure',info:'info'})[tool]||null;
}
function marcaFerramentaGlobalCava(tool){
  const box=document.getElementById('mapTools');if(!box)return;
  box.querySelectorAll('.mtool[data-tool]').forEach(x=>x.classList.toggle('on',x.dataset.tool===tool));
  const limpar=document.getElementById('btnCavaClear');if(limpar)limpar.classList.toggle('on',tool==='clear');
}
function atualizaBarraGlobalCava(ativa){
  const box=document.getElementById('mapTools');if(!box)return;
  const titulos={select:'Selecionar string',selpoly:'Selecionar strings por polígono',vertex:'Editar vértices',
    point:'Definir início da rampa',line:'Desenhar seção A–A′',poly:'Desenhar limite da cava/DCE',
    del:'Limpar tudo da cava/DCE',measure:'Seção A–A′',info:'Selecionar e inspecionar string'},
    cores={select:'#087bb5',selpoly:'#007f7b',vertex:'#7447c6',point:'#c61f70',line:'#00798c',
      poly:'#bd5c00',del:'#c92d35',measure:'#087c51',info:'#3b61b5'};
  for(const b of box.querySelectorAll('.mtool[data-tool]')){
    if(!b.dataset.cava2Title)b.dataset.cava2Title=b.title||'';
    if(b.dataset.cava2Color==null)b.dataset.cava2Color=b.style.color||'';
    if(titulos[b.dataset.tool])b.title=ativa?titulos[b.dataset.tool]:b.dataset.cava2Title;
    if(cores[b.dataset.tool])b.style.color=ativa?cores[b.dataset.tool]:b.dataset.cava2Color;
  }
  let limpar=document.getElementById('btnCavaClear');
  if(!limpar){
    limpar=document.createElement('button');limpar.type='button';limpar.id='btnCavaClear';limpar.className='mtool';
    limpar.title='Limpar tudo da cava/DCE';limpar.setAttribute('aria-label',limpar.title);limpar.style.color='#c92d35';
    limpar.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3m-8 0 1 14h8l1-14M10 11v6m4-6v6"/><path d="m18 3 .7 1.7L20.5 5l-1.8.7L18 7.5l-.7-1.8L15.5 5l1.8-.3Z" class="soft"/></svg>';
    const base=document.getElementById('btnBaseToggle');box.insertBefore(limpar,base||null);
  }
  limpar.hidden=!ativa;limpar.style.display=ativa?'flex':'none';
  if(!ativa)marcaFerramentaGlobalCava(null);
}
function ligaFerramentasGlobais(){
  const box=document.getElementById('mapTools');if(!box||box.dataset.cava2Bridge)return;
  box.dataset.cava2Bridge='1';
  box.addEventListener('click',e=>{
    if(S._view!=='cava2')return;
    const b=e.target.closest('.mtool');if(!b)return;
    const dedicado=b.id==='btnCavaClear',tool=dedicado?'clear':b.dataset.tool,cmd=comandoGlobalDaCava(tool);
    if(!cmd)return;
    if(tool==='poly'){
      e.preventDefault();e.stopImmediatePropagation();
      if(iniciaDesenho(alvoAtual())!==false)marcaFerramentaGlobalCava(tool);return;
    }
    if(desenhoAtual()?.variante==='recortada'){
      e.preventDefault();e.stopImmediatePropagation();status('Abra a aba Bruta para editar a cava.');return;
    }
    if(['point','line','poly'].includes(tool)&&!rasterDoDesenho(desenhoAtual())){
      e.preventDefault();e.stopImmediatePropagation();exigeMdt();return;
    }
    const A=api();if(!A||typeof A.activateExternalTool!=='function')return;
    e.preventDefault();e.stopImmediatePropagation();
    if(A.activateExternalTool(cmd,alvoAtual())!==false)marcaFerramentaGlobalCava(tool);
  },true);
}

function abre(){
  criaInterface();const host=workspace();if(host)host.classList.add('on');
  requestAnimationFrame(()=>atualizaNavegacaoAbas(true));
  aplicaTemaNoMotor();aplicaPainel();atualizaBarraGlobalCava(true);
  if(estado.ready)atualizaContexto();
}
function fecha(){const host=workspace();if(host)host.classList.remove('on');atualizaBarraGlobalCava(false);}
function aplicaTemaNoMotor(){
  const D=doc2D();if(!D)return false;
  const cor=getComputedStyle(document.documentElement).getPropertyValue('--map-bg').trim();
  const branco=document.body.classList.contains('light')||/^#(?:fff|ffffff)$/i.test(cor)||
    /^rgba?\(\s*255\s*,\s*255\s*,\s*255/i.test(cor);
  D.body.classList.toggle('ccmgis-claro',branco);return branco;
}
/* A faixa Mineração e a aba 2D são duas entradas para a MESMA instância.
   Esta função apenas reapresenta o workspace e a árvore global; nunca cria
   desenho, iframe ou camada adicional. */
function abreModoCava(){
  abre();renderAbas();atualizaContexto();
  if(typeof refreshUI==='function')refreshUI();
  return desenhoAtual();
}
function aplicaPainel(){
  const D=doc2D(),b=D&&D.getElementById('ccmgisPainelCorner');
  if(D)D.body.classList.toggle('ccmgis-painel-fechado',estado.painelFechado);
  if(b){
    b.textContent=estado.painelFechado?'›':'‹';
    b.disabled=false;b.title=estado.painelFechado?'Abrir os parâmetros da cava':'Encolher os parâmetros da cava';
    b.setAttribute('aria-label',b.title);b.setAttribute('aria-expanded',String(!estado.painelFechado));
  }
}
function aplicaTipoNoMotor(tipo){
  const D=doc2D();if(!D)return;
  D.body.dataset.ccmgisTarget=tipo;
  const tc=D.getElementById('t_cava'),tp=D.getElementById('t_pilha');
  if(tc)tc.hidden=false;if(tp)tp.hidden=false;
}
function caminhosDaGeometria(g,out){
  out=out||[];if(!Array.isArray(g)||!g.length)return out;
  if(typeof g[0]==='number'){out.push([g]);return out;}
  if(typeof g[0]?.[0]==='number'){out.push(g);return out;}
  g.forEach(x=>caminhosDaGeometria(x,out));return out;
}
function pontoNoTrabalho(L,p){
  let x=n(p?.[0]),y=n(p?.[1]);
  if(L.crs&&S.workCRS&&L.crs!==S.workCRS&&typeof toWGS==='function'&&typeof fromWGS==='function'){
    try{const ll=toWGS(L.crs,x,y),q=fromWGS(S.workCRS,ll[0],ll[1]);x=q[0];y=q[1];}catch(e){}
  }
  return {x,y};
}
/* Douglas–Peucker progressivo: em vez de saltar um vértice a cada N, divide
   primeiro o trecho que possui o maior erro geométrico. Assim, quinas,
   reentrâncias, anéis e ilhas permanecem reconhecíveis mesmo em camadas
   oficiais muito densas (por exemplo, os limites da ANM). */
function reduzCaminhoPreservandoForma(P,alvo,fechado){
  const N=P?.length||0;if(N<=2||N<=alvo)return (P||[]).slice();
  alvo=Math.max(fechado?4:2,Math.min(N,Math.floor(alvo)||2));
  if(N<=alvo)return P.slice();
  const igual=(a,b)=>a&&b&&Math.abs(a[0]-b[0])<1e-12&&Math.abs(a[1]-b[1])<1e-12,
    anel=!!fechado||igual(P[0],P[N-1]),Q=anel&&igual(P[0],P[N-1])?P.slice(0,-1):P.slice();
  if(Q.length<=alvo)return Q;
  let R=Q,virtual=false,selecionados,contagem;
  if(anel){
    /* Começar num extremo estável e partir o anel pelo vértice oposto evita
       a corda artificial entre o primeiro e o último ponto de um polígono. */
    let a0=0;for(let i=1;i<Q.length;i++)if(Q[i][0]<Q[a0][0]||
      (Q[i][0]===Q[a0][0]&&Q[i][1]<Q[a0][1]))a0=i;
    R=Q.slice(a0).concat(Q.slice(0,a0));
    let op=1,dm=-1;for(let i=1;i<R.length;i++){
      const dx=R[i][0]-R[0][0],dy=R[i][1]-R[0][1],d=dx*dx+dy*dy;
      if(d>dm){dm=d;op=i;}
    }
    R=R.concat([R[0]]);virtual=true;selecionados=new Set([0,op,R.length-1]);contagem=2;
  }else{selecionados=new Set([0,R.length-1]);contagem=2;}
  const heap=[],distSeg=(q,a,b)=>{
    const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy,
      t=den?Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dy)/den)):0,
      ex=q[0]-(a[0]+dx*t),ey=q[1]-(a[1]+dy*t);return ex*ex+ey*ey;
  },segmento=(a,b)=>{
    if(b<=a+1)return null;let idx=-1,erro=-1;
    for(let i=a+1;i<b;i++){const e=distSeg(R[i],R[a],R[b]);if(e>erro){erro=e;idx=i;}}
    return idx<0?null:{a,b,idx,erro};
  },sobe=s=>{if(!s)return;heap.push(s);let i=heap.length-1;
    while(i){const p=(i-1)>>1;if(heap[p].erro>=heap[i].erro)break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p;}
  },desce=()=>{if(!heap.length)return null;const top=heap[0],fim=heap.pop();if(heap.length){heap[0]=fim;let i=0;
    for(;;){let m=i,l=i*2+1,r=l+1;if(l<heap.length&&heap[l].erro>heap[m].erro)m=l;
      if(r<heap.length&&heap[r].erro>heap[m].erro)m=r;if(m===i)break;
      [heap[i],heap[m]]=[heap[m],heap[i]];i=m;}}return top;};
  const bases=[...selecionados].sort((a,b)=>a-b);for(let i=1;i<bases.length;i++)sobe(segmento(bases[i-1],bases[i]));
  while(contagem<alvo&&heap.length){const s=desce();selecionados.add(s.idx);contagem++;
    sobe(segmento(s.a,s.idx));sobe(segmento(s.idx,s.b));
  }
  return [...selecionados].filter(i=>!virtual||i<R.length-1).sort((a,b)=>a-b).map(i=>R[i]);
}
function georreferenciaMercatorDaImagem(llBounds,divisoes){
  try{
    const sw=Array.isArray(llBounds)?llBounds[0]:null,ne=Array.isArray(llBounds)?llBounds[1]:null;
    if(!sw||!ne)return null;
    const oeste=+sw[1],sul=+sw[0],leste=+ne[1],norte=+ne[0];
    if(![oeste,sul,leste,norte].every(Number.isFinite)||leste<=oeste||norte<=sul)return null;
    const a=reproj('EPSG:4326','EPSG:3857',oeste,sul),z=reproj('EPSG:4326','EPSG:3857',leste,norte),
      cols=Math.max(1,Math.min(16,Math.round(+divisoes||8))),rows=cols,points=[];
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(let r=0;r<=rows;r++)for(let c=0;c<=cols;c++){
      const X=a[0]+(z[0]-a[0])*c/cols,Y=z[1]+(a[1]-z[1])*r/rows,
        q=S.workCRS==='EPSG:3857'?[X,Y]:reproj('EPSG:3857',S.workCRS,X,Y),x=+q[0],y=+q[1];
      if(!Number.isFinite(x)||!Number.isFinite(y))return null;
      points.push({x,y});if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
    }
    return {bounds:[x0,y0,x1,y1],mesh:{cols,rows,points}};
  }catch(e){return null;}
}
function georreferenciaDoOverlay(ov){
  try{
    const b=ov&&ov.getBounds&&ov.getBounds();if(!b)return null;
    return georreferenciaMercatorDaImagem([[b.getSouth(),b.getWest()],[b.getNorth(),b.getEast()]],8);
  }catch(e){return null;}
}
function limitesDoOverlay(ov){const g=georreferenciaDoOverlay(ov);return g&&g.bounds;}
function contextoDasCamadas(){
  const atual=desenhoAtual(),temDesign=!!designRuntime(atual),out=[],candidatos=[];
  const limite=240000,camadas=[...(S.layers||[])].sort((a,b)=>(b._cava2Managed?1:0)-(a._cava2Managed?1:0));
  for(const L of camadas){
    if(L.visible===false||!['line','polygon','point'].includes(L.gtype))continue;
    const dono=L._cava2DesignId||L._cava2CutOf||L._cava2CutFillOf||L._cava2CutSnapshotOf;
    if(dono){
      if(dono!==atual?.id)continue;
      if(atual.variante==='recortada'){
        if(L._cava2CutSnapshotId!==atual.resultadoCorte?.id)continue;
      }else if(L._cava2CutSnapshotOf||L._cava2CutFillOf)continue;
    }
    /* Quando a aba ativa tem receita paramétrica, sua versão editável será
       desenhada pelo motor. Sem receita, a camada continua como referência
       para nunca abrir um canvas aparentemente vazio. */
    if(temDesign&&L._cava2DesignId===atual?.id)continue;
    for(const f of (L.features||[])){
      if(!f?.geom||(typeof featureVisible==='function'&&!featureVisible(L,f)))continue;
      let st={stroke:L.color||'#687786',color:L.color||'#687786',weight:L.weight||1,fill:L.fill||0,dash:''};
      try{if(typeof featureStyle==='function')st={...st,...featureStyle(L,f)};}catch(e){}
      for(const P0 of caminhosDaGeometria(f.geom))if(P0?.length)candidatos.push({L,f,P0,st,
        closed:L.gtype==='polygon',point:L.gtype==='point'});
    }
  }
  /* Todas as feições recebem amostragem proporcional dentro do orçamento.
     O redutor preserva quinas em vez de pegar “um vértice a cada N”, que
     deformava limites oficiais. */
  const baseTotal=candidatos.reduce((s,c)=>s+Math.min(c.P0.length,4000),0),
    fator=baseTotal>limite?limite/baseTotal:1;
  const gruposPoligonos=new Map();
  for(const c of candidatos){
    const minimo=c.point?1:(c.closed?4:2),alvo=Math.max(minimo,Math.floor(Math.min(c.P0.length,4000)*fator)),
      reduzido=reduzCaminhoPreservandoForma(c.P0,alvo,c.closed),P=reduzido.map(p=>pontoNoTrabalho(c.L,p));
    if(!P.length)continue;
    if(c.closed&&gruposPoligonos.has(c.f)){gruposPoligonos.get(c.f).paths.push(P);continue;}
    const item={paths:[P],foreground:!!c.L._cava2CutOf||c.L._cava2SnapshotRole==='line',color:c.st.stroke||c.st.color||c.L.color||'#687786',
      fillColor:c.st.color||c.st.stroke||c.L.color||'#687786',
      weight:Number.isFinite(+c.st.weight)?+c.st.weight:1,dash:c.st.dash||'',opacity:Number.isFinite(+c.st.opacity)?+c.st.opacity:1,
      /* Mesma regra do Mapa 2D: hatch=none significa contorno sem qualquer
         preenchimento, mesmo quando um valor antigo de fill ainda existe. */
      fill:c.closed&&c.st.hatch!=='none'?(+c.st.fill||0):0,
      fillOpacity:c.closed&&c.st.hatch!=='none'?(+c.st.fill||0):0,
      hatch:c.closed?(c.st.hatch||'solid'):'none',hatchScale:n(c.st.hatchScale,1),
      closed:c.closed,point:c.point};out.push(item);if(c.closed)gruposPoligonos.set(c.f,item);
  }
  /* As superfícies e a ortofoto pertencem à mesma árvore visual do 2D.
     Reaproveitar o PNG já renderizado evita recalcular MDTs grandes e mantém
     exatamente a simbologia e a opacidade escolhidas no projeto. */
  for(const r of (S.rasters||[])){
    const geo=r.visible!==false&&r._url?georreferenciaDoOverlay(r.overlay):null;
    if(geo)out.push({imageUrl:r._url,bounds:geo.bounds,mesh:geo.mesh,
      opacity:n(r.style?.opacity,.8),name:r.name||'Raster'});
  }
  const I=S.img;
  if(I?.visible!==false&&I?.url){
    const op=Math.max(0,Math.min(1,n(I.overlay?.options?.opacity,n(I.opacity,1))));
    /* I.url é a prévia fixa integral. Nunca usamos os bounds atuais do overlay:
       durante o modo HD ele pode conter apenas a janela visível, o que antes
       esticava a ortofoto inteira para dentro dessa janela. */
    const geo=I._warpWM&&I._llbounds?georreferenciaMercatorDaImagem(I._llbounds,8):
      (Array.isArray(I.b)&&I.b.length===4?{bounds:I.b.slice(),mesh:null}:georreferenciaDoOverlay(I.overlay));
    if(geo)out.push({imageUrl:I.url,bounds:geo.bounds,mesh:geo.mesh,opacity:op,name:I.name||'Ortofoto'});
  }
  return out;
}
function visibilidadeDoDesenho(d){
  if(!d)return {on:false,crista:false,pe:false,rampa:false};
  if(d.variante==='recortada')return {on:false,crista:false,pe:false,rampa:false};
  const bruta=camadaDoDesenho(d.id),corte=camadaCorteDoDesenho(d.id),
    L=d.cutMdt&&corte?corte:bruta;
  if(d.cutMdt&&corte?._cava2CutFinalized)return {on:false,crista:false,pe:false,rampa:false};
  if(!L)return {on:true,crista:true,pe:true,rampa:true};
  const cats=L.sym?.mode==='cat'?(L.sym.cats||[]):[],vis=nome=>{
    const c=cats.find(q=>String(q.value)===nome);return !c||c.vis!==false;
  };
  return {on:L.visible!==false,crista:vis('Crista'),pe:vis('Pé'),rampa:vis('Rampa')};
}
function aplicaVisibilidadeDesenho(redraw=true){
  const A=api(),d=desenhoAtual();
  if(!A||!d||typeof A.setObjectVisibility!=='function')return false;
  A.setObjectVisibility(d.tipo,visibilidadeDoDesenho(d),redraw);return true;
}
function estilosDoDesenho(d){
  const bruta=camadaDoDesenho(d?.id),corte=camadaCorteDoDesenho(d?.id),
    L=d?.cutMdt&&corte?corte:bruta;
  if(!L)return null;
  const s=L.sym||{},cats=s.mode==='cat'?(s.cats||[]):[],item=nome=>{
    const c=cats.find(q=>String(q.value)===nome)||{};
    return {color:c.stroke||c.color||s.stroke||s.color||L.color||'#111111',
      weight:n(c.weight??s.weight??L.weight,1.5),dash:c.dash??s.dash??'',
      opacity:Math.max(0,Math.min(1,n(c.opacity??s.opacity,1))),
      fill:Math.max(0,Math.min(1,n(c.fill??s.fill,0)))};
  };
  return {crista:item('Crista'),pe:item('Pé'),rampa:item('Rampa'),intersecao:item('Interseção')};
}
function aplicaEstiloDesenho(redraw=true){
  const A=api(),d=desenhoAtual(),e=d&&estilosDoDesenho(d);
  if(!A||!d||!e||typeof A.setObjectStyle!=='function')return false;
  A.setObjectStyle(d.tipo,e,redraw);return true;
}
/* Publicar várias camadas dispara uma notificação de estilo por camada.
   A reconstrução continua exata, mas ocorre só uma vez no próximo frame. */
function agendaContexto(){
  if(!api()||estado.contextFrame)return;
  estado.contextFrame=requestAnimationFrame(()=>{estado.contextFrame=0;atualizaContexto();});
}
function atualizaContexto(){
  if(estado.contextFrame){cancelAnimationFrame(estado.contextFrame);estado.contextFrame=0;}
  const A=api();if(!A||typeof A.setContextLayers!=='function')return false;
  aplicaVarianteCava(desenhoAtual());
  A.setContextLayers(contextoDasCamadas(),false);aplicaVisibilidadeDesenho(false);aplicaEstiloDesenho(false);
  const d=desenhoAtual();A.setVolumeSummary?.(d?{name:d.nome,type:d.tipo,swelling:d.empolamento??null,
    cut:d.variante==='recortada'?d.resultadoCorte?.volumes:null}:null);A.redesenha();return true;
}
function atualizaNavegacaoAbas(revelaAtiva){
  const box=document.getElementById('cava2DesignTabs');if(!box||!box.clientWidth)return;
  const ativa=box.querySelector('.on');
  if(revelaAtiva&&ativa){
    const b=box.getBoundingClientRect(),a=ativa.getBoundingClientRect();
    if(a.left<b.left)box.scrollLeft-=b.left-a.left;
    else if(a.right>b.right)box.scrollLeft+=a.right-b.right;
  }
  const prev=document.getElementById('cava2TabsPrev'),next=document.getElementById('cava2TabsNext');
  if(prev)prev.disabled=box.scrollLeft<=1;
  if(next)next.disabled=box.scrollLeft+box.clientWidth>=box.scrollWidth-1;
}
function renderAbas(){
  const box=document.getElementById('cava2DesignTabs');if(!box)return;
  box.innerHTML='';
  const lista=document.getElementById('cava2DesignList'),novo=document.getElementById('cava2NewDesign');
  if(novo)novo.disabled=!estado.ready;
  if(lista){lista.replaceChildren(new Option('▾',''));lista.disabled=!estado.desenhos.length;}
  estado.desenhos.forEach(d=>{
   for(const variante of d.somenteRecortada?['recortada']:['bruta',...(d.resultadoCorte?['recortada']:[])]){
    const b=document.createElement('button');b.type='button';b.className='cava2-design-tab';
    b.classList.toggle('on',d.id===estado.desenhoId&&(d.variante||'bruta')===variante);b.dataset.designId=d.id;b.dataset.variant=variante;
    const versao=variante==='bruta'?'Bruta':'Recortada';
    b.innerHTML=`<span class="cava2-tab-kind">${esc(versao)}</span><span class="cava2-tab-name">${esc(d.nome)}</span>`;
    b.title=`${d.nome} — ${versao}`;b.setAttribute('aria-label',b.title);
    b.setAttribute('role','tab');b.setAttribute('aria-selected',String(b.classList.contains('on')));b.tabIndex=b.classList.contains('on')?0:-1;
    b.onclick=()=>trocaDesenho(d.id,variante);box.appendChild(b);
    if(lista){const o=new Option(b.title,`${d.id}/${variante}`);o.dataset.designId=d.id;o.dataset.variant=variante;lista.add(o);}
   }
  });
  if(!estado.desenhos.length){const vazio=document.createElement('span');vazio.className='cava2-tabs-empty';vazio.textContent='Crie uma cava ou DCE em ＋ Nova';box.appendChild(vazio);}
  requestAnimationFrame(()=>atualizaNavegacaoAbas(true));
}
function atualizaCampos(d){
  if(!d)return;
  estado.alvo=d.tipo;estado.baseZ=n(d.baseZ);estado.crs=d.crs||S.workCRS;estado.fonte=clone(d.fonte)||null;
  const t=document.getElementById('cava2Target'),nm=document.getElementById('cava2Name'),z=document.getElementById('cava2BaseZ');
  if(t)t.value=d.tipo;if(nm)nm.value=d.nome;if(z)z.value=String(estado.baseZ);
  const swelling=doc2D()?.getElementById('ccmgisEmpolamento');if(swelling)swelling.value=d.empolamento??'';
  populaMdts(d);
  aplicaTipoNoMotor(d.tipo);
}
function criaNovoDesenho(tipo){
  if(!estado.ready||estado.busyCut)return null;
  salvaAtual(true);
  const d=novoRegistro(tipo);estado.desenhos.push(d);estado.desenhoId=d.id;
  aplicaDesenho(d,false);renderAbas();salvaRegistroLocal();
  status(rasterDoDesenho(d)?`${tipoNome(d.tipo)} “${d.nome}” criada · desenhe o limite; a Interseção será dinâmica.`:
    `${tipoNome(d.tipo)} “${d.nome}” criada · escolha primeiro o MDT de trabalho.`,!rasterDoDesenho(d));
  window.GeoMineWorkspaceResume?.request();return d;
}
function iniciaDesenho(tipo){
  if(!estado.ready||estado.busyCut)return false;
  tipo=tipo==='pilha'?'pilha':'cava';
  const d=desenhoAtual(),A=api(),temBase=Object.values(A?.objs||{}).some(o=>o?.base?.length);
  if(!d||d.somenteRecortada||temBase||d.tipo!==tipo)criaNovoDesenho(tipo);
  if(!rasterDoDesenho(desenhoAtual())){exigeMdt();return false;}
  return api()?.beginDrawing?.(tipo);
}
function trocaDesenho(id,variante){
  if(estado.busyCut){status('Aguarde o recorte terminar para trocar de aba.');return false;}
  const d=estado.desenhos.find(x=>x.id===id);if(!d)return;
  if(d.somenteRecortada)variante='recortada';
  if(id===estado.desenhoId&&(!variante||variante===d.variante))return;
  salvaAtual(true);
  if(variante)d.variante=variante==='recortada'&&resultadoCavaDisponivel(d)?'recortada':'bruta';
  estado.desenhoId=id;aplicaDesenho(d,false);renderAbas();salvaRegistroLocal();
  if(typeof refreshUI==='function')refreshUI();
  status(`${tipoNome(d.tipo)} “${d.nome}” ativa.`);
}
function renomeiaAtual(nome){
  const d=desenhoAtual();if(!d)return;
  d.nome=nomeUnico(nome||proximoNome(d.tipo),d.id);
  const e=document.getElementById('cava2Name');if(e)e.value=d.nome;
  const L=camadaDoDesenho(d.id);if(L){L.name=nomeCamada(d);if(typeof refreshUI==='function')refreshUI();}
  const C=camadaCorteDoDesenho(d.id);if(C)C.name=nomeCorteMdt(d,rasterDoDesenho(d));
  renderAbas();salvaRegistroLocal();status(`Desenho renomeado para “${d.nome}”.`);
}
function mudaTipoAtual(tipo){
  const d=desenhoAtual();if(!d)return;tipo=tipo==='pilha'?'pilha':'cava';
  salvaAtual(false);d.tipo=tipo;estado.alvo=tipo;aplicaTipoNoMotor(tipo);
  if(/^Cava \d+$|^DCE \d+$/i.test(d.nome))d.nome=nomeUnico(proximoNome(tipo),d.id);
  atualizaCampos(d);renderAbas();sincronizaCamadas(false);salvaRegistroLocal();
}

function feicaoSelecionada(){
  const sf=S&&S.selFeat,L=sf&&sf.layer;
  if(L&&Number.isInteger(sf.idx)&&L.features?.[sf.idx])return {L,f:L.features[sf.idx]};
  const A=typeof activeLayer==='function'?activeLayer():null;
  if(A&&A.features?.length===1)return {L:A,f:A.features[0]};
  return null;
}
function anelDaFeicao(f){
  if(!f)return null;let g=f.geom;
  if(f.multi&&Array.isArray(g?.[0]?.[0]))g=g[0];
  if(!Array.isArray(g)||g.length<3)return null;
  const out=g.map(p=>({x:n(p[0]),y:n(p[1])}));
  if(out.length>3&&Math.hypot(out[0].x-out.at(-1).x,out[0].y-out.at(-1).y)<1e-8)out.pop();
  return out.length>=3?out:null;
}
function zDaFeicao(f){
  const z=Array.isArray(f?.zg)&&Array.isArray(f.zg[0])?f.zg[0][0]:Array.isArray(f?.zg)?f.zg[0]:f?.zg;
  return Number.isFinite(+z)?+z:null;
}
function importaSelecionada(){
  if(!rasterDoDesenho(desenhoAtual()))return exigeMdt();
  const it=feicaoSelecionada();
  if(!it){status('Selecione uma linha ou polígono fechado no mapa GIS clássico.',true);return;}
  const P=anelDaFeicao(it.f);if(!P){status('A feição selecionada precisa ter pelo menos três vértices.',true);return;}
  const A=api();if(!A){status('Aguarde a inicialização da área 2D.',true);return;}
  const d=desenhoAtual(),alvo=d?.tipo||alvoAtual(),z=zDaFeicao(it.f);
  if(z!=null){estado.baseZ=z;if(d)d.baseZ=z;const el=document.getElementById('cava2BaseZ');if(el)el.value=String(z);}
  estado.crs=it.L.crs||S.workCRS;estado.fonte={layerId:it.L.id,featureIndex:it.L.features.indexOf(it.f)};
  if(d){d.crs=estado.crs;d.fonte=clone(estado.fonte);}
  if(typeof A.limpaCadeia==='function')A.limpaCadeia();
  A.objs[alvo].base=P;A.objs[alvo].anc=null;A.objs[alvo].bermas={};A.objs[alvo].prm=null;A.objs[alvo].z0=0;A.blocoAtivo=alvo;A.regen();
  status(`${tipoNome(alvo)} importada de “${it.L.name}” · camada 3D atualizada.`);
}

function classe(tp){return String(tp||'').toLowerCase()==='pe'?'Pé':'Crista';}
function limpaPontos(P){
  return (P||[]).map(p=>[n(p.x,p[0]),n(p.y,p[1])]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]));
}
function fechaAnel(g){
  if(g.length>2&&Math.hypot(g[0][0]-g.at(-1)[0],g[0][1]-g.at(-1)[1])>1e-8)g.push(g[0].slice());
  return g;
}
function feicoesDoDesign(design,baseZ,meta){
  if(!design)return [];
  meta=meta||{};const out=[];let fid=1;
  const A=api(),rampPolys=(design.corredores||[]).map(c=>c.poly).filter(P=>Array.isArray(P)&&P.length>=3);
  (design.aneis||[]).forEach((a,i)=>{
    const recorte=A&&typeof A.recortaLinhaForaRampas==='function'
      ?A.recortaLinhaForaRampas(a.P,rampPolys,a.cortesRampa):{partes:[a.P],cortado:false};
    (a.partesEntrada||recorte.partes||[]).forEach((parte,j)=>{
      let geom=limpaPontos(parte);
      if(!recorte.cortado)geom=fechaAnel(geom);
      if(geom.length<(recorte.cortado?2:4))return;
      const z=n(baseZ)+n(a.z),elemento=classe(a.tp),ordem=(i+1)*100+j;
      out.push({geom,multi:false,zg:geom.map(()=>z),props:{FID:fid++,DESENHO:meta.nome||'Desenho 2D',
        DESIGN_ID:meta.id||'',PROJETO:tipoNome(meta.tipo),ELEMENTO:elemento,COTA:z,ORDEM:ordem,
        BANCO:Math.floor(i/2)+1,ORIGEM:'Área 2D · Cava2'}});
    });
  });
  (design.corredores||[]).forEach((c,i)=>{
    [['borda1','Borda esquerda'],['centro','Eixo'],['borda2','Borda direita']].forEach(([chave,papel],j)=>{
      const P=c[chave]||[],geom=limpaPontos(P);if(geom.length<2)return;
      const zg=P.map(p=>n(baseZ)+n(p.z));
      out.push({geom,multi:false,zg,props:{FID:fid++,DESENHO:meta.nome||'Desenho 2D',DESIGN_ID:meta.id||'',
        PROJETO:tipoNome(meta.tipo),ELEMENTO:'Rampa',COTA:zg[0],ORDEM:i*3+j+1,BANCO:i+1,
        ORIGEM:`Área 2D · Cava2 · ${papel}`}});
    });
  });
  return out;
}
function mdtValido(R){
  const g=R?.d;
  return !!(g&&g.z&&Number.isFinite(+g.nc)&&+g.nc>1&&Number.isFinite(+g.nr)&&+g.nr>1&&
    Number.isFinite(+g.cs)&&+g.cs>0);
}
function listaMdtsValidos(){return typeof S==='undefined'?[]:(S.rasters||[]).filter(mdtValido);}
function limitesMdt(R){
  if(!R)return null;
  try{
    const st=R._st||(typeof rasterStats==='function'?(R._st=rasterStats(R.d)):null),mn=+st?.mn,mx=+st?.mx;
    if(Number.isFinite(mn)&&Number.isFinite(mx)&&mx>=mn)return {min:mn,max:mx};
  }catch(e){}
  const z=R.d?.z||[];let min=Infinity,max=-Infinity;
  const le=v=>{v=+v;if(Number.isFinite(v)&&Math.abs(v)<1e30){if(v<min)min=v;if(v>max)max=v;}};
  for(const linha of z){if(Array.isArray(linha)||ArrayBuffer.isView(linha))for(const v of linha)le(v);else le(linha);}
  return Number.isFinite(min)&&Number.isFinite(max)&&max>=min?{min,max}:null;
}
function formataCota(v){
  if(!Number.isFinite(+v))return '—';const a=Math.abs(+v-Math.round(+v))<1e-7?0:1;
  return (+v).toLocaleString('pt-BR',{minimumFractionDigits:a,maximumFractionDigits:a});
}
function cotaRedonda5(v,sentido){
  v=+v;if(!Number.isFinite(v))return NaN;
  let piso,teto;
  if(typeof cavaArredondaCota==='function'){
    piso=cavaArredondaCota(v,5,'min');teto=cavaArredondaCota(v,5,'max');
  }else{piso=Math.floor((v+1e-8)/5)*5;teto=Math.ceil((v-1e-8)/5)*5;}
  if(sentido==='baixo')return piso;if(sentido==='cima')return teto;
  return Math.abs(v-piso)<=Math.abs(teto-v)?piso:teto;
}
function limitesCotaRedonda(R){
  const bruto=limitesMdt(R);if(!bruto)return null;
  const min=cotaRedonda5(bruto.min,'cima'),max=cotaRedonda5(bruto.max,'baixo');
  if(Number.isFinite(min)&&Number.isFinite(max)&&max>=min)return {min,max,bruto};
  const unico=cotaRedonda5((bruto.min+bruto.max)/2);return {min:unico,max:unico,bruto};
}
function normalizaCotaDesenho(d,R){
  const lim=limitesCotaRedonda(R);if(!d||!lim)return null;
  let z=+d.baseZ;
  if(!Number.isFinite(z)||z<lim.min||z>lim.max)z=d.tipo==='pilha'?lim.min:lim.max;
  z=cotaRedonda5(Math.max(lim.min,Math.min(lim.max,z)));
  z=Math.max(lim.min,Math.min(lim.max,z));d.baseZ=z;estado.baseZ=z;
  return {...lim,value:z};
}
function configuraCotaTrabalho(d,R){
  const D=doc2D(),box=D&&D.getElementById('ccmgisCotaCommand'),range=D&&D.getElementById('ccmgis_cota_trabalho'),
    minEl=D&&D.getElementById('ccmgis_cota_min'),maxEl=D&&D.getElementById('ccmgis_cota_max'),out=D&&D.getElementById('ccmgis_cota_valor');
  if(!box||!range||!minEl||!maxEl||!out)return false;
  d=d||desenhoAtual();R=R||rasterDoDesenho(d);const c=normalizaCotaDesenho(d,R);
  box.hidden=!c;range.disabled=!c;
  if(!c){minEl.textContent=maxEl.textContent=out.textContent='—';return false;}
  const passo=5;
  range.min=String(c.min);range.max=String(c.max);range.step=String(passo);range.value=String(c.value);
  minEl.textContent=formataCota(c.min);maxEl.textContent=formataCota(c.max);out.value=out.textContent=formataCota(c.value);
  box.title=`Cota de trabalho · mínima ${formataCota(c.min)} m · máxima ${formataCota(c.max)} m`;
  const externo=document.getElementById('cava2BaseZ');if(externo)externo.value=String(c.value);return true;
}
function sincronizaSuperficieTrabalhoNoMotor(d,R,redraw=true,forcar=false){
  const A=api();if(!A||typeof A.setWorkSurface!=='function')return false;
  d=d||desenhoAtual();R=R||rasterDoDesenho(d);
  const anterior=estado.workSurfaceState,igual=key=>!forcar&&anterior?.length===key.length&&key.every((v,i)=>Object.is(v,anterior[i]));
  if(!d||!R){const key=[A,S.projectId,null];if(!igual(key)){A.setWorkSurface(null,redraw);estado.workSurfaceState=key;}return false;}
  const origem=d.crs||S.workCRS,g=R.d,destino=R.crs||g.crs||S.workCRS;
  /* Identidades e revisões independentes: reimportar uma grade com o mesmo
     nome/tamanho, religar o original ou trocar CRS invalida a amostragem.
     Uma sincronização manual também força a invalidação para integrações
     antigas que alteram a matriz no lugar, sem incrementar revisão. */
  const key=[A,S.projectId,d.id,R,R.id,R.name,g,g.z,g.tin,g._img0,g._full,g._full?.z,
    R._projectNativeBinding,R._projectSourceRaw,R._dataRev,R._rev,g._rev,
    S.workCRS,origem,destino,g.crs,g.srcCRS,g.nc,g.nr,g.cs,g.csy,g.xll,g.yll,g.x0,g.y0,
    g.native,g.resampled,+d.baseZ,R.style?.opacity,R.opacity];
  if(igual(key))return true;
  const sampleZ=(x,y)=>{
    let px=+x,py=+y;if(!Number.isFinite(px)||!Number.isFinite(py))return NaN;
    try{
      if(origem&&destino&&String(origem)!==String(destino)){
        const w=toWGS(origem,px,py),q=fromWGS(destino,w[0],w[1]);px=q[0];py=q[1];
      }
      return sampleZbil(g,px,py);
    }catch(e){return NaN;}
  };
  const result=A.setWorkSurface({id:R.id,name:R.name||String(R.id),designId:d.id,
    revision:R._dataRev??g._rev??R._rev??0,workZ:+d.baseZ,cellSize:+g.cs||1,tolerance:.1,
    opacity:R.style?.opacity??R.opacity??1,sampleZ},redraw);
  estado.workSurfaceState=key;return result;
}
function defineCotaTrabalho(valor,silencioso){
  const d=desenhoAtual(),R=rasterDoDesenho(d),lim=limitesCotaRedonda(R);if(!d||!R||!lim)return false;
  let z=+valor;if(!Number.isFinite(z))return false;
  z=cotaRedonda5(Math.max(lim.min,Math.min(lim.max,z)));
  z=Math.max(lim.min,Math.min(lim.max,z));
  d.baseZ=z;estado.baseZ=z;estado.cutHashes[d.id]=null;
  configuraCotaTrabalho(d,R);try{api()?.setWorkElevation?.(z);}catch(e){}
  salvaRegistroLocal();
  agendarSincronizacao();
  if(!silencioso)status(`Cota de trabalho: ${formataCota(z)} m · toda a ${tipoNome(d.tipo)} foi deslocada verticalmente · comparação com “${R.name||R.id}” atualizada.`);
  return true;
}
function populaMdts(d){
  /* O seletor externo deixou de existir com a barra de ponte; quando ele não
     estiver presente, o seletor do próprio motor continua sendo alimentado. */
  const el=document.getElementById('cava2Mdt');
  d=d||desenhoAtual();const rasters=listaMdtsValidos(),valor=String(d?.mdtId??estado.mdtTrabalhoId??el?.value??'');
  if(el){
    el.innerHTML='<option value="">— escolha a superfície —</option>'+rasters.map(r=>
      `<option value="${esc(r.id)}">${esc(r.name||`MDT ${r.id}`)}</option>`).join('');
    if(valor&&rasters.some(r=>String(r.id)===valor))el.value=valor;else el.value='';
  }
  sincronizaSeletorMdtMotor(d,rasters);return rasters;
}
function sincronizaSeletorMdtMotor(d,rasters,options={}){
  const D=doc2D(),el=D&&D.getElementById('ccmgis_mdt');if(!el)return false;
  d=d||desenhoAtual();rasters=rasters||listaMdtsValidos();
  const valor=String(d?.mdtId??estado.mdtTrabalhoId??'');
  el.innerHTML='<option value="">Escolher MDT de trabalho</option>'+rasters.map(r=>
    `<option value="${esc(r.id)}">${esc(r.name||`MDT ${r.id}`)}</option>`).join('');
  if(valor&&rasters.some(r=>String(r.id)===valor))el.value=valor;else el.value='';
  const ok=!!el.value,cmd=D.getElementById('ccmgisMdtCommand'),cut=D.getElementById('ccmgis_cortar_cava');
  D.body.dataset.ccmgisMdtId=ok?el.value:'';
  cmd?.classList.toggle('tem-mdt',ok);cmd?.classList.toggle('sem-mdt',!ok);
  const R=rasters.find(r=>String(r.id)===el.value);
  cmd?.setAttribute('data-tooltip',ok?`MDT: ${R?.name||el.value}`:'Escolher MDT de trabalho');
  configuraCotaTrabalho(d,R||null);
  sincronizaSuperficieTrabalhoNoMotor(d,R||null,options.redraw!==false,!!options.force);
  if(cut){cut.disabled=!ok;cut.classList.toggle('corte-finalizado',!!d?.cutMdt);}
  for(const id of ['t_cava','t_pilha','b_escolher']){
    const b=D.getElementById(id);if(!b)continue;
    b.classList.toggle('aguarda-mdt',!ok);b.setAttribute('aria-disabled',String(!ok));
  }
  try{api()?.setDrawingEnabled?.(ok,el.value);}catch(e){}
  const externo=document.getElementById('cava2Mdt');if(externo)externo.value=ok?el.value:'';
  return ok;
}
function exigeMdt(){
  status('Escolha primeiro o MDT de trabalho; depois o desenho da cava/DCE será liberado.',true);
  const D=doc2D(),cmd=D&&D.getElementById('ccmgisMdtCommand'),el=D&&D.getElementById('ccmgis_mdt');
  cmd?.classList.remove('mdt-alerta');void cmd?.offsetWidth;cmd?.classList.add('mdt-alerta');
  setTimeout(()=>cmd?.classList.remove('mdt-alerta'),900);abreSeletorMdt();return false;
}
/* Lista explícita: um select transparente sobre o ícone não dava retorno
   quando não havia MDT, e dependia do popup nativo dentro do iframe. */
function abreSeletorMdt(){
  const D=doc2D(),button=D?.getElementById('ccmgisMdtOpen');if(!D||!button)return;
  const anterior=D.getElementById('ccmgisMdtPicker');
  if(anterior){anterior._close?.();return;}
  const rasters=populaMdts(),current=D.getElementById('ccmgis_mdt').value;
  const panel=D.createElement('div');panel.id='ccmgisMdtPicker';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','MDT de trabalho');
  panel.style.cssText='position:fixed;z-index:10000;box-sizing:border-box;width:min(360px,calc(100vw - 16px));max-height:70vh;overflow:auto;padding:14px;border:1px solid #627c90;border-radius:8px;background:var(--painel,#152532);color:var(--texto,#edf4fa);box-shadow:0 8px 28px #0008;font:13px Segoe UI,Arial,sans-serif';
  panel.innerHTML='<strong>Escolher MDT de trabalho</strong><p style="line-height:1.5">'+(rasters.length?'Selecione uma superfície de elevação carregada no projeto.':'Nenhum MDT disponível. Importe um raster de elevação no mapa 2D e volte ao modo Cava para selecioná-lo.')+'</p>';
  const close=(focus=true)=>{panel.remove();button.setAttribute('aria-expanded','false');D.removeEventListener('pointerdown',outside,true);if(focus)button.focus();};
  const outside=e=>{if(!panel.contains(e.target)&&!button.contains(e.target))close(false);};
  panel._close=close;
  const choice=(label,id)=>{
    const b=D.createElement('button');b.type='button';b.textContent=label;b.dataset.mdtId=id;
    b.style.cssText='display:block;width:100%;box-sizing:border-box;text-align:left;padding:10px;margin:5px 0;border:1px solid #627c90;border-radius:5px;background:transparent;color:inherit;cursor:pointer;white-space:normal;overflow-wrap:anywhere';
    if(String(id)===current)b.setAttribute('aria-current','true');
    b.onclick=()=>{selecionaMdtTrabalho(id);close();};panel.appendChild(b);
  };
  rasters.forEach(r=>choice((String(r.id)===current?'✓ ':'')+(r.name||'MDT '+r.id),String(r.id)));
  if(current)choice('Remover MDT de trabalho','');
  const cancel=D.createElement('button');cancel.type='button';cancel.textContent='Fechar';cancel.style.cssText='margin-top:8px;padding:7px 12px;cursor:pointer';cancel.onclick=()=>close();panel.appendChild(cancel);
  panel.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}
    if(e.key==='Tab'){const bs=[...panel.querySelectorAll('button')],first=bs[0],last=bs.at(-1);if(e.shiftKey&&D.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&D.activeElement===last){e.preventDefault();first.focus();}}
  });
  D.body.appendChild(panel);const r=button.getBoundingClientRect();panel.style.left=Math.max(8,Math.min(r.left,D.documentElement.clientWidth-panel.offsetWidth-8))+'px';panel.style.top=Math.max(8,Math.min(r.bottom+6,D.documentElement.clientHeight-panel.offsetHeight-8))+'px';
  button.setAttribute('aria-expanded','true');panel.querySelector('button').focus();D.addEventListener('pointerdown',outside,true);
}
function selecionaMdtTrabalho(id){
  id=String(id||'');const R=listaMdtsValidos().find(r=>String(r.id)===id)||null;
  const anterior=String(estado.mdtTrabalhoId??''),proximo=String(R?.id??'');estado.mdtTrabalhoId=R?R.id:null;
  if(anterior!==proximo){
    for(const d of estado.desenhos){
      d.mdtId=R?R.id:null;d.cutMdt=false;estado.cutHashes[d.id]=null;
      if(R)normalizaCotaDesenho(d,R);
      const C=camadaCorteDoDesenho(d.id),CF=camadaPreenchimentoCorteDoDesenho(d.id);if(C)removeCamadaGerada(C);if(CF)removeCamadaGerada(CF);mostraBrutaSemCorte(d);
    }
  }else for(const d of estado.desenhos)if(!d.mdtId)d.mdtId=R?.id||null;
  sincronizaSeletorMdtMotor(desenhoAtual());salvaRegistroLocal();
  if(typeof refreshUI==='function')refreshUI();atualizaContexto();
  if(!R){status('Nenhum MDT de trabalho selecionado; o desenho da cava/DCE está bloqueado.',true);return false;}
  const d=desenhoAtual(),design=designRuntime(d);
  status(`MDT de trabalho “${R.name||R.id}” selecionado · a camada Interseção será atualizada automaticamente.`);
  if(design)sincronizaCamadas(false);return true;
}
function configuraMdtNoMotor(){
  const D=doc2D(),el=D&&D.getElementById('ccmgis_mdt'),cut=D&&D.getElementById('ccmgis_cortar_cava'),
    cota=D&&D.getElementById('ccmgis_cota_trabalho');
  if(!D||!el||!cut||!cota)return false;
  if(!el.dataset.ccmgisBound){
    el.dataset.ccmgisBound='1';
    D.getElementById('ccmgisMdtOpen')?.addEventListener('click',abreSeletorMdt);
    el.addEventListener('change',()=>selecionaMdtTrabalho(el.value));
    cota.addEventListener('input',()=>defineCotaTrabalho(cota.value,true));
    cota.addEventListener('change',()=>defineCotaTrabalho(cota.value,false));
    cut.addEventListener('click',()=>rasterDoDesenho(desenhoAtual())?cortaMdtAtual(true):exigeMdt());
    const swelling=D.getElementById('ccmgisEmpolamento');
    swelling?.addEventListener('input',()=>{
      const d=desenhoAtual();if(!d)return;
      d.empolamento=swelling.value.trim()!==''&&Number.isFinite(swelling.valueAsNumber)&&swelling.valueAsNumber>=0?swelling.valueAsNumber:null;
      salvaRegistroLocal();atualizaContexto();window.GeoMineWorkspaceResume?.request();
    });
  }
  if(!D.documentElement.dataset.ccmgisMdtGuard){
    D.documentElement.dataset.ccmgisMdtGuard='1';
    D.addEventListener('click',ev=>{
      const b=ev.target?.closest?.('#t_cava,#t_pilha,#b_escolher,#b_novo_lim');
      if(!b)return;
      if(b.id==='t_cava'||b.id==='t_pilha'){
        ev.preventDefault();ev.stopImmediatePropagation();iniciaDesenho(b.id==='t_pilha'?'pilha':'cava');return;
      }
      if(!desenhoAtual())criaNovoDesenho(alvoAtual());
      if(!rasterDoDesenho(desenhoAtual())){ev.preventDefault();ev.stopImmediatePropagation();exigeMdt();}
    },true);
  }
  sincronizaSeletorMdtMotor(desenhoAtual());return true;
}
function rasterDoDesenho(d){
  if(!d||d.mdtId==null||typeof S==='undefined')return null;
  return (S.rasters||[]).find(r=>String(r.id)===String(d.mdtId)&&mdtValido(r))||null;
}
function camadaCorteDoDesenho(id){
  return (S.layers||[]).find(L=>String(L._cava2CutOf||'')===String(id||''))||null;
}
function nomeCorteMdt(d,R){
  return `Interseção — ${d?.nome||tipoNome(d?.tipo)}`;
}
function feicoesCompativeisCorte(feats){
  return clone(feats||[]).map(f=>{
    const elemento=String(f.props?.ELEMENTO||''),banco=n(f.props?.BANCO);
    const tipo=elemento==='Crista'?`Crista banco ${banco}`:
      elemento==='Pé'?`Pé banco ${banco}`:`Rampa banco ${banco}`;
    const classe=elemento==='Crista'?'rb31-crista':elemento==='Pé'?'rb31-pe':'rb31-rampa';
    f.props={...(f.props||{}),TIPO:tipo,CLASSE:classe};
    return f;
  });
}
function normalizaCorteMdt(feats,d,R){
  let fid=1;
  return (feats||[]).filter(f=>Array.isArray(f?.geom)&&f.geom.length>1).map(f=>{
    const p=f.props||{},tipo=String(p.TIPO||''),classeAntiga=String(p.CLASSE||'');
    let elemento=String(p.ELEMENTO||'');
    if(tipo==='Interseção cava × terreno'||['daylight','rb31-inter'].includes(classeAntiga))
      elemento='Interseção';
    else if(!['Crista','Pé','Rampa'].includes(elemento))
      elemento=/crista/i.test(tipo)?'Crista':/p[eé]/i.test(tipo)?'Pé':'Rampa';
    const classe=elemento==='Crista'?'rb31-crista':elemento==='Pé'?'rb31-pe':
      elemento==='Interseção'?'rb31-inter':'rb31-rampa';
    return {...f,multi:false,props:{...p,FID:fid++,DESENHO:d.nome,DESIGN_ID:d.id,
      PROJETO:tipoNome(d.tipo),ELEMENTO:elemento,MDT:R.name||'MDT',CLASSE:classe,
      ORIGEM:'Área 2D · Cava2 · interseção MDT'}};
  });
}
function categorias(feats,tipo){
  const defs=tipo==='pilha'?
    [['Crista','#333c48','',1.8,.35],['Pé','#8a93a0','6 4',1.1,.18],['Rampa','#2c3e70','',1.2,.28],
      ['Interseção','#0d9488','10 4',1.8,0]]:
    [['Crista','#8a4b1e','',1.8,.35],['Pé','#c08a52','6 4',1.1,.18],['Rampa','#b3541e','',1.2,.32],
      ['Interseção','#0d9488','10 4',1.8,0]];
  return defs.map(([value,color,dash,weight,fill])=>({value,label:value,color,stroke:color,weight,dash,
    opacity:1,fill,visible:true,vis:true,count:feats.filter(f=>f.props?.ELEMENTO===value).length}));
}
function estiloCamada(L,feats){
  const antiga=new Map((L.sym?.cats||[]).map(c=>[String(c.value),c])),
    cats=categorias(feats,L._cava2Kind);
  cats.forEach(c=>{const a=antiga.get(String(c.value));if(a)Object.assign(c,a,
    {value:c.value,label:c.label,count:c.count});});
  L.color='#111111';L.weight=1.5;L.fill=0;
  L.fields=['FID','DESENHO','DESIGN_ID','PROJETO','ELEMENTO','COTA','ORDEM','BANCO','MDT','ORIGEM'];
  L.sym={mode:'cat',color:'#111111',stroke:'#111111',hatch:'solid',hatchScale:1,weight:1.5,fill:0,dash:'',
    field:'ELEMENTO',classes:[],cats,ramp:'amber'};
  L.clsOpen=true;L._cava2Managed=true;
}
function camadaDoDesenho(id){return S.layers.find(L=>L._cava2DesignId===id);}
function idDesenhoDaCamada(L){return L?._cava2DesignId||L?._cava2CutOf||L?._cava2CutFillOf||null;}
// Ausência de uma saída excluída pelo usuário não é falha de sincronização.
// As marcas pertencem à receita, para sobreviver a salvar/reabrir o projeto.
const PAPEIS_SAIDA_RECORTE=new Set(['intersection','cutFill','cutLine','cutSnapshotFill','cutSurface']);
function saidaSuprimida(d,papel){
  return !!d?.suppressedOutputs?.[papel]&&!(estado.regenerandoSaidasId===d?.id&&PAPEIS_SAIDA_RECORTE.has(papel));
}
function confirmaSaidasRegeneradas(d){
  if(!d?.suppressedOutputs||estado.regenerandoSaidasId!==d.id)return;
  const presentes=new Set((S.layers||[]).map(saidaDaCamada).filter(q=>q?.id===d.id).map(q=>q.role));
  if((S.rasters||[]).some(R=>R.id===d.resultadoCorte?.surfaceId))presentes.add('cutSurface');
  for(const papel of presentes)if(PAPEIS_SAIDA_RECORTE.has(papel))delete d.suppressedOutputs[papel];
  if(!Object.keys(d.suppressedOutputs).length)delete d.suppressedOutputs;
}
function saidaDaCamada(L){
  if(L?._cava2CutSnapshotOf)return {id:L._cava2CutSnapshotOf,role:L._cava2SnapshotRole==='fill'?'cutSnapshotFill':'cutLine'};
  if(L?._cava2CutFillOf)return {id:L._cava2CutFillOf,role:'cutFill'};
  if(L?._cava2CutOf)return {id:L._cava2CutOf,role:'intersection'};
  if(L?._cava2DesignId&&L.gtype==='polygon')return {id:L._cava2DesignId,role:'rawFill'};
  return null;
}
function resultadoCavaDisponivel(d){
  if(!d?.resultadoCorte)return false;
  const ls=camadasResultadoCava(d);return !!(ls.line||ls.fill||(S.rasters||[]).some(R=>R.id===d.resultadoCorte.surfaceId));
}
function migraSaidasRecortadasAusentes(d){
  // A versão anterior conservava o resultado na receita após excluir todas
  // as saídas. Somente um corte concluído, sem nenhum produto remanescente,
  // permite reconhecer esse caso; receitas antigas/incompletas não inferem exclusão.
  const corte=d?.resultadoCorte;if(!corte?.id||!corte?.surfaceId)return false;
  const temCamada=(S.layers||[]).some(L=>{const q=saidaDaCamada(L);
    return q?.id===d.id&&PAPEIS_SAIDA_RECORTE.has(q.role)||L._cava2CutSnapshotId===corte.id;});
  const temRaster=(S.rasters||[]).some(R=>R.id===corte.surfaceId||R.src?.kind==='cava2-clipped'&&R.src.designId===d.id);
  if(temCamada||temRaster)return false;
  d.suppressedOutputs={...d.suppressedOutputs};
  for(const papel of PAPEIS_SAIDA_RECORTE)d.suppressedOutputs[papel]=true;
  d.variante='bruta';corte.sourceVisible=true;
  return true;
}
function preparaExclusaoSaida(saida){
  const d=estado.desenhos.find(d=>d.id===saida?.id);if(!d)return null;
  if(d.id===estado.desenhoId)salvaAtual(false);
  return {kind:'output',id:d.id,role:saida.role,previousSuppressed:!!d.suppressedOutputs?.[saida.role],previousVariant:d.variante};
}
function registraExclusaoSaida(snapshot){
  const d=estado.desenhos.find(d=>d.id===snapshot?.id);if(!d||snapshot.kind!=='output')return false;
  clearTimeout(estado.syncTimer);estado.syncTimer=0;
  d.suppressedOutputs={...d.suppressedOutputs,[snapshot.role]:true};
  if(d.variante==='recortada'&&!resultadoCavaDisponivel(d))d.variante='bruta';
  estado.outputKey=null;renderAbas();salvaRegistroLocal();atualizaContexto();
  window.GeoMineWorkspaceResume?.request();return true;
}
function restauraExclusaoSaida(snapshot){
  const d=estado.desenhos.find(d=>d.id===snapshot?.id);if(!d||snapshot.kind!=='output')return false;
  if(snapshot.previousSuppressed)d.suppressedOutputs={...d.suppressedOutputs,[snapshot.role]:true};
  else if(d.suppressedOutputs){delete d.suppressedOutputs[snapshot.role];if(!Object.keys(d.suppressedOutputs).length)delete d.suppressedOutputs;}
  if(snapshot.previousVariant==='recortada'&&resultadoCavaDisponivel(d))d.variante='recortada';
  estado.outputKey=null;renderAbas();salvaRegistroLocal();atualizaContexto();
  window.GeoMineWorkspaceResume?.request();return true;
}
function preparaExclusaoRaster(R){
  const id=R?.src?.kind==='cava2-clipped'?R.src.designId:estado.desenhos.find(d=>d.resultadoCorte?.surfaceId===R?.id)?.id;
  return id?preparaExclusaoSaida({id,role:'cutSurface'}):null;
}
function limpaSaidasSuprimidasDaTentativa(d,antes){
  if(!d||!antes)return;
  for(const L of [...(S.layers||[])]){
    const q=saidaDaCamada(L);
    if(q?.id===d.id&&antes.suppressed[q.role]&&!antes.layers.has(L.id))removeCamadaGerada(L);
  }
  for(const R of [...(S.rasters||[])])if(antes.suppressed.cutSurface&&R.src?.kind==='cava2-clipped'&&R.src.designId===d.id&&!antes.rasters.has(R.id)){
    try{if(R.overlay&&typeof map!=='undefined')map.removeLayer(R.overlay);}catch(e){}
    S.rasters=S.rasters.filter(q=>q!==R);S.stack=(S.stack||[]).filter(k=>k!==`R:${R.id}`);
  }
}
/* Chamado ANTES da exclusão geral da camada. Guarda a entidade lógica inteira
   para que um único Ctrl+Z possa restaurar camada, aba e receita sem duplicar. */
function preparaExclusaoCamada(L){
  const saida=saidaDaCamada(L);if(saida)return preparaExclusaoSaida(saida);
  const id=idDesenhoDaCamada(L),idx=estado.desenhos.findIndex(d=>d.id===id);
  if(!id||idx<0)return null;
  if(id===estado.desenhoId)salvaAtual(false);
  return {id,index:idx,activeId:estado.desenhoId,design:clone(estado.desenhos[idx]),
    cutHash:estado.cutHashes[id]??null,
    companions:(S.layers||[]).map((q,i)=>({L:q,idx:i})).filter(x=>x.L!==L&&
      (x.L._cava2DesignId===id||x.L._cava2CutOf===id||x.L._cava2CutFillOf===id))};
}
function limpaMotorSemDesenho(){
  const A=api();if(!A)return false;estado.restaurando=true;
  try{
    if(typeof A.limpaCadeia==='function')A.limpaCadeia();
    else for(const k of ['cava','pilha']){A.objs[k].base=null;A.objs[k].anc=null;A.objs[k].design=null;}
    if(typeof A.saneiaPainel==='function')A.saneiaPainel();
    try{estado.frame.contentWindow.localStorage.removeItem(STORAGE_KEY);}catch(e){}
    A.secAB={a:null,b:null};A.regen();
  }finally{estado.restaurando=false;}
  const nm=document.getElementById('cava2Name');if(nm)nm.value='';
  return true;
}
/* Chamado DEPOIS que a camada clicada saiu de S.layers. Remove somente o
   desenho que possui o mesmo DESIGN_ID, suas camadas derivadas e sua aba. */
function removeDesenhoDaCamada(L,snapshot){
  if(snapshot?.kind==='output')return registraExclusaoSaida(snapshot);
  snapshot=snapshot||preparaExclusaoCamada(L);const id=snapshot?.id||idDesenhoDaCamada(L);
  const idx=estado.desenhos.findIndex(d=>d.id===id);if(!id||idx<0)return false;
  clearTimeout(estado.syncTimer);estado.syncTimer=0;
  const eraAtivo=estado.desenhoId===id;
  for(const q of [...(S.layers||[])])if(q._cava2DesignId===id||q._cava2CutOf===id||q._cava2CutFillOf===id)removeCamadaGerada(q);
  estado.desenhos.splice(idx,1);delete estado.cutHashes[id];
  if(eraAtivo){
    const proximo=estado.desenhos[Math.min(idx,estado.desenhos.length-1)]||null;
    estado.desenhoId=proximo?.id||null;
    if(proximo)aplicaDesenho(proximo,false);else{limpaMotorSemDesenho();atualizaContexto();}
  }else atualizaContexto();
  renderAbas();salvaRegistroLocal();
  status(`${snapshot?.design?.nome||L?.name||'Desenho'} removido junto com sua camada.`);
  try{if(S._view==='v3d'&&typeof v3Auto==='function')v3Auto();}catch(e){}
  return true;
}
function restauraExclusaoCamada(snapshot,Lrestaurada){
  if(snapshot?.kind==='output')return restauraExclusaoSaida(snapshot);
  if(!snapshot?.id||!snapshot.design)return false;
  if(!estado.desenhos.some(d=>d.id===snapshot.id))
    estado.desenhos.splice(Math.min(snapshot.index??estado.desenhos.length,estado.desenhos.length),0,clone(snapshot.design));
  for(const x of (snapshot.companions||[]).slice().sort((a,b)=>a.idx-b.idx)){
    if((S.layers||[]).some(q=>q===x.L||q.id===x.L.id))continue;
    S.layers.splice(Math.min(x.idx??S.layers.length,S.layers.length),0,x.L);
    try{if(x.L.visible&&x.L.llayer&&typeof map!=='undefined')x.L.llayer.addTo(map);}catch(e){}
    try{if(typeof drawLayer==='function')drawLayer(x.L);}catch(e){}
  }
  estado.cutHashes[snapshot.id]=snapshot.cutHash;
  estado.desenhoId=estado.desenhos.some(d=>d.id===snapshot.activeId)?snapshot.activeId:
    (estado.desenhoId||snapshot.id);
  const ativo=desenhoAtual();if(ativo)aplicaDesenho(ativo,false);
  renderAbas();salvaRegistroLocal();atualizaContexto();
  status(`${snapshot.design.nome}: desenho, aba e camada restaurados.`);
  return true;
}
function removeCamadaGerada(L){
  if(!L)return false;
  try{if(L.llayer&&typeof map!=='undefined')map.removeLayer(L.llayer);}catch(e){}
  const i=(S.layers||[]).indexOf(L);if(i>=0)S.layers.splice(i,1);
  if(S.activeId===L.id)S.activeId=null;
  return true;
}
function limpaCamadasDoDesenho(){
  clearTimeout(estado.syncTimer);estado.syncTimer=0;
  const d=desenhoAtual();if(!d)return false;
  d.engine=leEstadoMotor();estado.cutHashes[d.id]=null;
  const removidas=[camadaDoDesenho(d.id),camadaCorteDoDesenho(d.id)].filter(Boolean);
  removidas.forEach(removeCamadaGerada);
  salvaRegistroLocal();if(typeof refreshUI==='function')refreshUI();atualizaContexto();
  status(`${d.nome}: desenho e ${removidas.length} camada(s) gerada(s) removidos.`);
  try{if(S._view==='v3d'&&typeof v3Auto==='function')v3Auto();}catch(e){}
  return true;
}
function publicaDesenho(d,design,silencioso){
  if(!d)return null;
  const feats=feicoesDoDesign(design,n(d.baseZ),d),ativo=S.activeId;
  let L=camadaDoDesenho(d.id);
  if(!L&&!feats.length)return null;
  if(!L){
    L=addLayer({name:nomeCamada(d),gtype:'line',features:feats,
      fields:['FID','DESENHO','DESIGN_ID','PROJETO','ELEMENTO','COTA','ORDEM','BANCO','ORIGEM'],
      crs:d.crs||S.workCRS,color:'#111111',src:'Área 2D · Cava2'});
    L._cava2DesignId=d.id;
  }else{
    L.features=feats;L.crs=d.crs||L.crs||S.workCRS;L.src='Área 2D · Cava2';L.name=nomeCamada(d);
  }
  L._cava2Kind=d.tipo;L._cava2Engine=clone(d.engine);estiloCamada(L,feats);
  if(typeof drawLayer==='function')drawLayer(L);
  if(ativo!=null&&S.layers.some(x=>x.id===ativo))S.activeId=ativo;
  if(!silencioso&&typeof refreshUI==='function')refreshUI();
  return L;
}
function assinaturaMdt(R){
  const g=R?.d||{},z=g.z||[],nc=Math.max(0,Math.floor(n(g.nc))),nr=Math.max(0,Math.floor(n(g.nr)));
  const valor=(i,j)=>{try{return Array.isArray(z[0])||ArrayBuffer.isView(z[0])?z[i]?.[j]:z[i*nc+j];}catch(e){return null;}};
  return JSON.stringify([R?.id,R?._dataRev??g._rev??R?._rev??0,nc,nr,n(g.cs),n(g.x0),n(g.y0),
    valor(0,0),valor(0,Math.max(0,nc-1)),valor(Math.floor(nr/2),Math.floor(nc/2)),valor(Math.max(0,nr-1),Math.max(0,nc-1))]);
}
function hashCorteMdt(d,R,finalizado){
  return `contato-mdt-3|${assinaturaMdt(R)}|${finalizado?'corte':'preview'}|${d.tipo}|${n(d.baseZ)}|${JSON.stringify(d.engine||{})}`;
}
function mostraBrutaSemCorte(d,mensagem,erro){
  const L=camadaDoDesenho(d?.id),C=camadaCorteDoDesenho(d?.id);
  if(L){L.visible=true;if(typeof drawLayer==='function')drawLayer(L);}
  if(C){C.visible=false;if(typeof drawLayer==='function')drawLayer(C);}
  if(mensagem)status(mensagem,erro);return null;
}
function publicaCorteMdt(d,design,silencioso,forcar,finalizar){
  const finalizado=!!(finalizar||d?.cutMdt),R=rasterDoDesenho(d),g=R?.d;
  if(!d||!g)return mostraBrutaSemCorte(d,'Escolha um MDT válido para calcular a interseção.',true);
  if(typeof cavaRecortaAneisFechadosNoMdt!=='function')
    return mostraBrutaSemCorte(d,'O algoritmo de interseção da cava não está disponível.',true);
  const hash=hashCorteMdt(d,R,finalizado),existente=camadaCorteDoDesenho(d.id);
  if(!forcar&&existente&&estado.cutHashes[d.id]===hash){
    const bruta=camadaDoDesenho(d.id);if(bruta){bruta.visible=!finalizado;drawLayer(bruta);}
    existente.visible=true;drawLayer(existente);return existente;
  }
  const src=feicoesDoDesign(design,n(d.baseZ),d);
  if(!src.length){
    if(existente)removeCamadaGerada(existente);estado.cutHashes[d.id]=null;
    return mostraBrutaSemCorte(d,silencioso?'':`${d.nome}: desenhe primeiro um limite fechado.`,!silencioso);
  }
  const passo=Math.max(.2,Math.min(.75,n(g.cs,.5)));let q;
  try{q=cavaRecortaAneisFechadosNoMdt(feicoesCompativeisCorte(src),g,d.tipo==='pilha',passo);}
  catch(e){console.error('Interseção Área 2D × MDT',e);return mostraBrutaSemCorte(d,
    `Falha ao calcular a interseção com “${R.name}”: ${e.message||e}`,true);}
  const todas=normalizaCorteMdt(q?.feats,d,R),inter=todas.filter(f=>f.props?.ELEMENTO==='Interseção');
  if(!inter.length){
    if(existente)removeCamadaGerada(existente);estado.cutHashes[d.id]=null;
    return mostraBrutaSemCorte(d,`${d.nome}: nenhuma interseção encontrada com “${R.name}”; mantida a camada editável.`,!silencioso);
  }
  const feats=finalizado?todas:inter,ativo=S.activeId;let C=existente;
  if(!C){
    C=addLayer({sourceLayer:camadaDoDesenho(d.id)||R,name:nomeCorteMdt(d,R),gtype:'line',features:feats,
      fields:['FID','DESENHO','DESIGN_ID','PROJETO','ELEMENTO','COTA','ORDEM','BANCO','MDT','ORIGEM'],
      crs:d.crs||S.workCRS,color:'#0d9488',src:'Área 2D · Cava2 · interseção dinâmica'});
    C._cava2CutOf=d.id;
  }else{
    C.features=feats;C.crs=d.crs||C.crs||S.workCRS;C.name=nomeCorteMdt(d,R);
    C.src=finalizado?'Área 2D · Cava2 · cava cortada':'Área 2D · Cava2 · interseção dinâmica';
  }
  C._cava2MdtId=R.id;C._cava2Kind=d.tipo;C._cava2Managed=true;
  C._cava2CutFinalized=finalizado;C._cava2IntersectionPreview=!finalizado;C.visible=true;estiloCamada(C,feats);
  const L=camadaDoDesenho(d.id);if(L){L.visible=!finalizado;drawLayer(L);}drawLayer(C);
  if(ativo!=null&&S.layers.some(x=>x.id===ativo))S.activeId=ativo;
  estado.cutHashes[d.id]=hash;if(!silencioso&&typeof refreshUI==='function')refreshUI();return C;
}
async function cortaMdtAtual(forcar){
  if(estado.busyCut)return false;
  const d=desenhoAtual(),project=S.projectId,variant=d?.variante;
  if(!d)return false;
  const antes={layers:new Set((S.layers||[]).map(L=>L.id)),rasters:new Set((S.rasters||[]).map(R=>R.id)),suppressed:{...d.suppressedOutputs},resultadoCorte:clone(d.resultadoCorte)};
  let concluido=false;
  estado.busyCut=true;showLoad('Recortando a cava no MDT…');
  try{
    await new Promise(resolve=>setTimeout(resolve,30));
    if(S.projectId!==project||desenhoAtual()?.id!==d.id)return false;
    estado.regenerandoSaidasId=d.id;
    concluido=await executaCorteMdtAtual(forcar);return concluido;
  }catch(error){
    console.error('Recorte da cava',error);
    if(S.projectId===project&&desenhoAtual()?.id===d.id){
      const temporaryLine=camadaCorteDoDesenho(d.id),temporaryFill=camadaPreenchimentoCorteDoDesenho(d.id);
      if(temporaryLine?._cava2CutFinalized)removeCamadaGerada(temporaryLine);
      if(temporaryFill)removeCamadaGerada(temporaryFill);
      d.cutMdt=false;d.variante=variant||'bruta';estado.cutHashes[d.id]=null;estado.outputKey=null;atualizaContexto();
      const message=`Não foi possível concluir o recorte: ${error.message||error}. A cava bruta foi preservada.`;
      status(message,true);if(typeof toast==='function')toast(message);
    }
    return false;
  }finally{
    estado.regenerandoSaidasId=null;estado.busyCut=false;
    if(S.projectId===project){
      if(!concluido){
        limpaSaidasSuprimidasDaTentativa(d,antes);
        if(Object.keys(antes.suppressed).length)d.suppressedOutputs={...d.suppressedOutputs,...antes.suppressed};
        d.resultadoCorte=antes.resultadoCorte;d.variante=variant==='recortada'&&resultadoCavaDisponivel(d)?'recortada':'bruta';
        estado.outputKey=null;salvaRegistroLocal();atualizaContexto();if(typeof refreshUI==='function')refreshUI();
      }
      hideLoad();
    }
  }
}
async function executaCorteMdtAtual(forcar){
  const d=desenhoAtual();if(!d)return false;
  if(d.somenteRecortada){status('Abra o projeto de origem para alterar e recortar esta cava.',true);return false;}
  const def=typeof proj4==='function'?proj4.defs(d.crs||S.workCRS):null;
  if(!def||def.projName==='longlat'||def.units&&def.units!=='m')throw new Error('Use um CRS projetado em metros para gerar o MDT de 0,20 m.');
  salvaAtual(false);d.mdtId=estado.mdtTrabalhoId||d.mdtId||null;
  const R=rasterDoDesenho(d);if(!R)return exigeMdt();
  clearTimeout(estado.syncTimer);estado.syncTimer=0;
  publicaDesenho(d,designRuntime(d),true);
  const design=designRuntime(d),C=publicaCorteMdt(d,design,false,!!forcar,true);
  if(!C){d.cutMdt=false;mostraBrutaSemCorte(d);sincronizaSeletorMdtMotor(d);salvaRegistroLocal();return false;}
  const project=S.projectId,engine=d.engine,
    current=()=>S.projectId===project&&desenhoAtual()===d&&d.engine===engine;
  const grid=await GeoMineCavaTerrain.rasterize(C._cava2CutSurface,{cellSize:.2,crs:d.crs||S.workCRS,
    terrain:R.d,keepAbove:d.tipo==='pilha',isCurrent:current,
    onProgress:percent=>showLoad(`MDT recortado · 0,20 m · ${percent}%`)});
  if(!current())throw Object.assign(new Error('O projeto mudou durante o recorte.'),{name:'AbortError'});
  const superficie=cava2PublicaMdtRecortado(d,R,grid);
  const congelado=cava2CongelaCorte(d,R,C,null);
  delete C._cava2CutSurface;
  if(!congelado){d.cutMdt=false;mostraBrutaSemCorte(d);sincronizaSeletorMdtMotor(d);return false;}
  d.resultadoCorte={id:congelado.id,criadoEm:new Date().toISOString(),mdtId:R.id,
    mdtNome:R.name,cota:n(d.baseZ),engine:clone(d.engine),surfaceId:superficie.id,
    volumes:grid.cutVolume,sourceVisible:d.resultadoCorte?.sourceVisible??(R.visible!==false)};
  confirmaSaidasRegeneradas(d);
  d.variante='recortada';estado.outputKey=null;
  d.cutMdt=false;estado.cutHashes[d.id]=null;
  publicaCorteMdt(d,design,true,true,false);
  const temporario=camadaPreenchimentoCorteDoDesenho(d.id);if(temporario)removeCamadaGerada(temporario);
  sincronizaSeletorMdtMotor(d);renderAbas();salvaRegistroLocal();atualizaContexto();if(typeof refreshUI==='function')refreshUI();
  try{if(typeof layoutSeVisivel==='function')layoutSeVisivel();}catch(e){}
  const ni=congelado.line.features.filter(f=>f.props?.ELEMENTO==='Interseção').length;
  status(`${d.nome}: Bruta preservada · Recortada aberta · ${ni} interseção(ões).`);
  window.GeoMineWorkspaceResume?.request();
  estado.savingCut=salvaArquivoDaCava(d).catch(e=>{status(`Recorte mantido no projeto; falha ao gerar o arquivo: ${e.message||e}`,true);return false;});
  try{if(S._view==='v3d'&&typeof v3Auto==='function')v3Auto();}catch(e){}return true;
}
function removeCorteMdt(){
  const d=desenhoAtual();if(!d)return false;
  d.variante='bruta';
  d.cutMdt=false;estado.cutHashes[d.id]=null;mostraBrutaSemCorte(d);salvaRegistroLocal();
  sincronizaCamadas(false);sincronizaSeletorMdtMotor(d);
  status(`${d.nome}: Bruta aberta; a versão Recortada permanece salva.`);return true;
}
function designRuntime(d){
  const A=api();if(!d||!A)return null;
  const ordem=k=>k===d.tipo?-1:n(String(k).split('#')[1],0);
  const blocos=Object.keys(A.objs||{}).filter(k=>k===d.tipo||k.startsWith(d.tipo+'#'))
    .sort((a,b)=>ordem(a)-ordem(b)).map(k=>A.objs[k]?.design).filter(Boolean);
  if(!blocos.length)return null;if(blocos.length===1)return blocos[0];
  return {aneis:blocos.flatMap(x=>x.aneis||[]),corredores:blocos.flatMap(x=>x.corredores||[]),
    avisos:blocos.flatMap(x=>x.avisos||[]),nBancos:blocos.reduce((s,x)=>s+n(x.nBancos),0),
    areaBase:n(blocos[0]?.areaBase),areaFinal:n(blocos.at(-1)?.areaFinal),
    vol:blocos.reduce((s,x)=>s+n(x.vol),0),rampaDesenv:blocos.reduce((s,x)=>s+n(x.rampaDesenv),0)};
}
function salvaAtual(publicar){
  const d=desenhoAtual();if(!d||!estado.ready)return d;
  if(d.somenteRecortada)return d;
  d.engine=leEstadoMotor();d.baseZ=n(document.getElementById('cava2BaseZ')?.value,estado.baseZ);
  d.crs=estado.crs||d.crs||S.workCRS;d.fonte=clone(estado.fonte)||d.fonte||null;
  if(publicar)publicaDesenho(d,designRuntime(d),true);
  salvaRegistroLocal();
  return d;
}
function sincronizaCamadas(manual){
  clearTimeout(estado.syncTimer);estado.syncTimer=0;
  const A=api(),d=desenhoAtual();
  if(!A||!d){if(manual)status('A área 2D ainda está carregando.',true);return false;}
  salvaAtual(false);const design=designRuntime(d),L=publicaDesenho(d,design,true),R=rasterDoDesenho(d),
    C=R?publicaCorteMdt(d,design,true,false,!!d.cutMdt):null;
  if(manual)reconstroiCamadasAusentes();if(typeof refreshUI==='function')refreshUI();
  try{if(typeof layoutSeVisivel==='function')layoutSeVisivel();}catch(e){}
  try{if(S._view==='v3d'&&typeof v3Auto==='function')v3Auto();}catch(e){}
  const total=L?.features?.length||0,ni=C?.features?.filter(f=>f.props?.ELEMENTO==='Interseção').length||0;
  atualizaContexto();salvaRegistroLocal();sincronizaSeletorMdtMotor(d);
  status(total?`${d.nome}: ${total} string(s) 3D · ${ni} interseção(ões) dinâmica(s)${d.cutMdt?' · corte final ativo':''}.`:
    `${d.nome}: desenhe um limite fechado para criar a camada.`,manual&&!total);return true;
}
function agendarSincronizacao(){
  clearTimeout(estado.syncTimer);estado.syncTimer=setTimeout(()=>{
    try{sincronizaCamadas(false);}catch(e){console.error('Publicação Área 2D',e);status(`Falha ao publicar a camada: ${e.message||e}`,true);}
  },80);
}

function leEstadoMotor(){
  const A=api();
  try{if(A&&typeof A.estadoAtual==='function')return A.estadoAtual();}catch(e){}
  try{return JSON.parse(estado.frame.contentWindow.localStorage.getItem(STORAGE_KEY)||'null');}catch(e){return null;}
}
function dadosRegistro(){
  return {version:2,activeId:estado.desenhoId,seq:estado.seq,painelFechado:estado.painelFechado,
    mdtTrabalhoId:estado.mdtTrabalhoId||null,designs:clone(estado.desenhos)};
}
function salvaRegistroLocal(){
  try{localStorage.setItem(REGISTRY_KEY,JSON.stringify(dadosRegistro()));return true;}catch(e){return false;}
}
function leRegistroLocal(){
  try{return JSON.parse(localStorage.getItem(REGISTRY_KEY)||'null');}catch(e){return null;}
}
function carregaMotor(d){
  const A=api(),D=doc2D();if(!A||!D||!d)return false;
  const e=d.engine;estado.restaurando=true;
  try{
    estado.baseZ=n(d.baseZ);estado.crs=d.crs||S.workCRS;estado.fonte=clone(d.fonte)||null;
    if(typeof A.limpaCadeia==='function')A.limpaCadeia();
    if(!e){
      if(typeof A.saneiaPainel==='function')A.saneiaPainel();
      A.blocoAtivo=d.tipo;
      try{estado.frame.contentWindow.localStorage.removeItem(STORAGE_KEY);}catch(x){}
    }else if(typeof A.aplicaEstado==='function'&&(typeof e==='string'||e?.bl||e?.c||e?.p)){
      A.aplicaEstado(typeof e==='string'?e:JSON.stringify(e));
    }else{
      /* Compatibilidade com os instantâneos do motor anterior. */
      A.objs.cava.base=clone(e.bases?.cava)||null;A.objs.pilha.base=clone(e.bases?.pilha)||null;
      A.objs.cava.anc=clone(e.ancs?.cava)||null;A.objs.pilha.anc=clone(e.ancs?.pilha)||null;
      A.objs.cava.bermas=clone(e.ovs?.cava)||{};A.objs.pilha.bermas=clone(e.ovs?.pilha)||{};
      IDS_VALORES.forEach(id=>{if(D.getElementById(id)&&e.vals?.[id]!=null)D.getElementById(id).value=e.vals[id];});
      for(const id of ['cava_rampa_raio','pilha_rampa_raio'])if(D.getElementById(id)&&e.vals?.[id]==null)D.getElementById(id).value=20;
      if(e.chks){D.getElementById('cava_rampa_on').checked=!!e.chks.c;D.getElementById('pilha_rampa_on').checked=!!e.chks.p;}
      if(e.dirs){D.getElementById('cava_rampa_dir').value=e.dirs.c||'ah';D.getElementById('pilha_rampa_dir').value=e.dirs.p||'ah';}
      A.blocoAtivo=d.tipo;
    }
    atualizaCampos(d);A.regen();A.secAB={a:null,b:null};
  }finally{estado.restaurando=false;}
  return true;
}
function aplicaDesenho(d,publicar){
  if(!d)return false;atualizaCampos(d);if(!carregaMotor(d))return false;
  if(publicar)publicaDesenho(d,designRuntime(d),false);
  atualizaContexto();configuraMdtNoMotor();
  if(d.mdtId&&d.engine&&d.variante!=='recortada')agendarSincronizacao();
  try{doc2D()?.getElementById('b_ajustar')?.click();}catch(e){}
  return true;
}
function reconstroiCamadasAusentes(){
  const ativoId=estado.desenhoId,ativo=desenhoAtual();
  for(const d of estado.desenhos){
    const faltaBruta=!camadaDoDesenho(d.id),faltaIntersecao=!!d.mdtId&&!camadaCorteDoDesenho(d.id);
    if((!faltaBruta&&!faltaIntersecao)||!d.engine)continue;
    carregaMotor(d);const design=designRuntime(d);if(faltaBruta)publicaDesenho(d,design,true);
    if(d.mdtId)publicaCorteMdt(d,design,true,true,!!d.cutMdt);
  }
  estado.desenhoId=ativoId;if(ativo)carregaMotor(ativo);configuraMdtNoMotor();
}
function snapshot(){
  if(!estado.ready&&estado.projetoPendente!==undefined)return clone(estado.projetoPendente);
  salvaAtual(true);
  return dadosRegistro();
}
function migraEstado(st){
  if(st?.version===2&&Array.isArray(st.designs))return clone(st);
  if(!st&&typeof S!=='undefined'){
    const layers=(S.layers||[]).filter(L=>L._cava2DesignId);
    if(layers.length){
      const designs=layers.map(L=>({id:L._cava2DesignId,
        nome:String(L.name||'Desenho 2D').replace(/^(Cava|DCE)\s+—\s+/i,''),
        tipo:L._cava2Kind==='pilha'?'pilha':'cava',engine:clone(L._cava2Engine)||null,
        baseZ:0,crs:L.crs||S.workCRS,fonte:null,criadoEm:new Date().toISOString()}));
      return {version:2,activeId:designs[0].id,seq:estado.seq,painelFechado:true,designs};
    }
  }
  const designs=[],e=clone(st?.engine)||null;
  if(e?.bases?.cava)designs.push({...novoRegistro('cava','Cava 1'),engine:clone(e),baseZ:n(st?.baseZ),crs:st?.crs||S.workCRS,fonte:clone(st?.fonte)||null});
  if(e?.bases?.pilha)designs.push({...novoRegistro('pilha','DCE 1'),engine:clone(e),baseZ:n(st?.baseZ),crs:st?.crs||S.workCRS,fonte:clone(st?.fonte)||null});
  if(!designs.length)designs.push(novoRegistro('cava','Cava 1'));
  return {version:2,activeId:designs[0].id,seq:estado.seq,painelFechado:true,designs};
}
function migraCamadasAntigas(){
  for(const L of S.layers){
    if(L._cava2DesignId||!L._cava2Target)continue;
    const d=estado.desenhos.find(x=>x.tipo===L._cava2Target&&!camadaDoDesenho(x.id));
    if(d){L._cava2DesignId=d.id;L._cava2Kind=d.tipo;L.name=nomeCamada(d);estiloCamada(L,L.features||[]);}
  }
}
function aplicaEstadoProjeto(st){
  if(!estado.ready){estado.projetoPendente=clone(st);return false;}
  estado.outputKey=null;
  estado.projetoPendente=undefined;const m=migraEstado(st);
  estado.mdtTrabalhoId=m?.mdtTrabalhoId??m?.designs?.find(q=>q?.mdtId)?.mdtId??null;
  const usados=new Set();
  estado.desenhos=(m.designs||[]).map(d=>{
    const tipo=d.tipo==='pilha'?'pilha':'cava',id=d.id||novoId(),base=String(d.nome||proximoNome(tipo)).trim()||tipoNome(tipo);
    let nome=base,i=2;while(usados.has(nome.toLowerCase()))nome=`${base} ${i++}`;usados.add(nome.toLowerCase());
    return {...d,id,nome,tipo,baseZ:n(d.baseZ),crs:d.crs||S.workCRS,
      mdtId:d.mdtId??estado.mdtTrabalhoId??null,cutMdt:!!d.cutMdt,
      variante:d.variante==='recortada'&&d.resultadoCorte?'recortada':'bruta'};
  });
  // Projetos antigos podem guardar a receita do corte sem seus produtos.
  // Isso não autoriza ocultar o MDT de origem nem bloquear o editor na Recortada.
  for(const d of estado.desenhos){
    migraSaidasRecortadasAusentes(d);
    if(d.variante==='recortada'&&!resultadoCavaDisponivel(d))d.variante='bruta';
  }
  estado.seq=Math.max(n(m.seq),estado.seq);estado.painelFechado=m.painelFechado!==false;
  estado.desenhoId=estado.desenhos.some(d=>d.id===m.activeId)?m.activeId:estado.desenhos[0]?.id||null;
  migraCamadasAntigas();
  for(const d of estado.desenhos){const L=camadaDoDesenho(d.id);if(!d.engine&&L?._cava2Engine)d.engine=clone(L._cava2Engine);}
  aplicaPainel();if(desenhoAtual())aplicaDesenho(desenhoAtual(),false);else limpaMotorSemDesenho();reconstroiCamadasAusentes();
  renderAbas();atualizaContexto();salvaRegistroLocal();if(typeof refreshUI==='function')refreshUI();return true;
}

/* Publicação cartográfica do motor Cava2.
   O mesmo conjunto de estilos alimenta o Mapa 2D, a legenda e o Layout. */
function cava2BlocosDoDesign(design){
  if(Array.isArray(design?._blocos)&&design._blocos.length)return design._blocos;
  return design?[{key:'',index:0,z0:0,base:null,design}]:[];
}
function cava2Props(meta,extra){
  return {DESENHO:meta?.nome||'Desenho 2D',DESIGN_ID:meta?.id||'',
    PROJETO:tipoNome(meta?.tipo),ORIGEM:'Área 2D · Cava2',...(extra||{})};
}
function cava2NomeBloco(meta,indice){
  const raiz=meta?.tipo==='pilha'?'DCE':'CAVA';
  return indice>0?`${raiz} ${indice+1}`:raiz;
}
function cava2GeomFechada(P){
  const g=limpaPontos(P);return g.length>=3?fechaAnel(g):[];
}
function cava2MetaCorredor(c,corredores,i){
  const retorno=!!c?.gancho,banco=retorno?null:(corredores||[]).slice(0,i+1).filter(q=>!q?.gancho).length;
  return {retorno,banco,elemento:retorno?'Retorno':'Rampa',
    classe:retorno?'rb31-retorno':'rb31-rampa'};
}

/* Produto analítico fechado, reservado ao cálculo Área 2D × MDT. A versão
   anterior entregava ao algoritmo os pedaços abertos pelas rampas; cada pedaço
   era então fechado por uma corda artificial e a curva de interseção podia
   desaparecer. Aqui cada crista/pé chega como o anel original completo. */
function feicoesFechadasParaIntersecao(design,baseZ,meta){
  if(!design)return [];
  const out=[];let fid=1;
  (design.aneis||[]).forEach((a,i)=>{
    const geom=cava2GeomFechada(a.P);if(geom.length<4)return;
    const z=n(baseZ)+n(a.z),elemento=classe(a.tp);
    out.push({geom,multi:false,zg:geom.map(()=>z),props:{FID:fid++,...cava2Props(meta,{
      ELEMENTO:elemento,COTA:z,ORDEM:(i+1)*100,BANCO:Math.floor(i/2)+1,
      TIPO:`${elemento} banco ${Math.floor(i/2)+1}`,
      CLASSE:elemento==='Crista'?'rb31-crista':'rb31-pe'})}});
  });
  const corredores=design.corredores||[];
  corredores.forEach((c,i)=>{
    const cm=cava2MetaCorredor(c,corredores,i);
    [['borda1','Borda esquerda'],['centro','Eixo'],['borda2','Borda direita']].forEach(([chave,papel],j)=>{
      const P=c[chave]||[],geom=limpaPontos(P);if(geom.length<2)return;
      const zg=P.map(p=>n(baseZ)+n(p.z));
      out.push({geom,multi:false,zg,props:{FID:fid++,...cava2Props(meta,{ELEMENTO:cm.elemento,
        COTA:zg[0],ORDEM:i*3+j+1,BANCO:cm.banco,TIPO:cm.retorno?'Retorno da rampa':`Rampa banco ${cm.banco}`,
        CLASSE:cm.classe,ORIGEM:`Área 2D · Cava2 · ${papel}`})}});
    });
  });
  return out;
}

/* Linhas cartográficas: anéis com os mesmos recortes da aba Cava, rampa e,
   por último, o limite exterior preto sobre todas as demais linhas. */
function feicoesCartograficasDoDesign(design,baseZ,meta){
  if(!design)return [];
  meta=meta||{};const out=[];let fid=1;
  const corredores=design.corredores||[],A=api(),
    rampPolys=corredores.filter(c=>!c?.gancho).map(c=>c.poly).filter(P=>Array.isArray(P)&&P.length>=3),
    rotulados=new Set();
  (design.aneis||[]).forEach((a,i)=>{
    const recorte=A&&typeof A.recortaLinhaForaRampas==='function'
      ?A.recortaLinhaForaRampas(a.P,rampPolys,a.cortesRampa):{partes:[a.P],cortado:false};
    (a.partesEntrada||recorte.partes||[]).forEach((parte,j)=>{
      let geom=limpaPontos(parte);if(!recorte.cortado)geom=fechaAnel(geom);
      if(geom.length<(recorte.cortado?2:4))return;
      const z=n(baseZ)+n(a.z),elemento=classe(a.tp),ordem=(i+1)*100+j,
        deveRotular=(a.tp==='crista'||i===0)&&!rotulados.has(i);
      if(deveRotular)rotulados.add(i);
      out.push({geom,multi:false,zg:geom.map(()=>z),props:{FID:fid++,...cava2Props(meta,{
        ELEMENTO:elemento,COTA:z,ROTULO:deveRotular?formataCota(z):'',ORDEM:ordem,
        BANCO:Math.floor(i/2)+1,CLASSE:elemento==='Crista'?'rb31-crista':'rb31-pe'})}});
    });
  });
  corredores.forEach((c,i)=>{
    const cm=cava2MetaCorredor(c,corredores,i);
    [['borda1','Borda esquerda'],['centro','Eixo'],['borda2','Borda direita']].forEach(([chave,papel],j)=>{
      const P=c[chave]||[],geom=limpaPontos(P);if(geom.length<2)return;
      const zg=P.map(p=>n(baseZ)+n(p.z)),grad=n(c.gradEfetivo??design.gradEfetivo,NaN);
      out.push({geom,multi:false,zg,props:{FID:fid++,...cava2Props(meta,{ELEMENTO:cm.elemento,
        COTA:zg[0],ROTULO:papel==='Eixo'&&!cm.retorno&&cm.banco===1?`R${Number.isFinite(grad)?` · ${formataCota(grad)}%`:''}`:'',
        ORDEM:i*3+j+1,BANCO:cm.banco,CLASSE:cm.classe,ORIGEM:`Área 2D · Cava2 · ${papel}`})}});
    });
  });
  (design.limites||[]).forEach((lim,i)=>{
    const aberta=lim.aberta===true,P=lim.P||[],geom=aberta?limpaPontos(P):cava2GeomFechada(P);
    if(geom.length<(aberta?2:4))return;
    // As partes da união já carregam o deslocamento do bloco em cada Z.
    // Não fechar a parte nem ligar alturas diferentes por uma corda artificial.
    const zg=aberta?P.map(p=>n(baseZ)+n(p.z,lim.z0)):geom.map(()=>n(baseZ)+n(lim.z0));
    out.push({geom,multi:false,zg,props:{FID:fid++,...cava2Props(meta,{
      ELEMENTO:'Limite exterior',COTA:zg[0],ROTULO:'',ORDEM:900000+i,BANCO:null,
      CLASSE:'rb31-limite',ORIGEM:'Área 2D · Cava2 · limite exterior'})}});
  });
  return out;
}

/* Mantém a API histórica usada por exportação/testes, agora com o produto
   cartográfico completo. O cálculo da interseção usa a função fechada acima. */
function feicoesDoDesign(design,baseZ,meta){
  return feicoesCartograficasDoDesign(design,baseZ,meta);
}

/* A pintura não pode existir numa camada line: Leaflet e o SVG do Layout só
   preenchem gtype=polygon. Esta camada companheira reproduz área, fundo/topo e
   pista da rampa sem regras paralelas de CSS. */
function feicoesPreenchimentoDoDesign(design,baseZ,meta){
  if(!design)return [];
  const out=[];let fid=1;
  cava2BlocosDoDesign(design).forEach((b,bi)=>{
    const d=b.design,aneis=d?.aneis||[];if(!aneis.length)return;
    const exterior=aneis.at(-1),interior=aneis[0],gExt=cava2GeomFechada(exterior.P),
      gInt=cava2GeomFechada(interior.P);
    if(gExt.length>=4){const z=n(baseZ)+n(exterior.z);out.push({geom:gExt,multi:false,zg:gExt.map(()=>z),
      props:{FID:fid++,...cava2Props(meta,{ELEMENTO:'Área projetada',COTA:z,ROTULO:'',ORDEM:bi*10000+1,
        BANCO:null,CLASSE:'rb31-area'})}});}
    if(gInt.length>=4&&!b.hasContinuation){const z=n(baseZ)+n(interior.z);out.push({geom:gInt,multi:false,zg:gInt.map(()=>z),
      props:{FID:fid++,...cava2Props(meta,{ELEMENTO:meta?.tipo==='pilha'?'Topo':'Fundo',COTA:z,
        ROTULO:cava2NomeBloco(meta,bi),ORDEM:bi*10000+2,BANCO:0,CLASSE:'rb31-fundo'})}});}
    const corredores=d.corredores||[];
    corredores.forEach((c,i)=>{
      const cm=cava2MetaCorredor(c,corredores,i);
      const geom=cava2GeomFechada(c.poly);if(geom.length<4)return;
      const src=c.poly||[],fallback=n(baseZ)+n(c.zIni),zg=geom.map((_,j)=>n(baseZ)+n(src[Math.min(j,src.length-1)]?.z,fallback-n(baseZ)));
      out.push({geom,multi:false,zg,props:{FID:fid++,...cava2Props(meta,{ELEMENTO:cm.elemento,COTA:zg[0],
        ROTULO:'',ORDEM:bi*10000+100+i,BANCO:cm.banco,CLASSE:cm.retorno?'rb31-retorno-area':'rb31-rampa-area'})}});
    });
  });
  return out;
}

function cava2DefinicoesLinha(tipo){
  return tipo==='pilha'?
    [['Limite exterior','#101010','',2.6,0],['Crista','#333c48','',1.8,.35],
      ['Pé','#8a93a0','6 4',1.1,.18],['Rampa','#2c3e70','',1.2,.28],['Retorno','#1f6fb2','',1.4,.36],
      ['Interseção','#000000','',1.2,0]]:
    [['Limite exterior','#101010','',2.6,0],['Crista','#8a4b1e','',1.8,.35],
      ['Pé','#c08a52','6 4',1.1,.18],['Rampa','#b3541e','',1.2,.32],['Retorno','#d06b24','',1.4,.4],
      ['Interseção','#000000','',1.2,0]];
}
function categorias(feats,tipo){
  return cava2DefinicoesLinha(tipo).map(([value,color,dash,weight,fill])=>({value,label:value,
    color,stroke:color,weight,dash,opacity:1,fill,visible:true,vis:true,
    count:(feats||[]).filter(f=>f.props?.ELEMENTO===value).length}));
}
function cava2MesclaVisibilidade(cats,antigas){
  const mapa=new Map((antigas||[]).map(c=>[String(c.value),c]));
  cats.forEach(c=>{const a=mapa.get(String(c.value));if(a){
    if(a.vis===false)c.vis=false;if(a.visible===false)c.visible=false;
  }});return cats;
}
function estiloCamada(L,feats){
  const cats=cava2MesclaVisibilidade(categorias(feats,L._cava2Kind),L.sym?.cats);
  L.color='#111111';L.weight=1.5;L.fill=0;
  L.fields=['FID','DESENHO','DESIGN_ID','PROJETO','ELEMENTO','COTA','ROTULO','ORDEM','BANCO','MDT','ORIGEM'];
  L.sym={mode:'cat',color:'#111111',stroke:'#111111',hatch:'solid',hatchScale:1,weight:1.5,
    fill:0,dash:'',field:'ELEMENTO',classes:[],cats,ramp:'amber'};
  L.labelField='ROTULO';L.lbl={...(L.lbl||defaultLabelCfg()),font:'Signika, sans-serif',style:'normal',
    size:9.5,color:L._cava2Kind==='pilha'?'#333c48':'#8a4b1e',halo:'#f6f4ee',haloW:1.4,
    place:'curva',anchor:'middle',onMap:true,unique:false,rep:0};
  L.clsOpen=true;L._cava2Managed=true;L._cava2StyleVersion=2;
}
function estiloCamadaPreenchimento(L,feats){
  const pilha=L._cava2Kind==='pilha',defs=pilha?
    [['Área projetada','#9aa0a8','#9aa0a8',0,.35],['Topo','#c9ced6','#c9ced6',0,1],
      ['Rampa','#2c3e70','#2c3e70',1.2,.28],['Retorno','#1f6fb2','#1f6fb2',1.4,.36]]:
    [['Área projetada','#c9b18a','#c9b18a',0,.35],['Fundo','#efe6d2','#efe6d2',0,1],
      ['Rampa','#b3541e','#b3541e',1.2,.32],['Retorno','#d06b24','#d06b24',1.4,.4]],
    cats=cava2MesclaVisibilidade(defs.map(([value,color,stroke,weight,fill])=>({value,label:value,color,
      stroke,weight,dash:'',opacity:1,fill,hatch:'solid',hatchScale:1,visible:true,vis:true,
      count:(feats||[]).filter(f=>f.props?.ELEMENTO===value).length})),L.sym?.cats);
  L.color=pilha?'#9aa0a8':'#c9b18a';L.weight=0;L.fill=.35;
  L.fields=['FID','DESENHO','DESIGN_ID','PROJETO','ELEMENTO','COTA','ROTULO','ORDEM','BANCO','ORIGEM'];
  L.sym={mode:'cat',color:L.color,stroke:L.color,hatch:'solid',hatchScale:1,weight:0,fill:.35,
    dash:'',field:'ELEMENTO',classes:[],cats,ramp:'amber'};
  L.labelField='ROTULO';L.lbl={...(L.lbl||defaultLabelCfg()),font:'Signika, sans-serif',style:'normal',
    size:13,color:pilha?'#333c48':'#8a4b1e',halo:'#f6f4ee',haloW:1.6,place:'center',anchor:'middle',
    onMap:true,unique:true,rep:0};
  L.clsOpen=true;L._cava2Managed=true;L._cava2StyleVersion=2;
}

function camadaDoDesenho(id){
  return (S.layers||[]).find(L=>String(L._cava2DesignId||'')===String(id||'')&&L.gtype==='line')||null;
}
function camadaPreenchimentoDoDesenho(id){
  return (S.layers||[]).find(L=>String(L._cava2DesignId||'')===String(id||'')&&L.gtype==='polygon')||null;
}
function camadaPreenchimentoCorteDoDesenho(id){
  return (S.layers||[]).find(L=>String(L._cava2CutFillOf||'')===String(id||''))||null;
}
function nomeCamadaPreenchimento(d){return `${nomeCamada(d)} · preenchimento e rampas`;}
function nomeCamadaPreenchimentoCorte(d){return `${nomeCamada(d)} · preenchimento cortado pelo MDT`;}
function cava2OrdenaLinhaSobrePreenchimento(L,F){
  if(!L||!F)return;
  const li=(S.layers||[]).indexOf(L),fi=(S.layers||[]).indexOf(F),pos=Math.max(0,Math.min(li<0?1e9:li,fi<0?1e9:fi));
  S.layers=(S.layers||[]).filter(q=>q!==L&&q!==F);S.layers.splice(Math.min(pos,S.layers.length),0,L,F);
  const kl=`L:${L.id}`,kf=`L:${F.id}`,st=(S.stack||[]),idx=Math.max(0,st.indexOf(kl)>=0?st.indexOf(kl):(st.indexOf(kf)>=0?st.indexOf(kf):0));
  S.stack=st.filter(k=>k!==kl&&k!==kf);S.stack.splice(Math.min(idx,S.stack.length),0,kl,kf);
  if(typeof zApply==='function')zApply();
}

/* A versão Recortada só muda por um novo recorte explícito. A camada
   `_cava2CutOf` continua reservada para a interseção dinâmica da Bruta. */
function cava2CopiaAparencia(origem,destino){
  if(!origem||!destino)return destino;
  destino.color=origem.color;destino.weight=origem.weight;destino.fill=origem.fill;
  destino.sym=clone(origem.sym);destino.lbl=clone(origem.lbl);
  destino.labelField=origem.labelField||'';
  destino.labelFields=Array.isArray(origem.labelFields)?origem.labelFields.slice():null;
  destino.clsOpen=!!origem.clsOpen;destino.attrFilter=clone(origem.attrFilter)||null;
  return destino;
}
function cava2OrdenaCorteCongelado(d,camadas){
  camadas=(camadas||[]).filter(Boolean);if(!camadas.length)return;
  try{if(typeof stackSync==='function')stackSync();}catch(e){}
  const novas=new Set(camadas.map(L=>String(L.id))),chaves=camadas.map(L=>`L:${L.id}`);
  S.stack=(S.stack||[]).filter(k=>!chaves.includes(k));
  let ancora=-1;
  for(let i=0;i<S.stack.length;i++){
    const m=/^L:(.+)$/.exec(S.stack[i]);if(!m)continue;
    const L=(S.layers||[]).find(q=>String(q.id)===m[1]);if(!L||novas.has(String(L.id)))continue;
    if(String(L._cava2DesignId||'')===String(d.id)||String(L._cava2CutOf||'')===String(d.id)||
       String(L._cava2CutFillOf||'')===String(d.id)||String(L._cava2CutSnapshotOf||'')===String(d.id))ancora=i;
  }
  S.stack.splice(ancora+1,0,...chaves);
  const ordem=new Map(S.stack.map((k,i)=>[k,i])),anterior=new Map((S.layers||[]).map((L,i)=>[L.id,i]));
  S.layers.sort((a,b)=>(ordem.get(`L:${a.id}`)??1e9)-(ordem.get(`L:${b.id}`)??1e9)||
    (anterior.get(a.id)??0)-(anterior.get(b.id)??0));
  try{if(typeof zApply==='function')zApply();}catch(e){}
}
function cava2PublicaMdtRecortado(d,source,grid){
  if(saidaSuprimida(d,'cutSurface'))return null;
  let R=S.rasters.find(r=>r.id===d.resultadoCorte?.surfaceId);
  if(!R){R={id:rid++,overlay:null,groupId:camadaDoDesenho(d.id)?.groupId??null};S.rasters.push(R);}
  Object.assign(R,{name:`${d.nome} — MDT recortado · 0,20 m`,d:grid,crs:d.crs||S.workCRS,
    quantity:'elevation',unit:'m',visible:true,style:{mode:'hipso_hs',opacity:1},
    src:{kind:'cava2-clipped',designId:d.id,sourceRasterId:source.id,sourceName:source.name,
      sourceCellSize:source.d.cs,cellSize:.2,volumes:grid.cutVolume,generatedAt:new Date().toISOString()},
    _v3:{papel:d.tipo==='pilha'?'dce':'cava',cor:d.tipo==='pilha'?'#a6a3a0':'#b99262'}});
  if(typeof placeProductAbove==='function')placeProductAbove(R,source);
  renderRaster(R);return R;
}
function cava2CongelaCorte(d,R,C,CF){
  if(!d||!C||(C.features||[]).length===0)return null;
  if(saidaSuprimida(d,'cutLine'))return null;
  const anterior=camadasResultadoCava(d),original=camadaDoDesenho(d.id),nome=`${d.nome} — Recortada`,
    corteId=d.resultadoCorte?.id||`cava2-cut-${Date.now().toString(36)}-${(++estado.seq).toString(36)}`,
    grupo=original?.groupId??C.groupId??null,
    comum={crs:d.crs||C.crs||S.workCRS,fields:clone(C.fields||[]),features:clone(C.features||[])
      .filter(f=>['Interseção','Crista','Pé','Rampa','Retorno'].includes(f.props?.ELEMENTO))
      .map((f,i)=>({...f,props:{...f.props,FID:i+1,ELEMENTO:f.props.ELEMENTO==='Retorno'?'Rampa':f.props.ELEMENTO}}))};
  const L=anterior.line||addLayer({sourceLayer:C,name:nome,gtype:'line',...comum,color:C.color||'#111111',
    src:'Área 2D · Cava2 · corte congelado'});
  Object.assign(L,comum,{name:nome});
  delete L._cava2DesignId;delete L._cava2CutOf;delete L._cava2CutFillOf;
  cava2CopiaAparencia(C,L);L.groupId=grupo;L.visible=true;L._cava2Kind=d.tipo;
  L.sym.cats=L.sym.cats.filter(c=>['Interseção','Crista','Pé','Rampa'].includes(c.value));
  for(const c of L.sym.cats)c.count=L.features.filter(f=>f.props.ELEMENTO===c.value).length;
  L._cava2CutSnapshotOf=d.id;L._cava2CutSnapshotId=corteId;L._cava2CutZ=n(d.baseZ);
  L._cava2SnapshotRole='line';L._cava2MdtId=R?.id??null;L._cava2Managed=false;
  if(anterior.fill)removeCamadaGerada(anterior.fill);
  if(typeof drawLayer==='function')drawLayer(L);
  cava2OrdenaCorteCongelado(d,[L]);S.activeId=L.id;
  return {line:L,fill:null,id:corteId,name:nome};
}

function publicaDesenho(d,design,silencioso){
  if(!d||d.somenteRecortada)return null;
  const feats=feicoesCartograficasDoDesign(design,n(d.baseZ),d),areas=feicoesPreenchimentoDoDesign(design,n(d.baseZ),d),
    ativo=S.activeId;let F=camadaPreenchimentoDoDesenho(d.id),L=camadaDoDesenho(d.id),criou=false;
  if(!F&&areas.length&&!saidaSuprimida(d,'rawFill')){
    F=addLayer({name:nomeCamadaPreenchimento(d),gtype:'polygon',features:areas,
      fields:['FID','DESENHO','DESIGN_ID','PROJETO','ELEMENTO','COTA','ROTULO','ORDEM','BANCO','ORIGEM'],
      crs:d.crs||S.workCRS,color:d.tipo==='pilha'?'#9aa0a8':'#c9b18a',src:'Área 2D · Cava2 · estilo'});
    F._cava2DesignId=d.id;F._cava2Role='fill';criou=true;
  }else if(F){F.features=areas;F.crs=d.crs||F.crs||S.workCRS;F.src='Área 2D · Cava2 · estilo';F.name=nomeCamadaPreenchimento(d);}
  if(F){F._cava2Kind=d.tipo;F._cava2Engine=clone(d.engine);estiloCamadaPreenchimento(F,areas);}
  if(!L&&!feats.length){if(F&&typeof drawLayer==='function')drawLayer(F);return null;}
  if(!L){
    L=addLayer({name:nomeCamada(d),gtype:'line',features:feats,
      fields:['FID','DESENHO','DESIGN_ID','PROJETO','ELEMENTO','COTA','ROTULO','ORDEM','BANCO','ORIGEM'],
      crs:d.crs||S.workCRS,color:'#111111',src:'Área 2D · Cava2'});
    L._cava2DesignId=d.id;L._cava2Role='line';criou=true;
  }else{L.features=feats;L.crs=d.crs||L.crs||S.workCRS;L.src='Área 2D · Cava2';L.name=nomeCamada(d);}
  L._cava2Kind=d.tipo;L._cava2Engine=clone(d.engine);estiloCamada(L,feats);
  if(F&&criou)cava2OrdenaLinhaSobrePreenchimento(L,F);
  if(F&&typeof drawLayer==='function')drawLayer(F);if(typeof drawLayer==='function')drawLayer(L);
  if(ativo!=null&&S.layers.some(x=>x.id===ativo))S.activeId=ativo;
  if(!silencioso&&typeof refreshUI==='function')refreshUI();
  return L;
}

function designRuntime(d){
  const A=api();if(!d||!A)return null;
  const entradas=(typeof A.alvos==='function'?A.alvos():Object.keys(A.objs||{}))
    .filter(k=>k===d.tipo||k.startsWith(d.tipo+'#'))
    .map((key,index)=>({key,index,o:A.objs[key],design:A.objs[key]?.design})).filter(q=>q.design);
  if(!entradas.length)return null;
  const primeiro=entradas[0].design,ultimo=entradas.at(-1).design,
    raios=entradas.map(q=>+q.design.raioMinReal).filter(Number.isFinite);
  return {...primeiro,
    aneis:entradas.flatMap(q=>(q.design.aneis||[]).map(a=>({...a,_bloco:q.key,_blocoIndice:q.index}))),
    corredores:entradas.flatMap(q=>(q.design.corredores||[]).map(c=>({...c,_bloco:q.key,_blocoIndice:q.index}))),
    limites:entradas.flatMap(q=>{
      const partes=q.design.contornoExterior?.partes;
      if(Array.isArray(partes)&&partes.length)return partes.filter(P=>Array.isArray(P)&&P.length>=2)
        .map((P,parte)=>({key:q.key,index:q.index,parte,P,aberta:true,z0:n(q.o?.z0)}));
      const P=q.o?.base;return Array.isArray(P)&&P.length>=3?[{key:q.key,index:q.index,P,z0:n(q.o?.z0)}]:[];
    }),
    _blocos:entradas.map(q=>({key:q.key,index:q.index,z0:n(q.o?.z0),base:q.o?.base||null,design:q.design,
      hasContinuation:entradas.some(c=>c.o?.paiDe===q.key)})),
    avisos:entradas.flatMap(q=>q.design.avisos||[]),
    curvasAgudas:entradas.flatMap(q=>q.design.curvasAgudas||[]),
    raioMinReal:raios.length?Math.min(...raios):null,
    nBancos:entradas.reduce((s,q)=>s+n(q.design.nBancos),0),
    areaBase:n(primeiro?.areaBase),areaFinal:n(ultimo?.areaFinal),
    vol:entradas.reduce((s,q)=>s+n(q.design.vol),0),
    rampaDesenv:entradas.reduce((s,q)=>s+n(q.design.rampaDesenv),0)};
}

function mostraBrutaSemCorte(d,mensagem,erro){
  const L=camadaDoDesenho(d?.id),F=camadaPreenchimentoDoDesenho(d?.id),C=camadaCorteDoDesenho(d?.id),
    CF=camadaPreenchimentoCorteDoDesenho(d?.id);
  if(L){L.visible=true;if(typeof drawLayer==='function')drawLayer(L);}
  if(F){F.visible=true;if(typeof drawLayer==='function')drawLayer(F);}
  if(C){C.visible=false;if(typeof drawLayer==='function')drawLayer(C);}
  if(CF){CF.visible=false;if(typeof drawLayer==='function')drawLayer(CF);}
  if(mensagem)status(mensagem,erro);return null;
}

/* Publica somente o contato calculado entre a superfície de projeto e o
   MDT. Componentes abertas permanecem abertas, inclusive junto a NoData. */
function cava2RecortaSuperficieNoMdt(src,g,modoUp,passo,guardarAreas){
  const feats=[],linhas=[];
  for(const f of src||[]){
    const e=String(f.props?.ELEMENTO||''),ring=cava2GeomFechada((f.geom||[]).map(p=>({x:p[0],y:p[1]})));
    if(['Crista','Pé'].includes(e)&&ring.length>=4){
      ring.pop();linhas.push({ring,z:+f.props.COTA});
    }
    if(f.geom?.length>1)feats.push(...(cavaRecortaFeicaoNoMdt(f,g,modoUp,passo)||[]));
  }
  const area=r=>{const o=r[0];let a=0;for(let i=1;i<r.length-1;i++)
    a+=(r[i][0]-o[0])*(r[i+1][1]-o[1])-(r[i][1]-o[1])*(r[i+1][0]-o[0]);return Math.abs(a);};
  linhas.sort((a,b)=>(modoUp?a.z-b.z:b.z-a.z)||area(b.ring)-area(a.ring));
  const stats={},poligonos={surface:[],floor:[]},inter=GeoMineCavaTerrain.intersect(linhas,g,{stats,keepAbove:modoUp,
    onPolygon:guardarAreas?(p,t)=>poligonos[t].push(p):null}).map(f=>({geom:f.geom,zg:f.zg,multi:false,
    props:{TIPO:'Interseção cava × terreno',BANCO:null,COTA:null,CLASSE:'daylight',
      METODO:'superfície de projeto × MDT — amostragem por célula',
      TOPOLOGIA:Math.hypot(f.geom[0][0]-f.geom.at(-1)[0],f.geom[0][1]-f.geom.at(-1)[1])<1e-6?'fechada':'aberta'}}));
  return {feats:feats.concat(inter),stats,poligonos};
}
function cava2RecortaLimitesNoMdt(design,d,R,g,modoUp,passo){
  if(typeof cavaRecortaFeicaoNoMdt!=='function')return [];
  const src=feicoesCartograficasDoDesign(design,n(d.baseZ),d)
    .filter(f=>f.props?.ELEMENTO==='Limite exterior');let fid=900001;
  return src.flatMap(f=>(cavaRecortaFeicaoNoMdt(f,g,modoUp,passo)||[]).map(q=>({...q,
    props:{...(f.props||{}),...(q.props||{}),FID:fid++,DESENHO:d.nome,DESIGN_ID:d.id,
      PROJETO:tipoNome(d.tipo),ELEMENTO:'Limite exterior',CLASSE:'rb31-limite',MDT:R.name||'MDT',
      ORIGEM:'Área 2D · Cava2 · limite exterior cortado pelo MDT'}})));
}
function cava2AreasCortadasNoMdt(design,d,R,g,modoUp,passo,poligonos){
  const out=[];let fid=1;
  const adiciona=(partes,props)=>{
    const validas=GeoMineCavaTerrain.mergePolygons(partes,g);if(!validas.length)return;
    out.push({geom:validas.map(p=>p.map(q=>q.slice(0,2)).concat([p[0].slice(0,2)])),
      zg:validas.map(p=>p.map(q=>q[2]).concat([p[0][2]])),multi:true,
      props:{...cava2Props(d,{COTA:null,ROTULO:'',ORDEM:1,BANCO:null,MDT:R.name||'MDT',
        ORIGEM:'Área 2D · Cava2 · superfície recortada pelo MDT',...props}),FID:fid++}});
  };
  adiciona(poligonos?.surface||[],{ELEMENTO:'Área projetada',CLASSE:'rb31-area'});
  adiciona(poligonos?.floor||[],{ELEMENTO:modoUp?'Topo':'Fundo',CLASSE:modoUp?'rb31-topo':'rb31-fundo'});
  for(const f of feicoesPreenchimentoDoDesign(design,n(d.baseZ),d).filter(f=>f.props?.ELEMENTO==='Rampa')){
    const points=f.geom.map((p,i)=>[p[0],p[1],f.zg?.[i]??f.props.COTA]);
    adiciona(GeoMineCavaTerrain.clipPolygon(points,g,{keepAbove:modoUp}),{...f.props,ORDEM:3});
  }
  return out;
}
function cava2PublicaPreenchimentoCortado(d,R,areas){
  if(saidaSuprimida(d,'cutFill'))return null;
  let F=camadaPreenchimentoCorteDoDesenho(d.id);
  if(!areas.length){if(F)removeCamadaGerada(F);return null;}
  if(!F){
    F=addLayer({sourceLayer:camadaPreenchimentoDoDesenho(d.id)||camadaDoDesenho(d.id)||R,name:nomeCamadaPreenchimentoCorte(d),gtype:'polygon',features:areas,
      fields:['FID','DESENHO','DESIGN_ID','PROJETO','ELEMENTO','COTA','ROTULO','ORDEM','BANCO','MDT','ORIGEM'],
      crs:d.crs||S.workCRS,color:d.tipo==='pilha'?'#9aa0a8':'#c9b18a',
      src:'Área 2D · Cava2 · preenchimento cortado pelo MDT'});
    F._cava2CutFillOf=d.id;F._cava2Role='cut-fill';
  }else{F.features=areas;F.crs=d.crs||F.crs||S.workCRS;F.name=nomeCamadaPreenchimentoCorte(d);}
  F._cava2MdtId=R.id;F._cava2Kind=d.tipo;F._cava2Managed=true;F.visible=true;
  estiloCamadaPreenchimento(F,areas);
  for(const c of F.sym.cats)c.weight=0;
  return F;
}
function publicaCorteMdt(d,design,silencioso,forcar,finalizar){
  const finalizado=!!(finalizar||d?.cutMdt),R=rasterDoDesenho(d),g=R?.d;
  if(!d||!g)return mostraBrutaSemCorte(d,'Escolha um MDT válido para calcular a interseção.',true);
  if(typeof GeoMineCavaTerrain?.intersect!=='function')
    return mostraBrutaSemCorte(d,'O algoritmo de interseção da cava não está disponível.',true);
  if(saidaSuprimida(d,'intersection'))return null;
  const hash=hashCorteMdt(d,R,finalizado),existente=camadaCorteDoDesenho(d.id),
    fillCorte=camadaPreenchimentoCorteDoDesenho(d.id);
  if(!forcar&&existente&&estado.cutHashes[d.id]===hash){
    const bruta=camadaDoDesenho(d.id),fill=camadaPreenchimentoDoDesenho(d.id);
    if(bruta){bruta.visible=!finalizado;drawLayer(bruta);}
    if(fill){fill.visible=!finalizado;drawLayer(fill);}
    if(fillCorte){fillCorte.visible=finalizado;drawLayer(fillCorte);}
    existente.visible=true;drawLayer(existente);return existente;
  }
  const src=feicoesFechadasParaIntersecao(design,n(d.baseZ),d);
  if(!src.length){
    if(existente)removeCamadaGerada(existente);if(fillCorte)removeCamadaGerada(fillCorte);estado.cutHashes[d.id]=null;
    return mostraBrutaSemCorte(d,silencioso?'':`${d.nome}: desenhe primeiro um limite fechado.`,!silencioso);
  }
  const passo=Math.min(.75,Math.abs(n(g.cs,.5))*.5,Math.abs(n(g.csy,g.cs))*.5),modoUp=d.tipo==='pilha';let q;
  try{q=cava2RecortaSuperficieNoMdt(feicoesCompativeisCorte(src),g,modoUp,passo,finalizado);}
  catch(e){console.error('Interseção Área 2D × MDT',e);return mostraBrutaSemCorte(d,
    `Falha ao calcular a interseção com “${R.name}”: ${e.message||e}`,true);}
  const normalizadas=normalizaCorteMdt(q?.feats,d,R);
  let todas=normalizadas.filter(f=>f.props?.ELEMENTO!=='Interseção');
  const inter=normalizadas.filter(f=>f.props?.ELEMENTO==='Interseção');
  if(!inter.length&&(!finalizado||!todas.length)){
    if(existente)removeCamadaGerada(existente);if(fillCorte)removeCamadaGerada(fillCorte);estado.cutHashes[d.id]=null;
    return mostraBrutaSemCorte(d,`${d.nome}: a superfície desenhada não encontra cotas válidas de “${R.name}” nesta extensão.`,!silencioso);
  }
  todas=todas.concat(inter);
  const feats=finalizado?todas:inter,ativo=S.activeId;let C=existente;
  if(!C){
    C=addLayer({sourceLayer:camadaDoDesenho(d.id)||R,name:nomeCorteMdt(d,R),gtype:'line',features:feats,
      fields:['FID','DESENHO','DESIGN_ID','PROJETO','ELEMENTO','COTA','ROTULO','ORDEM','BANCO','MDT','ORIGEM'],
      crs:d.crs||S.workCRS,color:'#000000',src:'Área 2D · Cava2 · interseção entre superfícies'});
    C._cava2CutOf=d.id;
  }else{C.features=feats;C.crs=d.crs||C.crs||S.workCRS;C.name=nomeCorteMdt(d,R);
    C.src=finalizado?'Área 2D · Cava2 · cava cortada':'Área 2D · Cava2 · interseção entre superfícies';}
  C._cava2MdtId=R.id;C._cava2Kind=d.tipo;C._cava2Managed=true;C._cava2CutFinalized=finalizado;
  C._cava2IntersectionPreview=!finalizado;C.visible=true;estiloCamada(C,feats);
  const L=camadaDoDesenho(d.id),F=camadaPreenchimentoDoDesenho(d.id),CF=camadaPreenchimentoCorteDoDesenho(d.id);
  if(finalizado){
    const ramps=feicoesPreenchimentoDoDesign(design,n(d.baseZ),d).filter(f=>['Rampa','Retorno'].includes(f.props?.ELEMENTO))
      .flatMap(f=>GeoMineCavaTerrain.clipPolygon(f.geom.map((p,i)=>[p[0],p[1],f.zg?.[i]??f.props.COTA]),g,{keepAbove:modoUp}));
    C._cava2CutSurface={surface:q.poligonos.surface,floor:q.poligonos.floor,ramps};
  }
  if(L){L.visible=!finalizado;drawLayer(L);}if(F){F.visible=!finalizado;drawLayer(F);}
  if(CF){CF.visible=finalizado;drawLayer(CF);}drawLayer(C);if(CF)cava2OrdenaLinhaSobrePreenchimento(C,CF);
  if(ativo!=null&&S.layers.some(x=>x.id===ativo))S.activeId=ativo;
  estado.cutHashes[d.id]=hash;if(!silencioso&&typeof refreshUI==='function')refreshUI();return C;
}

function limpaCamadasDoDesenho(){
  clearTimeout(estado.syncTimer);estado.syncTimer=0;const d=desenhoAtual();if(!d)return false;
  d.engine=leEstadoMotor();estado.cutHashes[d.id]=null;
  const removidas=[camadaDoDesenho(d.id),camadaPreenchimentoDoDesenho(d.id),camadaCorteDoDesenho(d.id),
    camadaPreenchimentoCorteDoDesenho(d.id)].filter(Boolean);
  removidas.forEach(removeCamadaGerada);salvaRegistroLocal();if(typeof refreshUI==='function')refreshUI();atualizaContexto();
  status(`${d.nome}: desenho e ${removidas.length} camada(s) gerada(s) removidos.`);
  try{if(S._view==='v3d'&&typeof v3Auto==='function')v3Auto();}catch(e){}return true;
}
function renomeiaAtual(nome){
  const d=desenhoAtual();if(!d)return;d.nome=nomeUnico(nome||proximoNome(d.tipo),d.id);
  const e=document.getElementById('cava2Name');if(e)e.value=d.nome;
  const L=camadaDoDesenho(d.id),F=camadaPreenchimentoDoDesenho(d.id),C=camadaCorteDoDesenho(d.id),
    CF=camadaPreenchimentoCorteDoDesenho(d.id);
  if(L)L.name=nomeCamada(d);if(F)F.name=nomeCamadaPreenchimento(d);if(C)C.name=nomeCorteMdt(d,rasterDoDesenho(d));
  if(CF)CF.name=nomeCamadaPreenchimentoCorte(d);
  const resultado=camadasResultadoCava(d);if(resultado.line)resultado.line.name=`${d.nome} — Recortada`;
  if(resultado.fill)resultado.fill.name=`${d.nome} — Recortada · áreas`;
  if(typeof refreshUI==='function')refreshUI();renderAbas();salvaRegistroLocal();status(`Desenho renomeado para “${d.nome}”.`);
}
function sincronizaCamadas(manual){
  clearTimeout(estado.syncTimer);estado.syncTimer=0;const A=api(),d=desenhoAtual();
  if(!A||!d){if(manual)status('A área 2D ainda está carregando.',true);return false;}
  if(d.somenteRecortada){atualizaContexto();return true;}
  salvaAtual(false);const design=designRuntime(d),L=publicaDesenho(d,design,true),R=rasterDoDesenho(d),
    C=R?publicaCorteMdt(d,design,true,false,!!d.cutMdt):null;
  if(manual)reconstroiCamadasAusentes();if(typeof refreshUI==='function')refreshUI();
  try{if(typeof layoutSeVisivel==='function')layoutSeVisivel();}catch(e){}
  try{if(S._view==='v3d'&&typeof v3Auto==='function')v3Auto();}catch(e){}
  const total=L?.features?.length||0,ni=C?.features?.filter(f=>f.props?.ELEMENTO==='Interseção').length||0;
  salvaRegistroLocal();sincronizaSeletorMdtMotor(d,null,{redraw:false,force:!!manual});
  estado.outputKey=null;atualizaContexto();
  status(total?`${d.nome}: estilo da aba Cava publicado no Mapa 2D/Layout · ${ni} interseção(ões) dinâmica(s)${d.cutMdt?' · corte final ativo':''}.`:
    `${d.nome}: desenhe um limite fechado para criar a camada.`,manual&&!total);return true;
}
function reconstroiCamadasAusentes(){
  const ativoId=estado.desenhoId,ativo=desenhoAtual();
  let recarregou=false;
  for(const d of estado.desenhos){
    const faltaBruta=!camadaDoDesenho(d.id),faltaFill=!saidaSuprimida(d,'rawFill')&&!camadaPreenchimentoDoDesenho(d.id),
      faltaIntersecao=!saidaSuprimida(d,'intersection')&&!!d.mdtId&&!camadaCorteDoDesenho(d.id),
      faltaFillCorte=!saidaSuprimida(d,'cutFill')&&!!d.cutMdt&&!camadaPreenchimentoCorteDoDesenho(d.id);
    if((!faltaBruta&&!faltaFill&&!faltaIntersecao&&!faltaFillCorte)||!d.engine)continue;
    recarregou=true;carregaMotor(d);const design=designRuntime(d);if(faltaBruta||faltaFill)publicaDesenho(d,design,true);
    if(d.mdtId)publicaCorteMdt(d,design,true,true,!!d.cutMdt);
  }
  estado.desenhoId=ativoId;if(recarregou&&ativo)carregaMotor(ativo);configuraMdtNoMotor();
}
function migraEstado(st){
  if(st?.version===2&&Array.isArray(st.designs))return clone(st);
  if(!st&&typeof S!=='undefined'){
    const layers=(S.layers||[]).filter(L=>L._cava2DesignId&&L.gtype==='line');
    if(layers.length){
      const designs=layers.map(L=>({id:L._cava2DesignId,nome:String(L.name||'Desenho 2D').replace(/^(Cava|DCE)\s+—\s+/i,''),
        tipo:L._cava2Kind==='pilha'?'pilha':'cava',engine:clone(L._cava2Engine)||null,baseZ:0,
        crs:L.crs||S.workCRS,fonte:null,criadoEm:new Date().toISOString()}));
      return {version:2,activeId:designs[0].id,seq:estado.seq,painelFechado:true,designs};
    }
  }
  const designs=[],e=clone(st?.engine)||null;
  if(e?.bases?.cava)designs.push({...novoRegistro('cava','Cava 1'),engine:clone(e),baseZ:n(st?.baseZ),crs:st?.crs||S.workCRS,fonte:clone(st?.fonte)||null});
  if(e?.bases?.pilha)designs.push({...novoRegistro('pilha','DCE 1'),engine:clone(e),baseZ:n(st?.baseZ),crs:st?.crs||S.workCRS,fonte:clone(st?.fonte)||null});
  if(!designs.length)designs.push(novoRegistro('cava','Cava 1'));
  return {version:2,activeId:designs[0].id,seq:estado.seq,painelFechado:true,designs};
}


function camadasResultadoCava(d){
  const id=d?.resultadoCorte?.id,ls=id?(S.layers||[]).filter(L=>L._cava2CutSnapshotId===id):[];
  return {line:ls.find(L=>L._cava2SnapshotRole==='line'),fill:ls.find(L=>L._cava2SnapshotRole==='fill')};
}
function aplicaVarianteCava(d){
  const A=api(),D=doc2D();if(!d||!A||!D)return;
  const cut=d.variante==='recortada'&&resultadoCavaDisponivel(d),key=`${d.id}/${cut}/${d.resultadoCorte?.id||''}`;
  if(estado.outputKey!==key){
    estado.outputKey=key;
    for(const L of S.layers||[]){
      let show;
      if(L._cava2DesignId===d.id||L._cava2CutOf===d.id)show=!cut;
      if(L._cava2CutFillOf===d.id)show=false;
      if(L._cava2CutSnapshotOf===d.id)show=cut&&L._cava2CutSnapshotId===d.resultadoCorte?.id;
      if(show!==undefined&&L.visible!==show){L.visible=show;if(typeof drawLayer==='function')drawLayer(L);}
    }
    const surface=S.rasters.find(r=>r.id===d.resultadoCorte?.surfaceId),source=rasterDoDesenho(d);
    if(surface){surface.visible=cut;if(surface.overlay)surface.overlay.setOpacity(cut?(surface.style?.opacity??1):0);}
    if(source&&source!==surface&&d.resultadoCorte){source.visible=cut?false:d.resultadoCorte.sourceVisible!==false;
      if(source.overlay)source.overlay.setOpacity(source.visible?(source.style?.opacity??1):0);}
    if(cut){A.sel=null;A.setTool('mover');S.activeId=camadasResultadoCava(d).line?.id??S.activeId;}
  }
  D.body.classList.toggle('ccmgis-cut-preview',cut);
  const liberados=new Set(['t_mover','t_cava','t_pilha','b_ajustar','b_png','b_dxf','ccmgisPainelCorner','ccmgisEmpolamento',...(!d.somenteRecortada?['ccmgis_cortar_cava']:[])]);
  for(const el of D.querySelectorAll('button,input,select,textarea')){
    if(liberados.has(el.id)||el.closest('.cava-number')?.querySelector('#ccmgisEmpolamento'))continue;
    if(cut){if(el.dataset.cutDisabled==null)el.dataset.cutDisabled=el.disabled?'1':'0';el.disabled=true;}
    else if(el.dataset.cutDisabled!=null){el.disabled=el.dataset.cutDisabled==='1';delete el.dataset.cutDisabled;}
  }
  if(!D.documentElement.dataset.cutGuard){
    D.documentElement.dataset.cutGuard='1';
    D.addEventListener('keydown',e=>{
      if(desenhoAtual()?.variante!=='recortada')return;
      if(e.target.closest?.('.cava-number')?.querySelector('#ccmgisEmpolamento'))return;
      if((e.ctrlKey||e.metaKey)&&!['z','y'].includes(e.key.toLowerCase()))return;
      if(e.key!=='Tab'){e.preventDefault();e.stopImmediatePropagation();}
    },true);
    D.addEventListener('click',e=>{
      if(desenhoAtual()?.variante!=='recortada')return;
      if(e.target.closest('#b_dxf')){e.preventDefault();e.stopImmediatePropagation();exportaDxfRecortado();}
    },true);
  }
}
function arquivoCava(d){return String(d.nome||'Cava').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')+'.ccmgis';}
function comandoVetorialCava(command){
  if(S._view!=='cava2')return false;
  if(['simplif','densif','suaviz'].includes(command))return editaGeometriaCava(command);
  const d=desenhoAtual(),A=api();
  if(!d||!A)return true;
  if(d.variante==='recortada'){toast('Abra a subaba Bruta para editar o desenho da cava/DCE.');return true;}
  if(command==='undo'||command==='redo'){A[command]();return true;}
  if(['sel','vadd','vdel','vmove'].includes(command)){
    A.activateExternalTool('vertex',d.tipo);
    toast(command==='vadd'?'Toque no + de um segmento para inserir um vértice.':
      command==='vdel'?'Toque duas vezes no vértice para apagá-lo.':'Selecione a linha e arraste seus vértices.');
  }
  return true;
}
function editaGeometriaCava(command){
  const d=desenhoAtual(),A=api();
  if(!d||!A){toast('Aguarde o carregamento da Cava.');return true;}
  if(d.variante==='recortada'){toast('Abra a subaba Bruta para editar o desenho da cava/DCE.');return true;}
  const names={simplif:'Simplificar',densif:'Densificar',suaviz:'Suavizar'},name=names[command];
  if(!name)return false;
  let target;
  try{
    target=A.vectorEditTarget();
    const projection=proj4(d.crs||S.workCRS).oProj;
    if(projection.projName==='longlat'||Math.abs((projection.to_meter||1)-1)>1e-9)
      throw Error('A Cava precisa de um CRS projetado em metros para editar as linhas.');
  }catch(e){toast(e.message);return true;}
  let bg=document.getElementById('cavaVectorModal');
  if(!bg){
    bg=document.createElement('div');bg.id='cavaVectorModal';bg.className='modal-bg';
    bg.innerHTML=`<div class="modal" style="width:min(420px,94vw)">
      <div class="modal-h"><b id="cavaVectorTitle"></b><div style="flex:1"></div><button class="tbtn" id="cavaVectorClose">Fechar</button></div>
      <div class="modal-b"><div id="cavaVectorTarget" class="hout"></div>
      <label class="field" for="cavaVectorValue" id="cavaVectorLabel"></label><input type="number" id="cavaVectorValue">
      <div class="hint">Linha-base e bancadas vinculadas do bloco selecionado.</div>
      <div id="cavaVectorResult" role="status"></div>
      <button class="tbtn" id="cavaVectorApply" style="width:100%;justify-content:center;margin-top:12px;background:var(--amber);color:#1a1206"></button></div></div>`;
    document.body.appendChild(bg);
    document.getElementById('cavaVectorClose').onclick=()=>bg.classList.remove('on');
  }
  const value=document.getElementById('cavaVectorValue'),result=document.getElementById('cavaVectorResult'),
    button=document.getElementById('cavaVectorApply'),before=A.estadoAtual(),block=target.alvo.split('#')[1];
  document.getElementById('cavaVectorTitle').textContent=`${name} · ${d.nome}`;
  document.getElementById('cavaVectorTarget').textContent=`${block?'Bloco '+(+block+1):'Bloco inicial'} · ${target.points.length} vértices`;
  document.getElementById('cavaVectorLabel').textContent=command==='simplif'?'Tolerância (m)':command==='densif'?'Distância máxima entre vértices (m)':'Iterações';
  value.value=command==='densif'?5:command==='simplif'?.5:1;
  value.min=command==='suaviz'?1:.001;value.max=command==='suaviz'?5:'';value.step=command==='suaviz'?1:.1;
  result.textContent='';button.textContent=name;button.disabled=false;
  button.onclick=async()=>{
    button.disabled=true;result.textContent='Atualizando o desenho…';
    try{
      const amount=Number(value.value.replace(',','.'));
      if(!Number.isFinite(amount)||amount<=0||(command==='suaviz'&&(!Number.isInteger(amount)||amount>5)))throw Error('Informe um valor válido.');
      await new Promise(resolve=>setTimeout(resolve,20));
      if(S._view!=='cava2'||desenhoAtual()!==d||api()!==A||A.estadoAtual()!==before)throw Error('O desenho mudou. Feche e abra o comando novamente.');
      const points=target.points,layer={gtype:'polygon',crs:d.crs||S.workCRS},feature={geom:points.map(p=>[p.x,p.y]),props:{}};
      let output;
      if(command==='simplif')output=GeoMineSimplify.simplifyFeature(layer,feature,amount).feature.geom;
      else if(command==='suaviz'){
        if(points.length*2**amount>20000)throw Error('Reduza as iterações: a linha-base ultrapassaria 20 mil vértices.');
        output=GeoMineSmooth.smoothFeature(layer,feature,amount).feature.geom;
      }else{
        const counts=points.map((p,i)=>{const q=points[(i+1)%points.length];return Math.max(1,Math.ceil(Math.hypot(q.x-p.x,q.y-p.y)/amount));});
        if(counts.reduce((s,n)=>s+n,0)>20000)throw Error('Aumente a distância: a linha-base ultrapassaria 20 mil vértices.');
        output=[];points.forEach((p,i)=>{const q=points[(i+1)%points.length],n=counts[i];
          for(let j=0;j<n;j++)output.push([p.x+(q.x-p.x)*j/n,p.y+(q.y-p.y)*j/n]);});
      }
      const change=A.replaceBasePoints(target.alvo,output.map(p=>({x:p[0],y:p[1]})));
      salvaAtual(false);window.GeoMineWorkspaceResume?.request();
      const message=`${d.nome} · ${name}: ${change.before} → ${change.after} vértices${change.changed?' · bancadas atualizadas':''}.`;
      toast(message);cmdLog(message,'info');bg.classList.remove('on');estado.frame.focus();
    }catch(e){result.textContent=e.message||String(e);}
    finally{button.disabled=false;}
  };
  bg.classList.add('on');value.focus();value.select();return true;
}
function projetoDaCava(d){
  salvaAtual(false);
  d.exportProjectId=d.exportProjectId||`cava-${crypto.randomUUID()}`;
  const layers=[camadasResultadoCava(d).line].filter(Boolean),surfaceId=d.resultadoCorte?.surfaceId,
    all=projectData({borrowGeometry:true,layerIds:layers.map(L=>L.id),rasterIds:[surfaceId]}),
    savedDesign={...clone(d),somenteRecortada:true,engine:null,mdtId:surfaceId,variante:'recortada',
      resultadoCorte:{...clone(d.resultadoCorte),engine:null}},
    data={app:'ALAGIS',v:1,savedAt:new Date().toISOString(),projectId:d.exportProjectId,
      projectFileName:arquivoCava(d),projectMeta:{name:d.nome},workCRS:d.crs||S.workCRS,
      screen:all.screen,groups:[],layers:all.layers.map(L=>({...L,groupId:null})),rasters:all.rasters,
      stack:[],img:null,wms:[],plates:[],cava2:{version:2,activeId:d.id,seq:estado.seq,
        painelFechado:estado.painelFechado,mdtTrabalhoId:surfaceId,designs:[savedDesign]}};
  data.stack=[...data.layers.map(L=>`L:${L.id}`),...(data.rasters||[]).map(R=>`R:${R.id}`)];
  return data;
}
async function salvaArquivoDaCava(d){
  const data=projetoDaCava(d),name=arquivoCava(d),blob=window.projectBlobPorPartes?
    projectBlobPorPartes(data):new Blob([JSON.stringify(data)],{type:'application/x-ccmgis'});
  const result=await download(blob,name,{skipPicker:true,reportResult:true});
  if(result===false||result?.status==='canceled'||result?.status==='failed')throw Error('o navegador não concluiu o envio do arquivo');
  if(desenhoAtual()?.id===d.id)status(`${d.nome}: camada classificada e MDT de 0,20 m · arquivo “${name}” enviado para download.`);
  window.GeoMineWorkspaceResume?.request();return true;
}
function exportaDxfRecortado(){
  const d=desenhoAtual(),L=camadasResultadoCava(d).line;if(!L)return;
  const lines=['0','SECTION','2','HEADER','9','$INSUNITS','70','6','0','ENDSEC','0','SECTION','2','ENTITIES'];
  for(const f of L.features||[]){
    const parts=f.multi?f.geom:[f.geom],zs=f.multi?f.zg:[f.zg],layer=String(f.props?.ELEMENTO||'Cava').replace(/[^a-zA-Z0-9_]/g,'_');
    parts.forEach((pts,j)=>{
      lines.push('0','POLYLINE','8',layer,'66','1','70','8');
      pts.forEach((p,i)=>lines.push('0','VERTEX','8',layer,'10',String(p[0]),'20',String(p[1]),'30',String(zs[j]?.[i]??f.props?.COTA??0),'70','32'));
      lines.push('0','SEQEND');
    });
  }
  lines.push('0','ENDSEC','0','EOF');download(new Blob([lines.join('\r\n')],{type:'application/dxf'}),`${d.nome} — Recortada.dxf`);
}

window.CCMGISCava2={open:abre,close:fecha,importSelected:importaSelecionada,
  exportToMap:()=>sincronizaCamadas(true),syncLayers:()=>sincronizaCamadas(true),snapshot,
  restoreProjectState:aplicaEstadoProjeto,frame:()=>estado.frame,state:estado,
  openMiningMode:abreModoCava,newDesign:criaNovoDesenho,selectDesign:trocaDesenho,
  selectVariant:variante=>trocaDesenho(estado.desenhoId,variante),cutProject:()=>projetoDaCava(desenhoAtual()),
  syncTheme:aplicaTemaNoMotor,syncStyles:agendaContexto,
  editGeometry:editaGeometriaCava,vectorCommand:comandoVetorialCava,
  beforeLayerDelete:preparaExclusaoCamada,onLayerDeleted:removeDesenhoDaCamada,
  restoreLayerDeletion:restauraExclusaoCamada,chooseWorkMdt:selecionaMdtTrabalho,
  beforeRasterDelete:preparaExclusaoRaster,onRasterDeleted:(R,snapshot)=>registraExclusaoSaida(snapshot),
  restoreRasterDeletion:(snapshot,R)=>restauraExclusaoSaida(snapshot),
  canDraw:()=>!!rasterDoDesenho(desenhoAtual()),
  startDrawing:iniciaDesenho,
  cutCurrent:()=>cortaMdtAtual(true),clearActiveCut:removeCorteMdt,requireWorkMdt:exigeMdt,
  _featuresFromDesign:feicoesDoDesign,_fillFeaturesFromDesign:feicoesPreenchimentoDoDesign,_intersectionFeaturesFromDesign:feicoesFechadasParaIntersecao,getFillLayer:id=>camadaPreenchimentoDoDesenho(id),getCutFillLayer:id=>camadaPreenchimentoCorteDoDesenho(id),_reduceContextPath:reduzCaminhoPreservandoForma};
})();
