/* ============================================================================
   ESTABILIDADE DE TALUDE — Bishop simplificado (homogêneo ou pilha/embasamento)
   Validação: F&K (1977) caso 1 FS 2,04 (publ. 2,08); Taylor φ=0 +2,5%;
   bicamada com materiais idênticos reproduz o homogêneo (FS 2,036 = 2,036);
   fundação fraca reduz FS (1,43→1,04) com círculo penetrando o embasamento.
   ========================================================================== */
/* ============ Base bibliográfica de parâmetros geotécnicos ============
   Fontes: Pinto (2006) Curso Básico de Mecânica dos Solos; Ortigão (2007)
   Introdução à Mecânica dos Solos dos Estados Críticos; GeoRio (2014) Manual
   de Encostas; Hoek & Bray (1981) Rock Slope Engineering; Look (2007)
   Handbook of Geotechnical Investigation; ABNT NBR 13029 (pilhas de estéril);
   Caterpillar Performance Handbook (empolamento).
   Valores TÍPICOS de projeto (faixa média) — sempre calibrar com ensaios.   */
/* ============ Base bibliográfica de parâmetros geotécnicos ============
   Fontes: Pinto (2006) Curso Básico de Mecânica dos Solos; Ortigão (2007)
   Introdução à Mecânica dos Solos dos Estados Críticos; GeoRio (2014) Manual
   de Encostas; Hoek & Bray (1981) Rock Slope Engineering; Look (2007)
   Handbook of Geotechnical Investigation; ABNT NBR 13029 (pilhas de estéril);
   Caterpillar Performance Handbook (empolamento).
   Valores TÍPICOS de projeto (faixa média) — sempre calibrar com ensaios.   */
const GEO_MAT={
  aterro_arg:   {nome:'Aterro argiloso compactado',      g:19.0, c:15, phi:27, ru:0.15, emp:25},
  solo_res:     {nome:'Solo residual maduro',            g:18.0, c:20, phi:29, ru:0.20, emp:25},
  saprolito:    {nome:'Saprolito (solo res. jovem)',     g:19.0, c:30, phi:31, ru:0.15, emp:30},
  coluvio:      {nome:'Colúvio',                         g:18.0, c:8,  phi:25, ru:0.30, emp:25},
  areia_fofa:   {nome:'Areia fofa',                      g:17.0, c:0,  phi:29, ru:0.10, emp:12},
  areia_comp:   {nome:'Areia compacta',                  g:19.5, c:0,  phi:37, ru:0.10, emp:12},
  argila_mole:  {nome:'Argila mole (drenado)',           g:16.0, c:5,  phi:22, ru:0.40, emp:30},
  esteril_solo: {nome:'Estéril de solo (lançado)',       g:17.0, c:5,  phi:30, ru:0.10, emp:0},
  esteril_rocha:{nome:'Estéril de rocha desmontada',     g:19.0, c:0,  phi:37, ru:0.05, emp:0},
  enrocamento:  {nome:'Enrocamento / rachão',            g:20.5, c:0,  phi:42, ru:0.00, emp:0},
  canga:        {nome:'Canga / laterita',                g:22.0, c:50, phi:35, ru:0.05, emp:35},
  rocha_frat:   {nome:'Maciço muito fraturado (M-C eq.)',g:25.0, c:100,phi:40, ru:0.05, emp:50},
  rej_arenoso:  {nome:'Rejeito arenoso',                 g:19.0, c:0,  phi:30, ru:0.25, emp:0},
  rej_fino:     {nome:'Rejeito fino / lama',             g:16.5, c:5,  phi:23, ru:0.45, emp:0},
  dolomita_dez: {nome:'Dolomita/calcário desmontado',    g:18.5, c:0,  phi:38, ru:0.05, emp:55},
};
/* Empolamento (emp, %): volume solto vs in situ (Caterpillar PH; Ricardo &
   Catalani, Manual Prático de Escavação). γ_solto = γ_insitu/(1+emp/100).
   Nos materiais já "lançados" (estéril, rejeito) o γ tabelado JÁ é o solto
   (emp=0 na tabela = não reaplicar).                                        */

