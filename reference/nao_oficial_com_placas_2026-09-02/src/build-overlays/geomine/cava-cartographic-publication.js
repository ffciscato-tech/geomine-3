/* Publicação cartográfica do motor Cava2.
   O mesmo conjunto de estilos alimenta o Mapa 2D, a legenda e o Layout. */
function cava2BlocosDoDesign(design){
  if(Array.isArray(design?._blocos)&&design._blocos.length)return design._blocos;
  return design?[{key:'',index:0,z0:0,base:null,design}]:[];
}
function cava2Props(meta,extra){
  return {DESENHO:meta?.nome||'Desenho 2D',DESIGN_ID:meta?.id||'',
    PROJETO:tipoNome(meta?.tipo),ORIGEM:'Área 2D · Cava2',...(extra||{})};
}
function cava2NomeBloco(meta,indice){
  const raiz=meta?.tipo==='pilha'?'DCE':'CAVA';
  return indice>0?`${raiz} ${indice+1}`:raiz;
}
function cava2GeomFechada(P){
  const g=limpaPontos(P);return g.length>=3?fechaAnel(g):[];
}
function cava2MetaCorredor(c,corredores,i){
  const retorno=!!c?.gancho,banco=retorno?null:(corredores||[]).slice(0,i+1).filter(q=>!q?.gancho).length;
  return {retorno,banco,elemento:retorno?'Retorno':'Rampa',
    classe:retorno?'rb31-retorno':'rb31-rampa'};
}

/* Produto analítico fechado, reservado ao cálculo Área 2D × MDT. A versão
   anterior entregava ao algoritmo os pedaços abertos pelas rampas; cada pedaço
   era então fechado por uma corda artificial e a curva de interseção podia
   desaparecer. Aqui cada crista/pé chega como o anel original completo. */
function feicoesFechadasParaIntersecao(design,baseZ,meta){
  if(!design)return [];
  const out=[];let fid=1;
  (design.aneis||[]).forEach((a,i)=>{
    const geom=cava2GeomFechada(a.P);if(geom.length<4)return;
    const z=n(baseZ)+n(a.z),elemento=classe(a.tp);
    out.push({geom,multi:false,zg:geom.map(()=>z),props:{FID:fid++,...cava2Props(meta,{
      ELEMENTO:elemento,COTA:z,ORDEM:(i+1)*100,BANCO:Math.floor(i/2)+1,
      TIPO:`${elemento} banco ${Math.floor(i/2)+1}`,
      CLASSE:elemento==='Crista'?'rb31-crista':'rb31-pe'})}});
  });
  const corredores=design.corredores||[];
  corredores.forEach((c,i)=>{
    const cm=cava2MetaCorredor(c,corredores,i);
    [['borda1','Borda esquerda'],['centro','Eixo'],['borda2','Borda direita']].forEach(([chave,papel],j)=>{
      const P=c[chave]||[],geom=limpaPontos(P);if(geom.length<2)return;
      const zg=P.map(p=>n(baseZ)+n(p.z));
      out.push({geom,multi:false,zg,props:{FID:fid++,...cava2Props(meta,{ELEMENTO:cm.elemento,
        COTA:zg[0],ORDEM:i*3+j+1,BANCO:cm.banco,TIPO:cm.retorno?'Retorno da rampa':`Rampa banco ${cm.banco}`,
        CLASSE:cm.classe,ORIGEM:`Área 2D · Cava2 · ${papel}`})}});
    });
  });
  return out;
}

/* Linhas cartográficas: anéis com os mesmos recortes da aba Cava, rampa e,
   por último, o limite exterior preto sobre todas as demais linhas. */
function feicoesCartograficasDoDesign(design,baseZ,meta){
  if(!design)return [];
  meta=meta||{};const out=[];let fid=1;
  const corredores=design.corredores||[],A=api(),
    rampPolys=corredores.filter(c=>!c?.gancho).map(c=>c.poly).filter(P=>Array.isArray(P)&&P.length>=3),
    rotulados=new Set();
  (design.aneis||[]).forEach((a,i)=>{
    const recorte=A&&typeof A.recortaLinhaForaRampas==='function'
      ?A.recortaLinhaForaRampas(a.P,rampPolys,a.cortesRampa):{partes:[a.P],cortado:false};
    (a.partesEntrada||recorte.partes||[]).forEach((parte,j)=>{
      let geom=limpaPontos(parte);if(!recorte.cortado)geom=fechaAnel(geom);
      if(geom.length<(recorte.cortado?2:4))return;
      const z=n(baseZ)+n(a.z),elemento=classe(a.tp),ordem=(i+1)*100+j,
        deveRotular=(a.tp==='crista'||i===0)&&!rotulados.has(i);
      if(deveRotular)rotulados.add(i);
      out.push({geom,multi:false,zg:geom.map(()=>z),props:{FID:fid++,...cava2Props(meta,{
        ELEMENTO:elemento,COTA:z,ROTULO:deveRotular?formataCota(z):'',ORDEM:ordem,
        BANCO:Math.floor(i/2)+1,CLASSE:elemento==='Crista'?'rb31-crista':'rb31-pe'})}});
    });
  });
  corredores.forEach((c,i)=>{
    const cm=cava2MetaCorredor(c,corredores,i);
    [['borda1','Borda esquerda'],['centro','Eixo'],['borda2','Borda direita']].forEach(([chave,papel],j)=>{
      const P=c[chave]||[],geom=limpaPontos(P);if(geom.length<2)return;
      const zg=P.map(p=>n(baseZ)+n(p.z)),grad=n(c.gradEfetivo??design.gradEfetivo,NaN);
      out.push({geom,multi:false,zg,props:{FID:fid++,...cava2Props(meta,{ELEMENTO:cm.elemento,
        COTA:zg[0],ROTULO:papel==='Eixo'&&!cm.retorno&&cm.banco===1?`R${Number.isFinite(grad)?` · ${formataCota(grad)}%`:''}`:'',
        ORDEM:i*3+j+1,BANCO:cm.banco,CLASSE:cm.classe,ORIGEM:`Área 2D · Cava2 · ${papel}`})}});
    });
  });
  (design.limites||[]).forEach((lim,i)=>{
    const geom=cava2GeomFechada(lim.P);if(geom.length<4)return;
    const z=n(baseZ)+n(lim.z0);
    out.push({geom,multi:false,zg:geom.map(()=>z),props:{FID:fid++,...cava2Props(meta,{
      ELEMENTO:'Limite exterior',COTA:z,ROTULO:'',ORDEM:900000+i,BANCO:null,
      CLASSE:'rb31-limite',ORIGEM:'Área 2D · Cava2 · limite exterior'})}});
  });
  return out;
}

