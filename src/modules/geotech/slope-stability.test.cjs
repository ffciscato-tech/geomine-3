const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context={console};vm.createContext(context);context.window=context;
vm.runInContext(fs.readFileSync(path.join(__dirname,'slope-stability.js'),'utf8'),context);
const G=context.GeoMineSlope,I=G.interno,RAD=Math.PI/180;
const perto=(a,b,tol,msg)=>assert(Math.abs(a-b)<=tol,(msg||'')+' obtido '+a+', esperado '+b+' ± '+tol);
const copia=o=>JSON.parse(JSON.stringify(o));

/* ACADS 1(a) (Giam & Donald, 1989): talude homogêneo de 10 m a 2H:1V. Resposta dos árbitros: 1,00.
   Programas comerciais publicam Bishop 0,987 e Spencer/GLE 0,986 para o mesmo caso. */
const ACADS={terreno:[[20,25],[30,25],[50,35],[70,35]],camadas:[{mat:'s'}],materiais:{s:{nome:'solo',gama:20,c:3,phi:19.6}},base:20};

test('ACADS 1(a): todos os métodos ficam na faixa publicada e o círculo crítico sai pelo pé',()=>{
  const M=G.modelo(ACADS),r={};
  for(const m of ['ordinario','bishop','janbu','spencer','mp'])r[m]=G.busca(M,{metodo:m});
  perto(r.bishop.FSmin,0.987,0.004,'Bishop');perto(r.spencer.FSmin,0.986,0.004,'Spencer');perto(r.mp.FSmin,0.986,0.004,'Morgenstern–Price');
  perto(r.mp.FSmin,1.00,0.02,'árbitros');
  assert(r.janbu.FSmin<r.mp.FSmin&&r.janbu.FSmin>0.92,'Janbu simplificado fica abaixo dos rigorosos');
  assert(r.ordinario.FSmin<r.bishop.FSmin,'Ordinário é conservador');
  perto(r.mp.critica.F.janbuC,r.mp.FSmin,0.012,'Janbu corrigido aproxima o rigoroso');
  const s=r.mp.critica.sup;
  assert.equal(s.tipo,'circulo');perto(s.saida,30,0.3,'saída no pé');assert(s.entrada>50&&s.entrada<54,'entrada na crista: '+s.entrada);
  assert(r.mp.validas>800&&r.mp.total>=r.mp.validas);
  assert.equal(M.sentido,'esq');                                   // a seção desce para a esquerda
});

test('cada fatia fecha o equilíbrio vertical e horizontal, e a solução converge com o número de fatias',()=>{
  const M=G.modelo(ACADS),sup={tipo:'circulo',xc:29.56,zc:53.69,r:28.70};
  for(const metodo of ['bishop','janbu','spencer','mp']){
    const r=G.analisa(M,sup,{metodo,fatias:60,curvas:false});
    assert(r.ok,metodo);
    if(metodo==='spencer'||metodo==='mp'){assert(r.residuo.v<1e-8&&r.residuo.h<1e-8,metodo+' resíduo '+JSON.stringify(r.residuo));perto(r.fatias.at(-1).Er,0,1e-4,'força no pé');}
    else assert(r.residuo.v<1e-8,metodo+' vertical');
  }
  const F=n=>G.analisa(M,sup,{fatias:n,curvas:false}).F.mp,f40=F(40),f160=F(160),f640=F(640);
  assert(Math.abs(f40-f640)<3e-4&&Math.abs(f160-f640)<3e-5,[f40,f160,f640].join(' '));
  // curvas do GLE: Fm e Ff se cruzam no λ da solução
  const r=G.analisa(M,sup,{metodo:'mp',fatias:60});
  assert.equal(r.curvas.lam.length,25);
  const k=r.curvas.lam.findIndex(l=>l>=r.lam.mp);
  assert((r.curvas.Fm[k-1]-r.curvas.Ff[k-1])*(r.curvas.Fm[k]-r.curvas.Ff[k])<=0,'cruzamento em λ');
  perto(r.F.bishop,r.curvas.Fm[r.curvas.lam.findIndex(l=>Math.abs(l)<1e-12)]??r.F.bishop,1e-9,'Fm(0) = Bishop');
});

