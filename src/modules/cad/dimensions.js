/* Three-click CAD dimensions: pick endpoints, place the dimension, repeat. */
(function(){
'use strict';
const TOOL='cad-dimension',FORMAT='geomine-dimensions',$=id=>document.getElementById('gmDim'+id),G=window.GeoMineDimensionGeometry;
let current=null,frame=null,lastSettings=null,swallowUntil=0;
function metric(){
 const def=proj4.defs(S.workCRS);if(!def)throw Error('Escolha um sistema de coordenadas válido para o projeto.');
 if(def.projName!=='longlat')return {crs:S.workCRS,metersPerUnit:Number(def.to_meter)||1};
 const ll=map.getCenter(),zone=Math.max(1,Math.min(60,Math.floor((ll.lng+180)/6)+1));
 return {crs:'+proj=utm +zone='+zone+(ll.lat<0?' +south':'')+' +datum=WGS84 +units=m +no_defs',metersPerUnit:1};
}
function suggestedHeight(m){
 const c=map.getSize().divideBy(2),a=map.containerPointToLatLng(c),b=map.containerPointToLatLng(c.add([0,13])),tr=proj4('EPSG:4326',m.crs),p=tr.forward([a.lng,a.lat]),q=tr.forward([b.lng,b.lat]);
 return Math.max(.001,Number((Math.hypot(q[0]-p[0],q[1]-p[1])*m.metersPerUnit).toPrecision(2)));
}
function status(text){const el=$('Hint');if(el&&el.textContent!==text)el.textContent=text;}
function instruction(){if(!current)return;status(['1/3 · Clique no primeiro ponto','2/3 · Clique no segundo ponto','3/3 · Mova o mouse para posicionar a cota e clique'][current.points.length]+' · Esc: sair · Backspace: voltar');}
function valid(){return current&&S.tool===TOOL&&S.projectId===current.project&&S.workCRS===current.work&&window.GeoMineSessionAutosave?.state.generation===current.generation;}
function cancel(restore=true){
 if(!current)return;const a=current;current=null;if(frame!==null)cancelAnimationFrame(frame);frame=null;
 map.removeLayer(a.group);map.removeLayer(a.renderer);$('Hint')?.remove();
 if(a.dragging)map.dragging.enable();map.getContainer().style.cursor='';
 if(restore&&S.tool===TOOL)setTool('select');
}
function destination(a){return S.layers.find(L=>L.src?.format===FORMAT&&L.crs===a.crs);}
function editable(layer){return !layer?.locked&&(typeof collabCanEditLayer!=='function'||collabCanEditLayer(layer||{name:'Cotas CAD'},false));}
function open(){
 cancel();let modal=$('Modal');if(!modal){
  modal=document.createElement('div');modal.id='gmDimModal';modal.className='modal-bg';
  modal.innerHTML='<div class="modal" style="width:min(470px,94vw)"><div class="modal-h"><b>Cotas / Dimensões</b><div style="flex:1"></div><button class="tbtn" id="gmDimClose">✕</button></div><div class="modal-b"><label class="field" for="gmDimMode">Tipo de cota</label><select id="gmDimMode"><option value="aligned">Alinhada — distância entre os pontos</option><option value="horizontal">Horizontal — distância no eixo X</option><option value="vertical">Vertical — distância no eixo Y</option></select><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px"><div><label class="field" for="gmDimUnit">Unidade</label><select id="gmDimUnit"><option value="m">Metros (m)</option><option value="cm">Centímetros (cm)</option><option value="mm">Milímetros (mm)</option></select></div><div><label class="field" for="gmDimDecimals">Casas decimais</label><input id="gmDimDecimals" type="number" min="0" max="4" step="1" value="2"></div></div><label class="field" for="gmDimHeight" style="margin-top:12px">Tamanho das setas no desenho (m)</label><input id="gmDimHeight" type="number" min="0.001" step="any"><label style="display:flex;gap:8px;align-items:center;margin:14px 0"><input id="gmDimSnap" type="checkbox" checked style="width:auto">Encaixar nos vértices visíveis</label><p class="hint">Marque os dois pontos e clique onde a cota deve ficar. A medida é calculada no plano do desenho. As cotas ficam na camada <b>Cotas CAD</b> e são salvas com o projeto.</p><p class="hint">Fonte, texto, setas e linhas podem ser alterados nas propriedades da camada. Cota com as pontas encaixadas nos vértices de uma figura é dinâmica: acompanha quando a figura é editada ou movida.</p><p id="gmDimError" role="status" style="color:var(--amber)"></p><button class="tbtn" id="gmDimStart" style="width:100%;justify-content:center;margin-top:10px">Colocar cotas</button></div></div>';
  document.body.appendChild(modal);$('Close').onclick=()=>modal.classList.remove('on');$('Start').onclick=()=>{
   try{const o={mode:$('Mode').value,unit:$('Unit').value,decimals:Number($('Decimals').value),height:Number($('Height').value)/.8,snap:$('Snap').checked};start(o);lastSettings=o;modal.classList.remove('on');}
   catch(e){$('Error').textContent=e.message;}
  };
 }
 try{const o=lastSettings||{mode:'aligned',unit:'m',decimals:2,height:suggestedHeight(metric()),snap:true};
 for(const [key,name] of [['mode','Mode'],['unit','Unit'],['decimals','Decimals'],['height','Height']])$(name).value=key==='height'?o[key]*.8:o[key];$('Snap').checked=o.snap;const existing=destination(metric());$('Height').disabled=!!existing;if(existing)$('Height').value=styleOf(existing).arrowSize;$('Error').textContent='';}
 catch(e){$('Error').textContent=e.message;}
 modal.classList.add('on');
}
function start(input={}){
 const m=metric(),prospective={crs:m.crs},existing=destination(prospective),style=styleOf(existing),settings={...input,arrow:existing?style.arrow:input.arrow,height:existing?style.arrowSize/.8:input.height,metersPerUnit:m.metersPerUnit},o=G.options(settings);
 if(!editable(destination(prospective)))throw Error('A camada de cotas não está liberada para edição. Confira o bloqueio ou a reserva na Colaboração.');
 cancel();setTool(TOOL);
 const group=L2.layerGroup().addTo(map),renderer=L2.canvas({pane:'alagis_desenho',padding:.3}),cont=map.getContainer();
 const line=L2.polyline([],{renderer,pane:'alagis_desenho',color:'#f5a524',weight:1.6,interactive:false,smoothFactor:0}).addTo(group);
 const label=L2.marker(map.getCenter(),{pane:'alagis_desenho',interactive:false,keyboard:false,icon:L2.divIcon({className:'gc-label',iconSize:[0,0],html:''})}).addTo(group);
 const marker=L2.circleMarker(map.getCenter(),{renderer,pane:'alagis_desenho',radius:5,color:'#37c0aa',weight:2,fill:false,opacity:0,interactive:false}).addTo(group);
 current={...m,settings:o,snap:input.snap!==false,points:[],work:S.workCRS,project:S.projectId,generation:window.GeoMineSessionAutosave?.state.generation,projection:proj4(m.crs,'EPSG:4326'),group,renderer,line,marker,label,dragging:map.dragging.enabled(),hover:null,style:existing?style:{...style,arrowSize:o.height*.8}};
 current.line.setStyle({color:current.style.color,weight:current.style.weight});map.dragging.disable();cont.style.cursor='crosshair';
 const el=document.createElement('div');el.id='gmDimHint';el.setAttribute('role','status');el.style.cssText='position:absolute;bottom:56px;left:50%;transform:translateX(-50%);max-width:90%;padding:10px 14px;z-index:1000;background:#142334;color:white;border:1px solid #f5a524;border-radius:7px;pointer-events:none;font:13px sans-serif';cont.appendChild(el);instruction();
}
function resolve(ll,endpoint=true){
 const a=current,hit=endpoint&&a.snap?snapLatLng(ll,destination(a),{flash:false,force:true,verticesOnly:true,allLayers:true,ignoreLayer:true}):{latlng:ll,snapped:false};
 const p=a.projection.inverse([hit.latlng.lng,hit.latlng.lat]);if(!p.every(Number.isFinite))throw Error('Coordenada inválida.');
 a.lastSnapped=!!hit.snapped;
 a.marker.setLatLng(hit.latlng).setStyle({opacity:1,color:hit.snapped?'#37c0aa':'#f5a524'});return p;
}
/* COTA DINÂMICA: a ponta encaixada num vértice guarda a figura (pelo _gid da
   feição, que vai junto no projeto) e o vértice (anel, índice e coordenada).
   Camada ativa primeiro: em figuras que dividem o mesmo canto, vale a que se
   está editando. */
const novoGid=()=>'f'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
function donoVertice(p){
 const w=current.projection.forward(p),A=typeof activeLayer==='function'?activeLayer():null;
 const camadas=[A,...S.layers.filter(L=>L!==A)];
 for(const L of camadas){
  if(!L||L.visible===false||isLayer(L)||!['line','polygon','point'].includes(L.gtype))continue;
  let q;try{q=String(L.crs)===String(current.crs)?p:fromWGS(L.crs,w[0],w[1]);}catch(_){continue;}
  if(!q||!q.every(Number.isFinite))continue;
  const tol=/^(EPSG:)?(4326|4674|4618)$/.test(L.crs)?1e-9:1e-4;
  for(const f of L.features||[]){
   if(!Array.isArray(f?.geom)||!f.geom.length)continue;
   const rings=(f.multi&&Array.isArray(f.geom[0]?.[0]))?f.geom:[f.geom];
   for(let ri=0;ri<rings.length;ri++){const r=rings[ri];if(!Array.isArray(r))continue;
    for(let vi=0;vi<r.length;vi++){const v=r[vi];
     if(Array.isArray(v)&&Math.abs(v[0]-q[0])<=tol&&Math.abs(v[1]-q[1])<=tol){
      if(!f._gid)f._gid=novoGid();
      return {layer:L.id,gid:f._gid,ri,vi,x:v[0],y:v[1],n:r.length};
     }}}
  }
 }
 return null;
}
function ll(p){const w=current.projection.forward(p);return [w[1],w[0]];}
function render(){
 frame=null;if(!valid()){cancel();return;}
 const a=current;if(!a.hover)return;
 try{
  const p=resolve(a.hover,a.points.length<2);a.cursor=p;
  if(a.points.length===1){a.line.setLatLngs([a.points[0],p].map(ll));return;}
  if(a.points.length===2){
   const f=G.build(a.points[0],a.points[1],p,a.settings);a.line.setLatLngs(f.geom.map(r=>r.map(ll)));a.label.setLatLng(ll(f.dimension.textPoint)).setIcon(textIcon(f.props.TEXTO,f.props.ANGULO,a.style));status(f.props.TEXTO+' · Clique para posicionar · Esc: sair · Backspace: voltar');
  }
 }catch(e){status(e.message);}
}
function move(latlng){if(!valid()){cancel();return;}current.hover=latlng;if(frame===null)frame=requestAnimationFrame(render);}
function click(latlng){
 if(!valid()){cancel();return;}const a=current,p=resolve(latlng,a.points.length<2);
 if(a.points.length<2)a.links=(a.links||[]).slice(0,a.points.length).concat([a.lastSnapped?donoVertice(p):null]);
 if(a.points.length===0){a.points.push(p);instruction();return;}
 if(a.points.length===1){G.build(a.points[0],p,p,a.settings);a.points.push(p);instruction();move(latlng);return;}
 const result=G.build(a.points[0],a.points[1],p,a.settings),feat={geom:result.geom,multi:true,props:result.props};
 const lk=a.links||[];if(lk[0]||lk[1])feat._dimLink={a:lk[0]||null,b:lk[1]||null};a.links=[];
 let layer=destination(a);if(!editable(layer))throw Error('A camada de cotas está bloqueada ou sem reserva para edição.');
 if(!layer){
  const fields=Object.entries(feat.props).map(([name,value])=>({name,type:typeof value==='number'?'N':'C',length:typeof value==='number'?22:100,decimal:typeof value==='number'?6:0}));
  layer=addLayer({name:'Cotas CAD',gtype:'line',crs:a.crs,features:[feat],fields,color:'#f5a524',src:{name:'Cotas CAD',format:FORMAT,version:1}});
  setLayerStyle(layer,{...a.style,arrowSize:a.settings.height*.8});undoPush({t:'layeradd',L:layer});
 }else{layer.features.push(feat);undoPush({t:'feat',L:layer,feat});}
 drawLayer(layer);refreshUI();window.GeoMineSessionAutosave?.markDirty('cota adicionada');
 a.points=[];a.cursor=null;a.hover=null;a.line.setLatLngs([]);a.label.setIcon(textIcon('',0,a.style));a.marker.setStyle({opacity:0});
 status('Cota '+feat.props.TEXTO+' criada · 1/3: marque outra cota · Esc: sair');return {layer,feat};
}

const FONTS={Arial:'Arial, sans-serif',Calibri:'Calibri, sans-serif',Times:"'Times New Roman', serif",Courier:"'Courier New', monospace",Verdana:'Verdana, sans-serif'};
function isLayer(L){return L?.src?.format===FORMAT;}
function isFeature(L,f){return isLayer(L)&&f?.props?.DIM_CAD==='v1';}
/* negrito/itálico: o rótulo da camada (L.lbl.style, também editável na aba
   Rótulos) é a fonte da verdade; dimensionStyle só vale sem rótulo */
function styleOf(L){
 const s={font:'Arial',fontSize:10,arrow:'open',arrowSize:1,color:L?.color||'#f5a524',weight:L?.weight||1.4,bold:false,italic:false,...(L?.src?.dimensionStyle||{})};
 if(typeof L?.lbl?.style==='string'){s.bold=L.lbl.style.includes('bold');s.italic=L.lbl.style.includes('italic');}
 return s;
}
const fontStyle=s=>[s.bold?'bold':'',s.italic?'italic':''].filter(Boolean).join(' ')||'normal';
function textIcon(text,angle,style){
 return L2.divIcon({className:'gc-label gm-dimension-label',iconSize:[0,0],html:'<div style="'+labelCSS({font:FONTS[style.font],style:fontStyle(style),color:style.color,halo:'#111820',haloW:1},style.fontSize*1.35)+';transform:translate(-50%,-50%) rotate('+angle+'deg)">'+esc(text)+'</div>'});
}
function labelPoint(L,f){
 if(!isFeature(L,f))return null;const p=f.props,pt=[+p.TXT_X,+p.TXT_Y];if(!pt.every(Number.isFinite))return null;
 const w=toWGS(L.crs,pt[0],pt[1]);return {pt,ll:[w[1],w[0]],ang:+p.ANGULO||0};
}
function setLayerStyle(L,style){
 L.src={...(L.src||{}),format:FORMAT,dimensionStyle:{...style}};L.color=style.color;L.weight=style.weight;
 L.sym={...L.sym,mode:'single',color:style.color,stroke:style.color,weight:style.weight};
 L.labelField='TEXTO';L.labelFields=['TEXTO'];L.lbl={...defaultLabelCfg(),font:FONTS[style.font],style:fontStyle(style),size:style.fontSize,color:style.color,halo:'#ffffff',haloW:.35,place:'curva',unique:false,onMap:true,rot:'1'};
}
function applyStyle(L,input){
 if(!isLayer(L)||!S.layers.includes(L)||!editable(L))throw Error('A camada de cotas está bloqueada ou sem permissão de edição.');
 const v={...styleOf(L),...input};v.bold=!!v.bold;v.italic=!!v.italic;
 if(!['open','triangle','tick','dot','none'].includes(v.arrow)||!FONTS[v.font]||!Number.isFinite(v.fontSize)||v.fontSize<1||v.fontSize>200||!Number.isFinite(v.arrowSize)||v.arrowSize<=0||!Number.isFinite(v.weight)||v.weight<=0||v.weight>20||!/^#[0-9a-f]{6}$/i.test(v.color))throw Error('Confira os valores do estilo de cotas.');
 const unit=Number(proj4.defs(L.crs)?.to_meter)||1;
 const edits=L.features.filter(f=>isFeature(L,f)).map(f=>{const p=f.props,mode=Object.keys(G.MODES).find(k=>G.MODES[k]===p.TIPO);
  const next=G.build([p.A_X,p.A_Y],[p.B_X,p.B_Y],[p.POS_X,p.POS_Y],{mode,unit:p.UNIDADE,decimals:p.DECIMAIS,height:v.arrowSize/.8,arrow:v.arrow,metersPerUnit:unit});return {f,next};});
 const before={src:JSON.parse(JSON.stringify(L.src)),lbl:JSON.parse(JSON.stringify(L.lbl)),sym:JSON.parse(JSON.stringify(L.sym)),color:L.color,weight:L.weight,labelField:L.labelField,labelFields:L.labelFields?.slice(),features:edits.map(({f})=>({f,geom:f.geom,props:{...f.props}}))};
 setLayerStyle(L,v);for(const {f,next} of edits){f.geom=next.geom;f.props={...f.props,...next.props};}
 undoPush({t:'dimensionstyle',L,before});drawLayer(L);refreshUI();window.GeoMineSessionAutosave?.markDirty('estilo de cotas alterado');
 if(current&&destination(current)===L){current.style=v;current.settings={...current.settings,height:v.arrowSize/.8,arrow:v.arrow};current.line.setStyle({color:v.color,weight:v.weight});if(current.hover)move(current.hover);}
 return edits.length;
}
function undoStyle(action){
 const {L,before}=action;if(!S.layers.includes(L)||!editable(L))return;
 if(S.undo.at(-1)===action)S.undo.pop();for(const key of ['src','lbl','sym','color','weight','labelField','labelFields'])L[key]=before[key];
 for(const f of before.features)if(L.features.includes(f.f)){f.f.geom=f.geom;f.f.props=f.props;}
 drawLayer(L);refreshUI();window.GeoMineSessionAutosave?.markDirty('estilo de cotas desfeito');toast('Estilo das cotas desfeito');
}
function properties(L){
 document.getElementById('gmDimLayerStyle')?.remove();if(!isLayer(L))return;
 const v=styleOf(L),box=document.createElement('section');box.id='gmDimLayerStyle';box.style.cssText='padding:12px;border:1px solid var(--line);border-radius:8px;margin:10px 0';
 box.innerHTML='<b>Estilo das cotas</b><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">'+
 '<label>Fonte<select data-dim="font">'+Object.keys(FONTS).map(k=>'<option value="'+k+'">'+({Times:'Times New Roman',Courier:'Courier New'}[k]||k)+'</option>').join('')+'</select></label>'+
 '<label>Tamanho do texto (pt)<input data-dim="fontSize" type="number" min="1" max="200" step=".5"></label>'+
 '<div style="display:flex;gap:14px;align-items:center;grid-column:1/-1">Estilo da fonte'+
 '<label style="display:flex;gap:5px;align-items:center"><input data-dim="bold" type="checkbox"><b>Negrito</b></label>'+
 '<label style="display:flex;gap:5px;align-items:center"><input data-dim="italic" type="checkbox"><i>Itálico</i></label></div>'+
 '<label>Tipo de seta<select data-dim="arrow"><option value="open">Seta aberta</option><option value="triangle">Triângulo</option><option value="tick">Traço inclinado</option><option value="dot">Círculo</option><option value="none">Sem seta</option></select></label>'+
 '<label>Tamanho da seta (m)<input data-dim="arrowSize" type="number" min=".001" step="any"></label>'+
 '<label>Cor<input data-dim="color" type="color"></label><label>Espessura da linha<input data-dim="weight" type="number" min=".1" max="20" step=".1"></label></div>'+
 '<button class="tbtn" data-dim-apply style="margin-top:10px">Aplicar a todas as cotas</button><span data-dim-result role="status" style="margin-left:10px"></span>';
 for(const key of Object.keys(v)){const el=box.querySelector('[data-dim="'+key+'"]');if(el){if(el.type==='checkbox')el.checked=!!v[key];else el.value=typeof v[key]==='number'?+v[key].toFixed(6):v[key];}}
 box.querySelector('[data-dim-apply]').onclick=()=>{try{const next={};box.querySelectorAll('[data-dim]').forEach(el=>next[el.dataset.dim]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value);const n=applyStyle(L,next);box.querySelector('[data-dim-result]').textContent=n+' cota(s) atualizada(s)';if(typeof lpSyncCtrl==='function')lpSyncCtrl();lpFillLabels(L);}catch(e){box.querySelector('[data-dim-result]').textContent=e.message;}};
 document.getElementById('lpInfo').innerHTML='<b>'+L.features.filter(f=>isFeature(L,f)).length+' cota(s)</b><br>Os ajustes abaixo se aplicam a todas as cotas desta camada.';
 document.getElementById('lpInfo').insertAdjacentElement('afterend',box);
}
const baseProps=window.openLayerProps;window.openLayerProps=function(L){const result=baseProps.apply(this,arguments);properties(L);return result;};
function dxfText(L,f){
 const q=labelPoint(L,f);if(!q)return '';const p=reproj(L.crs,S.workCRS,q.pt[0],q.pt[1]),style=styleOf(L),h=(+f.props.ALT_TXT_M||1)*style.fontSize/10;
 return '0\nTEXT\n8\n'+dxfSan(L.name)+'\n7\n'+dxfStyleName(style)+'\n10\n'+p[0]+'\n20\n'+p[1]+'\n30\n0\n40\n'+h+'\n1\n'+String(f.props.TEXTO).replace(/[\r\n]/g,' ')+'\n50\n'+(-q.ang)+'\n72\n1\n73\n2\n11\n'+p[0]+'\n21\n'+p[1]+'\n31\n0\n';
}
/* arquivo TrueType de cada variante: normal, negrito, itálico, negrito itálico */
const TTF={Arial:['arial','arialbd','ariali','arialbi'],Calibri:['calibri','calibrib','calibrii','calibriz'],Times:['times','timesbd','timesi','timesbi'],Courier:['cour','courbd','couri','courbi'],Verdana:['verdana','verdanab','verdanai','verdanaz']};
const dxfStyleName=s=>'GM_DIM_'+s.font+(s.bold?'_N':'')+(s.italic?'_I':'');
function dxfStyles(layers){
 const est=new Map();for(const L of layers.filter(isLayer)){const s=styleOf(L);est.set(dxfStyleName(s),TTF[s.font][(s.bold?1:0)+(s.italic?2:0)]+'.ttf');}
 if(!est.size)return '';
 return '0\nTABLE\n2\nSTYLE\n70\n'+est.size+'\n'+[...est].map(([n,f])=>'0\nSTYLE\n2\n'+n+'\n70\n0\n40\n0\n41\n1\n50\n0\n71\n0\n42\n1\n3\n'+f+'\n4\n\n').join('')+'0\nENDTAB\n';
}

function install(){
 const cat=CATS.find(c=>c.id==='cad');if(!cat||cat.grupos.some(g=>g.it?.some(i=>i.ic==='cad_dimension')))return;
 cat.grupos.splice(Math.min(1,cat.grupos.length),0,{label:'Cotas e dimensões',it:[{ic:'cad_dimension',nome:'Cotas',desc:'Cotas alinhadas, horizontais e verticais entre pontos do desenho',act:open}]});
}
if(typeof RIB_SVG!=='undefined')RIB_SVG.cad_dimension='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M8 39V11m32 28V11M8 31h32" fill="none" stroke="#73bbde" stroke-width="2.5"/><path d="M8 31l7-4v8zM40 31l-7-4v8z" fill="#f5a524"/><path d="M17 11h5v9h-5m10-9h5v9h-5v-9" fill="none" stroke="#f5a524" stroke-width="2.5"/></svg>';
const base=window.ribbonBuild;if(base)window.ribbonBuild=function(){install();return base.apply(this,arguments);};install();setTimeout(()=>ribbonBuild(),0);
const cont=map.getContainer(),control=e=>e.target.closest?.('.leaflet-control,.edbox,input,button,select,textarea');
cont.addEventListener('pointermove',e=>{if(!current||control(e)||e.buttons&4)return;e.stopImmediatePropagation();move(map.mouseEventToLatLng(e));},true);
cont.addEventListener('mousemove',e=>{if(current&&!control(e))e.stopImmediatePropagation();},true);
cont.addEventListener('pointerdown',e=>{if(!current||e.button!==0||control(e))return;e.preventDefault();e.stopImmediatePropagation();swallowUntil=Date.now()+400;try{click(map.mouseEventToLatLng(e));}catch(err){status(err.message);toast(err.message);}},true);
cont.addEventListener('pointerup',()=>{if(current)swallowUntil=Date.now()+400;},true);
cont.addEventListener('click',e=>{if(current&&!control(e)||Date.now()<swallowUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
window.addEventListener('keydown',e=>{
 if(e.key==='Escape'){
  if(current){e.preventDefault();e.stopImmediatePropagation();cancel();return;}
  if($('Modal')?.classList.contains('on')){e.preventDefault();e.stopImmediatePropagation();$('Modal').classList.remove('on');}return;
 }
 if(!current||e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
 if(e.key==='Backspace'||((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&current.points.length)){
  e.preventDefault();e.stopImmediatePropagation();current.points.pop();if(current.links)current.links.length=current.points.length;current.line.setLatLngs([]);current.label.setIcon(textIcon('',0,current.style));current.hover=null;instruction();
 }
},true);
map.on('moveend zoomend',()=>{if(current){if(!valid())cancel();else if(current.hover)move(current.hover);}});

/* ---------- COTA DINÂMICA: acompanha a figura ----------
   Toda edição de geometria redesenha a camada (arrasto de vértice nos dois
   editores, alça ✥, Mover, aresta, desfazer). Depois desse redesenho, as cotas
   presas a vértices desta camada são refeitas a partir dos vértices atuais,
   preservando o afastamento da linha de cota. O vértice é seguido pelo índice;
   quando o anel muda de tamanho (vértice inserido/apagado), pela coordenada. */
const gidCache=new Map();
function feicaoDe(L,gid){
 const c=gidCache.get(gid);if(c&&c._gid===gid&&L.features.includes(c))return c;
 const f=(L.features||[]).find(x=>x&&x._gid===gid)||null;if(f)gidCache.set(gid,f);return f;
}
function pontaAtual(e,D){
 const L=S.layers.find(l=>l.id===e.layer);if(!L)return null;
 const f=feicaoDe(L,e.gid);if(!f||!Array.isArray(f.geom))return null;
 const rings=(f.multi&&Array.isArray(f.geom[0]?.[0]))?f.geom:[f.geom],ring=rings[e.ri];
 if(!Array.isArray(ring))return null;
 const same=q=>Array.isArray(q)&&Math.abs(q[0]-e.x)<1e-7&&Math.abs(q[1]-e.y)<1e-7;
 let p=ring[e.vi];
 if(ring.length!==e.n){
  /* anel mudou de tamanho: o vértice segue pela coordenada, o mais perto do índice antigo */
  let k=-1,best=Infinity;ring.forEach((q,i)=>{if(same(q)&&Math.abs(i-e.vi)<best){best=Math.abs(i-e.vi);k=i;}});
  if(k>=0){e.vi=k;p=ring[k];}
  e.n=ring.length;
 }
 if(!Array.isArray(p)||!Number.isFinite(+p[0])||!Number.isFinite(+p[1]))return null;
 e.x=+p[0];e.y=+p[1];
 if(String(L.crs)===String(D.crs))return [e.x,e.y];
 const w=toWGS(L.crs,e.x,e.y),q=fromWGS(D.crs,w[0],w[1]);return q&&q.every(Number.isFinite)?[q[0],q[1]]:null;
}
/* nova posição da linha de cota com o mesmo afastamento relativo aos pontos */
function reposiciona(mode,A,B,C,A2,B2){
 if(mode==='horizontal'||mode==='vertical'){
  const i=mode==='horizontal'?1:0,hi=Math.max(A[i],B[i]),lo=Math.min(A[i],B[i]),hi2=Math.max(A2[i],B2[i]),lo2=Math.min(A2[i],B2[i]),c=C.slice();
  c[i]=C[i]>=hi?hi2+(C[i]-hi):C[i]<=lo?lo2-(lo-C[i]):lo2+(hi2-lo2)*((C[i]-lo)/((hi-lo)||1));
  c[1-i]=C[1-i]+((A2[1-i]-A[1-i])+(B2[1-i]-B[1-i]))/2;return c;
 }
 const d=Math.hypot(B[0]-A[0],B[1]-A[1]),d2=Math.hypot(B2[0]-A2[0],B2[1]-A2[1]);if(!(d>0)||!(d2>0))return C;
 const n=[-(B[1]-A[1])/d,(B[0]-A[0])/d],off=(C[0]-A[0])*n[0]+(C[1]-A[1])*n[1],
  t=((C[0]-A[0])*(B[0]-A[0])+(C[1]-A[1])*(B[1]-A[1]))/(d*d),n2=[-(B2[1]-A2[1])/d2,(B2[0]-A2[0])/d2];
 return [A2[0]+(B2[0]-A2[0])*t+n2[0]*off,A2[1]+(B2[1]-A2[1])*t+n2[1]*off];
}
function acompanhaCota(D,x){
 const k=x._dimLink,p=x.props||{},A=[+p.A_X,+p.A_Y],B=[+p.B_X,+p.B_Y];
 const A2=(k.a&&pontaAtual(k.a,D))||A,B2=(k.b&&pontaAtual(k.b,D))||B;
 if(Math.hypot(A2[0]-A[0],A2[1]-A[1])<1e-9&&Math.hypot(B2[0]-B[0],B2[1]-B[1])<1e-9)return false;
 const mode=Object.keys(G.MODES).find(m=>G.MODES[m]===p.TIPO)||'aligned',st=styleOf(D);
 let next;
 try{next=G.build(A2,B2,reposiciona(mode,A,B,[+p.POS_X,+p.POS_Y],A2,B2),{mode,unit:p.UNIDADE,decimals:+p.DECIMAIS,height:st.arrowSize/.8,arrow:st.arrow,metersPerUnit:Number(proj4.defs(D.crs)?.to_meter)||1});}
 catch(_){return false;}                              // pontos coincidentes: a cota espera a figura voltar
 x.geom=next.geom;x.props={...p,...next.props};return true;
}
function acompanhaCamada(L){
 if(!L||isLayer(L))return;
 for(const D of S.layers){
  if(!isLayer(D))continue;let mudou=false;
  for(const x of D.features||[]){const k=x&&x._dimLink;if(!k||(k.a?.layer!==L.id&&k.b?.layer!==L.id))continue;if(acompanhaCota(D,x))mudou=true;}
  if(mudou){baseDrawDim(D);window.GeoMineSessionAutosave?.markDirty?.('cota acompanhou a figura');}
 }
}
const baseDrawDim=window.drawLayer;
if(baseDrawDim)window.drawLayer=function(L){const out=baseDrawDim.apply(this,arguments);try{acompanhaCamada(L);}catch(e){console.warn('cota dinâmica',e);}return out;};
window.GeoMineDimensions={open,start,cancel,move,click,metric,install,isLayer,isFeature,styleOf,applyStyle,labelPoint,dxfText,dxfStyles,undoStyle,follow:acompanhaCamada,state:()=>current?{points:current.points.map(p=>p.slice()),crs:current.crs,settings:{...current.settings}}:null};
})();
