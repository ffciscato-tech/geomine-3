/* ============================================================================
   IMPORTAÇÃO UNIVERSAL — DXF · DWG (detecção honesta) · KML/KMZ · GPX · CSV
   Tudo entra pelo ＋ Importar e pelo arrastar-e-soltar. O Z é preservado (zg).
   - DXF: não carrega CRS — E,N entram no CRS DE TRABALHO (toast avisa).
   - KML/KMZ/GPX: sempre EPSG:4326; altitude vira zg.
   - CSV: detecta colunas de coordenada pelo cabeçalho.
   ========================================================================== */

/* ---------- DXF: tokenizar ENTITIES em registros ---------- */
function dxfRecords(text){
  const A=text.split(/\r\n|\n/);
  const recs=[]; let i=0, inEnt=false, cur=null;
  while(i+1<A.length){
    const c=parseInt(A[i],10), v=A[i+1]; i+=2;
    if(Number.isNaN(c)) continue;
    if(c===0){
      const t=v.trim();
      if(t==='SECTION'){ inEnt=false; continue; }
      if(t==='ENDSEC'){ if(cur) recs.push(cur); inEnt=false; cur=null; continue; }
      if(t==='EOF'){ if(cur) recs.push(cur); cur=null; break; }
      if(!inEnt){ /* nome da seção vem no par 2/ENTITIES */ }
      if(cur) recs.push(cur);
      cur={T:t, g:[]};
      continue;
    }
    if(c===2 && v.trim()==='ENTITIES' && !inEnt){ inEnt=true; cur=null; continue; }
    if(inEnt && cur) cur.g.push([c, v]);
  }
  if(cur) recs.push(cur);
  return recs.filter(r=>!['SECTION','TABLE','ENDTAB','LAYER','LTYPE','STYLE','VPORT','APPID','DIMSTYLE','BLOCK_RECORD','CLASS'].includes(r.T));
}
function dxfBulgeArc(p1,p2,b,out){
  const dx=p2[0]-p1[0], dy=p2[1]-p1[1], d=Math.hypot(dx,dy);
  if(d<1e-12 || Math.abs(b)<1e-12){ out.push(p2.slice()); return; }
  const th=4*Math.atan(b);                       // varredura assinada
  const ux=dx/d, uy=dy/d, nx=-uy, ny=ux;         // normal à esquerda
  const s=b*d/2;                                 // sagitta assinada
  const r=((d/2)**2+s*s)/(2*s);                  // raio assinado
  const cx=(p1[0]+p2[0])/2+nx*(s-r), cy=(p1[1]+p2[1])/2+ny*(s-r);
  const a1=Math.atan2(p1[1]-cy, p1[0]-cx);
  // com o centro em m+n(s−r), o arco que passa pelo ápice da sagitta
  // (m+n·s, convenção: bulge>0 boja à ESQUERDA do sentido p1→p2)
  // corresponde à varredura −θ
  const steps=Math.max(2, Math.ceil(Math.abs(th)/(Math.PI/18)));   // ~10°
  for(let k=1;k<=steps;k++){
    const a=a1-th*k/steps;
    const z=(p1[2]!==undefined&&p2[2]!==undefined)? p1[2]+(p2[2]-p1[2])*k/steps : p1[2];
    out.push([cx+Math.abs(r)*Math.cos(a), cy+Math.abs(r)*Math.sin(a), z]);
  }
  out[out.length-1]=p2.slice();
}
function parseDXF(text){
  const recs=dxfRecords(text);
  const pts=[], lins=[], pols=[], faces=[], txts=[]; const warn={insert:0, mesh:0, outros:{}};
  const G=(r,c,def)=>{ const f=r.g.find(p=>p[0]===c); return f? parseFloat(f[1]) : def; };
  const GS=(r,c,def)=>{ const f=r.g.find(p=>p[0]===c); return f? f[1].trim() : def; };
  let openPoly=null;   // POLYLINE aguardando VERTEX/SEQEND
  const closePoly=()=>{
    if(!openPoly) return;
    const P=openPoly; openPoly=null;
    if(P.mesh){ warn.mesh++; return; }
    if(P.v.length>1) (P.closed?pols:lins).push({v:P.v, lay:P.lay, cor:P.cor, closed:P.closed});
  };
  for(const r of recs){
    if(r.T!=='VERTEX' && r.T!=='SEQEND') closePoly();
    const lay=GS(r,8,'0'), cor=G(r,62,undefined);
    switch(r.T){
      case 'POINT':
        pts.push({p:[G(r,10,0),G(r,20,0),G(r,30,undefined)], lay, cor}); break;
      case 'LINE':
        lins.push({v:[[G(r,10,0),G(r,20,0),G(r,30,undefined)],
                      [G(r,11,0),G(r,21,0),G(r,31,undefined)]], lay, cor, closed:false}); break;
      case 'LWPOLYLINE': {
        const flags=G(r,70,0), closed=!!(flags&1), elev=G(r,38,undefined);
        // vértices em ordem: 10,20,(42)
        const vx=[], bulge=[];
        for(const [c,v] of r.g){
          if(c===10){ vx.push([parseFloat(v),0,elev]); bulge.push(0); }
          else if(c===20 && vx.length) vx[vx.length-1][1]=parseFloat(v);
          else if(c===42 && vx.length) bulge[vx.length-1]=parseFloat(v);
        }
        if(vx.length>1){
          const out=[vx[0].slice()];
          for(let k=0;k<vx.length-1;k++){
            if(bulge[k]) dxfBulgeArc(vx[k],vx[k+1],bulge[k],out); else out.push(vx[k+1].slice());
          }
          if(closed && bulge[vx.length-1]) dxfBulgeArc(vx[vx.length-1],vx[0],bulge[vx.length-1],out);
          (closed?pols:lins).push({v:out, lay, cor, closed});
        }
        break; }
      case 'POLYLINE': {
        const flags=G(r,70,0);
        openPoly={v:[], lay, cor, closed:!!(flags&1), mesh:!!(flags&16)||!!(flags&64)};
        break; }
      case 'VERTEX':
        if(openPoly){
          const f=G(r,70,0);
          if(f&128 && !(f&64)){ /* registro de face do polyface */ openPoly.mesh=true; }
          else openPoly.v.push([G(r,10,0),G(r,20,0),G(r,30,undefined)]);
        }
        break;
      case 'SEQEND': closePoly(); break;
      case '3DFACE': {
        const f=[[G(r,10,0),G(r,20,0),G(r,30,0)],[G(r,11,0),G(r,21,0),G(r,31,0)],
                 [G(r,12,0),G(r,22,0),G(r,32,0)]];
        const p4=[G(r,13,undefined),G(r,23,undefined),G(r,33,undefined)];
        if(p4[0]!==undefined && (Math.abs(p4[0]-f[2][0])>1e-9||Math.abs(p4[1]-f[2][1])>1e-9)) f.push(p4);
        /* 3DFACE é triângulo/quadrilátero de uma MALHA, não uma polilinha
           fechada. Misturá-lo aos contornos fazia o modal anunciar milhares
           de “polilinhas fechadas” e desenhava a triangulação por cima das
           poucas cristas/pés úteis da DCE. */
        faces.push({v:f, lay, cor, closed:true,kind:'3dface'}); break; }
      case 'CIRCLE': {
        const x=G(r,10,0),y=G(r,20,0),z=G(r,30,undefined),R=G(r,40,0);
        if(R>0){ const out=[];
          for(let k=0;k<=48;k++){const a=2*Math.PI*k/48; out.push([x+R*Math.cos(a),y+R*Math.sin(a),z]);}
          pols.push({v:out, lay, cor, closed:true}); }
        break; }
      case 'ARC': {
        const x=G(r,10,0),y=G(r,20,0),z=G(r,30,undefined),R=G(r,40,0);
        let a0=G(r,50,0)*Math.PI/180, a1=G(r,51,0)*Math.PI/180;
        while(a1<=a0) a1+=2*Math.PI;
        if(R>0){ const steps=Math.max(2,Math.ceil((a1-a0)/(Math.PI/24))), out=[];
          for(let k=0;k<=steps;k++){const a=a0+(a1-a0)*k/steps;
            out.push([x+R*Math.cos(a),y+R*Math.sin(a),z]);}
          lins.push({v:out, lay, cor, closed:false}); }
        break; }
      case 'TEXT': case 'MTEXT':
        txts.push({p:[G(r,10,0),G(r,20,0),G(r,30,undefined)],
          t:(r.g.filter(p=>p[0]===1||p[0]===3).map(p=>p[1]).join('')||'').replace(/\\P/g,' ').trim(),
          lay, cor}); break;
      case 'INSERT': warn.insert++; break;
      default: warn.outros[r.T]=(warn.outros[r.T]||0)+1;
    }
  }
  closePoly();
  return {pts,lins,pols,faces,txts,warn};
}
const DXF_MAX_FACES=60000;    // guarda: malha gigante trava o app vetorial
/* Pergunta como tratar as polilinhas do DXF. No CAD a distinção entre linha e
   polígono é frouxa (uma polilinha "fechada" pode ser um contorno de área ou
   uma curva de nível que fecha), então quem decide é quem conhece o desenho.
   O Z é sempre preservado, em qualquer escolha.                            */
