/* Suavização Chaikin por seleção/camada, com destino e interpolação Z/XY. */
(function(){
'use strict';
const clone=v=>v==null?v:structuredClone(v);
let context=null,busy=false,selection=null;
function selectionItems(q){
  if(q.explicit&&(q.layers.length!==1||q.layers.some(L=>!['line','polygon'].includes(L.gtype))))
    throw Error('Selecione feições de uma única camada de linhas ou polígonos para suavizar.');
  return GeoMineCommandSelection.uniqueItems(q);
}
function sameSelection(a,b){
  const x=selectionItems(a),y=selectionItems(b);
  const features=new Set(y.map(i=>i.f));
  return a.explicit===b.explicit&&x.length===y.length&&a.layers[0]===b.layers[0]&&x.every(i=>features.has(i.f));
}
function editable(L){
  if(!L||!S.layers.includes(L)||!['line','polygon'].includes(L.gtype))throw Error('Escolha uma camada de linhas ou polígonos.');
  if(L.locked)throw Error('A camada está bloqueada.');
  if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(L,false))throw Error('Sem permissão para editar esta camada.');
}
function smoothFeature(L,f,iterations){
  if(!Number.isInteger(iterations)||iterations<1||iterations>5)throw Error('Informe de 1 a 5 iterações inteiras.');
  if(proj4(S.workCRS).oProj.projName==='longlat')throw Error('Escolha um CRS de trabalho projetado para suavizar.');
  let before=0,after=0;
  const number=v=>{
    if(v==null||(typeof v==='string'&&!v.trim()))return null;
    const n=typeof v==='string'?Number(v.trim().replace(',','.')):v;
    return Number.isFinite(n)?n:null;
  };
  const mix=(a,b,t)=>Number.isFinite(a)&&Number.isFinite(b)?a*(1-t)+b*t:null;
  function walk(g,z){
    if(!Array.isArray(g)||!g.length)throw Error('Geometria vazia ou inválida.');
    if(!Array.isArray(g[0])||typeof g[0][0]!=='number'){
      const flatZ=g.length===1&&(Array.isArray(z)||ArrayBuffer.isView(z))&&z.length===g[0].length&&!Array.isArray(z[0]);
      const parts=g.map((p,i)=>walk(p,flatZ?z:Array.isArray(z)?z[i]:z));
      return {geom:parts.map(p=>p.geom),zg:parts.map(p=>p.zg),hasZ:parts.some(p=>p.hasZ)};
    }
    if(g.length<2)throw Error('A linha precisa de pelo menos dois vértices.');
    let zs=Array.isArray(z)||ArrayBuffer.isView(z)?Array.from(z):null;
    if(zs?.length===1&&Array.isArray(zs[0]))zs=zs[0];
    if(zs&&zs.length!==g.length)throw Error('Cotas Z incompatíveis com os vértices; a geometria foi preservada.');
    const inline=g.some(p=>p.length>2),hasZ=z!=null||inline;
    const explicit=g.length>2&&edDist2(g[0],g.at(-1))===0,closed=L.gtype==='polygon'||explicit;
    if(closed&&new Set(g.map(p=>p[0]+','+p[1])).size<3)throw Error('Anel inválido: são necessários três vértices distintos.');
    before+=g.length;
    const count=(g.length-(explicit?1:0))*2**iterations+(explicit?1:0);
    after+=count;
    if(after>1000000)throw Error('Resultado acima de 1 milhão de vértices. Reduza as iterações ou escolha uma feição.');
    let current=g.slice(0,explicit?-1:undefined).map((p,i)=>{
      if(!Number.isFinite(p[0])||!Number.isFinite(p[1]))throw Error('Coordenada inválida.');
      const q=L.crs===S.workCRS?p.slice(0,2):reproj(L.crs,S.workCRS,p[0],p[1]);
      if(!q.every(Number.isFinite))throw Error('Não foi possível projetar a geometria.');
      return {xy:q,tail:p.slice(2).map(number),z:number(zs?zs[i]:z!=null?z:p[2]),original:p.slice()};
    });
    const blend=(a,b,t)=>({xy:[mix(a.xy[0],b.xy[0],t),mix(a.xy[1],b.xy[1],t)],
      tail:Array.from({length:Math.max(a.tail.length,b.tail.length)},(_,i)=>mix(a.tail[i],b.tail[i],t)),z:mix(a.z,b.z,t)});
    for(let n=0;n<iterations;n++){
      const next=closed?[]:[current[0]];
      for(let i=0;i<(closed?current.length:current.length-1);i++){
        const a=current[i],b=current[(i+1)%current.length];
        next.push(blend(a,b,.25),blend(a,b,.75));
      }
      if(!closed)next.push(current.at(-1));
      current=next;
    }
    if(explicit)current.push(current[0]);
    const geom=current.map(v=>{
      if(v.original)return v.original.slice();
      const xy=L.crs===S.workCRS?v.xy.slice():reproj(S.workCRS,L.crs,v.xy[0],v.xy[1]);
      if(!xy.every(Number.isFinite))throw Error('Não foi possível reprojetar o resultado.');
      const p=[...xy,...v.tail];if(inline)p[2]=v.z;return p;
    });
    return {geom,hasZ,zg:hasZ?current.map(v=>v.z):undefined};
  }
  const result=walk(f.geom,f.zg),out=clone(f);out.geom=result.geom;
  if(result.hasZ)out.zg=result.zg;
  return {feature:out,before,after};
}
function sync(initial=false){
  const L=S.layers.find(l=>String(l.id)===document.getElementById('smoothLayer').value);
  const items=selectionItems(selection).filter(i=>i.L===L),scope=document.getElementById('smoothScope'),option=scope.querySelector('[value="feature"]');
  option.disabled=!items.length;
  option.textContent=items.length>1?'Somente as '+items.length+' feições selecionadas':'Somente a feição selecionada';
  if(initial)scope.value=items.length?'feature':'layer';
  else if(scope.value==='feature'&&!items.length)scope.value='';
  context={project:S.projectId,L,selection,items};
  if(L)GeoMineVectorDestination.mount(document.getElementById('smoothDestHost'),'smoothDest',L,L.gtype,true);
  document.getElementById('smoothInfo').textContent=L?`${L.features.length.toLocaleString('pt-BR')} feições na camada${items.length?' · '+items.length+' selecionada(s)':' · nenhuma feição selecionada nesta camada'}`:'';
}
function open(){
  if(busy)return;
  try{selection=GeoMineCommandSelection.capture({stamp:false});selectionItems(selection);}catch(e){toast(e.message);return;}
  const layers=S.layers.filter(l=>['line','polygon'].includes(l.gtype));
  if(!layers.length){toast('Selecione ou importe uma camada de linhas ou polígonos.');return;}
  let bg=document.getElementById('smoothModal');
  if(!bg){
    bg=document.createElement('div');bg.id='smoothModal';bg.className='modal-bg';
    bg.innerHTML=`<div class="modal" style="width:min(520px,95vw);max-height:90dvh">
      <div class="modal-h"><b>Suavizar geometria</b><div style="flex:1"></div><button class="tbtn" id="smoothClose">Fechar</button></div>
      <div class="modal-b" style="overflow:auto">
        <label class="field" for="smoothLayer">Camada</label><select id="smoothLayer"></select>
        <div class="hint" id="smoothInfo"></div>
        <label class="field" for="smoothScope">Aplicar em</label><select id="smoothScope">
          <option value="" disabled>Escolha o escopo</option>
          <option value="feature">Somente a feição selecionada</option>
          <option value="layer">Camada inteira</option></select>
        <div id="smoothDestHost" style="margin-top:8px"></div>
        <label class="field" for="smoothIterations">Iterações (1 a 5)</label><input id="smoothIterations" type="number" min="1" max="5" step="1">
        <div class="hint">Na camada inteira, inclui todas as feições, mesmo filtradas. No destino igual à origem, atualiza as feições; em outro destino, acrescenta os resultados. Ctrl+Z desfaz a operação inteira. Mantém atributos e interpola as cotas Z. Mais iterações arredondam e aumentam os vértices. Não use em cristas, pés ou limites que precisam permanecer angulosos. Limites compartilhados não são ajustados em conjunto.</div>
        <div class="hint" id="smoothResult" role="status"></div>
        <button class="tbtn" id="smoothApply" style="width:100%;justify-content:center;margin-top:12px;background:var(--amber);color:#1a1206">Suavizar</button>
      </div></div>`;
    document.body.appendChild(bg);
    document.getElementById('smoothClose').onclick=()=>{if(!busy)bg.classList.remove('on');};
    document.getElementById('smoothLayer').onchange=()=>sync();
    document.getElementById('smoothApply').onclick=apply;
  }
  const picker=document.getElementById('smoothLayer');picker.replaceChildren();
  layers.forEach(L=>{const option=document.createElement('option');option.value=L.id;option.textContent=L.name;picker.append(option);});
  const L=selection.layers[0]||(layers.includes(activeLayer())?activeLayer():layers[0]);
  picker.value=String(L.id);sync(true);
  document.getElementById('smoothIterations').value=edParam('edPiter',2);
  document.getElementById('smoothResult').textContent='';bg.classList.add('on');
}
async function apply(){
  if(busy||!context)return;
  const {project,L,selection:opened,items}=context,scope=document.getElementById('smoothScope').value,
    value=document.getElementById('smoothIterations').value.trim(),tol=Number(value.replace(',','.')),
    result=document.getElementById('smoothResult');
  const controls=['smoothApply','smoothClose','smoothLayer','smoothScope','smoothIterations','smoothDest'].map(id=>document.getElementById(id));
  try{
    GeoMineCommandSelection.assertCurrent(opened);
    const current=GeoMineCommandSelection.capture();
    editable(L);
    const destination=GeoMineVectorDestination.capture(document.getElementById('smoothDest').value,L,L.gtype,true);
    if(S.projectId!==project)throw Error('O projeto mudou. Reabra Suavizar.');
    if(!value||!Number.isInteger(tol)||tol<1||tol>5)throw Error('Informe de 1 a 5 iterações inteiras.');
    if(!['feature','layer'].includes(scope))throw Error('Escolha se deseja aplicar nas feições selecionadas ou na camada inteira.');
    if(scope==='feature'&&(!items.length||!sameSelection(opened,current)))throw Error('A seleção mudou. Reabra Suavizar para usar as feições atuais.');
    const targets=scope==='feature'?items.map(i=>i.f):L.features.slice(),rev=L._rev;
    if(!targets.length)throw Error('A camada não tem feições.');
    busy=true;controls.forEach(c=>c.disabled=true);
    const outputs=[];let before=0,after=0;
    for(let i=0;i<targets.length;i++){
      const q=smoothFeature(L,targets[i],tol);outputs.push(q.feature);before+=q.before;after+=q.after;
      if(after>1000000)throw Error('Resultado acima de 1 milhão de vértices. Reduza as iterações ou escolha uma feição.');
      if(i%32===0){result.textContent=`Preparando ${i+1}/${targets.length} feições…`;await new Promise(r=>setTimeout(r,0));}
    }
    editable(L);
    GeoMineCommandSelection.assertCurrent(opened);GeoMineCommandSelection.assertCurrent(current);
    if(S.projectId!==project||L._rev!==rev||targets.some(t=>!L.features.includes(t)))throw Error('A camada mudou durante a operação. Reabra Suavizar.');
    if(destination.replace)for(const output of outputs){
      if(L._autoCota&&typeof hFeicCotaUma==='function'){try{const G=hFeicGrade();if(G)hFeicCotaUma(L,output,G);}catch(e){}}
      if(typeof edEhDrenagem==='function'&&edEhDrenagem(L))edRecalcGeom(L,output);
    }
    GeoMineVectorDestination.save(destination,{features:outputs,fields:clone(L.fields||[]),crs:L.crs,name:L.name+' — suavizada '+tol+'×',targets});
    const p=document.getElementById('edPiter');if(p)p.value=tol;
    const message=`Suavização: ${targets.length} feição(ões) · ${before.toLocaleString('pt-BR')} → ${after.toLocaleString('pt-BR')} vértices`;
    toast(message);cmdLog(message,'info');document.getElementById('smoothModal').classList.remove('on');
  }catch(e){result.textContent=e.message;toast(e.message);}
  finally{busy=false;controls.forEach(c=>c.disabled=false);if(context?.L)document.querySelector('#smoothScope [value="feature"]').disabled=!context.items.length;}
}
window.GeoMineSmooth={open,apply,smoothFeature};
})();
