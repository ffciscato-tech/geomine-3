/* Elementos dos alinhamentos da estrada e os cards "Alinhamento horizontal" e
   "Alinhamento vertical" do painel CIVIL → Estrada (19/11/2026).

   O que este arquivo faz
   - horizontalElements: dos PIs (cada um com o raio da sua curva) tira a
     deflexão, o raio R, a tangente T, o desenvolvimento D e as estacas do PC e
     do PT, além do maior raio que ainda cabe em cada PI com os vizinhos como
     estão. As condições de "cabe" são as mesmas de civCurvasTangentes.
   - verticalElements: dos PVIs tira a rampa que chega e a que sai, a diferença
     algébrica A, o comprimento L, K = L/|A|, o tipo (côncava ou convexa), PCV,
     PTV e o maior L que cabe sem encostar na curva vizinha. As condições são
     as mesmas de GeoMineRoadEditor.vertical.
   - Os dois cards mostram essas tabelas e deixam trocar o raio de cada curva
     horizontal e o L de cada curva vertical. Quem aplica é
     GeoMineRoadEditor.update — a rotina do perfil: mesmas conferências
     (MDT, rampa máxima, curvas que não cabem) e o mesmo Desfazer.
   - O card do alinhamento vertical traz um perfil resumido (terreno, greide,
     corte e aterro); tocar nele abre o perfil completo para editar.

   O que ele NÃO faz: não confere velocidade de projeto, distância de
   visibilidade, superelevação, superlargura nem curva de transição. As
   tabelas descrevem a geometria; o julgamento de norma é do projetista. */
(function(root){
'use strict';
const deg=r=>r*180/Math.PI;
function azimuth(dx,dy){const a=deg(Math.atan2(dx,dy));return a<0?a+360:a;}
const ownRadius=p=>Number.isFinite(p?.r)&&p.r>0;

/* controls: [{x,y,r?}] do início (A) ao fim (B). general: raio das curvas sem
   raio próprio. Os índices devolvidos são os dos controles recebidos, os
   mesmos números que aparecem nos PIs do mapa. */
function horizontalElements(controls,general){
 const pts=(controls||[]).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y));
 if(pts.length<2||!(general>0))return null;
 // PIs em linha reta com os vizinhos não têm curva: saem da conta, como no traçado.
 const keep=pts.map((_,i)=>i);
 for(let k=1;k<keep.length-1;){
  const a=pts[keep[k-1]],b=pts[keep[k]],c=pts[keep[k+1]],ux=b.x-a.x,uy=b.y-a.y,vx=c.x-b.x,vy=c.y-b.y;
  if(Math.abs(ux*vy-uy*vx)<1e-7*Math.hypot(ux,uy)*Math.hypot(vx,vy)&&ux*vx+uy*vy>0)keep.splice(k,1);else k++;
 }
 const n=keep.length,leg=[0];
 for(let k=1;k<n;k++)leg.push(Math.hypot(pts[keep[k]].x-pts[keep[k-1]].x,pts[keep[k]].y-pts[keep[k-1]].y));
 const curve=keep.map(()=>null);let degenerate=false;
 for(let k=1;k<n-1;k++){
  const a=pts[keep[k-1]],b=pts[keep[k]],c=pts[keep[k+1]],l1=leg[k],l2=leg[k+1];
  if(!(l1>0)||!(l2>0)){degenerate=true;continue;}
  const ux=(b.x-a.x)/l1,uy=(b.y-a.y)/l1,vx=(c.x-b.x)/l2,vy=(c.y-b.y)/l2;
  const angle=Math.acos(Math.max(-1,Math.min(1,ux*vx+uy*vy)));if(angle<1e-8)continue;
  const R=ownRadius(b)?b.r:general,half=Math.tan(angle/2);
  // x = leste, y = norte: produto vetorial positivo é giro anti-horário, isto é, curva à esquerda.
  curve[k]={index:keep[k],x:b.x,y:b.y,deflection:angle,side:ux*vy-uy*vx>0?'E':'D',radius:R,own:ownRadius(b),half,
   tangent:R*half,length:R*angle,external:R*(1/Math.cos(angle/2)-1),azimuthIn:azimuth(ux,uy),azimuthOut:azimuth(vx,vy)};
 }
 const free=[0];for(let k=1;k<n;k++)free.push(leg[k]-(curve[k-1]?.tangent||0)-(curve[k]?.tangent||0));
 let pos=0,run=0,previous=null,straight=0,curved=0;const tangents=[],curves=[];
 for(let k=1;k<n;k++){
  const q=curve[k];run+=free[k];pos+=free[k];
  if(!q&&k<n-1)continue;
  tangents.push({from:previous?previous.index:keep[0],to:q?q.index:keep[n-1],length:run});straight+=run;
  if(previous)previous.tangentAfter=run;
  if(!q)break;
  q.tangentBefore=run;q.pc=pos;pos+=q.length;q.pt=pos;curved+=q.length;
  q.fits=q.tangent<Math.min(leg[k],leg[k+1])&&free[k]>=1e-6&&free[k+1]>=1e-6;
  const room=Math.min(leg[k]-(curve[k-1]?.tangent||0),leg[k+1]-(curve[k+1]?.tangent||0))-1e-6;
  q.maxRadius=room>0?room/q.half:0;
  curves.push(q);previous=q;run=0;
 }
 return {points:pts.length,total:pos,straight,curved,tangents,curves,degenerate,
  fits:!degenerate&&curves.every(q=>q.fits),minRadius:curves.length?Math.min(...curves.map(q=>q.radius)):null};
}

