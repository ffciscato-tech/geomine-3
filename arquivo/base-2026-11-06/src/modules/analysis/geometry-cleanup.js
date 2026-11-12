/* ---------- Limpeza: REMOVER SPIKES (pontas de ida-e-volta) ----------
   Spike = vértice em que a direção da linha reverte quase 180° (desvio
   ≥ ang) com pelo menos um dos lados curto (≤ lado). Remoção ITERATIVA
   até estabilizar; trata linhas abertas e anéis fechados (o vértice de
   fechamento é reavaliado). NUNCA mexe em vértice sem reversão — não é
   suavização: cantos legítimos ficam intactos.                        */
function limSpikeSeq(seq,zseq,ang,lado,fechada){
  const cosLim=Math.cos((180-ang)*Math.PI/180); /* desvio≥ang ⇔ cosθ ≤ −cos(180−ang) */
  let g=seq.map(p=>p.slice()),z=zseq?zseq.slice():null,rem=0,mexeu=true,guard=0;
  while(mexeu&&guard++<64){
    mexeu=false;
    const n=g.length;
    if(n<(fechada?4:3))break;
    for(let i=fechada?0:1;i<(fechada?n:n-1);i++){
      const ia=(i-1+n)%n,ic=(i+1)%n,
        a=g[ia],b=g[i],c=g[ic],
        v1x=b[0]-a[0],v1y=b[1]-a[1],v2x=c[0]-b[0],v2y=c[1]-b[1],
        l1=Math.hypot(v1x,v1y),l2=Math.hypot(v2x,v2y);
      if(l1<1e-9||l2<1e-9){g.splice(i,1);if(z)z.splice(i,1);rem++;mexeu=true;break;}
      const cos=(v1x*v2x+v1y*v2y)/(l1*l2);
      if(cos<=-cosLim&&Math.min(l1,l2)<=lado){
        g.splice(i,1);if(z)z.splice(i,1);rem++;mexeu=true;break;
      }
    }
  }
  return {g,z,rem};
}
function limRemoveSpikes(angId,ladoId,escId){
  const ang=parseFloat(String((document.getElementById(angId)||{}).value||'').replace(',','.')),
    lado=parseFloat(String((document.getElementById(ladoId)||{}).value||'').replace(',','.'));
  if(!isFinite(ang)||ang<90||ang>180){toast('Desvio mínimo entre 90° e 180°');return;}
  if(!isFinite(lado)||lado<=0){toast('Informe o lado máximo do spike em metros');return;}
  const esc2=(document.getElementById(escId)||{}).value||'todas',
    alvo=S.layers.filter(l=>l.gtype==='line'&&(esc2==='todas'||l.id===S.activeId));
  if(!alvo.length){toast(esc2==='ativa'?'A camada ativa não é de linhas':'Nenhuma camada de linhas no projeto');return;}
  let totV=0,totF=0;const det=[];
  for(const L of alvo){
    let vL=0;
    L.features.forEach(f=>{
      if(!f.geom||f.geom.length<3)return;
      const multi=!!(f.multi&&Array.isArray(f.geom[0]&&f.geom[0][0])),
        rs=multi?f.geom:[f.geom],
        zs=multi?(f.zg||rs.map(()=>null)):[f.zg||null];
      const novos=[],novosZ=[];let remF=0;
      rs.forEach((r,ri)=>{
        const fechada=r.length>3&&Math.hypot(r[0][0]-r[r.length-1][0],r[0][1]-r[r.length-1][1])<=0.02;
        let seq=r,zseq=zs[ri]||null,cauda=false;
        if(fechada){seq=r.slice(0,-1);zseq=zseq?zseq.slice(0,-1):null;cauda=true;}
        const res=limSpikeSeq(seq,zseq,ang,lado,fechada);
        remF+=res.rem;
        let gg=res.g,zz=res.z;
        if(cauda&&gg.length){gg=gg.concat([gg[0].slice()]);if(zz)zz=zz.concat([zz[0]]);}
        novos.push(gg);novosZ.push(zz);
      });
      if(remF>0){
        undoPush({t:'geom',L,f,geom:f.geom,multi:f.multi,zg:f.zg,msg:'spikes removidos'});
        f.geom=multi?novos:novos[0];
        if(f.zg!=null)f.zg=multi?novosZ:novosZ[0];
        vL+=remF;totF++;
      }
    });
    if(vL>0){det.push('• '+L.name+': '+vL+' vértice(s)');totV+=vL;drawLayer(L);}
  }
  refreshUI();
  if(typeof cmdLog==='function')cmdLog('limpeza: '+totV+' spike(s) removido(s) em '+totF+' feição(ões)','ok');
  toast(totV?('⚡ '+totV+' spike(s) removidos em '+totF+' feição(ões) — Ctrl+Z desfaz por feição\n'+det.join('\n')):
    'Nenhum spike encontrado no escopo (desvio ≥ '+ang+'°, lado ≤ '+lado+' m)');
}
function limLinhasCurtas(inpId, escId){
  const min=parseFloat(String((document.getElementById(inpId)||{}).value||'').replace(',','.'));
  if(!isFinite(min)||min<=0){ toast('Informe o comprimento mínimo em metros'); return; }
  const esc2=(document.getElementById(escId)||{}).value||'todas';
  const alvo=S.layers.filter(l=>l.gtype==='line' && (esc2==='todas' || l.id===S.activeId));
  if(!alvo.length){ toast(esc2==='ativa'? 'A camada ativa não é de linhas':'Nenhuma camada de linhas no projeto'); return; }
  const plano=[]; let tot=0;
  for(const L of alvo){
    const precisaReproj = String(L.crs||'')!==String(S.workCRS||'');
    const idxs=[];
    L.features.forEach((f,i)=>{
      if(!f.geom){ return; }
      const rs=(f.multi&&Array.isArray(f.geom[0][0]))?f.geom:[f.geom];
      let len=0;
      for(const r of rs){
        let prev=null;
        for(const p of r){
          const w=precisaReproj? reproj(L.crs,S.workCRS,p[0],p[1]) : p;
          if(prev) len+=Math.hypot(w[0]-prev[0], w[1]-prev[1]);
          prev=w;
          if(len>=min) break;                    // já passou do piso: não precisa somar o resto
        }
        if(len>=min) break;
      }
      if(len<min) idxs.push(i);
    });
    if(idxs.length){ plano.push({L, idxs}); tot+=idxs.length; }
  }
  if(!tot){ toast('Nenhuma linha com menos de '+min+' m no escopo'); return; }
  const det=plano.map(p=>'• '+p.L.name+': '+p.idxs.length).join('\n');
  if(!confirm('Descartar '+tot+' linha(s) com comprimento menor que '+min+' m?\n\n'+det+
    '\n\nCtrl+Z desfaz (uma camada por vez).')) return;
  for(const {L,idxs} of plano){
    idxs.sort((a,b)=>b-a);
    const rem=[];
    for(const i of idxs){ rem.push({idx:i, feat:L.features[i]}); L.features.splice(i,1); }
    undoPush({t:'mseldel', L, rem});             // mesmo desfazer da seleção múltipla
    drawLayer(L);
  }
  refreshUI();
  if(typeof cmdLog==='function') cmdLog('limpeza: '+tot+' linha(s) < '+min+' m descartada(s)','ok');
  toast(tot+' linha(s) curta(s) descartada(s) — Ctrl+Z desfaz');
}
function limRelatorio(){
  const a=limAnalisa();
  if(a.vazio){ toast('Nenhuma camada no escopo escolhido'); return; }
  const nada=!a.totF && !a.totV && !(a.camDup||[]).length && !(a.rasDup||[]).length;
  let html='';
  if(nada) html='<p style="margin:0;font-size:13px">Nada a limpar — nenhuma duplicata encontrada com tolerância de '+a.tol+' m.</p>';
  else{
    html='<div class="lp-info" style="margin-bottom:8px">Tolerância: <b>'+a.tol+' m</b></div>';
    if(a.porCamada.length){
      html+='<label class="field">Dentro das camadas</label><ul style="margin:0 0 8px;padding-left:18px;font-size:12px">';
      a.porCamada.forEach(({L,dup,vrem})=>{
        html+='<li><b>'+esc(L.name)+'</b>: '+(dup.length? dup.length+' feição(ões) idêntica(s)':'')+
          (dup.length&&vrem?' · ':'')+(vrem? vrem+' vértice(s) repetido(s)':'')+'</li>';
      });
      html+='</ul>';
    }
    if((a.camDup||[]).length){
      html+='<label class="field">Camadas duplicadas</label><ul style="margin:0 0 8px;padding-left:18px;font-size:12px">';
      a.camDup.forEach(g=>{ html+='<li>'+g.map(L=>esc(L.name)).join(' = ')+' → mantém a primeira</li>'; });
      html+='</ul>';
    }
    if((a.rasDup||[]).length){
      html+='<label class="field">Superfícies duplicadas</label><ul style="margin:0 0 8px;padding-left:18px;font-size:12px">';
      a.rasDup.forEach(g=>{ html+='<li>'+g.map(r=>esc(r.name)).join(' = ')+' → mantém a primeira</li>'; });
      html+='</ul>';
    }
  }
  const bg=document.createElement('div');
  bg.className='modal-bg on';
  bg.innerHTML='<div class="modal" style="width:min(560px,100%)">'+
    '<div class="modal-h"><b>Limpeza do projeto</b></div>'+
    '<div class="modal-b">'+html+
      '<div class="row2" style="margin-top:10px">'+
        (nada? '' : '<button class="tbtn" data-lm="ok" style="justify-content:center">🧹 Aplicar</button>')+
        '<button class="mini" data-lm="no" style="justify-content:center">Fechar</button>'+
      '</div>'+
      (nada? '' : '<div class="hint" style="margin-top:6px">Ctrl+Z desfaz feição a feição e camada a camada.</div>')+
    '</div></div>';
  document.body.appendChild(bg);
  const fim=()=>{ try{ bg.remove(); }catch(e){} };
  bg.querySelector('[data-lm="no"]').onclick=fim;
  bg.addEventListener('click',e=>{ if(e.target===bg) fim(); });
  const ok=bg.querySelector('[data-lm="ok"]');
  if(ok) ok.onclick=()=>{ limAplica(a); fim(); };
}
