
/* ============================================================================
   CCMGIS · IMPORTAR ESTILO NO PADRÃO DO QGIS (.qml)

   O CCMGIS já ESCREVIA .qml (qmlStyle) e já lia simbologia de dentro de um
   projeto .qgs, mas não havia como carregar um .qml avulso e dizer a que
   camada ele pertence. Este bloco fecha o círculo: escolhe-se a camada,
   escolhe-se o arquivo, confere-se o que foi lido e aplica-se.

   Cobre os dois dialetos do formato — QGIS 3.x (<Option name= value=>) e o
   antigo 2.x (<prop k= v=>) — em vetor e em raster.

   Bloco ADITIVO: nenhuma função existente é editada. Três envelopamentos,
   todos chamando a versão original: handleFiles, openLayerProps e ribbonBuild.
   ========================================================================== */
(function(){
'use strict';
if(window.QSTY){ console.info('[QML] já instalado'); return; }
window.QSTY=1;
/* ============================================================================
   LEITURA DO .QML — formato nativo de estilo do QGIS
   O CCMGIS já ESCREVIA .qml (qmlStyle) e já lia simbologia de dentro do .qgs,
   mas não havia como carregar um .qml avulso. Este leitor cobre os dois
   dialetos do arquivo: QGIS 3.x (<Option name= value=>) e o antigo 2.x
   (<prop k= v=>), e serve tanto vetor quanto raster.
   ========================================================================== */
const QS_MM2PX=3.7795;          /* 1 mm a 96 dpi — a mesma equivalência que o
                                   importador de .qgs já usa para larguras */

/* Uma propriedade do QGIS, nos dois dialetos. */
function qsProp(el,chave){
  if(!el) return null;
  const o=el.querySelector('Option[name="'+chave+'"]')||el.querySelector('prop[k="'+chave+'"]');
  if(!o) return null;
  const v=o.getAttribute('value');
  return v!=null?v:o.getAttribute('v');
}
/* Cor do QGIS: "R,G,B,A" e, desde a 3.30, "R,G,B,A,rgb:r,g,b,a" — só os
   quatro primeiros números interessam. Devolve hex e alfa 0..1. */
function qsCor(el,chave){
  const v=qsProp(el,chave); if(v==null) return null;
  const s=String(v).trim();
  if(/^#[0-9a-f]{6}$/i.test(s)) return {hex:s.toLowerCase(),a:1};
  if(/^#[0-9a-f]{8}$/i.test(s)) return {hex:'#'+s.slice(1,7).toLowerCase(),a:parseInt(s.slice(7,9),16)/255};
  const p=s.split(',').map(x=>parseFloat(x)).filter(x=>Number.isFinite(x));
  if(p.length<3) return null;
  const q=n=>Math.max(0,Math.min(255,Math.round(n||0))).toString(16).padStart(2,'0');
  return {hex:'#'+q(p[0])+q(p[1])+q(p[2]), a:p.length>3?Math.max(0,Math.min(1,p[3]/255)):1};
}
function qsNum(el,chave){
  const v=qsProp(el,chave); if(v==null) return null;
  const n=parseFloat(String(v).replace(',','.'));
  return Number.isFinite(n)?n:null;
}
/* Comprimento em PIXELS. O QGIS grava em milímetros por padrão, mas o arquivo
   pode declarar Pixel, Point ou unidade de mapa — converter sem olhar a
   unidade é o erro clássico que deixa a linha 4x mais grossa. */
function qsLen(el,chave,unidadeChave){
  const n=qsNum(el,chave); if(n==null) return null;
  const u=String(qsProp(el,unidadeChave||(chave+'_unit'))||'MM').trim();
  if(/^Pixel$/i.test(u)) return n;
  if(/^Point$/i.test(u)) return n*(96/72);
  if(/^(MapUnit|RenderMetersInMapUnits)$/i.test(u)) return null;   // depende da escala
  return n*QS_MM2PX;
}
function qsBool(el,chave){
  const v=qsProp(el,chave); return v!=null && /^(1|true|yes)$/i.test(String(v).trim());
}

/* ---------- traço e hachura: o inverso das tabelas do exportador ---------- */
const QS_PEN2DASH={solid:'', dash:'6 4', dot:'1.5 4', 'dash dot':'10 4 2 4',
  'dash dot dot':'14 4 2 4 2 4', no:''};
const QS_BRUSH2HATCH={solid:'solid', no:'none', f_diagonal:'fdiagonal', b_diagonal:'bdiagonal',
  cross:'cross', horizontal:'horizontal', vertical:'vertical', diagonal_x:'cross',
  dense1:'dots', dense2:'dots', dense3:'dots', dense4:'dots', dense5:'dots', dense6:'dots', dense7:'dots'};
const QS_MARK2PT={circle:'circle', square:'square', rectangle:'square', diamond:'diamond',
  triangle:'tri', equilateral_triangle:'tri', inverted_triangle:'tri_dn', pentagon:'penta',
  hexagon:'hexa', star:'star', regular_star:'star', cross:'cross', cross2:'xmark', x:'xmark',
  cross_fill:'cross', arrow:'arrow', arrowhead:'arrow', half_square:'half',
  filled_arrowhead:'arrow', line:'dot', point:'dot'};

/* Camada de desenho efetiva de um <symbol>: a primeira habilitada. */
function qsLayer(sym){
  if(!sym) return null;
  return sym.querySelector(':scope > layer[enabled="1"]')
      || sym.querySelector(':scope > layer')
      || sym.querySelector('layer') || sym;
}
/* Traduz UM <symbol> do QGIS para o vocabulário de estilo do CCMGIS. */
function qsSimbolo(sym,gtype,avisos){
  if(!sym) return null;
  const lay=qsLayer(sym);
  const cls=String((lay&&lay.getAttribute('class'))||'');
  const out={};
  if(/Marker/i.test(cls)||gtype==='point'){
    const c=qsCor(lay,'color');
    const s=qsCor(lay,'outline_color');
    if(c){ out.color=c.hex; }
    if(s){ out.stroke=s.hex; }
    const nome=String(qsProp(lay,'name')||'circle').toLowerCase();
    out.shape=QS_MARK2PT[nome]||'circle';
    if(!QS_MARK2PT[nome]&&nome&&avisos) avisos.push('Marcador "'+nome+'" não existe na cartela do CCMGIS — usado círculo.');
    const tam=qsLen(lay,'size');
    if(tam!=null) out.size=Math.max(4,Math.min(64,Math.round(tam)));
    const w=qsLen(lay,'outline_width');
    if(w!=null) out.weight=Math.max(0.5,+w.toFixed(1));
    if(/Svg/i.test(cls)&&avisos) avisos.push('Marcador SVG não é suportado — substituído por símbolo da cartela.');
    if(/Font/i.test(cls)&&avisos) avisos.push('Marcador de fonte (FontMarker) não é suportado — substituído por símbolo da cartela.');
    return out;
  }
  if(/Line/i.test(cls)||gtype==='line'){
    const c=qsCor(lay,'line_color')||qsCor(lay,'color')||qsCor(lay,'outline_color');
    if(c){ out.color=c.hex; out.stroke=c.hex; }
    const w=qsLen(lay,'line_width');
    if(w!=null) out.weight=Math.max(0.5,+w.toFixed(1));
    out.dash=qsTraco(lay,'line_style','customdash','use_custom_dash');
    if(/Marker.?Line|Hash.?Line|Arrow/i.test(cls)&&avisos)
      avisos.push('Linha decorada ('+cls+') não é suportada — desenhada como linha simples.');
    return out;
  }
  /* polígono */
  const f=qsCor(lay,'color');
  const s=qsCor(lay,'outline_color');
  const estilo=String(qsProp(lay,'style')||'solid').toLowerCase();
  if(f){ out.color=f.hex; out.fill=(estilo==='no')?0:f.a; }
  if(s) out.stroke=s.hex;
  out.hatch=QS_BRUSH2HATCH[estilo]||'solid';
  if(!QS_BRUSH2HATCH[estilo]&&avisos) avisos.push('Preenchimento "'+estilo+'" desconhecido — usado sólido.');
  const w=qsLen(lay,'outline_width');
  if(w!=null) out.weight=Math.max(0.5,+w.toFixed(1));
  out.dash=qsTraco(lay,'outline_style','customdash','use_custom_dash');
  if(/LinePatternFill|PointPatternFill|SVGFill|RasterFill/i.test(cls)){
    out.hatch=/LinePatternFill/i.test(cls)?'fdiagonal':(/PointPatternFill/i.test(cls)?'dots':'solid');
    const cc=qsCor(lay,'color')||qsCor(sym.querySelector('symbol'),'line_color');
    if(cc) out.color=cc.hex;
    if(avisos) avisos.push('Preenchimento por padrão ('+cls+') aproximado pela hachura mais próxima.');
  }
  if(/CentroidFill/i.test(cls)&&avisos) avisos.push('CentroidFill não é suportado — usado preenchimento simples.');
  return out;
}
function qsTraco(lay,chaveEstilo,chaveCustom,chaveUsa){
  if(qsBool(lay,chaveUsa)){
    const v=String(qsProp(lay,chaveCustom)||'');
    const u=String(qsProp(lay,'customdash_unit')||'MM');
    const k=/^Pixel$/i.test(u)?1:(/^Point$/i.test(u)?96/72:QS_MM2PX);
    const n=v.split(';').map(x=>parseFloat(x)).filter(Number.isFinite);
    if(n.length>=2) return n.map(x=>+(x*k).toFixed(1)).join(' ');
  }
  const e=String(qsProp(lay,chaveEstilo)||'solid').toLowerCase().replace(/\s+/g,' ');
  return QS_PEN2DASH[e]!==undefined?QS_PEN2DASH[e]:'';
}
/* ---------- renderizador vetorial ---------- */
function qsRenderer(raiz,gtype,avisos){
  const rend=raiz.querySelector('renderer-v2'); if(!rend) return null;
  const tipo=String(rend.getAttribute('type')||'');
  const simbolos={};
  rend.querySelectorAll(':scope > symbols > symbol').forEach(s=>{
    simbolos[s.getAttribute('name')]=qsSimbolo(s,gtype,avisos);
  });
  if(tipo==='singleSymbol'){
    const s=rend.querySelector(':scope > symbols > symbol')||rend.querySelector('symbol');
    return {modo:'single', base:qsSimbolo(s,gtype,avisos)};
  }
  if(tipo==='categorizedSymbol'){
    const campo=(rend.querySelector(':scope > attr')||{}).textContent||rend.getAttribute('attr')||'';
    const cats=[...rend.querySelectorAll(':scope > categories > category')].map(c=>{
      const st=simbolos[c.getAttribute('symbol')]||{};
      return Object.assign({}, st, {
        value:String(c.getAttribute('value')??''),
        label:c.getAttribute('label')||'',
        vis:c.getAttribute('render')!=='false'
      });
    });
    if(!campo) avisos.push('Renderizador categorizado sem campo declarado.');
    return {modo:'cat', campo, itens:cats, base:cats[0]||null};
  }
  if(tipo==='graduatedSymbol'){
    const campo=(rend.querySelector(':scope > attr')||{}).textContent||rend.getAttribute('attr')||'';
    const fx=[...rend.querySelectorAll(':scope > ranges > range')].map(r=>{
      const st=simbolos[r.getAttribute('symbol')]||{};
      return Object.assign({}, st, {
        min:parseFloat(r.getAttribute('lower')), max:parseFloat(r.getAttribute('upper')),
        label:r.getAttribute('label')||'', vis:r.getAttribute('render')!=='false'
      });
    }).filter(r=>Number.isFinite(r.min)&&Number.isFinite(r.max));
    if(!campo) avisos.push('Renderizador graduado sem campo declarado.');
    return {modo:'grad', campo, itens:fx, base:fx[0]||null};
  }
  if(tipo==='RuleRenderer'){
    /* Regras podem ter filtro por expressão, escala e aninhamento — nada disso
       existe no CCMGIS. Quando cada regra é um "campo = valor" simples, ela
       vira categoria; fora disso fica só o primeiro símbolo. */
    const regras=[...raiz.querySelectorAll('renderer-v2 rules > rule')];
    const cats=[]; let campo='';
    regras.forEach(r=>{
      const filtro=r.getAttribute('filter')||'';
      const m=filtro.match(/^\s*"?([\wÀ-ſ]+)"?\s*(?:=|IS)\s*'([^']*)'\s*$/i)
           || filtro.match(/^\s*"?([\wÀ-ſ]+)"?\s*=\s*([\d.]+)\s*$/);
      const sy=r.getAttribute('symbol');
      if(m && (campo===''||campo===m[1])){
        campo=m[1];
        cats.push(Object.assign({},simbolos[sy]||{},{value:m[2],label:r.getAttribute('label')||m[2],vis:true}));
      }
    });
    if(campo&&cats.length){
      avisos.push('Renderizador por regras convertido em categorias pelo campo "'+campo+'" ('+cats.length+' regra(s) simples).');
      return {modo:'cat', campo, itens:cats, base:cats[0]};
    }
    avisos.push('Renderizador por regras não pôde ser convertido — aplicado apenas o primeiro símbolo.');
    const s=rend.querySelector('symbol');
    return {modo:'single', base:qsSimbolo(s,gtype,avisos)};
  }
  if(tipo==='nullSymbol'){ avisos.push('Camada sem símbolo (nullSymbol) — simbologia não aplicada.'); return null; }
  if(tipo){
    avisos.push('Renderizador "'+tipo+'" não é suportado — aplicado apenas o primeiro símbolo.');
    const s=rend.querySelector('symbol');
    return {modo:'single', base:qsSimbolo(s,gtype,avisos)};
  }
  return null;
}

/* ---------- rótulos ---------- */
function qsRotulos(raiz,avisos){
  const lab=raiz.querySelector('labeling[type="simple"] settings');
  if(!lab){
    if(raiz.querySelector('labeling[type="rule-based"]')) avisos.push('Rótulos por regras não são suportados — não aplicados.');
    return null;
  }
  const liga=(raiz.querySelector(':scope > labelsEnabled')||{}).textContent;
  if(liga!=null && !/^(1|true)$/i.test(String(liga).trim())) return null;
  const t=lab.querySelector('text-style'); if(!t) return null;
  const campo=t.getAttribute('fieldName')||'';
  if(!campo) return null;
  if(/^1|true$/i.test(t.getAttribute('isExpression')||''))
    avisos.push('O rótulo é uma expressão do QGIS; foi lido como nome de campo — confira.');
  const cor=(()=>{ const v=String(t.getAttribute('textColor')||'').split(',').map(Number);
    if(v.length<3||!Number.isFinite(v[0])) return null;
    const q=n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0');
    return '#'+q(v[0])+q(v[1])+q(v[2]); })();
  const b=lab.querySelector('text-buffer');
  const temHalo=b&&/^(1|true)$/i.test(b.getAttribute('bufferDraw')||'');
  const haloCor=(()=>{ if(!temHalo) return null;
    const v=String(b.getAttribute('bufferColor')||'').split(',').map(Number);
    if(v.length<3||!Number.isFinite(v[0])) return '#ffffff';
    const q=n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0');
    return '#'+q(v[0])+q(v[1])+q(v[2]); })();
  const pl=lab.querySelector('placement');
  const peso=parseFloat(t.getAttribute('fontWeight')||'50');
  const ital=/^(1|true)$/i.test(t.getAttribute('fontItalic')||'');
  const est=[peso>=75?'bold':'', ital?'italic':''].filter(Boolean).join(' ')||'normal';
  const unid=String(t.getAttribute('fontSizeUnit')||'Point');
  const tam=parseFloat(t.getAttribute('fontSize')||'');
  return {
    campo,
    size: Number.isFinite(tam)? Math.max(4,Math.min(48,Math.round(/^MM$/i.test(unid)?tam*QS_MM2PX:tam))) : null,
    color: cor, halo: haloCor,
    haloW: temHalo? Math.max(0.5,(parseFloat(b.getAttribute('bufferSize')||'1')||1)*2) : null,
    font: (t.getAttribute('fontFamily')||'').trim(),
    style: est,
    dx: pl? (parseFloat(pl.getAttribute('xOffset')||'0')||0) : 0,
    dy: pl? (parseFloat(pl.getAttribute('yOffset')||'0')||0) : 0,
    place: pl && pl.getAttribute('placement')==='1' ? 'center' : null
  };
}

/* ---------- raster ---------- */
function qsRaster(raiz,avisos){
  const rr=raiz.querySelector('rasterrenderer'); if(!rr) return null;
  const tipo=String(rr.getAttribute('type')||'');
  const op=parseFloat(rr.getAttribute('opacity')||'');
  const out={tipo, opacity:Number.isFinite(op)?Math.max(0.05,Math.min(1,op)):null, classes:null};
  const hex=el=>{
    const c=String(el.getAttribute('color')||'').trim();
    if(/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
    const p=c.split(',').map(Number);
    if(p.length>=3&&Number.isFinite(p[0])){
      const q=n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0');
      return '#'+q(p[0])+q(p[1])+q(p[2]);
    }
    return '#888888';
  };
  if(tipo==='paletted'){
    const ent=[...rr.querySelectorAll('colorPalette > paletteEntry')];
    if(ent.length) out.classes=ent.map(e=>{
      const v=parseFloat(e.getAttribute('value'));
      return {min:v-0.5,max:v+0.5,color:hex(e),label:e.getAttribute('label')||String(v)};
    });
    return out;
  }
  if(tipo==='singlebandpseudocolor'){
    const sh=rr.querySelector('colorrampshader');
    const modo=String(sh&&sh.getAttribute('colorRampType')||'INTERPOLATED').toUpperCase();
    const it=[...rr.querySelectorAll('colorrampshader > item')];
    if(!it.length) return out;
    if(modo==='EXACT'){
      out.classes=it.map(e=>{ const v=parseFloat(e.getAttribute('value'));
        return {min:v-0.5,max:v+0.5,color:hex(e),label:e.getAttribute('label')||String(v)}; });
    }else{
      /* DISCRETE: o value do item é o limite SUPERIOR da faixa.
         INTERPOLATED: é um nó da rampa; aproximamos por faixas entre nós, que
         é o mais próximo que a simbologia por classes do CCMGIS alcança. */
      const cMin=parseFloat(rr.getAttribute('classificationMin'));
      let ant=Number.isFinite(cMin)?cMin:parseFloat(it[0].getAttribute('value'));
      out.classes=it.map((e,i)=>{
        const v=parseFloat(e.getAttribute('value'));
        const faixa={min:(i===0&&Number.isFinite(cMin))?cMin:ant, max:v,
                     color:hex(e), label:e.getAttribute('label')||''};
        ant=v; return faixa;
      }).filter(f=>Number.isFinite(f.min)&&Number.isFinite(f.max)&&f.max>f.min);
      if(modo==='INTERPOLATED')
        avisos.push('Rampa interpolada convertida em faixas discretas — o CCMGIS classifica por intervalo, não por gradiente contínuo.');
    }
    return out;
  }
  if(tipo==='singlebandgray'){ out.cinza=true; return out; }
  if(tipo==='multibandcolor'){ avisos.push('Raster multibanda (RGB) — no CCMGIS isso é ortofoto e não recebe estilo por classes.'); return out; }
  avisos.push('Renderizador de raster "'+tipo+'" não é suportado.');
  return out;
}

/* ---------- porta de entrada ---------- */
function qsParse(texto){
  const doc=new DOMParser().parseFromString(texto,'text/xml');
  if(doc.querySelector('parsererror')) return {ok:false,erro:'XML inválido — o arquivo não é um .qml legível.'};
  const raiz=doc.querySelector('qgis')||doc.querySelector('maplayer')||doc.documentElement;
  if(!raiz) return {ok:false,erro:'Arquivo sem raiz <qgis>.'};
  if(raiz.tagName!=='qgis'&&raiz.tagName!=='maplayer'&&!raiz.querySelector('renderer-v2,rasterrenderer,pipe'))
    return {ok:false,erro:'Não parece um estilo do QGIS (sem <renderer-v2> nem <rasterrenderer>).'};
  const avisos=[];
  const gt=(raiz.querySelector(':scope > layerGeometryType')||{}).textContent;
  const gtype=({'0':'point','1':'line','2':'polygon'})[String(gt||'').trim()]||null;
  const ras=qsRaster(raiz,avisos);
  const rend=ras?null:qsRenderer(raiz,gtype||'polygon',avisos);
  const lbl=ras?null:qsRotulos(raiz,avisos);
  let opac=null;
  const eo=raiz.querySelector(':scope > layerOpacity')||raiz.querySelector(':scope > opacity');
  if(eo){ const n=parseFloat(eo.textContent); if(Number.isFinite(n)) opac=Math.max(0.05,Math.min(1,n)); }
  if(opac==null){ const tr=raiz.querySelector(':scope > transparency');
    if(tr){ const n=parseFloat(tr.textContent); if(Number.isFinite(n)) opac=1-n/255; } }
  if(ras&&ras.opacity!=null) opac=ras.opacity;
  const ver=raiz.getAttribute('version')||'';
  if(!ras&&!rend&&!lbl) return {ok:false,erro:'O arquivo não traz simbologia nem rótulos reconhecíveis.'};
  return {ok:true, kind:ras?'raster':'vector', gtype, rend, lbl, ras, opac, avisos, versao:ver};
}
/* ============================================================================
   APLICAÇÃO NA CAMADA DO CCMGIS
   ========================================================================== */
function qsCampos(L){
  const s=new Set();
  (L.fields||[]).forEach(f=>s.add(typeof f==='string'?f:f&&f.name));
  if(!s.size)(L.features||[]).slice(0,200).forEach(f=>Object.keys(f&&f.props||{}).forEach(k=>s.add(k)));
  s.delete(undefined); s.delete(null);
  return s;
}
/* Nome de campo do QGIS que não existe aqui ainda pode existir com outra
   caixa — o shapefile trunca e o QGIS às vezes normaliza. */
function qsAchaCampo(L,nome){
  if(!nome) return '';
  const c=qsCampos(L);
  if(c.has(nome)) return nome;
  const alvo=String(nome).toLowerCase();
  for(const k of c) if(String(k).toLowerCase()===alvo) return k;
  for(const k of c) if(String(k).toLowerCase()===alvo.slice(0,10)) return k;
  return '';
}
function qsAplicaBase(sym,st){
  if(!st) return;
  if(st.color){ sym.color=st.color; }
  if(st.stroke){ sym.stroke=st.stroke; }
  if(st.weight!=null){ sym.weight=st.weight; }
  if(st.fill!=null){ sym.fill=Math.max(0,Math.min(1,st.fill)); }
  if(st.hatch){ sym.hatch=st.hatch; }
  if(st.dash!==undefined&&st.dash!==null){ sym.dash=st.dash; }
}
function qsAplicaVetor(L,p,opts,relato){
  const o=opts||{}, s=L.sym;
  if(o.simbologia!==false && p.rend){
    if(p.gtype && p.gtype!==L.gtype)
      relato.avisos.push('O estilo é de geometria '+p.gtype+' e a camada é '+L.gtype+' — o que não se aplica foi ignorado.');
    qsAplicaBase(s,p.rend.base);
    if(L.gtype==='point'&&p.rend.base){
      const pt=(typeof ptCfg==='function')?ptCfg(L):(s.pt=s.pt||{shape:'circle',size:14,rot:0,rotField:'',dipField:''});
      if(p.rend.base.shape) pt.shape=p.rend.base.shape;
      if(p.rend.base.size!=null) pt.size=p.rend.base.size;
    }
    if(p.rend.modo==='single'){
      s.mode='single'; s.field=''; s.classes=[]; s.cats=[];
      relato.linhas.push('Símbolo único aplicado.');
    }else{
      const campo=qsAchaCampo(L,p.rend.campo);
      if(!campo){
        s.mode='single';
        relato.avisos.push('O campo "'+p.rend.campo+'" não existe nesta camada — as classes não puderam ser aplicadas; ficou símbolo único.');
      }else{
        if(campo!==p.rend.campo) relato.avisos.push('Campo "'+p.rend.campo+'" casado com "'+campo+'" desta camada.');
        s.field=campo;
        if(p.rend.modo==='cat'){
          s.mode='cat';
          const cont={};
          (L.features||[]).forEach(f=>{ const v=String((f.props||{})[campo]); cont[v]=(cont[v]||0)+1; });
          s.cats=p.rend.itens.map(c=>{
            const r={value:c.value,color:c.color||'#888888',vis:c.vis!==false,count:cont[c.value]||0};
            if(c.stroke)r.stroke=c.stroke; if(c.weight!=null)r.weight=c.weight;
            if(c.fill!=null)r.fill=c.fill; if(c.hatch)r.hatch=c.hatch;
            if(c.dash!==undefined&&c.dash!==null)r.dash=c.dash;
            if(c.shape)r.shape=c.shape; if(c.size!=null)r.size=c.size;
            return r;
          });
          s.classes=[];
          const semDado=s.cats.filter(c=>!c.count).length;
          relato.linhas.push(s.cats.length+' categoria(s) por "'+campo+'".');
          if(semDado) relato.avisos.push(semDado+' categoria(s) do estilo não têm nenhuma feição correspondente nesta camada.');
        }else{
          s.mode='grad';
          s.classes=p.rend.itens.map(c=>{
            const r={min:c.min,max:c.max,color:c.color||'#888888',vis:c.vis!==false,
              count:(L.features||[]).filter(f=>{const v=+((f.props||{})[campo]);
                return isFinite(v)&&v>=c.min&&v<=c.max;}).length};
            if(c.stroke)r.stroke=c.stroke; if(c.weight!=null)r.weight=c.weight;
            if(c.fill!=null)r.fill=c.fill; if(c.hatch)r.hatch=c.hatch;
            if(c.dash!==undefined&&c.dash!==null)r.dash=c.dash;
            return r;
          });
          s.cats=[];
          relato.linhas.push(s.classes.length+' faixa(s) graduadas por "'+campo+'".');
        }
      }
    }
  }
  if(o.rotulos!==false && p.lbl){
    const campo=qsAchaCampo(L,p.lbl.campo);
    if(!campo) relato.avisos.push('Campo de rótulo "'+p.lbl.campo+'" não existe nesta camada — rótulos não aplicados.');
    else{
      L.labelField=campo; L.labelFields=[campo];
      L.lbl=Object.assign((typeof defaultLabelCfg==='function')?defaultLabelCfg():{}, L.lbl||{});
      const c=L.lbl;
      if(p.lbl.size!=null) c.size=p.lbl.size;
      if(p.lbl.color) c.color=p.lbl.color;
      if(p.lbl.halo){ c.halo=p.lbl.halo; c.haloW=Math.max(0.5,p.lbl.haloW||1.2); }
      else c.haloW=0;
      if(p.lbl.font) c.font=p.lbl.font+', sans-serif';
      if(p.lbl.style) c.style=p.lbl.style;
      if(p.lbl.place) c.place=p.lbl.place;
      if(p.lbl.dx) c.dx=p.lbl.dx;
      if(p.lbl.dy) c.dy=p.lbl.dy;
      relato.linhas.push('Rótulos pelo campo "'+campo+'".');
    }
  }
  if(o.opacidade!==false && p.opac!=null){
    L.sym.opacity=p.opac;
    relato.linhas.push('Opacidade da camada: '+Math.round(p.opac*100)+'%.');
  }
  try{ drawLayer(L); }catch(e){}
  try{ refreshUI(); }catch(e){}
}
function qsAplicaRaster(R,p,opts,relato){
  const o=opts||{};
  R.style=R.style||{};
  if(o.simbologia!==false && p.ras){
    if(p.ras.classes&&p.ras.classes.length){
      R.style.mode='classes';
      R.style.classes=p.ras.classes.map(c=>({min:c.min,max:c.max,color:c.color,label:c.label||''}));
      relato.linhas.push(p.ras.classes.length+' classe(s) de raster aplicadas.');
    }else if(p.ras.cinza){
      R.style.mode='gray';
      relato.linhas.push('Raster em tons de cinza.');
    }else{
      relato.avisos.push('O estilo de raster não trouxe classes utilizáveis.');
    }
  }
  if(o.opacidade!==false && p.opac!=null){
    R.style.opacity=p.opac;
    relato.linhas.push('Opacidade: '+Math.round(p.opac*100)+'%.');
  }
  R._st=null;
  try{ renderRaster(R); }catch(e){}
  try{ refreshUI(); }catch(e){}
}
function qsAplica(alvo,p,opts){
  const relato={linhas:[],avisos:(p.avisos||[]).slice()};
  if(alvo.tipo==='raster') qsAplicaRaster(alvo.obj,p,opts,relato);
  else qsAplicaVetor(alvo.obj,p,opts,relato);
  return relato;
}
/* ============================================================================
   JANELA — escolher a camada, escolher o arquivo, conferir e aplicar
   ========================================================================== */
const QS_CSS=`
#qsBg .modal{width:min(880px,100%);max-height:92vh}
#qsBg .modal-b{padding:12px 14px;overflow-y:auto}
#qsBg .mcf-x{cursor:pointer;color:var(--ink-dim);padding:0 3px}
#qsBg .mcf-x:hover{color:var(--sel)}
.qs-card{border:1px solid var(--line);border-radius:9px;background:var(--panel2);padding:9px 10px;margin-bottom:9px}
.qs-card>header{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;font-size:12.5px;font-weight:600}
.qs-drop{border:2px dashed var(--line);border-radius:10px;padding:16px;text-align:center;cursor:pointer;
  color:var(--ink-dim);font-size:12px;transition:.15s;background:var(--bg)}
.qs-drop:hover,.qs-drop.over{border-color:var(--amber);color:var(--amber);background:#f5a5240f}
.qs-drop b{display:block;font-size:13px;color:var(--ink);margin-bottom:3px}
.qs-tbl{width:100%;border-collapse:collapse;font-family:var(--mono);font-size:11.5px}
.qs-tbl th,.qs-tbl td{border:1px solid var(--line);padding:3px 6px;text-align:left}
.qs-tbl th{background:var(--panel);color:var(--amber)}
.qs-tbl td.n{text-align:right}
.qs-scroll{max-height:32vh;overflow:auto;border:1px solid var(--line);border-radius:8px}
.qs-sw{width:26px;height:14px;border-radius:3px;border:1px solid #0006;display:inline-block;vertical-align:-2px}
.qs-warn{border-left:3px solid var(--amber);background:#f5a5241a;padding:6px 9px;border-radius:6px;font-size:11.5px;margin:5px 0}
.qs-err{border-left:3px solid var(--sel);background:#e052521a;padding:6px 9px;border-radius:6px;font-size:11.5px;margin:5px 0}
.qs-ok{border-left:3px solid var(--cyan);background:#37c0aa1a;padding:6px 9px;border-radius:6px;font-size:11.5px;margin:5px 0}
.qs-inline{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.qs-inline label{font-size:11.5px;color:var(--ink);display:flex;align-items:center;gap:6px;margin:0;cursor:pointer}
.qs-inline input[type=checkbox]{width:auto;accent-color:var(--amber)}
#qsBg .mcf-foot,.qs-foot{display:flex;align-items:center;gap:9px;padding:9px 14px;border-top:1px solid var(--line);flex-wrap:wrap}
.qs-foot .grow{flex:1;min-width:100px;font-size:11.5px;color:var(--ink-dim)}
#lpQsBox{display:flex;gap:6px;flex-wrap:wrap}
#lpQsBox .tbtn{flex:1;min-width:150px;justify-content:center}
`;
(function(){ const s=document.createElement('style'); s.id='qs-style'; s.textContent=QS_CSS;
  document.head.appendChild(s); })();

const QS={alvoId:'', parsed:null, nomeArq:'', manual:false};
const qsEsc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function qsAlvos(){
  const out=[];
  (S.layers||[]).forEach(l=>out.push({tipo:'vetor',id:'L'+l.id,obj:l,
    nome:l.name,det:({polygon:'polígono',line:'linha',point:'ponto'}[l.gtype]||l.gtype)+' · '+(l.features||[]).length+' feições'}));
  (S.rasters||[]).forEach(r=>out.push({tipo:'raster',id:'R'+r.id,obj:r,
    nome:r.name,det:'raster '+r.d.nc+'×'+r.d.nr}));
  return out;
}
function qsAlvo(id){ return qsAlvos().find(a=>a.id===(id||QS.alvoId))||null; }

function qsModal(){
  let bg=document.getElementById('qsBg'); if(bg) return bg;
  bg=document.createElement('div'); bg.className='modal-bg'; bg.id='qsBg';
  bg.innerHTML='<div class="modal">'+
    '<div class="modal-h"><b>🎨 Estilo do QGIS</b><span class="tag">.qml</span>'+
      '<div style="flex:1"></div><span class="mcf-x" id="qsX" style="cursor:pointer;font-size:14px">✕</span></div>'+
    '<div class="modal-b">'+
      '<div class="qs-card"><header>1 · Camada de destino</header>'+
        '<select id="qsAlvo"></select>'+
        '<div class="hint" id="qsAlvoHint" style="margin-top:4px"></div></div>'+
      '<div class="qs-card"><header>2 · Arquivo de estilo</header>'+
        '<div class="qs-drop" id="qsDrop"><b>Escolher arquivo .qml</b>'+
          'ou arraste o arquivo aqui · o mesmo .qml que o QGIS usa em Camada › Propriedades › Estilo › Salvar</div>'+
        '<div id="qsArq" class="hint" style="margin-top:6px"></div></div>'+
      '<div id="qsLeitura"></div>'+
      '<div class="qs-card" id="qsOpts" style="display:none"><header>3 · O que aplicar</header>'+
        '<div class="qs-inline">'+
          '<label><input type="checkbox" id="qsOpSym" checked> Simbologia</label>'+
          '<label><input type="checkbox" id="qsOpLbl" checked> Rótulos</label>'+
          '<label><input type="checkbox" id="qsOpOpa" checked> Opacidade</label>'+
        '</div></div>'+
    '</div>'+
    '<div class="qs-foot"><span class="grow" id="qsMsg"></span>'+
      '<button class="tbtn" id="qsExp" style="max-width:230px">⇩ Exportar estilo desta camada</button>'+
      '<button class="tbtn" id="qsAplicar" style="max-width:180px;border-color:var(--amber-dim);color:var(--amber)" disabled>✓ Aplicar estilo</button>'+
    '</div></div>';
  document.body.appendChild(bg);
  const fechar=()=>bg.classList.remove('on');
  bg.querySelector('#qsX').onclick=fechar;
  bg.addEventListener('mousedown',e=>{ if(e.target===bg) fechar(); });
  bg.querySelector('#qsAlvo').onchange=e=>{ QS.alvoId=e.target.value; QS.manual=true; qsRender(); };
  bg.querySelector('#qsDrop').onclick=()=>qsEscolheArquivo();
  const dz=bg.querySelector('#qsDrop');
  ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation();dz.classList.add('over');}));
  ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();e.stopPropagation();dz.classList.remove('over');}));
  dz.addEventListener('drop',e=>{
    const f=[...(e.dataTransfer&&e.dataTransfer.files||[])].find(x=>/\.qml$/i.test(x.name));
    if(f) qsCarrega(f); else toast('Solte um arquivo .qml');
  });
  bg.querySelector('#qsAplicar').onclick=()=>qsAplicarAgora();
  bg.querySelector('#qsExp').onclick=()=>qsExporta();
  return bg;
}
function qsAbrir(alvoId,arquivo){
  const bg=qsModal();
  const alvos=qsAlvos();
  if(!alvos.length){ toast('Nenhuma camada ou raster no projeto'); return; }
  if(alvoId){ QS.alvoId=alvoId; QS.manual=true; }
  if(!qsAlvo()){ QS.alvoId=alvos[0].id; QS.manual=false; }
  bg.classList.add('on');
  qsRender();
  if(arquivo) qsCarrega(arquivo);
}
window.qsAbrir=qsAbrir;