test('Bishop e Spencer do motor coincidem com as fórmulas clássicas escritas à parte',()=>{
  const M=G.modelo(ACADS),S=I.interna(M,{tipo:'circulo',xc:29.56,zc:53.69,r:28.70}),F=I.fatias(M,S,120,true,'const');
  F.fx='const';
  // Bishop (1955): F = Σ[(c b + (W − u b) tan φ)/mα] / Σ W sen α
  let Fb=1;
  for(let it=0;it<200;it++){let num=0,den=0;for(let i=0;i<F.n;i++){const a=Math.asin(F.sen[i]),ma=Math.cos(a)+Math.sin(a)*F.t[i]/Fb;num+=(F.c[i]*F.b[i]+(F.W[i]-F.u[i]*F.b[i])*F.t[i])/ma;den+=F.W[i]*Math.sin(a);}Fb=num/den;}
  perto(I.calcula(M,F,'bishop',0).F,Fb,3e-5,'Bishop');
  // Spencer (1967): resultante Q de cada fatia; ΣQ = 0 e ΣQ cos(α − θ) = 0
  const Q=(Fs,th)=>{let s1=0,s2=0;for(let i=0;i<F.n;i++){const a=Math.asin(F.sen[i]),q=(F.c[i]*F.b[i]/Math.cos(a)/Fs+F.t[i]/Fs*(F.W[i]*Math.cos(a)-F.u[i]*F.b[i]/Math.cos(a))-F.W[i]*Math.sin(a))/(Math.cos(a-th)*(1+F.t[i]/Fs*Math.tan(a-th)));s1+=q;s2+=q*Math.cos(a-th);}return [s1,s2];};
  const raiz=(f,a,b)=>{let fa=f(a);for(let k=0;k<200;k++){const m=(a+b)/2,fm=f(m);if(fa*fm<=0)b=m;else{a=m;fa=fm;}}return (a+b)/2;};
  const Ff=th=>raiz(Fs=>Q(Fs,th)[0],0.3,5),Fm=th=>raiz(Fs=>Q(Fs,th)[1],0.3,5),th=raiz(t=>Fm(t)-Ff(t),0.01,1.2),sp=I.calcula(M,F,'spencer',0);
  perto(sp.F,Fm(th),2e-5,'Spencer F');perto(Math.atan(sp.lam)/RAD,th/RAD,0.01,'Spencer θ');
});

test('φ = 0: Ordinário, Bishop e Morgenstern–Price dão o valor exato c·R·arco / momento do peso',()=>{
  const d={terreno:[[0,0],[10,0],[20,10],[40,10]],camadas:[{mat:'a'}],materiais:{a:{gama:18,modelo:'su',su:40}}},c={xc:11,zc:16,r:16.5};
  const zg=x=>x<=10?0:x>=20?10:x-10,zb=x=>c.zc-Math.sqrt(c.r*c.r-(x-c.xc)**2),f=x=>zg(x)-zb(x);
  let xa,xb;{let a=-6,b=11;for(let k=0;k<200;k++){const m=(a+b)/2;if(f(m)>0)b=m;else a=m;}xa=(a+b)/2;a=11;b=27.4;for(let k=0;k<200;k++){const m=(a+b)/2;if(f(m)>0)a=m;else b=m;}xb=(a+b)/2;}
  const N=200000;let Mo=0;for(let i=0;i<N;i++){const x=xa+(xb-xa)*(i+.5)/N;Mo+=18*(zg(x)-zb(x))*(x-c.xc)*(xb-xa)/N;}
  const exato=40*c.r*c.r*(Math.asin((xb-c.xc)/c.r)-Math.asin((xa-c.xc)/c.r))/Mo;
  const r=G.analisa(G.modelo(d),{tipo:'circulo',...c},{fatias:400,curvas:false});
  for(const m of ['ordinario','bishop','mp'])perto(r.F[m],exato,3e-5,m);
  // Spencer não fecha aqui: há tração na crista (2c/γ = 4,4 m) — o motor diz isso em vez de inventar um número
  assert.equal(r.F.spencer,undefined);assert(r.avisos.some(a=>/tração/.test(a)));
});

