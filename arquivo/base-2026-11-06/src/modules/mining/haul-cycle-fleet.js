/* Ciclo de caminhão, dimensionamento de frota e custo operacional.

   A rota de transporte é uma string do projeto — a linha que liga o ponto de
   carregamento na cava até a britagem. O comprimento é medido em três
   dimensões: a cota vem dos próprios vértices quando a linha é 3D e, quando
   não é, da superfície escolhida (a linha é densificada na resolução da grade
   antes de ser drapejada, senão uma rampa longa entre dois vértices seria
   medida como se fosse plana).

   O ciclo usa duas velocidades fixas — carregado na ida, vazio na volta —
   conforme decidido para esta versão. A produção entra como meta ANUAL e
   desce até t/h pela jornada, disponibilidade, utilização e eficiência; a
   frota sai desse confronto e o custo é apresentado em R$/t. */
(function(){
'use strict';

/* Versão do módulo, exibida no cabeçalho da janela: com o aplicativo sendo
   distribuído como arquivo único e baixado várias vezes, é isto que diz se a
   cópia aberta é a mais recente. */
const VERSAO='v3 · catálogo e ciclo de bibliografia';

const PADRAO={
  metaAno:1200000, dias:330, turnos:3, hTurno:8, df:85, uf:80, efic:83,
  payload:40, vCarr:25, vVazio:35, tPos:0.8, tDesc:1.2, tFila:0,
  cacamba:5, ff:0.9, densSolta:1.8, cicloCacamba:30, nCarreg:1,
  rhCaminhao:450, rhCarregadeira:600
};

/* Catálogos de referência.

   As cargas úteis e as caçambas vêm das fichas dos fabricantes; servem para
   preencher os campos rapidamente e continuam editáveis à mão, porque a
   configuração real (carroceria, caçamba, altitude, material) muda o número.

   Duas ressalvas que valem registro: (a) nos caminhões RODOVIÁRIOS a carga
   útil não é uma constante do modelo — depende do PBT legal da configuração
   de eixos menos a tara da carroceria, então essas linhas trazem a faixa
   usual e não um valor de catálogo; (b) NENHUM fabricante publica tempo de
   ciclo de caçamba de escavadeira, e o ciclo hidráulico que as pás publicam
   (10–14 s) não é o ciclo de carregamento. Por isso o catálogo preenche só a
   caçamba: o ciclo continua sendo parâmetro do usuário. */
const CAMINHOES=[
  {g:'Fora-de-estrada rígido', m:'Caterpillar', mod:'770', t:38.2},
  {g:'Fora-de-estrada rígido', m:'Caterpillar', mod:'772', t:46.3},
  {g:'Fora-de-estrada rígido', m:'Caterpillar', mod:'773', t:56},
  {g:'Fora-de-estrada rígido', m:'Caterpillar', mod:'775', t:64},
  {g:'Fora-de-estrada rígido', m:'Caterpillar', mod:'777', t:91.7},
  {g:'Fora-de-estrada rígido', m:'Caterpillar', mod:'785', t:145},
  {g:'Fora-de-estrada rígido', m:'Caterpillar', mod:'789', t:193},
  {g:'Fora-de-estrada rígido', m:'Caterpillar', mod:'793', t:240},
  {g:'Fora-de-estrada rígido', m:'Komatsu', mod:'HD465-10', t:55.5},
  {g:'Fora-de-estrada rígido', m:'Komatsu', mod:'HD605-10', t:64},
  {g:'Fora-de-estrada rígido', m:'Komatsu', mod:'HD785-8', t:92.2},
  {g:'Fora-de-estrada rígido', m:'Komatsu', mod:'HD1500-8', t:142},
  {g:'Fora-de-estrada rígido', m:'Komatsu', mod:'830E-AC (elétrico)', t:222},
  {g:'Fora-de-estrada rígido', m:'Komatsu', mod:'930E-5 (elétrico)', t:290},
  {g:'Articulado', m:'Caterpillar', mod:'730', t:28},
  {g:'Articulado', m:'Caterpillar', mod:'745', t:41},
  {g:'Articulado', m:'Volvo', mod:'A40G', t:39},
  {g:'Articulado', m:'Volvo', mod:'A45G', t:41},
  {g:'Articulado', m:'Volvo', mod:'A60H', t:55},
  {g:'Rodoviário — dentro da mina', m:'Scania', mod:'560 G 10x4 XT Heavy Tipper', t:50},
  {g:'Rodoviário — dentro da mina', m:'Iveco', mod:'Trakker 740T 6x4', t:35.5},
  {g:'Rodoviário — dentro da mina', m:'Volvo', mod:'FMX MAX 8x4 (PBT 58 t)', t:42, faixa:'40–44'},
  {g:'Rodoviário — dentro da mina', m:'Volvo', mod:'FMX MAX 6x4 (PBT 48 t)', t:34.5, faixa:'33–36'},
  {g:'Rodoviário — dentro da mina', m:'Mercedes-Benz', mod:'Arocs 5851 K 8x4 (PBT 58 t)', t:41.5, faixa:'40–43'},
  {g:'Rodoviário — dentro da mina', m:'Mercedes-Benz', mod:'Arocs 4151 K 6x4 (PBT 41 t)', t:27.5, faixa:'26–29'},
  {g:'Rodoviário — limite legal (CONTRAN)', m:'—', mod:'Toco 4x2 · PBT 16 t', t:7.5, faixa:'6–9'},
  {g:'Rodoviário — limite legal (CONTRAN)', m:'—', mod:'Truck/traçado 6x4 · PBT 23 t', t:13.5, faixa:'12–15'},
  {g:'Rodoviário — limite legal (CONTRAN)', m:'—', mod:'8x4 · PBT 31,5 t', t:19.5, faixa:'18–21'},
  {g:'Rodoviário — limite legal (CONTRAN)', m:'—', mod:'Bitrem 7 eixos · PBTC 57 t', t:37.5, faixa:'35–40'},
  {g:'Rodoviário — limite legal (CONTRAN)', m:'—', mod:'Rodotrem 9 eixos · PBTC 74 t', t:50.5, faixa:'48–53'}
];

/* Ciclo básico de carregamento, da bibliografia.

   ESCAVADEIRA HIDRÁULICA — Nunnally, "Construction Methods and Management",
   7ª ed., Tabela 3-3 (ciclos/hora a 100% de eficiência, convertidos para
   segundos), com os mesmos valores arredondados em Sağlam & Bettemir (JCEMI
   2018, Tabela 5). A classe é dada pela caçamba, e o ponto neutro da tabela é
   70% da profundidade máxima com giro de 90°.

   PÁ CARREGADEIRA — Nunnally, Tabela 4-6, ciclo básico do ciclo em V
   (carregar, despejar, quatro reversões e deslocamento mínimo). O Caterpillar
   Performance Handbook publica a mesma grandeza por classe de máquina —
   0,45–0,50 min nas menores até 0,60–0,70 min nas 992/994 — e concorda com o
   material médio de Nunnally.

   RESSALVA REGISTRADA: para escavadeira, o ciclo por modelo do Cat PHB é bem
   menor que o de Nunnally (o 336D em argila dura sai 16,2 s contra 36 s da
   classe equivalente), porque o manual do fabricante supõe condições acima da
   média e a profundidade ótima do modelo. Aqui ficou a referência
   bibliográfica, que é a conservadora; quem quiser a do fabricante digita o
   número no campo. */
const CICLO_BIB={
  escavadeira:{ // por caçamba (m³): [mole, médio, duro]
    faixas:[{ate:0.76,s:[15,18,23]},{ate:1.72,s:[18,23,28]},{ate:Infinity,s:[24,30,36]}],
    fonte:'Nunnally 7ª ed., Tab. 3-3 · Sağlam & Bettemir 2018, Tab. 5'
  },
  pa:{ s:[21,30,39], fonte:'Nunnally 7ª ed., Tab. 4-6 (ciclo em V)' }
};
const MATERIAIS=[
  {id:'mole', nome:'Solto / mole (areia, pedregulho)'},
  {id:'medio', nome:'Médio (terra comum, argila mole)'},
  {id:'duro', nome:'Duro (argila rija, rocha detonada)'}
];

function cicloBibliografico(x,material){
  const i=Math.max(0,MATERIAIS.findIndex(m=>m.id===material));
  if(!x)return null;
  if(x.g==='Pá carregadeira')return {s:CICLO_BIB.pa.s[i],fonte:CICLO_BIB.pa.fonte};
  const f=CICLO_BIB.escavadeira.faixas.find(f=>x.c<=f.ate);
  return f?{s:f.s[i],fonte:CICLO_BIB.escavadeira.fonte}:null;
}

const CARREGADEIRAS=[
  {g:'Escavadeira hidráulica', m:'Caterpillar', mod:'320', c:0.9, faixa:'0,53–1,38'},
  {g:'Escavadeira hidráulica', m:'Caterpillar', mod:'336', c:1.8, faixa:'0,73–2,91'},
  {g:'Escavadeira hidráulica', m:'Caterpillar', mod:'349', c:2.7, faixa:'1,87–3,60'},
  {g:'Escavadeira hidráulica', m:'Caterpillar', mod:'374', c:3.9, faixa:'3,30–4,60'},
  {g:'Escavadeira hidráulica', m:'Caterpillar', mod:'390', c:4.3, faixa:'2,20–6,50'},
  {g:'Escavadeira hidráulica', m:'Komatsu', mod:'PC210-11', c:1.68},
  {g:'Escavadeira hidráulica', m:'Komatsu', mod:'PC300-8M0', c:1.2, faixa:'0,52–1,80'},
  {g:'Escavadeira hidráulica', m:'Komatsu', mod:'PC450-8', c:3.5},
  {g:'Escavadeira hidráulica', m:'Komatsu', mod:'PC800-8', c:4.12},
  {g:'Escavadeira hidráulica', m:'Komatsu', mod:'PC1250-8', c:5, faixa:'3,4–6,7'},
  {g:'Escavadeira hidráulica', m:'Volvo', mod:'EC220', c:1.25},
  {g:'Escavadeira hidráulica', m:'Volvo', mod:'EC380E', c:1.7, faixa:'0,83–2,53'},
  {g:'Escavadeira hidráulica', m:'Volvo', mod:'EC480E', c:2.4, faixa:'1,55–3,30'},
  {g:'Escavadeira hidráulica', m:'Volvo', mod:'EC750E', c:4.2, faixa:'3,30–5,16'},
  {g:'Escavadeira hidráulica', m:'Sany', mod:'SY215C', c:0.93},
  {g:'Escavadeira hidráulica', m:'Sany', mod:'SY365H', c:1.6},
  {g:'Escavadeira hidráulica', m:'Sany', mod:'SY500H', c:2.38},
  {g:'Escavadeira hidráulica', m:'Hyundai', mod:'HX220L', c:1.34},
  {g:'Escavadeira hidráulica', m:'Hyundai', mod:'R380LC-9', c:1.68},
  {g:'Pá carregadeira', m:'Caterpillar', mod:'966', c:4.2, faixa:'3,8–7,1'},
  {g:'Pá carregadeira', m:'Caterpillar', mod:'980', c:5.4},
  {g:'Pá carregadeira', m:'Caterpillar', mod:'990', c:9.2, faixa:'8,6–10,0'},
  {g:'Pá carregadeira', m:'Komatsu', mod:'WA380-8', c:3.5, faixa:'3,2–6,5'},
  {g:'Pá carregadeira', m:'Komatsu', mod:'WA470-8', c:4.5, faixa:'4,1–6,0'},
  {g:'Pá carregadeira', m:'Komatsu', mod:'WA500-8', c:5.4, faixa:'4,5–7,2'},
  {g:'Pá carregadeira', m:'Komatsu', mod:'WA600-8', c:6.9, faixa:'6,4–7,8'},
  {g:'Pá carregadeira', m:'Volvo', mod:'L120H', c:3.6, faixa:'3,0–9,5'},
  {g:'Pá carregadeira', m:'Volvo', mod:'L150H', c:4.4, faixa:'3,5–6,8'},
  {g:'Pá carregadeira', m:'Volvo', mod:'L180H', c:5.2, faixa:'4,2–7,8'},
  {g:'Pá carregadeira', m:'Volvo', mod:'L250H', c:6.5, faixa:'5,5–10,2'},
  {g:'Pá carregadeira', m:'XCMG', mod:'LW500BR', c:3},
  {g:'Pá carregadeira', m:'XCMG', mod:'LW900KN', c:5}
];

const HCF={rota:null, mdtId:'', ultimo:null};

/* ————————————————————————————— utilidades ————————————————————————————— */

function n(v,padrao){v=Number(String(v).replace(',','.'));return Number.isFinite(v)?v:(padrao||0);}
function fmt(v,dec){
  if(v==null||!Number.isFinite(v))return '—';
  return Number(v).toLocaleString('pt-BR',{minimumFractionDigits:dec,maximumFractionDigits:dec});
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function el(id){return document.getElementById(id);}
function val(id,padrao){const e=el(id);return e?n(e.value,padrao):padrao;}
function aviso(msg){ if(typeof toast==='function'){try{toast(msg);return;}catch(e){}} }

/* Rasters que servem de superfície: mesma regra usada pelo restante do app —
   grade com células válidas e mais de uma linha/coluna. */
function superficiesValidas(){
  if(typeof S==='undefined')return [];
  return (S.rasters||[]).filter(R=>{
    const g=R&&R.d;
    return !!(g&&g.z&&Number.isFinite(+g.nc)&&+g.nc>1&&Number.isFinite(+g.nr)&&+g.nr>1&&
      Number.isFinite(+g.cs)&&+g.cs>0);
  });
}

/* Camadas de linha com pelo menos uma feição — as candidatas a rota. */
function camadasDeLinha(){
  if(typeof S==='undefined')return [];
  return (S.layers||[]).filter(L=>L&&L.gtype==='line'&&(L.features||[]).length);
}

function anelDaFeicao(f){
  if(!f||!f.geom||!f.geom.length)return null;
  /* Feição multiparte guarda uma lista de partes; a rota usa a mais longa,
     porque uma estrada partida em trechos ainda é um caminho só. */
  const partes=(f.multi&&Array.isArray(f.geom[0])&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
  let melhor=null,maior=-1;
  partes.forEach((r,i)=>{
    if(!Array.isArray(r)||r.length<2)return;
    let c=0;for(let k=0;k<r.length-1;k++)c+=Math.hypot(r[k+1][0]-r[k][0],r[k+1][1]-r[k][1]);
    if(c>maior){maior=c;melhor={pts:r,parte:i};}
  });
  return melhor;
}

function zsDaFeicao(f,parte){
  if(!f||!f.zg)return null;
  const z=f.zg;
  if(Array.isArray(z[0]))return Array.isArray(z[parte])?z[parte]:null;
  return z;
}

/* Amostragem da superfície com a conversão de CRS que o app já usa: a linha
   está no CRS de trabalho e a grade pode estar em outro. */
function amostradorZ(R){
  if(!R||typeof sampleZbil!=='function')return null;
  const g=R.d,origem=(typeof S!=='undefined'&&S.workCRS)||null,destino=R.crs||g.crs||origem;
  return (x,y)=>{
    let px=+x,py=+y;
    if(!Number.isFinite(px)||!Number.isFinite(py))return NaN;
    try{
      if(origem&&destino&&String(origem)!==String(destino)&&
         typeof toWGS==='function'&&typeof fromWGS==='function'){
        const w=toWGS(origem,px,py),q=fromWGS(destino,w[0],w[1]);px=q[0];py=q[1];
      }
      return sampleZbil(g,px,py);
    }catch(e){return NaN;}
  };
}

/* ————————————————————————— geometria da rota ————————————————————————— */

/* Mede a rota em 3D. Devolve comprimento em planta, comprimento inclinado,
   subida e descida acumuladas no sentido cava→britagem, e de onde veio a
   cota. Sem cota utilizável, o 3D é igual ao 2D e isso é dito na tela. */
function metricaRota(L,idx,R){
  const f=(L&&L.features&&L.features[idx])||null;
  const parte=anelDaFeicao(f);
  if(!parte)return {erro:'A feição escolhida não tem uma linha com dois vértices ou mais.'};
  const pts=parte.pts;

  let zs=zsDaFeicao(f,parte.parte);
  let fonte='geometria 3D da linha';
  const temZ=Array.isArray(zs)&&zs.length===pts.length&&zs.every(v=>Number.isFinite(+v));

  let P;
  if(temZ){
    P=pts.map((p,i)=>[p[0],p[1],+zs[i]]);
  }else{
    const amostra=amostradorZ(R);
    if(!amostra)return {erro:'A linha não é 3D e nenhuma superfície válida foi escolhida para tirar a cota.'};
    /* Densificação antes de drapejar: o passo é a célula da grade, limitado a
       2000 pontos para não pesar em rota muito longa. */
    let passo=Math.max(+R.d.cs||1,1);
    let bruto=0;
    for(let i=0;i<pts.length-1;i++)bruto+=Math.hypot(pts[i+1][0]-pts[i][0],pts[i+1][1]-pts[i][1]);
    if(bruto/passo>2000)passo=bruto/2000;
    P=[];
    for(let i=0;i<pts.length-1;i++){
      const a=pts[i],b=pts[i+1],d=Math.hypot(b[0]-a[0],b[1]-a[1]);
      const k=Math.max(1,Math.ceil(d/passo));
      for(let j=0;j<k;j++){
        const t=j/k;P.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);
      }
    }
    P.push([pts[pts.length-1][0],pts[pts.length-1][1]]);
    P=P.map(p=>[p[0],p[1],amostra(p[0],p[1])]);
    const validos=P.filter(p=>Number.isFinite(p[2])).length;
    if(validos<2)return {erro:'A rota está fora da superfície escolhida — nenhuma cota foi obtida.'};
    if(validos<P.length)fonte='superfície “'+(R.name||R.id)+'” (parte da rota ficou fora da grade)';
    else fonte='superfície “'+(R.name||R.id)+'”';
  }

  let c2=0,c3=0,sobe=0,desce=0;
  for(let i=0;i<P.length-1;i++){
    const dx=P[i+1][0]-P[i][0],dy=P[i+1][1]-P[i][1];
    const dh=Math.hypot(dx,dy);
    c2+=dh;
    const za=P[i][2],zb=P[i+1][2];
    if(Number.isFinite(za)&&Number.isFinite(zb)){
      const dz=zb-za;
      c3+=Math.hypot(dh,dz);
      if(dz>0)sobe+=dz;else desce+=-dz;
    }else{
      c3+=dh;
    }
  }
  const zIni=P.find(p=>Number.isFinite(p[2])),zFim=[...P].reverse().find(p=>Number.isFinite(p[2]));
  const z0=zIni?zIni[2]:NaN,z1=zFim?zFim[2]:NaN;
  return {
    ok:true, verts:pts.length, amostras:P.length, comp2D:c2, comp3D:c3,
    sobe, desce, z0, z1, desnivel:(Number.isFinite(z1)&&Number.isFinite(z0))?(z1-z0):NaN,
    declMedia:c2>0?((Number.isFinite(z1)&&Number.isFinite(z0))?(z1-z0)/c2*100:NaN):NaN,
    fonte, nome:(f.props&&(f.props.NOME||f.props.nome))||('feição '+(idx+1))
  };
}

/* ————————————————————————————— o cálculo ————————————————————————————— */

function calcula(rota,p){
  const r={};

  /* Jornada: da meta anual até a hora efetiva de operação. */
  r.hCalendario=p.dias*p.turnos*p.hTurno;
  r.fatorEfic=p.efic/100;                      // eficiência operacional, em fração
  r.minEfetivos=p.efic/100*60;                 // equivalência em minutos por hora
  r.hEfetivas=r.hCalendario*(p.df/100)*(p.uf/100)*r.fatorEfic;
  r.thRequerida=r.hEfetivas>0?p.metaAno/r.hEfetivas:NaN;

  /* Carregamento: quantos passes a caçamba precisa para completar a caçamba
     do caminhão, e quanto tempo isso leva. */
  r.cargaPasse=p.cacamba*p.ff*p.densSolta;
  r.passes=r.cargaPasse>0?Math.ceil(p.payload/r.cargaPasse):NaN;
  r.cargaReal=Number.isFinite(r.passes)?Math.min(p.payload,r.passes*r.cargaPasse):p.payload;
  r.tCarga=Number.isFinite(r.passes)?r.passes*p.cicloCacamba/60:NaN;

  /* Transporte: as duas velocidades fixas sobre o comprimento inclinado. */
  const km=(rota&&Number.isFinite(rota.comp3D))?rota.comp3D/1000:NaN;
  r.km=km;
  r.tIda=(p.vCarr>0)?km/p.vCarr*60:NaN;
  r.tVolta=(p.vVazio>0)?km/p.vVazio*60:NaN;

  r.ciclo=[r.tCarga,r.tIda,p.tDesc,r.tVolta,p.tPos,p.tFila]
    .reduce((a,b)=>a+(Number.isFinite(b)?b:0),0);

  /* Produtividade e frota. */
  r.viagensHora=r.ciclo>0?60/r.ciclo:NaN;
  r.thCaminhao=r.viagensHora*p.payload;
  r.nExato=r.thCaminhao>0?r.thRequerida/r.thCaminhao:NaN;
  r.nCaminhoes=Number.isFinite(r.nExato)?Math.max(1,Math.ceil(r.nExato)):NaN;

  /* Capacidade da frente de carga: uma carregadeira só enche um caminhão por
     vez, então o teto dela é a carga útil dividida pelo tempo de carga. */
  r.thCarregadeira=r.tCarga>0?60/r.tCarga*p.payload:NaN;
  r.thFrenteCarga=r.thCarregadeira*p.nCarreg;

  /* Fator de casamento: acima de 1 sobra caminhão (fila na carregadeira);
     abaixo de 1 sobra carregadeira (ela espera caminhão). */
  r.matchFactor=(r.ciclo>0&&Number.isFinite(r.tCarga)&&p.nCarreg>0)
    ? (r.nCaminhoes*r.tCarga)/(p.nCarreg*r.ciclo) : NaN;

  /* Produção realmente atingida: o menor entre o que a frota transporta e o
     que a frente de carga consegue carregar. */
  r.thFrota=r.nCaminhoes*r.thCaminhao;
  r.thEfetiva=Math.min(r.thFrota,r.thFrenteCarga);
  r.gargalo=(r.thFrota<=r.thFrenteCarga)?'transporte':'carregamento';
  r.tAno=r.thEfetiva*r.hEfetivas;

  /* Custo. */
  r.custoHora=r.nCaminhoes*p.rhCaminhao+p.nCarreg*p.rhCarregadeira;
  r.custoT=r.thEfetiva>0?r.custoHora/r.thEfetiva:NaN;
  r.custoTkm=(Number.isFinite(r.custoT)&&km>0)?r.custoT/km:NaN;
  r.custoAno=r.custoT*p.metaAno;

  return r;
}

/* ————————————————————————————— interface ————————————————————————————— */

function campo(id,rot,valor,unid,dica){
  return '<label class="hcf-campo"'+(dica?' title="'+esc(dica)+'"':'')+'>'+
    '<span>'+esc(rot)+'</span>'+
    '<span class="hcf-inp"><input id="'+id+'" type="number" step="any" value="'+valor+'">'+
    (unid?'<i>'+esc(unid)+'</i>':'')+'</span></label>';
}

function bloco(titulo,html){
  return '<section class="hcf-bloco"><h4>'+esc(titulo)+'</h4>'+html+'</section>';
}

function montaJanela(){
  if(el('hcfModal'))return el('hcfModal');
  const d=document.createElement('div');
  d.id='hcfModal';d.className='hcf-bg';
  d.innerHTML=
    '<div class="hcf-jan" role="dialog" aria-label="Ciclo de transporte, frota e custo">'+
      '<header class="hcf-top">'+
        '<b>Ciclo de transporte · frota · custo</b>'+
        '<span class="hcf-sub">A rota é uma string do projeto, medida em 3D · '+esc(VERSAO)+'</span>'+
        '<span class="hcf-esp"></span>'+
        '<button class="hcf-x" id="hcfFechar" title="Fechar">✕</button>'+
      '</header>'+
      '<div class="hcf-corpo">'+
        '<div class="hcf-col">'+
          bloco('Rota de transporte',
            '<label class="hcf-campo hcf-largo"><span>Camada da rota</span>'+
              '<select id="hcfCamada"></select></label>'+
            '<label class="hcf-campo hcf-largo"><span>Feição (cava → britagem)</span>'+
              '<select id="hcfFeicao"></select></label>'+
            '<label class="hcf-campo hcf-largo" title="Usada só quando a linha não tem cota própria">'+
              '<span>Superfície para a cota</span><select id="hcfMdt"></select></label>'+
            '<div class="hcf-linha-bt">'+
              '<button class="hcf-bt" id="hcfUsarSel">Usar a feição selecionada</button>'+
              '<button class="hcf-bt" id="hcfMedir">↻ Medir rota</button>'+
            '</div>'+
            '<div class="hcf-rota" id="hcfRota">Nenhuma rota medida.</div>')+
          bloco('Produção',
            campo('hcfMetaAno','Meta de produção',PADRAO.metaAno,'t/ano')+
            campo('hcfDias','Dias operacionais',PADRAO.dias,'d/ano')+
            campo('hcfTurnos','Turnos por dia',PADRAO.turnos,'un')+
            campo('hcfHTurno','Horas por turno',PADRAO.hTurno,'h')+
            campo('hcfDF','Disponibilidade física',PADRAO.df,'%')+
            campo('hcfUF','Utilização',PADRAO.uf,'%')+
            campo('hcfEfic','Eficiência operacional',PADRAO.efic,'%',
              'Fração da hora efetivamente trabalhada — 83% equivale a 50 min/h'))+
        '</div>'+
        '<div class="hcf-col">'+
          bloco('Caminhão',
            '<label class="hcf-campo hcf-largo"><span>Modelo (catálogo)</span>'+
              '<select id="hcfModeloCam"></select></label>'+
            campo('hcfPayload','Carga útil',PADRAO.payload,'t')+
            campo('hcfVCarr','Velocidade carregado',PADRAO.vCarr,'km/h')+
            campo('hcfVVazio','Velocidade vazio',PADRAO.vVazio,'km/h')+
            campo('hcfTPos','Manobra e posicionamento',PADRAO.tPos,'min')+
            campo('hcfTDesc','Basculamento e manobra',PADRAO.tDesc,'min')+
            campo('hcfTFila','Espera em fila',PADRAO.tFila,'min'))+
          bloco('Carregamento',
            '<label class="hcf-campo hcf-largo"><span>Modelo (catálogo)</span>'+
              '<select id="hcfModeloCar"></select></label>'+
            '<label class="hcf-campo hcf-largo"><span>Material a carregar</span>'+
              '<select id="hcfMaterial">'+MATERIAIS.map(m=>
                '<option value="'+m.id+'"'+(m.id==='medio'?' selected':'')+'>'+esc(m.nome)+'</option>').join('')+
              '</select></label>'+
            campo('hcfCacamba','Caçamba da carregadeira',PADRAO.cacamba,'m³')+
            campo('hcfFF','Fator de enchimento',PADRAO.ff,'—')+
            campo('hcfDens','Densidade solta',PADRAO.densSolta,'t/m³')+
            campo('hcfCicloCacamba','Ciclo da caçamba',PADRAO.cicloCacamba,'s',
              'Ciclo básico de carregamento, preenchido pela bibliografia ao escolher o '+
              'modelo e o material (Nunnally 7ª ed., Tab. 3-3 e 4-6). Não confundir com o '+
              'ciclo hidráulico da ficha do fabricante, que é bem menor. O manual da '+
              'Caterpillar traz ciclos menores para escavadeira, por supor condições acima '+
              'da média — se for o seu caso, digite o valor à mão.')+
            campo('hcfNCarreg','Carregadeiras',PADRAO.nCarreg,'un'))+
          bloco('Custo horário',
            campo('hcfRhCaminhao','Caminhão',PADRAO.rhCaminhao,'R$/h')+
            campo('hcfRhCarregadeira','Carregadeira',PADRAO.rhCarregadeira,'R$/h'))+
        '</div>'+
        '<div class="hcf-col hcf-res">'+
          '<section class="hcf-bloco"><h4>Resultados</h4><div id="hcfSaida">'+
            '<p class="hcf-vazio">Escolha a rota e toque em <b>Calcular</b>.</p></div></section>'+
        '</div>'+
      '</div>'+
      '<footer class="hcf-rodape">'+
        '<span class="hcf-nota" id="hcfNota"></span>'+
        '<span class="hcf-esp"></span>'+
        '<button class="hcf-bt" id="hcfCopiar">Copiar resultados</button>'+
        '<button class="hcf-bt hcf-primaria" id="hcfCalcular">Calcular</button>'+
      '</footer>'+
    '</div>';
  document.body.appendChild(d);

  el('hcfFechar').onclick=fecha;
  d.addEventListener('mousedown',e=>{ if(e.target===d)fecha(); });
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&d.style.display==='flex')fecha(); });
  el('hcfCamada').onchange=()=>{populaFeicoes();};
  montaCatalogos();
  el('hcfUsarSel').onclick=usaSelecionada;
  el('hcfMedir').onclick=()=>{mede(true);};
  el('hcfCalcular').onclick=roda;
  el('hcfCopiar').onclick=copia;
  return d;
}

