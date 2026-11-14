// Testa as regras de projectUpdates no emulador: só o dono lê; ninguém grava; o resto das regras continua negando.
const crypto = require('crypto');
const BASE = 'http://127.0.0.1:8085/v1/projects/demo-geomine/databases/(default)/documents';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (uid, email, verified = true) => b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({ sub: uid, user_id: uid, email, email_verified: verified, iss: 'https://securetoken.google.com/demo-geomine', aud: 'demo-geomine', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, auth_time: Math.floor(Date.now() / 1000), firebase: { identities: { email: [email] }, sign_in_provider: 'google.com' } }) + '.';
const id = crypto.createHash('sha256').update('dono@ccmeng.net\ngm_teste_regras').digest('hex');
const outro = crypto.createHash('sha256').update('dono@ccmeng.net\ngm_sem_atualizacao').digest('hex');
async function req(metodo, caminho, tok, corpo) { const r = await fetch(BASE + caminho, { method: metodo, headers: { ...(tok ? { Authorization: 'Bearer ' + tok } : {}), 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; }
(async () => {
  const dono = token('u1', 'Dono@ccmeng.net'), colega = token('u2', 'colega@ccmeng.net'), fora = token('u3', 'dono@gmail.com'), naoVerif = token('u1', 'dono@ccmeng.net', false);
  const head = await req('GET', '/projectUpdates/' + id, dono); const rev = head.body.fields?.revision?.stringValue;
  const casos = [
    ['dono lê a atualização', 200, await req('GET', '/projectUpdates/' + id, dono)],
    ['dono lê a parte', 200, await req('GET', '/projectUpdates/' + id + '/parts/' + rev + '_0', dono)],
    ['dono consulta projeto sem atualização (não existe)', 404, await req('GET', '/projectUpdates/' + outro, dono)],
    ['colega não lê a atualização de outro', 403, await req('GET', '/projectUpdates/' + id, colega)],
    ['colega não lê a parte', 403, await req('GET', '/projectUpdates/' + id + '/parts/' + rev + '_0', colega)],
    ['conta de fora (@gmail) não lê', 403, await req('GET', '/projectUpdates/' + id, fora)],
    ['e-mail não verificado não lê', 403, await req('GET', '/projectUpdates/' + id, naoVerif)],
    ['sem login não lê', 403, await req('GET', '/projectUpdates/' + id, null)],
    ['dono não lista as atualizações', 403, await req('GET', '/projectUpdates', dono)],
    ['dono não lista as partes', 403, await req('GET', '/projectUpdates/' + id + '/parts', dono)],
    ['dono não altera a atualização', 403, await req('PATCH', '/projectUpdates/' + id, dono, { fields: { emailLower: { stringValue: 'dono@ccmeng.net' }, note: { stringValue: 'x' } } })],
    ['dono não cria atualização', 403, await req('PATCH', '/projectUpdates/' + outro, dono, { fields: { emailLower: { stringValue: 'dono@ccmeng.net' } } })],
    ['colega não cria atualização para outro', 403, await req('PATCH', '/projectUpdates/' + outro, colega, { fields: { emailLower: { stringValue: 'dono@ccmeng.net' } } })],
    ['dono não grava parte', 403, await req('PATCH', '/projectUpdates/' + id + '/parts/x_0', dono, { fields: { n: { integerValue: '0' } } })],
    ['dono não apaga a atualização', 403, await req('DELETE', '/projectUpdates/' + id, dono)],
    ['regras antigas continuam: sala inexistente negada', 403, await req('GET', '/rooms/salaQualquer123', colega)],
  ];
  let falhas = 0; for (const [nome, esperado, r] of casos) { const ok = r.status === esperado; if (!ok) falhas++; console.log((ok ? 'ok     ' : 'FALHOU ') + nome + ' → HTTP ' + r.status + (ok ? '' : ' (esperado ' + esperado + ') ' + JSON.stringify(r.body).slice(0, 160))); }
  console.log(falhas ? falhas + ' FALHA(S)' : 'todos os ' + casos.length + ' casos passaram'); process.exit(falhas ? 1 : 0);
})();
