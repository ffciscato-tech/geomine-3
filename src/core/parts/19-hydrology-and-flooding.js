/* ============================================================================
   MÓDULO HIDRO — série ANA, IDF (Gumbel+CETESB), MDE D8, dimensionamento
   ========================================================================== */
S.hidro={serie:null, idf:null, dem:null, diario:null};

/* ---------- Série histórica ---------- */
function setSerie(years){
  years=years.filter(r=>isFinite(r.p)&&r.p>0).sort((a,b)=>a.y-b.y);
  if(years.length<8){ toast('Série curta demais ('+years.length+' anos) — mínimo 8'); return false; }
  S.hidro.serie=years;
  const ps=years.map(r=>r.p);
  const mean=ps.reduce((a,b)=>a+b,0)/ps.length;
  const sd=Math.sqrt(ps.reduce((a,b)=>a+(b-mean)**2,0)/(ps.length-1));
  const modo=document.getElementById('hAno')?document.getElementById('hAno').value:'hidro';
  let html=`<b>${years.length} anos</b> (${years[0].y}–${years[years.length-1].y}) · ano `+
    `<b>${modo==='hidro'?'hidrológico (out–set)':'civil'}</b><br>`+
    `média das máximas: <b>${mean.toFixed(1)} mm</b> · desvio: <b>${sd.toFixed(1)} mm</b> · `+
    `máx absoluta: <b>${Math.max(...ps).toFixed(1)} mm</b>`;
  /* Guarda de sanidade válida para QUALQUER origem (ANA, CSV ou colagem):
     uma máxima anual muito abaixo da mediana quase sempre significa ano
     parcial, não ano seco. É barato avisar e caro não avisar — um único ano
     desses inflaciona o desvio-padrão e inclina o expoente de T da IDF.     */
  const ord=[...ps].sort((a,b)=>a-b);
  const med=ord.length%2 ? ord[(ord.length-1)/2] : (ord[ord.length/2-1]+ord[ord.length/2])/2;
  const susp=years.filter(r=>r.p < 0.5*med);
  if(susp.length){
    html+=`<br><span style="color:var(--amber)">⚠ ${susp.length} ano(s) com máxima muito abaixo da `+
      `mediana (${med.toFixed(1)} mm), típico de ano incompleto: `+
      susp.map(r=>`<b>${r.y}</b> = ${r.p.toFixed(1)} mm`).join('; ')+
      ` &mdash; <button class="mini" id="btnSerieLimpa" style="margin:2px 0">remover da série</button></span>`;
    setTimeout(()=>{ const b=document.getElementById('btnSerieLimpa');
      if(b) b.onclick=()=>{ const lim=years.filter(r=>r.p>=0.5*med);
        if(setSerie(lim)) toast(susp.length+' ano(s) removido(s) — gere a IDF novamente'); }; },0);
  }
  const rem=S.hidro.diario&&S.hidro.diario.removidos;
  if(rem&&rem.length){
    html+=`<br><span style="color:var(--amber)">⚠ ${rem.length} registro(s) espúrio(s) removido(s): `+
      rem.slice(0,6).map(x=>`${x.p.toFixed(1)} mm em ${String(x.D).padStart(2,'0')}/${String(x.M).padStart(2,'0')}/${x.Y}`).join('; ')+
      (rem.length>6?'…':'')+'</span>';
  }
  document.getElementById('hSerieOut').innerHTML=html;
  return true;
}
async function fetchANA(){
  const cod=document.getElementById('hEst').value.trim().replace(/\D/g,'');
  if(!cod){ toast('Informe o código da estação'); return; }
  showLoad('Consultando ANA…');
  const urls=[
    `https://telemetriaws1.ana.gov.br/ServiceANA.asmx/HidroSerieHistorica?codEstacao=${cod}&dataInicio=&dataFim=&tipoDados=2&nivelConsistencia=`,
    `http://telemetriaws1.ana.gov.br/ServiceANA.asmx/HidroSerieHistorica?codEstacao=${cod}&dataInicio=&dataFim=&tipoDados=2&nivelConsistencia=`];
  for(const url of urls){
    try{
      const xml=await (await fetch(url)).text();
      const doc=new DOMParser().parseFromString(xml,'text/xml');
      const rows=[...doc.querySelectorAll('SerieHistorica')];
      if(!rows.length) continue;
      const annual={}, meses={};
      rows.forEach(r=>{
        const data=r.querySelector('DataHora')?.textContent||'';
        const y=+data.slice(0,4); if(!y) return;
        const m=+data.slice(5,7);
        const mx=parseFloat((r.querySelector('Maxima')?.textContent||'').replace(',','.'));
        if(isFinite(mx)){ annual[y]=Math.max(annual[y]||0,mx);
          (meses[y]=meses[y]||new Set()).add(m); }
      });
      hideLoad();
      /* completude: o webservice entrega linhas MENSAIS, então o ano só vale
         com os 12 meses. Sem esta guarda entravam anos parciais — o primeiro
         e o último da operação — cuja "máxima anual" é só a maior de poucos
         meses, o que enviesa o ajuste da IDF.                                */
      const parc=Object.keys(annual).filter(y=>(meses[y]||{size:0}).size<12).map(Number);
      const cheia=Object.entries(annual).filter(([y])=>(meses[y]||{size:0}).size>=12)
                        .map(([y,p])=>({y:+y,p}));
      if(setSerie(cheia)){
        toast('Série da ANA carregada'+(parc.length?` (${parc.length} ano(s) parcial(is) descartado(s))`:''));
        if(parc.length){ const o=document.getElementById('hSerieOut');
          if(o) o.innerHTML+=`<br><span style="color:var(--ink-dim)">Anos incompletos descartados: ${parc.sort().join(', ')}</span>`; }
      }
      return;
    }catch(e){ /* tenta próxima */ }
  }
  hideLoad();
  toast('ANA inacessível pelo navegador (CORS). Baixe o CSV no portal Hidroweb e use "Carregar CSV".');
}
/* Lê o CSV do HidroWeb pelas colunas DIÁRIAS (Chuva01..Chuva31), e não pela coluna
   "Maxima" do mês. Isso permite: (a) preferir o registro consistido ao bruto,
   (b) descartar os dias marcados como acumulados (Status = 4), (c) detectar leituras
   espúrias e (d) montar as máximas por ano hidrológico — que é o que o Atlas faz. */
function parseHidrowebCSV(text){
  const lines=text.split(/\r?\n/);
  let hdr=-1, H=null;
  for(let i=0;i<lines.length;i++){
    if(lines[i].startsWith('EstacaoCodigo;')){ hdr=i; H=lines[i].split(';').map(c=>c.trim()); break; }
  }
  if(hdr<0) return parseHidrowebCSVLegacy(text);   // formato antigo/colado
  const iData=H.indexOf('Data'), iNC=H.indexOf('NivelConsistencia');
  const cD=[], cS=[];
  for(let d=1;d<=31;d++){
    cD.push(H.indexOf('Chuva'+String(d).padStart(2,'0')));
    cS.push(H.indexOf('Chuva'+String(d).padStart(2,'0')+'Status'));
  }
  if(iData<0 || cD[0]<0) return parseHidrowebCSVLegacy(text);
  const dep = document.getElementById('hDep') ? document.getElementById('hDep').value==='1' : true;
  const num=v=>{ if(v==null) return NaN; v=String(v).replace(/"/g,'').trim().replace(',','.');
                 return v===''?NaN:parseFloat(v); };
  // 1ª passada: registros por mês, preferindo o consistido (NC=2)
  const meses={};
  for(let i=hdr+1;i<lines.length;i++){
    const ln=lines[i]; if(!ln.trim()) continue;
    const c=ln.split(';'); if(c.length<=iData) continue;
    const m=(c[iData]||'').match(/(\d{2})\/(\d{2})\/(\d{4})/); if(!m) continue;
    const key=m[3]+'-'+m[2];
    const nc=iNC>=0? (+String(c[iNC]).replace(/\D/g,'')||1) : 1;
    if(!meses[key] || nc>=meses[key].nc) meses[key]={nc, c};
  }
  // 2ª passada: série diária
  const dias=[];
  Object.entries(meses).forEach(([key,rec])=>{
    const [Y,M]=key.split('-').map(Number);
    for(let d=1;d<=31;d++){
      if(cD[d-1]<0) continue;
      const p=num(rec.c[cD[d-1]]); if(!isFinite(p)) continue;
      const st = cS[d-1]>=0 ? (+String(rec.c[cS[d-1]]).replace(/\D/g,'')||1) : 1;
      if(dep && st===4) continue;               // acumulado — não é chuva de 1 dia
      const dt=new Date(Y, M-1, d);
      if(dt.getMonth()!==M-1) continue;         // dia inexistente no mês
      dias.push({Y, M, D:d, p, st});
    }
  });
  if(!dias.length) return parseHidrowebCSVLegacy(text);
  // depuração de espúrios: valores repetidos e absurdos (falha de sensor/data logger)
  let removidos=[];
  if(dep){
    const ps=dias.map(x=>x.p).sort((a,b)=>b-a);
    const p99=ps[Math.floor(ps.length*0.001)]||0;   // ~0,1% maiores
    const lim=Math.max(200, 3*(ps[Math.min(20,ps.length-1)]||0));
    const cont={};
    dias.forEach(x=>{ if(x.p>=100) cont[x.p.toFixed(1)]=(cont[x.p.toFixed(1)]||0)+1; });
    removidos=dias.filter(x=> x.p>lim || (x.p>=150 && cont[x.p.toFixed(1)]>=2) );
    const bad=new Set(removidos.map(x=>x.Y+'-'+x.M+'-'+x.D));
    for(let i=dias.length-1;i>=0;i--){ const x=dias[i];
      if(bad.has(x.Y+'-'+x.M+'-'+x.D)) dias.splice(i,1); }
  }
  S.hidro.diario={dias, removidos};
  return maximasAnuais(dias);
}
/* Máximas anuais — por ano civil ou hidrológico (01/out a 30/set, rotulado pelo ano final) */
function maximasAnuais(dias){
  const modo = document.getElementById('hAno') ? document.getElementById('hAno').value : 'hidro';
  const mx={}, cnt={};
  dias.forEach(x=>{
    const y = modo==='hidro' ? (x.M>=10 ? x.Y+1 : x.Y) : x.Y;
    mx[y]=Math.max(mx[y]??-1, x.p);
    cnt[y]=(cnt[y]||0)+1;
  });
  return Object.entries(mx)
    .filter(([y])=>cnt[y]>=330)          // ano incompleto não entra
    .map(([y,p])=>({y:+y, p}));
}
/* Formato antigo: colunas "Data" e "Maxima", ou "ano valor" colado */
function parseHidrowebCSVLegacy(text){
  const lines=text.split(/\r?\n/);
  const annual={}; let iData=-1,iMax=-1;
  for(const ln of lines){
    if(ln.startsWith('//')||!ln.trim()) continue;
    const cells=ln.split(';');
    if(iMax<0){
      const h=cells.map(c=>c.trim().toLowerCase());
      iData=h.indexOf('data'); iMax=h.findIndex(c=>c==='maxima'||c==='máxima');
      if(iMax>=0) continue;
      const g=ln.trim().split(/[;\s]+/);
      if(g.length>=2 && /^\d{4}$/.test(g[0])){ const p=parseFloat(g[1].replace(',','.'));
        if(isFinite(p)) annual[+g[0]]=Math.max(annual[+g[0]]||0,p); }
      continue;
    }
    if(cells.length<=Math.max(iData,iMax)) continue;
    const m=cells[iData].match(/(\d{4})/); if(!m) continue;
    const p=parseFloat((cells[iMax]||'').replace(',','.'));
    if(isFinite(p)) annual[+m[1]]=Math.max(annual[+m[1]]||0,p);
  }
  return Object.entries(annual).map(([y,p])=>({y:+y,p}));
}
function parsePasted(text){
  const out=[]; let auto=1;
  text.split(/\r?\n/).forEach(ln=>{
    const g=ln.trim().split(/[;\s,]+/).filter(Boolean); if(!g.length) return;
    if(g.length>=2 && /^\d{4}$/.test(g[0])){ const p=parseFloat(g[1].replace(',','.')); if(isFinite(p)) out.push({y:+g[0],p}); }
    else { const p=parseFloat(g[0].replace(',','.')); if(isFinite(p)) out.push({y:auto++,p}); }
  });
  return out;
}

/* ---------- Gumbel + desagregação CETESB + ajuste IDF ---------- */
/* Gumbel — método de Chow com coeficientes de amostra finita (Yn, Sn).
   Para n grande (>100) converge para a forma assintótica Yn->0,5772 / Sn->1,2825. */
const GUM_YN={10:0.4952,15:0.5128,20:0.5236,25:0.5309,30:0.5362,35:0.5403,40:0.5436,
  45:0.5463,50:0.5485,55:0.5504,60:0.5521,65:0.5535,70:0.5548,75:0.5559,80:0.5569,
  85:0.5578,90:0.5586,95:0.5593,100:0.5600};
const GUM_SN={10:0.9496,15:1.0206,20:1.0628,25:1.0915,30:1.1124,35:1.1285,40:1.1413,
  45:1.1518,50:1.1607,55:1.1681,60:1.1747,65:1.1803,70:1.1854,75:1.1898,80:1.1938,
  85:1.1973,90:1.2007,95:1.2038,100:1.2065};
function gumTab(tab,n,asym){
  const ks=Object.keys(tab).map(Number).sort((a,b)=>a-b);
  if(n>=ks[ks.length-1]) return asym;          // amostra grande -> assintótico
  if(n<=ks[0]) return tab[ks[0]];
  for(let i=0;i<ks.length-1;i++){
    if(n>=ks[i]&&n<=ks[i+1]){
      const t=(n-ks[i])/(ks[i+1]-ks[i]);
      return tab[ks[i]]+t*(tab[ks[i+1]]-tab[ks[i]]);
    }
  }
  return asym;
}
function gumbelYnSn(n){
  return {yn:gumTab(GUM_YN,n,0.5772), sn:gumTab(GUM_SN,n,Math.PI/Math.sqrt(6))};
}
function gumbelXT(mean,sd,T,n){
  const yT=-Math.log(Math.log(T/(T-1)));
  const {yn,sn}=gumbelYnSn(n||1e6);
  return mean+sd*(yT-yn)/sn;
}
/* ---------- GEV por momentos-L (Hosking) — metodologia do Atlas Pluviométrico ----------
   Ajusta a Generalizada de Valores Extremos às máximas diárias anuais. É o método
   oficial do SGB/CPRM (Pinto, 2013), e não o Gumbel clássico. */
function lgammaFn(z){ // Lanczos
  const g=[676.5203681218851,-1259.1392167224028,771.32342877765313,
    -176.61502916214059,12.507343278686905,-0.13857109526572012,
    9.9843695780195716e-6,1.5056327351493116e-7];
  if(z<0.5) return Math.log(Math.PI/Math.sin(Math.PI*z))-lgammaFn(1-z);
  z-=1; let x=0.99999999999980993;
  for(let i=0;i<8;i++) x+=g[i]/(z+i+1);
  const t=z+7.5;
  return 0.5*Math.log(2*Math.PI)+(z+0.5)*Math.log(t)-t+Math.log(x);
}
function lmoments(arr){
  const x=[...arr].sort((a,b)=>a-b), n=x.length;
  let b0=0,b1=0,b2=0;
  for(let i=0;i<n;i++){
    b0+=x[i];
    b1+=i/(n-1)*x[i];
    b2+=i*(i-1)/((n-1)*(n-2))*x[i];
  }
  b0/=n; b1/=n; b2/=n;
  const l1=b0, l2=2*b1-b0, l3=6*b2-6*b1+b0;
  return {l1,l2,t3:l3/l2};
}
function gevFit(arr){
  const {l1,l2,t3}=lmoments(arr);
  const c=2/(3+t3)-Math.log(2)/Math.log(3);
  const k=7.8590*c+2.9554*c*c;
  const g=Math.exp(lgammaFn(1+k));
  const alpha=l2*k/((1-Math.pow(2,-k))*g);
  const xi=l1-alpha*(1-g)/k;
  return {k,alpha,xi,l1,l2,t3};
}
function gevXT(f,T){
  const F=1-1/T;
  return f.xi + f.alpha/f.k*(1-Math.pow(-Math.log(F), f.k));
}
/* Relações entre alturas de chuva — Martinez e Magni (1999 apud DAEE, 2018), Itararé/SP.
   São as usadas pelo Atlas Pluviométrico para desagregar o quantil diário. */
const ATLAS_DURS=[10,15,30,45,60,120,180,240,360,480,840,1440];
function disaggAtlas(P1d){
  const h={};
  h[1440]=P1d*1.13;         // 24 h / 1 dia
  h[840]=h[1440]*0.92;      // 14 h / 24 h
  h[480]=h[840]*0.91;       // 8 h / 14 h
  h[360]=h[480]*0.95;       // 6 h / 8 h
  h[240]=h[360]*0.93;       // 4 h / 6 h
  h[180]=h[240]*0.95;       // 3 h / 4 h
  h[120]=h[180]*0.92;       // 2 h / 3 h
  h[60] =h[120]*0.85;       // 1 h / 2 h
  h[45] =h[60]*0.92;        // 45 min / 1 h
  h[30] =h[45]*0.88;        // 30 min / 45 min
  h[15] =h[30]*0.75;        // 15 min / 30 min
  h[10] =h[15]*0.81;        // 10 min / 15 min
  return h;
}
const CETESB_DURS=[5,10,15,20,25,30,60,360,480,600,720,1440];
function disagg(P1d){
  const P24=P1d*1.14;
  const map={1440:P24, 720:0.85*P24, 600:0.82*P24, 480:0.78*P24, 360:0.72*P24, 60:0.42*P24};
  map[30]=0.74*map[60]; map[25]=0.91*map[30]; map[20]=0.81*map[30];
  map[15]=0.70*map[30]; map[10]=0.54*map[30]; map[5]=0.34*map[30];
  return map;
}
function solve3(A,b){
  const M=A.map((r,i)=>[...r,b[i]]);
  for(let c=0;c<3;c++){
    let mx=c; for(let r=c+1;r<3;r++) if(Math.abs(M[r][c])>Math.abs(M[mx][c])) mx=r;
    [M[c],M[mx]]=[M[mx],M[c]];
    for(let r=0;r<3;r++){ if(r===c) continue; const f=M[r][c]/M[c][c];
      for(let k=c;k<4;k++) M[r][k]-=f*M[c][k]; }
  }
  return [M[0][3]/M[0][0], M[1][3]/M[1][1], M[2][3]/M[2][2]];
}
function buildIDF(serie, Ts, met){
  met=met||'atlas';
  const ps=serie.map(r=>r.p);
  const mean=ps.reduce((a,b)=>a+b,0)/ps.length;
  const sd=Math.sqrt(ps.reduce((a,b)=>a+(b-mean)**2,0)/(ps.length-1));
  const n=ps.length;
  const {yn,sn}=gumbelYnSn(n);
  const gev = met==='atlas' ? gevFit(ps) : null;
  const DURS = met==='atlas' ? ATLAS_DURS : CETESB_DURS;
  const quant=(T)=>{
    const P1d = met==='atlas' ? gevXT(gev,T) : gumbelXT(mean,sd,T,n);
    return met==='atlas' ? disaggAtlas(P1d) : disagg(P1d);
  };
  // linhas exibidas: só os T pedidos pelo usuário
  const rows=[];
  Ts.forEach(T=>{ const m=quant(T); DURS.forEach(t=>rows.push({t,T,i:m[t]/(t/60)})); });
  // linhas do AJUSTE: malha densa de T, como faz o Atlas — senão a equação fica
  // enviesada pelos poucos T digitados e a curva não bate com a publicada
  const T_FIT=[2,5,10,15,20,25,30,50,75,100];
  const fit=[];
  T_FIT.forEach(T=>{ const m=quant(T); DURS.forEach(t=>fit.push({t,T,i:m[t]/(t/60)})); });
  const fitB=(b)=>{
    let Sxx=[[0,0,0],[0,0,0],[0,0,0]], Sxy=[0,0,0];
    fit.forEach(r=>{
      const x=[1, Math.log(r.T), -Math.log(r.t+b)], y=Math.log(r.i);
      for(let i2=0;i2<3;i2++){ Sxy[i2]+=x[i2]*y; for(let j=0;j<3;j++) Sxx[i2][j]+=x[i2]*x[j]; }
    });
    const [lnK,a,c]=solve3(Sxx,Sxy);
    let sse=0; fit.forEach(r=>{ const p=lnK+a*Math.log(r.T)-c*Math.log(r.t+b); sse+=(p-Math.log(r.i))**2; });
    return {sse,K:Math.exp(lnK),a,b,c};
  };
  // busca de b: varredura grossa (passo 1) + refinamento (passo 0,01)
  let best=null;
  for(let b=0;b<=60;b+=1){ const f=fitB(b); if(!best||f.sse<best.sse) best=f; }
  const lo=Math.max(0,best.b-1), hi=best.b+1;
  for(let b=lo;b<=hi;b+=0.01){ const f=fitB(b); if(f.sse<best.sse) best=f; }
  const my=fit.reduce((s,r)=>s+Math.log(r.i),0)/fit.length;
  const sst=fit.reduce((s,r)=>s+(Math.log(r.i)-my)**2,0);
  best.r2=1-best.sse/sst;
  const errs=fit.map(r=>Math.abs(best.K*Math.pow(r.T,best.a)/Math.pow(r.t+best.b,best.c)/r.i-1)*100);
  const emean=errs.reduce((a,b)=>a+b,0)/errs.length;
  return {mean,sd,n,yn,sn,Ts,rows,K:best.K,a:best.a,b:best.b,c:best.c,r2:best.r2,
          emean,emax:Math.max(...errs), met, gev, durs:DURS};
}
function idfI(t,T){ const f=S.hidro.idf; return f? f.K*Math.pow(T,f.a)/Math.pow(t+f.b,f.c) : null; }

function runIDF(){
  const serie=S.hidro.serie;
  if(!serie){ toast('Carregue a série histórica primeiro'); return; }
  const Ts=document.getElementById('hTs').value.split(',').map(v=>+v.trim()).filter(v=>v>1);
  if(!Ts.length){ toast('Períodos de retorno inválidos'); return; }
  const met=document.getElementById('hMet').value;
  const f=buildIDF(serie,Ts,met); S.hidro.idf=f;
  document.getElementById('idfTag').textContent =
    met==='atlas' ? 'GEV/L-mom + Itararé' : 'Gumbel + CETESB';
  let html = met==='atlas'
    ? `GEV/momentos-L (n=${f.n}): κ=${f.gev.k.toFixed(4)} · α=${f.gev.alpha.toFixed(2)} mm · ξ=${f.gev.xi.toFixed(2)} mm · L-CS=${f.gev.t3.toFixed(4)}\nDesagregação: Martinez &amp; Magni / Itararé (DAEE, 2018) — metodologia do Atlas Pluviométrico (SGB/CPRM)\n`
    : `Gumbel/Chow (n=${f.n}): P&#772;=${f.mean.toFixed(1)} mm · s=${f.sd.toFixed(1)} mm · Yn=${f.yn.toFixed(4)} · Sn=${f.sn.toFixed(4)}\nDesagregação: coeficientes CETESB/DAEE\n`;
  html+=`<b>i = ${f.K.toFixed(2)} · T^${f.a.toFixed(4)} / (t + ${f.b.toFixed(2)})^${f.c.toFixed(4)}</b>   (i mm/h, t min, T anos)\n`;
  html+=`R²(log)=${f.r2.toFixed(5)} · erro médio ${f.emean.toFixed(1)}% · erro máx ${f.emax.toFixed(1)}%\n`;
  /* A desagregação daqui é genérica. O Atlas Pluviométrico publica razões
     PRÓPRIAS de cada município, e a diferença chega a 30% nas durações curtas
     — que são justamente as que dimensionam canaletas. */
  html+=`<span style="color:var(--amber)">⚠ Desagregação genérica. Se houver relatório do Atlas `+
        `Pluviométrico para o município, prefira a equação publicada — use “parâmetros manuais” `+
        `abaixo.</span>\n\n`;
  html+='<table><tr><th>t (min)</th>'+f.Ts.map(T=>`<th>T=${T}</th>`).join('')+'</tr>';
  f.durs.forEach(t=>{ html+=`<tr><td>${t}</td>`+f.Ts.map(T=>{
    const r=f.rows.find(x=>x.t===t&&x.T===T); return `<td>${r.i.toFixed(1)}</td>`; }).join('')+'</tr>'; });
  html+='</table>';
  document.getElementById('hIdfOut').innerHTML=html;
  document.getElementById('hIdfBtns').style.display='flex';
  drawIDFChart(f);
  toast('IDF ajustada — R² '+f.r2.toFixed(3));
}
function drawIDFChart(f){
  const cv=document.getElementById('idfChart'); if(!cv||!cv.getContext) return;
  cv.style.display='block';
  const ctx=cv.getContext('2d'); const W=cv.width,H=cv.height;
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
  const mL=58,mB=42,mT=16,mR=14;
  const tmin=5,tmax=1440;
  const imax=Math.max(...f.rows.map(r=>r.i))*1.06;
  const X=t=>mL+(Math.log(t)-Math.log(tmin))/(Math.log(tmax)-Math.log(tmin))*(W-mL-mR);
  const Y=i=>H-mB-(i/imax)*(H-mB-mT);
  ctx.strokeStyle='#ddd'; ctx.fillStyle='#333'; ctx.font='12px Signika, sans-serif'; ctx.lineWidth=1;
  [5,10,15,30,60,120,360,720,1440].forEach(t=>{ ctx.beginPath(); ctx.moveTo(X(t),mT); ctx.lineTo(X(t),H-mB); ctx.stroke();
    ctx.textAlign='center'; ctx.fillText(t,X(t),H-mB+16); });
  const step=Math.max(10,Math.ceil(imax/60)*10);
  for(let i2=0;i2<=imax;i2+=step){ ctx.beginPath(); ctx.moveTo(mL,Y(i2)); ctx.lineTo(W-mR,Y(i2)); ctx.stroke();
    ctx.textAlign='right'; ctx.fillText(i2,mL-6,Y(i2)+4); }
  ctx.fillText('t (min)',W/2,H-8); ctx.save(); ctx.translate(14,H/2); ctx.rotate(-Math.PI/2);
  ctx.textAlign='center'; ctx.fillText('i (mm/h)',0,0); ctx.restore();
  const cols=['#b3781a','#37c0aa','#e05252','#7aa2f7','#bb9af7','#5d7d2b'];
  f.Ts.forEach((T,k)=>{
    ctx.strokeStyle=cols[k%cols.length]; ctx.lineWidth=2; ctx.beginPath();
    let first=true;
    for(let t=tmin;t<=tmax;t*=1.06){ const i2=f.K*Math.pow(T,f.a)/Math.pow(t+f.b,f.c);
      if(first){ctx.moveTo(X(t),Y(i2));first=false;} else ctx.lineTo(X(t),Y(i2)); }
    ctx.stroke();
    ctx.fillStyle=cols[k%cols.length]; ctx.textAlign='left';
    ctx.fillText('T='+T, X(6), Y(f.K*Math.pow(T,f.a)/Math.pow(6+f.b,f.c))-4);
  });
}

/* ---------- MDE ---------- */
const GEOTIFF_CDNS=[
  'https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js',
  'https://unpkg.com/geotiff@2.1.3/dist-browser/geotiff.js',
  'https://cdnjs.cloudflare.com/ajax/libs/geotiff/2.1.3/geotiff.min.js'];
function ensureGeoTIFF(){
  if(window.GeoTIFF) return Promise.resolve();
  if(S._gtLoading) return S._gtLoading;
  S._gtLoading=(async()=>{
    for(const url of GEOTIFF_CDNS){
      try{
        await new Promise((res,rej)=>{ const sc=document.createElement('script');
          sc.src=url; sc.onload=res; sc.onerror=()=>rej(new Error('cdn falhou'));
          document.head.appendChild(sc); });
        if(window.GeoTIFF) return;
      }catch(e){}
    }
    throw new Error('não foi possível baixar a biblioteca GeoTIFF — verifique a internet ou use .asc');
  })();
  return S._gtLoading;
}
/* ---------------------------------------------------------------------------
   RESOLUÇÃO — duas grades por raster
   d        : grade de TELA/interação (reamostrada por MÉDIA DE BLOCO, sem alias)
   d._full  : grade NATIVA, relida do TIFF sob demanda (demFull) e usada por
              TODO produto: perfil, curvas de nível, extração de Z, plotagem.
   O TIFF original nunca é descartado — fica indexado em d._img0 (leitura
   preguiçosa por faixas), igual ao que já era feito com a ortofoto.
   --------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
   TETO DA GRADE DE TELA
   Acima deste número de células o mapa é desenhado a partir de uma média de
   bloco. A redução não altera produto nenhum, mas DESLOCA a feição desenhada:
   o erro de cota da média dividido pela declividade local vira deslocamento
   horizontal — desprezível numa face íngreme, vários metros num patamar plano.
   É por isso que a conferência visual contra as curvas fecha em levantamento
   pequeno (que não é reduzido) e falha em levantamento grande.
   Em desktop o teto passa a acompanhar a memória da máquina; no celular e no
   tablet segue conservador, porque lá o canvas é o gargalo.
   --------------------------------------------------------------------------- */
const EH_MOVEL = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent||'') ||
  (/Macintosh|Mac/i.test((navigator.userAgent||'')+' '+(navigator.platform||''))&&navigator.maxTouchPoints>1) ||
  (navigator.maxTouchPoints>1 && !(window.matchMedia&&window.matchMedia('(pointer:fine)').matches));
/* Perfil manual de desempenho. “Automático” conserva a detecção física,
   “Mobile” permite forçar o LOD leve e “PC” libera a TIN integral. Isto muda
   somente a representação no WebGL — raster, TIN e vetores do projeto nunca
   são reamostrados ou sobrescritos.                                         */
let ALAGIS_PERF_MODE='auto';
try{
  const q=localStorage.getItem('alagis_perf_mode');
  if(q==='mobile'||q==='pc'||q==='auto')ALAGIS_PERF_MODE=q;
}catch(_){}
function alagisModoMobile(){
  return ALAGIS_PERF_MODE==='mobile'||(ALAGIS_PERF_MODE==='auto'&&EH_MOVEL);
}
function alagisPerf3D(){
  const mobile=alagisModoMobile();
  // O dispositivo limita só cadência e detalhes auxiliares, nunca a geometria.
  return mobile
    ?{mobile:true,pixelRatio:window.devicePixelRatio||1,wireMax:60000,fps:30,anisotropy:4}
    :{mobile:false,pixelRatio:window.devicePixelRatio||1,wireMax:220000,fps:60,anisotropy:16};
}
/* Three r128 não implementa flatShading no Lambert. Phong sem componente
   especular calcula a normal de cada face no fragment shader: mantém vincos
   sem soldar vértices, duplicar a TIN nem alterar os índices originais. */
function v3LambertMaterial(opt,flat){
  if(flat)return new THREE.MeshPhongMaterial({...opt,flatShading:true,specular:0x000000,shininess:0});
  return new THREE.MeshLambertMaterial(opt||{});
}
/* Aparência única para Mapa, Layout e 3D. "hipso" permanece como nome
   histórico da opção, mas significa usar o estilo atual da camada raster. */
function v3RasterStyleColor(r,z,zmin,zmax,solid){
  if(solid)return solid;
  const st=(r&&r.style)||{},modo=st.mode||'hipso_hs',rng=Math.max(1e-9,zmax-zmin),t=(z-zmin)/rng;
  if(modo==='classes'){
    const hit=rasterClassRangeFind(st.classes,z),q=hit&&hit.item;
    return hexToRGB01((q&&q.color)||'#777777');
  }
  if(modo==='slopeclass'){
    const q=(st.classes||[]).find(c=>Math.round(z)===+c.value)||(st.classes||[])[0];
    return hexToRGB01((q&&q.color)||'#777777');
  }
  if(modo==='cn'){
    let q=null,bd=Infinity;(st.classes||[]).forEach(c=>{const d=Math.abs(z-(+c.value||0));if(d<bd){bd=d;q=c;}});
    return hexToRGB01((q&&q.color)||'#777777');
  }
  if(modo==='gray'){const g=(40+190*Math.max(0,Math.min(1,t)))/255;return[g,g,g];}
  if(modo==='hs')return[0.86,0.86,0.86];
  return hypsoColor(t);
}
function v3RasterStyleHasLight(r,tex3d){
  if(tex3d==='orto'||tex3d==='solida')return true;
  const modo=(r&&r.style&&r.style.mode)||'hipso_hs';
  return modo==='hs'||modo==='hipso_hs'||/sombread/.test(modo);
}
function v3RasterOpacity(r){
  const raw=r&&r.style&&r.style.opacity;
  if(raw===undefined||raw===null||String(raw).trim()==='')return 1;
  const n=Number(typeof raw==='string'?raw.replace(',','.'):raw);
  return Number.isFinite(n)?Math.max(0,Math.min(1,n)):1;
}
/* A opacidade pertence à superfície, não ao raio X dos vetores. Um MDT a
   100% escreve no depth buffer normalmente. Partes auxiliares, como a malha
   de arestas a 20%, conservam sua proporção de transparência e depthWrite. */
