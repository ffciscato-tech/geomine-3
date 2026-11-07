
/* ============================================================================
   TRÊS CORREÇÕES DE SUPERFÍCIE

   1) O recorte passa a coincidir com o limite escolhido
      clipGridByRings incluía toda célula TOCADA pelo polígono e ainda
      completava a vizinhança vertical. Numa poligonal de 1.097.653 ha isso
      devolvia 1.101.755 ha — meia célula sobrando em toda a volta. O desenho
      escondia a sobra (rasterCanvas mascara pelos anéis exatos), mas a área,
      a contagem de células e o GeoTIFF exportado carregavam o excesso. Passa
      a valer o CENTRO da célula, que é o critério que faz área e limite
      coincidirem. A regra antiga fica na caixa "incluir célula tocada".

   2) Área do recorte com célula retangular
      runClip calculava out.cs*out.cs. Com célula de 61,47 × 41,65 m — o que o
      download de MDE vinha produzindo — o número saía 48% maior.

   3) Escala de cor por percentil
      rasterStats devolvia mínimo e máximo absolutos. Mil células defeituosas
      em sete milhões (0,02%) esticavam a rampa de −656 a 488 m, e o relevo
      real, de 0 a 53 m, ocupava 4,7% dela: tudo saía de uma cor só. Quando os
      extremos são cauda fina, a rampa passa a usar o percentil 2–98.

   Bloco ADITIVO: envelopa funções globais, não reescreve nenhuma no lugar.
   ========================================================================== */
