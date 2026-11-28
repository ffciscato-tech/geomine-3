/* GeoMine — Publicador: empacotamento dos dados e montagem do HTML entregue ao cliente.
   Só contas e texto (sem tela): pode ser testado fora do navegador. O formato é lido por
   viewer-core.js; mudar um lado sem o outro quebra as publicações novas. */
(function(root){
'use strict';
const P={VERSAO:1};

/* base64 em blocos múltiplos de 3 bytes (sem "=" no meio), para não montar uma string
   intermediária do tamanho da grade inteira */
P.b64=function(bytes){
  if(!(bytes instanceof Uint8Array)) bytes=new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(typeof btoa!=='function') return Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength).toString('base64');
  const bloco=3*16384, partes=[];
  for(let i=0;i<bytes.length;i+=bloco){
    const fatia=bytes.subarray(i,i+bloco); let s='';
    for(let k=0;k<fatia.length;k+=8192) s+=String.fromCharCode.apply(null,fatia.subarray(k,k+8192));
    partes.push(btoa(s));
  }
  return partes.join('');
};

/* Cotas em 16 bits entre a menor e a maior (65535 = sem dado). Num desnível de 300 m o passo é
   de 4,6 mm — abaixo de qualquer levantamento — e a grade ocupa metade do que ocuparia em 32 bits. */
P.quantizaZ=function(z){
  let zmin=Infinity, zmax=-Infinity, validas=0;
  for(let i=0;i<z.length;i++){ const v=z[i]; if(v===v&&isFinite(v)){ validas++; if(v<zmin) zmin=v; if(v>zmax) zmax=v; } }
  if(!validas) return null;
  if(zmax-zmin<1e-6) zmax=zmin+1e-3;
  const q=new Uint16Array(z.length), k=65534/(zmax-zmin);
  for(let i=0;i<z.length;i++){ const v=z[i]; q[i]=(v===v&&isFinite(v))?Math.max(0,Math.min(65534,Math.round((v-zmin)*k))):65535; }
  return {zmin, zmax, q, validas};
};

/* De quanto em quanto pular células para a malha caber em maxCelulas (1 = todas) */
P.passoDaMalha=function(nc,nr,maxCelulas){
  if(!(maxCelulas>0)||nc*nr<=maxCelulas) return 1;
  return Math.max(2,Math.ceil(Math.sqrt(nc*nr/maxCelulas)));
};

/* Superfície: grade regular no CRS de trabalho. x0/y0 são o centro da primeira coluna e da
   primeira linha (a do norte), já sem a origem. */
P.superficie=function(s,origem){
  const q=P.quantizaZ(s.z); if(!q) return null;
  const o={id:String(s.id), nome:String(s.nome||'Superfície'), papel:['projeto','recorte'].includes(s.papel)?s.papel:'terreno', cor:s.cor||null,
    nc:s.nc, nr:s.nr, dx:+s.dx, dy:+s.dy, x0:+(s.x0-origem[0]).toFixed(4), y0:+(s.y0-origem[1]).toFixed(4),
    zmin:+q.zmin.toFixed(4), zmax:+q.zmax.toFixed(4), celula:Math.max(s.dx,s.dy), nativa:s.nativa!==false,
    celulaNativa:s.celulaNativa||null, validas:q.validas, z:P.b64(new Uint8Array(q.q.buffer))};
  if(s.obra) o.obra=P.mascara(s.obra);
  if(s.oculta) o.oculta=P.mascara(s.oculta);
  return o;
};
/* Marcas de 0/1 por ponto da malha → um bit por ponto, em base64 */
P.mascara=function(marcas){
  const m=new Uint8Array(Math.ceil(marcas.length/8));
  for(let i=0;i<marcas.length;i++) if(marcas[i]) m[i>>3]|=1<<(i&7);
  return P.b64(m);
};
/* MDT RECORTADO PUBLICADO JUNTO COM O TERRENO ORIGINAL. O recorte de uma cava ou pilha é uma
   grade só, com o terreno e o projeto; por baixo dela o terreno original é o mesmo chão (as duas
   malhas brigariam na tela) ou, numa cava, fica ACIMA do fundo escavado e o esconderia. O terreno
   é então marcado como oculto debaixo do recorte, com uma célula de folga para as duas malhas se
   encontrarem sem fresta. Devolve as marcas (0/1 por ponto do terreno) ou null se nada cai embaixo. */
P.ocultaSob=function(terreno,recorte){
  const nc=terreno.nc, nr=terreno.nr, rc=recorte.nc, rr=recorte.nr;
  /* tabela de soma dos pontos SEM dado do recorte: responde "há algum furo neste retângulo?" na hora */
  const W=rc+1, soma=new Int32Array(W*(rr+1));
  for(let l=0;l<rr;l++){ let linha=0; for(let k=0;k<rc;k++){ const v=recorte.z[l*rc+k]; if(v!==v) linha++; soma[(l+1)*W+k+1]=soma[l*W+k+1]+linha; } }
  const furos=(k0,l0,k1,l1)=>soma[(l1+1)*W+k1+1]-soma[l0*W+k1+1]-soma[(l1+1)*W+k0]+soma[l0*W+k0];
  /* Uma célula do terreno só sai da tela se o recorte a cobre INTEIRA, sem furo nenhum. Coberta
     só em parte, fica: as duas malhas se sobrepõem ali (o terreno vai um fio para trás), mas não
     abre buraco — o recorte de uma pilha tem furos e reentrâncias menores que a célula do terreno. */
  const coberta=new Uint8Array((nc-1)*(nr-1)); let alguma=false;
  for(let r=0;r<nr-1;r++) for(let c=0;c<nc-1;c++){
    const xa=terreno.x0+c*terreno.dx, xb=xa+terreno.dx, yb=terreno.y0-r*terreno.dy, ya=yb-terreno.dy;
    const k0=Math.floor((xa-recorte.x0)/recorte.dx), k1=Math.ceil((xb-recorte.x0)/recorte.dx), l0=Math.floor((recorte.y0-yb)/recorte.dy), l1=Math.ceil((recorte.y0-ya)/recorte.dy);
    if(k0<0||l0<0||k1>rc-1||l1>rr-1) continue;                 // sai do recorte: não está coberta por inteiro
    if(furos(k0,l0,k1,l1)===0){ coberta[r*(nc-1)+c]=1; alguma=true; }
  }
  if(!alguma) return null;
  /* por ponto: escondido quando as quatro células em volta estão cobertas (na borda da malha, nunca) */
  const oculta=new Uint8Array(nc*nr); let n=0;
  for(let r=1;r<nr-1;r++) for(let c=1;c<nc-1;c++){
    const q=(r-1)*(nc-1)+c-1;
    if(coberta[q]&&coberta[q+1]&&coberta[q+nc-1]&&coberta[q+nc]){ oculta[r*nc+c]=1; n++; }
  }
  return n?oculta:null;
};
/* Num MDT recortado, os pontos que o projeto mudou em relação ao terreno de origem (cotaDoTerreno
   dá a cota original em x,y reais). É com isto que o visualizador pinta a obra de cor sólida e
   deixa a ortofoto só onde o chão é o mesmo da foto. */
P.marcaObra=function(recorte,cotaDoTerreno,tolerancia){
  const nc=recorte.nc, nr=recorte.nr, obra=new Uint8Array(nc*nr), tol=tolerancia>0?tolerancia:0.05; let n=0;
  for(let r=0;r<nr;r++) for(let c=0;c<nc;c++){
    const i=r*nc+c, z=recorte.z[i]; if(z!==z) continue;
    const zt=cotaDoTerreno(recorte.x0+c*recorte.dx,recorte.y0-r*recorte.dy);
    if(zt!==zt||Math.abs(z-zt)>tol){ obra[i]=1; n++; }
  }
  return {obra, pontos:n};
};

/* Ajuste afim u = a·x + b·y + c, v = d·x + e·y + f a partir de amostras {x,y,u,v}.
   Serve para dizer ao visualizador onde cada ponto do terreno cai na imagem da ortofoto,
   inclusive quando a imagem está noutro sistema de coordenadas. erro = pior resíduo (em fração
   da imagem). */
P.afim=function(amostras){
  const n=amostras.length; if(n<3) return null;
  let sx=0,sy=0,sxx=0,sxy=0,syy=0,su=0,sv=0,sxu=0,syu=0,sxv=0,syv=0;
  /* centraliza para o sistema não perder precisão com coordenadas grandes */
  let mx=0,my=0; for(const p of amostras){ mx+=p.x; my+=p.y; } mx/=n; my/=n;
  for(const p of amostras){ const x=p.x-mx, y=p.y-my; sx+=x; sy+=y; sxx+=x*x; sxy+=x*y; syy+=y*y; su+=p.u; sv+=p.v; sxu+=x*p.u; syu+=y*p.u; sxv+=x*p.v; syv+=y*p.v; }
  const det=sxx*syy-sxy*sxy; if(!(Math.abs(det)>1e-12)) return null;
  const a=(sxu*syy-syu*sxy)/det, b=(syu*sxx-sxu*sxy)/det, d=(sxv*syy-syv*sxy)/det, e=(syv*sxx-sxv*sxy)/det;
  const c=su/n-a*mx-b*my, f=sv/n-d*mx-e*my;
  let erro=0; for(const p of amostras) erro=Math.max(erro,Math.abs(a*p.x+b*p.y+c-p.u),Math.abs(d*p.x+e*p.y+f-p.v));
  return {uv:[a,b,c,d,e,f], erro};
};

/* Camada vetorial: todas as linhas num só vetor de coordenadas (x,y,z; z ausente = NaN, o
   visualizador pousa no terreno). Cada parte aponta para um estilo. */
P.vetor=function(camada,origem){
  const estilos=[], chave=new Map(), tam=[], est=[];
  let total=0; for(const p of camada.partes||[]) if(p.pts&&p.pts.length>=(camada.tipo==='point'?1:2)) total+=p.pts.length;
  if(!total) return null;
  const xyz=new Float32Array(total*3); let k=0;
  for(const p of camada.partes){
    if(!p.pts||p.pts.length<(camada.tipo==='point'?1:2)) continue;
    const id=[p.cor,p.peso,p.tracejado?1:0,p.rotulo||''].join('|');
    if(!chave.has(id)){ chave.set(id,estilos.length); estilos.push({cor:p.cor||'#222222', peso:+p.peso||1.5, tracejado:!!p.tracejado, rotulo:p.rotulo||''}); }
    tam.push(p.pts.length); est.push(chave.get(id));
    for(const q of p.pts){ xyz[k++]=q[0]-origem[0]; xyz[k++]=q[1]-origem[1]; xyz[k++]=(q[2]==null||q[2]!==q[2])?NaN:q[2]; }
  }
  return {nome:String(camada.nome||'Camada'), tipo:camada.tipo==='point'?'point':'line', visivel:camada.visivel!==false,
    estilos, tam, est, vertices:total, xyz:P.b64(new Uint8Array(xyz.buffer))};
};

/* Peso estimado do arquivo, em bytes: cotas (2 bytes por célula em base64), ortofoto (JPEG),
   vetores (12 bytes por vértice em base64) e o programa do visualizador. */
P.estimativa=function(o){
  return Math.round((o.celulas||0)*2*4/3+(o.ortoPixels||0)*0.30*4/3+(o.vertices||0)*12*4/3+(o.programa||700000));
};
P.tamanho=function(bytes){
  const mb=bytes/1048576;
  return (mb>=10?mb.toFixed(0):mb.toFixed(1)).replace('.',',')+' MB';
};

const escHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* JSON dentro de um bloco de programa da página: o sinal de menor não pode aparecer cru, senão
   um fechamento de bloco dentro de um texto encerraria o bloco antes da hora. (Este arquivo também
   vive dentro de um bloco assim: por isso nem os comentários escrevem a marca de fechamento.) */
/* U+2028 e U+2029 (separadores de linha) também saem escapados: crus, alguns leitores os tratam como fim de linha */
const SEP1=String.fromCharCode(8232), SEP2=String.fromCharCode(8233);
P.jsonSeguro=dados=>JSON.stringify(dados).replace(/</g,'\\u003c').split(SEP1).join('\\u2028').split(SEP2).join('\\u2029');
P.scriptSeguro=codigo=>String(codigo).replace(/<\/script/gi,'<\\/script');

/* Monta a página única: esqueleto + programas embutidos + dados. Nada vem de fora. */
P.html=function(o){
  let h=String(o.esqueleto);
  const troca=(marca,valor)=>{
    if(h.split(marca).length!==2) throw new Error('Esqueleto do visualizador sem a marca '+marca);
    h=h.replace(marca,()=>valor);
  };
  troca('<!--GMPUB:TITULO-->',escHTML(o.titulo||'Publicação GeoMine'));
  troca('<!--GMPUB:SCRIPTS-->',(o.scripts||[]).map(s=>'<script>/* '+String(s.nome).replace(/\*\//g,'')+' */\n'+P.scriptSeguro(s.codigo)+'\n</'+'script>').join('\n'));
  troca('<!--GMPUB:DADOS-->','<script type="application/json" id="gmpubDados">'+P.jsonSeguro(o.dados)+'</'+'script>');
  return h;
};

root.GeoMinePublisherPack=P;
})(typeof window!=='undefined'?window:globalThis);