/* ============ Bishop simplificado — 1 ou 2 materiais (pilha/embasamento) ============ */
const GAMMA_W=9.81;
function bishopFS2(dist,zg,zAt,zBaseAt,xc,yc,R,matP,matF,nSlices,zwAt){
  const n=dist.length, x0=dist[0], x1=dist[n-1];
  const zc=(x)=>{ const q=R*R-(x-xc)*(x-xc); return q<=0? NaN : yc-Math.sqrt(q); };
  const NS=400; const roots=[]; let prev=null;
  for(let i=0;i<=NS;i++){
    const x=x0+(x1-x0)*i/NS;
    const d=zAt(x)-zc(x);
    if(isNaN(d)){ prev=null; continue; }
    if(prev!==null && prev.d*d<0){
      let a=prev.x,b=x,da=prev.d;
      for(let k=0;k<30;k++){ const m=(a+b)/2, dm=zAt(m)-zc(m);
        if(da*dm<=0) b=m; else {a=m;da=dm;} }
      roots.push((a+b)/2);
    }
    prev={x,d};
  }
  if(roots.length<2) return null;
  const xa=roots[0], xb=roots[roots.length-1];
  if(xb-xa<0.05*(x1-x0)) return null;
  const b=(xb-xa)/nSlices;
  let den=0, FS=1.3;
  const S_=[];
  for(let i=0;i<nSlices;i++){
    const xm=xa+(i+0.5)*b;
    const zs=zAt(xm), zb=zc(xm);
    const h=zs-zb; if(!(h>0)) return null;
    const sinA=(xm-xc)/R; if(Math.abs(sinA)>0.995) return null;
    const alpha=Math.asin(sinA);
    let W,u,mat,sigmaV;
    if(zBaseAt){
      const ze=Math.min(zs, zBaseAt(xm));      // topo do embasamento (nunca acima da superfície)
      const hP=Math.max(0, zs-Math.max(zb,ze)); // espessura na pilha
      const hF=Math.max(0, Math.min(ze,zs)-zb); // espessura no embasamento
      W=(matP.gamma*hP + matF.gamma*hF)*b;
      mat=(zb<ze-1e-6)? matF : matP;            // resistência = material na BASE da fatia
      sigmaV=matP.gamma*hP + matF.gamma*hF;
    } else {
      W=matP.gamma*h*b; mat=matP; sigmaV=matP.gamma*h;
    }
    if(zwAt){                                   // NA explícito: u = γw·hw na base
      const zw=Math.min(zs, zwAt(xm));
      u=Math.max(0, GAMMA_W*(zw-zb));
    } else {
      u=mat.ru*sigmaV;                          // modo ru clássico
    }
    S_.push({W,alpha,u,c:mat.c,tf:mat.tanPhi});
    den+=W*Math.sin(alpha);
  }
  if(den<=0) return null;
  for(let it=0; it<60; it++){
    let num=0;
    for(const s of S_){
      const ma=Math.cos(s.alpha)*(1+Math.tan(s.alpha)*s.tf/FS);
      if(ma<0.05) return null;
      num+=(s.c*b + (s.W-s.u*b)*s.tf)/ma;
    }
    const F2=num/den;
    if(Math.abs(F2-FS)<1e-4){FS=F2;break;}
    FS=F2;
  }
  if(!isFinite(FS)||FS<=0) return null;
  return {FS,xa,xb,nS:S_.length};
}
function mkInterp(dist,z){
  const n=dist.length;
  return (x)=>{
    if(x<=dist[0]) return z[0];
    if(x>=dist[n-1]) return z[n-1];
    let lo=0,hi=n-1;
    while(hi-lo>1){const m=(lo+hi)>>1; if(dist[m]<=x)lo=m; else hi=m;}
    const f=(x-dist[lo])/(dist[hi]-dist[lo]);
    return z[lo]+f*(z[hi]-z[lo]);
  };
}
function bishopSearch2(dist,zg,zBase,matP,matF,nSlices=40,zw=null){
  const zAt=mkInterp(dist,zg);
  const zBaseAt=zBase? mkInterp(dist,zBase) : null;
  const zwAt=zw? mkInterp(dist,zw) : null;
  const n=dist.length;
  let zmn=Infinity,zmx=-Infinity,imn=0,imx=0;
  for(let i=0;i<n;i++){ if(zg[i]<zmn){zmn=zg[i];imn=i;} if(zg[i]>zmx){zmx=zg[i];imx=i;} }
  const H=zmx-zmn, L=dist[n-1]-dist[0];
  if(H<0.5) return {error:'Perfil praticamente plano (Δz < 0,5 m)'};
  const xLo=Math.min(dist[imn],dist[imx]), xHi=Math.max(dist[imn],dist[imx]);
  const NCX=21,NCY=15,NR=14;
  let best=null,tried=0;
  for(let ix=0;ix<NCX;ix++){
    const xc=xLo-0.4*L+(ix/(NCX-1))*(xHi-xLo+0.8*L);
    for(let iy=0;iy<NCY;iy++){
      const yc=zmx+0.05*H+(iy/(NCY-1))*(2.5*H);
      const rMin=Math.max(1e-3,yc-zmx+0.05*H);
      const rMax=Math.hypot(0.9*L,yc-zmn+0.5*H);
      for(let ir=0;ir<NR;ir++){
        const R=rMin+(ir/(NR-1))*(rMax-rMin);
        tried++;
        const res=bishopFS2(dist,zg,zAt,zBaseAt,xc,yc,R,matP,matF,nSlices,zwAt);
        if(res&&(best===null||res.FS<best.FS)) best={...res,circle:{xc,yc,R}};
      }
    }
  }
  if(!best) return {error:'Nenhum círculo válido encontrado'};
  let span={dx:(xHi-xLo+0.8*L)/(NCX-1), dy:2.5*H/(NCY-1)};
  for(let stage=0;stage<3;stage++){
    const {xc,yc,R}=best.circle;
    const dR=Math.max(0.05*R,0.5);
    for(let ix=-3;ix<=3;ix++)for(let iy=-3;iy<=3;iy++)for(let ir=-3;ir<=3;ir++){
      const xc2=xc+ix*span.dx/3, yc2=yc+iy*span.dy/3, R2=R+ir*dR;
      if(yc2<=zmx||R2<=0.1) continue;
      tried++;
      const res=bishopFS2(dist,zg,zAt,zBaseAt,xc2,yc2,R2,matP,matF,nSlices,zwAt);
      if(res&&res.FS<best.FS) best={...res,circle:{xc:xc2,yc:yc2,R:R2}};
    }
    span.dx/=3; span.dy/=3;
  }
  best.tried=tried;
  return best;
}
/* ---------- UI de estabilidade (homogêneo ou pilha/embasamento) ---------- */
function bshFillMat(prefix,key){
  const m=GEO_MAT[key]; if(!m) return;
  document.getElementById(prefix+'G').value=m.g;
  document.getElementById(prefix+'C').value=m.c;
  document.getElementById(prefix+'Phi').value=m.phi;
  document.getElementById(prefix+'Ru').value=m.ru;
  if(prefix==='bshP') document.getElementById('bshEmp').value=m.emp;
  bshGammaEff();
}
function bshGammaEff(){
  const g=+document.getElementById('bshPG').value||0;
  const e=+document.getElementById('bshEmp').value||0;
  const ge=g/(1+e/100);
  document.getElementById('bshGEff').textContent =
    e>0 ? `γ efetivo (solto) = ${g} / (1+${e}%) = ${ge.toFixed(1)} kN/m³`
        : `γ efetivo = ${g} kN/m³ (sem empolamento)`;
  return ge;
}
function bshMode(){
  const pile=document.getElementById('bshModo').value==='pilha';
  document.getElementById('bshPileBox').style.display=pile?'block':'none';
  document.getElementById('bshSerieLbl').textContent =
    pile?'Superfície da PILHA (perfil superior)':'Superfície do perfil';
}
function readMat(prefix, gammaOverride){
  const g=gammaOverride ?? (+document.getElementById(prefix+'G').value);
  const c=+document.getElementById(prefix+'C').value;
  const phi=+document.getElementById(prefix+'Phi').value;
  const ru=+document.getElementById(prefix+'Ru').value||0;
  if(!(g>0)||!(c>=0)||!(phi>=0)) return null;
  return {gamma:g,c,tanPhi:Math.tan(phi*Math.PI/180),ru,phi};
}
function bshAguaMode(){
  const m=document.getElementById('bshAgua').value;
  document.getElementById('bshRuBox').style.display=(m==='ru')?'block':'none';
  document.getElementById('bshNaBox').style.display=(m==='na')?'block':'none';
}
function bshSugereNA(){
  const cen=document.getElementById('bshNaCen').value; if(!cen) return;
  const prof=S.prof.result;
  const si=+document.getElementById('bshSerie').value||0;
  let H=10;
  if(prof && prof.series[si]){
    const zs=prof.series[si].z.filter(v=>!isNaN(v));
    if(zs.length) H=Math.max(...zs)-Math.min(...zs);
  }
  const sug={
    estiagem:{D:Math.max(1.5*H,15), txt:`Semiárido (BSh) em estiagem, material drenante: NA profundo — praticamente seco. Sugerido D = ${Math.max(1.5*H,15).toFixed(0)} m (equivale a u ≈ 0). Se preferir, use a condição “Seco”.`},
    op:      {D:H/2,  txt:`Operação com drenagem de pé eficiente: freática rebaixada, tipicamente NA ≈ H/2 abaixo da superfície → D = ${(H/2).toFixed(1)} m (H = ${H.toFixed(1)} m).`},
    chuva:   {D:H/4,  txt:`Período chuvoso sem drenagem interna: freática elevada, prática usual NA ≈ H/4 abaixo da superfície → D = ${(H/4).toFixed(1)} m. Verifique também o cenário saturado.`},
    sat:     {D:0,    txt:`Evento extremo (chuva de projeto / pé alagado): NA na superfície → D = 0 (pior caso; equivale a ru ≈ γw/γ ≈ ${(9.81/((+document.getElementById('bshPG').value||19))).toFixed(2)}).`},
  }[cen];
  document.getElementById('bshNaD').value=+sug.D.toFixed(1);
  document.getElementById('bshNaHint').innerHTML=sug.txt+
    ' <span style="color:var(--ink-dim)">Sugestão de PARTIDA — confirmar com piezômetros/indicadores de campo.</span>';
}
function runBishop(){
  const prof=S.prof.result;
  if(!prof){ toast('Gere um perfil primeiro'); return; }
  const pile=document.getElementById('bshModo').value==='pilha';
  const si=+document.getElementById('bshSerie').value||0;
  const zg0=prof.series[si]? prof.series[si].z : null;
  if(!zg0){ toast('Superfície inválida'); return; }
  let zb0=null, sb=-1;
  if(pile){
    sb=+document.getElementById('bshSerieEmb').value;
    if(!(sb>=0) || !prof.series[sb] || sb===si){ toast('Selecione o perfil do embasamento (diferente do da pilha)'); return; }
    zb0=prof.series[sb].z;
  }
  // trecho contínuo comum
  const dist=[], z=[], zb=[];
  for(let i=0;i<prof.dist.length;i++){
    const ok=!isNaN(zg0[i]) && (!pile || !isNaN(zb0[i]));
    if(ok){ dist.push(prof.dist[i]); z.push(zg0[i]); if(pile) zb.push(Math.min(zb0[i],zg0[i])); }
    else if(dist.length>10) break;
    else { dist.length=0; z.length=0; zb.length=0; }
  }
  if(dist.length<10){ toast('Trecho contínuo do perfil curto demais'); return; }

  const gEff=bshGammaEff();
  const matP=readMat('bshP', gEff);
  const matF=pile? readMat('bshF') : null;
  if(!matP || (pile&&!matF)){ toast('Parâmetros inválidos'); return; }

  // condição de água
  const agua=document.getElementById('bshAgua').value;
  let zw=null, aguaTxt='';
  if(agua==='seco'){ matP.ru=0; if(matF) matF.ru=0; aguaTxt='seco/drenado (u = 0)'; }
  else if(agua==='ru'){ aguaTxt=`ru (pilha ${matP.ru}${pile?`, embasamento ${matF.ru}`:''})`; }
  else if(agua==='na'){
    const D=+document.getElementById('bshNaD').value||0;
    zw=z.map(v=>v-D); aguaTxt=`NA a ${D.toFixed(1)} m da superfície (γw·h_w)`;
  } else if(agua==='sat'){ zw=z.slice(); aguaTxt='saturado — NA na superfície (pior caso)'; }

  showLoad('Buscando círculo crítico (Bishop)…');
  setTimeout(()=>{
    const r=bishopSearch2(dist,z,pile?zb:null,matP,matF,40,zw);
    hideLoad();
    if(r.error){ document.getElementById('bshOut').innerHTML='⚠ '+r.error; return; }
    S.prof.bishop={...r, dist, z, zb:pile?zb:null, zw, si, sb};
    const cls = r.FS>=1.5 ? ['ADEQUADO (FS ≥ 1,5 — NBR 11682 nível alto / NBR 13029)','#9ece6a']
             : r.FS>=1.3 ? ['ATENÇÃO (1,3 ≤ FS < 1,5)','#e0af68']
             : ['INSTÁVEL (FS < 1,3)','#e05252'];
    let out=`<b style="font-size:15px">FS = ${r.FS.toFixed(3)}</b> — <span style="color:${cls[1]};font-weight:600">${cls[0]}</span>\n`;
    out+=`Círculo crítico: centro (${r.circle.xc.toFixed(1)}; ${r.circle.yc.toFixed(1)}) · R = ${r.circle.R.toFixed(1)} m · faixa ${r.xa.toFixed(1)}–${r.xb.toFixed(1)} m\n`;
    out+=`Água: ${aguaTxt}\n`;
    if(pile){
      const deep=(r.circle.yc-r.circle.R) < Math.min(...zb)+0.5;
      out+=`Modo pilha/embasamento — círculo ${deep?'<b>penetra o embasamento</b> (ruptura pela fundação)':'confinado à pilha'}\n`;
      out+=`Pilha: γ=${matP.gamma.toFixed(1)} kN/m³ (c/ empolamento) · c'=${matP.c} kPa · φ'=${matP.phi}° · ru=${matP.ru}\n`;
      out+=`Embasamento: γ=${matF.gamma} · c'=${matF.c} kPa · φ'=${matF.phi}° · ru=${matF.ru}\n`;
    } else {
      out+=`Material: γ=${matP.gamma.toFixed(1)} kN/m³ · c'=${matP.c} kPa · φ'=${matP.phi}° · ru=${matP.ru}\n`;
    }
    out+=`${r.nS} fatias · ${r.tried.toLocaleString('pt-BR')} círculos · <span style="color:var(--ink-dim)">Válido para ruptura circular (solo/saprolito/estéril/maciço muito fraturado). Rocha com descontinuidades persistentes: usar análise cinemática.</span>`;
    document.getElementById('bshOut').innerHTML=out;
    const VE=+document.getElementById('profVE').value||2;
    drawProfChart(prof,VE);
    drawBishopFig();
    toast('Bishop: FS = '+r.FS.toFixed(2));
  },30);
}
/* ============================================================================
   FIGURA DO PLANO DE RUPTURA CRÍTICO (Bishop) — canvas branco, pronto p/ relatório
   ========================================================================== */
