
/* ---------------------------------------------------------------------------
   Rede de segurança: se algo estourar no carregamento, mostra o erro na tela
   (antes a página simplesmente ficava em branco e não dava para diagnosticar).
   --------------------------------------------------------------------------- */
(function(){
  const messages=[];
  let total=0;
  const mostra=(msg)=>{
    messages.push(String(msg).slice(0,8000));if(messages.length>20)messages.shift();total++;
    let b=document.getElementById('__err');
    if(!b){
      b=document.createElement('section');b.id='__err';b.setAttribute('aria-label','Avisos de erro');
      b.style.cssText='position:absolute;top:48px;right:12px;z-index:2500;width:min(480px,calc(100% - 24px));'+
        'box-sizing:border-box;background:#7f1d1d;color:#fff;font:12px/1.5 Signika,sans-serif;'+
        'padding:8px 12px;border:1px solid #dc8b8b;border-radius:8px;box-shadow:0 2px 12px #0005';
      const header=document.createElement('div');header.style.cssText='display:flex;align-items:center;gap:12px';
      const title=document.createElement('strong');title.id='__errTitle';title.setAttribute('role','status');title.style.flex='1';
      const close=document.createElement('button');close.type='button';close.textContent='×';close.title='Fechar aviso';close.setAttribute('aria-label','Fechar aviso de erro');
      close.style.cssText='flex:none;width:28px;min-width:28px;height:28px;padding:0;border:1px solid #ffffff70;border-radius:5px;background:transparent;color:white;font-size:20px;cursor:pointer';
      close.onclick=()=>{b.hidden=true;};header.append(title,close);b.append(header);
      const details=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('pre');
      summary.textContent='Ver detalhes';summary.style.cursor='pointer';
      text.id='__errText';text.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:min(180px,25vh);overflow:auto;margin:8px 0 0;font:inherit';
      details.append(summary,text);b.append(details);
      const main=document.getElementById('main');
      if(main)main.append(b);
      else{b.style.position='fixed';b.style.top='auto';b.style.bottom='12px';(document.body||document.documentElement).append(b);}
    }
    b.hidden=false;
    b.querySelector('#__errTitle').textContent=total===1?'Erro no aplicativo':total+' erros no aplicativo';
    b.querySelector('#__errText').textContent=messages.join('\n\n');
  };
  window.addEventListener('error', e=>{
    // "Script error." sem detalhes = exceção em recurso cross-origin (CDN);
    // o stack real fica em e.error quando o erro é do nosso próprio código.
    if(e.error && e.error.stack){
      mostra('ERRO: '+(e.error.message||e.message)+'\n'+e.error.stack.split('\n').slice(0,4).join('\n'));
    } else if(e.message && e.message!=='Script error.'){
      mostra('ERRO: '+e.message+'\n  em '+(e.filename||'?')+':'+(e.lineno||'?')+':'+(e.colno||'?'));
    }
    // "Script error." puro (sem stack) é ruído cross-origin — ignora p/ não poluir
  });
  window.addEventListener('unhandledrejection', e=>{
    const r=e.reason;
    /* Ruído interno do SDK de login: quando a janela do Google falha, ele
       rejeita a mesma operação duas vezes e a segunda vira esta asserção. A
       falha verdadeira já chega a quem pediu a autorização, com mensagem. */
    if(/INTERNAL ASSERTION FAILED: Pending promise was never set/.test(String((r&&r.message)||r))){e.preventDefault();return;}
    mostra('PROMISE REJEITADA: '+((r&&r.message)||r)+(r&&r.stack? '\n'+r.stack.split('\n').slice(0,3).join('\n'):''));
  });
})();

/* Ativos mínimos do Leaflet incorporados no próprio HTML. Sem isto, o arquivo
   distribuído sozinho tentava buscar images/marker-icon.png no computador. */
(function(){
  if(typeof L==='undefined'||!L.Icon||!L.Icon.Default)return;
  const pin='data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2225%22%20height=%2241%22%20viewBox=%220%200%2025%2041%22%3E%3Cpath%20d=%22M12.5%201C6.15%201%201%206.15%201%2012.5C1%2021%2012.5%2040%2012.5%2040S24%2021%2024%2012.5C24%206.15%2018.85%201%2012.5%201Z%22%20fill=%22%232d7dd2%22%20stroke=%22%23fff%22%20stroke-width=%221.5%22/%3E%3Ccircle%20cx=%2212.5%22%20cy=%2212.5%22%20r=%224.2%22%20fill=%22%23fff%22/%3E%3C/svg%3E';
  L.Icon.Default.imagePath='';
  L.Icon.Default.mergeOptions({iconUrl:pin,iconRetinaUrl:pin,shadowUrl:null});
})();