function fecha(){const d=el('hcfModal');if(d)d.style.display='none';}

/* Monta os dois catálogos e liga cada um ao campo que ele preenche. Escolher
   um modelo escreve o valor; mexer no campo à mão devolve o seletor para
   “personalizado”, deixando claro que o número não é mais o de catálogo. */
function opcoesCatalogo(lista,rotulo){
  let html='<option value="">— personalizado —</option>',grupo=null;
  lista.forEach((x,i)=>{
    if(x.g!==grupo){ if(grupo!==null)html+='</optgroup>'; html+='<optgroup label="'+esc(x.g)+'">'; grupo=x.g; }
    html+='<option value="'+i+'">'+esc((x.m&&x.m!=='—'?x.m+' ':'')+x.mod)+' · '+esc(rotulo(x))+'</option>';
  });
  return html+(grupo!==null?'</optgroup>':'');
}

function montaCatalogos(){
  const sc=el('hcfModeloCam'),sl=el('hcfModeloCar');
  if(sc){
    sc.innerHTML=opcoesCatalogo(CAMINHOES,x=>(x.faixa?x.faixa:fmt(x.t,1).replace(',0',''))+' t');
    sc.onchange=()=>{
      const x=CAMINHOES[parseInt(sc.value,10)];
      if(x&&el('hcfPayload')){
        el('hcfPayload').value=x.t;
        aviso(x.mod+' · carga útil '+(x.faixa?x.faixa+' t (faixa típica; adotado '+fmt(x.t,1)+' t)':fmt(x.t,1)+' t'));
      }
    };
  }
  if(sl){
    sl.innerHTML=opcoesCatalogo(CARREGADEIRAS,x=>(x.faixa?x.faixa:fmt(x.c,2))+' m³');
    sl.onchange=()=>{
      const x=CARREGADEIRAS[parseInt(sl.value,10)];
      if(x&&el('hcfCacamba')){
        el('hcfCacamba').value=x.c;
        const cb=aplicaCicloBib();
        aviso(x.mod+' · caçamba '+(x.faixa?x.faixa+' m³ (faixa; adotado '+fmt(x.c,2)+' m³)':fmt(x.c,2)+' m³')+
          (cb?' · ciclo '+cb.s+' s ('+cb.fonte+')':''));
      }
    };
    const mat=el('hcfMaterial');
    if(mat)mat.onchange=()=>{
      const cb=aplicaCicloBib();
      if(cb)aviso('Ciclo básico '+cb.s+' s · '+cb.fonte);
    };
  }
  const solta=(campoId,selId)=>{
    const c=el(campoId),s=el(selId);
    if(c&&s)c.addEventListener('input',()=>{s.value='';});
  };
  solta('hcfPayload','hcfModeloCam');
  solta('hcfCacamba','hcfModeloCar');
}