function drawBishopFig(){
  const B=S.prof.bishop;
  const cv=document.getElementById('bshFig'), msg=document.getElementById('bshFigMsg');
  const btns=document.getElementById('bshFigBtns'), opts=document.getElementById('bshFigOpts');
  if(!B || !B.circle){ cv.style.display='none'; btns.style.display='none'; opts.style.display='none';
    msg.style.display=''; msg.textContent='Rode a análise para gerar a figura da superfície crítica.'; return; }
  cv.style.display=''; btns.style.display=''; opts.style.display=''; msg.style.display='none';

  const VE=Math.max(1, +document.getElementById('bshFigVE').value||1);
  const showSl=document.getElementById('bshFigSlices').checked;
  const {dist,z,zb,zw,circle,FS,xa,xb,nS}=B;
  const ctx=cv.getContext('2d');
  const W=cv.width, H=cv.height;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);

  // extensão: perfil + círculo crítico (para o centro caber)
  const x0=Math.min(dist[0], circle.xc-circle.R*0.15), x1=Math.max(dist[dist.length-1], circle.xc+circle.R*0.15);
  let zmn=Infinity, zmx=-Infinity;
  z.forEach(v=>{ if(v<zmn)zmn=v; if(v>zmx)zmx=v; });
  if(zb) zb.forEach(v=>{ if(v<zmn)zmn=v; });
  zmn=Math.min(zmn, circle.yc-circle.R);          // fundo do círculo
  zmx=Math.max(zmx, circle.yc);                   // centro do círculo
  const M={l:78,r:26,t:52,b:58};
  const pw=W-M.l-M.r, ph=H-M.t-M.b;
  // escala: mesma unidade em X e Z, com exagero vertical aplicado em Z
  const sxu=pw/((x1-x0)||1), szu=ph/(((zmx-zmn)*VE)||1);
  const k=Math.min(sxu,szu);
  const px=v=>M.l+(v-x0)*k;
  const py=v=>M.t+ph-(v-zmn)*k*VE;

  // grade
  ctx.strokeStyle='#e6e6e6'; ctx.lineWidth=1; ctx.font='13px Signika, sans-serif'; ctx.fillStyle='#666';
  const stepX=niceStep((x1-x0)/7), stepZ=niceStep((zmx-zmn)/6);
  ctx.textAlign='center'; ctx.textBaseline='top';
  for(let v=Math.ceil(x0/stepX)*stepX; v<=x1; v+=stepX){
    ctx.beginPath(); ctx.moveTo(px(v),M.t); ctx.lineTo(px(v),M.t+ph); ctx.stroke();
    ctx.fillText(v.toFixed(0), px(v), M.t+ph+6);
  }
  ctx.textAlign='right'; ctx.textBaseline='middle';
  for(let v=Math.ceil(zmn/stepZ)*stepZ; v<=zmx; v+=stepZ){
    ctx.beginPath(); ctx.moveTo(M.l,py(v)); ctx.lineTo(M.l+pw,py(v)); ctx.stroke();
    ctx.fillText(v.toFixed(0), M.l-8, py(v));
  }
  ctx.strokeStyle='#333'; ctx.lineWidth=1.5;
  ctx.strokeRect(M.l,M.t,pw,ph);
  ctx.fillStyle='#333'; ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillText('Distância ao longo do perfil (m)', M.l+pw/2, H-24);
  ctx.save(); ctx.translate(20,M.t+ph/2); ctx.rotate(-Math.PI/2);
  ctx.fillText('Cota (m)',0,0); ctx.restore();

  const arcTop=x=>circle.yc-Math.sqrt(Math.max(0,circle.R*circle.R-(x-circle.xc)*(x-circle.xc)));
  const zAt=x=>{ // interpolação linear na superfície
    if(x<=dist[0]) return z[0];
    if(x>=dist[dist.length-1]) return z[z.length-1];
    let i=1; while(i<dist.length && dist[i]<x) i++;
    const t=(x-dist[i-1])/((dist[i]-dist[i-1])||1);
    return z[i-1]+t*(z[i]-z[i-1]);
  };

  // massa instabilizada (entre a superfície e o arco), em hachura leve
  ctx.beginPath();
  const NP=180;
  for(let i=0;i<=NP;i++){ const x=xa+(xb-xa)*i/NP; const y=zAt(x); i?ctx.lineTo(px(x),py(y)):ctx.moveTo(px(x),py(y)); }
  for(let i=NP;i>=0;i--){ const x=xa+(xb-xa)*i/NP; ctx.lineTo(px(x),py(arcTop(x))); }
  ctx.closePath();
  ctx.fillStyle='rgba(224,82,82,0.12)'; ctx.fill();

  // fatias
  if(showSl){
    ctx.strokeStyle='rgba(120,120,120,0.55)'; ctx.lineWidth=1;
    const n=Math.max(8, nS||30);
    for(let i=0;i<=n;i++){ const x=xa+(xb-xa)*i/n;
      ctx.beginPath(); ctx.moveTo(px(x),py(zAt(x))); ctx.lineTo(px(x),py(arcTop(x))); ctx.stroke(); }
  }

  // embasamento (modo pilha)
  if(zb){
    ctx.strokeStyle='#8d6e63'; ctx.lineWidth=2.5; ctx.setLineDash([8,5]);
    ctx.beginPath(); dist.forEach((x,i)=>{ i?ctx.lineTo(px(x),py(zb[i])):ctx.moveTo(px(x),py(zb[i])); }); ctx.stroke();
    ctx.setLineDash([]);
  }
  // nível d'água
  if(zw){
    ctx.strokeStyle='#37a6c0'; ctx.lineWidth=2; ctx.setLineDash([10,4,2,4]);
    ctx.beginPath(); dist.forEach((x,i)=>{ i?ctx.lineTo(px(x),py(zw[i])):ctx.moveTo(px(x),py(zw[i])); }); ctx.stroke();
    ctx.setLineDash([]);
  }
  // superfície do terreno
  ctx.strokeStyle='#1f2937'; ctx.lineWidth=3;
  ctx.beginPath(); dist.forEach((x,i)=>{ i?ctx.lineTo(px(x),py(z[i])):ctx.moveTo(px(x),py(z[i])); }); ctx.stroke();

  // arco crítico
  ctx.strokeStyle='#e05252'; ctx.lineWidth=3.5;
  ctx.beginPath();
  for(let i=0;i<=NP;i++){ const x=xa+(xb-xa)*i/NP; const y=arcTop(x); i?ctx.lineTo(px(x),py(y)):ctx.moveTo(px(x),py(y)); }
  ctx.stroke();

  // centro e raios
  ctx.strokeStyle='rgba(224,82,82,0.55)'; ctx.lineWidth=1.2; ctx.setLineDash([6,5]);
  [xa,xb].forEach(x=>{ ctx.beginPath(); ctx.moveTo(px(circle.xc),py(circle.yc)); ctx.lineTo(px(x),py(arcTop(x))); ctx.stroke(); });
  ctx.setLineDash([]);
  ctx.fillStyle='#e05252';
  ctx.beginPath(); ctx.arc(px(circle.xc),py(circle.yc),5,0,7); ctx.fill();
  ctx.font='12px Signika, sans-serif'; ctx.textAlign='left'; ctx.textBaseline='bottom';
  ctx.fillText(`centro (${circle.xc.toFixed(1)}; ${circle.yc.toFixed(1)}) · R = ${circle.R.toFixed(1)} m`,
    px(circle.xc)+8, py(circle.yc)-6);

  // caixa do FS
  const cor = FS>=1.5?'#1a7f37' : FS>=1.3?'#b3781a' : '#c62828';
  const rot = FS>=1.5?'ADEQUADO (FS ≥ 1,5)' : FS>=1.3?'ATENÇÃO (1,3 ≤ FS < 1,5)' : 'INSTÁVEL (FS < 1,3)';
  ctx.fillStyle='rgba(255,255,255,0.94)'; ctx.strokeStyle=cor; ctx.lineWidth=2;
  ctx.fillRect(M.l+10,M.t+10,300,58); ctx.strokeRect(M.l+10,M.t+10,300,58);
  ctx.fillStyle=cor; ctx.textAlign='left'; ctx.textBaseline='top';
  ctx.font='700 24px Signika, sans-serif'; ctx.fillText('FS = '+FS.toFixed(3), M.l+22, M.t+18);
  ctx.font='13px Signika, sans-serif'; ctx.fillStyle='#333';
  ctx.fillText(rot, M.l+22, M.t+46);

  // título e legenda
  ctx.fillStyle='#111'; ctx.font='700 18px Signika, sans-serif'; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
  ctx.fillText('Plano de ruptura crítico — Bishop simplificado', M.l, 30);
  ctx.font='12px Signika, sans-serif'; ctx.fillStyle='#666'; ctx.textAlign='right';
  ctx.fillText(`${nS} fatias · exagero vertical ${VE.toFixed(1)}×`, M.l+pw, 30);
  // legenda de linhas
  const lx=M.l+pw-236, ly=M.t+ph-70;
  ctx.fillStyle='rgba(255,255,255,0.94)'; ctx.strokeStyle='#bbb'; ctx.lineWidth=1;
  const lh=zb? (zw?76:60) : (zw?60:44);
  ctx.fillRect(lx,ly-lh+44,226,lh); ctx.strokeRect(lx,ly-lh+44,226,lh);
  let yy=ly-lh+58; ctx.textAlign='left'; ctx.font='12px Signika, sans-serif';
  const item=(cor2,dash,txt)=>{ ctx.strokeStyle=cor2; ctx.lineWidth=3; ctx.setLineDash(dash||[]);
    ctx.beginPath(); ctx.moveTo(lx+10,yy); ctx.lineTo(lx+40,yy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle='#333'; ctx.textBaseline='middle'; ctx.fillText(txt,lx+48,yy); yy+=16; };
  item('#1f2937',null,'Superfície do terreno');
  item('#e05252',null,'Superfície de ruptura crítica');
  if(zb) item('#8d6e63',[8,5],'Topo do embasamento');
  if(zw) item('#37a6c0',[10,4,2,4],"Nível d'água");
}
function niceStep(raw){
  if(!(raw>0)) return 1;
  const k=Math.pow(10,Math.floor(Math.log10(raw)));
  return [1,2,2.5,5,10].map(v=>v*k).find(v=>v>=raw) || 10*k;
}

