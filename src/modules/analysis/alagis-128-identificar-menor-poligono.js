
/* ============================================================================
   IDENTIFICAR ⓘ — entre camadas, ganha a feição MAIS ESPECÍFICA

   O que estava errado: infoMaisProxima já escolhia, DENTRO de uma camada, o
   polígono de MENOR área entre os que contêm o ponto. Entre camadas, porém,
   decidia só a ordem da árvore — a primeira camada que acertasse levava, e as
   demais viravam apenas o rodapé "também sob o ponto", sem atributo nenhum.

   Num projeto com um limite geral no topo (o Raio_de_busca cobre 1.097.653 ha
   e está sob QUALQUER clique), esse limite vencia sempre. Clicar num processo
   da ANM de 37,8 ha devolvia as propriedades do raio; o processo aparecia só
   como menção. Valia igualmente para APP, Reserva Legal, solos, litologia e
   assentamentos — toda camada temática sob o envelope.

   A regra passa a ser a MESMA dentro e entre camadas: vence a feição mais
   específica. Ponto ganha de linha, linha ganha de polígono, e entre polígonos
   ganha o de menor área. Empate continua sendo desempatado pela ordem da
   árvore, então nada muda quando as áreas são iguais.

   Comparar áreas entre camadas exige cuidado que a versão anterior não
   precisava ter: cada camada guarda a geometria no SEU CRS. A ANM está em
   EPSG:4674 (graus) e o resto em EPSG:31982 (metros) — comparar grau² com
   metro² faria a camada geográfica ganhar sempre, por ser um número ~1e14
   menor. Por isso a área é convertida para PIXELS DE TELA antes de comparar,
   usando a mesma escala que já servia para a tolerância do clique.

   Bloco ADITIVO: só substitui infoMaisProxima. A original fica guardada em
   window.infoMaisProximaOriginal.
   ========================================================================== */
(function(){
'use strict';
if(window.ALAGIS128){ console.info('[128] já instalado'); return; }
if(typeof window.infoMaisProxima!=='function'){
  console.warn('[128] infoMaisProxima ausente — bloco ignorado'); return; }
window.ALAGIS128=1;
window.infoMaisProximaOriginal=window.infoMaisProxima;

window.infoMaisProxima=function(latlng){
  const p0=map.latLngToContainerPoint(latlng);
  const tolPx=(S.touch?14:8);
  const pT=map.containerPointToLatLng([p0.x+tolPx,p0.y+tolPx]);
  const dLat=Math.abs(pT.lat-latlng.lat), dLng=Math.abs(pT.lng-latlng.lng);

  /* Um candidato por camada, como antes; a escolha final passou a ser global. */
  const cands=[];

  (S.layers||[]).forEach((L,ordem)=>{
    if(!L||L.visible===false||!L.features||!L.features.length) return;
    /* Clique e tolerância convertidos UMA vez para o CRS da camada. */
    let X,Y,tolU;
    try{
      const c0=fromWGS(L.crs,latlng.lng,latlng.lat);
      const c1=fromWGS(L.crs,latlng.lng+dLng,latlng.lat+dLat);
      if(!Number.isFinite(c0[0])||!Number.isFinite(c0[1])||
         !Number.isFinite(c1[0])||!Number.isFinite(c1[1])) return;
      X=c0[0]; Y=c0[1];
      tolU=Math.max(Math.abs(c1[0]-X),Math.abs(c1[1]-Y))||1e-9;
    }catch(e){ return; }
    /* px por unidade da camada — é o que torna as áreas comparáveis entre
       camadas com CRS diferentes (graus × metros). */
    const escala=tolPx/tolU;

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
      /* Peso = quão específico é o acerto; o MENOR vence, agora também entre
         camadas. Ponto (−2) e linha (−1) ficam abaixo de qualquer área em px²,
         que nunca é negativa — a ordem ponto < linha < polígono é a mesma de
         antes, sem depender de a área ser maior que 1. */
      let acerto=false, peso=Infinity, dentroDe=false;
      if(L.gtype==='polygon'){
        let dentro=false;
        const ars=[];
        for(const r of rings){ if(!Array.isArray(r)||r.length<3) continue;
          if(edInRing([X,Y],r)) dentro=!dentro;
          ars.push({r,a:Math.abs(edArea(r))});
        }
        /* Área líquida por paridade de aninhamento: externos somam, furos
           subtraem e ilhas dentro de furos voltam a somar. Somar o valor
           absoluto de todos os anéis fazia um polígono vazado parecer maior. */
        ars.sort((u,v)=>v.a-u.a);
        let a=0;
        for(let i=0;i<ars.length;i++){
          let prof=0;const p=ars[i].r[0];
          for(let j=0;j<i;j++)if(edInRing(p,ars[j].r))prof++;
          a+=(prof&1)?-ars[i].a:ars[i].a;
        }
        a=Math.abs(a);
        const aPx=(a>0? a*escala*escala : 1e18);
        if(dentro){ acerto=true; dentroDe=true; peso=aPx; }
        else for(const r of rings){ if(perto(r)){ acerto=true; peso=aPx; break; } }
      }else if(L.gtype==='line'){
        for(const r of rings) if(perto(r)){ acerto=true; peso=-1; break; }
      }else{
        for(const r of rings){ if(!Array.isArray(r)) continue;
          for(const q of r){ if(Array.isArray(q)&&Math.hypot(q[0]-X,q[1]-Y)<=tolU){ acerto=true; peso=-2; break; } }
          if(acerto) break; }
      }
      if(!acerto) continue;
      if(peso<menor){ menor=peso; melhor={d:0,L,idx,f,dentro:dentroDe,peso:peso,ordem:ordem}; }
    }
    if(melhor) cands.push(melhor);
  });

  if(!cands.length) return null;
  /* Empate em área resolve pela ordem da árvore — o topo continua vencendo. */
  cands.sort((a,b)=>(a.peso-b.peso)||(a.ordem-b.ordem));
  const win=cands[0];
  win.outros=cands.slice(1).map(c=>c.L.name);
  /* Os demais acertos ficam disponíveis para o popup listar com atributo,
     em vez de só citar o nome da camada. */
  window.__infoAcertos=cands;
  return win;
};
console.info('[128] Identificar: entre camadas vence a feição mais específica');
})();

