/* ============================================================================
   FAVORABILIDADE AMBIENTAL — MEIO AMBIENTE
   Classifica a área de estudo em 0 (desfavorável), 1 (favorável) e
   2 (muito favorável) numa malha regular.

   MÉTODO, em duas etapas separadas de propósito:
   1) PENEIRA DE IMPEDIMENTOS — terra indígena, unidade de proteção integral,
      cavidade de máxima relevância e afins ZERAM a célula. Isso NÃO entra na
      média: numa soma ponderada uma área excelente nos demais fatores
      "compensaria" um bloqueio legal e apareceria como favorável, o que é
      falso e perigoso num estudo de seleção de áreas.
   2) NOTA PONDERADA do que sobrou — cada fator dá 0, 1 ou 2 à célula
      (dentro do polígono, na faixa de amortecimento, ou fora), e a média
      ponderada pelos pesos vira a classe final por dois limiares.

   O buffer é medido em metros no CRS de trabalho (projetado), célula a
   célula, sem gerar geometria — evita slivers do buffer vetorial.
   ========================================================================== */
const FV={fatores:[], grade:null, ultimo:null};
/* Modelos reconhecidos pelo nome da camada. papel: 'imped' (bloqueia) ou
   'nota'. dentro/faixa/fora são as notas 0..2; faixa é a zona de influência
   em metros ao redor do polígono. */
