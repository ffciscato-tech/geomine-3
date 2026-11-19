/* Road-specific vertical design. PVIs define tangent grades; symmetric
   parabolas join those grades. Horizontal editing retains circular fillets.

   19/11/2026 — alinhamento horizontal e vertical nos cards da estrada:
   - a sessão de edição pode existir SEM o painel do perfil (begin/update):
     os cards "Alinhamento horizontal" e "Alinhamento vertical" aplicam raios
     por curva e comprimentos de curva vertical pela mesma rotina do perfil,
     com as mesmas conferências (rampa máxima, MDT, curvas que não cabem);
   - a sessão guarda o MDT (R e a grade de cotas). Ela só fica viva com o
     perfil aberto ou com os PIs ligados no mapa; fora disso "descansa": sobra
     o histórico do Desfazer (cópias pequenas da estrada) e a grade é solta,
     para um MDT removido do projeto não ficar preso na memória;
   - cada PI passa a guardar o raio da sua curva (`r`), para a tabela mostrar
     o que está de fato no eixo mesmo que o raio mínimo mude depois;
   - o perfil mostra corte e aterro, a rampa de cada tangente, o trecho de
     cada curva vertical e as estacas. A escala e o arrasto não mudaram. */
(function(){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
let session=null,dormant=null,panel=null,svg=null,markers=null,preview=null,drag=null,frame=0;
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
 if(S.layers.some(l=>l._civilDesignId===s.C.id&&(l.locked||(typeof canEditLayer==='function'&&!canEditLayer(l,false)))))throw Error('Desbloqueie as camadas da estrada para editar.');
 if(civMdt()!==s.R||s.R.d!==s.grid)throw Error('O MDT mudou. Abra o perfil novamente.');
 if(!GeoMineCivil.readParams(s.C))throw Error('Confira os parâmetros da estrada.');
 return s;
}
const minRadius=C=>Math.max(C.params.civRaioMin||60,C.params.civW/2+1);
function build(s,design,controls){
 let axis=s.C.eixo;controls=controls||s.C.horizontalControls;
 if(controls){const radius=minRadius(s.C);axis=civCurvasTangentes(controls.map(p=>({...p,z:0})),radius,Math.min(3,radius/40),true).points;}
 const result=vertical(axis,design,s.C.params.civG);
 for(const p of result.axis)if(!Number.isFinite(civSample(s.grid,p.x,p.y)))throw Error('O traçado sai das cotas válidas do MDT.');
 return result;
}
/* Recado ao usuário: no painel do perfil ou, com ele fechado, no card do
   alinhamento horizontal (arrasto dos PIs no mapa). `alert` marca erro. Durante
   uma aplicação pedida pelos cards (quiet) quem fala é o próprio card. */
function message(text,alert){
 if(panel)panel.querySelector('[data-msg]').textContent=text;
 else if(!session?.quiet)window.GeoMineRoadGeometry?.status(text,alert);
}
function snap(C){return copy({eixo:C.eixo,verticalDesign:C.verticalDesign,horizontalControls:C.horizontalControls,A:C.A,B:C.B});}
function apply(design,controls){
 const s=check();
 for(const old of s.design.filter(p=>p.fixed)){const p=design.find(p=>Math.abs(p.u-old.u)<1e-5);if(!p||Math.abs(p.z-old.z)>.001)throw Error('Libere a cota fixa antes de mover ou remover esse ponto.');}
 const r=build(s,design,controls),C=s.C;
 if(!C.horizontalCurved)throw Error('Gere as curvas tangentes em Alinhar A→B antes de editar a estrada.');
 s.history.push(snap(C));if(s.history.length>30)s.history.shift();
 C.verticalDesign=copy(design);C.eixo=r.axis;
 // Cada PI guarda o raio usado na sua curva: a tabela do alinhamento não depende do raio mínimo de depois.
 if(controls){const radius=minRadius(C);C.horizontalControls=copy(controls).map((p,i,all)=>i&&i<all.length-1&&!(p.r>0)?{...p,r:radius}:p);}
 C.A=[C.eixo[0].x,C.eixo[0].y];C.B=[C.eixo.at(-1).x,C.eixo.at(-1).y];
 writeLayers(s);s.design=copy(design);draw();mapHandles();
 message((s.C.alignmentConfirmed?'Estrada e taludes atualizados. ':'Alinhamento atualizado. ')+r.total.toFixed(1)+' m · rampa das tangentes até '+(100*Math.max(...r.grades.map(Math.abs))).toFixed(2)+'%.');
}
function writeLayers(s){
 const C=s.C,L=S.layers.find(l=>l.id===C.alignmentId);
 if(L){const a=chain(C.eixo),props={...(L.features[0]?.props||{}),CORTE_M3:null,ATERRO_M3:null,COMP_M:a.at(-1).s,RAMPA_MAX:100*Math.max(...a.slice(1).map((p,i)=>Math.abs((p.z-a[i].z)/(p.s-a[i].s)))),TIPO:'Estrada — greide editado com curvas verticais'};L.features=[{geom:C.eixo.map(p=>[p.x,p.y]),zg:C.eixo.map(p=>p.z),multi:false,props}];drawLayer(L);}
 for(const l of S.layers.filter(l=>l._civilDesignId===C.id&&l._civilCorridorKind)){l.visible=false;drawLayer(l);}
 civDesenhaPontos();if(C.alignmentConfirmed&&!C.alignmentPending)civDesenhaSaia();refreshUI();
 window.GeoMineRoadGeometry?.refresh();
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
 // Estacas em passos redondos (no máximo dez marcas).
 const tick=[10,20,25,50,100,200,250,500,1000,2000,5000].find(v=>length/v<=10)||10000;
 for(let v=tick;v<length-tick*.35;v+=tick)html+='<line x1="'+X(v)+'" y1="30" x2="'+X(v)+'" y2="204" stroke="currentColor" opacity=".1"/><text x="'+X(v)+'" y="225" fill="currentColor" font-size="10" text-anchor="middle" opacity=".8">'+v+'</text>';
 // Corte (terreno acima do greide) e aterro (greide acima do terreno), trecho a trecho.
 for(let i=1;i<a.length;i++){
  const t0=terrain[i-1],t1=terrain[i];if(!Number.isFinite(t0)||!Number.isFinite(t1))continue;
  const cut=t0+t1>a[i-1].z+a[i].z;
  html+='<polygon data-earth="'+(cut?'corte':'aterro')+'" points="'+X(a[i-1].s)+','+Y(t0)+' '+X(a[i].s)+','+Y(t1)+' '+X(a[i].s)+','+Y(a[i].z)+' '+X(a[i-1].s)+','+Y(a[i-1].z)+'" fill="'+(cut?'#c8553d':'#3f9d5a')+'" opacity=".3"/>';
 }
 // Trecho de cada curva vertical (PCV a PTV) sobre o greide.
 design.forEach((p,i)=>{
  if(!i||i===design.length-1||!(p.L>0))return;
  const s0=p.u*length-p.L/2,s1=p.u*length+p.L/2,inside=a.filter(q=>q.s>=s0-1e-6&&q.s<=s1+1e-6);
  if(inside.length>1)html+='<polyline data-vcurve="'+i+'" points="'+inside.map(q=>X(q.s)+','+Y(q.z)).join(' ')+'" fill="none" stroke="#f0a72c" stroke-width="8" stroke-linecap="round" opacity=".38"/>';
 });
 html+='<polyline points="'+a.map(p=>X(p.s)+','+Y(p.z)).join(' ')+'" fill="none" stroke="#168dda" stroke-width="3"/><path d="'+terrainPath+'" fill="none" stroke="#98774c" stroke-width="1.6"/>';
 html+='<polyline points="'+design.map(p=>X(p.u*length)+','+Y(p.z)).join(' ')+'" fill="none" stroke="#888" stroke-dasharray="4 5"/>';
 // Rampa de cada tangente, quando há espaço para o número.
 for(let i=1;i<design.length;i++){
  const p0=design[i-1],p1=design[i],x0=X(p0.u*length),x1=X(p1.u*length),d=(p1.u-p0.u)*length;if(x1-x0<44||!(d>0))continue;
  const g=100*(p1.z-p0.z)/d,ym=(Y(p0.z)+Y(p1.z))/2;
  html+='<text data-grade="'+i+'" x="'+((x0+x1)/2)+'" y="'+(ym-8)+'" fill="currentColor" font-size="10.5" text-anchor="middle" style="pointer-events:none;paint-order:stroke" stroke="var(--panel,#fff)" stroke-width="3">'+(g>=0?'+':'−')+Math.abs(g).toFixed(1).replace('.',',')+'%</text>';
 }
 design.forEach((p,i)=>html+='<circle data-pvi="'+i+'" cx="'+X(p.u*length)+'" cy="'+Y(p.z)+'" r="'+(i===s.selected?7:5)+'" fill="'+(p.fixed?'#888':'#f0a72c')+'" stroke="white" stroke-width="1.5" style="cursor:ns-resize"><title>PVI '+i+' · '+(p.u*length).toFixed(1)+' m · '+p.z.toFixed(2)+' m'+(p.fixed?' · fixo':'')+'</title></circle>');
 html+='<text x="50" y="225" fill="currentColor" font-size="12">0 m</text><text x="860" y="225" fill="currentColor" font-size="12">'+length.toFixed(1)+' m</text>';
 svg.innerHTML=html;
 const p=design[s.selected]||design[0];panel.querySelector('[data-z]').value=p.z.toFixed(3);panel.querySelector('[data-station]').value=(p.u*length).toFixed(2);panel.querySelector('[data-L]').value=p.L.toFixed(2);panel.querySelector('[data-fixed]').checked=p.fixed;
 // Rampas de chegada e de saída e o K da curva do PVI selecionado.
 const k=s.selected,prev=design[k-1],next=design[k+1],gin=prev?100*(p.z-prev.z)/((p.u-prev.u)*length):null,gout=next?100*(next.z-p.z)/((next.u-p.u)*length):null,
  pct=v=>(v>=0?'+':'−')+Math.abs(v).toFixed(2).replace('.',',')+'%',A=gin!=null&&gout!=null?gout-gin:null;
 panel.querySelector('[data-point]').textContent='PVI '+s.selected;
 const facts=panel.querySelector('[data-facts]');
 if(facts)facts.textContent=[gin!=null?'chega '+pct(gin):'',gout!=null?'sai '+pct(gout):'',A!=null&&Math.abs(A)>1e-6&&p.L>0?'curva '+(A>0?'côncava':'convexa')+' · K '+(p.L/Math.abs(A)).toFixed(1).replace('.',',')+' m/%':''].filter(Boolean).join(' · ');
 panel.querySelector('[data-undo]').disabled=!s.history.length;
}
function position(e){const b=svg.getBoundingClientRect();return {x:(e.clientX-b.left)*1000/b.width,y:(e.clientY-b.top)*240/b.height};}
function install(){
 panel=document.createElement('section');panel.style.cssText='position:fixed;left:280px;right:24px;bottom:52px;z-index:12150;background:var(--panel,#f5f8fa);color:var(--ink,#172332);border:1px solid #8293a5;border-radius:8px;padding:10px;font-weight:400;box-shadow:0 4px 24px #0004;max-height:55vh;overflow:auto';
 panel.innerHTML='<div style="display:flex;gap:8px;align-items:center"><b style="flex:1">Perfil da estrada · edição dinâmica</b><button data-horizontal>Editar eixo no mapa</button><button data-undo>Desfazer</button><button data-close>Fechar</button></div><div style="font-size:12px">Marrom: MDT · azul: greide · vermelho: corte · verde: aterro · faixa laranja: curva vertical · tracejado: tangentes. Arraste um PVI na vertical; ao soltar, os taludes são recalculados. Duplo clique adiciona PVI. Altura exagerada.</div><svg data-plot viewBox="0 0 1000 240" style="width:100%;height:230px;touch-action:none;display:block"></svg><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b data-point></b><span data-facts style="font-size:12px;opacity:.85;flex-basis:100%;order:9"></span><label>Estaca (m) <input data-station type="number" step="1" style="width:95px"></label><label>Cota PVI (m) <input data-z type="number" step="0.1" style="width:100px"></label><label>Curva vertical L (m) <input data-L type="number" min="0" step="1" style="width:95px"></label><label><input data-fixed type="checkbox"> Cota fixa</label><button data-update>Atualizar ponto</button><button data-remove>Remover PVI</button></div><div data-msg role="status" style="font-size:12px;margin-top:6px"></div>';
 panel.querySelectorAll('button').forEach(b=>{b.classList.add('mini');b.style.cssText='width:auto;flex:none;margin:0;padding:6px 10px';});document.body.appendChild(panel);svg=panel.querySelector('svg');
 panel.querySelector('[data-close]').onclick=hide;
 panel.querySelector('[data-horizontal]').onclick=()=>{session.horizontal=!session.horizontal;mapHandles();message(session.horizontal?'Arraste os PIs no mapa. Ao soltar, curvas, greide e taludes são atualizados. Estacas verticais acompanham a posição proporcional no eixo.':'Edição horizontal encerrada.');window.GeoMineRoadGeometry?.refresh();};
 panel.querySelector('[data-undo]').onclick=()=>{try{if(undo())message('Alteração desfeita; taludes restaurados.');}catch(e){message(e.message);}};
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
 const controls=s.C.horizontalControls;if(!controls?.length){s.horizontal=false;message('Para editar os PIs horizontais deste eixo antigo, gere novamente o alinhamento A→B.',true);return;}
 markers=L2.layerGroup().addTo(map);
 controls.forEach((p,i)=>{
  const q=toWGS(S.workCRS,p.x,p.y),m=L2.marker([q[1],q[0]],{draggable:true,icon:L2.divIcon({className:'',html:'<div style="background:#ed9b24;color:#18232a;border:2px solid white;border-radius:50%;width:24px;height:24px;text-align:center;font-weight:bold">'+i+'</div>',iconSize:[24,24],iconAnchor:[12,12]})}).addTo(markers);
  m.on('drag',()=>{const ll=m.getLatLng(),xy=fromWGS(S.workCRS,ll.lng,ll.lat),c=copy(controls);c[i].x=xy[0];c[i].y=xy[1];if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=0;try{previewAxis(build(check(),s.design,c).axis);message('Prévia do eixo. Solte para atualizar os taludes.');}catch(e){clearPreview();message(e.message,true);}});});
  m.on('dragend',()=>{if(frame)cancelAnimationFrame(frame);frame=0;clearPreview();try{const ll=m.getLatLng(),xy=fromWGS(S.workCRS,ll.lng,ll.lat),c=copy(controls);c[i].x=xy[0];c[i].y=xy[1];apply(s.design,c);}catch(e){message(e.message,true);mapHandles();}});
 });
}
function close(){if(frame)cancelAnimationFrame(frame);frame=0;drag=null;clearPreview();if(markers)markers.remove();markers=null;if(panel)panel.remove();panel=svg=null;session=null;dormant=null;window.GeoMineRoadGeometry?.refresh();}
// Sem perfil e sem PIs no mapa a sessão descansa: fica o histórico, sai a referência ao MDT.
function rest(){
 if(!session||panel||session.horizontal)return;
 dormant={C:session.C,project:session.project,history:session.history};session=null;
}
/* "Fechar" do perfil: tira o painel e os PIs do mapa, como sempre, mas conserva
   o histórico — o Desfazer dos cards continua valendo para a mesma estrada. */