"use strict";
/* ============================================================================
   CCMGIS — GIS de campo (single-file)
   Núcleo: I/O de shapefile (SHP/SHX/DBF/PRJ), datums BR (proj4),
   edição de feições, tabela de atributos, layout com grade UTM/escala/norte.
   ========================================================================== */

/* ---------- Definições de CRS (datums brasileiros) ---------- */
const CRS_DEFS = {
  'EPSG:4326':  '+proj=longlat +datum=WGS84 +no_defs',
  'EPSG:4674':  '+proj=longlat +ellps=GRS80 +no_defs',                 // SIRGAS 2000 geo
  'EPSG:4618':  '+proj=longlat +ellps=aust_SA +towgs84=-66.87,4.37,-38.52,0,0,0,0 +no_defs', // SAD69 geo
};
// SIRGAS 2000 / UTM S (EPSG 31978..31985 => zonas 18..25)
for(let z=18; z<=25; z++){
  CRS_DEFS['EPSG:'+(31960+z)] = `+proj=utm +zone=${z} +south +ellps=GRS80 +units=m +no_defs`;
}
// Faixa brasileira ao norte do Equador (RR, AP e extremo norte do AM/PA).
// Os códigos SIRGAS 2000 / UTM N seguem EPSG 31954 + fuso.
for(let z=18; z<=22; z++){
  CRS_DEFS['EPSG:'+(31954+z)] = `+proj=utm +zone=${z} +ellps=GRS80 +units=m +no_defs`;
}
// SAD69 / UTM S (EPSG 29188..29195 => zonas 18..25, aprox p/ compat)
for(let z=18; z<=25; z++){
  CRS_DEFS['EPSG:'+(29170+z)] = `+proj=utm +zone=${z} +south +ellps=aust_SA +towgs84=-66.87,4.37,-38.52,0,0,0,0 +units=m +no_defs`;
}
// Córrego Alegre / UTM S (EPSG 22518..22525)
for(let z=18; z<=25; z++){
  CRS_DEFS['EPSG:'+(22500+z)] = `+proj=utm +zone=${z} +south +ellps=intl +towgs84=-206.048,168.279,-3.283,0,0,0,0 +units=m +no_defs`;
}
const CRS_LABELS = {
  'EPSG:4326':'WGS84 (geográfica)',
  'EPSG:4674':'SIRGAS 2000 (geográfica)',
  'EPSG:4618':'SAD69 (geográfica)',
};
for(let z=18; z<=25; z++){
  CRS_LABELS['EPSG:'+(31960+z)] = `SIRGAS 2000 / UTM ${z}S`;
  CRS_LABELS['EPSG:'+(29170+z)] = `SAD69 / UTM ${z}S`;
  CRS_LABELS['EPSG:'+(22500+z)] = `Córrego Alegre / UTM ${z}S`;
}
for(let z=18; z<=22; z++){
  CRS_LABELS['EPSG:'+(31954+z)] = `SIRGAS 2000 / UTM ${z}N`;
}
/* Policônica do IBGE: mapas antigos inteiros do Brasil vêm nela, e lida como
   UTM produz o clássico deslocamento de quilômetros com a forma preservada. */
CRS_LABELS['EPSG:29101']='SAD69 / Policônica (IBGE)';
CRS_DEFS['EPSG:29101']='+proj=poly +lat_0=0 +lon_0=-54 +x_0=5000000 +y_0=10000000 +ellps=aust_SA +towgs84=-66.87,4.37,-38.52,0,0,0,0 +units=m +no_defs';
Object.entries(CRS_DEFS).forEach(([k,v])=>proj4.defs(k,v));
proj4.defs('WGS84', CRS_DEFS['EPSG:4326']);
/* Projeção de EXIBIÇÃO do Leaflet. O overlay de imagem é sempre um retângulo
   alinhado aos eixos nesta projeção — ele não gira. Como a malha UTM é girada
   em relação ao norte verdadeiro pela CONVERGÊNCIA MERIDIANA, colar o raster
   direto pelos cantos em lat/lon deixa a imagem sem essa rotação, enquanto os
   vetores (projetados ponto a ponto) a carregam. O erro é nulo numa diagonal
   e cresce para os cantos opostos, proporcional ao tamanho do levantamento.  */