/* ---------------------------------------------------------------------------
   ⓘ mostra TODOS os acertos, não só o vencedor

   Mesmo com a regra de especificidade, num ponto onde várias camadas se
   sobrepõem o vencedor pode não ser o que a pessoa queria ver: clicar num
   processo da ANM de 5 ha, com a Reserva Legal de 4,93 ha por baixo, entrega
   a Reserva Legal — está certo pela regra, e ainda assim não é a resposta.

   Então o rodapé "também sob o ponto", que antes só citava nomes, passa a
   trazer os atributos de cada um, recolhidos em <details>. Nada é escondido e
   nada é clicado duas vezes.

   O acréscimo é feito no DOM do popup depois que ele abre, para não reescrever
   infoClick. Quando há WMS na consulta, o próprio infoClick reescreve o
   conteúdo ao receber a resposta — por isso o acréscimo é refeito ao fim.
   -------------------------------------------------------------------------- */
(function(){
if(typeof window.infoClick!=='function') return;
const escH=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function tabelaDe(c){
  const L=c.L, f=c.f, lin=[];
  (L.fields||[]).forEach(fd=>{
    const v=f.props? f.props[fd.name] : null;
    if(v===null||v===undefined||v==='') return;
    lin.push('<tr><td style="padding:1px 8px 1px 0;color:#666">'+escH(fd.name)+
             '</td><td style="padding:1px 0"><b>'+escH(String(v))+'</b></td></tr>');
  });
  try{
    if(typeof geomCamposDe==='function'){
      geomCamposDe(L.gtype).forEach(k=>{
        const v=geomValor(L,f,k);
        if(v==null) return;
        const dec=(k==='$X'||k==='$Y')?2:(k==='$AREA_HA'?3:2);
        lin.push('<tr><td style="padding:1px 8px 1px 0;color:var(--amber)">'+escH(GEOM_CAMPOS[k])+
                 '</td><td style="padding:1px 0"><b>'+
                 Number(v).toLocaleString('pt-BR',{minimumFractionDigits:dec,maximumFractionDigits:dec})+
                 '</b></td></tr>');
      });
    }
  }catch(e){}
  const onde=c.dentro?'dentro do polígono':(L.gtype==='point'?'sobre o ponto':'sobre o traçado');
  return '<details style="margin-top:4px">'+
    '<summary style="cursor:pointer;font-weight:600">'+escH(L.name)+
    '<span style="font-weight:400;color:#888"> · '+onde+'</span></summary>'+
    '<div style="color:#666;margin:2px 0 2px">feição '+(c.idx+1)+' de '+L.features.length+'</div>'+
    (lin.length? '<table style="border-collapse:collapse">'+lin.join('')+'</table>'
               : '<i style="color:#666">sem atributos preenchidos</i>')+
    '</details>';
}

/* Acrescentar um nó ao DOM do popup não sobrevive: o Leaflet re-renderiza o
   conteúdo a partir da STRING guardada e o nó some. Então o acréscimo é feito
   na própria string, via setContent. */
function acrescenta(){
  try{
    const cands=window.__infoAcertos;
    if(!cands || cands.length<2) return;
    const pop=map&&map._popup;
    if(!pop||typeof pop.getContent!=='function') return;
    const atual=pop.getContent();
    if(typeof atual!=='string') return;
    if(atual.indexOf('id="infoOutrosAcertos"')>=0) return;   // já está lá
    const extra='<div id="infoOutrosAcertos" style="border-top:1px solid #ddd;'+
      'margin-top:6px;padding-top:5px;font:12px Signika,sans-serif">'+
      '<div style="color:#888;margin-bottom:2px">também sob o ponto ('+(cands.length-1)+')</div>'+
      cands.slice(1).map(tabelaDe).join('')+'</div>';
    pop.setContent(atual+extra);
  }catch(e){ console.warn('[128] acertos extras', e); }
}

const orig=window.infoClick;
window.infoClick=function(latlng){
  window.__infoAcertos=null;
  const r=orig.call(this,latlng);
  /* logo após abrir, e de novo depois da resposta WMS (que reescreve o HTML) */
  setTimeout(acrescenta,0);
  if(r && typeof r.then==='function') r.then(()=>setTimeout(acrescenta,0),()=>{});
  setTimeout(acrescenta,1200);
  return r;
};
})();