function askDXFModal(nLin, nPol, nFaces=0, nome='', restantes=0){
  return new Promise(res=>{
    /* rede de segurança: se um fantasma de uma leitura anterior tiver ficado
       na tela, ele sai agora — assim o problema nunca se acumula */
    document.querySelectorAll('[data-modal-arquivo]').forEach(x=>x.remove());
    const bg=document.createElement('div');
    bg.className='modal-bg on';
    bg.dataset.modalArquivo='1';
    bg.style.cssText='position:fixed;inset:0;background:#0d1117d9;z-index:4000;display:flex;align-items:center;justify-content:center;padding:18px';
    const linha=n=>n.toLocaleString('pt-BR');
    bg.innerHTML=`<div role="dialog" aria-modal="true" aria-label="Opções de importação DXF" style="background:var(--panel,#151b26);border:1px solid var(--line,#2a3446);border-radius:14px;max-width:440px;width:100%;padding:16px 16px 12px;font-size:13.5px;color:var(--ink,#dde3ee)">
      <div style="font-weight:700;font-size:14.5px;margin-bottom:6px">Como importar as polilinhas?</div>
      ${nome?`<div style="font-weight:650;color:var(--ink,#dde3ee);overflow-wrap:anywhere;margin-bottom:7px">Arquivo: ${esc(nome)}.dxf</div>`:''}
      <div style="color:var(--ink-dim,#93a0b4);margin-bottom:10px">O desenho tem
        <b>${linha(nLin)}</b> polilinha(s) aberta(s) e <b>${linha(nPol)}</b> fechada(s).
        A cota (Z) é preservada em qualquer opção.</div>
      <button type="button" data-a="linha" style="width:100%;margin:4px 0;padding:11px;border-radius:10px;border:1px solid var(--line,#2a3446);background:var(--amber,#f5a524);color:#1a1206;font-weight:700;cursor:pointer">📈 Tudo como LINHAS</button>
      <div style="color:var(--ink-dim,#93a0b4);font-size:11.5px;margin:-2px 0 8px 2px">curvas de nível, cristas, pés, acessos</div>
      <button type="button" data-a="poligono" style="width:100%;margin:4px 0;padding:11px;border-radius:10px;border:1px solid var(--line,#2a3446);background:none;color:var(--ink,#dde3ee);cursor:pointer">▢ Tudo como POLÍGONOS</button>
      <div style="color:var(--ink-dim,#93a0b4);font-size:11.5px;margin:-2px 0 8px 2px">áreas, poligonais, limites — fecha as abertas</div>
      <button type="button" data-a="auto" style="width:100%;margin:4px 0;padding:10px;border-radius:10px;border:1px solid var(--line,#2a3446);background:none;color:var(--ink-dim,#93a0b4);cursor:pointer">Separar: fechadas → polígonos, abertas → linhas</button>
      ${nFaces?`<label style="display:flex;gap:9px;align-items:flex-start;margin:12px 1px 5px;padding:10px;border:1px solid var(--line,#2a3446);border-radius:10px;cursor:pointer">
        <input type="checkbox" data-faces style="margin-top:2px">
        <span><b>Importar também ${linha(nFaces)} faces 3D da malha</b><br>
        <small style="color:var(--ink-dim,#93a0b4)">Deixe desmarcado para trazer somente cristas, pés, curvas e limites. Ative apenas quando precisar da triangulação/superfície.</small></span>
      </label>`:''}
      ${restantes>0?`<label style="display:flex;gap:9px;align-items:center;margin:10px 1px 3px;cursor:pointer">
        <input type="checkbox" data-todos checked>
        <span>Aplicar esta escolha aos outros ${linha(restantes)} DXF(s) selecionados</span>
      </label>`:''}
      <div style="color:var(--ink-dim,#93a0b4);font-size:11px;margin-top:9px">O DXF não informa o CRS. As coordenadas serão interpretadas no CRS de trabalho: <b>${esc(CRS_LABELS[S.workCRS]||S.workCRS)}</b>.</div>
    </div>`;
    document.body.appendChild(bg);
    let finalizado=false;
    const finaliza=e=>{
      const b=e.target&&e.target.closest&&e.target.closest('button[data-a]');
      if(!b||finalizado)return;
      finalizado=true;e.preventDefault();e.stopPropagation();
      const resposta={modo:b.dataset.a,
        faces:!!bg.querySelector('[data-faces]')?.checked,
        aplicarTodos:!!bg.querySelector('[data-todos]')?.checked};
      /* Oculta e remove TODOS os modais de arquivo antes de retomar a leitura.
         Isto também elimina uma cópia visual mantida pelo compositor durante
         arquivos grandes. O pequeno macrotask dá ao navegador um quadro livre
         para apresentar o mapa e a mensagem de progresso. */
      document.querySelectorAll('[data-modal-arquivo]').forEach(x=>{
        x.classList.remove('on');x.setAttribute('aria-hidden','true');
        x.style.setProperty('display','none','important');x.remove();
      });
      setTimeout(()=>res(resposta),40);
    };
    bg.addEventListener('click',finaliza);
  });
}