/* Mantém a API histórica usada por exportação/testes, agora com o produto
   cartográfico completo. O cálculo da interseção usa a função fechada acima. */
function feicoesDoDesign(design,baseZ,meta){
  return feicoesCartograficasDoDesign(design,baseZ,meta);
}

/* A pintura não pode existir numa camada line: Leaflet e o SVG do Layout só
   preenchem gtype=polygon. Esta camada companheira reproduz área, fundo/topo e
   pista da rampa sem regras paralelas de CSS. */
function feicoesPreenchimentoDoDesign(design,baseZ,meta){
  if(!design)return [];
  const out=[];let fid=1;
  cava2BlocosDoDesign(design).forEach((b,bi)=>{
    const d=b.design,aneis=d?.aneis||[];if(!aneis.length)return;
    const exterior=aneis.at(-1),interior=aneis[0],gExt=cava2GeomFechada(exterior.P),
      gInt=cava2GeomFechada(interior.P);
    if(gExt.length>=4){const z=n(baseZ)+n(exterior.z);out.push({geom:gExt,multi:false,zg:gExt.map(()=>z),
      props:{FID:fid++,...cava2Props(meta,{ELEMENTO:'Área projetada',COTA:z,ROTULO:'',ORDEM:bi*10000+1,
        BANCO:null,CLASSE:'rb31-area'})}});}
    if(gInt.length>=4){const z=n(baseZ)+n(interior.z);out.push({geom:gInt,multi:false,zg:gInt.map(()=>z),
      props:{FID:fid++,...cava2Props(meta,{ELEMENTO:meta?.tipo==='pilha'?'Topo':'Fundo',COTA:z,
        ROTULO:cava2NomeBloco(meta,bi),ORDEM:bi*10000+2,BANCO:0,CLASSE:'rb31-fundo'})}});}
    const corredores=d.corredores||[];
    corredores.forEach((c,i)=>{
      const cm=cava2MetaCorredor(c,corredores,i);
      const geom=cava2GeomFechada(c.poly);if(geom.length<4)return;
      const src=c.poly||[],fallback=n(baseZ)+n(c.zIni),zg=geom.map((_,j)=>n(baseZ)+n(src[Math.min(j,src.length-1)]?.z,fallback-n(baseZ)));
      out.push({geom,multi:false,zg,props:{FID:fid++,...cava2Props(meta,{ELEMENTO:cm.elemento,COTA:zg[0],
        ROTULO:'',ORDEM:bi*10000+100+i,BANCO:cm.banco,CLASSE:cm.retorno?'rb31-retorno-area':'rb31-rampa-area'})}});
    });
  });
  return out;
}

