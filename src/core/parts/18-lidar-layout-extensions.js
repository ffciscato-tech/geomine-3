/* ============================================================================
   PRANCHAS (modo A4) — várias plantas no mesmo projeto, com sub-abas no rodapé.
   Cada prancha guarda o próprio selo, título, escala, grade, centro, orientação
   e QUAIS CAMADAS estão visíveis — para que "Localização", "Geológica" e
   "Plano de lavra" possam mostrar coisas diferentes do mesmo acervo.
   ========================================================================== */
let plid = 1;
S.plates = [];
S.plateId = null;

/* ===========================================================================
   IMPORTAÇÃO LiDAR / NUVEM DE PONTOS (LAS e XYZ) COM REAMOSTRAGEM
   ---------------------------------------------------------------------------
   O arquivo bruto tem milhões de pontos — inviável como camada. A importação
   reamostra NA LEITURA: uma célula do espaçamento escolhido guarda um único
   ponto (o mais baixo p/ terreno, o mais alto p/ MDS, ou a média). O
   resultado vira uma camada de pontos cotados, pronta para as superfícies
   Raster e TIN. LAZ (comprimido) é recusado com instrução honesta.
   =========================================================================== */
function lidarCabecalhoLAS(dv,permitirLaz){
  const sig=String.fromCharCode(dv.getUint8(0),dv.getUint8(1),dv.getUint8(2),dv.getUint8(3));
  if(sig!=='LASF')throw new Error('o arquivo não tem assinatura LAS');
  const verMin=dv.getUint8(25);
  const off=dv.getUint32(96,true);
  const fmt=dv.getUint8(104);
  if((fmt&0xC0)&&!permitirLaz)throw new Error('arquivo LAZ (comprimido) — descompacte para LAS e importe de novo');
  const rec=dv.getUint16(105,true);
  let n=dv.getUint32(107,true);
  if(verMin>=4){const lo=dv.getUint32(247,true),hi=dv.getUint32(251,true);
    const n64=hi*4294967296+lo; if(n64)n=n64;}
  return {off,rec,n,fmt,verMin,
    sx:dv.getFloat64(131,true),sy:dv.getFloat64(139,true),sz:dv.getFloat64(147,true),
    ox:dv.getFloat64(155,true),oy:dv.getFloat64(163,true),oz:dv.getFloat64(171,true)};
}
/* Posições dos atributos dentro do registro de ponto, por formato LAS.
   RGB: uint16×3 · intensidade: uint16 @12 · classificação: uint8. */
function lidarAttrOffsets(fmt){
  const f=fmt&0x3F;
  const rgb = f===2?20 : f===3?28 : f===5?28 : f===7?30 : f===8?30 : f===10?30 : null;
  const cls = f>=6?16:15;
  return {rgb, int:12, cls};
}
/* Classes ASPRS LAS: 2 = ground; 3, 4 e 5 = vegetação baixa, média e alta.
   Nos formatos LAS anteriores ao 1.4 os três bits altos são flags, por isso
   a comparação usa somente os cinco bits da classificação propriamente dita. */
function lidarClasseAceita(c,filtro){
  if(!filtro||filtro==='todas')return true;
  if(!isFinite(c))return false;
  const classe=(+c)&31;
  if(filtro==='ground')return classe===2;
  if(filtro==='trees')return classe===3||classe===4||classe===5;
  return true;
}
function lidarNomeFiltro(filtro){
  return filtro==='ground'?'ground / terreno (classe 2)'
    :filtro==='trees'?'árvores / vegetação (classes 3, 4 e 5)'
    :'todas as classes';
}
/* Reamostrador incremental — recebe pontos um a um, devolve as células. */
function lidarAmostrador(esp,met){
  /* esp<=0 = SEM reamostragem: coleta todos os pontos na ordem do arquivo */
  if(!(esp>0)){
    const out=[];
    return { add(x,y,z,a){ if(isFinite(x)&&isFinite(y)&&isFinite(z))out.push([x,y,z,a||null]); },
             fim(){return out;}, tam(){return out.length;} };
  }
  const M=new Map();
  return {
    add(x,y,z,a){
      if(!isFinite(x)||!isFinite(y)||!isFinite(z))return;
      const k=Math.floor(x/esp)+':'+Math.floor(y/esp);
      const c=M.get(k);
      if(!c){M.set(k,met==='media'?{sx:x,sy:y,sz:z,n:1,a:a||null}:{x,y,z,a:a||null});return;}
      if(met==='media'){c.sx+=x;c.sy+=y;c.sz+=z;c.n++;}
      else if(met==='max'){if(z>c.z){c.x=x;c.y=y;c.z=z;c.a=a||null;}}
      else {if(z<c.z){c.x=x;c.y=y;c.z=z;c.a=a||null;}}  /* atributo acompanha o ponto ESCOLHIDO */
    },
    fim(){
      const out=[];
      M.forEach(c=>{
        if(c.n)out.push([c.sx/c.n,c.sy/c.n,c.sz/c.n,c.a]);  /* média: attrs do 1º ponto da célula */
        else out.push([c.x,c.y,c.z,c.a]);
      });
      return out;
    },
    tam(){return M.size;}
  };
}
async function lidarLeLAS(buf,esp,met,progresso,props,filtro){
  const dv=new DataView(buf);
  const H=lidarCabecalhoLAS(dv);
  const A=lidarAmostrador(esp,met);
  const O=lidarAttrOffsets(H.fmt);
  const qRGB=!!(props&&props.rgb&&O.rgb!=null&&H.rec>=O.rgb+6);
  const qInt=!!(props&&props.int&&H.rec>=O.int+2);
  const qCls=!!(((props&&props.cls)||(filtro&&filtro!=='todas'))&&H.rec>=O.cls+1);
  const fim=Math.min(H.off+H.n*H.rec,buf.byteLength);
  const LOTE=200000;
  let lidos=0,aceitos=0;
  for(let p=H.off;p+H.rec<=fim;p+=H.rec){
    let a=null;
    if(qRGB||qInt||qCls){
      a={};
      if(qRGB){a.r=dv.getUint16(p+O.rgb,true);a.g=dv.getUint16(p+O.rgb+2,true);a.b=dv.getUint16(p+O.rgb+4,true);}
      if(qInt)a.i=dv.getUint16(p+O.int,true);
      if(qCls)a.c=dv.getUint8(p+O.cls);
    }
    if(lidarClasseAceita(a&&a.c,filtro)){
      A.add(dv.getInt32(p,true)*H.sx+H.ox,
            dv.getInt32(p+4,true)*H.sy+H.oy,
            dv.getInt32(p+8,true)*H.sz+H.oz, a);
      aceitos++;
    }
    if(++lidos%LOTE===0){
      if(progresso)progresso(lidos,H.n,A.tam());
      await new Promise(r=>setTimeout(r,0));       /* deixa a UI respirar */
    }
  }
  return {pontos:A.fim(),nBrutos:lidos,nClasse:aceitos,header:H,attrs:{rgb:qRGB,int:qInt,cls:qCls}};
}
async function lidarLeXYZ(texto,esp,met,progresso){
  const A=lidarAmostrador(esp,met);
  const linhas=texto.split(/\r?\n/);
  let lidos=0;
  for(let i=0;i<linhas.length;i++){
    const c=linhas[i].trim().split(/[\s;,\t]+/);
    if(c.length<3)continue;
    const x=parseFloat(c[0]),y=parseFloat(c[1]),z=parseFloat(c[2]);
    if(isFinite(x)&&isFinite(y)&&isFinite(z)){A.add(x,y,z);lidos++;}
    if(i%400000===0&&i){if(progresso)progresso(lidos,linhas.length,A.tam());
      await new Promise(r=>setTimeout(r,0));}
  }
  return {pontos:A.fim(),nBrutos:lidos,header:null};
}
/* ------------------- MALHAS DE TOPOGRAFIA (OBJ / PLY / STL) -----------------
   Formatos consagrados de malha (referência do usuário: RightSlope3D lê OBJ).
   A malha importada vira uma Superfície TIN direto — triângulo por triângulo,
   sem retriangular e sem suavizar. Faces com mais de 3 lados entram em leque.
   --------------------------------------------------------------------------- */
function malhaParseOBJ(texto){
  const xs=[],ys=[],zs=[],tri=[];
  const linhas=texto.split(/\r?\n/);
  for(let i=0;i<linhas.length;i++){
    const l=linhas[i];
    if(l[0]==='v'&&l[1]===' '){
      const c=l.slice(2).trim().split(/\s+/);
      xs.push(+c[0]);ys.push(+c[1]);zs.push(+c[2]);
    }else if(l[0]==='f'&&l[1]===' '){
      const c=l.slice(2).trim().split(/\s+/)
        .map(t=>{ let v=parseInt(t.split('/')[0],10);
          return v<0? xs.length+v : v-1; });     /* índices 1-based e negativos */
      for(let k=1;k+1<c.length;k++){ tri.push(c[0],c[k],c[k+1]); }
    }
  }
  return {xs,ys,zs,tri:Uint32Array.from(tri)};
}
function malhaParsePLY(buf){
  const head=new TextDecoder().decode(buf.slice(0,4096));
  if(!/^ply/.test(head))throw new Error('não é um arquivo PLY');
  if(!/format\s+ascii/i.test(head))
    throw new Error('PLY binário ainda não é suportado — exporte em PLY ASCII ou OBJ');
  const texto=new TextDecoder().decode(buf);
  const linhas=texto.split(/\r?\n/);
  let nV=0,nF=0,fim=0,props=[];let lendoVert=false;
  for(let i=0;i<linhas.length;i++){
    const l=linhas[i].trim();
    if(/^element vertex/i.test(l)){nV=+l.split(/\s+/)[2];lendoVert=true;}
    else if(/^element face/i.test(l)){nF=+l.split(/\s+/)[2];lendoVert=false;}
    else if(/^property/i.test(l)&&lendoVert)props.push(l.split(/\s+/)[2]);
    else if(l==='end_header'){fim=i+1;break;}
  }
  const ix=props.indexOf('x'),iy=props.indexOf('y'),iz=props.indexOf('z');
  if(ix<0||iy<0||iz<0)throw new Error('PLY sem propriedades x/y/z');
  const xs=new Array(nV),ys=new Array(nV),zs=new Array(nV),tri=[];
  for(let i=0;i<nV;i++){
    const c=linhas[fim+i].trim().split(/\s+/);
    xs[i]=+c[ix];ys[i]=+c[iy];zs[i]=+c[iz];
  }
  for(let i=0;i<nF;i++){
    const c=linhas[fim+nV+i].trim().split(/\s+/).map(Number);
    const n=c[0];
    for(let k=2;k<=n-1;k++)tri.push(c[1],c[k],c[k+1]);
  }
  return {xs,ys,zs,tri:Uint32Array.from(tri)};
}
function malhaParseSTL(buf){
  const dv=new DataView(buf);
  const asciiIni=new TextDecoder().decode(buf.slice(0,80)).trim().toLowerCase();
  /* STL não indexa: é uma sopa de triângulos — deduplica por coordenada */
  const mapa=new Map(),xs=[],ys=[],zs=[],tri=[];
  const vid=(x,y,z)=>{
    const k=x.toFixed(4)+'|'+y.toFixed(4)+'|'+z.toFixed(4);
    let i=mapa.get(k);
    if(i===undefined){i=xs.length;mapa.set(k,i);xs.push(x);ys.push(y);zs.push(z);}
    return i;
  };
  const nTriBin=buf.byteLength>=84?dv.getUint32(80,true):0;
  const pareceBin=buf.byteLength===84+nTriBin*50;
  if(pareceBin&&!asciiIni.startsWith('solid')||pareceBin){
    for(let t=0;t<nTriBin;t++){
      const p=84+t*50+12;                        /* pula a normal */
      const a=vid(dv.getFloat32(p,true),dv.getFloat32(p+4,true),dv.getFloat32(p+8,true));
      const b=vid(dv.getFloat32(p+12,true),dv.getFloat32(p+16,true),dv.getFloat32(p+20,true));
      const c=vid(dv.getFloat32(p+24,true),dv.getFloat32(p+28,true),dv.getFloat32(p+32,true));
      tri.push(a,b,c);
    }
  }else{
    const texto=new TextDecoder().decode(buf);
    const rx=/vertex\s+([\-\d.eE+]+)\s+([\-\d.eE+]+)\s+([\-\d.eE+]+)/g;
    const V=[];let m2;
    while((m2=rx.exec(texto)))V.push([+m2[1],+m2[2],+m2[3]]);
    for(let t=0;t+2<V.length;t+=3)
      tri.push(vid(...V[t]),vid(...V[t+1]),vid(...V[t+2]));
  }
  return {xs,ys,zs,tri:Uint32Array.from(tri)};
}
/* Cria a Superfície TIN a partir da malha importada. */
async function malhaCriaSuperficieTIN(M,nome){
  if(!M.xs.length||M.tri.length<3)throw new Error('malha sem triângulos válidos');
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(let i=0;i<M.xs.length;i++){
    if(M.xs[i]<minX)minX=M.xs[i];if(M.xs[i]>maxX)maxX=M.xs[i];
    if(M.ys[i]<minY)minY=M.ys[i];if(M.ys[i]>maxY)maxY=M.ys[i];
  }
  const lado=Math.max(maxX-minX,maxY-minY)||1;
  const cs=Math.max(0.05,Math.ceil(lado/256*100)/100);   /* grade só de retrato */
  const g=await tinToGrid(M.xs,M.ys,M.zs,M.tri,cs,0);
  const r={id:rid++,name:nome+' — Superfície TIN',
    d:{nc:g.nc,nr:g.nr,cs:g.cs,xll:g.xll,yll:g.yll,z:g.z},
    style:{mode:'hipso_hs',opacity:0.8},visible:true,overlay:null,
    tinPuro:true,_tinMethod:'malha-importada'};
  tinAnexaExato(r.d,M.xs,M.ys,M.zs,M.tri,0,null);
  const pos=new Float32Array(M.xs.length*3);
  for(let i=0;i<M.xs.length;i++){pos[3*i]=M.xs[i];pos[3*i+1]=M.ys[i];pos[3*i+2]=M.zs[i];}
  r._tinMesh={positions:pos,indices:M.tri};
  S.rasters.push(r);renderRaster(r);
  try{refreshUI();}catch(e){}
  try{if(typeof zoomToRaster==='function')zoomToRaster(r);}catch(e){}
  return r;
}
/* Descompressor LAZ (laz-perf/WASM embutido). Instancia uma vez e reaproveita. */
let _lazPerfP=null;
function lazPerfPronto(){
  if(_lazPerfP)return _lazPerfP;
  _lazPerfP=(async()=>{
    const bin=Uint8Array.from(atob(LAZPERF_WASM_B64),c=>c.charCodeAt(0));
    return await createLazPerf({wasmBinary:bin});
  })();
  return _lazPerfP;
}
async function lidarLeLAZ(buf,esp,met,progresso,props,filtro){
  const dv=new DataView(buf);
  const H=lidarCabecalhoLAS(dv,true);
  const LP=await lazPerfPronto();
  const bytes=new Uint8Array(buf);
  const filePtr=LP._malloc(bytes.length);
  LP.HEAPU8.set(bytes,filePtr);
  const zip=new LP.LASZip();
  const A=lidarAmostrador(esp,met);
  const O=lidarAttrOffsets(H.fmt);
  const qRGB=!!(props&&props.rgb&&O.rgb!=null&&H.rec>=O.rgb+6);
  const qInt=!!(props&&props.int&&H.rec>=O.int+2);
  const qCls=!!(((props&&props.cls)||(filtro&&filtro!=='todas'))&&H.rec>=O.cls+1);
  let lidos=0,aceitos=0;
  try{
    zip.open(filePtr,bytes.length);
    const n=(typeof zip.getCount==='function')?zip.getCount():H.n;
    const rec=Math.max(H.rec,26);
    const ptPtr=LP._malloc(rec);
    const LOTE=100000;
    for(let i=0;i<n;i++){
      zip.getPoint(ptPtr);
      const base=ptPtr;   /* X,Y,Z int32 no início do registro descomprimido */
      let a=null;
      if(qRGB||qInt||qCls){
        /* SEMPRE pela heap ATUAL: a memória do WASM cresce durante a
           descompressão e uma DataView criada antes fica “detached”.
           Offsets de RGB/intensidade são pares e ptPtr é alinhado — HEAPU16 serve. */
        a={};
        const U16=LP.HEAPU16, U8=LP.HEAPU8;
        if(qRGB){a.r=U16[(base+O.rgb)>>1];a.g=U16[(base+O.rgb+2)>>1];a.b=U16[(base+O.rgb+4)>>1];}
        if(qInt)a.i=U16[(base+O.int)>>1];
        if(qCls)a.c=U8[base+O.cls];
      }
      if(lidarClasseAceita(a&&a.c,filtro)){
        A.add(LP.HEAP32[base>>2]*H.sx+H.ox,
              LP.HEAP32[(base+4)>>2]*H.sy+H.oy,
              LP.HEAP32[(base+8)>>2]*H.sz+H.oz, a);
        aceitos++;
      }
      if(++lidos%LOTE===0){
        if(progresso)progresso(lidos,n,A.tam());
        await new Promise(r=>setTimeout(r,0));
      }
    }
    LP._free(ptPtr);
  }finally{
    try{zip.delete();}catch(e){}
    LP._free(filePtr);
  }
  return {pontos:A.fim(),nBrutos:lidos,nClasse:aceitos,header:H,attrs:{rgb:qRGB,int:qInt,cls:qCls}};
}
const LIDAR_MAX_PONTOS=2000000;   /* nuvens grandes são desenhadas em canvas */
async function lidarImporta(){
  const inp=document.getElementById('lidarFile'),info=document.getElementById('lidarInfo');
  const esc2=s=>String(s).replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
  const f=inp&&inp.files&&inp.files[0];
  if(!f){if(info)info.textContent='Escolha um arquivo primeiro.';return;}
  const semRe=!!(document.getElementById('lidarSemRe')||{}).checked;
  const esp=semRe?0:Math.max(0.05,parseFloat(String(document.getElementById('lidarEsp').value).replace(',','.'))||1);
  const met=document.getElementById('lidarMet').value||'min';
  const filtro=(document.getElementById('lidarClasseFiltro')||{}).value||'todas';
  const props={ rgb:!!(document.getElementById('lidarPropRGB')||{}).checked,
                int:!!(document.getElementById('lidarPropInt')||{}).checked,
                /* A classificação precisa ser lida para filtrar, mesmo que o
                   campo não tenha sido marcado como propriedade de saída. */
                cls:!!(document.getElementById('lidarPropCls')||{}).checked||filtro!=='todas' };
  const prog=(l,n,c)=>{if(info)info.innerHTML=
    `Lendo… <b>${l.toLocaleString('pt-BR')}</b>${n?' / '+Number(n).toLocaleString('pt-BR'):''} pontos · <b>${c.toLocaleString('pt-BR')}</b> células`; };
  try{
    if(filtro!=='todas'&&!/\.(las|laz)$/i.test(f.name)){
      if(info)info.textContent='O filtro de classificação só está disponível em arquivos LAS ou LAZ, que guardam a classe de cada ponto.';
      return;
    }
    /* MALHA (OBJ/PLY/STL): vira Superfície TIN direto, sem reamostragem —
       cada triângulo do arquivo é preservado */
    if(/\.(obj|ply|stl)$/i.test(f.name)){
      if(info)info.textContent='Lendo a malha…';
      let M;
      if(/\.obj$/i.test(f.name)) M=malhaParseOBJ(await f.text());
      else if(/\.ply$/i.test(f.name)) M=malhaParsePLY(await f.arrayBuffer());
      else M=malhaParseSTL(await f.arrayBuffer());
      const r=await malhaCriaSuperficieTIN(M,f.name.replace(/\.[^.]+$/,''));
      if(info)info.innerHTML=`Malha importada: <b>${((M.tri.length/3)|0).toLocaleString('pt-BR')}</b> triângulos · `+
        `<b>${M.xs.length.toLocaleString('pt-BR')}</b> vértices → superfície <b>${esc2(r.name)}</b> (▲ na árvore).`;
      toast('Malha importada como Superfície TIN');
      return;
    }
    let R;
    if(/\.laz$/i.test(f.name)){
      if(info)info.textContent='Descomprimindo o LAZ…';
      R=await lidarLeLAZ(await f.arrayBuffer(),esp,met,prog,props,filtro);
    }else if(/\.las$/i.test(f.name)){
      if(info)info.textContent='Lendo o arquivo…';
      const ab=await f.arrayBuffer();
      /* .las com miolo LAZ (extensão trocada): manda para o descompressor */
      const fmt=new DataView(ab).getUint8(104);
      R=(fmt&0xC0)?await lidarLeLAZ(ab,esp,met,prog,props,filtro):await lidarLeLAS(ab,esp,met,prog,props,filtro);
    }else{
      R=await lidarLeXYZ(await f.text(),esp,met,prog); R.attrs={};
    }
    if(!R.pontos.length){
      if(info)info.textContent=filtro==='todas'?'Nenhum ponto válido no arquivo.':
        'Nenhum ponto da classe selecionada foi encontrado no arquivo.';
      return;
    }
    if(R.pontos.length>LIDAR_MAX_PONTOS){
      if(semRe){
        if(info)info.innerHTML=`O arquivo tem <b>${R.pontos.length.toLocaleString('pt-BR')}</b> pontos e o teto sem reamostragem é `+
          `<b>${LIDAR_MAX_PONTOS.toLocaleString('pt-BR')}</b> — acima disso a memória do navegador não dá conta. `+
          `Use um espaçamento pequeno (ex.: 0,25 m) para preservar quase tudo.`;
        return;
      }
      /* espaçamento que levaria ao teto: escala pela raiz da razão */
      const sug=Math.ceil(esp*Math.sqrt(R.pontos.length/LIDAR_MAX_PONTOS)*20)/20;
      if(info)info.innerHTML=`A reamostragem de ${esp} m ainda deixa `+
        `<b>${R.pontos.length.toLocaleString('pt-BR')}</b> pontos (teto ${LIDAR_MAX_PONTOS.toLocaleString('pt-BR')}). `+
        `Aumente o espaçamento para <b>≥ ${String(sug).replace('.',',')} m</b> e importe de novo.`;
      return;
    }
    const metNome=met==='min'?'mais baixo':met==='max'?'mais alto':'média';
    const at=R.attrs||{};
    /* RGB do LAS costuma vir em 16 bits; normaliza p/ 0–255 quando for o caso */
    let rgb16=false;
    if(at.rgb)for(const pt of R.pontos){const a=pt[3];if(a&&(a.r>255||a.g>255||a.b>255)){rgb16=true;break;}}
    const c8=v=>rgb16?(v>>8):v;
    /* geometria de ponto no CCMGIS é lista de vértices: [[x,y]], não [x,y] */
    const feats=R.pontos.map(pt=>{
      const pr={COTA:+pt[2].toFixed(3)}, a=pt[3];
      if(a){
        if(at.rgb){pr.R=c8(a.r||0);pr.G=c8(a.g||0);pr.B=c8(a.b||0);}
        if(at.int)pr.INTENS=a.i||0;
        if(at.cls)pr.CLASSE=a.c||0;
      }
      return {geom:[[pt[0],pt[1]]],zg:[pt[2]],props:pr};
    });
    const fields=[{name:'COTA',type:'N',length:12,decimal:3}];
    if(at.rgb)fields.push({name:'R',type:'N',length:5,decimal:0},{name:'G',type:'N',length:5,decimal:0},{name:'B',type:'N',length:5,decimal:0});
    if(at.int)fields.push({name:'INTENS',type:'N',length:7,decimal:0});
    if(at.cls)fields.push({name:'CLASSE',type:'N',length:4,decimal:0});
    const sufixoFiltro=filtro==='todas'?'':` — ${lidarNomeFiltro(filtro)}`;
    const L=addLayer({name:f.name.replace(/\.[^.]+$/,'')+(semRe?' — LiDAR completa':` — LiDAR ${String(esp).replace('.',',')} m (${metNome})`)+sufixoFiltro,
      gtype:'point',crs:S.workCRS,features:feats,fields,color:'#e0af68'});
    L._lidarFiltroClasse=filtro;
    if(at.rgb)L._pintaRGB=true;   /* cada ponto com a cor RGB importada */
    refreshUI();
    try{refreshTinPanel();}catch(e){}
    try{if(typeof zoomToLayer==='function')zoomToLayer(L);}catch(e){}
    const listaAt=[at.rgb?'RGB':null,at.int?'intensidade':null,at.cls?'classificação':null].filter(Boolean).join(', ');
    const textoClasse=filtro==='todas'?'':` · filtro <b>${lidarNomeFiltro(filtro)}</b>: ${Number(R.nClasse||0).toLocaleString('pt-BR')} ponto(s) aceito(s)`;
    if(info)info.innerHTML=`<b>${R.pontos.length.toLocaleString('pt-BR')}</b> pontos importados `+
      `de ${R.nBrutos.toLocaleString('pt-BR')} lidos (${semRe?'sem reamostragem':`espaçamento ${String(esp).replace('.',',')} m, ponto ${metNome}`}`+
      `${listaAt?' · com '+listaAt:''}${textoClasse}). `+
      `Camada <b>${esc2(L.name)}</b> criada — gere a superfície Raster ou TIN a partir dela.`;
    toast('Nuvem importada: '+R.pontos.length.toLocaleString('pt-BR')+' pontos');
  }catch(e){
    if(info)info.innerHTML='<b>Não foi possível importar:</b> '+esc2(e.message||e);
  }
}
/* ===========================================================================
   SÓLIDOS COMO CAMADA
   ---------------------------------------------------------------------------
   Até aqui o sólido gerado pela cubagem só existia dentro da cena 3D
   (V3.cubGroup, uma variável) — não aparecia na árvore, não dava para ligar,
   desligar, renomear, apagar nem consultar. Agora todo sólido renderizado é
   REGISTRADO em S.solidos e passa a viver na árvore de camadas com ícone
   próprio (🧊), olho de visibilidade e propriedades ao clicar.
   =========================================================================== */
function solNovoId(){ S._solSeq=(S._solSeq||0)+1; return 'sol'+S._solSeq; }

/* Liga a geometria viva ao item da árvore. A cena 3D pode ser reconstruída
   sem recriar o sólido; por isso a identidade precisa viajar no THREE.Group,
   e não ficar apenas na referência transitória V3.cubGroup. */
function solMarcaGrupo(sol, grupo){
  if(!sol||!grupo)return;
  grupo.userData=grupo.userData||{};
  grupo.userData.ccmSolidId=String(sol.id);
}
function solGrupoEhDoItem(grupo, sol){
  return !!(grupo&&sol&&(
    grupo===sol._grp ||
    (grupo.userData&&String(grupo.userData.ccmSolidId||'')===String(sol.id))
  ));
}

/* Registra (ou atualiza) o sólido recém-renderizado. `grupo` é o THREE.Group
   que já foi posto na cena — guardá-lo aqui é o que permite ligar/desligar
   sem refazer a geometria. */
function solRegistra(grupo, info){
  info=info||{};
  S.solidos=S.solidos||[];
  const C=(typeof S!=='undefined'&&S._cub)||{};
  const nome=info.nome||('Sólido '+((S.solidos.length||0)+1));
  /* mesmo modo + mesma origem: substitui em vez de empilhar cópias */
  let sol=S.solidos.find(s=>s.modo===info.modo&&s.origem===info.origem);
  if(!sol){ sol={id:solNovoId(),criado:new Date().toISOString()}; S.solidos.push(sol); }
  else { try{ solRemoveDaCena(sol); }catch(e){} }
  Object.assign(sol,{
    nome: sol.nome||nome,
    tipo:'solido',
    modo: info.modo||'—',
    origem: info.origem||'cubagem',
    visible: sol.visible!==false,
    nBlocos: info.nBlocos!=null?info.nBlocos:((C.blocos&&C.blocos.length)||null),
    volume: info.volume!=null?info.volume:(C.vol!=null?C.vol:null),
    densidade: info.densidade!=null?info.densidade:(C.dens!=null?C.dens:null),
    zmin: info.zmin!=null?info.zmin:(C.zmn!=null?C.zmn:null),
    zmax: info.zmax!=null?info.zmax:(C.zmx!=null?C.zmx:null),
    dom: info.dom||(C.dom?{...C.dom}:null),
    res: info.res!=null?info.res:null,
    fontes: info.fontes||S._cubFontes||sol.fontes||null,   /* TIN / raster / mista */
    cor: sol.cor||info.cor||null,
    opa: sol.opa!=null?sol.opa:1,
    regras: info.regras?info.regras.map(r=>({...r})):(S._cubRest||[]).map(r=>({...r})),
    regrasSig: info.regrasSig||((typeof cubRestSig==='function')?cubRestSig():null),
    _grp: grupo||null,
    /* geometria nova: descarta a lida do arquivo e as fontes do volume por
       cota da versão anterior (quem chamou atribui as novas em seguida) */
    _salvo:null, _geoArquivo:null, colunas:null, _blocos:null, mesh:null
  });
  if(grupo) solMarcaGrupo(sol,grupo);
  /* os vértices do grupo foram gravados na origem local da cena deste momento */
  if(grupo&&!(grupo.userData&&grupo.userData.ccmOrigin)&&Number.isFinite(V3.OX)&&Number.isFinite(V3.OY)&&Number.isFinite(V3.z0))
    grupo.userData.ccmOrigin={OX:V3.OX,OY:V3.OY,z0:V3.z0,VE:V3.VE||1};
  const temModeloBlocos=!!C.imported || !!(C.blocos&&C.blocos.length) ||
    Number.isFinite(C.totalBlocks) || Number.isFinite(C.nPai) || Number.isFinite(C.nSub);
  if((info.origem||'cubagem')==='cubagem'&&temModeloBlocos){
    const R=(typeof S!=='undefined'&&S._bmReport)||null;
    sol.modeloBlocos={
      importado:!!C.imported,arquivo:C.sourceName||null,
      blocosTotais:info.nBlocos!=null?info.nBlocos:(C.totalBlocks!=null?C.totalBlocks:(C.nPai!=null?C.nPai:null)),
      blocosExibidos:info.nExibidos!=null?info.nExibidos:(info.nBlocos!=null?info.nBlocos:((C.blocos&&C.blocos.length)||null)),
      blocoPai:[C.bx,C.by,C.bz].every(Number.isFinite)?[C.bx,C.by,C.bz]:null,
      classe:C.classFilter||null,atributoClasse:C.attrName||null,
      atributoLitologia:R?R.lithSource:null,litologias:R?R.byLith.length:null,
      atributoBancada:R?R.benchSource:null,bancadas:R?R.byBench.length:null,
      atributos:C.selectedAttributes?C.selectedAttributes.slice():[],
      filtrosAtributos:C.attributeFilters?C.attributeFilters.map(f=>({...f,values:(f.values||[]).slice()})):[],
      filtroEspacial:C.imported?!!C.spatialFilter:(S._cubRest||[]).length>0,
      regrasEspaciais:C.imported?(C.spatialFilter&&C.rules?C.rules.length:0):(S._cubRest||[]).length,
      amostrado:C.sampled!=null&&C.totalBlocks!=null&&C.sampled<C.totalBlocks
    };
  } else sol.modeloBlocos=null; // sólido liso não deve aparecer como modelo com 0 blocos
  /* renderização escolhida antes (cor/opacidade) sobrevive ao re-render */
  if(grupo&&(sol.cor||sol.opa!=null)) solAplicaRender(sol);
  if(grupo) grupo.visible = sol.visible!==false;
  try{ refreshUI(); }catch(e){}
  try{ if(typeof bmRefreshSolidSelect==='function')bmRefreshSolidSelect(); }catch(e){}
  return sol;
}
/* A cena 3D é DESTRUÍDA e recriada a cada remontagem (build3D dá dispose em
   tudo). Sem esta proteção, o grupo do sólido morre junto — era por isso que
   o sólido gerado sumia do 3D na primeira atualização automática. */
function solProtege(){
  (S.solidos||[]).forEach(sol=>{
    if(sol._grp){ try{ if(V3.scene)V3.scene.remove(sol._grp); }catch(e){} }
  });
}
function solRestaura(){
  (S.solidos||[]).forEach(sol=>{
    if(sol._grp){
      try{
        solMarcaGrupo(sol,sol._grp);
        V3.scene.add(sol._grp);
        sol._grp.visible=sol.visible!==false;
      }catch(e){}
    }
  });
  const ult=(S.solidos||[]).find(s=>s._grp);
  if(ult&&!V3.cubGroup) V3.cubGroup=ult._grp;
}
/* SÓLIDO NO LUGAR CERTO. Os vértices nascem na origem local da cena do
   momento (OX/OY = centro da primeira superfície ligada, z0, exagero). Ao
   desligar o MDT a cena é remontada com a origem da outra superfície (ou dos
   vetores) e o sólido, recolocado com as coordenadas antigas, ia parar a
   dezenas de metros do lugar — parecia sumir. Aqui o grupo é deslocado e
   escalado para ficar nas MESMAS coordenadas reais da origem atual. */
