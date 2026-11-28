/* GeoMine — Publicador: programa do visualizador entregue ao cliente (tela + three.js).
   Página única, sem internet e sem login. As contas ficam em viewer-core.js.
   Cena: X = leste, Y = cota (× exagero vertical), Z = −norte, com a origem no centro do modelo. */
(function(){
'use strict';
const C=window.GeoMinePubCore, $=id=>document.getElementById(id), f=C.fmt;
const falha=texto=>{ $('erroTexto').textContent=texto; $('erro').classList.add('on'); };
let D;
try{ D=JSON.parse($('gmpubDados').textContent); }
catch(e){ falha('Os dados desta publicação estão incompletos. Peça o arquivo de novo a quem o enviou.'); return; }
if(!window.THREE||!C){ falha('O programa desta página não carregou por inteiro. Peça o arquivo de novo a quem o enviou.'); return; }

let sups;
try{ sups=(D.superficies||[]).map(C.superficie); }catch(e){ falha(String(e.message||e)); return; }
if(!sups.length){ falha('Esta publicação não traz nenhuma superfície.'); return; }
const O=D.origem||[0,0];
let X0=Infinity,X1=-Infinity,Y0=Infinity,Y1=-Infinity,Z0=Infinity,Z1=-Infinity;
for(const s of sups){
  X0=Math.min(X0,s.x0); X1=Math.max(X1,s.x0+(s.nc-1)*s.dx); Y1=Math.max(Y1,s.y0); Y0=Math.min(Y0,s.y0-(s.nr-1)*s.dy);
  Z0=Math.min(Z0,s.zmin); Z1=Math.max(Z1,s.zmax);
}
const CX=(X0+X1)/2, CY=(Y0+Y1)/2, TAM=Math.max(1,Math.hypot(X1-X0,Y1-Y0));
let VE=1;
/* real → cena (dentro do grupo, que aplica o exagero vertical) */
const P3=(x,y,z)=>new THREE.Vector3(x-CX,z-Z0,-(y-CY));

/* ---------- tema ---------- */
const escuroDoAparelho=()=>!!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.body.classList.toggle('escuro',D.tema?D.tema==='escuro':escuroDoAparelho());
const corCSS=nome=>getComputedStyle(document.body).getPropertyValue(nome).trim();

/* ---------- cena ---------- */
const tela=$('cena'), palco=$('palco');
let ren;
try{ ren=new THREE.WebGLRenderer({canvas:tela,antialias:true,alpha:false,powerPreference:'high-performance'}); }
catch(e){ falha('Este navegador não abriu a vista 3D (WebGL). Tente no Chrome, no Edge ou no Safari atualizados.'); return; }
ren.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
const cena=new THREE.Scene(), cam=new THREE.PerspectiveCamera(42,1,TAM/4000,TAM*30), raiz=new THREE.Group();
cena.add(raiz);
cena.add(new THREE.AmbientLight(0xffffff,0.56));
const sol=new THREE.DirectionalLight(0xffffff,0.64); sol.position.set(-0.5,0.707,-0.5); cena.add(sol);   // de noroeste, a 45°
const ctl=new THREE.OrbitControls(cam,tela);
ctl.enableDamping=false; ctl.screenSpacePanning=false; ctl.maxPolarAngle=Math.PI/2-0.02; ctl.minDistance=TAM/800; ctl.maxDistance=TAM*8;
ctl.zoomSpeed=1.1; ctl.rotateSpeed=0.7;
let pedido=0;
const pede=()=>{ if(!pedido) pedido=requestAnimationFrame(()=>{ pedido=0; bussola(); ren.render(cena,cam); }); };
ctl.addEventListener('change',pede);
function ajustaTamanho(){
  const w=Math.max(1,palco.clientWidth), h=Math.max(1,palco.clientHeight);
  ren.setSize(w,h,false); cam.aspect=w/h; cam.updateProjectionMatrix(); pede();
}
function fundo(){ ren.setClearColor(new THREE.Color(corCSS('--fundo')||'#eef2f6'),1); pede(); }
const alvoY=()=>((Z0+Z1)/2-Z0)*VE;
function camera(az,polar,dist){
  ctl.target.set(0,alvoY(),0);
  cam.position.set(dist*Math.sin(polar)*Math.sin(az),alvoY()+dist*Math.cos(polar),dist*Math.sin(polar)*Math.cos(az));
  cam.up.set(0,1,0); ctl.update(); pede();
}
const esferica=()=>{ const v=cam.position.clone().sub(ctl.target), d=v.length(); return {d, polar:Math.acos(Math.max(-1,Math.min(1,v.y/d))), az:Math.atan2(v.x,v.z)}; };
function bussola(){ $('agulha').setAttribute('transform','rotate('+(ctl.getAzimuthalAngle()*180/Math.PI).toFixed(1)+' 17 17)'); }

/* ---------- superfícies ---------- */
const orto=D.ortofoto&&D.ortofoto.img&&Array.isArray(D.ortofoto.uv)?D.ortofoto:null;
let texOrto=null, ortoLigada=!!orto;
const alfaOrto=orto?C.alfa(orto.alfa):null;
const matCor=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
/* Terreno original um fio para trás: na faixa em que ele e um MDT recortado são o mesmo chão, vale o recorte. */
const recuo={polygonOffset:true,polygonOffsetFactor:1.5,polygonOffsetUnits:1.5};
const matCorT=new THREE.MeshLambertMaterial(Object.assign({vertexColors:true,side:THREE.DoubleSide},recuo));
let matOrto=null, matOrtoT=null;
if(orto){
  texOrto=new THREE.TextureLoader().load(orto.img,()=>{ texOrto.needsUpdate=true; pede(); },undefined,()=>{ ortoLigada=false; aplicaOrto(); avisa('A imagem da ortofoto não pôde ser lida neste aparelho.'); });
  texOrto.wrapS=texOrto.wrapT=THREE.ClampToEdgeWrapping; texOrto.minFilter=THREE.LinearMipmapLinearFilter;
  texOrto.anisotropy=Math.min(8,ren.capabilities.getMaxAnisotropy());
  matOrto=new THREE.MeshLambertMaterial({map:texOrto,side:THREE.DoubleSide});
  matOrtoT=new THREE.MeshLambertMaterial(Object.assign({map:texOrto,side:THREE.DoubleSide},recuo));
}
const COR_OBRA='#b9a58c';
const hexRGB=h=>{ const c=new THREE.Color(h||'#8fae6b'); return [c.r,c.g,c.b]; };
function malha(s){
  const nc=s.nc, nr=s.nr, n=nc*nr, pos=new Float32Array(n*3), cor=new Float32Array(n*3), nor=new Float32Array(n*3);
  const comOrto=!!orto&&s.papel!=='projeto', uv=comOrto?new Float32Array(n*2):null, U=orto?orto.uv:null;
  const solida=s.papel==='projeto'?hexRGB(s.cor||'#c9a26b'):null, daObra=s.obra?hexRGB(s.cor||COR_OBRA):null, faixa=Math.max(1e-6,Z1-Z0), z=s.z;
  const obra=i=>C.bit(s.obra,i), oculta=i=>C.bit(s.oculta,i);
  for(let r=0;r<nr;r++) for(let c=0;c<nc;c++){
    const i=r*nc+c, v=z[i], x=s.x0+c*s.dx, y=s.y0-r*s.dy, tem=v===v;
    pos[3*i]=x-CX; pos[3*i+1]=tem?v-Z0:0; pos[3*i+2]=-(y-CY);
    const k=solida||(daObra&&obra(i)?daObra:C.rampa(((tem?v:Z0)-Z0)/faixa)); cor[3*i]=k[0]; cor[3*i+1]=k[1]; cor[3*i+2]=k[2];
    /* normal pela diferença das vizinhas (cai na própria célula junto de um furo) */
    const l=c>0?z[i-1]:NaN, d=c<nc-1?z[i+1]:NaN, a=r>0?z[i-nc]:NaN, b=r<nr-1?z[i+nc]:NaN;
    const zl=l===l?l:v, zd=d===d?d:v, za=a===a?a:v, zb=b===b?b:v;
    const gx=tem?(zd-zl)/((l===l&&d===d?2:1)*s.dx):0, gy=tem?(za-zb)/((a===a&&b===b?2:1)*s.dy):0, m=Math.hypot(gx,gy,1);
    nor[3*i]=-gx/m; nor[3*i+1]=1/m; nor[3*i+2]=gy/m;
    if(uv){ uv[2*i]=U[0]*x+U[1]*y+U[2]; uv[2*i+1]=U[3]*x+U[4]*y+U[5]; }
  }
  /* dois triângulos por célula; os que caem inteiros dentro da ortofoto vêm primeiro (grupo 0) */
  /* a foto só vai onde o chão é o da foto: fora da imagem, onde ela é transparente e em cima da obra, cor */
  const dentro=[], fora=[], naImagem=i=>{ if(obra(i)) return false; const u=uv[2*i], w=uv[2*i+1]; return u>=0&&u<=1&&w>=0&&w<=1&&!C.semImagem(alfaOrto,u,w); };
  for(let r=0;r<nr-1;r++) for(let c=0;c<nc-1;c++){
    const a=r*nc+c, b=a+1, d=a+nc, e=d+1, ta=z[a]===z[a]&&!oculta(a), tb=z[b]===z[b]&&!oculta(b), td=z[d]===z[d]&&!oculta(d), te=z[e]===z[e]&&!oculta(e);
    if(ta&&tb&&td) ((uv&&naImagem(a)&&naImagem(b)&&naImagem(d))?dentro:fora).push(a,d,b);
    if(tb&&td&&te) ((uv&&naImagem(b)&&naImagem(d)&&naImagem(e))?dentro:fora).push(b,d,e);
  }
  const idx=new Uint32Array(dentro.length+fora.length); idx.set(dentro,0); idx.set(fora,dentro.length);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3)); g.setAttribute('color',new THREE.BufferAttribute(cor,3));
  g.setAttribute('normal',new THREE.BufferAttribute(nor,3)); if(uv) g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  g.setIndex(new THREE.BufferAttribute(idx,1)); g.addGroup(0,dentro.length,0); g.addGroup(dentro.length,fora.length,1);
  g.computeBoundingSphere();
  const atras=s.papel==='terreno'&&sups.length>1;
  const m=new THREE.Mesh(g,[matCor,matCor]); m.userData={sup:s,comOrto:comOrto&&dentro.length>0,cor:atras?matCorT:matCor,orto:atras?matOrtoT:matOrto};
  return m;
}
const malhas=sups.map(s=>{ const m=malha(s); raiz.add(m); return m; });
function aplicaOrto(){ for(const m of malhas){ const u=m.userData; m.material=[u.comOrto&&ortoLigada&&u.orto?u.orto:u.cor,u.cor]; } pede(); }
aplicaOrto();
const supsVisiveis=()=>malhas.filter(m=>m.visible).map(m=>m.userData.sup);

