/* ============================================================================
   MÓDULO 3D — visualização de terreno (Three.js)
   - Malha do MDT com exagero vertical ajustável
   - Drape automático: se houver imagem RGB posicionada (S.img) que intersecte
     o MDT, ela é colada no terreno; senão, cores hipsométricas por vértice
   - Camadas vetoriais (linhas/polígonos) drapejadas sobre a superfície
   - Controles orbitais próprios (arrastar = orbitar; roda = zoom;
     botão direito ou Shift = pan; toque: 1 dedo orbita, 2 dedos zoom/pan)
   ========================================================================== */
const THREE_CDNS=[
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
  'https://unpkg.com/three@0.128.0/build/three.min.js'];
function ensureThree(){
  if(window.THREE) return Promise.resolve();
  if(S._three) return S._three;
  S._three=(async()=>{
    const falhas=[];
    for(const url of THREE_CDNS){
      const host=(url.match(/https?:\/\/([^/]+)/)||[])[1]||url;
      try{
        await new Promise((res,rej)=>{
          const sc=document.createElement('script');
          const to=setTimeout(()=>rej(new Error('timeout (10s)')), 10000);
          sc.src=url;
          sc.onload=()=>{ clearTimeout(to); res(); };
          sc.onerror=()=>{ clearTimeout(to); rej(new Error('bloqueado/offline')); };
          document.head.appendChild(sc);
        });
        if(window.THREE){ S._threeHost=host; return; }
        falhas.push(host+': carregou mas THREE ausente');
      }catch(e){ falhas.push(host+': '+e.message); }
    }
    S._threeFalhas=falhas;
    throw new Error('Motor 3D não carregou. Tentativas:\n• '+falhas.join('\n• '));
  })();
  return S._three;
}

const V3={scene:null,cam:null,ren:null,root:null,raf:0,
  // câmera orbital: alvo + esférica
  tgt:[0,0,0], radius:1000, theta:Math.PI/4, phi:Math.PI/4,
  meshes:[], size:1,topNorth:false,centerPickOn:false};

/* Um bitmap original usa a grade do GeoTIFF; a prévia salva pode estar em
   Web Mercator. As coordenadas UV precisam acompanhar o CRS do BITMAP, tanto
   no TIN quanto na grade do MDT e nos vértices projetados sobre um recorte. */
function v3OrthoTextureInfo(I,workCRS){
  if(!I||!I.url||!Array.isArray(I.b)||I.b.length<4)return null;
  workCRS=workCRS||S.workCRS;
  const sourceCRS=typeof orthoCRS==='function'?orthoCRS(I):(I._crsFixo||I._sourceCRS||workCRS);
  let url=I._workPreviewURL||I.url,crs=sourceCRS,b=I.b.slice();
  try{
    if(!I._workPreviewURL&&I._warpWM){
      const ll=I._llbounds;
      if(!Array.isArray(ll)||!Array.isArray(ll[0])||!Array.isArray(ll[1]))return null;
      const sw=reproj('EPSG:4326','EPSG:3857',+ll[0][1],+ll[0][0]);
      const ne=reproj('EPSG:4326','EPSG:3857',+ll[1][1],+ll[1][0]);
      b=[sw[0],sw[1],ne[0],ne[1]];crs='EPSG:3857';
    }
    if(!b.every(Number.isFinite)||b[2]<=b[0]||b[3]<=b[1])return null;
    let workBounds=b.slice();
    if(crs!==workCRS){
      workBounds=[Infinity,Infinity,-Infinity,-Infinity];
      // O envelope precisa dos quatro lados: só a diagonal perde a rotação
      // da grade e pode rejeitar um MDT que intersecta a borda da ortofoto.
      for(let i=0;i<=16;i++){
        const t=i/16;
        for(const p of [[b[0]+t*(b[2]-b[0]),b[1]],[b[0]+t*(b[2]-b[0]),b[3]],
          [b[0],b[1]+t*(b[3]-b[1])],[b[2],b[1]+t*(b[3]-b[1])]]){
          const q=reproj(crs,workCRS,p[0],p[1]);
          if(!q||!q.every(Number.isFinite))return null;
          workBounds[0]=Math.min(workBounds[0],q[0]);workBounds[1]=Math.min(workBounds[1],q[1]);
          workBounds[2]=Math.max(workBounds[2],q[0]);workBounds[3]=Math.max(workBounds[3],q[1]);
        }
      }
    }
    const sx=1/(b[2]-b[0]),sy=1/(b[3]-b[1]);
    const writeUV=(X,Y,out,offset=0)=>{
      const q=crs===workCRS?null:reproj(workCRS,crs,X,Y);
      out[offset]=((q?q[0]:X)-b[0])*sx;
      out[offset+1]=((q?q[1]:Y)-b[1])*sy;
      return out;
    };
    return {url,crs,b,workBounds,writeUV};
  }catch(e){console.warn('georreferência da ortofoto 3D:',e&&e.message||e);return null;}
}

/* A altura do pixel pode diferir da largura após uma redução da grade. */
function v3RasterCellY(d,row){return d.yll+(d.nr-row-0.5)*(d.csy||d.cs);}

function v3ApplyCam(){
  if(!V3.cam || !V3.tgt) return;          // cena ainda não montada: nada a aplicar
  if(window.GeoMineBlastingPresentation?.applyPlanCamera(V3))return;
  const {tgt,radius,theta,phi}=V3;
  if(V3.topNorth){
    /* Planta cartográfica verdadeira: E à direita e Norte para cima. Como N
       é armazenado em -Z na cena, o vetor "up" da câmera precisa ser -Z. */
    V3.cam.up.set(0,0,-1);
    V3.cam.position.set(tgt[0],tgt[1]+radius,tgt[2]);
    V3.cam.lookAt(tgt[0],tgt[1],tgt[2]);
    return;
  }
  V3.cam.up.set(0,1,0);
  // pode orbitar até QUASE por baixo: phi negativo = câmera abaixo do alvo
  // (as malhas são DoubleSide, então o avesso da superfície é visível)
  const sp=Math.max(-(Math.PI/2-0.01), Math.min(Math.PI/2-0.01, phi));
  V3.phi=sp;
  const x=tgt[0]+radius*Math.cos(sp)*Math.cos(theta);
  const y=tgt[1]+radius*Math.sin(sp);
  const z=tgt[2]+radius*Math.cos(sp)*Math.sin(theta);
  V3.cam.position.set(x,y,z);
  V3.cam.lookAt(tgt[0],tgt[1],tgt[2]);
}
/* Controles comuns às abas Visão 3D e Mina. O pivô é calculado somente com
   objetos visíveis, portanto centralizar respeita as camadas que o usuário
   ligou/desligou e não volta para a extensão de uma superfície oculta. */
function v3VisibleBounds(){
  if(!window.THREE||!V3.scene)return null;
  const box=new THREE.Box3(), tmp=new THREE.Box3();
  let tem=false;
  V3.scene.updateMatrixWorld(true);
  V3.scene.traverse(o=>{
    if(!o.visible||(!o.isMesh&&!o.isLine&&!o.isLineSegments&&!o.isPoints)||
       !o.geometry||!o.geometry.attributes||!o.geometry.attributes.position)return;
    try{
      if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
      if(!o.geometry.boundingBox)return;
      tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      if(!tem){box.copy(tmp);tem=true;}else box.union(tmp);
    }catch(e){}
  });
  return tem&&!box.isEmpty()?box:null;
}
function v3CentralizarRotacao(ajustarDistancia){
  const box=v3VisibleBounds();
  if(!box){toast('Exiba uma superfície ou camada vetorial primeiro');return false;}
  const c=box.getCenter(new THREE.Vector3()), sz=box.getSize(new THREE.Vector3());
  V3.tgt=[c.x,c.y,c.z];
  V3.size=Math.max(sz.x,sz.y,sz.z,10);
  if(ajustarDistancia)V3.radius=Math.max(V3.size*1.05,10);
  /* o zoom na camada pode ter aproximado o plano próximo; no conjunto volta
     ao padrão de 1 m, que preserva a precisão de profundidade de longe */
  if(ajustarDistancia&&V3.cam&&V3.cam.near!==1){V3.cam.near=1;V3.cam.updateProjectionMatrix();}
  v3ApplyCam();
  return true;
}
/* ZOOM NA CAMADA ATIVA: enquadra só os objetos da cena que pertencem à camada
   selecionada na árvore — layerId nos vetores e malhas, rasterId nas
   superfícies quando o selecionado é um MDT/raster. Ajusta também V3.size à
   camada: a roda limita o raio a 0,02–20 × V3.size, e com a escala do MDT
   inteiro não se aproximava de uma estrutura de poucos metros. Vista em planta
   e as laterais devolvem a escala do conjunto visível. */
function v3ZoomCamadaAtiva(){
  if(!window.THREE||!V3.scene||!V3.cam){toast('Abra a Visão 3D e monte a cena primeiro');return false;}
  const L=typeof activeLayer==='function'?activeLayer():null;
  const rid=S.selRaster&&(S.selRaster.id??S.selRaster);
  const R=L?null:(S.rasters||[]).find(r=>String(r.id)===String(rid));
  if(!L&&!R){toast('Selecione uma camada na árvore para dar zoom nela');return false;}
  const nome=(L||R).name||'camada',chave=L?'layerId':'rasterId',id=String((L||R).id);
  const box=new THREE.Box3(),tmp=new THREE.Box3();let tem=false;
  V3.scene.updateMatrixWorld(true);
  V3.scene.traverse(o=>{
    const u=o.userData;if(!u||u[chave]==null||String(u[chave])!==id)return;
    o.traverse(c=>{
      const g=c.geometry;if(!g||!g.attributes||!g.attributes.position)return;
      for(let p=c;p;p=p.parent)if(p.visible===false)return;
      try{
        if(!g.boundingBox)g.computeBoundingBox();
        if(!g.boundingBox||g.boundingBox.isEmpty())return;
        tmp.copy(g.boundingBox).applyMatrix4(c.matrixWorld);
        if(tem)box.union(tmp);else{box.copy(tmp);tem=true;}
      }catch(e){}
    });
  });
  if(!tem||box.isEmpty()){toast('"'+nome+'" não aparece na cena 3D. Ligue a camada na árvore e atualize a cena.');return false;}
  const c=box.getCenter(new THREE.Vector3()),sz=box.getSize(new THREE.Vector3());
  const vfov=(V3.cam.fov||55)*Math.PI/180,hfov=2*Math.atan(Math.tan(vfov/2)*(V3.cam.aspect||1));
  const raio=0.5*Math.max(Math.hypot(sz.x,sz.y,sz.z),1);
  V3.tgt=[c.x,c.y,c.z];
  V3.size=Math.max(sz.x,sz.y,sz.z,2);
  V3.radius=Math.max(raio/Math.sin(Math.min(vfov,hfov)/2)*1.1,1);
  // de muito perto o plano próximo fixo (1 m) cortaria a própria camada
  const near=Math.min(1,Math.max(0.05,V3.radius*0.01));
  if(V3.cam.near!==near){V3.cam.near=near;V3.cam.updateProjectionMatrix();}
  v3ApplyCam();
  toast('Zoom na camada "'+nome+'"');
  return true;
}
function v3VistaPlanta(){
  if(!v3CentralizarRotacao(true))return;
  V3.topNorth=true;
  v3LinhasSempreVisiveis(false);
  v3ApplyCam();
  toast('Vista em planta · norte para cima');
}
/* LINHAS QUE NÃO SOMEM NA VISTA LATERAL.
   De perfil a câmera fica quase no plano das linhas de projeto, que são
   desenhadas rentes à superfície; elas perdem a disputa de profundidade com o
   próprio terreno e desaparecem em trechos inteiros. Nas vistas laterais o
   grupo de vetores passa a ser desenhado POR CIMA (sem teste de profundidade e
   por último), então crista, pé, berma e interseção continuam legíveis.
   Ao voltar para planta ou órbita o comportamento normal é restaurado — ali a
   oclusão é informação útil, e não queremos linha do outro lado do morro
   aparecendo por cima. */
function v3LinhasSempreVisiveis(lig){
  const g=V3&&V3.vecGroup;
  if(!g)return false;
  g.renderOrder=lig?999:0;
  g.traverse(o=>{
    const ms=o&&o.material?(Array.isArray(o.material)?o.material:[o.material]):[];
    ms.forEach(m=>{
      if(!m)return;
      if(m._v3DepthTest===undefined)m._v3DepthTest=m.depthTest!==false;
      m.depthTest=lig?false:m._v3DepthTest;
      m.needsUpdate=true;
    });
    if(o&&o.isLine||o&&o.isLineSegments)o.renderOrder=lig?999:0;
  });
  return true;
}
/* lado: 'L' (esquerda, olhando de oeste) ou 'R' (direita, olhando de leste) */
function v3VistaLateral(lado){
  if(!v3CentralizarRotacao(true))return;
  V3.topNorth=false;
  V3.phi=0;                                   // horizonte
  V3.theta=(lado==='R')?0:Math.PI;            // +X = leste; −X = oeste
  v3LinhasSempreVisiveis(true);
  v3ApplyCam();
  toast(lado==='R'?'Vista lateral direita · olhando de leste'
                  :'Vista lateral esquerda · olhando de oeste');
}
document.getElementById('btnV3SideL')?.addEventListener('click',()=>v3VistaLateral('L'));
document.getElementById('btnV3SideR')?.addEventListener('click',()=>v3VistaLateral('R'));
document.getElementById('btnV3CenterRotation')?.addEventListener('click',()=>{
  V3.centerPickOn=true;
  toast('Centralizar rotação: clique no ponto desejado do modelo');
});
document.getElementById('btnV3TopView')?.addEventListener('click',v3VistaPlanta);
document.getElementById('btnV3ZoomLayer')?.addEventListener('click',v3ZoomCamadaAtiva);
/* Cada aba manda na própria cena: no 3D veem-se as superfícies; na Cubagem,
   o sólido/blocos, com as superfícies só se a opção estiver marcada. Antes as
   duas abas dividiam o mesmo estado e a superfície “vazava” de uma para outra. */
/* CENA ÚNICA: não há mais "aba" 3D com regras próprias de visibilidade.
   Superfícies, vetores e sólidos convivem na mesma cena e quem manda é a
   árvore de camadas — o que está ligado aparece, o que está desligado não. */
function v3AbaSync(aba){
  if(!V3.scene) return;
  (V3.meshes||[]).forEach(m=>{ m.visible = true; });
  if(V3.cubGroup) V3.cubGroup.visible = true;
  if(V3.vecGroup) V3.vecGroup.visible = true;
  V3.aba='v3d';
}
function v3Bind(el){
  let mode=0, px=0, py=0, pinch=0;
  let touchCount=0,pinchX=0,pinchY=0;
  const panScreen=(dx,dy)=>{
    if(!V3.cam||!window.THREE)return;
    const k=V3.radius*.0016,dir=new THREE.Vector3(...V3.tgt).sub(V3.cam.position).normalize(),
      right=new THREE.Vector3().crossVectors(dir,new THREE.Vector3(0,1,0));
    if(right.lengthSq()<1e-10)right.set(1,0,0);else right.normalize();
    const up=new THREE.Vector3().crossVectors(right,dir);
    V3.tgt[0]+=(-dx*right.x+dy*up.x)*k;V3.tgt[1]+=(-dx*right.y+dy*up.y)*k;V3.tgt[2]+=(-dx*right.z+dy*up.z)*k;
  };
  const spd=0.008;
  el.addEventListener('contextmenu',e=>e.preventDefault());
  el.addEventListener('auxclick',e=>{ if(e.button===1) e.preventDefault(); });
  el.addEventListener('mousedown',e=>{ if(e.button===1) e.preventDefault(); });  // evita auto-scroll
  let dn=[0,0],activePointer=null,clickButton=null,moved=false;
  el.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch'&&!e.isPrimary){mode=0;activePointer=null;clickButton=null;moved=true;return;}
    if(activePointer!==null){moved=true;return;}
    activePointer=e.pointerId;clickButton=e.button;moved=false;
    el.setPointerCapture(e.pointerId);
    // botão do MEIO (1) = pan · DIREITO (2) = órbita · esquerdo (0) = órbita
    // Shift + arrasto continua funcionando como pan (atalho de teclado).
    mode=(e.button===1||e.shiftKey||(e.pointerType!=='mouse'&&window.GeoMineTouchWorkspace?.pan3D))? 2 : 1;
    px=e.clientX; py=e.clientY; dn=[e.clientX,e.clientY];
  });
  el.addEventListener('pointerup',e=>{
    if(e.pointerId!==activePointer)return;
    const pick=clickButton===0&&!moved&&!e.shiftKey&&Math.hypot(e.clientX-dn[0],e.clientY-dn[1])<6;
    activePointer=null;clickButton=null;
    mode=0;
    if(V3.centerPickOn && pick){
      v3PickPivot(e.clientX,e.clientY);
      return;
    }
    // toque parado (<6 px) com a medição ligada = marcar ponto
    if(V3.measOn && pick)
      v3MeasPick(e.clientX, e.clientY);
  });
  const cancel=()=>{mode=0;activePointer=null;clickButton=null;moved=true;};
  el.addEventListener('pointercancel',cancel);el.addEventListener('lostpointercapture',cancel);
  el.addEventListener('pointermove',e=>{
    if(touchCount>1)return;
    if(!mode||e.pointerId!==activePointer) return;
    if(Math.hypot(e.clientX-dn[0],e.clientY-dn[1])>=6)moved=true;
    if((V3.measOn||V3.centerPickOn)&&clickButton===0&&!moved)return;
    const dx=e.clientX-px, dy=e.clientY-py; px=e.clientX; py=e.clientY;
    if(mode===1&&!V3.cam?._blastingPlan){ V3.topNorth=false;try{v3LinhasSempreVisiveis(false);}catch(e){}
      V3.theta+=dx*spd; V3.phi+=dy*spd; }
    else{ // PAN no plano da tela, pelos eixos REAIS da câmera: a cena
          // ACOMPANHA o mouse (agarrar o terreno), em qualquer órbita —
          // a trigonometria manual antiga invertia o sentido do arrasto
      if(!V3.cam || !window.THREE){ v3ApplyCam(); return; }
      const k=V3.radius*0.0016;
      const dir=new THREE.Vector3(V3.tgt[0],V3.tgt[1],V3.tgt[2])
        .sub(V3.cam.position).normalize();
      const right=new THREE.Vector3().crossVectors(dir,new THREE.Vector3(0,1,0));
      if(right.lengthSq()<1e-10) right.set(1,0,0); else right.normalize();
      const upS=new THREE.Vector3().crossVectors(right,dir);
      V3.tgt[0]+=(-dx*right.x + dy*upS.x)*k;
      V3.tgt[1]+=(-dx*right.y + dy*upS.y)*k;
      V3.tgt[2]+=(-dx*right.z + dy*upS.z)*k;
    }
    v3ApplyCam();
  });
  el.addEventListener('wheel',e=>{
    e.preventDefault();
    V3.radius*=Math.pow(1.0015,e.deltaY);
    V3.radius=Math.max(V3.size*0.02, Math.min(V3.size*20, V3.radius));
    v3ApplyCam();
  },{passive:false});
  // toque: 2 dedos = pinça (zoom)
  el.addEventListener('touchstart',e=>{
    touchCount=e.touches.length;
    if(e.touches.length===2){
      mode=0;activePointer=null;clickButton=null;moved=true;
      pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,
                       e.touches[0].clientY-e.touches[1].clientY);
      pinchX=(e.touches[0].clientX+e.touches[1].clientX)/2;
      pinchY=(e.touches[0].clientY+e.touches[1].clientY)/2;
    }
  },{passive:true});
  el.addEventListener('touchmove',e=>{
    if(e.touches.length===2 && pinch){
      e.preventDefault();
      const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,
                         e.touches[0].clientY-e.touches[1].clientY);
      if(d>0)V3.radius*=pinch/d; pinch=d;
      V3.radius=Math.max(V3.size*0.02, Math.min(V3.size*20, V3.radius));
      const x=(e.touches[0].clientX+e.touches[1].clientX)/2,y=(e.touches[0].clientY+e.touches[1].clientY)/2;
      panScreen(x-pinchX,y-pinchY);pinchX=x;pinchY=y;
      v3ApplyCam();
    }
  },{passive:false});
  const touchEnd=e=>{touchCount=e.touches.length;if(touchCount<2)pinch=0;};
  el.addEventListener('touchend',touchEnd,{passive:true});el.addEventListener('touchcancel',touchEnd,{passive:true});
}