/* design: [{u,z,L,fixed}] com u de 0 a 1 ao longo do eixo; total: comprimento
   do eixo em planta (m); maxGrade: rampa máxima dos critérios (%). */
function verticalElements(design,total,maxGrade){
 if(!Array.isArray(design)||design.length<2||!(total>0))return null;
 const pv=design.map(p=>({s:p.u*total,z:p.z,L:Number.isFinite(p.L)&&p.L>0?p.L:0,fixed:!!p.fixed})),n=pv.length,grades=[];
 for(let i=1;i<n;i++){const d=pv[i].s-pv[i-1].s;grades.push(d>0?100*(pv[i].z-pv[i-1].z)/d:NaN);}
 const half=i=>i>0&&i<n-1?pv[i].L/2:0;
 const points=pv.map((p,i)=>{
  const end=i===0||i===n-1,gradeIn=i?grades[i-1]:null,gradeOut=i<n-1?grades[i]:null,A=end?null:gradeOut-gradeIn;
  if(end)return {index:i,end,station:p.s,z:p.z,fixed:p.fixed,gradeIn,gradeOut,A,L:0,K:null,kind:'extremo',pcv:p.s,ptv:p.s,ordinate:0,maxL:0,fits:true,missingCurve:false};
  // Em cada intervalo, as duas meias-curvas não podem passar da distância entre os PVIs.
  const room=2*(Math.min(p.s-pv[i-1].s-half(i-1),pv[i+1].s-p.s-half(i+1))-1e-7),curved=Math.abs(A)>1e-6;
  return {index:i,end,station:p.s,z:p.z,fixed:p.fixed,gradeIn,gradeOut,A,L:p.L,
   K:curved&&p.L>0?p.L/Math.abs(A):null,kind:!curved?'reta':A>0?'côncava':'convexa',
   pcv:p.s-p.L/2,ptv:p.s+p.L/2,ordinate:curved?Math.abs(A)/100*p.L/8:0,maxL:Math.max(0,room),
   fits:p.L<=room+1e-9,missingCurve:Math.abs(A)/100>1e-8&&p.L<.1};
 });
 const finite=grades.filter(Number.isFinite),steepest=finite.length?Math.max(...finite.map(Math.abs)):0;
 // A curva mais fechada do greide: menor K e o PVI onde ela está.
 const sharpest=points.filter(p=>p.K!=null).reduce((best,p)=>!best||p.K<best.K?p:best,null);
 return {total,points,grades,maxGrade:steepest,limit:maxGrade,over:Number.isFinite(maxGrade)&&steepest>maxGrade+1e-6,
  minK:sharpest?sharpest.K:null,minKIndex:sharpest?sharpest.index:null,rise:pv[n-1].z-pv[0].z,fits:points.every(p=>p.fits)};
}
root.GeoMineRoadGeometry={horizontalElements,verticalElements};
if(typeof document==='undefined')return;

