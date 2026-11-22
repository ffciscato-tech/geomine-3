/* ============================================================================
   SURPAC — importação nativa pelo ＋ Importar e pelo arrastar-e-soltar
   ----------------------------------------------------------------------------
   Pedido de 22/11/2026: "Ele deve importar nativamente tb arquivos do surpac
   como strings e dtm".
   • .str / .stx sozinho → vetores. Cada segmento de string vira uma LINHA com
     a cota de cada vértice (zg); string fechada continua fechada, porque o
     Surpac repete o primeiro ponto no fim. Nuvem de pontos guardada como uma
     string só, e ponto isolado, viram camada de PONTOS com COTA.
   • .dtm + .str de mesmo nome → Superfície TIN, triângulo por triângulo, sem
     retriangular nem reamostrar (mesmo destino das malhas OBJ/PLY/STL). O .dtm
     guarda só a topologia; as coordenadas ficam no .str — por isso o par.
   • O Surpac não grava o CRS: as coordenadas entram no CRS de trabalho, como
     no DXF.
   Os bytes são lidos pelo GeoMineSurpacReader (o mesmo leitor da Geologia),
   para os dois caminhos não divergirem.
   ========================================================================== */
const SURPAC_MAX_PONTOS=2000000;   /* mesmo teto das nuvens LiDAR em camada vetorial */
const SURPAC_CORES=['#f5a524','#37c0aa','#e05252','#7aa2f7','#bb9af7','#9ece6a',
  '#e0af68','#f7768e','#2ac3de','#c0caf5','#ff9e64','#73daca'];
function surpacExt(nome){ const m=/\.([^.\\/]+)$/.exec(String(nome||'')); return m?m[1].toLowerCase():''; }
function surpacBase(nome){
  return String(nome||'').split(/[\\/]/).pop().replace(/\.[^.]+$/,'').replace(/\s*\(\d+\)$/,'').trim();
}
function surpacChave(nome){ return surpacBase(nome).toLowerCase(); }
function surpacNum(v,dec){
  return Number(v).toLocaleString('pt-BR',dec==null?{}:{minimumFractionDigits:dec,maximumFractionDigits:dec});
}

/* LINHA OU NUVEM?  O arquivo de strings não diz: quem levanta um pátio com
   scanner ou drone grava a nuvem inteira como UMA string, e ligá-la ponto a
   ponto dá um novelo. Dois retratos de nuvem, cada um com prova forte — na
   dúvida fica linha, que é o erro que se vê e se conserta (Extrair vértices →
   pontos); linha virada em pontos perderia a ordem dos vértices:
   • ordem qualquer — perto de metade dos pontos consecutivos "volta" (virada
     de mais de 120°) E os trechos se cruzam o tempo todo. Um sinal só não
     basta: curva de nível gerada em terreno plano serrilha sem se cruzar, e
     rampa em espiral de mina subterrânea se cruza em planta sem serrilhar;
   • em fileiras (grade, varredura, malha de furos) — quase não vira nem
     cruza, mas os pontos cobrem uma SUPERFÍCIE: numa célula de 4 passos de
     lado cabem uns 16 pontos. Numa linha cabem 4, e 8 onde ela volta rente a
     si mesma (contorno de faixa estreita, grampo de estrada). A célula é 3D
     para a espiral, que em planta passa várias vezes pelo mesmo lugar, contar
     como a linha que é; e a conta só vale quando a string se espalha por
     várias células, senão um vaivém de poucos vértices longos passaria por
     nuvem.
   Medido em arquivos reais: curvas e limites têm 0 cruzamento, até 20% de
   viradas bruscas e 2 a 5 pontos por célula; nuvens têm 40–56% de viradas,
   0,1–0,7 cruzamento por trecho e mais de 16 pontos por célula. */