function qsEscolheArquivo(){
  const inp=document.createElement('input');
  inp.type='file'; inp.accept='.qml,application/xml,text/xml';
  inp.onchange=()=>{ const f=inp.files&&inp.files[0]; if(f) qsCarrega(f); };
  inp.click();
}
async function qsCarrega(f){
  try{
    const txt=await f.text();
    const p=qsParse(txt);
    QS.nomeArq=f.name;
    if(!p.ok){ QS.parsed=null; qsRender(); toast('Estilo: '+p.erro); return; }
    QS.parsed=p;
    /* Casamento automático pelo nome, como o QGIS faz: um .qml de mesmo nome
       do arquivo de dados pertence àquela camada. */
    const base=f.name.replace(/\.qml$/i,'').toLowerCase();
    const tipoArq=(p.kind==='raster')?'raster':'vetor';
    const compat=a=>a&&a.tipo===tipoArq;
    const iguais=qsAlvos().filter(compat);
    const cand=iguais.find(a=>String(a.nome).toLowerCase()===base)
            || iguais.find(a=>String(a.nome).toLowerCase().indexOf(base)>=0)
            || iguais.find(a=>base.indexOf(String(a.nome).toLowerCase())>=0);
    /* Troca o destino quando o usuário NÃO escolheu um à mão, ou quando o que
       está escolhido é do tipo errado (estilo de raster sobre vetor, e vice-versa). */
    let trocou=false;
    if(cand && (!QS.manual || !compat(qsAlvo()))){ QS.alvoId=cand.id; trocou=true; }
    else if(!cand && !compat(qsAlvo()) && iguais.length){ QS.alvoId=iguais[0].id; trocou=true; }
    qsRender();
    if(trocou && cand) qsMsg('Destino casado com "'+cand.nome+'" pelo nome do arquivo.');
    else if(trocou) qsMsg('Destino trocado para "'+(qsAlvo()||{}).nome+'" — o anterior era de outro tipo.');
    else if(cand && qsAlvo() && cand.id!==QS.alvoId) qsMsg('Existe também a camada "'+cand.nome+'" com o nome do arquivo.');
    else qsMsg('');
  }catch(e){ toast('Falha ao ler o .qml: '+e.message); }
}
function qsMsg(t){ const e=document.getElementById('qsMsg'); if(e) e.textContent=t||''; }