const FV_MODELOS=[
  /* Faixas de atenção só onde a NORMA define uma: 3 km de zona de
     amortecimento da UC de proteção integral e 250 m de área de influência da
     cavidade. Terra indígena e quilombola bloqueiam DENTRO — não existe faixa
     legal ao redor, e uma faixa inventada de 1 km apaga a classe 2 de uma área
     de estudo pequena inteira (medido). */
  {chave:'ti',      rot:'Terra indígena',                papel:'imped', faixa:0,    peso:3, kw:['indigena','indígena','terra ind','ti_','funai']},
  {chave:'ucpi',    rot:'UC de proteção integral',       papel:'imped', faixa:3000, peso:3, kw:['parque','reserva biol','estacao ecol','estação ecol','proteção integral','protecao integral','ucpi']},
  {chave:'quilomb', rot:'Comunidade quilombola',         papel:'imped', faixa:0,    peso:3, kw:['quilomb','palmares']},
  {chave:'cavidade',rot:'Cavidade natural (250 m)',      papel:'imped', faixa:250,  peso:3, kw:['cavidade','caverna','espeleo','canie','cecav']},
  {chave:'app',     rot:'APP',                           papel:'imped', faixa:0,    peso:3, kw:['app','preservação permanente','preservacao permanente','nascente','mata ciliar']},
  {chave:'rl',      rot:'Reserva legal',                 papel:'nota',  dentro:0, faixa:0, fora:2, peso:3, kw:['reserva legal','_rl','rl_']},
  {chave:'apa',     rot:'APA (uso sustentável)',         papel:'nota',  dentro:1, faixa:1, fora:2, faixaM:0, peso:2, kw:['apa','área de proteção ambiental','area de protecao ambiental']},
  {chave:'assent',  rot:'Assentamento',                  papel:'nota',  dentro:0, faixa:1, fora:2, faixaM:500, peso:2, kw:['assentamento','incra','pa_','sem terra','sem-terra']},
  {chave:'anm',     rot:'Processos ANM de terceiros',    papel:'nota',  dentro:0, faixa:2, fora:2, faixaM:0, peso:3, kw:['anm','sigmine','processo','requerim','concess']},
  {chave:'geo',     rot:'Geologia favorável (alvo)',     papel:'nota',  dentro:2, faixa:1, fora:0, faixaM:500, peso:3, kw:['geolog','litolog','caulim','formação','formacao']},
  {chave:'uso',     rot:'Área antropizada',              papel:'nota',  dentro:2, faixa:2, fora:1, faixaM:0, peso:2, kw:['uso do solo','antropi','pastagem','agricult','mapbiomas','desmat']},
  {chave:'sitio',   rot:'Sítio arqueológico / tombado',  papel:'imped', faixa:500,  peso:2, kw:['arqueo','iphan','tombad']},
  {chave:'urbano',  rot:'Área urbana / habitações',      papel:'nota',  dentro:0, faixa:0, fora:2, faixaM:500, peso:2, kw:['urban','cidade','povoado','vila','habita','edifica']},
  {chave:'acesso',  rot:'Proximidade de acesso',         papel:'nota',  dentro:2, faixa:2, fora:1, faixaM:1000, peso:1, kw:['rodovia','estrada','acesso','via','ferrovia']},
  {chave:'agua',    rot:'Curso d\u2019água / captação',      papel:'nota',  dentro:0, faixa:1, fora:2, faixaM:200, peso:2, kw:['drenagem','hidrograf','rio','curso','captação','captacao','outorga']},
];
function fvModeloPara(nome){
  const n=String(nome||'').toLowerCase();
  return FV_MODELOS.find(m=>m.kw.some(k=>n.includes(k)))||null;
}
function fvFatorNovo(L, mod){
  const m=mod||{};
  return {layerId:L?L.id:null, rot:m.rot||(L?L.name:'Fator'),
    papel:m.papel||'nota',
    dentro:(m.dentro!=null?m.dentro:0), faixa:(m.faixa!=null&&m.papel==='nota'?m.faixa:1),
    fora:(m.fora!=null?m.fora:2),
    faixaM:(m.papel==='imped'? (m.faixa||0) : (m.faixaM||0)),
    peso:m.peso||2, on:true};
}
/* ---------- geometria: distância de um ponto a um polígono/linha ---------- */
function fvDentroAnel(x,y,anel){
  let d=false;
  for(let i=0,j=anel.length-1;i<anel.length;j=i++){
    const xi=anel[i][0],yi=anel[i][1],xj=anel[j][0],yj=anel[j][1];
    if(((yi>y)!==(yj>y)) && x < (xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi) d=!d;
  }
  return d;
}
function fvDistSeg(x,y,ax,ay,bx,by){
  const dx=bx-ax, dy=by-ay, L2n=dx*dx+dy*dy;
  let t = L2n? ((x-ax)*dx+(y-ay)*dy)/L2n : 0;
  t=t<0?0:(t>1?1:t);
  return Math.hypot(x-(ax+t*dx), y-(ay+t*dy));
}
/* Reprojeção sob demanda: a malha é montada no CRS da ÁREA DE ESTUDO e cada
   fator pode estar noutro EPSG. Sem isto as coordenadas eram comparadas entre
   sistemas diferentes e o cruzamento saía silenciosamente errado. */
function fvReproj(crsDe, crsPara){
  if(!crsDe || !crsPara || String(crsDe)===String(crsPara)) return null;
  if(typeof toWGS!=='function' || typeof fromWGS!=='function') return null;
  return (x,y)=>{ const w=toWGS(crsDe,x,y); const c=fromWGS(crsPara,w[0],w[1]); return [c[0],c[1]]; };
}
/* Feições da camada já no CRS do estudo. Os anéis ficam AGRUPADOS POR FEIÇÃO:
   é esse agrupamento que permite tratar furo como furo (par/ímpar). Antes as
   partes eram achatadas numa lista só e o anel de um furo respondia "dentro". */
function fvAneisDe(L, crsAlvo){
  const out=[], rp=fvReproj(L.crs, crsAlvo);
  (L.features||[]).forEach(f=>{
    if(!f||!f.geom) return;
    if(typeof featureVisible==='function' && !featureVisible(L,f)) return;
    const partes=(f.multi&&Array.isArray(f.geom[0])&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
    const aneis=[]; let X0=Infinity,Y0=Infinity,X1=-Infinity,Y1=-Infinity;
    partes.forEach(pt=>{
      if(!Array.isArray(pt)||pt.length<2) return;
      const q=rp? pt.map(p=>rp(p[0],p[1])) : pt;
      let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
      q.forEach(p=>{ if(p[0]<x0)x0=p[0]; if(p[0]>x1)x1=p[0]; if(p[1]<y0)y0=p[1]; if(p[1]>y1)y1=p[1]; });
      aneis.push({pts:q, bb:[x0,y0,x1,y1]});
      X0=Math.min(X0,x0); Y0=Math.min(Y0,y0); X1=Math.max(X1,x1); Y1=Math.max(Y1,y1);
    });
    if(aneis.length) out.push({aneis, bb:[X0,Y0,X1,Y1], poly:L.gtype==='polygon'});
  });
  return out;
}
/* Par/ímpar sobre TODOS os anéis da feição — é o que faz o furo valer como
   furo: dois cruzamentos deixam a célula do lado de fora. */
function fvDentroFeicao(x,y,fe){
  const bb=fe.bb; if(x<bb[0]||x>bb[2]||y<bb[1]||y>bb[3]) return false;
  let d=false;
  for(const a of fe.aneis){ if(fvDentroAnel(x,y,a.pts)) d=!d; }
  return d;
}
/* Nota de um fator numa célula: 'dentro', 'faixa' (até faixaM metros) ou
   'fora'. Ponto e linha nunca têm "dentro" — valem pela distância. */
function fvNotaCelula(fat, feicoes, x, y){
  const fm=+fat.faixaM||0;
  let dmin=Infinity;
  for(const fe of feicoes){
    const bb=fe.bb;
    if(x<bb[0]-fm || x>bb[2]+fm || y<bb[1]-fm || y>bb[3]+fm) continue;
    if(fe.poly && fvDentroFeicao(x,y,fe)) return 'dentro';
    if(fm>0){
      for(const a of fe.aneis){
        const pts=a.pts;
        for(let i=1;i<pts.length;i++){
          const d=fvDistSeg(x,y,pts[i-1][0],pts[i-1][1],pts[i][0],pts[i][1]);
          if(d<dmin) dmin=d;
        }
        /* fecha o anel: a polilinha do CAD costuma não repetir o 1º vértice e
           o último segmento ficava fora da conta da distância. */
        if(fe.poly && pts.length>2){
          const d=fvDistSeg(x,y,pts[pts.length-1][0],pts[pts.length-1][1],pts[0][0],pts[0][1]);
          if(d<dmin) dmin=d;
        }
        if(dmin<=fm) break;
      }
    }
  }
  if(fm>0 && dmin<=fm) return 'faixa';
  return 'fora';
}
async function fvCalcula(){
  const LA=(S.layers||[]).find(l=>l.id===+document.getElementById('fvArea').value);
  if(!LA){ toast('Escolha a camada da área de estudo'); return null; }
  if(LA.gtype!=='polygon'){ toast('A área de estudo precisa ser uma camada de POLÍGONO'); return null; }
  const cs=Math.max(1, +document.getElementById('fvCel').value||20);
  const fats=FV.fatores.filter(f=>f.on && f.layerId!=null);
  if(!fats.length){ toast('Ligue ao menos um fator'); return null; }

  /* Tudo passa a ser medido no CRS da ÁREA DE ESTUDO: célula e faixas estão
     em metros, então um CRS geográfico (graus) invalidaria a conta inteira. */
  /* Toda grade raster do CCMGIS é armazenada no CRS de trabalho. Montar esta
     grade no CRS original da camada de recorte e depois desenhá-la como se
     estivesse em S.workCRS deslocava o raster em relação ao limite — muito
     visível em dados ANA/SNIRH (normalmente SIRGAS geográfico). Reprojetamos
     a área e todos os fatores para o CRS único do projeto antes da análise. */
  const crsEst=S.workCRS;
  if(/4326|4674|4618/.test(String(crsEst))){
    toast('A área de estudo está em coordenadas geográficas (graus). Reprojete para UTM/SIRGAS — célula e faixas são em metros.');
    return null;
  }
  const areaAneis=fvAneisDe(LA, crsEst);
  if(!areaAneis.length){ toast('A área de estudo está vazia'); return null; }
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  areaAneis.forEach(a=>{ x0=Math.min(x0,a.bb[0]); y0=Math.min(y0,a.bb[1]);
                         x1=Math.max(x1,a.bb[2]); y1=Math.max(y1,a.bb[3]); });
  const nc=Math.max(1,Math.ceil((x1-x0)/cs)), nr=Math.max(1,Math.ceil((y1-y0)/cs));
  if(nc*nr>4e6){ toast(`Malha de ${(nc*nr/1e6).toFixed(1)} M células — aumente o tamanho da célula`); return null; }

  showLoad(`Favorabilidade: ${nc}×${nr} células…`);
  await new Promise(r=>setTimeout(r,20));
  const prep=fats.map(f=>({f, L:(S.layers||[]).find(l=>l.id===f.layerId), aneis:null}));
  prep.forEach(p=>{ if(p.L) p.aneis=fvAneisDe(p.L, crsEst); });

  const z=new Float32Array(nc*nr).fill(NaN);
  const cont={0:0,1:0,2:0,fora:0}, motivos={}, atencaoN={};
  /* Cortes editáveis pelo usuário. Estavam fixos em 0,95/1,55 no código e os
     campos da interface não eram lidos por este motor. */
  const t1=Math.max(0,Math.min(2,+((document.getElementById('fvT1')||{}).value)||0.95));
  const t2=Math.max(t1,Math.min(2,+((document.getElementById('fvT2')||{}).value)||1.55));
  for(let r=0;r<nr;r++){
    if(r%40===0){ showLoad(`Favorabilidade: linha ${r+1}/${nr}…`); await new Promise(q=>setTimeout(q,0)); }
    const y=y1-(r+0.5)*cs;
    for(let c=0;c<nc;c++){
      const x=x0+(c+0.5)*cs, k=r*nc+c;
      let dentroArea=false;
      for(const fe of areaAneis){ if(fvDentroFeicao(x,y,fe)){ dentroArea=true; break; } }
      if(!dentroArea){ cont.fora++; continue; }
      /* IMPEDIMENTO bloqueia DENTRO do polígono; a faixa ao redor é zona de
         ATENÇÃO e entra como nota 0 na média, não como bloqueio. Medido: com
         a faixa bloqueando, os 3 km da unidade de conservação (ou 1 km da
         terra indígena) apagavam a área de estudo inteira e o estudo perdia
         qualquer poder de discriminar — o que é falso, porque vizinhança de
         TI não é impedimento legal, é agravante de licenciamento. */
      /* O IMPEDIMENTO NÃO ENTRA NA MÉDIA. Ele faz duas coisas e só essas:
         bloqueia dentro do polígono e rebaixa na faixa de atenção. Somá-lo
         como nota 2 quando está longe era o erro central do método: os seis
         impedimentos padrão pesam 17 contra 20 dos fatores de aptidão, ou
         seja 46% da média, e só de estar longe de todos a célula já partia de
         0,92 — perto do corte da classe 1. Na prática TUDO caía em "muito
         favorável", inclusive célula FORA do alvo geológico. A nota agora
         mede APTIDÃO; a legalidade é peneira. */
      let bloqueio=null, atencao=null, soma=0, pesoCel=0;
      for(const p of prep){
        if(!p.aneis||!p.aneis.length) continue;
        const onde=fvNotaCelula(p.f,p.aneis,x,y);
        const w=+p.f.peso||1;
        if(p.f.papel==='imped'){
          if(onde==='dentro'){ bloqueio=p.f.rot; break; }
          if(onde==='faixa' && !atencao) atencao=p.f.rot;   // zona de amortecimento
          continue;                                          // fora da média
        }
        const n=(onde==='dentro')?+p.f.dentro:(onde==='faixa')?+p.f.faixa:+p.f.fora;
        soma+=(isFinite(n)?n:0)*w;
        pesoCel+=w;
      }
      let cls;
      if(bloqueio){ cls=0; motivos[bloqueio]=(motivos[bloqueio]||0)+1; }
      else{
        /* Sem NENHUM fator de aptidão a média não existe. Antes o divisor caía
           no peso total e a nota dava 0: uma área sem impedimento algum saía
           inteira como "desfavorável". Sem aptidão medida a célula é neutra. */
        const nota = pesoCel>0 ? soma/pesoCel : 1;   // 0..2, só de aptidão
        cls = nota>=t2 ? 2 : (nota>=t1 ? 1 : 0);
        /* Faixa de amortecimento é agravante de licenciamento, não bloqueio:
           a célula pode ser favorável, nunca "muito favorável". */
        if(atencao && cls===2){ cls=1; atencaoN[atencao]=(atencaoN[atencao]||0)+1; }
      }
      z[k]=cls; cont[cls]++;
    }
  }
  hideLoad();
  const d={nc,nr,cs,csy:cs,xll:x0,yll:y1-nr*cs,z};
  const clipRings=[];
  areaAneis.forEach(fe=>fe.aneis.forEach(a=>{
    if(a&&Array.isArray(a.pts)&&a.pts.length>=3)
      clipRings.push(a.pts.map(p=>[p[0],p[1]]));
  }));
  FV.ultimo={d, cont, motivos, atencaoN, t1, t2, cs, area:LA.name,
    areaLayerId:LA.id, clipRings,
    subst:(document.getElementById('fvSubs')||{}).value||''};
  return FV.ultimo;
}
function fvAplicaRaster(res){
  const nome='Favorabilidade — '+(res.subst||'estudo');
  const antigo=(S.rasters||[]).find(r=>r.name===nome);
  const R = antigo || {id:rid++, name:nome, visible:true, overlay:null,
    style:{mode:'classes', opacity:0.75, classes:[]}};
  R.d=res.d; R.style=R.style||{}; R.style.mode='classes'; R.style.opacity=0.75;
  /* O mesmo contorno analítico que aparece como vetor recorta o canvas. A
     classificação continua celular, mas a apresentação termina exatamente
     na linha, sem dentes, recuos ou triângulos brancos nos vértices. */
  R._exactClipRings=Array.isArray(res.clipRings)
    ?res.clipRings.map(a=>a.map(p=>[p[0],p[1]])):null;
  R._v3=R._v3||{papel:'projeto',cor:'#2e9e4f',limId:res.areaLayerId||''};
  R._v3.limId=res.areaLayerId||R._v3.limId||'';
  R.style.classes=[{min:-0.5,max:0.5,color:'#c92a2a'},   // 0 desfavorável
                   {min:0.5, max:1.5,color:'#f2b705'},   // 1 favorável
                   {min:1.5, max:2.5,color:'#2e9e4f'}];  // 2 muito favorável
  if(!antigo){S.rasters.push(R);placeProductAbove(R,'L:'+res.areaLayerId);}
  try{ renderRaster(R); }catch(e){}
  refreshUI();
  return R;
}
function fvRelatorioTexto(res){
  const A=res.cs*res.cs/10000;                 // ha por célula
  const t=res.cont[0]+res.cont[1]+res.cont[2];
  const pc=n=>t? (100*n/t).toFixed(1).replace('.',',')+'%' : '—';
  const ha=n=>(n*A).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})+' ha';
  let s=`Favorabilidade ambiental — ${res.subst||''}\nÁrea de estudo: ${res.area} · célula ${res.cs} m\n`+
    `\n2 · Muito favorável: ${ha(res.cont[2])} (${pc(res.cont[2])})`+
    `\n1 · Favorável:       ${ha(res.cont[1])} (${pc(res.cont[1])})`+
    `\n0 · Desfavorável:    ${ha(res.cont[0])} (${pc(res.cont[0])})`+
    `\nTotal analisado:     ${ha(t)}`;
  const mv=Object.entries(res.motivos).sort((a,b)=>b[1]-a[1]);
  if(mv.length){
    s+='\n\nBloqueios legais (o que zerou a célula):';
    mv.forEach(([k,n])=>{ s+=`\n  · ${k}: ${ha(n)} (${pc(n)})`; });
  }
  const ativos=FV.fatores.filter(f=>f.on&&f.layerId!=null);
  s+='\n\nFatores usados:';
  ativos.forEach(f=>{
    const L=(S.layers||[]).find(l=>l.id===f.layerId);
    s+=`\n  · ${f.rot} [${L?L.name:'?'}] — `+
      (f.papel==='imped' ? `IMPEDIMENTO dentro${f.faixaM?` · faixa de atenção ${f.faixaM} m (nota 0)`:''}`
        : `notas d/f/f ${f.dentro}/${f.faixa}/${f.fora}${f.faixaM?` · faixa ${f.faixaM} m`:''} · peso ${f.peso}`);
  });
  return s;
}
/* ---------------------------------------------------------------------------
   INTERFACE DO ESTUDO
   A lista de fatores é montada a partir das camadas carregadas: "Detectar
   camadas" casa o NOME da camada com as palavras-chave dos modelos e já
   propõe papel, notas, faixa e peso; tudo continua editável linha a linha,
   porque a régua muda com a substância e com o órgão licenciador.
   ------------------------------------------------------------------------- */
