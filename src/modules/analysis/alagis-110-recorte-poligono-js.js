
(function recorteEspacialExato(){
  const antigo=window.alagisRecortaPorPoligono;
  const perto=(a,b)=>Math.abs(a[0]-b[0])<1e-8&&Math.abs(a[1]-b[1])<1e-8;
  function converte(p,de,para){
    if(String(de||'')===String(para||''))return [+p[0],+p[1]];
    try{const w=toWGS(de||S.workCRS,+p[0],+p[1]),q=fromWGS(para||S.workCRS,w[0],w[1]);return [q[0],q[1]];}catch(e){return [+p[0],+p[1]];}
  }
  function fecha(r){const a=(r||[]).filter(p=>Array.isArray(p)&&isFinite(p[0])&&isFinite(p[1])).map(p=>[+p[0],+p[1]]);if(a.length>2&&!perto(a[0],a[a.length-1]))a.push(a[0].slice());return a;}
  function polysGeom(g){
    if(!Array.isArray(g)||!g.length)return [];
    if(Array.isArray(g[0])&&typeof g[0][0]==='number')return [[fecha(g)]];
    if(Array.isArray(g[0])&&Array.isArray(g[0][0])&&typeof g[0][0][0]==='number')return [[...g.map(fecha)]];
    if(Array.isArray(g[0])&&Array.isArray(g[0][0])&&Array.isArray(g[0][0][0]))return g.map(p=>p.map(fecha));
    return [];
  }
  function mascara(Lp,crs){
    const mp=[];(Lp.features||[]).forEach(f=>polysGeom(f.geom).forEach(poly=>{
      const q=poly.map(r=>fecha(r.map(p=>converte(p,Lp.crs||S.workCRS,crs)))).filter(r=>r.length>=4);if(q.length)mp.push(q);
    }));return mp;
  }
  function naBorda(p,r){for(let i=1;i<r.length;i++){const a=r[i-1],b=r[i],dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy;if(!l2)continue;const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l2)),x=a[0]+t*dx,y=a[1]+t*dy;if(Math.hypot(p[0]-x,p[1]-y)<1e-7)return true;}return false;}
  function noAnel(p,r){if(naBorda(p,r))return true;let d=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if(((a[1]>p[1])!==(b[1]>p[1]))&&p[0]<(b[0]-a[0])*(p[1]-a[1])/((b[1]-a[1])||1e-20)+a[0])d=!d;}return d;}
  function dentro(p,mp){return mp.some(poly=>poly[0]&&noAnel(p,poly[0])&&!poly.slice(1).some(h=>noAnel(p,h)&&!naBorda(p,h)));}
  function cruzaT(a,b,c,d){
    const rx=b[0]-a[0],ry=b[1]-a[1],sx=d[0]-c[0],sy=d[1]-c[1],den=rx*sy-ry*sx;if(Math.abs(den)<1e-14)return null;
    const qx=c[0]-a[0],qy=c[1]-a[1],t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
    return t>1e-10&&t<1-1e-10&&u>=-1e-10&&u<=1+1e-10?t:null;
  }
  function cortaLinha(linha,mp){
    const bordas=mp.flatMap(p=>p).flatMap(r=>r.slice(1).map((b,i)=>[r[i],b])),partes=[];let atual=null;
    for(let i=1;i<linha.length;i++){
      const a=linha[i-1],b=linha[i],ts=[0,1];bordas.forEach(e=>{const t=cruzaT(a,b,e[0],e[1]);if(t!=null)ts.push(t)});ts.sort((x,y)=>x-y);
      const un=[...new Set(ts.map(t=>Math.round(t*1e12)/1e12))];
      for(let k=1;k<un.length;k++){
        const t0=un[k-1],t1=un[k],mid=(t0+t1)/2,p=[a[0]+(b[0]-a[0])*mid,a[1]+(b[1]-a[1])*mid];
        if(!dentro(p,mp)){if(atual&&atual.length>1)partes.push(atual);atual=null;continue;}
        const p0=[a[0]+(b[0]-a[0])*t0,a[1]+(b[1]-a[1])*t0],p1=[a[0]+(b[0]-a[0])*t1,a[1]+(b[1]-a[1])*t1];
        if(!atual||!perto(atual[atual.length-1],p0)){if(atual&&atual.length>1)partes.push(atual);atual=[p0];}atual.push(p1);
      }
    }
    if(atual&&atual.length>1)partes.push(atual);return partes;
  }
  window.alagisRecortaPorPoligono=function(L,Lp){
    if(!L||!Lp||Lp.gtype!=='polygon')return 0;
    const mp=mascara(Lp,L.crs||S.workCRS);if(!mp.length)return 0;
    const antes=(L.features||[]).length,saida=[];let alteradas=0;
    try{
      if(L.gtype==='polygon'){
        (L.features||[]).forEach(f=>{
          const src=polysGeom(f.geom);let res=[];
          try{res=(typeof polygonClipping!=='undefined'&&src.length)?polygonClipping.intersection(src,mp):[];}catch(e){res=[];}
          if(!res.length){alteradas++;return;}if(JSON.stringify(res)!==JSON.stringify(src))alteradas++;
          res.forEach(poly=>saida.push({geom:poly,multi:true,props:Object.assign({},f.props||{})}));
        });
      }else if(L.gtype==='line'){
        (L.features||[]).forEach(f=>{
          const linhas=(Array.isArray(f.geom?.[0])&&typeof f.geom[0][0]==='number')?[f.geom]:f.geom||[];let n=0;
          linhas.forEach(l=>cortaLinha(l,mp).forEach(q=>{n++;saida.push({geom:q,multi:true,props:Object.assign({},f.props||{})})}));if(n!==linhas.length)alteradas++;
        });
      }else if(L.gtype==='point'){
        (L.features||[]).forEach(f=>{const pts=(f.geom||[]).filter(p=>dentro(p,mp));if(pts.length)saida.push(Object.assign({},f,{geom:pts}));if(pts.length!==(f.geom||[]).length)alteradas++;});
      }else return typeof antigo==='function'?antigo(L,Lp):0;
      L.features=saida;try{drawLayer(L);refreshUI();}catch(e){}return Math.max(0,antes-saida.length)||(alteradas?1:0);
    }catch(e){console.warn('Recorte exato por polígono',e);return typeof antigo==='function'?antigo(L,Lp):0;}
  };

  function poligonos(){return (S.layers||[]).filter(L=>L&&L.gtype==='polygon'&&(L.features||[]).length);}
  function opcoes(sel,manter=true){if(!sel)return;const old=sel.value;sel.innerHTML='<option value="vista">Extensão visível da tela (sem máscara)</option>'+poligonos().map(L=>'<option value="'+L.id+'">Somente dentro do polígono · '+esc(L.name)+'</option>').join('');if(manter&&[...sel.options].some(o=>o.value===old))sel.value=old;}
  function preparaWms(){
    const sec=document.getElementById('secWMS');if(!sec)return;
    let box=document.getElementById('wmsClipBox');if(!box){
      box=document.createElement('div');box.id='wmsClipBox';box.innerHTML='<div class="wms-clip-title">Recorte espacial</div><div class="wms-clip-help">WMS não altera o arquivo do servidor: o CCMGIS aplica uma máscara visual dinâmica e mostra apenas o interior do polígono.</div><select id="wmsClipArea"></select><label class="snap-opt" style="margin-top:5px"><input type="checkbox" id="wmsClipOn" checked><span>Aplicar máscara poligonal às camadas adicionadas</span></label>';
      const add=document.getElementById('btnWmsAdd')?.closest('.row2');(add||sec.lastElementChild).before(box);
    }opcoes(document.getElementById('wmsClipArea'));
  }
  function svgDefs(){let s=document.getElementById('alagisWmsClipSvg');if(s)return s;s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.id='alagisWmsClipSvg';s.setAttribute('width','0');s.setAttribute('height','0');s.style.position='absolute';document.body.appendChild(s);return s;}
  function aplicaClipWms(w){
    const id=w&&w.clipLayerId,Lp=id&&(S.layers||[]).find(L=>String(L.id)===String(id)),c=w?.llayer?.getContainer?.();if(!c)return;
    if(!Lp){c.style.clipPath='';c.style.webkitClipPath='';return;}
    const svg=svgDefs(),cid='alagis-wms-clip-'+String(w.id).replace(/[^\w-]/g,''),old=document.getElementById(cid);if(old)old.remove();
    const cp=document.createElementNS('http://www.w3.org/2000/svg','clipPath');cp.id=cid;cp.setAttribute('clipPathUnits','userSpaceOnUse');
    const path=document.createElementNS('http://www.w3.org/2000/svg','path'),mr=map.getContainer().getBoundingClientRect(),cr=c.getBoundingClientRect();let d='';
    (Lp.features||[]).forEach(f=>polysGeom(f.geom).forEach(poly=>poly.forEach(r=>{r.forEach((p,i)=>{const q=converte(p,Lp.crs||S.workCRS,'EPSG:4326'),z=map.latLngToContainerPoint([q[1],q[0]]),x=z.x+mr.left-cr.left,y=z.y+mr.top-cr.top;d+=(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2);});d+='Z';})));
    path.setAttribute('d',d);path.setAttribute('clip-rule','evenodd');path.setAttribute('fill-rule','evenodd');cp.appendChild(path);svg.appendChild(cp);c.style.clipPath='url(#'+cid+')';c.style.webkitClipPath='url(#'+cid+')';
  }
  function atualizaWms(){(S.wms||[]).forEach(aplicaClipWms);}
  const criaAntigo=window.wmsCreateLayer;
  if(typeof criaAntigo==='function')window.wmsCreateLayer=function(meta,refresh){
    const w=criaAntigo(meta,refresh),sel=document.getElementById('wmsClipArea'),on=document.getElementById('wmsClipOn');
    const escolhido=meta?.clipLayerId||(on?.checked&&sel?.value&&sel.value!=='vista'?sel.value:null);if(escolhido)w.clipLayerId=escolhido;
    setTimeout(()=>aplicaClipWms(w),120);return w;
  };
  function liga(){
    document.querySelectorAll('.snap-opt span').forEach(s=>{if(/Só o que toca a poligonal/i.test(s.textContent))s.textContent='Recortar exatamente e manter somente o interior do polígono';});
    preparaWms();if(typeof window.alagisAtualizaAreasFederais==='function')window.alagisAtualizaAreasFederais();
    map?.on?.('moveend zoomend resize',atualizaWms);document.addEventListener('pointerup',()=>setTimeout(atualizaWms,80),{passive:true});
    document.addEventListener('click',e=>{if(e.target.closest?.('.rbtn'))setTimeout(()=>{preparaWms();opcoes(document.getElementById('wmsClipArea'));},80);},{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',liga,{once:true});else liga();
})();
