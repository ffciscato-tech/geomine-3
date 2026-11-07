/* Progresso visível no mapa. Percentuais são da etapa, nunca uma estimativa
   fictícia do arquivo inteiro. Tiles contam trabalhos solicitados ao Leaflet. */
(function(){
'use strict';
const grids=new Map();let task=null,projectTask=null,paint=0;
const el=id=>document.getElementById(id);
function openCommands(){
 const box=el('cmdBox');if(box&&box.style.display==='none'){
  box.style.display='flex';if(typeof cmdAplicaModo==='function')cmdAplicaModo();
  const button=el('btnCmdFlut');if(button)button.style.display='none';
 }
}
function bar(id,f){const p=el(id);if(!p)return;
 if(Number.isFinite(f)){p.value=Math.max(0,Math.min(1,f));p.setAttribute('aria-valuetext',Math.round(p.value*100)+'% da etapa');}
 else{p.removeAttribute('value');p.setAttribute('aria-valuetext','Em andamento; total ainda não disponível');}
}
function render(){
 paint=0;const root=el('gmLoadProgress');if(!root)return;
 const displayed=projectTask||task;
 const cancel=el('cmdStatusCancel');if(cancel)cancel.disabled=!!projectTask&&!!window.GeoMineProjectOpenProgress?.state?.().committed;
 root.hidden=!displayed&&!grids.size;el('gmLoadTask').hidden=!displayed;
 el('cmdBox')?.classList.toggle('gm-progress-active',!root.hidden);
 if(displayed){el('gmLoadTitle').textContent=displayed.title;bar('gmLoadBar',displayed.f);
  el('gmLoadPercent').textContent=Number.isFinite(displayed.f)?Math.round(displayed.f*100)+'% da etapa':'Em andamento…';}
 if(projectTask){const status=el('cmdStatus');if(status)status.style.display='inline-flex';
  const title=el('cmdStatusTxt');if(title)title.textContent=projectTask.title;
  const pct=el('cmdStatusPct');if(pct)pct.textContent=Number.isFinite(projectTask.f)?Math.round(projectTask.f*100)+'%':'';}
 el('gmTileProgress').hidden=!grids.size;
 if(grids.size){
  let done=0,total=0,failed=false;const names=[];
  for(const [grid,s] of grids){total+=s.tiles.size;for(const v of s.tiles.values())if(v)done++;
   failed=failed||s.error||!!s.fallback?.();names.push(s.name);}
  el('gmTileTitle').textContent='Alta resolução · '+names.join(' + ');
  bar('gmTileBar',total?done/total:NaN);
  el('gmTileCount').textContent=(total?done+' / '+total+' tiles processados':'Preparando tiles…')+(failed?' · parte indisponível / prévia mantida':'');
 }
}
function schedule(){if(!paint)paint=requestAnimationFrame(render);}
function show(title){
 const match=String(title).match(/(\d+(?:[.,]\d+)?)\s*%/);
 task={title:String(title),f:match?Math.max(0,Math.min(1,Number(match[1].replace(',','.'))/100)):NaN};
 render();
}
function set(f){if(!task)return;task.f=Number.isFinite(f)?f:NaN;render();}
function end(){task=null;render();}
function projectBegin(token,title){projectTask={token,title,f:NaN};openCommands();render();}
function projectShow(token,title,f){if(projectTask?.token!==token)return;projectTask={token,title,f};render();}
function projectEnd(token){if(projectTask?.token!==token)return;projectTask=null;
 const status=el('cmdStatus');if(status)status.style.display=task?'inline-flex':'none';
 if(task){const title=el('cmdStatusTxt');if(title)title.textContent=task.title;}
 const pct=el('cmdStatusPct');if(pct)pct.textContent='';render();}
function bind(grid,name,fallback){
 if(grid._gmProgressBound)return;grid._gmProgressBound=true;
 let state;
 const begin=()=>{if(state?.timer)clearTimeout(state.timer);state={name,tiles:new Map(),error:false,fallback};grids.set(grid,state);openCommands();schedule();};
 grid.on('loading',begin);
 grid.on('tileloadstart',e=>{if(!grids.has(grid))begin();state.tiles.set(e.tile,false);schedule();});
 const finished=e=>{if(!grids.has(grid))return;if(state.tiles.has(e.tile))state.tiles.set(e.tile,true);schedule();};
 grid.on('tileload',finished);
 grid.on('tileerror',e=>{if(grids.has(grid))state.error=true;finished(e);});
 grid.on('tileunload',e=>{if(grids.has(grid)){state.tiles.delete(e.tile);schedule();}});
 grid.on('load',()=>{
  if(!grids.has(grid))return;const saved=state;
  if(saved.timer)clearTimeout(saved.timer);
  saved.timer=setTimeout(()=>{if(grids.get(grid)===saved){grids.delete(grid);saved.tiles.clear();schedule();}},1800);schedule();
 });
 grid.on('remove',()=>{if(state?.timer)clearTimeout(state.timer);state?.tiles.clear();grids.delete(grid);schedule();});
}
window.GeoMineLoadProgress={show,set,end,bind,projectBegin,projectShow,projectEnd,projectActive:()=>!!projectTask};
})();
