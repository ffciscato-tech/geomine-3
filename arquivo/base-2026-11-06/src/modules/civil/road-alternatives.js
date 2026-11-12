/* Preliminary alternatives: fixed endpoints, tangent horizontal curves and
   parabolic vertical curves. Ranking is bounded to the sampled search. */
(function(){
'use strict';
const el=id=>document.getElementById(id),copy=x=>JSON.parse(JSON.stringify(x));
const pause=()=>new Promise(r=>setTimeout(r,0));
let token=0,busy=false,preview=null;
const colors=['#168dda','#e29020','#a649bd'];
function clearPreview(){if(preview){preview.remove();preview=null;}}
function terrainKey(R){return JSON.stringify([String(R.id),R.sig||null,R.d.nc,R.d.nr,R.d.xll,R.d.yll,R.d.cs,R.d.csy||R.d.cs]);}
function showPreview(C){
 clearPreview();if(!C?.alternatives||Number.isInteger(C.selectedAlternative)||C!==S._civ)return;
 preview=L2.layerGroup().addTo(map);
 C.alternatives.options.forEach((q,i)=>L2.polyline(q.axis.map(p=>{const w=toWGS(C.crs,p.x,p.y);return [w[1],w[0]];}),
  {pane:'alagis_desenho',color:colors[i],weight:3,interactive:false,opacity:.9,dashArray:i?'8 5':null}).addTo(preview));
}
// Routes through sampled terrain, with heading and tangent-length constraints.
// Several searches penalize already explored corridors to retain distinct choices.
async function terrainSeeds(g,A,B,p,check,progress){
 const dx=B[0]-A[0],dy=B[1]-A[1],length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length;
 const radius=Math.max(p.civRaioMin||60,p.civW/2+1),grade=p.civG/100,out=[];
 for(const count of [6,10]){
  const countOffsets=25,range=length*.65,rows=[];
  for(let k=0;k<=count;k++){
   const u=k/count,row=[];
   for(let i=0;i<(k===0||k===count?1:countOffsets);i++){
    const offset=k===0||k===count?0:(i-(countOffsets-1)/2)*range/((countOffsets-1)/2);
    const x=A[0]+dx*u+nx*offset,y=A[1]+dy*u+ny*offset,z=civSample(g,x,y);
    const zl=civSample(g,x+nx*p.civW/2,y+ny*p.civW/2),zr=civSample(g,x-nx*p.civW/2,y-ny*p.civW/2);
    row.push({x,y,z,offset,side:[z,zl,zr].every(Number.isFinite)?(Math.abs(zl-z)+Math.abs(zr-z))*p.civW/4:Infinity});
   }rows.push(row);
  }
  const earlier=[],edges=new Map();
  for(let trial=0;trial<4;trial++){
   let beam=[{cost:0,indices:[0],turn:0,points:[rows[0][0]]}];
   for(let k=1;k<=count;k++){
    check();const next=new Map();
    for(const state of beam)for(let i=0;i<rows[k].length;i++){
     const q=rows[k][i],b=state.points.at(-1);if(!Number.isFinite(q.side))continue;
     const vx=q.x-b.x,vy=q.y-b.y,d=Math.hypot(vx,vy);let turn=0;
     if(state.points.length>1){
      const a=state.points.at(-2),ux=b.x-a.x,uy=b.y-a.y,prev=Math.hypot(ux,uy);
      const cos=Math.max(-1,Math.min(1,(ux*vx+uy*vy)/(prev*d)));
      turn=radius*Math.sqrt((1-cos)/Math.max(1e-12,1+cos));
      if(state.turn+turn>=prev*.98||turn>=d*.98)continue;
     }
     const excess=Math.max(0,Math.abs(q.z-b.z)-grade*d*.95);
     // Sample the whole link: endpoint-only costs can jump over a ridge.
     const edgeKey=k+':'+state.indices.at(-1)+':'+i;
     let side=edges.get(edgeKey);
     if(side===undefined){
      side=0;const samples=Math.max(2,Math.min(40,Math.ceil(d/20))),ex=-vy/d,ey=vx/d;
      for(let h=0;h<=samples;h++){
       const t=h/samples,x=b.x+vx*t,y=b.y+vy*t,z=b.z+(q.z-b.z)*t;
       const zc=civSample(g,x,y),zl=civSample(g,x+ex*p.civW/2,y+ey*p.civW/2),zr=civSample(g,x-ex*p.civW/2,y-ey*p.civW/2);
       if(![zc,zl,zr].every(Number.isFinite)){side=Infinity;break;}
       side+=(Math.abs(zl-z)+2*Math.abs(zc-z)+Math.abs(zr-z))*p.civW/4+(zc-z)*(zc-z);
      }
      side/=samples+1;edges.set(edgeKey,side);
     }
     if(!Number.isFinite(side))continue;
     const diversify=earlier.reduce((sum,old)=>sum+Math.exp(-(((q.offset-old[k])/(length*.08))**2))*p.civW*p.civW*.6,0);
     const cost=state.cost+d*(side+excess*p.civW*4+excess*excess+.35+diversify);
     const key=state.indices.at(-1)+':'+i;
     if(!next.has(key)||cost<next.get(key).cost)next.set(key,{cost,turn,indices:[...state.indices,i],points:[...state.points,q]});
    }
    beam=[...next.values()].sort((a,b)=>a.cost-b.cost).slice(0,240);
    if(!beam.length)break;
    progress('Buscando caminhos pelo relevo do MDT…');await pause();
   }
   const valid=beam.filter(q=>q.points.length===count+1);
   for(const q of valid.slice(0,8))out.push(q.points.map(({x,y})=>({x,y,z:0})));
   if(valid.length)earlier.push(valid[0].points.map(q=>q.offset));
  }
 }
 return out;
}
function chain(axis){const s=[0];for(let k=1;k<axis.length;k++)s.push(s[k-1]+Math.hypot(axis[k].x-axis[k-1].x,axis[k].y-axis[k-1].y));return s;}
function at(axis,ss,s){let i=1;while(i<ss.length-1&&ss[i]<s)i++;const t=(s-ss[i-1])/(ss[i]-ss[i-1]);return {x:axis[i-1].x+(axis[i].x-axis[i-1].x)*t,y:axis[i-1].y+(axis[i].y-axis[i-1].y)*t};}
function separation(a,b){
 const aa=chain(a.axis),bb=chain(b.axis);let sum=0;
 for(let k=1;k<20;k++){const p=at(a.axis,aa,aa.at(-1)*k/20),q=at(b.axis,bb,bb.at(-1)*k/20);sum+=Math.hypot(p.x-q.x,p.y-q.y);}
 return sum/19;
}
function candidate(g,controls,p,za,zb){
 const radius=Math.max(p.civRaioMin||60,p.civW/2+1),length=Math.hypot(controls.at(-1).x-controls[0].x,controls.at(-1).y-controls[0].y),grade=p.civG/100;
  let axis;try{axis=civCurvasTangentes(controls,radius,Math.max(2,Math.min(5,length/1500)),true).points;}catch(_){return null;}
  const ss=chain(axis),total=ss.at(-1);if(Math.abs(zb-za)/total>grade*.99)return null;
  const n=Math.max(2,Math.min(160,Math.ceil(total/40))),design=[];let valid=true;
  for(let k=0;k<=n;k++){
   const q=at(axis,ss,total*k/n),target=civSample(g,q.x,q.y);
   if(!Number.isFinite(target)){valid=false;break;}
   design.push({u:k/n,z:za+(zb-za)*k/n,target,L:k&&k<n?Math.min(40,total/n*.4):0,fixed:k===0||k===n});
  }
  if(!valid)return null;
  const limit=grade*.99*total/n;
  for(let iteration=0;iteration<120;iteration++)for(let k=1;k<n;k++){
   const h=iteration%2?n-k:k,q=design[h];q.z=Math.max(Math.max(design[h-1].z-limit,design[h+1].z-limit),Math.min(Math.min(design[h-1].z+limit,design[h+1].z+limit),q.target));
  }
  let vertical;try{vertical=GeoMineRoadEditor.vertical(axis,design,p.civG);}catch(_){return null;}
  axis=vertical.axis;let cost=0,maxCut=0,maxFill=0;
  for(let k=0;k<axis.length;k++){
   const q=axis[k],terrain=civSample(g,q.x,q.y);if(!Number.isFinite(terrain)){valid=false;break;}
   const diff=terrain-q.z;maxCut=Math.max(maxCut,diff);maxFill=Math.max(maxFill,-diff);
   const a=axis[Math.max(0,k-1)],b=axis[Math.min(axis.length-1,k+1)],d=Math.hypot(b.x-a.x,b.y-a.y),lx=-(b.y-a.y)/d,ly=(b.x-a.x)/d;
   const left=civSample(g,q.x+lx*p.civW/2,q.y+ly*p.civW/2),right=civSample(g,q.x-lx*p.civW/2,q.y-ly*p.civW/2);
   if(![left,right].every(Number.isFinite)){valid=false;break;}
   cost+=((Math.abs(left-q.z)+2*Math.abs(diff)+Math.abs(right-q.z))*p.civW/4+diff*diff)*(k?ss[k]-ss[k-1]:0);
  }
  if(valid)return ({axis,controls,design:design.map(({target,...q})=>q),total,cost,maxCut,maxFill,radius,grade:100*Math.max(...vertical.grades.map(Math.abs))});
 return null;
}
// Optimize PVIs, not individual sampled vertices: every trial retains tangent
// grades and parabolic joins. Only full, valid daylight sections earn savings.
async function refineVertical(g,q,p,o,check=()=>{},progress=()=>{},deltas){
 const ss=GeoMineCorridor.stations(q.axis,10),dist=chain(q.axis);
 let sections=await GeoMineCorridor.calculate(g,ss,o,check),volume=GeoMineCorridor.volumes(sections);
 if(volume.missing>.01||!volume.covered){q.volumes=volume;return q;}
 const before=volume.total;q.initialVolumes||={...volume};q.resolution=[g.cs,g.csy||g.cs];
 if(before<1e-7){q.volumes=volume;q.verticalOptimization={before,after:before,moves:0};return q;}
 const origin=copy(q.design),limit=Math.max(3,Math.min(20,p.civW));
 let design=copy(q.design),axis=q.axis,accepted=0,work=0;
 const zAt=(a,s)=>{let lo=1,hi=dist.length-1;while(lo<hi){const m=(lo+hi)>>1;if(dist[m]<s)lo=m+1;else hi=m;}const i=lo,t=(s-dist[i-1])/(dist[i]-dist[i-1]);return a[i-1].z+(a[i].z-a[i-1].z)*t;};
 for(const delta of deltas||[Math.min(4,limit/2),1,.25])for(let pass=0;pass<2;pass++){
  let improved=false;
  for(let k=1;k<design.length-1;k++){
   check();const i=pass?design.length-1-k:k;if(design[i].fixed)continue;
   let best=null;
   for(const sign of [-1,1]){
    const d=copy(design);d[i].z=Math.max(origin[i].z-limit,Math.min(origin[i].z+limit,design[i].z+sign*delta));
    if(Math.abs(d[i].z-design[i].z)<1e-8)continue;
    let v;try{v=GeoMineRoadEditor.vertical(axis,d,p.civG);}catch(_){continue;}
    const next=sections.slice();let valid=true;
    for(let j=0;j<ss.length;j++){
     const z=zAt(v.axis,ss[j].s);if(Math.abs(z-sections[j].z)<1e-8)continue;
     next[j]=GeoMineCorridor.section(g,ss[j],z,o);if(!next[j].valid){valid=false;break;}
    }
    if(valid){const vol=GeoMineCorridor.volumes(next);if(vol.missing<=.01&&vol.covered>0&&vol.total<volume.total-1e-6&&(!best||vol.total<best.volume.total))best={design:d,axis:v.axis,sections:next,volume:vol};}
   }
   if(best){design=best.design;axis=best.axis;sections=best.sections;volume=best.volume;accepted++;improved=true;}
   if(++work%6===0){progress('Ajustando greide pelo volume completo…');await pause();}
  }
  if(!improved)break;
 }
 const v=GeoMineRoadEditor.vertical(axis,design,p.civG);
 Object.assign(q,{axis,design,volumes:volume,grade:100*Math.max(...v.grades.map(Math.abs)),verticalOptimization:{before,after:volume.total,moves:accepted}});
 return q;
}
async function refineHorizontal(g,q,p,o,check,progress){
 let best=q;const za=q.axis[0].z,zb=q.axis.at(-1).z;
 const initial=q.volumes.total;let evaluated=0;
 if(initial<1e-7)return q;
 for(const step of [Math.max(2,Math.min(30,q.total/120)),Math.max(1,Math.min(15,q.total/240))]){
  const neighbors=[];
  for(let i=1;i<best.controls.length-1;i++)for(const sign of [-1,1]){
   check();const controls=copy(best.controls),a=controls[i-1],b=controls[i+1],d=Math.hypot(b.x-a.x,b.y-a.y);
   if(!d)continue;controls[i].x-=sign*step*(b.y-a.y)/d;controls[i].y+=sign*step*(b.x-a.x)/d;
   const c=candidate(g,controls,p,za,zb);if(c)neighbors.push(c);
  }
  neighbors.sort((a,b)=>a.cost-b.cost||a.total-b.total);
  // Every selected horizontal trial receives its own vertical optimization.
  for(const c of neighbors.slice(0,2)){
   check();progress('Refinando curvas e greide em conjunto…');await pause();
   await refineVertical(g,c,p,o,check,progress,[2,.5]);evaluated++;
   if(c.volumes.missing<=.01&&c.volumes.covered>0&&c.volumes.total<best.volumes.total-1e-6)best=c;
  }
 }
 best.horizontalOptimization={before:initial,after:best.volumes.total,evaluated};best.initialVolumes=q.initialVolumes||q.volumes;return best;
}
async function search(g,A,B,p,check=()=>{},progress=()=>{}){
 const dx=B[0]-A[0],dy=B[1]-A[1],length=Math.hypot(dx,dy),za=civSample(g,...A),zb=civSample(g,...B);
 if(!(length>1)||![za,zb].every(Number.isFinite))throw Error('Confira A, B e as cotas do MDT.');
 const nx=-dy/length,ny=dx/length,radius=Math.max(p.civRaioMin||60,p.civW/2+1),delta=length*.6/8;
 const grade=p.civG/100,options=[],seeds=await terrainSeeds(g,A,B,p,check,progress);let tested=0;
 // Broad geometric candidates supplement the terrain routes, including flat terrain.
 for(let i=-8;i<=8;i++)for(let j=-8;j<=8;j++)seeds.push([{x:A[0],y:A[1],z:0},
  {x:A[0]+dx/3+nx*i*delta,y:A[1]+dy/3+ny*i*delta,z:0},
  {x:A[0]+2*dx/3+nx*j*delta,y:A[1]+2*dy/3+ny*j*delta,z:0},{x:B[0],y:B[1],z:0}]);
 for(const controls of seeds){
  check();tested++;if(tested%8===0){progress('Avaliando traçados e greides: '+tested+'/'+seeds.length);await pause();}
  const q=candidate(g,controls,p,za,zb);if(q)options.push(q);
 }
 options.sort((a,b)=>a.cost-b.cost||a.total-b.total);
 const finalists=[],distance=Math.max(1,Math.min(p.civW,length*.015));
 for(const q of options){if(finalists.some(a=>separation(a,q)<distance))continue;finalists.push(q);if(finalists.length===48)break;}
 const o={W:p.civW,grade:p.civG,angCorte:p.civAngC,angAterro:p.civAngA,H:p.civH,berma:p.civBerma,passo:p.civPasso,maxOff:p.civMaxOff};
 const evaluated=[];
 for(let i=0;i<finalists.length;i++){
  if(i>=18&&evaluated.filter(q=>q.volumes.missing<=.01&&q.volumes.covered>0).length>=3)break;
  check();progress('Calculando corte e aterro: '+(i+1));
  const q=finalists[i],stations=GeoMineCorridor.stations(q.axis,10),sections=await GeoMineCorridor.calculate(g,stations,o,check);
  q.volumes=GeoMineCorridor.volumes(sections);q.resolution=[g.cs,g.csy||g.cs];evaluated.push(q);
 }
 // Never reward routes with missing terrain or unfinished daylight slopes.
 const complete=evaluated.filter(q=>q.volumes.missing<=.01&&q.volumes.covered>0);
 complete.sort((a,b)=>a.volumes.total-b.volumes.total||a.total-b.total);
 const refined=[];
 for(const q of complete.slice(0,8)){
  check();progress('Otimizando corte e aterro da alternativa '+(refined.length+1)+'…');
  await refineVertical(g,q,p,o,check,progress);refined.push(q);
 }
 refined.sort((a,b)=>a.volumes.total-b.volumes.total||a.total-b.total);
 const improved=[];
 for(const q of refined.slice(0,3))improved.push(await refineHorizontal(g,q,p,o,check,progress));
 const ranked=[...improved,...complete].sort((a,b)=>a.volumes.total-b.volumes.total||a.total-b.total),selected=[];
 for(const q of ranked){if(selected.some(a=>separation(a,q)<distance))continue;selected.push(q);if(selected.length===3)break;}
 return {tested,compared:evaluated.length,refined:refined.length,options:selected,rejected:evaluated.length-complete.length,params:copy(p),A:A.slice(),B:B.slice()};
}
function render(C){
 const box=el('civAlternatives');if(!box)return;box.innerHTML='';showPreview(C);
 const result=C?.alternatives;if(!result)return;
 const f=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:1});
 box.innerHTML='<b>1 · Escolha o traçado pelo MDT</b><div>'+result.tested+' traçados avaliados · '+result.compared+' comparados por seções · '+(result.refined||0)+' greides otimizados.</div>'+
 Array.from({length:3},(_,i)=>{
  const q=result.options[i];
  if(!q)return '<div style="border:1px solid var(--line);padding:8px;margin-top:6px"><b>Opção '+(i+1)+'</b> · indisponível<div>Não foi encontrado outro traçado viável com estes parâmetros.</div></div>';
  return '<div style="border:1px solid '+colors[i]+';padding:8px;margin-top:6px"><b style="color:'+colors[i]+'">Opção '+(i+1)+'</b>'+(!i?' · menor movimentação calculada':'')+
   ' · '+f(q.total)+' m · rampa '+f(q.grade)+'%<br>Corte '+f(q.volumes.cut)+' m³ · aterro '+f(q.volumes.fill)+' m³<br>Total '+f(q.volumes.total)+' m³ · raio mínimo '+f(q.radius)+' m<br>'+
   (q.initialVolumes?.total>q.volumes.total+1e-5?'Redução na otimização: '+f(100*(1-q.volumes.total/q.initialVolumes.total))+'%<br>':'')+
   '<button class="mini" data-road-option="'+i+'">'+(C.selectedAlternative===i?'Opção selecionada':'Usar opção '+(i+1))+'</button></div>';
 }).join('')+'<div class="hint">Estimativas pelas seções no MDT. Melhores opções da busca realizada.</div>';
 box.querySelectorAll('[data-road-option]').forEach(b=>b.onclick=()=>apply(C,+b.dataset.roadOption));
}
function apply(C,index){
 if(C!==S._civ)return;const q=C.alternatives?.options[index];if(!q)return;
 const R=civMdt();if(!R||C.crs!==S.workCRS){toast('Selecione o MDT e o CRS da estrada.');return;}
 if(C.alternatives.terrain&&C.alternatives.terrain!==terrainKey(R)){toast('O MDT mudou. Gere as três opções novamente.');return;}
 const saved=C.alternatives.params;if(!GeoMineCivil.readParams(C))return;
 if(C.alternatives.A&&JSON.stringify([C.A,C.B])!==JSON.stringify([C.alternatives.A,C.alternatives.B])){toast('Os pontos mudaram. Compare novamente.');return;}
 if(saved&&JSON.stringify(saved)!==JSON.stringify(C.params)){toast('Os parâmetros mudaram. Compare as alternativas novamente.');return;}
 if(S.layers.some(l=>l._civilDesignId===C.id&&(l.locked||(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(l,false))))){toast('Desbloqueie as camadas da estrada.');return;}
 clearPreview();GeoMineRoadEditor.close();GeoMineCorridor.invalidate(C);
 Object.assign(C,{eixo:copy(q.axis),horizontalControls:copy(q.controls),verticalDesign:copy(q.design),horizontalCurved:true,alignmentPending:false,alignmentConfirmed:false,selectedAlternative:index,W:C.params.civW});
 const feature={geom:q.axis.map(p=>[p.x,p.y]),zg:q.axis.map(p=>p.z),multi:false,props:{TIPO:'Alternativa '+(index+1),COMP_M:q.total,RAMPA_MAX:q.grade,CORTE_M3:q.volumes.cut,ATERRO_M3:q.volumes.fill,RAIO_MIN:q.radius,LARGURA:C.params.civW}};
 let L=S.layers.find(l=>l.id===C.alignmentId&&l._civilDesignId===C.id);
 if(L){L.features=[feature];}else{L=addLayer({name:C.name+' — eixo',gtype:'line',crs:C.crs,features:[feature],fields:[],color:'#168dda'});L._civilDesignId=C.id;C.alignmentId=L.id;}
 L._civAlinhamento=true;L.visible=true;drawLayer(L);
 const old=S.layers.find(l=>l.id===C.slopesId);if(old){old.visible=false;drawLayer(old);}
 GeoMineCivil.sync();refreshUI();GeoMineRoadEditor.open();toast('Opção '+(index+1)+' aplicada. Revise o perfil antes de confirmar.');
}
async function compare(){
 const C=GeoMineCivil.current(),R=civMdt();
 if(!R||!C.A||!C.B){toast('Marque A e B e selecione o MDT.');return;}
 if(C.crs!==S.workCRS){toast('Volte ao CRS da estrada: '+C.crs);return;}
 if(!GeoMineCivil.readParams(C))return;
 if(S.layers.some(l=>l._civilDesignId===C.id&&(l.locked||(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(l,false))))){toast('Desbloqueie as camadas da estrada para gerar novas opções.');return;}
 const job=++token,project=S.projectId,params=copy(C.params),A=C.A.slice(),B=C.B.slice(),signature=JSON.stringify([A,B,params]),g=R.d;
 busy=true;clearPreview();GeoMineRoadEditor.close();civUpdateSteps();
 const check=()=>{if(job!==token||project!==S.projectId||C!==S._civ||R!==civMdt()||g!==R.d||signature!==JSON.stringify([C.A,C.B,Object.fromEntries(Object.keys(params).map(k=>[k,typeof params[k]==='number'?+el(k).value:el(k).value]))]))throw Error('Comparação cancelada: pontos, MDT ou parâmetros mudaram.');};
 try{
  const result=await search(g,A,B,params,check,text=>{el('civAlternatives').textContent=text;});check();result.terrain=terrainKey(R);
  C.alternatives=result;
  if(result.options.length){
   C.selectedAlternative=null;C.alignmentPending=true;C.alignmentConfirmed=false;
   GeoMineRoadEditor.close();GeoMineCorridor.invalidate(C);
   for(const L of S.layers.filter(l=>l._civilDesignId===C.id&&(l.id===C.alignmentId||l.id===C.slopesId))){L.visible=false;drawLayer(L);}
   el('civInfo').textContent=result.options.length===3?'Três opções prontas. Escolha um traçado para gerar o perfil.':'Foram encontradas '+result.options.length+' opções viáveis. Ajuste raio, rampa ou A/B para ampliar a busca.';
  }else el('civInfo').textContent='Nenhum traçado viável nesta busca. Confira A/B, raio, rampa e cobertura do MDT.';
  render(C);window.GeoMineSessionAutosave?.markDirty('alternativas de estrada');
 }catch(e){if(job===token&&C===S._civ){el('civInfo').textContent=e.message;render(C);}}
 finally{if(job===token){busy=false;civUpdateSteps();}}
}
window.GeoMineRoadAlternatives={search,compare,render,apply,terrainSeeds,separation,candidate,refineVertical,refineHorizontal,busy:()=>busy,cancel(){token++;busy=false;clearPreview();},stop(){token++;busy=false;render(S._civ);civUpdateSteps();el('civInfo').textContent='Comparação cancelada.';}};
})();
