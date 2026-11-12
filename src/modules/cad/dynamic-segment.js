/* CAD dynamic input. Explicit dimensions override magnets/ORTO; unconstrained
   drawing uses the existing shared resolver. Preview and commit share math. */
(function(root){
'use strict';
let box=null,context=null,lastHit=null,cursor=null,locks={length:null,angle:null};
const generation=()=>root.GeoMineSessionAutosave?.state?.generation;
function draft(){const L=root.GeoMineDrawingSession?.layer(),p=S.drawBuf?.at(-1);if(!['line','poly'].includes(S.tool)||!L||!p)return null;return {L,p,key:[S.projectId,generation(),S.tool,L.id,L.crs,S.workCRS,S.drawBuf.length,...p].join('|')};}
function reset(){context=null;lastHit=null;cursor=null;locks={length:null,angle:null};if(box){if(box.contains(document.activeElement))document.activeElement.blur();box.style.display='none';}}
function coordinates(d){let crs=d.L.crs,projection=proj4(crs).oProj;if(projection.projName==='longlat'){crs=S.workCRS;projection=proj4(crs).oProj;}if(projection.projName==='longlat')throw Error('Use um CRS projetado para informar comprimento em metros.');return {crs,scale:Number(projection.to_meter??1)};}
function ensure(){if(box)return;box=document.createElement('div');box.id='gmDynamicSegment';box.setAttribute('aria-label','Comprimento e ângulo do próximo segmento');box.style.cssText='position:absolute;z-index:1100;display:none;width:242px;background:var(--panel,#132b3d);color:var(--text,#fff);border:1px solid var(--amber,#f5a524);border-radius:8px;padding:8px;box-shadow:0 3px 12px #0005;font:12px Signika,sans-serif;pointer-events:auto';
 box.innerHTML='<div style="display:flex;gap:6px"><label style="flex:1">Comprimento (m)<input id="gmSegmentLength" type="text" inputmode="decimal" autocomplete="off" style="width:100%;box-sizing:border-box" aria-label="Comprimento do segmento em metros"></label><label style="flex:1">Ângulo (°)<input id="gmSegmentAngle" type="text" inputmode="decimal" autocomplete="off" style="width:100%;box-sizing:border-box" aria-label="Ângulo do segmento em graus"></label></div><div style="margin:5px 0;font-size:10px">0° leste · 90° norte · Tab alterna · Enter insere</div><div id="gmSegmentError" role="status" style="color:var(--amber);font-size:11px"></div><div style="display:flex;gap:5px"><button type="button" id="gmSegmentCommit" class="mini">Inserir vértice</button><button type="button" id="gmSegmentFree" class="mini">Liberar valores</button></div>';
 map.getContainer().appendChild(box);L2.DomEvent.disableClickPropagation(box);L2.DomEvent.disableScrollPropagation(box);
 for(const [key,id] of [['length','gmSegmentLength'],['angle','gmSegmentAngle']]){const input=document.getElementById(id);input.addEventListener('input',()=>{locks[key]=input.value.trim()||null;refresh();});}
 document.getElementById('gmSegmentCommit').onclick=commit;document.getElementById('gmSegmentFree').onclick=()=>{locks={length:null,angle:null};for(const el of box.querySelectorAll('input'))el.blur();refresh();};
 box.addEventListener('keydown',keyEvent);
}
function resolve(raw,hit){const d=draft();if(!d){reset();return hit;}ensure();if(context?.key!==d.key){locks={length:null,angle:null};context=d;}cursor=raw;lastHit=hit;box.style.display='block';let result;
 try{const {crs,scale}=coordinates(d),a=fromWGS(crs,d.p[1],d.p[0]),b=fromWGS(crs,hit.latlng.lng,hit.latlng.lat);result=GeoMineSegmentGeometry.segment(a,b,{...locks,scale});const w=toWGS(crs,...result.point);document.getElementById('gmSegmentError').textContent='';
 for(const [key,id] of [['length','gmSegmentLength'],['angle','gmSegmentAngle']]){const input=document.getElementById(id);if(locks[key]==null&&document.activeElement!==input)input.value=result[key].toFixed(3).replace('.',',');input.style.borderColor=locks[key]!=null?'var(--amber)':'';}
 if(!box.contains(document.activeElement)){const p=map.latLngToContainerPoint(hit.latlng),size=map.getSize();box.style.left=Math.max(4,Math.min(size.x-254,p.x+18))+'px';box.style.top=Math.max(4,Math.min(size.y-145,p.y+18))+'px';}
 if(!result.constrained)return hit;
 return {...hit,latlng:L2.latLng(w[1],w[0]),snapped:false,orthogonal:false,guided:false,kind:'Segmento com medidas',numeric:true};
 }catch(e){document.getElementById('gmSegmentError').textContent=e.message;return {...hit,invalidNumeric:true};}
}
function refresh(){if(!cursor||!draft())return;const hit=GeoMineOrtho.drawing(cursor,false);GeoMineOrtho.preview(hit);}
function commit(){const d=draft();if(!d||context?.key!==d.key||!cursor)return false;const hit=GeoMineOrtho.drawing(cursor,false);if(hit.invalidNumeric)return false;const count=S.drawBuf.length;onMapClick({latlng:cursor});if(S.drawBuf.length===count)return false;map.getContainer().focus({preventScroll:true});return true;}
function focus(key){const el=document.getElementById(key==='angle'?'gmSegmentAngle':'gmSegmentLength');el?.focus({preventScroll:true});el?.select();return el;}
function keyEvent(e){const d=draft();if(!d||!context||d.key!==context.key)return;const inside=box?.contains(e.target),input=e.target?.tagName==='INPUT';
 if(e.key==='Tab'&&(inside||!e.target?.closest?.('input,textarea,select,[contenteditable="true"]'))){e.preventDefault();e.stopImmediatePropagation();focus(document.activeElement?.id==='gmSegmentLength'?'angle':'length');return;}
 if(e.key==='Escape'&&inside){e.preventDefault();e.stopImmediatePropagation();locks={length:null,angle:null};document.activeElement?.blur();refresh();map.getContainer().focus({preventScroll:true});return;}
 if(e.key==='Enter'&&(inside||locks.length!=null||locks.angle!=null)){e.preventDefault();e.stopImmediatePropagation();commit();return;}
 if(!inside&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&/^[0-9.,+\-]$/.test(e.key)&&!e.target?.closest?.('input,textarea,select,[contenteditable="true"]')){e.preventDefault();e.stopImmediatePropagation();const el=focus('length');el.value=e.key;locks.length=e.key;refresh();}
}
document.addEventListener('keydown',keyEvent,true);
// Invalidate a floating editor when a different command/project takes over.
setInterval(()=>{if(context&&draft()?.key!==context.key)reset();},200);
function beginAt(ll){if(draft())GeoMineOrtho.drawing(ll,false);}
root.GeoMineDynamicSegment={resolve,reset,commit,beginAt};
})(window);
