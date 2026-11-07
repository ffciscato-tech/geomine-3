
(()=>{
  'use strict';
  const N=s=>(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const P={
    solid:['#d9e1e7','linear-gradient(#d9e1e7,#d9e1e7)','auto'],
    none:['#fff','linear-gradient(135deg,transparent 47%,#d85b57 48%,#d85b57 52%,transparent 53%)','auto'],
    diag1:['#fff7df','repeating-linear-gradient(135deg,#354b5c 0 1px,transparent 1px 8px)','auto'],
    diag2:['#fff7df','repeating-linear-gradient(45deg,#354b5c 0 1px,transparent 1px 8px)','auto'],
    grid:['#f4f7f9','repeating-linear-gradient(0deg,#526b7d 0 1px,transparent 1px 8px),repeating-linear-gradient(90deg,#526b7d 0 1px,transparent 1px 8px)','auto'],
    horizontal:['#f4f7f9','repeating-linear-gradient(0deg,#526b7d 0 1px,transparent 1px 7px)','auto'],
    vertical:['#f4f7f9','repeating-linear-gradient(90deg,#526b7d 0 1px,transparent 1px 7px)','auto'],
    dotted:['#f5f7f8','radial-gradient(circle,#42596a 0 1.3px,transparent 1.5px)','8px 8px'],
    limestone:['#d9e7ee','repeating-linear-gradient(0deg,rgba(45,83,104,.7) 0 1px,transparent 1px 10px),repeating-linear-gradient(90deg,transparent 0 15px,rgba(45,83,104,.5) 15px 16px,transparent 16px 30px)','30px 20px'],
    dolomite:['#ddc49a','repeating-linear-gradient(0deg,rgba(96,71,38,.7) 0 1px,transparent 1px 9px),repeating-linear-gradient(90deg,transparent 0 12px,rgba(96,71,38,.55) 12px 13px,transparent 13px 24px)','24px 18px'],
    marl:['#cddde1','repeating-linear-gradient(0deg,rgba(72,100,107,.65) 0 1px,transparent 1px 6px),radial-gradient(circle,rgba(72,100,107,.5) 0 1px,transparent 1.2px)','10px 10px'],
    sandstone:['#ead28b','radial-gradient(circle,rgba(132,91,25,.75) 0 1px,transparent 1.3px)','6px 6px'],
    siltstone:['#b6ada0','repeating-linear-gradient(0deg,rgba(64,58,51,.65) 0 1px,transparent 1px 5px)','auto'],
    claystone:['#b87954','repeating-linear-gradient(0deg,rgba(75,40,29,.68) 0 1px,transparent 1px 4px)','auto'],
    shale:['#62686a','repeating-linear-gradient(0deg,rgba(20,27,30,.9) 0 2px,transparent 2px 6px)','auto'],
    conglomerate:['#c9ae7b','radial-gradient(ellipse at 20% 30%,#725c3d 0 3px,transparent 3.5px),radial-gradient(ellipse at 75% 65%,#8d7550 0 4px,transparent 4.5px),radial-gradient(ellipse at 50% 10%,#5e4b34 0 2px,transparent 2.5px)','22px 18px'],
    breccia:['#d39376','conic-gradient(from 25deg at 30% 40%,transparent 0 15%,#713e31 16% 19%,transparent 20% 45%,#713e31 46% 49%,transparent 50%)','19px 17px'],
    coal:['#24272a','repeating-linear-gradient(165deg,#050607 0 3px,#4b5054 3px 5px)','auto'],
    evaporite:['#f1dde2','repeating-linear-gradient(135deg,rgba(180,105,126,.62) 0 2px,transparent 2px 9px),repeating-linear-gradient(45deg,rgba(255,255,255,.8) 0 1px,transparent 1px 9px)','auto'],
    quartzite:['#c9b7d9','repeating-linear-gradient(135deg,rgba(82,55,111,.75) 0 2px,transparent 2px 9px),repeating-linear-gradient(45deg,rgba(255,255,255,.65) 0 1px,transparent 1px 12px)','auto'],
    marble:['#eee7e3','repeating-linear-gradient(160deg,transparent 0 8px,rgba(135,99,105,.55) 9px 10px,transparent 11px 18px)','auto'],
    slate:['#586673','repeating-linear-gradient(155deg,rgba(20,35,47,.85) 0 2px,transparent 2px 7px)','auto'],
    phyllite:['#9ba9a7','repeating-linear-gradient(165deg,rgba(45,65,67,.7) 0 1px,rgba(224,233,231,.55) 1px 3px,transparent 3px 7px)','auto'],
    schist:['#8e735b','repeating-linear-gradient(160deg,rgba(65,43,30,.72) 0 2px,transparent 2px 7px)','auto'],
    gneiss:['#d8d0c5','repeating-linear-gradient(165deg,#383838 0 4px,#e7dfd3 4px 9px,#967d69 9px 12px,#eee9df 12px 17px)','auto'],
    granite:['#d6aaa2','radial-gradient(circle,#7a5b57 0 1px,transparent 1.5px),radial-gradient(circle,#f0ddd7 0 1px,transparent 1.5px)','7px 7px,11px 11px'],
    rhyolite:['#c8b3c9','radial-gradient(circle,rgba(91,61,98,.7) 0 1px,transparent 1.4px)','7px 7px'],
    gabbro:['#526963','radial-gradient(circle,#182b29 0 1.5px,transparent 1.8px),radial-gradient(circle,#8ca39c 0 1px,transparent 1.4px)','8px 8px,11px 11px'],
    basalt:['#414b4e','radial-gradient(circle,#151b1d 0 1px,transparent 1.4px)','5px 5px'],
    soil:['#a98255','radial-gradient(ellipse,rgba(83,56,31,.55) 0 2px,transparent 2.6px)','10px 8px'],
    laterite:['#a74a33','radial-gradient(circle,#59251d 0 1.5px,transparent 1.8px)','7px 7px'],
    alluvium:['#c7d9d8','repeating-linear-gradient(165deg,transparent 0 6px,rgba(65,121,129,.55) 7px 8px,transparent 9px 14px)','auto']
  };
  function keyFor(label){
    const t=N(label);
    if(t.includes('sem preench'))return'none'; if(t==='solido'||t.includes('sólido'))return'solid';
    if(t.includes('diagonal /'))return'diag1'; if(t.includes('diagonal \\'))return'diag2'; if(t.includes('malha'))return'grid';
    if(t.includes('horizontal'))return'horizontal'; if(t.includes('vertical'))return'vertical'; if(t.includes('pontilh'))return'dotted';
    if(t.includes('calcario'))return'limestone'; if(t.includes('dolomito'))return'dolomite'; if(t.includes('marga'))return'marl';
    if(t.includes('arenito'))return'sandstone'; if(t.includes('siltito'))return'siltstone'; if(t.includes('argilito'))return'claystone';
    if(t.includes('folhelho'))return'shale'; if(t.includes('conglomerado'))return'conglomerate'; if(t.includes('brecha'))return'breccia';
    if(t.includes('carvao'))return'coal'; if(t.includes('evaporito')||t.includes('gipsita'))return'evaporite';
    if(t.includes('quartzito'))return'quartzite'; if(t.includes('marmore'))return'marble'; if(t.includes('ardosia'))return'slate';
    if(t.includes('filito'))return'phyllite'; if(t.includes('xisto'))return'schist'; if(t.includes('gnaisse'))return'gneiss';
    if(t.includes('granito')||t.includes('plutonica'))return'granite'; if(t.includes('riolito')||t.includes('vulcanica'))return'rhyolite';
    if(t.includes('diabasio')||t.includes('gabro'))return'gabbro'; if(t.includes('basalto'))return'basalt';
    if(t.includes('solo')||t.includes('saprolito'))return'soil'; if(t.includes('laterita'))return'laterite'; if(t.includes('aluviao'))return'alluvium';
    return'solid';
  }
  function paint(el,label){const p=P[keyFor(label)]||P.solid;el.style.setProperty('--litho-bg',p[0]);el.style.setProperty('--litho-img',p[1]);el.style.setProperty('--litho-size',p[2]);el.title='Amostra: '+label;}
  function isLithologySelect(s){const a=[...s.options].map(o=>N(o.textContent));return a.length>=15&&a.some(x=>x.includes('calcario'))&&a.some(x=>x.includes('gnaisse'))&&a.some(x=>x.includes('basalto'));}
  function decorate(s){
    if(!s||s.dataset.alagisLithoVisual==='1'||!isLithologySelect(s))return;
    s.dataset.alagisLithoVisual='1';
    const wrap=document.createElement('div');wrap.className='alagis-litho-picker';s.parentNode.insertBefore(wrap,s);wrap.appendChild(s);
    const trigger=document.createElement('button');trigger.type='button';trigger.className='alagis-litho-trigger';trigger.setAttribute('aria-haspopup','listbox');trigger.innerHTML='<span class="alagis-litho-swatch"></span><span class="alagis-litho-trigger-label"></span><span class="alagis-litho-trigger-arrow">▼</span>';wrap.appendChild(trigger);
    const pop=document.createElement('div');pop.className='alagis-litho-popover';pop.setAttribute('role','listbox');pop.innerHTML='<div class="alagis-litho-head">Escolha visual do preenchimento geológico</div>';document.body.appendChild(pop);
    const cards=[];
    const addGroup=(label,options)=>{const h=document.createElement('div');h.className='alagis-litho-group-title';h.textContent=label||'Padrões';pop.appendChild(h);const grid=document.createElement('div');grid.className='alagis-litho-grid';pop.appendChild(grid);options.forEach(o=>{if(o.disabled&&!o.value)return;const b=document.createElement('button');b.type='button';b.className='alagis-litho-card';b.dataset.value=o.value;b.setAttribute('role','option');b.innerHTML='<span class="alagis-litho-swatch"></span><span class="alagis-litho-card-name"></span>';b.querySelector('.alagis-litho-card-name').textContent=o.textContent.trim();paint(b.querySelector('.alagis-litho-swatch'),o.textContent.trim());b.addEventListener('click',()=>{s.value=o.value;s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));sync();close();});grid.appendChild(b);cards.push(b);});};
    [...s.children].forEach(n=>{if(n.tagName==='OPTGROUP')addGroup(n.label,[...n.children]);else if(n.tagName==='OPTION')addGroup('Padrões básicos',[n]);});
    function sync(){const o=s.selectedOptions[0]||s.options[0];if(!o)return;trigger.querySelector('.alagis-litho-trigger-label').textContent=o.textContent.trim();paint(trigger.querySelector('.alagis-litho-swatch'),o.textContent.trim());cards.forEach(b=>b.setAttribute('aria-selected',b.dataset.value===s.value?'true':'false'));}
    function place(){const r=trigger.getBoundingClientRect(),w=Math.min(590,innerWidth-24),left=Math.max(12,Math.min(r.left,innerWidth-w-12));pop.style.width=w+'px';pop.style.left=left+'px';pop.style.top=((innerHeight-r.bottom>Math.min(440,innerHeight*.6))?r.bottom+5:Math.max(12,r.top-Math.min(pop.scrollHeight,innerHeight*.7)-5))+'px';}
    function open(){document.querySelectorAll('.alagis-litho-popover.is-open').forEach(x=>x!==pop&&x.classList.remove('is-open'));pop.classList.add('is-open');trigger.setAttribute('aria-expanded','true');place();const sel=cards.find(b=>b.getAttribute('aria-selected')==='true');if(sel)sel.scrollIntoView({block:'nearest'});}
    function close(){pop.classList.remove('is-open');trigger.setAttribute('aria-expanded','false');}
    trigger.addEventListener('click',e=>{e.stopPropagation();pop.classList.contains('is-open')?close():open();});
    s.addEventListener('change',sync);document.addEventListener('pointerdown',e=>{if(!pop.contains(e.target)&&!trigger.contains(e.target))close();});window.addEventListener('resize',()=>pop.classList.contains('is-open')&&place(),{passive:true});document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
    sync();
  }
  function scan(root=document){if(root.matches&&root.matches('select'))decorate(root);if(root.querySelectorAll)root.querySelectorAll('select').forEach(decorate);}
  const start=()=>{scan();new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>n.nodeType===1&&scan(n)))).observe(document.documentElement,{childList:true,subtree:true});};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})();