/* ------------------------- cards do painel ------------------------- */
const el=id=>document.getElementById(id),copy=x=>JSON.parse(JSON.stringify(x));
const nf=(v,d=1)=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d});
const pct=v=>(v>=0?'+':'−')+nf(Math.abs(v),2)+'%';
const signed=v=>(v>=0?'+':'−')+nf(Math.abs(v));
const num=v=>{const t=String(v??'').trim().replace(',','.');return t===''?NaN:Number(t);};   // campo vazio não é zero
const plain=v=>String(Math.round(v*100)/100);   // valor do campo: duas casas, como no perfil
const MAX_ROWS=80,shown={road:null,hz:null,vt:null,terrain:0};
// Identidade da grade do MDT sem guardar a grade (ela pode ter centenas de MB).
const gridIds=new WeakMap();let gridCount=0;
const gridId=g=>{if(!g)return 0;if(!gridIds.has(g))gridIds.set(g,++gridCount);return gridIds.get(g);};
const editor=()=>root.GeoMineRoadEditor;
function road(){try{return S._civ||null;}catch(_){return null;}}
function session(C){const s=editor()?.state;return s&&s.C===C?s:null;}
// Lê o MDT escolhido sem refazer a lista do seletor (civMdt() a reescreve).
function terrain(){const id=el('civMdtSel')?.value;return id?(S.rasters||[]).find(r=>String(r.id)===id&&r.d)||null:null;}
function liveMinRadius(C){
 const r=num(el('civRaioMin')?.value),w=num(el('civW')?.value),p=C?.params||{};
 return Math.max((Number.isFinite(r)?r:p.civRaioMin)||60,(Number.isFinite(w)&&w>0?w:p.civW||8)/2+1);
}
function liveMaxGrade(C){const g=num(el('civG')?.value);return Number.isFinite(g)&&g>0?g:C?.params?.civG||8;}
function axisLength(axis){let s=0;for(let i=1;i<axis.length;i++)s+=Math.hypot(axis[i].x-axis[i-1].x,axis[i].y-axis[i-1].y);return s;}
function say(id,text,kind){const box=el(id);if(!box)return;box.textContent=text||'';box.dataset.kind=kind||'';}
function designOf(C){
 if(Array.isArray(C.verticalDesign)&&C.verticalDesign.length>1)return C.verticalDesign;
 try{return editor().initial(C.eixo);}catch(_){return null;}
}
// Maior corte e maior aterro no eixo (terreno menos greide), com a estaca de cada um.
function earthwork(C,grid){
 const a=C.eixo;let s=0,cut=0,fill=0,cutAt=0,fillAt=0,seen=0;
 for(let i=0;i<a.length;i++){
  if(i)s+=Math.hypot(a[i].x-a[i-1].x,a[i].y-a[i-1].y);
  const t=civSample(grid,a[i].x,a[i].y);if(!Number.isFinite(t))continue;seen++;
  const d=t-a[i].z;if(d>cut){cut=d;cutAt=s;}if(-d>fill){fill=-d;fillAt=s;}
 }
 return seen?{cut,fill,cutAt,fillAt}:null;
}

/* Perfil resumido do card: só leitura. No máximo ~400 amostras do eixo, o
   bastante para a largura do card; as cotas vêm do eixo e do MDT escolhido. */