function qsRender(){
  const bg=document.getElementById('qsBg'); if(!bg||!bg.classList.contains('on')) return;
  const sel=bg.querySelector('#qsAlvo'), alvos=qsAlvos();
  const vet=alvos.filter(a=>a.tipo==='vetor'), ras=alvos.filter(a=>a.tipo==='raster');
  const opt=a=>'<option value="'+a.id+'"'+(a.id===QS.alvoId?' selected':'')+'>'+qsEsc(a.nome)+' — '+a.det+'</option>';
  sel.innerHTML=(vet.length?'<optgroup label="Camadas vetoriais">'+vet.map(opt).join('')+'</optgroup>':'')+
                (ras.length?'<optgroup label="Rasters e superfícies">'+ras.map(opt).join('')+'</optgroup>':'');
  const alvo=qsAlvo();
  bg.querySelector('#qsAlvoHint').textContent=alvo
    ? (alvo.tipo==='raster'?'Raster: recebe classes de cor e opacidade.'
      :'Vetor: recebe símbolo, classes por atributo, rótulos e opacidade.') : '';
  bg.querySelector('#qsArq').innerHTML=QS.nomeArq
    ? '📄 <b>'+qsEsc(QS.nomeArq)+'</b>' : 'nenhum arquivo carregado';

  const box=bg.querySelector('#qsLeitura'), opts=bg.querySelector('#qsOpts');
  const bt=bg.querySelector('#qsAplicar');
  const p=QS.parsed;
  if(!p){ box.innerHTML=''; opts.style.display='none'; bt.disabled=true; return; }

  const incompat = alvo && ((p.kind==='raster') !== (alvo.tipo==='raster'));
  let h='<div class="qs-card"><header>Leitura do arquivo'+
    (p.versao?'<span class="tag">QGIS '+qsEsc(p.versao)+'</span>':'')+'</header>';
  h+='<table class="qs-tbl"><tbody>';
  h+='<tr><td>Tipo</td><td><b>'+(p.kind==='raster'?'estilo de raster':'estilo vetorial')+'</b></td></tr>';
  if(p.gtype) h+='<tr><td>Geometria do estilo</td><td>'+({point:'ponto',line:'linha',polygon:'polígono'}[p.gtype])+'</td></tr>';
  if(p.rend){
    h+='<tr><td>Renderizador</td><td>'+({single:'símbolo único',cat:'categorizado',grad:'graduado'}[p.rend.modo])+'</td></tr>';
    if(p.rend.campo) h+='<tr><td>Campo</td><td><b>'+qsEsc(p.rend.campo)+'</b></td></tr>';
    if(p.rend.itens) h+='<tr><td>Classes</td><td>'+p.rend.itens.length+'</td></tr>';
  }
  if(p.ras){
    h+='<tr><td>Renderizador</td><td>'+qsEsc(p.ras.tipo)+'</td></tr>';
    if(p.ras.classes) h+='<tr><td>Classes</td><td>'+p.ras.classes.length+'</td></tr>';
  }
  if(p.lbl) h+='<tr><td>Rótulos</td><td>campo <b>'+qsEsc(p.lbl.campo)+'</b>'+(p.lbl.size?' · '+p.lbl.size+' px':'')+'</td></tr>';
  if(p.opac!=null) h+='<tr><td>Opacidade</td><td>'+Math.round(p.opac*100)+'%</td></tr>';
  h+='</tbody></table>';

  const itens=(p.rend&&p.rend.itens)||(p.ras&&p.ras.classes)||null;
  if(itens&&itens.length){
    h+='<div class="qs-scroll" style="margin-top:7px"><table class="qs-tbl"><thead><tr>'+
       '<th>Cor</th><th>'+(p.rend&&p.rend.modo==='cat'?'Valor':'Faixa')+'</th><th>Rótulo</th></tr></thead><tbody>'+
       itens.slice(0,300).map(c=>'<tr><td><i class="qs-sw" style="background:'+(c.color||'#888')+'"></i></td>'+
        '<td>'+qsEsc(c.value!==undefined?c.value:(c.min+' – '+c.max))+'</td>'+
        '<td>'+qsEsc(c.label||'')+'</td></tr>').join('')+
       '</tbody></table></div>';
    if(itens.length>300) h+='<div class="hint">mostrando 300 de '+itens.length+' classes</div>';
  }else if(p.rend&&p.rend.base){
    const b=p.rend.base;
    h+='<div class="hint" style="margin-top:6px">Símbolo: <i class="qs-sw" style="background:'+(b.color||'#888')+'"></i> '+
       (b.stroke?' contorno <i class="qs-sw" style="background:'+b.stroke+'"></i>':'')+
       (b.weight!=null?' · '+b.weight+' px':'')+(b.hatch&&b.hatch!=='solid'?' · '+b.hatch:'')+'</div>';
  }
  h+='</div>';
  if(incompat) h+='<div class="qs-err">Este é um '+(p.kind==='raster'?'estilo de RASTER':'estilo VETORIAL')+
    ' e a camada escolhida é '+(alvo.tipo==='raster'?'um raster':'um vetor')+'. Escolha outro destino.</div>';
  if(p.gtype&&alvo&&alvo.tipo==='vetor'&&p.gtype!==alvo.obj.gtype)
    h+='<div class="qs-warn">O estilo é de <b>'+p.gtype+'</b> e a camada é <b>'+alvo.obj.gtype+
       '</b>. Cor e contorno se aplicam; o que for específico da outra geometria será ignorado.</div>';
  if(p.rend&&p.rend.campo&&alvo&&alvo.tipo==='vetor'){
    const c=qsAchaCampo(alvo.obj,p.rend.campo);
    if(!c) h+='<div class="qs-warn">O campo <b>'+qsEsc(p.rend.campo)+'</b> não existe nesta camada — as classes não serão aplicadas.</div>';
    else if(c!==p.rend.campo) h+='<div class="qs-ok">Campo <b>'+qsEsc(p.rend.campo)+'</b> será casado com <b>'+qsEsc(c)+'</b>.</div>';
  }
  (p.avisos||[]).forEach(a=>h+='<div class="qs-warn">'+qsEsc(a)+'</div>');
  box.innerHTML=h;
  opts.style.display='';
  bg.querySelector('#qsOpLbl').disabled=!p.lbl;
  bg.querySelector('#qsOpOpa').disabled=(p.opac==null);
  bt.disabled=!!incompat;
}
function qsAplicarAgora(){
  const alvo=qsAlvo(), p=QS.parsed;
  if(!alvo||!p) return;
  const g=id=>document.getElementById(id);
  const rel=qsAplica(alvo,p,{
    simbologia:g('qsOpSym').checked, rotulos:g('qsOpLbl').checked, opacidade:g('qsOpOpa').checked});
  /* o painel de propriedades pode estar aberto sobre a mesma camada */
  try{ if(typeof lpLayer!=='undefined'&&lpLayer&&alvo.tipo==='vetor'&&lpLayer.id===alvo.obj.id){
    if(typeof lpSyncCtrl==='function')lpSyncCtrl();
    if(typeof renderLpClasses==='function')renderLpClasses();
    if(typeof lpFillLabels==='function')lpFillLabels(alvo.obj);
  } }catch(e){}
  const n=rel.linhas.length;
  qsMsg(n?rel.linhas.join(' '):'nada foi alterado');
  toast('Estilo aplicado em "'+alvo.nome+'"'+(rel.avisos.length?' · '+rel.avisos.length+' aviso(s)':''));
  try{ cmdLog('Estilo QGIS "'+QS.nomeArq+'" → "'+alvo.nome+'": '+rel.linhas.join(' '),'ok'); }catch(e){}
  qsRender();
  /* vários .qml soltos de uma vez: o próximo da fila entra sozinho */
  if(QS._fila&&QS._fila.length){
    const prox=QS._fila.shift();
    setTimeout(()=>{ qsCarrega(prox); toast('Próximo estilo: '+prox.name); },350);
  }
}
async function qsExporta(){
  const alvo=qsAlvo();
  if(!alvo){ toast('Escolha a camada'); return; }
  if(alvo.tipo==='raster'){ toast('A exportação .qml existe para camadas vetoriais'); return; }
  if(typeof qmlStyle!=='function'){ toast('Escritor de .qml indisponível'); return; }
  const nome=String(alvo.nome).replace(/[^\w.-]/g,'_')+'.qml';
  await download(new Blob([qmlStyle(alvo.obj)],{type:'text/xml'}), nome);
}
/* ============================================================================
   LIGAÇÕES COM O RESTANTE DO CCMGIS — todas por envelopamento, sem editar
   nenhuma função existente.
   ========================================================================== */

