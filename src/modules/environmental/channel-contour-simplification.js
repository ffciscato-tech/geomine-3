/* Simplificação somente do contorno derivado; nunca modifica a máscara ou o eixo. */
(function(){
'use strict';
function engine(clipping){
  const MAX_VERTICES=250000,MAX_WORK=10000000,MAX_ATTEMPTS=14;
  const bad=message=>Object.assign(Error(message),{code:'CHANNEL_INVALID_GEOMETRY'});
  const budget=()=>Object.assign(Error('Limite seguro de validação do contorno atingido.'),{code:'CHANNEL_CONTOUR_BUDGET'});
  const equal=(a,b)=>a[0]===b[0]&&a[1]===b[1];
  const lexical=(a,b)=>a[0]-b[0]||a[1]-b[1];
  const clone=polygons=>polygons.map(p=>p.map(r=>r.map(p=>p.slice(0,2))));
  function area(ring){const o=ring[0];let sum=0;for(let i=1;i<ring.length-1;i++)sum+=(ring[i][0]-o[0])*(ring[i+1][1]-o[1])-(ring[i+1][0]-o[0])*(ring[i][1]-o[1]);return sum/2;}
  const polygonArea=p=>p.reduce((sum,r,i)=>sum+(i? -1:1)*Math.abs(area(r)),0);
  function simplify(polygons,{spacing,resolution}={}){
    if(!Number.isFinite(spacing)||spacing<=0||!Number.isFinite(resolution)||resolution<=0)throw bad('Espaçamento e resolução devem ser números positivos.');
    if(!Array.isArray(polygons)||!polygons.length)throw bad('Não há polígonos para simplificar.');
    let verticesBefore=0,xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;
    for(const p of polygons){if(!Array.isArray(p)||!p.length)throw bad('Componente poligonal vazio.');for(const ring of p){
      if(!Array.isArray(ring)||ring.length<4)throw bad('Anel incompleto no contorno.');
      for(const v of ring){if(!Array.isArray(v)||!Number.isFinite(v[0])||!Number.isFinite(v[1]))throw bad('Coordenada XY inválida no contorno.');xmin=Math.min(xmin,v[0]);ymin=Math.min(ymin,v[1]);xmax=Math.max(xmax,v[0]);ymax=Math.max(ymax,v[1]);}
      if(!equal(ring[0],ring.at(-1)))throw bad('O contorno deve conter anéis fechados.');verticesBefore+=ring.length-1;
      for(let i=1;i<ring.length;i++)if(equal(ring[i-1],ring[i]))throw bad('Vértices consecutivos repetidos no contorno.');
    }}
    if(verticesBefore>MAX_VERTICES)throw Object.assign(Error('Contorno excede 250 mil vértices.'),{code:'CHANNEL_LIMIT'});
    const span=Math.max(xmax-xmin,ymax-ymin);if(!Number.isFinite(span*span)||!(span>0))throw bad('Dimensões inválidas do contorno.');
    const eps=Math.max(1e-9,resolution*1e-9,span*1e-12),requestedTolerance=spacing/2,original=clone(polygons),areasBefore=original.map(polygonArea),areaBefore=areasBefore.reduce((a,b)=>a+b,0);
    if(areasBefore.some(a=>!Number.isFinite(a)||a<=eps*eps))throw bad('Componente sem área válida.');
    let work=0,attempts=0;const started=Date.now(),tick=(n=1)=>{work+=n;if(work>MAX_WORK||(work%4096<n&&Date.now()-started>8000))throw budget();};
    const metadata=(result,tolerance,fallback,reason,symmetricDifferenceArea=0)=>{const verticesAfter=result.reduce((sum,p)=>sum+p.reduce((n,r)=>n+r.length-1,0),0),reduced=verticesAfter<verticesBefore;return {polygons:result,spacing,resolution,requestedTolerance,effectiveTolerance:reduced?tolerance:0,verticesBefore,verticesAfter,reduced,applied:reduced,fallback,reason,attempts,areaBefore,areaAfter:result.reduce((sum,p)=>sum+polygonArea(p),0),areaChangeLimit:.1,symmetricDifferenceArea,symmetricDifferenceRatio:symmetricDifferenceArea/areaBefore,symmetricDifferenceLimit:.1,method:'Douglas–Peucker fechado com validação topológica e diferença simétrica máxima de 10% por componente'};};
    const pointDistance=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],f=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return (p[0]-a[0]-f*dx)**2+(p[1]-a[1]-f*dy)**2;};
    function canonical(ring,hole){let points=ring.slice(0,-1).map(p=>p.slice());if((area(ring)>0)===hole)points.reverse();let first=0;for(let i=1;i<points.length;i++)if(lexical(points[i],points[first])<0)first=i;return points.slice(first).concat(points.slice(0,first));}
    const canonicalPolygons=original.map(p=>p.map((r,i)=>canonical(r,i>0)));
    function reduceRing(points,tolerance){
      const n=points.length;if(n<=3)return [...points.map(p=>p.slice()),points[0].slice()];
      let opposite=1,best=-1;for(let i=1;i<n;i++){tick();const d=(points[i][0]-points[0][0])**2+(points[i][1]-points[0][1])**2;if(d>best||(d===best&&lexical(points[i],points[opposite])<0)){best=d;opposite=i;}}
      let third=-1;best=-1;for(let i=1;i<n;i++){tick();if(i===opposite)continue;const d=pointDistance(points[i],points[0],points[opposite]);if(d>best||(d===best&&lexical(points[i],points[third])<0)){best=d;third=i;}}
      const anchors=[0,opposite,third,n].sort((a,b)=>a-b),extended=points.concat([points[0]]),keep=new Uint8Array(n+1),stack=[];for(let i=1;i<anchors.length;i++){keep[anchors[i-1]]=1;keep[anchors[i]]=1;stack.push([anchors[i-1],anchors[i]]);}
      const limit=tolerance*tolerance;
      while(stack.length){const [a,b]=stack.pop();let far=-1,dmax=limit;for(let i=a+1;i<b;i++){tick();const d=pointDistance(extended[i],extended[a],extended[b]);if(d>dmax||(far>=0&&d===dmax&&lexical(extended[i],extended[far])<0)){dmax=d;far=i;}}if(far>=0){keep[far]=1;stack.push([a,far],[far,b]);}}
      const result=[];for(let i=0;i<n;i++)if(keep[i])result.push(points[i].slice());result.push(result[0].slice());return result;
    }
    const intersectsBox=(a,b)=>a[0]<=b[2]+eps&&a[2]>=b[0]-eps&&a[1]<=b[3]+eps&&a[3]>=b[1]-eps;
    const containsBox=(box,p)=>p[0]>=box[0]-eps&&p[0]<=box[2]+eps&&p[1]>=box[1]-eps&&p[1]<=box[3]+eps;
    function tree(items){
      tick(items.length);const box=[Infinity,Infinity,-Infinity,-Infinity];for(const e of items){box[0]=Math.min(box[0],e.box[0]);box[1]=Math.min(box[1],e.box[1]);box[2]=Math.max(box[2],e.box[2]);box[3]=Math.max(box[3],e.box[3]);}
      if(items.length<=8)return {box,items};const axis=box[2]-box[0]>=box[3]-box[1]?0:1;items.sort((a,b)=>(a.box[axis]+a.box[axis+2])-(b.box[axis]+b.box[axis+2]));const middle=items.length>>1;return {box,left:tree(items.slice(0,middle)),right:tree(items.slice(middle))};
    }
    const orient=(a,b,p)=>{const v=(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]),tol=eps*Math.hypot(b[0]-a[0],b[1]-a[1]);return Math.abs(v)<=tol?0:Math.sign(v);};
    const on=(p,a,b)=>orient(a,b,p)===0&&p[0]>=Math.min(a[0],b[0])-eps&&p[0]<=Math.max(a[0],b[0])+eps&&p[1]>=Math.min(a[1],b[1])-eps&&p[1]<=Math.max(a[1],b[1])+eps;
    function contact(a,b){
      const ab1=orient(a.a,a.b,b.a),ab2=orient(a.a,a.b,b.b),ba1=orient(b.a,b.b,a.a),ba2=orient(b.a,b.b,a.b);
      if(ab1*ab2<0&&ba1*ba2<0)return {cross:true};
      const points=[];for(const p of [a.a,a.b])if(on(p,b.a,b.b))points.push(p);for(const p of [b.a,b.b])if(on(p,a.a,a.b))points.push(p);
      if(!points.length)return null;for(const p of points)if(Math.hypot(p[0]-points[0][0],p[1]-points[0][1])>eps)return {cross:true};return {point:points.sort(lexical)[0]};
    }
    function validate(candidate,allowed,record){
      const rings=[],edges=[],byPolygon=[];
      for(let pi=0;pi<candidate.length;pi++){const local=[];for(let ri=0;ri<candidate[pi].length;ri++){
        const ring=candidate[pi][ri],signed=area(ring);if(!Number.isFinite(signed)||Math.abs(signed)<=eps*eps)return false;
        const rec={id:rings.length,pi,ri,ring,edges:[],box:[Infinity,Infinity,-Infinity,-Infinity]};rings.push(rec);local.push(rec);
        for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i];if(Math.hypot(a[0]-b[0],a[1]-b[1])<=eps)return false;const box=[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])],edge={id:edges.length,owner:rec,index:i-1,a,b,box};edges.push(edge);rec.edges.push(edge);rec.box[0]=Math.min(rec.box[0],box[0]);rec.box[1]=Math.min(rec.box[1],box[1]);rec.box[2]=Math.max(rec.box[2],box[2]);rec.box[3]=Math.max(rec.box[3],box[3]);}
        rec.tree=tree(rec.edges.slice());
      }byPolygon.push(local);}
      const edgeTree=tree(edges.slice()),ringTree=tree(rings.slice());
      for(const edge of edges){const pending=[edgeTree];while(pending.length){tick();const node=pending.pop();if(!intersectsBox(edge.box,node.box))continue;if(node.items){for(const other of node.items){if(other.id<=edge.id||!intersectsBox(edge.box,other.box))continue;
        if(edge.owner===other.owner&&(Math.abs(edge.index-other.index)===1||Math.abs(edge.index-other.index)===edge.owner.edges.length-1)){
          // Adjacent edges may share one endpoint, but may not fold back.
          const hit=contact(edge,other);if(hit?.cross)return false;continue;
        }
        const hit=contact(edge,other);if(!hit)continue;if(hit.cross||edge.owner===other.owner)return false;
        const key=Math.min(edge.owner.id,other.owner.id)+':'+Math.max(edge.owner.id,other.owner.id)+':'+hit.point[0]+','+hit.point[1];if(record)allowed.add(key);else if(!allowed.has(key))return false;
      }}else pending.push(node.left,node.right);}}
      function inside(point,rec){
        if(!containsBox(rec.box,point))return -1;let parity=false;const pending=[rec.tree];
        while(pending.length){tick();const node=pending.pop();if(point[1]<node.box[1]-eps||point[1]>node.box[3]+eps||node.box[2]<point[0]-eps)continue;
          if(node.items){for(const e of node.items){if(on(point,e.a,e.b))return 0;if((e.a[1]>point[1])!==(e.b[1]>point[1])&&point[0]<(e.b[0]-e.a[0])*(point[1]-e.a[1])/(e.b[1]-e.a[1])+e.a[0])parity=!parity;}}
          else pending.push(node.left,node.right);
        }return parity?1:-1;
      }
      function filled(point,pi){const group=byPolygon[pi],outer=inside(point,group[0]);if(outer!==1)return outer;for(let i=1;i<group.length;i++){const state=inside(point,group[i]);if(state===1)return -1;if(state===0)return 0;}return 1;}
      for(const rec of rings)for(const e of rec.edges)for(const point of [e.a,[(e.a[0]+e.b[0])/2,(e.a[1]+e.b[1])/2]]){
        if(rec.ri&&inside(point,byPolygon[rec.pi][0])<0)return false;
        const pending=[ringTree];while(pending.length){tick();const node=pending.pop();if(!containsBox(node.box,point))continue;if(node.items){for(const other of node.items){if(other===rec||!containsBox(other.box,point))continue;
          if(rec.ri&&other.pi===rec.pi&&other.ri&&inside(point,other)>0)return false;
          if(!rec.ri&&other.pi!==rec.pi&&!other.ri&&filled(point,other.pi)>0)return false;
        }}else pending.push(node.left,node.right);}
      }
      return true;
    }
    const contacts=new Set();
    try{if(!validate(original,contacts,true))throw bad('O contorno de entrada contém cruzamentos, sobreposição ou furos inválidos.');}
    catch(error){if(error.code==='CHANNEL_CONTOUR_BUDGET')return metadata(original,0,true,'Contorno original preservado: limite seguro de validação.');throw error;}
    if(typeof clipping?.xor!=='function')return metadata(original,0,true,'Contorno original preservado: verificador de diferença simétrica indisponível.');
    const origins=original.map(p=>p[0][0]),localOriginal=original.map((p,i)=>p.map(r=>r.map(q=>[q[0]-origins[i][0],q[1]-origins[i][1]])));
    let tolerance=requestedTolerance,lastReason='Contorno original preservado para proteger a topologia e a área.';
    try{
      for(attempts=1;attempts<=MAX_ATTEMPTS&&tolerance>=Math.max(1e-8,resolution*1e-5);attempts++,tolerance/=2){
        const candidate=canonicalPolygons.map(p=>p.map(r=>reduceRing(r,tolerance))),areaOK=candidate.every((p,i)=>{const a=polygonArea(p);return a>eps*eps&&Math.abs(a-areasBefore[i])<=areasBefore[i]*.1+eps*eps;});
        if(!areaOK){lastReason='Tolerância reduzida para limitar a variação de área a 10% por componente.';continue;}
        if(!validate(candidate,contacts,false)){lastReason='Tolerância reduzida para preservar componentes, furos e ausência de cruzamentos.';continue;}
        const count=candidate.reduce((sum,p)=>sum+p.reduce((n,r)=>n+r.length-1,0),0);
        if(count===verticesBefore)return metadata(original,0,false,'O contorno já atende à tolerância sem remover vértices.');
        let symmetricDifferenceArea=0,differenceOK=true;
        for(let i=0;i<candidate.length;i++){
          if(Date.now()-started>8000)throw budget();
          const local=candidate[i].map(r=>r.map(q=>[q[0]-origins[i][0],q[1]-origins[i][1]]));
          let changed;try{changed=clipping.xor(localOriginal[i],local).reduce((sum,p)=>sum+polygonArea(p),0);}catch(error){differenceOK=false;break;}
          if(!Number.isFinite(changed)||changed>areasBefore[i]*.1+eps*eps){differenceOK=false;break;}symmetricDifferenceArea+=changed;
        }
        if(!differenceOK){lastReason='Tolerância reduzida para limitar a diferença simétrica a 10% da área de cada componente.';continue;}
        return metadata(candidate,tolerance,false,tolerance<requestedTolerance?lastReason:'Contorno simplificado dentro da tolerância e da diferença de área permitidas.',symmetricDifferenceArea);
      }
    }catch(error){if(error.code!=='CHANNEL_CONTOUR_BUDGET')throw error;lastReason='Contorno original preservado: limite seguro de simplificação ou validação.';}
    attempts=Math.min(attempts,MAX_ATTEMPTS);return metadata(original,0,true,lastReason);
  }
  return {simplify};
}
window.GeoMineChannelContour={engine};
})();