/* ---------- vetores ---------- */
const L3=window.GeoMine3DLines;
function vetor(v){
  const xyz=C.f32(v.xyz), g=new THREE.Group(); let k=0; g.userData={nome:v.nome};
  const pouso=(x,y)=>{ const t=C.topoEm(sups,x,y); return t?t.z:NaN; };
  const cel=Math.min.apply(null,sups.map(s=>Math.min(s.dx,s.dy)));
  if(v.tipo==='point'){
    const porEstilo=new Map();
    for(let p=0;p<v.tam.length;p++) for(let q=0;q<v.tam[p];q++,k+=3){
      let z=xyz[k+2]; if(z!==z) z=pouso(xyz[k],xyz[k+1]); if(z!==z) continue;
      const e=v.est[p]; if(!porEstilo.has(e)) porEstilo.set(e,[]); porEstilo.get(e).push(xyz[k]-CX,z-Z0+0.05,-(xyz[k+1]-CY));
    }
    for(const [e,arr] of porEstilo){
      const bg=new THREE.BufferGeometry(); bg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(arr),3));
      g.add(new THREE.Points(bg,new THREE.PointsMaterial({color:v.estilos[e].cor,size:7,sizeAttenuation:false,map:bolinha(),alphaTest:0.5,transparent:true})));
    }
    return g;
  }
  const fitas=L3&&v.tam.length<=700, soltas=new Map();
  for(let p=0;p<v.tam.length;p++){
    const n=v.tam[p], e=v.estilos[v.est[p]], pts=[];
    for(let q=0;q<n;q++,k+=3){
      const x=xyz[k], y=xyz[k+1], z=xyz[k+2];
      if(z===z){ pts.push(P3(x,y,z+0.03)); continue; }
      /* sem cota própria: pousa no terreno, com pontos intermediários para acompanhar o relevo */
      if(q>0&&xyz[k-1]!==xyz[k-1]){
        const xa=xyz[k-3], ya=xyz[k-2], m=Math.min(400,Math.ceil(Math.hypot(x-xa,y-ya)/(cel*2)));
        for(let j=1;j<m;j++){ const t=j/m, zx=pouso(xa+(x-xa)*t,ya+(y-ya)*t); if(zx===zx) pts.push(P3(xa+(x-xa)*t,ya+(y-ya)*t,zx+0.3)); }
      }
      const zp=pouso(x,y); if(zp===zp) pts.push(P3(x,y,zp+0.3));
    }
    if(pts.length<2) continue;
    if(fitas){
      const fita=L3.create(THREE,pts,{color:e.cor,width:Math.max(1.4,Math.min(4,e.peso||1.5)),dash:e.tracejado?'6 4':'',opacity:1});
      if(fita) g.add(fita);
    }else{
      const id=v.est[p]; if(!soltas.has(id)) soltas.set(id,[]);
      const arr=soltas.get(id); for(let j=1;j<pts.length;j++) arr.push(pts[j-1].x,pts[j-1].y,pts[j-1].z,pts[j].x,pts[j].y,pts[j].z);
    }
  }
  for(const [id,arr] of soltas){
    const bg=new THREE.BufferGeometry(); bg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(arr),3));
    g.add(new THREE.LineSegments(bg,new THREE.LineBasicMaterial({color:v.estilos[id].cor})));
  }
  return g;
}
let texBolinha=null;
function bolinha(){
  if(texBolinha) return texBolinha;
  const c=document.createElement('canvas'); c.width=c.height=64; const x=c.getContext('2d');
  x.fillStyle='#fff'; x.beginPath(); x.arc(32,32,26,0,7); x.fill(); x.lineWidth=7; x.strokeStyle='rgba(0,0,0,.55)'; x.stroke();
  texBolinha=new THREE.CanvasTexture(c); return texBolinha;
}
const vetores=(D.vetores||[]).map(v=>{ let g; try{ g=vetor(v); }catch(e){ g=new THREE.Group(); } g.visible=v.visivel!==false; raiz.add(g); return {v,g}; });

