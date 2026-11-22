/* GeoMine — GEOMEC: gráficos dos resultados (FS × λ, tensões na base, forças entre fatias,
   diagrama de corpo livre da fatia, sensibilidade, Monte Carlo, sismo, porte, retroanálise). */
(function(root){
  'use strict';
  const GM=root.GeoMineGeomecInterno, fmt=GM.fmt, passo=GM.passo;
  const PALETA=['#2563eb','#dc2626','#16a34a','#d97706','#7c3aed','#0891b2','#be185d','#4d7c0f','#b45309','#475569'];
  GM.PALETA=PALETA;

  /* Gráfico cartesiano simples. cfg = {x:{rotulo,min,max,dec}, y:{…}, series:[{nome,cor,x,y,tipo,
     tracejado,largura,raio}], vmarcas:[{x,rotulo,cor}], hmarcas:[{y,rotulo,cor}], titulo} */
  GM.grafico=(ctx,w,h,cfg,claro)=>{
    const T=GM.tema(!!claro), m={e:52, d:14, c:cfg.titulo?24:12, b:34};
    ctx.save(); ctx.fillStyle=cfg.limpo?T.papel:T.fundo; ctx.fillRect(0,0,w,h);
    let x0=Infinity, x1=-Infinity, y0=Infinity, y1=-Infinity;
    const teto=cfg.y&&cfg.y.teto!=null?cfg.y.teto:Infinity;
    for(const s of cfg.series) for(let i=0;i<s.x.length;i++){
      const x=s.x[i], y=s.y[i];
      if(!Number.isFinite(x)||!Number.isFinite(y)||y>teto) continue;
      if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
    }
    for(const q of cfg.hmarcas||[]) if(Number.isFinite(q.y)){ if(q.y<y0)y0=q.y; if(q.y>y1)y1=q.y; }
    for(const q of cfg.vmarcas||[]) if(Number.isFinite(q.x)){ if(q.x<x0)x0=q.x; if(q.x>x1)x1=q.x; }
    if(!(x1>=x0)){ ctx.fillStyle=T.fraca; ctx.font='12px Signika, system-ui, sans-serif'; ctx.fillText(cfg.vazio||'Sem dados para este gráfico.',16,28); ctx.restore(); return; }
    if(cfg.x&&cfg.x.min!=null) x0=cfg.x.min; if(cfg.x&&cfg.x.max!=null) x1=cfg.x.max;
    if(cfg.y&&cfg.y.min!=null) y0=Math.min(y0,cfg.y.min); if(cfg.y&&cfg.y.max!=null) y1=Math.max(y1,cfg.y.max);
    if(x1-x0<1e-12){ x0-=1; x1+=1; } if(y1-y0<1e-12){ y0-=.5; y1+=.5; }
    const fy=(y1-y0)*.07; y0-=cfg.y&&cfg.y.zero&&y0>=0?0:fy; y1+=fy;
    if(cfg.y&&cfg.y.zero&&y0>0) y0=0;
    const X=x=>m.e+(x-x0)/(x1-x0)*(w-m.e-m.d), Y=y=>h-m.b-(y-y0)/(y1-y0)*(h-m.c-m.b);
    const px=passo(x1-x0,(w-m.e-m.d)/70), py=passo(y1-y0,(h-m.c-m.b)/34);
    const dec=p=>p>=1?0:p>=.1?1:p>=.01?2:3;
    ctx.font='11px Signika, system-ui, sans-serif'; ctx.lineWidth=1; ctx.strokeStyle=T.grade; ctx.fillStyle=T.fraca;
    ctx.beginPath();
    for(let x=Math.ceil(x0/px-1e-9)*px;x<=x1+1e-9;x+=px){ ctx.moveTo(X(x)+.5,m.c); ctx.lineTo(X(x)+.5,h-m.b); const t=fmt(x,cfg.x&&cfg.x.dec!=null?cfg.x.dec:dec(px)); ctx.fillText(t,X(x)-ctx.measureText(t).width/2,h-m.b+14); }
    for(let y=Math.ceil(y0/py-1e-9)*py;y<=y1+1e-9;y+=py){ ctx.moveTo(m.e,Y(y)+.5); ctx.lineTo(w-m.d,Y(y)+.5); const t=fmt(y,cfg.y&&cfg.y.dec!=null?cfg.y.dec:dec(py)); ctx.fillText(t,m.e-6-ctx.measureText(t).width,Y(y)+4); }
    ctx.stroke();
    ctx.strokeStyle=T.fraca; ctx.strokeRect(m.e+.5,m.c+.5,w-m.e-m.d,h-m.c-m.b);
    if(y0<0&&y1>0){ ctx.beginPath(); ctx.moveTo(m.e,Y(0)+.5); ctx.lineTo(w-m.d,Y(0)+.5); ctx.stroke(); }
    ctx.save(); ctx.beginPath(); ctx.rect(m.e,m.c,w-m.e-m.d,h-m.c-m.b); ctx.clip();
    for(const q of cfg.hmarcas||[]){ ctx.strokeStyle=q.cor||'#dc2626'; ctx.setLineDash([6,4]); ctx.lineWidth=1.4; ctx.beginPath(); ctx.moveTo(m.e,Y(q.y)); ctx.lineTo(w-m.d,Y(q.y)); ctx.stroke(); ctx.setLineDash([]);
      if(q.rotulo){ ctx.fillStyle=q.cor||'#dc2626'; ctx.fillText(q.rotulo,w-m.d-ctx.measureText(q.rotulo).width-4,Y(q.y)-4); } }
    for(const q of cfg.vmarcas||[]){ ctx.strokeStyle=q.cor||'#dc2626'; ctx.setLineDash([6,4]); ctx.lineWidth=1.4; ctx.beginPath(); ctx.moveTo(X(q.x),m.c); ctx.lineTo(X(q.x),h-m.b); ctx.stroke(); ctx.setLineDash([]);
      if(q.rotulo){ ctx.fillStyle=q.cor||'#dc2626'; const tw=ctx.measureText(q.rotulo).width; ctx.fillText(q.rotulo,Math.min(w-m.d-tw-2,X(q.x)+4),q.embaixo?h-m.b-6-(q.linha||0)*13:m.c+12+(q.linha||0)*13); } }
    cfg.series.forEach((s,k)=>{
      const cor=s.cor||PALETA[k%PALETA.length];
      ctx.strokeStyle=ctx.fillStyle=cor; ctx.lineWidth=s.largura||2; ctx.setLineDash(s.tracejado?[6,4]:[]);
      if(s.tipo==='barras'){
        const bw=s.x.length>1?Math.abs(X(s.x[1])-X(s.x[0]))*.92:20;
        ctx.globalAlpha=.75;
        for(let i=0;i<s.x.length;i++){ const yv=Y(s.y[i]), yb=Y(Math.max(y0,0)); ctx.fillStyle=s.cores?s.cores[i]:cor; ctx.fillRect(X(s.x[i])-bw/2,Math.min(yv,yb),bw,Math.abs(yb-yv)); }
        ctx.globalAlpha=1;
      } else if(s.tipo==='pontos'){
        ctx.globalAlpha=s.alfa||.55;
        for(let i=0;i<s.x.length;i++){ if(s.cores) ctx.fillStyle=s.cores[i]; ctx.beginPath(); ctx.arc(X(s.x[i]),Y(s.y[i]),s.raio||2,0,7); ctx.fill(); }
        ctx.globalAlpha=1;
      } else {
        ctx.beginPath(); let ini=true;
        for(let i=0;i<s.x.length;i++){ const y=s.y[i]; if(!Number.isFinite(y)||!Number.isFinite(s.x[i])){ ini=true; continue; } if(ini){ ctx.moveTo(X(s.x[i]),Y(y)); ini=false; } else ctx.lineTo(X(s.x[i]),Y(y)); }
        ctx.stroke();
        if(s.marcas){ for(let i=0;i<s.x.length;i++){ if(!Number.isFinite(s.y[i])) continue; ctx.beginPath(); ctx.arc(X(s.x[i]),Y(s.y[i]),2.6,0,7); ctx.fill(); } }
      }
      ctx.setLineDash([]);
    });
    for(const p of cfg.pontos||[]){ ctx.fillStyle=p.cor||T.tinta; ctx.strokeStyle=T.papel; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(X(p.x),Y(p.y),p.raio||6,0,7); ctx.fill(); ctx.stroke();
      if(p.rotulo){ ctx.fillStyle=T.tinta; const tw=ctx.measureText(p.rotulo).width, px=X(p.x), py=Y(p.y);   /* o rótulo fica do lado em que cabe */
        ctx.fillText(p.rotulo,px+9+tw>w-m.d-2?Math.max(m.e+2,px-9-tw):px+9,py-7<m.c+10?py+16:py-7); } }
    ctx.restore();
    /* rótulos dos eixos e legenda */
    ctx.fillStyle=T.tinta;
    if(cfg.x&&cfg.x.rotulo){ const t=cfg.x.rotulo; ctx.fillText(t,m.e+(w-m.e-m.d-ctx.measureText(t).width)/2,h-5); }
    if(cfg.y&&cfg.y.rotulo){ ctx.save(); ctx.translate(12,m.c+(h-m.c-m.b)/2); ctx.rotate(-Math.PI/2); const t=cfg.y.rotulo; ctx.fillText(t,-ctx.measureText(t).width/2,0); ctx.restore(); }
    if(cfg.titulo){ ctx.font='600 12px Signika, system-ui, sans-serif'; let t=cfg.titulo; while(t.length>8&&ctx.measureText(t).width>w-m.e-6) t=t.slice(0,-2)+'…'; ctx.fillText(t,m.e,15); ctx.font='11px Signika, system-ui, sans-serif'; }
    const leg=cfg.series.filter(s=>s.nome);
    if(leg.length&&cfg.legenda!==false){
      let lx=m.e+8, ly=m.c+13;
      const larg=Math.max(...leg.map(s=>ctx.measureText(s.nome).width))+26;
      ctx.fillStyle=T.painel; ctx.fillRect(lx-4,ly-11,larg+4,leg.length*14+4);
      leg.forEach((s,k)=>{ ctx.strokeStyle=ctx.fillStyle=s.cor||PALETA[cfg.series.indexOf(s)%PALETA.length]; ctx.lineWidth=2.5; ctx.setLineDash(s.tracejado?[5,3]:[]); ctx.beginPath(); ctx.moveTo(lx,ly-4+k*14); ctx.lineTo(lx+16,ly-4+k*14); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle=T.tinta; ctx.fillText(s.nome,lx+21,ly+k*14); });
    }
    ctx.restore();
  };

  /* ---------------- configurações de cada gráfico ---------------- */
  const xs=an=>an.fatias.map(f=>f.xm);
  GM.grafGLE=an=>{
    const c=an.curvas; if(!c) return null;
    const lam=an.lam[an.metodo];
    return {titulo:'Fator de segurança × λ — função entre fatias: '+(c.funcao==='const'?'constante (Spencer)':'meia-senoide (Morgenstern–Price)'),
      x:{rotulo:'λ', dec:2}, y:{rotulo:'fator de segurança', dec:3},
      series:[{nome:'Fm — equilíbrio de momentos', x:c.lam, y:c.Fm.map(v=>v==null?NaN:v), cor:'#2563eb'},{nome:'Ff — equilíbrio de forças', x:c.lam, y:c.Ff.map(v=>v==null?NaN:v), cor:'#dc2626'}],
      vmarcas:[{x:0, rotulo:'Bishop e Janbu (λ = 0)', cor:'#64748b', embaixo:true}],
      pontos:Number.isFinite(lam)&&(an.metodo==='mp'||an.metodo==='spencer')?[{x:lam, y:an.FS, rotulo:'FS = '+fmt(an.FS,3)+' em λ = '+fmt(lam,3), cor:'#111827'}]:[]};
  };
  GM.grafTensoes=an=>({titulo:'Tensões na base das fatias', x:{rotulo:'distância na seção (m)'}, y:{rotulo:'kPa'},
    series:[{nome:'σ′n — normal efetiva', x:xs(an), y:an.fatias.map(f=>f.sn), cor:'#2563eb'},{nome:'τ resistente', x:xs(an), y:an.fatias.map(f=>f.tauR), cor:'#16a34a'},
      {nome:'τ mobilizada', x:xs(an), y:an.fatias.map(f=>f.tauM), cor:'#dc2626'},{nome:'u — poropressão', x:xs(an), y:an.fatias.map(f=>f.u), cor:'#0891b2', tracejado:true}]});
  GM.grafForcas=an=>{
    const x=[an.fatias[0].xl,...an.fatias.map(f=>f.xr)];
    return {titulo:'Forças entre fatias', x:{rotulo:'distância na seção (m)'}, y:{rotulo:'kN/m'},
      series:[{nome:'E — normal', x, y:[an.fatias[0].El,...an.fatias.map(f=>f.Er)], cor:'#2563eb'},{nome:'X — cisalhante', x, y:[an.fatias[0].Xl,...an.fatias.map(f=>f.Xr)], cor:'#dc2626'}]};
  };
  GM.grafLocal=an=>({titulo:'Resistência disponível ÷ mobilizada em cada fatia (o FS é o mesmo em todas; aqui se vê onde a base trabalha mais)', x:{rotulo:'distância na seção (m)'}, y:{rotulo:'kN/m'},
    series:[{nome:'peso W', x:xs(an), y:an.fatias.map(f=>f.W), cor:'#64748b'},{nome:'N — normal na base', x:xs(an), y:an.fatias.map(f=>f.N), cor:'#2563eb'},{nome:'S — cisalhante mobilizada', x:xs(an), y:an.fatias.map(f=>f.S), cor:'#dc2626'}]});
  GM.grafSensibilidade=(s,legenda)=>({titulo:'Sensibilidade — um parâmetro por vez', x:{rotulo:'variação do parâmetro (%)', dec:0}, y:{rotulo:'fator de segurança', dec:2}, legenda:!!legenda,
    series:s.itens.map((it,k)=>({nome:it.rotulo+' · '+it.nome, x:it.x.map(v=>100*(v/it.valor-1)), y:it.FS, cor:PALETA[k%PALETA.length], marcas:true})),
    hmarcas:[{y:1, rotulo:'FS = 1', cor:'#dc2626'}]});
  GM.grafHistograma=(mc,adm)=>{
    const v=Array.from(mc.FS).filter(f=>f>0), n=Math.max(12,Math.min(40,Math.round(Math.sqrt(v.length)))), a=mc.min, b=mc.max, dx=(b-a)/n||1, cont=new Array(n).fill(0);
    for(const f of v) cont[Math.min(n-1,Math.floor((f-a)/dx))]++;
    const cx=cont.map((c,i)=>a+dx*(i+.5));
    return {titulo:'Monte Carlo — distribuição do fator de segurança ('+fmt(v.length,0)+' simulações)', x:{rotulo:'fator de segurança', dec:2}, y:{rotulo:'frequência (%)', zero:true, dec:1},
      series:[{x:cx, y:cont.map(c=>100*c/v.length), tipo:'barras', cores:cx.map(x=>GM.corFS(x,adm))}], legenda:false,
      vmarcas:[{x:1, rotulo:'FS = 1', cor:'#dc2626'},{x:mc.media, rotulo:'média '+fmt(mc.media,3), cor:'#2563eb', linha:1}]};
  };
  GM.grafSismo=ky=>({titulo:'Análise pseudo-estática — fator de segurança × coeficiente sísmico horizontal', x:{rotulo:'kh (g)', dec:2}, y:{rotulo:'fator de segurança', dec:2},
    series:[{nome:'FS', x:ky.curva.map(p=>p[0]), y:ky.curva.map(p=>p[1]), cor:'#2563eb', marcas:true}], hmarcas:[{y:1, rotulo:'FS = 1', cor:'#dc2626'}],
    pontos:ky.ok?[{x:ky.ky, y:1, rotulo:'ky = '+fmt(ky.ky,3)+' g', cor:'#111827'}]:[]});
  GM.grafPorte=(res,adm)=>{
    const T=res.busca.tentativas, n=T.length/7, salto=Math.max(1,Math.ceil(n/1800)), x=[], y=[], cores=[];
    let fmin=Infinity; for(let i=0;i<n;i++) if(T[7*i+5]<fmin) fmin=T[7*i+5];
    const teto=Math.max(2.5*fmin,1.4*adm,...res.busca.porte.map(p=>1.15*p.FS));           /* acima disso não interessa ao projeto */
    for(let i=0;i<n;i+=salto){ if(T[7*i+5]>teto) continue; x.push(T[7*i+6]); y.push(T[7*i+5]); cores.push(GM.corFS(T[7*i+5],adm)); }
    const H=res.busca.relevo;
    return {titulo:'Fator de segurança × porte da ruptura (cada ponto é uma superfície tentada)', x:{rotulo:'desnível entre a entrada e a saída (m)', min:0}, y:{rotulo:'fator de segurança', dec:2, teto},
      series:[{x, y, tipo:'pontos', cores, raio:2.2}], legenda:false,
      vmarcas:[{x:H/3, rotulo:'local │ intermediária', cor:'#64748b'},{x:2*H/3, rotulo:'intermediária │ global', cor:'#64748b', linha:1}],
      hmarcas:[{y:adm, rotulo:'FS admissível '+fmt(adm,2), cor:'#1e8e3e'}],
      pontos:res.busca.porte.map(p=>({x:p.altura, y:p.FS, rotulo:fmt(p.FS,3), cor:'#111827', raio:5}))};
  };
  GM.grafRetro=r=>({titulo:'Retroanálise — pares (c′, φ′) de “'+r.nome+'” que dão FS = 1 nesta superfície', x:{rotulo:'φ′ (°)', min:0, dec:0}, y:{rotulo:'c′ (kPa)', zero:true, dec:0},
    series:[{nome:'FS = 1', x:r.pts.map(p=>p[0]), y:r.pts.map(p=>p[1]), cor:'#dc2626', marcas:true}], pontos:[{x:r.atual[0], y:r.atual[1], rotulo:'valor de projeto', cor:'#2563eb'}]});
  GM.grafEnvoltoria=(m,motor)=>{
    const d=GM.definicao({terreno:[[0,0],[1,0]], camadas:[{mat:'a'}], materiais:{a:m}, agua:{}, cargas:[], sismo:{}, trinca:{}, busca:{}, base:-1});
    let mat; try{ mat=motor.interno.material(d.materiais.a,'a'); }catch(e){ return null; }
    const x=[], y=[], smax=1500;
    for(let i=0;i<=60;i++){ const s=smax*i/60, r=motor.interno.resistencia(mat,s,0); x.push(s); y.push(r.c+s*r.t); }
    return {titulo:'Envoltória de resistência — '+(m.nome||''), x:{rotulo:'σ′n (kPa)', min:0}, y:{rotulo:'τ (kPa)', zero:true}, series:[{x, y, cor:'#16a34a'}], legenda:false};
  };

  /* Diagrama de corpo livre da fatia e o polígono de forças (que precisa fechar). O polígono
     está em escala; no corpo livre as setas crescem com a raiz da força (para as pequenas
     continuarem visíveis) e uma fatia muito fina é alargada para caber o desenho. */
  GM.desenhaFatia=(ctx,w,h,an,i,claro)=>{
    const T=GM.tema(!!claro), f=an.fatias[i], FONTE='Signika, system-ui, sans-serif';
    ctx.save(); ctx.fillStyle=T.fundo; ctx.fillRect(0,0,w,h);
    if(!f){ ctx.restore(); return; }
    const dir=Math.sign(f.xr-f.xl)||1, al=f.alfa*Math.PI/180, sen=Math.sin(al), cos=Math.cos(al);
    const forcas=[
      {n:'W', v:[0,-(f.W)], cor:'#64748b', de:'peso'},
      f.Pv?{n:'P', v:[0,-f.Pv], cor:'#b91c1c', de:'carga e água sobre a fatia'}:null,
      Math.abs(f.Hd)>1e-9?{n:'H', v:[dir*f.Hd,0], cor:'#b91c1c', de:'sismo e água'}:null,
      Math.abs(f.El)>1e-9?{n:'Eₑ', v:[dir*f.El,0], cor:'#2563eb', de:'normal de montante'}:null,
      Math.abs(f.Xl)>1e-9?{n:'Xₑ', v:[0,-f.Xl], cor:'#7c3aed', de:'cisalhante de montante'}:null,
      {n:'N', v:[dir*sen*f.N,cos*f.N], cor:'#16a34a', de:'normal na base'},
      {n:'S', v:[-dir*cos*f.S,sen*f.S], cor:'#dc2626', de:'cisalhante mobilizada'},
      Math.abs(f.Er)>1e-9?{n:'Eⱼ', v:[-dir*f.Er,0], cor:'#2563eb', de:'normal de jusante'}:null,
      Math.abs(f.Xr)>1e-9?{n:'Xⱼ', v:[0,f.Xr], cor:'#7c3aed', de:'cisalhante de jusante'}:null].filter(Boolean);
    const seta=(x1,y1,x2,y2,cor,rot)=>{
      const a=Math.atan2(y2-y1,x2-x1), L=Math.hypot(x2-x1,y2-y1); if(L<2) return;
      const p=Math.min(8,L*.45);
      ctx.strokeStyle=ctx.fillStyle=cor; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-p*Math.cos(a-.4),y2-p*Math.sin(a-.4)); ctx.lineTo(x2-p*Math.cos(a+.4),y2-p*Math.sin(a+.4)); ctx.closePath(); ctx.fill();
      if(rot){ ctx.font='600 11px '+FONTE; ctx.fillText(rot,(x1+x2)/2+7*Math.sin(a)+3,(y1+y2)/2-7*Math.cos(a)+4); }
    };
    const Fmax=Math.max(...forcas.map(q=>Math.hypot(q.v[0],q.v[1])),1e-9);
    /* colunas: corpo livre | polígono | tabela (com a descrição quando há largura) */
    ctx.font='11px '+FONTE;
    const comDesc=w>=760, larguraTab=comDesc?96+Math.max(...forcas.map(q=>ctx.measureText(q.de).width))+10:98;
    const topo=22, alt=h-topo-20, larg=Math.max(140,Math.min(w*.40,340)), pw=Math.max(96,Math.min(300,w-larg-larguraTab-34));
    /* corpo livre */
    const st=Math.max(14,Math.min(60,alt*.2,larg*.17)), util=[Math.max(20,larg-2*st-34),Math.max(16,alt-2*st-6)];
    const hz=Math.max(f.zgl,f.zgr)-Math.min(f.zbl,f.zbr), esc=Math.min(util[0]/Math.max(f.b,1e-6),util[1]/Math.max(hz,1e-6));
    const ex=Math.min(util[0]/Math.max(f.b,1e-6),Math.max(esc,22/Math.max(f.b,1e-6))), fora=ex>esc*1.05;
    const cx=larg/2, cy=topo+alt/2, zmeio=(Math.max(f.zgl,f.zgr)+Math.min(f.zbl,f.zbr))/2, X=x=>cx+(x-(f.xl+f.xr)/2)*ex*dir*Math.sign(f.xr-f.xl||1), Y=z=>cy-(z-zmeio)*esc;
    ctx.beginPath(); ctx.moveTo(X(f.xl),Y(f.zgl)); ctx.lineTo(X(f.xr),Y(f.zgr)); ctx.lineTo(X(f.xr),Y(f.zbr)); ctx.lineTo(X(f.xl),Y(f.zbl)); ctx.closePath();
    ctx.fillStyle=GM.corFS(an.FS,1.5); ctx.globalAlpha=.22; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=T.tinta; ctx.lineWidth=1.5; ctx.stroke();
    const xm=(f.xl+f.xr)/2, zbm=(f.zbl+f.zbr)/2, zcm=(Math.max(f.zgl,f.zgr)+zbm)/2;
    const ponto={W:[xm,zcm], P:[xm,(f.zgl+f.zgr)/2], H:[xm,zcm], N:[xm,zbm], S:[xm,zbm], 'Eₑ':[f.xl,f.zEl!=null&&Number.isFinite(f.zEl)?f.zEl:(f.zgl+f.zbl)/2], 'Xₑ':[f.xl,(f.zgl+f.zbl)/2],
      'Eⱼ':[f.xr,f.zEr!=null&&Number.isFinite(f.zEr)?f.zEr:(f.zgr+f.zbr)/2], 'Xⱼ':[f.xr,(f.zgr+f.zbr)/2]};
    for(const q of forcas){
      const p=ponto[q.n], m=Math.hypot(q.v[0],q.v[1]), k=m>0?st*Math.sqrt(m/Fmax)/m:0, vx=q.v[0]*k, vy=-q.v[1]*k, chega=q.n==='N'||q.n==='Eₑ'||q.n==='Eⱼ';
      if(chega) seta(X(p[0])-vx,Y(p[1])-vy,X(p[0]),Y(p[1]),q.cor,q.n); else seta(X(p[0]),Y(p[1]),X(p[0])+vx,Y(p[1])+vy,q.cor,q.n);
    }
    ctx.font='600 12px '+FONTE; ctx.fillStyle=T.tinta;
    let tit='Fatia '+(i+1)+' de '+an.fatias.length+' — '+f.nome; while(tit.length>12&&ctx.measureText(tit).width>larg-4) tit=tit.slice(0,-2)+'…';
    ctx.fillText(tit,8,15);
    ctx.font='11px '+FONTE; ctx.fillStyle=T.fraca;
    let pe='largura '+fmt(f.b,2)+' m · base '+fmt(f.l,2)+' m a '+fmt(f.alfa,1)+'° · c′ '+fmt(f.c,1)+' kPa · φ′ '+fmt(f.phi,1)+'° · u '+fmt(f.u,1)+' kPa'+(fora?' · fatia alargada no desenho':'');
    while(pe.length>12&&ctx.measureText(pe).width>w-16) pe=pe.slice(0,-2)+'…';
    ctx.fillText(pe,8,h-6);
    /* polígono de forças, ponta com cauda */
    const px0=larg+10, ph=alt;
    let x=0, y=0, a0=0, a1=0, b0=0, b1=0;
    for(const q of forcas){ x+=q.v[0]; y+=q.v[1]; if(x<a0)a0=x; if(x>a1)a1=x; if(y<b0)b0=y; if(y>b1)b1=y; }
    const ep=Math.min((pw-26)/Math.max(a1-a0,1e-9),(ph-34)/Math.max(b1-b0,1e-9)), PX=v=>px0+13+(v-a0)*ep+(pw-26-(a1-a0)*ep)/2, PY=v=>topo+10+(b1-v)*ep+(ph-34-(b1-b0)*ep)/2;
    ctx.strokeStyle=T.grade; ctx.lineWidth=1; ctx.strokeRect(px0+.5,topo+.5,pw,ph);
    ctx.fillStyle=T.tinta; ctx.font='600 12px '+FONTE; ctx.fillText('Polígono de forças',px0,15);
    x=0; y=0;
    for(const q of forcas){ seta(PX(x),PY(y),PX(x+q.v[0]),PY(y+q.v[1]),q.cor,pw>150?q.n:''); x+=q.v[0]; y+=q.v[1]; }
    const erro=Math.hypot(x,y);
    ctx.font='11px '+FONTE; ctx.fillStyle=erro<1e-3*Fmax?'#1e8e3e':'#d93025';
    ctx.fillText(erro<1e-3*Fmax?'fecha: resultante nula':'resultante '+fmt(erro,2)+' kN/m',px0+6,topo+ph-6);
    /* tabela das forças */
    const tx=px0+pw+10, passoL=Math.max(12,Math.min(16,(alt-4)/(forcas.length+1))); let ty=topo+12;
    ctx.fillStyle=T.tinta; ctx.font='600 11px '+FONTE; ctx.fillText('kN/m',tx+58,15);
    ctx.font='11px '+FONTE;
    for(const q of forcas){ ctx.fillStyle=q.cor; ctx.fillText(q.n,tx,ty); ctx.fillStyle=T.tinta; const t=fmt(Math.hypot(q.v[0],q.v[1]),1); ctx.fillText(t,tx+88-ctx.measureText(t).width,ty); if(comDesc){ ctx.fillStyle=T.fraca; ctx.fillText(q.de,tx+96,ty); } ty+=passoL; }
    ctx.fillStyle=T.fraca; ctx.fillText(comDesc?'U = '+fmt(f.U,1)+' kN/m (já contida em N)':'U '+fmt(f.U,1),tx,ty);
    ctx.restore();
  };
})(typeof window!=='undefined'?window:globalThis);
