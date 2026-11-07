
/* ============================================================================
   LAYOUT · TRAZER A VISTA DO MAPA 2D

   Equivalente ao "Definir para a extensão da tela principal" do QGIS
   (Propriedades do item Mapa › Extensão). Copia da tela 2D para a prancha o
   CENTRO e a ESCALA; as camadas continuam sendo as fotografadas pelo
   congelamento — no QGIS a extensão e as camadas do item também são
   controles separados.

   Por que era preciso: o Layout enquadra por S.loCenter ou pelo retângulo do
   conteúdo visível, nunca pelo que o Mapa 2D está mostrando. O "Renderizar
   novamente" redesenha a mesma fotografia. Não havia caminho para dizer
   "mostre aqui o que estou vendo lá".

   Bloco ADITIVO: não edita nenhuma função existente.
   ========================================================================== */
(function(){
'use strict';
if(window.LOMAP2D){ console.info('[Layout←2D] já instalado'); return; }
window.LOMAP2D=1;

const CSS=`
#btnLoFromMap{background:#0f766e;color:#fff;font-weight:600}
#btnLoFromMap:hover{background:#12907f;border-color:#12907f}
#btnLoFromMap .lo-top-ic svg{stroke:#fff}
#btnLoFromMap2{background:#0f766e;color:#fff;border-color:#0f766e;flex:none;width:34px;min-width:34px;padding:4px}
#btnLoFromMap2:hover{background:#12907f}
#btnLoFromMap2 svg{width:19px;height:19px;stroke:#fff;fill:none;stroke-width:1.7;
  stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
`;
(function(){ const s=document.createElement('style'); s.id='lo-from-map-style';
  s.textContent=CSS; document.head.appendChild(s); })();

/* tela do mapa → seta → prancha */
const ICONE='<svg viewBox="0 0 24 24">'+
  '<rect x="1.6" y="5.6" width="9" height="7" rx="1.1"/>'+
  '<path d="M4.4 15.2h3.4M6.1 12.6v2.6"/>'+
  '<path d="M3.9 9.1h4.4M6.1 6.9v4.4" opacity=".5"/>'+
  '<path d="M12.4 9.1h3.1M15.5 9.1l-1.6-1.6M15.5 9.1l-1.6 1.6"/>'+
  '<rect x="16.7" y="3.3" width="5.7" height="13.4" rx="1.1"/>'+
  '<path d="M18.1 6.4h2.9M18.1 8.8h2.9M18.1 11.2h1.9" opacity=".55"/>'+
  '</svg>';

const ehGeo=c=>/4326|4674|4618|4989/.test(String(c||''));

/* ---- a vista precisa ser guardada ENQUANTO o mapa está visível ----
   No Layout o #map fica display:none; o Leaflet passa a medir 0 × 0 e
   getBounds() devolve uma caixa degenerada. Ler a extensão na hora do clique
   daria sempre zero. Então a última vista boa é registrada a cada
   movimento do mapa 2D e é ela que o botão consome. */
function mapaVisivel(){
  try{
    if(typeof map==='undefined'||!map||!map.getSize) return false;
    const sz=map.getSize();
    return !!(sz&&sz.x>10&&sz.y>10);
  }catch(e){ return false; }
}
function guardaVista(){
  try{
    if(!mapaVisivel()) return;
    const b=map.getBounds(); if(!b||!b.isValid||!b.isValid()) return;
    const c=map.getCenter();
    S._loVista2D={w:b.getWest(),e:b.getEast(),s:b.getSouth(),n:b.getNorth(),
                  lat:c.lat,lng:c.lng,z:map.getZoom(),at:Date.now()};
  }catch(e){}
}
function ligaVigia(){
  if(typeof map==='undefined'||!map||!map.on||ligaVigia._on) return;
  ligaVigia._on=1;
  map.on('moveend zoomend resize load',guardaVista);
  guardaVista();
}

/* Extensão da tela projetada no CRS de trabalho. Um retângulo em lat/lon não
   projeta num retângulo alinhado aos eixos: a envoltória sai de pontos ao
   longo das quatro bordas, não apenas dos quatro cantos. */
function caixaDaTela(){
  if(mapaVisivel()) guardaVista();
  const V=S._loVista2D;
  if(!V) return null;
  const w=V.w, e=V.e, s=V.s, n=V.n;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  const N=8, add=(lng,lat)=>{
    let p; try{ p=fromWGS(S.workCRS,lng,lat); }catch(err){ return; }
    if(!p||!isFinite(p[0])||!isFinite(p[1])) return;
    if(p[0]<x0)x0=p[0]; if(p[0]>x1)x1=p[0];
    if(p[1]<y0)y0=p[1]; if(p[1]>y1)y1=p[1];
  };
  for(let i=0;i<=N;i++){
    const t=i/N, lng=w+(e-w)*t, lat=s+(n-s)*t;
    add(lng,s); add(lng,n); add(w,lat); add(e,lat);
  }
  if(!isFinite(x0)) return null;
  let pc; try{ pc=fromWGS(S.workCRS,V.lng,V.lat); }catch(err){ pc=null; }
  if(!pc||!isFinite(pc[0])||!isFinite(pc[1])) pc=[(x0+x1)/2,(y0+y1)/2];
  return {cE:pc[0], cN:pc[1], spanE:x1-x0, spanN:y1-y0};
}

async function trazerDoMapa2D(){
  if(typeof map==='undefined'||!map){ toast('Mapa 2D indisponível'); return; }
  if(ehGeo(S.workCRS)){
    toast('CRS de trabalho geográfico — a escala da prancha é métrica. Reprojete para UTM/SIRGAS.');
    return;
  }
  /* A largura e a altura da MOLDURA (em mm) vêm do último desenho da prancha.
     Sem elas não há como converter uma extensão em metros no denominador da
     escala. Se o Layout ainda não desenhou, desenha uma vez antes. */
  if(!S._loT){ try{ await buildLayout(); }catch(e){} }
  const T=S._loT;
  if(!T||!(T.mapW>0)||!(T.mapH>0)){ toast('Abra o Layout uma vez antes de trazer a vista'); return; }

  const cx=caixaDaTela();
  if(!cx||!(cx.spanE>0)||!(cx.spanN>0)){
    toast('Sem vista do Mapa 2D registrada — abra o Mapa 2D, enquadre a área e volte ao Layout');
    return;
  }

  /* A moldura da prancha e a janela da tela raramente têm a mesma proporção.
     Como no QGIS, a extensão da tela é CONTIDA na moldura: manda o eixo mais
     exigente, e sobra margem no outro. */
  const nec=Math.max(1000*cx.spanE/T.mapW, 1000*cx.spanN/T.mapH);
  const escala=Math.max(100,Math.min(100000000,Math.ceil(nec)));

  S.loCenter=[cx.cE,cx.cN];
  S._loPick=false;
  const sIn=document.getElementById('loScale'); if(sIn) sIn.value=escala;
  /* A escala automática regravaria o denominador no próximo desenho e a
     extensão trazida se perderia. Em Figura quem manda é loFitW; na prancha
     A4/A3, loScaleAuto. Os dois são desligados. */
  const auto=document.getElementById('loScaleAuto'); if(auto) auto.checked=false;
  const fitW=document.getElementById('loFitW');      if(fitW) fitW.checked=false;

  try{ if(typeof syncLoBtns==='function') syncLoBtns(); }catch(e){}
  try{ if(typeof layoutSideMenuSync==='function') layoutSideMenuSync(); }catch(e){}
  const sw=document.getElementById('sheetWrap'); if(sw) sw.style.cursor='';
  /* loApplyAll grava escala e centro na prancha ativa (plateCapture) e
     redesenha — é o mesmo caminho do botão "Renderizar novamente". */
  try{ loApplyAll(); }
  catch(e){ try{ buildLayout(); }catch(_){} }

  toast('Vista do Mapa 2D aplicada · escala 1:'+escala.toLocaleString('pt-BR'));
  try{ cmdLog('Layout: extensão trazida do Mapa 2D · centro E '+cx.cE.toFixed(0)+
    ' N '+cx.cN.toFixed(0)+' · '+(cx.spanE/1000).toFixed(2)+' × '+(cx.spanN/1000).toFixed(2)+
    ' km · escala 1:'+escala,'ok'); }catch(e){}
}
window.loTrazerVistaMapa2D=trazerDoMapa2D;

function instalar(){
  const barra=document.querySelector('.layoutbar');
  if(barra && !document.getElementById('btnLoFromMap')){
    const b=document.createElement('button');
    b.type='button'; b.className='tbtn'; b.id='btnLoFromMap';
    b.title='Trazer a vista do Mapa 2D para a prancha — centro e escala da tela, '+
            'como o "definir para a extensão da tela principal" do QGIS';
    b.setAttribute('aria-label','Trazer a vista do Mapa 2D');
    b.innerHTML='<span class="lo-top-ic">'+ICONE+'</span>';
    b.onclick=trazerDoMapa2D;
    const ref=document.getElementById('btnLoCenterReset');
    if(ref&&ref.parentNode===barra) barra.insertBefore(b,ref.nextSibling);
    else barra.appendChild(b);
  }
  /* Mesma ação no painel lateral do Layout, ao lado do "Atualizar figura" */
  const ref2=document.getElementById('btnLoCenterReset2');
  if(ref2&&ref2.parentNode&&!document.getElementById('btnLoFromMap2')){
    const b2=document.createElement('button');
    b2.type='button'; b2.className='tbtn'; b2.id='btnLoFromMap2';
    b2.title='Trazer a vista do Mapa 2D (centro e escala da tela)';
    b2.setAttribute('aria-label','Trazer a vista do Mapa 2D');
    b2.innerHTML=ICONE;
    b2.onclick=trazerDoMapa2D;
    ref2.parentNode.insertBefore(b2,ref2.nextSibling);
  }
}
function partida(){ instalar(); ligaVigia(); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',partida,{once:true});
else partida();
/* o mapa pode ser criado depois deste bloco */
let tentativas=0;
const vigiaTimer=setInterval(()=>{ ligaVigia(); if(ligaVigia._on||++tentativas>40) clearInterval(vigiaTimer); },250);
/* A barra é HTML estático, mas uma entrada tardia no Layout não pode ficar
   sem o botão caso algo o remova. */
setTimeout(partida,600);
})();
