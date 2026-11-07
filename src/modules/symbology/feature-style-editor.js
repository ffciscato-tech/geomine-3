/* Editor de aparência de uma única feição; rascunho e prévia locais até Aplicar. */
(function(){
'use strict';
let dialog=null;
const clone=v=>structuredClone(v);
const brush=()=>window.GeoMineFeatureStyleBrush;
const icon='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20h2a3 3 0 0 0 2-5.2 1.6 1.6 0 0 1 1-2.8h2a3 3 0 0 0 3-3C22 6 17.5 2 12 2Z" fill="#eaf2f8" stroke="#173b57" stroke-width="1.4"/><circle cx="7" cy="8" r="1.7" fill="#ef4444"/><circle cx="12" cy="6" r="1.7" fill="#f59e0b"/><circle cx="17" cy="8" r="1.7" fill="#3b82f6"/><circle cx="6" cy="13" r="1.7" fill="#22c55e"/></svg>';
function close(){dialog?.remove();dialog=null;}
function hex(value,fallback='#f5a524'){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 ctx.fillStyle=fallback;try{ctx.fillStyle=String(value||fallback);}catch(_){}
 const color=ctx.fillStyle;
 if(/^#[0-9a-f]{6}$/i.test(color))return color;
 const numbers=color.match(/[\d.]+/g);
 return numbers?.length>=3?'#'+numbers.slice(0,3).map(n=>Math.max(0,Math.min(255,Math.round(+n))).toString(16).padStart(2,'0')).join(''):fallback;
}
function open(L,idx){
 try{
  const B=brush(),f=L?.features?.[idx];
  if(!B||!f||!S.layers.includes(L))throw Error('Selecione uma feição para editar o estilo.');
  if(L.locked||(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false)))throw Error('A camada está congelada ou sem permissão de edição.');
  if(!['point','line','polygon'].includes(L.gtype))throw Error('Este tipo de feição não permite edição de estilo.');
  B.cancel();close();closeFeatMenu();
  B.activate(L,idx,f);
  const initial=B.getStyle(L,idx),draft=clone(initial),project=S.projectId,generation=window.GeoMineSessionAutosave?.state.generation;
  const initialStamp=JSON.stringify(initial),point=L.gtype==='point',poly=L.gtype==='polygon',line=L.gtype==='line';
  const bg=document.createElement('div');bg.id='featureStyleModal';bg.className='modal-bg on';dialog=bg;
  bg.innerHTML='<div class="modal" role="dialog" aria-modal="true" aria-labelledby="featureStyleTitle" style="width:min(460px,95vw)">'+
   '<div class="modal-h"><b id="featureStyleTitle">Estilo da feição</b><div style="flex:1"></div><button class="tbtn" data-close>Fechar</button></div><form class="modal-b">'+
   '<div data-name style="margin-bottom:10px;color:var(--ink-dim);font-size:12px"></div>'+
   '<div class="row2"><label class="field">'+(poly?'Preenchimento':'Cor')+'<input data-color type="color"></label>'+
    (!line?'<label class="field">Contorno<input data-stroke type="color"></label>':'')+'</div>'+
   '<div class="row2"><label class="field">Espessura (px)<input data-weight type="number" min="0" max="50" step="0.1" required></label>'+
    (poly?'<label class="field">Opacidade (%)<input data-fill type="number" min="0" max="100" step="1" required></label>':'')+'</div>'+
   (poly?'<div class="row2"><label class="field">Hachura<select data-hatch></select></label><label class="field" data-spacing>Espaçamento<input data-hatch-scale type="number" min="0.25" max="8" step="0.25" required></label></div>':'')+
   (!point?'<label class="field">Estilo da linha<select data-dash></select></label>':'')+
   (line?'<div class="row2"><label class="field">Seta<select data-arrow><option value="none">Sem seta</option><option value="open">Aberta</option><option value="filled">Preenchida</option></select></label><label class="field">Tamanho da seta (mm)<input data-arrow-size type="number" min="0.5" max="20" step="0.5" required></label></div>':'')+
   (point?'<div class="row2"><label class="field">Símbolo<select data-shape></select></label><label class="field">Tamanho (px)<input data-size type="number" min="6" max="96" step="1" required></label></div><div class="row2"><label class="field" data-rotation>Rotação (°)<input data-rot type="number" step="1" required></label><label class="field" data-dip-row>Mergulho (°)<input data-dip type="number" min="0" max="90" step="1"></label></div>':'')+
   '<div data-preview aria-label="Prévia do estilo" style="height:74px;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:6px;margin:12px 0;background:var(--panel2)"></div>'+
   '<div data-error role="alert" style="font-size:12px;color:var(--red,#e05252);margin-bottom:8px"></div>'+
   '<div style="display:flex;justify-content:flex-end;gap:8px"><button class="tbtn" type="button" data-cancel>Cancelar</button><button class="tbtn" type="submit" data-apply style="background:var(--amber);color:#1a1206;font-weight:600">Aplicar à feição</button></div></form></div>';
  document.body.append(bg);
  const $=selector=>bg.querySelector(selector),set=(selector,value)=>{const el=$(selector);if(el)el.value=value;};
  $('[data-name]').textContent=L.name+' · feição '+(idx+1);
  const s=draft.style;
  set('[data-color]',hex(line?s.stroke:s.color));set('[data-stroke]',hex(s.stroke));
  set('[data-weight]',Number.isFinite(+s.weight)?+s.weight:2);set('[data-fill]',Math.round((s.fill??0.35)*100));
  if(poly){$('[data-hatch]').innerHTML=hatchOptionsHTML(s.hatch);set('[data-hatch-scale]',s.hatchScale??1);}
  if(!point){
   const dash=$('[data-dash]');
   const options=DASH_OPTS.map(([value,label])=>[value,label]);
   if(!options.some(([value])=>value===(s.dash||'')))options.push([s.dash,'Personalizado']);
   for(const [value,label] of options){const option=document.createElement('option');option.value=value;option.textContent=label;dash.append(option);}
   dash.value=s.dash||'';
  }
  if(line){
   const arrows=window.GeoMineLineArrows?.style(s)||{arrowEnd:'none',arrowSize:3};
   set('[data-arrow]',arrows.arrowEnd);set('[data-arrow-size]',arrows.arrowSize);
  }
  if(point){
   $('[data-shape]').innerHTML=ptSymOptionsHTML(draft.point.shape);
   set('[data-size]',draft.point.size);set('[data-rot]',draft.point.rot??0);set('[data-dip]',draft.point.dip??'');
  }
  const value=selector=>$(selector).value,num=selector=>+value(selector);
  function collect(){
   if(line){s.stroke=value('[data-color]');if(s.stroke!==hex(initial.style.stroke))s.color=s.stroke;}
   else{s.color=value('[data-color]');s.stroke=value('[data-stroke]');}
   s.weight=num('[data-weight]');
   if(poly){s.fill=num('[data-fill]')/100;s.hatch=value('[data-hatch]');s.hatchScale=num('[data-hatch-scale]');$('[data-spacing]').style.display=['solid','none',''].includes(s.hatch)?'none':'';}
   if(!point)s.dash=value('[data-dash]');
   if(line){s.arrowEnd=value('[data-arrow]');s.arrowSize=num('[data-arrow-size]');}
   if(point){
    const p=draft.point,shape=value('[data-shape]');if(p.shape!==shape)p.params=null;
    p.shape=shape;p.size=num('[data-size]');p.rot=num('[data-rot]');p.dip=value('[data-dip]')===''?null:value('[data-dip]');
    $('[data-rotation]').style.display=PT_SYMS[p.shape]?.oriented?'':'none';$('[data-dip-row]').style.display=PT_SYMS[p.shape]?.dip?'':'none';
   }
   return draft;
  }
  function preview(){
   collect();const safeWeight=Math.max(0,Math.min(12,+s.weight||0)),dash=esc(s.dash||'');
   if(point){const p={...draft.point,size:Math.min(60,draft.point.size),def:PT_SYMS[draft.point.shape]||PT_SYMS.circle};$('[data-preview]').innerHTML=ptSVG(p,s.color,s.stroke,safeWeight);return;}
   let drawing='';
   if(poly){
    const tpl=PATTERN_TPL[s.hatch];
    const pattern=tpl?'<defs><pattern id="gmFeatureStyleHatch" width="'+tpl.w*(s.hatchScale||1)+'" height="'+tpl.h*(s.hatchScale||1)+'" patternUnits="userSpaceOnUse">'+hatchBodyAtSpacing(tpl,s.color,s.hatchScale)+'</pattern></defs>':'';
    drawing=pattern+'<rect x="68" y="12" width="104" height="48" fill="'+(s.hatch==='none'?'none':tpl?'url(#gmFeatureStyleHatch)':s.color)+'" fill-opacity="'+s.fill+'" stroke="'+s.stroke+'" stroke-width="'+safeWeight+'" stroke-dasharray="'+dash+'"/>';
   }else{
    drawing='<path d="M24 37H216" stroke="'+s.stroke+'" stroke-width="'+safeWeight+'" stroke-dasharray="'+dash+'"/>';
    if(s.arrowEnd!=='none')drawing+='<path d="m200 26 16 11-16 11" fill="'+(s.arrowEnd==='filled'?s.stroke:'none')+'" stroke="'+s.stroke+'" stroke-width="'+Math.max(1,safeWeight)+'"/>';
   }
   $('[data-preview]').innerHTML='<svg viewBox="0 0 240 74" width="240" height="74" aria-hidden="true">'+drawing+'</svg>';
  }
  bg.querySelectorAll('input,select').forEach(el=>{el.addEventListener('input',preview);el.addEventListener('change',preview);});
  $('[data-close]').onclick=$('[data-cancel]').onclick=()=>{if(dialog===bg)close();};
  bg.querySelector('form').onsubmit=e=>{
   e.preventDefault();
   try{
    if(S.projectId!==project||window.GeoMineSessionAutosave?.state.generation!==generation||!S.layers.includes(L)||L.features[idx]!==f)throw Error('O projeto ou a feição mudou. Abra o estilo novamente.');
    if(JSON.stringify(B.getStyle(L,idx))!==initialStamp)throw Error('O estilo mudou durante a edição. Abra a janela novamente.');
    if(!bg.querySelector('form').reportValidity())return;
    B.edit(L,idx,collect());close();toast('Estilo aplicado somente à feição. Ctrl+Z desfaz.');
   }catch(error){$('[data-error]').textContent=error.message||String(error);}
  };
  preview();return true;
 }catch(error){toast(error.message||String(error));return false;}
}
window.GeoMineFeatureStyleEditor={open,close,icon};
})();
