(function(root){
'use strict';
// Somente a apresentação: mantém os próprios nós, IDs, listeners e estados dos
// formulários. Não lê nem copia rasters, imagens ou geometrias do projeto.
const done=new WeakSet(),pending=new Set();let scheduled=false;
const fields='input:not([type=hidden]):not([type=file]),select,textarea';
const existing='.gm-work-card,.fv-step,.cava-flow-step';
const panelSelector='.sec,.hsec,.modal-bg,#gmDimLayerStyle';
const numberWindows='#ribbonPop,#right,#propDockContent,.modal-bg';
const numberWatchers=new WeakMap(),numberPending=new Set();let numberScheduled=false;
function numberWindow(host){
 if(!host.isConnected||!host.getClientRects().length)return;
 const counts=new Map();
 for(const step of host.querySelectorAll('.gm-card-heading>.gm-card-step')){
  if(step.closest(numberWindows)!==host||!step.getClientRects().length)continue;
  // Cada aba de propriedades é uma sequência; seções de uma ferramenta
  // compartilham a sequência da janela, inclusive ao recolher e reabrir.
  const scope=step.closest('.lp-pane')||host,n=(counts.get(scope)||0)+1;
  counts.set(scope,n);const value=String(n);
  if(step.dataset.gmCardNumber!==value)step.dataset.gmCardNumber=value;
  if(/^\d+$/.test(step.textContent.trim())&&step.textContent!==value)step.textContent=value;
 }
}
function requestNumbers(host){
 if(!host)return;numberPending.add(host);if(numberScheduled)return;
 numberScheduled=true;requestAnimationFrame(()=>{
  numberScheduled=false;const batch=[...numberPending];numberPending.clear();batch.forEach(numberWindow);
 });
}
function watchNumbers(host){
 if(!numberWatchers.has(host)){
  const observer=new MutationObserver(()=>requestNumbers(host));
  // Só janelas e docks: mudanças de estilo no mapa e na árvore não entram.
  observer.observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','open']});
  numberWatchers.set(host,observer);
 }
 requestNumbers(host);
}
function numberScopes(scope){
 const owner=scope.closest?.(numberWindows);if(owner)watchNumbers(owner);
 scope.querySelectorAll(numberWindows).forEach(watchNumbers);
}
const schemas={
 secCRS:[['Sistema de coordenadas']],
 secCAD:[['Coordenadas'],['Precisão e encaixe','#cadOrtho'],['Paralela / offset','#cadOffD'],['Hachura','#btnCadHatch'],['Edição de linhas','#btnCadRef'],['Limpeza do projeto','#limTol'],['Exportar DXF','#cadDxfScope']],
 secLayout:[['Título e identificação'],['Logomarca','#cliLogoFile'],['Escala e coordenadas','#loScale'],['Papel e enquadramento','#loA4Paper'],['Elementos do mapa','#loCart'],['Legenda e símbolos','h4'],['Escala gráfica','#loBarPasso']],
 secCNOrto:[['Produto'],['Solo e coeficientes','#hCnCInputs'],['Ortofoto e terreno','#hCnOrtoSource'],['Área e geração','#hCnLimite'],['Média por área','#hCZoneSection']],
 secHidroInund:[['Terreno'],['Destino','#hInundDestination'],['Barramento e níveis','#hInundBarrier'],['Simulação','#hInundIni']],
 secHidroSerie:[['Dados da estação'],['Período e depuração','#hAno']],
 secHidroIDF:[['Ajuste da série'],['Curva IDF','#hT']],
 secHidroMDE:[['Modelo de elevação']],
 secHidroRede:[['Rede de drenagem']],
 secHidroBacia:[['Exutório e bacia']],
 secPointCatchment:[['Terreno e exutório']],
 secDrenagem:[['Traçado e dimensionamento']],
 secCAR:[['Localização'],['Temas','#carTemas'],['Baixar e importar','#carBaixar']],
 secProjecoes:[['Linha e terreno'],['Bancadas','#prLado'],['Interseção e corte','#prCorte'],['Superfície e resultado','#prProduto']],
 secVecOps:[['Poligonizar raster','#opPolygonizeRaster'],['Diferença simétrica','#sdA'],['Mesclar camadas','#opMergeLayers'],['Poligonizar linhas','#opCloseLines'],['Dissolver polígonos','#opDissolve'],['Extrair limite','#opExtractBoundary']],
 lidarModal:[['Arquivo'],['Reamostragem','#lidarEsp'],['Classificação e propriedades','#lidarClasseFiltro']],
 vectorDrapeModal:[['Feições e terreno']],
 slopeHachureModal:[['Origem e destino'],['Padrão dos cílios','#hachureSpacing']],
 seloModal:[['Identificação da prancha'],['Responsáveis','#seloResp']],
 bufModal:[['Geometria do buffer']],
 pubModal:[['Conteúdo e visualizações'],['Terreno 3D','#pubDem'],['Ferramentas e publicação','#pubMedDist']],
 drawDest:[['Destino do desenho']]
};
const text=n=>(n?.textContent||'').replace(/\s+/g,' ').trim();
function badge(doc){const s=doc.createElement('span');s.className='gm-card-step';s.setAttribute('aria-hidden','true');return s;}
function heading(doc,title){const h=doc.createElement('div');h.className='gm-card-heading';h.append(badge(doc));const b=doc.createElement('b');b.textContent=title;h.append(b);return h;}
function decorate(card,title,hd){
 if(!card||card.classList.contains('gm-panel-card')||card.classList.contains('gm-work-card'))return;
 const doc=card.ownerDocument;
 hd=hd||card.querySelector(':scope>.gmp-hd,:scope>summary,:scope>h4,:scope>h5,:scope>.cava-step-head,:scope>header,:scope>legend');
 card.classList.add('gm-work-card','gm-panel-card');
 if(!hd){hd=heading(doc,title||'Configuração');card.prepend(hd);}
 else{
  hd.classList.add('gm-card-heading');
  // Alguns módulos já têm seu número de etapa e seus controles no cabeçalho.
  const step=hd.querySelector('.cava-step-n');if(step)step.classList.add('gm-card-step');
  if(!hd.querySelector('.gm-card-step'))hd.prepend(badge(doc));
 }
 card.setAttribute('role','group');
 card.setAttribute('aria-label',title||text(hd.querySelector('.gmp-t,b')||hd).slice(0,100)||'Configuração');
}
function topNode(host,node){while(node&&node.parentElement!==host)node=node.parentElement;return node;}
function startOfField(host,node){
 node=topNode(host,node);if(!node)return null;
 // Mantém o rótulo junto ao campo, inclusive rótulos com sliders no conteúdo.
 const prev=node.previousElementSibling;
 if(prev?.matches('label.field')&&!prev.querySelector('input,select,textarea'))node=prev;
 return node;
}
function labelTitle(node,fallback){
 const s=text(node?.querySelector(':scope>h4,:scope>h5,:scope>summary,:scope>b')||null);
 if(s&&s.length<90)return s;
 const label=text(node?.matches('label')?node:node?.querySelector('label'));
 if(/arquivo|fonte|origem|modelo|MDT|MDE|raster|ortofoto/i.test(label))return 'Dados de entrada';
 if(/destino|saída|salvar|exportar/i.test(label))return 'Destino e resultado';
 if(/cor|estilo|opacidade|espessura|exibi|símbolo|rótulo/i.test(label))return 'Exibição';
 if(/área|polígono|linha|limite|camada/i.test(label))return 'Área e feições';
 return fallback||'Parâmetros';
}
function split(host,rules){
 if(!host||done.has(host)&&host.querySelector('.gm-panel-card'))return;done.add(host);host.classList.add('gm-card-stack');
 const kids=[...host.children].filter(e=>!e.matches('h2,h3,.modal-h,.modal-f,.gmp-f,.stickybar,script,style,.command-resize-grip'));
 if(!kids.length)return;
 const starts=new Map();let first=kids[0];
 // Um aviso introdutório estático vai ao ⓘ. Status com ID nunca são ocultados.
 let intro=null;
 if(first.matches('.hint')&&!first.id&&!first.querySelector('button,a,input,select,textarea')&&text(first).length>100){intro=first;first=kids[1]||first;}
 starts.set(first,rules?.[0]?.[0]||labelTitle(first,'Configuração'));
 for(const [title,selector] of (rules||[]).slice(1)){
  const n=host.querySelector(selector),start=startOfField(host,n);
  if(start&&kids.includes(start)&&!start.matches('h2,h3'))starts.set(start,title);
 }
 // Preserva as unidades semânticas já existentes: detalhes, etapas e operações.
 for(const k of kids){
  if(k.matches(existing+ ',.hsec,.sec')){starts.set(k,starts.get(k)||labelTitle(k,'Configuração'));const next=k.nextElementSibling;if(next&&!next.matches('h2,h3'))starts.set(next,starts.get(next)||labelTitle(next,'Resultado'));}
  else if(k.matches('details,fieldset,h4,h5')||(k.matches('div')&&k.style.borderTop&&k.querySelector(fields))){
   starts.set(k,starts.get(k)||labelTitle(k,'Parâmetros'));
   if(k.matches('details,fieldset')){const next=k.nextElementSibling;if(next&&!next.matches('h2,h3'))starts.set(next,starts.get(next)||labelTitle(next,'Configuração'));}
  }
 }
 // Formulários legados sem subtítulos: no máximo quatro unidades de campos
 // consecutivas por card. Nunca separa labels, linhas de grade ou controles.
 if(starts.size===1&&host.querySelectorAll(fields).length>6){
  let units=0;
  for(const k of kids){
   const controls=(k.matches(fields)?1:0)+k.querySelectorAll(fields).length;
   if(controls&&units>=4){const start=startOfField(host,k);starts.set(start,labelTitle(start,'Ajustes'));units=0;}
   if(controls)units++;
  }
 }
 const groups=[];let current=null;
 for(const k of kids){
  if(k===intro)continue;
  if(starts.has(k)||!current){current={title:starts.get(k)||'Configuração',nodes:[]};groups.push(current);}
  current.nodes.push(k);
 }
 for(const g of groups){
  const only=g.nodes.length===1?g.nodes[0]:null;
  if(only?.matches('.hsec,.sec'))continue;
  if(only?.matches(existing)){decorate(only,g.title);continue;}
  if(only?.matches('details,fieldset')||(only?.matches('div')&&only.querySelector(fields))){decorate(only,g.title);continue;}
  // Resultados vazios e ações finais ficam próximos de sua configuração.
  if(!g.nodes.some(n=>n.matches('input,select,textarea,button,details,fieldset,h4,h5')||n.querySelector('input,select,textarea,button'))){continue;}
  const card=host.ownerDocument.createElement('section');g.nodes[0].before(card);
  for(const node of g.nodes)card.append(node);
  decorate(card,g.title,card.querySelector(':scope>h4,:scope>h5'));
 }
 if(intro){
  const hd=host.querySelector('.gm-card-heading');
  if(hd){const info=host.ownerDocument.createElement('details');info.className='gm-card-info';
   const s=host.ownerDocument.createElement('summary');s.textContent='ⓘ';s.setAttribute('aria-label','Sobre esta ferramenta');info.append(s,intro);hd.append(info);intro.classList.remove('hint');}
 }
}
function propertyCards(modal){
 for(const pane of modal.querySelectorAll('.lp-pane,.modal-b'))pane.classList.add('gm-card-stack');
 for(const card of modal.querySelectorAll('.gmp-sec,.lp-cls-ctrl'))decorate(card,card.querySelector(':scope>.gmp-c #lpOpacity')?'Aparência':null);
 const dim=modal.querySelector('#gmDimLayerStyle');if(dim)decorate(dim,'Estilo das cotas');
 // Gmp também é usado em ferramentas pequenas, sem seções de propriedades.
 const b=modal.querySelector('.modal-b');
 if(b&&!b.querySelector('.gm-work-card')){
  const inner=b.children.length===1&&b.firstElementChild.matches('.gmp-c')?b.firstElementChild:b;
  split(inner,schemas[modal.id]);
 }
}
function enhance(panel){
 if(!panel?.isConnected)return;
 // Painéis com cards escritos à mão no template: só a numeração é comum.
 if(panel.id==='secBacia'||panel.id==='secHydraulicStairs'||panel.id==='secCivil')return;
 if(panel.matches('.modal-bg')){
  if(panel.querySelector('.gmp')){propertyCards(panel);return;}
  const body=panel.querySelector('.modal-b')||panel.querySelector(':scope>.modal');
  if(body&&body.querySelector(fields)&&!body.querySelector('.sec,.hsec,.gm-work-card,.lp-pane'))split(body,schemas[panel.id]);
  return;
 }
 if(panel.id==='gmDimLayerStyle'){decorate(panel,'Estilo das cotas');return;}
 const host=panel.querySelector(':scope>.body,:scope>.hbody')||panel;
 split(host,schemas[panel.id]);
}
function featureCards(menu){
 if(done.has(menu))return;done.add(menu);
 const groups=[['Editar',['vertex','continue','mover','girar']],['Consultar e estilizar',['attr','styleedit','stylebrush','styleclear','zoom']],['Organizar',['clipcopy','clippaste','copy','move','del']]];
 groups.forEach(([title,actions],i)=>{
  const buttons=actions.map(a=>menu.querySelector('.fm-it[data-act="'+a+'"]')).filter(Boolean);if(!buttons.length)return;
  const card=menu.ownerDocument.createElement('div');card.className='gm-feature-card';card.setAttribute('role','group');card.setAttribute('aria-label',title);
  buttons[0].before(card);const hd=heading(menu.ownerDocument,title);hd.querySelector('.gm-card-step').textContent=String(i+1);card.append(hd,...buttons);
 });
}
function scan(scope){
 const panels=[];
 if(scope.matches?.(panelSelector))panels.push(scope);
 panels.push(...scope.querySelectorAll(panelSelector));
 // Filhos primeiro: o pai não absorve os cards de um submódulo.
 for(const p of panels.reverse())enhance(p);
 if(scope.matches?.('.feat-menu'))featureCards(scope);
 scope.querySelectorAll('.feat-menu').forEach(featureCards);
 numberScopes(scope);
}
function queue(node){
 if(!node||node.nodeType!==1)return;
 const owner=node.closest(panelSelector+',.feat-menu');
 if(owner)pending.add(owner);
 if(node.matches(panelSelector+',.feat-menu')||node.querySelector(panelSelector+',.feat-menu'))pending.add(node);
 if(!pending.size||scheduled)return;scheduled=true;
 requestAnimationFrame(()=>{scheduled=false;const batch=[...pending];pending.clear();batch.forEach(scan);});
}
scan(document.body);
new MutationObserver(records=>{
 for(const record of records){
  // O mapa e a árvore podem criar milhares de nós por quadro. Só examina
  // conteúdo de formulários e janelas adicionadas diretamente ao shell.
  const target=record.target.nodeType===1?record.target:null;
  if(!target||!target.closest(panelSelector+',.feat-menu,#ribbonPop,#edBox')&&target.closest('#map,#v3d,#sheetWrap,#cava2Workspace,#layerList,.leaflet-container'))continue;
  if(record.target.nodeType===1&&record.target.closest('.modal-bg'))queue(record.target);
  for(const n of record.addedNodes)if(n.nodeType===1&&!n.matches('.gm-card-heading,.gm-card-step'))queue(n);
 }
}).observe(document.body,{childList:true,subtree:true});
// O corpo controla o recolhimento do dock e os modos de visualização.
new MutationObserver(()=>numberScopes(document.body)).observe(document.body,{attributes:true,attributeFilter:['class']});
root.addEventListener('resize',()=>numberScopes(document.body));
root.GeoMinePanelCards={enhance:scan,version:2};
})(window);
