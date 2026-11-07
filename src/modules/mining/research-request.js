/* Preparação de requerimentos no GIS. Não efetua protocolo no REPEM.
   O rascunho pertence ao projeto; a consulta ANM pertence à geometria exata. */
(function(){
'use strict';
const GUIDE='https://www.gov.br/anm/pt-br/assuntos/exploracao-mineral/autorizacao-de-pesquisa/orientacoes/capa';
const SYSTEMS='https://www.gov.br/anm/pt-br/assuntos/exploracao-mineral/sistemas-de-exploracao-mineral';
const fields=[['titulo','Nome do trabalho'],['requerente','Nome / razão social'],['documento','CPF / CNPJ'],
  ['email','E-mail'],['municipio','Município'],['uf','UF'],['substancias','Substâncias minerais'],
  ['uso','Uso pretendido'],['tecnico','Responsável técnico'],['crea','CREA / UF'],['art','ART'],
  ['prazo','Prazo proposto (meses)'],['orcamento','Orçamento estimado (R$)'],
  ['plano','Plano dos trabalhos de pesquisa'],['observacoes','Observações']];
const $=id=>document.getElementById('rp'+id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=3)=>n.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
let query=null,busy=false,epoch=0;
const draft=()=>S.researchRequest||(S.researchRequest={version:1,values:{}});
const layers=()=>S.layers.filter(L=>L.gtype==='polygon'&&L.features?.length);
function selected(){
  const L=layers().find(L=>String(L.id)===$('Layer').value),index=Number($('Feature').value);
  if(!L||!Number.isInteger(index)||!L.features[index])throw Error('Escolha uma camada e uma poligonal.');
  return {L,f:L.features[index],index};
}
function ringOf(geom){
  let g=geom;
  while(Array.isArray(g)&&g.length===1&&Array.isArray(g[0])&&Array.isArray(g[0][0]))g=g[0];
  if(!Array.isArray(g)||!g.length||!g.every(p=>Array.isArray(p)&&typeof p[0]==='number'&&typeof p[1]==='number'))
    throw Error('Escolha uma poligonal única, sem ilhas ou furos. Separe as partes antes de continuar.');
  let r=g.map(p=>[p[0],p[1]]);
  if(r.some(p=>!p.every(Number.isFinite)))throw Error('A poligonal contém coordenadas inválidas.');
  if(r.length>1&&r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1])r.pop();
  if(r.length<3||r.length>2000)throw Error('Use entre 3 e 2.000 vértices na poligonal.');
  return r;
}
function validRing(r){
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const on=(a,b,c)=>Math.abs(cross(a,b,c))<1e-7&&c[0]>=Math.min(a[0],b[0])-1e-8&&c[0]<=Math.max(a[0],b[0])+1e-8&&c[1]>=Math.min(a[1],b[1])-1e-8&&c[1]<=Math.max(a[1],b[1])+1e-8;
  const hits=(a,b,c,d)=>cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
  for(let i=0;i<r.length;i++){
    const a=r[i],b=r[(i+1)%r.length];
    if(Math.hypot(a[0]-b[0],a[1]-b[1])<.001)throw Error('Há vértices consecutivos repetidos ou segmentos menores que 1 mm.');
    for(let j=i+1;j<r.length;j++){
      if(j===i+1||(i===0&&j===r.length-1))continue;
      if(hits(a,b,r[j],r[(j+1)%r.length]))throw Error('A poligonal possui cruzamentos ou vértices repetidos. Corrija a geometria.');
    }
    const c=r[(i+2)%r.length];
    if(on(a,b,c)&&Math.hypot(c[0]-b[0],c[1]-b[1])>.001)throw Error('A poligonal possui segmentos sobrepostos.');
  }
}
function geometry(L,f){
  const source=L.crs;
  if(!source)throw Error('Defina o CRS da camada antes de preparar o requerimento.');
  const r=ringOf(f.geom),sirgas='+proj=longlat +ellps=GRS80 +towgs84=0,0,0 +no_defs';
  // Proj4 direto: erros de CRS nunca devem virar coordenadas sem conversão.
  const ll=r.map(p=>proj4(source,sirgas,p));
  if(ll.some(p=>!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90))throw Error('Coordenadas fora do domínio geográfico; confira o CRS.');
  const lon=ll.reduce((s,p)=>s+p[0],0)/ll.length,lat=ll.reduce((s,p)=>s+p[1],0)/ll.length;
  const zone=Math.max(1,Math.min(60,Math.floor((lon+180)/6)+1));
  const metric='+proj=utm +zone='+zone+(lat<0?' +south':'')+' +ellps=GRS80 +towgs84=0,0,0 +units=m +no_defs';
  const xy=ll.map(p=>proj4(sirgas,metric,p));
  validRing(xy);
  const o=xy[0];let area=0,perimeter=0;
  xy.forEach((p,i)=>{const q=xy[(i+1)%xy.length];area+=(p[0]-o[0])*(q[1]-o[1])-(q[0]-o[0])*(p[1]-o[1]);perimeter+=Math.hypot(p[0]-q[0],p[1]-q[1]);});
  area=Math.abs(area)/2;if(!(area>.001))throw Error('A poligonal não possui área válida.');
  return {ll,xy,area,perimeter,source,metric,zone,hemisphere:lat<0?'S':'N',key:JSON.stringify([L.id,source,f.geom]),
    wgs:r.map(p=>proj4(source,'EPSG:4326',p))};
}
function current(){const x=selected();return {...x,g:geometry(x.L,x.f)};}
function status(text,error=false){$('Status').textContent=text;$('Status').style.color=error?'var(--red,#d66)':'var(--ink)';}
function remember(){
  const d=draft();d.values=Object.fromEntries(fields.map(([k])=>[k,$(k).value]));
  d.layerId=$('Layer').value;d.featureIndex=Number($('Feature').value);d.updatedAt=new Date().toISOString();
}
function refreshFeatures(index=0){
  const L=layers().find(L=>String(L.id)===$('Layer').value);
  $('Feature').innerHTML=(L?.features||[]).map((f,i)=>'<option value="'+i+'">Poligonal '+(i+1)+' · '+esc(f.props?.NOME||f.props?.nome||f.props?.PROCESSO||f.props?.FID||'sem nome')+'</option>').join('');
  $('Feature').value=String(Math.min(Math.max(0,index),(L?.features.length||1)-1));
  refresh();
}
function mapSVG(g){
  const xs=g.xy.map(p=>p[0]),ys=g.xy.map(p=>p[1]),xmin=Math.min(...xs),ymin=Math.min(...ys),dx=Math.max(...xs)-xmin,dy=Math.max(...ys)-ymin;
  const s=Math.min(620/(dx||1),330/(dy||1)),px=p=>60+(p[0]-xmin)*s,py=p=>390-(p[1]-ymin)*s;
  const scale=Math.pow(10,Math.floor(Math.log10(160/s))),len=Math.max(scale,Math.floor(160/s/scale)*scale);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 470" role="img" aria-label="Planta esquemática da poligonal">'+
    '<rect width="800" height="470" fill="white"/><polygon points="'+g.xy.map(p=>px(p).toFixed(2)+','+py(p).toFixed(2)).join(' ')+'" fill="#e4f2e9" stroke="#246846" stroke-width="2"/>'+
    g.xy.map((p,i)=>'<circle cx="'+px(p)+'" cy="'+py(p)+'" r="3" fill="#246846"/><text x="'+(px(p)+5)+'" y="'+(py(p)-6)+'" font-size="12">V'+(i+1)+'</text>').join('')+
    '<path d="M750 95V45l-6 12m6-12 6 12" stroke="#222" fill="none"/><text x="736" y="30" font-size="12">NQ</text>'+
    '<path d="M60 420v8m0-4h'+(len*s)+'m0-4v8" stroke="#222" fill="none"/><text x="60" y="445" font-size="13">'+esc(fmt(len,0))+' m · SIRGAS 2000 / UTM '+g.zone+g.hemisphere+'</text></svg>';
}
function refresh(){
  query=null;epoch++;$('Query').textContent='Interferências ainda não consultadas para esta poligonal.';
  try{const {g}=current();$('Summary').textContent=fmt(g.area/1e4,4)+' ha · '+fmt(g.perimeter,2)+' m de perímetro · '+g.ll.length+' vértices · CRS de origem: '+g.source;
    $('Preview').innerHTML=mapSVG(g);status('Poligonal pronta para preparação. Medidas planas em SIRGAS 2000 / UTM '+g.zone+g.hemisphere+'.');
  }catch(e){$('Summary').textContent='Selecione, importe ou desenhe uma poligonal para começar.';$('Preview').innerHTML='';status(e.message,true);}
}
async function consult(){
  if(busy)return;
  let x;try{x=current();}catch(e){status(e.message,true);return;}
  const token=epoch;query=null;busy=true;$('Consult').disabled=true;$('Query').textContent='Consultando o serviço oficial da ANM…';
  try{
    const ring=x.g.ll.concat([x.g.ll[0]]),ids=await anmArcRequest({where:'1=1',geometry:JSON.stringify({rings:[ring],spatialReference:{wkid:4674}}),geometryType:'esriGeometryPolygon',inSR:4674,spatialRel:'esriSpatialRelIntersects',returnIdsOnly:true});
    if(!Array.isArray(ids.objectIds)&&ids.objectIds!==null)throw Error('O serviço não retornou a lista de processos.');
    if(ids.exceededTransferLimit)throw Error('O serviço limitou a consulta; resultado incompleto.');
    const list=[...new Set(ids.objectIds||[])];if(list.length>5000)throw Error('Mais de 5.000 processos incidentes; reduza a área de interesse.');
    const meta=await anmMeta(),records=[];
    for(let i=0;i<list.length;i+=100){
      const batch=list.slice(i,i+100),res=await anmArcRequest({objectIds:batch.join(','),outFields:'*',returnGeometry:false});
      const rows=res.features||[];
      if(res.exceededTransferLimit||rows.length!==batch.length)throw Error('O serviço devolveu um lote incompleto. Tente consultar novamente.');
      const returned=new Set(rows.map(f=>String(f.attributes?.[meta.oid])));
      if(batch.some(id=>!returned.has(String(id))))throw Error('Não foi possível confirmar todos os processos do lote.');
      records.push(...rows.map(f=>f.attributes));
    }
    if(token!==epoch||current().g.key!==x.g.key)return;
    query={key:x.g.key,at:new Date().toISOString(),records};
    $('Query').textContent=records.length?records.length+' processo(s) incidente(s), incluindo contatos de limite. Consulte a ANM para avaliar cada caso.':'Nenhum processo incidente retornado. Esse resultado não comprova que a área esteja livre.';
    const table=document.createElement('div');
    table.innerHTML=records.length?'<table><thead><tr><th>Processo</th><th>Fase</th><th>Titular</th></tr></thead><tbody>'+records.map(r=>'<tr><td>'+esc(r.PROCESSO||r.NUMERO||r[meta.oid])+'</td><td>'+esc(r.FASE)+'</td><td>'+esc(r.NOME||r.TITULAR)+'</td></tr>').join('')+'</tbody></table>':'';
    $('Query').appendChild(table);
  }catch(e){if(token===epoch){query=null;$('Query').textContent='Consulta não concluída: '+e.message;}}
  finally{busy=false;$('Consult').disabled=false;}
}
function checkedQuery(g){return query?.key===g.key?query:null;}
function report(x,values,q){
  const g=x.g,rows=g.ll.map((p,i)=>'<tr><td>V'+(i+1)+'</td><td>'+p[1].toFixed(8)+'</td><td>'+p[0].toFixed(8)+'</td></tr>').join('');
  const pending=fields.filter(([k])=>!values[k]?.trim()).map(([,label])=>label);
  return '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Requerimento de Pesquisa — '+esc(values.titulo||'GeoMine')+'</title><style>body{font:14px Arial;color:#172c22;max-width:980px;margin:30px auto;padding:0 20px}h1{font-size:25px}h2{font-size:18px;margin-top:28px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px;text-align:left}p{white-space:pre-wrap}svg{width:100%;max-height:500px}button{padding:10px}@media print{button{display:none}thead{display:table-header-group}tr{break-inside:avoid}h2{break-after:avoid}}</style>'+ 
    '<button onclick="window.print()">Imprimir / salvar PDF</button><h1>Requerimento de Pesquisa Mineral</h1><p>RASCUNHO PARA REVISÃO TÉCNICA · Gerado no GeoMine em '+esc(new Date().toLocaleString('pt-BR'))+'</p>'+
    '<p>Documento de preparação. O pedido oficial é realizado pelo REPEM. Este pacote não constitui protocolo nem comprovação de disponibilidade da área.</p><h2>Cadastro e plano proposto</h2>'+
    fields.map(([k,label])=>'<p><strong>'+esc(label)+':</strong> '+esc(values[k]||'Não preenchido')+'</p>').join('')+
    '<h2>Poligonal e memorial de apoio</h2><p>Camada: '+esc(x.L.name)+' · Poligonal '+(x.index+1)+'\nCRS de origem: '+esc(g.source)+'\nÁrea plana: '+fmt(g.area/1e4,4)+' ha · Perímetro plano: '+fmt(g.perimeter,2)+' m\nProjeção de cálculo: SIRGAS 2000 / UTM '+g.zone+g.hemisphere+'. As medidas e a transformação de datum devem ser revisadas pelo responsável técnico.</p>'+
    '<p>O contorno percorre V1 até V'+g.ll.length+' e retorna a V1. Coordenadas geográficas em SIRGAS 2000 (EPSG:4674), graus decimais.</p><table><thead><tr><th>Vértice</th><th>Latitude</th><th>Longitude</th></tr></thead><tbody>'+rows+'</tbody></table>'+
    '<h2>Planta esquemática para conferência</h2>'+mapSVG(g)+'<p>NQ: norte da quadrícula. A planta representa o contorno e seus vértices, sem base cartográfica de situação.</p>'+
    '<h2>Consulta de interferências</h2><p>'+(q?'Consulta ao SIGMINE em '+esc(q.at)+': '+q.records.length+' processo(s) incidente(s). O retorno pode incluir contatos de limite.':'Consulta não realizada ou desatualizada para esta geometria.')+' A base não é atualizada em tempo real; ausência de incidências não comprova disponibilidade.</p>'+
    (q?.records.length?'<table><thead><tr><th>Processo</th><th>Fase</th><th>Titular</th></tr></thead><tbody>'+q.records.map(r=>'<tr><td>'+esc(r.PROCESSO||r.NUMERO||'')+'</td><td>'+esc(r.FASE)+'</td><td>'+esc(r.NOME||r.TITULAR)+'</td></tr>').join('')+'</tbody></table>':'')+
    '<h2>Itens para revisão</h2><p>'+(pending.length?'Campos sem preenchimento: '+esc(pending.join('; '))+'.\n':'')+'Conferir poligonal, datum, substâncias e uso; detalhar plano, orçamento e cronograma; revisar responsabilidade técnica e ART; conferir cadastro e instruções vigentes no REPEM.</p><p><a href="'+GUIDE+'">Orientações da ANM</a> · <a href="'+SYSTEMS+'">Acesso aos sistemas oficiais / REPEM</a></p></html>';
}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),60000);}
async function exportPackage(){
  try{
    remember();const x=current(),values={...draft().values},q=checkedQuery(x.g),zip=new JSZip(),g=x.g;
    const name=(values.titulo||'requerimento-pesquisa').replace(/[^\p{L}\p{N}._-]+/gu,'-').slice(0,80)||'requerimento-pesquisa';
    zip.file('requerimento.html',report(x,values,q));zip.file('planta-esquematica.svg',mapSVG(g));
    zip.file('vertices-sirgas2000.csv','\uFEFFvertice;latitude;longitude\r\n'+g.ll.map((p,i)=>'V'+(i+1)+';'+p[1].toFixed(8)+';'+p[0].toFixed(8)).join('\r\n'));
    zip.file('poligonal.geojson',JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',properties:{nome:values.titulo||'',area_ha:g.area/1e4,calculo:'Área plana UTM SIRGAS 2000; coordenadas GeoJSON WGS84'},geometry:{type:'Polygon',coordinates:[g.wgs.concat([g.wgs[0]])]}}]},null,2));
    zip.file('rascunho.json',JSON.stringify({version:1,values,sourceCRS:g.source,sirgas2000:g.ll,consultation:q},null,2));
    if(q)zip.file('interferencias-anm.json',JSON.stringify(q,null,2));
    download(await zip.generateAsync({type:'blob'}),name+'.zip');status('Pacote gerado. Abra requerimento.html para revisar e imprimir em PDF.');
  }catch(e){status(e.message,true);}
}
function open(){
  if(!$('Modal')){
    const bg=document.createElement('div');bg.id='rpModal';bg.className='modal-bg';
    bg.innerHTML='<style>#rpModal{z-index:3100}#rpModal .modal{width:min(1000px,96vw);max-height:92vh;overflow:auto}#rpModal .rpgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}#rpModal label{display:block}#rpModal input,#rpModal select,#rpModal textarea{box-sizing:border-box;width:100%;margin-top:5px}#rpModal textarea{min-height:95px}#rpModal .rpwide{grid-column:1/-1}#rpModal .rpactions{display:flex;gap:8px;flex-wrap:wrap;margin:15px 0}#rpModal table{width:100%;border-collapse:collapse}#rpModal td,#rpModal th{padding:6px;border-bottom:1px solid var(--line);text-align:left}#rpQuery{max-height:230px;overflow:auto}#rpPreview svg{width:100%;max-height:320px}#rpStatus{margin:10px 0}#rpModal h3{margin:18px 0 10px}@media(max-width:650px){#rpModal .rpgrid{grid-template-columns:1fr}}</style>'+
      '<div class="modal"><div class="modal-h"><b>GIS · Requerimento de Pesquisa</b><div style="flex:1"></div><button class="mini" id="rpClose" aria-label="Fechar">✕</button></div><div class="modal-b">'+
      '<p>Prepare a poligonal e os documentos para revisão técnica. O envio oficial é feito pelo REPEM.</p><h3>1. Área de interesse</h3><div class="rpgrid"><label>Camada poligonal<select id="rpLayer"></select></label><label>Feição<select id="rpFeature"></select></label></div>'+
      '<div class="rpactions"><button class="mini" id="rpReload">Atualizar camadas</button><button class="mini" id="rpImport">Importar área</button><button class="mini" id="rpDraw">Desenhar poligonal</button></div><p id="rpSummary"></p><div id="rpPreview"></div>'+
      '<h3>2. Cadastro e plano de pesquisa</h3><p>O rascunho acompanha o projeto ao salvar. Campos em branco serão indicados no relatório.</p><div class="rpgrid">'+fields.map(([k,label])=>'<label class="'+(['plano','observacoes'].includes(k)?'rpwide':'')+'">'+label+(['plano','observacoes'].includes(k)?'<textarea id="rp'+k+'" maxlength="30000"></textarea>':'<input id="rp'+k+'" type="'+(k==='email'?'email':'text')+'" maxlength="500">')+'</label>').join('')+'</div>'+
      '<h3>3. Processos incidentes</h3><button class="mini" id="rpConsult">Consultar ANM nesta poligonal</button><p id="rpQuery"></p>'+
      '<h3>4. Documentos para revisão</h3><p>O ZIP contém relatório imprimível, planta esquemática, vértices em SIRGAS 2000, GeoJSON e dados do rascunho. A planta e o memorial de apoio precisam de revisão técnica.</p>'+
      '<div class="rpactions"><button class="tbtn" id="rpExport">Exportar pacote ZIP</button><a href="'+SYSTEMS+'" target="_blank" rel="noopener noreferrer">ANM / REPEM</a><a href="'+GUIDE+'" target="_blank" rel="noopener noreferrer">Orientações oficiais</a></div><div id="rpStatus" role="status" aria-live="polite"></div></div></div>';
    const headerStyle=document.createElement('style');
    headerStyle.textContent='#rpClose{width:32px!important;min-width:32px!important;flex:0 0 32px!important}#rpModal .modal-h>b{flex:1}#rpModal .modal-h>div{display:none}';
    bg.appendChild(headerStyle);document.body.appendChild(bg);
    $('Close').onclick=()=>{remember();bg.classList.remove('on');epoch++;};
    bg.addEventListener('keydown',e=>{if(e.key==='Escape'){$('Close').click();e.stopPropagation();}});
    $('Layer').onchange=()=>{refreshFeatures();remember();};$('Feature').onchange=()=>{refresh();remember();};
    fields.forEach(([k])=>$(k).addEventListener('input',remember));
    $('Reload').onclick=()=>{remember();open();};
    $('Import').onclick=()=>{$('Close').click();actClick('fileIn');};
    $('Draw').onclick=()=>{$('Close').click();actTool('poly');};
    $('Consult').onclick=consult;$('Export').onclick=exportPackage;
  }
  const d=draft(),ls=layers();fields.forEach(([k])=>$(k).value=String(d.values?.[k]||''));
  $('Layer').innerHTML=ls.map(L=>'<option value="'+esc(L.id)+'">'+esc(L.name)+'</option>').join('');
  const chosen=ls.find(L=>String(L.id)===String(d.layerId))||ls.find(L=>L.id===S.activeId)||ls[0];
  if(chosen)$('Layer').value=String(chosen.id);
  refreshFeatures(chosen&&String(chosen.id)===String(d.layerId)?d.featureIndex||0:0);
  $('Modal').classList.add('on');$('Layer').focus();
}
window.GeoMineResearch={open,geometry,ringOf,report};
})();