const HYPSO=[[0.00,0x276419],[0.25,0x7fbc41],[0.45,0xe6d97a],
             [0.65,0xc8813e],[0.85,0x8c5a3a],[1.00,0xf7f7f7]];
/* Rampa para SÓLIDOS: a hipsométrica do relevo termina em branco, o que
   deixava o corpo lavado e sem leitura de forma. Esta fica em tons de rocha,
   do fundo escuro ao topo claro, sem estourar.                             */
const SOL_RAMP=[[0.00,0x4a2d18],[0.30,0x8a5a2b],[0.60,0xc08a4a],[0.85,0xd9ab74],[1.00,0xe8c79a]];
function solColor(t){
  t=Math.max(0,Math.min(1,t||0));
  for(let i=1;i<SOL_RAMP.length;i++){
    if(t<=SOL_RAMP[i][0]){
      const [t0,c0]=SOL_RAMP[i-1], [t1,c1]=SOL_RAMP[i];
      const f=(t-t0)/Math.max(1e-6,t1-t0);
      const r=((c0>>16&255)+((c1>>16&255)-(c0>>16&255))*f)/255;
      const g=((c0>>8&255)+((c1>>8&255)-(c0>>8&255))*f)/255;
      const b=((c0&255)+((c1&255)-(c0&255))*f)/255;
      return [r,g,b];
    }
  }
  const c=SOL_RAMP[SOL_RAMP.length-1][1];
  return [(c>>16&255)/255,(c>>8&255)/255,(c&255)/255];
}
function hexToRGB01(hex){
  const h=(hex||'#8d5524').replace('#','');
  return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255];
}
/* Cota vetorial: primeiro a geometria/ZG, depois um atributo altimétrico
   conhecido. Isso cobre SHP 3D, DXF 3D e arquivos tabulares que guardam a
   cota em campo, sem depender de um MDT. */
function v3AtributoZ(f){
  const p=(f&&f.props)||{};
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9]/g,'');
  const prefer=['Z','COTA','COTASUP','ELEVACAO','ELEVATION','ELEV','ALTITUDE','ALTIMETRIA','RL','NIVEL'];
  const ks=Object.keys(p);
  for(const alvo of prefer){
    const k=ks.find(x=>norm(x)===alvo);
    if(k!=null){
      const v=Number(String(p[k]).replace(',','.'));
      if(isFinite(v))return v;
    }
  }
  return null;
}
/* Extensão das camadas vetoriais. Com Z próprio, a cena preserva a altitude
   real. Sem Z, o vetor continua válido e é exibido num plano local Z=0.
   Assim Visão 3D e Mina funcionam somente com vetores, sem MDT obrigatório. */
function v3VectorExtent(){
  const e={xmin:Infinity,ymin:Infinity,zmin:Infinity,
    xmax:-Infinity,ymax:-Infinity,zmax:-Infinity,n:0,n3:0,n2:0};
  const add=(L,p,z,temZ)=>{
    if(!p||p.length<2)return;
    const q=reproj(L.crs,S.workCRS,+p[0],+p[1]);
    if(!isFinite(q[0])||!isFinite(q[1]))return;
    if(!isFinite(z))z=0;
    e.xmin=Math.min(e.xmin,q[0]);e.xmax=Math.max(e.xmax,q[0]);
    e.ymin=Math.min(e.ymin,q[1]);e.ymax=Math.max(e.ymax,q[1]);
    e.zmin=Math.min(e.zmin,+z);e.zmax=Math.max(e.zmax,+z);e.n++;
    if(temZ)e.n3++;else e.n2++;
  };
  const scan=(L,g,z)=>{
    if(!Array.isArray(g))return;
    if(g.length>=2&&isFinite(g[0])&&isFinite(g[1])){
      const zg=isFinite(z)?+z:(g.length>2&&isFinite(g[2])?+g[2]:NaN);
      add(L,g,isFinite(zg)?zg:0,isFinite(zg));
      return;
    }
    g.forEach((q,i)=>scan(L,q,Array.isArray(z)?z[i]:z));
  };
  (S.layers||[]).forEach(L=>{
    if(!['line','polygon','point'].includes(L.gtype))return;
    // A NoData marker has XY only. Never manufacture its Z from the display
    // mesh or from the legacy vector-only zero plane.
    if(L._blasting?.role==='nodata')return;
    const on=(L.visible!==false);   /* a árvore manda, sem marcação paralela */
    if(!on)return;
    (L.features||[]).forEach(f=>{
      if(L.gtype==='point'){scan(L,f.geom,(f.zg!=null)?f.zg:v3AtributoZ(f));return;}
      const nested=!!(f.multi&&Array.isArray(f.geom&&f.geom[0]&&f.geom[0][0])),
        rings=nested?f.geom:[f.geom];
      rings.forEach((ring,ri)=>{
        const zr=typeof resolveFeatureZRing==='function'?
          resolveFeatureZRing(f,ring,ri,nested,true):null;
        scan(L,ring,zr||v3AtributoZ(f));
      });
    });
  });
  const meshes=window.GeoMineGeology?.meshViews?.extent3D();
  if(meshes){
    for(const k of ['xmin','ymin','zmin'])e[k]=Math.min(e[k],meshes[k]);
    for(const k of ['xmax','ymax','zmax'])e[k]=Math.max(e[k],meshes[k]);
    e.n+=meshes.n;e.n3+=meshes.n3;
  }
  return e.n?e:null;
}
function hypsoColor(t){
  for(let i=1;i<HYPSO.length;i++){
    if(t<=HYPSO[i][0]){
      const [t0,c0]=HYPSO[i-1],[t1,c1]=HYPSO[i];
      const f=(t-t0)/(t1-t0);
      const r0=(c0>>16)&255,g0=(c0>>8)&255,b0=c0&255;
      const r1=(c1>>16)&255,g1=(c1>>8)&255,b1=c1&255;
      return [(r0+f*(r1-r0))/255,(g0+f*(g1-g0))/255,(b0+f*(b1-b0))/255];
    }
  }
  return [1,1,1];
}

function v3SampleZ(d,x,y){ // cota da superfície usada pela cena 3D
  /* O 2D, os perfis e a interseção amostram a face TIN exata quando ela
     existe. O 3D precisa usar a mesma superfície matemática; cair na grade
     de exibição deslocava os vetores das breaklines em TINs Surpac/Deswik. */
  /* Não mantenha uma segunda implementação da interpolação aqui. Mesmo uma
     diferença de convenção de linha/centro de célula faz o recortador 3D
     eliminar os últimos metros de uma breakline que, no dado, termina
     exatamente em Zprojeto = ZMDT. */
  return typeof sampleZbil==='function'?sampleZbil(d,x,y):NaN;
}

/* ---------------- Medição 3D (snap em terreno e vetores) ----------------
   Pontos em coordenadas locais da cena; a conversão inversa usa OX/OY/z0/VE
   guardados no build: E=x+OX · N=−z+OY · z_real=y/VE+z0.
   As medidas são REAIS (o exagero e a altura apenas visual dos vetores são
   desfeitos na conversão).                                                 */
V3.measOn=false; V3.measPts=[]; V3.measObjs=[];
function v3MeasOverlay(text){
  const wrap=document.getElementById('v3dCanvasWrap');if(!wrap)return;
  let panel=document.getElementById('v3MeasFloating');
  if(!panel){panel=document.createElement('div');panel.id='v3MeasFloating';panel.style.cssText='position:absolute;right:12px;bottom:12px;z-index:1300;max-width:min(510px,85%);max-height:40%;overflow:auto;padding:10px;background:var(--panel);color:var(--ink);border:1px solid var(--amber);border-radius:8px;font-size:12px;box-shadow:0 2px 12px #0005';
    panel.innerHTML='<div style="display:flex;gap:8px;align-items:center"><b style="flex:1">Medição 3D · coordenadas reais</b><button type="button" data-clear>Limpar</button><button type="button" data-exit>Sair</button></div><div data-result style="white-space:pre-wrap;margin-top:6px" role="status"></div>';
    panel.querySelector('[data-clear]').onclick=()=>v3MeasClear(false);panel.querySelector('[data-exit]').onclick=()=>{if(V3.measOn)v3MeasToggle();};wrap.appendChild(panel);
  }
  panel.style.display=V3.measOn?'block':'none';
  if(text!=null)panel.querySelector('[data-result]').textContent=text;
}
function v3MeasClear(silent){
  (V3.measObjs||[]).forEach(o=>{ if(V3.scene) V3.scene.remove(o);
    if(o.geometry)o.geometry.dispose(); if(o.material)o.material.dispose(); });
  V3.measObjs=[]; V3.measPts=[];V3.measLine=null;
  const out=document.getElementById('v3MeasOut');
  if(out) out.textContent='Nenhuma medição.';
  v3MeasOverlay('Clique no primeiro ponto do terreno ou vetor.');
}
function v3MeasToggle(){
  V3.measOn=!V3.measOn;
  v3MeasOverlay(document.getElementById('v3MeasOut')?.textContent||'Clique no primeiro ponto.');
  const b=document.getElementById('btnV3Meas');
  if(b) b.style.background=V3.measOn?'var(--amber)':'', b.style.color=V3.measOn?'#1a1206':'';
  toast(V3.measOn?'Medição 3D: toque no terreno ou vetor (toque de novo no 📏 para sair)':'Medição 3D desligada');
}
function v3SceneScale(){
  // raio dos marcadores proporcional à cena
  if(!V3.meshes||!V3.meshes.length) return 5;
  const bb=new THREE.Box3(); V3.meshes.forEach(m=>bb.expandByObject(m));
  const s=bb.getSize(new THREE.Vector3());
  return Math.max(2, Math.max(s.x,s.z)/220);
}
/* Snap vetorial em espaço de TELA. O Raycaster do Three usa tolerância em
   unidades da cena para linhas, que muda muito com o zoom. Projetando cada
   vértice/segmento para pixels, os mesmos 15 px do snap 2D valem em qualquer
   distância da câmera. Vértices têm prioridade; fora deles usa o ponto mais
   próximo do segmento 3D. */
function v3MeasVectorSnap(clientX,clientY,tolPx=15){
  if(!V3.vecGroup||!V3.vecGroup.visible||!V3.cam||!V3.ren)return null;
  const box=V3.ren.domElement.getBoundingClientRect();
  const W=box.width,H=box.height;
  if(!W||!H)return null;
  V3.vecGroup.updateMatrixWorld(true);
  const toScreen=p=>{
    const q=p.clone().project(V3.cam);
    return {x:box.left+(q.x+1)*W/2,y:box.top+(1-q.y)*H/2,z:q.z,w:V3.cam.isPerspectiveCamera?-p.clone().applyMatrix4(V3.cam.matrixWorldInverse).z:1};
  };
  const a=new THREE.Vector3(),b=new THREE.Vector3();
  let bestV=null,bestS=null,dv=tolPx*tolPx,ds=tolPx*tolPx;
  V3.vecGroup.traverse(o=>{
    if(!o.visible||!o.userData||!o.userData.alagisVector||o.userData.measurementDecoration||!o.geometry)return;
    for(let parent=o.parent;parent;parent=parent.parent)if(!parent.visible)return;
    const at=o.geometry.getAttribute('position'); if(!at)return;
    const points=o.userData.measurePoints||o.userData.alagisRibbon?.points;
    const n=points?points.length:at.count;
    const pointAt=(v,i)=>{if(points)v.copy(points[i]);else v.fromBufferAttribute(at,i);return v.applyMatrix4(o.matrixWorld);};
    const realZ=i=>points?.[i]?._v3RealZ;
    for(let i=0;i<n;i++){
      pointAt(a,i);
      const sa=toScreen(a);
      if(sa.z>=-1&&sa.z<=1){
        const d=(sa.x-clientX)**2+(sa.y-clientY)**2;
        if(d<dv){dv=d;bestV={point:a.clone(),realZ:realZ(i),object:o,kind:'vértice vetorial'};}
      }
      if((!o.isLine&&!o.userData.alagisRibbon)||i>=n-1||(o.isLineSegments&&i%2===1))continue;
      pointAt(b,i+1);
      const sb=toScreen(b);
      if(sa.z<-1||sa.z>1||sb.z<-1||sb.z>1||sa.w<=0||sb.w<=0)continue;
      const dx=sb.x-sa.x,dy=sb.y-sa.y,den=dx*dx+dy*dy;
      let t=den?((clientX-sa.x)*dx+(clientY-sa.y)*dy)/den:0;
      t=Math.max(0,Math.min(1,t));
      const qx=sa.x+t*dx,qy=sa.y+t*dy;
      const d=(qx-clientX)**2+(qy-clientY)**2;
      const worldT=t*sa.w/((1-t)*sb.w+t*sa.w);
      if(d<ds){ds=d;bestS={point:a.clone().lerp(b,worldT),realZ:Number.isFinite(realZ(i))&&Number.isFinite(realZ(i+1))?realZ(i)+(realZ(i+1)-realZ(i))*worldT:undefined,object:o,kind:'segmento vetorial'};}
    }
  });
  const hit=bestV||bestS;
  if(hit)hit.displayOffset=+(hit.object.userData.displayOffset||0);
  return hit;
}
function v3PickPivot(clientX,clientY){
  if(!V3.ren||!V3.cam)return;
  const r=V3.ren.domElement.getBoundingClientRect(),
    nd=new THREE.Vector2(((clientX-r.left)/r.width)*2-1,
      -((clientY-r.top)/r.height)*2+1),
    rc=new THREE.Raycaster();
  rc.params.Line.threshold=Math.max(1,(V3.size||100)/500);
  rc.setFromCamera(nd,V3.cam);
  const snap=v3MeasVectorSnap(clientX,clientY,18),
    objetos=[];
  (V3.meshes||[]).forEach(o=>{if(o&&o.visible)objetos.push(o);});
  if(V3.vecGroup&&V3.vecGroup.visible)V3.vecGroup.traverse(o=>{
    if(o.visible&&(o.isLine||o.isLineSegments||o.isMesh))objetos.push(o);
  });
  const hits=objetos.length?rc.intersectObjects(objetos,true):[],
    p=snap?snap.point:(hits[0]&&hits[0].point);
  if(!p){toast('Clique sobre uma superfície ou linha 3D');return;}
  V3.tgt=[p.x,p.y,p.z];V3.centerPickOn=false;
  v3ApplyCam();
  toast('Pivô de rotação definido no ponto indicado');
}
function v3MeasPick(clientX, clientY){
  if(!V3.ren||!V3.cam) return;
  V3.cam.updateMatrixWorld(true);V3.scene?.updateMatrixWorld(true);
  const r=V3.ren.domElement.getBoundingClientRect();
  const nd=new THREE.Vector2(((clientX-r.left)/r.width)*2-1, -((clientY-r.top)/r.height)*2+1);
  const rc=new THREE.Raycaster(); rc.setFromCamera(nd, V3.cam);
  const snap=v3MeasVectorSnap(clientX,clientY);
  const hits=(V3.meshes&&V3.meshes.length)?rc.intersectObjects(V3.meshes.filter(o=>o.visible),true):[];
  if(!snap&&!hits.length){ toast('Toque sobre o terreno ou um vetor'); return; }
  const p=(snap?snap.point:hits[0].point).clone();
  // OFF levanta o traço apenas para ele não brigar visualmente com o MDT.
  // Guardá-lo no ponto permite recuperar a cota verdadeira na diferença 3D.
  p._v3DisplayOffset=snap?snap.displayOffset:0;
  if(Number.isFinite(snap?.realZ))p._v3RealZ=snap.realZ;
  V3.measPts.push(p);
  const R=Math.max(.001,typeof v3WorldPixelAt==='function'?v3WorldPixelAt(p)*5:v3SceneScale());
  const mk=new THREE.Mesh(new THREE.SphereGeometry(R,12,12),
    new THREE.MeshBasicMaterial({color:0xf5a524,depthTest:false,transparent:true}));
  mk.renderOrder=999; mk.position.copy(p);
  V3.scene.add(mk); V3.measObjs.push(mk);
  if(V3.measPts.length>1){
    if(V3.measLine){V3.scene.remove(V3.measLine);V3.measObjs=V3.measObjs.filter(o=>o!==V3.measLine);V3.measLine.geometry.dispose();V3.measLine.material.dispose();}
    const g=new THREE.BufferGeometry().setFromPoints(V3.measPts);
    const ln=new THREE.Line(g,new THREE.LineBasicMaterial({color:0x37c0aa,depthTest:false,linewidth:2}));
    ln.renderOrder=998;
    V3.scene.add(ln); V3.measObjs.push(ln);
    V3.measLine=ln;
  }
  v3MeasReport();
  if(snap)toast('Snap: '+snap.kind);
}
function v3MeasReport(){
  const out=document.getElementById('v3MeasOut');
  const publish=text=>{if(out)out.textContent=text;v3MeasOverlay(text);};
  const inv=p=>({E:p.x+V3.OX, N:-p.z+V3.OY,
    z:Number.isFinite(p._v3RealZ)?p._v3RealZ:(p.y-(+p._v3DisplayOffset||0))/(V3.VE||1)+V3.z0});
  const P=V3.measPts.map(inv);
  if(P.length===1){
    publish(`P1: E ${P[0].E.toFixed(2)}  N ${P[0].N.toFixed(2)}  cota ${P[0].z.toFixed(2)} m\nClique no segundo ponto para comparar.`);
    return;
  }
  let t2=0,t3=0,txt=P.map((p,i)=>`P${i+1}: E ${p.E.toFixed(2)} · N ${p.N.toFixed(2)} · cota ${p.z.toFixed(2)} m`).join('\n')+'\n';
  for(let i=1;i<P.length;i++){
    const a=P[i-1],b=P[i];
    const dE=b.E-a.E, dN=b.N-a.N, dz=b.z-a.z;
    const d2=Math.hypot(dE,dN), d3=Math.hypot(d2,dz);
    t2+=d2; t3+=d3;
    let az=Math.atan2(dE,dN)*180/Math.PI; if(az<0)az+=360;
    const pct=d2>1e-9? (100*dz/d2).toFixed(1)+'%' : 'vertical';
    const ang=Math.atan2(dz,d2)*180/Math.PI;
    txt+=`${i}: ΔE ${dE>=0?'+':''}${dE.toFixed(2)} m · ΔN ${dN>=0?'+':''}${dN.toFixed(2)} m · `+
         `${d2.toFixed(2)} m · az ${az.toFixed(1)}° · 3D ${d3.toFixed(2)} m · `+
         `Δz ${dz>=0?'+':''}${dz.toFixed(2)} m · ${pct} (${ang>=0?'+':''}${ang.toFixed(1)}°)\n`;
  }
  const zs=P.map(q=>q.z);
  txt+=`— total 2D ${t2.toFixed(2)} m · 3D ${t3.toFixed(2)} m · z ${Math.min(...zs).toFixed(1)}–${Math.max(...zs).toFixed(1)} m`;
  publish(txt);
}
/* Teste de WebGL feito UMA única vez. A sondagem cria um contexto real; sem
   devolvê-lo com WEBGL_lose_context cada chamada consome um dos ~16 contextos
   do navegador, e ao estourar o limite o navegador descarta o contexto mais
   antigo — o do renderer 3D. Era essa a origem do "renderizou uma vez e
   depois ficou em branco".                                                   */