function refreshBishopPanel(){
  const sel=document.getElementById('bshSerie'); if(!sel) return;
  const prof=S.prof.result;
  const opts=prof? prof.series.map((s,i)=>`<option value="${i}">${esc(s.name)}</option>`).join('') : '<option value="">— gere um perfil primeiro —</option>';
  sel.innerHTML=opts;
  const se=document.getElementById('bshSerieEmb');
  se.innerHTML=opts;
  if(prof && prof.series.length>1) se.value=1;
  document.getElementById('btnBishop').disabled=!prof;
}
function bindBishopPanel(){
  const b=document.getElementById('btnBishop'); if(b) b.onclick=runBishop;
  const ve=document.getElementById('bshFigVE'), sl=document.getElementById('bshFigSlices');
  if(ve) ve.addEventListener('input',drawBishopFig);
  if(sl) sl.addEventListener('change',drawBishopFig);
  const pn=document.getElementById('btnBshPNG');
  if(pn) pn.onclick=()=>{ const cv=document.getElementById('bshFig');
    cv.toBlob(bl=>download(bl,'plano_ruptura_critico.png'),'image/png'); };
  const cp=document.getElementById('btnBshCopy');
  if(cp) cp.onclick=async()=>{
    try{
      const cv=document.getElementById('bshFig');
      const bl=await new Promise(r=>cv.toBlob(r,'image/png'));
      await entregarImagem(bl, 'plano_ruptura_critico');
    }catch(e){ toast('Falha: '+e.message); }
  };
  const mp=document.getElementById('bshMatP'); if(mp){
    mp.innerHTML=Object.entries(GEO_MAT).map(([k,m])=>`<option value="${k}">${m.nome}</option>`).join('');
    mp.value='esteril_rocha'; mp.onchange=()=>bshFillMat('bshP',mp.value);
  }
  const mf=document.getElementById('bshMatF'); if(mf){
    mf.innerHTML=Object.entries(GEO_MAT).map(([k,m])=>`<option value="${k}">${m.nome}</option>`).join('');
    mf.value='saprolito'; mf.onchange=()=>bshFillMat('bshF',mf.value);
  }
  const mo=document.getElementById('bshModo'); if(mo) mo.onchange=bshMode;
  const ag=document.getElementById('bshAgua'); if(ag) ag.onchange=bshAguaMode;
  const cen=document.getElementById('bshNaCen'); if(cen) cen.onchange=bshSugereNA;
  ['bshPG','bshEmp'].forEach(id=>{const e=document.getElementById(id); if(e) e.oninput=bshGammaEff;});
  if(mp){ bshFillMat('bshP',mp.value); }
  if(mf){ bshFillMat('bshF',mf.value); }
  bshMode(); bshAguaMode();
}