function solPosiciona(sol){
  const g=sol&&sol._grp,o=g&&g.userData&&g.userData.ccmOrigin;
  if(!o||!Number.isFinite(V3.OX)||!Number.isFinite(V3.OY)||!Number.isFinite(V3.z0))return;
  const ve=V3.VE||1;
  g.position.set(o.OX-V3.OX,(o.z0-V3.z0)*ve,V3.OY-o.OY);
  g.scale.set(1,ve/(o.VE||1),1);
  g.updateMatrixWorld(true);
}
function solPosicionaTodos(){
  (S.solidos||[]).forEach(s=>{ try{ solGarantaGrupo(s); solPosiciona(s); }catch(e){} });
}
/* Sólido fechado calculado fora do 3D (ex.: DCE das projeções de taludes):
   a casca vem em coordenadas reais (sol.mesh) e ganha o seu próprio objeto
   na cena. Antes ele não tinha geometria 3D: o "sólido" só aparecia como a
   superfície do topo apoiada no MDT, e sumia ao desligar o MDT. */
function solGarantaGrupo(sol){
  if(!sol||sol._grp||!window.THREE||typeof V3==='undefined'||!V3.scene)return false;
  if(!Number.isFinite(V3.OX)||!Number.isFinite(V3.OY)||!Number.isFinite(V3.z0))return false;
  /* casca fechada (DCE) ou partes lidas do arquivo do projeto, em coordenadas reais */
  const partes=sol.mesh&&sol.mesh.positions?[{t:'malha',pos:sol.mesh.positions,idx:sol.mesh.indices||null,casca:true}]:sol._salvo;
  if(!partes||!partes.length)return false;
  const ve=V3.VE||1,cor=sol.cor||'#f59f00',g=new THREE.Group();
  const loc=(x,y,z,out,i)=>{ out[i]=x-V3.OX; out[i+1]=(z-V3.z0)*ve; out[i+2]=-(y-V3.OY); };
  const material=(params,casca)=>{
    const m=typeof v3LambertMaterial==='function'?v3LambertMaterial(params,false):new THREE.MeshLambertMaterial(params);
    /* o topo do DCE coincide com a superfície projetada: ela fica por cima, sem cintilar */
    if(casca){ m.polygonOffset=true; m.polygonOffsetFactor=1; m.polygonOffsetUnits=1; }
    return m;
  };
  for(const p of partes){
    if(p.t==='malha'){
      const n=p.pos.length/3,L=new Float32Array(p.pos.length);
      for(let i=0;i<n;i++) loc(p.pos[3*i],p.pos[3*i+1],p.pos[3*i+2],L,3*i);
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.BufferAttribute(L,3));
      if(p.idx) geo.setIndex(new THREE.BufferAttribute(p.idx,1));
      let porCota=false;
      if(p.cor==='cota'&&typeof solColor==='function'){
        let zmn=sol.zmin,zmx=sol.zmax;
        if(!Number.isFinite(zmn)||!Number.isFinite(zmx)){ zmn=Infinity; zmx=-Infinity; for(let i=2;i<p.pos.length;i+=3){ if(p.pos[i]<zmn)zmn=p.pos[i]; if(p.pos[i]>zmx)zmx=p.pos[i]; } }
        const C=new Float32Array(p.pos.length);
        for(let i=0;i<n;i++) C.set(solColor((p.pos[3*i+2]-zmn)/Math.max(1e-6,zmx-zmn)),3*i);
        geo.setAttribute('color',new THREE.BufferAttribute(C,3)); porCota=true;
      }
      geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo,material(porCota?{vertexColors:true,side:THREE.DoubleSide}:{color:cor,side:THREE.DoubleSide},p.casca)));
    }else if(p.t==='blocos'){
      const n=p.cen.length/3,geo=new THREE.BoxGeometry(1,1,1),
        mat=new THREE.MeshLambertMaterial(p.rgb?{vertexColors:true}:{color:cor}),
        im=new THREE.InstancedMesh(geo,mat,n),m4=new THREE.Matrix4(),q=new THREE.Quaternion(),
        pos=new THREE.Vector3(),scl=new THREE.Vector3(),c=new THREE.Color(),t=[0,0,0];
      for(let i=0;i<n;i++){
        loc(p.cen[3*i],p.cen[3*i+1],p.cen[3*i+2],t,0); pos.set(t[0],t[1],t[2]);
        scl.set(p.tam[3*i],p.tam[3*i+2]*ve,p.tam[3*i+1]); m4.compose(pos,q,scl); im.setMatrixAt(i,m4);
        if(p.rgb){ c.setRGB(p.rgb[3*i]/255,p.rgb[3*i+1]/255,p.rgb[3*i+2]/255); im.setColorAt(i,c); }
      }
      im.instanceMatrix.needsUpdate=true; if(im.instanceColor)im.instanceColor.needsUpdate=true;
      g.add(im);
    }
  }
  g.userData.ccmOrigin={OX:V3.OX,OY:V3.OY,z0:V3.z0,VE:ve};
  g.userData.ccmDoArquivo=!sol.mesh;   // montado da geometria lida: regrava a mesma, sem recodificar
  solMarcaGrupo(sol,g); sol._grp=g; V3.scene.add(g);
  g.visible=sol.visible!==false;
  if(sol.cor||sol.opa!=null) solAplicaRender(sol);
  return true;
}
/* Extensão real (E, N, cota) dos sólidos visíveis: permite montar a cena 3D
   só com sólidos, sem MDT nem vetor 3D ligado. */
function solExtensao(){
  let e=null;
  const add=(x,y,z)=>{ if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z))return;
    if(!e)e={xmin:x,ymin:y,zmin:z,xmax:x,ymax:y,zmax:z};
    else{ if(x<e.xmin)e.xmin=x; if(x>e.xmax)e.xmax=x; if(y<e.ymin)e.ymin=y; if(y>e.ymax)e.ymax=y; if(z<e.zmin)e.zmin=z; if(z>e.zmax)e.zmax=z; } };
  for(const s of S.solidos||[]){
    if(s.visible===false)continue;
    if(s.mesh&&s.mesh.positions){ const p=s.mesh.positions; for(let i=0;i<p.length;i+=3)add(p[i],p[i+1],p[i+2]); continue; }
    if(s._salvo){
      for(const p of s._salvo){
        if(p.t==='malha') for(let i=0;i<p.pos.length;i+=3)add(p.pos[i],p.pos[i+1],p.pos[i+2]);
        else if(p.t==='blocos') for(let i=0;i<p.cen.length;i+=3){ const hx=p.tam[i]/2,hy=p.tam[i+1]/2,hz=p.tam[i+2]/2;
          add(p.cen[i]-hx,p.cen[i+1]-hy,p.cen[i+2]-hz); add(p.cen[i]+hx,p.cen[i+1]+hy,p.cen[i+2]+hz); }
      }
      continue;
    }
    const g=s._grp,o=g&&g.userData&&g.userData.ccmOrigin; let achou=false;
    if(o) g.traverse(c=>{
      const geo=c.geometry; if(c.isInstancedMesh||!geo||!geo.attributes||!geo.attributes.position)return;
      if(!geo.boundingBox)geo.computeBoundingBox();
      const b=geo.boundingBox; if(!b||b.isEmpty())return; achou=true;
      [b.min,b.max].forEach(v=>add(v.x+o.OX,o.OY-v.z,v.y/(o.VE||1)+o.z0));
    });
    if(!achou&&s.dom&&Number.isFinite(s.zmin)&&Number.isFinite(s.zmax)){ add(s.dom.x0,s.dom.y0,s.zmin); add(s.dom.x1,s.dom.y1,s.zmax); }
  }
  return e;
}
/* Triângulos do sólido em coordenadas reais (E, N, cota). */
function solTriangulos(sol,cb){
  if(sol.mesh&&sol.mesh.positions){
    const p=sol.mesh.positions,ix=sol.mesh.indices,P=k=>[p[3*k],p[3*k+1],p[3*k+2]];
    if(ix) for(let i=0;i+2<ix.length;i+=3) cb(P(ix[i]),P(ix[i+1]),P(ix[i+2]));
    else for(let k=0;k+2<p.length/3;k+=3) cb(P(k),P(k+1),P(k+2));
    return true;
  }
  /* sólido lido do arquivo: as malhas já estão em coordenadas reais */
  const malhas=sol._salvo?sol._salvo.filter(p=>p.t==='malha'):[];
  if(malhas.length){
    for(const m of malhas){ const p=m.pos,ix=m.idx,P=k=>[p[3*k],p[3*k+1],p[3*k+2]];
      if(ix) for(let i=0;i+2<ix.length;i+=3) cb(P(ix[i]),P(ix[i+1]),P(ix[i+2]));
      else for(let k=0;k+2<p.length/3;k+=3) cb(P(k),P(k+1),P(k+2)); }
    return true;
  }
  const g=sol._grp,o=g&&g.userData&&g.userData.ccmOrigin;
  if(!o||!window.THREE)return false;
  const vistos=new Set(),v=new THREE.Vector3(),m=new THREE.Matrix4(),mi=new THREE.Matrix4();
  const real=(x,y,z,M)=>{ v.set(x,y,z); if(M)v.applyMatrix4(M); return [v.x+o.OX,o.OY-v.z,v.y/(o.VE||1)+o.z0]; };
  g.traverse(c=>{
    if(!c.isMesh||!c.geometry||!c.geometry.attributes||!c.geometry.attributes.position)return;
    const mats=Array.isArray(c.material)?c.material:[c.material];
    if(mats.some(x=>x&&x.wireframe))return;                 // contorno em arame: mesma geometria
    const chave=c.isInstancedMesh?c:c.geometry; if(vistos.has(chave))return; vistos.add(chave);
    const pos=c.geometry.attributes.position,ix=c.geometry.index,nT=ix?ix.count/3:pos.count/3;
    const base=c.parent===g?c.matrix:null;
    const um=M=>{ for(let t=0;t<nT;t++){ const a=ix?ix.getX(3*t):3*t,b=ix?ix.getX(3*t+1):3*t+1,d=ix?ix.getX(3*t+2):3*t+2;
      cb(real(pos.getX(a),pos.getY(a),pos.getZ(a),M),real(pos.getX(b),pos.getY(b),pos.getZ(b),M),real(pos.getX(d),pos.getY(d),pos.getZ(d),M)); } };
    if(c.isInstancedMesh){ for(let i=0;i<c.count;i++){ c.getMatrixAt(i,mi); m.copy(base||new THREE.Matrix4()).multiply(mi); um(m); } }
    else um(base);
  });
  return true;
}
/* VOLUME A PARTIR DE UMA COTA. Colunas e blocos: exato por célula/bloco.
   Casca triangulada: teorema da divergência com F=(0,0,min(z,c)) — o volume
   abaixo da cota é a integral de min(z,c)·n_z na casca, sem fechar tampa no
   corte; faces verticais não contam, e a orientação é normalizada pelo
   volume total. */
function solVolumePorCota(sol,c){
  if(!sol||!Number.isFinite(c))return null;
  if(sol.colunas&&sol.colunas.zt){
    const {area,zt,zb}=sol.colunas; let ab=0,tot=0;
    for(let i=0;i<zt.length;i++){ const t=zt[i],b=zb[i]; if(!(t>b))continue; tot+=(t-b)*area; ab+=Math.max(0,Math.min(t,c)-b)*area; }
    return {abaixo:ab,acima:tot-ab,total:tot,metodo:'colunas'};
  }
  /* blocos do modelo; lido do arquivo sem o modelo completo, os blocos exibidos */
  let blocos=Array.isArray(sol._blocos)&&sol._blocos.length?sol._blocos:null;
  if(!blocos&&sol._salvo){
    const L=[];for(const p of sol._salvo)if(p.t==='blocos')for(let i=0;i<p.cen.length;i+=3)L.push({x:p.cen[i],y:p.cen[i+1],z:p.cen[i+2],dx:p.tam[i],dy:p.tam[i+1],dz:p.tam[i+2]});
    if(L.length)blocos=L;
  }
  if(blocos){
    let ab=0,tot=0;
    for(const b of blocos){ const v=b.dx*b.dy*b.dz; if(!(v>0))continue; tot+=v; ab+=b.dx*b.dy*Math.max(0,Math.min(b.dz,c-(b.z-b.dz/2))); }
    return {abaixo:ab,acima:tot-ab,total:tot,metodo:'blocos'};
  }
  let tot=0,ab=0,n=0;
  const area=(a,b,d)=>((b[0]-a[0])*(d[1]-a[1])-(d[0]-a[0])*(b[1]-a[1]))/2;
  const ok=solTriangulos(sol,(p,q,r)=>{
    const P=[p,q,r],A=area(p,q,r); if(!A)return; n++;
    tot+=A*(p[2]+q[2]+r[2])/3;
    const baixo=[],alto=[];
    for(let i=0;i<3;i++){ const a=P[i],b=P[(i+1)%3],ia=a[2]<=c,ib=b[2]<=c;
      if(ia)baixo.push(a); else alto.push(a);
      if(ia!==ib){ const t=(c-a[2])/(b[2]-a[2]),x=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),c]; baixo.push(x); alto.push(x); } }
    for(let k=1;k+1<baixo.length;k++){ const a=baixo[0],b=baixo[k],d=baixo[k+1]; ab+=area(a,b,d)*(a[2]+b[2]+d[2])/3; }
    for(let k=1;k+1<alto.length;k++) ab+=area(alto[0],alto[k],alto[k+1])*c;
  });
  if(!ok||!n||!tot)return null;
  const s=Math.sign(tot),total=tot*s,abaixo=Math.min(total,Math.max(0,ab*s));
  return {abaixo,acima:total-abaixo,total,metodo:'malha'};
}
/* ===========================================================================
   SÓLIDOS NO ARQUIVO DO PROJETO (.ccmgis)
   Antes os sólidos só existiam na sessão: ao reabrir o projeto era preciso
   gerá-los de novo. Agora cada sólido é gravado com as propriedades e a
   geometria em coordenadas reais (casca com vértices soldados e indexados,
   blocos instanciados, colunas dos sólidos extraídos e o modelo de blocos do
   volume por cota), em base64 como as grades dos rasters. Ao abrir, volta à
   árvore e à cena 3D na posição real.
   =========================================================================== */
const SOL_CAMPOS=['id','nome','tipo','modo','origem','visible','nBlocos','volume','densidade','zmin','zmax','dom','res','fontes',
  'cor','opa','regras','regrasSig','modeloBlocos','criado','atualizado','cotaCorte','fechado','concluido','iteracoes','altura','areaXY'];
const solGeoCache=new WeakMap();   // a geometria só é recodificada quando muda
function solU8(b64){ const bin=atob(b64),u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i); return u; }
/* Malha em coordenadas reais → partes gravadas: vértices relativos a uma
   origem inteira (precisão milimétrica em float32) e índices. Malhas sem
   índice são soldadas pela posição arredondada ao milímetro. */
function solCodificaMalha(pos,idx,cor){
  let ox=Infinity,oy=Infinity;
  for(let i=0;i<pos.length;i+=3){ if(pos[i]<ox)ox=pos[i]; if(pos[i+1]<oy)oy=pos[i+1]; }
  ox=Math.floor(ox); oy=Math.floor(oy);
  let P=pos,I=idx;
  if(!I){
    const mapa=new Map(),out=[],ind=new Uint32Array(pos.length/3);
    for(let k=0;k<pos.length/3;k++){
      const x=Math.round((pos[3*k]-ox)*1000),y=Math.round((pos[3*k+1]-oy)*1000),z=Math.round(pos[3*k+2]*1000),ch=x+','+y+','+z;
      let j=mapa.get(ch); if(j===undefined){ j=out.length/3; mapa.set(ch,j); out.push(pos[3*k],pos[3*k+1],pos[3*k+2]); }
      ind[k]=j;
    }
    P=out; I=ind;
  }
  const rel=new Float32Array(P.length);
  for(let i=0;i<P.length;i+=3){ rel[i]=P[i]-ox; rel[i+1]=P[i+1]-oy; rel[i+2]=P[i+2]; }
  return {t:'malha',ox,oy,n:rel.length/3,pos:f32ToB64(rel),idx:f32ToB64(I instanceof Uint32Array?I:Uint32Array.from(I)),cor:cor||null};
}
function solGeoParaSalvar(s){
  const fonte=s.mesh||s._grp;
  /* lido do arquivo e não refeito: grava a mesma geometria */
  if(!fonte||(s._geoArquivo&&!s.mesh&&s._grp.userData&&s._grp.userData.ccmDoArquivo)) return s._geoArquivo||null;
  if(solGeoCache.has(fonte)) return solGeoCache.get(fonte);
  const geo={v:1,partes:[],casca:!!s.mesh};
  if(s.mesh&&s.mesh.positions) geo.partes.push(solCodificaMalha(s.mesh.positions,s.mesh.indices||null,null));
  else{
    const g=s._grp,o=g.userData&&g.userData.ccmOrigin;
    if(!o||!window.THREE) return s._geoArquivo||null;
    const v=new THREE.Vector3(),mi=new THREE.Matrix4(),m=new THREE.Matrix4(),pv=new THREE.Vector3(),qv=new THREE.Quaternion(),sv=new THREE.Vector3(),vistos=new Set();
    g.traverse(c=>{
      if(!c.isMesh||!c.geometry||!c.geometry.attributes||!c.geometry.attributes.position)return;
      const mats=Array.isArray(c.material)?c.material:[c.material];
      if(mats.some(x=>x&&x.wireframe))return;
      const chave=c.isInstancedMesh?c:c.geometry; if(vistos.has(chave))return; vistos.add(chave);
      const base=c.parent===g?c.matrix:null;
      if(c.isInstancedMesh){
        const n=c.count,cen=new Float64Array(3*n),tam=new Float32Array(3*n),rgb=c.instanceColor?new Uint8Array(3*n):null;
        let ox=Infinity,oy=Infinity;
        for(let i=0;i<n;i++){
          c.getMatrixAt(i,mi); m.copy(base||new THREE.Matrix4()).multiply(mi); m.decompose(pv,qv,sv);
          cen[3*i]=pv.x+o.OX; cen[3*i+1]=o.OY-pv.z; cen[3*i+2]=pv.y/(o.VE||1)+o.z0;
          tam[3*i]=Math.abs(sv.x); tam[3*i+1]=Math.abs(sv.z); tam[3*i+2]=Math.abs(sv.y)/(o.VE||1);
          if(cen[3*i]<ox)ox=cen[3*i]; if(cen[3*i+1]<oy)oy=cen[3*i+1];
          if(rgb){ const a=c.instanceColor.array; rgb[3*i]=Math.round(a[3*i]*255); rgb[3*i+1]=Math.round(a[3*i+1]*255); rgb[3*i+2]=Math.round(a[3*i+2]*255); }
        }
        ox=Math.floor(ox); oy=Math.floor(oy);
        const rel=new Float32Array(3*n); for(let i=0;i<3*n;i+=3){ rel[i]=cen[i]-ox; rel[i+1]=cen[i+1]-oy; rel[i+2]=cen[i+2]; }
        geo.partes.push({t:'blocos',ox,oy,n,c:f32ToB64(rel),s:f32ToB64(tam),rgb:rgb?f32ToB64(rgb):null});
        return;
      }
      const pa=c.geometry.attributes.position,pos=new Float64Array(pa.count*3);
      for(let k=0;k<pa.count;k++){ v.set(pa.getX(k),pa.getY(k),pa.getZ(k)); if(base)v.applyMatrix4(base);
        pos[3*k]=v.x+o.OX; pos[3*k+1]=o.OY-v.z; pos[3*k+2]=v.y/(o.VE||1)+o.z0; }
      /* cores por cota variam de vértice a vértice: refeitas pela cota ao abrir */
      const ca=c.geometry.attributes.color;let porCota=false;
      if(ca&&ca.count>1)for(let k=1;k<ca.count&&!porCota;k++)porCota=ca.getX(k)!==ca.getX(0)||ca.getY(k)!==ca.getY(0)||ca.getZ(k)!==ca.getZ(0);
      const ix=c.geometry.index?Uint32Array.from(c.geometry.index.array):null;
      geo.partes.push(solCodificaMalha(pos,ix,porCota?'cota':null));
    });
  }
  if(s.colunas&&s.colunas.zt) geo.colunas={area:s.colunas.area,zt:f32ToB64(Float32Array.from(s.colunas.zt)),zb:f32ToB64(Float32Array.from(s.colunas.zb))};
  if(Array.isArray(s._blocos)&&s._blocos.length&&s._blocos.length<=1e6){
    let ox=Infinity,oy=Infinity; for(const b of s._blocos){ if(b.x<ox)ox=b.x; if(b.y<oy)oy=b.y; }
    ox=Math.floor(ox); oy=Math.floor(oy);
    const B=new Float32Array(6*s._blocos.length);
    s._blocos.forEach((b,i)=>{ B.set([b.x-ox,b.y-oy,b.z,b.dx,b.dy,b.dz],6*i); });
    geo.blocos={ox,oy,n:s._blocos.length,b:f32ToB64(B)};
  }
  solGeoCache.set(fonte,geo);
  return geo;
}
function solParaSalvar(){
  return (S.solidos||[]).map(s=>{
    const o={};
    for(const k of SOL_CAMPOS)if(s[k]!==undefined)o[k]=(s[k]!==null&&typeof s[k]==='object')?JSON.parse(JSON.stringify(s[k])):s[k];
    try{ o.geo=solGeoParaSalvar(s); }catch(e){ console.warn('geometria do sólido não gravada:',s.nome,e); o.geo=null; }
    return o;
  });
}
function solGeoDoArquivo(s,g){
  if(!g||g.v!==1)return;
  s._geoArquivo=g;
  const partes=[];
  for(const p of g.partes||[]){
    if(p.t==='malha'){
      const r=b64ToF32(p.pos),pos=new Float64Array(r.length);
      for(let i=0;i<r.length;i+=3){ pos[i]=r[i]+p.ox; pos[i+1]=r[i+1]+p.oy; pos[i+2]=r[i+2]; }
      partes.push({t:'malha',pos,idx:p.idx?b64ToU32(p.idx):null,cor:p.cor||null});
    }else if(p.t==='blocos'){
      const r=b64ToF32(p.c),cen=new Float64Array(r.length);
      for(let i=0;i<r.length;i+=3){ cen[i]=r[i]+p.ox; cen[i+1]=r[i+1]+p.oy; cen[i+2]=r[i+2]; }
      partes.push({t:'blocos',cen,tam:b64ToF32(p.s),rgb:p.rgb?solU8(p.rgb):null});
    }
  }
  if(g.casca&&partes.length===1&&partes[0].t==='malha'&&partes[0].idx)
    s.mesh={positions:partes[0].pos,indices:partes[0].idx,closed:true};   // casca fechada do DCE
  else s._salvo=partes.length?partes:null;
  if(g.colunas) s.colunas={area:g.colunas.area,zt:b64ToF32(g.colunas.zt),zb:b64ToF32(g.colunas.zb)};
  if(g.blocos){ const b=b64ToF32(g.blocos.b),L=new Array(g.blocos.n);
    for(let i=0;i<g.blocos.n;i++) L[i]={x:b[6*i]+g.blocos.ox,y:b[6*i+1]+g.blocos.oy,z:b[6*i+2],dx:b[6*i+3],dy:b[6*i+4],dz:b[6*i+5]};
    s._blocos=L; }
  if(s.mesh) solGeoCache.set(s.mesh,g);
}
/* Abrir projeto: sai o sólido do projeto anterior, entram os gravados. */
function solDoArquivo(lista){
  (S.solidos||[]).slice().forEach(s=>{ try{ solRemoveDaCena(s); }catch(e){} });
  S.solidos=[];
  if(!Array.isArray(lista)){ try{ refreshUI(); }catch(e){} return; }
  let seq=0;
  for(const o of lista){
    if(!o||!o.id)continue;
    const s={};for(const k of SOL_CAMPOS)if(o[k]!==undefined)s[k]=o[k];
    s.tipo=s.tipo||'solido'; s._grp=null;
    const m=/^sol(\d+)$/.exec(String(s.id)); if(m)seq=Math.max(seq,+m[1]);
    try{ solGeoDoArquivo(s,o.geo); }catch(e){ console.warn('sólido sem geometria legível:',s.nome,e); }
    S.solidos.push(s);
  }
  S._solSeq=Math.max(S._solSeq||0,seq);
  try{ if(typeof V3!=='undefined'&&V3.scene) solPosicionaTodos(); }catch(e){}
  try{ if(typeof bmRefreshSolidSelect==='function')bmRefreshSolidSelect(); }catch(e){}
}
/* ============================================================================
   EXTRAÇÃO DE SÓLIDOS INDIVIDUAIS (pilhas, edificações, contêineres)
   ----------------------------------------------------------------------------
   Grade fina sobre o domínio comum: h = topo − base por célula; células com
   h ≥ mínimo formam componentes conexos (flood fill); cada componente com
   área ≥ mínima vira UM SÓLIDO registrado, com volume (Σ h·cél²), área,
   altura máxima e geometria de colunas (topo pousado no envelope, pé no
   terreno, paredes só nas bordas expostas).
   ============================================================================ */
async function tinExtraiSolidos(rTopo,rBase,hMin,areaMin,cel,aceitaArea){
  const bT=rasterBounds(rTopo), bB=rasterBounds(rBase);
  const x0=Math.max(bT[0],bB[0]), y0=Math.max(bT[1],bB[1]);
  const x1=Math.min(bT[2],bB[2]), y1=Math.min(bT[3],bB[3]);
  if(!(x1>x0&&y1>y0))return {erro:'as superfícies não se sobrepõem'};
  const nc=Math.min(4000,Math.ceil((x1-x0)/cel)), nr=Math.min(4000,Math.ceil((y1-y0)/cel));
  const H=new Float32Array(nc*nr).fill(NaN), ZT=new Float32Array(nc*nr), ZB=new Float32Array(nc*nr);
  for(let r=0;r<nr;r++){
    if((r&63)===0)await new Promise(q=>setTimeout(q,0));
    const y=y0+(r+0.5)*cel;
    for(let c=0;c<nc;c++){
      const x=x0+(c+0.5)*cel;
      const zt=sampleZbil(rTopo.d,x,y), zb=sampleZbil(rBase.d,x,y);
      if((!aceitaArea||aceitaArea(x,y))&&isFinite(zt)&&isFinite(zb)&&zt-zb>=hMin){
        const k=r*nc+c; H[k]=zt-zb; ZT[k]=zt; ZB[k]=zb;
      }
    }
  }
  /* componentes conexos 4-viz */
  const comp=new Int32Array(nc*nr).fill(-1);
  const comps=[]; const pilha=[];
  for(let k0=0;k0<nc*nr;k0++){
    if(comp[k0]!==-1||isNaN(H[k0]))continue;
    const id=comps.length, cels=[];
    pilha.length=0; pilha.push(k0); comp[k0]=id;
    while(pilha.length){
      const k=pilha.pop(); cels.push(k);
      const r=(k/nc)|0, c=k%nc;
      if(c>0&&comp[k-1]===-1&&!isNaN(H[k-1])){comp[k-1]=id;pilha.push(k-1);}
      if(c<nc-1&&comp[k+1]===-1&&!isNaN(H[k+1])){comp[k+1]=id;pilha.push(k+1);}
      if(r>0&&comp[k-nc]===-1&&!isNaN(H[k-nc])){comp[k-nc]=id;pilha.push(k-nc);}
      if(r<nr-1&&comp[k+nc]===-1&&!isNaN(H[k+nc])){comp[k+nc]=id;pilha.push(k+nc);}
    }
    comps.push(cels);
  }
  const objetos=[];
  comps.forEach(cels=>{
    const area=cels.length*cel*cel;
    if(area<areaMin)return;
    let vol=0,hMax=0,zTmax=-Infinity,zBmin=Infinity;
    let cx0=Infinity,cx1=-Infinity,cy0=Infinity,cy1=-Infinity;
    cels.forEach(k=>{
      vol+=H[k]*cel*cel; if(H[k]>hMax)hMax=H[k];
      if(ZT[k]>zTmax)zTmax=ZT[k]; if(ZB[k]<zBmin)zBmin=ZB[k];
      const r=(k/nc)|0,c=k%nc;
      const px=x0+(c+0.5)*cel, py=y0+(r+0.5)*cel;
      if(px<cx0)cx0=px; if(px>cx1)cx1=px; if(py<cy0)cy0=py; if(py>cy1)cy1=py;
    });
    objetos.push({cels,area,vol,hMax,zTmax,zBmin,bb:[cx0,cy0,cx1,cy1]});
  });
  objetos.sort((a,b)=>b.vol-a.vol);
  return {objetos, grade:{nc,nr,cel,x0,y0}, H, ZT, ZB, compDe:comp};
}
/* geometria de colunas de um objeto (célula a célula) para a cena 3D */
function tinObjetoMesh(obj,G,ZT,ZB,cor){
  if(!(typeof V3!=='undefined'&&V3.scene&&V3._ctx))return null;
  const {OX,OY,zmnG,VE}=V3._ctx, cel=G.cel;
  const pos=[]; const idx=[]; let nv=0;
  const dentro=new Set(obj.cels);
  const quad=(p1,p2,p3,p4)=>{ pos.push(...p1,...p2,...p3,...p4);
    idx.push(nv,nv+1,nv+2, nv,nv+2,nv+3); nv+=4; };
  obj.cels.forEach(k=>{
    const r=(k/G.nc)|0, c=k%G.nc;
    const xw=G.x0+c*cel, ye=G.y0+r*cel;
    const zt=(ZT[k]-zmnG)*VE, zb=(ZB[k]-zmnG)*VE;
    const X0=xw-OX, X1=xw+cel-OX, Y0=-(ye-OY), Y1=-(ye+cel-OY);
    /* topo (na cota do envelope da célula) */
    quad([X0,zt,Y0],[X1,zt,Y0],[X1,zt,Y1],[X0,zt,Y1]);
    /* paredes só nas bordas expostas (vizinho fora do objeto) */
    if(!dentro.has(k-1)||c===0)        quad([X0,zb,Y0],[X0,zt,Y0],[X0,zt,Y1],[X0,zb,Y1]);
    if(!dentro.has(k+1)||c===G.nc-1)   quad([X1,zb,Y1],[X1,zt,Y1],[X1,zt,Y0],[X1,zb,Y0]);
    if(!dentro.has(k-G.nc)||r===0)     quad([X1,zb,Y0],[X1,zt,Y0],[X0,zt,Y0],[X0,zb,Y0]);
    if(!dentro.has(k+G.nc)||r===G.nr-1)quad([X0,zb,Y1],[X0,zt,Y1],[X1,zt,Y1],[X1,zb,Y1]);
  });
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,v3LambertMaterial({
    color:cor, side:THREE.DoubleSide},true));
  const g=new THREE.Group(); g.add(mesh);
  g.userData.ccmOrigin={OX,OY,z0:zmnG,VE};   // origem com que os vértices foram gravados
  return g;
}
const EXTR_CORES=['#e0704a','#4a90e0','#57b96a','#c9a13c','#a35ac9','#38b7b0','#d05a8a','#8a9a3a'];
function tinExtrFaixa(txt,defMin,defMax){
  const a=String(txt||'').replace(/,/g,'.').match(/[-+]?\d*\.?\d+/g)||[];
  const x=Number(a[0]),y=Number(a[1]);
  return isFinite(x)&&isFinite(y)?[Math.min(x,y),Math.max(x,y)]:[defMin,defMax];
}
/* ----------------------------------------------------------------------------
   ORIENTAÇÃO PELO RETÂNGULO DE ÁREA MÍNIMA
   O eixo principal por PCA só é estável quando a pegada já é um retângulo
   alongado e limpo. Num bloco quase quadrado de contêineres, numa
   pegada em L ou numa fila com falhas, a PCA devolve um eixo arbitrário — e o
   eixo errado desmonta toda a contagem que vem depois. O casco convexo com
   calipers giratórios devolve o retângulo real que envolve a pegada.
   -------------------------------------------------------------------------- */
function tinContCascoConvexo(pts){
  if(pts.length<4)return pts.slice();
  const p=pts.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const bx=[];for(const q of p){while(bx.length>=2&&cross(bx[bx.length-2],bx[bx.length-1],q)<=0)bx.pop();bx.push(q);}
  const tp=[];for(let i=p.length-1;i>=0;i--){const q=p[i];
    while(tp.length>=2&&cross(tp[tp.length-2],tp[tp.length-1],q)<=0)tp.pop();tp.push(q);}
  bx.pop();tp.pop();
  const h=bx.concat(tp);
  return h.length>=3?h:p;
}
function tinContRetMinimo(pts,folga){
  const h=tinContCascoConvexo(pts);
  if(h.length<2)return null;
  let melhor=null;
  for(let i=0;i<h.length;i++){
    const j=(i+1)%h.length,dx=h[j][0]-h[i][0],dy=h[j][1]-h[i][1],n=Math.hypot(dx,dy);
    if(n<1e-9)continue;
    const ux=dx/n,uy=dy/n,vx=-uy,vy=ux;
    let u0=Infinity,u1=-Infinity,v0=Infinity,v1=-Infinity;
    for(const q of h){const u=q[0]*ux+q[1]*uy,v=q[0]*vx+q[1]*vy;
      if(u<u0)u0=u;if(u>u1)u1=u;if(v<v0)v0=v;if(v>v1)v1=v;}
    const a=(u1-u0)*(v1-v0);
    if(!melhor||a<melhor.a)melhor={a,ux,uy,vx,vy,u0,u1,v0,v1};
  }
  if(!melhor)return null;
  const f=Math.max(0,folga||0),cu=(melhor.u0+melhor.u1)/2,cv=(melhor.v0+melhor.v1)/2;
  return {cx:cu*melhor.ux+cv*melhor.vx, cy:cu*melhor.uy+cv*melhor.vy,
    ux:melhor.ux,uy:melhor.uy,vx:melhor.vx,vy:melhor.vy,
    dimU:(melhor.u1-melhor.u0)+f, dimV:(melhor.v1-melhor.v0)+f,
    angulo:Math.atan2(melhor.uy,melhor.ux)*180/Math.PI};
}
/* ----------------------------------------------------------------------------
   DECOMPOSIÇÃO DA PEGADA EM MÓDULOS 20′/40′
   Um componente do pátio quase nunca é um contêiner só: é uma fila, ou várias
   filas encostadas, com comprimentos diferentes e vãos no meio. A versão
   anterior tentava encaixar UMA grade regular no retângulo do componente
   inteiro; bastava uma fila mais curta que a vizinha para o encaixe falhar e
   cair na busca por manchas, que despejava dezenas de hipóteses fracas e
   inflava a contagem. Agora o eixo vem do retângulo de área mínima, as FILAS
   saem do perfil transversal e cada TRECHO CONTÍNUO de fila é ladrilhado no
   seu próprio comprimento. Ângulos vizinhos são testados e vence o que melhor
   explica a pegada — nem a cota nem a ortofoto entram aqui; elas validam
   cada módulo depois.
   -------------------------------------------------------------------------- */