/* Escreve no campo do ciclo o valor de bibliografia do modelo escolhido com o
   material corrente. Sem modelo escolhido nada é tocado — o número que o
   usuário digitou continua valendo. */
function aplicaCicloBib(){
  const sl=el('hcfModeloCar'),mat=el('hcfMaterial'),alvo=el('hcfCicloCacamba');
  if(!sl||!alvo||sl.value==='')return null;
  const cb=cicloBibliografico(CARREGADEIRAS[parseInt(sl.value,10)],mat?mat.value:'medio');
  if(cb)alvo.value=cb.s;
  return cb;
}

function populaCamadas(){
  const s=el('hcfCamada');if(!s)return;
  const cams=camadasDeLinha();
  s.innerHTML=cams.length
    ? cams.map(L=>'<option value="'+esc(L.id)+'">'+esc(L.name||L.id)+' ('+(L.features||[]).length+')</option>').join('')
    : '<option value="">— nenhuma camada de linha no projeto —</option>';
  populaFeicoes();
}

function camadaEscolhida(){
  const id=el('hcfCamada')?el('hcfCamada').value:'';
  return (typeof S!=='undefined'?(S.layers||[]):[]).find(L=>String(L.id)===String(id))||null;
}

function populaFeicoes(){
  const s=el('hcfFeicao');if(!s)return;
  const L=camadaEscolhida();
  if(!L){s.innerHTML='<option value="">—</option>';return;}
  s.innerHTML=(L.features||[]).map((f,i)=>{
    const nome=(f.props&&(f.props.NOME||f.props.nome))||('feição '+(i+1));
    return '<option value="'+i+'">'+esc(nome)+'</option>';
  }).join('');
}