proj4.defs('EPSG:3857','+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 '+
  '+x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs');

/* Um par [lng,lat] só é válido se estiver no domínio geográfico. Coordenadas
   UTM que escapam pelo fallback do toWGS (lat ~8,6 milhões) corrompem o grid
   de tiles do Leaflet — o mapa fica com o mosaico embaralhado até recarregar.
   TODO overlay/fitBounds passa por esta validação antes de tocar no mapa.   */
function wgsOK(p){ return p && isFinite(p[0]) && isFinite(p[1]) &&
  Math.abs(p[1])<=90 && Math.abs(p[0])<=360; }
function wgsBoundsOK(sw,ne){ return wgsOK(sw)&&wgsOK(ne); }
function safeFit(bounds){
  try{
    const b=(bounds&&bounds.isValid)?bounds:L2.latLngBounds(bounds);
    if(!b.isValid()) return false;
    const sw=b.getSouthWest(), ne=b.getNorthEast();
    if(Math.abs(sw.lat)>90||Math.abs(ne.lat)>90||Math.abs(sw.lng)>360||Math.abs(ne.lng)>360){
      toast('⚠ Extensão inválida (fora do domínio geográfico) — confira o CRS/fuso'); return false;
    }
    map.fitBounds(b); return true;
  }catch(e){ return false; }
}
function toWGS(crs, x, y){ if(crs==='EPSG:4326') return [x,y];
  try{return proj4(crs,'EPSG:4326',[x,y]);}
  catch(e){ if(!toWGS._warned){toWGS._warned=1; toast('⚠ Projeção falhou para '+crs+' — coordenadas mantidas'); } return [x,y]; } }
function fromWGS(crs, lng, lat){ if(crs==='EPSG:4326') return [lng,lat]; try{return proj4('EPSG:4326',crs,[lng,lat]);}catch(e){return [lng,lat];} }
function reproj(from,to,x,y){ if(from===to) return [x,y]; try{return proj4(from,to,[x,y]);}catch(e){return [x,y];} }

/* Reconhecer CRS a partir do texto do .prj (heurística) */
function guessCRSfromPRJ(prj){
  if(!prj) return null;
  const p = prj.toUpperCase();
  const zoneM = p.match(/UTM ZONE (\d{1,2})/)||p.match(/ZONE[_ ](\d{1,2})/)||p.match(/UTM_(\d{1,2})/);
  const zone = zoneM?parseInt(zoneM[1]):null;
  const south = /SOUTH/.test(p)||/-10000000|_S\b/.test(p)|| /SIRGAS/.test(p);
  if(/SIRGAS/.test(p)){
    if(zone) return 'EPSG:'+(31960+zone);
    return 'EPSG:4674';
  }
  if(/SAD69|SAD_69/.test(p)){ if(zone) return 'EPSG:'+(29170+zone); return 'EPSG:4618'; }
  if(/CORREGO|CÓRREGO/.test(p)){ if(zone) return 'EPSG:'+(22500+zone); }
  if(/WGS[_ ]?84/.test(p)){
    if(zone){ // WGS84 UTM S
      const code = 32700+zone; proj4.defs('EPSG:'+code, `+proj=utm +zone=${zone} +south +datum=WGS84 +units=m +no_defs`);
      CRS_LABELS['EPSG:'+code]=`WGS84 / UTM ${zone}S`; return 'EPSG:'+code;
    }
    return 'EPSG:4326';
  }
  return null;
}

/* Configuração escolhida no assistente de Novo Projeto. O sessionStorage
   atravessa somente a recarga necessária para limpar completamente o projeto. */
let ALAGIS_NEW_PROJECT_BOOT=null;
try{ ALAGIS_NEW_PROJECT_BOOT=JSON.parse(sessionStorage.getItem('ALAGIS_NEW_PROJECT')||'null'); }
catch(e){ ALAGIS_NEW_PROJECT_BOOT=null; }
/* O marcador vale para uma única recarga. Se permanecesse no sessionStorage,
   um F5 posterior continuaria sendo tratado como criação de projeto e
   bloquearia a retomada automática da sessão recém-criada. */
