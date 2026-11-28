/* GeoMine — Publicador: núcleo do visualizador entregue ao cliente.
   Só contas (sem tela, sem three.js): leitura dos dados embutidos, cota e inclinação da
   superfície, encontro do raio do toque com o terreno, medidas entre dois pontos e perfil.
   Convenções: x = leste, y = norte, z = cota, em metros, já descontada a origem da publicação.
   Grade: a coluna c tem centro em x0 + c·dx; a linha r (0 = norte) tem centro em y0 − r·dy. */
(function(root){
'use strict';
const C={};

C.bytes=function(texto){
  if(typeof atob==='function'){ const b=atob(texto), n=b.length, u=new Uint8Array(n); for(let i=0;i<n;i++) u[i]=b.charCodeAt(i); return u; }
  return new Uint8Array(Buffer.from(texto,'base64'));
};
C.u16=texto=>{ const u=C.bytes(texto); return new Uint16Array(u.buffer.slice(u.byteOffset,u.byteOffset+(u.byteLength&~1))); };
C.f32=texto=>{ const u=C.bytes(texto); return new Float32Array(u.buffer.slice(u.byteOffset,u.byteOffset+(u.byteLength&~3))); };

/* Cotas gravadas em 16 bits entre zmin e zmax (65535 = sem dado): passo de milímetros. */
C.superficie=function(d){
  const q=C.u16(d.z), n=d.nc*d.nr, z=new Float32Array(n), k=(d.zmax-d.zmin)/65534;
  if(q.length<n) throw new Error('Superfície "'+d.nome+'" incompleta.');
  for(let i=0;i<n;i++){ const v=q[i]; z[i]=v===65535?NaN:d.zmin+v*k; }
  return {id:d.id, nome:d.nome, papel:d.papel||'terreno', cor:d.cor||null, nc:d.nc, nr:d.nr, dx:d.dx, dy:d.dy, x0:d.x0, y0:d.y0,
    zmin:d.zmin, zmax:d.zmax, z, celula:d.celula||Math.max(d.dx,d.dy), nativa:d.nativa!==false, celulaNativa:d.celulaNativa||null,
    obra:d.obra?C.bytes(d.obra):null, oculta:d.oculta?C.bytes(d.oculta):null};
};
/* Máscaras de um bit por ponto da malha:
   obra   — num "MDT recortado" (terreno + projeto na mesma grade), os pontos que o projeto mudou;
   oculta — no terreno original, os pontos que ficam por baixo de um MDT recortado publicado junto.
            A tela não os desenha e o toque não os acha, mas a cota continua lá: é com ela que o
            perfil mostra o terreno original por baixo da pilha. */
C.bit=(m,i)=>m?((m[i>>3]>>(i&7))&1):0;

/* Cota no ponto, pela MESMA face triangular que a tela desenha (dois triângulos por célula:
   NO-SO-NE e NE-SO-SE). Assim o que se mede é o que se vê. Fora da malha ou em furo: NaN. */
C.alturaEm=function(s,x,y,soVisivel){
  const fc=(x-s.x0)/s.dx, fr=(s.y0-y)/s.dy;
  if(!(fc>=0&&fr>=0&&fc<=s.nc-1&&fr<=s.nr-1)) return NaN;
  const c=Math.min(s.nc-2,Math.floor(fc)), r=Math.min(s.nr-2,Math.floor(fr)), u=fc-c, v=fr-r, i=r*s.nc+c;
  const a=s.z[i], b=s.z[i+1], d=s.z[i+s.nc], e=s.z[i+s.nc+1], m=soVisivel?s.oculta:null;
  if(u+v<=1){
    if(m&&(C.bit(m,i)||C.bit(m,i+1)||C.bit(m,i+s.nc))) return NaN;
    return (a===a&&b===b&&d===d)?a+(b-a)*u+(d-a)*v:NaN;
  }
  if(m&&(C.bit(m,i+1)||C.bit(m,i+s.nc)||C.bit(m,i+s.nc+1))) return NaN;
  return (b===b&&d===d&&e===e)?e+(d-e)*(1-u)+(b-e)*(1-v):NaN;
};

/* Inclinação da superfície no ponto: método de Horn (vizinhança 3×3 de células), o mesmo dos
   mapas de declividade; na borda ou junto de um furo, a inclinação da face triangular. */
C.inclinacaoEm=function(s,x,y){
  const fc=(x-s.x0)/s.dx, fr=(s.y0-y)/s.dy;
  if(!(fc>=0&&fr>=0&&fc<=s.nc-1&&fr<=s.nr-1)) return null;
  const c=Math.round(fc), r=Math.round(fr), Z=(cc,rr)=>s.z[rr*s.nc+cc];
  let gx=NaN, gy=NaN, metodo='3x3';
  if(c>=1&&r>=1&&c<=s.nc-2&&r<=s.nr-2){
    const a=Z(c-1,r-1),b=Z(c,r-1),cc=Z(c+1,r-1),d=Z(c-1,r),f=Z(c+1,r),g=Z(c-1,r+1),h=Z(c,r+1),k=Z(c+1,r+1);
    if([a,b,cc,d,f,g,h,k].every(v=>v===v)){
      gx=((cc+2*f+k)-(a+2*d+g))/(8*s.dx);            // dz/dx (leste)
      gy=((a+2*b+cc)-(g+2*h+k))/(8*s.dy);            // dz/dy (norte): a linha 0 é a do norte
    }
  }
  if(gx!==gx){
    const c0=Math.min(s.nc-2,Math.floor(fc)), r0=Math.min(s.nr-2,Math.floor(fr)), u=fc-c0, v=fr-r0, i=r0*s.nc+c0;
    const a=s.z[i], b=s.z[i+1], d=s.z[i+s.nc], e=s.z[i+s.nc+1];
    if(u+v<=1){ if(!(a===a&&b===b&&d===d)) return null; gx=(b-a)/s.dx; gy=-(d-a)/s.dy; }
    else{ if(!(b===b&&d===d&&e===e)) return null; gx=(e-d)/s.dx; gy=-(e-b)/s.dy; }
    metodo='face';
  }
  const m=Math.hypot(gx,gy);
  /* caimento: para onde a água desce (contra o gradiente), em azimute a partir do norte */
  const az=m>1e-9?((Math.atan2(-gx,-gy)*180/Math.PI)+360)%360:null;
  return {graus:Math.atan(m)*180/Math.PI, pct:m*100, razao:m>1e-9?1/m:Infinity, caimento:az, metodo, z:C.alturaEm(s,x,y)};
};

/* Primeiro ponto em que o raio (origem o, direção d unitária, em coordenadas reais) encontra
   uma das superfícies. Caminha em passos de meia célula e refina por bisseção. */
C.intersecaoRaio=function(sups,o,d,alcance){
  let melhor=null;
  for(const s of sups){
    const x1=s.x0+(s.nc-1)*s.dx, y1=s.y0-(s.nr-1)*s.dy;
    let t0=0, t1=alcance||1e7;
    const corta=(p,dir,lo,hi)=>{
      if(Math.abs(dir)<1e-12) return p>=lo&&p<=hi;
      let a=(lo-p)/dir, b=(hi-p)/dir; if(a>b){ const k=a; a=b; b=k; }
      t0=Math.max(t0,a); t1=Math.min(t1,b); return t0<=t1;
    };
    if(!corta(o[0],d[0],s.x0,x1)||!corta(o[1],d[1],y1,s.y0)||!corta(o[2],d[2],s.zmin-1,s.zmax+1)) continue;
    const passo=Math.max(1e-3,Math.min(s.dx,s.dy)*0.5), n=Math.min(200000,Math.ceil((t1-t0)/passo)+1);
    let tp=null, fp=NaN;
    for(let i=0;i<=n;i++){
      const t=Math.min(t1,t0+i*passo), h=C.alturaEm(s,o[0]+d[0]*t,o[1]+d[1]*t,true), f=h===h?(o[2]+d[2]*t)-h:NaN;
      if(f===f&&fp===fp&&fp>0&&f<=0){
        let a=tp, b=t;
        for(let k=0;k<24;k++){ const m=(a+b)/2, hm=C.alturaEm(s,o[0]+d[0]*m,o[1]+d[1]*m,true), fm=hm===hm?(o[2]+d[2]*m)-hm:NaN; if(fm!==fm||fm<=0) b=m; else a=m; }
        const x=o[0]+d[0]*b, y=o[1]+d[1]*b, z=C.alturaEm(s,x,y,true);
        if(z===z&&(!melhor||b<melhor.t)) melhor={t:b,x,y,z,sup:s};
        break;
      }
      tp=t; fp=f;
      if(melhor&&t>melhor.t) break;
    }
  }
  return melhor;
};

/* Superfície "de cima" no ponto (a de maior cota entre as que a tela desenha ali). */
C.topoEm=function(sups,x,y){
  let m=null;
  for(const s of sups){ const z=C.alturaEm(s,x,y,true); if(z===z&&(!m||z>m.z)) m={z,sup:s}; }
  return m;
};

/* Medida entre dois pontos {x,y,z}: distância horizontal, desnível e inclinação da reta A→B. */
C.doisPontos=function(a,b){
  const dx=b.x-a.x, dy=b.y-a.y, dh=Math.hypot(dx,dy), dv=b.z-a.z, d3=Math.hypot(dh,dv);
  const tem=dh>1e-9;
  return {dh, dv, d3, pct:tem?dv/dh*100:(dv===0?0:Infinity*Math.sign(dv)), graus:Math.atan2(Math.abs(dv),dh)*180/Math.PI,
    razao:Math.abs(dv)>1e-9?dh/Math.abs(dv):Infinity, azimute:tem?((Math.atan2(dx,dy)*180/Math.PI)+360)%360:null, sobe:dv>0};
};

/* Perfil A→B sobre cada superfície, amostrado a cada meia célula (nunca mais de 2.000 pontos).
   A inclinação máxima é medida em trechos de uma célula inteira, para não repetir o serrilhado
   de uma face só. */
C.perfil=function(sups,a,b,maxPontos){
  const dh=Math.hypot(b.x-a.x,b.y-a.y);
  if(!(dh>0)) return null;
  const cel=Math.min.apply(null,sups.map(s=>Math.min(s.dx,s.dy))), n=Math.max(2,Math.min(maxPontos||2000,Math.ceil(dh/(cel*0.5))+1));
  const d=new Float64Array(n); for(let i=0;i<n;i++) d[i]=dh*i/(n-1);
  const series=sups.map(s=>{
    const z=new Float32Array(n); let zi=NaN, zf=NaN, di=NaN, df=NaN, zmin=Infinity, zmax=-Infinity, validos=0;
    for(let i=0;i<n;i++){
      const t=i/(n-1), v=C.alturaEm(s,a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t); z[i]=v;
      if(v===v){ validos++; if(zi!==zi){ zi=v; di=d[i]; } zf=v; df=d[i]; if(v<zmin) zmin=v; if(v>zmax) zmax=v; }
    }
    const janela=Math.max(1,Math.round(Math.max(s.dx,s.dy)/(dh/(n-1))));
    let maxPct=0, onde=null;
    for(let i=0;i+janela<n;i++){
      const z0=z[i], z1=z[i+janela]; if(z0!==z0||z1!==z1) continue;
      let furo=false; for(let k=i+1;k<i+janela;k++) if(z[k]!==z[k]){ furo=true; break; }
      if(furo) continue;
      const p=Math.abs(z1-z0)/(d[i+janela]-d[i])*100;
      if(p>maxPct){ maxPct=p; onde=(d[i]+d[i+janela])/2; }
    }
    const media=(df>di)?(zf-zi)/(df-di)*100:null;
    return {id:s.id, nome:s.nome, papel:s.papel, cor:s.cor, z, validos, zmin:validos?zmin:null, zmax:validos?zmax:null,
      desnivel:validos?zf-zi:null, mediaPct:media, mediaGraus:media==null?null:Math.atan(Math.abs(media)/100)*180/Math.PI,
      maxPct:validos>1?maxPct:null, maxGraus:validos>1?Math.atan(maxPct/100)*180/Math.PI:null, maxEm:onde};
  }).filter(q=>q.validos>1);
  return {dh, d, series};
};

/* Cores por cota (do vale ao topo), no espírito da hipsometria do GeoMine. t em 0..1 → [r,g,b] 0..1 */
const RAMPA=[[0,[0.36,0.60,0.33]],[0.25,[0.62,0.74,0.38]],[0.5,[0.86,0.80,0.46]],[0.72,[0.76,0.56,0.33]],[0.9,[0.62,0.45,0.36]],[1,[0.93,0.91,0.88]]];
C.rampa=function(t){
  t=t!==t?0:Math.max(0,Math.min(1,t));
  for(let i=1;i<RAMPA.length;i++) if(t<=RAMPA[i][0]){
    const a=RAMPA[i-1], b=RAMPA[i], f=(t-a[0])/(b[0]-a[0]||1);
    return [a[1][0]+(b[1][0]-a[1][0])*f, a[1][1]+(b[1][1]-a[1][1])*f, a[1][2]+(b[1][2]-a[1][2])*f];
  }
  return RAMPA[RAMPA.length-1][1].slice();
};

C.fmt=function(v,casas){
  if(v==null||v!==v) return '—';
  if(!isFinite(v)) return '∞';
  return Number(v).toLocaleString('pt-BR',{minimumFractionDigits:casas,maximumFractionDigits:casas});
};
/* "1V : 2,5H" — a forma como o talude é escrito em projeto */
C.talude=function(razao){ return razao==null||razao!==razao?'—':(!isFinite(razao)?'plano':'1V : '+C.fmt(razao,razao<10?2:1)+'H'); };
C.rumo=function(az){
  if(az==null||az!==az) return '—';
  return ['N','NE','L','SE','S','SO','O','NO'][Math.round(az/45)%8]+' ('+C.fmt(az,0)+'°)';
};

root.GeoMinePubCore=C;
})(typeof window!=='undefined'?window:globalThis);
