/* Imagens de conferência da análise vigente. Não grava perfis no projeto,
   não reamostra o MDT e não representa uma simulação hidráulica. */
(function(){
'use strict';
const MAX_PAGES=80,MAX_BYTES=64*1024*1024,W=1600,H=1140;
const C={ink:'#263b4b',muted:'#5b7282',grid:'#d8e2e9',floor:'#a95330',level:'#008f85',guide:'#64748b',terrain:'#233b50'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short=(s,n=70)=>{const chars=Array.from(String(s??''));return chars.length>n?chars.slice(0,n-1).join('')+'…':chars.join('');};
const fmt=(v,n=2)=>Number(v).toLocaleString('pt-BR',{minimumFractionDigits:n,maximumFractionDigits:n});
const point=p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite);
const contourMetadata=c=>c?Object.fromEntries(['spacing','resolution','requestedTolerance','effectiveTolerance','verticesBefore','verticesAfter','reduced','applied','fallback','reason','attempts','method','areaBefore','areaAfter','areaChangeLimit','symmetricDifferenceArea','symmetricDifferenceRatio','symmetricDifferenceLimit'].filter(k=>c[k]!==undefined).map(k=>[k,c[k]])):null;
function prepare(snapshot,{segmentLength=50}={}){
  if(!snapshot||!['auto','depth','height','axisDepth','axisHeight'].includes(snapshot.mode)||!Number.isFinite(snapshot.resolution)||snapshot.resolution<=0)throw Error('Análise de calha inválida para gerar detalhes.');
  if(snapshot.mode!=='auto'&&(!Number.isFinite(snapshot.height)||snapshot.height<=0))throw Error('Profundidade da análise inválida.');
  if(!Number.isFinite(segmentLength)||segmentLength<1||segmentLength>10000)throw Error('Use trechos entre 1 e 10.000 m.');
  if(!Array.isArray(snapshot.outputs)||!snapshot.outputs.length)throw Error('Analise e confira a calha antes de gerar imagens.');
  const pages=[],axisReference=['axisDepth','axisHeight'].includes(snapshot.mode);
  for(const out of snapshot.outputs.flatMap(out=>out.segments?.length?out.segments.map(segment=>({...out,...segment})): [out])){
    const sections=out.sections;
    if(!Number.isFinite(out.index)||!Array.isArray(sections)||sections.length<2||!Array.isArray(out.ring)||out.ring.length<4||!(out.searchReach>0&&Number.isFinite(out.searchReach)))throw Error('Resultado incompleto; refaça a análise antes de exportar.');
    if(axisReference&&(!Array.isArray(out.polygons)||!out.polygons.length||out.polygons.some(p=>!Array.isArray(p)||!p.length||p.some(r=>!Array.isArray(r)||r.length<4||r.some(v=>!point(v))||r[0][0]!==r.at(-1)[0]||r[0][1]!==r.at(-1)[1]))))throw Error('Mancha 2D sem polígonos válidos; não é possível reconstruí-la pelas seções.');
    for(let i=0;i<sections.length;i++){
      const s=sections[i];
      const reference=axisReference?s.zReference:s.zFloor,referencePoint=axisReference?s.referencePoint:s.floorPoint,referenceOffset=axisReference?s.referenceOffset:s.floorOffset;
      if(![s.station,reference,s.level,s.width,s.zAxis,referenceOffset].every(Number.isFinite)||s.width<=0||s.level<=reference||i&&s.station<=sections[i-1].station||![s.center,referencePoint,s.left,s.right,s.normal].every(point)||!Array.isArray(s.profile)||s.profile.length<3)throw Error('Seção sem dados válidos para o detalhe.');
      if(s.profile.some((p,j)=>!Number.isFinite(p.offset)||p.z!==null&&!Number.isFinite(p.z)||j&&p.offset<=s.profile[j-1].offset))throw Error('Perfil amostrado inválido.');
      if(axisReference){
        if(s.referenceKind!=='axis'||s.zReference!==s.zAxis||s.referenceOffset!==0||s.referencePoint.some((v,k)=>k<2&&v!==s.center[k])||!Array.isArray(s.wetIntervals)||!s.wetIntervals.length||!Number.isFinite(s.spanWidth))throw Error('Referência ao eixo ou intervalos molhados ausentes.');
        let total=0,last=-Infinity;
        for(const interval of s.wetIntervals){
          if(![interval.leftOffset,interval.rightOffset,interval.width].every(Number.isFinite)||![interval.left,interval.right].every(point)||interval.width<=0||interval.leftOffset<=interval.rightOffset||interval.rightOffset<last-1e-8||Math.abs(interval.width-(interval.leftOffset-interval.rightOffset))>1e-6)throw Error('Intervalos molhados inválidos ou sobrepostos.');
          last=interval.leftOffset;total+=interval.width;
        }
        if(Math.abs(total-s.width)>1e-6||Math.abs(s.spanWidth-(s.wetIntervals.at(-1).leftOffset-s.wetIntervals[0].rightOffset))>1e-6)throw Error('A soma molhada não corresponde às larguras da seção.');
        if(s.profile.some(p=>p.level!==undefined&&p.level!==null&&!Number.isFinite(p.level)))throw Error('Nível amostrado inválido.');
      }
    }
    const axis=[];let start=0;
    while(start<sections.length-1){
      let end=start+1;while(end<sections.length-1&&sections[end].station-sections[start].station<segmentLength)end++;
      const group=sections.slice(start,end+1);
      /* margens suavizadas do trecho: recorte exato das curvas da calha */
      const sm=out.smoothing,leftCurve=sm?.applied&&Array.isArray(sm.leftIndex)&&Array.isArray(out.ring)?out.ring.slice(0,sm.leftCount):null,
        rightCurve=leftCurve?out.ring.slice(sm.leftCount,out.ring.length-1).reverse():null,
        smooth=leftCurve&&sm.leftIndex.length===sections.length&&sm.rightIndex.length===sections.length
          ?{bankLeft:leftCurve.slice(sm.leftIndex[start],sm.leftIndex[end]+1),bankRight:rightCurve.slice(sm.rightIndex[start],sm.rightIndex[end]+1)}:null;
      axis.push({id:String(out.index)+'-'+(axis.length+1),axisIndex:out.index,part:axis.length+1,start:group[0].station,end:group.at(-1).station,sections:group,
        layerName:String(snapshot.layerName||'Eixo'),rasterName:String(snapshot.rasterName||'MDT'),crs:String(snapshot.crs||''),mode:snapshot.mode,height:snapshot.height,resolution:snapshot.resolution,
        searchReach:out.searchReach,createdAt:snapshot.createdAt||new Date().toISOString(),
        ...(axisReference?{polygons:out.polygons,axisGuide:sections.map(s=>s.center),mapScope:'full-axis',referenceKind:'axis',contour:contourMetadata(out.contour)}:{}),
        ...(!axisReference&&smooth?smooth:{})});
      if(pages.length+axis.length>MAX_PAGES)throw Error('Mais de '+MAX_PAGES+' imagens. Aumente o tamanho dos trechos ou analise menos eixos por vez.');
      start=end;
    }
    axis.forEach(p=>p.total=axis.length);pages.push(...axis);
  }
  // Number all retained runs of an axis together; never draw across a gap.
  const byAxis=new Map();for(const p of pages){if(!byAxis.has(p.axisIndex))byAxis.set(p.axisIndex,[]);byAxis.get(p.axisIndex).push(p);}
  for(const list of byAxis.values())list.forEach((p,i)=>{p.part=i+1;p.total=list.length;p.id=p.axisIndex+'-'+p.part;});
  return pages;
}
function text(x,y,value,size=18,color=C.ink,extra=''){return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${extra}>${esc(value)}</text>`;}
function line(x1,y1,x2,y2,color=C.grid,width=1,extra=''){return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${extra}/>`;}
function card(x,y,w,h){return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="white" stroke="${C.grid}"/>`;}
function poly(points,color,width=2,fill='none',extra=''){return `<polyline points="${points.map(p=>p.map(v=>v.toFixed(2)).join(',')).join(' ')}" stroke="${color}" stroke-width="${width}" fill="${fill}" ${extra}/>`;}
function polygonPath(rings,xy){
  const d=rings.map(r=>r.map((p,i)=>(i?'L':'M')+xy(p).map(v=>v.toFixed(2)).join(',')).join(' ')+'Z').join(' ');
  return `<path data-role="axis-fill-polygon" data-rings="${rings.length}" d="${d}" fill="#d8e1e5" stroke="#8a9ba3" stroke-width="1.4" fill-rule="evenodd"/>`;
}
function terrainPath(profile,x,y){let d='',connected=false;for(const p of profile){if(!Number.isFinite(p.z)){connected=false;continue;}d+=(connected?'L':'M')+x(p.offset).toFixed(2)+','+y(p.z).toFixed(2);connected=true;}return `<path d="${d}" fill="none" stroke="${C.terrain}" stroke-width="2.5"/>`;}
function wetSurfacePath(interval,section,x,y){
  // Curved guides can assign different nearest-station levels across one
  // transverse profile. Use the actual sampled surface, never a flat bridge
  // over an island or a NoData gap. Older payloads have only endpoint levels.
  const sampled=section.profile.some(p=>Number.isFinite(p.level)),points=[
    {offset:interval.rightOffset,level:Number.isFinite(interval.zlevelR)?interval.zlevelR:section.level,wet:true},
    ...(sampled?section.profile.filter(p=>p.offset>interval.rightOffset&&p.offset<interval.leftOffset):[]),
    {offset:interval.leftOffset,level:Number.isFinite(interval.zlevelL)?interval.zlevelL:section.level,wet:true}
  ];
  let d='',connected=false;
  for(const p of points){if(!Number.isFinite(p.level)||p.wet===false){connected=false;continue;}d+=(connected?'L':'M')+x(p.offset).toFixed(2)+','+y(p.level).toFixed(2);connected=true;}
  return `<path data-role="profile-wet-interval" d="${d}" fill="none" stroke="${C.level}" stroke-width="3"/>`;
}
function ticks(x,y,w,h,xmin,xmax,zmin,zmax,{xname='',zname='Cota (m)'}={}){
  let svg=text(x,y-13,zname,15,C.muted);
  for(let i=0;i<=4;i++){
    const py=y+h-i*h/4,px=x+i*w/4;
    svg+=line(x,py,x+w,py)+text(x-9,py+5,fmt(zmin+(zmax-zmin)*i/4,1),14,C.muted,'text-anchor="end"');
    svg+=line(px,y,px,y+h)+text(px,y+h+24,fmt(xmin+(xmax-xmin)*i/4,1),14,C.muted,'text-anchor="middle"');
  }
  return svg+text(x+w/2,y+h+47,xname,15,C.muted,'text-anchor="middle"');
}
function renderSVG(page,{width=W,height=H}={}){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<320||height<240||width>3200||height>2400)throw Error('Tamanho de imagem fora do limite.');
  const ss=page.sections;if(!ss?.length)throw Error('Trecho sem seções.');
  const axisReference=['axisDepth','axisHeight'].includes(page.mode),simplified=axisReference&&page.contour?.applied===true,zReference=s=>axisReference?s.zReference:s.zFloor,referencePoint=s=>axisReference?s.referencePoint:s.floorPoint;
  if(axisReference&&(!Array.isArray(page.polygons)||!page.polygons.length))throw Error('Mancha 2D ausente; não substitua a geometria por uma faixa entre seções.');
  const mode=page.mode==='auto'?'Automático — margens pelo relevo':page.mode==='depth'?'Profundidade informada: '+fmt(page.height)+' m':axisReference?'Altura acima do eixo: '+fmt(page.height)+' m · preenchimento 2D':'Altura informada (legado): '+fmt(page.height)+' m';
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Detalhe de trecho da análise de calha"><rect width="1600" height="1140" fill="#f1f5f8"/><g font-family="Arial,Helvetica,sans-serif">`;
  svg+=text(32,33,'GEOMINE · DETALHES DA ANÁLISE',16,C.muted,'font-weight="bold"');
  svg+=text(32,72,short(page.layerName,65)+' · eixo '+page.axisIndex,28,C.ink,'font-weight="bold"');
  svg+=text(32,106,'Trecho '+page.part+'/'+page.total+' · '+fmt(page.start,1)+' a '+fmt(page.end,1)+' m · '+mode,20);
  svg+=text(32,139,'MDT: '+short(page.rasterName,65)+' · pixel '+fmt(page.resolution,3)+' m · '+page.crs+' · busca '+fmt(2*page.searchReach,1)+' m totais',17,C.muted);
  svg+=card(32,164,526,896)+text(52,195,axisReference?'Planta — contexto do eixo':'Planta do trecho',23,C.ink,'font-weight="bold"');
  if(axisReference)svg+=text(52,222,simplified?'Contorno simplificado; seções nativas em verde.':'Mancha 2D completa; seções do trecho em verde.',15,C.muted);
  // Escala isotrópica em XY (UTM), independente das escalas dos perfis.
  const pts=ss.flatMap(s=>[s.left,s.right,s.center,referencePoint(s)]);
  for(const p of [...(page.bankLeft||[]),...(page.bankRight||[])])pts.push(p);
  if(axisReference)for(const polygon of page.polygons)for(const ring of polygon)for(const p of ring)pts.push(p);
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
  for(const p of pts){xmin=Math.min(xmin,p[0]);xmax=Math.max(xmax,p[0]);ymin=Math.min(ymin,p[1]);ymax=Math.max(ymax,p[1]);}
  const pad=Math.max(2,Math.max(xmax-xmin,ymax-ymin)*.08);xmin-=pad;xmax+=pad;ymin-=pad;ymax+=pad;
  const bx=83,by=251,bw=430,bh=654,k=Math.min(bw/(xmax-xmin),bh/(ymax-ymin)),cx=(xmin+xmax)/2,cy=(ymin+ymax)/2;
  const xy=p=>[bx+bw/2+(p[0]-cx)*k,by+bh/2-(p[1]-cy)*k];
  for(let i=0;i<=3;i++){const yy=ymin+(ymax-ymin)*i/3,py=xy([cx,yy])[1];svg+=line(bx,py,bx+bw,py)+text(bx,py-7,'N '+fmt(yy,0),12,C.muted);}
  if(axisReference){
    for(const polygon of page.polygons)svg+=polygonPath(polygon,xy);
    svg+=poly(page.axisGuide.map(xy),C.guide,1.5,'none','stroke-dasharray="7 5"');
    for(const s of ss)for(const interval of s.wetIntervals)svg+=poly([interval.left,interval.right].map(xy),C.level,2.1,'none','data-role="map-wet-interval"');
  }else{
    const suave=Array.isArray(page.bankLeft)&&page.bankLeft.length>1&&Array.isArray(page.bankRight)&&page.bankRight.length>1;
    const ring=suave?[...page.bankLeft,...page.bankRight.slice().reverse(),page.bankLeft[0]]:[...ss.map(s=>s.left),...ss.slice().reverse().map(s=>s.right),ss[0].left];
    svg+=poly(ring.map(xy),C.level,2,'#d5efeb');
    for(const s of ss)svg+=poly([s.left,s.right].map(xy),'#89aaa6',1);
  }
  svg+=poly(ss.map(s=>s.center).map(xy),C.guide,2,'none','stroke-dasharray="7 5"');
  svg+=poly(ss.map(referencePoint).map(xy),C.floor,2.5);
  const candidates=[0,Math.floor((ss.length-1)/2),ss.length-1],chosen=[...new Set(candidates)];
  for(const i of chosen){const [x,y]=xy(referencePoint(ss[i]));svg+=`<circle cx="${x}" cy="${y}" r="5" fill="${C.floor}" stroke="white"/>`+text(x+10,y-8,fmt(ss[i].station,1)+' m',15,C.ink);}
  svg+=line(496,221,496,258,C.ink,2)+line(496,221,489,235,C.ink,2)+line(496,221,503,235,C.ink,2)+text(496,213,'N',17,C.ink,'text-anchor="middle"');
  const nominal=100/k,mag=10**Math.floor(Math.log10(nominal)),scale=([1,2,5,10].filter(n=>n*mag<=nominal).at(-1)||1)*mag;
  svg+=line(66,930,66+scale*k,930,C.ink,3)+line(66,925,66,935,C.ink,2)+line(66+scale*k,925,66+scale*k,935,C.ink,2)+text(66,917,fmt(scale,scale<1?2:0)+' m',16);
  svg+=text(52,968,axisReference?(simplified?'Cinza: contorno simplificado, com ilhas preservadas':'Cinza: mancha 2D, com ilhas e partes separadas'):'Verde: limites no nível calculado',16,axisReference?C.muted:C.level)+text(52,992,axisReference?'Marrom: eixo no trecho · verde: intervalos molhados':'Marrom: fundo · tracejado: eixo-guia',axisReference?15:16,C.muted)+text(52,1016,'Norte de quadrícula · mesma escala em X/Y',15,C.muted)+text(52,1040,ss.length+' seções · '+(axisReference?'soma molhada ':'largura ')+fmt(Math.min(...ss.map(s=>s.width)))+'–'+fmt(Math.max(...ss.map(s=>s.width)))+' m',16);
  // Até três perfis, sempre amostras reais existentes; não inventa seção intermediária.
  chosen.forEach((idx,j)=>{
    const s=ss[idx],px=578+j*336,pw=318;svg+=card(px,164,pw,466)+text(px+16,196,'Seção · '+fmt(s.station,1)+' m',21,C.ink,'font-weight="bold"');
    // Full-domain sections can contain over 100k samples. Accumulate bounds
    // without spreading them into function arguments or copying the profile.
    let lo=Math.min(zReference(s),s.level),hi=Math.max(zReference(s),s.level);
    for(const p of s.profile){
      if(Number.isFinite(p.z)){lo=Math.min(lo,p.z);hi=Math.max(hi,p.z);}
      if(axisReference&&p.wet!==false&&Number.isFinite(p.level)){lo=Math.min(lo,p.level);hi=Math.max(hi,p.level);}
    }
    const span=Math.max(.1,hi-lo),zlo=lo-span*.08,zhi=hi+span*.08;
    const xlo=s.profile[0].offset,xhi=s.profile.at(-1).offset,gx=px+60,gy=252,gw=242,gh=240;
    const x=d=>gx+(d-xlo)/(xhi-xlo)*gw,y=z=>gy+gh-(z-zlo)/(zhi-zlo)*gh;
    svg+=ticks(gx,gy,gw,gh,xlo,xhi,zlo,zhi,{xname:'Distância à guia (m)'});
    svg+=terrainPath(s.profile,x,y)+line(x(0),gy,x(0),gy+gh,C.guide,1.5,'stroke-dasharray="5 4"');
    const offset=p=>(p[0]-s.center[0])*s.normal[0]+(p[1]-s.center[1])*s.normal[1];
    if(axisReference)for(const interval of s.wetIntervals)svg+=wetSurfacePath(interval,s,x,y);
    else svg+=line(x(offset(s.right)),y(s.level),x(offset(s.left)),y(s.level),C.level,3);
    svg+=`<circle cx="${x(axisReference?s.referenceOffset:s.floorOffset)}" cy="${y(zReference(s))}" r="4" fill="${C.floor}"/>`;
    svg+=text(px+16,565,(axisReference?'Eixo ':'Fundo ')+fmt(zReference(s))+' m · '+(axisReference?'alvo ':'nível ')+fmt(s.level)+' m',15)+text(px+16,591,axisReference?'Molhado '+fmt(s.width)+' m · extensão '+fmt(s.spanWidth)+' m':'Largura '+fmt(s.width)+' m · altura '+fmt(s.level-s.zFloor)+' m',15,C.level);
    if(s.width<2*page.resolution-1e-8)svg+=text(px+16,615,'Estimada · precisão limitada pelo pixel',14,'#a45a14');
    else if(axisReference)svg+=text(px+16,615,'Altura '+fmt(s.level-zReference(s))+' m acima do eixo',14,C.muted);
    else if(s.detection?.supportSides===1)svg+=text(px+16,615,'Apoio em uma borda — revisar',14,'#a45a14');
  });
  svg+=card(578,648,990,412)+text(597,680,axisReference?'Perfil longitudinal — cota do eixo e nível local':'Perfil longitudinal — fundo e nível local',23,C.ink,'font-weight="bold"');
  const allz=ss.flatMap(s=>[zReference(s),s.level,s.zAxis]),zlo=Math.min(...allz),zhi=Math.max(...allz),dz=Math.max(.1,zhi-zlo),low=zlo-dz*.1,high=zhi+dz*.1;
  const gx=653,gy=721,gw=883,gh=235,x=st=>gx+(st-page.start)/(page.end-page.start)*gw,y=z=>gy+gh-(z-low)/(high-low)*gh;
  svg+=ticks(gx,gy,gw,gh,page.start,page.end,low,high,{xname:'Distância ao longo da guia (m)'});
  svg+=poly(ss.map(s=>[x(s.station),y(s.zAxis)]),C.guide,1.5,'none','stroke-dasharray="6 4"')+poly(ss.map(s=>[x(s.station),y(zReference(s))]),C.floor,2.5)+poly(ss.map(s=>[x(s.station),y(s.level)]),C.level,2.5);
  svg+=text(597,1033,'Perfis: escalas horizontal e vertical distintas; confira as cotas.',16,C.muted);
  svg+=text(32,1093,'Estimativa topográfica — não é simulação hidráulica nem delimitação automática do leito regular.',17,C.ink,'font-weight="bold"');
  svg+=text(32,1121,simplified?'Contorno simplificado (tol. '+fmt(page.contour.effectiveTolerance)+' m); perfis nativos. Eixo inteiro. PNG não georreferenciado.':axisReference?'Planta: toda a mancha do eixo, sem recorte artificial no trecho. PNG ilustrativo; não georreferenciado.':'Limites dos trechos seguem as seções calculadas. PNG ilustrativo; não georreferenciado.',15,C.muted)+text(1568,1121,short(page.createdAt,25),14,C.muted,'text-anchor="end"');
  return svg+'</g></svg>';
}
let context=null,pages=[],artifact=null,controller=null,serial=0;
const $=id=>document.getElementById('cd'+id);
function safeName(s){return String(s||'calha').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,65)||'calha';}
function guard(ctx=context){if(!ctx||!ctx.isCurrent())throw Error('A análise ou os dados mudaram. Feche os detalhes e analise novamente; nenhuma imagem antiga será baixada.');}
function message(s){$('Status').textContent=s;}
function clearArtifact(){artifact=null;$('Download').disabled=true;}
function busy(on){for(const id of ['Segment','Page','Selected','All','Rebuild'])$(id).disabled=on;$('Cancel').hidden=!on;$('Progress').hidden=!on;}
function preview(){clearArtifact();const p=pages[Number($('Page').value)];if(p)$('Preview').innerHTML=renderSVG(p);}
function rebuild(){
  clearArtifact();try{guard();pages=prepare(context.snapshot,{segmentLength:Number($('Segment').value.replace(',','.'))});
    $('Page').replaceChildren(...pages.map((p,i)=>new Option('Eixo '+p.axisIndex+' · trecho '+p.part+'/'+p.total+' · '+fmt(p.start,1)+'–'+fmt(p.end,1)+' m',i)));
    preview();message(pages.length+' imagem(ns). Confira a prévia, gere PNG/ZIP e depois use Baixar. Os limites seguem as seções calculadas.');
  }catch(e){pages=[];$('Page').replaceChildren();$('Preview').replaceChildren();message(e.message);}
}
async function png(svg,signal){
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'})),img=new Image(),canvas=document.createElement('canvas');
  try{
    await new Promise((resolve,reject)=>{
      let timer;const end=e=>{clearTimeout(timer);signal.removeEventListener('abort',abort);img.onload=img.onerror=null;e?reject(e):resolve();};
      const abort=()=>end(Error('Geração cancelada.'));img.onload=()=>end();img.onerror=()=>end(Error('Falha ao desenhar a imagem do trecho.'));
      signal.addEventListener('abort',abort,{once:true});timer=setTimeout(()=>end(Error('Tempo excedido ao desenhar o trecho.')),20000);if(signal.aborted)abort();else img.src=url;
    });
    if(signal.aborted)throw Error('Geração cancelada.');canvas.width=W;canvas.height=H;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Desenho de imagens indisponível.');ctx.drawImage(img,0,0);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Falha ao preparar PNG.')),'image/png'));
    if(signal.aborted)throw Error('Geração cancelada.');return blob;
  }finally{URL.revokeObjectURL(url);canvas.width=canvas.height=0;img.src='';}
}
async function generate(all){
  if(controller)return;let mine,ctx;
  try{
    guard();if(!pages.length)throw Error('Recalcule os trechos antes de gerar.');ctx=context;mine=controller=new AbortController();const generation=++serial;clearArtifact();busy(true);$('Progress').value=0;
    const selected=all?pages.slice():[pages[Number($('Page').value)]],zip=all?new JSZip():null;let totalBytes=0,blob=null;
    const items=[];
    for(let i=0;i<selected.length;i++){
      guard(ctx);if(mine.signal.aborted||generation!==serial)throw Error('Geração cancelada.');const p=selected[i];message('Gerando imagem '+(i+1)+' de '+selected.length+'…');
      blob=await png(renderSVG(p),mine.signal);guard(ctx);totalBytes+=blob.size;if(totalBytes>MAX_BYTES)throw Error('As imagens excedem 64 MB. Gere menos trechos por vez.');
      const name=safeName(p.layerName)+'_eixo_'+p.axisIndex+'_trecho_'+String(p.part).padStart(3,'0')+'.png';
      items.push({file:name,axis:p.axisIndex,start:p.start,end:p.end,mode:p.mode,depth:p.mode==='auto'||['axisDepth','axisHeight'].includes(p.mode)?null:p.height,crs:p.crs,resolution:p.resolution,searchTotal:2*p.searchReach,
        ...(['axisDepth','axisHeight'].includes(p.mode)?{heightAboveAxis:p.height,referenceKind:'axis',mapScope:'full-axis',widthDefinition:'sum-of-wet-intervals',contour:contourMetadata(p.contour)}:{})});
      if(zip)zip.file(name,await blob.arrayBuffer());$('Progress').value=(i+1)/selected.length*100;await new Promise(r=>setTimeout(r,0));
    }
    if(zip){zip.file('indice.json',JSON.stringify({source:ctx.snapshot.layerName,mdt:ctx.snapshot.rasterName,createdAt:ctx.snapshot.createdAt,warning:'Estimativa topográfica; não é simulação hidráulica. PNGs não georreferenciados.',items},null,2));blob=await zip.generateAsync({type:'blob',compression:'STORE'});}
    guard(ctx);if(mine.signal.aborted||generation!==serial)throw Error('Geração cancelada.');
    artifact={blob,name:all?safeName(ctx.snapshot.layerName)+'_detalhes.zip':items[0].file,context:ctx};$('Download').disabled=false;message((all?selected.length+' PNGs no ZIP':'PNG')+' pronto. Use Baixar para escolher o destino.');
  }catch(e){clearArtifact();message(e.message||String(e));}
  finally{if(controller===mine){controller=null;busy(false);}}
}
function cancel(){serial++;controller?.abort();clearArtifact();}
async function downloadReady(){
  if(!artifact||controller)return;const ready=artifact;
  try{guard(ready.context);$('Download').disabled=true;const result=await download(ready.blob,ready.name,{reportResult:true});if(context===ready.context)message(result?.status==='canceled'?'Download cancelado. O arquivo gerado continua disponível.':'Arquivo entregue ao navegador. Confira o destino escolhido.');}
  catch(e){if(artifact===ready)clearArtifact();message(e.message||String(e));}
  finally{if(artifact===ready)$('Download').disabled=false;}
}
function ensure(){
  if($('Modal'))return;const bg=document.createElement('div');bg.id='cdModal';bg.className='modal-bg';
  bg.innerHTML=`<style>#cdModal [hidden]{display:none!important}#cdPreview svg{display:block;width:100%;height:auto}#cdModal .modal-b{min-height:0;overflow:auto}#cdPreview{margin-top:12px}#cdControls{display:flex;gap:10px;flex-wrap:wrap;align-items:end}#cdControls label{display:block}</style><div class="modal" style="width:min(1100px,96vw);max-height:92dvh;display:flex;flex-direction:column"><div class="modal-h"><b>Detalhes da calha em imagens</b><div style="flex:1"></div><button class="tbtn" id="cdClose">Fechar</button></div><div class="modal-b"><div class="hint">Cada imagem contém planta, até três seções transversais e perfil longitudinal. Usa somente a análise atual, sem ortofoto de fundo. Para um resultado salvo, analise novamente com o MDT original antes de gerar detalhes.</div><div id="cdControls"><div><label for="cdSegment">Tamanho aproximado do trecho (m)</label><input id="cdSegment" inputmode="decimal" type="text" value="50"></div><button class="tbtn" id="cdRebuild">Atualizar trechos</button><div style="flex:1;min-width:220px"><label for="cdPage">Trecho da prévia</label><select id="cdPage" style="width:100%"></select></div></div><div class="hint" id="cdStatus" role="status" aria-live="polite"></div><progress id="cdProgress" max="100" value="0" style="width:100%" hidden></progress><div id="cdPreview"></div></div><div style="display:flex;gap:8px;padding:12px;flex-wrap:wrap;flex:none;border-top:1px solid var(--border)"><button class="tbtn" id="cdSelected">Gerar PNG deste trecho</button><button class="tbtn" id="cdAll">Gerar ZIP de todos os trechos</button><button class="tbtn" id="cdDownload" style="background:var(--amber);color:#18130a" disabled>Baixar arquivo gerado</button><button class="tbtn" id="cdCancel" hidden>Cancelar geração</button></div></div>`;
  document.body.append(bg);$('Close').onclick=()=>{cancel();context=null;pages=[];$('Preview').replaceChildren();bg.classList.remove('on');};
  $('Rebuild').onclick=rebuild;$('Segment').oninput=()=>{clearArtifact();pages=[];$('Page').replaceChildren();$('Preview').replaceChildren();message('Use Atualizar trechos para conferir a nova divisão.');};$('Page').onchange=preview;
  $('Selected').onclick=()=>generate(false);$('All').onclick=()=>generate(true);$('Download').onclick=downloadReady;$('Cancel').onclick=cancel;
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&bg.classList.contains('on')){e.preventDefault();e.stopImmediatePropagation();$('Close').click();}},true);
}
function open(ctx){ensure();cancel();context=ctx;try{guard();$('Modal').classList.add('on');rebuild();}catch(e){message(e.message);toast(e.message);}}
window.GeoMineChannelDetails={prepare,renderSVG,open,limits:{maxPages:MAX_PAGES,maxBytes:MAX_BYTES}};
})();