try{ sessionStorage.removeItem('ALAGIS_NEW_PROJECT'); }catch(e){}
/* ---------- Estado global ---------- */
const S = {
  layers:[],           // ordem do array = ordem visual: índice 0 = TOPO (desenhado por cima)
  groups:[],           // {id,name,collapsed}
  touch:!!(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches),
  fullRes:true,        // produtos (perfil, curvas, Z, plotagem) na grade NATIVA
  activeId:null,
  tool:'select',
  workCRS:(ALAGIS_NEW_PROJECT_BOOT&&ALAGIS_NEW_PROJECT_BOOT.crs)||'EPSG:31983',
  projectMeta:ALAGIS_NEW_PROJECT_BOOT||null,
  /* Identidade estável, independente do nome do arquivo. É persistida no
     .ccmgis e permite associar sessão, autosave e handle ao projeto certo. */
  projectId:'gm_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10),
  collaboration:null, // metadados não sensíveis da sala de projeto na nuvem
  img:null,            // {url,overlay,bounds}
  stack:[],            // ordem unificada de desenho: 'L:1','R:2','I:0' (topo primeiro)
  drawBuf:[],          // pontos sendo desenhados (WGS lat/lng)
  drawLayer:null,
  vtxLayer:null,
  selFeat:null,        // {layer, idx}
};
let map, baseLayers={}, uid=1, gid=1;

/* Ponto comum de proteção: congelamento manual e autorização cooperativa.
   O congelamento também vale offline; numa sala, a lease e o papel do
   usuário continuam sendo verificados independentemente do cadeado. */
function collabCanEditLayer(L, avisar=false,ignoreLocalLock=false){
  if(L?.locked&&!ignoreLocalLock){if(avisar)toast('A camada "'+L.name+'" está congelada. Descongele pelo cadeado da camada para editar.');return false;}
  const C=window.GeoMineCollaboration;
  let ok=true;
  try{ if(C&&typeof C.canEditLayer==='function')ok=C.canEditLayer(L)!==false; }
  catch(e){ ok=false; }
  if(!ok&&avisar){
    let msg='Esta camada está em edição por outra pessoa.';
    try{if(C&&typeof C.lockMessage==='function')msg=C.lockMessage(L)||msg;}catch(e){}
    try{toast(msg);}catch(e){}
  }
  return ok;
}

/* Local freeze is independent of collaborative ownership. Unlocking cannot
   bypass the permissions of a shared project. */
function setLayerFrozen(L,frozen){
  if(!L||!S.layers.includes(L))return false;
  if(!collabCanEditLayer(L,true,true))return false;
  frozen=!!frozen;if(L.locked===frozen)return true;
  if(frozen){
    window.GeoMineMouseRotation?.cancel();window.GeoMineDragMove?.cancel();window.GeoMinePolygonEdgeDrag?.clear();
    if(typeof ED!=='undefined'&&ED.sel?.L===L){window.edFimArrasto?.();ED.pend=null;}
    if(S._vtxCtx?.L===L){destravaInteracao();clearVertices();}
  }
  L.locked=frozen;
  if(typeof edRedraw==='function')edRedraw();
  refreshUI();
  if(document.getElementById('attrPanel')?.classList.contains('open')&&activeLayer()===L)openAttr();
  toast(frozen?'Camada congelada — edição bloqueada':'Camada descongelada — edição liberada');
  return true;
}

/* Aplica a ordem visual (z-order) no mapa: S.layers[0] fica por cima */
/* ---------- Pilha unificada: vetores + rasters (MDE) + ortofoto ----------
   S.stack guarda a ordem de exibição/desenho (topo primeiro) por chave 'L:3','R:1','I:0'.
   Assim qualquer nó — inclusive a ortofoto e o MDT — pode ser arrastado e agrupado. */
function nodeKey(t,id){ return t+':'+id; }
function nodeLayer(n){ return n.t==='L' ? n.o.llayer : n.o.overlay; }
function allNodes(){
  const out=[];
  S.layers.forEach(L=>out.push({t:'L', id:L.id, o:L}));
  (S.rasters||[]).forEach(r=>out.push({t:'R', id:r.id, o:r}));
  if(S.img && S.img.url) out.push({t:'I', id:0, o:S.img});
  return out;
}
function stackSync(){
  const items=buildLayerTree(allNodes(),S.stack||[]);
  S.stack=items.map(treeItemKey);
  return items.filter(it=>it.n).map(it=>it.n);
}
/* Produtos novos pertencem à posição da fonte usada no cálculo, inclusive
   quando ela está em um subgrupo ou a seleção mudou durante um await.
   Recebe o objeto original (ou uma chave tipada), nunca um nome/ID ambíguo.
   Só é chamado na criação: arrastes posteriores continuam livres. */
