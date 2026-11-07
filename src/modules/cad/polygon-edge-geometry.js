/* Pure polygon-edge translation. Geometry is an XY[ZM] ring or nested arrays
   of rings; ring order, nesting, extra ordinates and closure are preserved.
   This checks structural validity, zero-length edges and nonzero area, not
   full polygon topology (self-intersections or containment of holes). */
(function(root){
'use strict';
const sameXY=(a,b)=>a[0]===b[0]&&a[1]===b[1];
// Match the legacy editor's ring closure test, including its strict cutoff.
// A near-duplicate closing coordinate is not an independent edge endpoint.
const closedXY=points=>points.length>3&&Math.hypot(points[0][0]-points[points.length-1][0],points[0][1]-points[points.length-1][1])<1e-7;
function invalid(message){throw new TypeError(message);}
function inspect(points,path){
  for(let i=0;i<points.length;i++){
    const p=points[i];
    if(!Array.isArray(p)||p.length<2)invalid('Cada vértice deve conter pelo menos X e Y.');
    for(let j=0;j<p.length;j++)if(typeof p[j]!=='number'||!Number.isFinite(p[j]))
      invalid('As coordenadas dos vértices devem ser números finitos.');
  }
  const closed=closedXY(points),count=points.length-(closed?1:0);
  if(count<3)invalid('Um anel deve conter pelo menos três vértices, além do fecho opcional.');
  let twiceArea=0,compensation=0;
  const origin=points[0];
  for(let i=0;i<count;i++){
    const a=points[i],b=points[(i+1)%count];
    if(sameXY(a,b))invalid('O deslocamento não pode deixar uma aresta com comprimento zero.');
    // Local coordinates avoid cancellation between large UTM eastings and
    // northings. Compensated summation preserves small valid polygon areas.
    const cross=(a[0]-origin[0])*(b[1]-origin[1])-(a[1]-origin[1])*(b[0]-origin[0]);
    if(!Number.isFinite(cross))invalid('As coordenadas excedem a precisão numérica suportada.');
    const adjusted=cross-compensation,next=twiceArea+adjusted;
    compensation=(next-twiceArea)-adjusted;twiceArea=next;
  }
  if(!Number.isFinite(twiceArea)||twiceArea===0)invalid('O deslocamento não pode produzir um anel com área nula ou inválida.');
  return {path:path.slice(),points,closed,count};
}
function rings(geom){
  const result=[],ancestors=new Set();
  function visit(value,path){
    if(!Array.isArray(value)||!value.length||!Array.isArray(value[0]))invalid('Geometria de polígono inválida ou vazia.');
    if(ancestors.has(value))invalid('A geometria não pode conter referências circulares.');
    if(path.length>64)invalid('A geometria possui níveis de aninhamento demais.');
    ancestors.add(value);
    if(!Array.isArray(value[0][0]))result.push(inspect(value,path));
    else for(let i=0;i<value.length;i++)visit(value[i],path.concat(i));
    ancestors.delete(value);
  }
  visit(geom,[]);return result;
}
function translate(geom,edge,dx,dy){
  if(typeof dx!=='number'||typeof dy!=='number'||!Number.isFinite(dx)||!Number.isFinite(dy))
    invalid('O deslocamento X/Y deve conter números finitos.');
  if(!edge||!Array.isArray(edge.path)||edge.path.some(i=>!Number.isSafeInteger(i)||i<0)||
    !Number.isSafeInteger(edge.index)||edge.index<0)invalid('A identificação da aresta é inválida.');
  // Sparse paths must not compare equal through Array.every/some skipping holes.
  for(let i=0;i<edge.path.length;i++)if(!Object.prototype.hasOwnProperty.call(edge.path,i))invalid('O caminho do anel é inválido.');
  const source=rings(geom).find(r=>r.path.length===edge.path.length&&r.path.every((v,i)=>v===edge.path[i]));
  if(!source||edge.index>=source.count)invalid('A aresta selecionada não pertence ao polígono.');
  const copy=value=>Array.isArray(value)?value.map(copy):value,result=copy(geom);
  let target=result;for(const i of source.path)target=target[i];
  for(const i of [edge.index,(edge.index+1)%source.count]){
    // Preserve signed zero and every extra ordinate even for a zero move.
    if(dx!==0)target[i][0]+=dx;if(dy!==0)target[i][1]+=dy;
  }
  if(source.closed&&(edge.index===0||edge.index===source.count-1)){
    if(dx!==0)target[source.count][0]=target[0][0];
    if(dy!==0)target[source.count][1]=target[0][1];
  }
  const moved=inspect(target,source.path);
  if(moved.closed!==source.closed||moved.count!==source.count)
    invalid('O deslocamento não pode colapsar o fecho do anel.');
  return result;
}
root.GeoMinePolygonEdgeGeometry=Object.freeze({rings,translate});
})(typeof window!=='undefined'?window:globalThis);