function cava2DefinicoesLinha(tipo){
  return tipo==='pilha'?
    [['Limite exterior','#101010','',2.6,0],['Crista','#333c48','',1.8,.35],
      ['Pé','#8a93a0','6 4',1.1,.18],['Rampa','#2c3e70','',1.2,.28],['Retorno','#1f6fb2','',1.4,.36],
      ['Interseção','#000000','',1.2,0]]:
    [['Limite exterior','#101010','',2.6,0],['Crista','#8a4b1e','',1.8,.35],
      ['Pé','#c08a52','6 4',1.1,.18],['Rampa','#b3541e','',1.2,.32],['Retorno','#d06b24','',1.4,.4],
      ['Interseção','#000000','',1.2,0]];
}
function categorias(feats,tipo){
  return cava2DefinicoesLinha(tipo).map(([value,color,dash,weight,fill])=>({value,label:value,
    color,stroke:color,weight,dash,opacity:1,fill,visible:true,vis:true,
    count:(feats||[]).filter(f=>f.props?.ELEMENTO===value).length}));
}
function cava2MesclaVisibilidade(cats,antigas){
  const mapa=new Map((antigas||[]).map(c=>[String(c.value),c]));
  cats.forEach(c=>{const a=mapa.get(String(c.value));if(a){
    if(a.vis===false)c.vis=false;if(a.visible===false)c.visible=false;
  }});return cats;
}
function estiloCamada(L,feats){
  const cats=cava2MesclaVisibilidade(categorias(feats,L._cava2Kind),L.sym?.cats);
  L.color='#111111';L.weight=1.5;L.fill=0;
  L.fields=['FID','DESENHO','DESIGN_ID','PROJETO','ELEMENTO','COTA','ROTULO','ORDEM','BANCO','MDT','ORIGEM'];
  L.sym={mode:'cat',color:'#111111',stroke:'#111111',hatch:'solid',hatchScale:1,weight:1.5,
    fill:0,dash:'',field:'ELEMENTO',classes:[],cats,ramp:'amber'};
  L.labelField='ROTULO';L.lbl={...(L.lbl||defaultLabelCfg()),font:'Signika, sans-serif',style:'normal',
    size:9.5,color:L._cava2Kind==='pilha'?'#333c48':'#8a4b1e',halo:'#f6f4ee',haloW:1.4,
    place:'curva',anchor:'middle',onMap:true,unique:false,rep:0};
  L.clsOpen=true;L._cava2Managed=true;L._cava2StyleVersion=2;
}
function estiloCamadaPreenchimento(L,feats){
  const pilha=L._cava2Kind==='pilha',defs=pilha?
    [['Área projetada','#9aa0a8','#9aa0a8',0,.35],['Topo','#c9ced6','#c9ced6',0,1],
      ['Rampa','#2c3e70','#2c3e70',1.2,.28],['Retorno','#1f6fb2','#1f6fb2',1.4,.36]]:
    [['Área projetada','#c9b18a','#c9b18a',0,.35],['Fundo','#efe6d2','#efe6d2',0,1],
      ['Rampa','#b3541e','#b3541e',1.2,.32],['Retorno','#d06b24','#d06b24',1.4,.4]],
    cats=cava2MesclaVisibilidade(defs.map(([value,color,stroke,weight,fill])=>({value,label:value,color,
      stroke,weight,dash:'',opacity:1,fill,hatch:'solid',hatchScale:1,visible:true,vis:true,
      count:(feats||[]).filter(f=>f.props?.ELEMENTO===value).length})),L.sym?.cats);
  L.color=pilha?'#9aa0a8':'#c9b18a';L.weight=0;L.fill=.35;
  L.fields=['FID','DESENHO','DESIGN_ID','PROJETO','ELEMENTO','COTA','ROTULO','ORDEM','BANCO','ORIGEM'];
  L.sym={mode:'cat',color:L.color,stroke:L.color,hatch:'solid',hatchScale:1,weight:0,fill:.35,
    dash:'',field:'ELEMENTO',classes:[],cats,ramp:'amber'};
  L.labelField='ROTULO';L.lbl={...(L.lbl||defaultLabelCfg()),font:'Signika, sans-serif',style:'normal',
    size:13,color:pilha?'#333c48':'#8a4b1e',halo:'#f6f4ee',haloW:1.6,place:'center',anchor:'middle',
    onMap:true,unique:true,rep:0};
  L.clsOpen=true;L._cava2Managed=true;L._cava2StyleVersion=2;
}

function camadaDoDesenho(id){
  return (S.layers||[]).find(L=>String(L._cava2DesignId||'')===String(id||'')&&L.gtype==='line')||null;
}
function camadaPreenchimentoDoDesenho(id){
  return (S.layers||[]).find(L=>String(L._cava2DesignId||'')===String(id||'')&&L.gtype==='polygon')||null;
}
function camadaPreenchimentoCorteDoDesenho(id){
  return (S.layers||[]).find(L=>String(L._cava2CutFillOf||'')===String(id||''))||null;
}
function nomeCamadaPreenchimento(d){return `${nomeCamada(d)} · preenchimento e rampas`;}
function nomeCamadaPreenchimentoCorte(d){return `${nomeCamada(d)} · preenchimento cortado pelo MDT`;}
function cava2OrdenaLinhaSobrePreenchimento(L,F){
  if(!L||!F)return;
  const li=(S.layers||[]).indexOf(L),fi=(S.layers||[]).indexOf(F),pos=Math.max(0,Math.min(li<0?1e9:li,fi<0?1e9:fi));
  S.layers=(S.layers||[]).filter(q=>q!==L&&q!==F);S.layers.splice(Math.min(pos,S.layers.length),0,L,F);
  const kl=`L:${L.id}`,kf=`L:${F.id}`,st=(S.stack||[]),idx=Math.max(0,st.indexOf(kl)>=0?st.indexOf(kl):(st.indexOf(kf)>=0?st.indexOf(kf):0));
  S.stack=st.filter(k=>k!==kl&&k!==kf);S.stack.splice(Math.min(idx,S.stack.length),0,kl,kf);
  if(typeof zApply==='function')zApply();
}

