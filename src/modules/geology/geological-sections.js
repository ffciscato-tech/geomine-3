/* GeoMine — Seções geológicas
   Módulo independente: usa a superfície/perfil existente, mas mantém
   interpretação e persistência separadas de S.prof. */
(function(){
  'use strict';

  const TOOL='geoSection';
  const PANEL_ID='secGeoSection';
  const api=window.GeoMineGeology=window.GeoMineGeology||{};
  const workspaceSnapshot=api.snapshot,workspaceRestore=api.restore;
  let previewLayer=null;
  let cursorLine=null;
  let boundMap=null;

  function esc(v){
    return String(v==null?'':v).replace(/[&<>"']/g,c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[c]);
  }
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function finite(v){if(v==null||String(v).trim()==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
  function norm(v){return String(v==null?'':v).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9]/g,'');}
  const copy=value=>JSON.parse(JSON.stringify(value));
  const rasterEntries=value=>api.rasterProfiles?api.rasterProfiles.normalizeEntries(value):[];
  function styleMap(value){
    const out={};if(!value||typeof value!=='object'||Array.isArray(value))return out;
    Object.keys(value).filter(key=>/^(raster|project|mesh):/.test(key)).forEach(key=>{
      out[key]=api.rasterProfiles?api.rasterProfiles.normalizeStyle(value[key]):{...value[key]};
    });return out;
  }
  const roleName=role=>role==='water'?"Nível d’água":role==='contact'?'Contato geológico':'Superfície';
  function getProp(props,names){
    props=props||{};
    const wanted=new Set(names.map(norm));
    for(const k of Object.keys(props)) if(wanted.has(norm(k)) && props[k]!=='' && props[k]!=null)
      return props[k];
    return null;
  }
  // Atributos de collars legados podem ser texto decimal em português.
  // Não aplique esta conversão às estações XYZ/MD importadas nem aceite unidades.
  function holeNumber(value){
    if(typeof value==='number')return Number.isFinite(value)?value:null;
    if(typeof value!=='string'||!value.trim())return null;
    let text=value.trim();
    if(text.includes(',')){
      if(!/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+(?:e[+-]?\d+)?$/i.test(text))return null;
      text=text.replace(/\./g,'').replace(',','.');
    }else if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text))return null;
    return finite(text);
  }
  function holeProp(L,f,canonical,aliases){
    const props=f.props||{},mapped=L._geology?.fieldMap?.[canonical];
    // Mapeamento explícito é autoritativo; não substitua valor ausente por
    // outra coluna (Cota indic, por exemplo, não é profundidade do furo).
    return mapped?props[mapped]:getProp(props,aliases||[canonical]);
  }
  function holeParts(L,f){
    if(L.gtype!=='point')return featureParts(L,f);
    const coords=[];
    (function visit(node){
      if(!Array.isArray(node)||!node.length)return;
      if(node.length>=2&&!Array.isArray(node[0])&&!Array.isArray(node[1])){coords.push(node);return;}
      node.forEach(visit);
    })(f.geom);
    const storedZ=Array.isArray(f.zg)?f.zg.flat(Infinity):[];
    // Associe Z antes de remover pontos inválidos. Um ponto descartado não
    // pode deslocar as cotas dos demais pontos da mesma feição.
    return coords.map((p,index)=>{
      if(finite(p[0])==null||finite(p[1])==null)return null;
      const z=finite(p[2])??(storedZ.length===coords.length?holeNumber(storedZ[index]):null);
      return reprojectPoint(L,[p[0],p[1],z]);
    }).filter(Boolean).map(p=>[p]);
  }
  function state(){
    S.geology=S.geology||{};
    S.geology.sections=Array.isArray(S.geology.sections)?S.geology.sections:[];
    S.geology.section=S.geology.section||{
      id:null,name:'A–B',lineWgs:[],line:null,rasterId:null,corridor:100,ve:1,step:null,
      layerIds:[],roles:{},useField:true,fieldRadius:300,fieldDepth:150,result:null
    };
    const q=S.geology.section;
    // Compatibilidade com projetos antigos: a seção sempre usa escalas
    // horizontal e vertical iguais, mesmo se o arquivo guardava ve > 1.
    q.ve=1;
    q.lineWgs=Array.isArray(q.lineWgs)?q.lineWgs:[];
    q.layerIds=Array.isArray(q.layerIds)?q.layerIds.map(String):[];
    if(q.layerSelectionSet==null)q.layerSelectionSet=q.layerIds.length>0;
    q.meshIds=Array.isArray(q.meshIds)?[...new Set(q.meshIds.map(String))]:[];
    q.rasterProfiles=rasterEntries(q.rasterProfiles);
    q.lineStyles=styleMap(q.lineStyles);
    q.projectSources=Array.isArray(q.projectSources)?[...new Set(q.projectSources.map(String))]:[];
    if(q.geologyBase==null||q.geologyBase==='')q.geologyBase=null;
    q.roles=q.roles&&typeof q.roles==='object'?q.roles:{};
    if(q.snap==null)q.snap=false;
    if(q.useField==null)q.useField=true;
    q.fieldRadius=Math.max(1,+q.fieldRadius||300);
    q.fieldDepth=Math.max(1,+q.fieldDepth||150);
    return q;
  }

  function roleForLayer(L){
    const kind=String(L&&L._geology&&L._geology.kind||'').toLowerCase();
    if(['litologia','dominio-geologico','dique'].includes(kind))return 'lithology';
    if(kind==='contato-geologico')return 'contact';
    if(kind==='falha')return 'fault';
    if(kind==='fratura')return 'fracture';
    if(kind==='veio')return 'vein';
    if(kind==='zona-cisalhamento')return 'shearzone';
    if(['sondagem','spt'].includes(kind))return 'hole';
    if(['acamamento','xistosidade','foliacao'].includes(kind))return 'structure';
    if(['afloramento','ponto-amostra','lineacao','plunging','dobra','trincheira'].includes(kind))return 'observation';
    const n=norm(L&&L.name);
    if(/CISALHAMENTO|SHEARZONE/.test(n))return 'shearzone';
    if(/FRATURA|FRACTURE/.test(n))return 'fracture';
    if(/VEIO|VEIN/.test(n))return 'vein';
    if(/FALHA|FAULT/.test(n))return 'fault';
    if(/SONDAGEM|SONDAGEM|FURO|BOREHOLE|DRILL|COLLAR|POCO/.test(n))return 'hole';
    if(/ACAMAMENTO|FOLIACAO|XISTOSIDADE|ATITUDE|STRIKE|MERGULHO/.test(n))return 'structure';
    if(/AFLORAMENTO|AMOSTRA|LINEACAO|TRINCHEIRA|OBSERVACAO/.test(n))return 'observation';
    if(L&&L.gtype==='polygon')return 'lithology';
    if(/CONTATO|HORIZONTE|ESTRAT|LITO|GEOLOG/.test(n))return 'contact';
    return L&&L.gtype==='point'?'hole':'contact';
  }
  function likelyGeological(L){
    if(isMeshLayer(L))return false;
    if(L&&L._geology&&L._geology.kind)return true;
    const n=norm(L&&L.name);
    return /FALHA|FRATURA|VEIO|VEIN|CISALHAMENTO|SOND|FURO|BOREHOLE|DRILL|COLLAR|CONTATO|HORIZONTE|ESTRAT|LITO|GEOLOG|UNIDADE|ACAMAMENTO|FOLIACAO|XISTOSIDADE|AFLORAMENTO|AMOSTRA/.test(n);
  }
  function isMeshLayer(L){return !!(L&&L._geology&&L._geology.kind==='surpac-mesh');}
  function meshSources(){
    try{return api.meshes&&typeof api.meshes.list==='function'?api.meshes.list():[];}catch(e){return [];}
  }
  function meshSections(ids,line){
    const sources=meshSources();let triangleTests=0;
    return ids.map(id=>{
      const source=sources.find(m=>String(m.id)===String(id)),item={id:String(id),name:source&&source.name||String(id),
        color:source&&source.color||'#6b8caa',polylines:[],closedSolid:false,warnings:[]};
      try{
        if(!source)throw new Error('Malha não está disponível neste projeto.');
        if(!api.meshes||typeof api.meshes.getWorkMesh!=='function'||!window.GeoMineMeshSections)throw new Error('Leitor de seções de malha indisponível.');
        const mesh=api.meshes.getWorkMesh(id),cost=(mesh.faces&&mesh.faces.length||0)*Math.max(1,line.length-1);
        if(triangleTests+cost>10000000)throw new Error('Corte excede o limite seguro de complexidade. Selecione menos malhas ou reduza os pontos do eixo. A geometria não foi simplificada.');
        triangleTests+=cost;
        const cut=window.GeoMineMeshSections.cut(mesh,line,{});
        item.polylines=(cut.polylines||[]).filter(p=>p&&Array.isArray(p.points)&&p.points.length>=2&&
          p.points.every(v=>Array.isArray(v)&&Number.isFinite(v[0])&&Number.isFinite(v[1])))
          .map(p=>({points:p.points,closed:!!p.closed}));
        if(Array.isArray(cut.fillPolygons))item.fillPolygons=cut.fillPolygons.map(p=>Array.isArray(p)?p:p&&p.points)
          .filter(points=>Array.isArray(points)&&points.length>=3&&points.every(v=>Array.isArray(v)&&Number.isFinite(v[0])&&Number.isFinite(v[1])));
        item.closedSolid=cut.closedSolid===true;
        item.warnings=(cut.warnings||[]).map(String);
        if(!item.polylines.length&&!(item.fillPolygons&&item.fillPolygons.length))item.warnings.push('O eixo não atravessa esta malha.');
      }catch(e){item.error=true;item.warnings.push(String(e&&e.message||e));}
      return item;
    });
  }
  function layerRole(L,q){
    const canonical=roleForLayer(L),saved=q.roles[String(L.id)];
    // Versões anteriores gravavam todos esses tipos como "fault".
    if(saved==='fault'&&L._geology&&['fracture','vein','shearzone'].includes(canonical)){
      q.roles[String(L.id)]=canonical;return canonical;
    }
    return saved||canonical;
  }
  function sectionEvents(result){return ['contacts','faults','fractures','veins','shearzones']
    .flatMap(key=>result[key]||[]).filter(event=>event.extentType!=='mapped-surface');}

  function reprojectPoint(L,p){
    if(!Array.isArray(p)||!Number.isFinite(+p[0])||!Number.isFinite(+p[1]))return null;
    let xy=[+p[0],+p[1]];
    if(String(L.crs||S.workCRS)!==String(S.workCRS)){
      try{xy=reproj(L.crs,S.workCRS,xy[0],xy[1]);}catch(e){return null;}
    }
    if(!xy||!Number.isFinite(+xy[0])||!Number.isFinite(+xy[1]))return null;
    return [+xy[0],+xy[1],finite(p[2])];
  }
  function featureParts(L,f){
    const g=f&&f.geom;
    if(!Array.isArray(g)||!g.length)return [];
    if(L.gtype==='point'){
      const coords=[];(function visit(node){
        if(!Array.isArray(node)||!node.length)return;
        if(node.length>=2&&!Array.isArray(node[0])&&!Array.isArray(node[1])){coords.push(node);return;}
        node.forEach(visit);
      })(g);
      return coords.map(p=>reprojectPoint(L,p)).filter(Boolean).map(p=>[p]);
    }
    const parts=[];(function visit(node){
      if(!Array.isArray(node)||!node.length)return;
      const first=node[0];
      if(Array.isArray(first)&&first.length>=2&&!Array.isArray(first[0])&&!Array.isArray(first[1])){parts.push(node);return;}
      node.forEach(visit);
    })(g);
    return parts.map(part=>(part||[]).map(p=>reprojectPoint(L,p)).filter(Boolean))
      .filter(part=>part.length);
  }
  function longestLine(L){
    let best=null,bestLen=-1;
    (L&&L.features||[]).forEach(f=>featureParts(L,f).forEach(p=>{
      const m=lineMetrics(p);if(m.total>bestLen){best=p;bestLen=m.total;}
    }));
    return best;
  }

  function lineMetrics(line){
    const cum=[0];
    for(let i=1;i<(line||[]).length;i++)cum.push(cum[i-1]+Math.hypot(
      line[i][0]-line[i-1][0],line[i][1]-line[i-1][1]));
    return {cum,total:cum[cum.length-1]||0};
  }
  function pointAt(line,met,station){
    station=clamp(station,0,met.total);
    let i=1;while(i<met.cum.length-1&&met.cum[i]<station)i++;
    const a=line[i-1],b=line[i]||a,den=met.cum[i]-met.cum[i-1]||1,
      t=(station-met.cum[i-1])/den;
    return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  }
  function closestOnLine(p,line,met){
    let best={distance:Infinity,station:0,point:line&&line[0],segment:0,t:0,tangent:[1,0]};
    for(let i=1;i<(line||[]).length;i++){
      const a=line[i-1],b=line[i],dx=b[0]-a[0],dy=b[1]-a[1],d2=dx*dx+dy*dy;
      let t=d2?((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d2:0;t=clamp(t,0,1);
      const q=[a[0]+dx*t,a[1]+dy*t],d=Math.hypot(p[0]-q[0],p[1]-q[1]);
      if(d<best.distance){const dl=Math.sqrt(d2)||1;best={distance:d,
        station:met.cum[i-1]+dl*t,point:q,segment:i-1,t,tangent:[dx/dl,dy/dl]};}
    }
    return best;
  }
  function segmentIntersection(a,b,c,d){
    const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],
      den=rx*sy-ry*sx;
    if(Math.abs(den)<1e-12)return null;
    const qx=c[0]-a[0],qy=c[1]-a[1],t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
    if(t<-1e-9||t>1+1e-9||u<-1e-9||u>1+1e-9)return null;
    return {t:clamp(t,0,1),u:clamp(u,0,1),point:[a[0]+rx*t,a[1]+ry*t]};
  }
  function pointInRing(p,ring){
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i],b=ring[j];
      if(((a[1]>p[1])!==(b[1]>p[1]))&&
        p[0]<(b[0]-a[0])*(p[1]-a[1])/((b[1]-a[1])||1e-20)+a[0])inside=!inside;
    }
    return inside;
  }
  function pointInRings(p,rings){
    let inside=false;(rings||[]).forEach(r=>{if(r.length>2&&pointInRing(p,r))inside=!inside;});return inside;
  }
  function pointOnRings(p,rings){
    return (rings||[]).some(ring=>ring.some((a,i)=>{
      const b=ring[(i+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
      if(!length)return Math.hypot(p[0]-a[0],p[1]-a[1])<=1e-8;
      return Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)<=1e-8*length&&
        (p[0]-a[0])*(p[0]-b[0])+(p[1]-a[1])*(p[1]-b[1])<=1e-8;
    }));
  }
  function featureVisibleSafe(L,f){
    try{return typeof featureVisible==='function'?featureVisible(L,f):true;}catch(e){return true;}
  }
  function styleOf(L,f){
    try{if(typeof featureStyle==='function')return featureStyle(L,f);}catch(e){}
    return {color:(L.sym&&L.sym.color)||L.color||'#7a9e45',stroke:(L.sym&&L.sym.stroke)||L.color||'#263238'};
  }
  function labelOf(L,f){
    const p=f.props||{},names=['LITOLOGIA','LITO','UNIDADE','FORMACAO','FORMAÇÃO','NOME','NAME','TIPO','CODIGO','CÓDIGO','ID_FURO','FURO','HOLEID'];
    const v=getProp(p,names);
    if(v!=null)return String(v);
    const field=(L.fields||[]).map(x=>typeof x==='string'?x:x.name).find(k=>typeof p[k]==='string'&&p[k]);
    return field?String(p[field]):String(L.name||'Feição');
  }

  function sampleGrid(d,x,y){
    if(typeof sampleZbil==='function')return sampleZbil(d,x,y);
    if(!d||!d.z||!d.nc||!d.nr||!d.cs)return NaN;
    const c=Math.round((x-d.xll)/d.cs-0.5),r=Math.round((d.nr-0.5)-(y-d.yll)/d.cs);
    if(c<0||r<0||c>=d.nc||r>=d.nr)return NaN;
    const v=d.z[r*d.nc+c];return Number.isFinite(+v)?+v:NaN;
  }
  function sectionProfile(line,terrain,step){
    // Compartilha estações entre as fontes, mas não a grade: sampleProfile
    // pressupõe CRS/células iguais. O amostrador da seção respeita cada fonte.
    const met=lineMetrics(line),count=Math.min(20000,Math.max(1,Math.ceil(met.total/step))),dist=[],pts=[],z=[];
    const actualStep=met.total/count;
    for(let i=0;i<=count;i++){
      const s=i===count?met.total:i*actualStep,p=pointAt(line,met,s);
      dist.push(s);pts.push(p);z.push(terrain?projectRasterSample(terrain,p):NaN);
    }
    return {dist,total:met.total,pts,series:[{name:terrain?terrain.name:'Sem MDT',z}],method:'bilinear por fonte',actualStep};
  }
  function topoAt(profile,station){
    if(!profile||!profile.dist||!profile.dist.length)return NaN;
    const z=profile.series[0].z,d=profile.dist;
    let i=1;while(i<d.length-1&&d[i]<station)i++;
    const a=Math.max(0,i-1),b=Math.min(d.length-1,i),za=z[a],zb=z[b];
    if(!Number.isFinite(za))return zb;if(!Number.isFinite(zb))return za;
    const t=(station-d[a])/((d[b]-d[a])||1);return za+(zb-za)*t;
  }

  /* Projetos são sobreposições independentes do terreno. Para uma cava,
     cristas/pés/rampas são linhas de quebra de um mesmo projeto: a seção
     liga suas cotas em ordem, dentro do domínio da cava. Não aplica essa
     interpretação a linhas geológicas genéricas nem gera uma grade global. */
  function projectZ(value){
    if(value==null||typeof value==='boolean'||String(value).trim()==='')return NaN;
    const n=Number(typeof value==='string'?value.replace(',','.'):value);
    return Number.isFinite(n)&&n>-1e38?n:NaN;
  }
  function projectVectorParts(f){
    if(typeof profVectorParts==='function')return profVectorParts(f);
    if(!f||!Array.isArray(f.geom))return [];
    const nested=Array.isArray(f.geom[0]&&f.geom[0][0]),parts=nested?f.geom:[f.geom],
      constant=projectZ(getProp(f.props,['COTA','Z','ELEVATION','ELEVACAO','ALTITUDE']));
    return parts.map((xy,i)=>{
      const zg=nested?f.zg&&f.zg[i]:f.zg,has=Array.isArray(zg)||ArrayBuffer.isView(zg);
      return {xy,partIdx:i,z:xy.map((p,j)=>{
        const z=has?projectZ(zg[j]):NaN;
        return Number.isFinite(z)?z:p.length>2?projectZ(p[2]):has?NaN:constant;
      })};
    });
  }
  function projectIsModernPit(x){
    return ['_cava2DesignId','_cava2CutOf','_cava2CutSnapshotOf','_cava2CutFillOf'].some(k=>x[k]!=null&&String(x[k])!=='')||['cava','pilha'].includes(x._cava2Kind);
  }
  function projectIsPit(L){
    if(projectIsModernPit(L)||L.cavaDesign)return true;
    if(L._geology&&L._geology.kind)return false;
    const words=String(L.name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,' ');
    return /\b(CAVA|PILHA|PIT|DCE)\b/.test(words)||(L.features||[]).some(f=>
      /CAVA|PILHA|DCE/.test(norm(getProp(f.props,['PROJETO','TIPO_PROJETO'])))||
      ['CRISTA','PE','BERMA','BANCADA','RAMPA'].includes(norm(getProp(f.props,['ELEMENTO']))));
  }
  function projectSourceOptions(){
    const out=[];
    const anyZ=node=>(Array.isArray(node)||ArrayBuffer.isView(node))?Array.prototype.some.call(node,anyZ):Number.isFinite(projectZ(node)),
      geometryZ=node=>Array.isArray(node)&&node.length&&(Array.isArray(node[0])?node.some(geometryZ):node.length>2&&Number.isFinite(projectZ(node[2])));
    (S.layers||[]).forEach(L=>{
      if(!L||L.gtype!=='line'||isSectionLayer(L)||isMeshLayer(L))return;
      const design=L.cavaDesign&&Array.isArray(L.cavaDesign.rings)&&L.cavaDesign.rings.length>1,
        hasZ=design||(L.features||[]).some(f=>anyZ(f.zg)||geometryZ(f.geom)||Number.isFinite(projectZ(getProp(f.props,['COTA','Z','ELEVATION','ELEVACAO','ALTITUDE']))));
      if(hasZ){
        const guidance='',description=design?'cava paramétrica · bancos e rampas':projectIsPit(L)
          ?(projectIsModernPit(L)?'Cava2 · ':'')+'perfil linear dos bancos/rampas pelas cotas 3D'
          :'linhas 3D · cruzamentos exatos';
        out.push({key:'L:'+L.id,name:L.name||'Projeto',mode:design?'design':'vector',source:L,description,guidance});
      }
    });
    (S.rasters||[]).forEach(r=>{
      if(!r||!r.d)return;
      const role=r._v3&&r._v3.papel,linked=r._cavaCutLayer!=null||r._tinSourceId!=null||projectIsModernPit(r);
      if(linked||['cava','projeto','dce'].includes(role)||/CAVA|PILHA|PROJETO/.test(norm(r.name)))
        out.push({key:'R:'+r.id,name:r.name||'Superfície de projeto',mode:'raster',source:r,
          description:(r.d.tin||r.d._full&&r.d._full.tin)?'superfície TIN':'superfície raster'});
    });
    return out;
  }
  function projectXY(crs,p){
    if(!p||!Number.isFinite(projectZ(p[0]))||!Number.isFinite(projectZ(p[1])))return null;
    if(String(crs||S.workCRS)===String(S.workCRS))return [+p[0],+p[1]];
    try{const q=reproj(crs,S.workCRS,+p[0],+p[1]);return q&&q.every(Number.isFinite)?q:null;}catch(e){return null;}
  }
  function projectRasterInfo(r){
    const base=r.d,d=base&&base._full||base;
    // Um CRS explícito da grade atual prevalece sobre a identificação da
    // fonte importada. warpRaster cria uma grade nova sem srcCRS; nesse
    // caso, sem outra declaração, suas coordenadas já são do workCRS.
    return {d,crs:d&&d.crs||base&&base.crs||r.crs||d&&d.srcCRS||base&&base.srcCRS||r.srcCRS||S.workCRS};
  }
  function projectRasterSample(r,p){
    const {d,crs}=projectRasterInfo(r);if(!d)return NaN;let q=p;
    if(String(crs)!==String(S.workCRS))try{q=reproj(S.workCRS,crs,p[0],p[1]);}catch(e){return NaN;}
    if(!q||!q.every(Number.isFinite))return NaN;
    const clip=r._exactClipRings||d.tin&&d.tin.clip;
    if(clip&&clip.length&&!pointInRings(q,clip)&&!pointOnRings(q,clip))return NaN;
    // Importação nativa normaliza NoData para NaN. Projetos antigos/fontes
    // externas também podem declarar uma sentinela: rejeitá-la ANTES da
    // interpolação impede que -9999, por exemplo, vire uma cota fictícia.
    const noData=[d,r.d,r].flatMap(x=>x?[x.noData,x.nodata,x._nd]:[]).map(projectZ).filter(Number.isFinite),
      value=raw=>{const z=projectZ(raw);return noData.some(n=>z===n||z===Math.fround(n))?NaN:z;};
    if(d.tin){
      if(typeof tinSampleZ!=='function')return NaN;
      let T=d.tin;
      if(noData.length){
        if(!T._idx&&typeof tinIndexBuild==='function')tinIndexBuild(T);
        const masked=Object.create(T);masked.zs=new Proxy(T.zs,{get:(zs,key)=>typeof key==='string'&&/^\d+$/.test(key)?value(zs[key]):zs[key]});T=masked;
      }
      return value(tinSampleZ(T,q[0],q[1]));
    }
    const cy=d.csy||d.cs;
    if(!d.z||!(d.cs>0)||!(cy>0)||q[0]<d.xll||q[0]>d.xll+d.nc*d.cs||q[1]<d.yll||q[1]>d.yll+d.nr*cy)return NaN;
    const x=(q[0]-d.xll)/d.cs-.5,y=d.nr-.5-(q[1]-d.yll)/cy,c=Math.floor(x),row=Math.floor(y),fx=x-c,fy=y-row;
    let z=0;
    for(const [dr,dc,w] of [[0,0,(1-fx)*(1-fy)],[0,1,fx*(1-fy)],[1,0,(1-fx)*fy],[1,1,fx*fy]]){
      if(w<=1e-12)continue;
      const v=value(d.z[clamp(row+dr,0,d.nr-1)*d.nc+clamp(c+dc,0,d.nc-1)]);
      if(!Number.isFinite(v))return NaN;z+=v*w;
    }
    return z;
  }
  function projectCrossings(line,met,parts){
    const points=[],spans=[];
    parts.forEach(part=>{
      for(let j=1;j<part.xy.length;j++){
        const c=part.xy[j-1],d=part.xy[j],zc=part.z[j-1],zd=part.z[j];
        if(!c||!d||!Number.isFinite(zc)||!Number.isFinite(zd))continue;
        for(let i=1;i<line.length;i++){
          const a=line[i-1],b=line[i],len=met.cum[i]-met.cum[i-1];if(len<1e-10)continue;
          const hit=segmentIntersection(a,b,c,d);
          if(hit){points.push({station:met.cum[i-1]+hit.t*len,z:zc+(zd-zc)*hit.u});continue;}
          const dx=b[0]-a[0],dy=b[1]-a[1],cross=p=>Math.abs(dx*(p[1]-a[1])-dy*(p[0]-a[0]))/len;
          if(cross(c)>1e-7||cross(d)>1e-7)continue;
          const t=p=>((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(len*len),tc=t(c),td=t(d),lo=Math.max(0,Math.min(tc,td)),hi=Math.min(1,Math.max(tc,td));
          if(hi-lo<1e-10||Math.abs(td-tc)<1e-12)continue;
          spans.push([{station:met.cum[i-1]+lo*len,z:zc+(zd-zc)*(lo-tc)/(td-tc)},
            {station:met.cum[i-1]+hi*len,z:zc+(zd-zc)*(hi-tc)/(td-tc)}]);
        }
      }
    });
    points.sort((a,b)=>a.station-b.station||a.z-b.z);
    return {points:points.filter((p,i)=>!i||Math.abs(p.station-points[i-1].station)>1e-7||Math.abs(p.z-points[i-1].z)>1e-7),segments:spans};
  }
  function projectStations(line,met,step,extra=[]){
    const out=[0,met.total,...met.cum,...extra],increment=Math.max(.25,+step||1,met.total/10000);
    for(let s=increment;s<met.total;s+=increment)out.push(s);
    out.sort((a,b)=>a-b);return out.filter((s,i)=>Number.isFinite(s)&&s>=0&&s<=met.total&&(!i||Math.abs(s-out[i-1])>1e-7));
  }
  function projectSegments(stations,sample,line,met){
    const segments=[],values=[];let current=[],previous=null;
    const at=station=>({station,z:sample(pointAt(line,met,station))}),
      add=p=>{if(!current.length||Math.abs(current.at(-1).station-p.station)>1e-7)current.push(p);},
      finish=()=>{if(current.length){segments.push(current);current=[];}};
    // Também testar os intervalos, para não atravessar concavidades/NoData.
    stations.forEach((s,i)=>{if(i)values.push((stations[i-1]+s)/2);values.push(s);});
    values.forEach(s=>{
      const p=at(s),valid=Number.isFinite(p.z),was=previous&&Number.isFinite(previous.z);
      if(previous&&valid!==was){
        let lo=previous,hi=p;
        // Aproximar a borda válida (inclusive o encontro cava × MDT), sem
        // extrapolar cotas para o lado onde a fonte retorna NoData.
        for(let i=0;i<28&&hi.station-lo.station>1e-6;i++){
          const mid=at((lo.station+hi.station)/2);if(Number.isFinite(mid.z)===was)lo=mid;else hi=mid;
        }
        if(was){add(lo);finish();}else add(hi);
      }
      if(valid)add(p);else finish();previous=p;
    });
    if(current.length)segments.push(current);return segments;
  }
  function projectDesignProfile(L,line,met,step,terrain){
    const D=L.cavaDesign,rings=(D.rings||[]).map(q=>({ring:(q.ring||[]).map(p=>projectXY(L.crs,p)),z:projectZ(q.z)}))
      .filter(q=>q.ring.length>=3&&q.ring.every(Boolean)&&Number.isFinite(q.z));
    if(rings.length<2)return {segments:[],points:[],warning:'Modelo de cava sem anéis válidos.'};
    const area=r=>Math.abs(r.reduce((sum,p,i)=>{const b=r[(i+1)%r.length];return sum+p[0]*b[1]-b[0]*p[1];},0)/2),
      areas=rings.map(q=>area(q.ring)),outer=rings[areas.indexOf(Math.max(...areas))],expanding=areas.at(-1)>areas[0],
      inside=(q,p)=>pointInRing(p,q.ring)||pointOnRings(p,[q.ring]),
      distance=(ring,p)=>{let best=Infinity;ring.forEach((a,i)=>{const b=ring[(i+1)%ring.length],dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1),0,1);best=Math.min(best,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy));});return best;},
      ramps=(D.rampLines||[]).map(q=>({geom:(q.geom||[]).map(p=>projectXY(L.crs,p)),zg:(q.zg||[]).map(projectZ)}));
    const cutTerrain=D.rasterId!=null?(S.rasters||[]).find(r=>String(r.id)===String(D.rasterId)):terrain;
    if(D.cortar&&!cutTerrain)return {segments:[],points:[],warning:'MDT de corte da cava não está disponível.'};
    if(ramps.some(q=>q.geom.some(p=>!p))||ramps.some(q=>q.zg.some(z=>!Number.isFinite(z))))
      return {segments:[],points:[],warning:'Rampa com coordenadas/cotas inválidas.'};
    const sample=p=>{
      if(!inside(outer,p))return NaN;
      let z=NaN,A,B;
      if(expanding){if(inside(rings[0],p))z=rings[0].z;else for(let i=1;i<rings.length;i++)if(inside(rings[i],p)){A=rings[i-1];B=rings[i];break;}}
      else{let last=rings[0];for(let i=1;i<rings.length;i++){if(!inside(rings[i],p)){A=last;B=rings[i];break;}last=rings[i];}if(!A)z=rings.at(-1).z;}
      if(A&&B){const da=distance(A.ring,p),db=distance(B.ring,p);z=da+db>1e-9?(A.z*db+B.z*da)/(da+db):(A.z+B.z)/2;}
      if(ramps.length&&typeof tinCavaRampZ==='function'){const rz=tinCavaRampZ(ramps,p[0],p[1]);if(Number.isFinite(rz))z=rz;}
      if(D.cortar){const tz=projectRasterSample(cutTerrain,p);if(!Number.isFinite(tz)||(D.up?z<tz-1e-7:z>tz+1e-7))return NaN;}
      return z;
    };
    const parts=rings.map(q=>({xy:q.ring.concat([q.ring[0]]),z:new Array(q.ring.length+1).fill(q.z)}));
    ramps.forEach(q=>parts.push({xy:q.geom,z:q.zg}));
    const hits=projectCrossings(line,met,parts),extra=hits.points.map(p=>p.station).concat(hits.segments.flat().map(p=>p.station));
    return {segments:projectSegments(projectStations(line,met,step,extra),sample,line,met),points:[],method:'bancos e rampas do modelo de cava'};
  }
  function projectPitDomain(L,parts){
    const same=(a,b)=>a!=null&&b!=null&&String(a)===String(b),
      linked=(S.layers||[]).filter(P=>P.gtype==='polygon'&&(L._cava2CutSnapshotId!=null
        ?same(P._cava2CutSnapshotId,L._cava2CutSnapshotId)
        :L._cava2CutOf!=null?same(P._cava2CutFillOf,L._cava2CutOf)
        :L._cava2DesignId!=null&&same(P._cava2DesignId,L._cava2DesignId))),
      ringParts=(P,f)=>projectVectorParts(f).map(p=>({...p,xy:p.xy.map(x=>projectXY(P.crs,x))}))
        .filter(p=>p.xy.length>=3&&p.xy.every(Boolean)),
      closed=p=>p.xy.length>=4&&Math.hypot(p.xy[0][0]-p.xy.at(-1)[0],p.xy[0][1]-p.xy.at(-1)[1])<1e-6,
      polygons=[],floors=[];
    linked.forEach(P=>(P.features||[]).forEach(f=>{
      const role=norm(getProp(f.props,['ELEMENTO'])),ps=ringParts(P,f);if(!ps.length)return;
      if(['AREAPROJETADA','LIMITEEXTERIOR','INTERSECAO'].includes(role))polygons.push(ps.map(p=>p.xy));
      if(['FUNDO','TOPO'].includes(role))ps.forEach(p=>{
        const z=p.z[0];if(Number.isFinite(z)&&p.z.every(q=>Number.isFinite(q)&&Math.abs(q-z)<1e-7)){
          if(!closed(p)){p.xy.push(p.xy[0]);p.z.push(z);}floors.push(p);
        }
      });
    }));
    // O corte independente usa somente seu próprio contorno, nunca o
    // preenchimento de uma versão atual do mesmo desenho de cava.
    const daylight=parts.filter(p=>closed(p)&&norm(getProp(p.props,['ELEMENTO','TIPO'])).includes('INTERSECAO'));
    if(daylight.length)return {polygons:daylight.map(p=>[p.xy]),floors};
    if(polygons.length)return {polygons,floors};
    const limits=parts.filter(p=>closed(p)&&/LIMITEEXTERIOR|CONTORNO|LIMITECAVA/.test(norm(getProp(p.props,['ELEMENTO','TIPO']))));
    return {polygons:(limits.length?limits:parts.filter(closed)).map(p=>[p.xy]),floors};
  }
  function projectVectorProfile(L,line,met,parts){
    const domain=projectPitDomain(L,parts),all=parts.concat(domain.floors),segments=[],isolated=[],eps=1e-7;
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    all.forEach(p=>p.xy.forEach(q=>{if(q){x0=Math.min(x0,q[0]);x1=Math.max(x1,q[0]);y0=Math.min(y0,q[1]);y1=Math.max(y1,q[1]);}}));
    if(!Number.isFinite(x0))return {segments,points:[],connectedProfile:true,warning:'Projeto sem coordenadas válidas.'};
    const inside=p=>!domain.polygons.length||domain.polygons.some(r=>pointInRings(p,r)||pointOnRings(p,r)),
      boundaries=domain.polygons.flatMap(poly=>poly.map(r=>({xy:r.concat([r[0]]),z:new Array(r.length+1).fill(0)}))),
      missing=[];
    all.forEach(p=>{for(let j=1;j<p.xy.length;j++)if(p.xy[j-1]&&p.xy[j]&&(!Number.isFinite(p.z[j-1])||!Number.isFinite(p.z[j])))
      missing.push({xy:[p.xy[j-1],p.xy[j]],z:[0,0]});});
    const distinct=values=>values.sort((a,b)=>a-b).filter((v,i,a)=>!i||Math.abs(v-a[i-1])>eps),
      uniqPoints=values=>values.sort((a,b)=>a.station-b.station||a.z-b.z).filter((p,i,a)=>!i||Math.abs(p.station-a[i-1].station)>eps||Math.abs(p.z-a[i-1].z)>eps),
      addSegment=run=>{
        if(run.length<2){isolated.push(...run);return;}
        const last=segments.at(-1),a=last&&last.at(-1),b=run[0];
        if(a&&Math.abs(a.station-b.station)<eps&&Math.abs(a.z-b.z)<eps)last.push(...run.slice(1));else segments.push(run);
      };
    {
      // Um eixo dobrado é uma única progressiva. Estender separadamente
      // cada direção criava duas cotas para a mesma dobra em um talude.
      // Apoios externos são permitidos somente antes de A e depois de B.
      const path=line.filter((p,i)=>!i||Math.hypot(p[0]-line[i-1][0],p[1]-line[i-1][1])>eps),length=met.total;
      if(path.length<2||length<=eps)return {segments,points:[],connectedProfile:true,warning:'Eixo da seção sem comprimento válido.'};
      const a=path[0],b=path.at(-1),first=path[1],last=path.at(-2),
        startLength=Math.hypot(first[0]-a[0],first[1]-a[1]),endLength=Math.hypot(b[0]-last[0],b[1]-last[1]),
        ux=(first[0]-a[0])/startLength,uy=(first[1]-a[1])/startLength,
        vx=(b[0]-last[0])/endLength,vy=(b[1]-last[1])/endLength,
        extension=Math.hypot(x1-x0,y1-y0)+Math.hypot(a[0]-(x0+x1)/2,a[1]-(y0+y1)/2)+Math.hypot(b[0]-(x0+x1)/2,b[1]-(y0+y1)/2)+1,
        axis=[[a[0]-ux*extension,a[1]-uy*extension],...path,[b[0]+vx*extension,b[1]+vy*extension]],am=lineMetrics(axis),
        hit=projectCrossings(axis,am,all),known=uniqPoints(hit.points.concat(hit.segments.flat())),
        bad=projectCrossings(axis,am,missing),barriers=distinct(bad.points.map(p=>p.station).concat(bad.segments.flat().map(p=>p.station))),
        border=projectCrossings(axis,am,boundaries),cuts=distinct([0,am.total,...am.cum,...barriers,...border.points.map(p=>p.station),...border.segments.flat().map(p=>p.station)]),intervals=[];
      for(let k=1;k<cuts.length;k++){
        const lo=cuts[k-1],hi=cuts[k];if(hi-lo<=eps||!inside(pointAt(axis,am,(lo+hi)/2)))continue;
        const last=intervals.at(-1),barrier=barriers.some(s=>Math.abs(s-lo)<eps);
        if(last&&Math.abs(last[1]-lo)<eps&&!barrier)last[1]=hi;else intervals.push([lo,hi]);
      }
      for(const [lo,hi] of intervals){
        const values=known.filter(p=>p.station>=lo-eps&&p.station<=hi+eps),groups=[];
        // Recortar no próprio limite (inclusive buracos), não na última
        // crista antes dele. Usar apenas interpolação entre cotas existentes
        // e jamais cruzar uma linha cuja elevação esteja ausente.
        for(const s of [lo,hi]){
          if(values.some(p=>Math.abs(p.station-s)<eps))continue;
          let u=null,v=null;for(const p of known){if(p.station<s)u=p;else if(p.station>s){v=p;break;}}
          if(u&&v&&v.station-u.station>eps&&!barriers.some(b=>b>=u.station-eps&&b<=v.station+eps))
            values.push({station:s,z:u.z+(v.z-u.z)*(s-u.station)/(v.station-u.station)});
        }
        values.sort((a,b)=>a.station-b.station||a.z-b.z);
        values.forEach(p=>{const g=groups.at(-1);if(g&&Math.abs(g[0].station-p.station)<eps)g.push(p);else groups.push([p]);});
        const ordered=[];
        groups.forEach((g,k)=>{
          // Duas cotas na mesma progressiva podem representar uma face
          // vertical: conservar ambas, orientadas pelo trecho vizinho.
          const previous=ordered.at(-1),next=groups[k+1]&&groups[k+1][0],target=previous?previous.z:next?next.z:g[0].z;
          if(Math.abs(g.at(-1).z-target)<Math.abs(g[0].z-target))g.reverse();ordered.push(...g);
        });
        if(ordered.length===1){const p=ordered[0];if(p.station>=extension-eps&&p.station<=extension+length+eps)isolated.push({station:p.station-extension,z:p.z});continue;}
        const clipped=[];
        for(let k=1;k<ordered.length;k++){
          const u=ordered[k-1],v=ordered[k],left=Math.max(extension,u.station),right=Math.min(extension+length,v.station);
          if(right<left-eps)continue;
          if(v.station-u.station<=eps){
            if(u.station>=extension-eps&&u.station<=extension+length+eps){
              for(const p of [u,v]){const q={station:p.station-extension,z:p.z},prev=clipped.at(-1);if(!prev||Math.abs(prev.station-q.station)>eps||Math.abs(prev.z-q.z)>eps)clipped.push(q);}
            }
            continue;
          }
          for(const s of [left,...met.cum.map(s=>extension+s).filter(s=>s>left+eps&&s<right-eps),right]){
            const q={station:s-extension,z:u.z+(v.z-u.z)*(s-u.station)/(v.station-u.station)},prev=clipped.at(-1);
            if(!prev||Math.abs(prev.station-q.station)>eps||Math.abs(prev.z-q.z)>eps)clipped.push(q);
          }
        }
        addSegment(clipped);
      }
    }
    const result={segments,points:uniqPoints(isolated),connectedProfile:true,
      method:'perfil linear pelas cotas XYZ de bancos/rampas; interpolação entre cruzamentos, sem extrapolar'+
        (domain.polygons.length?'; recortado ao domínio da cava':'; sem contorno fechado: limitado ao primeiro/último cruzamento do eixo')};
    if(!segments.length&&result.points.length)result.warning='Somente uma cota de cruzamento disponível; são necessárias ao menos duas cotas para traçar o perfil da cava.';
    return result;
  }
  function projectProfiles(keys,line,met,step,terrain){
    const available=projectSourceOptions(),colors=['#c05b17','#2563eb','#8b5bb3','#07877b','#b04b68'];
    return (keys||[]).map((key,index)=>{
      const option=available.find(x=>x.key===key);
      if(!option)return {key,name:key,color:colors[index%colors.length],segments:[],points:[],warning:'Fonte de projeto não encontrada.'};
      const item={key,name:option.name,mode:option.mode,color:colors[index%colors.length],segments:[],points:[]};
      if(option.mode==='design')Object.assign(item,projectDesignProfile(option.source,line,met,step,terrain));
      else if(option.mode==='vector'){
        const L=option.source,parts=(L.features||[]).filter(f=>featureVisibleSafe(L,f)).flatMap(f=>projectVectorParts(f).map(p=>({...p,props:f.props||{}})))
          .map(p=>({...p,xy:p.xy.map(x=>projectXY(L.crs,x))}));
        if(projectIsPit(L))Object.assign(item,projectVectorProfile(L,line,met,parts));
        else Object.assign(item,projectCrossings(line,met,parts),{method:'cruzamentos XYZ/zg; sem superfície interpolada'});
      }else{
        const r=option.source,{d,crs}=projectRasterInfo(r),extra=[];
        // Interseções de centros/bordas da grade preservam lacunas menores
        // que o passo configurado. Não cria nem reamostra uma grade inteira.
        if(String(crs)===String(S.workCRS)&&d&&d.nc&&d.nr){
          for(let i=1;i<line.length;i++)for(const [axis,origin,cell,count] of [[0,d.xll,d.cs,d.nc],[1,d.yll,d.csy||d.cs,d.nr]]){
            if(item.warning)continue;
            const a=line[i-1][axis],b=line[i][axis],delta=b-a;if(!delta||!(cell>0))continue;
            const lo=Math.max(0,Math.ceil((Math.min(a,b)-origin)/cell*2)),hi=Math.min(count*2,Math.floor((Math.max(a,b)-origin)/cell*2));
            if(hi-lo>50000||extra.length+hi-lo+1>50000){item.warning='Grade muito extensa: escolha um eixo menor para preservar lacunas.';break;}
            for(let k=lo;k<=hi;k++){const t=(origin+k*cell/2-a)/delta;if(t>=0&&t<=1)extra.push(met.cum[i-1]+t*(met.cum[i]-met.cum[i-1]));}
          }
        }
        if(!item.warning)item.segments=projectSegments(projectStations(line,met,step,extra),p=>projectRasterSample(r,p),line,met);
        item.method=d&&d.tin?'TIN nativo':'grade de projeto; NoData preservado';
      }
      if(!item.warning&&!item.points.length&&!item.segments.some(s=>s.length))item.warning='A seção não cruza cotas válidas deste projeto.';
      return item;
    });
  }

  function lineEvents(L,line,met,profile,kind){
    const out=[];
    (L.features||[]).forEach((f,fi)=>{
      if(!featureVisibleSafe(L,f))return;
      featureParts(L,f).forEach(part=>{
        for(let si=1;si<line.length;si++)for(let gi=1;gi<part.length;gi++){
          const hit=segmentIntersection(line[si-1],line[si],part[gi-1],part[gi]);if(!hit)continue;
          const segLen=Math.hypot(line[si][0]-line[si-1][0],line[si][1]-line[si-1][1]),
            station=met.cum[si-1]+hit.t*segLen,
            z0=part[gi-1][2],z1=part[gi][2],z=Number.isFinite(z0)&&Number.isFinite(z1)?z0+(z1-z0)*hit.u:topoAt(profile,station);
          const dx=line[si][0]-line[si-1][0],dy=line[si][1]-line[si-1][1];
          const units=[getProp(f.props,['UNID_A','UNIDADE_A']),getProp(f.props,['UNID_B','UNIDADE_B']),
            getProp(f.props,['UNIDADE','DOMINIO','DOMÍNIO','LITOLOGIA'])].filter(v=>v!=null&&String(v).trim()).map(String);
          const attitudeIds=String(getProp(f.props,['ID_ATITUDE','ATITUDE_ID','ORIENTATION_ID'])||'')
            .split(/[;,]/).map(value=>value.trim()).filter(Boolean);
          out.push({kind,station,z,point:hit.point.slice(),sectionAzimuth:(Math.atan2(dx,dy)*180/Math.PI+360)%360,attitudeIds,
            units,label:labelOf(L,f),layerId:L.id,feature:fi,color:styleOf(L,f).stroke||L.color});
        }
      });
    });
    out.sort((a,b)=>a.station-b.station);
    return out.filter((x,i)=>!i||x.layerId!==out[i-1].layerId||Math.abs(x.station-out[i-1].station)>.05);
  }
  function polygonEventsAndRuns(layers,line,met,profile){
    const events=[];
    layers.forEach(L=>(L.features||[]).forEach((f,fi)=>{
      if(!featureVisibleSafe(L,f))return;
      featureParts(L,f).forEach(ring=>{
        for(let si=1;si<line.length;si++)for(let gi=0;gi<ring.length;gi++){
          const hit=segmentIntersection(line[si-1],line[si],ring[gi],ring[(gi+1)%ring.length]);if(!hit)continue;
          const segLen=Math.hypot(line[si][0]-line[si-1][0],line[si][1]-line[si-1][1]),station=met.cum[si-1]+hit.t*segLen;
          const dx=line[si][0]-line[si-1][0],dy=line[si][1]-line[si-1][1];
          events.push({kind:'contact',station,z:topoAt(profile,station),point:hit.point.slice(),units:[labelOf(L,f)],
            sectionAzimuth:(Math.atan2(dx,dy)*180/Math.PI+360)%360,label:labelOf(L,f),layerId:L.id,
            feature:fi,color:styleOf(L,f).stroke||L.color});
        }
      });
    }));
    events.sort((a,b)=>a.station-b.station);
    const uniq=events.filter((x,i)=>!i||x.layerId!==events[i-1].layerId||Math.abs(x.station-events[i-1].station)>.05);
    // Cortes exatos dos domínios, não apenas o rótulo do ponto amostrado.
    // Assim não fica uma coluna branca entre duas unidades quando o
    // preenchimento desce até o eixo X, nem some uma unidade estreita.
    const cuts=[0,met.total,...events.map(e=>e.station)].filter(s=>Number.isFinite(s)&&s>=0&&s<=met.total).sort((a,b)=>a-b),
      bounds=cuts.filter((s,i)=>!i||s-cuts[i-1]>1e-8),runs=[];
    for(let i=1;i<bounds.length;i++){
      const startStation=bounds[i-1],endStation=bounds[i];if(endStation-startStation<1e-8)continue;
      const p=pointAt(line,met,(startStation+endStation)/2);
      let found=null;
      for(const L of layers){
        for(const f of (L.features||[])){
          if(!featureVisibleSafe(L,f))continue;
          const rings=featureParts(L,f);if(pointInRings(p,rings)){
            const st=styleOf(L,f);found={layerId:L.id,label:labelOf(L,f),color:st.color||L.color||'#9ebd6b'};break;
          }
        }
        if(found)break;
      }
      const key=found?found.layerId+'|'+found.label:'';
      const current=runs[runs.length-1];
      if(current&&current.key===key)current.endStation=endStation;
      else runs.push({key,startStation,endStation,...(found||{layerId:null,label:'Sem unidade',color:'#e6e8eb'})});
    }
    runs.forEach(run=>{
      run.startIndex=Math.max(0,profile.dist.findIndex(s=>s>=run.startStation));
      const end=profile.dist.findIndex(s=>s>=run.endStation);run.endIndex=end<0?profile.dist.length-1:end;
    });
    return {events:uniq,runs};
  }
  function mappedPolygonExtents(L,line,met,profile,kind){
    const out=[];
    (L.features||[]).forEach((f,feature)=>{
      if(!featureVisibleSafe(L,f))return;
      const rings=featureParts(L,f),stations=[0,met.total];
      for(let si=1;si<line.length;si++)for(const ring of rings)for(let gi=0;gi<ring.length;gi++){
        const hit=segmentIntersection(line[si-1],line[si],ring[gi],ring[(gi+1)%ring.length]);
        if(hit)stations.push(met.cum[si-1]+hit.t*(met.cum[si]-met.cum[si-1]));
      }
      stations.sort((a,b)=>a-b);
      const cuts=stations.filter((value,index)=>!index||Math.abs(value-stations[index-1])>1e-8);
      for(let i=1;i<cuts.length;i++){
        const startStation=cuts[i-1],endStation=cuts[i];
        const middle=pointAt(line,met,(startStation+endStation)/2);
        if(endStation-startStation<1e-8||!(pointOnRings(middle,rings)||pointInRings(middle,rings)))continue;
        const previous=out[out.length-1];
        if(previous&&previous.feature===feature&&Math.abs(previous.endStation-startStation)<1e-8){
          previous.endStation=endStation;previous.endZ=topoAt(profile,endStation);continue;
        }
        out.push({kind,extentType:'mapped-surface',startStation,endStation,
          startZ:topoAt(profile,startStation),endZ:topoAt(profile,endStation),
          label:labelOf(L,f),layerId:L.id,feature,color:styleOf(L,f).stroke||L.color||'#da6a3a',
          interpretation:null,method:'section-polygon-intersection'});
      }
    });
    return out;
  }
  const LITHOLOGY_COLORS=['#8b5e3c','#d97706','#ca8a04','#65a30d','#15803d','#0f766e','#0e7490','#2563eb','#4f46e5','#7c3aed','#a21caf','#be185d','#b91c1c','#64748b'];
  function lithologyColor(value){
    const key=norm(value)||'SEMLITOLOGIA';let hash=2166136261;
    for(let i=0;i<key.length;i++){hash^=key.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return LITHOLOGY_COLORS[(hash>>>0)%LITHOLOGY_COLORS.length];
  }
  function validHoleRows(rows,depth,source){
    depth=finite(depth);if(depth==null||depth<=0)return [];
    return (Array.isArray(rows)?rows:[]).map((row,index)=>{
      const from=finite(row&&getProp(row,['DE_M','DE','FROM_M','FROM','INICIO_M','INÍCIO_M'])),
        to=finite(row&&getProp(row,['ATE_M','ATÉ_M','ATE','TO_M','TO','FIM_M']));
      if(from==null||to==null||from<0||to<=from||to>depth+1e-8)return null;
      const lithology=String(getProp(row,['LITOLOGIA','LITO','LITHOLOGY','UNIDADE','UNIT'])||'').trim();
      return {from,to,lithology,source,sourceIndex:index,sourceRow:{...(row||{})}};
    }).filter(Boolean).sort((a,b)=>a.from-b.from||a.to-b.to||a.sourceIndex-b.sourceIndex);
  }
  function holeIntervals(feature,depth,provenance){
    const logs=validHoleRows(feature&&feature.geologyLog,depth,'geologyLog'),
      cores=validHoleRows(feature&&feature.coreRuns,depth,'coreRuns'),
      boundaries=[...new Set([...logs,...cores].flatMap(row=>[row.from,row.to]))].sort((a,b)=>a-b),out=[];
    for(let i=1;i<boundaries.length;i++){
      const from=boundaries[i-1],to=boundaries[i];if(to<=from)continue;
      const mid=(from+to)/2,
        log=logs.find(row=>row.from<=mid+1e-9&&row.to>=mid-1e-9),
        core=cores.find(row=>row.from<=mid+1e-9&&row.to>=mid-1e-9),
        chosen=(log&&log.lithology)?log:((core&&core.lithology)?core:(log||core));
      if(!chosen)continue;
      const lithology=chosen.lithology||'Sem litologia',entry={from,to,lithology,
        color:lithologyColor(lithology),source:chosen.source,sourceIndex:chosen.sourceIndex,
        sourceRow:chosen.sourceRow,provenance:{...(provenance||{}),source:chosen.source,sourceIndex:chosen.sourceIndex}};
      const prev=out[out.length-1];
      if(prev&&Math.abs(prev.to-from)<1e-8&&prev.lithology===entry.lithology&&
        prev.source===entry.source&&prev.sourceIndex===entry.sourceIndex)prev.to=to;
      else out.push(entry);
    }
    return out;
  }
  function tracePointAtDepth(trace,depthValue,totalDepth){
    if(!Array.isArray(trace)||!trace.length)return null;
    const total=Math.max(0,finite(totalDepth)||0),last=trace.length-1,
      md=trace.map((p,i)=>Number.isFinite(+p.md)?+p.md:(last?total*i/last:0)),target=clamp(+depthValue||0,0,total);
    if(target<md[0]-1e-8||target>md[last]+1e-8)return null;
    if(target<=md[0])return {...trace[0],md:target};
    if(target>=md[last])return {...trace[last],md:target};
    let i=1;while(i<md.length-1&&md[i]<target)i++;
    const a=trace[Math.max(0,i-1)],b=trace[i]||a,ma=md[Math.max(0,i-1)]||0,mb=md[i]??ma,
      t=mb>ma?(target-ma)/(mb-ma):0;
    if(b.breakBefore&&target>ma+1e-8&&target<mb-1e-8)return null;
    return {station:a.station+(b.station-a.station)*t,z:a.z+(b.z-a.z)*t,md:target};
  }
  function traceSliceByDepth(trace,from,to,totalDepth){
    const runs=[];let run=[];
    (trace||[]).forEach(p=>{if(p.breakBefore&&run.length){runs.push(run);run=[];}run.push(p);});
    if(run.length)runs.push(run);
    return runs.flatMap(part=>{
      const lo=Math.max(from,part[0].md??0),hi=Math.min(to,part[part.length-1].md??totalDepth);
      if(hi<=lo)return [];
      const start=tracePointAtDepth(part,lo,totalDepth),end=tracePointAtDepth(part,hi,totalDepth);
      if(!start||!end||!Number.isFinite(start.z)||!Number.isFinite(end.z))return [];
      const inner=part.filter(p=>Number.isFinite(+p.md)&&p.md>lo&&p.md<hi).map(p=>({...p}));
      return [{...start,breakBefore:true},...inner,end];
    });
  }
  function projectHoleTrace(points,line,met,corridor){
    const trace=[],radius=Math.max(0,+corridor||0)/2,eps=1e-8;
    const roots=(a,b,c)=>{
      if(Math.abs(a)<1e-15)return Math.abs(b)<1e-15?[]:[-c/b];
      const d=b*b-4*a*c;if(d<0)return [];
      const sq=Math.sqrt(d);return [(-b-sq)/(2*a),(-b+sq)/(2*a)];
    };
    for(let index=1;index<points.length;index++){
      const a=points[index-1],b=points[index];if(!Number.isFinite(a.z)||!Number.isFinite(b.z))continue;
      const dx=b.x-a.x,dy=b.y-a.y,xyLength=Math.hypot(dx,dy),cuts=[0,1],at=t=>{
        const x=a.x+dx*t,y=a.y+dy*t,hit=closestOnLine([x,y],line,met);
        return {station:hit.station,offset:hit.distance,z:a.z+(b.z-a.z)*t,md:a.md+(b.md-a.md)*t,x,y,sectionSegment:hit.segment};
      };
      // Exact crossings with each segment's corridor capsule (side lines
      // and endpoint circles). Their union also handles a bent section.
      for(let si=1;si<line.length;si++){
        const p=line[si-1],q=line[si],vx=q[0]-p[0],vy=q[1]-p[1],length=Math.hypot(vx,vy);
        if(!length)continue;
        const cross0=(a.x-p[0])*vy-(a.y-p[1])*vx,crossD=dx*vy-dy*vx;
        if(Math.abs(crossD)>1e-15)cuts.push((radius*length-cross0)/crossD,(-radius*length-cross0)/crossD);
        const dot0=(a.x-p[0])*vx+(a.y-p[1])*vy,dotD=dx*vx+dy*vy;
        if(Math.abs(dotD)>1e-15)cuts.push(-dot0/dotD,(length*length-dot0)/dotD);
        for(const end of [p,q]){
          const ox=a.x-end[0],oy=a.y-end[1];
          cuts.push(...roots(dx*dx+dy*dy,2*(ox*dx+oy*dy),ox*ox+oy*oy-radius*radius));
        }
      }
      const sorted=cuts.filter(t=>Number.isFinite(t)&&t>=0&&t<=1).sort((x,y)=>x-y),
        boundaries=sorted.filter((t,i)=>!i||Math.abs(t-sorted[i-1])>1e-10);
      for(let i=1;i<boundaries.length;i++){
        const lo=boundaries[i-1],hi=boundaries[i];if(at((lo+hi)/2).offset>radius+eps)continue;
        const steps=Math.max(1,Math.ceil((hi-lo)*xyLength/Math.max(.25,Math.min(2,radius/4||.25))));
        for(let j=0;j<=steps;j++){
          const p=at(lo+(hi-lo)*j/steps),last=trace[trace.length-1];
          if(last&&Math.abs(last.md-p.md)<eps)continue;
          const separation=last?Math.hypot(p.x-last.x,p.y-last.y):0;
          p.breakBefore=!!last&&((j===0&&Math.abs(last.md-p.md)>eps)||
            Math.abs(p.station-last.station)>separation*4+eps);
          trace.push(p);
        }
      }
    }
    return trace;
  }
  function importedHoleTrace(L,feature){
    const raw=feature&&feature.boreholeTrace,collarOnly=feature?.boreholeSource?.method==='collar-only';
    if(!Array.isArray(raw)||raw.length<(collarOnly?1:2)||(collarOnly&&raw.length!==1))return {error:'Trajetória importada ausente ou incompleta; reimporte a sondagem.'};
    if(raw.length>100000)return {error:'Trajetória importada excede 100 mil estações; separe o conjunto para processar com segurança.'};
    const points=[];
    for(let i=0;i<raw.length;i++){
      const p=raw[i],md=finite(p&&p.md),x=finite(p&&p.x),y=finite(p&&p.y),z=finite(p&&p.z),
        xyz=x==null||y==null||z==null?null:reprojectPoint(L,[x,y,z]);
      if(md==null||md<0||!xyz||!Number.isFinite(xyz[2]))return {error:'Trajetória importada contém XYZ/MD inválidos na estação '+(i+1)+'.'};
      if((i===0&&Math.abs(md)>1e-8)||(i>0&&md<=points[i-1].md))return {error:'Trajetória importada deve começar em MD 0 e ter profundidades medidas estritamente crescentes.'};
      points.push({x:xyz[0],y:xyz[1],z:xyz[2],md});
    }
    // Collar sem profundidade/desvio documenta só a boca. A presença de
    // atributos ou logs não autoriza inventar orientação e extensão.
    if(collarOnly)return {points,depth:null,statedDepth:null,sourceDepth:0,collarOnly:true};
    const statedRaw=getProp(feature.props||{},['PROF_M','PROFUNDIDADE','PROF_TOTAL','PROFUNDIDADETOTAL','DEPTH','TOTALDEPTH','FINALDEPTH']),
      stated=finite(statedRaw),lastDepth=points[points.length-1].md;
    if(statedRaw!=null&&(stated==null||stated<=0))return {error:'Profundidade total inválida na sondagem importada.'};
    const depth=stated==null?lastDepth:Math.min(stated,lastDepth),clipped=[];
    if(depth<=0)return {error:'Trajetória importada sem profundidade positiva.'};
    for(const p of points){
      if(p.md<=depth){clipped.push(p);continue;}
      const a=clipped[clipped.length-1];
      if(a&&a.md<depth){const t=(depth-a.md)/(p.md-a.md);clipped.push({x:a.x+(p.x-a.x)*t,y:a.y+(p.y-a.y)*t,z:a.z+(p.z-a.z)*t,md:depth});}
      break;
    }
    return {points:clipped,depth,statedDepth:stated,sourceDepth:lastDepth};
  }
  function holeObjects(L,line,met,profile,corridor,raster,warnings){
    const out=[],outside=new Set(),filtered=new Set(),collars=new Set();
    (L.features||[]).forEach((f,fi)=>{
      if(!featureVisibleSafe(L,f)){filtered.add(fi);return;}
      const parts=holeParts(L,f),props=f.props||{},mappedId=holeProp(L,f,'ID_FURO',['ID_FURO','FURO','HOLEID']),
        holeId=mappedId==null||String(mappedId).trim()===''?labelOf(L,f):String(mappedId),
        provenance={layerId:L.id,layerName:String(L.name||''),feature:fi,holeId};
      // O desvio medido/calculado na importação é a geometria do furo.
      // Não substituí-lo por uma reta de azimute/mergulho da boca nem
      // recalcular MD pela soma das cordas (MD é profundidade de sondagem).
      if(L._geology?.importedBoreholes===true||Object.prototype.hasOwnProperty.call(f,'boreholeTrace')){
        const imported=importedHoleTrace(L,f);
        if(imported.error){if(warnings)warnings.push(holeId+': '+imported.error);return;}
        const sourceProvenance={...provenance,traceSource:'boreholeTrace',sourceCRS:L.crs||S.workCRS,
          method:String(f.boreholeSource&&f.boreholeSource.method||'imported-desurvey')};
        if(imported.collarOnly){
          const point=imported.points[0],hit=closestOnLine([point.x,point.y],line,met);
          if(hit.distance>Math.max(0,+corridor||0)/2+1e-8){outside.add(fi);return;}
          out.push({label:holeId,layerId:L.id,layerName:String(L.name||''),feature:fi,
            trace:[{...point,md:0,station:hit.station,offset:hit.distance,sectionSegment:hit.segment}],
            depth:null,offset:hit.distance,collarOnly:true,projection:'collar-point-to-section',
            elevationSource:'imported-trace-z',assumedVertical:false,measuredDepthSource:null,intervals:[],
            provenance:sourceProvenance,color:styleOf(L,f).stroke||'#7c3aed'});
          return;
        }
        const trace=projectHoleTrace(imported.points,line,met,corridor);
        if(trace.length<2){outside.add(fi);return;}
        out.push({label:holeId,layerId:L.id,layerName:String(L.name||''),feature:fi,trace,depth:imported.depth,
          offset:closestOnLine([imported.points[0].x,imported.points[0].y],line,met).distance,
          projection:'desurvey-xy-to-section',elevationSource:'imported-trace-z',assumedVertical:false,
          measuredDepthSource:'boreholeTrace.md',intervals:holeIntervals(f,imported.depth,sourceProvenance),
          provenance:sourceProvenance,color:styleOf(L,f).stroke||'#7c3aed'});
        return;
      }
      if(L.gtype==='line'){
        const before=out.length;
        parts.forEach(part=>{
          if(part.some(p=>!Number.isFinite(p[2])))return;
          let measured=0;const points=part.map((p,i)=>{if(i){const a=part[i-1];measured+=Math.hypot(p[0]-a[0],p[1]-a[1],p[2]-a[2]);}
            return {x:p[0],y:p[1],z:p[2],md:measured};}),
            stated=finite(getProp(props,['PROF_M','PROFUNDIDADE','PROF_TOTAL','PROFUNDIDADETOTAL','DEPTH','TOTALDEPTH','FINALDEPTH'])),
            depth=stated!=null&&stated>0?Math.min(stated,measured||stated):measured;
          const clipped=[];
          for(const p of points){
            if(p.md<=depth){clipped.push(p);continue;}
            const a=clipped[clipped.length-1];
            if(a&&a.md<depth){const t=(depth-a.md)/(p.md-a.md);
              clipped.push({x:a.x+(p.x-a.x)*t,y:a.y+(p.y-a.y)*t,z:a.z+(p.z-a.z)*t,md:depth});}
            break;
          }
          const trace=projectHoleTrace(clipped,line,met,corridor);
          if(trace.length>1)out.push({label:holeId,layerId:L.id,layerName:String(L.name||''),feature:fi,trace,depth,
            projection:'sample-xy-to-section',elevationSource:'geometry-z',
            intervals:holeIntervals(f,depth,provenance),provenance,color:styleOf(L,f).stroke||'#7c3aed'});
        });
        if(out.length===before&&warnings)warnings.push(holeId+': linha sem trecho XYZ válido dentro do corredor da seção.');
        return;
      }
      if(!parts.length){if(warnings)warnings.push(holeId+': posição da boca inválida.');return;}
      parts.forEach(part=>part.forEach(p=>{
        const q=closestOnLine(p,line,met);
        const topRaw=holeProp(L,f,'COTA_BOCA',['COTA','COTA_BOCA','ELEVACAO','ELEVAÇÃO','ALTITUDE','RL','Z']),topProp=holeNumber(topRaw),
          pointZ=Number.isFinite(p[2])?p[2]:null,
          top=topProp!=null?topProp:(pointZ!=null?pointZ:raster?sampleGrid(raster.d._full||raster.d,p[0],p[1]):topoAt(profile,q.station)),
          elevationSource=topProp!=null?'collar-property':pointZ!=null?'geometry-z':raster?'collar-mdt':'section-mdt',
          depthRaw=holeProp(L,f,'PROF_M',['PROF_M','PROFUNDIDADE','PROF_TOTAL','PROFUNDIDADETOTAL','DEPTH','TOTALDEPTH','FINALDEPTH']),
          depth=holeNumber(depthRaw),hasDepth=depthRaw!=null&&String(depthRaw).trim()!=='',
          azRaw=holeProp(L,f,'AZIMUTE',['AZIMUTE','AZIMUTH','AZ','DIRECAO','DIREÇÃO']),az=holeNumber(azRaw),
          dipValue=holeProp(L,f,'INCLINACAO',['MERGULHO','DIP','INCLINACAO','INCLINAÇÃO']),dipRaw=holeNumber(dipValue),dip=dipRaw==null?90:dipRaw;
        if(topRaw!=null&&String(topRaw).trim()!==''&&topProp==null){if(warnings)warnings.push(holeId+': cota da boca inválida; corrija o atributo antes de gerar.');return;}
        if(hasDepth&&(depth==null||depth<=0)){if(warnings)warnings.push(holeId+': profundidade total inválida; corrija o atributo antes de gerar.');return;}
        if(!Number.isFinite(top)){
          if(warnings)warnings.push(holeId+': sem cota e profundidade válidas para representar o furo: informe a cota da boca ou um MDT com dados nessa posição.');return;
        }
        if(!hasDepth){
          if(q.distance>Math.max(0,+corridor||0)/2+1e-8){outside.add(fi);return;}
          out.push({label:holeId,layerId:L.id,layerName:String(L.name||''),feature:fi,
            trace:[{x:p[0],y:p[1],z:top,md:0,station:q.station,offset:q.distance,sectionSegment:q.segment}],
            depth:null,offset:q.distance,collarOnly:true,projection:'collar-point-to-section',
            elevationSource,assumedVertical:false,measuredDepthSource:null,intervals:[],provenance,
            color:styleOf(L,f).stroke||'#7c3aed'});
          collars.add(fi);return;
        }
        if((dipValue!=null&&String(dipValue).trim()!==''&&dipRaw==null)||dip<0||dip>90||
          (dip<90&&(az==null||az<0||az>360))){
          if(warnings)warnings.push(holeId+': inclinação/azimute inválidos; confira a orientação do furo.');return;
        }
        const
          rad=dip*Math.PI/180,azr=(az==null?0:az)*Math.PI/180,
          hx=depth*Math.cos(rad)*Math.sin(azr),hy=depth*Math.cos(rad)*Math.cos(azr);
        const trace=projectHoleTrace([{x:p[0],y:p[1],z:top,md:0},
          {x:p[0]+hx,y:p[1]+hy,z:top-depth*Math.sin(rad),md:depth}],line,met,corridor);
        if(trace.length<2){outside.add(fi);return;}
        out.push({label:holeId,layerId:L.id,layerName:String(L.name||''),feature:fi,offset:q.distance,depth,
          trace,projection:'sample-xy-to-section',assumedVertical:dipRaw==null,
          elevationSource,
          intervals:holeIntervals(f,depth,provenance),provenance,color:styleOf(L,f).stroke||'#7c3aed'});
      }));
    });
    if(warnings){
      const visible=new Set(out.map(h=>h.feature));for(const id of visible)outside.delete(id);
      if(outside.size)warnings.push(String(L.name||'Sondagens')+': '+outside.size+' furo(s) fora do corredor total de '+corridor+' m (±'+Math.max(0,+corridor||0)/2+' m do eixo). Confira o eixo A–B ou a largura do corredor.');
      if(filtered.size)warnings.push(String(L.name||'Sondagens')+': '+filtered.size+' furo(s) excluído(s) pelo filtro ou pela categoria da camada.');
      if(collars.size)warnings.push(String(L.name||'Sondagens')+': '+collars.size+' boca(s) sem profundidade/trajetória: representadas apenas por ponto cotado.');
    }
    return out;
  }

  /* ----------------------------------------------------------------------
     Interpretação controlada por mapeamento de campo

     DIRECAO é strike pela regra da mão direita (RHR). A projeção usa apenas
     atitudes planares válidas e preserva a fonte de cada inferência. Pontos
     sem atitude continuam aparecendo como observações, mas não controlam o
     mergulho de contatos/falhas. */
  function apparentDip(strike,dip,sectionAzimuth){
    strike=finite(strike);dip=finite(dip);sectionAzimuth=finite(sectionAzimuth);
    if(strike==null||dip==null||sectionAzimuth==null||dip<0||dip>90)return NaN;
    if(dip===0)return 0;
    const angle=(sectionAzimuth-strike)*Math.PI/180,
      safeDip=Math.min(89.999999,Math.abs(dip))*Math.PI/180,
      value=Math.atan(Math.tan(safeDip)*Math.sin(angle))*180/Math.PI;
    if(Math.abs(dip-90)<1e-9&&Math.abs(Math.sin(angle))>1e-9)return Math.sign(value)*90;
    return Math.abs(value)<1e-10?0:value;
  }
  function closestOnPart(point,part){
    if(!part||!part.length)return null;
    if(part.length===1)return {point:part[0],distance:Math.hypot(point[0]-part[0][0],point[1]-part[0][1])};
    const met=lineMetrics(part),hit=closestOnLine(point,part,met);
    return {point:hit.point,distance:hit.distance};
  }
  function sourceId(L,f,index){
    return String(getProp(f&&f.props,['ID','CODIGO','CÓDIGO','ID_MEDIDA','AMOSTRA','COD_AMOSTRA','FID'])??(index+1));
  }
  function hasFieldValue(value){return value!==undefined&&value!==null&&String(value).trim()!=='';}
  function mappedFieldValue(mapping,record,L,f,canonical,aliases){
    let value=null;
    if(mapping&&typeof mapping.fieldValue==='function'){
      try{value=mapping.fieldValue(L,f,canonical);}catch(e){value=null;}
    }
    if(!hasFieldValue(value)&&record&&record.values&&typeof record.values==='object')
      value=getProp(record.values,[canonical,...(aliases||[])]);
    if(!hasFieldValue(value))value=getProp(f&&f.props,[canonical,...(aliases||[])]);
    return value;
  }
  function structuralRecords(layers,roles){
    const out=[];
    (layers||[]).forEach(L=>(L.features||[]).forEach((f,feature)=>{
      if(!featureVisibleSafe(L,f))return;
      const kind=String(L._geology&&L._geology.kind||'').toLowerCase(),
        declaredRole=roles&&roles[String(L.id)],role=declaredRole||roleForLayer(L),
        declaredKind=!kind&&({structure:'acamamento',fault:'falha',fracture:'fratura',vein:'veio',shearzone:'zona-cisalhamento'})[declaredRole],
        // O papel escolhido na seção é contexto de leitura, não adoção da
        // camada nem declaração da convenção angular de seus atributos.
        orientationLayer=declaredKind?Object.assign({},L,{_geology:Object.assign({},L._geology,{kind:declaredKind})}):L;
      /* fieldMapping é opcional e carregado depois deste módulo. Consulte a
         API dinamicamente para que projetos antigos continuem autônomos. */
      const mapping=api.fieldMapping,legacyField=f._field&&typeof f._field==='object'?f._field:{},
        mappedRecord=mapping&&typeof mapping.fieldRecord==='function'?(function(){
          try{return mapping.fieldRecord(orientationLayer,f,feature)||null;}catch(e){return null;}
        })():null,
        field=Object.assign({},legacyField,mappedRecord&&mappedRecord.meta&&typeof mappedRecord.meta==='object'?mappedRecord.meta:{}),
        fieldStatus=norm(mappedRecord&&mappedRecord.status||legacyField.status||'');
      /* A ausência de status é o contrato legado. Na ficha nova, rascunhos
         e registros inválidos não podem controlar contatos ou falhas. */
      if(/^(DRAFT|RASCUNHO|INVALID|INVALIDO)$/.test(fieldStatus))return;
      if(['lineacao','plunging','dobra','sondagem','spt'].includes(kind))return;
      const rawDirection=finite(mappedFieldValue(mapping,mappedRecord,L,f,'DIRECAO',
          ['DIREÇÃO','STRIKE','DIPDIR','DIP_DIR','RUMO','AZIMUTE','AZIMUTH'])),
        dip=finite(mappedFieldValue(mapping,mappedRecord,L,f,'MERGULHO',
          ['DIP','INCLINACAO','INCLINAÇÃO'])),
        orientationRef=norm(mappedFieldValue(mapping,mappedRecord,L,f,'REF_ORIENT',
          ['ORIENT_REF','CONVENCAO','CONVENÇÃO'])||L._geology&&L._geology.orientationRef||
          (getProp(f.props,['STRIKE'])!=null?'strike_rhr':getProp(f.props,['DIPDIR','DIP_DIR'])!=null?'dip_direction':''));
      let orientation=null;
      if(mapping&&typeof mapping.orientationOf==='function'){
        try{orientation=mapping.orientationOf(orientationLayer,f);}catch(e){return;}
        if(!orientation||!orientation.valid||orientation.type!=='planar')return;
      }else{
        if(rawDirection==null||rawDirection<0||rawDirection>360||dip==null||dip<0||dip>90||
          !['STRIKERHR','DIPDIRECTION','DIPDIR'].includes(orientationRef))return;
        orientation={valid:true,type:'planar',direction:rawDirection%360,dip,ref:orientationRef,
          strike:orientationRef==='STRIKERHR'?rawDirection%360:(rawDirection+270)%360};
      }
      const parts=featureParts(L,f);if(!parts.length)return;
      out.push({strike:orientation.strike,dip:orientation.dip,rawDirection:orientation.direction??rawDirection,
        orientationRef:orientation.ref||orientationRef,role,parts,point:parts[0][0],
        unit:String(mappedFieldValue(mapping,mappedRecord,L,f,'UNIDADE',
          ['DOMINIO','DOMÍNIO','LITOLOGIA','FORMACAO','FORMAÇÃO'])||''),
        quality:String(mappedFieldValue(mapping,mappedRecord,L,f,'CONFIANCA',
          ['CONFIANÇA','QUALIDADE','PRECISAO','PRECISÃO'])||''),
        locationConfidenceM:finite(mappedFieldValue(mapping,mappedRecord,L,f,'PREC_LOC_M',
          ['LOC_CONF_M','ERRO_M']))??finite(field.accuracyM),
        orientationConfidenceDeg:finite(mappedFieldValue(mapping,mappedRecord,L,f,'PREC_ORI_G',
          ['ORI_CONF_G','ERRO_GRAU']))??finite(field.orientationAccuracyDeg),
        identityConfidence:String(mappedFieldValue(mapping,mappedRecord,L,f,'CONF_IDENT',
          ['IDENT_CONF'])||field.identityConfidence||''),
        source:{layerId:L.id,layerName:L.name||'',feature,kind:String(L._geology&&L._geology.kind||''),
          id:sourceId(L,f,feature),fieldId:String(field.fieldId||field.id||sourceId(L,f,feature)),label:labelOf(L,f),
          sourceFile:String(field.sourceFile||''),operator:String(field.operator||''),origin:String(field.origin||''),
          source:String(field.source||'camada'),observedAt:String(field.observedAt||''),
          sourceType:String(field.source||'camada')}});
    }));
    return out;
  }
  function nearestStructure(point,records,radius,options){
    radius=Math.max(0,+radius||0);let best=null;options=options||{};
    const units=(options.units||[]).map(norm).filter(Boolean);
    (records||[]).forEach(record=>{
      if(options.event&&!compatibleStructure(options.event,record))return;
      const match=options.event?structureMatch(options.event,record):'compatible',rank=match==='linked'?0:match==='direct'?1:2;
      if(options.event&&(options.event.attitudeIds||[]).length&&match!=='linked')return;
      const recordUnit=norm(record.unit);
      if(match==='compatible'&&units.length&&recordUnit&&!units.includes(recordUnit))return;
      let local=null;(record.parts||[]).forEach(part=>{const hit=closestOnPart(point,part);if(hit&&(!local||hit.distance<local.distance))local=hit;});
      if(!local||local.distance>radius+1e-9)return;
      if(!best||rank<best.rank||(rank===best.rank&&local.distance<best.distance))best={record,distance:local.distance,point:local.point,rank,match};
    });
    return best;
  }
  function structureMatch(event,record){
    const source=record.source||{},direct=event.layerId!=null&&String(event.layerId)===String(source.layerId)&&event.feature===source.feature,
      linked=(event.attitudeIds||[]).some(id=>String(id)===String(source.id)||String(id)===String(source.fieldId));
    return linked?'linked':direct?'direct':'compatible';
  }
  function compatibleStructure(event,record){
    const source=record.source||{};
    if(structureMatch(event,record)!=='compatible')return true;
    const role=record.role||roleForLayer({_geology:{kind:source.kind},name:source.layerName,gtype:'point'});
    if(event.kind==='contact')return ['structure','contact'].includes(role);
    return ['fault','fracture','vein','shearzone'].includes(event.kind)&&role===event.kind;
  }
  function confidenceFor(record,distance,radius){
    const q=norm(record&&record.quality),base=/ALTA|BOA|CONFIRM|MEDID/.test(q)?1:
      /BAIXA|RUIM|INFERID|DUVID/.test(q)?.42:/MEDIA|MODERAD|REGULAR/.test(q)?.7:.72,
      spatial=radius>0?(.55+.45*(1-clamp(distance/radius,0,1))):1,
      loc=record&&record.locationConfidenceM!=null?(.6+.4*(1-clamp(record.locationConfidenceM/radius,0,1))):1,
      ori=record&&record.orientationConfidenceDeg!=null?(.55+.45*(1-clamp(record.orientationConfidenceDeg/45,0,1))):1,
      score=clamp(base*spatial*loc*ori,0,1);
    return {score,label:score>=.76?'alta':score>=.5?'média':'baixa'};
  }
  function projectFieldEvent(event,records,options){
    options=options||{};if(!event||!Array.isArray(event.point)||!Number.isFinite(+event.z))return null;
    const radius=Math.max(1,+options.radius||300),near=nearestStructure(event.point,records,radius,{units:event.units,event});if(!near)return null;
    const sectionAz=finite(options.sectionAzimuth)??finite(event.sectionAzimuth),
      app=apparentDip(near.record.strike,near.record.dip,sectionAz);
    if(!Number.isFinite(app))return null;
    const requestedDepth=Math.max(1,+options.depth||150),total=Math.max(0,+options.total||0),
      direction=app<0?-1:1,angle=Math.abs(app)*Math.PI/180,
      idealHorizontal=angle<1e-6?Math.min(radius,requestedDepth):requestedDepth/Math.tan(angle),
      available=direction>0?Math.max(0,total-event.station):Math.max(0,event.station),
      horizontal=Math.min(Math.max(0,idealHorizontal),available),
      actualDepth=angle<1e-6?0:Math.min(requestedDepth,horizontal*Math.tan(angle)),
      confidence=confidenceFor(near.record,near.distance,radius);
    return {method:near.match==='linked'?'linked-field-attitude':near.match==='direct'?'feature-attitude':'nearest-field-attitude',origin:'mapeamento-de-campo',strike:near.record.strike,
      trueDip:near.record.dip,apparentDip:app,distance:near.distance,requestedDepth,depth:actualDepth,
      startStation:event.station,startZ:event.z,endStation:event.station+direction*horizontal,endZ:event.z-actualDepth,
      confidence:confidence.label,confidenceScore:confidence.score,quality:near.record.quality||'',
      locationConfidenceM:near.record.locationConfidenceM,orientationConfidenceDeg:near.record.orientationConfidenceDeg,
      identityConfidence:near.record.identityConfidence||'',orientationRef:near.record.orientationRef,
      rawDirection:near.record.rawDirection,source:{...near.record.source},
      sourcePoint:near.point&&near.point.slice?near.point.slice():near.point};
  }
  function observationObjects(layers,line,met,profile,corridor,kind){
    const out=[];
    (layers||[]).forEach(L=>(L.features||[]).forEach((f,feature)=>{
      if(!featureVisibleSafe(L,f))return;
      featureParts(L,f).forEach(part=>part.forEach(point=>{
        const hit=closestOnLine(point,line,met);if(hit.distance>corridor/2)return;
        const props=f.props||{},propZ=finite(getProp(props,['COTA','ELEVACAO','ELEVAÇÃO','ALTITUDE','RL','Z'])),
          z=Number.isFinite(point[2])?point[2]:(propZ!=null?propZ:topoAt(profile,hit.station));
        out.push({kind:kind||'observation',station:hit.station,z,offset:hit.distance,
          label:labelOf(L,f),color:styleOf(L,f).stroke||L.color||'#e07b24',
          source:{layerId:L.id,layerName:L.name||'',feature,kind:String(L._geology&&L._geology.kind||''),id:sourceId(L,f,feature)}});
      }));
    }));
    return out;
  }
  function metricSectionCRS(){
    const code=String(S.workCRS||'').toUpperCase();let def=null;
    try{if(typeof proj4!=='undefined'&&typeof proj4.defs==='function')def=proj4.defs(S.workCRS);}catch(e){}
    if(def){
      if(typeof def==='string')return /\+units=m(?:\s|$)/.test(def)&&!/\+proj=longlat/.test(def);
      return def.projName!=='longlat'&&(def.units==='m'||Number(def.to_meter)===1);
    }
    return /^EPSG:(319(?:7[2-9]|8[0-5])|291(?:01|8[8-9]|9[0-5])|225(?:1[8-9]|2[0-5])|32[67]\d\d|3857)$/.test(code);
  }

  function generate(){
    if(S.tool===TOOL&&!finishDraw())return null;
    const q=readForm(),line=q.line&&q.line.length>1?q.line:lineFromWgs(q.lineWgs);
    invalidateResult();
    if(!line||line.length<2){notify('Trace a linha A–B ou escolha uma linha existente');return null;}
    if(!metricSectionCRS()){notify('A seção exige um CRS de trabalho projetado em metros; escolha uma projeção métrica antes de gerar.');return null;}
    const raster=(S.rasters||[]).find(r=>String(r.id)===String(q.rasterId)),
      selected=q.layerIds.map(id=>S.layers.find(L=>String(L.id)===String(id))).filter(L=>L&&!isMeshLayer(L)),
      holes=selected.filter(L=>layerRole(L,q)==='hole');
    if((!raster||!raster.d)&&!q.meshIds.length&&!holes.length&&!q.rasterProfiles.length){notify('Escolha uma superfície/MDT, um raster adicional ou uma malha 3D, ou selecione sondagens com cotas próprias');return null;}
    const met=lineMetrics(line);if(!met.total){notify('A linha da seção não possui extensão');return null;}
    const terrain=raster&&raster.d?raster:null,step=Math.max(.25,q.step||Math.max(.5,Math.min(terrain&&+terrain.d.cs||5,met.total/300))),
      cuts=meshSections(q.meshIds,line),meshZ=cuts.flatMap(m=>[...m.polylines.map(p=>p.points),...(m.fillPolygons||[])].flatMap(points=>points.map(v=>v[1]))),
      profile=sectionProfile(line,terrain,step),
      hasTerrain=!!(profile&&profile.series&&profile.series[0]&&profile.series[0].z.some(Number.isFinite));
    const rasterProfiles=api.rasterProfiles?api.rasterProfiles.sampleProfiles({
      entries:q.rasterProfiles.filter(e=>e.id!==String(q.rasterId)),rasters:S.rasters||[],dist:profile.dist,
      points:profile.pts,terrainZ:profile.series[0].z,sampleRaster:projectRasterSample}):[];
    const holeResults=[],holeWarnings=[];
    const omitted=(S.layers||[]).filter(L=>likelyGeological(L)&&roleForLayer(L)==='hole'&&
      (!q.layerIds.includes(String(L.id))||layerRole(L,q)!=='hole'));
    if(omitted.length)holeWarnings.push('Camadas de sondagens não incluídas como furos nesta seção: '+omitted.map(L=>L.name).join(', ')+'. Marque-as em Camadas geológicas e escolha Sondagens/furos.');
    holes.forEach(L=>holeResults.push(...holeObjects(L,line,met,profile,q.corridor,terrain,holeWarnings)));
    const holeZ=holeResults.flatMap(h=>h.trace.map(p=>p.z).filter(Number.isFinite)),ownZ=meshZ.concat(holeZ,rasterProfiles.flatMap(p=>p.z.filter(Number.isFinite)));
    if(!hasTerrain&&!ownZ.length){
      notify([...holeWarnings,...rasterProfiles.map(p=>p.sourceName+': '+p.warning),...cuts.flatMap(m=>m.warnings.map(w=>m.name+': '+w))].join(' · ')||
        (q.meshIds.length?'O eixo não atravessa as malhas selecionadas.':holes.length?'Nenhuma sondagem com cota e profundidade válidas no corredor da seção.':'O eixo A–B não encontra cotas válidas no MDT'));return null;
    }
    const geologyBase=q.geologyBase==null?null:projectZ(q.geologyBase),minTerrain=profile.series[0].z.filter(Number.isFinite).reduce((a,b)=>Math.min(a,b),Infinity);
    if(geologyBase!==null&&(!Number.isFinite(geologyBase)||(hasTerrain?geologyBase>=minTerrain:ownZ.every(z=>z<=geologyBase)))){
      notify(hasTerrain?'A cota inferior da geologia deve ser um número em metros abaixo da menor cota do terreno ('+minTerrain.toFixed(2)+' m).':'Informe uma cota inferior válida, abaixo do corte das malhas ou sondagens.');return null;
    }
    const polygons=selected.filter(L=>layerRole(L,q)==='lithology'&&L.gtype==='polygon'),
      lines=selected.filter(L=>L.gtype==='line'&&['contact','fault','fracture','vein','shearzone'].includes(layerRole(L,q))),
      shearPolygons=selected.filter(L=>L.gtype==='polygon'&&layerRole(L,q)==='shearzone'),
      structures=selected.filter(L=>layerRole(L,q)==='structure'),
      observations=selected.filter(L=>layerRole(L,q)==='observation'),contacts=[],faults=[],fractures=[],veins=[],shearzones=[],
      byRole={contact:contacts,fault:faults,fracture:fractures,vein:veins,shearzone:shearzones};
    lines.forEach(L=>{
      const role=layerRole(L,q);byRole[role].push(...lineEvents(L,line,met,profile,role));
    });
    shearPolygons.forEach(L=>shearzones.push(...mappedPolygonExtents(L,line,met,profile,'shearzone')));
    const poly=polygonEventsAndRuns(polygons,line,met,profile);contacts.push(...poly.events);
    const fieldRecords=q.useField?structuralRecords([...structures,...lines],q.roles):[];
    const events=contacts.concat(faults,fractures,veins,shearzones.filter(event=>event.extentType!=='mapped-surface'));
    if(q.useField)events.forEach(event=>{
      event.interpretation=projectFieldEvent(event,fieldRecords,{radius:q.fieldRadius,depth:q.fieldDepth,
        sectionAzimuth:event.sectionAzimuth,total:met.total});
    });
    const fieldMarks=[...observationObjects(observations,line,met,profile,q.corridor,'observation'),
      ...observationObjects(structures,line,met,profile,q.corridor,'attitude')];
    const projects=projectProfiles(q.projectSources,line,met,step,terrain);
    q.line=line.map(p=>p.slice(0,3));q.result={name:q.name,line:q.line,profile,met,rasterId:terrain?terrain.id:null,
      rasterName:terrain?terrain.name:'Sem MDT',hasTerrain,step:profile.actualStep,corridor:q.corridor,ve:q.ve,runs:hasTerrain?poly.runs:[],contacts,faults,fractures,veins,shearzones,holes:holeResults,holeWarnings,
      rasterProfiles,lineStyles:copy(q.lineStyles),terrainWarning:q.rasterId&&!terrain?'MDT selecionado indisponível (ID: '+q.rasterId+'); nenhuma outra fonte foi usada como terreno.':'',
      projects,meshSections:cuts,geologyBase,fieldMarks,field:{enabled:q.useField,radius:q.fieldRadius,depth:q.fieldDepth,records:fieldRecords.length,
        interpreted:events.filter(event=>event.interpretation).length},generatedAt:new Date().toISOString()};
    drawSection(q.result);
    renderLineStyles(q.result);
    renderResultSummary(q.result);
    const actions=document.getElementById('gsecActions');if(actions)actions.hidden=false;
    notify('Seção geológica gerada');return q.result;
  }

  function sectionLines(result){
    const rows=[];
    if(result.rasterId!=null||result.profile.series[0].z.some(Number.isFinite))rows.push({key:'raster:'+result.rasterId,
      name:'Terreno — '+result.rasterName,sourceName:result.rasterName,role:'terrain',fallback:{color:'#202a33',width:2.5,dash:'solid',visible:true}});
    (result.rasterProfiles||[]).forEach(p=>rows.push({...p,name:roleName(p.role)+' — '+p.sourceName,fallback:p.role,
      status:!p.z.some(Number.isFinite)?' · sem dados no eixo / fonte indisponível':p.warning?' · contém lacunas':''}));
    (result.meshSections||[]).forEach(p=>rows.push({key:'mesh:'+p.id,name:(p.closedSolid?'Sólido — ':'Superfície — ')+p.name,sourceName:p.name,
      status:p.error?' · corte indisponível':!p.polylines.length?' · sem interseção':'',fallback:{color:p.color,width:2,dash:'solid',visible:true}}));
    (result.projects||[]).forEach(p=>rows.push({key:'project:'+p.key,name:'Projeto — '+p.name,sourceName:p.name,
      status:p.warning?' · '+p.warning:'',fallback:{color:p.color,width:2.5,dash:'solid',visible:true}}));
    return rows.map(row=>{const style=api.rasterProfiles?api.rasterProfiles.normalizeStyle((result.lineStyles||{})[row.key],row.fallback):
      {color:'#202a33',width:2.5,dash:'solid',visible:true,...(typeof row.fallback==='object'?row.fallback:{}),...((result.lineStyles||{})[row.key]||{})};
      return {...row,style,name:style.name||row.name};});
  }
  function lineDashes(style){return api.rasterProfiles?api.rasterProfiles.dashes(style):[];}
  function renderLineStyles(result){
    const box=document.getElementById('gsecStyleBox'),list=document.getElementById('gsecStyleList');if(!box||!list)return;
    const rows=result?sectionLines(result):[];box.hidden=!rows.length;
    list.innerHTML=rows.map(row=>'<div class="gsec-style-row" data-style-key="'+esc(row.key)+'">'+
      '<label class="gsec-check"><input class="gsec-line-visible" type="checkbox" aria-label="Mostrar '+esc(row.sourceName)+'"'+(row.style.visible?' checked':'')+'><span>'+esc(row.sourceName)+'</span></label>'+
      '<label>Nome na seção<input type="text" class="gsec-line-name" maxlength="240" value="'+esc(row.name)+'"></label><div class="gsec-style-controls">'+
      '<label>Cor<input class="gsec-line-color" type="color" value="'+esc(row.style.color)+'"></label>'+
      '<label>Espessura<input class="gsec-line-width" type="number" min="0.5" max="10" step="0.5" value="'+row.style.width+'"></label>'+
      '<label>Traçado<select class="gsec-line-dash">'+[['solid','Contínuo'],['dash','Tracejado'],['dot','Pontilhado'],['dashdot','Traço-ponto']].map(([v,n])=>'<option value="'+v+'"'+(row.style.dash===v?' selected':'')+'>'+n+'</option>').join('')+'</select></label></div></div>').join('');
  }
  function editLineStyle(event){
    const row=event.target.closest('[data-style-key]'),q=state();if(!row||!q.result||!api.rasterProfiles)return;
    const descriptor=sectionLines(q.result).find(r=>r.key===row.dataset.styleKey);if(!descriptor)return;
    q.lineStyles[row.dataset.styleKey]=api.rasterProfiles.normalizeStyle({name:row.querySelector('.gsec-line-name').value,
      color:row.querySelector('.gsec-line-color').value,width:row.querySelector('.gsec-line-width').value,
      dash:row.querySelector('.gsec-line-dash').value,visible:row.querySelector('.gsec-line-visible').checked},descriptor.fallback);
    q.result.lineStyles=copy(q.lineStyles);drawSection(q.result);renderResultSummary(q.result);
  }
  function drawSection(result){
    const cv=document.getElementById('gsecCanvas');if(!cv||!cv.getContext)return;
    const projects=result.projects||[],meshes=result.meshSections||[],ctx=cv.getContext('2d'),W=1100,mL=72,mR=24,mT=42,dist=result.profile.dist,
      topo=result.profile.series[0].z,valid=topo.filter(Number.isFinite),extra=[],
      lines=sectionLines(result),styles=new Map(lines.map(row=>[row.key,row.style])),legend=lines.filter(row=>row.style.visible),
      mB=62+22*legend.length;
    result.holes.forEach(h=>h.trace.forEach(p=>{if(Number.isFinite(p.z))extra.push(p.z);}));
    sectionEvents(result).forEach(p=>{if(Number.isFinite(p.z))extra.push(p.z);});
    sectionEvents(result).forEach(p=>{const i=p.interpretation;if(i&&Number.isFinite(i.endZ))extra.push(i.endZ);});
    (result.fieldMarks||[]).forEach(p=>{if(Number.isFinite(p.z))extra.push(p.z);});
    projects.forEach(project=>[...(project.points||[]),...(project.segments||[]).flat()].forEach(p=>{if(Number.isFinite(p.z))extra.push(p.z);}));
    meshes.forEach(mesh=>mesh.polylines.forEach(line=>line.points.forEach(p=>extra.push(p[1]))));
    meshes.forEach(mesh=>(mesh.fillPolygons||[]).forEach(points=>points.forEach(p=>extra.push(p[1]))));
    (result.rasterProfiles||[]).forEach(p=>p.z.forEach(z=>{if(Number.isFinite(z))extra.push(z);}));
    if(Number.isFinite(result.geologyBase))extra.push(result.geologyBase);
    if(!valid.length&&!extra.length)return;
    let zMin=Infinity,zMax=-Infinity;
    for(const z of valid.concat(extra)){if(z<zMin)zMin=z;if(z>zMax)zMax=z;}
    let zr=Math.max(1,zMax-zMin);
    const fixedBase=Number.isFinite(result.geologyBase);
    zMin=fixedBase?result.geologyBase:zMin-Math.max(5,zr*.08);
    zMax+=Math.max(3,zr*.04);zr=Math.max(1,zMax-zMin);
    const plotH=clamp(zr*(W-mL-mR)/(result.met.total||1),250,760),
      H=Math.ceil(mT+plotH+mB),xScale=Math.min((W-mL-mR)/(result.met.total||1),plotH/zr),
      yScale=xScale,plotW=result.met.total*xScale;
    // A cota escolhida é exatamente o eixo X. Se a altura mínima precisar
    // de espaço extra, acrescentá-lo no topo, nunca abaixo daquela base.
    // A altura máxima reduz AMBOS os eixos: a seção continua em escala 1:1.
    if(fixedBase)zMax=zMin+plotH/yScale;else zMin=zMax-plotH/yScale;
    zr=zMax-zMin;
    result.renderGeometry={xScale,yScale,ve:yScale/xScale,plotW,plotH,zMin,zMax,
      clippedBelowBase:fixedBase&&extra.some(z=>z<zMin)};
    cv.width=W;cv.height=H;cv.style.aspectRatio=W+' / '+H;cv.style.display='block';
    const X=s=>mL+s*xScale,Y=z=>mT+(zMax-z)*yScale,axisY=mT+plotH;
    ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
    ctx.strokeStyle='#dce3ea';ctx.lineWidth=1;ctx.font='12px Signika,Arial,sans-serif';ctx.fillStyle='#52677a';
    const tickZ=Math.pow(10,Math.floor(Math.log10(zr/5||1))),zStep=[1,2,5,10].map(v=>v*tickZ).find(v=>zr/v<=8)||tickZ*10;
    for(let z=Math.ceil(zMin/zStep)*zStep;z<=zMax;z+=zStep){const y=Y(z);ctx.beginPath();ctx.moveTo(mL,y);ctx.lineTo(mL+plotW,y);ctx.stroke();ctx.fillText(z.toFixed(zStep<1?1:0)+' m',8,y+4);}
    const candidates=[10,20,25,50,100,200,250,500,1000,2000,5000,10000],dStep=candidates.find(v=>result.met.total/v<=10)||result.met.total;
    for(let d=0;d<=result.met.total+.001;d+=dStep){const x=X(d);ctx.beginPath();ctx.moveTo(x,mT);ctx.lineTo(x,axisY);ctx.stroke();ctx.fillText(d>=1000?(d/1000).toFixed(1)+' km':Math.round(d)+' m',x-14,axisY+21);}
    // Limite gráfico comum dos domínios. Não representa espessura medida.
    ctx.save();
    if(typeof ctx.rect==='function'&&typeof ctx.clip==='function'){
      ctx.beginPath();ctx.rect(mL,mT,plotW,plotH);ctx.clip();
    }
    // Cada trecho válido fecha até o eixo X; NoData não vira terreno.
    const terrainAt=station=>{
      if(station<dist[0]-1e-8||station>dist[dist.length-1]+1e-8)return NaN;
      let i=0;while(i<dist.length-1&&dist[i]<station-1e-8)i++;
      if(Math.abs(dist[i]-station)<1e-8)return topo[i];
      if(i===0||!Number.isFinite(topo[i-1])||!Number.isFinite(topo[i]))return NaN;
      return topo[i-1]+(topo[i]-topo[i-1])*(station-dist[i-1])/(dist[i]-dist[i-1]);
    };
    result.runs.forEach(run=>{
      const a=Number.isFinite(run.startStation)?run.startStation:dist[run.startIndex],
        b=Number.isFinite(run.endStation)?run.endStation:dist[run.endIndex];
      if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)return;
      const stations=[a,...dist.filter(s=>s>a+1e-8&&s<b-1e-8),b];let points=[];
      const finish=()=>{
        if(points.length>1){
          ctx.beginPath();points.forEach((p,i)=>{if(i)ctx.lineTo(X(p[0]),Y(p[1]));else ctx.moveTo(X(p[0]),Y(p[1]));});
          ctx.lineTo(X(points[points.length-1][0]),axisY);ctx.lineTo(X(points[0][0]),axisY);
          ctx.closePath();ctx.globalAlpha=.72;ctx.fillStyle=run.color;ctx.fill();ctx.globalAlpha=1;
        }
        points=[];
      };
      stations.forEach(s=>{const z=terrainAt(s);if(Number.isFinite(z))points.push([s,z]);else finish();});finish();
    });
    // Cortes de malha usam somente a geometria intersectada. A base do
    // gráfico recorta o desenho, sem prolongar nem fechar o corpo até ela.
    meshes.forEach(mesh=>{
      const style=styles.get('mesh:'+mesh.id);if(style&&!style.visible)return;
      const closed=mesh.closedSolid?(Array.isArray(mesh.fillPolygons)?mesh.fillPolygons.map(points=>({points,closed:true})):
        mesh.polylines.filter(p=>p.closed&&p.points.length>=3)):[];
      const path=p=>{p.points.forEach((v,i)=>{if(i)ctx.lineTo(X(v[0]),Y(v[1]));else ctx.moveTo(X(v[0]),Y(v[1]));});if(p.closed)ctx.closePath();};
      if(closed.length){
        ctx.beginPath();closed.forEach(path);ctx.fillStyle=style?style.color:mesh.color;ctx.globalAlpha=.48;ctx.fill('evenodd');ctx.globalAlpha=1;
      }
      ctx.strokeStyle=style?style.color:mesh.color;ctx.lineWidth=style?style.width:2;ctx.setLineDash(lineDashes(style));
      mesh.polylines.forEach(p=>{ctx.beginPath();path(p);ctx.stroke();});
      ctx.setLineDash([]);
    });
    (result.shearzones||[]).filter(zone=>zone.extentType==='mapped-surface').forEach(zone=>{
      const samples=[zone.startStation,...dist.filter(s=>s>zone.startStation&&s<zone.endStation),zone.endStation];
      ctx.save();ctx.strokeStyle=zone.color||'#da6a3a';ctx.lineWidth=7;ctx.setLineDash([3,3]);ctx.beginPath();
      samples.forEach((s,i)=>{const x=X(s),y=Y(topoAt(result.profile,s))-5;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});
      ctx.stroke();ctx.setLineDash([]);ctx.font='10px Signika,Arial,sans-serif';ctx.fillStyle=zone.color||'#da6a3a';
      const mid=(zone.startStation+zone.endStation)/2;
      ctx.fillText(zone.label+' · cisalhamento mapeado na superfície',X(mid)+4,Y(topoAt(result.profile,mid))-13);ctx.restore();
    });
    // Furos antes da topografia, para que a boca fique ancorada no terreno.
    result.holes.forEach(h=>{
      ctx.strokeStyle=h.color||'#6d28d9';ctx.lineWidth=3;ctx.beginPath();let started=false;
      h.trace.forEach(p=>{if(!Number.isFinite(p.z)){started=false;return;}const x=X(p.station),y=Y(p.z);if(!started||p.breakBefore){ctx.moveTo(x,y);started=true;}else ctx.lineTo(x,y);});ctx.stroke();
      (h.intervals||[]).forEach((interval,index)=>{
        const path=traceSliceByDepth(h.trace,interval.from,interval.to,h.depth);if(path.length<2)return;
        const strokePath=()=>{ctx.beginPath();path.forEach((p,i)=>{const x=X(p.station),y=Y(p.z);if(i&&!p.breakBefore)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();};
        ctx.save();ctx.lineCap='butt';ctx.lineJoin='round';ctx.strokeStyle='rgba(255,255,255,.96)';ctx.lineWidth=9;strokePath();
        ctx.strokeStyle=interval.color||lithologyColor(interval.lithology);ctx.lineWidth=6;strokePath();ctx.restore();
        const middle=tracePointAtDepth(h.trace,(interval.from+interval.to)/2,h.depth);
        if(middle&&Number.isFinite(middle.z)){
          const tx=X(middle.station)+(index%2?8:10),ty=Y(middle.z)+(index%2?5:-4),
            text=String(interval.lithology||'Sem litologia');
          ctx.save();ctx.font='700 10px Signika,Arial,sans-serif';ctx.lineJoin='round';ctx.lineWidth=3.5;
          ctx.strokeStyle='rgba(255,255,255,.98)';if(typeof ctx.strokeText==='function')ctx.strokeText(text,tx,ty);
          ctx.fillStyle='#243342';ctx.fillText(text,tx,ty);ctx.restore();
        }
      });
      const p=h.trace[0];if(p&&Number.isFinite(p.z)){ctx.fillStyle='#fff';ctx.strokeStyle=h.color||'#6d28d9';ctx.lineWidth=2;
        if(!p.md){ctx.beginPath();ctx.arc(X(p.station),Y(p.z),4,0,Math.PI*2);ctx.fill();ctx.stroke();}
        ctx.fillStyle='#3b2b55';ctx.fillText(h.label+(h.collarOnly?' · boca sem trajetória':p.md?' · trecho no corredor':''),X(p.station)+6,Y(p.z)-5);}
    });
    const interpreted=(p,kind)=>{
      const isFault=kind==='fault',color=isFault?'#c62828':(p.color||({vein:'#9b5ba6',fracture:'#506579',shearzone:'#da6a3a'}[kind]||'#9a5b1b')),
        dash={fault:[10,4,2,4],fracture:[3,4],vein:[9,3],shearzone:[3,3]}[kind]||[7,5];
      if(!Number.isFinite(p.z))return;const x=X(p.station),y=Y(p.z),i=p.interpretation;
      if(!i){
        // Uma interseção sem atitude é apenas uma marca superficial, não
        // uma linha inclinada arbitrária que aparenta definir profundidade.
        ctx.strokeStyle=color;ctx.lineWidth=isFault?3:kind==='vein'?4:1.5;ctx.setLineDash(kind==='fracture'?[2,2]:[]);
        ctx.beginPath();ctx.moveTo(x,y-7);ctx.lineTo(x,y+7);ctx.stroke();ctx.setLineDash([]);return;
      }
      const x2=X(i.endStation),y2=Y(i.endZ),uncertainty=i.confidence==='alta'?6:i.confidence==='média'?10:15;
      ctx.save();ctx.strokeStyle=color;ctx.globalAlpha=i.confidence==='alta'?.12:i.confidence==='média'?.17:.22;
      ctx.lineWidth=uncertainty;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore();
      ctx.strokeStyle=color;ctx.lineWidth=isFault?3:kind==='vein'?4:2;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();
      const mx=(x+x2)/2,my=(y+y2)/2;ctx.font='700 10px Signika,Arial,sans-serif';ctx.fillStyle='#374151';
      ctx.fillText('β '+Math.abs(i.apparentDip).toFixed(1)+'° · '+i.confidence,mx+4,my-4);
    };
    sectionEvents(result).forEach(p=>interpreted(p,p.kind));
    (result.fieldMarks||[]).forEach(p=>{
      if(!Number.isFinite(p.z))return;const x=X(p.station),y=Y(p.z),att=p.kind==='attitude';
      ctx.save();ctx.translate(x,y);ctx.fillStyle=p.color||'#e07b24';ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.beginPath();
      if(att){ctx.moveTo(0,-5);ctx.lineTo(5,4);ctx.lineTo(-5,4);}else{ctx.moveTo(0,-5);ctx.lineTo(5,0);ctx.lineTo(0,5);ctx.lineTo(-5,0);}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    });
    projects.forEach(project=>{
      const style=styles.get('project:'+project.key)||{color:project.color,width:2.5,visible:true};if(!style.visible)return;
      ctx.strokeStyle=style.color;ctx.fillStyle=style.color;ctx.lineWidth=style.width;ctx.setLineDash(lineDashes(style));
      (project.segments||[]).forEach(segment=>{
        ctx.beginPath();segment.forEach((p,i)=>{if(i)ctx.lineTo(X(p.station),Y(p.z));else ctx.moveTo(X(p.station),Y(p.z));});
        ctx.strokeStyle='rgba(255,255,255,.92)';ctx.lineWidth=style.width+2;ctx.stroke();
        ctx.strokeStyle=style.color;ctx.lineWidth=style.width;ctx.stroke();
        if(segment.length===1){ctx.beginPath();ctx.arc(X(segment[0].station),Y(segment[0].z),3,0,Math.PI*2);ctx.fill();}
      });
      (project.points||[]).forEach(p=>{ctx.beginPath();ctx.arc(X(p.station),Y(p.z),3.5,0,Math.PI*2);ctx.fill();});
      ctx.setLineDash([]);
    });
    const rasterLine=(values,key)=>{
      const style=styles.get(key);if(!style||!style.visible)return;
      ctx.strokeStyle=style.color;ctx.lineWidth=style.width;ctx.setLineDash(lineDashes(style));ctx.beginPath();let begun=false;
      values.forEach((z,i)=>{if(!Number.isFinite(z)){begun=false;return;}const x=X(dist[i]),y=Y(z);if(!begun){ctx.moveTo(x,y);begun=true;}else ctx.lineTo(x,y);});ctx.stroke();ctx.setLineDash([]);
    };
    rasterLine(topo,'raster:'+result.rasterId);
    (result.rasterProfiles||[]).forEach(p=>rasterLine(p.z,p.key));
    ctx.restore();
    ctx.fillStyle='#17293b';ctx.font='700 14px Signika,Arial,sans-serif';ctx.fillText(result.name||'Seção A–B',mL,mT-18);
    const ownSources=[meshes.length?'malhas 3D':'',result.holes.length?'sondagens com cotas próprias':'',(result.rasterProfiles||[]).length?'rasters adicionais':''].filter(Boolean).join(', ');
    ctx.font='12px Signika,Arial,sans-serif';ctx.fillStyle='#52677a';ctx.fillText((valid.length?'MDT: '+result.rasterName:'Sem terreno · '+ownSources)+' · corredor '+result.corridor+' m · mesma escala horizontal e vertical'+(result.field&&result.field.enabled?' · campo: '+result.field.interpreted+' projeção(ões)':''),mL+180,mT-18,W-mL-mR-180);
    ctx.fillStyle='#17293b';ctx.font='700 15px Signika,Arial,sans-serif';ctx.fillText('A',mL-4,axisY+43);ctx.fillText('B',mL+plotW-6,axisY+43);
    ctx.strokeStyle='#17293b';ctx.lineWidth=1.5;ctx.strokeRect(mL,mT,plotW,plotH);
    legend.forEach((item,i)=>{const y=axisY+63+i*22;ctx.strokeStyle=item.style.color;ctx.lineWidth=item.style.width;ctx.setLineDash(lineDashes(item.style));ctx.beginPath();ctx.moveTo(mL,y);ctx.lineTo(mL+26,y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#17293b';ctx.font='12px Signika,Arial,sans-serif';ctx.fillText(item.name+(item.status||''),mL+35,y+4,W-mL-mR-35);});
  }
  function renderResultSummary(r){
    const el=document.getElementById('gsecOut');if(!el)return;
    const units=new Set(r.runs.filter(x=>x.layerId!=null).map(x=>x.label)),
      holeIntervalsCount=r.holes.reduce((total,h)=>total+(h.intervals||[]).length,0);
    const field=r.field&&r.field.enabled?'<br><b>Interpretação de campo:</b> '+r.field.interpreted+' limite(s) projetado(s) com '+r.field.records+' atitude(s) disponível(is) · raio '+r.field.radius+' m · profundidade '+r.field.depth+' m. Linhas tracejadas são extrapolações, não observações.':'',
      projects=(r.projects||[]).map(p=>'<br><b>Projeto — '+esc(p.name)+':</b> '+esc(p.warning||p.method||'perfil de projeto')).join(''),
      meshes=(r.meshSections||[]).map(p=>'<br><b>'+esc(p.name)+':</b> '+p.polylines.length+' contorno(s) de interseção · '+
        (p.error?'corte indisponível':p.closedSolid?'sólido fechado; preenchimento limitado ao corte':'superfície aberta; representação por linhas')+
        (p.warnings.length?' · '+p.warnings.map(esc).join(' · '):'')).join(''),
      base=(r.hasTerrain===false?'<br><b>Limite inferior da vista:</b> ':'<br><b>Geologia até o eixo X:</b> ')+(Number.isFinite(r.geologyBase)?r.geologyBase.toFixed(2)+' m':Number.isFinite(r.renderGeometry?.zMin)?r.renderGeometry.zMin.toFixed(2)+' m (base automática)':'base automática')+
        (r.hasTerrain===false?'. Malhas e sondagens recortadas na moldura, sem prolongamento até a base; nenhuma superfície de terreno foi inferida.':'. Limite gráfico do preenchimento dos domínios mapeados; não representa espessura medida nem continuidade geológica comprovada. As malhas 3D mantêm seus próprios limites.')+
        (r.renderGeometry?.clippedBelowBase?' Há elementos abaixo dessa cota, recortados na visualização; reduza a cota inferior para mostrá-los.':'');
    el.innerHTML='<b>'+esc(r.name)+'</b> · '+formatLength(r.met.total)+'<br>'+esc(r.rasterName)+' · passo '+r.step.toFixed(2)+' m<br>'+units.size+' unidade(s) · '+r.contacts.length+' contato(s) · '+r.faults.length+' falha(s) · '+(r.fractures||[]).length+' fratura(s) · '+(r.veins||[]).length+' veio(s) · '+(r.shearzones||[]).length+' trecho(s) de cisalhamento · '+r.holes.length+' furo(s) · '+holeIntervalsCount+' intervalo(s) de sondagem · '+(r.fieldMarks||[]).length+' observação(ões) no corredor.'+field+
      ((r.shearzones||[]).some(zone=>zone.extentType==='mapped-surface')?'<br>Cisalhamento poligonal: extensão mapeada na superfície; espessura e continuidade em profundidade não inferidas.':'')+
      ((r.holeWarnings||[]).length?'<br><b>Sondagens:</b> '+r.holeWarnings.map(esc).join(' · '):'')+meshes+projects+base+
      (r.terrainWarning?'<br><b>Aviso:</b> '+esc(r.terrainWarning):'')+
      (r.rasterProfiles||[]).map(p=>'<br><b>'+esc(roleName(p.role)+' — '+p.sourceName)+':</b> '+
        (p.mode==='depth'?'cota = terreno − profundidade':'cotas absolutas do raster')+(p.warning?' · '+esc(p.warning):'')).join('');
  }
  function formatLength(v){return v>=1000?(v/1000).toLocaleString('pt-BR',{maximumFractionDigits:2})+' km':v.toLocaleString('pt-BR',{maximumFractionDigits:1})+' m';}

  function lineFromWgs(ll){
    return (ll||[]).map(p=>{try{const q=fromWGS(S.workCRS,p[1],p[0]);return [+q[0],+q[1]];}catch(e){return null;}}).filter(Boolean);
  }
  function wgsFromLine(line){
    return (line||[]).map(p=>{try{const q=toWGS(S.workCRS,p[0],p[1]);return [q[1],q[0]];}catch(e){return null;}}).filter(Boolean);
  }
  function clearCursorLine(){
    if(cursorLine&&previewLayer)previewLayer.removeLayer(cursorLine);
    cursorLine=null;
  }
  function sectionLatLng(e,flash=false){
    let ll=e&&e.latlng;
    if(!ll||!Number.isFinite(ll.lat)||!Number.isFinite(ll.lng))return null;
    // O corte pode começar/terminar em QUALQUER lugar, independente da
    // camada ativa. O ímã global só é usado por escolha explícita da seção.
    try{if(state().snap&&S.snapOn&&typeof snapLatLng==='function'){
      const sn=snapLatLng(ll,null,{flash});if(sn&&sn.latlng)ll=sn.latlng;
    }}catch(x){}
    return ll;
  }
  function onMapMove(e){
    if(S.tool!==TOOL){clearCursorLine();return;}
    const q=state(),last=q.lineWgs[q.lineWgs.length-1],ll=sectionLatLng(e);
    if(!last||!ll||!previewLayer){clearCursorLine();return;}
    const points=[last,[ll.lat,ll.lng]];
    if(cursorLine)cursorLine.setLatLngs(points);
    else cursorLine=L2.polyline(points,{pane:'alagis_desenho',interactive:false,
      color:'#7c3aed',weight:3,dashArray:'4 6',className:'gsec-rubberband'}).addTo(previewLayer);
  }
  function redrawPreview(){
    const q=state();
    clearCursorLine();
    try{if(previewLayer)previewLayer.clearLayers();else if(map&&typeof L2!=='undefined')previewLayer=L2.layerGroup().addTo(map);}catch(e){return;}
    const txt=document.getElementById('gsecLineInfo');
    if(txt){const m=lineMetrics(lineFromWgs(q.lineWgs));txt.textContent=q.lineWgs.length>1
      ?formatLength(m.total)+' · '+q.lineWgs.length+' pontos'
      :(q.lineWgs.length?'Ponto A marcado. Clique no ponto B em qualquer posição do mapa.':'Nenhuma linha traçada. Clique em “Traçar no mapa” para marcar A.');}
    // Eixos concluídos são camadas reais. Não sobrepor uma cópia temporária
    // que continuaria visível mesmo após desligar a camada na árvore.
    const persisted=q.id&&(S.layers||[]).some(L=>isSectionLayer(L)&&L.features.some(f=>String(f.props?.GEOSEC_ID)===String(q.id)));
    if(!previewLayer||q.lineWgs.length<1||(persisted&&S.tool!==TOOL))return;
    const opt={pane:'alagis_desenho',interactive:false};
    if(q.lineWgs.length>1)L2.polyline(q.lineWgs,{color:'#7c3aed',weight:4,dashArray:'8 5',className:'gsec-axis',...opt}).addTo(previewLayer);
    q.lineWgs.forEach((p,i)=>L2.circleMarker(p,{radius:5,color:'#fff',weight:2,fillColor:'#7c3aed',fillOpacity:1,...opt})
      .bindTooltip(i===0?'A':(i===q.lineWgs.length-1?'B':String(i+1)),{permanent:true,direction:'top',className:'gsec-map-label'}).addTo(previewLayer));
  }
  function beginDraw(){
    bindMap();
    const q=readForm();q.id=null;q.name=uniqueSectionName(q.name);q.lineWgs=[];q.line=null;invalidateResult();syncForm();renderSaved();redrawPreview();
    try{setTool(TOOL);map.getContainer().classList.add('drawing');}catch(e){S.tool=TOOL;}
    notify('Marque A e B em qualquer posição do mapa. Use “Concluir A–B” quando terminar.');
  }
  function finishDraw(){
    const q=state();if(q.lineWgs.length<2){notify('Marque pelo menos os pontos A e B');return;}
    q.line=lineFromWgs(q.lineWgs);
    const layer=saveCurrent({automatic:true});if(!layer)return null;
    try{setTool('select');}catch(e){S.tool='select';}
    notify('Linha concluída e disponível nas camadas: '+layer.name);redrawPreview();return layer;
  }
  function invalidateResult(){
    state().result=null;
    const cv=document.getElementById('gsecCanvas');if(cv)cv.style.display='none';
    const out=document.getElementById('gsecOut');if(out)out.textContent='Nenhuma seção gerada.';
    const a=document.getElementById('gsecActions');if(a)a.hidden=true;
    renderLineStyles(null);
  }
  function clearLine(){
    if(S.tool===TOOL)try{setTool('select');}catch(e){S.tool='select';}
    const q=state();q.lineWgs=[];q.line=null;q.id=null;invalidateResult();redrawPreview();
    renderSaved();
  }
  function onMapClick(e){
    if(!S||S.tool!==TOOL)return;
    const ll=sectionLatLng(e,true);if(!ll)return;
    const q=state(),last=q.lineWgs[q.lineWgs.length-1];
    if(last&&Math.abs(last[0]-ll.lat)<1e-10&&Math.abs(last[1]-ll.lng)<1e-10)return;
    q.line=null;invalidateResult();
    q.lineWgs.push([ll.lat,ll.lng]);redrawPreview();
  }
  function bindMap(){
    if(typeof map==='undefined'||!map||boundMap===map)return;
    if(boundMap)try{
      boundMap.off('mousemove',onMapMove);boundMap.off('mouseout',clearCursorLine);
      if(previewLayer)boundMap.removeLayer(previewLayer);
      previewLayer=null;cursorLine=null;
    }catch(e){}
    // Cliques são roteados pelo núcleo, inclusive quando partem de vetores.
    // Não registrar outro listener de click: isso duplicaria pontos livres.
    boundMap=map;map.on('mousemove',onMapMove);map.on('mouseout',clearCursorLine);
  }

  function readForm(){
    const q=state(),v=id=>document.getElementById(id),name=v('gsecName'),ras=v('gsecRaster'),cor=v('gsecCorridor'),step=v('gsecStep'),
      useField=v('gsecUseField'),fieldRadius=v('gsecFieldRadius'),fieldDepth=v('gsecFieldDepth');
    if(name)q.name=name.value.trim()||'A–B';if(ras)q.rasterId=ras.value||null;
    if(cor)q.corridor=Math.max(0,+cor.value||0);
    if(step)q.step=+step.value>0?+step.value:null;
    if(useField)q.useField=!!useField.checked;
    const snap=v('gsecSnap');if(snap)q.snap=!!snap.checked;
    if(fieldRadius)q.fieldRadius=Math.max(1,+fieldRadius.value||300);
    if(fieldDepth)q.fieldDepth=Math.max(1,+fieldDepth.value||150);
    const geoBase=v('gsecGeologyBase');if(geoBase)q.geologyBase=String(geoBase.value).trim()===''?null:projectZ(geoBase.value);
    const layerChecks=[...document.querySelectorAll('#gsecLayers input[data-layer]')];
    if(layerChecks.length){q.layerIds=layerChecks.filter(e=>e.checked).map(e=>String(e.dataset.layer));q.layerSelectionSet=true;}
    document.querySelectorAll('#gsecLayers select[data-role]').forEach(e=>q.roles[String(e.dataset.role)]=e.value);
    if(v('gsecProjects'))q.projectSources=[...document.querySelectorAll('#gsecProjects input[data-project]')].filter(e=>e.checked).map(e=>String(e.dataset.project));
    if(v('gsecMeshes'))q.meshIds=[...document.querySelectorAll('#gsecMeshes input[data-mesh]')].filter(e=>e.checked).map(e=>String(e.dataset.mesh));
    const profiles=v('gsecRasterProfiles');
    if(profiles)q.rasterProfiles=rasterEntries([...document.querySelectorAll('#gsecRasterProfiles [data-raster-id]')].filter(row=>row.querySelector('.gsec-raster-use').checked)
      .map(row=>({id:row.dataset.rasterId,role:row.querySelector('.gsec-raster-role').value,mode:row.querySelector('.gsec-raster-mode').value})));
    return q;
  }
  function syncForm(){
    const q=state(),set=(id,val)=>{const e=document.getElementById(id);if(e&&val!=null)e.value=val;};
    set('gsecName',q.name||'A–B');set('gsecRaster',q.rasterId||'');set('gsecCorridor',q.corridor);set('gsecStep',q.step||'');
    set('gsecFieldRadius',q.fieldRadius);set('gsecFieldDepth',q.fieldDepth);
    set('gsecGeologyBase',q.geologyBase==null?'':q.geologyBase);
    const useField=document.getElementById('gsecUseField');if(useField)useField.checked=!!q.useField;
    const snap=document.getElementById('gsecSnap');if(snap)snap.checked=!!q.snap;
  }
  function renderLayerChoices(){
    const box=document.getElementById('gsecLayers');if(!box)return;const q=state();
    const layers=(S.layers||[]).filter(L=>['point','line','polygon'].includes(L.gtype)&&!isSectionLayer(L)&&!isMeshLayer(L));
    if(!q.layerSelectionSet&&layers.length){q.layerIds=layers.filter(likelyGeological).map(L=>String(L.id));q.layerSelectionSet=true;}
    box.innerHTML=layers.length?layers.map(L=>{
      const id=String(L.id),role=layerRole(L,q),checked=q.layerIds.includes(id)?' checked':'';
      return '<div class="gsec-layer-row"><label><input type="checkbox" data-layer="'+esc(id)+'"'+checked+'><span class="gsec-swatch" style="background:'+esc(L.color||'#8393a0')+'"></span><span title="'+esc(L.name)+'">'+esc(L.name)+'</span></label><select data-role="'+esc(id)+'" aria-label="Papel geológico de '+esc(L.name)+'">'+
        '<option value="lithology"'+(role==='lithology'?' selected':'')+'>Unidades/litologia</option><option value="contact"'+(role==='contact'?' selected':'')+'>Contatos</option><option value="fault"'+(role==='fault'?' selected':'')+'>Falhas</option><option value="fracture"'+(role==='fracture'?' selected':'')+'>Fraturas</option><option value="vein"'+(role==='vein'?' selected':'')+'>Veios</option><option value="shearzone"'+(role==='shearzone'?' selected':'')+'>Zona de cisalhamento</option><option value="structure"'+(role==='structure'?' selected':'')+'>Atitude planar de campo</option><option value="observation"'+(role==='observation'?' selected':'')+'>Afloramento/observação</option><option value="hole"'+(role==='hole'?' selected':'')+'>Sondagens/furos</option><option value="ignore"'+(role==='ignore'?' selected':'')+'>Ignorar na seção</option></select></div>';
    }).join(''):'<div class="hint">Importe camadas geológicas para projetá-las na seção.</div>';
  }
  function includeBoreholeLayer(layerOrId){
    const isObject=typeof layerOrId==='object'&&layerOrId,
      L=isObject?((S.layers||[]).includes(layerOrId)?layerOrId:null):(S.layers||[]).find(layer=>String(layer.id)===String(layerOrId));
    if(!L||!['point','line'].includes(L.gtype)||roleForLayer(L)!=='hole'||isSectionLayer(L))return false;
    const q=readForm(),key=String(L.id);
    q.layerIds=[...new Set([...q.layerIds,key])];q.roles[key]='hole';q.layerSelectionSet=true;
    invalidateResult();renderLayerChoices();return true;
  }
  function renderSources(){
    const q=state(),ls=document.getElementById('gsecLineLayer'),rs=document.getElementById('gsecRaster');
    if(ls){const old=ls.value;ls.innerHTML='<option value="">— linha existente —</option>'+(S.layers||[]).filter(L=>L.gtype==='line'&&!isSectionLayer(L)&&!isMeshLayer(L)).map(L=>'<option value="'+esc(L.id)+'">'+esc(L.name)+'</option>').join('');ls.value=old;}
    if(rs){rs.innerHTML='<option value="">— sem MDT / escolha o MDT —</option>'+(S.rasters||[]).map(r=>'<option value="'+esc(r.id)+'">'+esc(r.name)+'</option>').join('');
      if(q.rasterId!=null){
        if(![...rs.options].some(o=>String(o.value)===String(q.rasterId)))rs.insertAdjacentHTML('beforeend','<option value="'+esc(q.rasterId)+'">MDT '+esc(q.rasterId)+' · indisponível neste projeto</option>');
        rs.value=String(q.rasterId);
      }else if(!q.terrainChoiceSet&&!q.rasterProfiles.length&&!q.meshIds.length&&!(S.layers||[]).some(L=>layerRole(L,q)==='hole'&&(!q.layerIds.length||q.layerIds.includes(String(L.id))))&&S.rasters&&S.rasters.length){q.rasterId=S.rasters[0].id;rs.value=String(q.rasterId);}}
    const profiles=document.getElementById('gsecRasterProfiles');
    if(profiles){
      const sources=(S.rasters||[]).filter(r=>String(r.id)!==String(q.rasterId)).slice();
      q.rasterProfiles.forEach(item=>{if(item.id!==String(q.rasterId)&&!sources.some(r=>String(r.id)===item.id))sources.push({id:item.id,name:item.id+' · indisponível neste projeto'});});
      profiles.innerHTML=sources.map(r=>{
        const entry=q.rasterProfiles.find(item=>item.id===String(r.id)),role=entry?entry.role:'surface',mode=entry?entry.mode:'elevation';
        return '<div class="gsec-raster-row" data-raster-id="'+esc(r.id)+'"><label class="gsec-check"><input class="gsec-raster-use" type="checkbox"'+(entry?' checked':'')+'><span>'+esc(r.name)+'</span></label><div class="gsec-grid2">'+
          '<label>Papel na seção<select class="gsec-raster-role">'+['surface','water','contact'].map(v=>'<option value="'+v+'"'+(role===v?' selected':'')+'>'+roleName(v)+'</option>').join('')+'</select></label>'+
          '<label>Valores do raster<select class="gsec-raster-mode"><option value="elevation"'+(mode==='elevation'?' selected':'')+'>Cotas absolutas (m)</option><option value="depth"'+(mode==='depth'?' selected':'')+'>Profundidade abaixo do terreno (m)</option></select></label></div></div>';
      }).join('')||'<div class="hint">Importe outros rasters numéricos para sobrepor níveis d’água, contatos ou superfícies.</div>';
    }
    const meshBox=document.getElementById('gsecMeshes');
    if(meshBox){
      const sources=meshSources().slice();
      q.meshIds.forEach(id=>{if(!sources.some(s=>String(s.id)===id))sources.push({id,name:id,missing:true});});
      meshBox.innerHTML=sources.length?sources.map(item=>'<label class="gsec-check"><input type="checkbox" data-mesh="'+esc(item.id)+'"'+
        (q.meshIds.includes(String(item.id))?' checked':'')+'><span class="gsec-swatch" style="background:'+esc(item.color||'#6b8caa')+'"></span><span>'+esc(item.name)+
        (item.missing?' · indisponível neste projeto':'')+'</span></label>').join(''):'<div class="hint">Importe DTM + STR para incluir cortes de superfícies e sólidos.</div>';
    }
    const projects=document.getElementById('gsecProjects');
    if(projects){const sources=projectSourceOptions();
      q.projectSources.forEach(key=>{if(!sources.some(s=>s.key===key))sources.push({key,name:key,description:'fonte indisponível neste projeto'});});
      projects.innerHTML=sources.length?sources.map(item=>'<label class="gsec-check"><input type="checkbox" data-project="'+esc(item.key)+'"'+(q.projectSources.includes(item.key)?' checked':'')+'><span>'+esc(item.name)+' <small>· '+esc(item.description)+'</small></span></label>').join(''):'<div class="hint">Nenhuma cava/linha 3D ou superfície de projeto disponível. Gere a cava ou importe suas linhas com cotas.</div>';
    }
  }
  function useExistingLine(){
    const sel=document.getElementById('gsecLineLayer'),L=sel&&S.layers.find(x=>String(x.id)===String(sel.value));
    if(!L){notify('Escolha uma camada de linha');return;}
    let line=null;
    if(S.selFeat&&(S.selFeat.layer===L||String(S.selFeat.layerId)===String(L.id))){const f=L.features[S.selFeat.idx];line=featureParts(L,f).sort((a,b)=>lineMetrics(b).total-lineMetrics(a).total)[0];}
    if(!line)line=longestLine(L);
    if(!line||line.length<2){notify('A camada não contém uma linha válida');return;}
    const q=readForm();q.id=null;q.name=uniqueSectionName(q.name);q.line=line.map(p=>p.slice());q.lineWgs=wgsFromLine(q.line);invalidateResult();syncForm();renderSaved();
    if(S.tool===TOOL)setTool('select');
    redrawPreview();notify('Linha A–B carregada de '+L.name);
  }

  function sectionProps(q){
    return {GEOSEC_ID:q.id||newSectionId(),NOME:q.name||'A–B',
      ...(q.projectSources.length?{PROJ_SEC:q.projectSources.join(',')}:{}),
      ...(q.meshIds.length?{MESH_SEC:JSON.stringify(q.meshIds)}:{}),
      ...(q.rasterProfiles.length?{RAST_PERF:JSON.stringify(q.rasterProfiles)}:{}),
      ...(Object.keys(q.lineStyles).length?{LIN_EST:JSON.stringify(q.lineStyles)}:{}),
      ...(q.geologyBase!=null?{GEO_BASE:projectZ(q.geologyBase)}:{}),
      CORREDOR:+q.corridor||0,EXAG_V:1,PASSO_M:q.step||null,MDT_ID:q.rasterId==null?'':String(q.rasterId),
      CAMADAS:(q.layerIds||[]).join(','),SEL_CAM:q.layerSelectionSet?1:0,PAPEIS:JSON.stringify(q.roles||{}),CAMPO_USO:q.useField?1:0,
      RAIO_CAM:+q.fieldRadius||300,PROF_INT:+q.fieldDepth||150};
  }
  function sectionFields(){return [
    {name:'PROJ_SEC',type:'C',length:254},
    {name:'MESH_SEC',type:'C',length:254},
    {name:'RAST_PERF',type:'C',length:254},{name:'LIN_EST',type:'C',length:254},
    {name:'GEO_BASE',type:'N',length:18,decimal:3},
    {name:'GEOSEC_ID',type:'C',length:32},{name:'NOME',type:'C',length:80},{name:'CORREDOR',type:'N',length:12,decimal:2},
    {name:'EXAG_V',type:'N',length:8,decimal:2},{name:'PASSO_M',type:'N',length:12,decimal:2},{name:'MDT_ID',type:'C',length:24},
    {name:'CAMADAS',type:'C',length:254},{name:'SEL_CAM',type:'N',length:1,decimal:0},{name:'PAPEIS',type:'C',length:254},{name:'CAMPO_USO',type:'N',length:1,decimal:0},
    {name:'RAIO_CAM',type:'N',length:12,decimal:2},{name:'PROF_INT',type:'N',length:12,decimal:2}
  ];}
  function isSectionLayer(L){return !!(L&&L.gtype==='line'&&(L.features||[]).some(f=>f.props&&f.props.GEOSEC_ID));}
  function savedSections(){
    const out=[];(S.layers||[]).forEach(L=>{if(!isSectionLayer(L))return;(L.features||[]).forEach((f,i)=>{if(f.props&&f.props.GEOSEC_ID)out.push({id:String(f.props.GEOSEC_ID),name:f.props.NOME||L.name,L,feature:f,index:i});});});
    S.geology=S.geology||{};S.geology.sections=out.map(x=>({id:x.id,name:x.name,layerId:x.L.id}));return out;
  }
  function newSectionId(){
    const used=new Set(savedSections().map(x=>x.id)),base='GSEC-'+Date.now().toString(36).toUpperCase();
    let id=base,n=2;while(used.has(id))id=base+'-'+n++;return id;
  }
  function uniqueSectionName(name){
    const base=String(name||'A–B').trim()||'A–B',used=new Set(savedSections().map(x=>x.name));
    let next=base,n=2;while(used.has(next))next=base+' ('+(n++)+')';return next;
  }
  function renderSaved(){
    const sel=document.getElementById('gsecSaved');if(!sel)return;const q=state(),items=savedSections();
    sel.innerHTML='<option value="">— nova seção —</option>'+items.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
    if(q.id&&items.some(x=>x.id===q.id))sel.value=q.id;
  }
  function saveCurrent(options={}){
    const q=readForm(),line=q.line&&q.line.length>1?q.line:lineFromWgs(q.lineWgs);
    if(q.geologyBase!=null&&!Number.isFinite(projectZ(q.geologyBase))){notify('Informe uma cota inferior da geologia válida em metros, ou deixe o campo vazio.');return null;}
    if(!line||line.length<2||!line.every(p=>Number.isFinite(p[0])&&Number.isFinite(p[1]))||!(lineMetrics(line).total>0)){notify('Trace uma linha A–B válida antes de salvar');return null;}
    const found=q.id&&savedSections().find(x=>x.id===String(q.id));
    if(!found)q.name=uniqueSectionName(q.name);
    const props=sectionProps(q),feat={geom:line.map(p=>p.slice()),multi:false,props};let L;
    if(found){
      L=found.L;
      if(L.locked||(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false))){notify('A camada da seção está bloqueada para edição');return null;}
      if(String(L.crs||S.workCRS)!==String(S.workCRS)){
        try{feat.geom=feat.geom.map(p=>{const xy=reproj(S.workCRS,L.crs,p[0],p[1]);if(!xy||!xy.every(Number.isFinite))throw new Error('CRS');return xy;});}
        catch(e){notify('Não foi possível converter o eixo para o sistema da camada');return null;}
      }
      // Conserve os atributos adicionais e as outras seções de camadas antigas.
      // As opções opcionais removidas no formulário não podem reaparecer.
      feat.props={...(found.feature.props||{}),...props};
      for(const key of ['PROJ_SEC','MESH_SEC','GEO_BASE','RAST_PERF','LIN_EST'])if(!(key in props))delete feat.props[key];
      L.features[found.index]={...found.feature,...feat};
      const known=new Set((L.fields||[]).map(f=>f.name));L.fields=[...(L.fields||[]),...sectionFields().filter(f=>!known.has(f.name))];
      if(L.features.length===1&&L.name==='Seção geológica — '+found.name)L.name='Seção geológica — '+q.name;
      try{drawLayer(L);}catch(e){}
    }
    else{
      L=addLayer({name:'Seção geológica — '+q.name,gtype:'line',crs:S.workCRS,features:[feat],fields:sectionFields(),color:'#7c3aed'});
      if(L){L.weight=3;if(L.sym){L.sym.color='#7c3aed';L.sym.stroke='#7c3aed';L.sym.weight=3;L.sym.dash='8 5';}
        L._geoSection=true;L._geology={schemaVersion:1,kind:'geological-section',family:'modelo'};
        try{if(typeof api.ensureGroup==='function'){const group=api.ensureGroup();L.groupId=group.id;group.collapsed=false;}}catch(e){}
        try{drawLayer(L);}catch(e){}}
    }
    if(!L)return null;
    q.id=props.GEOSEC_ID;q.line=line;q.lineWgs=wgsFromLine(line);
    /* O índice em memória também é contrato de persistência. Atualize-o
       mesmo quando o painel ainda não existe (abertura de projeto/testes). */
    savedSections();
    try{refreshUI();}catch(e){}renderSaved();syncForm();redrawPreview();
    if(!options.automatic)notify('Seção salva no projeto como camada vetorial');return L;
  }
  function loadSaved(id){
    if(S.tool===TOOL)try{setTool('select');}catch(e){S.tool='select';}
    if(!id){clearLine();const q=state();q.name='A–B';syncForm();return;}
    const x=savedSections().find(v=>v.id===String(id));if(!x)return;
    const p=x.feature.props||{},q=state();q.id=x.id;q.name=p.NOME||x.name;q.corridor=Math.max(0,finite(p.CORREDOR)??100);q.ve=1;q.step=+p.PASSO_M||null;q.rasterId=p.MDT_ID||null;
    q.projectSources=String(p.PROJ_SEC||'').split(',').filter(Boolean);
    try{const ids=JSON.parse(p.MESH_SEC||'[]');q.meshIds=Array.isArray(ids)?ids.map(String):[];}catch(e){q.meshIds=[];}
    try{q.rasterProfiles=rasterEntries(JSON.parse(p.RAST_PERF||'[]'));}catch(e){q.rasterProfiles=[];}
    try{q.lineStyles=styleMap(JSON.parse(p.LIN_EST||'{}'));}catch(e){q.lineStyles={};}
    q.terrainChoiceSet=true;
    q.geologyBase=p.GEO_BASE==null||p.GEO_BASE===''?null:projectZ(p.GEO_BASE);
    q.useField=p.CAMPO_USO==null?true:+p.CAMPO_USO!==0;q.fieldRadius=+p.RAIO_CAM||300;q.fieldDepth=+p.PROF_INT||150;
    q.layerIds=String(p.CAMADAS||'').split(',').filter(Boolean);q.layerSelectionSet=p.SEL_CAM==null?Object.prototype.hasOwnProperty.call(p,'CAMADAS'):+p.SEL_CAM!==0;
    try{q.roles=JSON.parse(p.PAPEIS||'{}')||{};}catch(e){q.roles={};}
    q.line=featureParts(x.L,x.feature)[0]||[];q.lineWgs=wgsFromLine(q.line);invalidateResult();renderSources();renderLayerChoices();syncForm();redrawPreview();notify('Seção '+q.name+' carregada');
  }
  function exportPNG(){
    const cv=document.getElementById('gsecCanvas'),q=state();if(!cv||cv.style.display==='none'){notify('Gere a seção primeiro');return;}
    cv.toBlob(blob=>{if(!blob)return;const fn='secao_geologica_'+(q.name||'AB').replace(/[^A-Za-z0-9_-]+/g,'_')+'.png';if(typeof download==='function')download(blob,fn);else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fn;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}},'image/png');
  }
  function exportFieldCSV(){
    const q=state(),r=q.result;if(!r){notify('Gere a seção primeiro');return;}
    const rows=sectionEvents(r).filter(event=>event.interpretation).map(event=>{
      const i=event.interpretation,s=i.source||{};return {
        SECAO:q.name,TIPO:event.kind,ALVO:event.label,ESTACA_M:event.station,COTA_M:event.z,
        ORIGEM:i.origin,METODO:i.method,CAMADA_ID:s.layerId,CAMADA:s.layerName,FEICAO:s.feature,
        ID_CAMPO:s.fieldId||s.id,ID_FONTE:s.id,ARQUIVO_FONTE:s.sourceFile,OPERADOR:s.operator,
        ORIGEM_CAMPO:s.origin,FONTE_CAMPO:s.source||s.sourceType,TIPO_CAMPO:s.kind,
        DIRECAO_ORIG:i.rawDirection,REF_ORIENT:i.orientationRef,STRIKE_RHR:i.strike,MERG_VERD:i.trueDip,
        MERG_APAR:i.apparentDip,DIST_FONTE:i.distance,CONFIANCA:i.confidence,
        QUALIDADE:i.quality,PREC_LOC_M:i.locationConfidenceM,PREC_ORI_G:i.orientationConfidenceDeg,
        CONF_IDENT:i.identityConfidence,FONTE_TIPO:s.sourceType,OBSERVADO_EM:s.observedAt,
        PROF_PROJ:i.depth,GERADO_EM:r.generatedAt
      };
    });
    if(!rows.length){notify('Nenhuma projeção controlada por atitude de campo foi gerada');return;}
    const headers=Object.keys(rows[0]),cell=v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"',
      csv='\ufeff'+[headers.join(';'),...rows.map(row=>headers.map(h=>cell(row[h])).join(';'))].join('\n'),
      blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),fn='interpretacao_campo_'+(q.name||'AB').replace(/[^A-Za-z0-9_-]+/g,'_')+'.csv';
    if(typeof download==='function')download(blob,fn);else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fn;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  }

  function notify(msg){try{if(typeof toast==='function')toast(msg);else console.info(msg);}catch(e){console.info(msg);}}
  function panelHTML(){return '<div class="hsec gsec-panel" id="'+PANEL_ID+'"><h2>Seções geológicas <span class="tag">A–B</span></h2><div class="gsec-body">'+
    '<div class="gsec-intro">Crie um corte de superfícies e sólidos 3D ou do MDT e represente unidades, contatos, falhas, fraturas, veios, zonas de cisalhamento e sondagens. Polígonos de cisalhamento mostram somente a extensão mapeada na superfície.</div>'+
    '<label class="field" for="gsecSaved">Seções salvas no projeto</label><div class="gsec-inline"><select id="gsecSaved"><option value="">— nova seção —</option></select><button class="mini" id="gsecNew">Nova</button></div>'+
    '<label class="field" for="gsecName">Nome</label><input id="gsecName" value="A–B" maxlength="80">'+
    '<div class="gsec-card"><b>1. Linha da seção</b><div class="hint">Marque A e B livremente no mapa, inclusive sobre as camadas. Não é necessário usar vértices existentes. Você também pode incluir pontos intermediários. Ao concluir, uma camada própria é criada no grupo Geologia. Cada novo traçado mantém os anteriores; “Limpar” cancela o traçado atual sem apagar camadas já criadas.</div><div class="gsec-actions"><button class="tbtn" id="gsecDraw">✏ Traçar no mapa</button><button class="mini" id="gsecFinish">✓ Concluir A–B</button><button class="mini" id="gsecClear">× Limpar</button></div><label class="gsec-check"><input type="checkbox" id="gsecSnap"><span>Usar encaixe em vértices/linhas (ímã do mapa ligado)</span></label><div class="gsec-inline"><select id="gsecLineLayer"><option value="">— linha existente —</option></select><button class="mini" id="gsecUseLine">Usar linha</button></div><div class="hint" id="gsecLineInfo">Nenhuma linha traçada.</div></div>'+
    '<div class="gsec-card"><b>2. Rasters e geometria</b><label class="field" for="gsecRaster">Terreno de referência / MDT</label><select id="gsecRaster"><option value="">— escolha o MDT —</option></select><div class="gsec-grid2"><div><label class="field">Corredor total (m)</label><input type="number" id="gsecCorridor" value="100" min="0" step="10"></div><div><label class="field">Passo máximo (m)</label><input type="number" id="gsecStep" min="0.25" step="0.25" placeholder="automático"></div></div><div class="hint">A seção usa a mesma escala horizontal e vertical. O terreno ancora a geologia e as profundidades; ocultar sua linha não muda essa referência.</div><label class="field">Rasters adicionais — marque quantos precisar</label><div id="gsecRasterProfiles" class="gsec-layers"></div><div class="hint">Escolha o papel e a unidade de cada fonte. Cotas e profundidades devem estar em metros e na mesma referência altimétrica do terreno. Profundidade deve ser positiva e será subtraída do MDT. Ortofotos RGB não contêm cotas. Os rasters geram linhas, sem inferir volumes geológicos; lacunas amostradas permanecem vazias.</div></div>'+
    '<div class="gsec-card"><b>Projetos de cava sobre o terreno</b><div class="hint">Selecione um ou mais projetos. O MDT acima continua sendo o terreno; cotas do projeto em metros. A cava é representada por linhas sobre os domínios geológicos. Em cavas vetoriais, o perfil liga os cruzamentos dos bancos/taludes ao longo do eixo, dentro dos limites disponíveis; não cria uma superfície 3D. Linhas genéricas permanecem como interseções.</div><div id="gsecProjects" class="gsec-layers"></div></div>'+
    '<div class="gsec-card"><b>Superfícies e sólidos 3D (Surpac)</b><div class="hint">Selecione as malhas para calcular suas interseções com o eixo. Sólidos fechados mostram a área atravessada pelo corte; superfícies abertas aparecem como linhas. O MDT é opcional quando uma malha está selecionada.</div><button class="mini" id="gsecImportMeshes">Importar / gerenciar DTM + STR</button><div id="gsecMeshes" class="gsec-layers"></div></div>'+
    '<div class="gsec-card"><b>3. Camadas geológicas</b><div class="hint">Marque a camada e confirme seu papel. Sondagens com cotas próprias podem gerar seção sem MDT; trajetórias importadas conservam os desvios e a profundidade medida (MD). Atitudes planares precisam de direção, mergulho e convenção confirmada (strike RHR ou direção do mergulho). Lineação/caimento não é usada como plano.</div><label class="field" for="gsecGeologyBase">Cota inferior da geologia / eixo X (m)</label><input type="text" inputmode="decimal" id="gsecGeologyBase" placeholder="vazio: base automática do eixo X"><div class="hint">Os domínios são preenchidos até o eixo X. Informe uma cota abaixo do terreno para fixar essa base. O preenchimento é gráfico; não indica espessura medida nem comprova continuidade em profundidade.</div><div id="gsecLayers" class="gsec-layers"></div></div>'+
    '<div class="gsec-card gsec-field-card"><b>4. Interpretação pelo mapeamento de campo</b><label class="gsec-check"><input type="checkbox" id="gsecUseField" checked><span>Projetar limites com atitudes de campo compatíveis</span></label><div class="gsec-grid2"><div><label class="field" for="gsecFieldRadius">Raio máximo da atitude (m)</label><input type="number" id="gsecFieldRadius" min="1" step="10" value="300"></div><div><label class="field" for="gsecFieldDepth">Profundidade da interpretação (m)</label><input type="number" id="gsecFieldDepth" min="1" step="10" value="150"></div></div><div class="hint">Falhas, fraturas e veios usam atitude própria, do mesmo tipo ou indicada por ID_ATITUDE. Acamamento próximo não define automaticamente seu mergulho. Projeções tracejadas guardam fonte/distância/confiança; marcas sem atitude permanecem superficiais.</div></div>'+
    '<button class="tbtn gsec-generate" id="gsecGenerate">Gerar seção geológica interpretativa</button><div class="gsec-card" id="gsecStyleBox" hidden><b>Editar linhas da seção</b><div class="hint">Nome, visibilidade, cor, espessura e traçado atualizam a seção e o PNG imediatamente. Não alteram as camadas de origem. Use “Salvar no projeto” para guardar estas opções na seção e depois salve o arquivo do projeto.</div><div id="gsecStyleList"></div></div><canvas id="gsecCanvas" width="1100" height="420"></canvas><div class="hout" id="gsecOut">Nenhuma seção gerada.</div><div class="gsec-actions" id="gsecActions" hidden><button class="tbtn" id="gsecSave">💾 Salvar no projeto</button><button class="mini" id="gsecPNG">⤓ PNG</button><button class="mini" id="gsecFieldCSV">⤓ Fontes e confiança (CSV)</button></div>'+
    '</div></div>';}
  function ensurePanel(){
    let sec=document.getElementById(PANEL_ID);if(sec)return sec;
    const host=document.getElementById('sideGeo');if(!host)return null;
    host.insertAdjacentHTML('afterbegin',panelHTML());sec=document.getElementById(PANEL_ID);bindPanel(sec);return sec;
  }
  function bindPanel(sec){
    const on=(id,evt,fn)=>{const e=document.getElementById(id);if(e)e.addEventListener(evt,fn);};
    on('gsecDraw','click',beginDraw);on('gsecFinish','click',finishDraw);on('gsecClear','click',clearLine);on('gsecUseLine','click',useExistingLine);on('gsecGenerate','click',generate);on('gsecSave','click',saveCurrent);on('gsecPNG','click',exportPNG);on('gsecFieldCSV','click',exportFieldCSV);
    on('gsecSaved','change',e=>loadSaved(e.target.value));on('gsecNew','click',()=>loadSaved(''));
    on('gsecProjects','change',readForm);
    on('gsecLayers','change',()=>{readForm();invalidateResult();});
    on('gsecMeshes','change',()=>{readForm();invalidateResult();});
    on('gsecRaster','change',()=>{readForm().terrainChoiceSet=true;renderSources();invalidateResult();});
    on('gsecRasterProfiles','change',()=>{readForm();invalidateResult();});
    on('gsecStyleList','input',editLineStyle);on('gsecStyleList','change',editLineStyle);
    on('gsecImportMeshes','click',()=>{if(api.meshes&&typeof api.meshes.open==='function')api.meshes.open();else notify('Importador de malhas indisponível.');});
    // Atualize durante a edição, não apenas no blur: esconder o resultado
    // antigo durante o clique em Gerar deslocava o botão antes do mouseup.
    ['gsecCorridor','gsecStep','gsecName','gsecFieldRadius','gsecFieldDepth','gsecGeologyBase'].forEach(id=>on(id,'input',()=>{readForm();invalidateResult();}));
    ['gsecUseField','gsecSnap'].forEach(id=>on(id,'change',()=>{readForm();invalidateResult();}));
    if(sec){const h=sec.querySelector('h2');if(h)h.addEventListener('click',e=>{if(e.target.closest('button,input,select'))return;sec.classList.toggle('collapsed');});}
  }
  function refresh(){
    if(!state().result)invalidateResult();
    const sec=ensurePanel();if(!sec)return;bindMap();renderSources();renderLayerChoices();renderSaved();syncForm();redrawPreview();
  }
  function openSection(button){
    const sec=ensurePanel();if(!sec){notify('Painel de Geologia indisponível');return;}
    try{switchView('geo');}catch(e){}
    setTimeout(()=>{
      refresh();sec.classList.remove('collapsed');
      // Importador e reabertura também chamam esta API sem um ícone. O dock
      // técnico pode estar oculto: abrir só por scrollIntoView não o revela.
      const anchor=button||[...document.querySelectorAll('#ribbon .rbtn')].find(b=>b.textContent.includes('Seção Geológica'))||document.getElementById('ribbon');
      if(anchor&&typeof ribbonOpen==='function')ribbonOpen(sec,anchor,'Seções geológicas');
      else sec.scrollIntoView({block:'start',behavior:'smooth'});
    },0);
  }
  function snapshot(){
    const q=state();return {version:2,activeId:q.id||null,section:{name:q.name,rasterId:q.rasterId,corridor:q.corridor,ve:q.ve,step:q.step,layerIds:q.layerIds.slice(),layerSelectionSet:!!q.layerSelectionSet,roles:{...q.roles},
      ...(q.projectSources.length?{projectSources:q.projectSources.slice()}:{}),
      ...(q.meshIds.length?{meshIds:q.meshIds.slice()}:{}),
      ...(q.rasterProfiles.length?{rasterProfiles:copy(q.rasterProfiles)}:{}),
      ...(Object.keys(q.lineStyles).length?{lineStyles:copy(q.lineStyles)}:{}),
      ...(q.terrainChoiceSet&&q.rasterId==null?{terrainChoiceSet:true}:{}),
      ...(q.geologyBase!=null?{geologyBase:q.geologyBase}:{}),
      snap:!!q.snap,useField:!!q.useField,fieldRadius:q.fieldRadius,fieldDepth:q.fieldDepth}};
  }
  function restore(data){
    if(!data||!data.section)return false;const q=state(),d=data.section;q.id=data.activeId||null;q.name=d.name||'A–B';q.rasterId=d.rasterId??null;q.corridor=Math.max(0,finite(d.corridor)??100);q.ve=1;q.step=+d.step||null;q.layerIds=Array.isArray(d.layerIds)?d.layerIds.map(String):[];q.roles=d.roles&&typeof d.roles==='object'?{...d.roles}:{};
    q.layerSelectionSet=d.layerSelectionSet==null?Array.isArray(d.layerIds):!!d.layerSelectionSet;
    q.projectSources=Array.isArray(d.projectSources)?d.projectSources.map(String):[];
    q.meshIds=Array.isArray(d.meshIds)?d.meshIds.map(String):[];
    q.rasterProfiles=rasterEntries(d.rasterProfiles);q.lineStyles=styleMap(d.lineStyles);q.terrainChoiceSet=d.terrainChoiceSet==null?d.rasterId!=null:!!d.terrainChoiceSet;
    q.geologyBase=d.geologyBase==null||d.geologyBase===''?null:projectZ(d.geologyBase);
    q.snap=!!d.snap;q.useField=d.useField==null?true:!!d.useField;q.fieldRadius=Math.max(1,+d.fieldRadius||300);q.fieldDepth=Math.max(1,+d.fieldDepth||150);
    const saved=q.id&&savedSections().find(x=>x.id===String(q.id));q.line=saved?(featureParts(saved.L,saved.feature)[0]||null):null;q.lineWgs=q.line?wgsFromLine(q.line):[];
    invalidateResult();if(document.getElementById(PANEL_ID))refresh();return true;
  }
  function init(){ensurePanel();bindMap();}

  const sectionTest={lineMetrics,closestOnLine,segmentIntersection,pointInRings,roleForLayer,
    apparentDip,structuralRecords,nearestStructure,projectFieldEvent,compatibleStructure,mappedPolygonExtents,holeObjects,holeIntervals,projectHoleTrace,metricSectionCRS,
    validHoleRows,lithologyColor,tracePointAtDepth,traceSliceByDepth,importedHoleTrace,drawSection,
    projectSourceOptions,projectProfiles,projectCrossings,projectRasterSample,projectVectorParts,meshSections};
  Object.assign(api,{openSection,refresh,generate,saveCurrent,includeBoreholeLayer,exportFieldCSV,sectionMapClick:onMapClick,sectionEndPreview:clearCursorLine,sectionSnapshot:snapshot,sectionRestore:restore,
    __test:sectionTest,__sectionTest:sectionTest});
  /* Em execução normal o workspace é o dono do snapshot global de Geologia
     (inclui esta seção e futuros domínios). Mantém fallbacks apenas para o
     módulo continuar testável/retrocompatível quando carregado isoladamente. */
  if(typeof workspaceSnapshot!=='function')api.snapshot=snapshot;
  if(typeof workspaceRestore!=='function')api.restore=restore;
  // Alias curto para integrações legadas e comandos da faixa.
  window.geoOpenGeologicalSections=openSection;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else setTimeout(init,0);
})();
