/* GeoMine — interseção geométrica de malhas 3D com seções verticais.
   Sem rasterizar: preserva paredes verticais, sobreposições em Z e cavidades.
   Entradas em um mesmo CRS projetado, em metros. Não interpola fora da malha. */
(function(root){
  'use strict';

  const LIMITS=Object.freeze({vertices:2000000,faces:1000000,pathVertices:2048,triangleTests:25000000,segments:2000000});
  const finite=Number.isFinite;
  const edgeKey=(a,b)=>a<b?a+','+b:b+','+a;
  function fail(message,code){const e=new Error(message);e.code=code||'INVALID_MESH';throw e;}
  function distance2(a,b){const x=a[0]-b[0],y=a[1]-b[1];return x*x+y*y;}
  function checkedTolerance(value,bounds){
    if(value!=null&&(!finite(value)||value<=0))fail('A tolerância da seção deve ser positiva e finita.','INVALID_TOLERANCE');
    const span=Math.max(bounds.max[0]-bounds.min[0],bounds.max[1]-bounds.min[1],bounds.max[2]-bounds.min[2]);
    const abs=Math.max(...bounds.min.map(Math.abs),...bounds.max.map(Math.abs));
    return value==null?Math.max(1e-8,span*1e-10,abs*Number.EPSILON*32):value;
  }

  function prepare(mesh,options){
    if(!mesh||!Array.isArray(mesh.vertices)||!Array.isArray(mesh.faces))fail('Malha sem vértices ou triângulos.');
    const vertices=mesh.vertices,faces=mesh.faces;
    if(vertices.length>LIMITS.vertices||faces.length>LIMITS.faces)fail('Malha excede o limite de segurança da seção (2 milhões de vértices / 1 milhão de triângulos). Separe o modelo por domínio; a geometria não foi simplificada.','MESH_RESOURCE_LIMIT');
    const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
    const remap=new Int32Array(vertices.length);remap.fill(-1);
    const canonical=[],exact=new Map();let invalidVertices=0;
    for(let i=0;i<vertices.length;i++){
      const v=vertices[i];
      if(!v||v.length<3||!finite(v[0])||!finite(v[1])||!finite(v[2])){invalidVertices++;continue;}
      for(let k=0;k<3;k++){bounds.min[k]=Math.min(bounds.min[k],v[k]);bounds.max[k]=Math.max(bounds.max[k],v[k]);}
      // Apenas coordenadas idênticas são soldadas para validar a topologia.
      // Uma lacuna pequena não pode virar um sólido fechado por tolerância.
      const key=v[0]+','+v[1]+','+v[2];let id=exact.get(key);
      if(id===undefined){id=canonical.length;canonical.push(v);exact.set(key,id);}remap[i]=id;
    }
    exact.clear();
    if(!canonical.length)fail('Malha sem vértices 3D finitos.');
    const tolerance=checkedTolerance(options&&options.tolerance,bounds);
    const validFaces=[],edges=new Map(),faceKeys=new Set(),incident=new Array(canonical.length);
    let invalidFaces=0,degenerateFaces=0,duplicateFaces=0;
    for(let fi=0;fi<faces.length;fi++){
      const f=faces[fi];
      if(!f||f.length!==3||!f.every(i=>Number.isInteger(i)&&i>=0&&i<vertices.length&&remap[i]>=0)){invalidFaces++;continue;}
      const ids=f.map(i=>remap[i]),a=canonical[ids[0]],b=canonical[ids[1]],c=canonical[ids[2]];
      const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
      const cx=uy*vz-uz*vy,cy=uz*vx-ux*vz,cz=ux*vy-uy*vx;
      const maxEdge=Math.max(Math.hypot(ux,uy,uz),Math.hypot(vx,vy,vz),Math.hypot(c[0]-b[0],c[1]-b[1],c[2]-b[2]));
      if(new Set(ids).size<3||Math.hypot(cx,cy,cz)<=tolerance*maxEdge){degenerateFaces++;continue;}
      const fk=ids.slice().sort((x,y)=>x-y).join(',');
      if(faceKeys.has(fk)){duplicateFaces++;continue;}faceKeys.add(fk);
      const faceIndex=validFaces.length;validFaces.push(ids);
      for(let j=0;j<3;j++){
        const u=ids[j],v=ids[(j+1)%3],key=edgeKey(u,v);let e=edges.get(key);
        if(!e){e={count:0,orientation:0};edges.set(key,e);}
        e.count++;e.orientation+=u<v?1:-1;
        if(!incident[u])incident[u]=[];incident[u].push(faceIndex);
      }
    }
    faceKeys.clear();
    if(!validFaces.length)fail('Malha sem triângulos 3D válidos.');
    let boundaryEdges=0,nonManifoldEdges=0,inconsistentWindingEdges=0;
    for(const e of edges.values()){
      if(e.count===1)boundaryEdges++;
      else if(e.count>2)nonManifoldEdges++;
      else if(e.orientation!==0)inconsistentWindingEdges++;
    }
    // Arestas com duas faces não bastam: duas cascas podem tocar somente
    // num vértice. O link local de cada vértice deve ser um único leque.
    let nonManifoldVertices=0;
    for(let vertex=0;vertex<incident.length;vertex++){
      const around=incident[vertex];if(!around)continue;
      const links=new Map();
      for(const fi of around){
        const other=validFaces[fi].filter(i=>i!==vertex);
        for(let k=0;k<2;k++){let ns=links.get(other[k]);if(!ns){ns=[];links.set(other[k],ns);}ns.push(other[1-k]);}
      }
      const seen=new Set(),stack=[links.keys().next().value];let ends=0,bad=false;
      for(const ns of links.values()){if(ns.length===1)ends++;else if(ns.length!==2)bad=true;}
      while(stack.length){const n=stack.pop();if(seen.has(n))continue;seen.add(n);for(const m of links.get(n)||[])if(!seen.has(m))stack.push(m);}
      if(bad||seen.size!==links.size||(ends!==0&&ends!==2))nonManifoldVertices++;
    }
    const closedSolid=boundaryEdges===0&&nonManifoldEdges===0&&nonManifoldVertices===0&&invalidVertices===0&&invalidFaces===0&&degenerateFaces===0&&duplicateFaces===0;
    const warnings=[];
    if(invalidVertices||invalidFaces)warnings.push('A malha contém '+invalidVertices+' vértice(s) e '+invalidFaces+' face(s) inválidos; apenas a parte válida pode gerar linhas, sem preenchimento.');
    if(degenerateFaces||duplicateFaces)warnings.push('A malha contém '+degenerateFaces+' triângulo(s) degenerado(s) e '+duplicateFaces+' duplicado(s); o preenchimento foi desabilitado.');
    if(nonManifoldEdges||nonManifoldVertices)warnings.push('Topologia não manifold: '+nonManifoldEdges+' aresta(s) e '+nonManifoldVertices+' vértice(s). A seção será exibida somente como linhas.');
    if(boundaryEdges)warnings.push('Superfície aberta ('+boundaryEdges+' arestas de borda): a seção gera linhas, não volumes preenchidos.');
    if(inconsistentWindingEdges)warnings.push('Há '+inconsistentWindingEdges+' aresta(s) com orientação de faces inconsistente; os contornos usam a regra par/ímpar.');
    const analysis={vertexCount:vertices.length,uniqueVertexCount:canonical.length,faceCount:faces.length,validFaceCount:validFaces.length,invalidVertices,invalidFaces,degenerateFaces,duplicateFaces,boundaryEdges,nonManifoldEdges,nonManifoldVertices,inconsistentWindingEdges,closedSolid,topologyValidated:true,selfIntersectionsChecked:false,bounds,tolerance,warnings};
    return {vertices:canonical,faces:validFaces,analysis};
  }
  function analyze(mesh,options){return prepare(mesh,options).analysis;}

  function sectionPath(path,tolerance){
    if(!Array.isArray(path)||path.length<2)fail('Desenhe pelo menos dois pontos para a seção.','INVALID_SECTION_PATH');
    if(path.length>LIMITS.pathVertices)fail('Traçado da seção excede 2048 vértices.','MESH_RESOURCE_LIMIT');
    const legs=[];let length=0;
    for(let i=0;i<path.length;i++){
      const p=path[i];if(!p||!finite(p[0])||!finite(p[1]))fail('Traçado da seção com coordenada inválida.','INVALID_SECTION_PATH');
      if(!i)continue;const a=path[i-1],dx=p[0]-a[0],dy=p[1]-a[1],len=Math.hypot(dx,dy);
      if(len<=tolerance)continue;
      legs.push({a,ux:dx/len,uy:dy/len,length:len,start:length,index:i-1,minX:Math.min(a[0],p[0]),maxX:Math.max(a[0],p[0]),minY:Math.min(a[1],p[1]),maxY:Math.max(a[1],p[1])});length+=len;
    }
    if(!legs.length)fail('O traçado da seção tem comprimento nulo.','INVALID_SECTION_PATH');
    return {legs,length};
  }

  function clipSegment(a,b,lo,hi,tolerance){
    let t0=0,t1=1;const ds=b[0]-a[0];
    if(Math.abs(ds)<=tolerance){if(a[0]<lo-tolerance||a[0]>hi+tolerance)return null;}
    else {let p=(lo-a[0])/ds,q=(hi-a[0])/ds;if(p>q){const t=p;p=q;q=t;}t0=Math.max(0,p);t1=Math.min(1,q);if(t1<t0)return null;}
    const p=[Math.max(lo,Math.min(hi,a[0]+ds*t0)),a[1]+(b[1]-a[1])*t0];
    const q=[Math.max(lo,Math.min(hi,a[0]+ds*t1)),a[1]+(b[1]-a[1])*t1];
    return distance2(p,q)>tolerance*tolerance?[p,q]:null;
  }

  function graphSegments(segments,tolerance,zOrigin){
    const nodes=[],cells=new Map(),edges=[],edgeSet=new Set();
    const tol2=tolerance*tolerance;
    function nodeFor(p){
      const ix=Math.floor(p[0]/tolerance),iy=Math.floor((p[1]-zOrigin)/tolerance);let best=-1,bestD=tol2;
      for(let x=ix-1;x<=ix+1;x++)for(let y=iy-1;y<=iy+1;y++){
        const list=cells.get(x+','+y);if(!list)continue;
        for(const id of list){const d=distance2(nodes[id].p,p);if(d<=bestD){best=id;bestD=d;}}
      }
      if(best>=0)return best;
      const id=nodes.length;nodes.push({p:p.slice(),edges:[]});const key=ix+','+iy;let list=cells.get(key);if(!list){list=[];cells.set(key,list);}list.push(id);return id;
    }
    for(const s of segments){
      const a=nodeFor(s[0]),b=nodeFor(s[1]);if(a===b)continue;const key=edgeKey(a,b);if(edgeSet.has(key))continue;edgeSet.add(key);
      const id=edges.length;edges.push({a,b,used:false});nodes[a].edges.push(id);nodes[b].edges.push(id);
    }
    const polylines=[];let branchNodes=0;
    function walk(start,edge){
      const points=[nodes[start].p.slice()];let current=start,ei=edge,closed=false;
      for(let guard=0;guard<=edges.length;guard++){
        const e=edges[ei];if(e.used)break;e.used=true;current=e.a===current?e.b:e.a;points.push(nodes[current].p.slice());
        if(current===start){closed=true;break;}
        if(nodes[current].edges.length!==2)break;
        const next=nodes[current].edges.find(i=>!edges[i].used);if(next===undefined)break;ei=next;
      }
      if(points.length>=2)polylines.push({points,closed});
    }
    for(let i=0;i<nodes.length;i++)if(nodes[i].edges.length!==2){if(nodes[i].edges.length>2)branchNodes++;for(const ei of nodes[i].edges)if(!edges[ei].used)walk(i,ei);}
    for(let ei=0;ei<edges.length;ei++)if(!edges[ei].used)walk(edges[ei].a,ei);
    return {polylines,branchNodes,nodeCount:nodes.length,segmentCount:edges.length};
  }

  function clipLoop(points,lo,hi,tolerance){
    // Recorta apenas o preenchimento de um contorno JÁ fechado no plano
    // infinito. Bordas criadas pela janela não são contatos e nunca entram
    // em polylines. A regra par/ímpar preserva furos e ilhas desconectadas.
    let polygon=points.slice();
    if(polygon.length>1&&distance2(polygon[0],polygon[polygon.length-1])<=tolerance*tolerance)polygon.pop();
    for(const side of [{x:lo,left:true},{x:hi,left:false}]){
      if(!polygon.length)break;
      const output=[];let a=polygon[polygon.length-1],insideA=side.left?a[0]>=side.x:a[0]<=side.x;
      for(const b of polygon){
        const insideB=side.left?b[0]>=side.x:b[0]<=side.x;
        if(insideA!==insideB){const t=(side.x-a[0])/(b[0]-a[0]);output.push([side.x,a[1]+t*(b[1]-a[1])]);}
        if(insideB)output.push(b.slice());a=b;insideA=insideB;
      }
      polygon=output;
    }
    const clean=[];for(const p of polygon)if(!clean.length||distance2(p,clean[clean.length-1])>tolerance*tolerance)clean.push(p);
    if(clean.length>1&&distance2(clean[0],clean[clean.length-1])<=tolerance*tolerance)clean.pop();
    if(clean.length<3)return null;
    const origin=clean[0];let area2=0;
    for(let i=1;i<clean.length-1;i++)area2+=(clean[i][0]-origin[0])*(clean[i+1][1]-origin[1])-(clean[i][1]-origin[1])*(clean[i+1][0]-origin[0]);
    return Math.abs(area2)>tolerance*tolerance?clean:null;
  }

  function cut(mesh,path,options){
    const prepared=prepare(mesh,options),vertices=prepared.vertices,faces=prepared.faces,analysis=prepared.analysis;
    const displayOnly=!!(mesh.simplifiedForVisualization||mesh.source?.simplification);
    const tolerance=analysis.tolerance,route=sectionPath(path,tolerance),segments=[],tangentPoints=[],fillPolygons=[];
    if(faces.length*route.legs.length>LIMITS.triangleTests)fail('Seção muito extensa para processar esta malha com segurança. Reduza o número de trechos ou separe os domínios; nenhum triângulo foi omitido.','MESH_RESOURCE_LIMIT');
    let coplanarTriangles=0,generatedSegments=0,tangentPointCount=0,ambiguousFillLegs=0;
    function pushSegment(a,b,leg,fullSegments){
      if(distance2(a,b)<=tolerance*tolerance)return;
      if(++generatedSegments>LIMITS.segments)fail('A seção excedeu o limite de segmentos. Separe os domínios para manter toda a geometria.','MESH_RESOURCE_LIMIT');
      if(fullSegments)fullSegments.push([a,b]);
      const clipped=clipSegment(a,b,0,leg.length,tolerance);if(!clipped)return;
      clipped[0][0]+=leg.start;clipped[1][0]+=leg.start;segments.push(clipped);
    }
    for(const leg of route.legs){
      const coplanar=new Map(),fullSegments=analysis.closedSolid&&!displayOnly?[]:null;
      for(const f of faces){
        const vs=f.map(i=>vertices[i]);
        if(!fullSegments&&(Math.max(vs[0][0],vs[1][0],vs[2][0])<leg.minX-tolerance||Math.min(vs[0][0],vs[1][0],vs[2][0])>leg.maxX+tolerance||Math.max(vs[0][1],vs[1][1],vs[2][1])<leg.minY-tolerance||Math.min(vs[0][1],vs[1][1],vs[2][1])>leg.maxY+tolerance))continue;
        const ds=vs.map(p=>-(p[0]-leg.a[0])*leg.uy+(p[1]-leg.a[1])*leg.ux);
        const signs=ds.map(d=>d>tolerance?1:d<-tolerance?-1:0);
        if(signs.every(s=>s===1)||signs.every(s=>s===-1))continue;
        const projected=vs.map(p=>[(p[0]-leg.a[0])*leg.ux+(p[1]-leg.a[1])*leg.uy,p[2]]);
        if(signs.every(s=>s===0)){
          coplanarTriangles++;
          for(let k=0;k<3;k++){
            const j=(k+1)%3,key=edgeKey(f[k],f[j]);let e=coplanar.get(key);
            if(!e){e={count:0,a:projected[k],b:projected[j]};coplanar.set(key,e);}e.count++;
          }
          continue;
        }
        const intersections=[];
        for(let k=0;k<3;k++){
          const j=(k+1)%3;
          if(signs[k]===0)intersections.push(projected[k]);
          if(signs[k]*signs[j]<0){const t=ds[k]/(ds[k]-ds[j]);intersections.push([projected[k][0]+t*(projected[j][0]-projected[k][0]),projected[k][1]+t*(projected[j][1]-projected[k][1])]);}
        }
        if(intersections.length>=2)pushSegment(intersections[0],intersections[1],leg,fullSegments);
        else if(intersections.length===1){const p=intersections[0];if(p[0]>=-tolerance&&p[0]<=leg.length+tolerance){tangentPointCount++;if(tangentPoints.length<10000)tangentPoints.push([leg.start+Math.max(0,Math.min(leg.length,p[0])),p[1]]);}}
      }
      // Duas faces coplanares compartilham uma diagonal interna: não é
      // um contato geológico e não deve aparecer no perfil.
      for(const e of coplanar.values())if(e.count===1)pushSegment(e.a,e.b,leg,fullSegments);
      if(fullSegments&&fullSegments.length){
        const fullGraph=graphSegments(fullSegments,tolerance,analysis.bounds.min[2]);
        // O contorno completo é a prova geométrica de interior; jamais
        // fecha diretamente um traço parcial ou uma ramificação ambígua.
        if(fullGraph.branchNodes===0&&fullGraph.polylines.every(p=>p.closed)){
          for(const line of fullGraph.polylines){const polygon=clipLoop(line.points,0,leg.length,tolerance);if(polygon)fillPolygons.push(polygon.map(p=>[p[0]+leg.start,p[1]]));}
        }else ambiguousFillLegs++;
      }
    }
    const graph=graphSegments(segments,tolerance,analysis.bounds.min[2]),warnings=analysis.warnings.slice();
    if(displayOnly)warnings.push('Malha simplificada para visualização: seção somente com linhas. Use a geometria integral para cubagem, recursos e reservas.');
    if(graph.branchNodes)warnings.push('A interseção possui '+graph.branchNodes+' nó(s) de ramificação/tangência; trechos ambíguos permanecem linhas abertas.');
    if(analysis.closedSolid&&graph.polylines.some(p=>!p.closed))warnings.push('Há contornos abertos nas bordas do traçado ou em tangências. Somente volumes confirmados pelo corte completo são preenchidos e recortados à janela A–B; os contatos não são prolongados.');
    if(ambiguousFillLegs)warnings.push('Preenchimento desabilitado em '+ambiguousFillLegs+' trecho(s) com corte completo aberto ou ambíguo; as linhas reais foram preservadas.');
    if(coplanarTriangles)warnings.push('O plano coincide com '+coplanarTriangles+' triângulo(s): exibido o limite da região coplanar, sem diagonais internas.');
    if(tangentPointCount>tangentPoints.length)warnings.push('Há '+tangentPointCount+' tangências pontuais; a lista auxiliar de pontos foi limitada a 10000. Nenhum segmento foi omitido.');
    if(!graph.polylines.length)warnings.push('O traçado não cruza a malha em um segmento; verifique a posição e o CRS.');
    return {polylines:graph.polylines,fillPolygons,closedSolid:analysis.closedSolid&&!displayOnly,displayOnly,warnings,analysis,length:route.length,tolerance,segmentCount:graph.segmentCount,nodeCount:graph.nodeCount,branchNodes:graph.branchNodes,coplanarTriangles,tangentPoints,tangentPointCount,ambiguousFillLegs};
  }
  root.GeoMineMeshSections=Object.freeze({analyze,cut,limits:LIMITS,version:1});
})(typeof window!=='undefined'?window:globalThis);