test('talude infinito: coesão e atrito, sismo e ru conferem com as fórmulas fechadas',()=>{
  const beta=30*RAD,Lh=2000,zt=Lh*Math.tan(beta),zg=x=>zt-x*Math.tan(beta),prof=2;
  const d={terreno:[[0,zt],[Lh,0]],camadas:[{mat:'a'}],materiais:{a:{gama:19,c:8,phi:32}},sentido:'dir'};
  const sup={tipo:'poli',pts:[[10,zg(10)],[12,zg(12)-prof],[Lh-22,zg(Lh-22)-prof],[Lh-10,zg(Lh-10)]]};
  const r=G.analisa(G.modelo(d),sup,{fatias:200,curvas:false});
  perto(r.F.mp,8/(19*prof*Math.sin(beta)*Math.cos(beta))+Math.tan(32*RAD)/Math.tan(beta),0.004,'c–φ');
  const d2=copia(d);d2.materiais.a.c=0;d2.sismo={kh:0.12};
  perto(G.analisa(G.modelo(d2),sup,{fatias:200,curvas:false}).F.mp,(Math.cos(beta)-0.12*Math.sin(beta))*Math.tan(32*RAD)/(Math.sin(beta)+0.12*Math.cos(beta)),0.001,'sismo');
  const d3=copia(d);d3.materiais.a.c=0;d3.materiais.a.ru=0.3;
  perto(G.analisa(G.modelo(d3),sup,{fatias:200,curvas:false}).F.mp,(1-0.3/Math.cos(beta)**2)*Math.tan(32*RAD)/Math.tan(beta),0.001,'ru');
});

test('ruptura plana (Hoek & Bray): Janbu, Spencer e Morgenstern–Price dão o valor exato, com e sem sismo',()=>{
  const H=20,bf=60*RAD,psi=35*RAD,xt=10,xc=xt+H/Math.tan(bf);
  const d={terreno:[[0,0],[xt,0],[xc,H],[80,H]],camadas:[{mat:'r'}],materiais:{r:{gama:26,c:25,phi:33}}},sup={tipo:'poli',pts:[[xt,0],[xt+H/Math.tan(psi),H]]};
  const A=H/Math.sin(psi),W=0.5*26*H*H*(1/Math.tan(psi)-1/Math.tan(bf)),ex=(25*A+W*Math.cos(psi)*Math.tan(33*RAD))/(W*Math.sin(psi));
  const r=G.analisa(G.modelo(d),sup,{fatias:80,curvas:false});
  for(const m of ['janbu','spencer','mp'])perto(r.F[m],ex,1e-6,m);
  perto(r.peso,W,1e-6*W,'peso do bloco');perto(r.area,W/26,1e-6*W,'área');
  const d2=copia(d);d2.sismo={kh:0.08};
  perto(G.analisa(G.modelo(d2),sup,{fatias:80,curvas:false}).F.mp,(25*A+(W*Math.cos(psi)-0.08*W*Math.sin(psi))*Math.tan(33*RAD))/(W*Math.sin(psi)+0.08*W*Math.cos(psi)),1e-6,'com kh');
  assert.equal(r.F.ordinario,undefined);                           // Ordinário só vale para círculo
});

test('talude submerso: peso total + água na superfície + poropressão equivale ao peso submerso',()=>{
  const base={terreno:[[0,10],[15,10],[35,0],[60,0]],camadas:[{mat:'a'}],materiais:{a:{gama:19,gamaSat:19,c:6,phi:28}}};
  const sub=copia(base);sub.agua={linha:[[0,14],[60,14]]};
  const flut=copia(base);flut.materiais.a.gama=flut.materiais.a.gamaSat=19-9.81;
  const sup={tipo:'circulo',xc:30,zc:22,r:21},a=G.analisa(G.modelo(sub),sup,{fatias:120,curvas:false}),b=G.analisa(G.modelo(flut),sup,{fatias:120,curvas:false});
  perto(a.F.bishop,b.F.bishop,1e-4,'Bishop');perto(a.F.janbu,b.F.janbu,1e-6,'Janbu');perto(a.F.mp,b.F.mp,1e-3,'Morgenstern–Price');
  assert(a.fatias.every(f=>f.u>0)&&b.fatias.every(f=>f.u===0));
});

