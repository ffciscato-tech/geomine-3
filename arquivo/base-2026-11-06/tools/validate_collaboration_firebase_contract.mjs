import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

const firebase=JSON.parse(read('firebase.json'));
assert.equal(firebase.hosting?.public,'public',
  'a colaboração não pode retirar a configuração existente do Hosting');
assert.equal(firebase.firestore?.rules,'firestore.rules',
  'firebase.json deve publicar as regras do Firestore');
assert.equal(firebase.firestore?.indexes,'firestore.indexes.json',
  'firebase.json deve declarar o arquivo de índices do Firestore');
assert.equal(firebase.storage?.rules,'storage.rules',
  'firebase.json deve publicar as regras do Storage');

const firestore=read('firestore.rules');
const storage=read('storage.rules');
const indexes=JSON.parse(read('firestore.indexes.json'));
const gate=read('web/gate.template.html');
const publisher=read('tools/publicar_web.py');

/* Auth no portão é UX. A autorização real precisa estar nas duas linguagens
   de regras para que chamadas diretas ao SDK não contornem o domínio. */
for(const [name,rules] of [['Firestore',firestore],['Storage',storage]]){
  assert.match(rules,/request\.auth\s*!=\s*null/,
    `${name}: acesso anônimo deve ser recusado nas regras`);
  assert.match(rules,/request\.auth\.token\.email/,
    `${name}: a regra deve conferir o e-mail autenticado, não dados do cliente`);
  assert.match(rules,/ccmeng[^'"\n]*net/i,
    `${name}: o domínio corporativo @ccmeng.net deve ser exigido`);
  assert.match(rules,/request\.auth\.token\.email_verified\s*==\s*true/,
    `${name}: somente contas com e-mail verificado devem ser autorizadas`);
  assert.match(rules,/function\s+isWriter[\s\S]*?\['owner',\s*'editor'\]/,
    `${name}: somente owner/editor devem possuir permissão de escrita`);
}

for(const collection of ['rooms','members','invites','presence','locks','resources','operations']){
  assert.match(firestore,new RegExp('(?:match\\s+\\/)?'+collection.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),
    `firestore.rules não contempla ${collection}`);
}
assert.match(storage,/rooms\/\{roomId\}/,
  'Storage deve isolar os arquivos por sala');
assert.match(storage,/snapshots/,
  'Storage deve proteger os snapshots do projeto');
assert.match(storage,/payloads/,
  'Storage deve proteger as revisões de camadas');

/* Uma associação órfã não pode manter acesso depois da remoção da sala. */
assert.match(firestore,/function\s+isMember\(roomId\)[\s\S]*?exists\(roomPath\(roomId\)\)[\s\S]*?exists\(memberPath\(roomId,\s*request\.auth\.uid\)\)/,
  'Firestore: isMember deve exigir que a sala e a associação existam');
assert.match(storage,/function\s+isMember\(roomId\)[\s\S]*?firestore\.exists\(\/databases\/\(default\)\/documents\/rooms\/\$\(roomId\)\)[\s\S]*?\/members\/\$\(request\.auth\.uid\)/,
  'Storage: isMember deve exigir que a sala e a associação existam');

/* listRooms/listInvitations usam collectionGroup. A regra recursiva precisa
   provar o predicado da consulta sem abrir documentos de outros usuários. */
assert.match(firestore,/match\s+\/\{path=\*\*\}\/members\/\{memberId\}[\s\S]*?allow\s+list:\s*if\s+isCcmUser\(\)[\s\S]*?resource\.data\.uid\s*==\s*request\.auth\.uid/,
  'Firestore deve limitar a collection-group members ao UID autenticado');
assert.match(firestore,/match\s+\/\{path=\*\*\}\/invites\/\{inviteId\}[\s\S]*?allow\s+list:\s*if\s+isCcmUser\(\)[\s\S]*?resource\.data\.emailLower\s*==\s*request\.auth\.token\.email\.lower\(\)/,
  'Firestore deve limitar a collection-group invites ao e-mail autenticado');

const override=(collectionGroup,fieldPath)=>indexes.fieldOverrides?.find(
  item=>item.collectionGroup===collectionGroup && item.fieldPath===fieldPath);
for(const [collectionGroup,fieldPath] of [['members','uid'],['invites','emailLower']]){
  const item=override(collectionGroup,fieldPath);
  assert.ok(item,`falta o índice collection-group ${collectionGroup}.${fieldPath}`);
  const orders=new Set((item.indexes||[])
    .filter(index=>index.queryScope==='COLLECTION_GROUP').map(index=>index.order));
  assert.ok(orders.has('ASCENDING') && orders.has('DESCENDING'),
    `${collectionGroup}.${fieldPath} precisa dos índices collection-group ascendente e descendente`);
}

/* Arquivos publicados são revisões, não locais mutáveis. */
assert.doesNotMatch(storage,/allow\s+create\s*,\s*update/,
  'Storage não deve conceder create e update juntos');
assert.equal((storage.match(/allow\s+update:\s*if\s+false\s*;/g)||[]).length,2,
  'snapshots e payloads devem ser imutáveis');
assert.equal((storage.match(/allow\s+delete:\s*if\s+isOwner\(roomId\)\s*;/g)||[]).length,2,
  'somente o proprietário pode remover snapshots ou payloads');

/* A sala, o recurso e a operação avançam a mesma sequência no mesmo commit. */
assert.match(firestore,/function\s+advancesSequence\(roomId\)[\s\S]*?getAfter\(roomPath\(roomId\)\)\.data\.nextSeq[\s\S]*?get\(roomPath\(roomId\)\)\.data\.nextSeq\s*\+\s*1/,
  'Firestore deve conferir o incremento atômico de nextSeq');
assert.ok((firestore.match(/advancesSequence\(roomId\)/g)||[]).length>=4,
  'create/update de resource e create de operation devem exigir o avanço da sequência');
assert.match(firestore,/request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)[\s\S]*?\.hasOnly\(\['name',\s*'description',\s*'baseSnapshot',\s*'updatedAt',\s*'nextSeq'\]\)/,
  'updates da sala devem ficar restritos aos campos previstos');