/* ---------- card 1: camadas ---------- */
function linha(pai,rotulo,ligado,amostra,ao,nota){
  const d=document.createElement('div'); d.className='lin';
  const l=document.createElement('label'), c=document.createElement('input'); c.type='checkbox'; c.checked=ligado;
  c.onchange=()=>{ ao(c.checked); pede(); };
  const t=document.createElement('span'); t.textContent=rotulo; t.title=rotulo;
  l.append(c); if(amostra) l.append(amostra); l.append(t); d.append(l);
  if(nota){ const s=document.createElement('small'); s.textContent=nota; d.append(s); }
  pai.append(d); return c;
}
const quadro=cor=>{ const i=document.createElement('i'); i.className='amostra'; i.style.background=cor; return i; };
const traco=(cor,tracejado)=>{ const i=document.createElement('i'); i.className='traco'; i.style.borderTopColor=cor; if(tracejado) i.style.borderTopStyle='dashed'; return i; };
(function camadas(){
  const pai=$('camadas');
  malhas.forEach(m=>{
    const s=m.userData.sup;
    linha(pai,s.nome,true,quadro(s.papel==='projeto'?(s.cor||'#c9a26b'):s.papel==='recorte'?'linear-gradient(90deg,#5c9954 0 45%,'+(s.cor||COR_OBRA)+' 45% 100%)':'linear-gradient(90deg,#5c9954,#dbcc75,#c28f54)'),v=>{ m.visible=v; },
      s.papel==='projeto'?'projeto':s.papel==='recorte'?'terreno + obra':'terreno');
  });
  if(orto) linha(pai,'Ortofoto sobre o terreno',true,quadro('linear-gradient(135deg,#3f6b3a,#9a8a62)'),v=>{ ortoLigada=v; aplicaOrto(); },'imagem');
  vetores.forEach(({v,g})=>{
    const e0=v.estilos[0]||{cor:'#222'};
    linha(pai,v.nome,g.visible,v.tipo==='point'?quadro(e0.cor):traco(e0.cor,e0.tracejado),x=>{ g.visible=x; },v.tipo==='point'?'pontos':'linhas');
    const rot=v.estilos.filter(e=>e.rotulo);
    if(rot.length>1){
      const leg=document.createElement('div'); leg.className='legenda';
      rot.slice(0,12).forEach(e=>{ const s=document.createElement('span'); s.append(traco(e.cor,e.tracejado),document.createTextNode(e.rotulo)); leg.append(s); });
      pai.append(leg);
    }
  });
})();