test('ábaco de Taylor (φ = 0): a busca acha o círculo crítico teórico',()=>{
  for(const [beta,ns] of [[90,0.261],[75,0.219],[60,0.191],[45,0.181]]){
    const H=10,c=50,g=20,dx=beta===90?0:H/Math.tan(beta*RAD);
    const d={terreno:[[0,H],[40,H],[40+dx,0],[80+dx,0]],camadas:[{mat:'a'}],materiais:{a:{gama:g,modelo:'su',su:c}},base:beta<=53?-200:0};
    const b=G.busca(G.modelo(d),{metodo:'bishop',ne:30,nx:30,nr:12,profMin:0.5,saida:beta<=53?undefined:[40+dx-0.01,40+dx+0.01]});
    assert(b.ok,'β='+beta);perto(c/(b.FSmin*g*H),ns,0.002,'Ns em β='+beta+'°');
  }
});

test('seção espelhada dá o mesmo resultado, com a superfície no lugar espelhado',()=>{
  const esp=copia(ACADS);esp.terreno=esp.terreno.map(p=>[90-p[0],p[1]]).reverse();
  const a=G.busca(G.modelo(ACADS),{metodo:'mp'}),b=G.busca(G.modelo(esp),{metodo:'mp'});
  perto(a.FSmin,b.FSmin,1e-9);perto(a.critica.sup.entrada,90-b.critica.sup.entrada,1e-6);perto(a.critica.sup.xc,90-b.critica.sup.xc,1e-6);
  assert.equal(G.modelo(esp).sentido,'dir');
  // fatias devolvidas nas coordenadas da seção, da crista para o pé
  assert(a.critica.fatias[0].xl>a.critica.fatias.at(-1).xr);assert(b.critica.fatias[0].xl<b.critica.fatias.at(-1).xr);
});

test('água, trinca de tração, sobrecarga e sismo reduzem o fator de segurança',()=>{
  const d={terreno:[[0,20],[30,20],[70,0],[110,0]],camadas:[{mat:'s'}],materiais:{s:{gama:19,gamaSat:20.5,c:15,phi:28}}};
  const fs0=G.busca(G.modelo(d),{metodo:'mp'}).FSmin;
  const na=copia(d);na.agua={linha:[[0,16],[30,15],[70,0],[110,0]]};const fsNa=G.busca(G.modelo(na),{metodo:'mp'});
  const tr=copia(na);tr.trinca={prof:3,agua:1};const fsTr=G.busca(G.modelo(tr),{metodo:'mp'});
  const q=copia(d);q.cargas=[{x1:5,x2:28,q:80}];const sis=copia(d);sis.sismo={kh:0.1};
  perto(fs0,1.665,0.01);assert(fsNa.FSmin<fs0-0.3);assert(fsTr.FSmin<fsNa.FSmin);
  assert(G.busca(G.modelo(q),{metodo:'mp'}).FSmin<fs0-0.05);assert(G.busca(G.modelo(sis),{metodo:'mp'}).FSmin<fs0-0.25);
  // a trinca corta a superfície a 3 m de profundidade e a água empurra a primeira fatia
  perto(fsTr.critica.trinca.topo-fsTr.critica.trinca.fundo,3,1e-6);assert(fsTr.critica.fatias[0].Hd>40);
  assert(fsNa.critica.fatias.some(f=>f.u>50));
  // carga pontual e kv
  const p=copia(d);p.cargas=[{x:25,P:500}];assert(G.busca(G.modelo(p),{metodo:'mp'}).FSmin<fs0);
  const kv=copia(sis);kv.sismo.kv=-0.05;assert(G.busca(G.modelo(kv),{metodo:'mp'}).FSmin!==G.busca(G.modelo(sis),{metodo:'mp'}).FSmin);
});

