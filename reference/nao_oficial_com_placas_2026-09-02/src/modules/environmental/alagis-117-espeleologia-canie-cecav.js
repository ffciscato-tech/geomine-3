
/* Espeleologia oficial: o cadastro nacional é o CANIE, gerido pelo
   CECAV/ICMBio. A consulta lê somente a caixa da tela ou do polígono e,
   quando necessário, recorta exatamente os pontos pela máscara escolhida. */
(()=>{
  'use strict';
  const PAGINA='https://www.gov.br/icmbio/pt-br/assuntos/centros-de-pesquisa/cavernas/cadastro-nacional-de-informacoes-espeleologicas/canie';
  const DADOS='https://www.gov.br/icmbio/pt-br/assuntos/dados_geoespaciais';
  const WFS='https://geoservicos.inde.gov.br/geoserver/ICMBio/ows';
  const TIPO='ICMBio:canie_052026_p';
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function poligonoEscolhido(){
    const id=document.querySelector('#secAmbOrgao #aoArea')?.value||'vista';
    return id==='vista'?null:(S.layers||[]).find(L=>String(L.id)===String(id)&&L.gtype==='polygon');
  }
  function bboxCamada(L){
    let w=Infinity,s=Infinity,e=-Infinity,n=-Infinity;
    const add=p=>{if(!Array.isArray(p))return;if(typeof p[0]==='number'&&typeof p[1]==='number'){
      let q;try{q=toWGS(L.crs||S.workCRS,+p[0],+p[1]);}catch(_){q=[+p[0],+p[1]];}
      if(isFinite(q[0])&&isFinite(q[1])){w=Math.min(w,q[0]);s=Math.min(s,q[1]);e=Math.max(e,q[0]);n=Math.max(n,q[1]);}
    }else p.forEach(add);};
    (L.features||[]).forEach(f=>add(f.geom));return isFinite(w)?[w,s,e,n]:null;
  }
  function contexto(){
    const limite=poligonoEscolhido();
    if(limite){const b=bboxCamada(limite);if(b)return {limite,bbox:b,rotulo:'o polígono “'+limite.name+'”'};}
    const z=map.getBounds();return {limite:null,bbox:[z.getWest(),z.getSouth(),z.getEast(),z.getNorth()],rotulo:'a extensão visível da tela'};
  }
  function resultado(btn,texto,classe=''){
    let out=btn.parentElement?.querySelector('.ao-espeleo-result');
    if(!out){out=document.createElement('div');out.className='ao-espeleo-result';btn.insertAdjacentElement('afterend',out);}
    out.className='ao-espeleo-result '+classe;out.innerHTML=texto;
  }
  async function consulta(c){
    const p=new URLSearchParams({service:'WFS',version:'1.0.0',request:'GetFeature',typeName:TIPO,
      outputFormat:'application/json',srsName:'EPSG:4326',maxFeatures:'10000',bbox:c.bbox.join(',')+',EPSG:4326'});
    const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),120000);
    try{
      const r=await fetch(WFS+'?'+p,{signal:ctl.signal});
      if(!r.ok)throw new Error('servidor ICMBio/INDE respondeu HTTP '+r.status);
      const g=await r.json();if(!g||!Array.isArray(g.features))throw new Error('resposta vetorial inválida');return g;
    }finally{clearTimeout(tm);}
  }
  function removeCamada(L){
    try{if(L?.llayer)map.removeLayer(L.llayer);}catch(_){ }
    const i=(S.layers||[]).indexOf(L);if(i>=0)S.layers.splice(i,1);
    try{refreshUI();}catch(_){ }
  }
  async function baixar(btn){
    const c=contexto(),view=map.getCenter(),zoom=map.getZoom(),old=btn.textContent;
    btn.disabled=true;btn.textContent='Consultando cavidades CANIE…';
    resultado(btn,'Consultando o <b>WFS oficial do ICMBio/INDE</b> somente em '+esc(c.rotulo)+'…');
    try{
      const gj=await consulta(c),recebidas=gj.features.length;
      if(!recebidas){
        resultado(btn,'Nenhuma cavidade cadastrada no CANIE foi encontrada em '+esc(c.rotulo)+'.','empty');
        toast('Espeleologia: nenhuma cavidade CANIE encontrada na área');return;
      }
      const ids=new Set((S.layers||[]).map(L=>L.id));
      importGeoJSON(gj,'Espeleologia — cavidades naturais (CANIE/CECAV)');
      const L=(S.layers||[]).find(x=>!ids.has(x.id));
      if(!L)throw new Error('não foi possível criar a camada no projeto');
      L.color='#8b2e5f';L.weight=1.5;L.size=6;L.sourceOfficial=true;L.sourceTheme='espeleologia-canie';L.sourceUrl=PAGINA;
      L.sym=Object.assign(L.sym||{},{mode:'single',color:'#8b2e5f',stroke:'#5b173c',fill:'#d95a9a',fillOpacity:.8,weight:1.5,size:6});
      if(c.limite&&typeof window.alagisRecortaPorPoligono==='function')window.alagisRecortaPorPoligono(L,c.limite);
      const n=(L.features||[]).length;
      if(!n){
        removeCamada(L);
        resultado(btn,'A consulta encontrou registros na caixa envolvente, mas <b>nenhuma cavidade ficou dentro do polígono escolhido</b>. Nenhuma camada vazia foi criada.','empty');
        toast('Espeleologia: nenhuma cavidade dentro do polígono');return;
      }
      try{drawLayer(L);refreshUI();}catch(_){ }
      resultado(btn,'<b>'+n.toLocaleString('pt-BR')+' cavidade(s)</b> do CANIE carregada(s) e '+
        (c.limite?'recortada(s) exatamente pelo polígono escolhido.':'mantida(s) na extensão visível da tela.')+
        '<br><a href="'+PAGINA+'" target="_blank" rel="noopener noreferrer">Fonte oficial: CANIE — CECAV/ICMBio ↗</a>','ok');
      toast('Espeleologia: '+n.toLocaleString('pt-BR')+' cavidades CANIE carregadas');
    }catch(err){
      const m=err?.name==='AbortError'?'o servidor não respondeu em 2 minutos':(err?.message||String(err));
      resultado(btn,'Não foi possível consultar o CANIE: '+esc(m)+'.<br><a href="'+DADOS+'" target="_blank" rel="noopener noreferrer">Abrir os geosserviços oficiais do ICMBio ↗</a>','empty');
      toast('CANIE: '+m);
    }finally{btn.disabled=false;btn.textContent=old;try{map.setView(view,zoom);}catch(_){ }}
  }
  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('#secAmbOrgao [data-ao-download="canie"]');if(!btn)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();baixar(btn);
  },true);
})();
