(function(){
'use strict';
// A mesma ação e os mesmos comandos; apenas a representação dos alvos muda.
const ink='var(--ink,#25485e)',blue='#2789ba',pale='#dceef8',amber='#f5ad27',green='#2a9a72',red='#d95855',muted='#a4b2bd';
const path=(d,color=blue,extra='')=>'<path d="'+d+'" stroke="'+color+'" '+extra+'/>';
const dot=(x,y,color=pale,r=2.35)=>'<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+color+'" stroke="'+blue+'" stroke-width="1.5"/>';
const badge=(kind,color)=>'<circle cx="25" cy="7" r="6" fill="'+color+'" stroke="var(--panel,#fff)" stroke-width="1.4"/>'+path(kind==='plus'?'M22 7h6M25 4v6':kind==='minus'?'M22 7h6':'M23 5l4 4M27 5l-4 4','#fff','stroke-width="2"');
const poly=path('M4 25 11 10 20 21 28 13');
const nodes=dot(4,25)+dot(11,10)+dot(20,21)+dot(28,13);
const drawings={
 sel:poly+nodes+dot(11,10,amber,3.1)+path('m18 17 1 12 3-4 4 3 2-2-4-3 5-2Z',ink,'fill="var(--panel,#fff)" stroke-width="1.5"'),
 vadd:path('M4 25 13 15 27 24')+dot(4,25)+dot(27,24)+dot(13,15,'#bce9d9',3)+badge('plus',green),
 vdel:path('M4 25 12 14 27 24',muted,'stroke-dasharray="3 3"')+path('M4 25 27 24')+dot(4,25)+dot(27,24)+dot(12,14,'#f8d9d8',2.6)+badge('cross',red),
 vmove:path('M4 26 12 16 25 26',muted,'stroke-dasharray="2 3"')+path('M4 26 17 9 25 26')+dot(4,26)+dot(25,26)+dot(17,9,amber,3)+path('M24 12v9M20 16.5h9M24 12l-2 2m2-2 2 2M24 21l-2-2m2 2 2-2M20 16.5l2-2m-2 2 2 2M29 16.5l-2-2m2 2-2 2',ink,'stroke-width="1.5"'),
 vz:path('M3 25 10 20 17 25',muted)+dot(10,20,amber,3)+path('M10 16V6',amber,'stroke-dasharray="2 2"')+dot(10,6)+path('M24 6v20M20.5 10 24 6l3.5 4M20.5 22 24 26l3.5-4',blue),
 vzf:path('m3 20 11-5 12 5-11 6Z',muted,'stroke-dasharray="2 2" fill="#edf2f5"')+path('M3 9v11M14 4v11M26 9v11',muted,'stroke-width="1.4"')+path('m3 9 11-5 12 5-11 6Z',blue,'fill="'+pale+'"')+path('M28 4v14M25.5 7 28 4l2.5 3M25.5 15 28 18l2.5-3',amber,'stroke-width="2"'),
 terreno:path('m2 21 8-13 8 5 7-8 5 17-13 6Z','#498566','fill="#d9eadb"')+path('m2 21 16-8-1 15M10 8l7 20M25 5 17 28M2 21l28 1','#80ac91','stroke-width="1.2"')+path('M14 3v12M11 12l3 3 3-3',blue)+dot(14,16,amber,2.8),
 sdel:path('M3 25 10 17M22 17l7-10')+path('M10 17h12',red,'stroke-dasharray="2.5 2.5" stroke-width="2.6"')+dot(3,25)+dot(10,17)+dot(22,17)+dot(29,7)+path('M13 11l6 12M19 11l-6 12',red,'stroke-width="2.2"'),
 quebrar:path('M3 25 12 16M20 9l9-6')+dot(3,25)+dot(12,16,amber)+dot(20,9,amber)+dot(29,3)+path('m13 10 11 13M16 8l5 12',ink,'stroke-width="1.7"')+'<circle cx="12" cy="25" r="3" stroke="'+ink+'" stroke-width="1.7"/><circle cx="20" cy="25" r="3" stroke="'+ink+'" stroke-width="1.7"/>',
 trecho:path('M3 25 8 14M23 22l6-9')+path('M8 14 15 21 19 11 23 22',red,'stroke-width="2.7" stroke-dasharray="3 2"')+dot(3,25)+dot(8,14,amber,2.7)+dot(23,22,amber,2.7)+dot(29,13)+badge('minus',red),
 simplif:path('M3 25 6 17 10 20 14 10 18 17 23 9 29 15',muted,'stroke-dasharray="2 2" stroke-width="1.5"')+path('M3 25 14 10 29 15',blue,'stroke-width="2.6"')+dot(3,25)+dot(14,10,amber,2.8)+dot(29,15),
 densif:path('M3 25 13 13 29 24')+dot(3,25)+dot(13,13)+dot(29,24)+dot(8,19,'#99d9bd',2.4)+dot(18.3,16.7,'#99d9bd',2.4)+dot(23.7,20.3,'#99d9bd',2.4)+badge('plus',green),
 suaviz:path('M3 24 10 8 21 24 29 8',muted,'stroke-dasharray="2 2" stroke-width="1.5"')+path('M3 24C9-7 20 37 29 8','#239b9f','stroke-width="2.8"')+dot(3,24)+dot(29,8)+dot(10,8,amber,1.8)+dot(21,24,amber,1.8)
};
const icons={};
for(const [key,body] of Object.entries(drawings))icons[key]='<svg class="gm-editor-icon" data-gm-editor-icon="'+key+'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+body+'</svg>';
if(typeof EDI==='object')Object.assign(EDI,icons);
if(typeof RIB_SVG==='object')for(const [key,svg] of Object.entries(icons))RIB_SVG['ed_'+key]=svg;
window.GeoMineEditorIcons={version:1,keys:Object.keys(icons)};
if(typeof ribbonBuild==='function')ribbonBuild();
})();
(function(root){
'use strict';
let state=null,positionPending=false;
const hex=value=>{
 const s=String(value||'').trim().replace(/^#/,'');
 if(/^[\da-f]{3}$/i.test(s))return '#'+[...s].map(c=>c+c).join('').toLowerCase();
 return /^[\da-f]{6}$/i.test(s)?'#'+s.toLowerCase():null;
};
const nativeColor=target=>{
 const input=target?.closest?.('input[type=color]');
 return input&&!input.disabled&&!input.readOnly?input:null;
};
function close(focus=false){
 const s=state;if(!s)return;state=null;s.pop.remove();
 if(focus&&s.input.isConnected)s.input.focus({preventScroll:true});
}
function position(){
 positionPending=false;const s=state;if(!s)return;
 if(!s.input.isConnected||!s.input.getClientRects().length){close();return;}
 const p=s.pop,r=s.input.getBoundingClientRect(),margin=8,w=Math.min(256,innerWidth-margin*2);
 p.style.width=w+'px';const h=p.offsetHeight;
 let x=r.right+8;if(x+w>innerWidth-margin)x=r.left-w-8;
 if(x<margin)x=Math.max(margin,Math.min(r.left,innerWidth-w-margin));
 p.style.left=Math.round(x)+'px';p.style.top=Math.round(Math.max(margin,Math.min(r.top,innerHeight-h-margin)))+'px';
}
function requestPosition(){if(!positionPending&&state){positionPending=true;requestAnimationFrame(position);}}
function labelOf(input){
 const l=input.closest('label')||(input.id&&document.querySelector('label[for="'+CSS.escape(input.id)+'"]'));
 return (l?.textContent||input.getAttribute('aria-label')||input.title||'Cor').replace(/\s+/g,' ').trim().slice(0,70)||'Cor';
}
function useColor(value){
 const s=state,c=hex(value);if(!s)return;
 if(!c){s.error.textContent='Use um valor válido, como #328AD6.';s.hex.setAttribute('aria-invalid','true');return;}
 if(!s.input.isConnected||s.project!==S.projectId){close();return;}
 const input=s.input;input.value=c;
 input.dispatchEvent(new Event('input',{bubbles:true}));
 if(input.isConnected)input.dispatchEvent(new Event('change',{bubbles:true}));
 close();
}
function open(input){
 if(state?.input===input){close();return;}
 close();const current=hex(input.value)||'#000000',pop=document.createElement('div');
 pop.id='gmCompactColorPicker';pop.className='a3-float-menu gm-color-pop';pop.setAttribute('role','dialog');pop.setAttribute('aria-label',labelOf(input));
 const head=document.createElement('div');head.className='gm-color-head';const title=document.createElement('strong');title.textContent=labelOf(input);const x=document.createElement('button');x.type='button';x.textContent='×';x.setAttribute('aria-label','Fechar paleta de cores');head.append(title,x);
 const grid=document.createElement('div');grid.className='ce-pal';grid.setAttribute('aria-label','Paleta de cores');
 const colors=typeof PAL_CORES!=='undefined'?PAL_CORES:['#000000','#ffffff','#f5a524','#328ad6','#2a9a72','#c53a43'];
 for(const value of colors){const c=hex(value);if(!c)continue;const b=document.createElement('button');b.type='button';b.className='ce-sw';b.dataset.cor=c;b.style.background=c;b.title=c;b.setAttribute('aria-label','Cor '+c);b.setAttribute('aria-pressed',String(c===current));b.tabIndex=c===current?0:-1;grid.append(b);}
 if(!grid.querySelector('[tabindex="0"]'))grid.firstElementChild.tabIndex=0;
 const custom=document.createElement('div');custom.className='gm-color-custom';const preview=document.createElement('span');preview.className='gm-color-preview';preview.style.background=current;preview.setAttribute('aria-hidden','true');
 const field=document.createElement('input');field.type='text';field.value=current;field.maxLength=7;field.autocomplete='off';field.spellcheck=false;field.setAttribute('aria-label','Cor hexadecimal');
 const use=document.createElement('button');use.type='button';use.className='gm-color-use';use.textContent='Usar cor';custom.append(preview,field,use);
 const error=document.createElement('div');error.className='gm-color-error';error.setAttribute('role','alert');pop.append(head,grid,custom,error);document.body.append(pop);
 state={input,pop,hex:field,error,project:S.projectId};x.onclick=e=>close(e.detail===0);use.onclick=()=>useColor(field.value);
 grid.onclick=e=>{const b=e.target.closest('.ce-sw');if(b)useColor(b.dataset.cor);};
 field.oninput=()=>{const c=hex(field.value);error.textContent='';field.removeAttribute('aria-invalid');if(c)preview.style.background=c;};
 field.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();useColor(field.value);}};
 grid.onkeydown=e=>{
  const b=e.target.closest('.ce-sw');if(!b||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
  e.preventDefault();e.stopPropagation();const buttons=[...grid.children],i=buttons.indexOf(b),cols=getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,i+({ArrowLeft:-1,ArrowRight:1,ArrowUp:-cols,ArrowDown:cols})[e.key]));
  b.tabIndex=-1;buttons[next].tabIndex=0;buttons[next].focus({preventScroll:true});buttons[next].scrollIntoView({block:'nearest'});
 };
 position();x.focus({preventScroll:true});
}
// Impede a janela nativa grande; os eventos de valor permanecem os originais.
document.addEventListener('click',event=>{
 const input=nativeColor(event.target);if(!input)return;
 event.preventDefault();event.stopPropagation();open(input);
},true);
document.addEventListener('contextmenu',event=>{if(nativeColor(event.target))event.preventDefault();},true);
document.addEventListener('pointerdown',event=>{if(state&&!state.pop.contains(event.target)&&event.target!==state.input)close();},true);
root.addEventListener('keydown',event=>{if(state&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);}},true);
document.addEventListener('scroll',event=>{if(state&&!state.pop.contains(event.target))requestPosition();},true);
root.addEventListener('resize',requestPosition);
root.GeoMineCompactColors={open,close,version:1};
})(window);
(function(root){
'use strict';
let last=null,busy=false;
function selected(){
 const items=S.msel?.items||[];if(items.length>1)return null;
 const q=items.length===1?items[0]:S.selFeat;if(!q)return null;
 const L=(S.layers||[]).find(l=>String(l.id)===String(q.layerId??q.layer?.id)),idx=q.idx,f=L?.features?.[idx];
 return L?.gtype==='polygon'&&Number.isInteger(idx)&&f?.geom?{L,f,idx,selection:q,project:S.projectId}:null;
}
function sync(force=false){
 if(busy)return false;
 const panel=document.getElementById('secBacia'),pop=document.getElementById('ribbonPop');
 if(!force&&(!panel||!pop?.classList.contains('on')||!pop.contains(panel)))return false;
 const q=selected();
 if(!q){last=null;return false;}
 if(!force&&last?.project===q.project&&last.L===q.L&&last.f===q.f&&last.selection===q.selection)return false;
 const mode=document.getElementById('bcModo'),list=document.getElementById('bcFeic');if(!mode||!list)return false;
 busy=true;
 try{
  if(mode.value!=='feicao'){mode.value='feicao';mode.dispatchEvent(new Event('change',{bubbles:true}));}
  baciaPreencheFeic();const value=String(q.L.id)+':'+q.idx;
  if(![...list.options].some(o=>o.value===value))return false;
  list.value=value;last=q;return true;
 }finally{busy=false;}
}
root.GeoMineBoxSelection={sync,open:()=>{baciaPreencheFeic();return sync(true);},selected,version:1};
})(window);
(function(root){
'use strict';
const blue='#2789ba',amber='#f5ad27',pale='#dceef8',muted='#91a5b3',green='#2a9a72',red='#d95855';
const path=(d,color=blue,extra='')=>'<path d="'+d+'" stroke="'+color+'" '+extra+'/>';
const dot=(x,y,fill=pale,r=2.1)=>'<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+fill+'" stroke="'+blue+'" stroke-width="1.5"/>';
const box=(x,y,w,h,fill=pale,color=blue,extra='')=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="1" fill="'+fill+'" stroke="'+color+'" '+extra+'/>';
const shape=path('m5 24 3-15 12-4 7 16-13 7Z',blue,'fill="'+pale+'"');
const arrow4=path('M16 3v26M3 16h26M12 7l4-4 4 4M12 25l4 4 4-4M7 12l-4 4 4 4M25 12l4 4-4 4');
const drawings={
 'cad:ponto':path('M16 3v7M16 22v7M3 16h7M22 16h7')+'<circle cx="16" cy="16" r="6" fill="'+pale+'" stroke="'+blue+'"/>'+dot(16,16,amber,2.5),
 'cad:polilinha':path('m4 24 8-15 9 13 7-15')+dot(4,24)+dot(12,9)+dot(21,22,amber)+dot(28,7),
 'cad:poligono':shape+dot(5,24)+dot(8,9)+dot(20,5,amber)+dot(27,21)+dot(14,28),
 'cad:retangulo':box(5,7,22,18)+dot(5,7,amber)+dot(27,7)+dot(27,25)+dot(5,25),
 'cad:circulo':'<circle cx="16" cy="16" r="11" fill="'+pale+'" stroke="'+blue+'"/>'+path('M16 16h11',amber,'stroke-dasharray="2 2"')+dot(16,16,amber)+dot(27,16),
 'cad:elipse':'<ellipse cx="16" cy="16" rx="13" ry="8" fill="'+pale+'" stroke="'+blue+'"/>'+path('M3 16h26M16 8v16',muted,'stroke-dasharray="2 3" stroke-width="1.2"')+dot(16,16,amber),
 'cad:hachura':shape+path('m6 22 14-14M10 26 13-13M15 27 10-10M20 24l5-5',amber,'stroke-width="1.6"'),
 'cad:cotas':path('M5 6v21M27 6v21',muted,'stroke-width="1.3"')+path('M5 20h22M9 17l-4 3 4 3M23 17l4 3-4 3')+path('M9 10h14M12 7v6M20 7v6',amber),
 'cad:excluir':path('m3 24 3-14 12-4 5 13-10 7Z',muted,'stroke-dasharray="2 3"')+box(18,13,10,15,'#f8d9d8',red)+path('M16 10h14M21 7h4M21 17v7M25 17v7',red),
 'cad:mover':arrow4+dot(16,16,amber,3),
 'cad:copiar':box(4,5,16,17,'none',muted,'stroke-dasharray="3 2"')+box(12,12,16,17)+path('M18 20h5M20.5 17.5v5',amber),
 'cad:explodir':path('M12 5 5 12M20 5l7 7M5 20l7 7M27 20l-7 7',blue,'stroke-width="2.8"')+path('M10 10 4 4M4 9V4h5M22 10l6-6M23 4h5v5M10 22l-6 6M4 23v5h5M22 22l6 6M23 28h5v-5',muted,'stroke-width="1.4"')+dot(16,16,amber,2.5),
 'cad:unir':path('M3 9h8v14H3',blue)+path('M29 9h-8v14h8',green)+path('M11 16h10',amber,'stroke-width="3"')+dot(11,16,amber)+dot(21,16,amber),
 'editor:continuar':path('m3 25 8-13 8 6')+dot(3,25)+dot(11,12)+dot(19,18,amber)+path('m19 18 10-12M23 7l6-1-1 6',amber,'stroke-dasharray="3 2"'),
 'editor:girar':path('m11 13 12 3-4 10-12-3Z',blue,'fill="'+pale+'"')+path('M4 11A12 12 0 0 1 27 9M21 8l6 1 1-6',amber)+dot(16,18,amber),
 'editor:escalar':box(4,16,11,11,'none',muted,'stroke-dasharray="2 2"')+box(4,5,23,22,'none')+path('M12 20 26 6M20 6h6v6',amber,'stroke-width="2.3"'),
 'editor:espelho':path('M16 3v26',amber,'stroke-dasharray="3 3"')+path('M4 24V8l8 8Z',blue,'fill="'+pale+'"')+path('M28 24V8l-8 8Z',green,'fill="#dcefe7"'),
 'editor:parale':path('m3 22 8-9 9 6 9-11')+path('m3 14 8-9 9 6 9-9',amber)+path('M22 24v6M19 27h6',muted,'stroke-width="1.3"'),
 'editor:offset2':path('m3 16 8-9 9 6 9-9',muted,'stroke-dasharray="2 3"')+path('m3 24 8-9 9 6 9-9')+path('m3 8 8-6 9 3 4-3',amber),
 'editor:fechar':path('M6 7h20v19H6',blue,'fill="'+pale+'"')+path('M6 26V7',amber,'stroke-width="2.7"')+dot(6,7,amber)+dot(6,26,amber)+dot(26,7)+dot(26,26),
 'editor:abrir':path('m2 22 2-12 8-3 5 12-8 7Z',blue,'fill="'+pale+'"')+path('M19 8h10M25 4l4 4-4 4',amber)+path('m20 26 1-10 7-2 2 11-5 4Z',blue,'fill="none"'),
 'editor:rev':path('m3 23 8-9 10 9 8-9')+dot(3,23)+dot(29,14,amber)+path('M27 5H9M13 1 9 5l4 4',amber)+path('M5 28h17M18 25l4 3-4 3',muted,'stroke-width="1.4"'),
 'editor:estend':path('m3 25 11-9')+dot(3,25)+dot(14,16,amber)+path('m14 16 14-11M23 5h5v5',amber)+path('M28 2v27',muted,'stroke-dasharray="2 3" stroke-width="1.2"'),
 'editor:pdivreta':box(5,5,22,22)+path('m5 27 22-22',amber,'stroke-width="2.8"')+dot(5,27,amber)+dot(27,5,amber),
 'editor:pdivig':box(3,6,26,20)+path('M11.67 6v20M20.33 6v20')+path('M5 3h5M14 3h4M23 3h4',amber,'stroke-width="2.4"')
};
const icons={};
for(const [id,drawing] of Object.entries(drawings))icons[id]='<svg class="gm-cad-icon" data-gm-cad-icon="'+id+'" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+drawing+'</svg>';
const aliases={fdel:'cad:excluir',mover:'cad:mover',copiar:'cad:copiar',explode:'cad:explodir',unir:'cad:unir'};
if(typeof ED_CMDS!=='undefined')for(const def of ED_CMDS.flatMap(g=>g.it)){
 const svg=icons['editor:'+def.k]||icons[aliases[def.k]];if(!svg)continue;
 EDI[def.ic]=svg;RIB_SVG['ed_'+def.ic]=svg;
}
root.GeoMineCADIcons={version:1,keys:Object.keys(icons),icon:id=>icons[id]||null};
if(typeof ribbonBuild==='function')ribbonBuild();
})(window);
(function(root){
'use strict';
const orders=new WeakMap(),collator=new Intl.Collator('pt-BR',{numeric:true,sensitivity:'base'});
const numberTypes=/^(N|F|I|B|O|INTEGER|REAL|DOUBLE|FLOAT|NUMBER|NUMERIC)$/i;
function value(raw,field){
 if(raw==null||typeof raw==='string'&&!raw.trim())return {empty:true};
 const type=String(field?.type||'C').toUpperCase(),s=String(raw).trim();
 if(numberTypes.test(type)){
  const n=typeof raw==='number'?raw:Number(s.includes(',')?s.replace(/\./g,'').replace(',','.'):s);
  return Number.isFinite(n)?{key:n}:{empty:true};
 }
 if(type==='D'){
  let m=s.match(/^(\d{4})-?(\d{2})-?(\d{2})(?:T.*)?$/),y,month,day;
  if(m)[,y,month,day]=m;
  else if((m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)))[,day,month,y]=m;
  else return {empty:true};
  const date=new Date(Date.UTC(+y,+month-1,+day));
  return date.getUTCFullYear()===+y&&date.getUTCMonth()===+month-1&&date.getUTCDate()===+day?
   {key:date.getTime()}:{empty:true};
 }
 if(type==='L')return /^(true|t|sim|s|yes|y|v|1)$/i.test(s)?{key:1}:
  /^(false|f|nao|não|n|no|0)$/i.test(s)?{key:0}:{empty:true};
 return {key:s,text:true};
}
function install(L,body,fields,features,featureOnly){
 const table=body.querySelector('table'),thead=table?.tHead,tbody=table?.tBodies[0];
 if(!thead||!tbody)return;
 let order=orders.get(L);
 if(order?.field!=null&&!fields.some(f=>f.name===order.field)){orders.delete(L);order=null;}
 const headers=[...thead.rows[0].cells],buttons=[];
 function update(){
  const current=!featureOnly&&orders.get(L);
  headers.forEach((th,i)=>{
   const field=i?fields[i-1].name:null,on=!!current&&current.field===field;
   th.setAttribute('aria-sort',on?(current.direction===1?'ascending':'descending'):'none');
   const b=buttons[i],name=i?fields[i-1].name:'número da feição',next=on?(current.direction===1?'decrescente':'original'):'crescente';
   b.dataset.direction=on?String(current.direction):'0';
   const description=featureOnly?'Atributos da feição · '+name:next==='original'?'Restaurar a ordem original':'Ordenar por '+name+' · '+next;
   b.setAttribute('aria-label',description);
  });
 }
 function apply(scroll){
  const order=!featureOnly&&orders.get(L),field=fields.find(f=>f.name===order?.field);
  const rows=[...tbody.rows].map(tr=>{
   const index=Number(tr.dataset.i),f=features.get(index);
   return {tr,index,value:order?(order.field==null?{key:index}:value(f?.props?.[order.field],field)):null};
  });
  rows.sort((a,b)=>{
   if(!order)return a.index-b.index;
   const x=a.value,y=b.value;
   if(x.empty||y.empty)return x.empty?(y.empty?a.index-b.index:1):-1;
   const c=x.text?collator.compare(x.key,y.key):x.key-y.key;
   return c*order.direction||a.index-b.index;
  });
  const fragment=document.createDocumentFragment();rows.forEach(r=>fragment.appendChild(r.tr));tbody.appendChild(fragment);
  if(scroll)body.scrollTop=0;
  update();
 }
 headers.forEach((th,i)=>{
  th.classList.add('gm-sort-heading');th.setAttribute('scope','col');
  const label=document.createElement('span');label.className='gm-sort-label';
  while(th.firstChild)label.appendChild(th.firstChild);
  const b=document.createElement('button');b.type='button';b.className='gm-attr-sort';b.disabled=featureOnly;
  const arrow=document.createElement('span');arrow.className='gm-sort-arrows';arrow.setAttribute('aria-hidden','true');
  arrow.innerHTML='<svg viewBox="0 0 16 22" width="16" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path class="gm-sort-up" d="m4 8 4-4 4 4"/><path class="gm-sort-down" d="m4 14 4 4 4-4"/></svg>';
  b.append(label,arrow);th.appendChild(b);buttons.push(b);
  b.onclick=()=>{
   if(!table.isConnected||!S.layers.includes(L))return;
   const field=i?fields[i-1].name:null,current=orders.get(L);
   if(current?.field===field&&current.direction===-1)orders.delete(L);
   else orders.set(L,{field,direction:current?.field===field?-1:1});
   // As referências originais continuam identificando as feições editadas.
   // Uma exclusão/reordenação externa exige reconstruir a tabela primeiro.
   if([...features].some(([idx,f])=>L.features[idx]!==f)){
    const selected=S.selFeat?.layer===L?S.selFeat.idx:undefined;openAttr(selected,{layer:L});return;
   }
   apply(true);
  };
 });
 apply(false);
}
root.GeoMineAttributeSort={install,version:1};
})(window);
/* Layout follows the project until its property lock is closed. Rendering
   uses lightweight views, never applies a saved convention to source layers. */
