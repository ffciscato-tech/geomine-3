/* GeoMine — GEOMEC: seções geomecânicas (estado, montagem do modelo e cálculo).
   Pedido de 22/11/2026: aba GEOTECNIA funcional para estabilidade de taludes, no estilo do
   SLOPE/W, com uma aba de vista própria para ver os resultados das seções.

   Uma SEÇÃO guarda só o que a pessoa definiu: o terreno e os topos das camadas (distância ×
   cota), os materiais, a água, as cargas, o sismo e a busca. Os resultados pesados (fatias,
   superfícies tentadas) são recalculados ao abrir; o projeto salva o resumo.
   Este arquivo não toca no DOM: é usado pela tela e pelos testes. */
(function(root){
  /* Tudo dentro de uma função com nome: o mesmo código segue como texto para a thread de
     cálculo (Web Worker), junto com o motor. */
  function fabrica(root){
  'use strict';
  const GM=root.GeoMineGeomecInterno={};
  const SL=()=>root.GeoMineSlope;
  let estado={versao:1, secoes:[], ativa:''};
  const resultados=new Map();                    /* id da seção → resultado em memória */

  GM.CORES=['#c9a26b','#8fb3d9','#a6c48a','#d98f8f','#b7a1d6','#e0c36a','#7fc4c0','#c4a484','#9aa7b8','#d6a7c2'];
  GM.MODELOS={mc:'Mohr–Coulomb (c′, φ′)', su:'Não drenado (Su)', hb:'Hoek–Brown generalizado', leps:'Enrocamento (atrito × tensão)', tab:'Envoltória por pontos (τ × σ)', rocha:'Rocha sã (impenetrável)'};
  GM.METODOS={mp:'Morgenstern–Price', spencer:'Spencer', bishop:'Bishop simplificado', janbuC:'Janbu corrigido', janbu:'Janbu simplificado', ordinario:'Ordinário (Fellenius)'};
  const novoId=p=>p+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);
  const num=(v,pad)=>{ const x=typeof v==='string'?parseFloat(v.replace(',','.')):+v; return Number.isFinite(x)?x:pad; };
  GM.num=num;

  GM.estado=()=>estado;
  GM.secoes=()=>estado.secoes;
  GM.ativa=()=>estado.secoes.find(s=>s.id===estado.ativa)||estado.secoes[0]||null;
  GM.ativar=id=>{ if(estado.secoes.some(s=>s.id===id)) estado.ativa=id; return GM.ativa(); };
  GM.resultado=sec=>sec?resultados.get(sec.id)||null:null;
  GM.esquece=sec=>{ if(sec){ resultados.delete(sec.id); sec.resumo=null; } };

  GM.materialPadrao=(i,nome)=>({nome:nome||'Material '+(i+1), cor:GM.CORES[i%GM.CORES.length], modelo:'mc', gama:19, gamaSat:'', c:10, phi:30, ru:0,
    su:50, suK:0, zRef:0, sci:50, GSI:50, mi:10, D:0.7, phi0:45, dphi:7, tab:'0 0\n100 70\n400 240'});
  /* Biblioteca de valores típicos que o Bishop do Perfil já usava (GEO_MAT). */
  GM.biblioteca=()=>{ try{ return typeof GEO_MAT==='object'&&GEO_MAT?Object.entries(GEO_MAT).map(([id,m])=>({id, nome:m.nome, gama:m.g, c:m.c, phi:m.phi, ru:m.ru})):[]; }catch(e){ return []; } };

  /* --------------------------- geometria de apoio --------------------------- */
  const lerp=(P,x)=>{ const n=P.length; if(x<=P[0][0]) return P[0][1]; if(x>=P[n-1][0]) return P[n-1][1];
    let lo=0, hi=n-1; while(hi-lo>1){ const m=(lo+hi)>>1; if(P[m][0]<=x) lo=m; else hi=m; }
    return P[lo][1]+(P[hi][1]-P[lo][1])*(x-P[lo][0])/(P[hi][0]-P[lo][0]); };
  GM.lerp=lerp;
  /* Douglas–Peucker: tira os pontos que não mudam a linha além da tolerância (m). */
  GM.simplifica=(P,tol)=>{
    if(P.length<3) return P.slice();
    const fica=new Uint8Array(P.length); fica[0]=fica[P.length-1]=1;
    const pilha=[[0,P.length-1]];
    while(pilha.length){
      const [a,b]=pilha.pop(), ax=P[a][0], az=P[a][1], dx=P[b][0]-ax, dz=P[b][1]-az, L=Math.hypot(dx,dz)||1;
      let dm=0, im=-1;
      for(let i=a+1;i<b;i++){ const d=Math.abs(dx*(P[i][1]-az)-dz*(P[i][0]-ax))/L; if(d>dm){ dm=d; im=i; } }
      if(dm>tol){ fica[im]=1; pilha.push([a,im],[im,b]); }
    }
    return P.filter((p,i)=>fica[i]);
  };
  GM.limites=sec=>{
    let x0=Infinity, x1=-Infinity, z0=Infinity, z1=-Infinity;
    const vê=P=>{ for(const p of P||[]){ if(p[0]<x0)x0=p[0]; if(p[0]>x1)x1=p[0]; if(p[1]<z0)z0=p[1]; if(p[1]>z1)z1=p[1]; } };
    vê(sec.terreno); sec.camadas.forEach(c=>vê(c.topo)); if(sec.agua&&sec.agua.modo==='linha') vê(sec.agua.linha);
    const base=GM.base(sec);
    return {x0, x1, z0:Math.min(z0,base), z1, zTerrenoMin:Math.min(...sec.terreno.map(p=>p[1])), zTerrenoMax:Math.max(...sec.terreno.map(p=>p[1])), base};
  };
  /* Base do modelo: a informada ou, por padrão, o pé do talude menos 60% do desnível. */
  GM.base=sec=>{
    const b=num(sec.base,NaN);
    if(Number.isFinite(b)) return b;
    let lo=Infinity, hi=-Infinity;
    for(const p of sec.terreno){ if(p[1]<lo)lo=p[1]; if(p[1]>hi)hi=p[1]; }
    for(const c of sec.camadas) for(const p of c.topo||[]) if(p[1]<lo) lo=p[1];
    return lo-Math.max(3,0.6*(hi-Math.min(...sec.terreno.map(p=>p[1]))));
  };
  /* Topos efetivos (cada camada limitada pelas de cima), amostrados para o desenho. */
  GM.faixas=sec=>{
    const L=GM.limites(sec), xs=new Set();
    sec.terreno.forEach(p=>xs.add(p[0])); sec.camadas.forEach(c=>(c.topo||[]).forEach(p=>xs.add(p[0])));
    const n=160; for(let i=0;i<=n;i++) xs.add(L.x0+(L.x1-L.x0)*i/n);
    const X=[...xs].filter(x=>x>=L.x0&&x<=L.x1).sort((a,b)=>a-b), tops=[];
    let ant=X.map(x=>lerp(sec.terreno,x));
    tops.push(ant);
    for(let k=1;k<sec.camadas.length;k++){
      const T=sec.camadas[k].topo, cur=X.map((x,i)=>T&&T.length>1?Math.min(ant[i],lerp(T,x)):ant[i]);
      tops.push(cur); ant=cur;
    }
    return {X, tops, base:L.base};
  };

  /* --------------------------- criação de seções --------------------------- */
  function nomeNovo(prefixo){
    let k=estado.secoes.length+1, nome;
    do{ nome=prefixo+'-'+String(k++).padStart(2,'0'); }while(estado.secoes.some(s=>s.nome===nome));
    return nome;
  }
  /* Água: a linha desenhada (modo/linha) e a condição usada no cálculo (ver GM.CONDICOES). */
  const aguaVazia=()=>({modo:'nenhuma', linha:[], condicao:'desenhado', delta:'', incluir:{seco:true, desenhado:true, critico:true, saturado:false}, adm:{critico:1.3, saturado:1.3}});
  function secaoVazia(nome,origem){
    return {id:novoId('sec'), nome, origem, linha:null, crs:null, terreno:[], camadas:[], materiais:{}, sentido:'auto', base:'',
      agua:aguaVazia(), cargas:[], sismo:{kh:0, kv:0}, trinca:{prof:0, agua:0},
      busca:{metodo:'mp', faixas:'auto', entrada:null, saida:null, precisao:'normal', naoCircular:false, profMin:''},
      manual:null, fsAdm:1.5, auto:true, resumo:null, criada:new Date().toISOString()};
  }
  /* Talude paramétrico: bancadas iguais, do pé (à direita) à crista (à esquerda). */
  GM.terrenoTalude=par=>{
    const p=par||{};
    const n=Math.min(40,Math.max(1,Math.round(num(p.bancadas,1)))), h=Math.max(0.5,num(p.altura,20)), ang=Math.min(89.5,Math.max(5,num(p.angulo,35))),
      berma=Math.max(0,num(p.berma,0)), pe=Math.max(2,num(p.pe,25)), crista=Math.max(2,num(p.crista,30)), z0=num(p.cota,0), dx=h/Math.tan(ang*Math.PI/180);
    const T=[];
    let x=0, z=z0+n*h;
    T.push([x,z]); x+=crista; T.push([x,z]);
    for(let i=0;i<n;i++){ x+=dx; z-=h; T.push([x,z]); if(i<n-1&&berma>0){ x+=berma; T.push([x,z]); } }
    x+=pe; T.push([x,z]);
    return {terreno:T.map(q=>[+q[0].toFixed(3),+q[1].toFixed(3)]), comprimento:x,
      geral:Math.atan2(n*h,n*dx+(n-1)*berma)*180/Math.PI, altura:n*h};
  };
  GM.novaSecaoTalude=par=>{
    const p=Object.assign({bancadas:1, altura:20, angulo:35, berma:6, pe:25, crista:30, cota:0, material:''},par||{});
    const s=secaoVazia(nomeNovo('T'),'talude');
    s.parametros={bancadas:p.bancadas, altura:p.altura, angulo:p.angulo, berma:p.berma, pe:p.pe, crista:p.crista, cota:p.cota};
    s.terreno=GM.terrenoTalude(s.parametros).terreno;
    s.materiais={m1:GM.materialPadrao(0,p.material||'Maciço')};
    s.camadas=[{mat:'m1'}];
    estado.secoes.push(s); estado.ativa=s.id;
    return s;
  };
  /* --------------------------- perfis por linhas com cota --------------------------- */
  /* Curvas de nível ou linhas de projeto (crista, pé, rampa, limite) cortadas pela linha da
     seção. partes = [{pts:[[x,y,z],…], fechada}] no sistema da seção. Cada cruzamento dá
     (distância desde o primeiro ponto da linha, cota), ordenados pela distância. */
  GM.perfilVetorial=(linha,partes)=>{
    const a=linha[0], b=linha[linha.length-1], dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy), out=[];
    if(!(L>0)) return out;
    const X0=Math.min(a[0],b[0]), X1=Math.max(a[0],b[0]), Y0=Math.min(a[1],b[1]), Y1=Math.max(a[1],b[1]);
    for(const parte of partes||[]){
      const P=parte.pts||parte, n=P.length; if(n<2) continue;
      let bx0=Infinity, bx1=-Infinity, by0=Infinity, by1=-Infinity;
      for(const q of P){ if(q[0]<bx0)bx0=q[0]; if(q[0]>bx1)bx1=q[0]; if(q[1]<by0)by0=q[1]; if(q[1]>by1)by1=q[1]; }
      if(bx1<X0||bx0>X1||by1<Y0||by0>Y1) continue;
      const m=parte.fechada?n:n-1;
      for(let i=0;i<m;i++){
        const p=P[i], q=P[(i+1)%n];
        if(!Number.isFinite(p[2])||!Number.isFinite(q[2])) continue;
        const ex=q[0]-p[0], ey=q[1]-p[1], den=dx*ey-dy*ex, le=Math.hypot(ex,ey);
        if(!(le>0)||Math.abs(den)<=1e-12*L*le) continue;            /* paralela à seção */
        const qx=p[0]-a[0], qy=p[1]-a[1], t=(qx*ey-qy*ex)/den, u=(qx*dy-qy*dx)/den;
        if(t<-1e-9||t>1+1e-9||u<-1e-9||u>1+1e-9) continue;
        const uu=Math.min(1,Math.max(0,u));
        out.push([Math.min(1,Math.max(0,t))*L, p[2]+(q[2]-p[2])*uu]);
      }
    }
    out.sort((p,q)=>p[0]-q[0]||p[1]-q[1]);
    const fim=[];
    for(const p of out){ const u=fim[fim.length-1]; if(u&&Math.abs(u[0]-p[0])<1e-6&&Math.abs(u[1]-p[1])<1e-6) continue; fim.push(p); }
    return fim;
  };
  /* Cota do perfil vetorial numa distância: linear entre os cruzamentos; fora deles, NaN. */
  GM.cotaPerfil=(P,d)=>{
    const n=P.length; if(!n||d<P[0][0]-1e-9||d>P[n-1][0]+1e-9) return NaN;
    if(n===1) return P[0][1];
    let lo=0, hi=n-1; while(hi-lo>1){ const m=(lo+hi)>>1; if(P[m][0]<=d) lo=m; else hi=m; }
    const a=P[lo], b=P[hi]; return b[0]>a[0]?a[1]+(b[1]-a[1])*(Math.min(b[0],Math.max(a[0],d))-a[0])/(b[0]-a[0]):Math.max(a[1],b[1]);
  };

  /* Seção cortada no mapa. perfis = [{id, nome, papel:'terreno'|'projeto'|'contato', z:[…]}]
     nas mesmas estações dist[]. O terreno (a topografia) vale onde tem cota; onde não tem,
     vale o contato mais alto. Com um PROJETO (pedido de 22/11/2026: a seção leva em conta a
     topografia e os perfis do PDE): pilha — a superfície é o maior entre o projeto e a
     topografia, e a topografia vira o contato pilha/fundação; cava — o menor dos dois. Sem
     projeto a seção é só a topografia (talude natural). Contatos viram topos de camada, de
     cima para baixo pela cota média. */
  GM.novaSecaoMapa=(linha,crs,dist,perfis,op)=>{
    op=op||{};
    const ter=perfis.find(p=>p.papel==='terreno'), proj=perfis.find(p=>p.papel==='projeto'), cont=perfis.filter(p=>p.papel==='contato');
    if(!ter) throw new Error('Escolha a topografia (a superfície do terreno).');
    const n=dist.length, zt=new Array(n).fill(NaN), zn=new Array(n).fill(NaN), pilha=!!proj&&(op.tipoProjeto||proj.tipo)!=='cava';
    for(let i=0;i<n;i++){
      let z=ter.z[i];
      if(!Number.isFinite(z)){ z=-Infinity; for(const c of cont) if(Number.isFinite(c.z[i])&&c.z[i]>z) z=c.z[i]; if(z===-Infinity) z=NaN; }
      zn[i]=z;
      const zp=proj?proj.z[i]:NaN;
      zt[i]=Number.isFinite(zp)?(Number.isFinite(z)?(pilha?Math.max(zp,z):Math.min(zp,z)):zp):z;
    }
    /* na pilha, a topografia sob o projeto é o primeiro contato (pilha sobre a fundação) */
    if(pilha) cont.unshift({id:ter.id, nome:ter.nome, z:zn, natural:true});
    let a=0, b=n-1;
    while(a<n&&!Number.isFinite(zt[a])) a++;
    while(b>a&&!Number.isFinite(zt[b])) b--;
    if(b-a<2) throw new Error('A linha não encontra cotas válidas na superfície do terreno.');
    for(let i=a;i<=b;i++) if(!Number.isFinite(zt[i])) throw new Error('A superfície do terreno tem um vazio no meio da linha (perto de '+dist[i].toFixed(1)+' m).');
    let lo=Infinity, hi=-Infinity;
    for(let i=a;i<=b;i++){ if(zt[i]<lo)lo=zt[i]; if(zt[i]>hi)hi=zt[i]; }
    const tol=op.tolerancia!=null?op.tolerancia:Math.max(0.02,(hi-lo)/2500), d0=dist[a];
    const linhaDe=z=>{ const P=[]; for(let i=a;i<=b;i++) P.push([dist[i]-d0,z[i]]); return GM.simplifica(P,tol).map(q=>[+q[0].toFixed(3),+q[1].toFixed(3)]); };
    const s=secaoVazia(op.nome||nomeNovo('S'),'mapa');
    s.linha=linha.map(q=>[q[0],q[1]]); s.crs=crs||null; s.recuo=d0; s.comprimento=dist[b]-d0;
    s.terreno=linhaDe(zt);
    /* contatos: abaixo do terreno (o que passar acima é cortado pelo terreno), do mais alto ao mais baixo */
    const media=c=>{ let s2=0, k=0; for(let i=a;i<=b;i++) if(Number.isFinite(c.z[i])){ s2+=Math.min(c.z[i],zt[i]); k++; } return k?s2/k:-Infinity; };
    const usados=cont.filter(c=>{ for(let i=a;i<=b;i++) if(Number.isFinite(c.z[i])&&c.z[i]<zt[i]-tol) return true; return false; }).sort((p,q)=>media(q)-media(p));
    const tipoFonte=p=>p.fonte||'raster';
    s.materiais={m1:GM.materialPadrao(0,op.material0||(pilha?'Pilha (PDE)':'Material 1'))};
    s.camadas=[{mat:'m1', fonte:{tipo:tipoFonte(proj&&pilha?proj:ter), id:(proj&&pilha?proj:ter).id, nome:(proj&&pilha?proj:ter).nome}}];
    usados.forEach((c,k)=>{
      const z=new Array(n);
      for(let i=a;i<=b;i++){ const v=Number.isFinite(c.z[i])?Math.min(c.z[i],zt[i]):zt[i]; z[i]=v; }
      const id='m'+(k+2);
      s.materiais[id]=GM.materialPadrao(k+1,c.natural?'Fundação (terreno natural)':'Material '+(k+2));
      s.camadas.push({mat:id, topo:linhaDe(z), fonte:{tipo:c.natural?tipoFonte(ter):tipoFonte(c), id:c.id, nome:c.nome, natural:!!c.natural}});
    });
    /* materiais de partida do banco de litologias (a pessoa ajusta) */
    if(pilha){
      s.materiais.m1.papel='Pilha (PDE)';
      const f=s.camadas.find(c=>c.fonte&&c.fonte.natural); if(f) s.materiais[f.mat].papel='Fundação';
      if(typeof GM.aplicaLitologia==='function'){ GM.aplicaLitologia(s.materiais.m1,'esteril-lancado'); if(f) GM.aplicaLitologia(s.materiais[f.mat],'residual-maduro'); }
    }
    s.fontes={topografia:{id:ter.id, nome:ter.nome, tipo:tipoFonte(ter)}, projeto:proj?{id:proj.id, nome:proj.nome, tipo:tipoFonte(proj), papel:pilha?'pilha':'cava'}:null};
    /* na cava a superfície é a escavação: a topografia original fica guardada, para um contato
       por distância poder acompanhá-la (na pilha ela já é o contato com a fundação) */
    if(proj&&!pilha){ let ok=true; for(let i=a;i<=b;i++) if(!Number.isFinite(zn[i])){ ok=false; break; } if(ok) s.natural=linhaDe(zn); }
    s.ignorados=cont.filter(c=>!usados.includes(c)&&!c.natural).map(c=>c.nome);
    if(proj&&!usados.some(c=>c.natural)&&pilha) s.avisoProjeto='O projeto não passa acima da topografia nesta linha: a seção ficou só com o terreno natural.';
    estado.secoes.push(s); estado.ativa=s.id;
    return s;
  };
  /* Refaz o terreno de um talude paramétrico; os contatos acompanham o novo comprimento. */
  GM.regeraTalude=sec=>{
    if(!sec.parametros) return;
    const antes=sec.terreno[sec.terreno.length-1][0], t=GM.terrenoTalude(sec.parametros);
    sec.terreno=t.terreno;
    sec.camadas.forEach(c=>{
      if(!c.topo) return;
      if(c.fonte&&c.fonte.tipo==='cota') c.topo=[[0,c.fonte.z],[t.comprimento,c.fonte.z]];
      else if(c.fonte&&c.fonte.tipo==='profundidade'&&(c.fonte.ref==='terreno'||c.fonte.ref==='natural')) c.topo=t.terreno.map(q=>[q[0],+(q[1]-c.fonte.h).toFixed(3)]);
      else c.topo=c.topo.map(q=>[+(q[0]*t.comprimento/antes).toFixed(3),q[1]]);
    });
    if(sec.agua&&sec.agua.linha) sec.agua.linha=sec.agua.linha.map(q=>[+(q[0]*t.comprimento/antes).toFixed(3),q[1]]);
    sec.manual=null; sec.busca.entrada=null; sec.busca.saida=null; if(sec.busca.faixas==='manual') sec.busca.faixas='auto';
  };
  GM.duplica=sec=>{
    const c=JSON.parse(JSON.stringify(sec));
    c.id=novoId('sec'); c.nome=sec.nome+' (cópia)'; c.resumo=null; c.criada=new Date().toISOString();
    estado.secoes.push(c); estado.ativa=c.id;
    return c;
  };
  GM.exclui=sec=>{
    const i=estado.secoes.indexOf(sec);
    if(i<0) return;
    estado.secoes.splice(i,1); resultados.delete(sec.id);
    estado.ativa=(estado.secoes[Math.min(i,estado.secoes.length-1)]||{}).id||'';
  };
  /* Camada nova por cota: um contato horizontal abaixo do terreno. */
  GM.novaCamadaCota=(sec,cota)=>{
    const L=GM.limites(sec), z=num(cota,NaN);
    if(!Number.isFinite(z)) throw new Error('Informe a cota do contato.');
    if(!(z<L.zTerrenoMax)) throw new Error('O contato precisa ficar abaixo do ponto mais alto do terreno.');
    let k=1; while(sec.materiais['m'+k]) k++;
    const id='m'+k;
    sec.materiais[id]=GM.materialPadrao(sec.camadas.length,'Material '+(sec.camadas.length+1));
    const nova={mat:id, topo:[[L.x0,z],[L.x1,z]], fonte:{tipo:'cota', z}};
    /* entra na ordem das cotas médias */
    const media=c=>c.topo?c.topo.reduce((s,p)=>s+p[1],0)/c.topo.length:Infinity;
    let pos=sec.camadas.length;
    for(let i=1;i<sec.camadas.length;i++) if(media(sec.camadas[i])<z){ pos=i; break; }
    sec.camadas.splice(pos,0,nova);
    return nova;
  };
  /* CONTATO POR DISTÂNCIA (pedido de 22/11/2026: "no caso de não haver uma superfície de contato
     embaixo da topografia, eu devo poder dizer que distância considerar, tipo 5 metros, e fazer
     uma linha"). O contato é uma linha paralela a uma referência, h metros abaixo dela, medidos
     na vertical (como a profundidade de um furo). Referências, a primeira é a de partida:
     a topografia natural — o contato pilha/fundação na pilha, a topografia original na cava, o
     próprio terreno no talude natural —, a superfície do talude quando há projeto, e o topo de
     cada contato que a seção já tem. */
  GM.referenciasContato=sec=>{
    const out=[], nat=sec.camadas.find(c=>c.topo&&c.fonte&&c.fonte.natural);
    if(nat) out.push({id:'natural', nome:'da topografia', linha:nat.topo});
    else if(sec.natural&&sec.natural.length>1) out.push({id:'natural', nome:'da topografia', linha:sec.natural, ar:true});
    out.push({id:'terreno', nome:out.length?'da superfície do talude':'da topografia', linha:sec.terreno});
    sec.camadas.forEach((c,k)=>{ if(k>0&&c.topo&&c!==nat) out.push({id:c.mat, nome:'do topo de “'+((sec.materiais[c.mat]||{}).nome||c.mat)+'”', linha:c.topo}); });
    return out;
  };
  /* cota de uma polilinha [x,z] num x (fora dela vale a ponta) e média ao longo do comprimento */
  const cotaEm=(P,x)=>{ if(x<=P[0][0]) return P[0][1]; const n=P.length; if(x>=P[n-1][0]) return P[n-1][1];
    let lo=0, hi=n-1; while(hi-lo>1){ const m=(lo+hi)>>1; if(P[m][0]<=x) lo=m; else hi=m; }
    const a=P[lo], b=P[hi]; return b[0]>a[0]?a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]):Math.min(a[1],b[1]); };
  const mediaLinha=P=>{ let A=0, L=0; for(let i=1;i<P.length;i++){ const dx=P[i][0]-P[i-1][0]; A+=dx*(P[i][1]+P[i-1][1])/2; L+=dx; } return L>0?A/L:P[0][1]; };
  /* a linha deslocada, sem passar acima do terreno (na cava a topografia original fica no ar) */
  function linhaAbaixo(sec,ref,h){
    const P=ref.linha, T=sec.terreno, xs=[...new Set(P.map(q=>q[0]).concat(ref.ar?T.map(q=>q[0]):[]))].sort((a,b)=>a-b), out=[];
    const f=x=>ref.ar?Math.min(cotaEm(P,x)-h,cotaEm(T,x)):cotaEm(P,x)-h;
    for(let i=0;i<xs.length;i++){
      if(i&&ref.ar){                        /* cruzamento com o terreno entre duas estações */
        const x0=xs[i-1], x1=xs[i], d0=cotaEm(P,x0)-h-cotaEm(T,x0), d1=cotaEm(P,x1)-h-cotaEm(T,x1);
        if(d0*d1<0){ const x=x0+(x1-x0)*d0/(d0-d1); out.push([+x.toFixed(3),+f(x).toFixed(3)]); }
      }
      out.push([+xs[i].toFixed(3),+f(xs[i]).toFixed(3)]);
    }
    return out;
  }
  const rotuloDist=(h,ref)=>String(+h.toFixed(2)).replace('.',',')+' m abaixo '+ref.nome;
  GM.novaCamadaProfundidade=(sec,dist,refId)=>{
    const h=num(dist,NaN);
    if(!(h>0)) throw new Error('Informe a distância abaixo da topografia, em metros (por exemplo, 5).');
    const refs=GM.referenciasContato(sec), ref=refs.find(r=>r.id===refId)||refs[0];
    let k=1; while(sec.materiais['m'+k]) k++;
    const id='m'+k;
    sec.materiais[id]=GM.materialPadrao(sec.camadas.length,'Material '+(sec.camadas.length+1));
    const nova={mat:id, topo:linhaAbaixo(sec,ref,h), fonte:{tipo:'profundidade', h, ref:ref.id, nome:rotuloDist(h,ref)}};
    /* entra na ordem das cotas médias, logo abaixo da referência */
    const z=mediaLinha(nova.topo), iRef=ref.id==='natural'?sec.camadas.findIndex(c=>c.fonte&&c.fonte.natural):sec.camadas.findIndex(c=>c.mat===ref.id);
    let pos=sec.camadas.length;
    for(let i=Math.max(1,iRef+1);i<sec.camadas.length;i++) if(mediaLinha(sec.camadas[i].topo)<z){ pos=i; break; }
    sec.camadas.splice(pos,0,nova);
    return nova;
  };
  /* Outra distância para um contato já criado: a linha sobe ou desce pela diferença. */
  GM.mudaProfundidade=(sec,k,dist)=>{
    const c=sec.camadas[k], h=num(dist,NaN);
    if(!c||!c.topo||!c.fonte||c.fonte.tipo!=='profundidade') return false;
    if(!(h>0)) throw new Error('A distância precisa ser maior que zero.');
    const ref=GM.referenciasContato(sec).find(r=>r.id===c.fonte.ref&&r.linha!==c.topo);
    if(ref){ c.topo=linhaAbaixo(sec,ref,h); c.fonte.nome=rotuloDist(h,ref); }
    else { const d=c.fonte.h-h; c.topo=c.topo.map(q=>[q[0],+(q[1]+d).toFixed(3)]); c.fonte.nome=String(+h.toFixed(2)).replace('.',',')+' m abaixo da referência'; }
    c.fonte.h=h;
    return true;
  };
  GM.removeCamada=(sec,k)=>{
    if(k<=0||k>=sec.camadas.length) return;
    const [c]=sec.camadas.splice(k,1);
    if(!sec.camadas.some(x=>x.mat===c.mat)) delete sec.materiais[c.mat];
  };

  /* --------------------------- condições de água --------------------------- */
  /* Pedido de 22/11/2026: escolher o pior caso do nível d’água para o FS. Condições:
     desenhado — a linha freática da seção (e o ru dos materiais, que também vale no crítico);
     seco      — sem água;
     critico   — o NA desenhado elevado de Δ sem passar do terreno (NBR 13029: “elevação do
                 nível de água no maciço da pilha”, FS mínimo 1,30; o normal, com o NA no contato
                 pilha/fundação, pede 1,50);
     saturado  — NA na superfície do terreno;
     pior      — calcula as condições marcadas e fica com o menor FS. */
  GM.CONDICOES={seco:'Seco', desenhado:'NA desenhado', critico:'NA crítico', saturado:'Saturado'};
  GM.ORDEM_COND=['seco','desenhado','critico','saturado'];
  GM.agua=sec=>{
    const p=aguaVazia(), a=sec.agua||(sec.agua=p);
    for(const k of ['modo','condicao','delta']) if(a[k]==null) a[k]=p[k];
    if(!Array.isArray(a.linha)) a.linha=[];
    a.incluir=Object.assign(p.incluir,a.incluir||{}); a.adm=Object.assign(p.adm,a.adm||{});
    return a;
  };
  GM.temLinhaAgua=sec=>!!(sec.agua&&sec.agua.modo==='linha'&&Array.isArray(sec.agua.linha)&&sec.agua.linha.length>1);
  GM.temRu=sec=>Object.values(sec.materiais||{}).some(m=>num(m.ru,0)>0);
  /* Δ do NA crítico: o informado ou 20% do desnível do terreno (meio metro de precisão). */
  GM.deltaCritico=sec=>{
    const d=num(GM.agua(sec).delta,NaN); if(Number.isFinite(d)&&d>=0) return d;
    let lo=Infinity, hi=-Infinity; for(const p of sec.terreno){ if(p[1]<lo)lo=p[1]; if(p[1]>hi)hi=p[1]; }
    return Math.max(.5,Math.round(.4*(hi-lo))/2);
  };
  GM.condicaoDisponivel=(sec,c)=>c==='seco'||c==='saturado'||(c==='critico'&&GM.temLinhaAgua(sec))||(c==='desenhado'&&(GM.temLinhaAgua(sec)||GM.temRu(sec)));
  GM.condicoesPior=sec=>{ const a=GM.agua(sec); return GM.ORDEM_COND.filter(c=>a.incluir[c]&&GM.condicaoDisponivel(sec,c)); };
  /* A condição usada agora: a escolhida ou, no pior caso, a que deu o menor FS no último cálculo. */
  GM.condicaoEfetiva=sec=>{
    const a=GM.agua(sec);
    if(a.condicao!=='pior') return GM.CONDICOES[a.condicao]?a.condicao:'desenhado';
    const r=sec.resumo; if(r&&r.condicao&&GM.condicaoDisponivel(sec,r.condicao)) return r.condicao;
    return GM.condicoesPior(sec)[0]||'desenhado';
  };
  GM.admCondicao=(sec,c)=>{ const v=num((GM.agua(sec).adm||{})[c],NaN); return (c==='critico'||c==='saturado')&&v>0?v:num(sec.fsAdm,1.5)||1.5; };
  GM.admEfetivo=sec=>GM.admCondicao(sec,GM.condicaoEfetiva(sec));
  /* NA elevado de Δ, sem subir acima do terreno onde estava abaixo dele (onde a linha passa
     acima do terreno, a lâmina d’água fica como está). Exato nos vértices das duas linhas e
     nos cruzamentos, que são achados por bisseção. */
  GM.elevaNA=(linha,terreno,delta)=>{
    const W=linha.slice().sort((p,q)=>p[0]-q[0]), T=terreno;
    if(W.length<2||T.length<2) return W;
    const x0=Math.min(W[0][0],T[0][0]), x1=Math.max(W[W.length-1][0],T[T.length-1][0]);
    const f=x=>{ const l=lerp(W,x), t=lerp(T,x); return Math.min(l+delta,Math.max(t,l)); };
    const g1=x=>lerp(W,x)+delta-lerp(T,x), g2=x=>lerp(W,x)-lerp(T,x);
    const xs=new Set([x0,x1]); W.forEach(p=>xs.add(p[0])); T.forEach(p=>xs.add(p[0]));
    const X=[...xs].filter(x=>x>=x0&&x<=x1).sort((a,b)=>a-b), P=[];
    const corta=(g,a,b)=>{ let ga=g(a); for(let k=0;k<50;k++){ const m=(a+b)/2, gm=g(m); if((gm>0)===(ga>0)){ a=m; ga=gm; } else b=m; } return (a+b)/2; };
    for(let i=0;i<X.length;i++){
      if(i){ const a=X[i-1], b=X[i], c=[];
        for(const g of [g1,g2]){ const ga=g(a), gb=g(b); if(ga*gb<0) c.push(corta(g,a,b)); }
        c.sort((p,q)=>p-q).forEach(x=>P.push([x,f(x)])); }
      P.push([X[i],f(X[i])]);
    }
    return GM.simplifica(P,1e-4).map(q=>[+q[0].toFixed(3),+q[1].toFixed(3)]);
  };
  /* Linha freática de cada condição (null = sem água). */
  GM.linhaCondicao=(sec,c)=>{
    const L=GM.temLinhaAgua(sec)?sec.agua.linha.slice().sort((p,q)=>p[0]-q[0]):null;
    if(c==='seco') return null;
    if(c==='saturado') return sec.terreno.map(p=>[p[0],p[1]]);
    if(c==='critico') return L?GM.elevaNA(L,sec.terreno,GM.deltaCritico(sec)):null;
    return L;
  };

  /* --------------------------- definição para o motor --------------------------- */
  GM.definicao=(sec,condicao)=>{
    const mats={}, cond=condicao||GM.condicaoEfetiva(sec), linhaW=GM.linhaCondicao(sec,cond);
    for(const [id,m] of Object.entries(sec.materiais)){
      /* ru acompanha o NA desenhado e o crítico (que parte dele); seco e saturado não o usam */
      const o={nome:m.nome, modelo:m.modelo||'mc', gama:num(m.gama,NaN), gamaSat:num(m.gamaSat,0), ru:cond==='desenhado'||cond==='critico'?num(m.ru,0):0};
      if(o.modelo==='mc'){ o.c=num(m.c,0); o.phi=num(m.phi,0); }
      else if(o.modelo==='su'){ o.su=num(m.su,0); o.suK=num(m.suK,0); o.zRef=num(m.zRef,0); }
      else if(o.modelo==='hb'){ o.sci=num(m.sci,NaN); o.GSI=num(m.GSI,NaN); o.mi=num(m.mi,NaN); o.D=num(m.D,0); }
      else if(o.modelo==='leps'){ o.phi0=num(m.phi0,NaN); o.dphi=num(m.dphi,0); }
      else if(o.modelo==='tab'){ o.tab=String(m.tab||'').split(/\n+/).map(l=>l.trim().split(/[\s;]+/).map(v=>num(v,NaN))).filter(p=>p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])); }
      mats[id]=o;
    }
    const b=sec.busca||{};
    return {terreno:sec.terreno, camadas:sec.camadas.map((c,k)=>k===0?{mat:c.mat}:{mat:c.mat, topo:c.topo}), materiais:mats,
      agua:linhaW&&linhaW.length>1?{linha:linhaW}:null, condicao:cond,
      cargas:(sec.cargas||[]).map(q=>({x1:num(q.x1,NaN), x2:num(q.x2,NaN), q:num(q.q,0)})).filter(q=>Number.isFinite(q.x1)&&Number.isFinite(q.x2)&&q.q),
      sismo:{kh:num(sec.sismo&&sec.sismo.kh,0), kv:num(sec.sismo&&sec.sismo.kv,0)},
      trinca:sec.trinca&&num(sec.trinca.prof,0)>0?{prof:num(sec.trinca.prof,0), agua:num(sec.trinca.agua,0)/100}:null,
      sentido:sec.sentido==='esq'||sec.sentido==='dir'?sec.sentido:'auto', base:GM.base(sec)};
  };
  GM.opcoesBusca=sec=>{
    const b=sec.busca||{}, alta=b.precisao==='alta', manual=b.faixas==='manual';
    const o={metodo:b.metodo||'mp', ne:alta?36:22, nx:alta?36:22, nr:alta?14:10, candidatas:alta?8:6};
    if(manual&&b.entrada&&b.saida){ o.entrada=b.entrada; o.saida=b.saida; }
    const pm=num(b.profMin,NaN); if(Number.isFinite(pm)&&pm>=0) o.profMin=pm;
    return o;
  };

  /* --------------------------- cálculo --------------------------- */
  /* Calcula a seção: busca circular, otimização não circular se pedida. Guarda o resultado
     em memória e o resumo (o que vai para o projeto) na própria seção. */
  GM.calcula=sec=>GM.agua(sec).condicao==='pior'?GM.calculaPior(sec):GM.calculaCond(sec,GM.agua(sec).condicao);
  /* Uma condição de água. No pior caso cada condição passa por aqui (na thread de cálculo,
     uma de cada vez, para a tela mostrar o andamento) e GM.combinaPior escolhe o menor FS. */
  GM.calculaCond=(sec,cond)=>{
    cond=GM.CONDICOES[cond]?cond:'desenhado';
    const t0=Date.now(), def=GM.definicao(sec,cond);
    let M;
    try{ M=SL().modelo(def); }catch(e){ const r={ok:false, motivo:e.message, condicao:cond}; resultados.set(sec.id,r); sec.resumo=null; return r; }
    const op=GM.opcoesBusca(sec), b=SL().busca(M,op);
    const r={ok:b.ok, motivo:b.motivo||(b.critica&&b.critica.motivo), def, sentido:M.sentido, busca:b, critica:b.ok?b.critica:null, circular:b.ok?b.critica:null, naoCircular:null, condicao:cond};
    if(b.ok&&sec.busca.naoCircular&&op.metodo!=='bishop'&&op.metodo!=='ordinario'){
      const o=SL().otimizaVarias(M,[b.critica.sup,...b.porte.map(p=>p.sup)],{metodo:op.metodo});
      if(o.ok){ r.naoCircular=o; if(o.FS<b.critica.FS-1e-4) r.critica=o.critica; }
    }
    r.ms=Date.now()-t0;
    resultados.set(sec.id,r);
    sec.resumo=r.ok?{FS:r.critica.FS, metodo:r.critica.metodo, F:r.critica.F, lam:r.critica.lam, sup:r.critica.sup, tipo:r.critica.sup.tipo,
      FScircular:b.critica.FS, FSnaoCircular:r.naoCircular?r.naoCircular.FS:null, porte:b.porte.map(p=>({classe:p.classe, FS:p.FS, altura:p.altura})),
      avisos:r.critica.avisos, tentativas:b.validas, em:new Date().toISOString(), sentido:M.sentido, condicao:cond}:null;
    return r;
  };
  /* Junta as condições calculadas: fica o resultado de menor FS, com a tabela de todas. */
  GM.combinaPior=(sec,lista)=>{
    const tabela=lista.map(({cond,pacote})=>{ const r=pacote&&pacote.res, ok=!!(r&&r.ok);
      return {cond, nome:GM.CONDICOES[cond], ok, FS:ok?r.critica.FS:null, metodo:ok?r.critica.metodo:null, adm:GM.admCondicao(sec,cond), motivo:ok?'':(r&&r.motivo)||'sem solução'}; });
    let pior=null;
    lista.forEach((x,i)=>{ if(tabela[i].ok&&(!pior||tabela[i].FS<pior.t.FS)) pior={x, t:tabela[i]}; });
    if(!pior){ const res={ok:false, motivo:lista.length?'Nenhuma condição de água teve solução.':'Marque ao menos uma condição de água para o pior caso.', condicoes:tabela, condicao:null};
      resultados.set(sec.id,res); sec.resumo=null; return {res, resumo:null}; }
    const res=Object.assign(pior.x.pacote.res,{condicoes:tabela, condicao:pior.x.cond, pior:true});
    const resumo=Object.assign({},pior.x.pacote.resumo,{condicoes:tabela, condicao:pior.x.cond, pior:true});
    resultados.set(sec.id,res); sec.resumo=resumo;
    return {res, resumo};
  };
  GM.calculaPior=sec=>{
    const lista=GM.condicoesPior(sec).map(cond=>{ const res=GM.calculaCond(sec,cond); return {cond, pacote:{res, resumo:sec.resumo}}; });
    return GM.combinaPior(sec,lista).res;
  };
  /* Superfície escolhida à mão (círculo ou poligonal): análise direta, sem busca. */
  GM.calculaManual=(sec,sup,rapido)=>{
    const def=GM.definicao(sec), metodo=(sec.busca||{}).metodo||'mp';
    try{ return SL().analisa(SL().modelo(def),sup,rapido?{metodo, metodos:[metodo], curvas:false, fatias:40}:{metodo, fatias:100}); }
    catch(e){ return {ok:false, motivo:e.message}; }
  };
  /* Classe de segurança do FS frente ao admissível. */
  GM.classe=(fs,adm)=>{ adm=adm>0?adm:1.5; return !(fs>0)?'nd':fs<1?'ruptura':fs<Math.min(adm,1.3)?'baixo':fs<adm?'atencao':'ok'; };
  GM.corClasse={ruptura:'#d93025', baixo:'#e8710a', atencao:'#d9a406', ok:'#1e8e3e', nd:'#7a8794'};
  GM.corFS=(fs,adm)=>GM.corClasse[GM.classe(fs,adm)];

  /* Itens de sensibilidade e de Monte Carlo propostos a partir dos materiais da seção. */
  GM.parametros=sec=>{
    const out=[];
    sec.camadas.forEach(c=>{
      const m=sec.materiais[c.mat]; if(!m||out.some(o=>o.mat===c.mat)) return;
      const poe=(chave,rot,cv,un)=>{ const v=num(m[chave],NaN); if(Number.isFinite(v)&&v>0) out.push({mat:c.mat, chave, nome:m.nome, rotulo:rot, valor:v, cv, un}); };
      if((m.modelo||'mc')==='mc'){ poe('c','c′',0.3,'kPa'); poe('phi','φ′',0.1,'°'); }
      else if(m.modelo==='su') poe('su','Su',0.25,'kPa');
      else if(m.modelo==='hb'){ poe('GSI','GSI',0.1,''); poe('sci','σci',0.2,'MPa'); }
      else if(m.modelo==='leps') poe('phi0','φ0',0.08,'°');
      if(m.modelo!=='rocha') poe('gama','γ',0.05,'kN/m³');
    });
    return out;
  };
  GM.sensibilidade=(sec,sup,variacao,rebusca)=>{
    const def=GM.definicao(sec), v=variacao||0.2, P=GM.parametros(sec);
    const itens=P.map(p=>({mat:p.mat, chave:p.chave, de:p.valor*(1-v), ate:p.valor*(1+v), nome:p.nome, rotulo:p.rotulo, valor:p.valor, un:p.un}));
    const r=SL().sensibilidade(def,sup,itens,{metodo:sec.busca.metodo, passos:9, rebusca:!!rebusca});
    r.variacao=v;
    return r;
  };
  GM.monteCarlo=(sec,sup,n,cvs)=>{
    const def=GM.definicao(sec), P=GM.parametros(sec);
    const vars=P.map(p=>{ const cv=cvs&&cvs[p.mat+'.'+p.chave]!=null?cvs[p.mat+'.'+p.chave]:p.cv;
      return {mat:p.mat, chave:p.chave, dist:p.chave==='phi'||p.chave==='phi0'||p.chave==='GSI'?'normal':'lognormal', media:p.valor, dp:p.valor*cv, min:p.valor*Math.max(0.05,1-4*cv), max:p.valor*(1+4*cv), rotulo:p.rotulo, nome:p.nome, cv}; }).filter(v=>v.dp>0);
    const r=SL().monteCarlo(def,sup,vars,{n:n||2000, metodo:sec.busca.metodo});
    r.vars=vars;
    return r;
  };
  GM.escoamento=(sec,sup,rebusca)=>SL().escoamento(GM.definicao(sec),rebusca?null:sup,{metodo:sec.busca.metodo, rebusca:!!rebusca});
  /* Retroanálise: pares (c′, φ′) de um material que levam o FS a 1 na superfície dada.
     Combinação sem solução (o método não converge com resistência quase nula) conta como
     instável; o ponto só entra se o fator de segurança encontrado fechar mesmo em 1. */
  GM.retroanalise=(sec,sup,mat)=>{
    const def=GM.definicao(sec), m=def.materiais[mat];
    if(!m||m.modelo!=='mc') return null;
    const f=(c,phi)=>{ const d=JSON.parse(JSON.stringify(def)); d.materiais[mat].c=c; d.materiais[mat].phi=phi; return SL().avalia(d,sup,{metodo:sec.busca.metodo}); };
    const pts=[], phiMax=Math.min(60,Math.max(m.phi*1.6,20));
    for(let k=0;k<=12;k++){
      const phi=phiMax*k/12;
      if(f(0,phi)>=1){ pts.push([phi,0]); break; }
      let lo=0, hi=Math.max(m.c*2,10), Fh=f(hi,phi);
      for(let it=0;it<10&&!(Fh>=1);it++){ lo=hi; hi*=2; Fh=f(hi,phi); }
      if(!(Fh>=1)) continue;
      for(let it=0;it<26;it++){ const mid=(lo+hi)/2; if(f(mid,phi)>=1) hi=mid; else lo=mid; }
      if(Math.abs(f(hi,phi)-1)<0.01) pts.push([phi,hi]);
    }
    return {mat, nome:m.nome, pts, atual:[m.phi,m.c]};
  };

  /* --------------------------- projeto --------------------------- */
  GM.snapshot=()=>JSON.parse(JSON.stringify({versao:1, ativa:estado.ativa, secoes:estado.secoes}));
  GM.restaura=d=>{
    resultados.clear();
    estado={versao:1, secoes:[], ativa:''};
    if(d&&Array.isArray(d.secoes)){
      for(const s of d.secoes){
        if(!s||!Array.isArray(s.terreno)||s.terreno.length<2||!Array.isArray(s.camadas)||!s.camadas.length||!s.materiais) continue;
        const b=secaoVazia(String(s.nome||'Seção'),s.origem||'talude');
        estado.secoes.push(Object.assign(b,s,{id:s.id||b.id, agua:Object.assign(b.agua,s.agua||{}), sismo:Object.assign(b.sismo,s.sismo||{}),
          trinca:Object.assign(b.trinca,s.trinca||{}), busca:Object.assign(b.busca,s.busca||{})}));
      }
      estado.ativa=estado.secoes.some(s=>s.id===d.ativa)?d.ativa:(estado.secoes[0]||{}).id||'';
    }
    return estado;
  };
  GM.temConteudo=()=>estado.secoes.length>0;

  /* --------------------------- cálculo em segundo plano --------------------------- */
  /* A busca leva de meio segundo a alguns segundos. Ela roda numa thread à parte, com o
     mesmo código (o texto do motor e deste arquivo), e a tela continua respondendo. Sem
     Worker disponível, o cálculo é feito aqui mesmo depois de ceder a vez ao desenho. */
  const COM_RESUMO={calcula:1, calculaCond:1};
  const direto=(fn,sec,args)=>COM_RESUMO[fn]?{res:GM[fn].apply(null,[sec].concat(args||[])), resumo:sec.resumo}:GM[fn].apply(null,[sec].concat(args||[]));
  function servico(){                              /* corpo do Worker */
    self.onmessage=e=>{
      const q=e.data, G=self.GeoMineGeomecInterno;
      try{
        const r=q.fn==='calcula'||q.fn==='calculaCond'?{res:G[q.fn].apply(null,[q.sec].concat(q.args||[])), resumo:q.sec.resumo}:G[q.fn].apply(null,[q.sec].concat(q.args||[]));
        self.postMessage({id:q.id, r});
      }catch(err){ self.postMessage({id:q.id, erro:String(err&&err.message||err)}); }
    };
  }
  let operario=null, semOperario=false, seq=0;
  const pedidos=new Map();
  const rejeita=erro=>{ for(const p of pedidos.values()) p.rej(erro); pedidos.clear(); };
  function criaOperario(){
    if(operario) return operario;
    if(semOperario||typeof Worker!=='function'||typeof Blob!=='function'||typeof URL==='undefined'||!URL.createObjectURL) return null;
    try{
      const url=URL.createObjectURL(new Blob([SL().fonte(),'\n',GM.fonte(),'\n(',servico.toString(),')();'],{type:'text/javascript'}));
      const w=new Worker(url);
      URL.revokeObjectURL(url);
      w.onmessage=e=>{ const p=pedidos.get(e.data.id); if(!p) return; pedidos.delete(e.data.id); if(e.data.erro) p.rej(new Error(e.data.erro)); else p.res(e.data.r); };
      w.onerror=e=>{ semOperario=true; operario=null; try{ w.terminate(); }catch(_){} rejeita(Object.assign(new Error(e&&e.message||'Falha na thread de cálculo'),{semOperario:true})); };
      operario=w;
      return w;
    }catch(e){ semOperario=true; return null; }
  }
  GM.pede=(fn,sec,args)=>new Promise((res,rej)=>{
    const copia=JSON.parse(JSON.stringify(sec)), w=criaOperario();
    if(!w){ setTimeout(()=>{ try{ res(direto(fn,copia,args)); }catch(e){ rej(e); } },30); return; }
    const id=++seq;
    pedidos.set(id,{res,rej});
    try{ w.postMessage({id, fn, sec:copia, args:args||[]}); }catch(e){ pedidos.delete(id); rej(e); }
  });
  /* Interrompe o que estiver em cálculo (os parâmetros mudaram no meio do caminho). */
  GM.cancela=()=>{
    if(operario&&pedidos.size){ try{ operario.terminate(); }catch(e){} operario=null; }
    rejeita(Object.assign(new Error('Cálculo interrompido.'),{cancelado:true}));
  };
  GM.ocupado=()=>pedidos.size>0;
  /* Guarda na seção o que voltou do cálculo. */
  GM.aplica=(sec,pacote)=>{ resultados.set(sec.id,pacote.res); sec.resumo=pacote.resumo||null; return pacote.res; };
  const pedeCond=(sec,cond)=>GM.pede('calculaCond',sec,[cond]).catch(e=>{
    if(e&&e.semOperario) return GM.pede('calculaCond',sec,[cond]);   /* a thread falhou: refaz aqui mesmo */
    throw e;
  });
  /* No pior caso as condições vão uma de cada vez; avanca(i, n, condição) mostra o andamento. */
  GM.calculaAsync=async(sec,avanca)=>{
    const a=GM.agua(sec);
    if(a.condicao!=='pior') return GM.aplica(sec,await pedeCond(sec,a.condicao));
    const conds=GM.condicoesPior(sec), lista=[];
    for(let i=0;i<conds.length;i++){
      if(avanca) try{ avanca(i,conds.length,conds[i]); }catch(e){}
      lista.push({cond:conds[i], pacote:await pedeCond(sec,conds[i])});
    }
    return GM.combinaPior(sec,lista).res;
  };
  GM.fonte=()=>'('+fabrica.toString()+')(self);';
  }
  fabrica(root);
})(typeof window!=='undefined'?window:globalThis);