function v3ApplySurfaceOpacity(r,material,factor){
  if(Array.isArray(material)){material.forEach(m=>v3ApplySurfaceOpacity(r,m,factor));return;}
  if(!material)return;
  const base=material._v3RasterOpacityBase||(material._v3RasterOpacityBase={
    factor:factor===undefined?(Number.isFinite(material.opacity)?material.opacity:1):factor,
    depthWrite:material.depthWrite!==false,
    visible:material.visible!==false
  });
  const opacity=v3RasterOpacity(r)*base.factor,transparent=opacity<1,
    depthWrite=opacity>=1&&base.depthWrite,visible=opacity>0&&base.visible;
  const changed=material.transparent!==transparent||material.depthWrite!==depthWrite||
    material.visible!==visible;
  material.opacity=opacity;material.transparent=transparent;
  material.depthWrite=depthWrite;material.visible=visible;
  if(changed)material.needsUpdate=true;
}
function v3SurfaceMaterial(r,opt,flat,tex3d){
  const mat=v3RasterStyleHasLight(r,tex3d)?v3LambertMaterial(opt,flat):new THREE.MeshBasicMaterial(opt||{});
  v3ApplySurfaceOpacity(r,mat,1);
  return mat;
}
/* Separa apenas os vincos fortes da TIN. Dentro de um mesmo talude os
   triângulos compartilham normal; entre berma horizontal e talude inclinado
   permanecem dois grupos, conservando a leitura nítida da crista e do pé. */
function v3CreaseData(pos,col,uv,idx,anguloDeg){
  const nf=(idx.length/3)|0,fn=new Float32Array(nf*3),ori=new Uint32Array(idx);
  for(let f=0;f<nf;f++){
    const a=ori[3*f],b=ori[3*f+1],c=ori[3*f+2],
      ax=pos[3*a],ay=pos[3*a+1],az=pos[3*a+2],
      ux=pos[3*b]-ax,uy=pos[3*b+1]-ay,uz=pos[3*b+2]-az,
      vx=pos[3*c]-ax,vy=pos[3*c+1]-ay,vz=pos[3*c+2]-az;
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    /* Alguns importadores entregam triângulos alternados em sentido horário
       e anti-horário. Em material dupla-face isso aparece como listras. */
    if(ny<0){const q=ori[3*f+1];ori[3*f+1]=ori[3*f+2];ori[3*f+2]=q;nx=-nx;ny=-ny;nz=-nz;}
    const L=Math.hypot(nx,ny,nz)||1;
    fn[3*f]=nx/L;fn[3*f+1]=ny/L;fn[3*f+2]=nz/L;
  }
  const cos=Math.cos((anguloDeg||40)*Math.PI/180),grupos=[],p=[],c=[],u=uv?[]:null,
    ii=new Uint32Array(idx.length);
  for(let k=0;k<ori.length;k++){
    const vi=ori[k],f=(k/3)|0,nx=fn[3*f],ny=fn[3*f+1],nz=fn[3*f+2];
    let gs=grupos[vi],g=null;
    if(!gs)grupos[vi]=gs=[];
    for(const q of gs){const L=Math.hypot(q.x,q.y,q.z)||1;if((nx*q.x+ny*q.y+nz*q.z)/L>=cos){g=q;break;}}
    if(!g){const oi=p.length/3;g={x:0,y:0,z:0,oi};gs.push(g);
      p.push(pos[3*vi],pos[3*vi+1],pos[3*vi+2]);c.push(col[3*vi],col[3*vi+1],col[3*vi+2]);
      if(u)u.push(uv[2*vi],uv[2*vi+1]);}
    g.x+=nx;g.y+=ny;g.z+=nz;ii[k]=g.oi;
  }
  return {pos:new Float32Array(p),col:new Float32Array(c),uv:u?new Float32Array(u):null,idx:ii};
}
function alagisBindPerfMode(){
  const sel=document.getElementById('uiPerfMode');if(!sel)return;
  sel.value=ALAGIS_PERF_MODE;
  const atualizaTitulo=()=>{
    const ativo=alagisModoMobile()?'Mobile':'PC';
    sel.title=`Perfil ${ALAGIS_PERF_MODE==='auto'?'automático — ':''}${ativo} ativo`;
  };
  atualizaTitulo();
  sel.addEventListener('change',()=>{
    ALAGIS_PERF_MODE=['auto','mobile','pc'].includes(sel.value)?sel.value:'auto';
    try{localStorage.setItem('alagis_perf_mode',ALAGIS_PERF_MODE);}catch(_){}
    atualizaTitulo();
    /* Um renderer existente conserva pixel ratio e buffers antigos. Recriá-lo
       é indispensável para a troca ter efeito imediato e também libera a
       memória GPU ocupada pelo perfil anterior. */
    try{if(typeof v3DescartaRenderer==='function')v3DescartaRenderer();}catch(_){}
    const ativo=alagisModoMobile()?'Mobile':'PC';
    toast(`Modo ${ativo}: o 3D será reconstruído com o novo perfil`);
    if(S._view==='v3d')setTimeout(()=>build3D(),30);
    else if(S._view==='mina'&&typeof mina3DAuto==='function')
      setTimeout(()=>mina3DAuto(true),30);
  });
}
setTimeout(alagisBindPerfMode,0);
const RASTER_MAX_CELLS = EH_MOVEL ? 8e6
  : Math.min(64e6, Math.max(24e6, (navigator.deviceMemory||8)*8e6));
/* Arquivo GeoTIFF nao precisa usar o teto analitico inteiro como preview.
   A visao afastada cabe em poucos milhoes de pixels; ao aproximar, os tiles
   releem o original. Separar os tetos evita canvases de centenas de MB sem
   reduzir a resolucao dos calculos e das superficies geradas no GeoMine. */
const RASTER_FILE_PREVIEW_CELLS = EH_MOVEL ? 6e6 : 12e6;
/* Celular/tablet: a aba do Chrome tem teto de memória próprio (~2–4 GB,
   independente da RAM do aparelho) e o canvas é menor — tetos conservadores
   evitam o "Aw, Snap". No desktop os valores continuam no máximo.          */
const DISP_MAX_CELLS = EH_MOVEL ? 6e6 : 12e6;   // acima disto a tela usa tiles do arquivo original
const FULL_MAX_CELLS = EH_MOVEL ? 40e6 : 150e6; // teto de segurança da grade nativa
const PLOT_MAX_CELLS = EH_MOVEL ? 12e6 : 40e6;  // teto do canvas da figura
const PLOT_MAX_SIDE  = EH_MOVEL ? 4096 : 8192;  // limite de lado do canvas
if(EH_MOVEL && typeof cmdLog==='function')
  cmdLog('Modo celular/tablet: malha 3D e tetos de células reduzidos para caber na memória da aba','info');
/* parseTIFF — aceita File/Blob (streaming) ou ArrayBuffer.
   Para arquivos grandes (> 1 GB) NUNCA carrega o arquivo inteiro na memória:
     1. GeoTIFF.fromBlob() lê só o cabeçalho/IFD e busca as faixas sob demanda;
     2. se o TIFF tiver pirâmides (COG), usa a menor overview que ainda atende
        a resolução alvo — isso corta ordens de grandeza de I/O;
     3. a leitura é feita em BLOCOS de linhas (janelas), subamostrando direto
        para a grade de destino, com pico de memória limitado (~32 MB/bloco). */
const CCM_LOGO='data:image/png;base64,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';
S.cliLogo=null;   // logo do CLIENTE (data URI enviada pelo usuário) — vai no selo e na publicação

const TIFF_CHUNK_SAMPLES=8e6;         // amostras por bloco de leitura

/* ---------------------------------------------------------------------------
   FONTE ESTÁVEL NO ANDROID E LEITURA LIMITADA NO DESKTOP
   No Android, o seletor de arquivos entrega um File servido por um "content
   provider" (Files/Drive). As releituras posteriores — o HD dinâmico da
   ortofoto, o orthoWindow da plotagem, o demFull — acontecem MINUTOS depois
   da seleção, quando a permissão/handle do provider pode ter expirado ou o
   arquivo ser um espelho do Drive ainda não sincronizado. Sintoma clássico:
   "erro de sincronização com o Google" ao mexer no mapa.
   Arquivos grandes: cópia sequencial em disco privado (OPFS), sem ocupar a
   RAM com o TIFF inteiro. Desktop mantém o File; import-reader limita e
   agrupa os acessos ao provider. Arquivos pequenos ainda aceitam cópia RAM.
   --------------------------------------------------------------------------- */
function rasterImportCheck(control){
  if(control&&((control.signal&&control.signal.aborted)||(control.isCurrent&&control.isCurrent()===false)))
    throw Object.assign(new Error('Importação cancelada'),{name:'AbortError'});
}
function rasterImportError(error){
  const cause=error&&error.target&&error.target.error||error;
  if(cause&&cause.name==='AbortError')return cause;
  if(cause&&cause.message&&cause.name!=='NotReadableError')return cause;
  return Object.assign(new Error('O navegador perdeu a leitura do arquivo. Se ele está no Drive, aguarde o download completo ou copie para Downloads e selecione essa cópia novamente. Nenhuma camada foi importada.'),{name:'NotReadableError',cause});
}
async function rasterImportWait(promise,control){
  try{
    // A promessa já foi criada pelo chamador. Sempre observar sua rejeição,
    // inclusive se o usuário cancelou antes de entrar neste wrapper.
    const value=globalThis.GeoMineRasterSource
      ?await GeoMineRasterSource.wait(promise,control):await promise;
    rasterImportCheck(control);return value;
  }catch(error){throw rasterImportError(error);}
}
async function rasterImportOpen(source,control){
  rasterImportCheck(control);
  if(control&&control.tiff)return control.tiff;
  if(globalThis.GeoMineRasterImport)return GeoMineRasterImport.open(source,control);
  return rasterImportWait(source instanceof Blob?GeoTIFF.fromBlob(source):GeoTIFF.fromArrayBuffer(source),control);
}
function rasterImportRows(image,width,samples){
  const memoryRows=Math.max(2,Math.floor(TIFF_CHUNK_SAMPLES/(Math.max(1,width)*(samples||1))));
  const fd=image.fileDirectory||{};
  const blockHeight=Number(fd.TileLength||fd.RowsPerStrip)||memoryRows;
  const across=Math.max(1,Math.ceil(width/(Number(fd.TileWidth)||width)));
  // Um TIFF de uma linha por faixa não deve abrir milhares de FileReaders
  // de uma só vez no provedor de arquivos (Drive/Files).
  return Math.max(2,Math.min(memoryRows,Math.floor(32/across)*blockHeight||blockHeight));
}
function bufferCap(){
  const mem=navigator.deviceMemory||4;                  // GB (Chrome informa)
  return mem>=8 ? 900e6 : mem>=6 ? 700e6 : 350e6;
}
async function bufferFonte(f,options){
  if(!(f instanceof Blob)) return f;                    // já é buffer
  rasterImportCheck(options);
  if(options?.preferDirect===true)return f; // RGB first frame: range reads; stable copy follows in background.
  const android=/Android/i.test(navigator.userAgent||'');
  if(android&&f.size>=64*1024*1024&&f.size<1024*1024*1024&&!(options&&options.copyToMemory===true)&&globalThis.GeoMineRasterSource){
    const result=await GeoMineRasterSource.prepare(f,{...options,onProgress:p=>{
      rasterImportCheck(options);
      if(p.phase==='copy'||p.phase==='waiting')
        showLoad(`Preparando arquivo local — ${(100*p.loaded/Math.max(1,p.total)).toFixed(0)}% (${(p.loaded/1048576).toFixed(0)} de ${(p.total/1048576).toFixed(0)} MB)`);
    }});
    rasterImportCheck(options);return result;
  }
  /* No desktop, fromBlob lê intervalos do File sem duplicar todos os bytes.
     A cópia continua disponível explicitamente e como proteção do provider
     Android; os chamadores existentes não precisam mudar o tipo aceito. */
  const copy=options&&typeof options.copyToMemory==='boolean'?options.copyToMemory:android;
  if(!copy)return f;
  if(f.size>bufferCap()){
    if(android)
      toast(`⚠ ${(f.size/1e6).toFixed(0)} MB — acima do teto de memória; leitura direto do arquivo. `+
            `Se falhar, copie o .tif para Downloads (fora do Drive).`);
    return f;                                           // streaming (fromBlob)
  }
  showLoad(`Copiando ${f.name||'arquivo'} para a memória (${(f.size/1e6).toFixed(0)} MB)…`);
  await new Promise(r=>setTimeout(r,10));
  return globalThis.GeoMineRasterSource?await GeoMineRasterSource.read(f,options):await f.arrayBuffer();
}
/* Muitos GeoTIFFs trazem os extremos da banda no GDAL_METADATA. Quando eles
   existem, use-os para a rampa de cor dos tiles originais; calcular a rampa
   sobre a previa por media de blocos apaga picos estreitos e satura detalhes. */
function geotiffDeclaredStats(img){
  let mn=NaN,mx=NaN;
  const adota=(a,b)=>{a=Number(a);b=Number(b);if(Number.isFinite(a)&&Number.isFinite(b)&&b>=a){mn=a;mx=b;}};
  try{
    const mds=img&&typeof img.getGDALMetadata==='function'
      ?[img.getGDALMetadata(0),img.getGDALMetadata()]:[];
    for(const md of mds)if(md&&typeof md.then!=='function'&&!Number.isFinite(mn)){
      const acha=(obj,nome)=>{
        if(!obj||typeof obj!=='object')return undefined;
        const k=Object.keys(obj).find(q=>String(q).toUpperCase()===nome);
        if(k!==undefined)return obj[k];
        for(const v of Object.values(obj)){if(v&&typeof v==='object'){const x=acha(v,nome);if(x!==undefined)return x;}}
      };
      adota(acha(md,'STATISTICS_MINIMUM'),acha(md,'STATISTICS_MAXIMUM'));
    }
  }catch(e){}
  const fd=img&&img.fileDirectory||{};
  if(!Number.isFinite(mn)&&fd.SMinSampleValue!=null&&fd.SMaxSampleValue!=null){
    const first=v=>Array.isArray(v)||ArrayBuffer.isView(v)?v[0]:v;
    adota(first(fd.SMinSampleValue),first(fd.SMaxSampleValue));
  }
  if(!Number.isFinite(mn)&&typeof fd.GDAL_METADATA==='string'){
    const xml=fd.GDAL_METADATA,valor=nome=>{
      const m=new RegExp('<Item[^>]*name=["\\\']'+nome+'["\\\'][^>]*>([^<]+)','i').exec(xml);
      return m&&m[1];
    };
    adota(valor('STATISTICS_MINIMUM'),valor('STATISTICS_MAXIMUM'));
  }
  return Number.isFinite(mn)&&Number.isFinite(mx)?{mn,mx,exact:true}:null;
}
async function parseTIFF(src,control){
  await rasterImportWait(ensureGeoTIFF(),control);
  const tiff=await rasterImportOpen(src,control);

  const img0=await rasterImportWait(tiff.getImage(0),control);
  const nc0=img0.getWidth(), nr0=img0.getHeight();
  const bb=img0.getBoundingBox();
  if(!bb || bb.some(v=>!isFinite(v))) throw new Error('GeoTIFF sem georreferência (tiepoint/pixel scale)');

  // grade de destino
  const preview=globalThis.GeoMineLargeRasterPreview;
  const cellBudget=preview?preview.cellBudget(nc0,nr0,RASTER_FILE_PREVIEW_CELLS):RASTER_FILE_PREVIEW_CELLS;
  const fct=Math.max(1, Math.ceil(Math.sqrt((nc0*nr0)/cellBudget)));
  const nc=Math.max(2,Math.floor(nc0/fct)), nr=Math.max(2,Math.floor(nr0/fct));

  // escolher a melhor pirâmide (overview) disponível
  let img=img0, lvl=0;
  try{
    const n=await rasterImportWait(tiff.getImageCount(),control);
    for(let i=1;i<n;i++){
      const im=await rasterImportWait(tiff.getImage(i),control);
      const w=im.getWidth(), h=im.getHeight();
      if(w>=nc && h>=nr && w<img.getWidth()){ img=im; lvl=i; }
    }
  }catch(e){if(e&&['AbortError','TimeoutError','NotReadableError'].includes(e.name))throw e; /* sem overviews */ }
  const W=img.getWidth(), H=img.getHeight();

  let nd=null;
  try{ nd=img0.getGDALNoData(); }catch(e){}
  if(nd==null && img0.fileDirectory && img0.fileDirectory.GDAL_NODATA) nd=parseFloat(img0.fileDirectory.GDAL_NODATA);

  const csx=(bb[2]-bb[0])/nc, csy=(bb[3]-bb[1])/nr;
  if(Math.abs(csx-csy)/csx>0.05) toast('Aviso: pixels não quadrados ('+csx.toFixed(2)+'×'+csy.toFixed(2)+' m) — usando '+csx.toFixed(2));

  const z=new Float32Array(nc*nr);
  const rowsPerChunk=rasterImportRows(img,W,1);
  // blocos de origem por célula de destino (MÉDIA, não vizinho mais próximo:
  // vizinho mais próximo faz alias e come cristas/talvegues em MDE)
  const r0f = r => Math.min(H-1, Math.floor(r*H/nr));
  const r1f = r => Math.max(r0f(r)+1, Math.min(H, Math.floor((r+1)*H/nr)));
  const c0a=new Int32Array(nc), c1a=new Int32Array(nc);
  for(let c=0;c<nc;c++){ c0a[c]=Math.min(W-1, Math.floor(c*W/nc));
    c1a[c]=Math.max(c0a[c]+1, Math.min(W, Math.floor((c+1)*W/nc))); }
  const bad = v => (nd!=null && v===nd) || !isFinite(v) || v<-1e30;
  let fonteMn=Infinity,fonteMx=-Infinity;

  let progress=0,lastPercent=-1;
  const sampled=preview?await rasterImportWait(preview.read(img,nc,nr,{
    isCurrent:()=>!(control&&control.signal&&control.signal.aborted)&&(!control||!control.isCurrent||control.isCurrent()),
    onProgress:({loaded,total})=>{
      progress=loaded;
      const pct=Math.floor(100*loaded/Math.max(1,total));
      if(pct!==lastPercent){lastPercent=pct;showLoad(`Lendo prévia GeoTIFF ${W}×${H} — ${pct}%`);}
    }
  }),{...control,progress:()=>progress}):null;
  if(sampled){
    for(let i=0;i<z.length;i++){
      const v=sampled[0][i];z[i]=bad(v)?NaN:v;
      if(!bad(v)){fonteMn=Math.min(fonteMn,v);fonteMx=Math.max(fonteMx,v);}
    }
  }

  let r=sampled?nr:0;
  while(r<nr){
    rasterImportCheck(control);
    const y0=r0f(r);
    let rEnd=r+1;
    while(rEnd<nr && (r1f(rEnd)-y0)<=rowsPerChunk) rEnd++;
    const y1=r1f(rEnd-1);
    showLoad(`Lendo GeoTIFF ${W}×${H}${lvl?` (pirâmide ${lvl})`:''} — ${(100*r/nr).toFixed(0)}%`);
    await new Promise(rs=>setTimeout(rs,0));
    rasterImportCheck(control);
    const ras=await rasterImportWait(img.readRasters({samples:[0], window:[0,y0,W,y1],signal:control&&control.signal}),control);
    const band=ras[0];
    for(let rr=r; rr<rEnd; rr++){
      const sa=r0f(rr)-y0, sb=r1f(rr)-y0, dst=rr*nc;
      for(let c=0;c<nc;c++){
        const ca=c0a[c], cb=c1a[c];
        let sv=0, n=0;
        for(let sy=sa; sy<sb; sy++){ const off=sy*W;
          for(let sx=ca; sx<cb; sx++){ const v=band[off+sx]; if(!bad(v)){
            sv+=v; n++;if(v<fonteMn)fonteMn=v;if(v>fonteMx)fonteMx=v;
          } } }
        z[dst+c]= n? sv/n : NaN;
      }
    }
    r=rEnd;
  }
  rasterImportCheck(control);
  if(fct>1 || lvl)
    toast(`GeoTIFF ${nc0}×${nr0} → ${nc}×${nr} em tela (${sampled?'prévia amostrada':'média de bloco'}) · original preservado para detalhes e produtos`);
  // handles do ORIGINAL: permitem relê-lo em resolução plena (demFull / demWindow)
  /* csy é guardado à parte quando difere de csx. Motivo: nr vem de
     floor(nr0/fct) e, quando nr0 não é divisível por fct, nr*csx fica MENOR
     que a altura real do GeoTIFF. Declarando a grade só com csx, a imagem era
     desenhada comprimida na vertical — deslocamento nulo na base e máximo no
     topo (0,72 m no MDT do Ciplan). Crista e pé saíam fora do lugar.        */
  /* CRS declarado pelo próprio arquivo (GeoKeys). Até agora o app ignorava
     isto e assumia sempre o CRS de trabalho — quando o arquivo vem de outro
     sistema, ou não declara nada, o raster ia parar do outro lado do mundo. */
  let srcCRS=null;
  try{
    const gk=img0.geoKeys||{};
    const cod = (gk.ProjectedCSTypeGeoKey && gk.ProjectedCSTypeGeoKey!==32767) ? gk.ProjectedCSTypeGeoKey
              : (gk.GeographicTypeGeoKey && gk.GeographicTypeGeoKey!==32767) ? gk.GeographicTypeGeoKey : null;
    if(cod) srcCRS='EPSG:'+cod;
  }catch(e){}
  /* csy é guardado SEMPRE que difere de csx, sem limiar. Um limiar de 0,1 mm
     por célula fazia a altura da grade deixar de reproduzir a do TIFF: a borda
     norte ficava deslocada em até nr × 0,1 mm, e o próprio arquivo original
     era depois recusado na conferência de área ao ser religado. */
  const csyGuardar = csy!==csx ? csy : undefined;   // sem limiar: a extensão da grade reproduz a do TIFF
  const declarados=geotiffDeclaredStats(img0),observados=
    Number.isFinite(fonteMn)&&Number.isFinite(fonteMx)?{mn:fonteMn,mx:fonteMx,exact:lvl===0&&!sampled}:null;
  /* Mesmo metadado declarado pode estar desatualizado. Inclua sempre o que
     foi de fato observado na leitura para nunca saturar um valor conhecido. */
  const fonteStats=declarados&&observados
    ?{mn:Math.min(declarados.mn,observados.mn),mx:Math.max(declarados.mx,observados.mx),exact:declarados.exact}
    :(declarados||observados);
  return {nc,nr,cs:csx,csy:csyGuardar,xll:bb[0],yll:bb[1],z,
    srcCRS, srcDims:[nc0,nr0], resampled:fct, ovr:lvl, previewMethod:sampled?'sampled':'mean',
          _tiff:tiff, _img0:img0, _W0:nc0, _H0:nr0, _bb:bb.slice(), _nd:nd,
          _sourceStats:fonteStats, _full:null};
}

/* ---------------------------------------------------------------------------
   demFull — grade NATIVA do GeoTIFF, relida do arquivo original.
   Chamada por todo produto (perfil, curvas, Z, plotagem). Resultado em cache.
   --------------------------------------------------------------------------- */
async function demFull(d, linhas){
  if(!d) return d;
  if(d._full) return d._full;
  if(!d._img0 || !(d.resampled>1)) return d;              // já está no nativo
  const W=d._W0, H=d._H0, bb=d._bb, nd=d._nd;
  if(W*H > FULL_MAX_CELLS){
    /* régua e perfil dizem por onde passam: lê o original só nesse trecho */
    if(linhas){
      try{ const t=await demTrecho(d, linhas); if(t) return t; }
      catch(e){ hideLoad(); toast('Não foi possível ler o trecho no original: '+((e&&e.message)||e)+' — mantida a grade de tela'); return d; }
    }
    toast(`Grade nativa ${W}×${H} acima do teto (${(FULL_MAX_CELLS/1e6)|0} M células) — mantida a grade de tela`);
    return d;
  }
  if(d._fullLoading)return d._fullLoading;
  const loading=(async()=>{
  await ensureGeoTIFF();
  const img=d._img0;
  const z=new Float32Array(W*H);
  const rows=Math.max(1, Math.floor(TIFF_CHUNK_SAMPLES/Math.max(1,W)));
  const bad = v => (nd!=null && v===nd) || !isFinite(v) || v<-1e30;
  for(let y0=0; y0<H; y0+=rows){
    const y1=Math.min(H, y0+rows);
    showLoad(`Resolução plena ${W}×${H} — ${(100*y0/H).toFixed(0)}%`);
    await new Promise(rs=>setTimeout(rs,0));
    const ras=await img.readRasters({samples:[0], window:[0,y0,W,y1]});
    const band=ras[0], n=(y1-y0)*W, off=y0*W;
    for(let k=0;k<n;k++){ const v=band[k]; z[off+k]= bad(v)? NaN : v; }
  }
  hideLoad();
  const cs=(bb[2]-bb[0])/W, csyN=(bb[3]-bb[1])/H;
  d._full={nc:W, nr:H, cs, csy:(csyN!==cs?csyN:undefined),
           xll:bb[0], yll:bb[1], z, native:true};
  if(typeof projectNativeMarkFullCache==='function')projectNativeMarkFullCache(d,d._full,img);
  return d._full;
  })();
  d._fullLoading=loading;
  try{return await loading;}finally{if(d._fullLoading===loading)delete d._fullLoading;try{hideLoad();}catch(e){}}
}
/* ---------------------------------------------------------------------------
   demTrecho — grade NATIVA só ao longo de uma linha.
   MDT acima do teto da grade plena (o mosaico de 1 m de Braço do Norte tem
   199 M células) não cabe inteiro na memória, e régua e perfil caíam na grade
   de tela. Eles só precisam do original ao longo do traçado: lê os blocos de
   128×128 células que a linha toca, com folga de 3 células para a
   interpolação, e devolve uma grade com a geometria nativa INTEIRA em que as
   células fora dos blocos lidos valem NaN — sampleZbil, drapeSeg e o perfil
   leem z[lin*nc+col] como em qualquer grade. Blocos ficam em cache por MDT.
   linhas: [[ [E,N], ... ], ...] no CRS de trabalho.
   --------------------------------------------------------------------------- */
const TRECHO_BLOCO=128, TRECHO_MAX_BLOCOS=4096;          // 4096 × 64 KB ≈ 256 MB
const _demTrecho=new WeakMap();
async function demTrecho(d, linhas){
  if(!d||!d._img0||!(d.resampled>1)||!Array.isArray(linhas)) return null;
  const W=d._W0, H=d._H0, bb=d._bb, nd=d._nd, B=TRECHO_BLOCO;
  if(!(W>0&&H>0)||!bb) return null;
  const cs=(bb[2]-bb[0])/W, csy=(bb[3]-bb[1])/H, nbx=Math.ceil(W/B);
  let C=_demTrecho.get(d);
  if(!C||C.img!==d._img0){ C={img:d._img0, blocos:new Map()}; _demTrecho.set(d,C); }
  /* blocos tocados: a linha é percorrida a cada meia célula */
  // srcCRS is TIFF provenance. Unreprojected rasters are displayed in the
  // working CRS; use that same interpretation to select native tiles.
  const alvo=d.crs||S.workCRS;
  let conv=null;
  try{ if(alvo&&String(alvo)!==String(S.workCRS)) conv=proj4(S.workCRS,alvo); }catch(_){}
  const precisa=new Set(), F=3;
  const marca=(x,y)=>{
    if(conv){ const q=conv.forward([x,y]); x=q[0]; y=q[1]; }
    const c=Math.floor((x-bb[0])/cs), r=Math.floor((bb[3]-y)/csy);
    if(c<-F||r<-F||c>=W+F||r>=H+F) return;
    const c0=Math.max(0,c-F), c1=Math.min(W-1,c+F), r0=Math.max(0,r-F), r1=Math.min(H-1,r+F);
    for(let by=Math.floor(r0/B); by<=Math.floor(r1/B); by++)
      for(let bx=Math.floor(c0/B); bx<=Math.floor(c1/B); bx++) precisa.add(by*nbx+bx);
  };
  const passo=Math.min(cs,csy)/2;
  for(const L of linhas){
    if(!Array.isArray(L)) continue;
    const P=L.filter(p=>p&&Number.isFinite(p[0])&&Number.isFinite(p[1]));
    if(P.length===1) marca(P[0][0],P[0][1]);
    for(let i=1;i<P.length;i++){
      const a=P[i-1], b=P[i], n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/passo));
      for(let k=0;k<=n;k++) marca(a[0]+(b[0]-a[0])*k/n, a[1]+(b[1]-a[1])*k/n);
      if(precisa.size>TRECHO_MAX_BLOCOS) return null;     // linha longa demais
    }
  }
  if(!precisa.size) return null;
  const faltam=[...precisa].filter(k=>!C.blocos.has(k));
  if(C.blocos.size+faltam.length>TRECHO_MAX_BLOCOS){     // cache cheio: guarda só o que esta linha usa
    for(const k of [...C.blocos.keys()]) if(!precisa.has(k)) C.blocos.delete(k);
  }
  const bad=v=>(nd!=null && v===nd) || !isFinite(v) || v<-1e30;
  const ler=async k=>{
    const by=Math.floor(k/nbx), bx=k-by*nbx, l=bx*B, t=by*B, w=Math.min(B,W-l), h=Math.min(B,H-t);
    const opt={samples:[0], window:[l,t,l+w,t+h]};
    const ras=(window.GeoMineTileRuntime&&typeof GeoMineTileRuntime.read==='function')
      ? await GeoMineTileRuntime.read(C.img,opt,{priority:-1})
      : await C.img.readRasters(opt);
    const src=ras[0], v=new Float32Array(w*h);
    for(let i=0;i<w*h;i++){ const z=src[i]; v[i]=bad(z)?NaN:z; }
    C.blocos.set(k,{l,t,w,v});
  };
  if(faltam.length){
    await ensureGeoTIFF();
    const aviso=faltam.length>8;
    for(let i=0;i<faltam.length;i+=8){
      if(aviso) showLoad(`Lendo o original ao longo da linha — ${(100*i/faltam.length).toFixed(0)}%`);
      await Promise.all(faltam.slice(i,i+8).map(ler));
    }
    if(aviso) hideLoad();
  }
  const blocos=C.blocos;
  const z=new Proxy({},{get(_,k){
    if(typeof k!=='string') return undefined;
    if(k==='length') return W*H;
    const i=+k; if(!Number.isInteger(i)||i<0||i>=W*H) return undefined;
    const r=Math.floor(i/W), c=i-r*W, b=blocos.get(Math.floor(r/B)*nbx+Math.floor(c/B));
    return b? b.v[(r-b.t)*b.w+(c-b.l)] : NaN;
  }});
  return {nc:W, nr:H, cs, csy:(csy!==cs?csy:undefined), xll:bb[0], yll:bb[1], z,
          native:true, _trecho:true, crs:d.crs, srcCRS:d.srcCRS, _nd:nd};
}
/* ---------------------------------------------------------------------------
   FONTE ORIGINAL DA SUPERFÍCIE
   Um perfil é produto de engenharia: tem de sair da grade BRUTA, nunca da grade
   reduzida de tela (que arredonda crista de banqueta em ~1 m e desloca o Z).
   Ordem de busca: cache em memória → handle guardado no IndexedDB → pedir ao
   usuário para indicar o arquivo.
   --------------------------------------------------------------------------- */
function fonteKey(r){
  const d=r.d||{};
  return 'src:'+Math.round(d.xll)+':'+Math.round(d.yll)+':'+Math.round(d.nc*d.cs);
}
/* ASSINATURA DE CONTEÚDO do MDT: identifica o arquivo pelo que ele CONTÉM, não
   pelo nome. Combina dimensões nativas + extensão geográfica + amostra de cotas
   numa grade fixa 8×8. Dois arquivos com a mesma assinatura são o mesmo dado,
   ainda que renomeados. Tolerante a arredondamento (cotas em dm).            */
function assinaturaMDT(d){
  if(!d || !d.z) return null;
  const W=d._W0||d.nc, H=d._H0||d.nr;
  const ext=[Math.round(d.xll), Math.round(d.yll),
             Math.round(d.xll+d.nc*d.cs), Math.round(d.yll+d.nr*(d.csy||d.cs))];
  // amostra 8×8 pontos da grade EM MEMÓRIA (dm de precisão p/ tolerar reamostragem leve)
  const amostra=[];
  const nc=d.nc, nr=d.nr, z=d.z;
  for(let i=0;i<8;i++) for(let j=0;j<8;j++){
    const c=Math.floor((j+0.5)*nc/8), rr=Math.floor((i+0.5)*nr/8);
    const v=z[rr*nc+c];
    amostra.push(isFinite(v)? Math.round(v*10) : -99999);
  }
  return { dims:[W,H], ext, amostra, srcDims:d.srcDims||[d.nc,d.nr] };
}
/* compara duas assinaturas: mesma extensão (tolerância) + amostras próximas */
function assinaturaBate(a, b){
  if(!a || !b) return false;
  // extensão: tolera 2 m
  for(let k=0;k<4;k++){ if(Math.abs(a.ext[k]-b.ext[k])>2) return false; }
  // amostra: a maioria dos pontos válidos deve casar (±0,5 m = ±5 dm)
  if(!a.amostra || !b.amostra || a.amostra.length!==b.amostra.length) return false;
  let ok=0, tot=0;
  for(let k=0;k<a.amostra.length;k++){
    const va=a.amostra[k], vb=b.amostra[k];
    if(va===-99999 || vb===-99999) continue;      // NoData num dos dois: ignora
    tot++; if(Math.abs(va-vb)<=5) ok++;
  }
  return tot>0 && ok/tot >= 0.85;                  // 85% das amostras batem
}
async function lembraFonte(r,h){
  const project=S.projectId,generation=window.GeoMineSessionAutosave?.state?.generation;
  if(h)try{await idbSet(fonteKey(r),h);}catch(_){}
  if(S.projectId!==project||window.GeoMineSessionAutosave?.state?.generation!==generation||!(S.rasters||[]).includes(r))return;
  try{await window.GeoMineOriginalSources?.remember(r,'raster',h,r._projectSourceRaw);}catch(_){}
}
async function recuperaFonte(r){ try{ return await idbGet(fonteKey(r)); }catch(_){ return null; } }
/* true quando a grade em memória NÃO serve como dado bruto */
function precisaFonte(d){
  if(!d) return false;
  if(d.native || d._full) return false;
  if(d.resampled>1) return true;
  if(d.fromProject && d.resampled==null) return true;   // projeto antigo: procedência desconhecida
  return false;
}
/* Substitui a grade do raster pela recém-lida do original (corrige de quebra o
   meio-bloco de deslocamento dos projetos gravados por versões antigas). */