/* ---------- card 2: vista ---------- */
const DIST=TAM*1.25;
function vista(qual){
  if(qual==='planta') camera(0,0.0008,DIST*0.95);
  else if(qual==='3d') camera(Math.PI/4,0.96,DIST);
  else{ const e=esferica(); camera(e.az,Math.max(0.0008,e.polar),DIST); }
}
document.querySelectorAll('[data-vista]').forEach(b=>b.onclick=()=>vista(b.dataset.vista));
$('exagero').onchange=()=>{
  const antes=ctl.target.y; VE=+$('exagero').value||1; raiz.scale.y=VE;
  const dy=alvoY()-antes; ctl.target.y+=dy; cam.position.y+=dy; ctl.update(); pede();
};
$('bussola').onclick=()=>{ const e=esferica(); camera(0,Math.max(0.0008,e.polar),e.d); };

/* ---------- toque → ponto do terreno ---------- */
const raio=new THREE.Raycaster();
function tocaEm(clientX,clientY){
  const r=tela.getBoundingClientRect();
  raio.setFromCamera(new THREE.Vector2(((clientX-r.left)/r.width)*2-1,-((clientY-r.top)/r.height)*2+1),cam);
  const o=raio.ray.origin, d=raio.ray.direction;
  const dr=[d.x,-d.z,d.y/VE], m=Math.hypot(dr[0],dr[1],dr[2])||1;
  return C.intersecaoRaio(supsVisiveis(),[o.x+CX,-o.z+CY,o.y/VE+Z0],[dr[0]/m,dr[1]/m,dr[2]/m],TAM*40);
}
const real=p=>'E '+f(p.x+O[0],1)+' · N '+f(p.y+O[1],1)+' · cota '+f(p.z,2)+' m';
let avisoT=0;
function avisa(texto){ $('aviso').textContent=texto; clearTimeout(avisoT); if(texto) avisoT=setTimeout(()=>{ $('aviso').textContent=''; },4200); }