for(const invariant of [
  /baseRevision\s*\+\s*1\s*==\s*request\.resource\.data\.revision/,
  /request\.resource\.data\.resourceId[\s\S]*?getAfter\(resourcePath\(roomId,\s*request\.resource\.data\.resourceKey\)\)\.data\.resourceId/,
  /request\.resource\.data\.layerId[\s\S]*?getAfter\(resourcePath\(roomId,\s*request\.resource\.data\.resourceKey\)\)\.data\.layerId/,
  /request\.resource\.data\.payloadRef[\s\S]*?getAfter\(resourcePath\(roomId,\s*request\.resource\.data\.resourceKey\)\)\.data\.payloadRef/,
  /request\.resource\.data\.clientId[\s\S]*?getAfter\(resourcePath\(roomId,\s*request\.resource\.data\.resourceKey\)\)\.data\.updatedByDevice/,
  /request\.resource\.data\.metadata\.clientId\s*==\s*request\.resource\.data\.clientId/,
  /getAfter\(resourcePath\(roomId,\s*request\.resource\.data\.resourceKey\)\)\.data\.updatedBy[\s\S]*?==\s*request\.auth\.uid/
]) assert.match(firestore,invariant,
  'a operação deve ser consistente com revisão, recurso, payload, cliente e autor');

const memberUpdate=firestore.match(/match\s+\/members\/\{memberId\}[\s\S]*?allow\s+update:[\s\S]*?allow\s+delete:/)?.[0]||'';
assert.match(memberUpdate,/request\.resource\.data\.role\s+in\s+\['editor',\s*'viewer'\]/,
  'papéis de membros não proprietários devem se limitar a editor/viewer');