/* A textura do teto desempata blocos quase quadrados: as nervuras do
   contêiner variam principalmente ao longo do seu comprimento. Amostras
   interiores evitam confundir a borda do bloco com a direção das fileiras. */
function tinContDirecaoTextura(comp,G){
  const O=tinContOrtoFonte();if(!O)return null;
  const gray=(x,y)=>{const q=O.pixel(x,y),px=Math.round(q[0]),py=Math.round(q[1]);
    if(px<0||py<0||px>=O.w||py>=O.h)return NaN;
    const k=(py*O.w+px)*4,d=O.id.data;
    return d[k+3]>=128&&Math.max(d[k],d[k+1],d[k+2])>35?.299*d[k]+.587*d[k+1]+.114*d[k+2]:NaN;};
  const st=Math.max(1,Math.ceil(comp.pts.length/1800)),off=Math.max(1,Math.round(.6/G.cel));
  let xx=0,xy=0,yy=0,n=0;
  for(let i=0;i<comp.pts.length;i+=st){
    const [x,y]=comp.pts[i],col=Math.floor((x-G.x0)/G.cel),row=Math.floor((y-G.y0)/G.cel);
    if(![[off,0],[-off,0],[0,off],[0,-off]].every(([dc,dr])=>comp.set.has((row+dr)*G.nc+col+dc)))continue;
    const gx=gray(x+.12,y)-gray(x-.12,y),gy=gray(x,y+.12)-gray(x,y-.12);
    if(!Number.isFinite(gx)||!Number.isFinite(gy))continue;
    const mag=Math.hypot(gx,gy);if(mag<2||mag>75)continue;
    xx+=gx*gx;xy+=gx*gy;yy+=gy*gy;n++;
  }
  const tr=xx+yy;if(n<35||tr<1)return null;
  return {angulo:.5*Math.atan2(2*xy,xx-yy),confianca:Math.hypot(xx-yy,2*xy)/tr,n};
}
/* Descontinuidades persistentes no MDS distinguem a direção das fileiras.
   A mediana remove buracos e objetos pontuais; descontar a dispersão evita
   que ruído de poucos centímetros determine o eixo. A ortofoto não entra. */
function tinContBordaMDS(ret,ux,uy,L,W,amostra){
  if(typeof amostra!=='function')return 0;
  const vx=-uy,vy=ux;let best=0;
  for(let v=-W*.22;v<=W*.22;v+=.1){
    const dif=[];
    for(let u=-L*.35;u<=L*.35;u+=Math.max(.2,L/90)){
      const x=ret.cx+u*ux+v*vx,y=ret.cy+u*uy+v*vy,
        a=amostra(x+.3*vx,y+.3*vy),b=amostra(x-.3*vx,y-.3*vy);
      if(Number.isFinite(a)&&Number.isFinite(b))dif.push(a-b);
    }
    if(dif.length<12)continue;
    const med=tinContainerQuantil(dif,.5),mad=tinContainerQuantil(dif.map(z=>Math.abs(z-med)),.5);
    best=Math.max(best,Math.abs(med)-mad);
  }
  return best;
}
function tinContTilesComponente(comp,G,cfg){
  const L20=6.058,L40=12.192,W=cfg.largura||2.438,
    tol=Math.max(.01,Math.min(.10,cfg.compTol??.10)),
    largTol=Math.max(.01,cfg.largTol??.10);
  let pts=comp.pts;
  if(!pts||pts.length<4)return [];
  /* Amostrar mantém previsível o custo do teste de ângulos em pátios grandes;
     a forma da fila não depende de cada célula individual. */
  if(pts.length>120000){const st=Math.ceil(pts.length/120000),q=[];
    for(let i=0;i<pts.length;i+=st)q.push(pts[i]);pts=q;}
  const ret=tinContRetMinimo(pts,G.cel);
  if(!ret)return [];
  const dentro=comp.set,
    dirU=tinContBordaMDS(ret,ret.ux,ret.uy,ret.dimU,ret.dimV,cfg.amostraMDS),
    dirV=tinContBordaMDS(ret,ret.vx,ret.vy,ret.dimV,ret.dimU,cfg.amostraMDS),
    dirMDS=Math.max(dirU,dirV)>=.02?{
      angulo:(ret.angulo+(dirV>dirU?90:0))*Math.PI/180,
      confianca:Math.abs(dirU-dirV)/Math.max(.02,dirU+dirV)}:null;
  const cobertura=(cx,cy,L,e)=>{
    const nu=L>L20*1.5?11:7;let ok=0,n=0;
    for(let j=0;j<5;j++)for(let i=0;i<nu;i++){
      const du=(i/(nu-1)-.5)*L*.84,dv=(j/4-.5)*W*.84,
        x=cx+du*e.ux+dv*e.vx,y=cy+du*e.uy+dv*e.vy,
        c=Math.floor((x-G.x0)/G.cel),r=Math.floor((y-G.y0)/G.cel);
      n++;if(c>=0&&r>=0&&c<G.nc&&r<G.nr&&dentro.has(r*G.nc+c))ok++;
    }
    return n?ok/n:0;
  };
  /* Uma pegada alongada fora dos comprimentos ISO não pode ser girada
     90 graus só para caber na grade de 20 pés. Quando as descontinuidades do
     MDS confirmam o eixo maior, preserve o comprimento observado e
     registre explicitamente que o tipo precisa de conferência. */
  const longoU=ret.dimU>=ret.dimV,medL=Math.max(ret.dimU,ret.dimV),medW=Math.min(ret.dimU,ret.dimV),
    medUX=longoU?ret.ux:ret.vx,medUY=longoU?ret.uy:ret.vy,
    medN=Math.round(medW/W),foraISO=Math.abs(medL-L20)>L20*tol&&Math.abs(medL-L40)>L40*tol;
  if(cfg.amostraMDS&&foraISO&&medL>L20&&medL<L40&&medL/medW>1.4
    &&medN>=1&&medN<=4&&Math.abs(medW-medN*W)<=medN*W*.25){
    const longitudinal=longoU?dirU:dirV,transversal=longoU?dirV:dirU;
    if(longitudinal>=.025&&longitudinal>transversal*2){
      const e={ux:medUX,uy:medUY,vx:-medUY,vy:medUX},medidos=[];
      for(let j=0;j<medN;j++){
        const v=(j-(medN-1)/2)*(medW/medN),cx=ret.cx+v*e.vx,cy=ret.cy+v*e.vy,
          cov=cobertura(cx,cy,medL,e);
        if(cov<.65)continue;
        medidos.push({tipo:'Medido',comprimento:medL,largura:medW/medN,cx,cy,...e,
          angulo:Math.atan2(e.uy,e.ux)*180/Math.PI,ocupacao:cov,
          scoreForma:cov*.8,moduloU:j+1,modulos:medN,revisar:true});
      }
      if(medidos.length===medN)return medidos;
    }
  }
  const p=Math.max(.18,G.cel);                     /* passo dos perfis 1-D */
  const hipotese=angRad=>{
    const ux=Math.cos(angRad),uy=Math.sin(angRad),vx=-uy,vy=ux,e={ux,uy,vx,vy},
      U=new Float64Array(pts.length),V=new Float64Array(pts.length);
    let u0=Infinity,u1=-Infinity,v0=Infinity,v1=-Infinity;
    for(let i=0;i<pts.length;i++){
      const u=pts[i][0]*ux+pts[i][1]*uy,v=pts[i][0]*vx+pts[i][1]*vy;
      U[i]=u;V[i]=v;
      if(u<u0)u0=u;if(u>u1)u1=u;if(v<v0)v0=v;if(v>v1)v1=v;
    }
    /* Perfil transversal: separa filas encostadas em bandas de ~2,44 m. */
    const nvb=Math.max(1,Math.ceil((v1-v0)/p)+1),perf=new Int32Array(nvb);
    for(let i=0;i<pts.length;i++)perf[Math.min(nvb-1,Math.floor((V[i]-v0)/p))]++;
    let pmax=0;for(let i=0;i<nvb;i++)if(perf[i]>pmax)pmax=perf[i];
    if(!pmax)return null;
    const lim=Math.max(1,pmax*.28),bandas=[];
    for(let i=0;i<nvb;i++){
      if(perf[i]<lim)continue;
      const ult=bandas[bandas.length-1];
      if(ult&&i-ult.fim<=1)ult.fim=i; else bandas.push({ini:i,fim:i});
    }
    const filas=[];
    for(const b of bandas){
      const larg=(b.fim-b.ini+1)*p,n=Math.max(1,Math.round(larg/W));
      if(larg<W*(1-largTol)*.8||n>8)continue;   /* faixa fina demais ou pátio colado */
      for(let i=0;i<n;i++)filas.push(v0+b.ini*p+(i+.5)*(larg/n));
    }
    const tiles=[];let cobTot=0,areaTiles=0,areaValidada=0;
    for(const vc of filas){
      const nub=Math.max(1,Math.ceil((u1-u0)/p)+1),lin=new Int32Array(nub);
      for(let i=0;i<pts.length;i++){
        if(Math.abs(V[i]-vc)>W*.33)continue;
        lin[Math.min(nub-1,Math.floor((U[i]-u0)/p))]++;
      }
      let lmax=0;for(let i=0;i<nub;i++)if(lin[i]>lmax)lmax=lin[i];
      if(!lmax)continue;
      const on=new Uint8Array(nub),limU=Math.max(1,lmax*.34);
      for(let i=0;i<nub;i++)on[i]=lin[i]>=limU?1:0;
      /* Fecha vãos curtos — junta entre contêineres, falha de pintura, buraco
         do MDS — sem colar filas que estão realmente separadas. */
      const vaoMax=Math.max(1,Math.round(.55/p));
      for(let i=0;i<nub;i++){
        if(on[i]){continue;}
        let j=i;while(j<nub&&!on[j])j++;
        if(i>0&&j<nub&&j-i<=vaoMax)for(let q=i;q<j;q++)on[q]=1;
        i=j;
      }
      let i=0;
      while(i<nub){
        if(!on[i]){i++;continue;}
        let j=i;while(j<nub&&on[j])j++;
        const uA=u0+i*p,Lrun=(j-i)*p;i=j;
        if(Lrun<L20*(1-tol))continue;
        /* 40′ tem 12,192 m; dois 20′ somam 12,116 m: o arranjo conservador usa o menor número de peças.
           A folga cresce devagar com o número de peças (junta de poucos cm
           entre contêineres se acumula): deixá-la proporcional ao total fazia
           uma fila longa aceitar quase qualquer comprimento — era assim que
           um telhado corrido de galpão passava por fila de contêineres. */
        const slots=Math.max(1,Math.round(Lrun/L20));
        if(slots>48)continue;
        const folga=L20*tol*Math.max(1.25,1+slots*.35);
        if(Math.abs(Lrun-slots*L20)>folga)continue;
        const seqs=[],longos=slots>>1;
        for(let curto=0;curto<=(slots%2&&cfg.avaliaTile?longos:0);curto++){
          const seq=Array.from({length:longos},()=>({tipo:'40′',L:L40}));
          if(slots%2)seq.splice(curto,0,{tipo:'20′',L:L20});
          seqs.push(seq);
        }
        let arranjo=null;
        for(const seq of seqs){
          const nominal=seq.reduce((n,s)=>n+s.L,0),escala=Lrun/nominal,
            forma=Math.max(0,1-Math.abs(Lrun-nominal)/folga),run=[];
          let cursor=uA,nota=0;
          seq.forEach((s,iu)=>{
            const trecho=s.L*escala,uc=cursor+trecho/2;cursor+=trecho;
            const cx=uc*ux+vc*vx,cy=uc*uy+vc*vy,cov=cobertura(cx,cy,s.L,e);
            if(cov<.46)return;
            const t={tipo:s.tipo,comprimento:s.L,largura:W,cx,cy,ux,uy,vx,vy,
              angulo:angRad*180/Math.PI,ocupacao:cov,
              scoreForma:Math.max(0,Math.min(1,cov*.72+forma*.28)),moduloU:iu+1,modulos:seq.length};
            const qualidade=cfg.avaliaTile?cfg.avaliaTile(t):cov;
            nota+=s.L*W*qualidade;run.push(t);
          });
          if(!arranjo||nota>arranjo.nota)arranjo={run,nota};
        }
        if(arranjo){
          areaValidada+=arranjo.nota;
          for(const t of arranjo.run){areaTiles+=t.comprimento*W;cobTot+=t.ocupacao*t.comprimento*W;tiles.push(t);}
        }

      }
    }
    if(!tiles.length)return null;
    /* Quanto da pegada as peças explicam e quanto das peças a pegada preenche.
       O ângulo vencedor precisa ir bem nos dois: só o primeiro premiaria
       ladrilhar o pátio inteiro; só o segundo premiaria achar uma peça só. */
    const areaComp=comp.area||pts.length*G.cel*G.cel,
      explica=Math.min(1,cobTot/Math.max(1e-6,areaComp)),
      preenche=cobTot/Math.max(1e-6,areaTiles);
    /* A geometria pode encaixar em duas direções, mas apenas uma manter os
       tetos na mesma altura. A validação deve escolher o ângulo também,
       não só a ordem das peças; de outro modo a etapa seguinte descarta
       a hipótese vencedora sem tentar a alternativa válida. */
    const valida=cfg.avaliaTile?Math.min(1,areaValidada/Math.max(1e-6,areaComp*2)):0;
    return {tiles,score:explica*.5+preenche*.5+valida+(dirMDS?.confianca||0)*.4*(1+Math.cos(2*(angRad-(dirMDS?.angulo||0))))/2};
  };
  const base=ret.angulo*Math.PI/180,angs=[];
  for(const b of [base,base+Math.PI/2])for(const d of [-4,-2,0,2,4])angs.push(b+d*Math.PI/180);
  let melhor=null;
  for(const a of angs){const h=hipotese(a);if(h&&(!melhor||h.score>melhor.score))melhor=h;}
  if(melhor)return melhor.tiles.slice(0,400);
  /* Pegada isolada que o perfil não resolveu (mancha curta, muito ruído nas
     bordas): o próprio retângulo mínimo ainda pode ser um contêiner único. */
  const cU=Math.max(ret.dimU,ret.dimV),cV=Math.min(ret.dimU,ret.dimV),
    lg=Math.abs(cU-L20)<=L20*tol?L20:(Math.abs(cU-L40)<=L40*tol?L40:0);
  if(!lg||Math.abs(cV-W)>W*largTol)return [];
  const gira=ret.dimU>=ret.dimV,
    e={ux:gira?ret.ux:ret.vx, uy:gira?ret.uy:ret.vy,
       vx:gira?ret.vx:-ret.ux, vy:gira?ret.vy:-ret.uy},
    cov=cobertura(ret.cx,ret.cy,lg,e);
  if(cov<.50)return [];
  return [{tipo:lg===L20?'20′':'40′',comprimento:lg,largura:W,cx:ret.cx,cy:ret.cy,
    ux:e.ux,uy:e.uy,vx:e.vx,vy:e.vy,angulo:Math.atan2(e.uy,e.ux)*180/Math.PI,
    ocupacao:cov,scoreForma:Math.min(1,cov),moduloU:1,modulos:1}];
}

function tinContainerQuantil(a,p){
  if(!a||!a.length)return NaN;const q=a.slice().sort((x,y)=>x-y),i=(q.length-1)*p,
    i0=Math.floor(i),i1=Math.ceil(i);return q[i0]+(q[i1]-q[i0])*(i-i0);
}
/* Dimensões externas ISO 668: 20′ 6,058 m; 40′ 12,192 m;
   largura 2,438 m; alturas padrão 2,591 m e High Cube 2,896 m.
   Fonte: Hapag-Lloyd, Container Specification, tabela da página 5. */
function tinContainerNivel(altura,cfg){
  const alturas=(cfg.alturas||[(cfg.altMin+cfg.altMax)/2]).filter(h=>Number.isFinite(h)&&h>0),
    max=Math.max(1,cfg.maxEmp||3),tol=cfg.altTol??.10;
  let melhor=null;
  if(!Number.isFinite(altura))return {ok:false,empilhados:1,alturaUn:alturas[0]||2.591,erro:Infinity};
  for(let n=1;n<=max;n++)for(const h of alturas){
    const erro=Math.abs(altura-n*h)/(n*h);
    if(!melhor||erro<melhor.erro)melhor={empilhados:n,alturaUn:h,erro};
  }
  return {...melhor,ok:!!melhor&&melhor.erro<=tol};
}
/* Uma faixa de beiral pode ter a altura de três contêineres, mas continua
   para dentro de uma cobertura inclinada. Confira a vizinhança além da
   pegada: uma rampa contínua de seis larguras não é uma pilha retangular.
   A regra independe da cor e preserva fileiras planas de contêineres. */
function tinContTelhadoContinuo(c,rMDS,rMDT,h0){
  const L=c.comprimento||(c.tipo==='20′'?6.058:12.192),W=c.largura||2.438;
  for(const [vx,vy] of [[c.vx,c.vy],[c.ux,c.uy],[(c.ux+c.vx)/Math.SQRT2,(c.uy+c.vy)/Math.SQRT2],[(c.ux-c.vx)/Math.SQRT2,(c.uy-c.vy)/Math.SQRT2]])for(const lado of [-1,1]){
    const perfil=[];
    for(let j=1;j<=7;j++){
      const hs=[];
      for(let i=0;i<7;i++){
        const du=(i/6-.5)*L*.8,dv=lado*j*W,
          x=c.cx+du*vy+dv*vx,y=c.cy-du*vx+dv*vy,
          h=sampleZbil(rMDS.d,x,y)-sampleZbil(rMDT.d,x,y);
        if(Number.isFinite(h))hs.push(h);
      }
      perfil.push(hs.length>=5?tinContainerQuantil(hs,.5):NaN);
    }
    if(!perfil.every(Number.isFinite)||perfil.some(h=>h<h0-.55))continue;
    if(Math.abs(perfil[0]-h0)>Math.max(.6,h0*.45))continue;
    const q=perfil.slice(2),n=q.length,xm=(n-1)/2,ym=q.reduce((a,b)=>a+b,0)/n;
    let numer=0,denom=0;
    q.forEach((y,i)=>{numer+=(i-xm)*(y-ym);denom+=(i-xm)**2;});
    const passo=numer/denom,inclinacao=passo/W,
      residuo=Math.max(...q.map((y,i)=>Math.abs(y-(ym+passo*(i-xm)))));
    if(ym>h0+.8&&inclinacao>=.025&&inclinacao<=.30&&residuo<=.45)return true;
  }
  /* Um telhado pequeno não alcança sete larguras. Procure também uma
     rampa suave e contínua de 3,5 m junto à pegada, inclusive na cumeeira.
     Use a cota do MDS para não confundir declive do terreno com teto. */
  for(const [vx,vy] of [[c.vx,c.vy],[c.ux,c.uy]])for(const lado of [-1,1]){
    const perfil=[];
    for(let j=0;j<=12;j++){
      const zs=[],hs=[];
      for(let i=0;i<5;i++){
        const du=(i/4-.5)*Math.min(L*.5,4),dv=lado*j*.5,
          x=c.cx+du*vy+dv*vx,y=c.cy-du*vx+dv*vy,
          z=sampleZbil(rMDS.d,x,y),h=z-sampleZbil(rMDT.d,x,y);
        if(Number.isFinite(z)&&Number.isFinite(h)){zs.push(z);hs.push(h);}
      }
      const z=tinContainerQuantil(zs,.5),h=tinContainerQuantil(hs,.5);
      if(zs.length<4||h<h0*.75||(j&&Math.abs(z-perfil[j-1])>.6)){break;}
      perfil.push(z);
      if(j<7)continue;
      const q=perfil.slice(j-7,j+1),ym=q.reduce((a,b)=>a+b,0)/8;
      let num=0;for(let k=0;k<8;k++)num+=(k-3.5)*(q[k]-ym);
      const passo=num/42,inc=Math.abs(passo)/.5,
        residuo=Math.max(...q.map((v,k)=>Math.abs(v-ym-passo*(k-3.5))));
      if(inc>=.05&&inc<=.35&&residuo<=.10)return true;
    }
  }
  return false;
}
/* Verifica a pegada inteira no MDS e no MDT. Um ponto alto isolado sobre
   guindaste, caminhão ou telhado não consegue preencher esta malha plana. */
function tinValidaContainerPegada(c,rMDS,rMDT,cfg){
  const L=c.comprimento||(c.tipo==='20′'?6.058:12.192),W=c.largura||cfg.largura||2.438,nu=L<9?7:11,
    cs=(rMDS.d&&rMDS.d.cs)||.15,grosso=cs>=.75,nv=grosso?3:5,
    tot=nu*nv,hs=[],zts=[],zbs=[];
  for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){
    const du=(i/(nu-1)-.5)*L*(grosso?.66:.80),dv=(j/(nv-1)-.5)*W*(grosso?.30:.78),
      x=c.cx+du*c.ux+dv*c.vx,y=c.cy+du*c.uy+dv*c.vy,
      zt=sampleZbil(rMDS.d,x,y),zb=sampleZbil(rMDT.d,x,y);
    if(!isFinite(zt)||!isFinite(zb))continue;
    hs.push(zt-zb);zts.push(zt);zbs.push(zb);
  }
  const hMed=tinContainerQuantil(hs,.5),nivel=tinContainerNivel(hMed,cfg),emp=nivel.empilhados,h0=nivel.alturaUn,
    tolAmostra=Math.max(emp*h0*.10,grosso?cs*.42:.34),
    indices=hs.map((h,i)=>({h,i})).filter(q=>Math.abs(q.h-emp*h0)<=tolAmostra),
    hNivel=indices.map(q=>q.h),zNivel=indices.map(q=>zts[q.i]),bNivel=indices.map(q=>zbs[q.i]),
    cobertura=hs.length/tot,acordo=hs.length?indices.length/hs.length:0,
    hAceito=tinContainerQuantil(hNivel,.5),zMed=tinContainerQuantil(zNivel,.5),
    zBase=tinContainerQuantil(bNivel,.5),plano=tinContainerQuantil(zNivel,.90)-tinContainerQuantil(zNivel,.10),
    limPlano=Math.max(.30,cs*(grosso?1.35:2.2)),
    erroAlt=isFinite(hAceito)&&emp?Math.abs(hAceito-emp*h0)/(emp*h0*.10):Infinity,
    nivelOK=nivel.ok&&isFinite(hAceito)&&Math.abs(hAceito/emp-h0)<=h0*(cfg.altTol??.10);
  const ok=nivelOK&&cobertura>=.74&&acordo>=(grosso?.52:.72)&&isFinite(plano)&&plano<=limPlano&&erroAlt<=1
    &&!tinContTelhadoContinuo(c,rMDS,rMDT,hAceito);
  return {ok,empilhados:emp,alturaUn:h0,empBruto:emp,alturaBruta:hMed,nivelOK,coberturaAlt:cobertura,acordoAlt:acordo,planicidade:plano,
    erroAlt,alturaCentro:hAceito,zMDS:zMed,zMDT:zBase,
    scoreMDS:ok?Math.max(0,Math.min(1,.34*cobertura+.32*acordo+.22*(1-plano/limPlano)+.12*(1-erroAlt))):0};
}

/* Evidência cromática é avaliada na figura inteira e em três trechos, não
   apenas num pixel central. Ela ajuda a separar teto de galpão/máquina, mas
   não elimina contêiner branco ou desbotado quando MDS e geometria são fortes. */
function tinEvidenciaOrtoPegada(c,usar){
  const O=tinContOrtoFonte(),id=O&&O.id;
  if(!usar||!O)return {ok:true,disponivel:false,fracao:0,score:.55};
  const L=c.comprimento||(c.tipo==='20′'?6.058:12.192),W=c.largura||2.438,nu=L<9?12:20,nv=6,
    terc=[0,0,0],nt=[0,0,0];let cor=0,n=0,satS=0;
  const pixel=(du,dv)=>{
    const x=c.cx+du*c.ux+dv*c.vx,y=c.cy+du*c.uy+dv*c.vy,
      q=O.pixel(x,y),px=Math.round(q[0]),py=Math.round(q[1]);
    if(px<0||py<0||px>=O.w||py>=O.h)return null;
    const k=(py*O.w+px)*4;return [id.data[k],id.data[k+1],id.data[k+2],id.data[k+3]];
  };
  for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){
    const du=(i/(nu-1)-.5)*L*.86,dv=(j/(nv-1)-.5)*W*.82,
      q=pixel(du,dv);if(!q)continue;
    const [r,g,bb,a]=q,
      mx=Math.max(r,g,bb),mn=Math.min(r,g,bb),sat=mx?(mx-mn)/mx:0,t=Math.min(2,Math.floor(i*3/nu));
    n++;nt[t]++;satS+=sat;
    if(tinOrtoCorContainer(r,g,bb,a)){cor++;terc[t]++;}
  }
  /* Diferença através das quatro bordas. Em um galpão ladrilhado, as linhas
     inventadas dentro do teto não têm contraste; num contêiner há borda ou
     emenda visível, inclusive quando a pintura é branca/cinza. */
  const dist=(a,b)=>a&&b?Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])/(255*Math.sqrt(3)):0,
    bordas=[];
  for(const lado of [-1,1]){
    let s=0,m=0;for(let i=1;i<nu-1;i++){
      const du=(i/(nu-1)-.5)*L*.82,
        a=pixel(du,lado*W*.39),bb=pixel(du,lado*W*.57);if(a&&bb){s+=dist(a,bb);m++;}
    }bordas.push(m?s/m:0);
  }
  for(const lado of [-1,1]){
    let s=0,m=0;for(let j=1;j<nv-1;j++){
      const dv=(j/(nv-1)-.5)*W*.76,
        a=pixel(lado*L*.41,dv),bb=pixel(lado*L*.55,dv);if(a&&bb){s+=dist(a,bb);m++;}
    }bordas.push(m?s/m:0);
  }
  const ord=bordas.slice().sort((a,b)=>b-a),borda2=((ord[0]||0)+(ord[1]||0))/2,
    fracao=n?cor/n:0,minTerco=Math.min(...terc.map((v,i)=>nt[i]?v/nt[i]:0)),sat=n?satS/n:0,
    corOK=fracao>=.16&&minTerco>=.035,bordaOK=borda2>=.055,
    ok=corOK||bordaOK,
    score=Math.max(0,Math.min(1,Math.max(fracao/.45,borda2/.14)*.72+Math.min(1,sat/.24)*.28));
  return {ok,forte:corOK&&bordaOK,disponivel:true,fracao,minTerco,sat,borda:borda2,bordas,score};
}

function tinContainerAngDif(a,b){
  let d=Math.abs((a||0)-(b||0))%180;return d>90?180-d:d;
}
function tinContainerConflito(a,b){
  const dx=b.cx-a.cx,dy=b.cy-a.cy,dxy=Math.hypot(dx,dy);if(dxy<1.65)return true;
  const la=a.comprimento||(a.tipo==='20′'?6.058:12.192),lb=b.comprimento||(b.tipo==='20′'?6.058:12.192),
    duA=Math.abs(dx*a.ux+dy*a.uy),dvA=Math.abs(dx*a.vx+dy*a.vy),
    duB=Math.abs(dx*b.ux+dy*b.uy),dvB=Math.abs(dx*b.vx+dy*b.vy);
  /* Mesmo com PCA instável em uma mancha pequena, se um centro cai dentro
     da caixa do outro trata-se da mesma pegada, não de outro contêiner. */
  if((duA<la*.47&&dvA<2.438*.47)||(duB<lb*.47&&dvB<2.438*.47))return true;
  if(tinContainerAngDif(a.angulo,b.angulo)>22)return false;
  const du=duA,dv=dvA,
    ou=Math.max(0,(la+lb)/2-du),ov=Math.max(0,2.438-dv),inter=ou*ov,
    un=la*2.438+lb*2.438-inter;
  return du<.65&&dv<.65||un>0&&inter/un>.34;
}
/* Consolida fragmentos: duas metades colineares viram uma hipótese de 40′;
   depois uma supressão por sobreposição mantém somente o melhor centro. */
function tinConsolidaContainers(lista,rMDS,rMDT,cfg){
  const src=lista.slice(),usado=new Set(),fundidos=[];
  for(let i=0;i<src.length;i++){
    if(usado.has(i)||src[i].tipo!=='20′')continue;let bj=-1,be=Infinity;
    for(let j=i+1;j<src.length;j++){
      if(usado.has(j)||src[j].tipo!=='20′'||tinContainerAngDif(src[i].angulo,src[j].angulo)>14)continue;
      /* Duas peças com níveis ou cotas de teto distintos não formam um
         único 40′, mesmo quando a amostragem da união favorece uma delas. */
      if(src[i].empilhados!==src[j].empilhados)continue;
      if(Number.isFinite(src[i].zMDS)&&Number.isFinite(src[j].zMDS)
        &&Math.abs(src[i].zMDS-src[j].zMDS)>Math.max(.30,((rMDS.d&&rMDS.d.cs)||.15)*2.2))continue;
      const dx=src[j].cx-src[i].cx,dy=src[j].cy-src[i].cy,
        du=Math.abs(dx*src[i].ux+dy*src[i].uy),dv=Math.abs(dx*src[i].vx+dy*src[i].vy),
        er=Math.abs(du-6.058)/6.058+dv/2.438;
      if(du>=6.058*.85&&du<=6.058*1.15&&dv<=.85&&er<be){be=er;bj=j;}
    }
    if(bj>=0){
      const a=src[i],b=src[bj],sg=(a.ux*b.ux+a.uy*b.uy)<0?-1:1,
        ux0=a.ux+sg*b.ux,uy0=a.uy+sg*b.uy,nm=Math.hypot(ux0,uy0)||1,
        c={...a,tipo:'40′',comprimento:12.192,cx:(a.cx+b.cx)/2,cy:(a.cy+b.cy)/2,
          ux:ux0/nm,uy:uy0/nm,vx:-uy0/nm,vy:ux0/nm,angulo:Math.atan2(uy0,ux0)*180/Math.PI,
          ocupacao:(a.ocupacao+b.ocupacao)/2,scoreForma:Math.max(a.scoreForma||0,b.scoreForma||0)};
      const v=tinValidaContainerPegada(c,rMDS,rMDT,cfg),o=tinEvidenciaOrtoPegada(c,cfg.usaOrto);
      if(v.ok&&(!o.disponivel||o.ok)){Object.assign(c,v,{orto:o,scoreFinal:.58*v.scoreMDS+.24*(c.scoreForma||0)+.18*o.score});fundidos.push(c);usado.add(i);usado.add(bj);}
    }
  }
  src.forEach((c,i)=>{if(!usado.has(i))fundidos.push(c);});
  fundidos.sort((a,b)=>((b.scoreFinal||0)+(b.tipo==='40′'?.035:0))-((a.scoreFinal||0)+(a.tipo==='40′'?.035:0)));
  const out=[];for(const c of fundidos)if(!out.some(q=>tinContainerConflito(c,q)))out.push(c);
  return out;
}
/* Cor média em torno de uma coordenada de projeto. A ortofoto carregada já
   está na mesma referência de trabalho; não é obrigatório existir imagem. */
function tinEvidenciaOrtoContainer(x,y,usar){
  const O=tinContOrtoFonte(),id=O&&O.id;
  if(!usar||!O)return {ok:true,disponivel:false,sat:null};
  const [px,py]=O.pixel(x,y);
  if(px<2||py<2||px>=O.w-2||py>=O.h-2)return {ok:false,disponivel:true,sat:0};
  let rr=0,gg=0,bb=0,n=0;
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
    const k=((Math.round(py+dy)*O.w+Math.round(px+dx))*4),a=id.data[k+3];
    if(a<32)continue;rr+=id.data[k];gg+=id.data[k+1];bb+=id.data[k+2];n++;
  }
  if(!n)return {ok:false,disponivel:true,sat:0};
  rr/=n;gg/=n;bb/=n;const mx=Math.max(rr,gg,bb),mn=Math.min(rr,gg,bb),sat=mx?((mx-mn)/mx):0,lum=mx/255;
  /* Contêineres no pátio aparecem com cobertura colorida (ferrugem/azul).
     A margem baixa evita perder pintura desbotada, mas remove pavimento,
     telhado cinza e sombras pretas que hoje viram falsos pontos. */
  return {ok:sat>=.075&&lum>=.16&&lum<=.96,disponivel:true,sat,lum};
}
/* A ortofoto é a fonte para ENCONTRAR o contêiner (não o MDS). No pátio os
   tetos são predominantemente ferrugem/vermelho ou azul e formam retângulos;
   a classificação de altura é aplicada somente depois, no centro do retângulo.
   A imagem no CCMGIS é north-up e a grade é invertida em Y para o CRS local. */