function publicaDesenho(d,design,silencioso){
  if(!d)return null;
  const feats=feicoesCartograficasDoDesign(design,n(d.baseZ),d),areas=feicoesPreenchimentoDoDesign(design,n(d.baseZ),d),
    ativo=S.activeId;let F=camadaPreenchimentoDoDesenho(d.id),L=camadaDoDesenho(d.id),criou=false;
  if(!F&&areas.length){
    F=addLayer({name:nomeCamadaPreenchimento(d),gtype:'polygon',features:areas,
      fields:['FID','DESENHO','DESIGN_ID','PROJETO','ELEMENTO','COTA','ROTULO','ORDEM','BANCO','ORIGEM'],
      crs:d.crs||S.workCRS,color:d.tipo==='pilha'?'#9aa0a8':'#c9b18a',src:'Área 2D · Cava2 · estilo'});
    F._cava2DesignId=d.id;F._cava2Role='fill';criou=true;
  }else if(F){F.features=areas;F.crs=d.crs||F.crs||S.workCRS;F.src='Área 2D · Cava2 · estilo';F.name=nomeCamadaPreenchimento(d);}
  if(F){F._cava2Kind=d.tipo;F._cava2Engine=clone(d.engine);estiloCamadaPreenchimento(F,areas);}
  if(!L&&!feats.length){if(F&&typeof drawLayer==='function')drawLayer(F);return null;}
  if(!L){
    L=addLayer({name:nomeCamada(d),gtype:'line',features:feats,
      fields:['FID','DESENHO','DESIGN_ID','PROJETO','ELEMENTO','COTA','ROTULO','ORDEM','BANCO','ORIGEM'],
      crs:d.crs||S.workCRS,color:'#111111',src:'Área 2D · Cava2'});
    L._cava2DesignId=d.id;L._cava2Role='line';criou=true;
  }else{L.features=feats;L.crs=d.crs||L.crs||S.workCRS;L.src='Área 2D · Cava2';L.name=nomeCamada(d);}
  L._cava2Kind=d.tipo;L._cava2Engine=clone(d.engine);estiloCamada(L,feats);
  if(F&&criou)cava2OrdenaLinhaSobrePreenchimento(L,F);
  if(F&&typeof drawLayer==='function')drawLayer(F);if(typeof drawLayer==='function')drawLayer(L);
  if(ativo!=null&&S.layers.some(x=>x.id===ativo))S.activeId=ativo;
  if(!silencioso&&typeof refreshUI==='function')refreshUI();
  return L;
}

function designRuntime(d){
  const A=api();if(!d||!A)return null;
  const ordem=k=>k===d.tipo?-1:n(String(k).split('#')[1],0),entradas=Object.keys(A.objs||{})
    .filter(k=>k===d.tipo||k.startsWith(d.tipo+'#')).sort((a,b)=>ordem(a)-ordem(b))
    .map((key,index)=>({key,index,o:A.objs[key],design:A.objs[key]?.design})).filter(q=>q.design);
  if(!entradas.length)return null;
  const primeiro=entradas[0].design,ultimo=entradas.at(-1).design,
    raios=entradas.map(q=>+q.design.raioMinReal).filter(Number.isFinite);
  return {...primeiro,
    aneis:entradas.flatMap(q=>(q.design.aneis||[]).map(a=>({...a,_bloco:q.key,_blocoIndice:q.index}))),
    corredores:entradas.flatMap(q=>(q.design.corredores||[]).map(c=>({...c,_bloco:q.key,_blocoIndice:q.index}))),
    limites:entradas.map(q=>({key:q.key,index:q.index,P:q.o?.base||null,z0:n(q.o?.z0)})).filter(q=>Array.isArray(q.P)&&q.P.length>=3),
    _blocos:entradas.map(q=>({key:q.key,index:q.index,z0:n(q.o?.z0),base:q.o?.base||null,design:q.design})),
    avisos:entradas.flatMap(q=>q.design.avisos||[]),
    curvasAgudas:entradas.flatMap(q=>q.design.curvasAgudas||[]),
    raioMinReal:raios.length?Math.min(...raios):null,
    nBancos:entradas.reduce((s,q)=>s+n(q.design.nBancos),0),
    areaBase:n(primeiro?.areaBase),areaFinal:n(ultimo?.areaFinal),
    vol:entradas.reduce((s,q)=>s+n(q.design.vol),0),
    rampaDesenv:entradas.reduce((s,q)=>s+n(q.design.rampaDesenv),0)};
}

function mostraBrutaSemCorte(d,mensagem,erro){
  const L=camadaDoDesenho(d?.id),F=camadaPreenchimentoDoDesenho(d?.id),C=camadaCorteDoDesenho(d?.id),
    CF=camadaPreenchimentoCorteDoDesenho(d?.id);
  if(L){L.visible=true;if(typeof drawLayer==='function')drawLayer(L);}
  if(F){F.visible=true;if(typeof drawLayer==='function')drawLayer(F);}
  if(C){C.visible=false;if(typeof drawLayer==='function')drawLayer(C);}
  if(CF){CF.visible=false;if(typeof drawLayer==='function')drawLayer(CF);}
  if(mensagem)status(mensagem,erro);return null;
}

/* A interseção publicada precisa ser um ANEL, e não uma costura entre pontas
   abertas de bancos diferentes. O motor radial percorre 360° em ordem, mas pode
   devolver mais de um fragmento quando algum raio sai do MDT. Agregamos todos os
   fragmentos numa única função polar r(θ), usamos a interseção da superfície como
   apoio nos raios ausentes e interpolamos apenas os intervalos ainda vazios.
   Isso mantém um ponto por direção, fecha a volta e impede o zigue-zague. */
