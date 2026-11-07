/* Sondagens — propriedades transacionais, cadastro manual e log por MD.
   Metadados editados nunca recalculam um survey ou uma string importada. */
(function(){
  'use strict';
  const api=window.GeoMineGeology=window.GeoMineGeology||{};
  const geometryKeys=new Set(['COTA_BOCA','PROF_M','AZIMUTE','INCLINACAO']);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const name=(f,i)=>String(f?.props?.ID_FURO||f?.props?.ID_SPT||f?.props?.FURO||'Furo '+(i+1));
  const isLayer=L=>!!(L&&['sondagem','spt'].includes(L._geology?.kind));
  function resolveTarget(selection){
    const layers=(S.layers||[]).filter(L=>isLayer(L)&&L.features?.length);
    const explicit=selection?.layer,selected=S.selFeat?.layer;
    const layer=layers.includes(explicit)?explicit:layers.includes(selected)?selected:layers.find(L=>L.id===S.activeId)||layers[0];
    if(!layer)return null;
    const index=layer===explicit?Number(selection.index??selection.idx??0):layer===selected?Number(S.selFeat.idx):0;
    return {layer,index:Number.isInteger(index)&&layer.features[index]?index:0};
  }
  function requireLocal(){
    if(window.GeoMineCollaboration?.snapshot?.().roomId)throw new Error('Edite os dados completos de sondagem na cópia local, fora da sala colaborativa; salve o projeto para compartilhar trajetória, atributos e logs.');
  }
  function requireTarget(layer,feature){
    requireLocal();
    if(!(S.layers||[]).includes(layer)||!layer.features.includes(feature))throw new Error('O furo não está mais neste projeto. Reabra suas propriedades.');
    if(typeof collabCanEditLayer==='function'&&!collabCanEditLayer(layer,false))throw new Error('Esta camada não está disponível para edição.');
  }
  function validID(id,layer,feature){
    if(typeof id!=='string'||!id.trim()||id.trim().length>160||/[\x00-\x1f\x7f]/.test(id))throw new Error('Informe um código do furo com 1 a 160 caracteres, sem quebras de linha.');
    id=id.trim();
    if(layer?.features.some(f=>f!==feature&&name(f,0)===id))throw new Error('Já existe um furo com esse código nesta camada.');
    return id;
  }
  function propertyDraft(layer,index){
    const feature=layer?.features?.[index];if(!feature)throw new Error('Furo não encontrado.');
    const original=JSON.stringify(feature.props||{}),originalProps=copy(feature.props||{}),props=copy(originalProps);
    // A assinatura inclui a geometria: não aplicar uma ficha antiga a uma
    // trajetória substituída enquanto a janela estava aberta.
    const geometry=JSON.stringify([feature.geom,feature.zg,feature.boreholeTrace,feature.boreholeSurvey]);
    return {props,feature,commit(values){
      requireTarget(layer,feature);
      if(JSON.stringify(feature.props||{})!==original||JSON.stringify([feature.geom,feature.zg,feature.boreholeTrace,feature.boreholeSurvey])!==geometry)
        throw new Error('O furo mudou durante a edição. Reabra a ficha para revisar a versão atual.');
      let nodes=0;
      const checkValue=(v,depth)=>{if(++nodes>100000||depth>32)throw new Error('Atributos JSON excessivamente complexos.');if(typeof v==='number'&&!Number.isFinite(v))throw new Error('Os atributos devem conter somente números finitos.');if(v&&typeof v==='object')Object.values(v).forEach(x=>checkValue(x,depth+1));};
      checkValue(values,0);
      const next=copy(values),idKey=layer._geology?.kind==='spt'?'ID_SPT':'ID_FURO';
      next[idKey]=validID(next[idKey],layer,feature);
      for(const key of geometryKeys)if(JSON.stringify(next[key])!==JSON.stringify(originalProps[key]))throw new Error('A trajetória é somente leitura nesta ficha. Para alterá-la, importe o collar/survey corrigido ou cadastre um novo furo.');
      if(Object.keys(next).length>512||JSON.stringify(next).length>4*1024*1024)throw new Error('A ficha excede o limite de 512 atributos / 4 MB.');
      for(const [key,value] of Object.entries(next)){
        if(!key||key.length>160||['__proto__','prototype','constructor'].includes(key))throw new Error('Nome de atributo inválido.');
        if(typeof value==='number'&&!Number.isFinite(value))throw new Error(key+': valor numérico inválido.');
        if(key==='DESCRIPTIONS'&&(!Array.isArray(value)||value.some(v=>typeof v!=='string')||Array.isArray(originalProps[key])&&value.length!==originalProps[key].length))
          throw new Error('DESCRIPTIONS deve continuar sendo uma lista de textos, com uma entrada para cada ponto original.');
      }
      feature.props=next;
      layer.fields=layer.fields||[];
      for(const key of Object.keys(next))if(!layer.fields.some(f=>f.name===key))layer.fields.push({name:key,type:typeof next[key]==='number'?'N':'C',length:typeof next[key]==='number'?20:254,decimals:typeof next[key]==='number'?3:0});
      layer._rev=(Number(layer._rev)||0)+1;
      // boreholeSource e tabelas brutas continuam sendo a proveniência original.
      return feature;
    }};
  }
  function modal(title,body,footer){
    document.getElementById('gmBoreholeProperties')?.remove();
    const root=document.createElement('div');root.id='gmBoreholeProperties';root.className='gmgeo-backdrop gm-bhp-backdrop';
    root.innerHTML=`<section class="gmgeo-modal gm-bhp-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="gmgeo-head"><h2>${esc(title)}</h2><button class="gmgeo-x" data-close aria-label="Fechar sem salvar">×</button></header><div class="gmgeo-form-body">${body}<p class="gm-bhp-status" role="status"></p></div><footer class="gmgeo-foot">${footer}<button class="tbtn" data-close>Cancelar</button><button class="btn primary" data-apply>Aplicar</button></footer></section>`;
    document.body.appendChild(root);root.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>root.remove());
    root.addEventListener('mousedown',e=>{if(e.target===root)root.remove();});return root;
  }
  function refresh(layer){try{drawLayer(layer);refreshUI();if(typeof propRefresh==='function')propRefresh();}catch(e){console.warn('Sondagem atualizada',e);}}
  function open(selection){
    const target=resolveTarget(selection);if(!target)return openNew();
    const {layer,index}=target,draft=propertyDraft(layer,index),f=draft.feature,idKey=layer._geology?.kind==='spt'?'ID_SPT':'ID_FURO';
    if(!Object.hasOwn(draft.props,idKey))draft.props[idKey]=name(f,index);
    const extraKeys=Object.keys(draft.props).filter(k=>k!==idKey&&!geometryKeys.has(k));
    for(const key of ['STATUS','OBS'])if(!extraKeys.includes(key)&&!Object.hasOwn(draft.props,key)){draft.props[key]='';extraKeys.push(key);}
    const geometry=(f.geom?.[0] instanceof Array?f.geom[0]:f.geom)||[],z=f.zg?.[0]??geometry[2]??f.props?.COTA_BOCA;
    const root=modal('Propriedades do furo — '+name(f,index),`
      <label>Código do furo<input data-id maxlength="160" value="${esc(draft.props[idKey])}"></label>
      <div class="gm-bhp-actions"><button class="tbtn" data-log>Log gráfico e intervalos</button><button class="tbtn" data-core>Testemunhos / RQD</button></div>
      <fieldset><legend>Trajetória preservada · ${esc(layer.crs)}</legend><div class="gmgeo-grid gmgeo-grid3">${[['X / Leste (m)',geometry[0]],['Y / Norte (m)',geometry[1]],['Cota da boca (m)',z],['Profundidade / MD (m)',draft.props.PROF_M],['Azimute inicial (°)',draft.props.AZIMUTE],['Inclinação inicial (°)',draft.props.INCLINACAO]].map(([label,v])=>`<label>${label}<input readonly value="${esc(v??'Não informado')}"></label>`).join('')}</div>
      <p>Coordenadas, profundidade e orientação são somente leitura nesta ficha. Para corrigir a trajetória, reimporte o collar/survey ou a string corrigida, ou cadastre um novo furo. Editar atributos de origem não move a sondagem.</p></fieldset>
      <fieldset><legend>Atributos editáveis</legend><p>Os dados de origem são mantidos separadamente para rastreabilidade. Listas e objetos usam JSON; DESCRIPTIONS contém as descrições dos pontos da string, não uma litologia inferida.</p>
      <div class="gm-bhp-attributes">${extraKeys.map((key,i)=>{const v=draft.props[key],json=v!==null&&typeof v==='object';return `<label>${esc(key)}${json?' (JSON)':''}${json||typeof v==='string'&&v.length>180?`<textarea data-extra="${i}" ${json?'data-json':''}>${esc(json?JSON.stringify(v,null,2):v)}</textarea>`:`<input data-extra="${i}" ${typeof v==='number'?'type="number" step="any"':typeof v==='boolean'?'data-boolean':''} value="${esc(v??'')}">`}</label>`;}).join('')}</div></fieldset>
      <details><summary>Origem e tabelas preservadas</summary><pre>${esc(JSON.stringify({source:f.boreholeSource||'Cadastro no mapa',surveyStations:f.boreholeSurvey?.length||0,tracePoints:f.boreholeTrace?.length||0,tables:(f.boreholeTables||[]).map(t=>({name:t.name,role:t.role,rows:t.rows?.length??t.entries?.length}))},null,2))}</pre></details>`,'');
    const fail=e=>{root.querySelector('.gm-bhp-status').textContent=e.message||String(e);};
    function collect(){
      const next=copy(draft.props);next[idKey]=root.querySelector('[data-id]').value;
      root.querySelectorAll('[data-extra]').forEach(input=>{const key=extraKeys[+input.dataset.extra],original=draft.props[key];
        if(input.hasAttribute('data-json')){try{next[key]=JSON.parse(input.value);}catch(_){throw new Error(key+': JSON inválido.');}}
        else if(typeof original==='number'){if(!input.value.trim()||!Number.isFinite(Number(input.value)))throw new Error(key+': informe um número válido.');next[key]=Number(input.value);}
        else if(typeof original==='boolean'){if(!/^(true|false)$/.test(input.value))throw new Error(key+': use true ou false.');next[key]=input.value==='true';}
        else next[key]=original==null&&input.value===''?original:input.value;
      });return next;
    }
    root.querySelector('[data-apply]').onclick=()=>{try{draft.commit(collect());refresh(layer);root.remove();toast('Atributos do furo atualizados. Trajetória e profundidades preservadas.');selection?.onApplied?.(target);}catch(e){fail(e);}};
    const toLog=mode=>{if(JSON.stringify(collect())!==JSON.stringify(draft.props)&&!window.confirm('Descartar as alterações desta ficha e abrir o log?'))return;root.remove();api.openBoreholeEditor(mode,target);};
    root.querySelector('[data-log]').onclick=()=>{try{toLog('log');}catch(e){fail(e);}};root.querySelector('[data-core]').onclick=()=>{try{toLog('core');}catch(e){fail(e);}};
    return root;
  }
  function openNew(){
    // Reutiliza o cadastro existente na aba Geologia, inclusive ficha de
    // campo, validação de orientação e escolha da posição pelo mapa.
    document.getElementById('gmBoreholeProperties')?.remove();
    return api.arm('sondagem');
  }
  function drawLog(canvas,{layer,feature,rows,isCore}){
    if(!canvas)return;const ctx=canvas.getContext('2d');if(!ctx)return;
    canvas.width=480;canvas.height=720;const w=480,h=720,top=58,bottom=654,left=70,bar=94;
    const rawDepth=api.fieldMapping?.fieldValue?.(layer,feature,'PROF_M')??feature?.props?.PROF_M;
    const depth=Number(rawDepth),validDepth=rawDepth!==null&&rawDepth!==''&&Number.isFinite(depth)&&depth>0;
    ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.fillStyle='#18334c';ctx.font='bold 17px sans-serif';ctx.fillText(name(feature,0).slice(0,36),20,25);
    ctx.font='12px sans-serif';ctx.fillText('Profundidade medida ao longo do furo (MD)',20,44);
    if(!validDepth){ctx.fillText('Informe a profundidade do furo para exibir a escala.',20,90);return;}
    const y=md=>top+(bottom-top)*md/depth;
    ctx.strokeStyle='#c6d1db';ctx.fillStyle='#fff';ctx.fillRect(left,top,bar,bottom-top);ctx.strokeRect(left,top,bar,bottom-top);
    ctx.font='11px sans-serif';ctx.textAlign='right';ctx.fillStyle='#18334c';
    for(let i=0;i<=10;i++){const md=i*depth/10,at=y(md);ctx.fillText(md.toLocaleString('pt-BR',{maximumFractionDigits:2})+' m',left-8,at+4);ctx.beginPath();ctx.moveTo(left,at);ctx.lineTo(left+bar,at);ctx.stroke();}
    ctx.textAlign='left';let lastLabel=-Infinity,count=0;
    const color=api.__sectionTest?.lithologyColor||(()=> '#6cb9bc');
    for(const row of rows||[]){const from=Number(row.DE_M),to=Number(row.ATE_M);
      if(row.DE_M==null||row.ATE_M==null||row.DE_M===''||row.ATE_M===''||!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<=from||to>depth+1e-8)continue;
      const lith=String(row.LITOLOGIA||'').trim(),y1=y(from),y2=y(to);count++;
      ctx.fillStyle=lith?color(lith):'#e5e9ed';ctx.fillRect(left+1,y1+1,bar-2,Math.max(1,y2-y1-1));ctx.strokeStyle='#8a9dad';ctx.strokeRect(left,y1,bar,y2-y1);
      const middle=(y1+y2)/2;if(middle-lastLabel>=24){ctx.fillStyle='#18334c';ctx.font='12px sans-serif';const label=lith||'Sem litologia informada',max=isCore?23:35;ctx.fillText(label.length>max?label.slice(0,max-1)+'…':label,left+bar+12,middle+3);ctx.font='10px sans-serif';ctx.fillText(from+'–'+to+' m',left+bar+12,middle+16);lastLabel=middle;}
      if(isCore){for(const [key,x,c] of [['REC_PCT',365,'#29799a'],['RQD_PCT',414,'#579545']]){const v=row[key];if(v!=null&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0&&Number(v)<=100){ctx.fillStyle=c;ctx.fillRect(x,y1,Number(v)*.4,Math.max(1,y2-y1));}}}
    }
    if(isCore){ctx.font='10px sans-serif';ctx.fillStyle='#18334c';ctx.fillText('Rec. %',365,top-7);ctx.fillText('RQD %',414,top-7);}
    ctx.font='12px sans-serif';ctx.fillStyle='#18334c';ctx.fillText(count?count+' intervalo(s). Espaços sem dados ficam em branco.':'Sem intervalos. Adicione litologia / descrição na tabela.',20,h-36);
    if(feature?.boreholeSource?.depthBasis==='string-length')ctx.fillText('STR: MD calculada pelo comprimento da string original.',20,h-16);
    else ctx.fillText('A escala mostra MD, não cota ou espessura vertical.',20,h-16);
  }
  function layerActionsHTML(layer){
    if(!isLayer(layer))return '';
    return '<div class="gm-bhp-actions"><button type="button" class="tbtn" data-bhp="props">Propriedades do furo</button><button type="button" class="tbtn" data-bhp="log">Log gráfico</button><button type="button" class="tbtn" data-bhp="core">Testemunhos</button><button type="button" class="tbtn" data-bhp="new">＋ Novo furo</button></div>';
  }
  function bindLayerActions(node,layer){node?.querySelectorAll('[data-bhp]').forEach(button=>button.onclick=()=>{
    const index=S.selFeat?.layer===layer?S.selFeat.idx:0,target={layer,index};
    document.getElementById('lpModal')?.classList.remove('on');
    if(button.dataset.bhp==='new')openNew();else if(button.dataset.bhp==='props')open(target);else api.openBoreholeEditor(button.dataset.bhp,target);
  });}
  function syncDockActions(){
    if(typeof document==='undefined')return;
    const dock=document.getElementById('propDockContent')||document.getElementById('propDock');if(!dock)return;
    dock.querySelector('[data-bhp-dock]')?.remove();
    const selected=S.selFeat?.layer,active=(S.layers||[]).find(L=>L.id===S.activeId),layer=isLayer(selected)?selected:isLayer(active)?active:null;
    if(!layer||(S.selRaster&&!S.activeId))return;
    const section=document.createElement('section');section.dataset.bhpDock='';
    const index=selected===layer?S.selFeat.idx:0,feature=layer.features[index];
    section.innerHTML='<strong>'+esc(feature?'Furo · '+name(feature,index):'Sondagens')+'</strong>'+layerActionsHTML(layer);
    dock.prepend(section);bindLayerActions(section,layer);
  }
  api.boreholeProperties={open,openNew,isLayer,resolveTarget,layerActionsHTML,bindLayerActions,syncDockActions,drawLog,__test:{propertyDraft,validID}};
  // A paleta atual usa propDock; propBox continua existindo apenas no shell
  // antigo. Decorar o refresh preserva as demais extensões da paleta.
  if(typeof window.propRefresh==='function'){
    const previous=window.propRefresh;
    window.propRefresh=function(){const result=previous.apply(this,arguments);syncDockActions();return result;};
  }
})();
