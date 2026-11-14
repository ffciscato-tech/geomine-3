/* PROJETO ALTERADO FORA DO GEOMINE, ENTREGUE PELO BANCO DO GEOMINE
   Quem altera um projeto por fora (o Claude, a pedido da pessoa) grava a
   versão nova no Firestore do GeoMine com tools/enviar_atualizacao_projeto.py.
   Aqui o GeoMine confere, para o projeto aberto, se existe uma versão mais
   nova do que o conteúdo carregado, e a carrega — sem Google Drive, sem
   seletor de arquivos e sem janela de autorização. Funciona para projeto
   aberto pelo seletor do iPad, que não tem como enxergar o Drive.

   Regra de decisão:
   - "base" é a data do conteúdo carregado: o savedAt do arquivo aberto, a data
     do último Salvar, ou a data da última atualização aplicada. Fica guardada
     por conta, aba e projeto, e sobrevive à recarga da página.
   - Só é oferecida a atualização enviada DEPOIS da base. Abrir de novo um
     arquivo antigo volta a oferecer; abrir um arquivo salvo depois, não.
   - Sem alterações não salvas no aparelho, carrega sozinha e avisa. Com
     alterações não salvas, pergunta antes: carregar substitui o projeto
     inteiro, e o que foi feito só neste aparelho se perderia. */