/* Mesma área? Tolerância de 3 células (ou 3 m), que absorve o arredondamento
   da grade de tela sem deixar passar um arquivo de outro local.             */
function mesmaArea(a, b){
  const tol=Math.max(3*(b.cs||1), 3);
  return Math.abs(a.xll-b.xll)<=tol && Math.abs(a.yll-b.yll)<=tol &&
         Math.abs(a.nc*a.cs - b.nc*b.cs)<=tol && Math.abs(a.nr*(a.csy||a.cs) - b.nr*(b.csy||b.cs))<=tol;
}
/* O GeoTIFF pode JÁ estar aberto nesta sessão, em outra superfície ou no MDE do
   Hidro. Nesse caso pedir o arquivo de novo é só incômodo: basta emprestar os
   handles de quem já o tem em mãos.                                          */
function fonteIrma(r){
  const d=r&&r.d;if(!d)return null;
  // Extensão igual não significa terreno igual (conciliação, infraestrutura,
  // corte/aterro podem compartilhar exatamente os mesmos limites).
  for(const other of S.rasters||[]){
    if(other===r||!other.d?._img0)continue;
    const sharedRaw=r._projectSourceRaw&&r._projectSourceRaw===other._projectSourceRaw;
    const a=r.projectNativeSource,b=other.projectNativeSource;
    const sameDescriptor=a&&b&&a.fingerprint===b.fingerprint&&a.size===b.size&&
      projectNativeRestoreAllowed(r,'raster')&&projectNativeRestoreAllowed(other,'raster');
    if((sharedRaw||sameDescriptor)&&projectNativeRasterSourceCurrent(other)&&mesmaArea(other.d,d))return other.d;
  }
  return null;
}
function adotaFonte(r, q){
  ['_tiff','_img0','_W0','_H0','_bb','_nd','_sourceStats'].forEach(k=>{ r.d[k]=q[k]; });
  if(q.srcDims) r.d.srcDims=q.srcDims;
  if(q.resampled) r.d.resampled=q.resampled;
  r.d.fromProject=false;
  return r.d;
}
/* Legacy projects have no byte fingerprint yet. Verify their saved mean
   preview against small windows of the SAME TIFF overview, never a fresh
   full preview. Limits cover physical compressed/decoded blocks as well as
   output pixels; a 1-pixel window may otherwise decode a multi-GB strip. */
const RASTER_LEGACY_VERIFY_LIMITS=Object.freeze({
  images:16,headerBlocks:1000000,headerBytes:16*1024*1024,previewPixels:12000000,windows:256,
  windowPixels:16384,totalPixels:1048576,windowBlocks:64,minValid:16,
  decodedBlockBytes:8*1024*1024,compressedBlockBytes:8*1024*1024,workingBytes:32*1024*1024,
  totalDecodedBytes:256*1024*1024,totalCompressedBytes:128*1024*1024,fallbackPixels:1000000
});
function rasterLegacyUnsupported(reason,safeFallback=false){return {status:'unsupported',reason,safeFallback};}
function rasterLegacyMismatch(reason){return {status:'mismatch',reason,safeFallback:false};}
function rasterLegacyArray(value){
  return Array.isArray(value)||ArrayBuffer.isView(value)?value:Number.isSafeInteger(value)?[value]:null;
}
function rasterLegacyEPSG(value){
  const match=/^(?:EPSG:)?(\d+)$/i.exec(String(value||'').trim());
  const number=match&&Number(match[1]);return Number.isSafeInteger(number)&&number>0&&number!==32767?number:null;
}
function rasterLegacyBlockCost(layout,bx,by){
  const index=by*layout.across+bx,offset=Number(layout.offsets[index]),compressed=Number(layout.counts[index]);
  const height=layout.tiled?layout.th:Math.min(layout.th,layout.height-by*layout.th);
  const decoded=layout.tw*height*layout.bytesPerPixel;
  return {offset,compressed,decoded,working:3*decoded+2*compressed};
}
async function rasterLegacyImageLayout(image,fileSize,control){
  const L=RASTER_LEGACY_VERIFY_LIMITS,fd=image.fileDirectory||image.getFileDirectory?.()||{},
    width=Number(image.getWidth()),height=Number(image.getHeight()),samples=Number(image.getSamplesPerPixel()),
    bits=rasterLegacyArray(fd.BitsPerSample),tiled=fd.TileOffsets!=null,
    tw=Number(tiled?fd.TileWidth:width),th=Number(tiled?fd.TileLength:fd.RowsPerStrip||height),
    offsets=rasterLegacyArray(tiled?fd.TileOffsets:fd.StripOffsets),
    counts=rasterLegacyArray(tiled?fd.TileByteCounts:fd.StripByteCounts);
  if(![width,height,tw,th].every(v=>Number.isSafeInteger(v)&&v>0)||samples!==1||
     !bits||bits.length!==1||![8,16,32,64].includes(Number(bits[0]))||!offsets||!counts)
    return null;
  const across=Math.ceil(width/tw),down=Math.ceil(height/th),blocks=across*down,
    bytesPerPixel=Number(bits[0])/8,outputBytes=Math.max(4,bytesPerPixel);
  if(!Number.isSafeInteger(blocks)||blocks>L.headerBlocks||offsets.length!==blocks||counts.length!==blocks)return null;
  const layout={image,width,height,tiled,tw,th,across,down,offsets,counts,bytesPerPixel,outputBytes};
  for(let index=0;index<blocks;index++){
    if(index%16384===0){rasterImportCheck(control);if(index)await new Promise(resolve=>setTimeout(resolve,0));}
    const cost=rasterLegacyBlockCost(layout,index%across,Math.floor(index/across));
    if(!Number.isSafeInteger(cost.offset)||!Number.isSafeInteger(cost.compressed)||cost.offset<0||cost.compressed<0||
       ((cost.offset===0)!==(cost.compressed===0))||!Number.isSafeInteger(cost.offset+cost.compressed)||
       cost.offset+cost.compressed>fileSize||!Number.isSafeInteger(cost.decoded)||cost.decoded<=0||
       cost.decoded>L.decodedBlockBytes||cost.compressed>L.compressedBlockBytes||cost.working>L.workingBytes)return null;
  }
  return layout;
}
function rasterLegacyWindowCost(layout,window,blockLimit=RASTER_LEGACY_VERIFY_LIMITS.windowBlocks){
  const [left,top,right,bottom]=window;
  if(!window.every(Number.isSafeInteger)||left<0||top<0||right>layout.width||bottom>layout.height||right<=left||bottom<=top)return null;
  const x0=Math.floor(left/layout.tw),y0=Math.floor(top/layout.th),x1=Math.ceil(right/layout.tw),y1=Math.ceil(bottom/layout.th),
    blocks=(x1-x0)*(y1-y0),pixels=(right-left)*(bottom-top);
  if(blocks>blockLimit||!Number.isSafeInteger(pixels))return null;
  let decoded=0,compressed=0;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
    const cost=rasterLegacyBlockCost(layout,x,y);decoded+=cost.decoded;compressed+=cost.compressed;
  }
  return {pixels,blocks,decoded,compressed,working:3*decoded+2*compressed+pixels*layout.outputBytes};
}
async function rasterLegacyProofPoints(d,control){
  const L=RASTER_LEGACY_VERIFY_LIMITS,nc=d.nc,nr=d.nr,z=d.z,cells=nc*nr;
  if(!Number.isSafeInteger(nc)||nc<1||!Number.isSafeInteger(nr)||nr<1||!Number.isSafeInteger(cells)||
     cells>L.previewPixels||!z||z.length!==cells)return null;
  const divisions=16,valid=new Array(256),empty=new Array(256);
  let validCount=0,min=Infinity,max=-Infinity,minIndex=-1,maxIndex=-1;
  for(let row=0;row<nr;row++){
    if(row%32===0){rasterImportCheck(control);await new Promise(resolve=>setTimeout(resolve,0));}
    const gy=Math.min(15,Math.floor(row*divisions/nr)),cy=(gy+.5)*nr/divisions;
    for(let col=0;col<nc;col++){
      const index=row*nc+col,value=z[index],finite=Number.isFinite(value),gx=Math.min(15,Math.floor(col*divisions/nc)),
        cell=gy*divisions+gx,cx=(gx+.5)*nc/divisions,distance=(row+.5-cy)**2+(col+.5-cx)**2,slots=finite?valid:empty;
      if(!slots[cell]||distance<slots[cell].distance)slots[cell]={index,distance};
      if(finite){validCount++;if(value<min){min=value;minIndex=index;}if(value>max){max=value;maxIndex=index;}}
    }
  }
  if(validCount<L.minValid)return null;
  const chosen=new Map(),add=index=>{
    if(index>=0&&!chosen.has(index))chosen.set(index,{row:Math.floor(index/nc),col:index%nc,expected:z[index]});
  };
  const distributed=(slots,limit)=>{
    const rows=slots.filter(Boolean),count=Math.min(limit,rows.length);
    for(let i=0;i<count;i++)add(rows[Math.floor((i+.5)*rows.length/count)].index);
  };
  distributed(valid,144);add(minIndex);add(maxIndex);distributed(empty,32);
  for(let row=0;row<8;row++)for(let col=0;col<8;col++)add(Math.floor((row+.5)*nr/8)*nc+Math.floor((col+.5)*nc/8));
  // Very sparse small extents may occupy few strata. Add evenly spaced valid
  // cells instead of accepting fewer than the minimum content comparisons.
  let selectedValid=[...chosen.values()].filter(p=>Number.isFinite(p.expected)).length;
  if(selectedValid<L.minValid){
    const target=Math.min(32,validCount),step=validCount/target;let ordinal=0,next=.5*step;
    for(let index=0;index<cells;index++)if(Number.isFinite(z[index])){
      if(ordinal>=Math.floor(next)){add(index);next+=step;}ordinal++;
    }
    selectedValid=[...chosen.values()].filter(p=>Number.isFinite(p.expected)).length;
  }
  if(selectedValid<L.minValid||chosen.size>L.windows)return null;
  return {points:[...chosen.values()],validCount,validSamples:selectedValid,nodataSamples:chosen.size-selectedValid};
}
function rasterLegacyFloatMatches(actual,expected){
  if(!Number.isFinite(actual)||!Number.isFinite(expected))return !Number.isFinite(actual)&&!Number.isFinite(expected);
  const floats=new Float32Array(2),bits=new Uint32Array(floats.buffer);floats[0]=actual;floats[1]=expected;
  const ordered=value=>(value&0x80000000)?0x80000000-(value&0x7fffffff):0x80000000+value;
  return Math.abs(ordered(bits[0])-ordered(bits[1]))<=2;
}
async function rasterVerifyLegacyPreview(r,file,tiff,control={}){
  const L=RASTER_LEGACY_VERIFY_LIMITS,d=r.d,expectedSize=Number(r.src?.size),
    unsupported=reason=>rasterLegacyUnsupported(reason,false);
  rasterImportCheck(control);
  /* control.otherFile: a pessoa escolheu um .tif que não é o arquivo gravado
     no projeto (outro tamanho em bytes). CRS e área continuam obrigatórios;
     com as mesmas dimensões, as cotas são conferidas como sempre; com outra
     resolução não há prova automática e quem chamou pergunta à pessoa. */
  const otherFile=control.otherFile===true;
  if(!otherFile&&expectedSize>0&&file.size!==expectedSize)return rasterLegacyMismatch('o tamanho do arquivo não confere com o original gravado');
  if(!Number.isSafeInteger(file.size)||file.size<=0)return unsupported('o tamanho do arquivo não está disponível');
  const images=[],layouts=[];let headerBlocks=0,headerBytes=0;
  for(let index=0;index<=L.images;index++){
    let image;
    try{image=await rasterImportWait(tiff.getImage(index),control);}
    catch(error){
      if(index>0&&['Error','RangeError'].includes(error?.name)&&error.message==='No image at index '+index)break;
      throw error;
    }
    if(index===L.images)return unsupported('o TIFF excede o limite de imagens internas para esta conferência');
    images.push(image);
    const fd=image.fileDirectory||image.getFileDirectory?.()||{};
    // Offset/count arrays from earlier IFDs remain alive with the TIFF. Bound
    // their aggregate, including masks, rather than granting each IFD a fresh budget.
    const offsets=rasterLegacyArray(fd.TileOffsets??fd.StripOffsets);
    headerBlocks+=offsets?.length||0;
    for(const value of Object.values(fd))headerBytes+=typeof value==='string'?value.length*2:
      ArrayBuffer.isView(value)?value.byteLength:Array.isArray(value)?value.length*8:8;
    if(headerBlocks>L.headerBlocks||headerBytes>L.headerBytes)
      return unsupported('os índices acumulados do TIFF excedem o limite seguro de memória');
    // The tile renderer skips mask IFDs. Every other possible source level
    // must be safe before attachment, not only the overview sampled below.
    if(index>0&&((Number(fd.NewSubfileType)||0)&4)){layouts.push(null);continue;}
    const layout=await rasterLegacyImageLayout(image,file.size,control);
    if(!layout)return unsupported('os blocos físicos ou metadados do TIFF excedem o limite seguro de leitura');
    layouts.push(layout);
  }
  rasterImportCheck(control);
  const base=images[0],layout0=layouts[0];
  if(!base||!layout0)return unsupported('o TIFF não contém uma grade nativa válida');
  const W=layout0.width,H=layout0.height,bb=base.getBoundingBox(),
    fd=base.fileDirectory||base.getFileDirectory?.()||{},keys=base.getGeoKeys?.()||base.geoKeys||{},
    actualCRS=rasterLegacyEPSG(keys.ProjectedCSTypeGeoKey||keys.GeographicTypeGeoKey),
    expectedCRS=rasterLegacyEPSG(d.srcCRS||d.crs||S.workCRS),
    sig=control.expectedSignature||d._sig||r.src?.sig,
    dimensions=d.srcDims||sig?.srcDims||sig?.dims;
  if(!bb||bb.length!==4||bb.some(value=>!Number.isFinite(value))||!(bb[2]>bb[0]&&bb[3]>bb[1]))return unsupported('a extensão do TIFF não é válida');
  const otherDims=!!(dimensions&&dimensions.length===2&&dimensions.every(value=>Number.isSafeInteger(value)&&value>0)&&
     (dimensions[0]!==W||dimensions[1]!==H));
  if(otherDims&&!otherFile)return rasterLegacyMismatch('as dimensões nativas não conferem com a superfície gravada');
  if(actualCRS&&expectedCRS&&actualCRS!==expectedCRS)return rasterLegacyMismatch('o CRS do TIFF não confere com o CRS da superfície');
  /* EXTENSÃO. A grade guardada no projeto não reproduz a do TIFF ao mícron: a
     altura da célula (csy) deixava de ser gravada quando diferia da largura em
     até 0,1 mm, e isso desloca a borda norte em até nr × 0,1 mm; coordenadas
     regravadas também perdem casas. Recusar por isso impedia religar o arquivo
     certo. Agora: diferença de até UMA CÉLULA DA PRÉVIA é a mesma área, e quem
     prova que é o mesmo levantamento é a conferência das cotas, mais abaixo.
     Acima disso o arquivo é de outra área, e a mensagem diz quanto difere. */
  const stored=[d.xll,d.yll,d.xll+d.nc*d.cs,d.yll+d.nr*(d.csy||d.cs)];
  if(stored.some(value=>!Number.isFinite(value)))return rasterLegacyMismatch('a superfície gravada não tem extensão válida');
  const extentDiff=Math.max(...stored.map((value,index)=>Math.abs(value-bb[index]))),
    sameArea=Math.max(d.cs,d.csy||d.cs);
  if(extentDiff>sameArea)
    return rasterLegacyMismatch('a área do TIFF difere da superfície gravada em até '+extentDiff.toLocaleString('pt-BR',{maximumFractionDigits:2})+
      ' m (TIFF: X '+bb[0].toFixed(1)+'–'+bb[2].toFixed(1)+', Y '+bb[1].toFixed(1)+'–'+bb[3].toFixed(1)+
      '; superfície: X '+stored[0].toFixed(1)+'–'+stored[2].toFixed(1)+', Y '+stored[1].toFixed(1)+'–'+stored[3].toFixed(1)+')');
  const whole=W*H<=L.fallbackPixels?rasterLegacyWindowCost(layout0,[0,0,W,H],4096):null,
    safeFallback=!!whole&&whole.working<=L.workingBytes;
  /* Área, dimensões e CRS conferem, mas a prova automática pelas cotas não pôde
     ser feita: a pessoa decide se este é o original (confirmable). */
  const limited=reason=>({...rasterLegacyUnsupported(reason,safeFallback),confirmable:true,extentDiff,width:W,height:H});
  if(otherDims)return {...limited('o arquivo tem '+W.toLocaleString('pt-BR')+' × '+H.toLocaleString('pt-BR')+' células e a superfície foi criada de um arquivo de '+
    dimensions[0].toLocaleString('pt-BR')+' × '+dimensions[1].toLocaleString('pt-BR')),safeFallback:false,otherDims:true,expectedDims:[dimensions[0],dimensions[1]],
    cell:[(bb[2]-bb[0])/W,(bb[3]-bb[1])/H]};
  if(!actualCRS||!expectedCRS||!dimensions||dimensions.length!==2)return limited('faltam metadados para conferir CRS e dimensões nativas');
  const transform=fd.ModelTransformation;
  if((transform&&(Number(transform[1])!==0||Number(transform[4])!==0))||(fd.Orientation!=null&&Number(fd.Orientation)!==1))
    return limited('a orientação da grade exige uma conferência específica');
  if(d.previewMethod!=='mean'||!Number.isInteger(d.ovr)||d.ovr<0||d.ovr>=images.length||!layouts[d.ovr])
    return limited('a overview usada na prévia não está registrada ou não está disponível neste TIFF');
  if(!Number.isInteger(d.resampled)||d.resampled<1||Math.max(2,Math.floor(W/d.resampled))!==d.nc||Math.max(2,Math.floor(H/d.resampled))!==d.nr)
    return limited('a grade salva não informa a mesma redução usada na importação');
  const layout=layouts[d.ovr],image=images[d.ovr],width=layout.width,height=layout.height,
    lowerScale=Math.max(W/width,H/height),upperScale=Math.min(width>1?W/(width-1):Infinity,height>1?H/(height-1):Infinity);
  if(width<d.nc||height<d.nr||width>W||height>H||lowerScale>upperScale+1e-9)
    return limited('as dimensões da overview não correspondem à grade salva');
  const selected=await rasterLegacyProofPoints(d,control);
  if(!selected)return limited('não há amostras válidas suficientes dentro do limite de conferência');
  const reads=[];let pixels=0,decoded=0,compressed=0;
  for(const point of selected.points){
    const left=Math.min(width-1,Math.floor(point.col*width/d.nc)),top=Math.min(height-1,Math.floor(point.row*height/d.nr)),
      right=Math.max(left+1,Math.min(width,Math.floor((point.col+1)*width/d.nc))),
      bottom=Math.max(top+1,Math.min(height,Math.floor((point.row+1)*height/d.nr))),window=[left,top,right,bottom],cost=rasterLegacyWindowCost(layout,window);
    if(!cost||cost.pixels>L.windowPixels||cost.working>L.workingBytes)return limited('uma janela de conferência excede o limite seguro de leitura');
    pixels+=cost.pixels;decoded+=cost.decoded;compressed+=cost.compressed;
    if(pixels>L.totalPixels||decoded>L.totalDecodedBytes||compressed>L.totalCompressedBytes)return limited('a conferência excede o orçamento total de leitura');
    reads.push({point,window,cost});
  }
  let nd=base.getGDALNoData?.();if(nd==null&&fd.GDAL_NODATA!=null)nd=parseFloat(fd.GDAL_NODATA);
  const runtime=globalThis.GeoMineTileRuntime;
  for(let index=0;index<reads.length;index++){
    rasterImportCheck(control);const {point,window,cost}=reads[index];
    if(typeof showLoad==='function')showLoad('Conferindo amostras do original — '+Math.floor(100*index/reads.length)+'%');
    const options={samples:[0],window,signal:control.signal};
    const bands=await rasterImportWait(runtime?runtime.read(image,options,{isCurrent:control.isCurrent,priority:-100}):image.readRasters(options),control);
    const band=bands?.[0];
    if(!band||band.length!==cost.pixels)throw Error('O TIFF devolveu uma janela de conferência incompleta.');
    let sum=0,count=0;
    for(let k=0;k<band.length;k++){
      const value=band[k];if((nd!=null&&value===nd)||!Number.isFinite(value)||value<-1e30)continue;
      sum+=value;count++;
    }
    const actual=count?Math.fround(sum/count):NaN;
    if(!rasterLegacyFloatMatches(actual,point.expected))return rasterLegacyMismatch('as cotas ou a máscara NoData não conferem com a superfície gravada');
    if(index%8===7)await new Promise(resolve=>setTimeout(resolve,0));
  }
  rasterImportCheck(control);
  return {status:'verified',safeFallback:false,proof:{method:'mean-overview-v1',overview:d.ovr,
    validSamples:selected.validSamples,nodataSamples:selected.nodataSamples,windows:reads.length,pixels,
    decodedBytes:decoded,compressedBytes:compressed,headerBlocks,headerBytes}};
}
async function religaFonte(r, file,options={}){
  if(!r||!r.d||!file)return false;
  const projeto=S.projectId,generation=window.GeoMineSessionAutosave?.state?.generation,
    account=window.GeoMineCloudProvider?.user?.uid||'offline',crs=S.workCRS,
    gradeAnterior=r.d,previousPreview=projectNativePreview(r,'raster'),
    originalSource=r.originalSource,nativeSource=r.projectNativeSource,
    identity=projectNativeRasterIdentity(r),raw=r._projectSourceRaw,
    pertencia=(S.rasters||[]).includes(r);
  const current=()=>!options.signal?.aborted&&S.projectId===projeto&&S.workCRS===crs&&
    window.GeoMineSessionAutosave?.state?.generation===generation&&
    (window.GeoMineCloudProvider?.user?.uid||'offline')===account&&r.d===gradeAnterior&&r._projectSourceRaw===raw&&
    r.originalSource===originalSource&&r.projectNativeSource===nativeSource&&projectNativeRasterIdentity(r)===identity&&
    (!pertencia||(S.rasters||[]).includes(r))&&(!options.isCurrent||options.isCurrent());
  const unchanged=()=>current()&&projectNativePreview(r,'raster')===previousPreview;
  const control={...options,isCurrent:current};
  let temporary=null,committed=false;
  /* Toda recusa fica registrada na camada: o aviso rápido some em segundos e a
     pessoa ficava sem saber por que o MDT continuava "não aberto". As janelas
     (propriedades do MDT, área contribuinte) mostram este motivo. */
  const recusa=mensagem=>{try{Object.defineProperty(r,'_recusaOriginal',{value:{mensagem,arquivo:file.name,em:Date.now()},configurable:true,enumerable:false,writable:true});}catch(_){}
    toast(mensagem);return false;};
  const megas=bytes=>(bytes/1048576).toLocaleString('pt-BR',{maximumFractionDigits:bytes<104857600?1:0})+' MB';
  /* outro: o arquivo escolhido NÃO é o gravado no projeto (ou o projeto perdeu
     o vínculo antigo). Em vez de recusar e deixar a pessoa sem MDT, segue para
     a conferência de CRS, área e cotas; sem prova automática, ela decide. */
  let outro='';
  try{
    if(!current())return false;
    try{delete r._recusaOriginal;}catch(_){}
    const descriptors=[
      originalSource?.v===1&&!originalSource.invalidated&&originalSource.kind==='raster'&&originalSource.preview===previousPreview?originalSource:null,
      nativeSource?.v===1&&!nativeSource.invalidated&&!r.projectSavePending&&nativeSource.preview===previousPreview?nativeSource:null
    ].filter(Boolean);
    if(!descriptors.length&&(
      originalSource?.v===1&&(originalSource.invalidated||originalSource.kind!=='raster'||originalSource.preview!==previousPreview)||
      nativeSource?.v===1&&(nativeSource.invalidated||nativeSource.preview!==previousPreview))){
      // A prévia foi regravada depois do vínculo (por exemplo, o projeto salvo
      // em outra resolução): o vínculo antigo não vale, mas o arquivo pode ser
      // conferido de novo contra a prévia atual.
      outro='A superfície foi regravada ou editada depois do último vínculo com o original, e “'+file.name+'” precisa ser confirmado de novo (se você editou cotas desta superfície, o arquivo original não contém essas edições)';
    }
    if(descriptors.length){
      // File inputs on iPad supply bytes, not reusable filesystem handles.
      // Confirm the saved byte identity before attaching only the TIFF index.
      const candidates=descriptors.filter(d=>d.size===file.size);
      const fingerprint=candidates.length?await rasterImportWait(projectNativeFingerprint(file),control):null;
      if(!unchanged())return false;
      const matched=candidates.find(d=>d.fingerprint===fingerprint);
      if(matched){
        const ok=await projectAttachNativeRaster(r,file,{...control,descriptor:matched===nativeSource?nativeSource:null});
        if(ok)toast('“'+r.name+'” religada ao original; prévia preservada e resolução nativa disponível.');
        return ok;
      }
      const gravado=descriptors[0];
      outro='“'+file.name+'” não é o mesmo arquivo gravado no projeto (“'+(gravado.name||'original')+'”, '+megas(gravado.size)+'; o escolhido tem '+megas(file.size)+')';
    }
    // A legacy project has no confirmed byte identity. Prove its mean preview
    // from bounded windows before attaching the original, without rebuilding Z.
    const sigGuardada=options.expectedSignature||gradeAnterior._sig||(r.src&&r.src.sig)||null;
    if(!outro&&Number(r.src?.size)>0&&file.size!==Number(r.src.size))
      outro='“'+file.name+'” não tem o tamanho do arquivo gravado no projeto ('+megas(Number(r.src.size))+'; o escolhido tem '+megas(file.size)+')';
    await rasterImportWait(ensureGeoTIFF(),control);rasterImportCheck(control);
    temporary=await rasterImportOpen(file,control);rasterImportCheck(control);
    const verification=await rasterVerifyLegacyPreview(r,file,temporary,{...control,otherFile:!!outro});
    if(!unchanged())return false;
    // Outro arquivo aceito: a camada passa a declarar as dimensões dele, para
    // as leituras nativas (Hidro, perfis) reconhecerem a fonte ao reabrir.
    const adotaDimensoes=()=>{if(outro&&verification.otherDims&&r.d)try{r.d.srcDims=[verification.width,verification.height];}catch(_){}};
    if(verification.status==='verified'){
      // projectAttachNativeRaster owns this TIFF, including an early abort.
      const ready=temporary;temporary=null;
      const ok=await projectAttachNativeRaster(r,file,{...control,tiff:ready});
      if(ok){
        window.GeoMineOriginalSources?.validated(r,'raster',previousPreview);
        toast('“'+r.name+'” conferida e ligada ao original, mantendo a grade e as coordenadas do projeto.');
      }
      return ok;
    }
    if(verification.status!=='mismatch'&&verification.confirmable&&(outro||!verification.safeFallback)){
      // Sem prova automática, mas a área, as dimensões e o CRS conferem: quem
      // conhece o levantamento decide. Nada do projeto é alterado ao recusar.
      // Mesmo tamanho em bytes do original gravado, mais área, dimensões e CRS
      // iguais: é o arquivo. Só pergunta quando o projeto não guardou o tamanho.
      const mesmoTamanho=!outro&&Number(r.src?.size)>0&&file.size===Number(r.src.size);
      const area='O arquivo cobre a mesma área da superfície'+(verification.extentDiff>0.001?' (diferença máxima de '+verification.extentDiff.toLocaleString('pt-BR',{maximumFractionDigits:3})+' m)':'')+
        ' e está no mesmo CRS.';
      const celula=verification.cell?' ('+verification.cell[0].toLocaleString('pt-BR',{maximumFractionDigits:3})+' × '+verification.cell[1].toLocaleString('pt-BR',{maximumFractionDigits:3})+' m por célula)':'';
      const pergunta=outro
        ?outro+'.\n\n'+area+'\nEle tem '+verification.width.toLocaleString('pt-BR')+' × '+verification.height.toLocaleString('pt-BR')+' células'+celula+
          (verification.otherDims?'; a superfície foi criada de um arquivo de '+verification.expectedDims[0].toLocaleString('pt-BR')+' × '+verification.expectedDims[1].toLocaleString('pt-BR')+' células':'')+'.\n\n'+
          'Usar ESTE arquivo como o original de “'+r.name+'”? As cotas lidas no mapa e os cálculos do Hidro passam a vir dele.'
        :'Não foi possível conferir automaticamente se “'+file.name+'” é o original de “'+r.name+'”:\n'+verification.reason+'.\n\n'+area+
          '\nEle tem '+verification.width.toLocaleString('pt-BR')+' × '+verification.height.toLocaleString('pt-BR')+' células.\n\nVincular este arquivo como o original?';
      const aceito=mesmoTamanho||confirm(pergunta);
      if(!unchanged())return false;
      if(aceito){
        const ready=temporary;temporary=null;
        const ok=await projectAttachNativeRaster(r,file,{...control,tiff:ready});
        if(ok){
          adotaDimensoes();
          window.GeoMineOriginalSources?.validated(r,'raster',previousPreview);
          toast('“'+r.name+'” ligada ao original escolhido, mantendo a grade e as coordenadas do projeto.');
        }
        return ok;
      }
      return recusa('“'+file.name+'” não foi vinculado (você respondeu que não). O projeto foi mantido.');
    }
    if(verification.status==='mismatch'||!verification.safeFallback||outro){
      return recusa('“'+file.name+'” não é o original de “'+r.name+'”: '+verification.reason+'. O projeto foi mantido.');
    }
    // Small files without reproducible overview metadata keep the established
    // validation path, only after the whole native read passed the hard budget.
    const nova=await parseTIFF(file,{...control,tiff:temporary});
    if(!unchanged())return false;
    const areaOK=mesmaArea(nova,gradeAnterior),sigNova=assinaturaMDT(nova),
      conteudoOK=sigGuardada?assinaturaBate(sigGuardada,sigNova):true;
    if(!areaOK||!conteudoOK){
      const fmt=g=>`${g.xll.toFixed(0)}–${(g.xll+g.nc*g.cs).toFixed(0)} × `+
                   `${g.yll.toFixed(0)}–${(g.yll+g.nr*(g.csy||g.cs)).toFixed(0)}`;
      const motivo=!areaOK?'cobre outra área ('+fmt(nova)+' vs '+fmt(gradeAnterior)+')'
                          :'o conteúdo não confere com a superfície gravada';
      return recusa('“'+file.name+'” '+motivo+' — não é o arquivo desta superfície');
    }
    nova._sig=sigNova;
    const staged={d:nova};projectNativeBindRasterSource(staged,file);
    if(!unchanged())return false;
    if(globalThis.GeoMineRasterImport)GeoMineRasterImport.release(temporary);
    const eraDem=S.hidro&&S.hidro.dem===gradeAnterior;
    r.d=nova;r._st=null;r._stFull=null;r.srcName=file.name;r.demHD=true;r.dispFull=true;
    r._projectSourceRaw=staged._projectSourceRaw;r._projectNativeBinding=staged._projectNativeBinding;
    if(r.src)r.src.sig=sigNova;else r.src={sig:sigNova};
    if(eraDem)S.hidro.dem=nova;
    committed=true;
    window.GeoMineOriginalSources?.validated(r,'raster',previousPreview);
    projectNativeInvalidate(r);
    try{
      if(eraDem){if(typeof hShadeOff==='function')hShadeOff(true);if(typeof hInvalidaD8==='function')hInvalidaD8(nova);}
      if(typeof layoutInvalidateOrtho==='function')layoutInvalidateOrtho('mdt-source');
      renderRaster(r);refreshUI();
    }catch(e){console.warn('Exibição do MDT religado:',e);}
    toast('“'+r.name+'” religada ao arquivo pleno ('+nova.nc+'×'+nova.nr+', '+nova.cs.toFixed(2)+' m)');
    return true;
  }catch(error){if(error?.name==='AbortError')return false;throw error;}
  finally{if(!committed&&temporary)await projectCloseNativeRasterSource(temporary);}
}
/* ---------------------------------------------------------------------------
   pedeFonte — janela pedindo o GeoTIFF original.

   IMPORTANTE: showOpenFilePicker() exige ATIVAÇÃO TRANSIENTE do usuário. Um
   confirm() nativo derruba essa ativação, e o picker chamado logo depois
   estourava SecurityError — que era engolido e cancelava o perfil. Por isso o
   aviso agora é um modal do próprio app e o picker é aberto DENTRO do clique
   do botão, com gesto fresco.
   --------------------------------------------------------------------------- */