function placeProductAbove(product,source){
  const nodes=allNodes(),resolve=ref=>{
    if(typeof ref==='string')return nodes.find(n=>nodeKey(n.t,n.id)===ref);
    return nodes.find(n=>n.o===ref||(ref&&ref.o===n.o&&ref.t===n.t));
  };
  const out=resolve(product),base=resolve(source);
  if(!out||!base||out.o===base.o)return false;
  stackSync();
  const key=nodeKey(out.t,out.id),baseKey=nodeKey(base.t,base.id);
  const stack=S.stack.filter(k=>k!==key),at=stack.indexOf(baseKey);
  if(at<0)return false;
  out.o.groupId=base.o.groupId??null;
  stack.splice(at,0,key);S.stack=stack;stackSync();
  /* Salvar ou sair do Layout devolve a pilha do mapa 2D. Inclua também nela
     o produto novo, mantendo a ordem independente das camadas já existentes. */
  const pre=S._view==='layout'?S._preLayoutMapState:null;
  if(Array.isArray(pre?.stack)){
    const saved=buildLayerTree(nodes,pre.stack).map(treeItemKey).filter(k=>k!==key);
    const atBase=saved.indexOf(baseKey);
    if(atBase>=0){saved.splice(atBase,0,key);pre.stack=saved;}
  }
  return true;
}
function nodeSetVis(n, vis){
  vis=!!vis;n.o.visible=vis;
  if(vis)window.GeoMineProjectOpening?.ensure(n);
  const lyr=nodeLayer(n);
  if(lyr){ if(vis) lyr.addTo(map); else map.removeLayer(lyr); }
  /* Uma alteração MANUAL feita pela árvore enquanto o Layout está aberto
     atualiza o estado de trabalho que será devolvido ao Mapa 2D, mas NÃO
     substitui a fotografia da prancha congelada. A prancha só recaptura a
     composição no botão explícito "Atualizar prancha". */
  if(S._view==='layout'&&!S._loRestoringVis){
    const k=nodeKey(n.t,n.id);
    if(S._preLayoutMapState&&S._preLayoutMapState.vis)
      S._preLayoutMapState.vis[k]=vis;
    if(S.loFrozen){
      if(typeof layoutVisSnapshot==='function')S._loDraftVis=layoutVisSnapshot();
      if(typeof layoutFrozenDirty==='function')layoutFrozenDirty(true);
    }
  }
  /* UMA fonte de verdade: o olho da árvore controla mapa, Layout e 3D.
     Mantém o antigo dicionário apenas como espelho compatível com projetos
     já salvos, nunca mais como uma seleção independente. */
  if(n.t==='R'){
    S._v3SurfOn=S._v3SurfOn||{};
    S._v3SurfOn[String(n.id)]=vis;
  }
  if((n.t==='L'||n.t==='R')&&S._view==='v3d'&&typeof v3SyncTreeVisibility==='function')
    v3SyncTreeVisibility(n,vis);
}
/* Um pane por nó da pilha. O z-index é atribuído em zApply, de baixo para
   cima, e vale igualmente para vetores e rasters.                          */
function panelDaCamada(chave){
  const nome='alagis_'+String(chave).replace(/[^\w]/g,'_');
  if(!map.getPane(nome)){
    const pn=map.createPane(nome);
    pn.style.zIndex=400;                 // sobre o tile base (200) e o overlayPane (400)
    pn.style.pointerEvents='auto';
  }
  return nome;
}
function zApply(){
  try{ if(typeof syncOrthoTiles==='function') syncOrthoTiles(); }catch(e){}
  try{ if(typeof syncDemTiles==='function') syncDemTiles(); }catch(e){}
  const nodes=stackSync();
  // z-index crescente de baixo para cima da pilha; vale entre vetor e raster
  const N=nodes.length;
  nodes.forEach((n,i)=>{
    const z=410+(N-i)*2;                 // topo da pilha = maior z
    const lyr=nodeLayer(n);
    if(!lyr) return;
    if(n.t==='L' || n.t==='R'){
      const pn=map.getPane(panelDaCamada(n.t+n.id));
      if(pn) pn.style.zIndex=z;
      /* Os tiles do MDT vivem num pane próprio: sem isto ficariam fixos sob
         as demais camadas, ignorando a ordem escolhida na árvore. */
      /* O preview do raster e os tiles nativos ocupam a mesma posicao na
         arvore, mas os tiles precisam ficar um nivel acima do preview. O
         espacamento de 2 entre os nos deixa esse +1 livre sem ultrapassar a
         camada imediatamente superior. */
      if(n.t==='R'){ const pt=map.getPane('demHD'+n.id); if(pt) pt.style.zIndex=z+1; }
    } else if(lyr.setZIndex){            // imagem/ortofoto: same tree order as MDT
      lyr.setZIndex(z);
      const pane=map.getPane('alagis_ortofoto');if(pane)pane.style.zIndex=z;
      const native=map.getPane('orthoHD');if(native)native.style.zIndex=z+1;
    } else if(lyr.bringToFront){
      lyr.bringToFront();
    }
  });
  // a régua fica sempre por cima: z calculado a partir do topo da pilha,
  // senão um projeto com muitas camadas voltaria a encobri-la
  try{ const pr=map.getPane('alagis_regua');
       if(pr) pr.style.zIndex=Math.max(690, 410+(N+1)*2+20); }catch(e){}
  try{ const pd=map.getPane('alagis_desenho');
       if(pd) pd.style.zIndex=Math.max(685, 410+(N+1)*2+15); }catch(e){}
}