let _webglOK=null;
function webglSuportado(){
  if(_webglOK!==null) return _webglOK;
  try{
    /* No Android, criar e perder um contexto apenas para testar pode liberar
       a vaga de GPU de forma assíncrona. O renderer criado logo em seguida
       então falha com "Error creating WebGL context". A criação real abaixo
       é o teste definitivo; aqui verificamos somente a API, sem consumir uma
       segunda vaga de contexto. */
    _webglOK=!!(window.WebGLRenderingContext||window.WebGL2RenderingContext);
  }catch(e){ _webglOK=false; }
  return _webglOK;
}
/* O contexto pode morrer por pressão de memória (malhas grandes) ou por
   troca de aba. Sem isto o loop de render continua rodando contra um contexto
   morto e a cena some sem qualquer aviso.                                    */
function v3ContextoVivo(){
  if(!V3.ren||!V3.ren.getContext) return false;
  try{ const gl=V3.ren.getContext(); return !!gl && !(gl.isContextLost&&gl.isContextLost()); }
  catch(e){ return false; }
}
function v3DescartaRenderer(){
  try{ if(V3.raf){ cancelAnimationFrame(V3.raf); V3.raf=null; } }catch(e){}
  try{ if(V3.ren){ const el=V3.ren.domElement;if(el)el._alagisDiscarding=true;
        V3.ren.dispose();if(V3.ren.forceContextLoss)V3.ren.forceContextLoss();
        if(el&&el.parentNode) el.parentNode.removeChild(el); } }catch(e){}
  V3.ren=null;V3._frameLast=0;
}
function v3CriaRendererSeguro(){
  const mobile=typeof alagisPerf3D==='function'&&alagisPerf3D().mobile;
  const tentativas=mobile
    ?[{antialias:false,powerPreference:'low-power'},{antialias:false}]
    :[{antialias:true,powerPreference:'high-performance'},{antialias:false}];
  let ultimo=null;
  for(const op of tentativas){try{return new THREE.WebGLRenderer(op);}catch(e){ultimo=e;}}
  throw new Error('Não foi possível criar o contexto WebGL'+(ultimo&&ultimo.message?' — '+ultimo.message:'')+
    '. Feche outras abas 3D e tente novamente.');
}
/* Fecha somente rasgos lineares do grid (no máximo maxGap células). A cota
   vem da interpolação entre as duas extremidades da mesma reta; bordas e
   buracos maiores continuam sem dado. É uma correção visual do MDT para a
   malha 3D, sem nunca gravar ou reamostrar a superfície original. */
function v3InterpolaVazioLinear(d,rr,cc,maxGap=8){
  if(!d||!d.z||rr<0||cc<0||rr>=d.nr||cc>=d.nc)return NaN;
  const z=d.z, at=(r,c)=>z[r*d.nc+c];
  const tenta=(dr,dc)=>{
    let a=1,b=1,za=NaN,zb=NaN;
    while(a<=maxGap){ const r=rr-dr*a,c=cc-dc*a;if(r<0||c<0||r>=d.nr||c>=d.nc)break;
      za=at(r,c);if(isFinite(za))break;a++; }
    while(b<=maxGap){ const r=rr+dr*b,c=cc+dc*b;if(r<0||c<0||r>=d.nr||c>=d.nc)break;
      zb=at(r,c);if(isFinite(zb))break;b++; }
    return isFinite(za)&&isFinite(zb)&&a+b-1<=maxGap ? za+(zb-za)*a/(a+b) : NaN;
  };
  const h=tenta(0,1),v=tenta(1,0);
  if(isFinite(h)&&isFinite(v))return (h+v)/2;
  return isFinite(h)?h:v;
}

/* A vista 3D usa células nativas. Os blocos apenas dividem o trabalho e a
   memória temporária: compartilham a fileira de borda, nunca pulam amostras. */
function v3HasExactTin(r){
  return !!(r&&r._tinMesh&&r._tinMesh.positions&&r._tinMesh.indices);
}
function v3NativeSourceIdentity(r){
  const fn=v3NativeSourceIdentity;
  if(!fn.ids){fn.ids=new WeakMap();fn.serial=0;}
  return [r.d,r.d&&r.d.z,r.d&&r.d._full,r.d&&r.d._img0,r._tinMesh,
    r._tinMesh&&r._tinMesh.positions,r._tinMesh&&r._tinMesh.indices,r._projectNativeBinding,r._projectSourceRaw]
    .map(o=>{if(!o||typeof o!=='object')return 0;if(!fn.ids.has(o))fn.ids.set(o,++fn.serial);return fn.ids.get(o);}).join('.');
}
function v3NativeMemoryBudget(){
  const gb=Number(window.navigator&&window.navigator.deviceMemory)||(alagisModoMobile()?2:8);
  // Orçamento de visualização. A grade usada nos cálculos não é alterada.
  return Math.max(128,Math.min(1024,gb*128))*1024*1024;
}
function v3SurfaceDataSignature(){
  return v3SuperficiesAtivas().map(r=>[r.id,v3NativeSourceIdentity(r),r._rev,r.d?._rev].join(':')).join('|');
}
async function v3NativeSource(r,isCurrent,loadedGrid=null){
  const d=r.d,f=d&&d._full,dims=d&&(d.srcDims||[d._W0,d._H0]);
  const shape=g=>g&&Number.isSafeInteger(g.nc)&&Number.isSafeInteger(g.nr)&&g.nc>0&&g.nr>0&&
    Number.isFinite(g.cs)&&g.cs>0&&Number.isFinite(g.csy||g.cs)&&(g.csy||g.cs)>0&&
    Number.isFinite(g.xll)&&Number.isFinite(g.yll)&&g.z&&g.z.length===g.nc*g.nr;
  const bounds=g=>[g.xll,g.yll,g.xll+g.nc*g.cs,g.yll+g.nr*(g.csy||g.cs)];
  const cache=d&&d._projectNativeFullCache;
  const full=shape(f)&&!(f.resampled>1)&&shape(d)&&
    bounds(f).every((v,i)=>Math.abs(v-bounds(d)[i])<=Math.max(d.cs,d.csy||d.cs)*1e-6)&&
    (f.native===true||f.nc===Number(dims[0])&&f.nr===Number(dims[1]))&&
    (!cache||cache.full!==f||!d._img0||cache.sourceImage===d._img0);
  const native=shape(d)&&!(d.resampled>1)&&
    (!(Number(dims[0])>0&&Number(dims[1])>0)||d.nc===Number(dims[0])&&d.nr===Number(dims[1]))&&
    (!d.fromProject||d.native===true||d.nc===Number(dims[0])&&d.nr===Number(dims[1]));
  if(loadedGrid&&!shape(loadedGrid))throw new Error('A prévia do MDT não contém uma grade válida.');
  if(!loadedGrid&&!full&&!native){
    if(!window.GeoMineChannelDEM)throw new Error('Leitor nativo do MDT indisponível.');
    // O leitor abre o original por janelas, sem carregar a grade inteira nem
    // aceitar a prévia como substituta quando o arquivo está desconectado.
    return window.GeoMineChannelDEM.prepare(r,{workCRS:S.workCRS,isCurrent});
  }
  const grid=loadedGrid||(full?f:d),crs=grid.crs||d.crs||r.crs||grid.srcCRS||d.srcCRS||r.srcCRS,
    keys=['z','nc','nr','cs','csy','xll','yll','crs','srcCRS','_rev','resampled','native'],
    values=keys.map(k=>grid[k]),data=d.z,image=d._img0,rev=r._rev,workCRS=S.workCRS;
  let closed=false,converter=null;
  if(crs&&workCRS&&String(crs)!==String(workCRS)){
    if(typeof proj4!=='function')throw new Error('Conversor de coordenadas indisponível.');
    converter=proj4(crs,workCRS);
  }
  const current=()=>!closed&&isCurrent()&&r.d===d&&d.z===data&&d._full===f&&
    d._img0===image&&r._rev===rev&&S.workCRS===workCRS&&keys.every((k,i)=>Object.is(grid[k],values[i]));
  const check=()=>{if(!current())throw Object.assign(new Error('A superfície mudou durante a montagem do 3D.'),{name:'AbortError'});};
  const nodata=[grid,d,r].flatMap(g=>[g.noData,g.nodata,g._nd]).filter(v=>v!=null&&String(v).trim()!=='').map(Number).filter(Number.isFinite);
  const clean=z=>Number.isFinite(z)&&!nodata.some(n=>z===n||z===Math.fround(n))?z:NaN;
  return {grid,nativeResolution:grid===f?full:native,valueAt(col,row){return clean(grid.z[row*grid.nc+col]);},toWork(p){
    const q=converter?converter.forward(p):p;
    if(!q||!Number.isFinite(q[0])||!Number.isFinite(q[1]))throw new Error('Coordenada inválida na superfície 3D.');
    return q;
  },isCurrent:current,close(){closed=true;},async readWindow(window){
    check();const [left,top,right,bottom]=window,w=right-left,h=bottom-top,out=new Float64Array(w*h);
    for(let row=0;row<h;row++)for(let col=0;col<w;col++){
      const z=grid.z[(top+row)*grid.nc+left+col];
      out[row*w+col]=clean(z);
    }
    check();return out;
  }};
}
async function v3DisplaySource(r,isCurrent,budget){
  const d=r.d,dims=d.srcDims||[d._W0||d.nc,d._H0||d.nr],
    maxCells=Math.max(4,Math.floor(budget/112));
  let source;
  // Uma fonte original pequena cabe inteira. Se estiver desconectada, a
  // grade salva é suficiente para visualizar; não abre seletor de arquivo.
  if(Number(dims[0])*Number(dims[1])<=maxCells){
    try{source=await v3NativeSource(r,isCurrent);}catch(e){if(e.name==='AbortError')throw e;}
  }
  if(!source)source=await v3NativeSource(r,isCurrent,d);
  if(source.nativeResolution==null)source.nativeResolution=true;
  const g=source.grid;
  if(g.nc*g.nr<=maxCells)return source;
  // Só a malha da tela recebe menos vértices. Cada vértice conserva a cota
  // e a posição de uma célula real; nunca gravamos esta malha no MDT.
  const stride=Math.max(2,Math.ceil(Math.sqrt(g.nc*g.nr/maxCells))),
    nc=Math.ceil((g.nc-1)/stride)+1,nr=Math.ceil((g.nr-1)/stride)+1,
    colAt=c=>Math.min(g.nc-1,c*stride),rowAt=r=>Math.min(g.nr-1,r*stride),
    view={...g,nc,nr,cs:g.cs*stride,csy:(g.csy||g.cs)*stride,
      xll:g.xll+(g.cs-g.cs*stride)/2,
      yll:g.yll+g.nr*(g.csy||g.cs)-(g.csy||g.cs)/2-(nr-.5)*(g.csy||g.cs)*stride};
  return {grid:view,nativeResolution:false,displayStride:stride,isCurrent:source.isCurrent,
    toWork:source.toWork,close:()=>source.close(),
    cellPoint(c,r){return [g.xll+(colAt(c)+.5)*g.cs,v3RasterCellY(g,rowAt(r))];},
    async readWindow([left,top,right,bottom]){
      if(!source.isCurrent())throw Object.assign(new Error('O MDT mudou.'),{name:'AbortError'});
      const w=right-left,out=new Float64Array(w*(bottom-top));
      if(source.valueAt){
        for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
          let value=source.valueAt(colAt(x),rowAt(y));
          // Um furo NoData entre amostras não pode virar uma face sólida.
          for(let yy=rowAt(y);Number.isFinite(value)&&yy<=rowAt(y+1);yy++)
            for(let xx=colAt(x);xx<=colAt(x+1);xx++)if(!Number.isFinite(source.valueAt(xx,yy))){value=NaN;break;}
          out[(y-top)*w+x-left]=value;
        }
      }else{
        const x0=colAt(left),x1=colAt(right-1)+1;
        for(let y=top;y<bottom;y++){
          const row=rowAt(y),values=await source.readWindow([x0,row,x1,row+1]);
          for(let x=left;x<right;x++)out[(y-top)*w+x-left]=values[colAt(x)-x0];
        }
      }
      return out;
    }};
}
async function* v3NativeGridTiles(source,limRings,modoRec,check,onProgress){
  const d=source.grid,side=128,total=Math.ceil((d.nc-1)/side)*Math.ceil((d.nr-1)/side);
  let done=0;
  for(let row=0;row<d.nr-1;row+=side)for(let col=0;col<d.nc-1;col+=side){
    check();
    const right=Math.min(d.nc,col+side+1),bottom=Math.min(d.nr,row+side+1),nx=right-col,ny=bottom-row,
      z=await source.readWindow([col,row,right,bottom]);
    check();if(!z||z.length!==nx*ny)throw new Error('Bloco nativo incompleto na superfície 3D.');
    const positions=new Float64Array(nx*ny*3),indices=new Uint16Array((nx-1)*(ny-1)*6);
    for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
      const i=y*nx+x,p=source.toWork(source.cellPoint?source.cellPoint(col+x,row+y):[d.xll+(col+x+.5)*d.cs,v3RasterCellY(d,row+y)]);
      positions[3*i]=p[0];positions[3*i+1]=p[1];positions[3*i+2]=Number.isFinite(z[i])?z[i]:0;
    }
    let count=0;
    const put=(a,b,c)=>{if(Number.isFinite(z[a])&&Number.isFinite(z[b])&&Number.isFinite(z[c])){
      indices[count++]=a;indices[count++]=b;indices[count++]=c;
    }};
    for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++){
      const a=y*nx+x,b=a+1,c=a+nx,e=c+1;put(a,c,b);put(b,c,e);
    }
    let mesh={positions,indices:indices.subarray(0,count)};
    if(count&&limRings&&limRings.length){
      if(typeof tinMalhaExata!=='function')throw new Error('Recorte exato da superfície indisponível.');
      const xs=new Float64Array(nx*ny),ys=new Float64Array(nx*ny),zs=new Float64Array(nx*ny);
      for(let i=0;i<xs.length;i++){xs[i]=positions[3*i];ys[i]=positions[3*i+1];zs[i]=positions[3*i+2];}
      mesh=await tinMalhaExata(xs,ys,zs,mesh.indices,0,limRings,modoRec==='furar',true);
      if(!mesh||!mesh.exactClip)throw new Error('Não foi possível recortar a superfície pelas faces originais.');
    }
    check();if(mesh.indices.length)yield mesh;
    onProgress(++done,total);
    await new Promise(resolve=>setTimeout(resolve,0));
  }
}

