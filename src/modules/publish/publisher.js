/* GeoMine — Publicador (faixa GIS › Publicar).
   Pedido de 28/11/2026, print IMG_0296: "essa aba aqui não precisa, podemos trocar para colocar
   um publisher, onde possa mandar para o cliente em HTML as camadas que quero exportar, por
   exemplo o MDT, o DCE cortado e a ortofoto, lembrando que a ortofoto por padrão vai sempre
   drapeada na superfície. Aí você pode colocar algumas feições de medidas de inclinação, sempre
   no estilo cards".
   Gera UM arquivo .html com tudo dentro (programa, superfícies, imagem e linhas): abre em qualquer
   navegador, sem internet, sem login e sem o GeoMine. O visualizador é viewer.html +
   viewer-core.js + viewer-app.js; o formato dos dados é o de publisher-pack.js. */
(function(root){
'use strict';
if(root.GeoMinePublisher)return;
const P=root.GeoMinePublisherPack;
/* Peças do visualizador, incorporadas na montagem (tools/build.py, embed_files). */
const PECAS=[['esqueleto',__GMPUB_FILE_VIEWER__],['three.js r128 (licença MIT)',__GMPUB_FILE_THREE__],['OrbitControls (licença MIT)',__GMPUB_FILE_ORBIT__],
  ['linhas 3D',__GMPUB_FILE_LINES__],['contas',__GMPUB_FILE_CORE__],['visualizador',__GMPUB_FILE_APP__]];
const PROGRAMA=PECAS.reduce((n,p)=>n+p[1].length,0);
/* Malha por superfície. O padrão cabe em telefone e tablet; "nativa" é para quem vai abrir no computador. */
const MALHAS=[['leve','Leve — até 300 mil pontos',300000],['normal','Normal — até 1,2 milhão de pontos',1200000],['detalhada','Detalhada — até 4 milhões de pontos',4000000],['nativa','Nativa — todos os pontos do MDT',0]];
const ORTOS=[[2048,'2.048 px'],[4096,'4.096 px'],[8192,'8.192 px (só computador)']];
const CHAVE='geomine.publicador.v1';
const $=id=>document.getElementById(id), h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,d)=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const cede=()=>new Promise(r=>setTimeout(r,16));
let gerado=null, ocupado=false;

function lembrado(){ try{ return JSON.parse(localStorage.getItem(CHAVE)||'{}')||{}; }catch(_){ return {}; } }
function lembra(o){ try{ localStorage.setItem(CHAVE,JSON.stringify(Object.assign(lembrado(),o))); }catch(_){} }

/* ---------- o que pode ser publicado ---------- */
function superficies(){
  /* só grades de cota: mapas derivados (declividade, CN…) não são superfície */
  return (S.rasters||[]).filter(r=>r&&r.d&&r.d.z&&r.d.nc>1&&r.d.nr>1&&(!r.quantity||r.quantity==='elevation'));
}
/* "MDT recortado" de uma cava ou pilha: terreno e projeto na mesma grade */
const ehRecorte=r=>!!(r&&r.src&&r.src.kind==='cava2-clipped');
const origemDoRecorte=r=>ehRecorte(r)?(S.rasters||[]).find(q=>q.id===r.src.sourceRasterId)||null:null;
function vetores(){ return (S.layers||[]).filter(L=>L&&Array.isArray(L.features)&&L.features.length&&['line','polygon','point'].includes(L.gtype)); }
function ortofotos(){ try{ return typeof listaOrtofotosCarregadas==='function'?listaOrtofotosCarregadas():[]; }catch(_){ return []; } }
const papelDe=r=>ehRecorte(r)?'recorte':(r._v3&&['projeto','cava','dce','estrada'].includes(r._v3.papel))?'projeto':'terreno';
const NOME_PAPEL={terreno:'terreno',projeto:'projeto',recorte:'terreno + obra'};
const nativoDe=r=>{ const d=r.d, w=Number((d.srcDims&&d.srcDims[0])||d._W0||d.nc), a=Number((d.srcDims&&d.srcDims[1])||d._H0||d.nr); return {nc:w>0?w:d.nc, nr:a>0?a:d.nr, cs:d.cs*d.nc/(w>0?w:d.nc)}; };
const limite=()=>(MALHAS.find(m=>m[0]===($('gpubMalha')||{}).value)||MALHAS[1])[2];
function nomeDoProjeto(){ return String((S.auto&&S.auto.name)||S.currentProjectName||'Publicação').replace(/\.(ccmgis|geocampo|alagis)$/i,''); }
function crsLegivel(){ const c=S.workCRS||''; const n=(typeof CRS_LABELS!=='undefined'&&CRS_LABELS[c])||''; return n?n+' ('+c+')':c; }

/* ---------- janela ---------- */
function monta(){
  let m=$('gpubModal'); if(m) return m;
  m=document.createElement('div'); m.id='gpubModal'; m.className='modal-bg';
  m.innerHTML=`<div class="modal gpub" role="dialog" aria-label="Publicar para o cliente">
    <div class="modal-h"><b>Publicar para o cliente</b><span class="tag">HTML</span><div style="flex:1"></div><button class="tbtn" id="gpubX" aria-label="Fechar">✕</button></div>
    <div class="modal-b">
      <div class="gm-work-card gpub-card"><div class="gm-card-heading"><span class="gm-card-step" aria-hidden="true">1</span><b>Publicação</b></div>
        <div class="gpub-g2"><div class="larga"><label class="field" for="gpubTitulo">Título</label><input type="text" id="gpubTitulo" maxlength="120"></div>
        <div><label class="field" for="gpubCliente">Cliente ou obra</label><input type="text" id="gpubCliente" maxlength="120" placeholder="opcional"></div>
        <div><label class="field" for="gpubAssina">Assinatura</label><input type="text" id="gpubAssina" maxlength="80" placeholder="opcional"></div></div></div>
      <div class="gm-work-card gpub-card"><div class="gm-card-heading"><span class="gm-card-step" aria-hidden="true">2</span><b>Superfícies</b><span class="gpub-lado" id="gpubSupN"></span></div><div class="gpub-lista" id="gpubSup"></div></div>
      <div class="gm-work-card gpub-card"><div class="gm-card-heading"><span class="gm-card-step" aria-hidden="true">3</span><b>Ortofoto</b></div><select id="gpubOrto" aria-label="Ortofoto drapeada sobre o terreno"></select>
        <p class="gpub-nota">Vai sempre drapeada sobre o terreno. No arquivo o cliente pode desligá-la para ver as cores por cota.</p></div>
      <div class="gm-work-card gpub-card"><div class="gm-card-heading"><span class="gm-card-step" aria-hidden="true">4</span><b>Linhas e pontos</b><span class="gpub-lado"><button type="button" data-todas="1">todas</button> · <button type="button" data-todas="0">nenhuma</button></span></div><div class="gpub-lista" id="gpubVet"></div></div>
      <div class="gm-work-card gpub-card"><div class="gm-card-heading"><span class="gm-card-step" aria-hidden="true">5</span><b>Qualidade e tamanho</b></div>
        <div class="gpub-g2"><div><label class="field" for="gpubMalha">Malha do MDT</label><select id="gpubMalha">${MALHAS.map(q=>`<option value="${q[0]}">${h(q[1])}</option>`).join('')}</select></div>
        <div><label class="field" for="gpubLado">Imagem da ortofoto</label><select id="gpubLado">${ORTOS.map(q=>`<option value="${q[0]}">${h(q[1])}</option>`).join('')}</select></div></div>
        <p class="gpub-nota" id="gpubResumo"></p></div>
    </div>
    <div class="gpub-f"><span id="gpubPeso"></span><button class="tbtn" id="gpubCancela">Cancelar</button><button class="tbtn on" id="gpubGera">Gerar e ver</button></div>
  </div>`;
  document.body.appendChild(m);
  const fecha=()=>{ if(!ocupado) m.classList.remove('on'); };
  $('gpubX').onclick=fecha; $('gpubCancela').onclick=fecha;
  m.addEventListener('click',e=>{ if(e.target===m) fecha(); });
  m.addEventListener('change',resumo); m.addEventListener('input',e=>{ if(e.target.type==='text') gerado=null; });
  m.querySelectorAll('[data-todas]').forEach(b=>b.onclick=()=>{ $('gpubVet').querySelectorAll('input').forEach(c=>{ c.checked=b.dataset.todas==='1'; }); resumo(); });
  $('gpubGera').onclick=()=>{ void geraEVe(); };
  return m;
}
function preenche(){
  const L=lembrado();
  $('gpubTitulo').value=nomeDoProjeto(); $('gpubCliente').value=''; $('gpubAssina').value=L.assinatura||'';
  $('gpubMalha').value=MALHAS.some(q=>q[0]===L.malha)?L.malha:'normal'; $('gpubLado').value=ORTOS.some(q=>q[0]===+L.lado)?String(L.lado):'4096';
  const sups=superficies();
  /* o corte esconde o MDT de origem no mapa; na publicação ele dá o entorno, então já vem marcado */
  const origens=new Set(sups.filter(r=>r.visible!==false).map(origemDoRecorte).filter(Boolean).map(r=>r.id));
  $('gpubSup').innerHTML=sups.length?sups.map(r=>`<label><input type="checkbox" data-sup="${h(r.id)}"${(r.visible!==false||origens.has(r.id))?' checked':''}><span title="${h(r.name)}">${h(r.name)}</span><small>${NOME_PAPEL[papelDe(r)]}</small></label>`).join('')
    :'<div class="gpub-vazio">Nenhum MDT no projeto. Importe ou gere uma superfície primeiro.</div>';
  const os=ortofotos();
  $('gpubOrto').innerHTML=os.map(q=>`<option value="${h(q.id)}">${h(q.o.name||'Ortofoto')}</option>`).join('')+'<option value="">sem ortofoto</option>';
  const vs=vetores();
  $('gpubVet').innerHTML=vs.length?vs.map(l=>`<label><input type="checkbox" data-vet="${h(l.id)}"${l.visible!==false?' checked':''}><span title="${h(l.name)}">${h(l.name)}</span><small>${l.features.length.toLocaleString('pt-BR')} ${l.gtype==='point'?'pt':l.gtype==='polygon'?'pol':'lin'}</small></label>`).join('')
    :'<div class="gpub-vazio">Nenhuma camada de linhas, polígonos ou pontos.</div>';
  gerado=null; resumo();
}
function escolha(){
  const ids=sel=>[...$('gpubModal').querySelectorAll(sel)].filter(c=>c.checked).map(c=>c.dataset.sup||c.dataset.vet);
  const sup=new Set(ids('[data-sup]')), vet=new Set(ids('[data-vet]'));
  return {titulo:$('gpubTitulo').value.trim()||nomeDoProjeto(), cliente:$('gpubCliente').value.trim(), assinatura:$('gpubAssina').value.trim(),
    superficies:superficies().filter(r=>sup.has(String(r.id))), vetores:vetores().filter(l=>vet.has(String(l.id))),
    orto:ortofotos().find(q=>q.id===$('gpubOrto').value)||null, malha:$('gpubMalha').value, limite:limite(), lado:+$('gpubLado').value||4096};
}
/* resumo do card 5 e peso estimado no rodapé: muda a cada escolha, antes de gerar */
function resumo(){
  if(!$('gpubModal')) return;
  gerado=null;
  const e=escolha(); let celulas=0; const linhas=[];
  for(const r of e.superficies){
    const n=nativoDe(r), passo=P.passoDaMalha(n.nc,n.nr,e.limite), nc=Math.ceil((n.nc-1)/passo)+1, nr=Math.ceil((n.nr-1)/passo)+1;
    celulas+=nc*nr;
    linhas.push(h(r.name)+': célula de '+fmt(n.cs*passo,2)+' m'+(passo>1?' (nativa: '+fmt(n.cs,2)+' m)':' (nativa)'));
  }
  let vertices=0; for(const l of e.vetores) for(const f of l.features) vertices+=contaVertices(f.geom);
  let px=0;
  if(e.orto){
    /* a imagem publicada nunca é maior que a que o projeto tem carregada */
    const t=tamanhoDaOrto(e.orto), f=t?Math.min(1,e.lado/Math.max(t[0],t[1])):1;
    px=t?t[0]*t[1]*f*f:e.lado*e.lado*0.6;
  }
  $('gpubSupN').textContent=e.superficies.length?e.superficies.length+' escolhida'+(e.superficies.length>1?'s':''):'';
  $('gpubResumo').innerHTML=linhas.length?linhas.join('<br>')+'<br>As medidas de inclinação do cliente são feitas sobre esta malha.':'Escolha ao menos uma superfície.';
  $('gpubPeso').innerHTML=e.superficies.length?'arquivo de cerca de <b>'+P.tamanho(P.estimativa({celulas,ortoPixels:px,vertices,programa:PROGRAMA}))+'</b>':'';
  $('gpubGera').disabled=!e.superficies.length;
}
const ladosDaOrto=new Map();
function tamanhoDaOrto(q){
  const url=q&&q.o&&(q.o._workPreviewURL||q.o.url); if(!url) return null;
  if(ladosDaOrto.has(url)) return ladosDaOrto.get(url);
  ladosDaOrto.set(url,null);
  const im=new Image(); im.onload=()=>{ ladosDaOrto.set(url,[im.naturalWidth,im.naturalHeight]); if($('gpubModal')&&$('gpubModal').classList.contains('on')) resumo(); }; im.src=url;
  return null;
}
function contaVertices(g){ if(!Array.isArray(g)) return 0; if(typeof g[0]==='number') return 1; let n=0; for(const q of g) n+=contaVertices(q); return n; }

/* ---------- empacotamento ---------- */
async function leSuperficie(r,limiteCelulas,avisa){
  const n=nativoDe(r), total=n.nc*n.nr, orcamento=(limiteCelulas>0?limiteCelulas:Math.max(total,4))*112;
  const src=await v3DisplaySource(r,()=>true,orcamento);
  try{
    const g=src.grid, nc=g.nc, nr=g.nr, z=new Float32Array(nc*nr);
    for(let top=0;top<nr;top+=192){
      const fim=Math.min(nr,top+192), bloco=await src.readWindow([0,top,nc,fim]);
      for(let i=0;i<bloco.length;i++){ const v=bloco[i]; z[top*nc+i]=Number.isFinite(v)?v:NaN; }
      if(top%768===0){ avisa(Math.round(100*fim/nr)); await cede(); }
    }
    const pt=(c,l)=>src.toWork(src.cellPoint?src.cellPoint(c,l):[g.xll+(c+.5)*g.cs,v3RasterCellY(g,l)]);
    const a=pt(0,0), b=pt(nc-1,0), c=pt(0,nr-1), p1=pt(1,0), q1=pt(0,1), dx=p1[0]-a[0], dy=a[1]-q1[1];
    const torta=Math.abs(b[1]-a[1])>Math.abs(dx)*0.02*(nc-1)||Math.abs(c[0]-a[0])>Math.abs(dy)*0.02*(nr-1)||!(dx>0)||!(dy>0);
    const cor=(r._v3&&r._v3.cor)||(r.style&&r.style.solidColor)||null;
    const comum={id:r.id, nome:r.name, papel:papelDe(r), cor, nativa:src.nativeResolution!==false&&!src.displayStride, celulaNativa:n.cs};
    if(!torta){
      /* Malha reduzida: a última coluna e a última linha são as da borda do MDT, que nem sempre caem
         no passo. Fora do passo elas saem — esticar a grade para alcançá-las deslocaria todos os
         pontos (até uma célula nativa); perde-se no máximo um passo de borda. */
      const ncU=Math.abs(b[0]-(a[0]+(nc-1)*dx))>dx*1e-6?nc-1:nc, nrU=Math.abs(c[1]-(a[1]-(nr-1)*dy))>dy*1e-6?nr-1:nr;
      if(ncU===nc&&nrU===nr) return Object.assign(comum,{nc,nr,dx,dy,x0:a[0],y0:a[1],z});
      const zu=new Float32Array(ncU*nrU); for(let l=0;l<nrU;l++) zu.set(z.subarray(l*nc,l*nc+ncU),l*ncU);
      return Object.assign(comum,{nc:ncU,nr:nrU,dx,dy,x0:a[0],y0:a[1],z:zu});
    }
    /* grade original noutro sistema de coordenadas: reamostra numa grade reta no CRS de trabalho */
    const d=pt(nc-1,nr-1), xs=[a[0],b[0],c[0],d[0]], ys=[a[1],b[1],c[1],d[1]], x0=Math.min(...xs), x1=Math.max(...xs), y0=Math.min(...ys), y1=Math.max(...ys);
    const cel=Math.max((x1-x0)/(nc-1),(y1-y0)/(nr-1)), mc=Math.max(2,Math.round((x1-x0)/cel)+1), mr=Math.max(2,Math.round((y1-y0)/cel)+1), zr=new Float32Array(mc*mr);
    for(let l=0;l<mr;l++){ for(let k=0;k<mc;k++){ const v=sampleZbil(r.d,x0+k*cel,y1-l*cel); zr[l*mc+k]=Number.isFinite(v)?v:NaN; } if(l%128===0) await cede(); }
    return Object.assign(comum,{nc:mc,nr:mr,dx:cel,dy:cel,x0,y0:y1,z:zr,nativa:false});
  }finally{ try{ src.close(); }catch(_){} }
}
function partesDaCamada(L){
  const partes=[];
  for(const f of L.features){
    if(!f||!f.geom) continue;
    try{ if(typeof featureVisible==='function'&&!featureVisible(L,f)) continue; }catch(_){}
    let st=null, classe=null; try{ st=featureStyle(L,f); classe=classOf(L,f); }catch(_){}
    st=st||L.sym||{};
    const cor=(L.gtype==='point'?(st.color||st.stroke):(st.stroke||st.color))||L.color||'#222222';
    const base={cor:String(cor), peso:Number.isFinite(+st.weight)?+st.weight:1.5, tracejado:!!String(st.dash||'').trim(), rotulo:classe?String(classe.label||classe.value||''):''};
    if(L.gtype==='point'){
      const g=f.geom, q=(L.crs&&L.crs!==S.workCRS)?reproj(L.crs,S.workCRS,g[0],g[1]):g, z=Number.isFinite(+f.zg)?+f.zg:null;
      if(q&&Number.isFinite(q[0])&&Number.isFinite(q[1])) partes.push(Object.assign({pts:[[q[0],q[1],z]]},base));
      continue;
    }
    const aneis=gtRings(L,f), zs=(typeof gtZg==='function'?gtZg(f):null)||[];
    aneis.forEach((anel,i)=>{
      const pts=[]; anel.forEach((p,k)=>{ if(!p||!Number.isFinite(p[0])||!Number.isFinite(p[1])) return; const z=zs[i]&&Number.isFinite(+zs[i][k])?+zs[i][k]:null; pts.push([p[0],p[1],z]); });
      if(L.gtype==='polygon'&&pts.length>2){ const a=pts[0], u=pts[pts.length-1]; if(a[0]!==u[0]||a[1]!==u[1]) pts.push(a.slice()); }
      if(pts.length>1) partes.push(Object.assign({pts},base));
    });
  }
  return partes;
}
async function leOrtofoto(fonte,lado,origem,sups){
  const info=v3OrthoTextureInfo(fonte.o,S.workCRS); if(!info) return {erro:'a ortofoto está sem georreferência válida'};
  const terreno=sups.filter(s=>s.papel!=='projeto'); if(!terreno.length) return {erro:'não há superfície de terreno para receber a ortofoto'};
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const s of terreno){ x0=Math.min(x0,s.x0); x1=Math.max(x1,s.x0+(s.nc-1)*s.dx); y1=Math.max(y1,s.y0); y0=Math.min(y0,s.y0-(s.nr-1)*s.dy); }
  const b=info.workBounds;
  if(b[2]<x0||b[0]>x1||b[3]<y0||b[1]>y1) return {erro:'a ortofoto não cobre nenhuma superfície escolhida'};
  /* amostra só onde a imagem e o terreno se encontram: é ali que o encaixe precisa ser exato */
  const ax=Math.max(x0,b[0]), bx=Math.min(x1,b[2]), ay=Math.max(y0,b[1]), by=Math.min(y1,b[3]), am=[], uv=[0,0];
  for(let i=0;i<=6;i++) for(let j=0;j<=6;j++){ const x=ax+(bx-ax)*i/6, y=ay+(by-ay)*j/6; info.writeUV(x,y,uv,0); if(Number.isFinite(uv[0])&&Number.isFinite(uv[1])) am.push({x:x-origem[0],y:y-origem[1],u:uv[0],v:uv[1]}); }
  const fit=P.afim(am); if(!fit) return {erro:'não foi possível encaixar a ortofoto no terreno'};
  const cv=await orthoCanvasFromURL(info.url,lado);
  let img, alfa=null;
  try{
    /* imagem recortada por polígono ou com borda sem dado: a máscara vai junto e o fundo da
       parte transparente fica neutro (em JPEG ela sairia preta e manchada sobre o terreno) */
    const k=Math.min(1,512/Math.max(cv.width,cv.height)), mw=Math.max(1,Math.round(cv.width*k)), mh=Math.max(1,Math.round(cv.height*k));
    const mc=document.createElement('canvas'); mc.width=mw; mc.height=mh;
    const mx=mc.getContext('2d',{willReadFrequently:true}); mx.imageSmoothingEnabled=true; mx.imageSmoothingQuality='high'; mx.drawImage(cv,0,0,mw,mh);
    const d=mx.getImageData(0,0,mw,mh).data, a=new Uint8Array(mw*mh); for(let i=0;i<a.length;i++) a[i]=d[4*i+3];
    alfa=P.semImagem(a,mw,mh);
    if(alfa){ const x=cv.getContext('2d'); x.globalCompositeOperation='destination-over'; x.fillStyle='#8c9088'; x.fillRect(0,0,cv.width,cv.height); x.globalCompositeOperation='source-over'; }
    img=cv.toDataURL('image/jpeg',0.86);
  }catch(e){ return {erro:'o navegador não liberou os pixels desta ortofoto'}; }
  if(!/^data:image\/jpeg/.test(img)) return {erro:'o navegador não gerou a imagem da ortofoto'};
  return {nome:fonte.o.name||'Ortofoto', img, uv:fit.uv, alfa, erro:null, desvio:fit.erro, largura:cv.width, altura:cv.height};
}
async function gera(e){
  if(!e.superficies.length) throw new Error('Escolha ao menos uma superfície.');
  const avisa=t=>showLoad(t);
  const lidas=[];
  for(const r of e.superficies){
    avisa('Lendo “'+r.name+'”…'); await cede();
    lidas.push(await leSuperficie(r,e.limite,p=>avisa('Lendo “'+r.name+'”… '+p+'%')));
  }
  /* origem redonda perto dos dados: as coordenadas vão pequenas no arquivo e o visualizador soma de volta */
  const origem=[Math.floor(Math.min(...lidas.map(s=>s.x0))/1000)*1000, Math.floor(Math.min(...lidas.map(s=>s.y0-(s.nr-1)*s.dy))/1000)*1000];
  const sups=[], avisos=[];
  /* MDT recortado: marca a obra (o que mudou em relação ao terreno de origem) e esconde o terreno
     original por baixo dele, para as duas malhas não brigarem e a cava não ficar tampada */
  for(let i=0;i<lidas.length;i++){
    const s=lidas[i], r=e.superficies[i]; if(s.papel!=='recorte') continue;
    avisa('Separando terreno e obra em “'+s.nome+'”…'); await cede();
    const fonte=origemDoRecorte(r);
    if(fonte&&fonte.d){ const m=P.marcaObra(s,(x,y)=>{ const v=sampleZbil(fonte.d,x,y); return Number.isFinite(v)?v:NaN; },0.05); if(m.pontos) s.obra=m.obra; }
    for(const t of lidas) if(t.papel==='terreno'){ const o=P.ocultaSob(t,s); if(o){ if(t.oculta){ for(let k=0;k<o.length;k++) if(o[k]) t.oculta[k]=1; } else t.oculta=o; } }
  }
  for(const s of lidas){ const q=P.superficie(s,origem); if(q) sups.push(q); else avisos.push('“'+s.nome+'” não tem nenhuma cota válida e ficou de fora'); await cede(); }
  if(!sups.length) throw new Error('Nenhuma das superfícies escolhidas tem cotas.');
  let orto=null;
  if(e.orto){
    avisa('Preparando a ortofoto…'); await cede();
    const o=await leOrtofoto(e.orto,e.lado,origem,lidas);
    if(o.erro) avisos.push('Ortofoto fora da publicação: '+o.erro); else{ orto={nome:o.nome,img:o.img,uv:o.uv}; if(o.alfa) orto.alfa={w:o.alfa.w,h:o.alfa.h,bits:o.alfa.bits}; }
  }
  const vets=[];
  for(const L of e.vetores){
    avisa('Lendo “'+L.name+'”…'); await cede();
    const v=P.vetor({nome:L.name, tipo:L.gtype==='point'?'point':'line', visivel:true, partes:partesDaCamada(L)},origem);
    if(v) vets.push(v);
  }
  avisa('Montando o arquivo…'); await cede();
  const partes=[e.cliente].filter(Boolean);
  const dados={v:P.VERSAO, titulo:e.titulo, subtitulo:partes.join(' · '), data:new Date().toLocaleDateString('pt-BR'), crs:crsLegivel(), origem,
    rodape:(e.assinatura?e.assinatura+' · ':'')+'Gerado no GeoMine.', superficies:sups, ortofoto:orto, vetores:vets};
  const html=P.html({esqueleto:PECAS[0][1], titulo:e.titulo, dados, scripts:PECAS.slice(1).map(p=>({nome:p[0],codigo:p[1]}))});
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const nome=(e.titulo.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w.\- ]+/g,' ').trim().replace(/\s+/g,'_')||'publicacao').slice(0,80)+'.html';
  return {blob, nome, bytes:blob.size, avisos, resumo:{superficies:sups.map(s=>({nome:s.nome,nc:s.nc,nr:s.nr,celula:s.celula,nativa:s.nativa,papel:s.papel})), orto:orto?orto.nome:null, vetores:vets.map(v=>({nome:v.nome,partes:v.tam.length,vertices:v.vertices}))}};
}