/* ---------- Toast ---------- */
let toastT;
/* ===========================================================================
   CAIXA DE COMANDOS
   Registra o que o app está fazendo — avisos, etapas e erros — com hora e
   tempo decorrido, como a linha de comando do CAD. Serve para acompanhar
   operação longa e para relatar problema depois: o botão Copiar leva tudo.
   =========================================================================== */
const CMD={linhas:[], max:3000, t0:Date.now(), tUlt:Date.now()};
function cmdLog(msg, tipo){
  const agora=new Date();
  const dt=(Date.now()-CMD.tUlt)/1000; CMD.tUlt=Date.now();
  const hh=agora.toTimeString().slice(0,8);
  CMD.linhas.push({hh, dt, msg:String(msg), tipo:tipo||'info'});
  if(CMD.linhas.length>CMD.max) CMD.linhas.splice(0, CMD.linhas.length-CMD.max);
  const el=document.getElementById('cmdLog');
  // Minimizada, a caixa não mostra o histórico: ele é pintado ao restaurar.
  if(el && document.getElementById('cmdBox').style.display!=='none' && !(CMD.modo==='fixo'&&CMD.alt==='min')){
    cmdPinta(); el.scrollTop=el.scrollHeight;
  }
  const c=document.getElementById('cmdCnt');
  if(c) c.textContent=CMD.linhas.length+' linha(s)';
}
function cmdPinta(){
  const el=document.getElementById('cmdLog'); if(!el) return;
  const cor={info:'#d6d6d6', ok:'#7fd6a8', avisa:'#e8c07d', erro:'#ef8f8f', cmd:'#8ab4f8', etapa:'#c9a0ff'};
  el.innerHTML=CMD.linhas.slice(-800).map(l=>
    `<div><span style="color:#7b8794">${l.hh}</span>`+
    (l.dt>=0.05?` <span style="color:#5f6b7a">+${l.dt.toFixed(2)}s</span>`:'')+
    ` <span style="color:${cor[l.tipo]||'#d6d6d6'}">${esc(l.msg)}</span></div>`).join('');
}
/* Dois modos: FIXO no rodapé (largura total, como a linha de comando do CAD)
   e FLUTUANTE (janela arrastável pela barra de título e redimensionável pelo
   canto). O modo e a posição valem para a sessão.                          */
CMD.modo='fixo'; CMD.pos={left:60, top:80, w:560, h:320};
/* Altura no modo fixo:
   'auto' — a caixa acompanha o conteúdo: barra, andamento do carregamento (se
            houver), as últimas linhas do histórico e o campo de comando;
   'min'  — minimizada: só a barra e o andamento do carregamento. Fica assim
            até a pessoa restaurar; nenhum carregamento a reabre.
   CMD.hFix > 0 é a altura escolhida arrastando a alça, que vale no lugar da
   automática. A escolha entre 'auto' e 'min' é do aparelho, não do projeto. */
const CMD_ALT_KEY='geomine.cmd.alt.v1';
CMD.alt=(()=>{try{return localStorage.getItem(CMD_ALT_KEY)==='min'?'min':'auto';}catch(_){return 'auto';}})();
CMD.hFix=0;                                       // altura escolhida na alça (0 = automática)
/* No modo fixo a caixa acompanha a área PRINCIPAL, comum ao Mapa 2D, 3D e
   Layout. Assim a troca de vista não perde a referência quando #map some.   */
