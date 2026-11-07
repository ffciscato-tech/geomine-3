/* ============================================================================
   FAVORABILIDADE AMBIENTAL — seleção de áreas (0 desfavorável · 1 favorável ·
   2 muito favorável)
   MÉTODO, em duas etapas propositalmente separadas:
   1) PENEIRA DE IMPEDIMENTOS — qualquer sobreposição com bloqueio legal (terra
      indígena, UC de proteção integral, cavidade de máxima relevância…) zera a
      célula, e o motivo é registrado. Não entra em média: um bloqueio jurídico
      não se compensa com nota alta em geologia.
   2) NOTA PONDERADA do que sobrou — cada critério dá 0, 1 ou 2 à célula
      conforme esteja DENTRO, na FAIXA de influência ou FORA; a média
      ponderada pelos pesos cai em três classes por dois cortes editáveis.
   A malha é regular (célula do painel) e recortada pela área de estudo; o
   resultado é um raster de classes + relatório de áreas e motivos.
   ========================================================================== */
const FAVOR={crits:[], ultimo:null};
const FAVOR_PAPEIS={
  imped:'Impeditivo (zera a área)',
  restr:'Restritivo (penaliza)',
  favor:'Favorável (bônus)',
  exig :'Exigido (fora do alvo reprova)'
};
/* Anéis/linhas de uma feição, em coordenadas do CRS de trabalho. */
function favorAneis(L,f){
  if(L.gtype==='point') return [[f.geom]];
  return (f.multi&&Array.isArray(f.geom[0][0]))? f.geom.map(r=>r) : [f.geom];
}
function favorDentroAnel(x,y,r){
  let d=false;
  for(let i=0,j=r.length-1;i<r.length;j=i++){
    const xi=r[i][0],yi=r[i][1],xj=r[j][0],yj=r[j][1];
    if(((yi>y)!==(yj>y)) && x < (xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi) d=!d;
  }
  return d;
}
function favorDistAnel(x,y,r){
  let dm=Infinity;
  for(let i=1;i<r.length;i++){
    const d=distPtSeg([x,y], r[i-1], r[i]);
    if(d<dm) dm=d;
  }
  if(r.length===1) dm=Math.hypot(x-r[0][0], y-r[0][1]);
  return dm;
}
/* Feições de um critério, já filtradas por atributo quando o usuário pediu
   (ex.: só a litologia-alvo dentro da camada de geologia). */
function favorFeicoes(c){
  const L=(S.layers||[]).find(l=>l.id===+c.layerId);
  if(!L) return {L:null, feats:[]};
  let feats=L.features||[];
  if(c.campo && String(c.valor||'').trim()!==''){
    const alvos=String(c.valor).split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
    feats=feats.filter(f=>{
      const v=String((f.props||{})[c.campo]??'').trim().toLowerCase();
      return alvos.some(a=>v===a || (a.length>2 && v.includes(a)));
    });
  }
  return {L, feats};
}
/* Nota de UM critério para a célula: 2/1/0 conforme dentro, faixa ou fora.
   Devolve também se houve BLOQUEIO, para o motivo entrar no relatório. */
function favorNotaCel(c, dentro, dist){
  const faixa=Math.max(0, +c.buffer||0);
  const perto = dentro || (faixa>0 && dist<=faixa);
  if(c.papel==='imped') return {bloqueio:perto, nota:null};
  /* EXIGIDO: é o caso da litologia-alvo — fora dela não há jazida, então a
     nota cai a zero. FAVORÁVEL é bônus: estar perto premia, estar longe é
     NEUTRO (1), não reprova — senão uma área sem nenhuma restrição apareceria
     como desfavorável só por não ter o bônus, o que confunde a leitura. */
  if(c.papel==='exig')  return {bloqueio:false, nota: dentro?2 : (perto?1:0)};
  if(c.papel==='favor') return {bloqueio:false, nota: dentro?2 : (perto?2:1)};
  /* restritivo */             return {bloqueio:false, nota: dentro?0 : (perto?1:2)};
}
async function favorCalcula(){
  const Larea=(S.layers||[]).find(l=>l.id===+document.getElementById('fvArea').value);
  if(!Larea || Larea.gtype!=='polygon'){ toast('Escolha a área de estudo (camada de polígono)'); return; }
  const crits=FAVOR.crits.filter(c=>c.layerId && c.on!==false);
  if(!crits.length){ toast('Acrescente ao menos um critério'); return; }
  const cs=Math.max(1, +document.getElementById('fvCel').value||20);
  const t1=+document.getElementById('fvT1').value||0.8;
  const t2=+document.getElementById('fvT2').value||1.4;
  /* extensão = área de estudo */
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  const aneisArea=[];
  (Larea.features||[]).forEach(f=>favorAneis(Larea,f).forEach(r=>{
    aneisArea.push(r);
    r.forEach(p=>{ if(p[0]<x0)x0=p[0]; if(p[0]>x1)x1=p[0]; if(p[1]<y0)y0=p[1]; if(p[1]>y1)y1=p[1]; });
  }));
  if(!isFinite(x0)){ toast('Área de estudo sem geometria'); return; }
  const nc=Math.max(1,Math.ceil((x1-x0)/cs)), nr=Math.max(1,Math.ceil((y1-y0)/cs));
  if(nc*nr>4e6){ toast(`Malha de ${(nc*nr/1e6).toFixed(1)} M células — aumente a célula`); return; }
  showLoad(`Favorabilidade: ${nc}×${nr} células…`);
  await new Promise(r=>setTimeout(r,20));
  const N=nc*nr;
  const z=new Float32Array(N).fill(NaN);      // classe 0/1/2, NaN fora da área
  const soma=new Float32Array(N), peso=new Float32Array(N);
  const bloq=new Uint8Array(N);
  const motivo=new Int16Array(N).fill(-1);
  const dentroArea=new Uint8Array(N);
  const cx=i=>x0+((i%nc)+0.5)*cs, cy=i=>y1-((i/nc|0)+0.5)*cs;
  for(let i=0;i<N;i++){
    const X=cx(i), Y=cy(i);
    let dd=false; aneisArea.forEach(r=>{ if(favorDentroAnel(X,Y,r)) dd=!dd; });
    dentroArea[i]=dd?1:0;
  }
  const resumo=[];
  for(let ci=0; ci<crits.length; ci++){
    const c=crits[ci];
    const {L,feats}=favorFeicoes(c);
    if(!L){ resumo.push({nome:c.nome||'(camada removida)', n:0}); continue; }
    showLoad(`Favorabilidade: ${c.nome||L.name}…`);
    await new Promise(r=>setTimeout(r,5));
    const faixa=Math.max(0,+c.buffer||0), pesoC=Math.max(0,+c.peso||1);
    /* Pré-índice por caixa envolvente: só as células dentro da caixa da
       feição (mais a faixa) pagam o custo do teste geométrico. */
    const dentroF=new Uint8Array(N), distF=new Float32Array(N).fill(Infinity);
    feats.forEach(f=>{
      const aneis=favorAneis(L,f);
      let ax0=Infinity,ay0=Infinity,ax1=-Infinity,ay1=-Infinity;
      aneis.forEach(r=>r.forEach(p=>{ if(p[0]<ax0)ax0=p[0]; if(p[0]>ax1)ax1=p[0];
        if(p[1]<ay0)ay0=p[1]; if(p[1]>ay1)ay1=p[1]; }));
      if(!isFinite(ax0)) return;
      const i0=Math.max(0,Math.floor((ax0-faixa-x0)/cs)), i1=Math.min(nc-1,Math.ceil((ax1+faixa-x0)/cs));
      const j0=Math.max(0,Math.floor((y1-(ay1+faixa))/cs)), j1=Math.min(nr-1,Math.ceil((y1-(ay0-faixa))/cs));
      for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++){
        const k=j*nc+i; if(!dentroArea[k]) continue;
        const X=x0+(i+0.5)*cs, Y=y1-(j+0.5)*cs;
        if(L.gtype==='polygon'){
          let d=false; aneis.forEach(r=>{ if(favorDentroAnel(X,Y,r)) d=!d; });
          if(d){ dentroF[k]=1; distF[k]=0; continue; }
        }
        if(faixa>0 && distF[k]>0){
          let dm=Infinity; aneis.forEach(r=>{ const q=favorDistAnel(X,Y,r); if(q<dm) dm=q; });
          if(dm<distF[k]) distF[k]=dm;
        }
      }
    });
    let nBloq=0;
    for(let k=0;k<N;k++){
      if(!dentroArea[k]) continue;
      const r=favorNotaCel(c, dentroF[k]===1, distF[k]);
      if(r.bloqueio){ if(!bloq[k]){ bloq[k]=1; motivo[k]=ci; } nBloq++; continue; }
      if(r.nota!=null){ soma[k]+=r.nota*pesoC; peso[k]+=pesoC; }
    }
    resumo.push({nome:c.nome||L.name, papel:c.papel, feicoes:feats.length, bloqueadas:nBloq, peso:pesoC, faixa});
  }
  const areaCel=cs*cs; const cont=[0,0,0]; let nBloqTot=0, nNotaBaixa=0;
  const porMotivo={};
  for(let k=0;k<N;k++){
    if(!dentroArea[k]) continue;
    if(bloq[k]){ z[k]=0; cont[0]++; nBloqTot++;
      const m=motivo[k]>=0?(crits[motivo[k]].nome||'critério'):'—';
      porMotivo[m]=(porMotivo[m]||0)+1; continue; }
    const nota = peso[k]>0 ? soma[k]/peso[k] : 1;
    const cl = nota<t1 ? 0 : (nota<t2 ? 1 : 2);
    if(cl===0) nNotaBaixa++;               // desfavorável por NOTA, não por lei
    z[k]=cl; cont[cl]++;
  }
  /* raster de classes, com a mesma paleta do relatório */
  const d={nc,nr,cs,csy:cs,xll:x0,yll:y1-nr*cs,z};
  const R={id:rid++, name:'Favorabilidade — '+(document.getElementById('fvSubst').value||'estudo'),
    visible:true, overlay:null, srcCRS:Larea.crs||S.workCRS,
    style:{mode:'classes', opacity:0.75, classes:[
      {min:-0.5,max:0.5,color:'#c92a2a'},{min:0.5,max:1.5,color:'#f2b705'},{min:1.5,max:2.5,color:'#2f9e44'}]},
    d};
  S.rasters.push(R);
  try{ renderRaster(R); }catch(e){}
  FAVOR.ultimo={cont, areaCel, resumo, porMotivo, t1, t2, cs, nBloqTot, nNotaBaixa,
    subst:document.getElementById('fvSubst').value||'', area:Larea.name, rasterId:R.id};
  refreshUI(); hideLoad();
  favorRelatorio();
  toast(`Favorabilidade: ${(cont[2]*areaCel/10000).toFixed(1)} ha muito favorável · `+
        `${(cont[1]*areaCel/10000).toFixed(1)} ha favorável · ${(cont[0]*areaCel/10000).toFixed(1)} ha desfavorável`);
}
function favorRelatorio(){
  const U=FAVOR.ultimo, out=document.getElementById('fvOut');
  if(!U){ if(out) out.textContent='Nenhum estudo calculado ainda.'; return; }
  const ha=n=>(n*U.areaCel/10000).toLocaleString('pt-BR',{maximumFractionDigits:2});
  const tot=U.cont[0]+U.cont[1]+U.cont[2] || 1;
  const pc=n=>(100*n/tot).toFixed(1).replace('.',',')+'%';
  let t=`ESTUDO DE FAVORABILIDADE — ${U.subst||'—'}\nÁrea de estudo: ${U.area} · célula ${U.cs} m\n`+
    `Cortes de classe: 0→1 em ${U.t1} · 1→2 em ${U.t2}\n\n`+
    `  Muito favorável : ${ha(U.cont[2])} ha  (${pc(U.cont[2])})\n`+
    `  Favorável       : ${ha(U.cont[1])} ha  (${pc(U.cont[1])})\n`+
    `  Desfavorável    : ${ha(U.cont[0])} ha  (${pc(U.cont[0])})\n`+
    `  TOTAL analisado : ${ha(tot)} ha\n`;
  t+=`\nO desfavorável se divide em:\n`+
     `   · bloqueio legal : ${ha(U.nBloqTot||0)} ha\n`+
     `   · nota baixa     : ${ha(U.nNotaBaixa||0)} ha\n`;
  if(U.nBloqTot) t+=`\nMotivo do bloqueio:\n`+
    Object.entries(U.porMotivo).sort((a,b)=>b[1]-a[1])
      .map(([m,n])=>`   · ${m}: ${ha(n)} ha`).join('\n')+'\n';
  t+=`\nCritérios aplicados:\n`+U.resumo.map(r=>
    `   · ${r.nome} — ${FAVOR_PAPEIS[r.papel]||r.papel||'?'}, peso ${r.peso}`+
    (r.faixa?`, faixa ${r.faixa} m`:'')+`, ${r.feicoes} feição(ões)`).join('\n');
  if(out) out.textContent=t;
  try{ cmdLog('favorabilidade calculada','ok'); }catch(e){}
  return t;
}
/* ---------- painel dos critérios ---------- */
/* Sugestão inicial para MINERAÇÃO (caulim): papel, faixa de influência e peso
   já preenchidos conforme a prática de licenciamento — o usuário só liga cada
   linha à sua camada. As faixas seguem o que a norma cobra ou o que costuma
   ser exigido em parecer: 3 km da zona de amortecimento de UC, 250 m do raio
   de influência de cavidade, 50 m de APP de curso d'água estreito. */