assert.match(memberUpdate,/memberId\s*==\s*get\(roomPath\(roomId\)\)\.data\.ownerUid[\s\S]*?resource\.data\.role\s*==\s*'owner'[\s\S]*?request\.resource\.data\.role\s*==\s*'owner'/,
  'o papel do proprietário original deve permanecer owner');

assert.ok(Array.isArray(indexes.indexes),
  'firestore.indexes.json deve ser um manifesto de índices válido');

/* O aplicativo offline continua sem Firebase. Somente o gate da versão web
   injeta o provider autenticado, mantendo a separação entre domínio e SDK. */
assert.match(gate,/window\.GeoMineCloudProvider\s*=/,
  'o gate autenticado deve expor window.GeoMineCloudProvider ao GeoMine');
for(const method of [
  'createRoom','listRooms','getRoom','joinRoom','leaveRoom',
  'inviteMember','listInvitations','watchInvites','setMemberRole','updateMemberRole','removeMember',
  'watchRoom','watchPresence','watchLocks','watchOperations','watchHistory',
  'heartbeat','acquireLock','renewLock','releaseLock',
  'uploadSnapshot','downloadSnapshot','uploadPayload','downloadPayload',
  'publishLayerReplace','dispose'
]){
  assert.match(gate,new RegExp('\\b'+method+'\\b'),
    `GeoMineCloudProvider deve implementar ${method}()`);
}
assert.match(gate,/firebase-firestore\.js/,
  'o gate deve carregar o SDK modular do Firestore');
assert.match(gate,/firebase-storage\.js/,
  'o gate deve carregar o SDK modular do Storage');
assert.match(gate,/sendEmailVerification/,
  'contas por senha devem receber verificação de e-mail');
assert.match(gate,/!u\.emailVerified/,
  'o portão não pode liberar uma conta com e-mail ainda não verificado');
assert.match(gate,/const\s+usuario[\s\S]*?u\.emailVerified/,
  'o provider também deve recusar sessões sem e-mail verificado');
const leaveBody=gate.match(/async\s+leaveRoom\(id\)\s*\{([\s\S]*?)\n\s*\},\n\s*async\s+removeSelfFromRoom/)?.[1]||'';
assert.doesNotMatch(leaveBody,/deleteDoc\(membroRef/,
  'Sair da sala não pode apagar a associação do usuário');
assert.match(leaveBody,/presence/,
  'Sair da sala deve encerrar somente a presença');
const watchOps=gate.match(/watchOperations\(id,\s*retorno,\s*opcoes=\{\}\)\s*\{([\s\S]*?)\n\s*\},\n\s*watchHistory/)?.[1]||'';
assert.doesNotMatch(watchOps,/limit\s*\(/,
  'o listener ascendente de operações não pode parar nas primeiras 500');
assert.match(gate,/if\(!\['editor','viewer'\]\.includes\(role\)\)/,
  'a ponte não deve oferecer promoção informal para owner');
assert.match(gate,/entrada\.baseRevision===undefined\s*\|\|\s*entrada\.baseRevision===null/,
  'publicação deve recusar baseRevision ausente');

/* publicar_web.py reescreve firebase.json e public/index.html. Esta proteção
   evita uma publicação futura apagar silenciosamente regras ou o provider. */
assert.match(publisher,/firestore\.rules/,
  'publicar_web.py precisa conservar a configuração do Firestore');
assert.match(publisher,/firestore\.indexes\.json/,
  'publicar_web.py precisa conservar os índices do Firestore');
assert.match(publisher,/storage\.rules/,
  'publicar_web.py precisa conservar a configuração do Storage');
assert.match(publisher,/gate\.template\.html/,
  'a publicação web deve continuar incorporando o gate que cria o provider');
assert.match(publisher,/hosting,firestore:rules,firestore:indexes,storage/,
  'a orientação de deploy deve incluir Hosting e as regras/índices colaborativos');

console.log('OK: Firebase declara Firestore/Storage, regras autenticadas e provider de colaboração no gate.');
