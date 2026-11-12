
/* ==================== PROJEÇÕES DE TALUDES ====================
   Crescimento paramétrico a partir de uma linha aberta. Cada iteração executa
   offset 3D da face (altura assinada/ângulo) e offset 2D da berma. A sequência
   permanece vinculada à geometria-base e é integralmente refeita ao editá-la. */
(function(){
  const escP = s => typeof esc==='function' ? esc(String(s??'')) : String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmtP = n => Number.isFinite(+n) ? (+n).toLocaleString('pt-BR',{maximumFractionDigits:2}) : '—';
  const prId = id => String(id??'');
  const prVal = id => document.getElementById(id)?.value ?? '';
  const prNum = (id,def) => { const v=+prVal(id); return Number.isFinite(v)?v:def; };

  function prParts(L){
    const out=[];
    for(const f of (L?.features||[])){
      const rs=f.multi&&Array.isArray(f.geom?.[0]?.[0])?f.geom:[f.geom];
      const zs=f.multi&&Array.isArray(f.zg?.[0])?f.zg:[f.zg];
      rs.forEach((r,ri)=>{
        if(!Array.isArray(r)||r.length<2)return;
        const zarr=zs[ri]||null;
        const pts=r.map((p,i)=>{const q=reproj(L.crs,S.workCRS,+p[0],+p[1]);return [q[0],q[1],Number.isFinite(+zarr?.[i])?+zarr[i]:NaN];});
        if(pts.length>=2)out.push(pts);
      });
    }
    return out;
  }
  function prLongest(L){
    let best=[];
    for(const r of prParts(L)){
      if(r.length>best.length)best=r;
    }
    return best;
  }
  function prNormals(pts){
    const ns=[];
    for(let i=0;i<pts.length;i++){
      const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)];
      let dx=b[0]-a[0],dy=b[1]-a[1],ll=Math.hypot(dx,dy);
      if(!(ll>1e-9)){dx=1;dy=0;ll=1;}
      ns.push([-dy/ll,dx/ll]);
    }
    return ns;
  }
  function prCurrentSetup(){
    return {
      lado:prVal('prLado')||'left',
      altura:prNum('prAltura',-10),
      berma:Math.max(0,prNum('prBerma',8)),
      ang:Math.max(1,Math.min(89,prNum('prAngulo',37)))
    };
  }
  let prState=null,prSyncBusy=false,prSyncPending=false,prSyncTimer=null,prBuildSeq=0;
  function prOpts(select,html,keep){
    const el=document.getElementById(select);if(!el)return;
    const v=el.value;el.innerHTML=html;
    if(keep&&[...el.options].some(o=>o.value===v))el.value=v;
  }
  function refreshProjecoesPanel(){
    const lines=(S.layers||[]).filter(L=>L.gtype==='line'&&L.features?.length);
    const rasters=(S.rasters||[]).filter(r=>r&&r.d);
    prOpts('prLinha','<option value="">— escolha uma linha —</option>'+lines.map(L=>`<option value="${prId(L.id)}">${escP(L.name||'linha')}</option>`).join(''),true);
    prOpts('prBase','<option value="">— usar Z da linha ou cota informada —</option>'+rasters.map(r=>`<option value="${prId(r.id)}">${escP(r.name||'Topografia')}</option>`).join(''),true);
    const cut='<option value="__none__">— não cortar —</option>'+rasters.map(r=>`<option value="R:${prId(r.id)}">${r.d?.tin?'TIN':'MDT'} · ${escP(r.name||'Superfície')}</option>`).join('');
    prOpts('prCorte',cut,true);
    prPreviewCota();
  }
  function prLayerById(id){return (S.layers||[]).find(L=>String(L.id)===String(id));}
  function prRasterById(id){return (S.rasters||[]).find(r=>String(r.id)===String(id));}
  function prCutObject(){
    const v=prVal('prCorte');if(!v||v==='__none__')return null;
    return prRasterById(v.replace(/^R:/,''));
  }
  function prKeepSide(){return document.getElementById('prManterAbaixo')?.checked?'below':'above';}
  function prSetKeepSide(side,render=true){
    const acima=document.getElementById('prManterAcima'),abaixo=document.getElementById('prManterAbaixo');
    if(acima)acima.checked=side!=='below';
    if(abaixo)abaixo.checked=side==='below';
    if(render){prPreviewCota();prScheduleLiveSync(true);}
  }
  function prPointInsidePoly(cut,x,y){
    if(!cut||cut.gtype!=='polygon')return true;
    for(const f of cut.features||[]){
      const rs=f.multi&&Array.isArray(f.geom?.[0]?.[0])?f.geom:[f.geom];
      let inside=false;
      for(const rr of rs){
        const r=(rr||[]).map(p=>reproj(cut.crs,S.workCRS,+p[0],+p[1]));
        if(r.length>=3&&pointInRing(x,y,r,indiceAnel(r)))inside=!inside;
      }
      if(inside)return true;
    }
    return false;
  }
  function prDomainAllowed(cut,x,y){
    if(!cut)return true;
    if(cut.gtype==='polygon')return prPointInsidePoly(cut,x,y);
    return !!(cut.d&&Number.isFinite(sampleZbil(cut.d,x,y)));
  }
  function prAllowed(cut,x,y,z,sentido='above'){
    if(!cut)return true;
    if(cut.gtype==='polygon')return prPointInsidePoly(cut,x,y);
    const zc=cut.d?sampleZbil(cut.d,x,y):NaN;
    if(!Number.isFinite(zc))return false;
    if(!Number.isFinite(z))return false;
    // Hierarquia altimétrica: a superfície de trabalho fica à frente. Todo
    // trecho projetado abaixo dela é omitido, sem "pintar" sobre o terreno.
    return sentido==='below'?z<=zc+1e-3:z>=zc-1e-3;
  }
  function prClipParts(pts,cut,step,sentido='above'){
    if(!cut)return [pts];
    const parts=[],cur=[];
    const put=q=>{if(!cur.length||Math.hypot(q[0]-cur[cur.length-1][0],q[1]-cur[cur.length-1][1])>1e-7)cur.push(q);};
    const flush=()=>{if(cur.length>=2)parts.push(cur.splice(0,cur.length));else cur.length=0;};
    const interp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
    const fronteira=(a,b,okA)=>{let lo=0,hi=1;for(let k=0;k<22;k++){const m=(lo+hi)/2,q=interp(a,b,m),ok=prAllowed(cut,q[0],q[1],q[2],sentido);if(ok===okA)lo=m;else hi=m;}return interp(a,b,(lo+hi)/2);};
    let ant=null,okAnt=false;
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1],b=pts[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/Math.max(.25,step)));
      for(let j=0;j<=n;j++){
        if(i>1&&j===0)continue;const q=interp(a,b,j/n),ok=prAllowed(cut,q[0],q[1],q[2],sentido);
        if(ant&&ok!==okAnt){const f=fronteira(ant,q,okAnt);if(okAnt){put(f);flush();}else{flush();put(f);}}
        if(ok)put(q);else if(okAnt)flush();
        ant=q;okAnt=ok;
      }
    }
    flush();return parts;
  }
  function prOffsetLine(cur,dist,zDelta,lado){
    const signed=(lado==='right'?-1:1)*dist,eps=1e-9;
    const unit=(a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1],n=Math.hypot(dx,dy);return n>eps?[dx/n,dy/n]:null;};
    return cur.map((p,i)=>{
      let nx=0,ny=1,scale=signed;
      if(i===0||i===cur.length-1){
        const u=i===0?unit(cur[0],cur[1]):unit(cur[cur.length-2],cur[cur.length-1]);
        if(u){nx=-u[1];ny=u[0];}
      }else{
        const a=unit(cur[i-1],p),b=unit(p,cur[i+1]);
        if(a&&b){
          const n0=[-a[1],a[0]],n1=[-b[1],b[0]],bx=n0[0]+n1[0],by=n0[1]+n1[1],bl=Math.hypot(bx,by);
          if(bl>eps){nx=bx/bl;ny=by/bl;const den=nx*n1[0]+ny*n1[1];if(Math.abs(den)>.18)scale=signed/den;}
          else{nx=n1[0];ny=n1[1];}
          const cap=Math.max(Math.abs(signed)*2.25,Math.abs(signed)+.01);
          scale=Math.max(-cap,Math.min(cap,scale));
          if(scale*signed<0)scale=signed;
        }else if(a){nx=-a[1];ny=a[0];}else if(b){nx=-b[1];ny=b[0];}
      }
      return [p[0]+nx*scale,p[1]+ny*scale,p[2]+zDelta];
    });
  }
  function prProjectBench(cur,row){
    const run=Math.abs(row.altura)/Math.max(1e-6,Math.tan(row.ang*Math.PI/180));
    const face=prOffsetLine(cur,run,row.altura,row.lado);
    const berma=prOffsetLine(face,row.berma,0,row.lado);
    return {face,berma,run};
  }
  function prRemovePrevious(){
    const lineId=prState?.lineId,origem=lineId!=null?'projecoes-taludes:'+String(lineId):null;
    prRemoveOutputLines(lineId);prRemoveOutputSurfaces(lineId);
    if(origem){const sol=(S.solidos||[]).find(s=>s.modo==='projecoes-taludes'&&s.origem===origem);if(sol)solApaga(sol);}
  }
  function prOutputDaLinha(x,lineId){return x&&x._projecaoOutput&&String(x._projecaoLineId??x._projecao?.linhaId??'')===String(lineId??'');}
  function prRemoveOutputLines(lineId=prState?.lineId){
    for(const L of (S.layers||[]).filter(x=>prOutputDaLinha(x,lineId)))try{if(L.llayer)map.removeLayer(L.llayer);}catch(e){}
    S.layers=(S.layers||[]).filter(x=>!prOutputDaLinha(x,lineId));
  }
  function prRemoveOutputSurfaces(lineId=prState?.lineId){
    for(const r of (S.rasters||[]).filter(x=>prOutputDaLinha(x,lineId)))try{if(r.overlay)map.removeLayer(r.overlay);}catch(e){}
    S.rasters=(S.rasters||[]).filter(x=>!prOutputDaLinha(x,lineId));
  }
  function prAddFeature(features,pts,tipo,iter,row){
    if(!pts||pts.length<2)return;
    const classe=/inter/i.test(tipo)?'INTERSEÇÃO':/^crista$/i.test(tipo)?'CRISTA':/^pé$/i.test(tipo)?'PÉ':/^berma$/i.test(tipo)?'BERMA':'LINHA-BASE';
    features.push({geom:pts.map(p=>[p[0],p[1]]),multi:false,zg:pts.map(p=>+p[2].toFixed(3)),props:{ITERACAO:iter,TIPO:tipo,CLASSE:classe,LADO:row.lado||'base',ALTURA:+(row.altura||0).toFixed(2),ANGULO:+(row.ang||0).toFixed(2),BERMA:+(row.berma||0).toFixed(2)}});
  }
  function prNearestLine(lines,x,y){
    let best=null;
    for(const ln of lines)for(let i=1;i<ln.length;i++){
      const a=ln[i-1],b=ln[i],dx=b[0]-a[0],dy=b[1]-a[1],l2=dx*dx+dy*dy;
      const t=l2>1e-12?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/l2)):0;
      const qx=a[0]+t*dx,qy=a[1]+t*dy,d=Math.hypot(x-qx,y-qy);
      if(!best||d<best.d)best={d,z:a[2]+(b[2]-a[2])*t};
    }
    return best;
  }
  function prGenerateMdt(lines,base,cut,step){
    const all=lines.flat();if(!all.length)return null;
    let xmin=Math.min(...all.map(p=>p[0])),xmax=Math.max(...all.map(p=>p[0])),ymin=Math.min(...all.map(p=>p[1])),ymax=Math.max(...all.map(p=>p[1]));
    const cs=Math.max(.25,step),maxCells=700000;let nc=Math.max(1,Math.ceil((xmax-xmin)/cs)),nr=Math.max(1,Math.ceil((ymax-ymin)/cs));
    if(nc*nr>maxCells){const s=Math.sqrt((xmax-xmin)*(ymax-ymin)/maxCells);nc=Math.ceil((xmax-xmin)/s);nr=Math.ceil((ymax-ymin)/s);}
    const realCs=Math.max((xmax-xmin)/nc,(ymax-ymin)/nr),z=new Float32Array(nc*nr);z.fill(NaN);let valid=0;
    for(let r=0;r<nr;r++)for(let c=0;c<nc;c++){
      const x=xmin+(c+.5)*realCs,y=ymin+(nr-r-.5)*realCs;
      const near=prNearestLine(lines,x,y),zb=base?.d?sampleZbil(base.d,x,y):NaN;
      const zz=near&&near.d<=realCs*2.2?near.z:zb;
      if(Number.isFinite(zz)&&prDomainAllowed(cut,x,y)){z[r*nc+c]=zz;valid++;}
    }
    if(!valid)return null;
    return {nc,nr,cs:realCs,xll:xmin,yll:ymin,z,native:false,srcCRS:S.workCRS};
  }
  async function prBuildStripTin(lines,cut,step){
    if(!lines.length||lines[0].length<2)return null;
    const n=lines[0].length;
    if(lines.some(l=>l.length!==n))return null;
    const nv=lines.length*n,xs=new Float64Array(nv),ys=new Float64Array(nv),zs=new Float64Array(nv);
    for(let j=0;j<lines.length;j++)for(let i=0;i<n;i++){
      const k=j*n+i,p=lines[j][i];xs[k]=p[0];ys[k]=p[1];zs[k]=p[2];
    }
    const tri=[];
    const aceita=(a,b,c)=>{
      const x=(xs[a]+xs[b]+xs[c])/3,y=(ys[a]+ys[b]+ys[c])/3;
      return prDomainAllowed(cut,x,y);
    };
    for(let j=1;j<lines.length;j++)for(let i=1;i<n;i++){
      const a=(j-1)*n+i-1,b=(j-1)*n+i,c=j*n+i,d=j*n+i-1;
      if(aceita(a,b,c))tri.push(a,b,c);
      if(aceita(a,c,d))tri.push(a,c,d);
    }
    if(!tri.length)return null;
    const itri=new Uint32Array(tri),g=await tinToGrid(xs,ys,zs,itri,Math.max(.25,step),0);
    const pos=new Float32Array(nv*3);
    for(let i=0;i<nv;i++){pos[3*i]=xs[i];pos[3*i+1]=ys[i];pos[3*i+2]=zs[i];}
    /* Perímetro ordenado da faixa: linha-base, fechamento da extremidade,
       última linha invertida e fechamento da extremidade inicial. Além de
       eliminar as pontas livres no TIN/MDT, este anel é reutilizado para
       construir as paredes laterais do sólido. */
    const boundary=[];
    for(let i=0;i<n;i++)boundary.push(i);
    for(let j=1;j<lines.length;j++)boundary.push(j*n+n-1);
    for(let i=n-2;i>=0;i--)boundary.push((lines.length-1)*n+i);
    for(let j=lines.length-2;j>0;j--)boundary.push(j*n);
    return {g,xs,ys,zs,tri:itri,boundary:new Uint32Array(boundary),mesh:{positions:pos,indices:itri,boundary:new Uint32Array(boundary)}};
  }
  function prBaseInfo(showErrors){
    const L=prLayerById(prVal('prLinha')),base=prRasterById(prVal('prBase'))||null,pts0=prLongest(L);
    if(!L||L.gtype!=='line'||pts0.length<2){if(showErrors)toast('Escolha ou desenhe uma linha-base aberta');return null;}
    const modo=document.querySelector('input[name="prCotaModo"]:checked')?.value||'max';
    let zmin=NaN,zmax=NaN,zRef=NaN;
    if(base?.d){
      // Amostra toda a linha, e não apenas seus vértices. Trechos fora da
      // grade ou sobre NoData não invalidam as cotas encontradas no restante.
      const amostras=[],passo=Math.max(.5,Math.abs(+base.d.cs||1));
      for(let i=1;i<pts0.length;i++){
        const a=pts0[i-1],b=pts0[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/passo));
        for(let j=(i===1?0:1);j<=n;j++){
          const t=j/n,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,z=sampleZbil(base.d,x,y);
          if(Number.isFinite(z))amostras.push(z);
        }
      }
      if(amostras.length){zmin=Math.min(...amostras);zmax=Math.max(...amostras);}
      else{
        // Linha totalmente fora do MDT: ainda permite iniciar a projeção pela
        // mínima/máxima global da superfície e recortá-la somente depois.
        const zz=base.d.z||[];
        for(let i=0;i<zz.length;i++){const z=+zz[i];if(!Number.isFinite(z))continue;zmin=Number.isFinite(zmin)?Math.min(zmin,z):z;zmax=Number.isFinite(zmax)?Math.max(zmax,z):z;}
        if(showErrors&&Number.isFinite(zmin))toast('Linha fora do MDT: usando as cotas mínima/máxima globais da superfície.');
      }
    }else{
      const zs=pts0.map(p=>p[2]).filter(Number.isFinite);
      if(zs.length){zmin=Math.min(...zs);zmax=Math.max(...zs);}
    }
    if(!Number.isFinite(zmin))zmin=prNum('prCota',0);
    if(!Number.isFinite(zmax))zmax=prNum('prCota',0);
    zRef=modo==='min'?zmin:modo==='manual'?prNum('prCota',0):zmax;
    const basePts=pts0.map(p=>[p[0],p[1],zRef]);
    return {L,base,pts0,basePts,modo,zmin,zmax,zRef,cut:prCutObject(),relacao:prKeepSide(),geomSig:prGeomSignature(pts0)};
  }
  function prGeomSignature(pts){
    let h=2166136261;
    for(const p of pts)for(const v of p){const s=Number.isFinite(+v)?Math.round(+v*1000):0;h^=s;h=Math.imul(h,16777619);}
    return `${pts.length}:${h>>>0}`;
  }
  function prPreviewCota(){
    const info=prBaseInfo(false),mn=document.getElementById('prCotaMin'),mx=document.getElementById('prCotaMax');
    if(mn)mn.value=info&&Number.isFinite(info.zmin)?(+info.zmin.toFixed(3)):prNum('prCota',0);
    if(mx)mx.value=info&&Number.isFinite(info.zmax)?(+info.zmax.toFixed(3)):prNum('prCota',0);
  }
  function prStateKey(info){
    return [info.L.id,info.base?.id||'',info.cut?.id||'',info.relacao||'above',info.modo,Number(info.zRef).toFixed(4)].join('|');
  }
  function prNewState(info){
    return {key:prStateKey(info),lineId:info.L.id,groupId:info.L.groupId||null,modo:info.modo,zRef:info.zRef,cutId:info.cut?.id||null,basePts:info.basePts,geomSig:info.geomSig,fullLines:[info.basePts],rows:[],records:[]};
  }
  function prReplay(info,rows){
    const st=prNewState(info);let cur=st.basePts;
    for(const original of rows){
      const row={...original},res=prProjectBench(cur,row);
      st.rows.push(row);st.records.push({row,face:res.face,berma:res.berma});st.fullLines.push(res.face,res.berma);cur=res.berma;
    }
    return st;
  }
  function prVisibleFeatures(state){
    const features=[],cut=prCutObject(),step=Math.max(.25,prNum('prPasso',2)),cortar=!!document.getElementById('prCortarLinhas')?.checked;
    if(document.getElementById('prManterBase')?.checked){
      prAddFeature(features,state.basePts,'Linha-base',0,{lado:'base',altura:0,berma:0,ang:0});
    }
    state.records.forEach((r,i)=>{
      /* A relação altimétrica é escolhida explicitamente; o sinal da altura
         apenas controla subir/descer a bancada e não troca o lado do corte. */
      const sentido=prKeepSide();
      const faces=cortar&&cut?prClipParts(r.face,cut,step,sentido):[r.face];
      const bermas=cortar&&cut?prClipParts(r.berma,cut,step,sentido):[r.berma];
      faces.forEach(p=>prAddFeature(features,p,r.row.altura<0?'Pé':'Crista',i+1,r.row));
      bermas.forEach(p=>prAddFeature(features,p,'Berma',i+1,r.row));
    });
    return features;
  }
  function prGridXY(g,r,c){return [g.xll+(c+.5)*g.cs,g.yll+(g.nr-r-.5)*g.cs];}
  function prVolumeBetween(g,cut,sentido=prKeepSide()){
    if(!g||!cut?.d)return {volume:null,area:0,zmin:NaN,zmax:NaN,valid:0};
    let volume=0,area=0,zmin=Infinity,zmax=-Infinity,valid=0;
    for(let r=0;r<g.nr;r++)for(let c=0;c<g.nc;c++){
      const zp=g.z[r*g.nc+c];if(!Number.isFinite(zp))continue;
      const [x,y]=prGridXY(g,r,c),zb=sampleZbil(cut.d,x,y);if(!Number.isFinite(zb))continue;
      const d=zp-zb;if((sentido==='above'&&d<-1e-3)||(sentido==='below'&&d>1e-3))continue;
      volume+=Math.abs(d)*g.cs*g.cs;area+=g.cs*g.cs;zmin=Math.min(zmin,zp,zb);zmax=Math.max(zmax,zp,zb);valid++;
    }
    return {volume,area,zmin:valid?zmin:NaN,zmax:valid?zmax:NaN,valid};
  }
  function prIntersectionFeatures(g,cut){
    if(!g||!cut?.d)return [];
    const diff=(r,c)=>{const zp=g.z[r*g.nc+c];if(!Number.isFinite(zp))return NaN;const [x,y]=prGridXY(g,r,c),zb=sampleZbil(cut.d,x,y);return Number.isFinite(zb)?zp-zb:NaN;};
    const feats=[],edge=(a,b,va,vb)=>{const t=Math.abs(va-vb)>1e-12?Math.max(0,Math.min(1,va/(va-vb))):.5;return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];};
    for(let r=0;r<g.nr-1;r++)for(let c=0;c<g.nc-1;c++){
      const p=[prGridXY(g,r,c),prGridXY(g,r,c+1),prGridXY(g,r+1,c+1),prGridXY(g,r+1,c)],v=[diff(r,c),diff(r,c+1),diff(r+1,c+1),diff(r+1,c)];
      if(v.some(q=>!Number.isFinite(q)))continue;const q=[];
      for(let e=0;e<4;e++){const n=(e+1)%4;if(v[e]===0||v[e]*v[n]<0)q.push(edge(p[e],p[n],v[e],v[n]));}
      if(q.length===2)feats.push({geom:q,multi:false,zg:null,props:{TIPO:'Interseção'}});
      else if(q.length===4){feats.push({geom:[q[0],q[1]],multi:false,zg:null,props:{TIPO:'Interseção'}},{geom:[q[2],q[3]],multi:false,zg:null,props:{TIPO:'Interseção'}});}
    }
    return feats;
  }
  function prDirectIntersectionFeatures(lines,cut,step){
    if(!cut?.d)return [];
    const cruzamentos=[];
    for(const ln of lines||[]){
      const hits=[];
      for(let i=1;i<ln.length;i++){
        const a=ln[i-1],b=ln[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(len/Math.max(.25,step)));
        let ant=null,dAnt=NaN;
        for(let j=0;j<=n;j++){
          if(i>1&&j===0)continue;
          const t=j/n,q=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t],zt=sampleZbil(cut.d,q[0],q[1]),d=Number.isFinite(zt)?q[2]-zt:NaN;
          if(ant&&Number.isFinite(dAnt)&&Number.isFinite(d)&&(d===0||dAnt===0||d*dAnt<0)){
            let lo=ant,hi=q,dl=dAnt;
            for(let k=0;k<24;k++){
              const m=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2],zm=sampleZbil(cut.d,m[0],m[1]),dm=Number.isFinite(zm)?m[2]-zm:NaN;
              if(!Number.isFinite(dm))break;if(dl===0||dl*dm<=0)hi=m;else{lo=m;dl=dm;}
            }
            const h=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2];
            if(!hits.length||Math.hypot(h[0]-hits[hits.length-1][0],h[1]-hits[hits.length-1][1])>step*.25)hits.push(h);
          }
          ant=q;dAnt=d;
        }
      }
      cruzamentos.push(hits);
    }
    const feats=[],max=Math.max(0,...cruzamentos.map(h=>h.length));
    for(let ramo=0;ramo<max;ramo++){
      let atual=[];
      for(const hits of cruzamentos){
        if(hits[ramo])atual.push(hits[ramo]);
        else if(atual.length){if(atual.length>=2)feats.push({geom:atual,multi:false,zg:null,props:{TIPO:'Interseção'}});atual=[];}
      }
      if(atual.length>=2)feats.push({geom:atual,multi:false,zg:null,props:{TIPO:'Interseção'}});
    }
    return feats;
  }
  /* Na conclusão não se fecham os fragmentos do marching-squares um a um.
     Delimita-se a ÁREA realmente mantida pelo corte e traça-se sua fronteira
     binária com moldura externa. Isso produz contornos topológicos completos,
     inclusive onde as superfícies coincidem ou a projeção encontra NoData. */
  function prCloseIntersectionFeatures(feats,tol,g,cut,sentido){
    if(g&&cut?.d){
      const NC=g.nc+2,NR=g.nr+2,m=new Uint8Array(NC*NR);
      const ztol=Math.max(.002,(+tol||g.cs)*.002);
      for(let r=0;r<g.nr;r++)for(let c=0;c<g.nc;c++){
        const zp=g.z[r*g.nc+c];if(!Number.isFinite(zp))continue;
        const xy=prGridXY(g,r,c),zt=sampleZbil(cut.d,xy[0],xy[1]);
        if(!Number.isFinite(zt))continue;
        const d=zp-zt,keep=sentido==='above'?d>=-ztol:d<=ztol;
        if(keep)m[(r+1)*NC+c+1]=1;
      }
      const P=(r,c)=>[g.xll+(c-1+.5)*g.cs,g.yll+(g.nr-1-(r-1)+.5)*g.cs];
      const segs=[];
      for(let r=0;r<NR-1;r++)for(let c=0;c<NC-1;c++){
        const v=[m[r*NC+c],m[r*NC+c+1],m[(r+1)*NC+c+1],m[(r+1)*NC+c]],
          p=[P(r,c),P(r,c+1),P(r+1,c+1),P(r+1,c)],q=[];
        for(let e=0;e<4;e++){const n=(e+1)%4;if(v[e]!==v[n])q.push([(p[e][0]+p[n][0])/2,(p[e][1]+p[n][1])/2]);}
        if(q.length===2)segs.push([q[0],q[1]]);
        else if(q.length===4){
          const centro=v[0]+v[1]+v[2]+v[3]>=2;
          if(centro){segs.push([q[0],q[3]],[q[1],q[2]]);}
          else {segs.push([q[0],q[1]],[q[2],q[3]]);}
        }
      }
      const snap=Math.max(g.cs*.01,1e-6),key=p=>Math.round(p[0]/snap)+'|'+Math.round(p[1]/snap),idx=new Map();
      segs.forEach((s,i)=>s.forEach((p,e)=>{const k=key(p);if(!idx.has(k))idx.set(k,[]);idx.get(k).push([i,e]);}));
      const used=new Uint8Array(segs.length),rings=[];
      for(let i=0;i<segs.length;i++){
        if(used[i])continue;used[i]=1;let line=[segs[i][0].slice(),segs[i][1].slice()],guard=segs.length+2;
        while(guard-->0){const cand=(idx.get(key(line[line.length-1]))||[]).find(x=>!used[x[0]]);if(!cand)break;
          const [j,e]=cand;used[j]=1;line.push(segs[j][1-e].slice());}
        if(line.length<4)continue;
        const a=line[0],b=line[line.length-1];if(Math.hypot(a[0]-b[0],a[1]-b[1])>g.cs*.02)line.push(a.slice());else line[line.length-1]=a.slice();
        let area=0;for(let k=0;k<line.length-1;k++)area+=line[k][0]*line[k+1][1]-line[k+1][0]*line[k][1];
        if(Math.abs(area)>=g.cs*g.cs*2)rings.push({geom:line,multi:false,zg:null,props:{TIPO:'Interseção fechada'}});
      }
      if(rings.length)return rings.sort((a,b)=>b.geom.length-a.geom.length);
    }
    const eps=Math.max(.001,+tol||.25),chains=sewChains((feats||[]).map(f=>f.geom).filter(q=>Array.isArray(q)&&q.length>1),eps);
    return chains.filter(c=>c.length>=3).map(c=>{const a=c[0],b=c[c.length-1],r=c.map(p=>p.slice());if(Math.hypot(a[0]-b[0],a[1]-b[1])>eps)r.push(a.slice());return {geom:r,multi:false,zg:null,props:{TIPO:'Interseção fechada'}};});
  }
  function prLastBenchElevation(state){
    const ln=state?.records?.[state.records.length-1]?.berma||state?.fullLines?.[state.fullLines.length-1]||[];
    const zs=ln.map(p=>+p?.[2]).filter(Number.isFinite).sort((a,b)=>a-b);
    return zs.length?zs[Math.floor(zs.length/2)]:NaN;
  }
  function prLevelClosedIntersections(inter,state,g,cut){
    /* O anel fechado é o contorno da área mantida: no daylight ele SEGUE a
       superfície de trabalho e, na borda da faixa, a última berma. A cota
       correta de cada vértice é a da superfície projetada naquele ponto
       (coincide com o corte no daylight e com a berma na borda) — nivelar
       tudo na berma deslocava o anel verticalmente em pleno talude. */
    const zb=prLastBenchElevation(state);
    return (inter||[]).map(f=>{
      const geom=(f.geom||[]).map(p=>{
        let z=g?sampleZbil(g,+p[0],+p[1]):NaN;
        if(!Number.isFinite(z)&&cut?.d)z=sampleZbil(cut.d,+p[0],+p[1]);
        if(!Number.isFinite(z))z=zb;
        return [+p[0],+p[1],Number.isFinite(z)?z:0];
      });
      if(geom.length>2){const a=geom[0],b=geom[geom.length-1];if(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-7)geom.push(a.slice());else geom[geom.length-1]=a.slice();}
      const zs=geom.map(p=>p[2]).sort((a,b)=>a-b),zmed=zs.length?zs[Math.floor(zs.length/2)]:zb;
      return {...f,geom,zg:geom.map(p=>+p[2].toFixed(3)),props:{...(f.props||{}),TIPO:'Interseção fechada',COTA:Number.isFinite(zmed)?+zmed.toFixed(2):zmed,FECHADA:1}};
    });
  }
  function prFinalLineFeatures(state,T,inter,cut,step){
    const out=[];
    const addParts=(line,tipo,it,row)=>{
      /* Mantém o lado altimétrico escolhido. A igualdade preserva a própria
         crista/pé até a quebra de relevo, sem criar paralela artificial. */
      const parts=cut?.d?prClipParts(line,cut,step,prKeepSide()):[line];
      for(const p of parts)if(p.length>=2)prAddFeature(out,p,tipo,it,row);
    };
    addParts(state.basePts,'Linha-base',0,{lado:'base',altura:0,berma:0,ang:0});
    for(let i=0;i<state.records.length;i++){
      const r=state.records[i];
      addParts(r.face,r.row.altura<0?'Pé':'Crista',i+1,r.row);
      addParts(r.berma,'Berma',i+1,r.row);
    }
    const aneis=(inter||[]).filter(f=>Array.isArray(f.geom)&&f.geom.length>=4).sort((a,b)=>b.geom.length-a.geom.length);
    for(const f of inter||[])out.push({geom:(f.geom||[]).map(p=>p.slice()),multi:false,zg:f.zg??null,props:{ITERACAO:state.rows.length,TIPO:'Interseção fechada',CLASSE:'INTERSEÇÃO',LADO:'corte',ALTURA:0,ANGULO:0,BERMA:0,COTA:f.props?.COTA,FECHADA:1}});
    /* A maior fronteira fechada encerra construtivamente a última berma. Ela
       é um anel 3D horizontal: nenhum vértice pode descer seguindo o MDT. */
    if(aneis.length){const f=aneis[0],z=prLastBenchElevation(state),geom=(f.geom||[]).map(p=>[+p[0],+p[1],z]);out.push({geom,multi:false,zg:z,props:{ITERACAO:state.rows.length,TIPO:'Berma final fechada',CLASSE:'BERMA',LADO:'fechamento',ALTURA:state.rows[state.rows.length-1]?.altura||0,ANGULO:state.rows[state.rows.length-1]?.ang||0,BERMA:state.rows[state.rows.length-1]?.berma||0,COTA:z,FECHADA:1}});}
    for(const f of out){f.props=f.props||{};f.props.FECHADA=(Array.isArray(f.geom)&&f.geom.length>2&&Math.hypot(f.geom[0][0]-f.geom[f.geom.length-1][0],f.geom[0][1]-f.geom[f.geom.length-1][1])<1e-7)?1:0;}
    return out;
  }
  function prClosedSolidMesh(T,cut){
    if(!T?.mesh?.positions||!T?.tri?.length||!T?.boundary?.length||!cut?.d)return null;
    const top=T.mesh.positions,n=top.length/3,pos=new Float32Array(top.length*2);
    pos.set(top,0);
    for(let i=0;i<n;i++){
      const x=top[3*i],y=top[3*i+1],zb=sampleZbil(cut.d,x,y);
      /* Um sólido só é declarado fechado quando toda a sua base existe na
         superfície de trabalho. Não fabricamos cotas fora do MDT/TIN. */
      if(!Number.isFinite(zb))return null;
      pos[3*(n+i)]=x;pos[3*(n+i)+1]=y;pos[3*(n+i)+2]=zb;
    }
    const idx=[];
    for(let i=0;i<T.tri.length;i+=3){
      const a=T.tri[i],b=T.tri[i+1],c=T.tri[i+2];
      idx.push(a,b,c,n+c,n+b,n+a);
    }
    const ring=Array.from(T.boundary);
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      idx.push(a,n+a,n+b,a,n+b,b);
    }
    return {positions:pos,indices:new Uint32Array(idx),boundary:T.boundary,closed:true};
  }
  function prRegisterSolid(surface,cut,V,T){
    const origem='projecoes-taludes:'+String(prState.lineId),old=(S.solidos||[]).find(s=>s.modo==='projecoes-taludes'&&s.origem===origem);
    /* TIN e MDT raster são superfícies e podem permanecer abertos. Somente o
       comando Concluir solicita e registra a casca volumétrica estanque. */
    const solicitado=!!document.getElementById('prSolido')?.checked;
    if(!prState?.concluido||!solicitado||!cut?.d||!V.valid){if(old&&(!prState?.concluido||!solicitado))solApaga(old);return null;}
    const closedMesh=prClosedSolidMesh(T,cut);
    if(!closedMesh){if(old)solApaga(old);return null;}
    const sol=solRegistra(null,{nome:old?.nome||'Sólido DCE fechado',modo:'projecoes-taludes',origem,volume:V.volume,zmin:V.zmin,zmax:V.zmax,res:surface.d.cs,dom:{x0:surface.d.xll,y0:surface.d.yll,x1:surface.d.xll+surface.d.nc*surface.d.cs,y1:surface.d.yll+surface.d.nr*surface.d.cs},fontes:{superficieProjetadaId:surface.id,superficieTrabalhoId:cut.id},regras:[{tipo:'entre',a:surface.id,b:cut.id}],cor:'#f59f00'});
    if(sol){sol.atualizado=new Date().toISOString();sol.iteracoes=prState.rows.length;sol.mesh=closedMesh;sol.fechado=true;surface._solidMesh=closedMesh;surface._solidClosed=true;
      /* o sólido fechado ganha o próprio objeto 3D: não depende do MDT ligado */
      try{if(typeof solGarantaGrupo==='function'&&solGarantaGrupo(sol))solPosiciona(sol);}catch(e){}}
    return sol;
  }
  async function prRenderState(message,quiet){
    if(!prState)return;
    const seq=++prBuildSeq;prRemoveOutputLines();
    const features=prVisibleFeatures(prState),L=prLayerById(prState.lineId);let linhasLayer=null;
    if(features.length){
      const fields=[{name:'ITERACAO',type:'N',length:8,decimal:0},{name:'TIPO',type:'C',length:16,decimal:0},{name:'CLASSE',type:'C',length:16,decimal:0},{name:'LADO',type:'C',length:10,decimal:0},{name:'ALTURA',type:'N',length:12,decimal:2},{name:'ANGULO',type:'N',length:12,decimal:2},{name:'BERMA',type:'N',length:12,decimal:2}];
      linhasLayer=addLayer({name:'Taludes projetados — cristas, pés e bermas',gtype:'line',crs:S.workCRS,features,fields,color:'#f59f00'});linhasLayer._projecaoOutput=true;linhasLayer._projecaoLineId=prState.lineId;linhasLayer.weight=3;linhasLayer.groupId=prState.groupId;if(linhasLayer.sym){linhasLayer.sym.color='#f59f00';linhasLayer.sym.stroke='#f59f00';linhasLayer.sym.weight=3;}drawLayer(linhasLayer);
    }
    let superficie=null,solido=null,V={volume:null,valid:0};
    if(prState.rows.length){
      const produto=prVal('prProduto')||'tin',step=Math.max(.25,prNum('prPasso',2)),cut=prCutObject();
      if(!quiet){showLoad('Atualizando projeção paramétrica…');await respira();}
      let T=null;try{T=await prBuildStripTin(prState.fullLines,cut,step);}catch(e){if(!quiet)toast('Falha ao atualizar a superfície: '+e.message);}
      if(seq!==prBuildSeq){if(!quiet)hideLoad();return;}
      prRemoveOutputSurfaces();
      if(T){
        superficie={id:rid++,name:(produto==='tin'?'TIN':'MDT')+' — Taludes projetados',d:T.g,style:{mode:'hipso_hs',opacity:.8},visible:true,overlay:null,groupId:prState.groupId,_projecaoOutput:true,_projecaoLineId:prState.lineId,_projecaoImplicit:true,_projecao:{linhaId:prState.lineId,corteId:cut?.id||null,iteracoes:prState.rows.length,resolucao:T.g.cs}};
        if(produto==='tin'){superficie.tinPuro=true;superficie._tinMethod='projecoes-taludes';superficie._tinSourceId=prState.lineId;superficie._tinMesh=T.mesh;tinAnexaExato(superficie.d,T.xs,T.ys,T.zs,T.tri,0,null);}
        S.rasters.push(superficie);S.selRaster=superficie;renderRaster(superficie);if(superficie.tinPuro)try{renderTinMalha2D(superficie);}catch(e){}
        V=prVolumeBetween(T.g,cut,prKeepSide());solido=prRegisterSolid(superficie,cut,V,T);
        let inter=prIntersectionFeatures(T.g,cut);
        if(!inter.length)inter=prDirectIntersectionFeatures(prState.fullLines,cut,step);
        if(prState.concluido){inter=prCloseIntersectionFeatures(inter,Math.max(T.g.cs,step)*1.35,T.g,cut,prKeepSide());inter=prLevelClosedIntersections(inter,prState,T.g,cut);}
        if(cut?.d){inter.forEach(f=>{f.props=f.props||{};f.props.CLASSE='INTERSEÇÃO';});const il=addLayer({name:'Interseção — Taludes × superfície de trabalho',gtype:'line',crs:S.workCRS,features:inter,fields:[{name:'TIPO',type:'C',length:24,decimal:0},{name:'CLASSE',type:'C',length:16,decimal:0},{name:'COTA',type:'N',length:12,decimal:2},{name:'FECHADA',type:'N',length:1,decimal:0}],color:'#7c3aed'});il._projecaoOutput=true;il._projecaoLineId=prState.lineId;il._projecaoIntersection=true;il.weight=3;il.groupId=prState.groupId;if(il.sym){il.sym.color='#7c3aed';il.sym.stroke='#7c3aed';il.sym.weight=3;}drawLayer(il);}
        if(prState.concluido){
          const finais=prFinalLineFeatures(prState,T,inter,cut,step),fields=[{name:'ITERACAO',type:'N',length:8,decimal:0},{name:'TIPO',type:'C',length:24,decimal:0},{name:'CLASSE',type:'C',length:16,decimal:0},{name:'LADO',type:'C',length:12,decimal:0},{name:'ALTURA',type:'N',length:12,decimal:2},{name:'ANGULO',type:'N',length:12,decimal:2},{name:'BERMA',type:'N',length:12,decimal:2},{name:'COTA',type:'N',length:12,decimal:2},{name:'FECHADA',type:'N',length:1,decimal:0}];
          const fl=addLayer({name:'DCE cortado — linhas finais e interseção fechada',gtype:'line',crs:S.workCRS,features:finais,fields,color:'#f59f00'});fl._projecaoOutput=true;fl._projecaoLineId=prState.lineId;fl._projecaoFinal=true;fl._projecaoCortada=true;fl.weight=3;fl.groupId=prState.groupId;if(fl.sym){fl.sym.color='#f59f00';fl.sym.stroke='#f59f00';fl.sym.weight=3;}drawLayer(fl);
          const aneis=(inter||[]).filter(f=>Array.isArray(f.geom)&&f.geom.length>=4).map(f=>({geom:f.geom.map(p=>p.slice()),multi:false,zg:null,props:{NOME:'Sólido DCE fechado',VOLUME_M3:V.volume,AREA_M2:V.area,Z_MIN:V.zmin,Z_MAX:V.zmax,FECHADO:1}}));
          if(solido&&aneis.length){
            const sf=[{name:'NOME',type:'C',length:60,decimal:0},{name:'VOLUME_M3',type:'N',length:18,decimal:2},{name:'AREA_M2',type:'N',length:18,decimal:2},{name:'Z_MIN',type:'N',length:12,decimal:2},{name:'Z_MAX',type:'N',length:12,decimal:2},{name:'FECHADO',type:'N',length:1,decimal:0}];
            const sl=addLayer({name:'Sólido DCE fechado — '+fmtP(V.volume)+' m³',gtype:'polygon',crs:S.workCRS,features:aneis,fields:sf,color:'#d97706'});sl._projecaoOutput=true;sl._projecaoLineId=prState.lineId;sl._projecaoSolidFootprint=true;sl._solidId=solido.id;sl.groupId=prState.groupId;sl.fillOpacity=.28;sl.weight=2;if(sl.sym){sl.sym.color='#d97706';sl.sym.stroke='#92400e';sl.sym.fill='#d97706';sl.sym.weight=2;sl.sym.fillOpacity=.28;}drawLayer(sl);
          }
          if(linhasLayer){linhasLayer.visible=false;try{drawLayer(linhasLayer);}catch(e){}}
        }
      }
      if(!quiet)hideLoad();
    }else{
      /* Sem iterações não existe superfície nem sólido: o Voltar até zero
         não pode deixar TIN/MDT e sólido órfãos na cena. */
      prRemoveOutputSurfaces();
      const origem='projecoes-taludes:'+String(prState.lineId),
        sol=(S.solidos||[]).find(s=>s.modo==='projecoes-taludes'&&s.origem===origem);
      if(sol)solApaga(sol);
    }
    refreshUI();
    const out=document.getElementById('prjOut');if(out){out.style.display='block';out.innerHTML=`Cota inicial: <b>${fmtP(prState.zRef)} m</b> · iterações: <b>${prState.rows.length}</b>`+(V.valid?` · volume: <b>${fmtP(V.volume)} m³</b>`:'')+`<br>Superfície, interseção e sólido são recalculados com a linha-base.`+(message?`<br>${escP(message)}`:'');}
  }
  async function projecaoIterar(){
    if(prSyncBusy){toast('Aguarde: a projeção está sendo realocada com a linha-base.');return;}
    const info=prBaseInfo(true);if(!info)return;
    const key=prStateKey(info);
    if(!prState||String(prState.lineId)!==String(info.L.id)){prRemovePrevious();prState=prNewState(info);}
    else if(prState.key!==key){
      /* Mesma linha com parâmetro novo (cota, corte ou lado altimétrico):
         realoca as iterações já feitas em vez de descartá-las — o mesmo
         comportamento da sincronização ao vivo, sem depender do usuário
         esperar o debounce de 160 ms antes de clicar em Iterar. */
      prState=prReplay(info,prState.rows.map(r=>({...r})));
    }
    const row=prCurrentSetup();if(Math.abs(row.altura)<1e-6){toast('Informe uma altura diferente de zero: negativa desce; positiva sobe');return;}
    /* Iterar depois de Concluir reabre a projeção: as camadas de conclusão
       (DCE cortado, interseção fechada, sólido) saem de cena e voltam num
       novo Concluir — o mesmo que já acontecia ao editar a linha-base. */
    prState.concluido=false;
    const cur=prState.fullLines[prState.fullLines.length-1],res=prProjectBench(cur,row);
    prState.rows.push({...row});prState.records.push({row:{...row},face:res.face,berma:res.berma});prState.fullLines.push(res.face,res.berma);
    await prRenderState(`Última bancada: ${row.lado==='left'?'esquerda':'direita'} · H ${fmtP(row.altura)} m · face ${fmtP(row.ang)}° · berma ${fmtP(row.berma)} m.`);
    toast(`Iteração ${prState.rows.length} concluída.`);
  }
  async function projecaoVoltar(){
    if(!prState||!prState.rows.length){toast('Não há iteração para desfazer');return;}
    prState.concluido=false;
    prState.rows.pop();prState.records.pop();prState.fullLines.splice(-2,2);await prRenderState('Última iteração removida.');toast('Uma iteração foi removida.');
  }
  function projecaoReiniciar(){
    prRemovePrevious();prState=null;const out=document.getElementById('prjOut');if(out){out.style.display='none';out.innerHTML='';}refreshUI();prPreviewCota();toast('Projeção reiniciada.');
  }
  async function projecaoGerarSuperficie(){
    if(!prState||!prState.rows.length){toast('Execute pelo menos uma iteração antes de gerar a superfície');return;}
    await prRenderState('Superfície atualizada manualmente.');toast('Superfície, interseção e volume atualizados.');
  }
  async function projecaoConcluir(){
    if(!prState||!prState.rows.length){toast('Execute pelo menos uma iteração antes de concluir');return;}
    const cut=prCutObject();
    if(!cut?.d){toast('Escolha uma superfície de trabalho MDT/TIN para concluir o corte');return;}
    const gerarSolido=!!document.getElementById('prSolido')?.checked;
    const cortar=document.getElementById('prCortarLinhas');if(cortar)cortar.checked=true;
    prState.concluido=true;
    await prRenderState(gerarSolido?'Projeção concluída com sólido fechado.':'Projeção e corte concluídos; o sólido poderá ser gerado posteriormente entre as superfícies.');
    const origem='projecoes-taludes:'+String(prState.lineId),sol=(S.solidos||[]).find(s=>s.modo==='projecoes-taludes'&&s.origem===origem&&s.fechado===true);
    if(gerarSolido&&!sol){prState.concluido=false;await prRenderState('O sólido não pôde ser fechado; a projeção segue aberta.');toast('O corte foi gerado, mas não foi possível fechar o sólido: parte do perímetro está fora da superfície de trabalho ou sobre área sem cota');return;}
    if(sol){sol.concluido=true;sol.atualizado=new Date().toISOString();}
    if(document.getElementById('prFurar3D')?.checked&&cut&&cut.d){
      /* A obra fura o terreno no 3D: a superfície de trabalho recebe a
         interseção fechada desta projeção como feição de recorte, com a
         referência estável PRJ:<idLinha> — a camada de interseção é
         recriada a cada render, mas o vínculo com a linha-base não muda. */
      const marcador='PRJ:'+String(prState.lineId);
      cut._v3=cut._v3||{papel:'terreno',cor:'#8d5524',limId:''};
      cut._v3.modoRecorte='furar';
      cut._v3.limIds=Array.from(new Set([...(cut._v3.limIds||[]),marcador]));
      cut._v3.recorteAtivo=true;
      cut._exactClipRings=null;
      try{if(typeof refresh3DPanel==='function')refresh3DPanel();}catch(e){}
      try{if(typeof v3Auto==='function')v3Auto();}catch(e){}
      toast('Superfície de trabalho marcada para ser furada no 3D pela interseção fechada.');
    }
    refreshUI();
    toast(gerarSolido?'Projeção concluída e sólido fechado com volume atualizado.':'Projeção cortada concluída sem criar sólido.');
  }
  function projecaoDesenharLinha(){
    clearTimeout(prSyncTimer);prSyncPending=false;prSyncBusy=false;prState=null;prBuildSeq++;
    document.querySelectorAll('#secProjecoes input,#secProjecoes select,#secProjecoes button').forEach(el=>{el.disabled=false;});
    const out=document.getElementById('prjOut');if(out){out.style.display='none';out.innerHTML='';}
    let L=addLayer({name:'Linha-base de taludes projetados',gtype:'line',crs:S.workCRS,features:[],fields:[{name:'NOME',type:'C',length:60,decimal:0},{name:'TIPO',type:'C',length:22,decimal:0}],color:'#9b5de5'});
    L._projecaoBase=true;L.weight=3;if(L.sym){L.sym.color='#9b5de5';L.sym.stroke='#9b5de5';L.sym.weight=3;}
    S.activeId=L.id;S.selFeat=null;
    refreshUI();refreshProjecoesPanel();const s=document.getElementById('prLinha');if(s)s.value=String(L.id);setTool('line');toast('Desenhe a linha-base aberta e finalize com duplo clique ou Enter.');
  }
  function abreProjecoes(btn){
    RIB_CAT_ATUAL='mineracao';switchView('geo');RIB_CAT_ATUAL='mineracao';ribbonBuild();
    setTimeout(()=>{try{refreshProjecoesPanel();}catch(e){}const sec=document.getElementById('secProjecoes'),ancora=[...document.querySelectorAll('#ribbon .rbtn')].find(b=>b.textContent.trim()==='Projeções')||btn;if(sec&&ancora)ribbonOpen(sec,ancora,'Projeções de taludes · linha aberta');},0);
  }
  function projecaoFinishHook(L){
    if(!(L&&L._projecaoBase))return;
    const idx=L.features.length-1;S.selFeat={layer:L,layerId:L.id,idx};S.activeId=L.id;
    setTimeout(()=>{try{setTool('select');refreshProjecoesPanel();const s=document.getElementById('prLinha');if(s)s.value=String(L.id);highlightSel();toast('Linha-base dos taludes concluída.');}catch(e){}},0);
  }
  const finish0=window.finishDraw;
  if(typeof finish0==='function'&&!window.__projecaoFinishWrapped){
    window.__projecaoFinishWrapped=true;window.finishDraw=function(){
      const L=GeoMineDrawingSession.layer(),ok=finish0.apply(this,arguments);
      if(ok&&L&&L._projecaoBase)projecaoFinishHook(L);
      return ok;
    };
  }
  const redraw0=window.redrawDraw;
  if(typeof redraw0==='function'&&!window.__projecaoRedrawWrapped){
    window.__projecaoRedrawWrapped=true;window.redrawDraw=function(){redraw0();};
  }
  function prScheduleLiveSync(force){
    if(prSyncBusy){prSyncPending=true;return;}
    if(!prState)return;
    clearTimeout(prSyncTimer);prSyncTimer=setTimeout(async()=>{
      if(prSyncBusy||!prState)return;const info=prBaseInfo(false);
      if(!info||String(info.L.id)!==String(prState.lineId))return;
      const changed=force||info.geomSig!==prState.geomSig||prStateKey(info)!==prState.key;
      if(!changed)return;
      const rows=prState.rows.map(r=>({...r}));prSyncBusy=true;
      try{
        prState=prReplay(info,rows);
        await prRenderState('Linha-base alterada: todas as iterações foram realocadas.',true);
        toast('Projeção paramétrica atualizada com a linha-base.');
      }catch(e){console.error(e);toast('Não foi possível atualizar a projeção: '+e.message);}
      finally{prSyncBusy=false;if(prSyncPending){const pend=prSyncPending;prSyncPending=false;prScheduleLiveSync(pend);}}
    },160);
  }
  const refreshProjection0=refreshUI;
  if(typeof refreshProjection0==='function'&&!window.__projecaoLiveWrapped){
    window.__projecaoLiveWrapped=true;
    refreshUI=function(){refreshProjection0();prScheduleLiveSync(false);};
  }
  window.refreshProjecoesPanel=refreshProjecoesPanel;window.projecaoGerar=projecaoIterar;window.projecaoConcluir=projecaoConcluir;window.projecaoDesenharLinha=projecaoDesenharLinha;window.projecaoLiveSync=prScheduleLiveSync;window.abreProjecoes=abreProjecoes;
  setTimeout(()=>{
    refreshProjecoesPanel();
    const bd=document.getElementById('btnPrDesenhar');if(bd)bd.onclick=projecaoDesenharLinha;
    const bg=document.getElementById('btnPrGerar');if(bg)bg.onclick=projecaoIterar;
    const bv=document.getElementById('btnPrVoltar');if(bv)bv.onclick=projecaoVoltar;
    const br=document.getElementById('btnPrReiniciar');if(br)br.onclick=projecaoReiniciar;
    const bs=document.getElementById('btnPrSuperficie');if(bs)bs.onclick=projecaoGerarSuperficie;
    const bc=document.getElementById('btnPrConcluir');if(bc)bc.onclick=projecaoConcluir;
    const bu=document.getElementById('btnPrAtualizar');if(bu)bu.onclick=refreshProjecoesPanel;
    ['prLinha','prBase','prCota'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('change',()=>{prPreviewCota();prScheduleLiveSync(true);});});
    const pa=document.getElementById('prManterAcima'),pb=document.getElementById('prManterAbaixo');
    if(pa)pa.addEventListener('change',()=>prSetKeepSide(pa.checked?'above':'below'));
    if(pb)pb.addEventListener('change',()=>prSetKeepSide(pb.checked?'below':'above'));
    document.querySelectorAll('input[name="prCotaModo"]').forEach(el=>el.addEventListener('change',()=>{prPreviewCota();prScheduleLiveSync(true);}));
    const mc=document.getElementById('prManterBase');if(mc)mc.addEventListener('change',()=>{if(prState)prRenderState();});
    const cl=document.getElementById('prCortarLinhas');if(cl)cl.addEventListener('change',()=>{if(prState)prRenderState(cl.checked?'Linhas cortadas exatamente na interseção.':'Linhas completas restauradas.');});
    const ps=document.getElementById('prSolido');if(ps)ps.addEventListener('change',()=>{if(prState)prRenderState();});
    const co=document.getElementById('prCorte');if(co)co.addEventListener('change',()=>prScheduleLiveSync(true));
  },0);
})();
