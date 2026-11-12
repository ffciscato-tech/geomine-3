/* GeoMine — importação de sondagens. O leitor/desvio do Varioscape roda em
   worker; só a confirmação após validação cria a camada no projeto. */
(function(){
  'use strict';
  const api=window.GeoMineGeology=window.GeoMineGeology||{},MAX_BYTES=64*1024*1024;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  // Nomes padronizados do banco Varioscape/Surpac, sem correspondência
  // parcial que poderia confundir depth_from com a profundidade do collar.
  const aliases={id:['holeid','bhid','id_furo','furo','hole','borehole','dhid','sondagem','dh','id'],x:['x','easting','east','este','leste','xcollar','utm_e','coord_e','e','e_utm','coordx'],y:['y','northing','north','norte','ycollar','utm_n','coord_n','n','n_utm','coordy'],z:['z','elevation','rl','cota_boca','cota','elev','zcollar','altitude'],depth:['depth','totaldepth','prof_m','profundidade','eoh','maxdepth','prof','td','length','comprimento'],az:['az','azimuth','azimute','bearing','azim','brg','rumo'],dip:['dip','inclination','inclinacao','mergulho','incl','plunge'],md:['at','md','depth','profundidade','depth_m','prof','distancia'],from:['from','de','de_m','from_m','depth_from','prof_de','inicio','start'],to:['to','ate','ate_m','to_m','depth_to','prof_ate','fim','end'],lithology:['lithology','lith','litho','litologia','lito','rock','geology','descricao'],recovery:['recovery','rec_pct','recuperacao','rec'],rqd:['rqd','rqd_pct']};
  const labels={id:'Código do furo',x:'X / Leste (m)',y:'Y / Norte (m)',z:'Cota da boca (m)',depth:'Profundidade final (m)',az:'Azimute (°)',dip:'Inclinação (°)',md:'Profundidade medida / MD (m)',from:'De (m)',to:'Até (m)',lithology:'Litologia / descrição',recovery:'Recuperação (%)',rqd:'RQD (%)'};
  const roleFields={collar:['id','x','y','z','depth','az','dip'],survey:['id','md','az','dip'],lithology:['id','from','to','lithology'],drill:['id','from','to','lithology'],assay:['id','from','to'],core:['id','from','to','lithology','recovery','rqd']};
  const roleNames={collar:'Collar — bocas dos furos',survey:'Survey — desvio / orientação',drill:'Drill — intervalos geológicos',lithology:'Litologia — intervalos',assay:'Análises — intervalos e atributos',core:'Testemunhos — recuperação / RQD',ignore:'Não importar esta tabela'};
  function requireLocal(){if(window.GeoMineCollaboration?.snapshot?.().roomId)throw new Error('Importe sondagens na cópia local, fora da sala colaborativa. Salve o projeto para compartilhar os traços e tabelas completos.');}
  function metricCRS(code){
    let p;try{p=new proj4.Proj(code);}catch(_){throw new Error('Selecione um CRS projetado conhecido.');}
    if(!code||p.projName==='longlat'||(p.units&&p.units!=='m')||(p.to_meter!=null&&Math.abs(p.to_meter-1)>1e-12))throw new Error('Use um CRS projetado em metros. Converta coordenadas em graus, pés ou locais antes de importar.');
    return code;
  }
  function checkFiles(files,mode){
    if(!files.length)throw new Error(mode==='str'?'Escolha uma string .str ou .stx.':'Escolha os CSVs de collar e, se disponíveis, survey e intervalos.');
    if(files.length>20||files.reduce((n,f)=>n+f.size,0)>MAX_BYTES)throw new Error('Limite por importação: 20 arquivos e 64 MB. Divida o conjunto em lotes.');
    if(files.some(f=>!(mode==='str'?/\.(str|stx)$/i:/\.(csv|tsv|txt)$/i).test(f.name)))throw new Error('Extensão incompatível com o modo de importação escolhido.');
  }
  function read(file,job){return new Promise((resolve,reject)=>{
    const reader=new FileReader();let done=false;
    const timer=setTimeout(()=>finish(new Error('A leitura demorou mais de 2 minutos. Baixe uma cópia local do arquivo e tente novamente.')),120000);
    function abort(){finish(new Error('Leitura cancelada; nenhuma sondagem foi adicionada.'));}
    function finish(error,value){if(done)return;done=true;clearTimeout(timer);job.aborts.delete(abort);reader.onload=reader.onerror=reader.onabort=null;if(reader.readyState===1)reader.abort();error?reject(error):resolve(value);}
    job.aborts.add(abort);reader.onload=()=>finish(null,reader.result);reader.onabort=abort;
    reader.onerror=()=>finish(new Error('Não foi possível ler '+file.name+'. Baixe uma cópia local e tente novamente.'));
    try{reader.readAsArrayBuffer(file);}catch(e){finish(e);}
  });}
  function workerTask(payload,job){return new Promise((resolve,reject)=>{
    const source=['geomine-surpac-reader-module','geomine-borehole-reader-module'].map(id=>document.getElementById(id)?.textContent);
    if(source.some(s=>!s)||typeof Worker!=='function'){reject(new Error('Leitor de sondagens indisponível. Reabra o aplicativo atualizado.'));return;}
    const script='self.window=self;\n'+source.join('\n')+'\nself.onmessage=e=>{try{const d=e.data;let result;if(d.task==="csv")result=d.files.map(f=>{let text;try{text=new TextDecoder("utf-8",{fatal:true}).decode(f.buffer);}catch(_){text=new TextDecoder("windows-1252").decode(f.buffer);}return {name:f.name,table:GeoMineBoreholeReader.parseCSV(text,{delimiter:d.delimiter||undefined})};});else if(d.task==="build")result=GeoMineBoreholeReader.buildCSV(d.config);else result=GeoMineBoreholeReader.buildSTR(d.buffer,d.options);self.postMessage({result});}catch(e){self.postMessage({error:e.message||String(e)});}};';
    const url=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));let w,done=false,timer;
    function abort(){finish(new Error('Leitura cancelada; nenhuma sondagem foi adicionada.'));}
    function finish(error,value){if(done)return;done=true;clearTimeout(timer);job.aborts.delete(abort);w?.terminate();URL.revokeObjectURL(url);error?reject(error):resolve(value);}
    try{w=new Worker(url);w.onmessage=e=>finish(e.data.error?new Error(e.data.error):null,e.data.result);w.onerror=e=>finish(new Error('Leitor: '+(e.message||'leitura interrompida')));timer=setTimeout(()=>finish(new Error('A validação excedeu 2 minutos. Divida o conjunto em lotes.')),120000);job.aborts.add(abort);const transfer=payload.task==='csv'?payload.files.map(f=>f.buffer):payload.task==='str'?[payload.buffer]:[];w.postMessage(payload,transfer);}
    catch(e){finish(e);}
  });}
  function commitParsed(parsed,options){
    requireLocal();metricCRS(options.crs);
    if(!options.unitsConfirmed)throw new Error('Confirme o CRS e as unidades em metros.');
    if(!Array.isArray(parsed?.holes)||!parsed.holes.length)throw new Error('Nenhum furo válido encontrado.');
    const limits=window.GeoMineBoreholeReader.limits,ids=new Set();let totalPoints=0;
    if(parsed.holes.length>limits.holes)throw new Error('Quantidade de furos acima do limite seguro. Divida a campanha.');
    const features=parsed.holes.map(h=>{
      const invalid=()=>{throw new Error('Furo ou trajetória inválida: '+(h.id||'sem ID')+'. Valide os arquivos novamente.');};
      const collarOnly=h.source?.method==='collar-only'&&h.depth===null&&Array.isArray(h.trace)&&h.trace.length===1;
      if(typeof h.id!=='string'||!h.id.trim()||ids.has(h.id)||!Array.isArray(h.collar)||h.collar.length!==3||!h.collar.every(Number.isFinite)||!collarOnly&&(!Number.isFinite(h.depth)||!(h.depth>0)||!Array.isArray(h.trace)||h.trace.length<2))invalid();
      if(collarOnly&&((h.geologyLog||[]).length||(h.coreRuns||[]).length||(h.tables||[]).some(t=>t.intervals?.length)||(h.survey||[]).some(s=>s.md!==0)))invalid();
      ids.add(h.id);totalPoints+=h.trace.length;
      if(h.trace.length>limits.tracePerHole||totalPoints>limits.traceTotal)throw new Error('Quantidade de pontos da trajetória acima do limite seguro. Divida a campanha.');
      let previous=-1;for(const p of h.trace){if(!p||![p.x,p.y,p.z,p.md].every(Number.isFinite)||p.md<0||p.md<=previous)invalid();previous=p.md;}
      const start=h.trace[0],end=h.trace[h.trace.length-1];
      if(start.md!==0||!collarOnly&&Math.abs(end.md-h.depth)>1e-6||Math.hypot(start.x-h.collar[0],start.y-h.collar[1],start.z-h.collar[2])>1e-6)invalid();
      return {geom:[[h.collar[0],h.collar[1]]],zg:[h.collar[2]],props:{...(h.attributes||{}),ID_FURO:h.id,COTA_BOCA:h.collar[2],PROF_M:h.depth,AZIMUTE:h.survey?.[0]?.az??null,INCLINACAO:h.survey?.[0]?.dip??null},
        boreholeTrace:h.trace,boreholeSurvey:h.survey||[],boreholeSource:{...(h.source||{}),format:options.mode==='str'?'surpac-string':'csv-tables',files:options.files||[],importedAt:new Date().toISOString(),dipConvention:options.dipConvention||null,depthBasis:collarOnly?'unknown':options.mode==='str'?'string-length':'measured-depth',collarAttributes:h.attributes||{}},
        boreholeTables:h.tables||[],geologyLog:h.geologyLog||[],coreRuns:h.coreRuns||[]};
    });
    const fields=[{name:'ID_FURO',type:'C',length:160},{name:'COTA_BOCA',type:'N',length:20,decimal:3},{name:'PROF_M',type:'N',length:20,decimal:3},{name:'AZIMUTE',type:'N',length:12,decimal:3},{name:'INCLINACAO',type:'N',length:12,decimal:3}];
    const names=new Set(fields.map(f=>f.name));for(const f of features)for(const key of Object.keys(f.props))if(!names.has(key)){names.add(key);fields.push({name:key,type:'C',length:254});}
    const before=new Set(S.layers),active=S.activeId,groupsBefore=S.groups.slice(),stackBefore=(S.stack||[]).slice();let layer;
    try{
      layer=addLayer({name:options.name?.trim()||'Sondagens importadas',gtype:'point',crs:options.crs,features,fields,color:'#478c77',labelField:'ID_FURO',lbl:{onMap:true,unique:false},src:{name:(options.files||[]).join(' + ')}});
      api.applyPreset(layer,api.presets.sondagem,'sondagem');layer.fields=fields;layer.groupId=api.ensureGroup().id;
      layer._geology.importedBoreholes=true;layer.locked=true;layer.labelField='ID_FURO';layer.lbl.onMap=true;
      drawLayer(layer);if(S.geology?.section)S.geology.section.result=null;
      refreshUI();api.refresh?.();return layer;
    }catch(e){
      for(const l of S.layers.filter(l=>!before.has(l))){try{if(l.llayer)map.removeLayer(l.llayer);}catch(_){}S.layers=S.layers.filter(x=>x!==l);}
      S.activeId=active;S.groups=groupsBefore;S.stack=stackBefore;try{refreshUI();}catch(_){}throw e;
    }
  }
  function guessedRole(name,index){const n=norm(name);return /collar|colar|boca/.test(n)?'collar':/survey|survei|desvio/.test(n)?'survey':/assay|analise|teor/.test(n)?'assay':/core|rqd|testemunh/.test(n)?'core':/lith|lito/.test(n)?'lithology':/drill|geol|interval/.test(n)?'drill':index===0?'collar':'drill';}
  function guess(columns,key){for(const a of aliases[key]||[]){const i=columns.findIndex(c=>norm(c)===norm(a));if(i>=0)return columns[i];}return '';}
  function open(initialMode='csv'){
    if(document.getElementById('gmBoreholeModal')){document.getElementById('gmBoreholeModal').focus();return;}
    api.state();let mode=initialMode==='str'?'str':'csv',tables=[],csvFiles=[],fileSerial=0,preview=null,projectState=S.geology,job=null,lastLayer=null,dispose3D=null,revision=0,imported=false;
    const root=document.createElement('div');root.id='gmBoreholeModal';root.className='gm-bh-backdrop';root.tabIndex=-1;
    const crs=Object.entries(typeof CRS_LABELS==='object'?CRS_LABELS:{}).filter(([c])=>{try{metricCRS(c);return true;}catch(_){return false;}});
    root.innerHTML='<section class="gm-bh-modal" role="dialog" aria-modal="true" aria-labelledby="gmBHHeading"><header><h2 id="gmBHHeading">Importar furos de sondagem</h2><button class="tbtn" data-close>Fechar</button></header><div class="gm-bh-body"><div class="gm-bh-tabs"><button class="tbtn" data-mode="csv">Tabelas CSV</button><button class="tbtn" data-mode="str">Strings Surpac</button></div><p id="gmBHHelp"></p><div class="gm-bh-grid"><label>Nome da camada<input id="gmBHName" value="Sondagens importadas" maxlength="160"></label><label>Sistema de coordenadas dos arquivos<select id="gmBHCRS">'+crs.map(([c,n])=>'<option value="'+esc(c)+'"'+(c===S.workCRS?' selected':'')+'>'+esc(n)+' · '+esc(c)+'</option>').join('')+'</select></label></div><label class="gm-bh-check"><input type="checkbox" id="gmBHUnits">Confirmo o CRS e que coordenadas, cotas e profundidades estão em metros.</label><p class="gm-bh-hint">O datum vertical não é transformado: use cotas compatíveis com o MDT e a cava. Os arquivos originais não serão alterados.</p><label id="gmBHFilesLabel">Arquivos<input type="file" id="gmBHFiles" multiple></label><div id="gmBHCSVOptions"><div class="gm-bh-grid"><label>Separador CSV<select id="gmBHDelimiter"><option value="">Detectar automaticamente</option><option value=";">Ponto e vírgula (;)</option><option value=",">Vírgula (,)</option><option value="tab">Tabulação</option></select></label><label>Convenção da inclinação<select id="gmBHDip"><option value="down">90° = vertical para baixo; 0° = horizontal</option><option value="negative-down">−90° = vertical para baixo; 0° = horizontal</option><option value="zenith">0° = vertical para baixo; 90° = horizontal</option></select></label></div><label class="gm-bh-check"><input type="checkbox" id="gmBHVertical">Sem survey nem orientação no collar: considerar os furos verticais.</label><p class="gm-bh-hint">Azimute: 0° = norte, 90° = leste, sentido horário. Survey usa profundidade medida ao longo do furo. Confira a convenção do seu banco; ela não é deduzida automaticamente.</p><button class="mini" id="gmBHRead">Ler tabelas e conferir colunas</button><button class="mini" id="gmBHExample">Baixar modelos CSV</button></div><div id="gmBHSTROptions"><div class="gm-bh-grid"><label>Boca do furo<select id="gmBHDirection"><option value="first">Primeiro vértice de cada string</option><option value="last">Último vértice — inverter a string</option></select></label><label>Código do furo<select id="gmBHID"><option value="description">Descrição da string</option><option value="number">Número da string</option></select></label></div><p class="gm-bh-hint">Cada string contínua deve representar um furo completo, em XYZ. A profundidade será o comprimento 3D da string, não uma medida original de survey. Se não houver descrições únicas, escolha os números.</p></div><div id="gmBHTables"></div><div id="gmBHStatus" role="status"></div><div id="gmBHPreview"></div><div id="gmBHViewer"></div></div><footer><button class="tbtn" id="gmBHValidate">Validar e visualizar</button><button class="mini" id="gmBHCancel" hidden>Cancelar leitura</button><button class="tbtn" id="gmBHCommit" disabled>Importar no projeto</button><button class="mini" id="gmBHSection" hidden>Abrir seção geológica</button></footer></section>';
    document.body.appendChild(root);const $=s=>root.querySelector(s);
    $('footer').insertAdjacentHTML('afterbegin','<div id="gmBHActionStatus" role="status" aria-live="polite" aria-atomic="true"></div>');
    $('#gmBHCommit').setAttribute('aria-describedby','gmBHActionStatus');
    $('#gmBHFilesLabel').insertAdjacentHTML('beforebegin','<section id="gmBHCSVPickers"><h3>1. Escolha as tabelas da mesma campanha</h3><p>Adicione uma tabela de cada vez. Escolher survey ou litho não remove o collar já escolhido. Os arquivos serão cruzados pelo código do furo, não pela ordem das linhas.</p><div class="gm-bh-role-pickers">'+[
      ['collar','Collar · obrigatório','Código e coordenadas da boca; profundidade quando conhecida.'],
      ['survey','Survey · opcional','Profundidade medida, azimute e inclinação.'],
      ['lithology','Litho / Drill · opcional','Intervalos De–Até e litologia.'],
      ['assay','Assay · opcional','Intervalos e resultados de análises.'],
      ['core','Testemunhos · opcional','Intervalos, recuperação e RQD.']
    ].map(([role,label,hint])=>'<label class="gm-bh-role-picker" for="gmBHFile-'+role+'"><strong>'+label+'</strong><span>'+hint+'</span><input type="file" id="gmBHFile-'+role+'" data-csv-role="'+role+'" aria-label="Escolher '+label+' em CSV, TSV ou TXT"'+(['collar','survey'].includes(role)?'':' multiple')+'><output data-role-status="'+role+'">Nenhum arquivo escolhido.</output></label>').join('')+'</div></section>');
    $('#gmBHFilesLabel').insertAdjacentHTML('afterend','<div id="gmBHFileNames" class="gm-bh-files" aria-live="polite">Nenhum arquivo selecionado.</div>');
    const fileLabel=f=>f.name+' · '+(f.size<1024?f.size+' bytes':(f.size/1024).toLocaleString('pt-BR',{maximumFractionDigits:1})+' KB');
    function rememberMappings(){for(const t of tables){const entry=csvFiles.find(e=>e.id===t.fileId);if(entry){entry.role=t.role;entry.map={...t.map};}}}
    function clearTables(){rememberMappings();tables=[];$('#gmBHTables').innerHTML='';}
    function fileNames(){
      const out=$('#gmBHFileNames');
      if(mode==='str'){const files=[...$('#gmBHFiles').files];out.textContent=files.length?files.map(fileLabel).join('\n'):'Nenhum arquivo selecionado.';return;}
      out.innerHTML=csvFiles.length?csvFiles.map(e=>'<div class="gm-bh-selected-file" data-csv-file="'+e.id+'"><span><b>'+esc(roleNames[e.role]||e.role)+'</b><br>'+esc(fileLabel(e.file))+'</span><button type="button" class="mini" data-remove-csv="'+e.id+'" aria-label="Remover '+esc(e.file.name)+'">Remover</button></div>').join(''):'Nenhum arquivo selecionado.';
      out.querySelectorAll('[data-remove-csv]').forEach(b=>b.onclick=()=>{if(job)return;clearTables();csvFiles=csvFiles.filter(e=>String(e.id)!==b.dataset.removeCsv);invalidate();fileNames();status('Arquivo removido da seleção. Confira e valide novamente as tabelas restantes.');});
      root.querySelectorAll('[data-role-status]').forEach(el=>{const role=el.dataset.roleStatus,entries=csvFiles.filter(e=>e.role===role||role==='lithology'&&e.role==='drill');el.textContent=entries.length?entries.map(e=>e.file.name).join('\n'):'Nenhum arquivo escolhido.';});
    }
    function addCSV(files,role){
      if(job||!files.length)return;
      try{
        checkFiles(files,'csv');rememberMappings();
        const single=['collar','survey'].includes(role),next=csvFiles.filter(e=>!single||e.role!==role).map(e=>({...e,map:{...e.map}}));
        for(const file of files){
          const key=[file.name,file.size,file.lastModified].join('\u0000'),existing=next.find(e=>e.key===key);
          if(existing){if(role&&existing.role!==role){existing.role=role;existing.map={};}continue;}
          next.push({id:++fileSerial,key,file,role:role||guessedRole(file.name,next.length),map:{}});
        }
        checkFiles(next.map(e=>e.file),'csv');csvFiles=next;tables=[];$('#gmBHTables').innerHTML='';invalidate();fileNames();
        status(csvFiles.length+' tabela(s) selecionada(s). As escolhas anteriores foram mantidas. Clique em “Ler tabelas e conferir colunas”.');
      }catch(e){status(e.message,true);}
    }
    function status(message,error=false){
      $('#gmBHStatus').textContent=message;$('#gmBHStatus').classList.toggle('error',error);
      const footer=$('#gmBHActionStatus');footer.textContent=(error?'Atenção: ':'')+String(message||'Escolha os arquivos. Importar inicia a validação; os furos só serão adicionados após sua confirmação.').split('\n')[0];footer.classList.toggle('error',error);
      if(error)reveal('#gmBHStatus');
    }
    function reveal(selector,focus=false){const el=$(selector);if(!el||!root.isConnected)return;el.scrollIntoView({block:'nearest'});if(focus)el.focus({preventScroll:true});}
    function syncAction(){
      const button=$('#gmBHCommit');button.disabled=!!job||imported;
      button.dataset.state=job?'busy':imported?'imported':preview?'ready':'idle';
      button.textContent=job?'Validando…':imported?'Importado':preview?'Confirmar importação ('+preview.holes.length+')':'Importar no projeto';
      button.title=imported?'Estes furos já foram importados':preview?'Adicionar os furos validados ao projeto':'Validar os arquivos e mostrar a prévia antes de confirmar a importação';
    }
    function invalidate(announce=false){
      preview=null;revision++;imported=false;$('#gmBHPreview').innerHTML='';dispose3D?.();dispose3D=null;$('#gmBHViewer').innerHTML='';$('#gmBHSection').hidden=true;syncAction();
      if(announce)status('Configuração alterada. Clique em “Importar no projeto” ou “Validar e visualizar” para conferir novamente. Nenhum furo foi adicionado.');
    }
    function cancel(){if(!job)return;job.cancelled=true;for(const fn of [...job.aborts])fn();}
    function close(){cancel();dispose3D?.();root.remove();}
    $('[data-close]').onclick=close;root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}});$('#gmBHCancel').onclick=cancel;
    function setMode(next){
      if(job)return;mode=next;tables=[];csvFiles=[];invalidate();
      const input=$('#gmBHFiles');input.value='';fileNames();$('#gmBHTables').innerHTML='';
      root.querySelectorAll('[data-csv-role]').forEach(el=>{el.value='';el.removeAttribute('accept');el.removeAttribute('capture');});
      $('#gmBHCSVPickers').hidden=mode!=='csv';$('#gmBHCSVOptions').hidden=mode!=='csv';$('#gmBHSTROptions').hidden=mode!=='str';
      // Um CSV pode ser anunciado pelo Files/Drive como texto, planilha ou
      // binário. Não usar accept no modo de tabelas: o filtro nativo pode
      // ocultar arquivos válidos. checkFiles e o leitor validam depois.
      if(mode==='str')input.setAttribute('accept','.str,.stx');
      else input.removeAttribute('accept');
      input.removeAttribute('capture');input.multiple=mode==='csv';
      input.setAttribute('aria-label',mode==='csv'?'Escolher tabelas CSV, TSV ou TXT':'Escolher string STR ou STX');
      $('#gmBHFilesLabel').firstChild.textContent=mode==='csv'?'Ou adicionar vários arquivos CSV, TSV ou TXT juntos':'Arquivo STR ou STX';
      $('#gmBHHelp').textContent=mode==='str'?'Importe trajetórias 3D já calculadas no Surpac, sem converter os furos para MDT.':'Escolha collar, survey e litho em caixas separadas, ou adicione vários arquivos juntos. As tabelas formam uma única campanha de furos. Confira as colunas e valide para visualizar as trajetórias e litologias em 3D. Somente collar é obrigatório.';
      root.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));status('');
    }
    root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
    root.addEventListener('change',e=>{
      if(e.target.closest('#gmBHViewer'))return;
      // O nome é metadado: renomear não muda os arquivos nem as trajetórias.
      // Invalidar no blur também impedia o clique seguinte em Importar.
      if(e.target.id==='gmBHName')return;
      if(e.target.dataset.csvRole){addCSV([...e.target.files],e.target.dataset.csvRole);e.target.value='';return;}
      if(e.target.id==='gmBHFiles'&&mode==='csv'){addCSV([...e.target.files]);return;}
      invalidate(true);if(e.target.id==='gmBHFiles'||e.target.id==='gmBHDelimiter'){clearTables();fileNames();}
    });
    async function run(task){
      if(job)return;requireLocal();projectState=S.geology;job={aborts:new Set(),cancelled:false,revision};const current=job;
      const controls=[...root.querySelectorAll('input,select,button')].filter(e=>!e.matches('[data-close],#gmBHCancel'));const disabled=controls.map(e=>e.disabled);controls.forEach(e=>e.disabled=true);$('#gmBHCancel').hidden=false;
      syncAction();
      try{const value=await task(current);if(current.cancelled||!root.isConnected)throw new Error('Importação cancelada.');if(projectState!==S.geology)throw new Error('O projeto mudou durante a leitura. Valide novamente no projeto correto.');if(current.revision!==revision)throw new Error('A configuração mudou durante a leitura. Valide novamente antes de importar.');return value;}
      finally{current.aborts.forEach(fn=>fn());job=null;controls.forEach((e,i)=>e.disabled=disabled[i]);root.querySelectorAll('.gm-bh-table select').forEach(e=>e.disabled=false);$('#gmBHCancel').hidden=true;syncAction();}
    }
    function renderTables(){
      const host=$('#gmBHTables');host.innerHTML='';tables.forEach((entry,index)=>{
        const box=document.createElement('section');box.className='gm-bh-table';box.innerHTML='<h3>'+esc(entry.name)+' <small>· '+entry.table.rows.length+' linhas</small></h3><label>Função da tabela<select data-role>'+Object.entries(roleNames).map(([v,n])=>'<option value="'+v+'"'+(entry.role===v?' selected':'')+'>'+n+'</option>').join('')+'</select></label><div class="gm-bh-map"></div><details><summary>Amostra dos dados (5 primeiras linhas)</summary><div class="gm-bh-data"><table><thead><tr>'+entry.table.columns.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+entry.table.rows.slice(0,5).map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details>';
        const fields=()=>{const map=box.querySelector('.gm-bh-map');map.innerHTML='';for(const key of roleFields[entry.role]||[]){const label=document.createElement('label');label.textContent=labels[key];const select=document.createElement('select');select.dataset.map=key;select.innerHTML='<option value="">— não informada —</option>'+entry.table.columns.map(c=>'<option value="'+esc(c)+'">'+esc(c)+'</option>').join('');if(entry.map[key]==null)entry.map[key]=guess(entry.table.columns,key);select.value=entry.map[key]||'';select.onchange=()=>{entry.map[key]=select.value;invalidate();};label.append(select);map.append(label);}};
        box.querySelector('[data-role]').onchange=e=>{entry.role=e.target.value;fields();rememberMappings();fileNames();invalidate();};host.append(box);fields();
      });
      if(job)host.querySelectorAll('select').forEach(el=>el.disabled=true);
    }
    async function loadCSV(current){
      rememberMappings();const entries=csvFiles.slice(),files=entries.map(e=>e.file);checkFiles(files,'csv');status('Lendo tabelas…');
      const buffers=[];for(const f of files){if(current.cancelled)throw new Error('Leitura cancelada.');buffers.push({name:f.name,buffer:await read(f,current)});}
      const delimiter=$('#gmBHDelimiter').value;
      const result=await workerTask({task:'csv',files:buffers,delimiter:delimiter==='tab'?'\t':delimiter},current);
      if(current.cancelled||projectState!==S.geology)throw new Error('Leitura interrompida ou projeto trocado.');
      tables=result.map((t,i)=>({...t,fileId:entries[i].id,role:entries[i].role,map:{...entries[i].map}}));renderTables();status('Tabelas lidas em conjunto. Confira as funções, colunas e a convenção de inclinação; depois valide para conferir em 3D.');
    }
    $('#gmBHRead').onclick=async()=>{if(job)return;invalidate();try{await run(loadCSV);}catch(e){status(e.message,true);}};
    async function validate(){
      if(job)return;
      invalidate();try{
        const result=await run(async current=>{
          try{metricCRS($('#gmBHCRS').value);}catch(e){e.field='#gmBHCRS';throw e;}
          if(!$('#gmBHUnits').checked){const e=new Error('Confirme o CRS e as unidades em metros antes de validar.');e.field='#gmBHUnits';throw e;}
          status('Validando furos e calculando trajetórias…');
          if(mode==='str'){const files=[...$('#gmBHFiles').files];checkFiles(files,mode);return workerTask({task:'str',buffer:await read(files[0],current),options:{reverse:$('#gmBHDirection').value==='last',idMode:$('#gmBHID').value}},current);}
          if(!tables.length)await loadCSV(current);
          status('Validando colunas, intervalos e trajetórias…');
          const collar=tables.filter(t=>t.role==='collar'),survey=tables.filter(t=>t.role==='survey');
          if(collar.length!==1||survey.length>1)throw new Error('Defina exatamente uma tabela collar e no máximo uma tabela survey.');
          const table=t=>({table:t.table,map:Object.fromEntries((roleFields[t.role]||[]).map(key=>[key,t.map[key]||''])),name:t.name,role:t.role});
          return workerTask({task:'build',config:{collar:table(collar[0]),survey:survey[0]?table(survey[0]):undefined,intervals:tables.filter(t=>!['collar','survey','ignore'].includes(t.role)).map(table),dipConvention:$('#gmBHDip').value,allowVertical:$('#gmBHVertical').checked}},current);
        });
        if(!result||!root.isConnected)return;preview=result;
        $('#gmBHPreview').innerHTML='<h3>'+result.holes.length+' furo(s) prontos para importar</h3><div class="gm-bh-data"><table><thead><tr><th>Furo</th><th>Cota da boca (m)</th><th>Profundidade (m)</th><th>Estações survey</th><th>Intervalos litológicos</th><th>Intervalos assay / análises</th></tr></thead><tbody>'+result.holes.slice(0,100).map(h=>'<tr><td>'+esc(h.id)+'</td><td>'+esc(h.collar[2].toFixed(3))+'</td><td>'+esc(h.depth==null?'Não informada · somente boca':h.depth.toFixed(3))+'</td><td>'+(h.survey?.length||0)+'</td><td>'+(h.geologyLog?.length||0)+'</td><td>'+(h.tables||[]).filter(t=>t.role==='assay').reduce((n,t)=>n+(t.intervals?.length||0),0)+'</td></tr>').join('')+'</tbody></table></div>'+(result.holes.length>100?'<p>Amostra de 100 furos; todos serão importados.</p>':'')+'<p class="gm-bh-hint">Collar define a boca; survey define a trajetória; litho/drill define os intervalos geológicos. Assay preserva teores e atributos de análise, sem convertê-los em litologia. Sem profundidade, é importada somente a boca.</p><button class="mini" id="gmBHView3D">Conferir trajetórias em 3D</button>';
        $('#gmBHView3D').onclick=()=>{dispose3D?.();try{dispose3D=preview3D(preview,$('#gmBHViewer'));}catch(e){status(e.message,true);}};
        status('Validação concluída: '+result.holes.length+' furo(s). Confira a prévia e clique em “Confirmar importação”. Nenhum furo foi adicionado ainda.\n'+(result.warnings||[]).join('\n'));syncAction();
        $('#gmBHView3D').click();
        reveal('#gmBHPreview');
      }catch(e){invalidate();status(e.message||String(e),true);if(e.field)reveal(e.field,true);}
    }
    $('#gmBHValidate').onclick=validate;
    $('#gmBHCommit').onclick=async event=>{
      if(job||imported||event?.detail>1)return;
      // A ação nunca é um clique sem resposta: primeiro valida e apresenta
      // a prévia. A camada só é criada no próximo clique de confirmação.
      if(!preview){await validate();return;}
      try{
      if(projectState!==S.geology){invalidate();throw new Error('O projeto mudou. Valide novamente os furos neste projeto antes de confirmar.');}
      lastLayer=commitParsed(preview,{crs:$('#gmBHCRS').value,unitsConfirmed:$('#gmBHUnits').checked,name:$('#gmBHName').value,mode,files:mode==='csv'?tables.filter(t=>t.role!=='ignore').map(t=>t.name):[...$('#gmBHFiles').files].map(f=>f.name),dipConvention:$('#gmBHDip').value});
      const count=preview.holes.length;imported=true;syncAction();status(count+' furo(s) importado(s) no grupo Geologia. Salve o projeto para conservar trajetórias e tabelas. Os pontos representam as bocas; a seção usa o traço 3D completo. A geometria importada fica protegida contra deslocamentos acidentais.');$('#gmBHSection').hidden=false;reveal('#gmBHStatus');
    }catch(e){status(e.message,true);}};
    $('#gmBHSection').onclick=()=>{
      if(projectState!==S.geology||!lastLayer||!S.layers.includes(lastLayer)){
        status('O projeto mudou ou a camada foi removida. Abra a seção no projeto que contém estes furos.',true);return;
      }
      S.activeId=lastLayer.id;api.includeBoreholeLayer?.(lastLayer);
      close();api.openSection();
    };
    $('#gmBHExample').onclick=()=>{const samples={collar:'HOLEID;X;Y;Z;DEPTH\nF01;583000;7074000;300;100\n',survey:'HOLEID;MD;AZIMUTH;DIP\nF01;0;90;60\nF01;100;100;70\n',drill:'HOLEID;FROM;TO;LITHOLOGY\nF01;0;40;Calcario\nF01;40;100;Filito\n'};for(const [name,text] of Object.entries(samples)){const url=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='modelo_'+name+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}status('Modelos de exemplo: use as suas coordenadas e confirme o CRS. Inclinação do exemplo: 90° para baixo.');};
    setMode(mode);root.focus();
  }
  function preview3D(parsed,host){
    if(api.boreholePreview)return api.boreholePreview.open(parsed,host);
    if(typeof THREE==='undefined')throw new Error('Visualizador 3D indisponível.');
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const h of parsed.holes)for(const p of h.trace){[p.x,p.y,p.z].forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v);});}
    const c=min.map((v,i)=>(v+max[i])/2),span=Math.max(...max.map((v,i)=>v-min[i]),1);
    host.innerHTML='<h3>Trajetórias 3D · sem exagero vertical</h3><p class="gm-bh-hint">Pontos laranja = bocas. Arraste para girar; roda do mouse para aproximar. A prévia não altera o projeto.</p><div class="gm-bh-3d"></div>';
    const box=host.querySelector('.gm-bh-3d'),renderer=new THREE.WebGLRenderer({antialias:true}),scene=new THREE.Scene();scene.background=new THREE.Color('#e3ebf1');box.append(renderer.domElement);renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
    const positions=[],collars=[];for(const h of parsed.holes){const cv=p=>[p.x-c[0],p.z-c[2],-(p.y-c[1])];collars.push(...cv(h.trace[0]));for(let i=1;i<h.trace.length;i++)positions.push(...cv(h.trace[i-1]),...cv(h.trace[i]));}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(positions),3));const mat=new THREE.LineBasicMaterial({color:'#257a71'});scene.add(new THREE.LineSegments(geo,mat));
    const cg=new THREE.BufferGeometry();cg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(collars),3));const cm=new THREE.PointsMaterial({color:'#f5a524',size:7,sizeAttenuation:false});scene.add(new THREE.Points(cg,cm));
    const axes=new THREE.AxesHelper(span*.25);scene.add(axes);const camera=new THREE.PerspectiveCamera(45,1,span/10000,span*100);let yaw=.65,pitch=.35,radius=span*1.8,drag=null;
    function draw(){if(!box.isConnected)return;const w=box.clientWidth||600,h=box.clientHeight||350;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();camera.position.set(radius*Math.cos(pitch)*Math.sin(yaw),radius*Math.sin(pitch),radius*Math.cos(pitch)*Math.cos(yaw));camera.lookAt(new THREE.Vector3());renderer.render(scene,camera);}
    box.onpointerdown=e=>{drag=[e.clientX,e.clientY];box.setPointerCapture(e.pointerId);};box.onpointerup=box.onpointercancel=()=>drag=null;box.onpointermove=e=>{if(!drag)return;yaw-=(e.clientX-drag[0])*.01;pitch=Math.max(-1.5,Math.min(1.5,pitch+(e.clientY-drag[1])*.01));drag=[e.clientX,e.clientY];draw();};box.addEventListener('wheel',e=>{e.preventDefault();radius=Math.max(span*.05,Math.min(span*25,radius*Math.exp(e.deltaY*.001)));draw();},{passive:false});const observer=new ResizeObserver(draw);observer.observe(box);draw();
    return ()=>{observer.disconnect();geo.dispose();mat.dispose();cg.dispose();cm.dispose();axes.geometry.dispose();axes.material.dispose();renderer.dispose();renderer.forceContextLoss();host.innerHTML='';};
  }
  api.boreholes={open,__test:{commitParsed,metricCRS,guess,guessedRole},limits:{maxBytes:MAX_BYTES}};
})();
