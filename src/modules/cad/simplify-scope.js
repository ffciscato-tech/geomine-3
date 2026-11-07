/* Simplificação: seleção explícita, metros, destino e Z por índice. */
(function(){
'use strict';
const clone=v=>v==null?v:structuredClone(v);
let context=null,busy=false,selection=null;
function selectionItems(q){
  if(q.explicit&&(q.layers.length!==1||q.layers.some(L=>!['line','polygon'].includes(L.gtype))))
    throw Error('Selecione feições de uma única camada de linhas ou polígonos para simplificar.');
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
function simplifyFeature(L,f,tolerance){
  const projection=proj4(S.workCRS).oProj;
  if(projection.projName==='longlat')throw Error('Escolha um CRS de trabalho projetado para informar a tolerância em metros.');
  const factor=projection.to_meter||1;
  let before=0,after=0,kept=0;
  function walk(g,z){
    if(!Array.isArray(g)||!g.length)throw Error('Geometria vazia ou inválida.');
    if(!Array.isArray(g[0])||typeof g[0][0]!=='number'){
      // Projetos antigos podem guardar um único anel aninhado com Z plano.
      const flatZ=g.length===1&&(Array.isArray(z)||ArrayBuffer.isView(z))&&z.length===g[0].length&&!Array.isArray(z[0]);
      const parts=g.map((p,i)=>walk(p,flatZ?z:Array.isArray(z)?z[i]:z));
      return {geom:parts.map(p=>p.geom),zg:parts.map(p=>p.zg),hasZ:parts.some(p=>p.hasZ)};
    }
    before+=g.length;
    const metric=g.map((p,i)=>{
      if(!Number.isFinite(p[0])||!Number.isFinite(p[1]))throw Error('Coordenada inválida.');
      const q=reproj(L.crs,S.workCRS,p[0],p[1]);
      if(!q.every(Number.isFinite))throw Error('Não foi possível projetar a geometria.');
      return [q[0]*factor,q[1]*factor,i];
    });
    const closed=L.gtype==='polygon'||(g.length>2&&edDist2(g[0],g.at(-1))===0);
    const explicit=edDist2(g[0],g.at(-1))===0;
    const input=closed&&!explicit?metric.concat([metric[0]]):metric;
    let ids=tolerance===0?g.map((_,i)=>i):edSimplify(input,tolerance).map(p=>p[2]);
    if(closed&&!explicit&&ids.length>1&&ids.at(-1)===ids[0])ids.pop();
    const unique=new Set(ids.map(i=>g[i][0]+','+g[i][1]));
    // Não eliminar anéis, buracos nem linhas fechadas ao aumentar a tolerância.
    if(closed&&(unique.size<3||Math.abs(edArea(ids.map(i=>g[i])))<1e-12)){
      ids=g.map((_,i)=>i);kept++;
    }
    after+=ids.length;
    let zs=Array.isArray(z)||ArrayBuffer.isView(z)?Array.from(z):null;
    if(zs?.length===1&&Array.isArray(zs[0]))zs=zs[0];
    const hasZ=z!=null||g.some(p=>Number.isFinite(p[2]));
    if(zs&&zs.length!==g.length)throw Error('Cotas Z incompatíveis com os vértices; a geometria foi preservada.');
    return {geom:ids.map(i=>g[i].slice()),hasZ,
      zg:hasZ?ids.map(i=>zs?zs[i]:(typeof z==='number'?z:(Number.isFinite(g[i][2])?g[i][2]:null))):undefined};
  }
  const result=walk(f.geom,f.zg),out=clone(f);
  out.geom=result.geom;
  if(result.hasZ)out.zg=result.zg;
  return {feature:out,before,after,kept};
}
function sync(initial=false){
  const L=S.layers.find(l=>String(l.id)===document.getElementById('simplifyLayer').value);
  const items=selectionItems(selection).filter(i=>i.L===L),scope=document.getElementById('simplifyScope'),option=scope.querySelector('[value="feature"]');
  option.disabled=!items.length;
  option.textContent=items.length>1?'Somente as '+items.length+' feições selecionadas':'Somente a feição selecionada';
  if(initial)scope.value=items.length?'feature':'layer';
  else if(scope.value==='feature'&&!items.length)scope.value='';
  context={project:S.projectId,L,selection,items};
  if(L)GeoMineVectorDestination.mount(document.getElementById('simplifyDestHost'),'simplifyDest',L,L.gtype,true);
  document.getElementById('simplifyInfo').textContent=L?`${L.features.length.toLocaleString('pt-BR')} feições na camada${items.length?' · '+items.length+' selecionada(s)':' · nenhuma feição selecionada nesta camada'}`:'';
}
function open(){
  if(busy)return;
  try{selection=GeoMineCommandSelection.capture({stamp:false});selectionItems(selection);}catch(e){toast(e.message);return;}
  const layers=S.layers.filter(l=>['line','polygon'].includes(l.gtype));
  if(!layers.length){toast('Selecione ou importe uma camada de linhas ou polígonos.');return;}
  let bg=document.getElementById('simplifyModal');
  if(!bg){
    bg=document.createElement('div');bg.id='simplifyModal';bg.className='modal-bg';
    bg.innerHTML=`<div class="modal" style="width:min(520px,95vw);max-height:90dvh">
      <div class="modal-h"><b>Simplificar geometria</b><div style="flex:1"></div><button class="tbtn" id="simplifyClose">Fechar</button></div>
      <div class="modal-b" style="overflow:auto">
        <label class="field" for="simplifyLayer">Camada</label><select id="simplifyLayer"></select>
        <div class="hint" id="simplifyInfo"></div>
        <label class="field" for="simplifyScope">Aplicar em</label><select id="simplifyScope">
          <option value="" disabled>Escolha o escopo</option>
          <option value="feature">Somente a feição selecionada</option>
          <option value="layer">Camada inteira</option></select>
        <div id="simplifyDestHost" style="margin-top:8px"></div>
        <label class="field" for="simplifyTolerance">Tolerância (m)</label><input id="simplifyTolerance" type="number" min="0" step="0.1">
        <div class="hint">Na camada inteira, inclui todas as feições, mesmo filtradas. No destino igual à origem, atualiza as feições; em outro destino, acrescenta os resultados. Ctrl+Z desfaz a operação inteira. Mantém os atributos e as cotas dos vértices conservados. Limites compartilhados entre polígonos não são ajustados em conjunto.</div>
        <div class="hint" id="simplifyResult" role="status"></div>
        <button class="tbtn" id="simplifyApply" style="width:100%;justify-content:center;margin-top:12px;background:var(--amber);color:#1a1206">Simplificar</button>
      </div></div>`;
    document.body.appendChild(bg);
    document.getElementById('simplifyClose').onclick=()=>{if(!busy)bg.classList.remove('on');};
    document.getElementById('simplifyLayer').onchange=()=>sync();
    document.getElementById('simplifyApply').onclick=apply;
  }
  const picker=document.getElementById('simplifyLayer');picker.replaceChildren();
  layers.forEach(L=>{const option=document.createElement('option');option.value=L.id;option.textContent=L.name;picker.append(option);});
  const L=selection.layers[0]||(layers.includes(activeLayer())?activeLayer():layers[0]);
  picker.value=String(L.id);sync(true);
  document.getElementById('simplifyTolerance').value=edParam('edPtol',1);
  document.getElementById('simplifyResult').textContent='';bg.classList.add('on');
}
async function apply(){
  if(busy||!context)return;
  const {project,L,selection:opened,items}=context,scope=document.getElementById('simplifyScope').value,
    value=document.getElementById('simplifyTolerance').value.trim(),tol=Number(value.replace(',','.')),
    result=document.getElementById('simplifyResult');
  const controls=['simplifyApply','simplifyClose','simplifyLayer','simplifyScope','simplifyTolerance','simplifyDest'].map(id=>document.getElementById(id));
  try{
    GeoMineCommandSelection.assertCurrent(opened);
    const current=GeoMineCommandSelection.capture();
    editable(L);
    const destination=GeoMineVectorDestination.capture(document.getElementById('simplifyDest').value,L,L.gtype,true);
    if(S.projectId!==project)throw Error('O projeto mudou. Reabra Simplificar.');
    if(!value||!Number.isFinite(tol)||tol<0)throw Error('Informe uma tolerância válida, maior ou igual a zero.');
    if(!['feature','layer'].includes(scope))throw Error('Escolha se deseja aplicar nas feições selecionadas ou na camada inteira.');
    if(scope==='feature'&&(!items.length||!sameSelection(opened,current)))throw Error('A seleção mudou. Reabra Simplificar para usar as feições atuais.');
    const targets=scope==='feature'?items.map(i=>i.f):L.features.slice(),rev=L._rev;
    if(!targets.length)throw Error('A camada não tem feições.');
    busy=true;controls.forEach(c=>c.disabled=true);
    const outputs=[];let before=0,after=0,kept=0;
    for(let i=0;i<targets.length;i++){
      const q=simplifyFeature(L,targets[i],tol);outputs.push(q.feature);before+=q.before;after+=q.after;kept+=q.kept;
      if(i%32===0){result.textContent=`Preparando ${i+1}/${targets.length} feições…`;await new Promise(r=>setTimeout(r,0));}
    }
    editable(L);
    GeoMineCommandSelection.assertCurrent(opened);GeoMineCommandSelection.assertCurrent(current);
    if(S.projectId!==project||L._rev!==rev||targets.some(t=>!L.features.includes(t)))throw Error('A camada mudou durante a operação. Reabra Simplificar.');
    GeoMineVectorDestination.save(destination,{features:outputs,fields:clone(L.fields||[]),crs:L.crs,name:L.name+' — simplificada '+tol+' m',targets});
    const p=document.getElementById('edPtol');if(p)p.value=tol;
    const message=`Simplificação: ${targets.length} feição(ões) · ${before.toLocaleString('pt-BR')} → ${after.toLocaleString('pt-BR')} vértices${kept?' · '+kept+' anel(is) preservado(s) para evitar colapso':''}`;
    toast(message);cmdLog(message,'info');document.getElementById('simplifyModal').classList.remove('on');
  }catch(e){result.textContent=e.message;toast(e.message);}
  finally{busy=false;controls.forEach(c=>c.disabled=false);if(context?.L)document.querySelector('#simplifyScope [value="feature"]').disabled=!context.items.length;}
}
window.GeoMineSimplify={open,apply,simplifyFeature};
})();