const FAVOR_SUGESTAO=[
  {nome:'Terra indígena',                papel:'imped', buffer:0,    peso:1},
  {nome:'Território quilombola',         papel:'imped', buffer:0,    peso:1},
  {nome:'UC de proteção integral',       papel:'imped', buffer:0,    peso:1},
  {nome:'Cavidade de máxima relevância', papel:'imped', buffer:250,  peso:1},
  {nome:'Zona de amortecimento de UC',   papel:'restr', buffer:3000, peso:3},
  {nome:'APA (uso sustentável)',         papel:'restr', buffer:0,    peso:2},
  {nome:'APP',                           papel:'restr', buffer:50,   peso:3},
  {nome:'Reserva legal',                 papel:'restr', buffer:0,    peso:3},
  {nome:'Assentamento (INCRA)',          papel:'restr', buffer:0,    peso:2},
  {nome:'Área urbana / habitações',      papel:'restr', buffer:500,  peso:2},
  {nome:'Sítio arqueológico (IPHAN)',    papel:'restr', buffer:100,  peso:2},
  {nome:'Processo ANM de terceiros',     papel:'restr', buffer:0,    peso:3},
  {nome:'Geologia — litologia alvo',     papel:'exig',  buffer:500,  peso:4},
  {nome:'Área livre na ANM',             papel:'favor', buffer:0,    peso:3},
  {nome:'Área já antropizada',           papel:'favor', buffer:0,    peso:2},
  {nome:'Acesso viário',                 papel:'favor', buffer:2000, peso:2},
];
function favorOpcoesCamada(sel){
  return '<option value="">— escolha a camada —</option>'+
    (S.layers||[]).map(l=>`<option value="${l.id}" ${String(l.id)===String(sel)?'selected':''}>`+
      `${esc(l.name)} (${l.gtype==='polygon'?'pol':l.gtype==='line'?'lin':'pto'}, ${(l.features||[]).length})</option>`).join('');
}
function favorLinhaHTML(c,i){
  const L=(S.layers||[]).find(l=>l.id===+c.layerId);
  const campos=L?(L.fields||[]):[];
  return `<div class="fv-lin" data-i="${i}" style="border:1px solid var(--line);border-radius:8px;padding:6px;margin-bottom:6px;background:var(--panel2)">
    <div style="display:flex;align-items:center;gap:6px">
      <input type="checkbox" class="fv-on" ${c.on!==false?'checked':''} style="width:auto;accent-color:var(--amber)" title="Considerar este critério">
      <input type="text" class="fv-nome" value="${esc(c.nome||'')}" placeholder="nome do critério" style="flex:1;min-width:0">
      <span class="mini fv-del" style="cursor:pointer;padding:2px 7px" title="Remover">✕</span>
    </div>
    <select class="fv-cam" style="margin-top:5px">${favorOpcoesCamada(c.layerId)}</select>
    <div class="row2" style="margin-top:5px">
      <div><label class="field">Papel</label><select class="fv-papel">
        ${Object.entries(FAVOR_PAPEIS).map(([v,l])=>`<option value="${v}" ${c.papel===v?'selected':''}>${l}</option>`).join('')}
      </select></div>
      <div><label class="field">Faixa (m)</label><input type="number" class="fv-buf" value="${+c.buffer||0}" min="0" step="10"></div>
    </div>
    <div class="row2">
      <div><label class="field">Peso</label><input type="number" class="fv-peso" value="${+c.peso||1}" min="0" step="1"></div>
      <div><label class="field">Filtrar campo (opcional)</label><select class="fv-campo">
        <option value="">— todas as feições —</option>
        ${campos.map(f=>`<option value="${esc(f.name)}" ${c.campo===f.name?'selected':''}>${esc(f.name)}</option>`).join('')}
      </select></div>
    </div>
    ${c.campo?`<input type="text" class="fv-valor" value="${esc(c.valor||'')}" placeholder="valor(es), separados por vírgula — ex.: caulim, argila caulinítica" style="margin-top:5px">`:''}
  </div>`;
}
function favorPainelSync(){
  const box=document.getElementById('fvLista'); if(!box) return;
  const sel=document.getElementById('fvArea');
  if(sel){
    const cur=sel.value;
    sel.innerHTML='<option value="">— escolha —</option>'+
      (S.layers||[]).filter(l=>l.gtype==='polygon')
        .map(l=>`<option value="${l.id}" ${String(l.id)===cur?'selected':''}>${esc(l.name)}</option>`).join('');
  }
  box.innerHTML=FAVOR.crits.map((c,i)=>favorLinhaHTML(c,i)).join('')||
    '<div class="hint">Nenhum critério — use “+ Critério” ou a sugestão para mineração.</div>';
  box.querySelectorAll('.fv-lin').forEach(el=>{
    const i=+el.dataset.i, c=FAVOR.crits[i];
    const g=q=>el.querySelector(q);
    g('.fv-on').onchange=e=>{ c.on=e.target.checked; };
    g('.fv-nome').oninput=e=>{ c.nome=e.target.value; };
    g('.fv-cam').onchange=e=>{ c.layerId=e.target.value; c.campo=''; c.valor=''; favorPainelSync(); };
    g('.fv-papel').onchange=e=>{ c.papel=e.target.value; };
    g('.fv-buf').oninput=e=>{ c.buffer=+e.target.value||0; };
    g('.fv-peso').oninput=e=>{ c.peso=+e.target.value||0; };
    g('.fv-campo').onchange=e=>{ c.campo=e.target.value; favorPainelSync(); };
    const v=g('.fv-valor'); if(v) v.oninput=e=>{ c.valor=e.target.value; };
    g('.fv-del').onclick=()=>{ FAVOR.crits.splice(i,1); favorPainelSync(); };
  });
}
function favorPreset(){
  /* Casa cada sugestão com uma camada carregada pelo NOME, quando der — o
     nome do shapefile costuma dizer o que é (ti_poligonais, ucs_uso_sust…). */
  const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const pistas={
    'Terra indígena':['indigen','terra_ind','ti_'],
    'Território quilombola':['quilomb'],
    'UC de proteção integral':['protecao_integral','integral','parque','rebio','esec'],
    'Cavidade de máxima relevância':['caverna','cavidade','espeleo','canie'],
    'Zona de amortecimento de UC':['amortec','zona_amort'],
    'APA (uso sustentável)':['apa','uso_sustent'],
    'APP':['app'],
    'Reserva legal':['reserva_legal','_rl','reserva legal'],
    'Assentamento (INCRA)':['assentam','incra'],
    'Área urbana / habitações':['urban','edifica','habita'],
    'Sítio arqueológico (IPHAN)':['arqueo','iphan'],
    'Processo ANM de terceiros':['processo','sigmine','anm_proc'],
    'Geologia — litologia alvo':['geolog','litolog'],
    'Área livre na ANM':['livre','disponiv'],
    'Área já antropizada':['antropiz','uso_solo','mapbiomas','pastagem'],
    'Acesso viário':['rodovi','estrada','via','acesso'],
  };
  FAVOR.crits=FAVOR_SUGESTAO.map(s=>{
    const chaves=pistas[s.nome]||[];
    const L=(S.layers||[]).find(l=>chaves.some(k=>norm(l.name).includes(k)));
    return {...s, layerId:L?L.id:'', on:!!L, campo:'', valor:''};
  });
  favorPainelSync();
  const n=FAVOR.crits.filter(c=>c.layerId).length;
  toast(`Sugestão aplicada: ${FAVOR.crits.length} critérios · ${n} já casaram com camadas pelo nome`);
}
(function bindFavor(){
  const b=id=>document.getElementById(id);
  if(b('btnFavorAdd')) b('btnFavorAdd').onclick=()=>{
    FAVOR.crits.push({nome:'Novo critério', layerId:'', papel:'restr', buffer:0, peso:1, on:true});
    favorPainelSync();
  };
  if(b('btnFavorPreset')) b('btnFavorPreset').onclick=favorPreset;
  if(b('btnFavorRun'))    b('btnFavorRun').onclick=()=>{ favorCalcula().catch(e=>{ hideLoad(); toast('Falha: '+e.message); }); };
  if(b('btnFavorRel'))    b('btnFavorRel').onclick=()=>{
    const t=favorRelatorio();
    if(t){ try{ navigator.clipboard.writeText(t); toast('Relatório copiado'); }catch(e){} }
  };
  if(b('btnFavorPoli'))   b('btnFavorPoli').onclick=()=>favorPoligonos();
  const sec=document.getElementById('secFavor');
  if(sec) sec.addEventListener('pointerenter',()=>{ try{ favorPainelSync(); }catch(e){} });
})();
/* Classes em POLÍGONO, para entrar em prancha e ir para o shapefile. */
function favorPoligonos(){
  const U=FAVOR.ultimo;
  if(!U){ toast('Calcule a favorabilidade primeiro'); return; }
  const R=(S.rasters||[]).find(r=>r.id===U.rasterId);
  if(!R){ toast('O raster do estudo foi removido — calcule de novo'); return; }
  const d=R.d, nomes=['Desfavorável','Favorável','Muito favorável'], cores=['#c92a2a','#f2b705','#2f9e44'];
  let total=0;
  [0,1,2].forEach(cl=>{
    const feats=[];
    /* Cada célula da classe vira um quadrado; a mescla visual é suficiente
       para prancha e para exportar — sem vetorizar contorno, que exigiria
       tratamento de buracos e daria polígono com milhares de vértices. */
    for(let j=0;j<d.nr;j++) for(let i=0;i<d.nc;i++){
      const k=j*d.nc+i; if(d.z[k]!==cl) continue;
      const X=d.xll+i*d.cs, Y=d.yll+(d.nr-1-j)*d.cs;
      feats.push({geom:[[[X,Y],[X+d.cs,Y],[X+d.cs,Y+d.cs],[X,Y+d.cs],[X,Y]]],multi:true,zg:null,
        props:{CLASSE:cl, NOME:nomes[cl], AREA_M2:+(d.cs*d.cs).toFixed(1)}});
    }
    if(!feats.length) return;
    total+=feats.length;
    addLayer({name:`Favorabilidade — ${nomes[cl]}`, gtype:'polygon', crs:R.srcCRS||S.workCRS,
      features:feats, fields:[{name:'CLASSE',type:'N',length:3,decimal:0},
        {name:'NOME',type:'C',length:20},{name:'AREA_M2',type:'N',length:14,decimal:1}],
      color:cores[cl]});
  });
  refreshUI();
  toast(total? `Polígonos gerados: ${total} células em 3 camadas` : 'Nada a gerar');
}
/* O que está SOB o ponto clicado — não o que está por perto.
   Antes esta função devolvia a feição mais PRÓXIMA a qualquer distância: um
   clique no vazio trazia a feição de uma camada a quilômetros e o painel
   escrevia "a 1.234,5 m do toque". Identificar passa a exigir acerto real —
   polígono que contém o ponto, ou linha/ponto dentro da tolerância de alguns
   pixels. Sem acerto não há bloco de feição.
   Entre camadas decide a ordem da árvore: S.layers[0] é o topo e vence; as
   demais que também acertam entram como menção. Dentro da mesma camada, o
   polígono de MENOR área ganha do maior que o contém — mesmo critério do
   seletor geométrico. */