(function(root){
'use strict';
const featureBindings=new WeakMap(),rasterViews=new WeakMap();
let timer=null;
const clone=value=>layoutClone(value);
const key=n=>nodeKey(n.t,n.id);
const visible=()=>S._view==='layout'&&document.getElementById('layout')?.style.display!=='none';
const activePlate=()=>S.loMode==='a4'?(S.plates||[]).find(p=>p.id===S.plateId):null;
function bind(c,L){
 let map=featureBindings.get(c);
 if(!map){
  map=new WeakMap();
  (L.features||[]).forEach((f,i)=>{if(c.featureConventions?.[i])map.set(f,c.featureConventions[i]);});
  featureBindings.set(c,map);
 }
 return map;
}
function snapshot(){
 const out={};
 (S.layers||[]).forEach(L=>{
  const c={...layoutVectorConvention(L),name:L.name,groupId:L.groupId??null,
   fields:clone(L.fields||[]),featureConventions:(L.features||[]).map(f=>({
    props:clone(f.props||{}),_featureStyle:clone(f._featureStyle||null),
    hatchStyles:(f.cadHatches||[]).map(h=>({color:h.color??null,weight:h.weight??1,opacity:h.opacity??1}))
   }))};
  out['L:'+L.id]=c;bind(c,L);
 });
 (S.rasters||[]).forEach(r=>{out['R:'+r.id]={name:r.name,groupId:r.groupId??null,style:clone(r.style||null)};});
 if(S.img?.url)out['I:0']={name:S.img.name,groupId:S.img.groupId??null,
  opacity:typeof orthoOpacidade==='function'?orthoOpacidade():S.img.overlay?.options?.opacity??1};
 (S.wms||[]).forEach(w=>{out['W:'+w.id]={id:w.id,name:w.name,url:w.url,layers:w.layers,
  version:w.version,protocol:w.protocol,opacity:w.opacity,visible:w.visible,
  clipLayerId:w.clipLayerId,provider:w.provider,attribution:w.attribution};});
 (S.groups||[]).forEach(g=>{out['G:'+g.id]={id:g.id,name:g.name,parentId:groupParentValue(g)};});
 return out;
}
function serializeConvention(conv){
 if(!conv)return null;
 const out=clone(conv);
 (S.layers||[]).forEach(L=>{
  const c=conv['L:'+L.id];if(!c?.featureConventions)return;
  const map=bind(c,L);
  out['L:'+L.id].featureConventions=(L.features||[]).map(f=>clone(map.get(f)||null));
 });
 return out;
}
function capture(){
 stackSync();
 return {vis:layoutVisSnapshot(),conv:snapshot(),stack:(S.stack||[]).slice()};
}
function capturePlate(pl,op){
 if(!pl)return;
 if(!S.loFrozen||op?.freezeCapture||!pl.vis||!pl.conv){
  const state=capture();pl.vis=state.vis;pl.conv=state.conv;pl.stack=state.stack;
 }
 pl.groups=(S.groups||[]).map(g=>({id:g.id,collapsed:!!g.collapsed}));
}
function frozenState(){
 const pl=activePlate();
 if(pl){
  if(!pl.vis||!pl.conv)capturePlate(pl,{freezeCapture:true});
  return pl;
 }
 if(!S._figFrozenState)S._figFrozenState=capture();
 S._figFrozenVis=S._figFrozenState.vis;
 return S._figFrozenState;
}
function model(){
 const state=S.loFrozen?frozenState():null,conv=state?.conv||{},nodes=[];
 for(const n of allNodes()){
  const c=conv[key(n)];
  if(state&&(!c||state.vis?.[key(n)]!==true))continue;
  let o=n.o;
  if(state){
   if(n.t==='R'){
    let cached=rasterViews.get(c);
    if(!cached||cached.source!==o||cached.view.d!==o.d||cached.view._rev!==o._rev){
     cached={source:o,view:{...o,...c,style:clone(c.style)}};rasterViews.set(c,cached);
    }
    o=cached.view;
   }else{
    o={...o,...c};
    if(n.t==='L'&&c.featureConventions){
     const map=bind(c,n.o);
     o.features=(n.o.features||[]).flatMap(f=>{
      const saved=map.get(f);return saved?[{...f,props:saved.props,_featureStyle:saved._featureStyle,
       cadHatches:(f.cadHatches||[]).flatMap((h,i)=>saved.hatchStyles?.[i]?[{...h,...saved.hatchStyles[i]}]:[])}]:[];
     });
    }
    if(n.t==='I')o._layoutOpacity=c.opacity;
   }
   o.visible=true;
  }
  nodes.push({...n,o});
 }
 const savedGroups=Object.entries(conv).filter(([k])=>k.startsWith('G:')).map(([,g])=>clone(g));
 const groups=state&&savedGroups.length?savedGroups:clone(S.groups||[]);
 const tree=buildLayerTree(nodes,state?.stack||S.stack||[],groups);
 return {nodes:tree.filter(it=>it.n).map(it=>it.n),tree,groups,
  layers:nodes.filter(n=>n.t==='L').map(n=>n.o),rasters:nodes.filter(n=>n.t==='R').map(n=>n.o),
  img:nodes.find(n=>n.t==='I')?.o||null,
  wms:state?Object.entries(conv).filter(([k])=>k.startsWith('W:')).map(([,w])=>w):S.wms||[]};
}
function sync(){
 const locked=!!S.loFrozen;
 const icon='<span class="lo-top-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="'+
  (locked?'M8 10V7a4 4 0 018 0v3M12 14v2.5':'M9 10V7a4 4 0 017-2.5M12 14v2.5')+'"/></svg></span>';
 for(const id of ['btnLoRedraw','btnRedrawTop','btnRedraw','btnLoFreeze']){
  const b=document.getElementById(id);if(!b)continue;
  b.classList.toggle('on',locked);b.classList.remove('layout-dirty');
  b.setAttribute('aria-pressed',String(locked));
  b.setAttribute('aria-label',locked?'Descongelar propriedades do layout':'Congelar propriedades do layout');
  b.title=locked?'Propriedades congeladas. Abrir o cadeado atualiza o layout.':'Atualização automática. Fechar o cadeado congela as propriedades.';
  b.innerHTML=icon+'<span class="lo-action-label">'+(locked?'Congelado':'Automático')+'</span>';
 }
}
function cancel(){clearTimeout(timer);timer=null;}
function change(){
 if(!visible()||S.loFrozen||S.loMode==='prop'||S._loRestoringConv||S._loRestoringVis)return;
 // Invalidate an older asynchronous render immediately; batch slider events.
 if(timer==null){
  S._loRenderId=(S._loRenderId||0)+1;
  S._loAppearanceEpoch=(S._loAppearanceEpoch||0)+1;
  if(typeof loBlobInvalida==='function')loBlobInvalida();
 }
 clearTimeout(timer);
 timer=setTimeout(()=>{
  timer=null;
  if(visible()&&!S.loFrozen)void buildLayout().catch(e=>console.warn('Atualização do layout',e));
 },90);
}
function freezeCapture(){
 const state=capture(),pl=activePlate();
 if(pl){pl.vis=state.vis;pl.conv=state.conv;pl.stack=state.stack;}
 else{S._figFrozenState=state;S._figFrozenVis=state.vis;}
}
function toggle(){
 cancel();
 if(!S.loFrozen)freezeCapture();
 S.loFrozen=!S.loFrozen;S._loFrozenDirty=false;
 S._loDraftVis=null;S._loDraftConv=null;S._loDraftStack=null;
 S._loAppearanceEpoch=(S._loAppearanceEpoch||0)+1;
 sync();
 void buildLayout().catch(e=>console.warn('Cadeado do layout',e));
 toast(S.loFrozen?'Propriedades do layout congeladas':'Atualização automática do layout ativada');
}
function rendered(){
 if(!S.loFrozen&&S.loMode==='a4'&&visible())plateCapture();
 sync();
}
function reset(){
 cancel();S._figFrozenState=null;S.loFrozen=false;S._loAppearanceEpoch=(S._loAppearanceEpoch||0)+1;sync();
}
root.GeoMineLayoutLive={version:1,change,sync,toggle,model,snapshot,capturePlate,freezeCapture,
 serializeConvention,rendered,reset,cancel,
 serializeState:state=>state?{vis:clone(state.vis),conv:serializeConvention(state.conv),stack:state.stack?.slice()}:null};
for(const id of ['btnLoRedraw','btnRedrawTop','btnRedraw','btnLoFreeze']){
 const b=document.getElementById(id);if(b)b.onclick=toggle;
}
sync();
})(window);
/* The application's project source choices do not depend on the browser's
   native file dialog or the device's installed Google Drive file provider. */