async function importDXF(text, name, lote=null){
  const r=parseDXF(text);
  if(r.faces.length>DXF_MAX_FACES){
    toast(`⚠ "${name}": ${r.faces.length.toLocaleString('pt-BR')} faces 3D — grande demais para o modo vetorial. `+
      'Para malhas de wireframe, o caminho é rasterizar para superfície (.asc/GeoTIFF).');
    return 0;
  }
  const mk=(arr, gtype, sufixo, toGeom, opt={})=>{
    if(!arr.length) return 0;
    const feats=arr.map((e,i)=>toGeom(e,i));
    const fields=[{name:'FID',type:'N',length:9,decimal:0},
      {name:'CAMADA',type:'C',length:32,decimal:0},{name:'COR',type:'N',length:5,decimal:0}];
    if(gtype==='point' && arr[0].t!==undefined) fields.push({name:'TEXTO',type:'C',length:120,decimal:0});
    const L=addLayer({name:`${name} — ${sufixo}`, gtype, crs:S.workCRS, features:feats, fields});
    if(opt.faces && L){
      L._dxf3dFaces=true;
      L.color='#697386'; L.weight=.65; L.fill=.035;
      L.sym={type:'single',color:'#697386',fill:'#697386',weight:.65,opacity:1,fillOpacity:.035};
      if(typeof drawLayer==='function') drawLayer(L);
    }
    return arr.length;
  };
  let tot=0;
  tot+=mk(r.pts,'point','pontos',(e,i)=>{
    const f={geom:[[e.p[0],e.p[1]]], props:{FID:i, CAMADA:e.lay, COR:e.cor??null}};
    if(e.p[2]!==undefined && isFinite(e.p[2])) f.zg=[e.p[2]];
    return f; });
  tot+=mk(r.txts,'point','textos',(e,i)=>{
    const f={geom:[[e.p[0],e.p[1]]], props:{FID:i, CAMADA:e.lay, COR:e.cor??null, TEXTO:e.t}};
    if(e.p[2]!==undefined && isFinite(e.p[2])) f.zg=[e.p[2]];
    return f; });
  const lineGeom=(e,i)=>{
    /* No DXF a polilinha fechada NÃO repete o primeiro ponto: o fechamento vem
       do flag 70. Ao trazer como LINHA era preciso devolver esse segmento à
       mão, senão o contorno chega com um vão entre o último e o primeiro
       vértice — visível no mapa e errado em qualquer perímetro medido. Vale
       para LWPOLYLINE/POLYLINE fechada, CIRCLE e 3DFACE, que também chegam
       marcados como fechados. */
    let v=e.v;
    if(e.closed && v.length>1){
      const a=v[0], z=v[v.length-1];
      if(Math.abs(a[0]-z[0])>1e-9 || Math.abs(a[1]-z[1])>1e-9) v=v.concat([a.slice()]);
    }
    const f={geom:v.map(p=>[p[0],p[1]]), multi:true, props:{FID:i, CAMADA:e.lay, COR:e.cor??null}};
    if(v.some(p=>p[2]!==undefined && isFinite(p[2])))
      f.zg=v.map(p=>(p[2]!==undefined&&isFinite(p[2]))?p[2]:NaN);
    return f; };
  const polGeom=(e,i)=>{
    const ring=e.v.slice();
    const a=ring[0], b=ring[ring.length-1];
    if(Math.abs(a[0]-b[0])>1e-9||Math.abs(a[1]-b[1])>1e-9) ring.push(a.slice());
    const f={geom:[ring.map(p=>[p[0],p[1]])], multi:true, props:{FID:i, CAMADA:e.lay, COR:e.cor??null}};
    if(ring.some(p=>p[2]!==undefined && isFinite(p[2])))
      f.zg=[ring.map(p=>(p[2]!==undefined&&isFinite(p[2]))?p[2]:NaN)];
    return f; };

  // pergunta como tratar as polilinhas (só quando há alguma)
  let modo='auto', importarFaces=false;
  if(r.lins.length || r.pols.length || r.faces.length){
    try{
      const previa=lote&&lote.escolha;
      const restantes=lote?Math.max(0,(lote.total||0)-(lote.processados||0)-1):0;
      const escolha=previa||await askDXFModal(
        r.lins.length,r.pols.length,r.faces.length,name,restantes);
      if(typeof escolha==='string') modo=escolha;
      else {
        modo=escolha?.modo||'auto'; importarFaces=!!escolha?.faces;
        if(lote&&escolha?.aplicarTodos)
          lote.escolha={modo,faces:importarFaces,aplicarTodos:true};
      }
    }catch(e){ modo='auto'; importarFaces=false; }
  }
  if(lote)lote.processados=(lote.processados||0)+1;
  showLoad(`DXF "${name}": importando…`);
  await new Promise(res=>setTimeout(res,0));
  /* Com desenho grande a montagem das camadas leva segundos; sem status a tela
     fica parada e parece travada. O respiro também deixa o quadro sem o modal
     ser apresentado antes de a thread principal ser tomada. */
  const nPoli=r.lins.length+r.pols.length+(importarFaces?r.faces.length:0);
  if(nPoli>500){ showLoad(`DXF: montando ${nPoli.toLocaleString('pt-BR')} entidades…`);
                 await new Promise(res=>setTimeout(res,0)); }
  if(modo==='linha'){
    tot+=mk(r.lins.concat(r.pols),'line','linhas',lineGeom);
  } else if(modo==='poligono'){
    tot+=mk(r.lins.concat(r.pols),'polygon','polígonos',polGeom);
  } else {
    tot+=mk(r.lins,'line','linhas',lineGeom);
    if(r.pols.length>500){ showLoad(`DXF: montando ${r.pols.length.toLocaleString('pt-BR')} polígonos…`);
                           await new Promise(res=>setTimeout(res,0)); }
    tot+=mk(r.pols,'polygon','polígonos',polGeom);
  }
  if(importarFaces){
    if(r.faces.length>500){ showLoad(`DXF: montando ${r.faces.length.toLocaleString('pt-BR')} faces 3D…`);
                            await new Promise(res=>setTimeout(res,0)); }
    tot+=mk(r.faces,'polygon','malha 3D (faces)',polGeom,{faces:true});
  }
  if(nPoli>500){ showLoad('DXF: desenhando…'); await new Promise(res=>setTimeout(res,0)); }
  const avisos=[];
  if(r.warn.insert) avisos.push(`${r.warn.insert} bloco(s) INSERT ignorados`);
  if(r.warn.mesh) avisos.push(`${r.warn.mesh} malha(s) polyface ignoradas`);
  if(r.faces.length && !importarFaces) avisos.push(`${r.faces.length.toLocaleString('pt-BR')} faces 3D não importadas`);
  const outros=Object.entries(r.warn.outros).map(([k,v])=>`${k}×${v}`).join(', ');
  const com3D=(r.lins.concat(r.pols,importarFaces?r.faces:[])).filter(e=>e.v && e.v.some(p=>p[2]!==undefined&&isFinite(p[2]))).length;
  toast(`DXF "${name}": ${tot.toLocaleString('pt-BR')} entidades no CRS de trabalho (${CRS_LABELS[S.workCRS]||S.workCRS})`+
    (com3D? ` · ${com3D.toLocaleString('pt-BR')} com Z (3D)`:'')+
    (avisos.length? ' · '+avisos.join(' · '):''));
  if(outros) console.info('DXF entidades não suportadas:', outros);
  refreshUI(); if(typeof fitAll==='function') fitAll();
  if(nPoli>500) hideLoad();
  return tot;
}
/* DXF binário e DWG: detecção honesta */
function sniffCadBinary(bytes){
  const head=new TextDecoder('latin1').decode(bytes.slice(0,32));
  if(head.startsWith('AutoCAD Binary DXF')) return 'dxfbin';
  if(/^AC10\d\d/.test(head)) return 'dwg';
  return null;
}

