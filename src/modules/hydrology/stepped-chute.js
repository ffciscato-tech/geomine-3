/* Stepped chute layout and regime screening. SI units throughout. No raster,
   basin, rainfall or runoff defaults are introduced by this calculation. */
(function(root){
'use strict';
const G=9.80665,MAX_SAMPLES=16000,MAX_STEPS=1000;
const SOURCE='https://assets.publishing.service.gov.uk/media/60338aaf8fa8f5432bc23dbe/_Guidance_for_the_Design_and_Maintenance_of_Stepped_Masonry_Spillways.pdf';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function positive(v,name){if(!finite(v)||v<=0)throw Error(name+' deve ser maior que zero.');return v;}
function intersect(a,b,c,d){
 const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
 const o=[cross(a,b,c),cross(a,b,d),cross(c,d,a),cross(c,d,b)],eps=1e-8;
 if(o[0]*o[1]<-eps&&o[2]*o[3]<-eps)return true;
 const on=(p,q,r)=>Math.abs(cross(p,q,r))<eps&&r[0]>=Math.min(p[0],q[0])-eps&&r[0]<=Math.max(p[0],q[0])+eps&&r[1]>=Math.min(p[1],q[1])-eps&&r[1]<=Math.max(p[1],q[1])+eps;
 return on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);
}
function simple(points,name){for(let i=1;i<points.length;i++)for(let j=i+2;j<points.length;j++)if(intersect(points[i-1],points[i],points[j-1],points[j]))throw Error(name+' se cruza. Ajuste o traçado ou reduza a largura.');}
function route(points){
 if(!Array.isArray(points)||points.length>2000)throw Error('Use uma linha simples com até 2.000 vértices.');
 const a=[];for(const p of points){if(!Array.isArray(p)||!finite(p[0])||!finite(p[1]))throw Error('Coordenadas inválidas na linha.');if(!a.length||Math.hypot(p[0]-a.at(-1)[0],p[1]-a.at(-1)[1])>1e-6)a.push([p[0],p[1]]);}
 if(a.length<2)throw Error('A linha precisa de dois pontos distintos.');simple(a,'A linha da escada');
 const s=[0];for(let i=1;i<a.length;i++)s.push(s[i-1]+Math.hypot(a[i][0]-a[i-1][0],a[i][1]-a[i-1][1]));
 return {points:a,stations:s,length:s.at(-1)};
}
function samplePlan(points,interval=1){
 const a=route(points);positive(interval,'O intervalo de amostragem');
 const count=a.stations.slice(1).reduce((n,s,i)=>n+Math.ceil((s-a.stations[i])/interval),1);
 if(count>MAX_SAMPLES)throw Error('O perfil excede 16.000 amostras. Aumente o intervalo de amostragem.');
 const out=[{s:0,x:a.points[0][0],y:a.points[0][1]}];
 for(let i=1;i<a.points.length;i++){const n=Math.ceil((a.stations[i]-a.stations[i-1])/interval),p=a.points[i-1],q=a.points[i];for(let j=1;j<=n;j++){const t=j/n;out.push({s:a.stations[i-1]+t*(a.stations[i]-a.stations[i-1]),x:p[0]+t*(q[0]-p[0]),y:p[1]+t*(q[1]-p[1])});}}
 return {axis:a,rows:out};
}
function bounds(x){return {nappe:.89-.4*x,skimming:1.2-.325*x};}
function regime(Q,width,height,tread){
 positive(Q,'A vazão');positive(width,'A largura');positive(height,'A altura do degrau');positive(tread,'O piso');
 const q=Q/width,yc=Math.cbrt(q*q/G),x=height/tread,y=yc/height,angle=Math.atan(x)*180/Math.PI,limits=bounds(x),valid=angle>3.4&&angle<60;
 return {q,yc,x,y,angle,...limits,valid,regime:!valid?'outside':y<limits.nappe?'nappe':y>limits.skimming?'skimming':'transition'};
}
function rational({C,areaM2,i,T,tc,idf}){
 if(!finite(C)||C<0||C>1)throw Error('Informe C entre zero e um para toda a bacia.');positive(areaM2,'A área contribuinte');
 if(idf){positive(T,'O período de retorno');positive(tc,'O tempo de concentração');if(![idf.K,idf.a,idf.b,idf.c].every(finite)||!(idf.K>0)||!(tc+idf.b>0))throw Error('Coeficientes IDF inválidos.');i=idf.K*Math.pow(T,idf.a)/Math.pow(tc+idf.b,idf.c);}
 positive(i,'A intensidade da chuva');const Q=C*i*areaM2/3600000;
 return {method:'rational',C,areaM2,i,T:idf?T:null,tc:idf?tc:null,idf:idf?{K:idf.K,a:idf.a,b:idf.b,c:idf.c}:null,Q};
}
function profileAt(rows,s){
 if(s<=0)return {...rows[0],s:0};if(s>=rows.at(-1).s)return {...rows.at(-1)};
 let lo=0,hi=rows.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(rows[m].s<s)lo=m;else hi=m;}
 const a=rows[lo],b=rows[hi],t=(s-a.s)/(b.s-a.s);return {s,x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y),z:a.z+t*(b.z-a.z)};
}
function design(input,o={}){
 if(!Array.isArray(input)||input.length<2||input.length>MAX_SAMPLES)throw Error('Perfil de terreno inválido.');
 const maxHeight=positive(o.maxHeight,'A altura máxima do degrau'),width=positive(o.width,'A largura');
 const cut=o.cut??0;if(!finite(cut)||cut<0)throw Error('O rebaixo não pode ser negativo.');
 let rows=input.map(p=>({...p}));
 for(let i=0;i<rows.length;i++){const p=rows[i];if(![p.s,p.x,p.y,p.z].every(finite))throw Error('O MDT não cobre toda a linha ou contém células sem cota.');if((i===0&&Math.abs(p.s)>1e-6)||(i&&p.s<=rows[i-1].s))throw Error('Estaqueamento inválido no perfil.');}
 const length=positive(rows.at(-1).s,'O comprimento');
 const reversed=o.direction==='reverse'||(o.direction!=='forward'&&rows.at(-1).z>rows[0].z);
 if(reversed)rows=rows.reverse().map(p=>({...p,s:length-p.s}));
 const z0=rows[0].z-cut,z1=rows.at(-1).z-cut,drop=z0-z1;
 if(!(drop>.01))throw Error('A escada precisa descer entre a entrada e a saída. Inverta ou ajuste a linha.');
 if(rows.some(p=>p.z<rows.at(-1).z-1e-6))throw Error('Há um ponto mais baixo que a saída no perfil. Termine a linha nesse ponto ou ajuste o traçado; a escada não pode subir para sair.');
 const count=Math.ceil(drop/maxHeight-1e-10);if(count>MAX_STEPS)throw Error('O perfil exige mais de 1.000 degraus. Aumente a altura máxima ou divida a escada.');
 const height=drop/count,marks=[0];let i=1;
 for(let j=1;j<count;j++){
  const target=z0-j*height+cut;while(i<rows.length&&rows[i].z>target)i++;
  if(i>=rows.length)throw Error('Não foi possível ajustar os degraus ao perfil.');
  const a=rows[i-1],b=rows[i],t=(a.z-target)/(a.z-b.z);marks.push(a.s+t*(b.s-a.s));
 }
 marks.push(length);
 const steps=marks.slice(1).map((end,j)=>{
  const start=marks[j],tread=end-start;if(tread<=1e-5)throw Error('O perfil produz um piso sem comprimento. Ajuste a linha ou a altura.');
  return {index:j+1,start,end,tread,height,top:z0-j*height,floor:z0-(j+1)*height,hydraulic:o.Q>0?regime(o.Q,width,height,tread):null};
 });
 let maxCut=0,j=0;for(const p of rows){while(j<steps.length-1&&p.s>=steps[j].end-1e-8)j++;maxCut=Math.max(maxCut,p.z-steps[j].floor);}
 // A preceding uphill hump is excavated, never hidden or replaced by a
 // fabricated downhill DEM. The full profile and maximum cut remain visible.
 const uphill=rows.slice(1).reduce((n,p,i)=>n+Math.max(0,p.z-rows[i].z),0);
 return {version:1,rows,steps,width,maxHeight,height,count,length,drop,z0,z1,cut,maxCut,uphill,reversed,Q:o.Q>0?o.Q:null,source:SOURCE};
}
function drawing(result){
 const r=result,points=r.rows.filter((p,i,a)=>!i||i===a.length-1||Math.abs((p.x-a[i-1].x)*(a[i+1].y-p.y)-(p.y-a[i-1].y)*(a[i+1].x-p.x))>1e-7).map(p=>[p.x,p.y]);
 const a=route(points),half=r.width/2;
 const crossAt=s=>{
  let i=1;while(i<a.stations.length-1&&a.stations[i]<s-1e-7)i++;
  const p=profileAt(r.rows,s),v=[a.points[i][0]-a.points[i-1][0],a.points[i][1]-a.points[i-1][1]],len=Math.hypot(...v);let n=[-v[1]/len,v[0]/len],scale=half;
  if(i<a.points.length-1&&Math.abs(a.stations[i]-s)<1e-6){const w=[a.points[i+1][0]-a.points[i][0],a.points[i+1][1]-a.points[i][1]],wl=Math.hypot(...w),m=[n[0]-w[1]/wl,n[1]+w[0]/wl],ml=Math.hypot(...m);if(ml<1e-6)throw Error('A linha faz um retorno fechado. Ajuste a curva da escada.');m[0]/=ml;m[1]/=ml;const dot=m[0]*n[0]+m[1]*n[1];if(dot<.5)throw Error('A escada tem uma curva muito fechada. Suavize o eixo.');scale/=dot;n=m;}
  return {s,left:[p.x+n[0]*scale,p.y+n[1]*scale],right:[p.x-n[0]*scale,p.y-n[1]*scale]};
 };
 const vertices=a.stations.map(crossAt);simple(vertices.map(v=>v.left),'A borda esquerda');simple(vertices.map(v=>v.right),'A borda direita');
 const features=[],edges=[[],[]],edgeZ=[[],[]];
 for(const step of r.steps){
  const v=[crossAt(step.start),...vertices.filter(v=>v.s>step.start+1e-7&&v.s<step.end-1e-7),crossAt(step.end)];
  for(const [k,side] of ['left','right'].entries()){
   edges[k].push(v[0][side]);edgeZ[k].push(step.top);
   for(const q of v){edges[k].push(q[side]);edgeZ[k].push(step.floor);}
  }
  const p=v[0];features.push({geom:[p.left,p.right],zg:[step.top,step.top],props:{TIPO:'Crista do degrau',DEGRAU:step.index,ESTACA_M:step.start,PISO_M:step.tread,ALTURA_M:step.height,COTA:step.top,REGIME:step.hydraulic?.regime||'',Q_M3S:r.Q}});
  features.push({geom:[p.left,p.right],zg:[step.floor,step.floor],props:{TIPO:'Pé do degrau',DEGRAU:step.index,ESTACA_M:step.start,PISO_M:step.tread,ALTURA_M:step.height,COTA:step.floor,REGIME:step.hydraulic?.regime||'',Q_M3S:r.Q}});
 }
 const last=crossAt(r.length);features.push({geom:[last.left,last.right],zg:[r.z1,r.z1],props:{TIPO:'Saída',ESTACA_M:r.length,COTA:r.z1,Q_M3S:r.Q}});
 edges.forEach((geom,k)=>features.push({geom,zg:edgeZ[k],props:{TIPO:k?'Borda direita':'Borda esquerda',Q_M3S:r.Q}}));
 return features.map(f=>({...f,multi:false}));
}
root.GeoMineHydraulicStairsEngine=Object.freeze({G,SOURCE,route,samplePlan,design,drawing,regime,bounds,rational,profileAt,limits:{samples:MAX_SAMPLES,steps:MAX_STEPS}});
})(typeof window!=='undefined'?window:globalThis);
/* Terrain-driven stepped chute. Native drawing retains mouse, touch, pen and
   snap behavior. The result is an independent XYZ engineering line layer. */
