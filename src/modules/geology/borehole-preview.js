/* Conferência 3D combinada de collar + survey + intervalos. Inspirada no
   buildHolesScene/rebuildIntervalMatrices do Varioscape: cilindros instanciados
   seguem cada segmento MD, sem converter a trajetória em uma reta ou MDT. */
(function(){
  'use strict';
  const api=window.GeoMineGeology=window.GeoMineGeology||{};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const limits=Object.freeze({holes:10000,tracePoints:250000,intervals:100000,intervalSegments:100000});
  const number=v=>Number(v).toLocaleString('pt-BR',{maximumFractionDigits:3});
  function colorOf(lithology){
    if(api.__sectionTest?.lithologyColor)return api.__sectionTest.lithologyColor(lithology);
    let hash=2166136261;for(const c of String(lithology).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}
    return ['#8b5e3c','#d97706','#ca8a04','#65a30d','#15803d','#0f766e','#0e7490','#2563eb','#4f46e5','#7c3aed','#a21caf','#be185d','#b91c1c','#64748b'][(hash>>>0)%14];
  }
  function open(parsed,host){
    if(!host||typeof THREE==='undefined')throw new Error('Visualizador 3D de sondagens indisponível.');
    const data=window.GeoMineBoreholePreviewGeometry.build(parsed,{limits});
    if(!data.holes.length)throw new Error('Nenhum furo para conferir em 3D.');
    const extents=data.bounds.max.map((value,i)=>value-data.bounds.min[i]);
    if(!extents.every(value=>Number.isFinite(Math.fround(value))))throw new Error('Coordenadas excedem a faixa segura da visualização 3D. Confira as unidades e o CRS do collar.');
    const previous=host.__gmBoreholePreviewDispose;if(typeof previous==='function')previous();
    host.innerHTML=`<section class="gm-bhpv"><h3>Conferência 3D · collar, survey e litologia</h3>
      <div class="gm-bhpv-controls"><label>Furos<select data-bhpv-hole><option value="all">Todos os ${data.holes.length} furos</option>${data.holes.map(h=>`<option value="${h.index}">${esc(h.id)}</option>`).join('')}</select></label><label>Espessura visual<input data-bhpv-radius type="range" min="0.25" max="4" step="0.05" value="1"><output data-bhpv-size></output></label><button class="tbtn" data-bhpv-fit>Enquadrar</button><label class="gm-bhpv-check"><input type="checkbox" data-bhpv-labels checked>Identificações</label></div>
      <p class="gm-bh-hint">Gire arrastando. Roda do mouse ou pinça para aproximar; botão direito ou Shift + arrastar para mover. Clique na boca ou em um intervalo para consultar. Escala XYZ 1:1; a espessura dos tubos é apenas um símbolo, não o diâmetro medido do furo.</p>
      <div class="gm-bhpv-counts" aria-live="polite"></div><div class="gm-bhpv-canvas" role="img" aria-label="Sondagens 3D com bocas e intervalos litológicos"></div>
      <div class="gm-bhpv-lower"><div><strong>Litologias informadas</strong><div class="gm-bhpv-legend"></div></div><div class="gm-bhpv-details"><label>Consultar intervalo do furo selecionado<select data-bhpv-interval><option value="">Selecione um furo acima</option></select></label><div class="gm-bhpv-inspect" aria-live="polite">Selecione um furo ou clique na visualização para conferir seus dados.</div></div></div>
      <p class="gm-bhpv-note">Trechos sem litologia permanecem como linha neutra. Collar sem profundidade aparece somente como boca, sem trajetória inventada.</p></section>`;
    const root=host.firstElementChild,$=s=>root.querySelector(s),box=$('.gm-bhpv-canvas'),inspector=$('.gm-bhpv-inspect');
    let disposed=false,frame=0,geometry=null,lines=null,collars=null,tubes=null,labels=null,highlight=null,visible=data.holes,
      segmentRefs=[],selectedInterval=null,selectedHole=null,observer=null,removalObserver=null;
    const scene=new THREE.Scene();scene.background=new THREE.Color('#e7edf2');
    const camera=new THREE.PerspectiveCamera(42,1,.01,1000000);
    let renderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}catch(e){host.innerHTML='';throw new Error('Não foi possível iniciar o 3D. Ative a aceleração gráfica do navegador e tente novamente.');}
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));box.appendChild(renderer.domElement);
    renderer.domElement.dataset.holes=String(data.holes.length);renderer.domElement.dataset.intervals=String(data.counts.intervals);
    renderer.domElement.dataset.intervalSegments=String(data.counts.intervalSegments);
    scene.add(new THREE.HemisphereLight('#ffffff','#53616d',1));const light=new THREE.DirectionalLight('#ffffff',.65);light.position.set(1,2,1);scene.add(light);
    const center=data.bounds.min.map((v,i)=>v/2+data.bounds.max[i]/2),cv=p=>new THREE.Vector3(p[0]-center[0],p[2]-center[2],-(p[1]-center[1]));
    const point=p=>cv([p.x,p.y,p.z]),fullSpan=Math.max(...extents,1);
    let span=fullSpan,baseRadius=Math.max(.025,fullSpan*.004),radiusMultiplier=1,yaw=.65,pitch=.35,distance=fullSpan*1.9,target=new THREE.Vector3();
    const cylinder=new THREE.CylinderGeometry(1,1,1,8,1,false),sphere=new THREE.SphereGeometry(1,10,8);
    const tubeMaterial=new THREE.MeshLambertMaterial({color:'#ffffff'}),collarMaterial=new THREE.MeshLambertMaterial({color:'#e48b12'}),lineMaterial=new THREE.LineBasicMaterial({color:'#607483'});
    const up=new THREE.Vector3(0,1,0),direction=new THREE.Vector3(),midpoint=new THREE.Vector3(),scale=new THREE.Vector3(),quaternion=new THREE.Quaternion(),matrix=new THREE.Matrix4();
    function updateCamera(){camera.position.set(target.x+distance*Math.cos(pitch)*Math.sin(yaw),target.y+distance*Math.sin(pitch),target.z+distance*Math.cos(pitch)*Math.cos(yaw));camera.near=Math.max(.0001,distance/10000);camera.far=Math.max(fullSpan*100,distance*100);camera.lookAt(target);camera.updateProjectionMatrix();}
    function draw(){if(disposed||!box.isConnected)return;const w=Math.max(100,box.clientWidth),h=Math.max(160,box.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;updateCamera();updateLabelScale();renderer.render(scene,camera);}
    function schedule(){if(disposed||frame)return;frame=requestAnimationFrame(()=>{frame=0;draw();});}
    function disposeLabels(){if(!labels)return;scene.remove(labels);for(const child of labels.children){child.material.map?.dispose();child.material.dispose();}labels=null;}
    function makeLabels(){
      disposeLabels();labels=new THREE.Group();
      if($('[data-bhpv-labels]').checked)for(const h of visible.slice(0,200)){
        const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;const c=canvas.getContext('2d');c.fillStyle='rgba(255,255,255,.9)';c.fillRect(0,0,256,64);c.font='bold 28px sans-serif';c.fillStyle='#173348';c.textAlign='center';c.textBaseline='middle';c.fillText(h.id.length>22?h.id.slice(0,21)+'…':h.id,128,32,245);
        const texture=new THREE.CanvasTexture(canvas),sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.userData.anchor=cv(h.collar);sprite.userData.holeIndex=h.index;labels.add(sprite);
      }scene.add(labels);
    }
    function updateLabelScale(){
      // Identificações são anotações, não geometria: mantenha texto legível
      // ao enquadrar campanhas grandes ou um único collar sem profundidade.
      if(!labels)return;const height=2*distance*Math.tan(camera.fov*Math.PI/360)*28/Math.max(160,box.clientHeight);
      for(const sprite of labels.children){sprite.position.copy(sprite.userData.anchor);sprite.position.y+=baseRadius*3+height*.7;sprite.scale.set(height*4,height,1);}
    }
    function tubeMatrix(segment,radius){const a=cv(segment.a),b=cv(segment.b);direction.subVectors(b,a);const length=Math.hypot(direction.x,direction.y,direction.z);if(!Number.isFinite(length)||length===0)throw new Error('Trecho de sondagem sem comprimento XYZ representável; confira a trajetória e o CRS.');direction.set(direction.x/length,direction.y/length,direction.z/length);quaternion.setFromUnitVectors(up,direction);midpoint.addVectors(a,b).multiplyScalar(.5);scale.set(radius,length,radius);matrix.compose(midpoint,quaternion,scale);return matrix;}
    function thickness(){
      const radius=baseRadius*radiusMultiplier;$('[data-bhpv-size]').textContent=number(radius*2)+' m no modelo';
      if(tubes){for(let i=0;i<segmentRefs.length;i++)tubes.setMatrixAt(i,tubeMatrix(segmentRefs[i].segment,radius));tubes.instanceMatrix.needsUpdate=true;}
      if(collars){visible.forEach((h,i)=>{const p=cv(h.collar);matrix.makeScale(radius*1.7,radius*1.7,radius*1.7);matrix.setPosition(p);collars.setMatrixAt(i,matrix);});collars.instanceMatrix.needsUpdate=true;}
      schedule();
    }
    function clearDrawables(){
      if(lines){scene.remove(lines);lines.geometry.dispose();lines=null;}
      if(tubes){scene.remove(tubes);tubes.dispose?.();tubes=null;}
      if(collars){scene.remove(collars);collars.dispose?.();collars=null;}
      disposeLabels();clearHighlight();segmentRefs=[];
    }
    function clearHighlight(){if(highlight){scene.remove(highlight);highlight.geometry.dispose();highlight.material.dispose();highlight=null;}}
    function attributesDetails(attributes){
      const keys=Object.keys(attributes||{});if(!keys.length)return '';
      return '<details><summary>Atributos de origem</summary><dl>'+keys.map(key=>'<dt>'+esc(key)+'</dt><dd>'+esc(attributes[key]!==null&&typeof attributes[key]==='object'?JSON.stringify(attributes[key]):attributes[key])+'</dd>').join('')+'</dl></details>';
    }
    function showInterval(hole,intervalIndex){
      const interval=hole.intervals[intervalIndex];if(!interval)return showHole(hole);
      selectedHole=hole;selectedInterval=intervalIndex;clearHighlight();
      const positions=new Float32Array(interval.segments.length*6);interval.segments.forEach((s,i)=>{cv(s.a).toArray(positions,i*6);cv(s.b).toArray(positions,i*6+3);});
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));highlight=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:'#ff3819',depthTest:false}));highlight.renderOrder=10;scene.add(highlight);
      const original=parsed.holes[hole.index].geologyLog?.[interval.sourceIndex]||{};
      inspector.innerHTML=`<strong>${esc(hole.id)}</strong><p>MD ${number(interval.from)}–${number(interval.to)} m<br>Litologia: <b>${esc(interval.lithology)}</b></p><p>${esc(original.source?.table||'Tabela de litologia')}${original.source?.row?' · linha '+esc(original.source.row):''}</p>`;
      inspector.insertAdjacentHTML('beforeend',attributesDetails(original.attributes));
      if($('[data-bhpv-hole]').value===String(hole.index))$('[data-bhpv-interval]').value=String(intervalIndex);
      schedule();
    }
    function showHole(hole){
      selectedHole=hole;selectedInterval=null;clearHighlight();const original=parsed.holes[hole.index],assay=(original.tables||[]).filter(t=>t.role==='assay').reduce((n,t)=>n+(t.intervals?.length||0),0);
      inspector.innerHTML=`<strong>${esc(hole.id)}</strong><p>X ${number(hole.collar[0])} · Y ${number(hole.collar[1])}<br>Cota da boca ${number(hole.collar[2])} m<br>${hole.depth==null?'Profundidade não informada — somente boca.':'Profundidade MD '+number(hole.depth)+' m'}</p><p>${original.survey?.length||0} estação(ões) survey · ${hole.intervals.length} intervalo(s) litológico(s) · ${assay} intervalo(s) de análise.</p><p class="gm-bhpv-note">Assay é preservado como análise, sem interpretação automática como litologia.</p>`;
      inspector.insertAdjacentHTML('beforeend',attributesDetails(original.attributes));
      if($('[data-bhpv-hole]').value===String(hole.index))$('[data-bhpv-interval]').value='';schedule();
    }
    function legend(){
      const entries=new Map();let count=0,segments=0,traceCount=0;for(const h of visible){traceCount+=Math.max(0,h.trace.length-1);for(const interval of h.intervals){count++;segments+=interval.segments.length;entries.set(interval.lithology,(entries.get(interval.lithology)||0)+1);}}
      $('.gm-bhpv-counts').textContent=visible.length+' furo(s) · '+traceCount+' trecho(s) de trajetória · '+count+' intervalo(s) com litologia'+(visible.length>200?' · rótulos limitados aos primeiros 200; use o seletor para identificar qualquer furo.':'');
      $('.gm-bhpv-legend').innerHTML=[...entries].map(([label,n])=>`<span><i style="background:${colorOf(label)}"></i>${esc(label)} <small>(${n})</small></span>`).join('')||'<p>Sem litologia informada. Apenas as trajetórias/bocas são mostradas.</p>';
      renderer.domElement.dataset.visibleHoles=String(visible.length);renderer.domElement.dataset.visibleIntervals=String(count);renderer.domElement.dataset.visibleIntervalSegments=String(segments);
    }
    function fit(){
      const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const h of visible)for(const p of h.trace){[p.x,p.y,p.z].forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v);});}
      target.copy(cv(min.map((v,i)=>v/2+max[i]/2)));span=Math.max(Math.hypot(...max.map((v,i)=>v-min[i])),1);const aspect=Math.max(.1,box.clientWidth/Math.max(1,box.clientHeight));distance=span*1.12/(2*Math.tan(camera.fov*Math.PI/360)*Math.min(1,aspect));makeLabels();schedule();
    }
    function render(){
      clearDrawables();let traceSegments=0;for(const h of visible)traceSegments+=Math.max(0,h.trace.length-1);
      const positions=new Float32Array(traceSegments*6);let k=0;
      for(const h of visible){for(let i=1;i<h.trace.length;i++){point(h.trace[i-1]).toArray(positions,k);point(h.trace[i]).toArray(positions,k+3);k+=6;}for(let ii=0;ii<h.intervals.length;ii++)for(const segment of h.intervals[ii].segments)segmentRefs.push({hole:h,intervalIndex:ii,segment});}
      geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));lines=new THREE.LineSegments(geometry,lineMaterial);scene.add(lines);
      if(segmentRefs.length){tubes=new THREE.InstancedMesh(cylinder,tubeMaterial,segmentRefs.length);tubes.frustumCulled=false;segmentRefs.forEach((entry,i)=>tubes.setColorAt(i,new THREE.Color(colorOf(entry.hole.intervals[entry.intervalIndex].lithology))));tubes.instanceColor.needsUpdate=true;scene.add(tubes);}
      collars=new THREE.InstancedMesh(sphere,collarMaterial,visible.length);collars.frustumCulled=false;scene.add(collars);legend();thickness();fit();
    }
    function chooseHole(value){
      const hole=value==='all'?null:data.holes.find(h=>String(h.index)===String(value));visible=hole?[hole]:data.holes;selectedHole=hole;selectedInterval=null;
      const select=$('[data-bhpv-interval]');select.innerHTML=hole?'<option value="">Boca e dados do furo</option>'+hole.intervals.slice(0,1000).map((row,i)=>`<option value="${i}">${number(row.from)}–${number(row.to)} m · ${esc(row.lithology)}</option>`).join(''):'<option value="">Selecione um furo acima</option>';select.disabled=!hole;
      if(hole){showHole(hole);if(hole.intervals.length>1000)inspector.insertAdjacentHTML('beforeend','<p>O seletor lista os primeiros 1.000 intervalos. Todos são desenhados e podem ser consultados pelo clique.</p>');}else inspector.textContent='Todos os furos estão combinados na mesma escala. Clique em uma boca ou intervalo para consultar.';
      render();
    }
    const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();
    function pick(event){const rect=renderer.domElement.getBoundingClientRect();mouse.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);updateCamera();scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);raycaster.setFromCamera(mouse,camera);
      const hits=raycaster.intersectObjects([collars,tubes].filter(Boolean),false),hit=hits[0];if(!hit)return;
      if(hit.object===collars)showHole(visible[hit.instanceId]);else {const entry=segmentRefs[hit.instanceId];if(entry)showInterval(entry.hole,entry.intervalIndex);}
    }
    const pointers=new Map();let drag=null,pinch=null;
    function pinchState(){const p=[...pointers.values()];return p.length<2?null:{distance:Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y),x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2};}
    function pan(dx,dy){const factor=distance/Math.max(100,box.clientHeight);target.x-=dx*factor*Math.cos(yaw);target.z+=dx*factor*Math.sin(yaw);target.y+=dy*factor;}
    box.oncontextmenu=e=>e.preventDefault();
    box.onpointerdown=e=>{e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});box.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,button:e.button,moved:false};pinch=pinchState();};
    box.onpointermove=e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const next=pinchState();if(next&&pinch){if(pinch.distance>0&&next.distance>0)distance=Math.max(span*.025,Math.min(fullSpan*100,distance*pinch.distance/next.distance));pan(next.x-pinch.x,next.y-pinch.y);pinch=next;if(drag)drag.moved=true;schedule();return;}if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>4)drag.moved=true;if(drag.button===2||e.shiftKey)pan(dx,dy);else {yaw-=dx*.008;pitch=Math.max(-1.52,Math.min(1.52,pitch+dy*.008));}drag.x=e.clientX;drag.y=e.clientY;schedule();};
    box.onpointerup=e=>{const click=drag&&!drag.moved&&pointers.size===1&&drag.button===0;pointers.delete(e.pointerId);pinch=pinchState();drag=null;if(click)pick(e);};
    box.onpointercancel=e=>{pointers.delete(e.pointerId);drag=null;pinch=null;};
    const wheel=e=>{e.preventDefault();distance=Math.max(span*.025,Math.min(fullSpan*100,distance*Math.exp(e.deltaY*.001)));schedule();};box.addEventListener('wheel',wheel,{passive:false});
    $('[data-bhpv-hole]').onchange=e=>chooseHole(e.target.value);$('[data-bhpv-fit]').onclick=fit;$('[data-bhpv-radius]').oninput=e=>{radiusMultiplier=Number(e.target.value)||1;thickness();};$('[data-bhpv-labels]').onchange=()=>{makeLabels();schedule();};
    $('[data-bhpv-interval]').onchange=e=>{if(!selectedHole)return;e.target.value===''?showHole(selectedHole):showInterval(selectedHole,Number(e.target.value));};
    const lost=e=>{e.preventDefault();inspector.textContent='A sessão gráfica foi interrompida. Clique novamente em Conferir trajetórias em 3D para reabrir a prévia.';};renderer.domElement.addEventListener('webglcontextlost',lost);
    function dispose(){if(disposed)return;disposed=true;if(frame)cancelAnimationFrame(frame);frame=0;observer?.disconnect();removalObserver?.disconnect();box.removeEventListener('wheel',wheel);box.onpointerdown=box.onpointermove=box.onpointerup=box.onpointercancel=box.oncontextmenu=null;renderer.domElement.removeEventListener('webglcontextlost',lost);clearDrawables();cylinder.dispose();sphere.dispose();tubeMaterial.dispose();collarMaterial.dispose();lineMaterial.dispose();renderer.dispose();renderer.forceContextLoss();if(host.__gmBoreholePreviewDispose===dispose){delete host.__gmBoreholePreviewDispose;root.remove();}}
    host.__gmBoreholePreviewDispose=dispose;
    dispose.controller={data,scene,camera,renderer,selectHole(index){if(disposed)return;$('[data-bhpv-hole]').value=index==null?'all':String(index);chooseHole(index==null?'all':String(index));},inspect(holeIndex,intervalIndex){if(disposed)return;const h=data.holes.find(h=>h.index===holeIndex);if(h)intervalIndex==null?showHole(h):showInterval(h,intervalIndex);},render:draw,disposed:()=>disposed};
    try{chooseHole('all');observer=new ResizeObserver(schedule);observer.observe(box);removalObserver=new MutationObserver(()=>{if(!host.isConnected||!root.isConnected)dispose();});removalObserver.observe(document.body,{childList:true,subtree:true});draw();host.scrollIntoView?.({block:'nearest',inline:'nearest'});}catch(e){dispose();throw e;}
    return dispose;
  }
  api.boreholePreview={open,limits};
})();