function cmdAncora(){
  const b=document.getElementById('cmdBox'); if(!b || CMD.modo!=='fixo') return;
  const readout=document.querySelector('.readout'), rr=readout&&readout.getBoundingClientRect();
  // A barra pode ocupar mais de uma linha, inclusive com zoom do navegador.
  const RO=rr&&rr.height>0?Math.ceil(Math.max(0,window.innerHeight-rr.top)+4):
    (document.body.classList.contains('alagis3')?56:38);
  const m=document.getElementById('main');
  if(!m){ b.style.left='0'; b.style.right='0'; b.style.bottom=RO+'px'; return; }
  const r=m.getBoundingClientRect();
  if(r.width<80 || r.height<60){ b.style.left='0'; b.style.right='0'; b.style.bottom=RO+'px'; return; }
  b.style.left=Math.round(r.left)+'px';
  b.style.width=Math.round(r.width)+'px';
  b.style.right='auto';
  b.style.bottom=Math.round(Math.max(RO, window.innerHeight-r.bottom))+'px';
  b.style.top='auto';
}
function cmdAplicaModo(){
  const b=document.getElementById('cmdBox'); if(!b) return;
  const bar=document.getElementById('cmdBar');
  const bt=document.getElementById('cmdModo');
  const min=CMD.modo==='fixo'&&CMD.alt==='min';
  b.classList.toggle('cmd-min',min);
  b.classList.toggle('cmd-auto',CMD.modo==='fixo'&&!min&&!CMD.hFix);
  if(CMD.modo==='flut'){
    const p=CMD.pos;
    b.style.left=p.left+'px'; b.style.top=p.top+'px';
    b.style.right='auto'; b.style.bottom='auto';
    b.style.width=p.w+'px'; b.style.height=p.h+'px';
    b.style.borderTop='1px solid #ffffff22';
    b.style.border='1px solid #ffffff33'; b.style.borderRadius='10px';
    b.style.boxShadow='0 10px 30px #0008';
    b.style.resize='both'; b.style.overflow='hidden'; b.style.minWidth='320px'; b.style.minHeight='180px';
    if(bar) bar.style.cursor='move';
    if(bt) bt.textContent='▭ Fixar';
  } else {
    b.style.height=(!min&&CMD.hFix)? CMD.hFix+'px' : 'auto';
    cmdAncora();                                  // largura e posição = área do mapa
    b.style.border='none'; b.style.borderTop='1px solid #ffffff22';
    b.style.borderRadius='0'; b.style.boxShadow='none';
    b.style.resize='none'; b.style.overflow='hidden';
    if(bar) bar.style.cursor='default';
    if(bt) bt.textContent='⧉ Flutuante';
  }
  if(CMD.modo==='fixo') cmdAncora();
  const ba=document.getElementById('cmdAlt');
  if(ba){ ba.style.display=(CMD.modo==='flut')?'none':'';
    ba.textContent=min?'▴':'▾';
    ba.title=min?'Restaurar a caixa de comandos':'Minimizar: fica só esta barra e o andamento do carregamento';
    ba.setAttribute('aria-label',min?'Restaurar a caixa de comandos':'Minimizar a caixa de comandos');
    ba.setAttribute('aria-expanded',String(!min)); }
}
function cmdSetAlt(a){
  CMD.alt=a==='min'?'min':'auto';
  try{localStorage.setItem(CMD_ALT_KEY,CMD.alt);}catch(_){}
  cmdAplicaModo();
  if(CMD.alt!=='min'){ cmdPinta();
    const el=document.getElementById('cmdLog'); if(el) el.scrollTop=el.scrollHeight; } }