async function build3D(){
  const out=document.getElementById('v3dOut');
  const diag=(html)=>{ if(out) out.innerHTML=html; };
  /* Uma atualização de camadas não é um comando de enquadramento. Guarda o
     alvo em coordenadas reais para sobreviver inclusive a uma troca da origem
     local da cena quando outra superfície é acrescentada. Distância e ângulos
     também são preservados; o botão Enquadrar continua sendo a ação explícita
     para centralizar tudo novamente. */
  const veAnt=Number.isFinite(V3.VE)&&V3.VE>0?V3.VE:1;
  const savedCamera=window.GeoMineProjectScreen?.cameraForBuild();
  const camAnterior=savedCamera||((window.GeoMineProjectScreen?.previousCameraAllowed()!==false&&V3.scene&&V3.cam&&Array.isArray(V3.tgt)&&
    Number.isFinite(V3.OX)&&Number.isFinite(V3.OY)&&Number.isFinite(V3.z0))?{
      e:V3.OX+V3.tgt[0], n:V3.OY-V3.tgt[2], z:V3.z0+V3.tgt[1]/veAnt,
      radius:V3.radius, theta:V3.theta, phi:V3.phi, topNorth:!!V3.topNorth
    }:null);
  // 1) WebGL primeiro (falha local, sem depender de rede)
  try{
    if(!webglSuportado()){ hideLoad();
      diag('<b style="color:#e0a">Sem WebGL neste dispositivo/navegador.</b><br>'+
        'O 3D exige WebGL. Em alguns tablets/navegadores ele está desligado '+
        '(modo de economia de dados ou aceleração de hardware desativada). '+
        'Tente outro navegador (Chrome) ou ative a aceleração de hardware.');
      toast('⚠ Sem WebGL — 3D indisponível aqui'); return; }
  }catch(e){ hideLoad(); diag('<b style="color:#e0a">WebGL indisponível.</b>'); return; }
  // 2) baixar o motor (rede)
  diag('Carregando o motor 3D…');
  try{ await ensureThree(); }
  catch(e){ hideLoad();
    diag('<b style="color:#e0a">'+String(e.message).replace(/\n/g,'<br>')+'</b><br><br>'+
      'O CCMGIS baixa o motor 3D (Three.js) da internet na 1ª vez. '+
      'Em campo sem conexão, abra o 3D uma vez com internet — depois o navegador '+
      'guarda em cache e passa a funcionar offline.');
    toast('⚠ Motor 3D não carregou'); return; }
  if(!window.THREE){ hideLoad(); diag('<b style="color:#e0a">Motor 3D ausente.</b>'); return; }
  const wrap=document.getElementById('v3dCanvasWrap');
  if(!wrap){ hideLoad(); toast('⚠ 3D: painel não encontrado'); return; }
  const rasters=v3SuperficiesAtivas();
  const vecExt=v3VectorExtent();
  /* sólidos visíveis também bastam para montar a cena (MDT desligado) */
  const solExt=typeof solExtensao==='function'?solExtensao():null;
  if(!rasters.length&&!vecExt&&!solExt){
    toast('Marque uma superfície, ligue uma camada vetorial com Z ou um sólido');
    return;
  }
  let VE=parseFloat(String(document.getElementById('v3dVE').value).replace(',','.'));
  if(!isFinite(VE)||VE<1) VE=1;                      // 0/vazio/negativo => escala real
  VE=Math.min(8,VE);
  V3._lastVE=VE;
  const drawVec=document.getElementById('v3dVec').checked;
  const perf3=alagisPerf3D();

  const rasterList=S.rasters,layerList=S.layers,workCRS=S.workCRS,
    inputs=rasters.map(r=>({r,d:r.d,z:r.d.z,rev:r._rev,drev:r.d._rev,tin:r._tinMesh,
      options:JSON.stringify(r._v3||{}),style:JSON.stringify(r.style||{})})),
    sources=new Map();
  const current=()=>V3._lastVE===VE&&S.rasters===rasterList&&S.layers===layerList&&S.workCRS===workCRS&&
    inputs.every(q=>rasterList.includes(q.r)&&q.r.d===q.d&&q.r.d.z===q.z&&q.r._rev===q.rev&&q.r.d._rev===q.drev&&
      q.r._tinMesh===q.tin&&JSON.stringify(q.r._v3||{})===q.options&&JSON.stringify(q.r.style||{})===q.style)&&
    v3SuperficiesAtivas().length===rasters.length&&rasters.every(r=>v3SuperficiesAtivas().includes(r));
  const check=()=>{if(!current())throw Object.assign(new Error('A superfície mudou durante a montagem do 3D. Atualize a cena.'),{name:'AbortError'});};
  try{
  showLoad('Preparando as superfícies 3D…');
  // Usa os dados disponíveis antes de descartar a cena anterior. A prévia
  // também é um terreno válido para visualização, inclusive no iPad offline.
  const displayBudget=Math.min(v3NativeMemoryBudget()*.65,(perf3.mobile?128:512)*1024*1024)/Math.max(1,rasters.length);
  for(const r of rasters)if(!v3HasExactTin(r)){
    check();sources.set(r,await v3DisplaySource(r,current,displayBudget));check();
  }
  showLoad('Montando cena 3D…'); await new Promise(r=>setTimeout(r,10));
  check();

  // renderer/cena (reaproveita entre chamadas)
  // Um contexto perdido continua deixando V3.ren preenchido, mas não desenha
  // mais nada. Descartá-lo aqui permite à Mina se recuperar da tela branca.
  if(V3.ren && !v3ContextoVivo()) v3DescartaRenderer();
  if(!V3.ren){
    V3.ren=v3CriaRendererSeguro();
    V3.ren.setPixelRatio(Math.min(perf3.pixelRatio,window.devicePixelRatio||1));
    wrap.innerHTML=''; wrap.appendChild(V3.ren.domElement);
    V3.ren.domElement.style.cssText='width:100%;height:100%;display:block;touch-action:none';
    V3.ren.domElement.addEventListener('webglcontextlost',ev=>{
      ev.preventDefault();
      if(ev.currentTarget&&ev.currentTarget._alagisDiscarding)return;
      if(V3.raf){ cancelAnimationFrame(V3.raf); V3.raf=null; }
      if(S._view==='v3d'){
        mina3DStatus('O navegador perdeu o contexto 3D. Reconstruindo a cena…');
        setTimeout(()=>{ v3DescartaRenderer(); mina3DAuto(true); },120);
      }else toast('⚠ Contexto 3D perdido — renderize novamente');
    },false);
    if(!V3.ren.domElement._alagisBound){ v3Bind(V3.ren.domElement); V3.ren.domElement._alagisBound=true; }
    v3ObservaTamanho();
    window.addEventListener('resize',v3Resize);
  }
  if(typeof solProtege==='function')solProtege();   /* sólidos fora do dispose */
  if(V3.scene){ V3.scene.traverse(o=>{ if(o.geometry)o.geometry.dispose();
    if(o.material){ (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{ if(m.map)m.map.dispose(); m.dispose(); }); } }); }
  V3.scene=new THREE.Scene();
  V3.scene.background=new THREE.Color(
    (typeof v3dCurrentBg==='function' ? v3dCurrentBg() : '') || '#0a0e14');
  if(typeof solRestaura==='function')solRestaura(); /* sólidos de volta à cena nova */
  V3.scene.add(new THREE.AmbientLight(0xffffff,0.55));
  const sun=new THREE.DirectionalLight(0xffffff,0.75);
  sun.position.set(-0.5,1,-0.35); V3.scene.add(sun);

  // origem local no MDT ou, na cena somente vetorial, na geometria 3D
  const d0=rasters.length?rasters[0].d:null,ext0=vecExt||solExt;
  const originSource=rasters.length?sources.get(rasters[0]):null,originGrid=originSource?originSource.grid:d0;
  const origin=originGrid?[originGrid.xll+originGrid.nc*originGrid.cs/2,
    originGrid.yll+originGrid.nr*(originGrid.csy||originGrid.cs)/2]:[(ext0.xmin+ext0.xmax)/2,(ext0.ymin+ext0.ymax)/2];
  const workOrigin=originSource?originSource.toWork(origin):origin,OX=workOrigin[0],OY=workOrigin[1];
  let zmnG=Infinity;
  rasters.forEach(r=>{
    const g=sources.get(r)?.grid,grid=g&&g.z?g:r.d,
      nd=[grid,r.d,r].flatMap(q=>[q.noData,q.nodata,q._nd]).filter(v=>v!=null&&String(v).trim()!=='').map(Number).filter(Number.isFinite);
    for(let k=0;k<grid.z.length;k++){const v=grid.z[k];if(Number.isFinite(v)&&!nd.some(n=>v===n||v===Math.fround(n))&&v<zmnG)zmnG=v;}
  });
  if(vecExt)zmnG=Math.min(zmnG,vecExt.zmin);
  if(!Number.isFinite(zmnG)&&solExt)zmnG=solExt.zmin;
  if(!Number.isFinite(zmnG))zmnG=0;
  let zminScene=vecExt?vecExt.zmin:Infinity;
  if(solExt)zminScene=Math.min(zminScene,solExt.zmin);

  /* Cada MDT pode apontar para uma ortofoto diferente. O cache evita baixar
     duas vezes a mesma imagem quando vários MDTs usam o mesmo drape. */
  const drapeCache=new Map(); let nDrapes=0;
  const drapeDoMDT=async R=>{
    const orto=ortofoto3DSelecionada(R), d=R&&R.d;
    if(!orto||!orto.o||!d)return null;
    const geo=v3OrthoTextureInfo(orto.o,S.workCRS);
    if(!geo)return null;
    const db=geo.workBounds;
    const inter=!(db[2]<d.xll || db[0]>d.xll+d.nc*d.cs || db[3]<d.yll || db[1]>d.yll+d.nr*(d.csy||d.cs));
    if(!inter)return null;
    const chave=String(orto.id);
    if(!drapeCache.has(chave))drapeCache.set(chave,new Promise(res=>{
      new THREE.TextureLoader().load(geo.url,t=>{
        t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
        t.anisotropy=Math.min(perf3.anisotropy,V3.ren.capabilities.getMaxAnisotropy());
        res(t);
      },undefined,()=>res(null));
    }));
    const tex=await drapeCache.get(chave);
    return tex?{tex,db,writeUV:geo.writeUV,nome:orto.o.name||'Ortofoto'}:null;
  };

  // Uma TIN original ou blocos de células nativas por superfície selecionada.
  let bboxMin=vecExt?[vecExt.xmin,vecExt.ymin]:[Infinity,Infinity],
      bboxMax=vecExt?[vecExt.xmax,vecExt.ymax]:[-Infinity,-Infinity],
      zmax=vecExt?vecExt.zmax:-Infinity;
  if(solExt){
    bboxMin=[Math.min(bboxMin[0],solExt.xmin),Math.min(bboxMin[1],solExt.ymin)];
    bboxMax=[Math.max(bboxMax[0],solExt.xmax),Math.max(bboxMax[1],solExt.ymax)];
    zmax=Math.max(zmax,solExt.zmax);
  }
  V3.meshes=[];
  let nativeFaces=0,geometryBytes=0;
  const geometryBudget=v3NativeMemoryBudget();
  const reserveGeometry=bytes=>{
    if(geometryBytes+bytes>geometryBudget)throw new Error('A superfície na resolução original excede a memória disponível para esta cena. Aplique um limite de recorte 3D menor ou desligue outras superfícies. A resolução não foi reduzida.');
    geometryBytes+=bytes;
  };
  // pré-computa os anéis das linhas-limite (para furar terrenos / conter cavas)
  const ringsOf=(limId, cs)=>{
    /* PRJ:<idLinha> é a referência ESTÁVEL à interseção fechada de uma
       projeção de taludes: a camada de interseção é recriada (com id novo)
       a cada render, mas a linha-base não muda — o furo acompanha sozinho. */
    let L;
    if(/^PRJ:/.test(String(limId))){
      const lid=String(limId).slice(4);
      L=S.layers.find(l=>l._projecaoIntersection&&String(l._projecaoLineId)===String(lid))||
        S.layers.find(l=>l._projecaoFinal&&String(l._projecaoLineId)===String(lid));
    }else L=S.layers.find(l=>String(l.id)===String(limId));
    if(!L) return null;
    /* Nas superfícies projetadas o limite já foi calculado por interseção
       terreno–obra. Usá-lo diretamente evita costurar fundo, bermas, pista e
       cristas como se fossem vários polígonos de recorte. */
    if(L.tinSurface&&L.tinSurface.kind==='bacia-rampa-v1'&&
       Array.isArray(L.tinSurface.limites)&&L.tinSurface.limites.length){
      return L.tinSurface.limites.filter(r=>r&&r.length>=3).map(r=>{
        const q=r.map(p=>[p[0],p[1]]),a=q[0],b=q[q.length-1];
        if(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-8)q.push(a.slice());
        return q;
      });
    }
    /* CAVA: pé, crista, berma e bordas da rampa são BREAKLINES, não limites
       de máscara. Se todas entram na regra de paridade, cada banco alterna
       dentro/fora e a malha ganha os dentes triangulares vistos no 3D.
       Para conter a superfície usa somente a interseção única cava × MDT;
       sem corte pelo terreno, usa apenas o maior anel analítico externo. */
    if(L.cavaDesign&&Array.isArray(L.cavaDesign.rings)&&L.cavaDesign.rings.length){
      const daylight=(L.features||[]).filter(f=>
        /^Interseção cava\s*[×x]\s*terreno$/i.test(String((f.props||{}).TIPO||'')));
      const fecha=r=>{
        const q=r.map(p=>reproj(L.crs,S.workCRS,p[0],p[1])),a=q[0],b=q[q.length-1];
        if(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-8)q.push(a.slice());
        return q;
      };
      if(daylight.length){
        const out=[];
        daylight.forEach(f=>{
          const rr=(f.multi&&Array.isArray(f.geom&&f.geom[0]&&f.geom[0][0]))?f.geom:[f.geom];
          rr.forEach(r=>{if(r&&r.length>=3)out.push(fecha(r));});
        });
        if(out.length)return out;
      }
      let best=null,bestA=-Infinity;
      L.cavaDesign.rings.forEach(q=>{
        if(!q.ring||q.ring.length<3)return;
        const a=(typeof tinCavaArea==='function')?tinCavaArea(q.ring):Math.abs(cavaArea2(q.ring));
        if(a>bestA){bestA=a;best=q.ring;}
      });
      return best?[fecha(best)]:null;
    }
    const chains=[];
    L.features.forEach(f=>{ if(!f.geom) return;
      const rs=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
      // linhas OU polígonos servem de limite; ambos entram como cadeias de pontos
      rs.forEach(r=>{ if(r.length>=2) chains.push(r.map(pt=>reproj(L.crs,S.workCRS,pt[0],pt[1]))); });
    });
    if(!chains.length) return null;
    const tol=Math.max(2,(cs||1)*3);
    const sewn=(typeof sewChains==='function')? sewChains(chains, tol) : chains;
    // fecha cada cadeia (liga última ponta à primeira) p/ virar anel de teste PIP
    const aneis=sewn.filter(c=>c.length>=3).map(c=>{ const a=c[0],b=c[c.length-1];
      if(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-6) c=c.concat([a.slice()]); return c; });
    return (L.gtype==='line'&&typeof tinAneisExternos==='function')?tinAneisExternos(aneis):aneis;
  };
  for(const R of rasters){
    check();
    const d=R.d;
    /* O modo 3D é, por definição, uma vista integral das camadas ligadas.
       Anéis analíticos, interseções armazenadas e vínculos de projeto NÃO
       ativam recorte implicitamente. O corte só existe depois de uma ação
       explícita do usuário no menu 3D (recorteAtivo=true). */
    const pv=R._v3||{papel:'terreno',cor:'#b5651d',limId:''};
    /* TEXTURA DEFINIDA NAS PROPRIEDADES DA CAMADA (pv.tex):
       'orto' = ortofoto drapejada · 'hipso' = cor por cota · 'solida' = cor fixa.
       O relevo sombreado não é uma textura à parte: a malha usa material
       com normais planas e luz na cena; o sombreado do relevo é real em
       qualquer uma das três opções. */
    const tex3d=pv.tex||((pv.papel==='cava'||pv.papel==='dce'||pv.papel==='estrada')?'solida':'hipso');
    const usaOrto=(tex3d==='orto');
    const drape=usaOrto?await drapeDoMDT(R):null;
    const drapeTex=drape&&drape.tex, db=drape&&drape.db;
    if(drapeTex)nDrapes++;
    /* Papel define GEOMETRIA (furar/conter); textura define somente a
       APARÊNCIA. Misturar os dois fazia "relevo sombreado" converter uma
       superfície de projeto em terreno: o limite de contenção virava furo e
       a malha inteira desaparecia, restando apenas vetores sobre fundo vazio. */
    const isCava=(pv.papel==='cava'||pv.papel==='dce'||pv.papel==='estrada');
    const solid=(tex3d==='solida')?hexToRGB01(pv.cor||'#8d5524'):null;
    /* Resolve o limite antes dos dois caminhos de malha. A versão anterior
       só o aplicava à grade visual; uma TIN exata ignorava o limite e deixava
       triângulos inteiros sobrar na borda (os “dentes” do 3D). */
    const limIdsPv=Array.isArray(pv.limIds)&&pv.limIds.length?pv.limIds:(pv.limId?[pv.limId]:[]);
    const recorte3D=!!(pv.recorteAtivo===true&&limIdsPv.length);
    /* O modo de recorte agora é escolhido no menu; sem escolha explícita o
       papel decide: terreno FURA (remove o interior das feições) e
       cava/DCE/estrada/projeto CONTÉM (remove o exterior). */
    const modoRec=pv.modoRecorte==='furar'?'furar':pv.modoRecorte==='conter'?'conter':(pv.papel==='terreno'?'furar':'conter');
    let limRings=null;
    if(recorte3D){
      const acc=[];
      for(const idL of limIdsPv){const rg=ringsOf(idL,d.cs);if(rg&&rg.length)acc.push(...rg);}
      limRings=acc.length?acc:null;
    }
    /* TIN verdadeiro: renderiza diretamente os pontos e índices produzidos
       pela Delaunay. Não passa pela grade, não usa sampleZbil e não desloca
       vértices para “alisar” a borda. Faces e cortes permanecem planos e
       cirúrgicos, exatamente como foram calculados. */
    const usaTinExato=v3HasExactTin(R);
    if(usaTinExato){
      // XYZ e conectividade originais, inclusive nos dispositivos móveis.
      let m=R._tinMesh;
      if(limRings&&limRings.length){
        if(typeof tinMalhaExata!=='function')throw new Error('Recorte exato da TIN indisponível.');
        const chave=JSON.stringify([modoRec,limRings,R._rev,d._rev]);
        V3._tinClipCache=V3._tinClipCache||new WeakMap();
        const salvo=V3._tinClipCache.get(R);
        if(salvo&&salvo.key===chave&&salvo.source===R._tinMesh)m=salvo.mesh;
        else{
          const src0=m.positions,n0=(src0.length/3)|0,
            xs0=new Float64Array(n0),ys0=new Float64Array(n0),zs0=new Float64Array(n0);
          for(let i=0;i<n0;i++){xs0[i]=src0[3*i];ys0[i]=src0[3*i+1];zs0[i]=src0[3*i+2];}
          const rec=await tinMalhaExata(xs0,ys0,zs0,m.indices,0,limRings,modoRec==='furar',true);
          check();
          if(!rec||!rec.exactClip)throw new Error('Não foi possível recortar a TIN pelas faces originais.');
          m=rec;V3._tinClipCache.set(R,{key:chave,source:R._tinMesh,mesh:rec});
        }
      }
      if(!m.indices||!m.indices.length)continue;
      const src=m.positions,idx=m.indices,
        modo3=(R.style&&R.style.mode)||'hipso_hs',
        indexed3=!['classes','cn','slopeclass'].includes(modo3);
      if(src.length%3||idx.length%3)throw new Error('TIN com estrutura de faces inválida.');
      for(let i=0;i<src.length;i++)if(!Number.isFinite(src[i]))throw new Error('TIN com coordenada inválida.');
      for(let i=0;i<idx.length;i++)if(!Number.isInteger(idx[i])||idx[i]<0||idx[i]>=src.length/3)
        throw new Error('TIN com referência de vértice inválida.');
      const nT=(idx.length/3)|0,nv=indexed3?(src.length/3|0):nT*3;
      reserveGeometry(nv*(36+(db?8:0))+(indexed3?idx.byteLength:0));
      const pos=new Float32Array(nv*3),col=new Float32Array(nv*3),
        uv=db?new Float32Array(nv*2):null;
      let zmn=Infinity,zmx=-Infinity;
      for(let i=0;i<src.length/3;i++){const z=src[3*i+2];if(z<zmn)zmn=z;if(z>zmx)zmx=z;}
      if(zmx>zmax)zmax=zmx;
      zminScene=Math.min(zminScene,zmn);
      if(indexed3){
        for(let vi=0;vi<nv;vi++){
          const X=src[3*vi],Y=src[3*vi+1],Z=src[3*vi+2],q=3*vi,
            fc=v3RasterStyleColor(R,Z,zmn,zmx,solid);
          pos[q]=X-OX;pos[q+1]=Z-zmnG;pos[q+2]=-(Y-OY);
          col[q]=fc[0];col[q+1]=fc[1];col[q+2]=fc[2];
          if(uv)drape.writeUV(X,Y,uv,2*vi);
          if(X<bboxMin[0])bboxMin[0]=X;if(Y<bboxMin[1])bboxMin[1]=Y;
          if(X>bboxMax[0])bboxMax[0]=X;if(Y>bboxMax[1])bboxMax[1]=Y;
        }
      }else for(let t=0;t<nT;t++){
        const a=idx[3*t],b=idx[3*t+1],c=idx[3*t+2],
          zm=(src[3*a+2]+src[3*b+2]+src[3*c+2])/3,
          fc=v3RasterStyleColor(R,zm,zmn,zmx,solid);
        [a,b,c].forEach((vi,k)=>{
          const X=src[3*vi],Y=src[3*vi+1],Z=src[3*vi+2],q=(3*t+k)*3;
          pos[q]=X-OX;pos[q+1]=Z-zmnG;pos[q+2]=-(Y-OY);
          col[q]=fc[0];col[q+1]=fc[1];col[q+2]=fc[2];
          if(uv)drape.writeUV(X,Y,uv,(3*t+k)*2);
          if(X<bboxMin[0])bboxMin[0]=X;if(Y<bboxMin[1])bboxMin[1]=Y;
          if(X>bboxMax[0])bboxMax[0]=X;if(Y>bboxMax[1])bboxMax[1]=Y;
        });
      }
      let posGeo=pos,colGeo=col,uvGeo=uv,idxGeo=idx;
      // Não solda XYZ nem compartilha iluminação entre planos adjacentes.
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.BufferAttribute(posGeo,3));
      geo.setAttribute('color',new THREE.BufferAttribute(colGeo,3));
      if(uvGeo)geo.setAttribute('uv',new THREE.BufferAttribute(uvGeo,2));
      if(indexed3)geo.setIndex(new THREE.BufferAttribute(idxGeo,1));
      geo.computeVertexNormals();
      const mat=(drapeTex&&!isCava&&usaOrto)
        ?v3SurfaceMaterial(R,{map:drapeTex,side:THREE.DoubleSide,
          depthTest:true,depthWrite:true},true,'orto')
        :v3SurfaceMaterial(R,{vertexColors:true,side:THREE.DoubleSide,
          depthTest:true,depthWrite:true},true,tex3d);
      const mesh=new THREE.Mesh(geo,mat);
      mesh.userData={...(mesh.userData||{}),alagisSurface:true,rasterId:R.id};
      /* CAIXA DO MODELO (opcional, como no RightSlope3D): paredes da borda
         da malha até a cota-base + fundo plano. O fundo é a própria malha
         achatada em zBase — cobre exatamente a projeção do topo, mesmo com
         contorno côncavo, sem precisar triangular o contorno. */
      const caixa=R._v3&&R._v3.caixa;
      /* Estados antigos podiam gravar `on` sem distinguir uma escolha do
         usuário de um padrão experimental. Isso criava as cortinas verticais
         no contorno vistas na cava. As paredes só entram após confirmação no
         controle atual, que grava userSet=true. */
      if(caixa&&caixa.on&&caixa.userSet===true&&isFinite(+caixa.zbase)){
        const zb=+caixa.zbase;
        /* arestas de borda: aparecem em um único triângulo */
        const em=new Map();
        for(let t=0;t<nT;t++){
          const a=idx[3*t],b2=idx[3*t+1],c2=idx[3*t+2];
          [[a,b2],[b2,c2],[c2,a]].forEach(([u,v])=>{
            const k2=u<v?u+'_'+v:v+'_'+u;
            em.set(k2,(em.get(k2)||0)+1);
          });
        }
        const bordas=[];
        em.forEach((n2,k2)=>{ if(n2===1){ const [u,v]=k2.split('_'); bordas.push([+u,+v]); } });
        const nSk=bordas.length*2, nFundo=nT;
        const cp=new Float32Array((nSk+nFundo)*9);
        let q=0;
        const put=(X,Y,Z)=>{ cp[q++]=X-OX; cp[q++]=Z-zmnG; cp[q++]=-(Y-OY); };
        bordas.forEach(([u,v])=>{
          const ux=src[3*u],uy=src[3*u+1],uz=src[3*u+2],
                vx=src[3*v],vy=src[3*v+1],vz=src[3*v+2];
          put(ux,uy,uz); put(vx,vy,vz); put(vx,vy,zb);
          put(ux,uy,uz); put(vx,vy,zb); put(ux,uy,zb);
        });
        for(let t=0;t<nT;t++){                       /* fundo plano em zb */
          const a=idx[3*t],b2=idx[3*t+1],c2=idx[3*t+2];
          put(src[3*a],src[3*a+1],zb);
          put(src[3*c2],src[3*c2+1],zb);              /* invertido: normal p/ baixo */
          put(src[3*b2],src[3*b2+1],zb);
        }
        const gb=new THREE.BufferGeometry();
        gb.setAttribute('position',new THREE.BufferAttribute(cp,3));
        gb.computeVertexNormals();
        const corCx=(R._v3&&R._v3.caixaCor)||'#b9b2a4';
        const mb=new THREE.Mesh(gb,v3LambertMaterial({
          color:corCx,side:THREE.DoubleSide},true));
        mesh.add(mb);
      }
      if(R._v3&&R._v3.wire===true&&nT<=perf3.wireMax){
        const ar=new THREE.LineSegments(new THREE.WireframeGeometry(geo),
          new THREE.LineBasicMaterial({color:0x263728,transparent:true,opacity:0.20,depthWrite:false}));
        ar.renderOrder=2;mesh.add(ar);
      }
      mesh.traverse(o=>{if(o.material)v3ApplySurfaceOpacity(R,o.material);});
      check();nativeFaces+=nT;
      mesh.scale.y=VE;V3.scene.add(mesh);V3.meshes.push(mesh);
      continue;
    }
    const source=sources.get(R),group=new THREE.Group();
    group.userData={alagisSurface:true,rasterId:R.id,nativeResolution:source.nativeResolution!==false,
      displayCellSize:source.grid.cs};
    group.scale.y=VE;
    let zmn=Infinity,zmx=-Infinity,faceCount=0;
    // Faixa de cor da camada permanece comum a todos os blocos.
    for(const z of d.z)if(Number.isFinite(z)){zmn=Math.min(zmn,z);zmx=Math.max(zmx,z);}
    if(!Number.isFinite(zmn)){zmn=0;zmx=1;}
    const mat=(drapeTex&&!isCava&&usaOrto)
      ?v3SurfaceMaterial(R,{map:drapeTex,side:THREE.DoubleSide,depthTest:true,depthWrite:true},true,'orto')
      :v3SurfaceMaterial(R,{vertexColors:true,side:THREE.DoubleSide,depthTest:true,depthWrite:true},true,tex3d);
    try{
      for await(const tile of v3NativeGridTiles(source,limRings,modoRec,check,(n,total)=>
        showLoad('3D · '+(R.name||'MDT')+' · '+Math.round(100*n/total)+'%'))){
        const src=tile.positions,nv=src.length/3;
        reserveGeometry(nv*(36+(db?8:0))+tile.indices.byteLength);
        const pos=new Float32Array(src.length),col=new Float32Array(src.length),uv=db?new Float32Array(nv*2):null;
        for(let i=0;i<nv;i++){
          const X=src[3*i],Y=src[3*i+1],Z=src[3*i+2],fc=v3RasterStyleColor(R,Z,zmn,zmx,solid);
          pos[3*i]=X-OX;pos[3*i+1]=Z-zmnG;pos[3*i+2]=-(Y-OY);
          col[3*i]=fc[0];col[3*i+1]=fc[1];col[3*i+2]=fc[2];
          if(uv)drape.writeUV(X,Y,uv,2*i);
        }
        // Somente vértices de faces válidas entram na extensão; NoData fica vazio.
        for(const i of tile.indices){
          bboxMin[0]=Math.min(bboxMin[0],src[3*i]);bboxMin[1]=Math.min(bboxMin[1],src[3*i+1]);
          bboxMax[0]=Math.max(bboxMax[0],src[3*i]);bboxMax[1]=Math.max(bboxMax[1],src[3*i+1]);
          zmax=Math.max(zmax,src[3*i+2]);zminScene=Math.min(zminScene,src[3*i+2]);
        }
        const geo=new THREE.BufferGeometry();
        geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
        geo.setAttribute('color',new THREE.BufferAttribute(col,3));
        if(uv)geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));
        geo.setIndex(new THREE.BufferAttribute(tile.indices,1));
        geo.computeVertexNormals();
        const mesh=new THREE.Mesh(geo,mat);
        mesh.userData={alagisSurface:true,rasterId:R.id,nativeResolution:source.nativeResolution!==false};
        group.add(mesh);faceCount+=tile.indices.length/3;
      }
      check();
      if(R._tinMethod&&R._tinMethod!=='delaunay-terrain-clip'&&pv.wire===true&&faceCount<=perf3.wireMax){
        group.children.slice().forEach(mesh=>{
          const ar=new THREE.LineSegments(new THREE.WireframeGeometry(mesh.geometry),
            new THREE.LineBasicMaterial({color:0x263728,transparent:true,opacity:0.22,depthWrite:false}));
          ar.renderOrder=2;mesh.add(ar);
        });
      }
      group.traverse(o=>{if(o.material)v3ApplySurfaceOpacity(R,o.material);});
      if(faceCount){V3.scene.add(group);V3.meshes.push(group);nativeFaces+=faceCount;}else mat.dispose();
    }catch(error){
      group.traverse(o=>{if(o.geometry)o.geometry.dispose();});mat.dispose();throw error;
    }
  }
  if(!V3.meshes.length&&!vecExt&&!solExt)throw new Error('Nenhuma face válida nas superfícies ligadas. Verifique as cotas e os limites de recorte.');
  V3.OX=OX; V3.OY=OY; V3.z0=zmnG; V3.VE=VE;          // p/ medição (inversa local->E,N,z)
  /* origem nova: sólidos voltam às mesmas coordenadas reais */
  if(typeof solPosicionaTodos==='function')solPosicionaTodos();
  v3MeasClear(true);                                  // exagero mudou: medições antigas ficariam erradas

  // camadas vetoriais drapejadas (linhas/contornos de polígonos)
  // ---- vetores drapejados: num grupo próprio, para poder refazer sem remontar a cena ----
  V3._ctx={rasters, OX, OY, zmnG, VE, bg:V3.scene.background.getHexString()};
  V3.vecGroup=new THREE.Group(); V3.scene.add(V3.vecGroup);

  // câmera
  const cx=(bboxMin[0]+bboxMax[0])/2-OX, cz=-((bboxMin[1]+bboxMax[1])/2-OY);
  if(!Number.isFinite(zminScene))zminScene=zmnG;
  const span=Math.max(bboxMax[0]-bboxMin[0], bboxMax[1]-bboxMin[1], (zmax-zminScene)*VE, 10);
  V3.size=span;
  if(!V3.cam){ V3.cam=new THREE.PerspectiveCamera(55,1,1,span*40); }
  if(camAnterior){
    V3.tgt=[camAnterior.e-OX,(camAnterior.z-zmnG)*VE,-(camAnterior.n-OY)];
    V3.radius=Math.max(.01,camAnterior.radius||span*1.1);
    V3.theta=camAnterior.theta; V3.phi=camAnterior.phi;
    V3.topNorth=camAnterior.topNorth;
  }else{
    V3.tgt=[cx,(zminScene-zmnG+(zmax-zminScene)*0.4)*VE,cz];
    V3.radius=span*1.1; V3.theta=Math.PI*0.75; V3.phi=Math.PI*0.22;
  }
  V3.cam.far=Math.max(span*40,V3.radius*12,100); V3.cam.updateProjectionMatrix();
  v3Resize(); v3ApplyCam();
  window.GeoMineProjectScreen?.cameraApplied(savedCamera);
  /* A câmera precisa existir antes de qualquer reconstrução de vetores:
     v3BuildVectors pode solicitar um frame imediato quando a exibição
     vetorial está desligada. */
  v3BuildVectors();

  if(!V3.raf){ const loop=t=>{ V3.raf=requestAnimationFrame(loop);
    const cfg=alagisPerf3D(),dt=1000/cfg.fps;
    if((!V3._frameLast||t-V3._frameLast>=dt)&&V3.ren&&V3.scene&&V3.cam){
      V3._frameLast=t;
      try{v3AtualizaFitas();V3.ren.render(V3.scene,V3.cam);}catch(e){}
    }
  }; loop(); }

  // garante tamanho correto (wrap pode ter sido medido como 0 antes de exibir)
  setTimeout(v3Resize, 60);

  hideLoad();
  const info=[];
  info.push(rasters.length+' superfície(s), EV '+VE+'×');
  if(vecExt){
    if(vecExt.n3)info.push(vecExt.n3.toLocaleString('pt-BR')+' vértices com Z');
    if(vecExt.n2)info.push(vecExt.n2.toLocaleString('pt-BR')+' vértices no plano vetorial');
  }
  info.push('modo '+(perf3.mobile?'Mobile':'PC'));
  if(rasters.length){
    const previews=rasters.filter(r=>sources.get(r)?.nativeResolution===false);
    info.push(previews.length?'prévia 3D · '+previews.map(r=>`${r.name}: ${sources.get(r).grid.cs.toLocaleString('pt-BR',{maximumFractionDigits:3})} m`).join(', '):'resolução original');
    info.push(nativeFaces.toLocaleString('pt-BR')+' faces');
  }
  const nSol=(S.solidos||[]).filter(s=>s._grp&&s.visible!==false).length;
  if(nSol)info.push(nSol+' sólido(s)');
  if(!V3.meshes.length&&!vecExt&&!nSol) info.push('⚠ nenhuma geometria 3D gerada');
  if(rasters.length)info.push(nDrapes?`drape: ${nDrapes} MDT(s) com ortofoto`:'drape: hipsometria');
  document.getElementById('v3dOut').innerHTML=info.join(' · ');
  V3._surfaceDataSignature=v3SurfaceDataSignature();
  toast('Cena 3D pronta — arraste para orbitar');
  }finally{sources.forEach(source=>source.close());hideLoad();}
}
/* Mede a área real do canvas. Quando o painel 3D ainda está oculto, o
   clientWidth vem 0 e o fallback fixo (800×500) deixava o canvas menor que a
   janela — o corpo aparecia encolhido num canto. Aqui a medida cai para o
   contêiner pai e, em último caso, para a janela.                          */