test('Hoek–Brown: parâmetros de 2002, tangente da envoltória e talude em rocha',()=>{
  const h=I.hoekBrown({sci:50,mi:10,GSI:45,D:0.7});
  perto(h.mb,10*Math.exp(-55/18.2),1e-12);perto(h.s,Math.exp(-55/6.9),1e-15);perto(h.a,0.5+(Math.exp(-3)-Math.exp(-20/3))/6,1e-12);
  const m=I.material({nome:'calcário',gama:26,modelo:'hb',sci:50,mi:10,GSI:45,D:0.7},'r');
  for(const s3 of [0,100,500,2000]){
    const r=I.hbEm(h,s3),t=I.resistencia(m,r.sn,0),num=(I.hbEm(h,s3+1).tau-I.hbEm(h,s3-1).tau)/(I.hbEm(h,s3+1).sn-I.hbEm(h,s3-1).sn);
    perto(t.c+r.sn*t.t,r.tau,2e-4*r.tau,'τ em σ3='+s3);perto(t.t,num,0.01*num,'tan φ em σ3='+s3);
  }
  const d={terreno:[[0,0],[40,0],[100,90],[200,90]],camadas:[{mat:'r'}],materiais:{r:{nome:'Calcário',gama:26,modelo:'hb',sci:50,mi:10,GSI:45,D:0.7}}};
  const b=G.busca(G.modelo(d),{metodo:'mp'});
  assert(b.ok);perto(b.FSmin,1.77,0.03);
  const f=b.critica.fatias,raso=f[2],fundo=f[Math.floor(f.length/2)];
  assert(raso.phi>fundo.phi&&raso.c<fundo.c,'atrito instantâneo cai e coesão sobe com a tensão normal');
  // enrocamento (atrito secante que cai com o log da tensão) e envoltória por pontos
  const leps=I.material({gama:20,modelo:'leps',phi0:45,dphi:7},'e'),a=I.resistencia(leps,100,0),bb=I.resistencia(leps,1000,0);
  perto(a.c+100*a.t,100*Math.tan(45*RAD),0.3);perto(bb.c+1000*bb.t,1000*Math.tan(38*RAD),3);
  const tab=I.material({gama:20,modelo:'tab',tab:[[0,10],[100,80],[400,200]]},'t');
  assert.deepEqual([I.resistencia(tab,50,0),I.resistencia(tab,300,0),I.resistencia(tab,900,0)].map(r=>[+r.c.toFixed(6),+r.t.toFixed(6)]),[[10,0.7],[40,0.4],[40,0.4]]);
  // resistência não drenada crescente com a profundidade
  const su=I.material({gama:17,modelo:'su',su:20,suK:1.5,zRef:100},'a');perto(I.resistencia(su,0,90).c,35,1e-12);
});