function populaMdts(){
  const s=el('hcfMdt');if(!s)return;
  const rs=superficiesValidas();
  s.innerHTML='<option value="">— nenhuma —</option>'+
    rs.map(R=>'<option value="'+esc(R.id)+'">'+esc(R.name||R.id)+'</option>').join('');
  if(HCF.mdtId&&rs.some(R=>String(R.id)===String(HCF.mdtId)))s.value=HCF.mdtId;
  else if(rs.length)s.value=String(rs[0].id);
  s.onchange=()=>{HCF.mdtId=s.value;};
  HCF.mdtId=s.value;
}

function mdtEscolhido(){
  const id=el('hcfMdt')?el('hcfMdt').value:'';
  return superficiesValidas().find(R=>String(R.id)===String(id))||null;
}

function usaSelecionada(){
  if(typeof S==='undefined'||!S.selFeat){aviso('Nenhuma feição selecionada no mapa.');return;}
  const L=(S.layers||[]).find(x=>String(x.id)===String(S.selFeat.layerId));
  if(!L||L.gtype!=='line'){aviso('A feição selecionada não é uma linha.');return;}
  populaCamadas();
  el('hcfCamada').value=String(L.id);
  populaFeicoes();
  el('hcfFeicao').value=String(S.selFeat.idx);
  mede(true);
}