function cmdSetModo(m){
  // CCMGIS 3.0: a linha pertence ao rodapé e nunca vira uma janela solta.
  if(document.body.classList.contains('alagis3')) m='fixo';
  if(CMD.modo==='flut' && m!=='flut'){        // guarda onde a janela estava
    const b=document.getElementById('cmdBox');
    if(b){ CMD.pos.left=parseInt(b.style.left)||CMD.pos.left;
           CMD.pos.top=parseInt(b.style.top)||CMD.pos.top;
           CMD.pos.w=b.offsetWidth||CMD.pos.w; CMD.pos.h=b.offsetHeight||CMD.pos.h; }
  }
  CMD.modo=m; cmdAplicaModo();
}
function cmdArrasta(){
  const b=document.getElementById('cmdBox'), bar=document.getElementById('cmdBar');
  if(!b||!bar) return;
  let ox=0, oy=0, ativo=false;
  bar.addEventListener('mousedown',e=>{
    if(CMD.modo!=='flut') return;
    if(e.target.tagName==='BUTTON') return;         // não arrasta ao clicar nos botões
    ativo=true; ox=e.clientX-b.offsetLeft; oy=e.clientY-b.offsetTop; e.preventDefault();
  });
  document.addEventListener('mousemove',e=>{
    if(!ativo) return;
    const L=Math.max(0, Math.min(window.innerWidth-80, e.clientX-ox));
    const T=Math.max(0, Math.min(window.innerHeight-40, e.clientY-oy));
    b.style.left=L+'px'; b.style.top=T+'px';
  });
  document.addEventListener('mouseup',()=>{ ativo=false; });
}
function cmdToggle(mostrar){
  const b=document.getElementById('cmdBox'); if(!b) return;
  const abrir=(mostrar===undefined)? (b.style.display==='none') : !!mostrar;
  b.style.display=abrir?'flex':'none';
  const a3=document.getElementById('a3CmdToggle'); if(a3) a3.classList.toggle('on',abrir);
  { const bf=document.getElementById('btnCmdFlut'); if(bf) bf.style.display=abrir?'none':'block'; }
  if(abrir){ cmdAplicaModo(); cmdPinta();
    const el=document.getElementById('cmdLog'); if(el) el.scrollTop=el.scrollHeight;
    const i=document.getElementById('cmdIn'); if(i) i.focus(); }
}
function cmdExecuta(txt){
  const t=String(txt||'').trim().toLowerCase();
  if(!t) return;
  cmdLog('> '+txt, 'cmd');
  if(t==='ajuda'||t==='?'){
    cmdLog('camadas · superfícies · crs · versão · limpar · memória · fixo · flutuante · maior · menor · fechar · selecionar · mover · copiar · girar · escalar · offset · suavizar','info'); return; }
  if(t==='limpar'){ CMD.linhas.length=0; cmdPinta(); return; }
  if(t==='fechar'){ cmdToggle(false); return; }
  if(t==='flutuante'||t==='flutuar'){ cmdSetModo('flut'); return; }
  if(t==='fixo'||t==='fixar'){ cmdSetModo('fixo'); return; }
  if(t==='maior'||t==='expandir'){ cmdSetAlt('normal'); return; }
  if(t==='menor'||t==='mini'){ cmdSetAlt('mini'); return; }
  if(t==='camadas'){
    if(!(S.layers||[]).length) return cmdLog('nenhuma camada','avisa');
    S.layers.forEach(L=>cmdLog(`${L.name} · ${L.gtype} · ${(L.features||[]).length} feição(ões) · ${L.crs}`,'info'));
    return; }
  if(t==='superficies'||t==='superfícies'){
    if(!(S.rasters||[]).length) return cmdLog('nenhuma superfície','avisa');
    S.rasters.forEach(r=>cmdLog(`${r.name} · ${r.d.nc}×${r.d.nr} · ${r.d.cs.toFixed(3)} m`+
      (r.d.resampled>1?` · reamostrado ÷${r.d.resampled}`:' · nativo'),'info'));
    return; }
  if(t==='crs'){ cmdLog('CRS de trabalho: '+S.workCRS,'info'); return; }
  if(t==='versao'||t==='versão'){ cmdLog('CCMGIS · teto de desenho '+(RASTER_MAX_CELLS/1e6).toFixed(0)+' M células','info'); return; }
  if(t==='memoria'||t==='memória'){
    const m=(performance&&performance.memory)?performance.memory:null;
    cmdLog(m? `heap ${(m.usedJSHeapSize/1048576).toFixed(0)} MB de ${(m.jsHeapSizeLimit/1048576).toFixed(0)} MB`
            : 'o navegador não informa uso de memória','info');
    return; }
  if(typeof edCmdPorAlias==='function'){
    const c=edCmdPorAlias(t);
    if(c){ if(typeof edLigar==='function' && (!window.ED||!ED.on)) edLigar(true,true);
      try{ c.run(); }catch(e){ cmdLog('falha: '+(e&&e.message||e),'erro'); } return; }
  }
  cmdLog('comando desconhecido — digite ajuda','avisa');
}
let toastT2=null;
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),2200);
  const s=String(msg);
  cmdLog(s, /⚠|falha|erro|inválid|não /i.test(s)?'avisa':'info'); }
