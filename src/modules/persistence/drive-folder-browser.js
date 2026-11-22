/* JANELA "SALVAR COMO" DO GEOMINE PARA O GOOGLE DRIVE
   Substitui o seletor de pastas do Google no Salvar Como. O seletor do Google
   abria grande, atrás das barras do GeoMine, e listava todas as pastas do
   Drive misturadas, sem a hierarquia. Esta janela é do próprio GeoMine:
   compacta, abre na pasta do projeto, navega pelas pastas (Meu Drive e drives
   compartilhados), mostra os projetos que já existem na pasta e pede o nome do
   arquivo no mesmo lugar. Só lê nomes de pastas e de projetos; a gravação do
   arquivo continua em drive-project-save.js.

   JANELA "ABRIR" (pick), 22/11/2026. No iPad o Abrir do Google Drive usava o
   seletor do Google: uma grade de miniaturas com todo tipo de arquivo
   misturado, sem atalhos e começando sempre de longe. Pedido do usuário:
   "essa janela tem que ser bem mais organizada, aparecer as opções de pastas
   com estrela, arquivos recentes e sempre ficar memorizada a última pasta que
   abri… para PC não precisa". pick() é a mesma janela compacta, para abrir:
   - lista só as pastas e os arquivos que interessam (projetos, ou TIFF quando
     se escolhe o original de um raster);
   - atalhos Recentes, Com estrela, Meu Drive e Drives compartilhados, e busca
     por nome; a estrela das pastas pode ser posta e tirada aqui mesmo quando a
     conta já autorizou a gravação;
   - abre sempre na última pasta visitada (guardada neste aparelho);
   - um toque no arquivo abre. "Seletor do Google" continua disponível no
     rodapé. No computador o Abrir segue como estava. */