/* ---------- KML/KMZ (reescrito: multi-tipo + altitude) ---------- */
function importKML(text, name){
  const doc=new DOMParser().parseFromString(text,'text/xml');
  if(doc.querySelector('parsererror')){ toast('⚠ KML inválido'); return; }
  const P=[], L=[], PG=[];
  const coords=el=>el.textContent.trim().split(/\s+/).map(t=>{
    const c=t.split(',').map(Number); return [c[0],c[1],isFinite(c[2])?c[2]:undefined]; });

  /* ---- esquemas declarados (<Schema>): nome do campo -> tipo do OGC ---- */
  const schemas={};                       // id/nome do schema -> [{name,type}]
  const tipoOGC=t=>{ t=(t||'').toLowerCase();
    if(/int|long|short|byte/.test(t)) return {type:'N',length:12,decimal:0};
    if(/float|double|real|decimal/.test(t)) return {type:'N',length:19,decimal:6};
    if(/bool/.test(t)) return {type:'C',length:5,decimal:0};
    return {type:'C',length:120,decimal:0}; };
  doc.querySelectorAll('Schema').forEach(sc=>{
    const campos=[...sc.querySelectorAll('SimpleField')].map(sf=>
      ({name:sf.getAttribute('name')||'campo', ogc:sf.getAttribute('type')||'string'}));
    const id=sc.getAttribute('id'), nm=sc.getAttribute('name');
    if(id) schemas['#'+id]=campos; if(nm) schemas[nm]=campos;
  });

  /* ---- atributos de um Placemark: SchemaData/SimpleData ou Data/value ---- */
  const chaves=new Map();                 // nome do campo -> tipo OGC (preserva ordem)
  const lerProps=pm=>{
    const props={};
    // formato QGIS/ArcGIS: <ExtendedData><SchemaData><SimpleData name="X">v
    pm.querySelectorAll('SchemaData').forEach(sd=>{
      const ref=sd.getAttribute('schemaUrl'); const esq=ref&&schemas[ref];
      sd.querySelectorAll('SimpleData').forEach(el=>{
        const k=el.getAttribute('name'); if(!k) return;
        props[k]=el.textContent;
        if(!chaves.has(k)){ const dec=esq&&esq.find(c=>c.name===k);
          chaves.set(k, dec? dec.ogc : 'string'); }
      });
    });
    // formato Google Earth: <ExtendedData><Data name="X"><value>v
    pm.querySelectorAll('ExtendedData > Data').forEach(d=>{
      const k=d.getAttribute('name'); if(!k) return;
      const v=(d.querySelector('value')||d).textContent;
      props[k]=v; if(!chaves.has(k)) chaves.set(k,'string');
    });
    return props;
  };
  const short=s=>(s||'').replace(/\s+/g,' ').trim().slice(0,200);

  doc.querySelectorAll('Placemark').forEach(pm=>{
    const nm=(pm.querySelector(':scope > name')||pm.querySelector('name'))?.textContent||'';
    const ds=short(pm.querySelector(':scope > description')?.textContent||'');
    const props=lerProps(pm);
    // geometrias, inclusive dentro de <MultiGeometry> (sem duplicar)
    pm.querySelectorAll('Point > coordinates').forEach(c=>coords(c).forEach(p=>P.push({p,nm,ds,props})));
    pm.querySelectorAll('LineString > coordinates').forEach(c=>L.push({v:coords(c),nm,ds,props}));
    pm.querySelectorAll('Polygon').forEach(pg=>{
      // outer primeiro, depois os furos — cada <coordinates> é um anel
      const outer=[...pg.querySelectorAll('outerBoundaryIs coordinates')].map(coords);
      const inner=[...pg.querySelectorAll('innerBoundaryIs coordinates')].map(coords);
      const rings=(outer.length?outer:[...pg.querySelectorAll('coordinates')].map(coords)).concat(inner);
      if(rings.length) PG.push({rings,nm,ds,props});
    });
  });

  // campos: name + descr + os do esquema/atributos (ordem de aparição)
  const extra=[...chaves.entries()].map(([k,ogc])=>Object.assign({name:k}, tipoOGC(ogc)));
  const fields=[{name:'name',type:'C',length:80,decimal:0},
                {name:'descr',type:'C',length:200,decimal:0}, ...extra];
  const conv=(props)=>{ const o={}; extra.forEach(fd=>{ let v=props[fd.name];
    if(v===undefined){ o[fd.name]=null; return; }
    if(fd.type==='N'){ const n=parseFloat(String(v).replace(',','.')); o[fd.name]=isFinite(n)?n:null; }
    else o[fd.name]=v; }); return o; };
  const zOf=arr=>arr.some(p=>p[2]!==undefined)? arr.map(p=>p[2]??NaN) : null;
  let tot=0;
  if(P.length){ addLayer({name:name+' — pontos', gtype:'point', crs:'EPSG:4326',
    features:P.map(e=>{const f={geom:[[e.p[0],e.p[1]]],props:Object.assign({name:e.nm,descr:e.ds},conv(e.props))};
      if(e.p[2]!==undefined)f.zg=[e.p[2]]; return f;}), fields}); tot+=P.length; }
  if(L.length){ addLayer({name:name+' — linhas', gtype:'line', crs:'EPSG:4326',
    features:L.map(e=>{const f={geom:e.v.map(p=>[p[0],p[1]]),multi:true,props:Object.assign({name:e.nm,descr:e.ds},conv(e.props))};
      const z=zOf(e.v); if(z)f.zg=z; return f;}), fields}); tot+=L.length; }
  if(PG.length){ addLayer({name:name+' — polígonos', gtype:'polygon', crs:'EPSG:4326',
    features:PG.map(e=>{const f={geom:e.rings.map(r=>r.map(p=>[p[0],p[1]])),multi:true,props:Object.assign({name:e.nm,descr:e.ds},conv(e.props))};
      const zg=e.rings.map(zOf); if(zg.some(v=>v))f.zg=zg.map(v=>v||[]); return f;}), fields}); tot+=PG.length; }
  if(!tot){ toast('KML sem geometrias reconhecidas'); return; }
  const nAtr=extra.length;
  toast(`KML "${name}": ${tot} feição(ões)`+(nAtr?` · ${nAtr} atributo(s): ${extra.slice(0,5).map(f=>f.name).join(', ')}${nAtr>5?'…':''}`:' · sem atributos'));
  refreshUI(); if(typeof fitAll==='function') fitAll();
}
async function importKMZ(arrayBuf, name){
  const zip=await JSZip.loadAsync(arrayBuf);
  const p=Object.keys(zip.files).find(f=>/\.kml$/i.test(f));
  if(!p){ toast('⚠ KMZ sem .kml interno'); return; }
  importKML(await zip.files[p].async('string'), name);
}