function hide(){
 if(frame)cancelAnimationFrame(frame);frame=0;drag=null;clearPreview();
 if(markers)markers.remove();markers=null;if(panel)panel.remove();panel=svg=null;
 const back=session?.back;
 if(session){session.horizontal=false;session.draft=null;session.back=null;}
 rest();
 window.GeoMineRoadGeometry?.refresh();
 if(back?.btn?.isConnected&&back.sec?.id==='secCivil'&&typeof ribbonOpen==='function'&&!(typeof RIB!=='undefined'&&RIB.sec)){
  try{ribbonOpen(back.sec,back.btn,back.title);document.getElementById('civVerticalCard')?.scrollIntoView({block:'start'});}catch(_){}
 }
}
// Quantas alterações o Desfazer ainda tem para a estrada e o projeto atuais.
function undoDepth(){
 try{const h=session||dormant;return h&&h.C===S._civ&&h.project===S.projectId?h.history.length:0;}catch(_){return 0;}
}
/* Sessão de edição da estrada atual. Com o perfil aberto é a dele; sem o
   perfil, os cards da estrada usam a mesma sessão (mesmo histórico de
   Desfazer), sem painel na tela. */
function begin(){
 const C=GeoMineCivil.current(),R=civMdt();
 if(session&&session.C===C&&session.R===R&&session.grid===R?.d&&session.project===S.projectId)return session;
 if(!C.eixo?.length||!R)throw Error('Gere o eixo da estrada e selecione o MDT.');if(C.crs!==S.workCRS)throw Error('Volte ao CRS da estrada: '+C.crs);
 if(!GeoMineCivil.readParams(C)){const e=Error('Confira os parâmetros da estrada.');e.silent=true;throw e;}
 // O histórico acompanha a estrada: vale ao reabrir a sessão e ao trocar de MDT.
 const kept=session||dormant,history=kept&&kept.C===C&&kept.project===S.projectId?kept.history:[];
 close();
 session={C,R,grid:R.d,project:S.projectId,design:copy(C.verticalDesign||initial(C.eixo)),history,selected:0,horizontal:false};
 return session;
}
function open(){
 // Sem eixo, sem MDT ou com parâmetro inválido nada muda: só o aviso (o histórico do Desfazer fica).
 let s;try{s=begin();}catch(e){if(!e.silent)toast(e.message);return;}
 try{
  // Aberto a partir do painel da estrada: "Fechar" devolve o painel, no card do alinhamento vertical.
  if(typeof RIB!=='undefined'&&RIB.sec?.id==='secCivil'&&RIB.btn)s.back={sec:RIB.sec,btn:RIB.btn,title:document.querySelector('#ribbonPop b')?.textContent||'Estrada'};
  if(typeof ribbonClose==='function')ribbonClose();if(!panel)install();draw();mapHandles();
  message('Perfil da estrada carregado. A edição preserva os raios e verifica a rampa máxima. Curvas verticais são parabólicas; visibilidade e velocidade de projeto ainda exigem verificação.');
  window.GeoMineRoadGeometry?.refresh();
 }catch(e){close();toast(e.message);}
}
/* Aplicação pedida pelos cards: novos PIs/raios (controls) e/ou novo greide
   (design). Lança o mesmo erro que o perfil mostraria; quem chama exibe. */