function cava2SegmentosSeCruzam(a,b,c,d,eps){
  const o=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]),
    o1=o(a,b,c),o2=o(a,b,d),o3=o(c,d,a),o4=o(c,d,b);
  return o1*o2<-(eps*eps)&&o3*o4<-(eps*eps);
}
function cava2AnelSemAutocruzamento(g,eps){
  const n0=(g||[]).length-1;if(n0<3)return false;
  for(let i=0;i<n0;i++)for(let j=i+1;j<n0;j++){
    if(j===i||j===i+1||(i===0&&j===n0-1))continue;
    if(cava2SegmentosSeCruzam(g[i],g[(i+1)%n0],g[j],g[(j+1)%n0],eps))return false;
  }
  return true;
}
function cava2ReconstruiAnelRadial(curvas,linhas,g,apoio){
  const base=linhas?.[0]?.ring;if(!base?.length||!g)return null;
  const cx=base.reduce((s,p)=>s+n(p[0]),0)/base.length,
    cy=base.reduce((s,p)=>s+n(p[1]),0)/base.length,
    raioMax=Math.max(...linhas.flatMap(ln=>(ln.ring||[]).map(p=>Math.hypot(n(p[0])-cx,n(p[1])-cy))),1),
    alvo=Math.max(.35,Math.min(1.5,Math.max(n(g.cs,1),n(g.csy,n(g.cs,1)))*.65)),
    N=Math.max(240,Math.min(1440,Math.ceil(2*Math.PI*raioMax/alvo))),doisPi=2*Math.PI,
    fechaTol=Math.max(1e-7,n(g.cs,1)*1e-6),eps=Math.max(1e-9,n(g.cs,1)*1e-9),bins=Array(N).fill(null);
  const agrega=(fs,fonte)=>{
    for(const f of fs||[]){
      const raw=(f.geom||[]).map((p,i)=>({p:[n(p[0]),n(p[1])],
        z:Number.isFinite(+f.zg?.[i])?+f.zg[i]:NaN}));
      if(raw.length>2&&Math.hypot(raw[0].p[0]-raw.at(-1).p[0],raw[0].p[1]-raw.at(-1).p[1])<=fechaTol)raw.pop();
      for(const q of raw){
        const r=Math.hypot(q.p[0]-cx,q.p[1]-cy);if(!(r>eps))continue;
        let a=Math.atan2(q.p[1]-cy,q.p[0]-cx);if(a<0)a+=doisPi;
        const k=((Math.round(a*N/doisPi)%N)+N)%N,alvoA=k*doisPi/N,
          err=Math.abs(Math.atan2(Math.sin(a-alvoA),Math.cos(a-alvoA))),atual=bins[k],cand={...q,r,err,fonte};
        if(fonte==='radial'){
          if(!atual||atual.fonte!=='radial'||err<atual.err)bins[k]=cand;
        }else if(!atual||atual.fonte!=='radial'&&r>atual.r)bins[k]=cand;
      }
    }
  };
  agrega(curvas,'radial');const amostrasRadiais=bins.filter(Boolean).length;
  agrega(apoio,'superficie');const conhecidos=bins.map((q,i)=>q?i:-1).filter(i=>i>=0);
  /* Poucas amostras isoladas não definem uma interseção. Um arco real, mesmo
     interrompido pela borda do raster, fornece dezenas de direções. */
  if(conhecidos.length<Math.max(8,Math.ceil(N*.01)))return null;
  let interpoladas=0;
  for(let ii=0;ii<conhecidos.length;ii++){
    const ia=conhecidos[ii],ib=conhecidos[(ii+1)%conhecidos.length],salto=(ib-ia+N)%N;
    if(salto<=1)continue;
    const A=bins[ia],B=bins[ib];
    for(let s=1;s<salto;s++){
      const u=s/salto,k=(ia+s)%N,a=k*doisPi/N,r=A.r+(B.r-A.r)*u,
        p=[cx+Math.cos(a)*r,cy+Math.sin(a)*r],zt=sampleZbil(g,p[0],p[1]),
        zi=Number.isFinite(A.z)&&Number.isFinite(B.z)?A.z+(B.z-A.z)*u:(Number.isFinite(A.z)?A.z:B.z);
      bins[k]={p,z:Number.isFinite(zt)?zt:zi,r,err:0,fonte:'interpolada'};interpoladas++;
    }
  }
  if(bins.some(q=>!q))return null;
  const geom=bins.map(q=>q.p.slice()),zg=bins.map(q=>Number.isFinite(q.z)?q.z:sampleZbil(g,q.p[0],q.p[1]));
  if(geom.some((p,i)=>i&&Math.hypot(p[0]-geom[i-1][0],p[1]-geom[i-1][1])<=eps))return null;
  geom.push(geom[0].slice());zg.push(zg[0]);
  if(!cava2AnelSemAutocruzamento(geom,eps))return null;
  let area=0;for(let i=1;i<geom.length;i++)area+=geom[i-1][0]*geom[i][1]-geom[i][0]*geom[i-1][1];
  if(Math.abs(area)<=eps)return null;
  return {geom,zg,area:Math.abs(area)/2,amostrasRadiais,
    amostrasSuperficie:conhecidos.length-amostrasRadiais,interpoladas};
}

/* Reutiliza a ferramenta radial que já faz parte do motor, mas publica apenas
   a volta completa, reordenada pelos próprios raios. Fragmentos ou resultados
   autointersectantes são rejeitados em vez de aparecerem como zigue-zague. */
