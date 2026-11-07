
/* Consulta espacial oficial da Funai. A página institucional aponta para o
   GeoServer Funai e para Funai:tis_poligonais; o CCMGIS consulta só a caixa
   necessária e, quando há polígono, aplica ainda o recorte geométrico exato. */
(()=>{
  'use strict';
  const PAGINA='https://www.gov.br/funai/pt-br/atuacao/terras-indigenas/geoprocessamento-e-mapas';
  const WFS='https://geoserver.funai.gov.br/geoserver/Funai/ows';
  const TIPO='Funai:tis_poligonais';
  /* Espelho federal sincronizado da própria base Funai. A consulta segue o
     mesmo transporte da ANM: ArcGIS REST normal e fallback por JSONP quando
     o Chrome bloqueia a resposta por CORS em arquivos HTML locais. */
  const ARCGIS='https://pamgia.ibama.gov.br/server/rest/services/BasesSincronizadas/lim_terra_indigena_funai_a/MapServer/0/query';
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
    let out=btn.parentElement?.querySelector('.ao-funai-result');
    if(!out){out=document.createElement('div');out.className='ao-funai-result';btn.insertAdjacentElement('afterend',out);}
    out.className='ao-funai-result '+classe;out.innerHTML=texto;
  }
  function funaiJsonp(url){
    return new Promise((resolve,reject)=>{
      const cb='__alagisFunai_'+Date.now().toString(36)+Math.random().toString(36).slice(2);
      const sc=document.createElement('script'),u=new URL(url);
      u.searchParams.set('f','json');u.searchParams.set('callback',cb);
      const fim=()=>{try{delete window[cb];}catch(_){window[cb]=undefined;}sc.remove();clearTimeout(tm);};
      window[cb]=v=>{fim();resolve(v);};
      sc.onerror=()=>{fim();reject(new Error('o serviço vetorial sincronizado da Funai não respondeu'));};
      const tm=setTimeout(()=>{fim();reject(new Error('tempo esgotado no serviço vetorial da Funai'));},60000);
      sc.src=u.href;document.head.appendChild(sc);
    });
  }
  async function funaiArcRequest(params){
    const u=new URL(ARCGIS);
    Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,String(v)));
    u.searchParams.set('f','json');
    try{
      const r=await fetch(u.href,{mode:'cors',cache:'no-store'});
      if(!r.ok)throw new Error('Funai HTTP '+r.status);
      const j=await r.json();if(j?.error)throw new Error(j.error.message||'consulta rejeitada');
      return j;
    }catch(erroCors){
      const j=await funaiJsonp(u.href);
      if(j?.error)throw new Error(j.error.message||'consulta rejeitada');
      return j;
    }
  }
  async function consulta(c){
    return funaiArcRequest({where:'1=1',geometry:c.bbox.join(','),
      geometryType:'esriGeometryEnvelope',inSR:4326,
      spatialRel:'esriSpatialRelIntersects',outFields:'*',
      returnGeometry:true,returnZ:false,returnM:false,outSR:4674,
      geometryPrecision:8});
  }
  function removeCamada(L){
    try{if(L?.llayer)map.removeLayer(L.llayer);}catch(_){ }
    const i=(S.layers||[]).indexOf(L);if(i>=0)S.layers.splice(i,1);
    try{refreshUI();}catch(_){ }
  }
  async function baixar(btn){
    const c=contexto(),view=map.getCenter(),zoom=map.getZoom(),old=btn.textContent;
    btn.disabled=true;btn.textContent='Consultando terras indígenas…';
    resultado(btn,'Consultando a <b>base oficial da Funai</b> pelo serviço federal sincronizado, somente em '+esc(c.rotulo)+'…');
    try{
      const dados=await consulta(c),recebidas=(dados.features||[]).length;
      if(!recebidas){
        resultado(btn,'Nenhuma feição de terra indígena foi encontrada em '+esc(c.rotulo)+'.','empty');
        toast('Funai: nenhuma terra indígena encontrada na área consultada');return;
      }
      const features=(dados.features||[]).filter(x=>x?.geometry?.rings)
        .map(x=>({geom:x.geometry.rings,multi:true,props:x.attributes||{}}));
      if(!features.length)throw new Error('a resposta não contém geometrias poligonais válidas');
      const fields=(dados.fields||[]).map(f=>({name:f.name,
        type:/Integer|Double|Single|OID/i.test(f.type)?'N':'C',
        length:f.length||100,decimal:/Double|Single/i.test(f.type)?6:0,alias:f.alias||f.name}));
      const L=addLayer({name:'Funai — terras indígenas',gtype:'polygon',features,
        fields:fields.length?fields:[{name:'OBJECTID',type:'N',length:12,decimal:0}],
        crs:'EPSG:4674',color:'#8b5a2b',src:{url:ARCGIS,provider:'Funai / base sincronizada federal',
          official:true,importedAt:new Date().toISOString(),extent:c.bbox.join(',')}});
      if(!L)throw new Error('não foi possível criar a camada no projeto');
      L.color='#8b5a2b';L.weight=1.5;L.fill=.28;L.sourceOfficial=true;L.sourceTheme='funai';
      L.sourceUrl=PAGINA;L._funai={fonte:'Funai · Terras Indígenas',servico:ARCGIS,
        origemWfs:WFS,tipoWfs:TIPO,recorte:c.limite?'polígono':'extensão visível'};
      L.sym=Object.assign(L.sym||{},{color:'#8b5a2b',stroke:'#8b5a2b',fill:'#f0cf91',fillOpacity:.28,weight:1.5});
      if(c.limite&&typeof window.alagisRecortaPorPoligono==='function')window.alagisRecortaPorPoligono(L,c.limite);
      const n=(L.features||[]).length;
      if(!n){
        removeCamada(L);
        resultado(btn,'A consulta encontrou feições na caixa envolvente, mas <b>nenhuma ficou dentro do polígono escolhido</b>. Nenhuma camada vazia foi criada.','empty');
        toast('Funai: nenhuma terra indígena dentro do polígono');return;
      }
      try{drawLayer(L);refreshUI();}catch(_){ }
      resultado(btn,'<b>'+n.toLocaleString('pt-BR')+' feição(ões)</b> da Funai carregadas e '+
        (c.limite?'recortadas exatamente pelo polígono escolhido.':'mantidas na extensão visível da tela.')+
        (dados.exceededTransferLimit?'<br><b>Atenção:</b> aproxime o mapa para consultar todas as feições desta área.':'')+
        '<br><a href="'+PAGINA+'" target="_blank" rel="noopener noreferrer">Fonte oficial: Terras Indígenas — dados geoespaciais e mapas ↗</a>','ok');
      toast('Funai: '+n.toLocaleString('pt-BR')+' terras indígenas carregadas');
    }catch(err){
      const m=err?.name==='AbortError'?'o servidor não respondeu em 2 minutos':(err?.message||String(err));
      resultado(btn,'Não foi possível consultar a Funai: '+esc(m)+'.<br><a href="'+PAGINA+'" target="_blank" rel="noopener noreferrer">Abrir a fonte oficial ↗</a>','empty');
      toast('Funai: '+m);
    }finally{
      btn.disabled=false;btn.textContent=old;try{map.setView(view,zoom);}catch(_){ }
    }
  }
  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('#secAmbOrgao [data-ao-download="funai"]');if(!btn)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();baixar(btn);
  },true);
})();
