
/* ============================================================================
   1) CORREÇÃO — layerBounds com feição de geometria vazia
      featToLatLngs descarta anel inválido e pode devolver []. layerBounds
      lia lls[0][0] sem conferir, e o buffer de 18 mil pontos (onde ao menos
      um saiu sem anel utilizável) derrubava fitLayer/fitAll com
      "Cannot read properties of undefined (reading '0')".

   2) ESCALA DO LAYOUT — barra por passos redondos, número digitável e lista
      das escalas usuais de 250 em 250.
      A barra antiga percorria ESCALA_PASSOS, com ~1.900 posições: arrastar
      dava 1:11.750, 1:12.000, 1:12.250… A régua passa a ser a série
      cartográfica redonda; a lista de 250 em 250 continua acessível, e
      digitar um valor qualquer segue permitido.

   Bloco ADITIVO: envelopa layerBounds e religa o botão da escala; nenhuma
   função existente é editada.
   ========================================================================== */
(function(){
'use strict';
if(window.LOESC){ console.info('[escala] já instalado'); return; }
window.LOESC=1;

/* ---------------------------------------------------------------- 1 ---- */
/* featToLatLngs é o funil por onde passam desenho, enquadramento, plotagem e
   exportação. A linha `f.multi && Array.isArray(f.geom[0][0])` estoura quando
   geom vem vazia ou com buraco no índice 0 — foi assim que o buffer derrubou
   o addLayer antes mesmo de chegar ao layerBounds. */
(function(){
  const base=window.featToLatLngs;
  if(typeof base!=='function') return;
  window.featToLatLngs=function(L,f){
    if(!L||!f) return [];
    const g=f.geom;
    if(!Array.isArray(g)||!g.length||g[0]==null) return [];
    try{ return base.call(this,L,f)||[]; }
    catch(e){ console.warn('geometria ilegível descartada:',e&&e.message); return []; }
  };
})();
(function(){
  const base=window.layerBounds;
  if(typeof base!=='function') return;
  window.layerBounds=function(L){
    const b=L2.latLngBounds([]);
    if(!L||!Array.isArray(L.features)) return b;
    L.features.forEach(f=>{
      if(!f||!f.geom) return;
      try{ if(typeof featureVisible==='function'&&!featureVisible(L,f)) return; }catch(e){ return; }
      let lls; try{ lls=featToLatLngs(L,f); }catch(e){ return; }
      /* Uma feição sem anel utilizável devolve [] — e era exatamente isto
         que quebrava a leitura de lls[0][0]. */
      if(!Array.isArray(lls)||!lls.length) return;
      const flat=(L.gtype==='point')?lls
        :(Array.isArray(lls[0])&&Array.isArray(lls[0][0])?lls.flat():lls);
      if(!Array.isArray(flat)) return;
      flat.forEach(c=>{
        if(Array.isArray(c)&&Number.isFinite(c[0])&&Number.isFinite(c[1])){
          try{ b.extend(c); }catch(e){}
        }
      });
    });
    return b;
  };
})();

/* A exportação não passa por featToLatLngs e repete o mesmo acesso direto.
   Em vez de blindar as 128 ocorrências de geom[0][0] espalhadas pelo
   programa — refatoração ampla e arriscada —, a camada é exportada sem as
   feições de geometria inutilizável, e devolvida intacta em seguida. */
(function(){
  const base=window.layerToGeoJSON;
  if(typeof base!=='function') return;
  const usavel=f=>!!(f&&Array.isArray(f.geom)&&f.geom.length&&f.geom[0]!=null);
  window.layerToGeoJSON=function(L){
    if(!L||!Array.isArray(L.features)) return base.apply(this,arguments);
    const todas=L.features, bons=todas.filter(usavel);
    if(bons.length===todas.length) return base.apply(this,arguments);
    L.features=bons;
    try{ return base.call(this,L); }
    finally{ L.features=todas; }
  };
})();

/* Uma feição cuja geom é [] ou [undefined] não tem o que desenhar e é o que
   faz os 128 acessos diretos a geom[0][0] estourarem. Barrá-la na porta de
   entrada das camadas protege todos eles sem tocar em nenhum. Feição com
   coordenada não finita CONTINUA entrando — ela tem geometria, só não é
   plotável, e descartá-la em silêncio esconderia um erro de projeção. */
(function(){
  const base=window.addLayer;
  if(typeof base!=='function') return;
  const semGeometria=f=>!f||!Array.isArray(f.geom)||!f.geom.length||f.geom[0]==null;
  window.addLayer=function(o){
    try{
      if(o&&Array.isArray(o.features)){
        const n0=o.features.length;
        const bons=o.features.filter(f=>!semGeometria(f));
        if(bons.length!==n0){
          o=Object.assign({},o,{features:bons});
          const n=n0-bons.length;
          try{ cmdLog('"'+(o.name||'camada')+'": '+n+' feição(ões) sem geometria descartada(s) na entrada','avisa'); }catch(e){}
          setTimeout(()=>{ try{ toast(n+' feição(ões) sem geometria foram descartadas'); }catch(e){} },900);
        }
      }
    }catch(e){ console.warn('triagem de geometria:',e&&e.message); }
    return base.call(this,o);
  };
})();

/* ---------------------------------------------------------------- 2 ---- */
const CSS=`
.lo-esc-row{display:grid;grid-template-columns:25px 1fr;gap:6px;align-items:center;margin-top:6px}
.lo-esc-row select{width:100%;padding:4px 6px;font-family:var(--mono);font-size:11.5px;
  background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:6px}
.lo-esc-row select:focus{outline:none;border-color:var(--amber)}
#loQuickValue{font-family:var(--mono);text-align:right;cursor:text}
#loQuickValue:focus{outline:none;border-color:var(--amber);background:var(--bg)}
.lo-esc-dica{font-size:9.5px;color:var(--ink-dim);line-height:1.3;margin-top:5px;padding-left:31px}
`;
(function(){ const s=document.createElement('style'); s.id='lo-esc-style';
  s.textContent=CSS; document.head.appendChild(s); })();

/* Série cartográfica redonda — é o que a barra percorre. Cada passo é uma
   escala que se escreve num desenho sem constranger ninguém. */
const REDONDAS=[100,250,500,750,1000,1250,1500,2000,2500,3000,4000,5000,6000,7500,
  10000,12500,15000,20000,25000,30000,40000,50000,60000,75000,100000,125000,150000,
  200000,250000,500000,750000,1000000,2000000,5000000,10000000];

/* Lista pedida: de 250 em 250 até 1:25.000, e depois as redondas maiores. */
const LISTA_250=(()=>{ const a=[]; for(let v=250;v<=25000;v+=250)a.push(v); return a; })();
const LISTA_GRANDES=REDONDAS.filter(v=>v>25000);

const ICONE_BARRA='<svg viewBox="0 0 24 24" style="width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round">'+
  '<path d="M4 17h16M6 14v6M10 16v4M14 14v6M18 16v4"/><path d="M6 7h12M6 7l2-2M6 7l2 2M18 7l-2-2M18 7l-2 2"/></svg>';
const ICONE_LISTA='<svg viewBox="0 0 24 24" style="width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round">'+
  '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/></svg>';

const fmt=v=>'1:'+Math.round(v).toLocaleString('pt-BR');
const maisProxima=v=>{ let b=0,d=Infinity;
  REDONDAS.forEach((n,i)=>{ const q=Math.abs(n-v); if(q<d){d=q;b=i;} }); return b; };

let redesenhar=null;
function agenda(){
  clearTimeout(redesenhar);
  redesenhar=setTimeout(()=>{
    try{ if(typeof plateCapture==='function') plateCapture(); }catch(e){}
    try{ buildLayout(); }catch(e){}
  },170);
}

function abrirEscala(){
  const panel=document.getElementById('layoutQuickPanel');
  const valEl=document.getElementById('loScale');
  if(!panel||!valEl) return;
  /* mesmo comportamento de alternância do painel original */
  if(panel.classList.contains('open')&&panel.dataset.kind==='scale'){
    panel.classList.remove('open');
    try{ layoutSideMenuSync(); }catch(e){}
    return;
  }
  panel.classList.remove('open');
  panel.dataset.kind='scale';
  const autoEl=document.getElementById('loScaleAuto');
  const fitEl=document.getElementById('loFitW');
  const autoOn=!!((autoEl&&autoEl.checked)||(!autoEl&&fitEl&&fitEl.checked));
  const atual=Math.max(100,Math.min(100000000,+valEl.value||5000));

  const opcao=v=>'<option value="'+v+'"'+(v===atual?' selected':'')+'>'+fmt(v)+'</option>';
  panel.innerHTML='<div class="layout-slider-list">'+
    '<div class="layout-slider-row" title="Escala da figura">'+
      '<span class="layout-slider-icon" aria-hidden="true">'+ICONE_BARRA+'</span>'+
      '<input id="loQuickRange" type="range" aria-label="Escala da figura" min="0" max="'+(REDONDAS.length-1)+'" step="1" value="'+maisProxima(atual)+'">'+
      '<input id="loQuickValue" class="layout-slider-value" inputmode="numeric" aria-label="Digitar a escala" value="'+fmt(atual)+'">'+
      '<button type="button" id="loQuickAuto" class="layout-slider-auto'+(autoOn?' on':'')+'" title="Escala automática" aria-label="Escala automática" aria-pressed="'+(autoOn?'true':'false')+'">A</button>'+
    '</div>'+
    '<div class="lo-esc-row">'+
      '<span class="layout-slider-icon" aria-hidden="true">'+ICONE_LISTA+'</span>'+
      '<select id="loQuickList" aria-label="Escalas usuais">'+
        (REDONDAS.indexOf(atual)<0&&LISTA_250.indexOf(atual)<0?'<option value="" selected>'+fmt(atual)+' — fora da lista</option>':'')+
        '<optgroup label="De 250 em 250 — até 1:25.000">'+LISTA_250.map(opcao).join('')+'</optgroup>'+
        '<optgroup label="Escalas maiores">'+LISTA_GRANDES.map(opcao).join('')+'</optgroup>'+
      '</select>'+
    '</div>'+
    '<div class="lo-esc-dica">Barra: passos redondos · caixa: digite qualquer valor e tecle Enter · lista: escolha e a barra acompanha</div>'+
  '</div>';
  panel.classList.add('open');

  const rg=panel.querySelector('#loQuickRange'),
        out=panel.querySelector('#loQuickValue'),
        lst=panel.querySelector('#loQuickList'),
        au=panel.querySelector('#loQuickAuto');

  /* Aplica uma escala EXATA: a barra vai para o passo redondo mais próximo,
     mas o valor digitado não é arredondado. */
  const aplica=(v,origem)=>{
    const esc=Math.max(100,Math.min(100000000,Math.round(+v||5000)));
    valEl.value=esc;
    if(origem!=='barra') rg.value=maisProxima(esc);
    if(origem!=='caixa') out.value=fmt(esc);
    if(origem!=='lista'){
      const achou=[...lst.options].find(o=>+o.value===esc);
      lst.value=achou?achou.value:'';
      if(!achou){
        let solto=lst.querySelector('option[value=""]');
        if(!solto){ solto=document.createElement('option'); solto.value=''; lst.insertBefore(solto,lst.firstChild); }
        solto.textContent=fmt(esc)+' — fora da lista';
        lst.value='';
      }
    }
    /* Escolher escala é decidir a escala: a automática regravaria o valor no
       próximo desenho. Em Figura quem manda é loFitW; na prancha, loScaleAuto. */
    if(autoEl) autoEl.checked=false;
    if(fitEl) fitEl.checked=false;
    au.classList.remove('on'); au.setAttribute('aria-pressed','false');
    try{ layoutSideMenuSync(); }catch(e){}
    agenda();
  };

  rg.oninput=()=>aplica(REDONDAS[Math.max(0,Math.min(REDONDAS.length-1,+rg.value||0))],'barra');
  lst.onchange=()=>{ if(lst.value) aplica(+lst.value,'lista'); };
  const digitado=()=>{
    const txt=String(out.value), denom=txt.includes(':')?txt.split(':').pop():txt;
    const n=+String(denom).replace(/[^0-9]/g,'');
    if(!n){ out.value=fmt(+valEl.value||5000); return; }
    aplica(n,'caixa'); out.value=fmt(Math.max(100,Math.min(100000000,n)));
  };
  out.onfocus=()=>out.select();
  out.onchange=digitado;
  out.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); digitado(); out.blur(); } };
  au.onclick=()=>{
    const liga=!au.classList.contains('on');
    au.classList.toggle('on',liga); au.setAttribute('aria-pressed',liga?'true':'false');
    if(autoEl) autoEl.checked=liga;
    if(fitEl)  fitEl.checked=liga;
    try{ if(typeof plateCapture==='function') plateCapture(); }catch(e){}
    try{ buildLayout(); }catch(e){}
    try{ layoutSideMenuSync(); }catch(e){}
    /* com automática ligada, o desenho recalcula o denominador: reflete de volta */
    setTimeout(()=>{ const v=+valEl.value||5000;
      out.value=fmt(v); rg.value=maisProxima(v); },400);
  };
  try{ layoutSideMenuSync(); }catch(e){}
}
window.loAbrirEscala=abrirEscala;

function instalar(){
  const b=document.getElementById('btnLoScaleQuick');
  if(b && b._loEscOn!==1){
    b._loEscOn=1;
    b.onclick=e=>{ e.stopPropagation(); abrirEscala(); };
    b.title='Escala: barra em passos redondos, digitação livre e lista das escalas usuais';
  }
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',instalar,{once:true});
else instalar();
setTimeout(instalar,700);
})();