function tinOrtoCorContainer(r,g,b,a){
  if(a<80)return false;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),sat=mx?((mx-mn)/mx):0;
  if(mx<55||sat<.10)return false;
  /* Ferrugem desbotada continua válida, mas amarelo vivo de máquinas não:
     no ferrugem o vermelho domina e G−B não cresce como no amarelo. */
  const ferrugem=r-g>9&&r-b>17&&g-b<58&&r>g*1.035;
  const azul=b-r>10&&b-g>7&&b>r*1.055;
  return ferrugem||azul;
}
/* Pixels originais e prévia Mercator têm referências diferentes. A análise
   não pode ler a prévia como UTM nem sobrescrever o cache nativo do GeoTIFF. */
function tinContOrtoFonte(){
  const I=S.img;if(!I)return null;
  let p;
  if(I._id&&I._w&&I._h&&I.b)p={id:I._id,w:I._w,h:I._h,b:I.b,crs:typeof orthoCRS==='function'?orthoCRS(I):(I._sourceCRS||S.workCRS)};
  else if(I._contOrto&&I._contOrto.url===I.url)p=I._contOrto;
  if(!p||!(p.b[2]>p.b[0]&&p.b[3]>p.b[1]))return null;
  const tr=p.crs===S.workCRS?null:proj4(S.workCRS,p.crs),b=p.b,
    pixel=(x,y)=>{const q=tr?tr.forward([x,y]):[x,y];return [(q[0]-b[0])/(b[2]-b[0])*p.w-.5,(b[3]-q[1])/(b[3]-b[1])*p.h-.5];},
    world=(px,py)=>{const q=[b[0]+(px+.5)/p.w*(b[2]-b[0]),b[3]-(py+.5)/p.h*(b[3]-b[1])];return tr?tr.inverse(q):q;},
    corners=[world(-.5,-.5),world(p.w-.5,-.5),world(-.5,p.h-.5),world(p.w-.5,p.h-.5)];
  return {...p,pixel,world,bWork:[Math.min(...corners.map(q=>q[0])),Math.min(...corners.map(q=>q[1])),Math.max(...corners.map(q=>q[0])),Math.max(...corners.map(q=>q[1]))]};
}
async function tinAsseguraPixelsOrto(){
  const I=S.img;if(!I||!I.url)return false;
  if(tinContOrtoFonte())return true;
  try{
    const url=I.url,im=new Image();im.decoding='async';
    await new Promise((ok,erro)=>{im.onload=ok;im.onerror=()=>erro(new Error('imagem da ortofoto não abriu'));im.src=url;});
    if(S.img!==I||I.url!==url)return false;
    const cv=document.createElement('canvas');cv.width=im.naturalWidth||im.width;cv.height=im.naturalHeight||im.height;
    const cx=cv.getContext('2d',{willReadFrequently:true});cx.drawImage(im,0,0);
    let b=I.b,crs=typeof orthoCRS==='function'?orthoCRS(I):(I._sourceCRS||S.workCRS);
    if(I._warpWM&&Array.isArray(I._llbounds)&&I._llbounds.length===2){
      const sw=reproj('EPSG:4326','EPSG:3857',I._llbounds[0][1],I._llbounds[0][0]),
        ne=reproj('EPSG:4326','EPSG:3857',I._llbounds[1][1],I._llbounds[1][0]);
      b=[sw[0],sw[1],ne[0],ne[1]];crs='EPSG:3857';
    }
    I._contOrto={id:cx.getImageData(0,0,cv.width,cv.height),w:cv.width,h:cv.height,b,crs,url};
    return true;
  }catch(e){console.warn('pixels da ortofoto:',e);return false;}
}
/* Máscaras de candidatos por nível de altura MDS−MDT. A ortofoto orienta
   e valida as pegadas depois da segmentação, sem unir pintura, máquinas e
   contêineres de alturas distintas numa única mancha. */
async function tinContGradeCandidatos(rMDS,rMDT,areaBusca,cfg){
  const bT=rasterBounds(rMDS),bB=rasterBounds(rMDT);
  let x0=Math.max(bT[0],bB[0]),y0=Math.max(bT[1],bB[1]),
      x1=Math.min(bT[2],bB[2]),y1=Math.min(bT[3],bB[3]);
  const O=tinContOrtoFonte(),id=O&&O.id,
    usaOrto=!!(cfg.usaOrto&&O);
  /* Recorte de trabalho: sem ele, um MDS de mina inteira obrigaria a grade a
     ficar grosseira demais para enxergar 2,44 m de largura. */
  const rec=(areaBusca&&areaBusca.bbox)||(usaOrto?O.bWork:null);
  if(rec){x0=Math.max(x0,rec[0]);y0=Math.max(y0,rec[1]);x1=Math.min(x1,rec[2]);y1=Math.min(y1,rec[3]);}
  if(!(x1-x0>3&&y1-y0>3))
    return {erro:'MDS, MDT'+(usaOrto?', ortofoto':'')+' e área de busca não se sobrepõem o bastante para procurar contêineres.'};
  let cel=.25,nc=Math.ceil((x1-x0)/cel),nr=Math.ceil((y1-y0)/cel);
  const MAXC=4.5e6;
  if(nc*nr>MAXC){const f=Math.sqrt((nc*nr)/MAXC);cel*=f;
    nc=Math.ceil((x1-x0)/cel);nr=Math.ceil((y1-y0)/cel);}
  const N=nc*nr,H=new Float32Array(N).fill(NaN),
    VAL=new Uint8Array(N);
  for(let r=0;r<nr;r++){
    if((r&63)===0)await new Promise(q=>setTimeout(q,0));
    const y=y0+(r+.5)*cel;
    for(let c=0;c<nc;c++){
      const x=x0+(c+.5)*cel;
      if(areaBusca&&!areaBusca.aceita(x,y))continue;
      const k=r*nc+c;VAL[k]=1;
      const zt=sampleZbil(rMDS.d,x,y),zb=sampleZbil(rMDT.d,x,y);
      if(isFinite(zt)&&isFinite(zb))H[k]=zt-zb;
    }
  }
  const grade={nc,nr,cel,x0,y0},C=tinContComponentesGrade(grade,H,VAL,cfg);
  return {...C,grade,H,VAL,usaOrto,erro:null};
}
/* Separe patamares antes de dividir fileiras. A máscara única colava pilhas
   de alturas diferentes, veículos e muros aos contêineres; suas saliências
   alteravam o eixo e apagavam fileiras inteiras. */
function tinContComponentesGrade(G,H,VAL,cfg){
  const {nc,nr,cel,x0,y0}=G,N=nc*nr,rotulo=new Uint8Array(N),comps=[];
  let grandes=0;
  for(let k=0;k<N;k++){
    if(!VAL[k]||!Number.isFinite(H[k]))continue;
    const q=tinContainerNivel(H[k],cfg);
    if(q.ok)rotulo[k]=q.empilhados;
  }
  for(let nivel=1;nivel<=Math.max(1,cfg.maxEmp||3);nivel++){
    let m=new Uint8Array(N);
    for(let k=0;k<N;k++)if(rotulo[k]===nivel)m[k]=1;
  /* Fechamento morfológico verdadeiro (dilata → erode): une a junta entre
     contêineres e a falha de pintura sem inflar a pegada, que é justamente o
     que a medida do comprimento não perdoa. */
  const dil=new Uint8Array(N);
  for(let r=0;r<nr;r++)for(let c=0;c<nc;c++){
    let on=0;
    for(let dr=-1;dr<=1&&!on;dr++)for(let dc=-1;dc<=1;dc++){
      const rr=r+dr,cc=c+dc;
      if(rr>=0&&cc>=0&&rr<nr&&cc<nc&&m[rr*nc+cc]){on=1;break;}
    }
    dil[r*nc+c]=on;
  }
  const fec=new Uint8Array(N);
  for(let r=0;r<nr;r++)for(let c=0;c<nc;c++){
    let on=1;
    for(let dr=-1;dr<=1&&on;dr++)for(let dc=-1;dc<=1;dc++){
      const rr=r+dr,cc=c+dc;
      if(rr<0||cc<0||rr>=nr||cc>=nc||!dil[rr*nc+cc]){on=0;break;}
    }
    fec[r*nc+c]=(on&&VAL[r*nc+c])?1:0;
  }
  m=fec;
  const visto=new Uint8Array(N),fila=[],
    areaMin=Math.max(2.5,(cfg.largura||2.438)*6.058*.42),areaMax=20000;
  for(let k0=0;k0<N;k0++){
    if(!m[k0]||visto[k0])continue;
    const cels=[];fila.length=0;fila.push(k0);visto[k0]=1;
    while(fila.length){
      const k=fila.pop();cels.push(k);
      const r=(k/nc)|0,c=k%nc;
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
        if(!dr&&!dc)continue;
        const rr=r+dr,cc=c+dc;
        if(rr<0||cc<0||rr>=nr||cc>=nc)continue;
        const kk=rr*nc+cc;
        if(m[kk]&&!visto[kk]){visto[kk]=1;fila.push(kk);}
      }
    }
    const area=cels.length*cel*cel;
    if(area<areaMin)continue;
    /* Mancha do tamanho de um pátio inteiro é talude, pilha ou telhado
       contínuo — não um conjunto de contêineres encostados. */
    if(area>areaMax){grandes++;continue;}
    comps.push({cels,set:new Set(cels),area,nivel,
      pts:cels.map(k=>[x0+((k%nc)+.5)*cel, y0+(((k/nc)|0)+.5)*cel])});
  }

  }
  comps.sort((a,b)=>b.area-a.area);
  return {comps,grandes};
}

function tinContaEmpilhamento(altura,cfg){
  return tinContainerNivel(altura,cfg);
}
/* Área de busca da contagem: polígono fecha a pesquisa; linha recebe um
   buffer em metros. As geometrias são reprojetadas para o CRS de trabalho. */
/* O bbox acompanha o filtro porque a grade de análise precisa nascer recortada:
   varrer uma mina inteira a 25 cm por causa de um pátio é o que forçava a
   célula a crescer até perder os 2,44 m de largura do contêiner. */
function tinContBBox(listas,folga){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  listas.forEach(ps=>ps.forEach(p=>{
    if(p[0]<x0)x0=p[0];if(p[0]>x1)x1=p[0];
    if(p[1]<y0)y0=p[1];if(p[1]>y1)y1=p[1];}));
  if(!isFinite(x0))return null;
  const f=folga||0;return [x0-f,y0-f,x1+f,y1+f];
}
function tinContFiltroArea(L,raio){
  if(!L)return {aceita:()=>true,nome:'toda a área',bbox:null};
  const linhas=[],aneis=[];
  (L.features||[]).forEach(f=>{
    const rs=(f.multi&&Array.isArray(f.geom&&f.geom[0]&&f.geom[0][0]))?f.geom:[f.geom];
    (rs||[]).forEach(q=>{if(!q||q.length<2)return;
      const p=q.map(v=>reproj(L.crs,S.workCRS,v[0],v[1]));
      if(L.gtype==='polygon'&&p.length>=3)aneis.push(p); else linhas.push(p);
    });
  });
  if(L.gtype==='polygon'&&aneis.length){
    const ind=aneis.map(a=>typeof indiceAnel==='function'?indiceAnel(a):null);
    return {nome:L.name,bbox:tinContBBox(aneis,2),
      aceita:(x,y)=>{let n=0;for(let i=0;i<aneis.length;i++)if(pointInRing(x,y,aneis[i],ind[i]))n++;return n%2===1;}};
  }
  const r=Math.max(.1,+raio||0),r2=r*r;
  if(linhas.length)return {nome:L.name+' + raio '+r+' m',bbox:tinContBBox(linhas,r+2),
    aceita:(x,y)=>{
      for(const ln of linhas)for(let i=0;i<ln.length-1;i++)if(distPtSeg([x,y],ln[i],ln[i+1])**2<=r2)return true;
      return false;
    }};
  return {aceita:()=>true,nome:'toda a área',bbox:null};
}
/* Polígono de consulta que existe só durante a sessão de contagem. Evita
   obrigar o usuário a criar/salvar uma camada vetorial só para recortar uma
   busca rápida no pátio. */
function tinContBuscaRedraw(){
  const q=S._tinContBusca;if(!q||!map)return;
  if(!q.layer)q.layer=L2.layerGroup().addTo(map);
  q.layer.clearLayers();
  if(q.pts&&q.pts.length){
    const opt={pane:'alagis_desenho',interactive:false};
    if(q.pts.length>=3)L2.polygon(q.pts,{color:'#f5a524',weight:2,dashArray:'6 4',fillColor:'#f5a524',fillOpacity:.12,...opt}).addTo(q.layer);
    else L2.polyline(q.pts,{color:'#f5a524',weight:2,dashArray:'6 4',...opt}).addTo(q.layer);
    q.pts.forEach(p=>L2.circleMarker(p,{radius:4,color:'#fff',weight:1.2,fillColor:'#f5a524',fillOpacity:1,...opt}).addTo(q.layer));
  }
}
function tinContBuscaOut(txt){const e=document.getElementById('tinContBuscaOut');if(e)e.innerHTML=txt||'';}
function tinContBuscaDesenha(){
  if(!map)return;
  const antiga=S._tinContBusca;
  if(antiga&&antiga.layer)antiga.layer.clearLayers();
  S._tinContBusca={pts:[],ring:null,armed:true,layer:antiga&&antiga.layer||null};
  setTool('contBusca');tinContBuscaRedraw();
  tinContBuscaOut('<b>Clique nos vértices do polígono no mapa.</b> Dê duplo clique ou use “Concluir busca” ao terminar. Esc cancela o traçado.');
  toast('Desenhe o polígono de busca de contêineres');
}
function tinContBuscaFinaliza(){
  const q=S._tinContBusca;if(!q||!q.armed)return;
  if(!q.pts||q.pts.length<3){toast('Marque ao menos 3 vértices para a área de busca');return;}
  const ring=q.pts.map(p=>{const v=fromWGS(S.workCRS,p[1],p[0]);return [v[0],v[1]];});
  if(Math.hypot(ring[0][0]-ring[ring.length-1][0],ring[0][1]-ring[ring.length-1][1])>1e-8)ring.push(ring[0].slice());
  q.ring=ring;q.armed=false;tinContBuscaRedraw();setTool('select');
  const sa=document.getElementById('tinContArea');if(sa){refreshExtracaoSolidosPanel();sa.value='__temp__';}
  tinContBuscaOut('✓ <b>Polígono temporário pronto.</b> A contagem pesquisará somente seu interior; ele não será salvo como camada.');
  toast('Área temporária de busca definida');
}
function tinContBuscaLimpa(){
  const q=S._tinContBusca;if(q&&q.layer){q.layer.clearLayers();try{map.removeLayer(q.layer);}catch(e){}}
  S._tinContBusca=null;if(S.tool==='contBusca')setTool('select');
  const sa=document.getElementById('tinContArea');if(sa&&sa.value==='__temp__')sa.value='';
  tinContBuscaOut('Desenhe um polígono no mapa para pesquisar somente dentro dele. Ele não será salvo como camada.');
}
function tinContFiltroAreaTemp(){
  const q=S._tinContBusca,ring=q&&q.ring;
  if(!ring||ring.length<3)return null;
  const ind=typeof indiceAnel==='function'?indiceAnel(ring):null;
  return {nome:'polígono temporário desenhado',bbox:tinContBBox([ring],2),
    aceita:(x,y)=>pointInRing(x,y,ring,ind)};
}
/* A imagem de fundo principal continua compatível com projetos antigos, mas
   a lista aceita também ortofotos que integrações futuras registrem em
   S.ortofotos. Cada superfície 3D guarda a escolha pelo id, não pelo nome. */
function listaOrtofotosCarregadas(){
  const out=[], vistos=new Set();
  const add=(id,o)=>{
    if(!o||!o.url||!o.b||vistos.has(String(id)))return;
    vistos.add(String(id)); out.push({id:String(id),o});
  };
  (Array.isArray(S.ortofotos)?S.ortofotos:[]).forEach((o,i)=>add(o.id!=null?o.id:'arquivo:'+i,o));
  if(S.img)add('principal',S.img);
  return out;
}
function registraOrtoParaDrape(I){
  if(!I||!I.url||!I.b)return;
  const id=I._ortoId||(I._ortoId='orto-'+Date.now()+'-'+Math.random().toString(36).slice(2,7));
  S.ortofotos=Array.isArray(S.ortofotos)?S.ortofotos:[];
  /* A URL principal pode estar em Web Mercator, enquanto b permanece no CRS
     de origem. Guardar só URL + b fazia a próxima ortofoto deixar o drape
     anterior sem a informação necessária para posicionar a textura. */
  const crs=typeof orthoCRS==='function'?orthoCRS(I):(I._crsFixo||I._sourceCRS||S.workCRS);
  const copia={id,name:I.name||'Ortofoto',url:I.url,b:I.b.slice(),visible:true,
    _warpWM:!!I._warpWM,
    _llbounds:Array.isArray(I._llbounds)?I._llbounds.map(p=>p.slice()):null,
    _workPreviewURL:I._workPreviewURL||null,_crsFixo:crs,_sourceCRS:crs};
  const k=S.ortofotos.findIndex(o=>String(o.id)===String(id));
  if(k>=0)S.ortofotos[k]=copia; else S.ortofotos.push(copia);
}
function ortofoto3DSelecionada(r){
  const lista=listaOrtofotosCarregadas();
  if(!lista.length)return null;
  const id=r&&r._v3&&r._v3.ortoId;
  return lista.find(q=>q.id===String(id))||lista[0];
}
/* Alternativa sem MDT: identifica a face alta de uma ruptura pelo maior
   gradiente entre células vizinhas. O sólido resultante representa a
   elevação junto à ruptura; por não haver terreno de referência, o volume é
   uma estimativa da faixa íngreme, nunca substitui o volume entre superfícies. */
async function tinExtraiSolidosPorAngulo(rTopo,angulo,areaMin,cel){
  const b=rasterBounds(rTopo), nc=Math.min(4000,Math.ceil((b[2]-b[0])/cel)), nr=Math.min(4000,Math.ceil((b[3]-b[1])/cel));
  if(!(nc>1&&nr>1))return {erro:'a superfície é pequena demais para analisar o ângulo'};
  const ZT=new Float32Array(nc*nr), ZB=new Float32Array(nc*nr), H=new Float32Array(nc*nr).fill(NaN);
  ZT.fill(NaN); ZB.fill(NaN);
  for(let r=0;r<nr;r++){
    if((r&63)===0)await new Promise(q=>setTimeout(q,0));
    const y=b[1]+(r+.5)*cel;
    for(let c=0;c<nc;c++){const z=sampleZbil(rTopo.d,b[0]+(c+.5)*cel,y);if(isFinite(z))ZT[r*nc+c]=z;}
  }
  const lim=Math.max(1,Math.min(89.9,+angulo||80))*Math.PI/180;
  const minDif=Math.tan(lim)*cel;
  for(let r=0;r<nr;r++)for(let c=0;c<nc;c++){
    const k=r*nc+c,z=ZT[k]; if(!isFinite(z))continue;
    let baixo=Infinity;
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
      if(!dr&&!dc)continue; const rr=r+dr,cc=c+dc;if(rr<0||cc<0||rr>=nr||cc>=nc)continue;
      const v=ZT[rr*nc+cc];if(isFinite(v)&&v<baixo)baixo=v;
    }
    if(isFinite(baixo)&&z-baixo>=minDif){H[k]=z-baixo;ZB[k]=baixo;}
  }
  const comp=new Int32Array(nc*nr).fill(-1), comps=[], pilha=[];
  for(let k0=0;k0<nc*nr;k0++){
    if(comp[k0]>=0||!isFinite(H[k0]))continue;
    const id=comps.length,cels=[];pilha.length=0;pilha.push(k0);comp[k0]=id;
    while(pilha.length){const k=pilha.pop();cels.push(k);const r=(k/nc)|0,c=k%nc;
      for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;const rr=r+dr,cc=c+dc,kk=rr*nc+cc;
        if(rr>=0&&cc>=0&&rr<nr&&cc<nc&&comp[kk]<0&&isFinite(H[kk])){comp[kk]=id;pilha.push(kk);}}
    } comps.push(cels);
  }
  const objetos=[];
  comps.forEach(cels=>{const area=cels.length*cel*cel;if(area<areaMin)return;
    let vol=0,hMax=0,zTmax=-Infinity,zBmin=Infinity,cx0=Infinity,cx1=-Infinity,cy0=Infinity,cy1=-Infinity;
    cels.forEach(k=>{const h=H[k];vol+=h*cel*cel;hMax=Math.max(hMax,h);zTmax=Math.max(zTmax,ZT[k]);zBmin=Math.min(zBmin,ZB[k]);
      const r=(k/nc)|0,c=k%nc,x=b[0]+(c+.5)*cel,y=b[1]+(r+.5)*cel;cx0=Math.min(cx0,x);cx1=Math.max(cx1,x);cy0=Math.min(cy0,y);cy1=Math.max(cy1,y);});
    objetos.push({cels,area,vol,hMax,zTmax,zBmin,bb:[cx0,cy0,cx1,cy1]});
  });
  objetos.sort((a,b)=>b.vol-a.vol);
  return {objetos,grade:{nc,nr,cel,x0:b[0],y0:b[1]},H,ZT,ZB,compDe:comp,angular:true,angulo:+angulo};
}
function refreshExtracaoSolidosPanel(){
  const st=document.getElementById('tinExtrTopo'), sb=document.getElementById('tinExtrBase');
  if(!st||!sb)return;
  const tv=st.value,bv=sb.value, rs=(S.rasters||[]).filter(r=>r&&r.d&&r.d.z);
  const opt=r=>`${(r.tinPuro||(r.d&&r.d.tin))?'▲ ':''}${esc(r.name)}`;
  st.innerHTML=rs.length?rs.map(r=>`<option value="${r.id}">${opt(r)}</option>`).join(''):
    '<option value="">— nenhuma superfície carregada em Camadas —</option>';
  const atual=(rasCur&&rs.includes(rasCur))?rasCur:(S.selRaster&&rs.includes(S.selRaster)?S.selRaster:null);
  if(tv&&[...st.options].some(o=>o.value===tv))st.value=tv;
  else if(atual)st.value=String(atual.id);
  const topId=st.value;
  const outras=rs.filter(r=>String(r.id)!==String(topId));
  sb.innerHTML='<option value="">— escolha o MDT já carregado em Camadas —</option>'+
    outras.map(r=>`<option value="${r.id}">${opt(r)}</option>`).join('')+
    '<option value="__angular__">∠ usar esta superfície por ângulo de elevação</option>';
  if(bv&&[...sb.options].some(o=>o.value===bv))sb.value=bv;
  else if(outras.length)sb.selectedIndex=1;
  else sb.value='__angular__';
  const ab=document.getElementById('tinExtrAngBox'); if(ab)ab.style.display=sb.value==='__angular__'?'':'none';
  const sa=document.getElementById('tinContArea');
  if(sa){
    const av=sa.value,areas=(S.layers||[]).filter(l=>l&&l.features&&l.features.length&&(l.gtype==='polygon'||l.gtype==='line'));
    const temTemp=!!tinContFiltroAreaTemp();
    sa.innerHTML='<option value="">— toda a área das superfícies —</option>'+
      (temTemp?'<option value="__temp__">▱ Polígono temporário desenhado</option>':'')+areas.map(l=>
      `<option value="${l.id}">${l.gtype==='polygon'?'▱ Polígono: ':'╱ Linha: '}${esc(l.name)}</option>`).join('');
    if(av==='__temp__'&&temTemp)sa.value=av;
    else if(av&&areas.some(l=>String(l.id)===String(av)))sa.value=av;
    const rb=document.getElementById('tinContRaioBox'),La=areas.find(l=>String(l.id)===String(sa.value));
    if(rb)rb.style.display=La&&La.gtype==='line'?'':'none';
  }
}
async function tinExtraiSolidosUI(){
  const info=document.getElementById('tinExtrInfo');
  const topoId=(document.getElementById('tinExtrTopo')||{}).value;
  const r=S.rasters.find(x=>String(x.id)===String(topoId))||rasCur;
  if(!r||!r.d||!r.d.z){ if(info)info.textContent='Escolha a superfície do levantamento.'; return; }
  const baseId=(document.getElementById('tinExtrBase')||{}).value;
  const angular=baseId==='__angular__';
  const rBase=S.rasters.find(x=>String(x.id)===String(baseId));
  if(!rBase&&!angular){ if(info)info.textContent='Escolha a superfície-base ou use a própria superfície por ângulo.'; return; }
  const hMin=Math.max(0.1,parseFloat(String(document.getElementById('tinExtrHmin').value).replace(',','.'))||1);
  const aMin=Math.max(0.5,parseFloat(String(document.getElementById('tinExtrAmin').value).replace(',','.'))||4);
  const cel=Math.max(0.2,parseFloat(String(document.getElementById('tinExtrCel').value).replace(',','.'))||0.5);
  const angulo=Math.max(1,Math.min(89.9,parseFloat(String((document.getElementById('tinExtrAng')||{}).value).replace(',','.'))||80));
  const modo=(document.getElementById('tinExtrModo')||{}).value||'todos';
  if(modo==='containers'&&angular){ if(info)info.textContent='A contagem de contêineres exige MDS (topo) e MDT (terreno) já carregados.'; return; }
  /* Padrão e High Cube são avaliados separadamente em cada nível. */
  const ALTURAS_CONT=[2.591,2.896],TOL_CONT=.10;
  const fA=[ALTURAS_CONT[0]*(1-TOL_CONT),ALTURAS_CONT[1]*(1+TOL_CONT)];
  const ocupacaoBruta=+((document.getElementById('tinContOcup')||{}).value||55)/100;
  const cfgCont={largura:2.438,largTol:TOL_CONT,alturas:ALTURAS_CONT,altTol:TOL_CONT,altMin:fA[0],altMax:fA[1],
    ocupacao:Math.max(.2,Math.min(1,ocupacaoBruta)),
    maxEmp:Math.max(1,Math.min(5,Math.round(+((document.getElementById('tinContMaxEmp')||{}).value||3))||3)),
    compTol:Math.max(.01,Math.min(TOL_CONT,+((document.getElementById('tinContCompTol')||{}).value||10)/100)),
    usaOrto:false};
  const areaId=(document.getElementById('tinContArea')||{}).value||'';
  const buscaTemp=areaId==='__temp__'?tinContFiltroAreaTemp():null;
  const camadaArea=buscaTemp?null:(S.layers.find(l=>String(l.id)===String(areaId))||null);
  const areaBusca=buscaTemp||tinContFiltroArea(camadaArea,+((document.getElementById('tinContRaio')||{}).value||12));
  if(modo==='containers'&&cfgCont.usaOrto)await tinAsseguraPixelsOrto();
  const detectarPelaOrto=modo==='containers'&&cfgCont.usaOrto&&!!tinContOrtoFonte();
  if(info)info.innerHTML=modo==='containers'
    ?('Cruzando altura MDS−MDT'+(detectarPelaOrto?', ortofoto':'')+' e forma…')
    :'Varrendo as superfícies…';
  showLoad(modo==='containers'?'Reconhecendo as pegadas completas dos contêineres…':'Extraindo sólidos…');
  try{
    /* A altura MDS−MDT desenha a pegada de qualquer contêiner, pintado ou não;
       a ortofoto, quando existe, reforça a forma e confirma cada módulo. */
    const R=modo==='containers'
      ?await tinContGradeCandidatos(r,rBase,areaBusca,cfgCont)
      :(angular ? await tinExtraiSolidosPorAngulo(r,angulo,aMin,cel) : await tinExtraiSolidos(r,rBase,hMin,aMin,cel,null));
    if(R.erro){ if(info)info.textContent=R.erro; return; }
    /* limpa a extração anterior desta mesma superfície */
    (S.solidos||[]).filter(s=>String(s.origem||'').startsWith('extração:'+r.id+':'))
      .slice().forEach(s=>{ try{ solRemoveDaCena(s); }catch(e){}
        S.solidos.splice(S.solidos.indexOf(s),1); });
    /* CONTÊINERES: não são sólidos nem volume. Cada pegada elevada é decomposta
       em módulos normalizados e o resultado é uma camada de PONTOS (um por
       contêiner) mais uma camada de POLÍGONOS com o retângulo reconhecido —
       é o retângulo que permite conferir a contagem no mapa, contra a
       ortofoto, sem abrir a tabela. */
    if(modo==='containers'){
      const brutos=[];let semTile=0,repHeight=0,repOrto=0;
      R.comps.forEach((comp,oi)=>{
        const tiles=tinContTilesComponente(comp,R.grade,{...cfgCont,amostraMDS:(x,y)=>sampleZbil(r.d,x,y),avaliaTile:c=>{
          const v=tinValidaContainerPegada(c,r,rBase,cfgCont);
          return v.ok?1+v.scoreMDS:Math.max(0,(v.acordoAlt||0)-.5);
        }});
        if(!tiles.length){semTile++;return;}
        tiles.forEach(c=>{
          if(!areaBusca.aceita(c.cx,c.cy))return;
          const v=tinValidaContainerPegada(c,r,rBase,cfgCont);
          if(!v.ok){repHeight++;return;}
          const orto=tinEvidenciaOrtoPegada(c,cfgCont.usaOrto);
          /* Com ortofoto, exija cor ou bordas compatíveis. A evidência de
             bordas mantém contêineres brancos e desbotados elegíveis. */
          if(orto.disponivel&&!orto.ok){repOrto++;return;}
          Object.assign(c,v,{orto,objeto:oi,
            scoreFinal:.55*v.scoreMDS+.25*(c.scoreForma||0)+.20*orto.score});
          brutos.push(c);
        });
      });
      /* Um candidato degenerado não pode virar geometria no projeto: JSON
         converteria NaN/Infinity em null e o defeito reapareceria ao abrir. */
      const candidatos=tinConsolidaContainers(brutos,r,rBase,cfgCont).filter(c=>
          [c.cx,c.cy,c.ux,c.uy,c.vx,c.vy,c.comprimento,c.largura,c.zMDS,c.zMDT,c.alturaCentro]
            .every(Number.isFinite)),
        semOrto=candidatos.filter(c=>!c.orto||!c.orto.disponivel).length,
        metodo='geometria e direção pelo MDS + altura MDS−MDT';
      /* Uma reabertura do projeto não restaura S.containerCount, mas as camadas
         antigas continuam na árvore. Substituímos todos os resultados
         anteriores para que rótulos velhos não pareçam pontos duplicados. */
      (S.layers||[]).filter(l=>l&&(/^Cont(agem|êineres) (de contêineres|reconhecidos)\s*—/i.test(l.name||'')||l._containerCount))
        .slice().forEach(l=>deleteVectorLayer(l));
      const conta={'20′':0,'40′':0},niveis={};let unidades=0;
      candidatos.forEach(c=>{conta[c.tipo]=(conta[c.tipo]||0)+c.empilhados;unidades+=c.empilhados;
        niveis[c.empilhados]=(niveis[c.empilhados]||0)+1;});
      const carimbo=new Date().toLocaleString('pt-BR'),
        marca={mds:r.id,mdt:rBase.id,area:camadaArea?camadaArea.id:null,
          raio:camadaArea&&camadaArea.gtype==='line'?+((document.getElementById('tinContRaio')||{}).value||12):null,
          metodo};
      let camadaPontos=null,camadaPegadas=null;
      if(candidatos.length){
        const props=(c,i)=>({ID:i+1,TIPO:c.tipo,REVISAR:c.revisar?'Dimensão medida — conferir':'',EMPILHADOS:c.empilhados,
          COMP_M:+c.comprimento.toFixed(2),LARG_M:+c.largura.toFixed(2),
          AZIMUTE:+(((90-c.angulo)%180+180)%180).toFixed(1),
          MDS_M:+c.zMDS.toFixed(3),MDT_M:+c.zMDT.toFixed(3),ALT_M:+c.alturaCentro.toFixed(3),
          CONFIANCA:Math.round(100*Math.max(.1,Math.min(1,c.scoreFinal||0))),
          METODO:'geometria MDS + altura MDS−MDT'});
        const campos=[{name:'ID',type:'N',length:5,decimal:0},{name:'TIPO',type:'C',length:12},{name:'REVISAR',type:'C',length:40},
          {name:'EMPILHADOS',type:'N',length:3,decimal:0},{name:'COMP_M',type:'N',length:8,decimal:2},
          {name:'LARG_M',type:'N',length:8,decimal:2},{name:'AZIMUTE',type:'N',length:6,decimal:1},
          {name:'MDS_M',type:'N',length:10,decimal:3},{name:'MDT_M',type:'N',length:10,decimal:3},
          {name:'ALT_M',type:'N',length:8,decimal:3},{name:'CONFIANCA',type:'N',length:4,decimal:0},
          {name:'METODO',type:'C',length:32}];
        camadaPontos=addLayer({sourceLayer:r,name:'Contagem de contêineres — '+carimbo,gtype:'point',crs:S.workCRS,
          features:candidatos.map((c,i)=>({geom:[[c.cx,c.cy]],zg:[c.zMDS],props:props(c,i)})),
          fields:campos.map(f=>({...f})),color:'#ef8d32',labelField:'EMPILHADOS',lbl:{unique:false,onMap:true}});
        camadaPontos._containerCount={...marca,papel:'pontos',resumo:{posicoes:candidatos.length,total:unidades,
          c20:conta['20′'],c40:conta['40′'],porTipo:{...conta},niveis:{...niveis}}};
        camadaPegadas=addLayer({sourceLayer:r,name:'Contêineres reconhecidos — '+carimbo,gtype:'polygon',crs:S.workCRS,
          features:candidatos.map((c,i)=>{
            const anel=[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]].map(q=>[
              c.cx+q[0]*c.comprimento*.5*c.ux+q[1]*c.largura*.5*c.vx,
              c.cy+q[0]*c.comprimento*.5*c.uy+q[1]*c.largura*.5*c.vy]);
            return {geom:[anel],multi:true,props:props(c,i)};}),
          fields:campos.map(f=>({...f})),color:'#37c0aa',labelField:'TIPO',lbl:{unique:false,onMap:true}});
        camadaPegadas._containerCount={...marca,papel:'pegadas',resumo:{posicoes:candidatos.length,total:unidades,
          c20:conta['20′'],c40:conta['40′'],porTipo:{...conta},niveis:{...niveis}}};
      }
      refreshUI();
      S.containerCount={fonte:r.id,base:rBase.id,area:camadaArea?camadaArea.id:null,
        at:new Date().toISOString(),posicoes:candidatos.length,total:unidades,
        c20:conta['20′'],c40:conta['40′'],porTipo:{...conta},niveis,cfg:cfgCont,celula:R.grade.cel,
        pegadasTestadas:R.comps.length,semTile,repHeight,repOrto,grandes:R.grandes||0,
        pontos:camadaPontos&&camadaPontos.id,pegadas:camadaPegadas&&camadaPegadas.id,metodo};
      const emp=Object.keys(niveis).map(Number).sort((a,b)=>a-b)
        .map(n=>`${niveis[n]}× ${n} ${n===1?'nível':'níveis'}`).join(' · ');
      if(info)info.innerHTML=`<b>${unidades}</b> contêiner${unidades===1?'':'es'} em <b>${candidatos.length}</b> posição(ões) · `+
        `<b>${conta['20′']}</b> de 20′ · <b>${conta['40′']}</b> de 40′${conta.Medido?' · '+conta.Medido+' com dimensão medida (conferir)':''}${emp?' · '+esc(emp):''}.<br>`+
        `${camadaPontos?'Camadas <b>'+esc(camadaPontos.name)+'</b> (pontos) e <b>'+esc(camadaPegadas.name)+'</b> (retângulos).':'<b>Nenhuma pegada aprovada.</b>'}<br>`+
        `Método: <b>${esc(metodo)}</b> · célula de análise <b>${R.grade.cel.toFixed(2)} m</b> · `+
        `área pesquisada: <b>${esc(areaBusca.nome)}</b>.<br>`+
        `Descartes: ${R.comps.length} pegada(s) analisada(s), ${semTile} sem módulo compatível, `+
        `${repHeight} fora da altura/planicidade`+
        `${R.grandes?', '+R.grandes+' mancha(s) grande(s) demais (talude/telhado contínuo)':''}`+
        `. Referência geométrica: MDS.`;
      toast(`✅ ${unidades} contêiner${unidades===1?'':'es'} em ${candidatos.length} posição(ões) — ${conta['20′']} × 20′ · ${conta['40′']} × 40′`);
      return;
    }
    const na3D=(typeof V3!=='undefined'&&V3.scene&&V3._ctx);
    const objetos=R.objetos;
    let volTot=0;
    objetos.forEach((o,i)=>{
      volTot+=o.vol;
      const cor=EXTR_CORES[i%EXTR_CORES.length];
      const grp=na3D?tinObjetoMesh(o,R.grade,R.ZT,R.ZB,cor):null;
      if(grp&&V3.scene)V3.scene.add(grp);
      const sol=solRegistra(grp,{ modo:'objeto', origem:'extração:'+r.id+':'+(i+1),
        nome:'Objeto '+(i+1)+' — '+(o.vol>=1000?(o.vol/1000).toFixed(1)+' mil m³':o.vol.toFixed(1)+' m³'),
        volume:o.vol, nBlocos:o.cels.length, res:cel,
        dom:{x0:o.bb[0],y0:o.bb[1],x1:o.bb[2],y1:o.bb[3]},
        zmn:o.zBmin, zmx:o.zTmax, zmin:o.zBmin, zmax:o.zTmax });
      if(sol){ sol.cor=cor; sol.fontes='TIN (extração)'; sol.altura=o.hMax; sol.areaXY=o.area;
        /* topo e piso de cada célula: volume a partir de uma cota exato (a casca
           3D destes objetos não tem face inferior) */
        sol.colunas={area:cel*cel,zt:Float32Array.from(o.cels,k=>R.ZT[k]),zb:Float32Array.from(o.cels,k=>R.ZB[k])}; }
    });
    refreshUI();
    r._v3=r._v3||{papel:'terreno',cor:'#8d5524',limId:''};
    r._v3.fechaVazios=!!((document.getElementById('tinExtrFechaMdt')||{}).checked);
    const n=objetos.length;
    if(info)info.innerHTML=`<b>${n}</b> sólido${n===1?'':'s'} extraído${n===1?'':'s'} · `+
      (angular?`rupturas ≥ <b>${angulo.toLocaleString('pt-BR')}°</b> na própria superfície · volume estimado das faixas íngremes <b>${volTot.toLocaleString('pt-BR',{maximumFractionDigits:1})} m³</b>.`:
      `volume total <b>${volTot.toLocaleString('pt-BR',{maximumFractionDigits:1})} m³</b>.`)+
      ' Cada um está na árvore de camadas com volume, área e altura.';
    toast(n+' sólidos extraídos'+(angular?' por ângulo':''));
  } finally { hideLoad(); }
}
/* Renderização do sólido: cor e opacidade aplicadas no material vivo,
   valendo igual para sólido nascido de raster ou de TIN. */