function mede(mostra){
  const L=camadaEscolhida();
  const idx=el('hcfFeicao')?parseInt(el('hcfFeicao').value,10):-1;
  const alvo=el('hcfRota');
  if(!L||!(idx>=0)){if(alvo)alvo.textContent='Escolha uma camada de linha e a feição da rota.';return null;}
  const m=metricaRota(L,idx,mdtEscolhido());
  HCF.rota=m.ok?m:null;
  if(alvo){
    alvo.innerHTML=m.ok
      ? '<div><b>'+fmt(m.comp3D,1)+' m</b> em 3D · '+fmt(m.comp2D,1)+' m em planta</div>'+
        '<div>Cotas '+fmt(m.z0,2)+' → '+fmt(m.z1,2)+' m · desnível '+fmt(m.desnivel,2)+' m</div>'+
        '<div>Subida acumulada '+fmt(m.sobe,1)+' m · descida '+fmt(m.desce,1)+' m · rampa média '+fmt(m.declMedia,2)+'%</div>'+
        '<div class="hcf-fonte">Cota: '+esc(m.fonte)+' · '+m.verts+' vértices · '+m.amostras+' amostras</div>'
      : '<span class="hcf-erro">'+esc(m.erro)+'</span>';
  }
  if(mostra&&m.ok)aviso('Rota medida: '+fmt(m.comp3D,1)+' m em 3D.');
  return HCF.rota;
}