function v3Medir(){
  const wrap=document.getElementById('v3dCanvasWrap');
  if(!wrap) return null;
  let w=wrap.clientWidth, h=wrap.clientHeight;
  if(!w||!h){ const p=document.getElementById('v3d');
    if(p){ const r=p.getBoundingClientRect(); w=w||Math.round(r.width); h=h||Math.round(r.height); } }
  if(!w||!h){ const st=wrap.parentNode&&wrap.parentNode.parentNode;
    if(st&&st.getBoundingClientRect){ const r=st.getBoundingClientRect();
      w=w||Math.round(r.width); h=h||Math.round(r.height); } }
  if(!w||!h){ w=w||window.innerWidth-300; h=h||window.innerHeight-120; }
  return {w:Math.max(50,w), h:Math.max(50,h)};
}
function v3Resize(){
  if(!V3.ren||!V3.cam) return;
  const m=v3Medir(); if(!m) return;
  if(V3._sizeRenderer!==V3.ren||!V3._wh||V3._wh[0]!==m.w||V3._wh[1]!==m.h){
    V3.ren.setSize(m.w,m.h,false);V3._sizeRenderer=V3.ren;
  }
  const cv=V3.ren.domElement;
  if(cv){
    if(cv.style.width!=='100%')cv.style.width='100%';
    if(cv.style.height!=='100%')cv.style.height='100%';
    if(cv.style.display!=='block')cv.style.display='block';
  }
  V3.cam.aspect=m.w/m.h; V3.cam.updateProjectionMatrix();
  window.GeoMineBlastingPresentation?.applyPlanCamera(V3);
  V3._wh=[m.w,m.h];
}
/* Observa o contêiner: qualquer mudança de tamanho reajusta o canvas sozinho */
function v3ObservaTamanho(){
  const wrap=document.getElementById('v3dCanvasWrap');
  if(!wrap || V3._ro || typeof ResizeObserver==='undefined') return;
  /* DOM writes run in the next frame, outside ResizeObserver delivery.
     Several notifications in one frame share one canvas resize. */
  let pending=0;
  V3._ro=new ResizeObserver(()=>{
    if(!pending)pending=requestAnimationFrame(()=>{
      pending=0;if(V3.ren&&V3.cam&&S._view==='v3d')v3Resize();
    });
  });
  V3._ro.observe(wrap);
}
/* Quais camadas vetoriais drapejar no MDT — escolha explícita, e não
   "todas as visíveis": numa planta geológica raramente se quer tudo em cima do relevo. */
/* Cor do vetor NA CENA 3D.
   O contorno do ANM é preto e o fundo da cena é quase preto: o polígono era
   desenhado e ficava invisível. Aqui a cor é afastada do fundo quando a
   luminância é próxima demais — só no 3D; a simbologia do mapa fica intacta. */
function lum(hex){
  const h=(hex||'#000').replace('#','');
  const r=parseInt(h.slice(0,2),16)/255, g=parseInt(h.slice(2,4),16)/255, b=parseInt(h.slice(4,6),16)/255;
  return 0.2126*r+0.7152*g+0.0722*b;
}
function afastaDoFundo(hex, bg){
  const h=(hex||'#f5a524').replace('#','');
  let r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16);
  const Lc=lum(hex), Lb=lum(bg);
  if(Math.abs(Lc-Lb)>=0.18) return hex;              // já contrasta
  const claro = Lb<0.5;                              // fundo escuro -> clarear; claro -> escurecer
  if(r+g+b<24){ return claro? '#ffffff' : '#111111'; } // cor neutra (preto): vai p/ branco/preto
  const k = claro? 1 : -1;
  const mix=(v)=>Math.max(0,Math.min(255, Math.round(v + k*(claro?255-v:v)*0.75)));
  r=mix(r); g=mix(g); b=mix(b);
  return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}