async function pedeFonte(r, motivo){
  // handle de sessões anteriores: se existir, oferece um botão dedicado — cada
  // botão é um gesto próprio, e a permissão do Chrome vem sem perder ativação
  let hSalvo=null;
  try{ hSalvo=await recuperaFonte(r); }catch(_){}
  return new Promise(resolve=>{
    const div=r.d.resampled>1 ? ' (÷'+r.d.resampled+')' : '';
    const irma=fonteIrma(r);       // pode ter aparecido depois da última checagem
    const bg=document.createElement('div');
    bg.className='modal-bg on';
    bg.innerHTML=`<div class="modal" style="width:min(520px,100%)">
      <div class="modal-h"><b>Superfície sem o arquivo de origem</b></div>
      <div class="modal-b">
        <div class="lp-info">Superfície: <b>${esc(r.name)}</b><br>
          Grade no projeto: ${r.d.nc}×${r.d.nr}${div} · ${(+r.d.cs).toFixed(2)} m</div>
        <p style="margin:0 0 10px;font-size:13px;line-height:1.55">
          Para <b>${esc(motivo||'este produto')}</b> o CCMGIS precisa do GeoTIFF original.
          A grade guardada no projeto é a de tela: ela arredonda cristas de banqueta
          e bordas de berma em até cerca de 1 m.</p>
        ${irma?`<button class="tbtn" data-pf="irma" style="width:100%;justify-content:center;margin-bottom:6px">✔ Usar o GeoTIFF já aberto nesta sessão</button>`:''}
        ${hSalvo?`<button class="tbtn" data-pf="reuse" style="width:100%;justify-content:center;margin-bottom:6px">↺ Usar o arquivo já autorizado antes${hSalvo.name?' — '+esc(hSalvo.name):''}</button>`:''}
        <div class="row2">
          <button class="${hSalvo?'mini':'tbtn'}" data-pf="ok" style="justify-content:center">📂 Indicar o GeoTIFF</button>
          <button class="mini" data-pf="no" style="justify-content:center">Cancelar</button>
        </div>
        <div class="hint" data-pf="msg" style="margin-top:8px"></div>
      </div></div>`;
    document.body.appendChild(bg);
    const msg=bg.querySelector('[data-pf="msg"]');
    const fim=v=>{ try{ bg.remove(); }catch(_){} resolve(v); };
    bg.querySelector('[data-pf="no"]').onclick=()=>fim(false);
    bg.addEventListener('click',e=>{ if(e.target===bg) fim(false); });

    const btIrma=bg.querySelector('[data-pf="irma"]');
    if(btIrma) btIrma.onclick=()=>{
      adotaFonte(r, irma);
      toast('“'+r.name+'” passou a usar o GeoTIFF já aberto');
      fim(true);
    };
    const btReuse=bg.querySelector('[data-pf="reuse"]');
    if(btReuse) btReuse.onclick=async()=>{
      try{
        const perm=await hSalvo.requestPermission({mode:'read'});   // gesto fresco
        if(perm!=='granted'){ msg.textContent='Permissão negada — use “Indicar o GeoTIFF”.'; return; }
        showLoad('Relendo o GeoTIFF original…');
        const ok=await religaFonte(r, await hSalvo.getFile());
        hideLoad();
        if(ok){ toast('“'+r.name+'” religada ao original'); return fim(true); }
        msg.textContent='O arquivo guardado não cobre mais esta superfície — indique outro.';
      }catch(e){ hideLoad();
        msg.textContent='Não foi possível reabrir o arquivo guardado ('+((e&&e.message)||e)+') — indique-o novamente.'; }
    };

    bg.querySelector('[data-pf="ok"]').onclick=async()=>{
      // ---- gesto do usuário vivo neste ponto: abrir o seletor ANTES de qualquer await
      if(window.showOpenFilePicker && fsApiOK()){
        let h=null;
        try{
          const o={excludeAcceptAllOption:false, multiple:false};
          if(S._lastDir) o.startIn=S._lastDir;
          [h]=await window.showOpenFilePicker(o);
        }catch(e){
          if(e && e.name==='AbortError') return;                 // desistiu: modal segue aberto
          if(e && e.name==='SecurityError'){ msg.textContent='O navegador bloqueou o seletor; usando o seletor simples…'; }
          h=null;
        }
        if(h){
          try{
            lembraLocal(h);
            showLoad('Lendo o GeoTIFF original…');
            const ok=await religaFonte(r, await h.getFile());
            hideLoad();
            if(ok){ await lembraFonte(r,h);
              toast('“'+r.name+'” religada ao original — produtos em resolução plena');
              return fim(true); }
            msg.textContent='Arquivo recusado — escolha o GeoTIFF que cobre esta superfície.';
            return;
          }catch(e){ hideLoad(); msg.textContent='Falha ao ler: '+(e && e.message||e); return; }
        }
      }
      // ---- caminho alternativo: <input type=file>, ainda dentro do mesmo clique
      const inp=document.createElement('input');
      inp.type='file'; inp.accept='.tif,.tiff,application/octet-stream'; inp.style.display='none';
      document.body.appendChild(inp);
      inp.onchange=async()=>{
        const f=inp.files&&inp.files[0]; inp.remove();
        if(!f) return;
        showLoad('Lendo o GeoTIFF original…');
        let ok=false;
        try{ ok=await religaFonte(r,f); }catch(e){ msg.textContent='Falha ao ler: '+(e&&e.message||e); }
        hideLoad();
        if(ok){ toast('“'+r.name+'” religada ao original'); return fim(true); }
        if(!msg.textContent) msg.textContent='Arquivo recusado — escolha o GeoTIFF desta superfície.';
      };
      inp.addEventListener('cancel',()=>inp.remove());
      abrirSeletorGeoTIFF(inp);
    };
  });
}
/* Usa a fonte nativa quando acessível, sem bloquear a grade numérica já
   carregada. A resolução utilizada permanece explícita no módulo Hidro. */
async function gridBruto(r, motivo, linhas){
  if(!r) return null;
  if(!precisaFonte(r.d)){ try{ return await demFull(r.d, linhas); }catch(e){ return r.d; } }
  if(r.d._img0){ try{ return await demFull(r.d, linhas); }catch(e){} }
  if(typeof projectRestoreNativeRaster==='function'){
    const project=S.projectId,generation=window.GeoMineSessionAutosave?.state?.generation;
    const ready=await projectRestoreNativeRaster(r);
    if(S.projectId!==project||window.GeoMineSessionAutosave?.state?.generation!==generation||!S.rasters.includes(r))return null;
    if(ready)try{return await demFull(r.d,linhas);}catch(e){}
  }
  const irma=fonteIrma(r);                              // já aberto nesta sessão
  if(irma){
    adotaFonte(r, irma);
    toast('Fonte nativa já carregada reutilizada');
    try{ return await demFull(r.d, linhas); }catch(e){}
  }
  const g=await tentaHandle(r, linhas);                 // handle de sessões anteriores
  if(g) return g;
  // A grade do projeto já é utilizável. Religar o original é uma ação
  // explícita nas propriedades, nunca uma condição para usar o MDT carregado.
  return avisaReduzida(r);
}
/* Religa em silêncio pelo handle guardado. null se não houver handle ou se a
   permissão não vier (o Chrome só concede dentro de um gesto do usuário). */
async function tentaHandle(r, linhas){
  const h=await recuperaFonte(r);
  if(!h) return null;
  try{
    // só segue se a permissão JÁ estiver concedida: pedi-la aqui, fora de um
    // clique, falha por falta de ativação e ainda queima o gesto. Quando não
    // houver permissão, quem pede é o botão do modal.
    const perm=await h.queryPermission({mode:'read'});
    if(perm!=='granted') return null;
    showLoad('Relendo o GeoTIFF original…');
    const ok=await religaFonte(r, await h.getFile());
    hideLoad();
    if(ok) return await demFull(r.d, linhas);
  }catch(e){ hideLoad(); console.warn('fonte guardada:', e && e.message); }
  return null;
}
/* Um aviso por superfície por sessão — não incomoda a cada operação. */
function avisaReduzida(r){
  const d=r&&r.d;
  if(!d||!d.z||d.z.length!==d.nc*d.nr||!(d.nc>0&&d.nr>0&&d.cs>0))return null;
  if(!r._avisouReduzida){
    r._avisouReduzida=true;
    toast('“'+r.name+'”: usando a grade carregada de '+Number(r.d.cs).toFixed(2)+' m; a fonte de maior resolução não está acessível nesta sessão.');
  }
  return r.d;
}

/* Produtos reutilizam a grade disponível; buscar o original manualmente
   continua disponível nas propriedades da superfície. */
async function gridProd(r, motivo, linhas){
  const d=r&&r.d?r.d:r;
  if(!precisaFonte(d)){
    if(!S.fullRes) return d;
    try{ return await demFull(d, linhas); }catch(e){ console.warn('demFull:',e.message); return d; }
  }
  if(!(r&&r.d)) return d;                      // sem o objeto raster não há como religar
  if(d._img0){ try{ return await demFull(d, linhas); }catch(e){} }
  if(typeof projectRestoreNativeRaster==='function'){
    const project=S.projectId,generation=window.GeoMineSessionAutosave?.state?.generation;
    const ready=await projectRestoreNativeRaster(r);
    if(S.projectId!==project||window.GeoMineSessionAutosave?.state?.generation!==generation||!S.rasters.includes(r))return null;
    if(ready)try{return await demFull(r.d,linhas);}catch(e){}
  }
  const irma=fonteIrma(r);
  if(irma){ adotaFonte(r, irma); try{ return await demFull(r.d, linhas); }catch(e){} }
  const g=await tentaHandle(r, linhas);
  if(g) return g;
  return avisaReduzida(r);
}
function gridInfo(d){
  if(!d) return '';
  if(precisaFonte(d) && d.resampled==null)
    return `<span style="color:var(--amber)">grade do projeto ${d.nc}×${d.nr} · procedência desconhecida — o perfil vai pedir o GeoTIFF original</span>`;
  if(!(d.resampled>1)) return '<b>nativo</b>';
  return d._full ? `tela ${d.nc}×${d.nr} · <b>nativo ${d._W0}×${d._H0} carregado</b>`
                 : `tela ${d.nc}×${d.nr} (÷${d.resampled}) · nativo ${d._W0}×${d._H0} sob demanda`;
}
function parseASC(text){
  const tok=text.split(/\s+/).filter(Boolean);
  const hdr={}; let i=0;
  while(i<tok.length && isNaN(+tok[i])){ hdr[tok[i].toLowerCase()]=+tok[i+1]; i+=2; }
  const nc=hdr.ncols,nr=hdr.nrows,cs=hdr.cellsize,nd=hdr.nodata_value??-9999;
  const xll=hdr.xllcorner??(hdr.xllcenter!==undefined?hdr.xllcenter-cs/2:undefined);
  const yll=hdr.yllcorner??(hdr.yllcenter!==undefined?hdr.yllcenter-cs/2:undefined);
  if(!nc||!nr||!cs||xll===undefined||yll===undefined) throw new Error('Cabeçalho .asc inválido');
  const fct=Math.max(1, Math.ceil(Math.sqrt((nc*nr)/RASTER_MAX_CELLS)));
  if(fct===1){
    const z=new Float32Array(nc*nr);
    for(let k=0;k<nc*nr;k++){ const v=+tok[i+k]; z[k]=(v===nd||!isFinite(v))?NaN:v; }
    return {nc,nr,cs,xll,yll,z,resampled:1};
  }
  // .asc vem inteiro em memória: guarda a grade NATIVA em _full e reduz a de tela por MÉDIA
  const zf=new Float32Array(nc*nr);
  for(let k=0;k<nc*nr;k++){ const v=+tok[i+k]; zf[k]=(v===nd||!isFinite(v))?NaN:v; }
  const nc2=Math.max(2,Math.floor(nc/fct)), nr2=Math.max(2,Math.floor(nr/fct));
  const z=new Float32Array(nc2*nr2);
  for(let r=0;r<nr2;r++) for(let c=0;c<nc2;c++){
    let sv=0,n=0;
    for(let sr=r*fct; sr<Math.min(nr,(r+1)*fct); sr++)
      for(let sc=c*fct; sc<Math.min(nc,(c+1)*fct); sc++){
        const v=zf[sr*nc+sc]; if(!isNaN(v)){ sv+=v; n++; } }
    z[r*nc2+c]= n? sv/n : NaN;
  }
  toast('MDE .asc: tela '+nc2+'×'+nr2+' (média ×'+fct+') · produtos usam o nativo '+nc+'×'+nr);
  return {nc:nc2,nr:nr2,cs:cs*fct,xll,yll,z,resampled:fct,
          _W0:nc,_H0:nr,_full:{nc,nr,cs,xll,yll,z:zf,native:true}};
}
/* Grade do módulo Hidro: nativa por padrão. O D8 (preenchimento de depressões,
   direção e acumulação) é iterativo e roda célula a célula — numa grade nativa
   grande ele fica lento, por isso a escolha é explícita e o custo é avisado.   */
/* Reamostra por MÉDIA DE BLOCO (ignora células sem dado). Fator inteiro ≥ 2.
   Média, não vizinho mais próximo: vizinho gera alias e come crista/talvegue. */
function hReamostraGrid(d, fct){
  const f=Math.max(2, Math.round(fct));
  const nc=Math.max(2, Math.floor(d.nc/f)), nr=Math.max(2, Math.floor(d.nr/f));
  const z=new Float32Array(nc*nr);
  for(let r=0;r<nr;r++){
    const r0=r*f, r1=Math.min(d.nr, r0+f);
    for(let c=0;c<nc;c++){
      const c0=c*f, c1=Math.min(d.nc, c0+f);
      let s=0,n=0;
      for(let y=r0;y<r1;y++){ const off=y*d.nc;
        for(let xx=c0;xx<c1;xx++){ const v=d.z[off+xx]; if(!isNaN(v)){ s+=v; n++; } } }
      z[r*nc+c]= n? s/n : NaN;
    }
  }
  // yll sobe: a grade reduzida cobre nr*f linhas a partir do TOPO do original
  const ytop=d.yll+d.nr*(d.csy||d.cs), cs=d.cs*f, csy=(d.csy!=null? d.csy*f : undefined);
  return {nc, nr, cs, csy, xll:d.xll, yll:ytop-nr*(csy||cs), z, resampled:(d.resampled||1)*f, deReamostragem:true};
}
/* Fator inteiro a partir do tamanho de célula pedido em METROS. O piso é o
   próprio dado bruto: não há como pedir célula menor que a do GeoTIFF — abaixo
   disso seria interpolação, não informação nova.                             */
function hFatorEscolhido(bruta){
  const e=document.getElementById('hResM');
  const alvo=e? parseFloat(String(e.value).replace(',','.')) : NaN;
  if(!isFinite(alvo) || alvo<=bruta.cs) return 1;
  return Math.max(1, Math.round(alvo/bruta.cs));
}
/* Atualiza o resumo de custo abaixo do seletor */
function hResHintUpd(){
  const out=document.getElementById('hResOut'), inp=document.getElementById('hResM');
  if(!out) return;
  const d=S.hidro && S.hidro.dem;
  if(!d){ out.textContent='Carregue o MDE para ver o tamanho da grade.'; return; }
  const bruta=d._full||d;
  if(inp){                                   // o mínimo é sempre a célula bruta
    inp.min=bruta.cs.toFixed(3);
    inp.placeholder=bruta.cs.toFixed(2)+' (bruta)';
    if(!inp.value) inp.value=bruta.cs.toFixed(2);
  }
  const f=hFatorEscolhido(bruta);
  const nc=Math.max(2,Math.floor(bruta.nc/f)), nr=Math.max(2,Math.floor(bruta.nr/f));
  const M=nc*nr/1e6, cs=bruta.cs*f;
  const custo = M>40? 'vários minutos' : M>12? 'dezenas de segundos' :
                M>3 ? 'poucos segundos' : 'quase imediato';
  out.innerHTML=`Grade de trabalho: <b>${nc}×${nr}</b> = ${M.toFixed(1)} M células · `+
    `<b>${cs.toFixed(2)} m</b>/célula · D8 ${custo}`+
    (f>1?` <span style="color:var(--amber)">(média de bloco ÷${f} a partir de ${bruta.cs.toFixed(2)} m — suaviza crista e talvegue)</span>`
        :precisaFonte(bruta)?` <span style="color:var(--amber)">(grade carregada no projeto; resolução original indisponível)</span>`
        :` <span style="color:var(--ok,#37c0aa)">(dado bruto)</span>`);
}
(function bindHRes(){
  const inp=document.getElementById('hResM'), bt=document.getElementById('btnResBruta');
  if(inp) inp.addEventListener('input',()=>{ try{ hResHintUpd(); }catch(e){} });
  if(bt) bt.onclick=()=>{
    const d=S.hidro && S.hidro.dem; if(!d || !inp) return;
    const bruta=d._full||d; inp.value=bruta.cs.toFixed(2); hResHintUpd();
  };
})();

async function hidroGrid(r, motivo){
  const d=(r && r.d) ? r.d : r;
  if(!d) return null;
  const obj=(r && r.d) ? r : null;

  /* 1) Melhor grade acessível: prioriza a nativa e mantém a grade do
        projeto utilizável quando a fonte externa não estiver autorizada. */
  let bruta=d;
  if(precisaFonte(d)){
    const g=obj?await gridBruto(obj, motivo||'rodar o D8 sobre o terreno bruto'):avisaReduzida({d,name:'MDE'});
    if(!g) return null;                       // só sem objeto raster (sem fallback possível)
    bruta=g;
  }else{
    try{ bruta=await demFull(d); }catch(e){ bruta=d; }
  }
  /* 2) RESOLUÇÃO DE TRABALHO. Você escolhe o fator: o D8 é iterativo e o custo
        cresce com o número de células, então a troca entre tempo e detalhe fica
        explícita, não escondida num confirm.                                  */
  bruta._full=bruta._full||null;
  const f=hFatorEscolhido(bruta);
  const usada = f>1 ? hReamostraGrid(bruta, f) : bruta;
  if(f>1) usada._full=bruta;                 // guarda a bruta p/ recalcular depois
  const n=usada.nc*usada.nr;
  if(n>40e6 && !confirm(
      `A grade escolhida tem ${(n/1e6).toFixed(0)} M células. O D8 varre a grade muitas vezes `+
      `e pode levar vários minutos.\n\nContinuar assim mesmo?\n`+
      `Cancelar = volte ao seletor e escolha uma reamostragem maior.`)) return null;
  return usada;
}

/* =============== TOPOGRAFIA DE TRABALHO E FEIÇÕES DE DIRECIONAMENTO =======
   Tudo aqui produz uma grade e a instala em S.hidro.dem. O D8, as linhas de
   fluxo e a delimitação de bacias já existentes passam a operar sobre ela sem
   qualquer alteração — é por isso que as áreas de contribuição refletem o
   pós-direcionamento assim que a feição é aplicada.
   Qualquer modificação invalida zf/dir/acc: o D8 precisa ser refeito, senão as
   bacias sairiam da topografia antiga (bug silencioso e difícil de notar).   */
S.hidro.pilha = [];      // histórico para desfazer
S.hidro.demBase = null;  // cópia para restaurar

function hCloneGrid(d){
  return {nc:d.nc, nr:d.nr, cs:d.cs, xll:d.xll, yll:d.yll,
          z:Float64Array.from(d.z), native:d.native, resampled:d.resampled};
}
function hInvalidaD8(d){
  delete d.zf; delete d.dir; delete d.acc; d._bruto=false;
  ['btnD8Acc','btnStreams','btnBasin'].forEach(id=>{ const e=document.getElementById(id); if(e) e.disabled=true; });
  const bd=document.getElementById('btnD8Dir'); if(bd) bd.disabled=false;
}
function hInstalaDEM(g, rotulo){
  if(typeof hShadeOff==='function') hShadeOff(true);   // sombreado da grade anterior
  S.hidro.dem=g; hInvalidaD8(g);
  window.GeoMineNativeFlood?.bindSource({name:rotulo||'MDE editado',d:g,crs:S.workCRS},g);
  const o=document.getElementById('hDemOut');
  if(o) o.innerHTML=hidroDemHTML(g,g)+`<br><span style="color:var(--amber)">${rotulo} — refaça o preenchimento de depressões antes de gerar fluxos.</span>`;
  ['btnFill','btnShade','btnRaw','btnD8Dir'].forEach(id=>{ const e=document.getElementById(id); if(e) e.disabled=false; });
}


/* ---- catálogo dos tipos de feição de direcionamento ------------------------
   Cada tipo tem camada, estilo e comportamento próprios. O campo "mde" diz se
   a feição altera a superfície: o dreno subterrâneo NÃO altera — ele conduz
   água por baixo e não muda a direção do escoamento superficial, então gravá-lo
   no MDE produziria bacias falsas.                                            */
const HFEIC_DEF={
  canaleta:{rot:'Dreno aberto',        cor:'#2f7fd1', peso:3, dash:'',     mde:true },
  crista:  {rot:'Canaleta de crista',  cor:'#37c0aa', peso:2, dash:'9,4',  mde:true },
  drenosub:{rot:'Dreno subterr\u00e2neo',  cor:'#7aa2f7', peso:3, dash:'2,6',  mde:false},
  leira:   {rot:'Leira ou dique',      cor:'#8a5a2b', peso:4, dash:'',     mde:true },
  banqueta:{rot:'Banqueta ou berma',   cor:'#8a8f98', peso:3, dash:'',     mde:true },
  escada:  {rot:'Escada d\u2019\u00e1gua',      cor:'#e0af68', peso:4, dash:'3,3',  mde:true }
};

/* Grade escolhida como base de cotas: pode ser o MDE do Hidro ou um raster. */


/* Camada sobre a qual as a\u00e7\u00f5es do painel operam. A ordem importa: a fei\u00e7\u00e3o
   que o usu\u00e1rio acabou de selecionar manda mais que o seletor de tipo, que
   volta \u00e0 primeira op\u00e7\u00e3o a cada recarga da p\u00e1gina.                          */
function hFeicTodasCamadas(){
  const rots=Object.keys(HFEIC_DEF).map(k=>'Drenagem \u2014 '+HFEIC_DEF[k].rot);
  return S.layers.filter(l=>l.gtype==='line' && rots.includes(l.name));
}
function hFeicAlvo(){
  if(S.selFeat && S.selFeat.layer && /^Drenagem \u2014 /.test(S.selFeat.layer.name||''))
    return S.selFeat.layer;
  const porTipo=hFeicCamadaExistente(hFeicTipoAtual());
  if(porTipo && porTipo.features && porTipo.features.length) return porTipo;
  const todas=hFeicTodasCamadas().filter(l=>l.features && l.features.length);
  if(todas.length===1) return todas[0];
  return porTipo || null;
}
function hFeicSemCamada(out){
  const todas=hFeicTodasCamadas().filter(l=>l.features&&l.features.length);
  const msg = todas.length
    ? 'Nenhuma fei\u00e7\u00e3o do tipo selecionado. Camadas com fei\u00e7\u00f5es: '+
      todas.map(l=>esc(l.name.replace('Drenagem \u2014 ',''))).join(', ')+
      '. Selecione a fei\u00e7\u00e3o no mapa ou troque o tipo.'
    : 'Nenhuma fei\u00e7\u00e3o de drenagem desenhada ainda.';
  if(out) out.innerHTML='<span style="color:#e0a">'+msg+'</span>';
  toast('\u26a0 '+msg.replace(/<[^>]+>/g,''));
}

function hFeicCamadaExistente(tipo){
  const d=HFEIC_DEF[tipo]; if(!d) return null;
  return S.layers.find(l=>l.gtype==='line' && l.name==='Drenagem \u2014 '+d.rot) || null;
}
/* Cota UMA fei\u00e7\u00e3o sobre a grade indicada. Usada tanto pelo bot\u00e3o quanto pelo
   desenho: fei\u00e7\u00e3o de drenagem sem cota n\u00e3o serve para nada, ent\u00e3o ela nasce
   cotada em vez de depender de o usu\u00e1rio lembrar de um segundo passo.      */
function hFeicCotaUma(Lay, f, G){
  const partes=(f.multi && Array.isArray(f.geom[0][0]))? f.geom : [f.geom];
  const pts=[];
  for(const pr of partes) for(const p of pr){
    if(Lay.crs===S.workCRS) pts.push([p[0],p[1]]);
    else { const w=toWGS(Lay.crs,p[0],p[1]); const q=fromWGS(S.workCRS,w[0],w[1]); pts.push([q[0],q[1]]); }
  }
  if(pts.length<2) return false;
  let L2d=0; for(let i=0;i<pts.length-1;i++) L2d+=Math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1]);
  f.props=f.props||{};
  f.props.COMPRIM=+L2d.toFixed(2);
  if(!G||!G.d) return false;
  const z=pts.map(p=>sampleZbil(G.d,p[0],p[1]));
  const zi=z.find(v=>!isNaN(v)), zf=[...z].reverse().find(v=>!isNaN(v));
  if(!(isFinite(zi)&&isFinite(zf))) return false;
  f.props.COTA_INI=+zi.toFixed(2);
  f.props.COTA_FIM=+zf.toFixed(2);
  f.props.DESNIVEL=+(zi-zf).toFixed(2);
  f.props.DECLIV = L2d>0 ? +(100*(zi-zf)/L2d).toFixed(2) : 0;
  return true;
}

function hFeicGrade(){
  const v=(document.getElementById('hFeicMDT')||{}).value;
  if(v==='__dem' && S.hidro.dem) return {nome:'MDE do Hidro', d:S.hidro.dem};
  const r=S.rasters.find(x=>String(x.id)===String(v));
  return r? {nome:r.name, d:r.d} : null;
}
function hFeicMDTRefresh(){
  const sel=document.getElementById('hFeicMDT'); if(!sel) return;
  const cur=sel.value, ops=[];
  if(S.hidro.dem) ops.push(`<option value="__dem">MDE carregado no Hidro (${S.hidro.dem.nc}\u00d7${S.hidro.dem.nr})</option>`);
  ops.push(...S.rasters.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`));
  sel.innerHTML = ops.length? ops.join('') : '<option value="">\u2014 nenhum modelo dispon\u00edvel \u2014</option>';
  if(cur && (cur==='__dem'||S.rasters.some(r=>String(r.id)===String(cur)))) sel.value=cur;
  else if(S.hidro.dem) sel.value='__dem';
}

/* Cota as fei\u00e7\u00f5es da camada pelo MDT: extremidades, desn\u00edvel, comprimento 3D
   e declividade. Sem isso o projetista teria de ler cada cota \u00e0 m\u00e3o no perfil,
   que \u00e9 justamente onde entram os erros de sinal e de sentido do escoamento. */
function hFeicCotar(){
  const out=document.getElementById('hFeicOut');
  const G=hFeicGrade();
  if(!G){ out.innerHTML='<span style="color:#e0a">Escolha o MDT de base.</span>'; return; }
  const Lay=hFeicAlvo();
  if(!Lay||!Lay.features||!Lay.features.length){ hFeicSemCamada(out); return; }
  // garante os campos no esquema (camadas antigas podem n\u00e3o t\u00ea-los)
  const precisa=[['COTA_INI','N',10,2],['COTA_FIM','N',10,2],['DESNIVEL','N',10,2],
                 ['COMPRIM','N',12,2],['DECLIV','N',8,2]];
  Lay.fields=Lay.fields||[];
  precisa.forEach(([n,t,l,d])=>{ if(!Lay.fields.some(f=>f.name===n))
    Lay.fields.push({name:n,type:t,length:l,decimal:d}); });

  let ok=0, semZ=0;
  for(const f of Lay.features){ if(hFeicCotaUma(Lay,f,G)) ok++; else semZ++; }
  drawLayer(Lay); refreshUI();
  const neg=Lay.features.filter(f=>f.props && f.props.DECLIV<0).length;
  toast(ok+' fei\u00e7\u00e3o(\u00f5es) cotada(s) em '+Lay.name.replace('Drenagem \u2014 ',''));
  out.innerHTML=`<b>${ok}</b> fei\u00e7\u00e3o(\u00f5es) de \u201c${esc(Lay.name.replace('Drenagem \u2014 ',''))}\u201d `+
    `cotada(s) sobre \u201c${esc(G.nome)}\u201d`+
    (semZ?` \u00b7 <span style="color:var(--amber)">${semZ} fora do modelo</span>`:'')+
    `<br>Gravados COTA_INI, COTA_FIM, DESNIVEL, COMPRIM e DECLIV na tabela de atributos.`+
    (neg?`<br><span style="color:var(--amber)">${neg} fei\u00e7\u00e3o(\u00f5es) com declividade negativa \u2014 o tra\u00e7ado `+
         `come\u00e7a mais baixo do que termina, verifique o sentido.</span>`:'');
  toast(ok+' fei\u00e7\u00e3o(\u00f5es) cotada(s)');
}

function hFeicTipoAtual(){ return (document.getElementById('hFeicTipo')||{}).value||'canaleta'; }

/* Uma camada por tipo: assim cada tipo sai como um shapefile próprio pela
   exportação existente, com seus atributos.                                  */
function hFeicCamada(tipo){
  const d=HFEIC_DEF[tipo]; if(!d) return null;
  const nome='Drenagem \u2014 '+d.rot;
  let L=S.layers.find(l=>l.gtype==='line' && l.name===nome);
  if(!L){
    L=addLayer({name:nome, gtype:'line', crs:S.workCRS, features:[], color:d.cor,
      fields:[{name:'TIPO',type:'C',length:24},
              {name:'LARGURA',type:'N',length:8,decimal:2},
              {name:'ALTURA',type:'N',length:8,decimal:2},
              {name:'COTA_INI',type:'N',length:10,decimal:2},
              {name:'COTA_FIM',type:'N',length:10,decimal:2},
              {name:'DESNIVEL',type:'N',length:10,decimal:2},
              {name:'COMPRIM',type:'N',length:12,decimal:2},
              {name:'DECLIV',type:'N',length:8,decimal:2},
              {name:'OBS',type:'C',length:80}]});
    L.weight=d.peso; L.sym.weight=d.peso; L.sym.dash=d.dash;
    L.sym.color=d.cor; L.sym.stroke=d.cor;
    drawLayer(L);
  }
  // valores que a pr\u00f3xima fei\u00e7\u00e3o desenhada herda (ver addFeature)
  const gv=id=>{ const e=document.getElementById(id); const v=e?parseFloat(String(e.value).replace(',','.')):NaN;
                 return isFinite(v)? v : 0; };
  L._defProps={TIPO:d.rot, LARGURA:gv('hFeicLarg'), ALTURA:gv('hFeicH'), OBS:''};
  L._autoCota=true;    // ao encerrar o tra\u00e7ado, cota pelo MDT indicado
  return L;
}
function hFeicDesenhar(){
  const tipo=hFeicTipoAtual();
  const L=hFeicCamada(tipo); if(!L){ toast('Tipo desconhecido'); return; }
  S.activeId=L.id; refreshUI(); zApply();
  const sel=document.getElementById('hFeicLay'); if(sel) sel.value=L.id;
  setTool('line');
  if(window.matchMedia('(max-width:720px)').matches)
    document.getElementById('side').classList.remove('open');
  toast('\u270e '+HFEIC_DEF[tipo].rot+': clique os v\u00e9rtices, duplo clique encerra');
}
function hFeicEditar(){
  /* setTool executa clearDraw(): se houver tra\u00e7ado em andamento ele seria
     descartado, e era isso que fazia "a linha sumir" ao pedir a edi\u00e7\u00e3o.
     Encerra-se o desenho antes de trocar de ferramenta.                     */
  if(['line','poly'].includes(S.tool) && S.drawBuf.length>=2) finishDraw();
  if(!S.selFeat){
    // seleciona a \u00faltima fei\u00e7\u00e3o da camada do tipo corrente
    const Lay=hFeicAlvo();
    if(Lay && Lay.features && Lay.features.length){
      S.selFeat={layer:Lay, layerId:Lay.id, idx:Lay.features.length-1};
      S.activeId=Lay.id;
    }
  }
  if(!S.selFeat){ setTool('select'); toast('Toque na fei\u00e7\u00e3o a editar \u2014 depois \u2b56 libera os v\u00e9rtices'); return; }
  setTool('vertex'); showVertices();
  toast('Arraste os v\u00e9rtices \u00b7 ponto m\u00e9dio insere \u00b7 duplo clique remove');
}

function hTopoRefresh(){
  const b=document.getElementById('hTopoBase'); if(!b) return;
  const cur=b.value;
  /* o MDE da se\u00e7\u00e3o 3 vive em S.hidro.dem e N\u00c3O entra em S.rasters \u2014 sem esta
     op\u00e7\u00e3o o painel aparecia vazio para quem s\u00f3 carregou o MDE aqui no Hidro. */
  const ops=[];
  if(S.hidro.dem) ops.push(`<option value="__dem">MDE carregado na se\u00e7\u00e3o 3 (${S.hidro.dem.nc}\u00d7${S.hidro.dem.nr})</option>`);
  ops.push(...S.rasters.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`));
  b.innerHTML = ops.length? ops.join('')
    : '<option value="">\u2014 carregue um MDE na se\u00e7\u00e3o 3 ou um GeoTIFF abaixo \u2014</option>';
  if(cur && (cur==='__dem'||S.rasters.some(r=>String(r.id)===String(cur)))) b.value=cur;
  else { const p=S.rasters.find(r=>/mdt|mde|primitiv|terreno|topo/i.test(r.name));
         b.value = p? String(p.id) : (S.hidro.dem? '__dem' : (S.rasters[0]? String(S.rasters[0].id) : '')); }

  const box=document.getElementById('hTopoSup');
  const marc={}; box.querySelectorAll('input[type=checkbox]').forEach(i=>marc[i.dataset.rid]=i.checked);
  const modos={}; box.querySelectorAll('select').forEach(sl=>modos[sl.dataset.rid]=sl.value);
  box.innerHTML = S.rasters.length ? S.rasters.map(r=>{
    const sug = /dce|est[ée]ril|pilha|dep[óo]sito|aterro/i.test(r.name) ? 'max'
              : /cava|lavra|pit|corte/i.test(r.name) ? 'min' : 'min';
    const md = modos[r.id]||sug;
    return `<div style="display:flex;align-items:center;gap:6px;margin:3px 0">`+
      `<input type="checkbox" data-rid="${r.id}" ${marc[r.id]?'checked':''} style="width:auto;accent-color:var(--amber)">`+
      `<span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.name)}</span>`+
      `<select data-rid="${r.id}" style="width:auto;font-size:11px;padding:2px">`+
      `<option value="min"${md==='min'?' selected':''}>Corte</option>`+
      `<option value="max"${md==='max'?' selected':''}>Aterro</option>`+
      `<option value="sub"${md==='sub'?' selected':''}>Substituir</option></select></div>`;
  }).join('') : '<div class="hint">Nenhuma superf\u00edcie dispon\u00edvel. Carregue a cava e o DCE como '+
      'GeoTIFF no bot\u00e3o abaixo, ou gere-os no Geoproc/Cubagem \u2014 eles aparecer\u00e3o aqui '+
      'automaticamente.</div>';

  hFeicMDTRefresh();
  const lay=document.getElementById('hFeicLay');
  if(lay){ const cl=lay.value;
    const ls=S.layers.filter(l=>l.gtype==='line');
    lay.innerHTML = ls.length ? ls.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('')
                              : '<option value="">\u2014 sem camadas de linha \u2014</option>';
    if(cl && ls.some(l=>String(l.id)===String(cl))) lay.value=cl;
  }
}

