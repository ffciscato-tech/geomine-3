/* GeoMine — GEOMEC: desenho da seção (materiais, água, cargas, superfícies de ruptura, fatias).
   Sempre em escala 1:1 (horizontal = vertical): só assim um círculo de ruptura é um círculo. */
(function(root){
  'use strict';
  const GM=root.GeoMineGeomecInterno;
  const lerp=GM.lerp;
  const fmt=(v,d)=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
  GM.fmt=fmt;

  GM.tema=claro=>claro?{fundo:'#f4f7fa', papel:'#ffffff', tinta:'#1c2733', fraca:'#5d6f80', grade:'#d5dee6', terreno:'#1f2a36', agua:'#1769c2', aguaArea:'rgba(23,105,194,.13)',
      lamina:'rgba(23,105,194,.38)', contorno:'rgba(20,30,40,.45)', entrada:'#1e8e3e', saida:'#c2410c', empuxo:'#7c3aed', painel:'rgba(255,255,255,.92)', alfa:.92}
    :{fundo:'#07101a', papel:'#0b1622', tinta:'#e6edf5', fraca:'#93a4b5', grade:'#1d2c3b', terreno:'#f1f5f9', agua:'#5aa9f0', aguaArea:'rgba(90,169,240,.16)',
      lamina:'rgba(90,169,240,.40)', contorno:'rgba(235,242,250,.42)', entrada:'#4ade80', saida:'#fb923c', empuxo:'#c4b5fd', painel:'rgba(11,22,34,.90)', alfa:.80};

  /* Vista: x0 e z1 são o canto superior esquerdo em metros; esc = pixels por metro. */
  GM.enquadra=(sec,w,h,res,margens)=>{
    const L=GM.limites(sec), m=Object.assign({e:54, d:18, c:26, b:34},margens||{});
    let z1=L.z1, x0=L.x0, x1=L.x1, z0=L.z0;
    const c=res&&res.critica;
    if(c&&c.sup&&c.sup.tipo==='circulo'&&Number.isFinite(c.sup.zc)){
      /* o centro do círculo crítico entra no quadro quando não fica longe demais */
      const alt=L.z1-L.z0, extra=Math.min(c.sup.zc-L.z1,alt*0.9);
      if(extra>0) z1=L.z1+extra;
    } else z1+=0.08*(L.z1-L.z0);
    const esc=Math.min((w-m.e-m.d)/Math.max(1e-6,x1-x0),(h-m.c-m.b)/Math.max(1e-6,z1-z0));
    const sobraX=(w-m.e-m.d)-(x1-x0)*esc, sobraZ=(h-m.c-m.b)-(z1-z0)*esc;
    return {x0:x0-(m.e+sobraX/2)/esc, z1:z1+(m.c+sobraZ/2)/esc, esc};
  };
  GM.tela=(v,x,z)=>[(x-v.x0)*v.esc,(v.z1-z)*v.esc];
  GM.mundo=(v,px,py)=>[v.x0+px/v.esc, v.z1-py/v.esc];
  /* Círculo que passa por dois pontos do terreno com flecha s·corda (mesma regra do motor). */
  /* Flecha máxima (em fração da corda) para o arco continuar descendo desde a entrada: além
     dela o centro ficaria abaixo do ponto de entrada e a superfície entraria em balanço. */
  GM.flechaMax=(sec,xe,xs)=>{
    const ze=lerp(sec.terreno,xe), zs=lerp(sec.terreno,xs), dx=Math.abs(xs-xe), dz=Math.abs(ze-zs);
    if(!(dx>1e-6)) return 0.02;
    const t=dz/dx;
    return Math.max(0.03,Math.min(0.5,0.97*(Math.sqrt(1+t*t)-t)/2));
  };
  GM.circuloES=(sec,xe,xs,s)=>{
    const ze=lerp(sec.terreno,xe), zs=lerp(sec.terreno,xs);
    let ax=xe, az=ze, bx=xs, bz=zs;
    if(ax>bx){ ax=xs; az=zs; bx=xe; bz=ze; }
    const dx=bx-ax, dz=bz-az, L=Math.hypot(dx,dz);
    if(!(dx>1e-6)||!(s>0)) return null;
    const fl=s*L, r=(L*L/4+fl*fl)/(2*fl), nx=dz/L, nz=-dx/L;
    const xc=(ax+bx)/2-nx*(r-fl), zc=(az+bz)/2-nz*(r-fl);
    return {tipo:'circulo', xc, zc, r, fundo:[(ax+bx)/2+nx*fl,(az+bz)/2+nz*fl], pe:[xe,ze], ps:[xs,zs]};
  };

  function passo(span,alvo){
    const bruto=span/Math.max(1,alvo), p=Math.pow(10,Math.floor(Math.log10(bruto))), r=bruto/p;
    return (r<1.5?1:r<3.5?2:r<7.5?5:10)*p;
  }
  GM.passo=passo;

  /* Desenho completo. op: {claro, mapa, fatias, empuxo, sel, faixas, manual, manualRes, editaNA,
     legenda, titulo, limpo (exportação)} */
  GM.desenhaSecao=(ctx,w,h,sec,res,v,op)=>{
    op=op||{};
    const T=GM.tema(!!op.claro), X=(x)=>(x-v.x0)*v.esc, Y=(z)=>(v.z1-z)*v.esc;
    ctx.save();
    ctx.fillStyle=op.limpo?T.papel:T.fundo; ctx.fillRect(0,0,w,h);
    ctx.lineJoin='round'; ctx.lineCap='round';
    const F=GM.faixas(sec), L=GM.limites(sec), adm=GM.admEfetivo?GM.admEfetivo(sec):GM.num(sec.fsAdm,1.5);

    /* grade e eixos */
    const [mx0,mz1]=GM.mundo(v,0,0), [mx1,mz0]=GM.mundo(v,w,h), px=passo(mx1-mx0,w/90), pz=passo(mz1-mz0,h/55);
    ctx.font='11px Signika, system-ui, sans-serif'; ctx.lineWidth=1;
    ctx.strokeStyle=T.grade; ctx.fillStyle=T.fraca;
    ctx.beginPath();
    for(let x=Math.ceil(mx0/px)*px;x<=mx1;x+=px){ ctx.moveTo(X(x)+.5,0); ctx.lineTo(X(x)+.5,h); }
    for(let z=Math.ceil(mz0/pz)*pz;z<=mz1;z+=pz){ ctx.moveTo(0,Y(z)+.5); ctx.lineTo(w,Y(z)+.5); }
    ctx.stroke();

    /* camadas */
    const nx=F.X.length;
    for(let k=0;k<sec.camadas.length;k++){
      const m=sec.materiais[sec.camadas[k].mat]||{}, topo=F.tops[k], fundo=k<sec.camadas.length-1?F.tops[k+1]:null;
      ctx.beginPath();
      for(let i=0;i<nx;i++){ const p=[X(F.X[i]),Y(topo[i])]; if(i) ctx.lineTo(p[0],p[1]); else ctx.moveTo(p[0],p[1]); }
      for(let i=nx-1;i>=0;i--) ctx.lineTo(X(F.X[i]),Y(fundo?fundo[i]:F.base));
      ctx.closePath();
      ctx.globalAlpha=T.alfa; ctx.fillStyle=m.cor||GM.CORES[k%GM.CORES.length]; ctx.fill(); ctx.globalAlpha=1;
      if(m.modelo==='rocha'){
        /* rocha impenetrável: hachura em diagonal */
        ctx.save(); ctx.clip(); ctx.strokeStyle=T.contorno; ctx.lineWidth=1; ctx.beginPath();
        for(let q=-h;q<w+h;q+=9){ ctx.moveTo(q,h); ctx.lineTo(q+h,0); }
        ctx.stroke(); ctx.restore();
      }
      if(k>0){
        ctx.strokeStyle=T.contorno; ctx.lineWidth=1; ctx.beginPath();
        for(let i=0;i<nx;i++){ const p=[X(F.X[i]),Y(topo[i])]; if(i) ctx.lineTo(p[0],p[1]); else ctx.moveTo(p[0],p[1]); }
        ctx.stroke();
      }
    }
    /* base do modelo */
    ctx.strokeStyle=T.contorno; ctx.setLineDash([6,4]); ctx.beginPath(); ctx.moveTo(X(L.x0),Y(F.base)); ctx.lineTo(X(L.x1),Y(F.base)); ctx.stroke(); ctx.setLineDash([]);

    /* água */
    /* a linha da condição em cálculo (NA desenhado, crítico, saturado…); editando, a desenhada */
    const desenhada=sec.agua&&sec.agua.modo==='linha'&&sec.agua.linha.length>1?sec.agua.linha.slice().sort((a,b)=>a[0]-b[0]):null;
    const condW=GM.condicaoEfetiva?GM.condicaoEfetiva(sec):'desenhado', agua=op.editaNA||!GM.linhaCondicao?desenhada:GM.linhaCondicao(sec,condW);
    if(desenhada&&agua!==desenhada&&!op.editaNA){
      ctx.strokeStyle=T.agua; ctx.lineWidth=1.2; ctx.setLineDash([5,4]); ctx.globalAlpha=.75; ctx.beginPath();
      desenhada.forEach((p,i)=>{ if(i) ctx.lineTo(X(p[0]),Y(p[1])); else ctx.moveTo(X(p[0]),Y(p[1])); });
      ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha=1;
    }
    if(agua){
      const zw=F.X.map(x=>lerp(agua,x));
      ctx.beginPath();                                         /* solo abaixo do NA */
      for(let i=0;i<nx;i++){ const z=Math.min(zw[i],F.tops[0][i]); if(i) ctx.lineTo(X(F.X[i]),Y(z)); else ctx.moveTo(X(F.X[i]),Y(z)); }
      ctx.lineTo(X(F.X[nx-1]),Y(F.base)); ctx.lineTo(X(F.X[0]),Y(F.base)); ctx.closePath();
      ctx.fillStyle=T.aguaArea; ctx.fill();
      ctx.beginPath();                                         /* lâmina sobre o terreno */
      for(let i=0;i<nx;i++){ const z=Math.max(zw[i],F.tops[0][i]); if(i) ctx.lineTo(X(F.X[i]),Y(z)); else ctx.moveTo(X(F.X[i]),Y(z)); }
      for(let i=nx-1;i>=0;i--) ctx.lineTo(X(F.X[i]),Y(F.tops[0][i]));
      ctx.closePath(); ctx.fillStyle=T.lamina; ctx.fill();
      ctx.strokeStyle=T.agua; ctx.lineWidth=2; ctx.beginPath();
      agua.forEach((p,i)=>{ if(i) ctx.lineTo(X(p[0]),Y(p[1])); else ctx.moveTo(X(p[0]),Y(p[1])); });
      ctx.stroke();
      /* marca ▽ do nível d'água */
      const im=Math.floor(agua.length/2), pm=agua.length>2?agua[im]:[(agua[0][0]+agua[1][0])/2,(agua[0][1]+agua[1][1])/2], ax=X(pm[0]), ay=Y(pm[1]);
      ctx.fillStyle=T.agua; ctx.beginPath(); ctx.moveTo(ax-6,ay-11); ctx.lineTo(ax+6,ay-11); ctx.lineTo(ax,ay-2); ctx.closePath(); ctx.fill();
      ctx.fillText(op.editaNA||condW==='desenhado'?'NA':condW==='critico'?'NA crítico':'NA (saturado)',ax+9,ay-4);
    }

    /* terreno */
    ctx.strokeStyle=T.terreno; ctx.lineWidth=2.2; ctx.beginPath();
    sec.terreno.forEach((p,i)=>{ if(i) ctx.lineTo(X(p[0]),Y(p[1])); else ctx.moveTo(X(p[0]),Y(p[1])); });
    ctx.stroke();

    /* cargas */
    for(const q of sec.cargas||[]){
      const x1=GM.num(q.x1,NaN), x2=GM.num(q.x2,NaN), qq=GM.num(q.q,0);
      if(!Number.isFinite(x1)||!Number.isFinite(x2)||!qq) continue;
      const a=Math.min(x1,x2), b=Math.max(x1,x2), n=Math.max(2,Math.min(14,Math.round((b-a)*v.esc/22)));
      ctx.strokeStyle=ctx.fillStyle='#b91c1c'; ctx.lineWidth=1.4; ctx.beginPath();
      for(let i=0;i<=n;i++){
        const x=a+(b-a)*i/n, yb=Y(lerp(sec.terreno,x))-2, yt=yb-22;
        ctx.moveTo(X(x),yt); ctx.lineTo(X(x),yb); ctx.moveTo(X(x)-3,yb-6); ctx.lineTo(X(x),yb); ctx.lineTo(X(x)+3,yb-6);
        if(i===0) ctx.moveTo(X(x),yt);
      }
      ctx.stroke();
      ctx.beginPath(); for(let i=0;i<=n;i++){ const x=a+(b-a)*i/n, yt=Y(lerp(sec.terreno,x))-24; if(i) ctx.lineTo(X(x),yt); else ctx.moveTo(X(x),yt); } ctx.stroke();
      ctx.fillText(fmt(qq,0)+' kPa',X((a+b)/2)-18,Y(lerp(sec.terreno,(a+b)/2))-30);
      /* a carga é de arrastar na figura (print IMG_0269, 23/11/2026): alça em cada ponta */
      if(op.alcasCarga){
        for(const x of [x1,x2]){ const yy=Y(lerp(sec.terreno,x))-13; ctx.beginPath(); ctx.arc(X(x),yy,5,0,Math.PI*2); ctx.fillStyle='#fff'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#b91c1c'; ctx.stroke(); }
        ctx.fillStyle='#b91c1c';
      }
    }

    /* mapa de segurança: as superfícies tentadas, da menos para a mais crítica */
    const b=res&&res.busca;
    if(op.mapa&&b&&b.tentativas&&b.tentativas.length){
      const Tt=b.tentativas, n=Tt.length/7, idx=new Array(n);
      for(let i=0;i<n;i++) idx[i]=i;
      idx.sort((p,q)=>Tt[7*p+5]-Tt[7*q+5]);
      const mostra=idx.slice(0,Math.min(n,op.mapaMax||420)).reverse(), fmin=Tt[7*idx[0]+5];
      ctx.lineWidth=1;
      for(const i of mostra){
        const xe=Tt[7*i], xs=Tt[7*i+1], xc=Tt[7*i+2], zc=Tt[7*i+3], r=Tt[7*i+4], f=Tt[7*i+5];
        const pe=[X(xe),Y(lerp(sec.terreno,xe))], ps=[X(xs),Y(lerp(sec.terreno,xs))], c=[X(xc),Y(zc)];
        let a1=Math.atan2(pe[1]-c[1],pe[0]-c[0]), a2=Math.atan2(ps[1]-c[1],ps[0]-c[0]);
        if(a1>a2){ const t=a1; a1=a2; a2=t; }
        ctx.strokeStyle=GM.corFS(f,adm); ctx.globalAlpha=Math.max(.10,.55-.45*Math.min(1,(f-fmin)/Math.max(.15,.5*fmin)));
        ctx.beginPath(); ctx.arc(c[0],c[1],r*v.esc,a1,a2,false); ctx.stroke();
      }
      ctx.globalAlpha=1;
    }

    /* faixas de entrada e saída da busca */
    const fx=op.faixas||(b&&b.faixas&&sec.busca.faixas!=='manual'?{entrada:b.faixas.entrada, saida:b.faixas.saida, auto:true}:null);
    if(fx&&!op.limpo){
      for(const [nome,rg,cor] of [['entrada',fx.entrada,T.entrada],['saída',fx.saida,T.saida]]){
        if(!rg) continue;
        const a=Math.min(rg[0],rg[1]), c2=Math.max(rg[0],rg[1]), n=Math.max(2,Math.round((c2-a)*v.esc/8));
        ctx.strokeStyle=cor; ctx.lineWidth=fx.auto?2:4; ctx.globalAlpha=fx.auto?.45:.9; ctx.beginPath();
        for(let i=0;i<=n;i++){ const x=a+(c2-a)*i/n, y=Y(lerp(sec.terreno,x))-(nome==='entrada'?5:9); if(i) ctx.lineTo(X(x),y); else ctx.moveTo(X(x),y); }
        ctx.stroke(); ctx.globalAlpha=1;
        if(!fx.auto){
          ctx.fillStyle=cor;
          for(const x of [a,c2]){ ctx.beginPath(); ctx.arc(X(x),Y(lerp(sec.terreno,x))-(nome==='entrada'?5:9),7,0,7); ctx.fill(); }
          ctx.fillText(nome,X((a+c2)/2)-16,Y(lerp(sec.terreno,(a+c2)/2))-18);
        }
      }
    }

    /* superfície crítica (ou a manual, quando ligada) */
    const an=op.manual?op.manualRes:(res&&res.critica);
    const desenhaMassa=(an,destaque)=>{
      if(!an||!an.ok||!an.fatias||!an.fatias.length) return;
      const fa=an.fatias, cor=GM.corFS(an.FS,adm);
      ctx.beginPath(); ctx.moveTo(X(fa[0].xl),Y(fa[0].zgl));
      for(const f of fa) ctx.lineTo(X(f.xr),Y(f.zgr));
      for(let i=fa.length-1;i>=0;i--){ ctx.lineTo(X(fa[i].xr),Y(fa[i].zbr)); ctx.lineTo(X(fa[i].xl),Y(fa[i].zbl)); }
      ctx.closePath(); ctx.fillStyle=cor; ctx.globalAlpha=destaque?.30:.16; ctx.fill(); ctx.globalAlpha=1;
      if(op.fatias!==false&&destaque){
        ctx.strokeStyle=T.contorno; ctx.lineWidth=1; ctx.beginPath();
        const salto=Math.max(1,Math.ceil(fa.length/Math.max(8,Math.abs(X(fa[fa.length-1].xr)-X(fa[0].xl))/5)));
        for(let i=0;i<fa.length;i+=salto){ ctx.moveTo(X(fa[i].xl),Y(fa[i].zgl)); ctx.lineTo(X(fa[i].xl),Y(fa[i].zbl)); }
        ctx.stroke();
      }
      ctx.strokeStyle=cor; ctx.lineWidth=destaque?3:2; ctx.beginPath(); ctx.moveTo(X(fa[0].xl),Y(fa[0].zbl));
      for(const f of fa) ctx.lineTo(X(f.xr),Y(f.zbr));
      ctx.stroke();
      if(an.trinca){ ctx.strokeStyle=T.terreno; ctx.lineWidth=2; ctx.setLineDash([4,3]); ctx.beginPath(); ctx.moveTo(X(an.trinca.x),Y(an.trinca.topo)); ctx.lineTo(X(an.trinca.x),Y(an.trinca.fundo)); ctx.stroke(); ctx.setLineDash([]); }
      /* fatia selecionada */
      if(destaque&&op.sel!=null&&fa[op.sel]){
        const f=fa[op.sel];
        ctx.beginPath(); ctx.moveTo(X(f.xl),Y(f.zgl)); ctx.lineTo(X(f.xr),Y(f.zgr)); ctx.lineTo(X(f.xr),Y(f.zbr)); ctx.lineTo(X(f.xl),Y(f.zbl)); ctx.closePath();
        ctx.fillStyle=cor; ctx.globalAlpha=.55; ctx.fill(); ctx.globalAlpha=1; ctx.strokeStyle=T.tinta; ctx.lineWidth=1.5; ctx.stroke();
      }
      /* linha de empuxo */
      if(op.empuxo&&destaque){
        ctx.strokeStyle=T.empuxo; ctx.lineWidth=1.6; ctx.setLineDash([5,4]); ctx.beginPath(); let ini=true;
        for(const f of fa){ if(f.zEr==null||!Number.isFinite(f.zEr)) continue; const z=Math.max(f.zbr,Math.min(f.zgr,f.zEr)); if(ini){ ctx.moveTo(X(f.xr),Y(z)); ini=false; } else ctx.lineTo(X(f.xr),Y(z)); }
        ctx.stroke(); ctx.setLineDash([]);
      }
      /* centro, raios e o FS */
      let rot=null;
      if(an.sup.tipo==='circulo'){
        const c=[X(an.sup.xc),Y(an.sup.zc)], visivel=c[1]>-40&&c[1]<h+40&&c[0]>-40&&c[0]<w+40;
        if(visivel){
          ctx.strokeStyle=T.fraca; ctx.lineWidth=1; ctx.setLineDash([3,4]); ctx.beginPath();
          ctx.moveTo(c[0],c[1]); ctx.lineTo(X(fa[0].xl),Y(fa[0].zbl)); ctx.moveTo(c[0],c[1]); ctx.lineTo(X(fa[fa.length-1].xr),Y(fa[fa.length-1].zbr)); ctx.stroke(); ctx.setLineDash([]);
          ctx.strokeStyle=T.tinta; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(c[0]-6,c[1]); ctx.lineTo(c[0]+6,c[1]); ctx.moveTo(c[0],c[1]-6); ctx.lineTo(c[0],c[1]+6); ctx.stroke();
          rot=[c[0]+10,c[1]-8];
        }
      }
      if(!rot){ const i=Math.floor(fa.length/2); rot=[X(fa[i].xl)-30,Math.max(20,Y(Math.max(fa[i].zgl,fa[i].zgr))-26)]; }
      if(destaque){
        const txt='FS = '+fmt(an.FS,3);
        ctx.font='700 17px Signika, system-ui, sans-serif';
        const tw=ctx.measureText(txt).width, bx=Math.max(4,Math.min(w-tw-18,rot[0])), by=Math.max(22,Math.min(h-8,rot[1]));
        ctx.fillStyle=T.painel; ctx.beginPath(); ctx.roundRect?ctx.roundRect(bx-6,by-18,tw+12,24,6):ctx.rect(bx-6,by-18,tw+12,24); ctx.fill();
        ctx.strokeStyle=cor; ctx.lineWidth=1.5; ctx.stroke();
        ctx.fillStyle=cor; ctx.fillText(txt,bx,by);
        ctx.font='11px Signika, system-ui, sans-serif';
      }
    };
    if(op.manual&&res&&res.critica) desenhaMassa(res.critica,false);
    desenhaMassa(an,true);

    /* superfície manual: alças */
    if(op.manual&&op.manualCirc&&!op.limpo){
      const c=op.manualCirc;
      for(const [p,cor] of [[c.pe,T.entrada],[c.ps,T.saida],[c.fundo,T.tinta]]){
        ctx.fillStyle=cor; ctx.strokeStyle=T.papel; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(X(p[0]),Y(p[1]),8,0,7); ctx.fill(); ctx.stroke();
      }
    }
    /* edição do NA: vértices */
    if(op.editaNA&&agua&&!op.limpo){
      ctx.fillStyle=T.agua; ctx.strokeStyle=T.papel; ctx.lineWidth=2;
      for(const p of agua){ ctx.beginPath(); ctx.rect(X(p[0])-6,Y(p[1])-6,12,12); ctx.fill(); ctx.stroke(); }
    }

    /* rótulos dos eixos por cima de tudo */
    ctx.fillStyle=T.painel; ctx.fillRect(0,h-18,w,18); ctx.fillRect(0,0,46,h-18);
    ctx.fillStyle=T.fraca; ctx.textBaseline='middle';
    for(let x=Math.ceil(mx0/px)*px;x<=mx1;x+=px){ const t=fmt(x,px<1?1:0); ctx.fillText(t,X(x)-ctx.measureText(t).width/2,h-9); }
    for(let z=Math.ceil(mz0/pz)*pz;z<=mz1;z+=pz){ if(Y(z)<h-22) ctx.fillText(fmt(z,pz<1?1:0),4,Y(z)); }
    ctx.textBaseline='alphabetic';
    ctx.fillText('m',w-14,h-22);

    /* sismo */
    const kh=GM.num(sec.sismo&&sec.sismo.kh,0), kv=GM.num(sec.sismo&&sec.sismo.kv,0);
    if(kh||kv){
      const dir=(res&&res.sentido||'dir')==='dir'?1:-1, x=w-150, y=h-48;      /* canto de baixo: o de cima é dos botões */
      ctx.fillStyle=T.painel; ctx.fillRect(x-8,y-13,150,20); ctx.fillStyle=ctx.strokeStyle='#b91c1c'; ctx.lineWidth=1.6;
      ctx.fillText('kh = '+fmt(kh,2)+(kv?'  kv = '+fmt(kv,2):''),x+30,y+2);
      ctx.beginPath(); ctx.moveTo(x+12-10*dir,y-2); ctx.lineTo(x+12+10*dir,y-2); ctx.lineTo(x+12+5*dir,y-6); ctx.moveTo(x+12+10*dir,y-2); ctx.lineTo(x+12+5*dir,y+2); ctx.stroke();
    }
    /* legenda dos materiais */
    if(op.legenda){
      /* Na tela, os botões do canto direito ficam por cima do desenho: se a legenda completa
         não couber ao lado deles, mostra só os nomes; se nem assim, desce para baixo deles. */
      const linhas=sec.camadas.map((c,k)=>{ const m=sec.materiais[c.mat]||{}; return {cor:m.cor||GM.CORES[k%GM.CORES.length], nome:m.nome||c.mat, txt:(m.nome||c.mat)+' — '+GM.resumoMaterial(m)}; });
      ctx.font='11px Signika, system-ui, sans-serif';
      const lh=16, x0=54, larguraDe=k=>Math.max(...linhas.map(l=>ctx.measureText(l[k]).width))+30, livre=op.legendaLivre!=null?op.legendaLivre-x0-12:Infinity;
      let chave='txt', y0=8;
      if(larguraDe('txt')>livre){ if(larguraDe('nome')<=livre) chave='nome'; else y0=Math.max(8,op.legendaTopo||8); }
      const lw=Math.min(w-70,larguraDe(chave));
      ctx.fillStyle=T.painel; ctx.fillRect(x0-6,y0-2,lw+10,linhas.length*lh+6);
      ctx.save(); ctx.beginPath(); ctx.rect(x0-6,y0-2,lw+10,linhas.length*lh+6); ctx.clip();
      linhas.forEach((l,i)=>{ ctx.fillStyle=l.cor; ctx.fillRect(x0,y0+i*lh+2,14,10); ctx.strokeStyle=T.contorno; ctx.lineWidth=1; ctx.strokeRect(x0+.5,y0+i*lh+2.5,14,10); ctx.fillStyle=T.tinta; ctx.fillText(l[chave],x0+20,y0+i*lh+11); });
      ctx.restore();
    }
    if(op.titulo){ ctx.font='600 13px Signika, system-ui, sans-serif'; ctx.fillStyle=T.tinta; ctx.fillText(op.titulo,54,h-26); }
    ctx.restore();
  };
  GM.resumoMaterial=m=>{
    const n=GM.num, md=m.modelo||'mc', g='γ '+fmt(n(m.gama,0),1);
    if(md==='mc') return g+' · c′ '+fmt(n(m.c,0),1)+' kPa · φ′ '+fmt(n(m.phi,0),1)+'°'+(n(m.ru,0)?' · ru '+fmt(n(m.ru,0),2):'');
    if(md==='su') return g+' · Su '+fmt(n(m.su,0),1)+' kPa'+(n(m.suK,0)?' + '+fmt(n(m.suK,0),2)+' kPa/m':'');
    if(md==='hb') return g+' · σci '+fmt(n(m.sci,0),0)+' MPa · GSI '+fmt(n(m.GSI,0),0)+' · mi '+fmt(n(m.mi,0),0)+' · D '+fmt(n(m.D,0),1);
    if(md==='leps') return g+' · φ0 '+fmt(n(m.phi0,0),1)+'° − '+fmt(n(m.dphi,0),1)+'°/log σ';
    if(md==='tab') return g+' · envoltória por pontos';
    return g+' · impenetrável';
  };

  /* O que há debaixo do ponteiro: alças primeiro, depois a fatia. */
  GM.alvo=(sec,res,v,px,py,op)=>{
    op=op||{};
    const raio=op.raio||16, perto=(x,z)=>{ const p=GM.tela(v,x,z); return Math.hypot(p[0]-px,p[1]-py)<=raio; };
    if(op.manualCirc){
      const c=op.manualCirc;
      if(perto(c.fundo[0],c.fundo[1])) return {tipo:'manual', alca:'fundo'};
      if(perto(c.pe[0],c.pe[1])) return {tipo:'manual', alca:'entrada'};
      if(perto(c.ps[0],c.ps[1])) return {tipo:'manual', alca:'saida'};
    }
    if(op.editaNA&&sec.agua&&sec.agua.linha){
      for(let i=0;i<sec.agua.linha.length;i++) if(perto(sec.agua.linha[i][0],sec.agua.linha[i][1])) return {tipo:'na', i};
    }
    if(op.faixas){
      for(const nome of ['entrada','saida']){
        const rg=op.faixas[nome]; if(!rg) continue;
        for(let k=0;k<2;k++){ const p=GM.tela(v,rg[k],lerp(sec.terreno,rg[k])); if(Math.hypot(p[0]-px,p[1]-(nome==='entrada'?5:9)-py)<=raio) return {tipo:'faixa', nome, k}; }
      }
    }
    /* CARGA DE ARRASTAR (print IMG_0269, 23/11/2026: "essa carga aqui eu devo poder arrastar com
       o mouse, com caneta, para definir o local"): as pontas mudam o início e o fim; o corpo
       (a faixa das setas) leva a carga inteira. Fica fora quando se edita o NA ou a superfície à mão. */
    if(op.alcasCarga){
      const C=sec.cargas||[], [xm]=GM.mundo(v,px,py);
      for(let i=C.length-1;i>=0;i--){
        const x1=GM.num(C[i].x1,NaN), x2=GM.num(C[i].x2,NaN); if(!Number.isFinite(x1)||!Number.isFinite(x2)||!GM.num(C[i].q,0)) continue;
        /* a ponta só é pega por quem está mais perto dela que do meio da carga: numa carga curta
           (mais estreita que o dedo) o meio continua levando a carga inteira */
        const pm=GM.tela(v,(x1+x2)/2,0)[0];
        for(const k of ['x1','x2']){ const x=k==='x1'?x1:x2, p=GM.tela(v,x,lerp(sec.terreno,x)); if(Math.hypot(p[0]-px,p[1]-13-py)<=raio&&Math.abs(px-p[0])<=Math.abs(px-pm)) return {tipo:'carga', i, alca:k}; }
      }
      for(let i=C.length-1;i>=0;i--){
        const x1=GM.num(C[i].x1,NaN), x2=GM.num(C[i].x2,NaN); if(!Number.isFinite(x1)||!Number.isFinite(x2)||!GM.num(C[i].q,0)) continue;
        if(xm<Math.min(x1,x2)||xm>Math.max(x1,x2)) continue;
        const p=GM.tela(v,xm,lerp(sec.terreno,xm)); if(py<=p[1]+6&&py>=p[1]-36) return {tipo:'carga', i, alca:'corpo'};
      }
    }
    const an=op.manual?op.manualRes:(res&&res.critica);
    if(an&&an.ok&&an.fatias){
      const [x,z]=GM.mundo(v,px,py);
      for(let i=0;i<an.fatias.length;i++){
        const f=an.fatias[i], a=Math.min(f.xl,f.xr), b=Math.max(f.xl,f.xr);
        if(x>=a&&x<=b){ const t=(x-f.xl)/(f.xr-f.xl||1), zt=f.zgl+(f.zgr-f.zgl)*t, zb=f.zbl+(f.zbr-f.zbl)*t; if(z<=zt+1/v.esc*4&&z>=zb-1/v.esc*4) return {tipo:'fatia', i}; }
      }
    }
    return null;
  };
})(typeof window!=='undefined'?window:globalThis);