test('camada fraca na fundação: a otimização não circular acha a ruptura pela camada e reduz o FS',()=>{
  const d={terreno:[[0,0],[30,0],[90,40],[140,40]],camadas:[{mat:'pilha'},{mat:'fraca',topo:[[0,0],[30,0],[140,0]]},{mat:'fund',topo:[[0,-2],[140,-2]]}],
    materiais:{pilha:{nome:'Estéril',gama:20,c:0,phi:37},fraca:{nome:'Argila mole',gama:17,c:5,phi:14},fund:{nome:'Fundação',gama:19,c:40,phi:32}},base:-25};
  const M=G.modelo(d),b=G.busca(M,{metodo:'mp'});
  assert(b.ok&&b.FSmin>1.02&&b.FSmin<1.12,'círculo: '+b.FSmin);
  assert.deepEqual(Array.from(b.porte,p=>p.classe),['local','intermediaria','global']);
  assert(b.porte.every(p=>p.FS>=b.FSmin-1e-9));assert(b.porte[2].altura>2/3*b.relevo);
  // sem a camada fraca o talude de estéril a 33,7° fica perto do talude infinito: tan 37°/tan 33,7° = 1,13
  const sem=copia(d);sem.materiais.fraca=sem.materiais.fund;
  perto(G.busca(G.modelo(sem),{metodo:'mp'}).FSmin,Math.tan(37*RAD)/(40/60),0.06);
  const o=G.otimizaVarias(M,[b.critica.sup,...b.porte.map(p=>p.sup)],{metodo:'mp'});
  assert(o.ok&&o.FS<b.FSmin-0.08,'otimizada '+o.FS+' × círculo '+b.FSmin);assert.equal(o.critica.sup.tipo,'poli');
  const naFraca=o.critica.fatias.filter(f=>f.nome==='Argila mole').reduce((s,f)=>s+f.l,0),total=o.critica.fatias.reduce((s,f)=>s+f.l,0);
  assert(naFraca>0.2*total,'base na camada fraca: '+naFraca+' de '+total);
  assert(Math.min(...o.critica.sup.pts.map(p=>p[1]))>=-2-1e-6,'não entra na fundação resistente');
  assert(o.critica.residuo.v<1e-7&&o.critica.residuo.h<1e-7);
  // a base da fatia é classificada pelo arco real: 1 mm dentro da fundação já conta, com 24 ou 200 fatias
  const S=I.interna(M,{tipo:'circulo',xc:33.565,zc:11.4865,r:13.4878});
  for(const n of [24,200]){const F=I.fatias(M,S,n,true,'seno');let lf=0;for(let i=0;i<F.n;i++)if(F.mat[i]===2)lf+=F.l[i];perto(lf,0.37,0.03,'fundação com '+n+' fatias');}
});

test('rocha impenetrável e base do modelo limitam a superfície; trecho composto usa o material de cima',()=>{
  const d={terreno:[[0,10],[20,10],[40,0],[80,0]],camadas:[{mat:'s'},{mat:'r',topo:[[0,-3],[80,-3]]}],materiais:{s:{gama:18,modelo:'su',su:25},r:{nome:'Rocha',gama:26,modelo:'rocha'}}};
  const b=G.busca(G.modelo(d),{metodo:'bishop'}),zmin=Math.min(...b.critica.fatias.map(f=>Math.min(f.zbl,f.zbr)));
  assert(b.ok);perto(zmin,-3,1e-6,'a base encosta na rocha');assert(b.critica.fatias.every(f=>f.nome!=='Rocha'));
  const livre=copia(d);livre.camadas.pop();livre.base=-60;
  assert(G.busca(G.modelo(livre),{metodo:'bishop'}).FSmin<b.FSmin-0.02,'sem a rocha o círculo desce e o FS cai');
  const raso=copia(livre);raso.base=-3;perto(G.busca(G.modelo(raso),{metodo:'bishop'}).FSmin,b.FSmin,1e-9,'base do modelo = rocha');
});

