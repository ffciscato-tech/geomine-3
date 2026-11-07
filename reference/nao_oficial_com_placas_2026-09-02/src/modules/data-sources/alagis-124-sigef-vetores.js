
/* ============================================================================
   SIGEF · INCRA — download dos vetores na área, no padrão da ANM

   Por que não funcionava: o download "Incra · imóveis/propriedades" tentava
   três endpoints, e os três estão fora do ar —
     acervofundiario.incra.gov.br/geoserver/ows ....... HTTP 404
     geoportal.incra.gov.br/geoserver/ows (WFS) ....... sem resposta
     acervofundiario.incra.gov.br/i3geo/ogc.php ....... sem resposta
   e o Acervo Fundiário passou a exigir login gov.br. Como os três são tentados
   em sequência com 45 s de espera cada, a consulta demorava minutos para
   terminar em "catálogo vetorial do Incra indisponível".

   O SIGEF continua publicado, e aberto: geoportal.incra.gov.br/geoserver/ows
   serve a camada geonode:sigef_geo por WFS, com Access-Control-Allow-Origin
   igual a "*" — ou seja, funciona com o CCMGIS aberto em file://.

   Bloco ADITIVO: acrescenta a linha do SIGEF ao painel de vetores federais.
   Nada do que existia é alterado.
   ========================================================================== */