/* cor de identidade da camada no 3D */
function cor3D(L){
  const st=L.sym||{};
  if(L.gtype==='polygon') return (st.hatch==='none' ? (st.stroke||st.color) : (st.color||st.stroke));
  return st.stroke||st.color||'#f5a524';
}

/* Converte pixels de tela em unidades da cena na profundidade do ponto.
   As linhas grossas do WebGL são mal suportadas; o CCMGIS usa pequenas fitas,
   mas a largura delas deve acompanhar câmera/zoom. Uma largura fixa em metros
   era a causa dos contornos gigantes e deformados ao aproximar a vista. */
function v3WorldPixelAt(p){
  if(!V3.cam||!V3.ren)return 1;
  const el=V3.ren.domElement,
    h=Math.max(1,(el&&el.clientHeight)||(el&&el.height)||800);
  if(V3.cam.isPerspectiveCamera){
    const d=Math.max(.01,V3.cam.position.distanceTo(p)),
      fov=THREE.MathUtils.degToRad(V3.cam.fov*.5);
    return 2*d*Math.tan(fov)/h;
  }
  if(V3.cam.isOrthographicCamera)
    return Math.abs(V3.cam.top-V3.cam.bottom)/Math.max(.01,V3.cam.zoom||1)/h;
  return 1;
}
function v3AtualizaFitas(force=false){
  if(!V3.vecGroup||!V3.cam||!V3.ren)return;
  const c=V3.cam,e=V3.ren.domElement,
    sig=[c.position.x,c.position.y,c.position.z,c.quaternion.x,c.quaternion.y,
      c.quaternion.z,c.quaternion.w,c.zoom||1,e&&e.clientWidth,e&&e.clientHeight].join('|');
  if(!force&&V3._ribbonSig===sig)return;
  V3._ribbonSig=sig;
  V3.vecGroup.traverse(obj=>{
    if(window.GeoMineLineArrows?.updateThree(obj,V3.cam,v3WorldPixelAt))return;
    const d=obj.userData&&obj.userData.alagisRibbon;
    if(!d||!obj.geometry)return;
    const a=obj.geometry.getAttribute('position'),P=d.points,w=d.weight;
    if(!a||!P||P.length<2||a.count!==P.length*2)return;
    for(let i=0;i<P.length;i++){
      const p=P[i],p0=P[Math.max(0,i-1)],p1=P[Math.min(P.length-1,i+1)],
        dx=p1.x-p0.x,dz=p1.z-p0.z,n=Math.hypot(dx,dz)||1,
        meia=v3WorldPixelAt(p)*.5*w,ox=-dz/n*meia,oz=dx/n*meia;
      a.setXYZ(2*i,p.x+ox,p.y,p.z+oz);
      a.setXYZ(2*i+1,p.x-ox,p.y,p.z-oz);
    }
    a.needsUpdate=true;
    obj.geometry.computeBoundingSphere();
  });
}

/* Monta (ou refaz) os vetores drapejados. Separado de build3D para que a altura
   sobre o terreno possa ser ajustada ao vivo, sem reconstruir o MDT inteiro. */
function v3BuildVectors(){
  if(!V3.scene || !V3.vecGroup || !V3._ctx) return;
  const {rasters, OX, OY, zmnG, VE, bg} = V3._ctx;
  // limpa o grupo
  V3.vecGroup.children.slice().forEach(o=>{ if(o.geometry)o.geometry.dispose();
    if(o.material)o.material.dispose(); V3.vecGroup.remove(o); });
  V3._ribbonSig=null;

  const gcb=(id,d)=>{const e=document.getElementById(id); return e?e.checked:d;};
  // As superfícies não dependem do checkbox geral de vetores; cada papel
  // tem também seu próprio olho na árvore. Não amostra nem drapeia no MDT.
  window.GeoMineGeology?.meshViews?.append3D(V3.vecGroup,{...V3._ctx,showVectors:gcb('v3dVec',true)});
  if(!gcb('v3dVec',true)){
    if(V3.ren&&V3.scene&&V3.cam)V3.ren.render(V3.scene,V3.cam);
    return;
  }

  const dRef=rasters.length?rasters[0].d:null;
  const OFF=Math.max(0,+document.getElementById('v3dVecOff').value||0);
  const corrige=gcb('v3dVecFix',false);
  /* A ÁRVORE DE CAMADAS É A ÚNICA FONTE. Existia aqui uma marcação paralela
     (S._v3dVec) alimentada pela lista do painel: assim que ela ganhava uma
     entrada para a camada, o `visible` da árvore passava a ser IGNORADO — era
     por isso que desligar a camada na aba de camadas não mudava nada em 3D.
     Pior, a chave era gravada com `+L.id`, então id não-numérico nem batia. */
  const escolhidas=S.layers.filter(L=>
    ['line','polygon','point'].includes(L.gtype) && L.visible!==false&&
      L._blasting?.role!=='nodata'&&!window.GeoMineGeology?.meshViews?.isLayer(L));

  // passo de densificação: ~2 células do MDT
  const eVec=v3VectorExtent();
  const passo=dRef?Math.max(1,dRef.cs*2):
    Math.max(0.25,eVec?Math.hypot(eVec.xmax-eVec.xmin,eVec.ymax-eVec.ymin)/1200:1);

  // Amostra Z em TODAS as superfícies da cena e usa a de menor cota no ponto
  // (a cava está ABAIXO do terreno; a curva da cava deve pousar na cava, não
  //  flutuar no nível do terreno). Fora de qualquer superfície, retorna null.
  const surfs=rasters.map(r=>r.d);
  const terrenoR=rasters.find(r=>/^mdt$/i.test(String(r.name||'').trim()))||
    rasters.find(r=>{const p=(r._v3&&r._v3.papel)||'terreno';return p==='terreno';});
  const terrenoD=terrenoR&&terrenoR.d;
  /* A oclusão pelo depth-buffer não basta nas bordas: quando a malha termina,
     um trecho que ficou fora dela aparece suspenso no vazio. O teste em Vz
     corta esses trechos geometricamente no mesmo domínio das superfícies. */
  const zAll=(x,y)=>{ let best=NaN;
    for(const d of surfs){ const z=v3SampleZ(d,x,y);
      if(!isNaN(z)){ if(isNaN(best)||z<best) best=z; } }
    return best; };
  // Vz: quando a linha traz cota própria (zg), usa-a — a curva pousa na cota
  // exata e acompanha o relevo. Sem zg, amostra as superfícies (zAll).
  const Vz=(x,y,zGeom,recortaNoMdt=false,semLift=false,ocultaAcima=false,semOffset=false)=>{
    const zSup=zAll(x,y),temSuperficie=isFinite(zSup);
    let z=(zGeom!=null && isFinite(zGeom))? zGeom : zSup;
    /* Cena exclusivamente vetorial: feições 2D ficam no plano local. Isso é
       visualização vetorial 3D válida e não deve exigir um raster artificial. */
    if(isNaN(z)&&!surfs.length)z=0;
    /* Fora da extensão do MDT, uma feição 2D continua visível no plano-base.
       Só um recorte explicitamente solicitado pode remover esse trecho. */
    if(isNaN(z)&&!recortaNoMdt&&surfs.length&&isFinite(zmnG))z=zmnG;
    if(recortaNoMdt&&surfs.length&&!temSuperficie)return null;
    if(ocultaAcima&&terrenoD&&zGeom!=null&&isFinite(zGeom)){
      const zt=v3SampleZ(terrenoD,x,y),tol=Math.max(.05,(terrenoD.cs||1)*.35);
      if(isFinite(zt)&&zGeom>zt+tol)return null;       // projeto acima do terreno: fora da cava
    }
    /* levante fino sobre a superfície: tira a LINHA do z-fighting com a
       malha. PONTOS DE NUVEM NÃO LEVAM O LEVANTE — eles devem coincidir
       exatamente com a superfície (o levante × exagero era o que fazia a
       nuvem "flutuar" acima do MDT). */
    /* Linhas topológicas com Z próprio não recebem o deslocamento comum de
       0,45 m, mas precisam de uma separação visual subcentimétrica/centimétrica
       do depth-buffer. Sem ela, crista e pé coincidentes com a face aparecem
       tracejados ou somem alternadamente (z-fighting). O XYZ armazenado não é
       modificado; este 0,02 m existe apenas na cena WebGL. */
    const LIFT=(temSuperficie&&!semLift)?(semOffset?0.02:0.45):0;
    /* o deslocamento global de vetores (OFF, “altura sobre o terreno”)
       também NÃO vale para pontos de nuvem — era ele (1,5 m por padrão)
       que descolava a nuvem da malha na cena */
    if(isNaN(z))return null;
    const point=new THREE.Vector3(x-OX,(z-zmnG+LIFT)*VE+((semLift||semOffset)?0:OFF),-(y-OY));point._v3RealZ=z;return point; };
  const V=(x,y)=>Vz(x,y,null);

  /* Densifica o segmento antes de amostrar. Sem isto, um vértice fora do MDT
     descartava o segmento INTEIRO — e o ANM, com vértices a ~100 m, some quase
     todo se as bordas caem fora do modelo. Linhas de fluxo, densas, não sofriam:
     era por isso que só elas apareciam. */
  const amostraSeg=(a,b,push,za,zb,recortaNoMdt=false,ocultaAcima=false,semOffset=false,semLift=false)=>{
    const dx=b[0]-a[0], dy=b[1]-a[1];
    const n=Math.max(1, Math.ceil(Math.hypot(dx,dy)/passo));
    const hasZ=(za!=null&&isFinite(za)&&zb!=null&&isFinite(zb));
    for(let i=0;i<=n;i++){
      const t=i/n;
      const zg=hasZ? (za+(zb-za)*t) : null;
      push(Vz(a[0]+dx*t, a[1]+dy*t, zg,recortaNoMdt,semLift,ocultaAcima,semOffset));
    }
  };

  const corrigidasCamadas=new Set();
  escolhidas.forEach(L=>{
    const sym=L.sym||{};
    const mats=new Map(),matsFita=new Map();
    /* A espessura da simbologia é medida em pixels de tela. No 3D ela não
       pode virar metros lineares sem controle: uma linha de 8 px sobre uma
       cava de quilômetros acabava como uma faixa de muitos metros. Mantém a
       hierarquia visual com compressão por raiz e limita a 3 px. */
    const peso3D=w=>Math.max(1,Math.min(3,0.55+0.58*Math.sqrt(Math.max(1,+w||1))));
    /* Resolve a simbologia POR FEIÇÃO. Antes o 3D usava cor3D(L) uma única
       vez por camada e, portanto, todas as categorias viravam a mesma cor. */
    const estiloDe=f=>{
      const st=featureStyle(L,f)||sym;
      let hex=(L.gtype==='polygon'?(st.stroke||st.color):(L.gtype==='point'?(st.color||st.stroke):(st.stroke||st.color)))||cor3D(L);
      if(corrige){const h2=afastaDoFundo(hex,'#'+bg);if(h2!==hex){hex=h2;corrigidasCamadas.add(L.id);}}
      const weight=Math.max(1,+st.weight||1.5);
      return {hex,weight,weight3d:peso3D(weight),dash:String(st.dash||'').trim(),size:Math.max(2,+st.size||7),arrowEnd:st.arrowEnd,arrowSize:st.arrowSize,arrowWeight:Number(st.weight)};
    };
    const materialDe=f=>{
      const st=estiloDe(f),key=[st.hex,st.weight3d,st.dash].join('|');
      if(mats.has(key))return mats.get(key);
      const tracejada=!!st.dash;
      /* linewidth>1 depende do driver WebGL; onde houver suporte, acompanha
         exatamente a espessura configurada no mapa. */
      const m=tracejada
        ?new THREE.LineDashedMaterial({color:st.hex,linewidth:st.weight3d,dashSize:3,gapSize:2,
            depthTest:true,depthWrite:false,transparent:false})
        :new THREE.LineBasicMaterial({color:st.hex,linewidth:st.weight3d,
            depthTest:true,depthWrite:false,transparent:false});
      m._alagisDash=tracejada;mats.set(key,m);return m;
    };
    /* WebGL fixa THREE.Line em 1 px na maioria dos navegadores, ignorando
       linewidth. Para linhas sólidas com peso > 1 criamos uma fita horizontal
       triangulada: é geometria real e, portanto, a espessura aparece em Chrome,
       Edge, macOS, Windows e Android sem depender do driver. */
    const fitaDe=(pontos,st)=>{
      if(!pontos||pontos.length<2||!(st.weight3d>1.05)||st.dash)return null;
      /* remove vértices consecutivos coincidentes, que não definem normal */
      const P=[];
      pontos.forEach(p=>{const q=P[P.length-1];if(!q||Math.hypot(p.x-q.x,p.z-q.z)>1e-8)P.push(p);});
      if(P.length<2)return null;
      const pos=[],ind=[];
      for(let i=0;i<P.length;i++){
        const a=P[Math.max(0,i-1)],b=P[Math.min(P.length-1,i+1)],
          dx=b.x-a.x,dz=b.z-a.z,n=Math.hypot(dx,dz)||1,
          p=P[i],meia=v3WorldPixelAt(p)*.5*st.weight3d,
          ox=-dz/n*meia,oz=dx/n*meia;
        pos.push(p.x+ox,p.y,p.z+oz,p.x-ox,p.y,p.z-oz);
        if(i){const k=i*2;ind.push(k-2,k-1,k,k-1,k+1,k);}
      }
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setIndex(ind);
      const key=st.hex;
      let ma=matsFita.get(key);
      if(!ma){ma=new THREE.MeshBasicMaterial({color:st.hex,side:THREE.DoubleSide,
          depthTest:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
        matsFita.set(key,ma);}
      const obj=new THREE.Mesh(geo,ma);
      obj.userData.alagisRibbon={points:P,weight:st.weight3d};
      return obj;
    };
    /* Vetores ligados aparecem completos. A existência de um MDT serve para
       fornecer Z/drape, não para apagar automaticamente trechos fora dele. */
    const recortaNoMdt=false;
    const ehCava=!!(L.cavaDesign||L._cavaCutVectorOf||L._cavaMdtCutOf||
      /(?:^|\b)cava(?:\b|_)/i.test(String(L.name||''))),
      /* A superfície de recorte deve ser a que foi escolhida para ESTA cava,
         não necessariamente o primeiro raster chamado MDT na cena. */
      corteR=(L._cavaMdtRasterId!=null?rasters.find(r=>String(r.id)===String(L._cavaMdtRasterId)):null)||
        (L.cavaDesign?.rasterId!=null?rasters.find(r=>String(r.id)===String(L.cavaDesign.rasterId)):null)||
        terrenoR,
      corteD=corteR&&corteR.d,
      corteUp=L._cavaMdtCutUp===true||L.cavaDesign?.up===true,
      /* A oclusão normal é resolvida pelo depth-buffer. Não descartar a
         geometria por comparação automática de cotas: isso seria recorte. */
      ocultaAcima=false,
      /* Produtos construtivos de cava compartilham X/Y/Z. Levantar todas as
         linhas 0,45 m e ainda somar o offset global fazia o 3D mostrar uma
         fresta que não existe no dado. Para essas camadas a topologia real
         prevalece; o depth-buffer continua resolvendo a oclusão. */
      /* A caixa de retenção também é produto construtivo: interseção, crista
         e pé devem POUSAR nas próprias cotas — levante de 0,45 m e offset
         global descolavam a linha de interseção do encontro real e a crista/
         pé das paredes do corte. */
      /* Linha com COTA PRÓPRIA é dado topográfico: pousa exatamente na sua
         cota, sem levante nem offset — levantar 0,45 m × exagero era o que
         deixava as cristas e pés dos planos de lavra "voando" sobre as
         superfícies das cavas. O depth-buffer resolve a oclusão. */
      topologiaExata3D=!!(L._cavaMdtCutOf||L._rb31CutOf||L._cavaCutVectorOf||
        (L.tinSurface&&L.tinSurface.kind==='bacia-rampa-v1')||L._baciaEng||
        L._interExata||
        /^Pés, cristas e bermas — bacia$/i.test(String(L.name||''))||
        (L.features||[]).some(f=>{const zz=f.zg;if(!zz)return false;
          const flat=(f.multi&&Array.isArray(zz[0]))?zz.flat():zz;
          return Array.isArray(flat)&&flat.some(v=>v!=null&&isFinite(v));}));

    if(L.gtype==='point'){
      /* PONTOS COM RGB TAMBÉM NO 3D: quando a feição traz R/G/B (nuvem
         LiDAR), a cor vai POR VÉRTICE (vertexColors) — mesma auto-detecção
         do mapa 2D. Pontos sem cor própria recebem a cor da camada. */
      const pts=[], cols=[];
      L.features.forEach(f=>{ if(!f.geom||!featureVisible(L,f)) return;
        const base=new THREE.Color(estiloDe(f).hex);
        const pr=f.props;
        const zAttr=v3AtributoZ(f);
        const comCor=!!(pr&&pr.R!=null&&pr.G!=null&&pr.B!=null&&L._pintaRGB!==false);
        f.geom.forEach((pt,pi)=>{ const c=reproj(L.crs,S.workCRS,pt[0],pt[1]);
          const zg=Array.isArray(f.zg)?f.zg[pi]:
            (pt.length>2&&isFinite(pt[2])?pt[2]:zAttr);
          const v=Vz(c[0],c[1],zg,recortaNoMdt,true,ocultaAcima);   /* pontos: sem levante */
          if(v){ pts.push(v);
            if(comCor){ cols.push((pr.R|0)/255,(pr.G|0)/255,(pr.B|0)/255); }
            else cols.push(base.r,base.g,base.b); } }); });
      if(pts.length){
        const geo=new THREE.BufferGeometry().setFromPoints(pts);
        /* vertexColors vale também para categorias comuns: cada classe mantém
           no 3D a mesma cor que possui no 2D. */
        geo.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));
        const pm=new THREE.PointsMaterial({vertexColors:true,
          size:pts.length>50000?2.5:7,sizeAttenuation:false});
        const obj=new THREE.Points(geo,pm);
        obj.userData={alagisVector:true,displayOffset:0,layerId:L.id,measurePoints:pts};
        V3.vecGroup.add(obj); }
      return;
    }

    L.features.forEach(f=>{
      if(!f.geom||!featureVisible(L,f)) return;
      // This vector pass draws polygon outlines only. Respect an explicitly
      // disabled outline instead of promoting weight 0 to a visible 3D line.
      // In civil corridors those edges are calculation strips, not benches.
      if(L.gtype==='polygon'){
        const style=featureStyle(L,f)||sym;
        if(style.weight!=null&&Number(style.weight)===0)return;
      }
      const st3=estiloDe(f),mat=materialDe(f);
      const nested=(f.multi&&Array.isArray(f.geom[0][0]));
      const rings=nested?f.geom:[f.geom];
      rings.forEach((ring,ri)=>{
        const pr=ring.map(pt=>reproj(L.crs,S.workCRS,pt[0],pt[1]));
        /* Clone: fechar um polígono para a cena não pode acrescentar Z ao
           dado da camada a cada nova renderização. O antigo push direto em
           f.zg fazia o vetor crescer a cada abertura do 3D e, depois de
           algumas atualizações dinâmicas, dessincronizava XY e Z. */
        const zr0=typeof resolveFeatureZRing==='function'?
          resolveFeatureZRing(f,ring,ri,nested,true):
          (f.zg?(nested?f.zg[ri]:f.zg):null),
          zr=Array.isArray(zr0)?zr0.slice():null;
        if(L.gtype==='polygon' && pr.length>2){
          const dx=pr[0][0]-pr.at(-1)[0],dy=pr[0][1]-pr.at(-1)[1];
          if(Math.hypot(dx,dy)>1e-8){pr.push(pr[0].slice());if(zr&&zr.length)zr.push(zr[0]);}
        }
        let trecho=[];
        const fecha=()=>{ if(trecho.length>1){
            let obj=fitaDe(trecho,st3);
            if(!obj){obj=new THREE.Line(new THREE.BufferGeometry().setFromPoints(trecho),mat);
              if(mat._alagisDash)obj.computeLineDistances();}/* sem isto o tracejado sai contínuo */
            Object.assign(obj.userData||(obj.userData={}),
              {alagisVector:true,displayOffset:OFF,layerId:L.id,measurePoints:trecho.slice()});
            V3.vecGroup.add(obj); }
          trecho=[]; };
        for(let i=0;i<pr.length-1;i++){
          const za=zr? zr[i] : null, zb=zr? zr[i+1] : null;
          /* Para cava, o filtro z projeto × topografia é feito pela
             superfície associada acima. O amostrador compartilhado usa o
             terreno padrão; portanto, quando forem diferentes, aplicamos o
             teste exato antes de enviar o ponto à cena. */
          const push=v=>{
            if(!v){ fecha(); return; }               // fora do MDT: corta o traçado
            trecho.push(v);
          };
          if(ehCava&&corteD&&corteD!==terrenoD){
            const a=pr[i],b=pr[i+1],dx=b[0]-a[0],dy=b[1]-a[1],
              nn=Math.max(1,Math.ceil(Math.hypot(dx,dy)/passo)),hasZ=Number.isFinite(za)&&Number.isFinite(zb);
            for(let k=0;k<=nn;k++){
              const t=k/nn,x=a[0]+dx*t,y=a[1]+dy*t,zg=hasZ?za+(zb-za)*t:null,
                zt=v3SampleZ(corteD,x,y),tol=Math.max(.05,(corteD.cs||1)*.35);
              if(Number.isFinite(zg)&&Number.isFinite(zt)&&
                 (corteUp?zg<zt-tol:zg>zt+tol)){push(null);continue;}
              push(Vz(x,y,zg,recortaNoMdt,false,false,topologiaExata3D));
            }
          }else amostraSeg(pr[i],pr[i+1],push,za,zb,recortaNoMdt,ocultaAcima,topologiaExata3D,!!L._blasting);
        }
        fecha();
        /* Apenas o terminal geométrico original recebe ponta: um recorte no
           MDT nunca converte a interseção num novo final da linha. */
        if(L.gtype==='line'&&window.GeoMineLineArrows){
          const terminal=GeoMineLineArrows.terminal(pr);
          if(terminal){
            const vertex=(p,i)=>{
              const z=zr?zr[i]:null;
              if(ehCava&&corteD&&corteD!==terrenoD){
                const zt=v3SampleZ(corteD,p[0],p[1]),tol=Math.max(.05,(corteD.cs||1)*.35);
                if(Number.isFinite(z)&&Number.isFinite(zt)&&(corteUp?z<zt-tol:z>zt+tol))return null;
              }
              return Vz(p[0],p[1],z,recortaNoMdt,!!L._blasting,ocultaAcima,topologiaExata3D);
            };
            const a=vertex(terminal.a,terminal.previous),b=vertex(terminal.b,terminal.end),
              arrow=GeoMineLineArrows.three(a,b,st3,st3.hex,st3.arrowWeight,THREE);
            if(arrow){Object.assign(arrow.userData,{alagisVector:true,measurementDecoration:true,displayOffset:OFF,layerId:L.id});V3.vecGroup.add(arrow);}
          }
        }
      });
    });
  });
  if(corrigidasCamadas.size && !V3._avisouCor){ V3._avisouCor=1;
    toast(`${corrigidasCamadas.size} camada(s) com cor clareada para contrastar com o fundo`); }
  v3AtualizaFitas(true);
  window.GeoMineBlastingPresentation?.decorate3D(V3.vecGroup);
  V3.ren && V3.cam && V3.ren.render(V3.scene,V3.cam);
}