function miniProfile(C,grid,v){
 const axis=C.eixo,step=Math.max(1,Math.floor(axis.length/400)),a=[],s=[];let run=0;
 for(let i=0;i<axis.length;i++){
  if(i)run+=Math.hypot(axis[i].x-axis[i-1].x,axis[i].y-axis[i-1].y);
  if(i%step===0||i===axis.length-1){a.push(axis[i]);s.push(run);}
 }
 const total=s.at(-1);if(!(total>0))return '';
 const t=grid?a.map(p=>civSample(grid,p.x,p.y)):null;
 let lo=Infinity,hi=-Infinity;
 for(let i=0;i<a.length;i++)for(const z of [a[i].z,t?t[i]:NaN])if(Number.isFinite(z)){lo=Math.min(lo,z);hi=Math.max(hi,z);}
 const pad=Math.max(1,(hi-lo)*.08);lo-=pad;hi+=pad;
 const X=q=>(6+308*q/total).toFixed(1),Y=z=>(88-80*(z-lo)/(hi-lo)).toFixed(1);
 let cut='',fill='',ground='';
 if(t)for(let i=0;i<a.length;i++){
  if(Number.isFinite(t[i]))ground+=(i&&Number.isFinite(t[i-1])?'L':'M')+X(s[i])+','+Y(t[i]);
  if(!i||!Number.isFinite(t[i])||!Number.isFinite(t[i-1]))continue;
  const d='M'+X(s[i-1])+','+Y(t[i-1])+'L'+X(s[i])+','+Y(t[i])+'L'+X(s[i])+','+Y(a[i].z)+'L'+X(s[i-1])+','+Y(a[i-1].z)+'Z';
  if(t[i-1]+t[i]>a[i-1].z+a[i].z)cut+=d;else fill+=d;
 }
 const grade=a.map((p,i)=>(i?'L':'M')+X(s[i])+','+Y(p.z)).join('');
 const dots=v.points.length<=MAX_ROWS?v.points.map(p=>'<circle cx="'+X(p.station)+'" cy="'+Y(p.z)+'" r="'+(p.end?2.6:2)+'" fill="'+(p.end||p.fixed?'#888':'#f0a72c')+'"/>').join(''):'';
 const key=(color,name)=>'<span><i style="background:'+color+'"></i>'+name+'</span>';
 return '<svg viewBox="0 0 320 96" role="img" aria-label="Perfil resumido da estrada: terreno e greide">'+
  (cut?'<path d="'+cut+'" fill="#c8553d" opacity=".4"/>':'')+(fill?'<path d="'+fill+'" fill="#3f9d5a" opacity=".4"/>':'')+
  (ground?'<path d="'+ground+'" fill="none" stroke="#98774c" stroke-width="3.2" stroke-linejoin="round" opacity=".6"/>':'')+
  '<path d="'+grade+'" fill="none" stroke="#168dda" stroke-width="1.3" stroke-linejoin="round"/>'+dots+'</svg>'+
  '<div class="civ-legend">'+(ground?key('#98774c','terreno'):'')+key('#168dda','greide')+(t?key('#c8553d','corte')+key('#3f9d5a','aterro'):'')+'<span>altura exagerada</span></div>';
}

function renderHorizontal(C){
 const rows=el('civHzRows'),summary=el('civHzSummary'),apply=el('civHzApply'),pis=el('civHzPis'),undo=el('civHzUndo');
 if(!rows||!summary)return;
 const controls=C.horizontalCurved&&Array.isArray(C.horizontalControls)&&C.horizontalControls.length>1?C.horizontalControls:null;
 const moving=!!session(C)?.horizontal;
 if(pis){pis.classList.toggle('on',moving);pis.textContent=moving?'Concluir movimento dos PIs':'Mover PIs no mapa';pis.setAttribute('aria-pressed',String(moving));pis.disabled=!controls;}
 if(undo)undo.disabled=!editor()?.canUndo;
 const min=liveMinRadius(C),sig=JSON.stringify([C.id,controls&&controls.map(p=>[p.x,p.y,p.r||0]),min,C.eixo.length]);
 if(sig===shown.hz)return;shown.hz=sig;
 if(apply)apply.disabled=true;
 if(!controls){
  summary.innerHTML='<b>'+nf(axisLength(C.eixo))+' m</b> de eixo, sem PIs editáveis: este eixo veio de uma camada ou de uma versão antiga. Gere o traçado pelo MDT para editar as curvas.';
  rows.innerHTML='';say('civHzStatus','');return;
 }
 const h=horizontalElements(controls,min);
 if(!h){summary.textContent='';rows.innerHTML='';return;}
 const count=h.curves.length;
 summary.innerHTML='<b>'+nf(h.total)+' m</b> de eixo · '+(count?count+(count>1?' curvas':' curva')+' · '+nf(h.straight)+' m em tangente · '+nf(h.curved)+' m em curva · menor raio <b>'+nf(h.minRadius)+' m</b> (mínimo dos critérios: '+nf(min)+' m)':'traçado reto de A a B, sem curvas');
 rows.innerHTML=h.curves.map(q=>{
  const warn=[];
  if(q.radius<min-1e-9)warn.push('Abaixo do raio mínimo dos critérios ('+nf(min)+' m).');
  if(!q.fits)warn.push('Esta curva não cabe entre os PIs vizinhos.');
  return '<div class="civ-row" data-pi="'+q.index+'"><div class="civ-row-main"><b>PI '+q.index+'</b><span>'+nf(deg(q.deflection))+'° '+(q.side==='E'?'à esquerda':'à direita')+'</span>'+
   '<label class="civ-row-field">R <input type="number" inputmode="decimal" step="any" min="0" value="'+plain(q.radius)+'" data-radius="'+q.index+'" data-applied="'+plain(q.radius)+'" aria-label="Raio da curva do PI '+q.index+', em metros"> m</label></div>'+
   '<div class="civ-row-detail">T '+nf(q.tangent)+' m · D '+nf(q.length)+' m · PC '+nf(q.pc)+' · PT '+nf(q.pt)+' · cabe até '+nf(Math.floor(q.maxRadius*10)/10)+' m</div>'+
   (warn.length?'<div class="civ-row-warn">'+warn.join(' ')+'</div>':'')+'</div>';
 }).join('');
}

