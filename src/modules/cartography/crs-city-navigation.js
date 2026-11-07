/* EPSG consultation and city navigation. Never reassign a CRS during a search. */
(function(){
  'use strict';
  const data=window.GeoMineCityCatalog, badge=document.getElementById('roCRS');
  if(!data||!badge)return;
  const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const index=data.cities.map(city=>({city,key:normalize(city[1]+' '+city[2])}));
  function search(query,uf=''){
    const q=normalize(query),words=q.split(' ');
    if(q.length<2)return [];
    return index.filter(r=>(!uf||r.city[2]===uf)&&words.every(w=>r.key.includes(w)))
      .sort((a,b)=>Number(normalize(b.city[1])===q)-Number(normalize(a.city[1])===q)||Number(b.key.startsWith(q))-Number(a.key.startsWith(q))||a.key.localeCompare(b.key,'pt-BR')).map(r=>r.city);
  }
  let root=null,preview=null,resize=null;
  const style=document.createElement('style');
  style.textContent=`
    body.alagis3 .readout #roCRS{display:inline-flex!important}
    #gmCrsNavigator{position:fixed;inset:0;z-index:12000;background:#0008;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box}
    #gmCrsNavigator *{box-sizing:border-box}
    #gmCrsNavigator .gm-crs-panel{width:min(1000px,100%);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;background:var(--panel,#102536);color:var(--ink,#e5edf4);border:1px solid #7891a6;border-radius:12px;overflow:hidden;box-shadow:0 12px 48px #0005}
    #gmCrsNavigator header,#gmCrsNavigator footer{padding:12px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;flex-shrink:0;background:var(--bg,#0d2030)}
    #gmCrsNavigator h2{font-size:18px;margin:0;flex:1}
    #gmCrsNavigator .gm-crs-body{overflow:auto;min-height:0;padding:16px;display:grid;grid-template-columns:minmax(240px,1fr) minmax(300px,1.25fr);gap:16px}
    #gmCrsNavigator label{display:block;margin:0 0 6px;font-weight:600}
    #gmCrsNavigator select,#gmCrsNavigator input{width:100%;min-height:40px;margin-bottom:12px;padding:8px}
    #gmCrsNavigator button{min-height:38px;padding:8px 12px;cursor:pointer}
    #gmCrsNavigator button,#gmCrsNavigator input,#gmCrsNavigator select{background:var(--bg,#102536);color:var(--ink,#e5edf4);border:1px solid var(--line,#7891a6);border-radius:7px;font:inherit}
    #gmCrsNavigator button:focus-visible,#gmCrsNavigator input:focus-visible,#gmCrsNavigator select:focus-visible{outline:3px solid #f5a619;outline-offset:2px}
    #gmCrsNavigator p{font-size:13px;line-height:1.5;margin:8px 0}
    #gmCrsCityResults{max-height:220px;overflow:auto;display:grid;gap:5px}
    #gmCrsCityResults button{text-align:left;width:100%}
    #gmCrsCityResults button[aria-pressed=true]{outline:2px solid #f5a619}
    #gmCrsPreview{height:340px;min-height:220px;background:#dfeaf0!important;color:#172c3a;border-radius:7px}
    #gmCrsNavigator .gm-crs-primary{background:#f5a619;color:#142331;font-weight:700}
    #gmCrsNavigator .gm-crs-primary:disabled{opacity:.5;cursor:default}
    @media(max-width:700px){#gmCrsNavigator .gm-crs-body{grid-template-columns:1fr}#gmCrsPreview{height:240px}}
    @media(max-height:650px){#gmCrsPreview{height:230px}#gmCrsCityResults{max-height:150px}}
  `;
  document.head.appendChild(style);
  function close(){
    if(!root)return;
    document.removeEventListener('keydown',keys,true);
    resize?.disconnect();resize=null;preview?.remove();preview=null;
    root.remove();root=null;badge.focus();
  }
  function keys(e){
    if(!root)return;
    // Keep application drawing shortcuts out of this independent dialog.
    e.stopImmediatePropagation();
    if(e.key==='Escape'){e.preventDefault();close();return;}
    if(e.key==='Tab'){
      const items=[...root.querySelectorAll('button:not(:disabled),input,select,a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length);
      const first=items[0],last=items.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  }
  function open(){
    if(root){document.getElementById('gmCrsCityQuery').focus();return;}
    document.getElementById('crsMenu')?.classList.remove('on');
    root=document.createElement('div');root.id='gmCrsNavigator';
    root.innerHTML=`<section class="gm-crs-panel" role="dialog" aria-modal="true" aria-labelledby="gmCrsTitle">
      <header><h2 id="gmCrsTitle">Região do EPSG e busca por cidade</h2><button id="gmCrsClose" type="button">Fechar</button></header>
      <div class="gm-crs-body"><div>
        <label for="gmCrsPreviewCode">Consultar região do EPSG</label><select id="gmCrsPreviewCode"></select>
        <p id="gmCrsCurrent"></p><p>Esta consulta não altera o sistema de coordenadas do projeto ou das camadas.</p>
        <label for="gmCrsCityQuery">Cidade brasileira</label><input id="gmCrsCityQuery" type="search" placeholder="Ex.: São Paulo, Adrianópolis…" autocomplete="off">
        <label for="gmCrsCityUF">Estado (opcional)</label><select id="gmCrsCityUF"><option value="">Todos os estados</option></select>
        <p id="gmCrsCityStatus" role="status" aria-live="polite">Digite pelo menos 2 letras.</p><div id="gmCrsCityResults" aria-label="Cidades encontradas"></div>
        <p id="gmCrsCitySource"></p>
      </div><div><div id="gmCrsPreview" aria-label="Mapa de referência da região do EPSG"></div>
        <p id="gmCrsAreaInfo"></p><button id="gmCrsFitArea" type="button">Ver toda a região do EPSG</button>
        <p id="gmCrsCitySelected" role="status"></p><button id="gmCrsCityGo" type="button" class="gm-crs-primary" disabled>Ir para cidade no mapa 2D</button>
      </div></div>
      <footer><span>Configuração:</span><button id="gmCrsChangeProject" type="button">Alterar EPSG do projeto…</button><button id="gmCrsChangeLayer" type="button">Alterar EPSG da camada ativa…</button></footer>
    </section>`;
    document.body.appendChild(root);
    const el=id=>root.querySelector('#'+id),sel=el('gmCrsPreviewCode');
    fillCRSSelect(sel,S.workCRS);
    if(![...sel.options].some(o=>o.value===S.workCRS))sel.add(new Option(CRS_LABELS[S.workCRS]||S.workCRS,S.workCRS));
    sel.value=S.workCRS;
    el('gmCrsCurrent').textContent='Projeto atual: '+S.workCRS+' · '+(CRS_LABELS[S.workCRS]||'');
    el('gmCrsCitySource').textContent=data.edition+' · 5.570 sedes municipais. Busca local, sem envio a serviços externos.';
    [...new Set(data.cities.map(c=>c[2]))].sort().forEach(uf=>el('gmCrsCityUF').add(new Option(uf,uf)));
    preview=L2.map(el('gmCrsPreview'),{zoomControl:true,attributionControl:true,minZoom:0,maxZoom:12});
    L2.geoJSON(data.outline,{style:{color:'#52778a',weight:1,opacity:.9},interactive:false}).addTo(preview);
    preview.attributionControl.addAttribution('Referência: Natural Earth · EPSG '+data.epsgEdition+' · IBGE 2022');
    const areaGroup=L2.layerGroup().addTo(preview);let fitBounds=null,marker=null,chosen=null;
    function showArea(){
      areaGroup.clearLayers();const area=data.areas[sel.value];
      if(!area){fitBounds=null;preview.setView([-14,-52],3);el('gmCrsAreaInfo').textContent='Área de uso indisponível para este código. Mapa de referência do Brasil; nenhum limite foi presumido.';el('gmCrsFitArea').disabled=true;return;}
      const [south,west,north,east]=area.bounds,boxes=west<=east?[[south,west,north,east]]:[[south,west,north,180],[south,-180,north,east]];
      boxes.forEach(([s,w,n,e])=>L2.rectangle([[Math.max(-85,s),w],[Math.min(85,n),e]],{color:'#d38100',weight:2,fillColor:'#f5a619',fillOpacity:.18,interactive:false}).addTo(areaGroup));
      fitBounds=[[Math.max(-85,south),west<=east?west:-180],[Math.min(85,north),west<=east?east:180]];
      preview.fitBounds(fitBounds,{padding:[15,15],maxZoom:7,animate:false});
      el('gmCrsAreaInfo').textContent=sel.value+' · '+area.name+'. Retângulo envolvente da área de uso (não é um limite preciso): '+area.description+'.';el('gmCrsFitArea').disabled=false;
    }
    function results(){
      chosen=null;el('gmCrsCityGo').disabled=true;el('gmCrsCitySelected').textContent='';if(marker){marker.remove();marker=null;}
      const q=el('gmCrsCityQuery').value,rows=search(q,el('gmCrsCityUF').value),list=el('gmCrsCityResults');list.replaceChildren();
      el('gmCrsCityStatus').textContent=normalize(q).length<2?'Digite pelo menos 2 letras.':!rows.length?'Nenhuma cidade encontrada nesta base.':rows.length>60?rows.length+' cidades. Mostrando 60; refine o nome ou escolha o estado.':rows.length+' cidade(s). Escolha uma abaixo.';
      rows.slice(0,60).forEach(c=>{const b=document.createElement('button');b.type='button';b.textContent=c[1]+' — '+c[2];b.setAttribute('aria-pressed','false');b.onclick=()=>{
        chosen=c;list.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
        if(marker)marker.remove();marker=L2.circleMarker([c[3],c[4]],{radius:7,color:'#9a4200',fillColor:'#ffb52e',fillOpacity:1}).addTo(preview);
        preview.setView([c[3],c[4]],6,{animate:false});el('gmCrsCitySelected').textContent=c[1]+' / '+c[2]+' · sede municipal. Ir para a cidade apenas centraliza o mapa; o EPSG continua '+S.workCRS+'.';el('gmCrsCityGo').disabled=false;
      };list.appendChild(b);});
    }
    el('gmCrsCityQuery').oninput=results;el('gmCrsCityUF').onchange=results;sel.onchange=showArea;
    el('gmCrsFitArea').onclick=()=>{if(fitBounds)preview.fitBounds(fitBounds,{padding:[15,15],maxZoom:7});};
    el('gmCrsCityGo').onclick=()=>{if(!chosen)return;const c=chosen;close();if(typeof switchView==='function')switchView('map');map.setView([c[3],c[4]],12,{animate:false});toast('Mapa centralizado em '+c[1]+' / '+c[2]+'. EPSG e camadas preservados.');};
    el('gmCrsClose').onclick=close;root.onclick=e=>{if(e.target===root)close();};
    el('gmCrsChangeProject').onclick=()=>{close();document.getElementById('crsProj').click();};
    el('gmCrsChangeLayer').disabled=!(typeof activeLayer==='function'&&activeLayer());
    el('gmCrsChangeLayer').onclick=()=>{close();document.getElementById('crsLay').click();};
    document.addEventListener('keydown',keys,true);
    resize=new ResizeObserver(()=>{if(preview)preview.invalidateSize({pan:false});});resize.observe(el('gmCrsPreview'));
    showArea();el('gmCrsCityQuery').focus();
  }
  badge.title='Ver região do EPSG, buscar cidade ou alterar CRS';
  badge.onclick=e=>{e.stopPropagation();open();};
  window.GeoMineCrsNavigator=Object.freeze({open,close,search});
})();