function refresh3DVecList(){
  const box=document.getElementById('v3dVecList'); if(!box) return;
  const vets=S.layers.filter(l=>['line','polygon','point'].includes(l.gtype));
  if(!vets.length){ box.innerHTML='<div class="hint" style="margin:0">Nenhuma camada vetorial carregada.</div>'; return; }
  box.innerHTML=vets.map(L=>{
    const on=(L.visible!==false);   /* espelho da árvore, não estado próprio */
    return `<label class="field" style="display:flex;align-items:center;gap:7px;cursor:pointer;margin:2px 0">
      <input type="checkbox" class="v3dVecItem" data-lid="${L.id}" ${on?'checked':''}
        style="width:auto;accent-color:var(--amber)">
      <span class="swatch" style="${swatchCSS(L.sym)};width:12px;height:12px;border-radius:3px;flex-shrink:0"></span>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(L.name)}</span>
      <span class="tag" style="margin-left:auto;flex-shrink:0">${L.gtype}</span></label>`;
  }).join('');
  box.querySelectorAll('.v3dVecItem').forEach(cb=>{
    /* marcar aqui é o MESMO gesto do olho na árvore: mexe no L.visible e o
       resto do app acompanha (mapa 2D inclusive) */
    cb.onchange=()=>{
      const L=(S.layers||[]).find(x=>String(x.id)===String(cb.dataset.lid));
      if(!L)return;
      nodeSetVis({t:'L',id:L.id,o:L},cb.checked);
      try{if(typeof zApply==='function')zApply();}catch(e){}
      try{ refreshUI(); }catch(e){}
    };
  });
}

/* Sincronização imediata árvore ↔ WebGL. Oculta objetos já montados no mesmo
   frame do clique; em seguida reconstrói somente o necessário. A chamada é
   direta (não depende de "Atualização automática"), pois mudar o olho é um
   comando explícito de visibilidade e nunca pode deixar mapa e 3D divergirem. */
function v3SyncTreeVisibility(n,vis){
  if(S._view!=='v3d')return;
  try{
    if(n.t==='L'&&V3.vecGroup){
      V3.vecGroup.traverse(o=>{
        if(o.userData&&String(o.userData.layerId)===String(n.id))o.visible=vis;
      });
    }else if(n.t==='R'&&Array.isArray(V3.meshes)){
      V3.meshes.forEach(o=>{
        if(o&&o.userData&&String(o.userData.rasterId)===String(n.id))o.visible=vis;
      });
    }
    if(V3.ren&&V3.scene&&V3.cam)V3.ren.render(V3.scene,V3.cam);
  }catch(e){console.warn('visibilidade 3D imediata',e);}
  S._v3Pendente=false;
  const aviso=document.getElementById('v3dPendente');if(aviso)aviso.style.display='none';
  if(typeof mina3DAuto==='function')setTimeout(()=>mina3DAuto(false),0);
}
/* Exagero vertical AO VIVO: rescala as malhas (scale.y), refaz o drape dos
   vetores e reposiciona o alvo — sem reconstruir geometria nenhuma.        */
function v3SetVE(v){
  v=Math.max(1, Math.min(8, parseFloat(String(v).replace(',','.'))||1));
  const nInp=document.getElementById('v3dVE'), rInp=document.getElementById('v3dVER'),
        tag=document.getElementById('v3dVEv');
  if(nInp) nInp.value=v; if(rInp) rInp.value=v;
  if(tag) tag.textContent=v.toFixed(1).replace('.',',')+'×';
  if(!V3.scene){ return; }
  V3.meshes.forEach(m=>{ m.scale.y=v; });
  V3.VE=v;
  if(V3._ctx) V3._ctx.VE=v;
  if(typeof solPosicionaTodos==='function')solPosicionaTodos();   // sólidos acompanham o exagero
  if(typeof v3BuildVectors==='function') v3BuildVectors();  // drape na nova altura
  if(V3.tgt) V3.tgt[1]=V3.tgt[1]/ (V3._lastVE||1) * v;
  V3._lastVE=v;
  v3MeasClear(true);                                        // medições antigas ficariam erradas
}
(function(){
  const n=document.getElementById('v3dVE'), r=document.getElementById('v3dVER');
  const go=e=>v3SetVE(e.target.value);
  if(n){ n.addEventListener('input',go); n.addEventListener('change',go); }
  if(r){ r.addEventListener('input',go); }
})();
(function(){
  const b=document.getElementById('btnV3Meas');
  if(b) b.onclick=v3MeasToggle;
  const c=document.getElementById('btnV3MeasClr');
  if(c) c.onclick=()=>v3MeasClear(false);
})();
/* QUAIS SUPERFÍCIES ENTRAM NA CENA — exatamente as ligadas na árvore.
   Não existe mais seleção paralela: o mesmo olho controla mapa, Layout e 3D. */
function v3SuperficiesAtivas(){
  const todos=S.rasters||[];
  S._v3SurfOn=S._v3SurfOn||{};
  const ids=new Set(todos.map(r=>String(r.id)));
  Object.keys(S._v3SurfOn).forEach(k=>{if(!ids.has(String(k)))delete S._v3SurfOn[k];});
  todos.forEach(r=>{S._v3SurfOn[String(r.id)]=r.visible!==false;});
  return todos.filter(r=>r.visible!==false);
}
function refresh3DPanel(){
  refresh3DVecList();
  const box=document.getElementById('v3dRas'); if(!box) return;
  S._v3SurfOn=S._v3SurfOn||{};
  /* NÃO recolher aqui o estado das caixas já desenhadas: essa varredura
     sobrescrevia com o valor VELHO da tela um desligamento que acabara de
     acontecer na árvore, e a superfície voltava sozinha. Quem registra a
     escolha é o onchange da própria caixa, mais abaixo. */
  /* Além das linhas, a camada da CAIXA (polígono com descrição analítica)
     também serve de anel — é ela que fura o terreno logo que a caixa nasce,
     antes da rampa. Sem isto o seletor mostrava "— sem anel —" com o furo
     ativo. */
  const lineLayers=S.layers.filter(l=>l.gtype==='line'||l.gtype==='polygon'||
    (l.tinSurface&&l.tinSurface.kind==='bacia-rampa-v1'));
  /* Interseções de projeção entram com valor estável PRJ:<idLinha> — a
     camada é recriada a cada render, mas o vínculo com a linha-base não. */
  const feicaoVal=l=>l._projecaoIntersection?('PRJ:'+String(l._projecaoLineId)):String(l.id);
  const ativas3D=new Set(v3SuperficiesAtivas().map(r=>String(r.id)));
  box.innerHTML=S.rasters.length
    ? S.rasters.map(r=>{
        r._v3 = r._v3 || {papel:'terreno', cor:'#b5651d', limId:''};
        const pv=r._v3;
        const on=ativas3D.has(String(r.id));
        return `<div style="border:1px solid var(--line);border-radius:8px;padding:6px 8px;margin:5px 0">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" data-rid="${r.id}" ${on?'checked':''} style="width:auto;accent-color:var(--amber)">
          <b style="font-size:12.5px">${esc(r.name)}</b></label>
        <div class="row2" style="margin-top:5px;grid-template-columns:1fr 46px">
          <select data-v3papel="${r.id}" style="font-size:12px">
            <option value="terreno" ${pv.papel==='terreno'?'selected':''}>Terreno (textura RGB)</option>
            <option value="cava" ${pv.papel==='cava'?'selected':''}>Cava (cor sólida)</option>
            <option value="dce" ${pv.papel==='dce'?'selected':''}>Pilha/DCE (cor sólida)</option>
            <option value="estrada" ${pv.papel==='estrada'?'selected':''}>Estrada/plataforma (cor sólida)</option>
            <option value="projeto" ${pv.papel==='projeto'?'selected':''}>Projeto (contido no limite)</option>
          </select>
          <input type="color" data-v3cor="${r.id}" value="${pv.cor}" style="height:30px;padding:1px"
            ${pv.papel==='terreno'?'disabled':''}>
        </div>
        <div data-v3furobox="${r.id}" style="margin-top:4px">
          <div class="row2" style="grid-template-columns:auto 1fr;gap:6px;align-items:center">
            <label class="field" data-v3limlbl="${r.id}" style="font-size:11px;margin:0">Recorte 3D:</label>
            <select data-v3modo="${r.id}" style="font-size:12px">
              <option value="" ${!pv.modoRecorte?'selected':''}>Automático pelo papel (terreno fura; projeto contém)</option>
              <option value="furar" ${pv.modoRecorte==='furar'?'selected':''}>Furar — remove o interior das feições</option>
              <option value="conter" ${pv.modoRecorte==='conter'?'selected':''}>Conter — remove o exterior das feições</option>
            </select>
          </div>
          <label class="field" style="font-size:11px;margin:5px 0 2px">Feições que recortam esta superfície (linhas fechadas e polígonos; pode marcar várias):</label>
          <div data-v3feics="${r.id}" style="max-height:96px;overflow:auto;border:1px solid var(--line);border-radius:6px;padding:4px 6px;background:var(--panel2)">
            ${(()=>{const selIds=new Set((Array.isArray(pv.limIds)&&pv.limIds.length?pv.limIds:(pv.limId?[pv.limId]:[])).map(String));
              const its=lineLayers.map(l=>{const v=feicaoVal(l);
                return `<label style="display:flex;gap:6px;align-items:center;font-size:12px;cursor:pointer;margin:2px 0"><input type="checkbox" data-v3fei="${r.id}" value="${v}" ${selIds.has(v)?'checked':''} style="width:auto;accent-color:var(--amber)">${l._projecaoIntersection?'Interseção da projeção · ':''}${esc(l.name)}</label>`;
              }).join('');
              return its||'<div class="hint" style="margin:0">Nenhuma linha ou polígono disponível para recortar.</div>';})()}
          </div>
        </div>
        </div>`;
      }).join('')
    : '<div class="hint">Nenhuma superfície carregada. A Mina continuará funcionando com as camadas vetoriais; vetores sem Z serão mostrados no plano local.</div>';
  // ligar os controles de papel/cor/limite
  box.querySelectorAll('[data-v3papel]').forEach(sel=>sel.onchange=()=>{
    const r=S.rasters.find(x=>String(x.id)===sel.dataset.v3papel); if(!r)return;
    r._v3.papel=sel.value;
    r._exactClipRings=null;
    const corI=box.querySelector(`[data-v3cor="${r.id}"]`);
    if(corI) corI.disabled=(sel.value!=='cava'&&sel.value!=='dce'&&sel.value!=='estrada'&&sel.value!=='projeto');
    const fb=box.querySelector(`[data-v3furobox="${r.id}"]`);
    if(fb) fb.style.display='';
    /* O rótulo do recorte é estático; o comportamento automático por papel
       está descrito na própria opção "Automático" do seletor de modo. */
    // cor padrão por tipo
    if(sel.value==='cava' && r._v3.cor==='#b5651d') { r._v3.cor='#8d5524'; if(corI)corI.value=r._v3.cor; }
    if(sel.value==='dce') { r._v3.cor='#a0522d'; if(corI)corI.value=r._v3.cor; }
    if(sel.value==='estrada') { r._v3.cor='#777d86'; if(corI)corI.value=r._v3.cor; }
    try{if(typeof renderRaster==='function')renderRaster(r);}catch(e){}
    if(typeof v3Auto==='function')v3Auto();
  });
  /* TIPO DE TEXTURA aplicado a todas as superfícies de uma vez. Aparência e
     papel geométrico são independentes: trocar hipso/orto/sólida nunca muda
     terreno, cava, DCE ou projeto, nem a regra furo/contenção do limite. */
  {
    const tt=document.getElementById('v3dTexTipo'),
      tc=document.getElementById('v3dTexCor'),
      dr0=document.getElementById('v3dDrape');
    if(tt&&!tt._init){
      tt._init=true;
      tt.value=S._v3TexTipo||'hipso';
      if(tc&&S._v3TexCor)tc.value=S._v3TexCor;
    }
    const aplica=()=>{
      const tipo=tt?tt.value:'hipso', cor=(tc&&tc.value)||'#8d5524';
      S._v3TexTipo=tipo; S._v3TexCor=cor;
      (S.rasters||[]).forEach(r=>{
        r._v3=r._v3||{papel:'terreno',cor:'#b5651d',limId:''};
        r._v3.tex=tipo;
        if(tipo==='solida')r._v3.cor=cor;
      });
      const dr=document.getElementById('v3dDrape');
      if(dr&&!dr.disabled){ dr.checked=(tipo==='orto'); dr._touched=true; }
      if(typeof v3Auto==='function')v3Auto();
    };
    if(tt)tt.onchange=aplica;
    if(tc)tc.onchange=aplica;
  }
  /* A caixa do painel 3D é o espelho do mesmo olho existente na árvore. */
  box.querySelectorAll('input[type=checkbox][data-rid]').forEach(cb=>cb.onchange=()=>{
    const r=(S.rasters||[]).find(x=>String(x.id)===String(cb.dataset.rid));if(!r)return;
    nodeSetVis({t:'R',id:r.id,o:r},cb.checked);
    try{if(typeof zApply==='function')zApply();refreshUI();}catch(e){}
  });
  box.querySelectorAll('[data-v3cor]').forEach(ci=>{
    ci.oninput=()=>{ const r=S.rasters.find(x=>String(x.id)===ci.dataset.v3cor); if(r) r._v3.cor=ci.value; };
    ci.onchange=()=>{ if(typeof v3Auto==='function')v3Auto(); };
  });
  box.querySelectorAll('[data-v3modo]').forEach(sel=>sel.onchange=()=>{
    const r=S.rasters.find(x=>String(x.id)===sel.dataset.v3modo); if(!r)return;
    r._v3.modoRecorte=sel.value;
    r._exactClipRings=null;
    try{if(typeof renderRaster==='function')renderRaster(r);}catch(e){}
    if(typeof v3Auto==='function')v3Auto();
  });
  box.querySelectorAll('input[data-v3fei]').forEach(cb=>cb.onchange=()=>{
    const r=S.rasters.find(x=>String(x.id)===cb.dataset.v3fei); if(!r)return;
    const marcados=[...box.querySelectorAll(`input[data-v3fei="${r.id}"]:checked`)].map(i=>i.value);
    r._v3.limIds=marcados;
    /* limId escalar continua sendo o espelho de compatibilidade (2D/legado);
       feições PRJ ficam fora dele porque o id da camada muda a cada render. */
    r._v3.limId=(marcados.find(v=>!/^PRJ:/.test(v)))||'';
    r._v3.recorteAtivo=marcados.length>0; /* seleção manual = recorte explícito */
    r._exactClipRings=null;
    try{if(typeof renderRaster==='function')renderRaster(r);}catch(e){}
    if(typeof v3Auto==='function')v3Auto();
  });
  const hasImg=!!(S.img&&S.img.url&&S.img.b);
  const dr=document.getElementById('v3dDrape');
  dr.disabled=!hasImg; if(!hasImg||!dr._touched) dr.checked=false;
  document.getElementById('v3dDrapeHint').textContent=hasImg
    ? 'Imagem posicionada detectada. Escolha “Ortofoto drapejada” para aplicá-la.'
    : 'Sem imagem posicionada (Mapa → Imagem de fundo). Usando cores hipsométricas.';
  const th=document.getElementById('v3dTextureHint');
  if(th) th.textContent=hasImg
    ? 'O relevo sólido sombreado é o padrão. A ortofoto só aparece quando escolhida no tipo de textura.'
    : 'Relevo sólido sombreado ativo; nenhuma ortofoto/imagem RGB foi posicionada.';
  const qm=document.getElementById('v3SurfaceMenu');
  if(qm&&qm.classList.contains('open')&&typeof v3SurfaceMenuSync==='function')v3SurfaceMenuSync(true);
}