function renderVertical(C){
 const rows=el('civVtRows'),summary=el('civVtSummary'),apply=el('civVtApply'),undo=el('civVtUndo'),state=el('civAlignState');
 if(!rows||!summary)return;
 if(undo)undo.disabled=!editor()?.canUndo;
 if(state)state.textContent=C.alignmentConfirmed?'✓ Alinhamento e greide confirmados. Se mudar curvas ou greide, gere o corredor de novo.':'Revise as curvas e o greide. Ao confirmar, o card do corredor é liberado.';
 const total=axisLength(C.eixo),limit=liveMaxGrade(C),R=terrain(),grid=R?R.d:null,design=designOf(C);
 let zsum=0;for(const p of C.eixo)zsum+=p.z;
 const sig=JSON.stringify([C.id,design,Math.round(total*1e4),limit,C.eixo.length,Math.round(zsum*1e3)]);
 if(sig===shown.vt&&shown.terrain===gridId(grid))return;shown.vt=sig;shown.terrain=gridId(grid);
 if(apply)apply.disabled=true;
 const v=design&&verticalElements(design,total,limit),mini=el('civVtMini');
 if(!v){summary.textContent='Greide indisponível para este eixo.';rows.innerHTML='';if(mini)mini.innerHTML='';return;}
 if(mini)mini.innerHTML=miniProfile(C,grid,v);
 const interior=v.points.length-2,e=grid?earthwork(C,grid):null;
 summary.innerHTML='Rampa máx. <b>'+nf(v.maxGrade,2)+'%</b> (limite '+nf(limit)+'%) · '+interior+(interior===1?' PVI':' PVIs')+' · desnível '+signed(v.rise)+' m'+
  (v.minK!=null?' · menor K '+nf(v.minK)+' m/% (PVI '+v.minKIndex+')':'')+
  (e?' · no eixo: corte até <b>'+nf(e.cut)+' m</b> (est. '+nf(e.cutAt,0)+') e aterro até <b>'+nf(e.fill)+' m</b> (est. '+nf(e.fillAt,0)+')':'')+
  (v.over?'<div class="civ-row-warn">Há rampa acima do limite dos critérios.</div>':'');
 if(v.points.length>MAX_ROWS){rows.innerHTML='<div class="civ-row"><div class="civ-row-detail">'+interior+' PVIs: abra o perfil para editar este greide.</div></div>';return;}
 const over=g=>Number.isFinite(g)&&Math.abs(g)>limit+1e-6;
 rows.innerHTML=v.points.map(p=>{
  if(p.end)return '<div class="civ-row"><div class="civ-row-main"><b>'+(p.index?'Fim':'Início')+'</b><span>est. '+nf(p.station)+' · cota '+nf(p.z,2)+' m</span></div>'+
   '<div class="civ-row-detail">'+(p.index?'chega '+pct(p.gradeIn):'sai '+pct(p.gradeOut))+'</div></div>';
  const warn=[];
  if(p.missingCurve)warn.push('Falta o comprimento da curva vertical.');
  if(!p.fits)warn.push('A curva encosta na curva vizinha.');
  if(over(p.gradeIn)||over(p.gradeOut))warn.push('Rampa acima do limite dos critérios.');
  return '<div class="civ-row" data-pvi="'+p.index+'"><div class="civ-row-main"><b>PVI '+p.index+'</b><span>est. '+nf(p.station)+' · cota '+nf(p.z,2)+' m'+(p.fixed?' · fixa':'')+'</span>'+
   '<label class="civ-row-field">L <input type="number" inputmode="decimal" step="any" min="0" value="'+plain(p.L)+'" data-vl="'+p.index+'" data-applied="'+plain(p.L)+'" aria-label="Comprimento da curva vertical do PVI '+p.index+', em metros"> m</label></div>'+
   '<div class="civ-row-detail">'+pct(p.gradeIn)+' → '+pct(p.gradeOut)+' · '+(p.kind==='reta'?'sem mudança de rampa':p.kind+(p.K!=null?' · K '+nf(p.K)+' m/%':''))+' · cabe até '+nf(Math.floor(p.maxL*10)/10)+' m</div>'+
   (warn.length?'<div class="civ-row-warn">'+warn.join(' ')+'</div>':'')+'</div>';
 }).join('');
}