function hMontaTopo(){
  const out=document.getElementById('hTopoOut');
  const bid=(document.getElementById('hTopoBase')||{}).value;
  const base = (bid==='__dem' && S.hidro.dem)
    ? {name:'MDE da se\u00e7\u00e3o 3', d:S.hidro.dem}
    : S.rasters.find(r=>String(r.id)===String(bid));
  if(!base){ out.innerHTML='<span style="color:#e0a">Escolha o terreno primitivo. Se a lista estiver '+
    'vazia, carregue um MDE na se\u00e7\u00e3o 3 ou um GeoTIFF no bot\u00e3o desta se\u00e7\u00e3o.</span>'; return; }
  const alvo=[];
  document.getElementById('hTopoSup').querySelectorAll('input[type=checkbox]:checked').forEach(i=>{
    const r=S.rasters.find(x=>String(x.id)===String(i.dataset.rid));
    const sl=document.getElementById('hTopoSup').querySelector(`select[data-rid="${i.dataset.rid}"]`);
    if(r && r!==base) alvo.push({r, modo:sl?sl.value:'min'});
  });
  showLoad('Montando topografia\u2026');
  setTimeout(async()=>{
    try{
      const gb=base.id!=null ? await gridProd(base,'montar a topografia final na grade original') : base.d;
      if(!gb)throw new Error('não foi possível obter a resolução original do raster-base');
      const g=hCloneGrid(gb);
      const cont={min:0,max:0,sub:0};
      for(const {r,modo} of alvo){
        const rg=await gridProd(r,'incorporar '+r.name+' na topografia final');
        if(!rg)throw new Error('não foi possível obter a resolução original de '+r.name);
        for(let rr=0;rr<g.nr;rr++){
          const Y=g.yll+(g.nr-rr-0.5)*g.cs;
          for(let cc=0;cc<g.nc;cc++){
            const X=g.xll+(cc+0.5)*g.cs;
            const v=sampleZbil(rg,X,Y); if(isNaN(v)) continue;
            const k=rr*g.nc+cc, z0=g.z[k];
            if(isNaN(z0)){ g.z[k]=v; cont[modo]++; continue; }
            if(modo==='min'){ if(v<z0){ g.z[k]=v; cont.min++; } }
            else if(modo==='max'){ if(v>z0){ g.z[k]=v; cont.max++; } }
            else { g.z[k]=v; cont.sub++; }
          }
        }
      }
      S.hidro.demBase=hCloneGrid(g); S.hidro.pilha=[];
      hInstalaDEM(g,'Topografia montada');
      const nr2={id:rid++, name:'Topografia final', d:{nc:g.nc,nr:g.nr,cs:g.cs,xll:g.xll,yll:g.yll,z:Float64Array.from(g.z)},
        src:{file:'topografia', at:new Date().toISOString()},
        style:{mode:'hipso_hs', opacity:0.85}, visible:true, overlay:null};
      S.rasters.push(nr2);placeProductAbove(nr2,base); renderRaster(nr2); refreshUI();
      projectAutoSaveRaster(nr2);
      hideLoad();
      out.innerHTML=`<b>Topografia final</b> sobre “${esc(base.name)}” · ${g.nc}×${g.nr} · ${g.cs.toFixed(2)} m`+
        `<br>${alvo.length} superfície(s) incorporada(s) · células alteradas: `+
        `corte ${cont.min.toLocaleString('pt-BR')} · aterro ${cont.max.toLocaleString('pt-BR')} · substituição ${cont.sub.toLocaleString('pt-BR')}`+
        `<br><span style="color:var(--ink-dim)">Gravada como raster do projeto e ativa no Hidro.</span>`;
      toast('⛰ Topografia montada');
    }catch(e){ hideLoad(); out.innerHTML='<span style="color:#e0a">'+esc(String(e.message||e))+'</span>'; }
  },30);
}

/* Grava a feição na grade. O perfil transversal tem topo plano na largura
   informada e taludes laterais, para que a leira não vire um degrau vertical
   de uma célula — que o D8 atravessaria em diagonal.                        */
function hBurnLinha(d, pts, tipo, larg, h, tal, z0, z1, sTot, sIni){
  const meia=larg/2, ext=meia+Math.max(0,tal)*Math.abs(h);
  let n=0, sAc=sIni;
  const ymax=d.yll+d.nr*(d.csy||d.cs);
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i], b=pts[i+1];
    const vx=b[0]-a[0], vy=b[1]-a[1], L2s=vx*vx+vy*vy, L=Math.sqrt(L2s);
    if(L<1e-9) continue;
    const c0=Math.max(0,Math.floor((Math.min(a[0],b[0])-ext-d.xll)/d.cs));
    const c1=Math.min(d.nc-1,Math.ceil((Math.max(a[0],b[0])+ext-d.xll)/d.cs));
    const r0=Math.max(0,Math.floor((ymax-(Math.max(a[1],b[1])+ext))/d.cs));
    const r1=Math.min(d.nr-1,Math.ceil((ymax-(Math.min(a[1],b[1])-ext))/d.cs));
    for(let r=r0;r<=r1;r++){
      const Y=d.yll+(d.nr-r-0.5)*d.cs;
      for(let c=c0;c<=c1;c++){
        const X=d.xll+(c+0.5)*d.cs;
        const t=Math.max(0,Math.min(1,((X-a[0])*vx+(Y-a[1])*vy)/L2s));
        const dist=Math.hypot(X-(a[0]+t*vx), Y-(a[1]+t*vy));
        if(dist>ext) continue;
        const k=r*d.nc+c; if(isNaN(d.z[k])) continue;
        // fator do perfil: 1 no topo plano, decaindo linearmente no talude
        let f=1;
        if(dist>meia) f = (tal>0 && Math.abs(h)>0) ? Math.max(0,1-(dist-meia)/(tal*Math.abs(h))) : 0;
        if(f<=0) continue;
        if(tipo==='leira')          d.z[k]+= h*f;
        else if(tipo==='canaleta')  d.z[k]-= h*f;
        else if(tipo==='banqueta'){ const zc=z0; d.z[k]=d.z[k]+(zc-d.z[k])*f; }
        else if(tipo==='escada'){
          const zc=z0+(z1-z0)*(sTot>0? (sAc+t*L)/sTot : 0);
          d.z[k]=d.z[k]+(zc-d.z[k])*f;
        }
        n++;
      }
    }
    sAc+=L;
  }
  return n;
}

function hAplicaFeicoes(){
  const out=document.getElementById('hFeicOut');
  const d=S.hidro.dem;
  if(!d){ out.innerHTML='<span style="color:#e0a">Carregue ou monte uma topografia primeiro.</span>'; return; }
  const Lay=hFeicAlvo();
  if(!Lay || !Lay.features || !Lay.features.length){ hFeicSemCamada(out); return; }
  const tipo=(document.getElementById('hFeicTipo')||{}).value||'leira';
  const def=HFEIC_DEF[tipo];
  if(def && !def.mde){
    out.innerHTML='<b>'+esc(def.rot)+'</b> n\u00e3o altera a superf\u00edcie do terreno e por isso n\u00e3o '+
      '\u00e9 gravado no MDE \u2014 conduz \u00e1gua por baixo, sem mudar a dire\u00e7\u00e3o do escoamento superficial. '+
      'A fei\u00e7\u00e3o fica registrada na camada e no shapefile, para o projeto e o quantitativo.';
    toast('Dreno subterr\u00e2neo registrado (n\u00e3o altera o MDE)'); return;
  }
  const tipoBurn = (tipo==='crista') ? 'canaleta' : tipo;   // crista grava como canaleta
  const larg=Math.max(0.5, parseFloat(document.getElementById('hFeicLarg').value)||3);
  const h=Math.abs(parseFloat(document.getElementById('hFeicH').value)||0);
  const tal=Math.max(0, parseFloat(document.getElementById('hFeicT').value)||0);
  const z0=parseFloat(document.getElementById('hFeicZ0').value);
  const z1=parseFloat(document.getElementById('hFeicZ1').value);
  if((tipoBurn==='escada') && !(isFinite(z0)&&isFinite(z1))){
    out.innerHTML='<span style="color:#e0a">Informe as cotas inicial e final da escada.</span>'; return; }
  if(tipoBurn==='banqueta' && !isFinite(z0)){
    out.innerHTML='<span style="color:#e0a">Informe a cota do patamar no campo “cota inicial”.</span>'; return; }
  if((tipoBurn==='leira'||tipoBurn==='canaleta') && !(h>0)){
    out.innerHTML='<span style="color:#e0a">Informe a altura/profundidade.</span>'; return; }

  showLoad('Gravando feições no MDE…');
  setTimeout(()=>{
    try{
      S.hidro.pilha.push(hCloneGrid(d));
      if(S.hidro.pilha.length>8) S.hidro.pilha.shift();
      if(!S.hidro.demBase) S.hidro.demBase=S.hidro.pilha[0];
      let cel=0, nf=0, compTot=0;
      for(const f of Lay.features){
        const partes = (f.multi && Array.isArray(f.geom[0][0])) ? f.geom : [f.geom];
        for(const pr of partes){
          const pts=pr.map(p=>{ if(Lay.crs===S.workCRS) return [p[0],p[1]];
            const w=toWGS(Lay.crs,p[0],p[1]); const q=fromWGS(S.workCRS,w[0],w[1]); return [q[0],q[1]]; });
          if(pts.length<2) continue;
          let sT=0; for(let i=0;i<pts.length-1;i++) sT+=Math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1]);
          cel+=hBurnLinha(d,pts,tipoBurn,larg,h,tal,z0,z1,sT,0); compTot+=sT; nf++;
        }
      }
      hInstalaDEM(d,'Feição aplicada');
      hideLoad();
      const rot=(HFEIC_DEF[tipo]||{}).rot||tipo;
      out.innerHTML=`<b>${rot}</b> · ${nf} eixo(s) · ${compTot.toFixed(0)} m de extensão · `+
        `${cel.toLocaleString('pt-BR')} células alteradas · largura ${larg} m`+
        ((tipo==='leira'||tipo==='canaleta')? ` · ${h} m`:'')+
        ((tipo==='escada')? ` · ${z0} → ${z1} m`:'')+
        ((tipo==='banqueta')? ` · cota ${z0} m`:'')+
        `<br><span style="color:var(--ink-dim)">Rode “Preencher depressões” e depois as bacias para ver as áreas de contribuição pós-direcionamento.</span>`;
      toast('Feição gravada no MDE');
    }catch(e){ hideLoad(); out.innerHTML='<span style="color:#e0a">'+esc(String(e.message||e))+'</span>'; }
  },30);
}

function hFeicUndo(){
  const out=document.getElementById('hFeicOut');
  if(!S.hidro.pilha.length){ out.innerHTML='<span style="color:var(--ink-dim)">Nada a desfazer.</span>'; return; }
  hInstalaDEM(S.hidro.pilha.pop(),'Última feição desfeita');
  out.innerHTML='Última feição desfeita. Restam '+S.hidro.pilha.length+' níve(is) no histórico.';
  toast('Desfeito');
}
function hFeicReset(){
  const out=document.getElementById('hFeicOut');
  if(!S.hidro.demBase){ out.innerHTML='<span style="color:var(--ink-dim)">Nenhum MDE de referência guardado.</span>'; return; }
  S.hidro.pilha=[];
  hInstalaDEM(hCloneGrid(S.hidro.demBase),'MDE restaurado');
  out.innerHTML='MDE restaurado ao estado anterior às feições.';
  toast('MDE restaurado');
}
function hFeicTipoToggle(){
  const t=(document.getElementById('hFeicTipo')||{}).value||'leira';
  const zb=document.getElementById('hFeicZBox'), hb=document.getElementById('hFeicHBox');
  if(zb) zb.style.display=(t==='escada'||t==='banqueta')?'':'none';
  if(hb) hb.style.display=(t==='escada'||t==='drenosub')?'none':'';
}

/* O limiar do D8 e contado em CELULAS, entao a area que ele representa depende
   do tamanho da celula. Numa grade de 0,32 m, 200 celulas sao apenas 20 m2 e
   praticamente todo sulco vira curso d agua — dai o mapa travar. Mostrar a
   area equivalente evita esse erro sem precisar explicar nada.              */
function hThrHintUpd(){
  const el=document.getElementById('hThrHint'); if(!el) return;
  const d=S.hidro.dem, thr=+((document.getElementById('hThr')||{}).value)||0;
  if(!d||!(thr>0)){ el.textContent=''; return; }
  const a=thr*d.cs*d.cs;
  const txt = a<10000 ? a.toFixed(0)+' m²' : (a/10000).toFixed(2)+' ha';
  el.innerHTML = `= <b>${txt}</b> de área de contribuição (célula de ${(+d.cs).toFixed(2)} m)`+
    (a<500 ? ' · <span style="color:var(--amber)">muito baixo: gera milhares de linhas</span>' : '');
}

function hidroDemHTML(d, orig){
  const nat = !precisaFonte(d)&&!(d.resampled>1&&!d.native);
  return `<b>${d.nc}×${d.nr}</b> células · ${(+d.cs).toFixed(2)} m · grade <b>${nat?'NATIVA':'de tela (reamostrada)'}</b>`+
         `<br>X ${d.xll.toFixed(0)}–${(d.xll+d.nc*d.cs).toFixed(0)} · Y ${d.yll.toFixed(0)}–${(d.yll+d.nr*(d.csy||d.cs)).toFixed(0)} (${S.workCRS})`+
         (nat?'':'<br><span style="color:var(--amber)">⚠ As linhas de fluxo herdarão a resolução reduzida.</span>');
}
const D8N=[[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1]];
function fillSinksDEM(d){
  const {nc,nr}=d; const z=d.z; const W=new Float32Array(nc*nr);
  const EPS=1e-3;
  for(let k=0;k<nc*nr;k++){ const r=(k/nc)|0,c=k%nc;
    W[k]=(r===0||c===0||r===nr-1||c===nc-1||isNaN(z[k]))?(isNaN(z[k])?-1e9:z[k]):1e9; }
  let changed=true, pass=0;
  while(changed && pass<400){
    changed=false; pass++;
    const fwd=pass%2===1;
    for(let idx=0;idx<nc*nr;idx++){
      const k=fwd?idx:nc*nr-1-idx;
      if(isNaN(z[k])||W[k]<=z[k]) continue;
      const r=(k/nc)|0,c=k%nc;
      for(const [dr,dc] of D8N){
        const r2=r+dr,c2=c+dc; if(r2<0||c2<0||r2>=nr||c2>=nc) continue;
        const wn=W[r2*nc+c2]+EPS;
        if(z[k]>=wn){ if(W[k]!==z[k]){W[k]=z[k];changed=true;} break; }
        if(wn<W[k]){ W[k]=wn; changed=true; }
      }
    }
  }
  d.zf=W; return pass;
}
/* ---------------------------------------------------------------------------
   D8 COM PROGRESSO — mesmas contas das versões síncronas, porém em blocos, com
   pausa para a interface respirar e a barra andar. p0/p1 é a faixa da barra
   que cada etapa ocupa no total.
   --------------------------------------------------------------------------- */
async function fillSinksAsync(d, p0, p1){
  const {nc,nr}=d, z=d.z, N=nc*nr, EPS=1e-3;
  const W=new Float32Array(N);
  for(let k=0;k<N;k++){ const r=(k/nc)|0,c=k%nc;
    W[k]=(r===0||c===0||r===nr-1||c===nc-1||isNaN(z[k]))?(isNaN(z[k])?-1e9:z[k]):1e9; }
  let pass=0, mud=1, mud0=0;
  while(mud>0 && pass<400){
    mud=0; pass++;
    const fwd=pass%2===1;
    for(let idx=0;idx<N;idx++){
      const k=fwd?idx:N-1-idx;
      if(isNaN(z[k])||W[k]<=z[k]) continue;
      const r=(k/nc)|0,c=k%nc;
      for(const [dr,dc] of D8N){
        const r2=r+dr,c2=c+dc; if(r2<0||c2<0||r2>=nr||c2>=nc) continue;
        const wn=W[r2*nc+c2]+EPS;
        if(z[k]>=wn){ if(W[k]!==z[k]){W[k]=z[k];mud++;} break; }
        if(wn<W[k]){ W[k]=wn; mud++; }
      }
    }
    if(pass===1) mud0=Math.max(1,mud);
    // convergência real: quantos ajustes ainda ocorrem, contra os da 1ª varredura
    const conv=Math.max(0, Math.min(1, 1-(mud/mud0)));
    progSet(p0+(p1-p0)*conv, 'preenchendo · varredura '+pass);
    await cedeUI();
  }
  d.zf=W; return pass;
}
async function d8dirAsync(d, p0, p1){
  const {nc,nr}=d, z=d.zf||d.z, N=nc*nr;
  const dir=new Int32Array(N).fill(-1);
  const BL=Math.max(50000, Math.floor(N/60));
  for(let k0=0;k0<N;k0+=BL){
    const k1=Math.min(N,k0+BL);
    for(let k=k0;k<k1;k++){
      if(isNaN(d.z[k])) continue;
      const r=(k/nc)|0,c=k%nc; let bs=0,bk=-1;
      for(const [dr,dc] of D8N){
        const r2=r+dr,c2=c+dc; if(r2<0||c2<0||r2>=nr||c2>=nc) continue;
        const k2=r2*nc+c2; if(isNaN(d.z[k2])) continue;
        const dist=(dr&&dc)?Math.SQRT2:1;
        const s=(z[k]-z[k2])/dist;
        if(s>bs){ bs=s; bk=k2; }
      }
      dir[k]=bk;
    }
    progSet(p0+(p1-p0)*(k1/N), 'direções de fluxo');
    await cedeUI();
  }
  d.dir=dir; return dir;
}
async function d8accAsync(d, p0, p1){
  const {nc,nr}=d, z=d.zf||d.z, N=nc*nr;
  progSet(p0, 'ordenando por cota');
  await cedeUI();
  const val=[]; for(let k=0;k<N;k++) if(!isNaN(d.z[k])) val.push(k);
  progSet(p0+(p1-p0)*0.15, 'ordenando por cota');
  await cedeUI();
  val.sort((a,b)=>z[b]-z[a]);                 // etapa bloqueante, inevitável
  const acc=new Float32Array(N).fill(1);
  const M=val.length, BL=Math.max(50000, Math.floor(M/40));
  for(let i0=0;i0<M;i0+=BL){
    const i1=Math.min(M,i0+BL);
    for(let i=i0;i<i1;i++){ const k=val[i], dn=d.dir[k]; if(dn>=0) acc[dn]+=acc[k]; }
    progSet(p0+(p1-p0)*(0.35+0.65*(i1/M)), 'acumulação');
    await cedeUI();
  }
  d.acc=acc; return acc;
}
function d8dir(d){
  const {nc,nr}=d; const z=d.zf||d.z; const dir=new Int32Array(nc*nr).fill(-1);
  for(let k=0;k<nc*nr;k++){
    if(isNaN(d.z[k])) continue;
    const r=(k/nc)|0,c=k%nc; let bs=0,bk=-1;
    for(const [dr,dc] of D8N){
      const r2=r+dr,c2=c+dc; if(r2<0||c2<0||r2>=nr||c2>=nc) continue;
      const k2=r2*nc+c2; if(isNaN(d.z[k2])) continue;
      const dist=(dr&&dc)?Math.SQRT2:1;
      const s=(z[k]-z[k2])/dist;
      if(s>bs){ bs=s; bk=k2; }
    }
    dir[k]=bk;
  }
  d.dir=dir; return dir;
}
function d8acc(d){
  const {nc,nr}=d; const z=d.zf||d.z;
  const order=[...Array(nc*nr).keys()].filter(k=>!isNaN(d.z[k])).sort((a,b)=>z[b]-z[a]);
  const acc=new Float32Array(nc*nr).fill(1);
  order.forEach(k=>{ const dn=d.dir[k]; if(dn>=0) acc[dn]+=acc[k]; });
  d.acc=acc; return acc;
}
function cellXY(d,k){ const r=(k/d.nc)|0, c=k%d.nc, csy=d.csy||d.cs;
  return [d.xll+(c+0.5)*d.cs, d.yll+(d.nr-1-r+0.5)*csy]; }
function streamsFromDEM(d,thr){
  const {nc,nr}=d; const feats=[];
  const isS=k=>d.acc[k]>=thr;
  const visited=new Uint8Array(nc*nr);
  for(let k=0;k<nc*nr;k++){
    if(!isS(k)||visited[k]) continue;
    const r=(k/nc)|0,c=k%nc; let head=true;
    for(const [dr,dc] of D8N){ const r2=r+dr,c2=c+dc;
      if(r2<0||c2<0||r2>=nr||c2>=nc) continue;
      const k2=r2*nc+c2; if(isS(k2)&&d.dir[k2]===k){ head=false; break; } }
    if(!head) continue;
    const pts=[]; let cur=k, maxA=0;
    while(cur>=0 && isS(cur) && !visited[cur]){
      visited[cur]=1; pts.push(cellXY(d,cur)); maxA=Math.max(maxA,d.acc[cur]); cur=d.dir[cur];
    }
    if(cur>=0 && isS(cur)) pts.push(cellXY(d,cur));
    if(pts.length>=2) feats.push({geom:pts,multi:false,props:{ACUM_MAX:Math.round(maxA)}});
  }
  return feats;
}
function watershedAt(d, x, y, opt){
  const {nc,nr,cs}=d,csy=d.csy||cs;
  let c=Math.floor((x-d.xll)/cs), r=d.nr-1-Math.floor((y-d.yll)/cs);
  if(r<0||c<0||r>=nr||c>=nc) return null;
  const k0=r*nc+c;
  let bk=k0;
  /* ENCAIXE DO EXUTÓRIO — a bacia é o que drena PARA O PONTO CLICADO.
     A regra antiga varria até 50 m procurando a célula de maior acumulação
     (score = log(acc) − dist/35). Isso escorregava rio ABAIXO, e a bacia
     passava a incluir tributários que entram depois do ponto — o
     "arredondamento que pega a montante" relatado. Agora:
       · o raio é curto (padrão 5 m, ajustável no painel), só para corrigir o
         dedo fora do talvegue;
       · candidatos A JUSANTE do clique são recusados — nenhuma área nova
         entra na bacia;
       · entre os válidos vence o MAIS PRÓXIMO (e, em empate, o de maior
         acumulação), não o de maior acumulação a qualquer distância.        */
  const raioM=Math.max(0,(opt&&isFinite(opt.raioM))?opt.raioM:5);
  const semJus=!(opt&&opt.permitirJusante);
  const rad=Math.max(0,Math.round(raioM/Math.min(cs,csy)));
  /* caminho de jusante do clique: tudo o que estiver nele está fora de cogitação */
  const jus=new Set();
  if(semJus){
    let k=k0;
    for(let i=0;i<nc*nr;i++){
      const kn=d.dir[k];
      if(kn==null||kn<0||kn===k||jus.has(kn)) break;
      jus.add(kn); k=kn;
    }
  }
  if(rad>0){
    const acc0=d.acc[k0]||0;
    /* Duas passadas. A primeira acha a MAIOR acumulação do entorno (já sem os
       candidatos de jusante); a segunda só aceita células com pelo menos
       metade dela — ou seja, o próprio talvegue — e entre elas escolhe a mais
       PRÓXIMA. Sem esse corte, um clique na encosta grudava na célula vizinha
       (acumulação de encosta, alguns m²) em vez de ir ao curso d'água. */
    let maxA=acc0;
    for(let dr=-rad;dr<=rad;dr++) for(let dc=-rad;dc<=rad;dc++){
      const r2=r+dr,c2=c+dc; if(r2<0||c2<0||r2>=nr||c2>=nc) continue;
      if(Math.hypot(dc*cs,dr*csy)>raioM) continue;
      const k2=r2*nc+c2;
      if(semJus&&jus.has(k2)) continue;
      const a=d.acc[k2]||0; if(a>maxA) maxA=a;
    }
    const corte=Math.max(acc0, maxA*0.5);
    let melhorD=Infinity, melhorA=-1;
    for(let dr=-rad;dr<=rad;dr++) for(let dc=-rad;dc<=rad;dc++){
      const r2=r+dr,c2=c+dc; if(r2<0||c2<0||r2>=nr||c2>=nc) continue;
      const dist=Math.hypot(dc*cs,dr*csy); if(dist>raioM) continue;
      const k2=r2*nc+c2;
      if(semJus&&jus.has(k2)) continue;                 // não descer o rio
      const a=d.acc[k2]||0;
      if(a<corte||a<=acc0) continue;                    // só o talvegue vizinho
      if(dist<melhorD-1e-9 || (Math.abs(dist-melhorD)<=1e-9 && a>melhorA)){
        melhorD=dist; melhorA=a; bk=k2;
      }
    }
  }
  const outlet=cellXY(d,bk),snapM=Math.hypot(outlet[0]-x,outlet[1]-y);
  const mask=new Uint8Array(nc*nr); mask[bk]=1; const q=[bk];
  while(q.length){ const k=q.pop(); const r0=(k/nc)|0,c0=k%nc;
    for(const [dr,dc] of D8N){ const r2=r0+dr,c2=c0+dc;
      if(r2<0||c2<0||r2>=nr||c2>=nc) continue;
      const k2=r2*nc+c2; if(!mask[k2] && d.dir[k2]===k){ mask[k2]=1; q.push(k2); } } }
  const edges=new Map();
  const px=c2=>d.xll+c2*cs, py=r2=>d.yll+(nr-r2)*csy;
  function addEdge(x1,y1,x2,y2){ const a=x1+','+y1;
    if(!edges.has(a)) edges.set(a,[]); edges.get(a).push([x2,y2]); }
  let ncells=0;
  for(let k=0;k<nc*nr;k++){ if(!mask[k]) continue; ncells++;
    const r0=(k/nc)|0,c0=k%nc;
    const nb=(dr,dc)=>{const r2=r0+dr,c2=c0+dc; return r2>=0&&c2>=0&&r2<nr&&c2<nc&&mask[r2*nc+c2];};
    if(!nb(-1,0)) addEdge(px(c0),py(r0),px(c0+1),py(r0));
    if(!nb(1,0))  addEdge(px(c0+1),py(r0+1),px(c0),py(r0+1));
    if(!nb(0,-1)) addEdge(px(c0),py(r0+1),px(c0),py(r0));
    if(!nb(0,1))  addEdge(px(c0+1),py(r0),px(c0+1),py(r0+1));
  }
  const rings=[];
  while(edges.size){
    const first=edges.keys().next().value;
    let [sx,sy]=first.split(',').map(Number);
    const ring=[[sx,sy]]; let cx=sx, cy=sy;
    for(let guard=0; guard<nc*nr*4; guard++){
      const a=cx+','+cy; const lst=edges.get(a);
      if(!lst||!lst.length){ edges.delete(a); break; }
      const [nx,ny]=lst.shift(); if(!lst.length) edges.delete(a);
      ring.push([nx,ny]); cx=nx; cy=ny;
      if(nx===sx&&ny===sy) break;
    }
    if(ring.length>3) rings.push(ring);
  }
  rings.sort((a,b)=>b.length-a.length);
  return {ring:rings[0]||null,ncells,areaM2:ncells*cs*csy,
          outlet,snapM,accOutlet:d.acc[bk]||0,
          clique:[x,y],accClique:d.acc[k0]||0,
          zOutlet:(d.z&&isFinite(d.z[bk]))?d.z[bk]:null};
}

/* ---------- Handlers ---------- */
document.getElementById('btnANA').onclick=fetchANA;
document.getElementById('hCSV').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f)return;
  try{ const years=parseHidrowebCSV(await f.text());
    if(setSerie(years)) toast('CSV carregado'); }
  catch(err){ toast('Erro no CSV: '+err.message); }
  e.target.value='';
});
document.getElementById('btnPaste').onclick=()=>{
  const b=document.getElementById('hPasteBox'), ok=document.getElementById('btnPasteOk');
  const show=b.style.display==='none';
  b.style.display=show?'block':'none'; ok.style.display=show?'block':'none';
};
document.getElementById('btnPasteOk').onclick=()=>{
  if(setSerie(parsePasted(document.getElementById('hPasteBox').value))) toast('Máximas anuais registradas');
};
document.getElementById('btnIDF').onclick=runIDF;
['hAno','hDep'].forEach(id=>{
  const el=document.getElementById(id); if(!el) return;
  el.onchange=()=>{
    if(id==='hAno' && S.hidro.diario){ setSerie(maximasAnuais(S.hidro.diario.dias)); toast('Máximas recalculadas'); }
    else if(id==='hDep') toast('Recarregue o CSV para aplicar');
  };
});
document.getElementById('btnIdfPNG').onclick=()=>{
  const f=S.hidro.idf; const cv=document.getElementById('idfChart');
  if(!f||!cv){ toast('Gere a curva IDF primeiro'); return; }
  /* Recompoe num canvas maior, com fundo branco e legenda da equação — o
     canvas da tela tem 800x380 e sai serrilhado num relatório impresso.    */
  const ESC=2, MB=46;
  const out=document.createElement('canvas');
  out.width=cv.width*ESC; out.height=cv.height*ESC+MB*ESC;
  const c=out.getContext('2d');
  c.fillStyle='#fff'; c.fillRect(0,0,out.width,out.height);
  c.imageSmoothingEnabled=true; c.imageSmoothingQuality='high';
  c.drawImage(cv,0,0,out.width,cv.height*ESC);
  const y0=cv.height*ESC+18*ESC;
  c.fillStyle='#1a1206'; c.textAlign='left';
  c.font='bold '+(11*ESC)+'px Signika,sans-serif';
  c.fillText(`i = ${f.K.toFixed(2)} \u00b7 T^${f.a.toFixed(4)} / (t + ${f.b.toFixed(2)})^${f.c.toFixed(4)}`, 14*ESC, y0);
  c.font=(9*ESC)+'px Signika,sans-serif'; c.fillStyle='#555';
  const met = f.met==='atlas' ? 'GEV/momentos-L + desagrega\u00e7\u00e3o Atlas' : 'Gumbel/Chow + desagrega\u00e7\u00e3o CETESB';
  c.fillText(`${met} \u00b7 n = ${f.n} anos \u00b7 R\u00b2(log) = ${f.r2.toFixed(4)} \u00b7 i em mm/h, t em min, T em anos`,
             14*ESC, y0+14*ESC);
  out.toBlob(async b=>{
    if(b) await entregarImagem(b, 'IDF_'+(new Date().toISOString().slice(0,10)));
  },'image/png');
};
document.getElementById('btnIdfCSV').onclick=()=>{
  const f=S.hidro.idf; if(!f||!f.rows.length)return;
  let csv='t_min;'+f.Ts.map(T=>'T'+T).join(';')+'\n';
  f.durs.forEach(t=>{ csv+=t+';'+f.Ts.map(T=>f.rows.find(x=>x.t===t&&x.T===T).i.toFixed(2)).join(';')+'\n'; });
  csv+='\nEquacao;i='+f.K.toFixed(2)+'*T^'+f.a.toFixed(4)+'/(t+'+f.b+')^'+f.c.toFixed(4)+'\n';
  download(new Blob([csv],{type:'text/csv'}),'idf.csv');
};
document.getElementById('btnIdfManual').onclick=()=>{
  const box=document.getElementById('hIdfManual');
  const show=box.style.display==='none'; box.style.display=show?'flex':'none';
  if(!show){ const K=+document.getElementById('mK').value,a=+document.getElementById('mA').value,
      b=+document.getElementById('mB').value,c=+document.getElementById('mC').value;
    if([K,a,b,c].every(isFinite)&&K>0){ S.hidro.idf={K,a,b,c,Ts:[2,5,10,25,50,100],rows:[],r2:1};
      toast('Parâmetros manuais em uso'); } }
};
document.getElementById('hASC').addEventListener('change',async e=>{
  const f=e.target.files[0]; if(!f)return;
  try{ showLoad('Lendo MDE…');
    await window.GeoMineImportRecovery?.before();
    const ext=(f.name.split('.').pop()||'').toLowerCase();
    let d;
    if(ext==='tif'||ext==='tiff') d=await parseTIFF(await bufferFonte(f));
    else if(ext==='asc'||ext==='txt') d=parseASC(await f.text());
    else { // detectar pelo conteúdo: TIFF começa com II*\0 ou MM\0*
      const head=new Uint8Array(await f.slice(0,4).arrayBuffer());
      const isTif=(head[0]===0x49&&head[1]===0x49&&head[2]===42)||(head[0]===0x4d&&head[1]===0x4d&&head[3]===42);
      d=isTif? await parseTIFF(await bufferFonte(f)) : parseASC(await f.text());
    }
    const g=await hidroGrid(d,'carregar o MDE do Hidro');
    if(!g){ toast('MDE não instalado'); return; }
    if(typeof hShadeOff==='function') hShadeOff(true);
    S.hidro.dem=g;
    window.GeoMineNativeFlood?.bindSource({name:f.name||'MDE da Hidrologia',d,crs:d.crs||d.srcCRS||S.workCRS},g);
    document.getElementById('hDemOut').innerHTML=hidroDemHTML(g,d);
    ['btnFill','btnShade','btnRaw','btnD8Dir'].forEach(id=>{const e=document.getElementById(id); if(e) e.disabled=false;});
    if(typeof hTopoRefresh==='function') hTopoRefresh();   // libera a se\u00e7\u00e3o 3.5
    if(typeof hThrHintUpd==='function') hThrHintUpd();
    if(typeof hResHintUpd==="function") hResHintUpd(); if(typeof hInundStats==="function") try{hInundStats();}catch(e){}
  }catch(err){ toast('Erro: '+err.message); }
  finally{ hideLoad(); e.target.value=''; }
});
(function bindHidroTopo(){
  const b=(id,ev,fn)=>{ const e=document.getElementById(id); if(e) e[ev]=fn; };
  b('btnTopoMonta','onclick',hMontaTopo);
  b('btnFeicApl','onclick',hAplicaFeicoes);
  b('btnFeicUndo','onclick',hFeicUndo);
  b('btnFeicReset','onclick',hFeicReset);
  b('hFeicTipo','onchange',hFeicTipoToggle);
  b('btnFeicDraw','onclick',hFeicDesenhar);
  b('btnFeicVtx','onclick',hFeicEditar);
  b('btnFeicCota','onclick',hFeicCotar);
  b('hThr','oninput',hThrHintUpd);
  const inp=document.getElementById('hTopoTIF');
  if(inp) inp.onchange=async(e)=>{
    const fs=[...e.target.files]; if(!fs.length) return;
    try{ for(const f of fs) await addRasterFromTIFF(f, f.name, f.size); hTopoRefresh(); }
    catch(err){ toast('Erro: '+(err.message||err)); }
    finally{ hideLoad(); e.target.value=''; }
  };
  hFeicTipoToggle();
})();
document.getElementById('btnFill').onclick=async()=>{
  const d=S.hidro.dem; if(!d)return;
  const M=(d.nc*d.nr/1e6).toFixed(1);
  progStart(`Preenchendo depressões · ${d.nc}×${d.nr} (${M} M células)`);
  try{
    const passes=await fillSinksAsync(d, 0, 1);
    delete d.dir; delete d.acc;
    d._bruto=false;
    document.getElementById('hFillOut').innerHTML=`MDE preenchido em <b>${passes}</b> varreduras. <b>Delimitação de bacia habilitada.</b> Direção, acumulação e rede são produtos opcionais.`;
    document.getElementById('btnD8Dir').disabled=false;
    ['btnD8Acc','btnStreams'].forEach(id=>document.getElementById(id).disabled=true);
    document.getElementById('btnBasin').disabled=false;
    toast('Depressões preenchidas — já pode delimitar a bacia');
    try{laminaD8Status();}catch(e){}
  }catch(err){ toast('Falha no preenchimento: '+(err.message||err)); }
  finally{ hideLoad(); }
};
/* Volta ao MDT bruto sem executar as etapas seguintes. */
document.getElementById('btnRaw').onclick=async()=>{
  const d=S.hidro.dem; if(!d) return;
  delete d.zf; delete d.dir; delete d.acc; d._bruto=true;
  document.getElementById('hFillOut').innerHTML='MDT bruto selecionado. As depressões naturais funcionarão como sumidouros. Delimitação de bacia habilitada.';
  document.getElementById('btnD8Dir').disabled=false;
  ['btnD8Acc','btnStreams'].forEach(id=>document.getElementById(id).disabled=true);
  document.getElementById('btnBasin').disabled=false;
  toast('MDT bruto selecionado — já pode delimitar a bacia');
  try{laminaD8Status();}catch(e){}
};