function cava2IntersecaoRadialExistente(src,g,modoUp,apoio){
  if(typeof cavaIntersecaoRadial!=='function'||!g)return [];
  const linhas=(src||[]).filter(f=>['Crista','Pé'].includes(String(f?.props?.ELEMENTO||'')))
    .map(f=>{
      const geom=(f.geom||[]).map(p=>[n(p[0]),n(p[1])]);
      if(geom.length>3&&Math.hypot(geom[0][0]-geom.at(-1)[0],geom[0][1]-geom.at(-1)[1])<1e-7)geom.pop();
      const zs=(f.zg||[]).filter(Number.isFinite),z=Number.isFinite(+f.props?.COTA)?+f.props.COTA:
        (zs.length?zs.reduce((a,b)=>a+b,0)/zs.length:NaN);
      return {ring:geom,z,bench:n(f.props?.BANCO)};
    }).filter(q=>q.ring.length>=3&&Number.isFinite(q.z));
  if(linhas.length<2)return [];
  linhas.sort((a,b)=>modoUp?a.z-b.z:b.z-a.z);
  const cotas=linhas.map(q=>q.z),H=Math.max(.1,...cotas.slice(1)
    .map((z,i)=>Math.abs(z-cotas[i])).filter(x=>x>.01));
  let curvas=[];
  try{curvas=cavaIntersecaoRadial(linhas,g,H)||[];}
  catch(e){console.warn('Interseção radial existente',e);return [];}
  const anel=cava2ReconstruiAnelRadial(curvas,linhas,g,apoio);if(!anel)return [];
  return [{geom:anel.geom,zg:anel.zg,multi:false,props:{TIPO:'Interseção cava × terreno',
    BANCO:null,COTA:null,ALTURA:H,BERMA:null,ANGULO:null,CLASSE:'daylight',
    METODO:'radial existente 360° por anéis × MDT',TOPOLOGIA:'anel fechado'}}];
}
function cava2RecortaLimitesNoMdt(design,d,R,g,modoUp,passo){
  if(typeof cavaRecortaFeicaoNoMdt!=='function')return [];
  const src=feicoesCartograficasDoDesign(design,n(d.baseZ),d)
    .filter(f=>f.props?.ELEMENTO==='Limite exterior');let fid=900001;
  return src.flatMap(f=>(cavaRecortaFeicaoNoMdt(f,g,modoUp,passo)||[]).map(q=>({...q,
    props:{...(f.props||{}),...(q.props||{}),FID:fid++,DESENHO:d.nome,DESIGN_ID:d.id,
      PROJETO:tipoNome(d.tipo),ELEMENTO:'Limite exterior',CLASSE:'rb31-limite',MDT:R.name||'MDT',
      ORIGEM:'Área 2D · Cava2 · limite exterior cortado pelo MDT'}})));
}
function cava2AreasCortadasNoMdt(design,d,R,g,modoUp,passo,inter){
  if(typeof cavaRecortaPoligonoNoMdt!=='function')return [];
  let fid=1;const contorno=(inter||[]).find(f=>f.props?.ELEMENTO==='Interseção'),out=[];
  /* A área geral usa literalmente o anel de daylight. Recortar apenas a borda
     do antigo polígono de projeção não detecta uma ilha inteiramente interna e
     deixava o preenchimento ultrapassar a linha preta. */
  if(contorno?.geom?.length>3)out.push({geom:contorno.geom.map(p=>p.slice()),multi:false,
    zg:(contorno.zg||[]).slice(),props:{FID:fid++,...cava2Props(d,{ELEMENTO:'Área projetada',
      COTA:null,ROTULO:'',ORDEM:1,BANCO:null,CLASSE:'rb31-area',MDT:R.name||'MDT',
      ORIGEM:'Área 2D · Cava2 · área limitada pelo anel de interseção'})}});
  const detalhes=feicoesPreenchimentoDoDesign(design,n(d.baseZ),d)
    .filter(f=>f.props?.ELEMENTO!=='Área projetada');
  out.push(...detalhes.flatMap(f=>
    (cavaRecortaPoligonoNoMdt(f,g,modoUp,passo)||[]).map(q=>({...q,multi:false,
      props:{...(f.props||{}),...(q.props||{}),FID:fid++,DESENHO:d.nome,DESIGN_ID:d.id,
        PROJETO:tipoNome(d.tipo),ELEMENTO:f.props?.ELEMENTO,COTA:f.props?.COTA,
        CLASSE:f.props?.CLASSE,MDT:R.name||'MDT',ORIGEM:'Área 2D · Cava2 · preenchimento cortado pelo MDT'}}))));
  return out;
}
function cava2PublicaPreenchimentoCortado(d,R,areas){
  let F=camadaPreenchimentoCorteDoDesenho(d.id);
  if(!areas.length){if(F)removeCamadaGerada(F);return null;}
  if(!F){
    F=addLayer({name:nomeCamadaPreenchimentoCorte(d),gtype:'polygon',features:areas,
      fields:['FID','DESENHO','DESIGN_ID','PROJETO','ELEMENTO','COTA','ROTULO','ORDEM','BANCO','MDT','ORIGEM'],
      crs:d.crs||S.workCRS,color:d.tipo==='pilha'?'#9aa0a8':'#c9b18a',
      src:'Área 2D · Cava2 · preenchimento cortado pelo MDT'});
    F._cava2CutFillOf=d.id;F._cava2Role='cut-fill';
  }else{F.features=areas;F.crs=d.crs||F.crs||S.workCRS;F.name=nomeCamadaPreenchimentoCorte(d);}
  F._cava2MdtId=R.id;F._cava2Kind=d.tipo;F._cava2Managed=true;F.visible=true;
  estiloCamadaPreenchimento(F,areas);return F;
}
function publicaCorteMdt(d,design,silencioso,forcar,finalizar){
  const finalizado=!!(finalizar||d?.cutMdt),R=rasterDoDesenho(d),g=R?.d;
  if(!d||!g)return mostraBrutaSemCorte(d,'Escolha um MDT válido para calcular a interseção.',true);
  if(typeof cavaRecortaAneisFechadosNoMdt!=='function')
    return mostraBrutaSemCorte(d,'O algoritmo de interseção da cava não está disponível.',true);
  const hash=hashCorteMdt(d,R,finalizado),existente=camadaCorteDoDesenho(d.id),
    fillCorte=camadaPreenchimentoCorteDoDesenho(d.id);
  if(!forcar&&existente&&estado.cutHashes[d.id]===hash){
    const bruta=camadaDoDesenho(d.id),fill=camadaPreenchimentoDoDesenho(d.id);
    if(bruta){bruta.visible=!finalizado;drawLayer(bruta);}
    if(fill){fill.visible=!finalizado;drawLayer(fill);}
    if(fillCorte){fillCorte.visible=finalizado;drawLayer(fillCorte);}
    existente.visible=true;drawLayer(existente);return existente;
  }
  const src=feicoesFechadasParaIntersecao(design,n(d.baseZ),d);
  if(!src.length){
    if(existente)removeCamadaGerada(existente);if(fillCorte)removeCamadaGerada(fillCorte);estado.cutHashes[d.id]=null;
    return mostraBrutaSemCorte(d,silencioso?'':`${d.nome}: desenhe primeiro um limite fechado.`,!silencioso);
  }
  const passo=Math.max(.2,Math.min(.75,n(g.cs,.5))),modoUp=d.tipo==='pilha';let q;
  try{q=cavaRecortaAneisFechadosNoMdt(feicoesCompativeisCorte(src),g,modoUp,passo);}
  catch(e){console.error('Interseção Área 2D × MDT',e);return mostraBrutaSemCorte(d,
    `Falha ao calcular a interseção com “${R.name}”: ${e.message||e}`,true);}
  const normalizadas=normalizaCorteMdt(q?.feats,d,R),
    apoio=normalizadas.filter(f=>f.props?.ELEMENTO==='Interseção');
  let todas=normalizadas.filter(f=>f.props?.ELEMENTO!=='Interseção');
  /* A malha continua responsável pelo corte das strings. A linha apresentada,
     porém, vem da volta radial 360° já existente, que garante a ordem circular
     e impede as ligações triangulares entre bancos vistas anteriormente. */
  const inter=normalizaCorteMdt(cava2IntersecaoRadialExistente(src,g,modoUp,apoio),d,R)
    .filter(f=>f.props?.ELEMENTO==='Interseção');
  if(!inter.length){
    if(existente)removeCamadaGerada(existente);if(fillCorte)removeCamadaGerada(fillCorte);estado.cutHashes[d.id]=null;
    return mostraBrutaSemCorte(d,`${d.nome}: não foi possível formar uma interseção fechada e válida com “${R.name}” na cota ${formataCota(d.baseZ)} m.`,!silencioso);
  }
  todas=todas.concat(inter);
  const limites=finalizado?cava2RecortaLimitesNoMdt(design,d,R,g,modoUp,passo):[],
    feats=finalizado?todas.concat(limites):inter,ativo=S.activeId;let C=existente;
  if(!C){
    C=addLayer({name:nomeCorteMdt(d,R),gtype:'line',features:feats,
      fields:['FID','DESENHO','DESIGN_ID','PROJETO','ELEMENTO','COTA','ROTULO','ORDEM','BANCO','MDT','ORIGEM'],
      crs:d.crs||S.workCRS,color:'#000000',src:'Área 2D · Cava2 · interseção dinâmica fechada'});
    C._cava2CutOf=d.id;
  }else{C.features=feats;C.crs=d.crs||C.crs||S.workCRS;C.name=nomeCorteMdt(d,R);
    C.src=finalizado?'Área 2D · Cava2 · cava cortada':'Área 2D · Cava2 · interseção dinâmica fechada';}
  C._cava2MdtId=R.id;C._cava2Kind=d.tipo;C._cava2Managed=true;C._cava2CutFinalized=finalizado;
  C._cava2IntersectionPreview=!finalizado;C.visible=true;estiloCamada(C,feats);
  const L=camadaDoDesenho(d.id),F=camadaPreenchimentoDoDesenho(d.id),
    areas=finalizado?cava2AreasCortadasNoMdt(design,d,R,g,modoUp,passo,inter):[],
    CF=finalizado?cava2PublicaPreenchimentoCortado(d,R,areas):camadaPreenchimentoCorteDoDesenho(d.id);
  if(L){L.visible=!finalizado;drawLayer(L);}if(F){F.visible=!finalizado;drawLayer(F);}
  if(CF){CF.visible=finalizado;drawLayer(CF);}drawLayer(C);if(CF)cava2OrdenaLinhaSobrePreenchimento(C,CF);
  if(ativo!=null&&S.layers.some(x=>x.id===ativo))S.activeId=ativo;
  estado.cutHashes[d.id]=hash;if(!silencioso&&typeof refreshUI==='function')refreshUI();return C;
}