function render(){
 const hz=el('civHorizontalCard'),vt=el('civVerticalCard');if(!hz||!vt)return;
 const C=road(),ready=!!(C?.eixo?.length>1&&!C.alignmentPending&&!root.GeoMineRoadAlternatives?.busy());
 if(!ready){
  if(shown.hz!==null||shown.vt!==null){for(const id of ['civHzRows','civVtRows','civHzSummary','civVtSummary','civVtMini'])if(el(id))el(id).innerHTML='';say('civHzStatus','');say('civVtStatus','');}
  shown.road=shown.hz=shown.vt=null;shown.terrain=0;return;
 }
 if(shown.road!==C.id){shown.road=C.id;shown.hz=shown.vt=null;say('civHzStatus','');say('civVtStatus','');}
 renderHorizontal(C);renderVertical(C);
}
// Chamado de pontos centrais do módulo de estradas: nunca pode interromper quem chamou.
function refresh(){try{render();}catch(e){console.warn('[GeoMine] cards dos alinhamentos da estrada:',e);}}

function hzApply(){
 const C=road();if(!C?.horizontalControls)return;
 const min=liveMinRadius(C),controls=copy(C.horizontalControls),changed=new Set();
 for(const input of el('civHzRows').querySelectorAll('input[data-radius]')){
  const i=Number(input.dataset.radius),v=num(input.value);
  // Só o que foi digitado é aplicado: o campo mostra o valor arredondado, o eixo guarda o exato.
  if(v===num(input.dataset.applied)||!controls[i])continue;
  if(!Number.isFinite(v)||v<=0){say('civHzStatus','Informe o raio da curva do PI '+i+', em metros.','erro');input.focus();return;}
  if(v<min-1e-9){say('civHzStatus','O raio do PI '+i+' ('+nf(v)+' m) é menor que o raio mínimo dos critérios ('+nf(min)+' m). Aumente o raio ou mude o raio mínimo no card dos critérios.','erro');input.focus();return;}
  controls[i].r=v;changed.add(i);
 }
 if(!changed.size){say('civHzStatus','Nenhum raio foi alterado.');return;}
 // Nomeia o PI que não cabe (de preferência o que foi alterado); a rotina do traçado confere de novo antes de aplicar.
 const loose=horizontalElements(controls,min)?.curves.filter(q=>!q.fits)||[],tight=loose.find(q=>changed.has(q.index))||loose[0];
 if(tight){say('civHzStatus','A curva do PI '+tight.index+' não cabe com R = '+nf(tight.radius)+' m: cada tangente pede '+nf(tight.tangent)+' m e, com as curvas vizinhas como estão, cabe até '+nf(Math.floor(tight.maxRadius*10)/10)+' m. Reduza este raio, o de uma curva vizinha, ou afaste os PIs no mapa.','erro');return;}
 const before=axisLength(C.eixo);
 try{
  editor().update({controls});
  const after=axisLength(C.eixo);
  say('civHzStatus','Raios aplicados. '+(Math.abs(after-before)<.05?'O comprimento do eixo ficou em '+nf(after)+' m.':'O eixo passou de '+nf(before)+' m para '+nf(after)+' m.')+(C.alignmentConfirmed?' Taludes redesenhados; gere o corredor de novo.':''),'ok');
 }catch(e){
  say('civHzStatus',e.message+(/rampa máxima/.test(e.message)?' O comprimento do eixo muda com o raio e a rampa passou do limite: alivie o greide desse trecho no perfil ou use outro raio.':''),'erro');
 }
}
function vtApply(){
 const C=road(),base=C&&designOf(C);if(!base)return;
 const design=copy(base),changed=new Set();
 for(const input of el('civVtRows').querySelectorAll('input[data-vl]')){
  const i=Number(input.dataset.vl),v=num(input.value);
  // Só o que foi digitado é aplicado: o campo mostra o valor arredondado, o greide guarda o exato.
  if(v===num(input.dataset.applied)||!design[i])continue;
  if(!Number.isFinite(v)||v<0){say('civVtStatus','Informe o comprimento da curva vertical do PVI '+i+', em metros.','erro');input.focus();return;}
  design[i].L=v;changed.add(i);
 }
 if(!changed.size){say('civVtStatus','Nenhuma curva vertical foi alterada.');return;}
 const v=verticalElements(design,axisLength(C.eixo),liveMaxGrade(C)),loose=v?.points.filter(p=>!p.fits)||[],tight=loose.find(p=>changed.has(p.index))||loose[0];
 if(tight){say('civVtStatus','A curva do PVI '+tight.index+' não cabe com L = '+nf(tight.L)+' m: ela encosta na curva vizinha. Com as vizinhas como estão, cabe até '+nf(Math.floor(tight.maxL*10)/10)+' m.','erro');return;}
 try{
  editor().update({design});
  const now=verticalElements(designOf(C),axisLength(C.eixo),liveMaxGrade(C));
  say('civVtStatus','Curvas verticais aplicadas.'+(now?.minK!=null?' Menor K: '+nf(now.minK)+' m/% (PVI '+now.minKIndex+').':'')+(C.alignmentConfirmed?' Taludes redesenhados; gere o corredor de novo.':''),'ok');
 }catch(e){say('civVtStatus',e.message,'erro');}
}
function togglePis(){
 try{
  const on=editor().horizontal();refresh();
  say('civHzStatus',on?'Arraste os PIs numerados no mapa. Ao soltar, as curvas (com o raio de cada uma), o greide e os taludes são atualizados.':'Movimento dos PIs encerrado.');
 }catch(e){refresh();say('civHzStatus',e.message,'erro');}
}
function undo(statusId){
 try{say(statusId,editor().undo()?'Última alteração desfeita.':'Nada para desfazer.');}
 catch(e){say(statusId,e.message,'erro');}
 refresh();
}
/* Recado do editor (arrasto dos PIs no mapa) quando o perfil está fechado. Se
   o card não estiver na tela, um erro vira aviso flutuante para não se perder. */