test('estudos: sensibilidade, Monte Carlo reprodutível e aceleração de escoamento',()=>{
  const d={terreno:[[0,20],[30,20],[70,0],[110,0]],camadas:[{mat:'s'}],materiais:{s:{gama:19,c:15,phi:28}}},b=G.busca(G.modelo(d),{metodo:'mp'}),sup=b.critica.sup;
  const s=G.sensibilidade(d,sup,[{mat:'s',chave:'c',de:10,ate:20},{mat:'s',chave:'phi',de:24,ate:32},{mat:'s',chave:'gama',de:17,ate:21},{sismo:'kh',de:0,ate:0.2}],{passos:5});
  perto(s.base,b.FSmin,2e-3);perto(s.itens[0].FS[2],s.base,1e-9);
  assert(s.itens[0].FS[0]<s.itens[0].FS[4]&&s.itens[1].FS[0]<s.itens[1].FS[4]&&s.itens[2].FS[0]>s.itens[2].FS[4]&&s.itens[3].FS[0]>s.itens[3].FS[4]);
  const vars=[{mat:'s',chave:'c',dist:'lognormal',media:15,dp:4.5},{mat:'s',chave:'phi',dist:'normal',media:28,dp:2.8}];
  const a=G.monteCarlo(d,sup,vars,{n:600}),c=G.monteCarlo(d,sup,vars,{n:600}),e=G.monteCarlo(d,sup,vars,{n:600,semente:7});
  assert.equal(a.media,c.media);assert.notEqual(a.media,e.media);perto(a.media,s.base,0.03);assert(a.dp>0.12&&a.dp<0.26);
  assert.equal(a.validos,600);assert(a.beta>2.5&&a.pf<0.01&&a.min<a.media&&a.max>a.media);
  const fraco=copia(d);fraco.materiais.s.c=6;const mf=G.monteCarlo(fraco,sup,[{mat:'s',chave:'phi',dist:'normal',media:24,dp:4}],{n:600});
  assert(mf.pf>0.02&&mf.pf<0.9,'probabilidade de ruptura '+mf.pf);
  const ky=G.escoamento(d,sup,{});assert(ky.ok);
  const com=copia(d);com.sismo={kh:ky.ky};perto(G.avalia(com,sup,{}),1,2e-3,'FS no kh de escoamento');
  assert(ky.curva.length>5&&ky.curva.every((p,i,A)=>i===0||p[0]>=A[i-1][0]));
  assert.equal(G.escoamento(fraco,sup,{}).ok,true);
});

test('entradas inválidas são recusadas com motivo',()=>{
  assert.throws(()=>G.modelo({terreno:[[0,0]],camadas:[{mat:'a'}],materiais:{a:{gama:18}}}),/2 pontos/);
  assert.throws(()=>G.modelo({terreno:[[0,0],[10,5]],camadas:[{mat:'x'}],materiais:{}}),/Material sem definição/);
  assert.throws(()=>G.modelo({terreno:[[0,0],[10,5]],camadas:[{mat:'a'}],materiais:{a:{gama:0}}}),/Peso específico/);
  assert.throws(()=>G.modelo({terreno:[[10,0],[0,5]],camadas:[{mat:'a'}],materiais:{a:{gama:18}}}),/ordem crescente/);
  assert.throws(()=>G.modelo({terreno:[[0,0],[10,5]],camadas:[{mat:'a'},{mat:'a'}],materiais:{a:{gama:18}}}),/linha de topo/);
  assert.throws(()=>G.modelo({terreno:[[0,0],[10,5]],camadas:[{mat:'a'}],materiais:{a:{gama:26,modelo:'hb',sci:50}}}),/Hoek–Brown incompleto/);
  const M=G.modelo(ACADS);
  assert.equal(G.analisa(M,{tipo:'circulo',xc:45,zc:80,r:5}).ok,false);                      // círculo no ar
  assert.match(G.analisa(M,{tipo:'circulo',xc:45,zc:80,r:5}).motivo,/não corta o terreno/);
  assert.equal(G.busca(M,{metodo:'mp',entrada:[20,22],saida:[60,70]}).ok,false);             // entrada no pé e saída na crista
  // face vertical no terreno é aceita
  assert(G.busca(G.modelo({terreno:[[0,8],[20,8],[20,0],[50,0]],camadas:[{mat:'a'}],materiais:{a:{gama:20,modelo:'su',su:60}}}),{metodo:'bishop'}).ok);
});

