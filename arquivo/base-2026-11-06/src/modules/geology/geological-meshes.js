/* GeoMine — superfícies e sólidos Surpac. A malha original fica no projeto;
   superfície e arestas são duas vistas da mesma geometria, em planta e 3D.
   Leitura/topologia em worker; nenhuma API remota nem conversão para MDT. */
(function(){
  'use strict';
  const api=window.GeoMineGeology=window.GeoMineGeology||{},MAX_BYTES=128*1024*1024,
    MAX_FACES=500000,MAX_VERTICES=600000,MAX_TOTAL_FACES=1000000,
    palette=['#48aaa2','#d89648','#8570bd','#c85671','#4ba6d4','#8ca64d'];
  const projected=new WeakMap();let busy=false,cancelJob=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const validColor=c=>/^#[0-9a-f]{6}$/i.test(c||'')?c:'#48aaa2';
  function store(){const state=api.state();if(!Array.isArray(state.meshes))state.meshes=[];return state.meshes;}
  function views(m){return (S.layers||[]).filter(l=>l._geology?.kind==='surpac-mesh'&&l._geology.meshId===m.id);}
  function proxy(m){const ls=views(m);return ls.find(l=>l._geology.meshRole==='surface')||ls[0];}
  function list(){return store().filter(m=>proxy(m)).map(m=>{
    const ls=views(m),surface=ls.find(l=>l._geology.meshRole==='surface');
    return {...m,color:validColor(surface?.color||m.color),visible:ls.some(l=>l.visible!==false)};
  });}
  function raw(id){return store().find(m=>m.id===String(id)&&proxy(m));}
  function sharedRoom(){return !!window.GeoMineCollaboration?.snapshot?.().roomId;}
  function requireLocalImport(){if(sharedRoom())throw new Error('Nesta etapa, importe malhas na cópia local, fora da sala colaborativa. As geometrias seguem no arquivo .ccmgis salvo, mas a importação não é sincronizada em tempo real.');}
  function metricCRS(code){
    if(!code||typeof proj4!=='function')throw new Error('Selecione um sistema de coordenadas projetado conhecido, em metros.');
    let p;try{p=new proj4.Proj(code);}catch(_){throw new Error('Sistema de coordenadas desconhecido: '+code);}
    if(p.projName==='longlat'||(p.units&&p.units!=='m')||(p.to_meter!=null&&Math.abs(p.to_meter-1)>1e-12))
      throw new Error('A malha deve usar coordenadas projetadas em metros; não use graus ou pés.');
    return String(code);
  }
  function getWorkMesh(id){
    const m=raw(id);if(!m)throw new Error('Superfície/ sólido não encontrado no projeto: '+id);
    const source=metricCRS(m.crs),target=metricCRS(S.workCRS),ls=views(m),surface=ls.find(l=>l._geology.meshRole==='surface');
    let cache=projected.get(m);
    if(!cache||cache.target!==target){
      const vertices=source===target?m.vertices:m.vertices.map(p=>{
        const xy=proj4(source,target,[p[0],p[1]]);
        if(!xy.every(Number.isFinite))throw new Error('Falha ao transformar a malha para o CRS do projeto.');
        return [xy[0],xy[1],p[2]];
      });
      cache={target,vertices};projected.set(m,cache);
    }
    return {...m,vertices:cache.vertices,crs:target,color:validColor(surface?.color||m.color),visible:ls.some(l=>l.visible!==false)};
  }
  function refresh(){
    if(S.geology?.section)S.geology.section.result=null;
    try{refreshUI();}catch(_){}try{api.refresh?.();}catch(_){}
  }
  function bounds(vertices){
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const p of vertices)for(let i=0;i<3;i++){min[i]=Math.min(min[i],p[i]);max[i]=Math.max(max[i],p[i]);}
    return {min,max};
  }
  function validateMesh(m){
    if(!Array.isArray(m.vertices)||!Array.isArray(m.faces)||!m.vertices.length||!m.faces.length)
      throw new Error('A malha está vazia.');
    if(m.faces.length>MAX_FACES||m.vertices.length>MAX_VERTICES)
      throw new Error('Esta etapa suporta até 500 mil triângulos e 600 mil vértices por objeto. Divida o objeto no programa de origem; nenhuma face foi descartada.');
    if(m.vertices.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)))throw new Error('A malha contém coordenadas inválidas.');
    if(m.faces.some(f=>!Array.isArray(f)||f.length!==3||f.some(i=>!Number.isInteger(i)||i<0||i>=m.vertices.length)))throw new Error('A malha contém referências inválidas de triângulos.');
  }
  function viewName(m,role){return m.name+' · '+(role==='surface'?(m.topology?.closedSolid?'Sólido':'Superfície'):'Vetores');}
  function configureView(l,m,role){
    l._geology={...l._geology,schemaVersion:2,kind:'surpac-mesh',family:'modelo',meshId:m.id,meshRole:role};
    if(m.source?.simplification)l._geology.simplifiedForVisualization=true;
    l.features=[];l.fields=[];l.gtype=role==='surface'?'polygon':'line';l.locked=true;
    l.sym=l.sym||{};l.sym.mode='single';l.sym.dash='';l.sym.color=l.color;l.sym.stroke=l.color;
    l.fill=l.sym.fill=role==='surface'?1:0;l.weight=l.sym.weight=role==='surface'?0:1;
    l.sym.opacity=1;
    return l;
  }
  function createView(m,role,groupId){
    const l=addLayer({name:viewName(m,role),gtype:role==='surface'?'polygon':'line',crs:m.crs,
      color:role==='surface'?m.color:'#25333d',fields:[],features:[],
      src:{name:[m.source?.dtmName,m.source?.strName].filter(Boolean).join(' + ')}});
    configureView(l,m,role);l.groupId=groupId;return l;
  }
  function restoreLayers(){
    const selected=S.activeId,selectedRaster=S.selRaster;
    if(Array.isArray(S.undo))S.undo=S.undo.filter(a=>a.L?._geology?.kind!=='surpac-mesh');
    // Split only legacy location boxes. Never recreate a role intentionally
    // removed by the user in a current project.
    for(const m of store()){
      const ls=views(m),legacy=ls.find(l=>!l._geology.meshRole);
      if(legacy){
        m.name=m.name||legacy.name;m.color=validColor(legacy.color||m.color);
        legacy.name=viewName(m,'surface');configureView(legacy,m,'surface');
        const vectors=createView(m,'vectors',legacy.groupId);vectors.visible=legacy.visible;
        const i=S.layers.indexOf(legacy);S.layers=S.layers.filter(l=>l!==vectors);S.layers.splice(i,0,vectors);
        const key='L:'+legacy.id,at=(S.stack||[]).indexOf(key);
        if(at>=0){S.stack=S.stack.filter(k=>k!=='L:'+vectors.id);S.stack.splice(at,0,'L:'+vectors.id);}
      }
      const current=views(m);m.layerId=current.find(l=>l._geology.meshRole==='surface')?.id||current[0]?.id;
      m.vectorLayerId=current.find(l=>l._geology.meshRole==='vectors')?.id;
      current.forEach(l=>{l.locked=true;drawLayer(l);});
    }
    S.activeId=selected;S.selRaster=selectedRaster;
    try{zApply();}catch(_){}
  }
  function commitParsed(parsed,options){
    requireLocalImport();
    metricCRS(options.crs);
    if(!options.unitsConfirmed)throw new Error('Confirme o CRS e que X, Y e cotas Z estão em metros.');
    if(!parsed?.meshes?.length)throw new Error('Nenhuma superfície foi encontrada neste par de arquivos.');
    parsed.meshes.forEach(validateMesh);
    // Malhas removidas ainda sustentam Desfazer nesta sessão; também contam
    // no teto de memória, mas não entram no próximo arquivo salvo.
    const total=store().reduce((n,m)=>n+m.faces.length,0)+parsed.meshes.reduce((n,m)=>n+m.faces.length,0);
    if(total>MAX_TOTAL_FACES)throw new Error('A sessão excederia 1 milhão de triângulos geológicos, incluindo o histórico de Desfazer. Para liberar malhas removidas, salve e reabra o projeto. Nenhuma malha foi reduzida.');
    const added=[],layers=[],originalGroups=(S.groups||[]).slice(),originalStack=(S.stack||[]).slice(),originalActive=S.activeId;
    try{
      for(const [i,data] of parsed.meshes.entries()){
        const id='GMS-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10),
          description=data.trisolationText||data.objectText||data.name||'Superfície Surpac',
          baseName=String(options.names?.[i]||options.name||description).slice(0,160)+(options.name&&parsed.meshes.length>1?' · '+description:''),
          name=baseName+(data.source?.simplification&&!/visualização simplificada/i.test(baseName)?' · visualização simplificada':''),
          color=validColor(options.color||palette[(store().length+i)%palette.length]),b=bounds(data.vertices),
          m={id,name,color,crs:options.crs,vertices:data.vertices,faces:data.faces,
            objectId:data.objectId,trisolationId:data.trisolationId,objectText:data.objectText||'',trisolationText:data.trisolationText||'',topology:data.topology||null,
            source:{...data.source,format:'surpac-dtm-str',dtmName:options.dtmName,strName:options.strName,importedAt:new Date().toISOString()},bounds:b};
        store().push(m);added.push(m);
        const requested=String(options.groupName||'').trim().slice(0,120);
        let group=requested?(S.groups||[]).find(g=>g.name===requested):null;
        if(requested&&!group){group={id:gid++,name:requested,collapsed:false};S.groups.push(group);S.stack.unshift('G:'+group.id);}
        const groupId=(group||api.ensureGroup()).id;
        for(const role of ['surface','vectors']){
          const l=createView(m,role,groupId);layers.push(l);
          if(role==='surface')m.layerId=l.id;else m.vectorLayerId=l.id;
          drawLayer(l);
        }
      }
    }catch(error){
      // Importação atômica: um erro não deixa metade dos objetos no projeto.
      for(const l of layers){try{if(l.llayer)map.removeLayer(l.llayer);}catch(_){}S.layers=S.layers.filter(x=>x!==l);}
      const ids=new Set(added.map(m=>m.id));S.geology.meshes=store().filter(m=>!ids.has(m.id));
      S.groups=originalGroups;S.stack=originalStack;S.activeId=originalActive;refresh();throw error;
    }
    const q=S.geology.section||(S.geology.section={});q.meshIds=[...new Set([...(q.meshIds||[]),...added.map(m=>m.id)])];
    refresh();if(typeof toast==='function')toast(added.length+' objeto(s) geológico(s) · '+layers.length+' camadas de superfície e vetores · '+added.reduce((n,m)=>n+m.faces.length,0).toLocaleString('pt-BR')+' triângulos');
    return {meshes:added,warnings:parsed.warnings||[]};
  }
  function rename(id,name){
    const m=raw(id),value=String(name||'').trim();
    if(!m)throw new Error('Objeto não encontrado.');
    if(!value)throw new Error('Digite um nome para a camada.');
    const suffix=m.source?.simplification&&!/visualização simplificada/i.test(value)?' · visualização simplificada':'';
    m.name=value.slice(0,160)+suffix;
    views(m).forEach(l=>{l.name=viewName(m,l._geology.meshRole);});refresh();return m.name;
  }
  function readFile(file,job){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();let done=false;
      const timer=setTimeout(()=>finish(new Error('O arquivo demorou mais de 2 minutos para ficar disponível. Baixe uma cópia local e tente novamente.')),120000);
      function abort(){finish(new Error('Importação cancelada; o projeto não foi alterado.'));}
      function finish(error,result){if(done)return;done=true;clearTimeout(timer);job.aborts.delete(abort);reader.onload=reader.onerror=reader.onabort=null;if(reader.readyState===1)reader.abort();error?reject(error):resolve(result);}
      job.aborts.add(abort);reader.onload=()=>finish(null,reader.result);
      reader.onerror=()=>finish(new Error('Não foi possível ler '+file.name+'. Baixe uma cópia local e tente novamente.'));
      reader.onabort=abort;
      try{reader.readAsArrayBuffer(file);}catch(e){finish(e);}
    });
  }
  function meshWorkerJob(){
    self.onmessage=async function(e){
      try{
        const {dtm,str,names,settings}=e.data,simplified=settings.mode==='simplified';
        self.postMessage({progress:'Lendo triângulos e coordenadas…'});
        let r=GeoMineSurpacReader.parsePair(dtm,str,{...names,maxInputFaces:simplified?4000000:2000000,allowRecordEnd:true});
        r=await GeoMineMeshSimplification.prepare(r,settings,p=>self.postMessage({progress:p}));
        const files=await Promise.all([['dtm',dtm],['str',str]].map(async([kind,buffer])=>{
          const info={...(names.files?.find(f=>f.kind===kind)||{}),kind,size:buffer.byteLength};
          if(self.crypto?.subtle)info.sha256=Array.from(new Uint8Array(await self.crypto.subtle.digest('SHA-256',buffer)),v=>v.toString(16).padStart(2,'0')).join('');
          return info;
        }));
        let total=0;
        for(const [i,m] of r.meshes.entries()){
          total+=m.faces.length;
          if(m.faces.length>500000||m.vertices.length>600000||total>1000000)throw Error('Limite de importação: 500 mil triângulos por objeto e 1 milhão por projeto. Escolha Simplificado para visualização e diminua o detalhe, ou divida os objetos.');
          self.postMessage({progress:'Verificando topologia '+(i+1)+' de '+r.meshes.length+'…'});
          m.topology=GeoMineMeshSections.analyze(m);m.source={...m.source,files};
        }
        self.postMessage({result:r});
      }catch(e){self.postMessage({error:e.message||String(e)});}
    };
  }
  function parseWorker(dtm,str,names,job,settings={mode:'integral',detail:10},onProgress=()=>{}){
    return new Promise((resolve,reject)=>{
      const reader=document.getElementById('geomine-surpac-reader-module')?.textContent,
        engine=document.getElementById('geomine-mesh-section-engine-module')?.textContent,
        optimizer=document.getElementById('geomine-meshoptimizer-simplifier-module')?.textContent,
        simplifier=document.getElementById('geomine-mesh-simplification-module')?.textContent;
      if(!reader||!engine||!optimizer||!simplifier||typeof Worker!=='function'){reject(new Error('O navegador não disponibilizou o leitor em segundo plano. Reabra o aplicativo em um navegador atualizado.'));return;}
      const script='self.window=self;\n'+[reader,engine,optimizer,simplifier].join('\n')+'\n('+meshWorkerJob.toString()+')();';
      const url=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));let worker,timer,done=false;
      function abort(){finish(new Error('Importação cancelada; o projeto não foi alterado.'));}
      function finish(error,result){if(done)return;done=true;clearTimeout(timer);job.aborts.delete(abort);worker?.terminate();URL.revokeObjectURL(url);error?reject(error):resolve(result);}
      try{worker=new Worker(url);worker.onmessage=e=>{if(e.data.progress){onProgress(e.data.progress);return;}finish(e.data.error?new Error(e.data.error):null,e.data.result);};
        worker.onerror=e=>finish(new Error('Leitor Surpac: '+(e.message||'o navegador interrompeu a leitura.')));
        timer=setTimeout(()=>finish(new Error('A leitura excedeu 5 minutos. Divida os objetos e tente novamente.')),300000);
        job.aborts.add(abort);
        worker.postMessage({dtm,str,names,settings},[dtm,str]);
      }catch(e){finish(e);}
    });
  }
  async function validateFiles(dtm,str,options={}){
    requireLocalImport();
    api.state();
    if(busy)throw new Error('Já existe uma importação Surpac em andamento.');
    if(!dtm||!str)throw new Error('Escolha o .dtm e seu .str ou .stx correspondente.');
    if(!/\.dtm$/i.test(dtm.name)||! /\.(str|stx)$/i.test(str.name))throw new Error('Selecione um arquivo .dtm e um arquivo .str/.stx.');
    if(dtm.size+str.size>MAX_BYTES)throw new Error('O par excede 128 MB. Divida a malha em objetos menores para esta etapa.');
    const settings=window.GeoMineMeshSimplification.settings(options);
    busy=true;const job={cancelled:false,aborts:new Set()};
    cancelJob=()=>{job.cancelled=true;for(const abort of [...job.aborts])abort();};
    try{
      const originalState=S.geology;
      const buffers=await Promise.all([readFile(dtm,job),readFile(str,job)]);
      if(job.cancelled)throw new Error('Importação cancelada; o projeto não foi alterado.');
      const names={dtmName:dtm.name,strName:str.name,files:[{kind:'dtm',name:dtm.name,size:dtm.size,lastModified:dtm.lastModified||null},{kind:'str',name:str.name,size:str.size,lastModified:str.lastModified||null}]};
      const parsed=await parseWorker(buffers[0],buffers[1],names,job,settings,options.onProgress);
      if(job.cancelled)throw new Error('Importação cancelada; o projeto não foi alterado.');
      if(S.geology!==originalState)throw new Error('O projeto foi trocado durante a leitura. Importe novamente no projeto correto.');
      return {parsed,state:originalState,dtm,str,settings};
    }finally{for(const abort of [...job.aborts])abort();cancelJob=null;busy=false;}
  }
  async function importFiles(dtm,str,options={}){
    metricCRS(options.crs);if(!options.unitsConfirmed)throw new Error('Confirme o CRS e as unidades em metros.');
    const validated=await validateFiles(dtm,str,options);
    if(validated.state!==S.geology)throw new Error('O projeto foi trocado durante a leitura. Importe novamente no projeto correto.');
    return commitParsed(validated.parsed,{...options,dtmName:dtm.name,strName:str.name});
  }
  function open(selectedId,previewOnOpen=false){
    if(document.getElementById('gmMeshModal')){document.getElementById('gmMeshModal').focus();return;}
    const root=document.createElement('div');root.className='gm-mesh-backdrop';root.id='gmMeshModal';root.tabIndex=-1;
    const crsList=Object.entries(typeof CRS_LABELS==='object'?CRS_LABELS:{}).filter(([c])=>{try{metricCRS(c);return true;}catch(_){return false;}});
    root.innerHTML='<section class="gm-mesh-modal" role="dialog" aria-modal="true" aria-label="Superfícies e sólidos Surpac"><header class="gm-mesh-head"><h2>Superfícies e sólidos Surpac</h2><button class="tbtn" data-close>Fechar</button></header><div class="gm-mesh-body"><p>Importe o par <b>.dtm + .str/.stx</b>. A geometria 3D completa fica salva no projeto e pode ser cortada pela seção A–B. Não é necessário um modelo de blocos.</p><div class="gm-mesh-form"><div class="gm-mesh-grid"><div><label for="gmMeshDTM">Triângulos (.dtm)</label><input id="gmMeshDTM" type="file" accept=".dtm"></div><div><label for="gmMeshSTR">Coordenadas (.str ou .stx)</label><input id="gmMeshSTR" type="file" accept=".str,.stx"></div></div><label for="gmMeshCRS">Sistema de coordenadas dos arquivos</label><select id="gmMeshCRS">'+crsList.map(([c,n])=>'<option value="'+esc(c)+'"'+(c===S.workCRS?' selected':'')+'>'+esc(n)+' · '+esc(c)+'</option>').join('')+'</select><label class="gm-mesh-confirm"><input id="gmMeshUnits" type="checkbox"><span>Confirmo o CRS acima e que X, Y e cotas Z estão em metros.</span></label><p class="gm-mesh-hint">Surpac não informa o CRS de forma confiável. Coordenadas locais devem ser georreferenciadas antes. O datum vertical não é transformado: use cotas compatíveis com o MDT/cava. Limites desta etapa: 128 MB por par, 500 mil triângulos por objeto e 1 milhão no projeto. Não há redução automática da malha.</p><button class="tbtn" id="gmMeshImport">Importar superfícies / sólidos</button> <button class="mini" id="gmMeshCancel" hidden>Cancelar leitura</button><div class="gm-mesh-status" id="gmMeshStatus" role="status"></div></div><div id="gmMeshList" class="gm-mesh-list"></div><div id="gmMeshViewer"></div></div><footer class="gm-mesh-foot"><span class="gm-mesh-hint">No mapa 2D aparece somente a caixa de localização. O corte usa os triângulos originais.</span><button class="tbtn" id="gmMeshSection">Abrir seção geológica</button></footer></section>';
    root.querySelector('.gm-mesh-body>p').innerHTML='Importe o par <b>.dtm + .str/.stx</b> e escolha entre a geometria integral e uma versão simplificada para visualização. Cada corpo terá superfície e vetores no projeto.';
    root.querySelector('.gm-mesh-foot .gm-mesh-hint').textContent='A representação escolhida fica salva no projeto. Camadas simplificadas são de visualização; use os arquivos integrais para cubagem e reservas.';
    root.querySelector('.gm-mesh-form .gm-mesh-hint').textContent='Confirme o CRS dos arquivos; cotas Z não são transformadas. Limites de saída: 128 MB por par, 500 mil triângulos por objeto e 1 milhão no projeto. A redução ocorre somente quando você escolhe Simplificado.';
    document.body.appendChild(root);let disposePreview=null,validated=null,validationSerial=0,pendingValidation=null;
    const $=selector=>root.querySelector(selector);
    $('.gm-mesh-grid').insertAdjacentHTML('afterend','<fieldset class="gm-mesh-representation"><legend>Representação no projeto</legend><label for="gmMeshMode">Importar como</label><select id="gmMeshMode"><option value="integral">Integral — manter todos os triângulos</option><option value="simplified">Simplificado para visualização</option></select><div id="gmMeshDetailBox" hidden><label for="gmMeshDetail">Detalhe a conservar (%)</label><input id="gmMeshDetail" type="number" min="1" max="100" step="1" value="10"><p class="gm-mesh-hint">A porcentagem é uma meta; o resultado pode manter mais triângulos para preservar a forma e as bordas. Nenhum corpo é descartado. Mantenha os arquivos integrais para voltar à versão completa e realizar cálculos.</p></div><label for="gmMeshGroup">Grupo no projeto (opcional)</label><input id="gmMeshGroup" type="text" maxlength="120" placeholder="Geologia"><p class="gm-mesh-hint">Exemplo: Fosfato ou Calcário. Os arquivos de origem não são renomeados nem modificados.</p></fieldset>');
    const importSettings=()=>window.GeoMineMeshSimplification.settings({mode:$('#gmMeshMode').value,detail:$('#gmMeshDetail').value});
    const settingsKey=value=>JSON.stringify({mode:value.mode,detail:value.detail});
    $('#gmMeshDTM').insertAdjacentHTML('afterend','<output id="gmMeshDTMName" class="gm-mesh-filename" for="gmMeshDTM">Nenhum DTM selecionado.</output>');
    $('#gmMeshSTR').insertAdjacentHTML('afterend','<output id="gmMeshSTRName" class="gm-mesh-filename" for="gmMeshSTR">Nenhum STR/STX selecionado.</output>');
    $('.gm-mesh-grid').insertAdjacentHTML('afterend','<div class="gm-mesh-ready" aria-live="polite"><label class="gm-mesh-confirm"><input id="gmMeshReady" type="checkbox" disabled aria-describedby="gmMeshReadyHelp"><span>Arquivos verificados e prontos para importar</span></label><p id="gmMeshReadyHelp">A marcação é automática após ler e verificar o par DTM + STR/STX.</p><div id="gmMeshPairSummary"></div></div>');
    $('#gmMeshImport').disabled=true;
    $('#gmMeshImport').insertAdjacentHTML('beforebegin','<button class="mini" id="gmMeshVerify" disabled>Verificar arquivos novamente</button> ');
    root.querySelector('.gm-mesh-form').insertAdjacentHTML('beforeend','<p class="gm-mesh-hint">O fechamento é verificado pela topologia das faces; auto-interseções globais não são validadas. Malhas abertas ou com topologia inválida são representadas por linhas na seção.</p>');
    if(sharedRoom())root.querySelector('.gm-mesh-form').insertAdjacentHTML('beforeend','<p class="gm-mesh-hint">Sala colaborativa ativa: a importação de novas malhas está disponível somente na cópia local, fora da sala. As malhas existentes seguem no arquivo .ccmgis salvo.</p>');
    const close=()=>{if(busy){setStatus('Cancele ou aguarde a importação antes de fechar.',true);return;}validationSerial++;validated=null;disposePreview?.();root.remove();};
    root.querySelector('[data-close]').onclick=close;
    root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}});
    function setStatus(text,error=false){const el=root.querySelector('#gmMeshStatus');el.textContent=text;el.classList.toggle('error',error);}
    function clearReady(){validated=null;$('#gmMeshReady').checked=false;$('#gmMeshImport').disabled=true;$('#gmMeshPairSummary').textContent='';$('.gm-mesh-ready').classList.remove('ready');}
    function fileName(file,empty){return file?file.name+' · '+(file.size/1024/1024).toLocaleString('pt-BR',{maximumFractionDigits:2})+' MB':empty;}
    function filesChanged(){
      const dtm=$('#gmMeshDTM').files[0],str=$('#gmMeshSTR').files[0];
      $('#gmMeshDTMName').textContent=fileName(dtm,'Nenhum DTM selecionado.');
      $('#gmMeshSTRName').textContent=fileName(str,'Nenhum STR/STX selecionado.');
      return verifyPair();
    }
    async function verifyPair(){
      const serial=++validationSerial,dtm=$('#gmMeshDTM').files[0],str=$('#gmMeshSTR').files[0];clearReady();
      // Invalidate before any asynchronous wait. A late result from the old
      // selection must never mark the replacement files as ready.
      if(pendingValidation){cancelJob?.();try{await pendingValidation;}catch(_){}if(serial!==validationSerial||!root.isConnected)return;}
      $('#gmMeshCancel').hidden=true;
      $('#gmMeshVerify').disabled=!dtm||!str;
      if(!dtm||!str){setStatus(dtm?'DTM selecionado. Escolha o STR/STX correspondente; o nome do DTM permanece acima.':str?'STR/STX selecionado. Escolha o DTM correspondente.':'Selecione o DTM e depois seu STR/STX.');return;}
      $('#gmMeshCancel').hidden=false;$('#gmMeshVerify').disabled=true;
      setStatus('Verificando '+dtm.name+' + '+str.name+'…\nLendo referências dos triângulos e analisando o fechamento do objeto.');
      let settings;try{settings=importSettings();}catch(e){setStatus(e.message,true);$('#gmMeshCancel').hidden=true;return;}
      const promise=validateFiles(dtm,str,{...settings,onProgress:text=>{if(serial===validationSerial&&root.isConnected)setStatus(text);}});pendingValidation=promise;
      try{
        const result=await promise;
        if(serial!==validationSerial||!root.isConnected||dtm!==$('#gmMeshDTM').files[0]||str!==$('#gmMeshSTR').files[0])return;
        if(settingsKey(result.settings)!==settingsKey(importSettings()))return;
        // Same validations used by the final import, without adding a layer.
        result.parsed.meshes.forEach(validateMesh);
        const previousFaces=store().reduce((n,m)=>n+m.faces.length,0),newFaces=result.parsed.meshes.reduce((n,m)=>n+m.faces.length,0);
        if(previousFaces+newFaces>MAX_TOTAL_FACES)throw new Error('O projeto dispõe de '+Math.max(0,MAX_TOTAL_FACES-previousFaces).toLocaleString('pt-BR')+' triângulos para novas malhas. Diminua o detalhe ou importe em outro projeto.');
        validated=result;$('#gmMeshReady').checked=true;$('#gmMeshImport').disabled=false;$('.gm-mesh-ready').classList.add('ready');
        const summaries=result.parsed.meshes.map(m=>m.name+': '+(m.source?.simplification?'visualização simplificada — '+m.source.simplification.originalFaces.toLocaleString('pt-BR')+' → '+m.faces.length.toLocaleString('pt-BR')+' triângulos.':m.topology?.closedSolid?'sólido fechado — seção com contorno e preenchimento.':'malha aberta ou fechamento não confirmado — seção somente com linhas.'));
        $('#gmMeshPairSummary').textContent=summaries.join('\n');
        $('#gmMeshPairSummary').insertAdjacentHTML('beforeend','<p>Nome de cada corpo/unidade (não é inferida uma litologia quando o arquivo não a informa):</p>'+result.parsed.meshes.map((m,i)=>'<label>Objeto '+esc(m.objectId??i+1)+' / triangulação '+esc(m.trisolationId??1)+'<input data-mesh-name="'+i+'" type="text" maxlength="160" value="'+esc(m.trisolationText||m.objectText||m.name)+'"></label>').join(''));
        const warnings=[...(result.parsed.warnings||[]),...result.parsed.meshes.flatMap(m=>(m.topology?.warnings||[]).map(w=>m.name+': '+w))];
        const base=name=>name.replace(/\.(dtm|str|stx)$/i,'').toLocaleLowerCase();
        if(base(dtm.name)!==base(str.name))warnings.unshift('Os nomes-base são diferentes. Confirme que o STR/STX contém as coordenadas deste DTM; os nomes não comprovam o pareamento.');
        setStatus('Par verificado. Confirme o CRS e as unidades abaixo; depois clique em Importar superfícies / sólidos.\n'+warnings.join('\n'));
      }catch(e){if(serial===validationSerial&&root.isConnected){clearReady();setStatus(e.message||String(e),true);}}
      finally{if(pendingValidation===promise)pendingValidation=null;if(serial===validationSerial&&root.isConnected){$('#gmMeshCancel').hidden=true;$('#gmMeshVerify').disabled=!dtm||!str;}}
    }
    $('#gmMeshDTM').onchange=filesChanged;$('#gmMeshSTR').onchange=filesChanged;$('#gmMeshVerify').onclick=verifyPair;
    $('#gmMeshMode').onchange=()=>{$('#gmMeshDetailBox').hidden=$('#gmMeshMode').value!=='simplified';return verifyPair();};
    $('#gmMeshDetail').oninput=()=>{validationSerial++;cancelJob?.();clearReady();$('#gmMeshVerify').disabled=!$('#gmMeshDTM').files[0]||!$('#gmMeshSTR').files[0];setStatus('Detalhe alterado. Verifique os arquivos novamente antes de importar.');};
    $('#gmMeshDetail').onchange=verifyPair;
    function render(){
      const box=root.querySelector('#gmMeshList');box.innerHTML='<h3>Objetos do projeto</h3>';
      const items=list();if(!items.length){box.insertAdjacentHTML('beforeend','<p>Nenhuma malha importada.</p>');return;}
      for(const item of items){
        const row=document.createElement('div');row.className='gm-mesh-row'+(item.id===selectedId?' selected':'');row.dataset.mesh=item.id;
        const t=item.topology,closed=!!(t&&(t.closedSolid??t.closed));
        const ls=views(item),surface=ls.find(l=>l._geology.meshRole==='surface'),vectors=ls.find(l=>l._geology.meshRole==='vectors'),l=proxy(item);
        row.innerHTML='<div class="gm-mesh-row-top"><input type="color" data-color aria-label="Cor da superfície" value="'+validColor(item.color)+'"><input type="text" data-name aria-label="Nome da superfície ou sólido" maxlength="160" value="'+esc(item.name)+'"></div><div class="gm-mesh-roles">'+[['surface',surface,closed?'Sólido':'Superfície'],['vectors',vectors,'Vetores (arestas)']].map(([role,layer,label])=>'<label><input type="checkbox" data-role="'+role+'"'+(layer?.visible!==false&&layer?' checked':'')+(layer?'':' disabled')+'> '+label+(layer?'':' — camada removida')+'</label>').join('')+'</div><small>'+esc(closed?'Sólido fechado':'Superfície / malha aberta')+' · '+item.vertices.length.toLocaleString('pt-BR')+' vértices · '+item.faces.length.toLocaleString('pt-BR')+' triângulos · '+esc(item.crs)+'<br>Cotas: '+item.bounds.min[2].toLocaleString('pt-BR')+' a '+item.bounds.max[2].toLocaleString('pt-BR')+' m</small><label>Opacidade da superfície <input data-opacity type="range" min="0" max="100" step="1" value="'+Math.round((surface?.sym?.opacity??1)*100)+'"'+(surface?'':' disabled')+'></label><div class="gm-mesh-buttons"><button class="mini" data-zoom>Localizar no mapa</button><button class="mini" data-preview>Ver malha 3D</button><button class="mini" data-remove>Remover objeto</button></div>';
        row.querySelector('.gm-mesh-row-top').insertAdjacentHTML('afterbegin','<span class="gm-mesh-name-label">Nome da camada / corpo</span>');
        row.querySelector('.gm-mesh-row-top').insertAdjacentHTML('beforeend','<button class="mini" data-rename>Renomear</button>');
        const applyName=()=>{try{row.querySelector('[data-name]').value=rename(item.id,row.querySelector('[data-name]').value);setStatus('Nome atualizado nas camadas de superfície e vetores.');}catch(e){setStatus(e.message,true);}};
        row.querySelector('[data-rename]').onclick=applyName;
        row.querySelector('[data-name]').onchange=applyName;
        row.querySelector('[data-name]').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();applyName();}};
        if(item.source?.simplification)row.insertAdjacentHTML('beforeend','<p class="gm-mesh-display-note"><b>Visualização simplificada</b> · '+Number(item.source.simplification.originalFaces).toLocaleString('pt-BR')+' → '+item.faces.length.toLocaleString('pt-BR')+' triângulos.<br>Use os arquivos integrais para cubagem e reservas.</p>');
        row.querySelector('[data-color]').onchange=e=>{const m=raw(item.id);m.color=validColor(e.target.value);if(surface){surface.color=m.color;surface.sym.color=m.color;surface.sym.stroke=m.color;drawLayer(surface);}refresh();};
        row.querySelectorAll('[data-role]').forEach(el=>el.onchange=()=>{const v=ls.find(v=>v._geology.meshRole===el.dataset.role);if(v){v.visible=el.checked;drawLayer(v);refresh();}});
        row.querySelector('[data-opacity]').onchange=e=>{if(surface){surface.sym.opacity=Number(e.target.value)/100;drawLayer(surface);refresh();}};
        row.querySelector('[data-zoom]').onclick=()=>{close();switchView('map');fitLayer(l);};
        row.querySelector('[data-remove]').onclick=()=>{if(busy)return;if(!confirm('Remover as duas representações de “'+item.name+'” deste projeto? Os arquivos originais não serão alterados.'))return;ls.forEach(v=>deleteVectorLayer(v));disposePreview?.();disposePreview=null;refresh();render();};
        row.querySelector('[data-preview]').onclick=()=>{disposePreview?.();try{disposePreview=preview(item.id,root.querySelector('#gmMeshViewer'));}catch(e){setStatus(e.message,true);}};
        box.appendChild(row);
      }
    }
    root.querySelector('#gmMeshCancel').onclick=()=>{validationSerial++;clearReady();cancelJob?.();$('#gmMeshCancel').hidden=true;$('#gmMeshVerify').disabled=!$('#gmMeshDTM').files[0]||!$('#gmMeshSTR').files[0];setStatus('Verificação cancelada. Os nomes foram mantidos; clique em Verificar arquivos novamente para retomar.');};
    root.querySelector('#gmMeshImport').onclick=async()=>{
      const btn=root.querySelector('#gmMeshImport');btn.disabled=true;
      try{
        const dtm=$('#gmMeshDTM').files[0],str=$('#gmMeshSTR').files[0];
        if(!validated||validated.dtm!==dtm||validated.str!==str)throw new Error('Aguarde a verificação do par de arquivos antes de importar.');
        if(validated.state!==S.geology){clearReady();throw new Error('O projeto foi trocado. Verifique novamente os arquivos no projeto correto.');}
        if(settingsKey(validated.settings)!==settingsKey(importSettings())){clearReady();throw new Error('A representação foi alterada. Verifique os arquivos novamente.');}
        const names=[...root.querySelectorAll('[data-mesh-name]')].map(el=>el.value.trim());
        const result=commitParsed(validated.parsed,{names,groupName:$('#gmMeshGroup').value,crs:$('#gmMeshCRS').value,unitsConfirmed:$('#gmMeshUnits').checked,dtmName:dtm.name,strName:str.name});
        setStatus(result.meshes.length+' objeto(s) importado(s). Salve o projeto para conservar as malhas.\n'+result.warnings.join('\n'));render();
        // Retain the verified check and filenames, but prevent an accidental
        // second click from duplicating every object. Recheck explicitly to reimport.
        validated=null;
      }catch(e){setStatus(e.message||String(e),true);}finally{btn.disabled=!validated;}
    };
    root.querySelector('#gmMeshSection').onclick=()=>{if(busy)return;close();api.openSection();};render();root.focus();
    if(previewOnOpen)root.querySelector('[data-preview]')?.click();
  }
  function preview(id,host){
    if(typeof THREE==='undefined')throw new Error('Visualizador 3D indisponível.');
    const m=getWorkMesh(id),b=bounds(m.vertices),center=b.min.map((v,i)=>(v+b.max[i])/2),span=Math.max(...b.max.map((v,i)=>v-b.min[i]),1);
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});host.innerHTML='<h3>'+(m.source?.simplification?'Visualização simplificada':'Malha integral')+' · '+esc(m.name)+'</h3><p class="gm-mesh-hint">Arraste para girar; use a roda para aproximar. Sem exagero vertical.</p><div class="gm-mesh-preview"></div>';
    const box=host.querySelector('.gm-mesh-preview');box.appendChild(renderer.domElement);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    const scene=new THREE.Scene();scene.background=new THREE.Color('#e3ebf1');scene.add(new THREE.AmbientLight(0xffffff,.7));
    const sun=new THREE.DirectionalLight(0xffffff,.8);sun.position.set(1,2,3);scene.add(sun);
    const geo=new THREE.BufferGeometry(),pos=new Float32Array(m.vertices.length*3);
    m.vertices.forEach((p,i)=>{pos[i*3]=p[0]-center[0];pos[i*3+1]=p[2]-center[2];pos[i*3+2]=-(p[1]-center[1]);});
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));const idx=new Uint32Array(m.faces.length*3);m.faces.forEach((f,i)=>idx.set(f,i*3));geo.setIndex(new THREE.BufferAttribute(idx,1));geo.computeVertexNormals();
    const mat=new THREE.MeshLambertMaterial({color:validColor(m.color),side:THREE.DoubleSide});const mesh=new THREE.Mesh(geo,mat);scene.add(mesh);
    const cam=new THREE.PerspectiveCamera(45,1,span/10000,span*100),target=new THREE.Vector3();let yaw=.6,pitch=.4,radius=span*1.8,drag=null;
    function draw(){if(!box.isConnected)return;const w=box.clientWidth||600,h=box.clientHeight||400;renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();cam.position.set(radius*Math.cos(pitch)*Math.sin(yaw),radius*Math.sin(pitch),radius*Math.cos(pitch)*Math.cos(yaw));cam.lookAt(target);renderer.render(scene,cam);}
    box.onpointerdown=e=>{drag=[e.clientX,e.clientY];box.setPointerCapture(e.pointerId);};box.onpointerup=box.onpointercancel=()=>drag=null;
    box.onpointermove=e=>{if(!drag)return;yaw-=(e.clientX-drag[0])*.01;pitch=Math.max(-1.5,Math.min(1.5,pitch+(e.clientY-drag[1])*.01));drag=[e.clientX,e.clientY];draw();};
    const wheel=e=>{e.preventDefault();radius=Math.max(span*.05,Math.min(span*25,radius*Math.exp(e.deltaY*.001)));draw();};box.addEventListener('wheel',wheel,{passive:false});
    const observer=new ResizeObserver(draw);observer.observe(box);draw();box.scrollIntoView({block:'nearest'});
    return ()=>{observer.disconnect();geo.dispose();mat.dispose();renderer.dispose();renderer.forceContextLoss();host.innerHTML='';};
  }
  api.meshes={list,getWorkMesh,open,importFiles,rename,restoreLayers,snapshotMeshes:list,limits:{maxBytes:MAX_BYTES,maxFaces:MAX_FACES,maxVertices:MAX_VERTICES,maxTotalFaces:MAX_TOTAL_FACES},__test:{commitParsed,metricCRS,bounds,views,meshWorkerJob,validateFiles}};
})();
