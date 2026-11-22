/* GeoMine — estabilidade de taludes por equilíbrio-limite (método das fatias).
   Motor puro: sem DOM e sem estado do projeto, para rodar igual no aplicativo e nos testes.

   Formulação geral (GLE, Fredlund & Krahn 1977), a mesma família do SLOPE/W:
   cada fatia obedece ao equilíbrio vertical e horizontal; a força cisalhante entre
   fatias é X = λ·f(x)·E. Para cada λ há um fator de segurança que fecha os MOMENTOS
   (Fm) e outro que fecha as FORÇAS (Ff). Casos particulares:
     Bishop simplificado      = Fm com λ = 0
     Janbu simplificado       = Ff com λ = 0 (e o corrigido, × f0)
     Spencer                  = Fm = Ff com f(x) = 1
     Morgenstern–Price        = Fm = Ff com f(x) = meia-senoide
     Ordinário (Fellenius)    = sem forças entre fatias (só superfície circular)

   Convenção interna: o maciço desliza no sentido +x (crista à esquerda). Seção que
   desliza para o outro lado é espelhada na entrada e desespelhada na saída.
   Forças em kN/m, tensões em kPa, comprimentos em m, pesos específicos em kN/m³.
   Sinais: N age na base, para dentro da fatia; S resiste ao movimento; E_esq empurra
   a fatia no sentido +x e X_esq a puxa para baixo; kh age no sentido do movimento e
   kv positivo aumenta o peso. */