(function(root){
'use strict';if(root.GeoMineDriveFolderBrowser)return;
const FILES='https://www.googleapis.com/drive/v3/files',DRIVES='https://www.googleapis.com/drive/v3/drives',
  FOLDER='application/vnd.google-apps.folder',SHORTCUT='application/vnd.google-apps.shortcut',
  ID=/^[\w-]{1,200}$/,PROJECT=/\.(ccmgis|alagis|geocampo)$/i,
  /* Abrir aceita também o projeto que chegou com uma extensão a mais (".ccmgis.txt"). */
  PROJECT_OPEN=/\.(ccmgis|alagis|geocampo)(\.[a-z0-9]{1,5})?$/i,TIFF=/\.tiff?$/i;
const provider=()=>root.GeoMineCloudProvider;
const abort=()=>new DOMException('Salvamento cancelado','AbortError');
const quote=text=>String(text).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
const html=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const megas=b=>b>0?(b/1048576).toFixed(b<10485760?1:0).replace('.',',')+' MB':'';
const day=t=>{try{return new Date(t).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit'});}catch(_){return '';}};
const ICON={
  folder:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  drive:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 14h18M7 17h.01"/></svg>',
  file:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5"/></svg>',
  go:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>',
  star:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>'
};
/* readOnly: a janela Abrir só lê e usa o acesso de leitura; o Salvar Como usa o de gravação. */
async function call(url,params,init,readOnly){
  const token=await provider().driveAccess(false,readOnly?undefined:{write:true}),u=new URL(url);
  u.search=new URLSearchParams({...(params||{}),supportsAllDrives:'true'});
  const r=await fetch(u,{...(init||{}),headers:{Authorization:'Bearer '+token,...(init?.headers||{})},cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  if(r.status===401){provider().clearDriveAccess?.();throw Error('A autorização do Google Drive venceu. Feche esta janela e toque em '+(readOnly?'Abrir':'Salvar Como')+' de novo.');}
  if(r.status===404)throw Object.assign(Error('Esta pasta não está disponível para a sua conta.'),{code:'not-found'});
  if(!r.ok)throw Error('O Google Drive não respondeu (HTTP '+r.status+').');
  return r.json();
}
async function info(id,readOnly){
  const f=await call(FILES+'/'+encodeURIComponent(id),{fields:'id,name,mimeType,parents,driveId,capabilities(canAddChildren)'},null,readOnly);
  return {id:f.id,name:f.name||'pasta',parent:f.parents?.[0]||'',driveId:f.driveId||'',canAdd:f.capabilities?.canAddChildren!==false};
}
// Da pasta até a raiz (Meu Drive ou o drive compartilhado), para o caminho no topo.
async function trailOf(id,readOnly){
  const chain=[];let current=id;
  for(let i=0;i<24&&current;i++){
    let f;try{f=await info(current,readOnly);}catch(e){if(chain.length)break;throw e;}
    chain.unshift(f);current=f.parent;
  }
  return chain;
}
async function children(folderId){
  const base={corpora:'allDrives',includeItemsFromAllDrives:'true',pageSize:'200',orderBy:'name_natural'},
    inside="'"+quote(folderId)+"' in parents and trashed = false";
  const [folders,files]=await Promise.all([
    call(FILES,{...base,q:inside+" and (mimeType = '"+FOLDER+"' or mimeType = '"+SHORTCUT+"')",
      fields:'files(id,name,mimeType,shortcutDetails(targetId,targetMimeType),capabilities(canAddChildren))'}),
    call(FILES,{...base,q:inside+" and mimeType != '"+FOLDER+"' and name contains 'ccmgis'",fields:'files(id,name,size,modifiedTime)'})]);
  return {
    folders:(folders.files||[]).map(f=>f.mimeType===SHORTCUT
        ?(f.shortcutDetails?.targetMimeType===FOLDER&&ID.test(f.shortcutDetails.targetId||'')?{id:f.shortcutDetails.targetId,name:f.name,shortcut:true}:null)
        :{id:f.id,name:f.name,canAdd:f.capabilities?.canAddChildren!==false})
      .filter(f=>f&&ID.test(f.id||'')),
    files:(files.files||[]).filter(f=>PROJECT.test(f.name||'')).map(f=>({id:f.id,name:f.name,size:Number(f.size)||0,modified:Date.parse(f.modifiedTime)||0}))
  };
}
function css(){
  if(document.getElementById('gmDriveBrowserCss'))return;
  const style=document.createElement('style');style.id='gmDriveBrowserCss';
  style.textContent=`
#gmDriveSaveAs .modal{width:min(540px,94vw);max-height:min(92vh,640px);display:flex;flex-direction:column;font-size:12.5px}
#gmDriveSaveAs .modal-h{padding:9px 12px;gap:8px}
#gmDriveSaveAs .gdb-sub{font-size:11px;color:var(--ink-dim)}
#gmDriveSaveAs .gdb-x{height:26px;min-width:28px;padding:0 7px;justify-content:center}
#gmDriveSaveAs .modal-b{padding:10px 12px 12px;display:flex;flex-direction:column;gap:8px;min-height:0;overflow:hidden}
#gmDriveSaveAs .gdb-top{display:flex;gap:6px;align-items:center}
#gmDriveSaveAs .tbtn{height:28px;padding:0 10px;font-size:12px;white-space:nowrap}
#gmDriveSaveAs .gdb-root.gdb-atual{border-color:var(--amber);color:var(--amber);background:color-mix(in srgb,var(--amber) 12%,transparent)}
#gmDriveSaveAs input{height:28px;font-size:12.5px;box-sizing:border-box;background:var(--bg,var(--panel2,#0d1117));color:var(--ink);border:1px solid var(--line);border-radius:7px;padding:0 9px;-webkit-appearance:none;appearance:none;outline:0}
#gmDriveSaveAs input:focus{border-color:var(--amber)}
#gmDriveSaveAs input::placeholder{color:var(--ink-dim);opacity:.8}
#gmDriveSaveAs input[type=search]::-webkit-search-cancel-button{-webkit-appearance:none}
#gmDriveSaveAs .gdb-search{flex:1;min-width:0}
#gmDriveSaveAs .gdb-path{display:flex;align-items:center;gap:1px;overflow-x:auto;white-space:nowrap;scrollbar-width:none;min-height:24px}
#gmDriveSaveAs .gdb-path::-webkit-scrollbar{display:none}
#gmDriveSaveAs .gdb-crumb{background:none;border:0;color:var(--ink-dim);padding:3px 5px;border-radius:5px;font:inherit;cursor:pointer;flex:none}
#gmDriveSaveAs .gdb-crumb:last-of-type{color:var(--ink-bright,var(--ink));font-weight:600}
#gmDriveSaveAs .gdb-sep{color:var(--ink-dim);opacity:.6;flex:none}
#gmDriveSaveAs .gdb-list{flex:1 1 auto;min-height:140px;max-height:42vh;overflow:auto;border:1px solid var(--line);border-radius:8px;background:var(--panel2,transparent);overscroll-behavior:contain}
#gmDriveSaveAs .gdb-row{display:flex;align-items:center;gap:8px;width:100%;height:34px;padding:0 10px;background:none;border:0;border-bottom:1px solid var(--line);color:var(--ink);font:inherit;text-align:left;cursor:pointer;box-sizing:border-box}
#gmDriveSaveAs .gdb-row:last-child{border-bottom:0}
#gmDriveSaveAs .gdb-row:hover,#gmDriveSaveAs .gdb-row:focus-visible{background:color-mix(in srgb,var(--amber) 12%,transparent);outline:0}
#gmDriveSaveAs .gdb-row svg{width:17px;height:17px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
#gmDriveSaveAs .gdb-row.pasta>svg:first-child{color:var(--amber)}
#gmDriveSaveAs .gdb-row.arquivo{color:var(--ink-dim)}
#gmDriveSaveAs .gdb-row .gdb-go{color:var(--ink-dim);opacity:.7;width:14px;height:14px}
#gmDriveSaveAs .gdb-nome{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#gmDriveSaveAs .gdb-meta{flex:none;font-size:11px;color:var(--ink-dim)}
#gmDriveSaveAs .gdb-vazio{padding:20px 12px;color:var(--ink-dim);text-align:center;line-height:1.4}
#gmDriveSaveAs .gdb-namebox{display:flex;align-items:center;gap:7px}
#gmDriveSaveAs .gdb-namebox input{flex:1;min-width:0;height:30px}
#gmDriveSaveAs .gdb-namebox span{color:var(--ink-dim);flex:none}
#gmDriveSaveAs .gdb-foot{display:flex;gap:8px;align-items:center}
#gmDriveSaveAs .gdb-msg{font-size:11.5px;color:var(--ink-dim);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#gmDriveSaveAs .gdb-ok{background:var(--amber);color:#1a1206;font-weight:600;border-color:var(--amber)}
#gmDriveSaveAs .gdb-ok:disabled,#gmDriveSaveAs .gdb-new:disabled{opacity:.45;cursor:not-allowed}
@media(max-width:520px){#gmDriveSaveAs .gdb-top{flex-wrap:wrap}#gmDriveSaveAs .gdb-search{flex-basis:100%}#gmDriveSaveAs .gdb-msg{display:none}}`
    .replace(/#gmDriveSaveAs/g,':is(#gmDriveSaveAs,#gmDriveOpen)')+`
#gmDriveOpen .modal{width:min(580px,94vw);max-height:min(92vh,680px)}
#gmDriveOpen .modal-b>.gm-panel-card{margin:0;padding:8px 10px;display:flex;flex-direction:column;gap:6px;min-height:0}
#gmDriveOpen .modal-b>.gm-panel-card>.gm-card-heading{margin:0;min-height:22px}
#gmDriveOpen .gdb-card-list{flex:1 1 auto}
#gmDriveOpen .gdb-top{flex-wrap:wrap}
#gmDriveOpen .gdb-chips{display:flex;gap:6px;flex-wrap:wrap}
#gmDriveOpen .gdb-search{flex:1 1 150px}
#gmDriveOpen .gdb-list{min-height:190px;max-height:54vh}
#gmDriveOpen .gdb-line{display:flex;align-items:stretch;border-bottom:1px solid var(--line)}
#gmDriveOpen .gdb-line:last-child{border-bottom:0}
#gmDriveOpen .gdb-line .gdb-row{flex:1;min-width:0;height:38px;border-bottom:0}
#gmDriveOpen .gdb-row.arquivo{color:var(--ink)}
#gmDriveOpen .gdb-row.arquivo>svg:first-child{color:var(--blue,#4aa3df)}
#gmDriveOpen .gdb-star{flex:none;width:42px;display:grid;place-items:center;padding:0;background:none;border:0;border-left:1px solid var(--line);color:var(--ink-dim);cursor:pointer}
#gmDriveOpen .gdb-star svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linejoin:round}
#gmDriveOpen .gdb-star.on{color:var(--amber)}
#gmDriveOpen .gdb-star.on svg{fill:currentColor}
#gmDriveOpen .gdb-star:disabled{cursor:default}
#gmDriveOpen .gdb-group{padding:6px 10px 4px;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-dim);background:color-mix(in srgb,var(--line) 40%,transparent);border-bottom:1px solid var(--line)}
#gmDriveOpen .gdb-google{color:var(--ink-dim)}`;
  document.head.append(style);
}
/* options: name (nome sugerido), startFolder (id), locate (função que devolve o
   id da pasta do projeto), fallbackFolder (última pasta usada).
   Resolve com {folder:{id,name}, name, existing}; rejeita com AbortError. */
function open(options={}){
  css();
  document.getElementById('gmDriveSaveAs')?.remove();
  return new Promise((resolve,reject)=>{
    const bg=document.createElement('div');bg.id='gmDriveSaveAs';bg.className='modal-bg on';
    bg.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="Salvar como no Google Drive">
      <div class="modal-h"><b>Salvar como</b><span class="gdb-sub">Google Drive</span><div style="flex:1"></div><button type="button" class="tbtn gdb-x" aria-label="Fechar">✕</button></div>
      <div class="modal-b">
        <div class="gdb-top"><button type="button" class="tbtn gdb-root" data-root="mine">Meu Drive</button><button type="button" class="tbtn gdb-root" data-root="shared">Drives compartilhados</button>
          <input type="search" class="gdb-search" placeholder="Buscar pasta…" aria-label="Buscar pasta pelo nome" enterkeyhint="search" autocomplete="off"></div>
        <div class="gdb-path" aria-label="Pasta atual"></div>
        <div class="gdb-list"></div>
        <label class="gdb-namebox"><span>Nome</span><input type="text" class="gdb-name-input" aria-label="Nome do arquivo" autocomplete="off" autocapitalize="off" spellcheck="false"><span>.ccmgis</span></label>
        <div class="gdb-foot"><button type="button" class="tbtn gdb-new">+ Nova pasta</button><span class="gdb-msg" role="status"></span><div style="flex:1"></div>
          <button type="button" class="tbtn gdb-cancel">Cancelar</button><button type="button" class="tbtn gdb-ok">Salvar aqui</button></div>
      </div></div>`;
    const $=s=>bg.querySelector(s),list=$('.gdb-list'),path=$('.gdb-path'),nameInput=$('.gdb-name-input'),ok=$('.gdb-ok'),novo=$('.gdb-new'),msg=$('.gdb-msg');
    nameInput.value=String(options.name||'projeto').replace(PROJECT,'');
    /* mode: 'folder' (dentro de uma pasta), 'drives' (lista de drives
       compartilhados) ou 'search' (resultado da busca). */
    let mode='folder',trail=[],items={folders:[],files:[]},seq=0,done=false,label='';
    const current=()=>mode==='folder'?trail[trail.length-1]||null:null;
    const clean=text=>String(text||'').trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(PROJECT,'').trim();
    function finish(value){
      if(done)return;done=true;document.removeEventListener('keydown',keys,true);bg.remove();
      value?resolve(value):reject(abort());
    }
    function controls(){
      const here=current(),canSave=!!here&&here.canAdd!==false;
      ok.disabled=!canSave||!clean(nameInput.value);novo.disabled=!canSave;
      bg.querySelectorAll('.gdb-root').forEach(b=>b.classList.toggle('gdb-atual',
        b.dataset.root==='shared'?mode==='drives'||(mode==='folder'&&!!trail[0]?.sharedDrive):mode==='folder'&&!!trail.length&&!trail[0].sharedDrive));
      msg.textContent=mode==='drives'?'Escolha um drive compartilhado.':mode==='search'?'Escolha uma pasta do resultado.':
        !here?'':here.canAdd===false?'Sua conta não pode gravar nesta pasta.':'';
    }
    function render(){
      path.innerHTML=mode==='folder'
        ?trail.map((f,i)=>'<button type="button" class="gdb-crumb" data-i="'+i+'">'+html(f.name)+'</button>').join('<span class="gdb-sep">›</span>')
        :'<span class="gdb-crumb" style="cursor:default">'+html(label)+'</span>';
      const rows=items.folders.map((f,i)=>'<button type="button" class="gdb-row pasta" data-folder="'+i+'">'+(f.drive?ICON.drive:ICON.folder)+
          '<span class="gdb-nome">'+html(f.name)+'</span>'+ICON.go.replace('<svg','<svg class="gdb-go"')+'</button>')
        .concat(items.files.map((f,i)=>'<button type="button" class="gdb-row arquivo" data-file="'+i+'" title="Usar este nome para gravar por cima">'+ICON.file+
          '<span class="gdb-nome">'+html(f.name)+'</span><span class="gdb-meta">'+html([megas(f.size),day(f.modified)].filter(Boolean).join(' · '))+'</span></button>'));
      list.innerHTML=rows.length?rows.join(''):'<div class="gdb-vazio">'+(mode==='search'?'Nenhuma pasta com esse nome.':mode==='drives'?'Nenhum drive compartilhado nesta conta.':'Pasta sem subpastas e sem projetos.')+'</div>';
      if(mode!=='search')$('.gdb-search').value='';
      list.scrollTop=0;path.scrollLeft=path.scrollWidth;controls();
    }
    async function load(work,onError){
      const mine=++seq;
      list.innerHTML='<div class="gdb-vazio">Carregando…</div>';
      try{const next=await work();if(done||mine!==seq)return;next();render();}
      catch(error){
        if(done||mine!==seq)return;
        if(onError&&onError(error)!==false)return;
        list.innerHTML='<div class="gdb-vazio">'+html(error.message||error)+'</div>';controls();
      }
    }
    const setFolder=(chain,kids)=>()=>{mode='folder';trail=chain;items=kids;};
    // Entra numa pasta pelo id, resolvendo o caminho até a raiz.
    function enter(id,onError){
      return load(async()=>{const [chain,kids]=await Promise.all([trailOf(id),children(id)]);
        if(chain[0])chain[0].sharedDrive=!!chain[0].driveId;
        return setFolder(chain,kids);},onError);
    }
    function enterChild(folder){
      const chain=[...trail,{id:folder.id,name:folder.name,canAdd:folder.canAdd}];
      // Atalho ou resultado de busca: o caminho real é outro; resolve do zero.
      if(folder.shortcut||mode!=='folder')return enter(folder.id);
      return load(async()=>{const kids=await children(folder.id);let here=chain[chain.length-1];
        if(here.canAdd===undefined)try{here.canAdd=(await info(folder.id)).canAdd;}catch(_){}
        return setFolder(chain,kids);});
    }
    function showDrives(){
      return load(async()=>{const r=await call(DRIVES,{pageSize:'100',fields:'drives(id,name)'});
        return ()=>{mode='drives';label='Drives compartilhados';trail=[];
          items={folders:(r.drives||[]).filter(d=>ID.test(d.id||'')).map(d=>({id:d.id,name:d.name,drive:true})),files:[]};};});
    }
    function search(text){
      text=String(text||'').trim();if(text.length<2){toast('Digite ao menos 2 letras do nome da pasta.');return;}
      return load(async()=>{const r=await call(FILES,{corpora:'allDrives',includeItemsFromAllDrives:'true',pageSize:'40',
          q:"mimeType = '"+FOLDER+"' and name contains '"+quote(text)+"' and trashed = false",fields:'files(id,name)'});
        return ()=>{mode='search';label='Busca: “'+text+'”';trail=[];
          items={folders:(r.files||[]).filter(f=>ID.test(f.id||'')).map(f=>({id:f.id,name:f.name})),files:[]};};});
    }
    function keys(e){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(null);}}
    document.addEventListener('keydown',keys,true);
    $('.gdb-x').onclick=$('.gdb-cancel').onclick=()=>finish(null);
    bg.querySelectorAll('.gdb-root').forEach(b=>b.onclick=()=>b.dataset.root==='shared'?showDrives():enter('root'));
    $('.gdb-search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search(e.target.value);}});
    $('.gdb-search').addEventListener('search',e=>{if(e.target.value)search(e.target.value);});
    nameInput.addEventListener('input',controls);
    nameInput.addEventListener('keydown',e=>{if(e.key==='Enter'&&!ok.disabled){e.preventDefault();ok.click();}});
    path.onclick=e=>{const b=e.target.closest('.gdb-crumb[data-i]');if(!b)return;const i=+b.dataset.i,chain=trail.slice(0,i+1);
      if(i===trail.length-1)return;load(async()=>setFolder(chain,await children(chain[i].id)));};
    list.onclick=e=>{
      const row=e.target.closest('.gdb-row');if(!row)return;
      if(row.dataset.folder!=null){const f=items.folders[+row.dataset.folder];if(!f)return;
        if(f.drive)load(async()=>{const kids=await children(f.id);return setFolder([{id:f.id,name:f.name,canAdd:true,sharedDrive:true}],kids);});
        else enterChild(f);
      }else if(row.dataset.file!=null){const f=items.files[+row.dataset.file];if(f){nameInput.value=f.name.replace(PROJECT,'');controls();}}
    };
    novo.onclick=async()=>{
      const here=current();if(!here)return;
      const name=clean(prompt('Nome da nova pasta em “'+here.name+'”:',''));if(!name)return;
      try{const f=await call(FILES,{fields:'id,name'},{method:'POST',headers:{'Content-Type':'application/json; charset=UTF-8'},
          body:JSON.stringify({name,mimeType:FOLDER,parents:[here.id]})});
        enterChild({id:f.id,name:f.name||name,canAdd:true});}
      catch(error){toast('Não foi possível criar a pasta: '+(error.message||error));}
    };
    ok.onclick=()=>{
      const here=current(),name=clean(nameInput.value);if(!here||!name||here.canAdd===false)return;
      const full=name+'.ccmgis';
      finish({folder:{id:here.id,name:here.name},name:full,existing:items.files.find(f=>f.name.toLowerCase()===full.toLowerCase())||null});
    };
    document.body.append(bg);
    // Começa na pasta do projeto; sem ela, na última pasta usada; por fim, em Meu Drive.
    (async()=>{
      let id=ID.test(options.startFolder||'')?options.startFolder:'';
      if(!id&&typeof options.locate==='function'){
        list.innerHTML='<div class="gdb-vazio">Procurando a pasta do projeto…</div>';
        try{const found=await options.locate();if(ID.test(found||''))id=found;}catch(_){}
        if(done)return;
      }
      if(!id&&ID.test(options.fallbackFolder||''))id=options.fallbackFolder;
      if(id)enter(id,()=>{enter('root');});else enter('root');
    })();
  });
}
/* ---- Janela Abrir (ver o cabeçalho) ----
   options: title, files ('project' por padrão, ou 'tiff'), parent (pasta
   sugerida) e memoryKey (onde guardar a última pasta visitada).
   Resolve com {kind:'drive',id,resourceKey,name,parent}; rejeita com AbortError
   quando a pessoa fecha, ou com name 'GeoMineGooglePicker' quando ela pede o
   seletor do Google. */
const NAV_KEY='geomine.drive.navegacao.v1',RECENT_KEY='geomine.drive.recentes.v1',
  LIST_FIELDS='files(id,name,mimeType,size,modifiedTime,starred,parents,resourceKey,shortcutDetails(targetId,targetMimeType))';
const account=()=>{try{return provider()?.user?.uid||'';}catch(_){return '';}};
function stored(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch(_){return null;}}
function recentList(kind){
  const all=stored(RECENT_KEY+':'+account());
  return Array.isArray(all)?all.filter(f=>f&&ID.test(f.id||'')&&f.kind===kind&&typeof f.name==='string'&&f.name):[];
}
// Arquivos abertos por esta janela neste aparelho, por conta; os mais novos primeiro.
function rememberRecent(file,kind){
  if(!file||!ID.test(file.id||'')||!file.name)return;
  const key=RECENT_KEY+':'+account(),old=stored(key);
  const all=(Array.isArray(old)?old:[]).filter(f=>f&&f.id!==file.id);
  all.unshift({id:file.id,resourceKey:file.resourceKey||'',name:String(file.name),size:Number(file.size)||0,modified:Number(file.modified)||0,
    parent:ID.test(file.parent||'')?file.parent:'',kind,at:Date.now()});
  try{localStorage.setItem(key,JSON.stringify(all.slice(0,24)));}catch(_){}
}
function pick(options={}){
  css();
  document.getElementById('gmDriveOpen')?.remove();
  const tiff=options.files==='tiff',kind=tiff?'tiff':'project';
  const want=tiff
    ?{accept:name=>TIFF.test(name),q:"name contains 'tif'",what:'arquivo TIFF',choose:'Escolha o arquivo TIFF',empty:'Pasta sem subpastas e sem arquivos TIFF.',search:'Buscar TIFF ou pasta…'}
    :{accept:name=>PROJECT_OPEN.test(name),q:"(name contains 'ccmgis' or name contains 'alagis' or name contains 'geocampo')",what:'projeto',choose:'Escolha o projeto',empty:'Pasta sem subpastas e sem projetos.',search:'Buscar projeto ou pasta…'};
  const navKey=(options.memoryKey||NAV_KEY)+':'+account(),title=String(options.title||'Abrir projeto');
  return new Promise((resolve,reject)=>{
    const bg=document.createElement('div');bg.id='gmDriveOpen';bg.className='modal-bg on';
    bg.setAttribute('data-gm-no-dirty','');   // buscar aqui não é editar o projeto (session-autosave.js)
    bg.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-label="${html(title)} — Google Drive">
      <div class="modal-h"><b>${html(title)}</b><span class="gdb-sub">Google Drive</span><div style="flex:1"></div><button type="button" class="tbtn gdb-x" aria-label="Fechar">✕</button></div>
      <div class="modal-b gm-card-stack">
        <section class="gm-work-card gm-panel-card" role="group" aria-label="Onde procurar">
          <div class="gm-card-heading"><span class="gm-card-step" aria-hidden="true"></span><b>Onde procurar</b></div>
          <div class="gdb-top"><div class="gdb-chips"><button type="button" class="tbtn gdb-root" data-root="recent">Recentes</button><button type="button" class="tbtn gdb-root" data-root="starred">Com estrela</button><button type="button" class="tbtn gdb-root" data-root="mine">Meu Drive</button><button type="button" class="tbtn gdb-root" data-root="shared">Drives compartilhados</button></div>
            <input type="search" class="gdb-search" placeholder="${html(want.search)}" aria-label="Buscar pelo nome" enterkeyhint="search" autocomplete="off"></div>
        </section>
        <section class="gm-work-card gm-panel-card gdb-card-list" role="group" aria-label="${html(want.choose)}">
          <div class="gm-card-heading"><span class="gm-card-step" aria-hidden="true"></span><b>${html(want.choose)}</b></div>
          <div class="gdb-path" aria-label="Pasta atual"></div>
          <div class="gdb-list"></div>
        </section>
        <div class="gdb-foot"><button type="button" class="tbtn gdb-google" title="Abrir o seletor de arquivos do Google">Seletor do Google</button><span class="gdb-msg" role="status"></span><div style="flex:1"></div>
          <button type="button" class="tbtn gdb-cancel">Cancelar</button></div>
      </div></div>`;
    const $=selector=>bg.querySelector(selector),list=$('.gdb-list'),path=$('.gdb-path'),msg=$('.gdb-msg');
    /* mode: 'folder' (dentro de uma pasta), 'drives', 'recent', 'starred' ou 'search'. */
    let mode='folder',trail=[],items={folders:[],files:[]},seq=0,done=false,label='',canStar=false;
    // A estrela só pode ser mudada com o acesso de gravação (pedido no primeiro Salvar).
    Promise.resolve().then(()=>provider().driveAccess(false,{write:true})).then(()=>{canStar=true;if(!done&&list.querySelector('.gdb-line'))render(true);},()=>{});
    function finish(value,error){
      if(done)return;done=true;document.removeEventListener('keydown',keys,true);bg.remove();
      value?resolve(value):reject(error||new DOMException('Seleção cancelada.','AbortError'));
    }
    function split(files){
      const folders=[],docs=[];
      for(const f of files||[]){
        if(!f||!ID.test(f.id||''))continue;
        if(f.mimeType===SHORTCUT){
          if(f.shortcutDetails?.targetMimeType===FOLDER&&ID.test(f.shortcutDetails.targetId||''))folders.push({id:f.shortcutDetails.targetId,name:f.name,shortcut:true});
        }else if(f.mimeType===FOLDER)folders.push({id:f.id,name:f.name,starred:!!f.starred});
        else if(want.accept(f.name||''))docs.push({id:f.id,resourceKey:f.resourceKey||'',name:f.name,size:Number(f.size)||0,
          modified:Date.parse(f.modifiedTime)||0,parent:f.parents?.[0]||''});
      }
      return {folders,files:docs};
    }
    const BASE={corpora:'allDrives',includeItemsFromAllDrives:'true'};
    async function listFolder(id){
      const inside="'"+quote(id)+"' in parents and trashed = false",page={...BASE,pageSize:'200',orderBy:'name_natural',fields:LIST_FIELDS};
      const [a,b]=await Promise.all([
        call(FILES,{...page,q:inside+" and (mimeType = '"+FOLDER+"' or mimeType = '"+SHORTCUT+"')"},null,true),
        call(FILES,{...page,q:inside+" and mimeType != '"+FOLDER+"' and "+want.q},null,true)]);
      return {folders:split(a.files).folders,files:split(b.files).files};
    }
    const starLabel=f=>(f.starred?'Tirar a estrela de ':'Marcar com estrela: ')+f.name;
    function rowFolder(f,i){
      // Sem o acesso de gravação a estrela só aparece, parada, nas pastas que já a têm.
      const star=f.drive||f.shortcut||(!canStar&&!f.starred)?''
        :'<button type="button" class="gdb-star'+(f.starred?' on':'')+'" data-star="'+i+'"'+(canStar?'':' disabled')+' aria-pressed="'+(f.starred?'true':'false')+'" aria-label="'+html(starLabel(f))+'">'+ICON.star+'</button>';
      return '<div class="gdb-line"><button type="button" class="gdb-row pasta" data-folder="'+i+'">'+(f.drive?ICON.drive:ICON.folder)+
        '<span class="gdb-nome">'+html(f.name)+'</span>'+ICON.go.replace('<svg','<svg class="gdb-go"')+'</button>'+star+'</div>';
    }
    const rowFile=(f,i)=>(f.group?'<div class="gdb-group">'+html(f.group)+'</div>':'')+
      '<div class="gdb-line"><button type="button" class="gdb-row arquivo" data-file="'+i+'">'+ICON.file+'<span class="gdb-nome">'+html(f.name)+'</span>'+
      '<span class="gdb-meta">'+html([megas(f.size),day(f.modified)].filter(Boolean).join(' · '))+'</span></button></div>';
    function emptyText(){
      return mode==='search'?'Nada encontrado com esse nome.':mode==='drives'?'Nenhum drive compartilhado nesta conta.':
        mode==='recent'?'Nenhum '+want.what+' recente.':
        mode==='starred'?'Nada com estrela ainda. '+(canStar?'Toque na estrela ao lado de uma pasta para marcá-la.':'Marque as pastas com estrela no Google Drive.'):want.empty;
    }
    function render(keepScroll){
      const top=list.scrollTop;
      path.innerHTML=mode==='folder'
        ?trail.map((f,i)=>'<button type="button" class="gdb-crumb" data-i="'+i+'">'+html(f.name)+'</button>').join('<span class="gdb-sep">›</span>')
        :'<span class="gdb-crumb" style="cursor:default">'+html(label)+'</span>';
      const rows=items.folders.map(rowFolder).concat(items.files.map(rowFile));
      list.innerHTML=rows.length?rows.join(''):'<div class="gdb-vazio">'+html(emptyText())+'</div>';
      if(mode!=='search')$('.gdb-search').value='';
      list.scrollTop=keepScroll?top:0;path.scrollLeft=path.scrollWidth;
      const shared=mode==='drives'||(mode==='folder'&&!!trail[0]?.sharedDrive);
      bg.querySelectorAll('.gdb-root').forEach(b=>b.classList.toggle('gdb-atual',
        b.dataset.root==='recent'?mode==='recent':b.dataset.root==='starred'?mode==='starred':b.dataset.root==='shared'?shared:mode==='folder'&&!!trail.length&&!shared));
      msg.textContent=mode==='drives'?'Escolha um drive compartilhado.':items.files.length?'Toque no '+want.what+' para abrir.':'';
    }
    async function load(work,onError){
      const mine=++seq;
      list.innerHTML='<div class="gdb-vazio">Carregando…</div>';
      try{const next=await work();if(done||mine!==seq)return;next();render();}
      catch(error){
        if(done||mine!==seq)return;
        if(onError&&onError(error)!==false)return;
        list.innerHTML='<div class="gdb-vazio">'+html(error.message||error)+'</div>';msg.textContent='';
      }
    }
    // Toda pasta aberta fica guardada: a janela volta nela da próxima vez.
    const setFolder=(chain,kids)=>()=>{mode='folder';trail=chain;items=kids;
      try{localStorage.setItem(navKey,chain[chain.length-1].id);}catch(_){}};
    function enter(id,onError){
      return load(async()=>{const [chain,kids]=await Promise.all([trailOf(id,true),listFolder(id)]);
        if(chain[0]){chain[0].sharedDrive=!!chain[0].driveId;
          // A raiz do Drive da pessoa vem da API com o nome em inglês.
          if(!chain[0].driveId&&!chain[0].parent&&/^my drive$/i.test(chain[0].name||''))chain[0].name='Meu Drive';}
        return setFolder(chain,kids);},onError);
    }
    function enterChild(folder){
      // Atalho, busca, recentes e estrela: o caminho real é outro; resolve do zero.
      if(folder.shortcut||mode!=='folder')return enter(folder.id);
      const chain=[...trail,{id:folder.id,name:folder.name}];
      return load(async()=>setFolder(chain,await listFolder(folder.id)));
    }
    function showDrives(){
      return load(async()=>{const r=await call(DRIVES,{pageSize:'100',fields:'drives(id,name)'},null,true);
        return ()=>{mode='drives';label='Drives compartilhados';trail=[];
          items={folders:(r.drives||[]).filter(d=>ID.test(d.id||'')).map(d=>({id:d.id,name:d.name,drive:true})),files:[]};};});
    }
    function showStarred(){
      return load(async()=>{const r=await call(FILES,{...BASE,pageSize:'100',orderBy:'name_natural',fields:LIST_FIELDS,
          q:"starred = true and trashed = false and (mimeType = '"+FOLDER+"' or "+want.q+")"},null,true);
        return ()=>{mode='starred';label='Com estrela';trail=[];items=split(r.files);};});
    }
    function showRecent(){
      return load(async()=>{const r=await call(FILES,{...BASE,pageSize:'40',orderBy:'modifiedTime desc',fields:LIST_FIELDS,
          q:"trashed = false and mimeType != '"+FOLDER+"' and "+want.q},null,true);
        return ()=>{mode='recent';label='Recentes';trail=[];
          const local=recentList(kind).slice(0,6).map(f=>({...f,group:''})),seen=new Set(local.map(f=>f.id)),
            cloud=split(r.files).files.filter(f=>!seen.has(f.id)).slice(0,30);
          if(local.length){local[0].group='Abertos neste aparelho';if(cloud.length)cloud[0].group='Modificados recentemente no Drive';}
          items={folders:[],files:local.concat(cloud)};};});
    }
    function search(text){
      text=String(text||'').trim();if(text.length<2){toast('Digite ao menos 2 letras do nome.');return;}
      return load(async()=>{const r=await call(FILES,{...BASE,pageSize:'60',orderBy:'name_natural',fields:LIST_FIELDS,
          q:"name contains '"+quote(text)+"' and trashed = false and (mimeType = '"+FOLDER+"' or "+want.q+")"},null,true);
        return ()=>{mode='search';label='Busca: “'+text+'”';trail=[];items=split(r.files);};});
    }
    async function toggleStar(f,button){
      if(!f||!canStar||button.disabled)return;
      button.disabled=true;
      try{
        await call(FILES+'/'+encodeURIComponent(f.id),{fields:'id,starred'},{method:'PATCH',headers:{'Content-Type':'application/json; charset=UTF-8'},body:JSON.stringify({starred:!f.starred})});
        f.starred=!f.starred;button.classList.toggle('on',f.starred);button.setAttribute('aria-pressed',String(f.starred));button.setAttribute('aria-label',starLabel(f));
        toast(f.starred?'“'+f.name+'” marcada com estrela.':'Estrela retirada de “'+f.name+'”.');
      }catch(error){toast('Não foi possível mudar a estrela: '+(error.message||error));}
      finally{button.disabled=false;}
    }
    function choose(f){
      const here=mode==='folder'?trail[trail.length-1]:null,parent=ID.test(f.parent||'')?f.parent:here?.id||'';
      rememberRecent({...f,parent},kind);
      if(ID.test(parent))try{localStorage.setItem(navKey,parent);}catch(_){}
      finish({kind:'drive',id:f.id,resourceKey:f.resourceKey||'',name:f.name,parent});
    }
    function keys(e){if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(null);}}
    document.addEventListener('keydown',keys,true);
    $('.gdb-x').onclick=$('.gdb-cancel').onclick=()=>finish(null);
    $('.gdb-google').onclick=()=>finish(null,Object.assign(Error('seletor do Google'),{name:'GeoMineGooglePicker'}));
    bg.querySelectorAll('.gdb-root').forEach(b=>b.onclick=()=>({recent:showRecent,starred:showStarred,shared:showDrives,mine:()=>enter('root')})[b.dataset.root]());
    $('.gdb-search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search(e.target.value);}});
    $('.gdb-search').addEventListener('search',e=>{if(e.target.value)search(e.target.value);});
    path.onclick=e=>{const b=e.target.closest('.gdb-crumb[data-i]');if(!b)return;const i=+b.dataset.i,chain=trail.slice(0,i+1);
      if(i===trail.length-1)return;load(async()=>setFolder(chain,await listFolder(chain[i].id)));};
    list.onclick=e=>{
      const star=e.target.closest('.gdb-star');
      if(star){toggleStar(items.folders[+star.dataset.star],star);return;}
      const row=e.target.closest('.gdb-row');if(!row)return;
      if(row.dataset.folder!=null){const f=items.folders[+row.dataset.folder];if(!f)return;
        if(f.drive)load(async()=>setFolder([{id:f.id,name:f.name,sharedDrive:true}],await listFolder(f.id)));
        else enterChild(f);
      }else if(row.dataset.file!=null){const f=items.files[+row.dataset.file];if(f)choose(f);}
    };
    document.body.append(bg);
    // Abre na última pasta visitada; sem ela, na pasta sugerida; por fim, em Meu Drive.
    const starts=[];
    try{const last=localStorage.getItem(navKey)||'';if(ID.test(last))starts.push(last);}catch(_){}
    if(ID.test(options.parent||'')&&!starts.includes(options.parent))starts.push(options.parent);
    const start=()=>{const id=starts.shift();if(id)enter(id,()=>{start();});else enter('root');};
    start();
  });
}
root.GeoMineDriveFolderBrowser={open,pick,rememberRecent};
})(window);