(function(){
'use strict';
if(window.ALAGIS125){ console.info('[125] já instalado'); return; }
window.ALAGIS125=1;

/* ------------------------------------------------------------------ 1 + 2 --
   Recorte. Mesma varredura por linha da versão original; muda só o critério
   de inclusão nas pontas do intervalo e o descarte da expansão vertical. */
const clipAntigo = window.clipGridByRings;
const ULT = {areaHa:null, dentro:null, borda:null};

window.clipGridByRings = function(g, rings, opt){
  const {invert=false, crop=true, buf=0, borda='centro'}=opt||{};
  const csy=g.csy||g.cs;
  let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity;
  rings.forEach(r=>r.forEach(([x,y])=>{ if(x<mnX)mnX=x; if(x>mxX)mxX=x;
    if(y<mnY)mnY=y; if(y>mxY)mxY=y; }));
  if(!isFinite(mnX)) throw new Error('máscara sem geometria válida');
  mnX-=buf; mnY-=buf; mxX+=buf; mxY+=buf;

  const cy = r => g.yll+(g.nr-0.5-r)*csy;
  let c0=0, c1=g.nc-1, r0=0, r1=g.nr-1;
  if(crop && !invert){
    c0=Math.max(0, Math.floor((mnX-g.xll)/g.cs));
    c1=Math.min(g.nc-1, Math.ceil((mxX-g.xll)/g.cs));
    r0=Math.max(0, Math.floor((g.yll+g.nr*csy-mxY)/csy));
    r1=Math.min(g.nr-1, Math.ceil((g.yll+g.nr*csy-mnY)/csy));
    if(c1<c0||r1<r0) throw new Error('a máscara não intersecta o raster');
  }
  const nc=c1-c0+1, nr=r1-r0+1;
  const z=new Float32Array(nc*nr); z.fill(NaN);

  const E=[], bordas=[];
  rings.forEach(r=>{ for(let i=0;i<r.length-1;i++){
    const a=r[i], b=r[i+1];
    bordas.push([a,b]);
    if(a[1]!==b[1]) E.push([a[0],a[1],b[0],b[1]]);
  }
  const a=r[r.length-1], b=r[0];
  if(a && b && (a[0]!==b[0]||a[1]!==b[1])){
    bordas.push([a,b]);
    if(a[1]!==b[1])E.push([a[0],a[1],b[0],b[1]]);
  }
  });

  /* Centro da célula c está em xll+(c+0.5)*cs. Exigir que ele caia dentro do
     intervalo [xa,xb] dá ca=ceil((xa-xll)/cs-0.5) e cb=floor((xb-xll)/cs-0.5).
     A regra antiga usava floor/ceil sobre a borda da célula — daí a meia
     célula a mais de cada lado. */
  const centro = (borda!=='toca');
  const faixa = (xa,xb)=> centro
    ? [Math.max(c0, Math.ceil((xa-g.xll)/g.cs-0.5)),
       Math.min(c1, Math.floor((xb-g.xll)/g.cs-0.5))]
    : [Math.max(c0, Math.floor((xa-g.xll)/g.cs)),
       Math.min(c1, Math.ceil((xb-g.xll)/g.cs)-1)];

  let dentro=0;
  const xs=[];
  for(let r=r0;r<=r1;r++){
    const yc=cy(r);
    xs.length=0;
    for(let k=0;k<E.length;k++){
      const [x1,y1,x2,y2]=E[k];
      if((y1<=yc)!==(y2<=yc)) xs.push(x1+(yc-y1)*(x2-x1)/(y2-y1));
    }
    xs.sort((a,b)=>a-b);
    const dst=(r-r0)*nc;
    if(!invert){
      for(let i=0;i+1<xs.length;i+=2){
        const [ca,cb]=faixa(xs[i],xs[i+1]);
        for(let c=ca;c<=cb;c++){ const v=g.z[r*g.nc+c];
          z[dst+(c-c0)]=v; if(!isNaN(v)) dentro++; }
      }
    } else {
      for(let c=c0;c<=c1;c++){ const v=g.z[r*g.nc+c]; z[dst+(c-c0)]=v; }
      for(let i=0;i+1<xs.length;i+=2){
        const [ca,cb]=faixa(xs[i],xs[i+1]);
        for(let c=ca;c<=cb;c++) z[dst+(c-c0)]=NaN;
      }
      for(let c=c0;c<=c1;c++) if(!isNaN(z[dst+(c-c0)])) dentro++;
    }
  }

  /* A expansão vertical só faz sentido junto com o "célula tocada": ela existe
     para fechar cantos e trechos oblíquos que a varredura horizontal deixaria
     recuados. No modo centro ela reintroduziria a sobra. */
  if(!invert && !centro){
    const base=z.slice();
    for(let rr=0;rr<nr;rr++) for(let cc=0;cc<nc;cc++){
      const oi=rr*nc+cc;
      if(Number.isFinite(base[oi])) continue;
      const gv=Number(g.z[(r0+rr)*g.nc+(c0+cc)]);
      if(!Number.isFinite(gv)) continue;
      let toca=false;
      for(let dr=-1;dr<=1&&!toca;dr++) for(let dc=-1;dc<=1;dc++){
        if(!dr&&!dc) continue;
        const ar=rr+dr,ac=cc+dc;
        if(ar>=0&&ar<nr&&ac>=0&&ac<nc&&Number.isFinite(base[ar*nc+ac])){toca=true;break;}
      }
      if(toca){z[oi]=gv;dentro++;}
    }
  }

  /* Folga real: além de ampliar a janela, inclui/remove toda célula cujo
     centro esteja a até `buf` de uma borda. Isso expande o contorno externo
     e retrai furos, como um buffer positivo convencional. */
  if(buf>0&&bordas.length){
    const b2=buf*buf+1e-12;
    for(const [a,b] of bordas){
      const xmin=Math.min(a[0],b[0])-buf,xmax=Math.max(a[0],b[0])+buf,
        ymin=Math.min(a[1],b[1])-buf,ymax=Math.max(a[1],b[1])+buf,
        ca=Math.max(c0,Math.ceil((xmin-g.xll)/g.cs-.5)),
        cb=Math.min(c1,Math.floor((xmax-g.xll)/g.cs-.5)),
        ra=Math.max(r0,Math.ceil(g.nr-.5-(ymax-g.yll)/csy)),
        rb=Math.min(r1,Math.floor(g.nr-.5-(ymin-g.yll)/csy)),
        dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy;
      for(let r=ra;r<=rb;r++)for(let c=ca;c<=cb;c++){
        const x=g.xll+(c+.5)*g.cs,y=cy(r),
          t=Math.max(0,Math.min(1,l2?((x-a[0])*dx+(y-a[1])*dy)/l2:0)),
          qx=a[0]+t*dx,qy=a[1]+t*dy;
        if((x-qx)*(x-qx)+(y-qy)*(y-qy)>b2)continue;
        const oi=(r-r0)*nc+(c-c0);
        if(invert){if(Number.isFinite(z[oi])){z[oi]=NaN;dentro--;}}
        else if(!Number.isFinite(z[oi])){
          const v=g.z[r*g.nc+c];if(Number.isFinite(v)){z[oi]=v;dentro++;}
        }
      }
    }
  }

  ULT.dentro=dentro; ULT.borda=centro?'centro':'toca';
  ULT.areaHa=dentro*g.cs*csy/1e4;          /* csy, não cs duas vezes */
  return {nc, nr, cs:g.cs, csy, xll:g.xll+c0*g.cs, yll:g.yll+(g.nr-1-r1)*csy, z,
          native:true, dentro, areaHa:ULT.areaHa};
};

/* área do polígono da máscara, para comparar com a do recorte */
function areaAneis(rings){
  let a=0;
  rings.forEach(r=>{ let s=0;
    for(let i=0,n=r.length;i<n;i++){ const p=r[i], q=r[(i+1)%n];
      s+=p[0]*q[1]-q[0]*p[1]; }
    a+=s/2;
  });
  return Math.abs(a)/1e4;
}

/* caixa de opção na aba de recorte */
function instalaCaixa(){
  const inv=document.getElementById('clInv');
  if(!inv || document.getElementById('clToca')) return;
  const lab=inv.closest('label'); if(!lab) return;
  const nova=document.createElement('label');
  nova.style.cssText=lab.style.cssText||'display:flex;align-items:center;gap:8px;font-size:12px;margin-top:5px;cursor:pointer';
  nova.innerHTML='<input type="checkbox" id="clToca" style="width:auto;accent-color:var(--amber)">'+
    'Incluir toda célula tocada pelo limite (borda antiga)';
  lab.parentNode.insertBefore(nova,lab.nextSibling);
  const dica=document.createElement('div');
  dica.className='hint'; dica.style.marginTop='4px';
  dica.textContent='Sem marcar, entra a célula cujo CENTRO cai dentro do polígono — '+
    'é o que faz a área do recorte coincidir com a do limite.';
  nova.parentNode.insertBefore(dica,nova.nextSibling);
}

const runAntigo = window.runClip;
if(typeof runAntigo==='function'){
  window.runClip=async function(){
    const cx=document.getElementById('clToca');
    const antes=(window.S&&S.rasters)?S.rasters.length:0;
    ULT.areaHa=null;
    /* clipGridByRings é chamada de dentro de runClip sem a opção nova; o modo
       vem por aqui, lido no momento do clique. */
    const modo=(cx&&cx.checked)?'toca':'centro';
    const guarda=window.clipGridByRings;
    window.clipGridByRings=function(g,rings,opt){
      const o=Object.assign({},opt||{},{borda:modo});
      const res=guarda(g,rings,o);
      ULT.aneisHa=areaAneis(rings);
      return res;
    };
    try{ return await runAntigo.apply(this,arguments); }
    finally{
      window.clipGridByRings=guarda;
      const el=document.getElementById('clOut');
      if(el && ULT.areaHa!=null && S.rasters.length>antes){
        const fmt=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:2});
        el.innerHTML=el.innerHTML.replace(
          /Área recortada: <b>[^<]*<\/b> ha/,
          'Área recortada: <b>'+fmt(ULT.areaHa)+'</b> ha'+
          (ULT.aneisHa?' · limite: '+fmt(ULT.aneisHa)+' ha ('+
            (100*ULT.areaHa/ULT.aneisHa).toFixed(1)+'%)':'')+
          ' · borda pelo '+(ULT.borda==='centro'?'centro da célula':'toque'));
      }
    }
  };
}