function infoMaisProxima(latlng){
  const p0=map.latLngToContainerPoint(latlng);
  const tolPx=(S.touch?14:8);
  const pT=map.containerPointToLatLng([p0.x+tolPx,p0.y+tolPx]);
  const dLat=Math.abs(pT.lat-latlng.lat), dLng=Math.abs(pT.lng-latlng.lng);
  let achado=null; const outros=[];
  for(const L of (S.layers||[])){
    if(!L||L.visible===false||!L.features||!L.features.length) continue;
    /* Clique e tolerância convertidos UMA vez para o CRS da camada: a
       comparação passa a ser direta contra a coordenada guardada, sem
       projetar vértice nenhum. */
    let X,Y,tolU;
    try{
      const c0=fromWGS(L.crs,latlng.lng,latlng.lat);
      const c1=fromWGS(L.crs,latlng.lng+dLng,latlng.lat+dLat);
      if(!Number.isFinite(c0[0])||!Number.isFinite(c0[1])||
         !Number.isFinite(c1[0])||!Number.isFinite(c1[1])) continue;
      X=c0[0]; Y=c0[1];
      tolU=Math.max(Math.abs(c1[0]-X),Math.abs(c1[1]-Y))||1e-9;
    }catch(e){ continue; }
    let melhor=null, menor=Infinity;
    for(let idx=0;idx<L.features.length;idx++){
      const f=L.features[idx];
      if(!f||!Array.isArray(f.geom)||!f.geom.length||f.geom[0]==null) continue;
      if(typeof featureVisible==='function'&&!featureVisible(L,f)) continue;
      const rings=(L.gtype==='point')?[f.geom]
        :((f.multi&&Array.isArray(f.geom[0])&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom]);
      let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
      for(const r of rings){ if(!Array.isArray(r)) continue;
        for(const q of r){ if(!Array.isArray(q)||!Number.isFinite(q[0])||!Number.isFinite(q[1])) continue;
          if(q[0]<x0)x0=q[0]; if(q[0]>x1)x1=q[0]; if(q[1]<y0)y0=q[1]; if(q[1]>y1)y1=q[1]; } }
      if(!Number.isFinite(x0)) continue;
      if(X<x0-tolU||X>x1+tolU||Y<y0-tolU||Y>y1+tolU) continue;   // longe: nem testa
      const perto=r=>{
        if(!Array.isArray(r)||r.length<2) return false;
        for(let i=0;i<r.length-1;i++)
          if(distPtSeg([X,Y],r[i],r[i+1])<=tolU) return true;
        return false;
      };
      /* "Peso" = quão específico é o acerto; o menor vence. Ponto é o alvo
         mais preciso, depois a linha, e por último o polígono — entre
         polígonos, o de MENOR área. Deixar o peso em Infinity para linha e
         para borda tornava a comparação `peso < menor` falsa já na primeira
         feição, e a camada inteira era descartada em silêncio. */
      let acerto=false, peso=Infinity, dentroDe=false;
      if(L.gtype==='polygon'){
        let dentro=false, a=0;
        for(const r of rings){ if(!Array.isArray(r)||r.length<3) continue;
          if(edInRing([X,Y],r)) dentro=!dentro; a+=Math.abs(edArea(r)); }
        if(dentro){ acerto=true; dentroDe=true; peso=a>0?a:1e9; }
        else for(const r of rings){ if(perto(r)){ acerto=true; peso=a>0?a:1e9; break; } }
      }else if(L.gtype==='line'){
        for(const r of rings) if(perto(r)){ acerto=true; peso=1; break; }
      }else{
        for(const r of rings){ if(!Array.isArray(r)) continue;
          for(const q of r){ if(Array.isArray(q)&&Math.hypot(q[0]-X,q[1]-Y)<=tolU){ acerto=true; peso=0; break; } }
          if(acerto) break; }
      }
      if(!acerto) continue;
      if(peso<menor){ menor=peso; melhor={d:0,L,idx,f,dentro:dentroDe}; }
    }
    if(melhor){ if(!achado) achado=melhor; else outros.push(L.name); }
  }
  if(achado) achado.outros=outros;
  return achado;
}
/* ⓘ INFORMAÇÃO DO PONTO
   Antes mostrava só a feição mais próxima. Agora lê primeiro o que há SOB o
   toque em cada superfície visível: cota interpolada e cota crua da célula,
   célula lin/col, resolução, posição no desnível, declividade e orientação
   da descida (Horn 3×3). Com duas superfícies, mostra o degrau entre elas
   (corte/aterro). A feição mais próxima continua vindo depois.            */
