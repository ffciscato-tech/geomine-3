import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

// Contrato do modo clássico: abrir/editar não grava; Salvar/Salvar Como gravam
// apenas por uma ação explícita. Os arquivos e o IndexedDB abaixo são doubles.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const core=read('src/core/parts/26-project-persistence.js');
const chunked=read('src/modules/persistence/alagis-130-gravacao-por-partes.js');
const workspace=read('src/core/parts/11-geotiff-project-workspace.js');
const exportSource=read('src/core/parts/16-vector-export.js');

function declaration(source,name){
  const match=new RegExp(`\\b(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match,`${name} ausente`);
  const start=match.index,open=source.indexOf('{',start+match[0].length);
  let depth=0,state='code',escaped=false;
  for(let i=open;i<source.length;i++){
    const ch=source[i],next=source[i+1];
    if(state==='line'){if(ch==='\n')state='code';continue;}
    if(state==='block'){if(ch==='*'&&next==='/'){state='code';i++;}continue;}
    if(state!=='code'){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch===state)state='code';
      continue;
    }
    if(ch==='/'&&next==='/'){state='line';i++;continue;}
    if(ch==='/'&&next==='*'){state='block';i++;continue;}
    if(ch==='\''||ch==='"'||ch==='`'){state=ch;continue;}
    if(ch==='{')depth++;
    if(ch==='}'&&--depth===0)return source.slice(start,i+1);
  }
  assert.fail(`${name}: corpo não fechado`);
}

function harness(engine='core'){
  const calls={drafts:[],downloads:[],toasts:[],timers:[],intervals:[],cleared:[],
    picker:0,snapshots:0,opens:0,serial:[],maxConcurrent:0,active:0,loadShown:0,loadHidden:0};
  const options={picker:true,pickError:null,downloadError:null,downloadResult:true,weight:0,resolution:null,
    projectError:null,data:{app:'ALAGIS',projectId:'A',layers:[{name:'Camada',value:1}],rasters:[]}};
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{style:{},events:{},value:'',
      addEventListener(name,cb){this.events[name]=cb;},click(){this.clicked=true;}});
    return elements.get(id);
  };
  const S={projectId:'A',layers:[{name:'Camada'}],rasters:[],groups:[],
    auto:{on:false,name:'exemplo.ccmgis',handle:null,dirty:false,timer:null}};
  function handle(name='exemplo.ccmgis',config={}){
    let contents=JSON.stringify(options.data);
    const record={name,writes:0,reads:0,queries:0,requests:0,aborts:0,content:()=>contents,
      queryPermission:async()=>{record.queries++;return config.permission||'granted';},
      requestPermission:async()=>{record.requests++;return config.requestPermission||'granted';},
      async getFile(){
        record.reads++;
        if(config.readFailures>0){config.readFailures--;throw Object.assign(new Error('The requested file could not be read'),{name:config.readErrorName||'NotReadableError'});}
        const blob=new Blob([config.truncate?'':config.corruptSameSize?contents.replace('"value":1','"value":9'):contents]);
        return {name,size:blob.size,text:()=>{
          if(config.staleSnapshots>0){config.staleSnapshots--;throw Object.assign(new Error('The requested file could not be read'),{name:'NotReadableError'});}
          return blob.text();
        }};
      },
      async createWritable(){
        if(config.createError)throw config.createError;
        record.writes++;calls.active++;calls.maxConcurrent=Math.max(calls.maxConcurrent,calls.active);
        calls.serial.push('open:'+name);let parts=[],closed=false;
        return {
          async write(part){
            await Promise.resolve();
            if(config.writeError)throw config.writeError;
            parts.push(part);
          },
          async close(){
            if(config.closeError)throw config.closeError;
            contents=await new Blob(parts).text();closed=true;calls.active--;
            calls.serial.push('close:'+name);
          },
          async abort(){record.aborts++;if(!closed){closed=true;calls.active--;}}
        };
      }
    };
    return record;
  }
  const context={S,Blob,TextEncoder,TextDecoder,Date,JSON,Promise,Map,WeakMap,
    console:{info(){},warn(){},error(){}},navigator:{userAgent:'Desktop'},
    document:{getElementById:element},
    setTimeout(fn,delay){calls.timers.push(delay);queueMicrotask(fn);return calls.timers.length;},
    clearTimeout(){},setInterval(fn,delay){calls.intervals.push({fn,delay});return calls.intervals.length;},
    clearInterval(id){calls.cleared.push(id);},
    autoTag:text=>{calls.tag=text;},setOpenProjectName:name=>{S.currentProjectName=name;},
    showLoad(){calls.loadShown++;},hideLoad(){calls.loadHidden++;},toast:message=>calls.toasts.push(message),cmdLog(){},
    projectData(){calls.snapshots++;if(options.projectError)throw options.projectError;return structuredClone(options.data);},
    projectSyncNativeRasters:async()=>({ok:true}),
    fsApiOK:()=>options.picker,estimaPesoMB:()=>options.weight,
    escolheResolucaoSalvar:async()=>options.resolution,
    idbSet:async(key,value)=>calls.drafts.push({key,value}),
    autosaveStorageKey:id=>'manual-backup:'+id,autosaveOwnerUid:()=>null,
    async download(blob,name,report){
      if(options.downloadError)throw options.downloadError;
      if(options.downloadResult===false)return false;
      calls.downloads.push({name,text:await blob.text()});
      return report?.reportResult?{status:'download-requested',name,verified:false}:true;
    },
    async pickSaveFile(){calls.picker++;if(options.pickError)throw options.pickError;return options.destination;},
    lembraLocal(){},showSaveFilePicker(){},
    showOpenFilePicker:async()=>[options.openHandle],
    loadProject(data){calls.opens++;S.projectId=data.projectId||'A';options.data=data;},
    readProjectFileCompat:file=>file.text(),hasContent:()=>true,
  };
  context.window=context;context.globalThis=context;
  vm.createContext(context);
  const functions=['ensureRW','autosaveNow','startAutosave','saveProject','openProjectFile']
    .map(name=>declaration(core,name));
  vm.runInContext([declaration(workspace,'projectVerifyFileBytes'),declaration(workspace,'fileHandleWriteVerified'),...functions].join('\n'),context);
  vm.runInContext(read('src/modules/persistence/save-verification.js'),context);
  const inputStart=core.indexOf("document.getElementById('projIn').addEventListener('change'");
  const inputEnd=core.indexOf('/* ---------- Boot ---------- */',inputStart);
  assert.ok(inputStart>=0&&inputEnd>inputStart,'handler do seletor simples não encontrado');
  vm.runInContext(core.slice(inputStart,inputEnd),context);
  if(engine==='chunked')vm.runInContext(chunked,context);
  return {context,calls,options,S,handle,element};
}