/* 1) Importação: o .qml deixa de cair em "formato não reconhecido".
   handleFiles já faz [...fileList] logo na entrada, então devolver um array
   com o resto dos arquivos é compatível com todos os chamadores. */
(function(){
  const base=window.handleFiles;
  if(typeof base!=='function') return;
  window.handleFiles=async function(fileList){
    const files=[...(fileList||[])];
    const qml=files.filter(f=>/\.qml$/i.test(f.name||''));
    const resto=files.filter(f=>!/\.qml$/i.test(f.name||''));
    let r;
    if(resto.length||!qml.length) r=await base.call(this,resto);
    if(qml.length){
      /* Vários .qml de uma vez: o primeiro abre a janela; os demais entram na
         fila e são casados pelo nome, um a um. */
      QS._fila=qml.slice(1);
      qsAbrir(null,qml[0]);
      if(QS._fila.length) toast(qml.length+' arquivos .qml — aplique um e o próximo será oferecido');
    }
    return r;
  };
})();

/* 2) Propriedades da camada › Simbologia: o botão fica onde o usuário já
   procura estilo, e abre a janela com aquela camada pré-selecionada. */
(function(){
  const base=window.openLayerProps;
  if(typeof base!=='function') return;
  window.openLayerProps=function(L){
    const r=base.apply(this,arguments);
    try{ qsInjetaBotao(L); }catch(e){ console.warn('estilo QGIS na aba:',e); }
    return r;
  };
})();
function qsInjetaBotao(L){
  const pane=document.getElementById('lpPaneSym'); if(!pane) return;
  let box=document.getElementById('lpQsBox');
  if(!box){
    box=document.createElement('div');
    box.className='lp-cls-ctrl'; box.id='lpQsCtrl';
    box.innerHTML='<label class="field">Estilo no padrão do QGIS</label>'+
      '<div id="lpQsBox">'+
        '<button class="tbtn" type="button" id="lpQsImp">⇧ Importar .qml</button>'+
        '<button class="tbtn" type="button" id="lpQsExp">⇩ Exportar .qml</button>'+
      '</div>'+
      '<div class="hint" style="margin-top:4px"><button type="button" class="gm-prop-info" data-prop-help="" aria-label="Ajuda: Estilo QGIS" aria-expanded="false"><span aria-hidden="true">i</span><span hidden>O mesmo arquivo que o QGIS grava em Camada › Propriedades › Estilo › Salvar. '+
      'Traz símbolo, classes por atributo, rótulos e opacidade.</span></button></div>';
    pane.insertBefore(box,pane.firstChild);
  }
  const imp=document.getElementById('lpQsImp'), exp=document.getElementById('lpQsExp');
  if(imp) imp.onclick=()=>{ qsAbrir('L'+L.id); setTimeout(()=>qsEscolheArquivo(),80); };
  if(exp) exp.onclick=async()=>{
    if(typeof qmlStyle!=='function'){ toast('Escritor de .qml indisponível'); return; }
    await download(new Blob([qmlStyle(L)],{type:'text/xml'}),
      String(L.name).replace(/[^\w.-]/g,'_')+'.qml');
  };
}