function rasterPontoInfo(r, x, y){
  const d=r&&r.d; if(!d||!d.z||!d.nc) return null;
  const csx=d.cs, csy=(d.csy||d.cs);
  const c=Math.floor((x-d.xll)/csx), lin=(d.nr-1)-Math.floor((y-d.yll)/csy);
  if(c<0||c>=d.nc||lin<0||lin>=d.nr) return null;
  const zc=d.z[lin*d.nc+c];
  if(zc==null||!isFinite(zc)) return {fora:true, col:c, lin};
  let zi=null; try{ zi=sampleZbil(d,x,y); }catch(e){}
  if(zi==null||!isFinite(zi)) zi=zc;
  /* Horn 3×3 — declividade e orientação da descida.
     A linha CRESCE para o sul, então dz/dnorte troca de sinal.            */
  const at=(i,j)=>{ i=Math.min(d.nc-1,Math.max(0,i)); j=Math.min(d.nr-1,Math.max(0,j));
    const v=d.z[j*d.nc+i]; return (v==null||!isFinite(v))? NaN : v; };
  const z1=at(c-1,lin-1), z2=at(c,lin-1), z3=at(c+1,lin-1),
        z4=at(c-1,lin),                    z6=at(c+1,lin),
        z7=at(c-1,lin+1), z8=at(c,lin+1),  z9=at(c+1,lin+1);
  let decl=null, azim=null, rosa=null;
  if([z1,z2,z3,z4,z6,z7,z8,z9].every(v=>isFinite(v))){
    const dzdx = ((z3+2*z6+z9)-(z1+2*z4+z7))/(8*csx);
    const dzdy = -((z7+2*z8+z9)-(z1+2*z2+z3))/(8*csy);
    const g=Math.hypot(dzdx,dzdy);
    decl={pct:g*100, gr:Math.atan(g)*180/Math.PI};
    if(g>1e-9){
      azim=(Math.atan2(-dzdx,-dzdy)*180/Math.PI+360)%360;   // para onde a água desce
      rosa=['N','NE','L','SE','S','SO','O','NO'][Math.round(azim/45)%8];
    }
  }
  let faixa=null;
  try{ const gi=rasterGeomInfo(r);
    if(gi&&isFinite(gi.zmin)&&gi.zmax>gi.zmin)
      faixa={zmin:gi.zmin, zmax:gi.zmax, pos:(zi-gi.zmin)/(gi.zmax-gi.zmin)*100};
  }catch(e){}
  return {zi, zc, col:c, lin, csx, csy, nc:d.nc, nr:d.nr, decl, azim, rosa, faixa,
          reamostrado:(d.resampled>1? d.resampled : 0)};
}
/* se o usuário clicou numa feição de drenagem, atualiza o painel */
function drenTalvezMostra(L, f){
  if(!L || L.gtype!=='line') return;
  const eh = L._dren || (f && f.props && f.props.TIPO && Object.values(DREN_TIPOS).some(t=>t.nome===f.props.TIPO));
  if(eh && typeof drenPainelInfo==='function') drenPainelInfo(L, f);
}
function wmsCamadasVisiveis(){
  return (S.wms||[]).filter(w=>{
    if(!w || w.visible===false || !w.llayer) return false;
    try{ return map.hasLayer(w.llayer); }catch(e){ return false; }
  }).slice().reverse();
}
function wmsInfoUrl(w,latlng,infoFormat){
  const sz=map.getSize(), b=map.getBounds(), crs=map.options.crs||L2.CRS.EPSG3857;
  const no=crs.project(b.getNorthWest()), se=crs.project(b.getSouthEast());
  const px=map.latLngToContainerPoint(latlng);
  const ver=String(w.version||'1.3.0'), v13=ver.indexOf('1.3')===0;
  const code=crs.code||'EPSG:3857';
  const p={
    SERVICE:'WMS', REQUEST:'GetFeatureInfo', VERSION:ver,
    LAYERS:w.layers, QUERY_LAYERS:w.layers, STYLES:'',
    BBOX:[no.x,se.y,se.x,no.y].join(','),
    WIDTH:Math.max(1,Math.round(sz.x)), HEIGHT:Math.max(1,Math.round(sz.y)),
    FORMAT:'image/png', TRANSPARENT:'TRUE', INFO_FORMAT:infoFormat,
    FEATURE_COUNT:20
  };
  p[v13?'CRS':'SRS']=code;
  p[v13?'I':'X']=Math.max(0,Math.min(p.WIDTH-1,Math.round(px.x)));
  p[v13?'J':'Y']=Math.max(0,Math.min(p.HEIGHT-1,Math.round(px.y)));
  const u=new URL(w.url,location.href);
  Object.entries(p).forEach(([k,v])=>u.searchParams.set(k,String(v)));
  return {url:u.toString(),crs:code};
}
function wmsPropsHtml(props){
  const rows=[];
  Object.entries(props||{}).slice(0,30).forEach(([k,v])=>{
    if(v==null || v==='' || typeof v==='object') return;
    rows.push(`<tr><td style="padding:1px 8px 1px 0;color:#666">${esc(k)}</td>`+
      `<td style="padding:1px 0"><b>${esc(String(v))}</b></td></tr>`);
  });
  return rows.length?`<table style="border-collapse:collapse">${rows.join('')}</table>`:'';
}
function wmsTextoSeguro(txt){
  const d=document.createElement('div');
  d.innerHTML=String(txt||'');
  return (d.textContent||d.innerText||'').replace(/\s+/g,' ').trim().slice(0,1800);
}
async function wmsConsultaUma(w,latlng){
  const formatos=['application/json','application/geo+json','text/plain','text/html'];
  let ultimo='', crs=(map.options.crs&&map.options.crs.code)||'EPSG:3857';
  for(const formato of formatos){
    try{
      const req=wmsInfoUrl(w,latlng,formato); crs=req.crs;
      const resp=await fetch(req.url,{mode:'cors',credentials:'omit'});
      if(!resp.ok){ ultimo='HTTP '+resp.status; continue; }
      const tipo=(resp.headers.get('content-type')||formato).toLowerCase();
      if(tipo.includes('json')){
        const j=await resp.json(), feats=Array.isArray(j.features)?j.features:[];
        if(feats.length) return {ok:true,crs,html:feats.slice(0,5).map((f,i)=>
          `<div style="${i?'border-top:1px dashed #ccd5db;margin-top:4px;padding-top:4px':''}">`+
          (feats.length>1?`<div style="color:#666">resultado ${i+1}</div>`:'')+
          (wmsPropsHtml(f&&f.properties)||'<i>feição sem atributos</i>')+`</div>`).join('')};
        ultimo='nenhuma feição no ponto'; continue;
      }
      const txt=await resp.text(), limpo=wmsTextoSeguro(txt);
      if(limpo && !/ServiceException|LayerNotQueryable/i.test(limpo))
        return {ok:true,crs,html:`<div style="white-space:normal">${esc(limpo)}</div>`};
      ultimo=/LayerNotQueryable/i.test(limpo)?'camada não consultável':(limpo||'resposta vazia');
    }catch(e){ ultimo=(e&&e.message)||'consulta bloqueada pelo servidor'; }
  }
  return {ok:false,crs,erro:ultimo||'GetFeatureInfo indisponível'};
}
async function wmsInfoHtml(latlng,camadas){
  const blocos=[];
  for(const w of camadas){
    const r=await wmsConsultaUma(w,latlng);
    const prov=w.provider||w.attribution||'serviço WMS';
    blocos.push(`<div style="border-top:1px solid #ddd;margin-top:6px;padding-top:5px">`+
      `<div style="font-weight:700;color:#305a78">WMS · ${esc(w.name||w.layers||'camada')}</div>`+
      `<table style="border-collapse:collapse;margin:2px 0 4px">`+
      `<tr><td style="padding-right:8px;color:#666">Serviço</td><td><b>${esc(prov)}</b></td></tr>`+
      `<tr><td style="padding-right:8px;color:#666">Camada</td><td><b>${esc(w.layers||'—')}</b></td></tr>`+
      `<tr><td style="padding-right:8px;color:#666">Versão / CRS</td><td><b>${esc(w.version||'1.3.0')} · ${esc(r.crs)}</b></td></tr>`+
      `</table>`+
      (r.ok?r.html:`<div style="color:#8a5a12"><i>Sem atributos: ${esc(r.erro)}. `+
        `A camada continua identificada pelos metadados acima.</i></div>`)+`</div>`);
  }
  return blocos.join('');
}
async function infoClick(latlng){
  const linhasPt=[];
  const li=(k,v,cor)=>linhasPt.push(
    `<tr><td style="padding:1px 8px 1px 0;color:${cor||'#666'}">${k}</td>`+
    `<td style="padding:1px 0"><b>${v}</b></td></tr>`);
  const n=(v,d)=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});

  // coordenadas no CRS de trabalho
  let q=null;
  try{ q=fromWGS(S.workCRS, latlng.lng, latlng.lat);
    li('E', n(q[0],2)+' m','var(--amber)'); li('N', n(q[1],2)+' m','var(--amber)');
    li('CRS', esc(String(S.workCRS)));
  }catch(e){}

  // superfícies sob o toque — somente as LIGADAS
  /* A informação passa a responder pelo que está ligado na árvore, e nada
     mais: o olho da camada é a única chave. Antes as superfícies apagadas
     também respondiam, e a leitura trazia cota de um MDT que não estava na
     tela — para consultar uma superfície oculta, basta ligá-la. Os vetores
     já se comportavam assim (infoMaisProxima ignora camada invisível). */
  const cotas=[];
  if(q){
    (S.rasters||[]).forEach(r=>{
      if(r.visible===false) return;
      const I=rasterPontoInfo(r,q[0],q[1]);
      if(!I || I.fora) return;
      cotas.push({nome:r.name,I,r,oculto:false});
    });
  }
  cotas.forEach((c,k)=>{
    const I=c.I;
    linhasPt.push(`<tr><td colspan="2" style="padding:6px 0 1px;border-top:1px solid #ddd;`+
      `color:#111;font-weight:600">${esc(c.nome)}`+
      (c.oculto?' <span style="font-weight:400;color:#999">(oculta)</span>':'')+`</td></tr>`);
    if(c.r&&c.r._cnOrto){
      const cl=((c.r.style&&c.r.style.classes)||[]).reduce((a,x)=>
        (!a||Math.abs(I.zi-x.value)<Math.abs(I.zi-a.value))?x:a,null);
      li('CN',n(I.zi,0),'var(--amber)');
      if(cl)li('Classe',esc(cl.label||''));
    }else if(rasEhDeclividade(c.r)){
      const un=rasUnidadeValor(c.r);
      li('Declividade',n(I.zi,3)+' '+un,'var(--amber)');
      if(Math.abs(I.zi-I.zc)>0.0005)li('Valor da célula',n(I.zc,3)+' '+un);
    }else if(c.r&&c.r.quantity==='mcfIndex'){
      /* índice adimensional: nem cota, nem declividade, nem aspecto */
      li('Valor', n(I.zi,3),'var(--amber)');
      if(Math.abs(I.zi-I.zc)>0.0005) li('Valor da célula', n(I.zc,3));
    }else li('Cota', n(I.zi,3)+' m','var(--amber)');
    const _idx=!!(c.r&&c.r.quantity==='mcfIndex');
    if(!_idx&&!rasEhDeclividade(c.r)&&Math.abs(I.zi-I.zc)>0.0005) li('Cota da célula', n(I.zc,3)+' m');
    if(!_idx&&!rasEhDeclividade(c.r)&&I.decl){ li('Declividade', n(I.decl.pct,1)+' %  ('+n(I.decl.gr,1)+'°)');
      if(I.rosa) li('Desce para', I.rosa+'  ('+n(I.azim,0)+'°)'); }
    if(I.faixa){
      if(_idx)li('Na faixa do índice',
        n(I.faixa.zmin,2)+' – '+n(I.faixa.zmax,2)+'  ('+n(I.faixa.pos,0)+'%)');
      else if(rasEhDeclividade(c.r))li('Na faixa da declividade',
        n(I.faixa.zmin,1)+' – '+n(I.faixa.zmax,1)+' '+rasUnidadeValor(c.r)+'  ('+n(I.faixa.pos,0)+'%)');
      else li('Na faixa do MDT', n(I.faixa.zmin,1)+' – '+n(I.faixa.zmax,1)+' m  ('+n(I.faixa.pos,0)+'%)');
    }
    li('Célula', 'lin '+I.lin+' · col '+I.col);
    li('Resolução', n(I.csx,2)+(Math.abs(I.csx-I.csy)>1e-6? ' × '+n(I.csy,2):'')+' m/célula'+
       (I.reamostrado? ' <span style="color:#b3781a">(tela ÷'+I.reamostrado+')</span>':''));
    li('Grade', I.nc+' × '+I.nr);
    /* Com a grade reamostrada, a resolução de tela não é a do arquivo: mostrar
       as duas evita concluir célula errada a partir do que está desenhado. */
    if(I.reamostrado>1){
      const d=c.r.d,
        W0=(+d._W0>0)?+d._W0:(Array.isArray(d.srcDims)?+d.srcDims[0]:null),
        H0=(+d._H0>0)?+d._H0:(Array.isArray(d.srcDims)?+d.srcDims[1]:null),
        cs0=(W0&&d._bb)?(d._bb[2]-d._bb[0])/W0:(I.csx/I.reamostrado);
      if(W0&&H0){
        li('Resolução nativa', n(cs0,3)+' m/célula','var(--amber)');
        li('Grade nativa', W0+' × '+H0+(d._full?' (carregada)':''));
      }
    }
    if(k===1){
      const dif=cotas[0].I.zi-cotas[1].I.zi;
      li('Degrau p/ a 1ª', (dif>=0?'+':'')+n(dif,3)+' m  ('+(dif>=0?'aterro':'corte')+')','var(--amber)');
    }
  });

  // feição mais próxima (como antes)
  const b=infoMaisProxima(latlng);
  let blocoFeic='';
  if(b){
    const {L,f,idx}=b;
    let dm=null;
    try{
      const rings=(f.multi && Array.isArray(f.geom[0][0]))? f.geom : [f.geom];
      let dd=Infinity;
      rings.forEach(r=>{
        const pts=r.map(p=>{ if(L.crs===S.workCRS) return [p[0],p[1]];
          const w=toWGS(L.crs,p[0],p[1]); const t=fromWGS(S.workCRS,w[0],w[1]); return [t[0],t[1]]; });
        if(L.gtype==='point'){ pts.forEach(p=>{ dd=Math.min(dd, Math.hypot(q[0]-p[0],q[1]-p[1])); }); return; }
        for(let i=0;i<pts.length-1;i++) dd=Math.min(dd, distPtSeg([q[0],q[1]],pts[i],pts[i+1]));
        if(L.gtype==='polygon' && pts.length>2) dd=Math.min(dd, distPtSeg([q[0],q[1]],pts[pts.length-1],pts[0]));
      });
      if(isFinite(dd)) dm=dd;
    }catch(e){}
    const linhas=[];
    (L.fields||[]).forEach(fd=>{
      const v=f.props? f.props[fd.name] : null;
      if(v===null || v===undefined || v==='') return;
      linhas.push(`<tr><td style="padding:1px 8px 1px 0;color:#666">${esc(fd.name)}</td>`+
                  `<td style="padding:1px 0"><b>${esc(String(v))}</b></td></tr>`);
    });
    if(typeof geomCamposDe==='function'){
      geomCamposDe(L.gtype).forEach(k=>{
        const v=geomValor(L,f,k);
        if(v==null) return;
        const dec=(k==='$X'||k==='$Y')?2:(k==='$AREA_HA'?3:2);
        linhas.push(`<tr><td style="padding:1px 8px 1px 0;color:var(--amber)">${esc(GEOM_CAMPOS[k])}</td>`+
                    `<td style="padding:1px 0"><b>${n(v,dec)}</b></td></tr>`);
      });
    }
    /* A feição só chega aqui quando o ponto está sobre ela: o rótulo diz ONDE,
       e não a que distância. */
    const dTxt = b.dentro? 'dentro do polígono'
      : (L.gtype==='point'? 'sobre o ponto' : 'sobre o traçado');
    const maisAqui=(b.outros&&b.outros.length)
      ? `<div style="margin-bottom:4px;color:#888;font-size:11px">também sob o ponto: ${esc(b.outros.slice(0,4).join(' · '))}`+
        `${b.outros.length>4?' e mais '+(b.outros.length-4):''}</div>` : '';
    blocoFeic=`<div style="border-top:1px solid #ddd;margin-top:6px;padding-top:5px">`+
      `<div style="font-weight:600">${esc(L.name)}</div>`+
      `<div style="margin-bottom:4px;color:#666">feição ${idx+1} de ${L.features.length} · ${dTxt}</div>`+
      maisAqui+
      (linhas.length? `<table style="border-collapse:collapse">${linhas.join('')}</table>`
                    : '<i style="color:#666">sem atributos preenchidos</i>')+`</div>`;
    S.activeId=L.id; S.selFeat={layer:L, layerId:L.id, idx};
  }

  const wmsAtivas=wmsCamadasVisiveis();
  if(!linhasPt.length && !blocoFeic && !wmsAtivas.length){ toast('Nada sob o toque'); return; }
  const baseHtml=`<div style="font:12px Signika,sans-serif;max-width:300px">`+
    (linhasPt.length? `<table style="border-collapse:collapse;width:100%">${linhasPt.join('')}</table>`:'')+
    (cotas.length? '' : '<div style="color:#666;margin-top:4px"><i>nenhuma superfície visível sob o ponto</i></div>')+
    (blocoFeic||'<div style="color:#666;margin-top:2px"><i>nenhuma feição sob o ponto</i></div>');
  const html=baseHtml+(wmsAtivas.length?
    `<div id="alagisWmsInfoLoad" style="border-top:1px solid #ddd;margin-top:6px;padding-top:5px;color:#666">`+
    `Consultando ${wmsAtivas.length} camada${wmsAtivas.length===1?'':'s'} WMS…</div>`:'')+`</div>`;
  infoFecha();
  infoPop=L2.popup({maxWidth:340, autoPan:true}).setLatLng(latlng).setContent(html).openOn(map);
  try{ if(b) highlightSel(); }catch(e){}
  try{ if(typeof propRefresh==='function') propRefresh(); }catch(e){}
  if(wmsAtivas.length){
    const popAtual=infoPop;
    try{
      const whtml=await wmsInfoHtml(latlng,wmsAtivas);
      if(infoPop===popAtual){
        popAtual.setContent(baseHtml+whtml+`</div>`);
        try{ popAtual.update(); }catch(e){}
      }
    }catch(e){
      if(infoPop===popAtual){
        popAtual.setContent(baseHtml+
          `<div style="border-top:1px solid #ddd;margin-top:6px;padding-top:5px;color:#8a5a12">`+
          `<b>WMS</b><br><i>Não foi possível consultar o serviço, mas a camada permanece visível.</i></div></div>`);
        try{ popAtual.update(); }catch(_){}
      }
    }
  }
}
