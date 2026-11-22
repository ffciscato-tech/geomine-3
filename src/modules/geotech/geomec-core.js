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
  function secaoVazia(nome,origem){
    return {id:novoId('sec'), nome, origem, linha:null, crs:null, terreno:[], camadas:[], materiais:{}, sentido:'auto', base:'',
      agua:{modo:'nenhuma', linha:[]}, cargas:[], sismo:{kh:0, kv:0}, trinca:{prof:0, agua:0},
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
  /* Seção cortada no mapa. perfis = [{id, nome, papel:'terreno'|'contato', z:[…]}] nas mesmas
     estações dist[]. O terreno vale onde tem cota; onde não tem (superfície de pilha fora da
     pilha, por exemplo), vale o contato mais alto. Contatos viram topos de camada, de cima
     para baixo pela cota média. */
  GM.novaSecaoMapa=(linha,crs,dist,perfis,op)=>{
    op=op||{};
    const ter=perfis.find(p=>p.papel==='terreno'), cont=perfis.filter(p=>p.papel==='contato');
    if(!ter) throw new Error('Escolha a superfície do terreno.');
    const n=dist.length, zt=new Array(n).fill(NaN);
    for(let i=0;i<n;i++){
      let z=ter.z[i];
      if(!Number.isFinite(z)){ z=-Infinity; for(const c of cont) if(Number.isFinite(c.z[i])&&c.z[i]>z) z=c.z[i]; if(z===-Infinity) z=NaN; }
      zt[i]=z;
    }
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
    s.materiais={m1:GM.materialPadrao(0,op.material0||'Material 1')};
    s.camadas=[{mat:'m1', fonte:{tipo:'raster', id:ter.id, nome:ter.nome}}];
    usados.forEach((c,k)=>{
      const z=new Array(n); let ant=NaN;
      for(let i=a;i<=b;i++){ const v=Number.isFinite(c.z[i])?Math.min(c.z[i],zt[i]):zt[i]; z[i]=v; ant=v; }
      const id='m'+(k+2);
      s.materiais[id]=GM.materialPadrao(k+1,'Material '+(k+2));
      s.camadas.push({mat:id, topo:linhaDe(z), fonte:{tipo:'raster', id:c.id, nome:c.nome}});
    });
    s.ignorados=cont.filter(c=>!usados.includes(c)).map(c=>c.nome);
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
  GM.removeCamada=(sec,k)=>{
    if(k<=0||k>=sec.camadas.length) return;
    const [c]=sec.camadas.splice(k,1);
    if(!sec.camadas.some(x=>x.mat===c.mat)) delete sec.materiais[c.mat];
  };

  /* --------------------------- definição para o motor --------------------------- */
  GM.definicao=sec=>{
    const mats={};
    for(const [id,m] of Object.entries(sec.materiais)){
      const o={nome:m.nome, modelo:m.modelo||'mc', gama:num(m.gama,NaN), gamaSat:num(m.gamaSat,0), ru:num(m.ru,0)};
      if(o.modelo==='mc'){ o.c=num(m.c,0); o.phi=num(m.phi,0); }
      else if(o.modelo==='su'){ o.su=num(m.su,0); o.suK=num(m.suK,0); o.zRef=num(m.zRef,0); }
      else if(o.modelo==='hb'){ o.sci=num(m.sci,NaN); o.GSI=num(m.GSI,NaN); o.mi=num(m.mi,NaN); o.D=num(m.D,0); }
      else if(o.modelo==='leps'){ o.phi0=num(m.phi0,NaN); o.dphi=num(m.dphi,0); }
      else if(o.modelo==='tab'){ o.tab=String(m.tab||'').split(/\n+/).map(l=>l.trim().split(/[\s;]+/).map(v=>num(v,NaN))).filter(p=>p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])); }
      mats[id]=o;
    }
    const b=sec.busca||{};
    return {terreno:sec.terreno, camadas:sec.camadas.map((c,k)=>k===0?{mat:c.mat}:{mat:c.mat, topo:c.topo}), materiais:mats,
      agua:sec.agua&&sec.agua.modo==='linha'&&sec.agua.linha.length>1?{linha:sec.agua.linha.slice().sort((p,q)=>p[0]-q[0])}:null,
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
  GM.calcula=sec=>{
    const t0=Date.now(), def=GM.definicao(sec);
    let M;
    try{ M=SL().modelo(def); }catch(e){ const r={ok:false, motivo:e.message}; resultados.set(sec.id,r); sec.resumo=null; return r; }
    const op=GM.opcoesBusca(sec), b=SL().busca(M,op);
    const r={ok:b.ok, motivo:b.motivo||(b.critica&&b.critica.motivo), def, sentido:M.sentido, busca:b, critica:b.ok?b.critica:null, circular:b.ok?b.critica:null, naoCircular:null};
    if(b.ok&&sec.busca.naoCircular&&op.metodo!=='bishop'&&op.metodo!=='ordinario'){
      const o=SL().otimizaVarias(M,[b.critica.sup,...b.porte.map(p=>p.sup)],{metodo:op.metodo});
      if(o.ok){ r.naoCircular=o; if(o.FS<b.critica.FS-1e-4) r.critica=o.critica; }
    }
    r.ms=Date.now()-t0;
    resultados.set(sec.id,r);
    sec.resumo=r.ok?{FS:r.critica.FS, metodo:r.critica.metodo, F:r.critica.F, lam:r.critica.lam, sup:r.critica.sup, tipo:r.critica.sup.tipo,
      FScircular:b.critica.FS, FSnaoCircular:r.naoCircular?r.naoCircular.FS:null, porte:b.porte.map(p=>({classe:p.classe, FS:p.FS, altura:p.altura})),
      avisos:r.critica.avisos, tentativas:b.validas, em:new Date().toISOString(), sentido:M.sentido}:null;
    return r;
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
  const direto=(fn,sec,args)=>fn==='calcula'?{res:GM.calcula(sec), resumo:sec.resumo}:GM[fn].apply(null,[sec].concat(args||[]));
  function servico(){                              /* corpo do Worker */
    self.onmessage=e=>{
      const q=e.data, G=self.GeoMineGeomecInterno;
      try{
        const r=q.fn==='calcula'?{res:G.calcula(q.sec), resumo:q.sec.resumo}:G[q.fn].apply(null,[q.sec].concat(q.args||[]));
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
  GM.calculaAsync=sec=>GM.pede('calcula',sec).catch(e=>{
    if(e&&e.semOperario) return GM.pede('calcula',sec);        /* a thread falhou: refaz aqui mesmo */
    throw e;
  }).then(pacote=>GM.aplica(sec,pacote));
  GM.fonte=()=>'('+fabrica.toString()+')(self);';
  }
  fabrica(root);
})(typeof window!=='undefined'?window:globalThis);