(function(root){
'use strict';
const openLocal=root.openProjectFile;
if(typeof openLocal!=='function'||root.GeoMineProjectOpenSource)return;
let pending=null;
const icons={
 drive:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 3 5 8-5 9H2l5-9-2-4Z" fill="#0f9d58"/><path d="M8 3h8l6 10h-9Z" fill="#f4b400"/><path d="m13 13 9 0-4 7H8Z" fill="#4285f4"/></svg>',
 device:'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z"/><path d="M3 10h18"/></svg>'
};
function driveState(){
 try{
  const p=root.GeoMineCloudProvider,s=root.GeoMineProjectTabSession;
  if(!p||typeof p.driveAccess!=='function'||!p.drivePickerConfig?.key)
   return {ready:false,message:'Entre na sua conta do GeoMine para acessar o Drive.'};
  const state=s?.state?.();
  if(!s?.openDrive||!root.GeoMineDriveProject?.pick||!state?.ready||state.ownerUid!==p.user?.uid)
   return {ready:false,message:'Preparando acesso ao Google Drive…'};
  return {ready:true,message:'Escolher um projeto no Drive'};
 }catch(_){return {ready:false,message:'Entre na sua conta do GeoMine para acessar o Drive.'};}
}
function open(){
 if(pending)return pending.promise;
 let resolve;
 const promise=new Promise(done=>{resolve=done;});
 const origin=document.activeElement;
 if(origin?.matches('input,textarea,[contenteditable="true"]'))origin.blur();
 const bg=document.createElement('div');bg.id='gmProjectOpenSource';bg.className='modal-bg on';
 bg.innerHTML='<div class="modal" role="dialog" aria-modal="true" aria-labelledby="gmProjectOpenTitle">'+
  '<div class="modal-h"><b id="gmProjectOpenTitle">Abrir projeto</b><div style="flex:1"></div><button type="button" class="tbtn" data-open-cancel aria-label="Fechar">✕</button></div>'+
  '<div class="modal-b"><button type="button" class="gm-open-source" data-open-source="drive">'+icons.drive+
   '<span><b>Google Drive</b><small id="gmProjectDriveStatus"></small></span><span aria-hidden="true" class="gm-open-arrow">›</span></button>'+
  '<button type="button" class="gm-open-source" data-open-source="device">'+icons.device+
   '<span><b>Neste aparelho</b><small>Escolher um arquivo</small></span><span aria-hidden="true" class="gm-open-arrow">›</span></button></div></div>';
 const drive=bg.querySelector('[data-open-source="drive"]');
 const sync=()=>{
  const state=driveState();drive.disabled=!state.ready;
  drive.setAttribute('aria-describedby','gmProjectDriveStatus');
  bg.querySelector('#gmProjectDriveStatus').textContent=state.message;
 };
 const events=['geomine:cloud-ready','geomine:cloud-disconnected','geomine:project-tab-ready'];
 let closed=false;
 const close=restoreFocus=>{
  if(closed)return;closed=true;
  events.forEach(name=>root.removeEventListener(name,sync));
  document.removeEventListener('keydown',keys,true);bg.remove();pending=null;
  if(restoreFocus&&origin?.isConnected&&!origin.matches('input,textarea,[contenteditable="true"]'))origin.focus?.({preventScroll:true});
 };
 const cancel=()=>{close(true);resolve(false);};
 const keys=e=>{
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();return;}
  if(e.key!=='Tab')return;
  const buttons=[...bg.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
 };
 bg.querySelector('[data-open-cancel]').onclick=cancel;
 bg.addEventListener('click',e=>{if(e.target===bg)cancel();});
 bg.querySelectorAll('[data-open-source]').forEach(button=>button.onclick=()=>{
  const cloud=button.dataset.openSource==='drive';
  if(cloud&&!driveState().ready){sync();return;}
  close(false);
  // Invoke the chosen path in the click itself. Safari requires this user
  // activation for both the local picker and Google's authorization popup.
  try{resolve(cloud?root.GeoMineProjectTabSession.openDrive():openLocal.call(root));}
  catch(error){root.toast?.('Não foi possível abrir o projeto: '+(error.message||error));resolve(false);}
 });
 pending={promise,cancel};document.body.append(bg);sync();
 events.forEach(name=>root.addEventListener(name,sync));
 document.addEventListener('keydown',keys,true);
 Promise.resolve(root.GeoMineProjectTabSession?.ready).then(()=>{if(!closed)sync();});
 requestAnimationFrame(()=>{if(!closed)(drive.disabled?bg.querySelector('[data-open-source="device"]'):drive).focus({preventScroll:true});});
 return promise;
}
root.GeoMineProjectOpenSource={version:1,open,driveState,cancel:()=>pending?.cancel()};
root.openProjectFile=open;
})(window);