function limpaCamadasDoDesenho(){
  clearTimeout(estado.syncTimer);estado.syncTimer=0;const d=desenhoAtual();if(!d)return false;
  d.engine=leEstadoMotor();estado.cutHashes[d.id]=null;
  const removidas=[camadaDoDesenho(d.id),camadaPreenchimentoDoDesenho(d.id),camadaCorteDoDesenho(d.id),
    camadaPreenchimentoCorteDoDesenho(d.id)].filter(Boolean);
  removidas.forEach(removeCamadaGerada);salvaRegistroLocal();if(typeof refreshUI==='function')refreshUI();atualizaContexto();
  status(`${d.nome}: desenho e ${removidas.length} camada(s) gerada(s) removidos.`);
  try{if(S._view==='v3d'&&typeof v3Auto==='function')v3Auto();}catch(e){}return true;
}
function renomeiaAtual(nome){
  const d=desenhoAtual();if(!d)return;d.nome=nomeUnico(nome||proximoNome(d.tipo),d.id);
  const e=document.getElementById('cava2Name');if(e)e.value=d.nome;
  const L=camadaDoDesenho(d.id),F=camadaPreenchimentoDoDesenho(d.id),C=camadaCorteDoDesenho(d.id),
    CF=camadaPreenchimentoCorteDoDesenho(d.id);
  if(L)L.name=nomeCamada(d);if(F)F.name=nomeCamadaPreenchimento(d);if(C)C.name=nomeCorteMdt(d,rasterDoDesenho(d));
  if(CF)CF.name=nomeCamadaPreenchimentoCorte(d);
  if(typeof refreshUI==='function')refreshUI();renderAbas();salvaRegistroLocal();status(`Desenho renomeado para “${d.nome}”.`);
}
function sincronizaCamadas(manual){
  clearTimeout(estado.syncTimer);estado.syncTimer=0;const A=api(),d=desenhoAtual();
  if(!A||!d){if(manual)status('A área 2D ainda está carregando.',true);return false;}
  salvaAtual(false);const design=designRuntime(d),L=publicaDesenho(d,design,true),R=rasterDoDesenho(d),
    C=R?publicaCorteMdt(d,design,true,false,!!d.cutMdt):null;
  if(manual)reconstroiCamadasAusentes();if(typeof refreshUI==='function')refreshUI();
  try{if(typeof layoutSeVisivel==='function')layoutSeVisivel();}catch(e){}
  try{if(S._view==='v3d'&&typeof v3Auto==='function')v3Auto();}catch(e){}
  const total=L?.features?.length||0,ni=C?.features?.filter(f=>f.props?.ELEMENTO==='Interseção').length||0;
  atualizaContexto();salvaRegistroLocal();sincronizaSeletorMdtMotor(d);
  status(total?`${d.nome}: estilo da aba Cava publicado no Mapa 2D/Layout · ${ni} interseção(ões) dinâmica(s)${d.cutMdt?' · corte final ativo':''}.`:
    `${d.nome}: desenhe um limite fechado para criar a camada.`,manual&&!total);return true;
}
function reconstroiCamadasAusentes(){
  const ativoId=estado.desenhoId,ativo=desenhoAtual();
  for(const d of estado.desenhos){
    const faltaBruta=!camadaDoDesenho(d.id),faltaFill=!camadaPreenchimentoDoDesenho(d.id),
      faltaIntersecao=!!d.mdtId&&!camadaCorteDoDesenho(d.id),
      faltaFillCorte=!!d.cutMdt&&!camadaPreenchimentoCorteDoDesenho(d.id);
    if((!faltaBruta&&!faltaFill&&!faltaIntersecao&&!faltaFillCorte)||!d.engine)continue;
    carregaMotor(d);const design=designRuntime(d);if(faltaBruta||faltaFill)publicaDesenho(d,design,true);
    if(d.mdtId)publicaCorteMdt(d,design,true,true,!!d.cutMdt);
  }
  estado.desenhoId=ativoId;if(ativo)carregaMotor(ativo);configuraMdtNoMotor();
}
function migraEstado(st){
  if(st?.version===2&&Array.isArray(st.designs))return clone(st);
  if(!st&&typeof S!=='undefined'){
    const layers=(S.layers||[]).filter(L=>L._cava2DesignId&&L.gtype==='line');
    if(layers.length){
      const designs=layers.map(L=>({id:L._cava2DesignId,nome:String(L.name||'Desenho 2D').replace(/^(Cava|DCE)\s+—\s+/i,''),
        tipo:L._cava2Kind==='pilha'?'pilha':'cava',engine:clone(L._cava2Engine)||null,baseZ:0,
        crs:L.crs||S.workCRS,fonte:null,criadoEm:new Date().toISOString()}));
      return {version:2,activeId:designs[0].id,seq:estado.seq,painelFechado:true,designs};
    }
  }
  const designs=[],e=clone(st?.engine)||null;
  if(e?.bases?.cava)designs.push({...novoRegistro('cava','Cava 1'),engine:clone(e),baseZ:n(st?.baseZ),crs:st?.crs||S.workCRS,fonte:clone(st?.fonte)||null});
  if(e?.bases?.pilha)designs.push({...novoRegistro('pilha','DCE 1'),engine:clone(e),baseZ:n(st?.baseZ),crs:st?.crs||S.workCRS,fonte:clone(st?.fonte)||null});
  if(!designs.length)designs.push(novoRegistro('cava','Cava 1'));
  return {version:2,activeId:designs[0].id,seq:estado.seq,painelFechado:true,designs};
}