function parametros(){
  return {
    metaAno:val('hcfMetaAno',PADRAO.metaAno), dias:val('hcfDias',PADRAO.dias),
    turnos:val('hcfTurnos',PADRAO.turnos), hTurno:val('hcfHTurno',PADRAO.hTurno),
    df:val('hcfDF',PADRAO.df), uf:val('hcfUF',PADRAO.uf), efic:val('hcfEfic',PADRAO.efic),
    payload:val('hcfPayload',PADRAO.payload), vCarr:val('hcfVCarr',PADRAO.vCarr),
    vVazio:val('hcfVVazio',PADRAO.vVazio), tPos:val('hcfTPos',PADRAO.tPos),
    tDesc:val('hcfTDesc',PADRAO.tDesc), tFila:val('hcfTFila',PADRAO.tFila),
    cacamba:val('hcfCacamba',PADRAO.cacamba), ff:val('hcfFF',PADRAO.ff),
    densSolta:val('hcfDens',PADRAO.densSolta), cicloCacamba:val('hcfCicloCacamba',PADRAO.cicloCacamba),
    nCarreg:Math.max(1,Math.round(val('hcfNCarreg',PADRAO.nCarreg))),
    rhCaminhao:val('hcfRhCaminhao',PADRAO.rhCaminhao),
    rhCarregadeira:val('hcfRhCarregadeira',PADRAO.rhCarregadeira)
  };
}