/* ---------- GPX ---------- */
function importGPX(text, name){
  const doc=new DOMParser().parseFromString(text,'text/xml');
  if(doc.querySelector('parsererror')){ toast('⚠ GPX inválido'); return; }
  const wpts=[...doc.querySelectorAll('wpt')].map(w=>({
    p:[+w.getAttribute('lon'), +w.getAttribute('lat'),
       w.querySelector('ele')? +w.querySelector('ele').textContent : undefined],
    nm:w.querySelector('name')?.textContent||''}));
  const trks=[];
  doc.querySelectorAll('trk').forEach(t=>{
    const nm=t.querySelector('name')?.textContent||'';
    t.querySelectorAll('trkseg').forEach(seg=>{
      const v=[...seg.querySelectorAll('trkpt')].map(p=>[
        +p.getAttribute('lon'), +p.getAttribute('lat'),
        p.querySelector('ele')? +p.querySelector('ele').textContent : undefined]);
      if(v.length>1) trks.push({v,nm});
    });
  });
  doc.querySelectorAll('rte').forEach(t=>{
    const nm=t.querySelector('name')?.textContent||'';
    const v=[...t.querySelectorAll('rtept')].map(p=>[
      +p.getAttribute('lon'), +p.getAttribute('lat'),
      p.querySelector('ele')? +p.querySelector('ele').textContent : undefined]);
    if(v.length>1) trks.push({v,nm});
  });
  const fields=[{name:'name',type:'C',length:80,decimal:0}];
  let tot=0;
  if(wpts.length){ addLayer({name:name+' — waypoints', gtype:'point', crs:'EPSG:4326',
    features:wpts.map(e=>{const f={geom:[[e.p[0],e.p[1]]],props:{name:e.nm}};
      if(e.p[2]!==undefined)f.zg=[e.p[2]]; return f;}), fields}); tot+=wpts.length; }
  if(trks.length){ addLayer({name:name+' — trilhas', gtype:'line', crs:'EPSG:4326',
    features:trks.map(e=>{const f={geom:e.v.map(p=>[p[0],p[1]]),multi:true,props:{name:e.nm}};
      if(e.v.some(p=>p[2]!==undefined))f.zg=e.v.map(p=>p[2]??NaN); return f;}), fields}); tot+=trks.length; }
  toast(tot? `GPX "${name}": ${wpts.length} waypoint(s), ${trks.length} trilha(s)` : 'GPX sem dados');
  refreshUI(); if(typeof fitAll==='function') fitAll();
}

