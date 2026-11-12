/* Blasting presentation and lossless data package. The drill engine owns all
   calculations; this module reads ordinary GeoMine vectors without changing
   their coordinates, depth or angular conventions. */
(function(root){
  'use strict';
  const ROLES=new Set(['collar','trace','toe','nodata']);
  const state={xray:true,viewSerial:0,planProject:null,perspectiveCamera:null,perspectivePose:null};
  const clone=value=>JSON.parse(JSON.stringify(value));
  const app=()=>typeof S!=='undefined'?S:root.S;
  const scene=()=>typeof V3!=='undefined'?V3:root.V3;
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function isLayer(layer){return !!(layer?._blasting?.version===1&&ROLES.has(layer._blasting.role)&&layer._blasting.batchId!=null);}
  function batchLayers(batch){
    const layers=(app()?.layers||[]).filter(isLayer);
    const requested=typeof batch==='string'||typeof batch==='number'?batch:batch?.batchId??batch?.id;
    const id=requested??layers[0]?._blasting.batchId;
    if(id==null)throw Error('Gere uma malha Blasting antes de abrir ou exportar os furos.');
    const found=layers.filter(layer=>String(layer._blasting.batchId)===String(id));
    if(!found.length)throw Error('O lote Blasting não está mais neste projeto.');
    return {id,layers:found};
  }
  function vectorZ(feature,point,index,part){
    const raw=part==null?feature.zg:feature.zg?.[part],stored=Array.isArray(raw)?raw[index]:null,
      embedded=point.length>2?point[2]:null;
    if(finite(stored)&&finite(embedded)&&Math.abs(stored-embedded)>1e-7)
      throw Error('Há duas cotas diferentes no mesmo vértice Blasting. Confira XYZ e zg antes de exportar.');
    const z=finite(stored)?stored:embedded;
    if(!finite(z))throw Error('Há um furo sem XYZ completo. Regere ou corrija sua geometria antes de exportar.');
    return z;
  }
  function partsOf(layer,feature){
    if(!Array.isArray(feature.geom))throw Error('Geometria Blasting inválida.');
    if(layer.gtype==='point')return [{points:feature.geom,part:null}];
    const nested=Array.isArray(feature.geom[0]?.[0]);
    return nested?feature.geom.map((points,part)=>({points,part})):[{points:feature.geom,part:null}];
  }
  function sourcePoints(layer,feature){
    return partsOf(layer,feature).map(({points,part})=>points.map((point,index)=>{
      if(!Array.isArray(point)||!finite(point[0])||!finite(point[1]))throw Error('Coordenada XY Blasting inválida.');
      return layer._blasting.role==='nodata'?[point[0],point[1]]:[point[0],point[1],vectorZ(feature,point,index,part)];
    }));
  }
  function csvCell(value){
    if(value==null)return '';
    const text=typeof value==='object'?JSON.stringify(value):String(value);
    return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;
  }
  function csv(rows,headers){
    const keys=headers||[...new Set(rows.flatMap(row=>Object.keys(row||{})))];
    return '\ufeff'+[keys.map(csvCell).join(','),...rows.map(row=>keys.map(key=>csvCell(row?.[key])).join(','))].join('\r\n')+'\r\n';
  }
  function pointRows(layers){
    const rows=[];
    for(const layer of layers)for(const [index,feature] of (layer.features||[]).entries()){
      const parts=sourcePoints(layer,feature);
      for(const points of parts)for(const point of points)rows.push({...clone(feature.props||{}),
        GEOM_E:point[0],GEOM_N:point[1],GEOM_Z:point.length>2?point[2]:null,
        GEOM_CRS:layer.crs,CAMADA:layer.name,INDICE_FEICAO:index});
    }
    return rows;
  }
  function geoJSON(layer){
    if(typeof root.proj4!=='function')throw Error('Conversor de coordenadas indisponível para exportar GeoJSON.');
    let convert;try{convert=root.proj4(layer.crs,'EPSG:4326');}catch(_){throw Error('CRS Blasting inválido: '+layer.crs+'.');}
    const toWGS=point=>{
      let xy;try{xy=convert.forward(point.slice(0,2));}catch(_){throw Error('Não foi possível reprojetar o lote para GeoJSON.');}
      if(!xy||!finite(xy[0])||!finite(xy[1])||Math.abs(xy[0])>180||Math.abs(xy[1])>90)
        throw Error('Reprojeção Blasting inválida. Confira o CRS e as unidades.');
      return point.length>2?[xy[0],xy[1],point[2]]:[xy[0],xy[1]];
    };
    return {type:'FeatureCollection',name:layer.name,sourceCRS:layer.crs,
      coordinateReference:'WGS 84 longitude/latitude; Z preservado nas unidades verticais de origem',
      features:(layer.features||[]).map((feature,index)=>{
        const parts=sourcePoints(layer,feature).map(points=>points.map(toWGS));let geometry;
        if(layer.gtype==='point')geometry=parts[0].length===1?{type:'Point',coordinates:parts[0][0]}:{type:'MultiPoint',coordinates:parts[0]};
        else if(layer.gtype==='line')geometry=parts.length===1?{type:'LineString',coordinates:parts[0]}:{type:'MultiLineString',coordinates:parts};
        else throw Error('Papel Blasting com tipo geométrico incompatível.');
        return {type:'Feature',id:index,geometry,properties:clone(feature.props||{})};
      })};
  }
  function originalExports(layers){
    const result={};
    // The engine exports are opaque source data. Do not reinterpret survey
    // inclination, infer stations, or rename original columns here.
    for(const layer of layers){
      const meta=layer._blasting,stores=[meta.exports,meta.engine?.exports,meta.engine,meta];
      for(const store of stores){
        if(!store||typeof store!=='object')continue;
        for(const role of ['collar','survey']){
          const text=store[role+'CSV']??store[role+'Csv'];
          const rows=store[role+'Rows']??store[role];
          if(result[role]==null&&typeof text==='string'&&text.trim())result[role]=text;
          else if(result[role]==null&&Array.isArray(rows)&&rows.every(row=>row&&typeof row==='object'&&!Array.isArray(row)))result[role]=csv(rows);
        }
      }
    }
    return result;
  }
  function buildPackage(batch){
    const {id,layers}=batchLayers(batch),files={},warnings=[],byRole=role=>layers.filter(layer=>layer._blasting.role===role);
    for(const [role,file] of [['collar','colares_xyz.csv'],['toe','pes_xyz.csv'],['nodata','pontos_sem_cota.csv']]){
      const selected=byRole(role);if(selected.length)files[file]=csv(pointRows(selected));
    }
    const originals=originalExports(layers);
    for(const role of ['collar','survey']){
      if(originals[role]!=null)files[role+'_blastpal_original.csv']=originals[role];
      else warnings.push('O lote não contém o CSV '+role+' original do mecanismo BlastPal. Nenhum registro foi inferido.');
    }
    const counts={};
    for(const [role,name] of [['collar','colares'],['trace','trajetorias'],['toe','pes'],['nodata','pontos_sem_cota']]){
      const selected=byRole(role);counts[role]=selected.reduce((n,layer)=>n+(layer.features||[]).length,0);
      selected.forEach((layer,index)=>{files[name+(selected.length>1?'_'+(index+1):'')+'.geojson']=JSON.stringify(geoJSON(layer),null,2);});
    }
    files['metadados_e_coordenadas_originais.json']=JSON.stringify({version:1,batchId:id,exportedAt:new Date().toISOString(),
      counts,warnings,geoJSONCRS:'EPSG:4326',originalCoordinates:'As geometrias abaixo e os CSV XYZ mantêm o CRS de cada camada; Z não é transformado.',
      layers:layers.map(layer=>({id:layer.id,name:layer.name,gtype:layer.gtype,crs:layer.crs,fields:clone(layer.fields||[]),
        blasting:clone(layer._blasting),features:clone(layer.features||[])}))},null,2);
    files['LEIA-ME.txt']='GeoMine Blasting\r\n'+
      'Os CSV XYZ e o JSON de metadados preservam as coordenadas no CRS original de cada camada.\r\n'+
      'GeoJSON usa longitude/latitude WGS 84 e mantém as cotas Z de origem.\r\n'+
      'CSV BlastPal original: colunas, profundidade e inclinação mantidas exatamente como fornecidas pelo mecanismo.\r\n'+
      'Pontos sem cota têm somente XY: não representam furos gerados e não recebem pé, trajetória ou Z.\r\n'+
      'A visualização em raio X não muda a geometria dos furos nem a topografia.\r\n'+warnings.map(w=>'AVISO: '+w+'\r\n').join('');
    return {batchId:id,files,warnings,counts,layers};
  }
  async function exportData(batch){
    if(typeof root.JSZip!=='function')throw Error('Compactador ZIP indisponível.');
    const data=buildPackage(batch),S0=app(),project=S0.projectId,
      stamps=data.layers.map(layer=>({layer,stamp:JSON.stringify([layer.name,layer.crs,layer.fields,layer.features,layer._blasting])})),zip=new root.JSZip();
    Object.entries(data.files).forEach(([name,text])=>zip.file(name,text));
    const blob=await zip.generateAsync({type:'blob'});
    if(app()!==S0||S0.projectId!==project||stamps.some(({layer,stamp})=>!S0.layers.includes(layer)||JSON.stringify([layer.name,layer.crs,layer.fields,layer.features,layer._blasting])!==stamp))
      throw Error('O lote mudou durante a exportação. Exporte novamente.');
    const filename='Blasting_'+String(data.batchId).replace(/[^\w.-]+/g,'_')+'.zip';
    if(typeof root.download!=='function')throw Error('Gravador de arquivos indisponível.');
    const saved=await root.download(blob,filename,{reportResult:true}),status=saved===false?'canceled':saved?.status||'requested';
    if(status==='canceled'){
      root.toast?.('Exportação Blasting cancelada.');
      return {batchId:data.batchId,filename,counts:data.counts,warnings:data.warnings,canceled:true,status};
    }
    const notice=status==='written'?'ZIP Blasting gravado.':status==='shared'?'Pacote ZIP Blasting encaminhado para o compartilhamento.':
      status==='download-requested'?'Download do ZIP Blasting iniciado.':'Exportação do ZIP Blasting solicitada.';
    root.toast?.(notice+(data.warnings.length?' Consulte os avisos no LEIA-ME.':''));
    return {batchId:data.batchId,filename,counts:data.counts,warnings:data.warnings,status,verified:saved?.verified};
  }
  function note(group){
    const wrap=document.getElementById('v3dCanvasWrap');if(!wrap)return;
    let badge=document.getElementById('gmBlasting3DNotice');
    const visible=state.xray&&group?.children.some(object=>{
      const id=object.userData?.layerId;return object.visible!==false&&(app()?.layers||[]).some(layer=>isLayer(layer)&&layer.visible!==false&&String(layer.id)===String(id));
    });
    if(!visible){badge?.remove();return;}
    if(!badge){badge=document.createElement('div');badge.id='gmBlasting3DNotice';badge.setAttribute('role','status');
      badge.style.cssText='position:absolute;left:12px;top:12px;z-index:10;max-width:360px;padding:6px 9px;background:rgba(255,255,255,.92);color:#17425a;border:1px solid #8da9b7;border-radius:5px;font:11px/1.4 sans-serif;pointer-events:none';wrap.appendChild(badge);}
    badge.textContent='Blasting · raio X visual: furos visíveis através do terreno. XYZ preservado.';
  }
  function decorate3D(group){
    if(!group)return 0;
    const layers=new Map((app()?.layers||[]).filter(isLayer).map(layer=>[String(layer.id),layer]));let count=0;
    for(const parent of group.children){
      const layer=layers.get(String(parent.userData?.layerId));if(!layer||layer._blasting.role==='nodata')continue;
      parent.traverse(object=>{
        const materials=object.material?(Array.isArray(object.material)?object.material:[object.material]):[];
        if(!materials.length)return;
        object.userData=object.userData||{};
        if(object.userData._blastingOriginalOrder==null)object.userData._blastingOriginalOrder=object.renderOrder||0;
        object.renderOrder=state.xray?1000:object.userData._blastingOriginalOrder;
        for(const material of materials){
          if(material._blastingDepthTest==null)material._blastingDepthTest=material.depthTest!==false;
          material.depthTest=state.xray?false:material._blastingDepthTest;material.needsUpdate=true;
        }
        count++;
      });
    }
    note(group);return count;
  }
  function setXray(enabled){
    state.xray=!!enabled;const v=scene();decorate3D(v?.vecGroup);
    if(v?.ren&&v.scene&&v.cam)v.ren.render(v.scene,v.cam);
    return state.xray;
  }
  function leavePlan(){
    const v=scene();if(!v?.cam?._blastingPlan)return false;
    v.cam=state.perspectiveCamera||new root.THREE.PerspectiveCamera(55,v.cam.aspect||1,.01,1000000);
    const pose=state.perspectivePose;
    v.topNorth=false;v.theta=pose?.theta??Math.PI*.75;v.phi=pose?.phi??Math.PI*.22;
    if(pose?.radius>0)v.radius=pose.radius;
    state.planProject=null;state.perspectiveCamera=null;state.perspectivePose=null;
    return true;
  }
  function applyPlanCamera(v){
    if(!v?.cam?._blastingPlan)return false;
    if(state.planProject!==app()?.projectId){leavePlan();return false;}
    const camera=v.cam,aspect=camera.aspect||1,half=Math.max(.01,v.radius),
      distance=Math.max(100,4*(v.size||1),4*half);
    camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;
    camera.near=.01;camera.far=Math.max(1000000,distance*100);camera.zoom=1;
    camera.up.set(0,0,-1);camera.position.set(v.tgt[0],v.tgt[1]+distance,v.tgt[2]);
    camera.lookAt(v.tgt[0],v.tgt[1],v.tgt[2]);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    v.topNorth=true;return true;
  }
  function resetProject(){
    state.viewSerial++;leavePlan();state.xray=true;
    document.getElementById('gmBlasting3DNotice')?.remove();
  }
  function enterPlan(layers){
    const v=scene();if(!v?.cam||!root.THREE)throw Error('A cena 3D precisa estar disponível para abrir a planta.');
    const extent=batchBounds(layers.filter(layer=>layer._blasting.role!=='nodata')),aspect=v.cam.aspect||1;
    if(!v.cam._blastingPlan){
      state.perspectiveCamera=v.cam;state.perspectivePose={theta:v.theta,phi:v.phi,radius:v.radius};
      const camera=new root.THREE.OrthographicCamera(-1,1,1,-1,.01,1000000);camera.aspect=aspect;camera._blastingPlan=true;v.cam=camera;
    }
    state.planProject=app().projectId;
    v.tgt=[(extent.xmin+extent.xmax)/2-v._ctx.OX,v.tgt[1],-((extent.ymin+extent.ymax)/2-v._ctx.OY)];
    const dx=extent.xmax-extent.xmin,dy=extent.ymax-extent.ymin;
    // Leave space for the native command dock and the 3D controls so the
    // first/last rows remain visible when opening the plan.
    v.size=Math.max(dx,dy,10);v.radius=Math.max(2,dy/2,dx/(2*aspect))*1.4;
    applyPlanCamera(v);
  }
  function fitMap(layers){
    if(typeof L2==='undefined'||typeof layerBounds!=='function'||typeof safeFit!=='function')return;
    const bounds=L2.latLngBounds([]);layers.forEach(layer=>{const extent=layerBounds(layer);if(extent?.isValid())bounds.extend(extent);});
    if(bounds.isValid())safeFit(bounds.pad(.12));
  }
  function batchBounds(layers){
    const work=app().workCRS,bounds={xmin:Infinity,ymin:Infinity,xmax:-Infinity,ymax:-Infinity};
    for(const layer of layers){
      let converter=null;if(layer.crs!==work){try{converter=root.proj4(layer.crs,work);}catch(_){throw Error('Não foi possível conferir o CRS da prancha Blasting.');}}
      for(const feature of layer.features||[])for(const points of sourcePoints(layer,feature))for(const point of points){
        const xy=converter?converter.forward(point.slice(0,2)):point;
        if(!xy||!finite(xy[0])||!finite(xy[1]))throw Error('Enquadramento Blasting com coordenadas inválidas.');
        bounds.xmin=Math.min(bounds.xmin,xy[0]);bounds.ymin=Math.min(bounds.ymin,xy[1]);
        bounds.xmax=Math.max(bounds.xmax,xy[0]);bounds.ymax=Math.max(bounds.ymax,xy[1]);
      }
    }
    if(!finite(bounds.xmin))throw Error('O lote Blasting não contém geometrias para a prancha.');
    return bounds;
  }
  async function layoutView(id,layers){
    if(typeof root.plateNew!=='function'||typeof root.plateGo!=='function'||typeof root.layoutVisSnapshot!=='function'||
      typeof root.layoutConventionSnapshot!=='function'||typeof root.buildLayout!=='function')
      throw Error('O módulo nativo de pranchas não está disponível.');
    root.switchView('map');fitMap(layers);root.platesInit?.();
    const current=app();let plate=(current.plates||[]).find(item=>String(item._blastingBatchId)===String(id)),created=false;
    if(!plate){
      created=true;
      const extent=batchBounds(layers),vis=root.layoutVisSnapshot(),conventions=root.layoutConventionSnapshot(),stack=(current.stack||[]).slice();
      // A dedicated native page leaves the user's existing frozen sheets
      // intact. Its visibility can exclude other drilling batches without
      // hiding them permanently in the 2D project.
      for(const layer of current.layers||[])if(isLayer(layer)&&String(layer._blasting.batchId)!==String(id))vis['L:'+layer.id]=false;
      plate=root.plateNew('Blasting '+String(id));plate._blastingBatchId=id;
      plate.vis=clone(vis);plate.conv=clone(conventions);plate.stack=stack;plate.legendVis={};
      plate.center=[(extent.xmin+extent.xmax)/2,(extent.ymin+extent.ymax)/2];
      plate.groups=(current.groups||[]).map(group=>({id:group.id,collapsed:!!group.collapsed}));
      plate.f=plate.f||{};plate.c=plate.c||{};
      const paper=plate.f.loSeloPaper||document.getElementById('loSeloPaper')?.value||'a4p',
        sizes=typeof PAPER!=='undefined'?PAPER:{a4p:[210,297],a4l:[297,210],a3p:[297,420],a3l:[420,297]},size=sizes[paper]||sizes.a4p,
        required=Math.max(50,(extent.xmax-extent.xmin)*1200/Math.max(60,size[0]-55),(extent.ymax-extent.ymin)*1200/Math.max(60,size[1]-110)),
        scale=typeof root.niceScale==='function'?root.niceScale(required):Math.ceil(required/10)*10;
      plate.f.loSeloPaper=paper;plate.f.loScale=String(scale);plate.f.loArea='BLASTING · '+String(id);
      plate.c.loScaleAuto=false;
    }
    current.loMode='a4';
    // Enter before applying the new page: switchView captures the original
    // 2D visibility/stack, which it must restore when leaving the Layout.
    root.switchView('layout');root.plateGo(plate.id);
    if(current.plateId===plate.id&&typeof root.plateApply==='function')root.plateApply(plate);
    root.syncLoBtns?.();root.renderPlateTabs?.();await root.buildLayout();
    if(created&&typeof root.fitLoZoom==='function')root.fitLoZoom();
    return true;
  }
  async function view(name,batch){
    const requested=String(name||'2d').toLowerCase();
    if(!['2d','3d','plan','layout'].includes(requested))throw Error('Vista Blasting desconhecida.');
    const {id,layers}=batchLayers(batch),current=app(),project=current.projectId,serial=++state.viewSerial;
    if(typeof root.switchView!=='function')throw Error('Navegação de vistas indisponível.');
    if(requested==='2d'){root.switchView('map');fitMap(layers);return true;}
    if(requested==='layout')return layoutView(id,layers);
    if(!layers.some(layer=>layer.visible!==false&&layer._blasting.role!=='nodata'&&(layer.features||[]).length))
      throw Error('Ligue uma camada de furos com XYZ válido. Pontos sem cota ficam identificados apenas no mapa 2D.');
    if(requested==='3d')leavePlan();
    state.xray=true;root.switchView('v3d');
    if(typeof root.mina3DAuto==='function')root.mina3DAuto(true);
    else if(typeof root.build3D==='function')await root.build3D();
    const started=Date.now();let ready=false;
    while(Date.now()-started<60000){
      if(serial!==state.viewSerial||app()!==current||current.projectId!==project||current._view!=='v3d')return false;
      const v=scene(),busy=typeof MINA3D_AUTO!=='undefined'&&MINA3D_AUTO.running;
      const failure=document.getElementById('mina3dStatus')?.textContent||'';
      if(!busy&&/^A cena 3D não carregou:/i.test(failure))throw Error(failure);
      if(Date.now()-started>220&&!busy&&v?.scene&&v.cam&&v.vecGroup?.children.some(object=>layers.some(layer=>String(layer.id)===String(object.userData?.layerId)))){ready=true;break;}
      await wait(60);
    }
    if(!ready)throw Error('A cena 3D não ficou disponível. Confira o aviso da Vista 3D e a aceleração gráfica do navegador.');
    if(requested==='3d'){
      const v=scene();v.topNorth=false;
      if(typeof root.v3ApplyCam==='function')root.v3ApplyCam();
    }
    const chosen=layers.find(layer=>layer._blasting.role==='trace'&&layer.visible!==false)||layers.find(layer=>layer._blasting.role==='collar'&&layer.visible!==false);
    if(requested==='plan')enterPlan(layers);
    else if(chosen&&typeof root.v3ZoomCamadaAtiva==='function'){
      const active=current.activeId,raster=current.selRaster;current.activeId=chosen.id;current.selRaster=null;
      try{root.v3ZoomCamadaAtiva();}finally{current.activeId=active;current.selRaster=raster;}
    }
    setXray(true);
    root.toast?.(requested==='plan'?'Blasting em planta ortográfica · norte para cima · raio X visual.':'Blasting 3D · raio X visual permite conferir todos os furos ligados, trajetórias e pés sob o terreno.');
    return true;
  }
  root.GeoMineBlastingPresentation=Object.freeze({view,exportData,setXray,decorate3D,applyPlanCamera,resetProject,
    get xray(){return state.xray;},__test:Object.freeze({buildPackage,geoJSON,csv,sourcePoints,batchLayers,batchBounds})});
})(typeof window!=='undefined'?window:globalThis);
