/* Visible horizontal layer scrolling on iPadOS, and one compact footer row. */
(function(root){
'use strict';let frame=0,track=null,drag=null;
const $=id=>document.getElementById(id),touch=()=>!!root.GeoMineTouchWorkspace?.enabled;
function update(){
 frame=0;const list=$('layerList'),panel=$('right');if(!list||!panel)return;
 if(touch()){
  if(!track){track=document.createElement('div');track.id='gmLayerHorizontalScroll';track.className='gm-layer-hscroll';track.tabIndex=0;track.setAttribute('role','scrollbar');track.setAttribute('aria-orientation','horizontal');track.setAttribute('aria-controls','layerList');track.setAttribute('aria-label','Rolar horizontalmente os títulos das camadas');track.innerHTML='<div class="gm-layer-hthumb"></div>';list.before(track);
   track.addEventListener('pointerdown',e=>{const r=track.getBoundingClientRect(),t=track.firstChild.getBoundingClientRect(),scale=(list.scrollWidth-list.clientWidth)/Math.max(1,r.width-t.width);if(e.target===track)list.scrollLeft=(e.clientX-r.left-t.width/2)*scale;drag={id:e.pointerId,x:e.clientX,left:list.scrollLeft,scale};track.setPointerCapture(e.pointerId);e.preventDefault();schedule();});
   track.addEventListener('pointermove',e=>{if(drag?.id!==e.pointerId)return;list.scrollLeft=drag.left+(e.clientX-drag.x)*drag.scale;schedule();});
   for(const type of ['pointerup','pointercancel','lostpointercapture'])track.addEventListener(type,()=>{drag=null;});
   track.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End','PageUp','PageDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();list.scrollLeft=e.key==='Home'?0:e.key==='End'?list.scrollWidth:list.scrollLeft+(['ArrowLeft','PageUp'].includes(e.key)?-1:1)*(e.key.startsWith('Page')?list.clientWidth*.8:40);schedule();});
  }
  const range=Math.max(0,list.scrollWidth-list.clientWidth);track.hidden=range<=1;
  const w=track.clientWidth,size=Math.min(w,Math.max(30,w*list.clientWidth/Math.max(1,list.scrollWidth)));
  if(!track.hidden){track.firstChild.style.width=size+'px';track.firstChild.style.transform='translateX('+((w-size)*list.scrollLeft/Math.max(1,range))+'px)';track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(range));track.setAttribute('aria-valuenow',String(Math.round(list.scrollLeft)));}
 }
 // Actual padding lets the final row scroll clear of any fixed command/footer.
 const footer=document.querySelector('.readout'),top=panel.getBoundingClientRect().top;
 if(touch()&&footer){const available=Math.max(100,Math.floor(footer.getBoundingClientRect().top-top-6))+'px';if(panel.style.getPropertyValue('--gm-layer-available')!==available)panel.style.setProperty('--gm-layer-available',available);}
 const p=panel.getBoundingClientRect();let inset=0;
 for(const e of document.querySelectorAll('.readout,#cmdBox,#cmdBar')){if(getComputedStyle(e).display==='none')continue;const r=e.getBoundingClientRect();if(r.left<p.right&&r.right>p.left&&r.top>p.top&&r.top<p.bottom&&r.bottom>p.top)inset=Math.max(inset,p.bottom-r.top);}
 const padding=Math.max(24,Math.ceil(inset)+16)+'px';if(list.style.paddingBottom!==padding)list.style.setProperty('padding-bottom',padding,'important');
}
function schedule(){if(!frame)frame=requestAnimationFrame(update);}
function boot(){
 const footer=document.querySelector('.readout');if(!footer)return;footer.classList.add('gm-single-footer');
 for(const [id,cls] of [['roZ','gm-foot-z'],['roCRS','gm-foot-crs'],['roEscala','gm-foot-scale'],['roZoom','gm-foot-zoom'],['uiPerfMode','gm-foot-perf']])$(id)?.closest('.ro-sec')?.classList.add(cls);
 const mode=$('uiPerfMode');if(mode){mode.closest('.ro-sec').hidden=true;if(mode.value!=='auto'){mode.value='auto';mode.dispatchEvent(new Event('change',{bubbles:true}));}}
 const original=root.refreshUI;if(typeof original==='function')root.refreshUI=function(){const result=original.apply(this,arguments);schedule();return result;};
 $('layerList')?.addEventListener('scroll',schedule,{passive:true});root.addEventListener('resize',schedule);document.addEventListener('scroll',schedule,{capture:true,passive:true});
 if(root.ResizeObserver){const ro=new ResizeObserver(schedule);for(const e of [$('layerList'),panelElement(),footer,$('cmdBox')])if(e)ro.observe(e);}
 if(root.MutationObserver&&$('layerList'))new MutationObserver(schedule).observe($('layerList'),{childList:true});
 schedule();
}
function panelElement(){return $('right');}
root.GeoMineCompactWorkspace={sync:schedule};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