function surpacPareceNuvem(X,Y,Z,a,b){
  const n=b-a;
  if(n<12) return false;
  let viradas=0, bruscas=0;
  for(let i=a+1;i<b-1;i++){
    const ux=X[i]-X[i-1], uy=Y[i]-Y[i-1], vx=X[i+1]-X[i], vy=Y[i+1]-Y[i];
    const lu=Math.hypot(ux,uy), lv=Math.hypot(vx,vy);
    if(!(lu>0)||!(lv>0)) continue;
    viradas++;
    if(ux*vx+uy*vy<-0.5*lu*lv) bruscas++;
  }
  if(viradas>=8&&bruscas>=0.25*viradas){
    const m=Math.min(n-1,240), passo=(n-1)/m, T=new Int32Array(m), limite=Math.max(3,0.02*m);
    for(let k=0;k<m;k++) T[k]=a+Math.floor(k*passo);
    let cruz=0;
    for(let p=0;p<m&&cruz<limite;p++){
      const i=T[p], ax=X[i], ay=Y[i], ux=X[i+1]-ax, uy=Y[i+1]-ay;
      for(let q=p+1;q<m;q++){
        const j=T[q];
        if(j<=i+1) continue;                     /* trechos vizinhos dividem um vértice */
        const cx=X[j], cy=Y[j], dx=X[j+1], dy=Y[j+1];
        const d1=ux*(cy-ay)-uy*(cx-ax), d2=ux*(dy-ay)-uy*(dx-ax);
        if(!(d1*d2<0)) continue;
        const vx=dx-cx, vy=dy-cy;
        const d3=vx*(ay-cy)-vy*(ax-cx), d4=vx*(ay+uy-cy)-vy*(ax+ux-cx);
        if(d3*d4<0) cruz++;
      }
    }
    if(cruz>=limite) return true;
  }
  if(n<60||bruscas>=0.2*viradas) return false;
  const len=new Float64Array(n-1);
  for(let i=a;i<b-1;i++) len[i-a]=Math.hypot(X[i+1]-X[i],Y[i+1]-Y[i],Z[i+1]-Z[i]);
  len.sort();
  let nulos=0;
  while(nulos<len.length&&!(len[nulos]>0)) nulos++;
  if(nulos>=len.length) return false;
  const lado=4*len[nulos+((len.length-nulos)>>1)];   /* 4 × o passo mediano */
  let x0=Infinity, y0=Infinity, z0=Infinity;
  for(let i=a;i<b;i++){ if(X[i]<x0)x0=X[i]; if(Y[i]<y0)y0=Y[i]; if(Z[i]<z0)z0=Z[i]; }
  const cel=new Set();
  for(let i=a;i<b;i++)
    cel.add((Math.min(262143,Math.floor((X[i]-x0)/lado))*262144+Math.min(262143,Math.floor((Y[i]-y0)/lado)))*131072+
      Math.min(131071,Math.floor((Z[i]-z0)/lado)));
  return cel.size>=6&&n>=11*cel.size;
}

/* STRINGS → FEIÇÕES.  Função pura (sem DOM), para poder ser testada sozinha.
   C é a leitura compacta do .str: number[i]===0 marca o fim de um segmento.
   D1, D2… são os campos de descrição do Surpac, na posição em que vieram;
   coluna toda vazia não vira campo. Arquivo inteiro em Z=0 é dado 2D: entra
   sem cota, para o zero não ser tomado por elevação. */
