
/* ============================================================================
   SUPERFÍCIE · limpar valores extremos

   O MDE baixado do Terrain Tiles trazia 904 células fora de −60..100 m num
   raster de 4,3 milhões — 0,021%. Elas não são relevo: naquele trecho do Pará
   não existe cota de −656 m nem de 488 m. Mas bastavam para:
     · o painel de propriedades anunciar "Cota mín. −656 m";
     · a rampa de cor esticar por 1.144 m e o relevo real, de 0 a 53 m, ocupar
       4,7% dela — tudo saía de uma cor só;
     · legenda e propriedades exibirem números diferentes.

   O certo é tirar as células do dado, não maquiar a exibição. Esta ferramenta
   corta por valor e devolve NoData, mostrando antes quantas células saem.

   Bloco ADITIVO.
   ========================================================================== */
(function(){
'use strict';
if(window.ALAGIS127){ console.info('[127] já instalado'); return; }
window.ALAGIS127=1;

const CSS=`
#lxBg .modal{width:min(560px,96vw)}
#lxBg .lx-num{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0}
#lxBg table{width:100%;border-collapse:collapse;font-family:var(--mono,monospace);font-size:11.5px}
#lxBg table td{padding:2px 4px;border-bottom:1px solid var(--line)}
#lxBg table td:last-child{text-align:right}
#lxBg .lx-out{margin-top:10px;padding:8px 10px;border-radius:6px;
  background:var(--bg-2,#12202c);font-size:12px;line-height:1.5}
#lxBg .lx-alerta{color:#e8a33d;font-weight:600}
`;
(function(){ const s=document.createElement('style'); s.id='lx-css'; s.textContent=CSS;
  document.head.appendChild(s); })();

/* Percentis por histograma: uma passada, sem ordenar milhões de valores. */
function distribuicao(z){
  let mn=Infinity,mx=-Infinity,n=0;
  for(let i=0;i<z.length;i++){ const v=z[i]; if(v!==v) continue;
    n++; if(v<mn)mn=v; if(v>mx)mx=v; }
  if(!n||!(mx>mn)) return null;
  const N=8192, h=new Uint32Array(N), esc=(N-1)/(mx-mn);
  for(let i=0;i<z.length;i++){ const v=z[i]; if(v!==v) continue;
    let k=((v-mn)*esc)|0; if(k<0)k=0; else if(k>=N)k=N-1; h[k]++; }
  const p=q=>{ let ac=0; const lim=q*n;
    for(let i=0;i<N;i++){ ac+=h[i]; if(ac>=lim) return mn+i/esc; }
    return mx; };
  return {n,mn,mx,p:{ '0.1':p(0.001), '0.5':p(0.005), '2':p(0.02),
                      '98':p(0.98), '99.5':p(0.995), '99.9':p(0.999) }};
}
function contaFora(z,lo,hi){
  let f=0;
  for(let i=0;i<z.length;i++){ const v=z[i]; if(v!==v) continue;
    if(v<lo||v>hi) f++; }
  return f;
}
function aplica(r,lo,hi){
  let removidas=0;
  const grades=[r.d];
  if(r.d && r.d._full && r.d._full.z && r.d._full!==r.d) grades.push(r.d._full);
  grades.forEach(g=>{
    const z=g&&g.z; if(!z) return;let desta=0;
    for(let i=0;i<z.length;i++){ const v=z[i]; if(v!==v) continue;
      if(v<lo||v>hi){ z[i]=NaN; desta++; } }
    /* A prévia e a grade nativa representam o mesmo raster. O número exibido
       corresponde à grade visível usada pela estimativa, não à soma das duas
       representações. */
    if(g===r.d)removidas=desta;
    try{ delete g._wm; delete g._wmCRS; }catch(e){}
    try{ delete g._img0; }catch(e){}
  });
  delete r._st;
  /* rasterGeomInfo guarda o resultado com chave z.length. Trocar valores por
     NaN não muda o comprimento do array, então o cache nunca expirava sozinho
     e o painel continuava anunciando a cota antiga. */
  delete r._geomInfo; delete r._geomInfoKey;
  try{ renderRaster(r); }catch(e){}
  try{ if(typeof propRefresh==='function') propRefresh(); }catch(e){}
  try{ if(typeof refreshUI==='function') refreshUI(); }catch(e){}
  return removidas;
}

function abre(r){
  if(!r||!r.d||!r.d.z){ toast('Superfície sem grade'); return; }
  const D=distribuicao(r.d.z);
  if(!D){ toast('Superfície sem valores válidos'); return; }
  /* Sugestão: p0,1 e p99,9. Corta a cauda espúria e mantém o relevo real —
     no MDE do Titan isso tira as 904 células e nada mais. */
  const sugLo=Math.floor(D.p['0.1']), sugHi=Math.ceil(D.p['99.9']);

  let bg=document.getElementById('lxBg');
  if(bg) bg.remove();
  bg=document.createElement('div'); bg.className='modal-bg'; bg.id='lxBg';
  const f=v=>(Math.abs(v)>=100?Math.round(v):+v.toFixed(2)).toLocaleString('pt-BR');
  bg.innerHTML=
   '<div class="modal">'+
    '<div class="modal-h"><b>⌫ Limpar valores extremos</b><div style="flex:1"></div>'+
      '<span class="mcf-x" id="lxX" style="cursor:pointer">✕</span></div>'+
    '<div style="padding:12px 14px">'+
      '<div style="font-size:12px;color:var(--ink-dim);margin-bottom:8px">'+
        esc(r.name||'Superfície')+' · '+D.n.toLocaleString('pt-BR')+' células com dado</div>'+
      '<table>'+
        '<tr><td>mínimo absoluto</td><td>'+f(D.mn)+'</td></tr>'+
        '<tr><td>percentil 0,1</td><td>'+f(D.p['0.1'])+'</td></tr>'+
        '<tr><td>percentil 2</td><td>'+f(D.p['2'])+'</td></tr>'+
        '<tr><td>percentil 98</td><td>'+f(D.p['98'])+'</td></tr>'+
        '<tr><td>percentil 99,9</td><td>'+f(D.p['99.9'])+'</td></tr>'+
        '<tr><td>máximo absoluto</td><td>'+f(D.mx)+'</td></tr>'+
      '</table>'+
      '<div class="lx-num">'+
        '<div><label class="field">Manter a partir de</label>'+
          '<input type="number" id="lxLo" value="'+sugLo+'" step="1"></div>'+
        '<div><label class="field">Manter até</label>'+
          '<input type="number" id="lxHi" value="'+sugHi+'" step="1"></div>'+
      '</div>'+
      '<div class="lx-out" id="lxOut">—</div>'+
      '<div class="hint" style="margin-top:8px">As células fora do intervalo viram '+
        '<b>NoData</b>. A grade em memória é alterada; o arquivo do projeto só muda '+
        'quando você salvar.</div>'+
      '<div style="display:flex;gap:8px;margin-top:12px">'+
        '<button class="tbtn" id="lxCancel" style="flex:1;justify-content:center">Cancelar</button>'+
        '<button class="tbtn" id="lxOk" style="flex:1;justify-content:center;background:var(--amber);color:#1a1206;font-weight:600">Aplicar</button>'+
      '</div>'+
    '</div>'+
   '</div>';
  document.body.appendChild(bg);
  bg.classList.add('on');

  const $=i=>document.getElementById(i);
  const previa=()=>{
    const lo=parseFloat($('lxLo').value), hi=parseFloat($('lxHi').value);
    const out=$('lxOut');
    if(!isFinite(lo)||!isFinite(hi)||hi<=lo){ out.innerHTML='<span class="lx-alerta">Intervalo inválido.</span>'; return; }
    const fora=contaFora(r.d.z,lo,hi), pct=100*fora/D.n;
    out.innerHTML='Saem <b>'+fora.toLocaleString('pt-BR')+'</b> células ('+
      pct.toFixed(3)+'%) · ficam <b>'+(D.n-fora).toLocaleString('pt-BR')+'</b>'+
      (pct>5?'<br><span class="lx-alerta">Mais de 5% do raster — confira o intervalo antes de aplicar.</span>':'');
  };
  ['lxLo','lxHi'].forEach(i=>$(i).addEventListener('input',previa));
  previa();
  const fecha=()=>bg.remove();
  $('lxX').onclick=fecha; $('lxCancel').onclick=fecha;
  bg.addEventListener('mousedown',e=>{ if(e.target===bg) fecha(); });
  $('lxOk').onclick=()=>{
    const lo=parseFloat($('lxLo').value), hi=parseFloat($('lxHi').value);
    if(!isFinite(lo)||!isFinite(hi)||hi<=lo){ toast('Intervalo inválido'); return; }
    const q=aplica(r,lo,hi);
    fecha();
    toast(q.toLocaleString('pt-BR')+' célula(s) viraram NoData');
    try{ cmdLog('Superfície "'+(r.name||'')+'": mantido '+lo+' a '+hi+' · '+q+' células removidas','ok'); }catch(e){}
  };
}
window.rasLimpaExtremos=abre;

/* liga o botão a cada redesenho do painel de propriedades */
const base=window.propRefresh;
if(typeof base==='function'){
  window.propRefresh=function(){
    const r=base.apply(this,arguments);
    try{
      const b=document.getElementById('ppRasLimpa');
      if(b && S.selRaster) b.onclick=()=>abre(S.selRaster);
    }catch(e){}
    return r;
  };
}
})();