(function(root){
'use strict';
const E=root.GeoMineHydraulicStairsEngine,$=id=>document.getElementById('stairs'+id),clone=v=>JSON.parse(JSON.stringify(v));
const num=v=>v==null||String(v).trim()===''?NaN:Number(String(v).trim().replace(',','.'));
const fmt=v=>Number.isFinite(v)?(root.GeoMineNumberFormat?.format(v,2)??v.toFixed(2)):'—';
const flow=Q=>Q>0&&Q<.005?fmt(Q*1000)+' L/s':fmt(Q)+' m³/s';
const html=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label={nappe:'Nappe flow',transition:'Transição',skimming:'Skimming flow',outside:'Fora da faixa'};
const colors={nappe:'#287ab1',transition:'#d08a16',skimming:'#25856b',outside:'#8b667f'};
const state={job:null,review:null,preview:null,drawing:null,candidates:[],basin:null,anchor:null,target:null,project:null};
const layer=id=>S.layers.find(L=>String(L.id)===String(id)),raster=id=>S.rasters.find(R=>String(R.id)===String(id));
const models=()=>S.rasters.filter(r=>r.d&&root.GeoMineChannelDEM?.isElevation(r));
const lineLayers=()=>S.layers.filter(L=>L.gtype==='line'&&!L._slopeHachures&&!L._hydraulicStairs&&L.features?.length);
function parts(f){return f?.multi&&Array.isArray(f.geom?.[0]?.[0])?f.geom:[f?.geom||[]];}
function metric(){const p=proj4(S.workCRS).oProj;if(p.projName!=='utm'||Math.abs((p.to_meter||1)-1)>1e-9)throw Error('Defina o CRS UTM em metros da região para desenhar a escada.');}
function options(el,rows,value,empty=null){el.replaceChildren();if(empty!=null)el.add(new Option(empty,''));for(const [v,t] of rows)el.add(new Option(t,String(v)));if(rows.some(r=>String(r[0])===String(value)))el.value=String(value);}
function selectedLine(){const L=layer($('Layer').value),i=Number($('Feature').value),f=L?.features?.[i];if(!L||!f||$('Feature').value==='')throw Error('Escolha a linha da escada.');const pp=parts(f);if(pp.length!==1)throw Error('Escolha uma linha de uma única parte. Separe as partes antes de dimensionar.');return {L,f,index:i,axis:pp[0].map(p=>L.crs===S.workCRS?p.slice(0,2):proj4(L.crs,S.workCRS,p.slice(0,2)))};}
function featureOptions(index){const L=layer($('Layer').value);options($('Feature'),(L?.features||[]).map((f,i)=>[i,(f.props?.NOME||f.props?.NAME||f.props?.TIPO||'Linha')+' · '+(i+1)]),index);}
function key(L,i){return String(L.id)+':'+i;}
function getProps(f,names){for(const name of names){const k=Object.keys(f?.props||{}).find(k=>k.toUpperCase()===name.toUpperCase()),v=k!=null?num(f.props[k]):NaN;if(Number.isFinite(v))return v;}return NaN;}
function basinInfo(L,f,index){
 const fields=L._runoffZones?.fields||{},area=measureFeature(L,f).area;
 const C=getProps(f,[fields.C_MEDIO||'C_MEDIO','C_POND','COEF_C','C_RACIONAL']);
 let coverage=getProps(f,[fields.COBERT_PCT||'COBERT_PCT']);
 const covered=getProps(f,[fields.AREA_C||'AREA_C']),base=getProps(f,[fields.AREA_BASE||'AREA_BASE']);
 if(!Number.isFinite(coverage)&&covered>=0&&base>0)coverage=covered/base*100;
 // A C field without a partial-coverage marker is an authored basin value.
 if(!Number.isFinite(coverage)&&Number.isFinite(C)&&!L._runoffZones)coverage=100;
 const rings=parts(f).map(r=>r.map(p=>L.crs===S.workCRS?p.slice(0,2):proj4(L.crs,S.workCRS,p.slice(0,2))));
 const outlets=[],name=f.props?.EXUTORIO;
 for(const P of S.layers.filter(P=>P.gtype==='point'&&(P._exutorios||/exut[oó]rio/i.test(P.name))))for(const p of P.features||[]){
  if(name&&String(p.props?.NOME)===String(name)||!name&&String(p.props?.BACIA_ID)===String(L._runoffZones?.sourceLayerId||L.id))for(const xy of parts(p)[0])outlets.push(P.crs===S.workCRS?xy.slice(0,2):proj4(P.crs,S.workCRS,xy.slice(0,2)));
 }
 for(const pair of [['E_PONTO','N_PONTO'],['E_CELULA','N_CELULA']]){const x=getProps(f,[pair[0]]),y=getProps(f,[pair[1]]);if(Number.isFinite(x)&&Number.isFinite(y))outlets.push(L.crs===S.workCRS?[x,y]:proj4(L.crs,S.workCRS,[x,y]));}
 return {L,f,index,key:key(L,index),name:String(f.props?.NOME||f.props?.NAME||L.name)+(L.features.length>1?' · '+(index+1):''),area,C,coverage,
  Q:getProps(f,['Q_M3S','VAZAO_M3S','Q_PROJETO','Q_PROJ','Q']),tc:getProps(f,['TC_MIN','TC_MINUTOS']),rings,outlets,
  semantic:!!L._runoffZones||/bacia|contribui|[áa]reas? destino/i.test(L.name)||!!name};
}
function basinOptions(value){
 const rows=[];for(const L of S.layers.filter(L=>L.gtype==='polygon'&&!L._hydraulicStairs))for(let i=0;i<(L.features||[]).length;i++)try{const b=basinInfo(L,L.features[i],i);if(b.area>0)rows.push(b);}catch(_){}
 state.candidates=rows;options($('Basin'),rows.map(b=>[b.key,b.name]),value,'Automática pela entrada da linha');
 state.basin=rows.find(b=>b.key===$('Basin').value)||null;basinUI();
}
function chooseBasin(start,tolerance){
 if($('Basin').value){const b=state.candidates.find(b=>b.key===$('Basin').value);if(!b)throw Error('A bacia escolhida não está disponível.');return {b,why:'Bacia indicada'};}
 const possible=state.candidates.filter(b=>b.semantic).map(b=>({...b,distance:b.outlets.length?Math.min(...b.outlets.map(p=>Math.hypot(p[0]-start[0],p[1]-start[1]))):Infinity}));
 let list=possible.filter(b=>b.distance<=tolerance),why='Exutório próximo à entrada';
 if(!list.length){list=possible.filter(b=>cnBaciaContem(start[0],start[1],b.rings));why='Entrada contida na bacia';}
 // C-médio copies and their original geometry represent the same basin.
 const distinct=[];for(const b of list){const same=distinct.findIndex(q=>Math.abs(q.area-b.area)<=Math.max(1e-6,b.area*1e-9)&&JSON.stringify(q.rings)===JSON.stringify(b.rings));if(same<0)distinct.push(b);else if((b.coverage>=99.99&&b.C>=0)||(b.Q>0&&!(distinct[same].Q>0)))distinct[same]=b;}
 if(distinct.length!==1)return {b:null,why:distinct.length?'Mais de uma bacia atende à entrada. Escolha a bacia no card 2.':'Nenhuma bacia identificada. Escolha a camada/feição no card 2.'};
 return {b:distinct[0],why};
}
function basinUI(why=''){
 const b=state.basin;$('BasinInfo').textContent=b?b.name+' · '+fmt(b.area/10000)+' ha'+(why?' · '+why:''):(why||'A entrada da escada será relacionada ao exutório da bacia.');
 $('CInfo').textContent=b&&Number.isFinite(b.C)?'C ponderado: '+fmt(b.C)+' · cobertura '+fmt(b.coverage)+'%':'C ponderado ainda não disponível para esta bacia.';
 $('SavedInfo').textContent=b?.Q>0?'Q registrada: '+flow(b.Q):'A bacia não possui uma vazão registrada.';
 const tc=$('Tc');if(!tc.value||tc.dataset.basin){tc.value=b?.tc>0?b.tc:'';if(b?.tc>0)tc.dataset.basin=b.key;else delete tc.dataset.basin;}
 sync();
}
function effectiveMode(){return $('QMode').value==='auto'?(state.basin?.Q>0?'saved':'rational'):$('QMode').value;}
function sync(){
 const mode=effectiveMode();$('SavedBox').hidden=mode!=='saved';$('RationalBox').hidden=mode!=='rational';$('ManualBox').hidden=mode!=='manual';
 $('ManualCBox').hidden=$('CMode').value!=='manual';$('IDFBox').hidden=$('RainMode').value!=='idf';$('IntensityBox').hidden=$('RainMode').value==='idf';
 $('IDFInfo').textContent=S.hidro?.idf?'Curva IDF do projeto.':'Sem curva IDF: informe-a em Chuva de projeto ou use uma intensidade informada.';
}
function clearPreview(){if(state.preview)try{map.removeLayer(state.preview);}catch(_){}state.preview=null;}
function invalidate(message='Dados alterados. Analise novamente para atualizar o perfil e a vazão.'){
 state.job?.abort();state.review=null;clearPreview();if($('Commit'))$('Commit').disabled=true;if($('Details'))$('Details').disabled=true;if($('Profile'))$('Profile').replaceChildren();if($('Regime'))$('Regime').replaceChildren();if($('Status'))$('Status').textContent=message;
}
function values(){return Object.fromEntries(['Layer','Feature','Raster','Direction','Basin','QMode','Q','CMode','C','RainMode','Intensity','T','Tc','Width','Height','Cut','Interval','Tolerance'].map(id=>[id,$(id).value]));}
function rasterStamp(R){const meta=d=>d?Object.fromEntries(['crs','srcCRS','xll','yll','nc','nr','cs','csy','noData','nodata','_nd','clip','_exactClipRings','quantity','unit','resampled','native'].map(k=>[k,d[k]])):null;return JSON.stringify([meta(R),meta(R.d),meta(R.d?._full),R.projectNativeSource,typeof root.projectNativeGridRevision==='function'?[root.projectNativeGridRevision(R.d),root.projectNativeGridRevision(R.d?._full)]:null]);}
const sourceRefs=R=>[R.d,R.d?.z,R.d?._full,R.d?._full?.z,R.d?._img0,R.d?._tiff,R._projectSourceRaw,R._projectNativeBinding,R.projectNativeSource];
function context(line,R){return {project:S.projectId,generation:root.GeoMineSessionAutosave?.state?.generation,crs:S.workCRS,L:line.L,f:line.f,lineStamp:JSON.stringify([line.L.crs,line.f.geom,line.f.multi]),R,refs:sourceRefs(R),rasterStamp:rasterStamp(R)};}
function current(c,deep=false){return S.projectId===c.project&&root.GeoMineSessionAutosave?.state?.generation===c.generation&&S.workCRS===c.crs&&S.layers.includes(c.L)&&c.L.features.includes(c.f)&&JSON.stringify([c.L.crs,c.f.geom,c.f.multi])===c.lineStamp&&S.rasters.includes(c.R)&&sourceRefs(c.R).every((v,i)=>v===c.refs[i])&&(!deep||rasterStamp(c.R)===c.rasterStamp);}
function bStamp(b){return b?JSON.stringify([b.L.crs,b.f.geom,b.f.props,b.L._runoffZones]):null;}
async function hydrology(b,check){
 const mode=effectiveMode();if(!b)throw Error('Escolha a bacia que alimenta a escada.');
 if(mode==='saved'){if(!(b.Q>0))throw Error('A bacia não possui Q registrada. Escolha o Método Racional ou informe Q.');return {method:'basin-attribute',Q:b.Q,areaM2:b.area};}
 if(mode==='manual'){const Q=num($('Q').value);if(!(Q>0))throw Error('Informe a vazão de projeto Q no card 2.');return {method:'manual',Q,areaM2:b.area};}
 let C=num($('C').value),coverage=b.coverage,source='C informado para toda a bacia',cRaster=null,cStamp=null;
 if($('CMode').value==='auto'){
  C=b.C;source='C ponderado da bacia';
 if(!(C>=0&&C<=1&&coverage>=99.999999)){
   const id=b.L._runoffZones?.sourceRasterId,rs=S.rasters.filter(r=>root.GeoMineCZonal?.isC(r));
   const r=id!=null?rs.find(r=>String(r.id)===String(id)):rs.length===1?rs[0]:null;
   if(!r)throw Error('C completo indisponível. Gere C médio da bacia ou informe o C global no card 2.');
   const dist=await GeoMineCZonal.forFeature(r,b.L,b.f,{check});check();C=dist.mean;coverage=dist.percent;
   b.C=C;b.coverage=coverage;source=r.name;cRaster=r;cStamp=rasterStamp(r);basinUI();
   if(!dist.complete)throw Error('O C cobre '+fmt(coverage)+'% da bacia. Complete a cobertura ou informe C para toda a bacia; a vazão não foi extrapolada.');
  }
 }
 if($('RainMode').value==='idf'&&!S.hidro?.idf)throw Error('Informe a curva IDF do projeto ou escolha uma intensidade informada.');
 const result=E.rational({C,areaM2:b.area,i:num($('Intensity').value),T:num($('T').value),tc:num($('Tc').value),idf:$('RainMode').value==='idf'?S.hidro?.idf:null});
 if(!(result.Q>0))throw Error('A vazão calculada é zero. Confira C e a chuva de projeto.');
 return {...result,source,coverage:$('CMode').value==='auto'?coverage:100,cRaster,cStamp};
}
function busy(on){document.querySelectorAll('#secHydraulicStairs input,#secHydraulicStairs select,#secHydraulicStairs button:not(#stairsCancel)').forEach(e=>e.disabled=on);$('Cancel').hidden=!on;if(!on){$('Commit').disabled=!state.review?.hydro;$('Details').disabled=!state.review;}}
function status(t){$('Status').textContent=t;}
async function analyze(){
 if(state.job)return;let sampler=null;const controller=new AbortController();state.job=controller;state.review=null;clearPreview();busy(true);status('Lendo o perfil do MDT…');
 try{
  metric();const line=selectedLine(),R=raster($('Raster').value);if(!R||!models().includes(R))throw Error('Escolha o MDT do terreno no card 1.');
  const c=context(line,R),check=()=>{if(controller.signal.aborted||!current(c))throw Object.assign(Error('A análise foi cancelada ou os dados de origem mudaram.'),{name:'AbortError'});};check();
  const plan=E.samplePlan(line.axis,num($('Interval').value));
  sampler=await GeoMineChannelDEM.prepare(R,{workCRS:c.crs,signal:controller.signal,isCurrent:()=>{try{check();return true;}catch(_){return false;}},onProgress:m=>{if(typeof m==='string')status(m);}});
  const zz=await sampler.sample(plan.rows.map(p=>[p.x,p.y]));check();if(!sampler.isCurrent())throw Error('O MDT mudou durante a leitura.');
  const rows=plan.rows.map((p,i)=>({...p,z:zz[i]})),settings={width:num($('Width').value),maxHeight:num($('Height').value),cut:num($('Cut').value),direction:$('Direction').value,interval:num($('Interval').value),nativeResolution:sampler.resolution};
  let result=E.design(rows,settings);const tolerance=num($('Tolerance').value);if(!(tolerance>0))throw Error('A distância de associação à bacia deve ser maior que zero.');
  // Reread authored attributes for every analysis. A calculated C displayed
  // in this panel must not become an untracked cache of the source raster.
  basinOptions($('Basin').value);
  const chosen=chooseBasin([result.rows[0].x,result.rows[0].y],tolerance);state.basin=chosen.b;basinUI(chosen.why);
  let hydro=null,hydroError='';const stamp=bStamp(chosen.b);
  try{hydro=await hydrology(chosen.b,check);}catch(e){if(e.name==='AbortError')throw e;hydroError=e.message;}check();
  if(chosen.b&&bStamp(chosen.b)!==stamp)throw Error('Os atributos da bacia mudaram durante o cálculo.');
  if(hydro){result=E.design(rows,{...settings,Q:hydro.Q});}
  const features=E.drawing(result),review={context:c,form:JSON.stringify(values()),basin:chosen.b,basinStamp:stamp,association:chosen.why,result,features,settings,hydro,hydroError,idfStamp:JSON.stringify(S.hidro?.idf||null)};
  state.review=review;preview(review);render(review);
  const counts=result.steps.reduce((a,s)=>{const k=s.hydraulic?.regime;if(k)a[k]=(a[k]||0)+1;return a;},{});
  status(result.count+' degraus · '+fmt(result.height)+' m de altura · '+fmt(result.length)+' m de extensão'+(hydro?' · Q '+flow(hydro.Q)+'.':'. '+hydroError)+(result.uphill>.01?' Há trechos ascendentes no terreno; corte máximo '+fmt(result.maxCut)+' m.':'')+(counts.outside?' '+counts.outside+' degrau(s) fora da faixa do gráfico.':''));
  return review;
 }catch(e){clearPreview();state.review=null;status(e.message);if(e.name!=='AbortError')toast(e.message);return null;}
 finally{sampler?.close();if(state.job===controller)state.job=null;busy(false);}
}
function preview(v){
 clearPreview();const group=L2.layerGroup();for(const f of v.features){if(f.props.TIPO==='Pé do degrau')continue;const ll=f.geom.map(p=>{const q=proj4(v.context.crs,'EPSG:4326',p);return [q[1],q[0]];});L2.polyline(ll,{color:'#e69a20',weight:2,interactive:false,pane:'alagis_desenho'}).addTo(group);}state.preview=group.addTo(map);
}
function svgFrame(title,width,height,body){return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+html(title)+'"><rect width="100%" height="100%" fill="#fff"/><g font-family="Arial,sans-serif" font-size="11" fill="#283d4c">'+body+'</g></svg>';}
function profileSVG(r){
 const W=680,H=270,l=65,t=25,w=590,h=185,zmin=Math.min(r.z1,...r.rows.map(p=>p.z)),zmax=Math.max(r.z0,...r.rows.map(p=>p.z)),range=Math.max(.1,zmax-zmin),X=s=>l+s/r.length*w,Y=z=>t+(zmax-z)/range*h;
 let s='<text x="'+l+'" y="14" font-weight="bold">Perfil longitudinal · cotas e distâncias em metros</text>';
 for(let i=0;i<=4;i++){const x=l+w*i/4,y=t+h*i/4;s+='<path d="M'+x+' '+t+'V'+(t+h)+'M'+l+' '+y+'H'+(l+w)+'" stroke="#dae1e6"/><text x="'+x+'" y="'+(t+h+17)+'" text-anchor="middle">'+fmt(r.length*i/4)+'</text><text x="'+(l-7)+'" y="'+(y+4)+'" text-anchor="end">'+fmt(zmax-range*i/4)+'</text>';}
 const terrain=r.rows.map((p,i)=>(i?'L':'M')+X(p.s).toFixed(2)+' '+Y(p.z).toFixed(2)).join('');let path='M'+X(0)+' '+Y(r.z0);
 for(const p of r.steps)path+='L'+X(p.start).toFixed(2)+' '+Y(p.floor).toFixed(2)+'L'+X(p.end).toFixed(2)+' '+Y(p.floor).toFixed(2);
 s+='<path d="'+terrain+'" fill="none" stroke="#687b68" stroke-width="1.7"/><path d="'+path+'" fill="none" stroke="#1679ae" stroke-width="1.8"/>';
 s+='<text x="'+l+'" y="252" fill="#687b68">— Terreno</text><text x="180" y="252" fill="#1679ae">— Escada</text><text x="'+(l+w)+'" y="252" text-anchor="end">Entrada → saída · escalas dos eixos independentes</text>';
 return svgFrame('Terreno natural e degraus da escada hidráulica',W,H,s);
}
function regimeSVG(r){
 const steps=r.steps.filter(s=>s.hydraulic),W=680,H=290,l=65,t=38,w=590,h=195,x0=Math.tan(3.4*Math.PI/180),x1=Math.tan(60*Math.PI/180),ymax=Math.max(1.5,...steps.map(s=>s.hydraulic.y*1.1)),X=x=>l+(x-x0)/(x1-x0)*w,Y=y=>t+h-y/ymax*h;
 let s='<text x="'+l+'" y="15" font-weight="bold">Regime previsto · y꜀ / h × h / l</text>';
 const curve=(fn,reverse=false)=>Array.from({length:70},(_,i)=>{const x=x0+(x1-x0)*(reverse?69-i:i)/69;return [X(x),Y(fn(x))];});
 const path=pts=>pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(2)+' '+p[1].toFixed(2)).join('')+'Z';
 const na=curve(x=>E.bounds(x).nappe),sk=curve(x=>E.bounds(x).skimming);
 s+='<path d="'+path([[l,t+h],...na,[l+w,t+h]])+'" fill="#dcecf8"/><path d="'+path([...na,...sk.slice().reverse()])+'" fill="#fff0ce"/><path d="'+path([[l,t],...sk,[l+w,t]])+'" fill="#ddf2e9"/>';
 for(let i=0;i<=4;i++){const x=l+w*i/4,y=t+h*i/4;s+='<path d="M'+x+' '+t+'V'+(t+h)+'M'+l+' '+y+'H'+(l+w)+'" stroke="#bdcbd6" stroke-width=".5"/><text x="'+x+'" y="'+(t+h+16)+'" text-anchor="middle">'+fmt(x0+(x1-x0)*i/4)+'</text><text x="'+(l-7)+'" y="'+(y+4)+'" text-anchor="end">'+fmt(ymax*(1-i/4))+'</text>';}
 for(const row of [na,sk])s+='<path d="'+row.map((p,i)=>(i?'L':'M')+p[0].toFixed(2)+' '+p[1].toFixed(2)).join('')+'" fill="none" stroke="#5e7480" stroke-width="1.1"/>';
 for(const p of steps){const v=p.hydraulic,x=Math.max(x0,Math.min(x1,v.x));s+='<circle cx="'+X(x).toFixed(2)+'" cy="'+Y(v.y).toFixed(2)+'" r="3.5" fill="'+colors[v.regime]+'" stroke="#fff" stroke-width=".7"><title>Degrau '+p.index+': '+label[v.regime]+'; h/l = '+fmt(v.x)+'; y꜀/h = '+fmt(v.y)+(v.valid?'':' (ponto junto à borda: fora da faixa)')+'</title></circle>';}
 s+='<text x="'+l+'" y="281" fill="'+colors.nappe+'">● Nappe</text><text x="175" y="281" fill="'+colors.transition+'">● Transição</text><text x="300" y="281" fill="'+colors.skimming+'">● Skimming</text><text x="480" y="281">h/l · pontos = degraus</text>';
 return svgFrame('Regimes nappe, transição e skimming por degrau',W,H,s);
}
function render(v){
 const r=v.result;$('Profile').innerHTML=profileSVG(r);
 $('Summary').innerHTML='<span class="stairs-chip">'+r.count+' degraus</span><span class="stairs-chip">h '+fmt(r.height)+' m</span><span class="stairs-chip">Queda '+fmt(r.drop)+' m</span><span class="stairs-chip">Corte máx. '+fmt(r.maxCut)+' m</span>';
 if(v.hydro){$('Regime').innerHTML=regimeSVG(r);const v0=r.steps[0].hydraulic,counts=r.steps.reduce((a,p)=>{a[p.hydraulic.regime]=(a[p.hydraulic.regime]||0)+1;return a;},{});$('HydroSummary').textContent='Q '+flow(v.hydro.Q)+' · q '+fmt(v0.q)+' m²/s · y꜀ '+fmt(v0.yc)+' m. '+Object.entries(counts).map(([k,n])=>n+' '+label[k]).join(' · ');}
 else{$('Regime').textContent='Complete a vazão no card 2 para gerar o gráfico de regime.';$('HydroSummary').textContent='';}
 $('Details').disabled=false;
}
function validReview(v){
 if(!v||!current(v.context,true)||JSON.stringify(values())!==v.form||v.basin&&(!S.layers.includes(v.basin.L)||!v.basin.L.features.includes(v.basin.f)||bStamp(v.basin)!==v.basinStamp))throw Error('Os dados mudaram. Analise novamente antes de gerar a escada.');
 if(v.hydro?.idf&&JSON.stringify(S.hidro?.idf||null)!==v.idfStamp)throw Error('A curva IDF mudou. Analise novamente.');
 if(v.hydro?.cRaster&&(!S.rasters.includes(v.hydro.cRaster)||rasterStamp(v.hydro.cRaster)!==v.hydro.cStamp))throw Error('A camada C mudou. Analise novamente.');
 if(!v.hydro?.Q)throw Error(v.hydroError||'Complete a vazão e analise novamente.');return true;
}
function snapshot(L){return {features:L.features,fields:L.fields,recipe:L._hydraulicStairs};}
function removeLayer(L){try{if(L.llayer)map.removeLayer(L.llayer);}catch(_){}S.layers=S.layers.filter(q=>q!==L);if(S.stack)S.stack=S.stack.filter(q=>q!=='L:'+L.id);}
function commit(v=state.review){
 let L=null,created=false,before=null,previous=S.activeId;
 try{
  validReview(v);L=layer(state.target);if(L&&!L._hydraulicStairs)throw Error('A camada de destino foi alterada. Reabra o módulo.');
  if(L&&(L.locked||typeof canEditLayer==='function'&&!canEditLayer(L,false)))throw Error('Desbloqueie a camada da escada antes de atualizar.');
  const hydro=Object.fromEntries(Object.entries(v.hydro).filter(([k])=>!['cRaster','cStamp'].includes(k)));
  const recipe={version:1,kind:'hydraulic-stairs',createdAt:new Date().toISOString(),crs:v.context.crs,source:{layerId:v.context.L.id,featureIndex:v.context.L.features.indexOf(v.context.f),rasterId:v.context.R.id,rasterName:v.context.R.name},
   basin:{key:v.basin.key,layerId:v.basin.L.id,name:v.basin.name,areaM2:v.basin.area,association:v.association},form:values(),settings:v.settings,hydro,result:v.result,reference:E.SOURCE};
  const targetCRS=L?.crs||v.context.crs,features=clone(v.features).map(f=>({...f,geom:targetCRS===v.context.crs?f.geom:f.geom.map(p=>proj4(v.context.crs,targetCRS,p)),props:{...f.props,BACIA:v.basin.name,AREA_HA:v.basin.area/10000,C:hydro.C??null,I_MM_H:hydro.i??null}}));
  const fields=[['TIPO','C',45],['DEGRAU','N',10],['ESTACA_M','N',18],['PISO_M','N',14],['ALTURA_M','N',12],['COTA','N',18],['REGIME','C',24],['Q_M3S','N',18],['BACIA','C',180],['AREA_HA','N',18],['C','N',12],['I_MM_H','N',14]].map(([name,type,length])=>({name,type,length,decimal:type==='N'?6:0}));
  if(L){before=snapshot(L);L.features=features;L.fields=fields;L._hydraulicStairs=clone(recipe);drawLayer(L);}
  else{let n=1;while(S.layers.some(q=>q.name==='Escada hidráulica '+n))n++;L=addLayer({name:'Escada hidráulica '+n,gtype:'line',crs:v.context.crs,features,fields,color:'#246c9a'});created=true;L._hydraulicStairs=clone(recipe);L.lbl.onMap=false;drawLayer(L);}
  undoPush({t:'hydraulicstairs',project:S.projectId,L,created,before,previous});S.activeId=L.id;state.target=L.id;state.saved=L._hydraulicStairs;clearPreview();refreshUI();zApply();root.GeoMineSessionAutosave?.markDirty('escada hidráulica');$('Commit').textContent='Atualizar escada';status('Escada gerada em “'+L.name+'”. Perfil e gráfico disponíveis em Ver detalhes.');toast('Escada hidráulica gerada.');return L;
 }catch(e){if(created&&L)removeLayer(L);else if(L&&before){L.features=before.features;L.fields=before.fields;L._hydraulicStairs=before.recipe;try{drawLayer(L);}catch(_){}}status(e.message);toast(e.message);return null;}
}
function undo(a){
 if(a.project!==S.projectId||S.undo.at(-1)!==a)return false;
 if(S.layers.includes(a.L)&&(a.L.locked||typeof canEditLayer==='function'&&!canEditLayer(a.L,false))){toast('Desbloqueie a escada para desfazer.');return false;}
 S.undo.pop();if(S.layers.includes(a.L)){if(a.created)removeLayer(a.L);else{a.L.features=a.before.features;a.L.fields=a.before.fields;a.L._hydraulicStairs=a.before.recipe;drawLayer(a.L);}}
 if(S.selFeat?.layer===a.L)S.selFeat=null;S.activeId=layer(a.previous)?.id??S.layers[0]?.id??null;invalidate('Alteração da escada desfeita.');refreshUI();zApply();root.GeoMineSessionAutosave?.markDirty('desfazer escada');return true;
}
function reportView(){const v=state.review;if(v)return v;const r=state.saved;return r?{result:r.result,hydro:r.hydro,basin:r.basin,settings:r.settings,association:r.basin.association}:null;}
function reportHTML(v){
 const r=v.result,b=v.basin,h=v.hydro;
 const info='<p><b>'+html(b?.name||'Bacia não definida')+'</b> · '+fmt((b?.area??b?.areaM2)/10000)+' ha<br>Largura '+fmt(r.width)+' m · Queda '+fmt(r.drop)+' m · '+r.count+' degraus · altura '+fmt(r.height)+' m · corte máximo '+fmt(r.maxCut)+' m</p>';
 const hInfo=h?'<p>Q = '+flow(h.Q)+(h.method==='rational'?' · Método Racional · C '+fmt(h.C)+' · i '+fmt(h.i)+' mm/h'+(h.tc?' · tc '+fmt(h.tc)+' min · T '+fmt(h.T)+' anos':''):' · '+(h.method==='manual'?'vazão informada':'atributo da bacia'))+'</p>':'';
 const table='<table><thead><tr><th>Degrau</th><th>De (m)</th><th>Até (m)</th><th>Piso (m)</th><th>Altura (m)</th><th>Cota (m)</th><th>h/l</th><th>y꜀/h</th><th>Regime</th></tr></thead><tbody>'+r.steps.map(p=>'<tr><td>'+p.index+'</td><td>'+fmt(p.start)+'</td><td>'+fmt(p.end)+'</td><td>'+fmt(p.tread)+'</td><td>'+fmt(p.height)+'</td><td>'+fmt(p.floor)+'</td><td>'+fmt(p.hydraulic?.x)+'</td><td>'+fmt(p.hydraulic?.y)+'</td><td>'+html(label[p.hydraulic?.regime]||'Sem vazão')+'</td></tr>').join('')+'</tbody></table>';
 return info+hInfo+(v.settings?'<p class="hint">Perfil amostrado a cada '+fmt(v.settings.interval)+' m · MDT nativo '+fmt(v.settings.nativeResolution)+' m/célula.</p>':'')+'<div class="stairs-chart">'+profileSVG(r)+(h?regimeSVG(r):'')+'</div>'+methodInfo()+table;
}
function methodInfo(){return '<p class="hint">Regime estimado por degrau: q = Q/b; y꜀ = (q²/g)⅓. Limites y꜀/h = 0,89 − 0,40(h/l) e 1,20 − 0,325(h/l), para 3,4° &lt; arctan(h/l) &lt; 60°. Pisos variáveis seguem o MDT; a classificação local é uma estimativa, não uma simulação do escoamento desenvolvido. y꜀ é profundidade crítica, não a altura da parede. Paredes, aeração e dissipação na saída exigem dimensionamento próprio. <a href="'+E.SOURCE+'" target="_blank" rel="noopener">Referência: Environment Agency, seção 3.7.</a></p>';}
function details(){const v=reportView();if(!v)return;$('ReportBody').innerHTML=reportHTML(v);$('Report').classList.add('on');}
function download(){const v=reportView();if(!v)return;const text='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Escada hidráulica — perfil e regime</title><style>body{font:14px Arial;max-width:1100px;margin:24px auto;padding:0 20px}svg{width:100%}table{border-collapse:collapse;width:100%;font-size:11px}th,td{padding:5px;border:1px solid #ccd;text-align:right}.hint{line-height:1.5}</style><h1>Escada hidráulica</h1>'+reportHTML(v)+'</html>',url=URL.createObjectURL(new Blob([text],{type:'text/html;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='Escada-hidraulica.html';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function ensure(){
 if(document.getElementById('secHydraulicStairs'))return;
 const sec=document.createElement('div');sec.id='secHydraulicStairs';sec.className='sec collapsed';sec.style.display='none';
 sec.innerHTML=`<h3>Escada hidráulica</h3><div class="body">
 <section class="gm-work-card"><div class="gm-card-heading"><span class="gm-card-step">1</span><b>Linha e terreno</b><details class="gm-card-info"><summary aria-label="Ajuda sobre o traçado">ⓘ</summary><p>Trace a escada do exutório da bacia até a descarga. Use uma linha existente ou desenhe com mouse, toque ou caneta. O sentido automático começa na ponta mais alta. O perfil é lido no MDT original.</p></details></div>
 <div class="row2"><button class="tbtn" id="stairsDraw" type="button">Desenhar linha</button><button class="tbtn" id="stairsUse" type="button">Usar selecionada</button></div>
 <label class="field" for="stairsLayer">Camada da linha</label><select id="stairsLayer"></select>
 <label class="field" for="stairsFeature">Linha</label><select id="stairsFeature"></select>
 <label class="field" for="stairsRaster">MDT do terreno</label><select id="stairsRaster"></select>
 <label class="field" for="stairsDirection">Sentido</label><select id="stairsDirection"><option value="auto">Automático — da cota maior para a menor</option><option value="forward">Do primeiro ao último vértice</option><option value="reverse">Do último ao primeiro vértice</option></select>
 </section>
 <section class="gm-work-card"><div class="gm-card-heading"><span class="gm-card-step">2</span><b>Bacia e vazão</b><details class="gm-card-info"><summary aria-label="Ajuda sobre a bacia e vazão">ⓘ</summary><p>A entrada é associada ao exutório ou a uma única bacia que a contenha. Havendo sobreposição, escolha a bacia. A área é a do polígono completo, com furos descontados. Vazão registrada é reutilizada; no Método Racional, C precisa representar toda a bacia. A chuva é usada para vazão, não para estimar C.</p></details></div>
 <label class="field" for="stairsBasin">Bacia atendida</label><select id="stairsBasin"></select><div class="hint" id="stairsBasinInfo"></div>
 <label class="field" for="stairsQMode">Vazão de projeto</label><select id="stairsQMode"><option value="auto">Automática — da bacia ou Método Racional</option><option value="saved">Reutilizar Q registrada na bacia</option><option value="rational">Calcular pelo Método Racional</option><option value="manual">Informar Q</option></select>
 <div id="stairsSavedBox"><div class="hint" id="stairsSavedInfo"></div></div>
 <div id="stairsManualBox" hidden><label class="field" for="stairsQ">Q (m³/s)</label><input id="stairsQ" type="number" step="any" min="0" placeholder="Vazão de projeto"></div>
 <div id="stairsRationalBox">
 <label class="field" for="stairsCMode">Coeficiente de deflúvio</label><select id="stairsCMode"><option value="auto">C médio ponderado da bacia</option><option value="manual">C informado para toda a bacia</option></select><div class="hint" id="stairsCInfo"></div>
 <div id="stairsManualCBox" hidden><label class="field" for="stairsC">C global (0 a 1)</label><input id="stairsC" type="number" step="any" min="0" max="1" placeholder="C de toda a bacia"></div>
 <label class="field" for="stairsRainMode">Chuva de projeto</label><select id="stairsRainMode"><option value="idf">Curva IDF do projeto</option><option value="intensity">Intensidade informada</option></select>
 <div id="stairsIDFBox"><div class="grid2"><div><label class="field" for="stairsT">T (anos)</label><input id="stairsT" type="number" min="1" value="25" step="1"></div><div><label class="field" for="stairsTc">tc (min)</label><input id="stairsTc" type="number" min="0" step="any" placeholder="Da bacia"></div></div><div class="hint" id="stairsIDFInfo"></div></div>
 <div id="stairsIntensityBox" hidden><label class="field" for="stairsIntensity">i (mm/h)</label><input id="stairsIntensity" type="number" min="0" step="any" placeholder="Intensidade de projeto"></div>
 </div></section>
 <section class="gm-work-card"><div class="gm-card-heading"><span class="gm-card-step">3</span><b>Degraus</b><details class="gm-card-info"><summary aria-label="Ajuda sobre os degraus">ⓘ</summary><p>A altura é ajustada para vencer exatamente o desnível, sem ultrapassar o máximo informado. Os pisos variam com o perfil. Trechos ascendentes exigem corte, mostrado no gráfico. Se a linha passar por um ponto abaixo da saída, ajuste o traçado.</p></details></div>
 <div class="grid2"><div><label class="field" for="stairsWidth">Largura útil (m)</label><input id="stairsWidth" type="number" min="0.01" value="1.00" step="0.01"></div><div><label class="field" for="stairsHeight">Altura máxima (m)</label><input id="stairsHeight" type="number" min="0.01" value="0.30" step="0.01"></div></div>
 <details><summary>Ajustes do perfil</summary><label class="field" for="stairsCut">Rebaixo da linha de apoio (m)</label><input id="stairsCut" type="number" min="0" value="0.00" step="0.01"><label class="field" for="stairsInterval">Intervalo de amostragem (m)</label><input id="stairsInterval" type="number" min="0.05" value="1.00" step="0.05"><label class="field" for="stairsTolerance">Distância ao exutório (m)</label><input id="stairsTolerance" type="number" min="0.1" value="10.00" step="0.1"></details>
 <button class="tbtn gm-card-primary" id="stairsAnalyze" type="button">Analisar perfil e vazão</button><button class="tbtn" id="stairsCancel" type="button" hidden>Cancelar análise</button></section>
 <section class="gm-work-card"><div class="gm-card-heading"><span class="gm-card-step">4</span><b>Perfil e regime</b><details class="gm-card-info"><summary aria-label="Ajuda sobre nappe e skimming">ⓘ</summary>${methodInfo()}</details></div>
 <div id="stairsSummary"></div><div class="stairs-chart" id="stairsProfile"></div><div class="hint" id="stairsHydroSummary"></div><div class="stairs-chart" id="stairsRegime"></div>
 <button class="tbtn" id="stairsDetails" type="button" style="width:100%;justify-content:center;margin-top:6px" disabled>Ver perfil, gráfico e tabela</button>
 <button class="tbtn gm-card-primary" id="stairsCommit" type="button" disabled>Gerar escada</button></section>
 <div id="stairsStatus" role="status" aria-live="polite"></div></div>`;
 document.getElementById('secBacia').parentNode.append(sec);
 const report=document.createElement('div');report.className='modal-bg';report.id='stairsReport';report.innerHTML='<div class="modal"><div class="modal-h"><b>Escada hidráulica · perfil e regime</b><div style="flex:1"></div><button class="tbtn" id="stairsDownload" type="button">Baixar relatório</button><button class="tbtn" id="stairsReportClose" type="button">Fechar</button></div><div class="modal-b" id="stairsReportBody"></div></div>';document.body.append(report);
 const hud=document.createElement('div');hud.id='stairsDrawHud';hud.hidden=true;hud.innerHTML='<span>Trace a linha da escada</span><button class="tbtn" id="stairsFinish" type="button">Concluir</button><button class="tbtn" id="stairsDrawCancel" type="button">Cancelar</button>';document.body.append(hud);
 $('Layer').onchange=()=>{featureOptions();invalidate();};$('Basin').onchange=()=>{state.basin=state.candidates.find(b=>b.key===$('Basin').value)||null;basinUI();invalidate();};
 for(const e of sec.querySelectorAll('input,select')){if(['stairsLayer','stairsBasin'].includes(e.id))continue;e.addEventListener(e.tagName==='SELECT'?'change':'input',()=>{if(e.id==='stairsTc')delete e.dataset.basin;sync();invalidate();});}
 $('Draw').onclick=beginDraw;$('Use').onclick=useSelected;$('Finish').onclick=()=>{if(S.drawBuf?.length<2){toast('Marque pelo menos dois pontos.');return;}finishDraw();};$('DrawCancel').onclick=()=>{endDraw(true);open(state.anchor);};
 $('Analyze').onclick=()=>void analyze();$('Commit').onclick=()=>commit();$('Details').onclick=details;$('Cancel').onclick=()=>state.job?.abort();$('ReportClose').onclick=()=>$('Report').classList.remove('on');$('Download').onclick=download;
}
function refresh(source=null){
 const oldL=source?.layerId??$('Layer').value,oldF=source?.featureIndex??$('Feature').value,oldR=source?.rasterId??$('Raster').value;
 options($('Layer'),lineLayers().map(L=>[L.id,L.name]),oldL,'Escolha uma linha');featureOptions(oldF);
 options($('Raster'),models().map(R=>[R.id,R.name]),oldR,'Escolha o MDT');
 if(!$('Raster').value){const known=models().find(r=>String(r.id)===String(S.topoRasterId)),ground=models().filter(r=>/\bMDT\b|terreno/i.test(r.name||''));if(known)$('Raster').value=String(known.id);else if(ground.length===1)$('Raster').value=String(ground[0].id);else if(models().length===1)$('Raster').value=String(models()[0].id);}
 basinOptions($('Basin').value);sync();
}
function useSelected(){
 try{const sf=S.selFeat,L=sf?.layer;if(L?.gtype!=='line'||L._hydraulicStairs||!L.features?.[sf.idx])throw Error('Selecione no mapa a linha que será o eixo da escada.');refresh({layerId:L.id,featureIndex:sf.idx});invalidate('Linha selecionada. Confira o MDT e analise o perfil.');}
 catch(e){toast(e.message);}
}
function open(btn){
 ensure();if(state.job)return;const same=state.project===S.projectId;state.project=S.projectId;
 if(btn?.getBoundingClientRect)state.anchor=btn;const anchor=state.anchor?.isConnected?state.anchor:document.querySelector('#ribbon .rbtn[title*="Escada hidráulica"]')||document.getElementById('ribbon');
 const active=activeLayer(),recipe=active?._hydraulicStairs;
 if(recipe){invalidate('Escada salva. Analise novamente para alterar o dimensionamento.');state.target=active.id;state.saved=recipe;
  refresh(recipe.source);for(const [id,value] of Object.entries(recipe.form||{}))if($(id)&&!['Layer','Feature','Raster','Basin'].includes(id))$(id).value=value;
  options($('Basin'),state.candidates.map(b=>[b.key,b.name]),recipe.basin.key,'Automática pela entrada da linha');state.basin=state.candidates.find(b=>b.key===$('Basin').value)||null;basinUI();render({result:recipe.result,hydro:recipe.hydro});
 }else{
  if(!same){invalidate('Desenhe ou selecione uma linha para começar.');state.saved=null;for(const id of ['Q','C','Tc','Intensity'])$(id).value='';delete $('Tc').dataset.basin;$('QMode').value='auto';$('CMode').value='auto';$('RainMode').value=S.hidro?.idf?'idf':'intensity';}
  state.target=null;
  refresh();const sf=S.selFeat;if(sf?.layer?.gtype==='line'&&!sf.layer._hydraulicStairs&&sf.layer.features?.[sf.idx]){options($('Layer'),lineLayers().map(L=>[L.id,L.name]),sf.layer.id,'Escolha uma linha');featureOptions(sf.idx);}
  if(!same&&!S.hidro?.idf)$('RainMode').value='intensity';sync();
 }
 $('Commit').textContent=state.target&&layer(state.target)?'Atualizar escada':'Gerar escada';ribbonOpen(document.getElementById('secHydraulicStairs'),anchor,'Escada hidráulica');
}
function beginDraw(){
 try{
  if(state.job)return;metric();if(S.drawBuf?.length||typeof ED!=='undefined'&&(ED.drag||ED.pend))throw Error('Conclua o desenho ou a edição em andamento.');
  if(typeof ED!=='undefined'&&ED.on&&typeof edLigar==='function')edLigar(false);
  invalidate('Desenhe a linha e toque em Concluir.');state.target=null;state.saved=null;
  const L=addLayer({name:'Linhas de escada hidráulica',gtype:'line',crs:S.workCRS,features:[],fields:[{name:'NOME',type:'C',length:80}],color:'#246c9a'});
  S.activeId=L.id;S.selFeat=null;S.selRaster=null;ribbonClose();if(S._view!=='map')switchView('map');setTool('line');state.drawing={project:S.projectId,L,generation:root.GeoMineSessionAutosave?.state?.generation,crs:S.workCRS};$('DrawHud').hidden=false;
  toast('Trace a escada no mapa. Snap, caneta e toque usam o desenho normal. Toque em Concluir.');
 }catch(e){toast(e.message);}
}
function endDraw(cancel=false){
 const d=state.drawing;state.drawing=null;if($('DrawHud'))$('DrawHud').hidden=true;
 if(cancel&&d){if(GeoMineDrawingSession.layer()===d.L)clearDraw();if(!d.L.features.length)removeLayer(d.L);if(S.tool==='line')setTool('select');if(S.activeId===d.L.id)S.activeId=S.layers[0]?.id??null;refreshUI();}
}
function projectChanged(){state.job?.abort();endDraw(true);clearPreview();state.review=null;state.saved=null;state.target=null;state.basin=null;state.project=null;if($('Report'))$('Report').classList.remove('on');if(typeof RIB!=='undefined'&&RIB.sec?.id==='secHydraulicStairs')ribbonClose();}
function boot(){
 const baseFinish=root.finishDraw;if(typeof baseFinish==='function')root.finishDraw=function(options={}){const d=state.drawing,ok=d?baseFinish.call(this,{...options,quick:true}):baseFinish.apply(this,arguments);if(ok&&d&&S.projectId===d.project&&d.L.features.length&&root.GeoMineSessionAutosave?.state?.generation===d.generation){const f=d.L.features.at(-1);f.props.NOME='Eixo da escada';endDraw();setTool('select');open(state.anchor);$('Layer').value=String(d.L.id);featureOptions(d.L.features.length-1);void analyze();}return ok;};
 // Escape cancels the same native draft; no custom pointer interpretation is
 // introduced into the map's shared drawing pipeline.
 document.addEventListener('keydown',e=>{if(state.drawing&&e.key==='Escape'&&!/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)){endDraw(true);e.preventDefault();open(state.anchor);}},true);
 const cat=CATS.find(c=>c.id==='hidrologia');if(cat){let group=cat.grupos.find(g=>/Hidr[aá]ulica/.test(g.label));if(!group){group={label:'Hidráulica',it:[]};cat.grupos.push(group);}if(!group.it.some(c=>c.ic==='hydraulic_stairs'))group.it.push({nome:'Escada hidráulica',ic:'hydraulic_stairs',aliases:['escada de água','escada d’água','nappe flow','skimming flow'],desc:'Linha, bacia, vazão, degraus pelo MDT e gráfico de regime',act:open});
 RIB_SVG.hydraulic_stairs='<svg viewBox="0 0 32 32" fill="none" stroke-linejoin="round" stroke-linecap="round"><path d="M3 7h7v6h7v6h7v6h5M3 12h2v6h7v6h7v6" stroke="#355969" stroke-width="1.6"/><path d="M5 3c3 0 4 5 7 6s4 5 7 6 4 5 8 6m-4-1 4 1-1-4" stroke="#258cb2" stroke-width="1.8"/></svg>';ribbonBuild();}
}
root.GeoMineHydraulicStairs={open,analyze,commit,undo,projectChanged,beginDraw,endDraw,chooseBasin,basinInfo,profileSVG,regimeSVG,state};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
