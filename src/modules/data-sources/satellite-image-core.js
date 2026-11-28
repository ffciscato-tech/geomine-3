/* GeoMine — contas do mosaico de satélite (GIS › Baixar satélite).
   Sem DOM e sem rede: só a aritmética dos quadros do mapa de fundo (Web Mercator, 256 px).
   O recorte é sempre em pixels inteiros do provedor — a imagem baixada nunca é reamostrada,
   e os limites devolvidos são os das bordas desses pixels. */
(function(root){
'use strict';
const C={};
const LADO=256, RAIO=6378137, VOLTA=2*Math.PI*RAIO, LAT_MAX=85.05112878;
C.LADO=LADO;

/* posição (fracionária) de um ponto na grade de quadros do nível z */
C.quadro=function(lon,lat,z){
  const n=Math.pow(2,z), f=Math.max(-LAT_MAX,Math.min(LAT_MAX,lat))*Math.PI/180;
  return [(lon+180)/360*n, (1-Math.log(Math.tan(f)+1/Math.cos(f))/Math.PI)/2*n];
};
C.lonLat=function(x,y,z){
  const n=Math.pow(2,z);
  return [x/n*360-180, Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI];
};
/* tamanho de um pixel no terreno, em metros, na latitude dada */
C.metrosPorPixel=(lat,z)=>VOLTA*Math.cos(lat*Math.PI/180)/(LADO*Math.pow(2,z));

/* Retângulo em graus que envolve anéis [[lon,lat],…] */
C.areaDosAneis=function(aneis){
  let o=Infinity,s=Infinity,l=-Infinity,n=-Infinity;
  for(const a of aneis||[]) for(const p of a||[]){
    if(!p||!Number.isFinite(p[0])||!Number.isFinite(p[1])) continue;
    if(p[0]<o) o=p[0]; if(p[0]>l) l=p[0]; if(p[1]<s) s=p[1]; if(p[1]>n) n=p[1];
  }
  return (l>o&&n>s)?{oeste:o,sul:s,leste:l,norte:n}:null;
};
C.areaValida=a=>!!a&&[a.oeste,a.sul,a.leste,a.norte].every(Number.isFinite)&&a.leste>a.oeste&&a.norte>a.sul&&a.norte<=LAT_MAX&&a.sul>=-LAT_MAX;

/* O que baixar para cobrir a área no nível z: pixels globais do canto, tamanho, quadros e os
   limites exatos (bordas dos pixels) da imagem que sai. */
C.plano=function(area,z){
  const a=C.quadro(area.oeste,area.norte,z), b=C.quadro(area.leste,area.sul,z), e=1e-7;
  const px0=Math.floor(a[0]*LADO+e), py0=Math.floor(a[1]*LADO+e);
  const largura=Math.max(1,Math.ceil(b[0]*LADO-e)-px0), altura=Math.max(1,Math.ceil(b[1]*LADO-e)-py0);
  const tx0=Math.floor(px0/LADO), ty0=Math.floor(py0/LADO), tx1=Math.floor((px0+largura-1)/LADO), ty1=Math.floor((py0+altura-1)/LADO);
  const no=C.lonLat(px0/LADO,py0/LADO,z), se=C.lonLat((px0+largura)/LADO,(py0+altura)/LADO,z);
  return {z, px0, py0, largura, altura, pixels:largura*altura, tx0, ty0, tx1, ty1,
    quadros:(tx1-tx0+1)*(ty1-ty0+1), mpp:C.metrosPorPixel((area.norte+area.sul)/2,z),
    limites:{oeste:no[0],norte:no[1],leste:se[0],sul:se[1]}};
};
/* Quadros do plano, com a posição de cada um dentro da imagem (pode começar fora dela).
   Com o polígono do recorte (anéis já orientados, em pixels da imagem), ficam de fora os quadros
   que não têm nenhum pedaço dentro dele: não são baixados. */
C.quadros=function(p,aneis){
  const n=Math.pow(2,p.z), out=[];
  for(let ty=p.ty0;ty<=p.ty1;ty++) for(let tx=p.tx0;tx<=p.tx1;tx++){
    const dx=tx*LADO-p.px0, dy=ty*LADO-p.py0;
    if(aneis&&!C.retanguloToca(aneis,dx-1,dy-1,dx+LADO+1,dy+LADO+1)) continue;
    out.push({x:((tx%n)+n)%n, y:ty, z:p.z, dx, dy});
  }
  return out;
};

/* O que o aparelho monta numa imagem só. Tablet e telefone: 16,7 milhões de pixels (limite de
   tela de desenho do iPad); computador: 64 milhões. */
C.limiteDoAparelho=movel=>movel?{maxPixels:4096*4096,maxLado:16384}:{maxPixels:8192*8192,maxLado:16384};

/* Um plano por nível, do mais fino para o mais grosso, dizendo qual cabe no aparelho */
C.niveis=function(area,op){
  const zMax=Math.round(op.zMax), zMin=Math.min(zMax,Math.round(op.zMin!=null?op.zMin:Math.max(1,zMax-8))), out=[];
  for(let z=zMax;z>=zMin;z--){
    const p=C.plano(area,z);
    p.cabe=p.pixels<=op.maxPixels&&p.largura<=op.maxLado&&p.altura<=op.maxLado;
    out.push(p);
  }
  return out;
};
/* O mais fino que cabe (null: nem o mais grosso da lista cabe) */
C.melhor=niveis=>niveis.find(p=>p.cabe)||null;

/* Endereço de um quadro a partir do modelo do mapa de fundo ({s},{x},{y},{z}); o servidor é
   escolhido como o Leaflet escolhe, para aproveitar o que o navegador já tem guardado */
C.url=function(modelo,servidores,x,y,z){
  const s=servidores&&servidores.length?servidores[Math.abs(x+y)%servidores.length]:'';
  return String(modelo).replace(/\{s\}/g,s).replace(/\{x\}/g,x).replace(/\{y\}/g,y).replace(/\{z\}/g,z);
};

/* Anel em graus → pixels da imagem do plano (para a máscara do polígono) */
C.anelEmPixels=function(anel,p){
  return (anel||[]).map(v=>{ const q=C.quadro(v[0],v[1],p.z); return [q[0]*LADO-p.px0, q[1]*LADO-p.py0]; });
};
/* Um ponto está dentro de um anel? (regra par-ímpar) */
C.dentro=function(anel,x,y){
  let impar=false;
  for(let i=0,j=anel.length-1;i<anel.length;j=i++){
    const xi=anel[i][0], yi=anel[i][1], xj=anel[j][0], yj=anel[j][1];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi) impar=!impar;
  }
  return impar;
};
const areaComSinal=a=>{ let s=0; for(let i=0,j=a.length-1;i<a.length;j=i++) s+=a[j][0]*a[i][1]-a[i][0]*a[j][1]; return s/2; };
/* Feições (cada uma com os seus anéis) → uma lista só de anéis, orientados para o preenchimento
   por número de voltas: dentro de cada feição o furo fica de fora, e duas feições que se
   sobrepõem se somam (com a regra par-ímpar no conjunto, a sobreposição viraria um buraco). */
C.orienta=function(feicoes){
  const out=[];
  for(const aneis of feicoes||[]){
    const bons=(aneis||[]).filter(a=>Array.isArray(a)&&a.length>=3);
    bons.forEach((a,i)=>{
      let nivel=0;
      bons.forEach((b,k)=>{ if(k!==i&&C.dentro(b,a[0][0],a[0][1])) nivel++; });
      const quer=nivel%2===0?1:-1, tem=areaComSinal(a)>=0?1:-1;
      out.push(tem===quer?a:a.slice().reverse());
    });
  }
  return out;
};
/* Número de voltas dos anéis orientados em torno do ponto (0 = fora) */
C.voltas=function(aneis,x,y){
  let w=0;
  for(const a of aneis||[]) for(let i=0,j=a.length-1;i<a.length;j=i++){
    const x0=a[j][0], y0=a[j][1], x1=a[i][0], y1=a[i][1], lado=(x1-x0)*(y-y0)-(x-x0)*(y1-y0);
    if(y0<=y){ if(y1>y&&lado>0) w++; } else if(y1<=y&&lado<0) w--;
  }
  return w;
};
/* O segmento passa pelo retângulo? (recorte de Liang–Barsky) */
function segmentoNoRetangulo(ax,ay,bx,by,x0,y0,x1,y1){
  let t0=0, t1=1; const dx=bx-ax, dy=by-ay, p=[-dx,dx,-dy,dy], q=[ax-x0,x1-ax,ay-y0,y1-ay];
  for(let i=0;i<4;i++){
    if(p[i]===0){ if(q[i]<0) return false; continue; }
    const r=q[i]/p[i];
    if(p[i]<0){ if(r>t1) return false; if(r>t0) t0=r; } else { if(r<t0) return false; if(r<t1) t1=r; }
  }
  return true;
}
/* O retângulo tem algum pedaço dentro do polígono? Um canto dentro, ou uma borda que o atravessa. */
C.retanguloToca=function(aneis,x0,y0,x1,y1){
  for(const c of [[(x0+x1)/2,(y0+y1)/2],[x0,y0],[x1,y0],[x1,y1],[x0,y1]]) if(C.voltas(aneis,c[0],c[1])!==0) return true;
  for(const a of aneis||[]) for(let i=0,j=a.length-1;i<a.length;j=i++)
    if(segmentoNoRetangulo(a[j][0],a[j][1],a[i][0],a[i][1],x0,y0,x1,y1)) return true;
  return false;
};
/* Parte da imagem que fica dentro do polígono (0 a 1), por amostragem regular */
C.fracaoDentro=function(aneis,largura,altura,n){
  n=n||48; let d=0;
  for(let i=0;i<n;i++) for(let j=0;j<n;j++) if(C.voltas(aneis,(i+.5)*largura/n,(j+.5)*altura/n)!==0) d++;
  return d/(n*n);
};

/* Textos do card de resolução */
C.textoResolucao=function(mpp){
  const br=(v,d)=>v.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  return mpp<0.995?br(mpp*100,mpp<0.0995?1:0)+' cm/px':br(mpp,mpp<9.95?1:0)+' m/px';
};
C.textoPixels=function(n){
  const mp=n/1e6;
  return mp<0.95?Math.max(1,Math.round(n/1000)).toLocaleString('pt-BR')+' mil px':mp.toLocaleString('pt-BR',{minimumFractionDigits:mp<9.95?1:0,maximumFractionDigits:mp<9.95?1:0})+' MP';
};

root.GeoMineSatImageCore=C;
})(typeof window!=='undefined'?window:globalThis);
