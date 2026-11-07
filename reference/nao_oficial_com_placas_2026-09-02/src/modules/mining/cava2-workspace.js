/* Área 2D — motor v0.9 encapsulado, com desenhos independentes e camadas 3D. */
(function(){
'use strict';

const CAVA2_V09_SOURCE=__CCMGIS_CAVA2_V09_SOURCE__;
const STORAGE_KEY='ccmgis2DMotorV10';
const REGISTRY_KEY='ccmgis2DDesignRegistryV2';
const IDS_VALORES=['cava_H','cava_banco','cava_face','cava_berma','cava_rampa_larg','cava_rampa_grad',
  'pilha_H','pilha_banco','pilha_face','pilha_berma','pilha_rampa_larg','pilha_rampa_grad'];
const estado={frame:null,ready:false,crs:null,baseZ:0,fonte:null,alvo:'cava',syncTimer:0,
  projetoPendente:undefined,restaurando:false,desenhos:[],desenhoId:null,seq:0,
  painelFechado:true,cutHashes:{}};

function fontePreparada(){
  return String(CAVA2_V09_SOURCE||'')
    .replaceAll('cavaPilhaV02',STORAGE_KEY)
    .replace('<title>Cava &amp; Pilha por Strings — v0.9</title>',
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
function nomeCamada(d){return `${tipoNome(d.tipo)} — ${d.nome}`;}
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
    crs:(typeof S!=='undefined'&&S.workCRS)||null,fonte:null,mdtId:null,cutMdt:false,
    criadoEm:new Date().toISOString()};
}

function criaInterface(){
  const host=workspace();if(!host||host.dataset.ready)return;
  host.dataset.ready='1';
  host.innerHTML=`<div class="cava2-bridgebar">
    <span class="cava2-bridge-title">Área 2D</span>
    <label>Tipo <select id="cava2Target"><option value="cava">Cava</option><option value="pilha">DCE</option></select></label>
    <label>Nome <input id="cava2Name" type="text" maxlength="80" value=""></label>
    <label>Cota-base Z <input id="cava2BaseZ" type="number" step="0.01" value="0"></label>
    <label>MDT <select id="cava2Mdt" aria-label="Superfície para interseção"></select></label>
    <button id="cava2CutMdt" title="Recorta cristas, pés e rampa pela superfície selecionada">✂ Interseção MDT</button>
    <button id="cava2ClearCut" title="Volta a exibir as linhas brutas editáveis">× Remover corte</button>
    <button id="cava2NewCava" class="primary">＋ Nova cava</button>
    <button id="cava2NewDce">＋ Novo DCE</button>
    <button id="cava2Import">Usar seleção do mapa GIS</button>
    <button id="cava2Sync">Sincronizar camadas</button>
    <button id="cava2Classic">Mapa GIS clássico</button>
    <span class="cava2-bridge-status" id="cava2BridgeStatus">Cada aba gera uma camada própria.</span>
  </div><div class="cava2-design-tabs" id="cava2DesignTabs"></div>
  <iframe id="cava2Frame" title="Área 2D — cava e DCE" sandbox="allow-scripts allow-same-origin allow-downloads"></iframe>`;
  estado.frame=document.getElementById('cava2Frame');
  document.getElementById('cava2Target').onchange=e=>mudaTipoAtual(e.target.value);
  document.getElementById('cava2Name').onchange=e=>renomeiaAtual(e.target.value);
  document.getElementById('cava2BaseZ').onchange=e=>{
    estado.baseZ=n(e.target.value);const d=desenhoAtual();if(d)d.baseZ=estado.baseZ;
    salvaRegistroLocal();agendarSincronizacao();
  };
  const mdt=document.getElementById('cava2Mdt');
  mdt.onmousedown=()=>populaMdts();
  mdt.onchange=e=>{
    const d=desenhoAtual();if(!d)return;d.mdtId=e.target.value||null;
    estado.cutHashes[d.id]=null;salvaRegistroLocal();
    if(d.cutMdt)cortaMdtAtual(true);
  };
  document.getElementById('cava2CutMdt').onclick=()=>cortaMdtAtual(true);
  document.getElementById('cava2ClearCut').onclick=removeCorteMdt;
  document.getElementById('cava2NewCava').onclick=()=>criaNovoDesenho('cava');
  document.getElementById('cava2NewDce').onclick=()=>criaNovoDesenho('pilha');
  document.getElementById('cava2Import').onclick=importaSelecionada;
  document.getElementById('cava2Sync').onclick=()=>sincronizaCamadas(true);
  document.getElementById('cava2Classic').onclick=()=>{if(typeof switchView==='function')switchView('map');};
  /* A árvore permanece sendo a fonte única de visibilidade. Qualquer troca
     feita enquanto o editor está aberto é refletida no canvas de referência. */
  const lista=document.getElementById('layerList');
  if(lista&&!lista.dataset.cava2Context){
    lista.dataset.cava2Context='1';
    const atualiza=()=>setTimeout(()=>{if(S._view==='cava2')atualizaContexto();},0);
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
    try{estado.frame.contentWindow.addEventListener('cava2:panel-toggle',()=>{
      estado.painelFechado=!estado.painelFechado;aplicaPainel();salvaRegistroLocal();
    });}catch(e){}
    if(estado.projetoPendente!==undefined)aplicaEstadoProjeto(estado.projetoPendente);
    else{
      const local=leRegistroLocal();
      if(local?.designs?.length)aplicaEstadoProjeto(local);
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
    populaMdts();
    status('Área 2D pronta · escolha um MDT para gerar a interseção da cava/DCE com a superfície.');
  },{once:true});
  estado.frame.srcdoc=fontePreparada();
  ligaFerramentasGlobais();
}

/* A barra CAD continua visível na Área 2D, mas controla o canvas encapsulado. */
function ligaFerramentasGlobais(){
  const box=document.getElementById('mapTools');if(!box||box.dataset.cava2Bridge)return;
  box.dataset.cava2Bridge='1';
  box.addEventListener('click',e=>{
    if(S._view!=='cava2')return;
    const b=e.target.closest('.mtool');if(!b)return;
    const tool=b.dataset.tool,id=tool==='pan'?'t_mover':tool==='point'?'t_rampa':
      (tool==='line'||tool==='poly')?(alvoAtual()==='pilha'?'t_pilha':'t_cava'):
      tool==='measure'?'t_secao':tool==='del'?'b_reverter':
      (tool==='select'||tool==='selpoly'||tool==='vertex'||tool==='info')?'t_editar':null;
    if(!id)return;
    const d=doc2D(),alvo=d&&d.getElementById(id);if(!alvo)return;
    e.preventDefault();e.stopImmediatePropagation();alvo.click();
    box.querySelectorAll('.mtool[data-tool]').forEach(x=>x.classList.toggle('on',x===b));
  },true);
}

function abre(){
  criaInterface();const host=workspace();if(host)host.classList.add('on');
  aplicaTemaNoMotor();aplicaPainel();
  if(estado.ready)atualizaContexto();
}
function fecha(){const host=workspace();if(host)host.classList.remove('on');}
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
  if(tc)tc.hidden=tipo!=='cava';if(tp)tp.hidden=tipo!=='pilha';
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
function limitesDoOverlay(ov){
  try{
    const b=ov&&ov.getBounds&&ov.getBounds();if(!b)return null;
    const a=fromWGS(S.workCRS,b.getWest(),b.getSouth()),c=fromWGS(S.workCRS,b.getEast(),b.getNorth());
    if([a[0],a[1],c[0],c[1]].every(Number.isFinite))return [a[0],a[1],c[0],c[1]];
  }catch(e){}
  return null;
}
function contextoDasCamadas(){
  const atual=desenhoAtual(),temDesign=!!designRuntime(atual),out=[],candidatos=[];
  const limite=240000,camadas=[...(S.layers||[])].sort((a,b)=>(b._cava2Managed?1:0)-(a._cava2Managed?1:0));
  for(const L of camadas){
    if(L.visible===false||!['line','polygon','point'].includes(L.gtype))continue;
    /* Quando a aba ativa tem receita paramétrica, sua versão editável será
       desenhada pelo motor. Sem receita, a camada continua como referência
       para nunca abrir um canvas aparentemente vazio. */
    if(temDesign&&(L._cava2DesignId===atual?.id||L._cava2CutOf===atual?.id))continue;
    for(const f of (L.features||[])){
      if(!f?.geom||(typeof featureVisible==='function'&&!featureVisible(L,f)))continue;
      let st={stroke:L.color||'#687786',color:L.color||'#687786',weight:L.weight||1,fill:L.fill||0,dash:''};
      try{if(typeof featureStyle==='function')st={...st,...featureStyle(L,f)};}catch(e){}
      for(const P0 of caminhosDaGeometria(f.geom))if(P0?.length)candidatos.push({L,P0,st,
        closed:L.gtype==='polygon',point:L.gtype==='point'});
    }
  }
  /* Todas as feições recebem amostragem proporcional dentro do orçamento.
     O redutor preserva quinas em vez de pegar “um vértice a cada N”, que
     deformava limites oficiais. */
  const baseTotal=candidatos.reduce((s,c)=>s+Math.min(c.P0.length,4000),0),
    fator=baseTotal>limite?limite/baseTotal:1;
  for(const c of candidatos){
    const minimo=c.point?1:(c.closed?4:2),alvo=Math.max(minimo,Math.floor(Math.min(c.P0.length,4000)*fator)),
      reduzido=reduzCaminhoPreservandoForma(c.P0,alvo,c.closed),P=reduzido.map(p=>pontoNoTrabalho(c.L,p));
    if(P.length)out.push({paths:[P],color:c.st.stroke||c.st.color||c.L.color||'#687786',
      fillColor:c.st.color||c.st.stroke||c.L.color||'#687786',
      weight:+c.st.weight||1,dash:c.st.dash||'',opacity:Number.isFinite(+c.st.opacity)?+c.st.opacity:1,
      /* Mesma regra do Mapa 2D: hatch=none significa contorno sem qualquer
         preenchimento, mesmo quando um valor antigo de fill ainda existe. */
      fill:c.closed&&c.st.hatch!=='none'?(+c.st.fill||0):0,
      hatch:c.closed?(c.st.hatch||'solid'):'none',hatchScale:n(c.st.hatchScale,1),
      closed:c.closed,point:c.point});
  }
  /* As superfícies e a ortofoto pertencem à mesma árvore visual do 2D.
     Reaproveitar o PNG já renderizado evita recalcular MDTs grandes e mantém
     exatamente a simbologia e a opacidade escolhidas no projeto. */
  for(const r of (S.rasters||[])){
    const bounds=r.visible!==false&&r._url?limitesDoOverlay(r.overlay):null;
    if(bounds)out.push({imageUrl:r._url,bounds,opacity:n(r.style?.opacity,.8),name:r.name||'Raster'});
  }
  const I=S.img,boundsImg=I?.visible!==false&&I?.url?limitesDoOverlay(I.overlay):null;
  if(boundsImg)out.push({imageUrl:I.url,bounds:boundsImg,opacity:n(I.opacity,1),name:I.name||'Ortofoto'});
  return out;
}
function visibilidadeDoDesenho(d){
  if(!d)return {on:false,crista:false,pe:false,rampa:false};
  const bruta=camadaDoDesenho(d.id),corte=camadaCorteDoDesenho(d.id),
    L=d.cutMdt&&corte?corte:bruta;
  if(!L)return {on:true,crista:true,pe:true,rampa:true};
  const cats=L.sym?.mode==='cat'?(L.sym.cats||[]):[],vis=nome=>{
    const c=cats.find(q=>String(q.value)===nome);return !c||c.vis!==false;
  };
  return {on:L.visible!==false,crista:vis('Crista'),pe:vis('Pé'),rampa:vis('Rampa')};
}
function aplicaVisibilidadeDesenho(){
  const A=api(),d=desenhoAtual();
  if(!A||!d||typeof A.setObjectVisibility!=='function')return false;
  A.setObjectVisibility(d.tipo,visibilidadeDoDesenho(d));return true;
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
function aplicaEstiloDesenho(){
  const A=api(),d=desenhoAtual(),e=d&&estilosDoDesenho(d);
  if(!A||!d||!e||typeof A.setObjectStyle!=='function')return false;
  A.setObjectStyle(d.tipo,e);return true;
}
function atualizaContexto(){
  const A=api();if(!A||typeof A.setContextLayers!=='function')return false;
  A.setContextLayers(contextoDasCamadas());aplicaVisibilidadeDesenho();aplicaEstiloDesenho();return true;
}
function renderAbas(){
  const box=document.getElementById('cava2DesignTabs');if(!box)return;
  box.innerHTML='';
  estado.desenhos.forEach(d=>{
    const b=document.createElement('button');b.type='button';b.className='cava2-design-tab';
    b.classList.toggle('on',d.id===estado.desenhoId);b.dataset.designId=d.id;
    b.innerHTML=`<span class="cava2-tab-kind">${esc(tipoNome(d.tipo))}</span><span>${esc(d.nome)}</span>`;
    b.title=`Abrir ${tipoNome(d.tipo).toLowerCase()} “${d.nome}”`;
    b.onclick=()=>trocaDesenho(d.id);box.appendChild(b);
  });
}
function atualizaCampos(d){
  if(!d)return;
  estado.alvo=d.tipo;estado.baseZ=n(d.baseZ);estado.crs=d.crs||S.workCRS;estado.fonte=clone(d.fonte)||null;
  const t=document.getElementById('cava2Target'),nm=document.getElementById('cava2Name'),z=document.getElementById('cava2BaseZ');
  if(t)t.value=d.tipo;if(nm)nm.value=d.nome;if(z)z.value=String(estado.baseZ);
  populaMdts(d);
  aplicaTipoNoMotor(d.tipo);
}
function criaNovoDesenho(tipo){
  salvaAtual(true);
  const d=novoRegistro(tipo);estado.desenhos.push(d);estado.desenhoId=d.id;
  aplicaDesenho(d,false);renderAbas();salvaRegistroLocal();
  status(`${tipoNome(d.tipo)} “${d.nome}” criada · desenhe o limite para gerar a camada.`);
}
function trocaDesenho(id){
  if(id===estado.desenhoId)return;
  salvaAtual(true);const d=estado.desenhos.find(x=>x.id===id);if(!d)return;
  estado.desenhoId=id;aplicaDesenho(d,false);renderAbas();salvaRegistroLocal();
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
  const it=feicaoSelecionada();
  if(!it){status('Selecione uma linha ou polígono fechado no mapa GIS clássico.',true);return;}
  const P=anelDaFeicao(it.f);if(!P){status('A feição selecionada precisa ter pelo menos três vértices.',true);return;}
  const A=api();if(!A){status('Aguarde a inicialização da área 2D.',true);return;}
  const d=desenhoAtual(),alvo=d?.tipo||alvoAtual(),z=zDaFeicao(it.f);
  if(z!=null){estado.baseZ=z;if(d)d.baseZ=z;const el=document.getElementById('cava2BaseZ');if(el)el.value=String(z);}
  estado.crs=it.L.crs||S.workCRS;estado.fonte={layerId:it.L.id,featureIndex:it.L.features.indexOf(it.f)};
  if(d){d.crs=estado.crs;d.fonte=clone(estado.fonte);}
  A.objs[alvo].base=P;A.objs[alvo].anc=null;A.objs[alvo].overrides={};A.regen();
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
function populaMdts(d){
  const el=document.getElementById('cava2Mdt');
  if(!el||typeof S==='undefined')return [];
  d=d||desenhoAtual();
  const valor=String(d?.mdtId??el.value??''),rasters=(S.rasters||[]).filter(r=>
    r&&r.d&&r.d.z&&Number.isFinite(+r.d.nc)&&Number.isFinite(+r.d.nr));
  el.innerHTML='<option value="">— escolha a superfície —</option>'+rasters.map(r=>
    `<option value="${esc(r.id)}">${esc(r.name||`MDT ${r.id}`)}</option>`).join('');
  if(valor&&rasters.some(r=>String(r.id)===valor))el.value=valor;
  return rasters;
}
function rasterDoDesenho(d){
  if(!d||d.mdtId==null||typeof S==='undefined')return null;
  return (S.rasters||[]).find(r=>String(r.id)===String(d.mdtId))||null;
}
function camadaCorteDoDesenho(id){
  return (S.layers||[]).find(L=>String(L._cava2CutOf||'')===String(id||''))||null;
}
function nomeCorteMdt(d,R){
  return `${nomeCamada(d)} — interseção com ${R?.name||'MDT'}`;
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
function idDesenhoDaCamada(L){return L?._cava2DesignId||L?._cava2CutOf||null;}
/* Chamado ANTES da exclusão geral da camada. Guarda a entidade lógica inteira
   para que um único Ctrl+Z possa restaurar camada, aba e receita sem duplicar. */
function preparaExclusaoCamada(L){
  const id=idDesenhoDaCamada(L),idx=estado.desenhos.findIndex(d=>d.id===id);
  if(!id||idx<0)return null;
  return {id,index:idx,activeId:estado.desenhoId,design:clone(estado.desenhos[idx]),
    cutHash:estado.cutHashes[id]??null,
    companions:(S.layers||[]).map((q,i)=>({L:q,idx:i})).filter(x=>x.L!==L&&
      (x.L._cava2DesignId===id||x.L._cava2CutOf===id))};
}
function limpaMotorSemDesenho(){
  const A=api();if(!A)return false;estado.restaurando=true;
  try{
    for(const k of ['cava','pilha']){
      A.objs[k].base=null;A.objs[k].anc=null;A.objs[k].design=null;
      A.objs[k].overrides={};A.objs[k].ovMeta=null;
    }
    try{estado.frame.contentWindow.localStorage.removeItem(STORAGE_KEY);}catch(e){}
    A.secAB={a:null,b:null};A.regen();
  }finally{estado.restaurando=false;}
  const nm=document.getElementById('cava2Name');if(nm)nm.value='';
  return true;
}
/* Chamado DEPOIS que a camada clicada saiu de S.layers. Remove somente o
   desenho que possui o mesmo DESIGN_ID, suas camadas derivadas e sua aba. */
function removeDesenhoDaCamada(L,snapshot){
  snapshot=snapshot||preparaExclusaoCamada(L);const id=snapshot?.id||idDesenhoDaCamada(L);
  const idx=estado.desenhos.findIndex(d=>d.id===id);if(!id||idx<0)return false;
  clearTimeout(estado.syncTimer);estado.syncTimer=0;
  const eraAtivo=estado.desenhoId===id;
  for(const q of [...(S.layers||[])])if(q._cava2DesignId===id||q._cava2CutOf===id)removeCamadaGerada(q);
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
function hashCorteMdt(d,R){
  return `${R?.id||''}|${d.tipo}|${n(d.baseZ)}|${JSON.stringify(d.engine||{})}`;
}
function mostraBrutaSemCorte(d,mensagem,erro){
  const L=camadaDoDesenho(d?.id),C=camadaCorteDoDesenho(d?.id);
  if(L){L.visible=true;if(typeof drawLayer==='function')drawLayer(L);}
  if(C){C.visible=false;if(typeof drawLayer==='function')drawLayer(C);}
  if(mensagem)status(mensagem,erro);
  return null;
}
function publicaCorteMdt(d,design,silencioso,forcar){
  if(!d?.cutMdt)return null;
  const R=rasterDoDesenho(d),g=R?.d;
  if(!g)return mostraBrutaSemCorte(d,'Escolha um MDT válido para calcular a interseção.',true);
  if(typeof cavaRecortaAneisFechadosNoMdt!=='function')
    return mostraBrutaSemCorte(d,'O algoritmo de interseção da cava v1 não está disponível.',true);
  const hash=hashCorteMdt(d,R),existente=camadaCorteDoDesenho(d.id);
  if(!forcar&&existente&&estado.cutHashes[d.id]===hash){
    const bruta=camadaDoDesenho(d.id);if(bruta){bruta.visible=false;drawLayer(bruta);}
    existente.visible=true;drawLayer(existente);return existente;
  }
  const src=feicoesDoDesign(design,n(d.baseZ),d);
  if(!src.length)return mostraBrutaSemCorte(d,`${d.nome}: desenhe primeiro um limite fechado.`,true);
  const passo=Math.max(.2,Math.min(.75,n(g.cs,.5)));
  let q;
  try{q=cavaRecortaAneisFechadosNoMdt(feicoesCompativeisCorte(src),g,d.tipo==='pilha',passo);}
  catch(e){console.error('Interseção Área 2D × MDT',e);return mostraBrutaSemCorte(d,
    `Falha ao calcular a interseção com “${R.name}”: ${e.message||e}`,true);}
  const feats=normalizaCorteMdt(q?.feats,d,R),inter=feats.filter(f=>f.props?.ELEMENTO==='Interseção');
  if(!inter.length)return mostraBrutaSemCorte(d,
    `${d.nome}: a geometria não cruza a superfície “${R.name}”; mantida a camada bruta.`,true);
  const ativo=S.activeId;let C=existente;
  if(!C){
    C=addLayer({name:nomeCorteMdt(d,R),gtype:'line',features:feats,
      fields:['FID','DESENHO','DESIGN_ID','PROJETO','ELEMENTO','COTA','ORDEM','BANCO','MDT','ORIGEM'],
      crs:d.crs||S.workCRS,color:'#111111',src:'Área 2D · Cava2 · interseção MDT'});
    C._cava2CutOf=d.id;
  }else{
    C.features=feats;C.crs=d.crs||C.crs||S.workCRS;C.name=nomeCorteMdt(d,R);
    C.src='Área 2D · Cava2 · interseção MDT';
  }
  C._cava2MdtId=R.id;C._cava2Kind=d.tipo;C._cava2Managed=true;C.visible=true;
  estiloCamada(C,feats);
  const L=camadaDoDesenho(d.id);if(L){L.visible=false;drawLayer(L);}drawLayer(C);
  if(ativo!=null&&S.layers.some(x=>x.id===ativo))S.activeId=ativo;
  estado.cutHashes[d.id]=hash;
  if(!silencioso&&typeof refreshUI==='function')refreshUI();
  return C;
}
function cortaMdtAtual(forcar){
  const d=desenhoAtual(),el=document.getElementById('cava2Mdt');
  if(!d)return false;
  salvaAtual(false);d.mdtId=el?.value||d.mdtId||null;
  if(!d.mdtId){status('Escolha o MDT que será intersectado com a cava/DCE.',true);return false;}
  d.cutMdt=true;estado.cutHashes[d.id]=null;
  const C=publicaCorteMdt(d,designRuntime(d),false,!!forcar);
  salvaRegistroLocal();if(typeof refreshUI==='function')refreshUI();atualizaContexto();
  if(C){
    const ni=C.features.filter(f=>f.props?.ELEMENTO==='Interseção').length;
    status(`${d.nome}: ${C.features.length} string(s) cortadas por “${rasterDoDesenho(d)?.name}” · ${ni} interseção(ões).`);
  }
  try{if(S._view==='v3d'&&typeof v3Auto==='function')v3Auto();}catch(e){}
  return !!C;
}
function removeCorteMdt(){
  const d=desenhoAtual();if(!d)return false;
  d.cutMdt=false;estado.cutHashes[d.id]=null;mostraBrutaSemCorte(d);
  salvaRegistroLocal();if(typeof refreshUI==='function')refreshUI();atualizaContexto();
  status(`${d.nome}: corte removido; camada bruta editável novamente visível.`);return true;
}
function designRuntime(d){const A=api();return d&&A?A.objs[d.tipo]?.design:null;}
function salvaAtual(publicar){
  const d=desenhoAtual();if(!d||!estado.ready)return d;
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
  salvaAtual(false);const design=designRuntime(d),L=publicaDesenho(d,design,true),
    C=d.cutMdt?publicaCorteMdt(d,design,true,false):null;
  if(manual)reconstroiCamadasAusentes();
  if(typeof refreshUI==='function')refreshUI();
  try{if(typeof layoutSeVisivel==='function')layoutSeVisivel();}catch(e){}
  try{if(S._view==='v3d'&&typeof v3Auto==='function')v3Auto();}catch(e){}
  const produto=C||L,total=produto?.features?.length||0;
  atualizaContexto();
  salvaRegistroLocal();
  status(total?`${d.nome}: ${total} string(s) 3D · Crista, Pé, Rampa${C?' e Interseção':''}.`:
    `${d.nome}: desenhe um limite fechado para criar a camada.`,manual&&!total);
  return true;
}
function agendarSincronizacao(){
  clearTimeout(estado.syncTimer);estado.syncTimer=setTimeout(()=>{
    try{sincronizaCamadas(false);}catch(e){console.error('Publicação Área 2D',e);status(`Falha ao publicar a camada: ${e.message||e}`,true);}
  },80);
}

function leEstadoMotor(){
  try{return JSON.parse(estado.frame.contentWindow.localStorage.getItem(STORAGE_KEY)||'null');}catch(e){return null;}
}
function dadosRegistro(){
  return {version:2,activeId:estado.desenhoId,seq:estado.seq,painelFechado:estado.painelFechado,
    designs:clone(estado.desenhos)};
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
    for(const k of ['cava','pilha']){A.objs[k].base=null;A.objs[k].anc=null;A.objs[k].overrides={};A.objs[k].ovMeta=null;}
    if(!e){try{estado.frame.contentWindow.localStorage.removeItem(STORAGE_KEY);}catch(x){}}
    else{
      A.objs.cava.base=clone(e.bases?.cava)||null;A.objs.pilha.base=clone(e.bases?.pilha)||null;
      A.objs.cava.anc=clone(e.ancs?.cava)||null;A.objs.pilha.anc=clone(e.ancs?.pilha)||null;
      A.objs.cava.overrides=clone(e.ovs?.cava)||{};A.objs.pilha.overrides=clone(e.ovs?.pilha)||{};
      IDS_VALORES.forEach(id=>{if(D.getElementById(id)&&e.vals?.[id]!=null)D.getElementById(id).value=e.vals[id];});
      if(e.chks){D.getElementById('cava_rampa_on').checked=!!e.chks.c;D.getElementById('pilha_rampa_on').checked=!!e.chks.p;}
      if(e.dirs){D.getElementById('cava_rampa_dir').value=e.dirs.c||'ah';D.getElementById('pilha_rampa_dir').value=e.dirs.p||'ah';}
      try{estado.frame.contentWindow.localStorage.setItem(STORAGE_KEY,JSON.stringify(e));}catch(x){}
    }
    /* A seção é uma consulta temporária. Não reaproveitar A–A' de outra aba:
       uma seção antiga mantinha 190 px vazios e impedia a quadrícula de usar
       toda a altura ao abrir a cava/DCE. O botão Seção continua criando uma
       nova consulta sempre que necessário. */
    atualizaCampos(d);A.regen();
    A.secAB={a:null,b:null};
  }finally{estado.restaurando=false;}
  return true;
}
function aplicaDesenho(d,publicar){
  if(!d)return false;atualizaCampos(d);if(!carregaMotor(d))return false;
  if(publicar)publicaDesenho(d,designRuntime(d),false);
  atualizaContexto();
  try{doc2D()?.getElementById('b_ajustar')?.click();}catch(e){}
  return true;
}
function reconstroiCamadasAusentes(){
  const ativoId=estado.desenhoId,ativo=desenhoAtual();
  for(const d of estado.desenhos){
    const faltaBruta=!camadaDoDesenho(d.id),faltaCorte=d.cutMdt&&!camadaCorteDoDesenho(d.id);
    if((!faltaBruta&&!faltaCorte)||!d.engine)continue;
    carregaMotor(d);const design=designRuntime(d);
    if(faltaBruta)publicaDesenho(d,design,true);
    if(d.cutMdt)publicaCorteMdt(d,design,true,true);
  }
  estado.desenhoId=ativoId;if(ativo)carregaMotor(ativo);
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
  estado.projetoPendente=undefined;const m=migraEstado(st);
  const usados=new Set();
  estado.desenhos=(m.designs||[]).map(d=>{
    const tipo=d.tipo==='pilha'?'pilha':'cava',id=d.id||novoId(),base=String(d.nome||proximoNome(tipo)).trim()||tipoNome(tipo);
    let nome=base,i=2;while(usados.has(nome.toLowerCase()))nome=`${base} ${i++}`;usados.add(nome.toLowerCase());
    return {...d,id,nome,tipo,baseZ:n(d.baseZ),crs:d.crs||S.workCRS,
      mdtId:d.mdtId??null,cutMdt:!!d.cutMdt};
  });
  if(!estado.desenhos.length)estado.desenhos.push(novoRegistro('cava'));
  estado.seq=Math.max(n(m.seq),estado.seq);estado.painelFechado=m.painelFechado!==false;
  estado.desenhoId=estado.desenhos.some(d=>d.id===m.activeId)?m.activeId:estado.desenhos[0].id;
  migraCamadasAntigas();
  for(const d of estado.desenhos){const L=camadaDoDesenho(d.id);if(!d.engine&&L?._cava2Engine)d.engine=clone(L._cava2Engine);}
  aplicaPainel();aplicaDesenho(desenhoAtual(),false);reconstroiCamadasAusentes();
  renderAbas();salvaRegistroLocal();if(typeof refreshUI==='function')refreshUI();return true;
}

window.CCMGISCava2={open:abre,close:fecha,importSelected:importaSelecionada,
  exportToMap:()=>sincronizaCamadas(true),syncLayers:()=>sincronizaCamadas(true),snapshot,
  restoreProjectState:aplicaEstadoProjeto,frame:()=>estado.frame,state:estado,
  openMiningMode:abreModoCava,newDesign:criaNovoDesenho,selectDesign:trocaDesenho,
  syncTheme:aplicaTemaNoMotor,syncStyles:atualizaContexto,
  beforeLayerDelete:preparaExclusaoCamada,onLayerDeleted:removeDesenhoDaCamada,
  restoreLayerDeletion:restauraExclusaoCamada,
  _featuresFromDesign:feicoesDoDesign,_reduceContextPath:reduzCaminhoPreservandoForma};
})();
