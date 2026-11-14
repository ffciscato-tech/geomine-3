/* JANELA "SALVAR COMO" DO GEOMINE PARA O GOOGLE DRIVE
   Substitui o seletor de pastas do Google no Salvar Como. O seletor do Google
   abria grande, atrás das barras do GeoMine, e listava todas as pastas do
   Drive misturadas, sem a hierarquia. Esta janela é do próprio GeoMine:
   compacta, abre na pasta do projeto, navega pelas pastas (Meu Drive e drives
   compartilhados), mostra os projetos que já existem na pasta e pede o nome do
   arquivo no mesmo lugar. Só lê nomes de pastas e de projetos; a gravação do
   arquivo continua em drive-project-save.js. */
(function(root){
'use strict';if(root.GeoMineDriveFolderBrowser)return;
const FILES='https://www.googleapis.com/drive/v3/files',DRIVES='https://www.googleapis.com/drive/v3/drives',
  FOLDER='application/vnd.google-apps.folder',SHORTCUT='application/vnd.google-apps.shortcut',
  ID=/^[\w-]{1,200}$/,PROJECT=/\.(ccmgis|alagis|geocampo)$/i;
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
  go:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>'
};
async function call(url,params,init){
  const token=await provider().driveAccess(false,{write:true}),u=new URL(url);
  u.search=new URLSearchParams({...(params||{}),supportsAllDrives:'true'});
  const r=await fetch(u,{...(init||{}),headers:{Authorization:'Bearer '+token,...(init?.headers||{})},cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  if(r.status===401){provider().clearDriveAccess?.();throw Error('A autorização do Google Drive venceu. Feche esta janela e toque em Salvar Como de novo.');}
  if(r.status===404)throw Object.assign(Error('Esta pasta não está disponível para a sua conta.'),{code:'not-found'});
  if(!r.ok)throw Error('O Google Drive não respondeu (HTTP '+r.status+').');
  return r.json();
}
async function info(id){
  const f=await call(FILES+'/'+encodeURIComponent(id),{fields:'id,name,mimeType,parents,driveId,capabilities(canAddChildren)'});
  return {id:f.id,name:f.name||'pasta',parent:f.parents?.[0]||'',driveId:f.driveId||'',canAdd:f.capabilities?.canAddChildren!==false};
}
// Da pasta até a raiz (Meu Drive ou o drive compartilhado), para o caminho no topo.
async function trailOf(id){
  const chain=[];let current=id;
  for(let i=0;i<24&&current;i++){
    let f;try{f=await info(current);}catch(e){if(chain.length)break;throw e;}
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
@media(max-width:520px){#gmDriveSaveAs .gdb-top{flex-wrap:wrap}#gmDriveSaveAs .gdb-search{flex-basis:100%}#gmDriveSaveAs .gdb-msg{display:none}}`;
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
root.GeoMineDriveFolderBrowser={open};
})(window);
