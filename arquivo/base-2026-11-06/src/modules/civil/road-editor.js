/* Road-specific vertical design. PVIs define tangent grades; symmetric
   parabolas join those grades. Horizontal editing retains circular fillets. */
(function(){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
let session=null,panel=null,svg=null,markers=null,preview=null,drag=null,frame=0;
function chain(axis){let s=0;return axis.map((p,i)=>{if(i)s+=Math.hypot(p.x-axis[i-1].x,p.y-axis[i-1].y);return {...p,s};});}
function initial(axis){
 const a=chain(axis),total=a.at(-1).s,keep=[0];
 // Retain changes of tangent grade, not every vertex of a sampled circle.
 for(let i=1;i<a.length-1;i++){
  const g1=(a[i].z-a[i-1].z)/(a[i].s-a[i-1].s),g2=(a[i+1].z-a[i].z)/(a[i+1].s-a[i].s);
  if(Math.abs(g1-g2)>1e-5)keep.push(i);
 }
 keep.push(a.length-1);
 return keep.map((idx,k)=>({u:a[idx].s/total,z:a[idx].z,L:k&&k<keep.length-1?Math.min(40,.6*Math.min(a[idx].s-a[keep[k-1]].s,a[keep[k+1]].s-a[idx].s)):0,fixed:k===0||k===keep.length-1}));
}
function vertical(axis,design,maxGrade){
 const pts=chain(axis),total=pts.at(-1)?.s;
 if(!(total>0)||design.length<2)throw Error('Eixo ou greide inválido.');
 const pv=design.map(p=>({...p,s:p.u*total}));
 if(Math.abs(pv[0].u)>1e-8||Math.abs(pv.at(-1).u-1)>1e-8)throw Error('O greide precisa cobrir o eixo inteiro.');
 const grades=[];
 for(let i=0;i<pv.length;i++){
  const p=pv[i];if(![p.u,p.z,p.L].every(Number.isFinite)||p.L<0)throw Error('Cota ou comprimento de curva inválido.');
  if(i){const d=p.s-pv[i-1].s;if(d<.1)throw Error('Separe as estacas dos pontos de greide.');
   grades.push((p.z-pv[i-1].z)/d);
   if(Math.abs(grades.at(-1))>maxGrade/100+1e-8)throw Error('A alteração excede a rampa máxima de '+maxGrade+'%.');
   if((i>1?pv[i-1].L/2:0)+(i<pv.length-1?p.L/2:0)>d-1e-7)throw Error('As curvas verticais se sobrepõem. Reduza o comprimento ou afaste os pontos.');
  }
 }
 for(let i=1;i<pv.length-1;i++)if(Math.abs(grades[i]-grades[i-1])>1e-8&&pv[i].L<.1)throw Error('Informe um comprimento positivo de curva vertical no PVI '+i+'.');
 const sample=s=>{
  for(let i=1;i<pv.length-1;i++){
   const p=pv[i],L=p.L,start=p.s-L/2;
   if(L>0&&s>=start&&s<=p.s+L/2){const x=s-start;return p.z-grades[i-1]*L/2+grades[i-1]*x+(grades[i]-grades[i-1])*x*x/(2*L);}
  }
  let i=1;while(i<pv.length-1&&pv[i].s<s)i++;return pv[i-1].z+grades[i-1]*(s-pv[i-1].s);
 };
 return {axis:pts.map(p=>({x:p.x,y:p.y,z:sample(p.s)})),pv,total,grades,sample};
}
function check(){
 const s=session;if(!s||S.projectId!==s.project||S._civ!==s.C||S.workCRS!==s.C.crs)throw Error('A estrada ou o projeto mudou. Abra o perfil novamente.');
 if(S.layers.some(l=>l._civilDesignId===s.C.id&&(l.locked||(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(l,false)))))throw Error('Desbloqueie as camadas da estrada para editar.');
 if(civMdt()!==s.R||s.R.d!==s.grid)throw Error('O MDT mudou. Abra o perfil novamente.');
 if(!GeoMineCivil.readParams(s.C))throw Error('Confira os parâmetros da estrada.');
 return s;
}
function build(s,design,controls){
 let axis=s.C.eixo;controls=controls||s.C.horizontalControls;
 if(controls){const radius=Math.max(s.C.params.civRaioMin||60,s.C.params.civW/2+1);axis=civCurvasTangentes(controls.map(p=>({...p,z:0})),radius,Math.min(3,radius/40),true).points;}
 const result=vertical(axis,design,s.C.params.civG);
 for(const p of result.axis)if(!Number.isFinite(civSample(s.grid,p.x,p.y)))throw Error('O traçado sai das cotas válidas do MDT.');
 return result;
}
function message(text){if(panel)panel.querySelector('[data-msg]').textContent=text;}
function snap(C){return copy({eixo:C.eixo,verticalDesign:C.verticalDesign,horizontalControls:C.horizontalControls,A:C.A,B:C.B});}
function apply(design,controls){
 const s=check();
 for(const old of s.design.filter(p=>p.fixed)){const p=design.find(p=>Math.abs(p.u-old.u)<1e-5);if(!p||Math.abs(p.z-old.z)>.001)throw Error('Libere a cota fixa antes de mover ou remover esse ponto.');}
 const r=build(s,design,controls),C=s.C;
 if(!C.horizontalCurved)throw Error('Gere as curvas tangentes em Alinhar A→B antes de editar a estrada.');
 s.history.push(snap(C));if(s.history.length>30)s.history.shift();
 C.verticalDesign=copy(design);C.eixo=r.axis;if(controls)C.horizontalControls=copy(controls);
 C.A=[C.eixo[0].x,C.eixo[0].y];C.B=[C.eixo.at(-1).x,C.eixo.at(-1).y];
 writeLayers(s);s.design=copy(design);draw();mapHandles();
 message((s.C.alignmentConfirmed?'Estrada e taludes atualizados. ':'Alinhamento atualizado. ')+r.total.toFixed(1)+' m · rampa das tangentes até '+(100*Math.max(...r.grades.map(Math.abs))).toFixed(2)+'%.');
}
function writeLayers(s){
 const C=s.C,L=S.layers.find(l=>l.id===C.alignmentId);
 if(L){const a=chain(C.eixo),props={...(L.features[0]?.props||{}),CORTE_M3:null,ATERRO_M3:null,COMP_M:a.at(-1).s,RAMPA_MAX:100*Math.max(...a.slice(1).map((p,i)=>Math.abs((p.z-a[i].z)/(p.s-a[i].s)))),TIPO:'Estrada — greide editado com curvas verticais'};L.features=[{geom:C.eixo.map(p=>[p.x,p.y]),zg:C.eixo.map(p=>p.z),multi:false,props}];drawLayer(L);}
 for(const l of S.layers.filter(l=>l._civilDesignId===C.id&&l._civilCorridorKind)){l.visible=false;drawLayer(l);}
 civDesenhaPontos();if(C.alignmentConfirmed&&!C.alignmentPending)civDesenhaSaia();refreshUI();
}
function projected(axis){return axis.map(p=>{const q=toWGS(S.workCRS,p.x,p.y);return[q[1],q[0]];});}
function previewAxis(axis){
 if(!preview)preview=L2.polyline([],{pane:'alagis_desenho',color:'#ed9b24',weight:4,interactive:false,dashArray:'5 4'}).addTo(map);
 preview.setLatLngs(projected(axis));
}
function clearPreview(){if(preview){preview.remove();preview=null;}}
function draw(candidate){
 const s=session;if(!s||!svg)return;
 const a=chain(candidate||s.C.eixo),length=a.at(-1).s,terrain=a.map(p=>civSample(s.grid,p.x,p.y)),design=s.draft||s.design;
 let lo=Infinity,hi=-Infinity;for(const z of [...a.map(p=>p.z),...terrain,...design.map(p=>p.z)])if(Number.isFinite(z)){lo=Math.min(lo,z);hi=Math.max(hi,z);}
 const pad=Math.max(2,(hi-lo)*.1);lo-=pad;hi+=pad;
 const X=v=>50+900*v/length,Y=z=>200-170*(z-lo)/(hi-lo);
 s.plot={length,lo,hi,X,Y};
 let terrainPath='';terrain.forEach((z,i)=>{if(Number.isFinite(z))terrainPath+=(i&&Number.isFinite(terrain[i-1])?'L':'M')+X(a[i].s)+','+Y(z);});
 let html='';for(let i=0;i<=4;i++){const z=lo+(hi-lo)*i/4,y=Y(z);html+='<line x1="50" y1="'+y+'" x2="950" y2="'+y+'" stroke="currentColor" opacity=".15"/><text x="2" y="'+y+'" fill="currentColor" font-size="11">'+z.toFixed(1)+'</text>';}
 html+='<path d="'+terrainPath+'" fill="none" stroke="#98774c" stroke-width="2"/><polyline points="'+a.map(p=>X(p.s)+','+Y(p.z)).join(' ')+'" fill="none" stroke="#168dda" stroke-width="3"/>';
 html+='<polyline points="'+design.map(p=>X(p.u*length)+','+Y(p.z)).join(' ')+'" fill="none" stroke="#888" stroke-dasharray="4 5"/>';
 design.forEach((p,i)=>html+='<circle data-pvi="'+i+'" cx="'+X(p.u*length)+'" cy="'+Y(p.z)+'" r="'+(i===s.selected?7:5)+'" fill="'+(p.fixed?'#888':'#f0a72c')+'" stroke="white" stroke-width="1.5" style="cursor:ns-resize"><title>PVI '+i+' · '+(p.u*length).toFixed(1)+' m · '+p.z.toFixed(2)+' m'+(p.fixed?' · fixo':'')+'</title></circle>');
 html+='<text x="50" y="225" fill="currentColor" font-size="12">0 m</text><text x="860" y="225" fill="currentColor" font-size="12">'+length.toFixed(1)+' m</text>';
 svg.innerHTML=html;
 const p=design[s.selected]||design[0];panel.querySelector('[data-z]').value=p.z.toFixed(3);panel.querySelector('[data-station]').value=(p.u*length).toFixed(2);panel.querySelector('[data-L]').value=p.L.toFixed(2);panel.querySelector('[data-fixed]').checked=p.fixed;
 panel.querySelector('[data-point]').textContent='PVI '+s.selected;panel.querySelector('[data-undo]').disabled=!s.history.length;
}
function position(e){const b=svg.getBoundingClientRect();return {x:(e.clientX-b.left)*1000/b.width,y:(e.clientY-b.top)*240/b.height};}
function install(){
 panel=document.createElement('section');panel.style.cssText='position:fixed;left:280px;right:24px;bottom:52px;z-index:12150;background:var(--panel,#f5f8fa);color:var(--ink,#172332);border:1px solid #8293a5;border-radius:8px;padding:10px;font-weight:400;box-shadow:0 4px 24px #0004;max-height:55vh;overflow:auto';
 panel.innerHTML='<div style="display:flex;gap:8px;align-items:center"><b style="flex:1">Perfil da estrada · edição dinâmica</b><button data-horizontal>Editar eixo no mapa</button><button data-undo>Desfazer</button><button data-close>Fechar</button></div><div style="font-size:12px">Marrom: MDT · azul: estrada · tracejado: tangentes. Arraste um PVI na vertical; ao soltar, os taludes são recalculados. Duplo clique adiciona PVI. Altura exagerada.</div><svg data-plot viewBox="0 0 1000 240" style="width:100%;height:230px;touch-action:none;display:block"></svg><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b data-point></b><label>Estaca (m) <input data-station type="number" step="1" style="width:95px"></label><label>Cota PVI (m) <input data-z type="number" step="0.1" style="width:100px"></label><label>Curva vertical L (m) <input data-L type="number" min="0" step="1" style="width:95px"></label><label><input data-fixed type="checkbox"> Cota fixa</label><button data-update>Atualizar ponto</button><button data-remove>Remover PVI</button></div><div data-msg role="status" style="font-size:12px;margin-top:6px"></div>';
 panel.querySelectorAll('button').forEach(b=>{b.classList.add('mini');b.style.cssText='width:auto;flex:none;margin:0;padding:6px 10px';});document.body.appendChild(panel);svg=panel.querySelector('svg');
 panel.querySelector('[data-close]').onclick=close;
 panel.querySelector('[data-horizontal]').onclick=()=>{session.horizontal=!session.horizontal;mapHandles();message(session.horizontal?'Arraste os PIs no mapa. Ao soltar, curvas, greide e taludes são atualizados. Estacas verticais acompanham a posição proporcional no eixo.':'Edição horizontal encerrada.');};
 panel.querySelector('[data-undo]').onclick=()=>{try{const s=check(),old=s.history.pop();if(!old)return;Object.assign(s.C,old);s.design=copy(s.C.verticalDesign||initial(s.C.eixo));s.selected=0;writeLayers(s);draw();mapHandles();message('Alteração desfeita; taludes restaurados.');}catch(e){message(e.message);}};
 panel.querySelector('[data-update]').onclick=()=>{try{const s=check(),d=copy(s.design),p=d[s.selected],fixed=panel.querySelector('[data-fixed]').checked,z=Number(panel.querySelector('[data-z]').value),u=Number(panel.querySelector('[data-station]').value)/s.plot.length;
  if(p.fixed&&(Math.abs(z-p.z)>.001||Math.abs(u-p.u)>1e-5))throw Error('Desmarque Cota fixa e atualize antes de mover este ponto.');
  p.z=z;p.u=u;p.L=Number(panel.querySelector('[data-L]').value);p.fixed=fixed;apply(d);
 }catch(e){message(e.message);}};
 panel.querySelector('[data-remove]').onclick=()=>{try{const s=check(),i=s.selected;if(i===0||i===s.design.length-1||s.design[i].fixed)throw Error('Extremos e pontos fixos não podem ser removidos.');const d=copy(s.design);d.splice(i,1);s.selected=Math.max(0,i-1);apply(d);}catch(e){message(e.message);}};
 svg.onpointerdown=e=>{const target=e.target.closest('[data-pvi]');if(!target)return;const s=session;s.selected=Number(target.dataset.pvi);draw();if(s.design[s.selected].fixed){message('Ponto fixo. Desmarque Cota fixa para liberar a edição.');return;}drag={id:e.pointerId,plot:{...s.plot},design:copy(s.design)};svg.setPointerCapture(e.pointerId);e.preventDefault();};
 svg.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;const p=position(e),z=drag.plot.lo+(200-p.y)/170*(drag.plot.hi-drag.plot.lo);session.draft=copy(drag.design);session.draft[session.selected].z=z;
  if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=0;if(!session?.draft)return;try{const r=build(check(),session.draft);draw(r.axis);previewAxis(r.axis);message('Prévia. Solte para atualizar a estrada e os taludes.');}catch(err){clearPreview();message(err.message);}});
 };
 svg.onpointerup=e=>{if(!drag||drag.id!==e.pointerId)return;const d=session.draft;drag=null;if(frame)cancelAnimationFrame(frame);frame=0;session.draft=null;clearPreview();try{if(d)apply(d);}catch(err){message(err.message);draw();}};
 svg.onpointercancel=()=>{drag=null;if(session)session.draft=null;clearPreview();draw();};
 svg.ondblclick=e=>{if(e.target.closest('[data-pvi]'))return;try{const s=check(),p=position(e),u=Math.max(0,Math.min(1,(p.x-50)/900)),r=vertical(s.C.eixo,s.design,s.C.params.civG),d=copy(s.design),z=r.sample(u*r.total);let i=d.findIndex(q=>q.u>u);if(i<=0)throw Error('Adicione o ponto no interior do eixo.');d.splice(i,0,{u,z,L:Math.min(20,.5*Math.min(u-d[i-1].u,d[i].u-u)*r.total),fixed:false});s.selected=i;apply(d);}catch(err){message(err.message);}};
}
function mapHandles(){
 if(markers){markers.remove();markers=null;}const s=session;if(!s?.horizontal)return;
 const controls=s.C.horizontalControls;if(!controls?.length){s.horizontal=false;message('Para editar os PIs horizontais deste eixo antigo, gere novamente o alinhamento A→B.');return;}
 markers=L2.layerGroup().addTo(map);
 controls.forEach((p,i)=>{
  const q=toWGS(S.workCRS,p.x,p.y),m=L2.marker([q[1],q[0]],{draggable:true,icon:L2.divIcon({className:'',html:'<div style="background:#ed9b24;color:#18232a;border:2px solid white;border-radius:50%;width:24px;height:24px;text-align:center;font-weight:bold">'+i+'</div>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(markers);
  m.on('drag',()=>{const ll=m.getLatLng(),xy=fromWGS(S.workCRS,ll.lng,ll.lat),c=copy(controls);c[i].x=xy[0];c[i].y=xy[1];if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=0;try{previewAxis(build(check(),s.design,c).axis);message('Prévia do eixo. Solte para atualizar os taludes.');}catch(e){clearPreview();message(e.message);}});});
  m.on('dragend',()=>{if(frame)cancelAnimationFrame(frame);frame=0;clearPreview();try{const ll=m.getLatLng(),xy=fromWGS(S.workCRS,ll.lng,ll.lat),c=copy(controls);c[i].x=xy[0];c[i].y=xy[1];apply(s.design,c);}catch(e){message(e.message);mapHandles();}});
 });
}
function close(){if(frame)cancelAnimationFrame(frame);frame=0;drag=null;clearPreview();if(markers)markers.remove();markers=null;if(panel)panel.remove();panel=svg=null;session=null;}
function open(){
 close();try{const C=GeoMineCivil.current(),R=civMdt();if(!C.eixo?.length||!R)throw Error('Gere o eixo da estrada e selecione o MDT.');if(C.crs!==S.workCRS)throw Error('Volte ao CRS da estrada: '+C.crs);
  if(!GeoMineCivil.readParams(C))return;if(typeof ribbonClose==='function')ribbonClose();session={C,R,grid:R.d,project:S.projectId,design:copy(C.verticalDesign||initial(C.eixo)),history:[],selected:0,horizontal:false};install();draw();message('Perfil da estrada carregado. A edição preserva o raio e verifica a rampa máxima. Curvas verticais são parabólicas; visibilidade e velocidade de projeto ainda exigem verificação.');
 }catch(e){close();toast(e.message);}
}
document.getElementById('btnCivProfile').onclick=open;
window.GeoMineRoadEditor={open,close,vertical,initial,apply,get state(){return session;}};
})();