(function(root){
  /* O motor inteiro mora numa função com nome: assim o mesmo código pode ser entregue como
     texto a uma thread à parte (Web Worker) e a tela não trava durante a busca. */
  function fabrica(root){
  'use strict';

  const GAMA_AGUA=9.81, TOL=1e-8, RAD=Math.PI/180;

  /* ------------------------------ geometria ------------------------------ */
  function lerp(P,x){
    const n=P.length;
    if(x<=P[0][0]) return P[0][1];
    if(x>=P[n-1][0]) return P[n-1][1];
    let lo=0, hi=n-1;
    while(hi-lo>1){ const m=(lo+hi)>>1; if(P[m][0]<=x) lo=m; else hi=m; }
    const a=P[lo], b=P[hi];
    return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);
  }
  /* Polilinha com x estritamente crescente; face vertical vira um degrau de 0,1 mm. */
  function limpa(P,nome){
    const out=[];
    for(const p of P||[]){
      const x=+p[0], z=+p[1];
      if(!Number.isFinite(x)||!Number.isFinite(z)) continue;
      if(out.length){
        const xa=out[out.length-1][0];
        if(x<xa-1e-9) throw new Error((nome||'A linha')+' precisa ter as distâncias em ordem crescente.');
        out.push([x<=xa+1e-4?xa+1e-4:x,z]);
      } else out.push([x,z]);
    }
    return out;
  }
  const espelha=P=>P.map(p=>[-p[0],p[1]]).reverse();

  /* ------------------------------ resistência ------------------------------ */
  function hoekBrown(m){
    const D=m.D||0, mb=m.mi*Math.exp((m.GSI-100)/(28-14*D)), s=Math.exp((m.GSI-100)/(9-3*D)),
      a=0.5+(Math.exp(-m.GSI/15)-Math.exp(-20/3))/6;
    return {mb, s, a, sci:m.sci*1000};          /* σci em MPa na entrada */
  }
  function hbEm(h,s3){
    const q=Math.max(h.mb*s3/h.sci+h.s,0), s1=s3+h.sci*Math.pow(q,h.a),
      d=q>0?1+h.a*h.mb*Math.pow(q,h.a-1):Infinity;
    if(!Number.isFinite(d)) return {sn:s3, tau:0, d};
    return {sn:(s1+s3)/2-(s1-s3)/2*(d-1)/(d+1), tau:(s1-s3)*Math.sqrt(d)/(d+1), d};
  }
  /* Envoltória de Hoek–Brown generalizada (2002) no plano τ–σn: acha σ3 que dá a tensão
     normal pedida e devolve a tangente (coesão e atrito instantâneos). */
  function hbTangente(h,sn){
    const tracao=-h.s*h.sci/h.mb;
    if(!(sn>hbEm(h,tracao).sn)) return {c:0, t:0};
    let lo=tracao, hi=Math.max(sn,1);
    while(hbEm(h,hi).sn<sn) hi=hi*2+1;
    for(let k=0;k<60;k++){ const m=(lo+hi)/2; if(hbEm(h,m).sn<sn) lo=m; else hi=m; }
    const r=hbEm(h,(lo+hi)/2), t=Math.tan(Math.asin((r.d-1)/(r.d+1)));
    return {c:Math.max(0,r.tau-r.sn*t), t};
  }
  function hbTau(h,sn){
    const tracao=-h.s*h.sci/h.mb;
    if(!(sn>hbEm(h,tracao).sn)) return 0;
    let lo=tracao, hi=Math.max(sn,1);
    while(hbEm(h,hi).sn<sn) hi=hi*2+1;
    for(let k=0;k<60;k++){ const m=(lo+hi)/2; if(hbEm(h,m).sn<sn) lo=m; else hi=m; }
    return hbEm(h,(lo+hi)/2).tau;
  }
  /* Envoltória não linear amostrada uma vez por material: 0 e depois 0,5 kPa a 200 MPa em
     progressão geométrica. A busca avalia milhares de bases; consultar a tabela custa um
     punhado de comparações e o erro da interpolação fica abaixo de 0,01%. */
  function envoltoria(tau){
    const N=420, sn=new Float64Array(N+1), tv=new Float64Array(N+1);
    for(let k=1;k<=N;k++) sn[k]=0.5*Math.pow(4e5,(k-1)/(N-1));
    for(let k=0;k<=N;k++) tv[k]=Math.max(0,tau(sn[k]));
    return {sn, tau:tv};
  }
  function tangenteEnv(e,sn){
    const S=e.sn, n=S.length;
    let lo=0, hi=n-1;
    if(sn>=S[n-1]) lo=n-2;
    else if(sn>S[0]){ while(hi-lo>1){ const m=(lo+hi)>>1; if(S[m]<=sn) lo=m; else hi=m; } }
    const t=Math.max(0,(e.tau[lo+1]-e.tau[lo])/(S[lo+1]-S[lo]));
    return {c:Math.max(0,e.tau[lo]-S[lo]*t), t};
  }
  function material(m,id){
    if(!m) throw new Error('Material sem definição: '+id);
    const modelo=m.modelo||'mc', gama=+m.gama;
    if(!(gama>0)) throw new Error('Peso específico inválido no material '+(m.nome||id)+'.');
    const o={id, nome:m.nome||String(id), modelo, gama, gamaSat:+m.gamaSat>0?+m.gamaSat:gama, ru:+m.ru||0,
      c:Math.max(0,+m.c||0), phi:+m.phi||0, tanphi:Math.tan((+m.phi||0)*RAD), linear:true};
    if(modelo==='su'){
      o.su=Math.max(0,+m.su||0); o.suK=+m.suK||0; o.zRef=+m.zRef||0; o.linear=!o.suK;
      o.c=o.su; o.phi=0; o.tanphi=0;
    } else if(modelo==='hb'){
      if(!(+m.sci>0)||!(+m.mi>0)||!(+m.GSI>0)) throw new Error('Hoek–Brown incompleto no material '+o.nome+'.');
      o.hb=hoekBrown({sci:+m.sci, mi:+m.mi, GSI:+m.GSI, D:+m.D||0}); o.linear=false;
      o.env=envoltoria(sn=>hbTau(o.hb,sn));
    } else if(modelo==='leps'){
      /* enrocamento/estéril: atrito secante que cai com o logaritmo da tensão normal */
      const phi0=+m.phi0, dphi=+m.dphi||0, pa=+m.pa||100, mn=+m.phiMin||25, mx=+m.phiMax||60;
      if(!(phi0>0)) throw new Error('Informe φ0 no material '+o.nome+'.');
      o.env=envoltoria(s=>s*Math.tan(Math.min(mx,Math.max(mn,phi0-dphi*Math.log10(Math.max(s,1e-6)/pa)))*RAD));
      o.linear=false;
    } else if(modelo==='tab'){
      const T=(m.tab||[]).map(p=>[+p[0],+p[1]]).filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])).sort((a,b)=>a[0]-b[0]);
      if(T.length<2) throw new Error('A envoltória por pontos do material '+o.nome+' precisa de 2 pontos ou mais.');
      o.env={sn:Float64Array.from(T,p=>p[0]), tau:Float64Array.from(T,p=>Math.max(0,p[1]))}; o.linear=false;
    } else if(modelo==='rocha'){
      o.impenetravel=true;
    }
    return o;
  }
  /* Coesão e tan φ da base da fatia, para a tensão normal efetiva sn e a cota z. */
  function resistencia(m,sn,z){
    if(m.linear) return {c:m.c, t:m.tanphi};
    if(m.modelo==='su') return {c:Math.max(0,m.su+m.suK*(m.zRef-z)), t:0};
    if(m.env) return tangenteEnv(m.env,sn);
    return {c:m.c, t:m.tanphi};
  }

  /* ------------------------------ modelo ------------------------------ */
  /* modelo = {terreno:[[x,z]…], camadas:[{mat, topo:[[x,z]…]}…] (de cima para baixo; a 1ª
     começa no terreno e dispensa topo), materiais:{id:{…}}, agua:{linha:[[x,z]…]},
     cargas:[{x1,x2,q}|{x,P}], sismo:{kh,kv}, trinca:{prof,agua}, sentido:'auto'|'dir'|'esq',
     base:z, gamaAgua} */
  function modelo(def){
    let terreno=limpa(def.terreno,'O terreno');
    if(terreno.length<2) throw new Error('A seção precisa de um terreno com 2 pontos ou mais.');
    const camadas=(def.camadas&&def.camadas.length?def.camadas:[{mat:Object.keys(def.materiais||{})[0]}]);
    let topos=camadas.map((c,k)=>k===0?null:limpa(c.topo,'O topo da camada '+(k+1)));
    topos.forEach((t,k)=>{ if(k>0&&t.length<2) throw new Error('A camada '+(k+1)+' precisa de uma linha de topo.'); });
    let agua=def.agua&&def.agua.linha&&def.agua.linha.length>=2?limpa(def.agua.linha,'A linha d’água'):null;
    let sentido=def.sentido;
    if(sentido!=='dir'&&sentido!=='esq'){
      /* desliza para o lado mais baixo: compara as cotas médias dos dois quartos extremos */
      const x0=terreno[0][0], L=terreno[terreno.length-1][0]-x0; let e=0,d=0;
      for(let i=0;i<=20;i++){ e+=lerp(terreno,x0+L*0.25*i/20); d+=lerp(terreno,x0+L*(0.75+0.25*i/20)); }
      sentido=e>=d?'dir':'esq';
    }
    const esp=sentido==='esq';
    if(esp){ terreno=espelha(terreno); topos=topos.map(t=>t&&espelha(t)); if(agua) agua=espelha(agua); }
    const mats=camadas.map(c=>material((def.materiais||{})[c.mat],c.mat));
    const cargas=[], pontuais=[];
    for(const q of def.cargas||[]){
      if(q.P!=null&&Number.isFinite(+q.x)) pontuais.push({x:esp?-q.x:+q.x, P:+q.P||0});
      else if(Number.isFinite(+q.x1)&&Number.isFinite(+q.x2)&&+q.q){
        const a=esp?-q.x2:+q.x1, b=esp?-q.x1:+q.x2;
        cargas.push({x1:Math.min(a,b), x2:Math.max(a,b), q:+q.q});
      }
    }
    let zmin=Infinity, zmax=-Infinity;
    for(const p of terreno){ if(p[1]<zmin)zmin=p[1]; if(p[1]>zmax)zmax=p[1]; }
    const rocha=mats.findIndex(m=>m.impenetravel);
    return {terreno, topos, mats, K:mats.length, agua, gw:+def.gamaAgua>0?+def.gamaAgua:GAMA_AGUA,
      kh:+(def.sismo&&def.sismo.kh)||0, kv:+(def.sismo&&def.sismo.kv)||0, cargas, pontuais,
      trinca:def.trinca&&+def.trinca.prof>0?{prof:+def.trinca.prof, agua:Math.min(1,Math.max(0,+def.trinca.agua||0))}:null,
      base:Number.isFinite(+def.base)&&def.base!==null&&def.base!==''?+def.base:-Infinity,
      rocha:rocha>0?rocha:-1, esp, sentido, x0:terreno[0][0], x1:terreno[terreno.length-1][0], zmin, zmax,
      linear:mats.every(m=>m.linear), _profMin:0};
  }
  /* Topo efetivo da camada k em x: nenhuma camada sobe acima das que estão em cima dela. */
  function topoEf(M,k,x){
    let z=lerp(M.terreno,x);
    for(let j=1;j<=k;j++) z=Math.min(z,lerp(M.topos[j],x));
    return z;
  }
  function camadaEm(M,x,z){
    let topo=lerp(M.terreno,x);
    for(let k=1;k<M.K;k++){
      topo=Math.min(topo,lerp(M.topos[k],x));
      if(z>=topo-1e-9) return k-1;
    }
    return M.K-1;
  }
  /* Peso da coluna de solo entre zb e o terreno, em x: w = ∫γ dz, m1 = ∫γ z dz, ru = Σ ru γ h. */
  function coluna(M,x,zb,o){
    const zw=M.agua?lerp(M.agua,x):-Infinity;
    let topo=lerp(M.terreno,x), w=0, m1=0, ru=0;
    o.zg=topo;
    for(let k=0;k<M.K&&topo>zb;k++){
      const fundo=k<M.K-1?Math.min(topo,lerp(M.topos[k+1],x)):-Infinity, lo=Math.max(fundo,zb);
      if(topo>lo){
        const m=M.mats[k], zs=Math.min(topo,Math.max(lo,zw)), wd=m.gama*(topo-zs), ws=m.gamaSat*(zs-lo);
        w+=wd+ws; m1+=wd*(topo+zs)/2+ws*(zs+lo)/2; ru+=m.ru*(wd+ws);
      }
      topo=fundo;
    }
    o.w=w; o.m1=m1; o.ru=ru; o.zw=zw;
    return o;
  }

  /* ------------------------------ superfície de ruptura ------------------------------ */
  /* Piso da superfície: não entra em rocha impenetrável nem abaixo da base do modelo. */
  function piso(M,x){
    let z=M.base;
    if(M.rocha>0) z=Math.max(z,topoEf(M,M.rocha,x));
    return z;
  }
  function comPiso(M,z){
    return (M.rocha>0||M.base>-Infinity)?x=>Math.max(z(x),piso(M,x)):z;
  }
  /* Círculo (coordenadas internas) recortado pelo terreno. Devolve o trecho mais largo em
     que o arco inferior fica abaixo do terreno. */
  function arco(M,xc,zc,r){
    const z=x=>{ const q=r*r-(x-xc)*(x-xc); return q>0?zc-Math.sqrt(q):zc; };
    const xs=[], T=M.terreno;
    for(let i=0;i<T.length-1;i++){
      const ax=T[i][0]-xc, az=T[i][1]-zc, dx=T[i+1][0]-T[i][0], dz=T[i+1][1]-T[i][1],
        A=dx*dx+dz*dz, B=2*(ax*dx+az*dz), C=ax*ax+az*az-r*r, disc=B*B-4*A*C;
      if(!(disc>=0)||!(A>0)) continue;
      const sq=Math.sqrt(disc);
      for(const t of [(-B-sq)/(2*A),(-B+sq)/(2*A)]){
        if(t<-1e-12||t>1+1e-12) continue;
        if(az+t*dz<=1e-9) xs.push(T[i][0]+t*dx);          /* só o arco inferior */
      }
    }
    xs.sort((a,b)=>a-b);
    let melhor=null;
    for(let i=0;i<xs.length-1;i++){
      const a=xs[i], b=xs[i+1];
      if(b-a<1e-6) continue;
      const m=(a+b)/2;
      if(z(m)<lerp(T,m)-1e-9&&(!melhor||b-a>melhor.xb-melhor.xa)) melhor={xa:a, xb:b};
    }
    if(!melhor) return null;
    return {tipo:'circulo', xc, zc, r, xa:melhor.xa, xb:melhor.xb, z:comPiso(M,z), centro:[xc,zc]};
  }
  /* Círculo que passa pela entrada (xe) e pela saída (xs) do terreno, com flecha s·corda. */
  function arcoES(M,xe,xs,s){
    const ze=lerp(M.terreno,xe), zs=lerp(M.terreno,xs), dx=xs-xe, dz=zs-ze, L=Math.hypot(dx,dz);
    if(!(dx>1e-6)||!(s>0)) return null;
    const fl=s*L, r=(L*L/4+fl*fl)/(2*fl), nx=dz/L, nz=-dx/L,
      xc=(xe+xs)/2-nx*(r-fl), zc=(ze+zs)/2-nz*(r-fl);
    if(zc<ze-1e-9||zc<zs-1e-9) return null;                 /* o arco inferior precisa conter os dois pontos */
    const z=x=>{ const q=r*r-(x-xc)*(x-xc); return q>0?zc-Math.sqrt(q):zc; };
    return {tipo:'circulo', xc, zc, r, xa:xe, xb:xs, z:comPiso(M,z), centro:[xc,zc], s};
  }
  function poligonal(M,pts){
    const P=limpa(pts,'A superfície de ruptura');
    if(P.length<2) return null;
    const xa=P[0][0], xb=P[P.length-1][0];
    /* centro de momentos: o do círculo que passa pelas pontas e pelo ponto mais fundo */
    let centro=null, fundo=0, pf=null;
    const ax=P[0][0], az=P[0][1], bx=xb, bz=P[P.length-1][1], L=Math.hypot(bx-ax,bz-az);
    for(const p of P){ const d=((bx-ax)*(az-p[1])-(ax-p[0])*(bz-az))/L; if(d>fundo){ fundo=d; pf=p; } }
    if(pf&&fundo>1e-6*L){
      const d=2*(ax*(pf[1]-bz)+pf[0]*(bz-az)+bx*(az-pf[1]));
      if(Math.abs(d)>1e-12){
        const a2=ax*ax+az*az, p2=pf[0]*pf[0]+pf[1]*pf[1], b2=bx*bx+bz*bz;
        centro=[(a2*(pf[1]-bz)+p2*(bz-az)+b2*(az-pf[1]))/d, (a2*(bx-pf[0])+p2*(ax-bx)+b2*(pf[0]-ax))/d];
      }
    }
    if(!centro) centro=[(xa+xb)/2, Math.max(az,bz)+(xb-xa)];
    return {tipo:'poli', pts:P, xa, xb, z:comPiso(M,x=>lerp(P,x)), centro, vertices:P.map(p=>p[0])};
  }
  /* Trinca de tração: a superfície passa a começar onde a base atinge a profundidade da trinca. */
  function comTrinca(M,S){
    if(!M.trinca) return S;
    const prof=M.trinca.prof, d=x=>lerp(M.terreno,x)-S.z(x), n=80;
    let a=S.xa, achou=false;
    for(let i=1;i<=n;i++){
      const x=S.xa+(S.xb-S.xa)*0.6*i/n;
      if(d(x)>=prof){ let lo=a, hi=x; for(let k=0;k<40;k++){ const m=(lo+hi)/2; if(d(m)>=prof) hi=m; else lo=m; } a=(lo+hi)/2; achou=true; break; }
      a=x;
    }
    if(!achou) return S;
    return Object.assign({},S,{xa:a, trinca:{x:a, topo:lerp(M.terreno,a), fundo:S.z(a)}});
  }

  /* ------------------------------ fatias ------------------------------ */
  function cortes(M,S,n,preciso){
    const xa=S.xa, xb=S.xb, L=xb-xa, tol=L*1e-7, xs=[];
    for(let i=0;i<=n;i++) xs.push(xa+L*i/n);
    const poe=x=>{ if(x>xa+tol&&x<xb-tol) xs.push(x); };
    if(S.vertices) S.vertices.forEach(poe);
    /* os vértices das linhas sempre viram divisa de fatia: dentro de cada fatia tudo é reto */
    M.terreno.forEach(p=>poe(p[0]));
    for(let k=1;k<M.K;k++) M.topos[k].forEach(p=>poe(p[0]));
    if(M.agua) M.agua.forEach(p=>poe(p[0]));
    M.cargas.forEach(q=>{ poe(q.x1); poe(q.x2); });
    if(preciso){
      /* cruzamentos: base × topos, base × água, água × terreno e acunhamento entre camadas */
      const fs=[];
      for(let k=1;k<M.K;k++){
        fs.push(x=>S.z(x)-lerp(M.topos[k],x));
        fs.push(x=>lerp(M.topos[k],x)-topoEf(M,k-1,x));
      }
      if(M.agua){ fs.push(x=>S.z(x)-lerp(M.agua,x)); fs.push(x=>lerp(M.agua,x)-lerp(M.terreno,x)); }
      const m=Math.max(4*n,160);
      for(const f of fs){
        let xp=xa, fp=f(xa);
        for(let i=1;i<=m;i++){
          const x=xa+L*i/m, fx=f(x);
          if(fp*fx<0){
            let lo=xp, hi=x, flo=fp;
            for(let k=0;k<44;k++){ const mid=(lo+hi)/2, fm=f(mid); if(flo*fm<=0) hi=mid; else { lo=mid; flo=fm; } }
            poe((lo+hi)/2);
          }
          xp=x; fp=fx;
        }
      }
    }
    xs.sort((a,b)=>a-b);
    const out=[xs[0]];
    for(let i=1;i<xs.length;i++) if(xs[i]-out[out.length-1]>tol) out.push(xs[i]);
    out[out.length-1]=xb;
    return out;
  }
  function fatias(M,S,n,preciso,fx){
    const xs=cortes(M,S,n,preciso), alt=x=>lerp(M.terreno,x)-S.z(x);
    /* lasca sem altura numa das pontas (a superfície sai rente ao terreno): fica de fora */
    while(xs.length>3&&xs[1]-xs[0]<1e-3*(S.xb-S.xa)&&!(alt((xs[0]+xs[1])/2)>1e-7)) xs.shift();
    while(xs.length>3&&xs[xs.length-1]-xs[xs.length-2]<1e-3*(S.xb-S.xa)&&!(alt((xs[xs.length-1]+xs[xs.length-2])/2)>1e-7)) xs.pop();
    /* Um literal com todos os campos: criados depois, por nome calculado, eles deixavam o
       objeto em modo lento e cada leitura na marcha custava várias vezes mais.
       xi…xf: extensão da massa. */
    const ns=xs.length-1, v=()=>new Float64Array(ns);
    const F={n:ns, xs, xi:xs[0], xf:xs[ns], sup:S, xl:v(), xr:v(), b:v(), l:v(), sen:v(), cos:v(), W:v(), Vd:v(), Hd:v(), U:v(), u:v(),
      c:v(), t:v(), xb:v(), zb:v(), MW:v(), fN:v(), aS:v(), zgl:v(), zgr:v(), zbl:v(), zbr:v(), xw:v(), zc:v(), Pv:v(), Ph:v(), N:v(), sn:v(),
      mat:new Int32Array(ns), E:new Float64Array(ns+1), f:new Float64Array(ns+1), Mext:0, hmax:0, linear:true, L:0, fx:'', rapido:false,
      den:Infinity, Fm:NaN, Ff:NaN};
    const xo=S.centro[0], zo=S.centro[1], L=F.xf-F.xi, A={}, B={}, C={};
    for(let j=0;j<=ns;j++) F.f[j]=fx==='const'?1:Math.sin(Math.PI*(xs[j]-F.xi)/L);
    let hmax=0, linear=true;
    for(let i=0;i<ns;i++){
      const xl=xs[i], xr=xs[i+1], b=xr-xl, xm=(xl+xr)/2;
      let zl=S.z(xl), zr=S.z(xr);
      const gl=lerp(M.terreno,xl), gr=lerp(M.terreno,xr);
      if(zl>gl) zl=gl; if(zr>gr) zr=gr;
      const zm=(zl+zr)/2;
      coluna(M,xl,zl,A); coluna(M,xm,zm,B); coluna(M,xr,zr,C);
      const h=B.zg-zm;
      if(!(h>1e-7)) return null;                              /* a superfície saiu do terreno */
      if(h>hmax) hmax=h;
      const W=b/6*(A.w+4*B.w+C.w);
      if(!(W>0)) return null;
      const l=Math.hypot(b,zl-zr), sen=(zl-zr)/l, cos=b/l;
      const xw=b/6*(xl*A.w+4*xm*B.w+xr*C.w)/W, zc=b/6*(A.m1+4*B.m1+C.m1)/W;
      /* água empoçada sobre o terreno: carga normal à superfície */
      let Pwv=0, Pwh=0;
      if(M.agua){
        const dl=Math.max(0,A.zw-gl), dm=Math.max(0,B.zw-B.zg), dr=Math.max(0,C.zw-gr), md=(dl+4*dm+dr)/6;
        if(md>0){ Pwv=M.gw*md*b; Pwh=M.gw*md*(gr-gl); }
      }
      let Pv=0;
      for(const q of M.cargas){ const a=Math.max(q.x1,xl), c=Math.min(q.x2,xr); if(c>a) Pv+=q.q*(c-a); }
      for(const q of M.pontuais) if(q.x>=xl&&(q.x<xr||(i===ns-1&&q.x<=xr))) Pv+=q.P;
      /* material da base: o da superfície de verdade no meio da fatia (num mergulho raso em
         outra camada a corda fica em cima da divisa e enganaria a classificação) */
      const kb=camadaEm(M,xm,Math.min(zm,S.z(xm))), mt=M.mats[kb];
      let u=0;
      if(M.agua) u=M.gw*Math.max(0,B.zw-zm);
      u+=B.ru;
      F.xl[i]=xl; F.xr[i]=xr; F.b[i]=b; F.l[i]=l; F.sen[i]=sen; F.cos[i]=cos; F.W[i]=W;
      F.Vd[i]=W*(1+M.kv)+Pwv+Pv; F.Hd[i]=M.kh*W+Pwh; F.u[i]=u; F.U[i]=u*l; F.mat[i]=kb;
      F.xb[i]=xm; F.zb[i]=zm; F.zgl[i]=gl; F.zgr[i]=gr; F.zbl[i]=zl; F.zbr[i]=zr; F.xw[i]=xw; F.zc[i]=zc;
      F.Pv[i]=Pv+Pwv; F.Ph[i]=Pwh;
      /* momento das forças conhecidas em torno do centro: (x−xo)·Fz − (z−zo)·Fx */
      F.MW[i]=-(xw-xo)*W*(1+M.kv)-(zc-zo)*M.kh*W-(xm-xo)*(Pwv+Pv)-(B.zg-zo)*Pwh;
      F.fN[i]=(xm-xo)*cos-(zm-zo)*sen;
      F.aS[i]=(xm-xo)*sen+(zm-zo)*cos;
      if(mt.linear){ F.c[i]=mt.c; F.t[i]=mt.tanphi; }
      else { linear=false; const r=resistencia(mt,Math.max(0,(F.Vd[i]/b)*cos*cos-u),zm); F.c[i]=r.c; F.t[i]=r.t; }
    }
    /* água na trinca: empuxo horizontal na primeira fatia */
    F.Mext=0;
    if(S.trinca&&M.trinca.agua>0){
      const hw=M.trinca.agua*(S.trinca.topo-S.trinca.fundo), Fw=0.5*M.gw*hw*hw;
      F.Hd[0]+=Fw; F.MW[0]+=-(S.trinca.fundo+hw/3-zo)*Fw; F.Ph[0]+=Fw;
    }
    F.hmax=hmax; F.linear=linear; F.L=L;
    return F;
  }

  /* ------------------------------ equilíbrio ------------------------------ */
  /* Uma passada pelas fatias com F e λ dados: N e E de cada fatia pelo equilíbrio vertical
     e horizontal. Guarda em G os dois fatores de segurança que essa passada implica. */
  function marcha(G,F,lam){
    const n=G.n, f=G.f, E=G.E, N=G.N, gs=G.sen, gc=G.cos, gt=G.t, gcc=G.c, gl=G.l, gU=G.U, gV=G.Vd, gH=G.Hd, gaS=G.aS, gMW=G.MW, gfN=G.fN;
    let El=0, rm=0, dm=0, rf=0, df=0, denMin=Infinity;
    E[0]=0;
    for(let i=0;i<n;i++){
      const sen=gs[i], cos=gc[i], t=gt[i], cl=gcc[i]*gl[i], U=gU[i], H=gH[i], tf=t/F, cF=(cl-U*t)/F,
        A=cos+tf*sen, B=sen-tf*cos, lr=lam*f[i+1], den=A+lr*B;
      if(den<denMin) denMin=den;
      if(!(den>1e-6)){ G.Fm=NaN; G.Ff=NaN; G.den=den; return false; }
      const Ni=(gV[i]-cF*sen+lam*f[i]*El-lr*(El-cF*cos+H))/den,
        Er=El+Ni*B-cF*cos+H, s=cl+(Ni-U)*t;
      N[i]=Ni; E[i+1]=Er; El=Er;
      rm-=s*gaS[i]; dm+=gMW[i]+Ni*gfN[i];                    /* Σ(MW + N·fN + S·aS) = 0, S = s/F */
      rf+=s*cos; df+=Ni*sen+H;
    }
    G.den=denMin;
    G.Fm=dm>0?rm/dm:NaN;
    G.Ff=df>0?rf/df:NaN;
    return true;
  }
  /* Ponto fixo F = Φ(F), acelerado pela secante. tipo 'm' fecha momentos; 'f', forças. */
  function resolve(G,lam,tipo,F0){
    let F=F0>0?F0:1.2, Fa=NaN, ha=NaN;
    for(let it=0;it<120;it++){
      if(!marcha(G,F,lam)) return NaN;
      const Fn=tipo==='m'?G.Fm:G.Ff;
      if(!(Fn>0)||!Number.isFinite(Fn)) return NaN;
      const h=Fn-F;
      if(Math.abs(h)<=TOL*Math.max(1,F)) return Fn;
      let prox=Fn;
      if(ha===ha&&Math.abs(h-ha)>1e-15){
        const Fs=F-h*(F-Fa)/(h-ha);
        if(Fs>0.3*Math.min(F,Fn)&&Fs<3*Math.max(F,Fn)) prox=Fs;
      }
      Fa=F; ha=h; F=prox;
      if(!(F>1e-4)) F=1e-4;
    }
    return NaN;
  }
  /* Fm(λ) = Ff(λ): Spencer (f = 1) e Morgenstern–Price (f = meia-senoide). */
  function rigoroso(G,F0){
    const D=lam=>{ const a=resolve(G,lam,'m',F0), b=resolve(G,lam,'f',a>0?a:F0); return {a, b, d:a-b}; };
    let l0=0, r0=D(l0);
    if(!(r0.a>0)||!(r0.b>0)) return null;
    let l1=0.35, r1=D(l1);
    for(let k=0;k<6&&!(r1.d===r1.d);k++){ l1*=0.5; r1=D(l1); }
    if(!(r1.d===r1.d)) return null;
    for(let it=0;it<60;it++){
      if(Math.abs(r1.d)<=1e-7*Math.max(1,r1.a)) return {F:(r1.a+r1.b)/2, lam:l1};
      const dd=r1.d-r0.d;
      let l2=Math.abs(dd)>1e-14?l1-r1.d*(l1-l0)/dd:l1+0.1;
      if(!(Math.abs(l2-l1)<1.5)) l2=l1+Math.sign(l2-l1)*1.5;
      let r2=D(l2);
      for(let k=0;k<8&&!(r2.d===r2.d);k++){ l2=(l1+l2)/2; r2=D(l2); }   /* recua para dentro da região que converge */
      if(!(r2.d===r2.d)) return null;
      l0=l1; r0=r1; l1=l2; r1=r2;
      if(Math.abs(l1-l0)<1e-10) return {F:(r1.a+r1.b)/2, lam:l1};
    }
    return null;
  }
  function ordinario(G){
    let r=0, d=0;
    for(let i=0;i<G.n;i++){
      const Ni=G.Vd[i]*G.cos[i]-G.Hd[i]*G.sen[i];
      r-=(G.c[i]*G.l[i]+(Ni-G.U[i])*G.t[i])*G.aS[i]; d+=G.MW[i]+Ni*G.fN[i];
    }
    return d>0&&r>0?r/d:NaN;
  }
  /* Fator de correção de Janbu (f0), pela relação flecha/corda da superfície. */
  function f0Janbu(G){
    const n=G.n, ax=G.xl[0], az=G.zbl[0], bx=G.xr[n-1], bz=G.zbr[n-1], L=Math.hypot(bx-ax,bz-az);
    let d=0, soC=true, soPhi=true;
    for(let i=0;i<n;i++){
      const q=((bx-ax)*(az-G.zb[i])-(ax-G.xb[i])*(bz-az))/L; if(q>d) d=q;
      if(G.t[i]>1e-9) soC=false; if(G.c[i]>1e-9) soPhi=false;
    }
    const b1=soC?0.69:soPhi?0.31:0.5, r=d/L;
    return 1+b1*(r-1.4*r*r);
  }
  /* Resistência não linear: atualiza c e tan φ de cada base com a tensão normal efetiva
     da solução corrente e repete até o fator de segurança parar de mudar. */
  function comResistencia(M,G,calc){
    let r=calc();
    if(G.linear) return r;
    const tol=G.rapido?2e-5:1e-7, max=G.rapido?10:40;
    let dAnt=0, w=1;
    for(let it=0;it<max;it++){
      const Fa=r&&r.F;
      if(!(Fa>0)) return r;
      for(let i=0;i<G.n;i++){
        const m=M.mats[G.mat[i]];
        if(m.linear) continue;
        const q=resistencia(m,Math.max(0,(G.N[i]-G.U[i])/G.l[i]),G.zb[i]);
        G.c[i]+=w*(q.c-G.c[i]); G.t[i]+=w*(q.t-G.t[i]);
      }
      r=calc();
      if(!r) return r;
      const d=r.F-Fa;
      if(Math.abs(d)<tol*Math.max(1,Fa)) return r;
      if(d*dAnt<0) w=Math.max(0.3,w*0.6);                       /* oscilou: amortece */
      dAnt=d;
    }
    return r;
  }
  /* Um método numa superfície (fatias já montadas). Devolve {F, lam} ou null. */
  function calcula(M,G,metodo,F0){
    G.N=G.N||new Float64Array(G.n);
    const circular=G.sup.tipo==='circulo';
    const um=()=>{
      if(metodo==='bishop'){ const F=resolve(G,0,'m',F0); return F>0?{F, lam:0}:null; }
      if(metodo==='janbu'||metodo==='janbuC'){ const F=resolve(G,0,'f',F0); return F>0?{F:metodo==='janbuC'?F*f0Janbu(G):F, lam:0, f0:f0Janbu(G)}:null; }
      if(metodo==='ordinario'){
        if(!circular) return null;
        const F=ordinario(G);
        if(!(F>0)) return null;
        for(let i=0;i<G.n;i++) G.N[i]=G.Vd[i]*G.cos[i]-G.Hd[i]*G.sen[i];
        return {F, lam:0};
      }
      const g0=F0>0?F0:resolve(G,0,'m',1.2);
      return rigoroso(G,g0>0?g0:1.2);
    };
    if(metodo==='spencer'){ if(G.fx!=='const'){ G.fx='const'; for(let j=0;j<=G.n;j++) G.f[j]=1; } }
    else if(metodo==='mp'){ if(G.fx!=='seno'){ G.fx='seno'; for(let j=0;j<=G.n;j++) G.f[j]=Math.sin(Math.PI*(G.xs[j]-G.xi)/G.L); } }
    return comResistencia(M,G,um);
  }

  /* ------------------------------ superfícies: entrada e saída ------------------------------ */
  function interna(M,sup){
    if(!sup) return null;
    if(sup.z) return sup;                                    /* já é interna */
    let S;
    if(sup.tipo==='circulo') S=arco(M,M.esp?-sup.xc:+sup.xc,+sup.zc,+sup.r);
    else {
      let P=(sup.pts||[]).map(p=>[+p[0],+p[1]]);
      if(M.esp) P=P.map(p=>[-p[0],p[1]]);
      if(P.length>1&&P[0][0]>P[P.length-1][0]) P.reverse();
      S=poligonal(M,P);
    }
    return S&&comTrinca(M,S);
  }
  function externa(M,S){
    const sx=M.esp?-1:1;
    if(S.tipo==='circulo') return {tipo:'circulo', xc:sx*S.xc, zc:S.zc, r:S.r, xa:sx*S.xa, xb:sx*S.xb, entrada:sx*S.xa, saida:sx*S.xb};
    return {tipo:'poli', pts:S.pts.map(p=>[sx*p[0],p[1]]), entrada:sx*S.xa, saida:sx*S.xb};
  }
  const METODOS=['ordinario','bishop','janbu','janbuC','spencer','mp'];
  const NOMES={ordinario:'Ordinário (Fellenius)', bishop:'Bishop simplificado', janbu:'Janbu simplificado', janbuC:'Janbu corrigido', spencer:'Spencer', mp:'Morgenstern–Price'};

  /* Análise completa de UMA superfície: todos os métodos, fatias, forças, linha de empuxo e
     as curvas Fm(λ) e Ff(λ). */
  function analisa(M,sup,op){
    op=op||{};
    const S=interna(M,sup);
    if(!S) return {ok:false, motivo:'A superfície não corta o terreno.'};
    const n=op.fatias||100, principal=op.metodo||'mp', sx=M.esp?-1:1;
    const G=fatias(M,S,n,true,'seno');
    if(!G) return {ok:false, motivo:'A superfície sai do terreno no meio do caminho.'};
    G.fx='seno';
    const F={}, lam={}, avisos=[];
    let f0=1;
    for(const m of op.metodos||METODOS){
      if(m===principal) continue;
      const r=calcula(M,G,m,F.bishop);
      if(r){ F[m]=r.F; lam[m]=r.lam; if(r.f0) f0=r.f0; }
    }
    const r=calcula(M,G,principal,F.bishop);
    if(r){ F[principal]=r.F; lam[principal]=r.lam; if(r.f0) f0=r.f0; }
    if(!r) return {ok:false, motivo:'O método '+NOMES[principal]+' não convergiu nesta superfície.', F, sup:externa(M,S)};
    /* fecha a solução do método principal para ler as forças */
    const Fp=principal==='janbuC'?r.F/f0:r.F, lp=r.lam||0;
    if(principal!=='ordinario') marcha(G,Fp,lp);
    const fat=[], zo=S.centro[1];
    let tracao=0, eNeg=0, zL=null, resid={v:0,h:0};
    for(let i=0;i<G.n;i++){
      const Ni=G.N[i], s=G.c[i]*G.l[i]+(Ni-G.U[i])*G.t[i], Sm=s/Fp,
        El=principal==='ordinario'?0:G.E[i], Er=principal==='ordinario'?0:G.E[i+1],
        Xl=lp*G.f[i]*El, Xr=lp*G.f[i+1]*Er;
      if(Ni-G.U[i]<-1e-6) tracao++;
      if(Er<-1e-6&&i<G.n-1) eNeg++;
      /* linha de empuxo: momentos da fatia em torno do meio da base */
      let zR=null;
      if(principal!=='ordinario'&&Math.abs(Er)>1e-6&&i<G.n-1){
        const zm=G.zb[i], xm=G.xb[i], zg=(G.zgl[i]+G.zgr[i])/2;
        const num=(zL===null?0:(zL-zm)*El)-Xl*G.b[i]/2-Xr*G.b[i]/2+(G.xw[i]-xm)*G.W[i]*(1+M.kv)+(G.zc[i]-zm)*M.kh*G.W[i]+(zg-zm)*G.Ph[i];
        zR=zm+num/Er;
      }
      resid.v=Math.max(resid.v,Math.abs(Ni*G.cos[i]+Sm*G.sen[i]-G.Vd[i]-Xl+Xr));
      resid.h=Math.max(resid.h,Math.abs(El-Er+Ni*G.sen[i]-Sm*G.cos[i]+G.Hd[i]));
      const mt=M.mats[G.mat[i]];
      fat.push({xl:sx*G.xl[i], xr:sx*G.xr[i], b:G.b[i], zgl:G.zgl[i], zgr:G.zgr[i], zbl:G.zbl[i], zbr:G.zbr[i],
        alfa:Math.asin(G.sen[i])/RAD, l:G.l[i], W:G.W[i], Pv:G.Pv[i], Hd:G.Hd[i], u:G.u[i], U:G.U[i], N:Ni, S:Sm,
        sn:(Ni-G.U[i])/G.l[i], tauR:s/G.l[i], tauM:Sm/G.l[i], El, Er, Xl, Xr, zEl:zL, zEr:zR,
        mat:G.mat[i], nome:mt.nome, c:G.c[i], phi:Math.atan(G.t[i])/RAD, xm:sx*G.xb[i], zm:G.zb[i], zc:G.zc[i], fl:G.f[i], fr:G.f[i+1]});
      zL=zR;
    }
    if(tracao) avisos.push(tracao+' fatia(s) com tensão normal efetiva negativa (tração) na base');
    if(eNeg) avisos.push(eNeg+' face(s) entre fatias em tração');
    if(G.den<0.2) avisos.push('fatia com mα baixo ('+G.den.toFixed(2)+'): base muito inclinada contra o movimento');
    /* curvas Fm(λ) e Ff(λ) do gráfico clássico do GLE */
    let curvas=null;
    if(op.curvas!==false){
      const fx=principal==='spencer'?'const':'seno';
      if(G.fx!==fx){ G.fx=fx; for(let j=0;j<=G.n;j++) G.f[j]=fx==='const'?1:Math.sin(Math.PI*(G.xs[j]-G.xi)/G.L); }
      const ls=[], fm=[], ff=[], lc=lam[principal]||lam.mp||lam.spencer||0,
        la=lc<0?Math.min(-0.6,1.8*lc):Math.min(0,-0.15*Math.max(0.6,1.8*lc)), lb=lc<0?0.15*Math.max(0.6,-1.8*lc):Math.max(0.6,1.8*lc);
      for(let k=0;k<=24;k++){
        const l=la+(lb-la)*k/24;
        const a=resolve(G,l,'m',F.bishop), b=resolve(G,l,'f',a>0?a:F.bishop);
        ls.push(l); fm.push(a>0?a:null); ff.push(b>0?b:null);
      }
      curvas={lam:ls, Fm:fm, Ff:ff, funcao:fx};
      if(principal!=='ordinario') marcha(G,Fp,lp);
    }
    let area=0, peso=0;
    for(let i=0;i<G.n;i++){ area+=((G.zgl[i]-G.zbl[i])+(G.zgr[i]-G.zbr[i]))/2*G.b[i]; peso+=G.W[i]; }
    return {ok:true, metodo:principal, FS:F[principal], F, lam, f0, fatias:fat, curvas, avisos, sup:externa(M,S),
      centro:[sx*S.centro[0],zo], area, peso, profundidade:G.hmax, residuo:resid, n:G.n,
      trinca:S.trinca?{x:sx*S.trinca.x, topo:S.trinca.topo, fundo:S.trinca.fundo}:null};
  }
  /* Só o fator de segurança de um método (caminho rápido da busca). */
  function fs(M,S,metodo,n,preciso,rapido){
    const G=fatias(M,S,n,!!preciso,metodo==='spencer'?'const':'seno');
    if(!G) return NaN;
    G.fx=metodo==='spencer'?'const':'seno'; G.rapido=!!rapido;
    if(G.hmax<(M._profMin||0)) return NaN;
    const r=calcula(M,G,metodo,0);
    if(!r||!(r.F>0)) return NaN;
    if(G.den<0.05) return NaN;
    return r.F;
  }

  /* ------------------------------ busca da superfície crítica ------------------------------ */
  /* Douglas–Peucker: fica só com os vértices que mudam a linha além da tolerância. */
  function simplifica(P,tol){
    if(P.length<3) return P.slice();
    const fica=new Uint8Array(P.length); fica[0]=fica[P.length-1]=1;
    const pilha=[[0,P.length-1]];
    while(pilha.length){
      const par=pilha.pop(), a=par[0], b=par[1], ax=P[a][0], az=P[a][1], dx=P[b][0]-ax, dz=P[b][1]-az, L=Math.hypot(dx,dz)||1;
      let dm=0, im=-1;
      for(let i=a+1;i<b;i++){ const d=Math.abs(dx*(P[i][1]-az)-dz*(P[i][0]-ax))/L; if(d>dm){ dm=d; im=i; } }
      if(dm>tol){ fica[im]=1; pilha.push([a,im],[im,b]); }
    }
    return P.filter((p,i)=>fica[i]);
  }
  /* Cristas (o terreno passa a descer mais) e pés (passa a descer menos) do terreno, sem o
     ruído do levantamento: são onde as rupturas costumam entrar e sair. */
  function quebras(M){
    const P=simplifica(M.terreno,Math.max(0.15,(M.zmax-M.zmin)/150)), out=[];
    for(let i=1;i<P.length-1;i++){
      const antes=Math.atan2(P[i-1][1]-P[i][1],P[i][0]-P[i-1][0]), depois=Math.atan2(P[i][1]-P[i+1][1],P[i+1][0]-P[i][0]), d=(depois-antes)/RAD;
      if(d>10) out.push({x:P[i][0], z:P[i][1], tipo:'crista'});
      else if(d<-10) out.push({x:P[i][0], z:P[i][1], tipo:'pe'});
    }
    return out;
  }
  /* Janelas de entrada e saída para cada par crista–pé (uma bancada, várias, o talude todo).
     Entradas da crista para trás; saídas no pé e um pouco antes e depois dele. Com muitas
     bancadas ficam todas as de uma bancada só e, das demais, as mais altas. */
  function janelas(M,E,X,hmin){
    const Q=quebras(M), cristas=Q.filter(q=>q.tipo==='crista'), vizinhas=[], outras=[];
    for(const T of Q){
      if(T.tipo!=='pe') continue;
      const acima=cristas.filter(c=>c.x<T.x-1e-6&&c.z-T.z>=hmin).sort((a,b)=>b.x-a.x);
      acima.forEach((C,k)=>{
        const h=C.z-T.z, w=T.x-C.x;
        const e=[C.x-1.2*h,C.x-0.8*h,C.x-0.5*h,C.x-0.27*h,C.x-0.1*h,C.x,C.x+0.18*w,C.x+0.36*w].filter(x=>x>=E[0]-1e-9&&x<=E[1]+1e-9&&x>=M.x0&&x<=M.x1);
        const x=[T.x-0.3*w,T.x-0.12*w,T.x,T.x+0.04*h,T.x+0.2*h,T.x+0.5*h].filter(v=>v>=X[0]-1e-9&&v<=X[1]+1e-9&&v>=M.x0&&v<=M.x1);
        if(e.length&&x.length) (k===0?vizinhas:outras).push({e, x, h, nr:7});
      });
    }
    outras.sort((a,b)=>b.h-a.h);
    return vizinhas.concat(outras).slice(0,Math.max(36,vizinhas.length));
  }

  function nelderMead(f,x0,passo,maxIt,tol){
    const n=x0.length, P=[x0.slice()], V=[f(x0)];
    for(let i=0;i<n;i++){ const p=x0.slice(); p[i]+=passo[i]; P.push(p); V.push(f(p)); }
    let aval=n+1;
    for(let it=0;it<maxIt;it++){
      const ord=V.map((v,i)=>i).sort((a,b)=>V[a]-V[b]), b=ord[0], w=ord[n], sw=ord[n-1];
      if(Number.isFinite(V[w])&&Math.abs(V[w]-V[b])<tol) break;
      const c=new Array(n).fill(0);
      for(const i of ord.slice(0,n)) for(let k=0;k<n;k++) c[k]+=P[i][k]/n;
      const em=t=>c.map((ck,k)=>ck+t*(P[w][k]-ck));
      const xr=em(-1), fr=f(xr); aval++;
      if(fr<V[b]){ const xe=em(-2), fe=f(xe); aval++; if(fe<fr){ P[w]=xe; V[w]=fe; } else { P[w]=xr; V[w]=fr; } }
      else if(fr<V[sw]){ P[w]=xr; V[w]=fr; }
      else {
        const xk=em(fr<V[w]?-0.5:0.5), fk=f(xk); aval++;
        if(fk<Math.min(fr,V[w])){ P[w]=xk; V[w]=fk; }
        else for(const i of ord.slice(1)){ P[i]=P[i].map((v,k)=>P[b][k]+0.5*(v-P[b][k])); V[i]=f(P[i]); aval++; }
      }
    }
    let b=0; for(let i=1;i<=n;i++) if(V[i]<V[b]) b=i;
    return {x:P[b], f:V[b], aval};
  }
  /* Busca por entrada e saída (círculos): varre pares de pontos do terreno e flechas, guarda
     todas as tentativas (mapa de segurança) e refina as melhores com o método principal. */
  function busca(M,op){
    op=op||{};
    const sx=M.esp?-1:1, metodo=op.metodo||'mp', n=op.fatias||40, ne=op.ne||22, nx=op.nx||22, nr=op.nr||10;
    const faixa=(r,pad)=>{ if(!r||!(r.length===2)) return pad; const a=sx*r[0], b=sx*r[1]; return [Math.max(M.x0,Math.min(a,b)), Math.min(M.x1,Math.max(a,b))]; };
    const E=faixa(op.entrada,[M.x0,M.x1]), X=faixa(op.saida,[M.x0,M.x1]);
    const H=M.zmax-M.zmin, hmin=op.alturaMin!=null?+op.alturaMin:0.04*H;
    M._profMin=op.profMin!=null?+op.profMin:Math.max(0.25,0.01*H);
    const t0=Date.now(), tent=[];
    let validas=0, total=0, melhor=null;
    const triagem=op.triagem||(metodo==='ordinario'?'ordinario':'bishop');
    const prova=(xe,xs,nrad)=>{
      if(!(xs>xe+1e-3)) return;
      const h=lerp(M.terreno,xe)-lerp(M.terreno,xs);
      if(!(h>=hmin)) return;
      for(let k=0;k<nrad;k++){
        total++;
        const s=0.04+0.46*(k+0.5)/nrad, S=arcoES(M,xe,xs,s);
        if(!S) continue;
        const F=fs(M,comTrinca(M,S),triagem,24,true,true);
        if(!(F>0)) continue;
        validas++;
        const t={xe, xs, s, xc:S.xc, zc:S.zc, r:S.r, F, h};
        tent.push(t);
        if(!melhor||F<melhor.F) melhor=t;
      }
    };
    /* malha geral: pega as rupturas grandes (inter-rampa e talude geral) */
    for(let i=0;i<ne;i++){
      const xe=E[0]+(E[1]-E[0])*(ne>1?i/(ne-1):0.5);
      for(let j=0;j<nx;j++) prova(xe,X[0]+(X[1]-X[0])*(nx>1?j/(nx-1):0.5),nr);
    }
    /* janelas locais: em cada pé, com as cristas logo acima. A malha geral tem passo de 1/21
       da seção e pulava a ruptura de bancada conforme onde os pontos caíam. */
    const locais=op.janelas===false?[]:janelas(M,E,X,hmin);
    for(const J of locais) for(const xe of J.e) for(const xs of J.x) prova(xe,xs,J.nr);
    if(!melhor){ M._profMin=0; return {ok:false, motivo:'Nenhuma superfície válida nas faixas de entrada e saída.', total, validas:0}; }
    /* candidatas distintas: a melhor de cada par vizinho de entrada/saída */
    /* candidatas distintas: a melhor de cada vizinhança (a vizinhança acompanha o tamanho da
       superfície, para a bancada de baixo não esconder a de cima) */
    const ord=tent.slice().sort((a,b)=>a.F-b.F), cand=[], dxE=(E[1]-E[0])/Math.max(1,ne-1)*1.5+1e-9, dxX=(X[1]-X[0])/Math.max(1,nx-1)*1.5+1e-9;
    const perto=(c,t)=>{ const d=Math.min(dxE,dxX,0.35*Math.min(c.xs-c.xe,t.xs-t.xe)); return Math.abs(c.xe-t.xe)<=d&&Math.abs(c.xs-t.xs)<=d; };
    const passoDe=t=>{ const d=Math.min(dxE/3,dxX/3,0.15*(t.xs-t.xe)); return [d,d,0.03]; };
    for(const t of ord){
      if(cand.length>=(op.candidatas||6)) break;
      if(cand.some(c=>perto(c,t))) continue;
      cand.push(t);
    }
    const alvo=p=>{
      if(!(p[2]>0.01&&p[2]<=0.5)||p[0]<E[0]-1e-9||p[0]>E[1]+1e-9||p[1]<X[0]-1e-9||p[1]>X[1]+1e-9) return Infinity;
      if(!(lerp(M.terreno,p[0])-lerp(M.terreno,p[1])>=hmin)) return Infinity;
      const S=arcoES(M,p[0],p[1],p[2]);
      if(!S) return Infinity;
      const F=fs(M,comTrinca(M,S),metodo,n,true,true);
      return F>0?F:Infinity;
    };
    let otimo=null, aval=0;
    const refinos=[];
    for(const c of cand){
      const r=nelderMead(alvo,[c.xe,c.xs,c.s],passoDe(c),op.refino||160,1e-7);
      aval+=r.aval;
      if(Number.isFinite(r.f)){ refinos.push(r); if(!otimo||r.f<otimo.f) otimo=r; }
    }
    let S=otimo&&arcoES(M,otimo.x[0],otimo.x[1],otimo.x[2]);
    if(!S) S=arcoES(M,melhor.xe,melhor.xs,melhor.s);
    /* comparação final entre candidatas com o mesmo número de fatias da análise final */
    const nFinal=op.fatiasFinal||Math.max(n,100), exato=Sx=>{ const F=fs(M,comTrinca(M,Sx),metodo,nFinal,true,false); return F>0?F:Infinity; };
    let fOtimo=exato(S);
    /* a ruptura crítica de cada porte: local (até 1/3 do desnível da seção), intermediária e
       global (mais de 2/3) — bancada, inter-rampa e talude geral, na linguagem de mina */
    const Hr=Math.max(1e-9,M.zmax-M.zmin), porte=[];
    const desnivel=p=>lerp(M.terreno,p[0])-lerp(M.terreno,p[1]);
    for(const c of [['local',0,1/3],['intermediaria',1/3,2/3],['global',2/3,Infinity]]){
      const dentro=p=>{ const q=desnivel(p)/Hr; return q>=c[1]&&q<c[2]; };
      let m=null;                                               /* a melhor da classe: {x, S, F} */
      const tenta=x=>{ const Sx=arcoES(M,x[0],x[1],x[2]), Fx=Sx?exato(Sx):Infinity; if(Number.isFinite(Fx)&&(!m||Fx<m.F)) m={x, S:Sx, F:Fx}; };
      let b=null;
      for(const t of tent){ const q=t.h/Hr; if(q>=c[1]&&q<c[2]&&(!b||t.F<b.F)) b=t; }
      if(b){
        const r=nelderMead(p=>dentro(p)?alvo(p):Infinity,[b.xe,b.xs,b.s],passoDe(b),op.refinoPorte||70,1e-6);
        aval+=r.aval;
        if(Number.isFinite(r.f)) tenta(r.x);
      }
      /* os refinos das candidatas gerais também concorrem na classe em que caíram: sem isso a
         crítica podia sair menor que o valor informado para o porte dela */
      const rc=refinos.filter(r=>dentro(r.x)).sort((p,q)=>p.f-q.f)[0];
      if(rc) tenta(rc.x);
      if(!m) continue;
      porte.push({classe:c[0], FS:m.F, altura:desnivel(m.x), sup:externa(M,m.S)});
      if(m.F<fOtimo){ fOtimo=m.F; S=m.S; }                      /* a triagem por Bishop pode ordenar diferente do método principal */
    }
    M._profMin=0;
    const res=analisa(M,comTrinca(M,S),{metodo, fatias:nFinal, metodos:op.metodos, curvas:op.curvas});
    /* tentativas em coordenadas da seção */
    const T=new Float32Array(tent.length*7);
    tent.forEach((t,i)=>{ T[7*i]=sx*t.xe; T[7*i+1]=sx*t.xs; T[7*i+2]=sx*t.xc; T[7*i+3]=t.zc; T[7*i+4]=t.r; T[7*i+5]=t.F; T[7*i+6]=t.h; });
    return {ok:res.ok, critica:res, tentativas:T, total, validas, avaliacoes:aval, ms:Date.now()-t0, triagem, porte, relevo:Hr,
      FSmin:res.ok?res.FS:melhor.F, faixas:{entrada:[sx*E[0],sx*E[1]].sort((a,b)=>a-b), saida:[sx*X[0],sx*X[1]].sort((a,b)=>a-b)}};
  }

  /* ------------------------------ otimização não circular ------------------------------ */
  /* Parte de uma superfície (em geral o círculo crítico), troca-a por uma poligonal e move os
     vértices enquanto o fator de segurança cair. Mantém a forma cinematicamente admissível:
     sem curvatura reversa maior que 5° e com inclinações da base entre −50° e 88°. */
  function otimiza(M,sup,op){
    op=op||{};
    const S0=interna(M,sup), metodo=op.metodo||'mp', n=op.fatias||30;
    if(!S0) return {ok:false, motivo:'Superfície inicial inválida.'};
    const m0=op.segmentos||6, L=S0.xb-S0.xa;
    let P=[];
    for(let j=0;j<=m0;j++){ const x=S0.xa+L*j/m0; P.push([x,j===0||j===m0?lerp(M.terreno,x):S0.z(x)]); }
    const aMin=Math.tan(-50*RAD), aMax=Math.tan(88*RAD), rev=Math.sin(5*RAD);
    const valido=Q=>{
      for(let j=0;j<Q.length-1;j++){
        const dx=Q[j+1][0]-Q[j][0], q=(Q[j][1]-Q[j+1][1])/dx;
        if(!(dx>1e-4*L)||q<aMin||q>aMax) return false;
        if(j>0){
          const ax=Q[j][0]-Q[j-1][0], az=Q[j][1]-Q[j-1][1], bz=Q[j+1][1]-Q[j][1];
          if((ax*bz-az*dx)/(Math.hypot(ax,az)*Math.hypot(dx,bz))<-rev) return false;
        }
        if(j>0&&Q[j][1]>lerp(M.terreno,Q[j][0])-1e-3) return false;
        if(j>0&&Q[j][1]<piso(M,Q[j][0])-1e-9) return false;
      }
      return true;
    };
    const val=Q=>{ if(!valido(Q)) return Infinity; const S=poligonal(M,Q); if(!S) return Infinity; const F=fs(M,comTrinca(M,S),metodo,n,true,true); return F>0?F:Infinity; };
    M._profMin=0;
    let F=val(P), aval=1, passo=0.06*L;
    const F0=F, tol=(op.tolerancia||0.002)*L, maxAval=op.maxAval||4000;
    if(!Number.isFinite(F)){ M._profMin=0; return {ok:false, motivo:'A superfície inicial não tem solução pelo método '+NOMES[metodo]+'.'}; }
    let subdiv=0;
    while(aval<maxAval){
      let melhorou=false;
      for(let j=0;j<P.length;j++){
        const pontas=j===0||j===P.length-1;
        const mov=pontas?[[passo,0],[-passo,0]]:[[0,-passo],[0,passo],[passo,0],[-passo,0]];
        for(const d of mov){
          const Q=P.map(p=>p.slice());
          Q[j][0]+=d[0]; Q[j][1]+=d[1];
          if(pontas){ if(Q[j][0]<M.x0||Q[j][0]>M.x1) continue; Q[j][1]=lerp(M.terreno,Q[j][0]); }
          const Fq=val(Q); aval++;
          if(Fq<F-1e-8){ P=Q; F=Fq; melhorou=true; break; }
        }
      }
      if(melhorou) continue;
      if(passo>tol){ passo*=0.5; continue; }
      if(subdiv<(op.subdivisoes==null?1:op.subdivisoes)&&P.length<=13){
        const Q=[P[0]];
        for(let j=1;j<P.length;j++){ Q.push([(P[j-1][0]+P[j][0])/2,(P[j-1][1]+P[j][1])/2]); Q.push(P[j]); }
        P=Q; subdiv++; passo=0.03*L;
        continue;
      }
      break;
    }
    M._profMin=0;
    const res=analisa(M,poligonal(M,P),{metodo, fatias:op.fatiasFinal||100});
    return {ok:res.ok, critica:res, FS:res.ok?res.FS:F, FSinicial:F0, avaliacoes:aval, vertices:P.length};
  }

  /* Otimiza a partir de várias superfícies (a crítica e as de cada porte) e fica com a menor:
     ruptura pela fundação fraca de uma pilha não nasce do círculo raso que vence a busca. */
  function otimizaVarias(M,sups,op){
    let melhor=null; const todas=[];
    for(const sup of sups){
      if(!sup) continue;
      const r=otimiza(M,sup,op);
      todas.push(r);
      if(r.ok&&(!melhor||r.FS<melhor.FS)) melhor=r;
    }
    return melhor?Object.assign({},melhor,{partidas:todas.length}):{ok:false, motivo:'A otimização não encontrou superfície válida.'};
  }

  /* ------------------------------ estudos ------------------------------ */
  const clona=o=>JSON.parse(JSON.stringify(o));
  /* Fator de segurança de uma definição de modelo, numa superfície fixa ou com nova busca. */
  function avalia(def,sup,op){
    op=op||{};
    const M=modelo(def);
    if(sup&&!op.rebusca){
      const S=interna(M,sup);
      if(!S) return NaN;
      return fs(M,S,op.metodo||'mp',op.fatias||40,true);
    }
    const b=busca(M,Object.assign({curvas:false, ne:14, nx:14, nr:8, candidatas:3, refino:60},op.busca||{}, {metodo:op.metodo||'mp'}));
    return b.ok?b.FSmin:NaN;
  }
  /* Sensibilidade: varia um parâmetro de cada vez. itens = [{mat, chave, de, ate}] ou
     {sismo:'kh', de, ate}; devolve as curvas FS × valor. */
  function sensibilidade(def,sup,itens,op){
    op=op||{};
    const passos=op.passos||9, base=avalia(def,sup,op), out=[];
    for(const it of itens){
      const xs=[], fsv=[];
      for(let k=0;k<passos;k++){
        const v=it.de+(it.ate-it.de)*k/(passos-1), d=clona(def);
        if(it.sismo){ d.sismo=d.sismo||{}; d.sismo[it.sismo]=v; }
        else if(it.agua){ d.agua.linha=d.agua.linha.map(p=>[p[0],p[1]+v]); }
        else d.materiais[it.mat][it.chave]=v;
        xs.push(v); fsv.push(avalia(d,sup,op));
      }
      out.push(Object.assign({},it,{x:xs, FS:fsv}));
    }
    return {base, itens:out};
  }
  function semente(a){ return ()=>{ a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
  /* Monte Carlo sobre a superfície dada. vars = [{mat, chave, dist:'normal'|'lognormal'|'uniforme',
     media, dp, min, max}] */
  function monteCarlo(def,sup,vars,op){
    op=op||{};
    const N=op.n||2000, rnd=semente(op.semente||12345), fsv=new Float64Array(N);
    const normal=()=>{ let u=0, v=0; while(u===0) u=rnd(); v=rnd(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };
    let falhas=0, validos=0, soma=0, soma2=0, min=Infinity, max=-Infinity;
    for(let i=0;i<N;i++){
      const d=clona(def);
      for(const v of vars){
        let x;
        if(v.dist==='uniforme') x=v.min+(v.max-v.min)*rnd();
        else if(v.dist==='lognormal'){ const cv=v.dp/v.media, s=Math.sqrt(Math.log(1+cv*cv)), mu=Math.log(v.media)-s*s/2; x=Math.exp(mu+s*normal()); }
        else x=v.media+v.dp*normal();
        if(v.min!=null&&x<v.min) x=v.min;
        if(v.max!=null&&x>v.max) x=v.max;
        if(v.sismo){ d.sismo=d.sismo||{}; d.sismo[v.sismo]=x; } else d.materiais[v.mat][v.chave]=x;
      }
      const F=avalia(d,sup,op);
      fsv[i]=F;
      if(F>0){ validos++; soma+=F; soma2+=F*F; if(F<min)min=F; if(F>max)max=F; if(F<1) falhas++; }
    }
    const media=soma/validos, dp=Math.sqrt(Math.max(0,soma2/validos-media*media));
    const cv=dp/media, sl=Math.sqrt(Math.log(1+cv*cv));
    return {n:N, validos, media, dp, min, max, pf:falhas/validos, beta:dp>0?(media-1)/dp:Infinity,
      betaLog:sl>0?(Math.log(media)-sl*sl/2)/sl:Infinity, FS:fsv};
  }
  /* Aceleração de escoamento: o kh que leva o fator de segurança a 1. */
  function escoamento(def,sup,op){
    op=op||{};
    const f=kh=>{ const d=clona(def); d.sismo=Object.assign({},d.sismo,{kh}); return avalia(d,sup,op); };
    const F0=f(0);
    if(!(F0>0)) return {ok:false};
    if(F0<=1) return {ok:true, ky:0, F0, curva:[[0,F0]]};
    let lo=0, hi=0.1, Fh=f(hi);
    const curva=[[0,F0],[hi,Fh]];
    while(Fh>1&&hi<3){ lo=hi; hi*=1.6; Fh=f(hi); curva.push([hi,Fh]); if(!(Fh>0)) break; }
    if(!(Fh>0)||Fh>1) return {ok:false, F0, curva};
    while(hi-lo>5e-4){ const m=(lo+hi)/2, Fm=f(m); curva.push([m,Fm]); if(Fm>1) lo=m; else hi=m; }
    curva.sort((a,b)=>a[0]-b[0]);
    return {ok:true, ky:(lo+hi)/2, F0, curva};
  }

  root.GeoMineSlope=Object.freeze({modelo, analisa, busca, otimiza, otimizaVarias, avalia, sensibilidade, monteCarlo, escoamento,
    METODOS, NOMES, GAMA_AGUA,
    /* peças expostas para os testes e para o desenho da seção */
    interno:{lerp, coluna, camadaEm, topoEf, arco, arcoES, poligonal, fatias, calcula, marcha, resolve, rigoroso, ordinario,
      resistencia, material, hoekBrown, hbEm, hbTangente, hbTau, envoltoria, tangenteEnv, fs, interna, externa, nelderMead, quebras, janelas},
    fonte:()=>'('+fabrica.toString()+')(self);'});
  }
  fabrica(root);
})(typeof window!=='undefined'?window:globalThis);