let count=0;
const failures=[];
async function test(label,fn){
  try{await fn();count++;console.log('OK '+label);}
  catch(error){failures.push(label+': '+error.message);console.error('FALHA '+label+': '+error.message);}
}
const noSuccess=calls=>assert.ok(!calls.toasts.some(t=>/^Projeto (?:atualizado|salvo como)\b/.test(t)),
  'falha/cancelamento não pode ser anunciado como projeto salvo');

await test('estado inicial é manual',()=>assert.match(core,/S\.auto\s*=\s*\{\s*on\s*:\s*false/));
for(const engine of ['core','chunked']){
  await test(engine+': abrir vincula o arquivo sem timer nem snapshot',async()=>{
    const h=harness(engine),file=h.handle();h.S.auto.timer=77;h.S.auto.on=true;
    h.context.startAutosave(file.name,file);
    assert.equal(h.S.auto.handle,file);assert.equal(h.S.auto.name,file.name);
    assert.equal(h.S.auto.on,false);assert.equal(h.S.auto.timer,null);
    assert.deepEqual(h.calls.cleared,[77]);assert.equal(h.calls.intervals.length,0);
    assert.equal(h.calls.timers.length,0);assert.equal(h.calls.snapshots,0);
    assert.equal(h.calls.drafts.length,0);assert.equal(file.writes,0);
  });
  await test(engine+': entrypoint antigo nunca reativa gravação automática',async()=>{
    const h=harness(engine),file=h.handle();h.S.auto.handle=file;h.S.auto.on=true;
    assert.equal(await h.context.autosaveNow(false),false);
    assert.equal(await h.context.autosaveNow(true),false);
    assert.equal(file.writes,0);assert.equal(file.queries,0);
    assert.equal(h.calls.drafts.length,0);assert.equal(h.calls.snapshots,0);
  });
  await test(engine+': abertura pelo handle apenas lê',async()=>{
    const h=harness(engine);h.options.openHandle=h.handle('aberto.ccmgis');
    await h.context.openProjectFile();
    assert.equal(h.calls.opens,1);assert.equal(h.S.auto.handle,h.options.openHandle);
    assert.equal(h.S.auto.on,false);assert.equal(h.calls.drafts.length,0);
    assert.equal(h.calls.snapshots,0);assert.equal(h.calls.intervals.length,0);
    assert.equal(h.options.openHandle.writes,0);
  });
  await test(engine+': abertura pelo input apenas lê e não copia para rascunho',async()=>{
    const h=harness(engine),f=await h.handle('input.ccmgis').getFile();
    const target={files:[f],value:'arquivo'};
    await h.element('projIn').events.change({target});
    assert.equal(h.calls.opens,1);assert.equal(h.S.auto.handle,null);
    assert.equal(h.S.auto.name,'input.ccmgis');assert.equal(target.value,'');
    assert.equal(h.S.auto.on,false);assert.equal(h.calls.drafts.length,0);
    assert.equal(h.calls.snapshots,0);assert.equal(h.calls.intervals.length,0);
  });
  await test(engine+': Salvar escreve no mesmo arquivo sem seletor',async()=>{
    const h=harness(engine),file=h.handle();h.S.auto.handle=file;
    assert.equal(await h.context.saveProject(false),true);
    assert.equal(file.writes,1);assert.equal(h.calls.picker,0);
    assert.equal(JSON.parse(file.content()).layers[0].value,1);
    assert.equal(h.S.auto.on,false);assert.equal(h.calls.intervals.length,0);
  });
  await test(engine+': Salvar sem destino abre Salvar Como',async()=>{
    const h=harness(engine);h.options.destination=h.handle('novo.ccmgis');
    assert.equal(await h.context.saveProject(false),true);
    assert.equal(h.calls.picker,1);assert.equal(h.options.destination.writes,1);
    assert.equal(h.S.auto.handle,h.options.destination);assert.equal(h.S.auto.on,false);
  });
  await test(engine+': Salvar Como troca somente o destino confirmado',async()=>{
    const h=harness(engine),old=h.handle('antigo.ccmgis');h.S.auto.handle=old;
    h.options.destination=h.handle('novo.ccmgis');
    assert.equal(await h.context.saveProject(true),true);
    assert.equal(old.writes,0);assert.equal(h.options.destination.writes,1);
    assert.equal(h.S.auto.handle,h.options.destination);assert.equal(h.S.auto.on,false);
  });
  await test(engine+': navegador sem seletor inicia download sem confirmar gravação',async()=>{
    const h=harness(engine);h.options.picker=false;
    assert.equal(await h.context.saveProject(false),false);
    assert.equal(h.calls.downloads.length,1);assert.equal(h.calls.picker,0);
    assert.equal(JSON.parse(h.calls.downloads[0].text).layers[0].value,1);
    assert.equal(h.S.auto.on,false);
    assert.equal(await h.context.saveProject(false),false);
    assert.equal(h.calls.downloads.length,2,'cada clique explícito permite uma nova cópia');
  });
  await test(engine+': cancelar seletor não altera destino nem anuncia sucesso',async()=>{
    const h=harness(engine),old=h.handle();h.S.auto.handle=old;
    h.options.pickError=Object.assign(new Error('cancelado'),{name:'AbortError'});
    assert.equal(await h.context.saveProject(true),false);
    assert.equal(h.S.auto.handle,old);assert.equal(old.writes,0);
    assert.equal(h.calls.downloads.length,0);noSuccess(h.calls);
  });
  await test(engine+': cancelar redução de resolução não escreve',async()=>{
    const h=harness(engine),file=h.handle();h.S.auto.handle=file;
    h.S.rasters=[{d:{}}];h.options.weight=300;h.options.resolution=false;
    assert.equal(await h.context.saveProject(false),false);
    assert.equal(file.writes,0);assert.equal(h.calls.drafts.length,0);noSuccess(h.calls);
    assert.ok(h.calls.loadHidden>0,'cancelamento deve fechar o progresso de sincronização nativa');
    assert.equal(h.S._saveTargetCell,null);
  });
  await test(engine+': troca de projeto durante seletor cancela antes de sincronizar rasters',async()=>{
    const h=harness(engine),file=h.handle();let syncCalls=0;
    h.context.pickSaveFile=async()=>{h.S.projectId='B';h.S._saveTargetCell=42;return file;};
    h.S.rasters=[{d:{}}];h.context.projectSyncNativeSources=async()=>{syncCalls++;return {ok:true};};
    assert.equal(await h.context.saveProject(true),false);
    assert.equal(syncCalls,0);assert.equal(file.writes,0);assert.equal(h.calls.snapshots,0);
    assert.equal(h.S._saveTargetCell,42,'um salvamento antigo não altera a resolução de B');noSuccess(h.calls);
  });
  await test(engine+': troca de projeto durante sincronização preserva a resolução de B',async()=>{
    const h=harness(engine),file=h.handle();h.S.auto.handle=file;h.S.rasters=[{d:{}}];
    h.context.projectSyncNativeSources=async()=>{h.S.projectId='B';h.S._saveTargetCell=42;return {ok:true};};
    assert.equal(await h.context.saveProject(false),false);
    assert.equal(file.writes,0);assert.equal(h.calls.snapshots,0);assert.equal(h.S._saveTargetCell,42);
    assert.ok(h.calls.loadHidden>0);noSuccess(h.calls);
  });
  await test(engine+': troca de projeto durante escolha da resolução não limpa a resolução de B',async()=>{
    const h=harness(engine),file=h.handle();h.S.auto.handle=file;h.S.rasters=[{d:{}}];h.options.weight=300;
    h.context.escolheResolucaoSalvar=async()=>{h.S.projectId='B';h.S._saveTargetCell=42;return 5;};
    assert.equal(await h.context.saveProject(false),false);
    assert.equal(file.writes,0);assert.equal(h.calls.snapshots,0);assert.equal(h.S._saveTargetCell,42);
    assert.ok(h.calls.loadHidden>0);noSuccess(h.calls);
  });
  await test(engine+': permissão recusada não grava nem sinaliza sucesso',async()=>{
    const h=harness(engine);h.S.auto.handle=h.handle('negado.ccmgis',{permission:'prompt',requestPermission:'denied'});
    assert.equal(await h.context.saveProject(false),false);
    assert.equal(h.S.auto.handle.writes,0);assert.equal(h.S.auto.handle.requests,1);noSuccess(h.calls);
  });
  await test(engine+': erro de escrita aborta transação e retorna falha',async()=>{
    const h=harness(engine),file=h.handle('falha.ccmgis',{writeError:new Error('disco cheio')});h.S.auto.handle=file;
    assert.equal(await h.context.saveProject(false),false);
    assert.equal(file.aborts,1);noSuccess(h.calls);
  });
  await test(engine+': tamanho gravado incorreto não passa como sucesso',async()=>{
    const h=harness(engine);h.S.auto.handle=h.handle('truncado.ccmgis',{truncate:true});
    assert.equal(await h.context.saveProject(false),false);noSuccess(h.calls);
  });
  await test(engine+': conteúdo antigo do mesmo tamanho não passa como sucesso',async()=>{
    const h=harness(engine);h.S.auto.handle=h.handle('antigo.ccmgis',{corruptSameSize:true});
    assert.equal(await h.context.saveProject(false),false);noSuccess(h.calls);
    assert.match(h.calls.toasts.join(' '),/conteúdo gravado difere/);
    assert.equal(h.calls.drafts.length,1,'snapshot correto continua recuperável mesmo se a verificação falhou');
  });
  await test(engine+': falha no destino de Salvar Como não baixa silenciosamente outra cópia',async()=>{
    const h=harness(engine),old=h.handle('original.ccmgis');h.S.auto.handle=old;
    h.options.destination=h.handle('escolhido.ccmgis',{createError:new Error('disco cheio')});
    assert.equal(await h.context.saveProject(true),false);assert.equal(h.calls.downloads.length,0);
    assert.equal(h.S.auto.handle,old);assert.equal(h.calls.drafts.length,1);noSuccess(h.calls);
  });
  await test(engine+': nome dentro do snapshot e da recuperação é o destino realmente escolhido',async()=>{
    const h=harness(engine);h.options.destination=h.handle('NomeNovo.ccmgis');
    assert.equal(await h.context.saveProject(true),true);
    assert.equal(JSON.parse(h.options.destination.content()).projectFileName,'NomeNovo.ccmgis');
    assert.equal(h.calls.drafts[0].value.name,'NomeNovo.ccmgis');
  });
  await test(engine+': falha de serialização mantém estado não salvo',async()=>{
    const h=harness(engine),file=h.handle();h.S.auto.handle=file;h.options.projectError=new Error('serialização');
    assert.equal(await h.context.saveProject(false),false);
    assert.equal(file.writes,0);assert.equal(h.calls.drafts.length,0);noSuccess(h.calls);
  });
  await test(engine+': fallback de download não anuncia confirmação e preserva recuperação',async()=>{
    const h=harness(engine);h.options.pickError=new Error('seletor indisponível');
    assert.equal(await h.context.saveProject(true),false);assert.equal(h.calls.downloads.length,1);
    assert.equal(h.calls.drafts.length,1);assert.match(h.calls.toasts.at(-1),/não foi alterado/);
    const f=harness(engine);f.options.pickError=new Error('seletor indisponível');
    f.options.downloadError=new Error('download indisponível');
    assert.equal(await f.context.saveProject(true),false);noSuccess(f.calls);
  });
  for(const fallback of [false,true]){
    await test(engine+': cancelar download '+(fallback?'de fallback':'direto')+' mantém estado não salvo',async()=>{
      const h=harness(engine);h.options.downloadResult=false;
      if(fallback)h.options.pickError=new Error('seletor indisponível');
      else h.options.picker=false;
      assert.equal(await h.context.saveProject(true),false);
      assert.equal(h.calls.downloads.length,0);assert.equal(h.S.auto.handle,null);
      assert.equal(h.S.auto.on,false);noSuccess(h.calls);
    });
  }
}

await test('download real: cancelar seletor retorna false sem iniciar fallback',async()=>{
  const h=harness();h.options.pickError=Object.assign(new Error('cancelado'),{name:'AbortError'});
  vm.runInContext(declaration(exportSource,'download'),h.context);
  assert.equal(await h.context.download(new Blob(['projeto']),'teste.ccmgis'),false);
  assert.equal(h.calls.picker,1);assert.equal(h.calls.toasts.length,0);
});
await test('download real: arquivo confirmado retorna true',async()=>{
  const h=harness();h.options.destination=h.handle('teste.ccmgis');
  vm.runInContext(declaration(exportSource,'download'),h.context);
  assert.equal(await h.context.download(new Blob(['projeto']),'teste.ccmgis'),true);
  assert.equal(h.options.destination.content(),'projeto');
});
await test('download real: cancelar compartilhamento retorna false',async()=>{
  const h=harness();h.options.picker=false;
  h.context.File=class extends Blob{constructor(parts,name,opts){super(parts,opts);this.name=name;}};
  h.context.navigator.canShare=()=>true;
  h.context.navigator.share=async()=>{throw Object.assign(new Error('cancelado'),{name:'AbortError'});};
  vm.runInContext(declaration(exportSource,'download'),h.context);
  assert.equal(await h.context.download(new Blob(['imagem']),'teste.png'),false);
  assert.equal(h.calls.toasts.length,0);
});
await test('download real: link de download retorna true e conserva nome',async()=>{
  const h=harness();h.options.picker=false;const anchor={click(){this.clicked=true;}};
  h.context.document.createElement=()=>anchor;
  h.context.URL={createObjectURL:()=> 'blob:simulado',revokeObjectURL(){}};
  vm.runInContext(declaration(exportSource,'download'),h.context);
  assert.equal(await h.context.download(new Blob(['projeto']),'teste.ccmgis'),true);
  assert.equal(anchor.download,'teste.ccmgis');assert.equal(anchor.clicked,true);
});
await test('download com diagnóstico: clique no link não é confirmação de gravação',async()=>{
  const h=harness();h.options.picker=false;const anchor={click(){this.clicked=true;}};
  h.context.document.createElement=()=>anchor;
  h.context.URL={createObjectURL:()=> 'blob:simulado',revokeObjectURL(){}};
  vm.runInContext(declaration(exportSource,'download'),h.context);
  const result=await h.context.download(new Blob(['projeto']),'teste.ccmgis',{reportResult:true});
  assert.equal(result.status,'download-requested');assert.equal(result.verified,false);assert.equal(result.handle,null);
});
await test('download com diagnóstico: arquivo confirmado informa destino',async()=>{
  const h=harness();h.options.destination=h.handle('teste.ccmgis');
  vm.runInContext(declaration(exportSource,'download'),h.context);
  const result=await h.context.download(new Blob(['projeto']),'teste.ccmgis',{reportResult:true});
  assert.equal(result.status,'written');assert.equal(result.handle,h.options.destination);assert.equal(result.verified,true);
});

await test('gravação por partes: cliques consecutivos mantêm fila por arquivo',async()=>{
  const h=harness('chunked'),file=h.handle();h.S.auto.handle=file;
  const results=await Promise.all([h.context.saveProject(false),h.context.saveProject(false)]);
  assert.deepEqual(results,[true,true]);assert.equal(file.writes,2);
  assert.equal(h.calls.maxConcurrent,1,'duas transações de escrita não podem disputar o mesmo arquivo');
  assert.equal(h.calls.active,0);assert.equal(h.S.auto.on,false);
});
await test('gravação por partes: falha não envenena a fila',async()=>{
  const h=harness('chunked'),config={writeError:new Error('falha transitória')},file=h.handle('fila.ccmgis',config);
  h.S.auto.handle=file;assert.equal(await h.context.saveProject(false),false);
  config.writeError=null;assert.equal(await h.context.saveProject(false),true);
  assert.equal(file.aborts,1);assert.equal(h.calls.active,0);assert.equal(h.calls.maxConcurrent,1);
});
await test('gravação por partes: troca de projeto durante preparação cancela',async()=>{
  const h=harness('chunked'),file=h.handle();h.S.auto.handle=file;
  const saving=h.context.saveProject(false);h.S.projectId='B';
  assert.equal(await saving,false);assert.equal(file.writes,0);noSuccess(h.calls);
});

for(const engine of ['core','chunked']){
  for(const config of [{readFailures:2},{staleSnapshots:2}])await test(engine+': renova referência ilegível sem repetir escrita '+JSON.stringify(config),async()=>{
    const h=harness(engine),file=h.handle('mesmo.ccmgis',config);h.S.auto.handle=file;
    assert.equal(await h.context.saveProject(false),true);assert.equal(file.writes,1);assert.equal(file.reads,3);
    assert.equal(h.S.auto.handle,file);assert.equal(h.calls.picker,0);assert.equal(h.calls.downloads.length,0);
    assert.equal(JSON.parse(file.content()).layers[0].value,1);
  });
  await test(engine+': erro persistente não confirma salvamento nem faz download escondido',async()=>{
    const h=harness(engine),file=h.handle('falha.ccmgis',{readFailures:10});h.S.auto.handle=file;
    assert.equal(await h.context.saveProject(false),false);assert.equal(file.writes,1);assert.equal(file.reads,3);
    assert.equal(h.calls.downloads.length,0);assert.equal(h.calls.drafts.length,1);noSuccess(h.calls);
    assert.ok(h.calls.toasts.some(t=>t.includes('conferir o arquivo gravado')&&t.includes('não está confirmada')));
  });
  await test(engine+': permissão negada e conteúdo divergente não são ocultados por retry',async()=>{
    for(const config of [{readFailures:5,readErrorName:'NotAllowedError'},{corruptSameSize:true}]){
      const h=harness(engine),file=h.handle('divergente.ccmgis',config);h.S.auto.handle=file;
      assert.equal(await h.context.saveProject(false),false);assert.equal(file.writes,1);assert.equal(file.reads,1);noSuccess(h.calls);
    }
  });
}

// These cases load the real save-only target policy and manual-session wrapper.
// The original 64 scenarios above retain their legacy harness unchanged.
function targetHarness(engine='chunked',ua='Mozilla/5.0 (Linux; Android 14; Tablet)'){
  const h=harness(engine),c=h.context;
  c.navigator.userAgent=ua;c.navigator.maxTouchPoints=/Macintosh/.test(ua)?5:0;
  c.navigator.userActivation={isActive:true};
  vm.runInContext(declaration(read('src/core/parts/03-file-loading-qgis.js'),'fsApiOK'),c);
  vm.runInContext(declaration(exportSource,'pickSaveFile'),c);
  h.calls.order=[];h.calls.pickerOptions=[];
  c.showSaveFilePicker=async opt=>{
    h.calls.picker++;h.calls.order.push('picker');h.calls.pickerOptions.push(opt);
    assert.equal(c.navigator.userActivation.isActive,true,'picker opened after activation-expiring preparation');
    if(h.options.pickError)throw h.options.pickError;
    return h.options.destination;
  };
  const snapshot=c.projectData;
  c.projectData=()=>{h.calls.order.push('snapshot');return snapshot();};
  c.projectSyncNativeSources=async()=>{
    h.calls.order.push('sync');c.navigator.userActivation.isActive=false;return {ok:true};
  };
  c.projectSyncNativeRasters=c.projectSyncNativeSources;
  vm.runInContext(read('src/modules/persistence/project-save-target.js'),c);
  c.document.readyState='loading';c.document.addEventListener=()=>{};c.addEventListener=()=>{};
  for(const id of ['autoTag','a3OpenProjectName'])h.element(id).classList={toggle(){}};
  vm.runInContext(read('src/modules/persistence/session-autosave.js'),c);
  const state=c.GeoMineSessionAutosave.state;
  state.booted=true;state.dirty=true;state.version=1;h.S.auto.dirty=true;
  return {...h,state};
}

for(const engine of ['core','chunked']){
  await test(engine+': Android usa seletor disponível antes do raster/snapshot e reutiliza o destino confirmado',async()=>{
    const h=targetHarness(engine),c=h.context,file=h.handle('Drive-escolhido.ccmgis');
    h.options.destination=file;h.S.rasters=[{d:{nc:1,nr:1,cs:1}}];
    h.S._lastSaved={name:'antigo.ccmgis'};h.S._lastDir={name:'pasta-antiga'};
    assert.equal(c.fsApiOK(),false,'importers must keep the existing mobile safety policy');
    assert.equal(c.GeoMineProjectSaveTarget.available(),true);
    assert.equal(await c.saveProject(false),true);
    assert.deepEqual(h.calls.order.slice(0,3),['picker','sync','snapshot']);
    assert.deepEqual(JSON.parse(JSON.stringify(h.calls.pickerOptions[0])),{suggestedName:'exemplo.ccmgis',excludeAcceptAllOption:false});
    assert.equal(file.writes,1);assert.equal(file.reads,1);assert.equal(h.S.auto.handle,file);
    assert.equal(h.calls.downloads.length,0);assert.equal(h.state.dirty,false);assert.equal(h.S.auto.dirty,false);
    assert.equal(JSON.parse(file.content()).projectFileName,'Drive-escolhido.ccmgis');
    h.options.data.layers[0].value=2;c.GeoMineSessionAutosave.markDirty('editar depois de salvar');
    assert.equal(await c.saveProject(false),true);
    assert.equal(h.calls.picker,1,'second Save must not choose another file');
    assert.equal(file.writes,2);assert.equal(file.reads,2);assert.equal(JSON.parse(file.content()).layers[0].value,2);
    assert.equal(h.state.dirty,false);assert.equal(h.state.writeActive,null);assert.equal(c.fsApiOK(),false);
  });
  await test(engine+': cancelar seletor Android preserva alterações e não baixa outra cópia',async()=>{
    const h=targetHarness(engine);h.options.pickError=Object.assign(Error('cancelado'),{name:'AbortError'});
    h.S.rasters=[{d:{nc:1,nr:1,cs:1}}];
    assert.equal(await h.context.saveProject(true),false);
    assert.deepEqual(h.calls.order,['picker']);assert.equal(h.calls.snapshots,0);
    assert.equal(h.calls.downloads.length,0);assert.equal(h.calls.drafts.length,0);assert.equal(h.S.auto.handle,null);
    assert.equal(h.state.dirty,true);assert.equal(h.S.auto.dirty,true);assert.equal(h.state.writeActive,null);noSuccess(h.calls);
  });
  await test(engine+': Android sem API continua com download sem anunciar escrita confirmada',async()=>{
    const h=targetHarness(engine);delete h.context.showSaveFilePicker;
    assert.equal(h.context.GeoMineProjectSaveTarget.available(),false);
    assert.equal(await h.context.saveProject(false),false);
    assert.equal(h.calls.picker,0);assert.equal(h.calls.downloads.length,1);assert.equal(h.calls.drafts.length,1);
    assert.equal(h.S.auto.handle,null);assert.equal(h.state.dirty,true);assert.equal(h.S.auto.dirty,true);
    assert.equal(h.state.writeActive,null);noSuccess(h.calls);
  });
  for(const errorName of ['NotSupportedError','SecurityError'])await test(engine+': seletor Android rejeita '+errorName+' sem retry nem falso sucesso',async()=>{
    const h=targetHarness(engine),old=h.handle('original.ccmgis');
    h.S.auto.handle=old;h.options.pickError=Object.assign(Error('picker unavailable'),{name:errorName});
    assert.equal(h.context.GeoMineProjectSaveTarget.available(),true);
    assert.equal(await h.context.saveProject(true),false);
    assert.equal(h.calls.picker,1,'mobile picker rejection must not retry with stale desktop options');
    assert.equal(h.calls.downloads.length,1);assert.equal(h.calls.drafts.length,1);
    assert.equal(h.S.auto.handle,old);assert.equal(old.writes,0);
    assert.equal(h.state.dirty,true);assert.equal(h.S.auto.dirty,true);assert.equal(h.state.writeActive,null);
    assert.ok(h.calls.toasts.some(t=>t.includes('Download iniciado')&&t.includes('não está confirmada')));
    noSuccess(h.calls);
  });
  for(const [label,config,expectedReads] of [
    ['escrita recusada',{writeError:Object.assign(Error('provider denied write'),{name:'NotAllowedError'})},0],
    ['Drive não entrega arquivo para conferência',{readFailures:10},3],
    ['conteúdo corrompido com mesmo tamanho',{corruptSameSize:true},1]
  ])await test(engine+': Android '+label+' não limpa alterações nem troca destino',async()=>{
    const h=targetHarness(engine),old=h.handle('original.ccmgis'),file=h.handle('novo.ccmgis',config);
    h.S.auto.handle=old;h.options.destination=file;
    assert.equal(await h.context.saveProject(true),false);
    assert.equal(file.writes,1);assert.equal(file.reads,expectedReads);assert.equal(old.writes,0);
    assert.equal(h.S.auto.handle,old);assert.equal(h.calls.downloads.length,0);assert.equal(h.calls.drafts.length,1);
    assert.equal(h.state.dirty,true);assert.equal(h.S.auto.dirty,true);assert.equal(h.state.writeActive,null);noSuccess(h.calls);
  });
  await test(engine+': Android pode escolher novo destino após perder permissão do handle anterior',async()=>{
    const h=targetHarness(engine),old=h.handle('sem-permissao.ccmgis',{permission:'prompt',requestPermission:'denied'}),file=h.handle('recuperado.ccmgis');
    h.S.auto.handle=old;h.options.destination=file;
    assert.equal(await h.context.saveProject(false),false);assert.equal(old.writes,0);assert.equal(h.calls.picker,0);
    assert.equal(h.state.dirty,true);assert.equal(h.S.auto.handle,old);
    assert.equal(await h.context.saveProject(true),true);assert.equal(h.calls.picker,1);
    assert.equal(h.S.auto.handle,file);assert.equal(file.writes,1);assert.equal(h.state.dirty,false);
  });
}

await test('política de destino mantém tipos e pasta inicial no desktop',async()=>{
  const h=targetHarness('chunked','Mozilla/5.0 (Windows NT 10.0; Win64; x64)'),c=h.context;
  const anchor={name:'mesmo.ccmgis'},types=[{description:'Projeto CCMGIS',accept:{'application/x-ccmgis':['.ccmgis']}}];
  h.options.destination=h.handle();const opts={suggestedName:'projeto.ccmgis',excludeAcceptAllOption:true,types,startIn:anchor};
  assert.equal(c.fsApiOK(),true);assert.equal(await c.GeoMineProjectSaveTarget.pick(opts),h.options.destination);
  const actual=h.calls.pickerOptions[0];assert.equal(actual.startIn,anchor);assert.equal(actual.types,types);
  assert.equal(actual.excludeAcceptAllOption,true);assert.equal(actual.suggestedName,'projeto.ccmgis');
  assert.equal(opts.startIn,anchor);assert.equal(opts.types,types,'policy must not mutate caller options');
});
await test('política móvel também cobre iPad com identificação desktop sem alterar importadores',async()=>{
  const h=targetHarness('chunked','Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)'),c=h.context;
  h.options.destination=h.handle();assert.equal(c.fsApiOK(),false);assert.equal(c.GeoMineProjectSaveTarget.available(),true);
  await c.GeoMineProjectSaveTarget.pick({suggestedName:'ipad.ccmgis',startIn:{name:'old'},types:[{accept:{'application/x-ccmgis':['.ccmgis']}}],excludeAcceptAllOption:true});
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.pickerOptions[0])),{suggestedName:'ipad.ccmgis',excludeAcceptAllOption:false});
});

if(failures.length){
  console.error(`\n${count} cenários atendidos; ${failures.length} falhas:\n${failures.join('\n')}`);
  process.exitCode=1;
}else console.log(`\nSalvamento manual: ${count} cenários validados.`);
