/* Cartographic slope hachures. All XY coordinates supplied here are metres.
   Rays stop at the FIRST engineering boundary; equal-height boundaries are
   berms, never another slope. Source geometry is never modified. */
(function(root){
'use strict';
const EPS=1e-7,finite=Number.isFinite,cross=(a,b)=>a[0]*b[1]-a[1]*b[0],dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const zAt=(a,b,t)=>finite(a[2])&&finite(b[2])?a[2]+(b[2]-a[2])*t:null;
function clean(path){
 const points=[];
 for(const p of path.points||[]){
  if(!Array.isArray(p)||!finite(p[0])||!finite(p[1]))throw Error('Há uma linha com coordenadas inválidas.');
  if(!points.length||dist(points.at(-1),p)>EPS)points.push([p[0],p[1],finite(p[2])?p[2]:null]);
 }
 return {...path,points};
}
/* Rejoin segmented berm edges BEFORE sampling: vertex density must not
   change the number or spacing of hachures. Junctions remain separate. */
function chains(input){
 const result=[],groups=new Map(),key=p=>p[0].toFixed(5)+':'+p[1].toFixed(5)+':'+(finite(p[2])?p[2].toFixed(3):'?');
 for(const raw of input){const p=clean(raw);if(p.points.length<2)continue;
  if(dist(p.points[0],p.points.at(-1))<=EPS){result.push(p);continue;}
  const g=JSON.stringify([p.group??p.key,p.role]);if(!groups.has(g))groups.set(g,[]);groups.get(g).push(p);
 }
 for(const paths of groups.values()){
  const nodes=new Map(),used=new Set();
  paths.forEach((p,i)=>{for(const q of [p.points[0],p.points.at(-1)]){const k=key(q);if(!nodes.has(k))nodes.set(k,[]);nodes.get(k).push(i);}});
  for(let i=0;i<paths.length;i++)if(!used.has(i)){
   const first=paths[i],points=first.points.map(p=>p.slice());used.add(i);
   for(const front of [false,true])while(true){
    const endpoint=front?points[0]:points.at(-1),neighbors=nodes.get(key(endpoint))||[];
    if(neighbors.length!==2)break;
    const j=neighbors.find(j=>!used.has(j));if(j==null)break;used.add(j);
    let pp=paths[j].points.map(p=>p.slice());
    if(front){if(key(pp.at(-1))!==key(endpoint))pp.reverse();points.unshift(...pp.slice(0,-1));}
    else{if(key(pp[0])!==key(endpoint))pp.reverse();points.push(...pp.slice(1));}
   }
   result.push({...first,points});
  }
 }
 return result;
}
function segments(paths){
 return paths.flatMap((p,pi)=>p.points.slice(1).map((b,i)=>{const a=p.points[i];return {a,b,pi,role:p.role,minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minY:Math.min(a[1],b[1]),maxY:Math.max(a[1],b[1])};}));
}
function tree(items){
 if(!items.length)return null;
 const box={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity};
 for(const s of items){box.minX=Math.min(box.minX,s.minX);box.minY=Math.min(box.minY,s.minY);box.maxX=Math.max(box.maxX,s.maxX);box.maxY=Math.max(box.maxY,s.maxY);}
 if(items.length<=8)return {...box,items};
 const axis=box.maxX-box.minX>=box.maxY-box.minY?'X':'Y',sorted=items.slice().sort((a,b)=>(a['min'+axis]+a['max'+axis])-(b['min'+axis]+b['max'+axis])),m=sorted.length>>1;
 return {...box,left:tree(sorted.slice(0,m)),right:tree(sorted.slice(m))};
}
function rayBox(p,d,b,max){
 let lo=0,hi=max;
 for(const [k,i] of [['X',0],['Y',1]]){
  if(Math.abs(d[i])<1e-14){if(p[i]<b['min'+k]-EPS||p[i]>b['max'+k]+EPS)return false;continue;}
  let a=(b['min'+k]-p[i])/d[i],z=(b['max'+k]-p[i])/d[i];if(a>z)[a,z]=[z,a];lo=Math.max(lo,a);hi=Math.min(hi,z);if(lo>hi+EPS)return false;
 }return hi>=EPS;
}
function firstHit(node,p,d,max){
 let hit=null,best=max;
 function visit(n){if(!n||!rayBox(p,d,n,best))return;
  if(!n.items){visit(n.left);visit(n.right);return;}
  for(const s of n.items){const v=[s.b[0]-s.a[0],s.b[1]-s.a[1]],w=[s.a[0]-p[0],s.a[1]-p[1]],den=cross(d,v);if(Math.abs(den)<1e-12)continue;
   const t=cross(w,v)/den,u=cross(w,d)/den;
   if(t<=EPS||t>best+EPS||u<-EPS||u>1+EPS)continue;
   if(t<best-EPS||!hit||s.role==='barrier'){
    best=t;const f=Math.max(0,Math.min(1,u));hit={segment:s,distance:t,point:[p[0]+d[0]*t,p[1]+d[1]*t,zAt(s.a,s.b,f)]};
   }
  }
 }visit(node);return hit;
}
function closest(node,p,predicate,max){
 let found=null,best=max;
 function visit(n){if(!n)return;
  const dx=Math.max(n.minX-p[0],0,p[0]-n.maxX),dy=Math.max(n.minY-p[1],0,p[1]-n.maxY);if(Math.hypot(dx,dy)>best)return;
  if(!n.items){visit(n.left);visit(n.right);return;}
  for(const s of n.items){const v=[s.b[0]-s.a[0],s.b[1]-s.a[1]],l=v[0]*v[0]+v[1]*v[1],t=l?Math.max(0,Math.min(1,((p[0]-s.a[0])*v[0]+(p[1]-s.a[1])*v[1])/l)):0,q=[s.a[0]+v[0]*t,s.a[1]+v[1]*t,zAt(s.a,s.b,t)],d=dist(p,q);
   if(d>EPS&&d<best&&predicate(s,q)){best=d;found={point:q,distance:d,segment:s};}
  }
 }visit(node);return found;
}
function arc(path){const cumulative=[0];for(let i=1;i<path.points.length;i++)cumulative.push(cumulative.at(-1)+dist(path.points[i-1],path.points[i]));return {points:path.points,cumulative,length:cumulative.at(-1)};}
function sample(a,s){
 s=Math.max(0,Math.min(a.length,s));let lo=0,hi=a.points.length-1;
 while(hi-lo>1){const m=(lo+hi)>>1;if(a.cumulative[m]<=s)lo=m;else hi=m;}
 const p=a.points[lo],q=a.points[hi],t=(s-a.cumulative[lo])/(a.cumulative[hi]-a.cumulative[lo]||1);
 return [p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t,zAt(p,q,t)];
}
/* -1 outside, 0 on boundary, 1 inside. */
function location(p,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[j],b=ring[i],v=[b[0]-a[0],b[1]-a[1]],w=[p[0]-a[0],p[1]-a[1]],l=v[0]*v[0]+v[1]*v[1],t=l?Math.max(0,Math.min(1,(w[0]*v[0]+w[1]*v[1])/l)):0;
  if(Math.hypot(w[0]-v[0]*t,w[1]-v[1]*t)<=EPS)return 0;
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside?1:-1;
}
function segmentParameters(a,b,c,d){
 const v=[b[0]-a[0],b[1]-a[1]],w=[d[0]-c[0],d[1]-c[1]],p=[c[0]-a[0],c[1]-a[1]],den=cross(v,w);
 if(Math.abs(den)<1e-12)return null;
 return [cross(p,w)/den,cross(p,v)/den];
}
function inMask(a,b,rings,allowed){
 if(!rings?.length)return false;
 const ts=[0,1];for(const r of rings)for(let i=0,j=r.length-1;i<r.length;j=i++){
  const q=segmentParameters(a,b,r[j],r[i]);if(q&&q[0]>0&&q[0]<1&&q[1]>=0&&q[1]<=1)ts.push(q[0]);
 }
 ts.sort((a,b)=>a-b);
 for(let i=1;i<ts.length;i++){
  const t=(ts[i-1]+ts[i])/2,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],places=rings.map(r=>location(p,r));
  if(allowed?places.every(k=>k<0):places.some(k=>k>0))return true;
 }return false;
}
function intersects(a,b){
 const t=segmentParameters(a.a,a.b,b.a,b.b);
 if(t)return t[0]>EPS&&t[0]<1-EPS&&t[1]>EPS&&t[1]<1-EPS;
 const v=[a.b[0]-a.a[0],a.b[1]-a.a[1]],w=[b.a[0]-a.a[0],b.a[1]-a.a[1]],l=v[0]*v[0]+v[1]*v[1];
 if(!l||Math.abs(cross(v,w))>EPS*Math.sqrt(l))return false;
 const t0=(w[0]*v[0]+w[1]*v[1])/l,t1=((b.b[0]-a.a[0])*v[0]+(b.b[1]-a.a[1])*v[1])/l;
 return Math.min(1,Math.max(t0,t1))-Math.max(0,Math.min(t0,t1))>EPS;
}
function generate(input,options={}){
 const spacing=Number(options.spacing??2),short=Number(options.shortRatio??.5),auto=options.mode!=='pair';
 if(!(spacing>=.01&&finite(spacing)))throw Error('Informe um espaçamento de pelo menos 0,01 m.');
 if(!(short>0&&short<=1))throw Error('O traço curto deve ter entre 1% e 100% da face.');
 const paths=chains(input),segs=segments(paths);if(segs.length>100000)throw Error('Há mais de 100 mil segmentos. Selecione uma parte do talude.');
 const index=tree(segs);if(!index)throw Error('Escolha linhas válidas de crista e pé.');
 const max=Number(options.maxDistance)||Math.hypot(index.maxX-index.minX,index.maxY-index.minY)*1.01;
 const candidates=[],stats={positions:0,missingHeight:0,flatOrUphill:0,noBoundary:0,masked:0,crossing:0},limit=20000;
 for(let pi=0;pi<paths.length;pi++){
  const path=paths[pi];if(path.role==='barrier'||(!auto&&path.role!=='crest'))continue;
  const a=arc(path),n=Math.max(1,Math.floor((a.length+Math.max(EPS,a.length*1e-12))/spacing));
  if(stats.positions+n>limit)throw Error('O espaçamento geraria mais de 20 mil posições. Aumente o espaçamento ou selecione menos linhas.');
  for(let i=0;i<n;i++){
   stats.positions++;const s=(i+.5)*a.length/n,q=sample(a,s),h=Math.min(spacing*.1,a.length*.001,.05),u=sample(a,s-h),v=sample(a,s+h),len=dist(u,v);if(len<=EPS)continue;
   const normal=[-(v[1]-u[1])/len,(v[0]-u[0])/len],hits=[];
   const check=direction=>{
    const hit=firstHit(index,q,direction,max);
    if(!hit||hit.segment.pi===pi||hit.segment.role==='barrier'||(!auto&&hit.segment.role!=='toe')){stats.noBoundary++;return null;}
    const both=finite(q[2])&&finite(hit.point[2]);
    if(auto&&!both){stats.missingHeight++;return null;}
    if(both&&q[2]-hit.point[2]<=.01){stats.flatOrUphill++;return null;}
    if(inMask(q,hit.point,options.blocked,false)||inMask(q,hit.point,options.allowed,true)){stats.masked++;return null;}
    return hit;
   };
   for(const sign of [1,-1]){
    if(options.side==='left'&&sign<0||options.side==='right'&&sign>0)continue;
    const hit=check(normal.map(x=>x*sign));if(hit)hits.push(hit);
   }
   // At a mitered corner the perpendicular may miss the shorter toe.
   // Fan to its nearest point, still checking the FIRST boundary and masks.
   if(!hits.length){
    const near=closest(index,q,(seg,p)=>seg.pi!==pi&&seg.role!=='barrier'&&(auto||seg.role==='toe')&&
      (!auto||finite(q[2])&&finite(p[2])&&q[2]-p[2]>.01),max);
    if(near){const d=[(near.point[0]-q[0])/near.distance,(near.point[1]-q[1])/near.distance],side=cross([v[0]-u[0],v[1]-u[1]],d);
     if(!(options.side==='left'&&side<0||options.side==='right'&&side>0)){
      const hit=check(d);if(hit&&Math.abs(hit.distance-near.distance)<1e-4)hits.push(hit);
     }
    }
   }
   // A ridge may have downhill faces on BOTH sides. An explicit manual
   // crest/toe pair uses its nearest valid face only.
   if(!auto)hits.sort((a,b)=>a.distance-b.distance).splice(1);
   for(const hit of hits){
    const ratio=options.alternating===false||i%2===0?1:short,to=hit.point.map((v,j)=>j===2?(finite(q[2])&&finite(v)?q[2]+(v-q[2])*ratio:null):q[j]+(v-q[j])*ratio);
    candidates.push({a:q.slice(),b:to,fullEnd:hit.point.slice(),ratio,station:s,from:pi,to:hit.segment.pi,minX:Math.min(q[0],to[0]),maxX:Math.max(q[0],to[0]),minY:Math.min(q[1],to[1]),maxY:Math.max(q[1],to[1]),id:candidates.length});
   }
  }
 }
 const accepted=new Set(),strokes=[],ct=tree(candidates);
 function conflict(node,s){
  if(!node||node.minX>s.maxX||node.maxX<s.minX||node.minY>s.maxY||node.maxY<s.minY)return false;
  return node.items?node.items.some(t=>accepted.has(t.id)&&intersects(s,t)):conflict(node.left,s)||conflict(node.right,s);
 }
 for(const s of candidates){if(conflict(ct,s)){stats.crossing++;continue;}accepted.add(s.id);strokes.push(s);}
 return {paths,strokes,stats:{...stats,generated:strokes.length}};
}
const api={generate,chains,location,intersects,inMask};root.GeoMineSlopeHachureGeometry=api;
if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
(function(root){
'use strict';
const $=id=>document.getElementById(id),clone=v=>v==null?v:JSON.parse(JSON.stringify(v)),G=()=>root.GeoMineSlopeHachureGeometry;
const state={generation:0,target:null,preview:null,project:null},fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const layer=id=>S.layers.find(L=>String(L.id)===String(id));
function batchKey(p){return JSON.stringify(p.mode==='pair'?['pair',String(p.crestLayerId),String(p.crestFeature??'all'),String(p.toeLayerId),String(p.toeFeature??'all')]:['auto',String(p.sourceLayerId)]);}
function entries(L){const m=L?._slopeHachures;return Array.isArray(m?.batches)?m.batches:m?.version===1?[{key:batchKey(m),settings:m,sourceName:L.name}]:[];}
function isHachure(f,L){return !!(f._slopeHachureBatch||f.props?.CIL_LOTE)||L?._slopeHachures?.version===1;}
const layers=()=>S.layers.filter(L=>['line','polygon'].includes(L.gtype)&&L.features.some(f=>!isHachure(f,L)));
const destinations=()=>S.layers.filter(L=>L.gtype==='line'&&!L.tinSurface&&!L.cavaDesign&&!L._cava2Engine&&!L._rb31Recipe&&!L._channelLink);
const generalLayer=()=>destinations().find(L=>L._slopeHachures?.defaultLayer)||destinations().find(L=>L.name==='Cílios de talude');
const ownerOf=key=>S.layers.find(L=>entries(L).some(e=>e.key===key));
const owned=(L,f,key)=>(f._slopeHachureBatch||f.props?.CIL_LOTE)===key||L._slopeHachures?.version===1&&batchKey(L._slopeHachures)===key;

const type=f=>String(f.props?.TIPO||f.props?.ELEMENTO||f.props?.CLASSE||'');
const boundary=f=>{const t=fold(type(f));return !/simbolo|cilio|eixo|chegada|pista|extravasor/.test(t)&&/crista|\bpe\b|fundo|berma|intersec|contorno fundido|encontro.*terreno|limite.*(extern|unico)/.test(t);};
const automatic=L=>!!L&&['line','polygon'].includes(L.gtype)&&L.features.filter(f=>!isHachure(f,L)&&boundary(f)).length>=2;
function stamp(L){const s=JSON.stringify([L.crs,L.features.filter(f=>!isHachure(f,L)).map(f=>[f.geom,f.zg,type(f)])]);let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return s.length+':'+(h>>>0);}
function metricCRS(L){
 const crs=S.workCRS||L.crs,def=proj4.defs(crs);
 if(!/longlat|latlong|merc/i.test(crs+' '+JSON.stringify(def||''))&&(!def?.units||def.units==='m'))return crs;
 let p;for(const f of L.features){const walk=g=>{if(!Array.isArray(g)||!g.length)return;if(typeof g[0]==='number')p=p||g;else g.forEach(walk);};walk(f.geom);if(p)break;}
 if(!p)throw Error('A camada não contém linhas.');
 const ll=proj4(L.crs,'EPSG:4326',p.slice(0,2)),zone=Math.max(1,Math.min(60,Math.floor((ll[0]+180)/6)+1));
 return '+proj=utm +zone='+zone+(ll[1]<0?' +south':'')+' +datum=WGS84 +units=m +no_defs';
}
function pathsFrom(L,scope,role,crs,auto){
 const out=[];L.features.forEach((f,fi)=>{
  if(isHachure(f,L)||scope!=='all'&&Number(scope)!==fi||auto&&!boundary(f))return;
  const label=type(f),name=fold(label);
  let constant=null;
  if(f.props?.COTA!=null&&Number.isFinite(Number(f.props.COTA)))constant=Number(f.props.COTA);
  else if(/^fundo/.test(name)&&f.props?.COTA_FUNDO!=null)constant=Number(f.props.COTA_FUNDO);
  else if(/^crista interna \/ pe do corte/.test(name)&&f.props?.COTA_MIN!=null)constant=Number(f.props.COTA_MIN);
  const walk=(geom,zg,key)=>{
   if(!Array.isArray(geom)||!geom.length)return;
   if(Array.isArray(geom[0])&&typeof geom[0][0]==='number'){
    const points=geom.map((p,i)=>{
     const xy=L.crs===crs?p.slice(0,2):proj4(L.crs,crs,p.slice(0,2)),z=Array.isArray(zg)&&zg[i]!=null?Number(zg[i]):p[2]!=null?Number(p[2]):constant;
     if(!xy.every(Number.isFinite))throw Error('Não foi possível transformar as coordenadas de '+L.name+'.');
     return [xy[0],xy[1],Number.isFinite(z)?z:null];
    });
    if(L.gtype==='polygon'&&points.length>2&&Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])>1e-7)points.push(points[0].slice());
    out.push({points,key:String(L.id)+':'+fi+':'+key,group:String(L.id)+':'+(label||'linhas')+':'+role,role,label:label||'Feição '+(fi+1),layerId:L.id,featureIndex:fi});
   }else geom.forEach((g,i)=>walk(g,Array.isArray(zg?.[i])?zg[i]:null,key+'.'+i));
  };walk(f.geom,f.zg,'0');
 });return out;
}
function calculate(params){
 const mode=params.mode==='pair'?'pair':'auto',A=layer(mode==='auto'?params.sourceLayerId:params.crestLayerId),B=mode==='pair'?layer(params.toeLayerId):A;
 if(!A||!B||!layers().includes(A)||!layers().includes(B))throw Error('Escolha as linhas de origem.');
 if(mode==='auto'&&!automatic(A))throw Error('Esta camada não identifica as linhas do talude. Use o modo Crista e pé.');
 if(mode==='pair')for(const [L,scope] of [[A,params.crestFeature??'all'],[B,params.toeFeature??'all']])if(scope!=='all'&&(!/^\d+$/.test(String(scope))||!L.features[Number(scope)]))throw Error('Escolha uma feição válida para crista e pé.');
 if(mode==='pair'&&A===B&&String(params.crestFeature??'all')===String(params.toeFeature??'all'))throw Error('Escolha feições diferentes para crista e pé.');
 const crs=metricCRS(A),outputCRS=S.workCRS,spacing=Number(params.spacing),shortRatio=Number(params.shortRatio),width=Number(params.width),color=String(params.color||'#111111');
 if(!(width>=.1&&width<=20)||!/^#[0-9a-f]{6}$/i.test(color))throw Error('Revise a cor e a espessura (0,1 a 20 px).');
 const paths=mode==='auto'?pathsFrom(A,'all','boundary',crs,true):pathsFrom(A,String(params.crestFeature??'all'),'crest',crs,false).concat(pathsFrom(B,String(params.toeFeature??'all'),'toe',crs,false));
 if(paths.length<2)throw Error('É necessário indicar ao menos duas linhas, uma de crista e outra de pé.');
 const project=S.projectId,generation=state.generation,sources=[...new Set([A,B])].map(L=>({id:L.id,stamp:stamp(L)})),convert=r=>(r||[]).map(p=>A.crs===crs?p.slice(0,2):proj4(A.crs,crs,p.slice(0,2)));
 const D=mode==='auto'?A.tinSurface:null,blocked=D?.rampa?.pista?.length?[convert(D.rampa.pista)]:[],allowed=D?.limites?.length?D.limites.map(convert):[];
 const result=G().generate(paths,{mode,spacing,shortRatio,alternating:params.alternating!==false,side:mode==='pair'?params.side:'auto',blocked,allowed});
 if(!result.strokes.length)throw Error(mode==='auto'?'Nenhuma face descendente foi encontrada. Confira as cotas ou indique crista e pé no modo manual.':'Não há encontro válido entre essas linhas. Confira a crista, o pé e o lado escolhido.');
 const features=result.strokes.map((s,i)=>{
  const xy=p=>crs===outputCRS?p.slice(0,2):proj4(crs,outputCRS,p.slice(0,2)),f={geom:[xy(s.a),xy(s.b)],multi:false,props:{FID:i,TIPO:s.ratio===1?'Cílio longo':'Cílio curto',COMP_M:Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1]),FACE_DE:result.paths[s.from].label,FACE_ATE:result.paths[s.to].label}};
  if(Number.isFinite(s.a[2])&&Number.isFinite(s.b[2]))f.zg=[s.a[2],s.b[2]];
  return f;
 });
 const settings={version:1,kind:'cartographic-slope-hachures',mode,sourceLayerId:A.id,crestLayerId:A.id,toeLayerId:B.id,crestFeature:String(params.crestFeature??'all'),toeFeature:String(params.toeFeature??'all'),spacing,shortRatio,alternating:params.alternating!==false,width,color,side:params.side||'auto'};
 return {project,generation,sources,features,crs:outputCRS,settings,stats:result.stats,source:A,name:'Cílios de talude — '+A.name.replace(/ — linhas$/,'')};
}
function snapshot(L){return {features:L.features,fields:L.fields,sym:clone(L.sym),color:L.color,weight:L.weight,crs:L.crs,groupId:L.groupId,fill:L.fill,visible:L.visible,labelField:L.labelField,labelFields:L.labelFields,lbl:clone(L.lbl),recipe:clone(L._slopeHachures)};}
function restore(L,b){L.features=b.features;L.fields=b.fields;L.sym=b.sym;L.color=b.color;L.weight=b.weight;L.crs=b.crs;L.groupId=b.groupId;L.fill=b.fill;L.visible=b.visible;L.labelField=b.labelField;L.labelFields=b.labelFields;L.lbl=b.lbl;if(b.recipe)L._slopeHachures=b.recipe;else delete L._slopeHachures;}
const outputFields=[{name:'CIL_LOTE',type:'C',length:180,decimal:0},{name:'CIL_ID',type:'N',length:10,decimal:0},{name:'CIL_TIPO',type:'C',length:24,decimal:0},{name:'CIL_COMP',type:'N',length:16,decimal:4},{name:'CIL_DE',type:'C',length:100,decimal:0},{name:'CIL_ATE',type:'C',length:100,decimal:0}];
function mergeFields(fields=[]){
 const out=fields.slice();for(const def of outputFields){const old=out.find(f=>(typeof f==='string'?f:f.name)===def.name);if(old){if((typeof old==='string'?'C':old.type)!==def.type)throw Error('O campo '+def.name+' da camada de destino tem um tipo incompatível.');}else out.push({...def});}return out;
}
function metadata(L,batches,key,defaultLayer=false){return {version:2,kind:'cartographic-slope-hachures',defaultLayer:!!(defaultLayer||L?._slopeHachures?.defaultLayer),batches,lastKey:key};}
function commit(job,destination='general'){
 if(job.project!==S.projectId||job.generation!==state.generation)throw Error('O projeto mudou. Abra Cílios de talude novamente.');
 if(job.sources.some(s=>!layer(s.id)||stamp(layer(s.id))!==s.stamp))throw Error('As linhas de origem mudaram. Gere os cílios novamente.');
 let L=destination==null||destination==='general'?generalLayer():typeof destination==='object'?null:layer(String(destination).replace(/^L:/,''));
 if(typeof destination!=='object'&&destination!==null&&destination!=='general'&&!L)throw Error('A camada de destino não está mais disponível.');
 if(L&&!destinations().includes(L))throw Error('Escolha uma camada de linhas sem vínculo com uma superfície de projeto.');
 const key=batchKey(job.settings),owners=S.layers.filter(X=>entries(X).some(e=>e.key===key)),affected=[...new Set([...owners,...(L?[L]:[])])];
 for(const X of affected)if(typeof canEditLayer==='function'&&!canEditLayer(X,false))throw Error('Descongele a camada “'+X.name+'” para atualizar os cílios.');
 const old=new Map(affected.map(X=>[X,snapshot(X)])),destCRS=L?.crs||job.crs,fields=mergeFields(L?.fields),features=job.features.map((f,i)=>({
  ...f,_slopeHachureBatch:key,geom:f.geom.map(p=>job.crs===destCRS?p.slice():proj4(job.crs,destCRS,p)),props:{CIL_LOTE:key,CIL_ID:i,CIL_TIPO:f.props.TIPO,CIL_COMP:f.props.COMP_M,CIL_DE:f.props.FACE_DE,CIL_ATE:f.props.FACE_ATE},
  _featureStyle:{version:1,gtype:'line',style:{color:job.settings.color,stroke:job.settings.color,weight:job.settings.width,fill:0,dash:''}}
 }));
 const defaultLayer=destination==null||destination==='general',beforeActive=S.activeId;
 let created=null;
 if(!L){
  const name=defaultLayer?'Cílios de talude':String(destination?.newName||'Cílios de talude').trim();if(!name)throw Error('Informe o nome da nova camada.');
  L=addLayer({name,gtype:'line',crs:destCRS,features:[],fields,color:job.settings.color,src:{provider:'GeoMine',kind:'slope-hachures'}});created=L;
  L.weight=job.settings.width;L.fill=0;L.sym={...L.sym,color:L.color,stroke:L.color,weight:L.weight,fill:0,dash:''};L.groupId=null;L.labelField='';L.labelFields=null;L.lbl={...defaultLabelCfg(),onMap:false};
  S.stack=['L:'+L.id,...(S.stack||[]).filter(k=>k!=='L:'+L.id)];
 }
 for(const X of owners)if(X!==L){
  X.features=X.features.filter(f=>!owned(X,f,key));const rest=entries(X).filter(e=>e.key!==key);
  if(rest.length||X._slopeHachures?.defaultLayer)X._slopeHachures=metadata(X,rest,rest.at(-1)?.key||null);else delete X._slopeHachures;
 }
 L.features=L.features.filter(f=>!owned(L,f,key)).concat(features);L.fields=fields;L.visible=true;
 L._slopeHachures=metadata(L,entries(L).filter(e=>e.key!==key).concat([{key,settings:clone(job.settings),sourceName:job.source.name}]),key,defaultLayer);
 const changes=[...old].map(([X,before])=>({L:X,before,after:X.features}));
 undoPush({t:'slopehachures',project:S.projectId,changes,created,after:created?.features,beforeActive});
 clearPreview();S.activeId=L.id;S.selRaster=null;S.selFeat=null;for(const X of new Set([...affected,L]))drawLayer(X);refreshUI();zApply();
 root.GeoMineSessionAutosave?.markDirty('cílios de talude');layoutSeVisivel();toast(features.length+' cílio(s) em “'+L.name+'”.');return L;
}
function undo(action){
 clearPreview();const all=[...action.changes.map(c=>({L:c.L,after:c.after})),...(action.created?[{L:action.created,after:action.after}]:[])];
 if(action.project!==S.projectId||all.some(c=>!S.layers.includes(c.L)||c.L.features!==c.after)){S.undo.pop();toast('Uma camada de cílios mudou; esta atualização não pode ser desfeita.');return;}
 for(const {L} of all)if(typeof canEditLayer==='function'&&!canEditLayer(L,false)){canEditLayer(L,true);return;}
 S.undo.pop();
 for(const c of action.changes){restore(c.L,c.before);drawLayer(c.L);}
 if(action.created){const L=action.created;if(L.llayer)map.removeLayer(L.llayer);S.layers=S.layers.filter(X=>X!==L);S.stack=(S.stack||[]).filter(k=>k!=='L:'+L.id);}
 if(layer(action.beforeActive))S.activeId=action.beforeActive;else if(!layer(S.activeId))S.activeId=S.layers[0]?.id??null;
 S.selFeat=null;refreshUI();zApply();layoutSeVisivel();root.GeoMineSessionAutosave?.markDirty('desfazer cílios');toast('Cílios anteriores restaurados.');
}
function clearPreview(){if(state.preview){try{map.removeLayer(state.preview);}catch(_){}state.preview=null;}}
function projectChanged(){state.generation++;clearPreview();state.target=null;state.project=null;$('slopeHachureModal')?.classList.remove('on');}
function preview(job){
 clearPreview();const group=L2.featureGroup();
 for(const f of job.features){const ll=f.geom.map(p=>{const w=toWGS(job.crs,p[0],p[1]);return [w[1],w[0]];});L2.polyline(ll,{pane:'alagis_desenho',interactive:false,color:job.settings.color,weight:job.settings.width,opacity:.8}).addTo(group);}
 state.preview=group.addTo(map);
}
function options(select,list,value,placeholder){select.replaceChildren(...(list.length?list.map(([v,label])=>new Option(label,String(v))):[new Option(placeholder||'Carregue linhas','')]));if([...select.options].some(o=>o.value===String(value)))select.value=String(value);}
function featureOptions(which,value='all'){
 const L=layer($('hachure'+which+'Layer').value),items=L?[['all','Todas as feições'],...L.features.map((f,i)=>[f,i]).filter(([f])=>!isHachure(f,L)).map(([f,i])=>[i,(i+1)+' · '+(type(f)||f.props?.NOME||'Feição '+(i+1))])]:[];
 const select=$('hachure'+which+'Feature');options(select,items,value,'Escolha a camada');
 if(value!=='all'&&!items.some(([v])=>String(v)===String(value))){select.add(new Option('Feição removida — escolha outra',''),0);select.value='';}
}
function values(){return {mode:$('hachureMode').value,sourceLayerId:$('hachureSource').value,crestLayerId:$('hachureCrestLayer').value,toeLayerId:$('hachureToeLayer').value,crestFeature:$('hachureCrestFeature').value,toeFeature:$('hachureToeFeature').value,spacing:$('hachureSpacing').value,shortRatio:$('hachureShort').value,width:$('hachureWidth').value,color:$('hachureColor').value,alternating:$('hachurePattern').value==='alternate',side:$('hachureSide').value};}
function ensure(){
 if($('slopeHachureModal'))return;
 const bg=document.createElement('div');bg.id='slopeHachureModal';bg.className='modal-bg';
 bg.innerHTML=`<div class="modal gmp" role="dialog" aria-labelledby="hachureTitle" style="width:min(430px,96vw)">
 <div class="modal-h"><b id="hachureTitle">Cílios de talude</b><button type="button" class="gm-prop-info" data-prop-help="" aria-label="Ajuda: Cílios de talude" aria-expanded="false"><span aria-hidden="true">i</span><span hidden>Os traços partem da crista e apontam para o pé. Longos e curtos alternados representam a face em planta. O modo automático usa as cotas das linhas e não atravessa bermas nem a pista da rampa da caixa. Por padrão todos os taludes ficam na camada Cílios de talude. Você pode escolher outra camada de linhas. Atualizar substitui só os cílios do talude indicado e preserva os demais; trocar o destino move apenas esse conjunto.</span></button><div style="flex:1"></div><button type="button" class="tbtn gmp-x" data-close aria-label="Fechar">×</button></div>
 <div class="modal-b"><div class="gmp-c">
 <div class="gmp-row"><label for="hachureDest">Destino</label><select id="hachureDest" aria-label="Camada de destino dos cílios"></select></div>
 <div id="hachureNewNameRow" hidden><label class="field" for="hachureNewName">Nome da nova camada</label><input id="hachureNewName" type="text" value="Cílios de talude"></div>
 <div id="hachureBatchRow" hidden><label class="field" for="hachureBatch">Talude a editar</label><select id="hachureBatch"></select></div>
 <label class="field" for="hachureMode">Origem</label><select id="hachureMode"><option value="auto">Linhas identificadas · automático</option><option value="pair">Indicar crista e pé</option></select>
 <div id="hachureAuto"><label class="field" for="hachureSource">Camada do talude / caixa</label><select id="hachureSource"></select></div>
 <div id="hachurePair" hidden>
 <label class="field" for="hachureCrestLayer">Crista · início dos traços</label><select id="hachureCrestLayer"></select><select id="hachureCrestFeature" aria-label="Feição da crista" style="margin-top:4px"></select>
 <label class="field" for="hachureToeLayer">Pé · fim da face</label><select id="hachureToeLayer"></select><select id="hachureToeFeature" aria-label="Feição do pé" style="margin-top:4px"></select>
 <div class="gmp-row" style="margin-top:8px"><button type="button" class="mini" id="hachureSwap">Trocar crista ↔ pé</button><select id="hachureSide" aria-label="Lado do pé"><option value="auto">Lado automático</option><option value="left">Esquerda da crista</option><option value="right">Direita da crista</option></select></div></div>
 <div class="row2 gmp-2" style="margin-top:8px"><div><label class="field" for="hachureSpacing">Espaçamento (m)</label><input id="hachureSpacing" type="number" min=".01" max="10000" step=".25" value="2"></div><div><label class="field" for="hachurePattern">Padrão</label><select id="hachurePattern"><option value="alternate">Longos e curtos</option><option value="long">Somente longos</option></select></div></div>
 <div id="hachureShortRow" class="gmp-row gm-style-row" style="margin-top:8px"><label for="hachureShort">Traço curto</label><input id="hachureShort" class="gm-style-range" type="range" min=".1" max=".9" step=".05" value=".5"><span class="gmp-val" id="hachureShortV">50%</span></div>
 <label class="field" for="hachureWidth">Espessura</label><input id="hachureWidth" data-weight type="number" min=".1" max="20" step=".1" value=".8">
 <div class="gmp-row" style="margin-top:8px"><label for="hachureColor">Cor</label><input id="hachureColor" type="color" value="#111111"><span style="flex:1"></span><svg viewBox="0 0 130 42" width="130" height="42" aria-label="Exemplo de cílios longos e curtos"><g fill="none" stroke="currentColor" stroke-width="1.2"><path d="M4 5Q65 1 126 8M4 36Q65 31 126 39M14 5v30m15-31v15m15-15v30m15-30v15m15-15v30m15-29v15m15-14v29m15-27v15"/></g></svg></div>
 <div class="hout" id="hachureStatus" role="status" style="margin-top:8px">Escolha as linhas e confira a prévia.</div>
 </div></div><div class="modal-f" style="display:flex;gap:8px;padding:10px 12px"><button type="button" class="tbtn" id="hachurePreview">Prévia</button><button type="button" class="tbtn" id="hachureApply" style="background:var(--amber);color:#1a1206">Gerar cílios</button></div></div>`;
 document.body.append(bg);root.GeoMineStyleSliders?.enhance(bg);
 const sync=()=>{const pair=$('hachureMode').value==='pair';$('hachurePair').hidden=!pair;$('hachureAuto').hidden=pair;$('hachureShortRow').style.display=$('hachurePattern').value==='alternate'?'flex':'none';root.GeoMineStyleSliders?.syncRange($('hachureShort'),$('hachureShortV'));};
 for(const id of ['hachureMode','hachurePattern','hachureShort'])$(id).addEventListener('input',sync);
 for(const which of ['Crest','Toe'])$('hachure'+which+'Layer').onchange=()=>featureOptions(which);
 $('hachureSwap').onclick=()=>{const a=$('hachureCrestLayer').value,af=$('hachureCrestFeature').value,b=$('hachureToeLayer').value,bf=$('hachureToeFeature').value;$('hachureCrestLayer').value=b;$('hachureToeLayer').value=a;featureOptions('Crest',bf);featureOptions('Toe',af);clearPreview();};
 bg.querySelector('[data-close]').onclick=()=>{clearPreview();bg.classList.remove('on');};
 bg.addEventListener('input',clearPreview);bg.addEventListener('change',()=>{clearPreview();sync();});
 async function run(save){
  const token=state.generation,project=state.project;
  $('hachurePreview').disabled=$('hachureApply').disabled=true;$('hachureStatus').textContent='Gerando cílios…';
  try{
   await new Promise(resolve=>setTimeout(resolve,20));
   if(token!==state.generation||project!==S.projectId)throw Error('O projeto mudou. Abra a ferramenta novamente.');
   const job=calculate(values());
   if(save){const L=commit(job,destinationValue());state.target=L.id;destinationOptions($('hachureDest').value==='general'?'general':'L:'+L.id);batchOptions(batchKey(job.settings));}
   else preview(job);
   $('hachureStatus').textContent=(save?job.stats.generated+' cílio(s) em “'+layer(state.target).name+'”.':'Prévia: '+job.stats.generated+' cílio(s).')+(job.stats.crossing?' '+job.stats.crossing+' traço(s) cruzado(s) foram omitidos.':'');
  }catch(e){if(token===state.generation)$('hachureStatus').textContent=e.message||String(e);}
  finally{if(token===state.generation)$('hachurePreview').disabled=$('hachureApply').disabled=false;}
 }
 $('hachurePreview').onclick=()=>run(false);$('hachureApply').onclick=()=>run(true);bg._sync=sync;
 $('hachureDest').onchange=()=>{clearPreview();$('hachureNewNameRow').hidden=$('hachureDest').value!=='new';batchOptions();};
 $('hachureBatch').onchange=()=>{const L=destinationLayer(),entry=entries(L).find(e=>e.key===$('hachureBatch').value);if(entry)fillForm(entry.settings,L,entry.key);else{const id=$('hachureMode').value==='auto'?'hachureSource':'hachureCrestFeature';$(id).add(new Option('Escolha a origem do novo talude',''),0);$(id).value='';$('hachureStatus').textContent='Escolha a origem do novo talude.';}clearPreview();syncAction();};
 for(const id of ['hachureMode','hachureSource','hachureCrestLayer','hachureCrestFeature','hachureToeLayer','hachureToeFeature'])$(id).addEventListener('change',syncAction);
}
function destinationLayer(){const v=$('hachureDest').value;return v==='general'?generalLayer():v.startsWith('L:')?layer(v.slice(2)):null;}
function destinationValue(){const v=$('hachureDest').value;return v==='new'?{newName:$('hachureNewName').value}:v;}
function destinationOptions(value='general'){
 options($('hachureDest'),[['general','Cílios de talude · camada única'],...destinations().map(L=>['L:'+L.id,L.name+(L.locked?' 🔒':'')]),['new','Criar outra camada…']],value);
 $('hachureNewNameRow').hidden=$('hachureDest').value!=='new';
}
function batchOptions(selected=null){
 const L=destinationLayer(),list=entries(L);options($('hachureBatch'),[['new','Novo talude · adicionar'],...list.map(e=>[e.key,e.sourceName||layer(e.settings.sourceLayerId)?.name||'Talude'])],selected||'new');
 $('hachureBatchRow').hidden=!list.length;syncAction();
}
function syncAction(){
 const p=values(),key=batchKey(p),existing=ownerOf(key);$('hachureApply').textContent=existing?'Atualizar este talude':'Adicionar cílios';
 if($('hachureBatch')&&entries(destinationLayer()).some(e=>e.key===key))$('hachureBatch').value=key;else if($('hachureBatch'))$('hachureBatch').value='new';
}
function fillForm(params={},target=null,key=null,selected=null){
 const ls=layers(),autos=ls.filter(automatic),mode=params.mode||(automatic(selected)||autos.length?'auto':'pair');$('hachureMode').value=mode;
 options($('hachureSource'),autos.map(L=>[L.id,L.name]),params.sourceLayerId??selected?.id,'Selecione uma caixa com cristas, pés e cotas');
 for(const which of ['Crest','Toe'])options($('hachure'+which+'Layer'),ls.map(L=>[L.id,L.name]),params[which==='Crest'?'crestLayerId':'toeLayerId']??selected?.id);
 if(target)for(const [id,value] of [['hachureSource',params.sourceLayerId],['hachureCrestLayer',params.crestLayerId],['hachureToeLayer',params.toeLayerId]])if(value!=null&&!layer(value)){$(id).add(new Option('Origem removida — escolha outra camada',''),0);$(id).value='';}
 featureOptions('Crest',params.crestFeature??'all');featureOptions('Toe',params.toeFeature??'all');
 if(!target&&selected&&mode==='pair'){
  const ci=selected.features.findIndex(f=>/crista/.test(fold(type(f)))),ti=selected.features.findIndex(f=>/\bpe\b|fundo/.test(fold(type(f))));
  if(ci>=0)$('hachureCrestFeature').value=String(ci);if(ti>=0&&ti!==ci)$('hachureToeFeature').value=String(ti);
  else if(selected.features.length>1&&ci>=0)$('hachureToeFeature').value=String(ci===0?1:0);
 }
 const first=target?.features.find(f=>owned(target,f,key)),style=first?featureStyle(target,first):null;
 $('hachureSpacing').value=Number(params.spacing??2).toFixed(2);$('hachureShort').value=params.shortRatio??.5;$('hachurePattern').value=params.alternating===false?'long':'alternate';
 $('hachureWidth').value=style?.weight??params.width??.8;$('hachureWidth')._gmSlider?.();$('hachureColor').value=style?.stroke||params.color||'#111111';$('hachureSide').value=params.side||'auto';
 $('slopeHachureModal')._sync();
}
function open(){
 ensure();clearPreview();state.generation++;state.project=S.projectId;
 const current=activeLayer(),currentEntries=entries(current),selected=currentEntries.length?null:current;
 let target=currentEntries.length?current:null,entry=target?(currentEntries.find(e=>e.key===target._slopeHachures?.lastKey)||currentEntries[0]):null;
 if(!target&&automatic(selected)){const key=batchKey({mode:'auto',sourceLayerId:selected.id});target=ownerOf(key);entry=entries(target).find(e=>e.key===key);}
 state.target=target?.id??null;destinationOptions(target?'L:'+target.id:'general');fillForm(entry?.settings||{},target,entry?.key,selected);batchOptions(entry?.key);
 $('hachureStatus').textContent='Todos os cílios vão para a camada de destino. Atualizar preserva os outros taludes.';
 $('hachurePreview').disabled=$('hachureApply').disabled=false;$('slopeHachureModal').classList.add('on');
}
root.GeoMineSlopeHachures={open,calculate,commit,undo,projectChanged,clearPreview,automatic,entries,batchKey,destinations,state};
function boot(){
 const cat=CATS.find(c=>c.id==='topografia');if(!cat)return;
 let group=cat.grupos.find(g=>g.label==='Representação');if(!group){group={label:'Representação',it:[]};cat.grupos.push(group);}
 if(!group.it.some(c=>c.nome==='Cílios de talude'))group.it.push({nome:'Cílios de talude',ic:'slope_hachures',aliases:['hachura de talude','dentes de talude','cilios','crista e pé'],desc:'Traços longos e curtos entre crista e pé, no sentido da descida',act:open});
 RIB_SVG.slope_hachures='<svg viewBox="0 0 32 32" fill="none" stroke="#244c60" stroke-width="1.5" stroke-linecap="round"><path d="M3 7Q16 2 29 7M3 26Q16 21 29 26"/><path d="M6 6v19m5-20v10m5-11v19m5-18v10m5-9v19" stroke="#b5752f"/></svg>';ribbonBuild();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