/* ---------------------------------------------------------------------- 3 --
   Faixa de cor por percentil quando os extremos forem cauda fina. */
const statsAntigo = window.rasterStats;
window.rasterStats=function(d){
  const st=statsAntigo(d);
  try{
    if(!isFinite(st.mn)||!isFinite(st.mx)||!(st.mx>st.mn)) return st;
    const z=d.z, N=4096, h=new Uint32Array(N), esc=(N-1)/(st.mx-st.mn);
    let n=0;
    for(let k=0;k<z.length;k++){ const v=z[k];
      if(isNaN(v)) continue;
      let i=((v-st.mn)*esc)|0; if(i<0)i=0; else if(i>=N)i=N-1;
      h[i]++; n++;
    }
    if(n<1000) return st;
    const corte=q=>{ let ac=0; const lim=q*n;
      for(let i=0;i<N;i++){ ac+=h[i]; if(ac>=lim) return st.mn+i/esc; }
      return st.mx; };
    const p2=corte(0.02), p98=corte(0.98);
    st.mnAbs=st.mn; st.mxAbs=st.mx;
    /* Só intervém quando a cauda é realmente fina: se o miolo de 96% já ocupa
       metade ou mais da faixa, o raster é normal e nada muda. */
    if(p98>p2 && (p98-p2)/(st.mx-st.mn) < 0.5){
      st.mn=p2; st.mx=p98; st.cauda=true;
    }
  }catch(e){ console.warn('[125] percentil:',e); }
  return st;
};

/* superfícies já carregadas guardam _st da regra antiga */
function redesenha(){
  try{
    (S.rasters||[]).forEach(r=>{ delete r._st; });
    (S.rasters||[]).forEach(r=>{ try{ renderRaster(r); }catch(e){} });
  }catch(e){}
}

function partida(){ instalaCaixa(); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',partida,{once:true});
else partida();
document.addEventListener('click',()=>setTimeout(instalaCaixa,120),{passive:true});
setTimeout(()=>{ instalaCaixa(); redesenha(); },900);
window.alagisRedesenhaSuperficies=redesenha;
})();