function hDirecaoSetas(d,source=(S.rasters||[]).find(r=>String(r.id)===String(S.hidro.sourceRasterId))){
  const valid=d.dir.reduce((n,v)=>n+(v>=0),0);
  const passo=Math.max(1,Math.ceil(Math.sqrt(valid/5000)));
  const feats=[], cs=+d.cs||1, csy=+(d.csy||d.cs)||cs;
  for(let r=0;r<d.nr;r+=passo) for(let c=0;c<d.nc;c+=passo){
    const k=r*d.nc+c, dn=d.dir[k]; if(dn<0) continue;
    const a=cellXY(d,k), b=cellXY(d,dn), dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
    const ux=dx/len,uy=dy/len,L=.72*Math.min(cs,csy)*passo;
    const e=[a[0]+ux*L,a[1]+uy*L], h=.25*L, px=-uy,py=ux;
    const h1=[e[0]-ux*h+px*h*.65,e[1]-uy*h+py*h*.65];
    const h2=[e[0]-ux*h-px*h*.65,e[1]-uy*h-py*h*.65];
    const az=(Math.atan2(dx,dy)*180/Math.PI+360)%360;
    feats.push({geom:[[a,e],[h1,e,h2]],multi:true,props:{AZIMUTE:+az.toFixed(1),CELULA:k}});
  }
  const velhas=S.layers.filter(l=>/^Direção de fluxo D8/.test(l.name)); velhas.forEach(deleteVectorLayer);
  const L=addLayer({sourceLayer:source,name:'Direção de fluxo D8 — setas',gtype:'line',crs:S.workCRS,features:feats,
    fields:[{name:'AZIMUTE',type:'N',length:8,decimal:1},{name:'CELULA',type:'N',length:12,decimal:0}],
    color:'#2585c7'});
  L.weight=1.4; if(L.sym){L.sym.weight=1.4;L.sym.color='#2585c7';}
  refreshUI(); fitLayer(L);
  return feats.length;
}
document.getElementById('btnD8Dir').onclick=async()=>{
  const source=(S.rasters||[]).find(r=>String(r.id)===String(S.hidro.sourceRasterId));
  const d=S.hidro.dem; if(!d){toast('Carregue o MDE primeiro');return;}
  progStart(`Direção de fluxo D8 · ${d.nc}×${d.nr}`);
  try{
    await d8dirAsync(d,0,1);
    delete d.acc;
    const n=hDirecaoSetas(d,source);
    document.getElementById('hDirOut').innerHTML=`Direção D8 calculada. <b>${n.toLocaleString('pt-BR')}</b> setas amostradas no mapa.`;
    document.getElementById('btnD8Acc').disabled=false;
    document.getElementById('btnStreams').disabled=true;
    document.getElementById('btnBasin').disabled=false;
    toast('Direção de fluxo gerada com setas');
    try{laminaD8Status();}catch(e){}
  }catch(err){toast('Falha na direção D8: '+(err.message||err));}
  finally{hideLoad();}
};
function hAccSelectRefresh(selId){
  const s=document.getElementById('hAccSel'); if(!s)return;
  const prev=selId||s.value;
  const rs=S.rasters.filter(r=>r.d&&r.d._d8Source);
  s.innerHTML='<option value="atual">Acumulação D8 atual</option>'+
    rs.map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('');
  if([...s.options].some(o=>o.value===String(prev)))s.value=String(prev);
}
document.getElementById('btnD8Acc').onclick=async()=>{
  const source=(S.rasters||[]).find(r=>String(r.id)===String(S.hidro.sourceRasterId));
  const d=S.hidro.dem; if(!d||!d.dir){toast('Gere primeiro a direção de fluxo');return;}
  progStart(`Acumulação de fluxo · ${d.nc}×${d.nr}`);
  try{
    await d8accAsync(d,0,1);
    const gd={nc:d.nc,nr:d.nr,cs:d.cs,csy:d.csy,xll:d.xll,yll:d.yll,z:new Float32Array(d.acc)};
    Object.defineProperty(gd,'_d8Source',{value:d,writable:true,enumerable:false});
    const r={id:rid++,name:'Acumulação de fluxo D8',d:gd,
      src:{file:'D8('+((S.hidro.demName)||'MDE')+')',size:0,at:new Date().toISOString()},
      style:{mode:'hipso',opacity:.82},visible:true,overlay:null};
    S.rasters.push(r);placeProductAbove(r,source);renderRaster(r);S.selRaster=r;refreshUI();hAccSelectRefresh(r.id);
    projectAutoSaveRaster(r);
    document.getElementById('hAccOut').innerHTML=`Acumulação calculada para <b>${d.nc*d.nr}</b> células e adicionada como raster.`;
    ['btnStreams','btnBasin'].forEach(id=>document.getElementById(id).disabled=false);
    toast('Acumulação D8 gerada como nova camada raster');
    try{laminaD8Status();}catch(e){}
  }catch(err){toast('Falha na acumulação: '+(err.message||err));}
  finally{hideLoad();}
};
/* O sombreado do Hidro é um overlay do Leaflet preso à grade do MDE, e NÃO uma
   camada da lista — por isso desligar os rasters no painel não o apagava. Agora
   o próprio botão liga e desliga, e a etiqueta diz em que estado ele está.   */