/* ---------- card 3: medidas ---------- */
const CORES=['#e11d48','#2563eb','#059669','#d97706','#7c3aed','#0891b2'];
const gMed=new THREE.Group(); raiz.add(gMed);
let ferramenta=null, pendente=null, serie=0;
const medidas=[];
const DICAS={dois:['Toque no <b>primeiro</b> ponto do terreno.','Agora toque no <b>segundo</b> ponto.'],
  ponto:['Toque no ponto do terreno a medir.'], perfil:['Toque no <b>início</b> do perfil.','Agora toque no <b>fim</b> do perfil.']};
function dica(){ $('dica').innerHTML=ferramenta?DICAS[ferramenta][pendente?1:0]:'Escolha uma medida e toque no terreno. Girar: um dedo ou o botão esquerdo. Mover: dois dedos ou o botão direito.'; }
function escolhe(qual){
  ferramenta=ferramenta===qual?null:qual; soltaPendente();
  document.querySelectorAll('[data-med]').forEach(b=>b.classList.toggle('on',b.dataset.med===ferramenta));
  tela.style.cursor=ferramenta?'crosshair':''; dica();
}
function soltaPendente(){ if(pendente){ gMed.remove(pendente.marca); pendente=null; pede(); } }
document.querySelectorAll('[data-med]').forEach(b=>b.onclick=()=>escolhe(b.dataset.med));
function marca(p,cor){
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(new Float32Array([p.x-CX,p.z-Z0,-(p.y-CY)]),3));
  const m=new THREE.Points(g,new THREE.PointsMaterial({color:cor,size:13,sizeAttenuation:false,map:bolinha(),alphaTest:0.5,transparent:true,depthTest:false}));
  m.renderOrder=20; return m;
}
function fita(pts,cor,larg){
  let o=L3?L3.create(THREE,pts,{color:cor,width:larg||3,dash:'',opacity:1}):null;
  if(!o){ const g=new THREE.BufferGeometry().setFromPoints(pts); o=new THREE.Line(g,new THREE.LineBasicMaterial({color:cor})); }
  o.material.depthTest=false; o.renderOrder=19; return o;
}
function cartao(m){
  const d=document.createElement('div'); d.className='med';
  const h=document.createElement('h3'), i=document.createElement('i'), t=document.createElement('span'), x=document.createElement('button');
  i.style.background=m.cor; t.textContent=m.titulo; x.textContent='×'; x.title='Apagar esta medida'; x.setAttribute('aria-label','Apagar esta medida');
  x.onclick=()=>apaga(m); h.append(i,t,x); d.append(h); m.el=d;
  $('medidas').prepend(d); $('limpaLinha').style.display=''; return d;
}
const par=(dl,k,v,largo)=>{ const a=document.createElement('dt'), b=document.createElement('dd'); a.textContent=k; b.textContent=v; if(largo){ a.className=b.className='largo'; } dl.append(a,b); };
function apaga(m){
  m.objs.forEach(o=>{ gMed.remove(o); if(o.geometry) o.geometry.dispose(); }); m.el.remove();
  medidas.splice(medidas.indexOf(m),1); if(!medidas.length) $('limpaLinha').style.display='none'; pede();
}
$('limpa').onclick=()=>{ medidas.slice().forEach(apaga); soltaPendente(); };
const sinal=v=>(v>0?'+':v<0?'−':'')+f(Math.abs(v),2);
function medeDois(a,b,cor){
  const r=C.doisPontos(a,b), m={titulo:'Inclinação entre dois pontos',cor,objs:[marca(a,cor),marca(b,cor),fita([P3(a.x,a.y,a.z),P3(b.x,b.y,b.z)],cor,3)]};
  m.objs.forEach(o=>gMed.add(o)); medidas.push(m);
  const d=cartao(m), g=document.createElement('div'); g.className='maior';
  g.innerHTML=f(Math.abs(r.pct),1)+' % <small>· '+f(r.graus,1)+'° · '+C.talude(r.razao)+(r.dh>1e-9?(r.sobe?' · subindo':r.dv<0?' · descendo':''):'')+'</small>';
  const dl=document.createElement('dl');
  par(dl,'Desnível',sinal(r.dv)+' m'); par(dl,'Distância horizontal',f(r.dh,2)+' m'); par(dl,'Distância inclinada',f(r.d3,2)+' m'); par(dl,'Rumo de A para B',C.rumo(r.azimute));
  par(dl,'Ponto A',real(a),true); par(dl,'Ponto B',real(b),true);
  d.append(g,dl); m.dados=r;
}
function medePonto(p,cor){
  const r=C.inclinacaoEm(p.sup,p.x,p.y); if(!r){ avisa('Não há malha suficiente em volta deste ponto para medir a inclinação.'); return; }
  const m={titulo:'Inclinação do terreno no ponto',cor,objs:[marca(p,cor)]};
  if(r.caimento!=null){
    /* seta de caimento: três células morro abaixo, pousada no terreno */
    const az=r.caimento*Math.PI/180, L=3*p.sup.celula, pts=[];
    for(let i=0;i<=6;i++){ const x=p.x+Math.sin(az)*L*i/6, y=p.y+Math.cos(az)*L*i/6, z=C.alturaEm(p.sup,x,y); if(z===z) pts.push(P3(x,y,z)); }
    if(pts.length>1) m.objs.push(fita(pts,cor,4));
  }
  m.objs.forEach(o=>gMed.add(o)); medidas.push(m);
  const d=cartao(m), g=document.createElement('div'); g.className='maior';
  g.innerHTML=f(r.graus,1)+'° <small>· '+f(r.pct,1)+' % · '+C.talude(r.razao)+'</small>';
  const dl=document.createElement('dl');
  par(dl,'Cai para',C.rumo(r.caimento)); par(dl,'Superfície',p.sup.nome,true); par(dl,'Ponto',real(p),true);
  const o=document.createElement('p'); o.className='obs';
  o.textContent=r.metodo==='3x3'?'Média das células vizinhas (3 × 3), com célula de '+f(p.sup.celula,2)+' m.':'Inclinação da face tocada (borda da malha).';
  d.append(g,dl,o); m.dados=r;
}
function medePerfil(a,b,cor){
  const r=C.perfil(supsVisiveis(),a,b,1600); if(!r||!r.series.length){ avisa('Não há terreno entre esses dois pontos.'); return; }
  const pts=[]; for(let i=0;i<r.d.length;i+=Math.max(1,Math.floor(r.d.length/400))){
    const t=r.d[i]/r.dh, x=a.x+(b.x-a.x)*t, y=a.y+(b.y-a.y)*t, top=C.topoEm(supsVisiveis(),x,y); if(top) pts.push(P3(x,y,top.z));
  }
  const m={titulo:'Perfil entre dois pontos',cor,objs:[marca(a,cor),marca(b,cor)]}; if(pts.length>1) m.objs.push(fita(pts,cor,3));
  m.objs.forEach(o=>gMed.add(o)); medidas.push(m);
  const d=cartao(m), cv=document.createElement('canvas'), dl=document.createElement('dl');
  par(dl,'Comprimento',f(r.dh,2)+' m');
  r.series.forEach(s=>{
    par(dl,s.nome+' — desnível',sinal(s.desnivel)+' m');
    par(dl,s.nome+' — inclinação média',s.mediaPct==null?'—':f(Math.abs(s.mediaPct),1)+' % · '+f(s.mediaGraus,1)+'°');
    par(dl,s.nome+' — inclinação máxima',s.maxPct==null?'—':f(s.maxPct,1)+' % · '+f(s.maxGraus,1)+'°');
  });
  const o=document.createElement('p'); o.className='obs'; o.textContent='A máxima é medida em trechos de uma célula da malha publicada. Escalas horizontal e vertical do gráfico são diferentes.';
  d.append(cv,dl,o); m.dados=r; m.cv=cv; requestAnimationFrame(()=>grafico(m));
}
function grafico(m){
  const cv=m.cv, r=m.dados; if(!cv||!cv.isConnected) return;
  const k=Math.min(2,window.devicePixelRatio||1), w=cv.clientWidth||260, h=cv.clientHeight||124; cv.width=Math.round(w*k); cv.height=Math.round(h*k);
  const x=cv.getContext('2d'); x.setTransform(k,0,0,k,0,0); x.clearRect(0,0,w,h);
  let zmin=Infinity, zmax=-Infinity; r.series.forEach(s=>{ zmin=Math.min(zmin,s.zmin); zmax=Math.max(zmax,s.zmax); });
  if(zmax-zmin<0.5){ const c=(zmin+zmax)/2; zmin=c-0.25; zmax=c+0.25; }
  const e=44, t=8, dW=w-e-8, dH=h-t-18, X=d=>e+d/r.dh*dW, Y=z=>t+(zmax-z)/(zmax-zmin)*dH;
  x.font='10px system-ui,Arial,sans-serif'; x.fillStyle=corCSS('--fraca'); x.strokeStyle=corCSS('--linha'); x.lineWidth=1;
  x.strokeRect(e,t,dW,dH); x.textAlign='right'; x.textBaseline='middle';
  x.fillText(f(zmax,1),e-4,t+4); x.fillText(f(zmin,1),e-4,t+dH-4); x.textAlign='left'; x.textBaseline='top'; x.fillText('0',e,t+dH+4);
  x.textAlign='right'; x.fillText(f(r.dh,1)+' m',e+dW,t+dH+4);
  r.series.forEach(s=>{
    x.beginPath(); let solto=true;
    for(let i=0;i<r.d.length;i++){ const z=s.z[i]; if(z!==z){ solto=true; continue; } if(solto) x.moveTo(X(r.d[i]),Y(z)); else x.lineTo(X(r.d[i]),Y(z)); solto=false; }
    x.lineWidth=2; x.strokeStyle=s.papel==='projeto'?corCSS('--forte'):m.cor; x.setLineDash(s.papel==='projeto'?[5,3]:[]); x.stroke(); x.setLineDash([]);
  });
}
function toque(e){
  const p=tocaEm(e.clientX,e.clientY);
  if(!p){ if(ferramenta) avisa('Toque em cima do terreno.'); return; }
  $('leitura').textContent=real(p)+(sups.length>1?' · '+p.sup.nome:'');
  if(!ferramenta) return;
  const cor=CORES[serie%CORES.length];
  if(ferramenta==='ponto'){ medePonto(p,cor); serie++; }
  else if(!pendente){ pendente={p,marca:marca(p,cor)}; gMed.add(pendente.marca); }
  else{
    const a=pendente.p; gMed.remove(pendente.marca); pendente=null;
    if(Math.hypot(p.x-a.x,p.y-a.y)<1e-6&&Math.abs(p.z-a.z)<1e-6){ avisa('Os dois pontos são o mesmo. Toque noutro lugar.'); }
    else{ (ferramenta==='dois'?medeDois:medePerfil)(a,p,cor); serie++; }
  }
  dica(); pede();
}
/* toque curto e parado = medir; arrastar = girar (quem cuida é o controle de órbita) */
let desce=null;
tela.addEventListener('pointerdown',e=>{ desce={x:e.clientX,y:e.clientY,t:performance.now(),id:e.pointerId,b:e.button}; });
tela.addEventListener('pointerup',e=>{
  const d=desce; desce=null;
  if(!d||d.id!==e.pointerId||d.b!==0) return;
  if(Math.hypot(e.clientX-d.x,e.clientY-d.y)<=7&&performance.now()-d.t<700) toque(e);
});
let ultimaLeitura=0;
tela.addEventListener('pointermove',e=>{
  if(e.pointerType!=='mouse'||e.buttons) return;
  const agora=performance.now(); if(agora-ultimaLeitura<70) return; ultimaLeitura=agora;
  const p=tocaEm(e.clientX,e.clientY); $('leitura').textContent=p?real(p)+(sups.length>1?' · '+p.sup.nome:''):'';
});