function surpacVetores(C){
  const X=C.x, Y=C.y, Z=C.z, N=C.number, n=C.count;
  let tem3d=false;
  for(let i=0;i<n;i++) if(N[i]!==0&&Z[i]!==0){ tem3d=true; break; }
  const limpa=s=>String(s||'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,254);
  const partes=t=>t?t.split(',').map(limpa):[];
  const linhas=[], pontos=[], ordem=new Map(), usoD=[], tamD=[];
  const marcaD=d=>{ for(let k=0;k<d.length&&k<8;k++) if(d[k]){ usoD[k]=true; tamD[k]=Math.max(tamD[k]||0,d[k].length); } };
  const st={segmentos:0, fechadas:0, nuvens:0, soltos:0, tem3d,
    x0:Infinity, x1:-Infinity, y0:Infinity, y1:-Infinity, z0:Infinity, z1:-Infinity};
  let i=0;
  while(i<n){
    if(N[i]===0){ i++; continue; }
    const s=N[i]; let j=i+1;
    while(j<n&&N[j]===s) j++;                    /* segmento: registros i..j-1 */
    const seg=(ordem.get(s)||0)+1; ordem.set(s,seg);
    st.segmentos++;
    for(let k=i;k<j;k++){
      if(X[k]<st.x0)st.x0=X[k]; if(X[k]>st.x1)st.x1=X[k];
      if(Y[k]<st.y0)st.y0=Y[k]; if(Y[k]>st.y1)st.y1=Y[k];
      if(Z[k]<st.z0)st.z0=Z[k]; if(Z[k]>st.z1)st.z1=Z[k];
    }
    const m=j-i, nuvem=m>1&&surpacPareceNuvem(X,Y,Z,i,j);
    if(m===1||nuvem){
      if(nuvem) st.nuvens++; else st.soltos++;
      let antes='', dAntes=[];
      for(let k=i;k<j;k++){
        const t=C.description(k);
        if(t!==antes){ antes=t; dAntes=partes(t); marcaD(dAntes); }
        const f={geom:[[X[k],Y[k]]], props:{STRING:s}, _d:dAntes};
        if(tem3d){ f.zg=[Z[k]]; f.props.COTA=+Z[k].toFixed(3); }
        pontos.push(f);
      }
    } else {
      const geom=new Array(m);
      let zmin=Infinity, zmax=-Infinity, d=[];
      for(let k=i;k<j;k++){
        geom[k-i]=[X[k],Y[k]];
        if(Z[k]<zmin)zmin=Z[k]; if(Z[k]>zmax)zmax=Z[k];
        if(!d.length){ const t=C.description(k); if(t) d=partes(t); }
      }
      marcaD(d);
      const f={geom, multi:true, props:{STRING:s, SEGMENTO:seg}, _d:d};
      if(tem3d){
        const zg=new Array(m);
        for(let k=i;k<j;k++) zg[k-i]=Z[k];
        f.zg=zg; f.props.COTA=zmax-zmin<=0.0005?+zmin.toFixed(3):null;
      }
      if(m>=4&&Math.abs(X[i]-X[j-1])<1e-6&&Math.abs(Y[i]-Y[j-1])<1e-6) st.fechadas++;
      linhas.push(f);
    }
    i=j;
  }
  const colunas=[];
  for(let k=0;k<usoD.length;k++) if(usoD[k]) colunas.push(k);
  const fecha=f=>{
    const d=f._d; delete f._d;
    for(const k of colunas) f.props['D'+(k+1)]=d[k]||'';
    return f;
  };
  linhas.forEach(fecha); pontos.forEach(fecha);
  const camposD=colunas.map(k=>({name:'D'+(k+1),type:'C',length:Math.min(254,Math.max(8,tamD[k]||8)),decimal:0}));
  const cota=tem3d?[{name:'COTA',type:'N',length:12,decimal:3}]:[];
  st.strings=[...ordem.keys()].sort((p,q)=>p-q);
  return {linhas, pontos, stats:st,
    camposLinha:[{name:'STRING',type:'N',length:6,decimal:0},{name:'SEGMENTO',type:'N',length:6,decimal:0}].concat(camposD,cota),
    camposPonto:[{name:'STRING',type:'N',length:6,decimal:0}].concat(camposD,cota)};
}

/* DTM → MALHAS.  Função pura. Uma superfície por OBJETO do Surpac, juntando
   as trisolations abertas dele. Trisolation "closed=yes" é sólido (corpo de
   minério, cava fechada): não é superfície 2,5D e fica para a Geologia. A
   soma das áreas em planta confirma: superfície do Surpac tem as faces todas
   no mesmo sentido; num sólido, metade olha para baixo e a soma zera. */
function surpacMalhas(P){
  const S0=P.str, D=P.dtm, X=S0.x, Y=S0.y, Z=S0.z, nodes=D.nodes;
  const porObj=new Map();
  for(const g of D.groups){
    if(!g.count) continue;
    if(!porObj.has(g.objectId)) porObj.set(g.objectId,[]);
    porObj.get(g.objectId).push(g);
  }
  const fechado=g=>/(?:^|[,;\s])closed\s*=\s*(?:yes|true|1)(?![\w])/i.test(g.trisolationText||'');
  const carimbo=new Uint32Array(S0.count), local=new Uint32Array(S0.count), saida=[];
  let marca=0;
  for(const [objectId,grupos] of porObj){
    const abertos=grupos.filter(g=>!fechado(g));
    const facesFechadas=grupos.filter(fechado).reduce((s,g)=>s+g.count,0);
    const faces=abertos.reduce((s,g)=>s+g.count,0);
    if(!faces){ saida.push({objectId, solido:true, faces:facesFechadas, facesFechadas}); continue; }
    marca++;
    let nv=0, soma=0, abs=0;
    for(const g of abertos){
      for(let k=3*g.first, fim=3*(g.first+g.count); k<fim; k+=3){
        const a=nodes[k], b=nodes[k+1], c=nodes[k+2];
        if(carimbo[a]!==marca){ carimbo[a]=marca; local[a]=nv++; }
        if(carimbo[b]!==marca){ carimbo[b]=marca; local[b]=nv++; }
        if(carimbo[c]!==marca){ carimbo[c]=marca; local[c]=nv++; }
        const ar=(X[b]-X[a])*(Y[c]-Y[a])-(X[c]-X[a])*(Y[b]-Y[a]);
        soma+=ar; abs+=Math.abs(ar);
      }
    }
    const planta=abs>0?Math.abs(soma)/abs:0;
    if(planta<0.5){ saida.push({objectId, solido:true, dobrada:true, faces, facesFechadas, planta}); continue; }
    const xs=new Float64Array(nv), ys=new Float64Array(nv), zs=new Float64Array(nv), tri=new Uint32Array(3*faces);
    let t=0, z0=Infinity, z1=-Infinity, x0=Infinity, x1=-Infinity, y0=Infinity, y1=-Infinity;
    for(const g of abertos){
      for(let k=3*g.first, fim=3*(g.first+g.count); k<fim; k++){
        const no=nodes[k], v=local[no];
        tri[t++]=v; xs[v]=X[no]; ys[v]=Y[no]; zs[v]=Z[no];
      }
    }
    for(let v=0;v<nv;v++){
      if(xs[v]<x0)x0=xs[v]; if(xs[v]>x1)x1=xs[v];
      if(ys[v]<y0)y0=ys[v]; if(ys[v]>y1)y1=ys[v];
      if(zs[v]<z0)z0=zs[v]; if(zs[v]>z1)z1=zs[v];
    }
    saida.push({objectId, solido:false, faces, facesFechadas, planta, area:abs/2,
      trisolations:abertos.length, xs, ys, zs, tri, x0, x1, y0, y1, z0, z1});
  }
  return saida;
}

/* O Surpac não grava o CRS; às vezes o NOME do arquivo diz o datum. */
function surpacDatum(texto){
  const t=String(texto||'');
  if(/sad[\s_.\-]?69/i.test(t)) return 'SAD69';
  if(/c[oó]rrego[\s_.\-]?alegre/i.test(t)) return 'Córrego Alegre';
  if(/sirgas/i.test(t)) return 'SIRGAS 2000';
  if(/wgs[\s_.\-]?84/i.test(t)) return 'WGS84';
  return null;
}
/* Confere a faixa das coordenadas contra o CRS de trabalho. Devolve os avisos
   (avisos.local marca coordenadas locais); lança erro quando importar só
   produziria uma camada quebrada. */
function surpacConfere(nome,cab,x0,x1,y0,y1){
  const crs=String(S.workCRS||''), rotulo=CRS_LABELS[crs]||crs, avisos=[];
  if(/4326|4674|4618/.test(crs)){
    if(Math.abs(x0)>180||Math.abs(x1)>180||Math.abs(y0)>90||Math.abs(y1)>90)
      throw new Error('o projeto está em coordenadas geográficas ('+rotulo+') e o arquivo traz metros. '+
        'Escolha um CRS UTM de trabalho em Datum / Projeção e importe de novo.');
    return avisos;
  }
  /* Levantamento em sistema local (0 a algumas centenas de metros): em UTM
     isso cai fora do fuso — nos fusos do hemisfério sul, perto do polo, onde
     o mapa não desenha nada. */
  if(!(x0>100000&&x1<900000)){
    let lat=NaN;
    try{ const w=toWGS(crs,(x0+x1)/2,(y0+y1)/2); lat=w?+w[1]:NaN; }catch(e){}
    avisos.local=true;
    avisos.push('coordenadas locais (E '+surpacNum(x0,0)+' a '+surpacNum(x1,0)+', fora da faixa UTM): '+
      (Math.abs(lat)<=85?'no mapa do projeto, que é UTM, a posição não é a real'
        :'o mapa do projeto é UTM e não consegue mostrá-las — entrou na árvore de camadas, mas não aparece no mapa'));
  }
  const datum=surpacDatum(nome+' '+cab), igual=d=>d==='WGS84'?'SIRGAS 2000':d;
  const doProjeto=surpacDatum(rotulo);
  if(datum&&doProjeto&&igual(datum)!==igual(doProjeto))
    avisos.push('o nome indica '+datum+' e o projeto está em '+rotulo+
      ': as coordenadas entraram como estão, e entre os dois datums a diferença é de dezenas de metros');
  return avisos;
}
/* Arquivo em coordenadas locais não pode levar a vista do mapa para o polo:
   guarda a vista antes de criar a camada e a repõe depois. */
function surpacVista(){
  try{ return {centro:map.getCenter(), zoom:map.getZoom()}; }catch(e){ return null; }
}
function surpacRepoeVista(v){
  try{ if(v) map.setView(v.centro,v.zoom,{animate:false}); }catch(e){}
}
/* O toast já grava a linha no histórico de comandos; os demais avisos vão só para lá. */
function surpacAvisa(nome,avisos){
  if(!avisos.length) return;
  for(const a of avisos.slice(1)){ try{ cmdLog('⚠ Surpac "'+nome+'": '+a+'.','avisa'); }catch(e){} }
  toast('⚠ Surpac "'+nome+'": '+avisos[0]);
}

/* .str sozinho → camadas vetoriais */
async function surpacImportaStrings(f){
  const base=surpacBase(f.name);
  showLoad('Surpac: lendo as strings de '+f.name+'…');
  await cedeUI();
  const C=window.GeoMineSurpacReader.compactSTR(new Uint8Array(await f.arrayBuffer()));
  if(C.pointCount>SURPAC_MAX_PONTOS)
    throw new Error(surpacNum(C.pointCount)+' pontos — acima do teto de '+surpacNum(SURPAC_MAX_PONTOS)+
      ' de uma camada vetorial. Importe o par .dtm + .str como superfície, ou divida o arquivo no Surpac.');
  const V=surpacVetores(C), st=V.stats;
  const avisos=surpacConfere(f.name,C.header,st.x0,st.x1,st.y0,st.y1), vista=surpacVista();
  showLoad('Surpac: montando as camadas de '+base+'…');
  await cedeUI();
  const src={file:f.name, path:(f.webkitRelativePath||''), size:f.size||0, at:new Date().toISOString()};
  const criadas=[];
  if(V.linhas.length){
    const L=addLayer({name:base+' — linhas', gtype:'line', crs:S.workCRS, features:V.linhas, fields:V.camposLinha, src});
    /* O Surpac distingue as strings pela cor do número: repete isso quando há
       poucas strings; com dezenas, uma cor por string só faria ruído. */
    const cont=new Map();
    V.linhas.forEach(x=>cont.set(x.props.STRING,(cont.get(x.props.STRING)||0)+1));
    if(L&&cont.size>=2&&cont.size<=SURPAC_CORES.length){
      L.sym={...L.sym, mode:'cat', field:'STRING',
        cats:[...cont.keys()].sort((p,q)=>p-q).map((v,k)=>({value:String(v),color:SURPAC_CORES[k],count:cont.get(v)}))};
      try{ drawLayer(L); }catch(e){}
    }
    criadas.push(L);
  }
  if(V.pontos.length){
    await cedeUI();
    criadas.push(addLayer({name:base+' — pontos', gtype:'point', crs:S.workCRS, features:V.pontos, fields:V.camposPonto,
      color:'#e0af68', src}));
  }
  try{ refreshUI(); }catch(e){}
  try{ refreshTinPanel(); }catch(e){}
  const partes=[];
  if(V.linhas.length) partes.push(surpacNum(V.linhas.length)+' linha(s)'+(st.fechadas?' ('+surpacNum(st.fechadas)+' fechada(s))':''));
  if(V.pontos.length) partes.push(surpacNum(V.pontos.length)+' ponto(s)'+(st.nuvens?' de nuvem':''));
  const crs=CRS_LABELS[S.workCRS]||S.workCRS;
  toast('Surpac "'+base+'": '+partes.join(' e ')+' no CRS de trabalho ('+crs+')'+(st.tem3d?' · com cota (3D)':''));
  try{
    cmdLog('Surpac '+f.name+': '+surpacNum(st.segmentos)+' segmento(s) em '+st.strings.length+' string(s) ('+
      st.strings.slice(0,12).join(', ')+(st.strings.length>12?'…':'')+') → '+partes.join(' e ')+
      (st.tem3d?'; cotas de '+surpacNum(st.z0,2)+' a '+surpacNum(st.z1,2)+' m':'; sem cota (arquivo em Z = 0)')+
      '. O Surpac não grava o CRS: coordenadas no CRS de trabalho ('+crs+').','info');
  }catch(e){}
  if(avisos.local) surpacRepoeVista(vista);
  surpacAvisa(base,avisos);
  return {feitas:criadas.length, locais:avisos.local?criadas.length:0};
}

/* .dtm + .str → Superfície(s) TIN */
async function surpacImportaSuperficie(dtm,str){
  const base=surpacBase(dtm.name);
  showLoad('Surpac: lendo a superfície '+dtm.name+'…');
  await cedeUI();
  const bd=new Uint8Array(await dtm.arrayBuffer()), bs=new Uint8Array(await str.arrayBuffer());
  const P=window.GeoMineSurpacReader.compactPair(bd,bs,{dtmName:dtm.name,strName:str.name});
  const malhas=surpacMalhas(P), sup=malhas.filter(m=>!m.solido), sol=malhas.filter(m=>m.solido);
  const nFechadas=malhas.reduce((s,m)=>s+(m.facesFechadas||0),0)+sol.filter(m=>m.dobrada).reduce((s,m)=>s+m.faces,0);
  if(!sup.length)
    throw new Error('o arquivo traz só sólido fechado ('+surpacNum(nFechadas)+' triângulos), que não é uma superfície de terreno. '+
      'Use Geologia ▸ Superfícies / Sólidos Surpac.');
  const crs=CRS_LABELS[S.workCRS]||S.workCRS;
  let feitas=0, locais=0;
  for(const m of sup){
    const avisos=surpacConfere(dtm.name,P.dtm.header+' '+P.str.header,m.x0,m.x1,m.y0,m.y1), vista=surpacVista();
    const nome=sup.length>1?base+' — objeto '+m.objectId:base;
    showLoad('Surpac: montando a superfície '+nome+' ('+surpacNum(m.faces)+' triângulos)…');
    await cedeUI();
    const r=await malhaCriaSuperficieTIN({xs:m.xs,ys:m.ys,zs:m.zs,tri:m.tri},nome);
    feitas++;
    if(avisos.local){ locais++; surpacRepoeVista(vista); }
    if(m.planta<0.98)
      avisos.push('parte das faces se sobrepõe em planta ('+surpacNum((1-m.planta)*50,1)+
        '% da área) — nesses trechos a cota amostrada é a da primeira face encontrada');
    toast('Surpac "'+nome+'": superfície com '+surpacNum(m.faces)+' triângulos (▲ na árvore) no CRS de trabalho ('+crs+')');
    try{
      cmdLog('Surpac '+dtm.name+' + '+str.name+' → '+r.name+': '+surpacNum(m.faces)+' triângulos, '+
        surpacNum(m.xs.length)+' vértices, '+surpacNum(m.area,0)+' m² em planta, cotas de '+
        surpacNum(m.z0,2)+' a '+surpacNum(m.z1,2)+' m. Triângulos do arquivo, sem retriangular. '+
        'O Surpac não grava o CRS: coordenadas no CRS de trabalho ('+crs+'). '+
        'Para ter também as strings como vetores, importe o .str sozinho.','info');
    }catch(e){}
    surpacAvisa(nome,avisos);
  }
  if(nFechadas){
    try{ cmdLog('Surpac '+dtm.name+': '+surpacNum(nFechadas)+' triângulo(s) de sólido fechado ficaram de fora — '+
      'sólido não é superfície de terreno; use Geologia ▸ Superfícies / Sólidos Surpac.','avisa'); }catch(e){}
  }
  for(const a of P.warnings){ try{ cmdLog('Surpac '+dtm.name+': '+a,'info'); }catch(e){} }
  return {feitas, locais};
}

/* Falta o .str de um .dtm: a caixa abre o seletor DENTRO do toque (o iPad
   bloqueia seletor aberto depois) e continua na tela se o seletor for
   cancelado, sem depender de adivinhar o cancelamento. */
function surpacPedeSTR(nomes){
  return new Promise(res=>{
    document.querySelectorAll('[data-modal-arquivo]').forEach(x=>x.remove());
    const bg=document.createElement('div');
    bg.className='modal-bg on';
    bg.dataset.modalArquivo='1';
    bg.style.cssText='position:fixed;inset:0;background:#0d1117d9;z-index:4000;display:flex;align-items:center;justify-content:center;padding:18px';
    const lista=nomes.map(n=>esc(n)).join(', ');
    bg.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="Arquivo de strings do Surpac" style="background:var(--panel,#151b26);border:1px solid var(--line,#2a3446);border-radius:14px;max-width:400px;width:100%;padding:14px 14px 10px;font-size:13.5px;color:var(--ink,#dde3ee);overflow:auto;touch-action:manipulation">
      <div style="font-weight:700;font-size:14.5px;margin-bottom:6px">Falta o arquivo .str</div>
      <div style="color:var(--ink-dim,#93a0b4);margin-bottom:10px">O .dtm do Surpac guarda só os triângulos; as coordenadas ficam no <b>.str</b> de mesmo nome.
        Faltando para: <b style="overflow-wrap:anywhere">${lista}</b></div>
      <button type="button" data-a="files" style="width:100%;margin:4px 0;padding:11px;border-radius:10px;border:1px solid var(--line,#2a3446);background:var(--amber,#f5a524);color:#1a1206;font-weight:700;cursor:pointer">📎 Escolher o .str</button>
      <button type="button" data-a="skip" style="width:100%;margin:4px 0;padding:10px;border-radius:10px;border:1px solid var(--line,#2a3446);background:none;color:var(--ink-dim,#93a0b4);cursor:pointer">Pular esta superfície</button>
    </div>`;
    let feito=false;
    const fecha=resp=>{
      if(feito) return; feito=true;
      bg.style.display='none'; void bg.offsetHeight; bg.remove();
      requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(()=>res(resp),0)));
    };
    bg.querySelector('[data-a="skip"]').onclick=()=>fecha(null);
    bg.querySelector('[data-a="files"]').onclick=()=>{
      const inp=document.createElement('input');
      inp.type='file'; inp.multiple=true; inp.style.display='none';
      inp.dataset.surpacStr='1';
      inp.onchange=()=>{ const fl=[...inp.files]; inp.remove(); if(fl.length) fecha(fl); };
      inp.addEventListener('cancel',()=>inp.remove());
      document.body.appendChild(inp);
      inp.click();
    };
    document.body.appendChild(bg);
  });
}

/* Nome do .str que o próprio .dtm declara no cabeçalho ("nome.str,…"). */
async function surpacStrDoCabecalho(dtm){
  try{
    const b=new Uint8Array(await dtm.slice(0,1024).arrayBuffer());
    let fim=b.indexOf(10); if(fim<0) fim=b.length;
    let t=''; for(let i=0;i<fim;i++) t+=String.fromCharCode(b[i]);
    const nome=t.split(',')[0].trim();
    return /\.(str|stx)$/i.test(nome)?surpacChave(nome):'';
  }catch(e){ return ''; }
}

/* Leva de arquivos do Surpac vinda do handleFiles (ou de um .zip). */
async function surpacImportaLeva(files,ctx){
  ctx=ctx||{};
  const falhas=ctx.falhas||[], sinal=ctx.control&&ctx.control.signal;
  const parou=()=>!!(sinal&&sinal.aborted)||!!S._loadCancel;
  const feito={superficies:0, camadas:0, locais:0};
  if(!window.GeoMineSurpacReader||typeof window.GeoMineSurpacReader.compactPair!=='function'){
    falhas.push('Surpac — leitor indisponível nesta versão do GeoMine');
    return feito;
  }
  const dtms=[], strs=[];
  for(const f of files){
    if(surpacExt(f.name)==='dtm') dtms.push({f, chave:surpacChave(f.name), str:null});
    else strs.push({f, chave:surpacChave(f.name), usado:false});
  }
  const pega=chave=>{ const s=chave&&strs.find(x=>!x.usado&&x.chave===chave); if(s){ s.usado=true; return s.f; } return null; };
  for(const d of dtms){
    d.str=pega(d.chave);
    if(d.str) continue;
    d.cab=await surpacStrDoCabecalho(d.f);
    d.str=pega(d.cab);
    if(d.str||typeof findCompanion!=='function') continue;
    for(const b of [surpacBase(d.f.name), d.cab]){
      if(!b||d.str) continue;
      for(const e of ['str','stx']){ if(!d.str){ try{ d.str=await findCompanion(b,e); }catch(_){ } } }
    }
  }
  let rodada=0;
  while(!parou()&&dtms.some(d=>!d.str)&&rodada++<3){
    const faltam=dtms.filter(d=>!d.str);
    try{ hideLoad(); }catch(e){}
    const fl=await surpacPedeSTR(faltam.map(d=>d.f.name));
    if(!fl) break;
    showLoad('Surpac: conferindo o par…');
    const novos=fl.filter(f=>surpacExt(f.name)!=='dtm');
    for(const f of novos){
      const k=surpacChave(f.name), d=faltam.find(x=>!x.str&&(x.chave===k||x.cab===k));
      if(d) d.str=f;
    }
    /* um .dtm sem par e um arquivo escolhido: é ele, mesmo com outro nome ou
       sem extensão — a topologia é conferida na leitura e um par errado é
       recusado ali */
    const resto=faltam.filter(d=>!d.str), livres=novos.filter(f=>!faltam.some(d=>d.str===f));
    if(resto.length===1&&livres.length===1) resto[0].str=livres[0];
    if(!novos.length) toast('Escolha o arquivo .str da superfície');
  }
  for(const d of dtms){
    if(parou()) break;
    if(!d.str){ falhas.push(d.f.name+' — faltou o arquivo .str da superfície (o .dtm sozinho não tem coordenadas)'); continue; }
    try{ const r=await surpacImportaSuperficie(d.f,d.str); feito.superficies+=r.feitas; feito.locais+=r.locais; }
    catch(err){ console.error(err); falhas.push(d.f.name+' — '+surpacErro(err)); }
  }
  for(const s of strs){
    if(parou()) break;
    if(s.usado) continue;
    try{ const r=await surpacImportaStrings(s.f); feito.camadas+=r.feitas; feito.locais+=r.locais; }
    catch(err){ console.error(err); falhas.push(s.f.name+' — '+surpacErro(err)); }
  }
  return feito;
}
function surpacErro(err){
  const m=String(err&&err.message||err||'erro desconhecido');
  /* "Surpac STR: …" / "Surpac DTM: …" vêm do leitor. Par trocado já se explica
     sozinho; nos demais, diz que o arquivo não foi lido como Surpac — .str e
     .dtm também são extensões de outros programas. */
  const r=/^Surpac (STR|DTM): (.*)$/s.exec(m);
  if(!r) return m;
  if(/referencia nó/.test(r[2])) return r[2];
  return 'a leitura como '+(r[1]==='STR'?'strings':'DTM')+' do Surpac falhou: '+r[2];
}
/* Arquivo sem extensão (Drive/Android): reconhece pelos primeiros bytes.
   DTM: "nome.str,…;algorithm=…"; STR: 2ª linha é o registro de eixo "0, y, x, z, y, x, z". */
function surpacFareja(txt){
  const linhas=String(txt||'').split(/\r?\n/);
  if(/^[^\r\n,]*\.(str|stx),[^\r\n]*algorithm=/i.test(linhas[0]||'')) return 'dtm';
  if((linhas[0]||'').split(',').length>=3&&
     /^\s*0\s*(,\s*[+-]?\d+(\.\d*)?\s*){6}$/.test(linhas[1]||'')) return 'str';
  return '';
}