function linha(k,v,cls){
  return '<div class="hcf-l'+(cls?' '+cls:'')+'"><span>'+esc(k)+'</span><b>'+v+'</b></div>';
}

function roda(){
  const rota=HCF.rota||mede(false);
  const saida=el('hcfSaida');
  if(!rota){if(saida)saida.innerHTML='<p class="hcf-erro">Meça a rota antes de calcular.</p>';return;}
  const p=parametros(),r=calcula(rota,p);
  HCF.ultimo={rota,p,r};

  const alerta=[];
  if(r.matchFactor>1.15)alerta.push('Sobram caminhões: a frota espera na carregadeira (fator '+fmt(r.matchFactor,2)+').');
  if(r.matchFactor<0.85)alerta.push('Sobra carregadeira: ela fica ociosa esperando caminhão (fator '+fmt(r.matchFactor,2)+').');
  if(r.thEfetiva<r.thRequerida*0.999)
    alerta.push('A meta não é alcançada: falta '+fmt(r.thRequerida-r.thEfetiva,1)+' t/h — o gargalo é o '+r.gargalo+'.');
  if(Number.isFinite(r.cargaReal)&&r.cargaReal<p.payload*0.95)
    alerta.push('O último passe não completa a carga: '+fmt(r.cargaReal,1)+' t contra '+fmt(p.payload,1)+' t de capacidade.');

  saida.innerHTML=
    '<div class="hcf-grp">Tempo de ciclo</div>'+
    linha('Carregamento ('+r.passes+' passes)',fmt(r.tCarga,2)+' min')+
    linha('Ida carregado',fmt(r.tIda,2)+' min')+
    linha('Basculamento e manobra',fmt(p.tDesc,2)+' min')+
    linha('Volta vazio',fmt(r.tVolta,2)+' min')+
    linha('Posicionamento na carga',fmt(p.tPos,2)+' min')+
    (p.tFila?linha('Espera em fila',fmt(p.tFila,2)+' min'):'')+
    linha('Ciclo total',fmt(r.ciclo,2)+' min','hcf-forte')+
    '<div class="hcf-grp">Jornada</div>'+
    linha('Horas de calendário',fmt(r.hCalendario,0)+' h/ano')+
    linha('Eficiência',fmt(p.efic,1)+'% · '+fmt(r.minEfetivos,0)+' min/h')+
    linha('Horas efetivas',fmt(r.hEfetivas,0)+' h/ano')+
    linha('Produção requerida',fmt(r.thRequerida,1)+' t/h','hcf-forte')+
    '<div class="hcf-grp">Frota</div>'+
    linha('Viagens por caminhão',fmt(r.viagensHora,2)+' /h')+
    linha('Produtividade por caminhão',fmt(r.thCaminhao,1)+' t/h')+
    linha('Caminhões necessários',fmt(r.nExato,2)+' → <u>'+r.nCaminhoes+'</u>','hcf-forte')+
    linha('Capacidade da frente de carga',fmt(r.thFrenteCarga,1)+' t/h')+
    linha('Fator de casamento',fmt(r.matchFactor,2))+
    linha('Produção atingida',fmt(r.thEfetiva,1)+' t/h · '+fmt(r.tAno,0)+' t/ano','hcf-forte')+
    '<div class="hcf-grp">Custo</div>'+
    linha('Custo horário da operação','R$ '+fmt(r.custoHora,2)+'/h')+
    linha('Custo unitário','R$ '+fmt(r.custoT,2)+'/t','hcf-forte')+
    linha('Custo por t·km','R$ '+fmt(r.custoTkm,2)+'/t·km')+
    linha('Custo da meta anual','R$ '+fmt(r.custoAno,2))+
    (alerta.length?'<div class="hcf-alerta">'+alerta.map(a=>'<div>▲ '+esc(a)+'</div>').join('')+'</div>':'');

  const nota=el('hcfNota');
  if(nota)nota.textContent='Rota '+fmt(rota.comp3D,1)+' m (3D) · gargalo: '+r.gargalo+'.';
}

