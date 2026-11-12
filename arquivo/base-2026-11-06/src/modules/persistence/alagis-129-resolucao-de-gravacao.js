
/* ============================================================================
   SALVAR — a opção de resolução mais baixa passa a existir de fato

   Dois defeitos deixavam projetos regionais sem saída na hora de gravar.

   1) estimaPesoMB contava SÓ os rasters. Num projeto de 510 MB cujo peso está
      nos vetores (438,9 MB em 188.452 feições, contra 71,6 MB de raster), ela
      devolvia 68 MB. Como o diálogo de resolução só abre acima de 180 MB, ele
      nunca aparecia — e o usuário não recebia aviso nenhum antes da falha.

   2) escolheResolucaoSalvar oferecia 0,5 m, 1 m, 2 m e 5 m. São alvos de
      drone. Cada um é elevado a Math.max(csMin, x) e depois descartado pela
      regra "célula ≤ nativa": num projeto de célula 41 m TODOS caíam, e só
      sobrava "Nativa". A opção existia no código e nunca na tela.

   Aqui os alvos passam a ser MÚLTIPLOS da célula nativa (×2, ×3, ×4, ×6, ×8),
   que é o que gradeParaSalvar sabe reduzir por média de bloco. Os alvos
   submétricos continuam para quem tem dado de drone.

   E o teto passa a ser dito pelo que ele é: o .ccmgis é um JSON de uma linha,
   e JSON.stringify não devolve string acima de 536.870.888 caracteres — 512
   MiB. Acima disso a gravação falha com "Invalid string length", não importa o
   destino. O diálogo passa a marcar as opções que não cabem.

   Bloco ADITIVO. As originais ficam em window.estimaPesoMBOriginal e
   window.escolheResolucaoSalvarOriginal.
   ========================================================================== */