function status(text,alert){
 const box=el('civHzStatus');say('civHzStatus',text,alert?'erro':'');
 if(alert&&text&&!(box&&box.getClientRects().length)&&typeof toast==='function')toast(text);
}
function markDirty(rows,button){
 let any=false;
 for(const input of rows.querySelectorAll('input[data-applied]')){
  const changed=num(input.value)!==num(input.dataset.applied);
  input.closest('.civ-row')?.classList.toggle('dirty',changed);any=any||changed;
 }
 if(button)button.disabled=!any;
}
function bind(id,run){const b=el(id);if(b)b.onclick=run;}
for(const [rowsId,buttonId,run] of [['civHzRows','civHzApply',hzApply],['civVtRows','civVtApply',vtApply]]){
 const rows=el(rowsId);if(!rows)continue;
 rows.addEventListener('input',()=>markDirty(rows,el(buttonId)));
 rows.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches?.('input')){e.preventDefault();run();}});
 bind(buttonId,run);
}
bind('civHzPis',togglePis);bind('civHzUndo',()=>undo('civHzStatus'));bind('civVtUndo',()=>undo('civVtStatus'));
bind('civVtMini',()=>el('btnCivProfile')?.click());
el('civVtMini')?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el('btnCivProfile')?.click();}});
// Critérios e MDT mudam os avisos das tabelas, não o eixo.
for(const id of ['civRaioMin','civW','civG','civMdtSel'])el(id)?.addEventListener('change',refresh);
Object.assign(root.GeoMineRoadGeometry,{refresh,status});
refresh();
})(typeof window!=='undefined'?window:globalThis);
