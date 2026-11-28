/* GeoMine — Baixar satélite (faixa GIS › Serviços e bases).
   Pedido de 28/11/2026: "também no GIS a opção de baixar a imagem de ortofoto que esteja
   carregada para uma camada de imagem, na resolução máxima, com a opção de ser somente dentro
   de um polígono de escolha" — e a imagem é "o satélite do mapa de fundo".
   Baixa os quadros do mapa de fundo (Google ou Esri) no nível mais fino que o aparelho consegue
   montar numa imagem só, emenda sem reamostrar e entrega como a camada de imagem do projeto —
   a mesma que a Visão 3D e o Publicador drapeiam sobre o terreno. As contas ficam em
   satellite-image-core.js. */
(function(root){
'use strict';
if(root.GeoMineSatImage)return;
const C=root.GeoMineSatImageCore;
const BASES=['Satélite (Google)','Satélite (Esri)','Híbrido (Google)'];
const EM_PARALELO=8, TENTATIVAS=3, PRAZO_DO_QUADRO=20000;
const $=id=>document.getElementById(id), h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const br=n=>Number(n).toLocaleString('pt-BR');
const pausa=ms=>new Promise(r=>setTimeout(r,ms));
let ocupado=false, parar=false, nomeMexido=false;

const movel=()=>typeof EH_MOVEL!=='undefined'&&!!EH_MOVEL;
const limite=()=>C.limiteDoAparelho(movel());

/* ---------- de onde e de que área ---------- */
function fontes(){
  if(typeof baseLayers==='undefined'||!baseLayers) return [];
  return BASES.map(nome=>{
    const l=baseLayers[nome]; if(!l||!l._url) return null;
    const sub=l.options&&l.options.subdomains;
    return {nome, modelo:l._url, servidores:typeof sub==='string'?sub.split(''):(Array.isArray(sub)?sub:[]), zMax:Number(l.options&&l.options.maxNativeZoom)||19};
  }).filter(Boolean);
}
function aneisDaFeicao(L,f){
  if(!f||!Array.isArray(f.geom)||!f.geom.length) return [];
  const partes=(Array.isArray(f.geom[0])&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
  return partes.map(r=>r.map(v=>toWGS(L.crs||S.workCRS,v[0],v[1]))).filter(r=>r.length>=3&&r.every(p=>p&&Number.isFinite(p[0])&&Number.isFinite(p[1])));
}
function areas(){
  const out=[{id:'tela',nome:'Área visível no mapa'}];
  const visiveis=L=>L.features.filter(f=>{ try{ return typeof featureVisible!=='function'||featureVisible(L,f); }catch(_){ return true; } });
  const sf=S.selFeat, Ls=sf&&(sf.layer||(S.layers||[]).find(l=>l.id===sf.layerId));
  if(Ls&&Ls.gtype==='polygon'&&Ls.features&&Ls.features[sf.idx]) out.push({id:'sel',nome:'Polígono selecionado — '+Ls.name,L:Ls,feicoes:[Ls.features[sf.idx]]});
  for(const L of S.layers||[]){
    if(!L||L.gtype!=='polygon'||!Array.isArray(L.features)) continue;
    const fs=visiveis(L); if(!fs.length) continue;
    out.push({id:'cam:'+L.id,nome:L.name+' — '+(fs.length===1?'1 polígono':br(fs.length)+' polígonos'),L,feicoes:fs});
  }
  /* a área de um MDT: a imagem cobre a superfície inteira, pronta para drapear */
  for(const r of S.rasters||[]){
    if(!r||!r.d||!r.d.z||!(r.d.nc>1&&r.d.nr>1)||(r.quantity&&r.quantity!=='elevation')) continue;
    if(areaDoMDT(r)) out.push({id:'mdt:'+r.id,nome:'Área do MDT — '+r.name,r});
  }
  return out;
}
/* Retângulo em graus que envolve um MDT, como ele está no mapa */
function areaDoMDT(r){
  try{
    const ov=r.overlay&&typeof r.overlay.getBounds==='function'?r.overlay.getBounds():null;
    if(ov&&ov.isValid&&ov.isValid()){ const a={oeste:ov.getWest(),sul:ov.getSouth(),leste:ov.getEast(),norte:ov.getNorth()}; if(C.areaValida(a)) return a; }
    const d=r.d, crs=d.crs||S.workCRS, x0=d.xll, y0=d.yll, x1=d.xll+d.nc*d.cs, y1=d.yll+d.nr*(d.csy||d.cs), borda=[];
    for(let i=0;i<=8;i++){ const t=i/8; borda.push(toWGS(crs,x0+t*(x1-x0),y0),toWGS(crs,x0+t*(x1-x0),y1),toWGS(crs,x0,y0+t*(y1-y0)),toWGS(crs,x1,y0+t*(y1-y0))); }
    const a=C.areaDosAneis([borda]); return C.areaValida(a)?a:null;
  }catch(_){ return null; }
}
function alvo(){
  const o=areas().find(a=>a.id===($('gsatArea')||{}).value)||areas()[0];
  if(o.id==='tela'){
    const b=map.getBounds();
    return {tipo:'tela',nome:o.nome,area:{oeste:b.getWest(),sul:b.getSouth(),leste:b.getEast(),norte:b.getNorth()},feicoes:null};
  }
  if(o.r) return {tipo:'mdt',nome:o.nome,area:areaDoMDT(o.r),feicoes:null};
  const feicoes=o.feicoes.map(f=>aneisDaFeicao(o.L,f)).filter(a=>a.length);
  return {tipo:'poligono',nome:o.nome,area:C.areaDosAneis(feicoes.flat()),feicoes};
}

/* ---------- janela ---------- */
function monta(){
  let m=$('gsatModal'); if(m) return m;
  m=document.createElement('div'); m.id='gsatModal'; m.className='modal-bg';
  m.innerHTML=`<div class="modal gpub gsat" role="dialog" aria-label="Baixar satélite para uma camada de imagem">
    <div class="modal-h"><b>Baixar satélite</b><span class="tag">imagem</span><div style="flex:1"></div><button class="tbtn" id="gsatX" aria-label="Fechar">✕</button></div>
    <div class="modal-b">
      <div class="gm-work-card gpub-card"><div class="gm-card-heading"><span class="gm-card-step" aria-hidden="true">1</span><b>Origem</b></div>
        <select id="gsatBase" aria-label="Mapa de fundo de onde vem a imagem"></select></div>
      <div class="gm-work-card gpub-card"><div class="gm-card-heading"><span class="gm-card-step" aria-hidden="true">2</span><b>Área</b></div>
        <select id="gsatArea" aria-label="Área a baixar"></select>
        <label class="gsat-marca" id="gsatRecortaL"><input type="checkbox" id="gsatRecorta" checked><span>Só dentro do polígono (fora dele fica transparente)</span></label></div>
      <div class="gm-work-card gpub-card"><div class="gm-card-heading"><span class="gm-card-step" aria-hidden="true">3</span><b>Resolução</b></div>
        <select id="gsatNivel" aria-label="Resolução da imagem"></select>
        <p class="gpub-nota" id="gsatNota"></p></div>
      <div class="gm-work-card gpub-card"><div class="gm-card-heading"><span class="gm-card-step" aria-hidden="true">4</span><b>Camada de imagem</b></div>
        <label class="field" for="gsatNome">Nome</label><input type="text" id="gsatNome" maxlength="80">
        <div id="gsatDestinoBox"><label class="field" for="gsatDestino" id="gsatDestinoL"></label><select id="gsatDestino">
          <option value="guardar">Guardar para a Visão 3D e o Publicador</option>
          <option value="trocar">Mostrar no mapa no lugar dela</option></select>
          <p class="gpub-nota" id="gsatDestinoNota"></p></div></div>
    </div>
    <div class="gsat-prog" id="gsatProg" hidden><i></i></div>
    <div class="gpub-f"><span id="gsatPeso"></span><button class="tbtn" id="gsatCancela">Cancelar</button><button class="tbtn on" id="gsatBaixa">Baixar</button></div>
  </div>`;
  document.body.appendChild(m);
  const fecha=()=>{ if(ocupado){ parar=true; $('gsatCancela').disabled=true; $('gsatPeso').textContent='Parando…'; } else m.classList.remove('on'); };
  $('gsatX').onclick=fecha; $('gsatCancela').onclick=fecha;
  m.addEventListener('click',e=>{ if(e.target===m&&!ocupado) m.classList.remove('on'); });
  $('gsatBase').onchange=()=>{ if(!nomeMexido) $('gsatNome').value=$('gsatBase').value; resumo(true); };
  $('gsatArea').onchange=()=>resumo(true);
  $('gsatRecorta').onchange=()=>resumo(false);
  $('gsatNivel').onchange=()=>resumo(false);
  $('gsatNome').oninput=()=>{ nomeMexido=true; };
  $('gsatDestino').onchange=()=>resumo(false);
  $('gsatBaixa').onclick=()=>{ void executa(); };
  return m;
}
function preenche(){
  const fs=fontes(), atual=typeof S.getBase==='function'?S.getBase():S._base;
  $('gsatBase').innerHTML=fs.map(f=>`<option value="${h(f.nome)}">${h(f.nome)}</option>`).join('');
  $('gsatBase').value=fs.some(f=>f.nome===atual)?atual:(fs[0]?fs[0].nome:'');
  const as=areas();
  $('gsatArea').innerHTML=as.map(a=>`<option value="${h(a.id)}">${h(a.nome)}</option>`).join('');
  /* quem abriu o comando com um polígono selecionado quer a imagem dele */
  $('gsatArea').value=as.some(a=>a.id==='sel')?'sel':'tela';
  $('gsatRecorta').checked=true;
  nomeMexido=false; $('gsatNome').value=$('gsatBase').value;
  const tem=!!(S.img&&S.img.url);
  $('gsatDestinoBox').hidden=!tem; $('gsatDestino').value='guardar';
  if(tem) $('gsatDestinoL').textContent='Já existe a imagem “'+(S.img.name||'imagem')+'” no mapa';
  resumo(true);
}
/* O que foi escolhido nos cards. refaz=true quando a origem ou a área mudou: a lista de
   resoluções é refeita e volta para a máxima que cabe. */
let listaDeNiveis=[];
function escolha(){
  const f=fontes().find(q=>q.nome===$('gsatBase').value)||null, a=alvo();
  const plano=listaDeNiveis.find(p=>String(p.z)===$('gsatNivel').value&&p.cabe)||null;
  return {fonte:f, alvo:a, plano, recorta:a.tipo==='poligono'&&$('gsatRecorta').checked,
    nome:$('gsatNome').value.trim()||(f?f.nome:'Satélite'), destino:(S.img&&S.img.url)?$('gsatDestino').value:'mapa'};
}
function resumo(refaz){
  if(!$('gsatModal')) return;
  const f=fontes().find(q=>q.nome===$('gsatBase').value)||null, a=alvo(), lim=limite();
  $('gsatRecortaL').hidden=a.tipo!=='poligono';
  const valida=!!f&&C.areaValida(a.area);
  if(refaz){
    listaDeNiveis=valida?C.niveis(a.area,{zMax:f.zMax,zMin:Math.max(8,f.zMax-10),maxPixels:lim.maxPixels,maxLado:lim.maxLado}):[];
    const melhor=C.melhor(listaDeNiveis);
    $('gsatNivel').innerHTML=listaDeNiveis.map(p=>`<option value="${p.z}"${p.cabe?'':' disabled'}>${h(C.textoResolucao(p.mpp))} · ${br(p.largura)} × ${br(p.altura)} px${p.cabe?(p.z===f.zMax?' — máxima do provedor':''):' — não cabe neste aparelho'}</option>`).join('');
    $('gsatNivel').value=melhor?String(melhor.z):'';
  }
  const e=escolha(), p=e.plano, melhor=C.melhor(listaDeNiveis), nota=[];
  if(!f) nota.push('Nenhum mapa de fundo de satélite disponível.');
  else if(!valida) nota.push(a.tipo==='poligono'?'Este polígono não tem área para baixar.':'Não foi possível ler a área do mapa.');
  else if(!melhor) nota.push('Área grande demais para uma imagem só. Aproxime o mapa ou escolha um polígono menor.');
  else{
    if(melhor.z<f.zMax){
      const topo=listaDeNiveis[0], lado=Math.floor(Math.sqrt(lim.maxPixels)*topo.mpp/10)*10;
      nota.push('O provedor vai até '+C.textoResolucao(topo.mpp)+' ('+C.textoPixels(topo.pixels)+' nesta área); este aparelho monta até '+C.textoPixels(lim.maxPixels)+' por imagem. Para a máxima, área de até uns '+br(lado)+' × '+br(lado)+' m.');
    }
    nota.push('Sem imagem própria neste nível, o provedor entrega o anterior ampliado.');
  }
  $('gsatNota').textContent=nota.join(' ');
  let peso='';
  if(p){
    let quadros=p.quadros, dentro='';
    let ate='';
    if(e.recorta){
      /* camada com muitos vértices: a conta exata fica para a hora de baixar, para a janela não travar */
      let vertices=0; for(const fe of e.alvo.feicoes) for(const an of fe) vertices+=an.length;
      if(vertices<=20000){
        const aneis=C.orienta(e.alvo.feicoes.map(fe=>fe.map(an=>C.anelEmPixels(an,p))));
        quadros=C.quadros(p,aneis).length;
        dentro=' ('+C.textoPixels(Math.round(p.pixels*C.fracaoDentro(aneis,p.largura,p.altura)))+' dentro do polígono)';
      }else ate='até ';
    }
    peso='<b>'+h(C.textoPixels(p.pixels))+'</b>'+h(dentro)+' · '+ate+br(quadros)+' quadro'+(quadros===1?'':'s');
  }
  $('gsatPeso').innerHTML=peso;
  $('gsatDestinoNota').textContent=$('gsatDestino').value==='trocar'
    ?'A atual sai do mapa e fica guardada para a Visão 3D e o Publicador.'
    :'A imagem do mapa continua como está.';
  $('gsatBaixa').disabled=!p;
}

/* ---------- download e montagem ---------- */
/* Tela de desenho do tamanho pedido — ou null quando o aparelho não a entrega de verdade
   (no iPad a tela grande demais é criada, mas nada do que se desenha nela fica). */
function tela(w,ht){
  const cv=document.createElement('canvas'); cv.width=w; cv.height=ht;
  const ctx=cv.getContext('2d');
  if(!ctx||cv.width!==w||cv.height!==ht) return null;
  try{
    ctx.fillStyle='#000'; ctx.fillRect(w-1,ht-1,1,1);
    if(ctx.getImageData(w-1,ht-1,1,1).data[3]!==255) return null;
    ctx.clearRect(w-1,ht-1,1,1);
  }catch(_){ return null; }
  return {cv,ctx};
}
function quadroDaRede(url){
  return new Promise(resolve=>{
    const im=new Image(); im.crossOrigin='anonymous'; let fim=false;
    const acaba=v=>{ if(fim) return; fim=true; clearTimeout(t); im.onload=im.onerror=null; resolve(v); };
    const t=setTimeout(()=>acaba(null),PRAZO_DO_QUADRO);
    im.onload=()=>acaba(im.naturalWidth>0?im:null); im.onerror=()=>acaba(null);
    im.src=url;
  });
}
const interrompido=()=>Object.assign(new Error('Download interrompido.'),{name:'AbortError'});
function codifica(cv,tipo,qualidade){
  return new Promise((resolve,reject)=>{
    try{ cv.toBlob(b=>b?resolve(b):reject(new Error('o navegador não gerou a imagem')),tipo,qualidade); }
    catch(e){ reject(e&&e.name==='SecurityError'?new Error('o provedor não liberou a cópia desta imagem. Escolha outra origem no card 1'):e); }
  });
}
const comoURL=blob=>new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=()=>reject(new Error('não foi possível guardar a imagem')); r.readAsDataURL(blob); });

/* Baixa e monta a imagem de um plano. avisa(feitos,total) acompanha os quadros. */
async function baixa(e,p,avisa){
  const aneis=e.recorta?C.orienta(e.alvo.feicoes.map(fe=>fe.map(an=>C.anelEmPixels(an,p)))):null;
  const qs=C.quadros(p,aneis);
  if(!qs.length) throw new Error('O polígono não tem nenhum pedaço dentro da área.');
  const t=tela(p.largura,p.altura);
  if(!t) throw Object.assign(new Error('Este aparelho não montou uma imagem de '+br(p.largura)+' × '+br(p.altura)+' px.'),{semTela:true});
  const {cv,ctx}=t;
  try{
    let proximo=0, feitos=0, perdidos=0;
    const um=async q=>{
      const url=C.url(e.fonte.modelo,e.fonte.servidores,q.x,q.y,q.z);
      for(let k=0;k<TENTATIVAS;k++){
        if(parar) return false;
        const im=await quadroDaRede(url);
        if(im){ ctx.drawImage(im,q.dx,q.dy,C.LADO,C.LADO); return true; }
        if(k<TENTATIVAS-1) await pausa(300*(k+1));
      }
      return false;
    };
    await Promise.all(Array.from({length:Math.min(EM_PARALELO,qs.length)},async()=>{
      while(proximo<qs.length&&!parar){
        if(!await um(qs[proximo++])) perdidos++;
        feitos++; if(avisa) avisa(feitos,qs.length);
        /* sem resposta do provedor não adianta insistir em centenas de quadros */
        if(perdidos>=12&&perdidos===feitos) parar='rede';
      }
    }));
    if(parar==='rede'||(perdidos&&perdidos===qs.length)) throw new Error('Nenhum quadro veio do provedor. Confira a internet ou troque a origem no card 1.');
    if(parar) throw interrompido();
    if(perdidos) throw new Error(br(perdidos)+' de '+br(qs.length)+' quadros não vieram. Tente de novo: os que já vieram ficam guardados pelo navegador.');
    if(aneis){
      ctx.globalCompositeOperation='destination-in'; ctx.beginPath();
      for(const a of aneis){ a.forEach((v,i)=>i?ctx.lineTo(v[0],v[1]):ctx.moveTo(v[0],v[1])); ctx.closePath(); }
      ctx.fill('nonzero'); ctx.globalCompositeOperation='source-over';
    }
    if(avisa) avisa(qs.length,qs.length,'Gravando a imagem…');
    await pausa(30);
    /* inteira: JPEG. Recortada: precisa de transparência — WebP onde o navegador grava, PNG no iPad. */
    const blob=await codifica(cv,aneis?'image/webp':'image/jpeg',0.92);
    const url=await comoURL(blob);
    if(!/^data:image\/(jpeg|webp|png)/.test(url)) throw new Error('o navegador não gerou a imagem');
    return {url, plano:p, bytes:blob.size, tipo:blob.type, quadros:qs.length, recortada:!!aneis};
  }finally{ cv.width=cv.height=0; }
}

/* Retângulo, no CRS de trabalho, que envolve a imagem (os pixels dela estão em Web Mercator) */
function envelope(lim){
  const b=[Infinity,Infinity,-Infinity,-Infinity];
  for(let i=0;i<=16;i++){
    const t=i/16, x=lim.oeste+t*(lim.leste-lim.oeste), y=lim.sul+t*(lim.norte-lim.sul);
    for(const v of [[x,lim.sul],[x,lim.norte],[lim.oeste,y],[lim.leste,y]]){
      const q=fromWGS(S.workCRS,v[0],v[1]);
      if(!q||!Number.isFinite(q[0])||!Number.isFinite(q[1])) return null;
      if(q[0]<b[0]) b[0]=q[0]; if(q[1]<b[1]) b[1]=q[1]; if(q[0]>b[2]) b[2]=q[0]; if(q[1]>b[3]) b[3]=q[1];
    }
  }
  return b;
}
const tamanho=n=>n>=1048576?(n/1048576).toLocaleString('pt-BR',{maximumFractionDigits:1})+' MB':Math.max(1,Math.round(n/1024))+' kB';
const FORMATO={'image/jpeg':['JPEG','.jpg'],'image/webp':['WebP','.webp'],'image/png':['PNG','.png']};

/* A imagem pronta vira a camada de imagem do projeto (ou fica guardada, se o usuário preferiu
   manter a que já está no mapa). Tem a mesma forma de uma ortofoto reaberta do arquivo:
   pixels em Web Mercator, cantos em _llbounds. */
function entrega(r,e){
  const lim=r.plano.limites, ll=[[lim.sul,lim.oeste],[lim.norte,lim.leste]], b=envelope(lim);
  if(!b) throw new Error('A área baixada não cabe no sistema de coordenadas do projeto.');
  const fm=FORMATO[r.tipo]||FORMATO['image/png'];
  const I={url:r.url, overlay:null, b, name:e.nome, visible:true, _sourceCRS:S.workCRS, _warpWM:true, _llbounds:ll,
    _ortoId:'sat-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),
    /* a extensão de imagem comum diz ao app que não existe um GeoTIFF original para religar */
    src:{file:e.fonte.nome+' nível '+r.plano.z+fm[1], size:r.bytes, at:new Date().toISOString()}};
  const guardar=e.destino==='guardar'&&!!(S.img&&S.img.url);
  if(guardar) registraOrtoParaDrape(I);
  else{
    if(S.img){
      registraOrtoParaDrape(S.img);
      if(S.img.overlay) try{ map.removeLayer(S.img.overlay); }catch(_){}
    }
    if(!map.getPane('alagis_ortofoto')){ const pn=map.createPane('alagis_ortofoto'); pn.style.zIndex=405; }
    I.overlay=L2.imageOverlay(I.url,ll,{opacity:typeof orthoOpacidade==='function'?orthoOpacidade():1,pane:'alagis_ortofoto'});
    I.overlay.addTo(map);
    S.img=I;
    try{ if(typeof orthoHDReset==='function') orthoHDReset(); }catch(_){}
    refreshUI(); zApply();
  }
  try{ root.GeoMineSessionAutosave&&root.GeoMineSessionAutosave.markDirty('imagem de satélite'); }catch(_){}
  try{ root.GeoMineWorkspaceResume&&root.GeoMineWorkspaceResume.request&&root.GeoMineWorkspaceResume.request(); }catch(_){}
  const oque='“'+e.nome+'”: '+br(r.plano.largura)+' × '+br(r.plano.altura)+' px, '+C.textoResolucao(r.plano.mpp)+' ('+fm[0]+', '+tamanho(r.bytes)+')';
  const msg=guardar?'Imagem guardada para a Visão 3D e o Publicador — '+oque+'. A imagem do mapa não mudou.':'Camada de imagem criada — '+oque+'.';
  try{ cmdLog(msg+' Origem: '+e.fonte.nome+', nível '+r.plano.z+', '+br(r.quadros)+' quadros.','info'); }catch(_){}
  toast(msg);
  return {imagem:I, guardada:guardar};
}

async function executa(){
  if(ocupado) return null;
  const e=escolha();
  if(!e.fonte||!e.plano){ toast('Escolha a área e a resolução.'); return null; }
  ocupado=true; parar=false;
  const barra=$('gsatProg'), fio=barra.querySelector('i'), botoes=['gsatBaixa','gsatBase','gsatArea','gsatNivel','gsatRecorta','gsatNome','gsatDestino'];
  botoes.forEach(id=>{ $(id).disabled=true; }); barra.hidden=false; fio.style.width='0%'; $('gsatCancela').textContent='Parar';
  const avisa=(feitos,total,texto)=>{ fio.style.width=(100*feitos/Math.max(1,total)).toFixed(1)+'%'; $('gsatPeso').textContent=texto||('Baixando… '+br(feitos)+' de '+br(total)+' quadros'); };
  try{ cmdLog('Baixar satélite: '+e.fonte.nome+', nível '+e.plano.z+' ('+C.textoResolucao(e.plano.mpp)+'), '+br(e.plano.largura)+' × '+br(e.plano.altura)+' px — '+e.alvo.nome,'etapa'); }catch(_){}
  let saida=null;
  try{
    /* se o aparelho recusar a tela do nível escolhido, desce um nível por vez e avisa */
    const candidatos=listaDeNiveis.filter(p=>p.cabe&&p.z<=e.plano.z); let r=null, desceu=false;
    for(const p of candidatos){
      try{ r=await baixa(e,p,avisa); break; }
      catch(err){ if(!err||!err.semTela) throw err; desceu=true; }
    }
    if(!r) throw new Error('Este aparelho não conseguiu montar a imagem. Escolha uma área menor.');
    saida=entrega(r,e);
    if(desceu) toast('O aparelho não montou a resolução escolhida: a imagem saiu em '+C.textoResolucao(r.plano.mpp)+'.');
    $('gsatModal').classList.remove('on');
  }catch(err){
    if(err&&err.name==='AbortError') toast('Download interrompido. Nada foi alterado.');
    else{ toast('Não foi possível baixar a imagem: '+(err&&err.message||err)); try{ cmdLog('Baixar satélite: '+(err&&err.message||err),'erro'); }catch(_){} }
    console.warn('baixar satélite:',err);
  }finally{
    ocupado=false; parar=false;
    botoes.forEach(id=>{ $(id).disabled=false; }); barra.hidden=true; $('gsatCancela').textContent='Cancelar'; $('gsatCancela').disabled=false;
    if($('gsatModal').classList.contains('on')) resumo(false);
  }
  return saida;
}
function open(){
  if(typeof S==='undefined'||typeof map==='undefined'||!map) return false;
  if(!fontes().length){ toast('Nenhum mapa de fundo de satélite disponível.'); return false; }
  const m=monta(); preenche(); m.classList.add('on');
  return true;
}
root.GeoMineSatImage={open, executa, __teste:{fontes, areas, alvo, escolha, resumo, tela, baixa, entrega, envelope}};
})(window);
