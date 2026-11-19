/* Live visual drape: keep authored XY/Z intact, sample the explicitly chosen
   terrain for each point rendered in 3D. Missing terrain never becomes Z=0. */
(function(root){
'use strict';
const $=id=>document.getElementById(id),clone=v=>JSON.parse(JSON.stringify(v));
const models=()=>S.rasters.filter(r=>root.GeoMineChannelDEM?.isElevation(r)&&r.d?.z&&!r._cnSlope);
function binding(L,f){const value=f&&Object.hasOwn(f,'_drapeMDT')?f._drapeMDT:L?._drapeMDT;return value?.enabled?value:null;}
function resolve(L,f){
 const b=binding(L,f);if(!b)return null;
 const r=S.rasters.find(r=>String(r.id)===String(b.rasterId));
 if(!r||!root.GeoMineChannelDEM?.isElevation(r))return {missing:true,binding:b};
 const d=r.d,crs=d.crs||d.srcCRS||r.crs||r.srcCRS||S.workCRS;
 let step=Math.min(d.cs,d.csy||d.cs);
 try{const a=proj4(crs,S.workCRS,[d.xll,d.yll]),p=proj4(crs,S.workCRS,[d.xll+d.cs,d.yll]),q=proj4(crs,S.workCRS,[d.xll,d.yll+(d.csy||d.cs)]);step=Math.min(Math.hypot(p[0]-a[0],p[1]-a[1]),Math.hypot(q[0]-a[0],q[1]-a[1]));}catch(_){return {missing:true,binding:b};}
 return {r,d,crs,step:Math.max(.05,step),binding:b};
}
function sample(source,x,y){
 if(!source||source.missing)return NaN;
 const {r,d,crs}=source;let p;
 try{p=crs===S.workCRS?[x,y]:proj4(S.workCRS,crs,[x,y]);}catch(_){return NaN;}
 const dx=d.cs,dy=d.csy||dx;
 if(!p.every(Number.isFinite)||p[0]<d.xll||p[0]>d.xll+d.nc*dx||p[1]<d.yll||p[1]>d.yll+d.nr*dy)return NaN;
 const clip=r._exactClipRings||d.clip||d.tin?.clip;
 if(clip?.length&&typeof cnBaciaContem==='function'&&!cnBaciaContem(...p,clip))return NaN;
 if(d.tin)return tinSampleZ(d.tin,p[0],p[1]);
 const cx=(p[0]-d.xll)/dx-.5,cy=d.nr-.5-(p[1]-d.yll)/dy,c=Math.floor(cx),row=Math.floor(cy),fx=cx-c,fy=cy-row;
 let result=0;
 for(const [dr,dc,w] of [[0,0,(1-fx)*(1-fy)],[0,1,fx*(1-fy)],[1,0,(1-fx)*fy],[1,1,fx*fy]]){
  if(w<=1e-12)continue;
  const rr=Math.max(0,Math.min(d.nr-1,row+dr)),cc=Math.max(0,Math.min(d.nc-1,c+dc)),z=d.z[rr*d.nc+cc];
  if(!Number.isFinite(z)||[r._nd,d._nd,d.noData,d.nodata].some(v=>v!=null&&Number.isFinite(Number(v))&&z===Number(v)))return NaN;
  result+=w*z;
 }return result;
}
function selected(){const sf=S.selFeat;return sf?.layer&&Number.isInteger(sf.idx)?{L:sf.layer,f:sf.layer.features?.[sf.idx]}:null;}
function apply(L,R,scope='layer',feature=null,enabled=true){
 if(!L||!['line','polygon'].includes(L.gtype)||!S.layers.includes(L))throw Error('Escolha uma camada de linhas ou polígonos.');
 if(enabled&&(!R||!models().includes(R)))throw Error('Escolha um MDT com cotas de terreno.');
 if(scope==='feature'&&(!feature||!L.features.includes(feature)))throw Error('Selecione a feição que receberá o drape.');
 const b=enabled?{version:1,enabled:true,rasterId:R.id,mode:'terrain-3d'}:{version:1,enabled:false};
 if(scope==='feature')feature._drapeMDT=b;
 else {L._drapeMDT=b;for(const f of L.features)delete f._drapeMDT;}
 if(enabled){L.visible=true;R.visible=true;S._v3SurfOn=S._v3SurfOn||{};S._v3SurfOn[String(R.id)]=true;if($('v3dVec'))$('v3dVec').checked=true;}
 root.GeoMineSessionAutosave?.markDirty('drape no MDT');refreshUI();refresh3DPanel();
 if(S._view==='v3d')v3Auto();
 return clone(b);
}
function ensure(){
 if($('vectorDrapeModal'))return;
 const box=document.createElement('div');box.id='vectorDrapeModal';box.className='modal-bg';
 box.innerHTML='<div class="modal" style="max-width:420px"><div class="modal-h"><b>Drapear no MDT · 3D</b><button type="button" class="mini" data-close>Fechar</button></div><div class="modal-b"><label class="field" for="drapeLayer">Linha / polígono</label><select id="drapeLayer"></select><label class="field" for="drapeScope">Aplicar em</label><select id="drapeScope"><option value="layer">Camada inteira</option><option value="feature">Feição selecionada</option></select><label class="field" for="drapeRaster">MDT</label><select id="drapeRaster"></select><div class="hint">Linhas e contornos de polígonos acompanham o MDT escolhido no 3D. A geometria e as cotas originais são preservadas. Trechos sem terreno não são desenhados.</div><div class="row2" style="margin-top:10px"><button type="button" class="tbtn" id="drapeApply">Aplicar e ver em 3D</button><button type="button" class="mini" id="drapeRemove">Remover drape</button></div><div class="hint" id="drapeStatus" role="status"></div></div></div>';
 document.body.append(box);box.querySelector('[data-close]').onclick=()=>box.classList.remove('on');
 $('drapeLayer').onchange=()=>{const sel=selected(),same=sel?.L&&String(sel.L.id)===$('drapeLayer').value&&!!sel.f;$('drapeScope').options[1].disabled=!same;if(!same)$('drapeScope').value='layer';};
 const run=enabled=>{try{const L=S.layers.find(L=>String(L.id)===$('drapeLayer').value),R=S.rasters.find(R=>String(R.id)===$('drapeRaster').value),scope=$('drapeScope').value,sel=selected();
  apply(L,R,scope,scope==='feature'&&sel?.L===L?sel.f:null,enabled);$('drapeStatus').textContent=enabled?'Drape aplicado.':'Drape removido.';
  if(enabled){box.classList.remove('on');switchView('v3d');}
 }catch(e){$('drapeStatus').textContent=e.message;}};
 $('drapeApply').onclick=()=>run(true);$('drapeRemove').onclick=()=>run(false);
}
function open(){
 ensure();const ls=S.layers.filter(L=>['line','polygon'].includes(L.gtype)),rs=models(),sel=selected();
 $('drapeLayer').replaceChildren(...(ls.length?ls.map(L=>new Option(L.name,String(L.id))):[new Option('Carregue linhas ou polígonos','')]));
 if(sel&&ls.includes(sel.L))$('drapeLayer').value=String(sel.L.id);else if(ls.some(L=>L.id===S.activeId))$('drapeLayer').value=String(S.activeId);
 $('drapeLayer').onchange();if(sel?.f&&String(sel.L.id)===$('drapeLayer').value)$('drapeScope').value='feature';
 $('drapeRaster').replaceChildren(...(rs.length?rs.map(R=>new Option(R.name,String(R.id))):[new Option('Carregue um MDT','')]));
 const L=ls.find(L=>String(L.id)===$('drapeLayer').value),b=binding(L,sel?.L===L?sel.f:null);
 if(b&&rs.some(R=>String(R.id)===String(b.rasterId)))$('drapeRaster').value=String(b.rasterId);
 $('drapeStatus').textContent='';$('drapeApply').disabled=!ls.length||!rs.length;$('vectorDrapeModal').classList.add('on');
}
root.GeoMineVectorDrape={open,apply,binding,resolve,sample};
function boot(){
 const cat=CATS.find(c=>c.id==='topografia');if(!cat)return;
 const label='Drape e cotas';let group=cat.grupos.find(g=>g.label===label);if(!group){group={label,it:[]};cat.grupos.push(group);}
 if(!group.it.some(c=>c.nome==='Drapear no MDT'))group.it.push({nome:'Drapear no MDT',ic:'drape_mdt',desc:'Linhas e contornos de polígonos sobre um MDT escolhido no 3D',act:open});
 if(typeof RIB_SVG==='object')RIB_SVG.drape_mdt='<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m3 23 8-6 8 6 10-8v8l-10 6-8-6-8 6Z" fill="#d8e3d1"/><path d="m4 6 8 3 8-5 8 3" stroke="#2585c7"/><path d="M16 10v9m-3-3 3 3 3-3" stroke="#d99b27"/></svg>';
 ribbonBuild();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