/* 3) Faixa GIS › Camadas */
(function(){
  const ICON='estilo-qgis';
  if(typeof RIB_SVG!=='undefined'&&typeof _alagisIcon==='function'){
    try{
      RIB_SVG[ICON]=_alagisIcon('#0891B2',
        '<path d="M16 4c6.6 0 12 4.7 12 10.5 0 3.9-3.2 6.5-7 6.5h-2.4c-1.6 0-2.9 1.3-2.9 2.9 0 .7.3 1.3.7 1.8.4.5.7 1.1.7 1.8 0 1.4-1.2 2.5-2.6 2.5C8.2 30 4 23.9 4 16.5 4 9.6 9.4 4 16 4z" fill="@" opacity=".16"/>'+
        '<path d="M16 4c6.6 0 12 4.7 12 10.5 0 3.9-3.2 6.5-7 6.5h-2.4c-1.6 0-2.9 1.3-2.9 2.9 0 .7.3 1.3.7 1.8.4.5.7 1.1.7 1.8 0 1.4-1.2 2.5-2.6 2.5C8.2 30 4 23.9 4 16.5 4 9.6 9.4 4 16 4z" stroke="@" stroke-width="1.8"/>'+
        '<circle cx="10" cy="12" r="1.9" fill="@"/><circle cx="16" cy="9" r="1.9" fill="@" opacity=".6"/>'+
        '<circle cx="22" cy="12.5" r="1.9" fill="@" opacity=".35"/>');
    }catch(e){}
  }
  function garante(){
    if(typeof CATS==='undefined') return;
    const cat=CATS.find(c=>c.id==='gis'); if(!cat||!Array.isArray(cat.grupos)) return;
    let g=cat.grupos.find(x=>x.label==='Camadas')||cat.grupos[0];
    if(!g) return;
    g.it=g.it||[];
    if(!g.it.some(i=>i&&i.ic===ICON))
      g.it.push({ic:ICON,nome:'Estilo QGIS',act:()=>{
        const L=(typeof activeLayer==='function')?activeLayer():null;
        qsAbrir(L?'L'+L.id:null);
      }});
  }
  const base=window.ribbonBuild;
  if(typeof base==='function'){
    window.ribbonBuild=function(){ try{ garante(); }catch(e){} return base.apply(this,arguments); };
  }
  const instalar=()=>{ try{ if(typeof ribbonBuild==='function') ribbonBuild(); }catch(e){} };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',instalar,{once:true});
  else setTimeout(instalar,0);
})();

/* 4) API pública — mesma prática de mdeAbrePainel/mdeBaixaArea: quem precisar
   ler um .qml de outro lugar do CCMGIS usa estas duas. */
window.qsParse=qsParse;
window.qsAplica=qsAplica;
window.qsAlvos=qsAlvos;
})();