function texto(){
  const u=HCF.ultimo;if(!u)return '';
  const {rota,p,r}=u;
  return [
    'CICLO DE TRANSPORTE, FROTA E CUSTO',
    'Rota: '+rota.nome+' — '+fmt(rota.comp3D,1)+' m em 3D ('+fmt(rota.comp2D,1)+' m em planta)',
    'Cotas: '+fmt(rota.z0,2)+' → '+fmt(rota.z1,2)+' m · desnível '+fmt(rota.desnivel,2)+' m · rampa média '+fmt(rota.declMedia,2)+'%',
    'Cota obtida de: '+rota.fonte,
    '',
    'Ciclo: carga '+fmt(r.tCarga,2)+' + ida '+fmt(r.tIda,2)+' + descarga '+fmt(p.tDesc,2)+
      ' + volta '+fmt(r.tVolta,2)+' + posicionamento '+fmt(p.tPos,2)+
      (p.tFila?' + fila '+fmt(p.tFila,2):'')+' = '+fmt(r.ciclo,2)+' min',
    'Velocidades: '+fmt(p.vCarr,1)+' km/h carregado · '+fmt(p.vVazio,1)+' km/h vazio',
    '',
    'Jornada: '+fmt(p.dias,0)+' d/ano × '+fmt(p.turnos,0)+' turnos × '+fmt(p.hTurno,1)+' h = '+
      fmt(r.hCalendario,0)+' h de calendário',
    'Disponibilidade '+fmt(p.df,1)+'% · utilização '+fmt(p.uf,1)+'% · eficiência '+fmt(p.efic,1)+
      '% ('+fmt(r.minEfetivos,0)+' min/h) → '+fmt(r.hEfetivas,0)+' h efetivas',
    'Meta '+fmt(p.metaAno,0)+' t/ano → '+fmt(r.thRequerida,1)+' t/h',
    '',
    'Caminhão de '+fmt(p.payload,1)+' t: '+fmt(r.viagensHora,2)+' viagens/h · '+fmt(r.thCaminhao,1)+' t/h',
    'Frota: '+fmt(r.nExato,2)+' → '+r.nCaminhoes+' caminhões',
    'Carregamento: '+r.passes+' passes de '+fmt(r.cargaPasse,2)+' t · '+fmt(r.tCarga,2)+' min · '+
      p.nCarreg+' carregadeira(s) = '+fmt(r.thFrenteCarga,1)+' t/h',
    'Fator de casamento: '+fmt(r.matchFactor,2)+' · gargalo: '+r.gargalo,
    'Produção atingida: '+fmt(r.thEfetiva,1)+' t/h · '+fmt(r.tAno,0)+' t/ano',
    '',
    'Custo: R$ '+fmt(r.custoHora,2)+'/h · R$ '+fmt(r.custoT,2)+'/t · R$ '+fmt(r.custoTkm,2)+'/t·km',
    'Custo da meta anual: R$ '+fmt(r.custoAno,2)
  ].join('\n');
}

function copia(){
  const t=texto();
  if(!t){aviso('Calcule antes de copiar.');return;}
  const fim=()=>aviso('Resultados copiados.');
  try{
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(fim,()=>manual(t));}
    else manual(t);
  }catch(e){manual(t);}
  function manual(txt){
    const a=document.createElement('textarea');a.value=txt;a.style.position='fixed';a.style.opacity='0';
    document.body.appendChild(a);a.select();
    try{document.execCommand('copy');fim();}catch(err){aviso('Não foi possível copiar.');}
    a.remove();
  }
}

function abreCicloFrota(){
  const d=montaJanela();
  populaCamadas();
  populaMdts();
  d.style.display='flex';
  /* Se já houver uma linha selecionada no mapa, ela entra como rota — é o
     gesto mais provável de quem acabou de apontar o caminho da cava. */
  if(typeof S!=='undefined'&&S.selFeat){
    const L=(S.layers||[]).find(x=>String(x.id)===String(S.selFeat.layerId));
    if(L&&L.gtype==='line'){
      el('hcfCamada').value=String(L.id);populaFeicoes();
      el('hcfFeicao').value=String(S.selFeat.idx);
    }
  }
  mede(false);
}

/* ————————————————————————— entrada pela faixa ————————————————————————— */

function registra(){
  if(typeof CATS==='undefined'||!Array.isArray(CATS))return false;
  const cat=CATS.find(c=>c.id==='mineracao');
  if(!cat)return false;
  cat.grupos=cat.grupos||[];
  if(cat.grupos.some(g=>g.label==='Transporte e frota'))return true;
  if(typeof RIB_PNG!=='undefined'){
    if(!RIB_PNG['ciclo-frota'])RIB_PNG['ciclo-frota']=RIB_PNG['controle-producao']||RIB_PNG['planejamento'];
    if(!RIB_PNG['custo-operacional'])RIB_PNG['custo-operacional']=RIB_PNG['relatorio-lavra']||RIB_PNG['relatorio'];
  }
  cat.grupos.push({label:'Transporte e frota',it:[
    {ic:'ciclo-frota',nome:'Ciclo e Frota',act:()=>abreCicloFrota()},
    {ic:'custo-operacional',nome:'Custo R$/t',act:()=>abreCicloFrota()}
  ]});
  if(typeof ribbonBuild==='function'){try{ribbonBuild();}catch(e){}}
  return true;
}

if(!registra()){
  let restantes=20;
  const timer=setInterval(()=>{ if(registra()||--restantes<=0)clearInterval(timer); },250);
  document.addEventListener('DOMContentLoaded',()=>{ if(registra())clearInterval(timer); });
}

/* Exposto para a linha de comando e para testes. */
window.abreCicloFrota=abreCicloFrota;
window.HCF_API={metricaRota,calcula,estado:HCF,texto};

})();
