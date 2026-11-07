/* Terminal arrowheads. The tip belongs to the last stored vertex of each
   line part, never to a clipped display segment; geometry is never changed. */
(function(root){
  'use strict';
  const MM_TO_PX=96/25.4;
  const finite=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
  function style(s={},parent={}){
    const mode=s.arrowEnd??parent.arrowEnd??'none',n=Number(s.arrowSize??parent.arrowSize??3);
    return {arrowEnd:['open','filled'].includes(mode)?mode:'none',arrowSize:Number.isFinite(n)&&n>0?Math.max(.5,Math.min(20,n)):3};
  }
  function terminal(ring){
    if(!Array.isArray(ring)||ring.length<2||!finite(ring[ring.length-1]))return null;
    const end=ring.length-1,b=ring[end];
    for(let i=end-1;i>=0;i--){
      const a=ring[i];if(!finite(a))return null;
      if(Math.hypot(b[0]-a[0],b[1]-a[1])>1e-12)return {a:a.slice(),b:b.slice(),previous:i,end};
    }
    return null;
  }
  function head(a,b,length){
    if(!finite(a)||!finite(b)||!Number.isFinite(length)||length<=0)return null;
    const dx=b[0]-a[0],dy=b[1]-a[1],norm=Math.hypot(dx,dy);if(norm<=1e-12)return null;
    const ux=dx/norm,uy=dy/norm,half=length*.42,
      bx=b[0]-ux*length,by=b[1]-uy*length;
    return [[bx-uy*half,by+ux*half],b.slice(0,2),[bx+uy*half,by-ux*half]];
  }
  const xml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function svg(a,b,s,color,weight,scale=1,viewport=null){
    const cfg=style(s);if(cfg.arrowEnd==='none'||!(weight>0))return '';
    if(viewport&&(b[0]<viewport[0]||b[1]<viewport[1]||b[0]>viewport[2]||b[1]>viewport[3]))return '';
    const p=head(a,b,cfg.arrowSize*scale);if(!p)return '';
    const d='M'+p.map(q=>q.map(v=>Number(v.toFixed(6))).join(' ')).join(' L')+(cfg.arrowEnd==='filled'?' Z':'');
    return `<path data-gm-line-arrow="${cfg.arrowEnd}" d="${d}" fill="${cfg.arrowEnd==='filled'?xml(color):'none'}" stroke="${xml(color)}" stroke-width="${weight}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  function rings(geom,out=[]){
    if(!Array.isArray(geom)||!geom.length)return out;
    if(Array.isArray(geom[0])&&typeof geom[0][0]==='number')out.push(geom);
    else geom.forEach(r=>rings(r,out));
    return out;
  }
  let leafletClasses=null,leafletLibrary=null;
  function leaflet(lls,s,options={}){
    const cfg=style(s),lib=root.L2||root.L;
    if(!lib||cfg.arrowEnd==='none'||!(Number(s.weight)>0))return [];
    if(!leafletClasses||leafletLibrary!==lib){
      const methods=Base=>({
        _projectLatlngs:function(latlngs,result,bounds){
          if(Array.isArray(latlngs[0])){latlngs.forEach(part=>this._projectLatlngs(part,result,bounds));return;}
          if(latlngs.length!==2)return;
          const a=this._map.latLngToLayerPoint(latlngs[0]),b=this._map.latLngToLayerPoint(latlngs[1]);
          this._gmTipLatLng=latlngs[1];
          const pts=head([a.x,a.y],[b.x,b.y],this.options.gmArrowSize*MM_TO_PX);
          if(!pts)return;
          const pp=pts.map(p=>lib.point(p[0],p[1]));pp.forEach(p=>bounds.extend(p));result.push(pp);
        },
        _clipPoints:function(){
          if(this._gmTipLatLng){
            const cp=this._map.latLngToContainerPoint(this._gmTipLatLng),sz=this._map.getSize();
            if(cp.x<0||cp.y<0||cp.x>sz.x||cp.y>sz.y){this._parts=[];return;}
          }
          Base.prototype._clipPoints.call(this);
        }
      });
      leafletClasses={open:lib.Polyline.extend(methods(lib.Polyline)),filled:lib.Polygon.extend(methods(lib.Polygon))};leafletLibrary=lib;
    }
    return rings(lls).flatMap(r=>{
      const t=terminal(r);if(!t)return [];
      const obj=new leafletClasses[cfg.arrowEnd]([t.a,t.b],{
        ...options,color:s.stroke||s.color||'#111',weight:Number(s.weight),
        opacity:options.opacity??1,fill:cfg.arrowEnd==='filled',fillColor:s.stroke||s.color||'#111',
        fillOpacity:options.opacity??1,dashArray:null,interactive:false,bubblingMouseEvents:false,
        className:'gm-line-arrow gm-line-arrow-'+cfg.arrowEnd,gmArrowSize:cfg.arrowSize,
        smoothFactor:0,noClip:true
      });
      obj._gmLineArrow={terminal:t.b.slice(),previous:t.a.slice(),style:cfg.arrowEnd};return [obj];
    });
  }
  function three(a,b,s,color,weight,THREE){
    const cfg=style(s);if(!THREE||!a||!b||cfg.arrowEnd==='none'||!(weight>0)||a.distanceToSquared(b)<1e-16)return null;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(9),3));
    const material=cfg.arrowEnd==='filled'?new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,depthTest:true,depthWrite:false}):
      new THREE.LineBasicMaterial({color,linewidth:weight,depthTest:true,depthWrite:false});
    const object=cfg.arrowEnd==='filled'?new THREE.Mesh(geometry,material):new THREE.Line(geometry,material);
    object.userData.gmLineArrow={a:a.clone(),b:b.clone(),size:cfg.arrowSize*MM_TO_PX};
    return object;
  }
  function updateThree(object,camera,worldPixelAt){
    const data=object.userData?.gmLineArrow;if(!data||!camera||!object.geometry)return false;
    const {a,b,size}=data,dir=b.clone().sub(a).normalize(),view=camera.position.clone().sub(b).normalize(),
      side=dir.clone().cross(view);
    if(side.lengthSq()<1e-12)side.set(0,1,0).cross(dir);
    if(side.lengthSq()<1e-12)side.set(1,0,0).cross(dir);
    side.normalize();const length=Math.max(1e-8,worldPixelAt(b))*size,
      base=b.clone().addScaledVector(dir,-length),p=[base.clone().addScaledVector(side,length*.42),b,base.clone().addScaledVector(side,-length*.42)],
      position=object.geometry.getAttribute('position');
    p.forEach((q,i)=>position.setXYZ(i,q.x,q.y,q.z));position.needsUpdate=true;object.geometry.computeBoundingSphere();return true;
  }
  root.GeoMineLineArrows={style,terminal,head,svg,rings,leaflet,three,updateThree,MM_TO_PX};
})(typeof window!=='undefined'?window:globalThis);
