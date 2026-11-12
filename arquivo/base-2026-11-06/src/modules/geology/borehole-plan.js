/* GeoMine — projeção das sondagens em planta.
   O collar continua sendo a feição editável. Estes caminhos são apenas uma
   vista XY do traço importado, ou de uma orientação explicitamente cadastrada;
   não recalculam survey, não amostram o MDT e não alteram o projeto. */
(function(root){
  'use strict';
  const api=root.GeoMineGeology=root.GeoMineGeology||{};
  const MAX_POINTS=100000,EPS_XY=1e-8;
  const own=(o,k)=>!!o&&Object.prototype.hasOwnProperty.call(o,k);
  const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const xy=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
  const xml=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function number(v){
    if(v==null||!['number','string'].includes(typeof v)||typeof v==='string'&&!v.trim())return null;
    const n=Number(v);return Number.isFinite(n)?n:null;
  }
  function collarPoint(f){
    const g=f.geom;
    return xy(g)?g:Array.isArray(g)&&g.length===1&&xy(g[0])?g[0]:null;
  }
  function isLayer(L){
    return !!(L&&L.gtype==='point'&&(['sondagem','spt'].includes(L._geology?.kind)||
      L._geology?.importedBoreholes===true||Array.isArray(L.features)&&L.features.some(f=>own(f,'boreholeTrace'))));
  }
  function result(points,source){
    const first=points[0];
    return {points,source,vertical:points.every(p=>Math.hypot(p[0]-first[0],p[1]-first[1])<=EPS_XY)};
  }
  function importedDepth(props){
    // Mesmos atributos e precedência do leitor da seção geológica.
    const names=new Set(['PROFM','PROFUNDIDADE','PROFTOTAL','PROFUNDIDADETOTAL','DEPTH','TOTALDEPTH','FINALDEPTH']);
    for(const key of Object.keys(props||{}))if(names.has(norm(key))&&props[key]!==''&&props[key]!=null)return props[key];
    return null;
  }
  function importedPlan(f){
    const trace=f.boreholeTrace,collarOnly=f.boreholeSource?.method==='collar-only';
    if(!Array.isArray(trace)||trace.length<(collarOnly?1:2)||trace.length>MAX_POINTS||collarOnly&&trace.length!==1)return null;
    // Valide o traço inteiro, inclusive após um eventual corte em PROF_M:
    // omitir uma estação inválida ligaria duas partes sem suporte nos dados.
    for(let i=0;i<trace.length;i++){
      const p=trace[i];
      if(!p||![p.x,p.y,p.z,p.md].every(Number.isFinite)||p.md<0||
        (i===0?p.md!==0:p.md<=trace[i-1].md))return null;
    }
    // Uma edição externa pode mover/reprojetar somente geom. Não desenhe a
    // trajetória antiga longe da sua boca nem tente deslocá-la silenciosamente.
    const collar=collarPoint(f);
    if(!collar||Math.hypot(trace[0].x-collar[0],trace[0].y-collar[1])>1e-6)return null;
    const statedRaw=importedDepth(f.props),stated=number(statedRaw);
    if(collarOnly)return statedRaw==null?result([[trace[0].x,trace[0].y]],'imported'):null;
    if(statedRaw!=null&&(stated==null||stated<=0))return null;
    const depth=stated==null?trace[trace.length-1].md:Math.min(stated,trace[trace.length-1].md),points=[];
    if(!(depth>0))return null;
    for(let i=0;i<trace.length;i++){
      const p=trace[i];
      if(p.md<=depth){points.push([p.x,p.y]);continue;}
      const a=trace[i-1];
      if(a&&a.md<depth){
        const t=(depth-a.md)/(p.md-a.md),end=[a.x*(1-t)+p.x*t,a.y*(1-t)+p.y*t];
        if(!xy(end))return null;
        points.push(end);
      }
      break;
    }
    return points.length>=2?result(points,'imported'):null;
  }
  function field(L,f,key){
    const mapper=api.fieldMapping;
    if(typeof mapper?.fieldValue==='function')return mapper.fieldValue(L,f,key);
    const props=f.props||{},mapped=L._geology?.fieldMap?.[key];
    if(mapped)return own(props,mapped)?props[mapped]:undefined;
    const actual=Object.keys(props).find(k=>norm(k)===norm(key));
    return actual==null?undefined:props[actual];
  }
  function metricCRS(code){
    if(!code)return false;
    try{
      const engine=typeof proj4!=='undefined'?proj4:root.proj4;
      if(typeof engine?.Proj!=='function')return false;
      const p=new engine.Proj(code);
      return p.projName!=='longlat'&&(!p.units||p.units==='m')&&
        (p.units==='m'||p.to_meter===1)&&(p.to_meter==null||Math.abs(p.to_meter-1)<=1e-12);
    }catch(_){return false;}
  }
  function manualPlan(L,f){
    if(!['sondagem','spt'].includes(L._geology?.kind)||!metricCRS(L.crs))return null;
    const p=collarPoint(f);
    if(!p)return null;
    const depth=number(field(L,f,'PROF_M')),az=number(field(L,f,'AZIMUTE')),dip=number(field(L,f,'INCLINACAO'));
    // Sem orientação explícita não deduza uma sondagem vertical, mesmo SPT.
    if(depth==null||depth<=0||az==null||az<0||az>360||dip==null||dip<0||dip>90)return null;
    const distance=dip===90?0:depth*Math.cos(dip*Math.PI/180),angle=(az%360)*Math.PI/180,
      end=[p[0]+distance*Math.sin(angle),p[1]+distance*Math.cos(angle)];
    return xy(end)?result([[p[0],p[1]],end],'manual'):null;
  }
  function plan(L,f){
    if(!L||L.gtype!=='point'||!f)return null;
    try{
      // Um traço importado inválido nunca vira uma reta inferida do collar.
      if(own(f,'boreholeTrace')||L._geology?.importedBoreholes===true)return importedPlan(f);
      return manualPlan(L,f);
    }catch(_){return null;}
  }
  function style(st){
    const weight=number(st?.weight);if(weight==null||weight<=0)return null;
    const parts=Array.isArray(st.dash)?st.dash:String(st.dash||'').trim().split(/[\s,]+/),values=parts.map(number),
      dash=values.length>0&&values.length<=16&&values.every(v=>v!=null&&v>0)?values:[4,3];
    return {weight,color:st.stroke||st.color||'#137c8b',dash};
  }
  function leaflet(L,f,st,R={},idx){
    const cfg=style(st),geometry=cfg&&plan(L,f);
    if(!geometry||geometry.vertical)return [];
    const lib=typeof L2!=='undefined'?L2:root.L2||root.L,project=typeof toWGS==='function'?toWGS:root.toWGS;
    if(typeof lib?.polyline!=='function'||typeof project!=='function')return [];
    const points=[];
    try{for(const p of geometry.points){const w=project(L.crs,p[0],p[1]);if(!xy(w))return [];points.push([w[1],w[0]]);}}catch(_){return [];}
    const shared={...R,fill:false,dashArray:cfg.dash.join(' '),lineCap:'round',lineJoin:'round',smoothFactor:0},
      halo=lib.polyline(points,{...shared,color:'#ffffff',weight:cfg.weight+2,opacity:.85,interactive:false,className:'gm-borehole-plan-halo'}),
      line=lib.polyline(points,{...shared,color:cfg.color,weight:cfg.weight,opacity:1,className:'gm-borehole-plan-trace'});
    halo._gmBoreholePlan='halo';line._gmBoreholePlan='trace';line._fidx=idx;
    return [halo,line];
  }
  function svg(L,f,st,project,scale=1){
    const cfg=style(st),geometry=cfg&&plan(L,f);
    if(!geometry||geometry.vertical||typeof project!=='function'||!Number.isFinite(scale)||scale<=0)return '';
    const points=[];
    try{for(const p of geometry.points){const q=project(p[0],p[1]);if(!xy(q))return '';points.push(q.slice(0,2));}}catch(_){return '';}
    const d=points.map((p,i)=>(i?'L':'M')+p.map(v=>Number(v.toFixed(6))).join(' ')).join(' '),
      factor=.3*scale,width=cfg.weight*factor,haloWidth=(cfg.weight+2)*factor,dashValues=cfg.dash.map(v=>v*factor),dash=dashValues.join(' '),
      common=`d="${d}" fill="none" stroke-dasharray="${dash}" stroke-linecap="round" stroke-linejoin="round"`;
    if(![width,haloWidth,...dashValues].every(Number.isFinite))return '';
    return `<path class="gm-borehole-plan-halo" ${common} stroke="#ffffff" stroke-width="${haloWidth}" opacity="0.85"/>`+
      `<path class="gm-borehole-plan-trace" ${common} stroke="${xml(cfg.color)}" stroke-width="${width}"/>`;
  }
  api.boreholePlan={isLayer,plan,leaflet,svg};
})(typeof window!=='undefined'?window:globalThis);