function fvPreencheArea(){
  const sel=document.getElementById('fvArea'); if(!sel) return;
  const cur=sel.value;
  const pols=(S.layers||[]).filter(l=>l.gtype==='polygon');
  sel.innerHTML=pols.length
    ? pols.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('')
    : '<option value="">(carregue um polígono da área de estudo)</option>';
  if(cur && [...sel.options].some(o=>o.value===cur)) sel.value=cur;
}
function fvRenderFatores(){
  const box=document.getElementById('fvLista'); if(!box) return;
  const vet=(S.layers||[]).filter(l=>l.gtype==='polygon'||l.gtype==='line'||l.gtype==='point');
  if(!FV.fatores.length){
    box.innerHTML='<div class="hint" style="margin-top:6px">Nenhum fator ainda — use <b>✨ Detectar camadas</b> ou <b>+ Fator</b>.</div>';
    return;
  }
  const opc=(idsel)=>vet.map(l=>`<option value="${l.id}" ${l.id===idsel?'selected':''}>${esc(l.name)}</option>`).join('');
  box.innerHTML=FV.fatores.map((f,i)=>{
    const imped=f.papel==='imped';
    return `<div class="cls" data-fi="${i}" style="margin-top:6px">
      <div class="cls-h" style="gap:6px">
        <input type="checkbox" class="fv-on" ${f.on?'checked':''} style="width:auto;accent-color:var(--amber)">
        <span class="lb" style="flex:1">${esc(f.rot)}</span>
        <span class="ct">${imped?('bloqueia dentro · peso '+f.peso):('peso '+f.peso)}</span>
        <span class="fv-del" title="Remover" style="cursor:pointer;color:#e05252">✕</span>
      </div>
      <div class="cls-b">
        <label class="field">Camada</label>
        <select class="fv-lay">${opc(f.layerId)}</select>
        <div class="row2" style="margin-top:6px">
          <div><label class="field">Papel</label><select class="fv-papel">
            <option value="imped" ${imped?'selected':''}>Impedimento (zera)</option>
            <option value="nota" ${imped?'':'selected'}>Nota ponderada</option></select></div>
          <div><label class="field">${imped?'Faixa de atenção (m)':'Faixa de influência (m)'}</label>
            <input type="number" class="fv-faixaM" value="${f.faixaM||0}" min="0" step="50"></div>
        </div>
        <div class="row2 fv-notas" style="margin-top:6px;${imped?'display:none':''}">
          <div><label class="field">Dentro</label><select class="fv-d">${[0,1,2].map(v=>`<option ${v===f.dentro?'selected':''}>${v}</option>`).join('')}</select></div>
          <div><label class="field">Na faixa</label><select class="fv-f">${[0,1,2].map(v=>`<option ${v===f.faixa?'selected':''}>${v}</option>`).join('')}</select></div>
        </div>
        <div class="row2 fv-notas2" style="margin-top:6px;${imped?'display:none':''}">
          <div><label class="field">Fora</label><select class="fv-o">${[0,1,2].map(v=>`<option ${v===f.fora?'selected':''}>${v}</option>`).join('')}</select></div>
          <div><label class="field">Peso</label><input type="number" class="fv-peso" value="${f.peso}" min="1" max="5" step="1"></div>
        </div>
      </div></div>`;
  }).join('');
  /* cabeçalho abre/fecha, como nas classes de simbologia */
  box.querySelectorAll('.cls-h').forEach(hh=>hh.addEventListener('click',e=>{
    if(e.target.closest('.fv-on')||e.target.closest('.fv-del')) return;
    hh.parentElement.classList.toggle('open');
  }));
  box.querySelectorAll('.cls').forEach(el=>{
    const i=+el.dataset.fi, f=FV.fatores[i];
    const g=q=>el.querySelector(q);
    g('.fv-on').onchange=()=>{ f.on=g('.fv-on').checked; };
    g('.fv-del').onclick=()=>{ FV.fatores.splice(i,1); fvRenderFatores(); };
    g('.fv-lay').onchange=()=>{ f.layerId=+g('.fv-lay').value;
      const L=(S.layers||[]).find(x=>x.id===f.layerId); if(L) f.rot=f.rot||L.name; };
    g('.fv-papel').onchange=()=>{
      f.papel=g('.fv-papel').value;
      const mostra=f.papel!=='imped'?'':'none';
      g('.fv-notas').style.display=mostra; g('.fv-notas2').style.display=mostra;
      el.querySelector('.ct').textContent=f.papel==='imped'?'impedimento':'peso '+f.peso;
    };
    g('.fv-faixaM').oninput=()=>{ f.faixaM=Math.max(0,+g('.fv-faixaM').value||0); };
    g('.fv-d').onchange=()=>{ f.dentro=+g('.fv-d').value; };
    g('.fv-f').onchange=()=>{ f.faixa=+g('.fv-f').value; };
    g('.fv-o').onchange=()=>{ f.fora=+g('.fv-o').value; };
    g('.fv-peso').oninput=()=>{ f.peso=Math.max(1,Math.min(5,+g('.fv-peso').value||1));
      if(f.papel!=='imped') el.querySelector('.ct').textContent='peso '+f.peso; };
  });
}
function fvDetectar(){
  const antes=FV.fatores.length;
  const usados=new Set(FV.fatores.map(f=>f.layerId));
  let n=0, semModelo=[];
  (S.layers||[]).forEach(L=>{
    if(usados.has(L.id)) return;
    if(!['polygon','line','point'].includes(L.gtype)) return;
    const areaSel=+((document.getElementById('fvArea')||{}).value);
    if(L.id===areaSel) return;                        // a área de estudo não é fator
    const m=fvModeloPara(L.name);
    if(!m){ semModelo.push(L.name); return; }
    FV.fatores.push(fvFatorNovo(L,m)); n++;
  });
  fvRenderFatores();
  let msg=n? `${n} camada(s) reconhecida(s) e configurada(s)` : 'Nenhuma camada nova reconhecida pelo nome';
  if(semModelo.length) msg+=` · sem modelo: ${semModelo.slice(0,3).join(', ')}${semModelo.length>3?'…':''} (use + Fator)`;
  toast(msg);
  if(!antes && !n) document.getElementById('fvOut').textContent=
    'Renomeie as camadas com termos como "APP", "Terra indígena", "Assentamento", "SIGMINE"… ou acrescente os fatores à mão.';
}
function abreFavorabilidade(){
  RIB_CAT_ATUAL='ambiente';
  if(typeof switchView==='function') switchView('map');
  if(typeof ribbonBuild==='function') ribbonBuild();
  /* o painel do MEIO AMBIENTE ocupa a lateral, como os demais módulos */
  ['sideMain','sideHidro','sideGeo','sideV3d','sideCub','sidePerfis'].forEach(id=>{
    const e=document.getElementById(id); if(e) e.style.display='none'; });
  const amb=document.getElementById('sideAmb'); if(amb) amb.style.display='';
  fvPreencheArea(); fvRenderFatores();
}
(function bindFavorabilidade(){
  const $=id=>document.getElementById(id);
  const bt=$('fvAuto');   if(bt) bt.onclick=fvDetectar;
  const ba=$('fvAdd');    if(ba) ba.onclick=()=>{
    const vet=(S.layers||[]).filter(l=>['polygon','line','point'].includes(l.gtype));
    if(!vet.length){ toast('Carregue as camadas do estudo primeiro'); return; }
    FV.fatores.push(fvFatorNovo(vet[0],{rot:vet[0].name,papel:'nota',dentro:0,faixa:1,fora:2,peso:2}));
    fvRenderFatores();
  };
  const br=$('fvRodar');  if(br) br.onclick=async()=>{
    const res=await fvCalcula();
    if(!res) return;
    FV.ultimo=res;
    fvAplicaRaster(res);
    $('fvOut').textContent=fvRelatorioTexto(res);
  };
  const bp=$('fvPoligonos'); if(bp) bp.onclick=()=>{
    if(!FV.ultimo){ toast('Calcule a favorabilidade primeiro'); return; }
    const n=fvPoligonosDasClasses(FV.ultimo);
    toast(n? `${n} polígono(s) de classe gerados` : 'Nenhum polígono gerado');
  };
  const bl=$('fvRelatorio'); if(bl) bl.onclick=()=>{
    if(!FV.ultimo){ toast('Calcule a favorabilidade primeiro'); return; }
    $('fvOut').textContent=fvRelatorioTexto(FV.ultimo);
  };
  const sa=$('fvArea'); if(sa) sa.onchange=()=>fvRenderFatores();
})();