/* ---------- CSV de pontos (cabeçalho com X/Y ou E/N ou LON/LAT + Z) ---------- */
function importCSVPoints(text, name){
  const rows=text.split(/\r\n|\n/).filter(r=>r.trim());
  if(rows.length<2){ toast('CSV vazio'); return; }
  const sep=(rows[0].match(/;/g)||[]).length>=(rows[0].match(/,/g)||[]).length? ';':',';
  const hd=rows[0].split(sep).map(h=>h.trim().toUpperCase());
  const fi=names=>hd.findIndex(h=>names.includes(h));
  let ix=fi(['X','E','ESTE','EASTING','LON','LONG','LONGITUDE']),
      iy=fi(['Y','N','NORTE','NORTHING','LAT','LATITUDE']),
      iz=fi(['Z','COTA','ELEV','ELEVACAO','ELEVAÇÃO','ALT','ELE']);
  if(ix<0||iy<0){ toast('⚠ CSV: cabeçalho precisa de colunas X/Y (ou E/N, LON/LAT)'); return; }
  const geo=['LON','LONG','LONGITUDE'].includes(hd[ix]);
  const dec=v=>parseFloat(String(v).trim().replace(',','.'));
  const feats=[]; const extras=hd.map((h,k)=>k).filter(k=>k!==ix&&k!==iy&&k!==iz);
  for(let r=1;r<rows.length;r++){
    const c=rows[r].split(sep);
    const x=dec(c[ix]), y=dec(c[iy]);
    if(!isFinite(x)||!isFinite(y)) continue;
    const props={FID:feats.length};
    extras.forEach(k=>props[hd[k].slice(0,10)||('C'+k)]=String(c[k]??'').trim());
    const f={geom:[[x,y]], props};
    if(iz>=0){ const z=dec(c[iz]); if(isFinite(z)) f.zg=[z]; }
    feats.push(f);
  }
  if(!feats.length){ toast('CSV sem linhas válidas'); return; }
  const fields=[{name:'FID',type:'N',length:9,decimal:0},
    ...extras.map(k=>({name:hd[k].slice(0,10)||('C'+k),type:'C',length:40,decimal:0}))];
  addLayer({name:name+' — pontos', gtype:'point', crs: geo?'EPSG:4326':S.workCRS, features:feats, fields});
  toast(`CSV "${name}": ${feats.length} ponto(s)`+(iz>=0?' com Z':'')+
    (geo?' (lon/lat)':` no CRS de trabalho`));
  refreshUI(); if(typeof fitAll==='function') fitAll();
}
