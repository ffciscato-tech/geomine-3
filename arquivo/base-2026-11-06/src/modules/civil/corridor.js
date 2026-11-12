/* Fixed horizontal axis corridor. Areas integrate the terrain across the
   platform AND daylight slopes; incomplete sections never imply zero volume. */
(function(){
'use strict';
const el=id=>document.getElementById(id),clone=x=>JSON.parse(JSON.stringify(x));
let job=null,proposal=null;
function stations(axis,step,fixed=[]){
 if(!Array.isArray(axis)||axis.length<2||!axis.every(p=>[p.x,p.y,p.z].every(Number.isFinite)))throw Error('O eixo deve ser uma linha 3D com cotas válidas.');
 const chain=[0];for(let i=1;i<axis.length;i++){
  const d=Math.hypot(axis[i].x-axis[i-1].x,axis[i].y-axis[i-1].y);
  if(d<1e-6)throw Error('O eixo contém vértices consecutivos coincidentes.');chain.push(chain[i-1]+d);
 }
 const length=chain.at(-1);
 if(fixed.some(s=>!Number.isFinite(s)||s<0||s>length))throw Error('As estacas fixas devem estar entre 0 e '+length.toFixed(2)+' m.');
 const values=[...chain,...fixed];for(let s=step;s<length;s+=step)values.push(s);
 values.sort((a,b)=>a-b);
 const ss=values.filter((s,i)=>!i||s-values[i-1]>1e-6);
 if(ss.length>10000)throw Error('Aumente o intervalo das seções: o corredor terá mais de 10.000 seções.');
 let j=0;
 return ss.map((s,i)=>{
  while(j<axis.length-2&&chain[j+1]<s-1e-7)j++;
  const a=axis[j],b=axis[j+1],t=(s-chain[j])/(chain[j+1]-chain[j]);
  const fa=civRoadFrame(axis,j),fb=civRoadFrame(axis,j+1);
  const tx=fa.tx*(1-t)+fb.tx*t,ty=fa.ty*(1-t)+fb.ty*t,d=Math.hypot(tx,ty);
  if(d<1e-8)throw Error('O eixo contém uma inversão de direção.');
  return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,s,nx:-ty/d,ny:tx/d,curvature:fa.curvature*(1-t)+fb.curvature*t,fixed:i===0||i===ss.length-1||fixed.some(v=>Math.abs(v-s)<1e-6)};
 });
}
function section(g,p,z,o){
 const half=o.W/2,left=[p.x+p.nx*half,p.y+p.ny*half],right=[p.x-p.nx*half,p.y-p.ny*half];
 const l=civTaludeNaEstaca(g,left,[p.nx,p.ny],z,civSlopeOptions(o,p.curvature||0,1)),r=civTaludeNaEstaca(g,right,[-p.nx,-p.ny],z,civSlopeOptions(o,p.curvature||0,-1));
 if(!l?.inter||!r?.inter)return {valid:false,s:p.s,reason:l?.reason||r?.reason||'Talude sem encontro com terreno / MDT sem dados'};
 const convert=(a,sign)=>a.map(q=>({u:sign*(half+Math.hypot(q.x-(sign>0?left:right)[0],q.y-(sign>0?left:right)[1])),z:q.z}));
 const profile=[...convert([...r.pontos,r.inter],-1).reverse(),{u:-half,z},{u:half,z},...convert([...l.pontos,l.inter],1)];
 let cut=0,fill=0,metricCut=0,metricFill=0;
 const pts=[];
 for(let i=1;i<profile.length;i++){
  const a=profile[i-1],b=profile[i],span=b.u-a.u;if(span<1e-9)continue;
  const n=Math.max(1,Math.ceil(span/o.passo));let prev=null;
  for(let k=0;k<=n;k++){
   const u=a.u+span*k/n,h=a.z+(b.z-a.z)*k/n,t=civSample(g,p.x+p.nx*u,p.y+p.ny*u);
   if(!Number.isFinite(t))return {valid:false,s:p.s,reason:'MDT sem dados na seção'};
   if(prev){
    const du=span/n,d0=prev.d,d1=h-t,kappa=p.curvature||0,j0=1-kappa*prev.u,j1=1-kappa*u;
    if(j0<=0||j1<=0)return {valid:false,s:p.s,reason:'convergencia-curva'};
    const v=civVolumes(d0,d1,1,du);cut+=v.corte;fill+=v.aterro;
    const integral=(a,b,ja,jb,w)=>w*((a*ja+b*jb)/3+(a*jb+b*ja)/6);
    if(d0*d1<0){const f=Math.abs(d0)/(Math.abs(d0)+Math.abs(d1)),jm=j0+(j1-j0)*f,first=integral(d0,0,j0,jm,du*f),last=integral(0,d1,jm,j1,du*(1-f));metricCut+=Math.max(0,-first)+Math.max(0,-last);metricFill+=Math.max(0,first)+Math.max(0,last);}
    else{const v=integral(d0,d1,j0,j1,du);metricCut+=Math.max(0,-v);metricFill+=Math.max(0,v);}
   }
   prev={d:h-t,u};pts.push([p.x+p.nx*u,p.y+p.ny*u,h]);
  }
 }
 return {valid:true,s:p.s,z,cut,fill,metricCut,metricFill,left:[l.inter.x,l.inter.y,l.inter.z],right:[r.inter.x,r.inter.y,r.inter.z],points:pts};
}
const stripCache=new WeakMap(),overlapCache=new WeakMap();
function strip(a,b,index){
 let cache=stripCache.get(a);if(!cache){cache=new WeakMap();stripCache.set(a,cache);}
 const old=cache.get(b);if(old)return {...old,index,geometry:old};
 const poly=[a.left,b.left,b.right,a.right].map(p=>p.slice(0,2)),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]),
   area=poly.reduce((sum,p,i)=>sum+(p[0]-poly[0][0])*(poly[(i+1)%4][1]-poly[0][1])-(p[1]-poly[0][1])*(poly[(i+1)%4][0]-poly[0][0]),0)/2;
 const between=(a,b,c,d)=>cross(a,b,c)*cross(a,b,d)<-1e-12&&cross(c,d,a)*cross(c,d,b)<-1e-12;
 let folded=Math.abs(area)<1e-8||between(poly[0],poly[1],poly[2],poly[3])||between(poly[1],poly[2],poly[3],poly[0]);
 const triangles=[];
 if(!folded){
   const vertices=area>0?poly.slice():poly.slice().reverse(),inside=(p,a,b,c)=>cross(a,b,p)>=-1e-8&&cross(b,c,p)>=-1e-8&&cross(c,a,p)>=-1e-8;
   for(let i=0;i<4;i++){
     const a=vertices[(i+3)%4],b=vertices[i],c=vertices[(i+1)%4],d=vertices[(i+2)%4];
     if(cross(a,b,c)>1e-8&&!inside(d,a,b,c)){triangles.push([a,b,c],[a,c,d]);break;}
   }
   if(!triangles.length)folded=true;
 }
 const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]),q={poly,triangles,folded,minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)};
 cache.set(b,q);return {...q,index,geometry:q};
}
function positiveOverlap(a,b){
 const ga=a.geometry||a,gb=b.geometry||b;let cache=overlapCache.get(ga);if(!cache){cache=new WeakMap();overlapCache.set(ga,cache);}
 if(cache.has(gb))return cache.get(gb);
 const compute=()=>{
 if(a.maxX<=b.minX+1e-7||b.maxX<=a.minX+1e-7||a.maxY<=b.minY+1e-7||b.maxY<=a.minY+1e-7)return false;
 // Strict separating-axis test ignores a shared station edge (zero area).
 const overlap=(u,v)=>{
   for(const t of [u,v])for(let i=0;i<3;i++){
     const p=t[i],q=t[(i+1)%3],nx=q[1]-p[1],ny=p[0]-q[0],len=Math.hypot(nx,ny);
     if(len<1e-9)continue;
     const project=t=>t.map(r=>((r[0]-p[0])*nx+(r[1]-p[1])*ny)/len),pu=project(u),pv=project(v);
     if(Math.min(Math.max(...pu),Math.max(...pv))-Math.max(Math.min(...pu),Math.min(...pv))<=1e-7)return false;
   }
   return true;
 };
 return a.triangles.some(u=>b.triangles.some(v=>overlap(u,v)));
 };
 const result=compute();cache.set(gb,result);return result;
}
function validateStrips(sections){
 const invalid=new Set(),strips=[];let folded=0,overlaps=0;
 for(let i=1;i<sections.length;i++){
   const a=sections[i-1],b=sections[i];if(!a.valid||!b.valid)continue;
   const q=strip(a,b,i);if(q.folded){invalid.add(i);folded++;}else strips.push(q);
 }
 if(strips.length>1){
   const widths=strips.map(q=>Math.max(q.maxX-q.minX,q.maxY-q.minY)).sort((a,b)=>a-b),cell=Math.max(2,widths[widths.length>>1]||2),bins=new Map();
   for(const q of strips){
     const x0=Math.floor(q.minX/cell),x1=Math.floor(q.maxX/cell),y0=Math.floor(q.minY/cell),y1=Math.floor(q.maxY/cell),seen=new Set();
     for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
       const key=x+','+y,list=bins.get(key)||[];
       for(const other of list)if(!seen.has(other.index)){
         seen.add(other.index);if(positiveOverlap(q,other)){invalid.add(q.index);invalid.add(other.index);overlaps++;}
       }
       list.push(q);bins.set(key,list);
     }
   }
 }
 return {invalid,folded,overlaps};
}
function volumes(sections){
 let cut=0,fill=0,covered=0,missing=0;const validity=validateStrips(sections);
 for(let i=1;i<sections.length;i++){
  const a=sections[i-1],b=sections[i],d=b.s-a.s;
  if(!a.valid||!b.valid||validity.invalid.has(i)){missing+=d;continue;}
  cut+=((a.metricCut??a.cut)+(b.metricCut??b.cut))*d/2;fill+=((a.metricFill??a.fill)+(b.metricFill??b.fill))*d/2;covered+=d;
 }
 return {cut,fill,total:cut+fill,balance:cut-fill,covered,missing,folded:validity.folded,overlaps:validity.overlaps};
}
const pause=()=>new Promise(r=>setTimeout(r,0));
async function calculate(g,ss,o,check=()=>{},progress=()=>{}){
 const out=[];for(let i=0;i<ss.length;i++){
  check();out.push(section(g,ss[i],ss[i].z,o));
  if(i%20===0){progress(i/ss.length);await pause();}
 }return out;
}
// Coordinate descent on complete cross-sectional volumes. Endpoints and
// user pins stay fixed. Every accepted move reduces adjacent prism volumes.
async function optimize(g,ss,o,limit,check=()=>{},progress=()=>{}){
 const result=ss.map(p=>({...p})),base=await calculate(g,result,o,check),secs=base.slice();
 const initialVolumes=volumes(base);if(initialVolumes.missing>1e-6)throw Error('Há seções sem terreno válido ou faixas sobrepostas. Ajuste o traçado antes de otimizar o greide.');
 const slope=o.grade/100;
 for(let i=1;i<result.length;i++)if(Math.abs(result[i].z-result[i-1].z)>slope*(result[i].s-result[i-1].s)+1e-7)throw Error('O greide atual excede a rampa máxima. Ajuste a rampa do estudo antes da otimização.');
 let visited=0;
 for(const delta of [limit,limit/2,limit/4,limit/8])for(let pass=0;pass<3;pass++){
  let changed=false;
  for(let k=1;k<result.length-1;k++){
   check();const i=pass%2?result.length-1-k:k,p=result[i],a=result[i-1],b=result[i+1];
   // Invalid data cannot become an artificial saving; pin its neighbors too.
   if(!p.fixed&&secs[i-1].valid&&secs[i].valid&&secs[i+1].valid){
    let best=secs[i],bestZ=p.z;
    for(const z of [p.z-delta,p.z+delta]){
     if(Math.abs(z-ss[i].z)>limit+1e-8||Math.abs(z-a.z)>slope*(p.s-a.s)+1e-8||Math.abs(z-b.z)>slope*(b.s-p.s)+1e-8)continue;
     const q=section(g,p,z,o);
     if(q.valid&&(q.metricCut??q.cut)+(q.metricFill??q.fill)<(best.metricCut??best.cut)+(best.metricFill??best.fill)-1e-7){best=q;bestZ=z;}
    }
    if(bestZ!==p.z){const next=secs.slice();next[i]=best;const valid=volumes(next);if(valid.missing<=1e-6){changed=true;p.z=bestZ;secs[i]=best;}}
   }
   if(++visited%20===0){progress(visited/(12*Math.max(1,result.length-2)));await pause();}
  }
  if(!changed)break;
 }
 return {axis:result,sections:secs,before:volumes(base),after:volumes(secs),base};
}
function settings(C){
 if(!GeoMineCivil.readParams(C))throw Error('Confira os parâmetros da estrada.');
 const p=C.params,num=(id,min,max)=>{const v=Number(el(id).value);if(!Number.isFinite(v)||v<min||v>max)throw Error('Valor inválido: '+id);return v;};
 const o={W:p.civW,grade:p.civG,angCorte:p.civAngC,angAterro:p.civAngA,H:p.civH,berma:p.civBerma,passo:p.civPasso,maxOff:p.civMaxOff,
  step:num('civSectionStep',1,100),adjust:num('civAdjust',.1,50),fixed:el('civFixed').value.trim()?el('civFixed').value.split(';').map(v=>Number(v.trim().replace(',','.'))):[]};
 C.corridorSettings={step:o.step,adjust:o.adjust,fixed:el('civFixed').value};return o;
}
function layers(C){return S.layers.filter(l=>l._civilDesignId===C.id);}
function editable(C){if(layers(C).some(l=>l.locked||(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(l,false))))throw Error('Desbloqueie as camadas da estrada para atualizar o corredor.');}
function stamp(C){return JSON.stringify({axis:C.eixo,params:C.params,crs:S.workCRS});}
function uiStamp(){return JSON.stringify([...document.querySelectorAll('#secCivil input,#secCivil select')].map(e=>[e.id,e.value]));}
function replace(C,kind,name,gtype,features,fields,color){
 let layer=layers(C).find(l=>l._civilCorridorKind===kind);
 if(layer){layer.features=features;layer.fields=fields;layer.visible=true;drawLayer(layer);}
 else{layer=addLayer({name:C.name+' — '+name,gtype,crs:C.crs,features,fields,color});layer._civilDesignId=C.id;layer._civilCorridorKind=kind;}
 return layer;
}
function draw(C,ss,secs){
 editable(C);
 const R=civMdt(),p=C.params,o={W:p.civW,angCorte:p.civAngC,angAterro:p.civAngA,H:p.civH,berma:p.civBerma,passo:p.civPasso,maxOff:p.civMaxOff},
   surface=civSaia(R.d,ss,o),sourceValidity=validateStrips(secs);
 if(surface.erro)throw Error(surface.erro);
 const fields=[{name:'EST_INI',type:'N',length:14,decimal:2},{name:'EST_FIM',type:'N',length:14,decimal:2},{name:'CORTE_M3',type:'N',length:18,decimal:2},{name:'ATERRO_M3',type:'N',length:18,decimal:2}],
   dl=surface.lados.esquerda,dr=surface.lados.direita,refined=surface.eixo.map((q,i)=>({s:q.s,left:dl.inter[i],right:dr.inter[i],valid:!!dl.inter[i]&&!!dr.inter[i]})),
   refinementValidity=validateStrips(refined),polygons=[];
 let run=[],cut=0,fill=0,j=1;
 const flush=()=>{
   if(run.length>1){
     const ring=[...run.map(q=>q.left),...run.map(q=>q.right).reverse(),run[0].left];
     polygons.push({geom:[ring.map(q=>q.slice(0,2))],multi:true,zg:[ring.map(q=>q[2])],props:{EST_INI:run[0].s,EST_FIM:run.at(-1).s,CORTE_M3:cut,ATERRO_M3:fill}});
   }
   run=[];cut=0;fill=0;
 };
 const area=(a,b,t,key)=>(a[key]??a[key==='metricCut'?'cut':'fill'])*(1-t)+(b[key]??b[key==='metricCut'?'cut':'fill'])*t;
 for(let i=1;i<refined.length;i++){
   const a=refined[i-1],b=refined[i];while(j<secs.length-1&&secs[j].s<b.s-1e-6)j++;
   const before=secs[j-1],after=secs[j],valid=a.valid&&b.valid&&before.valid&&after.valid&&!sourceValidity.invalid.has(j)&&!refinementValidity.invalid.has(i)&&!dl.breakBefore[i]&&!dr.breakBefore[i];
   if(!valid){flush();dl.breakBefore[i]=dr.breakBefore[i]=true;continue;}
   if(!run.length)run.push(a);run.push(b);
   const length=after.s-before.s,t0=(a.s-before.s)/length,t1=(b.s-before.s)/length,d=b.s-a.s;
   cut+=(area(before,after,t0,'metricCut')+area(before,after,t1,'metricCut'))*d/2;
   fill+=(area(before,after,t0,'metricFill')+area(before,after,t1,'metricFill'))*d/2;
 }
 flush();
 const envelope=replace(C,'envelope','corredor até o terreno','polygon',polygons,fields,'#c79b46');
 // A single footprint per continuous run has no transverse strip edges.
 envelope.weight=0;envelope.fill=.1;Object.assign(envelope.sym,{weight:0,fill:.1});drawLayer(envelope);
 const sections=replace(C,'sections','seções do corredor','line',secs.filter(q=>q.valid).map(q=>({geom:q.points.map(p=>p.slice(0,2)),zg:q.points.map(p=>p[2]),props:{ESTACA:q.s,CORTE_M2:q.cut,ATERRO_M2:q.fill}})),[{name:'ESTACA',type:'N',length:14,decimal:2},{name:'CORTE_M2',type:'N',length:14,decimal:2},{name:'ATERRO_M2',type:'N',length:14,decimal:2}],'#a06532');
 sections.visible=false;drawLayer(sections);
 // Retire the old, coarsely sampled duplicate. The refined longitudinal
 // contact belongs to the same surface as its platform and bench breaklines.
 for(const old of layers(C).filter(l=>l._civilCorridorKind==='daylight')){old.features=[];old.visible=false;drawLayer(old);}
 civDesenhaSaia(surface);
 refreshUI();
}
function report(before,after,ss){
 const f=n=>n.toLocaleString('pt-BR',{maximumFractionDigits:1});
 let html='<b>Cubagem por seções — plataforma e taludes</b><table><tr><th></th><th>Atual</th>'+(after?'<th>Proposta</th>':'')+'</tr>';
 for(const [key,label] of [['cut','Corte (m³)'],['fill','Aterro (m³)'],['total','Movimento total (m³)'],['balance','Corte − aterro (m³)']])html+='<tr><td>'+label+'</td><td>'+f(before[key])+'</td>'+(after?'<td>'+f(after[key])+'</td>':'')+'</tr>';
 html+='</table>Cobertura: '+f(before.covered)+' m. Trechos sem cubagem: '+f(before.missing)+' m.';
 if(after)html+='<br>Redução: <b>'+f(before.total-after.total)+' m³ ('+f(before.total?(before.total-after.total)/before.total*100:0)+'%)</b>.<br>Proposta local, sem garantia de ótimo global. Revise as concordâncias verticais antes do projeto executivo.';
 if(ss?.length)html+='<table><tr><th>Estaca (m)</th><th>Cota atual</th><th>Proposta</th><th>ΔZ (m)</th></tr>'+ss.map(p=>'<tr><td>'+f(p.s)+'</td><td>'+f(p.old)+'</td><td>'+f(p.z)+'</td><td>'+f(p.z-p.old)+'</td></tr>').join('')+'</table>';
 el('civReport').innerHTML=html;
}
function profile(current,proposed){
 let lo=Infinity,hi=-Infinity;for(const p of [...current,...proposed]){lo=Math.min(lo,p.z);hi=Math.max(hi,p.z);}
 const span=Math.max(.1,hi-lo),length=current.at(-1).s||1;
 const points=axis=>axis.map(p=>(10+300*p.s/length).toFixed(2)+','+(110-90*(p.z-lo)/span).toFixed(2)).join(' ');
 el('civReport').insertAdjacentHTML('afterbegin','<svg viewBox="0 0 320 130" role="img" aria-label="Comparação do perfil atual e proposto" style="width:100%;background:var(--bg)"><polyline fill="none" stroke="#888" stroke-width="2" points="'+points(current)+'"/><polyline fill="none" stroke="#139a86" stroke-width="2" points="'+points(proposed)+'"/></svg><div>Perfil: cinza = atual; verde = proposta. Alturas exageradas para comparação.</div>');
}
async function run(mode){
 if(job){toast('Aguarde ou cancele o cálculo atual.');return;}
 const C=GeoMineCivil.current(),token={cancel:false},project=S.projectId;
 if(!C.alignmentConfirmed||C.alignmentPending){toast('Confirme o alinhamento e o greide antes de gerar o corredor.');return;}
 job=token;el('civCancel').hidden=false;el('civApply').hidden=true;proposal=null;
 try{
  editable(C);if(C.crs!==S.workCRS)throw Error('Volte ao CRS da estrada: '+C.crs);
  const o=settings(C),ss=stations(C.eixo,o.step,o.fixed),R=civMdt();if(!R)throw Error('Selecione o MDT base.');
  const signature=stamp(C),ui=uiStamp(),check=()=>{if(token.cancel||S.projectId!==project||S._civ!==C||stamp(C)!==signature||uiStamp()!==ui||civMdt()!==R)throw Error('Cálculo cancelado: a estrada ou os parâmetros mudaram.');};
  el('civReport').textContent='Preparando MDT…';
  if(typeof projectRestoreNativeRaster==='function')await projectRestoreNativeRaster(R);
  check();const g=R.d;
  if(g.crs&&g.crs!==C.crs)throw Error('O MDT e o eixo precisam estar no mesmo CRS para calcular o corredor.');
  if(/4326|longlat/i.test(C.crs))throw Error('Use um CRS projetado em metros para o corredor.');
  const progress=v=>{el('civReport').textContent=(mode==='opt'?'Analisando greide: ':'Calculando seções: ')+Math.min(99,Math.round(v*100))+'%';};
  if(mode==='opt'){
   const q=await optimize(g,ss,o,o.adjust,check,progress);check();
   report(q.before,q.after,q.axis.map((p,i)=>({...p,old:ss[i].z})).filter(p=>Math.abs(p.z-p.old)>.001));
   profile(ss,q.axis);
   if(q.after.missing<=1e-6&&q.after.total<q.before.total-1e-6){proposal={C,R,g,project,signature,ui,o,q};el('civApply').hidden=false;}
  }else{
   const secs=await calculate(g,ss,o,check,progress);check();draw(C,ss,secs);report(volumes(secs));
  }
  el('civReport').insertAdjacentHTML('beforeend','<br>Resolução do MDT usado: '+Number(g.cs).toFixed(2)+' × '+Number(g.csy||g.cs).toFixed(2)+' m. Seções a cada '+o.step+' m, incluindo vértices e cotas fixas.');
 }catch(e){el('civReport').textContent=e.message;toast(e.message);}
 finally{job=null;el('civCancel').hidden=true;}
}
function updateAxis(C,axis){
 C.eixo=axis.map(p=>({x:p.x,y:p.y,z:p.z}));
 const l=S.layers.find(l=>l.id===C.alignmentId);
 if(l){const props={...(l.features[0]?.props||{}),TIPO:'Greide revisto — cubagem no corredor',CORTE_M3:null,ATERRO_M3:null,RAMPA_MAX:null};l.features=[{geom:C.eixo.map(p=>[p.x,p.y]),zg:C.eixo.map(p=>p.z),props}];drawLayer(l);}
}
el('civCorridor').onclick=()=>run('corridor');el('civOptimize').onclick=()=>run('opt');
el('civCancel').onclick=()=>{if(job)job.cancel=true;};
el('civApply').onclick=()=>{
 try{
  const p=proposal;if(!p||p.C!==S._civ||p.project!==S.projectId||stamp(p.C)!==p.signature||uiStamp()!==p.ui||p.R!==civMdt()||p.g!==p.R.d)throw Error('A proposta ficou desatualizada. Analise novamente.');
  editable(p.C);if(volumes(p.q.sections).missing>1e-6)throw Error('A proposta contém seções inválidas ou sobrepostas. Refaça a análise.');p.C.previousGrade=clone(p.C.eixo);updateAxis(p.C,p.q.axis);draw(p.C,p.q.axis,p.q.sections);
  proposal=null;el('civApply').hidden=true;el('civUndoGrade').hidden=false;toast('Greide aplicado; corredor regenerado.');
 }catch(e){toast(e.message);}
};
el('civUndoGrade').onclick=async()=>{
 try{const C=GeoMineCivil.current();editable(C);if(!C.previousGrade)return;updateAxis(C,C.previousGrade);C.previousGrade=null;el('civUndoGrade').hidden=true;await run('corridor');}catch(e){toast(e.message);}
};
el('civUseAxis').onclick=()=>{
 try{
  if(job)throw Error('Cancele o cálculo antes de trocar o eixo.');
  const l=S.layers.find(l=>l.id===S.activeId);
  if(!l||l.gtype!=='line'||l.features.length!==1||l.features[0].multi||l.crs!==S.workCRS)throw Error('Ative uma camada com uma única linha 3D, no CRS do projeto.');
  const f=l.features[0],axis=f.geom.map((p,i)=>({x:p[0],y:p[1],z:f.zg?.[i]??p[2]}));stations(axis,10);
  const C=GeoMineCivil.create();C.name=l.name+' — corredor';C.eixo=axis;C.A=[axis[0].x,axis[0].y];C.B=[axis.at(-1).x,axis.at(-1).y];
  const copy=addLayer({name:C.name+' — eixo',gtype:'line',crs:C.crs,features:clone(l.features),fields:clone(l.fields||[]),color:'#1f7ae0'});copy._civilDesignId=C.id;copy._civAlinhamento=true;C.alignmentId=copy.id;
  GeoMineCivil.sync();civDesenhaPontos();proposal=null;el('civApply').hidden=true;toast('Eixo copiado para uma nova estrada.');
 }catch(e){toast(e.message);}
};
function show(C){
 proposal=null;el('civApply').hidden=true;el('civReport').textContent='';el('civUndoGrade').hidden=!C?.previousGrade;
 el('civSectionStep').value=C?.corridorSettings?.step??10;el('civAdjust').value=C?.corridorSettings?.adjust??5;el('civFixed').value=C?.corridorSettings?.fixed??'';
}
function invalidate(C){
 proposal=null;el('civApply').hidden=true;el('civReport').textContent='Eixo alterado. Gere novamente o corredor.';C.previousGrade=null;el('civUndoGrade').hidden=true;
 for(const l of layers(C).filter(l=>l._civilCorridorKind)){l.visible=false;drawLayer(l);}
}
window.GeoMineCorridor={stations,section,volumes,validateStrips,calculate,optimize,run,show,invalidate};
})();