test('talude em bancadas: a ruptura crítica não depende de onde caem os pontos da malha nem do sentido da seção',()=>{
  /* Mesmo talude com a crista mais comprida ou mais curta (desloca tudo em relação à malha de
     entrada e saída) e espelhado. Antes das janelas em cada crista e pé a ruptura de bancada
     era achada num alinhamento e pulada no outro (1,05 × 0,96 numa seção de 3 bancadas). */
  const bancadas=(n,h,ang,berma,crista)=>{ const T=[[0,n*h],[crista,n*h]], dx=h/Math.tan(ang*RAD); let x=crista, z=n*h;
    for(let i=0;i<n;i++){ x+=dx; z-=h; T.push([x,z]); if(i<n-1){ x+=berma; T.push([x,z]); } }
    T.push([x+28,z]); return T; };
  for(const [n,h,ang,berma,c,phi] of [[3,10,60,8,10,30],[5,8,65,6,30,30]]){
    const F=[];
    for(const crista of [30,31.7,36.1]) for(const esp of [false,true]){
      let T=bancadas(n,h,ang,berma,crista);
      if(esp){ const L=T[T.length-1][0]; T=T.map(p=>[L-p[0],p[1]]).reverse(); }
      const b=G.busca(G.modelo({terreno:T,camadas:[{mat:'s'}],materiais:{s:{gama:19,c,phi}}}),{metodo:'mp'});
      assert(b.ok); F.push(b.FSmin);
      perto(Math.min(...b.porte.map(p=>p.FS)),b.FSmin,1e-9,'crítica = menor dos portes');
    }
    assert(Math.max(...F)/Math.min(...F)-1<2e-3,n+' bancadas: FS de '+Math.min(...F).toFixed(4)+' a '+Math.max(...F).toFixed(4));
  }
  /* as quebras do terreno: cristas e pés, sem o ruído do levantamento */
  const ruido=bancadas(3,10,60,8,30).flatMap((p,i,A)=>i?[[ (A[i-1][0]+p[0])/2, (A[i-1][1]+p[1])/2+0.03*(i%2?1:-1) ],p]:[p]);
  const Q=I.quebras(G.modelo({terreno:ruido,camadas:[{mat:'s'}],materiais:{s:{gama:19,c:10,phi:30}}}));
  assert.equal(Q.filter(q=>q.tipo==='crista').length,3); assert.equal(Q.filter(q=>q.tipo==='pe').length,3);
});

test('pilha sem coesão em bancadas: nenhuma classe de porte some da tabela e os valores conferem com o talude infinito',()=>{
  /* Auditoria de 23/11/2026 (pilha de estéril com c′ = 0): o refino de uma classe achatava o arco
     até ele raspar os pés dos bancos; com as fatias da análise final a superfície deixava de valer
     e a classe inteira sumia da tabela — o FS global não aparecia. Coordenadas neutras. */
  const pilha=(n,h,ang,berma)=>{ const T=[[0,100],[40,100]], dx=h/Math.tan(ang*RAD); let x=40, z=100;
    for(let i=0;i<n;i++){ x+=dx; z+=h; T.push([+x.toFixed(3),z]); if(i<n-1){ x+=berma; T.push([+x.toFixed(3),z]); } }
    T.push([+(x+60).toFixed(3),z]); return {T, geral:Math.atan2(n*h,n*dx+(n-1)*berma)}; };
  for(const [n,ang,berma,phi] of [[5,35,4,31],[8,33,5,29]]){
    const {T,geral}=pilha(n,10,ang,berma);
    const b=G.busca(G.modelo({terreno:T,camadas:[{mat:'p'}],materiais:{p:{gama:18,c:0,phi}},base:60}),{metodo:'mp',ne:22,nx:22,nr:10,candidatas:6});
    assert(b.ok);
    assert.equal(b.porte.map(p=>p.classe).join(','),'local,intermediaria,global',n+' bancos: as três classes aparecem');
    const P=Object.fromEntries(b.porte.map(p=>[p.classe,p.FS]));
    /* na face, a casca rasa: tan φ / tan β (o arco finito fica um pouco acima) */
    const face=Math.tan(phi*RAD)/Math.tan(ang*RAD);
    assert(P.local>=face-1e-3&&P.local<=face*1.03,n+' bancos: local '+P.local.toFixed(3)+' × talude infinito '+face.toFixed(3));
    /* no conjunto, o plano pelos pés dos bancos: tan φ / tan (ângulo geral) é o piso */
    const piso=Math.tan(phi*RAD)/Math.tan(geral);
    for(const k of ['intermediaria','global']) assert(P[k]>=piso*0.97&&P[k]<=piso*1.12,n+' bancos: '+k+' '+P[k].toFixed(3)+' × plano geral '+piso.toFixed(3));
    perto(Math.min(...b.porte.map(p=>p.FS)),b.FSmin,1e-9,'crítica = menor dos portes');
  }
});