(function(){
'use strict';
if(window.SIGEFV){ console.info('[SIGEF] já instalado'); return; }
window.SIGEFV=1;

const WFS='https://geoportal.incra.gov.br/geoserver/ows';
const TIPO='geonode:sigef_geo';
const TETO=20000;          /* acima disto o navegador sofre — pede confirmação */
const PAGINA=1000;

const CSS=`
#sgfRow{display:grid;gap:6px;margin-top:2px;padding-top:8px;border-top:1px solid #b9cde0}
#sgfRow .sgf-tit{display:flex;align-items:center;gap:7px;font-weight:800;font-size:12px;color:#13283a}
#sgfRow .sgf-tag{font:700 9.5px/1 var(--mono,monospace);background:#276b42;color:#fff;
  border-radius:20px;padding:3px 7px;letter-spacing:.4px}
#sgfBaixar{background:#276b42!important;color:#fff!important;font-weight:800}
#sgfBaixar:disabled{opacity:.55}
#sgfNota{font-size:10px;line-height:1.35;color:#4a6076}
`;
(function(){ const s=document.createElement('style'); s.id='sgf-css'; s.textContent=CSS;
  document.head.appendChild(s); })();

const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const msg=t=>{ const e=$('sgfOut'); if(e) e.innerHTML=t; };

async function pega(url,ms){
  const ctl=new AbortController(), tm=setTimeout(()=>ctl.abort(),ms||60000);
  try{
    const r=await fetch(url,{signal:ctl.signal});
    if(!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  } finally { clearTimeout(tm); }
}
function urlWFS(bbox,count,startIndex){
  const p=new URLSearchParams({service:'WFS',version:'2.0.0',request:'GetFeature',
    typeNames:TIPO,outputFormat:'application/json',srsName:'EPSG:4326',
    bbox:bbox.join(',')+',EPSG:4326',count:String(count)});
  if(startIndex) p.set('startIndex',String(startIndex));
  return WFS+'?'+p;
}

/* Caixa da área escolhida, em WGS84 — o mesmo seletor que os demais vetores
   federais já usam (#fvFederalArea). */
function caixa(){
  const sel=$('fvFederalArea'), id=sel?sel.value:'vista';
  if(id&&id!=='vista'){
    const L=(S.layers||[]).find(x=>String(x.id)===String(id));
    if(L){
      let w=Infinity,s=Infinity,e=-Infinity,n=-Infinity;
      const add=p=>{ if(!Array.isArray(p)) return;
        if(typeof p[0]==='number'&&typeof p[1]==='number'){
          let q; try{ q=toWGS(L.crs||S.workCRS,p[0],p[1]); }catch(_){ q=[p[0],p[1]]; }
          if(Number.isFinite(q[0])&&Number.isFinite(q[1])){
            w=Math.min(w,q[0]); e=Math.max(e,q[0]); s=Math.min(s,q[1]); n=Math.max(n,q[1]);
          }
        } else p.forEach(add); };
      (L.features||[]).forEach(f=>add(f.geom));
      if(Number.isFinite(w)) return {bbox:[w,s,e,n],limite:L};
    }
  }
  const b=map.getBounds();
  return {bbox:[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()],limite:null};
}

async function baixar(){
  const bt=$('sgfBaixar'); if(!bt) return;
  const c=caixa();
  const vista=map.getCenter(), zoom=map.getZoom();
  bt.disabled=true;
  try{
    /* numberMatched vem na primeira resposta: dá para dizer o tamanho antes de
       puxar tudo, em vez de deixar o usuário esperando às cegas. */
    msg('Consultando o SIGEF na área…');
    showLoad('SIGEF: contando parcelas…');
    const cab=await pega(urlWFS(c.bbox,1,0),45000);
    const total=Number(cab.numberMatched);
    if(!Number.isFinite(total)||total<=0){
      hideLoad(); msg('<b>Nenhuma parcela do SIGEF nesta área.</b>');
      toast('SIGEF: nada na área'); return;
    }
    if(total>TETO){
      hideLoad();
      if(!confirm('O SIGEF tem '+total.toLocaleString('pt-BR')+' parcelas nesta área.\n'+
        'Baixar tudo pode pesar bastante. Continuar?')){ msg('Cancelado.'); return; }
      showLoad('SIGEF: baixando…');
    }
    const feats=[];
    for(let off=0; off<total; off+=PAGINA){
      showLoad('SIGEF: '+Math.min(off+PAGINA,total).toLocaleString('pt-BR')+' de '+total.toLocaleString('pt-BR')+'…');
      msg('Baixando <b>'+Math.min(off+PAGINA,total).toLocaleString('pt-BR')+'</b> de '+total.toLocaleString('pt-BR')+' parcelas…');
      const g=await pega(urlWFS(c.bbox,PAGINA,off),90000);
      const lote=(g.features||[]).filter(f=>f&&f.geometry);
      feats.push(...lote);
      if(lote.length<PAGINA) break;
      await new Promise(r=>setTimeout(r,0));
    }
    hideLoad();
    if(!feats.length){ msg('<b>Nenhuma parcela utilizável na área.</b>'); return; }

    const antes=S.layers.length;
    importGeoJSON({type:'FeatureCollection',features:feats},'SIGEF — parcelas certificadas (Incra)');
    const L=S.layers[S.layers.length-antes-1]||S.layers[0];
    estiliza(L);
    let recortadas=0;
    if(c.limite && typeof window.alagisRecortaPorPoligono==='function'){
      const n0=(L.features||[]).length;
      try{ window.alagisRecortaPorPoligono(L,c.limite); recortadas=n0-(L.features||[]).length; }
      catch(e){ console.warn('Recorte SIGEF',e); }
    }
    try{ drawLayer(L); refreshUI(); }catch(e){}
    try{ map.setView(vista,zoom); }catch(e){}

    const st={};
    (L.features||[]).forEach(f=>{ const v=String((f.props||{}).status||'—'); st[v]=(st[v]||0)+1; });
    msg('<b>'+(L.features||[]).length.toLocaleString('pt-BR')+' parcelas</b> em “'+esc(L.name)+'”.'+
      (recortadas?'<br>'+recortadas.toLocaleString('pt-BR')+' fora do polígono foram descartadas.':'')+
      '<br>'+Object.entries(st).sort((a,b)=>b[1]-a[1]).slice(0,6)
        .map(([k,v])=>'· '+esc(k)+': '+v.toLocaleString('pt-BR')).join('<br>')+
      '<br><span style="font-size:10px">Fonte: Incra · SIGEF (geonode:sigef_geo) por WFS.</span>');
    toast('SIGEF: '+(L.features||[]).length+' parcela(s) importada(s)');
    try{ cmdLog('SIGEF: '+(L.features||[]).length+' parcelas · bbox '+c.bbox.map(v=>v.toFixed(3)).join(', '),'ok'); }catch(e){}
  }catch(e){
    hideLoad();
    const m=(e&&e.name==='AbortError')?'o serviço não respondeu a tempo':(e.message||String(e));
    msg('<b style="color:#c0392b">Não foi possível baixar.</b><br>'+esc(m));
    toast('SIGEF: '+m);
  } finally { bt.disabled=false; }
}

/* Categorizado por status: é o que distingue parcela titulada de em análise,
   e o campo vem preenchido em todas as feições do serviço. */
function estiliza(L){
  if(!L||!L.sym) return;
  const cores={TITULACAO:'#1b7a3d',CERTIFICADA:'#276b42',ANALISE:'#f0a500',
    CANCELADA:'#b03a2e',SUSPENSA:'#8e44ad'};
  const vs=[...new Set((L.features||[]).map(f=>String((f.props||{}).status||'—')))];
  L.sym.mode='cat'; L.sym.field='status';
  L.sym.cats=vs.map((v,i)=>({value:v,
    color:cores[String(v).toUpperCase()]||['#276b42','#3d7ea6','#a1683a','#6a3dad'][i%4],
    count:(L.features||[]).filter(f=>String((f.props||{}).status||'—')===v).length}));
  L.sym.fill=0.22; L.sym.weight=1.4;
  L.sourceOfficial=true; L.sourceTheme='sigef';
}

function instalar(){
  const box=$('fvFederalDireto');
  if(!box || $('sgfRow')) return;
  const row=document.createElement('div');
  row.id='sgfRow';
  row.innerHTML=
    '<div class="sgf-tit">SIGEF · parcelas certificadas <span class="sgf-tag">INCRA</span></div>'+
    '<button class="mini" id="sgfBaixar" type="button" title="Baixar do serviço oficial do Incra as parcelas do SIGEF que intersectam a área escolhida acima">⭳ Baixar parcelas do SIGEF na área</button>'+
    '<div class="hout" id="sgfOut">Usa a mesma área escolhida acima.</div>'+
    '<div id="sgfNota">Os temas <b>Incra · assentamentos</b> e <b>Incra · imóveis/propriedades</b> da lista acima estão fora do ar: '+
    'os endpoints do Acervo Fundiário saíram e o acervo passou a exigir login gov.br. O SIGEF é a via aberta hoje.</div>';
  const ref=$('fvFederalOut');
  if(ref&&ref.parentNode===box) box.insertBefore(row,ref.nextSibling);
  else box.appendChild(row);
  $('sgfBaixar').addEventListener('click',()=>baixar());
}
window.sigefBaixaArea=baixar;
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',instalar,{once:true});
else instalar();
setTimeout(instalar,800);
/* o painel de Meio Ambiente é montado sob demanda */
document.addEventListener('click',()=>setTimeout(instalar,120),{passive:true});
})();
