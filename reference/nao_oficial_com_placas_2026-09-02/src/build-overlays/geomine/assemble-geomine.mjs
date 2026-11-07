import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { corrigeAtualizacaoPrancha } from "./layout-prancha-fix.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

function readAsset(name) {
  return fs.readFileSync(path.join(SCRIPT_DIR, name), "utf8");
}

const [basePath, motorPath, targetPath] = process.argv.slice(2);
if (!basePath || !motorPath || !targetPath) {
  throw new Error("Uso: node assemble-geomine.mjs BASE_MODULAR MOTOR_V106 DESTINO");
}

function replaceOnce(source, search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Trecho não encontrado: ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`Trecho ambíguo (mais de uma ocorrência): ${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function replaceBetween(source, startToken, endToken, replacement, label) {
  const start = source.indexOf(startToken);
  if (start < 0) throw new Error(`Início não encontrado: ${label}`);
  const end = source.indexOf(endToken, start + startToken.length);
  if (end < 0) throw new Error(`Fim não encontrado: ${label}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

function transformaToolbarV74(source) {
  const re = /<main>\s*<header>[\s\S]*?<\/header>(?=\s*<div id="wrap"><canvas id="cv"><\/canvas><\/div>)/g;
  const matches = [...source.matchAll(re)];
  if (matches.length !== 1) throw new Error(`Toolbar do motor v10.6 ambígua: ${matches.length} ocorrências`);
  const oldToolbar = matches[0][0];
  const expectedIds = [
    "t_mover", "t_cava", "t_pilha", "t_editar", "t_rampa", "t_retorno", "t_secao",
    "b_parar", "b_escolher", "b_novo_lim", "chk_lim_preto", "sel_como",
    "b_diag", "b_reverter", "b_desfazer", "b_refazer", "b_exemplo",
    "b_limpar", "b_ajustar", "b_dxf", "b_png"
  ];
  for (const id of expectedIds) {
    const n = oldToolbar.split(`id="${id}"`).length - 1;
    if (n !== 1) throw new Error(`Controle original inválido (${id}): ${n}`);
  }

  const newToolbar = readAsset("cava-v74-toolbar.html").trim();
  let transformed = source.slice(0, matches[0].index) + newToolbar +
    source.slice(matches[0].index + oldToolbar.length);
  const visibleOrder = ["t_mover", "t_cava", "t_pilha", "t_editar", "b_escolher", "t_rampa", "t_retorno", "t_secao", "b_parar"];
  let cursor = transformed.indexOf('id="ccmgisV74Toolbar"');
  for (const id of visibleOrder) {
    const next = transformed.indexOf(`id="${id}"`, cursor);
    if (next < 0) throw new Error(`Comando visível ausente na toolbar: ${id}`);
    cursor = next + id.length;
  }
  for (const id of expectedIds) {
    const n = transformed.split(`id="${id}"`).length - 1;
    if (n !== 1) throw new Error(`Controle transformado inválido (${id}): ${n}`);
  }
  for (const id of ["ccmgis_mdt", "ccmgis_cortar_cava"]) {
    const n = transformed.split(`id="${id}"`).length - 1;
    if (n !== 1) throw new Error(`Comando CCMGIS inválido (${id}): ${n}`);
  }
  if (transformed.indexOf('id="ccmgis_mdt"') > transformed.indexOf('id="t_mover"')) {
    throw new Error("Escolher MDT precisa ser o primeiro comando");
  }
  if (transformed.indexOf('id="ccmgis_cortar_cava"') < transformed.indexOf('id="b_png"')) {
    throw new Error("Cortar cava precisa ser o último comando");
  }
  for (const id of ["b_novo_lim", "sel_como", "b_diag", "b_exemplo"]) {
    const p = transformed.indexOf(`id="${id}"`);
    const hiddenStart = transformed.lastIndexOf('class="ccmgis-retired-controls"', p);
    const hiddenEnd = transformed.indexOf("</span>", hiddenStart);
    if (hiddenStart < 0 || hiddenEnd < p) throw new Error(`Controle aposentado ainda visível: ${id}`);
  }
  return transformed;
}

function adaptaMotorV106(raw) {
  let motor = raw.replaceAll("Segoe UI", "Signika");

  motor = replaceOnce(
    motor,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n<link href="https://fonts.googleapis.com/css2?family=Signika:wght@300;400;500;600;700&amp;display=swap" rel="stylesheet">',
    "fonte Signika do motor"
  );

  const integrationCss = `
  body.ccmgis-claro{
    --bg:#ffffff;--painel:#ffffff;--borda:#c7d1da;--texto:#1b2c3a;
    --texto2:#607383;--acento:#b36d00;--canvas-bg:#ffffff;color-scheme:light;
  }
  aside{transition:width .18s ease,min-width .18s ease,padding .18s ease;}
  body.ccmgis-painel-fechado aside{width:0;min-width:0;padding:0;border:0;overflow:hidden;visibility:hidden;}
  body.ccmgis-painel-fechado main header{padding-left:40px;}
  #ccmgisPainelCorner{
    position:fixed;left:272px;top:6px;z-index:20;width:24px;height:24px;padding:0;
    display:grid;place-items:center;border:1px solid var(--borda);border-radius:5px;
    background:#171a20;color:var(--texto);font:700 17px "Signika",sans-serif;
    box-shadow:0 2px 7px #0005;cursor:pointer;transition:left .18s ease;
  }
  #ccmgisPainelCorner:hover{border-color:var(--acento);color:var(--acento);}
  body.ccmgis-painel-fechado #ccmgisPainelCorner{left:6px;}
  body.ccmgis-claro #ccmgisPainelCorner,
  body.ccmgis-claro header button,
  body.ccmgis-claro .campo input[type=number],
  body.ccmgis-claro .campo select{background:#ffffff;color:var(--texto);}
  body.ccmgis-claro #resultados .lin span:last-child{color:var(--texto);}
  body[data-ccmgis-target="cava"] aside fieldset:nth-of-type(3),
  body[data-ccmgis-target="cava"] aside fieldset:nth-of-type(4),
  body[data-ccmgis-target="pilha"] aside fieldset:nth-of-type(1),
  body[data-ccmgis-target="pilha"] aside fieldset:nth-of-type(2){display:none;}
  #cv{touch-action:none;user-select:none;-webkit-user-select:none;}
`;
  motor = replaceOnce(
    motor,
    "</style>",
    integrationCss + "\n" + readAsset("cava-v74-toolbar.css") + "\n</style>",
    "CSS de integração"
  );
  motor = transformaToolbarV74(motor);
  motor = replaceOnce(
    motor,
    '<br><b>Depois</b>, para continuar a mina, você escolhe como começa o próximo limite: <b>⊙ Escolher linha existente</b> (clique numa linha que já está no desenho) ou <b>✎ Novo limite (desenhar)</b> (desenhe o polígono). No seletor ao lado diga se essa linha vale como <b>CRISTA</b> ou como <b>PÉ</b> — se for pé, o primeiro passo para dentro é a berma; se for crista, é a face.<br><b>✎ Novo limite (desenhar)</b>: em vez de aproveitar uma string, você desenha o polígono do próximo limite. No seletor ao lado diga se esse polígono é a <b>CRISTA</b> ou o <b>PÉ</b> — se for pé, o primeiro passo para dentro é a berma; se for crista, é a face.',
    '<br><b>Depois</b>, para continuar a mina por outra string, use <b>Escolher linha existente</b> e clique numa linha já desenhada. O tipo <b>CRISTA</b> ou <b>PÉ</b> é reconhecido automaticamente pela própria string.',
    "ajuda dos comandos aposentados"
  );
  motor = replaceOnce(
    motor,
    'ultimaEdicao="<b>clique na linha</b> que vai ser o limite da próxima cava — diga antes no seletor se ela vale como CRISTA ou PÉ";',
    'ultimaEdicao="<b>clique na linha</b> que vai ser o limite da próxima cava — o tipo CRISTA ou PÉ será reconhecido automaticamente";',
    "instrução de escolher linha"
  );
  motor = replaceOnce(
    motor,
    '    Terreno na cota 0.\n    Volumes por prismóide entre strings. Sem switchback nesta versão.',
    '    A cota de trabalho e o MDT são definidos pelo projeto CCMGIS.\n    Volumes por prismóide entre strings. Retornos de rampa (switchbacks) podem ser inseridos pelo comando Retorno.',
    "nota do motor v10.6"
  );
  motor = motor.replace(" — ou clique em Exemplo.", ".");
  motor = replaceOnce(
    motor,
    "<body>\n\n<aside>",
    '<body>\n\n<button id="ccmgisPainelCorner" type="button" title="Recolher parâmetros" aria-label="Recolher parâmetros">‹</button>\n\n<aside>',
    "botão de recolher parâmetros"
  );
  motor = replaceOnce(
    motor,
    'const cvSec = $("cvSec"), ctxSec = cvSec.getContext("2d");',
    'const cvSec = $("cvSec"), ctxSec = cvSec.getContext("2d");\n$("ccmgisPainelCorner").addEventListener("click",()=>window.dispatchEvent(new CustomEvent("cava2:panel-toggle")));',
    "evento do painel"
  );

const contextState = `
let contexto = [];
const contextoImgCache = new Map();
let selecaoMultipla = [];
let poligonoSelecao = [];
let superficieTrabalho = null;
const cacheSuperficieTrabalho = new Map();
const visibilidade = {
  cava:{on:true,crista:true,pe:true,rampa:true},
  pilha:{on:true,crista:true,pe:true,rampa:true},
};
const estilosIntegracao={cava:{},pilha:{}};
`;
  motor = replaceOnce(
    motor,
    'let ultimaEdicao = "";           // o que o último arrasto fez (aviso na barra)',
    'let ultimaEdicao = "";           // o que o último arrasto fez (aviso na barra)' + contextState,
    "estado das camadas de contexto"
  );

  motor = replaceOnce(
    motor,
    '  if(desenho && desenho.pts.length) inclui(desenho.pts);',
    '  for(const item of contexto) for(const P of (item.paths||[])) inclui(P);\n' +
      '  for(const item of contexto){const b=item.bounds;if(Array.isArray(b)&&b.length===4)inclui([{x:b[0],y:b[1]},{x:b[2],y:b[3]}]);}\n' +
      '  if(desenho && desenho.pts.length) inclui(desenho.pts);',
    "contexto no enquadramento"
  );

const contextRenderer = `
/* Desenha uma imagem georreferenciada por uma malha regular. O PNG usado pelo
   Leaflet pode estar no envelope Web Mercator, enquanto o motor da cava opera
   no CRS métrico do projeto. Um drawImage retangular perderia a rotação da
   quadrícula e deslocaria a ortofoto. Cada célula é, portanto, mapeada por dois
   triângulos afins sem alterar a geometria vetorial do motor. */
function desenhaTrianguloImagem(im,s0,s1,s2,d0,d1,d2){
  const den=s0[0]*(s1[1]-s2[1])+s1[0]*(s2[1]-s0[1])+s2[0]*(s0[1]-s1[1]);
  if(!Number.isFinite(den)||Math.abs(den)<1e-9)return;
  const a=(d0[0]*(s1[1]-s2[1])+d1[0]*(s2[1]-s0[1])+d2[0]*(s0[1]-s1[1]))/den,
    c=(d0[0]*(s2[0]-s1[0])+d1[0]*(s0[0]-s2[0])+d2[0]*(s1[0]-s0[0]))/den,
    e=(d0[0]*(s1[0]*s2[1]-s2[0]*s1[1])+d1[0]*(s2[0]*s0[1]-s0[0]*s2[1])+
      d2[0]*(s0[0]*s1[1]-s1[0]*s0[1]))/den,
    b=(d0[1]*(s1[1]-s2[1])+d1[1]*(s2[1]-s0[1])+d2[1]*(s0[1]-s1[1]))/den,
    d=(d0[1]*(s2[0]-s1[0])+d1[1]*(s0[0]-s2[0])+d2[1]*(s1[0]-s0[0]))/den,
    f=(d0[1]*(s1[0]*s2[1]-s2[0]*s1[1])+d1[1]*(s2[0]*s0[1]-s0[0]*s2[1])+
      d2[1]*(s0[0]*s1[1]-s1[0]*s0[1]))/den;
  ctx.save();ctx.beginPath();ctx.moveTo(d0[0],d0[1]);ctx.lineTo(d1[0],d1[1]);
  ctx.lineTo(d2[0],d2[1]);ctx.closePath();ctx.clip();ctx.transform(a,b,c,d,e,f);
  ctx.drawImage(im,0,0);ctx.restore();
}
function desenhaImagemContexto(item,im){
  const m=item&&item.mesh,W=im.naturalWidth||im.width,H=im.naturalHeight||im.height;
  if(m&&Number.isInteger(m.cols)&&Number.isInteger(m.rows)&&m.cols>0&&m.rows>0&&
     Array.isArray(m.points)&&m.points.length===(m.cols+1)*(m.rows+1)&&W>0&&H>0){
    const at=(r,c)=>m.points[r*(m.cols+1)+c],tela=p=>W2S(p.x,p.y);
    for(let r=0;r<m.rows;r++)for(let c=0;c<m.cols;c++){
      const p00=tela(at(r,c)),p10=tela(at(r,c+1)),p11=tela(at(r+1,c+1)),p01=tela(at(r+1,c)),
        x0=c*W/m.cols,x1=(c+1)*W/m.cols,y0=r*H/m.rows,y1=(r+1)*H/m.rows;
      desenhaTrianguloImagem(im,[x0,y0],[x1,y0],[x1,y1],p00,p10,p11);
      desenhaTrianguloImagem(im,[x0,y0],[x1,y1],[x0,y1],p00,p11,p01);
    }
    return true;
  }
  const b=item&&item.bounds;if(!Array.isArray(b)||b.length!==4)return false;
  const a=W2S(b[0],b[3]),z=W2S(b[2],b[1]);ctx.drawImage(im,a[0],a[1],z[0]-a[0],z[1]-a[1]);return true;
}
function desenhaContexto(frente){
  const primeiroPlano=!!frente;
  ctx.save();
  for(const item of contexto){
    if(!!item.foreground!==primeiroPlano)continue;
    const b=item.bounds,im=item._img;
    if(!im||!im.complete||!Array.isArray(b)||b.length!==4)continue;
    ctx.globalAlpha=Math.max(0,Math.min(1,Number.isFinite(+item.opacity)?+item.opacity:.8));
    try{desenhaImagemContexto(item,im);}catch(e){}
  }
  ctx.globalAlpha=1;
  for(const item of contexto){
    if(!!item.foreground!==primeiroPlano)continue;
    const cor=item.color||"#687786",lw=Math.max(.1,+item.weight||1),
      op=Math.max(0,Math.min(1,Number.isFinite(+item.opacity)?+item.opacity:1));
    for(const P of (item.paths||[])){
      if(!P||!P.length)continue;
      if(item.point){
        ctx.fillStyle=cor;ctx.globalAlpha=op;
        for(const p of P){const [sx,sy]=W2S(p.x,p.y);ctx.beginPath();ctx.arc(sx,sy,Math.max(1.5,lw+1),0,7);ctx.fill();}
        continue;
      }
      ctx.beginPath();P.forEach((p,i)=>{const [sx,sy]=W2S(p.x,p.y);i?ctx.lineTo(sx,sy):ctx.moveTo(sx,sy);});
      if(item.closed)ctx.closePath();
      if(item.closed&&item.fillColor){ctx.save();ctx.globalAlpha=op*Math.max(.08,+item.fillOpacity||.18);ctx.fillStyle=item.fillColor;ctx.fill();ctx.restore();}
      ctx.globalAlpha=op;ctx.strokeStyle=cor;ctx.lineWidth=lw;
      ctx.setLineDash(item.dash?String(item.dash).split(/[ ,]+/).map(Number).filter(Number.isFinite):[]);
      ctx.stroke();ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

/* A linha-base permanece exatamente com os vértices desenhados pelo usuário.
   A densificação abaixo existe apenas durante a pintura, para localizar cada
   cruzamento entre a cota horizontal de trabalho e o MDT sem modificar P. */
function amostraSuperficieTrabalho(x,y){
  if(!superficieTrabalho||typeof superficieTrabalho.sampleZ!=="function")return NaN;
  try{const z=+superficieTrabalho.sampleZ(+x,+y);return Number.isFinite(z)?z:NaN;}catch(e){return NaN;}
}
function classeCotaTrabalho(dz){
  if(!Number.isFinite(dz))return "nodata";
  const tol=Math.max(.001,+superficieTrabalho?.tolerance||.1);
  return Math.abs(dz)<=tol?"on":(dz>0?"above":"below");
}
function pontoCotaTrabalho(a,b,t){
  const q={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,
    lineZ:a.lineZ+(b.lineZ-a.lineZ)*t},zt=amostraSuperficieTrabalho(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t);
  q.dz=Number.isFinite(zt)?q.lineZ-zt:NaN;q.relation=classeCotaTrabalho(q.dz);return q;
}
function cruzaCotaTrabalho(a,b,qa,qb){
  if(qa.relation==="on")return qa;if(qb.relation==="on")return qb;
  if(!Number.isFinite(qa.dz)||!Number.isFinite(qb.dz)||qa.dz*qb.dz>=0)
    return pontoCotaTrabalho(a,b,.5);
  let lo=0,hi=1,flo=qa.dz,mid=null;
  for(let i=0;i<22;i++){
    const t=(lo+hi)/2;mid=pontoCotaTrabalho(a,b,t);
    if(!Number.isFinite(mid.dz))break;
    if(Math.abs(mid.dz)<1e-5)return mid;
    if(flo*mid.dz<=0)hi=t;else{lo=t;flo=mid.dz;}
  }
  return mid||pontoCotaTrabalho(a,b,.5);
}
function trechosLinhaPorCota(P,fechado,cota){
  const Q=(P||[]).map((p,i)=>({x:+p.x,y:+p.y,
    lineZ:typeof cota==="function"?+cota(p,i):+cota})).filter(p=>
      Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.lineZ));
  if(!superficieTrabalho||Q.length<2)return [];
  const chave=fechado?[superficieTrabalho.id,superficieTrabalho.revision,Q.length,
    Q.map(p=>p.x.toFixed(4)+","+p.y.toFixed(4)+","+p.lineZ.toFixed(3)).join(";")].join("|"):null;
  if(chave&&cacheSuperficieTrabalho.has(chave))return cacheSuperficieTrabalho.get(chave);
  const runs=[],mesmo=(a,b)=>a&&b&&Math.hypot(a.x-b.x,a.y-b.y)<1e-7;
  const inclui=(relation,a,b)=>{
    if(!a||!b||Math.hypot(a.x-b.x,a.y-b.y)<1e-9)return;
    const r=runs[runs.length-1];
    if(r&&r.relation===relation&&mesmo(r.points[r.points.length-1],a))r.points.push(b);
    else runs.push({relation,elevation:Math.abs(a.lineZ-b.lineZ)<1e-7?a.lineZ:null,points:[a,b]});
  };
  const total=fechado?Q.length:Q.length-1,cell=Math.max(.05,+superficieTrabalho.cellSize||1),passo=Math.max(.2,cell*.5);
  for(let i=0;i<total;i++){
    const a=Q[i],b=Q[(i+1)%Q.length],L=Math.hypot(b.x-a.x,b.y-a.y);
    if(L<1e-9)continue;
    const nseg=Math.max(1,Math.min(256,Math.ceil(L/passo)));
    let qa=pontoCotaTrabalho(a,b,0);
    for(let j=1;j<=nseg;j++){
      const qb=pontoCotaTrabalho(a,b,j/nseg),ca=qa.relation,cb=qb.relation;
      if(ca===cb)inclui(ca,qa,qb);
      else{
        let x;
        if(ca==="on")x=qa;else if(cb==="on")x=qb;
        else if(ca==="nodata"||cb==="nodata")x=pontoCotaTrabalho(a,b,(j-.5)/nseg);
        else x=cruzaCotaTrabalho(qa,qb,qa,qb);
        inclui(ca,qa,x);inclui(cb,x,qb);
      }
      qa=qb;
    }
  }
  if(chave){cacheSuperficieTrabalho.set(chave,runs);while(cacheSuperficieTrabalho.size>32)cacheSuperficieTrabalho.delete(cacheSuperficieTrabalho.keys().next().value);}
  return runs;
}
function trechosLinhaBasePorCota(P,fechado,z){return trechosLinhaPorCota(P,fechado,+z);}
function tracaLinhaPorCota(P,fechado,cota,estilo){
  const runs=trechosLinhaPorCota(P,!!fechado,cota);if(!runs.length)return false;
  estilo=estilo||{};const cor=estilo.color||"#111827",peso=Math.max(.8,+estilo.weight||2),
    dashBase=Array.isArray(estilo.dash)?estilo.dash:String(estilo.dash||"").split(/[ ,]+/).map(Number).filter(Number.isFinite),
    opLinha=Math.max(0,Math.min(1,Number.isFinite(+estilo.opacity)?+estilo.opacity:1)),opBruta=+superficieTrabalho.opacity,
    opMdt=Math.max(0,Math.min(1,Number.isFinite(opBruta)?opBruta:1)),
    opAbaixo=opMdt>=.999?0:Math.min(.9,Math.max(.45,1-opMdt));
  const desenha=(r,stroke,lw,alpha)=>{ctx.beginPath();r.points.forEach((p,i)=>{const q=W2S(p.x,p.y);i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);});ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.globalAlpha=alpha;ctx.stroke();};
  ctx.save();ctx.lineCap="round";ctx.lineJoin="round";
  for(const r of runs){
    if(r.relation==="below"){
      if(opAbaixo<=.02)continue;
      ctx.setLineDash([6,5]);desenha(r,"#ffffff",Math.max(.8,peso*.9)+2.6,Math.min(.85,opAbaixo*.9)*opLinha);
      desenha(r,cor,Math.max(.9,peso*.95),opAbaixo*opLinha);
    }else{
      ctx.setLineDash(dashBase);desenha(r,cor,peso,opLinha);
    }
  }
  ctx.restore();return true;
}
function tracaLinhaBasePorCota(P,fechado,z,estilo){return tracaLinhaPorCota(P,fechado,+z,estilo);}
function estiloIntegrado(k,chave,padrao){
  const s=estilosIntegracao[tipoDe(k)]?.[chave]||{},p=padrao||{};
  return {color:s.color||s.stroke||p.color||"#111827",
    weight:Math.max(.1,Number.isFinite(+s.weight)?+s.weight:(+p.weight||1.5)),
    dash:s.dash!=null?s.dash:(p.dash||[]),
    opacity:Math.max(0,Math.min(1,Number.isFinite(+s.opacity)?+s.opacity:(Number.isFinite(+p.opacity)?+p.opacity:1))),
    fill:Math.max(0,Math.min(1,Number.isFinite(+s.fill)?+s.fill:(Number.isFinite(+p.fill)?+p.fill:0)))};
}
function opacidadeNaCota(x,y,z){
  if(!superficieTrabalho)return 1;const zt=amostraSuperficieTrabalho(x,y),rel=classeCotaTrabalho(Number.isFinite(zt)?z-zt:NaN);
  if(rel!=="below")return 1;const opBruta=+superficieTrabalho.opacity,
    opMdt=Math.max(0,Math.min(1,Number.isFinite(opBruta)?opBruta:1));
  return opMdt>=.999?0:Math.min(.9,Math.max(.45,1-opMdt));
}
function preencheRampaPorCota(c,cor,opacidade){
  const A=c?.borda1||[],B=c?.borda2||[],n=Math.min(A.length,B.length);if(!superficieTrabalho||n<2)return false;
  ctx.save();ctx.fillStyle=cor;for(let i=1;i<n;i++){
    const Q=[A[i-1],A[i],B[i],B[i-1]],x=Q.reduce((s,p)=>s+p.x,0)/4,y=Q.reduce((s,p)=>s+p.y,0)/4,
      z=cotaAbsolutaDoDesign(Q.reduce((s,p)=>s+(+p.z||0),0)/4),op=opacidadeNaCota(x,y,z)*opacidade;
    if(op<=.02)continue;ctx.globalAlpha=op;ctx.beginPath();Q.forEach((p,j)=>{const q=W2S(p.x,p.y);j?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);});ctx.closePath();ctx.fill();
  }ctx.restore();return true;
}
function desenhaLegendaCotaTrabalho(){
  if(!superficieTrabalho)return;
  const opBruta=+superficieTrabalho.opacity,oculto=(Number.isFinite(opBruta)?opBruta:1)>=.999;
  const itens=[
    ["#263746",[],"Acima / na superfície"],
    ["#263746",oculto?[]:[6,5],oculto?"Abaixo do MDT · oculto":"Abaixo do MDT · tracejado"]
  ],w=186,h=44,x=Math.max(8,cv.clientWidth-w-10),y=10;
  ctx.save();ctx.fillStyle=document.body.classList.contains("ccmgis-claro")?"rgba(255,255,255,.94)":"rgba(17,28,38,.94)";
  ctx.strokeStyle=document.body.classList.contains("ccmgis-claro")?"#9fb2c0":"#3b5264";ctx.lineWidth=1;
  ctx.beginPath();ctx.roundRect(x,y,w,h,6);ctx.fill();ctx.stroke();
  ctx.font='600 10px "Signika",sans-serif';ctx.textAlign="left";ctx.textBaseline="middle";
  itens.forEach((it,i)=>{const yy=y+13+i*17;ctx.setLineDash(it[1]);ctx.strokeStyle=it[0];ctx.lineWidth=2.5;
    ctx.beginPath();ctx.moveTo(x+9,yy);ctx.lineTo(x+34,yy);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=document.body.classList.contains("ccmgis-claro")?"#203748":"#e8f0f5";ctx.fillText(it[2],x+41,yy);});
  ctx.restore();
}
function cotaTrabalhoDoObjeto(k){
  const b=+superficieTrabalho?.workZ,z0=+objs[k]?.z0||0;return Number.isFinite(b)?b+z0:NaN;
}
function cotaAbsolutaDoDesign(zRel){
  const b=+superficieTrabalho?.workZ,z=+zRel||0;return Number.isFinite(b)?b+z:z;
}
function cotaTrabalhoDoDesenho(){
  const b=+superficieTrabalho?.workZ;if(!Number.isFinite(b)||!desenho)return NaN;
  const z0=Number.isFinite(+desenho.novoLimite?.z0)?+desenho.novoLimite.z0:(+objs[desenho.alvo]?.z0||0);
  return b+z0;
}

/* A ponte do CCMGIS publica cristas e pés como linhas abertas nos pontos em
   que a pista os atravessa. O v7.4 mantém os anéis analíticos fechados; esta
   função cria somente a representação cartográfica recortada, sem alterar a
   geometria usada nos cálculos do motor. */
function recortaLinhaForaRampas(P,poligonos){
  const Q=(P||[]).filter(p=>Number.isFinite(+p.x)&&Number.isFinite(+p.y)),
    rampas=(poligonos||[]).filter(poly=>Array.isArray(poly)&&poly.length>=3),eps=1e-9;
  if(Q.length<2||!rampas.length)return {partes:Q.length?[Q]:[],cortado:false};
  const interp=(a,b,t)=>{const q={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
    if(Number.isFinite(+a.z)&&Number.isFinite(+b.z))q.z=+a.z+(+b.z-+a.z)*t;return q;};
  const dentro=(poly,q)=>{let ok=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[i],b=poly[j];if((a.y>q.y)!==(b.y>q.y)&&q.x<(b.x-a.x)*(q.y-a.y)/(b.y-a.y)+a.x)ok=!ok;}return ok;};
  const ti=(a,b,c,d)=>{const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,den=rx*sy-ry*sx;
    if(Math.abs(den)<1e-12)return null;const t=((c.x-a.x)*sy-(c.y-a.y)*sx)/den,
      u=((c.x-a.x)*ry-(c.y-a.y)*rx)/den;return t>eps&&t<1-eps&&u>-eps&&u<1+eps?t:null;};
  const partes=[];let atual=[],cortado=false;
  const igual=(a,b)=>a&&b&&Math.hypot(a.x-b.x,a.y-b.y)<1e-7,
    encerra=()=>{if(atual.length>1)partes.push(atual);atual=[];};
  for(let i=0;i<Q.length;i++){
    const a=Q[i],b=Q[(i+1)%Q.length],ts=[0,1];
    for(const poly of rampas)for(let j=0;j<poly.length;j++){const t=ti(a,b,poly[j],poly[(j+1)%poly.length]);if(t!=null)ts.push(t);}
    ts.sort((x,y)=>x-y);const U=ts.filter((t,j)=>!j||Math.abs(t-ts[j-1])>eps);
    for(let j=0;j<U.length-1;j++){
      const t0=U[j],t1=U[j+1];if(t1-t0<eps)continue;
      const p0=interp(a,b,t0),p1=interp(a,b,t1),pm=interp(a,b,(t0+t1)/2),
        bloqueado=rampas.some(poly=>dentro(poly,pm));
      if(bloqueado){cortado=true;encerra();continue;}
      if(!atual.length)atual.push(p0);else if(!igual(atual.at(-1),p0)){encerra();atual.push(p0);}
      atual.push(p1);
    }
  }
  encerra();
  if(partes.length>1&&igual(partes.at(-1).at(-1),partes[0][0])){
    const ultima=partes.pop(),primeira=partes.shift();partes.unshift(ultima.concat(primeira.slice(1)));
  }
  return {partes:partes.length?partes:[Q],cortado};
}

`;
  motor = replaceOnce(
    motor,
    "// ---- LINHAS DE LIMITE (as desenhadas) ----------------------------------",
    contextRenderer + "// ---- LINHAS DE LIMITE (as desenhadas) ----------------------------------",
    "renderizador de contexto"
  );
  motor = replaceOnce(
    motor,
    "function desenhaObjeto(k){\n  const o=objs[k], cor=corDe(k);",
    "function desenhaObjeto(k){\n  const vis=visibilidade[tipoDe(k)]||visibilidade.cava;if(!vis.on)return;\n  const o=objs[k], cor=corDe(k);",
    "visibilidade do objeto"
  );
  motor = replaceOnce(
    motor,
    '    if(o.base){ tracaLimite(o.base, corLimite(k), LW_LIMITE, false); }',
    '    if(o.base&&!tracaLinhaBasePorCota(o.base,true,cotaTrabalhoDoObjeto(k),{color:corLimite(k),weight:LW_LIMITE})){ tracaLimite(o.base, corLimite(k), LW_LIMITE, false); }',
    "linha-base por cota sem design"
  );
  motor = replaceOnce(
    motor,
    '      tracaLimite(o.base, corLimite(k), LW_LIMITE, false);',
    '      if(!tracaLinhaBasePorCota(o.base,true,cotaTrabalhoDoObjeto(k),{color:corLimite(k),weight:LW_LIMITE}))tracaLimite(o.base, corLimite(k), LW_LIMITE, false);',
    "linha-base por cota na vista"
  );
  motor = replaceOnce(
    motor,
    '      tracaLimite(o.base, corL, ativo ? LW_LIMITE+1.2 : LW_LIMITE, false);',
    '      const pesoLimite=ativo?LW_LIMITE+1.2:LW_LIMITE;\n' +
      '      if(!tracaLinhaBasePorCota(o.base,true,cotaTrabalhoDoObjeto(k),{color:corL,weight:pesoLimite}))tracaLimite(o.base,corL,pesoLimite,false);',
    "linha-base por cota na edição"
  );
  motor = replaceOnce(
    motor,
    '    ctx.strokeStyle=CASING_ESC; ctx.lineWidth=4.2; trilha();\n' +
      '    ctx.strokeStyle=corD;   ctx.lineWidth=1.8; trilha();',
    '    const previa=desenho.pts.concat(hover?[hover]:[]);\n' +
      '    if(!tracaLinhaBasePorCota(previa,false,cotaTrabalhoDoDesenho(),{color:corD,weight:2.4})){\n' +
      '      ctx.strokeStyle=CASING_ESC;ctx.lineWidth=4.2;trilha();\n' +
      '      ctx.strokeStyle=corD;ctx.lineWidth=1.8;trilha();\n' +
      '    }',
    "linha-base por cota durante digitalização"
  );
  motor = replaceOnce(
    motor,
    '    tracaAnel(a.P, cor[a.tp], a.tp==="crista"?1.8:1.1, a.tp==="pe");',
    '    if(vis[a.tp]!==false){\n' +
      '      const padrao={color:cor[a.tp],weight:a.tp==="crista"?1.8:1.1,dash:a.tp==="pe"?[6,4]:[]},est=estiloIntegrado(k,a.tp,padrao);\n' +
      '      if(!tracaLinhaPorCota(a.P,true,cotaAbsolutaDoDesign(a.z),est))\n' +
      '        tracaAnel(a.P,est.color,est.weight,!!String(est.dash||"").length);\n' +
      '    }',
    "visibilidade de crista e pé"
  );
  motor = replaceOnce(
    motor,
    '      ctx.fillStyle=cor.rampaF; ctx.fill();\n' +
      '      ctx.strokeStyle=cor.rampaS; ctx.lineWidth=1.2; ctx.stroke();',
    '      const er=estiloIntegrado(k,"rampa",{color:cor.rampaS,weight:1.2,fill:.28});\n' +
      '      if(!preencheRampaPorCota(c,estilosIntegracao[tipoDe(k)]?.rampa?.color||cor.rampaF,er.fill)){ctx.fillStyle=cor.rampaF;ctx.fill();}\n' +
      '      if(!tracaLinhaPorCota(c.poly,true,p=>cotaAbsolutaDoDesign(p.z),er)){ctx.strokeStyle=er.color;ctx.lineWidth=er.weight;ctx.stroke();}\n' +
      '      if(c.centro&&c.centro.length>1)tracaLinhaPorCota(c.centro,false,p=>cotaAbsolutaDoDesign(p.z),er);',
    "rampa inteira acompanha a cota de trabalho"
  );
  motor = replaceOnce(
    motor,
    `        ctx.strokeStyle=cor.rampaS; ctx.lineWidth=1.6;
        ctx.beginPath();
        ctx.moveTo(ax-uy*s*0.6-ux*s, ay+ux*s*0.6-uy*s);
        ctx.lineTo(ax+ux*s, ay+uy*s);
        ctx.lineTo(ax+uy*s*0.6-ux*s, ay-ux*s*0.6-uy*s);
        ctx.stroke();`,
    `        const opSeta=opacidadeNaCota(p.x,p.y,cotaAbsolutaDoDesign(p.z));if(opSeta<=.02)continue;
        ctx.save();ctx.globalAlpha=opSeta;ctx.strokeStyle=er.color;ctx.lineWidth=Math.max(1.2,er.weight);
        ctx.beginPath();
        ctx.moveTo(ax-uy*s*0.6-ux*s, ay+ux*s*0.6-uy*s);
        ctx.lineTo(ax+ux*s, ay+uy*s);
        ctx.lineTo(ax+uy*s*0.6-ux*s, ay-ux*s*0.6-uy*s);
        ctx.stroke();ctx.restore();`,
    "setas da rampa acompanham a visibilidade por cota"
  );
  motor = replaceOnce(
    motor,
    '    rotuloHalo(fmt(a.z,0)+(a.ov?" ✎":""), sx, sy, cor.crista, 9.5);',
    '    rotuloHalo(fmt(cotaAbsolutaDoDesign(a.z),0)+(a.ov?" ✎":""), sx, sy, cor.crista, 9.5);',
    "rótulos em cota absoluta"
  );
  motor = replaceOnce(
    motor,
    '    tracaAnel(P, "#d33682", 2.6, false);',
    '    if(!tracaLinhaPorCota(P,true,cotaAbsolutaDoDesign(an[sel.idx].z),{color:"#d33682",weight:2.6}))\n' +
      '      tracaAnel(P,"#d33682",2.6,false);',
    "string selecionada mantém comparação com o MDT"
  );
  motor = replaceOnce(
    motor,
    '    tracaAnel(C.P, "#2c7fb8", 3.4, false);',
    '    if(!tracaLinhaPorCota(C.P,true,cotaAbsolutaDoDesign(C.z),{color:"#2c7fb8",weight:3.4}))\n' +
      '      tracaAnel(C.P,"#2c7fb8",3.4,false);',
    "string congelada mantém comparação com o MDT"
  );
  motor = replaceOnce(
    motor,
    '    for(const a of o.design.aneis) anelDXF(a.P, a.z, pref+"_"+a.tp.toUpperCase());',
    '    for(const a of o.design.aneis) anelDXF(a.P, cotaAbsolutaDoDesign(a.z), pref+"_"+a.tp.toUpperCase());',
    "strings DXF em cota absoluta"
  );
  motor = replaceOnce(
    motor,
    '      for(const s of pts) push("0","VERTEX","8",layer,"10",s.x.toFixed(3),"20",s.y.toFixed(3),"30",(s.z||0).toFixed(3),"70","32");',
    '      for(const s of pts) push("0","VERTEX","8",layer,"10",s.x.toFixed(3),"20",s.y.toFixed(3),"30",cotaAbsolutaDoDesign(s.z).toFixed(3),"70","32");',
    "eixo da rampa DXF em cota absoluta"
  );
  motor = replaceOnce(
    motor,
    '        push("0","VERTEX","8",pref+"_RAMPA_CONTORNO","10",s.x.toFixed(3),"20",s.y.toFixed(3),"30",(s.z||0).toFixed(3),"70","32");',
    '        push("0","VERTEX","8",pref+"_RAMPA_CONTORNO","10",s.x.toFixed(3),"20",s.y.toFixed(3),"30",cotaAbsolutaDoDesign(s.z).toFixed(3),"70","32");',
    "contorno da rampa DXF em cota absoluta"
  );
  motor = replaceOnce(
    motor,
    '          push("0","VERTEX","8",pref+"_RAMPA_SECOES","10",s.x.toFixed(3),"20",s.y.toFixed(3),"30",(s.z||0).toFixed(3),"70","32");',
    '          push("0","VERTEX","8",pref+"_RAMPA_SECOES","10",s.x.toFixed(3),"20",s.y.toFixed(3),"30",cotaAbsolutaDoDesign(s.z).toFixed(3),"70","32");',
    "seções transversais da rampa DXF em cota absoluta"
  );
  motor = replaceOnce(
    motor,
    '  return m ? "v"+m[1].replace(".","") : "v";',
    '  return m ? "v"+m[1].replace(".","") : "v106";',
    "versão do arquivo exportado"
  );
  motor = replaceOnce(motor, "  if(corrs.length){", "  if(vis.rampa!==false&&corrs.length){", "visibilidade da rampa");
  motor = replaceOnce(
    motor,
    "  // rampa: um TRECHO por bancada, com terminações retas e ortogonais —",
    `  // seleção múltipla da barra inferior do CCMGIS
  for(const s of selecaoMultipla){
    if(s.alvo!==k||!an[s.idx])continue;
    const a=an[s.idx];
    if(!tracaLinhaPorCota(a.P,true,cotaAbsolutaDoDesign(a.z),{color:"#15a9e6",weight:3.2}))
      tracaAnel(a.P,"#15a9e6",3.2,false);
  }
  // rampa: um TRECHO por bancada, com terminações retas e ortogonais —`,
    "realce da seleção múltipla"
  );
  motor = replaceOnce(
    motor,
    '  ctx.fillStyle="#f6f4ee"; ctx.fillRect(0,0,W,H);\n  grade();',
    '  ctx.fillStyle=document.body.classList.contains("ccmgis-claro")?"#ffffff":"#f6f4ee"; ctx.fillRect(0,0,W,H);\n  grade();\n  desenhaContexto(false);',
    "contexto no redesenho"
  );
  motor = replaceOnce(
    motor,
    "  // linha de seção",
    `  // polígono de seleção da barra inferior
  if(ferramenta==="selpoly"&&poligonoSelecao.length){
    ctx.save();ctx.setLineDash([6,4]);ctx.strokeStyle="#15a9e6";ctx.fillStyle="rgba(21,169,230,.10)";ctx.lineWidth=1.8;
    ctx.beginPath();poligonoSelecao.forEach((p,i)=>{const [x,y]=W2S(p.x,p.y);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
    if(hover){const [x,y]=W2S(hover.x,hover.y);ctx.lineTo(x,y);}ctx.stroke();
    for(const p of poligonoSelecao){const [x,y]=W2S(p.x,p.y);ctx.fillRect(x-3,y-3,6,6);}ctx.restore();
  }
  // linha de seção`,
    "desenho do polígono de seleção"
  );
  motor = replaceOnce(
    motor,
    "  // dica quando vazio",
    "  desenhaContexto(true);\n  desenhaLegendaCotaTrabalho();\n  // dica quando vazio",
    "legenda acima e abaixo do MDT"
  );
  motor = replaceOnce(
    motor,
    `  secao:"clique no ponto A e depois no ponto A' para cortar a seção",
};`,
    `  secao:"clique no ponto A e depois no ponto A' para cortar a seção",
  selpoly:"clique os vértices do polígono de seleção · feche no primeiro ponto, com Enter ou duplo clique · Esc cancela",
};`,
    "dica da seleção por polígono"
  );
  motor = replaceOnce(
    motor,
    `  if(t!=="editar") sel=null;
  for(const id of ["t_mover","t_cava","t_pilha","t_editar","t_rampa","t_retorno","t_secao"])
    $(id).classList.remove("ativa");
  $({mover:"t_mover",cava:"t_cava",pilha:"t_pilha",editar:"t_editar",rampa:"t_rampa",retorno:"t_retorno",secao:"t_secao"}[t]).classList.add("ativa");
  cv.classList.toggle("pan", t==="mover");
  $("st_dica").innerHTML="<b>"+t.toUpperCase()+"</b> — "+DICAS[t];
  redesenha();`,
    `  if(t!=="editar") sel=null;
  for(const id of ["t_mover","t_cava","t_pilha","t_editar","t_rampa","t_retorno","t_secao"])
    $(id).classList.remove("ativa");
  const idAtivo={mover:"t_mover",cava:"t_cava",pilha:"t_pilha",editar:"t_editar",rampa:"t_rampa",retorno:"t_retorno",secao:"t_secao"}[t];
  if(idAtivo)$(idAtivo).classList.add("ativa");
  cv.classList.toggle("pan", t==="mover");
  $("st_dica").innerHTML="<b>"+t.toUpperCase()+"</b> — "+(DICAS[t]||"");
  window.dispatchEvent(new CustomEvent("cava2:tool-changed",{detail:{tool:t}}));
  redesenha();`,
    "ferramenta externa sem botão interno"
  );

  const polygonSelection = `function anelInterseccionaPoligono(A,B){
  if(!A?.length||!B?.length)return false;
  if(A.some(p=>dentroDe(B,p))||B.some(p=>dentroDe(A,p)))return true;
  for(let i=0;i<A.length;i++)for(let j=0;j<B.length;j++)
    if(segInt(A[i],A[(i+1)%A.length],B[j],B[(j+1)%B.length]))return true;
  return false;
}
function iniciaSelecaoPoligono(){
  selecaoMultipla=[];poligonoSelecao=[];defineTool("selpoly");return true;
}
function finalizaSelecaoPoligono(){
  if(poligonoSelecao.length<3){poligonoSelecao=[];redesenha();return false;}
  const P=poligonoSelecao.slice();selecaoMultipla=[];
  for(const k of alvos()){
    const d=objs[k]?.design;if(!d)continue;
    d.aneis.forEach((a,idx)=>{if(anelInterseccionaPoligono(a.P,P))selecaoMultipla.push({alvo:k,idx});});
  }
  poligonoSelecao=[];sel=selecaoMultipla.length===1?{...selecaoMultipla[0]}:null;
  ultimaEdicao=selecaoMultipla.length?selecaoMultipla.length+" string(s) selecionada(s) por polígono":"nenhuma string encontrada no polígono";
  window.dispatchEvent(new CustomEvent("cava2:selection-changed",{detail:{count:selecaoMultipla.length,items:selecaoMultipla.map(x=>({...x}))}}));
  atualizaDicaSel();redesenha();return selecaoMultipla.length>0;
}

`;
  motor = replaceOnce(
    motor,
    'cv.addEventListener("pointerdown", e=>{',
    polygonSelection + 'cv.addEventListener("pointerdown", e=>{',
    "seleção múltipla por polígono"
  );
  motor = replaceOnce(
    motor,
    `  }else if(ferramenta==="rampa"){`,
    `  }else if(ferramenta==="selpoly"){
    if(poligonoSelecao.length>=3){
      const [x0,y0]=W2S(poligonoSelecao[0].x,poligonoSelecao[0].y);
      if(Math.hypot(e.offsetX-x0,e.offsetY-y0)<11){finalizaSelecaoPoligono();return;}
    }
    poligonoSelecao.push(q);redesenha();
  }else if(ferramenta==="rampa"){`,
    "cliques do polígono de seleção"
  );
  motor = replaceOnce(
    motor,
    `cv.addEventListener("dblclick", e=>{
  if(desenho && desenho.pts.length>=3){fechaDesenho(); return;}`,
    `cv.addEventListener("dblclick", e=>{
  if(ferramenta==="selpoly"&&poligonoSelecao.length>=3){finalizaSelecaoPoligono();e.preventDefault();return;}
  if(desenho && desenho.pts.length>=3){fechaDesenho(); return;}`,
    "duplo clique encerra seleção"
  );
  motor = replaceOnce(
    motor,
    `    desenho=null; if(!secB){secA=null; secTemp=null;} defineTool("mover");`,
    `    desenho=null;poligonoSelecao=[]; if(!secB){secA=null; secTemp=null;} defineTool("mover");`,
    "Esc cancela seleção"
  );
  motor = replaceOnce(
    motor,
    `  else if(e.key==="Enter" && desenho && desenho.pts.length>=3) fechaDesenho();`,
    `  else if(e.key==="Enter" && ferramenta==="selpoly" && poligonoSelecao.length>=3) finalizaSelecaoPoligono();
  else if(e.key==="Enter" && desenho && desenho.pts.length>=3) fechaDesenho();`,
    "Enter encerra seleção"
  );

  motor = replaceOnce(
    motor,
    "  estadoAnterior=estadoAtual();\n}",
    '  estadoAnterior=estadoAtual();\n  window.dispatchEvent(new CustomEvent("cava2:changed",{detail:{at:Date.now()}}));\n}',
    "evento de regeneração"
  );
  motor = replaceOnce(
    motor,
    '            if(c.poly)   for(const q of c.poly)   move(q);\n          }\n        }',
    '            if(c.poly)   for(const q of c.poly)   move(q);\n          }\n' +
      '          if(o.design.curvasAgudas)for(const q of o.design.curvasAgudas)move(q);\n        }',
    "cota absoluta dos alertas de raio"
  );
  motor = replaceOnce(
    motor,
    '  const zs=[];\n  let zMin=0, zMax=0;',
    '  const zs=[],baseSec=Number.isFinite(+superficieTrabalho?.workZ)?+superficieTrabalho.workZ:0;\n  let zMin=baseSec,zMax=baseSec;',
    "base absoluta da seção"
  );
  motor = replaceOnce(
    motor,
    '    const z=cotaTotal({x:secA.x+(secB.x-secA.x)*t, y:secA.y+(secB.y-secA.y)*t});',
    '    const z=cotaAbsolutaDoDesign(cotaTotal({x:secA.x+(secB.x-secA.x)*t, y:secA.y+(secB.y-secA.y)*t}));',
    "perfil da seção em cota absoluta"
  );
  motor = replaceOnce(
    motor,
    '  // linha do terreno 0\n  ctxSec.setLineDash([5,5]); ctxSec.strokeStyle="#3f5a2a"; ctxSec.lineWidth=1.2;\n  ctxSec.beginPath(); ctxSec.moveTo(X(0),Y(0)); ctxSec.lineTo(X(L),Y(0)); ctxSec.stroke();',
    '  // plano da cota de trabalho do projeto\n  ctxSec.setLineDash([5,5]); ctxSec.strokeStyle="#3f5a2a"; ctxSec.lineWidth=1.2;\n  ctxSec.beginPath(); ctxSec.moveTo(X(0),Y(baseSec)); ctxSec.lineTo(X(L),Y(baseSec)); ctxSec.stroke();',
    "plano de trabalho na seção"
  );
  motor = replaceOnce(
    motor,
    '  for(const z of [zMin,0,zMax]){\n    if(Math.abs(z)<1e-6 && zMin===0 && zMax===0) continue;',
    '  for(const z of [zMin,baseSec,zMax]){\n    if(Math.abs(z-baseSec)<1e-6 && zMin===baseSec && zMax===baseSec) continue;',
    "rótulos absolutos da seção"
  );
  motor = replaceOnce(
    motor,
    '  $("st_coord").innerHTML=`E: <b>${fmt(q.x,1)}</b> &nbsp; N: <b>${fmt(q.y,1)}</b>`;',
    '  $("st_coord").innerHTML=`E: <b>${fmt(q.x,1)}</b> &nbsp; N: <b>${fmt(q.y,1)}</b>`;\n' +
      '  window.dispatchEvent(new CustomEvent("cava2:cursor",{detail:{x:q.x,y:q.y,z:cotaTotal(q)}}));',
    "evento de coordenadas"
  );
  motor = replaceOnce(
    motor,
    "  vistaManual=false; regen(); atualizaDicaSel();\n};\n$(\"b_ajustar\")",
    '  vistaManual=false; regen(); atualizaDicaSel();\n  window.dispatchEvent(new CustomEvent("cava2:cleared",{detail:{at:Date.now()}}));\n};\n$("b_ajustar")',
    "evento de limpeza"
  );

  const apiStart = motor.lastIndexOf("window.__api={objs");
  const scriptEnd = motor.indexOf("</script>", apiStart);
  if (apiStart < 0 || scriptEnd < 0) throw new Error("Boot/API do motor v10.6 não encontrado");
  const apiBoot = `window.__api={objs, geraDesign, offsetU, cotaEm, cotaTotal, parametros, parametrosDe, exemplo,
              regen, removeLacos, resample, faixaCorredorInt,
              anelComRampaInt, areaAssinada,
              dentroDe, cumulativo, arcoMaisProximo, pontoNoArco, recortaLinhaForaRampas,
              garanteFora, garanteDentro, compHoriz, segInt, distAoAnel, perimetro,
              tipoDe, alvos, estadoAtual, aplicaEstado, limpaCadeia, saneiaPainel,
              blocoParaPainel, painelParaBloco, finalizaAqui, limiteDeLinhaExistente,
              setContextLayers(v){
                contexto=Array.isArray(v)?v:[];
                for(const item of contexto){
                  const src=item&&item.imageUrl;if(!src)continue;
                  let im=contextoImgCache.get(src);
                  if(!im){im=new Image();im.onload=()=>redesenha();im.src=src;contextoImgCache.set(src,im);}
                  item._img=im;
                }
                redesenha();
              },
              setObjectVisibility(k,v){
                const t=tipoDe(k);if(!visibilidade[t])return false;
                visibilidade[t]={...visibilidade[t],...(v||{})};redesenha();return true;
              },
              setObjectStyle(k,v){
                const t=tipoDe(k);if(!estilosIntegracao[t]||!v)return false;
                estilosIntegracao[t]={...estilosIntegracao[t],...v};redesenha();return true;
              },
              get contextLayers(){return contexto;},
              get sel(){return sel;}, set sel(v){sel=v;},
              get blocoAtivo(){return blocoAtivo;}, set blocoAtivo(v){if(objs[v]){blocoAtivo=v;blocoParaPainel();}},
              get congelada(){return congelada;}, set congelada(v){congelada=v;},
              get secAB(){return {secA,secB};}, set secAB(v){secA=v?.a||null;secB=v?.b||null;secTemp=null;desenhaSecPainel();},
              get view(){return {escala,ox,oy,ferramenta,vistaManual};},
              getView(){return {escala,ox,oy,vistaManual};},
              setView(v){if(!v)return;escala=+v.escala||escala;ox=Number.isFinite(+v.ox)?+v.ox:ox;oy=Number.isFinite(+v.oy)?+v.oy:oy;vistaManual=!!v.vistaManual;redesenha();},
              setTool(tipo){
                const desenhoNovo=tipo==="cava"||tipo==="pilha";
                const incorporado=window.frameElement&&window.frameElement.id==="cava2Frame";
                if(desenhoNovo&&incorporado&&!document.body.dataset.ccmgisMdtId){
                  window.dispatchEvent(new CustomEvent("cava2:drawing-blocked",{detail:{tipo,reason:"mdt-required"}}));
                  return false;
                }
                defineTool(tipo);return true;
              },worldToScreen:(x,y)=>W2S(x,y),
              setDrawingEnabled(ok,mdtId){
                document.body.dataset.ccmgisMdtId=ok?String(mdtId||"ok"):"";
                if(!ok&&(ferramenta==="cava"||ferramenta==="pilha")){
                  desenho=null;defineTool("mover");
                }
                return !!ok;
              },
              setWorkSurface(v){
                superficieTrabalho=v&&typeof v.sampleZ==="function"?{
                  id:v.id,name:v.name||"MDT",designId:v.designId||null,revision:v.revision||0,
                  workZ:+v.workZ,cellSize:Math.max(.05,+v.cellSize||1),
                  tolerance:Math.max(.001,+v.tolerance||.1),
                  opacity:Math.max(0,Math.min(1,Number.isFinite(+v.opacity)?+v.opacity:1)),sampleZ:v.sampleZ
                }:null;cacheSuperficieTrabalho.clear();
                redesenha();return !!superficieTrabalho;
              },
              setWorkElevation(z){
                if(!superficieTrabalho||!Number.isFinite(+z))return false;
                superficieTrabalho.workZ=+z;cacheSuperficieTrabalho.clear();redesenha();return true;
              },
              getWorkClassification(k){
                k=objs[k]?k:blocoAtivo;const o=objs[k];if(!o?.base)return [];
                const out=[],add=(runs,component,index)=>runs.forEach(r=>out.push({
                  baseKey:k,component,index,elevation:r.elevation,relation:r.relation,
                  points:r.points.map(p=>({x:p.x,y:p.y,z:p.lineZ})),
                  lengthM:r.points.slice(1).reduce((s,p,i)=>s+Math.hypot(p.x-r.points[i].x,p.y-r.points[i].y),0)
                }));
                if(o.design){
                  (o.design.aneis||[]).forEach((a,i)=>add(trechosLinhaPorCota(a.P,true,cotaAbsolutaDoDesign(a.z)),a.tp,i));
                  (o.design.corredores||[]).forEach((c,i)=>{
                    if(c.poly?.length>2)add(trechosLinhaPorCota(c.poly,true,p=>cotaAbsolutaDoDesign(p.z)),"rampa contorno",i);
                    if(c.centro?.length>1)add(trechosLinhaPorCota(c.centro,false,p=>cotaAbsolutaDoDesign(p.z)),"rampa eixo",i);
                  });
                }else add(trechosLinhaBasePorCota(o.base,true,cotaTrabalhoDoObjeto(k)),"linha-base",0);
                return out;
              },
              beginDrawing(tipo){
                tipo=tipo==="pilha"?"pilha":"cava";
                const incorporado=window.frameElement&&window.frameElement.id==="cava2Frame";
                if(incorporado&&!document.body.dataset.ccmgisMdtId){
                  window.dispatchEvent(new CustomEvent("cava2:drawing-blocked",{detail:{tipo,reason:"mdt-required"}}));
                  return false;
                }
                desenho={alvo:tipo,pts:[]};defineTool(tipo);return true;
              },
              activateExternalTool(tool,tipo){
                if((tipo==="pilha"||tipo==="cava")&&(!objs[blocoAtivo]||tipoDe(blocoAtivo)!==tipo))blocoAtivo=tipo;
                if(tool==="selpoly")return iniciaSelecaoPoligono();
                if(tool==="select"||tool==="vertex"||tool==="info"){
                  selecaoMultipla=[];poligonoSelecao=[];defineTool("editar");return true;
                }
                if(tool==="point"){defineTool("rampa");return true;}
                if(tool==="line"||tool==="measure"){
                  secA=null;secB=null;secTemp=null;desenhaSecPainel();defineTool("secao");return true;
                }
                if(tool==="poly")return this.beginDrawing(tipo);
                if(tool==="clear"){$("b_limpar").click();return true;}
                if(tool==="move"){defineTool("mover");return true;}
                return false;
              },
              getSelection(){return {single:sel,multiple:selecaoMultipla.map(x=>({...x}))};},
              clearAll(){$("b_limpar").click();return true;},
              iniciarDesenhoCava(){return this.beginDrawing("cava");},
              iniciarDesenhoDce(){return this.beginDrawing("pilha");},
              redesenha};
defineTool("mover");
if(!carregaEstado()){
  if(window.frameElement&&window.frameElement.id==="cava2Frame"){
    limpaCadeia();saneiaPainel();regen();
  }else exemplo();
}else{sincNb("cava");sincNb("pilha");regen();}
`;
  motor = motor.slice(0, apiStart) + apiBoot + motor.slice(scriptEnd);
  return motor;
}

function adaptaFluxoMdt(source) {
  let out = source;
  out = replaceOnce(
    out,
    "  painelFechado:true,cutHashes:{}};",
    "  painelFechado:true,cutHashes:{},mdtTrabalhoId:null};",
    "estado do MDT de trabalho"
  );
  out = replaceOnce(
    out,
    "    crs:(typeof S!=='undefined'&&S.workCRS)||null,fonte:null,mdtId:null,cutMdt:false,",
    "    crs:(typeof S!=='undefined'&&S.workCRS)||null,fonte:null,mdtId:estado.mdtTrabalhoId||null,cutMdt:!!estado.mdtTrabalhoId,",
    "MDT herdado por novos desenhos"
  );
  out = replaceOnce(
    out,
    `    <label>MDT <select id="cava2Mdt" aria-label="Superfície para interseção"></select></label>
    <button id="cava2CutMdt" title="Recorta cristas, pés e rampa pela superfície selecionada">✂ Interseção MDT</button>
    <button id="cava2ClearCut" title="Volta a exibir as linhas brutas editáveis">× Remover corte</button>`,
    `    <span class="cava2-mdt-legacy" hidden aria-hidden="true">
      <label>MDT <select id="cava2Mdt" aria-label="Superfície para interseção"></select></label>
      <button id="cava2CutMdt" tabindex="-1">Interseção MDT</button>
      <button id="cava2ClearCut" tabindex="-1">Remover corte</button>
    </span>`,
    "controles MDT antigos"
  );
  out = replaceOnce(
    out,
    `  mdt.onchange=e=>{
    const d=desenhoAtual();if(!d)return;d.mdtId=e.target.value||null;
    estado.cutHashes[d.id]=null;salvaRegistroLocal();
    if(d.cutMdt)cortaMdtAtual(true);
  };`,
    `  mdt.onchange=e=>selecionaMdtTrabalho(e.target.value);`,
    "seleção externa do MDT"
  );
  out = replaceOnce(
    out,
    `    populaMdts();
    status('Área 2D pronta · escolha um MDT para gerar a interseção da cava/DCE com a superfície.');`,
    `    populaMdts();configuraMdtNoMotor();
    if(rasterDoDesenho(desenhoAtual()))status('MDT de trabalho pronto · desenhe ou edite a cava/DCE; a camada Interseção será atualizada automaticamente.');
    else status('Escolha primeiro o MDT de trabalho para liberar o desenho da cava/DCE.',true);`,
    "inicialização do MDT no motor"
  );
  out = replaceOnce(
    out,
    `function nomeCorteMdt(d,R){
  return \`\${nomeCamada(d)} — interseção com \${R?.name||'MDT'}\`;
}`,
    `function nomeCorteMdt(d,R){
  return \`Interseção — \${d?.nome||tipoNome(d?.tipo)}\`;
}`,
    "nome da camada Interseção"
  );
  out = replaceOnce(
    out,
    `function dadosRegistro(){
  return {version:2,activeId:estado.desenhoId,seq:estado.seq,painelFechado:estado.painelFechado,
    designs:clone(estado.desenhos)};
}`,
    `function dadosRegistro(){
  return {version:2,activeId:estado.desenhoId,seq:estado.seq,painelFechado:estado.painelFechado,
    mdtTrabalhoId:estado.mdtTrabalhoId||null,designs:clone(estado.desenhos)};
}`,
    "persistência do MDT de trabalho"
  );
  out = replaceOnce(
    out,
    `  estado.projetoPendente=undefined;const m=migraEstado(st);
  const usados=new Set();`,
    `  estado.projetoPendente=undefined;const m=migraEstado(st);
  estado.mdtTrabalhoId=m?.mdtTrabalhoId??m?.designs?.find(q=>q?.mdtId)?.mdtId??null;
  const usados=new Set();`,
    "restauração do MDT de trabalho"
  );
  out = replaceOnce(
    out,
    `      mdtId:d.mdtId??null,cutMdt:!!d.cutMdt};`,
    `      mdtId:d.mdtId??estado.mdtTrabalhoId??null,cutMdt:!!(d.mdtId??estado.mdtTrabalhoId)};`,
    "migração dos desenhos para interseção dinâmica"
  );

  const helperAnchor = `  if(valor&&rasters.some(r=>String(r.id)===valor))el.value=valor;
  return rasters;
}
function rasterDoDesenho(d){`;
  const helperBlock = `  if(valor&&rasters.some(r=>String(r.id)===valor))el.value=valor;
  sincronizaSeletorMdtMotor(d,rasters);
  return rasters;
}
function sincronizaSeletorMdtMotor(d,rasters){
  const D=doc2D(),el=D&&D.getElementById('ccmgis_mdt');if(!el)return false;
  d=d||desenhoAtual();rasters=rasters||(S.rasters||[]).filter(r=>r&&r.d&&r.d.z&&Number.isFinite(+r.d.nc)&&Number.isFinite(+r.d.nr));
  const valor=String(d?.mdtId??estado.mdtTrabalhoId??'');
  el.innerHTML='<option value="">Escolher MDT de trabalho</option>'+rasters.map(r=>
    \`<option value="\${esc(r.id)}">\${esc(r.name||\`MDT \${r.id}\`)}</option>\`).join('');
  if(valor&&rasters.some(r=>String(r.id)===valor))el.value=valor;else el.value='';
  const ok=!!el.value,cmd=D.getElementById('ccmgisMdtCommand'),cut=D.getElementById('ccmgis_cortar_cava');
  D.body.dataset.ccmgisMdtId=ok?el.value:'';
  cmd?.classList.toggle('tem-mdt',ok);cmd?.classList.toggle('sem-mdt',!ok);
  if(cut)cut.disabled=!ok;
  for(const id of ['t_cava','t_pilha']){
    const b=D.getElementById(id);if(!b)continue;
    b.classList.toggle('aguarda-mdt',!ok);b.setAttribute('aria-disabled',String(!ok));
  }
  return ok;
}
function exigeMdt(){
  status('Escolha primeiro o MDT de trabalho; depois o desenho da cava/DCE será liberado.',true);
  const D=doc2D(),cmd=D&&D.getElementById('ccmgisMdtCommand'),el=D&&D.getElementById('ccmgis_mdt');
  cmd?.classList.remove('mdt-alerta');void cmd?.offsetWidth;cmd?.classList.add('mdt-alerta');
  setTimeout(()=>cmd?.classList.remove('mdt-alerta'),900);try{el?.focus();}catch(e){}
  return false;
}
function selecionaMdtTrabalho(id){
  id=String(id||'');const R=(S.rasters||[]).find(r=>String(r.id)===id&&r?.d?.z)||null;
  estado.mdtTrabalhoId=R?R.id:null;
  for(const d of estado.desenhos){
    d.mdtId=R?R.id:null;d.cutMdt=!!R;estado.cutHashes[d.id]=null;
    const C=camadaCorteDoDesenho(d.id);if(C)removeCamadaGerada(C);
    if(!R)mostraBrutaSemCorte(d);
  }
  const externo=document.getElementById('cava2Mdt');if(externo)externo.value=R?String(R.id):'';
  sincronizaSeletorMdtMotor(desenhoAtual());salvaRegistroLocal();
  if(typeof refreshUI==='function')refreshUI();atualizaContexto();
  if(!R){status('Nenhum MDT de trabalho selecionado; o desenho da cava/DCE está bloqueado.',true);return false;}
  const d=desenhoAtual(),design=designRuntime(d);
  status(\`MDT de trabalho “\${R.name||R.id}” selecionado · a Interseção será atualizada automaticamente.\`);
  if(design)sincronizaCamadas(false);
  return true;
}
function configuraMdtNoMotor(){
  const D=doc2D(),el=D&&D.getElementById('ccmgis_mdt'),cut=D&&D.getElementById('ccmgis_cortar_cava');
  if(!D||!el||!cut)return false;
  if(!el.dataset.ccmgisBound){
    el.dataset.ccmgisBound='1';el.addEventListener('pointerdown',()=>populaMdts());
    el.addEventListener('change',()=>selecionaMdtTrabalho(el.value));
    cut.addEventListener('click',()=>rasterDoDesenho(desenhoAtual())?cortaMdtAtual(true):exigeMdt());
  }
  if(!D.documentElement.dataset.ccmgisMdtGuard){
    D.documentElement.dataset.ccmgisMdtGuard='1';
    D.addEventListener('click',ev=>{
      const b=ev.target?.closest?.('#t_cava,#t_pilha');if(!b||rasterDoDesenho(desenhoAtual()))return;
      ev.preventDefault();ev.stopImmediatePropagation();exigeMdt();
    },true);
  }
  sincronizaSeletorMdtMotor(desenhoAtual());return true;
}
function rasterDoDesenho(d){`;
  out = replaceOnce(out, helperAnchor, helperBlock, "comando Escolher MDT");

  out = replaceOnce(
    out,
    `  status(\`\${tipoNome(d.tipo)} “\${d.nome}” criada · desenhe o limite para gerar a camada.\`);`,
    `  status(rasterDoDesenho(d)?\`\${tipoNome(d.tipo)} “\${d.nome}” criada · desenhe o limite; a Interseção será dinâmica.\`:
    \`\${tipoNome(d.tipo)} “\${d.nome}” criada · escolha primeiro o MDT de trabalho.\`,!rasterDoDesenho(d));`,
    "mensagem de novo desenho"
  );
  out = replaceOnce(
    out,
    `function importaSelecionada(){
  const it=feicaoSelecionada();`,
    `function importaSelecionada(){
  if(!rasterDoDesenho(desenhoAtual()))return exigeMdt();
  const it=feicaoSelecionada();`,
    "MDT obrigatório antes da importação"
  );
  out = replaceOnce(
    out,
    `  if(publicar)publicaDesenho(d,designRuntime(d),false);
  atualizaContexto();
  try{doc2D()?.getElementById('b_ajustar')?.click();}catch(e){}`,
    `  if(publicar)publicaDesenho(d,designRuntime(d),false);
  atualizaContexto();configuraMdtNoMotor();
  if(d.mdtId&&d.engine)agendarSincronizacao();
  try{doc2D()?.getElementById('b_ajustar')?.click();}catch(e){}`,
    "sincronização dinâmica ao trocar de aba"
  );
  out = replaceOnce(
    out,
    `  restoreLayerDeletion:restauraExclusaoCamada,
  _featuresFromDesign:feicoesDoDesign,_reduceContextPath:reduzCaminhoPreservandoForma};`,
    `  restoreLayerDeletion:restauraExclusaoCamada,chooseWorkMdt:selecionaMdtTrabalho,
  cutCurrent:()=>cortaMdtAtual(true),requireWorkMdt:exigeMdt,
  _featuresFromDesign:feicoesDoDesign,_reduceContextPath:reduzCaminhoPreservandoForma};`,
    "API pública do MDT"
  );
  return out;
}

/* Fluxo CCMGIS2: o MDT é um requisito de entrada, a Interseção é uma prévia
   derivada e dinâmica, e o corte só é consolidado pelo último comando. */
function adaptaFluxoMdtV2(source) {
  let out = source;
  out = replaceOnce(out,
    "  painelFechado:true,cutHashes:{}};",
    "  painelFechado:true,cutHashes:{},mdtTrabalhoId:null};",
    "estado do MDT de trabalho v2");
  out = replaceOnce(out,
    "    crs:(typeof S!=='undefined'&&S.workCRS)||null,fonte:null,mdtId:null,cutMdt:false,",
    "    crs:(typeof S!=='undefined'&&S.workCRS)||null,fonte:null,mdtId:estado.mdtTrabalhoId||null,cutMdt:false,",
    "MDT herdado sem antecipar o corte");
  out = replaceOnce(out,
    `    <label>MDT <select id="cava2Mdt" aria-label="Superfície para interseção"></select></label>
    <button id="cava2CutMdt" title="Recorta cristas, pés e rampa pela superfície selecionada">✂ Interseção MDT</button>
    <button id="cava2ClearCut" title="Volta a exibir as linhas brutas editáveis">× Remover corte</button>`,
    `    <span class="cava2-mdt-legacy" hidden aria-hidden="true">
      <label>MDT <select id="cava2Mdt" aria-label="Superfície para interseção"></select></label>
      <button id="cava2CutMdt" tabindex="-1">Interseção MDT</button>
      <button id="cava2ClearCut" tabindex="-1">Remover corte</button>
    </span>`,
    "controles antigos de MDT ocultos");
  out = replaceOnce(out,
    `  mdt.onchange=e=>{
    const d=desenhoAtual();if(!d)return;d.mdtId=e.target.value||null;
    estado.cutHashes[d.id]=null;salvaRegistroLocal();
    if(d.cutMdt)cortaMdtAtual(true);
  };`,
    `  mdt.onchange=e=>selecionaMdtTrabalho(e.target.value);`,
    "seleção única do MDT");
  out = replaceOnce(out,
    `  document.getElementById('cava2BaseZ').onchange=e=>{
    estado.baseZ=n(e.target.value);const d=desenhoAtual();if(d)d.baseZ=estado.baseZ;
    salvaRegistroLocal();agendarSincronizacao();
  };`,
    `  document.getElementById('cava2BaseZ').onchange=e=>{
    if(!defineCotaTrabalho(e.target.value,false)){
      estado.baseZ=n(e.target.value);const d=desenhoAtual();if(d)d.baseZ=estado.baseZ;
      salvaRegistroLocal();agendarSincronizacao();
    }
  };`,
    "cota externa sincronizada com a cota de trabalho");
  out = replaceOnce(out,
    `    try{estado.frame.contentWindow.addEventListener('cava2:cursor',atualizaCursorGlobal);}catch(e){}`,
    `    try{estado.frame.contentWindow.addEventListener('cava2:cursor',atualizaCursorGlobal);}catch(e){}
    try{estado.frame.contentWindow.addEventListener('cava2:drawing-blocked',exigeMdt);}catch(e){}
    try{estado.frame.contentWindow.addEventListener('cava2:tool-changed',e=>{
      const mapa={selpoly:'selpoly',editar:'vertex',rampa:'point',secao:'line',cava:'poly',pilha:'poly'};
      marcaFerramentaGlobalCava(mapa[e.detail?.tool]||null);
    });}catch(e){}
    try{estado.frame.contentWindow.addEventListener('cava2:selection-changed',e=>{
      const total=+e.detail?.count||0;status(total?\`\${total} string(s) selecionada(s) por polígono.\`:'Nenhuma string encontrada dentro do polígono.',!total);
    });}catch(e){}`,
    "aviso do motor sem MDT");
  out = replaceOnce(out,
    `    populaMdts();
    status('Área 2D pronta · escolha um MDT para gerar a interseção da cava/DCE com a superfície.');`,
    `    populaMdts();configuraMdtNoMotor();
    if(rasterDoDesenho(desenhoAtual()))status('MDT de trabalho pronto · a camada Interseção será atualizada automaticamente.');
    else status('Escolha primeiro o MDT de trabalho para liberar o desenho da cava/DCE.',true);`,
    "inicialização do MDT obrigatório");
  out = replaceOnce(out,
    `function nomeCorteMdt(d,R){
  return \`\${nomeCamada(d)} — interseção com \${R?.name||'MDT'}\`;
}`,
    `function nomeCorteMdt(d,R){
  return \`Interseção — \${d?.nome||tipoNome(d?.tipo)}\`;
}`,
    "nome fixo da camada Interseção");
  out = replaceOnce(out,
    `function dadosRegistro(){
  return {version:2,activeId:estado.desenhoId,seq:estado.seq,painelFechado:estado.painelFechado,
    designs:clone(estado.desenhos)};
}`,
    `function dadosRegistro(){
  return {version:2,activeId:estado.desenhoId,seq:estado.seq,painelFechado:estado.painelFechado,
    mdtTrabalhoId:estado.mdtTrabalhoId||null,designs:clone(estado.desenhos)};
}`,
    "persistência do MDT");
  out = replaceOnce(out,
    `  estado.projetoPendente=undefined;const m=migraEstado(st);
  const usados=new Set();`,
    `  estado.projetoPendente=undefined;const m=migraEstado(st);
  estado.mdtTrabalhoId=m?.mdtTrabalhoId??m?.designs?.find(q=>q?.mdtId)?.mdtId??null;
  const usados=new Set();`,
    "restauração do MDT");
  out = replaceOnce(out,
    `      mdtId:d.mdtId??null,cutMdt:!!d.cutMdt};`,
    `      mdtId:d.mdtId??estado.mdtTrabalhoId??null,cutMdt:!!d.cutMdt};`,
    "migração independente do corte");

  const ferramentasGlobais = `function comandoGlobalDaCava(tool){
  return ({select:'select',selpoly:'selpoly',vertex:'vertex',point:'point',line:'line',poly:'poly',
    del:'clear',measure:'measure',info:'info'})[tool]||null;
}
function marcaFerramentaGlobalCava(tool){
  const box=document.getElementById('mapTools');if(!box)return;
  box.querySelectorAll('.mtool[data-tool]').forEach(x=>x.classList.toggle('on',x.dataset.tool===tool));
  const limpar=document.getElementById('btnCavaClear');if(limpar)limpar.classList.toggle('on',tool==='clear');
}
function atualizaBarraGlobalCava(ativa){
  const box=document.getElementById('mapTools');if(!box)return;
  const titulos={select:'Selecionar string',selpoly:'Selecionar strings por polígono',vertex:'Editar vértices',
    point:'Definir início da rampa',line:'Desenhar seção A–A′',poly:'Desenhar limite da cava/DCE',
    del:'Limpar tudo da cava/DCE',measure:'Seção A–A′',info:'Selecionar e inspecionar string'},
    cores={select:'#087bb5',selpoly:'#007f7b',vertex:'#7447c6',point:'#c61f70',line:'#00798c',
      poly:'#bd5c00',del:'#c92d35',measure:'#087c51',info:'#3b61b5'};
  for(const b of box.querySelectorAll('.mtool[data-tool]')){
    if(!b.dataset.cava2Title)b.dataset.cava2Title=b.title||'';
    if(b.dataset.cava2Color==null)b.dataset.cava2Color=b.style.color||'';
    if(titulos[b.dataset.tool])b.title=ativa?titulos[b.dataset.tool]:b.dataset.cava2Title;
    if(cores[b.dataset.tool])b.style.color=ativa?cores[b.dataset.tool]:b.dataset.cava2Color;
  }
  let limpar=document.getElementById('btnCavaClear');
  if(!limpar){
    limpar=document.createElement('button');limpar.type='button';limpar.id='btnCavaClear';limpar.className='mtool';
    limpar.title='Limpar tudo da cava/DCE';limpar.setAttribute('aria-label',limpar.title);limpar.style.color='#c92d35';
    limpar.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3m-8 0 1 14h8l1-14M10 11v6m4-6v6"/><path d="m18 3 .7 1.7L20.5 5l-1.8.7L18 7.5l-.7-1.8L15.5 5l1.8-.3Z" class="soft"/></svg>';
    const base=document.getElementById('btnBaseToggle');box.insertBefore(limpar,base||null);
  }
  limpar.hidden=!ativa;limpar.style.display=ativa?'flex':'none';
  if(!ativa)marcaFerramentaGlobalCava(null);
}
function ligaFerramentasGlobais(){
  const box=document.getElementById('mapTools');if(!box||box.dataset.cava2Bridge)return;
  box.dataset.cava2Bridge='1';
  box.addEventListener('click',e=>{
    if(S._view!=='cava2')return;
    const b=e.target.closest('.mtool');if(!b)return;
    const dedicado=b.id==='btnCavaClear',tool=dedicado?'clear':b.dataset.tool,cmd=comandoGlobalDaCava(tool);
    if(!cmd)return;
    if(['point','line','poly'].includes(tool)&&!rasterDoDesenho(desenhoAtual())){
      e.preventDefault();e.stopImmediatePropagation();exigeMdt();return;
    }
    const A=api();if(!A||typeof A.activateExternalTool!=='function')return;
    e.preventDefault();e.stopImmediatePropagation();
    if(A.activateExternalTool(cmd,alvoAtual())!==false)marcaFerramentaGlobalCava(tool);
  },true);
}

`;
  out = replaceBetween(out,"function ligaFerramentasGlobais(){","function abre(){",ferramentasGlobais,
    "ponte real das ferramentas inferiores no modo cava");
  out = replaceOnce(out,
    `function abre(){
  criaInterface();const host=workspace();if(host)host.classList.add('on');
  aplicaTemaNoMotor();aplicaPainel();
  if(estado.ready)atualizaContexto();
}`,
    `function abre(){
  criaInterface();const host=workspace();if(host)host.classList.add('on');
  aplicaTemaNoMotor();aplicaPainel();atualizaBarraGlobalCava(true);
  if(estado.ready)atualizaContexto();
}`,
    "ativação da barra inferior na cava");
  out = replaceOnce(out,
    `function fecha(){const host=workspace();if(host)host.classList.remove('on');}`,
    `function fecha(){const host=workspace();if(host)host.classList.remove('on');atualizaBarraGlobalCava(false);}`,
    "restauração da barra inferior");

  const mdtFunctions = `function mdtValido(R){
  const g=R?.d;
  return !!(g&&g.z&&Number.isFinite(+g.nc)&&+g.nc>1&&Number.isFinite(+g.nr)&&+g.nr>1&&
    Number.isFinite(+g.cs)&&+g.cs>0);
}
function listaMdtsValidos(){return typeof S==='undefined'?[]:(S.rasters||[]).filter(mdtValido);}
function limitesMdt(R){
  if(!R)return null;
  try{
    const st=R._st||(typeof rasterStats==='function'?(R._st=rasterStats(R.d)):null),mn=+st?.mn,mx=+st?.mx;
    if(Number.isFinite(mn)&&Number.isFinite(mx)&&mx>=mn)return {min:mn,max:mx};
  }catch(e){}
  const z=R.d?.z||[];let min=Infinity,max=-Infinity;
  const le=v=>{v=+v;if(Number.isFinite(v)&&Math.abs(v)<1e30){if(v<min)min=v;if(v>max)max=v;}};
  for(const linha of z){if(Array.isArray(linha)||ArrayBuffer.isView(linha))for(const v of linha)le(v);else le(linha);}
  return Number.isFinite(min)&&Number.isFinite(max)&&max>=min?{min,max}:null;
}
function formataCota(v){
  if(!Number.isFinite(+v))return '—';const a=Math.abs(+v-Math.round(+v))<1e-7?0:1;
  return (+v).toLocaleString('pt-BR',{minimumFractionDigits:a,maximumFractionDigits:a});
}
function cotaRedonda5(v,sentido){
  v=+v;if(!Number.isFinite(v))return NaN;
  let piso,teto;
  if(typeof cavaArredondaCota==='function'){
    piso=cavaArredondaCota(v,5,'min');teto=cavaArredondaCota(v,5,'max');
  }else{piso=Math.floor((v+1e-8)/5)*5;teto=Math.ceil((v-1e-8)/5)*5;}
  if(sentido==='baixo')return piso;if(sentido==='cima')return teto;
  return Math.abs(v-piso)<=Math.abs(teto-v)?piso:teto;
}
function limitesCotaRedonda(R){
  const bruto=limitesMdt(R);if(!bruto)return null;
  const min=cotaRedonda5(bruto.min,'cima'),max=cotaRedonda5(bruto.max,'baixo');
  if(Number.isFinite(min)&&Number.isFinite(max)&&max>=min)return {min,max,bruto};
  const unico=cotaRedonda5((bruto.min+bruto.max)/2);return {min:unico,max:unico,bruto};
}
function normalizaCotaDesenho(d,R){
  const lim=limitesCotaRedonda(R);if(!d||!lim)return null;
  let z=+d.baseZ;
  if(!Number.isFinite(z)||z<lim.min||z>lim.max)z=d.tipo==='pilha'?lim.min:lim.max;
  z=cotaRedonda5(Math.max(lim.min,Math.min(lim.max,z)));
  z=Math.max(lim.min,Math.min(lim.max,z));d.baseZ=z;estado.baseZ=z;
  return {...lim,value:z};
}
function configuraCotaTrabalho(d,R){
  const D=doc2D(),box=D&&D.getElementById('ccmgisCotaCommand'),range=D&&D.getElementById('ccmgis_cota_trabalho'),
    minEl=D&&D.getElementById('ccmgis_cota_min'),maxEl=D&&D.getElementById('ccmgis_cota_max'),out=D&&D.getElementById('ccmgis_cota_valor');
  if(!box||!range||!minEl||!maxEl||!out)return false;
  d=d||desenhoAtual();R=R||rasterDoDesenho(d);const c=normalizaCotaDesenho(d,R);
  box.hidden=!c;range.disabled=!c;
  if(!c){minEl.textContent=maxEl.textContent=out.textContent='—';return false;}
  const passo=5;
  range.min=String(c.min);range.max=String(c.max);range.step=String(passo);range.value=String(c.value);
  minEl.textContent=formataCota(c.min);maxEl.textContent=formataCota(c.max);out.value=out.textContent=formataCota(c.value);
  box.title=\`Cota de trabalho · mínima \${formataCota(c.min)} m · máxima \${formataCota(c.max)} m\`;
  const externo=document.getElementById('cava2BaseZ');if(externo)externo.value=String(c.value);return true;
}
function sincronizaSuperficieTrabalhoNoMotor(d,R){
  const A=api();if(!A||typeof A.setWorkSurface!=='function')return false;
  d=d||desenhoAtual();R=R||rasterDoDesenho(d);
  if(!d||!R){A.setWorkSurface(null);return false;}
  const origem=d.crs||S.workCRS,g=R.d,destino=R.crs||g.crs||S.workCRS;
  const sampleZ=(x,y)=>{
    let px=+x,py=+y;if(!Number.isFinite(px)||!Number.isFinite(py))return NaN;
    try{
      if(origem&&destino&&String(origem)!==String(destino)){
        const w=toWGS(origem,px,py),q=fromWGS(destino,w[0],w[1]);px=q[0];py=q[1];
      }
      return sampleZbil(g,px,py);
    }catch(e){return NaN;}
  };
  return A.setWorkSurface({id:R.id,name:R.name||String(R.id),designId:d.id,
    revision:R._dataRev??g._rev??R._rev??0,workZ:+d.baseZ,cellSize:+g.cs||1,tolerance:.1,
    opacity:R.style?.opacity??R.opacity??1,sampleZ});
}
function defineCotaTrabalho(valor,silencioso){
  const d=desenhoAtual(),R=rasterDoDesenho(d),lim=limitesCotaRedonda(R);if(!d||!R||!lim)return false;
  let z=+valor;if(!Number.isFinite(z))return false;
  z=cotaRedonda5(Math.max(lim.min,Math.min(lim.max,z)));
  z=Math.max(lim.min,Math.min(lim.max,z));
  d.baseZ=z;estado.baseZ=z;estado.cutHashes[d.id]=null;
  configuraCotaTrabalho(d,R);try{api()?.setWorkElevation?.(z);}catch(e){}
  salvaRegistroLocal();
  agendarSincronizacao();
  if(!silencioso)status(\`Cota de trabalho: \${formataCota(z)} m · toda a \${tipoNome(d.tipo)} foi deslocada verticalmente · comparação com “\${R.name||R.id}” atualizada.\`);
  return true;
}
function populaMdts(d){
  const el=document.getElementById('cava2Mdt');if(!el)return [];
  d=d||desenhoAtual();const rasters=listaMdtsValidos(),valor=String(d?.mdtId??estado.mdtTrabalhoId??el.value??'');
  el.innerHTML='<option value="">— escolha a superfície —</option>'+rasters.map(r=>
    \`<option value="\${esc(r.id)}">\${esc(r.name||\`MDT \${r.id}\`)}</option>\`).join('');
  if(valor&&rasters.some(r=>String(r.id)===valor))el.value=valor;else el.value='';
  sincronizaSeletorMdtMotor(d,rasters);return rasters;
}
function sincronizaSeletorMdtMotor(d,rasters){
  const D=doc2D(),el=D&&D.getElementById('ccmgis_mdt');if(!el)return false;
  d=d||desenhoAtual();rasters=rasters||listaMdtsValidos();
  const valor=String(d?.mdtId??estado.mdtTrabalhoId??'');
  el.innerHTML='<option value="">Escolher MDT de trabalho</option>'+rasters.map(r=>
    \`<option value="\${esc(r.id)}">\${esc(r.name||\`MDT \${r.id}\`)}</option>\`).join('');
  if(valor&&rasters.some(r=>String(r.id)===valor))el.value=valor;else el.value='';
  const ok=!!el.value,cmd=D.getElementById('ccmgisMdtCommand'),cut=D.getElementById('ccmgis_cortar_cava');
  D.body.dataset.ccmgisMdtId=ok?el.value:'';
  cmd?.classList.toggle('tem-mdt',ok);cmd?.classList.toggle('sem-mdt',!ok);
  const R=rasters.find(r=>String(r.id)===el.value);
  cmd?.setAttribute('data-tooltip',ok?\`MDT: \${R?.name||el.value}\`:'Escolher MDT de trabalho');
  configuraCotaTrabalho(d,R||null);
  sincronizaSuperficieTrabalhoNoMotor(d,R||null);
  if(cut){cut.disabled=!ok;cut.classList.toggle('corte-finalizado',!!d?.cutMdt);}
  for(const id of ['t_cava','t_pilha','b_escolher']){
    const b=D.getElementById(id);if(!b)continue;
    b.classList.toggle('aguarda-mdt',!ok);b.setAttribute('aria-disabled',String(!ok));
  }
  try{api()?.setDrawingEnabled?.(ok,el.value);}catch(e){}
  const externo=document.getElementById('cava2Mdt');if(externo)externo.value=ok?el.value:'';
  return ok;
}
function exigeMdt(){
  status('Escolha primeiro o MDT de trabalho; depois o desenho da cava/DCE será liberado.',true);
  const D=doc2D(),cmd=D&&D.getElementById('ccmgisMdtCommand'),el=D&&D.getElementById('ccmgis_mdt');
  cmd?.classList.remove('mdt-alerta');void cmd?.offsetWidth;cmd?.classList.add('mdt-alerta');
  setTimeout(()=>cmd?.classList.remove('mdt-alerta'),900);try{el?.focus();el?.click();}catch(e){}return false;
}
function selecionaMdtTrabalho(id){
  id=String(id||'');const R=listaMdtsValidos().find(r=>String(r.id)===id)||null;
  const anterior=String(estado.mdtTrabalhoId??''),proximo=String(R?.id??'');estado.mdtTrabalhoId=R?R.id:null;
  if(anterior!==proximo){
    for(const d of estado.desenhos){
      d.mdtId=R?R.id:null;d.cutMdt=false;estado.cutHashes[d.id]=null;
      if(R)normalizaCotaDesenho(d,R);
      const C=camadaCorteDoDesenho(d.id);if(C)removeCamadaGerada(C);mostraBrutaSemCorte(d);
    }
  }else for(const d of estado.desenhos)if(!d.mdtId)d.mdtId=R?.id||null;
  sincronizaSeletorMdtMotor(desenhoAtual());salvaRegistroLocal();
  if(typeof refreshUI==='function')refreshUI();atualizaContexto();
  if(!R){status('Nenhum MDT de trabalho selecionado; o desenho da cava/DCE está bloqueado.',true);return false;}
  const d=desenhoAtual(),design=designRuntime(d);
  status(\`MDT de trabalho “\${R.name||R.id}” selecionado · a camada Interseção será atualizada automaticamente.\`);
  if(design)sincronizaCamadas(false);return true;
}
function configuraMdtNoMotor(){
  const D=doc2D(),el=D&&D.getElementById('ccmgis_mdt'),cut=D&&D.getElementById('ccmgis_cortar_cava'),
    cota=D&&D.getElementById('ccmgis_cota_trabalho');
  if(!D||!el||!cut||!cota)return false;
  if(!el.dataset.ccmgisBound){
    el.dataset.ccmgisBound='1';el.addEventListener('pointerdown',()=>populaMdts());
    el.addEventListener('change',()=>selecionaMdtTrabalho(el.value));
    cota.addEventListener('input',()=>defineCotaTrabalho(cota.value,true));
    cota.addEventListener('change',()=>defineCotaTrabalho(cota.value,false));
    cut.addEventListener('click',()=>rasterDoDesenho(desenhoAtual())?cortaMdtAtual(true):exigeMdt());
  }
  if(!D.documentElement.dataset.ccmgisMdtGuard){
    D.documentElement.dataset.ccmgisMdtGuard='1';
    D.addEventListener('click',ev=>{
      const b=ev.target?.closest?.('#t_cava,#t_pilha,#b_escolher,#b_novo_lim');
      if(!b||rasterDoDesenho(desenhoAtual()))return;
      ev.preventDefault();ev.stopImmediatePropagation();exigeMdt();
    },true);
  }
  sincronizaSeletorMdtMotor(desenhoAtual());return true;
}
function rasterDoDesenho(d){
  if(!d||d.mdtId==null||typeof S==='undefined')return null;
  return (S.rasters||[]).find(r=>String(r.id)===String(d.mdtId)&&mdtValido(r))||null;
}
`;
  out = replaceBetween(out,"function populaMdts(d){","function camadaCorteDoDesenho(id){",mdtFunctions,
    "funções do MDT obrigatório");

  out = replaceOnce(out,
    `  status(\`\${tipoNome(d.tipo)} “\${d.nome}” criada · desenhe o limite para gerar a camada.\`);`,
    `  status(rasterDoDesenho(d)?\`\${tipoNome(d.tipo)} “\${d.nome}” criada · desenhe o limite; a Interseção será dinâmica.\`:
    \`\${tipoNome(d.tipo)} “\${d.nome}” criada · escolha primeiro o MDT de trabalho.\`,!rasterDoDesenho(d));`,
    "mensagem da nova cava");
  out = replaceOnce(out,
    `function importaSelecionada(){
  const it=feicaoSelecionada();`,
    `function importaSelecionada(){
  if(!rasterDoDesenho(desenhoAtual()))return exigeMdt();
  const it=feicaoSelecionada();`,
    "MDT obrigatório na importação");
  out = replaceOnce(out,
    `  if(publicar)publicaDesenho(d,designRuntime(d),false);
  atualizaContexto();
  try{doc2D()?.getElementById('b_ajustar')?.click();}catch(e){}`,
    `  if(publicar)publicaDesenho(d,designRuntime(d),false);
  atualizaContexto();configuraMdtNoMotor();
  if(d.mdtId&&d.engine)agendarSincronizacao();
  try{doc2D()?.getElementById('b_ajustar')?.click();}catch(e){}`,
    "interseção ao trocar de aba");
  out = replaceOnce(out,
    `  restoreLayerDeletion:restauraExclusaoCamada,
  _featuresFromDesign:feicoesDoDesign,_reduceContextPath:reduzCaminhoPreservandoForma};`,
    `  restoreLayerDeletion:restauraExclusaoCamada,chooseWorkMdt:selecionaMdtTrabalho,
  canDraw:()=>!!rasterDoDesenho(desenhoAtual()),
  startDrawing:tipo=>rasterDoDesenho(desenhoAtual())?api()?.beginDrawing?.(tipo):exigeMdt(),
  cutCurrent:()=>cortaMdtAtual(true),clearActiveCut:removeCorteMdt,requireWorkMdt:exigeMdt,
  _featuresFromDesign:feicoesDoDesign,_reduceContextPath:reduzCaminhoPreservandoForma};`,
    "API pública do MDT e corte");

  const intersectionFunctions = `function assinaturaMdt(R){
  const g=R?.d||{},z=g.z||[],nc=Math.max(0,Math.floor(n(g.nc))),nr=Math.max(0,Math.floor(n(g.nr)));
  const valor=(i,j)=>{try{return Array.isArray(z[0])||ArrayBuffer.isView(z[0])?z[i]?.[j]:z[i*nc+j];}catch(e){return null;}};
  return JSON.stringify([R?.id,R?._dataRev??g._rev??R?._rev??0,nc,nr,n(g.cs),n(g.x0),n(g.y0),
    valor(0,0),valor(0,Math.max(0,nc-1)),valor(Math.floor(nr/2),Math.floor(nc/2)),valor(Math.max(0,nr-1),Math.max(0,nc-1))]);
}
function hashCorteMdt(d,R,finalizado){
  return \`\${assinaturaMdt(R)}|\${finalizado?'corte':'preview'}|\${d.tipo}|\${n(d.baseZ)}|\${JSON.stringify(d.engine||{})}\`;
}
function mostraBrutaSemCorte(d,mensagem,erro){
  const L=camadaDoDesenho(d?.id),C=camadaCorteDoDesenho(d?.id);
  if(L){L.visible=true;if(typeof drawLayer==='function')drawLayer(L);}
  if(C){C.visible=false;if(typeof drawLayer==='function')drawLayer(C);}
  if(mensagem)status(mensagem,erro);return null;
}
function publicaCorteMdt(d,design,silencioso,forcar,finalizar){
  const finalizado=!!(finalizar||d?.cutMdt),R=rasterDoDesenho(d),g=R?.d;
  if(!d||!g)return mostraBrutaSemCorte(d,'Escolha um MDT válido para calcular a interseção.',true);
  if(typeof cavaRecortaAneisFechadosNoMdt!=='function')
    return mostraBrutaSemCorte(d,'O algoritmo de interseção da cava não está disponível.',true);
  const hash=hashCorteMdt(d,R,finalizado),existente=camadaCorteDoDesenho(d.id);
  if(!forcar&&existente&&estado.cutHashes[d.id]===hash){
    const bruta=camadaDoDesenho(d.id);if(bruta){bruta.visible=!finalizado;drawLayer(bruta);}
    existente.visible=true;drawLayer(existente);return existente;
  }
  const src=feicoesDoDesign(design,n(d.baseZ),d);
  if(!src.length){
    if(existente)removeCamadaGerada(existente);estado.cutHashes[d.id]=null;
    return mostraBrutaSemCorte(d,silencioso?'':\`\${d.nome}: desenhe primeiro um limite fechado.\`,!silencioso);
  }
  const passo=Math.max(.2,Math.min(.75,n(g.cs,.5)));let q;
  try{q=cavaRecortaAneisFechadosNoMdt(feicoesCompativeisCorte(src),g,d.tipo==='pilha',passo);}
  catch(e){console.error('Interseção Área 2D × MDT',e);return mostraBrutaSemCorte(d,
    \`Falha ao calcular a interseção com “\${R.name}”: \${e.message||e}\`,true);}
  const todas=normalizaCorteMdt(q?.feats,d,R),inter=todas.filter(f=>f.props?.ELEMENTO==='Interseção');
  if(!inter.length){
    if(existente)removeCamadaGerada(existente);estado.cutHashes[d.id]=null;
    return mostraBrutaSemCorte(d,\`\${d.nome}: nenhuma interseção encontrada com “\${R.name}”; mantida a camada editável.\`,!silencioso);
  }
  const feats=finalizado?todas:inter,ativo=S.activeId;let C=existente;
  if(!C){
    C=addLayer({name:nomeCorteMdt(d,R),gtype:'line',features:feats,
      fields:['FID','DESENHO','DESIGN_ID','PROJETO','ELEMENTO','COTA','ORDEM','BANCO','MDT','ORIGEM'],
      crs:d.crs||S.workCRS,color:'#0d9488',src:'Área 2D · Cava2 · interseção dinâmica'});
    C._cava2CutOf=d.id;
  }else{
    C.features=feats;C.crs=d.crs||C.crs||S.workCRS;C.name=nomeCorteMdt(d,R);
    C.src=finalizado?'Área 2D · Cava2 · cava cortada':'Área 2D · Cava2 · interseção dinâmica';
  }
  C._cava2MdtId=R.id;C._cava2Kind=d.tipo;C._cava2Managed=true;
  C._cava2CutFinalized=finalizado;C._cava2IntersectionPreview=!finalizado;C.visible=true;estiloCamada(C,feats);
  const L=camadaDoDesenho(d.id);if(L){L.visible=!finalizado;drawLayer(L);}drawLayer(C);
  if(ativo!=null&&S.layers.some(x=>x.id===ativo))S.activeId=ativo;
  estado.cutHashes[d.id]=hash;if(!silencioso&&typeof refreshUI==='function')refreshUI();return C;
}
function cortaMdtAtual(forcar){
  const d=desenhoAtual();if(!d)return false;
  salvaAtual(false);d.mdtId=estado.mdtTrabalhoId||d.mdtId||null;if(!rasterDoDesenho(d))return exigeMdt();
  const C=publicaCorteMdt(d,designRuntime(d),false,!!forcar,true);
  if(!C){d.cutMdt=false;mostraBrutaSemCorte(d);sincronizaSeletorMdtMotor(d);salvaRegistroLocal();return false;}
  d.cutMdt=true;C._cava2CutFinalized=true;C._cava2IntersectionPreview=false;
  sincronizaSeletorMdtMotor(d);salvaRegistroLocal();if(typeof refreshUI==='function')refreshUI();atualizaContexto();
  const ni=C.features.filter(f=>f.props?.ELEMENTO==='Interseção').length;
  status(\`\${d.nome}: \${tipoNome(d.tipo)} cortado(a) por “\${rasterDoDesenho(d)?.name}” · \${ni} interseção fechada.\`);
  try{if(S._view==='v3d'&&typeof v3Auto==='function')v3Auto();}catch(e){}return true;
}
function removeCorteMdt(){
  const d=desenhoAtual();if(!d)return false;
  d.cutMdt=false;estado.cutHashes[d.id]=null;mostraBrutaSemCorte(d);salvaRegistroLocal();
  sincronizaCamadas(false);sincronizaSeletorMdtMotor(d);
  status(\`\${d.nome}: corte final removido; a Interseção dinâmica continua ativa.\`);return true;
}
`;
  out = replaceBetween(out,"function hashCorteMdt(d,R){","function designRuntime(d){",intersectionFunctions,
    "interseção dinâmica e corte final");

  const dynamicSync = `function sincronizaCamadas(manual){
  clearTimeout(estado.syncTimer);estado.syncTimer=0;
  const A=api(),d=desenhoAtual();
  if(!A||!d){if(manual)status('A área 2D ainda está carregando.',true);return false;}
  salvaAtual(false);const design=designRuntime(d),L=publicaDesenho(d,design,true),R=rasterDoDesenho(d),
    C=R?publicaCorteMdt(d,design,true,false,!!d.cutMdt):null;
  if(manual)reconstroiCamadasAusentes();if(typeof refreshUI==='function')refreshUI();
  try{if(typeof layoutSeVisivel==='function')layoutSeVisivel();}catch(e){}
  try{if(S._view==='v3d'&&typeof v3Auto==='function')v3Auto();}catch(e){}
  const total=L?.features?.length||0,ni=C?.features?.filter(f=>f.props?.ELEMENTO==='Interseção').length||0;
  atualizaContexto();salvaRegistroLocal();sincronizaSeletorMdtMotor(d);
  status(total?\`\${d.nome}: \${total} string(s) 3D · \${ni} interseção(ões) dinâmica(s)\${d.cutMdt?' · corte final ativo':''}.\`:
    \`\${d.nome}: desenhe um limite fechado para criar a camada.\`,manual&&!total);return true;
}
`;
  out = replaceBetween(out,"function sincronizaCamadas(manual){","function agendarSincronizacao(){",dynamicSync,
    "sincronização dinâmica");

  const rebuild = `function reconstroiCamadasAusentes(){
  const ativoId=estado.desenhoId,ativo=desenhoAtual();
  for(const d of estado.desenhos){
    const faltaBruta=!camadaDoDesenho(d.id),faltaIntersecao=!!d.mdtId&&!camadaCorteDoDesenho(d.id);
    if((!faltaBruta&&!faltaIntersecao)||!d.engine)continue;
    carregaMotor(d);const design=designRuntime(d);if(faltaBruta)publicaDesenho(d,design,true);
    if(d.mdtId)publicaCorteMdt(d,design,true,true,!!d.cutMdt);
  }
  estado.desenhoId=ativoId;if(ativo)carregaMotor(ativo);configuraMdtNoMotor();
}
`;
  out = replaceBetween(out,"function reconstroiCamadasAusentes(){","function snapshot(){",rebuild,
    "reconstrução de Interseções");
  return out;
}

const base = fs.readFileSync(basePath, "utf8");
const motor = adaptaMotorV106(fs.readFileSync(motorPath, "utf8"));
let out = corrigeAtualizacaoPrancha(base);

const sourceStart = out.indexOf("const CAVA2_V09_SOURCE=");
const sourceEnd = out.indexOf(";\nconst STORAGE_KEY=", sourceStart);
if (sourceStart < 0 || sourceEnd < 0) throw new Error("Motor v0.9 encapsulado não encontrado no CCMGIS 157");
/* Dentro de uma tag <script>, o parser HTML encerra o bloco mesmo quando
   </script> aparece entre aspas JavaScript. Escapar a barra preserva o HTML
   completo do iframe como uma única string. */
const motorLiteral = JSON.stringify(motor).replaceAll("</script", "<\\/script");
out = out.slice(0, sourceStart) + `const CAVA2_V106_SOURCE=${motorLiteral}` + out.slice(sourceEnd);
out = out.replaceAll("CAVA2_V09_SOURCE", "CAVA2_V106_SOURCE");
out = out.replace("motor v0.9 encapsulado", "motor v10.6 encapsulado");
out = out.replace("Cava &amp; Pilha por Strings — v0.9", "Cava &amp; Pilha por Strings — v10.6");
out = out.replace(
  "const IDS_VALORES=['cava_H','cava_banco','cava_face'",
  "const IDS_VALORES=['cava_H','cava_banco','cava_nb','cava_face'"
).replace(
  "'pilha_H','pilha_banco','pilha_face'",
  "'pilha_H','pilha_banco','pilha_nb','pilha_face'"
).replace(
  "'cava_rampa_larg','cava_rampa_grad',",
  "'cava_rampa_larg','cava_rampa_grad','cava_rampa_raio',"
).replace(
  "'pilha_rampa_larg','pilha_rampa_grad'];",
  "'pilha_rampa_larg','pilha_rampa_grad','pilha_rampa_raio'];"
);

out = replaceOnce(
  out,
  "  A.objs[alvo].base=P;A.objs[alvo].anc=null;A.objs[alvo].overrides={};A.regen();",
  "  if(typeof A.limpaCadeia==='function')A.limpaCadeia();\n" +
    "  A.objs[alvo].base=P;A.objs[alvo].anc=null;A.objs[alvo].bermas={};A.objs[alvo].prm=null;A.objs[alvo].z0=0;A.blocoAtivo=alvo;A.regen();",
  "importação de geometria no v10.6"
);

const oldClear = `function limpaMotorSemDesenho(){
  const A=api();if(!A)return false;estado.restaurando=true;
  try{
    for(const k of ['cava','pilha']){
      A.objs[k].base=null;A.objs[k].anc=null;A.objs[k].design=null;
      A.objs[k].overrides={};A.objs[k].ovMeta=null;
    }
    try{estado.frame.contentWindow.localStorage.removeItem(STORAGE_KEY);}catch(e){}
    A.secAB={a:null,b:null};A.regen();
  }finally{estado.restaurando=false;}
  const nm=document.getElementById('cava2Name');if(nm)nm.value='';
  return true;
}`;
const newClear = `function limpaMotorSemDesenho(){
  const A=api();if(!A)return false;estado.restaurando=true;
  try{
    if(typeof A.limpaCadeia==='function')A.limpaCadeia();
    else for(const k of ['cava','pilha']){A.objs[k].base=null;A.objs[k].anc=null;A.objs[k].design=null;}
    if(typeof A.saneiaPainel==='function')A.saneiaPainel();
    try{estado.frame.contentWindow.localStorage.removeItem(STORAGE_KEY);}catch(e){}
    A.secAB={a:null,b:null};A.regen();
  }finally{estado.restaurando=false;}
  const nm=document.getElementById('cava2Name');if(nm)nm.value='';
  return true;
}`;
out = replaceOnce(out, oldClear, newClear, "limpeza do motor");

out = replaceOnce(
  out,
  "function designRuntime(d){const A=api();return d&&A?A.objs[d.tipo]?.design:null;}",
  `function designRuntime(d){
  const A=api();if(!d||!A)return null;
  const ordem=k=>k===d.tipo?-1:n(String(k).split('#')[1],0);
  const blocos=Object.keys(A.objs||{}).filter(k=>k===d.tipo||k.startsWith(d.tipo+'#'))
    .sort((a,b)=>ordem(a)-ordem(b)).map(k=>A.objs[k]?.design).filter(Boolean);
  if(!blocos.length)return null;if(blocos.length===1)return blocos[0];
  return {aneis:blocos.flatMap(x=>x.aneis||[]),corredores:blocos.flatMap(x=>x.corredores||[]),
    avisos:blocos.flatMap(x=>x.avisos||[]),nBancos:blocos.reduce((s,x)=>s+n(x.nBancos),0),
    areaBase:n(blocos[0]?.areaBase),areaFinal:n(blocos.at(-1)?.areaFinal),
    vol:blocos.reduce((s,x)=>s+n(x.vol),0),rampaDesenv:blocos.reduce((s,x)=>s+n(x.rampaDesenv),0)};
}`,
  "agregação dos limites continuados"
);

out = replaceOnce(
  out,
  `function leEstadoMotor(){
  try{return JSON.parse(estado.frame.contentWindow.localStorage.getItem(STORAGE_KEY)||'null');}catch(e){return null;}
}`,
  `function leEstadoMotor(){
  const A=api();
  try{if(A&&typeof A.estadoAtual==='function')return A.estadoAtual();}catch(e){}
  try{return JSON.parse(estado.frame.contentWindow.localStorage.getItem(STORAGE_KEY)||'null');}catch(e){return null;}
}`,
  "snapshot do motor"
);

const loadStart = out.indexOf("function carregaMotor(d){");
const loadEnd = out.indexOf("function aplicaDesenho(d,publicar){", loadStart);
if (loadStart < 0 || loadEnd < 0) throw new Error("carregaMotor não encontrado");
const newLoad = `function carregaMotor(d){
  const A=api(),D=doc2D();if(!A||!D||!d)return false;
  const e=d.engine;estado.restaurando=true;
  try{
    estado.baseZ=n(d.baseZ);estado.crs=d.crs||S.workCRS;estado.fonte=clone(d.fonte)||null;
    if(typeof A.limpaCadeia==='function')A.limpaCadeia();
    if(!e){
      if(typeof A.saneiaPainel==='function')A.saneiaPainel();
      A.blocoAtivo=d.tipo;
      try{estado.frame.contentWindow.localStorage.removeItem(STORAGE_KEY);}catch(x){}
    }else if(typeof A.aplicaEstado==='function'&&(typeof e==='string'||e?.bl||e?.c||e?.p)){
      A.aplicaEstado(typeof e==='string'?e:JSON.stringify(e));
    }else{
      /* Compatibilidade com os instantâneos do motor anterior. */
      A.objs.cava.base=clone(e.bases?.cava)||null;A.objs.pilha.base=clone(e.bases?.pilha)||null;
      A.objs.cava.anc=clone(e.ancs?.cava)||null;A.objs.pilha.anc=clone(e.ancs?.pilha)||null;
      A.objs.cava.bermas=clone(e.ovs?.cava)||{};A.objs.pilha.bermas=clone(e.ovs?.pilha)||{};
      IDS_VALORES.forEach(id=>{if(D.getElementById(id)&&e.vals?.[id]!=null)D.getElementById(id).value=e.vals[id];});
      for(const id of ['cava_rampa_raio','pilha_rampa_raio'])if(D.getElementById(id)&&e.vals?.[id]==null)D.getElementById(id).value=20;
      if(e.chks){D.getElementById('cava_rampa_on').checked=!!e.chks.c;D.getElementById('pilha_rampa_on').checked=!!e.chks.p;}
      if(e.dirs){D.getElementById('cava_rampa_dir').value=e.dirs.c||'ah';D.getElementById('pilha_rampa_dir').value=e.dirs.p||'ah';}
      A.blocoAtivo=d.tipo;
    }
    atualizaCampos(d);A.regen();A.secAB={a:null,b:null};
  }finally{estado.restaurando=false;}
  return true;
}
`;
  out = out.slice(0, loadStart) + newLoad + out.slice(loadEnd);
  out = adaptaFluxoMdtV2(out);

  /* Replica exatamente a colocação de um ImageOverlay do Leaflet quando só a
     prévia Mercator está disponível (por exemplo, num projeto reaberto). A
     malha transforma toda a imagem, não somente os cantos SW/NE. */
  out = replaceOnce(
    out,
`function limitesDoOverlay(ov){
  try{
    const b=ov&&ov.getBounds&&ov.getBounds();if(!b)return null;
    const a=fromWGS(S.workCRS,b.getWest(),b.getSouth()),c=fromWGS(S.workCRS,b.getEast(),b.getNorth());
    if([a[0],a[1],c[0],c[1]].every(Number.isFinite))return [a[0],a[1],c[0],c[1]];
  }catch(e){}
  return null;
}`,
`function georreferenciaMercatorDaImagem(llBounds,divisoes){
  try{
    const sw=Array.isArray(llBounds)?llBounds[0]:null,ne=Array.isArray(llBounds)?llBounds[1]:null;
    if(!sw||!ne)return null;
    const oeste=+sw[1],sul=+sw[0],leste=+ne[1],norte=+ne[0];
    if(![oeste,sul,leste,norte].every(Number.isFinite)||leste<=oeste||norte<=sul)return null;
    const a=reproj('EPSG:4326','EPSG:3857',oeste,sul),z=reproj('EPSG:4326','EPSG:3857',leste,norte),
      cols=Math.max(1,Math.min(16,Math.round(+divisoes||8))),rows=cols,points=[];
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(let r=0;r<=rows;r++)for(let c=0;c<=cols;c++){
      const X=a[0]+(z[0]-a[0])*c/cols,Y=z[1]+(a[1]-z[1])*r/rows,
        q=S.workCRS==='EPSG:3857'?[X,Y]:reproj('EPSG:3857',S.workCRS,X,Y),x=+q[0],y=+q[1];
      if(!Number.isFinite(x)||!Number.isFinite(y))return null;
      points.push({x,y});if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
    }
    return {bounds:[x0,y0,x1,y1],mesh:{cols,rows,points}};
  }catch(e){return null;}
}
function georreferenciaDoOverlay(ov){
  try{
    const b=ov&&ov.getBounds&&ov.getBounds();if(!b)return null;
    return georreferenciaMercatorDaImagem([[b.getSouth(),b.getWest()],[b.getNorth(),b.getEast()]],8);
  }catch(e){return null;}
}
function limitesDoOverlay(ov){const g=georreferenciaDoOverlay(ov);return g&&g.bounds;}`,
    "malha georreferenciada das imagens de contexto"
  );

  out = replaceOnce(
    out,
`  for(const r of (S.rasters||[])){
    const bounds=r.visible!==false&&r._url?limitesDoOverlay(r.overlay):null;
    if(bounds)out.push({imageUrl:r._url,bounds,opacity:n(r.style?.opacity,.8),name:r.name||'Raster'});
  }
  const I=S.img,boundsImg=I?.visible!==false&&I?.url?limitesDoOverlay(I.overlay):null;
  if(boundsImg)out.push({imageUrl:I.url,bounds:boundsImg,opacity:n(I.opacity,1),name:I.name||'Ortofoto'});`,
`  for(const r of (S.rasters||[])){
    const geo=r.visible!==false&&r._url?georreferenciaDoOverlay(r.overlay):null;
    if(geo)out.push({imageUrl:r._url,bounds:geo.bounds,mesh:geo.mesh,
      opacity:n(r.style?.opacity,.8),name:r.name||'Raster'});
  }
  const I=S.img;
  if(I?.visible!==false&&I?.url){
    const op=Math.max(0,Math.min(1,n(I.overlay?.options?.opacity,n(I.opacity,1))));
    /* I.url é a prévia fixa integral. Nunca usamos os bounds atuais do overlay:
       durante o modo HD ele pode conter apenas a janela visível, o que antes
       esticava a ortofoto inteira para dentro dessa janela. */
    const geo=I._warpWM&&I._llbounds?georreferenciaMercatorDaImagem(I._llbounds,8):
      (Array.isArray(I.b)&&I.b.length===4?{bounds:I.b.slice(),mesh:null}:georreferenciaDoOverlay(I.overlay));
    if(geo)out.push({imageUrl:I.url,bounds:geo.bounds,mesh:geo.mesh,opacity:op,name:I.name||'Ortofoto'});
  }`,
    "ortoimagem alinhada na aba Cava"
  );

  out = replaceOnce(
    out,
    `  const bruta=camadaDoDesenho(d.id),corte=camadaCorteDoDesenho(d.id),
    L=d.cutMdt&&corte?corte:bruta;
  if(!L)return {on:true,crista:true,pe:true,rampa:true};`,
    `  const bruta=camadaDoDesenho(d.id),corte=camadaCorteDoDesenho(d.id),
    L=d.cutMdt&&corte?corte:bruta;
  if(d.cutMdt&&corte?._cava2CutFinalized)return {on:false,crista:false,pe:false,rampa:false};
  if(!L)return {on:true,crista:true,pe:true,rampa:true};`,
    "corte final substitui a cava inteira na aba Cava"
  );

  out = replaceOnce(
    out,
    "function idDesenhoDaCamada(L){return L?._cava2DesignId||L?._cava2CutOf||null;}",
    "function idDesenhoDaCamada(L){return L?._cava2DesignId||L?._cava2CutOf||L?._cava2CutFillOf||null;}",
    "identidade da camada de preenchimento cortado"
  );
  out = replaceOnce(
    out,
    "(x.L._cava2DesignId===id||x.L._cava2CutOf===id))};",
    "(x.L._cava2DesignId===id||x.L._cava2CutOf===id||x.L._cava2CutFillOf===id))};",
    "companheira poligonal no desfazer"
  );
  out = replaceOnce(
    out,
    "if(q._cava2DesignId===id||q._cava2CutOf===id)removeCamadaGerada(q);",
    "if(q._cava2DesignId===id||q._cava2CutOf===id||q._cava2CutFillOf===id)removeCamadaGerada(q);",
    "remoção integral do preenchimento cortado"
  );
  out = replaceOnce(
    out,
    "      const C=camadaCorteDoDesenho(d.id);if(C)removeCamadaGerada(C);mostraBrutaSemCorte(d);",
    "      const C=camadaCorteDoDesenho(d.id),CF=camadaPreenchimentoCorteDoDesenho(d.id);"+
      "if(C)removeCamadaGerada(C);if(CF)removeCamadaGerada(CF);mostraBrutaSemCorte(d);",
    "troca de MDT remove ambos os produtos de corte"
  );

out = replaceOnce(
  out,
  '<input id="cava2BaseZ" type="number" step="0.01" value="0">',
  '<input id="cava2BaseZ" type="number" step="5" value="0">',
  "digitação externa da cota em intervalos de 5 m"
);

out = replaceOnce(
  out,
  "if(P.length)out.push({paths:[P],color:c.st.stroke||c.st.color||c.L.color||'#687786',",
  "if(P.length)out.push({paths:[P],foreground:!!c.L._cava2CutOf,color:c.st.stroke||c.st.color||c.L.color||'#687786',",
  "Interseção marcada para primeiro plano na aba Cava"
);

/* A geometria paramétrica ativa já é desenhada pelo próprio motor e não
   deve voltar como contexto. A Interseção, porém, é uma camada derivada e
   precisa permanecer visível também dentro da aba Cava. */
out = replaceOnce(
  out,
  "    if(temDesign&&(L._cava2DesignId===atual?.id||L._cava2CutOf===atual?.id))continue;",
  "    if(temDesign&&L._cava2DesignId===atual?.id)continue;",
  "Interseção visível no contexto da aba Cava"
);

/* Sobrescreve somente a ponte de publicação do módulo Cava2. O renderizador
   geral do CCMGIS permanece intocado: Mapa 2D, legenda e Layout continuam
   consumindo a mesma simbologia por categoria. */
const cartographicPublication = readAsset("cava-cartographic-publication.js");
out = replaceOnce(
  out,
  "window.CCMGISCava2={open:abre,close:fecha,importSelected:importaSelecionada,",
  cartographicPublication + "\n\nwindow.CCMGISCava2={open:abre,close:fecha,importSelected:importaSelecionada,",
  "publicação cartográfica idêntica à aba Cava"
);
  out = replaceOnce(
    out,
    "_featuresFromDesign:feicoesDoDesign,_reduceContextPath:reduzCaminhoPreservandoForma};",
    "_featuresFromDesign:feicoesDoDesign,_fillFeaturesFromDesign:feicoesPreenchimentoDoDesign," +
      "_intersectionFeaturesFromDesign:feicoesFechadasParaIntersecao," +
      "getFillLayer:id=>camadaPreenchimentoDoDesenho(id)," +
      "getCutFillLayer:id=>camadaPreenchimentoCorteDoDesenho(id),_reduceContextPath:reduzCaminhoPreservandoForma};",
    "API de publicação cartográfica"
  );

if (!out.includes("Cava &amp; Pilha por Strings — v10.6")) throw new Error("Título v10.6 ausente no resultado");
if (!out.includes("t_retorno") || !out.includes("cava_rampa_raio") || !out.includes("pilha_rampa_raio") ||
    !out.includes("function ganchoCorredor") || !out.includes("function insereGanchos")) {
  throw new Error("Recursos exclusivos do motor v10.6 não foram incorporados");
}
if (!out.includes("function designRuntime(d)") || !out.includes("A.estadoAtual()")) {
  throw new Error("Ponte CCMGIS 157 ↔ motor v10.6 incompleta");
}
if (!out.includes("function selecionaMdtTrabalho(id)") ||
    !out.includes("function publicaCorteMdt(d,design,silencioso,forcar,finalizar)")) {
  throw new Error("Fluxo obrigatório do MDT/interseção dinâmica ausente");
}
if (!out.includes("Interseção —") || !out.includes("_cava2IntersectionPreview")) {
  throw new Error("Camada dinâmica Interseção ausente");
}
if (!out.includes("function feicoesFechadasParaIntersecao") ||
    !out.includes("function feicoesPreenchimentoDoDesign") ||
    !out.includes("Limite exterior','#101010','',2.6") ||
    !out.includes("_cava2Role='fill'")) {
  throw new Error("Publicação cartográfica Cava/Mapa 2D/Layout incompleta");
}

fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, out);
console.log(JSON.stringify({
  baseBytes: Buffer.byteLength(base),
  motorBytes: Buffer.byteLength(motor),
  outputBytes: Buffer.byteLength(out),
  targetPath
}, null, 2));