function update(change={}){
 const s=begin();s.quiet=true;
 try{apply(change.design?copy(change.design):copy(s.design),change.controls?copy(change.controls):undefined);}
 finally{s.quiet=false;rest();}
 return s.C;
}
/* Liga ou desliga os PIs arrastáveis no mapa, com ou sem o perfil aberto. */
function horizontal(on){
 const s=begin();
 try{
  const want=on==null?!s.horizontal:!!on;
  if(want&&!(s.C.horizontalCurved&&s.C.horizontalControls?.length))throw Error('Este eixo não tem PIs editáveis. Gere o traçado pelo MDT de novo.');
  s.horizontal=want;mapHandles();return s.horizontal;
 }finally{rest();}
}
function undo(){
 const s=begin();
 try{
  check();
  const old=s.history.pop();if(!old)return false;
  Object.assign(s.C,old);s.design=copy(s.C.verticalDesign||initial(s.C.eixo));s.selected=0;writeLayers(s);draw();mapHandles();return true;
 }finally{rest();}
}
document.getElementById('btnCivProfile').onclick=open;
window.GeoMineRoadEditor={open,close,hide,vertical,initial,apply,update,horizontal,undo,minRadius,get state(){return session;},get undoDepth(){return undoDepth();},get canUndo(){return undoDepth()>0;}};
})();
