'use strict';
// Native ArcGIS queries sometimes reject f=geojson. Preserve every polygon ring,
// including disjoint exteriors and nested islands, after requesting outSR=4326.
function geometry(g){
  if(!g)return null;
  if(Number.isFinite(g.x)&&Number.isFinite(g.y))return {type:'Point',coordinates:[g.x,g.y]};
  if(g.points)return {type:'MultiPoint',coordinates:g.points};
  if(g.paths)return g.paths.length===1?{type:'LineString',coordinates:g.paths[0]}:{type:'MultiLineString',coordinates:g.paths};
  if(!g.rings)throw Error('Unsupported ArcGIS geometry');
  const area=r=>Math.abs(r.reduce((a,p,i)=>{const q=r[(i+1)%r.length];return a+p[0]*q[1]-q[0]*p[1]},0)/2);
  const inside=(p,r)=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes}return yes};
  const rings=g.rings.map(r=>{if(r.length<4)throw Error('Invalid polygon ring');const c=r.map(p=>p.slice(0,2));if(c[0][0]!==c.at(-1)[0]||c[0][1]!==c.at(-1)[1])c.push([...c[0]]);return {c,area:area(c),parent:null,depth:0}}).sort((a,b)=>b.area-a.area);
  const polygons=[];
  for(const r of rings){r.parent=rings.filter(p=>p.area>r.area&&inside(r.c[0],p.c)).sort((a,b)=>a.area-b.area)[0]||null;r.depth=r.parent?r.parent.depth+1:0;if(r.depth%2===0){r.poly=[r.c];polygons.push(r.poly)}else r.parent.poly.push(r.c)}
  return polygons.length===1?{type:'Polygon',coordinates:polygons[0]}:{type:'MultiPolygon',coordinates:polygons};
}
module.exports={geometry,feature:f=>({type:'Feature',properties:f.attributes||{},geometry:geometry(f.geometry)})};