/* Contorno das classes por marching squares, reaproveitando o mesmo traçador
   da inundação — mesma regra de fechamento, sem um segundo algoritmo. */
function fvPoligonosDasClasses(res){
  if(typeof inundContorno!=='function'){ toast('Traçador de contorno indisponível'); return 0; }
  const cores={0:'#c92a2a',1:'#f2b705',2:'#2e9e4f'};
  const rot={0:'Desfavorável (0)',1:'Favorável (1)',2:'Muito favorável (2)'};
  let n=0;
  [2,1,0].forEach(cl=>{
    const g={...res.d, z:Float32Array.from(res.d.z, v=>Number.isFinite(v)?(v===cl?1:0):0)};
    let aneis=[];
    try{ aneis=inundContorno(g,0.5)||[]; }catch(e){ return; }
    if(!aneis.length) return;
    const feats=aneis.filter(a=>a&&a.length>2).map(a=>({geom:[a],multi:true,zg:null,
      props:{CLASSE:cl, ROTULO:rot[cl], SUBST:res.subst||'', CELULA_M:res.cs}}));
    if(!feats.length) return;
    addLayer({sourceLayer:(S.rasters||[]).find(r=>r.d===res.d)||'L:'+res.areaLayerId,name:'Favorabilidade '+cl+' — '+rot[cl], gtype:'polygon', crs:S.workCRS,
      features:feats, fields:[{name:'CLASSE',type:'N',length:3,decimal:0},
        {name:'ROTULO',type:'C',length:24},{name:'SUBST',type:'C',length:30},
        {name:'CELULA_M',type:'N',length:8,decimal:1}], color:cores[cl]});
    n++;
  });
  refreshUI();
  return n;
}
function abreCalculadoraCampo(){
  const L=activeLayer();
  if(!L){ toast('Selecione uma camada vetorial'); return; }
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);return;}
  const campos=(L.fields||[]).map(f=>f.name);
  const bg=document.createElement('div'); bg.className='modal-bg on';
  const opt=a=>a.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
  bg.innerHTML='<div class="modal" style="width:min(640px,100%)">'+
    '<div class="modal-h"><b>🧮 Calculadora de campo — '+esc(L.name)+'</b><div style="flex:1"></div>'+
      '<span class="gset" id="fcX" style="font-size:16px;cursor:pointer">✕</span></div>'+
    '<div class="modal-b">'+
      '<div class="row2">'+
        '<label class="field" style="display:flex;align-items:center;gap:7px;cursor:pointer">'+
          '<input type="radio" name="fcAlvo" id="fcNovo" checked style="width:auto;accent-color:var(--amber)"> Criar campo novo</label>'+
        '<label class="field" style="display:flex;align-items:center;gap:7px;cursor:pointer">'+
          `<input type="radio" name="fcAlvo" id="fcExist" ${campos.length?'':'disabled'} style="width:auto;accent-color:var(--amber)"> Atualizar campo existente</label>`+
      '</div>'+ 
      '<div id="fcBoxNovo">'+
        '<div class="row2">'+
          '<div><label class="field">Nome (até 80 caracteres)</label><input type="text" id="fcNome" maxlength="80" value="NOVO_ATRIBUTO"></div>'+ 
          '<div><label class="field">Tipo</label><select id="fcTipo">'+
            '<option value="C">Texto</option><option value="N">Número</option></select></div>'+ 
        '</div>'+ 
        '<div class="row2">'+
          '<div><label class="field">Tamanho</label><input type="number" id="fcTam" value="80" min="1" max="254"></div>'+ 
          '<div><label class="field">Casas decimais</label><input type="number" id="fcDec" value="2" min="0" max="9"></div>'+ 
        '</div>'+ 
        '<div class="hint" style="margin-top:3px">O GeoMine preserva o nome completo. Ao exportar para Shapefile, o nome físico é abreviado porque o formato DBF aceita somente nomes curtos.</div>'+ 
      '</div>'+ 
      `<div id="fcBoxExist" style="display:none"><label class="field">Campo a atualizar</label><select id="fcCampo">${opt(campos)}</select></div>`+
      '<label class="field" style="margin-top:8px">Expressão <span style="color:var(--ink-dim);font-weight:400">(em branco: o campo novo é criado vazio)</span></label>'+
      '<textarea id="fcExpr" rows="3" placeholder=\'ex.: "COTA_FIM" - "COTA_INI"   ·   $AREA_HA   ·   juntar("TIPO", \\\' \\\', $ID)\' '+
        'style="width:100%;resize:vertical;background:var(--panel2);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:6px;font-family:var(--mono);font-size:13px"></textarea>'+
      '<div class="row2" style="margin-top:6px">'+
        `<div><label class="field">Campos (clique para inserir)</label><select id="fcListaCampos" size="5" style="width:100%">${opt(campos)}</select></div>`+
        '<div><label class="field">Geometria e contexto</label><select id="fcListaGeo" size="5" style="width:100%"></select></div>'+
      '</div>'+
      '<label class="field" style="margin-top:6px">Funções</label>'+
      `<select id="fcListaFn" size="4" style="width:100%">${Object.keys(FC_FUNCOES).map(k=>`<option value="${esc(FC_FUNCOES[k])}">${esc(k)}</option>`).join('')}</select>`+
      '<div class="hint" style="margin-top:6px">Campo entre <b>aspas duplas</b> ("COTA"), texto entre <b>aspas simples</b> (\'sim\') — como no QGIS. Operadores: + − * / % ( ) e comparações == != &gt; &lt; &gt;= &lt;=.</div>'+
      '<div style="border-top:1px dashed var(--line);margin:10px 0 6px;padding-top:8px">'+
        '<label class="field" style="display:flex;align-items:center;gap:8px;cursor:pointer;margin:0">'+
          '<input type="checkbox" id="fcNum" style="width:auto;accent-color:var(--amber)">'+
          '<b>Numerar feições automaticamente</b> (dispensa a expressão)</label>'+
        '<div id="fcNumBox" style="display:none;margin-top:6px">'+
          '<div class="row2">'+
            '<div><label class="field">Ordem crescente por</label><select id="fcOrdem">'+
              '<option value="tabela">Ordem da tabela</option>'+
              '<option value="campo">Um campo…</option>'+
              '<option value="oeste">Posição: oeste → leste</option>'+
              '<option value="leste">Posição: leste → oeste</option>'+
              '<option value="norte">Posição: norte → sul</option>'+
              '<option value="sul">Posição: sul → norte</option>'+
              '<option value="maior">Tamanho: maior → menor</option>'+
              '<option value="menor">Tamanho: menor → maior</option>'+
            '</select></div>'+
            `<div id="fcOrdemCampoBox" style="display:none"><label class="field">Campo de ordenação</label><select id="fcOrdemCampo">${opt(campos)}</select></div>`+
          '</div>'+
          '<div class="row2">'+
            '<div><label class="field">Começar em</label><input type="number" id="fcIni" value="1" step="1"></div>'+
            '<div><label class="field">Passo</label><input type="number" id="fcPasso" value="1" min="1" step="1"></div>'+
          '</div>'+
          '<div class="row2">'+
            '<div><label class="field">Prefixo</label><input type="text" id="fcPre" maxlength="8" placeholder="ex.: P-"></div>'+
            '<div><label class="field">Zeros à esquerda</label><input type="number" id="fcDig" value="0" min="0" max="6"></div>'+
          '</div>'+
          '<div class="hint" style="margin-top:3px">Prefixo, sufixo e zeros valem para campo de TEXTO (P-001, P-002…). Em campo numérico entra só o número.</div>'+
        '</div>'+
      '</div>'+
      '<div class="hout" id="fcPrev" style="margin-top:8px">Prévia das 5 primeiras feições aparece aqui.</div>'+
      '<div class="row2" style="margin-top:8px">'+
        '<button class="mini" id="fcTestar">Testar (prévia)</button>'+
        '<button class="tbtn" id="fcOk" style="justify-content:center;background:var(--amber);color:#1a1206;font-weight:600">Aplicar</button>'+
      '</div>'+
    '</div></div>';
  document.body.appendChild(bg);
  const $=id=>bg.querySelector('#'+id);
  const fechar=()=>bg.remove();
  $('fcX').onclick=fechar;
  /* variáveis de contexto, montadas para o tipo desta camada */
  {
    const geo=[...geomCamposDe(L.gtype),'$X','$Y','$Z','$ID','$LINHA','$NFEIC','$VERTICES','$CAMADA','$CRS']
      .filter((v,i,a)=>a.indexOf(v)===i);
    $('fcListaGeo').innerHTML=geo.map(v=>{
      const rot=GEOM_CAMPOS[v]||({'$Z':'Cota Z do 1º vértice','$ID':'Número da feição',
        '$LINHA':'Linha atual da tabela',
        '$NFEIC':'Total de feições','$VERTICES':'Nº de vértices','$CAMADA':'Nome da camada',
        '$CRS':'CRS da camada'}[v]||v);
      return `<option value="${esc(v)}">${esc(v)} — ${esc(rot)}</option>`;
    }).join('');
  }
  const insere=txt=>{
    const t=$('fcExpr'); const a=t.selectionStart??t.value.length, b=t.selectionEnd??a;
    t.value=t.value.slice(0,a)+txt+t.value.slice(b);
    t.focus(); t.selectionStart=t.selectionEnd=a+txt.length;
  };
  $('fcListaCampos').ondblclick=$('fcListaCampos').onclick=e=>{ if(e.target.value) insere('"'+e.target.value+'"'); };
  $('fcListaGeo').onclick=e=>{ if(e.target.value) insere(e.target.value); };
  $('fcListaFn').onclick=e=>{ if(e.target.value) insere(e.target.value); };
  const numSync=()=>{
    const on=$('fcNum').checked;
    $('fcNumBox').style.display=on?'':'none';
    $('fcExpr').disabled=on;
    $('fcExpr').style.opacity=on?'.5':'';
    $('fcOrdemCampoBox').style.display=(on&&$('fcOrdem').value==='campo')?'':'none';
  };
  $('fcNum').onchange=numSync; $('fcOrdem').onchange=numSync;
  const alvoSync=()=>{ const novo=$('fcNovo').checked;
    $('fcBoxNovo').style.display=novo?'':'none'; $('fcBoxExist').style.display=novo?'none':''; };
  $('fcNovo').onchange=alvoSync; $('fcExist').onchange=alvoSync;
  const tipoSync=()=>{
    const texto=$('fcTipo').value==='C',tam=$('fcTam'),dec=$('fcDec');
    dec.disabled=texto; dec.style.opacity=texto?'.5':'';
    if(texto && +tam.value===18) tam.value='80';
    if(!texto && +tam.value===80) tam.value='18';
  };
  $('fcTipo').onchange=tipoSync; tipoSync();
  const tipoAtual=()=>{
    if($('fcNovo').checked) return $('fcTipo').value;
    const fd=(L.fields||[]).find(x=>x.name===$('fcCampo').value);
    return fd?fd.type:'C';
  };
  const testar=()=>{
    if($('fcNum').checked){
      const tipo=tipoAtual();
      const valores=fcNumera(L,{criterio:$('fcOrdem').value, campo:$('fcOrdemCampo')?$('fcOrdemCampo').value:'',
        inicio:$('fcIni').value, passo:$('fcPasso').value, digitos:$('fcDig').value,
        prefixo:$('fcPre').value, sufixo:'', tipo});
      $('fcPrev').textContent=valores.slice(0,5).map((v,i)=>`${i+1}: ${v}`).join('\n')+
        `\n${valores.length} feição(ões) numeradas na ordem escolhida`;
      return {valores, erros:0, primeiroErro:''};
    }
    const expr=$('fcExpr').value.trim();
    /* Campo novo sem expressão: cria a coluna vazia para preencher na tabela,
       como o "Adicionar campo" do QGIS. Campo existente continua exigindo a
       expressão, para não apagar os valores por engano. */
    if(!expr && $('fcNovo').checked){
      const vazio=tipoAtual()==='N'?null:'';
      $('fcPrev').textContent='Sem expressão: o campo será criado vazio para preencher na tabela.';
      return {valores:(L.features||[]).map(()=>vazio), erros:0, primeiroErro:'', vazio:true};
    }
    if(!expr){ $('fcPrev').textContent='Escreva uma expressão (ou marque "Numerar feições automaticamente").'; return null; }
    let r;
    try{ r=fcAvalia(L,expr,tipoAtual()); }
    catch(e){ $('fcPrev').innerHTML='<b style="color:#e05252">Expressão inválida:</b> '+esc(e.message); return null; }
    const amostra=r.valores.slice(0,5).map((v,i)=>`${i+1}: ${v===''?'(vazio)':esc(String(v))}`).join('\n');
    $('fcPrev').textContent=amostra+
      `\n${r.valores.length} feição(ões) calculada(s)`+
      (r.erros?` · ${r.erros} com erro (${r.primeiroErro}) — ficam vazias`:' · sem erros');
    return r;
  };
  $('fcTestar').onclick=testar;
  $('fcOk').onclick=()=>{
    if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)){collabCanEditLayer(L,true);return;}
    const r=testar(); if(!r) return;
    let nome, tipo;
    if($('fcNovo').checked){
      nome=String($('fcNome').value||'').trim().slice(0,80);
      if(!nome){ toast('Dê um nome ao campo'); return; }
      /* DBF e QGIS não distinguem maiúsculas: "nome" e "NOME" seriam o mesmo campo */
      if((L.fields||[]).some(f=>String(f.name).toUpperCase()===nome.toUpperCase())){ toast('Já existe um campo com esse nome'); return; }
      tipo=$('fcTipo').value;
      (L.fields=L.fields||[]).push({name:nome,type:tipo,
        length:Math.max(1,+$('fcTam').value||(tipo==='N'?18:50)),
        decimal:tipo==='N'?Math.max(0,+$('fcDec').value||0):0});
    }else{
      nome=$('fcCampo').value; tipo=tipoAtual();
      if(!nome){ toast('Escolha o campo a atualizar'); return; }
    }
    L.features.forEach((f,i)=>{ f.props=f.props||{}; f.props[nome]=r.valores[i]; });
    L._rev=(+L._rev||0)+1;
    try{ drawLayer(L); }catch(e){}
    openAttr(); refreshUI();
    /* a coluna nova entra no fim da tabela: traz para a vista */
    try{ const th=[...document.querySelectorAll('#attrBody th')].find(t=>t.firstChild&&t.firstChild.textContent===nome);
      if(th) th.scrollIntoView({block:'nearest',inline:'nearest'}); }catch(e){}
    toast(r.vazio?`Campo criado vazio: ${nome} — preencha na tabela`
      :($('fcNovo').checked?'Campo criado':'Campo atualizado')+`: ${nome} · ${r.valores.length} feição(ões)`+
      (r.erros?` · ${r.erros} vazia(s) por erro`:''));
    fechar();
  };
  setTimeout(()=>$('fcExpr').focus(),40);
}
document.getElementById('btnAddField').onclick=abreCalculadoraCampo;