(function(){
'use strict';
if(window.ALAGIS129){ console.info('[129] já instalado'); return; }
if(typeof window.estimaPesoMB!=='function' || typeof window.escolheResolucaoSalvar!=='function'){
  console.warn('[129] funções de gravação ausentes — bloco ignorado'); return; }
window.ALAGIS129=1;
window.estimaPesoMBOriginal=window.estimaPesoMB;
window.escolheResolucaoSalvarOriginal=window.escolheResolucaoSalvar;

const TETO_CHARS=536870888;              // limite de string do V8
const TETO_MB=TETO_CHARS/1048576;        // ~512 MiB

/* Peso dos vetores por AMOSTRAGEM: serializar 188 mil feições para conferir o
   tamanho é justamente o que estoura. 40 feições espalhadas por camada dão uma
   média boa, e o custo é milissegundos. */
function pesoVetoresMB(){
  let tot=0;
  (S.layers||[]).forEach(L=>{
    const fs=L.features||[]; if(!fs.length) return;
    const n=Math.min(40, fs.length); let s=0, c=0;
    for(let i=0;i<n;i++){
      const f=fs[Math.floor(i*fs.length/n)];
      if(!f) continue;
      try{ s+=JSON.stringify({geom:f.geom, props:f.props, multi:f.multi}).length; c++; }catch(e){}
    }
    if(c) tot += (s/c)*fs.length;
    try{ tot += JSON.stringify(Object.assign({},L,{features:null})).length; }catch(e){ tot+=2000; }
  });
  return tot/1048576;
}
window.pesoVetoresMB=pesoVetoresMB;

function pesoRastersMB(alvoCell){
  let cels=0;
  (S.rasters||[]).forEach(r=>{ const d=r.d; if(!d) return;
    let nc=d.nc, nr=d.nr;
    if(alvoCell && d.cs && alvoCell>d.cs*1.01){ const f=Math.max(1,Math.round(alvoCell/d.cs));
      nc=Math.floor(nc/f); nr=Math.floor(nr/f); }
    cels+=nc*nr; });
  return cels*4*4/3/1048576;
}
window.estimaPesoMB=function(alvoCell){
  return pesoRastersMB(alvoCell)+pesoVetoresMB();
};

window.escolheResolucaoSalvar=function(noCel){
  return new Promise(resolve=>{
    const cells=(S.rasters||[]).map(r=>r.d&&r.d.cs).filter(v=>v>0);
    const csMin=cells.length?Math.min(...cells):1;
    const vet=pesoVetoresMB();

    /* Múltiplos da célula nativa — é o que gradeParaSalvar reduz por média de
       bloco. Os submétricos ficam para projetos de drone. */
    const alvos=[{cell:null, rot:'Nativa (máxima qualidade)'}];
    [0.5,1,2,5].forEach(v=>{ if(v>csMin*1.01) alvos.push({cell:v, rot:String(v).replace('.',',')+' m'}); });
    [2,3,4,6,8].forEach(f=>{
      const c=csMin*f;
      alvos.push({cell:c, rot:c.toFixed(c<10?1:0).replace('.',',')+' m  ·  ÷'+f});
    });
    const vistos=new Set(); const opts=[];
    for(const a of alvos){
      const key=a.cell==null?'nat':a.cell.toFixed(2);
      if(vistos.has(key)) continue;
      if(a.cell!=null && a.cell<=csMin*1.01) continue;
      vistos.add(key); opts.push(a);
    }

    const cabe=mb=>mb<TETO_MB*0.97;
    const linhas=opts.map((a,i)=>{
      const mb=pesoRastersMB(a.cell)+vet;
      const estoura=!cabe(mb);
      const risco = estoura? 'style="color:#e5534b;font-weight:600"'
                  : (mb>TETO_MB*0.85?'style="color:var(--amber)"':'');
      const marca = estoura? ' · <span style="color:#e5534b">não cabe</span>'
                  : (i===opts.findIndex(o=>cabe(pesoRastersMB(o.cell)+vet)) ? ' · recomendado' : '');
      return `<label class="loel" style="display:flex;align-items:center;gap:10px;padding:9px 11px;
        border:1px solid var(--line);border-radius:8px;margin:5px 0;cursor:pointer;${estoura?'opacity:.62':''}">
        <input type="radio" name="resSalvar" value="${i}" style="accent-color:var(--amber)">
        <div style="flex:1"><b>${a.rot}</b>${marca}</div>
        <div ${risco} style="font-family:var(--mono);font-size:12px">~${mb.toFixed(0)} MB</div></label>`;
    }).join('');

    let idxIni=opts.findIndex(o=>cabe(pesoRastersMB(o.cell)+vet));
    if(idxIni<0) idxIni=opts.length-1;

    const bg=document.createElement('div'); bg.className='modal-bg on';
    const avisoVet = vet>TETO_MB*0.6
      ? `<div class="hint" style="margin-top:8px;border-left:3px solid #e5534b;padding-left:8px">
           <b>Atenção:</b> ${vet.toFixed(0)} MB deste projeto são <b>vetores</b>, e reduzir a
           resolução não mexe neles. Mesmo na opção mais baixa o arquivo não desce disso.
           Para ganhar espaço de verdade, recorte as camadas à área de estudo.</div>`
      : '';
    bg.innerHTML=`<div class="modal" style="width:min(480px,100%)">
      <div class="modal-h"><b>Resolução das superfícies ao salvar</b><div style="flex:1"></div>
        <span class="gset" id="resX" style="font-size:16px;cursor:pointer">✕</span></div>
      <div class="modal-b">
        <div class="hint" style="margin-bottom:8px">
          O <b>.ccmgis</b> é um JSON de uma linha, e o navegador não produz texto acima de
          <b>${TETO_MB.toFixed(0)} MB</b> — acima disso a gravação falha, em qualquer destino.
          Escolha com que resolução as superfícies vão para o arquivo; os rasters na tela
          <b>não</b> mudam.</div>
        ${linhas}
        ${avisoVet}
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="tbtn" id="resCancel" style="flex:1;justify-content:center">Cancelar</button>
          <button class="tbtn" id="resOk" style="flex:1;justify-content:center;background:var(--amber);color:#1a1206;font-weight:600">Salvar</button>
        </div>
      </div></div>`;
    document.body.appendChild(bg);
    { const rs=bg.querySelectorAll('input[name="resSalvar"]'); if(rs[idxIni]) rs[idxIni].checked=true; }
    const fim=v=>{ bg.remove(); resolve(v); };
    bg.querySelector('#resX').onclick=()=>fim(false);
    bg.querySelector('#resCancel').onclick=()=>fim(false);
    bg.addEventListener('click',e=>{ if(e.target===bg) fim(false); });
    bg.querySelector('#resOk').onclick=()=>{
      const s=bg.querySelector('input[name="resSalvar"]:checked');
      fim(s? opts[+s.value].cell : null);
    };
  });
};
console.info('[129] gravação: alvos múltiplos da célula nativa e peso incluindo vetores');
})();