function hShadeOff(silencioso){
  /* Duas referências de propósito: a da grade atual e uma global. Quando o MDE
     é trocado (religar a fonte, mudar a resolução, montar topografia), o objeto
     antigo se perde e o overlay ficava órfão no mapa, sem dono e sem olho para
     desligar. A global garante que dá para removê-lo de qualquer jeito.      */
  let achou=false;
  const d=S.hidro && S.hidro.dem;
  if(d && d.overlay){ try{ map.removeLayer(d.overlay); }catch(e){} d.overlay=null; achou=true; }
  if(S._shadeOv){ try{ map.removeLayer(S._shadeOv); }catch(e){} S._shadeOv=null; achou=true; }
  const b=document.getElementById('btnShade');
  if(b) b.textContent='Sombreado no mapa';
  if(!silencioso) toast(achou?'Sombreado removido':'Não havia sombreado no mapa');
  return achou;
}
document.getElementById('btnShade').onclick=()=>{
  const d=S.hidro.dem; if(!d)return;
  if(d.overlay || S._shadeOv){ hShadeOff(); return; }   // já ligado: desliga
  const cv=document.createElement('canvas'); if(!cv.getContext){toast('Canvas indisponível');return;}
  cv.width=d.nc; cv.height=d.nr;
  const ctx=cv.getContext('2d'); const im=ctx.createImageData(d.nc,d.nr);
  const z=d.zf||d.z; const az=315*Math.PI/180, alt=45*Math.PI/180;
  for(let r=0;r<d.nr;r++) for(let c=0;c<d.nc;c++){
    const k=r*d.nc+c; let v=180;
    if(!isNaN(d.z[k]) && r>0&&c>0&&r<d.nr-1&&c<d.nc-1){
      const dzdx=(z[k+1]-z[k-1])/(2*d.cs), dzdy=(z[k-d.nc]-z[k+d.nc])/(2*d.cs);
      const sl=Math.atan(Math.hypot(dzdx,dzdy)); const asp=Math.atan2(dzdy,-dzdx);
      v=Math.max(0,Math.min(255, 255*(Math.cos(alt)*Math.cos(sl)+Math.sin(alt)*Math.sin(sl)*Math.cos(az-asp))));
    }
    const o=k*4; im.data[o]=im.data[o+1]=im.data[o+2]=v; im.data[o+3]=isNaN(d.z[k])?0:255;
  }
  ctx.putImageData(im,0,0);
  const b0=[d.xll,d.yll,d.xll+d.nc*d.cs,d.yll+d.nr*(d.csy||d.cs)];
  const wp=warpCanvasWM(cv, b0);                 // rotação da malha UTM
  const b=wp.b;
  const sw = wp.wm? reproj('EPSG:3857','EPSG:4326',b[0],b[1]) : toWGS(S.workCRS,b[0],b[1]);
  const ne = wp.wm? reproj('EPSG:3857','EPSG:4326',b[2],b[3]) : toWGS(S.workCRS,b[2],b[3]);
  if(d.overlay) map.removeLayer(d.overlay);
  d.overlay=L2.imageOverlay(wp.cv.toDataURL(),[[sw[1],sw[0]],[ne[1],ne[0]]],{opacity:0.7}).addTo(map);
  S._shadeOv=d.overlay;
  safeFit([[sw[1],sw[0]],[ne[1],ne[0]]]);
  document.getElementById('btnShade').textContent='✕ Remover sombreado';
  toast('Sombreado no mapa — o mesmo botão remove');
};
document.getElementById('btnStreams').onclick=()=>{
  const botao=document.getElementById('btnStreams');
  if(botao&&botao.dataset.running==='1'){ toast('A rede já está sendo processada'); return; }
  const av=(document.getElementById('hAccSel')||{}).value||'atual';
  const ar=S.rasters.find(r=>String(r.id)===String(av));
  const d=(ar&&ar.d&&ar.d._d8Source)||S.hidro.dem;
  if(!d||!d.acc){toast('Calcule primeiro a acumulação de fluxo');return;}
  const thr=+document.getElementById('hThr').value||200;
  if(botao){ botao.dataset.running='1';botao.disabled=true;botao.textContent='Extraindo…'; }
  showLoad('Traçando linhas de fluxo…');
  setTimeout(()=>{
    try{
      const feats=streamsFromDEM(d,thr);
      if(!feats.length){ toast('Nenhuma linha acima do limiar '+thr); return; }
      /* Camadas gigantes travam o mapa de verdade; melhor perguntar antes. */
      if(feats.length>20000 && !confirm(
          `O limiar de ${thr} c\u00e9lulas gera ${feats.length.toLocaleString('pt-BR')} linhas. `+
          `Isso deixa o mapa muito lento.\n\nAumente o limiar para reduzir a densidade.\n\n`+
          `Gerar assim mesmo?`)) return;
      /* Cada nova combinação de acumulação + limiar é um resultado próprio.
         Não apagar a anterior permite comparar fatores e evita a impressão de
         que o segundo processamento não aconteceu. */
      const n=1+S.layers.reduce((mx,l)=>{
        const m=String(l.name||'').match(/^Rede de drenagem (\d+)/);
        return m?Math.max(mx,+m[1]):mx;
      },0);
      const fonte=ar?ar.name:'Acumulação D8 atual';
      feats.forEach(f=>{
        f.props=f.props||{};
        f.props.LIMIAR=thr;f.props.FONTE=fonte;f.props.REDE=n;
      });
      const L=addLayer({sourceLayer:ar||'R:'+S.hidro.sourceRasterId,
        name:`Rede de drenagem ${n} — limiar ${thr}${d._bruto?' · bruto':''}`,
        gtype:'line',crs:S.workCRS,features:feats,
        fields:[
          {name:'ACUM_MAX',type:'N',length:12,decimal:0},
          {name:'LIMIAR',type:'N',length:12,decimal:0},
          {name:'REDE',type:'N',length:6,decimal:0},
          {name:'FONTE',type:'C',length:80,decimal:0}
        ],color:'#2585c7'
      });
      if(L){ L.weight=2.2;if(L.sym){L.sym.weight=2.2;L.sym.color='#2585c7';}drawLayer(L); }
      refreshUI();if(L)fitLayer(L);
      const o=document.getElementById('hStreamsOut');
      if(o)o.innerHTML=`<b>Rede ${n}</b> criada · ${feats.length.toLocaleString('pt-BR')} trechos · `+
        `limiar <b>${thr}</b> células · fonte “${esc(fonte)}”.<br>`+
        `<span style="color:var(--ink-dim)">Altere o limiar e extraia novamente para criar outra camada comparável.</span>`;
      toast(`Rede de drenagem ${n} gerada — ${feats.length.toLocaleString('pt-BR')} trechos`);
    }catch(err){
      toast('Falha ao extrair a rede: '+(err&&err.message||err));
    }finally{
      hideLoad();
      if(botao){delete botao.dataset.running;botao.disabled=false;botao.textContent='Extrair rede';}
    }
  },30);
};
function hSaiModoBacia(){
  if(S.tool==='basin'){ try{setTool('select');}catch(e){S.tool='select';}
    map.getContainer().style.cursor='default'; }
}
async function hGaranteD8Bacia(d){
  if(!d || !d.z) throw new Error('MDE hidrológico não carregado');
  if(!d.zf && d._bruto!==true)
    throw new Error('Preencha as depressões antes de delimitar a bacia');
  if(d.dir && d.acc) return;
  const precisaDir=!d.dir, precisaAcc=!d.acc;
  progStart(`Preparando delimitação da bacia · ${d.nc}×${d.nr}`);
  try{
    /* Cálculo silencioso: não cria camada de setas nem raster de acumulação.
       Esses produtos só são adicionados quando seus próprios comandos forem
       escolhidos explicitamente na faixa Hidrologia. */
    if(precisaDir) await d8dirAsync(d,0,precisaAcc ? .48 : 1);
    if(precisaAcc) await d8accAsync(d,precisaDir ? .48 : 0,1);
  }finally{
    hideLoad();
  }
}
document.getElementById('btnHidroLimpa').onclick=()=>{
  hSaiModoBacia();
  const alvo=S.layers.filter(l=>/^Linhas de fluxo|^Rede de drenagem |^Bacia \(/.test(l.name));
  const out=document.getElementById('hLimpaOut');
  if(!alvo.length){ if(out) out.textContent='Nada a limpar.'; toast('Nenhuma camada de fluxo ou bacia'); return; }
  const n=alvo.length, feicoes=alvo.reduce((a,l)=>a+(l.features?l.features.length:0),0);
  alvo.forEach(l=>deleteVectorLayer(l));
  hShadeOff(true);
  refreshUI(); zApply();
  if(out) out.textContent=`${n} camada(s) e ${feicoes.toLocaleString('pt-BR')} fei\u00e7\u00e3o(\u00f5es) removida(s). `+
    `O D8 continua v\u00e1lido \u2014 pode gerar de novo sem repreencher.`;
  toast('Limpo \u2014 '+n+' camada(s) removida(s)');
};
document.getElementById('btnBasin').onclick=async()=>{
  if(S.tool==='basin'){ hSaiModoBacia(); toast('Modo bacia cancelado'); return; }   // alterna
  const d=S.hidro&&S.hidro.dem;
  if(!d){toast('Carregue ou defina o MDE hidrológico primeiro');return;}
  try{
    await hGaranteD8Bacia(d);
  }catch(e){
    const msg='Não foi possível habilitar a delimitação: '+((e&&e.message)||e);
    try{cmdLog(msg,'erro');}catch(_){}
    toast(msg); return;
  }
  /* setTool também põe o mapa em modo de desenho, desliga o arraste esquerdo
     e deixa as feições transparentes ao ponteiro. Alterar apenas S.tool fazia
     o clique ser capturado por uma camada e parecia que nada acontecia. */
  try{setTool('basin');}catch(e){S.tool='basin';}
  if(window.matchMedia('(max-width:720px)').matches) document.getElementById('side').classList.remove('open');
  map.getContainer().style.cursor='crosshair';
  try{cmdLog('BACIA: toque uma vez no exutório; o CCMGIS delimitará toda a área a montante.','cmd');}catch(e){}
  toast('Toque no mapa sobre o exutório da bacia');
};
/* Camada única de exutórios: cada bacia delimitada deixa aqui o ponto que a
   originou, com área e acumulação — serve de registro do estudo e de entrada
   para outras análises. */
function baciaRegistraExutorio(w,nome){
  if(!document.getElementById('hBaciaPtos')?.checked) return null;
  let L=(S.layers||[]).find(l=>l._exutorios);
  const props={NOME:nome,E:+w.outlet[0].toFixed(2),N:+w.outlet[1].toFixed(2),
    AREA_M2:+w.areaM2.toFixed(0),AREA_HA:+(w.areaM2/10000).toFixed(3),
    ACUM_CEL:+(w.accOutlet||0).toFixed(0),
    COTA:(w.zOutlet!=null)?+(+w.zOutlet).toFixed(2):null,
    DESLOC_M:+(w.snapM||0).toFixed(2)};
  if(!L){
    L=addLayer({name:'Exutórios',gtype:'point',crs:S.workCRS,
      features:[{geom:[[w.outlet[0],w.outlet[1]]],multi:false,
        zg:(w.zOutlet!=null)?[+w.zOutlet]:null,props}],
      fields:[{name:'NOME',type:'C',length:40},
        {name:'E',type:'N',length:14,decimal:2},{name:'N',type:'N',length:14,decimal:2},
        {name:'AREA_M2',type:'N',length:14,decimal:0},{name:'AREA_HA',type:'N',length:12,decimal:3},
        {name:'ACUM_CEL',type:'N',length:12,decimal:0},{name:'COTA',type:'N',length:10,decimal:2},
        {name:'DESLOC_M',type:'N',length:8,decimal:2}],
      color:'#f5a524'});
    L._exutorios=true;
  }else{
    L.features.push({geom:[[w.outlet[0],w.outlet[1]]],multi:false,
      zg:(w.zOutlet!=null)?[+w.zOutlet]:null,props});
    try{ drawLayer(L); }catch(e){}
  }
  return L;
}
function runBasinClick(latlng){
  if(window.GeoMinePointCatchment)return window.GeoMinePointCatchment.click(latlng);
  const d=S.hidro.dem;
  const c=fromWGS(S.workCRS, latlng.lng, latlng.lat);
  const raioEl=document.getElementById('hBaciaSnap');
  const raioM=raioEl? Math.max(0,parseFloat(String(raioEl.value).replace(',','.'))||0) : 5;
  const permitirJusante=!!document.getElementById('hBaciaJusante')?.checked;
  let w=null;
  try{ w=watershedAt(d, c[0], c[1], {raioM,permitirJusante}); }catch(e){ w=null; }
  /* Sair do modo em TODOS os caminhos: era esta a origem do travamento —
     um clique fora do MDE deixava o mapa preso capturando cliques.          */
  if(!w||!w.ring){ hSaiModoBacia();
    toast('Fora do MDE ou bacia não delimitável — modo encerrado'); return; }
  const nExut=((S.layers||[]).find(l=>l._exutorios)?.features||[]).length+1;
  const nome='Exutório '+nExut;
  addLayer({sourceLayer:'R:'+S.hidro.sourceRasterId,name:'Bacia '+nExut+' ('+fmtArea(w.areaM2)+')', gtype:'polygon', crs:S.workCRS,
    features:[{geom:[w.ring],multi:true,props:{NOME:nome,
      AREA_M2:+w.areaM2.toFixed(0),AREA_HA:+(w.areaM2/10000).toFixed(3),
      E_EXUT:+w.outlet[0].toFixed(2),N_EXUT:+w.outlet[1].toFixed(2),
      DESLOC_M:+(w.snapM||0).toFixed(2)}}],
    fields:[{name:'NOME',type:'C',length:40},
      {name:'AREA_M2',type:'N',length:14,decimal:0},{name:'AREA_HA',type:'N',length:12,decimal:3},
      {name:'E_EXUT',type:'N',length:14,decimal:2},{name:'N_EXUT',type:'N',length:14,decimal:2},
      {name:'DESLOC_M',type:'N',length:8,decimal:2}],
    color:'#7aa2f7'});
  baciaRegistraExutorio(w,nome);
  refreshUI();
  hSaiModoBacia();
  /* O deslocamento do encaixe é informado: é a única liberdade que o comando
     se dá em relação ao ponto tocado. */
  toast('Bacia delimitada: '+fmtArea(w.areaM2)+
    (w.snapM>0.01? ' · exutório encaixado a '+w.snapM.toFixed(1)+' m do toque':' · exutório no ponto tocado'));
}

/* ================== SIMULAÇÃO DE INUNDAÇÃO POR COTAS ==================
   Enche o terreno em níveis de cota e gera, por nível, a mancha de água
   (polígono via marching squares), a área alagada e o volume de água.
   Opção "conectada": só alaga células ligadas ao ponto de sangria (flood
   fill 4-viz), como um reservatório real — evita poças em depressões soltas. */
function hHydroGridStats(){
  const d=S.hidro&&S.hidro.dem;if(!d?.z)return null;
  let mn=Infinity,mx=-Infinity,nVal=0;
  for(const v of d.z)if(v!=null&&Number.isFinite(v)){mn=Math.min(mn,v);mx=Math.max(mx,v);nVal++;}
  return nVal?{mn,mx,nVal,d}:null;
}
function hInundStats(){return window.GeoMineNativeFlood?.refresh();}
function hInundPrev(){window.GeoMineNativeFlood?.preview();}
/* mancha de água de UM nível: polígonos (anéis fechados) + área.
   Se connMask for passado, só conta células true nessa máscara. */
/* mancha de água de UM nível: área, volume e o polígono do limite.
   O contorno é traçado sobre a PRÓPRIA mancha (inundContorno), não sobre o
   MDE inteiro — sem isso o polígono mostrava água do outro lado do barramento. */
function inundNivel(d, lv, connMask){
  const {nc,nr,cs,z}=d; const csy=d.csy||cs;
  let nWet=0, vol=0;
  const wet=new Uint8Array(nc*nr);
  for(let k=0;k<z.length;k++){ const t=z[k];
    if(t==null||!isFinite(t)) continue;
    if(t<lv && (!connMask || connMask[k])){ wet[k]=1; nWet++; vol+=(lv-t); } }
  return {areaM2:nWet*cs*csy, volM3:vol*cs*csy, nWet, wet,
          polys:inundContorno(d, lv, connMask)};
}
/* contorno da lâmina: campo auxiliar negativo só onde há água (dentro da
   máscara), positivo no resto, com moldura seca para os anéis fecharem. */
function inundContorno(d, lv, mask){
  const {nc,nr,z}=d; const GRANDE=1e6;
  const f=new Float32Array(nc*nr);
  for(let k=0;k<z.length;k++){
    const t=z[k];
    if(t==null||!isFinite(t)){ f[k]=GRANDE; continue; }
    f[k] = (mask && !mask[k]) ? Math.max(t-lv, 0.001) : (t-lv);
  }
  for(let c=0;c<nc;c++){ f[c]=GRANDE; f[(nr-1)*nc+c]=GRANDE; }
  for(let r=0;r<nr;r++){ f[r*nc]=GRANDE; f[r*nc+nc-1]=GRANDE; }
  const d2={nc,nr,cs:d.cs,csy:d.csy,xll:d.xll,yll:d.yll,z:f};
  let aneis=[];
  try{ aneis=contourLevel(d2, 0)||[]; }catch(e){ aneis=[]; }
  /* Um contorno legítimo anda de célula em célula: nenhuma aresta passa da
     diagonal de uma célula. Quando o contourLevel costura dois anéis que se
     tocam numa quina, surge uma ARESTA LONGA e reta ligando as duas manchas
     (a "faixa" no meio da lâmina). Quebramos a polilinha nessas arestas e
     fechamos cada pedaço sobre si — some a faixa, cada mancha vira um anel. */
  const csx=d.cs, csy2=(d.csy||d.cs), limite=Math.hypot(csx,csy2)*1.6;
  const pedacos=[];
  aneis.forEach(l=>{
    if(l.length<2) return;
    let atual=[l[0]];
    for(let k=1;k<l.length;k++){
      const seg=Math.hypot(l[k][0]-l[k-1][0], l[k][1]-l[k-1][1]);
      if(seg>limite){ if(atual.length>=3) pedacos.push(atual); atual=[l[k]]; }
      else atual.push(l[k]);
    }
    if(atual.length>=3) pedacos.push(atual);
  });
  return pedacos.map(r=>{ r=r.slice();
    const a=r[0], b=r[r.length-1];
    if(Math.hypot(a[0]-b[0],a[1]-b[1])<=limite &&
       (Math.abs(a[0]-b[0])>1e-6||Math.abs(a[1]-b[1])>1e-6)) r.push(a.slice());
    return r;
  }).filter(r=>r.length>=3);
}
/* flood fill 4-viz a partir da célula semente; `wall` bloqueia (barramento) */
function inundConectada(d, lv, seedIdx, wall){
  return GeoMineFloodFill.engine().connectedBelow(d,lv,seedIdx,wall);
}

/* ===================== BARRAMENTO =====================
   Uma linha (camada vetorial) vira uma barreira rasterizada na grade do MDE:
   as células cruzadas pela linha ficam bloqueadas e o flood fill não passa.
   A cota da crista é lida do próprio MDT ao longo da linha (interpolação). */
function barrLinhas(){
  const sel=document.getElementById('hBarrLay');
  const id=sel? sel.value : '';
  if(!id) return null;
  const L=(S.layers||[]).find(x=>String(x.id)===String(id));
  if(!L||!L.features||!L.features.length) return null;
  const conv=(p)=>{ if(L.crs===S.workCRS) return [p[0],p[1]];
    const w=toWGS(L.crs,p[0],p[1]); const c=fromWGS(S.workCRS,w[0],w[1]); return [c[0],c[1]]; };
  const linhas=[];
  L.features.forEach(f=>{
    if(!f||!f.geom) return;
    const rings=(Array.isArray(f.geom[0])&&Array.isArray(f.geom[0][0]))? f.geom : [f.geom];
    rings.forEach(r=>{ if(r&&r.length>1) linhas.push(r.map(conv)); });
  });
  return linhas.length? {L, linhas} : null;
}
function barrMascara(d, linhas){
  const {nc,nr,cs,xll,yll}=d; const csy=d.csy||cs;
  const wall=new Uint8Array(nc*nr); let n=0;
  const marca=(x,y)=>{
    const c=Math.floor((x-xll)/cs), r=(nr-1)-Math.floor((y-yll)/csy);
    if(c>=0&&c<nc&&r>=0&&r<nr){ const k=r*nc+c; if(!wall[k]){ wall[k]=1; n++; } }
  };
  const passo=Math.min(cs,csy)*0.4;      // supersampling: parede contínua, sem furo
  linhas.forEach(pts=>{
    for(let i=0;i<pts.length-1;i++){
      const a=pts[i], b=pts[i+1];
      const dist=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const m=Math.max(1,Math.ceil(dist/passo));
      for(let s=0;s<=m;s++){ const t=s/m; marca(a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t); }
    }
  });
  return {wall, cells:n};
}
function barrCrista(d, linhas){
  let zmin=Infinity, zmax=-Infinity, len=0, zOmb=Infinity;
  const passo=(d.cs||1);
  linhas.forEach(pts=>{
    for(let i=0;i<pts.length-1;i++){
      const a=pts[i], b=pts[i+1];
      const dist=Math.hypot(b[0]-a[0],b[1]-a[1]); len+=dist;
      const m=Math.max(1,Math.ceil(dist/passo));
      for(let s=0;s<=m;s++){ const t=s/m;
        const x=a[0]+(b[0]-a[0])*t, y=a[1]+(b[1]-a[1])*t;
        let z=null;
        try{ z=(typeof sampleZbil==='function')? sampleZbil(d,x,y) : null; }catch(e){}
        if(z!=null&&isFinite(z)){ if(z<zmin)zmin=z; if(z>zmax)zmax=z; } }
    }
  });
  // ombreiras = pontas da linha; acima delas a água contorna o barramento
  linhas.forEach(pts=>{ [pts[0], pts[pts.length-1]].forEach(p=>{
    let z=null; try{ z=(typeof sampleZbil==='function')? sampleZbil(d,p[0],p[1]) : null; }catch(e){}
    if(z!=null&&isFinite(z)&&z<zOmb) zOmb=z; }); });
  return {zmin:isFinite(zmin)?zmin:null, zmax:isFinite(zmax)?zmax:null,
          zOmb:isFinite(zOmb)?zOmb:null, len};
}
function hBarrSync(){
  const sel=document.getElementById('hBarrLay'); if(!sel) return;
  const cur=sel.value;
  const linhas=(S.layers||[]).filter(L=>L.gtype==='line');
  sel.innerHTML='<option value="">— sem barramento —</option>'+
    linhas.map(L=>`<option value="${L.id}">${esc(L.name)}</option>`).join('');
  if(linhas.some(L=>String(L.id)===String(cur))) sel.value=cur;
  else { const b=linhas.find(L=>/barramento|barragem|dique/i.test(L.name)); if(b) sel.value=String(b.id); }
}
function hBarrInfo(){
  const out=document.getElementById('hBarrOut'); if(!out) return;
  const B=barrLinhas();
  if(!B){ out.innerHTML='Sem barramento: a água espalha livre pelo terreno. Escolha uma linha ou trace uma no mapa.'; return; }
  const d=S.hidro&&S.hidro.dem;
  if(!d){ out.innerHTML=`Barramento: <b>${esc(B.L.name)}</b> — carregue o MDE para ler a cota da crista.`; return; }
  const c=barrCrista(d,B.linhas);
  out.innerHTML=`Barramento: <b>${esc(B.L.name)}</b> · ${c.len.toFixed(1)} m de extensão<br>`+
    (c.zmin!=null? `Crista pelo MDT: mín <b>${c.zmin.toFixed(2)} m</b> · máx ${c.zmax.toFixed(2)} m — `+
      `acima de ${c.zmin.toFixed(2)} m transborda pelo ponto mais baixo`+
      (c.zOmb!=null? ` · ombreiras a ${c.zOmb.toFixed(2)} m (acima disso a água contorna as pontas)` : '')+'.'
      : 'Linha fora do MDE.');
}
/* traçado do barramento direto no mapa */
function barrClick(latlng){
  if(!S._barrBuf) S._barrBuf=[];
  S._barrBuf.push([latlng.lat,latlng.lng]);
  if(S._barrTmp){ try{ map.removeLayer(S._barrTmp); }catch(e){} }
  S._barrTmp=L2.polyline(S._barrBuf,{color:'#f5a524',weight:3,dashArray:'5 4',interactive:false}).addTo(map);
  cmdLog(`barramento: ${S._barrBuf.length} ponto(s) — toque em “✓ Concluir” para fechar`,'info');
}
function barrFinaliza(){
  const buf=S._barrBuf||[];
  if(S._barrTmp){ try{ map.removeLayer(S._barrTmp); }catch(e){} S._barrTmp=null; }
  S._barrBuf=null; try{ setTool('pan'); }catch(e){ S.tool=null; }
  const b=document.getElementById('btnBarrDraw'); if(b) b.textContent='✏ Traçar no mapa';
  if(buf.length<2){ toast('Barramento precisa de ao menos 2 pontos'); return; }
  const pts=buf.map(ll=>{ const c=fromWGS(S.workCRS, ll[1], ll[0]); return [c[0],c[1]]; });
  const L=addLayer({name:'Barramento', gtype:'line', crs:S.workCRS,
    features:[{geom:pts, multi:false, props:{TIPO:'barramento'}}],
    fields:[{name:'TIPO',type:'C',length:20,decimal:0}], color:'#f5a524'});
  refreshUI(); hBarrSync();
  const sel=document.getElementById('hBarrLay'); if(sel) sel.value=String(L.id);
  hBarrInfo();
  toast('Barramento traçado — edite os vértices na aba EDITOR DE VETORES se precisar');
}

async function runInundacao(seedLatLng, modo){
  if(!window.GeoMineNativeFlood){toast('Módulo de inundação nativa indisponível.');return;}
  return window.GeoMineNativeFlood.run(seedLatLng,modo);
}

/* ===================== LÂMINA A PARTIR DA CHUVA =====================
   Toca-se um ponto. O app:
     1. delimita a BACIA que contribui até ali (D8, direções + acumulação);
     2. estima o tempo de concentração (Kirpich) com o comprimento e o
        desnível da própria bacia;
     3. pega a CHUVA CRÍTICA — o maior evento observado na série histórica
        e/ou a IDF para o período de retorno pedido, na duração tc;
     4. converte em volume escoado: V = C · P · A;
     5. SOBE a lâmina por bisseção até o reservatório acomodar esse volume,
        respeitando o barramento se houver.
   É um balanço ESTÁTICO: tudo o que escoa fica armazenado, sem saída nem
   infiltração. É essa hipótese que faz dele o cenário mais crítico.      */
/* Chuva crítica tirada da SÉRIE DIÁRIA (S.hidro.diario.dias = {Y,M,D,p,st}).
   'acum'   = maior acumulado em N dias SEGUIDOS (janela móvel no calendário —
              respeita falhas: dia ausente entra como zero, não emenda o período);
   'topN'   = soma dos N maiores dias do período inteiro (limite superior);
   'mediaN' = média dos N maiores dias.                                     */
function chuvaDiariaCritica(dias, N, criterio){
  if(!dias || !dias.length) return null;
  N=Math.max(1, Math.min(60, Math.round(N)||1));
  const dt=x=>String(x.D).padStart(2,'0')+'/'+String(x.M).padStart(2,'0')+'/'+x.Y;
  if(criterio==='topN' || criterio==='mediaN'){
    const top=dias.slice().sort((a,b)=>b.p-a.p).slice(0,N);
    const soma=top.reduce((s,x)=>s+x.p,0);
    const P=(criterio==='topN')? soma : soma/top.length;
    const lista=top.slice(0,4).map(x=>dt(x)+' ('+x.p.toFixed(1)+' mm)').join(', ');
    return {P, n:top.length,
      detalhe:(criterio==='topN'?'soma dos ':'média dos ')+top.length+' maiores dias — '+
              lista+(top.length>4?'…':'')};
  }
  const chave=x=>Math.round(Date.UTC(x.Y,x.M-1,x.D)/86400000);
  const mapa=new Map(); dias.forEach(x=>mapa.set(chave(x), x.p));
  let melhor=-1, fim=null;
  dias.forEach(x=>{ const k0=chave(x); let s=0;
    for(let i=0;i<N;i++) s+=(mapa.get(k0-i)||0);
    if(s>melhor){ melhor=s; fim=x; } });
  if(melhor<0) return null;
  return {P:melhor, n:N,
    detalhe:'maior acumulado em '+N+' dia(s) seguidos — janela terminando em '+(fim?dt(fim):'—')};
}
function laminaCnAMC(cn2,amc){
  cn2=Math.max(1,Math.min(100,+cn2||1));
  if(amc==='I') return cn2/(2.281-0.01281*cn2);
  if(amc==='III') return cn2/(0.427+0.00573*cn2);
  return cn2;
}
function laminaQscs(P,cn){
  cn=Math.max(1,Math.min(100,cn));
  const S=25400/cn-254, Ia=.2*S;
  return P>Ia? Math.pow(P-Ia,2)/(P+.8*S) : 0;
}
function cnValoresGrupo(){
  const g=(document.getElementById('hCnGrupoOrto')||document.getElementById('hLamGrupo')||{}).value||'C';
  const p={A:[88,74,49],B:[91,80,61],C:[94,85,70],D:[96,89,77]}[g]||[94,85,70];
  return {grupo:g,rock:p[0],ant:p[1],veg:p[2]};
}
function cnRingDaFeicao(L,f){
  if(!L||!f||L.gtype!=='polygon'||!f.geom)return null;
  let rs=(f.multi&&Array.isArray(f.geom[0]&&f.geom[0][0]))?f.geom:[f.geom];
  rs=rs.filter(r=>r&&r.length>=3).map(r=>r.map(p=>{
    if(!L.crs||L.crs===S.workCRS)return [p[0],p[1]];
    const w=toWGS(L.crs,p[0],p[1]);return fromWGS(S.workCRS,w[0],w[1]);
  }));
  if(!rs.length)return null;
  return rs.sort((a,b)=>Math.abs(baciaArea(b))-Math.abs(baciaArea(a)))[0];
}
function cnLimiteAtual(){
  const modo=(document.getElementById('hCnLimite')||{}).value||'selecionado';
  if(modo==='orto')return {ring:null,nome:'extensão válida da ortofoto'};
  if(modo==='selecionado'){
    const sf=S.selFeat,L=sf&&sf.layer,f=L&&L.features&&L.features[sf.idx];
    const ring=cnRingDaFeicao(L,f);
    return ring?{ring,nome:L.name||'polígono selecionado'}:null;
  }
  const L=(S.layers||[]).find(l=>l.gtype==='polygon'&&l.name==='Limite da análise CN'&&(l.features||[]).length);
  const f=L&&L.features[L.features.length-1],ring=cnRingDaFeicao(L,f);
  return ring?{ring,nome:'Limite da análise CN'}:null;
}
function cnFeat(D,w,h,k){
  const o=k*4,R=D[o],G=D[o+1],B=D[o+2],sum=Math.max(1,R+G+B);
  const mx=Math.max(R,G,B),mn=Math.min(R,G,B),sat=mx?(mx-mn)/mx:0;
  const r=k/w|0,c=k%w;
  const kr=r*w+Math.min(w-1,c+2),kd=Math.min(h-1,r+2)*w+c;
  const grad=(Math.abs(R-D[kr*4])+Math.abs(G-D[kr*4+1])+Math.abs(B-D[kr*4+2])+
              Math.abs(R-D[kd*4])+Math.abs(G-D[kd*4+1])+Math.abs(B-D[kd*4+2]))/(6*255);
  return [R/sum,G/sum,B/sum,(2*G-R-B)/255,sat,(R+G+B)/(3*255),grad];
}
function cnDist(a,b){let s=0;for(let i=0;i<a.length;i++){const w=i===3?2.2:(i===6?.7:1),d=a[i]-b[i];s+=w*d*d;}return s;}
function cnKmeans(amostras,K){
  const C=[];for(let j=0;j<K;j++)C.push(amostras[Math.floor((j+.5)*amostras.length/K)].slice());
  for(let it=0;it<10;it++){
    const S0=Array.from({length:K},()=>new Float64Array(C[0].length)),N=new Uint32Array(K);
    for(const a of amostras){let q=0,bd=Infinity;for(let j=0;j<K;j++){const d=cnDist(a,C[j]);if(d<bd){bd=d;q=j;}}
      N[q]++;for(let u=0;u<a.length;u++)S0[q][u]+=a[u];}
    for(let j=0;j<K;j++)if(N[j])for(let u=0;u<C[j].length;u++)C[j][u]=S0[j][u]/N[j];
  }
  return C;
}
function cnClasseCentro(c){
  const veg=2.4*c[3]+1.2*(c[1]-c[0])+.35*c[4];
  if(veg>.12)return 3;
  const antrop=(1-c[4])*.7+c[5]*.28+c[6]*.22;
  const rocha=c[4]*.55+Math.max(0,c[0]-c[1])*.8+(1-c[5])*.08;
  return antrop>rocha+.22?2:1;
}
function cnMdtAtual(){
  const id=(document.getElementById('hCnMDT')||{}).value;
  return (S.rasters||[]).find(r=>String(r.id)===String(id))||null;
}
function cnSlopePct(d,x,y){
  if(!d)return null;
  const c=Math.floor((x-d.xll)/d.cs),csy=d.csy||d.cs,
        r=d.nr-1-Math.floor((y-d.yll)/csy);
  if(c<1||r<1||c>=d.nc-1||r>=d.nr-1)return null;
  const z=d.zf||d.z,k=r*d.nc+c;
  const a=z[k-1],b=z[k+1],u=z[k-d.nc],v=z[k+d.nc];
  if(![a,b,u,v].every(isFinite))return null;
  return 100*Math.hypot((b-a)/(2*d.cs),(u-v)/(2*csy));
}
function cnDeclClasse(s){
  if(s==null||!isFinite(s))return {id:0,nome:'sem classe'};
  if(s<3)return {id:1,nome:'plano (0–3%)'};
  if(s<8)return {id:2,nome:'suave (3–8%)'};
  if(s<20)return {id:3,nome:'moderado (8–20%)'};
  return {id:4,nome:'íngreme (>20%)'};
}
function cnDetalhe(c,f,slope,grupo){
  const tab={
    A:{rocha:93,solo:77,imperv:98,compact:74,vd:39,vm:49,vr:60},
    B:{rocha:96,solo:86,imperv:98,compact:82,vd:55,vm:61,vr:69},
    C:{rocha:97,solo:91,imperv:98,compact:88,vd:65,vm:70,vr:77},
    D:{rocha:98,solo:94,imperv:98,compact:91,vd:72,vm:77,vr:83}
  }[grupo]||{rocha:97,solo:91,imperv:98,compact:88,vd:65,vm:70,vr:77};
  if(c===3){
    if(f[3]>.42)return {key:'vd',nome:'Vegetação densa',cn:tab.vd,cor:'#237a3b',broad:3};
    if(f[3]>.20)return {key:'vm',nome:'Vegetação média',cn:tab.vm,cor:'#4fa85f',broad:3};
    return {key:'vr',nome:'Vegetação rala',cn:tab.vr,cor:'#8bc879',broad:3};
  }
  if(c===2){
    if(f[4]<.13&&f[5]>.48)return {key:'imperv',nome:'Superfície impermeável',cn:tab.imperv,cor:'#505966',broad:2};
    return {key:'compact',nome:'Solo compactado / antropizado',cn:tab.compact,cor:'#89919b',broad:2};
  }
  if((slope!=null&&slope>20)||(f[4]<.20&&f[5]<.55))
    return {key:'rocha',nome:'Rocha exposta',cn:tab.rocha,cor:'#9a5725',broad:1};
  return {key:'solo',nome:'Solo exposto',cn:tab.solo,cor:'#c88245',broad:1};
}
/* O raster continua sendo a matriz analítica, mas o produto GIS é vetorial.
   A redução por blocos evita transformar ruído de pixel em milhões de
   polígonos; o limite mínimo informado pelo usuário faz a generalização final. */
async function cnPoligonizarRaster(r,areaMin,totalArea){
  if(!r||!r.d)return null;
  const d=r.d, classes=(r.style&&r.style.classes)||[];
  const alvo=1200000;
  const fat=Math.max(1,Math.ceil(Math.sqrt((d.nc*d.nr)/alvo)));
  const nc=Math.ceil(d.nc/fat),nr=Math.ceil(d.nr/fat),cs=d.cs*fat,csy=(d.csy||d.cs)*fat;
  const feats=[],cats=[],fonte=(r.src&&r.src.file)||'ortofoto',reservas=[];
  let descartados=0,fid=1;
  for(let ci=0;ci<classes.length;ci++){
    const cl=classes[ci],zz=new Float32Array(nc*nr);zz.fill(NaN);
    for(let rr=0;rr<nr;rr++)for(let cc=0;cc<nc;cc++){
      const freq=new Map();
      const r0=rr*fat,c0=cc*fat,r1=Math.min(d.nr,r0+fat),c1=Math.min(d.nc,c0+fat);
      for(let y=r0;y<r1;y++)for(let x=c0;x<c1;x++){
        const v=d.z[y*d.nc+x];if(!isFinite(v))continue;
        freq.set(v,(freq.get(v)||0)+1);
      }
      let mv=null,mn=0;freq.forEach((n,v)=>{if(n>mn){mn=n;mv=v;}});
      if(mv!=null&&Math.abs(mv-cl.value)<1e-6)zz[rr*nc+cc]=1;
    }
    const gd={nc,nr,cs,csy,xll:d.xll,yll:d.yll,z:zz};
    const rings=limiteContornoGrade(gd);
    for(let ring of rings){
      let aberta=ring.slice(0,-1);
      /* Contornos espectrais podem ter dezenas de milhares de vértices. A
         Douglas–Peucker recursiva não deve receber tudo de uma vez. */
      if(aberta.length>3500){
        const passo=Math.ceil(aberta.length/3500);
        aberta=aberta.filter((_,i)=>i%passo===0);
      }
      try{ring=limiteSimplifica(aberta,Math.max(cs,csy)*.55);}
      catch(e){ring=aberta;}
      if(ring.length)ring.push(ring[0].slice());
      if(ring.length<4)continue;
      const ar=baciaArea(ring);
      if(ar<areaMin){descartados++;reservas.push({ring,ar,cl});continue;}
      let per=0,sx=0,sy=0;
      for(let j=0;j<ring.length-1;j++){per+=Math.hypot(ring[j+1][0]-ring[j][0],ring[j+1][1]-ring[j][1]);sx+=ring[j][0];sy+=ring[j][1];}
      const cx=sx/Math.max(1,ring.length-1),cy=sy/Math.max(1,ring.length-1);
      const mdt=cnMdtAtual(),decl=cnSlopePct(mdt,cx,cy),dc=cnDeclClasse(decl);
      const nome=String(cl.label||'').replace(/^CN\s*\d+\s*[—-]\s*/i,'')||'Classe de cobertura';
      feats.push({geom:ring,multi:false,props:{
        FID:fid++,COBERTURA:nome,CLASSE:String(cl.label||nome),GRUPO_HID:(r.cnMeta&&r.cnMeta.grupo)||'C',
        CN:+cl.value,DECL_MED:decl==null?null:+decl.toFixed(2),DECL_CLAS:dc.nome,
        AREA_M2:+ar.toFixed(2),AREA_HA:+(ar/10000).toFixed(4),
        AREA_PCT:+(100*ar/Math.max(1,totalArea)).toFixed(3),PERIM_M:+per.toFixed(2),
        FONTE:fonte,METODO:'K-means + declividade'
      }});
    }
    cats.push({value:String(cl.label),color:cl.color,stroke:cl.color,fill:.48,vis:true});
    await new Promise(ok=>setTimeout(ok,0));
  }
  /* Nunca deixa o resultado apenas raster: se o filtro de ruído eliminou
     tudo, mantém a maior região de cada classe e informa isso no relatório. */
  if(!feats.length&&reservas.length){
    const melhores=new Map();
    reservas.forEach(x=>{const k=String(x.cl.value),a=melhores.get(k);if(!a||x.ar>a.ar)melhores.set(k,x);});
    melhores.forEach(({ring,ar,cl})=>{
      let per=0;for(let j=0;j<ring.length-1;j++)per+=Math.hypot(ring[j+1][0]-ring[j][0],ring[j+1][1]-ring[j][1]);
      const nome=String(cl.label||'').replace(/^CN\s*\d+\s*[—-]\s*/i,'')||'Classe de cobertura';
      feats.push({geom:ring,multi:false,props:{FID:fid++,COBERTURA:nome,CLASSE:String(cl.label||nome),
        GRUPO_HID:(r.cnMeta&&r.cnMeta.grupo)||'C',CN:+cl.value,DECL_MED:null,DECL_CLAS:'não calculada',
        AREA_M2:+ar.toFixed(2),AREA_HA:+(ar/10000).toFixed(4),
        AREA_PCT:+(100*ar/Math.max(1,totalArea)).toFixed(3),PERIM_M:+per.toFixed(2),
        FONTE:fonte,METODO:'K-means + generalização'}});});
  }
  const antiga=(S.layers||[]).find(x=>x._cnVector);
  if(antiga){if(antiga.llayer)map.removeLayer(antiga.llayer);S.layers=S.layers.filter(x=>x!==antiga);}
  if(!feats.length)return {layer:null,n:0,descartados,fator:fat};
  const fields=[
    {name:'FID',type:'N',length:9,decimal:0},{name:'COBERTURA',type:'C',length:50,decimal:0},
    {name:'CLASSE',type:'C',length:70,decimal:0},{name:'GRUPO_HID',type:'C',length:2,decimal:0},
    {name:'CN',type:'N',length:4,decimal:0},{name:'DECL_MED',type:'N',length:9,decimal:2},
    {name:'DECL_CLAS',type:'C',length:30,decimal:0},{name:'AREA_M2',type:'N',length:16,decimal:2},
    {name:'AREA_HA',type:'N',length:14,decimal:4},{name:'AREA_PCT',type:'N',length:9,decimal:3},
    {name:'PERIM_M',type:'N',length:14,decimal:2},{name:'FONTE',type:'C',length:80,decimal:0},
    {name:'METODO',type:'C',length:40,decimal:0}
  ];
  const L=addLayer({sourceLayer:r,name:`Polígonos CN — grupo ${(r.cnMeta&&r.cnMeta.grupo)||'C'}`,
    gtype:'polygon',crs:S.workCRS,features:feats,fields,color:'#2585c7'});
  L._cnVector=true;L.cnRasterId=r.id;
  L.sym={...L.sym,mode:'cat',field:'CLASSE',cats};
  drawLayer(L);
  return {layer:L,n:feats.length,descartados,fator:fat};
}
function cnMdtRefresh(){
  const s=document.getElementById('hCnMDT');if(!s)return;
  const old=s.value,rs=(S.rasters||[]).filter(r=>r&&r.d&&!r._cnOrto&&!r._cnSlope);
  s.innerHTML='<option value="">— sem MDT auxiliar —</option>'+rs.map(r=>
    `<option value="${r.id}">${esc(r.name||'MDT')}</option>`).join('');
  if(rs.some(r=>String(r.id)===String(old)))s.value=old;
}
/* Classificação não supervisionada: seis agrupamentos espectrais são obtidos
   dentro do limite indicado e depois consolidados em três coberturas. Usa
   cromaticidade, excesso de verde, saturação, luminosidade e textura local. */
async function gerarCnOrto(){
  const out=document.getElementById('hCnOrtoOut'),I=S.img;
  cnMdtRefresh();
  if(!I||!I.url||!I.b){ toast('Carregue ou reabra uma ortofoto antes'); return; }
  let src=I._id,w=I._w,h=I._h;
  if(!src){
    try{
      const im=new Image();
      await new Promise((ok,fail)=>{im.onload=ok;im.onerror=fail;im.src=I.url;});
      const cv=document.createElement('canvas');cv.width=im.naturalWidth||im.width;cv.height=im.naturalHeight||im.height;
      const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(im,0,0);
      src=cx.getImageData(0,0,cv.width,cv.height);w=cv.width;h=cv.height;
    }catch(e){toast('Não consegui ler os pixels da ortofoto salva. Recarregue o GeoTIFF.');return;}
  }
  const D=src.data, vals=cnValoresGrupo();
  const gl=document.getElementById('hLamGrupo');if(gl)gl.value=vals.grupo;
  const lim=cnLimiteAtual();
  if(!lim){toast('Selecione ou desenhe primeiro o polígono limite da análise');return;}
  const cs=(I.b[2]-I.b[0])/w,csy=(I.b[3]-I.b[1])/h;
  const mdt=cnMdtAtual(),slopeZ=new Float32Array(w*h);slopeZ.fill(NaN);
  const dentro=k=>{if(!lim.ring)return true;const rr=k/w|0,cc=k%w;
    return pointInRing(I.b[0]+(cc+.5)*cs,I.b[1]+(h-rr-.5)*csy,lim.ring);};
  showLoad('Extraindo amostras espectrais dentro do limite…');
  await new Promise(r=>setTimeout(r,20));
  try{
    const z=new Float32Array(w*h), cls=new Uint8Array(w*h);
    z.fill(NaN);
    const validos=[];
    const passo=Math.max(1,Math.ceil(Math.sqrt(w*h/90000)));
    for(let rr=0;rr<h;rr+=passo)for(let cc=0;cc<w;cc+=passo){
      const k=rr*w+cc,o=k*4,R=D[o],G=D[o+1],B=D[o+2],A=D[o+3];
      if(A<8||(R>248&&G>248&&B>248)||(R<4&&G<4&&B<4)||!dentro(k))continue;
      validos.push(cnFeat(D,w,h,k));
    }
    if(validos.length<30)throw new Error('há poucos pixels válidos dentro do limite indicado');
    validos.sort((a,b)=>(a[3]+a[5])-(b[3]+b[5]));
    const centros=cnKmeans(validos,Math.min(6,Math.max(3,Math.floor(Math.sqrt(validos.length/1500)))));
    const tipo=centros.map(cnClasseCentro);
    showLoad('Classificando todos os pixels e ponderando as áreas…');
    await new Promise(r=>setTimeout(r,10));
    let nr=0,na=0,nv=0,nd=0;
    const detalhes=new Map(),decls=[0,0,0,0,0];
    for(let k=0;k<w*h;k++){
      const o=k*4,R=D[o],G=D[o+1],B=D[o+2],A=D[o+3];
      if(A<8||(R>248&&G>248&&B>248)||(R<4&&G<4&&B<4)||!dentro(k)){nd++;continue;}
      const f=cnFeat(D,w,h,k);let q=0,bd=Infinity;
      for(let j=0;j<centros.length;j++){const ds=cnDist(f,centros[j]);if(ds<bd){bd=ds;q=j;}}
      const rr=k/w|0,cc=k%w,x=I.b[0]+(cc+.5)*cs,y=I.b[1]+(h-rr-.5)*csy;
      const slope=mdt?cnSlopePct(mdt.d,x,y):null,dc=cnDeclClasse(slope);
      if(dc.id){slopeZ[k]=dc.id;decls[dc.id]++;}
      const det=cnDetalhe(tipo[q],f,slope,vals.grupo),c=det.broad;
      if(c===3)nv++;else if(c===2)na++;else nr++;
      const rec=detalhes.get(det.key)||{...det,count:0};rec.count++;detalhes.set(det.key,rec);
      cls[k]=c;z[k]=det.cn;
      if((k&1048575)===0)await new Promise(r=>setTimeout(r,0));
    }
    const d={nc:w,nr:h,cs,csy,xll:I.b[0],yll:I.b[1],z,_cnClass:cls};
    const old=(S.rasters||[]).find(r=>r._cnOrto);
    if(old){if(old.overlay)map.removeLayer(old.overlay);S.rasters=S.rasters.filter(r=>r!==old);}
    const cnClasses=[...detalhes.values()].sort((a,b)=>b.cn-a.cn).map(x=>({
      value:x.cn,label:`CN ${x.cn} — ${x.nome}`,color:x.cor,count:x.count,vis:true}));
    const r={id:rid++,name:`CN estimado — ortofoto — grupo ${vals.grupo}`,d,
      src:{file:I.name||'ortofoto',at:new Date().toISOString()},
      style:{mode:'cn',opacity:.68,classes:cnClasses},visible:true,overlay:null,_cnOrto:true,
      cnMeta:{grupo:vals.grupo,rock:vals.rock,ant:vals.ant,veg:vals.veg,limite:lim.nome,
        algoritmo:'K-means RGB+ExG+saturação+luminosidade+textura',
        mdt:mdt?mdt.name:null,classes:[...detalhes.values()],counts:{rock:nr,ant:na,veg:nv,nodata:nd}}};
    S.rasters.push(r);placeProductAbove(r,I);S._cnRaster=r;renderRaster(r);S.selRaster=r;
    projectAutoSaveRaster(r);
    if(mdt){
      const velha=(S.rasters||[]).find(x=>x._cnSlope);
      if(velha){if(velha.overlay)map.removeLayer(velha.overlay);S.rasters=S.rasters.filter(x=>x!==velha);}
      const rd={id:rid++,name:`Classes de declividade — ${mdt.name}`,
        d:{nc:w,nr:h,cs,csy,xll:I.b[0],yll:I.b[1],z:slopeZ},
        src:{file:mdt.name,at:new Date().toISOString()},style:{mode:'slopeclass',opacity:.55,classes:[
          {value:1,label:'Plano — 0 a 3%',color:'#2c7bb6'},
          {value:2,label:'Suave — 3 a 8%',color:'#abd9e9'},
          {value:3,label:'Moderado — 8 a 20%',color:'#fdae61'},
          {value:4,label:'Íngreme — acima de 20%',color:'#d7191c'}]},
        visible:false,overlay:null,_cnSlope:true};
      S.rasters.push(rd);placeProductAbove(rd,mdt);renderRaster(rd);
      projectAutoSaveRaster(rd);
    }
    const n=nr+na+nv, pct=x=>n?100*x/n:0;
    [['hCnARock',nr],['hCnAAnt',na],['hCnAVeg',nv]].forEach(([id,v])=>{
      const e=document.getElementById(id);if(e)e.value=pct(v).toFixed(2);});
    [['hCnRock',vals.rock],['hCnAnt',vals.ant],['hCnVeg',vals.veg]].forEach(([id,v])=>{
      const e=document.getElementById(id);if(e)e.value=v;});
    const cnP=[...detalhes.values()].reduce((s,x)=>s+x.count*x.cn,0)/n;
    const areaCel=cs*csy, fmtN=(v,d=2)=>v.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
    const linhas=[...detalhes.values()].sort((a,b)=>b.cn-a.cn).map(({nome,cor,count:cont,cn})=>{
      const ar=cont*areaCel,pc=pct(cont),pond=pc*cn/100;
      return `<tr><td><span style="color:${cor}">■</span> ${nome}</td>`+
        `<td style="text-align:right">${fmtN(ar,0)}</td><td style="text-align:right">${fmtN(ar/1e4,3)}</td>`+
        `<td style="text-align:right">${fmtN(pc,2)}%</td><td style="text-align:right">${cn}</td>`+
        `<td style="text-align:right">${fmtN(pond,2)}</td></tr>`;
    }).join('');
    const declTxt=mdt?`<br>Classes do MDT: plano ${pct(decls[1]).toFixed(1)}% · suave ${pct(decls[2]).toFixed(1)}% · `+
      `moderado ${pct(decls[3]).toFixed(1)}% · íngreme ${pct(decls[4]).toFixed(1)}%.`:'';
    if(out)out.innerHTML=`Camada <b>${esc(r.name)}</b> criada (${w}×${h}).<br>`+
      `Limite: <b>${esc(lim.nome)}</b> · área classificada <b>${fmtArea(n*cs*csy)}</b><br>`+
      `<div style="overflow:auto;margin:7px 0"><table style="width:100%;border-collapse:collapse;font-size:11px">`+
      `<thead><tr style="border-bottom:1px solid var(--line)"><th style="text-align:left">Cobertura</th>`+
      `<th style="text-align:right">Área m²</th><th style="text-align:right">ha</th>`+
      `<th style="text-align:right">Área %</th><th style="text-align:right">CN</th>`+
      `<th style="text-align:right">CN×fração</th></tr></thead><tbody>${linhas}`+
      `<tr style="border-top:1px solid var(--line);font-weight:700"><td>Total / ponderado</td>`+
      `<td style="text-align:right">${fmtN(n*areaCel,0)}</td><td style="text-align:right">${fmtN(n*areaCel/1e4,3)}</td>`+
      `<td style="text-align:right">100,00%</td><td style="text-align:right">${fmtN(cnP,2)}</td>`+
      `<td style="text-align:right">${fmtN(cnP,2)}</td></tr></tbody></table></div>`+
      `<b>CN ponderado da poligonal = ${fmtN(cnP,2)}</b><br>`+
      `<span class="hint">Agrupamento espectral por RGB, excesso de verde, saturação, luminosidade e textura.${declTxt} Confirme em campo.</span>`;
    refreshUI();zApply();toast('Camada temática de CN criada a partir da ortofoto');
  }catch(e){toast('Falha ao estimar CN: '+(e.message||e));}
  finally{hideLoad();}
}
function cnDistribuicaoNaBacia(ring){
  const r=S._cnRaster||(S.rasters||[]).find(x=>x._cnOrto);
  if(!r||!ring||ring.length<3)return null;
  const d=r.d,csy=d.csy||d.cs,ct=[0,0,0,0],step=Math.max(1,Math.ceil(Math.sqrt(d.nc*d.nr/800000)));
  for(let rr=0;rr<d.nr;rr+=step)for(let cc=0;cc<d.nc;cc+=step){
    const x=d.xll+(cc+.5)*d.cs,y=d.yll+(d.nr-rr-.5)*csy;
    if(pointInRing(x,y,ring)){const c=d._cnClass&&d._cnClass[rr*d.nc+cc];if(c)ct[c]++;}
  }
  const n=ct[1]+ct[2]+ct[3];if(!n)return null;
  return {rock:100*ct[1]/n,ant:100*ct[2]/n,veg:100*ct[3]/n,r};
}
function cnDistribuicaoDetalhada(ring){
  const r=S._cnRaster||(S.rasters||[]).find(x=>x._cnOrto);
  if(!r||!ring||ring.length<3)return null;
  const d=r.d,csy=d.csy||d.cs,ct=new Map();
  const step=Math.max(1,Math.ceil(Math.sqrt(d.nc*d.nr/900000)));
  let n=0;
  for(let rr=0;rr<d.nr;rr+=step)for(let cc=0;cc<d.nc;cc+=step){
    const x=d.xll+(cc+.5)*d.cs,y=d.yll+(d.nr-rr-.5)*csy;
    if(!pointInRing(x,y,ring))continue;
    const cn=d.z[rr*d.nc+cc];if(!isFinite(cn))continue;
    ct.set(cn,(ct.get(cn)||0)+1);n++;
  }
  if(!n)return null;
  const classes=(r.style&&r.style.classes)||[];
  return {r,n,rows:[...ct].map(([cn,count])=>{
    const cl=classes.find(c=>Math.abs(+c.value-cn)<1e-6);
    return {cn:+cn,count,f:count/n,nome:cl?String(cl.label).replace(/^CN\s*\d+\s*[—-]\s*/i,''):`CN ${cn}`};
  }).sort((a,b)=>b.f-a.f)};
}
/* Transforma a chuva em volume antes de procurar a cota da mancha. No SCS,
   cada cobertura é calculada separadamente (a equação é não linear); não se
   aplica simplesmente um CN médio à área inteira. */
function laminaEscoamento(P,A,distCN){
  const gv=id=>parseFloat(String((document.getElementById(id)||{}).value).replace(',','.'));
  const metodo=(document.getElementById('hLamMetodo')||{}).value||'scs';
  if(metodo==='sem') return {metodo:'Sem perdas',V:(P/1000)*A,Q:P,perda:0,Ceq:1,rows:[]};
  if(metodo==='c'){
    if(distCN&&distCN.rows&&distCN.rows.length){
      const amc=(document.getElementById('hLamAMC')||{}).value||'II';
      let Ceq=0,Qeq=0;
      const rows=distCN.rows.map(x=>{
        const cn=laminaCnAMC(x.cn,amc),Q=laminaQscs(P,cn),C=P>0?Q/P:0;
        Ceq+=x.f*C;Qeq+=x.f*Q;
        return {nome:x.nome,f:x.f,area:A*x.f,cn2:x.cn,cn,Q,vol:Q/1000*A*x.f,perda:P-Q,C};
      });
      return {metodo:'Racional · C automático dos polígonos CN',V:Ceq*(P/1000)*A,
        Q:Qeq,perda:P-Qeq,Ceq,rows,CN:rows.reduce((s,x)=>s+x.cn*x.f,0)};
    }
    const C=Math.max(0,Math.min(1,gv('hLamC')||0));
    return {metodo:'Coeficiente C',V:C*(P/1000)*A,Q:P*C,perda:P*(1-C),Ceq:C,rows:[]};
  }
  const amc=(document.getElementById('hLamAMC')||{}).value||'II';
  const grupo=(document.getElementById('hLamGrupo')||{}).value||'C';
  if(distCN&&distCN.rows&&distCN.rows.length){
    let V=0,Qeq=0,CNeq=0;
    const rows=distCN.rows.map(x=>{
      const cn=laminaCnAMC(x.cn,amc),Q=laminaQscs(P,cn),area=A*x.f,vol=Q/1000*area;
      V+=vol;Qeq+=Q*x.f;CNeq+=cn*x.f;
      return {nome:x.nome,f:x.f,area,cn2:x.cn,cn,Q,vol,perda:P-Q};
    });
    return {metodo:`SCS–CN espacial · ${rows.length} classe(s) · ARC ${amc}`,
      V,Q:Qeq,perda:P-Qeq,Ceq:P>0?Qeq/P:0,CN:CNeq,rows};
  }
  const defs=[
    ['Cava/rocha',gv('hCnARock'),gv('hCnRock')],
    ['Antropizada',gv('hCnAAnt'),gv('hCnAnt')],
    ['Vegetação',gv('hCnAVeg'),gv('hCnVeg')]
  ];
  const soma=defs.reduce((s,r)=>s+(isFinite(r[1])&&r[1]>0?r[1]:0),0);
  if(!(soma>0)) throw new Error('a soma das coberturas deve ser maior que zero');
  let V=0,Qeq=0,CNeq=0;
  const rows=defs.map(([nome,pct0,cn2])=>{
    const f=Math.max(0,isFinite(pct0)?pct0:0)/soma;
    const cn=laminaCnAMC(cn2,amc),Q=laminaQscs(P,cn),area=A*f,vol=Q/1000*area;
    V+=vol;Qeq+=Q*f;CNeq+=cn*f;
    return {nome,f,area,cn2,cn,Q,vol,perda:P-Q};
  });
  return {metodo:`SCS–CN · grupo ${grupo} · ARC ${amc}`,V,Q:Qeq,perda:P-Qeq,
          Ceq:P>0?Qeq/P:0,CN:CNeq,rows};
}
function laminaPoligonoContrib(q,modo){
  const converte=(L,p)=>{
    if(!L.crs||L.crs===S.workCRS) return [p[0],p[1]];
    const w=toWGS(L.crs,p[0],p[1]),c=fromWGS(S.workCRS,w[0],w[1]);return [c[0],c[1]];
  };
  const ringsDe=(L,f)=>{
    if(!f||!f.geom)return [];
    const rs=(f.multi&&Array.isArray(f.geom[0]&&f.geom[0][0]))?f.geom:[f.geom];
    return rs.filter(r=>r&&r.length>=3).map(r=>r.map(p=>converte(L,p)));
  };
  const monta=(L,f)=>{
    const rings=ringsDe(L,f);if(!rings.length)return null;
    const areas=rings.map(r=>Math.abs(baciaArea(r))),i=areas.indexOf(Math.max(...areas));
    const p=f.props||{}, areaAttr=+p.AREA_M2||(+p.AREA_HA?+p.AREA_HA*10000:0);
    /* Em polígonos com ilhas/furos, os anéis internos não podem ser somados
       como contribuição. Prefere a área GIS gravada; sem atributo, usa o anel
       externo menos os demais. */
    const areaGeom=Math.max(0,areas[i]-areas.reduce((s,a,j)=>s+(j===i?0:a),0));
    return {areaM2:areaAttr>0?areaAttr:areaGeom,ring:rings[i],rings,nome:L.name,
            fonte:'polígono GIS',L,f};
  };
  if(modo==='selecionada'){
    const sf=S.selFeat,L=sf&&sf.layer,f=L&&L.features&&L.features[sf.idx];
    if(!L||L.gtype!=='polygon'||!f) return null;
    return monta(L,f);
  }
  const cand=[];
  (S.layers||[]).filter(L=>L.visible!==false&&L.gtype==='polygon').forEach(L=>{
    (L.features||[]).forEach(f=>{
      const R=monta(L,f);if(!R)return;
      if(R.rings.some(r=>pointInRing(q[0],q[1],r))){
        R.prio=/bacia|contrib|drenagem|hidrogr/i.test(L.name||'')?2:1;cand.push(R);
      }
    });
  });
  cand.sort((a,b)=>b.prio-a.prio||b.areaM2-a.areaM2);
  return cand[0]||null;
}
function laminaD8Status(){
  const o=document.getElementById('hLamD8Status');
  const d=S.hidro&&S.hidro.dem;
  const preenchido=!!(d&&d.zf&&!d._bruto),direcao=!!(d&&d.dir),acum=!!(d&&d.acc);
  if(o)o.innerHTML=!d?'<span style="color:var(--sel)">MDE não carregado.</span>':
    `<span style="color:${preenchido?'var(--ok,#239b72)':'var(--sel,#d34b4b)'}">${preenchido?'☑':'☐'} MDE preenchido</span> · `+
    `<span>${direcao?'☑':'☐'} direção D8</span> · <span>${acum?'☑':'☐'} acumulação</span>`+
    (!preenchido?'<br><span style="color:var(--amber)">Modo automático indisponível: preencha as depressões do MDE primeiro.</span>':
      (!direcao||!acum?'<br><span style="color:var(--ink-dim)">O programa calculará as etapas D8 que faltam sobre o MDE preenchido.</span>':''));
  return {d,preenchido,direcao,acum};
}
async function runLaminaChuva(latlng){
  const st=hHydroGridStats(); if(!st){ toast('Carregue o MDE primeiro'); return; }
  const d=st.d, csy=(d.csy||d.cs), areaCel=d.cs*csy;
  const q=fromWGS(S.workCRS, latlng.lng, latlng.lat);
  const cc=Math.floor((q[0]-d.xll)/d.cs), rr=(d.nr-1)-Math.floor((q[1]-d.yll)/csy);
  if(cc<0||cc>=d.nc||rr<0||rr>=d.nr){ toast('O ponto caiu fora do MDE'); return; }
  const seed=rr*d.nc+cc, zP=d.z[seed];
  if(zP==null||!isFinite(zP)){ toast('Sem cota do terreno nesse ponto'); return; }

  const out=document.getElementById('hLamOut');
  const cen=(document.getElementById('hLamCen')||{}).value||'critico';
  const T=Math.max(2, parseFloat((document.getElementById('hLamT')||{}).value)||100);
  const cede=()=>new Promise(r=>setTimeout(r,0));

  showLoad('Delimitando a bacia contribuinte…');
  try{
    /* 1) bacia ------------------------------------------------------- */
    const modoBacia=(document.getElementById('hLamBacia')||{}).value||'selecionada';
    let W=null;
    if(modoBacia!=='d8') W=laminaPoligonoContrib(q,modoBacia);
    if(modoBacia==='selecionada'&&!W){
      hideLoad();toast('Selecione primeiro o polígono correto da bacia contribuinte');return;
    }
    if(modoBacia==='contem'&&!W){
      hideLoad();toast('Nenhum polígono de bacia contendo o ponto foi encontrado');return;
    }
    if(modoBacia==='d8'){
      const stD8=laminaD8Status();
      if(!stD8.preenchido){
        hideLoad();toast('O MDE não está preenchido — execute “Preencher depressões” antes do D8 automático');return;
      }
      if(!d.dir||!d.acc){
        showLoad('Calculando D8 sobre o MDE preenchido…');
        if(typeof d8dirAsync==='function'){if(!d.dir)await d8dirAsync(d,0,.5);if(!d.acc)await d8accAsync(d,.5,1);}
        else {if(!d.dir)d8dir(d);if(!d.acc)d8acc(d);}
        laminaD8Status();
      }
      try{W=watershedAt(d,q[0],q[1]);}catch(e){}
      if(W){W.fonte='D8 sobre MDE preenchido';W.nome='Bacia D8 automática';}
    }
    if(!W||!W.areaM2){ hideLoad(); toast('Não consegui obter a área contribuinte'); return; }
    const A=W.areaM2;
    cmdLog(`área contribuinte: ${W.nome||'D8'} · ${(A/1e4).toFixed(2)} ha · ${W.fonte||''}`,'info');
    if(modoBacia==='d8'&&W.snapM!=null)
      cmdLog(`exutório ajustado ${W.snapM.toFixed(1)} m até a célula de maior acumulação próxima (${Math.round(W.accOutlet||0).toLocaleString('pt-BR')} células contribuintes)`,'info');

    /* 2) tempo de concentração (Kirpich) ----------------------------- */
    let L=0, zTopo=zP;
    (W.ring||[]).forEach(p=>{
      const dd=Math.hypot(p[0]-q[0], p[1]-q[1]); if(dd>L) L=dd;
      let z=null; try{ z=sampleZbil(d,p[0],p[1]); }catch(e){}
      if(z!=null&&isFinite(z)&&z>zTopo) zTopo=z;
    });
    if(!(L>0)) L=Math.sqrt(A);                      // bacia degenerada: usa o lado equivalente
    const dH=Math.max(1, zTopo-zP);
    const tc=Math.max(5, 57*Math.pow(Math.pow(L/1000,3)/dH, 0.385));

    /* 3) chuva crítica ----------------------------------------------- */
    let Pser=null, anoSer=null;
    if(S.hidro.serie && S.hidro.serie.length)
      S.hidro.serie.forEach(r=>{ if(Pser==null||r.p>Pser){ Pser=r.p; anoSer=r.y; } });
    let Pidf=null, iIdf=null;
    if(S.hidro.idf){ iIdf=idfI(tc,T); if(iIdf!=null&&isFinite(iIdf)) Pidf=iIdf*(tc/60); }
    const Ndias=parseInt((document.getElementById('hLamDias')||{}).value)||1;
    const crit=(document.getElementById('hLamCrit')||{}).value||'acum';
    const Pdia=(S.hidro.diario && S.hidro.diario.dias)
      ? chuvaDiariaCritica(S.hidro.diario.dias, Ndias, crit) : null;

    const cands=[];
    if(Pser!=null) cands.push({tag:'serie', P:Pser,
      txt:`maior máxima anual da série (${Pser.toFixed(1)} mm, ${anoSer})`});
    if(Pidf!=null) cands.push({tag:'idf', P:Pidf,
      txt:`IDF T = ${T} anos, duração ${tc.toFixed(0)} min (i = ${iIdf.toFixed(1)} mm/h)`});
    if(Pdia!=null) cands.push({tag:'diaria', P:Pdia.P, txt:`série diária: ${Pdia.detalhe}`});
    let esc=null;
    if(cen==='critico') esc=cands.reduce((a,b)=>(!a||b.P>a.P)?b:a, null);
    else esc=cands.find(c=>c.tag===cen);
    if(!esc){
      hideLoad();
      toast(cen==='diaria' ? 'Carregue a série DIÁRIA (Precipitação → estação ANA) primeiro'
          : cen==='idf'    ? 'Ajuste a curva IDF primeiro'
          : cen==='serie'  ? 'Carregue a série histórica primeiro'
                           : 'Carregue a série histórica, a série diária ou ajuste a IDF');
      return;
    }
    const P=esc.P;
    let fonte=esc.txt;
    if(cen==='critico' && cands.length>1)
      fonte+=' <span style="color:var(--ink-dim)">— o mais crítico entre '+cands.length+' cenários</span>';

    /* 4) volume escoado ---------------------------------------------- */
    const distCN=cnDistribuicaoNaBacia(W.ring);
    const distCNDet=cnDistribuicaoDetalhada(W.ring);
    if(distCN){
      [['hCnARock',distCN.rock],['hCnAAnt',distCN.ant],['hCnAVeg',distCN.veg]].forEach(([id,v])=>{
        const e=document.getElementById(id);if(e)e.value=v.toFixed(2);});
      cmdLog(`CN pela ortofoto dentro da bacia: rocha ${distCN.rock.toFixed(1)}% · antropizada ${distCN.ant.toFixed(1)}% · vegetação ${distCN.veg.toFixed(1)}%`,'info');
    }
    if(distCNDet)cmdLog('Subáreas CN usadas no cálculo: '+distCNDet.rows.map(x=>
      `${x.nome} ${(+x.f*100).toFixed(1)}% (CN ${x.cn})`).join(' · '),'info');
    const escRun=laminaEscoamento(P,A,distCNDet), V=escRun.V, C=escRun.Ceq;
    cmdLog(`bacia ${(A/1e4).toFixed(2)} ha · tc ${tc.toFixed(0)} min · chuva ${P.toFixed(1)} mm · `+
           `${escRun.metodo} · C equivalente ${C.toFixed(3)} → volume escoado ${V.toFixed(0)} m³`,'info');

    /* 5) sobe a lâmina até acomodar o volume -------------------------- */
    const B=barrLinhas();
    let wall=null, crista=null;
    if(B){ wall=barrMascara(d,B.linhas).wall; crista=barrCrista(d,B.linhas); }
    const volEm=(lv)=>{ const m=inundConectada(d,lv,seed,wall);
      let v=0,n=0;
      for(let k=0;k<d.z.length;k++) if(m[k]){ v+=(lv-d.z[k]); n++; }
      return {vol:v*areaCel, n};
    };
    showLoad('Subindo a lâmina até acomodar o volume…');
    let lo=zP, hi=zP+2, vh=0, ok=false;
    for(let i=0;i<14;i++){
      vh=volEm(hi).vol; await cede();
      if(vh>=V){ ok=true; break; }
      if(hi>=st.mx){ break; }
      hi=Math.min(st.mx, zP+(hi-zP)*2);
    }
    let lv=hi;
    if(ok){
      for(let i=0;i<18;i++){
        const mid=(lo+hi)/2;
        if(volEm(mid).vol>=V) hi=mid; else lo=mid;
        await cede();
      }
      lv=hi;
    }

    /* 6) mancha final e relatório ------------------------------------ */
    const mask=inundConectada(d, lv, seed, wall);
    const R=inundNivel(d, lv, mask);
    const lamina=lv-zP;
    const rings=R.polys.length?R.polys:[];
    const feat={geom:rings.length?rings:[[]], multi:true, props:{
      COTA_M:+lv.toFixed(2), LAMINA_M:+lamina.toFixed(2),
      AREA_M2:+R.areaM2.toFixed(0), AREA_HA:+(R.areaM2/1e4).toFixed(3),
      VOLUME_M3:+R.volM3.toFixed(0), CHUVA_MM:+P.toFixed(1), T_ANOS:(cen==='serie'?null:T),
      TC_MIN:+tc.toFixed(0), BACIA_HA:+(A/1e4).toFixed(2), COEF_C:+C.toFixed(3),
      METODO:escRun.metodo, PERDAS_MM:+escRun.perda.toFixed(1), CN_EQ:escRun.CN?+escRun.CN.toFixed(1):null,
      VOL_ESCOADO_M3:+V.toFixed(0), BARRAMENTO:(B?B.L.name:'—') }};
    const cam=addLayer({sourceLayer:'R:'+S.hidro.sourceRasterId, name:`Lâmina de projeto ${lv.toFixed(2)} m`, gtype:'polygon', crs:S.workCRS,
      features:[feat],
      fields:[{name:'COTA_M',type:'N',length:10,decimal:2},{name:'LAMINA_M',type:'N',length:10,decimal:2},
              {name:'AREA_M2',type:'N',length:14,decimal:0},{name:'AREA_HA',type:'N',length:12,decimal:3},
              {name:'VOLUME_M3',type:'N',length:16,decimal:0},{name:'CHUVA_MM',type:'N',length:10,decimal:1},
              {name:'T_ANOS',type:'N',length:8,decimal:0},{name:'TC_MIN',type:'N',length:8,decimal:0},
              {name:'BACIA_HA',type:'N',length:12,decimal:2},{name:'COEF_C',type:'N',length:7,decimal:3},
              {name:'METODO',type:'C',length:50,decimal:0},{name:'PERDAS_MM',type:'N',length:10,decimal:1},
              {name:'CN_EQ',type:'N',length:8,decimal:1},
              {name:'VOL_ESCOADO_M3',type:'N',length:16,decimal:0},{name:'BARRAMENTO',type:'C',length:40,decimal:0}],
      color:'#1565c0' });
    if(cam){ cam.fill=0.35; if(cam.sym){ cam.sym.fill=0.35; } try{ drawLayer(cam); }catch(e){} }
    // a bacia contribuinte também vira camada — é o que justifica o volume
    if(W.ring&&modoBacia==='d8') addLayer({sourceLayer:'R:'+S.hidro.sourceRasterId,name:`Área contribuinte D8 (${fmtArea(A)})`,gtype:'polygon',crs:S.workCRS,
      features:[{geom:[W.ring],multi:true,props:{AREA_M2:+A.toFixed(0),AREA_HA:+(A/1e4).toFixed(3),FONTE:'D8 preenchido'}}],
      fields:[{name:'AREA_M2',type:'N',length:14,decimal:0},{name:'AREA_HA',type:'N',length:12,decimal:3},
              {name:'FONTE',type:'C',length:30,decimal:0}],color:'#7aa2f7'});
    let html=`<b>Lâmina no ponto: ${lamina.toFixed(2)} m</b> · cota ${lv.toFixed(2)} m `+
      `<span style="color:var(--ink-dim)">(terreno ${zP.toFixed(2)} m)</span><br>`+
      `Bacia contribuinte <b>${(A/1e4).toFixed(2)} ha</b> · ${esc(W.nome||'D8 automático')} · tc ${tc.toFixed(0)} min `+
      `(L ${L.toFixed(0)} m, ΔH ${dH.toFixed(1)} m)`+
      (modoBacia==='d8'&&W.snapM!=null?` · exutório ajustado ${W.snapM.toFixed(1)} m ao talvegue`:'')+`<br>`+
      `Chuva crítica <b>${P.toFixed(1)} mm</b> — ${fonte}<br>`+
      (cands.length>1? `<span style="color:var(--ink-dim)">`+
        cands.map(c=>`${c.tag==='serie'?'máx. anual':c.tag==='idf'?'IDF':'diária'} ${c.P.toFixed(1)} mm`).join(' · ')+
        `</span><br>`:'')+
      `${escRun.metodo}<br>Chuva efetiva <b>${escRun.Q.toFixed(1)} mm</b> · perdas totais `+
      `<b>${escRun.perda.toFixed(1)} mm</b> · C equivalente ${C.toFixed(3)}<br>`+
      `Volume bruto <b>${((P/1000)*A).toLocaleString('pt-BR',{maximumFractionDigits:0})} m³</b> · `+
      `volume escoado <b>${V.toLocaleString('pt-BR',{maximumFractionDigits:0})} m³</b><br>`+
      (escRun.rows.length?escRun.rows.map(r=>`${r.nome}: ${(r.area/1e4).toFixed(2)} ha · CN ${r.cn.toFixed(1)} · Q ${r.Q.toFixed(1)} mm · ${r.vol.toLocaleString('pt-BR',{maximumFractionDigits:0})} m³`).join('<br>')+'<br>':'')+
      `Espelho d'água <b>${fmtArea(R.areaM2)}</b> · armazenado ${R.volM3.toLocaleString('pt-BR',{maximumFractionDigits:0})} m³`;
    if(!ok) html+=`<br><span style="color:var(--sel,#e05252)">O relevo não acomoda esse volume: mesmo na cota `+
      `${lv.toFixed(2)} m (máxima do MDE) cabem só ${volEm(lv).vol.toLocaleString('pt-BR',{maximumFractionDigits:0})} m³. `+
      `O excedente extravasaria da área modelada.</span>`;
    if(crista && crista.zmin!=null && lv>crista.zmin)
      html+=`<br><span style="color:var(--amber)">A lâmina passa da crista do barramento (${crista.zmin.toFixed(2)} m) — transbordaria.</span>`;
    if(crista && crista.zOmb!=null && lv>crista.zOmb)
      html+=`<br><span style="color:var(--amber)">A lâmina passa das ombreiras (${crista.zOmb.toFixed(2)} m) — a água contornaria as pontas.</span>`;
    if(out) out.innerHTML=html;
    refreshUI();
    toast(`Lâmina de ${lamina.toFixed(2)} m na cota ${lv.toFixed(2)} m`);
  }catch(e){ toast('Falha: '+(e&&e.message||e)); console.warn(e); }
  finally{ hideLoad(); }
}

/* Captura do ponto no CONTAINER do mapa, em fase de CAPTURA: o toque é lido
   antes de qualquer camada, então polígono, raster ou ortofoto por cima não
   engolem o clique. Só age com a ferramenta de inundação armada.
   Precisa rodar DEPOIS de initMap() — por isso é chamada ao armar e no fim. */
function inundBackstop(){
  if(typeof map==='undefined' || !map || !map.getContainer) return false;
  const cont=map.getContainer();
  if(cont._inundBS) return true;
  cont._inundBS=true;
  cont.addEventListener('pointerdown', ev=>{
    if(S.tool!=='inund' && S.tool!=='lamina') return;
    const r=cont.getBoundingClientRect();
    let ll; try{ ll=map.containerPointToLatLng([ev.clientX-r.left, ev.clientY-r.top]); }catch(e){ return; }
    ev.preventDefault(); ev.stopPropagation();
    const modo=S.tool; setTool('pan');
    const b=document.getElementById('btnInundRun');
    if(b) b.textContent='🌊 Simular a partir de um ponto';
    const bl=document.getElementById('btnLamina');
    if(bl) bl.textContent='◎ Marcar ponto → gerar área tributária e mancha';
    try{ if(modo==='lamina') runLaminaChuva(ll); else runInundacao(ll,'ponto'); }
    catch(err){ toast('Falha: '+(err&&err.message||err)); }
  }, true);
  return true;
}
function laminaAcaoUI(){
  const b=document.getElementById('btnLamina'),s=document.getElementById('hLamBacia');
  if(!b||!s||S.tool==='lamina')return;
  const modo=s.value||'d8';
  if(modo==='selecionada'){
    const ok=!!(S.selFeat&&S.selFeat.layer&&S.selFeat.layer.gtype==='polygon');
    b.textContent=ok?'◎ Polígono selecionado → marcar ponto da mancha':'▱ Selecionar polígono da área contribuinte';
  }else if(modo==='contem'){
    const ok=(S.layers||[]).some(L=>L.gtype==='polygon'&&L.name==='Área contribuinte informada'&&(L.features||[]).length);
    b.textContent=ok?'◎ Área desenhada → marcar ponto da mancha':'✏ Desenhar área contribuinte';
  }else b.textContent='◎ Marcar exutório → gerar bacia D8 e mancha';
}

/* amarrações da inundação e do barramento */
(function bindInund(){
  const LBL_INUND='🌊 Simular a partir de um ponto';
  const marcaArmado=(on)=>{ const b=document.getElementById('btnInundRun'); if(!b) return;
    b.textContent = on ? '◎ Toque no mapa — clique aqui para cancelar' : LBL_INUND; };
  const arma=()=>{
    if(S.tool==='inund'){ setTool('pan'); marcaArmado(false); toast('Modo inundação cancelado'); return; }
    if(!window.GeoMineNativeFlood?.hasSource()){ hInundStats(); toast('Selecione o MDT da inundação.'); return; }
    try{ hInundStats(); }catch(e){}
    try{ if(typeof ED!=='undefined' && ED.on && typeof edLigar==='function') edLigar(false); }catch(e){}
    try{ inundBackstop(); }catch(e){}      // garante a captura mesmo se o init tiver falhado
    /* limpa a cota: no modo PONTO quem manda é a cota do terreno onde você tocar.
       Sem isso o valor escrito pela simulação anterior ficava valendo e a lâmina
       nascia na cota antiga, alagando o mapa inteiro. */
    { const ie=document.getElementById('hInundIni');
      if(ie && ie.value!==''){ cmdLog('cota inicial limpa — vale a cota do ponto que você tocar','info'); ie.value=''; }
      if(ie) ie.placeholder='cota do ponto tocado'; }
    setTool('inund'); marcaArmado(true);
    if(window.matchMedia('(max-width:720px)').matches){ const s=document.getElementById('side'); if(s) s.classList.remove('open'); }
    map.getContainer().style.cursor='crosshair';
    toast('Toque no mapa: a água vai encher a partir daquele ponto');
    cmdLog('inundação armada — toque no mapa para definir o ponto de partida','info');
  };
  const bRun=document.getElementById('btnInundRun'); if(bRun) bRun.onclick=arma;
  const bFun=document.getElementById('btnInundFundo');
  if(bFun) bFun.onclick=()=>runInundacao(null,'fundo');
  const bTud=document.getElementById('btnInundTudo');
  if(bTud) bTud.onclick=()=>runInundacao(null,'tudo');
  const bClr=document.getElementById('btnInundLimpa');
  if(bClr) bClr.onclick=()=>{
    if(window.GeoMineNativeFlood?.clearResults)return GeoMineNativeFlood.clearResults();
    const alvos=(S.layers||[]).filter(L=>/^Inundação |^Lâmina de projeto |^Área contribuinte D8 /.test(L.name));
    if(!alvos.length){ toast('Nenhuma mancha de inundação para remover'); return; }
    if(!confirm(`Remover ${alvos.length} camada(s) de inundação?`)) return;
    alvos.forEach(L=>{ try{ deleteVectorLayer(L); }catch(e){} });
    refreshUI(); toast('Manchas de inundação removidas');
  };
  const bLam=document.getElementById('btnLamina');
  if(bLam) bLam.onclick=()=>{
    if(S.tool==='lamina'){ setTool('select');laminaAcaoUI();toast('Cancelado');return; }
    if(!S.hidro||!S.hidro.dem){ toast('Carregue o MDE na seção “MDE / fluxo” antes'); return; }
    const modo=(document.getElementById('hLamBacia')||{}).value||'d8';
    if(modo==='selecionada'&&!(S.selFeat&&S.selFeat.layer&&S.selFeat.layer.gtype==='polygon')){
      setTool('select');laminaAcaoUI();
      toast('Selecione no mapa o polígono da área contribuinte; depois pressione este comando novamente');
      return;
    }
    if(modo==='contem'&&!(S.layers||[]).some(L=>L.gtype==='polygon'&&L.name==='Área contribuinte informada'&&(L.features||[]).length)){
      const bd=document.getElementById('btnLamBaciaDraw');if(bd)bd.click();
      laminaAcaoUI();return;
    }
    if(modo==='d8'&&!laminaD8Status().preenchido){
      toast('D8 automático bloqueado: preencha primeiro as depressões do MDE ou escolha uma área tributária');
      return;
    }
    if(!(S.hidro.serie&&S.hidro.serie.length) && !(S.hidro.diario&&S.hidro.diario.dias&&S.hidro.diario.dias.length) && !S.hidro.idf){
      toast('Carregue a série histórica (Precipitação) ou ajuste a IDF antes'); return; }
    try{ if(typeof ED!=='undefined' && ED.on && typeof edLigar==='function') edLigar(false); }catch(e){}
    try{ inundBackstop(); }catch(e){}
    setTool('lamina'); bLam.textContent='◎ Toque no mapa — clique aqui para cancelar';
    if(window.matchMedia('(max-width:720px)').matches){ const s=document.getElementById('side'); if(s) s.classList.remove('open'); }
    map.getContainer().style.cursor='crosshair';
    toast('Toque no ponto onde quer saber a lâmina');
  };
  const bDraw=document.getElementById('btnBarrDraw');
  if(bDraw) bDraw.onclick=()=>{
    if(S.tool==='barr'){ barrFinaliza(); return; }
    try{ if(typeof ED!=='undefined' && ED.on && typeof edLigar==='function') edLigar(false); }catch(e){}
    S._barrBuf=[]; setTool('barr');
    map.getContainer().style.cursor='crosshair';
    bDraw.textContent='✓ Concluir';
    if(window.matchMedia('(max-width:720px)').matches){ const s=document.getElementById('side'); if(s) s.classList.remove('open'); }
    toast('Toque no mapa nos pontos do barramento — depois “✓ Concluir”');
  };
  const sel=document.getElementById('hBarrLay');
  if(sel) sel.onchange=hBarrInfo;
  const met=document.getElementById('hLamMetodo'), cbox=document.getElementById('hLamCBox'),
        scs=document.getElementById('hLamSCS'), grp=document.getElementById('hLamGrupo');
  const metodoUI=()=>{ const v=met?met.value:'scs';if(cbox)cbox.style.display=v==='c'?'':'none';
    if(scs)scs.style.display=v==='scs'?'':'none'; };
  if(met){met.onchange=metodoUI;metodoUI();}
  if(grp)grp.onchange=()=>{
    const pre={A:[88,74,49],B:[91,80,61],C:[94,85,70],D:[96,89,77]}[grp.value]||[94,85,70];
    ['hCnRock','hCnAnt','hCnVeg'].forEach((id,i)=>{const e=document.getElementById(id);if(e)e.value=pre[i];});
    toast('CNs sugeridos para o grupo '+grp.value+' — confirme conforme a cobertura real');
  };
  const bCn=document.getElementById('btnCnOrto');
  if(bCn)bCn.onclick=gerarCnOrto;
  cnMdtRefresh();
  const fCn=document.getElementById('hCnOrtoFile');
  const bCnFile=document.getElementById('btnCnOrtoFile');
  if(bCnFile&&fCn)bCnFile.onclick=()=>abrirSeletorGeoTIFF(fCn);
  if(fCn)fCn.onchange=async e=>{
    const f=e.target.files&&e.target.files[0];if(!f)return;
    try{
      await addRGBFromTIFF(f,f.name,f.size);
      const o=document.getElementById('hCnOrtoSrc');
      if(o)o.innerHTML=`Ortofoto: <b>${esc(f.name)}</b> · ${S.img._w}×${S.img._h} px`;
      toast('Ortofoto escolhida para a determinação do CN');
    }catch(err){toast('Não consegui carregar a ortofoto: '+(err.message||err));}
    finally{hideLoad();e.target.value='';}
  };
  const sCnLim=document.getElementById('hCnLimite'),bCnLim=document.getElementById('btnCnLimite');
  const cnLimUI=()=>{
    const o=document.getElementById('hCnLimiteOut'),m=sCnLim?sCnLim.value:'selecionado',L=cnLimiteAtual();
    if(o)o.innerHTML=L?`Limite pronto: <b>${esc(L.nome)}</b>`:
      (m==='selecionado'?'Selecione no mapa o polígono da bacia ou área do projeto.':
       m==='desenhado'?'Desenhe o polígono que limitará a classificação.':'Toda a ortofoto será analisada.');
    if(bCnLim)bCnLim.textContent=m==='desenhado'?'✏ Desenhar limite':(m==='selecionado'?'▱ Selecionar polígono':'✓ Extensão da ortofoto');
  };
  if(sCnLim)sCnLim.onchange=cnLimUI;
  if(bCnLim)bCnLim.onclick=()=>{
    const m=sCnLim?sCnLim.value:'selecionado';
    if(m==='orto'){cnLimUI();toast('A classificação usará toda a extensão válida da ortofoto');return;}
    if(m==='selecionado'){setTool('select');toast('Selecione o polígono limite no mapa e volte a este painel');return;}
    let L=(S.layers||[]).find(l=>l.gtype==='polygon'&&l.name==='Limite da análise CN');
    if(!L)L=addLayer({name:'Limite da análise CN',gtype:'polygon',crs:S.workCRS,features:[],
      fields:[{name:'FINALIDADE',type:'C',length:40,decimal:0}],color:'#2585c7'});
    S.activeId=L.id;refreshUI();setTool('poly');
    toast('Desenhe o limite da classificação e encerre com duplo clique');
  };
  cnLimUI();
  const sBacia=document.getElementById('hLamBacia');
  if(sBacia)sBacia.onchange=laminaAcaoUI;
  const bArea=document.getElementById('btnLamBaciaDraw');
  if(bArea)bArea.onclick=()=>{
    let L=(S.layers||[]).find(l=>l.gtype==='polygon'&&l.name==='Área contribuinte informada');
    if(!L)L=addLayer({name:'Área contribuinte informada',gtype:'polygon',crs:S.workCRS,features:[],
      fields:[{name:'AREA_M2',type:'N',length:14,decimal:0},{name:'AREA_HA',type:'N',length:12,decimal:3}],
      color:'#7aa2f7'});
    S.activeId=L.id;refreshUI();setTool('poly');
    const sb=document.getElementById('hLamBacia');if(sb)sb.value='contem';
    toast('Desenhe o limite da contribuição e encerre com duplo clique; depois indique o sump');
  };
  laminaAcaoUI();
  try{laminaD8Status();}catch(e){}
  ['hInundIni','hInundInc','hInundIter'].forEach(id=>{ const e=document.getElementById(id);
    if(e) e.addEventListener('input', hInundPrev); });
  try{ hBarrSync(); }catch(e){}
})();

/* Dimensionamento */
document.getElementById('btnRacional').onclick=()=>{
  const T=+document.getElementById('rT').value, L0=+document.getElementById('rL').value,
    dH=+document.getElementById('rH').value, A=+document.getElementById('rA').value;
  if(!S.hidro.idf){ toast('Gere ou informe a curva IDF primeiro'); return; }
  const tc=Math.max(5, 57*Math.pow(L0*L0*L0/dH,0.385));
  const i=idfI(tc,T);
  const cv=document.getElementById('rC').value;
  let C=+cv,cnTxt='';
  if(cv==='auto'){
    const sf=S.selFeat,SL=sf&&sf.layer,F=SL&&SL.features&&SL.features[sf.idx];
    const ring=cnRingDaFeicao(SL,F),dist=cnDistribuicaoDetalhada(ring);
    if(!dist){toast('Para C automático, selecione a área contribuinte e gere antes a camada CN');return;}
    const P=i*tc/60,amc=(document.getElementById('hLamAMC')||{}).value||'II';
    C=dist.rows.reduce((s,x)=>s+x.f*(P>0?laminaQscs(P,laminaCnAMC(x.cn,amc))/P:0),0);
    cnTxt=`\nC automático = <b>${C.toFixed(3)}</b> · ${dist.rows.length} classe(s) CN ponderadas na área`;
  }
  const Q=C*i*A/360;
  document.getElementById('hRacOut').innerHTML=
    `tc (Kirpich) = <b>${tc.toFixed(1)} min</b>\ni(tc, T=${T}) = <b>${i.toFixed(1)} mm/h</b>\n`+
    `<b>Q = ${Q.toFixed(3)} m³/s</b>  (${(Q*1000).toFixed(0)} L/s)${cnTxt}`;
};
document.getElementById('btnAreaSel').onclick=()=>{
  if(!S.selFeat){ toast('Selecione um polígono no mapa (◈)'); return; }
  const m=measureFeature(S.selFeat.layer,S.selFeat.layer.features[S.selFeat.idx]);
  if(!m.area){ toast('A feição selecionada não é polígono'); return; }
  document.getElementById('rA').value=(m.area/10000).toFixed(3);
  toast('Área da feição: '+fmtArea(m.area));
};
document.getElementById('btnCanal').onclick=()=>{
  const Q=+document.getElementById('cQ').value,n=+document.getElementById('cN').value,
    b=+document.getElementById('cB').value,zz=+document.getElementById('cZ').value,
    Sd=+document.getElementById('cS').value;
  const Qy=y=>{ const A=y*(b+zz*y), P=b+2*y*Math.sqrt(1+zz*zz);
    return (1/n)*Math.pow(A,5/3)*Math.pow(P,-2/3)*Math.sqrt(Sd); };
  let lo=0.001,hi=6;
  if(Qy(hi)<Q){ document.getElementById('hCanalOut').textContent='Seção insuficiente mesmo com y=6 m — aumente b ou S.'; return; }
  for(let it=0;it<70;it++){ const md=(lo+hi)/2; if(Qy(md)<Q)lo=md;else hi=md; }
  const y=(lo+hi)/2, A=y*(b+zz*y), v=Q/A;
  document.getElementById('hCanalOut').innerHTML=
    `Lâmina y = <b>${y.toFixed(2)} m</b> · A = ${A.toFixed(2)} m² · v = <b>${v.toFixed(2)} m/s</b>\n`+
    `Borda livre 0,15 m → altura de projeto <b>${(y+0.15).toFixed(2)} m</b>`+
    (v>4?'\n&#9888; v &gt; 4 m/s — prever dissipação/revestimento':'');
};
document.getElementById('btnDecant').onclick=()=>{
  const Q=+document.getElementById('dQ').value/1000, q0=+document.getElementById('dq0').value;
  const As=Q*3600/q0;
  document.getElementById('hDecOut').innerHTML=
    `A_s = Q/q&#8320; = <b>${As.toFixed(0)} m²</b>  (ex.: ${Math.ceil(Math.sqrt(As/3))} × ${Math.ceil(3*Math.sqrt(As/3))} m)\n`+
    `Volume útil (prof. 2,0 m) &#8776; <b>${(As*2).toFixed(0)} m³</b>`;
};