function solAplicaRender(sol){
  if(!sol||!sol._grp)return;
  const cor=sol.cor, opa=(sol.opa!=null?sol.opa:1);
  sol._grp.traverse(o=>{
    if(!o.material)return;
    (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{
      if(cor&&m.color){ try{ m.color.set(cor); }catch(e){} }
      m.transparent=opa<0.999; m.opacity=opa; m.needsUpdate=true;
    });
  });
  try{ if(V3.ren&&V3.scene&&V3.cam)V3.ren.render(V3.scene,V3.cam); }catch(e){}
}
function solRemoveDaCena(sol){
  if(!sol||!sol._grp)return;
  const grupo=sol._grp;
  try{
    if(V3.scene) V3.scene.remove(grupo);
    grupo.traverse(o=>{ if(o.geometry)o.geometry.dispose();
      if(o.material)o.material.dispose(); });
  }catch(e){}
  if(V3.cubGroup===grupo) V3.cubGroup=null;
  sol._grp=null;
}
function solSetVis(sol, vis){
  if(!sol)return;
  sol.visible=!!vis;
  const grupos=[];
  const inclui=g=>{ if(g&&!grupos.includes(g))grupos.push(g); };
  const cubSemId=V3.cubGroup&&!(V3.cubGroup.userData&&V3.cubGroup.userData.ccmSolidId);
  /* Algumas ferramentas substituem V3.cubGroup depois da cubagem (por
     exemplo, a sequência por cota). Nesse caso a árvore ainda apontava para
     a malha descartada. Com um único sólido, adota-se o grupo vivo antes de
     aplicar a visibilidade, evitando tanto o fantasma quanto uma duplicação. */
  if(cubSemId&&(S.solidos||[]).length===1){
    sol._grp=V3.cubGroup;
    solMarcaGrupo(sol,sol._grp);
  }
  inclui(sol._grp);
  if(solGrupoEhDoItem(V3.cubGroup,sol)||
     (cubSemId&&(S.solidos||[]).length===1)) inclui(V3.cubGroup);
  /* Corrige também cenas abertas antes da identificação por userData. Há um
     único V3.cubGroup vivo; com apenas um sólido registrado ele só pode ser
     o item cujo olho foi acionado. */
  if(!grupos.length&&(S.solidos||[]).length===1) inclui(V3.cubGroup);
  try{
    if(V3.scene&&typeof V3.scene.traverse==='function') V3.scene.traverse(o=>{
      if(solGrupoEhDoItem(o,sol))inclui(o);
    });
  }catch(e){}
  grupos.forEach(g=>{
    solMarcaGrupo(sol,g);
    g.visible=!!vis;
    /* Um sólido oculto também permanece na cena. Assim o mesmo olho pode
       ligá-lo novamente depois que build3D reconstrói a cena. */
    if(vis&&V3.scene&&g.parent!==V3.scene){ try{ V3.scene.add(g); }catch(e){} }
  });
  try{ if(V3.ren&&V3.scene&&V3.cam) V3.ren.render(V3.scene,V3.cam); }catch(e){}
}
function solApaga(sol){
  solRemoveDaCena(sol);
  S.solidos=(S.solidos||[]).filter(s=>s!==sol);
  try{ refreshUI(); }catch(e){}
  try{ if(V3.ren&&V3.scene&&V3.cam) V3.ren.render(V3.scene,V3.cam); }catch(e){}
}
function solFmt(v,casas){
  if(v==null||!isFinite(v))return '—';
  const c=casas==null?0:casas;
  /* casas fixas: cota "480,5" e "562,25" lado a lado confundem a leitura */
  return (+v).toLocaleString('pt-BR',{minimumFractionDigits:c,maximumFractionDigits:c});
}
/* Propriedades do sólido — mesmo gesto das outras camadas: clicou, viu. */
function solProps(sol){
  const live=(sol.origem==='cubagem'&&(S._cub||S._relDom))||(null),d=sol.dom||(live&&live.dom),
    vol=sol.volume!=null?sol.volume:(live&&live.vol!=null?live.vol:null),
    dens=sol.densidade!=null?sol.densidade:(live&&live.dens!=null?live.dens:null),
    zmin=sol.zmin!=null?sol.zmin:(live&&live.zmn!=null?live.zmn:null),zmax=sol.zmax!=null?sol.zmax:(live&&live.zmx!=null?live.zmx:null);
  const M=sol.modeloBlocos;
  const classeNome=M&&M.classe==='ore'?'Somente minério':M&&M.classe==='waste'?'Somente estéril':M&&M.classe==='all'?'Minério + estéril':(M&&M.classe);
  const linhas=M?[
    ['Tipo','Modelo de blocos 3D'],
    ['Arquivo',M.arquivo||'Modelo gerado no CCMGIS'],
    ['Blocos no resultado',M.blocosTotais!=null?solFmt(M.blocosTotais):null],
    ['Blocos exibidos no 3D',M.blocosExibidos!=null?solFmt(M.blocosExibidos):null],
    ['Bloco pai',M.blocoPai?M.blocoPai.map(v=>solFmt(v,2)).join(' × ')+' m':null],
    ['Classificação',classeNome||null],
    ['Atributo minério/estéril',M.atributoClasse||null],
    ['Atributo de litologia',M.atributoLitologia||null],
    ['Litologias',M.litologias!=null?solFmt(M.litologias):null],
    ['Atributo de bancada',M.atributoBancada||null],
    ['Bancadas',M.bancadas!=null?solFmt(M.bancadas):null],
    ['Filtro espacial',M.filtroEspacial?`${M.regrasEspaciais} regra(s) por superfície/limite`:'Não aplicado'],
    ['Atributos mantidos',M.atributos&&M.atributos.length?M.atributos.join(', '):null],
    ['Filtros por atributo',M.filtrosAtributos&&M.filtrosAtributos.length?M.filtrosAtributos.map(f=>f.name+': '+f.values.join(', ')).join(' · '):null],
    [M.importado?'Volume filtrado':'Cubagem (volume)',vol!=null?solFmt(vol)+' m³':null],
    ['Massa',(vol!=null&&dens)?solFmt(vol*dens)+' t':null],
    ['Densidade',dens?solFmt(dens,2)+' t/m³':null],
    ['Cota mínima',zmin!=null?solFmt(zmin,2)+' m':null],
    ['Cota máxima',zmax!=null?solFmt(zmax,2)+' m':null],
    ['Altura',(zmin!=null&&zmax!=null)?solFmt(zmax-zmin,2)+' m':null],
    ['Extensão X',d?solFmt(d.x1-d.x0,1)+' m':null],
    ['Extensão Y',d?solFmt(d.y1-d.y0,1)+' m':null],
    ['Resolução',sol.res!=null?solFmt(sol.res,2)+' m':null],
    ['Criado em',sol.criado?new Date(sol.criado).toLocaleString('pt-BR'):null]
  ].filter(([,v])=>v!=null&&v!==''):[
    ['Tipo','Sólido 3D'],
    ['Modo', sol.modo==='liso'?'Liso (isosuperfície)':(sol.modo==='blocos'?'Blocos':sol.modo)],
    ['Origem', sol.origem],
    ['Superfícies', sol.fontes?('entre '+sol.fontes):'—'],
    ['Blocos', sol.nBlocos!=null?solFmt(sol.nBlocos):'—'],
    ['Volume', sol.volume!=null?solFmt(sol.volume)+' m³':'—'],
    ['Massa', (sol.volume!=null&&sol.densidade)?solFmt(sol.volume*sol.densidade)+' t':'—'],
    ['Densidade', sol.densidade?solFmt(sol.densidade,2)+' t/m³':'—'],
    ['Cota mínima', sol.zmin!=null?solFmt(sol.zmin,2)+' m':'—'],
    ['Cota máxima', sol.zmax!=null?solFmt(sol.zmax,2)+' m':'—'],
    ['Altura', (sol.zmin!=null&&sol.zmax!=null)?solFmt(sol.zmax-sol.zmin,2)+' m':'—'],
    ['Extensão X', d?solFmt(d.x1-d.x0,1)+' m':'—'],
    ['Extensão Y', d?solFmt(d.y1-d.y0,1)+' m':'—'],
    ['Resolução', sol.res!=null?solFmt(sol.res,2)+' m':'—'],
    ['Criado em', sol.criado?new Date(sol.criado).toLocaleString('pt-BR'):'—']
  ];
  const html='<div class="lp-info"><b>'+esc(sol.nome)+'</b></div>'+
    '<table style="width:100%;border-collapse:collapse;font-size:12.5px">'+
    linhas.map(([k,v])=>
      `<tr><td style="padding:3px 8px 3px 0;color:var(--ink-dim);white-space:nowrap">${esc(k)}</td>`+
      `<td style="padding:3px 0;text-align:right"><b>${esc(String(v))}</b></td></tr>`).join('')+
    '</table>';
  const bg=document.getElementById('solModal'),
    body=document.getElementById('solModalBody'),
    nm=document.getElementById('solModalName'),
    tg=document.getElementById('solModalTag');
  if(!bg||!body){ alert(linhas.map(([k,v])=>k+': '+v).join('\n')); return; }
  if(nm)nm.textContent=sol.nome;
  if(tg)tg.textContent=M?'modelo de blocos':(sol.modo==='liso'?'liso':'blocos');
  /* volume dividido por uma cota: acima/abaixo, calculado na geometria do sólido */
  const cotaHtml='<label class="field" style="margin-top:10px" for="solCota">Volume a partir de uma cota</label>'+
    '<div style="display:flex;gap:8px;align-items:center">'+
    `<input type="text" id="solCota" inputmode="decimal" placeholder="Cota em m — ex.: ${zmin!=null&&zmax!=null?solFmt((zmin+zmax)/2,2):'985,00'}" value="${sol.cotaCorte!=null?String(sol.cotaCorte).replace('.',','):''}" style="flex:1">`+
    '<button class="tbtn" id="solCotaCalc" style="justify-content:center">Calcular</button></div>'+
    '<div id="solCotaOut" class="hint" style="margin-top:6px"></div>';
  body.innerHTML=html+cotaHtml+
    '<label class="field" style="margin-top:10px">Renderização</label>'+
    '<div class="row2" style="grid-template-columns:46px 1fr;align-items:center;gap:10px">'+
    `<input type="color" id="solCor" value="${sol.cor||'#3b82c4'}" style="height:30px;padding:1px">`+
    `<div><label class="field" style="margin:0 0 2px">Opacidade <b id="solOpaV">${Math.round((sol.opa!=null?sol.opa:1)*100)}%</b></label>`+
    `<input type="range" id="solOpa" min="10" max="100" step="5" value="${Math.round((sol.opa!=null?sol.opa:1)*100)}" style="width:100%"></div>`+
    '</div>'+
    '<div class="row2" style="margin-top:10px">'+
    '<button class="tbtn" id="solRenomear" style="justify-content:center">✎ Renomear</button>'+
    '<button class="tbtn" id="solRemover" style="justify-content:center">✕ Remover sólido</button>'+
    '</div>';
  bg.classList.add('on');
  const fecha=()=>bg.classList.remove('on');
  const bc=document.getElementById('solModalClose'); if(bc)bc.onclick=fecha;
  bg.onclick=e=>{ if(e.target===bg)fecha(); };
  {
    const sc=document.getElementById('solCor'), so=document.getElementById('solOpa'),
      sv=document.getElementById('solOpaV');
    const aplica=()=>{
      if(sc)sol.cor=sc.value;
      if(so){ sol.opa=(+so.value)/100; if(sv)sv.textContent=so.value+'%'; }
      solAplicaRender(sol);
    };
    if(sc)sc.oninput=aplica;
    if(so)so.oninput=aplica;
  }
  {
    const ci=document.getElementById('solCota'),cb=document.getElementById('solCotaCalc'),co=document.getElementById('solCotaOut');
    const calc=()=>{
      if(!co)return;
      const c=parseFloat(String(ci&&ci.value||'').trim().replace(/\s/g,'').replace(',','.'));
      if(!Number.isFinite(c)){ co.innerHTML='<span style="color:#e0a">Informe a cota em metros.</span>'; return; }
      const r=solVolumePorCota(sol,c);
      if(!r){ co.innerHTML='<span style="color:#e0a">A geometria deste sólido não está disponível para o cálculo. Gere o sólido novamente.</span>'; return; }
      sol.cotaCorte=c;
      const pc=v=>r.total>0?' ('+solFmt(100*v/r.total,1)+'%)':'';
      const ds=dens||null,m=v=>ds?' · '+solFmt(v*ds)+' t':'';
      co.innerHTML=`Acima de <b>${solFmt(c,2)} m</b>: <b>${solFmt(r.acima)} m³</b>${pc(r.acima)}${m(r.acima)}<br>`+
        `Abaixo de <b>${solFmt(c,2)} m</b>: <b>${solFmt(r.abaixo)} m³</b>${pc(r.abaixo)}${m(r.abaixo)}<br>`+
        `Total: <b>${solFmt(r.total)} m³</b> <span style="color:var(--ink-dim)">— ${r.metodo==='colunas'?'pelas colunas do sólido':r.metodo==='blocos'?'por bloco do modelo':'pela casca 3D do sólido'}</span>`;
      try{ cmdLog('Volume por cota '+solFmt(c,2)+' m em "'+sol.nome+'": acima '+solFmt(r.acima)+' m³ · abaixo '+solFmt(r.abaixo)+' m³','info'); }catch(e){}
    };
    if(cb)cb.onclick=calc;
    if(ci)ci.onkeydown=e=>{ if(e.key==='Enter'){ e.preventDefault(); calc(); } };
    if(ci&&sol.cotaCorte!=null)calc();
  }
  const br=document.getElementById('solRenomear');
  if(br)br.onclick=()=>{ const n=prompt('Renomear sólido:',sol.nome);
    if(n){ sol.nome=n; refreshUI(); if(nm)nm.textContent=n; } };
  const bx=document.getElementById('solRemover');
  if(bx)bx.onclick=()=>{ if(confirm(`Remover o sólido "${sol.nome}"?`)){ solApaga(sol); fecha(); } };
}
/* Desenha as linhas de sólido na árvore de camadas. */
function solRenderArvore(list){
  const sols=S.solidos||[];
  if(!sols.length||!list)return;
  sols.forEach(sol=>{
    const q=(S._layerQuery||'').trim().toLowerCase();
    if(q && !(sol.nome||'').toLowerCase().includes(q))return;
    const vis=sol.visible!==false;
    const el=document.createElement('div');
    el.className='layer'+(S._solSel===sol.id?' active':'');
    el.innerHTML=`<span class="drag" title="Sólido">⠿</span>
      <span class="eye ${vis?'on':''}" title="Visibilidade">${vis?'◉':'○'}</span>
      <span class="swatch" style="background:#1d2b38;display:flex;align-items:center;justify-content:center;font-size:11px">🧊</span>
      <span class="nm">${esc(sol.nome)}</span>
      <span class="cnt">${sol.volume!=null?solFmt(sol.volume)+' m³':'sólido'}</span>
      <span class="gdel ldel" title="Remover sólido">✕</span>`;
    el.querySelector('.eye').onclick=e=>{ e.stopPropagation();
      solSetVis(sol,!(sol.visible!==false)); refreshUI(); };
    el.querySelector('.ldel').onclick=e=>{ e.stopPropagation();
      if(confirm(`Remover o sólido "${sol.nome}"?\nEsta ação não pode ser desfeita.`)) solApaga(sol); };
    el.querySelector('.nm').ondblclick=e=>{ e.stopPropagation();
      const n=prompt('Renomear sólido:',sol.nome); if(n){ sol.nome=n; refreshUI(); } };
    el.onclick=()=>{ S._solSel=sol.id; refreshUI(); solProps(sol); };
    list.appendChild(el);
  });
}

/* ===========================================================================
   PROPOSTA A4 (aba Layout) — padrão CCM Engenharia
   ---------------------------------------------------------------------------
   Terceiro modo da aba Layout, ao lado de Figura e Prancha A4/A3. Monta uma
   proposta de 4 páginas A4 retrato (210×297 mm) pronta para mandar ao cliente,
   no mesmo desenho vetorial do resto do Layout (SVG em mm), de modo que o PDF
   sai com o texto nítido e o mapa na mesma qualidade da figura.

   Enxugamento em relação à planilha original: o formulário de marcar "x" em
   dezenas de caixinhas virou LISTA — só entra no papel o que foi de fato
   selecionado. Quatro páginas com papel definido:
     1. Capa/resumo      — cliente, objeto, escopo, prazo e VALOR em destaque
     2. Metodologia      — os passos + o mapa de localização (modo Figura)
     3. Escopo técnico   — equipe, equipamentos, softwares, entregáveis, prazos
     4. Comercial        — itens e valores, condições de pagamento, assinaturas
   =========================================================================== */
const PROP_A4 = {W:210, H:297, ML:18, MR:18, MT:16, MB:16};
const PROP_COR = {tinta:'#15202b', fraco:'#5c6b7a', linha:'#c8d2dc',
  destaque:'#b8791a', faixa:'#15202b', zebra:'#f2f5f8'};

/* estado da proposta — um por projeto, com os padrões da CCM já preenchidos */
function propDefault(){
  return {
    numero:'CCM__/26', cliente:'', unidade:'', objeto:'',
    historico:'A CCM Engenharia LTDA é uma empresa de consultoria voltada ao mercado '+
      'de engenharia e agrimensura, e foi convidada a apresentar proposta para os '+
      'serviços descritos neste documento.',
    escopo:'',
    metodologia:'Implantação e rastreio do vértice base com tecnologia GNSS de alta precisão.\n'+
      'Levantamento planialtimétrico dos pontos de controle com GNSS RTK.\n'+
      'Levantamento aerofotogramétrico com drone para geração do modelo tridimensional.\n'+
      'Processamento, cálculo de volumes e emissão do relatório técnico.',
    equipe:'1 Engenheiro de Minas\n1 Engenheiro Agrimensor\n1 Técnico em Edificações',
    equipamentos:'GNSS RTK\nVANT (drone)\nCâmera fotográfica\nNotebook\nVeículo próprio',
    softwares:'Topograph\nBricsCAD\nQuantum GIS\nSketchUp\nALAGIS',
    entregaveis:'Plantas em meio digital\nPlantas impressas\nRelatório técnico em meio digital\nRelatório técnico impresso',
    prazo:'Data a definir com o cliente.',
    obsCronograma:'Não foi estipulado cronograma fechado: as datas de mobilização e de '+
      'entrega serão acordadas com o contratante após o aceite desta proposta.',
    itens:'Levantamento topográfico | un | 1 | 0',
    pagamento:'No aceite da proposta | 50\nEm 30 dias | 50',
    obsPagamento:'Pagamento via nota fiscal emitida com boleto bancário.',
    relevantes:'Acompanhamento de um colaborador do contratante.\nEnvio dos primitivos das áreas a levantar.',
    validade:'15 dias',
    avisoLegal:'Este documento pode conter informações confidenciais e/ou privilegiadas. '+
      'Se você não for o destinatário ou a pessoa autorizada a recebê-lo, não deve usar, '+
      'copiar ou divulgar as informações nele contidas. Os preços e condições aqui '+
      'apresentados são válidos pelo prazo de validade indicado e podem ser revistos após '+
      'esse período.',
    diretor:'Eng. Gregory Damazio', diretorT:'Eng. Agrimensor',
    gerente:'Eng. Rodrigo P. Cordova', gerenteT:'Eng. de Minas',
    empresa:'CCM Engenharia', cnpj:'11.537.327/0001-13',
    endereco:'Av. Santos Dumont, 1987 — Sala 6, Bairro Michel\nCriciúma/SC — CEP 88803-002',
    banco:'Banco Santander (033)', agencia:'3599', conta:'13081768-8',
    mapa:null   // dataURL do mapa capturado do modo Figura
  };
}
function propGet(){ if(!S.prop) S.prop=propDefault(); return S.prop; }

