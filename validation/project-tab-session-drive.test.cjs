const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{webcrypto}=require('node:crypto');
const text=fs.readFileSync(path.join(__dirname,'../src/modules/persistence/project-tab-session.js'),'utf8');
/* Recarga de uma aba vinculada a um projeto do Google Drive, com a autorização do Drive vencida. */
async function env(options={}){
 const TAB='tab-abcdefghijkl',storage=new Map(),db=new Map(),log=[],avisos=[],corpo=[];let acessos=0;
 const el=tag=>{const ouvintes={},e={tag,children:[],style:{},setAttribute(k,v){e[k]=v;},append(...x){e.children.push(...x);},
  addEventListener(t,f){ouvintes[t]=f;},remove(){const i=corpo.indexOf(e);if(i>=0)corpo.splice(i,1);},showModal(){e.open=true;},
  close(){e.open=false;ouvintes.close?.();}};return e;};
 db.set('projectTabSession:v1:alice:'+TAB,{version:1,tabId:TAB,ownerUid:'alice',name:'Projeto.ccmgis',projectId:'p1',
  source:{kind:'drive',id:'arquivo1',version:'7',name:'Projeto.ccmgis'},handle:null,at:1});
 const c={console,URL,crypto:webcrypto,CustomEvent:class{constructor(t,o){this.type=t;this.detail=o?.detail;}},setTimeout,
  navigator:{locks:{request:(n,o,f)=>Promise.resolve(f({name:n}))}},performance:{getEntriesByType:()=>[{type:'reload'}]},
  location:{href:'https://exemplo.invalid/?__gm_tab='+TAB},history:{state:null,replaceState(){}},
  sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  idbGet:async k=>db.get(k),idbSet:async(k,v)=>{db.set(k,v);},
  document:{readyState:'complete',addEventListener(){},getElementById:id=>corpo.find(e=>e.id===id)||null,createElement:el,body:{append:e=>corpo.push(e)}},
  addEventListener(){},dispatchEvent(){},toast:m=>avisos.push(m),cmdLog:m=>log.push(m),confirm:()=>true,
  S:{projectId:options.retomado?'p1':'em-branco'},hasContent:()=>!!options.retomado||!!options.outroConteudo,
  GeoMineSessionAutosave:{state:{generation:1,version:1,dirty:false}},startAutosave(){},openProjectFile(){},
  GeoMineCloudProvider:{user:{uid:'alice'},drivePickerConfig:{key:'k'},driveAccess:async()=>{acessos++;return true;}},
  GeoMineDriveProject:{isSource:s=>s?.kind==='drive',
   metadata:async()=>{throw Object.assign(Error(options.erro||'Autorize o acesso ao Google Drive.'),options.erro?{}:{code:'drive/authorization-needed'});}},
  GeoMineProjectOpenProgress:{begin:()=>({wait:p=>p,phase(){},finish(){}}),cancel(){}},
  GeoMineWorkspaceResume:{pendingSnapshot:async()=>null}};
 c.window=c;vm.createContext(c);vm.runInContext(text,c);await c.GeoMineProjectTabSession.ready;
 return {c,api:c.GeoMineProjectTabSession,corpo,log,avisos,get acessos(){return acessos;}};
}
const botao=(caixa,rotulo)=>caixa.children.find(x=>x.tag==='button'&&x.textContent===rotulo);
test('recarga sem cópia local e com a autorização do Drive vencida oferece abrir a versão salva',async()=>{
 const e=await env();assert.equal(e.corpo.length,0);
 e.api.showResumeIssue();
 const caixa=e.corpo.find(x=>x.id==='gmDriveReopen');assert(caixa&&caixa.open);
 assert.match(caixa.children.find(x=>x.tag==='p').textContent,/Projeto\.ccmgis.*não está guardado neste aparelho.*Google Drive/);
 // o toque pede o Drive na mesma vez (é o que deixa a janela do Google abrir) e fecha a caixa
 const abrir=botao(caixa,'Abrir do Google Drive');assert(abrir);abrir.onclick();
 assert.equal(e.acessos,1);assert.equal(e.corpo.length,0);
});
test('“Agora não” só fecha a caixa; nada é aberto',async()=>{
 const e=await env();e.api.showResumeIssue();const caixa=e.corpo.find(x=>x.id==='gmDriveReopen');
 botao(caixa,'Agora não').onclick();assert.equal(e.acessos,0);assert.equal(e.corpo.length,0);
});
test('falha de rede na recarga, sem cópia local, mostra o motivo junto da oferta',async()=>{
 const e=await env({erro:'Sem conexão com o Google Drive.'});e.api.showResumeIssue();
 assert.match(e.corpo.find(x=>x.id==='gmDriveReopen').children.find(x=>x.tag==='p').textContent,/Sem conexão com o Google Drive/);
});
test('com o projeto retomado do aparelho não há caixa: só a nota no histórico de comandos',async()=>{
 const e=await env({retomado:true});e.api.showResumeIssue();
 assert.equal(e.corpo.length,0);assert.match(e.log.join(' '),/retomado do que estava guardado neste aparelho/);
});
test('com outro conteúdo em tela a caixa não aparece',async()=>{
 const e=await env({outroConteudo:true});e.api.showResumeIssue();assert.equal(e.corpo.length,0);
});
