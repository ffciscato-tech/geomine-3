/* Surpac: uma geometria XYZ, duas representações independentes. As faces
   são projetadas vértice a vértice; nunca se estica a caixa da malha como
   imagem. Um único contexto WebGL fornece o z-buffer de todas as camadas
   2D/Layout, evitando esgotar os contextos do navegador. */
(function(){
  'use strict';
  const api=window.GeoMineGeology=window.GeoMineGeology||{};
  const geometryCache=new WeakMap(),mapCache=new WeakMap(),geoCache=new WeakMap();let gpu=null;
  const isLayer=L=>L?._geology?.kind==='surpac-mesh'&&!!L._geology.meshId;
  const role=L=>L._geology.meshRole==='vectors'?'vectors':'surface';
  const number=(v,fallback)=>Number.isFinite(Number(v))?Number(v):fallback;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // loadProject instala as camadas antes de restaurar o repositório comum.
  // Esse curto intervalo não é corrupção; restoreLayers redesenha depois.
  const storeReady=()=>Array.isArray(S.geology?.meshes);
  function meshFor(L){return api.meshes.getWorkMesh(L._geology.meshId);}
  function geometry(m){
    let c=geometryCache.get(m.vertices);if(c&&c.faces===m.faces)return c;
    if(!m.vertices.length||!m.faces.length)throw new Error('Malha sem vértices ou faces.');
    const n=m.vertices.length,b={xmin:Infinity,ymin:Infinity,zmin:Infinity,xmax:-Infinity,ymax:-Infinity,zmax:-Infinity};
    for(const p of m.vertices){if(!p||p.length<3||!p.every(Number.isFinite))throw new Error('Coordenada inválida na malha.');
      b.xmin=Math.min(b.xmin,p[0]);b.ymin=Math.min(b.ymin,p[1]);b.zmin=Math.min(b.zmin,p[2]);
      b.xmax=Math.max(b.xmax,p[0]);b.ymax=Math.max(b.ymax,p[1]);b.zmax=Math.max(b.zmax,p[2]);}
    const triangles=new (n>65535?Uint32Array:Uint16Array)(m.faces.length*3),normals=new Float32Array(n*3),edgeKeys=new Set(),edges=[];
    m.faces.forEach((f,i)=>{
      if(f.length!==3||f.some(j=>!Number.isInteger(j)||j<0||j>=n))throw new Error('Índice de face inválido.');
      triangles.set(f,i*3);const a=m.vertices[f[0]],b=m.vertices[f[1]],c=m.vertices[f[2]],
        ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2],
        nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
      for(let k=0;k<3;k++){const j=f[k];normals[j*3]+=nx;normals[j*3+1]+=ny;normals[j*3+2]+=nz;
        // n <= 600 mil no importador: a chave inteira fica abaixo de 2^53,
        // economizando centenas de milhares de strings durante o desenho.
        const u=f[k],v=f[(k+1)%3],lo=Math.min(u,v),hi=Math.max(u,v),key=lo*n+hi;
        if(!edgeKeys.has(key)){edgeKeys.add(key);edges.push(lo,hi);}}
    });
    const shade=new Float32Array(n);
    for(let i=0;i<n;i++){const nx=normals[i*3],ny=normals[i*3+1],nz=normals[i*3+2],len=Math.hypot(nx,ny,nz);
      shade[i]=len?0.62+0.38*Math.abs((nx*0.36-ny*0.48+nz*0.8)/len):1;}
    c={faces:m.faces,triangles,edges:new Uint32Array(edges),shade,bounds:b};geometryCache.set(m.vertices,c);return c;
  }
  function style(L){
    const s=L.sym||{},r=role(L),value=r==='vectors'?(s.stroke||s.color||L.color):(s.color||L.color),
      color=/^#[0-9a-f]{6}$/i.test(value||'')?value:'#48aaa2',rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255);
    return {color,rgb,opacity:clamp(number(s.opacity,1)*(r==='surface'?number(s.fill,number(L.fill,1)):1),0,1),
      weight:Math.max(0,number(s.weight,number(L.weight,1))),dash:String(s.dash||'')};
  }
  function info(L){
    if(!isLayer(L))return null;
    try{if(!storeReady())throw new Error('pending');const m=meshFor(L),c=geometry(m),r=role(L),count=r==='surface'?m.faces.length:c.edges.length/2;
      return {meshId:m.id,role:r,vertexCount:m.vertices.length,faceCount:m.faces.length,edgeCount:c.edges.length/2,count,
        label:r==='surface'?'triângulos':'arestas'};
    }catch(_){return {meshId:L._geology.meshId,role:role(L),vertexCount:0,faceCount:0,edgeCount:0,count:0,label:'malha pendente'};}
  }
  function extent3D(){
    if(!storeReady())return null;
    const e={xmin:Infinity,ymin:Infinity,zmin:Infinity,xmax:-Infinity,ymax:-Infinity,zmax:-Infinity,n:0,n3:0,n2:0},seen=new Set();
    for(const L of S.layers||[]){if(!isLayer(L)||L.visible===false||seen.has(L._geology.meshId))continue;
      try{const m=meshFor(L),b=geometry(m).bounds;seen.add(m.id);
        for(const k of ['xmin','ymin','zmin'])e[k]=Math.min(e[k],b[k]);
        for(const k of ['xmax','ymax','zmax'])e[k]=Math.max(e[k],b[k]);e.n+=m.vertices.length;e.n3+=m.vertices.length;
      }catch(error){report(L,error);}}
    return e.n?e:null;
  }
  function layerBounds(L){
    if(!isLayer(L))return null;const b=L2.latLngBounds([]);
    if(!storeReady())return b;
    try{const c=geographic(meshFor(L));b.extend([c.minLat,c.minLng]);b.extend([c.maxLat,c.maxLng]);}
    catch(error){report(L,error);}return b;
  }
  function geographic(m){
    let c=geoCache.get(m.vertices);if(c&&c.source===m.crs)return c;
    c={source:m.crs,xy:new Float64Array(m.vertices.length*2),minLat:Infinity,minLng:Infinity,maxLat:-Infinity,maxLng:-Infinity};
    m.vertices.forEach((v,i)=>{const q=toWGS(m.crs,v[0],v[1]);
      if(!q.every(Number.isFinite)||Math.abs(q[0])>360||Math.abs(q[1])>90)throw new Error('Malha fora do domínio geográfico; confira seu CRS.');
      c.xy[i*2]=q[0];c.xy[i*2+1]=q[1];c.minLng=Math.min(c.minLng,q[0]);c.maxLng=Math.max(c.maxLng,q[0]);
      c.minLat=Math.min(c.minLat,q[1]);c.maxLat=Math.max(c.maxLat,q[1]);
    });geoCache.set(m.vertices,c);return c;
  }
  function report(L,error){
    const message=String(error?.message||error);if(L._meshRenderError===message)return;L._meshRenderError=message;
    console.warn('Representação da malha '+L.name+': '+message);
    if(typeof cmdLog==='function')cmdLog('Malha '+L.name+': '+message,'warn');
  }
  function createGPU(){
    if(gpu&&!gpu.gl.isContextLost())return gpu;
    const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:true});
    if(!gl)throw new Error('WebGL indisponível: ative a aceleração gráfica para desenhar as superfícies. Os vetores permanecem disponíveis.');
    const shader=(type,text)=>{const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);
      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw new Error(message);}return s;};
    const vs=shader(gl.VERTEX_SHADER,'attribute vec3 position; attribute float shade; uniform vec4 view; varying float light; void main(){gl_Position=vec4((position.x-view.x)/view.z*2.0-1.0,1.0-(position.y-view.y)/view.w*2.0,position.z,1.0);light=shade;}'),
      fs=shader(gl.FRAGMENT_SHADER,'precision mediump float; uniform vec4 color; varying float light; void main(){gl_FragColor=vec4(color.rgb*light*color.a,color.a);}'),
      program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Falha ao preparar o desenho da malha.');
    gpu={canvas,gl,program,p:gl.getAttribLocation(program,'position'),s:gl.getAttribLocation(program,'shade'),
      view:gl.getUniformLocation(program,'view'),color:gl.getUniformLocation(program,'color'),
      uint:!!gl.getExtension('OES_element_index_uint'),limit:Math.min(2048,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE))};return gpu;
  }
  function coordinates(m,project){
    const b=geometry(m).bounds,zspan=b.zmax-b.zmin||1,p=new Float32Array(m.vertices.length*3);
    for(let i=0;i<m.vertices.length;i++){const q=project(m.vertices[i],i);if(!q||!q.every(Number.isFinite))throw new Error('Projeção inválida da malha.');
      p[i*3]=q[0];p[i*3+1]=q[1];p[i*3+2]=0.9-(m.vertices[i][2]-b.zmin)/zspan*1.8;}
    return p;
  }
  function paintSurface(ctx,m,positions,s,width,height){
    if(s.opacity<=0)return;
    const g=createGPU(),{gl}=g,c=geometry(m),buffers=[];
    if(c.triangles instanceof Uint32Array&&!g.uint)throw new Error('Este navegador não suporta índices de malhas grandes. Use um navegador com WebGL atualizado.');
    try{
      gl.useProgram(g.program);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);
      const upload=(target,data)=>{const b=gl.createBuffer();buffers.push(b);gl.bindBuffer(target,b);gl.bufferData(target,data,gl.STATIC_DRAW);};
      upload(gl.ARRAY_BUFFER,positions);gl.enableVertexAttribArray(g.p);gl.vertexAttribPointer(g.p,3,gl.FLOAT,false,0,0);
      upload(gl.ARRAY_BUFFER,c.shade);gl.enableVertexAttribArray(g.s);gl.vertexAttribPointer(g.s,1,gl.FLOAT,false,0,0);
      upload(gl.ELEMENT_ARRAY_BUFFER,c.triangles);gl.uniform4f(g.color,...s.rgb,s.opacity);
      for(let y=0;y<height;y+=g.limit)for(let x=0;x<width;x+=g.limit){
        const w=Math.min(g.limit,width-x),h=Math.min(g.limit,height-y);g.canvas.width=w;g.canvas.height=h;
        gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        gl.uniform4f(g.view,x,y,w,h);gl.drawElements(gl.TRIANGLES,c.triangles.length,c.triangles instanceof Uint32Array?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT,0);
        ctx.drawImage(g.canvas,x,y);}
      if(gl.isContextLost())throw new Error('A aceleração gráfica foi interrompida; atualize a visualização da malha.');
    }finally{for(const b of buffers)gl.deleteBuffer(b);}
  }
  function paintVectors(ctx,m,p,s,scale){
    if(s.opacity<=0||s.weight<=0)return;const edges=geometry(m).edges;
    ctx.save();ctx.strokeStyle=s.color;ctx.globalAlpha=s.opacity;ctx.lineWidth=s.weight*scale;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.setLineDash(s.dash.split(/[ ,]+/).map(Number).filter(v=>v>0).map(v=>v*scale));
    for(let i=0;i<edges.length;i+=40000){ctx.beginPath();const end=Math.min(edges.length,i+40000);
      for(let j=i;j<end;j+=2){const a=edges[j]*3,b=edges[j+1]*3;ctx.moveTo(p[a],p[a+1]);ctx.lineTo(p[b],p[b+1]);}ctx.stroke();}ctx.restore();
  }
  function paint(canvas,L,m,project,scale){
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);const s=style(L),p=coordinates(m,project);
    if(role(L)==='surface')paintSurface(ctx,m,p,s,canvas.width,canvas.height);else paintVectors(ctx,m,p,s,scale);
    L._meshRenderError=null;return canvas;
  }
  function mapCoordinates(m,map){
    let c=mapCache.get(m.vertices);
    if(!c||c.crs!==map.options.crs||c.source!==m.crs){
      const xy=new Float64Array(m.vertices.length*2),ll=geographic(m).xy;
      m.vertices.forEach((_v,i)=>{const p=map.project([ll[i*2+1],ll[i*2]],0);xy[i*2]=p.x;xy[i*2+1]=p.y;});
      c={crs:map.options.crs,source:m.crs,xy};mapCache.set(m.vertices,c);
    }return c.xy;
  }
  function drawLayer2D(L){
    if(!isLayer(L))return false;
    const pane=panelDaCamada('L'+L.id);
    const MeshLayer=L2.Layer.extend({
      onAdd(map){this._map=map;this._canvas=document.createElement('canvas');this._canvas.className='geomine-mesh-canvas leaflet-zoom-hide';
        this._canvas.dataset.meshId=L._geology.meshId;this._canvas.dataset.meshRole=role(L);
        Object.assign(this._canvas.style,{position:'absolute',pointerEvents:'none'});map.getPane(pane).appendChild(this._canvas);
        this._queue=()=>{if(this._frame)return;this._frame=requestAnimationFrame(()=>{this._frame=null;this.redraw();});};
        map.on('moveend zoomend resize viewreset',this._queue);this.redraw();},
      onRemove(map){map.off('moveend zoomend resize viewreset',this._queue);if(this._frame)cancelAnimationFrame(this._frame);this._frame=null;
        if(this._canvas){this._canvas.remove();this._canvas.width=this._canvas.height=1;}this._map=null;},
      getBounds(){return layerBounds(L);},
      redraw(){if(!this._map||!this._canvas)return this;const map=this._map,size=map.getSize();if(size.x<=0||size.y<=0)return this;
        const dpr=Math.min(2,number(window.devicePixelRatio,1)),canvas=this._canvas;canvas.width=Math.max(1,Math.round(size.x*dpr));canvas.height=Math.max(1,Math.round(size.y*dpr));
        canvas.style.width=size.x+'px';canvas.style.height=size.y+'px';L2.DomUtil.setPosition(canvas,map.containerPointToLayerPoint([0,0]));
        if(!storeReady())return this;
        try{const m=meshFor(L),xy=mapCoordinates(m,map),factor=map.options.crs.scale(map.getZoom())/map.options.crs.scale(0),
          origin=map.getPixelOrigin(),offset=map.layerPointToContainerPoint([0,0]);
          paint(canvas,L,m,(_v,i)=>[(xy[i*2]*factor-origin.x+offset.x)*dpr,(xy[i*2+1]*factor-origin.y+offset.y)*dpr],dpr);
        }catch(error){report(L,error);}return this;}
    });
    L.llayer=new MeshLayer();if(L.visible!==false)L.llayer.addTo(map);return true;
  }
  function append3D(group,ctx){
    const T=window.THREE;if(!T||!group||!storeReady())return 0;let count=0;
    const nodes=typeof stackSync==='function'?stackSync().filter(n=>n.t==='L').map(n=>n.o):(S.layers||[]);
    for(const [order,L] of nodes.entries()){
      if(!isLayer(L)||L.visible===false||(role(L)==='vectors'&&ctx.showVectors===false))continue;
      try{const m=meshFor(L),c=geometry(m),s=style(L),positions=new Float32Array(m.vertices.length*3);
        m.vertices.forEach((p,i)=>{positions[i*3]=p[0]-ctx.OX;positions[i*3+1]=(p[2]-ctx.zmnG)*ctx.VE;positions[i*3+2]=-(p[1]-ctx.OY);});
        const geom=new T.BufferGeometry();geom.setAttribute('position',new T.BufferAttribute(positions,3));let object;
        if(role(L)==='surface'){
          geom.setIndex(new T.BufferAttribute(c.triangles.slice(),1));geom.computeVertexNormals();
          const material=new T.MeshLambertMaterial({color:s.color,side:T.DoubleSide,opacity:s.opacity,transparent:s.opacity<1,depthWrite:s.opacity>=1,
            polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});object=new T.Mesh(geom,material);
        }else{
          geom.setIndex(new T.BufferAttribute(c.edges.slice(),1));const material=new T.LineBasicMaterial({color:s.color,opacity:s.opacity,
            transparent:s.opacity<1,linewidth:s.weight,depthWrite:false});object=new T.LineSegments(geom,material);
        }
        object.visible=s.opacity>0&&(role(L)!=='vectors'||s.weight>0);object.name=L.name;
        object.userData={layerId:L.id,meshId:m.id,meshRole:role(L),sourceCRS:m.crs};object.renderOrder=nodes.length-order;group.add(object);count++;
      }catch(error){report(L,error);}
    }return count;
  }
  function renderLayout(L,ctx){
    if(!isLayer(L))return null;
    try{const dpi=clamp(number(ctx.dpi,150),72,600),rawW=Math.max(1,Math.round(ctx.width*dpi/25.4)),rawH=Math.max(1,Math.round(ctx.height*dpi/25.4)),
        cap=Math.min(1,8192/rawW,8192/rawH,Math.sqrt(32000000/(rawW*rawH))),w=Math.max(1,Math.round(rawW*cap)),h=Math.max(1,Math.round(rawH*cap)),
        canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const m=meshFor(L);
      paint(canvas,L,m,v=>[(v[0]-ctx.x0)/(ctx.x1-ctx.x0)*w,(ctx.y1-v[1])/(ctx.y1-ctx.y0)*h],w/ctx.width*0.3*number(ctx.mapSym,1));
      const image=canvas.toDataURL('image/png');canvas.width=canvas.height=1;
      return '<image data-mesh-id="'+escape(m.id)+'" data-mesh-role="'+role(L)+'" href="'+image+'" x="'+ctx.x+'" y="'+ctx.y+'" width="'+ctx.width+'" height="'+ctx.height+'" preserveAspectRatio="none"/>';
    }catch(error){report(L,error);throw new Error('Não foi possível desenhar a malha '+L.name+' na prancha: '+error.message);}
  }
  api.meshViews={isLayer,info,drawLayer2D,layerBounds,extent3D,append3D,renderLayout};
})();
