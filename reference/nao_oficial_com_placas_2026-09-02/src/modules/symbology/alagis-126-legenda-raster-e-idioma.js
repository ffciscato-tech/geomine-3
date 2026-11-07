
/* ============================================================================
   LAYOUT · legenda de raster com valores + selo em dois idiomas

   1) Raster contínuo na legenda
      legendItems só empurrava {label:nome, kind:'ras'} e os dois desenhistas
      pintavam SEMPRE o mesmo gradiente verde-amarelo-marrom, qualquer que
      fosse o estilo do raster, e sem um único número. Numa prancha de MDE a
      barra de cores não dizia nada. Agora o item carrega a faixa de valores e
      a rampa REAL do raster, e a barra desenhada é a mesma que está no mapa.

   2) Botão PT/EN
      Os rótulos fixos do selo e o título da legenda passaram a chamar loT().
      Sem tradutor instalado, loT devolve o próprio texto — é por isso que a
      alteração no buildLayout é segura mesmo sem este bloco.

   Bloco ADITIVO.
   ========================================================================== */
(function(){
'use strict';
if(window.ALAGIS126){ console.info('[126] já instalado'); return; }
window.ALAGIS126=1;

/* ---------------------------------------------------------------- idioma -- */
const LO_EN={
  'LEGENDA':'LEGEND',        'PROJETO':'PROJECT',
  'TÍTULO':'TITLE',          'CLIENTE':'CLIENT',
  'ENDEREÇO DA OBRA':'SITE ADDRESS',
  'PROJETISTA':'DESIGNED BY','DESENHISTA':'DRAWN BY',
  'EXECUÇÃO':'EXECUTION',    'DATA':'DATE',
  'ANM':'ANM',               'CONTEÚDO':'CONTENT',
  'ESCALAS':'SCALES',        'REVISÃO':'REVISION',
  'REVISOR':'CHECKED BY',    'FOLHA':'SHEET',
  'Esc. 1:':'Scale 1:',
  'mín':'min',                'máx':'max'
};
try{ S.loIdioma=localStorage.getItem('alagis_lo_idioma')||'pt'; }catch(e){ S.loIdioma='pt'; }
window.loT=function(s){
  return (S.loIdioma==='en' && LO_EN[s]!=null) ? LO_EN[s] : s;
};
function alternaIdioma(){
  S.loIdioma=(S.loIdioma==='en')?'pt':'en';
  try{ localStorage.setItem('alagis_lo_idioma',S.loIdioma); }catch(e){}
  pintaBotao();
  try{ loApplyAll(); }catch(e){ try{ buildLayout(); }catch(_){} }
  toast(S.loIdioma==='en'?'Title block and legend in English':'Selo e legenda em português');
}
window.loAlternaIdioma=alternaIdioma;

/* ----------------------------------------------------------- rampa real -- */
/* A barra da legenda tem de ser a MESMA rampa que rasterPainter usa no mapa,
   senão a prancha mente sobre o próprio mapa que ela mostra. */
window.loRampaRaster=function(r){
  const modo=(r&&r.style&&r.style.mode)||'hipso';
  if(modo==='solida'){
    const c=(r.style&&r.style.solidColor)||'#8d5524';
    return [[0,c],[1,c]];
  }
  if(modo==='gray'||modo==='hs') return [[0,'#2b2b2b'],[0.5,'#8f8f8f'],[1,'#f4f4f4']];
  if(typeof HIPSO!=='undefined'&&HIPSO.length) return HIPSO.map(h=>[h[0],h[1]]);
  return [[0,'#1a6b3c'],[0.5,'#e8e07a'],[1,'#8d6e63']];
};
window.loRampaId=function(ramp){
  let h=0; const s=JSON.stringify(ramp||[]);
  for(let i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; }
  return 'lg_r'+(h>>>0).toString(36);
};
window.loRampaDef=function(id,ramp){
  const st=(ramp||[]).map(p=>
    '<stop offset="'+(+p[0]).toFixed(3)+'" stop-color="'+String(p[1])+'"/>').join('');
  return '<linearGradient id="'+id+'">'+st+'</linearGradient>';
};

/* ------------------------------------------------------------- o botão --- */
const CSS='#btnLoIdioma{background:#2f4f6f;color:#fff;border-color:#2f4f6f;font-weight:700;'+
  'font:700 11px/1 var(--mono,monospace);letter-spacing:.5px;min-width:40px}'+
  '#btnLoIdioma:hover{background:#3d6a94;border-color:#3d6a94}';
(function(){ const s=document.createElement('style'); s.id='lo-idioma-css';
  s.textContent=CSS; document.head.appendChild(s); })();

function pintaBotao(){
  const b=document.getElementById('btnLoIdioma');
  if(!b) return;
  const en=(S.loIdioma==='en');
  b.textContent=en?'EN':'PT';
  b.title=en
    ? 'Title block and legend in English — click for Portuguese'
    : 'Selo e legenda em português — clique para inglês';
  b.setAttribute('aria-label',b.title);
}
function instala(){
  const barra=document.querySelector('.layoutbar');
  if(!barra || document.getElementById('btnLoIdioma')) { pintaBotao(); return; }
  const b=document.createElement('button');
  b.type='button'; b.className='tbtn'; b.id='btnLoIdioma';
  b.onclick=alternaIdioma;
  const ref=document.getElementById('btnLoFromMap');
  if(ref&&ref.parentNode===barra) barra.insertBefore(b,ref.nextSibling);
  else barra.appendChild(b);
  pintaBotao();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',instala,{once:true});
else instala();
setTimeout(instala,600);
document.addEventListener('click',()=>setTimeout(instala,120),{passive:true});
})();