(function(root){
'use strict';if(root.GeoMineProjectUpdates)return;
const BASE='geomine.projectUpdate.base.v1:',APPS=['ALAGIS','CCMGIS','CCMGeoCampo'],EVERY=60000,MAX_PARTS=80,MAX_BYTES=64*1048576;
let busy=false,applying=false,lastCheck=0,declined='',pending=null;
const provider=()=>root.GeoMineCloudProvider||null;
function owner(){try{return provider()?.user?.uid||null;}catch(_){return null;}}
const tab=()=>{try{return root.GeoMineProjectTabSession?.state?.().tabId||'';}catch(_){return '';}};
const generation=()=>root.GeoMineSessionAutosave?.state?.generation;
const has=()=>typeof hasContent==='function'&&hasContent();
const key=project=>BASE+encodeURIComponent(owner()||'offline')+':'+encodeURIComponent(tab())+':'+encodeURIComponent(project||'');
function base(project){try{return Number(localStorage.getItem(key(project)))||0;}catch(_){return 0;}}
function setBase(project,time){if(!project||!(time>0))return;try{localStorage.setItem(key(project),String(Math.round(time)));}catch(_){}}
const when=t=>{try{return new Date(t).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(_){return '';}};
function valid(head){
  return !!head&&/^[0-9a-f]{64}$/.test(head.id||'')&&/^[\w-]{6,80}$/.test(head.revision||'')&&head.at>0&&
    Number.isInteger(head.parts)&&head.parts>=1&&head.parts<=MAX_PARTS&&head.bytes>0&&head.bytes<=MAX_BYTES&&
    head.rawBytes>0&&/^[0-9a-f]{64}$/.test(head.sha256||'')&&head.format==='zip';
}
function idle(){
  const resume=root.GeoMineWorkspaceResume?.state;
  if(resume&&(!resume.ready||resume.restoring))return false;
  let session=null;try{session=root.GeoMineProjectTabSession?.state?.();}catch(_){}
  if(session&&(!session.ready||session.busy))return false;
  return !S._rasterImportController&&!document.getElementById('gmDriveConflict');
}
async function sha256(bytes){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
async function download(head,current){
  const p=provider(),parts=[];let size=0;
  for(let n=0;n<head.parts;n++){
    const part=await p.projectUpdatePart(head,n);if(!current())throw new DOMException('O projeto mudou.','AbortError');
    if(!(part instanceof Uint8Array)||!part.byteLength)throw Error('A atualização chegou incompleta (parte '+(n+1)+' de '+head.parts+').');
    parts.push(part);size+=part.byteLength;
    try{showLoad('Carregando o projeto atualizado… '+Math.round(100*(n+1)/head.parts)+'%');}catch(_){}
  }
  if(size!==head.bytes)throw Error('A atualização chegou incompleta.');
  if(typeof JSZip==='undefined')throw Error('O leitor de arquivos compactados não está disponível.');
  const zip=await JSZip.loadAsync(new Blob(parts)),names=Object.keys(zip.files).filter(n=>!zip.files[n].dir),
    entry=zip.file(head.entry||'')||(names.length===1?zip.file(names[0]):null);
  if(!entry)throw Error('A atualização não contém o arquivo do projeto.');
  const raw=await entry.async('uint8array');
  if(raw.byteLength!==head.rawBytes||await sha256(raw)!==head.sha256)throw Error('A atualização não confere com a que foi enviada.');
  return JSON.parse(new TextDecoder().decode(raw));
}
async function apply(head){
  if(applying)return false;
  const project=S.projectId,gen=generation(),current=()=>S.projectId===project&&generation()===gen&&!!provider();
  applying=true;pending=null;
  try{showLoad('Carregando o projeto atualizado…');}catch(_){}
  try{
    const data=await download(head,current);
    if(!current())return false;
    if(!data||!APPS.includes(data.app)||data.projectId!==project)throw Error('A atualização é de outro projeto.');
    // A vista do mapa continua onde estava, como na retomada da sessão.
    try{const screen=root.GeoMineProjectScreen?.capture?.();if(root.GeoMineProjectScreen?.validMap?.(screen?.map))data.screen=screen;}catch(_){}
    for(const r of data.rasters||[]){r.dispFull=true;r.demHD=true;}
    if(data.img){data.img.orthoHD=true;data.img.orthoDispFull=true;}
    const session=root.GeoMineProjectTabSession,binding=session?.bindingFor?.(project),handle=binding?.handle||session?.startIn?.()||null;
    root.loadProject(data);
    if(S.projectId!==project)return false;
    if(binding||handle)root.startAutosave?.(binding?.name||handle.name,handle,binding?.source?{...binding.source}:null);
    setBase(project,head.at);declined='';
    await new Promise(r=>setTimeout(r,0));
    // Não é um arquivo salvo pela pessoa: fica marcado até ela usar Salvar.
    root.GeoMineSessionAutosave?.markDirty?.('atualização do projeto recebida');
    try{await root.GeoMineOriginalSources?.restoreAll?.();}catch(_){}
    const texto='Projeto atualizado'+(head.note?': '+head.note:'')+' (enviado em '+when(head.at)+').';
    try{cmdLog(texto,'ok');}catch(_){}
    toast(texto);return true;
  }catch(e){
    if(e?.name!=='AbortError'){
      const texto='Não foi possível carregar a atualização do projeto: '+(e?.message||e);
      try{cmdLog(texto,'warn');}catch(_){}
      toast(texto);
    }
    return false;
  }finally{applying=false;try{hideLoad();}catch(_){}}
}
function ask(head){
  if(document.getElementById('gmProjectUpdate'))return;
  const project=S.projectId,box=document.createElement('dialog');
  box.id='gmProjectUpdate';box.setAttribute('aria-label','Projeto atualizado');
  box.style.cssText='max-width:min(420px,92vw);padding:16px;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:10px';
  const title=document.createElement('strong'),note=document.createElement('p'),warn=document.createElement('p'),row=document.createElement('div'),
    later=document.createElement('button'),load=document.createElement('button');
  title.textContent='Há uma versão atualizada deste projeto';
  note.textContent=(head.note?head.note.replace(/[.\s]+$/,'')+'.':'O projeto foi alterado fora do GeoMine.')+' Enviada em '+when(head.at)+'.';
  warn.textContent='Carregar substitui o que está aberto neste aparelho, inclusive o que ainda não foi salvo.';
  note.style.cssText='margin:8px 0 6px';warn.style.cssText='margin:0 0 12px;color:var(--ink-dim);font-size:12px';
  row.style.cssText='display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap';
  later.type=load.type='button';later.className='tbtn';load.className='tbtn primary';
  later.textContent='Agora não';load.textContent='Carregar versão atualizada';
  later.onclick=()=>{declined=head.revision;box.close();
    toast('A versão atualizada continua disponível: procure “Carregar atualização do projeto” na busca de comandos, ou atualize a página.');};
  load.onclick=()=>{box.close();if(S.projectId===project)void apply(head);};
  row.append(later,load);box.append(title,note,warn,row);
  box.addEventListener('close',()=>box.remove(),{once:true});
  // Esc fecha sem carregar e sem marcar recusa: volta a perguntar na próxima conferência manual ou recarga.
  box.addEventListener('cancel',()=>{declined=head.revision;});
  document.body.append(box);
  try{box.showModal();}catch(_){box.setAttribute('open','');}
}
async function check(options={}){
  const manual=options.manual===true,p=provider(),project=S.projectId;
  const none=text=>{if(manual)toast(text);return false;};
  if(!p?.projectUpdateHead)return none('A conferência de atualizações precisa do login no site oficial do GeoMine.');
  if(!project||!has())return none('Abra o projeto antes de procurar a atualização dele.');
  if(busy||applying||!idle())return none('O GeoMine está ocupado; tente de novo em instantes.');
  busy=true;lastCheck=Date.now();
  try{
    const head=await p.projectUpdateHead(project);
    if(project!==S.projectId)return false;
    if(!valid(head)||head.projectId!==project||head.at<=base(project)){pending=null;return none('Não há atualização nova para este projeto.');}
    pending=head;
    if(!manual&&declined===head.revision)return false;
    if(!idle())return false;
    if(root.GeoMineSessionAutosave?.state?.dirty){ask(head);return true;}
    return await apply(head);
  }catch(e){
    if(manual)toast('Não foi possível conferir a atualização do projeto: '+(e?.message||e));
    else try{console.warn('GeoMine atualização de projeto:',e);}catch(_){}
    return false;
  }finally{busy=false;}
}
function boot(){
  const load=root.loadProject;
  if(typeof load==='function')root.loadProject=function(d){
    const out=load.apply(this,arguments);
    // Arquivo aberto pela pessoa define a base; a retomada da sessão e a própria atualização, não.
    try{if(!applying&&!root.GeoMineWorkspaceResume?.state?.restoring&&S.projectId){const t=Date.parse(d?.savedAt)||0;if(t)setBase(S.projectId,t);declined='';}}catch(_){}
    lastCheck=0;return out;
  };
  const save=root.saveProject;
  if(typeof save==='function')root.saveProject=async function(){
    const out=await save.apply(this,arguments);
    if(out===true)setBase(S.projectId,Date.now());
    return out;
  };
  setInterval(()=>{if(document.visibilityState==='visible'&&Date.now()-lastCheck>=EVERY&&provider()?.projectUpdateHead&&S.projectId&&has()&&idle())void check();},4000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&Date.now()-lastCheck>8000)lastCheck=0;});
  root.addEventListener('pageshow',()=>{lastCheck=0;});
}
root.GeoMineProjectUpdates={check,get state(){return {busy,applying,pending,lastCheck,declined};}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