/* Paleta compacta do 3D. Ela edita o mesmo objeto _v3 do painel lateral:
   portanto não existe uma segunda lista de superfícies nem um segundo estado
   de visibilidade para ficar dessincronizado da árvore de camadas. */
function v3QuickLimitLayers(){
  return (S.layers||[]).filter(l=>{
    if(l.tinSurface&&l.tinSurface.kind==='bacia-rampa-v1')return true;
    if(l.gtype!=='line'&&l.gtype!=='polygon')return false;
    return (l.features||[]).some(f=>f&&f.geom&&f.geom.length);
  });
}
function v3QuickRoleDefaults(role,current){
  if(role==='cava')return current&&current!=='#b5651d'?current:'#8d5524';
  if(role==='dce')return '#a0522d';
  if(role==='estrada')return '#777d86';
  if(role==='projeto')return current||'#4f8b3a';
  return current||'#b5651d';
}
function v3QuickRuleText(){
  const role=(document.getElementById('v3QuickRole')||{}).value||'terreno',
    out=document.getElementById('v3QuickRule');
  if(!out)return;
  out.textContent=role==='terreno'
    ? 'O interior do limite será retirado do terreno; a linha vira a borda exata do vazio.'
    : 'Somente a parte interna do limite será mantida; os triângulos serão cortados exatamente na linha.';
}
function v3SurfaceMenuLoad(){
  const sr=document.getElementById('v3QuickSurface'),role=document.getElementById('v3QuickRole'),
    lim=document.getElementById('v3QuickLimit'),cor=document.getElementById('v3QuickColor');
  if(!sr||!role||!lim||!cor)return;
  const r=(S.rasters||[]).find(x=>String(x.id)===String(sr.value));
  if(!r){role.disabled=lim.disabled=cor.disabled=true;v3QuickRuleText();return;}
  role.disabled=lim.disabled=false;r._v3=r._v3||{papel:'terreno',cor:'#b5651d',limId:''};
  role.value=r._v3.papel||'terreno';
  lim.value=r._v3.recorteAtivo===true?String(r._v3.limId||''):'';
  cor.value=r._v3.cor||v3QuickRoleDefaults(role.value,'');
  cor.disabled=role.value==='terreno';
  v3QuickRuleText();
}
function v3SurfaceMenuSync(preserveSurface){
  const sr=document.getElementById('v3QuickSurface'),lim=document.getElementById('v3QuickLimit');
  if(!sr||!lim)return;
  const old=preserveSurface?sr.value:'';
  sr.innerHTML=(S.rasters||[]).length
    ?(S.rasters||[]).map(r=>`<option value="${r.id}">${esc(r.name)}</option>`).join('')
    :'<option value="">— nenhuma superfície —</option>';
  if(old&&[...sr.options].some(o=>String(o.value)===String(old)))sr.value=old;
  const oldLim=lim.value;
  lim.innerHTML='<option value="">— sem recorte —</option>'+v3QuickLimitLayers().map(l=>
    `<option value="${l.id}">${esc(l.name)} · ${l.gtype==='polygon'?'polígono':'linha'}</option>`).join('');
  if(oldLim&&[...lim.options].some(o=>String(o.value)===String(oldLim)))lim.value=oldLim;
  v3SurfaceMenuLoad();
}
(function initV3SurfaceMenu(){
  const btn=document.getElementById('btnV3SurfaceMenu'),menu=document.getElementById('v3SurfaceMenu'),
    close=document.getElementById('btnV3SurfaceClose'),sr=document.getElementById('v3QuickSurface'),
    role=document.getElementById('v3QuickRole'),cor=document.getElementById('v3QuickColor'),
    apply=document.getElementById('btnV3QuickApply');
  if(!btn||!menu)return;
  btn.onclick=e=>{e.stopPropagation();const abrir=!menu.classList.contains('open');menu.classList.toggle('open',abrir);btn.classList.toggle('on',abrir);if(abrir)v3SurfaceMenuSync(true);};
  if(close)close.onclick=()=>{menu.classList.remove('open');btn.classList.remove('on');};
  if(sr)sr.onchange=v3SurfaceMenuLoad;
  if(role)role.onchange=()=>{cor.value=v3QuickRoleDefaults(role.value,cor.value);cor.disabled=role.value==='terreno';v3QuickRuleText();};
  if(apply)apply.onclick=()=>{
    const r=(S.rasters||[]).find(x=>String(x.id)===String(sr.value));
    if(!r){toast('Carregue ou gere uma superfície primeiro');return;}
    const lim=document.getElementById('v3QuickLimit');
    r._v3=r._v3||{};r._v3.papel=role.value;r._v3.limId=lim?lim.value:'';
    r._v3.recorteAtivo=!!r._v3.limId;
    r._v3.cor=cor.value;r._v3.tex=role.value==='terreno'?(r._v3.tex||'hipso'):'solida';
    r._exactClipRings=null;
    try{if(typeof renderRaster==='function')renderRaster(r);}catch(e){}
    nodeSetVis({t:'R',id:r.id,o:r},true);
    try{if(typeof zApply==='function')zApply();refreshUI();refresh3DPanel();}catch(e){}
    v3RenderAgora();
    toast(r._v3.limId?'Recorte 3D aplicado na linha limite':'Superfície 3D aplicada sem recorte');
  };
  const render=document.getElementById('btnV3RenderTop'),measure=document.getElementById('btnV3MeasureTop');
  if(render)render.onclick=v3RenderAgora;
  if(measure)measure.onclick=()=>{const b=document.getElementById('btnV3Meas');if(b)b.click();else if(typeof v3MeasToggle==='function')v3MeasToggle();};
  document.addEventListener('click',e=>{if(menu.classList.contains('open')&&!menu.contains(e.target)&&e.target!==btn){menu.classList.remove('open');btn.classList.remove('on');}});
})();

/* Tooltip próprio acima dos ícones. O texto vem de title/aria-label e funciona
   igualmente com mouse, caneta e foco por teclado; o title nativo é removido
   ao primeiro uso para não aparecer duplicado. */
(function installAlagisIconTips(){
  const tip=document.createElement('div');tip.className='alagis-icon-tip';document.body.appendChild(tip);
  let atual=null;
  const seletor='.layoutbar button,#v3dViewControls button,.mtool,.tbtn[aria-label]';
  const hide=()=>{tip.style.display='none';atual=null;};
  const show=b=>{
    if(!b)return;const novo=b.getAttribute('title');if(novo){b.dataset.alagisTip=novo;b.removeAttribute('title');}
    const txt=b.dataset.alagisTip||b.getAttribute('aria-label');if(!txt)return;
    atual=b;tip.textContent=txt;tip.style.display='block';tip.style.left='0px';tip.style.top='0px';
    requestAnimationFrame(()=>{if(atual!==b)return;const r=b.getBoundingClientRect(),tr=tip.getBoundingClientRect();
      let left=r.left+(r.width-tr.width)/2;left=Math.max(5,Math.min(innerWidth-tr.width-5,left));
      let top=r.top-tr.height-7;if(top<5)top=r.bottom+7;
      tip.style.left=Math.round(left)+'px';tip.style.top=Math.round(top)+'px';});
  };
  document.addEventListener('pointerover',e=>{const b=e.target.closest&&e.target.closest(seletor);if(b)show(b);});
  document.addEventListener('pointerout',e=>{if(atual&&(!e.relatedTarget||!atual.contains(e.relatedTarget)))hide();});
  document.addEventListener('focusin',e=>{const b=e.target.closest&&e.target.closest(seletor);if(b)show(b);});
  document.addEventListener('focusout',hide);
})();

/* Área de trabalho Mina: toda superfície carregada entra na primeira cena e
   os vetores são projetados automaticamente. Novas camadas disparam uma
   atualização debounced, sem exigir o botão Renderizar 3D. */
const MINA3D_AUTO={timer:0,running:false,pending:false,last:'',lastSurf:'',iniciada:false};
function mina3DStatus(msg,erro){
  const el=document.getElementById('mina3dStatus'); if(!el) return;
  el.textContent=msg||'';
  el.classList.toggle('on',!!msg);
  el.style.borderColor=erro?'#d9534f':'#7f9bb2';
}
/* UM ÚNICO GATILHO para atualizar a cena.
   Antes cada lugar chamava mina3DAuto direto (e alguns nem chamavam). Agora
   todo gesto passa por aqui: se a atualização automática estiver ligada, a
   cena se refaz; se estiver desligada, o usuário atualiza pelo botão. */
function v3SyncRasterOpacity(){
  const rasters=new Map((S.rasters||[]).map(r=>[String(r.id),r]));
  (V3.meshes||[]).forEach(mesh=>{
    if(!mesh.userData||!mesh.userData.alagisSurface)return;
    const r=rasters.get(String(mesh.userData.rasterId));if(!r)return;
    mesh.traverse(o=>{if(o.material)v3ApplySurfaceOpacity(r,o.material);});
  });
}
function v3Auto(){
  if(S._view!=='v3d')return;
  /* O controle de opacidade é leve e também responde quando a reconstrução
     automática da geometria foi suspensa. Nunca altera os materiais de furos. */
  v3SyncRasterOpacity();
  const cb=document.getElementById('v3dAuto');
  const aviso=document.getElementById('v3dPendente');
  if(cb&&!cb.checked&&V3.meshes?.length&&V3._surfaceDataSignature===v3SurfaceDataSignature()){
    /* "Atualização automática" pode suspender a reconstrução pesada dos
       MDTs, mas nunca a sincronização dos vetores. Cor, classe e olho da
       árvore são comandos leves e precisam aparecer no 3D imediatamente. */
    if(V3.scene&&V3.vecGroup&&typeof v3BuildVectors==='function')v3BuildVectors();
    S._v3Pendente=true;
    if(aviso)aviso.style.display='';
    return;
  }
  S._v3Pendente=false;
  if(aviso)aviso.style.display='none';
  try{ mina3DAuto(false); }catch(e){ console.warn('v3Auto',e); }
}
function v3RenderAgora(){
  if(S._view!=='v3d'){ switchView('v3d'); return; }
  S._v3Pendente=false;
  const aviso=document.getElementById('v3dPendente');
  if(aviso)aviso.style.display='none';
  try{ mina3DAuto(true); }catch(e){ console.warn('v3RenderAgora',e); }
}
function mina3DAuto(force){
  if(S._view!=='v3d') return;
  clearTimeout(MINA3D_AUTO.timer);
  MINA3D_AUTO.timer=setTimeout(async()=>{
    if(S._view!=='v3d') return;
    if(MINA3D_AUTO.running){ MINA3D_AUTO.pending=true; return; }
    try{
      refresh3DPanel();
      S._v3SurfOn=S._v3SurfOn||{};
      const todas=S.rasters||[];
      /* Montar simultaneamente todos os MDTs históricos pode consumir milhões
         de triângulos e deixar o WebGL branco. A Mina segue a árvore:
         entram automaticamente as superfícies LIGADAS; se nenhuma estiver
         ligada, usa a superfície ativa ou o MDT principal como terreno. */
      /* a árvore manda: nada de congelar uma seleção inicial que depois
         não acompanha o que o usuário liga e desliga */
      const iniciais=v3SuperficiesAtivas();
      const idsIniciais=new Set(iniciais.map(r=>String(r.id)));
      todas.forEach(r=>{
        const cb=document.querySelector(`#v3dRas input[data-rid="${r.id}"]`);
        if(cb) cb.checked=idsIniciais.has(String(r.id));
      });
      MINA3D_AUTO.iniciada=true;
      const ativas=iniciais;
      const surfSig=ativas.map(r=>{
        const d=r.d||{},v=r._v3||{};
        /* As superfícies já foram filtradas pela visibilidade da árvore;
           os demais campos detectam mudanças reais nos dados do MDT. */
        return [r.id,r.name||'',d.nc,d.nr,d.cs,d.native===true,d.resampled,d._full&&d._full.nc,
          d._full&&d._full.nr,v3NativeSourceIdentity(r),v.papel||'',v.cor||'',
          v.limId||'',(v.limIds||[]).map(idL=>{
            /* Feição PRJ: o alvo real muda de id e de geometria a cada
               render da projeção — a assinatura acompanha para o furo não
               ficar defasado na cena. */
            if(/^PRJ:/.test(String(idL))){
              const lid=String(idL).slice(4),
                Lp=(S.layers||[]).find(l=>l._projecaoIntersection&&String(l._projecaoLineId)===String(lid));
              return idL+'>'+(Lp?Lp.id+':'+((Lp.features||[]).length):'0');
            }
            return idL;
          }).join(','),v.modoRecorte||'',
          v.limId||'',v.fechaVazios?1:0,r._tinMethod||'',r._rev||d._rev||''].join(':');
      }).join('|')+'#img:'+(S.img&&S.img.url||'')+'#tex:'+(S._v3TexTipo||'')+
        '#drape:'+!!((document.getElementById('v3dDrape')||{}).checked);
      /* Cores, espessuras, tracejados e olhos das classes fazem parte da
         assinatura. Alterar estilo no 2D passa então pelo caminho rápido que
         remonta apenas V3.vecGroup, preservando terreno e câmera. */
      const vecSig=(S.layers||[]).map(L=>`${L.id}:${L.visible!==false?1:0}:`+
        `${(L.features||[]).length}:${L._rev||''}:`+
        `${JSON.stringify(L.sym||{})}`).join('|');
      const sig=surfSig+'#vec:'+vecSig;
      const vet3=v3VectorExtent();
      if(!ativas.length&&!vet3){
        // Remover o último papel de uma malha não pode deixar seu objeto
        // antigo na cena enquanto a árvore já está vazia.
        if(V3.vecGroup?.children.some(o=>o.userData?.meshId))v3BuildVectors();
        const out=document.getElementById('v3dOut');
        if(out) out.textContent='A cena 3D é montada com as superfícies e camadas LIGADAS na árvore.';
        mina3DStatus('Ligue uma superfície ou uma camada na árvore para montar a cena.',true);
        return;
      }
      /* Se só mudou uma camada vetorial, refaz apenas o grupo vetorial. A
         malha, o renderer e a câmera permanecem exatamente onde estavam. */
      if(!force && surfSig===MINA3D_AUTO.lastSurf && V3.scene){
        if(sig!==MINA3D_AUTO.last) v3BuildVectors();
        MINA3D_AUTO.last=sig;
        v3AbaSync('v3d'); v3Resize(); mina3DStatus(''); return;
      }
      MINA3D_AUTO.running=true;
      mina3DStatus(`Montando a cena 3D · ${ativas.length} superfície(s)`+
        (vet3?` · ${vet3.n.toLocaleString('pt-BR')} vértices vetoriais`:'')+'…');
      // Aguarda o navegador aplicar display:block e medir o canvas.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      await build3D();
      if(!V3.scene || !V3.ren || !V3.cam)
        throw new Error((document.getElementById('v3dOut')||{}).textContent||
          'o motor WebGL não conseguiu criar a cena');
      MINA3D_AUTO.last=sig;
      MINA3D_AUTO.lastSurf=surfSig;
      v3AbaSync('v3d');
      v3Resize();
      mina3DStatus('');
    }catch(err){
      MINA3D_AUTO.lastSurf=null;MINA3D_AUTO.last=null;
      const msg=(err&&err.message)||String(err);
      const out=document.getElementById('v3dOut');
      if(out) out.textContent='Falha ao atualizar a cena 3D: '+msg;
      mina3DStatus('A cena 3D não carregou: '+msg,true);
      try{cmdLog('Visão 3D: '+msg,'erro');}catch(_){}
    }finally{
      MINA3D_AUTO.running=false;
      if(MINA3D_AUTO.pending){
        MINA3D_AUTO.pending=false;
        mina3DAuto(false);
      }
    }
  },80);
}
function v3dMapBg(){
  const cor=getComputedStyle(document.documentElement).getPropertyValue('--map-bg').trim();
  return cor || (document.body.classList.contains('light')?'#ffffff':'#0a0e14');
}
function v3dCurrentBg(){
  const sel=document.getElementById('v3dBg'), ci=document.getElementById('v3dBgC');
  if(!sel || sel.value==='theme') return v3dMapBg();
  if(sel.value==='custom') return (ci&&ci.value)||v3dMapBg();
  return sel.value;
}
function v3dApplyCurrentBg(persist=true){
  const cor=v3dCurrentBg();
  const el=document.getElementById('v3d'); if(el) el.style.background=cor;
  try{ if(V3.scene && window.THREE) V3.scene.background=new THREE.Color(cor); }catch(e){}
  const ci=document.getElementById('v3dBgC');
  const sel=document.getElementById('v3dBg');
  if(ci && (!sel || sel.value!=='custom')) ci.value=cor;
  if(persist && sel){
    try{
      localStorage.setItem('ccm_v3dbg_mode',sel.value);
      if(sel.value==='custom') localStorage.setItem('ccm_v3dbg',cor);
    }catch(_){}
  }
}
function v3dSetBg(cor){
  const sel=document.getElementById('v3dBg');
  if(sel && cor==='theme') sel.value='theme';
  v3dApplyCurrentBg(true);
}
