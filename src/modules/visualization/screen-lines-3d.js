/* Screen-space strokes: the 2D symbol width and dash lengths are CSS pixels,
   independent of camera distance, orientation, field of view and device DPR. */
(function(root){
'use strict';
function create(THREE,input,style){
 const width=Number(style.width);if(!(width>0)||input.length<2)return null;
 const P=[];for(const p of input){const q=P.at(-1);if(!q||p.distanceToSquared(q)>1e-16)P.push(p.clone());}
 if(P.length<2)return null;
 const n=P.length,positions=new Float32Array(n*6),prev=new Float32Array(n*6),next=new Float32Array(n*6),side=new Float32Array(n*2),distance=new Float32Array(n*2),indices=[];
 for(let i=0;i<n;i++)for(let s=0;s<2;s++){
  const at=(i*2+s)*3,p=P[i],a=P[Math.max(0,i-1)],b=P[Math.min(n-1,i+1)];
  positions.set([p.x,p.y,p.z],at);prev.set([a.x,a.y,a.z],at);next.set([b.x,b.y,b.z],at);side[i*2+s]=s?1:-1;
 }
 for(let i=1;i<n;i++){const k=i*2;indices.push(k-2,k-1,k,k-1,k+1,k);}
 let dash=String(style.dash||'').trim().split(/[ ,]+/).filter(Boolean).map(Number).filter(v=>Number.isFinite(v)&&v>=0);
 if(dash.length%2)dash=dash.concat(dash);dash=dash.slice(0,16);
 const total=dash.reduce((a,b)=>a+b,0),pattern=new Float32Array(16);pattern.set(dash);
 const color=new THREE.Color(style.color),opacity=Number.isFinite(style.opacity)?style.opacity:1;
 const material=new THREE.ShaderMaterial({side:THREE.DoubleSide,depthTest:true,depthWrite:false,
  transparent:opacity<1,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
  uniforms:{viewport:{value:new THREE.Vector2(1,1)},width:{value:width},stroke:{value:color},opacity:{value:opacity},dashCount:{value:dash.length},dashTotal:{value:total},dashPattern:{value:pattern}},
  vertexShader:`attribute vec3 previous;attribute vec3 following;attribute float side;attribute float lineDistance;
   uniform vec2 viewport;uniform float width;varying float distanceW;varying float clipW;
   vec2 pixel(vec4 p){return (p.xy/max(abs(p.w),.00001))*viewport*.5;}
   vec2 direction(vec2 v){return v/max(length(v),.00001);}
   void main(){
    vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);
    vec4 a=projectionMatrix*modelViewMatrix*vec4(previous,1.);
    vec4 b=projectionMatrix*modelViewMatrix*vec4(following,1.);
    vec2 d0=pixel(p)-pixel(a),d1=pixel(b)-pixel(p);
    if(length(d0)<.0001)d0=d1;if(length(d1)<.0001)d1=d0;
    d0=direction(d0);d1=direction(d1);vec2 tangent=direction(d0+d1);
    if(length(tangent)<.0001)tangent=d1;
    vec2 normal=vec2(-tangent.y,tangent.x),edge=vec2(-d1.y,d1.x);
    float miter=max(abs(dot(normal,edge)),.25);
    p.xy+=normal*side*width*.5/miter*2./viewport*p.w;
    gl_Position=p;distanceW=lineDistance*p.w;clipW=p.w;
   }`,
  fragmentShader:`uniform vec3 stroke;uniform float opacity;uniform float dashTotal;uniform int dashCount;uniform float dashPattern[16];varying float distanceW;varying float clipW;
   void main(){if(dashTotal>0.){float d=mod(distanceW/clipW,dashTotal);bool on=true;
    for(int i=0;i<16;i++){if(i>=dashCount)break;if(d<dashPattern[i])break;d-=dashPattern[i];on=!on;}
    if(!on)discard;}gl_FragColor=vec4(stroke,opacity);}`
 });
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('previous',new THREE.BufferAttribute(prev,3));geo.setAttribute('following',new THREE.BufferAttribute(next,3));geo.setAttribute('side',new THREE.BufferAttribute(side,1));geo.setAttribute('lineDistance',new THREE.BufferAttribute(distance,1));geo.setIndex(indices);geo.computeBoundingSphere();
 const mesh=new THREE.Mesh(geo,material);mesh.frustumCulled=false;
 mesh.userData.alagisScreenLine={points:P,width,dash:dash.slice(),total,signature:''};
 mesh.userData.alagisRibbon={points:P,weight:width};
 mesh.onBeforeRender=(renderer,scene,camera)=>update(mesh,camera,renderer);
 return mesh;
}
function update(mesh,camera,renderer){
 const data=mesh.userData?.alagisScreenLine;if(!data)return false;
 const el=renderer.domElement,w=Math.max(1,el.clientWidth||el.width/(renderer.getPixelRatio?.()||1)),h=Math.max(1,el.clientHeight||el.height/(renderer.getPixelRatio?.()||1));
 mesh.material.uniforms.viewport.value.set(w,h);
 if(data.total>0){
  camera.updateMatrixWorld();mesh.updateMatrixWorld();
  const key=[w,h,...camera.matrixWorld.elements,...camera.projectionMatrix.elements,...mesh.matrixWorld.elements].join('|');
  if(key!==data.signature){data.signature=key;const attribute=mesh.geometry.getAttribute('lineDistance'),p=new root.THREE.Vector3();let last=null,d=0;
   data.points.forEach((q,i)=>{p.copy(q).applyMatrix4(mesh.matrixWorld).project(camera);const x=p.x*w/2,y=p.y*h/2;if(last)d+=Math.hypot(x-last[0],y-last[1]);last=[x,y];attribute.setX(i*2,d);attribute.setX(i*2+1,d);});attribute.needsUpdate=true;
  }
 }
 return true;
}
root.GeoMine3DLines={create,update};
})(window);