/* ---- utilidades de texto no SVG (mm) ------------------------------------ */
function propEsc(s){ return String(s==null?'':s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
/* quebra de linha por largura aproximada: sem medir no DOM, usa fator médio
   por caractere (0,52×tamanho) — suficiente e determinístico para o papel */
function propQuebra(txt, larguraMM, fs){
  const porChar = fs*0.52, max = Math.max(4, Math.floor(larguraMM/porChar));
  const linhas=[];
  String(txt==null?'':txt).split('\n').forEach(par=>{
    if(!par.trim()){ linhas.push(''); return; }
    let linha='';
    par.split(/\s+/).forEach(p=>{
      if(!linha){ linha=p; return; }
      if((linha+' '+p).length<=max) linha+=' '+p;
      else { linhas.push(linha); linha=p; }
    });
    if(linha) linhas.push(linha);
  });
  return linhas;
}
function propTexto(x,y,txt,o){
  o=o||{};
  const fs=o.fs||3.1, lh=o.lh||fs*1.35, cor=o.cor||PROP_COR.tinta,
    peso=o.peso||400, anc=o.anchor||'start';
  const linhas = o.w ? propQuebra(txt,o.w,fs) : String(txt==null?'':txt).split('\n');
  let s='', yy=y;
  linhas.forEach(l=>{
    s+=`<text x="${x.toFixed(2)}" y="${yy.toFixed(2)}" font-size="${fs}" `+
       `font-family="Signika,sans-serif" font-weight="${peso}" `+
       `fill="${cor}" text-anchor="${anc}">${propEsc(l)}</text>`;
    yy+=lh;
  });
  return {svg:s, fim:yy-lh+lh*0.25, n:linhas.length};
}
/* altura que um bloco de texto vai ocupar, sem desenhar (para paginar) */
function propAltura(txt,w,fs,lh){ return propQuebra(txt,w,fs).length*(lh||fs*1.35); }

function propLista(txt){
  return String(txt==null?'':txt).split('\n').map(l=>l.trim()).filter(Boolean);
}
/* "descrição | un | qtd | valor" por linha */
function propItens(){
  return propLista(propGet().itens).map(l=>{
    const p=l.split('|').map(x=>x.trim());
    const q=parseFloat((p[2]||'1').replace(',','.'))||0,
      v=parseFloat((p[3]||'0').replace(/\./g,'').replace(',','.'))||0;
    return {desc:p[0]||'', un:p[1]||'un', qtd:q, unit:v, total:q*v};
  });
}
function propTotal(){ return propItens().reduce((a,i)=>a+i.total,0); }
function propBRL(v){
  return 'R$ '+(+v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function propHoje(){
  return new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
}

/* ---- moldura comum de todas as páginas ---------------------------------- */
function propMoldura(nPag, totPag, titulo){
  const P=PROP_A4, D=propGet();
  let s='';
  /* faixa superior */
  s+=`<rect x="0" y="0" width="${P.W}" height="11" fill="${PROP_COR.faixa}"/>`;
  s+=propTexto(P.ML, 7.2, D.empresa.toUpperCase(), {fs:3.6,peso:700,cor:'#fff'}).svg;
  s+=propTexto(P.W-P.MR, 7.2, titulo, {fs:3.0,cor:'#c9d6e2',anchor:'end'}).svg;
  /* rodapé */
  s+=`<line x1="${P.ML}" y1="${P.H-11}" x2="${P.W-P.MR}" y2="${P.H-11}" `+
     `stroke="${PROP_COR.linha}" stroke-width="0.25"/>`;
  s+=propTexto(P.ML, P.H-7, `Proposta ${D.numero}`+(D.cliente?' · '+D.cliente:''),
      {fs:2.5,cor:PROP_COR.fraco}).svg;
  s+=propTexto(P.W-P.MR, P.H-7, `${nPag}/${totPag}`,
      {fs:2.5,cor:PROP_COR.fraco,anchor:'end'}).svg;
  return s;
}
function propSecao(y, num, titulo){
  const P=PROP_A4;
  let s=`<rect x="${P.ML}" y="${(y-4).toFixed(2)}" width="${(P.W-P.ML-P.MR).toFixed(2)}" `+
        `height="5.6" fill="${PROP_COR.zebra}"/>`;
  s+=`<rect x="${P.ML}" y="${(y-4).toFixed(2)}" width="1.1" height="5.6" fill="${PROP_COR.destaque}"/>`;
  s+=propTexto(P.ML+3.2, y, (num?num+'  ':'')+titulo, {fs:3.2,peso:700}).svg;
  return {svg:s, fim:y+5.2};
}

/* ---- PÁGINA 1: capa / resumo -------------------------------------------- */
function propPagina1(tot){
  const P=PROP_A4, D=propGet();
  let s=propMoldura(1,tot,'Proposta Técnica e Comercial');
  let y=P.MT+16;
  s+=propTexto(P.ML, y, 'PROPOSTA', {fs:11,peso:700}).svg;
  s+=propTexto(P.ML, y+8, 'TÉCNICA E COMERCIAL', {fs:6.4,peso:300,cor:PROP_COR.fraco}).svg;
  y+=18;
  s+=`<line x1="${P.ML}" y1="${y}" x2="${P.ML+38}" y2="${y}" `+
     `stroke="${PROP_COR.destaque}" stroke-width="1"/>`;
  y+=12;

  const campo=(rot,val,yy,wv)=>{
    let t=propTexto(P.ML, yy, rot.toUpperCase(), {fs:2.5,peso:700,cor:PROP_COR.fraco});
    const v=propTexto(P.ML, yy+4.6, val||'—', {fs:3.6,w:wv||(P.W-P.ML-P.MR)});
    return {svg:t.svg+v.svg, fim:v.fim+3.4};
  };
  let c;
  c=campo('Cliente', D.cliente, y); s+=c.svg; y=c.fim;
  c=campo('Unidade / local', D.unidade, y); s+=c.svg; y=c.fim;
  c=campo('Objeto', D.objeto, y); s+=c.svg; y=c.fim+1;
  c=campo('Proposta nº', D.numero, y); s+=c.svg; y=c.fim;
  c=campo('Data', propHoje(), y); s+=c.svg; y=c.fim;
  c=campo('Validade da proposta', D.validade, y); s+=c.svg; y=c.fim+2;

  /* escopo resumido */
  if((D.escopo||'').trim()){
    const sc=propSecao(y+2,'','Escopo do trabalho'); s+=sc.svg; y=sc.fim+1.5;
    const t=propTexto(P.ML, y+1, D.escopo, {fs:3.0,w:P.W-P.ML-P.MR,cor:PROP_COR.tinta});
    s+=t.svg; y=t.fim+4;
  }
  /* histórico */
  if((D.historico||'').trim()){
    const sc=propSecao(y+2,'','Apresentação'); s+=sc.svg; y=sc.fim+1.5;
    const t=propTexto(P.ML, y+1, D.historico, {fs:3.0,w:P.W-P.ML-P.MR,cor:PROP_COR.fraco});
    s+=t.svg; y=t.fim+4;
  }

  /* caixa do valor — âncora visual da página */
  const total=propTotal();
  const bx=P.ML, bw=P.W-P.ML-P.MR, bh=20, by=P.H-P.MB-bh-6;
  s+=`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="${PROP_COR.faixa}" rx="1.5"/>`;
  s+=propTexto(bx+5, by+7.5, 'VALOR TOTAL DA PROPOSTA', {fs:2.7,peso:700,cor:'#9fb3c6'}).svg;
  s+=propTexto(bx+5, by+15.5, total>0?propBRL(total):'a definir',
      {fs:7.2,peso:700,cor:'#fff'}).svg;
  s+=propTexto(bx+bw-5, by+15.5, (propItens().length||0)+' item(ns)',
      {fs:2.8,cor:'#9fb3c6',anchor:'end'}).svg;
  return s;
}

/* ---- PÁGINA 2: metodologia + mapa --------------------------------------- */
function propPagina2(tot){
  const P=PROP_A4, D=propGet();
  let s=propMoldura(2,tot,'Metodologia e localização');
  let y=P.MT+8;
  let sc=propSecao(y,'1','Metodologia'); s+=sc.svg; y=sc.fim+2;

  const passos=propLista(D.metodologia);
  passos.forEach((p,i)=>{
    s+=`<circle cx="${P.ML+2.6}" cy="${(y+0.4).toFixed(2)}" r="2.6" fill="${PROP_COR.destaque}"/>`;
    s+=propTexto(P.ML+2.6, y+1.4, String(i+1), {fs:2.9,peso:700,cor:'#fff',anchor:'middle'}).svg;
    const t=propTexto(P.ML+8, y+1.4, p, {fs:3.0,w:P.W-P.ML-P.MR-8});
    s+=t.svg;
    y=Math.max(t.fim, y+6.2)+2.2;
  });
  y+=3;

  sc=propSecao(y,'2','Localização'); s+=sc.svg; y=sc.fim+2;
  const mx=P.ML, mw=P.W-P.ML-P.MR, mh=Math.max(40, P.H-P.MB-6-y);
  s+=`<rect x="${mx}" y="${y}" width="${mw}" height="${mh}" fill="#fff" `+
     `stroke="${PROP_COR.linha}" stroke-width="0.3"/>`;
  if(D.mapa){
    /* o mapa vem do modo Figura do próprio Layout, encaixado sem distorcer */
    s+=`<image x="${mx}" y="${y}" width="${mw}" height="${mh}" `+
       `preserveAspectRatio="xMidYMid meet" href="${D.mapa}" xlink:href="${D.mapa}"/>`;
  }else{
    s+=propTexto(mx+mw/2, y+mh/2, 'Use “Inserir mapa do modo Figura” no painel',
      {fs:3.0,cor:'#9aa8b5',anchor:'middle'}).svg;
  }
  return s;
}

/* ---- PÁGINA 3: escopo técnico ------------------------------------------- */
function propPagina3(tot){
  const P=PROP_A4, D=propGet();
  let s=propMoldura(3,tot,'Escopo técnico');
  let y=P.MT+8;

  /* duas colunas de listas — é o que mais encolhe em relação à planilha */
  const colW=(P.W-P.ML-P.MR-8)/2, cx=[P.ML, P.ML+colW+8];
  const blocos=[['Equipe técnica',D.equipe],['Equipamentos',D.equipamentos],
    ['Softwares',D.softwares],['Entregáveis',D.entregaveis]];
  let yy=[y,y];
  blocos.forEach((b,i)=>{
    const col=i%2, x=cx[col];
    let by=yy[col];
    s+=propTexto(x, by, b[0].toUpperCase(), {fs:2.6,peso:700,cor:PROP_COR.fraco}).svg;
    by+=1.6;
    s+=`<line x1="${x}" y1="${by}" x2="${x+colW}" y2="${by}" `+
       `stroke="${PROP_COR.linha}" stroke-width="0.25"/>`;
    by+=4.2;
    propLista(b[1]).forEach(it=>{
      s+=`<rect x="${x}" y="${(by-2).toFixed(2)}" width="1.6" height="1.6" `+
         `fill="${PROP_COR.destaque}"/>`;
      const t=propTexto(x+4, by, it, {fs:2.9,w:colW-4});
      s+=t.svg; by=Math.max(t.fim,by)+2.4;
    });
    yy[col]=by+6;
  });
  y=Math.max(yy[0],yy[1])+2;

  let sc=propSecao(y,'','Prazos e cronograma'); s+=sc.svg; y=sc.fim+2;
  let t=propTexto(P.ML, y+1, 'Prazo: '+(D.prazo||'a definir'), {fs:3.0,peso:700,w:P.W-P.ML-P.MR});
  s+=t.svg; y=t.fim+2;
  t=propTexto(P.ML, y+1, D.obsCronograma, {fs:2.9,w:P.W-P.ML-P.MR,cor:PROP_COR.fraco});
  s+=t.svg; y=t.fim+5;

  if(propLista(D.relevantes).length){
    sc=propSecao(y,'','Condições e premissas'); s+=sc.svg; y=sc.fim+2;
    propLista(D.relevantes).forEach(it=>{
      s+=`<rect x="${P.ML}" y="${(y-2).toFixed(2)}" width="1.6" height="1.6" fill="${PROP_COR.destaque}"/>`;
      const tt=propTexto(P.ML+4, y, it, {fs:2.9,w:P.W-P.ML-P.MR-4});
      s+=tt.svg; y=Math.max(tt.fim,y)+2.6;
    });
    y+=4;
  }
  /* aviso legal ancorado no rodapé */
  const av=propQuebra(D.avisoLegal, P.W-P.ML-P.MR-6, 2.4).length*3.24;
  const ay=Math.max(y, P.H-P.MB-av-10);
  s+=`<rect x="${P.ML}" y="${ay-4}" width="${P.W-P.ML-P.MR}" height="${av+8}" `+
     `fill="${PROP_COR.zebra}" rx="1"/>`;
  s+=propTexto(P.ML+3, ay, 'AVISO LEGAL', {fs:2.4,peso:700,cor:PROP_COR.fraco}).svg;
  s+=propTexto(P.ML+3, ay+4.2, D.avisoLegal, {fs:2.4,lh:3.24,w:P.W-P.ML-P.MR-6,cor:PROP_COR.fraco}).svg;
  return s;
}

/* ---- PÁGINA 4: comercial ------------------------------------------------ */
function propPagina4(tot){
  const P=PROP_A4, D=propGet();
  let s=propMoldura(4,tot,'Proposta comercial');
  let y=P.MT+8;
  let sc=propSecao(y,'','Planilha de preços'); s+=sc.svg; y=sc.fim+3;

  /* cabeçalho da tabela */
  const x0=P.ML, W=P.W-P.ML-P.MR;
  const cw=[W-62, 12, 14, 18, 18];       // descrição, un, qtd, unitário, total
  const cx=[x0]; for(let i=1;i<cw.length;i++) cx[i]=cx[i-1]+cw[i-1];
  s+=`<rect x="${x0}" y="${(y-3.6).toFixed(2)}" width="${W}" height="5.4" fill="${PROP_COR.faixa}"/>`;
  const th=['ITEM','UN','QTD','R$/UN','TOTAL'];
  th.forEach((t,i)=>{
    const dir=i>=2, ax=dir? cx[i]+cw[i]-1.5 : cx[i]+1.5;
    s+=propTexto(ax, y, t, {fs:2.5,peso:700,cor:'#fff',anchor:dir?'end':'start'}).svg;
  });
  y+=4.4;

  const itens=propItens();
  itens.forEach((it,i)=>{
    const linhas=propQuebra(it.desc, cw[0]-3, 2.9), h=Math.max(5.6, linhas.length*3.9+1.7);
    if(i%2===1) s+=`<rect x="${x0}" y="${(y-3.4).toFixed(2)}" width="${W}" height="${h.toFixed(2)}" fill="${PROP_COR.zebra}"/>`;
    s+=propTexto(cx[0]+1.5, y, it.desc, {fs:2.9,w:cw[0]-3}).svg;
    s+=propTexto(cx[1]+1.5, y, it.un, {fs:2.9}).svg;
    s+=propTexto(cx[2]+cw[2]-1.5, y, String(it.qtd).replace('.',','), {fs:2.9,anchor:'end'}).svg;
    s+=propTexto(cx[3]+cw[3]-1.5, y, it.unit?propBRL(it.unit).replace('R$ ',''):'—', {fs:2.9,anchor:'end'}).svg;
    s+=propTexto(cx[4]+cw[4]-1.5, y, it.total?propBRL(it.total).replace('R$ ',''):'—', {fs:2.9,peso:700,anchor:'end'}).svg;
    y+=h;
  });
  /* total */
  s+=`<rect x="${x0}" y="${(y-3.6).toFixed(2)}" width="${W}" height="6.4" fill="${PROP_COR.faixa}"/>`;
  s+=propTexto(cx[0]+1.5, y+0.4, 'VALOR TOTAL', {fs:3.0,peso:700,cor:'#fff'}).svg;
  s+=propTexto(x0+W-1.5, y+0.4, propTotal()?propBRL(propTotal()):'a definir',
      {fs:3.4,peso:700,cor:'#fff',anchor:'end'}).svg;
  y+=8;

  /* condições de pagamento — "descrição | %" */
  sc=propSecao(y,'','Condições de pagamento'); s+=sc.svg; y=sc.fim+2.5;
  const tot0=propTotal();
  let somaPct=0;
  propLista(D.pagamento).forEach(l=>{
    const p=l.split('|').map(x=>x.trim());
    const pct=parseFloat((p[1]||'0').replace(',','.'))||0;
    somaPct+=pct;
    s+=`<rect x="${P.ML}" y="${(y-2).toFixed(2)}" width="1.6" height="1.6" fill="${PROP_COR.destaque}"/>`;
    s+=propTexto(P.ML+4, y, p[0]||'', {fs:2.9}).svg;
    s+=propTexto(P.W-P.MR-26, y, pct?pct.toLocaleString('pt-BR')+'%':'', {fs:2.9,anchor:'end'}).svg;
    s+=propTexto(P.W-P.MR, y, tot0&&pct?propBRL(tot0*pct/100):'—', {fs:2.9,peso:700,anchor:'end'}).svg;
    y+=4.4;
  });
  if(Math.abs(somaPct-100)>0.01 && somaPct>0){
    s+=propTexto(P.ML, y+1.4, `(as parcelas somam ${somaPct.toLocaleString('pt-BR')}%)`,
      {fs:2.4,cor:PROP_COR.destaque}).svg;
    y+=4;
  }
  if((D.obsPagamento||'').trim()){
    const t=propTexto(P.ML, y+2.4, D.obsPagamento, {fs:2.8,w:P.W-P.ML-P.MR,cor:PROP_COR.fraco});
    s+=t.svg; y=t.fim+3;
  }

  /* identificação + assinaturas, ancoradas no rodapé */
  const ay=P.H-P.MB-40;
  s+=`<line x1="${P.ML}" y1="${ay-4}" x2="${P.W-P.MR}" y2="${ay-4}" `+
     `stroke="${PROP_COR.linha}" stroke-width="0.25"/>`;
  s+=propTexto(P.ML, ay, D.empresa, {fs:3.0,peso:700}).svg;
  s+=propTexto(P.ML, ay+4.4, D.endereco+'\nCNPJ '+D.cnpj, {fs:2.5,cor:PROP_COR.fraco}).svg;
  s+=propTexto(P.W-P.MR, ay, 'Dados bancários', {fs:2.5,peso:700,cor:PROP_COR.fraco,anchor:'end'}).svg;
  s+=propTexto(P.W-P.MR, ay+4.4,
      D.banco+'\nAgência '+D.agencia+'\nConta corrente '+D.conta,
      {fs:2.5,cor:PROP_COR.fraco,anchor:'end'}).svg;

  const sy=P.H-P.MB-8, sw=54;
  [[P.ML+16, D.diretor, D.diretorT],[P.W-P.MR-16-0, D.gerente, D.gerenteT]].forEach((a,i)=>{
    const cxs = i===0 ? P.ML+sw/2 : P.W-P.MR-sw/2;
    s+=`<line x1="${cxs-sw/2}" y1="${sy-4}" x2="${cxs+sw/2}" y2="${sy-4}" `+
       `stroke="${PROP_COR.tinta}" stroke-width="0.3"/>`;
    s+=propTexto(cxs, sy, a[1], {fs:2.8,peso:700,anchor:'middle'}).svg;
    s+=propTexto(cxs, sy+3.6, a[2], {fs:2.4,cor:PROP_COR.fraco,anchor:'middle'}).svg;
  });
  return s;
}

/* ---- montagem das páginas ------------------------------------------------ */
function propPaginasSVG(){
  const P=PROP_A4, tot=4;
  const corpos=[propPagina1(tot),propPagina2(tot),propPagina3(tot),propPagina4(tot)];
  return corpos.map(c=>
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" `+
    `viewBox="0 0 ${P.W} ${P.H}" width="${P.W}mm" height="${P.H}mm">`+
    `<rect x="0" y="0" width="${P.W}" height="${P.H}" fill="#fff"/>${c}</svg>`);
}

/* ---- render na tela ------------------------------------------------------ */
function propBuild(){
  const wrap=document.getElementById('sheetWrap'); if(!wrap) return;
  const P=PROP_A4, Z=S.loZoom||1;
  const pgs=propPaginasSVG();
  S._propSVG=pgs;
  S._loPaper={PW:P.W, PH:P.H, mode:'prop', format:'a4p'};
  wrap.innerHTML=pgs.map(svg=>
    `<div class="sheet" style="width:${(P.W*3*Z).toFixed(1)}px;height:${(P.H*3*Z).toFixed(1)}px;margin:0 auto 14px">${svg}</div>`
  ).join('');
  wrap.querySelectorAll('svg').forEach(s=>{
    s.setAttribute('width','100%'); s.setAttribute('height','100%');
  });
  if(typeof syncZoomUI==='function') syncZoomUI();
}

/* ---- captura do mapa: usa o MODO FIGURA do próprio Layout ---------------- */
async function propCapturaMapa(){
  const modo=S.loMode;
  try{
    if(typeof showLoad==='function') showLoad('Gerando o mapa de localização…');
    S.loMode='fig';
    await buildLayout();                     // render do modo Figura
    if(!S._lastSVG) throw new Error('nada visível para plotar');
    /* embutido como data-URI: o PDF rasteriza a página inteira e o mapa
       acompanha na mesma resolução, sem depender de arquivo externo */
    const b64=btoa(unescape(encodeURIComponent(S._lastSVG)));
    propGet().mapa='data:image/svg+xml;base64,'+b64;
    if(typeof toast==='function') toast('Mapa inserido na proposta');
  }catch(e){
    if(typeof toast==='function') toast('Não foi possível gerar o mapa: '+e.message);
  }finally{
    if(typeof hideLoad==='function') hideLoad();
    S.loMode=modo||'prop';
    if(S.loMode==='prop') propBuild(); else await buildLayout();
    if(typeof syncLoBtns==='function') syncLoBtns();
  }
}

/* ---- exportação: PDF A4 multipágina e SVG -------------------------------- */
function propRasteriza(svg, dpi){
  return new Promise((res,rej)=>{
    const P=PROP_A4, f=(dpi||300)/25.4;
    const img=new Image();
    const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    img.onload=()=>{
      const cv=document.createElement('canvas');
      cv.width=Math.round(P.W*f); cv.height=Math.round(P.H*f);
      const ctx=cv.getContext('2d');
      ctx.fillStyle='#fff'; ctx.fillRect(0,0,cv.width,cv.height);
      ctx.drawImage(img,0,0,cv.width,cv.height);
      URL.revokeObjectURL(url); res(cv);
    };
    img.onerror=()=>{ URL.revokeObjectURL(url); rej(new Error('falha ao rasterizar a página')); };
    img.src=url;
  });
}
async function propExportPDF(){
  try{
    if(typeof showLoad==='function') showLoad('Gerando a proposta em PDF…');
    const P=PROP_A4, pgs=propPaginasSVG(), pages=[];
    for(let i=0;i<pgs.length;i++){
      if(typeof showLoad==='function') showLoad(`Gerando página ${i+1}/${pgs.length}…`);
      const cv=await propRasteriza(pgs[i],300);
      pages.push({jpeg:b64ToBytes(cv.toDataURL('image/jpeg',0.92).split(',')[1]),
        PW:P.W, PH:P.H, pxW:cv.width, pxH:cv.height});
    }
    const blob=buildPDFmulti(pages);
    if(typeof hideLoad==='function') hideLoad();
    const D=propGet();
    const nome='Proposta_'+(D.numero||'CCM').replace(/[^\w\-]+/g,'_')+
      (D.cliente?'_'+D.cliente.replace(/[^\w\-]+/g,'_'):'');
    download(blob, nome+'.pdf');
    if(typeof toast==='function') toast(`Proposta em PDF · ${pages.length} páginas A4 · 300 dpi`);
  }catch(e){
    if(typeof hideLoad==='function') hideLoad();
    if(typeof toast==='function') toast('Falha ao gerar o PDF: '+e.message);
  }
}

/* ---- painel de preenchimento -------------------------------------------- */
const PROP_CAMPOS=[
  ['numero','Proposta nº','t'], ['cliente','Cliente','t'], ['unidade','Unidade / local','t'],
  ['objeto','Objeto','t'], ['validade','Validade','t'],
  ['escopo','Escopo do trabalho','a'], ['historico','Apresentação','a'],
  ['metodologia','Metodologia (uma etapa por linha)','a'],
  ['equipe','Equipe (um por linha)','a'], ['equipamentos','Equipamentos (um por linha)','a'],
  ['softwares','Softwares (um por linha)','a'], ['entregaveis','Entregáveis (um por linha)','a'],
  ['prazo','Prazo','t'], ['obsCronograma','Observação do cronograma','a'],
  ['relevantes','Condições e premissas (uma por linha)','a'],
  ['itens','Itens: descrição | un | qtd | valor','a'],
  ['pagamento','Pagamento: descrição | %','a'],
  ['obsPagamento','Observação do pagamento','a'],
  ['avisoLegal','Aviso legal','a'],
  ['diretor','Assinatura 1 — nome','t'], ['diretorT','Assinatura 1 — título','t'],
  ['gerente','Assinatura 2 — nome','t'], ['gerenteT','Assinatura 2 — título','t'],
  ['empresa','Empresa','t'], ['cnpj','CNPJ','t'], ['endereco','Endereço','a'],
  ['banco','Banco','t'], ['agencia','Agência','t'], ['conta','Conta corrente','t']
];
function propPainelHTML(){
  const D=propGet();
  let h='<div class="stickybar">'+
    '<button class="tbtn" id="btnPropMapa" style="flex:1;justify-content:center">🗺 Inserir mapa do modo Figura</button>'+
    '</div>'+
    '<div class="row2" style="margin-top:6px">'+
    '<button class="tbtn" id="btnPropPDF" style="justify-content:center;background:var(--amber);color:#1a1206;font-weight:600">⬇ PDF da proposta</button>'+
    '<button class="tbtn" id="btnPropReset" style="justify-content:center">⟲ Restaurar padrão</button>'+
    '</div>'+
    '<div class="hint" id="propTotInfo" style="margin-top:6px"></div>';
  PROP_CAMPOS.forEach(([k,rot,tp])=>{
    h+=`<label class="field">${propEsc(rot)}</label>`;
    if(tp==='a') h+=`<textarea class="propF" data-k="${k}" rows="3" style="width:100%">${propEsc(D[k]||'')}</textarea>`;
    else h+=`<input type="text" class="propF" data-k="${k}" value="${propEsc(D[k]||'')}">`;
  });
  return h;
}
function propPainelSync(){
  const box=document.getElementById('propostaBody'); if(!box) return;
  box.innerHTML=propPainelHTML();
  const marca=()=>{
    const info=document.getElementById('propTotInfo');
    if(info) info.innerHTML='Valor total: <b>'+(propTotal()?propBRL(propTotal()):'a definir')+
      '</b> · '+propItens().length+' item(ns)';
  };
  box.querySelectorAll('.propF').forEach(el=>{
    el.oninput=()=>{ propGet()[el.dataset.k]=el.value; marca(); };
    el.onchange=()=>{ propGet()[el.dataset.k]=el.value; marca(); propBuild(); };
  });
  marca();
  const b1=document.getElementById('btnPropMapa'); if(b1) b1.onclick=propCapturaMapa;
  const b2=document.getElementById('btnPropPDF'); if(b2) b2.onclick=propExportPDF;
  const b3=document.getElementById('btnPropReset'); if(b3) b3.onclick=()=>{
    if(!confirm('Restaurar todos os campos da proposta para o padrão?')) return;
    const mapa=propGet().mapa; S.prop=propDefault(); S.prop.mapa=mapa;
    propPainelSync(); propBuild();
  };
}

/* campos do selo/planta que pertencem a cada prancha */
const PLATE_FIELDS = ['loBasemap','loTitle','loSub','loScale','loGrid','loPaper','loSeloPaper',
  'loArea','loCli','loLoc','loRT','loDes','loExec','loNum','loCont','loRevN','loFolha','loFS',
  'loLegSc','loLegFS','loCoordFS','loBarFS','loBarSc','loSym','loLegColGap','loMapSym','loDash','loDashGap','loTxt','loCartFS','loTitFS','loLegPos','loBarPasso'];
const PLATE_CHECKS = ['loScaleAuto','loGridAuto','loFitW','loCoords',
  'loCoordTop','loCoordBottom','loCoordLeft','loCoordRight',
  'loCart','loSat','loLegend','loGroupNumbers','loLegOut','loBarAuto'];

/* ===========================================================================
   CAIXA DE TEXTO DA LEGENDA (prancha A3)
   Um quadro de notas ao lado da legenda, dentro da mesma faixa do selo. Vive
   por PRANCHA (cada prancha tem o seu texto) e só é desenhado no A3 — no A4 a
   faixa é curta e a legenda precisa de toda ela.
   =========================================================================== */
const LO_NOTA_DEF={on:false,titulo:'NOTAS',texto:'',larg:70,fs:2.0};
function loNotaGet(){
  const pl=(S.plates||[]).find(p=>p.id===S.plateId);
  if(pl){ pl.nota=Object.assign({},LO_NOTA_DEF,pl.nota||{}); return pl.nota; }
  S._notaAvulsa=Object.assign({},LO_NOTA_DEF,S._notaAvulsa||{});
  return S._notaAvulsa;
}
function loNotaSet(patch){
  const n=Object.assign(loNotaGet(),patch||{});
  const pl=(S.plates||[]).find(p=>p.id===S.plateId);
  if(pl) pl.nota=n; else S._notaAvulsa=n;
  return n;
}
function loNotaSyncBotao(){
  const b=document.getElementById('btnLoNota'); if(!b) return;
  const a3=(S.loMode==='a4' && S.loPranchaFormato==='a3');
  b.disabled=!a3;
  b.classList.toggle('on', a3 && !!loNotaGet().on);
  b.title=a3? 'Caixa de texto junto à legenda'
            : 'Caixa de texto na legenda — disponível na prancha A3';
}
function loNotaAbre(){
  if(!(S.loMode==='a4' && S.loPranchaFormato==='a3')){
    toast('A caixa de texto da legenda existe na prancha A3 — troque o formato para A3');
    return;
  }
  const N=loNotaGet();
  const bg=document.createElement('div'); bg.className='modal-bg on';
  bg.innerHTML='<div class="modal" style="width:min(520px,100%)">'+
    '<div class="modal-h"><b>A — Caixa de texto na legenda</b><div style="flex:1"></div>'+
      '<span class="gset" id="ntX" style="font-size:16px;cursor:pointer">✕</span></div>'+
    '<div class="modal-b">'+
      '<label class="field" style="display:flex;align-items:center;gap:8px;cursor:pointer">'+
        `<input type="checkbox" id="ntOn" ${N.on?'checked':''} style="width:auto;accent-color:var(--amber)"> Mostrar a caixa ao lado da legenda</label>`+
      '<label class="field" style="margin-top:8px">Título do quadro (vazio = sem título)</label>'+
      `<input type="text" id="ntTit" maxlength="40" value="${esc(N.titulo||'')}">`+
      '<label class="field" style="margin-top:8px">Texto</label>'+
      `<textarea id="ntTxt" rows="8" style="width:100%;resize:vertical;background:var(--panel2);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:6px;font-family:inherit;font-size:13px">${esc(N.texto||'')}</textarea>`+
      '<div class="row2" style="margin-top:8px">'+
        `<div><label class="field">Largura (mm)</label><input type="number" id="ntW" min="30" max="140" step="5" value="${+N.larg||70}"></div>`+
        `<div><label class="field">Corpo do texto (mm)</label><input type="number" id="ntFS" min="1.4" max="3.2" step="0.1" value="${+N.fs||2}"></div>`+
      '</div>'+
      '<div class="hint" style="margin-top:6px">O quadro fica encostado no selo e a legenda usa o restante da faixa. A quebra de linha é automática; suas quebras são respeitadas. O que não couber na altura é cortado com “…”.</div>'+
      '<button class="tbtn" id="ntOk" style="width:100%;justify-content:center;margin-top:10px;background:var(--amber);color:#1a1206;font-weight:600">Aplicar</button>'+
    '</div></div>';
  document.body.appendChild(bg);
  const $=id=>bg.querySelector('#'+id);
  const fechar=()=>bg.remove();
  $('ntX').onclick=fechar;
  const aplica=()=>{
    loNotaSet({on:$('ntOn').checked, titulo:$('ntTit').value, texto:$('ntTxt').value,
      larg:Math.max(30,Math.min(140,+$('ntW').value||70)),
      fs:Math.max(1.4,Math.min(3.2,+$('ntFS').value||2))});
    loNotaSyncBotao();
    buildLayout();
  };
  ['ntOn','ntTit','ntTxt','ntW','ntFS'].forEach(id=>{
    const e=$(id); if(!e) return;
    e.addEventListener(e.type==='checkbox'?'change':'input',aplica);
  });
  $('ntOk').onclick=()=>{ aplica(); fechar(); toast(loNotaGet().on?'Caixa de texto aplicada na legenda':'Caixa de texto desligada'); };
}
{ const b=document.getElementById('btnLoNota'); if(b) b.onclick=loNotaAbre; }

function layoutClone(v){
  if(v==null)return v;
  try{if(typeof structuredClone==='function')return structuredClone(v);}catch(e){}
  try{return JSON.parse(JSON.stringify(v));}catch(e){return v;}
}
function layoutStateEqual(a,b){
  try{return JSON.stringify(a)==JSON.stringify(b);}catch(e){return a===b;}
}
/* O nome identifica a camada no projeto, não uma convenção da prancha.
   Instantâneos antigos ainda podem contê-lo: ignore-o também na comparação
   para não criar rascunhos nem redesenhar camadas apenas por uma renomeação. */
function layoutConventionStyle(c){
  if(!c)return c;
  const {name,...style}=c;return style;
}
function layoutConventionEqual(a,b){
  const styles=conv=>conv&&Object.fromEntries(Object.entries(conv)
    .map(([key,c])=>[key,layoutConventionStyle(c)]));
  return layoutStateEqual(styles(a),styles(b));
}
function layoutVectorConvention(L){
  return {color:L.color,weight:L.weight,fill:L.fill,
    sym:layoutClone(L.sym||null),labelField:L.labelField||'',
    labelFields:Array.isArray(L.labelFields)?L.labelFields.slice():null,
    lbl:layoutClone(L.lbl||null),attrFilter:layoutClone(L.attrFilter||null),
    attrFilterRules:layoutClone(L.attrFilterRules||null),attrFilterLogic:L.attrFilterLogic||'AND'};
}
/* Convenção cartográfica da prancha: estilo vetorial, classes, rótulos,
   filtros e estilo dos rasters. Não copia geometrias nem grades pesadas. */
function layoutConventionSnapshot(){
  const out={};
  (S.layers||[]).forEach(L=>{out['L:'+L.id]=layoutVectorConvention(L);});
  (S.rasters||[]).forEach(r=>{out['R:'+r.id]={style:layoutClone(r.style||null)};});
  if(S.img&&S.img.url)out['I:0']={
    opacity:(S.img.overlay&&S.img.overlay.options)?S.img.overlay.options.opacity:null};
  return out;
}
function layoutConventionApply(conv){
  if(!conv)return;
  S._loRestoringConv=true;
  try{
    (S.layers||[]).forEach(L=>{
      const c=layoutConventionStyle(conv['L:'+L.id]);if(!c)return;
      const atual=layoutVectorConvention(L);if(layoutStateEqual(atual,c))return;
      L.color=c.color;L.weight=c.weight;L.fill=c.fill;
      if(Object.prototype.hasOwnProperty.call(c,'sym'))L.sym=layoutClone(c.sym);
      L.labelField=c.labelField||'';
      L.labelFields=Array.isArray(c.labelFields)?c.labelFields.slice():null;
      L.lbl=layoutClone(c.lbl||null);L.attrFilter=layoutClone(c.attrFilter||null);
      L.attrFilterRules=layoutClone(c.attrFilterRules||null);L.attrFilterLogic=c.attrFilterLogic||'AND';
      drawLayer(L);
    });
    (S.rasters||[]).forEach(r=>{
      const c=layoutConventionStyle(conv['R:'+r.id]);if(!c)return;
      const atual={style:layoutClone(r.style||null)};
      if(layoutStateEqual(atual,c))return;
      if(c.style)r.style=layoutClone(c.style);
      if(typeof renderRaster==='function')renderRaster(r);
    });
    const ic=conv['I:0'];
    if(ic&&S.img){
      if(ic.opacity!=null&&S.img.overlay&&S.img.overlay.setOpacity)S.img.overlay.setOpacity(ic.opacity);}
    try{zApply();}catch(e){}
    try{refreshUI();}catch(e){}
  }finally{S._loRestoringConv=false;}
}
function layoutStackApply(stack){
  if(!Array.isArray(stack))return;
  const nodes=allNodes(),by=new Map(nodes.map(n=>[nodeKey(n.t,n.id),n]));
  const groups=new Map((S.groups||[]).map(g=>['G:'+g.id,g])),covered=new Set();
  for(const key of stack){
    const n=by.get(key),g=groups.get(key),id=g?g.id:n?.o.groupId;
    groupPath(id).forEach(parent=>covered.add('G:'+parent.id));
  }
  // Instantâneos antigos não tinham cabeçalhos para grupos com conteúdo.
  // Neles, deixe a posição derivar do primeiro descendente salvo na prancha.
  const extra=(S.stack||[]).filter(key=>!groups.has(key)||!covered.has(key));
  S.stack=stack.concat(extra);stackSync();
  try{zApply();}catch(e){}
}
function layoutFrozenDirty(on){
  S._loFrozenDirty=!!on;
  const b=document.getElementById('btnLoRedraw'),lab=document.getElementById('loUpdateLabel');
  if(b){b.classList.toggle('layout-dirty',!!on);b.title=on
    ?'Existem alterações pendentes — atualizar a prancha congelada'
    :(S.loMode==='a4'?'Atualizar a prancha congelada com o estado atual do mapa':'Atualizar a figura');}
  if(lab)lab.textContent=(S.loMode==='a4'?'Atualizar prancha':'Atualizar figura')+(on?' •':'');
}
function layoutPlateStateClone(base){
  return {vis:base&&base.vis?{...base.vis}:null,
    conv:base&&base.conv?layoutClone(base.conv):null,
    stack:base&&Array.isArray(base.stack)?base.stack.slice():null,
    legendVis:base&&base.legendVis?{...base.legendVis}:{}};
}

function plateCapture(op){                     // UI -> prancha ativa
  const pl = S.plates.find(p=>p.id===S.plateId);
  if(!pl) return;
  pl.f = {};
  PLATE_FIELDS.forEach(id=>{ const e=document.getElementById(id); if(e) pl.f[id]=e.value; });
  pl.c = {};
  PLATE_CHECKS.forEach(id=>{ const e=document.getElementById(id); if(e) pl.c[id]=!!e.checked; });
  pl.center = S.loCenter ? S.loCenter.slice() : null;
  /* Congelado é um instantâneo completo. Chamadas rotineiras gravam apenas
     os campos da prancha; composição, ordem e convenções só mudam no botão
     Atualizar (captureState) ou quando o Layout está destravado. */
  const explicit=!!(op&&(op.captureState||op.captureVis));
  if(explicit||!S.loFrozen||!pl.vis||!pl.conv){
    const visAtual=layoutVisSnapshot(),convAtual=layoutConventionSnapshot(),stackAtual=(S.stack||[]).slice();
    const pre=(S._view==='layout'&&S._preLayoutMapState)?S._preLayoutMapState:null;
    let vis=visAtual,conv=convAtual,stack=stackAtual;
    if(S.loFrozen&&explicit){
      /* Ao entrar no Layout a tela mostra a fotografia antiga, mas `pre`
         conserva o mapa atual. Mudanças feitas dentro do Layout têm
         prioridade e são guardadas como rascunho até o clique em Atualizar. */
      const visMudou=pl.vis&&!layoutStateEqual(visAtual,pl.vis),
        preMesclada=pre&&pre.vis?{...visAtual,...pre.vis}:visAtual;
      vis={...(S._loDraftVis||(visMudou?visAtual:preMesclada))};
      const convMudou=pl.conv&&!layoutConventionEqual(convAtual,pl.conv);
      conv=layoutClone(S._loDraftConv||(convMudou?convAtual:(pre&&pre.conv?pre.conv:convAtual)));
      const stackMudou=Array.isArray(pl.stack)&&!layoutStateEqual(stackAtual,pl.stack);
      stack=(S._loDraftStack||(stackMudou?stackAtual:(pre&&pre.stack?pre.stack:stackAtual))).slice();
    }
    pl.vis={...vis};pl.conv=layoutClone(conv);pl.stack=stack.slice();
    if(pre){pre.vis={...pl.vis};pre.conv=layoutClone(pl.conv);pre.stack=pl.stack.slice();}
    S._loAppliedPlateId=pl.id;S._loDraftVis=null;S._loDraftConv=null;S._loDraftStack=null;
    layoutFrozenDirty(false);
  }
  if(explicit||!S.loFrozen||!pl.groups)
    pl.groups = S.groups.map(g=>({id:g.id, collapsed:!!g.collapsed}));
}
function plateApply(pl, semState, deferRefresh){ // prancha -> UI
  layoutPresentationDefaults({basemap:pl.f?.loBasemap,sat:pl.c?.loSat});
  PLATE_FIELDS.forEach(id=>{
    const e=document.getElementById(id);
    if(e && id==='loFolha') e.value=pl.f?.loFolha??'';
    else if(e && pl.f && pl.f[id]!=null) e.value=pl.f[id];
  });
  layoutCoordFontRestore({coordFS:pl.f?.loCoordFS,legFS:pl.f?.loLegFS,legSc:pl.f?.loLegSc});
  PLATE_CHECKS.forEach(id=>{
    const e=document.getElementById(id);
    if(!e) return;
    if(id==='loSat'&&!pl.f?.loBasemap)return;
    if(pl.c && pl.c[id]!=null) e.checked=!!pl.c[id];
    else if(id==='loCoordBottom') e.checked=false; // compatibilidade com pranchas antigas
    else if(['loCoordTop','loCoordLeft','loCoordRight'].includes(id)) e.checked=true;
    else if(id==='loGroupNumbers')e.checked=false;
  });
  /* O formato pertence à prancha, não à sessão do Layout. Sem esta
     sincronização uma cópia A3 podia abrir usando as dimensões A4 da aba
     visitada anteriormente (ou vice-versa), apesar de o seletor estar certo. */
  const papelPrancha=pl.f&&pl.f.loSeloPaper;
  if(papelPrancha)S.loPranchaFormato=String(papelPrancha).startsWith('a3')?'a3':'a4';
  try{ window.loCoordUISync&&window.loCoordUISync(); }catch(e){}
  S.loCenter = pl.center ? pl.center.slice() : null;
  try{ loNotaSyncBotao(); }catch(e){}          // cada prancha tem a sua caixa
  if(!semState){
    if(pl.conv)layoutConventionApply(pl.conv);
    if(pl.stack)layoutStackApply(pl.stack);
    /* O recolhimento/expansão pertence à prancha, mas a estrutura e os
       vínculos dos grupos pertencem ao projeto. Mesclamos somente collapsed
       para nunca substituir nomes, hierarquia ou groupId. */
    if(Array.isArray(pl.groups)){
      const collapsed=new Map(pl.groups.map(g=>[g.id,!!g.collapsed]));
      (S.groups||[]).forEach(g=>{if(collapsed.has(g.id))g.collapsed=collapsed.get(g.id);});
    }
  }
  if(pl.vis && !semState){
    /* Camada criada DEPOIS da prancha não consta do instantâneo. Antes ela
       ficava com a visibilidade corrente e vazava para dentro da prancha na
       impressão; agora fica apagada até que a prancha seja atualizada.       */
    allNodes().forEach(n=>{
      const v = pl.vis[nodeKey(n.t,n.id)];
      nodeSetVis(n, v!=null ? v : false);
    });
    zApply();
  }
  if(!semState){S._loAppliedPlateId=pl.id;S._loDraftVis=null;S._loDraftConv=null;S._loDraftStack=null;layoutFrozenDirty(false);}
  // Na abertura, loadProject já atualiza a árvore após restaurar todos os
  // controles. Evita medir cada camada duas vezes no mesmo turno.
  layoutViewControlsSync();
  if(!deferRefresh)refreshUI();
}
function plateNew(name, copyFrom){
  const base = copyFrom || S.plates.find(p=>p.id===S.plateId);
  if(base) plateCapture();
  const frozen=layoutPlateStateClone(base);
  const pl = {
    id: plid++,
    name: name || ('Prancha '+(S.plates.length+1)),
    f: base ? {...base.f} : {},
    c: base && base.c ? {...base.c} : {},
    center: base && base.center ? base.center.slice() : null,
    vis:frozen.vis,conv:frozen.conv,stack:frozen.stack,legendVis:frozen.legendVis,
    groups: base && base.groups ? base.groups.map(g=>({...g})) : null,
    nota: base && base.nota ? layoutClone(base.nota) : null,
  };
  if(!base){   // primeira prancha: fotografa o estado atual da tela
    PLATE_FIELDS.forEach(id=>{ const e=document.getElementById(id); if(e) pl.f[id]=e.value; });
    PLATE_CHECKS.forEach(id=>{ const e=document.getElementById(id); if(e) pl.c[id]=!!e.checked; });
    pl.vis = {}; allNodes().forEach(n=>{ pl.vis[nodeKey(n.t,n.id)]=n.o.visible!==false; });
    pl.conv=layoutConventionSnapshot();pl.stack=(S.stack||[]).slice();
  }
  if(!copyFrom) pl.f.loFolha='';
  if(name) pl.f.loArea = name.toUpperCase();
  S.plates.push(pl);
  return pl;
}
/* Duplica a prancha indicada, mesmo que não seja a ativa: fotografa a ativa
   antes, para não perder alterações ainda não gravadas.                      */
function plateDuplicar(pl){
  plateCapture();
  const nome=prompt('Nome da nova prancha:', pl.name+' (c\u00f3pia)');
  if(nome===null) return;
  const novo=plateNew(nome||(pl.name+' (c\u00f3pia)'), pl);
  S.plates.splice(S.plates.indexOf(novo),1);
  S.plates.splice(S.plates.indexOf(pl)+1,0,novo);   // entra logo depois da original
  renderPlateTabs();
  plateGo(novo.id);
  toast('Prancha duplicada');
}
function plateGo(id){
  if(S.plateId===id) return;
  plateCapture();
  const pl=S.plates.find(p=>p.id===id); if(!pl) return;
  S.plateId=id;
  plateApply(pl);
  try{syncLoBtns();}catch(e){}
  renderPlateTabs();
  buildLayout();
}
function plateDel(pl){
  const fmt=plateFormato(pl),mesmoFormato=S.plates.filter(p=>plateFormato(p)===fmt);
  if(mesmoFormato.length<=1){
    toast('É preciso haver ao menos uma prancha '+fmt.toUpperCase()); return;
  }
  if(!confirm(`Remover a prancha "${pl.name}"?`)) return;
  const i=S.plates.indexOf(pl);
  S.plates.splice(i,1);
  if(S.plateId===pl.id){
    const prox=S.plates.find(p=>plateFormato(p)===fmt);
    S.plateId=null;if(prox)plateGo(prox.id);
  }
  renderPlateTabs();
}
function plateFormato(pl){
  const papel=pl&&pl.f&&pl.f.loSeloPaper;
  return String(papel||'a4p').toLowerCase().startsWith('a3')?'a3':'a4';
}
function plateDefineFormato(pl,fmt){
  if(!pl)return;
  pl.f=pl.f||{};
  pl.f.loSeloPaper=fmt==='a3'?'a3l':'a4p';
}
function renderPlateTabs(){
  const box=document.getElementById('plateTabs'); if(!box) return;
  box.innerHTML='';
  const fmt=(S.loMode==='a4')?(S.loPranchaFormato||'a4'):null,
    lista=fmt?S.plates.filter(pl=>plateFormato(pl)===fmt):S.plates;
  const lab=document.getElementById('loPlateFormat');
  if(lab)lab.textContent=(fmt||'A4').toUpperCase();
  lista.forEach(pl=>{
    const el=document.createElement('div');
    el.className='ptab'+(pl.id===S.plateId?' on':'');
    el.setAttribute('role','tab');el.setAttribute('aria-selected',pl.id===S.plateId?'true':'false');
    el.innerHTML=`<span class="pn">${esc(pl.name)}</span>`+
      `<span class="pd" title="Duplicar esta prancha" style="opacity:.6;padding:0 4px">⧉</span>`+
      `<span class="px" title="Remover">✕</span>`;
    el.onclick=e=>{ if(e.target.classList.contains('px')||e.target.classList.contains('pd')) return;
      plateGo(pl.id); };
    el.querySelector('.pd').onclick=e=>{ e.stopPropagation(); plateDuplicar(pl); };
    el.querySelector('.px').onclick=e=>{ e.stopPropagation(); plateDel(pl); };
    el.ondblclick=e=>{
      e.preventDefault(); e.stopPropagation();
      const n=prompt('Nome da prancha:', pl.name);
      if(n && n.trim()){ pl.name=n.trim(); renderPlateTabs();
        if(pl.id===S.plateId){ plateCapture(); buildLayout(); } }
    };
    el.title='Duplo toque para renomear';
    box.appendChild(el);
  });
}
function platesInit(){
  if(!S.plates.length){
    const p1=plateNew('Localização');
    S.plateId=p1.id;
  }
  if(!S.plates.some(p=>p.id===S.plateId)) S.plateId=S.plates[0].id;
  renderPlateTabs();
}

/* O Layout é congelado por padrão. Figura mantém seu próprio instantâneo; cada
   prancha A4/A3 guarda camadas, controles e centro independentemente. */
S.loFrozen=true; S._figFrozenVis=null; S._loDraftVis=null;
function layoutVisSnapshot(){
  const v={}; allNodes().forEach(n=>{v[nodeKey(n.t,n.id)]=n.o.visible!==false;}); return v;
}
function layoutVisHasKnown(v){
  return !!v&&allNodes().some(n=>Object.prototype.hasOwnProperty.call(v,nodeKey(n.t,n.id)));
}
function layoutVisHasVisible(v){
  return !!v&&Object.values(v).some(Boolean);
}
function layoutVisRestore(v){
  if(!v)return;
  S._loRestoringVis=true;
  try{
    /* Camada importada depois do congelamento não existia no instantâneo.
       Antes ela era desligada à força, produzindo uma prancha vazia. Uma
       chave ausente agora preserva o estado atual da árvore. */
    allNodes().forEach(n=>{const k=nodeKey(n.t,n.id);
      nodeSetVis(n,Object.prototype.hasOwnProperty.call(v,k)?v[k]:n.o.visible!==false);});
    zApply();
  }
  finally{S._loRestoringVis=false;}
}
function layoutFrozenApply(){
  if(!S.loFrozen)return;
  const atual=(S._preLayoutMapState&&S._preLayoutMapState.vis)||layoutVisSnapshot();
  if(S.loMode==='a4'){
    platesInit();
    const pl=S.plates.find(p=>p.id===S.plateId);
    if(pl){
      const entrando=S._loAppliedPlateId!==pl.id,
        convEntrada=S._preLayoutMapState&&S._preLayoutMapState.conv;
      if(!layoutVisHasKnown(pl.vis)||(!layoutVisHasVisible(pl.vis)&&layoutVisHasVisible(atual)))pl.vis={...atual};
      if(!pl.conv)pl.conv=layoutClone((S._preLayoutMapState&&S._preLayoutMapState.conv)||layoutConventionSnapshot());
      if(!Array.isArray(pl.stack))pl.stack=((S._preLayoutMapState&&S._preLayoutMapState.stack)||S.stack||[]).slice();
      /* Entrar no Layout não é o mesmo que escolher uma prancha antiga.
         A visibilidade, a ordem e o enquadramento continuam congelados, mas
         a simbologia/rótulos/filtros que o usuário acabou de editar no 2D
         precisam aparecer na prévia e jamais podem ser revertidos. Mantemos
         essa convenção como rascunho; trocar explicitamente de prancha ainda
         chama plateApply() e restaura a convenção própria daquela prancha. */
      if(entrando&&convEntrada&&!layoutConventionEqual(convEntrada,pl.conv)){
        S._loDraftConv=layoutClone(convEntrada);
        if(typeof layoutFrozenDirty==='function')layoutFrozenDirty(true);
      }
      /* Se alguma convenção ou ordem foi editada no Layout, preserva o
         rascunho antes de reaplicar a fotografia congelada. Assim um ajuste
         seguido de outro controle não se perde antes do clique em Atualizar. */
      if(S._loAppliedPlateId===pl.id&&!S._loRestoringConv){
        const vv=layoutVisSnapshot(),cc=layoutConventionSnapshot(),ss=(S.stack||[]).slice();
        if(!layoutStateEqual(vv,pl.vis))S._loDraftVis={...vv};
        if(!layoutConventionEqual(cc,pl.conv))S._loDraftConv=layoutClone(cc);
        if(!layoutStateEqual(ss,pl.stack))S._loDraftStack=ss;
      }
      layoutConventionApply(S._loDraftConv||pl.conv);
      layoutStackApply(pl.stack);
      layoutVisRestore(pl.vis);
      S._loAppliedPlateId=pl.id;
    }
  }else if(S.loMode==='fig'){
    if(!layoutVisHasKnown(S._figFrozenVis)||(!layoutVisHasVisible(S._figFrozenVis)&&layoutVisHasVisible(atual)))
      S._figFrozenVis={...atual};
    layoutVisRestore(S._figFrozenVis);
  }
  try{refreshUI();}catch(e){}
}
function layoutFrozenCapture(){
  if(S.loMode==='a4')plateCapture({captureState:true});
  else S._figFrozenVis=layoutVisSnapshot();
}

/* Menu persistente no painel esquerdo/dock de camadas. Mantém a paleta e o
   resumo sempre sincronizados com os controles reais do Layout. */
function layoutSideMenuSync(){
  const panel=document.getElementById('layoutQuickPanel');
  const active=panel&&panel.classList.contains('open');
  const mark=(id,on)=>{const b=document.getElementById(id);if(b){b.classList.toggle('on',!!on);b.setAttribute('aria-pressed',on?'true':'false');}};
  mark('btnLoScaleQuick',active&&panel.dataset.kind==='scale');
  mark('btnLoGridQuick',active&&panel.dataset.kind==='grid');
  mark('btnLoLegendPos',active&&panel.dataset.kind==='legendpos');
  mark('btnLoLegendItems',active&&panel.dataset.kind==='legenditems');
  mark('btnLoSettings',active&&panel.dataset.kind==='adjustments');
  mark('btnLoFreeze',S.loFrozen);mark('btnLoCenter',S._loPick);
}

/* Barra enxuta: escala e grade usam degraus cartográficos discretos e também
   aceitam digitação direta no campo à direita do controle. */
(function layoutCompactControls(){
  const panel=document.getElementById('layoutQuickPanel'), sec=document.getElementById('secLayout');
  const debounce=(()=>{let t;return()=>{clearTimeout(t);t=setTimeout(()=>{buildLayout();layoutSideMenuSync();},120);};})();
  const closeQuick=()=>{if(panel)panel.classList.remove('open');layoutSideMenuSync();};
  const sliderIcon=kind=>({
    scale:'<svg viewBox="0 0 24 24"><path d="M4 17h16M6 14v6M10 16v4M14 14v6M18 16v4"/><path d="M6 7h12M6 7l2-2M6 7l2 2M18 7l-2-2M18 7l-2 2"/></svg>',
    grid:'<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4zM9.5 4v16M14.5 4v16M4 9.5h16M4 14.5h16"/></svg>',
    width:'<svg viewBox="0 0 24 24"><path d="M4 7v10M20 7v10M5 12h14M8 9l-3 3 3 3M16 9l3 3-3 3"/></svg>',
    height:'<svg viewBox="0 0 24 24"><path d="M7 4h10M7 20h10M12 5v14M9 8l3-3 3 3M9 16l3 3 3-3"/></svg>',
    text:'<svg viewBox="0 0 24 24"><path d="M5 5h14M12 5v14M8 19h8"/></svg>',
    cart:'<svg viewBox="0 0 24 24"><path d="M4 5h16v14H4zM4 14h16M8 17h8"/></svg>',
    title:'<svg viewBox="0 0 24 24"><path d="M5 6h14M12 6v12M8 18h8"/><path d="M8 10h8"/></svg>',
    legend:'<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><rect x="4" y="4" width="2" height="2"/><rect x="4" y="10" width="2" height="2"/><rect x="4" y="16" width="2" height="2"/></svg>',
    columns:'<svg viewBox="0 0 24 24"><path d="M4 5v14M20 5v14M8 7h3M8 12h3M8 17h3M13 7h3M13 12h3M13 17h3"/><path d="M10.5 3v18M13.5 3v18" stroke-dasharray="1.5 2"/></svg>',
    font:'<svg viewBox="0 0 24 24"><path d="M5 19L11 5h2l6 14M8 13h8"/></svg>',
    symbol:'<svg viewBox="0 0 24 24"><circle cx="8" cy="12" r="4"/><rect x="14" y="8" width="7" height="8"/></svg>',
    line:'<svg viewBox="0 0 24 24"><path d="M3 16l6-8 6 8 6-8"/><path d="M3 19h18"/></svg>',
    dash:'<svg viewBox="0 0 24 24"><path d="M3 12h4m3 0h4m3 0h4"/></svg>',
    dashgap:'<svg viewBox="0 0 24 24"><path d="M3 12h5m8 0h5"/><path d="M9 8v8m6-8v8M10 12h4M10 12l2-2m-2 2 2 2M14 12l-2-2m2 2-2 2"/></svg>'
  }[kind]||'<svg viewBox="0 0 24 24"><path d="M4 12h16"/></svg>');
  const openQuick=(kind,target)=>{
    const host=target||panel; if(!host)return;
    const same=host.classList.contains('open')&&host.dataset.kind===kind;
    closeQuick();
    if(same)return;
    host.dataset.kind=kind;
    const isScale=kind==='scale', valEl=document.getElementById(isScale?'loScale':'loGrid'),
      autoEl=document.getElementById(isScale?'loScaleAuto':'loGridAuto');
    if(!valEl)return;
    const val=Math.max(isScale?100:10,+valEl.value||(isScale?5000:500));
    /* Régua discreta: 50 até 1:500; 250 até 1:25.000; 500 até
       1:500.000; e 5.000 até 1:10.000.000. Digitação é livre. */
    const passos=isScale
      ? ((typeof ESCALA_PASSOS!=='undefined'&&ESCALA_PASSOS.length)?ESCALA_PASSOS.slice():[100,500,25000,500000,1000000,5000000,10000000])
      : ((typeof GRADE_PASSOS!=='undefined'&&GRADE_PASSOS.length)?GRADE_PASSOS.slice():[10,25,50,100,250,500,750,1000,1250,1500,2500,5000]);
    const nearest=v=>{
      let best=0,dist=Infinity;
      passos.forEach((n,i)=>{const d=Math.abs(n-v);if(d<dist){dist=d;best=i;}});
      return best;
    };
    const valueIndex=nearest(val);
    const format=v=>isScale?'1:'+Math.round(v).toLocaleString('pt-BR'):Math.round(v)+' m';
    const label=isScale?'Escala da figura':'Passo da grade';
    host.innerHTML='<div class="layout-slider-list"><div class="layout-slider-row" title="'+label+'">'+
      '<span class="layout-slider-icon" aria-hidden="true">'+sliderIcon(isScale?'scale':'grid')+'</span>'+
      `<input id="loQuickRange" aria-label="${label}" type="range" min="0" max="${passos.length-1}" step="1" value="${valueIndex}">`+
      '<input id="loQuickValue" class="layout-slider-value" inputmode="numeric" aria-label="Digitar '+label+'" value="'+format(isScale?val:passos[valueIndex])+'">'+
      '<button type="button" id="loQuickAuto" class="layout-slider-auto '+(autoEl&&autoEl.checked?'on':'')+'" '+
      'title="Automático" aria-label="Automático" aria-pressed="'+(autoEl&&autoEl.checked?'true':'false')+'">A</button></div></div>';
    host.classList.add('open');
    const rg=host.querySelector('#loQuickRange'), out=host.querySelector('#loQuickValue'), au=host.querySelector('#loQuickAuto');
    const set=v=>{
      const pos=Math.max(0,Math.min(passos.length-1,Math.round(+v||0))),novo=passos[pos];
      valEl.value=novo; rg.value=pos; out.value=format(novo);
      if(autoEl)autoEl.checked=false; au.classList.remove('on');au.setAttribute('aria-pressed','false');
      if(isScale){const fw=document.getElementById('loFitW');if(fw)fw.checked=false;}
      layoutSideMenuSync();
      debounce();
    };
    rg.oninput=()=>set(rg.value);
    const aplicaDigitado=()=>{
      const texto=String(out.value),denom=texto.includes(':')?texto.split(':').pop():texto;
      const pedido=+(denom.replace(/[^0-9]/g,''));
      if(!pedido){out.value=format(+valEl.value||passos[valueIndex]);return;}
      if(isScale){
        const exato=Math.max(100,Math.min(100000000,Math.round(pedido)));
        valEl.value=exato; rg.value=nearest(exato); out.value=format(exato);
        if(autoEl)autoEl.checked=false; au.classList.remove('on');au.setAttribute('aria-pressed','false');
        const fw=document.getElementById('loFitW');if(fw)fw.checked=false;
        layoutSideMenuSync();debounce();
      }else set(nearest(pedido));
    };
    out.onfocus=()=>out.select();out.onchange=aplicaDigitado;
    out.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();aplicaDigitado();out.blur();}};
    au.onclick=()=>{
      const state=!au.classList.contains('on');au.classList.toggle('on',state);au.setAttribute('aria-pressed',state?'true':'false');
      if(autoEl)autoEl.checked=state;
      if(isScale){const fw=document.getElementById('loFitW');if(fw)fw.checked=state;}
      buildLayout();
      layoutSideMenuSync();
    };
    layoutSideMenuSync();
  };
  const openAdjustments=target=>{
    const host=target||panel;if(!host)return;
    const same=host.classList.contains('open')&&host.dataset.kind==='adjustments';
    closeQuick();if(same)return;host.dataset.kind='adjustments';
    if(sec){sec.classList.remove('layout-open');sec.classList.add('collapsed');}
    const defs=[
      ['loFigWr','width','Largura da figura',v=>Math.round(v)+' mm'],
      ['loFigHr','height','Altura da figura',v=>(+v>0?Math.round(v)+' mm':'auto')],
      ['loCartFS','cart','Fonte da cartela',v=>(+v).toFixed(2).replace(/0$/,'').replace('.',',')+'×'],
      ['loTitFS','title','Título da cartela',v=>(+v).toFixed(2).replace(/0$/,'').replace('.',',')+'×'],
      ['loLegSc','legend','Tamanho da legenda',v=>(+v).toFixed(2).replace(/0$/,'').replace('.',',')+'×'],
      ['loLegFS','font','Texto da legenda',v=>(+v).toFixed(1).replace('.',',')+'×'],
      ['loCoordFS','grid','Fonte da quadrícula',layoutCoordFontLabel],
      ['loBarFS','scale','Texto da escala gráfica',v=>(+v).toFixed(1).replace('.',',')+'×'],
      ['loBarSc','scale','Comprimento da escala gráfica',v=>(+v).toFixed(2).replace(/0$/,'').replace('.',',')+'×'],
      ['loSym','symbol','Símbolos da legenda',v=>(+v).toFixed(1).replace('.',',')+'×'],
      ['loLegColGap','columns','Espaçamento entre colunas da legenda',v=>(+v).toFixed(1).replace(/\.0$/,'').replace('.',',')+' mm'],
      ['loMapSym','line','Linhas e pontos do mapa',v=>(+v).toFixed(1).replace('.',',')+'×'],
      ['loDash','dash','Densidade do tracejado',v=>(+v).toFixed(2).replace('.',',')+'×'],
      ['loDashGap','dashgap','Espaçamento entre os traços',v=>(+v).toFixed(2).replace('.',',')+'×']
    ].filter(d=>document.getElementById(d[0]));
    host.innerHTML='<div class="layout-slider-list">'+defs.map(d=>{
      const el=document.getElementById(d[0]),fixedSize=['loFigWr','loFigHr'].includes(d[0])&&S.loMode!=='fig';
      return '<div class="layout-slider-row no-auto" title="'+d[2]+(fixedSize?' — disponível no modo Figura':'')+'"'+(fixedSize?' style="opacity:.45"':'')+'>'+
        '<span class="layout-slider-icon" aria-hidden="true">'+sliderIcon(d[1])+'</span>'+
        '<input type="range" data-adjust="'+d[0]+'" aria-label="'+d[2]+'" min="'+el.min+'" max="'+el.max+'" step="'+el.step+'" value="'+el.value+'"'+(fixedSize?' disabled':'')+'>'+
        '<output class="layout-slider-value">'+d[3](el.value)+'</output></div>';}).join('')+'</div>';
    host.classList.add('open');
    host.querySelectorAll('[data-adjust]').forEach((rg,i)=>{const d=defs[i],real=document.getElementById(d[0]),out=rg.parentNode.querySelector('output');
      rg.oninput=()=>{real.value=rg.value;out.textContent=d[3](rg.value);real.dispatchEvent(new Event('input',{bubbles:true}));};});
    layoutSideMenuSync();
  };
  const openLegendPosition=target=>{
    const host=target||panel;if(!host)return;
    const same=host.classList.contains('open')&&host.dataset.kind==='legendpos';
    closeQuick();if(same)return;host.dataset.kind='legendpos';
    const pos=document.getElementById('loLegPos'), out=document.getElementById('loLegOut');
    const emPrancha=S.loMode==='a4';
    const atual=(emPrancha&&pos&&pos.value==='auto')?'out':(out&&out.checked?'out':((pos&&pos.value)||'br'));
    /* Na prancha A4/A3 a folha já reserva o quadro da legenda ao lado do
       selo: oferecer cantos ali só produziria uma caixa sobre o mapa e um
       quadro vazio. Os cantos seguem disponíveis no modo Figura. */
    const opts=emPrancha
      ? [['out','Quadro da legenda (ao lado do selo)','▤']]
      : [
        ['tl','Superior esquerda','↖'],['tr','Superior direita','↗'],
        ['bl','Inferior esquerda','↙'],['br','Inferior direita','↘'],
        ['out','Faixa lateral','▤']
      ];
    host.innerHTML='<div style="font-weight:800;margin-bottom:8px">Posição da legenda</div>'+ 
      '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px">'+opts.map(o=>
        `<button type="button" class="tbtn ${o[0]===atual?'on':''}" data-leg-pos="${o[0]}" title="${o[1]}" style="width:auto;min-height:42px;justify-content:flex-start;gap:8px"><b style="font-size:20px">${o[2]}</b><span>${o[1]}</span></button>`
      ).join('')+'</div>'+
      (emPrancha?'<div class="hint" style="margin-top:8px">Na prancha A4/A3 a legenda ocupa o quadro reservado da folha, ao lado do selo.</div>':'');
    host.classList.add('open');
    host.querySelectorAll('[data-leg-pos]').forEach(b=>b.onclick=()=>{
      const v=b.dataset.legPos;
      if(out)out.checked=!emPrancha&&v==='out';
      if(pos)pos.value=(emPrancha&&v==='out')?'auto':(v!=='out'?v:pos.value);
      host.querySelectorAll('[data-leg-pos]').forEach(x=>x.classList.toggle('on',x===b));
      buildLayout();layoutSideMenuSync();
      toast('Legenda: '+b.querySelector('span').textContent.toLowerCase());
    });
    layoutSideMenuSync();
  };
  const openLegendItems=target=>{
    const host=target||panel;if(!host)return;
    const same=host.classList.contains('open')&&host.dataset.kind==='legenditems';
    closeQuick();if(same)return;host.dataset.kind='legenditems';
    if(sec){sec.classList.remove('layout-open');sec.classList.add('collapsed');}
    host.classList.add('open');
    const html=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const paint=()=>{
      const rows=(typeof legendControlRows==='function')?legendControlRows():[];
      const state=(typeof legendVisibilityState==='function')?legendVisibilityState():{};
      const master=document.getElementById('loLegend'),legendOn=!master||master.checked;
      const numbering=document.getElementById('loGroupNumbers'),numbered=!!numbering?.checked;
      const rawOn=key=>(typeof legendVisibilityOn==='function')?legendVisibilityOn(key,state):state[key]!==false;
      const disabled=row=>!legendOn||(row.groupKeys||[]).some(key=>!rawOn(key))||(row.parentKey&&!rawOn(row.parentKey));
      const descendants=row=>row.kind==='group'
        ? rows.filter(x=>(x.groupKeys||[]).includes(row.key))
        : row.kind==='layer'?rows.filter(x=>x.parentKey===row.key):[];
      const effective=r=>r.on&&!(r.groupKeys||[]).some(key=>!rawOn(key))&&(!r.parentKey||rawOn(r.parentKey));
      const selected=legendOn?rows.filter(effective).length:0;
      host.innerHTML='<div class="layout-legend-head"><strong>Itens da legenda</strong>'+ 
        '<span class="layout-legend-count">'+selected+' de '+rows.length+'</span></div>'+ 
        '<label class="layout-legend-row kind-group" style="border:1px solid var(--line);border-radius:8px">'+
          '<input type="checkbox" id="loLegendQuick" '+(legendOn?'checked':'')+'><span>Exibir legenda na prancha</span></label>'+ 
        '<label class="layout-legend-row kind-group"><input type="checkbox" id="loGroupNumbersQuick" '+(numbered?'checked':'')+(legendOn?'':' disabled')+'><span>Plotar números dos grupos</span></label>'+
        '<div class="hint" style="margin-top:7px">A lista contém somente as camadas e categorias visíveis no mapa. Desmarcar aqui remove apenas a linha da legenda.</div>'+ 
        '<div class="layout-legend-actions"><button type="button" class="tbtn" id="loLegendShowAll">✓ Mostrar todos</button>'+ 
          '<button type="button" class="tbtn" id="loLegendHideAll">Ocultar todos</button></div>'+ 
        '<div class="layout-legend-list">'+(rows.length?rows.map(r=>{
          const off=disabled(r),klass='layout-legend-row kind-'+r.kind+(r.groupKey?' in-group':'')+(off?' is-disabled':'');
          return '<label class="'+klass+'" style="padding-left:'+((r.depth||0)*14+8)+'px"><input type="checkbox" data-legend-key="'+encodeURIComponent(r.key)+'" '+(r.on?'checked':'')+(off?' disabled':'')+'><span>'+html(r.label)+'</span></label>';
        }).join(''):'<div class="layout-legend-empty">Nenhuma camada visível para incluir na legenda.</div>')+'</div>';
      const masterQuick=host.querySelector('#loLegendQuick');
      if(masterQuick)masterQuick.onchange=()=>{
        if(master)master.checked=masterQuick.checked;
        buildLayout();paint();layoutSideMenuSync();
      };
      const numberingQuick=host.querySelector('#loGroupNumbersQuick');
      if(numberingQuick)numberingQuick.onchange=()=>{
        if(numbering)numbering.checked=numberingQuick.checked;
        buildLayout();paint();layoutSideMenuSync();
      };
      host.querySelectorAll('[data-legend-key]').forEach(input=>{
        const key=decodeURIComponent(input.dataset.legendKey||''),r=rows.find(x=>x.key===key);if(!r)return;
        const deps=descendants(r);
        input.indeterminate=!!(r.on&&deps.length&&deps.some(x=>!x.on));
        input.onchange=()=>{
          if(typeof legendVisibilitySet==='function')legendVisibilitySet(key,input.checked,state);
          else if(input.checked)delete state[key];else state[key]=false;
          buildLayout();paint();layoutSideMenuSync();
        };
      });
      const show=host.querySelector('#loLegendShowAll'),hide=host.querySelector('#loLegendHideAll');
      if(show)show.onclick=()=>{
        rows.forEach(r=>legendVisibilitySet(r.key,true,state));if(master)master.checked=true;
        buildLayout();paint();layoutSideMenuSync();
      };
      if(hide)hide.onclick=()=>{
        rows.forEach(r=>legendVisibilitySet(r.key,false,state));
        buildLayout();paint();layoutSideMenuSync();
      };
    };
    paint();layoutSideMenuSync();
  };
  const bs=document.getElementById('btnLoScaleQuick'), bg=document.getElementById('btnLoGridQuick');
  if(bs)bs.onclick=e=>{e.stopPropagation();openQuick('scale');};
  if(bg)bg.onclick=e=>{e.stopPropagation();openQuick('grid');};
  const blp=document.getElementById('btnLoLegendPos');
  if(blp)blp.onclick=e=>{e.stopPropagation();openLegendPosition(panel);};
  const bli=document.getElementById('btnLoLegendItems');
  if(bli)bli.onclick=e=>{e.stopPropagation();openLegendItems(panel);};
  const cfg=document.getElementById('btnLoSettings');
  if(cfg)cfg.onclick=e=>{e.stopPropagation();openAdjustments(panel);};
  const fr=document.getElementById('btnLoFreeze');
  if(fr)fr.onclick=()=>{
    if(!S.loFrozen){ S.loFrozen=true; layoutFrozenCapture(); }
    else S.loFrozen=false;
    fr.classList.toggle('on',S.loFrozen);
    const lock=fr.querySelector('.lo-top-ic');if(lock)lock.innerHTML=S.loFrozen?
      '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3M12 14v2.5"/></svg>':
      '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M9 10V7a4 4 0 017-2.5M12 14v2.5"/></svg>';
    fr.title=S.loFrozen?'Layout congelado: a prancha preserva camadas e enquadramento':'Layout destravado: acompanha as camadas atuais';
    layoutSideMenuSync();
    toast(S.loFrozen?'Layout congelado':'Layout destravado');
  };
  const dup=document.getElementById('btnPlateDupTop');
  if(dup)dup.onclick=()=>{
    if(S.loMode!=='a4'){ativaPrancha('a4');toast('Abra uma prancha A4/A3 para duplicá-la');return;}
    const pl=S.plates.find(p=>p.id===S.plateId);if(pl)plateDuplicar(pl);
  };
  const ex=document.getElementById('btnLoExport'), menu=document.getElementById('loExportMenu');
  if(ex&&menu){
    ex.onclick=e=>{e.stopPropagation();closeQuick();menu.classList.toggle('open');};
    menu.querySelectorAll('[data-export]').forEach(b=>b.onclick=e=>{
      e.stopPropagation();menu.classList.remove('open');
      const ids={pdf:'btnLoPDF',png:'btnLoPNG',svg:'btnLoSVG',copy:'btnLoCopy'};
      const alvo=document.getElementById(ids[b.dataset.export]);if(alvo)alvo.click();
    });
  }
  document.addEventListener('click',e=>{
    const inside=panel&&panel.contains(e.target);
    if(!inside&&![bs,bg,blp,bli,cfg].includes(e.target))closeQuick();
    if(menu&&!menu.contains(e.target)&&e.target!==ex)menu.classList.remove('open');
  });
  layoutSideMenuSync();
})();

/* ---- modo Figura/A4 e centro (paperspace) ---- */
S.loMode='fig'; S.loPranchaFormato=null; S.loCenter=null; S._loPick=false;
setTimeout(()=>{ if(typeof syncLoBtns==='function') syncLoBtns(); },0);
document.getElementById('btnPlateAdd').onclick=()=>{
  const fmt=S.loPranchaFormato==='a3'?'a3':'a4',qtd=S.plates.filter(p=>plateFormato(p)===fmt).length,
    n=prompt('Nome da nova prancha '+fmt.toUpperCase()+':','Prancha '+fmt.toUpperCase()+' '+(qtd+1));
  if(!n||!n.trim()) return;
  plateCapture();
  const pl=plateNew(n.trim());
  plateDefineFormato(pl,fmt);
  pl.f={...pl.f}; S.plateId=pl.id; plateApply(pl); renderPlateTabs(); buildLayout();
  toast('Prancha "'+pl.name+'" criada');
};
document.getElementById('btnPlateDup').onclick=()=>{
  const cur=S.plates.find(p=>p.id===S.plateId); if(!cur) return;
  plateCapture();
  const pl=plateNew(cur.name+' (cópia)', cur);
  S.plateId=pl.id; plateApply(pl); renderPlateTabs(); buildLayout();
  toast('Prancha duplicada');
};

function syncLoBtns(){
  layoutViewControlsSync();
  const fig = S.loMode!=='a4';
  const dupTop=document.getElementById('btnPlateDupTop');
  if(dupTop)dupTop.style.display=fig?'none':'inline-flex';
  const strip=document.getElementById('loPlateStrip');
  if(strip)strip.style.display=fig?'none':'flex';
  layoutFrozenDirty(!!S._loFrozenDirty);
  const sp=document.getElementById('loSeloPaper');
  const pi=document.getElementById('loPranchaInfo');
  if(sp&&pi){
    const pn={a4p:'A4 retrato · 210 × 297 mm',a4l:'A4 paisagem · 297 × 210 mm',
      a3p:'A3 retrato · 297 × 420 mm',a3l:'A3 paisagem · 420 × 297 mm'};
    pi.textContent='Prancha '+(pn[sp.value]||sp.value.toUpperCase())+' · selo:';
  }
  const ehProp = S.loMode==='prop';
  try{ loNotaSyncBotao(); }catch(e){}
  document.getElementById('layout').classList.toggle('a4mode', !fig && !ehProp);
  if(!fig && !ehProp) platesInit();
  const bp=document.getElementById('btnModeProp');
  if(bp) bp.classList.toggle('on', ehProp);
  /* no modo Proposta o painel do layout dá lugar ao painel da proposta */
  const secL=document.getElementById('secLayout'), secP=document.getElementById('secProposta');
  if(secP){ secP.style.display = ehProp? '' : 'none'; if(ehProp && typeof propPainelSync==='function') propPainelSync(); }
  if(secL){
    secL.style.display='none';
  }
  const pbar=document.getElementById('plateBar'); if(pbar) pbar.style.display = ehProp? 'none' : '';
  document.getElementById('btnModeFig').classList.toggle('on',S.loMode==='fig');
  const seloFmt=S.loPranchaFormato || (((sp&&sp.value)||'a4p').startsWith('a3')?'a3':'a4');
  document.getElementById('btnModeA4').classList.toggle('on',S.loMode==='a4'&&seloFmt==='a4');
  document.getElementById('btnModeA3').classList.toggle('on',S.loMode==='a4'&&seloFmt==='a3');
  document.getElementById('btnLoCenter').classList.toggle('on',S._loPick);
  // largura/altura/margem/papel só existem no modo Figura — a prancha A4 é fixa
  const box=document.getElementById('loFigOnly');
  if(box){
    box.style.opacity   = fig? '1' : '.35';
    box.style.pointerEvents = fig? 'auto' : 'none';
    box.querySelectorAll('input,select').forEach(e=>{ e.disabled=!fig; });
  }
  const msg=document.getElementById('loA4Msg'); if(msg) msg.style.display=fig?'none':'';
  const pa=document.getElementById('loA4Paper'); if(pa) pa.style.display=fig?'none':'';
  // o selo (e seus dados) só existem no modo A4 — no modo Figura não aparece
  const seloBtn=document.getElementById('btnSeloCfg');
  if(seloBtn) seloBtn.style.display=fig?'none':'';
  layoutSideMenuSync();
}
/* O quadro PROJETO do selo é o mesmo texto do "Título" do layout (que também
   alimenta a cartela do modo Figura). O campo abaixo espelha esse valor para
   que TODOS os quadros do selo sejam editados numa janela só. */
function seloProjSync(){
  const t=document.getElementById('loTitle'),s=document.getElementById('loSeloProj');
  if(t&&s)s.value=t.value;
}
(function(){
  const s=document.getElementById('loSeloProj');if(!s)return;
  s.addEventListener('input',()=>{
    const t=document.getElementById('loTitle');if(!t)return;
    t.value=s.value;
    t.dispatchEvent(new Event('input',{bubbles:true})); // redesenha como se digitado no painel
  });
  const t=document.getElementById('loTitle');
  if(t)t.addEventListener('input',()=>{ // mantém os dois lados iguais
    const c=document.getElementById('loSeloProj');
    if(c&&c.value!==t.value)c.value=t.value;
  });
})();
function openSeloCfg(){ seloProjSync(); document.getElementById('seloModal').classList.add('on'); }
document.getElementById('btnSeloCfg').onclick=openSeloCfg;
document.getElementById('btnSeloCfg2').onclick=openSeloCfg;
/* Menu "◱ Elementos" — liga/desliga cada elemento da figura sem abrir o painel.
   Reaproveita os checkboxes reais (loGrid via campo, loCoords, loLegend, loCart, loSat). */
(function(){
  const btn=document.getElementById('btnLoElems'); if(!btn) return;
  let menu=null;
  const close=()=>{ if(menu){ menu.remove(); menu=null; } };
  const gEl=id=>document.getElementById(id);
  btn.onclick=(e)=>{
    e.stopPropagation();
    if(menu){ close(); return; }
    // estado atual: grade é "ligada" se o campo loGrid > 0
    const gridOn=(()=>{ const g=gEl('loGrid'); return g? (+g.value>0) : true; })();
    const cb=id=>{ const el=gEl(id); return el? el.checked : false; };
    const itens=[
      ['grid','Grade de coordenadas', gridOn],
      ['loCoords','Coordenadas nas bordas', cb('loCoords')],
      ['loCoordTop','↳ Superior', cb('loCoordTop')],
      ['loCoordBottom','↳ Inferior', cb('loCoordBottom')],
      ['loCoordLeft','↳ Lateral esquerda', cb('loCoordLeft')],
      ['loCoordRight','↳ Lateral direita', cb('loCoordRight')],
      ['loLegend','Legenda das camadas', cb('loLegend')],
      ['loGroupNumbers','Plotar números dos grupos', cb('loGroupNumbers')],
      ['loCart','Cartela / título', cb('loCart')],
      ['loSat','Mapa-base do Layout', cb('loSat')],
    ];
    const r=btn.getBoundingClientRect();
    menu=document.createElement('div'); menu.className='a3-float-menu';
    menu.style.cssText=`position:fixed;top:${r.bottom+4}px;left:${Math.max(8,r.left)}px;z-index:3200;`+
      'background:var(--panel,#151b26);border:1px solid var(--line,#2a3446);border-radius:10px;'+
      'box-shadow:0 8px 26px #000a;min-width:230px;overflow:hidden;padding:5px 0;font-size:13px';
    menu.innerHTML='<div style="padding:5px 12px 6px;font-size:11px;color:var(--ink-dim);'+
      'text-transform:uppercase;letter-spacing:.4px">Elementos da figura</div>'+
      itens.map(([id,lbl,on])=>
        `<div class="loel" data-id="${id}" style="padding:8px 12px;cursor:pointer;display:flex;`+
        `align-items:center;gap:9px"><span style="width:16px;color:var(--amber)">${on?'✓':''}</span>`+
        `<span>${lbl}</span></div>`).join('');
    document.body.appendChild(menu);
    popupFitViewport(menu,r.left,r.bottom+4,8);
    menu.querySelectorAll('.loel').forEach(row=>{
      row.onmouseenter=()=>row.style.background='var(--hover2,#1c2434)';
      row.onmouseleave=()=>row.style.background='';
      row.onclick=()=>{
        const id=row.dataset.id;
        if(id==='grid'){
          const g=gEl('loGrid'); if(g){ const on=+g.value>0;
            g.dataset.prev = on ? g.value : (g.dataset.prev||'500');
            g.value = on ? '0' : (g.dataset.prev||'500'); }
        } else { const el=gEl(id); if(el) el.checked=!el.checked; }
        try{ window.loCoordUISync&&window.loCoordUISync(); }catch(e){}
        close();
        loApplyAll();      // re-renderiza a figura com o elemento ligado/desligado
      };
    });
    setTimeout(()=>document.addEventListener('click',close,{once:true}),0);
  };
})();
document.getElementById('seloClose').onclick=()=>document.getElementById('seloModal').classList.remove('on');
document.getElementById('seloApply').onclick=()=>{document.getElementById('seloModal').classList.remove('on');
  S.loMode='a4'; syncLoBtns(); plateCapture(); buildLayout();};
document.getElementById('seloModal').addEventListener('click',e=>{if(e.target.id==='seloModal')e.target.classList.remove('on');});
// Fundo independente da prancha; a escolha do Mapa 2D permanece intacta.
document.querySelectorAll('[data-lo-basemap]').forEach(b=>b.addEventListener('click',()=>{
  document.getElementById('loBasemap').value=b.dataset.loBasemap;
  document.getElementById('loSat').checked=b.dataset.loBasemap!=='Sem fundo';
  layoutPresentationChange();
}));
document.getElementById('loSat')?.addEventListener('change',layoutViewControlsSync);
document.getElementById('btnModeFig').onclick=()=>{S.loMode='fig';syncLoBtns();buildLayout();};
{ const b=document.getElementById('btnModeProp');
  if(b) b.onclick=()=>{ S.loMode='prop'; syncLoBtns(); buildLayout(); }; }
function ativaPrancha(tamanho){
  platesInit();
  const atual=S.plates.find(p=>p.id===S.plateId)||null;
  if(atual)plateCapture();
  let alvo=atual&&plateFormato(atual)===tamanho?atual:
    S.plates.find(p=>plateFormato(p)===tamanho);
  /* O primeiro acesso a um formato cria uma prancha própria a partir da
     composição corrente. Nunca converte silenciosamente uma A4 em A3. */
  if(!alvo){
    const qtd=S.plates.filter(p=>plateFormato(p)===tamanho).length;
    alvo=plateNew('Prancha '+tamanho.toUpperCase()+' '+(qtd+1),atual);
    plateDefineFormato(alvo,tamanho);
  }
  S.plateId=alvo.id;
  plateApply(alvo);
  const papel=document.getElementById('loSeloPaper');
  S.loPranchaFormato=tamanho;
  if(papel)papel.value=alvo.f.loSeloPaper;
  S.loMode='a4';
  syncLoBtns();
  renderPlateTabs();
  buildLayout();
}
document.getElementById('btnModeA4').onclick=()=>ativaPrancha('a4');
document.getElementById('btnModeA3').onclick=()=>ativaPrancha('a3');
document.getElementById('btnLoCenter').onclick=()=>{
  if(!S._loT){ toast('Renderize o layout primeiro'); return; }
  S._loPick=!S._loPick; syncLoBtns();
  document.getElementById('sheetWrap').style.cursor=S._loPick?'crosshair':'';
  if(S._loPick) toast('Toque na folha onde deve ficar o novo centro');
};
document.getElementById('btnLoCenterReset').onclick=()=>{
  S.loCenter=null; S._loPick=false; syncLoBtns();
  document.getElementById('sheetWrap').style.cursor='';
  buildLayout(); toast('Centro automático restaurado');
};
/* ---- ARRASTAR a folha para reposicionar o centro (sem precisar do modo 🎯) ----
   Converte o deslocamento do ponteiro (px) para metros no CRS de trabalho e move
   S.loCenter no sentido contrário — a sensação é de arrastar o mapa por baixo da
   moldura. Redesenha ao vivo, com um quadro por frame (rAF) para não travar. */
(function(){
  const wrap=document.getElementById('sheetWrap');
  let dragging=false, id=null, x0=0, y0=0, c0=null, mmPerPx=1;

  const dentroDoMapa=(e)=>{
    const svgEl=wrap.querySelector('svg'); const T=S._loT;
    if(!svgEl||!T) return false;
    const r=svgEl.getBoundingClientRect();
    const mmX=(e.clientX-r.left)/r.width*T.PW, mmY=(e.clientY-r.top)/r.height*T.PH;
    mmPerPx = T.PW / r.width;                 // mm de papel por pixel de tela
    return mmX>=T.mL && mmX<=T.mL+T.mapW && mmY>=T.mT && mmY<=T.mT+T.mapH;
  };

  /* ARRASTO SEM ESPERA (14/11/2026). Antes, cada movimento reconstruía a folha
     inteira — fundo de satélite baixado de novo e ortofoto recortada na
     resolução nativa — e, com ortofoto grande, o gesto travava. Agora o
     conteúdo JÁ desenhado (#loMapContent, dentro do recorte da moldura)
     acompanha o ponteiro na hora, e a folha é refeita UMA vez, ao soltar, na
     resolução de sempre. Moldura, grade, legenda, escala e norte ficam parados
     durante o gesto e são acertados nesse redesenho.

     Cuidados (o iPad com ortofoto grande trabalha no limite de memória):
     - nenhuma referência à folha é guardada entre um quadro e outro: o grupo é
       sempre lido da tela, para a folha antiga ser liberada assim que a nova
       entra;
     - ao começar a arrastar, um redesenho ainda em andamento é descartado (o
       mapa está mudando de lugar; trocar a folha no meio do gesto interrompe
       o toque). O redesenho que vale é o do soltar — o mesmo efeito que o
       arrasto antigo tinha a cada movimento;
     - só o arrasto de UM dedo é do mapa; com dois dedos, a rolagem e o zoom
       da folha continuam do navegador;
     - um novo toque encerra um gesto que tenha ficado sem o seu "soltar". */
  const conteudo=()=>wrap.querySelector('svg #loMapContent');
  let base=[0,0], mexeu=false, dxPx=0, dyPx=0, quadro=0, gesto=0;
  const desloca=()=>{
    quadro=0;
    /* Enquanto o mapa está sendo arrastado, nenhum redesenho pode trocar a
       folha (isso interrompe o toque): os que estiverem em curso, ou que
       começarem agora, são descartados — como o arrasto antigo fazia a cada
       movimento. O que vale é o do soltar. */
    if(dragging) S._loRenderId=(S._loRenderId||0)+1;
    const el=conteudo(); if(!el) return;
    if(el._loGesto!==gesto){ base=[0,0]; el._loGesto=gesto; }   // a folha foi refeita no meio do gesto: parte do zero
    const off=[base[0]+dxPx*mmPerPx, base[1]+dyPx*mmPerPx];
    el._loOff=off;                             // um novo arrasto antes do redesenho parte daqui
    el.setAttribute('transform','translate('+off[0].toFixed(3)+' '+off[1].toFixed(3)+')');
  };

  const fim=e=>{
    if(!dragging || (e && e.pointerId!==id)) return;
    dragging=false;
    try{ wrap.releasePointerCapture(id); }catch(_){}
    wrap.style.cursor='';
    if(!mexeu) return;
    if(quadro){ cancelAnimationFrame(quadro); desloca(); }
    const T=S._loT;
    if(T){
      const dE=(dxPx*mmPerPx)/T.mmPerM;       // px -> mm -> metros de terreno
      const dN=(dyPx*mmPerPx)/T.mmPerM;
      S.loCenter=[c0[0]-dE, c0[1]+dN];        // arrastar p/ a direita => centro anda p/ a esquerda
    }
    // um único redesenho, com tudo na resolução de sempre; uma falha já é avisada pelo próprio buildLayout
    try{ const p=buildLayout(); if(p&&p.catch) p.catch(err=>{ try{ console.warn('Layout: redesenho após o arrasto',err); }catch(_){} }); }
    catch(err){ try{ console.warn('Layout: redesenho após o arrasto',err); }catch(_){} }
    if(S.loCenter) toast('Centro: E '+S.loCenter[0].toFixed(0)+' · N '+S.loCenter[1].toFixed(0));
    plateCapture && plateCapture();           // guarda o centro na prancha ativa
  };

  wrap.addEventListener('pointerdown',e=>{
    if(S._loPick) return;                     // modo 🎯 continua funcionando por clique
    if(e.button!==0 && e.pointerType==='mouse') return;
    if(dragging){
      if(e.pointerType==='touch' && e.isPrimary===false) return;   // segundo dedo: o gesto segue com o primeiro
      fim();                                  // gesto anterior que ficou sem o "soltar"
    }
    if(!S._loT || !dentroDoMapa(e)) return;
    const T=S._loT;
    dragging=true; mexeu=false; id=e.pointerId; x0=e.clientX; y0=e.clientY; dxPx=dyPx=0; gesto++;
    // centro atual (pode estar em automático: pega o do enquadramento vigente)
    c0 = S.loCenter ? S.loCenter.slice()
       : [T.x0 + (T.mapW/2)/T.mmPerM, T.y1 - (T.mapH/2)/T.mmPerM];
    { const el=conteudo(); base=(el&&el._loOff)||[0,0]; if(el) el._loGesto=gesto; }
    try{ wrap.setPointerCapture(id); }catch(_){}
    wrap.style.cursor='grabbing';
    e.preventDefault();
  });

  wrap.addEventListener('pointermove',e=>{
    if(!dragging || e.pointerId!==id || !S._loT) return;
    dxPx=e.clientX-x0; dyPx=e.clientY-y0;
    if(!mexeu){
      if(Math.hypot(dxPx,dyPx)<3) return;     // toque parado não é arrasto
      mexeu=true;
      S._loRenderId=(S._loRenderId||0)+1;     // um redesenho ainda em curso não troca a folha no meio do gesto
    }
    if(!quadro) quadro=requestAnimationFrame(desloca);
    e.preventDefault();
  });
  /* No toque de UM dedo, o gesto dentro da moldura é do mapa, não da rolagem
     da folha. Dois dedos (rolar/ampliar a folha) seguem com o navegador. */
  wrap.addEventListener('touchmove',e=>{ if(dragging&&e.touches.length===1&&e.cancelable) e.preventDefault(); },{passive:false});

  wrap.addEventListener('pointerup',fim);
  wrap.addEventListener('pointercancel',fim);
  wrap.addEventListener('lostpointercapture',e=>{ if(dragging&&e.pointerId===id) fim(e); });

  /* PAN DA VISTA DA FOLHA — botão do MEIO (ou espaço + arrastar).
     O arrasto com o botão esquerdo move o CENTRO DO MAPA e só vale dentro da
     moldura; fora dela não havia como deslocar a prancha, então inspecionar o
     selo dependia das barras de rolagem. Aqui o gesto arrasta a VISTA, sem
     tocar no enquadramento nem redesenhar: só muda a rolagem do quadro. */
  let panAtivo=false, panId=null, pxIni=0, pyIni=0, sxIni=0, syIni=0, espaco=false;
  const panPossivel=e=>(e.button===1)||(espaco&&e.button===0)||
    (e.pointerType!=='mouse'&&espaco);
  wrap.addEventListener('pointerdown',e=>{
    if(!panPossivel(e)) return;
    panAtivo=true; panId=e.pointerId;
    pxIni=e.clientX; pyIni=e.clientY;
    sxIni=wrap.scrollLeft; syIni=wrap.scrollTop;
    try{ wrap.setPointerCapture(panId); }catch(_){}
    wrap.style.cursor='grabbing';
    e.preventDefault(); e.stopPropagation();
  },true);
  wrap.addEventListener('pointermove',e=>{
    if(!panAtivo||e.pointerId!==panId) return;
    wrap.scrollLeft=sxIni-(e.clientX-pxIni);
    wrap.scrollTop =syIni-(e.clientY-pyIni);
    e.preventDefault(); e.stopPropagation();
  },true);
  const panFim=e=>{
    if(!panAtivo||(e&&e.pointerId!==panId)) return;
    panAtivo=false;
    try{ wrap.releasePointerCapture(panId); }catch(_){}
    wrap.style.cursor=espaco?'grab':'';
  };
  wrap.addEventListener('pointerup',panFim,true);
  wrap.addEventListener('pointercancel',panFim,true);
  /* O botão do meio abre "rolagem automática" no Chrome; o auxclick e o
     mousedown do botão 1 precisam ser barrados para o gesto ser nosso. */
  wrap.addEventListener('mousedown',e=>{ if(e.button===1) e.preventDefault(); });
  wrap.addEventListener('auxclick',e=>{ if(e.button===1) e.preventDefault(); });
  document.addEventListener('keydown',e=>{
    if(e.code!=='Space'||espaco) return;
    const t=document.activeElement, tag=(t&&t.tagName)||'';
    if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||(t&&t.isContentEditable)) return;
    espaco=true;
    if(wrap.matches(':hover')){ wrap.style.cursor='grab'; e.preventDefault(); }
  });
  document.addEventListener('keyup',e=>{
    if(e.code!=='Space') return;
    espaco=false; if(!panAtivo) wrap.style.cursor='';
  });

  // cursor de "agarrar" quando o ponteiro está sobre a moldura
  wrap.addEventListener('pointermove',e=>{
    if(dragging||S._loPick) return;
    wrap.style.cursor = (S._loT && dentroDoMapa(e)) ? 'grab' : '';
  });
})();

document.getElementById('sheetWrap').addEventListener('click',e=>{
  if(!S._loPick||!S._loT) return;
  const svgEl=document.querySelector('#sheetWrap svg'); if(!svgEl) return;
  const r=svgEl.getBoundingClientRect();
  const T=S._loT;
  const mmX=(e.clientX-r.left)/r.width*T.PW;
  const mmY=(e.clientY-r.top)/r.height*T.PH;
  // só dentro da moldura do mapa
  if(mmX<T.mL||mmX>T.mL+T.mapW||mmY<T.mT||mmY>T.mT+T.mapH){ toast('Toque dentro da moldura do mapa'); return; }
  const E=T.x0+(mmX-T.mL)/T.mmPerM;
  const N=T.y1-(mmY-T.mT)/T.mmPerM;
  S.loCenter=[E,N]; S._loPick=false; syncLoBtns();
  document.getElementById('sheetWrap').style.cursor='';
  buildLayout(); toast('Centro: E '+E.toFixed(0)+' · N '+N.toFixed(0));
});

document.getElementById('btnLoPNG').onclick=exportLayoutPNG;
document.getElementById('btnLoPDF').onclick=exportLayoutPDF;
(function(){ const b=document.getElementById('btnPlateDup');
  if(b) b.onclick=()=>{ const pl=S.plates.find(p=>p.id===S.plateId); if(pl) plateDuplicar(pl); }; })();
document.getElementById('btnPlatesPDF').onclick=exportLayoutPDF;
document.getElementById('btnLoCopy').onclick=copyLayoutIMG;
document.getElementById('btnLoCopyTop').onclick=copyLayoutIMG;
document.getElementById('btnLoSVG').onclick=exportLayoutSVG;

// seções colapsáveis
document.querySelectorAll('.sec>h3').forEach(h=>h.onclick=()=>h.parentElement.classList.toggle('collapsed'));

// menu mobile + painel de camadas
const mq=window.matchMedia('(max-width:720px)');
function syncMenu(){ const on=mq.matches;
  document.getElementById('btnMenu').style.display=on?'inline-flex':'none';
  document.getElementById('btnLayersToggle').style.display=on?'inline-flex':'none'; }
mq.addEventListener('change',syncMenu); syncMenu();
document.getElementById('btnMenu').onclick=()=>document.getElementById('side').classList.toggle('open');
document.getElementById('btnLayersToggle').onclick=()=>document.getElementById('right').classList.toggle('open');
document.getElementById('btnCloseRight').onclick=()=>{ if(mq.matches) document.getElementById('right').classList.remove('open'); };

document.getElementById('btnAddGroup').onclick=e=>{ e.stopPropagation(); addGroup(); };
document.getElementById('btnLayerMulti').onclick=e=>{
  e.stopPropagation();S._layerMultiOn=!S._layerMultiOn;
  if(!S._layerMultiOn)S._layerMulti.clear();
  refreshUI();layerMultiSync();
  toast(S._layerMultiOn?'Toque nas camadas ou nos grupos que deseja marcar':'Seleção múltipla de camadas encerrada');
};
document.getElementById('btnLayerMultiDel').onclick=e=>{e.stopPropagation();layerMultiDelete();};
(function(){
  const inp=document.getElementById('layerSearch'), clr=document.getElementById('layerSearchClr');
  if(!inp) return;
  inp.addEventListener('input',()=>{
    S._layerQuery=inp.value;
    clr.style.display=inp.value?'block':'none';
    refreshUI();
  });
  clr.onclick=()=>{ inp.value=''; S._layerQuery=''; clr.style.display='none'; refreshUI(); inp.focus(); };
  // Esc limpa a busca quando o foco está no campo
  inp.addEventListener('keydown',e=>{ if(e.key==='Escape'){ inp.value=''; S._layerQuery=''; clr.style.display='none'; refreshUI(); }});
})();

// arrastar-e-soltar arquivos no mapa
const mainEl=document.getElementById('main');
/* Drop em QUALQUER lugar da janela (gerenciador de arquivos, Google Files).
   O preventDefault no 'drop' é obrigatório — sem ele o navegador NAVEGA para
   o arquivo solto em vez de entregá-lo ao app (era o bug: parecia não aceitar). */
['dragenter','dragover'].forEach(ev=>document.addEventListener(ev,e=>{
  e.preventDefault(); mainEl.classList.add('dragover'); }));
document.addEventListener('dragleave',e=>{
  if(e.relatedTarget===null || e.clientX<=0 || e.clientY<=0) mainEl.classList.remove('dragover'); });
/* O mesmo evento `drop` nasce no #main e depois propaga até document. As duas
   rotas são mantidas para aceitar arquivos em toda a janela, mas somente a
   primeira pode importar o lote — caso contrário um único .shp cria duas
   camadas idênticas. A marca fica no próprio evento e não afeta novos drops. */
/* ---- arrastar PASTA ----
   O navegador entrega em dataTransfer.files apenas os arquivos SOLTOS; uma
   pasta arrastada chega vazia ali. A entrada de diretório vive em
   dataTransfer.items e só é alcançável por webkitGetAsEntry — é o que permite
   soltar a pasta do shapefile inteira em vez de caçar .shp, .dbf, .shx e .prj
   um a um. Arrastar só o .shp continua impossível, e não por escolha nossa: o
   navegador não dá à página acesso aos vizinhos do arquivo solto. */
function dropEntradas(dt){
  const items=dt&&dt.items;
  if(!items||!items.length) return null;
  const ents=[];
  for(const it of items){
    if(it.kind!=='file') continue;
    const en=it.webkitGetAsEntry&&it.webkitGetAsEntry();
    if(en) ents.push(en);
  }
  return ents.length? ents : null;
}
/* createReader entrega no máximo ~100 entradas por chamada: é preciso insistir
   até vir um lote vazio, senão pastas grandes chegam truncadas. */
function dropLeDiretorio(dir){
  return new Promise(res=>{
    const rd=dir.createReader(), out=[];
    const passo=()=>rd.readEntries(lote=>{
      if(!lote||!lote.length) return res(out);
      out.push(...lote); passo();
    }, ()=>res(out));
    passo();
  });
}
async function dropColetaArquivos(entries, prof){
  prof=prof||0;
  const files=[];
  for(const en of entries){
    if(!en) continue;
    if(en.isFile){
      const f=await new Promise(r=>en.file(r,()=>r(null)));
      if(f) files.push(f);
    }else if(en.isDirectory && prof<6){        // subpastas, com teto de segurança
      files.push(...await dropColetaArquivos(await dropLeDiretorio(en), prof+1));
    }
  }
  return files;
}
async function handleDroppedFilesOnce(e){
  if(!e || e._alagisFilesHandled) return;
  const dt=e.dataTransfer; if(!dt) return;
  /* Tudo o que depende do evento é lido AGORA, de forma síncrona: tanto a
     lista de items quanto o FileList são invalidados assim que o tratador
     retorna, e qualquer await antes daqui perderia os dois. */
  const soltos = projectCaptureDroppedFiles(dt);
  const ents   = dropEntradas(dt);
  const dirs   = (ents||[]).filter(x=>x && x.isDirectory);
  S._ultimoDrop={items:(dt.items?dt.items.length:0), entradas:(ents?ents.length:0),
                 pastas:dirs.length, soltos:soltos.length};
  /* Sem pasta no lote: caminho de sempre, intocado. */
  if(!dirs.length){
    if(!soltos.length) return;
    e._alagisFilesHandled=true;
    handleFiles(soltos);
    return;
  }
  e._alagisFilesHandled=true;
  showLoad('Lendo a pasta…');
  let files=[];
  try{ files=await dropColetaArquivos(ents); }
  catch(err){ console.warn('CCMGIS: leitura da pasta falhou',err); }
  try{ hideLoad(); }catch(_){}
  /* REDE DE SEGURANÇA: se a leitura da pasta não rendeu nada — permissão
     negada, navegador sem suporte, pasta vazia — o drop NÃO pode ser
     descartado. O que veio solto no mesmo lote ainda vale, e é importado.
     Foi exatamente esse caminho que faltou e travou o arrastar por completo. */
  if(!files.length){
    if(soltos.length){ handleFiles(soltos); return; }
    toast('Não consegui ler a pasta arrastada — arraste os arquivos de dentro dela.');
    try{ cmdLog('drop: '+JSON.stringify(S._ultimoDrop),'avisa'); }catch(_){}
    return;
  }
  const nomes=new Set(files.map(f=>f.name));
  toast(`${nomes.size} arquivo(s) na pasta — importando`);
  handleFiles(files);
}
document.addEventListener('drop',e=>{
  e.preventDefault(); mainEl.classList.remove('dragover');
  handleDroppedFilesOnce(e);
});
['dragenter','dragover'].forEach(ev=>mainEl.addEventListener(ev,e=>{e.preventDefault();mainEl.classList.add('dragover');}));
['dragleave','drop'].forEach(ev=>mainEl.addEventListener(ev,e=>{e.preventDefault();mainEl.classList.remove('dragover');}));
mainEl.addEventListener('drop',e=>{ e.preventDefault(); mainEl.classList.remove('dragover');
  handleDroppedFilesOnce(e); });



/* ---------- Alternar fundo satélite ⇄ OSM (chamado após initMap) ---------- */
function initBaseToggle(){
  const btn=document.getElementById('btnBaseToggle');
  let lastSat='Satélite (Google)';
  function refresh(){
    const cur=S.getBase?S.getBase():'Satélite (Google)';
    const onOSM = cur==='Ruas (OSM)';
    btn.textContent = onOSM ? '🛰' : '🗺';
    btn.title = onOSM ? 'Fundo: OSM · tocar p/ Satélite' : 'Fundo: Satélite · tocar p/ OSM';
    btn.classList.toggle('on', onOSM);
    if(!onOSM && /Sat|Híbrido/.test(cur)) lastSat=cur;
  }
  btn.onclick=()=>{
    if(!S.setBase) return;
    const cur=S.getBase();
    if(cur==='Ruas (OSM)') S.setBase(lastSat);
    else { if(/Sat|Híbrido/.test(cur)) lastSat=cur; S.setBase('Ruas (OSM)'); }
    refresh();
    toast('Fundo: '+S.getBase());
  };
  map.on('baselayerchange',refresh);
  refresh();
}