/* ---------- cabeçalho, card 4 e tema ---------- */
$('titulo').textContent=D.titulo||'Publicação'; document.title=D.titulo||document.title;
$('subtitulo').textContent=[D.subtitulo,D.data].filter(Boolean).join(' · ');
(function sobre(){
  const dl=$('sobre');
  if(D.crs) par(dl,'Coordenadas',D.crs);
  sups.forEach(s=>par(dl,s.nome,'célula de '+f(s.celula,2)+' m'+(s.nativa?' (nativa)':(s.celulaNativa?' (original: '+f(s.celulaNativa,2)+' m)':' (reduzida)'))));
  if(orto) par(dl,'Ortofoto',orto.nome||'sobre o terreno');
  const cels=sups.map(s=>s.celula), fino=Math.min.apply(null,cels), grosso=Math.max.apply(null,cels), n=v=>f(v,v<1?2:1);
  $('celula').textContent=grosso-fino>1e-6?'malha de '+n(fino)+' a '+n(grosso)+' m':'malha de '+n(fino)+' m';
  $('rodape').textContent=D.rodape||'Gerado no GeoMine.';
})();
$('tema').onclick=()=>{ document.body.classList.toggle('escuro'); fundo(); medidas.forEach(m=>{ if(m.cv) grafico(m); }); };
$('fecha').onclick=()=>{ document.body.classList.add('recolhido'); };
$('abre').onclick=()=>{ document.body.classList.remove('recolhido'); };

/* ---------- partida ---------- */
if(window.ResizeObserver) new ResizeObserver(ajustaTamanho).observe(palco); else window.addEventListener('resize',ajustaTamanho);
ajustaTamanho(); fundo(); dica(); vista('3d');
/* para testes e para quem quiser conferir os números pelo console */
window.GeoMinePublicacao={dados:D, superficies:sups, tocaEm, medidas, escolhe, vista, camera, esferica, real,
  estado:()=>({ferramenta, pendente:!!pendente, medidas:medidas.map(m=>({titulo:m.titulo, dados:m.dados&&!m.dados.d?m.dados:null})), exagero:VE,
    camadas:malhas.map(m=>m.visible), vetores:vetores.map(q=>q.g.visible), orto:!!orto&&ortoLigada,
    comFoto:malhas.map(m=>m.userData.comOrto?m.geometry.groups[0].count/3:0), semFoto:malhas.map(m=>m.geometry.groups[1].count/3)})};
})();