/* ---------- prévia e gravação ---------- */
function previa(){
  let p=$('gpubPrevia');
  if(!p){
    p=document.createElement('div'); p.id='gpubPrevia';
    p.innerHTML='<div class="barra"><button class="tbtn" id="gpubVolta">← Voltar</button><span id="gpubInfo"></span><button class="tbtn on" id="gpubGrava">Gravar o HTML</button></div><iframe title="Prévia da publicação"></iframe>';
    document.body.appendChild(p);
    $('gpubVolta').onclick=fechaPrevia; $('gpubGrava').onclick=()=>{ void grava(); };
  }
  return p;
}
function fechaPrevia(){ const p=$('gpubPrevia'); if(!p) return; p.classList.remove('on'); const f=p.querySelector('iframe'); if(f._url){ URL.revokeObjectURL(f._url); f._url=null; } f.removeAttribute('src'); }
async function geraEVe(){
  if(ocupado) return false;
  const e=escolha(); if(!e.superficies.length){ toast('Escolha ao menos uma superfície para publicar.'); return false; }
  ocupado=true; lembra({assinatura:e.assinatura, malha:e.malha, lado:e.lado});
  try{
    gerado=await gera(e); hideLoad();
    gerado.avisos.forEach(a=>{ try{ cmdLog('Publicar: '+a,'avisa'); }catch(_){} });
    if(gerado.avisos.length) toast(gerado.avisos[0]);
    const p=previa(), f=p.querySelector('iframe');
    if(f._url) URL.revokeObjectURL(f._url);
    f._url=URL.createObjectURL(gerado.blob); f.src=f._url;
    $('gpubInfo').innerHTML='<b>'+h(gerado.nome)+'</b> · '+P.tamanho(gerado.bytes)+' · é assim que o cliente vai ver';
    p.classList.add('on');
    try{ cmdLog('Publicação gerada: '+gerado.nome+' ('+P.tamanho(gerado.bytes)+')','info'); }catch(_){}
    return true;
  }catch(err){
    hideLoad(); gerado=null;
    if(!err||err.name!=='AbortError') toast('Não foi possível gerar a publicação: '+(err&&err.message||err));
    console.warn('publicador:',err); return false;
  }finally{ ocupado=false; }
}
async function grava(){
  if(!gerado) return false;
  const feito=await download(gerado.blob,gerado.nome);
  return feito!==false;
}
function open(){
  if(typeof S==='undefined') return false;
  const m=monta(); preenche(); m.classList.add('on');
  if(!superficies().length) toast('Publicar precisa de ao menos um MDT no projeto.');
  return true;
}
root.GeoMinePublisher={open, gera:()=>gera(escolha()), geraEVe, grava, fechaPrevia, get ultimo(){ return gerado; },
  __teste:{escolha, resumo, partesDaCamada, superficies, vetores, ortofotos, programa:PROGRAMA}};
})(window);
